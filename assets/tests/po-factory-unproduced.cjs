'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { world, plain } = require('./helpers/po-factory-unproduced-world.cjs');
function dispatchPlan(h, qty = 30) {
  const l = h.rows('purchase_order_lines')[0];
  h.sheet('shipment_plan_links', h.c.SC13_LINK_HEADERS_);
  h.sheet('shipments', ['shipment_id', 'status', 'note'], [{ shipment_id: 'SHIP-TEST', status: 'ready_to_ship' }]);
  h.sheet('shipment_lines', ['shipment_id', 'shipment_line_id', 'shipment_qty', 'sku', 'note'], [{ shipment_id: 'SHIP-TEST', shipment_line_id: 'SL-TEST', shipment_qty: qty, sku: l.sku }]);
  h.sheet('shipment_line_allocations', ['shipment_line_allocation_id', 'shipment_line_id', 'purchase_order_line_id', 'allocated_qty', 'allocation_status', 'updated_at'],
    [{ shipment_line_allocation_id: 'AL-TEST', shipment_line_id: 'SL-TEST', purchase_order_line_id: l.purchase_order_line_id, allocated_qty: qty, allocation_status: 'draft' }]);
  return h.c.slaPrepareExecution_(h.ss, 'SHIP-TEST');
}
test('new template exposes Chinese unproduced quantity and technical aliases; other modes keep their contract', () => {
  const h = world();
  for (const mode of ['NEW_RECEIPT', 'UPDATE_REMAINING', 'OPENING_PO_FOR_EXISTING_STOCK']) {
    const t = h.c.handleImportTemplateGet_({ domain: 'po_factory_stock', mode, scope: { warehouse_id: 'FACTORY-A' } });
    assert.equal(t.success, true, JSON.stringify(t));
    const field = t.sheets[0].columns.find(c => c.key === 'unproduced_qty');
    assert.equal(!!field, mode === 'NEW_RECEIPT');
    if (field) { assert(field.header.includes('\u672a\u751f\u7522\u6578\u91cf')); assert(field.aliases.includes('unproduced_qty')); assert.equal(field.type, 'int'); assert.equal(field.required, false); }
  }
});
for (const [q, pending, ordered, completed, consumed, status] of [
  [200, 300, 1000, 700, 500, 'partial_completed'], [200, 800, 1000, 200, 0, 'partial_completed'],
  [200, 0, 1000, 1000, 800, 'completed'], [0, 1000, 1000, 0, 0, 'issued'], [0, 300, 1000, 700, 700, 'partial_completed']
]) test('import stock=' + q + ', unproduced=' + pending + ' retains ordered ' + ordered + ' and only posts real stock', () => {
  const h = world(), b = h.body({ quantity: q, unproduced_qty: pending, ordered_qty: ordered });
  const before = h.writes(), v = h.c.handleImportValidate_(b); assert.equal(v.valid, true, JSON.stringify(v)); assert.equal(h.writes(), before);
  const { req } = h.commit(b), line = h.rows('purchase_order_lines')[0], po = h.rows('purchase_orders')[0];
  assert.equal(line.ordered_qty, ordered); assert.equal(line.completed_qty, completed); assert.equal(line.shipped_qty, consumed); assert.equal(line.remaining_qty, q);
  assert.equal(line.opening_lineage_qty, 0); assert.equal(po.order_status, status); assert.equal(po.source_type, 'po_factory_import');
  assert.equal(h.rows('factory_stock')[0]?.fac_current_stock || 0, q);
  assert.equal(h.rows('factory_stock_movements').length, q > 0 ? 1 : 0);
  assert.deepEqual(plain(h.c.slaFactoryImportConsumed_(h.ss, line.purchase_order_line_id)), { ok: true, qty: consumed });
  const writes = h.writes(); assert.equal(h.c.handleImportCommit_(req).replayed, true); assert.equal(h.writes(), writes);
});
for (const values of [{ quantity: 800, unproduced_qty: 201 }, { quantity: 0, unproduced_qty: 1001 },
  { unproduced_qty: -1 }, { unproduced_qty: 1.5 }, { unproduced_qty: true }, { unproduced_qty: 'abc' },
  { quantity: -1 }, { quantity: 0, unproduced_qty: 0 }]) test('invalid combined quantity is refused before writes: ' + JSON.stringify(values), () => {
  const h = world(), before = h.writes(), v = h.c.handleImportValidate_(h.body(values));
  assert.equal(v.valid, false, JSON.stringify(v)); assert.equal(h.writes(), before); assert.equal(h.rows('purchase_orders').length, 0);
});
test('blank or absent new column keeps legacy receipt counters and stock', () => {
  for (const blank of ['', undefined]) { const h = world(); h.commit(h.body({ unproduced_qty: blank }));
    const l = h.rows('purchase_order_lines')[0]; assert.equal(l.completed_qty, 200); assert.equal(l.shipped_qty, 0); assert.equal(l.remaining_qty, 200); }
});
test('partial import is immediately receivable and later receipt adds exactly unproduced amount once', () => {
  const h = world(); h.commit(h.body());
  const before = h.writes(), over = h.receive(301); assert.equal(over.success, false, JSON.stringify(over)); assert.equal(h.writes(), before);
  const r = h.receive(300); assert.equal(r.success, true, JSON.stringify(r));
  const l = h.rows('purchase_order_lines')[0]; assert.equal(l.completed_qty, 1000); assert.equal(l.shipped_qty, 500); assert.equal(l.remaining_qty, 500);
  assert.equal(h.rows('factory_stock')[0].fac_current_stock, 500); assert.equal(h.rows('purchase_orders')[0].order_status, 'completed');
});
test('all-pending PO is issued, not an unapproved draft, and can receive without Send PO', () => {
  const h = world(); h.commit(h.body({ quantity: 0, unproduced_qty: 1000 }));
  assert.equal(h.rows('purchase_orders')[0].order_status, 'issued');
  const r = h.receive(1000); assert.equal(r.success, true, JSON.stringify(r)); assert.equal(h.rows('factory_stock')[0].fac_current_stock, 1000);
});
test('existing receipt may assert remaining production but cannot rewrite historical consumption', () => {
  const h = world(); h.commit(h.body()); h.c.imbNow_ = () => '2026-11-23 10:02:00';
  const t = h.c.handleImportTemplateGet_({ domain: 'po_factory_stock', mode: 'NEW_RECEIPT', scope: { warehouse_id: 'FACTORY-A' }, include_data: true });
  const b = h.body({}, 'UNPRODUCED-SECOND-02'); b.sheets.StockPO = [{ ...t.sheets[0].rows[0], transaction_id: b.import_batch_id, quantity: 100, unproduced_qty: 200 }];
  h.commit(b); assert.equal(h.rows('purchase_order_lines')[0].completed_qty, 800); assert.equal(h.rows('factory_stock')[0].fac_current_stock, 300);
  const bad = { ...b, import_batch_id: 'BAD-HISTORY-01', sheets: { StockPO: [{ ...b.sheets.StockPO[0], transaction_id: 'BAD-HISTORY-01', unproduced_qty: 0 }] } };
  assert.equal(h.c.handleImportValidate_(bad).valid, false);
});
for (const kind of ['receipt_missing', 'receipt_pending', 'audit_missing', 'counter_changed', 'parent_changed', 'lineage_reused', 'parent_owner_changed']) test('historical consumed baseline requires unchanged committed proof: ' + kind, () => {
  const h = world(); h.commit(h.body()); const l = h.rows('purchase_order_lines')[0];
  if (kind === 'receipt_missing') h.tables.import_batches.grid.splice(1);
  if (kind === 'receipt_pending') h.put('import_batches', 'import_batch_id', l.import_batch_id, 'status', 'COMMITTING');
  if (kind === 'audit_missing') h.tables.import_batch_changes.grid.splice(1);
  if (kind === 'counter_changed') h.put('purchase_order_lines', 'purchase_order_line_id', l.purchase_order_line_id, 'opening_shipped_qty', 400);
  if (kind === 'parent_changed') h.put('purchase_orders', 'purchase_order_id', l.purchase_order_id, 'import_batch_id', 'OTHER');
  if (kind === 'lineage_reused') h.put('purchase_order_lines', 'purchase_order_line_id', l.purchase_order_line_id, 'opening_lineage_qty', 500);
  if (kind === 'parent_owner_changed') h.put('purchase_orders', 'purchase_order_id', l.purchase_order_id, 'company', 'ResUS');
  const before = h.writes(), proof = h.c.slaFactoryImportConsumed_(h.ss, l.purchase_order_line_id);
  assert.equal(proof.ok, false, JSON.stringify(proof)); assert.equal(h.writes(), before);
});
test('82 without new 32 refuses positive history before stock or PO writes', () => {
  const h = world(); h.c.slaFactoryImportConsumed_ = undefined; const before = h.writes(), v = h.c.handleImportValidate_(h.body());
  assert.equal(v.valid, false); assert(v.issues.some(i => i.code === 'PFI_CONSUMED_RULE_NOT_DEPLOYED')); assert.equal(h.writes(), before);
});
test('real shipment reconciliation adds only new execution to the proved historical consumed baseline', () => {
  const h = world(); h.commit(h.body()); const plan = dispatchPlan(h); assert.equal(plan.ok, true, JSON.stringify(plan));
  assert.equal(plan.poReconcile[0].newShipped, 530); assert.equal(plan.poReconcile[0].newRemaining, 170);
  h.c.slaApplyExecution_(h.ss, plan, 'fixture', '2026-11-23 10:03:00', []);
  const again = h.c.slaPrepareExecution_(h.ss, 'SHIP-TEST'); assert.equal(again.ok, true, JSON.stringify(again));
  assert.equal(again.poReconcile[0].newShipped, 530); assert.equal(again.allocFlips.length, 0);
});
test('historical baseline never gives permission to dispatch more than physical produced balance', () => {
  const h = world(); h.commit(h.body()); const before = h.writes(), plan = dispatchPlan(h, 201);
  assert.equal(plan.ok, false); assert.equal(plan.error, 'PO_CAPACITY_CHANGED_BEFORE_DISPATCH'); assert.equal(h.writes(), before);
});
test('a bare legacy shipped counter remains blocked without proved factory import history', () => {
  const h = world(); h.commit(h.body({ unproduced_qty: '' })); const line = h.rows('purchase_order_lines')[0];
  h.put('purchase_order_lines', 'purchase_order_line_id', line.purchase_order_line_id, 'shipped_qty', 1);
  const plan = dispatchPlan(h); assert.equal(plan.ok, false); assert.equal(plan.error, 'PO_SHIPPED_QTY_LEGACY_BASELINE_UNRESOLVED');
});
test('preview explicitly separates stock receipt, pending production and historical consumption', () => {
  const h = world(), v = h.c.handleImportValidate_(h.body()); assert.equal(v.valid, true);
  const row = v.preview.rows.find(r => r.unproduced_qty === 300);
  assert(row); assert.equal(row.stock_receipt_qty, 200); assert.equal(row.historical_consumed_qty, 500); assert.equal(row.ordered_qty, 1000);
});
for (const fault of ['movement_throw', 'opening_silent_change']) test('failed import restores PO counters, consumed baseline and stock: ' + fault, () => {
  const h = world(), b = h.body(), v = h.c.handleImportValidate_(b); assert.equal(v.valid, true);
  const names = ['purchase_orders', 'purchase_order_lines', 'factory_stock', 'factory_stock_movements'];
  const before = JSON.stringify(names.map(n => h.tables[n].grid));
  if (fault === 'movement_throw') {
    const sh = h.tables.factory_stock_movements, append = sh.appendRow; let once = false;
    sh.appendRow = row => { append(row); if (!once) { once = true; throw Error('SYNTHETIC_MOVEMENT_FAILURE'); } };
  } else {
    const sh = h.tables.purchase_order_lines, append = sh.appendRow;
    sh.appendRow = row => { const copy = row.slice(); copy[sh.grid[0].indexOf('opening_shipped_qty')] = 499; append(copy); };
  }
  const r = h.c.handleImportCommit_({ ...b, preview_digest: v.preview_digest });
  assert.equal(r.code, 'IMPORT_FAILED_ROLLED_BACK', JSON.stringify(r)); assert.equal(JSON.stringify(names.map(n => h.tables[n].grid)), before);
});
test('stock change after preview refuses commit without introducing historical consumed counters', () => {
  const h = world(), b = h.body(), v = h.c.handleImportValidate_(b); assert.equal(v.valid, true);
  h.tables.factory_stock.appendRow(h.tables.factory_stock.grid[0].map(k => ({ factory_stock_id: 'ST-OTHER', warehouse_id: 'FACTORY-A', sku: 'CO1150-N', fac_current_stock: 10, fac_reserved_stock: 0 }[k] ?? '')));
  const before = h.writes(), r = h.c.handleImportCommit_({ ...b, preview_digest: v.preview_digest });
  assert.equal(r.code, 'IMPORT_PREVIEW_STALE', JSON.stringify(r)); assert.equal(h.writes(), before); assert.equal(h.rows('purchase_orders').length, 0);
});
