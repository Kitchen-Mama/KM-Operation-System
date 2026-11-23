'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { createWorld, read, plain } = require('./order-mainline-world.cjs');
const gs = 'assets/specs/active/apps-script/';
const frozenSend = 'output/dw2-workflow-20261122/release-4/candidate/Production/apps-script/66_api_v1_request_order_send.gs';

function createPlanningWorld() {
  const h = createWorld(), c = h.c;
  for (const name of ['90_generated_supply_planning_bundle.gs', '15_request_allocation_handlers.gs',
    '23_recommendation_persistence_repository.gs', '24_recommendation_orchestrator.gs', '25_recommendation_user_edit.gs', '47_api_v1_recommendation_generation.gs']) {
    vm.runInContext(read(gs + name), c, { filename: name });
  }
  const candidateSend = process.env.KM_MAINLINE_GS && path.join(process.env.KM_MAINLINE_GS, '66_api_v1_request_order_send.gs');
  vm.runInContext(candidateSend && fs.existsSync(candidateSend) ? fs.readFileSync(candidateSend, 'utf8') : read(frozenSend), c, { filename: frozenSend });
  c.requestOrderDraftV2FlatCutoverEnabled_ = () => true;
  c.RECOMMENDATION_TARGET_SPREADSHEET_ID_ = 'SYNTHETIC'; h.ss.getId = () => 'SYNTHETIC';
  const originalSheet = h.sheet;
  h.sheet = (name, headers, rows) => {
    const sh = originalSheet(name, headers, rows), getRange = sh.getRange;
    sh.getRange = (...args) => Object.assign(getRange(...args), { setNumberFormat() { return this; } });
    return sh;
  };
  h.sheet('request_order_allocation_drafts', c.KMRDV2.V2_HEADERS);
  h.sheet('recommendation_calculation_runs', c.KMPR.RUN_JOURNAL_HEADERS);
  h.sheet('warehouses', ['warehouse_id', 'is_factory_warehouse', 'is_active', 'company', 'warehouse_name'], [
    { warehouse_id: 'WH-TW-CN-FACTORY-YOUXIN', is_factory_warehouse: true, is_active: true, company: 'KM', warehouse_name: 'Fixture Planning Factory' }
  ]);
  h.sheet('supplier_price_list', ['supplier_price_id', 'sku', 'supplier_id', 'supplier_name', 'supplier_sku',
    'supplier_warehouse_id', 'unit_cost', 'currency', 'is_active', 'effective_from', 'effective_to'], [
    { supplier_price_id: 'QUOTE-A', sku: 'SKU-A', supplier_id: 'SUP-A', supplier_name: 'Fixture Supplier',
      supplier_sku: 'FACTORY-SKU-A', supplier_warehouse_id: 'WH-TW-CN-FACTORY-YOUXIN', unit_cost: 2.5,
      currency: 'USD', is_active: true, effective_from: '2026-01-01' }
  ]);
  h.put('document_templates', 'template_id', 'PO-TEMPLATE', 'factory_id', 'WH-TW-CN-FACTORY-YOUXIN');
  const properties = {};
  c.gapReadObjects_ = (_ss, name) => h.tables[name] ? h.rows(name) : [];
  const io = c.rosDefaultIo_();
  io.readTable = (_ss, name) => h.tables[name] ? h.rows(name) : [];
  // Fixture contains no ongoing POs; admission is a declared source input, not an engine under test here.
  io.ongoingAdmission = (_ss, keys) => ({ ok: true, byKey: Object.fromEntries(keys.map(k => [k, { ok: true }])) });
  io.propGet = key => properties[key] || null;
  io.propSet = (key, value) => { properties[key] = String(value); return true; };
  io.propDelete = key => { delete properties[key]; return true; };
  const originalDispatch = h.dispatch;
  h.dispatch = body => {
    if (body.action === 'requestOrder.send.orchestrate') body = { action: 'sendRequestOrderOrchestration', payload: body.payload };
    if (body.action === 'requestOrderDraft.getActive') {
      h.calls.push(plain(body));
      return plain(c.handleGetActiveRequestOrderDraftReadback_(body));
    }
    if (body.action !== 'sendRequestOrderOrchestration') return originalDispatch(body);
    h.calls.push(plain(body));
    return plain(c.handleRequestOrderSendOrchestrate_({ payload: body.payload }, io));
  };
  h.generate = () => {
    const result = c.rpoGenerateMonthlyFlatResult_({ mode: 'manual', planningCycle: '2026-11', actor: 'fixture-operator',
      businessScope: { company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'SKU-A', draft_purpose: 'regular' },
      facts: { ready: true, lines: [{ request_bucket: 'T1', request_month: '2026-12', recommended_qty: 40, units_per_carton: 10 }] } });
    assert.equal(result.success, true, JSON.stringify(result));
    return h.rows('request_order_allocation_drafts')[0];
  };
  return Object.assign(h, { sendIo: io, properties });
}
module.exports = { createPlanningWorld, frozenSend };
