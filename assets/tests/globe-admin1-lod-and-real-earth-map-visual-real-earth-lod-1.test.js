// MAP-VISUAL-REAL-EARTH-LOD-1 — ADM1 geometry, adaptive LOD, division labels, capability fallback.
//
// The repo has no pixel-comparison harness, so §J's acceptance is met the way §J itself allows: deterministic
// render-info assertions, LOD threshold + hysteresis tests, antimeridian tests, label-collision tests, capability
// fallback tests, no-network tests, and an unchanged-shipment-coordinate test.
//
// Behavioural claims EXECUTE the SHIPPED functions (KMGlobe.math) against the SHIPPED asset. Structural claims
// assert against comment-stripped source so prose cannot satisfy them.
//
// Known regression baseline (pre-existing, unrelated): gap-job-done-notice-f1-small-r1,
// order-planning-monthly-projection-consumer-f1-4b-fm3d, replen-header-toggle, supply-planning-route-inventory.
//
// Run: node --max-old-space-size=4096 assets/tests/globe-admin1-lod-and-real-earth-map-visual-real-earth-lod-1.test.js

var fs = require('fs');
var path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(t) { console.log('\n== ' + t + ' =='); }

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }

function extractFnEarly(src, name) {
  var start = src.indexOf('function ' + name + '('); if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
var GLOBE = read('assets/js/lib/km-globe.js');
var MAP = read('assets/js/pages/global-logistics-map.js');
var GEN = read('tools/geo/build-admin1-boundaries.js');
var PROV = read('tools/geo/PROVENANCE.md');
var INDEX = read('index.html');
var M = require(path.join(ROOT, 'assets/js/lib/km-globe.js')).math;

// Load the SHIPPED asset exactly as a browser would.
var ASSET_SRC = read('assets/js/data/world-admin1-10m.js');
var W = {};
(function () { var window = W; eval(ASSET_SRC.replace(/^\/\*[\s\S]*?\*\//, '')); })();
var D = W.KM_WORLD_ADMIN1;

// ================================================================================================================
section('§A/§D — asset provenance, licence, and no runtime network');
// ================================================================================================================
ok(!!D && !!D.meta && !!D.admin1, 'A1 the ADM1 asset loads and defines window.KM_WORLD_ADMIN1');
eq(D.meta.source, 'Natural Earth', 'A2 source is recorded in the asset itself');
eq(D.meta.dataset, 'ne_10m_admin_1_states_provinces', 'A3 dataset is recorded');
eq(D.meta.license, 'Public domain', 'A4 licence is recorded');
eq(D.meta.attribution_required, false, 'A5 attribution requirement is recorded (not required)');
ok(/^[0-9a-f]{64}$/.test(D.meta.source_sha256), 'A6 the exact input SHA-256 is pinned, so the build is verifiable');
ok(D.meta.source_url.indexOf('v5.1.2') !== -1, 'A7 the source URL is pinned to an IMMUTABLE tag, not a moving branch');
ok(PROV.indexOf('ne_10m_admin_1_states_provinces') !== -1 && PROV.indexOf('Public domain') !== -1,
  'A8 PROVENANCE.md records the ADM1 source and licence');
ok(PROV.indexOf('22d0e3ad85eb3e27f17cabf8ba2d50e554fbc27a87796ff891d958185da62fb5') !== -1,
  'A9 PROVENANCE.md pins the input checksum');
// §D.5 / §H.5 — the geographic layer must be decoupled from any network or business API.
var GC = code(GLOBE), MC = code(MAP);
ok(GC.indexOf('fetch(') === -1 && GC.indexOf('XMLHttpRequest') === -1 && GC.indexOf('WebSocket') === -1,
  'A10 the globe performs NO network access of any kind');
// The asset's only URLs are the pinned provenance source and the licence page (each appearing in both the
// header comment and meta). It must contain no loader of any kind.
var assetUrls = (ASSET_SRC.match(/https?:\/\/[^"\s]*/g) || []);
ok(assetUrls.every(function (u) { return u.indexOf('naturalearthdata.com') !== -1 || u.indexOf('raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/') !== -1; }),
  'A11 the asset carries ONLY its pinned provenance + licence URLs (' + assetUrls.length + ' occurrences)');
ok(!/fetch\(|XMLHttpRequest|importScripts|document\.createElement/.test(ASSET_SRC),
  'A11b the asset contains no loader — it is inert data that assigns one global');
ok(INDEX.indexOf('world-admin1-10m.js') === -1,
  'A12 the 0.54 MB ADM1 asset is NOT eagerly loaded by index.html (§H.4 — never in the initial workspace path)');
ok(MC.indexOf("'assets/js/data/world-admin1-10m.js'") !== -1 && MC.indexOf('ensureAdmin1Asset') !== -1,
  'A13 it is lazy-loaded, same-origin, by the map page when the zoom first calls for it');

// ================================================================================================================
section('§E — LOD thresholds and hysteresis (no flicker at a boundary)');
// ================================================================================================================
eq(M.LOD_THRESHOLDS, [2.60, 1.95, 1.62], 'E1 the three LOD boundaries are the frozen distances');
ok(M.LOD_HYSTERESIS > 0, 'E2 a hysteresis margin exists');
// monotonic: closer camera never yields a lower LOD
var prevLod = 0, mono = true;
for (var d = 5.0; d >= 1.35; d -= 0.01) { var l = M.lodForDistance(d, 0); if (l < prevLod) mono = false; prevLod = l; }
ok(mono, 'E3 LOD is monotonic in distance — zooming in never reduces the level');
eq([M.lodForDistance(5.0, 0), M.lodForDistance(2.0, 0), M.lodForDistance(1.8, 0), M.lodForDistance(1.4, 0)], [0, 1, 2, 3],
  'E4 the four levels are reachable across the camera range');
// THE FLICKER TEST. Walk the camera through every boundary in both directions one hundredth at a time and count
// transitions. Without hysteresis a value resting on a boundary toggles; with it, each boundary is crossed once.
function sweep(from, to, step) {
  var lodNow = M.lodForDistance(from, 0), flips = 0;
  for (var x = from; (step > 0 ? x <= to : x >= to); x += step) {
    var n = M.lodForDistance(x, lodNow);
    if (n !== lodNow) { flips++; lodNow = n; }
  }
  return flips;
}
eq(sweep(5.0, 1.35, -0.01), 3, 'E5 zooming all the way IN crosses each of the 3 boundaries exactly once');
eq(sweep(1.35, 5.0, 0.01), 3, 'E6 zooming all the way OUT crosses each of the 3 boundaries exactly once');
// dwell exactly ON a boundary and jitter by less than the margin — the level must not move at all
var boundary = M.LOD_THRESHOLDS[0], jitterFlips = 0, cur = M.lodForDistance(boundary + 0.001, 0);
for (var k = 0; k < 400; k++) {
  var probe = boundary + ((k % 2) ? 0.001 : -0.001);
  var nl = M.lodForDistance(probe, cur);
  if (nl !== cur) { jitterFlips++; cur = nl; }
}
ok(jitterFlips <= 1, 'E7 jittering across a boundary by less than the margin does NOT flicker the level (' + jitterFlips + ' change)');
// the dead band really is two-sided
ok(M.lodForDistance(2.55, 0) === 0 && M.lodForDistance(2.55, 1) === 1,
  'E8 the same distance resolves differently depending on the level being left — that IS the hysteresis');

// ================================================================================================================
section('§E/§G — layer modes and the label budget');
// ================================================================================================================
eq(M.ADMIN1_BORDER_MIN_LOD, 2, 'E9 ADM1 borders are admitted from LOD 2');
eq(M.ADMIN1_LABEL_MIN_LOD, 2, 'E10 ADM1 labels are admitted from LOD 2');
eq([M.layerVisible('auto', 0, 2), M.layerVisible('auto', 1, 2), M.layerVisible('auto', 2, 2), M.layerVisible('auto', 3, 2)],
  [false, false, true, true], 'E11 AUTO turns the layer on by zoom and off again when zoomed out');
eq([M.layerVisible('on', 0, 2), M.layerVisible('off', 3, 2)], [true, false],
  'E12 ON and OFF override the zoom in both directions');
eq([M.admin1LabelBudget(0), M.admin1LabelBudget(1), M.admin1LabelBudget(2), M.admin1LabelBudget(3)], [0, 0, 22, 42],
  'E13 the label budget is zero below LOD 2 and grows with the level — no label explosion');
ok(M.admin1LabelBudget(3) < D.admin1.length,
  'E14 the budget is far below the ' + D.admin1.length + ' available divisions, so a crowded view can never render them all');

// ================================================================================================================
section('§E — authoritative division codes, never invented');
// ================================================================================================================
function of(c) { return D.admin1.filter(function (x) { return x.c === c; }); }
eq(of('US').length, 51, 'E15 the United States has all 51 first-level divisions (50 states + DC)');
var usCodes = of('US').map(function (x) { return x.k; });
['CA', 'TX', 'NY', 'FL', 'AK', 'HI'].forEach(function (c) {
  ok(usCodes.indexOf(c) !== -1, 'E16 US uses the OFFICIAL state code: ' + c);
});
ok(of('US').every(function (x) { return x.t === 0; }), 'E17 every US code came from ISO 3166-2, not from a guess');
eq(of('CA').length, 13, 'E18 Canada has 13 provinces/territories');
ok(of('CA').map(function (x) { return x.k; }).indexOf('BC') !== -1, 'E19 Canada uses official codes (BC)');
eq(of('JP').length, 47, 'E20 Japan has all 47 prefectures');
// JP's ISO subdivision codes are NUMERIC (JP-13), so the rule says show the NAME — never the invented postal code.
ok(of('JP').every(function (x) { return x.t === 1; }), 'E21 Japan falls to the NAME rule because its ISO codes are numeric');
ok(of('JP').every(function (x) { return /^[A-Za-zÀ-ɏ一-鿿\s'-]+$/.test(x.k) && !/^\d+$/.test(x.k); }),
  'E22 no Japanese label is a bare number — "13" would identify nothing to a reader');
ok(of('JP').map(function (x) { return x.k; }).indexOf('Tokyo') !== -1, 'E23 Japan shows readable prefecture names (Tokyo)');
ok(of('AU').length >= 8 && of('DE').length >= 16, 'E24 Australia and Germany are covered');
ok(D.admin1.every(function (x) { return x.k && String(x.k).length > 0; }), 'E25 no division carries an empty label');
// the invented-code prohibition, structurally
ok(code(GEN).indexOf('p.postal') === -1,
  'E26 the generator NEVER reads Natural Earth\'s invented `postal` abbreviation as a displayed code');
ok(code(GEN).indexOf('iso_3166_2') !== -1, 'E27 the code authority is ISO 3166-2');
eq(D.meta.stats.label_iso_alpha + D.meta.stats.label_name_numeric_iso + D.meta.stats.label_name_no_iso, D.admin1.length,
  'E28 every division is accounted for by exactly one of the three label rules');

// ================================================================================================================
section('§F — real vector geometry on the sphere, antimeridian-safe');
// ================================================================================================================
// The decoder is the exact inverse of the generator's encoder.
eq(M.ADMIN1_ALPHABET, D.meta.varint_alphabet, 'F1 the runtime decoder alphabet IS the generator alphabet');
eq(D.meta.coord_scale, 100, 'F2 the coordinate scale is recorded in the asset');
var verts = 0, outOfRange = 0, minLng = 999, maxLng = -999, minLat = 999, maxLat = -999;
D.admin1.forEach(function (dv) {
  dv.g.forEach(function (r) {
    var flat = M.decodeAdmin1Ring(r, D.meta.coord_scale);
    for (var i = 0; i < flat.length; i += 2) {
      verts++;
      var x = flat[i], y = flat[i + 1];
      if (!isFinite(x) || !isFinite(y) || Math.abs(x) > 180.001 || Math.abs(y) > 90.001) outOfRange++;
      if (x < minLng) minLng = x; if (x > maxLng) maxLng = x;
      if (y < minLat) minLat = y; if (y > maxLat) maxLat = y;
    }
  });
});
eq(outOfRange, 0, 'F3 every one of the ' + verts + ' decoded vertices is a valid lng/lat');
eq(verts, D.meta.stats.kept_vertices, 'F4 the decoder recovers EXACTLY the vertex count the generator recorded');
ok(minLng >= -180 && maxLng <= 180 && minLat >= -90 && maxLat <= 90, 'F5 decoded coordinates stay inside the graticule');
// quantisation is exact — the encoding lost nothing
var nonQuant = 0;
D.admin1.slice(0, 400).forEach(function (dv) {
  dv.g.forEach(function (r) {
    M.decodeAdmin1Ring(r, D.meta.coord_scale).forEach(function (v, i) {
      if (Math.abs(Math.round(v * 100) - v * 100) > 1e-6) nonQuant++;
    });
  });
});
eq(nonQuant, 0, 'F6 decoding is lossless — every value is exactly the generator\'s quantised coordinate');

// Build the real GPU vertex array with the shipped builder.
var info = M.buildAdmin1Segments(D);
ok(info.vertexCount > 0 && info.segmentCount > 0, 'F7 the shipped builder produces real line geometry (' + info.segmentCount + ' segments)');
eq(info.divisionCount, D.admin1.length, 'F8 every division contributes geometry');
// RESTATED IN TEXTURE-3-R3 §C/§D. 'ADM1 sits below the country layer' was a RADIUS trick: ADMIN1_R 1.0030
// under COUNTRY_R 1.0035, so where a state border ran along a national border the depth test picked the
// national one. §C removed both shells (they floated 22 km above the ground at Earth scale) and §D removed
// the need for the trick entirely: an edge with two countries on it is classified INTERNATIONAL and is
// therefore NOT IN the ADM1 bucket at all. There is nothing left to win a depth test against, which is a
// strictly stronger guarantee than winning one.
eq(info.radius, M.BORDER_R, 'F9 the ADM1 layer is on the surface (r=1), not on a shell of its own');
eq(M.BORDER_STYLE.ADM1.rank, 3, 'F9 and is rank 3 in the hierarchy, below coastline and international');
ok(M.BORDER_STYLE.INTERNATIONAL.rank < M.BORDER_STYLE.ADM1.rank,
  'F9 with the international class ranked above it');
(function () {
  // EXECUTED, not asserted from source: a boundary shared by two divisions of DIFFERENT countries must
  // classify as INTERNATIONAL and must not appear in the ADM1 bucket.
  var T = require(path.join(ROOT, 'assets/js/lib/km-geo-topology.js'));
  var square = [0, 0, 1, 0, 1, 1, 0, 1];
  var right = [1, 0, 2, 0, 2, 1, 1, 1];
  var sameCountry = T.build([{ id: 'A', country: 'XX', rings: [square] }, { id: 'B', country: 'XX', rings: [right] }]);
  var crossCountry = T.build([{ id: 'A', country: 'XX', rings: [square] }, { id: 'B', country: 'YY', rings: [right] }]);
  eq(sameCountry.edges.ADM1.length, 1, 'F9 two divisions of ONE country share exactly one ADM1 edge');
  eq(sameCountry.edges.INTERNATIONAL.length, 0, 'F9 and none of it is international');
  eq(crossCountry.edges.INTERNATIONAL.length, 1, 'F9 the same shared edge across TWO countries is international');
  eq(crossCountry.edges.ADM1.length, 0, 'F9 and is NOT also in the ADM1 bucket — international supersedes it');
})();
// ANTIMERIDIAN: no emitted segment may span the globe. A chord longer than the subdivision limit means longitude
// arithmetic leaked in somewhere and a line was drawn straight across the Pacific.
var pos = info.positions, worst = 0, longSegs = 0;
var limitChord = 2 * Math.sin((M.ADMIN1_MAX_SEG_DEG * 1.02) * Math.PI / 180 / 2) * info.radius;
for (var v = 0; v + 13 < pos.length; v += 14) {
  var dx = pos[v + 7] - pos[v], dy = pos[v + 8] - pos[v + 1], dz = pos[v + 9] - pos[v + 2];
  var len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len > worst) worst = len;
  if (len > limitChord) longSegs++;
}
eq(longSegs, 0, 'F10 NO emitted segment exceeds the subdivision limit — a line across the Pacific is impossible');
ok(worst < 0.05, 'F11 the longest emitted chord is ' + worst.toFixed(4) + ' — far below a globe-spanning line');
// the specific hard cases §F names
[['US', 'AK', 'Alaska'], ['US', 'HI', 'Hawaii'], ['JP', 'Tokyo', 'Japan islands'],
 ['NZ', null, 'New Zealand'], ['ID', null, 'Indonesia'], ['GB', null, 'United Kingdom']].forEach(function (t) {
  var got = of(t[0]).filter(function (x) { return t[1] === null || x.k === t[1]; });
  ok(got.length > 0 && got.some(function (x) { return x.g.length > 0; }), 'F12 covered with geometry: ' + t[2]);
});
// a multi-ring division's islands are never joined
var ak = of('US').filter(function (x) { return x.k === 'AK'; })[0];
ok(ak && ak.g.length > 1, 'F13 Alaska is multi-ring (islands are separate rings, never concatenated)');
ok(code(GLOBE).indexOf('ringsToSegments') !== -1 && (code(GLOBE).match(/function ringsToSegments/g) || []).length === 1,
  'F14 country and ADM1 share ONE rasteriser, so the antimeridian guarantee cannot be reimplemented and re-broken');
// chord sag must not sink a border into the sphere
var sag = 1 - Math.cos((M.ADMIN1_MAX_SEG_DEG / 2) * Math.PI / 180);
// RESTATED IN TEXTURE-3-R3 §C: the ADM1 layer no longer sits on a shell above the surface, so there is no
// radial offset to sink through. The chord sag must instead stay under the DEPTH BIAS that separates the
// boundary from the sphere - the same bound the country layer's suite now uses.
ok(sag < M.BORDER_DEPTH_BIAS, 'F15 worst chord sag ' + sag.toFixed(6) + ' stays under the ' +
  M.BORDER_DEPTH_BIAS + ' depth bias, so a subdivided border never sinks into the globe');

// ================================================================================================================
section('§G — label collision: markers and country codes always win');
// ================================================================================================================
var blockers = [{ x0: 90, x1: 130, y0: 90, y1: 130 }];
var cands = [
  { iso: 'X/A', text: 'A', x: 110, y: 110, w: 20, h: 9, rank: 1, priority: 4 },
  { iso: 'X/B', text: 'B', x: 400, y: 300, w: 20, h: 9, rank: 1, priority: 4 }
];
var sel = M.selectVisibleLabels(cands, { pad: 2, stickyPad: 1, previous: {}, markerRects: blockers });
eq(sel.map(function (c) { return c.text; }), ['B'], 'G1 a division code overlapping a blocked rect is HIDDEN, never moved');
// two colliding labels: the deterministic order decides, and it never depends on array order
var pair = [
  { iso: 'X/LOW', text: 'LOW', x: 200, y: 200, w: 40, h: 9, rank: 7, priority: 4 },
  { iso: 'X/HIGH', text: 'HIGH', x: 210, y: 202, w: 40, h: 9, rank: 2, priority: 4 }
];
var a1 = M.selectVisibleLabels(pair, { previous: {} }).map(function (c) { return c.text; });
var a2 = M.selectVisibleLabels(pair.slice().reverse(), { previous: {} }).map(function (c) { return c.text; });
eq(a1, ['HIGH'], 'G2 the higher-ranked division wins a collision');
eq(a1, a2, 'G3 the winner does NOT depend on array order — the collision result is deterministic');
// structural: ADM1 text is laid out after, and blocked by, the country codes
// RESTATED IN TEXTURE-3-R3 §G: the continent layer was added, so the ADM1 blocker list gained a third
// member. §G's priority order is shipment, country, continent, ADM1 - so ADM1 is blocked by all three.
// RESTATED IN TEXTURE-3-R4 §C/§D. The precedence used to be implicit in the ORDER of three calls and in what
// each was handed as blockers. It is now an explicit staged plan, so the assertion can EXECUTE it instead of
// pattern-matching the call site: a division label placed on top of a country label must lose, and an
// operational rectangle must beat both.
(function () {
  var country = [{ iso: 'JP', text: '日本', x: 200, y: 200, w: 40, h: 12, rank: 2, priority: 4, cls: 'COUNTRY' }];
  var adm1 = [{ iso: 'JPN-1860', text: '東京都', x: 204, y: 202, w: 40, h: 9, rank: 2, priority: 6, cls: 'ADM1' }];
  var cont = [{ iso: 'CONT:Asia', text: '亞洲', x: 202, y: 201, w: 40, h: 17, rank: 1, priority: 5, cls: 'CONTINENT' }];
  var p = M.planLabelSet({ operational: [], country: country, continent: cont, adm1: adm1 }, {});
  eq(p.counts.country, 1, 'G4 the country label is placed');
  eq(p.counts.continent, 0, 'G4 the continent label loses to the country label it overlaps');
  eq(p.counts.adm1, 0, 'G4 and the division label is blocked by both');
  var op = [{ x0: 190, x1: 215, y0: 190, y1: 215 }];
  var q = M.planLabelSet({ operational: op, country: country, continent: cont, adm1: adm1 }, {});
  eq(q.counts.country + q.counts.continent + q.counts.adm1, 0,
    'G4 a shipment marker rectangle beats every geographic class');
})();
eq(M.LABEL_CLASS_ORDER.join('>'), 'OPERATIONAL>COUNTRY>CONTINENT>ADM1',
  'G4 and the precedence is declared in one place');
// RESTATED IN TEXTURE-3-R3 §G. 'country - 2 px' was true but far too weak to satisfy §G's requirement that
// the hierarchy be VISIBLE: at an 11 px country label it produced a 9 px division label, an 18% difference
// that R2's captures showed reading as one class of text at two sizes. The sizes now come from one ladder.
var SZ = M.labelSizes(2.0);
ok(SZ.admin1 < SZ.country, 'G5 a division label is strictly SMALLER than a country label (' + SZ.admin1 + ' < ' + SZ.country + ')');
ok(SZ.country < SZ.continent, 'G5 and a country label is smaller than a continent label (' + SZ.country + ' < ' + SZ.continent + ')');
ok(SZ.admin1 / SZ.country <= 0.8, 'G5 with the division/country ratio at or below 0.8 (' + (SZ.admin1 / SZ.country).toFixed(2) + ')');
ok(SZ.continent / SZ.country >= 1.3, 'G5 and the continent/country ratio at or above 1.3 (' + (SZ.continent / SZ.country).toFixed(2) + ')');
ok(GC.indexOf('if (!sp || !sp.front) continue;') !== -1, 'G6 rear-hemisphere division codes are hidden — never shown through the globe');
// front/back projection really does reject the far side
var mvp = M.mat4Mul(M.mat4Perspective(45 * Math.PI / 180, 1, 0.01, 100), M.mat4Mul(M.mat4Translate(0, 0, -2.0), M.modelMatrix(0, 0)));
var front = M.projectToScreen(mvp, M.modelMatrix(0, 0), M.latLngToVec3(0, 0, 1.003), 800, 600);
var back = M.projectToScreen(mvp, M.modelMatrix(0, 0), M.latLngToVec3(0, 180, 1.003), 800, 600);
ok(front && front.front === true, 'G7 a near-side anchor is front-facing');
ok(!back || back.front === false, 'G8 an anchor on the far side is NOT front-facing, so its code is not drawn');

// ================================================================================================================
section('§G/§H — defaults, layer independence, degradation');
// ================================================================================================================
ok(/admin1BordersMode:\s*'auto'/.test(MC) && /admin1LabelsMode:\s*'auto'/.test(MC),
  'H1 both ADM1 layers DEFAULT to auto — the ordinary user gets a correct picture without touching a control');
ok(/showCountryBorders:\s*true/.test(MC) && /showCountryLabels:\s*true/.test(MC),
  'H2 country borders and labels default ON (unchanged)');
ok(MC.indexOf("adm1Select('admin1BordersMode'") !== -1 && MC.indexOf("adm1Select('admin1LabelsMode'") !== -1,
  'H3 the two ADM1 layers have INDEPENDENT controls');
ok(MC.indexOf('data-toggle="showCountryBorders"') !== -1 && MC.indexOf('data-toggle="showCountryLabels"') !== -1,
  'H4 all four layers are independently controllable');
// THE INDEPENDENCE REGRESSION. Both label layers share one 2D canvas, so an early return taken when country
// labels are off would silently switch the ADM1 labels off with them. It must bail only when NEITHER layer
// wants to draw.
var labelFn = code(extractFnEarly(GLOBE, 'drawCountryLabels'));
ok(labelFn.indexOf('!wantCountry && !wantAdmin1') !== -1,
  'H4b the shared label canvas bails ONLY when neither layer has anything to draw');
ok(labelFn.indexOf('if (wantCountry && countryAnchors)') !== -1,
  'H4c turning country labels off suppresses only the COUNTRY candidates');
// RESTATED IN TEXTURE-3-R4 §C: the three classes are built and planned inside ONE pass rather than by three
// nested calls, so independence is now that the ADM1 branch reads its OWN flag after the shared bail.
ok(labelFn.indexOf('var budget = wantAdmin1 ? admin1LabelBudget(lod) : 0;') !== -1 &&
   labelFn.indexOf('var budget = wantAdmin1') > labelFn.indexOf('!wantCountry && !wantAdmin1'),
  'H4d ADM1 labels are still built on that path, so the two toggles are genuinely independent');
ok(GC.indexOf('setAdmin1Countries') !== -1, 'H5 the degradation ladder can restrict ADM1 to a country subset');
// RESTATED IN TEXTURE-3-R3 §D: the two per-layer buffer builders became one ladder-aware uploader, so the
// named failure covers all three classes rather than the ADM1 one alone.
ok(GC.indexOf('BORDER_BUFFER_BUILD_FAILED') !== -1, 'H6 a failed border build is NAMED, not swallowed');
ok(GC.indexOf('ADMIN1_MISSING_SOURCE_IDENTITY_') !== -1,
  'H6 and a missing stable source identity is named too — never a silent fall back to a colliding key');
ok(MC.indexOf("state.admin1AssetState = 'FAILED'") !== -1, 'H7 a failed asset fetch is recorded as a state, not an exception');
ok(MC.indexOf('The map, routes and shipments are unaffected') !== -1,
  'H8 a geographic-layer failure explicitly does NOT take the shipment map down (§H.8)');

// ================================================================================================================
section('§H — no per-frame geometry work; static GPU buffers');
// ================================================================================================================
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '('); if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
var drawFn = code(extractFn(GLOBE, 'draw'));
ok(drawFn.indexOf('buildAdmin1Segments') === -1, 'H9 the render loop NEVER rebuilds ADM1 geometry');
ok(drawFn.indexOf('decodeAdmin1Ring') === -1, 'H10 the render loop NEVER re-parses the ADM1 asset');
ok(drawFn.indexOf('borderBufs[cls]') !== -1, 'H11 the render loop only BINDS the pre-built class buffers');
// Scoped to the BOUNDARY path: the arc and marker layers legitimately upload per frame because their
// geometry is shipment data that changes; the boundary layers never do.
// `drawFn` is COMMENT-STRIPPED, so '// arcs' is not in it: slicing to indexOf('// arcs') === -1 silently
// ran to the end of the function and swallowed the arc layer's legitimate per-frame upload. The end marker
// has to be code.
var bSlice = drawFn.slice(drawFn.indexOf('activeSet && showBorders'), drawFn.indexOf('if (lineCount)'));
ok(bSlice.length > 100 && bSlice.indexOf('bufferData') === -1,
  'H11 and the boundary path performs no upload of its own');
var rebuildFn = code(extractFn(GLOBE, 'uploadBorderSet'));
ok(rebuildFn.indexOf('STATIC_DRAW') !== -1, 'H12 the class buffers are STATIC_DRAW — immutable for the life of the context');
// §D — the topology itself is built OUTSIDE the upload path and outside draw(), once per dataset.
ok(code(extractFn(GLOBE, 'buildFineTopology')).indexOf('admin1Features') !== -1,
  'H12 the fine topology is built in its own function, not in the render or upload path');
ok(GC.indexOf('webglcontextrestored') !== -1 && GC.indexOf('rebuildAdmin1Buffer(); schedule();') !== -1,
  'H13 a restored GL context rebuilds the ADM1 buffer rather than leaving it dangling');
var lodFn = code(extractFn(GLOBE, 'updateLod'));
ok(lodFn.indexOf('if (next === lod) return false;') !== -1,
  'H14 the LOD callback fires only when the level actually CHANGES, not every frame');
// decoding the whole asset and building the buffer must be fast enough to happen on a threshold crossing
var t0 = Date.now(); M.buildAdmin1Segments(D); var buildMs = Date.now() - t0;
ok(buildMs < 2000, 'H15 a full ADM1 decode + rasterise takes ' + buildMs + 'ms — a one-off cost, not a per-frame one');
ok(info.positions.byteLength < 12 * 1024 * 1024,
  'H16 the ADM1 GPU buffer is ' + (info.positions.byteLength / 1048576).toFixed(2) + ' MB — bounded');

// ================================================================================================================
section('§D/§H — capability tiering and texture fallback');
// ================================================================================================================
ok(GC.indexOf('MAX_TEXTURE_SIZE') !== -1, 'D1 the texture tier reads MAX_TEXTURE_SIZE');
ok(GC.indexOf('deviceMemory') !== -1 && GC.indexOf('hardwareConcurrency') !== -1,
  'D2 the tier also reads deviceMemory and hardwareConcurrency');
ok(GC.indexOf('DEVICE_CAPABILITY_UNKNOWN') !== -1, 'D3 an UNKNOWN device stays on the safe base tier');
ok(GC.indexOf('allocation_verified') !== -1 && GC.indexOf('DOWNGRADED_ALLOCATION_FAILED') !== -1,
  'D4 the tier is now verified by ACTUAL allocation success and downgrades if the upload fails (§D)');
ok(/while \(gl\.getError\(\) !== gl\.NO_ERROR\)/.test(GC), 'D5 the error state is drained so the check reports OUR upload');
ok(GC.indexOf('generateMipmap') !== -1 && GC.indexOf('TEXTURE_MAX_ANISOTROPY_EXT') !== -1,
  'D6 mipmaps and anisotropic filtering remain in place (pre-existing V3G6A capability, verified not re-claimed)');
ok(GC.indexOf('getTextureInfo') !== -1 && GC.indexOf('max_texture_size: texInfo.max_texture_size') !== -1,
  'D7 the active tier, MAX_TEXTURE_SIZE and the verification result are all observable');
ok(MC.indexOf('KM_MAP_GLOBE_DIAGNOSTICS') !== -1, 'D8 one consolidated diagnostics accessor exists (§H)');
['render', 'texture', 'lod', 'country_layer', 'admin1_layer', 'admin1_asset'].forEach(function (k) {
  ok(MC.indexOf(k + ':') !== -1, 'D9 diagnostics report: ' + k);
});
// §D.3 — the base tier must be re-RASTERISED, never a rescale of a smaller bitmap
ok(GC.indexOf('buildEarthCanvas(TEX_BASE_W_, TEX_BASE_H_)') !== -1,
  'D10 the fallback RE-RASTERISES from the vector source — it never rescales an existing bitmap');
ok(code(GLOBE).indexOf('filter = \'blur') === -1 || code(GLOBE).indexOf('sharpen') === -1,
  'D11 no sharpen filter is used to fake detail');

// ================================================================================================================
section('§I/§J — nothing about shipments changed');
// ================================================================================================================
ok(MC.indexOf('updateShipmentEta') === -1 || MAP.indexOf('MAP-VISUAL-REAL-EARTH-LOD-1') === -1 ||
   code(extractFn(MAP, 'mapGlobeDiagnostics')).indexOf('updateShipment') === -1,
  'I1 the new diagnostics accessor calls no shipment write API');
var newCode = GC.split('MAP-VISUAL-REAL-EARTH-LOD-1');
ok(GC.indexOf('setMarkers') !== -1 || GC.indexOf('markers') !== -1, 'I2 the marker pipeline is still present');
ok(GC.indexOf('latLngToVec3(mk.lat, mk.lng') !== -1,
  'I3 shipment markers still project from their OWN lat/lng — no coordinate was reinterpreted');
// RESTATED IN TEXTURE-3-R3 §C: the two floating boundary shells (1.0035 / 1.0030) were replaced by r = 1 plus a
// clip-space depth bias, so the literals they were compared against no longer exist. The ORDERING is the load-
// bearing part and it is now asserted on the exported constants rather than on a magic number in a string.
ok(GC.indexOf('mk.elev || MARKER_R_') !== -1, 'I4 markers project at the marker radius');
eq(M.MARKER_R, 1.012, 'I4 which is still 1.012');
ok(M.BORDER_R < M.ARC_R && M.ARC_R < M.MARKER_R,
  'I4 markers still sit ABOVE both reference layers (' + M.BORDER_R + ' < ' + M.ARC_R + ' < ' + M.MARKER_R + ')');
// the ADM1 asset must never be mistaken for business data
ok(ASSET_SRC.indexOf('GEOGRAPHIC REFERENCE ONLY') !== -1,
  'I5 the asset declares itself geographic reference only — never a business coordinate');
ok(GC.indexOf('KM_WORLD_ADMIN1') !== -1 && MC.indexOf('KM_WORLD_ADMIN1') !== -1,
  'I6 the ADM1 dataset is read only by the globe and the map page');
// no Apps Script / DB / schema contact
['SpreadsheetApp', 'allocation_draft', 'shipment_events', 'planned_qty', 'doPost'].forEach(function (t) {
  ok(GLOBE.indexOf(t) === -1, 'I7 km-globe.js contains no business/DB symbol: ' + t);
});
ok(GEN.indexOf('SpreadsheetApp') === -1 && GEN.indexOf('http') !== -1,
  'I8 the generator is offline and touches no business system');
ok(code(GEN).indexOf('Math.random') === -1 && code(GEN).indexOf('Date.now') === -1,
  'I9 the generator is deterministic — no clock, no randomness');

// ================================================================================================================
section('§J — fixed camera regression views');
// ================================================================================================================
// Deterministic render-info assertions per §J's allowance: for each view, assert the LOD the camera resolves to,
// that ADM1 obeys it, and that anchors on the far side are rejected.
var VIEWS = [
  { name: 'Global Pacific', lat: 0, lng: -160, dist: 3.2, lod: 0 },
  { name: 'North America', lat: 45, lng: -100, dist: 1.8, lod: 2 },
  { name: 'Europe', lat: 50, lng: 10, dist: 1.8, lod: 2 },
  { name: 'Japan / East Asia', lat: 36, lng: 138, dist: 1.7, lod: 2 },
  { name: 'Australia', lat: -25, lng: 133, dist: 1.80, lod: 2 },
  { name: 'Dateline crossing', lat: 0, lng: 180, dist: 2.2, lod: 1 },
  { name: 'Maximum supported zoom', lat: 37, lng: -122, dist: 1.35, lod: 3 },
  { name: 'Low-capability fallback', lat: 0, lng: 0, dist: 3.0, lod: 0 }
];
VIEWS.forEach(function (v) {
  var lodV = M.lodForDistance(v.dist, 0);
  eq(lodV, v.lod, 'J:' + v.name + ' resolves to LOD ' + v.lod);
  var bordersOn = M.layerVisible('auto', lodV, M.ADMIN1_BORDER_MIN_LOD);
  eq(bordersOn, v.lod >= 2, 'J:' + v.name + ' ADM1 borders ' + (v.lod >= 2 ? 'VISIBLE' : 'hidden') + ' under AUTO');
  eq(M.admin1LabelBudget(lodV) > 0, v.lod >= 2, 'J:' + v.name + ' ADM1 labels ' + (v.lod >= 2 ? 'admitted' : 'suppressed'));
  // far-side rejection at this camera
  var ang = M.focusAngles(v.lat, v.lng);
  var mdl = M.modelMatrix(ang.yaw, ang.pitch);
  var mvpV = M.mat4Mul(M.mat4Perspective(45 * Math.PI / 180, 16 / 9, 0.01, 100), M.mat4Mul(M.mat4Translate(0, 0, -v.dist), mdl));
  var here = M.projectToScreen(mvpV, mdl, M.latLngToVec3(v.lat, v.lng, 1.003), 1600, 900);
  var anti = M.projectToScreen(mvpV, mdl, M.latLngToVec3(-v.lat, v.lng + 180, 1.003), 1600, 900);
  ok(here && here.front === true, 'J:' + v.name + ' the focused point is front-facing');
  ok(!anti || anti.front === false, 'J:' + v.name + ' the antipode is NOT drawn through the globe');
});
// the dateline view specifically: divisions either side of 180 must both project without a cross-globe artefact
var dlAng = M.focusAngles(0, 180), dlM = M.modelMatrix(dlAng.yaw, dlAng.pitch);
var dlMvp = M.mat4Mul(M.mat4Perspective(45 * Math.PI / 180, 16 / 9, 0.01, 100), M.mat4Mul(M.mat4Translate(0, 0, -2.2), dlM));
var west = M.projectToScreen(dlMvp, dlM, M.latLngToVec3(0, 179.5, 1.003), 1600, 900);
var east = M.projectToScreen(dlMvp, dlM, M.latLngToVec3(0, -179.5, 1.003), 1600, 900);
ok(west && east && west.front && east.front, 'J:dateline both sides of ±180 are front-facing at once');
ok(Math.abs(west.x - east.x) < 200, 'J:dateline they land ADJACENT on screen — no 360° wrap artefact');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
