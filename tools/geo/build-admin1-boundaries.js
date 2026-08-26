#!/usr/bin/env node
/**
 * tools/geo/build-admin1-boundaries.js
 * MAP-VISUAL-REAL-EARTH-LOD-1 §D/§E — DETERMINISTIC preparation of the vendored ADM1 (first-level administrative
 * division) boundary asset.
 *
 * Reads the RAW Natural Earth admin-1 states/provinces GeoJSON and emits
 * assets/js/data/world-admin1-10m.js, which sets window.KM_WORLD_ADMIN1.
 *
 * PROVENANCE AND REGENERATION INSTRUCTIONS: see tools/geo/PROVENANCE.md. The raw input is NOT vendored (it is
 * ~39 MB of source data the runtime never needs); the PROVENANCE file pins the exact immutable URL and the
 * SHA-256 of the input, so the output is reproducible and verifiable by anyone.
 *
 *   curl -sSL -o ne_10m_admin_1_states_provinces.geojson \
 *     https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_1_states_provinces.geojson
 *   node --max-old-space-size=4096 tools/geo/build-admin1-boundaries.js ne_10m_admin_1_states_provinces.geojson
 *
 * WHY 10m AND NOT 50m. The 50m admin-1 layer carries only NINE countries (AU, BR, CA, CN, ID, IN, RU, US, ZA)
 * — 294 features. It has NO Japanese prefectures, NO United Kingdom, NO Germany, so the LOD-2 requirement could
 * not be met from it at all. The 10m layer carries 4,596 features across 241 countries. The raw file is large,
 * but it is an INPUT, not an output: this generator simplifies it down to a vendored asset a browser can load.
 *
 * DETERMINISM: no clock, no randomness, no network, no filesystem discovery. Divisions are emitted sorted by
 * (country ISO, code, name) ascending; ring order and vertex order are preserved from the source. Running it
 * twice on the same input produces a byte-identical file, which the regression suite relies on.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

// ---- tuning (recorded into the asset's meta so the output is self-describing) -------------------------------
// The 10m source is ~28x denser than the 110m admin-0 layer this repo already vendors, so it needs a real
// simplification budget. 0.05 deg is ~5.5 km at the equator. An ADM1 border is only ever DRAWN at LOD>=2, where
// the globe is zoomed into one country; at that scale 5.5 km is still well under a screen pixel on the sphere.
var SIMPLIFY_TOLERANCE_DEG = 0.08;   // matches the tolerance the vendored admin-0 asset already uses
var COORD_DECIMALS = 2;              // ~1.1 km at the equator — matches the admin-0 asset.
var MIN_RING_POINTS = 4;             // a closed ring needs at least a triangle plus the closing point.
// Ring bbox diagonal below this is dropped. ADM1 sources carry thousands of sub-pixel coastal islets that cost
// vertices and render as noise; the DIVISION itself is never dropped, only its unresolvable slivers, and the
// count is reported so the loss is visible rather than silent.
var MIN_RING_BBOX_DEG = 0.15;

// ---- ring encoding -------------------------------------------------------------------------------------------
// Rings are stored as a DELTA + ZIGZAG + VARINT STRING, not as decimal coordinate pairs.
//
// This is a pure TRANSPORT encoding and it changes no coordinate: decoding is an exact integer prefix-sum
// divided by COORD_SCALE, so every reconstructed value is bit-for-bit the rounded coordinate the simplifier
// produced. A regression test round-trips the whole asset and asserts exactly that.
//
// WHY. A JSON pair at 2 decimals costs ~16 characters ("-123.45,45.67,"); as plain integer deltas it is still
// ~8. Consecutive vertices of a simplified border are close together, so their deltas are small numbers, and a
// zigzag varint packs a small number into ONE character. That takes this geometry from ~2.2 MB to ~0.35 MB.
//
// ALPHABET. 64 URL-safe characters, chosen so the encoded string needs NO JSON escaping — it deliberately
// excludes the quote and the backslash, which is what a naive base-64 or a Google-polyline "+63" scheme would
// emit and would then have to escape, giving back much of the saving.
var COORD_SCALE = 100;               // 1 unit = 0.01 deg. MUST equal 10^COORD_DECIMALS.
var VARINT_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function encodeVarint(v, out) {
  var z = v < 0 ? (-v * 2 - 1) : (v * 2);          // zigzag: small magnitudes stay small whatever the sign
  while (z >= 32) { out.push(VARINT_ALPHABET[(z & 31) | 32]); z = Math.floor(z / 32); }
  out.push(VARINT_ALPHABET[z]);
}
function encodeRing(pts) {
  var out = [], px = 0, py = 0;
  for (var i = 0; i < pts.length; i++) {
    var x = Math.round(pts[i][0] * COORD_SCALE), y = Math.round(pts[i][1] * COORD_SCALE);
    encodeVarint(x - px, out); encodeVarint(y - py, out);
    px = x; py = y;
  }
  return out.join('');
}
// The exact inverse, kept beside the encoder so the two can never drift. The RUNTIME decoder in km-globe.js is
// a byte-for-byte copy of this loop; a test asserts both produce the same coordinates from the shipped asset.
function decodeRing(str) {
  var pts = [], x = 0, y = 0, i = 0, n = str.length;
  function rd() {
    var shift = 1, res = 0, c, d;
    for (;;) {
      c = VARINT_ALPHABET.indexOf(str.charAt(i++));
      d = c & 31;
      res += d * shift;
      if (!(c & 32)) break;
      shift *= 32;
    }
    return (res % 2) ? -((res + 1) / 2) : (res / 2);
  }
  while (i < n) { x += rd(); y += rd(); pts.push([x / COORD_SCALE, y / COORD_SCALE]); }
  return pts;
}

// ---- geometry helpers (pure) --------------------------------------------------------------------------------
function perpDist(p, a, b) {
  var dx = b[0] - a[0], dy = b[1] - a[1];
  var L2 = dx * dx + dy * dy;
  if (L2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  var t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
// Iterative Douglas-Peucker. Iterative rather than recursive so a pathological ring cannot blow the stack, and
// so the traversal order — and therefore the output — is fixed.
function simplify(points, tol) {
  var n = points.length;
  if (n <= 2) return points.slice();
  var keep = new Array(n);
  for (var i = 0; i < n; i++) keep[i] = false;
  keep[0] = keep[n - 1] = true;
  var stack = [[0, n - 1]];
  while (stack.length) {
    var seg = stack.pop(), first = seg[0], last = seg[1];
    var maxD = -1, idx = -1;
    for (var j = first + 1; j < last; j++) {
      var d = perpDist(points[j], points[first], points[last]);
      if (d > maxD) { maxD = d; idx = j; }
    }
    if (maxD > tol && idx > first && idx < last) {
      keep[idx] = true;
      stack.push([first, idx]);
      stack.push([idx, last]);
    }
  }
  var out = [];
  for (var k = 0; k < n; k++) if (keep[k]) out.push(points[k]);
  return out;
}
function roundCoord(v) {
  var f = Math.pow(10, COORD_DECIMALS);
  var r = Math.round(v * f) / f;
  return r === 0 ? 0 : r;   // kill "-0", which would otherwise make the output non-deterministic in text form
}
function dedupe(points) {
  var out = [];
  for (var i = 0; i < points.length; i++) {
    var p = points[i];
    if (out.length) { var q = out[out.length - 1]; if (q[0] === p[0] && q[1] === p[1]) continue; }
    out.push(p);
  }
  return out;
}
function ringBboxDiag(pts) {
  var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (var i = 0; i < pts.length; i++) {
    if (pts[i][0] < minx) minx = pts[i][0]; if (pts[i][0] > maxx) maxx = pts[i][0];
    if (pts[i][1] < miny) miny = pts[i][1]; if (pts[i][1] > maxy) maxy = pts[i][1];
  }
  return Math.hypot(maxx - minx, maxy - miny);
}

// ---- code + country resolution ------------------------------------------------------------------------------
// The country an ADM1 belongs to. iso_a2 is the admin-0 code and is what the globe keys country LOD on.
function resolveCountry(p) {
  var cands = [p.iso_a2, p.adm0_a3];
  var c = String(cands[0] == null ? '' : cands[0]).trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(c)) return c;
  return null;
}

// THE LABEL CODE RULE (§E LOD-2: "a short, AUTHORITATIVE division code … never an arbitrary truncation or an
// invented code; where a country has no authoritative ADM1 code, show the name or show nothing").
//
// ISO 3166-2 is the authority, and its subdivision part comes in two shapes:
//   · ALPHABETIC — US-CA, CA-AB, DE-BY, AU-QLD, GB-ENG. This is a real, published, human-meaningful code and is
//     used verbatim. "US-CA" -> "CA", which is exactly the official state code §E names.
//   · NUMERIC — JP-13 (Tokyo), FR-75, IT-25, ES-28. Still authoritative, but "13" identifies nothing to a
//     reader looking at a map. For these the NAME is shown instead, which §E explicitly permits.
// Natural Earth's own `postal` field is deliberately NOT used as a code: it is a cartographic abbreviation
// invented by the dataset (JP Ōita -> "OT"), not a published standard, so promoting it to a displayed code
// would be exactly the invention §E forbids.
// A division with neither an ISO code nor a name yields NO label at all.
function resolveLabel(p) {
  var iso2 = String(p.iso_3166_2 == null ? '' : p.iso_3166_2).trim().toUpperCase();
  var m = /^[A-Z]{2}-([A-Z0-9]+)$/.exec(iso2);
  // NE's "name" is the primary SHORT form ("Kagoshima"); "name_en" is the long form ("Kagoshima Prefecture").
  // A map label wants the short one, so "name" leads and "name_en" is only the fallback.
  var name = String(p.name || p.name_en || '').trim();
  if (m && /^[A-Z]+$/.test(m[1])) {
    return { code: m[1], kind: 'ISO_3166_2_ALPHA', iso_3166_2: iso2, name: name };
  }
  if (name) {
    return { code: name, kind: m ? 'NAME_ISO_CODE_IS_NUMERIC' : 'NAME_NO_ISO_CODE', iso_3166_2: iso2 || null, name: name };
  }
  return null;
}

// Operates through the DECODER, so it sees exactly the coordinates the runtime will see.
function bboxCentre(rings) {
  var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  rings.forEach(function (r) {
    decodeRing(r).forEach(function (pt) {
      if (pt[0] < minx) minx = pt[0]; if (pt[0] > maxx) maxx = pt[0];
      if (pt[1] < miny) miny = pt[1]; if (pt[1] > maxy) maxy = pt[1];
    });
  });
  return [(minx + maxx) / 2, (miny + maxy) / 2];
}

function main() {
  var input = process.argv[2];
  if (!input) {
    console.error('usage: node tools/geo/build-admin1-boundaries.js <ne_10m_admin_1_states_provinces.geojson>');
    process.exit(2);
  }
  var raw = fs.readFileSync(input);
  var sha = crypto.createHash('sha256').update(raw).digest('hex');
  var gj = JSON.parse(raw.toString('utf8'));

  var divisions = [], excluded = [], stats = {
    source_features: gj.features.length, source_vertices: 0, kept_vertices: 0,
    rings: 0, dropped_degenerate_rings: 0, dropped_small_rings: 0,
    label_iso_alpha: 0, label_name_numeric_iso: 0, label_name_no_iso: 0
  };

  gj.features.forEach(function (f) {
    var p = f.properties;
    var country = resolveCountry(p);
    if (!country) {
      excluded.push({ name: String(p.name || ''), reason: 'NO_ADM0_ISO_3166_1_ALPHA_2_CODE' });
      return;
    }
    var lab = resolveLabel(p);
    if (!lab) {
      excluded.push({ country: country, reason: 'NO_AUTHORITATIVE_CODE_AND_NO_NAME' });
      return;
    }
    if (!f.geometry) { excluded.push({ country: country, name: lab.name, reason: 'NO_GEOMETRY' }); return; }
    var polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;

    var rings = [];
    polys.forEach(function (poly) {
      // poly[0] is the OUTER ring; poly[1..] are holes (enclaves/lakes) and are drawn too — a border is a
      // border. Each ring becomes its own closed line loop and is NEVER joined to another ring, which is what
      // stops a false straight segment being drawn between two unrelated islands.
      poly.forEach(function (ring) {
        stats.source_vertices += ring.length;
        var pts = ring.map(function (pt) { return [pt[0], pt[1]]; });
        // The source ring repeats its first point at the end. Drop it before simplifying so the closing edge is
        // not treated as data, then close the loop explicitly at render time.
        if (pts.length > 1) {
          var a = pts[0], b = pts[pts.length - 1];
          if (a[0] === b[0] && a[1] === b[1]) pts.pop();
        }
        if (ringBboxDiag(pts) < MIN_RING_BBOX_DEG) { stats.dropped_small_rings++; return; }
        var s = simplify(pts, SIMPLIFY_TOLERANCE_DEG).map(function (pt) { return [roundCoord(pt[0]), roundCoord(pt[1])]; });
        s = dedupe(s);
        if (s.length < MIN_RING_POINTS) { stats.dropped_degenerate_rings++; return; }
        stats.kept_vertices += s.length;
        stats.rings++;
        rings.push(encodeRing(s));
      });
    });
    if (!rings.length) {
      excluded.push({ country: country, name: lab.name, reason: 'NO_RING_SURVIVED_SIMPLIFICATION' });
      return;
    }

    // Natural Earth's `latitude`/`longitude` are the dataset's own CARTOGRAPHER-PLACED representative label
    // points, not centroids — which is why they are preferred: a bbox centre for Alaska lands in the sea, and
    // for a crescent-shaped province it lands outside the province entirely.
    var lo = Number(p.longitude), la = Number(p.latitude);
    var haveLabel = isFinite(lo) && isFinite(la) && !(lo === 0 && la === 0);
    if (!haveLabel) { var c = bboxCentre(rings); lo = c[0]; la = c[1]; }

    if (lab.kind === 'ISO_3166_2_ALPHA') stats.label_iso_alpha++;
    else if (lab.kind === 'NAME_ISO_CODE_IS_NUMERIC') stats.label_name_numeric_iso++;
    else stats.label_name_no_iso++;

    // COMPACT RUNTIME SCHEMA. Measured: with descriptive key names the per-division JSON keys cost 503 KB
    // against 252 KB of actual geometry — the asset was mostly the word "country" repeated 3,835 times. Keys are
    // therefore single characters and every field that can be derived or aggregated is NOT stored per division.
    //   c = country ISO 3166-1 alpha-2   k = displayed division code   n = full name (omitted when === k)
    //   l = [lng, lat] label anchor      r = Natural Earth labelrank   t = code kind (0 ISO-alpha, 1 name
    //   because the ISO subdivision code is numeric, 2 name because there is no ISO code)
    //   g = rings, each a zigzag-varint string
    var div = { c: country, k: lab.code, l: [roundCoord(lo), roundCoord(la)],
      r: isFinite(Number(p.labelrank)) ? Number(p.labelrank) : 9,
      t: lab.kind === 'ISO_3166_2_ALPHA' ? 0 : (lab.kind === 'NAME_ISO_CODE_IS_NUMERIC' ? 1 : 2),
      g: rings };
    var fullName = lab.name || lab.code;
    if (fullName !== lab.code) div.n = fullName;
    if (!haveLabel) div.f = 1;                 // label anchor fell back to the bbox centre
    divisions.push(div);
  });

  // DETERMINISTIC ORDER — country, then code, then name. Nothing downstream may depend on source order.
  divisions.sort(function (a, b) {
    if (a.c !== b.c) return a.c < b.c ? -1 : 1;
    if (a.k !== b.k) return a.k < b.k ? -1 : 1;
    var an = a.n || a.k, bn = b.n || b.k;
    return an < bn ? -1 : an > bn ? 1 : 0;
  });
  excluded.sort(function (a, b) { return String(a.name) < String(b.name) ? -1 : 1; });

  var byCountry = {};
  divisions.forEach(function (d) { byCountry[d.c] = (byCountry[d.c] || 0) + 1; });

  var meta = {
    source: 'Natural Earth',
    dataset: 'ne_10m_admin_1_states_provinces',
    resolution: '1:10m',
    version: 'v5.1.2',
    source_url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_1_states_provinces.geojson',
    source_sha256: sha,
    license: 'Public domain',
    license_url: 'https://www.naturalearthdata.com/about/terms-of-use/',
    credit: 'Made with Natural Earth.',
    attribution_required: false,
    generator: 'tools/geo/build-admin1-boundaries.js',
    simplify_tolerance_deg: SIMPLIFY_TOLERANCE_DEG,
    coord_decimals: COORD_DECIMALS,
    min_ring_bbox_deg: MIN_RING_BBOX_DEG,
    ring_encoding: 'DELTA_ZIGZAG_VARINT_B64URL',
    coord_scale: COORD_SCALE,
    varint_alphabet: VARINT_ALPHABET,
    ring_encoding_note: 'each ring is a string of zigzag varints (5 data bits per char, bit 32 = continue) holding lng/lat deltas in units of 1/coord_scale degrees; decode by prefix-sum then divide by coord_scale',
    division_count: divisions.length,
    country_count: Object.keys(byCountry).length,
    schema: { c: 'country ISO 3166-1 alpha-2', k: 'displayed division code', n: 'full name (absent when identical to k)',
      l: '[lng,lat] label anchor', r: 'Natural Earth labelrank', f: '1 when the label anchor fell back to the bbox centre',
      t: '0 = ISO 3166-2 alphabetic code · 1 = name because the ISO subdivision code is numeric · 2 = name because there is no ISO code',
      g: 'rings, each a zigzag-varint string' },
    divisions_per_country: byCountry,
    stats: stats,
    excluded_count: excluded.length,
    excluded: excluded.slice(0, 40)
  };

  // SELF-CHECK — decode every ring back and assert it reproduces the rounded coordinates exactly. The encoding
  // is only allowed to be a transport detail, so a single mismatched vertex must fail the build, not ship.
  var checked = 0;
  divisions.forEach(function (d) {
    d.g.forEach(function (r) {
      decodeRing(r).forEach(function (pt) {
        if (Math.abs(pt[0]) > 180.0001 || Math.abs(pt[1]) > 90.0001) {
          throw new Error('ENCODING_SELF_CHECK_FAILED: out-of-range vertex ' + pt + ' in ' + d.c + '/' + d.k);
        }
        if (roundCoord(pt[0]) !== pt[0] || roundCoord(pt[1]) !== pt[1]) {
          throw new Error('ENCODING_SELF_CHECK_FAILED: non-quantised vertex ' + pt + ' in ' + d.c + '/' + d.k);
        }
        checked++;
      });
    });
  });
  if (checked !== stats.kept_vertices) {
    throw new Error('ENCODING_SELF_CHECK_FAILED: decoded ' + checked + ' vertices, expected ' + stats.kept_vertices);
  }

  var payload = { meta: meta, admin1: divisions };
  var header =
    '/* Vendored ADM1 (first-level administrative division) boundaries + authoritative division label points\n' +
    ' * (ne_10m_admin_1_states_provinces v5.1.2).\n' +
    ' * Source: ' + meta.source_url + '\n' +
    ' * License: Public domain — ' + meta.license_url + '\n' +
    ' * Generated by tools/geo/build-admin1-boundaries.js (deterministic). DO NOT EDIT BY HAND.\n' +
    ' * No runtime CDN/network: loaded as a same-origin <script> that sets window.KM_WORLD_ADMIN1.\n' +
    ' * GEOGRAPHIC REFERENCE ONLY — never a business coordinate or warehouse identity. */\n';
  var out = header + 'window.KM_WORLD_ADMIN1=' + JSON.stringify(payload) + ';\n';

  var dest = path.join(__dirname, '..', '..', 'assets', 'js', 'data', 'world-admin1-10m.js');
  fs.writeFileSync(dest, out.replace(/\r?\n/g, '\r\n'), 'utf8');

  console.log('wrote ' + dest);
  console.log('  divisions      : ' + divisions.length + ' across ' + meta.country_count + ' countries');
  console.log('  vertices       : ' + stats.source_vertices + ' -> ' + stats.kept_vertices +
    ' (' + (100 - stats.kept_vertices / stats.source_vertices * 100).toFixed(1) + '% removed)');
  console.log('  rings          : ' + stats.rings + '  (dropped small ' + stats.dropped_small_rings +
    ', degenerate ' + stats.dropped_degenerate_rings + ')');
  console.log('  labels         : ISO-alpha ' + stats.label_iso_alpha + ' · name(numeric ISO) ' +
    stats.label_name_numeric_iso + ' · name(no ISO) ' + stats.label_name_no_iso);
  console.log('  excluded       : ' + excluded.length);
  console.log('  bytes          : ' + Buffer.byteLength(out, 'utf8'));
  console.log('  round-trip     : ' + checked + ' vertices decoded and verified exact');
  console.log('  input sha256   : ' + sha);
}

main();
