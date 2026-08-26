#!/usr/bin/env node
/**
 * tools/geo/build-country-boundaries.js
 * F1-7N-MAP-COUNTRY-BOUNDARY-1 §D — DETERMINISTIC preparation of the vendored country-boundary asset.
 *
 * Reads the RAW Natural Earth admin-0 countries GeoJSON and emits
 * assets/js/data/world-countries-110m.js, which sets window.KM_WORLD_COUNTRIES.
 *
 * PROVENANCE AND REGENERATION INSTRUCTIONS: see tools/geo/PROVENANCE.md. The raw input is NOT vendored (it is
 * ~820 KB of source data the runtime never needs); the PROVENANCE file pins the exact immutable URL and the
 * SHA-256 of the input, so the output is reproducible and verifiable by anyone.
 *
 *   curl -sSL -o ne_110m_admin_0_countries.geojson \
 *     https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_110m_admin_0_countries.geojson
 *   node tools/geo/build-country-boundaries.js ne_110m_admin_0_countries.geojson
 *
 * DETERMINISM: no clock, no randomness, no network, no filesystem discovery. Countries are emitted sorted by
 * ISO alpha-2 ascending; ring order and vertex order are preserved from the source. Running it twice on the
 * same input produces a byte-identical file, which the regression suite relies on.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

// ---- tuning (recorded into the asset's meta so the output is self-describing) -------------------------------
var SIMPLIFY_TOLERANCE_DEG = 0.08;   // Douglas-Peucker, in degrees. NE 110m is already generalized; this only
                                     // removes collinear-ish noise. Borders stay recognisable at globe scale.
var COORD_DECIMALS = 2;              // ~1.1 km at the equator — far below one screen pixel on a 2048px globe.
var MIN_RING_POINTS = 4;             // a closed ring needs at least a triangle plus the closing point.

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
// Drop consecutive duplicates AFTER rounding. Rounding can collapse neighbours; a zero-length segment would
// emit a degenerate GL line.
function dedupe(points) {
  var out = [];
  for (var i = 0; i < points.length; i++) {
    var p = points[i];
    if (out.length) { var q = out[out.length - 1]; if (q[0] === p[0] && q[1] === p[1]) continue; }
    out.push(p);
  }
  return out;
}

// ---- ISO alpha-2 resolution ---------------------------------------------------------------------------------
// ISO_A2_EH is Natural Earth's "as encoded by the ISO standard where NE differs" field and is the correct first
// choice (it fixes France and Norway, which carry -99 in plain ISO_A2). WB_A2 is the World Bank code, used only
// as a last resort. A feature with no valid two-letter code is EXCLUDED and recorded — never invented. In NE
// 5.1.2 that is exactly two disputed territories with no assigned ISO 3166-1 code.
function resolveIso(p) {
  var candidates = [p.ISO_A2_EH, p.ISO_A2, p.WB_A2];
  for (var i = 0; i < candidates.length; i++) {
    var c = String(candidates[i] == null ? '' : candidates[i]).trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(c)) return c;
  }
  return null;
}

function bboxCentre(rings) {
  var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  rings.forEach(function (r) {
    for (var i = 0; i < r.length; i += 2) {
      if (r[i] < minx) minx = r[i]; if (r[i] > maxx) maxx = r[i];
      if (r[i + 1] < miny) miny = r[i + 1]; if (r[i + 1] > maxy) maxy = r[i + 1];
    }
  });
  return [(minx + maxx) / 2, (miny + maxy) / 2, maxx - minx];
}

function main() {
  var input = process.argv[2];
  if (!input) {
    console.error('usage: node tools/geo/build-country-boundaries.js <ne_110m_admin_0_countries.geojson>');
    process.exit(2);
  }
  var raw = fs.readFileSync(input);
  var sha = crypto.createHash('sha256').update(raw).digest('hex');
  var gj = JSON.parse(raw.toString('utf8'));

  var countries = [], excluded = [], stats = {
    source_features: gj.features.length, source_vertices: 0, kept_vertices: 0,
    multipolygon_countries: 0, rings: 0, dropped_degenerate_rings: 0
  };

  gj.features.forEach(function (f) {
    var p = f.properties;
    var iso = resolveIso(p);
    if (!iso) {
      excluded.push({ name: String(p.NAME || ''), reason: 'NO_ISO_3166_1_ALPHA_2_CODE',
        iso_a2: String(p.ISO_A2), iso_a2_eh: String(p.ISO_A2_EH), wb_a2: String(p.WB_A2) });
      return;
    }
    var polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    if (f.geometry.type === 'MultiPolygon') stats.multipolygon_countries++;

    var rings = [];
    polys.forEach(function (poly) {
      // poly[0] is the OUTER ring; poly[1..] are holes. Holes are enclaves/lakes and are drawn too — a border
      // is a border. Each ring becomes its own closed line loop and is NEVER joined to another ring, which is
      // what stops a false straight segment being drawn between two unrelated islands.
      poly.forEach(function (ring) {
        stats.source_vertices += ring.length;
        var pts = ring.map(function (pt) { return [pt[0], pt[1]]; });
        // The source ring repeats its first point at the end. Drop it before simplifying so the closing edge is
        // not treated as data, then close the loop explicitly at render time.
        if (pts.length > 1) {
          var a = pts[0], b = pts[pts.length - 1];
          if (a[0] === b[0] && a[1] === b[1]) pts.pop();
        }
        var s = simplify(pts, SIMPLIFY_TOLERANCE_DEG).map(function (pt) { return [roundCoord(pt[0]), roundCoord(pt[1])]; });
        s = dedupe(s);
        if (s.length < MIN_RING_POINTS) { stats.dropped_degenerate_rings++; return; }
        var flat = [];
        for (var i = 0; i < s.length; i++) { flat.push(s[i][0], s[i][1]); }
        stats.kept_vertices += s.length;
        stats.rings++;
        rings.push(flat);
      });
    });
    if (!rings.length) {
      excluded.push({ name: String(p.NAME || ''), iso: iso, reason: 'NO_RING_SURVIVED_SIMPLIFICATION' });
      return;
    }

    // LABEL_X / LABEL_Y are Natural Earth's CARTOGRAPHER-PLACED representative label points. They are NOT
    // centroids, and that is exactly why they are used: a bbox/centroid label for Fiji lands in the Atlantic
    // (it straddles the antimeridian), for Russia on the prime meridian, and for France in the ocean (overseas
    // territories). The asset records how far each label sits from its bbox centre so that claim is evidence.
    var lx = Number(p.LABEL_X), ly = Number(p.LABEL_Y);
    var haveLabel = isFinite(lx) && isFinite(ly);
    var c = bboxCentre(rings);
    if (!haveLabel) { lx = c[0]; ly = c[1]; }
    var labelOffset = Math.max(Math.abs(lx - c[0]), Math.abs(ly - c[1]));

    countries.push({
      iso: iso,
      name: String(p.NAME || p.NAME_LONG || iso),
      label: [roundCoord(lx), roundCoord(ly)],
      label_source: haveLabel ? 'NE_LABEL_XY' : 'BBOX_CENTRE_FALLBACK',
      label_offset_deg: Math.round(labelOffset * 100) / 100,
      rank: Number(p.LABELRANK) || 7,
      min_label: isFinite(Number(p.MIN_LABEL)) ? Number(p.MIN_LABEL) : null,
      lng_span_deg: Math.round(c[2] * 10) / 10,
      rings: rings
    });
  });

  // DETERMINISTIC ORDER — by ISO ascending. Nothing downstream may depend on source order.
  countries.sort(function (a, b) { return a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0; });
  excluded.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });

  var meta = {
    source: 'Natural Earth',
    dataset: 'ne_110m_admin_0_countries',
    resolution: '1:110m',
    version: 'v5.1.2',
    source_url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_110m_admin_0_countries.geojson',
    source_sha256: sha,
    license: 'Public domain',
    license_url: 'https://www.naturalearthdata.com/about/terms-of-use/',
    license_note: 'Natural Earth states: "All versions of Natural Earth raster + vector map data found on this website are in the public domain." No permission or attribution is required; the credit below is voluntary.',
    credit: 'Made with Natural Earth.',
    generated_by: 'tools/geo/build-country-boundaries.js',
    simplify_tolerance_deg: SIMPLIFY_TOLERANCE_DEG,
    coord_decimals: COORD_DECIMALS,
    country_count: countries.length,
    excluded_count: excluded.length,
    excluded: excluded,
    stats: stats,
    runtime_network_dependency: false,
    purpose: 'GEOGRAPHIC REFERENCE ONLY. These boundaries and labels are never a business coordinate, a warehouse identity, a route node or a shipment location.'
  };

  var out = '/* Vendored country boundaries + ISO alpha-2 label points (' + meta.dataset + ' ' + meta.version + ').\n'
    + ' * Source: ' + meta.source_url + '\n'
    + ' * License: ' + meta.license + ' — ' + meta.license_url + '\n'
    + ' * Generated by ' + meta.generated_by + ' (deterministic). DO NOT EDIT BY HAND.\n'
    + ' * No runtime CDN/network: loaded as a same-origin <script> that sets window.KM_WORLD_COUNTRIES.\n'
    + ' * GEOGRAPHIC REFERENCE ONLY — never a business coordinate or warehouse identity. */\n'
    + 'window.KM_WORLD_COUNTRIES=' + JSON.stringify({ meta: meta, countries: countries }) + ';\n';

  var target = path.join(__dirname, '..', '..', 'assets', 'js', 'data', 'world-countries-110m.js');
  fs.writeFileSync(target, out.replace(/\r?\n/g, '\r\n'), 'utf8');

  console.log('wrote ' + target);
  console.log('  countries: ' + countries.length + '  excluded: ' + excluded.length);
  excluded.forEach(function (e) { console.log('    EXCLUDED ' + e.name + ' — ' + e.reason); });
  console.log('  rings: ' + stats.rings + '  vertices: ' + stats.source_vertices + ' -> ' + stats.kept_vertices);
  console.log('  multipolygon countries: ' + stats.multipolygon_countries + '  dropped degenerate rings: ' + stats.dropped_degenerate_rings);
  console.log('  bytes: ' + fs.statSync(target).size);
  console.log('  input sha256: ' + sha);
}

main();
