const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { extract } = require('./ad4/extract.cjs');

const root = path.resolve(__dirname, '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const gs = 'assets/specs/active/apps-script/';
const stockHeaders = ['factory_stock_id', 'warehouse_id', 'sku', 'fac_current_stock',
  'fac_reserved_stock', 'last_transaction_at', 'created_at', 'updated_at'];
const movementHeaders = ['factory_stock_movement_id', 'movement_date', 'sku', 'warehouse_id',
  'movement_type', 'qty', 'related_entity_type', 'related_entity_id', 'before_current_stock',
  'after_current_stock', 'before_reserved_stock', 'after_reserved_stock', 'note', 'created_by', 'created_at'];

// Only platform/schema boundaries are mocked. Business handlers and reservation-book checks are real.
function host() {
  const tables = {};
  let writes = 0, clock = 0, held = false, lockCalls = 0;
  function columns(sheet, required) {
    assert(sheet, 'fixture schema must already exist');
    for (const name of required || []) assert(sheet.grid[0].includes(name), 'fixture column missing: ' + name);
  }
  const ss = {
    getSheetByName: name => tables[name] || null,
    getSpreadsheetTimeZone: () => 'Asia/Taipei'
  };
  const c = vm.createContext({
    console, Date,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush() {} },
    Session: { getScriptTimeZone: () => 'Asia/Taipei' },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      sleep() {},
      formatDate(date, zone, format) {
        const iso = new Date(date.getTime() + (zone === 'UTC' ? 0 : 8 * 3600000)).toISOString();
        return format === 'yyyy-MM-dd' ? iso.slice(0, 10) : iso.slice(0, 19).replace('T', ' ');
      },
      DigestAlgorithm: { SHA_256: 'sha256', MD5: 'md5' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (algorithm, value) => Array.from(crypto.createHash(algorithm).update(value).digest())
    },
    LockService: { getScriptLock: () => ({
      tryLock() { lockCalls++; if (held) return false; held = true; return true; },
      releaseLock() { held = false; }
    }) },
    jsonResponse_: value => value,
    sheetEnsureColumns_: columns,
    prodRequireColumns_: columns,
    prodRequireSheet_(_ss, name, required) { const sheet = tables[name]; columns(sheet, required); return sheet; },
    prodAssertDbTarget_: value => assert.equal(value, ss),
    prodSafetyBundle_: () => ({ classifySchemaMismatch({ actualHeaders, expectedHeaders }) {
      return { valid: expectedHeaders.every(header => actualHeaders.includes(header)) };
    } })
  });
  for (const name of ['12_shipment_handlers.gs', '13_procurement_handlers.gs', '14_fc_write_handlers.gs',
    '21_factory_inventory_handlers.gs', '32_shipment_line_allocation_handlers.gs', '39_document_runtime_service.gs',
    '50_api_v1_purchase_order_workspace.gs', '51_api_v1_request_order_workspace.gs']) {
    vm.runInContext(read(gs + name), c, { filename: name });
  }
  c.procurementTimestamp_ = () => '2026-11-23 10:' + String(++clock).padStart(2, '0') + ':00';
  c.procurementToday_ = () => '2026-11-23';
  c.poStampFutureCut_ = () => '2026-11-23 23:59:59';

  function sheet(name, headers, objects = []) {
    const grid = [Array.from(headers), ...objects.map(object => headers.map(key => object[key] ?? ''))];
    const sh = {
      grid,
      beforeWrite: null,
      getName: () => name,
      getLastRow: () => grid.length,
      getLastColumn: () => grid[0].length,
      getDataRange: () => ({ getValues: () => grid.map(row => row.slice()) }),
      appendRow(row) { writes++; grid.push(Array.from(row)); },
      deleteRow(row) { writes++; grid.splice(row - 1, 1); },
      getRange(row, col, height = 1, width = 1) {
        return {
          getValue: () => (grid[row - 1] || [])[col - 1] ?? '',
          getValues: () => Array.from({ length: height }, (_, i) =>
            Array.from({ length: width }, (_, j) => (grid[row - 1 + i] || [])[col - 1 + j] ?? '')),
          setValue(value) {
            if (sh.beforeWrite) sh.beforeWrite({ row, col, value });
            writes++; grid[row - 1] ||= []; grid[row - 1][col - 1] = value;
          },
          setValues(values) {
            if (sh.beforeWrite) sh.beforeWrite({ row, col, value: values });
            writes++;
            values.forEach((line, i) => {
              grid[row - 1 + i] ||= [];
              line.forEach((value, j) => { grid[row - 1 + i][col - 1 + j] = value; });
            });
          }
        };
      }
    };
    tables[name] = sh;
    return sh;
  }
  const rows = name => tables[name].grid.slice(1).map(row =>
    Object.fromEntries(tables[name].grid[0].map((header, i) => [header, row[i] ?? ''])));
  const put = (name, idKey, id, key, value) => {
    const sh = tables[name], row = sh.grid.findIndex((r, i) => i && r[sh.grid[0].indexOf(idKey)] === id);
    assert(row > 0); sh.getRange(row + 1, sh.grid[0].indexOf(key) + 1).setValue(value);
  };
  sheet('request_orders', c.REQUEST_ORDERS_HEADERS_);
  sheet('request_order_lines', c.REQUEST_ORDER_LINES_HEADERS_);
  sheet('request_order_line_sources', c.REQUEST_ORDER_LINE_SOURCES_HEADERS_);
  sheet('purchase_orders', c.PURCHASE_ORDERS_HEADERS_);
  sheet('purchase_order_lines', c.PURCHASE_ORDER_LINES_HEADERS_);
  sheet('factory_stock', stockHeaders);
  sheet('factory_stock_movements', movementHeaders);
  sheet('warehouses', ['warehouse_id', 'is_factory_warehouse', 'is_active', 'company', 'warehouse_name'], [
    { warehouse_id: 'FACTORY-A', is_factory_warehouse: true, is_active: true, company: 'KM', warehouse_name: 'Fixture Factory A' }
  ]);
  sheet('sku_details', ['sku', 'units_per_carton', 'lifecycle', 'series'], [
    { sku: 'SKU-A', units_per_carton: 10, lifecycle: 'active', series: 'SERIES-A' }
  ]);
  return { c, ss, sheet, tables, rows, put, writes: () => writes, lockCalls: () => lockCalls };
}

function request(h, buckets = ['T1']) {
  const response = h.c.handleCreateRequestOrderDraft_({
    company: 'KM', warehouse_id: 'FACTORY-A', supplier_id: 'SUP-A', supplier_name: 'Fixture Supplier', currency: 'USD',
    lines: buckets.map(request_bucket => ({ sku: 'SKU-A', company: 'KM', request_bucket, requested_qty: 40,
      units_per_carton: 10, unit_cost: 2, inspection_date: '2026-12-01',
      expected_ready_date: '2026-12-03', expected_ship_date: '2026-12-05' }))
  });
  assert.equal(response.success, true, JSON.stringify(response));
  return response.data.request_order_id;
}

function status(h, id, transition, extra = {}) {
  return h.c.handleUpdateRequestOrderStatus_({ request_order_id: id, transition, actor: 'fixture', ...extra });
}

function approved(h, buckets) {
  const id = request(h, buckets);
  assert.equal(status(h, id, 'submit').success, true);
  assert.equal(status(h, id, 'approve').success, true);
  return id;
}

function convert(h, id) {
  return h.c.handleCreatePurchaseOrderFromRequest_({ request_order_id: id, actor: 'fixture' });
}

function production(h) {
  const id = approved(h), response = convert(h, id);
  assert.equal(response.success, true, JSON.stringify(response));
  const poId = response.data.purchase_order_id;
  // Stage-one receipt fixture starts from an issued PO; this is NOT document-generation evidence.
  h.put('purchase_orders', 'purchase_order_id', poId, 'order_status', 'issued');
  return { poId, line: h.rows('purchase_order_lines')[0] };
}

function receiptBody(h, poId, lineId, qty) {
  const line = h.rows('purchase_order_lines').find(l => l.purchase_order_line_id === lineId);
  const lines = [{ purchase_order_line_id: lineId, receive_qty: qty,
    expected_completed_qty: line.completed_qty, expected_line_updated_at: line.updated_at }];
  const key = 'PORCV-UI2-' + 'a'.repeat(32) + '-' + h.c.poRcvRequestDigest_(poId, lines);
  return { purchase_order_id: poId, lines, idempotency_key: key, actor: 'fixture' };
}

test('request edit -> reject -> resubmit -> approve -> T1/T2+T3 conversion -> replay', () => {
  const h = host(), id = request(h, ['T1', 'T2', 'T3']);
  const line = h.rows('request_order_lines')[0];
  assert.equal(h.c.handleUpdateRequestOrderLineQty_({ lines: [{ request_order_line_id: line.request_order_line_id,
    approved_qty: 30 }] }).success, true);
  assert.equal(status(h, id, 'submit').success, true);
  assert.equal(status(h, id, 'reject', { rejected_reason: 'Fixture revision' }).success, true);
  assert.equal(h.rows('request_orders')[0].request_status, 'draft');
  assert.equal(convert(h, id).success, false);
  assert.equal(status(h, id, 'submit').success, true);
  assert.equal(h.rows('request_orders')[0].request_order_version, 2);
  assert.equal(status(h, id, 'approve').success, true);
  const first = convert(h, id);
  assert.equal(first.success, true, JSON.stringify(first));
  assert.equal(first.data.po_count, 2);
  assert.equal(h.rows('purchase_order_lines').reduce((sum, l) => sum + l.ordered_qty, 0), 110);
  assert.equal(h.rows('purchase_orders')[0].expected_completion_date, '2026-12-03');
  const before = h.writes(), second = convert(h, id);
  assert.equal(second.success, true);
  assert.equal(second.data.reused, true);
  assert.equal(h.writes(), before);
  assert.equal(h.rows('purchase_orders').length, 2);
});

test('partial receipt -> same-key retry -> full receipt uses real factory reservation books', () => {
  const h = host(), { poId, line } = production(h);
  const body = receiptBody(h, poId, line.purchase_order_line_id, 10);
  const partial = h.c.handleReceivePurchaseOrderLines_(body);
  assert.equal(partial.success, true, JSON.stringify(partial));
  assert.equal(partial.data.order_status, 'partial_completed');
  assert.equal(h.rows('factory_stock')[0].fac_current_stock, 10);
  const before = h.writes(), retry = h.c.handleReceivePurchaseOrderLines_(body);
  assert.equal(retry.success, true, JSON.stringify(retry));
  assert.equal(retry.data.already_recorded, true);
  assert.equal(h.writes(), before);
  const full = h.c.handleReceivePurchaseOrderLines_(receiptBody(h, poId, line.purchase_order_line_id, 30));
  assert.equal(full.success, true, JSON.stringify(full));
  assert.equal(full.data.order_status, 'completed');
  assert.equal(h.rows('factory_stock')[0].fac_current_stock, 40);
  assert.equal(h.rows('factory_stock_movements').length, 2);
  const model = h.c.poMapOrder_(h.rows('purchase_orders')[0], {}, { [poId]: h.rows('purchase_order_lines') }, {});
  assert.equal(model.completedQty, 40);
  assert.equal(model.remainingQty, 40);
  assert.equal(model.shippedQty, 0);
});

test('over-receipt and stale receipt preconditions cause zero business writes', () => {
  const h = host(), { poId, line } = production(h);
  const oldBody = receiptBody(h, poId, line.purchase_order_line_id, 10);
  let before = h.writes();
  const over = h.c.handleReceivePurchaseOrderLines_(receiptBody(h, poId, line.purchase_order_line_id, 50));
  assert.equal(over.code, 'PO_RECEIPT_EXCEEDS_REMAINING_QTY');
  assert.equal(h.writes(), before);
  assert.equal(h.c.handleReceivePurchaseOrderLines_(receiptBody(h, poId, line.purchase_order_line_id, 20)).success, true);
  before = h.writes();
  const stale = h.c.handleReceivePurchaseOrderLines_(oldBody);
  assert.equal(stale.code, 'PO_RECEIPT_PRECONDITION_STALE', JSON.stringify(stale));
  assert.equal(h.writes(), before);
});

test('draft PO cannot receive stock', () => {
  const h = host(), id = approved(h), poId = convert(h, id).data.purchase_order_id;
  const line = h.rows('purchase_order_lines')[0], before = h.writes();
  const response = h.c.handleReceivePurchaseOrderLines_(receiptBody(h, poId, line.purchase_order_line_id, 10));
  assert.equal(response.code, 'PO_RECEIPT_PO_NOT_ISSUED');
  assert.equal(h.writes(), before);
});

test('receiving more production preserves an existing shipment reservation', () => {
  const h = host(), { poId, line } = production(h);
  assert.equal(h.c.handleReceivePurchaseOrderLines_(receiptBody(h, poId, line.purchase_order_line_id, 20)).success, true);
  h.c.factoryStockAcquireReservationTx_({ stockSheet: h.tables.factory_stock,
    movSheet: h.tables.factory_stock_movements, warehouseId: 'FACTORY-A', sku: 'SKU-A',
    qty: 10, ownerId: 'SHIPMENT-FIXTURE', journal: [], now: '2026-11-23 10:20:00', createdBy: 'fixture' });
  const response = h.c.handleReceivePurchaseOrderLines_(receiptBody(h, poId, line.purchase_order_line_id, 20));
  assert.equal(response.success, true, JSON.stringify(response));
  const stock = h.rows('factory_stock')[0];
  assert.equal(stock.fac_current_stock, 40);
  assert.equal(stock.fac_reserved_stock, 10);
  assert.equal(stock.fac_current_stock - stock.fac_reserved_stock, 30);
});

test('current FIFO accepts received PO capacity and deducts other draft allocations', () => {
  const h = host(), { poId, line } = production(h);
  assert.equal(h.c.handleReceivePurchaseOrderLines_(receiptBody(h, poId, line.purchase_order_line_id, 20)).success, true);
  const po = h.rows('purchase_orders')[0], pol = h.rows('purchase_order_lines')[0];
  const joined = { ...pol, order_status: po.order_status, factory_id: po.factory_id, order_date: '2026-11-23', po_no: po.po_no };
  const scope = { shipment_line_id: 'SL-NEW', shipment_qty: 10, sku: 'SKU-A', factory_id: 'FACTORY-A', company: 'ResUS' };
  const allocation = h.c.slaAllocateShipmentLine_(scope, [joined], []);
  assert.equal(allocation.ok, true, JSON.stringify(allocation));
  assert.equal(allocation.allocations[0].allocated_qty, 10);
  const blocked = h.c.slaAllocateShipmentLine_(scope, [joined], [{ shipment_line_id: 'SL-OTHER',
    purchase_order_line_id: pol.purchase_order_line_id, allocated_qty: 15, allocation_status: 'draft' }]);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.available_capacity, 5);
});

test('Production router and public client allow all mainline actions', () => {
  const c = vm.createContext({ window: {} });
  vm.runInContext(read('production-config.js'), c);
  const router = read(gs + '01_router.gs');
  vm.runInContext(extract(router, name => name === 'rtrActionGate_', name => name === 'RTR_PRODUCTION_PROFILE_')
    .map(p => p.text).join('\n'), c);
  const actions = ['requestOrder.sendWorkset.get', 'requestOrder.send.orchestrate', 'requestOrder.send.status',
    'requestOrder.workspace.get', 'createRequestOrderDraft', 'updateRequestOrderStatus', 'updateRequestOrderLineQty',
    'cancelRequestOrderTier', 'createPurchaseOrderFromRequest', 'purchaseOrder.workspace.get',
    'updatePurchaseOrderHeader', 'updatePurchaseOrderLine', 'updatePurchaseOrderStatus', 'receivePurchaseOrderLines'];
  for (const action of actions) {
    assert(c.window.KM_PRODUCTION_CONFIG_.allowed.includes(action), 'client blocked: ' + action);
    assert.equal(c.rtrActionGate_(action, {}), null, 'server blocked: ' + action);
  }
});

test('KNOWN SOURCE DRIFT: local Send R49 differs from health R64; frozen Production R64 matches', () => {
  const c = vm.createContext({});
  vm.runInContext(extract(read(gs + '63_api_v1_system_health.gs'), () => false,
    name => name === 'SYS_MODULE_BUILD_STAMPS_').map(p => p.text).join('\n'), c);
  vm.runInContext(extract(read(gs + '66_api_v1_request_order_send.gs'), () => false,
    name => name === 'ROS_BUILD_VERSION_').map(p => p.text).join('\n'), c);
  const expected = c.SYS_MODULE_BUILD_STAMPS_.find(m => m.symbol === 'ROS_BUILD_VERSION_').expected;
  assert(expected.endsWith('-R64'));
  assert(c.ROS_BUILD_VERSION_.endsWith('-R49'));
  const frozen = read('output/dw2-workflow-20261122/release-4/candidate/Production/apps-script/66_api_v1_request_order_send.gs');
  assert.equal(crypto.createHash('sha256').update(frozen.replace(/\r\n/g, '\n')).digest('hex'),
    'baf571c1ee01d7db89ee746037b825d7420b2b1622c6447a0e867e638ee68eec');
  vm.runInContext(frozen, c);
  assert.equal(c.ROS_BUILD_VERSION_, expected);
  const draft = { request_allocation_draft_id: 'RD-FIXTURE', planning_cycle: '2026-11', company: 'KM',
    country: 'US', marketplace: 'Amazon', sku: 'SKU-A', status: 'site_confirmed', draft_version: 1,
    t1_month: '2026-12', t1_order_qty: 40, t1_status: 'draft' };
  const index = c.rosSeriesIndex_([{ sku: 'SKU-A', series: 'SERIES-A', units_per_carton: 10 }]);
  const ws = c.rosBuildWorkset_([draft], { planning_cycle: '2026-11', tier_scope: 'ALL',
    series_by_sku: index.series, units_per_carton_by_sku: index.upc });
  assert.equal(ws.rows.length, 1, JSON.stringify(ws.blocking_conflicts));
  assert.equal(ws.rows[0].order_qty, 40);
  assert.equal(ws.blocking_conflicts.length, 0);
});

test('issued-status controller leaves a Draft unchanged when document preparation refuses', () => {
  const h = host(), id = approved(h), poId = convert(h, id).data.purchase_order_id;
  h.c.pcPoPrepareForIssue_ = () => ({ ok: false, reason: 'FIXTURE_DOCUMENT_REFUSAL' });
  const before = h.writes();
  const response = h.c.handleUpdatePurchaseOrderStatus_({ purchase_order_id: poId, transition: 'issue' });
  assert.equal(response.success, false);
  assert.equal(response.document_generation.reason, 'FIXTURE_DOCUMENT_REFUSAL');
  assert.equal(h.rows('purchase_orders')[0].order_status, 'draft');
  assert.equal(h.writes(), before);
});

test('Gantt reads canonical header schedule dates, not a separate production_schedule table', () => {
  const source = read('assets/js/pages/purchase-order-list.js').replace(/^    /gm, '');
  const names = ['toMs', 'msToDate', 'renderGantt'];
  const pieces = extract(source, name => names.includes(name), () => false);
  assert.equal(pieces.length, names.length);
  const body = { innerHTML: '' };
  const c = vm.createContext({ document: { getElementById: () => body }, polGanttOpen: true,
    PO_STATUS_LABEL: { issued: 'Issued' }, num: Number, dateOnly: String, esc: String, dash: String });
  vm.runInContext(pieces.map(p => p.text).join('\n'), c);
  c.renderGantt([{ o: { purchaseOrderId: 'PO-FIXTURE', poNo: 'PO-FIXTURE', inspectionDate: '2026-12-01',
    expectedCompletionDate: '2026-12-03', expectedShipDate: '2026-12-05' }, status: 'issued',
    skuRows: [{ sku: 'SKU-A', completed: 10, shipped: 0, remaining: 10 }] }]);
  assert.match(body.innerHTML, /Inspection: 2026-12-01/);
  assert.match(body.innerHTML, /Expected Completion: 2026-12-03/);
  assert.match(body.innerHTML, /Expected Ship: 2026-12-05/);
  assert.match(body.innerHTML, /C10\/S0\/R10/);
});

// Known-defect probes assert the observed baseline, NOT that the workflow is safe.
// Keep these explicit so a passing test cannot be mistaken for full-chain acceptance.
test('KNOWN GAP: approving with a line-write failure leaves the header advanced', () => {
  const h = host(), id = request(h);
  assert.equal(status(h, id, 'submit').success, true);
  h.tables.request_order_lines.beforeWrite = () => { throw new Error('FIXTURE_LINE_WRITE_FAILURE'); };
  assert.throws(() => status(h, id, 'approve'), /FIXTURE_LINE_WRITE_FAILURE/);
  assert.equal(h.rows('request_orders')[0].request_status, 'approved');
  assert.equal(h.rows('request_order_lines')[0].line_status, 'submitted');
  assert.equal(h.lockCalls(), 0);
});

test('KNOWN GAP: concurrent reject can leave an already converted request back in Draft', () => {
  const h = host(), id = request(h);
  assert.equal(status(h, id, 'submit').success, true);
  const sh = h.tables.request_orders, statusCol = sh.grid[0].indexOf('request_status') + 1;
  let nested, converted;
  sh.beforeWrite = ({ col, value }) => {
    if (col === statusCol && value === 'draft') {
      sh.beforeWrite = null;
      nested = status(h, id, 'approve');
      converted = convert(h, id);
    }
  };
  const rejected = status(h, id, 'reject', { rejected_reason: 'Concurrent fixture rejection' });
  assert.equal(nested.success, true);
  assert.equal(converted.success, true, JSON.stringify(converted));
  assert.equal(rejected.success, true);
  assert.equal(h.rows('request_orders')[0].request_status, 'draft');
  assert.notEqual(h.rows('request_orders')[0].approved_at, '');
  assert.equal(h.rows('purchase_orders').length, 1);
  assert.equal(h.lockCalls(), 1, 'only conversion acquired a lock, reject and approve did not');
});

test('KNOWN GAP: an all-zero approved request can create a zero-quantity PO', () => {
  const h = host(), id = request(h), line = h.rows('request_order_lines')[0];
  assert.equal(h.c.handleUpdateRequestOrderLineQty_({ lines: [{ request_order_line_id: line.request_order_line_id,
    approved_qty: 0 }] }).success, true);
  assert.equal(status(h, id, 'submit').success, true);
  assert.equal(status(h, id, 'approve').success, true);
  const response = convert(h, id);
  assert.equal(response.success, true, JSON.stringify(response));
  assert.equal(h.rows('purchase_order_lines')[0].ordered_qty, 0);
  assert.equal(h.rows('purchase_orders')[0].total_qty, 0);
});

test('KNOWN GAP: PO header append failure leaves orphan lines despite compensated=true', () => {
  const h = host(), id = approved(h), sheet = h.tables.purchase_orders;
  const append = sheet.appendRow;
  sheet.appendRow = () => { throw new Error('FIXTURE_PO_HEADER_APPEND_FAILURE'); };
  const failed = convert(h, id);
  assert.equal(failed.success, false);
  assert.equal(failed.compensated, true);
  assert.equal(h.rows('purchase_orders').length, 0);
  assert.equal(h.rows('purchase_order_lines').length, 1);
  assert.notEqual(h.rows('request_order_lines')[0].purchase_order_line_id, '');
  sheet.appendRow = append;
  const retry = convert(h, id);
  assert.equal(retry.success, false);
  assert.equal(retry.error, 'PO_CREATION_ATOMICITY_GAP');
});

test('PO document canonical facts are repaired; frozen pre-fix release still reproduces the original gap', () => {
  const h = host(), id = approved(h);
  assert.equal(convert(h, id).success, true);
  const po = h.rows('purchase_orders')[0], lines = h.rows('purchase_order_lines');
  assert.equal(lines[0].unit_cost, 2);
  assert.equal(lines[0].line_amount, 80);
  assert.equal(lines[0].expected_completion_date, '2026-12-03');
  for (const file of [gs + '39_document_runtime_service.gs',
    'output/carrier-document-r3-20261123/release-1/candidate/Production/apps-script/39_document_runtime_service.gs']) {
    vm.runInContext(read(file), h.c, { filename: file });
    const model = h.c.dgsPoPayloadModel_(po, lines, {});
    const fixed = file === gs + '39_document_runtime_service.gs';
    assert.equal(model.lines[0].unit_price, fixed ? 2 : 0);
    assert.equal(model.lines[0].line_amount, fixed ? 80 : 0);
    assert.equal(model.totals.amount, fixed ? 80 : 0);
    assert.equal(model.lines[0].expected_ready_date, fixed ? '2026-12-03' : '');
    const checksum = h.c.dgsPoSourceChecksum_(po, lines);
    const changed = lines.map(l => ({ ...l, unit_cost: 3, line_amount: 120 }));
    if (fixed) assert.notEqual(h.c.dgsPoSourceChecksum_(po, changed), checksum);
    else assert.equal(h.c.dgsPoSourceChecksum_(po, changed), checksum, 'historical baseline only');
  }
});
