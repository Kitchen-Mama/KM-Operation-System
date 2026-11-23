'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createPlanningWorld } = require('./helpers/order-planning-mainline-world.cjs');

test('actual flat allocation writer -> R64 Send -> actual Request writer/flat submit -> quote -> PO', () => {
  const h = createPlanningWorld(), draft = h.generate();
  assert.equal(draft.planning_cycle, '2026-11');
  const payload = { mode: 'preview', planning_cycle: '2026-11', execution_planning_cycle: '2026', tier_scope: 'T1',
    intents: [{ company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'SKU-A', tiers: { T1: 40 } }] };
  let before = h.writes();
  const pv = h.dispatch({ action: 'sendRequestOrderOrchestration', payload });
  assert.equal(pv.success, true, JSON.stringify(pv)); assert.equal(h.writes(), before);
  const execute = { ...payload, mode: 'execute', confirmed_checksum: pv.data.confirm_with_checksum };
  const sent = h.dispatch({ action: 'sendRequestOrderOrchestration', payload: execute });
  assert.equal(sent.success, true, JSON.stringify(sent));
  assert.equal(sent.data.status, 'COMPLETED', JSON.stringify(sent));
  assert.equal(sent.data.verified_units, 40); assert.equal(sent.data.verified_headers, 1); assert.equal(sent.data.verified_lines, 1);
  assert.equal(h.rows('request_order_allocation_drafts')[0].t1_status, 'submitted');
  assert.equal(h.rows('request_orders').length, 1); assert.equal(h.rows('request_order_lines')[0].unit_cost, '');
  assert.equal(h.rows('request_order_line_sources')[0].request_allocation_draft_id, draft.request_allocation_draft_id);
  before = h.writes();
  assert.equal(h.dispatch({ action: 'sendRequestOrderOrchestration', payload: execute }).data.replayed, true);
  assert.equal(h.writes(), before);
  const roId = h.rows('request_orders')[0].request_order_id;
  for (const transition of ['submit', 'approve']) assert.equal(h.dispatch({ action: 'updateRequestOrderStatus', request_order_id: roId, transition }).success, true);
  const setup = { warehouse_id: draft.factory_id || 'WH-TW-CN-FACTORY-YOUXIN', supplier_id: 'SUP-A', supplier_name: 'Fixture Supplier' };
  const quote = h.dispatch({ action: 'createPurchaseOrderFromRequest', request_order_id: roId, purchase_setup: setup, purchase_setup_preview: true });
  assert.equal(quote.success, true, JSON.stringify(quote));
  const po = h.dispatch({ action: 'createPurchaseOrderFromRequest', request_order_id: roId, purchase_setup: setup, purchase_setup_checksum: quote.data.quote_checksum });
  assert.equal(po.success, true, JSON.stringify(po));
  assert.equal(h.rows('purchase_order_lines')[0].unit_cost, 2.5);
  assert.equal(h.rows('purchase_order_lines')[0].company, 'KM');
});
