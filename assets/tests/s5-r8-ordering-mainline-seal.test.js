// S5-R8 — ORDERING MAINLINE CLOSING / INTEGRATION READINESS SEAL.
//
// WHY THIS SUITE EXISTS. Every other S5 suite proves one slice. This one proves the CHAIN: that the ten stages
// from projection to Request Order issuance each have one owner, that no stage acquired a second calculation or
// write path, and that the quantity authorities stay distinct. A closing seal written only as prose becomes
// untrue silently; this is the machine-checkable half of it.
//
// WHAT IT DELIBERATELY DOES NOT PIN. Owner NAMES are pinned only where the name is the constraint — the
// MONTHLY flat write boundary must be rpoFlatLockedApply_ and must NOT be the line engine's
// applyPersistencePlanWithLock, because confusing those two is the mistake S5-R5 actually made. Elsewhere the
// claim is singularity and non-duplication, so a future rename is not a regression.
//
// NO PRODUCTION WRITE. No sheet, no lock, no network. Mutants are compiled in memory.
//
// Run: node assets/tests/s5-r8-ordering-mainline-seal.test.js

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
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }
function has(rel) { try { read(rel); return true; } catch (e) { return false; } }

global.KMCALC = require(path.join(ROOT, CORE + 'supply-planning-calculations.js'));
var KMREC = require(path.join(ROOT, CORE + 'supply-recommendation.js'));
var KMRDV2 = require(path.join(ROOT, CORE + 'supply-planning-request-draft-v2.js'));
var KMRDV2P = require(path.join(ROOT, CORE + 'supply-planning-request-draft-v2-persistence.js'));
var KMTPP = require(path.join(ROOT, CORE + 'supply-planning-time-phased-projection.js'));
var KMFSR = require(path.join(ROOT, CORE + 'supply-planning-surplus-reallocation.js'));

var P_SRC = read(CORE + 'supply-planning-request-draft-v2-persistence.js');
var WS = read(GS + '42_api_v1_recommendation_workspace.gs');
var GAP = read(GS + '43_api_v1_gap_materialization.gs');
var GEN = read(GS + '47_api_v1_recommendation_generation.gs');
var ORCH = read(GS + '24_recommendation_orchestrator.gs');
var REPO = read(GS + '23_recommendation_persistence_repository.gs');
var SEND = read(GS + '66_api_v1_request_order_send.gs');
var PROC = read(GS + '13_procurement_handlers.gs');
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

// =========================================================================================================
section('A. the ten stages each exist, and each has one owner');
// =========================================================================================================

// Each stage is asserted by the PROPERTY that makes it an owner, not by a name someone may rename.
ok(typeof KMTPP.projectTimePhasedSupply === 'function',
  'A1 FORECAST/PROJECTION — KMTPP.projectTimePhasedSupply, the chronological balance owner');
eq((code(WS).match(/KMTPP\.projectTimePhasedSupply\(/g) || []).length, 1,
  'A2 and 42_ calls it exactly once — one projection entry, not one per branch');

ok(/var OP_GAP_TABLE_ = 'order_planning_gap';/.test(GAP),
  'A3 GAP — 43_ materializes order_planning_gap');
eq((code(GAP).match(/function gapOpMapFromLines_\(/g) || []).length, 1,
  'A4 through one row builder');

ok(typeof KMFSR.reallocatePreallocatedFactorySupply === 'function'
  && /KMFSR\.reallocatePreallocatedFactorySupply/.test(GAP),
  'A5 REALLOCATION — KMFSR §41, delegated to from 43_ rather than reimplemented there');
eq((code(GAP).match(/function gapOpApplyFactorySurplusReallocation_\(/g) || []).length, 1,
  'A6 through one application point');

// RESIDUAL is the stage most likely to be quietly duplicated, because it is arithmetic.
ok(/residualOrderNeedQty/.test(WS) && /remainingGapQty/.test(WS),
  'A7 RESIDUAL — 42_ derives residualOrderNeedQty from KMTPP remainingGapQty');
eq((code(WS).match(/KMCALC\.calculateSuggestedOrderQty\(/g) || []).length, 1,
  'A8 and cartonizes it through the canonical owner exactly once');

ok(typeof KMREC.generateOrderPlanningRecommendation === 'function',
  'A9 RECOMMENDATION — KMREC');
eq(KMREC.ORDER_TOTAL_AUTHORITY, 'SUM_T1_T3_RAW_GAP_CARTONIZE_ONCE',
  'A10 carrying its frozen total authority');

ok(/_roRecoByKey/.test(PAGE) && /function _roRecoActionHtml\(/.test(PAGE),
  'A11 READ MODEL + OPERATOR UI — request-order.js holds the DTO and renders it');
ok(/function handleRequestOrderAiPlan\(/.test(PAGE),
  'A12 with handleRequestOrderAiPlan as the operator entry');

ok(typeof KMRDV2P.planFlat === 'function' && typeof KMRDV2P.planOperatorDecision === 'function',
  'A13 WRITE PLAN — KMRDV2P');
ok(/function rpoFlatLockedApply_\(/.test(ORCH),
  'A14 WRITE EXECUTION — rpoFlatLockedApply_');
ok(/NOT A WRITER/.test(SEND) && /handleCreateRequestOrderDraft_/.test(SEND),
  'A15 REQUEST ORDER TRANSITION — 66_ delegating to 13_');

// =========================================================================================================
section('B. no second calculation path, no second write path');
// =========================================================================================================

// A probe that re-reads the file from disk cannot be shown a mutant. Counting definers is therefore a
// function of SOURCE TEXT, so §H can hand it a mutated copy and the claim is genuinely falsifiable.
function planFlatDefiners(src) { return (code(src).match(/function planFlat\(/g) || []).length; }
eq(planFlatDefiners(P_SRC), 1, 'B1 one flat planner');
eq((code(P_SRC).match(/function applyFlat\(/g) || []).length, 1, 'B2 one flat apply');
eq((code(P_SRC).match(/function actionAuthorizesOrderWrite\(/g) || []).length, 1, 'B3 one eligibility owner');
eq((code(ORCH).match(/lockedApply: function \(plan, expectedToken, o\) \{ return rpoFlatLockedApply_/g) || []).length, 1,
  'B4 one injected locked-apply dep serving generate / edit / submit / cancel');

// THE NAME THAT IS THE CONSTRAINT. applyPersistencePlanWithLock drives the LEGACY LINE tables; S5-R5 named it
// as the flat write owner and was wrong. Under the cutover MONTHLY must never reach it.
ok(/function applyPersistencePlanWithLock\(/.test(REPO),
  'B5 the line-engine boundary still exists, in 23_ where it belongs');
ok(!/applyPersistencePlanWithLock/.test(code(ORCH)),
  'B6 SECOND_WRITE_PATH_COUNT = 0 — the flat orchestrator never calls it');
ok(!/applyPersistencePlanWithLock/.test(code(GEN)),
  'B7 nor does the generation owner');

// The recommendation is derived in ONE place; no consumer re-derives it.
[GS + '47_api_v1_recommendation_generation.gs', GS + '24_recommendation_orchestrator.gs',
 GS + '48_api_v1_request_order_draft_job.gs', GS + '66_api_v1_request_order_send.gs',
 'assets/js/pages/request-order.js'].forEach(function (f) {
  ok(!/function deriveRecommendationAction|function deriveReasonTokens/.test(code(read(f))),
    'B8 SECOND_CALCULATION_PATH_COUNT = 0 — ' + path.basename(f) + ' derives no verdict of its own');
});

// =========================================================================================================
section('C. quantity authorities stay distinct');
// =========================================================================================================

// The map, asserted where it can be: each authority is readable and they are not the same value.
var row = {
  company: 'ResTW', country: 'JP', marketplace: 'Amazon', sku: 'KM-1',
  calculation_status: 'READY', calculation_month: '2026-09', calculated_at: '2026-09-28T05:30:00Z',
  t1_month: '2026-10', t1_gap_qty: 13, t1_suggested_qty: 24,
  t2_month: '2026-11', t2_gap_qty: 13, t2_suggested_qty: 24,
  t3_month: '2026-12', t3_gap_qty: 0, t3_suggested_qty: 0,
  t4_month: '2027-01', t4_gap_qty: 0, t4_suggested_qty: 0,
  units_per_carton: 12,
  factory_available_qty_snapshot: 100, reallocation_in_qty_snapshot: 30, reallocation_out_qty_snapshot: 0
};
var dto = KMREC.generateOrderPlanningRecommendation(row, { unitsPerCarton: 12 });
// One COMPLETE decision input, so a probe can vary a single field and still reach the code it is aiming
// at. A partial input made H6 die inside planFlat on a missing scope, which tests the wrong thing.
function decisionInput(over) {
  var base = {
    recommendationAction: dto.recommendationAction, recommendationStale: false, operatorConfirmed: true,
    existingRow: null,
    scope: { company: 'ResTW', country: 'JP', marketplace: 'Amazon', sku: 'KM-1', draft_purpose: 'regular' },
    planningCycle: '2026-10',
    factLines: ['T1', 'T2', 'T3'].map(function (t) {
      var lc = t.toLowerCase();
      return { request_bucket: t, request_month: row[lc + '_month'], recommendedQty: row[lc + '_suggested_qty'],
        snapshotRow: { units_per_carton: 12 } };
    }),
    unitsPerCarton: 12, provenance: {}, generationType: 'ai_plan', mode: 'ai_plan', draftAction: 'refresh',
    actor: 'op', now: 'T', businessScopeKey: 'K'
  };
  for (var k in over) if (Object.prototype.hasOwnProperty.call(over, k)) base[k] = over[k];
  return base;
}
eq(dto.totalRecommendedQty, 36, 'C1 KMREC total = cartonize(13+13) once = 36');
eq(row.t1_suggested_qty + row.t2_suggested_qty, 48, 'C2 per-tier stored suggestion = 48');
ok(dto.totalRecommendedQty !== (row.t1_suggested_qty + row.t2_suggested_qty),
  'C3 the two are DIFFERENT NUMBERS — which is why only one of them may be written');

var planned = KMRDV2P.planOperatorDecision(decisionInput({})).plan;
eq([planned.row.t1_recommended_qty, planned.row.t2_recommended_qty], [24, 24],
  'C4 TIER_WRITE_SOURCE = the per-tier stored suggestion');
ok(JSON.stringify(planned.row).indexOf('36') === -1,
  'C5 KMREC_TOTAL_IS_TIER_WRITE_SOURCE = NO — 36 reached no column');
eq(Object.keys(planned.row).filter(function (k) { return /realloc/i.test(k); }), [],
  'C6 REALLOCATION_QTY_MERGED_INTO_ORDER_QTY = NO — there is no column to merge into');
ok(JSON.stringify(planned.row).indexOf('102') === -1 && JSON.stringify(planned.row).indexOf('78') === -1,
  'C7 nor any field equal to a reallocation + order sum');
ok(!/totalRecommendedQty/.test(code(P_SRC)) && !/totalRecommendedQty/.test(code(GEN)),
  'C8 SECOND_QUANTITY_AUTHORITY_COUNT = 0 — neither writer reads the display total');

// The operator value is the one that leaves the draft.
var edited = KMRDV2.applyTierEdit(KMRDV2P.withFlatDefaults(planned.row), 'T1', { order_qty: 999 }, 'op', 'T').row;
var sendLines = KMRDV2.explodeSendRequestLines(edited);
eq(sendLines.map(function (l) { return l.requested_qty; }), [999, 24],
  'C9 SEND qty = tN_order_qty, the operator value — never recommended_qty');
ok(JSON.stringify(sendLines).indexOf('recommended') === -1,
  'C10 and the system suggestion is not carried onto the candidate at all');

// =========================================================================================================
section('D. the action/write matrix, end to end');
// =========================================================================================================

var MATRIX = {
  NEW_ORDER: true, REALLOCATE_AND_NEW_ORDER: true,
  REALLOCATE: false, NO_ACTION: false, MANUAL_REVIEW: false
};
Object.keys(MATRIX).forEach(function (a) {
  eq(KMRDV2P.actionAuthorizesOrderWrite(a).eligible, MATRIX[a],
    'D1 ' + a + ' order-write eligible = ' + MATRIX[a]);
});
eq(Object.keys(MATRIX).sort(), Object.keys(KMREC.ACTION).sort(),
  'D2 ACTION_WRITE_MATRIX_PASS — the matrix covers the KMREC enum exactly, no member unclassified');
// The action is not lifecycle.
eq(Object.keys(KMRDV2.HEADER_STATUS).filter(function (s) { return KMREC.ACTION[s]; }), [],
  'D3 the draft lifecycle vocabulary shares no member with the action enum');
eq(KMRDV2.V2_HEADERS.filter(function (h) { return /recommendation_type|recommendation_action|reason_token/i.test(h); }), [],
  'D4 and no column exists to persist one');

// =========================================================================================================
section('E. operator authority, including the exception');
// =========================================================================================================

eq(KMRDV2P.planOperatorDecision(decisionInput({ operatorConfirmed: false })).refusal,
  'OPERATOR_AUTHORIZATION_REQUIRED',
  'E1 AUTO_OPERATOR_DECISION_COUNT = 0 — an unconfirmed decision produces no plan');
ok(/if \(_roAiPlanBusy\) return Promise\.resolve\(null\);/.test(PAGE),
  'E2 DUPLICATE_OPERATOR_DISPATCH = 0 — the second activation returns before dispatch');

// THE EXCEPTION, NAMED RATHER THAN HIDDEN. The scheduled refresh is a real non-operator entry. What bounds it
// is that a refresh cannot take an operator's quantity and cannot issue anything.
ok(has(GS + '49_api_v1_weekly_recommendation_job.gs'),
  'E3 the scheduled ORDER_PLANNING driver exists and is acknowledged');
var edSrc = code(read(CORE + 'supply-planning-request-draft-v2.js'));
ok(/function refresh\(existing, freshTiers, now\)/.test(edSrc)
  && /user_edited'\] === true\) return;/.test(edSrc),
  'E4 and refresh SKIPS any tier the operator edited — the bound on what a schedule may move');
ok(!/handleCreateRequestOrderDraft_|purchase_order/i.test(code(read(GS + '49_api_v1_weekly_recommendation_job.gs'))),
  'E5 AUTO_CREATE_REQUEST_ORDER / PO = NO on the scheduled path');

// =========================================================================================================
section('F. the Request Order transition cannot be bypassed');
// =========================================================================================================

ok(/rosBuildWorkset_/.test(SEND) && /SEND_WORKSET_DRIFT/.test(SEND),
  'F1 Send builds a frozen workset and refuses a drifted one');
ok(/ROEXEC-/.test(PROC) && /execution_key/.test(PROC),
  'F2 and 13_ mints the Request Order under a deterministic execution key');
// Nothing in the recommendation or draft layer reaches the Request Order or PO writer.
[CORE + 'supply-recommendation.js', CORE + 'supply-planning-request-draft-v2.js',
 CORE + 'supply-planning-request-draft-v2-persistence.js'].forEach(function (f) {
  ok(!/handleCreateRequestOrderDraft_|purchase_orders|createPurchaseOrder/i.test(code(read(f))),
    'F3 RECOMMENDATION_BYPASSES_SEND_REQUEST = NO — ' + path.basename(f) + ' reaches no issuer');
});
ok(!/purchase_order/i.test(code(P_SRC)), 'F4 DRAFT_DIRECTLY_BECOMES_PO = NO');

// =========================================================================================================
section('G. shipping separation');
// =========================================================================================================

var ORDERING_FILES = [CORE + 'supply-recommendation.js', CORE + 'supply-planning-request-draft-v2.js',
  CORE + 'supply-planning-request-draft-v2-persistence.js'];
ORDERING_FILES.forEach(function (f) {
  var c = code(read(f));
  ok(!/shipping_allocation_draft|weekly_shipping|carrier_rate_card|carrier_lead_times|shipment_overview/i.test(c),
    'G1 SHIPPING_TABLE_WRITE_COUNT = 0 — ' + path.basename(f) + ' names no shipping table');
});
eq(KMREC.REASON_TOKENS.filter(function (t) { return /SHIP|CARRIER|SHIPMENT/i.test(t); }), [],
  'G2 no shipping token in the closed reason set');
eq(Object.keys(KMREC.ACTION).filter(function (a) { return /SHIP|CARRIER/i.test(a); }), [],
  'G3 AUTO_CREATE_SHIPMENT = NO — no shipping member in the action enum');
ok(!/recommended_shipping_qty|shippingRequiredQty/.test(code(P_SRC)),
  'G4 SHIPPING_REQUIRED_QTY_IS_PURCHASE_DEMAND = NO — no shipping quantity is read as order demand');

// =========================================================================================================
section('H. mutation — the seal must be able to fail');
// =========================================================================================================

mut('H1 a second flat planner is introduced', function () {
  // The first draft asserted a regex against String(mod.planFlat), which is always false, and then re-read
  // the real file - so it could not fail. The probe now runs over the mutated SOURCE.
  var real = read(CORE + 'supply-planning-request-draft-v2-persistence.js');
  var faked = real.replace('  function applyFlat(sheetSet, plan, expectedToken, opts) {',
    '  function planFlat(i) { return null; }\r\n  function applyFlat(sheetSet, plan, expectedToken, opts) {');
  if (faked === real) throw new Error('H1 anchor drifted');
  return planFlatDefiners(faked) === 2 && planFlatDefiners(real) === 1;
});

mut('H2 REALLOCATE becomes order-write eligible', function () {
  var mod = loadMutated(CORE + 'supply-planning-request-draft-v2-persistence.js',
    '  var ORDER_AUTHORIZING_ACTIONS = { NEW_ORDER: 1, REALLOCATE_AND_NEW_ORDER: 1 };',
    '  var ORDER_AUTHORIZING_ACTIONS = { NEW_ORDER: 1, REALLOCATE_AND_NEW_ORDER: 1, REALLOCATE: 1 };');
  return mod.actionAuthorizesOrderWrite('REALLOCATE').eligible === true
    && KMRDV2P.actionAuthorizesOrderWrite('REALLOCATE').eligible === false;
});

mut('H3 an action leaves the matrix unclassified', function () {
  var mod = loadMutated(CORE + 'supply-recommendation.js',
    "    NO_ACTION: 'NO_ACTION', MANUAL_REVIEW: 'MANUAL_REVIEW' };",
    "    NO_ACTION: 'NO_ACTION', MANUAL_REVIEW: 'MANUAL_REVIEW', HOLD: 'HOLD' };");
  return Object.keys(mod.ACTION).length !== Object.keys(MATRIX).length
    && Object.keys(KMREC.ACTION).length === Object.keys(MATRIX).length;
});

mut('H4 the display total becomes the tier write source', function () {
  var mod = loadMutated(CORE + 'supply-planning-request-draft-v2.js',
    "      row[p + 'recommended_qty'] = rec;",
    "      row[p + 'recommended_qty'] = (input.displayTotal != null && t === 'T1') ? input.displayTotal : rec;");
  var mr = mod.projectFlatDraftRow({ scope: { company: 'A', country: 'B', marketplace: 'C', sku: 'D', draft_purpose: 'regular' },
    planningCycle: '2026-10', tiers: { T1: { month: '2026-10', recommendedQty: 24 } }, unitsPerCarton: 12,
    provenance: {}, generationType: 'ai_plan', draftVersion: 1, actor: 'a', now: 'T', displayTotal: 36 });
  var rr = KMRDV2.projectFlatDraftRow({ scope: { company: 'A', country: 'B', marketplace: 'C', sku: 'D', draft_purpose: 'regular' },
    planningCycle: '2026-10', tiers: { T1: { month: '2026-10', recommendedQty: 24 } }, unitsPerCarton: 12,
    provenance: {}, generationType: 'ai_plan', draftVersion: 1, actor: 'a', now: 'T', displayTotal: 36 });
  return mr.t1_recommended_qty === 36 && rr.t1_recommended_qty === 24;
});

mut('H5 the Send candidate is driven by the system suggestion instead of the operator value', function () {
  var mod = loadMutated(CORE + 'supply-planning-request-draft-v2.js',
    "      var p = t.toLowerCase() + '_', q = nn(row[p + 'order_qty']);",
    "      var p = t.toLowerCase() + '_', q = nn(row[p + 'recommended_qty']);");
  return mod.explodeSendRequestLines(edited)[0].requested_qty === 24
    && KMRDV2.explodeSendRequestLines(edited)[0].requested_qty === 999;
});

mut('H6 operator confirmation stops being required for a decision', function () {
  var mod = loadMutated(CORE + 'supply-planning-request-draft-v2-persistence.js',
    "    if (input.operatorConfirmed !== true) return refuse(DECISION_REFUSAL.OPERATOR_AUTHORIZATION_REQUIRED, '');",
    "    if (input.operatorConfirmed === 'never') return refuse(DECISION_REFUSAL.OPERATOR_AUTHORIZATION_REQUIRED, '');");
  var inp = decisionInput({ operatorConfirmed: false });
  return mod.planOperatorDecision(inp).authorized === true
    && KMRDV2P.planOperatorDecision(inp).refusal === 'OPERATOR_AUTHORIZATION_REQUIRED';
});

mut('H7 a shipping member is added to the recommendation vocabulary', function () {
  var mod = loadMutated(CORE + 'supply-recommendation.js',
    "  var REASON_TOKENS = ['FACTORY_SUPPLY_APPLIED'",
    "  var REASON_TOKENS = ['CREATE_SHIPMENT', 'FACTORY_SUPPLY_APPLIED'");
  return mod.REASON_TOKENS.filter(function (t) { return /SHIP/i.test(t); }).length === 1
    && KMREC.REASON_TOKENS.filter(function (t) { return /SHIP/i.test(t); }).length === 0;
});

// =========================================================================================================
section('RESULT');
console.log('passed ' + pass + '  failed ' + fail + '  mutants killed ' + neg.caught + '/' + (neg.caught + neg.missed));
if (fail > 0) { console.error('\nS5 ORDERING MAINLINE SEAL DRIFT'); process.exit(1); }
console.log('SECOND_CALCULATION_PATH_COUNT = 0 · SECOND_WRITE_PATH_COUNT = 0 · SECOND_QUANTITY_AUTHORITY_COUNT = 0');
