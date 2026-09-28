// S5-R6 — OPERATOR DECISION → DRAFT ALLOCATION / REQUEST ORDER CANDIDATE CONTRACT + WRITE BOUNDARY.
//
// WHAT SHIPPED. One pure function, `KMRDV2P.planOperatorDecision`, in front of the EXISTING planner. It decides
// whether an operator decision may become a write and hands the input to `planFlat`, which stays the only
// planner. Nothing executes: no sheet, no lock, no network, no production row.
//
// WHY THE RECOMMENDATION IS NOT A QUANTITY SOURCE. KMREC's `totalRecommendedQty` cartonizes the raw T1–T3 gap
// sum ONCE; the draft's `tN_recommended_qty` is the per-tier `tN_suggested_qty`, each already cartonized. §C
// exhibits a row where the two differ (48 vs 36) — so adopting the display total as a write value would not be
// a convenience, it would be a second quantity authority writing a different number. It is refused structurally:
// the gate never reads it.
//
// WHY THERE IS NO COMBINED QUANTITY TO FORBID. The flat 53-column draft has no reallocation column at all (§E).
// The §41 reallocation is already persisted by its own owner in `order_planning_gap`. So the two meanings are
// not competing for one field — only the new-order meaning has a home here, and the gate carries no other.
//
// THE SUITE USES THE REAL OWNERS. Real KMREC DTOs from real gap rows, the real `planFlat`, the real `applyFlat`
// over an in-memory sheet set built from the real `KMRDV2.V2_HEADERS`. No simplified re-implementation.
//
// NO FILE IS WRITTEN. Mutants are compiled in memory.
//
// Run: node assets/tests/s5-r6-write-boundary-mapping.test.js

var fs = require('fs');
var path = require('path');
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
function dtoFor(r) { return KMREC.generateOrderPlanningRecommendation(r, { now: '2026-09-28T06:00:00Z' }); }

// The gap facts exactly as the LIVE generation path supplies them (47_ builds these lines from the same
// columns, recommendedQty = tN_suggested_qty VERBATIM, "no re-cartonization").
function factLinesFrom(r) {
  return ['T1', 'T2', 'T3'].map(function (t) {
    var lc = t.toLowerCase();
    return { request_bucket: t, request_month: r[lc + '_month'], recommendedQty: r[lc + '_suggested_qty'],
      snapshotRow: { units_per_carton: r.units_per_carton } };
  });
}
var SCOPE = { company: 'ResTW', country: 'JP', marketplace: 'Amazon', sku: 'KM-1', draft_purpose: 'regular' };
function decisionInput(r, over) {
  var d = dtoFor(r);
  var base = {
    recommendationAction: d.recommendationAction,
    recommendationStale: false,
    operatorConfirmed: true,
    existingRow: null,
    scope: SCOPE, planningCycle: '2026-10',
    factLines: factLinesFrom(r), unitsPerCarton: r.units_per_carton,
    provenance: { calculationRunId: 'RUN-1', formulaVersion: 'ORDER_PLANNING_GAP',
      calculatedAt: r.calculated_at, sourceDataAsOf: '2026-09-28' },
    generationType: 'ai_plan', mode: 'ai_plan', draftAction: 'refresh',
    actor: 'op@km', now: '2026-09-28T07:00:00Z', businessScopeKey: 'BSK-1'
  };
  for (var k in over) if (Object.prototype.hasOwnProperty.call(over, k)) base[k] = over[k];
  return base;
}
function decide(r, over) { return KMRDV2P.planOperatorDecision(decisionInput(r, over)); }

// An in-memory sheet set over the REAL headers — the same shape the .gs adapter builds from a Sheet.
function sheetSet(rows) {
  return {
    'request_order_allocation_drafts': { headers: KMRDV2.V2_HEADERS.slice(), rows: rows || [] },
    'recommendation_calculation_runs': { headers: KMPR.RUN_JOURNAL_HEADERS ? KMPR.RUN_JOURNAL_HEADERS.slice() :
      ['calculation_run_id', 'recommendation_type', 'draft_id', 'planning_cycle', 'business_scope_key',
        'draft_version', 'run_status', 'current_stage', 'formula_version', 'source_data_as_of',
        'started_by', 'started_at', 'completed_by', 'completed_at', 'error_summary', 'attempt_count'], rows: [] }
  };
}
function rowToArray(o) { return KMRDV2.V2_HEADERS.map(function (h) { return o[h] !== undefined ? o[h] : ''; }); }

// The five canonical cases, built from gap rows that really produce each action.
var CASE = {
  NEW_ORDER: gapRow({ t1_gap_qty: 55, t1_suggested_qty: 60 }),
  REALLOCATE: gapRow({ reallocation_in_qty_snapshot: 30, factory_available_qty_snapshot: 100,
    reallocation_out_qty_snapshot: 0 }),
  REALLOCATE_AND_NEW_ORDER: gapRow({ t1_gap_qty: 70, t1_suggested_qty: 72,
    factory_available_qty_snapshot: 100, reallocation_in_qty_snapshot: 30, reallocation_out_qty_snapshot: 0 }),
  NO_ACTION: gapRow({}),
  MANUAL_REVIEW: gapRow({ calculation_status: 'BLOCKED' })
};

// =========================================================================================================
section('A. the write owner, confirmed rather than assumed');
// =========================================================================================================

var ORCH = read(GS + '24_recommendation_orchestrator.gs');
var REPO = read(GS + '23_recommendation_persistence_repository.gs');

ok(/function rpoFlatLockedApply_\(/.test(ORCH),
  'A1 the MONTHLY flat locked write boundary is rpoFlatLockedApply_ in 24_');
ok(/lockedApply: function \(plan, expectedToken, o\) \{ return rpoFlatLockedApply_/.test(code(ORCH)),
  'A2 every flat path (generate / edit / submit / cancel) reaches it through ONE injected dep');
ok(/applyPersistencePlanWithLock\(plan, expectedToken, opts\)/.test(code(REPO))
  && !/applyPersistencePlanWithLock/.test(code(ORCH)),
  'A3 KMPR.applyPersistencePlanWithLock is the LINE engine boundary — the flat path never calls it');
// The S5-R5 audit named applyPersistencePlanWithLock as the next write owner. It is not: it drives the
// legacy line tables, and under the flat cutover MONTHLY never reaches it. The correction is the finding.
ok(/NEVER touches the child-line table|NO child lines/.test(ORCH + P_SRC),
  'A4 the flat path is declared never to write the child line table');
eq((code(P_SRC).match(/function planFlat\(/g) || []).length, 1,
  'A5 exactly ONE planner — planOperatorDecision added no second one');
ok(/plan: planFlat\(planInput\)/.test(code(P_SRC)),
  'A6 the gate produces its plan BY CALLING planFlat, not by rebuilding one');

// The gate itself must touch nothing live.
// The end marker must survive comment stripping, so it is the next FUNCTION, not the banner comment
// above it. Slicing on the banner captured the rest of the file and quietly tested everything.
var GATE = code(P_SRC).split('function planOperatorDecision(')[1].split('function rowObj_(')[0];
if (GATE.length < 200 || GATE.length > 4000) { fail++; console.error('FAIL gate slice is implausible: ' + GATE.length + ' chars'); }
ok(!/SpreadsheetApp|LockService|fetch|require\(|Date\.now|Math\.random|getRange|setValues/.test(GATE),
  'A7 WRITE_PLAN_IS_PURE — no sheet, lock, clock, randomness or transport in the gate');
ok(!/KMREC|generateOrderPlanningRecommendation|deriveRecommendationAction|isStale\(/.test(GATE),
  'A8 the gate never derives the recommendation or its staleness — both arrive as values');
ok(!/calculateSuggestedOrderQty|Math\.ceil|deriveCarton|totalRecommendedQty/.test(GATE),
  'A9 SECOND_CALCULATION_PATH_COUNT = 0 — no cartonization, no quantity arithmetic');

// =========================================================================================================
section('B. the five actions, each mapped to what it authorizes');
// =========================================================================================================

eq(Object.keys(KMRDV2P.ORDER_AUTHORIZING_ACTIONS).sort(), ['NEW_ORDER', 'REALLOCATE_AND_NEW_ORDER'],
  'B1 only these two authorize an order write');
eq(Object.keys(KMRDV2P.NON_ORDER_AUTHORIZING_ACTIONS).sort(), ['MANUAL_REVIEW', 'NO_ACTION', 'REALLOCATE'],
  'B2 these three authorize none');
// The partition must cover the KMREC enum exactly — an action in neither half would fall to "unknown".
var partition = Object.keys(KMRDV2P.ORDER_AUTHORIZING_ACTIONS)
  .concat(Object.keys(KMRDV2P.NON_ORDER_AUTHORIZING_ACTIONS)).sort();
eq(partition, Object.keys(KMREC.ACTION).sort(),
  'B3 the partition is exactly the KMREC enum — no member unclassified, none invented');

eq(dtoFor(CASE.NEW_ORDER).recommendationAction, 'NEW_ORDER', 'B4 the NEW_ORDER fixture really is one');
eq(dtoFor(CASE.REALLOCATE).recommendationAction, 'REALLOCATE', 'B5 the REALLOCATE fixture really is one');
eq(dtoFor(CASE.REALLOCATE_AND_NEW_ORDER).recommendationAction, 'REALLOCATE_AND_NEW_ORDER',
  'B6 the combined fixture really is one');
eq(dtoFor(CASE.NO_ACTION).recommendationAction, 'NO_ACTION', 'B7 the NO_ACTION fixture really is one');
eq(dtoFor(CASE.MANUAL_REVIEW).recommendationAction, 'MANUAL_REVIEW', 'B8 the MANUAL_REVIEW fixture really is one');

ok(decide(CASE.NEW_ORDER).authorized === true, 'B9 NEW_ORDER authorizes a draft write');
ok(decide(CASE.REALLOCATE_AND_NEW_ORDER).authorized === true,
  'B10 REALLOCATE_AND_NEW_ORDER authorizes a draft write — for its ORDER half only');
eq(decide(CASE.REALLOCATE).refusal, 'ACTION_AUTHORIZES_NO_ORDER',
  'B11 REALLOCATE writes no order candidate — the transfer is already persisted by the §41 owner');
eq(decide(CASE.NO_ACTION).refusal, 'ACTION_AUTHORIZES_NO_ORDER',
  'B12 NO_ACTION must not create an actionable order candidate');
eq(decide(CASE.MANUAL_REVIEW).refusal, 'ACTION_AUTHORIZES_NO_ORDER',
  'B13 MANUAL_REVIEW must not AUTO-create an actionable order candidate');
['REALLOCATE', 'NO_ACTION', 'MANUAL_REVIEW'].forEach(function (a) {
  ok(decide(CASE[a]).plan === null && decide(CASE[a]).planInput === null,
    'B14 ' + a + ' produces no plan at all, not an empty one');
});

// Missing is not NO_ACTION — the S5-R5 rule, carried to the write boundary.
eq(KMRDV2P.planOperatorDecision({ recommendationAction: null }).refusal, 'RECOMMENDATION_UNAVAILABLE',
  'B15 an absent action is UNAVAILABLE, never silently NO_ACTION');
eq(KMRDV2P.planOperatorDecision({ recommendationAction: 'SHIP' }).refusal, 'RECOMMENDATION_UNAVAILABLE',
  'B16 an action outside the closed set refuses — it is not passed through');

// =========================================================================================================
section('C. the recommendation authorizes; it does not price');
// =========================================================================================================

// The two authorities really do differ. upc=12, t1=13 t2=13: per-tier 24+24=48; cartonize-once ceil(26/12)*12=36.
var twoTier = gapRow({ t1_gap_qty: 13, t1_suggested_qty: 24, t2_gap_qty: 13, t2_suggested_qty: 24 });
eq(dtoFor(twoTier).totalRecommendedQty, 36,
  'C1 KMREC cartonizes the RAW T1–T3 sum once → 36');
eq(twoTier.t1_suggested_qty + twoTier.t2_suggested_qty + twoTier.t3_suggested_qty, 48,
  'C2 the per-tier stored suggestion sums to 48 — the two authorities are NOT the same number');

var planned = decide(twoTier).plan;
eq([planned.row.t1_recommended_qty, planned.row.t2_recommended_qty, planned.row.t3_recommended_qty], [24, 24, 0],
  'C3 the draft stores the per-tier gap suggestion VERBATIM — the live authority, unchanged');
var recSum = planned.row.t1_recommended_qty + planned.row.t2_recommended_qty + planned.row.t3_recommended_qty;
ok(recSum === 48 && recSum !== dtoFor(twoTier).totalRecommendedQty,
  'C4 KMREC_TOTAL_IS_WRITE_SOURCE = NO — the display total reached no column');
ok(JSON.stringify(planned.row).indexOf('36') === -1,
  'C5 the cartonize-once total appears nowhere in the written row');

// order_qty defaults to the recommendation, and that default is the ONLY place a system value seeds an
// operator field.
eq([planned.row.t1_order_qty, planned.row.t2_order_qty], [24, 24],
  'C6 tN_order_qty defaults to the system suggestion on create');
eq([planned.row.t1_user_edited, planned.row.t2_user_edited, planned.row.t3_user_edited], [false, false, false],
  'C7 a system-created tier is not marked user-edited');

// =========================================================================================================
section('D. the action is descriptive, and stays out of the row');
// =========================================================================================================

var okPlan = decide(CASE.NEW_ORDER).plan;
var rowKeys = Object.keys(okPlan.row);
eq(rowKeys.length, KMRDV2.V2_HEADERS.length, 'D1 the planned row has exactly the frozen 53 columns');
eq(rowKeys.filter(function (k) { return /recommendation_type|recommendation_action|reason_token|action/i.test(k); }), [],
  'D2 no column exists to hold an action or a reason token');
var planJson = JSON.stringify(okPlan);
eq(Object.keys(KMREC.ACTION).filter(function (a) { return planJson.indexOf(a) >= 0; }), [],
  'D3 ACTION_PERSISTED = NO — no enum value appears anywhere in the plan');
eq(KMREC.REASON_TOKENS.filter(function (t) { return planJson.indexOf(t) >= 0; }), [],
  'D4 REASON_TOKENS_PERSISTED = NO');
eq(decide(CASE.NEW_ORDER).actionPersisted, false, 'D5 the result says so explicitly, for a caller to assert on');
// The lifecycle state is derived from quantities and tier status, not from the recommendation.
eq(okPlan.row.status, 'draft', 'D6 RECOMMENDATION_ACTION_IS_DRAFT_STATE = NO — status comes from deriveHeaderStatus');
eq(Object.keys(KMRDV2.HEADER_STATUS).sort(), ['cancelled', 'draft', 'partially_submitted', 'submitted'],
  'D7 the draft lifecycle vocabulary is unchanged and shares no member with the action enum');

// The plan input is assembled field by field, so an extra caller key cannot reach the row.
var smuggled = decide(CASE.NEW_ORDER, { recommendationAction: 'NEW_ORDER' });
var smuggledIn = decisionInput(CASE.NEW_ORDER);
smuggledIn.reasonTokens = ['NEW_ORDER_REQUIRED'];
smuggledIn.recommendation_action_column = 'NEW_ORDER';
var smuggledOut = KMRDV2P.planOperatorDecision(smuggledIn);
eq(Object.keys(smuggledOut.planInput).indexOf('reasonTokens'), -1,
  'D8 an unexpected caller key is dropped — planInput is built by name, never spread');
eq(JSON.stringify(smuggledOut.plan.row), JSON.stringify(smuggled.plan.row),
  'D9 and the written row is byte-identical either way');

// =========================================================================================================
section('E. two quantities, and only one of them has a home here');
// =========================================================================================================

eq(KMRDV2.V2_HEADERS.filter(function (h) { return /realloc/i.test(h); }), [],
  'E1 the flat draft schema has NO reallocation column — the meanings never share a field');
var comboPlan = decide(CASE.REALLOCATE_AND_NEW_ORDER).plan;
eq(Object.keys(comboPlan.row).filter(function (k) { return /realloc/i.test(k); }), [],
  'E2 COMBINED_QTY_WRITTEN = NO — the combined action writes the order half only');
eq(decide(CASE.REALLOCATE_AND_NEW_ORDER).reallocationQtyWritten, false,
  'E3 and the result states it, so a caller need not infer it from absence');
// The reallocation qty of this fixture is 30 and its order qty 72. Neither 102 nor 30 may appear.
eq(comboPlan.row.t1_recommended_qty, 72, 'E4 the order half is the gap suggestion, untouched by the reallocation');
ok(JSON.stringify(comboPlan.row).indexOf('102') === -1, 'E5 no merged 30 + 72 quantity exists');
eq(GATE.match(/[A-Za-z_.]*reallocation[A-Za-z_]*/gi) || [], ['reallocationQtyWritten', 'reallocationQtyWritten'],
  'E6 the only reallocation tokens (refusal + authorization) in the gate is the flag declaring none was written — it reads no such input');
// The reallocation is persisted — just not here.
ok(/reallocation_in_qty_snapshot/.test(read(GS + '43_api_v1_gap_materialization.gs')),
  'E7 REALLOCATION_QTY_SOURCE = order_planning_gap.reallocation_in_qty_snapshot, written by its own §41 owner');

// =========================================================================================================
section('F. operator authority');
// =========================================================================================================

eq(decide(CASE.NEW_ORDER, { operatorConfirmed: false }).refusal, 'OPERATOR_AUTHORIZATION_REQUIRED',
  'F1 a visible recommendation does not authorize a write');
eq(decide(CASE.NEW_ORDER, { operatorConfirmed: undefined }).refusal, 'OPERATOR_AUTHORIZATION_REQUIRED',
  'F2 absent confirmation is not consent');
eq(decide(CASE.NEW_ORDER, { operatorConfirmed: 'yes' }).refusal, 'OPERATOR_AUTHORIZATION_REQUIRED',
  'F3 only the boolean true confirms — a truthy string does not');
ok(decide(CASE.NEW_ORDER, { operatorConfirmed: false }).plan === null,
  'F4 SYSTEM_AUTO_PERSISTS_DECISION = NO');

// Refusal precedence is frozen: the substantive obstacle is named before the missing confirmation.
eq(decide(CASE.NEW_ORDER, { operatorConfirmed: false, recommendationStale: true }).refusal, 'RECOMMENDATION_STALE',
  'F5 a stale row is reported stale even when confirmation is also missing');
eq(decide(CASE.NO_ACTION, { operatorConfirmed: false }).refusal, 'ACTION_AUTHORIZES_NO_ORDER',
  'F6 and an unorderable action is reported as such, not as a consent problem');

// =========================================================================================================
section('G. stale recommendation at write time');
// =========================================================================================================

eq(decide(CASE.NEW_ORDER, { recommendationStale: true }).refusal, 'RECOMMENDATION_STALE',
  'G1 STALE_WRITE_BEHAVIOR = REFUSE — never a silent upgrade to the newest values');
ok(decide(CASE.NEW_ORDER, { recommendationStale: true }).plan === null,
  'G2 a stale decision produces no plan to accidentally apply');
// Staleness has ONE owner and the gate is not it.
var displayed = dtoFor(CASE.NEW_ORDER);
var recalculated = gapRow({ t1_gap_qty: 55, t1_suggested_qty: 60, calculated_at: '2026-09-28T09:00:00Z' });
ok(KMREC.isStale(displayed, recalculated) === true && KMREC.isStale(displayed, CASE.NEW_ORDER) === false,
  'G3 STALE_WRITE_CHECK_OWNER = KMREC.isStale over sourceFingerprint — unchanged, and still the only one');
ok(!/sourceFingerprint|calculated_at/.test(GATE),
  'G4 the gate holds no fingerprint logic of its own to drift from it');

// The SECOND, independent stale guard — the optimistic token — is untouched and still fires.
var existing = KMRDV2.projectFlatDraftRow({ scope: SCOPE, planningCycle: '2026-10',
  tiers: { T1: { month: '2026-10', recommendedQty: 60 } }, unitsPerCarton: 12, provenance: {},
  generationType: 'ai_plan', draftVersion: 1, actor: 'op@km', now: 'T0' });
var setA = sheetSet([rowToArray(existing)]);
var pWithExisting = decide(CASE.NEW_ORDER, { existingRow: existing, draftAction: 'refresh' }).plan;
var staleToken = { draft_version: 99, userEditFingerprint: 'WRONG' };
var rej = KMRDV2P.applyFlat(setA, pWithExisting, staleToken, { now: 'T1', actor: 'op@km' });
eq([rej.conflict, rej.wrote, rej.reason], [true, false, 'TOKEN_MISMATCH'],
  'G5 a stale optimistic token is refused by the real applyFlat — zero rows written');
eq(setA['request_order_allocation_drafts'].rows.length, 1, 'G6 and the table is unchanged');

// =========================================================================================================
section('H. operator edit preservation');
// =========================================================================================================

var edited = KMRDV2.applyTierEdit(existing, 'T1', { order_qty: 999 }, 'op@km', 'T1').row;
eq([edited.t1_order_qty, edited.t1_user_edited, edited.t1_recommended_qty], [999, true, 60],
  'H1 an operator edit sets order_qty + user_edited and never touches recommended_qty');

var refreshed = decide(CASE.NEW_ORDER, { existingRow: edited, draftAction: 'refresh' }).plan;
eq(refreshed.row.t1_order_qty, 999, 'H2 USER_EDIT_SURVIVES_RECALC = YES — refresh leaves the operator value alone');
eq(refreshed.row.t1_user_edited, true, 'H3 and the flag survives with it');
eq(refreshed.row.t1_recommended_qty, 60,
  'H4 SYSTEM_VALUE_STILL_AVAILABLE_FOR_COMPARISON = YES — the system value is still readable beside it');

var regen = decide(CASE.NEW_ORDER, { existingRow: edited, draftAction: 'regenerate' }).plan;
eq(regen.row.t1_order_qty, 999,
  'H5 SYSTEM_RECALC_OVERWRITES_USER_EDIT = NO — even regenerate needs explicit confirmation');
eq(regen.row.draft_version, 2, 'H6 regenerate still advances the version');
var regenConfirmed = decide(CASE.NEW_ORDER,
  { existingRow: edited, draftAction: 'regenerate', confirmRegenerateOverUserEdits: true }).plan;
eq([regenConfirmed.row.t1_order_qty, regenConfirmed.row.t1_user_edited], [60, false],
  'H7 and only an explicit confirmation replaces it — then the flag is honestly cleared');
// The gate must never manufacture that confirmation.
eq(decide(CASE.NEW_ORDER, { existingRow: edited }).planInput.confirmRegenerateOverUserEdits, false,
  'H8 the gate never synthesizes the overwrite confirmation');
ok(!/confirmRegenerateOverUserEdits: true[^;]*$/m.test(GATE.split('planInput = {')[0] || ''),
  'H9 nor defaults it true anywhere before the plan input is built');

// =========================================================================================================
section('I. identity, idempotency and duplicate submit');
// =========================================================================================================

var d1 = decide(CASE.NEW_ORDER).plan, d2 = decide(CASE.NEW_ORDER).plan;
eq(d1.draftId, 'RD::MONTHLY_ORDER::2026-10::company=ResTW|country=JP|draft_purpose=regular|marketplace=Amazon|sku=KM-1',
  'I1 WRITE_IDENTITY = the deterministic RD:: id — no clock, no UUID');
eq(d1.draftId, d2.draftId, 'I2 the same operator decision yields the same identity');
eq(JSON.stringify(d1), JSON.stringify(d2), 'I3 the whole plan is deterministic — a stable write plan');

// Replay: apply the SAME plan twice against the same set. One row, one run row, no duplicate.
var setB = sheetSet([]);
var tok0 = KMPR.computeExpectedToken(1, []);
var r1 = KMRDV2P.applyFlat(setB, d1, tok0, { now: 'T1', actor: 'op@km' });
var liveTok = KMRDV2P.expectedTokenForExisting(
  KMRDV2P.withFlatDefaults(d1.row), 1);
var r2 = KMRDV2P.applyFlat(setB, d1, liveTok, { now: 'T2', actor: 'op@km' });
eq([r1.action, r2.action], ['INSERT', 'UPDATE'], 'I4 REPLAY_BEHAVIOR = upsert on the same id, never a second row');
eq(setB['request_order_allocation_drafts'].rows.length, 1, 'I5 no duplicate draft line');
eq(setB['recommendation_calculation_runs'].rows.length, 1, 'I6 no duplicate recommendation run');
var runHdr = setB['recommendation_calculation_runs'].headers;
eq(setB['recommendation_calculation_runs'].rows[0][runHdr.indexOf('attempt_count')], 2,
  'I7 the replay is COUNTED rather than hidden — attempt_count advances');

// A new calculation run is a different run row but still one draft.
var d3 = decide(CASE.NEW_ORDER, { existingRow: KMRDV2P.withFlatDefaults(d1.row),
  provenance: { calculationRunId: 'RUN-2', formulaVersion: 'ORDER_PLANNING_GAP',
    calculatedAt: CASE.NEW_ORDER.calculated_at, sourceDataAsOf: '2026-09-29' } }).plan;
eq(d3.calculationRunId, 'RUN-2', 'I8 a new calculation run is carried through');
KMRDV2P.applyFlat(setB, d3, KMRDV2P.expectedTokenForExisting(KMRDV2P.withFlatDefaults(d1.row), 1),
  { now: 'T3', actor: 'op@km' });
eq(setB['request_order_allocation_drafts'].rows.length, 1, 'I9 still ONE draft for the scope');
eq(setB['recommendation_calculation_runs'].rows.length, 2, 'I10 and a second run row, which is the journal working');

// The downstream Request Order has its own, separate idempotency authority.
var PROC = read(GS + '13_procurement_handlers.gs');
ok(/ROEXEC-/.test(PROC) && /execution_key/.test(PROC),
  'I11 DUPLICATE_WRITE_IDENTITY downstream = the deterministic ROEXEC- execution key, already existing');

// =========================================================================================================
section('J. draft allocation is not a request order');
// =========================================================================================================

var SEND = read(GS + '66_api_v1_request_order_send.gs');
ok(/explodeSendRequestLines/.test(code(read(CORE + 'supply-planning-request-draft-v2.js'))),
  'J1 REQUEST_ORDER_CANDIDATE is produced by the SEND explosion, a separate step');
// The candidate is driven by the OPERATOR quantity, never by the recommendation.
var sendLines = KMRDV2.explodeSendRequestLines(edited);
eq(sendLines.length, 1, 'J2 only tiers with a positive order_qty become candidates');
eq(sendLines[0].requested_qty, 999,
  'J3 ENTRY_CONDITION_FOR_REQUEST_ORDER_CANDIDATE = operator order_qty > 0 — not recommended_qty');
ok(JSON.stringify(sendLines).indexOf('recommended') === -1,
  'J4 the system suggestion is not even carried onto the candidate');
ok(/NOT A WRITER/.test(SEND) && /handleCreateRequestOrderDraft_/.test(SEND),
  'J5 Send delegates to the existing canonical Request Order writer — no new one');
// And nothing in this round auto-creates any of the three downstream objects.
var NEW_SRC = code(P_SRC);
ok(!/purchase_order|handleCreateRequestOrderDraft_|shipment|shipping_allocation/i.test(GATE),
  'J6 AUTO_CREATE_REQUEST_ORDER / PO / SHIPMENT = NO — the gate names none of them');
eq((GATE.match(/(carrier|lane|lead_time|eta|weekly|shipment)/gi) || []), [],
  'J7 SHIPPING_WRITE_COUNT = 0 — PHASE2_ORCHESTRATION_IMPLEMENTED = NO');

// =========================================================================================================
section('K. provenance, and the fields S5-R3 proved unavailable');
// =========================================================================================================

eq([okPlan.row.calculation_run_id, okPlan.row.formula_version, okPlan.row.source_data_as_of],
  ['RUN-1', 'ORDER_PLANNING_GAP', '2026-09-28'],
  'K1 PROVENANCE_FIELDS — run, formula and source-as-of are carried verbatim');
eq(okPlan.row.calculated_at, CASE.NEW_ORDER.calculated_at,
  'K2 the calculated_at that identifies the recommendation the operator saw');
eq(okPlan.runMeta.business_scope_key, 'BSK-1', 'K3 the planning scope travels on the run journal row');
// Missing provenance stays missing — a synthesized run id is derived from identity, never from a clock.
var noProv = decide(CASE.NEW_ORDER, { provenance: {} }).plan;
eq(noProv.row.source_data_as_of, '', 'K4 missing provenance is left blank, never faked');
ok(/^RUN::RD::MONTHLY_ORDER::/.test(noProv.calculationRunId),
  'K5 and the fallback run id is derived from the deterministic draft identity');
// The eight S5-R3 unavailable fields must not appear as columns.
var UNAVAILABLE = ['own_supply_used', 'cross_company_supply_used', 'committed_supply_used'];
eq(UNAVAILABLE.filter(function (f) { return KMRDV2.V2_HEADERS.indexOf(f) >= 0; }), [],
  'K6 no S5-R3 unavailable field was quietly added as a column');
eq(UNAVAILABLE.filter(function (f) { return GATE.indexOf(f) >= 0; }), [],
  'K7 and the gate reads none of them');

// =========================================================================================================
section('L. write truth, unchanged and not weakened');
// =========================================================================================================

eq(['WRITE_NOT_STARTED', 'WRITE_REJECTED', 'WRITE_COMMITTED_VERIFIED', 'WRITE_COMMITTED_READBACK_FAILED']
  .filter(function (o) { return ORCH.indexOf("'" + o + "'") >= 0; }).length, 4,
  'L1 WRITE_TRUTH_OWNER = rpoFlatLockedApply_ — all four outcomes exist');
ok(/requiresReconciliation = true/.test(ORCH),
  'L2 UNKNOWN_OUTCOME_POSSIBLE = YES, and it is surfaced rather than rounded to success');
ok(!/setTimeout|retry\(|\.retry\b/.test(code(ORCH).split('function rpoFlatLockedApply_')[1].split('function rpoFlatDeps_')[0]),
  'L3 AUTOREPLAY_PRESENT = NO — a committed-unverified write is never blindly resent');
ok(/blind retry/.test(read('assets/js/pages/request-order.js')),
  'L4 and the operator surface says so where the operator can read it');

// =========================================================================================================
section('M. mutation — every claim above must be able to fail');
// =========================================================================================================

mut('M1 NO_ACTION is allowed to create an order candidate', function () {
  var mod = loadMutated(P_REL,
    "  var NON_ORDER_AUTHORIZING_ACTIONS = { REALLOCATE: 1, NO_ACTION: 1, MANUAL_REVIEW: 1 };",
    "  var NON_ORDER_AUTHORIZING_ACTIONS = { REALLOCATE: 1, MANUAL_REVIEW: 1 };");
  return mod.planOperatorDecision(decisionInput(CASE.NO_ACTION)).refusal !== 'ACTION_AUTHORIZES_NO_ORDER'
    && decide(CASE.NO_ACTION).refusal === 'ACTION_AUTHORIZES_NO_ORDER';
});

mut('M2 MANUAL_REVIEW alone is let through the non-order guard', function () {
  var mod = loadMutated(P_REL,
    "  var ORDER_AUTHORIZING_ACTIONS = { NEW_ORDER: 1, REALLOCATE_AND_NEW_ORDER: 1 };",
    "  var ORDER_AUTHORIZING_ACTIONS = { NEW_ORDER: 1, REALLOCATE_AND_NEW_ORDER: 1, MANUAL_REVIEW: 1 };");
  // S5-R7A re-anchor, AND THE MUTANT THAT WAS INERT IN S5-R6 IS NOW THE LIVE ONE. Then, the non-order guard ran
  // first and held MANUAL_REVIEW whatever the order half said, so this edit changed nothing. The shared
  // eligibility owner checks the ORDER half first, so promoting MANUAL_REVIEW there now really does authorize a
  // write - and carving it out of the non-order half is what has become inert, because it falls through to the
  // unknown-action refusal instead.
  // Adding MANUAL_REVIEW to the ORDER half instead is INERT — the non-order guard runs first and still
  // holds it — so the mutant carves it out of the guard that actually decides.
  return mod.planOperatorDecision(decisionInput(CASE.MANUAL_REVIEW)).authorized === true
    && decide(CASE.MANUAL_REVIEW).authorized === false;
});

mut('M3 a stale recommendation is silently written anyway', function () {
  var mod = loadMutated(P_REL,
    "    if (input.recommendationStale === true) return refuse(DECISION_REFUSAL.RECOMMENDATION_STALE, 'REFRESH_REQUIRED');",
    "    if (input.recommendationStale === 'never') return refuse(DECISION_REFUSAL.RECOMMENDATION_STALE, 'REFRESH_REQUIRED');");
  return mod.planOperatorDecision(decisionInput(CASE.NEW_ORDER, { recommendationStale: true })).authorized === true
    && decide(CASE.NEW_ORDER, { recommendationStale: true }).authorized === false;
});

mut('M4 visibility becomes authorization', function () {
  var mod = loadMutated(P_REL,
    "    if (input.operatorConfirmed !== true) return refuse(DECISION_REFUSAL.OPERATOR_AUTHORIZATION_REQUIRED, '');",
    "    if (input.operatorConfirmed === 'never') return refuse(DECISION_REFUSAL.OPERATOR_AUTHORIZATION_REQUIRED, '');");
  return mod.planOperatorDecision(decisionInput(CASE.NEW_ORDER, { operatorConfirmed: false })).authorized === true
    && decide(CASE.NEW_ORDER, { operatorConfirmed: false }).authorized === false;
});

mut('M5 an unknown action is passed through instead of refused', function () {
  var mod = loadMutated(P_REL,
    "    return { eligible: false, reason: DECISION_REFUSAL.RECOMMENDATION_UNAVAILABLE, detail: 'ACTION_NOT_IN_CLOSED_SET' };",
    "    return { eligible: true, reason: null, detail: 'ACTION_NOT_IN_CLOSED_SET' };");
  return mod.planOperatorDecision(decisionInput(CASE.NEW_ORDER, { recommendationAction: 'SHIP' })).authorized === true
    && KMRDV2P.planOperatorDecision({ recommendationAction: 'SHIP' }).authorized === false;
});

mut('M6 the plan input is spread from the caller, so extra keys reach the planner', function () {
  var mod = loadMutated(P_REL,
    "    var planInput = {\r\n      existingRow: input.existingRow || null,",
    "    var planInput = {\r\n      reasonTokens: input.reasonTokens,\r\n      existingRow: input.existingRow || null,");
  var inp = decisionInput(CASE.NEW_ORDER); inp.reasonTokens = ['NEW_ORDER_REQUIRED'];
  return Object.keys(mod.planOperatorDecision(inp).planInput).indexOf('reasonTokens') >= 0
    && Object.keys(KMRDV2P.planOperatorDecision(inp).planInput).indexOf('reasonTokens') === -1;
});

mut('M7 the overwrite confirmation is defaulted true, so an operator edit is lost', function () {
  var mod = loadMutated(P_REL,
    "      confirmRegenerateOverUserEdits: input.confirmRegenerateOverUserEdits === true,",
    "      confirmRegenerateOverUserEdits: input.confirmRegenerateOverUserEdits !== false,");
  var inp = decisionInput(CASE.NEW_ORDER, { existingRow: edited, draftAction: 'regenerate' });
  return mod.planOperatorDecision(inp).plan.row.t1_order_qty === 60
    && KMRDV2P.planOperatorDecision(inp).plan.row.t1_order_qty === 999;
});

mut('M8 the gate builds its own plan instead of delegating to planFlat', function () {
  var mod = loadMutated(P_REL,
    "      planInput: planInput, plan: planFlat(planInput),",
    "      planInput: planInput, plan: { persist: true, row: { t1_recommended_qty: 0 } },");
  return mod.planOperatorDecision(decisionInput(CASE.NEW_ORDER)).plan.row.t1_recommended_qty === 0
    && decide(CASE.NEW_ORDER).plan.row.t1_recommended_qty === 60;
});

mut('M9 a reallocation column is added to the frozen 53', function () {
  var mod = loadMutated(CORE + 'supply-planning-request-draft-v2.js',
    "    .concat(['created_by', 'created_at', 'updated_by', 'updated_at', 'cancelled_by', 'cancelled_at', 'cancel_reason', 'note']);",
    "    .concat(['reallocation_qty', 'created_by', 'created_at', 'updated_by', 'updated_at', 'cancelled_by', 'cancelled_at', 'cancel_reason', 'note']);");
  return mod.V2_HEADERS.filter(function (h) { return /realloc/i.test(h); }).length === 1
    && KMRDV2.V2_HEADERS.filter(function (h) { return /realloc/i.test(h); }).length === 0;
});

mut('M10 the refusal precedence is reordered so a stale row is reported as ineligible', function () {
  // S5-R7A re-anchor. The precedence now reads: unknown action -> stale -> ineligible -> unconfirmed, the
  // first and third supplied by the shared eligibility owner. Swapping the middle pair is the same fault as
  // before: a stale row is told about its action instead of about being stale.
  var mod = loadMutated(P_REL,
    "    if (input.recommendationStale === true) return refuse(DECISION_REFUSAL.RECOMMENDATION_STALE, 'REFRESH_REQUIRED');\r\n    if (!elig.eligible) return refuse(elig.reason, elig.detail);",
    "    if (!elig.eligible) return refuse(elig.reason, elig.detail);\r\n    if (input.recommendationStale === true) return refuse(DECISION_REFUSAL.RECOMMENDATION_STALE, 'REFRESH_REQUIRED');");
  var inp = decisionInput(CASE.NO_ACTION, { recommendationStale: true });
  return mod.planOperatorDecision(inp).refusal === 'ACTION_AUTHORIZES_NO_ORDER'
    && KMRDV2P.planOperatorDecision(inp).refusal === 'RECOMMENDATION_STALE';
});

mut('M11 the display total becomes the written quantity', function () {
  var mod = loadMutated(P_REL,
    "      planInput: planInput, plan: planFlat(planInput),",
    "      planInput: planInput, plan: (function (p) { var x = planFlat(p); if (x && x.row && input.totalRecommendedQty != null) x.row.t1_recommended_qty = input.totalRecommendedQty; return x; })(planInput),");
  var inp = decisionInput(twoTier); inp.totalRecommendedQty = 36;
  return mod.planOperatorDecision(inp).plan.row.t1_recommended_qty === 36
    && KMRDV2P.planOperatorDecision(inp).plan.row.t1_recommended_qty === 24;
});

mut('M12 applyFlat stops guarding the optimistic token', function () {
  var mod = loadMutated(P_REL,
    "    if (!KMPR.tokensMatch(liveToken, expectedToken)) {",
    "    if (false) {");
  var s1 = sheetSet([rowToArray(existing)]), s2 = sheetSet([rowToArray(existing)]);
  var bad = { draft_version: 99, userEditFingerprint: 'WRONG' };
  return mod.applyFlat(s1, pWithExisting, bad, { now: 'T', actor: 'a' }).wrote === true
    && KMRDV2P.applyFlat(s2, pWithExisting, bad, { now: 'T', actor: 'a' }).wrote !== true;
});

// =========================================================================================================
section('RESULT');
console.log('passed ' + pass + '  failed ' + fail + '  mutants killed ' + neg.caught + '/' + (neg.caught + neg.missed));
if (fail > 0) { console.error('\nS5-R6 WRITE-BOUNDARY CONTRACT DRIFT'); process.exit(1); }
console.log('WRITE_PLAN_IS_PURE = YES · ACTION_PERSISTED = NO · COMBINED_QTY_WRITTEN = NO · PRODUCTION_ROWS_WRITTEN = 0');
