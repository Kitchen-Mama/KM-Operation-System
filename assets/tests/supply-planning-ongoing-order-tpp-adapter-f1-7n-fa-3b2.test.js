// Kitchen Mama Operation System — Ongoing-Order → KMTPP incoming adapter (KMOTA) tests — F1-7N-FA-3B2.
// Run: node assets/tests/supply-planning-ongoing-order-tpp-adapter-f1-7n-fa-3b2.test.js
// Proves the narrow Phase-1 boundary adapter: KMOOP siteAllocations + expected_completion_date + tierByMonth →
// KMTPP incoming facts. Covers the 10 round validation cases (quantity via KMOOP, timing/tier/identity via KMOTA),
// fail-closed unresolved timing, outside-horizon (no invented tier), count-once vs Factory Current, determinism,
// input-immutability, the isolated Phase-1 resolver, and an end-to-end feed into the real KMTPP.

var KMOOP = require('../js/core/supply-planning-ongoing-order-projection.js');
var KMOTA = require('../js/core/supply-planning-ongoing-order-tpp-adapter.js');
var KMTPP = require('../js/core/supply-planning-time-phased-projection.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, b, l) { var X = JSON.stringify(a), E = JSON.stringify(b); if (X !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + X); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// Frozen planning window (M+1..M+4 relative to a 2026-08 cycle): tier map identical mechanism to 42_ tierByMonth.
var TIER_BY_MONTH = { '2026-09': 'T1', '2026-10': 'T2', '2026-11': 'T3', '2026-12': 'T4' };

function poLine(o) { return Object.assign({ purchaseOrderLineId: 'L1', purchaseOrderId: 'PO1', sku: 'GA', company: 'ResTW', orderedQty: 100, requestedQty: 100, completedQty: 0, shippedQty: 0, requestOrderLineId: 'ROL1' }, o); }
function src(marketplace, qty, over) { return Object.assign({ requestOrderLineId: 'ROL1', company: 'ResTW', country: 'US', marketplace: marketplace, siteSku: 'GA-' + marketplace, requestedQty: qty }, over || {}); }
function kmoop(lines, sources) { return KMOOP.projectOngoingOrderSupply({ purchaseOrderLines: lines, requestSourceFacts: sources || [], monthlySiteFcFacts: [] }); }
function adapt(lines, sources, timing) { return KMOTA.projectOngoingOrderIncoming({ ongoingProjection: kmoop(lines, sources), poLineTiming: timing || [], tierByMonth: TIER_BY_MONTH }); }
function qtyByMkt(events) { var m = {}; events.forEach(function (e) { m[e.marketplace] = (m[e.marketplace] || 0) + e.qty; }); return m; }

// ==========================================================================
section('CASE 1 — ordered 100, completed 0, valid completion date → 100 Ongoing future supply');
(function () {
  var r = adapt([poLine({ orderedQty: 100, completedQty: 0 })], [src('Amazon', 70), src('Shopify', 30)],
    [{ purchaseOrderLineId: 'L1', expectedCompletionDate: '2026-09-15' }]);
  ok(r.ready, 'ready');
  eq(r.totals.totalIncomingQty, 100, 'total incoming 100');
  eq(r.totals.eventCount, 2, 'two site events');
  eq(qtyByMkt(r.incomingEvents), { Amazon: 70, Shopify: 30 }, 'site split preserved');
  r.incomingEvents.forEach(function (e) { ok(e.availableDate === '2026-09-15', 'availableDate verbatim'); ok(e.sourceType === 'ONGOING_ORDER', 'sourceType'); ok(e.tier === 'T1', 'tier T1 from Sep'); });
})();

section('CASE 2 — ordered 100, completed 40 → only 60 Ongoing future supply');
(function () {
  var r = adapt([poLine({ orderedQty: 100, completedQty: 40 })], [src('Amazon', 70), src('Shopify', 30)],
    [{ purchaseOrderLineId: 'L1', expectedCompletionDate: '2026-09-15' }]);
  eq(r.totals.totalIncomingQty, 60, 'total incoming 60 (received 40 excluded)');
  eq(qtyByMkt(r.incomingEvents), { Amazon: 42, Shopify: 18 }, 'A1 share × 60 (FLOOR)');
})();

section('CASE 3 — ordered 100, completed 100 → 0 Ongoing future supply');
(function () {
  var r = adapt([poLine({ orderedQty: 100, completedQty: 100 })], [src('Amazon', 70), src('Shopify', 30)],
    [{ purchaseOrderLineId: 'L1', expectedCompletionDate: '2026-09-15' }]);
  eq(r.totals.totalIncomingQty, 0, 'no incoming');
  eq(r.totals.eventCount, 0, 'no events');
})();

section('CASE 4 — expected_completion_date blank → fail closed, no timely coverage');
(function () {
  var rBlank = adapt([poLine({ orderedQty: 100, completedQty: 0 })], [src('Amazon', 100)],
    [{ purchaseOrderLineId: 'L1', expectedCompletionDate: '' }]);
  eq(rBlank.totals.eventCount, 0, 'blank → zero events');
  eq(rBlank.totals.unresolvedLines, 1, 'one unresolved line');
  ok(rBlank.issues.some(function (x) { return x.code === 'ONGOING_ORDER_ETA_UNRESOLVED'; }), 'ONGOING_ORDER_ETA_UNRESOLVED (blank)');
  var rMissing = adapt([poLine({ orderedQty: 100, completedQty: 0 })], [src('Amazon', 100)], []);   // no timing fact at all
  eq(rMissing.totals.eventCount, 0, 'missing timing fact → zero events');
  ok(rMissing.issues.some(function (x) { return x.code === 'ONGOING_ORDER_ETA_UNRESOLVED'; }), 'ONGOING_ORDER_ETA_UNRESOLVED (missing)');
  var rBad = adapt([poLine({ orderedQty: 100, completedQty: 0 })], [src('Amazon', 100)],
    [{ purchaseOrderLineId: 'L1', expectedCompletionDate: '2026-09-15T00:00:00Z' }]);   // non-strict ISO
  eq(rBad.totals.eventCount, 0, 'non-strict ISO → zero events');
  ok(rBad.issues.some(function (x) { return x.code === 'ONGOING_ORDER_ETA_UNRESOLVED'; }), 'ONGOING_ORDER_ETA_UNRESOLVED (non-strict ISO, no clock fallback)');
})();

section('CASE 5 — completion date in M+2 → caller tier = T2');
(function () {
  var r = adapt([poLine({ orderedQty: 50, requestedQty: 50, completedQty: 0 })], [src('Amazon', 50)],
    [{ purchaseOrderLineId: 'L1', expectedCompletionDate: '2026-10-03' }]);
  eq(r.incomingEvents[0].tier, 'T2', 'Oct → T2');
})();

section('CASE 6 — request_bucket T1 but completion date M+3 → timing tier T3 (bucket is provenance only)');
(function () {
  // request_bucket is NOT an adapter input at all — timing derives solely from expected_completion_date month.
  var r = adapt([poLine({ orderedQty: 50, requestedQty: 50, completedQty: 0, requestBucket: 'T1' })], [src('Amazon', 50)],
    [{ purchaseOrderLineId: 'L1', expectedCompletionDate: '2026-11-20' }]);
  eq(r.incomingEvents[0].tier, 'T3', 'Nov → T3 (not bucket T1)');
})();

section('CASE 7 — two PO lines same SKU/site/month → separate incomingId lineage');
(function () {
  var lines = [poLine({ purchaseOrderLineId: 'LA', requestOrderLineId: 'ROLA', orderedQty: 40, requestedQty: 40 }),
               poLine({ purchaseOrderLineId: 'LB', requestOrderLineId: 'ROLB', orderedQty: 60, requestedQty: 60 })];
  var sources = [src('Amazon', 40, { requestOrderLineId: 'ROLA' }), src('Amazon', 60, { requestOrderLineId: 'ROLB' })];
  var r = adapt(lines, sources, [
    { purchaseOrderLineId: 'LA', expectedCompletionDate: '2026-09-15' },
    { purchaseOrderLineId: 'LB', expectedCompletionDate: '2026-09-15' }]);
  eq(r.totals.eventCount, 2, 'two distinct events');
  var ids = r.incomingEvents.map(function (e) { return e.incomingId; }).sort();
  eq(ids, ['LA||ResTW||US||Amazon||GA-Amazon', 'LB||ResTW||US||Amazon||GA-Amazon'], 'distinct incomingId per PO line');
})();

section('CASE 8 — same PO line to multiple receivers → receiver-specific identity preserved');
(function () {
  var r = adapt([poLine({ orderedQty: 100, completedQty: 0 })], [src('Amazon', 70), src('Shopify', 30)],
    [{ purchaseOrderLineId: 'L1', expectedCompletionDate: '2026-09-15' }]);
  var ids = r.incomingEvents.map(function (e) { return e.incomingId; }).sort();
  eq(ids, ['L1||ResTW||US||Amazon||GA-Amazon', 'L1||ResTW||US||Shopify||GA-Shopify'], 'distinct receiver identity under one PO line');
  ok(r.incomingEvents.every(function (e) { return e.purchaseOrderLineId === 'L1'; }), 'same poLineId retained');
})();

section('CASE 9 — received qty already in Factory Current must NOT remain Ongoing (count-once)');
(function () {
  // completed=40 already handed off to Factory Current (FA-3B0-PRE). KMOOP excludes it; adapter emits only 60.
  var r = adapt([poLine({ orderedQty: 100, completedQty: 40 })], [src('Amazon', 100)],
    [{ purchaseOrderLineId: 'L1', expectedCompletionDate: '2026-09-15' }]);
  eq(r.totals.totalIncomingQty, 60, 'received 40 not double-counted as Ongoing');
})();

section('CASE 10 — no Shipment exists → Ongoing future supply still materializes');
(function () {
  // No shipment/carrier/transit/destination input anywhere; adapter still produces incoming.
  var r = adapt([poLine({ orderedQty: 100, completedQty: 0 })], [src('Amazon', 100)],
    [{ purchaseOrderLineId: 'L1', expectedCompletionDate: '2026-09-15' }]);
  eq(r.totals.totalIncomingQty, 100, 'ongoing supply independent of shipment');
})();

// ==========================================================================
section('Outside horizon — valid date beyond M+1..M+4 → tier null, qty still carried');
(function () {
  var r = adapt([poLine({ orderedQty: 80, requestedQty: 80, completedQty: 0 })], [src('Amazon', 80)],
    [{ purchaseOrderLineId: 'L1', expectedCompletionDate: '2027-03-10' }]);
  eq(r.totals.eventCount, 1, 'event emitted');
  eq(r.incomingEvents[0].tier, null, 'tier null (no invented T5+)');
  eq(r.incomingEvents[0].qty, 80, 'qty preserved');
})();

section('BLOCKED upstream KMOOP line → no incoming, reason carried');
(function () {
  var r = adapt([poLine({ orderedQty: 100, completedQty: 120 })], [src('Amazon', 100)],
    [{ purchaseOrderLineId: 'L1', expectedCompletionDate: '2026-09-15' }]);
  eq(r.totals.eventCount, 0, 'no events for blocked line');
  eq(r.totals.blockedLines, 1, 'one blocked line');
  ok(r.issues.some(function (x) { return x.code === 'ONGOING_ORDER_LINE_BLOCKED_UPSTREAM'; }), 'blocked reason carried');
})();

section('Phase-1 resolver is isolated + labeled (the Phase-2 swap point)');
(function () {
  eq(KMOTA.resolveOngoingAvailableDate_({ expectedCompletionDate: '2026-09-15' }), { ok: true, availableDate: '2026-09-15', authority: 'PHASE_1_BASELINE_TIMING_AUTHORITY' }, 'resolver ok + labeled');
  ok(KMOTA.resolveOngoingAvailableDate_({ expectedCompletionDate: '' }).code === 'ONGOING_ORDER_ETA_UNRESOLVED', 'resolver blank → unresolved');
  ok(KMOTA.resolveOngoingAvailableDate_({}).code === 'ONGOING_ORDER_ETA_UNRESOLVED', 'resolver missing → unresolved');
  // No clock / no ship-date / no bucket fallback: an object carrying those must still be unresolved without completion date.
  ok(KMOTA.resolveOngoingAvailableDate_({ expectedShipDate: '2026-09-01', requestBucket: 'T1' }).code === 'ONGOING_ORDER_ETA_UNRESOLVED', 'no alternate-field fallback');
  ok(KMOTA.SOURCE_TYPE === 'ONGOING_ORDER', 'source type constant');
})();

section('Determinism + input immutability');
(function () {
  var input = { ongoingProjection: kmoop([poLine({ orderedQty: 100 })], [src('Amazon', 70), src('Shopify', 30)]),
    poLineTiming: [{ purchaseOrderLineId: 'L1', expectedCompletionDate: '2026-09-15' }], tierByMonth: TIER_BY_MONTH };
  var snap = JSON.stringify(input);
  var a = KMOTA.projectOngoingOrderIncoming(input);
  var b = KMOTA.projectOngoingOrderIncoming(input);
  eq(a, b, 'identical output for identical input');
  eq(JSON.stringify(input), snap, 'input not mutated');
})();

section('End-to-end — adapter output feeds real KMTPP, tier rollup + count-once balance');
(function () {
  var r = adapt([poLine({ orderedQty: 100, completedQty: 0 })], [src('Amazon', 70), src('Shopify', 30)],
    [{ purchaseOrderLineId: 'L1', expectedCompletionDate: '2026-09-15' }]);
  var proj = KMTPP.projectTimePhasedSupply({
    openingSupplyQty: 0,
    incomingEvents: r.incomingEvents,
    demandEvents: [{ demandId: 'D1', date: '2026-09-20', qty: 40, tier: 'T1', month: '2026-09' }],
    checkpoints: []
  });
  ok(proj.ready, 'KMTPP consumed adapter events');
  eq(proj.meta.totalIncomingQty, 100, 'KMTPP total incoming 100');
  eq(proj.meta.endingSupplyQty, 60, 'ending balance = 100 − 40 demand');
  var t1 = proj.monthlyProjection.filter(function (m) { return m.tier === 'T1'; })[0];
  ok(t1 && t1.incomingAddedQty === 100, 'T1 incoming attributed 100');
})();

// ==========================================================================
console.log('\n' + (fail ? ('FAILED ' + fail + ' / ' + (pass + fail)) : ('OK — all ' + pass + ' assertions passed')));
if (fail) process.exit(1);
