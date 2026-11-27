'use strict';
// PO200 tools - the synthetic-XLSX generator and the source-check tool, without a browser.
//
// The template is built by the page's REAL code (template-export.js + import-batch.js exportSpec + po-factory-import.js adapter,
// evaluated in Node by helpers/po200-tools-kit.cjs) from the REAL server's template answer (78_/79_/81_/82_/82a_ in memory).
// Every generated file is read back with the page's real parser and sent to that server. Synthetic identities only; no network.
// NOT shown here: a browser (see po200-synthetic-tools-browser.cjs), real Sheets, real Apps Script time.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { world, plain } = require('./helpers/po-factory-unproduced-world.cjs');
const kit = require('./helpers/po200-tools-kit.cjs');
const toolPath = path.join(__dirname, 'tools', 'po200-synthetic-xlsx.cjs');
const tool = require(toolPath);
const sourceCheck = require('./tools/po200-source-check.cjs');

const out = path.join(kit.root, 'output', 'po200-20261127', 'tools-test');
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const page = kit.pageKit();
const skuName = i => 'ZZSKU-' + String(i).padStart(3, '0');
const evidence = { suite: 'po200-synthetic-tools.test.cjs', synthetic_only: true, native_sheets: 'NOT_RUN', mutants: [] };
const books = ['purchase_orders', 'purchase_order_lines', 'factory_stock', 'factory_stock_movements', 'import_batch_changes', 'import_batches'];
const snapshot = h => JSON.stringify(books.map(n => h.tables[n].grid));

// a world that knows n invented SKUs (plus the fixture's two), one of them with leading zeros
function bigWorld(n, extra = []) {
  const h = world();
  h.sheet('sku_regional_details', ['sku', 'site_sku'], [...extra, ...Array.from({ length: n }, (_, i) => skuName(i))].map(s => ({ sku: 'CO1150-N', site_sku: s })));
  return h;
}
const templateAnswer = (h, mode = 'NEW_RECEIPT', withData = false) => plain(h.c.handleImportTemplateGet_({ domain: 'po_factory_stock', mode, scope: { warehouse_id: 'FACTORY-A' }, include_data: withData }));
async function templateFile(h, name, mode = 'NEW_RECEIPT', withData = false) {
  const t = templateAnswer(h, mode, withData); assert.equal(t.success, true, JSON.stringify(t).slice(0, 300));
  const built = await page.workbook(t, mode, withData), file = path.join(out, name);
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, built.buffer);
  return { t, file, buffer: built.buffer, built };
}
async function cli(args) { const lines = []; const code = await tool.main(args, l => lines.push(String(l))); return { code, text: lines.join('\n') }; }
const xlsxIn = dir => (fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /\.xlsx$/.test(f)) : []);
// one file through the page's parser and batch id, then the server: Validate, and Commit when asked
async function send(h, buffer, t, mode, commit) {
  const parsed = await page.parse(buffer, t); assert.deepEqual(parsed.problems, []);
  const id = await page.batchId(parsed, t);
  const body = { domain: 'po_factory_stock', mode, schema_version: t.schema_version, import_batch_id: id, scope: { warehouse_id: 'FACTORY-A' }, sheets: parsed.sheets, file: { name: 'synthetic.xlsx' } };
  const calls = h.atomic.calls.length, v = plain(h.c.handleImportValidate_(body));
  const r = commit && v.valid ? plain(h.c.handleImportCommit_({ ...body, preview_digest: v.preview_digest })) : null;
  return { id, body, v, r, atomic: h.atomic.calls.length - calls, rows: parsed.sheets.StockPO };
}

test('new: six files from the page\'s own template - rows, POs, SKUs, shape, blanks, example row, _SYSTEM, manifest', async () => {
  const h = bigWorld(210, ['000123']), tpl = await templateFile(h, 'full/template.xlsx'), dir = path.join(out, 'full', 'gen');
  assert.equal(tpl.built.lists.length >= 1 && /_LISTS/.test(tpl.built.lists[0].range), true, 'the SKU dropdown is on the hidden _LISTS sheet');
  assert.equal(tpl.t.lists.companies.length, 3, 'the fixture offers three companies, so --company is needed');
  const r = await cli(['new', '--template', tpl.file, '--out', dir, '--tag', 'TOOLA1', '--company', 'KM']);
  assert.equal(r.code, 0, r.text);
  for (const f of ['01-control-25.xlsx', '02-owner-shape-zero-40.xlsx', '03-zero-200.xlsx', '04-one-po-200.xlsx', '05-many-po-200.xlsx', '06-limit-201.xlsx']) assert.match(r.text, new RegExp(f.replace(/\./g, '\\.')));
  assert.match(r.text, /cannot know whether a SKU is duplicated or inactive/); assert.doesNotMatch(r.text, /CASE CHANGED/);
  // the default order date is the day before the day the server stamped on the template's example row
  const g = await kit.assertGenerated(dir, { page, t: tpl.t, template: tpl.buffer, tag: 'TOOLA1', company: 'KM', factory: 'FACTORY-A', orderDate: '2026-11-22', usable: 213 });
  assert.equal(g.manifest.usable_skus, 213); assert.equal(g.manifest.sku_dropdown_entries, 213); assert.match(g.manifest.sku_caveat, /25-row control/); assert.equal(g.manifest.synthetic_only, true);
  assert.deepEqual(g.manifest.never_written, ['transaction_id', 'row_type', 'purchase_order_line_id', 'row_version']);
  assert.equal(g.files['04'].manifest.case_changed, false); assert.equal(g.files['04'].manifest.po_count, 1);
  // text stays text: the SKU with leading zeros is the first of the list and reaches the parser as "000123"
  assert.equal(g.files['01'].rows[0].sku, '000123'); assert.equal(typeof g.files['01'].rows[0].sku, 'string');
  // --company may be the exact dropdown text instead of the ID; an explicit, valid order date is kept
  const dir2 = path.join(out, 'full', 'gen-text'), r2 = await cli(['new', '--template', tpl.file, '--out', dir2, '--tag', 'TOOLA2', '--company', 'KM | KM', '--order-date', '2026-11-20']);
  assert.equal(r2.code, 0, r2.text);
  await kit.assertGenerated(dir2, { page, t: tpl.t, template: tpl.buffer, tag: 'TOOLA2', company: 'KM', factory: 'FACTORY-A', orderDate: '2026-11-20', usable: 213 });
  evidence.new_files = g.manifest.files.map(f => ({ file: f.file, data_rows: f.data_rows, po_count: f.po_count, distinct_skus: f.distinct_skus, sum_quantity: f.sum_quantity, sum_unproduced: f.sum_unproduced, sum_ordered: f.sum_ordered, bytes: f.bytes }));
});

test('new: the real server accepts 01-05 through the page parser and batch id, and 06 is refused on both sides', async () => {
  const h = bigWorld(210, ['000123']), tpl = await templateFile(h, 'server/template.xlsx'), dir = path.join(out, 'server', 'gen');
  assert.equal((await cli(['new', '--template', tpl.file, '--out', dir, '--tag', 'TOOLB1', '--company', 'KM'])).code, 0);
  const file = name => fs.readFileSync(path.join(dir, name)), count = n => h.rows(n).length, results = [];
  const step = async (name, expect) => {
    const before = { po: count('purchase_orders'), lines: count('purchase_order_lines'), stock: count('factory_stock'), mv: count('factory_stock_movements') };
    const x = await send(h, file(name), tpl.t, 'NEW_RECEIPT', true);
    assert.match(x.id, /^PFI-auto-[0-9a-f]{64}$/); assert.equal(x.rows.every(r => r.transaction_id === x.id), true);
    assert.equal(x.v.valid, true, name + ' ' + JSON.stringify(x.v.issues || x.v).slice(0, 400)); assert.equal(x.r.success, true, name + ' ' + JSON.stringify(x.r).slice(0, 400));
    assert.equal(x.atomic, 1, name + ': one atomic call'); assert.equal(x.r.result.readback_verified, true); assert.equal(typeof x.r.metrics.bytes, 'number');
    const d = { po: count('purchase_orders') - before.po, lines: count('purchase_order_lines') - before.lines, stock: count('factory_stock') - before.stock, mv: count('factory_stock_movements') - before.mv };
    assert.deepEqual(d, expect, name); results.push({ file: name, rows: x.rows.length, delta: d, request_bytes: x.r.metrics.bytes, request_parts: x.r.metrics.requests, audit_rows: x.r.result.audit_rows });
    return x;
  };
  await step('01-control-25.xlsx', { po: 1, lines: 25, stock: 25, mv: 25 });
  assert.equal(h.rows('factory_stock').every(s => s.fac_current_stock === 10), true); assert.equal(h.rows('factory_stock').some(s => s.sku === '000123'), true, 'the leading-zero SKU is stored as text');
  const stock = JSON.stringify(h.tables.factory_stock.grid), mv = JSON.stringify(h.tables.factory_stock_movements.grid);
  const two = await step('02-owner-shape-zero-40.xlsx', { po: 14, lines: 40, stock: 0, mv: 0 });
  assert.equal(two.rows.length, 40); assert.equal(new Set(two.rows.map(r => r.po_no)).size, 14); assert.equal(new Set(two.rows.map(r => r.sku)).size, 31); assert.equal(two.v.preview.impacts.stock_delta, 0);
  await step('03-zero-200.xlsx', { po: 1, lines: 200, stock: 0, mv: 0 });
  assert.equal(JSON.stringify(h.tables.factory_stock.grid), stock, 'zero-quantity files leave factory_stock untouched'); assert.equal(JSON.stringify(h.tables.factory_stock_movements.grid), mv, 'and write no movement');
  const zero = h.rows('purchase_order_lines').filter(l => /-C0[23]-/.test(h.rows('purchase_orders').filter(p => p.purchase_order_id === l.purchase_order_id)[0].po_no));
  assert.equal(zero.length, 240); assert.equal(zero.every(l => l.remaining_qty === 0 && l.shipped_qty === 0 && l.completed_qty === 0 && l.ordered_qty === 100), true, 'no historical shipped units are implied');
  await step('04-one-po-200.xlsx', { po: 1, lines: 200, stock: 175, mv: 200 });
  await step('05-many-po-200.xlsx', { po: 200, lines: 200, stock: 0, mv: 200 });
  // 06: the page's own batch-id step refuses it; a direct caller is refused by the server before any read
  const parsed = await page.parse(file('06-limit-201.xlsx'), tpl.t), before = snapshot(h); assert.equal(parsed.sheets.StockPO.length, 201);
  assert.throws(() => page.KM.poFactoryImport._batchId(parsed, tpl.t), /At most 200 rows[\s\S]*has 201[\s\S]*Nothing was submitted/);
  const direct = plain(h.c.handleImportValidate_({ domain: 'po_factory_stock', mode: 'NEW_RECEIPT', schema_version: tpl.t.schema_version, import_batch_id: 'ZZTEST-DIRECT-201', scope: { warehouse_id: 'FACTORY-A' }, sheets: { StockPO: parsed.sheets.StockPO.map(r => ({ ...r, transaction_id: 'ZZTEST-DIRECT-201' })) } }));
  assert.equal(direct.success, false); assert.match(JSON.stringify(direct), /IMPORT_TOO_MANY_ROWS/); assert.equal(snapshot(h), before);
  evidence.server_runs = results;
});

test('new: refusals - tag, template kind, company, SKUs, an edited template, an occupied folder', async () => {
  const h = bigWorld(210), tpl = await templateFile(h, 'refuse/template.xlsx');
  let n = 0;
  const refused = async (args, pattern, dir) => { const r = await cli(args); assert.equal(r.code, 2, r.text); assert.match(r.text, /^REFUSED: /); assert.match(r.text, pattern); if (dir) assert.deepEqual(xlsxIn(dir), [], 'nothing was written'); n++; };
  const d = name => path.join(out, 'refuse', name), base = dir => ['new', '--template', tpl.file, '--out', dir, '--company', 'KM'];
  await refused(base(d('no-tag')), /--tag <RUNTAG> is required/, d('no-tag'));
  for (const bad of ['abc1', 'AB1', 'ABCDEFGHIJKLM', 'RUN-1', 'RUN 1']) await refused([...base(d('bad-tag')), '--tag', bad], /4-12 characters of A-Z and 0-9/, d('bad-tag'));
  await refused(['new', '--out', d('no-template'), '--tag', 'TOOLC1'], /--template is required/, d('no-template'));
  await refused(['new', '--template', path.join(out, 'refuse', 'missing.xlsx'), '--out', d('x'), '--tag', 'TOOLC1'], /does not exist/, d('x'));
  await refused(['new', '--template', tpl.file, '--tag', 'TOOLC1'], /--out <dir> is required/);
  await refused(['new', '--template', tpl.file, '--out', d('x'), '--tag', 'TOOLC1', '--bogus', '1'], /Unknown option/);
  await refused(['nothing'], /Usage:/);
  // several companies and none named; a company that is not in the list
  await refused(['new', '--template', tpl.file, '--out', d('ambiguous'), '--tag', 'TOOLC1'], /offers 3 companies[\s\S]*--company/, d('ambiguous'));
  await refused(['new', '--template', tpl.file, '--out', d('unknown-co'), '--tag', 'TOOLC1', '--company', 'ZZ-NOT-A-COMPANY'], /is not in the dropdown list/, d('unknown-co'));
  await refused([...base(d('bad-date')), '--tag', 'TOOLC1', '--order-date', '2026-02-30'], /--order-date must be a real day/, d('bad-date'));
  // not a blank New receipt StockPO template: an export with data, the Update template, another workbook, a text file
  h.commit(h.body());
  const withData = await templateFile(h, 'refuse/export-receipt.xlsx', 'NEW_RECEIPT', true), update = await templateFile(h, 'refuse/export-update.xlsx', 'UPDATE_REMAINING', true);
  await refused(['new', '--template', withData.file, '--out', d('with-data'), '--tag', 'TOOLC1', '--company', 'KM'], /not a blank New receipt template/, d('with-data'));
  await refused(['new', '--template', update.file, '--out', d('update'), '--tag', 'TOOLC1', '--company', 'KM'], /not a blank New receipt template/, d('update'));
  const other = new kit.ExcelJS.Workbook(); other.addWorksheet('Stock').getCell('A1').value = 'sku'; const sys = other.addWorksheet('_SYSTEM'); sys.getCell('A1').value = 'module'; sys.getCell('B1').value = 'factory_inventory';
  fs.writeFileSync(path.join(out, 'refuse', 'other.xlsx'), Buffer.from(await other.xlsx.writeBuffer()));
  await refused(['new', '--template', path.join(out, 'refuse', 'other.xlsx'), '--out', d('other'), '--tag', 'TOOLC1', '--company', 'KM'], /not a StockPO template/, d('other'));
  const plainBook = new kit.ExcelJS.Workbook(); plainBook.addWorksheet('StockPO').getCell('A1').value = 'po_no'; fs.writeFileSync(path.join(out, 'refuse', 'no-system.xlsx'), Buffer.from(await plainBook.xlsx.writeBuffer()));
  await refused(['new', '--template', path.join(out, 'refuse', 'no-system.xlsx'), '--out', d('no-system'), '--tag', 'TOOLC1', '--company', 'KM'], /no _SYSTEM sheet/, d('no-system'));
  fs.writeFileSync(path.join(out, 'refuse', 'fake.xlsx'), 'not a workbook');
  await refused(['new', '--template', path.join(out, 'refuse', 'fake.xlsx'), '--out', d('fake'), '--tag', 'TOOLC1', '--company', 'KM'], /could not be read as an \.xlsx workbook/, d('fake'));
  // a template somebody typed a row into, and one whose example row was removed
  for (const [name, edit, pattern] of [['typed.xlsx', ws => { ws.getCell(5, 4).value = 'TYPED-PO'; }, /already holds 1 data row/], ['no-example.xlsx', ws => { ws.getRow(2).eachCell(c => { c.value = null; }); }, /example row is not where the page puts it/]]) {
    const wb = new kit.ExcelJS.Workbook(); await wb.xlsx.load(tpl.buffer); edit(wb.getWorksheet('StockPO')); fs.writeFileSync(path.join(out, 'refuse', name), Buffer.from(await wb.xlsx.writeBuffer()));
    await refused(['new', '--template', path.join(out, 'refuse', name), '--out', d('out-' + name), '--tag', 'TOOLC1', '--company', 'KM'], pattern, d('out-' + name));
  }
  // an empty SKU dropdown is refused, never guessed
  const noList = new kit.ExcelJS.Workbook(); await noList.xlsx.load(tpl.buffer); const lw = noList.getWorksheet('_LISTS'); lw.eachRow(row => row.eachCell(c => { c.value = null; }));
  fs.writeFileSync(path.join(out, 'refuse', 'empty-list.xlsx'), Buffer.from(await noList.xlsx.writeBuffer()));
  await refused(['new', '--template', path.join(out, 'refuse', 'empty-list.xlsx'), '--out', d('empty-list'), '--tag', 'TOOLC1', '--company', 'KM'], /sku dropdown of this template is empty/, d('empty-list'));
  // fewer than 31 SKUs: nothing is written
  const small = bigWorld(20), smallTpl = await templateFile(small, 'refuse/template-22.xlsx');
  await refused(['new', '--template', smallTpl.file, '--out', d('few'), '--tag', 'TOOLC1', '--company', 'KM'], /Only 22 usable SKUs[\s\S]*at least 31/, d('few'));
  // --skus-file: an unknown SKU, the same SKU twice
  fs.writeFileSync(path.join(out, 'refuse', 'skus-unknown.txt'), skuName(1) + '\nZZ-NOT-A-SKU\n'); fs.writeFileSync(path.join(out, 'refuse', 'skus-twice.txt'), Array.from({ length: 40 }, (_, i) => skuName(i % 39)).join('\n'));
  await refused([...base(d('sku-unknown')), '--tag', 'TOOLC1', '--skus-file', path.join(out, 'refuse', 'skus-unknown.txt')], /SKU "ZZ-NOT-A-SKU" is not in the dropdown list/, d('sku-unknown'));
  await refused([...base(d('sku-twice')), '--tag', 'TOOLC1', '--skus-file', path.join(out, 'refuse', 'skus-twice.txt')], /same SKU more than once/, d('sku-twice'));
  // a folder that already holds a run is not overwritten
  assert.equal((await cli([...base(d('occupied')), '--tag', 'TOOLC1'])).code, 0); const first = fs.readFileSync(path.join(d('occupied'), '01-control-25.xlsx'));
  const again = await cli([...base(d('occupied')), '--tag', 'TOOLC2']); assert.equal(again.code, 2); assert.match(again.text, /already holds/); assert.equal(Buffer.compare(first, fs.readFileSync(path.join(d('occupied'), '01-control-25.xlsx'))), 0, 'the earlier run is untouched'); n++;
  evidence.new_refusals = n;
});

test('new: fewer than 200 SKUs - case 04 is not changed silently, and --skus-file chooses the SKUs', async () => {
  const h = bigWorld(50), tpl = await templateFile(h, 'few/template.xlsx'), dir = path.join(out, 'few', 'gen');
  const r = await cli(['new', '--template', tpl.file, '--out', dir, '--tag', 'TOOLD1', '--company', 'KM']);
  assert.equal(r.code, 0, r.text); assert.match(r.text, /\*\*\* CASE CHANGED \*\*\* 04-fewest-pos-200\.xlsx/); assert.match(r.text, /only 52 usable SKUs/);
  assert.equal(fs.existsSync(path.join(dir, '04-one-po-200.xlsx')), false); assert.equal(fs.existsSync(path.join(dir, '04-fewest-pos-200.xlsx')), true);
  const g = await kit.assertGenerated(dir, { page, t: tpl.t, template: tpl.buffer, tag: 'TOOLD1', company: 'KM', factory: 'FACTORY-A', orderDate: '2026-11-22', usable: 52 });
  const four = g.files['04']; assert.equal(four.manifest.case_changed, true); assert.equal(four.manifest.po_count, 4); assert.deepEqual(four.manifest.lines_per_po, [44, 52, 52, 52]);
  assert.match(four.manifest.expected_server_outcome, /CASE CHANGED[\s\S]*NOT covered/); assert.equal(g.files['03'].manifest.po_count, 4);
  const x = await send(h, four.buffer, tpl.t, 'NEW_RECEIPT', true); assert.equal(x.r && x.r.success, true, JSON.stringify(x.v.issues || x.r).slice(0, 300)); assert.equal(h.rows('purchase_orders').length, 4); assert.equal(h.rows('purchase_order_lines').length, 200);
  // --skus-file: IDs and dropdown texts, comments and blank lines; the order of the file is the order used
  const big = bigWorld(210), bigTpl = await templateFile(big, 'few/template-big.xlsx'), wanted = Array.from({ length: 40 }, (_, i) => skuName(209 - i));
  fs.writeFileSync(path.join(out, 'few', 'skus.txt'), '\uFEFF# invented SKUs\r\n' + wanted.map((s, i) => (i % 2 ? s + ' | Fixture Product' : s)).join('\r\n') + '\r\n\r\n');
  const dir2 = path.join(out, 'few', 'gen-file'), r2 = await cli(['new', '--template', bigTpl.file, '--out', dir2, '--tag', 'TOOLD2', '--company', 'KM', '--skus-file', path.join(out, 'few', 'skus.txt')]);
  assert.equal(r2.code, 0, r2.text); assert.match(r2.text, /CASE CHANGED/);
  const g2 = await kit.assertGenerated(dir2, { page, t: bigTpl.t, template: bigTpl.buffer, tag: 'TOOLD2', company: 'KM', factory: 'FACTORY-A', orderDate: '2026-11-22', usable: 40 });
  assert.deepEqual(g2.files['01'].rows.map(r0 => r0.sku), wanted.slice(0, 25)); assert.match(g2.manifest.sku_source, /--skus-file \(40 SKUs\)/);
});

test('existing: only tagged rows are kept, only quantity changes, and the server applies +5 / remaining - 1', async () => {
  const h = bigWorld(210), tpl = await templateFile(h, 'existing/template.xlsx'), dir = path.join(out, 'existing', 'gen');
  assert.equal((await cli(['new', '--template', tpl.file, '--out', dir, '--tag', 'TOOLE1', '--company', 'KM'])).code, 0);
  h.commit(h.body());                                                                    // one PO that is NOT part of the run: it must never be in a generated file
  for (const name of ['01-control-25.xlsx', '04-one-po-200.xlsx', '05-many-po-200.xlsx']) { const x = await send(h, fs.readFileSync(path.join(dir, name)), tpl.t, 'NEW_RECEIPT', true); assert.equal(x.r && x.r.success, true, name); }
  const rawRows = async buffer => { const x = await kit.inspectFile(buffer, page, null); return x.raw; };
  const byLine = rows => Object.fromEntries(rows.map(r => [r.purchase_order_line_id, r]));
  const untouched = (before, after, changed) => { for (const id of Object.keys(after)) for (const k of Object.keys(after[id])) if (!changed.includes(k) && k !== '__row') assert.deepEqual(after[id][k], before[id][k], k + ' of line ' + id); };
  const system = b => kit.sheetCells(b, '_SYSTEM');
  // ---- 07: New receipt on 200 existing lines ----
  h.c.imbNow_ = () => '2026-11-23 10:05:00';
  const ex7 = await templateFile(h, 'existing/export-receipt.xlsx', 'NEW_RECEIPT', true), all7 = await rawRows(ex7.buffer);
  assert.equal(all7.length, 426); assert.equal(all7.filter(r => !/^ZZTEST-TOOLE1-/.test(r.po_no)).length, 1);
  const r7 = await cli(['existing', '--export', ex7.file, '--mode', 'receipt', '--tag', 'TOOLE1', '--case', 'C04', '--out', dir]);
  assert.equal(r7.code, 0, r7.text); assert.match(r7.text, /kept 200 tagged row\(s\); dropped 226 untagged and 0 over the 200-row limit; quantity sum 0 -> 1000/); assert.doesNotMatch(r7.text, /FEWER THAN 200/);
  const f7 = fs.readFileSync(path.join(dir, '07-existing-receipt-200.xlsx')), kept7 = await rawRows(f7), before7 = byLine(all7), after7 = byLine(kept7);
  assert.equal(kept7.length, 200); assert.equal(kept7.every(r => /^ZZTEST-TOOLE1-C04-001$/.test(r.po_no) && r.quantity === 5 && r['未生產數量 unproduced_qty'] == null), true);
  assert.equal(Object.keys(after7).length, 200); untouched(before7, after7, ['quantity']); assert.deepEqual(system(f7), system(ex7.buffer), '_SYSTEM is the export\'s');
  assert.equal(kept7.every(r => r.purchase_order_line_id && /^[0-9a-f]{64}$/.test(r.row_version)), true);
  const lineBefore = Object.fromEntries(h.rows('purchase_order_lines').map(l => [l.purchase_order_line_id, { ...l }])), mvBefore = h.rows('factory_stock_movements').length, stockBefore = Object.fromEntries(h.rows('factory_stock').map(s => [s.sku, s.fac_current_stock]));
  const s7 = await send(h, f7, tpl.t, 'NEW_RECEIPT', true);
  assert.equal(s7.v.valid, true, JSON.stringify(s7.v.issues).slice(0, 400)); assert.equal(s7.r.success, true, JSON.stringify(s7.r).slice(0, 300)); assert.equal(s7.atomic, 1);
  assert.equal(h.rows('factory_stock_movements').length, mvBefore + 200, 'one new movement per line');
  for (const l of h.rows('purchase_order_lines')) { const b = lineBefore[l.purchase_order_line_id], hit = !!after7[l.purchase_order_line_id];
    assert.equal(l.completed_qty, b.completed_qty + (hit ? 5 : 0)); assert.equal(l.remaining_qty, b.remaining_qty + (hit ? 5 : 0)); assert.equal(l.shipped_qty, b.shipped_qty); assert.equal(l.ordered_qty, b.ordered_qty); if (!hit) assert.equal(l.updated_at, b.updated_at, 'a line that is not in the file is untouched'); }
  for (const s of h.rows('factory_stock')) assert.equal(s.fac_current_stock, stockBefore[s.sku] + (kept7.some(r => r.sku.split(' | ')[0] === s.sku) ? 5 : 0));
  // the same export is stale for every line whose SKU just received stock: a second file made from it is refused, nothing written
  const dirStale = path.join(out, 'existing', 'stale'), st7 = await cli(['existing', '--export', ex7.file, '--mode', 'receipt', '--tag', 'TOOLE1', '--case', '05', '--out', dirStale]); assert.equal(st7.code, 0, st7.text);
  let snap = snapshot(h); const stale7 = await send(h, fs.readFileSync(path.join(dirStale, '07-existing-receipt-200.xlsx')), tpl.t, 'NEW_RECEIPT', false);
  assert.notEqual(stale7.v.valid, true); assert.match(JSON.stringify(stale7.v.issues), /PFI_STALE_EXPORT/); assert.equal(snapshot(h), snap);
  // ---- 08: Update current data, remaining - 1 on the same 200 lines ----
  h.c.imbNow_ = () => '2026-11-23 10:10:00';
  const ex8 = await templateFile(h, 'existing/export-update.xlsx', 'UPDATE_REMAINING', true), all8 = await rawRows(ex8.buffer);
  const r8 = await cli(['existing', '--export', ex8.file, '--mode', 'remaining', '--tag', 'TOOLE1', '--case', 'C04', '--out', dir]);
  assert.equal(r8.code, 0, r8.text); assert.match(r8.text, /kept 200 tagged row\(s\); dropped 226 untagged and 0 over the 200-row limit; quantity sum 3000 -> 2800/);
  const f8 = fs.readFileSync(path.join(dir, '08-update-remaining-200.xlsx')), kept8 = await rawRows(f8), before8 = byLine(all8), after8 = byLine(kept8);
  assert.equal(kept8.length, 200); assert.equal(kept8.every(r => r.quantity === 14 && before8[r.purchase_order_line_id].quantity === 15), true); untouched(before8, after8, ['quantity']); assert.deepEqual(system(f8), system(ex8.buffer));
  const upd = templateAnswer(h, 'UPDATE_REMAINING'), line8 = Object.fromEntries(h.rows('purchase_order_lines').map(l => [l.purchase_order_line_id, { ...l }])), mv8 = h.rows('factory_stock_movements').length;
  const s8 = await send(h, f8, upd, 'UPDATE_REMAINING', true);
  assert.equal(s8.v.valid, true, JSON.stringify(s8.v.issues).slice(0, 400)); assert.equal(s8.r.success, true, JSON.stringify(s8.r).slice(0, 300)); assert.equal(s8.atomic, 1); assert.equal(h.rows('factory_stock_movements').length, mv8 + 200);
  for (const l of h.rows('purchase_order_lines')) { const b = line8[l.purchase_order_line_id], hit = !!after8[l.purchase_order_line_id];
    assert.equal(l.remaining_qty, b.remaining_qty - (hit ? 1 : 0)); assert.equal(l.completed_qty, b.completed_qty - (hit ? 1 : 0)); assert.equal(l.shipped_qty, b.shipped_qty); assert.equal(l.ordered_qty, b.ordered_qty); }
  const st8 = await cli(['existing', '--export', ex8.file, '--mode', 'remaining', '--tag', 'TOOLE1', '--case', 'C05', '--out', dirStale]); assert.equal(st8.code, 0, st8.text);
  snap = snapshot(h); const stale8 = await send(h, fs.readFileSync(path.join(dirStale, '08-update-remaining-200.xlsx')), upd, 'UPDATE_REMAINING', false);
  assert.notEqual(stale8.v.valid, true); assert.match(JSON.stringify(stale8.v.issues), /PFI_STALE_EXPORT/); assert.equal(snapshot(h), snap);
  // the manifest of the folder now lists 07 and 08 next to the six
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'MANIFEST.json'), 'utf8')), m7 = manifest.files.filter(f => f.case === '07')[0], m8 = manifest.files.filter(f => f.case === '08')[0];
  assert.equal(manifest.files.length, 8); assert.deepEqual([m7.rows_in_export, m7.rows_tagged, m7.rows_kept, m7.rows_dropped_untagged, m7.sum_quantity_before, m7.sum_quantity_after], [426, 200, 200, 226, 0, 1000]);
  assert.deepEqual([m8.rows_kept, m8.sum_quantity_before, m8.sum_quantity_after, m8.fewer_than_200], [200, 3000, 2800, false]); assert.match(m7.expected_server_outcome, /legacy receipt rule/);
  // without --case the first 200 tagged rows are kept and the rest is reported; fewer than 200 is said loudly
  const dirAll = path.join(out, 'existing', 'all'), ex9 = await templateFile(h, 'existing/export-receipt-2.xlsx', 'NEW_RECEIPT', true);
  const rAll = await cli(['existing', '--export', ex9.file, '--mode', 'receipt', '--tag', 'TOOLE1', '--out', dirAll]); assert.equal(rAll.code, 0); assert.match(rAll.text, /kept 200 tagged row\(s\); dropped 1 untagged and 225 over the 200-row limit/);
  const rFew = await cli(['existing', '--export', ex9.file, '--mode', 'receipt', '--tag', 'TOOLE1', '--case', 'C01', '--out', path.join(out, 'existing', 'c01')]); assert.equal(rFew.code, 0); assert.match(rFew.text, /\*\*\* FEWER THAN 200 ROWS \*\*\*[\s\S]*holds 25 rows/);
  // refusals
  const refused = async (args, pattern) => { const r = await cli(args); assert.equal(r.code, 2, r.text); assert.match(r.text, pattern); };
  const no = path.join(out, 'existing', 'refused');
  await refused(['existing', '--export', ex9.file, '--mode', 'receipt', '--tag', 'OTHER9', '--out', no], /No row of this export has a PO number starting with ZZTEST-OTHER9-/);
  await refused(['existing', '--export', ex9.file, '--mode', 'receipt', '--tag', 'TOOLE1', '--case', 'C09', '--out', no], /No row of this export/);
  await refused(['existing', '--export', ex9.file, '--mode', 'remaining', '--tag', 'TOOLE1', '--out', no], /This export is for NEW_RECEIPT, but --mode remaining needs UPDATE_REMAINING/);
  await refused(['existing', '--export', ex8.file, '--mode', 'receipt', '--tag', 'TOOLE1', '--out', no], /needs NEW_RECEIPT/);
  await refused(['existing', '--export', tpl.file, '--mode', 'receipt', '--tag', 'TOOLE1', '--out', no], /blank template, not an export with data/);
  await refused(['existing', '--export', ex9.file, '--mode', 'both', '--tag', 'TOOLE1', '--out', no], /--mode must be receipt or remaining/);
  await refused(['existing', '--export', ex9.file, '--mode', 'receipt', '--out', no], /--tag <RUNTAG> is required/);
  await refused(['existing', '--export', ex9.file, '--mode', 'receipt', '--tag', 'TOOLE1', '--case', 'C04', '--out', dir], /already holds 07-existing-receipt-200\.xlsx/);
  assert.deepEqual(xlsxIn(no), []);
  evidence.existing = { receipt: { kept: m7.rows_kept, dropped_untagged: m7.rows_dropped_untagged, request_bytes: s7.r.metrics.bytes }, remaining: { kept: m8.rows_kept, request_bytes: s8.r.metrics.bytes } };
});

test('the tests can fail: mutants of the generator, in memory, are caught', async () => {
  const source = fs.readFileSync(toolPath, 'utf8'), h = bigWorld(210), tpl = await templateFile(h, 'mutants/template.xlsx');
  const load = (anchor, replacement) => {
    const text = anchor ? source.replace(anchor, replacement) : source; if (anchor) assert.notEqual(text, source, 'the mutant anchor exists: ' + anchor);
    const m = new Module(toolPath, module); m.filename = toolPath; m.paths = Module._nodeModulePaths(path.dirname(toolPath)); m._compile(text, toolPath); return m.exports;
  };
  const run = async (mod, name, skipSelfCheck) => {
    const dir = path.join(out, 'mutants', name + (skipSelfCheck ? '' : '-selfcheck')); let outcome = 'PASSED';
    try { await mod.generateNew({ template: tpl.file, out: dir, tag: 'MUTANT', company: 'KM', _skipSelfCheck: skipSelfCheck }); }
    catch (e) { return { outcome: 'TOOL_REFUSED', message: String(e.message).slice(0, 160) }; }
    try { await kit.assertGenerated(dir, { page, t: tpl.t, template: tpl.buffer, tag: 'MUTANT', company: 'KM', factory: 'FACTORY-A', orderDate: '2026-11-22', usable: 212 }); }
    catch (e) { outcome = 'TEST_FAILED'; return { outcome, message: String(e.message).split('\n')[0].slice(0, 200) }; }
    return { outcome };
  };
  // the control: the unmutated source, loaded the same way, passes with and without the tool's own self-check
  assert.equal((await run(load(), 'control', true)).outcome, 'PASSED'); assert.equal((await run(load(), 'control', false)).outcome, 'PASSED');
  const mutants = [
    ['writes transaction_id', "put('company', company.text);", "put('company', company.text); put('transaction_id', 'ZZ-MUTANT-0001');", /transaction_id is blank/],
    ['writes row_version on a new row', "put('company', company.text);", "put('company', company.text); put('row_version', 'abc');", /row_version is blank/],
    ['drops the example row', 'const sheet = wb.getWorksheet(SHEET), style = {};', 'const sheet = wb.getWorksheet(SHEET), style = {}; Object.keys(header.cols).forEach(k => { sheet.getCell(header.row + 1, header.cols[k]).value = null; });', /example row is in place/],
    ['repeats a SKU inside one PO', "skus.slice(0, 200).map(s => line('C04', 1, s, 10, 90, 100))", "skus.slice(0, 200).map((s, i) => line('C04', 1, i === 7 ? skus[0] : s, 10, 90, 100))", /duplicate \(company, po_no, sku\)/],
    ['writes the bare SKU ID instead of the dropdown text', "put('sku', r.sku.text);", "put('sku', r.sku.id);", /sku is a dropdown text/],
    ['edits _SYSTEM', 'const sheet = wb.getWorksheet(SHEET), style = {};', "const sheet = wb.getWorksheet(SHEET), style = {}; wb.getWorksheet(SYSTEM).getCell(5, 2).value = 'edited';", /_SYSTEM cells are the template's/],
    ['changes the lines-per-PO shape of case 02', 'const OWNER_SIZES = [1, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5, 8];', 'const OWNER_SIZES = [2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 4, 4, 5, 4];', /lines per PO/],
    ['writes a quantity as text', "put('quantity', r.quantity);", "put('quantity', String(r.quantity));", /quantity is a number/],
    ['gives case 02 a received quantity', "line('C02', p + 1, skus[n % 31], 0, 100, 100)", "line('C02', p + 1, skus[n % 31], 1, 99, 100)", /sums/],
    ['writes 200 rows into the 201-row file', 'Array.from({ length: 201 }, (_, i) => line(\'C06\'', 'Array.from({ length: 200 }, (_, i) => line(\'C06\'', /raw data rows/]
  ];
  for (const [name, anchor, replacement, expected] of mutants) {
    const mod = load(anchor, replacement), id = name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const byTest = await run(mod, id, true), byTool = await run(mod, id, false);
    assert.equal(byTest.outcome, 'TEST_FAILED', name + ': the test inspection must fail, got ' + JSON.stringify(byTest)); assert.match(byTest.message, expected, name);
    evidence.mutants.push({ mutant: name, test_inspection: byTest.outcome, test_message: byTest.message, tool_self_check: byTool.outcome });
  }
  assert.equal(evidence.mutants.length, 10);
  // the tool's own self-check is a second layer for the mutants it can see (it cannot see a wrong plan: it checks the file against the plan)
  for (const name of ['writes transaction_id', 'drops the example row', 'edits _SYSTEM', 'repeats a SKU inside one PO', 'writes a quantity as text']) assert.equal(evidence.mutants.filter(m => m.mutant === name)[0].tool_self_check, 'TOOL_REFUSED', name);
});

test('source-check: MATCHES_BASE, MATCHES_CANDIDATE, DIFFERENT, refusals and the self-test', () => {
  const { execFileSync } = require('node:child_process'), dir = path.join(out, 'source-check'); fs.mkdirSync(dir, { recursive: true });
  const show = (rev, name) => execFileSync('git', ['-C', kit.root, 'show', rev + ':assets/specs/active/apps-script/' + name], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const run = args => { const lines = []; const code = sourceCheck.main(args, l => lines.push(String(l))); return { code, lines, text: lines.join('\n') }; };
  const verdicts = [];
  for (const as of ['82', '82a']) {
    const name = sourceCheck.FILES[as], base = show('939e6365', name), candidate = show('HEAD', name), f = path.join(dir, 'installed-' + as + '.gs'), diff = path.join(dir, 'diff-' + as + '.diff');
    assert.notEqual(sourceCheck.normalise(base), sourceCheck.normalise(candidate), 'this checkout holds a candidate that differs from the base');
    fs.writeFileSync(f, sourceCheck.normalise(base)); let r = run(['--file', f, '--as', as, '--diff-out', diff]);
    assert.equal(r.code, 0); assert.equal(r.lines[0], 'MATCHES_BASE'); assert.equal(r.lines.filter(l => /^(MATCHES_BASE|MATCHES_CANDIDATE|DIFFERENT)$/.test(l)).length, 1); assert.match(r.text, /safe to replace the WHOLE file/); assert.equal(fs.existsSync(diff), false);
    fs.writeFileSync(f, '\uFEFF' + sourceCheck.normalise(base).replace(/\n/g, '\r\n') + '\r\n \r\n'); r = run(['--file', f, '--as', as, '--diff-out', diff]);
    assert.equal(r.lines[0], 'MATCHES_BASE', 'a BOM, CRLF and blank lines at the end are not a difference'); assert.match(r.text, /CRLF \(normalised\), BOM removed/);
    fs.writeFileSync(f, candidate); r = run(['--file', f, '--as', as, '--diff-out', diff]);
    assert.equal(r.code, 0); assert.equal(r.lines[0], 'MATCHES_CANDIDATE'); assert.match(r.text, /already installed/);
    const marker = 'var ZZ_LOCAL_ONLY_' + as + ' = "environment specific value";', lines = sourceCheck.normalise(base).split('\n'); lines.splice(10, 0, marker); lines[20] = lines[20] + ' // changed';
    fs.writeFileSync(f, lines.join('\n')); r = run(['--file', f, '--as', as, '--diff-out', diff]);
    assert.equal(r.code, 3); assert.equal(r.lines[0], 'DIFFERENT'); assert.match(r.text, /STOP: do not overwrite/); assert.match(r.text, /\(\d+ lines, 3 changed\)/);
    assert.equal(r.text.includes('ZZ_LOCAL_ONLY') || r.text.includes('environment specific value'), false, 'no content of the installed file is printed');
    const written = fs.readFileSync(diff, 'utf8'); assert.equal(written.includes('+' + marker), true); assert.match(written, /^--- reviewed base 939e6365 /); assert.match(written, /^@@ -\d+,\d+ \+\d+,\d+ @@$/m);
    // the diff is a real one: applying its + / - lines to the base gives the installed file
    const baseLines = sourceCheck.normalise(base).split('\n'); baseLines.pop(); const rebuilt = []; let at = 0;
    for (const hunk of written.split(/^@@ /m).slice(1)) { const head = /^-(\d+),(\d+) \+\d+,\d+ @@\n/.exec(hunk), start = Number(head[1]) - 1; while (at < start) rebuilt.push(baseLines[at++]);
      for (const l of hunk.slice(head[0].length).split('\n').slice(0, -1)) { if (l[0] === ' ') { assert.equal(baseLines[at], l.slice(1)); rebuilt.push(baseLines[at++]); } else if (l[0] === '-') { assert.equal(baseLines[at], l.slice(1)); at++; } else rebuilt.push(l.slice(1)); } }
    while (at < baseLines.length) rebuilt.push(baseLines[at++]);
    assert.equal(rebuilt.join('\n') + '\n', sourceCheck.normalise(lines.join('\n')), 'the written diff rebuilds the installed file from the base');
    // the other file's content under this name is DIFFERENT, never a match
    fs.writeFileSync(f, show('HEAD', sourceCheck.FILES[as === '82' ? '82a' : '82'])); assert.equal(run(['--file', f, '--as', as, '--diff-out', diff]).lines[0], 'DIFFERENT');
    verdicts.push(as);
  }
  for (const name of ['00_config.gs', '00_config_sandbox.gs', '84_private.gs', '66_owner.gs', 'my-pin.local.js', '.env', '.env.local']) { fs.writeFileSync(path.join(dir, 'placeholder.txt'), 'x'); const r = run(['--file', path.join(dir, name), '--as', '82']); assert.equal(r.code, 2, name); assert.match(r.text, /^REFUSED: .*never read/); }
  assert.equal(run(['--file', path.join(dir, 'decoys', 'x.gs'), '--as', '82']).code, 2);
  assert.match(run(['--file', path.join(dir, 'missing.gs'), '--as', '82']).text, /REFUSED: --file: the file does not exist/);
  assert.match(run(['--file', path.join(dir, 'installed-82.gs'), '--as', '81']).text, /REFUSED: --as must be 82 or 82a/);
  assert.match(run(['--file', path.join(dir, 'installed-82.gs'), '--as', '82', '--candidate', '939e6365']).text, /REFUSED: .*same as the base/);
  assert.match(run(['--nope']).text, /REFUSED: Unknown option/);
  const self = run(['--self-test']); assert.equal(self.code, 0, self.text); assert.match(self.lines[self.lines.length - 1], /^SELF_TEST_PASS 17$/);
  evidence.source_check = { files: verdicts, self_test: self.lines[self.lines.length - 1] };
});

test('evidence', () => {
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(evidence, null, 1) + '\n');
  assert.equal(evidence.mutants.length >= 3, true);
  console.log('PO200_SYNTHETIC_TOOLS ' + JSON.stringify({ mutants_caught: evidence.mutants.filter(m => m.test_inspection === 'TEST_FAILED').length, mutants: evidence.mutants.length, new_refusals: evidence.new_refusals }));
});
