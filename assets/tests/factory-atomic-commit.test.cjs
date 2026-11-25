'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { world, plain } = require('./helpers/po-factory-unproduced-world.cjs');
const books = ['purchase_orders', 'purchase_order_lines', 'factory_stock', 'factory_stock_movements', 'import_batch_changes'];
const snapshot = h => JSON.stringify(books.map(n => h.tables[n].grid));
function request(h, b = h.body()) {
  const v = h.c.handleImportValidate_(b); assert.equal(v.valid, true, JSON.stringify(v));
  return { ...b, preview_digest: v.preview_digest };
}
test('PO, stock, movements, audit and final receipt share exactly one atomic call', () => {
  const h = world(), req = request(h), before = snapshot(h);
  h.atomic.beforeApply = () => {
    assert.equal(snapshot(h), before); assert.equal(h.rows('import_batches')[0].status, 'COMMITTING');
  };
  const r = h.c.handleImportCommit_(req); assert.equal(r.success, true, JSON.stringify(r));
  assert.equal(h.atomic.calls.length, 1); assert.equal(r.result.atomic_commit, true); assert.equal(r.result.readback_verified, true);
  for (const name of books.concat('import_batches')) assert(h.atomic.calls[0].requests.some(q => q.updateCells?.start.sheetId === h.tables[name].getSheetId()), name);
  assert.equal(h.rows('factory_stock')[0].fac_current_stock, 200);
  assert.equal(h.rows('purchase_order_lines')[0].remaining_qty, 200);
  assert.equal(h.rows('factory_stock_movements').length, 1); assert.equal(h.rows('import_batches')[0].status, 'COMMITTED');
  const count = h.writes(), replay = h.c.handleImportCommit_(req); assert.equal(replay.replayed, true); assert.equal(h.writes(), count); assert.equal(h.atomic.calls.length, 1);
});
test('stock staging failure after staged PO cannot leave a live PO or any receipt', () => {
  const h = world(), req = request(h), before = snapshot(h), apply = h.c.imiFactoryApply_;
  h.c.imiFactoryApply_ = (ss, plan, ctx) => { apply(ss, plan, ctx); throw Error('SYNTHETIC_INTERRUPT'); };
  const r = h.c.handleImportCommit_(req); assert.equal(r.success, false); assert.equal(r.business_writes_performed, 0);
  assert.equal(snapshot(h), before); assert.equal(h.rows('import_batches').length, 0); assert.equal(h.atomic.calls.length, 0);
});
test('service unavailable and missing module refuse with zero writes', () => {
  for (const missing of ['service', 'module']) {
    const h = world(), req = request(h), n = h.writes();
    if (missing === 'service') h.c.Sheets = undefined; else h.c.pfaCommit_ = undefined;
    const r = h.c.handleImportCommit_(req); assert.equal(r.writes_performed, 0); assert.equal(h.writes(), n); assert.equal(h.atomic.calls.length, 0);
    assert.match(r.code, /IMPORT_ATOMIC_/);
  }
});
test('API failure before apply leaves only an intent, never half a business transaction', () => {
  const h = world(), req = request(h), before = snapshot(h);
  h.atomic.beforeApply = () => { throw Error('SYNTHETIC_API_REJECT'); };
  const r = h.c.handleImportCommit_(req); assert.equal(r.code, 'IMPORT_OUTCOME_UNKNOWN'); assert.equal(r.retry_safe, false);
  assert.equal(snapshot(h), before); assert.equal(h.rows('import_batches')[0].status, 'COMMITTING');
  const retry = h.c.handleImportCommit_(req); assert.equal(retry.code, 'IMPORT_BATCH_OUTCOME_UNKNOWN'); assert.equal(h.atomic.calls.length, 1);
});
test('response lost after atomic apply is recovered by readback without a second write', () => {
  const h = world(), req = request(h);
  h.atomic.afterApply = () => { throw Error('SYNTHETIC_RESPONSE_LOST'); };
  const r = h.c.handleImportCommit_(req); assert.equal(r.success, true, JSON.stringify(r)); assert.equal(r.recovered_response, true);
  assert.equal(h.atomic.calls.length, 1); assert.equal(h.rows('factory_stock_movements').length, 1);
});
test('an invalid final API request rejects every business update', () => {
  const h = world(), req = request(h), before = snapshot(h);
  h.atomic.beforeApply = body => body.requests.push({ updateCells: { start: { sheetId: h.tables.factory_stock.getSheetId(), rowIndex: 1, columnIndex: 9000 }, rows: [{ values: [{ userEnteredValue: { numberValue: 1 } }] }], fields: 'userEnteredValue' } });
  const r = h.c.handleImportCommit_(req); assert.equal(r.code, 'IMPORT_OUTCOME_UNKNOWN'); assert.equal(snapshot(h), before);
  assert.equal(h.rows('import_batches')[0].status, 'COMMITTING');
});
test('successful API response with corrupt readback is not reported as successful', () => {
  const h = world(), req = request(h);
  h.atomic.afterApply = () => { h.tables.factory_stock.grid[1][h.tables.factory_stock.grid[0].indexOf('fac_current_stock')] = 1; };
  const r = h.c.handleImportCommit_(req); assert.equal(r.success, false); assert.equal(r.code, 'IMPORT_OUTCOME_UNKNOWN'); assert.equal(r.retry_safe, false);
  assert.equal(h.rows('purchase_orders').length, 1); assert.equal(h.atomic.calls.length, 1);
});
test('payload cap and unexpected master writes fail before an intent or business write', () => {
  for (const kind of ['cap', 'master']) {
    const h = world(), req = request(h), before = snapshot(h), writes = h.writes();
    if (kind === 'cap') h.c.PFA_MAX_BYTES_ = 10;
    else { const apply = h.c.pmiApply_; h.c.pmiApply_ = (ss, p, c) => { ss.getSheetByName('sku_details').getRange(2, 1).setValue('BAD'); return apply(ss, p, c); }; }
    const r = h.c.handleImportCommit_(req); assert.equal(r.success, false); assert.equal(r.business_writes_performed, 0);
    assert.equal(h.writes(), writes); assert.equal(snapshot(h), before); assert.equal(h.atomic.calls.length, 0);
  }
});
test('same-lock staging detects an external stock edit without overwriting it', () => {
  const h = world(), req = request(h), apply = h.c.imiFactoryApply_;
  h.c.imiFactoryApply_ = (ss, p, c) => {
    const result = apply(ss, p, c);
    h.tables.factory_stock.appendRow(h.tables.factory_stock.grid[0].map(k => ({ factory_stock_id: 'EXTERNAL', warehouse_id: 'FACTORY-A', sku: 'OTHER', fac_current_stock: 17, fac_reserved_stock: 0 }[k] ?? '')));
    return result;
  };
  const r = h.c.handleImportCommit_(req); assert.equal(r.code, 'IMPORT_PREVIEW_STALE'); assert.equal(h.atomic.calls.length, 0);
  assert.equal(h.rows('purchase_orders').length, 0); assert.equal(h.rows('factory_stock')[0].fac_current_stock, 17);
});
test('factory stock-only ADD is atomic and never writes purchase orders', () => {
  const h = world(), b = { domain: 'factory_inventory', mode: 'ADD', schema_version: 'FACTORY_INVENTORY-IMPORT-1', import_batch_id: 'ATOMIC-STOCK-ONLY-01', scope: { warehouse_id: 'FACTORY-A' }, sheets: { Stock: [{ warehouse_id: 'FACTORY-A', sku: 'CO1150-N', add_qty: 40 }] } };
  const r = h.c.handleImportCommit_(request(h, b)); assert.equal(r.success, true, JSON.stringify(r)); assert.equal(r.result.total_delta, 40);
  assert.equal(h.rows('purchase_order_lines').length, 0); assert.equal(h.rows('purchase_orders').length, 0);
  const ids = new Set(h.atomic.calls[0].requests.filter(x => x.updateCells).map(x => x.updateCells.start.sheetId));
  assert(!ids.has(h.tables.purchase_orders.getSheetId())); assert(!ids.has(h.tables.purchase_order_lines.getSheetId()));
});
test('grid expansion and literal strings are included in the same transaction', () => {
  const h = world(), req = request(h); h.tables.import_batch_changes.maxRows = 1;
  const r = h.c.handleImportCommit_(req); assert.equal(r.success, true, JSON.stringify(r));
  assert(h.atomic.calls[0].requests.some(q => q.appendDimension?.sheetId === h.tables.import_batch_changes.getSheetId()));
  const stage = h.c.pfaStage_(h.ss, 'factory_inventory'), sh = stage.ss.getSheetByName('factory_stock');
  sh.getRange(2, 1).setValue('=UNTRUSTED()');
  const q = plain(h.c.pfaRequests_(stage, 'Asia/Taipei')).requests.find(x => x.updateCells);
  assert.deepEqual(q.updateCells.rows[0].values[0].userEnteredValue, { stringValue: '=UNTRUSTED()' });
});
test('stock SET preserves reserved and unrelated rows, including their date values', () => {
  const h = world();
  const header = h.tables.factory_stock.grid[0], stamp = new Date('2026-11-20T03:00:00Z');
  h.tables.factory_stock.appendRow(header.map(k => ({ factory_stock_id: 'FS-FACTORY-A-CO1150-N', warehouse_id: 'FACTORY-A', sku: 'CO1150-N', fac_current_stock: 80, fac_reserved_stock: 20, created_at: stamp }[k] ?? '')));
  h.tables.factory_stock.appendRow(header.map(k => ({ factory_stock_id: 'FS-FACTORY-A-OTHER', warehouse_id: 'FACTORY-A', sku: 'OTHER', fac_current_stock: 19, fac_reserved_stock: 0, created_at: stamp }[k] ?? '')));
  const other = h.tables.factory_stock.grid[2].slice();
  const b = { domain: 'factory_inventory', mode: 'SET', schema_version: 'FACTORY_INVENTORY-IMPORT-1', import_batch_id: 'ATOMIC-STOCK-SET-01', scope: { warehouse_id: 'FACTORY-A' }, sheets: { Stock: [{ warehouse_id: 'FACTORY-A', sku: 'CO1150-N', current_stock_qty: 50 }] } };
  const r = h.c.handleImportCommit_(request(h, b)); assert.equal(r.success, true, JSON.stringify(r));
  assert.equal(h.rows('factory_stock')[0].fac_current_stock, 50); assert.equal(h.rows('factory_stock')[0].fac_reserved_stock, 20);
  assert.deepEqual(h.tables.factory_stock.grid[2], other); assert.equal(h.rows('factory_stock')[0].created_at.getTime(), stamp.getTime());
});
test('a full 25-row StockPO file writes every SKU and movement in one call', () => {
  const h = world(), skus = Array.from({ length: 25 }, (_, i) => 'STOCKPO-VARIANT-' + i);
  h.sheet('sku_regional_details', ['sku', 'site_sku'], skus.map(site_sku => ({ sku: 'CO1150-N', site_sku })));
  const b = h.body(), row = b.sheets.StockPO[0]; b.sheets.StockPO = skus.map((sku, i) => ({ ...row, sku, __row: i + 2 }));
  const r = h.c.handleImportCommit_(request(h, b)); assert.equal(r.success, true, JSON.stringify(r));
  assert.equal(h.rows('purchase_order_lines').length, 25); assert.equal(h.rows('factory_stock').length, 25);
  assert.equal(h.rows('factory_stock_movements').length, 25); assert.equal(h.atomic.calls.length, 1);
  assert.equal(h.rows('factory_stock').reduce((sum, x) => sum + x.fac_current_stock, 0), 5000);
  assert.equal(h.rows('purchase_order_lines').reduce((sum, x) => sum + x.remaining_qty, 0), 5000);
});
