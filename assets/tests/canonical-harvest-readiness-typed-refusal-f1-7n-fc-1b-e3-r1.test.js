// ================================================================================================================
// F1-7N-FC-1B-E3-R1 — CANONICAL HARVEST READINESS DIAGNOSIS AND TYPED REFUSAL
// ----------------------------------------------------------------------------------------------------------------
// A live read-only census answered: verdict STOP · blocker HARVEST_NOT_READY · harvest.ok true ·
// source_data_as_of "" · warehouse_count 361 · mapped.ready false · mapped.issues []. The obvious reading is that
// the blank timestamp failed a readiness predicate. EXECUTING the predicates says otherwise, and that is the
// whole point of this round:
//
//   * `source_data_as_of` IS NOT A READINESS PREDICATE. Blank, null and a real date all yield ready:true, all
//     else equal. Nothing in the mapper validates it. Its blankness is a CO-SYMPTOM: 61_ populates it only from
//     a site that SURVIVED, so zero survivors leaves it null.
//   * KMAF decides readiness as `issues.length === 0 && receiverFacts.length > 0`. `ready:false` with an EMPTY
//     issues array therefore means exactly ONE thing — ZERO RECEIVERS — because a staged receiver either yields
//     a fact or yields an issue. KMAF already NAMES it: reason 'PLANNING_FACTS_NOT_READY'.
//   * the mapper returned `{ ready, issues, request }` and DROPPED `kmaf.reason`.
//   * `weeklyAiPlanHarvest_` collected its per-site drops (FORECAST_SHARE_INCOMPLETE per site) into `errors`
//     and its SUCCESS return never included it.
//   * 61_ put `issues` at the error's TOP level, and the browser transport preserves only code/message/details.
//   * and the page's classifier read `res.errors` — PLURAL — on a command result that carries `res.error`,
//     SINGULAR, so even a perfect server answer arrived as "could not complete — FAILED" with empty details.
//
// FOUR places discarded a reason the system already knew. This round fixes all four and changes the readiness
// DECISION in none of them.
//
// Run: node assets/tests/canonical-harvest-readiness-typed-refusal-f1-7n-fc-1b-e3-r1.test.js
// ================================================================================================================
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var pass = 0, fail = 0;
var neg = { caught: 0, missed: 0 };
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(t) { console.log('\n== ' + t + ' =='); }
function mut(label, f) {
  var r;
  try { r = f(); } catch (e) { neg.missed++; fail++; console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message)); return; }
  if (r === true) { neg.caught++; pass++; console.log('ok   ' + label + ' (caught)'); }
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }
// Comments AND string literals removed. A keyword sweep cannot tell a call from a sentence, and every file here
// documents in prose the very calls it does not make.
function ops(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
}
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (!depth) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
function swap(src, find, repl) {
  var re = new RegExp(String(find).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\n/g, '\\r?\\n'));
  if (!re.test(src)) throw new Error('swap anchor not found: ' + String(find).slice(0, 90));
  return src.replace(re, repl.replace(/\$/g, '$$$$'));
}

var ADAPTER_SRC = read('assets/js/core/supply-planning-weekly-harvest-adapter.js');
var KMWHA = require(path.join(ROOT, 'assets/js/core/supply-planning-weekly-harvest-adapter.js'));
var KMAF = require(path.join(ROOT, 'assets/js/core/supply-planning-allocation-facts.js'));
var KMPCX = require(path.join(ROOT, 'assets/js/core/supply-planning-planning-context.js'));
var G61 = read('assets/specs/active/apps-script/61_api_v1_weekly_ai_plan.gs');
var G42 = read('assets/specs/active/apps-script/42_api_v1_recommendation_workspace.gs');
var CFG = read('assets/specs/active/apps-script/00_config.gs');
var HLTH = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
var PAGE = read('assets/js/pages/inventory-replenishment.js');
var DBAPI = read('assets/js/api/operation-system-db-api.js');
var TEMP = read('assets/tools/apps-script-diagnostics/TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3.gs');
var RO = require(path.join(ROOT, 'assets/tests/_release-order.js'));
var INDEX = read('index.html');

var CYCLE = 'RECO-2026-09';
var SCOPE = { company: 'ResUS', country: 'US', marketplace: 'Amazon' };
var SKU = 'CO1100-R';
var MONTHS = KMPCX._forecastWeightMonths(CYCLE.slice(5));

// ================================================================================================================
section('§A — THE READINESS DECISION, EXECUTED (not inferred from the blank timestamp)');
// ================================================================================================================
eq(MONTHS, ['2026-10', '2026-11', '2026-12', '2027-01'],
  'A0  the §7 demand basis for ' + CYCLE + ' requires FOUR months, M+1..M+4 — the last of them in the NEXT year');

function harvestFixture(over) {
  var h = {
    planningCycle: CYCLE,
    businessScope: { company: SCOPE.company, country: SCOPE.country, source_page: 'inventory_replenishment' },
    mode: 'MANUAL_REGENERATE', confirmRegenerateOverUserEdits: false, actor: 't', now: '2026-09-03T00:00:00Z',
    sourceDataAsOf: null, formulaVersion: 'WEEKLY_AI_PLAN_V1',
    factoryIdentityConfig: { CN: 'WH-A' },
    warehousesById: (function () { var o = {}; for (var i = 0; i < 361; i++) o['WH-' + i] = { warehouse_id: 'WH-' + i, is_active: true }; return o; })(),
    kmaf: null, horizonsByDemandRef: {}, poolsBySku: {}
  };
  Object.keys(over || {}).forEach(function (k) { h[k] = over[k]; });
  return h;
}
function kmafFor(receivers) {
  return KMAF.projectAllocationFacts({
    recommendationType: 'WEEKLY_SHIPPING', planningCycle: CYCLE,
    businessScope: { company: SCOPE.company, country: SCOPE.country },
    calculationDate: '2026-09-01', receivers: receivers || [],
    warehouses: [{ warehouse_id: 'MKT-AMZ-US', is_active: true }]
  });
}
var COMPLETE_RECEIVER = {
  receiverKey: 'K1', demandRef: 'K1', demandKey: 'K1', demandDriver: 'FORECAST_DRIVEN',
  company: SCOPE.company, country: SCOPE.country, marketplace: SCOPE.marketplace,
  sku: SKU, masterSku: SKU, siteSku: SKU + '-US', fulfillmentModel: 'platform_fulfilled',
  allocationPriority: 1, unitsPerCarton: 40, windowCode: CYCLE, destinationWarehouseId: 'MKT-AMZ-US',
  forecastBasis: { forecastShareQty: 1200, forecastMonth1: { month: MONTHS[0], baseForecast: 300 },
    forecastMonth2: { month: MONTHS[1], baseForecast: 300 }, targetRules: {}, specialEventDemand: 0 }
};
var HORIZONS = { K1: { cumulativeGapByWindow: { D18: 520, D30: 520, D45: 520, D90: 520 }, requiredByByWindow: { D18: '2026-10-01' } } };
var POOLS = {}; POOLS[SKU] = { overseasSupplyPools: [], factoryPools: [{ warehouse_id: 'WH-1', quantity: 900 }] };

// §A.1 — THE FORMULA. Stated by executing every branch of it.
var ZERO = kmafFor([]);
eq([ZERO.ready, ZERO.reason, ZERO.issues.length, ZERO.receiverFacts.length],
  [false, 'PLANNING_FACTS_NOT_READY', 0, 0],
  'A1  KMAF: ready = (issues.length === 0 && receiverFacts.length > 0) — zero receivers gives ready:false, ' +
  'ZERO issues, and the reason PLANNING_FACTS_NOT_READY');
var ONE = kmafFor([COMPLETE_RECEIVER]);
eq([ONE.ready, ONE.issues.length], [true, 0], 'A1a one complete receiver → ready:true');

// §A.2/§A.3/§A.4 — the predicates, and which one is false for the live shape.
var live = KMWHA.mapWeeklyHarvestToBatchRequest(harvestFixture({ kmaf: ZERO }));
var byName = {}; live.predicates.forEach(function (p) { byName[p.name] = p; });
eq(byName['KMAF_PRESENT'].passed, true, 'A2  predicate KMAF_PRESENT = true (kmaf IS an object)');
eq(byName['KMAF_READY'].passed, false, 'A3  predicate KMAF_READY = FALSE — this is the one that fails');
eq(byName['KMAF_RECEIVER_FACTS_ARRAY'].passed, true, 'A3a KMAF_RECEIVER_FACTS_ARRAY = true (it is an empty array)');
eq(byName['KMAF_RECEIVER_FACTS_NON_EMPTY'].passed, false, 'A3b KMAF_RECEIVER_FACTS_NON_EMPTY = false, and NON-BLOCKING');
eq(byName['KMAF_RECEIVER_FACTS_NON_EMPTY'].required, false, 'A3c ...declared non-required, because it never gated readiness here');
eq(byName['PLANNING_CYCLE_PRESENT'].passed, true, 'A3d PLANNING_CYCLE_PRESENT = true for RECO-2026-09');
eq(byName['SOURCE_DATA_AS_OF_PRESENT'].passed, false, 'A3e SOURCE_DATA_AS_OF_PRESENT = false...');
eq(byName['SOURCE_DATA_AS_OF_PRESENT'].required, false, 'A3f ...and NOT required — it is not a readiness predicate');
eq(live.predicates.filter(function (p) { return p.required && !p.passed; }).map(function (p) { return p.name; }),
  ['KMAF_READY'],
  'A4  EXACTLY ONE required predicate is false, and it is KMAF_READY — not the timestamp');

// §A.5/§A.6 — where issues came from, and why they used to be empty.
ok(/kmaf\.issues \? kmaf\.issues : \[\]/.test(code(ADAPTER_SRC)) || /Array\.isArray\(kmaf\.issues\)/.test(code(ADAPTER_SRC)),
  'A5  `issues` is KMAF\'s own array, copied at this boundary');
eq(ZERO.issues, [], 'A6  and KMAF legitimately produced an EMPTY one: every staged receiver yields a fact OR ' +
  'an issue, so zero of both means zero receivers — nothing was swallowed inside KMAF');
ok(/reason/.test(code(ADAPTER_SRC)), 'A6a the reason KMAF DID give is what the boundary now carries');

// §A.7 — what production returns for this shape.
ok(/HARVEST_NOT_READY/.test(G61), 'A7  61_ answers HARVEST_NOT_READY for a not-ready mapping');
ok(/readiness_reason: mapped\.reason/.test(G61), 'A7a and now carries the reason...');
ok(/details: \{/.test(G61) && /issues: _rdIssues/.test(G61), 'A7b ...and the typed issues, under `details`');

// §A.8 — what the client could see.
ok(/error: \{ code: code \|\| 'BUSINESS_COMMAND_ERROR', message: String\(message == null \? code : message\), details:/.test(DBAPI),
  'A8  the command result shape is { success, data, error:{ code, message, details } } — SINGULAR `error`');
ok(/_ecode = \(_structured && _structured\.code\)/.test(DBAPI),
  'A8a the transport reads the server code VERBATIM — it does NOT flatten (§D.2)');

// ================================================================================================================
section('§B — source_data_as_of: NOT A PREDICATE, and no fabricated substitute');
// ================================================================================================================
var blank = KMWHA.mapWeeklyHarvestToBatchRequest(harvestFixture({ kmaf: ONE, horizonsByDemandRef: HORIZONS, poolsBySku: POOLS, sourceDataAsOf: '' }));
var nul = KMWHA.mapWeeklyHarvestToBatchRequest(harvestFixture({ kmaf: ONE, horizonsByDemandRef: HORIZONS, poolsBySku: POOLS, sourceDataAsOf: null }));
var real = KMWHA.mapWeeklyHarvestToBatchRequest(harvestFixture({ kmaf: ONE, horizonsByDemandRef: HORIZONS, poolsBySku: POOLS, sourceDataAsOf: '2026-09-01' }));
eq([blank.ready, nul.ready, real.ready], [true, true, true],
  'B1  §I.2 blank, null and a real source_data_as_of ALL yield ready:true — it gates nothing (executed)');
eq([blank.request.sourceDataAsOf, nul.request.sourceDataAsOf, real.request.sourceDataAsOf], ['', null, '2026-09-01'],
  'B2  and each is passed through UNCHANGED — no default, no substitute, no clock');
eq(blank.warnings.map(function (w) { return [w.code, w.blocking]; }), [['SOURCE_DATA_AS_OF_MISSING', false]],
  'B3  a blank one IS reported — as a NON-BLOCKING warning, not as a gate we invented');
eq(real.warnings, [], 'B3a and a present one produces no warning');
eq(blank.warnings[0].source_header, 'sourceDataAsOf', 'B4  naming the field...');
ok(/recommendation workspace/.test(blank.warnings[0].source_table), 'B4a ...and where it comes from');

// §B — THE LINEAGE, read out of the shipped source rather than described.
ok(/sourceDataAsOf: line\.sourceDataAsOf \|\| null/.test(G61),
  'B5  ORIGIN: the recommendation-workspace line carries it (61_ weeklyAiPlanEnumerateSites_)');
ok(/if \(!sourceDataAsOf && st\.sourceDataAsOf\) sourceDataAsOf = st\.sourceDataAsOf;/.test(G61),
  'B6  and 61_ takes it from the FIRST SURVIVING site only — so zero survivors leaves it null');
ok(/function weeklyAiPlanShipDate_/.test(G61) && /harvest\.sourceDataAsOf/.test(G61),
  'B7  CONSUMER: weeklyAiPlanShipDate_ derives the KMWRR ship date from it (a real downstream effect)');
ok(/source_data_as_of: sourceDataAsOf/.test(G61) && /LINEAGE_SOURCE_DATA_AS_OF_UNAVAILABLE/.test(G61),
  'B8  §B.5 a SECOND, AUTHORITATIVE timestamp already exists — the GAP-INV run lineage — and it BLOCKS ' +
  'rather than storing a blank');
ok(/st\.calculationDate/.test(G61), 'B8a and it is the run\'s own frozen input cutoff, not a clock reading');

// §B — THE PROHIBITED FIXES ARE ABSENT. Swept over code with comments and strings removed.
(function noFabrication() {
  var files = {
    'the mapper': ops(ADAPTER_SRC),
    '61_': ops(G61),
    'the census': ops(TEMP)
  };
  var bad = [];
  Object.keys(files).forEach(function (k) {
    var s = files[k];
    if (/new Date\s*\(\s*\)/.test(s)) bad.push(k + ' calls new Date()');
    if (/getLastUpdated|getLastModified/.test(s)) bad.push(k + ' reads a spreadsheet modified time');
    // Date.now() is legitimate for ELAPSED time; it is a defect only if it lands in a source_data_as_of field.
    if (/(sourceDataAsOf|source_data_as_of)\s*[:=][^;,}\n]*(Date\.now|new Date|procurementTimestamp_|shipmentTimestamp_)/.test(s)) {
      bad.push(k + ' assigns a clock reading to a source-data timestamp');
    }
  });
  eq(bad, [], 'B9  §I.7/§I.8 NO fabricated timestamp anywhere: no new Date(), no spreadsheet modified time, ' +
    'and no clock value assigned to a source-data field');
  ok(/Date\.now\(\) - t0/.test(TEMP), 'B9a (the census does use Date.now — for ELAPSED MS, which is not a data value)');
})();

// ================================================================================================================
section('§C — ready:false ALWAYS carries a typed issue');
// ================================================================================================================
var shapes = [
  ['kmaf undefined', { kmaf: undefined }],
  ['kmaf not an object', { kmaf: 'nope' }],
  ['kmaf.ready false, issues []', { kmaf: { ready: false, issues: [], receiverFacts: [], planningFacts: [] } }],
  ['kmaf.ready false, issues [x]', { kmaf: { ready: false, issues: [{ code: 'MISSING_DESTINATION_WAREHOUSE', ref: 'a|b|Amazon|SKU9|W1' }], receiverFacts: [], planningFacts: [] } }],
  ['receiverFacts not an array', { kmaf: { ready: true, issues: [], receiverFacts: null, planningFacts: [] } }],
  ['kmaf.ready false, no issues key', { kmaf: { ready: false, receiverFacts: [], planningFacts: [] } }]
];
var emptyIssueShapes = [];
shapes.forEach(function (s) {
  var r = KMWHA.mapWeeklyHarvestToBatchRequest(harvestFixture(s[1]));
  if (r.ready === false && (!r.issues || !r.issues.length)) emptyIssueShapes.push(s[0]);
});
eq(emptyIssueShapes, [], 'C1  §I.3 NOT ONE ready:false shape returns an empty issues array (§C.1)');
shapes.forEach(function (s) {
  var r = KMWHA.mapWeeklyHarvestToBatchRequest(harvestFixture(s[1]));
  var i = r.issues[0];
  var complete = !!i && typeof i.code === 'string' && i.code.length > 0 &&
    typeof i.kind === 'string' && typeof i.blocking === 'boolean' &&
    typeof i.field === 'string' && typeof i.stage === 'string' &&
    typeof i.expected === 'string' && typeof i.actual === 'string' &&
    typeof i.source_table === 'string' && typeof i.source_header === 'string' &&
    !!i.affected_scope && typeof i.affected_scope.company === 'string';
  ok(complete, 'C2  [' + s[0] + '] the issue carries the full §C schema (code/field/stage/expected/actual/' +
    'source_table/source_header/affected_scope) — got ' + (i ? i.code : 'NOTHING'));
});
// §C.5 — the vocabulary is present and complete.
eq(Object.keys(KMWHA.READINESS_CODES).sort(),
  ['CANONICAL_MAPPING_INCOMPLETE', 'DESTINATION_UNRESOLVED', 'FACTORY_SOURCE_UNRESOLVED', 'PLANNING_CYCLE_MISSING',
   'REQUESTED_SCOPE_EMPTY', 'SKU_FACTS_MISSING', 'SOURCE_DATA_AS_OF_MISSING', 'SUGGESTED_QTY_UNRESOLVED'],
  'C3  §C.5 all eight required codes exist');
// §C.6 — existing codes are PRESERVED, not renamed.
(function preserveEngineCodes() {
  var pairs = [
    ['MISSING_DESTINATION_WAREHOUSE', 'DESTINATION_UNRESOLVED'],
    ['POOL_ELIGIBILITY_UNRESOLVED', 'FACTORY_SOURCE_UNRESOLVED'],
    ['DEMAND_WEIGHT_UNRESOLVED', 'SUGGESTED_QTY_UNRESOLVED'],
    ['FORECAST_SHARE_INCOMPLETE', 'SUGGESTED_QTY_UNRESOLVED'],
    ['PLANNING_FACTS_NOT_READY', 'SKU_FACTS_MISSING'],
    ['RECEIVER_IDENTITY_INCOMPLETE', 'CANONICAL_MAPPING_INCOMPLETE']
  ];
  var bad = [];
  pairs.forEach(function (p) {
    var issue = KMWHA.fromEngineIssue({ code: p[0], ref: 'c|k|Amazon|SKU1|W1' }, 'KMAF', SCOPE);
    if (issue.code !== p[1]) bad.push(p[0] + ' -> ' + issue.code + ' (want ' + p[1] + ')');
    if (issue.engine_code !== p[0]) bad.push(p[0] + ' engine_code lost');
  });
  eq(bad, [], 'C4  §C.6 each existing engine code maps to a readiness code AND survives verbatim as ' +
    'engine_code — a boundary translation, never a rename');
  var d = KMWHA.fromEngineIssue({ code: 'MISSING_DESTINATION_WAREHOUSE', ref: 'c|k|Amazon|SKU1|W1' }, 'KMAF', SCOPE);
  eq([d.affected_scope.marketplace, d.affected_scope.sku], ['Amazon', 'SKU1'],
    'C4a and the demandRef is split back into a readable scope identity');
})();
// §C.4 — transport is never reported as data readiness.
(function kindsSeparate() {
  var t = KMWHA.fromEngineIssue({ code: 'WORKSPACE_THREW', message: 'boom' }, 'HARVEST', SCOPE);
  var d = KMWHA.fromEngineIssue({ code: 'FORECAST_SHARE_INCOMPLETE' }, 'HARVEST', SCOPE);
  eq([t.kind, d.kind], ['TRANSPORT', 'DATA'],
    'C5  §C.4 an exception is kind TRANSPORT and a data gap is kind DATA — never conflated');
  eq(t.code, 'WORKSPACE_THREW', 'C5a and a transport fault keeps its own code rather than being dressed as a data issue');
})();
// §C.3 — no raw table content can ride out.
(function noRowData() {
  var i = KMWHA.readinessIssue({ engine_code: 'FORECAST_SHARE_INCOMPLETE', actual: [{ a: 1 }, { a: 2 }, { a: 3 }] });
  eq(i.actual, 'array(3)', 'C6  §C.3 an array `actual` is reduced to a shape description, never serialised');
  var j = KMWHA.readinessIssue({ engine_code: 'X', actual: { row: 1, sku: 'S', qty: 9 } });
  eq(j.actual, 'object(3 keys)', 'C6a and so is an object');
  var k = KMWHA.readinessIssue({ engine_code: 'X', actual: new Array(400).join('x') });
  ok(k.actual.length <= 120, 'C6b and a long string is capped (' + k.actual.length + ' chars)');
})();

// ================================================================================================================
section('§C — AND THE DECISION IS UNCHANGED');
// ================================================================================================================
// The PRE gate, re-implemented from the pre-R1 source, run beside the shipped one on every shape.
function preGate(h) {
  var kmaf = h.kmaf;
  var isObj = function (v) { return v !== null && typeof v === 'object' && !Array.isArray(v); };
  if (!isObj(kmaf) || kmaf.ready === false || !Array.isArray(kmaf.receiverFacts)) return false;
  return true;
}
(function decisionUnchanged() {
  var all = shapes.concat([
    ['complete', { kmaf: ONE, horizonsByDemandRef: HORIZONS, poolsBySku: POOLS }],
    ['complete, blank ts', { kmaf: ONE, horizonsByDemandRef: HORIZONS, poolsBySku: POOLS, sourceDataAsOf: '' }],
    ['complete, no horizons', { kmaf: ONE, poolsBySku: POOLS }],
    ['ready kmaf, empty facts', { kmaf: { ready: true, issues: [], receiverFacts: [], planningFacts: [] } }],
    ['blank cycle', { kmaf: ONE, horizonsByDemandRef: HORIZONS, poolsBySku: POOLS, planningCycle: '' }]
  ]);
  var diffs = [];
  all.forEach(function (s) {
    var h = harvestFixture(s[1]);
    var now = KMWHA.mapWeeklyHarvestToBatchRequest(h).ready;
    var before = preGate(h);
    if (now !== before) diffs.push(s[0] + ': now ' + now + ', before ' + before);
  });
  eq(diffs, [], 'C7  for ELEVEN shapes the readiness DECISION is byte-for-byte what it was before R1 — ' +
    'nothing tightened, nothing relaxed, no missing value defaulted');
  var emptyFacts = KMWHA.mapWeeklyHarvestToBatchRequest(harvestFixture({ kmaf: { ready: true, issues: [], receiverFacts: [], planningFacts: [] } }));
  eq(emptyFacts.ready, true, 'C7a including the one that looks wrong: an EMPTY receiverFacts array has always ' +
    'passed this gate, and 61_ refuses that universe downstream by name');
  ok(/REQUESTED_SCOPE_EMPTY/.test(G61), 'C7b (which it does — REQUESTED_SCOPE_EMPTY)');
})();

// ================================================================================================================
section('§B/§I — THE SITE-DROP PREDICATE, executed on the canonical reader');
// ================================================================================================================
var fcReader = new Function('RECO_WS_MONTH_ABBR_', 'recoWsStr_',
  extractFn(G42, 'recoWsRegularForecastByMonth_') + '; return recoWsRegularForecastByMonth_;')(
  ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'],
  function (v) { return String(v === undefined || v === null ? '' : v).trim(); });
function fcRow(year, over) {
  var r = { company: SCOPE.company, country: SCOPE.country, marketplace: SCOPE.marketplace, sku: SKU, year: year };
  Object.keys(over || {}).forEach(function (k) { r[k] = over[k]; });
  return r;
}
function siteSurvives(rows) {
  var map = fcReader(rows, SCOPE, SKU, MONTHS);
  var complete = true;
  for (var k = 0; k < MONTHS.length; k++) { if (!isFinite(Number(map[MONTHS[k]]))) { complete = false; break; } }
  return complete && isFinite(Number(map[MONTHS[0]])) && isFinite(Number(map[MONTHS[1]]));
}
eq(siteSurvives([fcRow(2026, { oct: 300, nov: 300, dec: 300 }), fcRow(2027, { jan: 300 })]), true,
  'D1  all four months present → the site SURVIVES the §7 basis gate');
eq(siteSurvives([fcRow(2026, { oct: 300, nov: 300, dec: 300 })]), false,
  'D2  the 2027 row MISSING → dropped (FORECAST_SHARE_INCOMPLETE). The fourth month is in the NEXT YEAR, ' +
  'which is the specific thing easy to miss');
eq(siteSurvives([fcRow(2026, { oct: 300, nov: 300, dec: 300 }), fcRow(2027, { jan: '' })]), false,
  'D3  the row present but the CELL blank → also dropped, and it is a different fix');
eq(siteSurvives([fcRow(2026, { oct: 300, nov: 300, dec: 300 }), fcRow(2026, { oct: 999 }), fcRow(2027, { jan: 300 })]), false,
  'D4  two rows DISAGREEING on one month → the reader omits it, so the site is dropped too');
eq(siteSurvives([fcRow(2026, { oct: 0, nov: 0, dec: 0 }), fcRow(2027, { jan: 0 })]), true,
  'D5  an explicit ZERO in every month SURVIVES — a truthful zero is data, and it is never treated as missing');
// and the whole chain, end to end
(function endToEnd() {
  var survives = siteSurvives([fcRow(2026, { oct: 300, nov: 300, dec: 300 })]);
  var k = kmafFor(survives ? [COMPLETE_RECEIVER] : []);
  var m = KMWHA.mapWeeklyHarvestToBatchRequest(harvestFixture({ kmaf: k,
    errors: [{ code: 'FORECAST_SHARE_INCOMPLETE', message: 'missing regular forecast month', demandRef: 'ResUS|US|Amazon|' + SKU + '|MKT' }] }));
  eq([survives, k.receiverFacts.length, k.ready, m.ready], [false, 0, false, false],
    'D6  END TO END: forecast incomplete → site dropped → zero receivers → KMAF ready:false → mapper ready:false');
  ok(m.issues.length >= 2, 'D6a and the refusal now carries BOTH the harvest\'s per-site drop and the KMAF reason (' + m.issues.length + ' issues)');
  var codes = m.issues.map(function (i) { return i.engine_code; }).sort();
  eq(codes, ['FORECAST_SHARE_INCOMPLETE', 'PLANNING_FACTS_NOT_READY'],
    'D6b naming the site-level cause AND the universe-level effect, each with its own engine code');
  var f = m.issues.filter(function (i) { return i.engine_code === 'FORECAST_SHARE_INCOMPLETE'; })[0];
  eq([f.affected_scope.marketplace, f.affected_scope.sku], ['Amazon', SKU],
    'D6c and the site-level one says WHICH marketplace and WHICH SKU');
})();
// the harvest no longer discards them
ok(/errors: errors, site_count: sites\.length, receiver_count:/.test(G61),
  'D7  §D 61_\'s harvest SUCCESS return now carries `errors` + the site and receiver counts');
ok(/errors: Array\.isArray\(h\.errors\) \? h\.errors : \[\]/.test(G61),
  'D7a and passes them into the mapper, which is what turns them into typed issues');

// ================================================================================================================
section('§D — PRODUCTION REFUSAL VISIBILITY, driven through the shipped page functions');
// ================================================================================================================
function mkWorld(o) {
  o = o || {};
  var els = {}, timers = [], W = { genCalls: [], renders: 0 };
  function mkEl(id, cls) {
    var a = {}, c = {};
    String(cls || '').split(/\s+/).filter(Boolean).forEach(function (x) { c[x] = 1; });
    var e = { id: id || '', hidden: false, disabled: false, innerHTML: '', textContent: '', style: {}, dataset: {},
      className: String(cls || ''), _children: [],
      classList: { add: function (x) { c[x] = 1; }, remove: function (x) { delete c[x]; }, contains: function (x) { return !!c[x]; } },
      setAttribute: function (k, v) { a[k] = String(v); }, getAttribute: function (k) { return a[k] === undefined ? null : a[k]; },
      removeAttribute: function (k) { delete a[k]; },
      appendChild: function (x) { e._children.push(x); if (x.id) els[x.id] = x; return x; },
      insertBefore: function (x) { e._children.unshift(x); if (x.id) els[x.id] = x; return x; },
      _hasClass: function (x) { return !!c[x]; }, remove: function () {} };
    if (id) els[id] = e;
    return e;
  }
  var trigger = mkEl('replenAiSupportTrigger', 'km-action-menu__trigger'); trigger.textContent = 'AI Support';
  mkEl('replen-ai-plan-btn', 'km-action-menu__item');
  var list = mkEl('shipping-methods-S1', 'exec-routes-list');
  var card = mkEl('', 'replen-card'); card._children.push(list); list.parentNode = card;
  var document = {
    getElementById: function (id) { return els[id] || null; },
    createElement: function () { return mkEl('', ''); },
    querySelectorAll: function (sel) { return sel === '.exec-routes-list' ? [list] : []; },
    body: mkEl('', '')
  };
  list.querySelectorAll = function () { return []; };
  var deps = {
    document: document,
    window: {
      KMREC: { generateInventoryRecommendation: function (r) { return { sku: r.sku }; } },
      KM: { DB: { generateWeeklyAiPlanDraft: function (p) { W.genCalls.push(p); return Promise.resolve(o.response); },
                  refreshCacheTables: function () { return Promise.resolve(true); } },
            api: { inventoryAiPlanDbGenerationEnabled: function () { return o.flagOn === true; } } },
      IRRouteProvenance: require(path.join(ROOT, 'assets/js/utils/inventory-compat.js')).IRRouteProvenance,
      confirm: function () { return true; }, _irAiPlanUnreconciled: null
    },
    console: { warn: function () {}, error: function () {}, info: function () {}, log: function () {} },
    setTimeout: function (fn, ms) { timers.push({ fn: fn, ms: ms }); return timers.length; },
    clearTimeout: function (h) { if (h) timers[h - 1] = null; },
    renderReplenishment: function () { W.renders++; },
    _hydrateAllocationDraftFromDb: function () { return true; },
    isOperationDbApiConfigured: function () { return true; },
    escapeReplenHtml: function (v) { return String(v == null ? '' : v); },
    _irEffectiveWorkspace: function () { return false; },
    _irMatState: { rows: [{ sku: 'S1' }] }, _irRecoByKey: {},
    _replenCtx: function () { return { company: 'ResUS', country: 'US', marketplace: 'Amazon' }; },
    _irRecoNow_: function () { return new Date('2026-09-03T00:00:00Z'); }
  };
  var names = Object.keys(deps);
  var phases = (PAGE.match(/var IR_AI_PLAN_PHASES = \{[\s\S]*?\};/) || [])[0];
  var sentences = (PAGE.match(/var IR_READINESS_SENTENCES = \{[\s\S]*?\};/) || [])[0];
  if (!phases || !sentences) throw new Error('IR_AI_PLAN_PHASES / IR_READINESS_SENTENCES not found');
  var src = [
    'var _irAiSupportTriggerOwner = null; var _irAiPlanRunning = false;',
    phases.replace(/\r/g, ''), sentences.replace(/\r/g, ''),
    extractFn(PAGE, '_irEscNotice_'), extractFn(PAGE, '_irAiPlanDefer_'), extractFn(PAGE, '_irAiPlanIsRunning_'),
    extractFn(PAGE, '_irReadinessSentence_'),
    extractFn(PAGE, '_irAiSupportTriggerEl_'), extractFn(PAGE, '_irAiSupportTriggerBusy_'), extractFn(PAGE, '_irAiSupportTriggerIdle_'),
    extractFn(PAGE, '_irAiPlanTriggerBusy_'), extractFn(PAGE, '_irAiPlanTriggerIdle_'),
    extractFn(PAGE, '_irExecPlanAriaBusy_'), extractFn(PAGE, '_irExecListSku_'), extractFn(PAGE, '_irExecPlanStatusSet_'),
    extractFn(PAGE, '_irAiSupportNoticeEl_'), extractFn(PAGE, '_irClearAiSupportNotice_'), extractFn(PAGE, '_irAiSupportNotice_'),
    extractFn(PAGE, '_irAiPlanPhase_'), extractFn(PAGE, '_irAiPlanTerminal_'),
    extractFn(PAGE, '_irTouchedComposerSkus_'), extractFn(PAGE, '_irPersistedManualRouteSkus_'),
    extractFn(PAGE, '_irAiPlanWithTimeout_'), extractFn(PAGE, '_irAiPlanReconcile_'),
    extractFn(PAGE, '_irInventoryAiPlanDbGenerationEnabled_'), extractFn(PAGE, '_irAiPlanDbGenEligible_'),
    extractFn(PAGE, '_irClassifyGenerationResult_'), extractFn(PAGE, '_irShowAiPlanResult_'),
    extractFn(PAGE, '_irRunInventoryAiPlanGeneration_'),
    extractFn(PAGE, 'handleReplenAiPlan'), extractFn(PAGE, '_irAiPlanRun_'),
    'return { click: handleReplenAiPlan, classify: _irClassifyGenerationResult_, sentence: _irReadinessSentence_, running: _irAiPlanIsRunning_ };'
  ].join('\n');
  W.api = new Function(names, src).apply(null, names.map(function (n) { return deps[n]; }));
  W.trigger = trigger; W.list = list; W.deps = deps;
  W.notice = function () { return els['replen-ai-support-notice'] || null; };
  W.status = function () { return els['exec-plan-status-S1'] || null; };
  W.btn = function () { return els['replen-ai-plan-btn']; };
  W.flush = function () { var t = timers.filter(Boolean); timers.length = 0; t.forEach(function (x) { x.fn(); }); };
  W.settle = function () { var p = Promise.resolve(); for (var i = 0; i < 14; i++) p = p.then(function () { W.flush(); }); return p; };
  return W;
}
// The exact envelope 61_ now returns, through the real transport shape.
var READINESS_ISSUE = KMWHA.fromEngineIssue({ code: 'FORECAST_SHARE_INCOMPLETE', ref: 'ResUS|US|Amazon|' + SKU + '|MKT' }, 'HARVEST', SCOPE);
READINESS_ISSUE.source_table = 'fc_regular_forecast';
READINESS_ISSUE.source_header = 'year + the month column for 2027-01';
READINESS_ISSUE.field = 'forecastBasis.forecastShareQty';
var REFUSAL = {
  success: false, data: null,
  error: {
    code: 'HARVEST_NOT_READY',
    message: 'canonical facts not ready: SUGGESTED_QTY_UNRESOLVED',
    details: {
      command: 'weeklyAiPlan.generate', stage: 'READINESS', readiness_reason: 'SUGGESTED_QTY_UNRESOLVED',
      issues: [READINESS_ISSUE],
      warnings: [KMWHA.readinessIssue({ code: 'SOURCE_DATA_AS_OF_MISSING', blocking: false, field: 'sourceDataAsOf', stage: 'HARVEST' })],
      predicates: [{ name: 'KMAF_READY', required: true, passed: false, detail: 'kmaf.ready=false' }],
      harvest: { ok: true, site_count: 7, receiver_count: 0, source_data_as_of: '' },
      planning_cycle: CYCLE, scope: SCOPE, db_writes: 0
    }
  }
};

(function classifierReadsTheError() {
  var w = mkWorld({ flagOn: true, response: REFUSAL });
  var cls = w.api.classify(REFUSAL);
  eq(cls.code, 'HARVEST_NOT_READY', 'E1  §I.10 the classifier reads the SINGULAR `error` and reports the server code');
  eq(cls.errors.length, 1, 'E1a and the error list is no longer empty (it was ALWAYS empty before R1)');
  ok(!!cls.readiness, 'E1b and the typed readiness block survives the transport');
  eq(cls.readiness.issues.length, 1, 'E1c with its issues...');
  eq(cls.readiness.warnings.length, 1, 'E1d ...its non-blocking warnings...');
  eq(cls.readiness.predicates.length, 1, 'E1e ...and its predicates');
  eq(cls.readiness.harvest.site_count, 7, 'E1f plus the harvest counts that turn "empty" into "7 sites, 0 receivers"');
  // and the PRE behaviour, to show it was not a cosmetic change
  var preCls = new Function('res', code(swap(extractFn(PAGE, '_irClassifyGenerationResult_'),
    '    var _e1 = (res && res.error) ? res.error : null;', '    var _e1 = null;')) +
    ' return _irClassifyGenerationResult_(res);');
  var before = preCls(REFUSAL);
  eq([before.errors.length, before.code, before.readiness], [0, '', null],
    'E2  PRE (executed): reading only `res.errors` gave ZERO errors, no code and no readiness — ' +
    'which is why production said "could not complete — FAILED"');
})();

(function uiShowsTheIssue() {
  var w = mkWorld({ flagOn: true, response: REFUSAL });
  w.api.click();
  return w.settle().then(function () {
    var html = w.notice() ? w.notice().innerHTML : '';
    ok(/did NOT run/.test(html), 'E3  §D.3 the notice states that AI Plan did NOT run');
    ok(/recommended quantity has no canonical basis/.test(html),
      'E3a and states the ISSUE in a sentence an operator can act on, not a token');
    ok(/SUGGESTED_QTY_UNRESOLVED/.test(html), 'E3b with the typed code alongside it, for a bug report');
    ok(/fc_regular_forecast/.test(html), 'E3c naming the TABLE...');
    ok(/2027-01/.test(html), 'E3d ...and the specific month');
    ok(/Amazon \/ CO1100-R|Affected: Amazon/.test(html), 'E3e and the affected scope');
    ok(/7 site\(s\)/.test(html) && /0 receiver\(s\)/.test(html), 'E3f plus the harvest counts');
    ok(/Source data timestamp is missing/.test(html), 'E3g the non-blocking warning is shown as non-blocking');
    ok(/not blocking|Also noted/.test(html), 'E3h and labelled as such');
    ok(/NOTHING was written/.test(html), 'E3i and states that nothing was written');
    ok(!/Saved/.test(html), 'E4  §D.8 it never says "Saved"');
    ok(html.length > 0, 'E4a §D.7 it is not an empty result');
    // §D.4/§D.5/§D.6
    ok(!/__spinner/.test(html), 'E5  §I.11 the spinner is CLEARED on this terminal path');
    eq(w.trigger.disabled, false, 'E5a the Generate proxy is re-enabled');
    eq(w.trigger.getAttribute('aria-busy'), null, 'E5b and no longer busy');
    eq(w.list.getAttribute('aria-busy'), null, 'E5c and neither is the Execution Plan area');
    eq(w.btn().disabled, false, 'E5d nor the menu item');
    ok(w.status() && /AI Plan not run/.test(w.status().textContent),
      'E6  and the outcome STAYS in the Execution Plan area');
    ok(!w.api.running(), 'E6a with the run flag clear');
    eq(w.genCalls.length, 1, 'E7  §I.12 exactly one request, and it was a refusal — zero writes');
    return null;
  });
})().then(function () {

// ================================================================================================================
section('§D — the generic label is gone');
// ================================================================================================================
var runFn = code(extractFn(PAGE, '_irRunInventoryAiPlanGeneration_'));
ok(/if \(cls\.readiness\)/.test(runFn), 'F1  the readiness refusal has its own branch, before the generic one');
ok(/cls\.code \|\| cls\.status \|\| 'FAILED'/.test(runFn),
  'F2  and the generic branch prefers the SERVER\'S CODE over the literal \'FAILED\'');
ok(/_irReadinessSentence_/.test(runFn), 'F3  §D.7 the operator gets a sentence, not a token dump');
ok(!/console\.(log|warn|info)\(/.test(code(extractFn(PAGE, '_irAiPlanRun_'))),
  'F4  §D.7 nothing about the outcome is written ONLY to the console');

// ================================================================================================================
section('§F/§G — THE CENSUS: an early refusal keeps the diagnosis, and stays read-only');
// ================================================================================================================
// §F.1/§F.2 — swept over CODE, comments and strings removed (the file documents the calls it does not make).
(function censusReadOnly() {
  var T = ops(TEMP);
  var writes = ['appendRow', 'setValue', 'setValues', 'deleteRow', 'deleteRows', 'insertRow', 'clearContent',
    'clear(', 'setNumberFormat', 'SpreadsheetApp.flush', 'DriveApp', 'MailApp', 'ScriptApp.newTrigger',
    'PropertiesService', 'setFormula', 'copyTo', 'insertSheet'];
  eq(writes.filter(function (w) { return T.indexOf(w) !== -1; }), [],
    'G1  §I.13 the census contains NO write call of any kind');
  ok(!/weeklyAiPlanPersistenceDeps_/.test(T), 'G1a §F.6 and never constructs the atomic writer');
  ok(!/weeklyAiPlanGenerateK2_/.test(T), 'G1b nor calls the generation path');
  ok(/db_writes: 0/.test(TEMP) && /writer_constructed: false/.test(TEMP), 'G1c and declares both facts');
  ok(/weeklyAiPlanResolveGapRunLineage_/.test(T),
    'G1d it reads the gap-run lineage through the PRODUCTION resolver rather than touching script properties itself');
})();
// §F.1/§F.2/§F.7 — EXECUTED. The census is run against the live-shaped harvest with the writer and the
// allocator wired to THROW, so "not called" is proven rather than asserted from source.
(function censusExecuted() {
  var calls = { writer: 0, generate: 0, kmwrb: 0, kmwrr: 0, sheetWrites: 0 };
  var logs = [];
  var FC_ROWS = [
    ['company', 'country', 'marketplace', 'sku', 'year', 'jan', 'oct', 'nov', 'dec'],
    ['ResUS', 'US', 'Amazon', SKU, 2026, '', 300, 300, 300]
    // deliberately NO 2027 row: the fourth required month is absent, which is the live-shaped data gap
  ];
  function sheet(rows) {
    return { getDataRange: function () { return { getValues: function () { return rows.map(function (r) { return r.slice(); }); } }; },
      appendRow: function () { calls.sheetWrites++; throw new Error('WRITE ATTEMPTED'); },
      getRange: function () { calls.sheetWrites++; throw new Error('WRITE ATTEMPTED'); } };
  }
  var SHEETS = { fc_regular_forecast: sheet(FC_ROWS), shipping_allocation_drafts: sheet([['allocation_draft_id', 'status']]), factory_stock: sheet([['master_sku', 'warehouse_id']]) };
  var sandbox = {
    console: console, Date: Date, Math: Math, JSON: JSON, RegExp: RegExp, String: String, Number: Number,
    Boolean: Boolean, Array: Array, Object: Object, Error: Error, isFinite: isFinite, isNaN: isNaN,
    parseInt: parseInt, parseFloat: parseFloat,
    Logger: { log: function (m) { logs.push(String(m)); } },
    SpreadsheetApp: { openById: function () { return { getSheetByName: function (n) { return SHEETS[n] || null; } }; } },
    KMWHA: KMWHA, KMPCX: KMPCX,
    KMWRB: { buildWeeklySourceLines: function () { calls.kmwrb++; throw new Error('KMWRB CALLED WHILE NOT READY'); } },
    KMWRR: { buildK2GenerationPlan: function () { calls.kmwrr++; throw new Error('ALLOCATOR CALLED WHILE NOT READY'); } },
    weeklyAiPlanPersistenceDeps_: function () { calls.writer++; throw new Error('WRITER CONSTRUCTED'); },
    weeklyAiPlanGenerateK2_: function () { calls.generate++; throw new Error('GENERATION CALLED'); },
    // the live shape: harvest ok, zero receivers, blank timestamp, and the per-site drop it now carries out
    weeklyAiPlanHarvest_: function () {
      return { ok: true, sourceDataAsOf: null, warehousesById: { 'WH-1': {} },
        kmaf: kmafFor([]), horizonsByDemandRef: {}, poolsBySku: {},
        errors: [{ code: 'FORECAST_SHARE_INCOMPLETE', message: 'missing regular forecast month', demandRef: 'ResUS|US|Amazon|' + SKU + '|MKT' }],
        site_count: 7, receiver_count: 0 };
    },
    weeklyAiPlanReadCarrierAuthorities_: function () { return { rateCards: [{}], leadTimes: [{}] }; },
    weeklyAiPlanK2AllocatedLines_: function () { return []; },
    weeklyAiPlanShipDate_: function () { return ''; },
    weeklyAiPlanResolveGapRunLineage_: function () { return { ok: false, reason: 'LINEAGE_GAP_RUN_UNRESOLVED' }; },
    prodExpectedDbId_: function () { return 'SS-1'; },
    prodAssertDbTarget_: function () { return true; },
    gapCalcResolveContext_: function () { return { ok: true, planningCycle: CYCLE, calculationDate: '2026-09-01' }; },
    procurementTimestamp_: function () { return '2026-09-03T00:00:00Z'; },
    inventoryAiPlanDbGenerationEnabled_: function () { return false; },
    CONFIG_BUILD_VERSION_: 'F1-7N-FC-1B-E3-R1',
    WEEKLY_AI_PLAN_SOURCE_PAGE_: 'inventory_replenishment',
    WEEKLY_AI_PLAN_FACTORY_IDENTITY_: { CN: 'WH-A' }
  };
  sandbox.global = sandbox;
  var ctx = vm.createContext(sandbox);
  vm.runInContext(TEMP, ctx, { filename: 'TEMP_census.gs' });
  var res = vm.runInContext('TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3(' + JSON.stringify({
    company: SCOPE.company, country: SCOPE.country, marketplace: SCOPE.marketplace, sku: SKU, expect: { qty: 520 }
  }) + ')', ctx);

  eq(res.verdict, 'STOP', 'G2  §I.6 the census still answers STOP for a real data gap — the gate is not relaxed');
  eq([res.db_writes, res.writer_constructed], [0, false], 'G2a §I.13 db_writes 0, writer_constructed false');
  eq([calls.writer, calls.generate, calls.kmwrb, calls.kmwrr, calls.sheetWrites], [0, 0, 0, 0, 0],
    'G2b EXECUTED: the writer, the generation path, KMWRB and the ALLOCATOR were never called, and no sheet ' +
    'write was attempted');
  // §F.1/§G — everything the refusal must still report
  ok(!!res.mapped, 'G3  §F.2 the readiness block SURVIVES the early refusal...');
  eq(res.mapped.ready, false, 'G3a with ready:false');
  ok(res.mapped.issues.length >= 2, 'G3b and non-empty typed issues (' + res.mapped.issues.length + ')');
  ok(res.mapped.readiness_predicates.length >= 5, 'G3c the predicates, with their true/false (' + res.mapped.readiness_predicates.length + ')');
  eq(res.mapped.failed_required_predicates.length >= 1, true, 'G3d naming the required one(s) that failed');
  ok(res.mapped.missing_fields.length >= 1, 'G3e the missing field name(s)');
  ok(res.mapped.mapped_field_names.indexOf('sourceDataAsOf') !== -1, 'G3f and the canonical field names it reads');
  ok(!!res.source_data_as_of_candidates, 'G4  §G the source_data_as_of DERIVATION is reported...');
  eq(res.source_data_as_of_candidates.harvest_value_is_blank, true, 'G4a stating that the harvest value is blank');
  ok(/FIRST SURVIVING site/.test(res.source_data_as_of_candidates.harvest_origin), 'G4b and WHY it is blank');
  ok(!!res.source_data_as_of_candidates.gap_run_lineage, 'G4c naming the second, authoritative timestamp');
  ok(/NO clock/.test(res.source_data_as_of_candidates.fabrication_check), 'G4d and that nothing was fabricated');
  ok(!!res.forecast_coverage, 'G5  §G the FORECAST COVERAGE is reported...');
  eq(res.forecast_coverage.missing_months, ['2027-01'], 'G5a naming the exact missing month');
  eq(res.forecast_coverage.verdict, 'FORECAST_SHARE_INCOMPLETE', 'G5b with the canonical drop code');
  eq(res.forecast_coverage.per_month.filter(function (p) { return p.status === 'NO_ROW_FOR_YEAR'; }).map(function (p) { return p.month; }),
    ['2027-01'], 'G5c and classifying it as NO_ROW_FOR_YEAR — not as a blank cell and not as a conflict');
  eq(res.forecast_coverage.source_table, 'fc_regular_forecast', 'G5d naming the table');
  eq(res.next_blocked_stage, 'CANONICAL_READINESS', 'G6  §G the next blocked stage is named');
  ok(/READINESS_NOT_ESTABLISHED/.test(res.allocator_skipped_reason || ''),
    'G6a and the allocator says why it was skipped rather than reporting a zero it did not compute');
  eq(res.allocator.skipped, true, 'G6b marked skipped, not "0 routes found"');
  ok(!!res.harvest && res.harvest.site_count === 7 && res.harvest.receiver_count === 0,
    'G7  the harvest counts are carried (7 sites, 0 receivers)');
  ok(Array.isArray(res.harvest.errors) && res.harvest.errors.length === 1,
    'G7a and the per-site drop list the harvest used to discard');
  eq(res.required_forecast_months, MONTHS, 'G8  the four required months are stated');
  // §F.7 — the runner still works: the parameter schema is unchanged
  eq(Object.keys(res.scope).sort(), ['company', 'country', 'marketplace', 'sku'],
    'G9  §F.7 the parameter schema is UNCHANGED, so RUN_E3_CENSUS_ONCE is reusable as published');
  // §G — the log is not a single BLOCKED line any more
  ok(logs.length >= 20, 'G10 §F.2 the LOG carries the whole diagnosis (' + logs.length + ' lines), not one BLOCKED line');
  ok(logs.some(function (l) { return /forecast_coverage/.test(l); }), 'G10a including the forecast coverage');
  ok(logs.some(function (l) { return /mapped.readiness_predicates/.test(l); }), 'G10b and the predicates');
  ok(logs.some(function (l) { return /next_blocked_stage/.test(l); }), 'G10c and the next blocked stage');

  // §I.1/§I.16 — and a READY scope still reaches the canonical allocator, in the same harness.
  var calls2 = { kmwrr: 0 };
  var sandbox2 = Object.assign({}, sandbox);
  sandbox2.global = sandbox2;
  sandbox2.weeklyAiPlanHarvest_ = function () {
    return { ok: true, sourceDataAsOf: '2026-09-01', warehousesById: { 'WH-1': {} },
      kmaf: kmafFor([COMPLETE_RECEIVER]), horizonsByDemandRef: HORIZONS, poolsBySku: POOLS,
      errors: [], site_count: 1, receiver_count: 1 };
  };
  sandbox2.KMWRB = { buildWeeklySourceLines: function () { return { ok: true, lines: [{ sku: SKU }] }; } };
  sandbox2.weeklyAiPlanK2AllocatedLines_ = function () { return [{ sku: SKU, marketplace: 'Amazon', planned_qty: 520, window_code: 'D18', source_warehouse_id: 'WH-1', destination: { type: 'MARKETPLACE', marketplace: 'Amazon' } }]; };
  sandbox2.weeklyAiPlanShipDate_ = function () { return '2026-09-01'; };
  sandbox2.KMWRR = { buildK2GenerationPlan: function () {
    calls2.kmwrr++;
    return { groups: [{ groupNo: 1, header: { recommendation_group_no: 1, source_warehouse_id: 'WH-1',
      destination_type: 'MARKETPLACE', destination_marketplace: 'Amazon', recommended_shipping_method: 'M1',
      recommended_last_mile_delivery: 'DDP', expected_arrival_date: '2026-10-01', transit_days: 30 },
      lines: [{ master_sku: SKU, recommended_qty: 520 }] }], blocked: [], conservation: { conserved: true } };
  } };
  var ctx2 = vm.createContext(sandbox2);
  vm.runInContext(TEMP, ctx2, { filename: 'TEMP_census2.gs' });
  var res2 = vm.runInContext('TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3(' + JSON.stringify({
    company: SCOPE.company, country: SCOPE.country, marketplace: SCOPE.marketplace, sku: SKU, expect: { qty: 520 }
  }) + ')', ctx2);
  eq(calls2.kmwrr, 1, 'G11 §I.1/§I.16 a READY scope DOES reach the canonical allocator, exactly once');
  eq(res2.verdict, 'PROCEED', 'G11a and a matching expectation yields PROCEED');
  eq([res2.total_allocated_quantity, res2.would_create_route_count], [520, 1], 'G11b with the quantity and route count');
  eq(res2.mapped.ready, true, 'G11c readiness true...');
  eq(res2.mapped.issues, [], 'G11d ...with no issues');
  eq(res2.forecast_coverage.complete, false,
    'G11e and the forecast coverage is STILL reported even on a ready run (a PARTIAL run is the case nobody could see)');
})();

// ================================================================================================================
section('§H — FLAG SAFETY');
// ================================================================================================================
var flagVal = /var INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = (\w+);/.exec(CFG)[1];
eq(flagVal, 'false', 'H1  §H.3/§H.4 the flag is FALSE: the root cause is not fully fixed, and E3 had already ' +
  'pushed flag=true, so a report alone could not satisfy §H.4');
ok(/REVERTED TO FALSE/.test(CFG), 'H1a and the file records WHY, so this is not read as a lost edit');
ok(/HARVEST_NOT_READY/.test(CFG), 'H1b naming the live refusal that caused it');
ok(/TO RE-ACTIVATE/.test(CFG) && /PROCEED/.test(CFG),
  'H2  §H.5 with the re-activation condition recorded: a census verdict of PROCEED first');
ok(/function inventoryAiPlanDbGenerationEnabled_\(\) \{ return INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ === true; \}/.test(CFG),
  'H3  §H.5 the rollback switch is PRESERVED — one boolean, one accessor');
ok(/inventory_ai_plan_db_generation_enabled: \(typeof inventoryAiPlanDbGenerationEnabled_ === 'function'\)/.test(HLTH),
  'H4  §H.6 system health still reports the EFFECTIVE value...');
ok(/config_build:/.test(HLTH), 'H4a ...and the config build it belongs to');
eq(/var CONFIG_BUILD_VERSION_ = '([^']+)'/.exec(CFG)[1], 'F1-7N-FC-1B-E3-R1', 'H5  the config stamp moved with the change');
ok(new RegExp("\\{ file: '00_config\\.gs', symbol: 'CONFIG_BUILD_VERSION_', expected: 'F1-7N-FC-1B-E3-R1'").test(HLTH),
  'H5a and the manifest expects exactly that');
eq(/var WAP_BUILD_VERSION_ = '([^']+)'/.exec(G61)[1], 'F1-7N-FC-1B-E3-R1',
  'H6  61_ carries a build stamp for the FIRST TIME — it owns the readiness refusal and had none');
ok(new RegExp("\\{ file: '61_api_v1_weekly_ai_plan\\.gs', symbol: 'WAP_BUILD_VERSION_', expected: 'F1-7N-FC-1B-E3-R1'").test(HLTH),
  'H6a registered in the manifest, so a deployment that predates this fix is a NAMED fault');
// §I.14/§I.15 — zero writes in both flag states
ok(/if \(!genEnabled\)/.test(G61) && /INVENTORY_AI_PLAN_DB_GENERATION_DISABLED/.test(G61) && /zero rows written/.test(G61),
  'H7  §I.14 flag FALSE → the server refuses with zero rows');
// The handler's OWN extent, taken with the brace matcher. Slicing to a guessed end marker gave an empty
// string when the marker sat before the function, and an empty string makes every ordering claim vacuously
// true - a dirty baseline, which is worse than a failure.
var GENFN = code(extractFn(G61, 'handleGenerateWeeklyAiPlanDraft_'));
ok(GENFN.length > 2000, 'H0  the generation handler was extracted (' + GENFN.length + ' chars) - the ordering ' +
  'claims below are measured on real text');
(function flagTrueNotReadyStillZero() {
  var gen = GENFN;
  var readyGate = gen.indexOf('if (!mapped.ready)');
  var depsCall = gen.indexOf('weeklyAiPlanPersistenceDeps_');
  var genCall = gen.indexOf('weeklyAiPlanGenerateK2_');
  ok(readyGate !== -1 && depsCall !== -1 && readyGate < depsCall,
    'H8  §I.15 the READINESS GATE precedes the writer construction — flag true + not ready still writes nothing');
  ok(readyGate < genCall, 'H8a and precedes the generation call');
})();

// ================================================================================================================
section('§J — RELEASE IDENTITY');
// ================================================================================================================
eq(RO.currentAppToken(), 'fc1b-e3r1-readiness-20260903', 'J1  this round mints its own cache token');
ok(RO.tokenIndex(RO.currentAppToken()) > RO.tokenIndex('fc1b-e3-aiplanactive-20260903'),
  'J1a strictly after E3\'s, which was PUBLISHED (origin/main carries it)');
eq((INDEX.match(/\?v=fc1b-e3-aiplanactive-20260903/g) || []).length, 0, 'J2  zero production refs remain on it');
eq(RO.staleAppTokenRefs(INDEX).join(' | '), '', 'J2a and nothing is left behind on any superseded token');
eq(RO.parseIndexTokens(INDEX)['assets/js/pages/inventory-replenishment.js'], RO.currentAppToken(),
  'J3  the page carries it — it is the ONE browser asset this round changes');
eq(RO.parseIndexTokens(INDEX)[RO.IR_CSS_FILE], RO.currentIrCssToken(),
  'J4  and the stylesheet stays on its own family\'s token: it did NOT change this round');
ok(RO.stampAtOrAfter('F1-7N-FC-1B-E3-R1', 'F1-7N-FC-1B-E3'), 'J5  the owner stamp is recorded, after E3\'s');
ok(RO.BUILD_STAMP_RE.test('F1-7N-FC-1B-E3-R1'), 'J5a and the shared stamp validator accepts it');
// the bundle carries the readiness vocabulary
(function bundle() {
  var B = read('assets/specs/active/apps-script/90_generated_supply_planning_bundle.gs');
  ok(/READINESS_CODES/.test(B), 'J6  §I.23 the regenerated bundle carries the readiness vocabulary...');
  ok(/f1-7n-fc-1b-e3-r1-readiness/.test(B), 'J6a ...at the new module version');
  ok(!/d782ea6d8d4f97f7031fd9718b16020628e4a3a92b5984f8895a2198a61c36ac/.test(B),
    'J6b and it is NOT the pre-R1 bundle (the adapter is a bundle source, so a rebuild is REQUIRED)');
})();

// ================================================================================================================
section('§I — MUTATIONS');
// ================================================================================================================
mut('N1  ready:false with an empty issues list', function () {
  var m = swap(ADAPTER_SRC, '      if (!eng.length) {', '      if (false) {');
  var mod = { exports: {} };
  new Function('module', 'exports', m)(mod, mod.exports);
  var r = mod.exports.mapWeeklyHarvestToBatchRequest(harvestFixture({ kmaf: ZERO }));
  return r.ready === false && r.issues.length === 0;
});
mut('N2  the source timestamp replaced with a clock reading', function () {
  var m = swap(ADAPTER_SRC, "    var sourceDataAsOf = harvest.sourceDataAsOf === undefined ? null : harvest.sourceDataAsOf;",
    "    var sourceDataAsOf = harvest.sourceDataAsOf || new Date().toISOString().slice(0, 10);");
  return /new Date\(\)/.test(ops(m));
});
mut('N3  a missing field silently defaulted', function () {
  var m = swap(ADAPTER_SRC, '    if (!nonEmpty(sourceDataAsOf)) {', '    if (false) {');
  var mod = { exports: {} };
  new Function('module', 'exports', m)(mod, mod.exports);
  var r = mod.exports.mapWeeklyHarvestToBatchRequest(harvestFixture({ kmaf: ONE, horizonsByDemandRef: HORIZONS, poolsBySku: POOLS, sourceDataAsOf: '' }));
  return r.warnings.length === 0;   // the blank is no longer reported at all
});
mut('N4  the UI swallows the issues', function () {
  var m = swap(PAGE, '        if (cls.readiness) {', '        if (false) {');
  return !/if \(cls\.readiness\) \{/.test(code(extractFn(m, '_irRunInventoryAiPlanGeneration_')));
});
mut('N5  a generic HARVEST_NOT_READY replaces the typed issue', function () {
  // The typed block is carried under `details` because that is the ONLY sub-object the browser transport
  // preserves. Moving it anywhere else is the defect, and the check has to be for the ABSENCE of the
  // preserved key - `notdetails` still contains the substring `details`, which is how the first version of
  // this probe passed its own mutation.
  var m = swap(G61, "        errors: [weeklyAiPlanErr_('HARVEST_NOT_READY', _rdMsg, {\n          details: {",
    "        errors: [weeklyAiPlanErr_('HARVEST_NOT_READY', _rdMsg, {\n          topLevelIssues: {");
  return !/_rdMsg, \{\r?\n\s*details: \{/.test(m) && /topLevelIssues/.test(m);
});
mut('N6  the classifier goes back to reading only the plural `errors`', function () {
  var m = swap(PAGE, '    var _e1 = (res && res.error) ? res.error : null;', '    var _e1 = null;');
  var f = new Function('res', code(extractFn(m, '_irClassifyGenerationResult_')) + ' return _irClassifyGenerationResult_(res);');
  var c = f(REFUSAL);
  return c.readiness === null && c.errors.length === 0;
});
mut('N7  the writer is constructed before readiness', function () {
  var m = swap(GENFN, 'if (!mapped.ready) {', 'var _early = weeklyAiPlanPersistenceDeps_(ss);\n    if (!mapped.ready) {');
  return m.indexOf('weeklyAiPlanPersistenceDeps_') !== -1 &&
    m.indexOf('weeklyAiPlanPersistenceDeps_') < m.indexOf('if (!mapped.ready)');
});
mut('N8  the allocator is called while not ready', function () {
  var m = swap(TEMP, '  if (notReady || !mine.length) {', '  if (false) {');
  return !/if \(notReady \|\| !mine\.length\) \{/.test(m);
});
mut('N9  the flag bypasses the readiness gate', function () {
  var m = swap(GENFN, 'if (!mapped.ready) {', 'if (!mapped.ready && !genEnabledBypass) {');
  return /!genEnabledBypass/.test(m) && !/if \(!mapped\.ready\) \{/.test(m);
});
mut('N10 the census early return loses the diagnosis', function () {
  var m = swap(TEMP, 'out.elapsed_ms = Date.now() - t0; CENSUS_logAll_(out); return out;',
    "CENSUS_log_('BLOCKED', out.blockers); return out;");
  return !/CENSUS_logAll_\(out\); return out;\s*\n\s*\}\s*\n\s*if \(\/\^all/.test(m) &&
    /CENSUS_log_\('BLOCKED', out\.blockers\); return out;/.test(m);
});
mut('N11 the harvest goes back to discarding its per-site drops', function () {
  // BOTH success returns carry `errors` now, so a check for the substring passes while one of them is broken.
  // The mutation targets the main return and the check names that exact line.
  var anchor = '    errors: errors, site_count: sites.length, receiver_count: (built.receivers || []).length';
  var m = swap(G61, anchor, '    site_count: sites.length');
  return G61.indexOf(anchor) !== -1 && m.indexOf(anchor) === -1;
});
mut('N12 the readiness decision is TIGHTENED behind the diagnosis', function () {
  var m = swap(ADAPTER_SRC, '    if (!pKmafPresent || !pKmafReady || !pFactsArray) {',
    '    if (!pKmafPresent || !pKmafReady || !pFactsArray || !nonEmpty(sourceDataAsOf)) {');
  var mod = { exports: {} };
  new Function('module', 'exports', m)(mod, mod.exports);
  var r = mod.exports.mapWeeklyHarvestToBatchRequest(harvestFixture({ kmaf: ONE, horizonsByDemandRef: HORIZONS, poolsBySku: POOLS, sourceDataAsOf: '' }));
  return r.ready === false;   // the PRE gate says true — a silent tightening
});

report();
}).catch(function (e) { console.error('ASYNC ERROR', e && e.stack || e); fail++; report(); });

function report() {
  console.log('\n----------------------------------------');
  console.log('CANONICAL HARVEST READINESS + TYPED REFUSAL (F1-7N-FC-1B-E3-R1): ' + pass + ' passed, ' + fail + ' failed');
  console.log('mutations: ' + neg.caught + ' caught, ' + neg.missed + ' missed');
  process.exitCode = fail ? 1 : 0;
}
