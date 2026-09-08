// Kitchen Mama Operation System — F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R4
// Weekly AI Plan NO_ACTION latency + write-transport bound.
// Run: node assets/tests/weekly-ai-plan-no-action-latency-and-write-transport-bound-f1-7n-fc-1b-e3-r4-a2-r1-r6-r7-r4.test.js
//
// WHAT WAS MEASURED, and what it ruled out.
//
// One controlled Generate for ResUS/US/Amazon/CO1100-R: attempts 1, elapsed_ms 90 002, phase TIMEOUT,
// outcome ACK_UNKNOWN, code REQUEST_TIMEOUT_WRITE_INDETERMINATE. The browser audit saw exactly one generation
// request, one mutation request, no unexpected mutations, no route-save, no submit, no reservation. The
// database readback then answered AWAITING_BROWSER_AUDIT with 54 predicates passed and 0 failed: new_rows 0,
// changed_field_count 0, db_writes 0, both manual routes byte-identical across all 67 columns.
//
// So the request was NOT slow because it was writing — nothing was written. And the POST_ACTIVATION preflight,
// which answers the same question, returned promptly with would_write false and writer_reached false. A slow
// path and a fast path were computing the same answer, and only one of them was on the critical path.
//
// §A — THE ROOT CAUSE, and it is a control-flow defect, not a tuning problem.
//
//   browser        handleReplenAiPlan -> _irAiPlanRun_ -> _irRunInventoryAiPlanGeneration_
//                  bounded by IR_AI_PLAN_CLIENT_TIMEOUT_MS_        (inventory-replenishment.js)
//   DB adapter     window.KM.DB.generateWeeklyAiPlanDraft -> _kmWeeklyCommand_('weeklyAiPlan.generate')
//   transport      _kmFetchBounded_(url, init, 'write', action)     (operation-system-db-api.js)
//                  bounded by _kmTimeoutMs_('write', action)        <- expired at 90 000 ms
//   router         01_router.gs, action 'weeklyAiPlan.generate'
//   handler        handleGenerateWeeklyAiPlanDraft_                 (61_api_v1_weekly_ai_plan.gs)
//   harvest        weeklyAiPlanHarvest_
//   decision       weeklyAiPlanNoActionDecision_(recState, planned)  <- THE ANSWER, mid-harvest
//
// The decision is reached mid-harvest, from `weeklyAiPlanRecommendationState_` and
// `weeklyAiPlanQualifyingPlannedQty_`. Everything after it, on a scope whose answer is "do nothing", was work
// the answer does not depend on: weeklyAiPlanBuildKmafReceivers_ (reads fc_regular_forecast, builds a forecast
// read context, loops every site), KMAF.projectAllocationFacts (the allocation engine), the horizon join-back
// map, and then KMWHA.mapWeeklyHarvestToBatchRequest in the handler — because NO_ACTION was reachable only
// from inside `if (!mapped.ready)`.
//
// WHAT WAS RULED OUT, so this is not a guess:
//   • not a write         — db_writes 0, 0 new rows, 0 changed fields, measured in the database
//   • not a lock wait     — LockService appears once in 61_, inside weeklyAiPlanPersistenceDeps_, which the
//                           handler calls AFTER the no-action return and which NO_ACTION never reaches (§C4)
//   • not a retry         — attempts 1, and _kmWeeklyCommand_ never auto-retries a timed-out write
//   • not repeated reads of one table — §A2 counts them
//   • the fast path exists in the same file — weeklyAiPlanControlledDecision_ answers from two sheet reads
//                           and two pure functions, which is why the preflight was prompt (§A3)

var fs = require('fs'), path = require('path'), vm = require('vm');
var pass = 0, fail = 0, neg = { caught: 0, missed: 0 };
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
var NL = String.fromCharCode(10);

var G61 = read('assets/specs/active/apps-script/61_api_v1_weekly_ai_plan.gs').replace(/\r\n/g, NL);
var G63 = read('assets/specs/active/apps-script/63_api_v1_system_health.gs').replace(/\r\n/g, NL);
var G66 = read('assets/specs/active/apps-script/66_api_v1_request_order_send.gs').replace(/\r\n/g, NL);
var G00 = read('assets/specs/active/apps-script/00_config.gs').replace(/\r\n/g, NL);
var API = read('assets/js/api/operation-system-db-api.js').replace(/\r\n/g, NL);
var PAGE = read('assets/js/pages/inventory-replenishment.js').replace(/\r\n/g, NL);
var CENSUS = read('assets/tools/apps-script-diagnostics/TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3.gs').replace(/\r\n/g, NL);
var IDX = read('index.html');
var RO = require('./_release-order.js');
var STAMP = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R4';

// The measured facts this round is built on. Named once so no assertion restates them.
var MEASURED_ELAPSED_MS = 90002;
var OLD_SHARED_BOUND_MS = 90000;

function extractFn(src, name) {
  var s = src.indexOf('function ' + name + '(');
  if (s < 0) throw new Error('missing ' + name);
  var i = src.indexOf('{', s), d = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (!d) return src.slice(s, i + 1); }
  }
  throw new Error('unbalanced ' + name);
}
function extractVar(src, name) {
  var m = new RegExp('var ' + name + '\\s*=').exec(src);
  if (!m) throw new Error('missing var ' + name);
  var i = src.indexOf('=', m.index) + 1, d = 0, q = null;
  for (; i < src.length; i++) {
    var c = src[i], n = src[i + 1];
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
    if (c === '/' && n === '/') { i = src.indexOf(NL, i); continue; }
    if (c === '/' && n === '*') { i = src.indexOf('*/', i); i++; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === '(' || c === '[' || c === '{') d++;
    else if (c === ')' || c === ']' || c === '}') d--;
    else if (c === ';' && d === 0) return src.slice(m.index, i + 1);
  }
  throw new Error('unterminated var ' + name);
}
function swap(src, a, b) {
  if (src.indexOf(a) < 0) throw new Error('swap anchor not found: ' + a.slice(0, 90));
  return src.split(a).join(b);
}

// ================================================================================================================
section('A — the timing chain, and where the wasted work sits in it');
// ================================================================================================================
var HARVEST = extractFn(G61, 'weeklyAiPlanHarvest_');
var HANDLER = extractFn(G61, 'handleGenerateWeeklyAiPlanDraft_');

// A1 — ORDER, by character offset in the shipped source. Not prose: a claim that flips if the gate moves.
var oDecision = HARVEST.indexOf('var _noAction = weeklyAiPlanNoActionDecision_(');
var oShort = HARVEST.indexOf('if (_noAction && _noAction.noAction === true) {');
var oBuild = HARVEST.indexOf('weeklyAiPlanBuildKmafReceivers_(ss, scope, sites, upcBySku, errors)');
var oKmaf = HARVEST.indexOf('KMAF.projectAllocationFacts(');
ok(oDecision > 0 && oShort > 0 && oBuild > 0 && oKmaf > 0, 'A1  all four landmarks exist in the harvest');
ok(oDecision < oShort, 'A1a the decision is made BEFORE the short-circuit that reads it');
ok(oShort < oBuild, 'A1b the short-circuit returns BEFORE the KMAF receiver build');
ok(oBuild < oKmaf, 'A1c which itself precedes the allocation projection');

var oGate = HANDLER.indexOf('var _naFast = weeklyAiPlanK2NoAction_(h);');
var oMapper = HANDLER.indexOf('KMWHA.mapWeeklyHarvestToBatchRequest(');
var oHarvestCall = HANDLER.indexOf('weeklyAiPlanHarvest_(ss, {');
ok(oGate > 0 && oMapper > 0, 'A2  the handler has a no-action gate and a mapper call');
ok(oHarvestCall < oGate && oGate < oMapper,
  'A2a the gate sits between the harvest and the mapper — NOT inside the mapper\'s failure branch');
// The old shape is gone: NO_ACTION must no longer be reachable ONLY from a mapper failure.
var mapperFailBranch = HANDLER.slice(HANDLER.indexOf('if (!mapped.ready) {'));
ok(mapperFailBranch.indexOf('weeklyAiPlanK2NoAction_') >= 0,
  'A2b the mapper-failure branch KEEPS its own no-action call — a faster path is not a reason to remove a net');
eq((HANDLER.match(/weeklyAiPlanK2NoAction_\(/g) || []).length, 2,
  'A2c so the handler asks twice: once before the mapper, once inside its failure branch');

// A3 — THE FAST PATH IS IN THE SAME FILE, and that is the proof the work is optional rather than intrinsic.
var CTRL = extractFn(G61, 'weeklyAiPlanControlledDecision_');
['weeklyAiPlanCanonicalDemand_', 'weeklyAiPlanTargetScopes_', 'weeklyAiPlanRecommendationState_',
 'weeklyAiPlanQualifyingPlannedQty_', 'weeklyAiPlanNoActionDecision_'
].forEach(function (n) { ok(CTRL.indexOf(n) >= 0, 'A3  the fast decision path calls ' + n); });
['KMAF', 'weeklyAiPlanBuildKmafReceivers_', 'weeklyAiPlanEnumerateSites_', 'mapWeeklyHarvestToBatchRequest',
 'gapOpReadSupplyPoolFacts_', 'fc_regular_forecast'
].forEach(function (n) {
  ok(CTRL.indexOf(n) === -1, 'A3a and it does NOT touch ' + n + ' — the same answer, without that work');
});

// A4 — NOT A LOCK WAIT. LockService is reached only through the persistence deps, and NO_ACTION never gets there.
var LOCK_LINES = G61.split(NL).filter(function (l) { return /LockService\.|tryLock\(|waitLock\(/.test(l); });
eq(LOCK_LINES.length, 2, 'A4  LockService appears on exactly two lines of 61_');
var DEPS = extractFn(G61, 'weeklyAiPlanPersistenceDeps_');
ok(DEPS.indexOf('LockService.getScriptLock()') >= 0, 'A4a both inside weeklyAiPlanPersistenceDeps_');
ok(HANDLER.indexOf('weeklyAiPlanPersistenceDeps_(ss)') > oGate,
  'A4b which the handler calls AFTER the no-action gate, so a valid zero never waits on a lock');
ok(HARVEST.indexOf('LockService') === -1 && CTRL.indexOf('LockService') === -1,
  'A4c and neither the harvest nor the decision path takes a lock at all');

// A5 — NOT REPEATED READS OF ONE TABLE on the decision path.
var decisionPathFns = ['weeklyAiPlanCanonicalDemand_', 'weeklyAiPlanQualifyingPlannedQty_'];
var reads = [];
decisionPathFns.forEach(function (n) {
  var src = extractFn(G61, n);
  (src.match(/gapReadObjects_\(ss, '[a-z_]+'\)|getSheetByName\([^)]*\)/g) || []).forEach(function (r) { reads.push(n + ' :: ' + r); });
});
console.log('     decision-path table reads: ' + JSON.stringify(reads));
eq(reads.length, reads.filter(function (r, i) { return reads.indexOf(r) === i; }).length,
  'A5  no table is read twice by the same function on the decision path');

// ================================================================================================================
section('B — the harvest control flow, EXECUTED with instrumented seams');
// ================================================================================================================
// The shipped `weeklyAiPlanHarvest_` is run for real. Everything it calls before the decision is a stub that
// returns a plausible shape; the REAL `weeklyAiPlanNoActionDecision_` computes the decision, so the branch is
// taken on a genuine verdict. The two seams AFTER the decision are spies. Nothing here reimplements the
// function under test — only its edges.
function harvestRun(opts) {
  opts = opts || {};
  var calls = { buildReceivers: 0, kmaf: 0, poolFacts: 0, canonical: 0, enumerate: 0, planned: 0, asOf: 0 };
  var site = { marketplace: 'Amazon', sku: 'CO1100-R', siteSku: 'CO1100-R', destinationWarehouseId: 'WH1',
    cumulativeGapByWindow: {}, requiredByByWindow: {}, fulfillmentModel: 'FBA', allocationPriority: 1,
    unitsPerCarton: 6, sourceDataAsOf: '2026-09-07' };
  var recState = opts.recState || { state: 'VALID_ZERO_RECOMMENDATION', recommended_qty_total: 0,
    per_scope: [{ key: 'ResUS|US|Amazon|CO1100-R', marketplace: 'Amazon', sku: 'CO1100-R', recommended_qty: 0 }],
    missing_reasons: [], authority_rule: 'FURTHEST_WINDOW', accepted_calculation_date: '2026-09-07',
    current_run: 'GAP-INV-20260907T132344-0001' };
  var planned = opts.planned || { byKey: { 'ResUS|US|Amazon|CO1100-R': 520 }, rows: [], excluded: {},
    authority: 'EXACT_FOUR_AXIS', provenance_authority: 'MANUAL' };
  var sb = { console: { log: function () {}, error: function () {} }, JSON: JSON, String: String,
    Number: Number, isFinite: isFinite, Array: Array, Object: Object, Math: Math, Date: Date, __calls: calls };
  vm.createContext(sb);
  vm.runInContext([
    extractVar(G61, 'WAP_GAP_TABLE_'),
    extractVar(G61, 'WAP_RECOMMENDATION_STATES_'),
    extractVar(G61, 'WAP_NO_ACTION_CODE_'),
    extractFn(G61, 'weeklyAiPlanStr_'),
    extractFn(G61, 'weeklyAiPlanQty_'),
    extractFn(G61, 'weeklyAiPlanErr_'),
    extractFn(G61, 'weeklyAiPlanResidualQty_'),
    // THE REAL DECISION. The branch below must be taken on a genuine verdict, not on a stubbed boolean.
    extractFn(G61, 'weeklyAiPlanNoActionDecision_'),
    'function gapCalcResolveContext_() { return { ok: true, calculationDate: "2026-09-07" }; }',
    'function gapOpReadSupplyPoolFacts_() { __calls.poolFacts++; return { pools: [] }; }',
    'function recGenUpcBySku_() { return {}; }',
    'function weeklyAiPlanWarehousesById_() { return { WH1: { id: "WH1" } }; }',
    'function weeklyAiPlanCanonicalDemand_() { __calls.canonical++; return { ok: true, freshness: "CURRENT_AFTER_REFRESH",'
      + ' acceptedDate: "2026-09-07", schedule: {}, jobState: {}, distinctDates: ["2026-09-07"],'
      + ' dateNormalization: null }; }',
    'function weeklyAiPlanEnumerateSites_() { __calls.enumerate++; return [' + JSON.stringify(site) + ']; }',
    'function weeklyAiPlanTargetScopes_() { return { ok: true, scopes: [{ company: "ResUS", country: "US",'
      + ' marketplace: "Amazon", sku: "CO1100-R" }], requested_marketplace: "Amazon" }; }',
    'function weeklyAiPlanIsolateSites_(s) { return { sites: s, target_site_count: s.length, target_sku_count: 1,'
      + ' foreign_site_count: 0, foreign_sku_count: 0, foreign_sample: [] }; }',
    'function weeklyAiPlanCollapseCanonicalDemand_(s) { return { sites: s, canonical_demand_count: s.length,'
      + ' collapsed_site_count: s.length, conflicts: [], conflict_count: 0 }; }',
    'function weeklyAiPlanRecommendationState_() { return ' + JSON.stringify(recState) + '; }',
    'function weeklyAiPlanQualifyingPlannedQty_() { __calls.planned++; return ' + JSON.stringify(planned) + '; }',
    'function weeklyAiPlanNetSitesByResidual_() { return { byKey: {} }; }',
    'function weeklyAiPlanSourceDataAsOfAuthority_() { __calls.asOf++; return { ok: true, date: "2026-09-07",'
      + ' run_id: "GAP-INV-20260907T132344-0001", lineage: { run_id: "GAP-INV-20260907T132344-0001" } }; }',
    'function weeklyAiPlanPoolsBySku_() { return {}; }',
    'function inventoryAiPlanActivationAllowlist_() { return []; }',
    // THE SPIES — the work a valid zero must not pay for.
    'function weeklyAiPlanBuildKmafReceivers_() { __calls.buildReceivers++;'
      + ' return { fatal: false, receivers: [], kmafWarehouses: [], horizonRows: [], calculationDate: "2026-09-01" }; }',
    'var KMAF = { projectAllocationFacts: function () { __calls.kmaf++; return { ready: true, receiverFacts: [],'
      + ' planningFacts: [] }; } };',
    opts.harvest || HARVEST
  ].join(NL), sb);
  var out = vm.runInContext(
    'weeklyAiPlanHarvest_({ getId: function () { return "PROD-BOOK"; } },'
    + ' { company: "ResUS", country: "US", marketplace: "Amazon", planningCycle: "2026-09" }, null)', sb);
  return { out: out, calls: calls };
}

var B = harvestRun();
eq(B.out.ok, true, 'B1  a valid zero over a fully-covering plan harvests successfully');
eq(B.out.no_action_short_circuit, true, 'B1a and reports that it short-circuited');
eq(B.out.noActionDecision.noAction, true, 'B1b carrying an affirmative no-action decision');
eq(B.out.noActionDecision.reason, 'VALID_ZERO_RECOMMENDATION', 'B1c named VALID_ZERO_RECOMMENDATION');
eq([B.calls.buildReceivers, B.calls.kmaf], [0, 0],
  'B2  THE MEASUREMENT: the KMAF receiver build and the allocation projection were NEVER CALLED');
eq(B.out.kmaf, { ready: true, receiverFacts: [], planningFacts: [] },
  'B2a and the harvest still returns the empty-but-ready kmaf shape downstream readers expect');
eq(B.out.horizonsByDemandRef, {}, 'B2b with an empty horizon map rather than a missing one');
// The short-circuit must carry the SAME lineage a full harvest does, or a zero answer is a lesser answer.
['recommendationState', 'qualifyingPlanned', 'residual', 'noActionDecision', 'sourceDataAsOf',
 'sourceDataAsOfAuthority', 'gapLineage', 'isolation', 'snapshot_freshness', 'accepted_snapshot_date',
 'warehousesById', 'poolsBySku'
].forEach(function (k) {
  ok(B.out[k] !== undefined, 'B3  the short-circuit carries ' + k);
});
eq(B.out.sourceDataAsOf, '2026-09-07', 'B3a with the GAP-INV cutoff resolved, exactly as a full harvest does');
eq(B.calls.asOf, 1, 'B3b so the as-of authority is still consulted once — the lineage is not skipped');
eq(B.out.site_count, 1, 'B3c and it reports the real site count, not 0 — this is not the zero-site return');

// THE WRITE PATH MUST BE UNCHANGED. A non-zero recommendation still pays for the pipeline, on purpose.
var Bw = harvestRun({ recState: { state: 'NONZERO_RECOMMENDATION', recommended_qty_total: 300,
    per_scope: [{ key: 'ResUS|US|Amazon|CO1100-R', marketplace: 'Amazon', sku: 'CO1100-R', recommended_qty: 300 }],
    missing_reasons: [], authority_rule: 'FURTHEST_WINDOW' },
  planned: { byKey: {}, rows: [], excluded: {}, authority: 'EXACT_FOUR_AXIS' } });
eq(Bw.out.ok, true, 'B4  a NON-ZERO recommendation still harvests successfully');
eq(!!Bw.out.no_action_short_circuit, false, 'B4a and does NOT short-circuit');
eq([Bw.calls.buildReceivers, Bw.calls.kmaf], [1, 1],
  'B4b it builds receivers and runs the allocation projection exactly once each — the write path is untouched');

// A residual left over is NOT a no-action either: it is the case that must still reach the allocator.
var Br = harvestRun({ recState: { state: 'NONZERO_RECOMMENDATION', recommended_qty_total: 800,
    per_scope: [{ key: 'ResUS|US|Amazon|CO1100-R', marketplace: 'Amazon', sku: 'CO1100-R', recommended_qty: 800 }],
    missing_reasons: [], authority_rule: 'FURTHEST_WINDOW' } });
eq(Br.out.noActionDecision.reason, 'RESIDUAL_REMAINS', 'B5  520 planned against 800 recommended leaves a residual');
eq([Br.calls.buildReceivers, Br.calls.kmaf], [1, 1], 'B5a and a residual still reaches the allocator');

// FULLY_COVERED is a no-action too, and it must short-circuit for the same reason a valid zero does.
var Bc = harvestRun({ recState: { state: 'NONZERO_RECOMMENDATION', recommended_qty_total: 520,
    per_scope: [{ key: 'ResUS|US|Amazon|CO1100-R', marketplace: 'Amazon', sku: 'CO1100-R', recommended_qty: 520 }],
    missing_reasons: [], authority_rule: 'FURTHEST_WINDOW' } });
eq(Bc.out.noActionDecision.reason, 'FULLY_COVERED_BY_ACTIVE_PLAN', 'B6  520 planned against 520 recommended is fully covered');
eq(Bc.out.no_action_short_circuit, true, 'B6a which short-circuits as well');
eq([Bc.calls.buildReceivers, Bc.calls.kmaf], [0, 0], 'B6b paying for none of the pipeline');

// A MISSING recommendation is NOT a no-action: it is a refusal, and it must not be short-circuited into one.
var Bm = harvestRun({ recState: { state: 'MISSING_RECOMMENDATION', recommended_qty_total: null, per_scope: [],
    missing_reasons: [{ key: 'ResUS|US|Amazon|CO1100-R', reason: 'ROW_ABSENT' }], authority_rule: 'FURTHEST_WINDOW' } });
eq(Bm.out.noActionDecision.noAction, false, 'B7  a MISSING recommendation is not a no-action');
eq(!!Bm.out.no_action_short_circuit, false, 'B7a so it does not short-circuit');
eq([Bm.calls.buildReceivers, Bm.calls.kmaf], [1, 1],
  'B7b a scope nobody could read is not a scope with nothing in it, and it keeps taking the long road');

// ================================================================================================================
section('C — the NO_ACTION response contract, at the new path');
// ================================================================================================================
var NOACT = extractFn(G61, 'weeklyAiPlanNoActionResponse_');
var Cenv = (function () {
  var sb = { JSON: JSON, String: String, Number: Number };
  vm.createContext(sb);
  vm.runInContext(extractVar(G61, 'WAP_NO_ACTION_CODE_') + NL + NOACT + NL
    + 'var R = weeklyAiPlanNoActionResponse_({ reason: "VALID_ZERO_RECOMMENDATION",'
    + ' recommendation_state: "VALID_ZERO_RECOMMENDATION", recommended_qty: 0,'
    + ' qualifying_planned_qty: 520, residual_qty: 0, per_scope: [] },'
    + ' { planning_cycle: "2026-09", site_count: 1, source_data_as_of: "2026-09-07" });', sb);
  return sb.R;
})();
var CD = Cenv.data;
var COUNTERS = ['created_headers', 'created_lines', 'updated_headers', 'updated_lines',
  'cancelled_headers', 'cancelled_lines', 'expired_headers', 'expired_lines', 'reservations', 'db_writes'];
eq(Cenv.success, true, 'C1  the envelope is a typed success');
eq([CD.outcome, CD.code], ['AI_PLAN_NO_ACTION', 'NO_REPLENISHMENT_REQUIRED'], 'C1a naming the outcome and code');
eq(COUNTERS.filter(function (k) { return typeof CD[k] !== 'number'; }), [],
  'C2  every counter is of type number — not null, not undefined, not a string');
eq(COUNTERS.map(function (k) { return CD[k]; }), [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'C2a and every one is 0');
var CJSON = JSON.stringify(Cenv);
eq(COUNTERS.filter(function (k) { return CJSON.indexOf('"' + k + '":0') === -1; }), [],
  'C2b each survives JSON.stringify as a bare 0');
ok(!/"(created_headers|reservations|db_writes|cancelled_lines)":\s*(null|"0"|undefined)/.test(CJSON),
  'C2c and none of them serializes as null, as a quoted string, or as undefined');
eq(CD.writer_reached, false, 'C3  writer_reached is false');
eq(typeof CD.writer_reached, 'boolean', 'C3a as a boolean');
eq([CD.routes, CD.groups], [[], []], 'C3b routes and groups are empty arrays');
eq([CD.recommended_qty, CD.qualifying_planned_qty, CD.residual_qty], [0, 520, 0], 'C4  0 / 520 / 0');
// §C4 of the task: no writer is constructed, nothing is created, updated, cancelled or reserved.
['LockService', 'getRange', 'setValue', 'appendRow', 'weeklyAiPlanPersistenceDeps_', 'acquireLock'
].forEach(function (n) { ok(NOACT.indexOf(n) === -1, 'C5  the builder does not touch ' + n); });

// ================================================================================================================
section('D — the write-transport bound, EXECUTED against a fake clock');
// ================================================================================================================
// _kmFetchBounded_ is run for real, with a fake fetch that settles at a chosen moment and a fake clock, so the
// bound is measured rather than read off a constant. No test waits a real second.
var API_MS = Number((API.match(/'weeklyAiPlan\.generate': (\d+)/) || [])[1]);
var SHARED_MS = Number((API.match(/var KM_WRITE_TIMEOUT_MS_ = (\d+);/) || [])[1]);
var READ_MS = Number((API.match(/var KM_READ_TIMEOUT_MS_ = (\d+);/) || [])[1]);
var PAGE_MS = Number((PAGE.match(/var IR_AI_PLAN_CLIENT_TIMEOUT_MS_ = (\d+);/) || [])[1]);

eq(SHARED_MS, OLD_SHARED_BOUND_MS, 'D1  the SHARED write bound is unchanged at 90 000 ms');
ok(API_MS > MEASURED_ELAPSED_MS,
  'D1a and this action has its own bound, above the 90 002 ms the evidence rules out');
eq(API_MS, 180000, 'D1b which is 180 000 ms');
ok(PAGE_MS > API_MS, 'D2  the page bound exceeds the bound the transport will apply to this action');
eq(PAGE_MS, 210000, 'D2a at 210 000 ms');
// THE RELATION IS THE RULE. Stated as an ordered chain so a later round cannot satisfy it by luck.
eq([READ_MS < SHARED_MS, SHARED_MS <= API_MS, API_MS < PAGE_MS], [true, true, true],
  'D3  read < shared write <= this action <= page: each layer bounds the one inside it');

function boundedRun(opts) {
  var calls = { fetch: 0, abort: 0 };
  var NOW = 0, TIMERS = [];
  var sb = {
    console: { log: function () {}, error: function () {} }, JSON: JSON, String: String, Number: Number,
    Math: Math, Promise: Promise, Error: Error, Object: Object,
    setTimeout: function (fn, ms) { TIMERS.push({ at: NOW + (Number(ms) || 0), fn: fn }); return TIMERS.length; },
    clearTimeout: function (h) { if (h && TIMERS[h - 1]) TIMERS[h - 1].fn = null; },
    AbortController: function () { calls.abortCtl = true; this.signal = { aborted: false };
      var self = this; this.abort = function () { calls.abort++; self.signal.aborted = true; }; },
    fetch: function () {
      calls.fetch++;
      return new Promise(function (resolve, reject) {
        if (opts.settleAt !== null && opts.settleAt !== undefined) {
          sb.setTimeout(function () { resolve({ ok: true, status: 200 }); }, opts.settleAt);
        }
      });
    }
  };
  sb.window = { KM_REQUEST_TIMEOUT_MS: opts.override || null };
  vm.createContext(sb);
  vm.runInContext([
    extractVar(API, 'KM_READ_TIMEOUT_MS_'), extractVar(API, 'KM_WRITE_TIMEOUT_MS_'),
    extractVar(API, 'KM_ACTION_WRITE_TIMEOUT_MS_'),
    extractFn(API, '_kmTimeoutMs_'),
    // KEPT async: the shipped function awaits inside, and it already returns a promise - which is exactly
    // what the fake clock below needs to observe.
    'async ' + (opts.fetchBounded || extractFn(API, '_kmFetchBounded_'))
  ].join(NL), sb);
  var res = { settled: null, err: null };
  vm.runInContext('var P = _kmFetchBounded_("u", {}, "' + (opts.kind || 'write') + '", '
    + (opts.action ? JSON.stringify(opts.action) : 'undefined') + ');', sb);
  sb.P.then(function (v) { res.settled = v; }, function (e) { res.err = e; });
  function advanceTo(ms) {
    NOW = ms;
    for (;;) {
      var due = TIMERS.filter(function (t) { return t.fn && t.at <= NOW; }).sort(function (a, b) { return a.at - b.at; });
      if (!due.length) return;
      var t = due[0], f = t.fn; t.fn = null; f();
    }
  }
  function settle() {
    var p = Promise.resolve();
    for (var i = 0; i < 30; i++) p = p.then(function () { advanceTo(NOW); });
    return p;
  }
  return { res: res, calls: calls, advanceTo: advanceTo, settle: settle,
    ms: vm.runInContext('_kmTimeoutMs_("' + (opts.kind || 'write') + '", '
      + (opts.action ? JSON.stringify(opts.action) : 'undefined') + ')', sb) };
}

var Dg = boundedRun({ action: 'weeklyAiPlan.generate' });
eq(Dg.ms, 180000, 'D4  _kmTimeoutMs_("write", "weeklyAiPlan.generate") resolves to 180 000');
eq(boundedRun({ action: 'upsertShippingAllocationDraftAtomic' }).ms, 90000,
  'D4a another write action still gets the shared 90 000');
eq(boundedRun({}).ms, 90000, 'D4b and a write with NO action given gets the shared bound — previous behaviour kept');
eq(boundedRun({ kind: 'read', action: 'weeklyAiPlan.generate' }).ms, 45000,
  'D4c a READ is unaffected by a write-action entry');
eq(boundedRun({ action: 'weeklyAiPlan.generate', override: { write: 5000 } }).ms, 5000,
  'D4d and an explicit operator override still wins over everything');

// D5 — the 90 002 ms answer, which the old bound destroyed, is now ACCEPTED.
var D5 = boundedRun({ action: 'weeklyAiPlan.generate', settleAt: MEASURED_ELAPSED_MS });
D5.settle()
  .then(function () {
    D5.advanceTo(OLD_SHARED_BOUND_MS);
    return D5.settle();
  })
  .then(function () {
    eq([D5.res.settled, D5.res.err], [null, null],
      'D5  at the OLD 90 000 ms bound the request is still in flight — nothing has been decided');
    eq(D5.calls.abort, 0, 'D5a and nothing has been aborted');
    D5.advanceTo(MEASURED_ELAPSED_MS);
    return D5.settle();
  })
  .then(function () {
    eq(D5.res.settled, { ok: true, status: 200 }, 'D6  at 90 002 ms the response arrives and is ACCEPTED');
    eq(D5.res.err, null, 'D6a with no timeout error');
    eq(D5.calls.fetch, 1, 'D6b from exactly one fetch — no retry');
    D5.advanceTo(300000);
    return D5.settle();
  })
  .then(function () {
    eq(D5.res.settled, { ok: true, status: 200 }, 'D6c and a later timer cannot undo a delivered response');
    eq(D5.calls.fetch, 1, 'D6d still one fetch');

    // D7 — beyond the NEW bound it is still a timeout, still aborted, still not retried.
    var D7 = boundedRun({ action: 'weeklyAiPlan.generate', settleAt: null });
    return D7.settle()
      .then(function () { D7.advanceTo(API_MS - 1); return D7.settle(); })
      .then(function () {
        eq([D7.res.settled, D7.res.err], [null, null], 'D7  one ms before the new bound, nothing is decided');
        D7.advanceTo(API_MS);
        return D7.settle();
      })
      .then(function () {
        ok(D7.res.err && D7.res.err.kmTimeout === true, 'D8  at the new bound it throws a typed kmTimeout');
        eq(D7.res.err && D7.res.err.message, 'REQUEST_TIMEOUT', 'D8a as REQUEST_TIMEOUT');
        eq(D7.res.err && D7.res.err.timeoutMs, API_MS, 'D8b carrying the bound that actually applied — 180 000');
        eq(D7.calls.abort, 1, 'D8c the in-flight request was aborted exactly once');
        eq(D7.calls.fetch, 1, 'D8d and NOT retried');
      });
  })
  .then(function () {
    // ============================================================================================================
    section('E — a real timeout is still ACK_UNKNOWN, and still never auto-retried');
    // ============================================================================================================
    var TE = extractFn(API, '_kmTimeoutError_');
    var sb = { JSON: JSON, String: String, Number: Number, Math: Math };
    vm.createContext(sb);
    vm.runInContext(TE + NL + 'var W = _kmTimeoutError_("weeklyAiPlan.generate", "write", ' + API_MS + ');'
      + NL + 'var R = _kmTimeoutError_("x", "read", 45000);', sb);
    eq(sb.W.code, 'REQUEST_TIMEOUT_WRITE_INDETERMINATE',
      'E1  a timed-out WRITE is still REQUEST_TIMEOUT_WRITE_INDETERMINATE — the code the live run produced');
    ok(sb.R.code !== 'REQUEST_TIMEOUT_WRITE_INDETERMINATE', 'E1a a read keeps its own, retryable code');
    var WEEKLY = (API.match(/async function _kmWeeklyCommand_\([\s\S]*?\n\}/) || [])[0] || '';
    ok(WEEKLY && /never auto-retried/.test(WEEKLY), 'E2  the transport still states that a timed-out write is never auto-retried');
    ok(/ACK_UNKNOWN/.test(WEEKLY), 'E2a and records the outcome as ACK_UNKNOWN');
    eq((WEEKLY.match(/_kmFetchBounded_\(/g) || []).length, 1,
      'E2b it dispatches exactly once — one fetch per command, no retry loop');
    ok(/_kmFetchBounded_\(url, \{ method: 'POST'[\s\S]{0,240}'write', command\)/.test(WEEKLY),
      'E3  and it passes the ACTION through, so the per-action bound is the one that applies');
    ok(/timeout_ms: _kmTimeoutMs_\('write', command\)/.test(WEEKLY),
      'E3a the timeout it REPORTS is the one that actually applied, not the shared default');

    // The page half: the safety wording survives at the new bound.
    var RUNFN = extractFn(PAGE, '_irRunInventoryAiPlanGeneration_');
    ok(/DO NOT PRESS GENERATE AGAIN/.test(RUNFN), 'E4  the timeout message still forbids a second press');
    ok(/read the database back first/i.test(RUNFN), 'E4a and still says to read the database back first');
    ok(/UNKNOWN/.test(RUNFN), 'E4b and still reports the outcome as UNKNOWN, not as a failure');
    ok(/Submit Plan is/.test(RUNFN) && /BLOCKED/.test(RUNFN), 'E4c with Submit blocked until a run reconciles');
    eq((RUNFN.match(/generateWeeklyAiPlanDraft\(/g) || []).length, 1,
      'E5  the page dispatches the generation exactly once');
    ok(!/setTimeout|setInterval/.test(RUNFN), 'E5a and schedules no re-dispatch of its own');
    // A late answer cannot overwrite a settled or timed-out UI: the wrapper latches on `done`.
    var WRAP = extractFn(PAGE, '_irAiPlanWithTimeout_');
    eq((WRAP.match(/if \(done\) return;/g) || []).length, 3,
      'E6  the timeout wrapper latches: the timer and BOTH settle handlers return early once decided');
    ok(/done = true;/.test(WRAP), 'E6a so a late response cannot drive a second state transition');

    // ============================================================================================================
    section('F — release identity, deployment contract, and the browser cache token');
    // ============================================================================================================
    var wap = (G61.match(/var WAP_BUILD_VERSION_ = '([^']+)'/) || [])[1];
    var sysRel = (G63.match(/var SYS_DEPLOYMENT_RELEASE_ = '([^']+)'/) || [])[1];
    var sysB = (G63.match(/var SYS_BUILD_VERSION_ = '([^']+)'/) || [])[1];
    var cen = (CENSUS.match(/var TEMP_E3_CENSUS_BUILD_ = '([^']+)'/) || [])[1];
    var pin = (CENSUS.match(/var R6R7_ACTIVATION_BUILD_ = '([^']+)'/) || [])[1];
    // R6-R7-R5 — FLOORS. These four moved in THIS round and will move again in the next; an equality
    // against this round's build can only hold until it does. What must never be true is that any of them
    // is BEHIND the round this suite covers. The 61_-to-63_ manifest parity below stays EXACT, because a
    // disagreement between a file's own stamp and the row that expects it is what a mixed deployment IS.
    ok(RO.stampAtOrAfter(wap, STAMP), 'F1  61_ moved, because 61_ changed, and is not behind this round');
    ok(RO.stampAtOrAfter(sysRel, STAMP),
      'F2  the RELEASE moved, so a new Web App deployment version is required');
    ok(RO.stampAtOrAfter(sysB, STAMP), 'F3  63_ moved, because its manifest row moved');
    // R6-R7-R5 — FLOORS, for the same reason F1-F3 became floors. The census and the activation pin move in
    // every round that changes what a preflight measures, and R5 changed it again (the write path now passes
    // through the factory stock guard). BP3 in the manifest suite keeps the pin EXACTLY equal to 63_'s
    // release, which is the comparison that actually catches a pin left behind.
    ok(RO.stampAtOrAfter(cen, STAMP), 'F4  the census moved, and is not behind this round');
    ok(RO.stampAtOrAfter(pin, STAMP),
      'F5  and the pinned activation build moved — the R4 preflight timings do not transfer');
    ok(new RegExp("symbol: 'WAP_BUILD_VERSION_', expected: '" + wap + "'").test(G63),
      'F6  63_\'s manifest expects precisely the build 61_ carries — the mixed-deployment parity');
    ok(new RegExp("file: '63_api_v1_system_health\\.gs', symbol: 'SYS_BUILD_VERSION_', expected: '" + sysB + "'").test(G63),
      'F6a including its own self-referential row');
    var cfg = (G00.match(/var CONFIG_BUILD_VERSION_ = '([^']+)'/) || [])[1];
    ok(cfg !== STAMP && new RegExp("symbol: 'CONFIG_BUILD_VERSION_', expected: '" + cfg + "'").test(G63),
      'F7  00_config.gs did NOT change, so its stamp is not marched forward and its row still expects it');
    ok(RO.stampAtOrAfter(RO.OWNER_STAMPS[RO.OWNER_STAMPS.length - 1], STAMP),
      'F8  this round is registered, and nothing older was registered after it');
    ok(/^F1-7N-[A-Z]+-\d+[A-Z](?:-(?:R\d+[A-Z]?\d*|E\d+|A\d+|B\d+))*$/.test(STAMP),
      'F8a and it is well-formed against the canonical stamp vocabulary');
    eq(RO.OWNER_STAMPS.filter(function (s) {
      return !/^F1-7N-[A-Z]+-\d+[A-Z](?:-(?:R\d+[A-Z]?\d*|E\d+|A\d+|B\d+))*$/.test(s);
    }), [], 'F8b as is every other entry in the list');
    // No router action added, no envelope change.
    // R6-R7-R5 — A LATER ROUND IS ALLOWED TO ADD AN ACTION, and R5 did (factoryStockGuard.get). "This
    // round added none" was a true statement about R4 and is not a property of the system, so what survives
    // is the FLOOR: the deployed contract is never BELOW the version this round's frontend needed.
    ok(Number((G63.match(/SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+)/) || [])[1]) >= 11,
      'F9  the deployed action contract is not below the version this round required');
    eq((G63.match(/SYS_TRANSPORT_CONTRACT_VERSION_ = (\d+)/) || [])[1], '1',
      'F9a and the envelope shape is unchanged, so the transport contract does not move');

    // THE 66_ COUPLING MUST BE UNDISTURBED. This is why the bound is per-action rather than global.
    var ros = Number((G66.match(/var ROS_CLIENT_WRITE_TIMEOUT_MS_ = (\d+);/) || [])[1]);
    eq(ros, SHARED_MS, 'F10 ROS_CLIENT_WRITE_TIMEOUT_MS_ still EQUALS KM_WRITE_TIMEOUT_MS_');
    var rosMax = Number((G66.match(/var ROS_MAX_SINGLE_WRITE_MS_ = (\d+);/) || [])[1]);
    var rosRes = Number((G66.match(/var ROS_RESERVE_MS_ = (\d+);/) || [])[1]);
    eq(ros - rosMax - rosRes, 43000, 'F10a so 66_\'s derived slice budget is still 43 000 — untouched');

    // THE BROWSER MUST ACTUALLY GET THE NEW FILES.
    ok(/\?v=/.test(IDX), 'F11 index.html versions its assets');
    eq(RO.misplacedIndexTokens(IDX), [], 'F11a no asset carries a token from the wrong series');
    eq(RO.staleAppTokenRefs(IDX), [], 'F11b and no co-deployed asset was left behind on a previous token');
    var tok = RO.currentAppToken();
    // R6-R7-R5 — the LITERAL token belongs to R4 and is replaced every round that ships a browser file.
    // The durable assertion is that index.html carries ONE registered token and no asset was left behind
    // on a previous one, which F11a/F11b above measure directly.
    ok(!!tok && RO.ROUND_TOKENS.indexOf(tok) !== -1,
      'F12 index.html carries a REGISTERED round cache token', tok);
    ['assets/js/pages/inventory-replenishment.js', 'assets/js/api/operation-system-db-api.js'
    ].forEach(function (f) {
      ok(IDX.indexOf(f + '?v=' + tok) >= 0,
        'F12a ' + f.split('/').pop() + ' carries it — a cached previous copy would keep the OLD bound');
    });

    // ============================================================================================================
    section('G — nothing was flipped, generated, deployed or written');
    // ============================================================================================================
    ok(/INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_\s*=\s*false/.test(G00), 'G1  the production flag is still FALSE');
    var allow = (G00.match(/INVENTORY_AI_PLAN_ACTIVATION_ALLOWLIST_ = \[[\s\S]*?\];/) || [''])[0];
    ok(/ResUS/.test(allow) && /CO1100-R/.test(allow), 'G1a and the allowlist is still the one frozen scope');
    eq((allow.match(/company:/g) || []).length, 1, 'G1b with exactly one entry');
    ok(!/ALL_SITES/.test(allow), 'G1c and no wildcard');
    // The harvest short-circuit writes nothing and constructs nothing.
    ['getRange', 'setValue', 'appendRow', 'LockService', 'weeklyAiPlanPersistenceDeps_'
    ].forEach(function (n) {
      ok(HARVEST.indexOf(n) === -1, 'G2  the harvest does not touch ' + n);
    });
    eq([B.calls.buildReceivers, B.calls.kmaf, Bc.calls.buildReceivers, Bc.calls.kmaf], [0, 0, 0, 0],
      'G3  and across both short-circuit runs, zero pipeline calls');

    // ============================================================================================================
    section('N — mutants');
    // ============================================================================================================
    // N1 — THE INVERSION. A page bound below the transport bound for this action is the R6-R7-R3 defect again.
    mut('N1 the timeout relation inverted: page bound below the action bound', function () {
      var m = swap(PAGE, 'var IR_AI_PLAN_CLIENT_TIMEOUT_MS_ = ' + PAGE_MS + ';',
        'var IR_AI_PLAN_CLIENT_TIMEOUT_MS_ = ' + (API_MS - 1) + ';');
      var bad = Number((m.match(/var IR_AI_PLAN_CLIENT_TIMEOUT_MS_ = (\d+);/) || [])[1]);
      return PAGE_MS > API_MS && !(bad > API_MS);
    });
    // N2 — the per-action bound removed, so the shared 90 s cuts off the measured answer again.
    mut('N2 the per-action bound removed, restoring the 90 s cut-off', function () {
      var m = swap(API, "    'weeklyAiPlan.generate': 180000", "    'someOtherAction': 180000");
      var sb2 = { window: {} };
      vm.createContext(sb2);
      vm.runInContext([extractVar(m, 'KM_READ_TIMEOUT_MS_'), extractVar(m, 'KM_WRITE_TIMEOUT_MS_'),
        extractVar(m, 'KM_ACTION_WRITE_TIMEOUT_MS_'), extractFn(m, '_kmTimeoutMs_')].join(NL), sb2);
      var bad = vm.runInContext('_kmTimeoutMs_("write", "weeklyAiPlan.generate")', sb2);
      return Dg.ms > MEASURED_ELAPSED_MS && bad < MEASURED_ELAPSED_MS;
    });
    // N3 — a per-action entry used to SHRINK a bound. The resolver must refuse to narrow.
    mut('N3 a per-action entry used to shrink the bound instead of widen it', function () {
      var m = swap(API, "    'weeklyAiPlan.generate': 180000", "    'weeklyAiPlan.generate': 30000");
      var sb2 = { window: {} };
      vm.createContext(sb2);
      vm.runInContext([extractVar(m, 'KM_READ_TIMEOUT_MS_'), extractVar(m, 'KM_WRITE_TIMEOUT_MS_'),
        extractVar(m, 'KM_ACTION_WRITE_TIMEOUT_MS_'), extractFn(m, '_kmTimeoutMs_')].join(NL), sb2);
      // The SHIPPED resolver refuses to narrow, so a 30 s entry still yields the shared 90 s.
      return vm.runInContext('_kmTimeoutMs_("write", "weeklyAiPlan.generate")', sb2) === SHARED_MS;
    });
    // N3a — and the guard that makes N3 true must be present: remove it and shrinking becomes possible.
    mut('N3a the widen-only guard removed from the resolver', function () {
      var m = swap(API, 'if (per > 0 && per > base) return Number(per);', 'if (per > 0) return Number(per);');
      var m2 = swap(m, "    'weeklyAiPlan.generate': 180000", "    'weeklyAiPlan.generate': 30000");
      var sb2 = { window: {} };
      vm.createContext(sb2);
      vm.runInContext([extractVar(m2, 'KM_READ_TIMEOUT_MS_'), extractVar(m2, 'KM_WRITE_TIMEOUT_MS_'),
        extractVar(m2, 'KM_ACTION_WRITE_TIMEOUT_MS_'), extractFn(m2, '_kmTimeoutMs_')].join(NL), sb2);
      return vm.runInContext('_kmTimeoutMs_("write", "weeklyAiPlan.generate")', sb2) === 30000;
    });
    // N4 — the action not threaded through, so the per-action table can never apply.
    mut('N4 the action not passed to the bounded fetch', function () {
      var m = swap(API, "'write', command);", "'write');");
      var w2 = (m.match(/async function _kmWeeklyCommand_\([\s\S]*?\n\}/) || [''])[0];
      // TARGETED at the FETCH call. `_kmTimeoutMs_('write', command)` also satisfies a bare
      // "'write', command)" scan, so a loose probe reported this mutant caught on the wrong line.
      var re = /_kmFetchBounded_\(url, \{ method: 'POST'[\s\S]{0,260}'write', command\)/;
      return re.test(WEEKLY) && !re.test(w2) && /_kmFetchBounded_\(/.test(w2);
    });
    // N5 — AN AUTO-RETRY. The one thing a longer bound must not have bought.
    mut('N5 an auto-retry added on timeout', function () {
      var m = swap(API, "            var te = _kmTimeoutError_(command, 'write', netErr.timeoutMs);",
        "            var te = _kmTimeoutError_(command, 'write', netErr.timeoutMs);\n"
        + "            resp = await _kmFetchBounded_(url, { method: 'POST' }, 'write', command);");
      var w2 = (m.match(/async function _kmWeeklyCommand_\([\s\S]*?\n\}/) || [''])[0];
      return (WEEKLY.match(/_kmFetchBounded_\(/g) || []).length === 1
        && (w2.match(/_kmFetchBounded_\(/g) || []).length === 2;
    });
    // N6 — THE NESTED-COUNTER REGRESSION. The R6-R7-R3 defect: counters moved off the canonical flat DTO.
    mut('N6 the counters moved back into a nested sub-object', function () {
      var m = swap(G61,
        '      created_headers: 0, updated_headers: 0, created_lines: 0, updated_lines: 0,\n'
        + '      cancelled_headers: 0, cancelled_lines: 0, expired_headers: 0, expired_lines: 0,\n'
        + '      reservations: 0,',
        '      summary: { created_headers: 0, updated_headers: 0, created_lines: 0, updated_lines: 0,\n'
        + '        cancelled_headers: 0, cancelled_lines: 0, expired_headers: 0, expired_lines: 0,\n'
        + '        reservations: 0 },');
      var sb2 = { JSON: JSON, String: String, Number: Number };
      vm.createContext(sb2);
      vm.runInContext(extractVar(m, 'WAP_NO_ACTION_CODE_') + NL + extractFn(m, 'weeklyAiPlanNoActionResponse_') + NL
        + 'var R = weeklyAiPlanNoActionResponse_({ reason: "VALID_ZERO_RECOMMENDATION",'
        + ' recommendation_state: "VALID_ZERO_RECOMMENDATION", recommended_qty: 0,'
        + ' qualifying_planned_qty: 520, residual_qty: 0, per_scope: [] }, {});', sb2);
      var badData = sb2.R.data;
      return typeof CD.created_headers === 'number' && badData.created_headers === undefined
        && badData.summary && badData.summary.created_headers === 0;
    });
    // N7 — a counter emitted as a STRING zero. It reads as 0 and compares as neither.
    mut('N7 a counter emitted as the string "0"', function () {
      var m = swap(G61, '      reservations: 0,', "      reservations: '0',");
      var sb2 = { JSON: JSON, String: String, Number: Number };
      vm.createContext(sb2);
      vm.runInContext(extractVar(m, 'WAP_NO_ACTION_CODE_') + NL + extractFn(m, 'weeklyAiPlanNoActionResponse_') + NL
        + 'var R = weeklyAiPlanNoActionResponse_({ reason: "x", per_scope: [] }, {});', sb2);
      return typeof CD.reservations === 'number' && typeof sb2.R.data.reservations === 'string';
    });
    // N8 — THE SHORT-CIRCUIT REMOVED. The 90-second request, back.
    mut('N8 the harvest short-circuit removed, so a valid zero pays for the pipeline again', function () {
      var m = swap(HARVEST, 'if (_noAction && _noAction.noAction === true) {', 'if (false) {');
      var bad = harvestRun({ harvest: m });
      return B.calls.buildReceivers === 0 && B.calls.kmaf === 0
        && bad.calls.buildReceivers === 1 && bad.calls.kmaf === 1
        && !bad.out.no_action_short_circuit;
    });
    // N9 — the short-circuit fires on the WRONG condition, swallowing a residual that must be generated.
    mut('N9 the short-circuit widened to fire on any decision object', function () {
      var m = swap(HARVEST, 'if (_noAction && _noAction.noAction === true) {', 'if (_noAction) {');
      var bad = harvestRun({ harvest: m, recState: { state: 'NONZERO_RECOMMENDATION',
        recommended_qty_total: 800, per_scope: [{ key: 'ResUS|US|Amazon|CO1100-R', marketplace: 'Amazon',
        sku: 'CO1100-R', recommended_qty: 800 }], missing_reasons: [], authority_rule: 'F' } });
      return Br.calls.buildReceivers === 1 && bad.calls.buildReceivers === 0;
    });
    // N10 — the handler gate moved back inside the mapper's failure branch.
    mut('N10 the handler gate moved back behind the mapper', function () {
      var gate = HANDLER.slice(oGate, HANDLER.indexOf('    // ---- MAP', oGate));
      var m = swap(HANDLER, gate, '');
      var g2 = m.indexOf('var _naFast = weeklyAiPlanK2NoAction_(h);');
      var map2 = m.indexOf('KMWHA.mapWeeklyHarvestToBatchRequest(');
      return oGate < oMapper && g2 === -1 && map2 > 0;
    });
    // N11 — the short-circuit returning a LESSER answer: lineage dropped from the fast path.
    mut('N11 the short-circuit dropping the source-data lineage a full harvest carries', function () {
      var m = swap(HARVEST,
        "      sourceDataAsOf: asOf.date, sourceDataAsOfAuthority: { run_id: asOf.run_id, date: asOf.date, source: 'GAP_INV_RUN_LINEAGE' },\n"
        + '      gapLineage: asOf.lineage, isolation: isolation, snapshot_freshness: canonical.freshness || null,',
        '      isolation: isolation, snapshot_freshness: canonical.freshness || null,');
      var bad = harvestRun({ harvest: m });
      return B.out.sourceDataAsOf === '2026-09-07' && bad.out.sourceDataAsOf === undefined
        && bad.out.no_action_short_circuit === true;
    });

    console.log('\n' + '-'.repeat(76));
    console.log('WEEKLY AI PLAN NO_ACTION LATENCY + WRITE-TRANSPORT BOUND (' + STAMP + '):');
    console.log('passed ' + pass + '  failed ' + fail
      + '  |  mutants caught ' + neg.caught + '  survived ' + neg.missed);
    if (fail) process.exit(1);
  })
  .catch(function (e) {
    console.error('\nASYNC ERROR ' + (e && e.stack || e));
    process.exit(1);
  });
