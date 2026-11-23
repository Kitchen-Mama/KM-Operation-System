const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { extract } = require('./ad4/extract.cjs');
const root = path.resolve(__dirname, '../..');
const read = p => {
  const override = process.env.KM_SITE_GS && /\/apps-script\/[^/]+\.gs$/.test(p) && !/^(?:00_config|84_)/.test(path.basename(p))
    ? path.join(process.env.KM_SITE_GS, path.basename(p)) : '';
  return fs.readFileSync(override && fs.existsSync(override) ? override : path.join(root, p), 'utf8');
};
const gs = 'assets/specs/active/apps-script/';
const parts = (source, names, vars = []) => extract(source, n => names.includes(n), n => vars.includes(n)).map(p => p.text).join('\n');
// Reuse only the synthetic spreadsheet host, without running the phase-one audit tests.
const fixture = parts(read('assets/tests/order-mainline-phase1.cjs'), ['host'], ['stockHeaders', 'movementHeaders']);
const host = new Function('assert', 'vm', 'read', 'gs', 'crypto', fixture + '\nreturn host;')(assert, vm, read, gs, crypto);
const plain = v => JSON.parse(JSON.stringify(v));
function world() {
  const h = host(), c = h.c;
  // These deployed stock writers are newer than their legacy active-source mirrors.
  const deployed = 'output/dw2-workflow-20261122/release-4/candidate/Production/apps-script/';
  for (const name of ['05_overseas_inventory_handlers.gs', '21_factory_inventory_handlers.gs']) vm.runInContext(read(deployed + name), c, { filename: name });
  for (const name of ['18_sku_regional_handlers.gs',
    '78_api_v1_import_batch.gs', '79_api_v1_po_import.gs', '81_api_v1_inventory_import.gs', '82_api_v1_po_factory_import.gs']) {
    vm.runInContext(read(gs + name), c, { filename: name });
  }
  c.SpreadsheetApp.openById = () => h.ss;
  c.prodExpectedDbId_ = () => 'SYNTHETIC';
  c.imbNow_ = () => '2026-11-23 10:00:00';
  c.PRICING_FX_DECIMALS_ = { USD: 2 };
  h.sheet('sku_details', ['sku', 'series', 'category', 'product_name', 'units_per_carton', 'product_status'], [
    { sku: 'CO1150-N', series: 'CO1150', category: 'Can Opener', product_name: 'Fixture Product', units_per_carton: 10, product_status: 'active' },
    { sku: 'OTHER', series: 'OTHER', category: 'Other', product_name: 'Other Product', units_per_carton: 20, product_status: 'active' }
  ]);
  h.sheet('sku_regional_details', ['sku', 'site_sku'], [{ sku: 'CO1150-N', site_sku: 'CO1150-N-TG' }]);
  h.sheet('marketplace_skus', ['company'], [{ company: 'KM' }]);
  h.sheet('supplier_price_list', ['supplier_id']);
  h.sheet('shipment_line_allocations', ['purchase_order_line_id', 'allocation_status', 'allocated_qty']);
  for (const [name, headers] of [['purchase_orders', c.PURCHASE_ORDERS_HEADERS_], ['purchase_order_lines', c.PURCHASE_ORDER_LINES_HEADERS_]]) {
    h.sheet(name, [...new Set([...headers, ...c.PMI_NEW_COLUMNS_[name]])]);
  }
  h.sheet('import_batches', c.IMB_RECEIPT_HEADERS_);
  h.sheet('import_batch_changes', c.IMB_CHANGE_HEADERS_);
  h.sheet('warehouses', ['warehouse_id', 'warehouse_code', 'warehouse_name', 'is_factory_warehouse', 'is_active', 'warehouse_type', 'company', 'country'], [
    { warehouse_id: 'FACTORY-A', warehouse_code: 'FACTORY-A', warehouse_name: 'Fixture Factory', is_factory_warehouse: true, is_active: true, warehouse_type: 'factory', company: 'KM', country: 'CN' },
    { warehouse_id: 'OVERSEAS-A', warehouse_code: 'OVERSEAS-A', warehouse_name: 'Fixture Overseas', is_factory_warehouse: false, is_active: true, warehouse_type: '3pl', company: 'KM', country: 'US' }
  ]);
  h.sheet('overseas_inventory_snapshot', ['overseas_inventory_id', 'warehouse_id', 'sku', 'site_sku', 'wh_available_stock', 'wh_reserved_stock', 'wh_damaged_stock', 'wh_on_the_way_qty', 'wh_on_the_way_eta', 'note', 'created_at', 'updated_at']);
  h.sheet('overseas_inventory_movements', c.IMI_OVS_MOV_REQUIRED_);
  return h;
}
function body(h, domain, mode, skus = ['CO1150-N-TG'], id = 'SITE-SKU-BATCH-01') {
  const wh = domain === 'overseas_inventory' ? 'OVERSEAS-A' : 'FACTORY-A';
  const sheet = domain === 'po_factory_stock' ? 'StockPO' : 'Stock';
  const rows = skus.map((sku, i) => domain === 'po_factory_stock' ? {
    __row: i + 2, transaction_id: id, company: 'KM', po_no: 'PO-' + id, warehouse_id: wh, sku,
    quantity: 20, ordered_qty: 100, currency: 'USD', order_date: '2026-11-22'
  } : { __row: i + 2, warehouse_id: wh, sku, [domain === 'overseas_inventory' ? mode === 'ADD' ? 'add_available_qty' : 'available_stock' : mode === 'ADD' ? 'add_qty' : 'current_stock_qty']: 20 });
  return { domain, mode, schema_version: h.c.imbDomain_(domain).schema_version, import_batch_id: id,
    scope: { warehouse_id: wh, ...(domain === 'po_factory_stock' ? { as_of_date: '2026-11-23' } : {}) }, sheets: { [sheet]: rows } };
}
function commit(h, b) {
  const v = h.c.handleImportValidate_(b);
  assert.equal(v.valid, true, JSON.stringify(v));
  const req = { ...b, preview_digest: v.preview_digest };
  const r = h.c.handleImportCommit_(req);
  assert.equal(r.success, true, JSON.stringify(r));
  return { v, r, req };
}
test('explicit aliases inherit metadata, do not mutate masters; duplicate same-base sites are allowed', () => {
  const h = world(), masters = h.rows('sku_details'), before = JSON.stringify(masters);
  const out = h.c.skuInventoryAliasRows_(masters, [{ sku: 'CO1150-N', site_sku: 'CO1150-N-TG' }, { sku: 'CO1150-N', site_sku: 'CO1150-N-TG' }]);
  const alias = out.find(r => r.sku === 'CO1150-N-TG');
  assert.equal(alias.product_name, 'Fixture Product'); assert.equal(alias.inventory_master_sku, 'CO1150-N');
  assert.equal(out.length, 3); assert.equal(JSON.stringify(masters), before);
});
test('ambiguous, dangling, duplicate-base, guessed suffix and unregistered Like New aliases are not admitted', () => {
  const h = world(), masters = h.rows('sku_details');
  const out = h.c.skuInventoryAliasRows_(masters.concat(masters[0]), [
    { sku: 'CO1150-N', site_sku: 'DUPLICATE-BASE' }, { sku: 'MISSING', site_sku: 'DANGLING' },
    { sku: 'CO1150-N', site_sku: 'CONFLICT' }, { sku: 'OTHER', site_sku: 'CONFLICT' }
  ]);
  for (const sku of ['DUPLICATE-BASE', 'DANGLING', 'CONFLICT', 'CO1150-N-TG', 'CO1150-N-LN']) assert(!out.some(r => r.sku === sku));
});
test('canonical master wins over a regional alias collision', () => {
  const h = world(), out = h.c.skuInventoryAliasRows_(h.rows('sku_details'), [{ sku: 'OTHER', site_sku: 'CO1150-N' }]);
  assert.equal(out.find(r => r.sku === 'CO1150-N').product_name, 'Fixture Product');
});
test('missing regional tab or malformed headers never admit variants', () => {
  const h = world(); delete h.tables.sku_regional_details;
  assert(!h.c.imiSkus_(h.ss)['CO1150-N-TG']);
  h.sheet('sku_regional_details', ['sku'], [{ sku: 'CO1150-N' }]);
  assert(!h.c.imiSkus_(h.ss)['CO1150-N-TG']);
});
for (const domain of ['factory_inventory', 'overseas_inventory', 'po_factory_stock']) {
  const modes = domain === 'po_factory_stock' ? ['NEW_RECEIPT', 'UPDATE_REMAINING'] : ['ADD', 'SET'];
  for (const mode of modes) test(domain + ' ' + mode + ': base and variant commit independently, unknown skipped; replay zero-write', () => {
    const h = world(), b = body(h, domain, mode, ['CO1150-N', 'CO1150-N-TG', 'NOT-REGISTERED']);
    const before = h.writes(), { v, req } = commit(h, b);
    assert(h.writes() > before); assert.equal(v.preview.counts.skipped, 1);
    const table = domain === 'overseas_inventory' ? 'overseas_inventory_snapshot' : 'factory_stock';
    const key = domain === 'overseas_inventory' ? 'wh_available_stock' : 'fac_current_stock';
    const stocks = h.rows(table);
    assert.equal(stocks.length, 2); for (const sku of ['CO1150-N', 'CO1150-N-TG']) assert.equal(stocks.find(r => r.sku === sku)[key], 20);
    if (domain === 'po_factory_stock') assert.deepEqual(h.rows('purchase_order_lines').map(r => r.sku).sort(), ['CO1150-N', 'CO1150-N-TG']);
    const writes = h.writes(), replay = h.c.handleImportCommit_(req);
    assert.equal(replay.replayed, true); assert.equal(h.writes(), writes);
    assert.equal(h.rows('sku_details').length, 2);
  });
  test(domain + ': all unknown is zero-write, cross-warehouse still rejected', () => {
    const h = world(), mode = modes[0], b = body(h, domain, mode, ['NOT-REGISTERED']);
    const writes = h.writes(), v = h.c.handleImportValidate_(b);
    assert.equal(v.valid, false, JSON.stringify(v)); assert(v.issues.some(i => i.code === 'NO_APPLICABLE_SKUS'));
    const rec = Object.values(b.sheets)[0][0]; rec.warehouse_id = 'WRONG';
    const bad = h.c.handleImportValidate_(b); assert.equal(bad.valid, false); assert(!bad.issues.some(i => i.code === 'NO_APPLICABLE_SKUS'));
    assert.equal(h.writes(), writes);
  });
  test(domain + ': mapping changed after preview refuses commit before any writes', () => {
    const h = world(), b = body(h, domain, modes[0]), v = h.c.handleImportValidate_(b);
    assert.equal(v.valid, true, JSON.stringify(v));
    h.put('sku_regional_details', 'site_sku', 'CO1150-N-TG', 'sku', 'OTHER');
    const writes = h.writes(), result = h.c.handleImportCommit_({ ...b, preview_digest: v.preview_digest });
    assert.equal(result.code, 'IMPORT_PREVIEW_STALE', JSON.stringify(result)); assert.equal(h.writes(), writes);
  });
}
test('ordinary PO import master universe is unchanged; only StockPO opts into variants', () => {
  const h = world();
  assert(!h.c.pmiMasters_(h.ss, []).sku['CO1150-N-TG']);
  assert(h.c.pmiMasters_(h.ss, [], true).sku['CO1150-N-TG']);
});
test('existing variant StockPO update changes only its own PO and stock; base remains intact', () => {
  const h = world(); commit(h, body(h, 'po_factory_stock', 'NEW_RECEIPT', ['CO1150-N', 'CO1150-N-TG']));
  const template = h.c.handleImportTemplateGet_({ domain: 'po_factory_stock', mode: 'UPDATE_REMAINING', scope: { warehouse_id: 'FACTORY-A' }, include_data: true });
  assert.equal(template.success, true, JSON.stringify(template));
  const row = template.sheets[0].rows.find(r => r.sku === 'CO1150-N-TG'); assert(row);
  h.c.imbNow_ = () => '2026-11-23 10:01:00';
  const id = 'SITE-SKU-UPDATE-02', b = body(h, 'po_factory_stock', 'UPDATE_REMAINING', [], id);
  b.sheets.StockPO = [{ ...row, transaction_id: id, quantity: 35 }];
  commit(h, b);
  assert.equal(h.rows('factory_stock').find(r => r.sku === 'CO1150-N-TG').fac_current_stock, 35);
  assert.equal(h.rows('factory_stock').find(r => r.sku === 'CO1150-N').fac_current_stock, 20);
  assert.equal(h.rows('purchase_order_lines').find(r => r.sku === 'CO1150-N-TG').remaining_qty, 35);
});
for (const domain of ['factory_inventory', 'overseas_inventory', 'po_factory_stock']) {
  test(domain + ': 250 registered site SKUs accepted without merging, unknowns still skipped', () => {
    const h = world(), skus = Array.from({ length: 250 }, (_, i) => 'SITE-VARIANT-' + i);
    h.sheet('sku_regional_details', ['sku', 'site_sku'], skus.map(site_sku => ({ sku: 'CO1150-N', site_sku })));
    const mode = domain === 'po_factory_stock' ? 'NEW_RECEIPT' : 'ADD';
    const { v } = commit(h, body(h, domain, mode, skus.concat('NOT-REGISTERED')));
    assert.equal(v.preview.counts.skipped, 1);
    assert.equal(h.rows(domain === 'overseas_inventory' ? 'overseas_inventory_snapshot' : 'factory_stock').length, 250);
  });
  test(domain + ': failed movement append rolls back variant stock and PO writes', () => {
    const h = world(), b = body(h, domain, domain === 'po_factory_stock' ? 'NEW_RECEIPT' : 'ADD');
    const v = h.c.handleImportValidate_(b); assert.equal(v.valid, true, JSON.stringify(v));
    const tableNames = ['purchase_orders', 'purchase_order_lines', 'factory_stock', 'factory_stock_movements', 'overseas_inventory_snapshot', 'overseas_inventory_movements'];
    const before = JSON.stringify(tableNames.map(n => h.tables[n].grid));
    const name = domain === 'overseas_inventory' ? 'overseas_inventory_movements' : 'factory_stock_movements';
    const sh = h.tables[name], append = sh.appendRow; let failed = false;
    sh.appendRow = row => { append(row); if (!failed) { failed = true; throw Error('SYNTHETIC_APPEND_FAILURE'); } };
    const result = h.c.handleImportCommit_({ ...b, preview_digest: v.preview_digest });
    assert.equal(failed, true); assert.equal(result.code, 'IMPORT_FAILED_ROLLED_BACK', JSON.stringify(result));
    assert.equal(JSON.stringify(tableNames.map(n => h.tables[n].grid)), before);
  });
}
test('browser metadata uses the identical generated matcher for normalized siteSku fields', () => {
  const h = world(), context = vm.createContext({ window: { KM: {} } });
  vm.runInContext(read('assets/js/utils/inventory-sku-identity.js'), context);
  const masters = h.rows('sku_details'), regional = [{ sku: 'CO1150-N', siteSku: 'CO1150-N-TG' }];
  assert.deepEqual(plain(context.window.KM.inventorySkuIdentity.expand(masters, regional)), plain(h.c.skuInventoryAliasRows_(masters, regional)));
  for (const [file, getter, name] of [['factory-stock', '_fsGet', '_factorySkuMetaMap'], ['overseas-stock', '_osGet', '_overseasSkuMetaMap']]) {
    context[getter] = key => key === 'skuDetails' ? masters : regional;
    vm.runInContext(parts(read('assets/js/pages/' + file + '.js'), [name]), context);
    assert.equal(context[name]()['CO1150-N-TG'].category, 'Can Opener');
  }
});
test('overseas workspace transports projected regional mappings through the real API normalizer in one request', async () => {
  const h = world(); vm.runInContext(read(gs + '70_api_v1_overseas_stock_workspace.gs'), h.c);
  const reads = [];
  const env = h.c.handleOverseasStockWorkspaceGet_({}, { now: () => 1, openTarget: () => h.ss,
    readTable: (_, name) => { reads.push(name); return h.rows(name); } });
  assert.equal(env.success, true); assert.equal(reads.length, 5);
  assert.deepEqual(plain(env.data.sku_regional_details), [{ sku: 'CO1150-N', site_sku: 'CO1150-N-TG' }]);
  let calls = 0;
  const c = vm.createContext({ console, window: { KM: { api: { getWorkspace: async () => { calls++; return env; } } } } });
  vm.runInContext(read('assets/js/api/operation-system-db-api.js'), c);
  const model = await c.window.KM.DB.loadOverseasStockWorkspace({});
  assert.equal(calls, 1); assert.equal(model.skuRegionalDetails[0].siteSku, 'CO1150-N-TG');
});
test('an oversized regional reference is omitted, never partially used to disambiguate identities', () => {
  const h = world(); vm.runInContext(read(gs + '70_api_v1_overseas_stock_workspace.gs'), h.c);
  h.c.OSW_WS_ROW_MAX_ = 1;
  const out = h.c.oswWorkspaceBuild_({ sku_regional_details: [{ sku: 'CO1150-N', site_sku: 'CONFLICT' }, { sku: 'OTHER', site_sku: 'CONFLICT' }] });
  assert.equal(out.capped.sku_regional_details, true); assert.equal(out.sku_regional_details.length, 0);
});
