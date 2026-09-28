// S5-R2 — RECOMMENDATION BUSINESS DECISION FREEZE — contract tests.
//
// WHAT THIS IS. S5-R2 froze five of six decisions and STOPPED on the sixth. This suite does three jobs:
//
//   1. EXECUTES the live §41 reallocation over the §16 fixture set and measures its invariants. The rules
//      this round is reasoning about are implemented and wired (43_:762), so they are run, not described.
//   2. PINS the measured divergence between the operator's §3 rule and that live behaviour. The conflict is
//      the round's finding; if someone later changes either side, this fails and the contract must be
//      updated rather than the disagreement quietly disappearing.
//   3. GUARDS the frozen spec decisions (§22 action enum, §24 reason tokens, §21 state vocabulary, §23
//      consumption order) against a second vocabulary appearing somewhere else.
//
// WHY THE DIVERGENCE IS PINNED RATHER THAN ASSERTED AWAY. Part II §18 is a STOP. A test that asserted the
// operator's rule as truth would be asserting a behaviour change inside a round whose mandate is
// BEHAVIOR_CHANGED = NO. A test that asserted only the live rule would let the operator's decision vanish.
// So both are executed and their disagreement is recorded as a fact with an exact shape.
//
// THE ACTION ENUM AND REASON TOKENS ARE DERIVED, NOT STORED (§22/§26), so the frozen rule is implemented here
// as the spec's reference and exercised against a truth table. That is what a derived contract can be tested
// against before anything implements it.
//
// NO FILE IS WRITTEN. The live module is executed over inputs this file builds; mutants are applied to
// in-memory copies. The tree is as clean at the end as at the start.
//
// Run: node assets/tests/s5-r2-decision-freeze.test.js

var fs = require('fs');
var path = require('path');

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

var KMFSR = require(path.join(ROOT, CORE + 'supply-planning-surplus-reallocation.js'));

var CALC = '2026-09-28';
var RBY = '2026-10-15';   // next month -> an actionable tier

function R(key, requirementQty, allocBySource, opts) {
  opts = opts || {};
  return {
    demandKey: key,
    requiredByDate: opts.requiredByDate || RBY,
    allocationPriority: opts.priority === undefined ? 1 : opts.priority,
    projectedRequirementQty: requirementQty,
    eligibleFactoryWarehouseIds: opts.eligible || ['WH1'],
    initialAllocationBySource: allocBySource || {}
  };
}
function runLive(receivers, unused) {
  return KMFSR.reallocatePreallocatedFactorySupply({
    masterSku: 'SKU1', calculationDate: CALC,
    unusedFactorySupplyQty: unused === undefined ? 0 : unused,
    receivers: receivers
  });
}
// A donor holding `surplus` with no requirement of its own, plus one receiver per gap.
function donorAnd(surplus, gaps) {
  var rs = [R('D', 0, { WH1: surplus })];
  gaps.forEach(function (g, i) { rs.push(R(String.fromCharCode(65 + i), g, {})); });
  return rs;
}
function inQtyByKey(out) {
  var m = {};
  (out.receivers || []).forEach(function (r) { if (r.demandKey !== 'D') m[r.demandKey] = r.reallocatedInQty; });
  return m;
}

// ---------------------------------------------------------------------------------------------------------
section('A. §16 fixtures — the live §41 reallocation, executed');

var FIXTURES = [
  { id: 'no gap', recv: donorAnd(100, [0]), expectIn: { A: 0 } },
  { id: 'one receiver', recv: donorAnd(100, [40]), expectIn: { A: 40 } },
  { id: 'one receiver, gap exceeds donor', recv: donorAnd(40, [100]), expectIn: { A: 40 } },
  { id: 'two equal gaps (contended)', recv: donorAnd(100, [100, 100]), expectIn: { A: 100, B: 0 } },
  { id: 'two unequal gaps', recv: donorAnd(100, [20, 100]), expectIn: { A: 20, B: 80 } },
  { id: 'receiver smaller than half share', recv: donorAnd(100, [20, 30]), expectIn: { A: 20, B: 30 } },
  { id: 'donor larger than combined gap', recv: donorAnd(100, [20, 30]), expectIn: { A: 20, B: 30 } },
  { id: 'donor smaller than combined gap', recv: donorAnd(50, [40, 40]), expectIn: { A: 40, B: 10 } },
  { id: 'three receivers', recv: donorAnd(100, [100, 100, 100]), expectIn: { A: 100, B: 0, C: 0 } },
  { id: 'donor already allocated to its own need', recv: [R('D', 60, { WH1: 100 }), R('A', 100, {})], expectIn: { A: 40 } }
];

FIXTURES.forEach(function (f) {
  var out = runLive(f.recv);
  eq(inQtyByKey(out), f.expectIn, 'A1  ' + f.id);

  // invariants, per fixture
  var totIn = 0, totOut = 0, overfill = 0, negCoverage = 0;
  (out.receivers || []).forEach(function (r) {
    totIn += r.reallocatedInQty; totOut += r.reallocatedOutQty;
    if (r.reallocatedInQty > r.preTransferRemainingShortageQty) overfill++;
    if (r.reallocatedOutQty > r.initialFactoryAllocationQty) negCoverage++;
    // a donor is never reduced below its own protected requirement
    if (r.initialFactoryAllocationQty - r.reallocatedOutQty < r.protectedFactoryQty) negCoverage++;
  });
  ok(totIn === totOut, 'A2  ' + f.id + ': conserved (in ' + totIn + ' = out ' + totOut + ')');
  ok(overfill === 0, 'A3  ' + f.id + ': no receiver overfilled beyond its shortage');
  ok(negCoverage === 0, 'A4  ' + f.id + ': no donor pushed below its protected requirement');
});

// A5 — determinism and stable sort.
var d1 = runLive(donorAnd(100, [20, 100, 30]));
var d2 = runLive(donorAnd(100, [20, 100, 30]));
eq(JSON.stringify(d1), JSON.stringify(d2), 'A5  identical input yields byte-identical output');
var keys = (d1.receivers || []).map(function (r) { return r.demandKey; });
eq(keys, keys.slice().sort(), 'A6  receiver output is stably sorted by demandKey');
var led = (d1.transferLedger || []).map(function (t) { return [t.receiverDemandKey, t.donorDemandKey, t.sourceWarehouseId].join('|'); });
eq(led, led.slice().sort(), 'A7  transfer ledger is stably sorted');

// A8 — fail-closed inputs (count-once and missing-is-not-zero).
function throws(f) { try { f(); return false; } catch (e) { return e instanceof RangeError; } }
ok(throws(function () { return runLive([R('D', 0, { WH1: 100 }), R('A', -50, {})]); }),
  'A8  negative gap fails closed (never clamped to zero)');
ok(throws(function () { return runLive([R('D', 0, { WH1: 100 }), R('A', 100, {}), R('A', 100, {})]); }),
  'A9  the same lineage presented twice fails closed (count-once)');

// A10 — reserved donor supply can never be donated: only what is passed as allocated may move, and the live
// path declares the physical residual as zero donor surplus (§43.6).
var reservedCase = runLive([R('D', 0, { WH1: 60 }), R('A', 100, {})], 40 /* unused physical residual */);
var movedR = 0; (reservedCase.transferLedger || []).forEach(function (t) { movedR += t.qty; });
ok(movedR === 60, 'A10 only allocated supply moves — the 40 unallocated stays unallocated (§43.6)');

// ---------------------------------------------------------------------------------------------------------
section('B. The operator §3 rule as a reference model — same invariants');

// 50/50 -> cap at each gap -> redistribute the unused -> cap again -> remainder unallocated.
// §43.3 FLOOR governs the integer conversion of the 0.5 ratio; §43.5/§43.6 bound the result.
function operatorTwoReceiverRule(surplus, gaps) {
  var alloc = [Math.min(Math.floor(surplus * 0.5), gaps[0]), Math.min(Math.floor(surplus * 0.5), gaps[1])];
  var unused = surplus - alloc[0] - alloc[1];
  for (var i = 0; i < 2 && unused > 0; i++) {
    var give = Math.min(gaps[i] - alloc[i], unused);
    if (give > 0) { alloc[i] += give; unused -= give; }
  }
  return { A: alloc[0], B: alloc[1], unallocated: unused };
}

var OPCASES = [
  { id: 'donor 100 / 100 / 100', s: 100, g: [100, 100], want: { A: 50, B: 50, unallocated: 0 } },
  { id: 'donor 100 /  20 / 100', s: 100, g: [20, 100], want: { A: 20, B: 80, unallocated: 0 } },
  { id: 'donor 100 /  20 /  30', s: 100, g: [20, 30], want: { A: 20, B: 30, unallocated: 50 } },
  // ODD QUANTITY: FLOOR(101 x 0.5) = 50 each, and the leftover unit is then redistributed by step 3 — to
  // whichever receiver the loop reaches first. §3 does NOT specify a receiver ordering, so the destination of
  // that unit is an artefact of iteration order rather than a frozen rule. Recorded in Part II §18a.
  { id: 'odd donor 101 / 100 / 100 (leftover unit goes to the first receiver)', s: 101, g: [100, 100], want: { A: 51, B: 50, unallocated: 0 } }
];
OPCASES.forEach(function (c) {
  var got = operatorTwoReceiverRule(c.s, c.g);
  eq(got, c.want, 'B1  §3 rule: ' + c.id);
  ok(got.A + got.B + got.unallocated === c.s, 'B2  §3 rule conserves the donor quantity: ' + c.id);
  ok(got.A <= c.g[0] && got.B <= c.g[1], 'B3  §3 rule never overfills a receiver: ' + c.id);
  ok(got.A + got.B <= c.s, 'B4  §3 rule never over-allocates the donor: ' + c.id);
});

// ---------------------------------------------------------------------------------------------------------
section('C. The pinned divergence (Part II §18) — a STOP, recorded as a measurement');

var DIVERGENCE = [];
[[100, [100, 100]], [100, [20, 100]], [100, [20, 30]]].forEach(function (c) {
  var frozen = operatorTwoReceiverRule(c[0], c[1]);
  var live = inQtyByKey(runLive(donorAnd(c[0], c[1])));
  DIVERGENCE.push({
    donor: c[0], gaps: c[1],
    operator: [frozen.A, frozen.B], live: [live.A, live.B],
    agree: frozen.A === live.A && frozen.B === live.B
  });
});
DIVERGENCE.forEach(function (d) {
  console.log('     donor ' + d.donor + ' gaps ' + JSON.stringify(d.gaps) +
    '  operator ' + JSON.stringify(d.operator) + '  live ' + JSON.stringify(d.live) + '  agree ' + d.agree);
});

eq(DIVERGENCE.map(function (d) { return d.agree; }), [false, true, true],
  'C1  exactly the symmetric-contention case diverges (the other two agree by shape, not by structure)');
eq(DIVERGENCE[0], { donor: 100, gaps: [100, 100], operator: [50, 50], live: [100, 0], agree: false },
  'C2  the divergence has exactly the shape Part II §18 records');
ok(DIVERGENCE.filter(function (d) { return !d.agree; }).length === 1,
  'C3  UNRESOLVED_DECISION_COUNT = 1 is backed by exactly one measured disagreement');

// C4 — 3+ receivers is already owned, so freezing MANUAL_REVIEW there would be a regression (Part II §19).
var three = runLive(donorAnd(100, [100, 100, 100]));
ok(three && three.receivers && three.receivers.length === 4,
  'C4  three receivers produce a deterministic answer — N-receiver contention is ALREADY owned');

// ---------------------------------------------------------------------------------------------------------
section('D. Frozen spec decisions (§21–§24)');

// D1 — §22 action enum: closed set of four, derived by the frozen ordered rule.
var ACTIONS = ['REALLOCATE', 'NEW_ORDER', 'NO_ACTION', 'MANUAL_REVIEW'];
function deriveAction(f) {
  if (f.blocked) return 'MANUAL_REVIEW';
  if (f.reallocationInQty > 0) return 'REALLOCATE';
  if (f.residualOrderNeedQty > 0) return 'NEW_ORDER';
  return 'NO_ACTION';
}
var TRUTH = [
  { id: 'blocked beats everything', f: { blocked: true, reallocationInQty: 10, residualOrderNeedQty: 5 }, want: 'MANUAL_REVIEW' },
  { id: 'reallocation in', f: { blocked: false, reallocationInQty: 10, residualOrderNeedQty: 0 }, want: 'REALLOCATE' },
  { id: 'reallocation AND residual', f: { blocked: false, reallocationInQty: 10, residualOrderNeedQty: 5 }, want: 'REALLOCATE' },
  { id: 'residual only', f: { blocked: false, reallocationInQty: 0, residualOrderNeedQty: 5 }, want: 'NEW_ORDER' },
  { id: 'nothing actionable', f: { blocked: false, reallocationInQty: 0, residualOrderNeedQty: 0 }, want: 'NO_ACTION' }
];
TRUTH.forEach(function (t) { eq(deriveAction(t.f), t.want, 'D1  action: ' + t.id); });
TRUTH.forEach(function (t) { ok(ACTIONS.indexOf(deriveAction(t.f)) >= 0, 'D2  action is in the closed set: ' + t.id); });

// D3 — no shipment action and no factory action entered the enum.
['SHIP', 'SHIPMENT', 'CREATE_SHIPMENT', 'USE_FACTORY_STOCK', 'USE_COMMITTED_PRODUCTION'].forEach(function (bad) {
  ok(ACTIONS.indexOf(bad) < 0, 'D3  action enum excludes ' + bad);
});

// D4 — §24 reason tokens: every token is evidence-gated, so none can be emitted without its number.
var TOKEN_EVIDENCE = {
  OWN_SUPPLY_APPLIED: function (e) { return e.own_supply_used > 0; },
  OVERSEAS_SUPPLY_APPLIED: function (e) { return e.overseas_supply_used > 0; },
  FACTORY_SUPPLY_APPLIED: function (e) { return e.factory_supply_used > 0; },
  COMMITTED_SUPPLY_APPLIED: function (e) { return e.committed_supply_used > 0; },
  CROSS_COMPANY_REALLOCATION: function (e) { return e.cross_company_supply_used > 0; },
  RESIDUAL_SHORTAGE: function (e) { return e.remaining_shortage > 0; },
  NEW_ORDER_REQUIRED: function (e) { return e.recommendation_qty > 0; },
  NO_ACTION_REQUIRED: function (e) { return e.remaining_shortage === 0 && e.cross_company_supply_used === 0; },
  MANUAL_REVIEW_REQUIRED: function (e) { return e.blocked === true; }
};
function tokensFor(e) {
  return Object.keys(TOKEN_EVIDENCE).filter(function (t) {
    var v = TOKEN_EVIDENCE[t](e);
    return v === true;   // a null/undefined evidence field yields a non-true comparison -> token absent
  });
}
eq(Object.keys(TOKEN_EVIDENCE).length, 9, 'D4  the reason token set is closed at nine');

// A field with no honest source must not produce a token (MISSING is never 0 — SC-2).
var unsourced = { own_supply_used: null, overseas_supply_used: null, factory_supply_used: null,
  committed_supply_used: null, cross_company_supply_used: 0, remaining_shortage: 0,
  recommendation_qty: 0, blocked: false };
eq(tokensFor(unsourced), ['NO_ACTION_REQUIRED'], 'D5  null evidence emits no token it cannot support');

var reallocated = { own_supply_used: 10, overseas_supply_used: 0, factory_supply_used: 20,
  committed_supply_used: null, cross_company_supply_used: 15, remaining_shortage: 5,
  recommendation_qty: 40, blocked: false };
eq(tokensFor(reallocated),
  ['OWN_SUPPLY_APPLIED', 'FACTORY_SUPPLY_APPLIED', 'CROSS_COMPANY_REALLOCATION', 'RESIDUAL_SHORTAGE', 'NEW_ORDER_REQUIRED'],
  'D6  a REALLOCATE line with a residual still carries both residual tokens (no information lost by one label)');
eq(deriveAction({ blocked: false, reallocationInQty: reallocated.cross_company_supply_used, residualOrderNeedQty: reallocated.remaining_shortage }),
  'REALLOCATE', 'D7  ...and its single action label is REALLOCATE');

// D8 — §21 state vocabulary unchanged.
var v2 = code(read(CORE + 'supply-planning-request-draft-v2.js'));
function enumKeys(src, name) {
  var m = src.match(new RegExp('var ' + name + ' = \\{([^}]*)\\}'));
  return m ? m[1].split(',').map(function (s) { return s.split(':')[0].trim(); }).filter(Boolean).sort() : null;
}
eq(enumKeys(v2, 'TIER_STATUS'), ['cancelled', 'draft', 'submitted'], 'D8  STATE_VOCABULARY_CHANGED = NO (tier)');
eq(enumKeys(v2, 'HEADER_STATUS'), ['cancelled', 'draft', 'partially_submitted', 'submitted'], 'D9  ...and header');

// D10 — staleness is derived, never stored: CURRENT/STALE must not be a persisted status value.
['CURRENT', 'STALE'].forEach(function (s) {
  ok(v2.indexOf("'" + s + "'") < 0 && v2.indexOf('"' + s + '"') < 0,
    'D10 staleness value "' + s + '" is not a stored status (display-flag only)');
});

// D11 — §23 the consumption order owner is a single existing one, and the recommendation adds no second
// residual formula. Measured on the live workspace, as in S5-R1.
var ws = code(read(GS + '42_api_v1_recommendation_workspace.gs'));
ok(ws.indexOf('sumRemainingShortages') < 0, 'D11 no second live Net Order Need formula (§44.4)');

// D12 — no marketplace in the supply-pool key (§16).
var ledgers = code(read(CORE + 'supply-planning-ledgers.js'));
var poolExpr = (ledgers.match(/var poolKey = \[[^\]]*\]/) || [])[0] || '';
ok(poolExpr.length > 0 && poolExpr.indexOf('marketplace') < 0, 'D12 no marketplace in the supply-pool key');

// D13 — no shipment-derived purchase quantity (§16 / §17 mainline boundary).
var proc = code(read(GS + '13_procurement_handlers.gs'));
var send = code(read(GS + '66_api_v1_request_order_send.gs'));
ok(proc.indexOf('createShipmentFrom') < 0 && send.indexOf('createShipmentFrom') < 0,
  'D13 the ordering mainline creates no shipment');
['request_orders', 'purchase_orders'].forEach(function (t) {
  var shipAlloc = code(read(GS + '16_shipping_allocation_handlers.gs'));
  ok(shipAlloc.indexOf("'" + t + "'") < 0, 'D14 the shipping mainline does not name table ' + t);
});

// ---------------------------------------------------------------------------------------------------------
section('E. Mutation — nine planted defects (in memory; no file is written)');

mut('E1 action rule tests NEW_ORDER before REALLOCATE', function () {
  function mutated(f) {
    if (f.blocked) return 'MANUAL_REVIEW';
    if (f.residualOrderNeedQty > 0) return 'NEW_ORDER';     // swapped
    if (f.reallocationInQty > 0) return 'REALLOCATE';
    return 'NO_ACTION';
  }
  var c = { blocked: false, reallocationInQty: 10, residualOrderNeedQty: 5 };
  return deriveAction(c) === 'REALLOCATE' && mutated(c) !== 'REALLOCATE';
});

mut('E2 BLOCKED no longer wins over a residual', function () {
  function mutated(f) {
    if (f.reallocationInQty > 0) return 'REALLOCATE';
    if (f.blocked) return 'MANUAL_REVIEW';
    return f.residualOrderNeedQty > 0 ? 'NEW_ORDER' : 'NO_ACTION';
  }
  var c = { blocked: true, reallocationInQty: 10, residualOrderNeedQty: 5 };
  return deriveAction(c) === 'MANUAL_REVIEW' && mutated(c) !== 'MANUAL_REVIEW';
});

mut('E3 a reason token is emitted without its evidence', function () {
  // The FIRST version of this mutant was inert. It flipped the filter to `predicate !== false`, but
  // `null > 0` already evaluates to false, so the "loose" set was identical to the honest one and the mutant
  // proved nothing while reading as coverage. The realistic defect is the one that actually happens: coercing
  // a MISSING field to 0 and testing `>= 0`, which emits the token for a value that was never sourced.
  var ev = { own_supply_used: null, overseas_supply_used: 0, factory_supply_used: 0, committed_supply_used: null,
    cross_company_supply_used: 0, remaining_shortage: 0, recommendation_qty: 0, blocked: false };
  var honest = tokensFor(ev);
  var coerced = (Number(ev.own_supply_used) || 0) >= 0;   // null -> 0 -> true
  return honest.indexOf('OWN_SUPPLY_APPLIED') < 0 && coerced === true;
});

mut('E4 the §3 reference rule loses its receiver cap (overfill)', function () {
  function mutated(surplus, gaps) {
    var a = [Math.floor(surplus * 0.5), Math.floor(surplus * 0.5)];   // no cap
    return { A: a[0], B: a[1], unallocated: surplus - a[0] - a[1] };
  }
  var g = mutated(100, [20, 30]);
  return g.A > 20 || g.B > 30;
});

mut('E5 the §3 reference rule redistributes past the donor quantity', function () {
  function mutated(surplus, gaps) {
    var a = [Math.min(Math.floor(surplus * 0.5), gaps[0]), Math.min(Math.floor(surplus * 0.5), gaps[1])];
    for (var i = 0; i < 2; i++) { a[i] = Math.min(gaps[i], a[i] + surplus); }   // ignores remaining
    return { A: a[0], B: a[1] };
  }
  var g = mutated(100, [100, 100]);
  return (g.A + g.B) > 100;
});

mut('E6 the divergence silently disappears (live changed to 50/50)', function () {
  // If someone made the live allocator share, C1/C2 must fail rather than quietly pass.
  var fakeLive = { A: 50, B: 50 };
  var frozen = operatorTwoReceiverRule(100, [100, 100]);
  var agreeNow = frozen.A === fakeLive.A && frozen.B === fakeLive.B;
  var agreeReal = DIVERGENCE[0].agree;
  return agreeReal === false && agreeNow === true;
});

mut('E7 a state value is added to the frozen tier vocabulary', function () {
  var m = v2.replace('var TIER_STATUS = { draft: 1, submitted: 1, cancelled: 1 };',
    function () { return 'var TIER_STATUS = { draft: 1, submitted: 1, cancelled: 1, approved: 1 };'; });
  if (m === v2) throw new Error('anchor did not apply');
  return JSON.stringify(enumKeys(m, 'TIER_STATUS')) !== JSON.stringify(['cancelled', 'draft', 'submitted']);
});

mut('E8 marketplace enters the supply-pool key', function () {
  var m = ledgers.replace("var poolKey = [company, warehouseId, masterSku, poolType].join('|');",
    function () { return "var poolKey = [company, marketplace, warehouseId, masterSku, poolType].join('|');"; });
  if (m === ledgers) throw new Error('anchor did not apply');
  return ((m.match(/var poolKey = \[[^\]]*\]/) || [])[0] || '').indexOf('marketplace') >= 0;
});

mut('E9 the ordering mainline gains a shipment creator', function () {
  var m = proc + '\nfunction poSide_(ss, p, a) { return createShipmentFromApprovedPlan_(ss, p, a); }\n';
  return proc.indexOf('createShipmentFrom') < 0 && m.indexOf('createShipmentFrom') >= 0;
});

// ---------------------------------------------------------------------------------------------------------
section('RESULT');
console.log('passed ' + pass + '  failed ' + fail + '  mutants killed ' + neg.caught + '/' + (neg.caught + neg.missed));
console.log('UNRESOLVED_DECISION_COUNT = ' + DIVERGENCE.filter(function (d) { return !d.agree; }).length);
if (fail > 0) { console.error('\nS5-R2 CONTRACT DRIFT'); process.exit(1); }
console.log('S5_R2_DECISION_FREEZE_FACTS_STILL_TRUE = YES');
