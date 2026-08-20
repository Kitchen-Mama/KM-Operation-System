// Kitchen Mama Operation System — Ongoing-Order live runtime chain (KMOOR) tests — F1-7N-FA-3B3a.
// Run: node assets/tests/supply-planning-ongoing-order-runtime-f1-7n-fa-3b3a.test.js
// Proves the single-authority chain KMSF (lifecycle/count-once admission) → KMOOP (site allocation) → KMOTA
// (Phase-1 timing) → per-receiver KMTPP incoming facts. Covers the 12 round CASES A–L: count-once (received &
// shipped excluded), A1/A2 bounded by KMSF-admitted qty, conservation, fail-closed timing, distinct incomingId,
// shipment independence. Uses the REAL sibling modules (no stubs).

var KMOOR = require('../js/core/supply-planning-ongoing-order-runtime.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, b, l) { var X = JSON.stringify(a), E = JSON.stringify(b); if (X !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + X); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

var MONTHS = ['2026-09', '2026-10', '2026-11', '2026-12'];  // T1..T4
var RK = 'ResTW||US||Amazon||GA-Amazon', RK2 = 'ResTW||US||Shopify||GA-Shopify';

function po(over) {
  return Object.assign({
    purchase_order_line_id: 'L1', purchase_order_id: 'PO1', request_order_line_id: 'ROL1', sku: 'GA', company: 'ResTW',
    supplier_warehouse_id: 'CN', requested_qty: 100, ordered_qty: 100, completed_qty: 0, shipped_qty: 0,
    expected_completion_date: '2026-09-15'
  }, over || {});
}
function src(marketplace, qty, over) {
  return Object.assign({ request_order_line_id: 'ROL1', company: 'ResTW', country: 'US', marketplace: marketplace, site_sku: 'GA-' + marketplace, requested_qty: qty }, over || {});
}
function fc(marketplace, basis) { return { company: 'ResTW', country: 'US', marketplace: marketplace, siteSku: 'GA-' + marketplace, siteFcBasis: basis }; }
function run(poLines, srcs, fcFacts) {
  return KMOOR.projectOngoingIncomingForSku({ masterSku: 'GA', company: 'ResTW', purchaseOrderLines: poLines, requestOrderLineSources: srcs || [], monthlySiteFcFacts: fcFacts || [], months: MONTHS });
}
function totalIncoming(r) { var t = 0; Object.keys(r.byReceiver).forEach(function (k) { r.byReceiver[k].forEach(function (e) { t += e.qty; }); }); return t; }
function recvTotal(r, rk) { var t = 0; (r.byReceiver[rk] || []).forEach(function (e) { t += e.qty; }); return t; }
function admittedTotal(r) { var t = 0, k; for (k in r.admittedByLineage) t += r.admittedByLineage[k]; return t; }

// ==========================================================================
section('CASE A — ordered 100 / completed 0 / shipped 0 → admitted 100, timed ≤ 100');
(function () {
  var r = run([po()], [src('Amazon', 100)]);
  eq(admittedTotal(r), 100, 'A KMSF admitted 100');
  eq(recvTotal(r, RK), 100, 'A KMOOP alloc + KMOTA timed = 100');
  ok(totalIncoming(r) <= 100, 'A timed ≤ admitted');
  r.byReceiver[RK].forEach(function (e) { ok(e.eta === '2026-09-15' && e.sourceType === 'ONGOING_ORDER', 'A eta/sourceType'); });
})();

section('CASE B — ordered 100 / completed 40 → ongoing admitted 60 (received 40 excluded)');
(function () {
  var r = run([po({ completed_qty: 40 })], [src('Amazon', 100)]);
  eq(admittedTotal(r), 60, 'B admitted 60');
  eq(recvTotal(r, RK), 60, 'B timed 60 — Factory-Current 40 NOT re-counted (no 40+100)');
})();

section('CASE C — ordered 100 / completed 100 → ongoing 0');
(function () {
  var r = run([po({ completed_qty: 100 })], [src('Amazon', 100)]);
  eq(admittedTotal(r), 0, 'C admitted 0');
  eq(totalIncoming(r), 0, 'C no timed incoming');
})();

section('CASE D — ordered 100 / completed 100 / shipped 40 → ongoing 0 (shipped stays Shipment authority)');
(function () {
  var r = run([po({ completed_qty: 100, shipped_qty: 40 })], [src('Amazon', 100)]);
  eq(admittedTotal(r), 0, 'D admitted 0');
  eq(totalIncoming(r), 0, 'D shipped 40 NOT recreated as ongoing');
})();

section('CASE E — fully shipped lifecycle → KMSF emits no committed-production duplicate');
(function () {
  var r = run([po({ completed_qty: 100, shipped_qty: 100 })], [src('Amazon', 100)]);
  eq(admittedTotal(r), 0, 'E nothing admitted (notYetReceived 0)');
  eq(totalIncoming(r), 0, 'E no ongoing duplicate of shipped lineage');
})();

section('CASE F — A1 admitted 60, source shares 70/30 → 42 / 18 (allocatable = admitted, not 100)');
(function () {
  var r = run([po({ completed_qty: 40 })], [src('Amazon', 70), src('Shopify', 30)]);
  eq(admittedTotal(r), 60, 'F admitted 60');
  eq(recvTotal(r, RK), 42, 'F Amazon FLOOR(60×0.7)=42');
  eq(recvTotal(r, RK2), 18, 'F Shopify FLOOR(60×0.3)=18');
})();

section('CASE G — A2 (ordered != requested) company FC shares applied to admitted qty only');
(function () {
  // ordered 60 != requested 100 → A2; admitted = 60; FC basis Amazon 70 / Shopify 30 → 42 / 18.
  var r = run([po({ ordered_qty: 60, requested_qty: 100, completed_qty: 0 })], [], [fc('Amazon', 70), fc('Shopify', 30)]);
  eq(admittedTotal(r), 60, 'G admitted 60');
  eq(recvTotal(r, RK), 42, 'G Amazon FC-share FLOOR(60×0.7)=42');
  eq(recvTotal(r, RK2), 18, 'G Shopify FC-share FLOOR(60×0.3)=18');
})();

section('CASE H — rounding conservation: Σ site incoming ≤ admitted (residual retained, never over)');
(function () {
  var r = run([po({ ordered_qty: 100, completed_qty: 1 })], [src('Amazon', 1), src('Shopify', 2)]);  // 99 over 1/3,2/3
  eq(admittedTotal(r), 99, 'H admitted 99');
  ok(totalIncoming(r) <= 99, 'H Σ timed ≤ admitted (FLOOR + residual)');
})();

section('CASE I — missing expected_completion_date → admitted, but 0 timed incoming + ETA unresolved');
(function () {
  var r = run([po({ expected_completion_date: '' })], [src('Amazon', 100)]);
  eq(admittedTotal(r), 100, 'I still admitted 100 (traceable committed production)');
  eq(totalIncoming(r), 0, 'I 0 timed KMTPP contribution');
  ok(r.issues.some(function (x) { return x.code === 'ONGOING_ORDER_ETA_UNRESOLVED'; }), 'I ONGOING_ORDER_ETA_UNRESOLVED retained');
})();

section('CASE J — two PO lines → distinct incomingId');
(function () {
  var r = run([po({ purchase_order_line_id: 'LA', request_order_line_id: 'RA' }), po({ purchase_order_line_id: 'LB', request_order_line_id: 'RB' })],
    [src('Amazon', 100, { request_order_line_id: 'RA' }), src('Amazon', 100, { request_order_line_id: 'RB' })]);
  var ids = (r.byReceiver[RK] || []).map(function (e) { return e.incomingId; }).sort();
  eq(ids, ['LA||ResTW||US||Amazon||GA-Amazon', 'LB||ResTW||US||Amazon||GA-Amazon'], 'J distinct incomingId per PO line');
})();

section('CASE K — one PO line / multiple receivers → distinct incomingId');
(function () {
  var r = run([po()], [src('Amazon', 70), src('Shopify', 30)]);
  var ids = [].concat(r.byReceiver[RK] || [], r.byReceiver[RK2] || []).map(function (e) { return e.incomingId; }).sort();
  eq(ids, ['L1||ResTW||US||Amazon||GA-Amazon', 'L1||ResTW||US||Shopify||GA-Shopify'], 'K distinct receiver identity under one PO line');
})();

section('CASE L — shipment independence: NO shipment input, ongoing still materializes');
(function () {
  var r = run([po()], [src('Amazon', 100)]);  // no shipments passed anywhere
  eq(recvTotal(r, RK), 100, 'L ongoing independent of shipment feed');
})();

section('M — determinism + input immutability');
(function () {
  var poLines = [po({ completed_qty: 40 })], srcs = [src('Amazon', 70), src('Shopify', 30)];
  var snap = JSON.stringify({ poLines: poLines, srcs: srcs });
  var a = run(poLines, srcs), b = run(poLines, srcs);
  eq(a, b, 'M identical output for identical input');
  eq(JSON.stringify({ poLines: poLines, srcs: srcs }), snap, 'M inputs not mutated');
})();

// ==========================================================================
console.log('\n' + (fail ? ('FAILED ' + fail + ' / ' + (pass + fail)) : ('OK — all ' + pass + ' assertions passed')));
if (fail) process.exit(1);
