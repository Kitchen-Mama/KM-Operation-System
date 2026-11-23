'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createWorld, plain } = require('./helpers/order-mainline-world.cjs');
const priceHeaders = ['supplier_price_id', 'sku', 'supplier_id', 'supplier_name', 'supplier_sku',
  'supplier_warehouse_id', 'unit_cost', 'currency', 'is_active', 'effective_from', 'effective_to'];
const quote = { supplier_price_id: 'PRICE-A', sku: 'SKU-A', supplier_id: 'SUP-A', supplier_name: 'Fixture Supplier',
  supplier_sku: 'FACTORY-SKU-A', supplier_warehouse_id: 'FACTORY-A', unit_cost: 2.5, currency: 'USD', is_active: true, effective_from: '2026-01-01' };
const setup = { warehouse_id: 'FACTORY-A', supplier_id: 'SUP-A', supplier_name: 'Fixture Supplier' };

function world(prices = [quote], buckets = ['T1']) {
  const h = createWorld();
  h.sheet('supplier_price_list', priceHeaders, prices);
  const result = h.dispatch({ action: 'createRequestOrderDraft', company: '', warehouse_id: 'FACTORY-A',
    source_ref_type: 'request_order_allocation_batch', planning_cycle: '2026-11', series: 'SERIES-A',
    lines: buckets.map(request_bucket => ({ sku: 'SKU-A', company: 'KM', requested_qty: 40, units_per_carton: 10,
      request_bucket, request_month: '2026-12', country: 'US', marketplace: 'Amazon',
      request_allocation_draft_id: 'RD::MONTHLY_ORDER::2026-11::KM::US::Amazon::SKU-A' })) });
  assert.equal(result.success, true, JSON.stringify(result));
  h.roId = result.data.request_order_id;
  for (const transition of ['submit', 'approve']) assert.equal(h.dispatch({ action: 'updateRequestOrderStatus', request_order_id: h.roId, transition }).success, true);
  h.convert = extra => h.dispatch({ action: 'createPurchaseOrderFromRequest', request_order_id: h.roId, purchase_setup: setup, ...extra });
  h.preview = () => h.convert({ purchase_setup_preview: true });
  h.commit = () => {
    const preview = h.preview(); assert.equal(preview.success, true, JSON.stringify(preview));
    return h.convert({ purchase_setup_checksum: preview.data.quote_checksum });
  };
  return h;
}

test('unpriced Planning-shaped Request -> explicit quote preview -> PO -> document -> receipt', () => {
  const h = world();
  const approved = plain(h.rows('request_order_lines')), sources = plain(h.rows('request_order_line_sources'));
  assert.equal(approved[0].unit_cost, '');
  let before = h.writes();
  const preview = h.preview();
  assert.equal(preview.success, true, JSON.stringify(preview));
  assert.equal(h.writes(), before);
  assert.equal(h.rows('purchase_orders').length, 0);
  assert.equal(preview.data.purchase_setup_preview.lines[0].unit_cost, 2.5);
  assert.equal(h.commit().success, true);
  const po = h.rows('purchase_orders')[0], line = h.rows('purchase_order_lines')[0];
  assert.equal(po.supplier_name, quote.supplier_name); assert.equal(po.currency, 'USD'); assert.match(po.note, /PRICE-A/);
  assert.equal(line.unit_cost, 2.5); assert.equal(line.line_amount, 100); assert.equal(line.supplier_sku, 'FACTORY-SKU-A');
  assert.deepEqual(h.rows('request_order_line_sources'), sources);
  assert.deepEqual(h.rows('request_order_lines').map(l => ({ ...l, purchase_order_line_id: '' })), approved);
  h.put('purchase_orders', 'purchase_order_id', po.purchase_order_id, 'expected_completion_date', '2026-12-04');
  assert.equal(h.dispatch({ action: 'updatePurchaseOrderStatus', purchase_order_id: po.purchase_order_id, transition: 'issue' }).success, true);
  assert.equal(h.files[0].matrix[1][1], '2.5'); assert.equal(h.files[0].matrix[1][2], '100');
  const body = h.receiptBody(h, po.purchase_order_id, line.purchase_order_line_id, 40);
  assert.equal(h.dispatch({ action: 'receivePurchaseOrderLines', ...body }).success, true);
  assert.equal(h.rows('factory_stock')[0].fac_current_stock, 40);
  before = h.writes();
  assert.equal(h.convert({ purchase_setup: { warehouse_id: 'BAD' } }).data.reused, true);
  assert.equal(h.writes(), before);
});

for (const [label, prices, error] of [
  ['missing price', [], 'PO_SUPPLIER_IDENTITY_MISSING_OR_AMBIGUOUS'],
  ['inactive string flag', [{ ...quote, is_active: 'FALSE' }], 'PO_SUPPLIER_PRICE_NOT_FOUND'],
  ['future price', [{ ...quote, effective_from: '2027-01-01' }], 'PO_SUPPLIER_PRICE_NOT_FOUND'],
  ['expired price', [{ ...quote, effective_to: '2026-11-22' }], 'PO_SUPPLIER_PRICE_NOT_FOUND'],
  ['other factory', [{ ...quote, supplier_warehouse_id: 'FACTORY-B' }], 'PO_SUPPLIER_PRICE_NOT_FOUND'],
  ['duplicate effective price', [quote, { ...quote, supplier_price_id: 'DUPLICATE' }], 'PO_SUPPLIER_PRICE_AMBIGUOUS'],
  ['invalid date', [{ ...quote, effective_from: '2026-02-31' }], 'PO_SUPPLIER_PRICE_DATE_INVALID'],
  ['mixed supplier identity', [quote, { ...quote, supplier_name: 'Other name' }], 'PO_SUPPLIER_IDENTITY_MISSING_OR_AMBIGUOUS'],
  ...['', null, true, -1, Infinity, '2 dollars', '0x10'].map(unit_cost => ['invalid cost ' + unit_cost, [{ ...quote, unit_cost }], 'PO_SUPPLIER_PRICE_INVALID']),
  ['missing currency', [{ ...quote, currency: '' }], 'PO_SUPPLIER_CURRENCY_INVALID']
]) test(label + ' blocks before any business/file write', () => {
  const h = world(prices), before = h.writes();
  assert.equal(h.preview().error, error);
  assert.equal(h.writes(), before); assert.equal(h.files.length, 0); assert.equal(h.folders.length, 0);
  assert.equal(h.rows('purchase_orders').length, 0); assert.equal(h.rows('request_orders')[0].request_status, 'approved');
});

test('latest currently applicable price beats old and future rows; zero is a real price', () => {
  const h = world([{ ...quote, supplier_price_id: 'OLD', effective_from: '2025-01-01' },
    { ...quote, unit_cost: 0 }, { ...quote, supplier_price_id: 'FUTURE', effective_from: '2027-01-01', unit_cost: 99 }]);
  assert.equal(h.commit().success, true);
  assert.equal(h.rows('purchase_order_lines')[0].unit_cost, 0);
  assert.equal(h.rows('purchase_order_lines')[0].line_amount, 0);
  assert.equal(h.rows('purchase_orders')[0].subtotal_amount, 0);
});

test('documented supplier_name_snapshot alias and YES active flag resolve without a fabricated supplier ID', () => {
  const h = world();
  h.sheet('supplier_price_list', ['sku', 'supplier_name_snapshot', 'unit_cost', 'currency', 'is_active'], [
    { sku: 'SKU-A', supplier_name_snapshot: 'Fixture Supplier', unit_cost: '2.50', currency: 'USD', is_active: 'YES' }
  ]);
  const chosen = { warehouse_id: 'FACTORY-A', supplier_name: 'Fixture Supplier' };
  const preview = h.convert({ purchase_setup: chosen, purchase_setup_preview: true });
  assert.equal(preview.success, true, JSON.stringify(preview));
  const result = h.convert({ purchase_setup: chosen, purchase_setup_checksum: preview.data.quote_checksum });
  assert.equal(result.success, true); assert.equal(h.rows('purchase_order_lines')[0].supplier_id, '');
  assert.equal(h.rows('purchase_order_lines')[0].unit_cost, 2.5);
});

test('a second SKU without a price blocks the whole request and mixed currencies never create a partial PO', () => {
  for (const secondPrice of [null, { ...quote, supplier_price_id: 'PRICE-B', sku: 'SKU-B', currency: 'EUR' }]) {
    const h = world(secondPrice ? [quote, secondPrice] : [quote], ['T1', 'T2']);
    const secondLine = h.rows('request_order_lines')[1].request_order_line_id;
    h.put('request_order_lines', 'request_order_line_id', secondLine, 'sku', 'SKU-B');
    const before = h.writes();
    assert.equal(h.preview().error, secondPrice ? 'PO_SUPPLIER_CURRENCY_CONFLICT' : 'PO_SUPPLIER_PRICE_NOT_FOUND');
    assert.equal(h.writes(), before); assert.equal(h.rows('purchase_orders').length, 0);
  }
});

test('reviewed price change requires another preview and is zero-write', () => {
  const h = world(), preview = h.preview();
  h.put('supplier_price_list', 'supplier_price_id', 'PRICE-A', 'unit_cost', 3);
  const before = h.writes();
  assert.equal(h.convert({ purchase_setup_checksum: preview.data.quote_checksum }).error, 'PO_PURCHASE_SETUP_CHANGED_REVIEW_REQUIRED');
  assert.equal(h.writes(), before); assert.equal(h.rows('purchase_orders').length, 0);
  assert.equal(h.commit().success, true); assert.equal(h.rows('purchase_order_lines')[0].unit_cost, 3);
});

test('setup cannot skip quote review, and preview cannot omit setup', () => {
  const h = world(), before = h.writes();
  assert.equal(h.convert().error, 'PO_PURCHASE_SETUP_CHANGED_REVIEW_REQUIRED');
  assert.equal(h.convert({ purchase_setup: undefined, purchase_setup_preview: true }).error, 'PO_PURCHASE_SETUP_REQUIRED');
  assert.equal(h.writes(), before);
});

test('inactive or non-factory source is not a production factory', () => {
  for (const attrs of [{ is_factory_warehouse: false }, { is_active: false }]) {
    const h = world();
    for (const [key, value] of Object.entries(attrs)) h.put('warehouses', 'warehouse_id', 'FACTORY-A', key, value);
    const before = h.writes(), result = h.preview();
    assert.equal(result.success, false); assert.equal(h.writes(), before);
  }
});

test('both T1/T2+T3 groups use reviewed prices and a landed append failure rolls back', () => {
  const h = world([quote], ['T1', 'T2', 'T3']), preview = h.preview();
  const saved = h.tables.purchase_orders.appendRow; let calls = 0;
  h.tables.purchase_orders.appendRow = function (row) { saved.call(this, row); if (++calls === 2) throw new Error('Synthetic landed failure'); };
  assert.equal(h.convert({ purchase_setup_checksum: preview.data.quote_checksum }).success, false);
  assert.equal(h.rows('purchase_orders').length, 0); assert.equal(h.rows('purchase_order_lines').length, 0);
  assert(h.rows('request_order_lines').every(l => !l.purchase_order_line_id));
  h.tables.purchase_orders.appendRow = saved;
  assert.equal(h.commit().success, true);
  assert.equal(h.rows('purchase_orders').length, 2);
  assert(h.rows('purchase_order_lines').every(l => l.unit_cost === 2.5 && l.line_amount === 100));
});

module.exports = { world, quote, priceHeaders, setup };
