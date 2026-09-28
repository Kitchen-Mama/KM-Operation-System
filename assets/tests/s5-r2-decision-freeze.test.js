// S5-R2 — RECOMMENDATION BUSINESS DECISION FREEZE — frozen spec vocabulary.
//
// SCOPE CHANGED IN S5-R2A. This suite originally also carried the §41 contention fixtures, a reference model
// of the proposed 50/50 split, and a pin on the divergence between them. The operator has since resolved
// D-S5-1 by KEEPING the live sequential-greedy policy, so:
//
//   • the 50/50 reference model and its two mutants were REMOVED, not kept as a "rejected branch". Modelling
//     and mutating a branch the system does not have is theatre: it reports coverage for behaviour nobody
//     can reach.
//   • the divergence pin was REMOVED. It existed to stop an unresolved disagreement from disappearing
//     quietly; the disagreement is now resolved, so the pin would assert a conflict that no longer exists.
//   • the contention fixtures MOVED to `s5-r2a-contention-policy-freeze.test.js`, which owns that algorithm
//     properly — model-vs-live over every receiver count, with the sort derived rather than named, and with
//     mutants that break the real module. Keeping a second copy here would mean two places to update.
//
// WHAT THIS SUITE OWNS NOW: the frozen spec VOCABULARY — the §22 action enum, the §24 reason tokens, the §21
// state vocabulary and staleness, the §23 single consumption order, and the mainline/pool-key guards. The
// contention ALGORITHM is owned by the R2A suite.
//
// The action enum and reason tokens are DERIVED, not stored (§22/§26), so the frozen rule is implemented here
// as the spec's reference and exercised against a truth table — which is what a derived contract can be
// tested against before anything implements it.
//
// NO FILE IS WRITTEN. Mutants are applied to in-memory copies.
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

// ---------------------------------------------------------------------------------------------------------
section('A. §22 — the recommendation action enum');

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
TRUTH.forEach(function (t) { eq(deriveAction(t.f), t.want, 'A1  action: ' + t.id); });
TRUTH.forEach(function (t) { ok(ACTIONS.indexOf(deriveAction(t.f)) >= 0, 'A2  in the closed set: ' + t.id); });
eq(ACTIONS.length, 4, 'A3  RECOMMENDATION_TYPE_ENUM is closed at four');

// A4 — no shipment action (other mainline) and no factory action (coverage is evidence, not an instruction).
['SHIP', 'SHIPMENT', 'CREATE_SHIPMENT', 'USE_FACTORY_STOCK', 'USE_COMMITTED_PRODUCTION'].forEach(function (bad) {
  ok(ACTIONS.indexOf(bad) < 0, 'A4  action enum excludes ' + bad);
});

// ---------------------------------------------------------------------------------------------------------
section('B. §24 — reason tokens are closed and evidence-gated');

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
  return Object.keys(TOKEN_EVIDENCE).filter(function (t) { return TOKEN_EVIDENCE[t](e) === true; });
}
eq(Object.keys(TOKEN_EVIDENCE).length, 9, 'B1  the reason token set is closed at nine');

var unsourced = { own_supply_used: null, overseas_supply_used: null, factory_supply_used: null,
  committed_supply_used: null, cross_company_supply_used: 0, remaining_shortage: 0,
  recommendation_qty: 0, blocked: false };
eq(tokensFor(unsourced), ['NO_ACTION_REQUIRED'], 'B2  null evidence emits no token it cannot support');

var reallocated = { own_supply_used: 10, overseas_supply_used: 0, factory_supply_used: 20,
  committed_supply_used: null, cross_company_supply_used: 15, remaining_shortage: 5,
  recommendation_qty: 40, blocked: false };
eq(tokensFor(reallocated),
  ['OWN_SUPPLY_APPLIED', 'FACTORY_SUPPLY_APPLIED', 'CROSS_COMPANY_REALLOCATION', 'RESIDUAL_SHORTAGE', 'NEW_ORDER_REQUIRED'],
  'B3  a REALLOCATE line with a residual still carries both residual tokens');
eq(deriveAction({ blocked: false, reallocationInQty: reallocated.cross_company_supply_used, residualOrderNeedQty: reallocated.remaining_shortage }),
  'REALLOCATE', 'B4  ...and its single action label is REALLOCATE, so the one label loses nothing');

// ---------------------------------------------------------------------------------------------------------
section('C. §21 — state vocabulary and staleness');

var v2 = code(read(CORE + 'supply-planning-request-draft-v2.js'));
function enumKeys(src, name) {
  var m = src.match(new RegExp('var ' + name + ' = \\{([^}]*)\\}'));
  return m ? m[1].split(',').map(function (s) { return s.split(':')[0].trim(); }).filter(Boolean).sort() : null;
}
eq(enumKeys(v2, 'TIER_STATUS'), ['cancelled', 'draft', 'submitted'], 'C1  STATE_VOCABULARY_CHANGED = NO (tier)');
eq(enumKeys(v2, 'HEADER_STATUS'), ['cancelled', 'draft', 'partially_submitted', 'submitted'], 'C2  ...and header');

// C3 — staleness is derived, never stored, so CURRENT/STALE cannot collide with the frozen vocabulary.
['CURRENT', 'STALE'].forEach(function (s) {
  ok(v2.indexOf("'" + s + "'") < 0 && v2.indexOf('"' + s + '"') < 0,
    'C3  staleness value "' + s + '" is not a stored status (display-flag only)');
});

// ---------------------------------------------------------------------------------------------------------
section('D. §23 / mainline — one consumption order, one residual owner, separate mainlines');

var ws = code(read(GS + '42_api_v1_recommendation_workspace.gs'));
ok(ws.indexOf('sumRemainingShortages') < 0, 'D1  no second live Net Order Need formula (§44.4)');

var ledgers = code(read(CORE + 'supply-planning-ledgers.js'));
var poolExpr = (ledgers.match(/var poolKey = \[[^\]]*\]/) || [])[0] || '';
ok(poolExpr.length > 0 && poolExpr.indexOf('marketplace') < 0, 'D2  no marketplace in the supply-pool key');

var proc = code(read(GS + '13_procurement_handlers.gs'));
var send = code(read(GS + '66_api_v1_request_order_send.gs'));
ok(proc.indexOf('createShipmentFrom') < 0 && send.indexOf('createShipmentFrom') < 0,
  'D3  the ordering mainline creates no shipment');
var shipAlloc = code(read(GS + '16_shipping_allocation_handlers.gs'));
['request_orders', 'purchase_orders'].forEach(function (t) {
  ok(shipAlloc.indexOf("'" + t + "'") < 0, 'D4  the shipping mainline does not name table ' + t);
});

// ---------------------------------------------------------------------------------------------------------
section('E. Mutation — six planted defects (in memory; no file is written)');

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
  // An earlier version of this mutant was inert: it flipped the filter to `predicate !== false`, but
  // `null > 0` is already false, so the "loose" set was identical to the honest one. The realistic defect is
  // coercing a MISSING field to 0 and testing `>= 0`, which emits a token for a value never sourced.
  var ev = { own_supply_used: null, overseas_supply_used: 0, factory_supply_used: 0, committed_supply_used: null,
    cross_company_supply_used: 0, remaining_shortage: 0, recommendation_qty: 0, blocked: false };
  var honest = tokensFor(ev);
  var coerced = (Number(ev.own_supply_used) || 0) >= 0;   // null -> 0 -> true
  return honest.indexOf('OWN_SUPPLY_APPLIED') < 0 && coerced === true;
});

mut('E4 a state value is added to the frozen tier vocabulary', function () {
  var m = v2.replace('var TIER_STATUS = { draft: 1, submitted: 1, cancelled: 1 };',
    function () { return 'var TIER_STATUS = { draft: 1, submitted: 1, cancelled: 1, approved: 1 };'; });
  if (m === v2) throw new Error('anchor did not apply');
  return JSON.stringify(enumKeys(m, 'TIER_STATUS')) !== JSON.stringify(['cancelled', 'draft', 'submitted']);
});

mut('E5 marketplace enters the supply-pool key', function () {
  var m = ledgers.replace("var poolKey = [company, warehouseId, masterSku, poolType].join('|');",
    function () { return "var poolKey = [company, marketplace, warehouseId, masterSku, poolType].join('|');"; });
  if (m === ledgers) throw new Error('anchor did not apply');
  return ((m.match(/var poolKey = \[[^\]]*\]/) || [])[0] || '').indexOf('marketplace') >= 0;
});

mut('E6 the ordering mainline gains a shipment creator', function () {
  var m = proc + '\nfunction poSide_(ss, p, a) { return createShipmentFromApprovedPlan_(ss, p, a); }\n';
  return proc.indexOf('createShipmentFrom') < 0 && m.indexOf('createShipmentFrom') >= 0;
});

// ---------------------------------------------------------------------------------------------------------
section('RESULT');
console.log('passed ' + pass + '  failed ' + fail + '  mutants killed ' + neg.caught + '/' + (neg.caught + neg.missed));
if (fail > 0) { console.error('\nS5-R2 CONTRACT DRIFT'); process.exit(1); }
console.log('S5_R2_FROZEN_VOCABULARY_STILL_TRUE = YES');
