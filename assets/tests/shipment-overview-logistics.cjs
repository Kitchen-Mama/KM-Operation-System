const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { extract } = require('./ad4/extract.cjs');
const source = fs.readFileSync('assets/js/pages/shipping-history.js', 'utf8');
const api = fs.readFileSync('assets/js/api/operation-system-db-api.js', 'utf8');
const gs = fs.readFileSync('assets/specs/active/apps-script/57_api_v1_shipment_workspace.gs', 'utf8');
const c = vm.createContext({});
vm.runInContext(gs, c);
vm.runInContext(extract(source, n => n === '_shOverviewLogistics_', () => false).map(p => p.text).join('\n'), c);
vm.runInContext(extract(api, n => ['normalizeShipmentLineRecord', 'normalizeSkuDetailsRecord', '_kmScSource13_', '_kmScNote13_'].includes(n), () => false).map(p => p.text).join('\n'), c);
const plain = x => JSON.parse(JSON.stringify(x));
const opening = { recordOrigin: 'IMPORT_HISTORICAL', openingSupplyMode: 'DISPLAY_ONLY' };
const rawDetail = { sku: 'SKU-A', units_per_carton: 40, carton_length: 50, carton_width: 40, carton_height: 30,
  carton_dimension_unit: 'cm', carton_weight: 10, carton_weight_unit: 'kg', item_weight: 200, item_weight_unit: 'g' };
const detail = c.normalizeSkuDetailsRecord(rawDetail);
const rawLine = { shipment_id: 'S1', shipment_line_id: 'L1', sku: 'SKU-A', shipment_qty: 81, shipment_received_qty: 0 };
function project(raw = rawLine, details = [detail], header = opening) {
  return c._shOverviewLogistics_(header, [c.normalizeShipmentLineRecord(raw)], details)[0];
}
function tables() { return { shipments: [{ shipment_id: 'S1', status: 'in_transit' }, { shipment_id: 'S2' }],
  shipment_lines: [rawLine, { shipment_id: 'S2', sku: 'OTHER' }],
  sku_details: [{ ...rawDetail, confidential_extra: 'not projected' }, { sku: 'OTHER', units_per_carton: 7 }] }; }
test('real import-shaped row derives cartons, line-total CBM and kg weights without changing raw facts', () => {
  const before = JSON.stringify(rawLine), row = project();
  assert.equal(row.cartonQty, 3);
  assert(Math.abs(row.shipmentCartonCbm - 0.18) < 1e-10);
  assert.equal(row.grossWeight, 30);
  assert.equal(row.netWeight, 16.2);
  assert.equal(row.cartonNoStart, '');
  assert.equal(row.cartonNoEnd, '');
  assert.equal(JSON.stringify(rawLine), before);
  assert.equal(row.shipmentReceivedQty, 0);
  assert.equal(row.qty, 81);
});
test('saved canonical and legacy totals always win, including explicit zero weights', () => {
  const row = project({ ...rawLine, shipment_carton_qty: 7, shipment_carton_cbm: 0.9, gross_weight: 88, net_weight: 0 });
  assert.deepEqual([row.cartonQty, row.shipmentCartonCbm, row.grossWeight, row.netWeight], [7, 0.9, 88, 0]);
  assert.equal(project({ ...rawLine, carton_qty: 6, carton_cbm: 1.2 }).shipmentCartonCbm, 1.2);
});
test('no metadata or duplicate SKU metadata stays unknown, not falsely zero', () => {
  for (const details of [[], null, [detail, detail]]) {
    const row = project(rawLine, details);
    assert.deepEqual([row.cartonQty, row.shipmentCartonCbm, row.grossWeight, row.netWeight], ['', '', '', '']);
  }
});
test('missing dimensions or unit weights affect only their own metrics', () => {
  const row = project(rawLine, [{ ...detail, cartonLength: '', itemWeight: '' }]);
  assert.deepEqual([row.cartonQty, row.shipmentCartonCbm, row.grossWeight, row.netWeight], [3, '', 30, '']);
});
test('inch, lb and g conversion uses cubic metres and kg, unknown units fail closed', () => {
  const row = project(rawLine, [{ ...detail, cartonDimensionUnit: 'in', cartonWeightUnit: 'lb' }]);
  assert(Math.abs(row.shipmentCartonCbm - 3 * 50 * 40 * 30 * 0.0254 ** 3) < 1e-10);
  assert(Math.abs(row.grossWeight - 30 * 0.45359237) < 1e-10);
  assert.equal(project(rawLine, [{ ...detail, cartonWeightUnit: 'invalid' }]).grossWeight, '');
});
test('invalid saved metrics never become a fabricated normalized zero or a fresh estimate', () => {
  const row = project({ ...rawLine, shipment_carton_qty: 'oops', gross_weight: -1, net_weight: 'oops', shipment_carton_cbm: 'oops' });
  assert.deepEqual([row.cartonQty, row.shipmentCartonCbm, row.grossWeight, row.netWeight], ['', '', '', '']);
});
test('invalid or fractional units per carton cannot produce invented cartons', () => {
  for (const units_per_carton of [0, -1, '40x', 2.5, true]) {
    assert.equal(project(rawLine, [c.normalizeSkuDetailsRecord({ ...rawDetail, units_per_carton })]).cartonQty, '');
  }
});
test('nonhistorical operational rows retain the original frozen objects', () => {
  const lines = [c.normalizeShipmentLineRecord(rawLine)];
  assert.equal(c._shOverviewLogistics_({ recordOrigin: 'SYSTEM' }, lines, [detail]), lines);
});
test('COUNTED imports get identical read-only logistics without changing supply mode', () => {
  const s = { ...opening, openingSupplyMode: 'COUNTED' };
  assert.equal(project(rawLine, [detail], s).cartonQty, 3);
  assert.equal(s.openingSupplyMode, 'COUNTED');
});
test('workspace include is opt-in, page-scoped and column-bounded', () => {
  assert.equal(c.shipWorkspaceBuild_(tables(), {}).skuLogistics, undefined);
  const out = c.shipWorkspaceBuild_(tables(), { filters: { shipmentId: 'S1' }, include: { skuLogistics: true } });
  assert.deepEqual(plain(out.skuLogistics), [rawDetail]);
  assert.equal(out.shipmentLines.length, 1);
});
test('missing optional SKU master returns empty references; duplicates remain detectable', () => {
  const t = tables(); delete t.sku_details;
  assert.deepEqual(plain(c.shipWorkspaceBuild_(t, { include: { skuLogistics: true } }).skuLogistics), []);
  t.sku_details = [rawDetail, rawDetail];
  assert.equal(c.shipWorkspaceBuild_(t, { include: { skuLogistics: true } }).skuLogistics.length, 2);
});
test('actual handler opens once, reads requested tables once and never writes', () => {
  const reads = [], t = tables(); let opens = 0;
  const out = c.handleShipmentWorkspaceGet_({ payload: { include: { skuLogistics: true } } }, {
    now: () => 1, nextSeq: () => 1, openTarget: () => { opens++; return {}; },
    readTable: (_, name) => { reads.push(name); return t[name] || []; }
  });
  assert.equal(out.success, true);
  assert.equal(opens, 1);
  assert.equal(reads.filter(n => n === 'sku_details').length, 1);
  assert.equal(new Set(reads).size, reads.length);
  assert(!reads.includes('factory_stock'));
  assert(!reads.includes('purchase_orders'));
});
test('workspace no-include callers do not read SKU metadata', () => {
  const reads = [];
  c.handleShipmentWorkspaceGet_({ payload: {} }, { now: () => 1, openTarget: () => ({}),
    readTable: (_, name) => { reads.push(name); return []; } });
  assert(!reads.includes('sku_details'));
});
test('page requests references on primary and targeted reads; no global master fallback', () => {
  assert(source.includes('size: 3000 }, include: { documents: true, skuLogistics: true }'));
  assert(source.includes('size: 5 }, include: { documents: true, skuLogistics: true }'));
  assert(!/getSkuDetails/.test(source.slice(source.indexOf('function _shOverviewLogistics_'), source.indexOf('function _shRenderDbCard'))));
});
test('actual import commit -> workspace -> logistics projection needs no reimport or stock write', () => {
  const { createShipmentImportWorld } = require('./helpers/shipment-import-source-world.cjs');
  const h = createShipmentImportWorld(), body = h.body();
  const preview = h.c.handleImportValidate_(body);
  assert.equal(preview.valid, true);
  const result = h.c.handleImportCommit_({ ...body, scope: { ...body.scope, ...preview.preview.server_scope }, preview_digest: preview.preview_digest });
  assert.equal(result.success, true);
  const before = h.writes(), header = h.rows('shipments')[0];
  const out = c.shipWorkspaceBuild_({ shipments: [header], shipment_lines: h.rows('shipment_lines'), sku_details: [rawDetail] }, { include: { skuLogistics: true } });
  const row = c._shOverviewLogistics_({ recordOrigin: header.record_origin }, out.shipmentLines.map(c.normalizeShipmentLineRecord), out.skuLogistics.map(c.normalizeSkuDetailsRecord))[0];
  assert.equal(row.qty, 20);
  assert.equal(row.cartonQty, 1);
  assert.equal(row.grossWeight, 10);
  assert.equal(row.netWeight, 4);
  assert.equal(h.writes(), before);
  assert.equal(h.rows('shipment_lines')[0].gross_weight, '');
  assert.equal(h.rows('factory_stock_movements').length, 0);
  assert.equal(h.rows('overseas_inventory_movements').length, 0);
});
