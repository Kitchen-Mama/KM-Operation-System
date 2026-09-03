// Kitchen Mama Operation System — PO Receive → Factory Stock count-once lifecycle handoff (F1-7N-FA-3B0-PRE).
// Run: node assets/tests/po-receive-factory-stock-handoff-f1-7n-fa-3b0-pre.test.js
// (A) Evals the PURE receive-line evaluator poReceiptEvaluateLine_ (13_) — factory-warehouse authority, receive
//     ceiling, idempotency decision, and §42 count-once arithmetic. (B) Evals the SHARED factory_stock mutation
//     core factoryStockApplyDeltaTx_ + factoryStockRollbackJournal_ (21_) against an in-memory fake sheet —
//     increment, baseline creation, two-factory isolation, negative fail-closed, atomic rollback, conservation.
//     (C) Source-scans 13_/21_ for the atomic lock + journal rollback + movement lineage + isolation guarantees.
// NOTE: intentionally NOT strict — extracted top-level declarations must bind into this module scope.

var fs = require('fs');
var path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function slice(src, m1, m2) { var a = src.indexOf(m1), b = src.indexOf(m2); if (a < 0 || b < 0) throw new Error('markers not found: ' + m1 + ' / ' + m2); return src.slice(a, b); }
function extractFn(src, name) {
  var start = src.indexOf('function ' + name);
  if (start < 0) throw new Error('fn not found: ' + name);
  var i = src.indexOf('{', start), depth = 0, j = i;
  for (; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}') { depth--; if (depth === 0) { j++; break; } } }
  return src.slice(start, j);
}

var GS13 = read('specs/active/apps-script/13_procurement_handlers.gs');
var GS21 = read('specs/active/apps-script/21_factory_inventory_handlers.gs');
var GS14 = read('specs/active/apps-script/14_fc_write_handlers.gs');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, b, l) { var X = JSON.stringify(a), E = JSON.stringify(b); if (X !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + X); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// ---- global stubs for the imperative core ----
var _uuid = 0;
global.SpreadsheetApp = { flush: function () {} };
global.Utilities = { getUuid: function () { return 'uuid-' + (++_uuid); } };

// ---- eval PURE evaluator (13_) ----
var PURE = slice(GS13, '// __PORCV_PURE_START__', '// __PORCV_PURE_END__');
ok(PURE.length > 0, 'markers: PORCV pure block present');
eval(PURE);
ok(typeof poReceiptEvaluateLine_ === 'function', 'eval poReceiptEvaluateLine_');
ok(typeof poRcvTruthy_ === 'function', 'eval poRcvTruthy_');

// ---- eval SHARED core (21_) + real fcWriteAppendByHeader_ (14_) ----
eval(extractFn(GS14, 'fcWriteAppendByHeader_'));
var CORE = slice(GS21, '// __FACTORY_APPLY_DELTA_START__', '// __FACTORY_APPLY_DELTA_END__');
eval(CORE);
ok(typeof factoryStockApplyDeltaTx_ === 'function', 'eval factoryStockApplyDeltaTx_');
ok(typeof factoryStockRollbackJournal_ === 'function', 'eval factoryStockRollbackJournal_');

// ---- in-memory fake sheet ----
function makeSheet(headers, rows) {
  var grid = [headers.slice()].concat((rows || []).map(function (r) { return r.slice(); }));
  var self = {
    _grid: grid, _throwOnAppend: false,
    getDataRange: function () { return { getValues: function () { return grid.map(function (r) { return r.slice(); }); } }; },
    getLastRow: function () { return grid.length; },
    getLastColumn: function () { return grid[0].length; },
    getRange: function (row, col, nr, nc) {
      return {
        getValues: function () { var out = []; for (var i = 0; i < (nr || 1); i++) out.push(grid[row - 1 + i].slice(col - 1, col - 1 + (nc || 1))); return out; },
        getValue: function () { return grid[row - 1][col - 1]; },
        setValue: function (v) { grid[row - 1][col - 1] = v; }
      };
    },
    appendRow: function (arr) { if (self._throwOnAppend) throw new Error('forced append failure'); grid.push(arr.slice()); },
    deleteRow: function (rn) { grid.splice(rn - 1, 1); }
  };
  return self;
}
var STOCK_H = ['factory_stock_id', 'warehouse_id', 'sku', 'fac_current_stock', 'fac_reserved_stock', 'last_transaction_at', 'created_at', 'updated_at'];
var MOV_H = ['factory_stock_movement_id', 'movement_date', 'sku', 'warehouse_id', 'movement_type', 'qty', 'related_entity_type', 'related_entity_id', 'before_current_stock', 'after_current_stock', 'before_reserved_stock', 'after_reserved_stock', 'note', 'created_by', 'created_at'];
function stockRowsToMap(sheet) {
  var g = sheet._grid, H = g[0], m = {};
  for (var i = 1; i < g.length; i++) m[g[i][H.indexOf('warehouse_id')] + '|' + g[i][H.indexOf('sku')]] = Math.round(g[i][H.indexOf('fac_current_stock')]);
  return m;
}
function apply(stock, mov, wh, sku, delta, journal) {
  return factoryStockApplyDeltaTx_({ stockSheet: stock, movSheet: mov, warehouseId: wh, sku: sku, deltaQty: delta,
    movementType: 'po_receipt', relatedEntityType: 'purchase_order_receipt', relatedEntityId: 'POL-1',
    note: 'po_receipt|po=PO1|key=K1', createdBy: 'tester', now: '2026-08-20', journal: journal || [] });
}

// ==========================================================================
section('A. PURE evaluator — count-once arithmetic + conservation (Phase 12 #1-#6)');
(function () {
  var whOK = { isActive: true, isFactory: true };
  function ev(ordered, completed, shipped, recv) { return poReceiptEvaluateLine_({ ordered: ordered, completed: completed, shipped: shipped, sku: 'GA', supplierWarehouseId: 'CN', warehouse: whOK, recvQtyRaw: recv, alreadyApplied: false }); }
  var a = ev(1000, 0, 0, 400);
  eq(a.status, 'apply', 'A recv 400 → apply'); eq(a.newCompleted, 400, 'A completed 400'); eq(a.recvQty, 400, 'A recvQty 400');
  eq(a.notYetReceivedCommittedQty, 600, 'A ongoing 600'); eq(a.completedNotShippedQty, 400, 'A completedNotShipped 400'); eq(a.shippedQty, 0, 'A shipped 0');
  ok(a.notYetReceivedCommittedQty + a.completedNotShippedQty + a.shippedQty === 1000, 'A conservation = ordered (no double count)');
  var b = ev(1000, 300, 300, 400); // partial receive + partial shipment
  eq(b.newCompleted, 700, 'B completed 700'); eq(b.notYetReceivedCommittedQty, 300, 'B ongoing 300'); eq(b.completedNotShippedQty, 400, 'B completedNotShipped 400'); eq(b.shippedQty, 300, 'B shipped 300');
  ok(b.notYetReceivedCommittedQty + b.completedNotShippedQty + b.shippedQty === 1000, 'B conservation = ordered');
  var full = ev(1000, 600, 0, 400); eq(full.newCompleted, 1000, 'full completed 1000'); eq(full.notYetReceivedCommittedQty, 0, 'full ongoing 0'); eq(full.completedNotShippedQty, 1000, 'full completedNotShipped 1000');
  var over = ev(1000, 700, 0, 500); eq(over.recvQty, 300, 'over-receive clamped to 300'); eq(over.newCompleted, 1000, 'over clamp → completed 1000');
  eq(ev(1000, 1000, 0, 10).status, 'skip', 'fully received → skip');
})();

section('B. PURE evaluator — factory warehouse authority fail-closed (Phase 12 E/F)');
(function () {
  function ev(o) { return poReceiptEvaluateLine_(Object.assign({ ordered: 100, completed: 0, shipped: 0, sku: 'GA', recvQtyRaw: 10 }, o)); }
  eq(ev({ supplierWarehouseId: '', warehouse: null }).issue, 'PO_RECEIVE_FACTORY_WAREHOUSE_UNRESOLVED', 'blank warehouse → fail closed');
  eq(ev({ supplierWarehouseId: 'CN', warehouse: null }).issue, 'PO_RECEIVE_FACTORY_WAREHOUSE_UNRESOLVED', 'warehouse not found → fail closed');
  eq(ev({ supplierWarehouseId: 'CN', warehouse: { isActive: false, isFactory: true } }).issue, 'PO_RECEIVE_FACTORY_WAREHOUSE_UNRESOLVED', 'inactive warehouse → fail closed');
  eq(ev({ supplierWarehouseId: 'CN', warehouse: { isActive: true, isFactory: false } }).issue, 'PO_RECEIVE_FACTORY_WAREHOUSE_UNRESOLVED', 'non-factory warehouse → fail closed');
  eq(ev({ supplierWarehouseId: 'CN', warehouse: { isActive: true, isFactory: true }, sku: '' }).issue, 'PO_RECEIVE_SKU_MISSING', 'blank sku → fail closed');
})();

section('C. PURE evaluator — invalid qty + idempotency decision (Phase 12 J/K/L)');
(function () {
  var whOK = { isActive: true, isFactory: true };
  function ev(o) { return poReceiptEvaluateLine_(Object.assign({ ordered: 100, completed: 0, shipped: 0, sku: 'GA', supplierWarehouseId: 'CN', warehouse: whOK }, o)); }
  eq(ev({ recvQtyRaw: 0 }).status, 'skip', 'recv 0 → skip'); eq(ev({ recvQtyRaw: -5 }).status, 'skip', 'recv negative → skip'); eq(ev({ recvQtyRaw: NaN }).status, 'skip', 'recv NaN → skip');
  eq(ev({ recvQtyRaw: 40, alreadyApplied: true }).status, 'skip_idempotent', 'same key already applied → skip_idempotent (J)');
  eq(ev({ recvQtyRaw: 40, alreadyApplied: false }).status, 'apply', 'different/new key → apply (K)');
  eq(poRcvTruthy_('TRUE'), true, 'truthy TRUE'); eq(poRcvTruthy_('x'), true, 'truthy x'); eq(poRcvTruthy_('no'), false, 'falsy no'); eq(poRcvTruthy_(''), false, 'falsy blank');
})();

section('D. SHARED core — increment + baseline creation + movement (Phase 12 A/B/D/S)');
(function () {
  var stock = makeSheet(STOCK_H, []); var mov = makeSheet(MOV_H, []);
  apply(stock, mov, 'CN', 'GA', 400);   // A: baseline row created (S)
  eq(stockRowsToMap(stock)['CN|GA'], 400, 'A first receive → factory stock 400 (baseline created)');
  eq(mov._grid.length, 2, 'A one movement row appended');
  apply(stock, mov, 'CN', 'GA', 300);   // B: accumulate
  eq(stockRowsToMap(stock)['CN|GA'], 700, 'B second receive → 700');
  eq(mov._grid.length, 3, 'B two movement rows total');
  var last = mov._grid[mov._grid.length - 1];
  eq(last[MOV_H.indexOf('movement_type')], 'po_receipt', 'movement_type po_receipt');
  eq(last[MOV_H.indexOf('related_entity_type')], 'purchase_order_receipt', 'related_entity_type lineage');
  eq(last[MOV_H.indexOf('related_entity_id')], 'POL-1', 'related_entity_id = PO line lineage');
  eq(last[MOV_H.indexOf('qty')], 300, 'movement qty 300'); eq(last[MOV_H.indexOf('before_current_stock')], 400, 'before 400'); eq(last[MOV_H.indexOf('after_current_stock')], 700, 'after 700');
  eq(last[MOV_H.indexOf('before_reserved_stock')], 0, 'reserved untouched');
})();

section('E. SHARED core — two-factory isolation + conservation (Phase 12 Q/R)');
(function () {
  var stock = makeSheet(STOCK_H, [['FS-CN-GA', 'CN', 'GA', 100, 0, '', '', '']]); var mov = makeSheet(MOV_H, []);
  apply(stock, mov, 'TW', 'GA', 50);
  var m = stockRowsToMap(stock);
  eq(m['CN|GA'], 100, 'Q receipt to TW did not change CN'); eq(m['TW|GA'], 50, 'Q TW factory row = 50');
  apply(stock, mov, 'CN', 'GA', 25);
  eq(stockRowsToMap(stock)['CN|GA'], 125, 'R CN conserved + incremented to 125'); eq(stockRowsToMap(stock)['TW|GA'], 50, 'R TW unchanged');
})();

section('F. SHARED core — negative fail-closed + atomic rollback (Phase 12 G/H/I, #7)');
(function () {
  var stock = makeSheet(STOCK_H, [['FS-CN-GA', 'CN', 'GA', 30, 0, '', '', '']]); var mov = makeSheet(MOV_H, []);
  var threw = false; try { apply(stock, mov, 'CN', 'GA', -100); } catch (e) { threw = true; }
  ok(threw, 'negative resulting stock → throws (fail closed)');
  eq(stockRowsToMap(stock)['CN|GA'], 30, 'stock unchanged after negative-guard throw');
  // movement-append failure AFTER stock write → caller rollback restores stock + removes any appended row
  var stock2 = makeSheet(STOCK_H, [['FS-CN-GA', 'CN', 'GA', 200, 0, 'old', 'c', 'u']]); var mov2 = makeSheet(MOV_H, []);
  mov2._throwOnAppend = true;
  var journal = []; var caught = false;
  try { apply(stock2, mov2, 'CN', 'GA', 40, journal); } catch (e) { caught = true; }
  ok(caught, 'movement append failure throws');
  factoryStockRollbackJournal_(journal);
  eq(stockRowsToMap(stock2)['CN|GA'], 200, 'I stock rolled back to 200 (no partial handoff)');
  eq(mov2._grid.length, 1, 'I no movement row survives (header only)');
  // simulate the handler journaling a PO-line cell too → full rollback restores PO cell + stock baseline row
  var poSheet = makeSheet(['purchase_order_line_id', 'completed_qty'], [['POL-1', 300]]); var stock3 = makeSheet(STOCK_H, []); var mov3 = makeSheet(MOV_H, []); mov3._throwOnAppend = true;
  var j2 = [];
  poSheet.getRange(2, 2).setValue(700); j2.push({ kind: 'cell', sheet: poSheet, row: 2, col: 1, prev: 300 });
  var c2 = false; try { apply(stock3, mov3, 'CN', 'GA', 400, j2); } catch (e) { c2 = true; }
  ok(c2, 'combined PO+stock write fails');
  factoryStockRollbackJournal_(j2);
  eq(poSheet._grid[1][1], 300, 'H PO completed_qty rolled back to 300');
  eq(stock3._grid.length, 1, 'H created stock baseline row removed on rollback (header only)');
})();

section('G. SOURCE — atomic lock + journal rollback + lineage + isolation (Phase 5/18)');
(function () {
  var rcv = extractFn(GS13, 'handleReceivePurchaseOrderLines_');
  ok(/LockService\.getScriptLock\(\)/.test(rcv), 'receive acquires a script lock (atomic)');
  ok(/factoryStockApplyDeltaTx_\(/.test(rcv), 'receive delegates to the SHARED factory core (no duplicate writer)');
  ok(/factoryStockRollbackJournal_\(journal\)/.test(rcv), 'receive rolls back the journal on failure');
  ok(/'po_receipt'/.test(rcv) && /'purchase_order_receipt'/.test(rcv), 'receive posts po_receipt movement with PO-line lineage');
  ok(/is_factory_warehouse/.test(rcv) && /warehouseById/.test(rcv), 'receive validates factory warehouse via warehouses index');
  ok(/PO_RECEIVE_FACTORY_WAREHOUSE_UNRESOLVED/.test(PURE) && /ev\.status === 'error'/.test(rcv), 'receive fails closed on unresolved factory warehouse');
  ok(/idempotency_key/.test(rcv) && /receiptAlreadyApplied_/.test(rcv), 'receive supports idempotency_key dedupe');
  // Isolation (Phase 18): receive must NOT call KMFSR / allocation / shipment / request-order creation.
  ok(!/KMFSR|projectSurplusReallocation/.test(rcv), 'ISO receive does not call KMFSR');
  ok(!/allocateFactory|allocateOverseas|projectAllocation/.test(rcv), 'ISO receive performs no site/factory allocation');
  ok(!/createShipmentFromPlan|handleConfirmShipment|shipment_line_allocations/.test(rcv), 'ISO receive creates no shipment');
  ok(!/createRequestOrder|request_order_allocation_draft/.test(rcv), 'ISO receive creates no request order / draft allocation');
  var coreSrc = extractFn(GS21, 'factoryStockApplyDeltaTx_');
  // F1-7N-FC-1A — SCOPED TO THE RECEIPT. This asserted that the shared core NEVER writes the reserved
  // column, which was true of the entire system before FC-1A (the FC-0A audit measured that nothing had ever
  // written a non-zero fac_reserved_stock, which is precisely why two sites could plan the same units). The
  // core can now move reserved — but ONLY when a caller asks it to with a non-zero reservedDelta, and
  // the PO receipt does not. That is the property this suite is about, and it is now asserted against the
  // receipt itself rather than against a core that legitimately gained a second capability.
  ok(/resCol/.test(coreSrc), 'core reads the reserved column (available stays derived)');
  ok(/if \(resDelta !== 0\) \{/.test(coreSrc),
    'core writes reserved ONLY on an explicit non-zero reservedDelta — never as a side effect');
  ok(!/reservedDelta/.test(rcv),
    'and the PO receipt passes NO reservedDelta, so a receipt leaves every reservation untouched (reserved untouched)');
})();

// ==========================================================================
console.log('');
if (fail) { console.error('\n' + fail + ' assertion(s) FAILED (' + pass + ' passed).'); process.exit(1); }
console.log('All F1-7N-FA-3B0-PRE PO-receive handoff assertions passed (' + pass + ' assertions).');
