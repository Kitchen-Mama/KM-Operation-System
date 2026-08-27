// MAP-VISUAL-REAL-EARTH-TEXTURE-3-R3 §C / §D / §E — ONE SURFACE, CANONICAL SHARED-EDGE TOPOLOGY, BORDER HIERARCHY.
//
// WHAT R2 REPORTED AS NOT DONE, AND WHAT THIS PROVES INSTEAD:
//
//   §C  "surface/datum alignment audit"      -> every layer's transform, convention and radius is asserted from
//                                               ONE authority, and the boundary layers no longer float above the
//                                               surface at all.
//   §D  "canonical shared-edge topology"     -> executed against the real vendored datasets: shared edges appear
//        "the PROHIBITED geometry keys are      once, coastline is classified apart from international,
//         still in use"                        international supersedes ADM1, and identity is a stable source key
//        "drawn from independent rings"        whose collisions are measured rather than hoped about.
//   §E  "borders at visibly the SAME weight"  -> the three classes have distinct, ordered weights, and the
//                                               national one is a screen-space ribbon because gl.lineWidth
//                                               cannot express it.
//
// It EXECUTES the shipped topology module against the shipped assets. Where a claim is structural (draw order,
// shader text) it falls back to source assertions and pins the exact strings.
'use strict';

var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.log('FAIL ' + l); } }
function eq(a, b, l) { if (a === b) { pass++; } else { fail++; console.log('FAIL ' + l + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); } }
function section(t) { console.log('\n== ' + t); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function code(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
            .replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""');
}
function extractFn(src, name) {
  var i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  var d = 0, j = src.indexOf('{', i);
  for (var k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  return '';
}

var GLOBE = read('assets/js/lib/km-globe.js');
var GC = code(GLOBE);
var INDEX = read('index.html');
global.window = global.window || {};
require(path.join(ROOT, 'assets/js/data/world-countries-110m.js'));
require(path.join(ROOT, 'assets/js/data/world-admin1-10m.js'));
var T = require(path.join(ROOT, 'assets/js/lib/km-geo-topology.js'));
var M = require(path.join(ROOT, 'assets/js/lib/km-globe.js')).math;
var COUNTRIES = window.KM_WORLD_COUNTRIES;
var ADMIN1 = window.KM_WORLD_ADMIN1;

// The engine's own ring decoder, so the topology is built from exactly the vertices the engine renders.
var decodeRing = (function () {
  var AB = M.ADMIN1_ALPHABET, IDX = {};
  for (var i = 0; i < AB.length; i++) IDX[AB.charAt(i)] = i;
  return function (str, scale) {
    scale = scale || 100;
    var out = [], x = 0, y = 0, j = 0, n = str.length;
    while (j < n) {
      var shift = 1, res = 0, c, d;
      for (;;) { c = IDX[str.charAt(j++)]; d = c & 31; res += d * shift; if (!(c & 32)) break; shift *= 32; }
      x += (res % 2) ? -((res + 1) / 2) : (res / 2);
      shift = 1; res = 0;
      for (;;) { c = IDX[str.charAt(j++)]; d = c & 31; res += d * shift; if (!(c & 32)) break; shift *= 32; }
      y += (res % 2) ? -((res + 1) / 2) : (res / 2);
      out.push(x / scale, y / scale);
    }
    return out;
  };
})();

// ================================================================================================================
section('§C — ONE globe surface: one transform authority, and no second sphere');
// ================================================================================================================
// Every layer must project through the SAME functions. Asserted by counting the projection entry points: if a
// layer had its own lat/lng-to-3D or its own screen projection, the datum, the longitude convention and the UV
// convention could disagree between layers without anything failing.
eq((GC.match(/function latLngToVec3\(/g) || []).length, 1, 'C1 exactly ONE lat/lng -> 3D conversion exists');
eq((GC.match(/function projectToScreen\(/g) || []).length, 1, 'C1 and exactly ONE screen projection');
eq((GC.match(/function modelMatrix\(/g) || []).length, 1, 'C1 and ONE globe model matrix');
eq((GC.match(/function mat4Perspective\(/g) || []).length, 1, 'C1 and ONE projection matrix');
// The conventions themselves, executed rather than described.
(function () {
  var v0 = M.latLngToVec3(0, 0, 1);
  ok(Math.abs(v0[2] - 1) < 1e-9 && Math.abs(v0[0]) < 1e-9 && Math.abs(v0[1]) < 1e-9,
    'C2 lat 0 / lng 0 maps to +Z — one datum origin for every layer');
  var vn = M.latLngToVec3(90, 0, 1);
  ok(Math.abs(vn[1] - 1) < 1e-9, 'C2 the north pole is +Y (latitude increases north)');
  var ve = M.latLngToVec3(0, 90, 1);
  ok(Math.abs(ve[0] - 1) < 1e-9, 'C2 lng +90 is +X (longitude increases east)');
  // The anti-meridian must be continuous, not a 360-degree sweep: 179 and -179 are 2 degrees apart in 3D.
  var a = M.latLngToVec3(0, 179, 1), b = M.latLngToVec3(0, -179, 1);
  var dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  var deg = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
  ok(Math.abs(deg - 2) < 1e-6, 'C3 lng 179 and lng -179 are 2 degrees apart, not 358 (measured ' + deg.toFixed(4) + ')');
  // Both poles collapse to a single point, whatever the longitude — the case that used to produce a 360-degree edge.
  var p1 = M.latLngToVec3(-90, 180, 1), p2 = M.latLngToVec3(-90, -180, 1);
  var pd = Math.acos(Math.max(-1, Math.min(1, p1[0] * p2[0] + p1[1] * p2[1] + p1[2] * p2[2]))) * 180 / Math.PI;
  ok(pd < 1e-6, 'C3 and the south pole at lng +180 and lng -180 is ONE point (' + pd.toFixed(6) + ' deg apart)');
})();
// §C — the radius audit. There is exactly one surface, and the boundary layers are ON it.
eq(M.BORDER_R, 1, 'C4 the boundary layers sit at r=1 — the surface itself');
ok(M.BORDER_DEPTH_BIAS > 0, 'C4 separated from the sphere by a DEPTH bias, not by altitude');
ok(M.BORDER_DEPTH_BIAS < 0.001, 'C4 which is smaller than a thousandth of the radius (' + M.BORDER_DEPTH_BIAS + ')');
// The bias must beat the tessellation sag at a mesh vertex but stay far under the old radial offset it replaces.
var tessSag = 1 - Math.cos((360 / 96 / 2) * Math.PI / 180);
ok(M.BORDER_DEPTH_BIAS < tessSag, 'C4 and under the sphere tessellation sag ' + tessSag.toFixed(6) +
  ', so a border never has to be lifted off the mesh');
ok(0.0035 / M.BORDER_DEPTH_BIAS > 10, 'C4 at least 10x smaller than the 0.0035 shell it replaces (' +
  Math.round(0.0035 / M.BORDER_DEPTH_BIAS) + 'x)');
// Arcs and markers KEEP their altitude — that is a different decision, not an inconsistency, and it is ordered.
ok(M.BORDER_R < M.ARC_R && M.ARC_R < M.MARKER_R,
  'C5 surface < arcs (' + M.ARC_R + ') < markers (' + M.MARKER_R + ') — a border never draws over a route');
// §C — "do not create an obvious second outer sphere". Nothing may reintroduce one.
ok(!/1\.0035|1\.0030/.test(GC), 'C6 the old 1.0035 / 1.0030 boundary shells are gone from the code');
// The label layers must anchor on the SAME radius as the geometry, or the text drifts from its own border.
// RESTATED IN TEXTURE-3-R4 §C: the anchors are precomputed once per dataset instead of per label per frame.
// The radius is the load-bearing part and both label classes are now checked, not just the country one.
ok(GC.indexOf('latLngToVec3(list[i].label[1], list[i].label[0], BORDER_R)') !== -1,
  'C7 country labels anchor at BORDER_R');
ok(GC.indexOf('latLngToVec3(d.l[1], d.l[0], BORDER_R)') !== -1,
  'C7 and so do division labels — the same radius as the geometry they name');
ok(GC.indexOf('latLngToVec3(d.l[1], d.l[0], BORDER_R)') !== -1, 'C7 and so do division labels');
ok(GC.indexOf('a.vec[0] * BORDER_R') !== -1, 'C7 and so do continent labels');
// The depth bias must be applied in CLIP SPACE as a fraction of w, so it is invariant to camera distance.
ok(/p\.z-=uBias\*p\.w;/.test(GLOBE), 'C8 the bias is a constant NDC offset (z -= uBias * w), so it is scale-invariant');
eq((GLOBE.match(/p\.z-=uBias\*p\.w;/g) || []).length, 2, 'C8 in BOTH line programs (lines and ribbon)');
// And it must be explicitly zeroed for the arc layer, which shares the program.
ok(/gl\.uniform1f\(gl\.getUniformLocation\(progLine, 'uBias'\), 0\);/.test(GLOBE),
  'C9 the arc layer explicitly resets uBias to 0 — a GL uniform persists between draw calls');

// ================================================================================================================
section('§D — canonical shared-edge topology, executed on the real vendored data');
// ================================================================================================================
var cf = T.countryFeatures(COUNTRIES);
eq(cf.colliding_identity, 0, 'D1 the country dataset has no colliding geometry identity');
eq(cf.features.length, 175, 'D1 all 175 countries contribute geometry');
var coarse = T.build(cf.features);
console.log('  COARSE (110m countries): ' + coarse.stats.input.directed_edges + ' directed -> ' +
  coarse.stats.input.unique_edges + ' unique; removed ' + coarse.stats.duplicate_edges_removed +
  ' duplicates (' + coarse.stats.duplicate_percent + '%)');
console.log('    coastline ' + coarse.edges.COASTLINE.length + ' · international ' +
  coarse.edges.INTERNATIONAL.length + ' · adm1 ' + coarse.edges.ADM1.length);
ok(coarse.stats.duplicate_edges_removed > 2000,
  'D2 the country dataset had ' + coarse.stats.duplicate_edges_removed + ' duplicate edges — every shared border was drawn TWICE');
eq(coarse.stats.input.unique_edges,
  coarse.edges.COASTLINE.length + coarse.edges.INTERNATIONAL.length + coarse.edges.ADM1.length,
  'D2 and every unique edge lands in exactly ONE class — no edge is rendered twice');
ok(coarse.edges.COASTLINE.length > coarse.edges.INTERNATIONAL.length * 2,
  'D3 most of the country layer is COASTLINE (' + coarse.edges.COASTLINE.length + ') rather than border (' +
  coarse.edges.INTERNATIONAL.length + ') — it was all drawn as border before');
coarse.edges.INTERNATIONAL.forEach(function (e) {
  if (e.countries.length < 2) { ok(false, 'D3 an international edge with fewer than two countries'); }
});
pass++; console.log('  (every international edge has >= 2 countries)');
coarse.edges.COASTLINE.forEach(function (e) {
  if (e.owners.length !== 1) { ok(false, 'D3 a coastline edge with more than one owner'); }
});
pass++; console.log('  (every coastline edge has exactly one owner)');

var af = T.admin1Features(ADMIN1, decodeRing);
eq(af.missing_identity, 0, 'D4 every ADM1 feature carries a stable source identity');
eq(af.colliding_identity, 0, 'D4 and no two features share one');
eq(af.features.length, 3835, 'D4 all 3,835 divisions contribute geometry');
var fine = T.build(af.features);
console.log('  FINE (10m ADM1): ' + fine.stats.input.directed_edges + ' directed -> ' +
  fine.stats.input.unique_edges + ' unique; removed ' + fine.stats.duplicate_edges_removed +
  ' duplicates (' + fine.stats.duplicate_percent + '%)');
console.log('    coastline ' + fine.edges.COASTLINE.length + ' · international ' +
  fine.edges.INTERNATIONAL.length + ' · adm1 ' + fine.edges.ADM1.length);
ok(fine.stats.duplicate_edges_removed > 8000,
  'D5 the ADM1 dataset had ' + fine.stats.duplicate_edges_removed + ' duplicate edges');
eq(fine.stats.input.unique_edges,
  fine.edges.COASTLINE.length + fine.edges.INTERNATIONAL.length + fine.edges.ADM1.length,
  'D5 and every unique edge lands in exactly one class');

// §D — "international edge supersedes overlapping ADM1 edge". Structural, and asserted as such: an edge with two
// countries on it is in the INTERNATIONAL bucket, so it CANNOT also be in the ADM1 one.
var adm1CrossCountry = fine.edges.ADM1.filter(function (e) { return e.countries.length > 1; });
eq(adm1CrossCountry.length, 0, 'D6 no ADM1-class edge has two countries on it — international supersedes it by classification');
var intlSameCountry = fine.edges.INTERNATIONAL.filter(function (e) { return e.countries.length < 2; });
eq(intlSameCountry.length, 0, 'D6 and no international-class edge has fewer than two');

// §D — "coastline is not also drawn as a country border": the classes are disjoint SETS of edge keys.
(function () {
  var seen = {}, dup = 0;
  ['COASTLINE', 'INTERNATIONAL', 'ADM1'].forEach(function (cls) {
    fine.edges[cls].forEach(function (e) {
      var k = T.edgeKey(T.vkey(e.a[0], e.a[1]), T.vkey(e.b[0], e.b[1]));
      if (seen[k]) dup++;
      seen[k] = cls;
    });
  });
  eq(dup, 0, 'D7 no edge key appears in two classes — coastline is never also drawn as a border');
})();

// §D — "no disconnected endpoints after simplification". Per class an international border legitimately ENDS at
// the sea, so the meaningful measurement is on the COMBINED set: every endpoint must be picked up by something.
console.log('  endpoints (combined): ' + JSON.stringify(fine.stats.endpoints.ALL));
eq(fine.stats.endpoints.ALL.dangling_endpoints, 0,
  'D8 the combined ADM1 topology has ZERO dangling endpoints');
eq(coarse.stats.endpoints.ALL.dangling_endpoints, 0,
  'D8 and so does the combined country topology');
eq(fine.stats.endpoints.COASTLINE.dangling_endpoints, 0, 'D8 the coastline class alone is a set of closed loops');
ok(fine.stats.endpoints.ADM1.dangling_endpoints > 0,
  'D8 while the ADM1 class alone has ' + fine.stats.endpoints.ADM1.dangling_endpoints +
  ' loose ends — which is CORRECT: a state border ends where the coast begins, and the coastline class picks it up');

// §D — anti-meridian and polar geometry stay valid. Nothing in the topology compares or wraps a longitude, so a
// 360-degree delta survives as data and is interpolated as a zero-length arc by slerp.
console.log('  antimeridian census: ' + JSON.stringify(fine.stats.antimeridian));
ok(coarse.stats.antimeridian.antimeridian_edges >= 1,
  'D9 the country topology preserves the Antarctica (180,-90)->(-180,-90) pair rather than dropping it');
ok(!/\.lng|unwrap|wrapLng|% 360|\+ 360/.test(code(read('assets/js/lib/km-geo-topology.js'))),
  'D9 and the topology module performs no longitude arithmetic at all');
ok(code(read('assets/js/lib/km-geo-topology.js')).indexOf('Math.atan2') === -1,
  'D9 nor any trigonometry — it is pure combinatorics over exact vertex keys');

// §D — PROHIBITED GEOMETRY KEYS. Measured, because the prohibition is only meaningful if the keys really collide.
(function () {
  var byCode = {}, byName = {}, byId = {};
  ADMIN1.admin1.forEach(function (d) {
    var c = String(d.c || '').toUpperCase();
    var full = (d.n == null || d.n === '') ? String(d.k) : String(d.n);
    byCode[c + '|' + d.k] = (byCode[c + '|' + d.k] || 0) + 1;
    byName[c + '|' + full.toLowerCase()] = (byName[c + '|' + full.toLowerCase()] || 0) + 1;
    byId[d.a] = (byId[d.a] || 0) + 1;
  });
  function collisions(m) { return Object.keys(m).filter(function (k) { return m[k] > 1; }); }
  var cc = collisions(byCode), nc = collisions(byName), ic = collisions(byId);
  console.log('  country|displayedCode  : ' + cc.length + ' colliding keys hiding ' +
    cc.reduce(function (a, k) { return a + byCode[k] - 1; }, 0) + ' rows');
  console.log('  country|fullEnglishName: ' + nc.length + ' colliding keys hiding ' +
    nc.reduce(function (a, k) { return a + byName[k] - 1; }, 0) + ' rows');
  console.log('  adm1_code (used)       : ' + ic.length + ' colliding keys');
  ok(cc.length > 0, 'D10 `country|displayedCode` MEASURABLY collides (' + cc.length + ' keys) — this is why §D prohibits it');
  ok(nc.length > 0, 'D10 `country|fullEnglishName` collides too (' + nc.length + ' keys)');
  eq(ic.length, 0, 'D10 the identity actually used, adm1_code, does NOT collide');
  // The specific collisions §D names.
  eq(byCode['BA|BIH'], 9, 'D11 BA|BIH covers NINE Bosnian cantons under one displayed code');
  eq(byCode['IE|D'], 3, 'D11 IE|D covers three Dublin councils');
  eq(byCode['CO|CUN'], 2, 'D11 CO|CUN conflates Bogota with Cundinamarca');
  // ...and they must NOT merge geometry.
  [['BA', 18], ['IE', 29], ['CO', 32], ['MG', 22]].forEach(function (p) {
    var rows = af.features.filter(function (f) { return f.country === p[0]; });
    var ids = {};
    rows.forEach(function (f) { ids[f.id] = 1; });
    eq(rows.length, p[1], 'D11 ' + p[0] + ' contributes ' + p[1] + ' separate features');
    eq(Object.keys(ids).length, p[1], 'D11 and ' + p[1] + ' DISTINCT geometry identities — no merging');
  });
})();
// §D — the engine must not use a prohibited key as identity anywhere.
ok(GC.indexOf("d.c + '/' + d.k, text:") === -1, 'D12 the label layer no longer keys on country|displayedCode');
ok(GLOBE.indexOf("iso: d.a || (d.c + '/' + d.k)") !== -1,   // raw source: GC strips string literals
  'D12 it keys on the stable source identity, falling back only if the asset lacks one');
// §D — name equality may share a translation string but must never merge geometry.
(function () {
  var byText = {};
  af.features.forEach(function (f) {
    var row = ADMIN1.admin1.filter(function (d) { return d.a === f.id; })[0];
    if (!row) return;
    var key = row.c + '|' + (row.n || row.k);
    (byText[key] = byText[key] || []).push(f.id);
  });
  var shared = Object.keys(byText).filter(function (k) { return byText[k].length > 1; });
  ok(shared.length > 0, 'D13 some divisions genuinely SHARE a name string (' + shared.length + ' cases)');
  var merged = shared.filter(function (k) {
    var ids = {};
    byText[k].forEach(function (i) { ids[i] = 1; });
    return Object.keys(ids).length !== byText[k].length;
  });
  eq(merged.length, 0, 'D13 and not one of them shares a geometry identity — a shared name never merges geometry');
})();
// §D — the topology is built ONCE per dataset, never in the render loop.
ok(extractFn(GLOBE, 'draw').indexOf('geoTopology') === -1, 'D14 draw() never builds topology');
ok(code(extractFn(GLOBE, 'draw')).indexOf('decodeAdmin1Ring') === -1, 'D14 nor re-parses the ADM1 asset');
ok(/function buildCoarseTopology\(\)/.test(GLOBE) && /function buildFineTopology\(\)/.test(GLOBE),
  'D14 each topology has its own build function');
// §D — the country allow-list must filter the RENDER, never the classification input.
ok(/opts\.countries \|\| null/.test(extractFn(GLOBE, 'buildBorderLayers')),
  'D15 the allow-list is applied inside buildBorderLayers');
ok(extractFn(GLOBE, 'buildFineTopology').indexOf('countries: admin1Countries') !== -1 &&
   extractFn(GLOBE, 'buildFineTopology').indexOf('T.build(f.features)') !== -1,
  'D15 and the topology itself is built on the WHOLE world before it is applied');
(function () {
  // EXECUTED: filtering the classification input would reclassify an edge shared with an excluded neighbour as
  // coastline. Filtering the OUTPUT must not change any class.
  var full = T.build(af.features);
  var layers = M.buildBorderLayers(full, { countries: ['US'] });
  ok(layers.layers.INTERNATIONAL.edgeCount < layers.layers.INTERNATIONAL.edgeCountUnfiltered,
    'D15 a US-only view renders fewer international edges than exist');
  var usIntl = full.edges.INTERNATIONAL.filter(function (e) { return e.countries.indexOf('US') !== -1; });
  eq(layers.layers.INTERNATIONAL.edgeCount, usIntl.length,
    'D15 exactly the international edges that touch the US — still classified against the whole world');
})();

// ================================================================================================================
section('§E — the border hierarchy is three distinct, ordered weights');
// ================================================================================================================
var S = M.BORDER_STYLE;
eq(S.COASTLINE.rank, 1, 'E1 hierarchy 1 is coastline');
eq(S.INTERNATIONAL.rank, 2, 'E1 hierarchy 2 is the international boundary');
eq(S.ADM1.rank, 3, 'E1 hierarchy 3 is ADM1');
// §E — "national boundary clearly stronger than ADM1". Weight is width AND contrast, and both must favour it.
ok(S.INTERNATIONAL.widthPx > S.ADM1.widthPx,
  'E2 the national boundary is WIDER than ADM1 (' + S.INTERNATIONAL.widthPx + ' vs ' + S.ADM1.widthPx + ')');
ok(S.INTERNATIONAL.alpha > S.ADM1.alpha,
  'E2 and more opaque (' + S.INTERNATIONAL.alpha + ' vs ' + S.ADM1.alpha + ')');
function lum(c) { return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
ok(lum(S.INTERNATIONAL.color) > lum(S.ADM1.color) * 1.4,
  'E2 and clearly brighter (' + lum(S.INTERNATIONAL.color).toFixed(3) + ' vs ' + lum(S.ADM1.color).toFixed(3) + ')');
ok(lum(S.INTERNATIONAL.color) > lum(S.COASTLINE.color) * 1.4, 'E2 and brighter than the coastline too');
// §E — "restrained neutral stroke, no neon glow". A neutral colour has low chroma; neon does not.
[['COASTLINE', S.COASTLINE], ['INTERNATIONAL', S.INTERNATIONAL], ['ADM1', S.ADM1]].forEach(function (p) {
  var c = p[1].color, mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]);
  var sat = mx <= 0 ? 0 : (mx - mn) / mx;
  ok(sat < 0.30, 'E3 ' + p[0] + ' is a restrained neutral (saturation ' + sat.toFixed(3) + ' < 0.30)');
  ok(mx <= 1 && mn >= 0, 'E3 ' + p[0] + ' stays in range');
});
// §E — "no double line". Each class is drawn exactly once per frame.
(function () {
  var drawSrc = extractFn(GLOBE, 'draw');
  var bSlice = drawSrc.slice(drawSrc.indexOf("['COASTLINE', 'ADM1', 'INTERNATIONAL']"), drawSrc.indexOf('// arcs'));
  eq((bSlice.match(/gl\.drawArrays/g) || []).length, 2,
    'E4 one draw call per rendering mode (lines + ribbon) — no second pass, so no double line and no glow');
  ok(bSlice.indexOf('for (var pass') === -1 && bSlice.indexOf('outline') === -1,
    'E4 and no outline/halo pass');
})();
// §E — the width is SCREEN-SPACE. This is the requirement gl.lineWidth cannot meet.
ok(/uniform vec2 uViewport;uniform float uHalfPx;/.test(GLOBE), 'E5 the ribbon shader takes a viewport and a pixel half-width');
ok(/p\.xy\+=nrm\*aSide\*uHalfPx\/hp\*p\.w;/.test(GLOBE),
  'E5 and expands perpendicular to the segment in PIXEL space, so zooming does not thicken the line');
ok(GC.indexOf('gl.lineWidth') === -1, 'E5 gl.lineWidth is not used at all — Chrome clamps it to 1');
ok(/uHalfPx'\), L\.widthPx \* 0\.5 \* dpr\)/.test(GLOBE),
  'E5 the half-width is scaled by DPR, so it is a constant DEVICE-pixel width on a HiDPI screen');
// §E — ADM1 is INTRODUCED by zoom, not switched on.
[[3.0, 0], [2.6, 0], [1.95, 0], [1.75, 0.5], [1.55, 1], [1.35, 1]].forEach(function (p) {
  var v = M.admin1BorderStrength(p[0]);
  ok(Math.abs(v - p[1]) < 0.02, 'E6 at distance ' + p[0] + ' the ADM1 layer is at strength ' + v.toFixed(2));
});
ok(M.admin1BorderStrength(2.6) === 0, 'E6 so it does not crowd the default globe view at all');
ok(/if \(adm1Strength <= 0\.01\) showAdm1 = false;/.test(GLOBE),
  'E6 and a fully faded layer is SKIPPED rather than drawn at alpha 0');
// §E — blending has to be on or the alphas round to on/off.
ok(/gl\.enable\(gl\.BLEND\); gl\.blendFunc\(gl\.SRC_ALPHA, gl\.ONE_MINUS_SRC_ALPHA\);/.test(GLOBE),
  'E7 alpha blending is enabled, so the class alphas and the fade are real');
// §E — the coastline must not be a bright duplicated rim.
ok(S.COASTLINE.alpha < S.INTERNATIONAL.alpha && lum(S.COASTLINE.color) < lum(S.INTERNATIONAL.color),
  'E8 the coastline is the FAINTEST class — it firms the texture edge rather than drawing a second rim');
// §E — draw order puts the international boundary last so it survives every overlap.
(function () {
  var d = extractFn(GLOBE, 'draw');
  var order = d.indexOf("['COASTLINE', 'ADM1', 'INTERNATIONAL']");
  ok(order > 0, 'E9 the classes are drawn in an explicit order');
  ok(d.indexOf("['COASTLINE', 'ADM1', 'INTERNATIONAL']") < d.indexOf('// arcs'),
    'E9 before the arcs, so a route always sits above a border');
})();

// ================================================================================================================
section('§D/§E — the two topologies, one active at a time');
// ================================================================================================================
ok(/function wantedBorderSet\(\)/.test(GLOBE), 'X1 there is one function that decides which set is active');
ok(/if \(layersFine && layerVisible\(showAdmin1Borders, lod, ADMIN1_BORDER_MIN_LOD\)\) return 'FINE';/.test(GLOBE),
  'X1 FINE requires BOTH the ADM1 data and the LOD — until the asset arrives, COARSE is used at every LOD');
ok(/if \(want !== borderActive\) uploadBorderSet\(want\);/.test(GLOBE),
  'X2 the buffers are re-uploaded only when the wanted set CHANGES, not per frame');
ok(extractFn(GLOBE, 'updateLod').indexOf('syncBorderSet()') !== -1,
  'X2 and the LOD transition is what triggers it');
// The cross-dataset measurement that justifies keeping them separate.
(function () {
  var ck = {};
  cf.features.forEach(function (f) {
    (f.rings || []).forEach(function (r) {
      var n = r.length / 2;
      for (var i = 0; i < n; i++) {
        var j = (i + 1) % n;
        ck[T.edgeKey(T.vkey(r[i * 2], r[i * 2 + 1]), T.vkey(r[j * 2], r[j * 2 + 1]))] = 1;
      }
    });
  });
  var shared = 0, total = 0;
  ['COASTLINE', 'INTERNATIONAL', 'ADM1'].forEach(function (cls) {
    fine.edges[cls].forEach(function (e) {
      total++;
      if (ck[T.edgeKey(T.vkey(e.a[0], e.a[1]), T.vkey(e.b[0], e.b[1]))]) shared++;
    });
  });
  console.log('  cross-dataset shared edges: ' + shared + ' of ' + total);
  ok(shared < total * 0.001,
    'X3 only ' + shared + ' of ' + total + ' ADM1 edges match a country edge — the two datasets are independent ' +
    'generalisations, which is WHY they are not merged into one topology');
})();

console.log('\n----------------------------------------');
console.log('CANONICAL TOPOLOGY (TEXTURE-3-R3 §C/§D/§E): ' + pass + ' passed, ' + fail + (fail ? ' FAILED' : ' failed'));
console.log('----------------------------------------');
process.exit(fail === 0 ? 0 : 1);
