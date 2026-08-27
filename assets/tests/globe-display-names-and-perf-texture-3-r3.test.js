// MAP-VISUAL-REAL-EARTH-TEXTURE-3-R3 §F / §G / §I — THE zh-TW DISPLAY-NAME AUTHORITY AND THE MEASURED PHASES.
//
//   §F  the display authority order, the reviewed alias asset, the full formal name still reachable, and the
//       geopolitical cases REFUSED rather than decided
//   §G  the label size ladder, the continent layer, the zoom ramps and the clipping rule
//   §I  that the performance phases are measured SEPARATELY and that a software-rasteriser number can never be
//       reported as hardware
//
// §J13 is asserted here too - business ISO values must never be localised - because that is the one way a
// display-name layer can cause real damage rather than a cosmetic one.
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
function charLen(s) { return Array.from(String(s || '')).length; }

var GLOBE = read('assets/js/lib/km-globe.js');
var GC = code(GLOBE);
var INDEX = read('index.html');
var ALIAS_SRC = read('assets/js/data/geo-display-aliases-zh-tw.js');

global.window = global.window || {};
require(path.join(ROOT, 'assets/js/data/world-countries-110m.js'));
require(path.join(ROOT, 'assets/js/data/geo-names-zh-hant.js'));
require(path.join(ROOT, 'assets/js/data/geo-display-aliases-zh-tw.js'));
var G = require(path.join(ROOT, 'assets/js/core/geo-name-resolver.js'));
var M = require(path.join(ROOT, 'assets/js/lib/km-globe.js')).math;
var A = window.KM_GEO_DISPLAY_ALIASES;
var NAMES = window.KM_GEO_NAMES_ZH_HANT;
var COUNTRIES = window.KM_WORLD_COUNTRIES;

// ================================================================================================================
section('§F — the alias asset: names only, deterministic, and fully attributed');
// ================================================================================================================
ok(!!A, 'F1 the display-alias asset loads');
ok(!!(A && A.meta && A.meta.cldr), 'F1 and records its CLDR source');
eq(A.meta.cldr.locale, 'zh-Hant', 'F1 from the zh-Hant locale');
ok(/^\d+\.\d+\.\d+$/.test(A.meta.cldr.version), 'F1 at a pinned version (' + A.meta.cldr.version + ')');
ok(/^[0-9a-f]{64}$/.test(A.meta.cldr.sha256), 'F1 with the input digest pinned');
ok(A.meta.cldr.bytes > 0, 'F1 and its byte size');
ok(/Unicode/.test(A.meta.cldr.license), 'F1 the licence is named (' + A.meta.cldr.license + ')');
ok(/Unicode CLDR/.test(A.meta.cldr.credit), 'F1 with the attribution string');
// §F — "a deterministic reviewed alias asset containing NAMES ONLY". Enforced, not promised: any coordinate-ish
// key would make this a second geometry source, and the whole localisation design depends on there being one.
['lat', 'lng', 'lon', 'coord', 'ring', 'geometry', 'anchor', 'label_xy', 'bbox', 'centroid'].forEach(function (bad) {
  ok(ALIAS_SRC.toLowerCase().indexOf('"' + bad) === -1, 'F2 the asset carries no ' + bad + ' key');
});
ok(!/\[\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*\]/.test(ALIAS_SRC.replace(/"authority_order":\[[^\]]*\]/, '')),
  'F2 and no coordinate pair anywhere in it');
ok(ALIAS_SRC.indexOf('https://raw.githubusercontent.com') !== -1, 'F2 the source URL is recorded for re-acquisition');
ok(INDEX.indexOf('assets/js/data/geo-display-aliases-zh-tw.js') !== -1, 'F2 index.html loads it');
// It must load BEFORE the resolver, or the resolver's top two levels are empty on first paint.
ok(INDEX.indexOf('geo-display-aliases-zh-tw.js') < INDEX.indexOf('geo-name-resolver.js'),
  'F2 and loads BEFORE the resolver that reads it');
// §F — every alias carries the four things §F asks to be reported.
function checkEntry(iso, e, where) {
  ok(!!e.display, 'F3 ' + where + ' ' + iso + ' has a displayed name');
  ok(!!e.full, 'F3 ' + where + ' ' + iso + ' has the full authoritative name');
  ok(!!e.source, 'F3 ' + where + ' ' + iso + ' names its source');
  ok(!!e.rationale && e.rationale.length > 30, 'F3 ' + where + ' ' + iso + ' gives a review rationale');
  eq(e.full, String(NAMES.countries[iso] || ''), 'F3 ' + where + ' ' + iso + ' full name matches the NAME_ZHT authority');
}
Object.keys(A.cldrAltShort).forEach(function (iso) { checkEntry(iso, A.cldrAltShort[iso], 'alt-short'); });
Object.keys(A.reviewed).forEach(function (iso) { checkEntry(iso, A.reviewed[iso], 'reviewed'); });
ok(Object.keys(A.reviewed).length > 0, 'F3 there is at least one reviewed alias (' + Object.keys(A.reviewed).length + ')');

// ================================================================================================================
section('§F — the authority ORDER, executed');
// ================================================================================================================
eq(G.LEVEL.CLDR_ALT_SHORT, 'CLDR_ALT_SHORT', 'F4 level 1 exists');
eq(G.LEVEL.REVIEWED_DISPLAY_ALIAS, 'REVIEWED_DISPLAY_ALIAS', 'F4 level 2 exists');
// Level 1 beats level 2 beats level 3. Asserted by picking a real ISO at each level.
Object.keys(A.cldrAltShort).forEach(function (iso) {
  var r = G.country(iso);
  eq(r.level, G.LEVEL.CLDR_ALT_SHORT, 'F5 ' + iso + ' resolves at level 1 (CLDR alt-short)');
  eq(r.name, A.cldrAltShort[iso].display, 'F5 ' + iso + ' displays ' + A.cldrAltShort[iso].display);
});
Object.keys(A.reviewed).forEach(function (iso) {
  var r = G.country(iso);
  eq(r.level, G.LEVEL.REVIEWED_DISPLAY_ALIAS, 'F5 ' + iso + ' resolves at level 2 (reviewed alias)');
  eq(r.name, A.reviewed[iso].display, 'F5 ' + iso + ' displays ' + A.reviewed[iso].display);
});
// A country with no alias still resolves at the vendored level — the alias layer must not shadow anything else.
['JP', 'FR', 'BR', 'IN', 'ZA'].forEach(function (iso) {
  eq(G.country(iso).level, G.LEVEL.ZH_HANT_PINNED_SOURCE, 'F5 ' + iso + ' still resolves from NAME_ZHT');
  eq(G.country(iso).name, NAMES.countries[iso], 'F5 ' + iso + ' unchanged by this round');
});
// §F — "Full formal name remains available in tooltip/detail."
Object.keys(A.reviewed).forEach(function (iso) {
  eq(G.countryFull(iso).name, A.reviewed[iso].full,
    'F6 the FULL formal name is still reachable for ' + iso + ' (' + A.reviewed[iso].full + ')');
  ok(G.countryFull(iso).name !== G.country(iso).name,
    'F6 and differs from what the map paints for ' + iso);
});
eq(G.country('KP', { form: 'full' }).name, NAMES.countries.KP,
  'F6 form:"full" bypasses the display levels entirely');
// The whole point of the exercise: §F's 8-11 character rule is actually satisfied.
(function () {
  var longAfter = COUNTRIES.countries.filter(function (c) {
    return charLen(G.country(c.iso).name) >= 8;
  }).map(function (c) { return c.iso + '=' + G.country(c.iso).name + '(' + charLen(G.country(c.iso).name) + ')'; });
  var longBefore = COUNTRIES.countries.filter(function (c) {
    return charLen(String(NAMES.countries[c.iso] || '')) >= 8;
  }).map(function (c) { return c.iso; });
  console.log('  >=8 char labels before: ' + longBefore.length + ' (' + longBefore.join(',') + ')');
  console.log('  >=8 char labels after : ' + longAfter.length + ' (' + longAfter.join(', ') + ')');
  ok(longAfter.length < longBefore.length,
    'F7 fewer countries carry an 8+ character label than before (' + longBefore.length + ' -> ' + longAfter.length + ')');
  // KP is the case §F's wording describes most exactly: an 11-character formal state name.
  eq(charLen(String(NAMES.countries.KP)), 11, 'F7 KP was an 11-character formal name');
  ok(charLen(G.country('KP').name) <= 3, 'F7 and now paints ' + G.country('KP').name + ', a common map name');
  // Any remaining long label must have NO shorter verified form — not merely be unaddressed.
  longAfter.forEach(function (s) {
    var iso = s.split('=')[0];
    ok(!A.reviewed[iso] && !A.cldrAltShort[iso],
      'F7 ' + iso + ' is still long because no shorter verified form exists, not because it was skipped');
  });
})();

// ================================================================================================================
section('§F — the geopolitical cases are REFUSED, not decided');
// ================================================================================================================
ok(Array.isArray(A.unresolved), 'F8 the asset carries an unresolved list');
// RESTATED IN TEXTURE-3-R4 §A. R3 REFUSED TW and CN and reported both candidates, and this suite asserted that
// refusal. The user has since made the decision, so the assertion that must hold now is the opposite one — and
// it is a STRONGER claim than "the list is non-empty": the list is empty BECAUSE each case carries a recorded
// decision, not because the asset failed to load or the cases were dropped.
eq(A.unresolved.length, 0, 'F8 which is now EMPTY — every case it held has been decided');
A.unresolved.forEach(function (u) {
  ok(!!u.iso && !!u.current_displayed && !!u.candidate, 'F8 ' + u.iso + ' records both candidates');
  ok(!!u.why_unresolved && u.why_unresolved.length > 40, 'F8 ' + u.iso + ' says WHY it is unresolved');
  eq(u.decision_required_from, 'USER', 'F8 ' + u.iso + ' names the user as the decision owner');
  // NOT APPLIED — the map must still show the status quo, not the candidate.
  ok(!A.reviewed[u.iso] && !A.cldrAltShort[u.iso], 'F8 ' + u.iso + ' is NOT in either applied set');
  eq(G.country(u.iso).name, u.current_displayed, 'F8 ' + u.iso + ' still paints the status quo (' + u.current_displayed + ')');
  ok(G.country(u.iso).name !== u.candidate, 'F8 and NOT the candidate (' + u.candidate + ')');
});
// The two the task's own domain makes unavoidable — decided by the user in R4 §A, and recorded as decisions
// rather than merely removed from the list. The full battery for §A lives in the R4 suite.
var approvedIso = Object.keys(A.approved || {}).sort();
eq(approvedIso.join(','), 'CN,TW', 'F8 TW and CN carry a RECORDED decision instead of a pending one');
eq(A.approved.TW.decided_by, 'USER', 'F8 attributed to the person who owns the choice');
eq(A.approved.CN.decided_by, 'USER', 'F8 and so is CN — the counterpart decision');
// Surfaced through the resolver, so the product can SHOW that a decision is outstanding.
eq(G.unresolvedNames().length, A.unresolved.length, 'F9 the resolver exposes the unresolved list');
// And the rejected-but-considered set is recorded rather than silently dropped.
ok(Array.isArray(A.keptExisting) && A.keptExisting.length > 0,
  'F9 names considered and deliberately NOT changed are recorded (' + A.keptExisting.length + ')');
A.keptExisting.forEach(function (k) {
  ok(!!k.reason && k.reason.length > 30, 'F9 ' + k.iso + ' records why the CLDR form was rejected');
  eq(G.country(k.iso).name, k.kept, 'F9 ' + k.iso + ' keeps ' + k.kept);
});

// ================================================================================================================
section('§J13 — business ISO values are NEVER localised');
// ================================================================================================================
// This is the one way a display-name layer can do real damage. The resolver returns a NAME; it must never be
// mistaken for, or able to replace, the code a shipment or a warehouse is keyed on.
['US', 'CN', 'TW', 'JP', 'DE'].forEach(function (iso) {
  eq(G.country(iso).iso, iso, 'J13 ' + iso + ' resolves with its ISO code UNCHANGED alongside the display name');
});
ok(GC.indexOf('KM.geoNames.country') !== -1, 'J13 the engine consults the resolver for LABEL TEXT');
// The label layer must key its own state on the code, not on the painted text — otherwise a language change
// looks like a different label and the collision hysteresis breaks.
// RESTATED IN TEXTURE-3-R4 §C: the candidate is built BEFORE its text is resolved, because the ordering keys
// are known without the text and resolving it earlier is the wasted work §C removes. Identity and display text
// are still separate fields, which is the whole point of the assertion.
ok(/cands\.push\(\{ iso: c\.iso, x: _proj\.x/.test(GLOBE),
  'J13 the country candidate is keyed by ISO — identity, not display text');
ok(/cc\.text = countryLabelText\(cc\.iso\);/.test(GLOBE),
  'J13 and the displayed text is resolved FROM that identity into a separate field');
var MAPJS = read('assets/js/pages/global-logistics-map.js');
ok(MAPJS.indexOf('geoNames') === -1 || !/warehouse|shipment_id|sku/i.test(MAPJS.slice(Math.max(0, MAPJS.indexOf('geoNames') - 200), MAPJS.indexOf('geoNames') + 200)),
  'J13 the page never routes a business identifier through the name resolver');
// The alias asset must contain no business vocabulary at all.
// A bare substring search for 'order' matched `authority_order` in the asset's own metadata - a false
// positive of exactly the kind that makes a guard worse than none. The terms below cannot occur except as
// business vocabulary.
['warehouse', 'shipment', 'sku', 'asin', 'fnsku', 'purchase_order', 'inventory', 'lot_no'].forEach(function (bad) {
  ok(ALIAS_SRC.toLowerCase().indexOf(bad) === -1, 'J13 the alias asset contains no business term: ' + bad);
});

// ================================================================================================================
section('§G — the label ladder, the continent layer and the clipping rule');
// ================================================================================================================
var SZ = M.labelSizes(2.0);
console.log('  label sizes: continent ' + SZ.continent + ' · country ' + SZ.country + ' · adm1 ' + SZ.admin1);
ok(SZ.admin1 < SZ.country && SZ.country < SZ.continent, 'G1 three DISTINCT, ordered sizes');
ok(SZ.admin1 / SZ.country <= 0.8, 'G1 the division/country ratio is visible (' + (SZ.admin1 / SZ.country).toFixed(2) + ')');
ok(SZ.continent / SZ.country >= 1.3, 'G1 and so is the continent/country ratio (' + (SZ.continent / SZ.country).toFixed(2) + ')');
// §G — continent labels exist at all, which they did not before this round.
// RESTATED IN TEXTURE-3-R4 §C: the three classes are planned together, so the continent layer is a CLASS in
// the plan rather than a function of its own. Asserted through the shipped planner.
ok(M.LABEL_CLASS_ORDER.indexOf('CONTINENT') !== -1, 'G2 a continent label layer exists');
ok(/cls: 'CONTINENT'/.test(GLOBE) && /function continentList\(\)/.test(GLOBE),
  'G2 with its own derived anchors and its own candidate class');
ok(/function continentAnchors\(/.test(GLOBE), 'G2 with derived anchors');
// Anchors are derived in 3D. A longitude mean would put Oceania in the Atlantic, so this is executed.
(function () {
  var byIso = {};
  COUNTRIES.countries.forEach(function (c) { byIso[c.iso] = c; });
  var anchors = M.continentAnchors(COUNTRIES, function (iso) {
    try { return G.continentOfCountry(iso) || ''; } catch (e) { return ''; }
  });
  ok(anchors.length >= 6, 'G2 every continent with member countries gets an anchor (' + anchors.length + ')');
  anchors.forEach(function (a) {
    var L = Math.sqrt(a.vec[0] * a.vec[0] + a.vec[1] * a.vec[1] + a.vec[2] * a.vec[2]);
    ok(Math.abs(L - 1) < 1e-9, 'G2 ' + a.key + ' anchor is a unit vector (' + L.toFixed(9) + ')');
  });
  // Oceania is the case a lat/lng mean gets wrong: its members straddle the anti-meridian.
  var oce = anchors.filter(function (a) { return a.key === 'Oceania'; })[0];
  ok(!!oce, 'G2 Oceania has an anchor');
  if (oce) {
    var lng = Math.atan2(oce.vec[0], oce.vec[2]) * 180 / Math.PI;
    var lat = Math.asin(Math.max(-1, Math.min(1, oce.vec[1]))) * 180 / Math.PI;
    console.log('  Oceania anchor: lat ' + lat.toFixed(1) + ' lng ' + lng.toFixed(1));
    ok(Math.abs(lng) > 100, 'G2 and it lands in the Pacific (lng ' + lng.toFixed(1) + '), not the Atlantic — ' +
      'which a mean of longitudes would have produced');
    ok(lat < 5, 'G2 at a southern-hemisphere-ish latitude (' + lat.toFixed(1) + ')');
  }
})();
// §G — the two ramps do not overlap, so the two layers never compete.
ok(M.continentStrength(1.95) === 0 && M.admin1BorderStrength(1.95) === 0,
  'G3 at distance 1.95 the continent layer has faded out and the ADM1 layer has not begun');
ok(M.continentStrength(3.0) === 1, 'G3 continents are full strength on the default globe');
ok(M.admin1BorderStrength(3.0) === 0, 'G3 where ADM1 is entirely absent');
ok(M.admin1BorderStrength(1.35) === 1, 'G3 and ADM1 is full strength at maximum zoom');
// Monotonic in both cases — a non-monotonic ramp would flicker on a slow zoom.
(function () {
  // The two ramps run in OPPOSITE directions, and the first version of this initialised them the wrong way
  // round: ADM1 strength FALLS with distance (1 at 1.35, 0 at 1.95) and continent strength RISES.
  var prevA = 2, prevC = -1, d;
  for (d = 1.35; d <= 3.2; d += 0.05) {
    var a = M.admin1BorderStrength(d), c = M.continentStrength(d);
    if (a > prevA + 1e-9) { ok(false, 'G3 the ADM1 ramp is monotonic in distance'); return; }
    if (c < prevC - 1e-9) { ok(false, 'G3 the continent ramp is monotonic in distance'); return; }
    prevA = a; prevC = c;
  }
  pass += 2; console.log('  (both ramps are monotonic across 1.35..3.2)');
})();
// §G — "no clipped label at the globe edge", and one rule for all three classes.
eq((GC.match(/function boxInsideViewport\(/g) || []).length, 1, 'G4 ONE whole-box viewport test serves every class');
eq((GLOBE.match(/boxInsideViewport\(/g) || []).length, 4, 'G4 declared once and used by all three label layers');
// §G — a division label must be FACING the camera, not merely on the near hemisphere.
ok(M.ADMIN1_LABEL_MIN_FACING > 0.4 && M.ADMIN1_LABEL_MIN_FACING < 0.9,
  'G5 division labels require a real facing threshold (' + M.ADMIN1_LABEL_MIN_FACING + ')');
ok(/if \(facingOf\(model, an\.x, an\.y, an\.z\) < ADMIN1_LABEL_MIN_FACING_\) continue;/.test(GLOBE),
  'G5 which is applied — and now BEFORE the projection, so a rejected label costs three multiplies');
ok(/facing: mv\.z/.test(GLOBE), 'G5 from the surface-normal cosine, not from a screen-space guess');
// §G priority: shipment/route, country, continent, ADM1.
ok(GLOBE.indexOf("priority: 5, cls: 'CONTINENT'") !== -1, 'G6 continents rank below countries (priority 5)');
ok(GLOBE.indexOf("priority: 6, cls: 'ADM1'") !== -1, 'G6 and divisions below continents (priority 6)');
ok(/countryPriorityOf/.test(GLOBE), 'G6 with shipment-driven countries ranked above all of them');

// ================================================================================================================
section('§I — the phases are measured separately, and a software number says so');
// ================================================================================================================
ok(/measureFrames: function \(o\)/.test(GLOBE), 'I1 the engine exposes a frame measurement');
ok(/if \(doFinish\) gl\.finish\(\);/.test(GLOBE),
  'I2 which DRAINS THE PIPELINE — without this it measures command submission, not a frame');
eq((GLOBE.match(/if \(doFinish\) gl\.finish\(\);/g) || []).length, 2,
  'I2 on the warm-up frame as well as every sample');
ok(/measures: doFinish/.test(GLOBE), 'I2 and the result STATES what it measured');
ok(/pipeline_drained: doFinish/.test(GLOBE), 'I2 as a machine-readable flag too');
// §I — the renderer string must come from the driver, so a SwiftShader number can never be read as hardware.
ok(/WEBGL_debug_renderer_info/.test(GLOBE), 'I3 the unmasked renderer is read from the driver');
ok(/UNMASKED_RENDERER_WEBGL/.test(GLOBE), 'I3 via UNMASKED_RENDERER_WEBGL');
ok(/return 'UNAVAILABLE'/.test(GLOBE), 'I3 and is UNAVAILABLE rather than guessed when withheld');
// §I — every phase in the list is separately reported.
['asset_load_fetch_plus_decode', 'gpu_upload', 'topology_prepare_coarse', 'topology_prepare_fine',
 'border_buffer_upload_coarse', 'border_buffer_upload_fine', 'label_placement_last_frame', 'first_render'
].forEach(function (k) {
  ok(GLOBE.indexOf(k + ':') !== -1, 'I4 the phase "' + k + '" is reported separately');
});
ok(/first_render: firstRenderMs/.test(GLOBE), 'I4 first render is recorded ONCE, not averaged with redraws');
ok(/if \(framesDrawn === 1\) firstRenderMs/.test(GLOBE), 'I4 on the first completed frame');
// §I — geometry counts before/after dedup, and the removed percentage.
ok(GLOBE.indexOf('duplicate_edges_removed:') !== -1, 'I5 the removed duplicate-edge count is reported');
ok(GLOBE.indexOf('duplicate_percent:') !== -1, 'I5 and as a percentage');
ok(GLOBE.indexOf('segments_after_subdivision:') !== -1, 'I5 with segment counts after subdivision');
ok(GLOBE.indexOf('rendered label counts') !== -1 || GLOBE.indexOf('label_counts:') !== -1,
  'I5 and the rendered label count per class');
// §I — the measurement tool must NOT be the deterministic capture harness.
var PERF = read('tools/geo/measure-perf.js');
var CAP = read('tools/geo/capture-views.js');
ok(CAP.indexOf('--virtual-time-budget') !== -1, 'I6 the CAPTURE harness pins virtual time (for determinism)');
// The perf tool NAMES the flag in the comment that explains why it does not use it, so the test has to look
// at what is actually passed to Chrome rather than at whether the string appears in the file.
ok(!/args\.push\([^)]*--virtual-time-budget/.test(PERF) && PERF.indexOf("'--virtual-time-budget=") === -1,
  'I6 and the PERFORMANCE tool never PASSES it - wall-clock timing is impossible under virtual time');
ok(/no --virtual-time-budget|NO virtual-time/i.test(PERF), 'I6 and says so in its output');
ok(/SwiftShader SOFTWARE rasteriser/.test(PERF), 'I6 the perf tool labels the software path');
ok(/software rasteriser/i.test(PERF), 'I6 and says so in its output');
// The engine must never call the measurement from a render path.
ok(GC.indexOf('measureFrames(') === -1 || !/function draw\(\)[\s\S]{0,4000}measureFrames\(/.test(GC),
  'I7 nothing in the engine calls measureFrames() itself — it is a diagnostics entry point');

console.log('\n----------------------------------------');
console.log('DISPLAY NAMES + PERF (TEXTURE-3-R3 §F/§G/§I): ' + pass + ' passed, ' + fail + (fail ? ' FAILED' : ' failed'));
console.log('----------------------------------------');
process.exit(fail === 0 ? 0 : 1);
