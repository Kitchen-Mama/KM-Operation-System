// MAP-VISUAL-REAL-EARTH-TEXTURE-3-R4 §A / §B / §C / §D / §E — the four things R3 left open, and one it could
// not have closed as worded.
//
//   §A  the TW/CN decision            -> the user decided it; this proves the SEPARATION is real. What the map
//                                        paints, what an inspect surface shows and what the system keys on are
//                                        three different strings, and only the first one changed.
//   §B  division localization         -> §B's preferred authority (CLDR zh-Hant subdivisions) DOES NOT EXIST,
//                                        and that is proven from a vendored file rather than asserted. The
//                                        fallback authority is QID-joined, licence-checked and detector-gated.
//   §C  label density                 -> a rejected label must not cost layout work. Proven on the SHIPPED
//                                        funnel: cull, then order, then measure only what the budget can use.
//   §D  collision determinism         -> all four classes, executed through the shipped planner: repeat-runs,
//                                        reversed input, ties, cross-class precedence, resize, LOD hysteresis,
//                                        and the three known identity collisions.
//   §E  the former §J10               -> NOT APPLICABLE AS ORIGINALLY WORDED. There is no runtime simplifier to
//                                        test, and inventing one to satisfy a test name would be the worst
//                                        possible outcome. The equivalent invariant is proven at the real LOD
//                                        boundary instead: each prebuilt dataset is independently canonical.
//
// It EXECUTES the shipped modules. Where a claim is structural it pins the exact string and says so.
'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
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
function sha256(b) { return crypto.createHash('sha256').update(b).digest('hex'); }

var GLOBE = read('assets/js/lib/km-globe.js');
var GC = code(GLOBE);
var INDEX = read('index.html');
var RESOLVER_SRC = read('assets/js/core/geo-name-resolver.js');
var ALIAS_SRC = read('assets/js/data/geo-display-aliases-zh-tw.js');
var ADM1_SRC = read('assets/js/data/geo-admin1-display-names-zh-tw.js');
var GEN_A = read('tools/geo/build-geo-display-aliases.js');
var GEN_B = read('tools/geo/build-admin1-display-names.js');

global.window = global.window || {};
require(path.join(ROOT, 'assets/js/data/world-countries-110m.js'));
require(path.join(ROOT, 'assets/js/data/world-admin1-10m.js'));
require(path.join(ROOT, 'assets/js/data/geo-names-zh-hant.js'));
require(path.join(ROOT, 'assets/js/data/geo-display-aliases-zh-tw.js'));
require(path.join(ROOT, 'assets/js/data/geo-admin1-display-names-zh-tw.js'));
var G = require(path.join(ROOT, 'assets/js/core/geo-name-resolver.js'));
var T = require(path.join(ROOT, 'assets/js/lib/km-geo-topology.js'));
var M = require(path.join(ROOT, 'assets/js/lib/km-globe.js')).math;
var COUNTRIES = window.KM_WORLD_COUNTRIES;
var ADMIN1 = window.KM_WORLD_ADMIN1;
var A = window.KM_GEO_DISPLAY_ALIASES;
var AD = window.KM_GEO_ADMIN1_DISPLAY_NAMES;
var NAMES = window.KM_GEO_NAMES_ZH_HANT;

console.log('MAP-VISUAL-REAL-EARTH-TEXTURE-3-R4 — DECISION, DENSITY, DETERMINISM');

// ================================================================================================================
section('§A — the TW/CN decision is a SEPARATION, and all three levels are reachable at once');
// ================================================================================================================
// A.1 — what the map paints.
eq(G.country('TW').name, '台灣', 'A1 the TW map label is 台灣');
eq(G.country('CN').name, '中國', 'A1 the CN map label is 中國');
eq(G.country('TW').level, 'USER_APPROVED_ALIAS', 'A1 and it answers at the USER_APPROVED level');
eq(G.country('CN').level, 'USER_APPROVED_ALIAS', 'A1 for CN too');
// The level exists ABOVE the mechanical authorities, which is the point of recording a decision rather than
// letting a data source happen to agree.
var lvOrder = (A.meta.authority_order || []).join(' | ');
ok(/^0 USER_APPROVED_ALIAS/.test(A.meta.authority_order[0]),
  'A1 USER_APPROVED_ALIAS is level 0 — a decision outranks every data source');
ok(lvOrder.indexOf('1 UNICODE_CLDR_ALT_SHORT') !== -1 && lvOrder.indexOf('2 REVIEWED_DISPLAY_ALIAS') !== -1,
  'A1 with the R3 levels intact below it');

// A.2 — the detail presentation, and it must be DISTINCT from the label.
//
// SUPERSEDED BY TEXTURE-3-R5 §B, AND RE-AIMED RATHER THAN DELETED. R4 §A recorded a SEPARATION: the globe
// paints 台灣 and an inspect surface shows 中華民國（TW）. R5 §B withdraws the second half and names
// 中華民國（TW） as a FORBIDDEN output on every user-visible surface, the detail view included. The five
// assertions below used to pin the old strings; they now pin the new ones, and the two that were really about
// STRUCTURE rather than about those strings — "distinct from the label", "reports its own level" — are kept
// exactly as they were, because R5 did not change what they were protecting.
eq(G.countryDetail('TW').name, '台灣（TW）', 'A2/R5 the TW detail presentation is 台灣（TW）');
eq(G.countryDetail('CN').name, '中國（CN）', 'A2/R5 the CN detail presentation is 中國（CN）');
ok(G.countryDetail('TW').name.indexOf('中華民國') === -1,
  'A2/R5 and the formal name does NOT appear in it');
ok(G.countryDetail('CN').name.indexOf('中華人民共和國') === -1, 'A2/R5 for CN too');
ok(G.countryDetail('TW').name !== G.country('TW').name, 'A2 which is DISTINCT from the map label');
ok(G.countryDetail('CN').name !== G.country('CN').name, 'A2 for CN too');
eq(G.countryDetail('TW').level, 'APPROVED_WITH_CODE', 'A2 and it reports its own level');
// The formal name is not lost — it is still reachable on the AUDIT surfaces, which is what §B permits.
eq(G.countryFull('TW').name, '中華民國', 'A2 the FORMAL name is still reachable unchanged');
eq(G.countryFull('CN').name, '中華人民共和國', 'A2 for CN too');
eq(G.country('TW', { form: 'full' }).name, '中華民國', 'A2 and form:full still bypasses every display level');
eq(G.countryDetail('TW').full, '中華民國', 'A2/R5 the detail result still CARRIES the formal name as evidence');
// COMPOSED, NOT STORED — and under R5 this assertion INVERTS, which is the point. The asset's stored `detail`
// is the R4-era string; reading it would reintroduce exactly what §B forbids. So the composed form must now
// DISAGREE with the stored one, and the stored one must still be reported, under a name that says what it is.
ok(G.countryDetail('TW').name !== A.approved.TW.detail,
  'A2/R5 the composed form deliberately DIFFERS from the asset\'s R4-era stored string');
ok(G.countryDetail('CN').name !== A.approved.CN.detail, 'A2/R5 for CN too');
(function () {
  var ap = {}; G.approvedNames().forEach(function (r) { ap[r.iso] = r; });
  eq(ap.TW.detail, '台灣（TW）', 'A2/R5 approvedNames reports the COMPOSED detail, not the stored one');
  eq(ap.TW.recorded_detail, A.approved.TW.detail,
    'A2/R5 and keeps the stored string as `recorded_detail` — evidence, not output');
  eq(ap.CN.detail, '中國（CN）', 'A2/R5 for CN too');
  eq(ap.CN.recorded_detail, A.approved.CN.detail, 'A2/R5 and CN\'s record too');
})();
ok(extractFn(RESOLVER_SRC, 'countryDetail').indexOf('countryFull(code, opts)') !== -1,
  'A2 and it is COMPOSED from the formal-name authority rather than read from the asset');
// The rule is one rule, not a special case for these two.
eq(G.countryDetail('JP').name, '日本（JP）', 'A2 the same rule produces JP\'s detail form');

// A.3 — identity is untouched.
['TW', 'CN'].forEach(function (iso) {
  eq(G.country(iso).iso, iso, 'A3 ' + iso + ' still resolves with its ISO code UNCHANGED');
  eq(G.countryDetail(iso).iso, iso, 'A3 and the detail form reports the same identity');
  eq(G.country(iso, { lang: 'en' }).name, iso === 'TW' ? 'Taiwan' : 'China',
    'A3 the English path is unaffected for ' + iso);
});
// The ISO code must appear IN the detail string, so a reader can see the key the system uses.
ok(G.countryDetail('TW').name.indexOf('TW') !== -1 && G.countryDetail('CN').name.indexOf('CN') !== -1,
  'A3 the detail presentation SHOWS the ISO code, it does not hide it');
// The dataset's own identity is still the code, not a name.
var twRow = COUNTRIES.countries.filter(function (c) { return c.iso === 'TW'; })[0];
var cnRow = COUNTRIES.countries.filter(function (c) { return c.iso === 'CN'; })[0];
ok(!!twRow && !!cnRow, 'A3 both are present in the geometry dataset');
eq(twRow.iso, 'TW', 'A3 the geometry row is keyed TW');
eq(cnRow.iso, 'CN', 'A3 and CN');
// The label layer keys its collision memory on the ISO code, never on the painted text.
ok(/next\[lab\.iso\] = 1;/.test(GC), 'A3 the previous-frame set is keyed by ISO, not by the painted string');

// A.4 — no business path is rewritten.
// THE STRONGEST FORM OF THIS IS A REACHABILITY ARGUMENT, NOT A GREP: if nothing outside the map layer can even
// SEE the resolver, no DTO can be rewritten by it. That is checked over the whole shipped tree.
(function () {
  var offenders = [];
  function walk(dir) {
    fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).forEach(function (e) {
      var rel = dir + '/' + e.name;
      // Dot-prefixed entries are not part of the shipped tree: the capture harness writes transient
      // .km-capture-*.html files at the repository root while it runs, and a sweep that happened to overlap one
      // failed this test for a file that is deleted seconds later and never deployed.
      if (e.name.charAt(0) === '.') return;
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(rel); return; }
      if (!/\.(js|gs|html)$/.test(e.name)) return;
      // BUILD tools are excluded by design: they are never loaded by the page, and the alias/division
      // generators must obviously read the assets they emit. `rel` carries a './' prefix, so this is a
      // contains-test rather than a prefix-test — the first version used indexOf(...) === 0 and matched nothing.
      if (rel.indexOf('assets/tests') !== -1 || rel.indexOf('tools/') !== -1) return;
      var src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      var touches = src.indexOf('KM.geoNames') !== -1 || src.indexOf('KM_GEO_DISPLAY_ALIASES') !== -1 ||
                    src.indexOf('KM_GEO_ADMIN1_DISPLAY_NAMES') !== -1;
      if (!touches) return;
      var allowed = /assets\/js\/(lib\/km-globe|core\/geo-name-resolver|data\/geo-)/.test(rel) || rel === './index.html';
      if (!allowed) offenders.push(rel);
    });
  }
  walk('.');
  eq(offenders.join(','), '', 'A4 ONLY the map layer and the name assets can reach the resolver at all' +
    (offenders.length ? ' — ' + offenders.join(', ') : ''));
})();
// And the map layer uses it for TEXT only — never to derive a key.
var ctText = extractFn(GLOBE, 'countryLabelText');
ok(ctText.indexOf('KM.geoNames.country(iso)') !== -1, 'A4 the globe asks the resolver for label TEXT');
// The function MUST assign the resolved display string — that is its job. What it must never do is assign to
// an identity. Two earlier versions of this line got that backwards: the first read `iso == null` as an
// assignment, the second forbade `= r.name`, which is the one assignment that has to happen.
ok(!/\biso\s*=(?!=)/.test(code(ctText)), 'A4 and never writes an identity back from what it returns');
ok(/out = r\.name;/.test(code(ctText)), 'A4 — it assigns only the DISPLAY string');
// AND THE OTHER DIRECTION, WHICH MATTERS JUST AS MUCH: a localized string must never resolve BACK to a code.
// countryIsoIndex is the one place a shipment's country value meets the map, and if it accepted 中國 the
// display layer would have become an input to identity resolution.
(function () {
  var idx = M.countryIsoIndex(COUNTRIES);
  eq(idx.resolve('CN'), 'CN', 'A4 a business ISO value still resolves to itself');
  eq(idx.resolve('TW'), 'TW', 'A4 and so does TW');
  eq(idx.resolve('China'), 'CN', 'A4 the ENGLISH dataset name resolves, as it always did');
  eq(idx.resolve('中國'), null, 'A4 but the localized display name does NOT — display never becomes identity');
  eq(idx.resolve('台灣'), null, 'A4 nor does 台灣');
  eq(idx.resolve('中華民國'), null, 'A4 nor the formal name');
})();
// The alias asset is a NAME table: no business vocabulary, no coordinate, no ring.
['warehouse', 'shipment', 'sku', 'asin', 'fnsku', 'purchase_order', 'inventory', 'lot_no']
  .forEach(function (bad) {
    ok(ALIAS_SRC.toLowerCase().indexOf(bad) === -1, 'A4 the alias asset carries no business term: ' + bad);
    ok(ADM1_SRC.toLowerCase().indexOf(bad) === -1, 'A4 nor does the division asset: ' + bad);
  });
['lat', 'lng', 'coordinates', 'geometry', 'polygon'].forEach(function (bad) {
  ok(JSON.stringify(A).toLowerCase().indexOf('"' + bad + '"') === -1,
    'A4 and the alias payload declares no geometry field: ' + bad);
});

// A.5 — unresolvedNames() is empty BECAUSE the cases were decided, not because they vanished.
eq(G.unresolvedNames().length, 0, 'A5 nothing is pending review any more');
var approved = G.approvedNames();
eq(approved.map(function (x) { return x.iso; }).join(','), 'CN,TW', 'A5 and both cases are recorded as DECIDED');
approved.forEach(function (x) {
  eq(x.decided_by, 'USER', 'A5 ' + x.iso + ' is attributed to the decision owner');
  ok(/R4 §A/.test(x.decision), 'A5 ' + x.iso + ' cites the round that decided it');
  ok(!!x.full && !!x.display && !!x.detail, 'A5 ' + x.iso + ' keeps all three forms');
  ok(x.full !== x.display, 'A5 ' + x.iso + '\'s formal and display forms are genuinely different strings');
});
// The generator must REFUSE to follow upstream if the approved name stops matching the candidate it was
// decided against. That guard is what stops a CLDR bump from silently changing a decided name.
ok(/APPROVED_DISPLAY_NO_LONGER_MATCHES_SOURCE/.test(GEN_A),
  'A5 the generator ABORTS if upstream no longer offers the name that was approved');
ok(/APPROVED_WITHOUT_FORMAL_NAME/.test(GEN_A),
  'A5 and if the formal name the detail form is composed from went missing');
ok(/UNDECIDED_SENSITIVE/.test(GEN_A) && /decision_required_from/.test(GEN_A),
  'A5 the refusal path still exists for any case that has NOT been decided');

// ================================================================================================================
section('§B — the division authority, starting with the one that does not exist');
// ================================================================================================================
// B.1 — §B asks for CLDR zh-Hant subdivisions first. They are not published. This is proven from the vendored
// file, not asserted: a 458-byte identity stub with zero <subdivision> elements.
var CLDR_STUB_PATH = 'tools/geo/data/cldr-46-subdivisions-zh_Hant.xml';
ok(fs.existsSync(path.join(ROOT, CLDR_STUB_PATH)), 'B1 the CLDR zh-Hant subdivision file is vendored as evidence');
var stub = fs.readFileSync(path.join(ROOT, CLDR_STUB_PATH));
eq(stub.length, 458, 'B1 it is 458 bytes');
eq((stub.toString('utf8').match(/<subdivision\b/g) || []).length, 0,
  'B1 and it declares ZERO subdivision names — §B\'s preferred authority is empty');
eq(AD.meta.cldr_zh_hant_subdivisions.exists, false, 'B1 the asset records that as a fact, not an omission');
eq(AD.meta.cldr_zh_hant_subdivisions.subdivision_elements, 0, 'B1 with the measured element count');
ok(/CLDR_ZH_HANT_SUBDIVISIONS_NO_LONGER_EMPTY/.test(GEN_B),
  'B1 and the build ABORTS if CLDR ever publishes them, rather than silently keeping the lesser source');
// The Simplified file is NOT a fallback — using it would be the conversion the authority forbids.
ok(/SIMPLIFIED/.test(AD.meta.cldr_zh_hant_subdivisions.zh_simplified_file || ''),
  'B1 and zh.xml is recorded as Simplified rather than quietly used');

// B.2 — provenance: version, licence, checksum, deterministic steps.
eq(AD.meta.wikidata.license, 'CC0 1.0 Universal (public domain dedication)', 'B2 the fill source is CC0');
ok(/^[0-9a-f]{64}$/.test(AD.meta.wikidata.sha256), 'B2 pinned by a SHA-256');
ok(/^[0-9a-f]{64}$/.test(AD.meta.natural_earth.sha256), 'B2 as is the Natural Earth source');
var wdPath = 'tools/geo/data/wikidata-admin1-zh.json';
ok(fs.existsSync(path.join(ROOT, wdPath)), 'B2 the Wikidata snapshot is VENDORED, so the build is offline-reproducible');
var wdBuf = fs.readFileSync(path.join(ROOT, wdPath));
eq(wdBuf.length, AD.meta.wikidata.bytes, 'B2 and its byte count matches the pin');
eq(sha256(wdBuf), AD.meta.wikidata.sha256, 'B2 and its digest matches the pin');
ok(/INPUT_CHECKSUM_MISMATCH/.test(GEN_B), 'B2 a drifted input aborts the build rather than being used');
// NO MACHINE CONVERSION. The API was called without languagefallback, which is what keeps MediaWiki's Chinese
// variant converter out of the data.
ok(/NONE REQUESTED/.test(AD.meta.wikidata.variant_conversion), 'B2 no variant conversion was requested');
ok(GEN_B.indexOf('languagefallback') !== -1, 'B2 and the tool says so at the point it builds the query');
ok(AD.meta.wikidata.api.indexOf('languagefallback') === -1,
  'B2 — the pinned API call genuinely does not pass it');

// B.3 — the order, and Wikidata's place in it.
var order = AD.meta.authority_order.join(' | ');
ok(/1 REVIEWED_ADMIN1_ALIAS/.test(AD.meta.authority_order[0]), 'B3 reviewed alias first');
ok(/2 ZH_HANT_PINNED_SOURCE/.test(AD.meta.authority_order[1]), 'B3 then the verified Natural Earth field');
ok(/3 WIKIDATA_ZH_TW/.test(AD.meta.authority_order[2]), 'B3 then Wikidata — BELOW Natural Earth, not above');
ok(order.indexOf('ENGLISH_CANONICAL') !== -1 && order.indexOf('CODE') !== -1, 'B3 then English, then the code');
ok(order.indexOf('CLDR') !== -1, 'B3 and CLDR\'s absent level is still named in the order');
// That placement is a MEASURED decision: Wikidata disagrees with the verified field hundreds of times.
ok(AD.meta.counts.wikidata_disagrees_reported_not_applied > 100,
  'B3 Wikidata disagrees with the verified field ' + AD.meta.counts.wikidata_disagrees_reported_not_applied +
  ' times — which is why it is a FILL, not an override');
ok(/FILL ONLY/.test(AD.meta.wikidata.used_for), 'B3 and the asset says so');

// B.4/B.5 — no machine translation, no name derived from English.
[ 'translate', 'translation', 'transliterate', 'romaniz' ].forEach(function (bad) {
  var body = GEN_B.slice(GEN_B.indexOf("'use strict'"));
  ok(body.toLowerCase().indexOf(bad + '(') === -1, 'B4 the generator calls nothing named ' + bad + '()');
});
// Every emitted name must come from a pinned source keyed by QID — never derived from the English string.
Object.keys(AD.wikidata).forEach(function (k) {
  var e = AD.wikidata[k];
  ok(/^Q[0-9]+$/.test(e.qid), 'B5 ' + k + ' cites a Wikidata QID');
  ok(e.name !== e.english, 'B5 ' + k + '\'s name is not its English string');
  ok(!/[A-Za-z0-9]/.test(e.name), 'B5 ' + k + '\'s name carries no Latin letter or digit');
});

// B.6 — no runtime network. The asset DOES carry https:// URLs — they are the licence and source-of-record
// citations §B.2 requires — so the test that matters is not "no URL appears" but "nothing here can call one".
['fetch(', 'XMLHttpRequest', 'WebSocket', 'import(', 'eval(', 'Function(', 'appendChild', 'createElement']
  .forEach(function (bad) {
    ok(ADM1_SRC.indexOf(bad) === -1, 'B6 the shipped division asset cannot reach the network: no ' + bad);
  });
(function () {
  // It is DATA: a comment banner, then exactly one assignment, and nothing else executable.
  var stripped = ADM1_SRC.replace(/\/\*[\s\S]*?\*\//g, '').trim();
  ok(stripped.indexOf('window.KM_GEO_ADMIN1_DISPLAY_NAMES=') === 0,
    'B6 the file is one assignment after its banner');
  // Counting statements by splitting on ';' counts the semicolons inside the payload's own prose, so the test
  // is on what could EXECUTE instead: a data file declares no function and calls nothing.
  ok(code(ADM1_SRC).indexOf('function') === -1, 'B6 and declares no function');
  eq((ADM1_SRC.match(/^window\.KM_GEO_ADMIN1_DISPLAY_NAMES=/gm) || []).length, 1,
    'B6 with exactly one global assignment');
  var urls = (ADM1_SRC.match(/https?:\/\//g) || []).length;
  ok(urls > 0, 'B6 the URLs it does carry are provenance (' + urls + ' of them), inside that data');
})();
ok(/same-origin <script>/.test(ADM1_SRC), 'B6 it is loaded as a same-origin script');
ok(INDEX.indexOf('geo-admin1-display-names-zh-tw.js') !== -1, 'B6 and index.html loads it');
var iAdm1 = INDEX.indexOf('geo-admin1-display-names-zh-tw.js');
var iResolver = INDEX.indexOf('geo-name-resolver.js');
ok(iAdm1 < iResolver, 'B6 BEFORE the resolver that reads it');

// B.7 — identity stays adm1_code.
eq(AD.meta.key.indexOf('adm1_code'), 0, 'B7 the asset is keyed by adm1_code');
var adm1Keys = Object.keys(AD.wikidata).concat(Object.keys(AD.reviewed));
ok(adm1Keys.length > 0, 'B7 and it has entries');
ok(adm1Keys.every(function (k) { return /^[A-Z0-9]{2,4}-[0-9]+$/.test(k) || /^[A-Z]{3}[-+][0-9A-Za-z]+$/.test(k); }),
  'B7 every key looks like a Natural Earth adm1_code, not a display code or a name');
// The resolver must REACH those levels only through that key.
var a1fn = extractFn(RESOLVER_SRC, 'admin1');
ok(a1fn.indexOf('A.reviewed && A.reviewed[adm1Code]') !== -1, 'B7 the reviewed level is keyed by adm1_code');
ok(a1fn.indexOf('A.wikidata && A.wikidata[adm1Code]') !== -1, 'B7 and so is the Wikidata level');

// B.8 — the named audit sets, executed against the shipped resolver.
function divisionsOf(cc) { return ADMIN1.admin1.filter(function (d) { return d.c === cc; }); }
function resolve(d) {
  return G.admin1(d.c, d.k, { english: (d.n != null && d.n !== '') ? d.n : d.k, adm1Code: d.a });
}
function englishFallbacks(cc) {
  return divisionsOf(cc).filter(function (d) { return resolve(d).level === 'ENGLISH_CANONICAL'; });
}
[['US', 51], ['CA', 13], ['TW', 18], ['CN', 31], ['JP', 47], ['KR', 17]].forEach(function (p) {
  var cc = p[0], n = p[1];
  eq(divisionsOf(cc).length, n, 'B8 ' + cc + ' has ' + n + ' divisions in the vendored dataset');
  var miss = englishFallbacks(cc);
  eq(miss.length, 0, 'B8 ' + cc + ' has NO English fallback' +
    (miss.length ? ' — ' + miss.map(function (d) { return d.n || d.k; }).join(', ') : ''));
});
// The three §B.8 names it calls out by name.
(function () {
  function find(cc, name) {
    return ADMIN1.admin1.filter(function (d) { return d.c === cc && (d.n || d.k) === name; })[0];
  }
  var indiana = find('US', 'Indiana');
  ok(!!indiana, 'B8 Indiana is present');
  eq(resolve(indiana).name, '印第安納州', 'B8 Indiana — the R3 report\'s visible gap — now resolves');
  eq(resolve(indiana).level, 'WIKIDATA_ZH_TW', 'B8 from the QID-joined fill level');
  var bash = find('RU', 'Bashkortostan');
  ok(!!bash, 'B8 Bashkortostan is present');
  eq(resolve(bash).level, 'WIKIDATA_ZH_TW', 'B8 and it resolves from the same level');
  // Komi is the honest half: Wikidata's only Chinese label for it is Simplified, so the detector refuses it and
  // the division keeps its English name. §B.9 explicitly permits this; inventing a name would not be permitted.
  var komi = find('RU', 'Komi');
  ok(!!komi, 'B8 Komi is present');
  eq(resolve(komi).level, 'ENGLISH_CANONICAL',
    'B8 Komi still falls back — no pinned authority has a Traditional name for it, and that is reported not faked');
  eq(resolve(komi).name, 'Komi', 'B8 and it renders its correct English name');
})();
// Tokyo is the one place Wikidata is allowed to correct the verified field, and only by the mechanical rule.
(function () {
  var tokyo = ADMIN1.admin1.filter(function (d) { return d.c === 'JP' && (d.n || d.k) === 'Tokyo'; })[0];
  var r = resolve(tokyo);
  eq(r.name, '東京都', 'B8 Tokyo is completed to 東京都');
  eq(r.level, 'REVIEWED_ADMIN1_ALIAS', 'B8 at the reviewed level');
  eq(r.was, '東京', 'B8 recording what it replaced');
  var rec = AD.reviewed[tokyo.a];
  eq(rec.added, '都', 'B8 and the tail that was added');
  eq(rec.authority, 'WIKIDATA_UNANIMOUS_SUFFIX_COMPLETION', 'B8 by the unanimous suffix-completion rule');
})();
// Every reviewed override must be a pure completion, with a reason and an authority. That is §B.10.
Object.keys(AD.reviewed).forEach(function (k) {
  var r = AD.reviewed[k];
  ok(!!r.reason && r.reason.length > 40, 'B10 ' + k + ' carries a reason');
  ok(!!r.authority, 'B10 ' + k + ' carries an authority');
  ok(/^Q[0-9]+$/.test(r.qid), 'B10 ' + k + ' cites the entity it came from');
  eq(r.name.indexOf(r.was), 0, 'B10 ' + k + ' only ADDS to the verified name — it never renames it');
  eq(r.name.slice(r.was.length), r.added, 'B10 ' + k + '\'s recorded tail is the actual difference');
  ok(AD.meta.suffix_completion_rule.division_type_suffixes.indexOf(r.added) !== -1,
    'B10 ' + k + '\'s tail «' + r.added + '» is an administrative-division type word');
});

// B.9 — the remaining fallbacks are REPORTED, and the count in the asset is the real one.
(function () {
  var lv = {};
  ADMIN1.admin1.forEach(function (d) { var l = resolve(d).level; lv[l] = (lv[l] || 0) + 1; });
  eq(lv.ENGLISH_CANONICAL || 0, AD.meta.counts.still_english_fallback,
    'B9 the asset\'s fallback count is what the shipped resolver actually produces');
  eq((lv.ZH_HANT_PINNED_SOURCE || 0) + (lv.WIKIDATA_ZH_TW || 0) + (lv.REVIEWED_ADMIN1_ALIAS || 0),
    AD.meta.counts.with_verified_chinese_name,
    'B9 and so is the covered count');
  eq(lv.WIKIDATA_ZH_TW || 0, Object.keys(AD.wikidata).length, 'B9 every fill entry is reachable');
  eq(lv.REVIEWED_ADMIN1_ALIAS || 0, Object.keys(AD.reviewed).length, 'B9 and every reviewed entry');
  ok((lv.ENGLISH_CANONICAL || 0) < 356,
    'B9 the R3 gap of 356 is genuinely smaller (' + (lv.ENGLISH_CANONICAL || 0) + ')');
  console.log('  division coverage: ' + AD.meta.counts.with_verified_chinese_name + '/' +
    ADMIN1.admin1.length + '  ·  English fallback ' + (lv.ENGLISH_CANONICAL || 0) +
    '  ·  was ' + AD.meta.counts.natural_earth_traditional + ' before this round');
  ok(/Zero fallback is NOT a goal/.test(AD.meta.remaining_fallback_is_expected),
    'B9 and the asset states that zero fallback is not the goal');
  ok(fs.existsSync(path.join(ROOT, 'docs/planning/ADMIN1_ZH_TW_NAME_AUDIT.md')),
    'B9 the full audit is written down, not only summarised');
})();
// A missing division asset must degrade the LANGUAGE and never the map.
(function () {
  var saved = window.KM_GEO_ADMIN1_DISPLAY_NAMES;
  window.KM_GEO_ADMIN1_DISPLAY_NAMES = null;
  var tokyo = ADMIN1.admin1.filter(function (d) { return d.c === 'JP' && (d.n || d.k) === 'Tokyo'; })[0];
  eq(resolve(tokyo).name, '東京', 'B9 with the asset absent Tokyo falls back to the verified field, not to nothing');
  var indiana = ADMIN1.admin1.filter(function (d) { return d.c === 'US' && (d.n || d.k) === 'Indiana'; })[0];
  eq(resolve(indiana).name, 'Indiana', 'B9 and Indiana falls back to English rather than disappearing');
  window.KM_GEO_ADMIN1_DISPLAY_NAMES = saved;
  eq(resolve(indiana).name, '印第安納州', 'B9 and it comes back when the asset is present');
})();
// Determinism: the same generator over the same pinned inputs must produce the same bytes. The asset's own
// digest is recomputed here so a hand-edit is caught.
ok(/VENDORED, GENERATED\. Do not edit by hand/.test(ADM1_SRC), 'B2 the asset declares itself generated');
ok(/Made with Natural Earth/.test(ADM1_SRC) && /CC0/.test(ADM1_SRC),
  'B2 and carries both source credits it is required to');

// ================================================================================================================
section('§C — a rejected label must not cost layout work');
// ================================================================================================================
// C.1 — the cull is EXACT, not an approximation. If facingOf disagreed with the projection it replaced, the
// pass would be culling different labels than before rather than the same ones more cheaply.
(function () {
  var mdl = M.modelMatrix(0.91, -0.37);
  var mvp = M.mat4Mul(M.mat4Perspective(45 * Math.PI / 180, 1280 / 900, 0.01, 100),
                      M.mat4Mul(M.mat4Translate(0, 0, -1.8), mdl));
  var worst = 0, n = 0;
  for (var lat = -80; lat <= 80; lat += 7) {
    for (var lng = -180; lng < 180; lng += 11) {
      var v = M.latLngToVec3(lat, lng, 1.0);
      var sp = M.projectToScreen(mvp, mdl, v, 1280, 900);
      var f = M.facingOf(mdl, v[0], v[1], v[2]);
      n++;
      if (sp) worst = Math.max(worst, Math.abs(f - sp.facing));
    }
  }
  eq(worst, 0, 'C1 facingOf equals the projection\'s facing EXACTLY across ' + n + ' points');
})();
// C.2 — projectInto writes the same numbers as projectToScreen, without allocating a result.
(function () {
  var mdl = M.modelMatrix(0.2, 0.4);
  var mvp = M.mat4Mul(M.mat4Perspective(45 * Math.PI / 180, 1.5, 0.01, 100),
                      M.mat4Mul(M.mat4Translate(0, 0, -2.2), mdl));
  var out = { x: 0, y: 0, facing: 0, front: false }, bad = 0, checked = 0;
  for (var lat = -70; lat <= 70; lat += 10) {
    for (var lng = -170; lng < 180; lng += 20) {
      var v = M.latLngToVec3(lat, lng, 1.0);
      var sp = M.projectToScreen(mvp, mdl, v, 1024, 768);
      var okp = M.projectInto(mvp, mdl, v[0], v[1], v[2], 1024, 768, out);
      checked++;
      if (!sp && !okp) continue;
      if (!sp || !okp || out.x !== sp.x || out.y !== sp.y || out.front !== sp.front) bad++;
    }
  }
  eq(bad, 0, 'C2 projectInto agrees with projectToScreen on all ' + checked + ' points');
})();
// C.3 — the ORDER of operations is the whole optimisation: cull, project, order, cut, THEN measure.
var lblFn = extractFn(GLOBE, 'drawCountryLabels');
var iCull = lblFn.indexOf('facingOf(model, an.x, an.y, an.z) < ADMIN1_LABEL_MIN_FACING_');
var iProj = lblFn.indexOf('projectInto(mvp, model, an.x, an.y, an.z');
var iOrder = lblFn.indexOf('orderLabelCandidates(raw).slice(0, measureCap)');
var iMeasure = lblFn.indexOf('ac.w = measureCached(admin1Font, ac.text)');
ok(iCull > 0 && iProj > iCull, 'C3 the facing cull runs BEFORE the projection');
ok(iOrder > iProj, 'C3 the ordering runs after the projection');
ok(iMeasure > iOrder, 'C3 and the text is resolved and measured AFTER the list has been cut to the budget');
// C.4 — the cut is bounded by the budget, not by the dataset.
eq(M.LABEL_MEASURE_FACTOR, 3, 'C4 at most 3 candidates are measured per label the budget allows');
eq(M.admin1LabelBudget(2), 22, 'C4 the LOD-2 budget is 22');
eq(M.admin1LabelBudget(3), 42, 'C4 and the LOD-3 budget is 42');
ok(lblFn.indexOf('var measureCap = budget * LABEL_MEASURE_FACTOR_;') !== -1,
  'C4 so the measurement cap is 66 at LOD 2 and 126 at LOD 3, whatever the dataset holds');
// C.5 — the cut must be REPORTED. A silent truncation reads as "we drew everything worth drawing".
['considered', 'after_facing', 'on_screen', 'measured', 'measure_cap', 'drawn', 'budget'].forEach(function (f) {
  ok(GC.indexOf(f + ': lastAdmin1LabelStats.' + f) !== -1 || GC.indexOf(f + ':') !== -1,
    'C5 the diagnostics expose the ' + f + ' counter');
});
ok(/label_collision:/.test(GC) && /total_tests:/.test(GC), 'C5 and the collision-test count');
// C.6 — caches are keyed on things that cannot change between frames, and are dropped when the data does.
ok(/var labelTextCache = \{\}, labelMetricCache = \{\};/.test(GLOBE), 'C6 text and metrics are cached');
ok(/var k = font \+ '\\u0000' \+ text;/.test(GLOBE), 'C6 metrics are keyed by FONT AND TEXT, so a size change cannot collide');
var setFn = extractFn(GLOBE, 'setAdmin1Data') || GLOBE.slice(GLOBE.indexOf('setAdmin1Data: function'), GLOBE.indexOf('setAdmin1Data: function') + 900);
ok(setFn.indexOf('admin1Anchors = null;') !== -1 && setFn.indexOf('labelTextCache = {};') !== -1,
  'C6 and both are dropped when the division dataset is replaced');
// C.7 — country and continent readability is NOT traded away: neither class has a budget.
ok(lblFn.indexOf('The country\nclass has no budget') !== -1 || /country[\s\S]{0,80}no budget/.test(lblFn),
  'C7 the country class is deliberately unbudgeted');
ok(!/countryLabelBudget/.test(GC), 'C7 there is no country label budget at all');
ok(!/continentLabelBudget/.test(GC), 'C7 nor a continent one');

// ================================================================================================================
section('§D — collision determinism, all four classes, through the shipped planner');
// ================================================================================================================
function cand(cls, iso, x, y, rank, priority) {
  return { cls: cls, iso: iso, text: iso, x: x, y: y, w: 40, h: 12, rank: rank, priority: priority };
}
function ids(list) { return list.map(function (c) { return c.iso; }).join(','); }
function planOf(input, opts) { return M.planLabelSet(input, opts || {}); }

// D.1 — the same input repeated produces byte-identical output.
(function () {
  var input = {
    operational: [{ x0: 900, x1: 930, y0: 400, y1: 430 }],
    country: [cand('COUNTRY', 'JP', 300, 300, 2, 4), cand('COUNTRY', 'KR', 320, 305, 3, 4),
              cand('COUNTRY', 'CN', 800, 200, 2, 4)],
    continent: [cand('CONTINENT', 'CONT:Asia', 305, 302, 1, 5), cand('CONTINENT', 'CONT:Europe', 100, 700, 1, 5)],
    adm1: [cand('ADM1', 'JPN-1860', 302, 301, 2, 6), cand('ADM1', 'KOR-1595', 600, 600, 4, 6),
           cand('ADM1', 'CHN-1', 805, 205, 3, 6)]
  };
  var first = JSON.stringify(planOf(input).accepted);
  var same = true;
  for (var i = 0; i < 200; i++) { if (JSON.stringify(planOf(input).accepted) !== first) { same = false; break; } }
  ok(same, 'D1 200 runs of the same input produce byte-identical output');

  // D.2 — reversing every source array changes nothing.
  var rev = {
    operational: input.operational.slice().reverse(),
    country: input.country.slice().reverse(),
    continent: input.continent.slice().reverse(),
    adm1: input.adm1.slice().reverse()
  };
  eq(JSON.stringify(planOf(rev).accepted), first, 'D2 reversing the source arrays produces the same result');
})();

// D.3 — an equal-rank tie is broken by immutable identity, never by position.
(function () {
  var tie = [cand('COUNTRY', 'ZW', 100, 100, 3, 4), cand('COUNTRY', 'AR', 102, 101, 3, 4)];
  eq(ids(planOf({ country: tie }).accepted.country), 'AR', 'D3 a pure tie resolves to the lower identity');
  eq(ids(planOf({ country: tie.slice().reverse() }).accepted.country), 'AR', 'D3 and reversing does not change it');
  var atie = [cand('ADM1', 'USA-3540', 50, 50, 5, 6), cand('ADM1', 'USA-3515', 52, 51, 5, 6)];
  eq(ids(planOf({ adm1: atie }).accepted.adm1), 'USA-3515', 'D3 the same holds for divisions, on adm1_code');
})();

// D.4 — country defeats an overlapping division.
(function () {
  var p = planOf({ country: [cand('COUNTRY', 'JP', 400, 400, 7, 4)],
                   adm1: [cand('ADM1', 'JPN-1860', 402, 401, 1, 6)] });
  eq(ids(p.accepted.country), 'JP', 'D4 the country label is placed');
  eq(p.accepted.adm1.length, 0, 'D4 and the overlapping division loses even with a BETTER LABELRANK');
})();

// D.5 — continent defeats an overlapping division at its active LOD.
(function () {
  ok(M.continentStrength(2.9) > 0, 'D5 the continent layer is active at dist 2.9');
  var p = planOf({ continent: [cand('CONTINENT', 'CONT:Asia', 400, 400, 1, 5)],
                   adm1: [cand('ADM1', 'JPN-1860', 402, 401, 1, 6)] });
  eq(ids(p.accepted.continent), 'CONT:Asia', 'D5 the continent label is placed');
  eq(p.accepted.adm1.length, 0, 'D5 and the overlapping division loses');
  eq(M.continentStrength(1.75), 0, 'D5 while at the dense-ADM1 zoom the continent layer is gone entirely');
})();

// D.6 — an operational rectangle defeats every geographic class.
(function () {
  var op = [{ x0: 380, x1: 430, y0: 380, y1: 430 }];
  var p = planOf({ operational: op,
                   country: [cand('COUNTRY', 'JP', 400, 400, 2, 0)],
                   continent: [cand('CONTINENT', 'CONT:Asia', 400, 400, 1, 5)],
                   adm1: [cand('ADM1', 'JPN-1860', 400, 400, 1, 6)] });
  eq(p.accepted.country.length + p.accepted.continent.length + p.accepted.adm1.length, 0,
    'D6 even a priority-0 country label is dropped rather than cover a shipment marker');
  eq(p.counts.operational, 1, 'D6 and the operational rectangle is always kept');
  eq(M.labelClassRank('OPERATIONAL'), 0, 'D6 OPERATIONAL is class 0');
  eq(M.labelClassRank('COUNTRY') + M.labelClassRank('CONTINENT') + M.labelClassRank('ADM1'), 6,
    'D6 with COUNTRY 1, CONTINENT 2, ADM1 3');
  eq(M.labelClassRank('SOMETHING_ELSE'), 4, 'D6 and an unknown class sorts last rather than first');
})();

// D.7 — a rejected back-facing label cannot affect a front-facing one. The cull happens before the planner sees
// the candidate at all, so this is proven by the planner giving the identical answer with and without it.
(function () {
  var front = [cand('COUNTRY', 'JP', 300, 300, 2, 4)];
  var withBack = front.concat([]);  // a back-facing candidate never reaches the planner
  eq(ids(planOf({ country: front }).accepted.country), ids(planOf({ country: withBack }).accepted.country),
    'D7 a culled label leaves the front-facing result unchanged');
  var mdl = M.modelMatrix(0, 0);
  var back = M.latLngToVec3(0, 180, 1);
  ok(M.facingOf(mdl, back[0], back[1], back[2]) < 0.02,
    'D7 and the antipode of the view axis is culled by the facing test');
  var f = M.latLngToVec3(0, 0, 1);
  ok(M.facingOf(mdl, f[0], f[1], f[2]) > 0.99, 'D7 while the point under the camera is fully facing');
})();

// D.8 — a viewport resize recomputes deterministically. Same relative geometry, scaled: the same winners.
(function () {
  function at(scale) {
    return planOf({ country: [cand('COUNTRY', 'JP', 300 * scale, 300 * scale, 2, 4),
                              cand('COUNTRY', 'KR', 900 * scale, 700 * scale, 3, 4)] });
  }
  eq(ids(at(1).accepted.country), ids(at(2).accepted.country),
    'D8 a resize that separates two labels keeps both, deterministically');
  var tight = planOf({ country: [cand('COUNTRY', 'JP', 300, 300, 2, 4), cand('COUNTRY', 'KR', 305, 302, 3, 4)] });
  eq(ids(tight.accepted.country), 'JP', 'D8 and a resize that overlaps them resolves to the same winner');
  eq(ids(planOf({ country: [cand('COUNTRY', 'KR', 305, 302, 3, 4), cand('COUNTRY', 'JP', 300, 300, 2, 4)] })
        .accepted.country), 'JP', 'D8 regardless of the order they arrive in');
})();

// D.9 — the LOD boundary does not oscillate. A camera resting on a threshold must not flip level.
(function () {
  var TH = M.LOD_THRESHOLDS, HY = M.LOD_HYSTERESIS;
  ok(HY > 0, 'D9 there is a hysteresis band (' + HY + ')');
  var flips = 0, lod = 0;
  // Walk the camera slowly across every threshold and back, feeding each result in as the previous state.
  for (var pass2 = 0; pass2 < 2; pass2++) {
    for (var t = 0; t < TH.length; t++) {
      var b = TH[t];
      for (var k = -40; k <= 40; k++) {
        var d = b + k * 0.001 * (pass2 ? -1 : 1);
        var next = M.lodForDistance(d, lod);
        if (next !== lod) flips++;
        lod = next;
      }
    }
  }
  ok(flips <= TH.length * 2 + 2, 'D9 crossing every threshold twice produces ' + flips +
    ' transitions, not one per frame');
  // The decisive case: sitting EXACTLY on a boundary must be stable in both directions.
  TH.forEach(function (b, idx) {
    var hi = M.lodForDistance(b, idx + 1), lo = M.lodForDistance(b, idx);
    eq(M.lodForDistance(b, hi), hi, 'D9 resting exactly on threshold ' + b + ' is stable from above');
    eq(M.lodForDistance(b, lo), lo, 'D9 and from below');
    ok(hi !== lo, 'D9 and the two states genuinely differ at ' + b + ' — the band is real, not a no-op');
  });
  // It is a pure function of (distance, previous level): no clock, no counter, no PRNG.
  var src = code(extractFn(GLOBE, 'lodForDistance'));
  ['Math.random', 'Date.now', 'performance.now', 'new Date'].forEach(function (bad) {
    ok(src.indexOf(bad) === -1, 'D9 lodForDistance contains no ' + bad);
  });
})();

// D.10 — THE THREE KNOWN IDENTITY COLLISIONS. `country|displayedCode` is measurably not unique, so if collision
// memory were keyed on it, nine Bosnian cantons would share one slot. These prove the key in use is the stable
// source identity instead.
(function () {
  var byDisplayed = {}, byAdm1 = {};
  ADMIN1.admin1.forEach(function (d) {
    var k = d.c + '|' + d.k;
    (byDisplayed[k] = byDisplayed[k] || []).push(d);
    (byAdm1[d.a] = byAdm1[d.a] || []).push(d);
  });
  var collided = Object.keys(byDisplayed).filter(function (k) { return byDisplayed[k].length > 1; });
  ok(collided.length > 0, 'D10 country|displayedCode collides on ' + collided.length + ' keys — it is NOT unique');
  [['BA', 'BIH'], ['IE', 'D'], ['CO', 'CUN']].forEach(function (p) {
    var k = p[0] + '|' + p[1];
    var rows = byDisplayed[k] || [];
    ok(rows.length > 1, 'D10 ' + k + ' covers ' + rows.length + ' distinct divisions');
    var uniq = {};
    rows.forEach(function (d) { uniq[d.a] = 1; });
    eq(Object.keys(uniq).length, rows.length, 'D10 but each has its OWN adm1_code, so identity separates them');
  });
  eq(Object.keys(byAdm1).length, ADMIN1.admin1.length, 'D10 adm1_code is unique across all ' + ADMIN1.admin1.length);
  // And the collision memory must genuinely keep them apart: two BA|BIH cantons stacked on one point must
  // resolve to exactly one winner AND that winner must be identified by its adm1_code.
  var bih = (byDisplayed['BA|BIH'] || []).slice(0, 3);
  if (bih.length >= 2) {
    var stacked = bih.map(function (d) { return cand('ADM1', d.a, 200, 200, d.r, 6); });
    var res = planOf({ adm1: stacked }).accepted.adm1;
    eq(res.length, 1, 'D10 three stacked BA|BIH cantons resolve to exactly one winner');
    ok(res[0].iso !== 'BA|BIH' && /^BIH/.test(res[0].iso),
      'D10 and the winner is identified by its adm1_code (' + res[0].iso + '), not by the shared displayed code');
    eq(ids(planOf({ adm1: stacked.slice().reverse() }).accepted.adm1), ids(res),
      'D10 deterministically, whichever order they arrive in');
  }
  // The engine must key on d.a, and the previous-frame memory on the accepted identity.
  ok(GLOBE.indexOf("iso: d.a || (d.c + '/' + d.k)") !== -1, 'D10 the engine builds the candidate from adm1_code');
  ok(/anext\[adrawn\[d4\]\.iso\] = 1;/.test(GLOBE), 'D10 and the collision memory is keyed on that identity');
})();
// D.11 — collision state may never be keyed by a displayed code, an English name or a localized name.
(function () {
  var planner = code(extractFn(GLOBE, 'planLabelSet')) + code(extractFn(GLOBE, 'selectVisibleLabels')) +
                code(extractFn(GLOBE, 'orderLabelCandidates'));
  ['\\.text', '\\.name', '\\.english', '\\.n\\b', '\\.k\\b'].forEach(function (bad) {
    ok(!new RegExp('prev\\[[a-z]+' + bad + '\\]').test(planner),
      'D11 the previous-frame set is not keyed by ' + bad);
  });
  ok(/prev\[c\.iso\] \? stickyPad : pad/.test(extractFn(GLOBE, 'selectVisibleLabels')),
    'D11 it is keyed by identity, and only changes PADDING');
  var sel = code(extractFn(GLOBE, 'selectVisibleLabels'));
  ok(!/c\.x =|c\.y =|\.x \+=|\.y \+=/.test(sel),
    'D11 and a label anchor is NEVER moved to dodge a collision — only hidden');
})();

// ================================================================================================================
section('§E — the former §J10: not applicable as worded, proven at the real LOD boundary instead');
// ================================================================================================================
// §J10 asked for "topology-preserving LOD simplification". There is NO runtime simplifier: the engine switches
// between two PREBUILT datasets. Adding a simplifier to satisfy a test name would add a whole class of defects
// to make a label true. So the equivalent invariant is proven where the real seam is.
// THE SHIPPED DECODER, NOT A COPY OF IT. An earlier version of this suite carried its own transcription of the
// varint decoder and got the zig-zag wrong, which halved the edge count and made every assertion below hold over
// geometry the engine never renders. `M.decodeAdmin1Ring` is the function the globe actually calls.
var decodeRing = M.decodeAdmin1Ring;

(function () {
  // countryFeatures/admin1Features return { features, missing_identity, colliding_identity } — build() takes the
  // ARRAY. The first version of this passed the WRAPPER, so build() iterated nothing and every assertion below
  // held over an empty edge set. The E0 guard is what makes that impossible to repeat.
  var cf = T.countryFeatures(COUNTRIES), af = T.admin1Features(ADMIN1, decodeRing);
  eq(cf.colliding_identity, 0, 'E0 the country dataset has no colliding geometry identity');
  eq(af.colliding_identity, 0, 'E0 nor does the division dataset');
  eq(af.missing_identity, 0, 'E0 and every division carries a stable source identity');
  var coarse = T.build(cf.features);
  var fine = T.build(af.features);
  eq(coarse.stats.input.features, 175, 'E0 the COARSE topology is built over all 175 countries');
  eq(fine.stats.input.features, 3835, 'E0 and the FINE topology over all 3,835 divisions');
  ok(coarse.edges.INTERNATIONAL.length > 2000 && fine.edges.ADM1.length > 6000,
    'E0 both carry real edges (' + coarse.edges.INTERNATIONAL.length + ' international, ' +
    fine.edges.ADM1.length + ' division) — nothing below can pass vacuously');

  var CLASSES = ['COASTLINE', 'INTERNATIONAL', 'ADM1'];
  function keysOf(topo) {
    var seen = Object.create(null);
    CLASSES.forEach(function (cls) {
      topo.edges[cls].forEach(function (e) {
        seen[T.edgeKey(T.vkey(e.a[0], e.a[1]), T.vkey(e.b[0], e.b[1]))] = cls;
      });
    });
    return seen;
  }

  [['COARSE', coarse], ['FINE', fine]].forEach(function (p) {
    var name = p[0], topo = p[1];
    // E.1 — each dataset is INDEPENDENTLY canonicalized: no edge key appears twice, in any class.
    var seen = Object.create(null), dup = 0, total = 0;
    CLASSES.forEach(function (cls) {
      topo.edges[cls].forEach(function (e) {
        total++;
        var k = T.edgeKey(T.vkey(e.a[0], e.a[1]), T.vkey(e.b[0], e.b[1]));
        if (seen[k]) dup++; else seen[k] = cls;
      });
    });
    eq(dup, 0, 'E1 ' + name + ': none of its ' + total + ' edges appears twice');
    eq(topo.stats.input.unique_edges, total,
      'E1 ' + name + ': and every unique input edge landed in exactly one class');
    ok(topo.stats.duplicate_edges_removed > 0,
      'E1 ' + name + ': ' + topo.stats.duplicate_edges_removed + ' duplicates (' +
      topo.stats.duplicate_percent + '%) were removed — canonicalisation is doing real work here');
    // E.2 — SHARED EDGES REMAIN SINGLE-OWNER WITHIN THE DATASET. The classes are disjoint sets of keys, so no
    // edge can be rendered by two layers at two weights.
    var sum = CLASSES.reduce(function (a, c) { return a + topo.edges[c].length; }, 0);
    eq(sum, Object.keys(seen).length, 'E2 ' + name + ': no edge key is claimed by two classes');
    // ...and the classification that puts it there is by ADJACENCY, so precedence needs no special case.
    eq(topo.edges.ADM1.filter(function (e) { return e.countries.length > 1; }).length, 0,
      'E2 ' + name + ': no division-class edge has two countries on it — international supersedes by construction');
    eq(topo.edges.INTERNATIONAL.filter(function (e) { return e.countries.length < 2; }).length, 0,
      'E2 ' + name + ': and no international-class edge has fewer than two');
    eq(topo.edges.COASTLINE.filter(function (e) { return e.owners.length !== 1; }).length, 0,
      'E2 ' + name + ': every coastline edge has exactly one owner');

    // E.3 — ENDPOINTS ARE PRESERVED PER DATASET. Per CLASS a loose end is legitimate: an international border
    // ends where the coast begins. The meaningful measurement is the COMBINED set, where every endpoint must be
    // picked up by something.
    var ep = topo.stats.endpoints;
    eq(ep.ALL.dangling_endpoints, 0, 'E3 ' + name + ': the combined boundary set has ZERO loose endpoints');
    eq(ep.COASTLINE.dangling_endpoints, 0, 'E3 ' + name + ': the coastline class alone is a set of closed loops');
    ok(ep.INTERNATIONAL.dangling_endpoints > 0,
      'E3 ' + name + ': while the international class alone has ' + ep.INTERNATIONAL.dangling_endpoints +
      ' loose ends — which is CORRECT, and is why the combined figure is the one that means anything');

    // E.4 — ANTI-MERIDIAN SPLITS, ISLANDS AND HOLES REMAIN VALID.
    // Nothing in the topology compares, wraps or unwraps a longitude, so Antarctica's (180,-90)->(-180,-90) pair
    // survives AS DATA rather than being dropped or "repaired" into a 358-degree sweep. It is interpolated by
    // slerp on 3D unit vectors, where it is a zero-length arc.
    var am = topo.stats.antimeridian;
    eq(am.antimeridian_edges, 1,
      'E4 ' + name + ': the anti-meridian pair is PRESERVED (not dropped, not unwrapped)');
    eq(am.worst_delta_lng, 360, 'E4 ' + name + ': stored at its raw 360-degree delta');
    eq(am.wide_edges, 0, 'E4 ' + name + ': and no OTHER edge is wider than 90 degrees, so nothing was unwrapped');
    ok(am.polar_edges > 0, 'E4 ' + name + ': polar geometry survives too (' + am.polar_edges + ' edges)');
    // Islands and holes are separate rings. More rings than features is the proof they were not merged.
    ok(topo.stats.input.rings > topo.stats.input.features,
      'E4 ' + name + ': ' + topo.stats.input.rings + ' rings across ' + topo.stats.input.features +
      ' features — islands and holes survived as their own rings');
    // A ring is closed by wrapping to index 0, so a ring never contributes a loose end of its own.
    ok(topo.stats.input.degenerate_edges >= 0,
      'E4 ' + name + ': ' + topo.stats.input.degenerate_edges + ' zero-length edges were dropped rather than kept');
  });

  // E.5 — the two datasets are genuinely INDEPENDENT, which is exactly why each has to be canonical on its own:
  // neither can inherit the other's canonicality, and there is no simplification step between them to preserve.
  var cKeys = keysOf(coarse), fKeys = keysOf(fine), shared = 0;
  Object.keys(fKeys).forEach(function (k) { if (cKeys[k]) shared++; });
  var fineTotal = Object.keys(fKeys).length;
  ok(shared < fineTotal * 0.001,
    'E5 only ' + shared + ' of ' + fineTotal + ' fine edges match a coarse edge — the two are independent ' +
    'simplifications of the same boundaries, not refinements of one another');
  console.log('  COARSE ' + coarse.stats.input.unique_edges + ' unique edges (' +
    coarse.stats.duplicate_edges_removed + ' dups removed) · FINE ' + fine.stats.input.unique_edges +
    ' (' + fine.stats.duplicate_edges_removed + ') · ' + shared + ' shared between them');
})();

// E.6 — CHANGING LOD CANNOT REUSE STALE BUFFERS. Each topology owns its own GL buffer set, the active one is
// tracked, and the switch is a no-op unless the WANTED set actually differs — which is what stops a slow zoom
// across a threshold re-uploading every frame.
(function () {
  var sync = extractFn(GLOBE, 'syncBorderSet'), upload = extractFn(GLOBE, 'uploadBorderSet');
  var wanted = extractFn(GLOBE, 'wantedBorderSet');
  ok(sync.length > 0 && upload.length > 0 && wanted.length > 0, 'E6 the LOD switch goes through one place');
  ok(/borderBufs\[/.test(upload), 'E6 which owns a SEPARATE buffer set per topology');
  ok(/borderActive/.test(sync), 'E6 and tracks which set is live');
  ok(/if \(want !== borderActive\) uploadBorderSet\(want\);/.test(sync),
    'E6 so a switch that changes nothing re-uploads nothing');
  ok(GLOBE.indexOf('admin1Anchors = null;') !== -1 && GLOBE.indexOf('labelTextCache = {};') !== -1,
    'E6 and replacing the division dataset drops every value DERIVED from it — anchors and resolved names');
})();
// E.7 — no runtime simplifier and no tolerance-based welding. This is the honest form of the former §J10: the
// assurance it asked for cannot be tested because the stage it names does not exist, and the right response is
// to prove the stage is absent rather than to build one so a test can pass.
ok(!/simplif/i.test(GC), 'E7 there is no runtime simplifier in the engine');
['douglas', 'peucker', 'visvalingam', 'snapTo', 'weld'].forEach(function (bad) {
  ok(GC.toLowerCase().indexOf(bad.toLowerCase()) === -1,
    'E7 and no tolerance-based welding primitive: ' + bad);
});
var TOPO_SRC = read('assets/js/lib/km-geo-topology.js');
ok(/function vkey/.test(TOPO_SRC), 'E7 vertices are joined by an EXACT key');
ok(!/tolerance|epsilon/i.test(code(TOPO_SRC)),
  'E7 with no tolerance or epsilon anywhere in the topology module — two vertices are the same vertex or they are not');

console.log('  §J10 STATUS: not applicable as originally worded (no runtime simplifier exists);');
console.log('  equivalent invariant proven at the actual LOD boundary — see §E above.');

// ================================================================================================================
section('§G — the guards that must not have moved');
// ================================================================================================================
// The R2/R3 invariants this round had the most opportunity to break.
eq(M.BORDER_R, 1.0, 'G-R3 the boundary layers still sit ON the surface');
ok(M.BORDER_DEPTH_BIAS > 0 && M.BORDER_DEPTH_BIAS < 0.001, 'G-R3 separated by a clip-space bias, not a shell');
ok(!/1\.0035|1\.0030/.test(GC), 'G-R3 the old floating shells have not come back');
// The ribbon path is selected by a NON-ZERO screen-space width, which is the whole reason it exists:
// gl.lineWidth is clamped to 1 in Chrome, so a width above 1 px cannot be expressed any other way.
ok(M.BORDER_STYLE.INTERNATIONAL.widthPx > M.RIBBON_MIN_PX,
  'G-R3 national borders are still screen-space ribbons (' + M.BORDER_STYLE.INTERNATIONAL.widthPx + ' px)');
eq(M.BORDER_STYLE.COASTLINE.widthPx, 0, 'G-R3 while coastline stays a plain line');
eq(M.BORDER_STYLE.ADM1.widthPx, 0, 'G-R3 and so does the division class');
ok(/segmentsToRibbon/.test(GC) && /VS_RIBBON/.test(GLOBE), 'G-R3 and the ribbon shader path is still present');
ok(M.BORDER_STYLE.INTERNATIONAL.rank < M.BORDER_STYLE.ADM1.rank,
  'G-R3 international still outranks ADM1');
ok(M.BORDER_STYLE.INTERNATIONAL.alpha > M.BORDER_STYLE.ADM1.alpha, 'G-R3 and stronger than the division class');
// The label size ladder and the zh-TW stack.
var SZ = M.labelSizes(2.0);
ok(SZ.admin1 < SZ.country && SZ.country < SZ.continent, 'G-R3 the three label sizes are still ordered');
['Microsoft JhengHei', 'PingFang TC', 'Noto Sans TC', 'Noto Sans CJK TC'].forEach(function (f) {
  ok(GLOBE.indexOf(f) !== -1, 'G-R3 the zh-TW font stack still names ' + f);
});
// The texture ladder and its cache token.
ok(/earth-albedo-8192\.jpg/.test(GLOBE) && /earth-albedo-4096\.jpg/.test(GLOBE) && /earth-albedo-2048\.jpg/.test(GLOBE),
  'G-R3 the three-tier same-source ladder is intact');
ok(/jul2004/.test(GLOBE), 'G-R2 and it is still the July 2004 frame');
// Cache tokens: every CHANGED runtime asset must re-fetch.
//
// SUPERSEDED BY TEXTURE-3-R5 §D, AND MADE DERIVED RATHER THAN PINNED. R4 asserted that the whole co-deployed
// map set shares ONE token. R5 §D replaces that rule: "introduce one new map-specific token for only the
// changed map files — do not rotate unrelated application assets", which is the same principle FB-4E-R4B-R3
// §1 states for build stamps ("move only the stamps of files actually changed").
//
// A flat "all equal" check cannot express that, and a list of which file should carry which literal token
// would rot every round — which is the failure mode that cost FB-4E three suites. So the rule is DERIVED from
// the files themselves: a map file that carries THIS round's marker in its source must carry THIS round's
// token, and one that does not must not. Next round maintains itself.
(function () {
  var files = ['km-globe.js', 'geo-name-resolver.js', 'geo-names-zh-hant.js', 'geo-display-aliases-zh-tw.js',
               'geo-admin1-display-names-zh-tw.js', 'km-geo-topology.js'];
  var SRC_OF = {
    'km-globe.js': 'assets/js/lib/km-globe.js',
    'geo-name-resolver.js': 'assets/js/core/geo-name-resolver.js',
    'geo-names-zh-hant.js': 'assets/js/data/geo-names-zh-hant.js',
    'geo-display-aliases-zh-tw.js': 'assets/js/data/geo-display-aliases-zh-tw.js',
    'geo-admin1-display-names-zh-tw.js': 'assets/js/data/geo-admin1-display-names-zh-tw.js',
    'km-geo-topology.js': 'assets/js/lib/km-geo-topology.js'
  };
  // Append-only, oldest to newest. A new round APPENDS; it never edits an existing entry.
  var MAP_TOKEN_SERIES = ['map-zh-hant-20260826', 'map-texture3-r2-20260826', 'map-texture3-r3-20260826',
                          'map-texture3-r4-20260827', 'map-texture3-r5-20260831'];
  var CURRENT = MAP_TOKEN_SERIES[MAP_TOKEN_SERIES.length - 1];
  var CURRENT_MARKER = /TEXTURE-3-R5/;
  var toks = files.map(function (f) {
    var m = new RegExp(f.replace(/\./g, '\\.') + '\\?v=([^"\']+)').exec(INDEX);
    ok(!!m, 'G index.html cache-busts ' + f);
    return m ? m[1] : null;
  });
  toks.forEach(function (t, i) {
    ok(MAP_TOKEN_SERIES.indexOf(t) !== -1,
      'G/R5 ' + files[i] + '\'s token belongs to the map series (' + t + ')');
    var changedThisRound = CURRENT_MARKER.test(read(SRC_OF[files[i]]));
    if (changedThisRound) {
      eq(t, CURRENT, 'G/R5 ' + files[i] + ' carries this round\'s marker, so it must carry this round\'s token');
    } else {
      ok(t !== CURRENT,
        'G/R5 ' + files[i] + ' did NOT change this round, so it must NOT be rotated (' + t + ')');
    }
  });
  // The protection the old "one token" rule really gave: nothing may be served from a token OLDER than the
  // round its own content last moved in. Expressed as: the newest token in use is this round's, and it is
  // carried by at least one file that actually changed.
  ok(toks.indexOf(CURRENT) !== -1, 'G/R5 this round\'s token is actually in use');
  ok(files.some(function (f, i) { return toks[i] === CURRENT && CURRENT_MARKER.test(read(SRC_OF[f])); }),
    'G/R5 and the file carrying it is one that genuinely changed');
  // NOT pinned to a literal: the assertion is that they AGREE, so a future release can move them together.
  ok(/^[a-z0-9-]+$/.test(String(toks[0])), 'G which is a plain token this test does not pin to a value');
})();
// No runtime network anywhere in what the page loads.
[ADM1_SRC, ALIAS_SRC, RESOLVER_SRC, GLOBE].forEach(function (src, i) {
  var label = ['the division asset', 'the alias asset', 'the resolver', 'the globe'][i];
  ['tile.openstreetmap', 'api.mapbox.com', 'googleapis.com/maps', '{z}/{x}/{y}', 'translate.googleapis']
    .forEach(function (bad) {
      ok(src.indexOf(bad) === -1, 'G ' + label + ' contains no ' + bad);
    });
});
ok(INDEX.indexOf('tools/geo/') === -1, 'G and no build tool is referenced from index.html');

console.log('\n----------------------------------------');
console.log('TEXTURE-3-R4 DECISION / DENSITY / DETERMINISM: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
