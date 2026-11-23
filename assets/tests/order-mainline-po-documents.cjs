const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { extract } = require('./ad4/extract.cjs');
const root = path.resolve(__dirname, '../..');
const gs = 'assets/specs/active/apps-script/';
const read = relative => {
  const name = path.basename(relative);
  const p = process.env.KM_PO_GS && ['13_procurement_handlers.gs', '39_document_runtime_service.gs'].includes(name)
    ? path.join(process.env.KM_PO_GS, name) : path.join(root, relative);
  return fs.readFileSync(p, 'utf8');
};
const fixtureSource = fs.readFileSync(path.join(root, 'assets/tests/order-mainline-phase1.cjs'), 'utf8');
const fixture = extract(fixtureSource, n => ['host', 'request', 'status', 'approved', 'convert', 'receiptBody'].includes(n),
  n => ['stockHeaders', 'movementHeaders'].includes(n)).map(x => x.text).join('\n');
const fixtureFns = new Function('assert', 'vm', 'read', 'gs', 'crypto', fixture + '\nreturn {host, approved, convert, receiptBody};')(assert, vm, read, gs, crypto);
const plain = v => JSON.parse(JSON.stringify(v));
function world() {
  const h = fixtureFns.host(), c = h.c;
  for (const name of ['34_shipment_final_output_handlers.gs', '36_document_template_handlers.gs', '37_shipment_document_file_renderer.gs', '38_document_output_folder_resolver.gs']) vm.runInContext(read(gs + name), c, { filename: name });
  const id = fixtureFns.approved(h); assert.equal(fixtureFns.convert(h, id).success, true);
  h.poId = h.rows('purchase_orders')[0].purchase_order_id;
  h.lineId = h.rows('purchase_order_lines')[0].purchase_order_line_id;
  c.SpreadsheetApp.openById = () => h.ss;
  c.prodExpectedDbId_ = () => 'SYNTHETIC';
  c.shipmentTimestamp_ = c.procurementTimestamp_;
  h.sheet('document_templates', c.DOCUMENT_TEMPLATES_HEADERS_, [{ template_id: 'PO-TEMPLATE', template_key: 'PO_FIXTURE',
    template_version: 1, document_type: 'purchase_order', related_entity_type: 'purchase_order', series: 'SERIES-A',
    factory_id: 'FACTORY-A', language: 'zh-TW', status: 'active', is_active: true,
    template_file_type: 'google_sheet', template_file_id: 'FIXTURE_TEMPLATE_FILE_123456',
    output_folder_id: 'FIXTURE_OUTPUT_FOLDER_123456', file_name_rule: 'PO_{{PO_NO}}' }]);
  const fields = [
    ['PO_NO', 'scalar', 'header', 'purchase_orders', 'po_no', 'text'],
    ['TOTAL_AMOUNT', 'scalar', 'total', 'purchase_orders', 'total_amount', 'currency'],
    ['LINE_ITEMS', 'collection', 'line', '', '', ''],
    ['SKU', 'collection_item', 'line', 'purchase_order_lines', 'sku', 'text'],
    ['UNIT_COST', 'collection_item', 'line', 'purchase_order_lines', 'unit_cost', 'currency'],
    ['LINE_AMOUNT', 'collection_item', 'line', 'purchase_order_lines', 'line_amount', 'currency'],
    ['READY_DATE', 'collection_item', 'line', 'purchase_order_lines', 'expected_completion_date', 'yyyy-MM-dd']
  ].map(([placeholder, field_type, data_scope, data_source_table, data_source_field, format_rule], i) => ({
    field_id: 'FIELD-' + i, template_id: 'PO-TEMPLATE', template_key: 'PO_FIXTURE', document_type: 'purchase_order',
    placeholder, field_type, data_scope, data_source_table, data_source_field,
    data_source_path: data_source_table ? data_source_table + '.' + data_source_field : '',
    format_rule, required: true, is_active: true, sort_order: i,
    collection_key: data_scope === 'line' ? 'LINE_ITEMS' : ''
  }));
  h.sheet('document_template_fields', c.DOCUMENT_TEMPLATE_FIELDS_HEADERS_, fields);
  h.sheet('generated_documents', c.GENERATED_DOCUMENTS_HEADERS_);
  const folders = [], files = [], template = [['{{PO_NO}}', '{{TOTAL_AMOUNT}}', '', ''], ['{{SKU}}', '{{UNIT_COST}}', '{{LINE_AMOUNT}}', '{{READY_DATE}}']];
  const io = {
    copyTemplate() { const file = { file_id: 'COPY-' + files.length, file_url: 'https://example.invalid/copy', matrix: template.map(r => r.slice()) }; files.push(file); return file; },
    readSheetMatrix(id) { return files.find(f => f.file_id === id).matrix; },
    writeSheetMatrix(id, matrix) { files.find(f => f.file_id === id).matrix = plain(matrix); },
    renameFile() {},
    exportPdf() { return { pdf_file_id: 'FIXTURE_PDF', pdf_file_url: 'https://example.invalid/pdf' }; }
  };
  c.dfoDefaultIo_ = () => io;
  c.dofProbeIo_ = () => ({ probeFolder: () => ({ ok: true }), probeFile: () => ({ ok: true, mime: 'application/vnd.google-apps.spreadsheet' }) });
  c.dofFolderIo_ = () => ({ listChildFolders: parent => folders.filter(f => f.parent === parent),
    createFolder(parent, name) { const f = { id: 'FOLDER-' + folders.length, name, parent }; folders.push(f); return { folder_id: f.id }; } });
  return Object.assign(h, { fields, files, folders, io,
    po: () => h.rows('purchase_orders')[0], lines: () => h.rows('purchase_order_lines'),
    prepare: () => c.pcPoPrepareForIssue_(h.ss, h.poId, 'fixture', '2026-11-23', '2026-11-30'),
    issue: () => c.handleUpdatePurchaseOrderStatus_({ purchase_order_id: h.poId, transition: 'issue', actor: 'fixture' }) });
}
test('actual Request conversion maps canonical PO cost, amount and working date into saved template fields', () => {
  const h = world(), p = h.prepare(); assert.equal(p.ok, true, JSON.stringify(p));
  assert.equal(p.payload.scalars.TOTAL_AMOUNT, '80');
  assert.deepEqual(plain(p.payload.collections.LINE_ITEMS), [{ SKU: 'SKU-A', UNIT_COST: '2', LINE_AMOUNT: '80', READY_DATE: '2026-12-03' }]);
  assert.equal(h.files.length, 0, 'prepare does not call Drive');
  assert.equal(h.po().supplier_expected_ready_date, '', 'do not invent a supplier commitment');
});
test('canonical values beat conflicting legacy aliases and stored rounded amount is authoritative', () => {
  const h = world(), model = h.c.dgsPoPayloadModel_(h.po(), [{ ...h.lines()[0], unit_cost: 0.3333, unit_price: 99,
    ordered_qty: 5, line_amount: 1.67, expected_ready_date: '2027-01-01' }], {});
  assert.equal(model.lines[0].unit_price, 0.3333); assert.equal(model.lines[0].unit_cost, 0.3333);
  assert.equal(model.lines[0].line_amount, 1.67); assert.equal(model.header.total_amount, 1.67);
  assert.equal(model.lines[0].expected_ready_date, '2026-12-03');
});
test('zero cost/amount remain real zeros, not legacy fallback or missing values', () => {
  const h = world(), model = h.c.dgsPoPayloadModel_({}, [{ unit_cost: 0, unit_price: 99, ordered_qty: 40, line_amount: 0 }]);
  assert.equal(model.lines[0].unit_price, 0); assert.equal(model.lines[0].line_amount, 0); assert.equal(model.header.total_amount, 0);
});
for (const value of ['', null, 'not-a-price', Infinity, true]) test('unknown canonical cost stays blank: ' + String(value), () => {
  const h = world(), model = h.c.dgsPoPayloadModel_({}, [{ unit_cost: value, unit_price: 99, line_amount: '', ordered_qty: 40 }]);
  assert.equal(model.lines[0].unit_cost, ''); assert.equal(model.lines[0].line_amount, '');
  assert.equal(model.header.total_amount, ''); assert.equal(model.totals.amount, '');
});
test('a missing line amount does not yield a partial total when other lines are priced', () => {
  const h = world(), model = h.c.dgsPoPayloadModel_({}, [{ unit_cost: 2, ordered_qty: 40, line_amount: 80 }, { unit_cost: '', line_amount: '', ordered_qty: 10 }]);
  assert.equal(model.header.total_amount, ''); assert.equal(model.totals.amount, '');
});
test('legacy-only unit_price and ready-date paths remain compatible', () => {
  const h = world(), model = h.c.dgsPoPayloadModel_({ supplier_expected_ready_date: '2026-12-09' }, [{ unit_price: 3.5, ordered_qty: 240 }]);
  assert.equal(model.lines[0].unit_price, 3.5); assert.equal(model.lines[0].line_amount, 840);
  assert.equal(model.lines[0].expected_ready_date, '2026-12-09');
});
test('canonical working dates fall back to header completion without altering supplier dates', () => {
  const h = world(), model = h.c.dgsPoPayloadModel_({ expected_completion_date: '2026-12-04', supplier_expected_ready_date: '' }, [{ sku: 'A' }]);
  assert.equal(model.lines[0].expected_completion_date, '2026-12-04'); assert.equal(model.header.supplier_expected_ready_date, '');
});
for (const patch of [{ unit_cost: 3 }, { line_amount: 120 }, { expected_completion_date: '2026-12-08' }]) test('source checksum changes for canonical fact ' + Object.keys(patch)[0], () => {
  const h = world(), before = h.c.dgsPoSourceChecksum_(h.po(), h.lines());
  assert.notEqual(h.c.dgsPoSourceChecksum_(h.po(), h.lines().map(l => ({ ...l, ...patch }))), before);
});
test('required blank money blocks before creating a registry row, folder or file', () => {
  const h = world(); h.put('purchase_order_lines', 'purchase_order_line_id', h.lineId, 'unit_cost', '');
  h.put('purchase_order_lines', 'purchase_order_line_id', h.lineId, 'line_amount', '');
  const before = h.writes(), r = h.issue(); assert.equal(r.success, false, JSON.stringify(r));
  assert.equal(h.po().order_status, 'draft'); assert.equal(h.files.length, 0); assert.equal(h.folders.length, 0);
  assert.equal(h.rows('generated_documents').length, 0); assert.equal(h.writes(), before);
});
test('actual issue -> document matrix/PDF boundary -> partial/full receipt -> stock/Overview closes the happy path', () => {
  const h = world(), issued = h.issue(); assert.equal(issued.success, true, JSON.stringify(issued));
  assert.equal(h.po().order_status, 'issued'); assert.equal(h.files.length, 1);
  assert.deepEqual(h.files[0].matrix[1], ['SKU-A', '2', '80', '2026-12-03']);
  assert.equal(h.rows('generated_documents')[0].pdf_file_id, 'FIXTURE_PDF');
  assert.equal(h.rows('factory_stock').length, 0, 'issue must not receive inventory');
  for (const qty of [10, 30]) {
    const body = fixtureFns.receiptBody(h, h.poId, h.lineId, qty), r = h.c.handleReceivePurchaseOrderLines_(body);
    assert.equal(r.success, true, JSON.stringify(r));
    const writes = h.writes(); assert.equal(h.c.handleReceivePurchaseOrderLines_(body).success, true); assert.equal(h.writes(), writes);
  }
  assert.equal(h.po().order_status, 'completed'); assert.equal(h.rows('factory_stock')[0].fac_current_stock, 40);
  const model = h.c.poMapOrder_(h.po(), {}, { [h.poId]: h.lines() }, {});
  assert.equal(model.completedQty, 40); assert.equal(model.remainingQty, 40); assert.equal(h.rows('factory_stock_movements').length, 2);
});
function generatedDraft(h) {
  const p = h.prepare(); assert.equal(p.ok, true, JSON.stringify(p));
  const r = h.c.dgsPoRenderPrepared_(h.ss, p); assert.equal(r.ok, true, JSON.stringify(r));
  const f = h.c.dgsPoFinalize_(h.ss, p, r, 'fixture'); assert.equal(f.ok, true, JSON.stringify(f));
  return p;
}
test('unchanged generated Draft reuses the current file with no extra registry rows or copies', () => {
  const h = world(); generatedDraft(h); const writes = h.writes();
  const r = h.issue(); assert.equal(r.success, true, JSON.stringify(r)); assert.equal(r.data.document_generation.reused, true);
  assert.equal(h.files.length, 1); assert.equal(h.rows('generated_documents').length, 1); assert(h.writes() > writes);
});
test('price edit after successful Draft generation supersedes old registry and renders a current file', () => {
  const h = world(); generatedDraft(h);
  const edited = h.c.handleUpdatePurchaseOrderLine_({ lines: [{ purchase_order_line_id: h.lineId, unit_cost: 3 }] });
  assert.equal(edited.success, true, JSON.stringify(edited));
  const r = h.issue(); assert.equal(r.success, true, JSON.stringify(r)); assert.equal(h.files.length, 2);
  assert.deepEqual(h.files[0].matrix[1], ['SKU-A', '2', '80', '2026-12-03']);
  assert.deepEqual(h.files[1].matrix[1], ['SKU-A', '3', '120', '2026-12-03']);
  assert.equal(h.rows('generated_documents')[0].status, 'cancelled'); assert.equal(h.rows('generated_documents')[1].status, 'regenerated');
});
test('a legacy Draft document without a verifiable checksum is regenerated, not trusted', () => {
  const h = world(); generatedDraft(h); const doc = h.rows('generated_documents')[0];
  h.put('generated_documents', 'document_id', doc.document_id, 'note', 'doc_date 2026-11-23.');
  const r = h.issue(); assert.equal(r.success, true, JSON.stringify(r)); assert.equal(h.files.length, 2);
});
test('a source edit during rendering refuses finalize and leaves PO Draft', () => {
  const h = world(), write = h.io.writeSheetMatrix;
  h.io.writeSheetMatrix = (id, matrix) => { write(id, matrix); h.put('purchase_order_lines', 'purchase_order_line_id', h.lineId, 'unit_cost', 3); };
  const r = h.issue(); assert.equal(r.success, false, JSON.stringify(r)); assert.equal(h.po().order_status, 'draft');
  assert.equal(r.document_generation.reason, 'DOCUMENT_SOURCE_DRIFT'); assert.equal(h.rows('generated_documents')[0].status, 'failed');
  assert.equal(h.rows('factory_stock').length, 0);
});
test('a source edit between reuse preparation and issue lock cannot issue an old file', () => {
  const h = world(); generatedDraft(h);
  const getLock = h.c.LockService.getScriptLock; let releases = 0;
  h.c.LockService.getScriptLock = () => { const lock = getLock(); return { tryLock: ms => lock.tryLock(ms), releaseLock() {
    lock.releaseLock(); if (++releases === 1) h.put('purchase_order_lines', 'purchase_order_line_id', h.lineId, 'unit_cost', 3);
  } }; };
  const r = h.issue(); assert.equal(r.success, false, JSON.stringify(r)); assert.equal(h.po().order_status, 'draft');
  assert.equal(r.document_generation.reason, 'DOCUMENT_SOURCE_DRIFT'); assert.equal(h.files.length, 1);
});
test('failed supersession registry update does not reserve or create a replacement', () => {
  const h = world(); generatedDraft(h); h.put('purchase_order_lines', 'purchase_order_line_id', h.lineId, 'unit_cost', 3);
  const update = h.c.dgsUpdateRegistry_; h.c.dgsUpdateRegistry_ = () => false;
  const p = h.prepare(); assert.equal(p.ok, false); assert.equal(p.reason, 'DOCUMENT_REGISTRY_WRITE_FAILED');
  assert.equal(h.files.length, 1); assert.equal(h.rows('generated_documents').length, 1); h.c.dgsUpdateRegistry_ = update;
});
test('render failure leaves Draft and marks attempt failed, without receiving stock', () => {
  const h = world(); h.io.copyTemplate = () => { throw Error('SYNTHETIC_COPY_FAILURE'); };
  const r = h.issue(); assert.equal(r.success, false, JSON.stringify(r)); assert.equal(h.po().order_status, 'draft');
  assert.equal(h.rows('generated_documents')[0].status, 'failed'); assert.equal(h.rows('factory_stock').length, 0);
});
test('legacy saved unit_price/ready-date mapping aliases read the canonical repaired facts', () => {
  const h = world(), model = h.c.dgsPoPayloadModel_(h.po(), h.lines());
  const fields = h.fields.map(f => ({ ...f,
    data_source_path: f.placeholder === 'UNIT_COST' ? 'purchase_order_lines.unit_price' : f.placeholder === 'READY_DATE' ? 'purchase_order_lines.expected_ready_date' : f.data_source_path }));
  const mapped = h.c.dgsPoMap_(model, fields);
  assert.equal(mapped.reason, ''); assert.equal(mapped.values.LINE_ITEMS[0].UNIT_COST, 2);
  assert.equal(mapped.values.LINE_ITEMS[0].READY_DATE, '2026-12-03');
});
test('registry invalidation between preparation and issue lock refuses reuse with no new file', () => {
  const h = world(); generatedDraft(h); const doc = h.rows('generated_documents')[0];
  const getLock = h.c.LockService.getScriptLock; let releases = 0;
  h.c.LockService.getScriptLock = () => { const lock = getLock(); return { tryLock: ms => lock.tryLock(ms), releaseLock() {
    lock.releaseLock(); if (++releases === 1) h.put('generated_documents', 'document_id', doc.document_id, 'status', 'cancelled');
  } }; };
  const r = h.issue(); assert.equal(r.success, false, JSON.stringify(r)); assert.equal(h.po().order_status, 'draft');
  assert.equal(r.document_generation.reason, 'DOCUMENT_REUSE_UNVERIFIED'); assert.equal(h.files.length, 1);
});
test('issued document history is not silently regenerated by this Draft-only repair', () => {
  const h = world(); assert.equal(h.issue().success, true);
  h.put('purchase_order_lines', 'purchase_order_line_id', h.lineId, 'unit_cost', 3);
  const writes = h.writes(), docs = JSON.stringify(h.rows('generated_documents'));
  const r = h.c.dgsGeneratePoDocuments_(h.ss, h.poId, 'fixture', { today: '2026-11-23' });
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.reused, true);
  assert.equal(h.files.length, 1); assert.equal(h.writes(), writes); assert.equal(JSON.stringify(h.rows('generated_documents')), docs);
});
test('line completion-date edit after Draft generation cannot reuse the old dated document', () => {
  const h = world(); generatedDraft(h);
  h.put('purchase_order_lines', 'purchase_order_line_id', h.lineId, 'expected_completion_date', '2026-12-08');
  assert.equal(h.issue().success, true); assert.equal(h.files.length, 2);
  assert.equal(h.files[0].matrix[1][3], '2026-12-03'); assert.equal(h.files[1].matrix[1][3], '2026-12-08');
});
