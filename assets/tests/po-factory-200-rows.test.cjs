'use strict';
// PO200 (2026-11-27) - Import PO and Factory Stock accepts 200 data rows per file as ONE batch and ONE atomic request.
// Runs the real 78_ / 79_ / 81_ / 82_ / 82a_ in memory (helpers/po-factory-unproduced-world.cjs). Synthetic data only:
// no network, no Apps Script service, no configuration file.
//
// WHAT THIS CANNOT SHOW: that Google Sheets accepts a request of this size, or how long Apps Script takes. The byte and
// request counts below are exact for the request this code builds; the timings are Node timings of a mock. The native
// 200-row run is NOT_RUN (isolated Sandbox, Owner / Codex).
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const { world, read, root } = require('./helpers/po-factory-unproduced-world.cjs');

const books = ['purchase_orders', 'purchase_order_lines', 'factory_stock', 'factory_stock_movements', 'import_batch_changes'];
const snapshot = h => JSON.stringify(books.map(n => h.tables[n].grid));
const realId = n => 'PFI-auto-' + String(n).repeat(64).slice(0, 64);          // the length of an id the page generates (73 characters)
const skuName = i => 'ROW200-' + String(i).padStart(3, '0');
const bytesOf = call => Buffer.byteLength(JSON.stringify(call.requests));
const evidence = [];

// a world that knows N extra SKUs, with every whole-tab read of a live sheet counted
function bigWorld(n) {
  const h = world();
  h.sheet('sku_regional_details', ['sku', 'site_sku'], Array.from({ length: n }, (_, i) => ({ sku: 'CO1150-N', site_sku: skuName(i) })));
  h.reads = 0; h.counting = false;
  Object.keys(h.tables).forEach(name => { const t = h.tables[name], g = t.getDataRange.bind(t); t.getDataRange = () => { if (h.counting) h.reads++; return g(); }; });
  return h;
}
// n rows: shape 'onepo' = one PO, n SKUs; 'manypo' = n POs of one line, every second one on the same SKU; 'mixed' = 20 POs x 10 SKUs
function fileOf(h, n, shape, id) {
  const b = h.body({}, id || realId(1)), first = b.sheets.StockPO[0];
  b.sheets.StockPO = Array.from({ length: n }, (_, i) => {
    const row = { ...first, __row: i + 2, sku: skuName(i) };
    if (shape === 'manypo') { row.po_no = 'PO-MANY-' + String(i).padStart(3, '0'); if (i % 2) row.sku = 'CO1150-N'; }
    if (shape === 'mixed') { row.po_no = 'PO-MIX-' + String(Math.floor(i / 10)).padStart(2, '0'); row.sku = skuName(i % 10); }
    return row;
  });
  return b;
}
function run(h, body, label) {
  const calls = h.atomic.calls.length; h.reads = 0; h.counting = true;
  const t0 = Date.now(), v = h.c.handleImportValidate_(body), t1 = Date.now(), readsValidate = h.reads; h.reads = 0;
  const r = v.valid ? h.c.handleImportCommit_({ ...body, preview_digest: v.preview_digest }) : null, t2 = Date.now(), readsCommit = h.reads; h.counting = false;
  const call = h.atomic.calls[calls], m = { label, rows: body.sheets.StockPO.length, valid: v.valid, success: !!(r && r.success), atomic_calls: h.atomic.calls.length - calls,
    requests: call ? call.requests.length : 0, bytes: call ? bytesOf(call) : 0, whole_tab_reads_validate: readsValidate, whole_tab_reads_commit: readsCommit,
    node_ms_validate: t1 - t0, node_ms_commit: t2 - t1 };
  if (label) evidence.push(m);
  return { v, r, m, call, req: { ...body, preview_digest: v.preview_digest } };
}
// the exported rows of the lines a previous batch created, ready to be sent back in `mode`
function exported(h, mode, n, id, edit) {
  const t = h.c.handleImportTemplateGet_({ domain: 'po_factory_stock', mode, scope: { warehouse_id: 'FACTORY-A' }, include_data: true });
  assert.equal(t.success, true, JSON.stringify(t).slice(0, 300));
  return { domain: 'po_factory_stock', mode, schema_version: h.c.PFI_SCHEMA_, import_batch_id: id, scope: { warehouse_id: 'FACTORY-A', as_of_date: '2026-11-23' },
    sheets: { StockPO: t.sheets[0].rows.slice(0, n).map((r, i) => { const o = { ...r, transaction_id: id, __row: i + 2 }; delete o.note; edit(o, r); return o; }) } };
}

test('the limit is 200 on both sides, and the browser module names the same number', () => {
  const h = world();
  assert.equal(h.c.PFI_MAX_INPUT_ROWS_, 200); assert.equal(h.c.imbPoFactoryDomain_().maxRows, 200);
  const page = read('assets/js/utils/po-factory-import.js');
  assert.match(page, /var MAX_ROWS = 200;/); assert.match(page, /rows\.length > MAX_ROWS/); assert.doesNotMatch(page, /At most 25 rows/);
  assert.doesNotMatch(read('assets/specs/active/apps-script/82_api_v1_po_factory_import.gs'), /At most 25 rows/);
});

test('0 / 25 / 26 / 199 / 200 rows commit as one atomic call; 201 is refused before any read or write', () => {
  const h0 = bigWorld(1), b0 = fileOf(h0, 1, 'onepo'); b0.sheets.StockPO = [{ ...b0.sheets.StockPO[0], row_type: 'example' }];
  const w0 = h0.writes(), v0 = h0.c.handleImportValidate_(b0);
  assert.notEqual(v0.valid, true); assert.match(JSON.stringify(v0), /IMPORT_EMPTY/); assert.equal(h0.writes(), w0); assert.equal(h0.atomic.calls.length, 0);
  for (const n of [25, 26, 199, 200]) {
    const h = bigWorld(n), x = run(h, fileOf(h, n, 'onepo'), 'boundary ' + n + ' rows, one PO');
    assert.equal(x.v.valid, true, JSON.stringify(x.v).slice(0, 400)); assert.equal(x.r.success, true, JSON.stringify(x.r).slice(0, 400));
    assert.equal(x.m.atomic_calls, 1); assert.equal(h.rows('purchase_order_lines').length, n); assert.equal(h.rows('factory_stock').length, n);
    assert.equal(h.rows('import_batches').length, 1); assert.equal(h.rows('import_batches')[0].status, 'COMMITTED');
  }
  const h = bigWorld(201), b = fileOf(h, 201, 'onepo'), before = snapshot(h), w = h.writes(); h.counting = true;
  const v = h.c.handleImportValidate_(b);
  assert.equal(v.success, false); assert.match(JSON.stringify(v), /IMPORT_TOO_MANY_ROWS/); assert.match(JSON.stringify(v), /limit is 200/);
  const c = h.c.handleImportCommit_({ ...b, preview_digest: 'x' }); h.counting = false;
  assert.equal(c.success, false); assert.equal(c.writes_performed, 0);
  assert.equal(h.writes(), w); assert.equal(snapshot(h), before); assert.equal(h.atomic.calls.length, 0); assert.equal(h.rows('import_batches').length, 0);
  // RECORD (unchanged behaviour): the shared row count in 78_ counts every row it is SENT. The page drops the template's example row before
  // sending (import-batch.js), so a 200-row file is 200; a direct caller that sends the example row as well is sending 201 and is refused.
  const hs = bigWorld(200), bs = fileOf(hs, 200, 'onepo'); bs.sheets.StockPO.unshift({ ...bs.sheets.StockPO[0], row_type: 'example', sku: 'EXAMPLE-SKU', po_no: 'EXAMPLE-PO', __row: 1 });
  const ws = hs.writes(), vs = hs.c.handleImportValidate_(bs); assert.equal(vs.success, false); assert.match(JSON.stringify(vs), /IMPORT_TOO_MANY_ROWS/); assert.equal(hs.writes(), ws);
  // 199 data rows + the example row: accepted, and the example row is not imported
  const he = bigWorld(199), be = fileOf(he, 199, 'onepo'); be.sheets.StockPO.unshift({ ...be.sheets.StockPO[0], row_type: 'example', sku: 'EXAMPLE-SKU', po_no: 'EXAMPLE-PO', __row: 1 });
  const xe = run(he, be); assert.equal(xe.r.success, true, JSON.stringify(xe.v).slice(0, 300)); assert.equal(he.rows('purchase_order_lines').length, 199); assert.equal(he.rows('purchase_orders').length, 1);
  // the domain's own message, reached when the shared row count is not the one that refuses
  const hd = bigWorld(1); hd.c.PFI_MAX_INPUT_ROWS_ = 1; const vd = hd.c.pfiValidate_(hd.ss, { id: 'X', mode: 'NEW_RECEIPT', scope: {}, sheets: { StockPO: [{}, {}] } });
  assert.equal(vd.issues[0].code, 'PFI_BATCH_TOO_LARGE'); assert.match(vd.issues[0].message, /At most 1 rows/);
});

test('200 rows, one PO: every business result, one receipt, one atomic call', () => {
  const h = bigWorld(200), body = fileOf(h, 200, 'onepo'), x = run(h, body, '200 new lines on one PO');
  assert.equal(x.r.success, true, JSON.stringify(x.r).slice(0, 400));
  assert.equal(x.m.atomic_calls, 1); assert.equal(x.r.result.atomic_commit, true); assert.equal(x.r.result.readback_verified, true);
  const lines = h.rows('purchase_order_lines'), stock = h.rows('factory_stock'), mv = h.rows('factory_stock_movements'), po = h.rows('purchase_orders');
  assert.equal(po.length, 1); assert.equal(lines.length, 200); assert.equal(stock.length, 200); assert.equal(mv.length, 200);
  assert.deepEqual([...new Set(lines.map(l => l.sku))].sort(), Array.from({ length: 200 }, (_, i) => skuName(i)));
  for (const l of lines) { assert.equal(l.ordered_qty, 1000); assert.equal(l.remaining_qty, 200); assert.equal(l.completed_qty, 700); assert.equal(l.shipped_qty, 500); assert.equal(l.import_batch_id, body.import_batch_id); assert.equal(l.purchase_order_id, po[0].purchase_order_id); }
  for (const s of stock) { assert.equal(s.fac_current_stock, 200); assert.equal(Number(s.fac_reserved_stock || 0), 0); }
  assert.equal(stock.reduce((a, s) => a + s.fac_current_stock, 0), 40000);
  const last = lines.filter(l => l.sku === skuName(199)); assert.equal(last.length, 1);                      // the last row of the file landed
  assert.equal(stock.filter(s => s.sku === skuName(199)).length, 1); assert.equal(mv.filter(m => m.sku === skuName(199)).length, 1);
  const receipt = h.rows('import_batches'); assert.equal(receipt.length, 1); assert.equal(receipt[0].status, 'COMMITTED'); assert.equal(receipt[0].import_batch_id, body.import_batch_id);
  assert.equal(JSON.parse(receipt[0].result_json).atomic_commit, true); assert.equal(JSON.parse(receipt[0].row_counts_json).reject, 0);
  const audit = h.rows('import_batch_changes'); assert.equal(audit.length, x.r.result.audit_rows); assert(audit.length > 4000, 'the audit is kept in full: ' + audit.length);
  assert.equal(audit.every(a => a.import_batch_id === body.import_batch_id), true);
  // the request: a handful of blocks, well under the cap, and the readback covers every written cell
  assert(x.m.requests <= 12, 'requests ' + x.m.requests); assert(x.m.bytes < h.c.PFA_MAX_BYTES_, 'bytes ' + x.m.bytes); assert.equal(x.r.writes_performed > 50000, true);
  // replay of the same batch: nothing applied again
  const w = h.writes(), again = h.c.handleImportCommit_(x.req);
  assert.equal(again.replayed, true); assert.equal(h.writes(), w); assert.equal(h.atomic.calls.length, 1); assert.equal(h.rows('factory_stock_movements').length, 200);
  // the same id with different content is refused
  const other = fileOf(h, 200, 'onepo', body.import_batch_id); other.sheets.StockPO[0].quantity = 201;
  const conflict = h.c.handleImportCommit_({ ...other, preview_digest: x.req.preview_digest });
  assert.equal(conflict.code, 'IMPORT_BATCH_CONFLICT'); assert.equal(h.atomic.calls.length, 1);
});

test('200 rows across 200 POs (same SKU on half of them) and 20 POs x 10 SKUs', () => {
  const h = bigWorld(200), x = run(h, fileOf(h, 200, 'manypo'), '200 new POs, one line each');
  assert.equal(x.r.success, true, JSON.stringify(x.r).slice(0, 400)); assert.equal(x.m.atomic_calls, 1);
  assert.equal(h.rows('purchase_orders').length, 200); assert.equal(h.rows('purchase_order_lines').length, 200);
  const stock = h.rows('factory_stock'); assert.equal(stock.length, 101);
  assert.equal(stock.filter(s => s.sku === 'CO1150-N')[0].fac_current_stock, 100 * 200);                    // one SKU received on 100 different POs
  assert.equal(stock.reduce((a, s) => a + s.fac_current_stock, 0), 40000);
  assert.equal(new Set(h.rows('purchase_order_lines').map(l => l.purchase_order_id)).size, 200);
  assert(x.m.bytes < h.c.PFA_MAX_BYTES_, 'bytes ' + x.m.bytes); assert(x.m.requests <= 12);
  const h2 = bigWorld(10), x2 = run(h2, fileOf(h2, 200, 'mixed'), '20 POs x 10 SKUs');
  assert.equal(x2.r.success, true, JSON.stringify(x2.v).slice(0, 400)); assert.equal(h2.rows('purchase_orders').length, 20); assert.equal(h2.rows('purchase_order_lines').length, 200);
  assert.equal(h2.rows('factory_stock').length, 10); assert.equal(h2.rows('factory_stock').every(s => s.fac_current_stock === 20 * 200), true); assert.equal(x2.m.atomic_calls, 1);
});

test('200 existing lines: New receipt and Update current data; the number of sheet reads does not grow with the file', () => {
  const reads = {};
  for (const n of [25, 200]) for (const mode of ['NEW_RECEIPT', 'UPDATE_REMAINING']) {
    const h = bigWorld(n); run(h, fileOf(h, n, 'onepo'));
    h.c.imbNow_ = () => '2026-11-23 10:05:00';
    const body = exported(h, mode, n, realId(2), (o, r) => { if (mode === 'NEW_RECEIPT') { o.quantity = 10; delete o.unproduced_qty; } else o.quantity = Number(r.quantity) - 5; });
    const x = run(h, body, mode + ' on ' + n + ' existing lines');
    assert.equal(x.v.valid, true, JSON.stringify(x.v).slice(0, 500)); assert.equal(x.r.success, true, JSON.stringify(x.r).slice(0, 400)); assert.equal(x.m.atomic_calls, 1);
    reads[mode + n] = [x.m.whole_tab_reads_validate, x.m.whole_tab_reads_commit];
    const lines = h.rows('purchase_order_lines'), stock = h.rows('factory_stock');
    assert.equal(lines.length, n); assert.equal(h.rows('purchase_orders').length, 1); assert.equal(h.rows('factory_stock_movements').length, 2 * n);
    for (const l of lines) { assert.equal(l.shipped_qty, 500); assert.equal(l.ordered_qty, 1000); assert.equal(l.remaining_qty, mode === 'NEW_RECEIPT' ? 210 : 195); assert.equal(l.completed_qty, mode === 'NEW_RECEIPT' ? 710 : 695); }
    for (const s of stock) { assert.equal(s.fac_current_stock, mode === 'NEW_RECEIPT' ? 210 : 195); assert.equal(Number(s.fac_reserved_stock || 0), 0); }
    // the exported file is now stale: sending it again (new id) changes nothing
    const before = snapshot(h), stale = { ...body, import_batch_id: realId(3), sheets: { StockPO: body.sheets.StockPO.map(r => ({ ...r, transaction_id: realId(3) })) } };
    const sv = h.c.handleImportValidate_(stale); assert.notEqual(sv.valid, true); assert.match(JSON.stringify(sv.issues), /PFI_STALE_EXPORT/); assert.equal(snapshot(h), before);
  }
  assert.deepEqual(reads.NEW_RECEIPT200, reads.NEW_RECEIPT25, 'New receipt reads grow with rows: ' + JSON.stringify(reads));
  assert.deepEqual(reads.UPDATE_REMAINING200, reads.UPDATE_REMAINING25, 'Update reads grow with rows: ' + JSON.stringify(reads));
});

test('reserved stock, an unchanged row and a row below reserved at 200 rows', () => {
  const h = bigWorld(200); run(h, fileOf(h, 200, 'onepo'));
  const st = h.tables.factory_stock, cr = st.grid[0].indexOf('fac_reserved_stock'), cs = st.grid[0].indexOf('sku');
  st.grid.forEach((r, i) => { if (i && r[cs] === skuName(7)) r[cr] = 150; });
  h.c.imbNow_ = () => '2026-11-23 10:05:00';
  // target 100 on the reserved SKU is below its 150 reserved: the whole file is refused, nothing written
  const bad = exported(h, 'UPDATE_REMAINING', 200, realId(4), (o, r) => { o.quantity = r.sku === skuName(7) ? 100 : Number(r.quantity); });
  const before = snapshot(h), bv = h.c.handleImportValidate_(bad);
  assert.notEqual(bv.valid, true); assert.match(JSON.stringify(bv.issues), /PFI_BELOW_RESERVED/); assert.equal(snapshot(h), before); assert.equal(h.atomic.calls.length, 1);
  // one row changed, 199 unchanged: only that line, its stock row and one movement move
  const one = exported(h, 'UPDATE_REMAINING', 200, realId(5), (o, r) => { o.quantity = r.sku === skuName(7) ? 180 : Number(r.quantity); });
  const x = run(h, one); assert.equal(x.r.success, true, JSON.stringify(x.v).slice(0, 400));
  assert.equal(h.rows('factory_stock_movements').length, 201);
  const s7 = h.rows('factory_stock').filter(s => s.sku === skuName(7))[0]; assert.equal(s7.fac_current_stock, 180); assert.equal(s7.fac_reserved_stock, 150);
  assert.equal(h.rows('factory_stock').filter(s => s.sku !== skuName(7)).every(s => s.fac_current_stock === 200), true);
  assert.equal(h.rows('purchase_order_lines').filter(l => l.sku !== skuName(7)).every(l => l.remaining_qty === 200 && l.updated_at === '2026-11-23 10:00:00'), true);
});

test('a duplicate line, an unknown SKU and a bad row among 200: refused or skipped exactly as with a small file', () => {
  const h = bigWorld(200), b = fileOf(h, 200, 'onepo'); b.sheets.StockPO[199] = { ...b.sheets.StockPO[0], __row: 201 };
  const before = snapshot(h), v = h.c.handleImportValidate_(b);
  assert.notEqual(v.valid, true); assert.match(JSON.stringify(v.issues), /PFI_FILE_DUPLICATE_LINE/); assert.equal(v.issues[0].row, 201); assert.equal(snapshot(h), before);
  const h2 = bigWorld(200), b2 = fileOf(h2, 200, 'onepo'); b2.sheets.StockPO[150].quantity = -1;
  const v2 = h2.c.handleImportValidate_(b2); assert.notEqual(v2.valid, true); assert.equal(v2.issues[0].row, 152); assert.equal(h2.atomic.calls.length, 0);
  const h3 = bigWorld(199), b3 = fileOf(h3, 200, 'onepo');                                            // the 200th SKU is not in the product list
  const x3 = run(h3, b3); assert.equal(x3.r.success, true, JSON.stringify(x3.v).slice(0, 300));
  assert.equal(x3.v.preview.skipped.unknown_sku, 1); assert.equal(x3.v.preview.skipped.rows[0].row, 201); assert.equal(h3.rows('purchase_order_lines').length, 199);
});

test('failure at 200 rows: lost response, rejected request, corrupt readback, cap, missing service', () => {
  let h = bigWorld(200), x0 = fileOf(h, 200, 'onepo'), v = h.c.handleImportValidate_(x0), req = { ...x0, preview_digest: v.preview_digest };
  h.atomic.afterApply = () => { throw Error('SYNTHETIC_RESPONSE_LOST'); };
  let r = h.c.handleImportCommit_(req); assert.equal(r.success, true, JSON.stringify(r).slice(0, 300)); assert.equal(r.recovered_response, true);
  assert.equal(h.atomic.calls.length, 1); assert.equal(h.rows('factory_stock_movements').length, 200); assert.equal(h.rows('import_batches')[0].status, 'COMMITTED');
  h.atomic.afterApply = null; const again = h.c.handleImportCommit_(req); assert.equal(again.replayed, true); assert.equal(h.atomic.calls.length, 1);

  h = bigWorld(200); x0 = fileOf(h, 200, 'onepo'); v = h.c.handleImportValidate_(x0); req = { ...x0, preview_digest: v.preview_digest };
  let before = snapshot(h); h.atomic.beforeApply = () => { throw Error('SYNTHETIC_API_REJECT'); };
  r = h.c.handleImportCommit_(req); assert.equal(r.code, 'IMPORT_OUTCOME_UNKNOWN'); assert.equal(r.retry_safe, false); assert.equal(snapshot(h), before);
  assert.equal(h.rows('import_batches')[0].status, 'COMMITTING');
  h.atomic.beforeApply = null; const retry = h.c.handleImportCommit_(req);                                   // no blind resend: the intent blocks it
  assert.equal(retry.code, 'IMPORT_BATCH_OUTCOME_UNKNOWN'); assert.equal(h.atomic.calls.length, 1); assert.equal(snapshot(h), before);

  h = bigWorld(200); x0 = fileOf(h, 200, 'onepo'); v = h.c.handleImportValidate_(x0); req = { ...x0, preview_digest: v.preview_digest };
  h.atomic.afterApply = () => { const t = h.tables.factory_stock; t.grid[200][t.grid[0].indexOf('fac_current_stock')] = 1; };   // the LAST stock row reads back wrong
  r = h.c.handleImportCommit_(req); assert.equal(r.success, false); assert.equal(r.code, 'IMPORT_OUTCOME_UNKNOWN'); assert.equal(r.retry_safe, false); assert.equal(h.atomic.calls.length, 1);

  h = bigWorld(200); x0 = fileOf(h, 200, 'onepo'); v = h.c.handleImportValidate_(x0); req = { ...x0, preview_digest: v.preview_digest }; before = snapshot(h);
  h.atomic.beforeApply = body => body.requests.push({ updateCells: { start: { sheetId: h.tables.factory_stock.getSheetId(), rowIndex: 1, columnIndex: 9000 }, rows: [{ values: [{ userEnteredValue: { numberValue: 1 } }] }], fields: 'userEnteredValue' } });
  r = h.c.handleImportCommit_(req); assert.equal(r.code, 'IMPORT_OUTCOME_UNKNOWN'); assert.equal(snapshot(h), before);

  for (const kind of ['cap', 'service', 'module']) {
    h = bigWorld(200); x0 = fileOf(h, 200, 'onepo'); v = h.c.handleImportValidate_(x0); req = { ...x0, preview_digest: v.preview_digest }; before = snapshot(h); const w = h.writes();
    if (kind === 'cap') h.c.PFA_MAX_BYTES_ = 3000000; else if (kind === 'service') h.c.Sheets = undefined; else h.c.pfaCommit_ = undefined;
    r = h.c.handleImportCommit_(req); assert.equal(r.success, false);
    assert.match(r.code, kind === 'cap' ? /^IMPORT_ATOMIC_PAYLOAD_TOO_LARGE$/ : /^IMPORT_ATOMIC_/);
    assert.equal(h.writes(), w); assert.equal(snapshot(h), before); assert.equal(h.atomic.calls.length, 0); assert.equal(h.rows('import_batches').length, 0);   // not even an intent receipt
  }
});

test('a file whose content makes the request larger than the cap is refused before the intent, with nothing written', () => {
  // 200 new POs whose notes are as long as a cell may be (2,000 characters): the note is stored on the line AND in its audit row
  const h = bigWorld(200), b = fileOf(h, 200, 'manypo'); b.sheets.StockPO.forEach(r => { r.note = 'N'.repeat(2000); });
  const before = snapshot(h), w = h.writes(), v = h.c.handleImportValidate_(b);
  if (v.valid !== true) { assert.equal(h.writes(), w); assert.equal(snapshot(h), before); evidence.push({ label: '200 new POs with 2,000-character notes', refused_at: 'validate', code: JSON.stringify(v.issues || v.code).slice(0, 120) }); return; }
  const r = h.c.handleImportCommit_({ ...b, preview_digest: v.preview_digest });
  if (r.success) { assert(bytesOf(h.atomic.calls[0]) <= h.c.PFA_MAX_BYTES_); evidence.push({ label: '200 new POs with 2,000-character notes', success: true, bytes: bytesOf(h.atomic.calls[0]) }); return; }
  assert.equal(r.code, 'IMPORT_ATOMIC_PAYLOAD_TOO_LARGE'); assert.equal(r.business_writes_performed, 0); assert.equal(r.retry_safe, true);
  assert.equal(h.writes(), w); assert.equal(snapshot(h), before); assert.equal(h.atomic.calls.length, 0); assert.equal(h.rows('import_batches').length, 0);
  evidence.push({ label: '200 new POs with 2,000-character notes', refused_at: 'commit, before the intent receipt', code: r.code });
});

test('the compacted request writes the same cells as the old one, and never an existing row it did not change', () => {
  // the same 25-row file through the baseline 82a (939e6365, via git show into a temp folder) and through this one
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'po200-base-'));
  fs.writeFileSync(path.join(dir, '82a_factory_atomic_commit.gs'), execFileSync('git', ['-C', root, 'show', '939e6365:assets/specs/active/apps-script/82a_factory_atomic_commit.gs'], { encoding: 'utf8' }));
  const grids = {}, shape = {};
  for (const arm of ['base', 'candidate']) {
    if (arm === 'base') process.env.KM_MAINLINE_GS = dir; else delete process.env.KM_MAINLINE_GS;
    const h = bigWorld(25); delete process.env.KM_MAINLINE_GS;
    assert.equal(h.c.PFA_BUILD_VERSION_, arm === 'base' ? 'FACTORY-ATOMIC-1-20261125' : 'FACTORY-ATOMIC-2-20261127-PO200');
    const x = run(h, fileOf(h, 25, 'manypo', realId(6))); assert.equal(x.r.success, true, JSON.stringify(x.r).slice(0, 300));
    h.c.imbNow_ = () => '2026-11-23 10:05:00';
    const y = run(h, exported(h, 'UPDATE_REMAINING', 25, realId(7), (o, r) => { o.quantity = Number(r.quantity) - 5; })); assert.equal(y.r.success, true);
    // two things differ between any two runs and are not differences in what is stored: the mock keeps a never-written cell as a hole
    // where a cleared cell is '' (both are an empty cell), and a movement id carries a random suffix
    grids[arm] = JSON.stringify(Object.keys(h.tables).sort().map(n => [n, h.tables[n].grid.map(r => { const o = Array.from(r, c => (c === undefined || c === null ? '' : c)); while (o.length && o[o.length - 1] === '') o.pop(); return o; })]))
      .replace(/FSMV-[0-9a-f]{8}/g, 'FSMV-*');
    shape[arm] = { new_requests: x.m.requests, new_bytes: x.m.bytes, new_checks: x.r.writes_performed, update_requests: y.m.requests, update_bytes: y.m.bytes, update_checks: y.r.writes_performed };
  }
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(grids.candidate, grids.base, 'every tab holds the same values after both arms');
  assert.equal(shape.candidate.new_checks, shape.base.new_checks, 'the readback checks the same cells'); assert.equal(shape.candidate.update_checks, shape.base.update_checks);
  assert(shape.candidate.new_requests < shape.base.new_requests / 50); assert(shape.candidate.new_bytes < shape.base.new_bytes);
  evidence.push({ label: 'same 25-PO file, baseline 82a vs this 82a', base: shape.base, candidate: shape.candidate });

  // unit: an existing row keeps the per-cell path; new rows become one block; a blank is an empty CellData; a Date row keeps its own path
  const h = world(), d = new Date(Date.UTC(2026, 10, 27, 2, 0, 0));
  const table = { live: { getSheetId: () => 7, getMaxColumns: () => 6, getMaxRows: () => 3 }, proxy: { getLastColumn: () => 6 }, isDirty: () => true,
    before: [['a', 'b', 'c', 'd', 'e', 'f'], ['x', 1, '', 'keep', '', '']],
    grid: [['a', 'b', 'c', 'd', 'e', 'f'], ['x', 2, '', 'keep', '', ''], ['n1', '', 5, '', 'z'], ['n2', true, '', '', '', ''], ['n3', d, 'q'], [], ['n5']] };
  const out = h.c.pfaRequests_({ cache: { T: table, clean: { isDirty: () => false }, none: null } }, 'Asia/Taipei');
  const q = JSON.parse(JSON.stringify(out.requests));
  assert.deepEqual(q[0], { appendDimension: { sheetId: 7, dimension: 'ROWS', length: 4 } });
  assert.deepEqual(q[1], { updateCells: { start: { sheetId: 7, rowIndex: 1, columnIndex: 1 }, rows: [{ values: [{ userEnteredValue: { numberValue: 2 } }] }], fields: 'userEnteredValue' } });   // only the changed cell of the existing row
  assert.deepEqual(q[2], { updateCells: { start: { sheetId: 7, rowIndex: 2, columnIndex: 0 }, fields: 'userEnteredValue', rows: [
    { values: [{ userEnteredValue: { stringValue: 'n1' } }, {}, { userEnteredValue: { numberValue: 5 } }, {}, { userEnteredValue: { stringValue: 'z' } }] },
    { values: [{ userEnteredValue: { stringValue: 'n2' } }, { userEnteredValue: { boolValue: true } }] }] } });                                              // trailing blanks are not sent
  assert.equal(q[3].updateCells.start.rowIndex, 4); assert.equal(q[3].updateCells.start.columnIndex, 0); assert.equal(q[3].updateCells.fields, 'userEnteredValue'); assert.equal(q[3].updateCells.rows[0].values.length, 1);
  assert.equal(q[4].updateCells.fields, 'userEnteredValue,userEnteredFormat.numberFormat'); assert.deepEqual(q[4].updateCells.start, { sheetId: 7, rowIndex: 4, columnIndex: 1 }); assert.equal(q[4].updateCells.rows[0].values.length, 1);
  assert.equal(q[5].updateCells.start.columnIndex, 2);                                                                                                       // the Date row: per-run requests, the format mask only on the date
  assert.deepEqual(q[6], { updateCells: { start: { sheetId: 7, rowIndex: 6, columnIndex: 0 }, rows: [{ values: [{ userEnteredValue: { stringValue: 'n5' } }] }], fields: 'userEnteredValue' } });   // the empty row 6 breaks the block
  assert.equal(q.length, 7);
  assert.deepEqual(Array.from(out.checks, c => c.row + ':' + c.col), ['2:2', '3:1', '3:3', '3:5', '4:1', '4:2', '5:1', '5:2', '5:3', '7:1']);                          // blanks are not readback checks, as before
});

test('evidence', () => {
  const out = path.join(root, 'output', 'po200-20261127'); fs.mkdirSync(out, { recursive: true });
  const h = world(), report = { suite: 'po-factory-200-rows.test.cjs', synthetic_only: true, live_writes: 0, native_sheets_run: 'NOT_RUN',
    limits: { PFI_MAX_INPUT_ROWS_: h.c.PFI_MAX_INPUT_ROWS_, PFA_MAX_BYTES_: h.c.PFA_MAX_BYTES_, builds: [h.c.PFI_BUILD_VERSION_, h.c.PFA_BUILD_VERSION_] },
    note: 'bytes and requests are exact for the request built; node_ms_* are Node timings of an in-memory mock, not Apps Script', measurements: evidence };
  fs.writeFileSync(path.join(out, 'po200-measurements.json'), JSON.stringify(report, null, 1) + '\n');
  for (const m of evidence) if (m.rows) console.log('PO200_MEASURE ' + JSON.stringify(m));
  assert(evidence.length > 8);
});
