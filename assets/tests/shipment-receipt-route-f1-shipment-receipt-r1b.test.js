// F1-SHIPMENT-RECEIPT-R1B — Shipment Receipt + Route Progress backend contract.
// Evals the PURE block of 31_shipment_receipt_route_handlers.gs verbatim (no re-implementation) and drives
// the spec fixtures A–N, plus source-scan guards for the negative constraints (no duplicate received field,
// no shipments.current_route_node_id, shipment_qty never written, no inventory posting, no 2nd shipments
// writer, frontend cannot author status, router + adapters wired, contract drift repaired).
// Run: node assets/tests/shipment-receipt-route-f1-shipment-receipt-r1b.test.js

var fs = require('fs');
var path = require('path');

var fail = 0, pass = 0;
function ok(cond, label) { if (cond) { pass++; console.log('ok   ' + label); } else { fail++; console.error('FAIL ' + label); } }
function eq(a, e, label) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('ok   ' + label); } else { fail++; console.error('FAIL ' + label + '\n  exp ' + E + '\n  got ' + A); } }

var GS_DIR = path.join(__dirname, '..', 'specs', 'active', 'apps-script');
var SRC31 = fs.readFileSync(path.join(GS_DIR, '31_shipment_receipt_route_handlers.gs'), 'utf8');
var SRC12 = fs.readFileSync(path.join(GS_DIR, '12_shipment_handlers.gs'), 'utf8');
var SRC01 = fs.readFileSync(path.join(GS_DIR, '01_router.gs'), 'utf8');
var API = fs.readFileSync(path.join(__dirname, '..', 'js', 'api', 'operation-system-db-api.js'), 'utf8');
var MAP = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'global-logistics-map.js'), 'utf8');

// ---- extract + eval the PURE block (sloppy mode so eval'd fn declarations leak into this scope) ----
var pure = SRC31.split('__SHIP_RECEIPT_PURE_START__')[1].split('__SHIP_RECEIPT_PURE_END__')[0];
pure = pure.slice(pure.indexOf('\n') + 1);   // drop the remainder of the START-marker comment line
eval('var SHIP_RECEIPT_PARTIAL_="partially_received"; var SHIP_RECEIPT_FULL_="received";\n' + pure);

// =========================================================
// Fixture A — schema-drift normalization (blank/null → 0)
// =========================================================
eq(shipReceiptNum_(''), 0, 'A blank → 0');
eq(shipReceiptNum_(null), 0, 'A null → 0');
eq(shipReceiptNum_(undefined), 0, 'A undefined → 0');
eq(shipReceiptNum_('300'), 300, 'A string "300" → 300');
eq(shipReceiptNum_(300), 300, 'A numeric 300 → 300');
eq(shipReceiptNum_('x'), 0, 'A non-numeric → 0');

// =========================================================
// Fixtures B–F — cumulative / idempotent / incremental / backward / over-receipt
// =========================================================
eq(shipReceiptValidateLine_(0, 300, 600), { ok: true, code: 'OK', delta: 300 }, 'B cumulative 0→300 delta 300');
eq(shipReceiptValidateLine_(300, 300, 600).delta, 0, 'C idempotent 300→300 delta 0');
ok(shipReceiptValidateLine_(300, 300, 600).ok === true, 'C idempotent ok');
eq(shipReceiptValidateLine_(300, 500, 600), { ok: true, code: 'OK', delta: 200 }, 'D incremental 300→500 delta 200');
eq(shipReceiptValidateLine_(500, 300, 600).code, 'RECEIPT_BACKWARD', 'E backward 500→300 fail closed');
ok(shipReceiptValidateLine_(500, 300, 600).ok === false, 'E backward not ok');
eq(shipReceiptValidateLine_(0, 700, 600).code, 'RECEIPT_OVER', 'F over-receipt 0→700 (shipped 600) fail');
eq(shipReceiptValidateLine_(500, 700, 600).code, 'RECEIPT_OVER', 'F over-receipt 500→700 (shipped 600) fail');
eq(shipReceiptValidateLine_(0, 'abc', 600).code, 'INVALID_QTY', 'F non-numeric → INVALID_QTY');
eq(shipReceiptValidateLine_(0, -5, 600).code, 'INVALID_QTY', 'F negative → INVALID_QTY');
eq(shipReceiptValidateLine_(0, 600, 600), { ok: true, code: 'OK', delta: 600 }, 'boundary received == shipped ok');

// =========================================================
// Fixtures G,H,I,J + zero/none — status derivation
// =========================================================
var G = [{ shippedQty: 500, received: 500 }, { shippedQty: 800, received: 800 }, { shippedQty: 300, received: 300 }, { shippedQty: 600, received: 300 }];
eq(shipDeriveReceiptStatus_(G).status, 'partially_received', 'G partial shipment → partially_received');
var H = [{ shippedQty: 500, received: 500 }, { shippedQty: 800, received: 0 }];
eq(shipDeriveReceiptStatus_(H).status, 'partially_received', 'H mixed full + zero → partially_received');
var I = [{ shippedQty: 500, received: 500 }, { shippedQty: 800, received: 800 }, { shippedQty: 300, received: 300 }, { shippedQty: 600, received: 600 }];
eq(shipDeriveReceiptStatus_(I).status, 'received', 'I all full → received');
var Z = [{ shippedQty: 500, received: 0 }, { shippedQty: 800, received: 0 }];
eq(shipDeriveReceiptStatus_(Z), { status: '', reason: 'none_received' }, 'all zero → no receipt status (retain lifecycle)');
eq(shipDeriveReceiptStatus_([]), { status: '', reason: 'no_lines' }, 'no lines → no receipt status');
// J — final route point alone must NOT produce received: derivation depends only on qty (route not an input).
eq(shipDeriveReceiptStatus_(G).status, 'partially_received', 'J final-route partial stays partially_received (route irrelevant to status)');

// =========================================================
// Fixtures K,L,M,N + NODE_NOT_IN_ROUTE — route advance
// =========================================================
function nodes(cur) {
  return [
    { id: 'n1', seq: 1, status: 1 === cur ? 'current' : (1 < cur ? 'completed' : 'planned') },
    { id: 'n2', seq: 2, status: 2 === cur ? 'current' : (2 < cur ? 'completed' : 'planned') },
    { id: 'n3', seq: 3, status: 3 === cur ? 'current' : (3 < cur ? 'completed' : 'planned') },
    { id: 'n4', seq: 4, status: 4 === cur ? 'current' : (4 < cur ? 'completed' : 'planned') },
    { id: 'n5', seq: 5, status: 5 === cur ? 'current' : (5 < cur ? 'completed' : 'planned') }
  ];
}
var K = shipRouteResolveMove_(nodes(3), 'n4');
eq(K.code, 'ADVANCED', 'K node3→node4 ADVANCED');
eq(K.desired.map(function (n) { return n.status; }), ['completed', 'completed', 'completed', 'current', 'planned'], 'K 1-3 completed, 4 current, 5 planned');
eq(K.changed, [{ id: 'n3', status: 'completed' }, { id: 'n4', status: 'current' }], 'K only n3+n4 change');
var L = shipRouteResolveMove_(nodes(4), 'n4');
eq(L.code, 'IDEMPOTENT', 'L same node → idempotent no-op');
eq(L.changed, [], 'L no changes on idempotent');
var M = shipRouteResolveMove_(nodes(4), 'n3');
eq(M, { ok: false, code: 'ROUTE_BACKWARD' }, 'M backward 4→3 fail closed');
// N — exactly one current after any successful resolve
[nodes(3), nodes(1), nodes(4)].forEach(function (nd, i) {
  var mv = shipRouteResolveMove_(nd, 'n5');
  var currents = mv.desired.filter(function (n) { return n.status === 'current'; }).length;
  eq(currents, 1, 'N exactly one current after advance to n5 (case ' + i + ')');
});
eq(shipRouteResolveMove_(nodes(3), 'ZZ'), { ok: false, code: 'NODE_NOT_IN_ROUTE' }, 'route target not in route → NODE_NOT_IN_ROUTE');
// advance to any later node (skip) is allowed by the completed/current/planned semantics
eq(shipRouteResolveMove_(nodes(2), 'n5').desired.map(function (n) { return n.status; }), ['completed', 'completed', 'completed', 'completed', 'current'], 'advance 2→5 marks all earlier completed');

// =========================================================
// Receiving-capable node authority (deterministic)
// =========================================================
eq(shipReceivingCapableNodeId_([{ id: 'a', seq: 1 }, { id: 'b', seq: 2 }, { id: 'c', seq: 3 }]), 'c', 'receiving-capable → terminal node (structural)');
eq(shipReceivingCapableNodeId_([{ id: 'a', seq: 1, nodeType: 'port' }, { id: 'b', seq: 2, nodeType: 'destination_warehouse' }, { id: 'c', seq: 3, nodeType: 'customs' }]), 'b', 'receiving-capable → last warehouse/receiving node when present');
eq(shipReceivingCapableNodeId_([]), '', 'receiving-capable → empty when no nodes');

// =========================================================
// Source-scan guards — negative constraints & wiring
// =========================================================
// contract drift repaired: 12_ header contract + frontend read model carry the LIVE column name.
ok(/SHIPMENT_LINES_HEADERS_[\s\S]*shipment_received_qty/.test(SRC12), 'contract: SHIPMENT_LINES_HEADERS_ now includes shipment_received_qty');
ok(/shipmentReceivedQty/.test(API) && /remainingQty/.test(API), 'contract: frontend normalizer maps shipmentReceivedQty + derived remainingQty');
// no duplicate received field / no inventory_status / no new current-route field / no new table.
ok(!/\bqty_received\b/.test(SRC31), 'no duplicate qty_received field');
ok(!/\binventory_status\b/.test(SRC31), 'no inventory_status field introduced');
// quoted form = an actual column reference (col()/object key/setValue); prose in comments is allowed.
ok(!/['"]current_route_node_id['"]/.test(SRC31) && !/['"]current_route_node_id['"]/.test(SRC12), 'no shipments.current_route_node_id field/column added');
ok(!/CREATE TABLE|new ledger|receipt_ledger|route_state/i.test(SRC31), 'no new table / ledger created');
// shipment_qty immutability: the receipt writer writes the received column, NEVER the qty column.
ok(/lRecvCol \+ 1\)\.setValue/.test(SRC31), 'receipt writer writes shipment_received_qty cell');
ok(!/lQtyCol \+ 1\)\.setValue/.test(SRC31), 'receipt writer NEVER writes the shipment_qty cell (immutable)');
// backend derives status (never trusts frontend); no 2nd shipments CRUD writer (no append to shipments).
ok(/shipDeriveReceiptStatus_\(authoritative\)/.test(SRC31), 'status is backend-derived from authoritative lines');
ok(!/shipmentAppendByHeader_/.test(SRC31), 'no second shipments writer (no append) in receipt module');
// no inventory / factory-stock / PO / forecast mutation from this module.
ok(!/factory_stock|overseas_inventory|amazon_inventory|purchase_order|fc_regular_forecast/.test(SRC31), 'no inventory/PO/forecast mutation in receipt module');
// router wiring.
ok(/shipment\.receipt\.update/.test(SRC01) && /handleUpdateShipmentReceipt_/.test(SRC01), 'router wires shipment.receipt.update');
ok(/shipment\.route\.advance/.test(SRC01) && /handleAdvanceShipmentRoutePoint_/.test(SRC01), 'router wires shipment.route.advance');
// frontend adapters exist and hit the canonical actions.
ok(/updateShipmentReceipt\s*=\s*async/.test(API) && /'shipment\.receipt\.update'/.test(API), 'adapter updateShipmentReceipt → shipment.receipt.update');
ok(/advanceShipmentRoutePoint\s*=\s*async/.test(API) && /'shipment\.route\.advance'/.test(API), 'adapter advanceShipmentRoutePoint → shipment.route.advance');
// frontend cannot author shipment status: the receipt/route payloads never send a status field.
function between(src, start, end) { var i = src.indexOf(start); if (i < 0) return ''; var j = src.indexOf(end, i); return j < 0 ? src.slice(i) : src.slice(i, j); }
var recvCall = between(MAP, 'updateShipmentReceipt({', '})');
ok(recvCall && !/status/.test(recvCall), 'map receipt payload sends no status field (frontend not status authority)');
var routeCall = between(MAP, 'advanceShipmentRoutePoint({', '})');
ok(routeCall && !/status/.test(routeCall), 'map route payload sends no status field');
ok(!/shipments\.status\s*=/.test(MAP), 'map never assigns shipments.status directly');
// map route selector options come from canonical shipment_routes nodes (data-route-select) — not free text.
ok(/data-route-select/.test(MAP) && /nodeIdentity\(n\)/.test(MAP), 'map route selector options are canonical node identities');
// map loads shipment_lines for the receiving table.
ok(/getShipmentLines/.test(MAP) && /linesByShip/.test(MAP), 'map loads shipment_lines + indexes by shipment for the receiving table');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
