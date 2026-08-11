// F1-SHIPMENT-MAP-R9 — Shipment lifecycle event history closure.
// Extracts the ACTUAL pure helpers from 31_shipment_receipt_route_handlers.gs (idempotency identity =
// source_event_id; monotonic event_sequence; derived-status → lifecycle-event mapping) plus the existing
// route-move + receipt-derivation owners, and drives §9 fixtures A–L against an in-memory event store that
// mirrors shipAppendLifecycleEvent_'s append-if-absent contract. Also source-scans that both canonical
// commands append via the ONE owner, after their primary writes, with no second event table.
// Run: node assets/tests/shipment-lifecycle-events-f1-shipment-map-r9.test.js

var fs = require('fs');
var path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }

var GS = fs.readFileSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script', '31_shipment_receipt_route_handlers.gs'), 'utf8');
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '('); if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
// status vocabulary consts referenced by the pure helpers
eval(/var SHIP_RECEIPT_PARTIAL_ = '[^']*';/.exec(GS)[0]);
eval(/var SHIP_RECEIPT_FULL_ = '[^']*';/.exec(GS)[0]);
// R9 pure helpers (the real source)
eval(extractFn(GS, 'shipReceiptNum_'));
eval(extractFn(GS, 'shipEventNextSequence_'));
eval(extractFn(GS, 'shipLifecycleEventType_'));
eval(extractFn(GS, 'shipRouteEventSourceId_'));
eval(extractFn(GS, 'shipReceiptEventSourceId_'));
eval(extractFn(GS, 'shipEventShouldAppend_'));
// existing owners that drive real transitions
eval(extractFn(GS, 'shipRouteResolveMove_'));
eval(extractFn(GS, 'shipDeriveReceiptStatus_'));

// ---- in-memory mirror of shipAppendLifecycleEvent_ (append-if-absent, monotonic seq) ----
var SHIP = 'S1';
var store = [];   // {shipmentId, sourceId, type, seq}
function ensureEvent(shipmentId, type, sourceId, extra) {
  var srcIds = [], seqs = [];
  store.forEach(function (e) { if (e.shipmentId === shipmentId) { srcIds.push(e.sourceId); seqs.push(e.seq); } });
  if (!shipEventShouldAppend_(srcIds, sourceId)) return false;
  store.push({ shipmentId: shipmentId, sourceId: sourceId, type: type, seq: shipEventNextSequence_(seqs) });
  return true;
}
function countType(t) { return store.filter(function (e) { return e.shipmentId === SHIP && e.type === t; }).length; }

// A — dispatch already wrote departed_origin exactly once (seed; source_event_id convention 'confirm:<id>')
store.push({ shipmentId: SHIP, sourceId: 'confirm:' + SHIP, type: 'departed_origin', seq: 1 });
eq(countType('departed_origin'), 1, 'A departed_origin present exactly once (unchanged)');

// ---- route fixtures B–E driven through the REAL shipRouteResolveMove_ ----
var nodes = [{ id: 'A', seq: 0, status: 'current' }, { id: 'B', seq: 1, status: 'planned' }, { id: 'C', seq: 2, status: 'planned' }];
function apply(desired) { desired.forEach(function (d) { for (var i = 0; i < nodes.length; i++) if (String(nodes[i].id) === String(d.id)) nodes[i].status = d.status; }); }
function advance(targetId) {
  var mv = shipRouteResolveMove_(nodes, targetId);
  if (!mv.ok) return mv;                                   // ROUTE_BACKWARD / NODE_NOT_IN_ROUTE → nothing appended
  if (mv.code === 'ADVANCED') { apply(mv.desired); ensureEvent(SHIP, 'route_node_reached', shipRouteEventSourceId_(SHIP, targetId)); }
  // IDEMPOTENT → no event (matches handler: only ADVANCED appends)
  return mv;
}

// B — A → B → one route_node_reached(B)
var mvB = advance('B');
eq(mvB.code, 'ADVANCED', 'B move A→B is a forward ADVANCE');
eq(countType('route_node_reached'), 1, 'B one route_node_reached after reaching B');

// C — repeat B → B → zero additional
var mvC = advance('B');
eq(mvC.code, 'IDEMPOTENT', 'C move B→B is idempotent');
eq(countType('route_node_reached'), 1, 'C repeat same node adds no event');

// D — B → C → one more route_node_reached(C)
advance('C');
eq(countType('route_node_reached'), 2, 'D reaching C adds a second route event');

// E — backward C → B → rejected, nothing appended
var mvE = advance('B');
eq(mvE.code, 'ROUTE_BACKWARD', 'E move C→B rejected as backward');
eq(countType('route_node_reached'), 2, 'E backward writes no event');

// guard: even if ADVANCED fired twice for the same target (retry), source_event_id dedups
eq(ensureEvent(SHIP, 'route_node_reached', shipRouteEventSourceId_(SHIP, 'C')), false, 'route event idempotent by source_event_id on retry');

// ---- receipt fixtures F–I driven through the REAL shipDeriveReceiptStatus_ ----
function receiptEvent(lines) {
  var derived = shipDeriveReceiptStatus_(lines);
  var t = shipLifecycleEventType_(derived.status);
  if (t) ensureEvent(SHIP, t, shipReceiptEventSourceId_(SHIP, t), { status: derived.status });
  return derived.status;
}
// F — 0 → partial (line 600/300) → one partial_receipt
eq(receiptEvent([{ shippedQty: 600, received: 300 }]), 'partially_received', 'F derives partially_received');
eq(countType('partial_receipt'), 1, 'F one partial_receipt lifecycle event');
// G — still partial (600/500) → zero additional partial_receipt
receiptEvent([{ shippedQty: 600, received: 500 }]);
eq(countType('partial_receipt'), 1, 'G repeated partial adds no duplicate lifecycle event');
// H — partial → full (600/600) → one received
eq(receiptEvent([{ shippedQty: 600, received: 600 }]), 'received', 'H derives received');
eq(countType('received'), 1, 'H one received event on transition to full');
// I — repeat full save → zero additional received
receiptEvent([{ shippedQty: 600, received: 600 }]);
eq(countType('received'), 1, 'I repeat full save adds no duplicate received event');

// 0 → full directly emits received ONLY (never a spurious partial_receipt) — fresh shipment
(function () {
  var save = store; store = [];   // isolated shipment universe
  var S = 'S2';
  var d = shipDeriveReceiptStatus_([{ shippedQty: 100, received: 100 }]);
  var t = shipLifecycleEventType_(d.status);
  ensureEvent(S, t, shipReceiptEventSourceId_(S, t));
  eq(store.filter(function (e) { return e.type === 'partial_receipt'; }).length, 0, '0→full emits no partial_receipt');
  eq(store.filter(function (e) { return e.type === 'received'; }).length, 1, '0→full emits received once');
  store = save;
})();

// L — event_sequence strictly monotonic across the whole S1 lifecycle (1..N, no gaps/dupes)
var s1seqs = store.filter(function (e) { return e.shipmentId === SHIP; }).map(function (e) { return e.seq; }).sort(function (a, b) { return a - b; });
eq(s1seqs, [1, 2, 3, 4, 5], 'L event_sequence monotonic 1..5 (departed_origin + B + C + partial + received)');

// ---- source scans: ONE owner, wired into BOTH commands, after primary writes; no second table ----
ok(/function shipAppendLifecycleEvent_\(/.test(GS), 'single canonical event appender exists');
ok(/event_type: 'route_node_reached'/.test(GS), 'route.advance appends route_node_reached');
ok(/shipLifecycleEventType_\(derived\.status\)/.test(GS), 'receipt.update maps derived status → lifecycle event');
ok(/fcWriteEnsureSheet_\(ss, 'shipment_events'/.test(GS), 'reuses the EXISTING shipment_events table (no new table)');
ok(!/CREATE TABLE|new .*_events|shipment_event_log|lifecycle_events/.test(GS), 'no second event/timeline store introduced');
// appended AFTER the receipt/status/inventory writes (trailing consequence in the same lock)
ok(GS.indexOf('shipReceiptPostToOverseas_(ss, shipmentId') < GS.indexOf('shipLifecycleEventType_(derived.status)'), 'receipt event appended AFTER inventory posting (trailing, same lock)');
// idempotency identity is source_event_id
ok(/idempotent by source_event_id/i.test(GS), 'idempotency identity documented = source_event_id');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
