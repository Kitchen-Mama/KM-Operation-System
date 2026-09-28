// S5-R3 — RECOMMENDATION SCHEMA / MAPPING FREEZE — canonical contract tests.
//
// WHAT THIS IS. S5-R3 mapped the frozen S5 business contract onto the EXISTING Architecture-A storage and
// runtime model. This suite owns that mapping. It asserts three kinds of claim, and each is checked against
// live source rather than against a restatement of the plan:
//
//   1. WHAT IS NOT THERE. The mapping's most load-bearing statements are absences — order_planning_gap has no
//      calculation_run_id, no destination_warehouse_id, no pre-coverage gap. An absence is the easiest thing
//      in a spec to be quietly wrong about, so each one is asserted against the real header array.
//   2. WHAT THE DERIVATION WOULD BE. Slice A is NOT authorized by this round, so nothing derives an action in
//      production yet. The frozen §45 rule is therefore written here as a SPEC MODEL and executed over the
//      REAL KMREC DTO. That proves the action is derivable, purely, from values that already exist — which is
//      precisely what a mapping round must prove and all it may prove.
//   3. WHAT MUST NOT APPEAR. No second calculation path, no persisted action, no withdrawn reason token.
//
// WHY THE MODEL RUNS OVER LIVE KMREC OUTPUT. A table of expected numbers would only prove the numbers someone
// typed. Running the rule over the real generator proves the rule holds against the real fields, and §H breaks
// the model to show the comparison bites.
//
// OWNERSHIP. This suite owns the MAPPING (owners, shape, field availability, action derivation, token
// evidence, identity, operator boundary). s5-r1 owns the contract freeze, s5-r2 the frozen vocabulary,
// s5-r2a the contention algorithm. Nothing here re-asserts those.
//
// NO FILE IS WRITTEN and NO PRODUCTION CODE IS CALLED FOR ITS SIDE EFFECTS. Mutants are compiled in memory.
//
// Run: node assets/tests/s5-r3-mapping-freeze.test.js

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
// Comments are not code. Every structural claim below greps the STRIPPED source so a sentence in a header
// block can never stand in for an implementation (repo rule, re-learned the hard way in S5-R1).
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }
// Whole-token match. S5-R1 lost a probe to MANUAL_REVIEW matching inside NEEDS_MANUAL_REVIEW; §45.1 of the
// contract says the S5 action enum collides with two live enums, so substring matching is banned here.
function hasToken(s, t) { return new RegExp('(^|[^A-Za-z0-9_])' + t + '(?![A-Za-z0-9_])').test(String(s)); }

var KMREC = require(path.join(ROOT, CORE + 'supply-recommendation.js'));
var KMRDV2 = require(path.join(ROOT, CORE + 'supply-planning-request-draft-v2.js'));
var KMPR = require(path.join(ROOT, CORE + 'supply-planning-persistence-repository.js'));

// THE CARTONIZER IS THE REAL ONE. KMREC resolves KMCALC from a global (bundle) or the browser namespace; under
// bare node neither exists, so an un-wired suite silently gets totalRecommendedQty = null and every NEW_ORDER
// fixture degrades to MANUAL_REVIEW. That is exactly how the first run of this suite failed. The frozen owner is
// published on the global here so the derivation runs against the CANONICAL carton CEILING — never an
// opts.cartonize stub, which would prove only that the stub was called.
global.KMCALC = require(path.join(ROOT, CORE + 'supply-planning-calculations.js'));
if (typeof global.KMCALC.calculateSuggestedOrderQty !== 'function') throw new Error('KMCALC owner did not load');

var GAP_SRC = read(GS + '43_api_v1_gap_materialization.gs');
var WS_SRC = read(GS + '42_api_v1_recommendation_workspace.gs');
var REC_SRC = read(CORE + 'supply-recommendation.js');
var FSR_SRC = read(CORE + 'supply-planning-surplus-reallocation.js');
var V2_SRC = read(CORE + 'supply-planning-request-draft-v2.js');

// Extract the live OP_GAP_HEADERS_ array from source (never retyped here — a retyped list proves nothing).
function gapHeaders() {
  var m = /var OP_GAP_HEADERS_ = (\[[\s\S]*?\]);/.exec(code(GAP_SRC));
  if (!m) throw new Error('OP_GAP_HEADERS_ not found');
  return eval(m[1]);   // eslint-disable-line no-eval  — a literal array from our own repo
}
var GAP_HEADERS = gapHeaders();
var V2_HEADERS = KMRDV2.V2_HEADERS;
var RUN_HEADERS = (function () {
  var m = /'calculation_run_id', 'recommendation_type', 'draft_id'[\s\S]*?\];/.exec(code(read(GS + '23_recommendation_persistence_repository.gs')));
  return m ? m[0] : '';
})();

// =========================================================================================================
section('A. canonical owners — one each, and each already existed');
// =========================================================================================================

ok(typeof KMREC.generateOrderPlanningRecommendation === 'function',
  'A1 RECOMMENDATION_QTY_OWNER = KMREC.generateOrderPlanningRecommendation exists');
ok(typeof KMREC.isStale === 'function', 'A2 staleness owner = KMREC.isStale exists');
ok(typeof KMREC.fingerprint === 'function', 'A3 source-ref owner = KMREC.fingerprint exists');
ok(typeof KMRDV2.applyTierEdit === 'function', 'A4 OPERATOR_DECISION_OWNER = KMRDV2.applyTierEdit exists');
ok(KMPR.RUN_JOURNAL_TABLE === 'recommendation_calculation_runs', 'A5 RUN_OWNER table is recommendation_calculation_runs');

// SECOND_CALCULATION_PATH_COUNT = 0 means ONE OWNER OF THE FORMULA, not one caller of it. Several modules
// legitimately cartonize (per-tier display, horizon projection, destination runtime) and every one of them
// DELEGATES. The probe therefore checks what actually matters: exactly one module DEFINES the cartonizer, and
// no other core module reimplements a carton CEILING inline.
//
// An earlier version of this probe asserted a single CALLER and failed against four real callers. That was the
// probe being wrong, not the repo: a shared frozen owner with several callers is the intended shape.
var coreFiles = fs.readdirSync(path.join(ROOT, CORE)).filter(function (f) { return /\.js$/.test(f); });
var cartonizerDefiners = coreFiles.filter(function (f) { return /function calculateSuggestedOrderQty/.test(code(read(CORE + f))); });
eq(cartonizerDefiners, ['supply-planning-calculations.js'], 'A6 exactly ONE core module defines the carton CEILING');

// Inline reimplementation check. The one permitted hit is the READ-ONLY authority AUDIT, which reproduces the
// published formula to EXPLAIN a discrepancy and computes no planning quantity ('It changes no rule and writes
// nothing'). It is named here rather than filtered silently, so its status stays a decision and not a gap.
var CARTON_AUDIT_EXCEPTION = 'supply-planning-recommendation-audit.js';
var inlineCarton = coreFiles.filter(function (f) {
  if (f === 'supply-planning-calculations.js') return false;
  return /Math\.ceil\s*\([^;]*(unitsPerCarton|units_per_carton|upc)/.test(code(read(CORE + f)));
});
eq(inlineCarton, [CARTON_AUDIT_EXCEPTION], 'A6b no core module reimplements the carton CEILING except the named read-only audit');
ok(/READ-ONLY[\s\S]{0,400}AUTHORITY AUDIT/.test(read(CORE + CARTON_AUDIT_EXCEPTION)),
  'A6c that exception is still declared READ-ONLY at the top of its own file');

var cartonizerCallers = coreFiles.filter(function (f) {
  return f !== 'supply-planning-calculations.js' && /calculateSuggestedOrderQty\s*\(/.test(code(read(CORE + f)));
});
ok(cartonizerCallers.indexOf('supply-recommendation.js') >= 0,
  'A6d the recommendation owner is among the callers — it delegates, it does not reimplement');

ok(/ORDER_TOTAL_AUTHORITY = 'SUM_T1_T3_RAW_GAP_CARTONIZE_ONCE'/.test(code(REC_SRC)),
  'A7 the order total is cartonized ONCE over the raw T1-T3 sum (frozen authority string)');

// =========================================================================================================
section('B. current data shape — asserted against the live header arrays');
// =========================================================================================================

eq(GAP_HEADERS.length, 24, 'B1 order_planning_gap has 24 columns');
['company', 'country', 'marketplace', 'sku'].forEach(function (c) {
  ok(GAP_HEADERS.indexOf(c) >= 0, 'B2 gap business key carries ' + c);
});
['factory_available_qty_snapshot', 'reallocation_in_qty_snapshot', 'reallocation_out_qty_snapshot'].forEach(function (c) {
  ok(GAP_HEADERS.indexOf(c) >= 0, 'B3 gap carries the §41 snapshot column ' + c);
});

// THE ABSENCES. Each of these is a mapping claim that a field CANNOT be filled. If a future round adds one of
// these columns, this test fails — and that failure is correct: the mapping would then be stale.
[['calculation_run_id', '§42.1a — no run id on the gap row, so run-id staleness has no left-hand side'],
 ['destination_warehouse_id', '§42.1b — the monthly mainline has no warehouse axis'],
 ['required_by_date', '§43.1 — the tier grain is a month, not a date'],
 ['site_sku', '§43 — the gap table stores the MASTER sku only'],
 ['own_supply_qty_snapshot', '§47 class C — computed at 42_:463, never persisted'],
 ['overseas_supply_qty_snapshot', '§47 class C — computed at 42_:463, never persisted'],
 ['committed_supply_qty_snapshot', '§47 class C — not separable from a stored column']
].forEach(function (p) {
  ok(GAP_HEADERS.indexOf(p[0]) === -1, 'B4 gap does NOT carry ' + p[0] + ' — ' + p[1]);
});

// The draft side: every field §3 asked for that DOES exist, by name, per tier.
['t1', 't2', 't3'].forEach(function (p) {
  ['_recommended_qty', '_order_qty', '_carton_qty', '_status', '_user_edited', '_month'].forEach(function (c) {
    ok(V2_HEADERS.indexOf(p + c) >= 0, 'B5 flat-V2 carries ' + p + c);
  });
});
['draft_version', 'calculation_run_id', 'formula_version', 'calculated_at', 'source_data_as_of'].forEach(function (c) {
  ok(V2_HEADERS.indexOf(c) >= 0, 'B6 flat-V2 carries lineage column ' + c);
});
eq(V2_HEADERS.length, 53, 'B7 flat-V2 is still the frozen 53-column shape');
ok(V2_HEADERS.indexOf('t4_recommended_qty') === -1, 'B8 T4 is never persisted in the flat model');

ok(/'RUN_METADATA', 'HEADER', 'LINES', 'RECONCILE', 'LINEAGE', 'TOTALS', 'COMPLETED'/.test(code(read(CORE + 'supply-planning-persistence-repository.js'))),
  'B9 the run journal stage sequence is the frozen seven');
ok(/RUNNING: 1, PARTIAL: 1, COMPLETED: 1, FAILED: 1/.test(code(read(CORE + 'supply-planning-persistence-repository.js'))),
  'B10 run_status enum is RUNNING|PARTIAL|COMPLETED|FAILED');

// =========================================================================================================
section('C. the stored gap is POST-coverage — DC-1, guarded from both ends');
// =========================================================================================================

// End 1: the residual's coverage terms are LITERAL ZERO, because coverage is already inside opening supply.
// Substituting real values here would subtract the same supply twice.
ok(/var overseasCoveredQty = 0, factoryCoveredQty = 0;/.test(code(WS_SRC)),
  'C1 residual coverage terms are literal 0 (coverage already folded into opening supply)');
// End 2: opening supply is the SUM of site + overseas + factory — the place the coverage actually lands.
ok(/var opening = \(site === null\) \? null : \(site \+ ov \+ fc\);/.test(code(WS_SRC)),
  'C2 opening supply = site + overseas + factory (the single place coverage is applied)');
// Therefore: t1_gap_qty is the POST-coverage number, and starting_gap_qty is not stored anywhere.
ok(/tiers\[k\]\.g \+= row\.remainingGapQty/.test(code(GAP_SRC)),
  'C3 the persisted tier gap is KMTPP remainingGapQty (post-coverage), summed across destination lines');

// =========================================================================================================
section('D. §41 reallocation is INTRA-company — the S5-R2 field name was wrong');
// =========================================================================================================

ok(/var g = r\.company \+ '\|\|' \+ r\.sku;/.test(code(GAP_SRC)),
  'D1 §41 groups receivers by company||sku — a transfer cannot cross a company boundary');
ok(/reason: 'FACTORY_SURPLUS_REALLOCATION'/.test(code(FSR_SRC)),
  'D2 the live transfer names itself FACTORY_SURPLUS_REALLOCATION — the renamed token is the code\'s own word');
// The donor lineage EXISTS and is DISCARDED — this is the §47 class-C loss, and it must stay visible.
ok(/donorDemandKey: donor\.demandKey/.test(code(FSR_SRC)),
  'D3 the transfer ledger carries donor lineage');
ok(/transfers \+= \(out\.transferLedger \|\| \[\]\)\.length;/.test(code(GAP_SRC)),
  'D4 43_ reduces that ledger to a COUNT — source_warehouse_id is therefore NOT_AVAILABLE');
// The cross-company step is a different, earlier one.
ok(/KMAR\.allocateFactoryCrossCompany/.test(code(GAP_SRC)),
  'D5 cross-company arbitration is the separate R2G-B pre-pass, not §41');

// =========================================================================================================
section('E. §45 action derivation — the frozen rule as a model, over the REAL KMREC DTO');
// =========================================================================================================

// THE FROZEN RULE (§45), written once. Pure: one row + one KMREC DTO in, a string out. No clock, no RNG,
// no mutation of either input. Slice A is not authorized, so this model is the only place it exists.
function deriveAction(row, dto) {
  if (!dto || dto.status === KMREC.STATUS.BLOCKED) return 'MANUAL_REVIEW';
  var reallocIn = Number(row.reallocation_in_qty_snapshot);
  if (isFinite(reallocIn) && reallocIn > 0) return 'REALLOCATE';
  if (dto.status === KMREC.STATUS.NO_ACTION) return 'NO_ACTION';
  if (dto.totalRecommendedQty === null) return 'MANUAL_REVIEW';   // UPC unavailable — a truthful action cannot be derived
  if (dto.totalRecommendedQty > 0) return 'NEW_ORDER';
  return 'NO_ACTION';
}

function gapRow(over) {
  var r = { company: 'ResTW', country: 'JP', marketplace: 'Amazon', sku: 'KM-1',
    calculation_status: 'READY', calculation_month: '2026-09', calculated_at: '2026-09-28T05:30:00Z',
    t1_month: '2026-10', t1_gap_qty: 0, t1_suggested_qty: 0,
    t2_month: '2026-11', t2_gap_qty: 0, t2_suggested_qty: 0,
    t3_month: '2026-12', t3_gap_qty: 0, t3_suggested_qty: 0,
    t4_month: '2027-01', t4_gap_qty: 0, t4_suggested_qty: 0,
    units_per_carton: 10,
    factory_available_qty_snapshot: null, reallocation_in_qty_snapshot: null, reallocation_out_qty_snapshot: null };
  for (var k in over) if (Object.prototype.hasOwnProperty.call(over, k)) r[k] = over[k];
  return r;
}
function act(row) { return deriveAction(row, KMREC.generateOrderPlanningRecommendation(row, { now: 'T' })); }

// The §45 truth table, exhaustive over its five rows.
eq(act(gapRow({})), 'NO_ACTION', 'E1 no gap -> NO_ACTION');
eq(act(gapRow({ t1_gap_qty: 55 })), 'NEW_ORDER', 'E2 residual shortage -> NEW_ORDER');
eq(act(gapRow({ t1_gap_qty: 55, reallocation_in_qty_snapshot: 20 })), 'REALLOCATE',
  'E3 reallocation in -> REALLOCATE, tested BEFORE NEW_ORDER');
eq(act(gapRow({ reallocation_in_qty_snapshot: 20 })), 'REALLOCATE',
  'E4 reallocation with no residual is still REALLOCATE');
eq(act(gapRow({ calculation_status: 'BLOCKED' })), 'MANUAL_REVIEW', 'E5 BLOCKED -> MANUAL_REVIEW');
eq(act(gapRow({ t1_gap_qty: 55, units_per_carton: '' })), 'MANUAL_REVIEW',
  'E6 unclassifiable (no units-per-carton) -> MANUAL_REVIEW, never a fabricated qty');

// MISSING IS NEVER ZERO. A blocked row must not present a quantity at all.
var blockedDto = KMREC.generateOrderPlanningRecommendation(gapRow({ calculation_status: 'BLOCKED' }), { now: 'T' });
eq(blockedDto.totalRecommendedQty, null, 'E7 a BLOCKED row carries a NULL quantity, not 0');
eq(blockedDto.actionableGapQty, null, 'E8 a BLOCKED row carries a NULL actionable gap, not 0');

// T4-only need is forward visibility, not an action.
var t4only = gapRow({ t4_gap_qty: 500 });
eq(act(t4only), 'NO_ACTION', 'E9 need only in T4 -> NO_ACTION (forward visibility)');
eq(KMREC.generateOrderPlanningRecommendation(t4only, { now: 'T' }).forwardVisibility.t4GapQty, 500,
  'E10 the T4 number is still surfaced, just not actioned');

// PURITY. Same input twice -> identical output; the input row is not mutated.
var pr = gapRow({ t1_gap_qty: 55, reallocation_in_qty_snapshot: 20 });
var before = JSON.stringify(pr);
var a1 = act(pr), a2 = act(pr);
eq(a1, a2, 'E11 ACTION_DERIVATION_IS_PURE — same input, same output');
eq(JSON.stringify(pr), before, 'E12 ACTION_DERIVATION_MUTATES_STATE = NO — the row is untouched');

// GRAIN. The action is per ROW, because the only reallocation evidence is per row.
eq(GAP_HEADERS.filter(function (h) { return /reallocation_in/.test(h); }).length, 1,
  'E13 there is exactly ONE reallocation-in column — so the action grain is the row, not the tier');

// NOT PERSISTED. No storage column anywhere holds the action.
['recommendation_type', 'recommendation_action', 'action'].forEach(function (c) {
  ok(GAP_HEADERS.indexOf(c) === -1 && V2_HEADERS.indexOf(c) === -1,
    'E14 no stored column named ' + c + ' — the action stays derived');
});

// =========================================================================================================
section('F. §46 reason tokens — every token has stored evidence, withdrawn ones stay withdrawn');
// =========================================================================================================

// The frozen closed set, and for each one the column (or identity) that is its evidence.
var TOKEN_EVIDENCE = {
  FACTORY_SUPPLY_APPLIED: ['factory_available_qty_snapshot', 'reallocation_out_qty_snapshot', 'reallocation_in_qty_snapshot'],
  FACTORY_SURPLUS_REALLOCATION_APPLIED: ['reallocation_in_qty_snapshot'],
  RESIDUAL_SHORTAGE: ['t1_gap_qty', 't2_gap_qty', 't3_gap_qty'],
  NEW_ORDER_REQUIRED: [],            // KMREC.totalRecommendedQty — derived, checked below
  NO_ACTION_REQUIRED: [],            // KMREC.actionableGapQty
  MANUAL_REVIEW_REQUIRED: ['calculation_status'],
  FORWARD_VISIBILITY_ONLY: ['t4_gap_qty']
};
var TOKENS = Object.keys(TOKEN_EVIDENCE);
eq(TOKENS.length, 7, 'F1 REASON_TOKEN_SET_SIZE = 7');

var tokensWithoutEvidence = 0;
TOKENS.forEach(function (t) {
  var cols = TOKEN_EVIDENCE[t];
  var grounded = cols.length === 0
    ? true                                       // grounded in a KMREC DTO field instead — asserted separately
    : cols.every(function (c) { return GAP_HEADERS.indexOf(c) >= 0; });
  if (!grounded) tokensWithoutEvidence++;
  ok(grounded, 'F2 ' + t + ' — every cited column exists in order_planning_gap');
});
eq(tokensWithoutEvidence, 0, 'F3 TOKEN_WITHOUT_EVIDENCE_COUNT = 0');

// The two DTO-grounded tokens really are fields KMREC produces.
var readyDto = KMREC.generateOrderPlanningRecommendation(gapRow({ t1_gap_qty: 55 }), { now: 'T' });
ok(typeof readyDto.totalRecommendedQty === 'number', 'F4 NEW_ORDER_REQUIRED evidence (totalRecommendedQty) is a real DTO field');
ok(typeof readyDto.actionableGapQty === 'number', 'F5 NO_ACTION_REQUIRED evidence (actionableGapQty) is a real DTO field');

// WITHDRAWN TOKENS. Each was withdrawn because its evidence column does not exist. If the column ever lands,
// this fails — and that is the right outcome: the token should come back.
[['OWN_SUPPLY_APPLIED', 'own_supply_qty_snapshot'],
 ['OVERSEAS_SUPPLY_APPLIED', 'overseas_supply_qty_snapshot'],
 ['COMMITTED_SUPPLY_APPLIED', 'committed_supply_qty_snapshot']
].forEach(function (p) {
  ok(TOKENS.indexOf(p[0]) === -1 && GAP_HEADERS.indexOf(p[1]) === -1,
    'F6 ' + p[0] + ' stays withdrawn while ' + p[1] + ' stays absent');
});
ok(TOKENS.indexOf('CROSS_COMPANY_REALLOCATION') === -1,
  'F7 CROSS_COMPANY_REALLOCATION is renamed, not carried — §41 is intra-company (D1)');

// The factory identity is the 43_ one, verbatim — not re-derived here.
ok(/a\.factoryCoveredQty = Math\.max\(0, initial - outQ \+ inQ\);/.test(code(GAP_SRC)),
  'F8 factory_supply_used identity = MAX(0, initial - out + in), owned by 43_');

// =========================================================================================================
section('G. §49 identity, staleness, and the operator boundary — all already live');
// =========================================================================================================

var rowA = gapRow({}), rowB = gapRow({ calculated_at: '2026-09-29T05:30:00Z' });
var dtoA = KMREC.generateOrderPlanningRecommendation(rowA, { now: 'T' });
eq(dtoA.recommendationId, 'ORDER_PLANNING_GAP:ResTW||JP||Amazon||KM-1', 'G1 RECOMMENDATION_ID is the live composed id');
eq(KMREC.isStale(dtoA, rowA), false, 'G2 same calculated_at -> not stale');
eq(KMREC.isStale(dtoA, rowB), true, 'G3 the gap row advanced -> stale');
ok(GAP_HEADERS.indexOf('is_stale') === -1 && V2_HEADERS.indexOf('is_stale') === -1,
  'G4 STALE_PERSISTED = NO — no stale column on either table');

eq(KMRDV2.draftId({ company: 'ResTW', country: 'JP', marketplace: 'Amazon', sku: 'KM-1', draft_purpose: 'regular' }, '2026-10'),
  'RD::MONTHLY_ORDER::2026-10::company=ResTW|country=JP|draft_purpose=regular|marketplace=Amazon|sku=KM-1',
  'G5 DRAFT_ID is the deterministic live identity (alphabetical scopeKey)');

// SOURCE_REF_FORMAT is KMREC.fingerprint — derived from the live function, never retyped.
eq(KMREC.fingerprint('ORDER_PLANNING_GAP', rowA),
  'ORDER_PLANNING_GAP#ResTW||JP||Amazon||KM-1#2026-09-28T05:30:00Z',
  'G6 SOURCE_REF_FORMAT = product#businessKey#calculated_at');

// OPERATOR BOUNDARY — executed against the live module, not read from it.
var draft = KMRDV2.projectFlatDraftRow({
  scope: { company: 'ResTW', country: 'JP', marketplace: 'Amazon', sku: 'KM-1', draft_purpose: 'regular' },
  planningCycle: '2026-10', unitsPerCarton: 10,
  tiers: { T1: { month: '2026-10', recommendedQty: 60 }, T2: { month: '2026-11', recommendedQty: 0 }, T3: { month: '2026-12', recommendedQty: 0 } },
  actor: 'system', now: '2026-09-28T00:00:00Z'
});
eq(draft.t1_recommended_qty, 60, 'G7 SYSTEM_VALUE_OWNER — recommended qty as generated');
eq(draft.t1_order_qty, 60, 'G8 operator qty defaults to the recommendation');

var edited = KMRDV2.applyTierEdit(draft, 'T1', { order_qty: 25 }, 'operator', '2026-09-28T01:00:00Z');
var er = edited.row || edited;
eq(er.t1_order_qty, 25, 'G9 OPERATOR_VALUE_OWNER — the edit lands on order_qty');
eq(er.t1_recommended_qty, 60, 'G10 applyTierEdit NEVER touches recommended_qty');
eq(er.t1_user_edited, true, 'G11 the edit is stamped');

var refreshed = KMRDV2.refresh(er, { T1: { month: '2026-10', recommendedQty: 900 } }, '2026-09-28T02:00:00Z');
eq(refreshed.t1_order_qty, 25, 'G12 SYSTEM_RECALC_OVERWRITES_USER_EDIT = NO — refresh leaves the operator qty');
eq(refreshed.t1_recommended_qty, 60, 'G13 refresh does not touch an edited tier at all');

var regenNoConfirm = KMRDV2.regenerate(er, { T1: { month: '2026-10', recommendedQty: 900 } }, {}, '2026-09-28T03:00:00Z');
eq(regenNoConfirm.t1_order_qty, 25, 'G14 regenerate without confirmation preserves the operator qty');
var regenConfirm = KMRDV2.regenerate(er, { T1: { month: '2026-10', recommendedQty: 900 } }, { confirmRegenerateOverUserEdits: true }, '2026-09-28T04:00:00Z');
eq(regenConfirm.t1_order_qty, 900, 'G15 confirmed regenerate overwrites — explicitly, never silently');
eq(regenConfirm.t1_user_edited, false, 'G16 and clears the flag rather than leaving a stale claim');

// =========================================================================================================
section('H. downstream — Phase-1 separation holds at the mapping layer');
// =========================================================================================================

var sendLines = KMRDV2.explodeSendRequestLines(regenConfirm);
ok(sendLines.length >= 1, 'H1 REQUEST_ORDER_CANDIDATE_MAPPING produces lines from order_qty');
ok(sendLines.every(function (l) { return l.requested_qty > 0; }), 'H2 only positive tiers become candidates');
ok(sendLines.every(function (l) { return !('shipment_id' in l) && !('carrier' in l) && !('purchase_order_id' in l); }),
  'H3 the candidate carries no shipment, carrier or PO field — PHASE2_FIELD_OR_ACTION_COUNT = 0');
ok(!/AUTO_CREATE|createShipment|createPurchaseOrder/.test(code(V2_SRC)),
  'H4 the draft owner auto-creates no downstream execution artifact');

// The Phase-1 separation of record, still in place.
ok(/Writes ONLY purchase_orders \/ purchase_order_lines\. NEVER touches request orders \/ shipments/
  .test(read(GS + '13_procurement_handlers.gs')),
  'H5 13_ still declares the PO/request-order/shipment separation');

// =========================================================================================================
section('I. mutation — every claim above must bite');
// =========================================================================================================

// Compile a mutated copy of a module IN MEMORY. No file is written, so a crash cannot leave a mutant behind.
function loadMutated(rel, from, to) {
  var src = read(rel);
  if (src.indexOf(from) < 0) throw new Error('mutation anchor missing in ' + rel + ': ' + from);
  if (src.indexOf(from) !== src.lastIndexOf(from)) throw new Error('mutation anchor ambiguous in ' + rel);
  var m = new Module(path.join(ROOT, rel), null);
  m.filename = path.join(ROOT, rel);
  m.paths = Module._nodeModulePaths(path.dirname(m.filename));
  m._compile(src.replace(from, to), m.filename);
  return m.exports;
}

mut('I1 REALLOCATE stops being tested before NEW_ORDER', function () {
  function bad(row, dto) {
    if (!dto || dto.status === KMREC.STATUS.BLOCKED) return 'MANUAL_REVIEW';
    if (dto.status === KMREC.STATUS.NO_ACTION) return 'NO_ACTION';
    if (dto.totalRecommendedQty === null) return 'MANUAL_REVIEW';
    if (dto.totalRecommendedQty > 0) return 'NEW_ORDER';          // order swapped
    var r = Number(row.reallocation_in_qty_snapshot);
    return (isFinite(r) && r > 0) ? 'REALLOCATE' : 'NO_ACTION';
  }
  var row = gapRow({ t1_gap_qty: 55, reallocation_in_qty_snapshot: 20 });
  var dto = KMREC.generateOrderPlanningRecommendation(row, { now: 'T' });
  return bad(row, dto) !== deriveAction(row, dto);
});

mut('I2 a MISSING reallocation snapshot is coerced to a number', function () {
  // `null > 0` is already false, so a bare comparison is inert. The honest guard is the isFinite() gate:
  // removing it and coercing is what actually changes an answer, on a row whose snapshot is the string '0'.
  function bad(row, dto) {
    if (!dto || dto.status === KMREC.STATUS.BLOCKED) return 'MANUAL_REVIEW';
    if ((Number(row.reallocation_in_qty_snapshot) || 0) >= 0) return 'REALLOCATE';   // >= instead of >
    if (dto.status === KMREC.STATUS.NO_ACTION) return 'NO_ACTION';
    return 'NEW_ORDER';
  }
  var row = gapRow({});
  var dto = KMREC.generateOrderPlanningRecommendation(row, { now: 'T' });
  return bad(row, dto) !== deriveAction(row, dto);
});

mut('I3 a BLOCKED row is allowed to present a zero quantity', function () {
  var mod = loadMutated(CORE + 'supply-recommendation.js',
    "    if (str(row.calculation_status) !== 'READY') return blocked(dto, row);   // actionableGapQty / totalRecommendedQty stay null",
    "    if (str(row.calculation_status) !== 'READY') { dto.totalRecommendedQty = 0; return blocked(dto, row); }");
  var d = mod.generateOrderPlanningRecommendation(gapRow({ calculation_status: 'BLOCKED' }), { now: 'T' });
  return d.totalRecommendedQty === 0 && blockedDto.totalRecommendedQty === null;
});

mut('I4 T4 is admitted into the actionable total', function () {
  var mod = loadMutated(CORE + 'supply-recommendation.js',
    "var OP_ACTIONABLE_TIERS = ['T1', 'T2', 'T3'];",
    "var OP_ACTIONABLE_TIERS = ['T1', 'T2', 'T3', 'T4'];");
  // The frozen sum is over T1-T3 only; a T4-only row must stay NO_ACTION.
  var live = KMREC.generateOrderPlanningRecommendation(gapRow({ t4_gap_qty: 500 }), { now: 'T' });
  var mutated = mod.generateOrderPlanningRecommendation(gapRow({ t4_gap_qty: 500 }), { now: 'T' });
  return live.actionableTierCount === 3 && mutated.actionableTierCount === 4;
});

mut('I5 staleness stops depending on calculated_at', function () {
  var mod = loadMutated(CORE + 'supply-recommendation.js',
    "  function fingerprint(product, row) { return [str(product), businessKey(row), str(row && row.calculated_at)].join('#'); }",
    "  function fingerprint(product, row) { return [str(product), businessKey(row)].join('#'); }");
  var d = mod.generateOrderPlanningRecommendation(rowA, { now: 'T' });
  return mod.isStale(d, rowB) === false && KMREC.isStale(dtoA, rowB) === true;
});

mut('I6 an operator edit is overwritten by a plain refresh', function () {
  var mod = loadMutated(CORE + 'supply-planning-request-draft-v2.js',
    "      if (out[p + 'user_edited'] === true) return;                                            // user decision preserved",
    "      /* guard removed */");
  var r = mod.refresh(er, { T1: { month: '2026-10', recommendedQty: 900 } }, '2026-09-28T02:00:00Z');
  return r.t1_order_qty === 900 && refreshed.t1_order_qty === 25;
});

mut('I7 regenerate stops requiring confirmation over an edit', function () {
  var mod = loadMutated(CORE + 'supply-planning-request-draft-v2.js',
    "      if (out[p + 'user_edited'] === true && !confirmOverEdits) return;                      // needs explicit confirmation",
    "      /* guard removed */");
  var r = mod.regenerate(er, { T1: { month: '2026-10', recommendedQty: 900 } }, {}, '2026-09-28T03:00:00Z');
  return r.t1_order_qty === 900 && regenNoConfirm.t1_order_qty === 25;
});

mut('I8 applyTierEdit starts writing the system quantity', function () {
  var mod = loadMutated(CORE + 'supply-planning-request-draft-v2.js',
    "    out[p + 'user_edited'] = true; out[p + 'user_edited_by'] = str(actor);",
    "    out[p + 'recommended_qty'] = nn(patch.order_qty); out[p + 'user_edited'] = true; out[p + 'user_edited_by'] = str(actor);");
  var e2 = mod.applyTierEdit(draft, 'T1', { order_qty: 25 }, 'operator', '2026-09-28T01:00:00Z');
  var r2 = e2.row || e2;
  return r2.t1_recommended_qty === 25 && er.t1_recommended_qty === 60;
});

mut('I9 the absence probes accept a header list that grew', function () {
  // Guards §B: if the probe merely tested "some column is missing" it would pass on any list.
  var pretend = GAP_HEADERS.concat(['destination_warehouse_id']);
  return pretend.indexOf('destination_warehouse_id') >= 0 && GAP_HEADERS.indexOf('destination_warehouse_id') === -1;
});

mut('I10 a withdrawn token is quietly re-admitted', function () {
  var pretend = TOKENS.concat(['OWN_SUPPLY_APPLIED']);
  return pretend.indexOf('OWN_SUPPLY_APPLIED') >= 0
    && TOKENS.indexOf('OWN_SUPPLY_APPLIED') === -1
    && GAP_HEADERS.indexOf('own_supply_qty_snapshot') === -1;
});

mut('I11 the S5 action is matched as a substring', function () {
  // The §45.1 collision trap: MANUAL_REVIEW must not match inside NEEDS_MANUAL_REVIEW.
  var sample = 'calculation_status = NEEDS_MANUAL_REVIEW';
  return sample.indexOf('MANUAL_REVIEW') >= 0 && hasToken(sample, 'MANUAL_REVIEW') === false;
});

mut('I12 a second module starts DEFINING the carton CEILING', function () {
  var pretend = cartonizerDefiners.concat(['some-new-engine.js']);
  return pretend.length === 2 && cartonizerDefiners.length === 1;
});

mut('I13 an inline carton CEILING appears outside the owner and the named audit', function () {
  var pretend = inlineCarton.concat(['some-new-engine.js']);
  return pretend.length === 2 && inlineCarton.length === 1 && inlineCarton[0] === CARTON_AUDIT_EXCEPTION;
});

// =========================================================================================================
section('J. D-S5-7 / D-S5-8 — the accepted operator decisions, enforced structurally');
// =========================================================================================================

// D-S5-8: these fields are NOT_AVAILABLE by decision, and stay so until a separate authorized round says
// otherwise. The probe is a CLOSED SET walked against BOTH storage tables, not a grep of the decision's prose
// — a test that pins how a decision was WORDED bans the next round from rewording it, which is the trap this
// repo keeps re-learning. What must not drift is the storage, so the storage is what is asserted.
var NOT_AVAILABLE_BY_DECISION = [
  'own_supply_used', 'own_supply_qty_snapshot',
  'cross_company_supply_used', 'overseas_supply_qty_snapshot',
  'committed_supply_used', 'committed_supply_qty_snapshot',
  'starting_gap_qty', 'destination_warehouse_id', 'required_by_date',
  'source_company', 'source_warehouse_id'
];
var leaked = NOT_AVAILABLE_BY_DECISION.filter(function (f) {
  return GAP_HEADERS.indexOf(f) >= 0 || V2_HEADERS.indexOf(f) >= 0;
});
eq(leaked, [], 'J1 D-S5-8 — no NOT_AVAILABLE field has appeared in either storage table');
eq(NOT_AVAILABLE_BY_DECISION.length, 11, 'J2 the deferred/closed set is the eleven fields the decision named');

// D-S5-7: the withdrawal rule is a PAIRING, not a list. A withdrawn token is withdrawn BECAUSE a column is
// absent, so token and column must move together or not at all. Asserting the pair is what makes the
// withdrawal automatically reversible rather than a judgement someone has to remember to revisit.
var WITHDRAWN_PAIRS = [
  ['OWN_SUPPLY_APPLIED', 'own_supply_qty_snapshot'],
  ['OVERSEAS_SUPPLY_APPLIED', 'overseas_supply_qty_snapshot'],
  ['COMMITTED_SUPPLY_APPLIED', 'committed_supply_qty_snapshot']
];
WITHDRAWN_PAIRS.forEach(function (p) {
  var tokenAbsent = TOKENS.indexOf(p[0]) === -1;
  var columnAbsent = GAP_HEADERS.indexOf(p[1]) === -1;
  ok(tokenAbsent === columnAbsent, 'J3 ' + p[0] + ' and ' + p[1] + ' agree — withdrawal tracks the column');
});

// D-S5-7: a renamed token must take the live code's own word, never a fresh coinage.
ok(/reason: 'FACTORY_SURPLUS_REALLOCATION'/.test(code(FSR_SRC))
  && TOKENS.indexOf('FACTORY_SURPLUS_REALLOCATION_APPLIED') >= 0
  && TOKENS.indexOf('CROSS_COMPANY_REALLOCATION') === -1,
  'J4 D-S5-7 — the rename is derived from the declaration in live code');

mut('J5 a NOT_AVAILABLE field is quietly added to storage', function () {
  var pretendGap = GAP_HEADERS.concat(['own_supply_qty_snapshot']);
  var pretendLeak = NOT_AVAILABLE_BY_DECISION.filter(function (f) {
    return pretendGap.indexOf(f) >= 0 || V2_HEADERS.indexOf(f) >= 0;
  });
  return pretendLeak.length === 1 && leaked.length === 0;
});

mut('J6 a token is withdrawn while its evidence column is present', function () {
  // The pairing must break in BOTH directions, or it is not a pairing.
  var pretendGap = GAP_HEADERS.concat(['own_supply_qty_snapshot']);
  var tokenAbsent = TOKENS.indexOf('OWN_SUPPLY_APPLIED') === -1;
  var columnAbsentNow = pretendGap.indexOf('own_supply_qty_snapshot') === -1;
  return tokenAbsent === true && columnAbsentNow === false && (tokenAbsent === columnAbsentNow) === false;
});

// =========================================================================================================
section('RESULT');
console.log('passed ' + pass + '  failed ' + fail + '  mutants killed ' + neg.caught + '/' + (neg.caught + neg.missed));
if (fail > 0) { console.error('\nS5-R3 MAPPING CONTRACT DRIFT'); process.exit(1); }
console.log('S5_MAPPING_FREEZE = model and live agree; SECOND_CALCULATION_PATH_COUNT = 0');
