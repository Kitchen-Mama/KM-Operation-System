// MAP-VISUAL-REAL-EARTH-TEXTURE-3 — the localization authority: Traditional Chinese geographic names.
//
// Executes the REAL vendored asset and the REAL resolver. Nothing here reimplements the fallback order; every
// claim about "which authority answered" is the shipped resolver's own reported level.
//
// WHAT THE AUTHORITY DECISION REQUIRED AND WHAT WAS MEASURED (restated so the suite cannot drift from it):
//   · NAME_ZH must NOT be treated as Traditional merely because it is Chinese. NAME_ZHT was therefore VERIFIED by
//     measurement — 0 Simplified-only characters across 177 features against NAME_ZH's 152 — and only then used.
//   · ADM1 name_zht is MIXED at field level (567 Simplified-only characters remain), so it is accepted PER ROW.
//   · No runtime translation, no remote naming API, no Google Maps data, names only, geometry preserved.
//
// Known regression baseline (pre-existing, unrelated): gap-job-done-notice-f1-small-r1,
// order-planning-monthly-projection-consumer-f1-4b-fm3d, replen-header-toggle, supply-planning-route-inventory.
//
// Run: node assets/tests/geo-names-zh-hant-map-visual-real-earth-texture-3.test.js

var fs = require('fs');
var path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(t) { console.log('\n== ' + t + ' =='); }

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }

var ASSET_SRC = read('assets/js/data/geo-names-zh-hant.js');
var ALIAS_SRC = read('assets/js/data/geo-display-aliases-zh-tw.js');
var RESOLVER_SRC = read('assets/js/core/geo-name-resolver.js');
var GEN_SRC = read('tools/geo/build-geo-names-zh-hant.js');
var PROV = read('tools/geo/PROVENANCE.md');
var INDEX = read('index.html');
var RESOLVER_C = code(RESOLVER_SRC), GEN_C = code(GEN_SRC);

// load the assets exactly as a browser would.
//
// TEXTURE-3-R5 §B — THE ALIAS ASSET IS LOADED HERE NOW, AND ITS ABSENCE WAS A REAL GAP. This suite used to
// load only the names asset, because on `main` the CN/TW short forms came from a table compiled INTO the
// resolver and needed nothing else. After the merge they come from a generated asset that index.html loads as
// its own <script>, so a harness that omits it is not reproducing the page — it is reproducing a broken
// deployment, and would have reported the guard's fallback as if it were the normal result.
var W = { window: {} };
new Function('window', ASSET_SRC).call(W, W.window);
new Function('window', ALIAS_SRC).call(W, W.window);
var D = W.window.KM_GEO_NAMES_ZH_HANT;
global.window = W.window;
var R = require(path.join(ROOT, 'assets/js/core/geo-name-resolver.js'));

// ================================================================================================================
section('A — the asset loads and is NAMES ONLY');
// ================================================================================================================
ok(!!D && !!D.meta, 'A1 the asset defines window.KM_GEO_NAMES_ZH_HANT with meta');
eq(D.meta.task, 'MAP-VISUAL-REAL-EARTH-TEXTURE-3', 'A2 stamped with its task');
eq(D.meta.default_language, 'zh-TW', 'A3 default language is zh-TW');
eq(D.meta.script, 'zh-Hant', 'A3 script is zh-Hant');
// NAMES ONLY — the authority forbids this source supplying geometry or coordinates.
eq(Object.keys(D).sort(), ['admin1', 'continents', 'countries', 'countryContinent', 'countryEnglish', 'meta'],
  'A4 the asset holds exactly six top-level maps — no geometry container');
var anyGeometryKey = false;
['countries', 'continents', 'admin1', 'countryEnglish', 'countryContinent'].forEach(function (m) {
  Object.keys(D[m]).forEach(function (k) { if (typeof D[m][k] !== 'string') anyGeometryKey = true; });
});
ok(!anyGeometryKey, 'A5 every entry in every map is a STRING — no ring, no coordinate pair, no anchor');
ok(!/"g"\s*:/.test(ASSET_SRC) && !/"rings"\s*:/.test(ASSET_SRC), 'A6 the asset contains no ring field');
ok(!/"l"\s*:\s*\[/.test(ASSET_SRC), 'A7 and no [lng,lat] label anchor');

// the geometry assets must be untouched by this feature: they carry no Chinese at all.
['assets/js/data/world-land-110m.js', 'assets/js/data/world-countries-110m.js', 'assets/js/data/world-admin1-10m.js'].forEach(function (f) {
  var src = read(f);
  ok(!/[一-鿿]/.test(src.replace(/CN侑鑫/g, '')), 'A8 geometry asset carries no Chinese name data: ' + f);
});
ok(GEN_C.indexOf('world-countries-110m') === -1 || !/writeFileSync[^\n]*world-countries-110m/.test(GEN_C),
  'A9 the generator never writes the country geometry asset');
ok(!/writeFileSync[^\n]*world-admin1-10m/.test(GEN_C) && !/writeFileSync[^\n]*world-land-110m/.test(GEN_C),
  'A9 nor the ADM1 or land geometry assets');
eq((GEN_C.match(/fs\.writeFileSync\(/g) || []).length, 1, 'A9 the generator writes exactly ONE file');

// ================================================================================================================
section('B — COUNTRIES: authority 1 verified, and every level reachable');
// ================================================================================================================
var cov = D.meta.coverage;
eq(cov.countries.with_iso_a2, 175, 'B1 175 ISO alpha-2 countries in the pinned source');
eq(cov.countries.accepted_traditional, 175, 'B2 ALL 175 accepted as verified Traditional');
eq(cov.countries.fell_back, 0, 'B3 zero country fell back');
eq(Object.keys(D.countries).length, 175, 'B4 and the map carries all 175');
// the verification claim is recorded, not assumed
ok(/confirmed Traditional by measurement/.test(D.meta.country_name_source.verification),
  'B5 the asset records that NAME_ZHT was VERIFIED, not assumed');
eq(D.meta.country_name_source.field, 'NAME_ZHT', 'B6 the field used is NAME_ZHT');
ok(D.meta.country_name_source.field !== 'NAME_ZH', 'B6 NOT NAME_ZH — "Chinese" is not "Traditional"');
ok(/Public domain/.test(D.meta.country_name_source.license), 'B7 licence recorded');
ok(/^https:\/\/raw\.githubusercontent\.com\/nvkelso\/natural-earth-vector\/v5\.1\.2\//.test(D.meta.country_name_source.url),
  'B8 pinned to an immutable version tag, not master');
eq(D.meta.country_name_source.sha256, '6866c877d39cba9c357620878839b336d569f8c662d3cfab4cb1dbe2d39c977f',
  'B9 with the input SHA-256 recorded');

// EXECUTE the resolver: level 1 for a real country
[['US', '美國'], ['JP', '日本'], ['GB', '英國'],
 ['DE', '德國'], ['VN', '越南'], ['TH', '泰國'], ['MY', '馬來西亞']].forEach(function (p) {
  var r = R.country(p[0]);
  eq([r.name, r.level], [p[1], R.LEVEL.ZH_HANT_PINNED_SOURCE], 'B10 ' + p[0] + ' resolves to zh-Hant from the pinned source');
});
// TEXTURE-3-R5 — KR MOVED OUT OF THAT LIST, AND IT IS A FINDING RATHER THAN AN ADJUSTMENT. `main` asserted
// KR = 大韓民國 at ZH_HANT_PINNED_SOURCE, which was true while this suite loaded only the vendored names.
// The map branch's R3 §F reviewed 大韓民國 as a FORMAL state name where a Taiwan-standard common map name
// exists, and records 南韓. So once the alias asset is loaded — as index.html has loaded it since R3, and as
// this suite now does — KR legitimately resolves one level higher. The old expectation was not describing the
// page; it was describing a harness that omitted a script the page loads.
(function () {
  var r = R.country('KR');
  eq([r.name, r.level], ['南韓', R.LEVEL.REVIEWED_DISPLAY_ALIAS],
    'B10 KR resolves to the REVIEWED common map name, above the vendored formal one');
  eq(D.countries.KR, '大韓民國', 'B10 and the vendored asset still carries the formal name underneath');
  eq(R.countryFull('KR').name, '大韓民國', 'B10 which the formal-name authority still returns');
})();
// CN and TW are labelled by the decided short form, ahead of the vendored formal state name.
//
// TEXTURE-3-R5 §B — THE AUTHORITY CHANGED, THE ASSERTION DID NOT. F1-7N-FB-4E-R4B §E supplied these two
// names from an inline HOUSE table; the integration removed that table and kept the map branch's generated
// alias asset, which records the same decision with its provenance. What is asserted here is unchanged — a
// real zh-Hant name, from a NAMED authority, with the vendored asset untouched underneath — and the level
// still proves WHICH authority answered, which is the whole reason the level is asserted rather than only the
// string. Only the expected level moves.
[['CN', '中國', '中華人民共和國'], ['TW', '台灣', '中華民國']].forEach(function (p) {
  var r = R.country(p[0]);
  eq([r.name, r.level], [p[1], R.LEVEL.USER_APPROVED_ALIAS], 'B10 ' + p[0] + ' resolves to the DECIDED short form');
  eq(D.countries[p[0]], p[2], 'B10 ' + p[0] + ' — and the vendored asset is UNTOUCHED, still ' + p[2]);
  eq(r.iso, p[0], 'B10 ' + p[0] + ' — the identifier is unchanged and still returned beside the name');
});
// every resolved country name must be free of Simplified-only characters. The control set is the one the
// generator's own two-source test produced; a name containing any of them would be a leak.
var SIMPLIFIED_CONTROL = '国亚湾马兰达尔联韩罗维纳诺门东苏岛区奥萨萨伦'.split('');
var leaked = [];
Object.keys(D.countries).forEach(function (iso) {
  var n = D.countries[iso];
  for (var i = 0; i < n.length; i++) if (SIMPLIFIED_CONTROL.indexOf(n[i]) !== -1) leaked.push(iso + '=' + n);
});
eq(leaked, [], 'B11 no country name contains a control Simplified character');

// level 3 (English) and level 4 (code) are REACHABLE, not dead branches
var savedCountries = D.countries;
D.countries = {};
var lvl3 = R.country('US');
eq([lvl3.name, lvl3.level], ['United States of America', R.LEVEL.ENGLISH_CANONICAL], 'B12 with zh-Hant absent, level 3 English answers');
var savedEnglish = D.countryEnglish;
D.countryEnglish = {};
var lvl4 = R.country('US');
eq([lvl4.name, lvl4.level], ['US', R.LEVEL.CODE], 'B13 and with English absent too, level 4 is the ISO code');
D.countries = savedCountries; D.countryEnglish = savedEnglish;
var unknown = R.country('ZZ');
eq([unknown.name, unknown.level], ['ZZ', R.LEVEL.CODE], 'B14 an unknown ISO code falls to level 4, never to a guess');
// ISO codes remain legal for operational/logistics use — an explicit language override, never the default
var en = R.country('TW', { lang: 'en' });
eq([en.name, en.level], ['Taiwan', R.LEVEL.ENGLISH_CANONICAL], 'B15 lang:en gives the operational English name');
// F1-7N-FB-4E-R4B §E — B15 is about the LANGUAGE default, not about which zh authority answers. TW is now
// labelled by the house short form, which is still a zh label and still not the English/ISO surface.
var _tw15 = R.country('TW');
ok(_tw15.level === R.LEVEL.USER_APPROVED_ALIAS || _tw15.level === R.LEVEL.ZH_HANT_PINNED_SOURCE,
  'B15 while the DEFAULT stays zh-TW (level ' + _tw15.level + ')');
ok(_tw15.name !== 'Taiwan' && _tw15.name !== 'TW', 'B15 and the default is never the English name or the code');

// ================================================================================================================
section('C — CONTINENTS: reviewed list, and the unnamed case is HIDDEN');
// ================================================================================================================
eq(Object.keys(D.continents).sort(), ['Africa', 'Antarctica', 'Asia', 'Europe', 'North America', 'Oceania', 'South America'],
  'C1 exactly the seven continents are named');
[['Asia', '亞洲'], ['Europe', '歐洲'], ['Africa', '非洲'], ['North America', '北美洲'],
 ['South America', '南美洲'], ['Oceania', '大洋洲'], ['Antarctica', '南極洲']].forEach(function (p) {
  var r = R.continent(p[0]);
  eq([r.name, r.level], [p[1], R.LEVEL.ZH_HANT_REVIEWED_LIST], 'C2 ' + p[0] + ' → ' + p[1]);
});
// the canonical list is exactly the one the authority specified, in its own wording
['北美洲', '南美洲', '歐洲', '亞洲', '非洲', '大洋洲', '南極洲'].forEach(function (n) {
  ok(Object.keys(D.continents).some(function (k) { return D.continents[k] === n; }), 'C3 the reviewed list contains ' + n);
});
ok(!D.continents['Seven seas (open ocean)'], 'C4 "Seven seas (open ocean)" is NOT named — it is not a continent');
// TEXTURE-3-R6 §B — THIS ASSERTION WAS ALREADY DESCRIBING R6'S RULE, one option short of enforcing it.
//
// It passed `{ allowEnglish: false }` and checked for HIDDEN. That proved the resolver COULD hide the bucket if
// asked — and the globe's continent layer never asked, which is how the label reached the default map. The
// option is dropped: hiding a non-place is now unconditional, so the assertion is strictly stronger than it was.
var seas = R.continent('Seven seas (open ocean)');
eq(seas.name, '', 'C5 and with no reliable name it is HIDDEN by DEFAULT, with no option required');
eq(seas.level, R.LEVEL.HIDDEN_NOT_A_PLACE, 'C5 ... and reports that it is not a place, not that a name is missing');
eq(seas.hidden_reason, 'NOT_A_PLACE', 'C5 with an explicit reason');
// Not even an explicit English request may resurrect it — it is not a language question.
eq(R.continent('Seven seas (open ocean)', { lang: 'en' }).name, '', 'C5 and explicit English does not label it either');
// The distinction that matters: a real continent with no name would be a DIFFERENT kind of hidden.
eq(R.continent('Atlantis').level, R.LEVEL.HIDDEN_NAME_UNAVAILABLE,
  'C5 while an unknown PLACE reports a missing name instead');
// a country's continent is derivable, so continent grouping needs no new geometry
eq(R.continentOfCountry('JP'), 'Asia', 'C6 country→continent grouping is available');
eq(R.continent(R.continentOfCountry('JP')).name, '亞洲', 'C6 and composes to the Chinese continent name');
eq(R.continentOfCountry('ZZ'), '', 'C7 an unknown country yields no continent rather than a guess');

// ================================================================================================================
section('D — ADMIN-1: accepted per row, fallback proven, never blocking');
// ================================================================================================================
var a = cov.admin1;
eq(a.vendored_divisions, 3835, 'D1 all 3,835 vendored divisions were considered');
eq(a.matched_to_source, 3835, 'D2 and ALL of them joined to a source row (100% join)');
eq(a.unmatched_to_source, 0, 'D2 none was left unmatched — the key derivation is right');
eq(a.accepted_traditional, 3479, 'D3 3,479 accepted as verified Traditional');
eq(a.fell_back_not_traditional, 356, 'D4 356 fell back because name_zht is not fully Traditional');
ok(a.accepted_traditional / a.vendored_divisions > 0.90, 'D5 coverage is above 90%');
ok(/MIXED at field level/.test(D.meta.admin1_name_source.verification),
  'D6 the asset records that name_zht is MIXED and accepted per DIVISION, not as a field');

// EXECUTE the resolver across the levels
var caZh = R.admin1('US', 'CA', { english: 'California' });
eq([caZh.name, caZh.level], ['加利福尼亞州', R.LEVEL.ZH_HANT_PINNED_SOURCE], 'D7 US-CA resolves to zh-Hant');
var back = R.admin1('CL', 'Tarapacá', { english: 'Tarapacá' });
eq(back.level, R.LEVEL.ENGLISH_CANONICAL, 'D8 a division whose name_zht is still Simplified falls back to English');
eq(back.name, 'Tarapacá', 'D8 carrying the existing English name, not a converted one');
var noEnglish = R.admin1('CL', 'XX-NOPE');
eq(noEnglish.level, R.LEVEL.CODE, 'D9 with no Chinese and no English, level 4 is the division code');
eq(noEnglish.name, 'XX-NOPE', 'D9 which is the code itself');
var adm1En = R.admin1('US', 'CA', { english: 'California', lang: 'en' });
eq([adm1En.name, adm1En.level], ['California', R.LEVEL.ENGLISH_CANONICAL], 'D10 lang:en gives the operational English name');

// the ADM1 key is the NAME, because the displayed code is not unique
eq(a.key, 'country|fullEnglishName (lowercased)', 'D11 ADM1 names are keyed by country + full English name');
ok(a.displayed_code_collisions >= 35, 'D12 the displayed code collides on at least 35 keys — why it is NOT the key');
ok(a.displayed_code_collision_rows >= 53, 'D12 hiding at least 53 rows');
ok(/PRE-EXISTING/.test(a.displayed_code_collision_note), 'D13 recorded as a PRE-EXISTING defect of the label layer');
ok(/BA\|BIH/.test(a.displayed_code_collision_note) && /nine/.test(a.displayed_code_collision_note),
  'D13 naming the nine-canton case concretely');
ok(a.name_key_collisions < a.displayed_code_collisions, 'D14 the name key collides far less than the code key');
ok(/one Chinese name is correct for all of them/.test(a.name_key_collision_note),
  'D14 and the residual collisions are cases where collapsing is CORRECT');

// ================================================================================================================
section('E — the script test: two pinned sources, detection only, never conversion');
// ================================================================================================================
var st = D.meta.script_test;
ok(st.detector_size > 150 && st.detector_size < 400, 'E1 the detector is a bounded set (' + st.detector_size + ' characters)');
ok(/Unihan/.test(st.method) && /Natural Earth/.test(st.method), 'E2 it requires BOTH pinned sources to agree');
ok(/too broad/.test(st.rationale) && /too noisy/.test(st.rationale),
  'E3 and records why neither source alone is sufficient');
eq(D.meta.script_test_source.field, 'kTraditionalVariant', 'E4 the Unicode field used is kTraditionalVariant');
eq(D.meta.script_test_source.archive_sha256, 'a0226610e324bcf784ac380e11f4cbf533ee1e6b3d028b0991bf8c0dc3f85853',
  'E5 with the Unihan archive SHA-256 pinned');
ok(/Unicode License/.test(D.meta.script_test_source.license), 'E6 and its licence recorded');
ok(/DETECTION ONLY/.test(D.meta.script_test_source.used_for), 'E7 declared DETECTION ONLY');
// the forbidden operation must be absent from BOTH the generator and the resolver
['kSimplifiedVariant'].forEach(function (k) {
  ok(GEN_C.indexOf(k) === -1, 'E8 the generator never reads ' + k + ' (it would be a conversion table)');
});
ok(!/convert|translate|transliterat/i.test(RESOLVER_C), 'E9 the resolver contains no conversion/translation code');
ok(RESOLVER_C.indexOf('fetch(') === -1 && RESOLVER_C.indexOf('XMLHttpRequest') === -1,
  'E10 and no runtime network call — no remote naming API');
['Date.now', 'Math.random', 'new Date('].forEach(function (k) {
  ok(RESOLVER_C.indexOf(k) === -1, 'E11 the resolver is deterministic (' + k + ')');
});
['googleapis', 'google.com/maps', 'maps.google'].forEach(function (k) {
  ok(ASSET_SRC.indexOf(k) === -1 && GEN_SRC.indexOf(k) === -1 && RESOLVER_SRC.indexOf(k) === -1,
    'E12 nothing references ' + k + ' — no Google Maps data');
});

// ================================================================================================================
section('F — transformation, provenance and the long-name boundary');
// ================================================================================================================
ok(/verbatim/.test(D.meta.transformation), 'F1 names are copied VERBATIM');
ok(/no transliteration/i.test(D.meta.transformation) && /no translation/i.test(D.meta.transformation),
  'F1 with no transliteration and no translation');
ok(/geometry files are not regenerated/i.test(D.meta.transformation), 'F2 and geometry is untouched');
ok(/Traditional Chinese geographic name asset/.test(PROV), 'F3 PROVENANCE.md documents the asset');
['6866c877d39cba9c357620878839b336d569f8c662d3cfab4cb1dbe2d39c977f',
 '22d0e3ad85eb3e27f17cabf8ba2d50e554fbc27a87796ff891d958185da62fb5',
 'a0226610e324bcf784ac380e11f4cbf533ee1e6b3d028b0991bf8c0dc3f85853'].forEach(function (h) {
  ok(PROV.indexOf(h) !== -1, 'F4 PROVENANCE.md pins input checksum ' + h.slice(0, 12) + '…');
});
ok(/Unicode License/.test(PROV) && /Public domain/.test(PROV), 'F5 and both licences');
ok(/re-verifies both Natural Earth\s*\n?checksums at build time and aborts/.test(PROV.replace(/\r/g, '')) || /aborts on a mismatch/.test(PROV),
  'F6 the generator re-verifies its inputs rather than trusting the pin');
ok(/INPUT_CHECKSUM_MISMATCH/.test(GEN_SRC), 'F6 and the abort is real code, not prose');
// the long formal names are recorded and NOT decided
var ln = D.meta.long_formal_country_names;
ok(ln.entries.length >= 10, 'F7 the formal long names are enumerated (' + ln.entries.length + ')');
ok(ln.entries.some(function (e) { return e.iso === 'KP' && e.chars === 11; }), 'F8 including the 11-character worst case');
ok(/makes no shortening decision and invents no name/.test(ln.note),
  'F9 and the asset explicitly decides nothing about shortening');
// no short-name table was invented
ok(!/countriesShort|shortNames|NAME_SHORT_ZH/.test(ASSET_SRC), 'F10 no invented short-name table exists');

// ================================================================================================================
section('G — load order, cache-bust, and observability');
// ================================================================================================================
var iData = INDEX.indexOf('assets/js/data/geo-names-zh-hant.js');
var iRes = INDEX.indexOf('assets/js/core/geo-name-resolver.js');
var iGlobe = INDEX.indexOf('assets/js/lib/km-globe.js');
ok(iData !== -1, 'G1 the name asset is loaded by index.html');
ok(iRes !== -1, 'G1 as is the resolver');
ok(iData < iRes, 'G2 data BEFORE resolver — the resolver reads the global the data defines');
ok(iRes < iGlobe, 'G2 and the resolver before its consumer km-globe.js');
var tok = /geo-names-zh-hant\.js\?v=([^"']+)/.exec(INDEX);
var tok2 = /geo-name-resolver\.js\?v=([^"']+)/.exec(INDEX);
ok(!!tok && !!tok2, 'G3 both carry a cache-bust token');
// TEXTURE-3-R5 §D — "one shared token" is replaced by "one token per file, moved when that file moves".
// The protection G3 was really giving was against a STALE pairing: the resolver reading a global whose shape
// changed in an asset the browser did not re-fetch. That is expressed directly below, and it is stronger than
// string equality — equal tokens would also be satisfied by rotating both when only one changed, which §D
// forbids because it re-fetches assets that did not change.
// TEXTURE-3-R6 — series from the shared release order; this suite no longer keeps its own copy.
var RO_ = require(path.join(ROOT, 'assets/tests/_release-order.js'));
ok(RO_.isMapToken(tok[1]), 'G3 the asset token belongs to the map series (' + tok[1] + ')');
ok(RO_.isMapToken(tok2[1]), 'G3 as does the resolver token (' + tok2[1] + ')');
// The resolver may be NEWER than the asset it reads (it changed this round and the asset did not), but never
// OLDER — an older resolver against a newer asset is the out-of-step pairing that actually breaks.
ok(RO_.MAP_TOKEN_SERIES.indexOf(tok2[1]) >= RO_.MAP_TOKEN_SERIES.indexOf(tok[1]),
  'G3 and the resolver is never deployed OLDER than the asset it reads');
// eager, unlike the 538 KB ADM1 geometry which stays lazy
ok(INDEX.indexOf('world-admin1-10m.js') === -1, 'G4 the ADM1 GEOMETRY stays lazy-loaded (absent from index.html)');
ok(!/defer|async/.test(INDEX.slice(iData, iData + 120)), 'G5 the name asset is eager — country labels are needed at LOD 0');
// status() makes a missing asset a named fact rather than a silent regression to ISO codes
var s = R.status();
eq([s.loaded, s.countries, s.continents], [true, 175, 7], 'G6 status() reports what is loaded');
ok(s.admin1 > 3400, 'G6 including the ADM1 name count');
var savedGlobal = global.window.KM_GEO_NAMES_ZH_HANT;
delete global.window.KM_GEO_NAMES_ZH_HANT;
var s2 = R.status();
eq([s2.loaded, s2.reason], [false, 'KM_GEO_NAMES_ZH_HANT_ABSENT'], 'G7 an ABSENT asset is a named fact');
ok(/falls back to English or an ISO code/.test(s2.effect), 'G7 stating the consequence');
// Probed with JP, not TW. The DECIDED display names do not come from this asset, so TW legitimately keeps its
// label when the names asset is absent; using it here would have tested the decision rather than the
// degradation rule. JP is asset-owned, so it is the honest probe — and the decided-name behaviour under an
// absent names asset is asserted immediately below rather than left as an unexamined side effect.
var degraded = R.country('JP');
eq(degraded.level, R.LEVEL.CODE, 'G8 and with no asset an asset-owned name degrades to the ISO code — never throws');
// TEXTURE-3-R5 §B — the SAME property, from the surviving authority. The decision lives in a different file
// from the vendored names, so losing the names asset cannot un-decide it. That was true of the inline table and
// it is true of the alias asset, which is exactly why the alias asset was the one kept.
var degradedDecided = R.country('TW');
eq([degradedDecided.name, degradedDecided.level], ['台灣', R.LEVEL.USER_APPROVED_ALIAS],
  'G8 a DECIDED name survives an absent names asset, because it never depended on it');
global.window.KM_GEO_NAMES_ZH_HANT = savedGlobal;
eq(R.country('JP').name, '日本', 'G9 restoring the asset restores zh-Hant');

// ================================================================================================================
section('H — determinism');
// ================================================================================================================
ok(/no clock, no randomness, no network/i.test(D.meta.determinism), 'H1 the asset declares determinism');
['Math.random', 'Date.now', 'new Date('].forEach(function (k) {
  ok(GEN_C.indexOf(k) === -1, 'H2 the generator uses no ' + k);
});
ok(GEN_C.indexOf('http') === -1 || !/require\(['"]https?['"]\)/.test(GEN_C), 'H3 and performs no network I/O');
// keys are emitted sorted, so two runs are byte-identical
['countries', 'continents', 'admin1', 'countryEnglish', 'countryContinent'].forEach(function (m) {
  var k = Object.keys(D[m]);
  eq(k.slice().sort().join(''), k.join(''), 'H4 ' + m + ' keys are emitted in sorted order');
});

// ================================================================================================================
section('I - the globe LABEL LAYER consumes the authority (content only; hierarchy untouched)');
// ================================================================================================================
var GLOBE = read('assets/js/lib/km-globe.js');
var GLOBE_C = code(GLOBE);
ok(/function countryLabelText\(iso\)/.test(GLOBE_C), 'I1 the globe resolves country label text through one function');
ok(/window\.KM\.geoNames\.country\(iso\)/.test(GLOBE_C), 'I2 which calls the KM.geoNames authority');
ok(/labelCtx\.fillText\(lab\.text, lab\.x, lab\.y\)/.test(GLOBE_C), 'I3 and PAINTS the resolved text');
ok(!/labelCtx\.fillText\(lab\.iso,/.test(GLOBE_C), 'I3 the ISO code is no longer painted as the country label');
ok(/next\[lab\.iso\] = 1;/.test(GLOBE_C), 'I4 the previous-frame set is still keyed by ISO - identity, not display');
// RESTATED IN TEXTURE-3-R4 §C: text resolution and measurement moved AFTER the ordering (the ordering keys do
// not need the text) and both are now cached by identity. Identity and display text are still separate fields
// and the box is still measured on the painted string — which is what these two assertions are about.
ok(/cands\.push\(\{ iso: c\.iso, x: _proj\.x/.test(GLOBE_C) && /cc\.text = countryLabelText\(cc\.iso\);/.test(GLOBE_C),
  'I4 candidates carry identity AND display text separately');
ok(/cc\.w = measureCached\(countryFont, cc\.text\);/.test(GLOBE_C),
  'I5 the collision box is measured on the text actually painted');
ok(/function admin1LabelText\(d\)/.test(GLOBE_C), 'I6 ADM1 labels resolve through the same authority');
ok(/ac\.w = measureCached\(admin1Font, ac\.text\);/.test(GLOBE_C), 'I7 measured on the painted text too');
ok(/w = labelCtx\.measureText\(text\)\.width;/.test(GLOBE_C),
  'I7 and the cache measures the real string — it memoises the call, it does not estimate');
['Microsoft JhengHei', 'PingFang TC', 'Noto Sans TC'].forEach(function (f) {
  ok(GLOBE.indexOf(f) !== -1, 'I8 the label font stack names the zh-TW face ' + f);
});
// RESTATED IN TEXTURE-3-R4 §C. There used to be three separate font declarations and the load-bearing half of
// this assertion was that EVERY one of them carried the zh-TW stack. There is now ONE builder that every class
// goes through, which makes that guarantee structural instead of a property three sites happen to share — so
// the assertion is that the builder is the only source, and that all three classes use it.
eq((GLOBE.match(/function fontFor\(px, weight\)/g) || []).length, 1,
  'I9 ONE font builder serves every label class');
var fontForSrc = GLOBE.slice(GLOBE.indexOf('function fontFor(px, weight)'),
                            GLOBE.indexOf('function fontFor(px, weight)') + 400);
ok(/Microsoft JhengHei[\s\S]{0,200}Noto Sans CJK TC/.test(fontForSrc),
  'I9 and the zh-TW faces are named FIRST inside it');
['countryFont = fontFor(fontPx', 'continentFont = fontFor(SIZES.continent', 'admin1Font = fontFor(SIZES.admin1']
  .forEach(function (u) {
    ok(GLOBE.indexOf(u) !== -1, 'I9 the CJK stack reaches every class via the builder: ' + u.split(' =')[0]);
  });
var fontLines = GLOBE.match(/labelCtx\.font = [A-Za-z]+;/g) || [];
ok(fontLines.length >= 3, 'I9 and it is assigned per class before painting (' + fontLines.length + ' sites)');
ok(/var out = String\(iso == null \? '' : iso\);/.test(GLOBE_C),
  'I10 with no resolver the country label falls back to the ISO code');
ok((GLOBE_C.match(/catch \(e\) \{\}/g) || []).length >= 2, 'I11 both resolver calls are guarded - a missing asset degrades language only');
ok(/function admin1LabelBudget/.test(GLOBE_C) && /function countryLabelTier/.test(GLOBE_C),
  'I12 the existing budget and tier machinery is unchanged - hierarchy is not this round');
// TEXTURE-3-R6 — the FIFTH copy of "the map set shares one token", restated on the derived rule like the
// other four. km-globe.js changed in R6 and the name asset did not, so requiring them to be EQUAL would forbid
// exactly what §G asks for. What must hold is that each file re-fetches when its own bytes move.
var tok3 = /km-globe\.js\?v=([^"']+)/.exec(INDEX);
ok(!!tok3, 'I13 km-globe.js carries a cache-bust token');
ok(RO_.isMapToken(tok3[1]), 'I13 ... from the map series (' + tok3[1] + ')');
(function () {
  var marker = new RegExp(RO_.currentMapRoundMarker());
  var changed = marker.test(GLOBE);
  if (changed) {
    ok(tok3[1] === RO_.currentMapToken(),
      'I13 km-globe.js changed this round, so it re-fetches on the current token');
  } else {
    ok(tok3[1] !== RO_.currentMapToken(),
      'I13 km-globe.js did not change this round, so it is not needlessly rotated');
  }
})();

console.log('\n----------------------------------------');
if (fail === 0) console.log('GEO NAMES zh-Hant (MAP-VISUAL-REAL-EARTH-TEXTURE-3): ' + pass + ' passed, 0 failed');
else console.log('GEO NAMES zh-Hant (MAP-VISUAL-REAL-EARTH-TEXTURE-3): ' + pass + ' passed, ' + fail + ' FAILED');
console.log('----------------------------------------');
process.exit(fail === 0 ? 0 : 1);
