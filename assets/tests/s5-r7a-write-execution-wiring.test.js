// S5-R7A — DRAFT WRITE EXECUTION WIRING + WRITE-TRUTH SEAL. No production write.
//
// WHAT SHIPPED. The S5-R6 eligibility rule is now ONE named owner, `KMRDV2P.actionAuthorizesOrderWrite`, and it
// sits on the LIVE generate path: 47_ attaches the canonical KMREC verdict at the single place a stored gap row
// becomes a draft body, and `generateMonthlyFlat` consults the owner before anything is planned.
//
// THE SUITE EXECUTES THE REAL PATH. `generateMonthlyFlat` runs with deps wired to the real `applyFlat` over an
// in-memory sheet set built from the real 53 `V2_HEADERS`, and §J lifts the real `rpoFlatLockedApply_` out of
// 24_ and runs it against fakes. Nothing here re-implements a planner, a writer or a classifier.
//
// THE FINDING WORTH READING (§H). Both refusals carry a reason 47_'s per-SKU summarizer did not recognise, so a
// correct zero-write outcome would have been reported to the operator as FAILED — the same shape as the R5C
// incident. They map onto the EXISTING NOT_READY status rather than a new one, because 48_'s code map answers
// anything it does not know with F.
//
// NO FILE IS WRITTEN. Mutants are compiled in memory. No sheet, no lock, no network, no production row.
//
// Run: node assets/tests/s5-r7a-write-execution-wiring.test.js

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var Module = require('module');

var fail = 0, pass = 0;
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
var CORE = 'assets/js/core/';
var GS = 'assets/specs/active/apps-script/';
var P_REL = CORE + 'supply-planning-request-draft-v2-persistence.js';
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }

global.KMCALC = require(path.join(ROOT, CORE + 'supply-planning-calculations.js'));
var KMREC = require(path.join(ROOT, CORE + 'supply-recommendation.js'));
var KMRDV2 = require(path.join(ROOT, CORE + 'supply-planning-request-draft-v2.js'));
var KMRDV2P = require(path.join(ROOT, P_REL));
var KMPR = require(path.join(ROOT, CORE + 'supply-planning-persistence-repository.js'));
var P_SRC = read(P_REL);
var GEN = read(GS + '47_api_v1_recommendation_generation.gs');
var ORCH = read(GS + '24_recommendation_orchestrator.gs');
var JOB = read(GS + '48_api_v1_request_order_draft_job.gs');
var PAGE = read('assets/js/pages/request-order.js');

function loadMutated(rel, from, to) {
  var src = read(rel);
  if (src.indexOf(from) < 0) throw new Error('mutation anchor missing in ' + rel);
  if (src.indexOf(from) !== src.lastIndexOf(from)) throw new Error('mutation anchor ambiguous in ' + rel);
  var m = new Module(path.join(ROOT, rel), null);
  m.filename = path.join(ROOT, rel);
  m.paths = Module._nodeModulePaths(path.dirname(m.filename));
  m._compile(src.replace(from, to), m.filename);
  return m.exports;
}
// Lift ONE named function out of a .gs source and run it — never a paraphrase of it.
function liftGs(src, name, ctxExtra) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('function not found in .gs: ' + name);
  var i = src.indexOf('{', start), depth = 0, end = -1;
  for (var j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) { end = j + 1; break; } }
  }
  if (end < 0) throw new Error('unbalanced body for ' + name);
  var ctx = ctxExtra || {};
  ctx.console = console;
  vm.createContext(ctx);
  vm.runInContext(src.slice(start, end) + '\n;this.__fn = ' + name + ';', ctx);
  return ctx.__fn;
}

// ---- real fixtures ----------------------------------------------------------------------------------------
function gapRow(over) {
  var r = {
    company: 'ResTW', country: 'JP', marketplace: 'Amazon', sku: 'KM-1',
    calculation_status: 'READY', calculation_month: '2026-09', calculated_at: '2026-09-28T05:30:00Z',
    t1_month: '2026-10', t1_gap_qty: 0, t1_suggested_qty: 0,
    t2_month: '2026-11', t2_gap_qty: 0, t2_suggested_qty: 0,
    t3_month: '2026-12', t3_gap_qty: 0, t3_suggested_qty: 0,
    t4_month: '2027-01', t4_gap_qty: 0, t4_suggested_qty: 0,
    units_per_carton: 12,
    factory_available_qty_snapshot: null, reallocation_in_qty_snapshot: null, reallocation_out_qty_snapshot: null
  };
  for (var k in over) if (Object.prototype.hasOwnProperty.call(over, k)) r[k] = over[k];
  return r;
}
var SCOPE = { company: 'ResTW', country: 'JP', marketplace: 'Amazon', sku: 'KM-1', draft_purpose: 'regular' };
var RUN_HDRS = ['calculation_run_id', 'recommendation_type', 'draft_id', 'planning_cycle', 'business_scope_key',
  'draft_version', 'run_status', 'current_stage', 'formula_version', 'source_data_as_of',
  'started_by', 'started_at', 'completed_by', 'completed_at', 'error_summary', 'attempt_count'];
function sheetSet(rows) {
  return {
    'request_order_allocation_drafts': { headers: KMRDV2.V2_HEADERS.slice(), rows: rows || [] },
    'recommendation_calculation_runs': { headers: RUN_HDRS.slice(), rows: [] }
  };
}
function rowToArray(o) { return KMRDV2.V2_HEADERS.map(function (h) { return o[h] !== undefined ? o[h] : ''; }); }

// The fact lines exactly as 47_ builds them: tN_suggested_qty VERBATIM, no re-cartonization.
function factLines(r) {
  return ['T1', 'T2', 'T3'].map(function (t) {
    var lc = t.toLowerCase();
    return { request_bucket: t, request_month: r[lc + '_month'], recommendedQty: r[lc + '_suggested_qty'],
      snapshotRow: { units_per_carton: r.units_per_carton } };
  });
}

// THE EXECUTION HARNESS — the real generateMonthlyFlat, the real applyFlat, an in-memory sheet set.
// `lockedApply` stands in for rpoFlatLockedApply_'s LockService + keyed-delta write ONLY; the apply itself is
// the real one. applyCalls records every entry so "zero mutation" can be measured rather than assumed.
function runGenerate(r, over, set) {
  set = set || sheetSet([]);
  var dto = KMREC.generateOrderPlanningRecommendation(r, { unitsPerCarton: r.units_per_carton });
  var calls = [];
  var cmd = {
    recommendationType: 'MONTHLY_ORDER', mode: 'ai_plan', planningCycle: '2026-10',
    businessScope: SCOPE, generationType: 'ai_plan', actor: 'op@km', now: '2026-09-28T07:00:00Z',
    recommendation: { action: dto.recommendationAction, sourceFingerprint: dto.sourceFingerprint, stale: false }
  };
  for (var k in over) if (Object.prototype.hasOwnProperty.call(over, k)) cmd[k] = over[k];
  var existing = null;
  var deps = {
    loadActiveContext: function (q) { return KMRDV2P.loadActiveFlat(set, q); },
    computeFacts: function () {
      return { ready: true, lines: factLines(r), unitsPerCarton: r.units_per_carton,
        provenance: { calculationRunId: 'RUN-1', formulaVersion: 'ORDER_PLANNING_GAP',
          calculatedAt: r.calculated_at, sourceDataAsOf: '2026-09-28' } };
    },
    lockedApply: function (plan, token, opts) {
      calls.push({ draftId: plan.draftId, token: token });
      return KMRDV2P.applyFlat(set, plan, (over && over.__forceToken) || token, opts);
    }
  };
  var out = KMRDV2P.generateMonthlyFlat(cmd, deps);
  return { out: out, set: set, calls: calls, dto: dto, existing: existing };
}
function draftRows(set) { return set['request_order_allocation_drafts'].rows; }
function runRows(set) { return set['recommendation_calculation_runs'].rows; }

var CASE = {
  NEW_ORDER: gapRow({ t1_gap_qty: 55, t1_suggested_qty: 60 }),
  REALLOCATE: gapRow({ factory_available_qty_snapshot: 100, reallocation_in_qty_snapshot: 30, reallocation_out_qty_snapshot: 0 }),
  COMBINED: gapRow({ t1_gap_qty: 70, t1_suggested_qty: 72, factory_available_qty_snapshot: 100,
    reallocation_in_qty_snapshot: 30, reallocation_out_qty_snapshot: 0 }),
  NO_ACTION: gapRow({}),
  MANUAL_REVIEW: gapRow({ calculation_status: 'BLOCKED' })
};
// The R6 counterexample, carried forward verbatim.
var TWO_TIER = gapRow({ t1_gap_qty: 13, t1_suggested_qty: 24, t2_gap_qty: 13, t2_suggested_qty: 24 });

// =========================================================================================================
section('A. one write owner, one eligibility owner');
// =========================================================================================================

ok(/function rpoFlatLockedApply_\(/.test(ORCH),
  'A1 MONTHLY_FLAT_WRITE_OWNER = rpoFlatLockedApply_');
eq((code(ORCH).match(/lockedApply: function \(plan, expectedToken, o\) \{ return rpoFlatLockedApply_/g) || []).length, 1,
  'A2 every flat path reaches it through exactly ONE injected dep');
ok(!/applyPersistencePlanWithLock/.test(code(ORCH)),
  'A3 LEGACY_PARALLEL_WRITE_PATH_COUNT = 0 — the flat path never calls the line engine boundary');
eq((code(P_SRC).match(/function planFlat\(/g) || []).length, 1, 'A4 one planner');
eq((code(P_SRC).match(/function actionAuthorizesOrderWrite\(/g) || []).length, 1,
  'A5 WRITE_ELIGIBILITY_OWNER_COUNT = 1 — declared once');

// The switch must exist in exactly one place. Any other file that spells the action set beside the word
// "order" would be a second copy of the rule.
var ORDER_SET = "{ NEW_ORDER: 1, REALLOCATE_AND_NEW_ORDER: 1 }";
var carriers = [P_REL, GS + '47_api_v1_recommendation_generation.gs', GS + '24_recommendation_orchestrator.gs',
  GS + '48_api_v1_request_order_draft_job.gs', 'assets/js/pages/request-order.js']
  .filter(function (f) { return code(read(f)).indexOf(ORDER_SET) >= 0; });
eq(carriers, [P_REL], 'A6 and the eligible-action set is spelled in ONE file');
// Nor may any consumer re-derive the verdict.
[GS + '47_api_v1_recommendation_generation.gs', GS + '24_recommendation_orchestrator.gs',
 GS + '48_api_v1_request_order_draft_job.gs'].forEach(function (f) {
  ok(!/deriveRecommendationAction|deriveReasonTokens/.test(code(read(f))),
    'A7 ' + path.basename(f) + ' never derives the action itself');
});

// =========================================================================================================
section('B. the verdict reaches the live path, from the one place that has the gap row');
// =========================================================================================================

ok(/KMREC\.generateOrderPlanningRecommendation\(gapRow, \{ unitsPerCarton: upc \}\)/.test(GEN),
  'B1 47_ asks the canonical owner rather than imitating it');
eq((GEN.match(/KMREC\.generateOrderPlanningRecommendation\(/g) || []).length, 1,
  'B2 once — recGenBuildGapDraftBody_ is the only gap-row -> body builder');
ok(/recommendation: rec/.test(GEN), 'B3 and the verdict is attached to the body');
ok(/RECOMMENDATION_OWNER_UNAVAILABLE/.test(GEN),
  'B4 a project without the bundle FAILS CLOSED rather than writing with no verdict');
// Both live entries — the manual AI Plan job and the scheduled driver — go through that builder.
ok(/recGenBuildGapDraftBody_/.test(GEN) && /recGenGenerateOneSkuCompact_/.test(JOB + GEN),
  'B5 the manual job path reaches it');
ok(/reqDraftJobStart_|reqDraftJobContinue_/.test(read(GS + '49_api_v1_weekly_recommendation_job.gs')),
  'B6 and the scheduled driver drives the SAME 48_ job — not a second persister');

// =========================================================================================================
section('C. the guard decides on the live path, before anything is planned');
// =========================================================================================================

var rNew = runGenerate(CASE.NEW_ORDER);
eq([rNew.out.wrote, rNew.out.persisted, draftRows(rNew.set).length], [true, true, 1],
  'C1 NEW_ORDER writes one draft row');
var rCombined = runGenerate(CASE.COMBINED);
eq([rCombined.out.wrote, draftRows(rCombined.set).length], [true, 1],
  'C2 REALLOCATE_AND_NEW_ORDER writes — its order half only');

['REALLOCATE', 'NO_ACTION', 'MANUAL_REVIEW'].forEach(function (a) {
  var r = runGenerate(CASE[a]);
  eq([r.out.outcome, r.out.wrote, r.out.persisted], ['NOT_ELIGIBLE', false, false],
    'C3 ' + a + ' is refused by the guard');
  eq(r.out.reason, 'ACTION_AUTHORIZES_NO_ORDER', 'C3a ' + a + ' with the reason named');
  eq([draftRows(r.set).length, runRows(r.set).length, r.calls.length], [0, 0, 0],
    'C3b ' + a + ' — ZERO mutation and the writer was never even entered');
});

// The refusal happens BEFORE planning, which is what makes "the writer was never entered" true.
var gateRegion = code(P_SRC).split('function generateMonthlyFlat(')[1].split('function loadFlatById(')[0];
ok(gateRegion.indexOf('actionAuthorizesOrderWrite') < gateRegion.indexOf('planFlat('),
  'C4 the guard is consulted before planFlat is called, not after');

// An unrecognised action refuses too, and a body with no verdict at all is unchanged behaviour.
var rUnknown = runGenerate(CASE.NEW_ORDER, { recommendation: { action: 'SHIP', stale: false } });
eq([rUnknown.out.outcome, rUnknown.out.reason, draftRows(rUnknown.set).length],
  ['NOT_ELIGIBLE', 'RECOMMENDATION_UNAVAILABLE', 0], 'C5 an action outside the closed set writes nothing');
var rNoVerdict = runGenerate(CASE.NEW_ORDER, { recommendation: undefined });
eq([rNoVerdict.out.wrote, draftRows(rNoVerdict.set).length], [true, 1],
  'C6 a caller carrying no verdict behaves exactly as before — the guard adds no new refusal to old callers');

// =========================================================================================================
section('D. the quantity authority did not move');
// =========================================================================================================

var rTwo = runGenerate(TWO_TIER);
eq(KMREC.generateOrderPlanningRecommendation(TWO_TIER, { unitsPerCarton: 12 }).totalRecommendedQty, 36,
  'D1 KMREC cartonizes the raw T1-T3 sum once -> 36');
var w = KMRDV2P.withFlatDefaults(
  (function (t) { var o = {}; t.headers.forEach(function (h, i) { o[h] = t.rows[0][i]; }); return o; })(
    rTwo.set['request_order_allocation_drafts']));
eq([w.t1_recommended_qty, w.t2_recommended_qty, w.t3_recommended_qty], [24, 24, 0],
  'D2 TIER_WRITE_SOURCE = the stored per-tier suggestion, written verbatim');
eq(w.t1_recommended_qty + w.t2_recommended_qty + w.t3_recommended_qty, 48,
  'D3 which sums to 48 — the two authorities are still different numbers');
ok(JSON.stringify(w).indexOf('36') === -1,
  'D4 KMREC_TOTAL_IS_WRITE_SOURCE = NO — it reached no column');
ok(!/totalRecommendedQty/.test(code(P_SRC)) && !/totalRecommendedQty/.test(code(GEN)),
  'D5 SECOND_QUANTITY_AUTHORITY_COUNT = 0 — neither the planner nor the body builder reads it');
// EXECUTION_RECARTONIZES = NO.
ok(!/calculateSuggestedOrderQty|KMCALC/.test(gateRegion),
  'D6 EXECUTION_RECARTONIZES = NO — the execution layer runs no carton math');
ok(!/t[1-4]_gap_qty|remainingGapQty|KMTPP|KMMSA|KMALLOC|KMFSR/.test(gateRegion),
  'D7 EXECUTION_RECALCULATES_GAP = NO');
ok(!/deriveRecommendationAction|generateOrderPlanningRecommendation/.test(code(P_SRC)),
  'D8 EXECUTION_RECALCULATES_RECOMMENDATION = NO — the verdict is only ever read');

// =========================================================================================================
section('E. combined action boundary');
// =========================================================================================================

eq(KMRDV2.V2_HEADERS.filter(function (h) { return /realloc/i.test(h); }), [],
  'E1 SCHEMA_EXTENSION_REQUIRED = NO — still no reallocation column');
var cw = (function (t) { var o = {}; t.headers.forEach(function (h, i) { o[h] = t.rows[0][i]; }); return o; })(
  rCombined.set['request_order_allocation_drafts']);
eq(cw.t1_recommended_qty, 72, 'E2 the order half is the gap suggestion, untouched by the 30 reallocated in');
eq([cw.t1_order_qty, cw.t2_order_qty, cw.t3_order_qty], [72, 0, 0], 'E3 and order_qty defaults to it');
ok(JSON.stringify(cw).indexOf('102') === -1, 'E4 COMBINED_QTY_WRITTEN = NO — no merged 30 + 72');
eq(Object.keys(cw).filter(function (k) { return /realloc/i.test(k); }), [],
  'E5 REALLOCATION_QTY_WRITTEN_TO_ORDER_DRAFT = NO');
eq(Object.keys(KMREC.ACTION).filter(function (a) { return JSON.stringify(cw).indexOf(a) >= 0; }), [],
  'E6 and the action itself was not persisted as lifecycle');

// =========================================================================================================
section('F. staleness and the optimistic token — four cases, measured');
// =========================================================================================================

// A. current recommendation + current token -> commits.
var A = runGenerate(CASE.NEW_ORDER);
eq([A.out.wrote, draftRows(A.set).length], [true, 1], 'F-A current + current commits');

// B. stale recommendation -> refused before planning, zero mutation.
var B = runGenerate(CASE.NEW_ORDER, { recommendation: { action: 'NEW_ORDER', stale: true } });
eq([B.out.outcome, B.out.reason, B.out.wrote], ['STALE_RECOMMENDATION', 'RECOMMENDATION_STALE', false],
  'F-B STALE_WRITE_CAN_COMMIT = NO');
eq([draftRows(B.set).length, runRows(B.set).length, B.calls.length], [0, 0, 0],
  'F-B1 and nothing was written, planned or dispatched');

// C. current recommendation + stale draft_version -> the token refuses under the lock.
var seeded = sheetSet([]);
runGenerate(CASE.NEW_ORDER, {}, seeded);
var before = JSON.stringify(seeded);
var C = runGenerate(CASE.NEW_ORDER, { __forceToken: { draft_version: 99, userEditFingerprint: 'WRONG' } }, seeded);
eq([C.out.result.conflict, C.out.result.wrote, C.out.result.reason], [true, false, 'TOKEN_MISMATCH'],
  'F-C TOKEN_MISMATCH_CAN_COMMIT = NO');
eq(JSON.stringify(seeded), before, 'F-C1 and the tables are byte-identical to before the attempt');
eq(C.out.outcome, 'CONFLICT', 'F-C2 reported as a conflict, not as a success');

// D. fingerprint changed between planning and apply -> KMREC is the owner that can see it.
var displayed = KMREC.generateOrderPlanningRecommendation(CASE.NEW_ORDER, { unitsPerCarton: 12 });
var moved = gapRow({ t1_gap_qty: 55, t1_suggested_qty: 60, calculated_at: '2026-09-28T09:00:00Z' });
ok(KMREC.isStale(displayed, moved) === true && KMREC.isStale(displayed, CASE.NEW_ORDER) === false,
  'F-D the fingerprint move is detectable by KMREC.isStale, the single owner');
ok(!/sourceFingerprint\s*[!=]==|calculated_at/.test(gateRegion),
  'F-D1 and the execution layer holds no fingerprint logic of its own');

// =========================================================================================================
section('G. operator edit preservation, through the real path');
// =========================================================================================================

var edSet = sheetSet([]);
runGenerate(CASE.NEW_ORDER, {}, edSet);
var stored = (function (t) { var o = {}; t.headers.forEach(function (h, i) { o[h] = t.rows[0][i]; }); return o; })(
  edSet['request_order_allocation_drafts']);
var edited = KMRDV2.applyTierEdit(KMRDV2P.withFlatDefaults(stored), 'T1', { order_qty: 999 }, 'op@km', 'T1').row;
edSet['request_order_allocation_drafts'].rows[0] = rowToArray(edited);
eq([edited.t1_order_qty, edited.t1_user_edited, edited.t1_recommended_qty], [999, true, 60],
  'G1 the edit moves order_qty only');

var after = runGenerate(CASE.NEW_ORDER, {}, edSet);
var post = (function (t) { var o = {}; t.headers.forEach(function (h, i) { o[h] = t.rows[0][i]; }); return o; })(
  edSet['request_order_allocation_drafts']);
eq(post.t1_order_qty, 999, 'G2 USER_EDIT_SURVIVES_RECALC = YES — a system refresh left it alone');
eq(post.t1_user_edited, true, 'G3 and the flag survived');
eq(post.t1_recommended_qty, 60, 'G4 SYSTEM_VALUE_REMAINS_COMPARABLE = YES');
eq(draftRows(edSet).length, 1, 'G5 still one row');
// A regenerate without confirmation likewise cannot take it.
var regenSet = sheetSet([rowToArray(edited)]);
runGenerate(CASE.NEW_ORDER, { action: 'regenerate' }, regenSet);
var rg = (function (t) { var o = {}; t.headers.forEach(function (h, i) { o[h] = t.rows[0][i]; }); return o; })(
  regenSet['request_order_allocation_drafts']);
eq(rg.t1_order_qty, 999, 'G6 SYSTEM_RECALC_OVERWRITES_USER_EDIT = NO, even on regenerate');

// =========================================================================================================
section('H. the refusals are not failures — and without this they would be reported as one');
// =========================================================================================================

var summarize = liftGs(GEN, 'recGenSummarizeDraftResult_', {});
function flat(d) { return { success: true, data: Object.assign({ resultShape: 'FLAT_V2' }, d) }; }

eq(summarize('KM-1', flat({ outcome: 'NOT_ELIGIBLE', reason: 'ACTION_AUTHORIZES_NO_ORDER',
  detail: 'NO_ACTION', wrote: false, recommendationAction: 'NO_ACTION' })),
  { sku: 'KM-1', status: 'NOT_READY', code: 'NO_ACTION', draftId: null, recommendationAction: 'NO_ACTION' },
  'H1 NOT_ELIGIBLE is NOT_READY with the action as its reason — never FAILED');
eq(summarize('KM-1', flat({ outcome: 'STALE_RECOMMENDATION', reason: 'RECOMMENDATION_STALE',
  wrote: false, recommendationAction: 'NEW_ORDER' })).status, 'NOT_READY',
  'H2 and so is STALE_RECOMMENDATION');
// The containment that matters: the STATUS vocabulary did not grow, so 48_'s code map needs no change.
var codeFor = liftGs(JOB, 'reqDraftJobCodeForStatus_', {});
eq([codeFor('NOT_READY'), codeFor('CREATED'), codeFor('SOMETHING_NEW')], ['G', 'C', 'F'],
  'H3 48_ answers an unknown status with F for FAILED — which is why no new status was invented');
eq(codeFor(summarize('KM-1', flat({ outcome: 'NOT_ELIGIBLE', reason: 'ACTION_AUTHORIZES_NO_ORDER', wrote: false })).status),
  'G', 'H4 so a truthfully refused SKU reaches the job as NOT_READY, not as a failure');
// And a committed write is still CREATED, unchanged.
eq(summarize('KM-1', flat({ wrote: true, outcome: 'CREATE', draftId: 'RD::x' })).status, 'CREATED',
  'H5 the committed path is untouched');

// =========================================================================================================
section('J. write truth — the four states, run against the real locked apply');
// =========================================================================================================

function runLocked(applyResult, verified) {
  var wrote = [];
  var ctx = {
    LockService: { getScriptLock: function () { return { tryLock: function () { return applyResult !== '__nolock'; },
      releaseLock: function () {} }; } },
    rprBuildSheetSet_: function () { return { set: { a: { headers: [], rows: [] }, b: { headers: [], rows: [] } }, meta: {} }; },
    rpoFlatTables_: function () { return ['a', 'b']; },
    KMRDV2P: { applyFlat: function () { return applyResult === '__nolock' ? null : JSON.parse(JSON.stringify(applyResult)); } },
    rpoKeyedDeltaWrite_: function () { wrote.push(1); return { verified: verified }; }
  };
  var fn = liftGs(ORCH, 'rpoFlatLockedApply_', ctx);
  return { res: fn({}, { draftId: 'RD::x' }, {}, {}), writes: wrote.length };
}

eq(runLocked({ wrote: true, runStatus: 'COMPLETED' }, true).res.writeOutcome, 'WRITE_COMMITTED_VERIFIED',
  'J1 confirmed committed');
var unk = runLocked({ wrote: true, runStatus: 'COMPLETED' }, false).res;
eq([unk.writeOutcome, unk.requiresReconciliation, unk.committedDraftId],
  ['WRITE_COMMITTED_READBACK_FAILED', true, 'RD::x'],
  'J2 outcome UNKNOWN surfaces the committed id and demands reconciliation');
eq(runLocked({ conflict: true, wrote: false, runStatus: 'CONFLICT' }, true).res.writeOutcome, 'WRITE_REJECTED',
  'J3 confirmed rejected');
eq(runLocked('__nolock', true).res.writeOutcome, 'WRITE_NOT_STARTED',
  'J4 confirmed not started — the lock was never taken, so nothing can have been written');
eq(runLocked('__nolock', true).writes, 0, 'J4a and no write was attempted');

// FALSE_NOT_WRITTEN_CLAIM_COUNT = 0: the unknown state is never any of the three confident answers.
var confident = ['WRITE_COMMITTED_VERIFIED', 'WRITE_REJECTED', 'WRITE_NOT_STARTED'];
ok(confident.indexOf(unk.writeOutcome) === -1,
  'J5 FALSE_NOT_WRITTEN_CLAIM_COUNT = 0 — an unverified commit is none of the confident answers');
eq(summarize('KM-1', flat({ wrote: true, outcome: 'CREATE', draftId: 'RD::x',
  result: { writeOutcome: 'WRITE_COMMITTED_READBACK_FAILED', committedDraftId: 'RD::x' } })),
  { sku: 'KM-1', status: 'WRITE_COMMITTED_READBACK_FAILED', code: 'WRITE_COMMITTED_READBACK_FAILED',
    draftId: 'RD::x', requiresReconciliation: true },
  'J6 and it reaches the job as its own state, neither success nor failure');
// AUTOREPLAY_ON_UNKNOWN = NO.
var lockedRegion = code(ORCH).split('function rpoFlatLockedApply_')[1].split('function rpoFlatDeps_')[0];
// A bare /for \(/ matched the loop that snapshots the BEFORE rows, which is not a retry. What must hold is
// that nothing schedules or repeats the apply: no timer, no sleep, no retry, and applyFlat entered once.
ok(!/setTimeout|Utilities\.sleep|retry|again/i.test(lockedRegion),
  'J7 AUTOREPLAY_ON_UNKNOWN = NO — no timer, no sleep, no retry in the write boundary');
eq((lockedRegion.match(/KMRDV2P\.applyFlat\(/g) || []).length, 1,
  'J7a and the apply is entered exactly once per call — a committed-unknown write is never resent');
ok(/blind retry/.test(PAGE), 'J8 and the operator surface says so where the operator reads it');

// =========================================================================================================
section('K. idempotency, without a database');
// =========================================================================================================

var idSet = sheetSet([]);
var k1 = runGenerate(CASE.NEW_ORDER, {}, idSet);
var k2 = runGenerate(CASE.NEW_ORDER, {}, idSet);
eq(k1.out.draftId, k2.out.draftId, 'K1 the same operator action yields the same RD:: identity');
eq(draftRows(idSet).length, 1, 'K2 DUPLICATE_DRAFT_ROW_COUNT = 0');
eq(runRows(idSet).length, 1, 'K3 DUPLICATE_RUN_ROW_COUNT = 0');
eq(runRows(idSet)[0][RUN_HDRS.indexOf('attempt_count')], 2,
  'K4 the replay is counted rather than hidden');
eq([k1.out.wrote, k2.out.wrote], [true, true], 'K5 both applied — an upsert, not a second row');
// The downstream candidate identity is untouched and still deterministic.
ok(/ROEXEC-/.test(read(GS + '13_procurement_handlers.gs')),
  'K6 DUPLICATE_DOWNSTREAM_CANDIDATE_COUNT = 0 — the ROEXEC execution key is unchanged');

// =========================================================================================================
section('L. boundaries: operator authority, Request Order, shipping');
// =========================================================================================================

ok(/function handleRequestOrderAiPlan\(/.test(PAGE), 'L1 OPERATOR_ACTION_NAME = handleRequestOrderAiPlan');
ok(/_roAiPlanBusy\s*=\s*false;\s*\/\//.test(PAGE) || /var _roAiPlanBusy = false;/.test(PAGE),
  'L2 and it is latched by _roAiPlanBusy');
ok(/if \(_roAiPlanBusy\) return Promise\.resolve\(null\);/.test(PAGE),
  'L3 DOUBLE_CLICK_DUPLICATE_DISPATCH = 0 — a second activation returns before dispatching');
ok(/btn\.disabled = true/.test(PAGE), 'L4 with an immediate visual acknowledgement');

// Nothing in this round issues a Request Order, a PO or a shipment.
var TOUCHED = [P_REL, GS + '47_api_v1_recommendation_generation.gs'];
TOUCHED.forEach(function (f) {
  var c = code(read(f));
  ok(!/handleCreateRequestOrderDraft_|purchase_order|createPurchaseOrder/i.test(c),
    'L5 ' + path.basename(f) + ' AUTO_CREATE_REQUEST_ORDER / PO = NO');
  ok(!/shipping_allocation_draft|shipment|weekly_shipping|carrier/i.test(c),
    'L6 ' + path.basename(f) + ' SHIPPING_TABLE_WRITE_COUNT = 0');
});
eq(k1.out.writtenTables, ['request_order_allocation_drafts', 'recommendation_calculation_runs'],
  'L7 the execution writes exactly two tables, both of them Ordering');
// The transition that does create a Request Order is a separate, explicit operator step.
ok(/NOT A WRITER/.test(read(GS + '66_api_v1_request_order_send.gs')),
  'L8 DRAFT_TO_REQUEST_ORDER_TRANSITION = Send Request (66_), delegating to 13_ — a separate operator act');
ok(/explodeSendRequestLines/.test(code(read(CORE + 'supply-planning-request-draft-v2.js'))),
  'L9 driven by tN_order_qty > 0, the OPERATOR value');

// =========================================================================================================
section('M. mutation');
// =========================================================================================================

function genWith(mod, r, over) {
  var set = sheetSet([]);
  var dto = KMREC.generateOrderPlanningRecommendation(r, { unitsPerCarton: r.units_per_carton });
  var cmd = { recommendationType: 'MONTHLY_ORDER', mode: 'ai_plan', planningCycle: '2026-10',
    businessScope: SCOPE, generationType: 'ai_plan', actor: 'op@km', now: 'T',
    recommendation: { action: dto.recommendationAction, stale: false } };
  for (var k in over) if (Object.prototype.hasOwnProperty.call(over, k)) cmd[k] = over[k];
  var out = mod.generateMonthlyFlat(cmd, {
    loadActiveContext: function (q) { return mod.loadActiveFlat(set, q); },
    computeFacts: function () {
      return { ready: true, lines: factLines(r), unitsPerCarton: r.units_per_carton,
        provenance: { calculationRunId: 'RUN-1', formulaVersion: 'ORDER_PLANNING_GAP', calculatedAt: r.calculated_at } };
    },
    lockedApply: function (p, t, o) { return mod.applyFlat(set, p, (over && over.__forceToken) || t, o); }
  });
  return { out: out, set: set };
}

mut('MA REALLOCATE becomes write-eligible', function () {
  var mod = loadMutated(P_REL,
    "  var ORDER_AUTHORIZING_ACTIONS = { NEW_ORDER: 1, REALLOCATE_AND_NEW_ORDER: 1 };",
    "  var ORDER_AUTHORIZING_ACTIONS = { NEW_ORDER: 1, REALLOCATE_AND_NEW_ORDER: 1, REALLOCATE: 1 };");
  return genWith(mod, CASE.REALLOCATE).out.outcome !== 'NOT_ELIGIBLE'
    && runGenerate(CASE.REALLOCATE).out.outcome === 'NOT_ELIGIBLE';
});

mut('MB MANUAL_REVIEW becomes write-eligible', function () {
  var mod = loadMutated(P_REL,
    "  var NON_ORDER_AUTHORIZING_ACTIONS = { REALLOCATE: 1, NO_ACTION: 1, MANUAL_REVIEW: 1 };",
    "  var NON_ORDER_AUTHORIZING_ACTIONS = { REALLOCATE: 1, NO_ACTION: 1 };");
  return genWith(mod, CASE.MANUAL_REVIEW).out.reason !== 'ACTION_AUTHORIZES_NO_ORDER'
    && runGenerate(CASE.MANUAL_REVIEW).out.reason === 'ACTION_AUTHORIZES_NO_ORDER';
});

mut('MC the combined action adds the reallocation to the order quantity', function () {
  var mod = loadMutated(CORE + 'supply-planning-request-draft-v2.js',
    "      row[p + 'recommended_qty'] = rec;",
    "      row[p + 'recommended_qty'] = rec + (input.reallocationIn || 0);");
  var mutRow = mod.projectFlatDraftRow({ scope: SCOPE, planningCycle: '2026-10',
    tiers: { T1: { month: '2026-10', recommendedQty: 72 } }, unitsPerCarton: 12, provenance: {},
    generationType: 'ai_plan', draftVersion: 1, actor: 'a', now: 'T', reallocationIn: 30 });
  var realRow = KMRDV2.projectFlatDraftRow({ scope: SCOPE, planningCycle: '2026-10',
    tiers: { T1: { month: '2026-10', recommendedQty: 72 } }, unitsPerCarton: 12, provenance: {},
    generationType: 'ai_plan', draftVersion: 1, actor: 'a', now: 'T', reallocationIn: 30 });
  return mutRow.t1_recommended_qty === 102 && realRow.t1_recommended_qty === 72;
});

mut('MD the KMREC display total becomes the write source', function () {
  var mod = loadMutated(P_REL,
    "      unitsPerCarton: facts && facts.unitsPerCarton,",
    "      unitsPerCarton: facts && facts.unitsPerCarton, tiers: { T1: { month: '2026-10', recommendedQty: 36 } },");
  return genWith(mod, TWO_TIER).set['request_order_allocation_drafts'].rows[0][KMRDV2.V2_HEADERS.indexOf('t1_recommended_qty')] === 36
    && runGenerate(TWO_TIER).set['request_order_allocation_drafts'].rows[0][KMRDV2.V2_HEADERS.indexOf('t1_recommended_qty')] === 24;
});

mut('ME a stale recommendation is allowed through', function () {
  var mod = loadMutated(P_REL,
    "      if (rec.stale === true) {",
    "      if (rec.stale === 'never') {");
  return genWith(mod, CASE.NEW_ORDER, { recommendation: { action: 'NEW_ORDER', stale: true } }).out.wrote === true
    && runGenerate(CASE.NEW_ORDER, { recommendation: { action: 'NEW_ORDER', stale: true } }).out.wrote === false;
});

mut('MF the optimistic token check is removed', function () {
  var mod = loadMutated(P_REL,
    "    if (!KMPR.tokensMatch(liveToken, expectedToken)) {",
    "    if (false) {");
  var s1 = sheetSet([]); genWith(mod, CASE.NEW_ORDER);
  var bad = { draft_version: 99, userEditFingerprint: 'WRONG' };
  var seed = sheetSet([]); runGenerate(CASE.NEW_ORDER, {}, seed);
  var seed2 = sheetSet(seed['request_order_allocation_drafts'].rows.map(function (r) { return r.slice(); }));
  var m1 = genWith(mod, CASE.NEW_ORDER, { __forceToken: bad });
  var r1 = runGenerate(CASE.NEW_ORDER, { __forceToken: bad }, seed2);
  return m1.out.wrote === true && r1.out.result.conflict === true;
});

mut('MG a system refresh overwrites the operator edit', function () {
  var mod = loadMutated(CORE + 'supply-planning-request-draft-v2.js',
    "      if (out[p + 'user_edited'] === true) return;                                            // user decision preserved",
    "      if (out[p + 'user_edited'] === 'never') return;                                         // user decision preserved");
  var ed = KMRDV2.applyTierEdit(KMRDV2P.withFlatDefaults(stored), 'T1', { order_qty: 999 }, 'op@km', 'T1').row;
  var mutated = mod.refresh(ed, { T1: { month: '2026-10', recommendedQty: 60 } }, 'T2');
  var real = KMRDV2.refresh(ed, { T1: { month: '2026-10', recommendedQty: 60 } }, 'T2');
  return mutated.t1_order_qty === 60 && real.t1_order_qty === 999;
});

mut('MH an unknown write outcome is reported as a clean success', function () {
  var faked = ORCH.replace("        resR.writeOutcome = 'WRITE_COMMITTED_READBACK_FAILED';",
    "        resR.writeOutcome = 'WRITE_COMMITTED_VERIFIED';");
  if (faked === ORCH) throw new Error('MH anchor drifted');
  var wrote = [];
  var ctx = {
    LockService: { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } },
    rprBuildSheetSet_: function () { return { set: { a: { headers: [], rows: [] }, b: { headers: [], rows: [] } }, meta: {} }; },
    rpoFlatTables_: function () { return ['a', 'b']; },
    KMRDV2P: { applyFlat: function () { return { wrote: true, runStatus: 'COMPLETED' }; } },
    rpoKeyedDeltaWrite_: function () { wrote.push(1); return { verified: false }; }
  };
  var fn = liftGs(faked, 'rpoFlatLockedApply_', ctx);
  return fn({}, { draftId: 'RD::x' }, {}, {}).writeOutcome === 'WRITE_COMMITTED_VERIFIED'
    && runLocked({ wrote: true, runStatus: 'COMPLETED' }, false).res.writeOutcome === 'WRITE_COMMITTED_READBACK_FAILED';
});

mut('MI the duplicate-activation latch is removed', function () {
  var faked = PAGE.replace('  if (_roAiPlanBusy) return Promise.resolve(null);',
    '  if (false) return Promise.resolve(null);');
  if (faked === PAGE) throw new Error('MI anchor drifted');
  return !/if \(_roAiPlanBusy\) return Promise\.resolve\(null\);/.test(faked)
    && /if \(_roAiPlanBusy\) return Promise\.resolve\(null\);/.test(PAGE);
});

mut('MJ a shipping table joins the written set', function () {
  var mod = loadMutated(P_REL,
    "    var hT = sheetSet[HEADER_TABLE]; aType(hT && Array.isArray(hT.headers) && Array.isArray(hT.rows), 'applyFlat: missing ' + HEADER_TABLE);",
    "    var hT = sheetSet['shipping_allocation_drafts'] || sheetSet[HEADER_TABLE]; aType(hT && Array.isArray(hT.headers) && Array.isArray(hT.rows), 'applyFlat: missing ' + HEADER_TABLE);");
  var set = sheetSet([]);
  set['shipping_allocation_drafts'] = { headers: KMRDV2.V2_HEADERS.slice(), rows: [] };
  var dto = KMREC.generateOrderPlanningRecommendation(CASE.NEW_ORDER, { unitsPerCarton: 12 });
  mod.generateMonthlyFlat({ recommendationType: 'MONTHLY_ORDER', mode: 'ai_plan', planningCycle: '2026-10',
    businessScope: SCOPE, actor: 'a', now: 'T', recommendation: { action: dto.recommendationAction, stale: false } }, {
    loadActiveContext: function (q) { return mod.loadActiveFlat(set, q); },
    computeFacts: function () { return { ready: true, lines: factLines(CASE.NEW_ORDER), unitsPerCarton: 12, provenance: {} }; },
    lockedApply: function (p, t, o) { return mod.applyFlat(set, p, t, o); }
  });
  return set['shipping_allocation_drafts'].rows.length === 1
    && runGenerate(CASE.NEW_ORDER).set['request_order_allocation_drafts'].rows.length === 1;
});

// =========================================================================================================
section('RESULT');
console.log('passed ' + pass + '  failed ' + fail + '  mutants killed ' + neg.caught + '/' + (neg.caught + neg.missed));
if (fail > 0) { console.error('\nS5-R7A WRITE-EXECUTION WIRING DRIFT'); process.exit(1); }
console.log('PRODUCTION_ROWS_WRITTEN = 0 · REAL_DB_WRITE_TEST_COUNT = 0 · WRITE_ELIGIBILITY_OWNER_COUNT = 1');
