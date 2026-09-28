// S5-R5 — RECOMMENDATION READ-MODEL + OPERATOR-FACING INTEGRATION.
//
// WHAT THIS IS. The action and reason tokens KMREC already derives are now carried to the operator on the
// Request Order page. Nothing is persisted, no quantity moves, and the page derives nothing of its own.
//
// HOW IT IS TESTED. The REAL render function is lifted out of the page and EXECUTED against DTOs produced by
// the REAL KMREC — no hand-written HTML fixture, no stubbed recommendation. Structural greps alone would not
// have caught the defect this round fixes, because that defect was a correct-looking branch reading the wrong
// field. So the assertions are made against rendered output.
//
// THE DEFECT THIS ROUND FIXES. The page rendered its verdict from `dto.status`, which is a READINESS state
// (READY / NO_ACTION / BLOCKED), not a decision. A row whose need was fully covered by a reallocation has
// status NO_ACTION — so it displayed "No order action required" while a transfer was in fact required. §C
// pins that this can no longer happen.
//
// THE QUANTITY HAZARD. `REALLOCATE_AND_NEW_ORDER` names two actions and must never show their sum: one is
// supply already assigned, the other supply that must be bought. §D asserts the sum appears nowhere.
//
// NO FILE IS WRITTEN. Mutants are compiled in memory.
//
// Run: node assets/tests/s5-r5-recommendation-read-model.test.js

var fs = require('fs');
var path = require('path');
var vm = require('vm');

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
var PAGE = 'assets/js/pages/request-order.js';
var CSS = 'assets/css/pages/request-order.css';
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }

global.KMCALC = require(path.join(ROOT, CORE + 'supply-planning-calculations.js'));
var KMREC = require(path.join(ROOT, CORE + 'supply-recommendation.js'));
var KMFSR = require(path.join(ROOT, CORE + 'supply-planning-surplus-reallocation.js'));
var RO = read(PAGE);
var CSS_SRC = read(CSS);

// ---------------------------------------------------------------------------------------------------------
// Lift the REAL render code out of the page and run it. The slices are anchored on declarations that exist in
// the shipped file, so a rename breaks the harness loudly instead of silently testing nothing.
// ---------------------------------------------------------------------------------------------------------
function slice(from, to, src) {
  src = src || RO;
  var a = src.indexOf(from); if (a < 0) throw new Error('slice start missing: ' + from);
  var b = src.indexOf(to, a + from.length); if (b < 0) throw new Error('slice end missing: ' + to);
  return src.slice(a, b);
}
function buildRenderer(src) {
  var esc = slice('function _roEsc(s) {', 'function _roDistinct', src);
  var body = slice('var _roRecoByKey = {};', 'function handleRequestOrderAiPlan', src);
  var ctx = { window: { KMREC: KMREC }, console: console };
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext(esc + '\n' + body + '\n'
    + 'function __render(item, dto, row) { _roRecoByKey[String(item.sku)] = dto; _opMatCache = { bySku: {} };'
    + ' if (row) _opMatCache.bySku[String(item.sku)] = row; return _roRecoActionHtml(item); }'
    + '\nvar _opMatCache = null;', ctx);
  return ctx;
}
var CTX = buildRenderer(RO);
function render(row, mod) {
  var c = mod || CTX;
  var dto = (mod ? mod.window.KMREC : KMREC).generateOrderPlanningRecommendation(row, { now: 'T' });
  return vm.runInContext('__render(' + JSON.stringify({ sku: row.sku }) + ',' + JSON.stringify(dto) + ',' + JSON.stringify(row) + ')', c);
}

function row(over) {
  var r = {
    company: 'ResTW', country: 'JP', marketplace: 'Amazon', sku: 'KM-1',
    calculation_status: 'READY', calculation_month: '2026-09', calculated_at: '2026-09-28T05:30:00Z',
    t1_month: '2026-10', t1_gap_qty: 0, t1_suggested_qty: 0,
    t2_month: '2026-11', t2_gap_qty: 0, t2_suggested_qty: 0,
    t3_month: '2026-12', t3_gap_qty: 0, t3_suggested_qty: 0,
    t4_month: '2027-01', t4_gap_qty: 0, t4_suggested_qty: 0, units_per_carton: 10,
    factory_available_qty_snapshot: null, reallocation_in_qty_snapshot: null, reallocation_out_qty_snapshot: null
  };
  for (var k in over) if (Object.prototype.hasOwnProperty.call(over, k)) r[k] = over[k];
  return r;
}

// The two reallocation fixtures come from the REAL allocator, so the numbers are its numbers.
function fromAllocator(need, donorQty) {
  var out = KMFSR.reallocatePreallocatedFactorySupply({
    masterSku: 'KM-1', calculationDate: '2026-09-28', unusedFactorySupplyQty: 0,
    receivers: [
      { demandKey: 'A', requiredByDate: '2026-10-10', allocationPriority: 1, projectedRequirementQty: need,
        eligibleFactoryWarehouseIds: ['W1'], initialAllocationBySource: { W1: 0 } },
      { demandKey: 'B', requiredByDate: '2026-10-20', allocationPriority: 1, projectedRequirementQty: 0,
        eligibleFactoryWarehouseIds: ['W1'], initialAllocationBySource: { W1: donorQty } }
    ]
  });
  var A = (out.receivers || []).filter(function (r) { return r.demandKey === 'A'; })[0];
  return { A: A, row: row({ t1_gap_qty: A.remainingShortageQty, reallocation_in_qty_snapshot: A.reallocatedInQty,
    factory_available_qty_snapshot: A.initialFactoryAllocationQty, reallocation_out_qty_snapshot: A.reallocatedOutQty }) };
}
var PARTIAL = fromAllocator(100, 30);   // in 30, short 70
var COVERED = fromAllocator(30, 30);    // in 30, short 0

// =========================================================================================================
section('A. the read model — additive, and derived nowhere but KMREC');
// =========================================================================================================

var PAGE_CODE = code(RO);
ok(/dto\.recommendationAction/.test(PAGE_CODE), 'A1 the page reads recommendationAction from the DTO');
ok(/dto\.reasonTokens/.test(PAGE_CODE), 'A2 and reasonTokens');
// FRONTEND_REDERIVES_* = NO: the page must not contain the derivation, only the words for it.
ok(!/reallocation_in_qty_snapshot\s*>\s*0\s*\)\s*\?[\s\S]{0,40}REALLOCATE/.test(PAGE_CODE),
  'A3 FRONTEND_REDERIVES_ACTION = NO — no action is computed from evidence in the page');
ok(!/deriveRecommendationAction|deriveReasonTokens/.test(PAGE_CODE),
  'A4 and it does not call the derivation helpers either');
ok(!/totalRecommendedQty\s*\+|\+\s*reallocation_in_qty_snapshot/.test(PAGE_CODE),
  'A5 SECOND_RECOMMENDATION_CALCULATION_PATH = 0 — no arithmetic combines the two quantities');

// The labels are presentation and live in the page; the enum is authority and lives in KMREC.
var LABELS = vm.runInContext('RO_RECO_ACTION_LABEL', CTX);
eq(Object.keys(LABELS).sort(), ['MANUAL_REVIEW', 'NEW_ORDER', 'NO_ACTION', 'REALLOCATE', 'REALLOCATE_AND_NEW_ORDER'],
  'A6 every one of the five canonical actions has a label, and no sixth exists');
var TOKEN_TEXT = vm.runInContext('RO_RECO_TOKEN_TEXT', CTX);
eq(Object.keys(TOKEN_TEXT).sort(), KMREC.REASON_TOKENS.slice().sort(),
  'A7 the display map covers exactly the canonical closed token set');

// =========================================================================================================
section('B. the five actions, rendered through the real page function');
// =========================================================================================================

var R_NEW = render(row({ t1_gap_qty: 55 }));
var R_NONE = render(row({}));
var R_MANUAL = render(row({ calculation_status: 'BLOCKED' }));
var R_REALLOC = render(COVERED.row);
var R_BOTH = render(PARTIAL.row);

ok(/New Order<\/span>/.test(R_NEW), 'B1 NEW_ORDER renders its label');
ok(/No Action<\/span>/.test(R_NONE), 'B2 NO_ACTION renders its label');
ok(/Manual Review<\/span>/.test(R_MANUAL), 'B3 MANUAL_REVIEW renders its label');
ok(/Reallocate Supply<\/span>/.test(R_REALLOC), 'B4 REALLOCATE renders its label');
ok(/Reallocate \+ New Order<\/span>/.test(R_BOTH), 'B5 REALLOCATE_AND_NEW_ORDER renders its label');

// Each label carries its own modifier class, and every one of them is styled.
['new_order', 'no_action', 'manual_review', 'reallocate', 'reallocate_and_new_order'].forEach(function (m) {
  ok(CSS_SRC.indexOf('.ro-reco-action__label--' + m) >= 0, 'B6 the ' + m + ' label class has a CSS rule');
});

// =========================================================================================================
section('C. the defect: a covered reallocation must never read as "nothing to do"');
// =========================================================================================================

eq(KMREC.generateOrderPlanningRecommendation(COVERED.row, { now: 'T' }).status, 'NO_ACTION',
  'C1 a fully covered row still has READINESS status NO_ACTION — that is what misled the old render');
eq(KMREC.generateOrderPlanningRecommendation(COVERED.row, { now: 'T' }).recommendationAction, 'REALLOCATE',
  'C2 while its ACTION is REALLOCATE');
ok(!/No order action required/.test(R_REALLOC) && !/No Action<\/span>/.test(R_REALLOC),
  'C3 so the rendered row does NOT claim that no action is required');
ok(/Reallocate Supply/.test(R_REALLOC), 'C4 it names the transfer instead');
// MANUAL_REVIEW must never be dressed as NO_ACTION either.
ok(!/No Action<\/span>/.test(R_MANUAL), 'C5 MISSING_RECOMMENDATION_AS_NO_ACTION_COUNT = 0 for MANUAL_REVIEW');
ok(!/ro-reco-action--none/.test(R_MANUAL), 'C5a and it does not borrow the idle styling');

// =========================================================================================================
section('D. two quantities, never their sum');
// =========================================================================================================

eq([PARTIAL.A.reallocatedInQty, PARTIAL.A.remainingShortageQty], [30, 70],
  'D1 the live allocator gives 30 in and 70 still short');
ok(/Reallocation<\/span><span class="ro-reco-qty__val">30</.test(R_BOTH), 'D2 the reallocation quantity is shown');
ok(/New Order<\/span><span class="ro-reco-qty__val">70</.test(R_BOTH), 'D3 the order quantity is shown separately');
ok(R_BOTH.indexOf('100') === -1, 'D4 COMBINED_QUANTITY_DISPLAY_COUNT = 0 — 30 + 70 appears nowhere');
// A row with no reallocation shows no reallocation figure at all — MISSING is not rendered as 0.
ok(!/Reallocation<\/span>/.test(R_NEW), 'D5 MISSING_AS_ZERO_COUNT = 0 — no reallocation line without evidence');
ok(!/Reallocation<\/span>/.test(R_NONE), 'D5a nor on an idle row');

// =========================================================================================================
section('E. reason presentation — evidence, collapsed, never a raw array');
// =========================================================================================================

ok(/Why this recommendation/.test(R_BOTH), 'E1 the evidence sits behind the page\'s own collapsed-details idiom');
ok(/<details class="ro-reco-reason">/.test(R_BOTH), 'E2 RAW_TOKEN_AS_PRIMARY_UI = NO');
ok(R_BOTH.indexOf('A shortage remains after the supply already counted') >= 0,
  'E3 each emitted token renders its human line');
ok(/ro-reco-reason__token">FACTORY_SURPLUS_REALLOCATION_APPLIED/.test(R_BOTH),
  'E4 and the canonical token stays in the markup for diagnostics');
// D-S5-7 carried: the withdrawn and renamed tokens may not appear anywhere in the page.
['CROSS_COMPANY_REALLOCATION', 'OWN_SUPPLY_APPLIED', 'OVERSEAS_SUPPLY_APPLIED', 'COMMITTED_SUPPLY_APPLIED'].forEach(function (t) {
  ok(PAGE_CODE.indexOf(t) === -1, 'E5 ' + t + ' is not resurrected in the page');
});
// The reallocation line must not claim a cross-company movement the snapshot does not prove.
ok(!/cross-company|cross company/i.test(TOKEN_TEXT.FACTORY_SURPLUS_REALLOCATION_APPLIED),
  'E6 the reallocation text claims a SITE transfer, not a company one');
eq(Object.keys(TOKEN_TEXT).filter(function (t) { return KMREC.REASON_TOKENS.indexOf(t) === -1; }), [],
  'E7 TOKEN_WITHOUT_EVIDENCE_COUNT = 0 — no display text for a token that cannot be emitted');

// =========================================================================================================
section('F. unavailable fields stay unavailable');
// =========================================================================================================

var UNAVAILABLE = ['destination_warehouse_id', 'required_by_date', 'starting_gap_qty', 'own_supply_used',
  'cross_company_supply_used', 'committed_supply_used', 'source_company', 'source_warehouse_id'];
var rendered = [R_NEW, R_NONE, R_MANUAL, R_REALLOC, R_BOTH].join('\n');
eq(UNAVAILABLE.filter(function (f) { return rendered.indexOf(f) >= 0; }), [],
  'F1 UNSUPPORTED_DISPLAY_FIELD_COUNT = 0 — none is rendered');
// And none of them was quietly added to the page's vocabulary either.
eq(UNAVAILABLE.filter(function (f) { return new RegExp('Destination Warehouse|Source Company|Starting Gap').test(rendered); }), [],
  'F2 nor under a friendly label');

// =========================================================================================================
section('G. no new network request, and no per-SKU fetch');
// =========================================================================================================

// The recommendation is generated in the browser from rows the scope read already loaded. That is what makes
// ACTION_EXPAND_REQUEST_COUNT = 0 structural rather than a promise: there is no fetch to make.
var aiPlan = slice('function handleRequestOrderAiPlan', 'window.handleRequestOrderAiPlan =');
ok(/_opMatCache\.bySku/.test(aiPlan) || /_opMatCache && _opMatCache\.bySku/.test(aiPlan),
  'G1 AI Plan derives from the already-loaded materialized rows');
var renderFn = slice('function _roRecoActionHtml', 'function handleRequestOrderAiPlan');
ok(!/fetch\(|XMLHttpRequest|kmFetch|apiCall|\.get\(|postJson/.test(code(renderFn)),
  'G2 NEW_NETWORK_REQUESTS_FOR_ACTION_REASON = 0 — the render makes no request');
ok(!/await |Promise|then\(/.test(code(renderFn)),
  'G3 and it is synchronous, so it cannot start one indirectly');
ok(!/setTimeout|setInterval/.test(code(renderFn)), 'G4 TIMER_DRIFT = 0 — no timer is created per render');
ok(!/addEventListener/.test(code(renderFn)), 'G5 LISTENER_DRIFT = 0 — no listener is attached per render');

// =========================================================================================================
section('H. boundaries — no shipping, no write, no state change');
// =========================================================================================================

ok(!/Ship|Carrier|Shipment/i.test(renderFn), 'H1 SHIPPING_ACTION_COUNT = 0 in the render');
ok(!/order_qty\s*=|user_edited\s*=|draft_version\s*=/.test(code(renderFn)),
  'H2 STATE_MACHINE_CHANGED = NO / SYSTEM_RECALC_OVERWRITES_USER_EDIT = NO — the render writes no state');
var V2 = require(path.join(ROOT, CORE + 'supply-planning-request-draft-v2.js')).V2_HEADERS;
['recommendation_action', 'recommendationAction', 'reason_tokens', 'reasonTokens'].forEach(function (c) {
  ok(V2.indexOf(c) === -1, 'H3 ACTION_PERSISTED = NO — ' + c + ' is in no draft column');
});

// =========================================================================================================
section('I. manual / scheduled parity');
// =========================================================================================================

// Both callers receive the SAME DTO from the SAME owner, so the read model cannot tell them apart — which is
// the point. The page renders whatever KMREC produced, with no caller-specific branch.
var batch = KMREC.generateBatch('ORDER_PLANNING', [PARTIAL.row], { now: 'T' });
eq(batch.recommendations[0].recommendationAction,
  KMREC.generateOrderPlanningRecommendation(PARTIAL.row, { now: 'T' }).recommendationAction,
  'I1 MANUAL_SCHEDULED_UI_DRIFT = 0 — same evidence, same action from either path');
eq(render(PARTIAL.row), vm.runInContext('__render(' + JSON.stringify({ sku: 'KM-1' }) + ','
  + JSON.stringify(batch.recommendations[0]) + ',' + JSON.stringify(PARTIAL.row) + ')', CTX),
  'I2 and the rendered markup is byte-identical for both');

// =========================================================================================================
section('J. mutation');
// =========================================================================================================

function mutatedCtx(from, to) {
  if (RO.indexOf(from) < 0) throw new Error('mutation anchor missing');
  if (RO.indexOf(from) !== RO.lastIndexOf(from)) throw new Error('mutation anchor ambiguous');
  return buildRenderer(RO.replace(from, to));
}

mut('J1 the adapter drops recommendationAction', function () {
  var c = mutatedCtx('  var action = dto.recommendationAction;', '  var action = null;');
  return /Recommendation unavailable/.test(render(PARTIAL.row, c)) && /Reallocate \+ New Order/.test(R_BOTH);
});

mut('J2 reasonTokens are dropped', function () {
  var c = mutatedCtx('  var tokens = Array.isArray(dto.reasonTokens) ? dto.reasonTokens : [];', '  var tokens = [];');
  return !/Why this recommendation/.test(render(PARTIAL.row, c)) && /Why this recommendation/.test(R_BOTH);
});

mut('J3 the page re-derives the action itself', function () {
  var c = mutatedCtx('  var action = dto.recommendationAction;',
    "  var action = (row && row.reallocation_in_qty_snapshot > 0) ? 'REALLOCATE' : dto.recommendationAction;");
  return /Reallocate Supply<\/span>/.test(render(PARTIAL.row, c)) && /Reallocate \+ New Order<\/span>/.test(R_BOTH);
});

mut('J4 the combined action displays the sum', function () {
  var c = mutatedCtx(
    "      + '<span class=\"ro-reco-qty__val\">' + _roRecoFmtQty(dto.totalRecommendedQty) + '</span></span>';",
    "      + '<span class=\"ro-reco-qty__val\">' + _roRecoFmtQty((reallocQty || 0) + dto.totalRecommendedQty) + '</span></span>';");
  return render(PARTIAL.row, c).indexOf('100') >= 0 && R_BOTH.indexOf('100') === -1;
});

mut('J5 a missing recommendation renders as NO_ACTION', function () {
  var c = mutatedCtx(
    "    return '<div class=\"ro-reco-action ro-reco-action--blocked\"><div class=\"ro-reco-action__title\">Recommended Action</div>'",
    "    return '<div class=\"ro-reco-action ro-reco-action--none\"><div class=\"ro-reco-action__title\">Recommended Action</div><span>No Action</span>'");
  var m = mutatedCtx('  var action = dto.recommendationAction;', '  var action = null;');
  // the honest build says 'unavailable'; combining both mutations would say 'No Action'
  return /Recommendation unavailable/.test(render(PARTIAL.row, m))
    && /ro-reco-action--none/.test(vm.runInContext('__render({"sku":"KM-1"},' + JSON.stringify({ recommendationAction: null }) + ',null)', c));
});

mut('J6 MANUAL_REVIEW is labelled No Action', function () {
  var c = mutatedCtx("  MANUAL_REVIEW: 'Manual Review'", "  MANUAL_REVIEW: 'No Action'");
  return /No Action<\/span>/.test(render(row({ calculation_status: 'BLOCKED' }), c)) && /Manual Review<\/span>/.test(R_MANUAL);
});

mut('J7 a withdrawn token is given display text again', function () {
  var c = mutatedCtx("  FACTORY_SUPPLY_APPLIED: 'Factory supply is already counted toward this need',",
    "  OWN_SUPPLY_APPLIED: 'Own site stock covered part of this need',\r\n  FACTORY_SUPPLY_APPLIED: 'Factory supply is already counted toward this need',");
  var m = vm.runInContext('RO_RECO_TOKEN_TEXT', c);
  return Object.keys(m).indexOf('OWN_SUPPLY_APPLIED') >= 0
    && Object.keys(TOKEN_TEXT).indexOf('OWN_SUPPLY_APPLIED') === -1;
});

mut('J8 the reallocation line starts claiming a cross-company transfer', function () {
  var c = mutatedCtx("  FACTORY_SURPLUS_REALLOCATION_APPLIED: 'Factory surplus was reallocated in from another site',",
    "  FACTORY_SURPLUS_REALLOCATION_APPLIED: 'Factory surplus was reallocated in from another company',");
  var m = vm.runInContext('RO_RECO_TOKEN_TEXT', c);
  return /another company/.test(m.FACTORY_SURPLUS_REALLOCATION_APPLIED)
    && !/another company/.test(TOKEN_TEXT.FACTORY_SURPLUS_REALLOCATION_APPLIED);
});

mut('J9 the render starts fetching per SKU', function () {
  // Guards §G: if the probe merely tested a string it would pass on any source.
  var withFetch = code(renderFn.replace('var action = dto.recommendationAction;',
    'var action = dto.recommendationAction; fetch("/reco/" + item.sku);'));
  return /fetch\(/.test(withFetch) && !/fetch\(/.test(code(renderFn));
});

mut('J10 MISSING reallocation is rendered as 0', function () {
  var c = mutatedCtx('  if (reallocQty !== null && reallocQty > 0) {', '  if (true) {');
  return /Reallocation<\/span>/.test(render(row({ t1_gap_qty: 55 }), c)) && !/Reallocation<\/span>/.test(R_NEW);
});

// =========================================================================================================
section('RESULT');
console.log('passed ' + pass + '  failed ' + fail + '  mutants killed ' + neg.caught + '/' + (neg.caught + neg.missed));
if (fail > 0) { console.error('\nS5-R5 READ-MODEL / UI CONTRACT DRIFT'); process.exit(1); }
console.log('S5_READ_MODEL_UI_SLICE = the five actions render from KMREC, and no quantity was combined');
