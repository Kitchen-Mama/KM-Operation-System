const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const { extract } = require('./ad4/extract.cjs');
const source = fs.readFileSync('assets/js/pages/shipping-history.js', 'utf8');
const c = vm.createContext({});
vm.runInContext(extract(source, name => name === '_shMarketplaceLabel', () => false).map(p => p.text).join('\n'), c);
const shipment = { shipmentId: 'SHIP-A', marketplace: 'Amazon' };

test('consolidated marketplaces are listed in source order', () => {
  assert.equal(c._shMarketplaceLabel(shipment, ['Walmart', 'Target Plus', 'Shopify'].map(sourceMarketplace =>
    ({ shipmentId: 'SHIP-A', sourceMarketplace }))), 'Walmart / Target Plus / Shopify');
});
test('same-company consolidated lines still list all marketplaces', () => {
  assert.equal(c._shMarketplaceLabel(shipment, ['Amazon', 'Shopify'].map(sourceMarketplace =>
    ({ sourceCompany: 'KM', sourceMarketplace }))), 'Amazon / Shopify');
});
test('labels are trimmed and deduplicated without changing their spelling', () => {
  assert.equal(c._shMarketplaceLabel(shipment, [' Shopify ', 'shopify', '', 'Walmart', 'Walmart'].map(sourceMarketplace =>
    ({ sourceMarketplace }))), 'Shopify / Walmart');
});
test('removed lines and other shipments do not contribute labels', () => {
  assert.equal(c._shMarketplaceLabel(shipment, [
    { sourceMarketplace: 'Amazon', lineRemoved: true },
    { sourceMarketplace: 'Walmart', shipmentId: 'SHIP-OTHER' },
    { sourceMarketplace: 'Shopify', shipmentId: 'SHIP-A' }
  ]), 'Shopify');
});
test('legacy and empty shipments keep the original fallback', () => {
  assert.equal(c._shMarketplaceLabel(shipment, []), 'Amazon');
  assert.equal(c._shMarketplaceLabel(shipment, [{}]), 'Amazon');
  assert.equal(c._shMarketplaceLabel({ shipmentId: 'SHIP-A' }), '--');
});
test('reading labels does not mutate any source fact', () => {
  const lines = Object.freeze([Object.freeze({ sourceMarketplace: 'Amazon' }), Object.freeze({ sourceMarketplace: 'Shopify' })]);
  assert.equal(c._shMarketplaceLabel(Object.freeze({ ...shipment }), lines), 'Amazon / Shopify');
});
test('actual line normalizer exposes validated provenance and rejects stale source markers', () => {
  const api = fs.readFileSync('assets/js/api/operation-system-db-api.js', 'utf8');
  vm.runInContext(extract(api, name => ['normalizeShipmentLineRecord', '_kmScSource13_', '_kmScNote13_'].includes(name),
    () => false).map(p => p.text).join('\n'), c);
  const raw = { shipment_id: 'SHIP-A', shipment_line_id: 'LINE-A', shipping_plan_line_id: 'PLAN-LINE-A', sku: 'SKU-A', shipment_qty: 40 };
  raw.note = '[SC13_SOURCE:' + encodeURIComponent(JSON.stringify({ sku: 'SKU-A', plan_line_id: 'PLAN-LINE-A',
    qty: 40, company: 'KM', marketplace: 'Shopify' })) + ']';
  const line = c.normalizeShipmentLineRecord(raw);
  assert.equal(c._shMarketplaceLabel(shipment, [line]), 'Shopify');
  assert.equal(c._shMarketplaceLabel(shipment, [c.normalizeShipmentLineRecord({ ...raw, shipment_qty: 80 })]), 'Amazon');
});
test('draft renderer uses the helper and HTML escaping while Overview keeps its own label', () => {
  assert(source.includes("_shEsc(mode === 'draft' ? _shMarketplaceLabel(s, planLines) : s.marketplace || '--')"));
  assert(fs.readFileSync('index.html', 'utf8').includes('shipping-history.js?v=mixed-cartons-20261125-v1'));
});
