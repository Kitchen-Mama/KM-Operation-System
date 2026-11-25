'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { installFactoryAtomic } = require('./factory-atomic-world.cjs');
const { extract } = require('../ad4/extract.cjs');
const { root, read, plain } = require('./order-mainline-world.cjs');
const gs = 'assets/specs/active/apps-script/';
const parts = (file, names, vars = []) => extract(read(file), n => names.includes(n), n => vars.includes(n)).map(p => p.text).join('\n');
const host = new Function('assert', 'vm', 'read', 'gs', 'crypto', parts('assets/tests/order-mainline-phase1.cjs', ['host'], ['stockHeaders', 'movementHeaders']) + '\nreturn host;')(assert, vm, read, gs, crypto);
const make = new Function('host', 'vm', 'read', 'gs', 'installFactoryAtomic', parts('assets/tests/inventory-site-sku.cjs', ['world']) + '\nreturn world;')(host, vm, read, gs, installFactoryAtomic);
const receipt = new Function(parts('assets/tests/order-mainline-phase1.cjs', ['receiptBody']) + '\nreturn receiptBody;')();
function world() {
  const h = make();
  h.body = (values = {}, id = 'UNPRODUCED-IMPORT-01') => ({ domain: 'po_factory_stock', mode: 'NEW_RECEIPT', schema_version: h.c.PFI_SCHEMA_, import_batch_id: id,
    scope: { warehouse_id: 'FACTORY-A', as_of_date: '2026-11-23' }, sheets: { StockPO: [{ __row: 2, transaction_id: id, company: 'KM', po_no: 'PO-' + id,
      warehouse_id: 'FACTORY-A', sku: 'CO1150-N', quantity: 200, unproduced_qty: 300, ordered_qty: 1000, currency: 'USD', order_date: '2026-11-22', ...values }] } });
  h.commit = body => {
    const v = h.c.handleImportValidate_(body); assert.equal(v.valid, true, JSON.stringify(v));
    const req = { ...body, preview_digest: v.preview_digest }, r = h.c.handleImportCommit_(req); assert.equal(r.success, true, JSON.stringify(r)); return { v, req, r };
  };
  h.receive = qty => { const line = h.rows('purchase_order_lines')[0]; return h.c.handleReceivePurchaseOrderLines_(receipt(h, line.purchase_order_id, line.purchase_order_line_id, qty)); };
  h.calls = [];
  h.dispatch = body => {
    h.calls.push(plain(body));
    if (body.action === 'workspace') return plain(h.c.handlePurchaseOrderWorkspaceGet_({ payload: body.payload }));
    if (body.action === 'receivePurchaseOrderLines') return plain(h.c.handleReceivePurchaseOrderLines_(body));
    throw Error('Unexpected synthetic action: ' + body.action);
  };
  return h;
}
module.exports = { world, read, root, plain };
