'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { extract } = require('../ad4/extract.cjs');
const root = path.resolve(__dirname, '../../..');
const gs = 'assets/specs/active/apps-script/';
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function parts(file, names, constants = []) {
  return extract(read(file), n => names.includes(n), n => constants.includes(n)).map(p => p.text).join('\n');
}
// Reuse the already fault-tested in-memory Sheets/Drive boundaries, not their test registrations.
const fixtureFns = new Function('assert', 'vm', 'read', 'gs', 'crypto',
  parts('assets/tests/order-mainline-phase1.cjs', ['host', 'request', 'status', 'approved', 'convert', 'receiptBody'],
    ['stockHeaders', 'movementHeaders']) + '\nreturn {host, request, approved, convert, receiptBody};'
)(assert, vm, read, gs, crypto);
const documentWorld = new Function('fixtureFns', 'vm', 'read', 'gs', 'assert', 'plain',
  parts('assets/tests/order-mainline-po-documents.cjs', ['world']) + '\nreturn world;'
)(fixtureFns, vm, read, gs, assert, plain);

function createWorld() {
  const h = documentWorld();
  for (const name of ['request_orders', 'request_order_lines', 'request_order_line_sources', 'purchase_orders', 'purchase_order_lines']) {
    h.tables[name].grid.splice(1);
  }
  h.sheet('supplier_price_list', ['sku', 'supplier_id', 'supplier_name', 'warehouse_id', 'unit_cost', 'currency', 'is_active']);
  const calls = [];
  const handlers = {
    createRequestOrderDraft: 'handleCreateRequestOrderDraft_',
    updateRequestOrderStatus: 'handleUpdateRequestOrderStatus_',
    updateRequestOrderLineQty: 'handleUpdateRequestOrderLineQty_',
    cancelRequestOrderTier: 'handleCancelRequestOrderTier_',
    createPurchaseOrderFromRequest: 'handleCreatePurchaseOrderFromRequest_',
    updatePurchaseOrderHeader: 'handleUpdatePurchaseOrderHeader_',
    updatePurchaseOrderStatus: 'handleUpdatePurchaseOrderStatus_',
    receivePurchaseOrderLines: 'handleReceivePurchaseOrderLines_'
  };
  function dispatch(body) {
    calls.push(plain(body));
    if (body.action === 'workspace') {
      const fn = body.workspace === 'requestOrder' ? 'handleRequestOrderWorkspaceGet_' :
        body.workspace === 'purchaseOrder' ? 'handlePurchaseOrderWorkspaceGet_' : '';
      assert(fn, 'Unexpected workspace: ' + body.workspace);
      const before = h.writes(), result = h.c[fn]({ payload: body.payload });
      assert.equal(h.writes(), before, 'Workspace must remain read-only');
      assert.equal(result.success, true, JSON.stringify(result));
      return plain(result);
    }
    assert(handlers[body.action], 'Unexpected action: ' + body.action);
    return plain(h.c[handlers[body.action]](body));
  }
  return Object.assign(h, { calls, dispatch, seedRequest: () => fixtureFns.request(h), receiptBody: fixtureFns.receiptBody });
}
module.exports = { createWorld, root, read, plain };
