'use strict';
// PO200 tools - the operator's whole native procedure, rehearsed in a real headless Chrome against the real server code in memory.
//
// WORLD A (one page, the order the operator follows): the page DOWNLOADS its own New receipt template -> the generator fills it ->
// each file goes through the page's real file input, Validate and Apply: 01, 02, 03, 04, 05, 06 (refused), 01 again (replay) ->
// the console helper exports the existing lines for a New receipt (the page has NO control for that export) -> 07 -> a stale file ->
// the page's own "Update current data" Download -> 08 -> a stale file -> the console helper's stock-only ADD and opening on the same book.
// WORLD B (fresh): the console helper alone - refusals, check(), 200 SKUs of stock, the opening, replays, and the three ways it halts.
// The server is the real 78_/79_/81_/82_/82a_ in memory. Synthetic identities only; every outbound request is aborted and counted.
// NOT shown here: real Sheets, real Apps Script time, the live router or session, a real Sandbox.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { world, root, read, plain } = require('./helpers/po-factory-unproduced-world.cjs');
const { openHarness, mount } = require('./order-mainline-browser-c1.cjs');
const kit = require('./helpers/po200-tools-kit.cjs');
const tool = require('./tools/po200-synthetic-xlsx.cjs');
const runtime = process.env.KM_NODE_MODULES || 'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1119-907-0_26.1119.907.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const { chromium } = require(require.resolve('playwright', { paths: [runtime] }));

// "Can this suite fail?" - `--mutants` runs world B once per mutant of the console helper (one child at a time) and requires each run to FAIL.
// A child is this same file with KM_PO200_HELPER_MUTANT set: the helper source is changed in memory, nothing is written to the repo.
const HELPER_MUTANTS = {
  'no-sandbox-flag': ['if (!o || o[FLAG] !== true) refuse(', 'if (false) refuse(', /without the sandbox flag is refused/],
  'new-batch-id-every-plan': ["var id = 'PO200-' + tag + '-STOCK';", "var id = 'PO200-' + tag + '-STOCK-' + Date.now();", /fixed batch id of the tag/],
  'opening-ignores-the-server-quantity': ["quantity: r.quantity, ordered_qty: r.quantity, currency: ''", "quantity: r.quantity, ordered_qty: r.quantity + 10, currency: 'USD'", /planOpening takes the server/],
  'resends-after-no-answer': ["}, function (error) { return halt(label + ': batch ' + p.id + ' got NO ANSWER - the result is unknown'", "}, function (error) { p.sent = false; return (function () { return { ok: false, halted: true, reason: 'NO ANSWER - the result is unknown' }; })(label + ': batch ' + p.id + ' got NO ANSWER - the result is unknown'", /unknown and halts|not sent again/],
  'plans-without-check': ["if (!S.checked) refuse(", "if (false) refuse(", /before check.., planning is still refused/]
};
const mutantName = process.env.KM_PO200_HELPER_MUTANT || '';
function helperSource() {
  const source = read('assets/tests/tools/po200-opening-console.js'), m = HELPER_MUTANTS[mutantName];
  if (!m) { assert.equal(mutantName, '', 'unknown mutant ' + mutantName); return source; }
  const changed = source.replace(m[0], m[1]); assert.notEqual(changed, source, 'the mutant anchor exists: ' + mutantName); return changed;
}
const out = path.join(root, 'output/po200-20261127/tools-browser' + (mutantName ? '-mutant-' + mutantName : ''));
const skuName = i => 'ZZSKU-' + String(i).padStart(3, '0');
const FLAG = { iUnderstandThisIsTheIsolatedSandbox: true };
const evidence = { suite: 'po200-synthetic-tools-browser.cjs', synthetic_only: true, native_sheets: 'NOT_RUN', cases: [] };
let checks = 0;
function check(label, value, detail) { assert(value, label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail).slice(0, 600))); checks++; console.log('PASS ' + label); }

function bigWorld(n) {
  const h = world();
  h.sheet('sku_regional_details', ['sku', 'site_sku'], Array.from({ length: n }, (_, i) => ({ sku: 'CO1150-N', site_sku: skuName(i) })));
  let minute = 0; h.tick = () => { minute++; const t = '2026-11-23 10:' + String(minute).padStart(2, '0') + ':00'; h.c.imbNow_ = () => t; };
  return h;
}
const count = (h, n) => h.rows(n).length;
const grid = (h, n) => JSON.stringify(h.tables[n].grid);
const poOf = h => Object.fromEntries(h.rows('purchase_orders').map(p => [p.purchase_order_id, p.po_no]));
const linesOf = (h, re) => { const po = poOf(h); return h.rows('purchase_order_lines').filter(l => re.test(po[l.purchase_order_id])); };

// one page on a world: the importer's three calls go to the real handlers; everything they are sent and answer is kept
async function session(browser, h) {
  const s = { h, validations: [], commits: [], templates: [], console: [], flags: {} };
  const ui = await openHarness(browser, 1440, h), { page } = ui; s.ui = ui; s.page = page;
  page.on('console', m => { const t = m.text(); if (t.indexOf('[po200]') === 0) s.console.push(t); });
  await page.exposeFunction('stockPoTemplate', body => { let r = plain(h.c.handleImportTemplateGet_(body)); s.templates.push({ body, r }); if (s.flags.noLimits) { r = Object.assign({}, r); delete r.limits; } return r; });
  await page.exposeFunction('stockPoValidate', body => { const r = plain(h.c.handleImportValidate_(body)); s.validations.push({ body, r }); return r; });
  await page.exposeFunction('stockPoCommit', body => { if (s.flags.loseCommit) throw new Error('SYNTHETIC_NO_ANSWER'); const r = plain(h.c.handleImportCommit_(body)); s.commits.push({ body, r }); return r; });
  await page.exposeFunction('stockPoReceipt', body => plain(h.c.handleImportReceiptGet_(body)));
  for (const file of ['assets/vendor/exceljs-4.4.0.min.js', 'assets/js/utils/template-export.js', 'assets/js/utils/import-batch.js']) await page.addScriptTag({ content: read(file) });
  await page.evaluate(source => {
    KM.scriptLoader = { load: async src => { if (/po-factory-import\.js/.test(src)) (0, eval)(source); return true; } };
    Object.assign(KM.DB, { importTemplateGet: stockPoTemplate, importValidate: stockPoValidate, importCommit: stockPoCommit, importReceiptGet: stockPoReceipt, refreshPoFactoryTables: async () => ({ success: true }) });
  }, read('assets/js/utils/po-factory-import.js'));
  await mount(page, 'purchase-order-list', 'initPurchaseOrderListPage');
  return s;
}
// Purchase Order Overview > Actions > Import Purchase Order, a fresh dialog, the factory chosen
async function openImporter(s) {
  const { page } = s;
  if (await page.locator('#km-imb-modal').count()) { await page.locator('#km-imb-close').click(); await page.locator('#km-imb-modal').waitFor({ state: 'detached' }); }
  await page.locator('#polActionsTrigger').click();
  await page.getByRole('menuitem', { name: 'Import Purchase Order', exact: true }).click();
  await page.locator('#km-imb-scope-warehouse_id option[value="FACTORY-A"]').waitFor({ state: 'attached' });
  await page.locator('#km-imb-scope-warehouse_id').selectOption('FACTORY-A');
}
const statusText = s => s.page.evaluate(() => (document.querySelector('#km-imb-status') || {}).textContent || '');
async function validate(s) {
  const n = s.validations.length;
  await s.page.waitForFunction(() => { const b = document.querySelector('#km-imb-validate'); return b && !b.disabled; });
  await s.page.locator('#km-imb-validate').click();
  await s.page.waitForFunction(() => { const t = (document.querySelector('#km-imb-status') || {}).textContent || ''; return t.trim() !== '' && !/Validating on the server|Checking import result/.test(t); }, null, { timeout: 180000 });
  assert.equal(s.validations.length, n + 1, 'one Validate was sent');
  return s.validations[n];
}
async function apply(s) {
  const n = s.commits.length;
  await s.page.locator('#km-imb-confirm').check(); await s.page.locator('#km-imb-apply').click();
  await s.page.waitForFunction(() => { const t = (document.querySelector('#km-imb-status') || {}).textContent || ''; return t.includes('Data read back') || (/Nothing was written|unknown|undone|readback failed|response was lost/i.test(t) && !/Importing|Reading the data back/.test(t)); }, null, { timeout: 240000 });
  assert.equal(s.commits.length, n + 1, 'one Commit was sent');
  return s.commits[n];
}
// a file through the page: fresh dialog, the real file input, Validate, and Apply when the file is valid
async function importFile(s, file, { commit = true, shot } = {}) {
  s.h.tick(); await openImporter(s);
  const before = { atomic: s.h.atomic.calls.length, writes: s.h.writes() };
  await s.page.locator('#km-imb-file').setInputFiles(file);
  const v = await validate(s), validText = await statusText(s), preview = await s.page.evaluate(() => document.querySelector('#km-imb-preview').innerText);
  if (shot) await s.page.screenshot({ path: path.join(out, shot + '-validated.png'), fullPage: true });
  let c = null, appliedText = '';
  if (commit && v.r.valid === true) { c = await apply(s); appliedText = await statusText(s); if (shot) await s.page.screenshot({ path: path.join(out, shot + '-applied.png'), fullPage: true }); }
  return { v, c, validText, appliedText, preview, atomic: s.h.atomic.calls.length - before.atomic, wrote: s.h.writes() !== before.writes };
}
const helper = (s, fn, arg) => s.page.evaluate(([name, a]) => window.po200Opening[name](a), [fn, arg]);
const helperRefused = async (s, fn, arg) => { try { await helper(s, fn, arg); return ''; } catch (e) { return String(e.message); } };
const lastLog = s => s.page.evaluate(() => { const l = window.po200Opening.log(); return l[l.length - 1]; });
function record(label, x, extra) {
  const m = (x.c && x.c.r.metrics) || {};
  evidence.cases.push(Object.assign({ case: label, rows_sent: x.v.body.sheets.StockPO.length, batch_id_form: /^PFI-auto-[0-9a-f]{64}$/.test(x.v.body.import_batch_id) ? 'PFI-auto-<sha256>' : 'other', valid: x.v.r.valid, committed: !!(x.c && x.c.r.success),
    atomic_calls: x.atomic, request_bytes: m.bytes, request_parts: m.requests, readback_cells: m.cells, audit_rows: x.c && x.c.r.result && x.c.r.result.audit_rows }, extra || {}));
}

// the console helper's stock + opening on a session, for `skus`; returns what it changed
async function openingFlow(s, label, tag, skus, qty) {
  const h = s.h, stock0 = Object.fromEntries(h.rows('factory_stock').map(r => [r.sku, r.fac_current_stock]));
  let writes = h.writes(), atomic = h.atomic.calls.length, nv = s.validations.length, nc = s.commits.length;
  h.tick();
  const plan = await helper(s, 'planStock', Object.assign({ factory: 'FACTORY-A', skus, qty, tag }, FLAG));
  check(label + ' planStock validates ' + skus.length + ' rows with the fixed batch id of the tag and writes nothing', plan.ok === true && plan.batch_id === 'PO200-' + tag + '-STOCK' && plan.rows === skus.length && plan.total_delta === skus.length * qty &&
    h.writes() === writes && s.validations.length === nv + 1 && s.commits.length === nc && s.validations[nv].body.domain === 'factory_inventory' && s.validations[nv].body.mode === 'ADD' && s.validations[nv].body.schema_version === h.c.imbDomain_('factory_inventory').schema_version, plan);
  const cs = await helper(s, 'commitStock');
  check(label + ' commitStock sends once: one atomic call, read back, stock +' + qty + ' on every SKU, one movement each', cs.ok === true && cs.replayed === false && s.commits.length === nc + 1 && h.atomic.calls.length === atomic + 1 && cs.answer.result.readback_verified === true &&
    skus.every(k => h.rows('factory_stock').filter(r => r.sku === k)[0].fac_current_stock === (stock0[k] || 0) + qty) && cs.metrics && cs.metrics.requests > 0, cs.answer && cs.answer.code);
  const stockGrid = grid(h, 'factory_stock'), mvGrid = grid(h, 'factory_stock_movements'), lines0 = count(h, 'purchase_order_lines'), pos0 = count(h, 'purchase_orders');
  writes = h.writes(); nv = s.validations.length; h.tick();
  const po = await helper(s, 'planOpening', Object.assign({ factory: 'FACTORY-A', company: 'KM', tag, orderDate: '2026-11-20' }, FLAG)), ob = s.validations[s.validations.length - 1].body;
  check(label + ' planOpening takes the server\'s own unassigned quantities, 8 POs, stock change 0, and writes nothing', po.ok === true && po.batch_id === 'PO200-' + tag + '-OPENING' && po.rows === skus.length && po.pos === 8 && po.stock_delta === 0 && po.coverage_units === skus.length * qty &&
    h.writes() === writes && s.validations.length === nv + 1 && ob.mode === 'OPENING_PO_FOR_EXISTING_STOCK' && ob.sheets.StockPO.every(r => r.transaction_id === ob.import_batch_id && r.currency === '' && r.ordered_qty === r.quantity && r.quantity === qty && /^ZZTEST-[A-Z0-9]+-OPEN-[1-8]$/.test(r.po_no)), po);
  check(label + ' the opening export was asked with include_data for the internal mode, which the page still does not offer', s.templates.some(t => t.body.mode === 'OPENING_PO_FOR_EXISTING_STOCK' && t.body.include_data === true) &&
    !/OPENING_PO_FOR_EXISTING_STOCK/.test(read('assets/js/utils/po-factory-import.js')) && await s.page.evaluate(() => !KM.poFactoryImport || !KM.poFactoryImport._adapter().modes.some(m => /OPENING/.test(m.value))));   // world B never opens the importer: the helper does not need it
  atomic = h.atomic.calls.length; nc = s.commits.length;
  const co = await helper(s, 'commitOpening'), open = linesOf(h, new RegExp('^ZZTEST-' + tag + '-OPEN-'));
  check(label + ' commitOpening sends once: one atomic call, read back', co.ok === true && co.replayed === false && s.commits.length === nc + 1 && h.atomic.calls.length === atomic + 1 && co.answer.status === 'COMMITTED' && co.answer.result.readback_verified === true && co.answer.result.stock.movements === 0, co.answer && co.answer.code);
  check(label + ' coverage is created: ' + skus.length + ' lines on 8 POs, remaining = the unassigned stock, shipped 0, opening reconciled', count(h, 'purchase_order_lines') === lines0 + skus.length && count(h, 'purchase_orders') === pos0 + 8 && open.length === skus.length &&
    open.every(l => l.remaining_qty === qty && l.completed_qty === qty && l.shipped_qty === 0 && l.opening_completed_qty === qty && l.opening_reconcile_status === 'RECONCILED') && open.filter(l => l.sku === skus[skus.length - 1]).length === 1);
  check(label + ' the opening moved no stock and wrote no movement', grid(h, 'factory_stock') === stockGrid && grid(h, 'factory_stock_movements') === mvGrid);
  check(label + ' every SKU is now covered exactly: PO remaining = physical stock', skus.every(k => h.rows('purchase_order_lines').filter(l => l.sku === k).reduce((a, l) => a + l.remaining_qty, 0) === h.rows('factory_stock').filter(r => r.sku === k)[0].fac_current_stock));
  // the same commit again: a replay, nothing applied
  writes = h.writes(); atomic = h.atomic.calls.length;
  const again = await helper(s, 'commitOpening'), againStock = await helper(s, 'commitStock');
  check(label + ' a second commitOpening() and commitStock() are replays: no write, no atomic call, same batch ids', again.ok === true && again.replayed === true && again.batch_id === co.batch_id && againStock.replayed === true && againStock.batch_id === cs.batch_id &&
    h.writes() === writes && h.atomic.calls.length === atomic && count(h, 'purchase_order_lines') === lines0 + skus.length && grid(h, 'factory_stock') === stockGrid && grid(h, 'factory_stock_movements') === mvGrid);
  const st = await helper(s, 'status');
  check(label + ' the helper is not halted and reports both batches committed', st.halted === false && st.stock.committed === true && st.opening.committed === true && st.opening.replays === 1);
  evidence.cases.push({ case: label + ' stock-only ADD (console helper)', rows_sent: skus.length, request_bytes: cs.metrics.bytes, request_parts: cs.metrics.requests, audit_rows: cs.answer.result.audit_rows });
  evidence.cases.push({ case: label + ' internal opening (console helper)', rows_sent: skus.length, request_bytes: co.metrics.bytes, request_parts: co.metrics.requests, audit_rows: co.answer.result.audit_rows });
}

async function worldA(browser) {
  const h = bigWorld(210), s = await session(browser, h), { page } = s, dir = path.join(out, 'gen');
  await page.addScriptTag({ content: helperSource() });
  check('A the console helper loads, reads nothing, and a second paste keeps its state', await page.evaluate(() => typeof window.po200Opening.check === 'function') && s.templates.length === 0 &&
    await page.evaluate(src => { const before = window.po200Opening; (0, eval)(src); return window.po200Opening === before; }, helperSource()));
  check('A watch() taps the page\'s own Validate and Commit', await page.evaluate(() => window.po200Opening.watch()) === true);
  // ---- the page downloads its own template ----
  await openImporter(s); await page.locator('#km-imb-workflow-0').click();
  let download = page.waitForEvent('download'); await page.locator('#km-imb-download').click();
  const templateFile = path.join(out, 'template-downloaded.xlsx'); await (await download).saveAs(templateFile);
  const t = plain(h.c.handleImportTemplateGet_({ domain: 'po_factory_stock', mode: 'NEW_RECEIPT', scope: { warehouse_id: 'FACTORY-A' } })), templateBuffer = fs.readFileSync(templateFile);
  check('A the page downloaded a real New receipt template (StockPO, example row, _SYSTEM, _LISTS)', templateBuffer.length > 5000 && ['StockPO', '_SYSTEM', '_LISTS'].every(n => kit.sheetPart(templateBuffer, n)) && kit.sheetCells(templateBuffer, '_SYSTEM').cells.B12 === 'NEW_RECEIPT');
  // ---- the generator on that file ----
  const skus = Array.from({ length: 200 }, (_, i) => skuName(i)), skusFile = path.join(out, 'skus.txt'); fs.writeFileSync(skusFile, skus.join('\n') + '\n');
  const lines = [], code = await tool.main(['new', '--template', templateFile, '--out', dir, '--tag', 'BRWA01', '--company', 'KM', '--skus-file', skusFile], l => lines.push(l));
  check('A the generator fills the downloaded template: six workbooks and a manifest', code === 0 && /WROTE 6 workbooks/.test(lines.join('\n')), lines.join(' / '));
  const g = await kit.assertGenerated(dir, { page: kit.pageKit(), t, template: templateBuffer, tag: 'BRWA01', company: 'KM', factory: 'FACTORY-A', orderDate: '2026-11-22', usable: 200 });
  check('A every generated file holds what its manifest says (rows, POs, SKUs, blanks, example row, _SYSTEM)', Object.keys(g.files).length === 6);
  const file = name => path.join(dir, name), last = skuName(199);
  // ---- 01: 25-row control ----
  let x = await importFile(s, file('01-control-25.xlsx'), { shot: '01' }), rows = x.v.body.sheets.StockPO;
  check('A 01 the page read 25 data rows, mapped "ID | label" back to IDs, generated the batch id', rows.length === 25 && rows.every(r => r.company === 'KM' && r.warehouse_id === 'FACTORY-A' && /^ZZSKU-\d{3}$/.test(r.sku) && r.transaction_id === x.v.body.import_batch_id) && /^PFI-auto-[0-9a-f]{64}$/.test(x.v.body.import_batch_id) &&
    x.v.body.file_meta && x.v.body.file_meta.mode === 'NEW_RECEIPT' && JSON.parse(x.v.body.file_meta.scope).warehouse_id === 'FACTORY-A', rows[0]);
  check('A 01 validates and commits as ONE atomic call, read back', x.v.r.valid === true && /The file is valid/.test(x.validText) && x.c.r.success === true && x.atomic === 1 && x.c.r.result.readback_verified === true && /Data read back/.test(x.appliedText), x.v.r.issues || x.c);
  check('A 01 stock is 25 rows of 10, 25 movements, 1 PO with 25 lines of remaining 10', count(h, 'factory_stock') === 25 && h.rows('factory_stock').every(r => r.fac_current_stock === 10) && count(h, 'factory_stock_movements') === 25 && count(h, 'purchase_orders') === 1 &&
    linesOf(h, /-C01-001$/).length === 25 && linesOf(h, /-C01-/).every(l => l.remaining_qty === 10 && l.completed_qty === 10 && l.shipped_qty === 0 && l.ordered_qty === 100));
  let tap = await lastLog(s);
  check('A 01 the watch() tap printed this commit\'s metrics unchanged', tap.call === 'importCommit' && tap.batch === x.c.body.import_batch_id && JSON.stringify(tap.metrics) === JSON.stringify(x.c.r.metrics) && tap.metrics.bytes > 0 && s.console.some(l => /METRICS requests=\d+ bytes=\d+/.test(l)), tap);
  await page.locator('#pol-tbody tr').filter({ hasText: skuName(24) }).first().waitFor({ timeout: 30000 });
  check('A 01 Purchase Order Overview shows the imported last row after its refresh', (await page.locator('#pol-tbody').innerText()).includes(skuName(24)));
  record('01 control 25', x);
  // ---- 02: the Owner's shape, every quantity 0 ----
  let stock = grid(h, 'factory_stock'), mv = grid(h, 'factory_stock_movements');
  x = await importFile(s, file('02-owner-shape-zero-40.xlsx'), { shot: '02' }); rows = x.v.body.sheets.StockPO;
  check('A 02 the server received exactly 40 data rows / 14 POs / 31 SKUs, every quantity 0', rows.length === 40 && new Set(rows.map(r => r.po_no)).size === 14 && new Set(rows.map(r => r.sku)).size === 31 && rows.every(r => r.quantity === 0 && r.unproduced_qty === 100 && r.ordered_qty === 100));
  check('A 02 validates (stock change 0) and commits as ONE atomic call', x.v.r.valid === true && x.v.r.preview.impacts.stock_delta === 0 && x.c.r.success === true && x.atomic === 1 && x.c.r.result.stock.movements === 0, x.v.r.issues || x.c);
  check('A 02 factory_stock and factory_stock_movements are unchanged; 40 PO lines with remaining 0 on 14 POs', grid(h, 'factory_stock') === stock && grid(h, 'factory_stock_movements') === mv && linesOf(h, /-C02-/).length === 40 &&
    linesOf(h, /-C02-/).every(l => l.remaining_qty === 0 && l.shipped_qty === 0 && l.completed_qty === 0 && l.ordered_qty === 100) && h.rows('purchase_orders').filter(p => /-C02-/.test(p.po_no)).length === 14);
  record('02 owner shape, zero receipt, 40', x);
  // ---- 03: 200 rows, every quantity 0 ----
  x = await importFile(s, file('03-zero-200.xlsx'), { shot: '03' }); rows = x.v.body.sheets.StockPO;
  check('A 03 200 data rows received; validates and commits as ONE atomic call; the preview shows the last row', rows.length === 200 && rows[199].sku === last && x.v.r.valid === true && x.c.r.success === true && x.atomic === 1 && x.preview.includes(last), x.v.r.issues || x.c);
  check('A 03 no stock row and no movement added; 200 lines with remaining 0; the last row is stored', grid(h, 'factory_stock') === stock && grid(h, 'factory_stock_movements') === mv && linesOf(h, /-C03-/).length === 200 &&
    linesOf(h, /-C03-/).every(l => l.remaining_qty === 0 && l.shipped_qty === 0) && linesOf(h, /-C03-/).filter(l => l.sku === last).length === 1);
  record('03 zero receipt, 200', x);
  // ---- 04: one PO, 200 lines ----
  x = await importFile(s, file('04-one-po-200.xlsx'), { shot: '04' });
  const c04 = linesOf(h, /-C04-001$/);
  check('A 04 200 lines on ONE PO in one atomic call; stock +10 on 200 SKUs, 200 movements; the last row is stored', x.v.r.valid === true && x.c.r.success === true && x.atomic === 1 && c04.length === 200 && new Set(c04.map(l => l.purchase_order_id)).size === 1 && new Set(c04.map(l => l.sku)).size === 200 &&
    c04.every(l => l.remaining_qty === 10 && l.shipped_qty === 0) && count(h, 'factory_stock') === 200 && count(h, 'factory_stock_movements') === 225 && h.rows('factory_stock').filter(r => r.sku === last)[0].fac_current_stock === 10 && h.rows('factory_stock').filter(r => r.sku === skuName(0))[0].fac_current_stock === 20, x.v.r.issues || x.c);
  record('04 one PO x 200', x);
  // ---- 05: 200 POs, one line each ----
  const pos = count(h, 'purchase_orders');
  x = await importFile(s, file('05-many-po-200.xlsx'), { shot: '05' });
  check('A 05 200 new POs of one line in one atomic call, under the byte guard', x.v.r.valid === true && x.c.r.success === true && x.atomic === 1 && count(h, 'purchase_orders') === pos + 200 && linesOf(h, /-C05-/).length === 200 &&
    new Set(linesOf(h, /-C05-/).map(l => l.purchase_order_id)).size === 200 && count(h, 'factory_stock_movements') === 425 && x.c.r.metrics.bytes < x.c.r.metrics.max_bytes && x.c.r.metrics.max_bytes === 8000000, x.v.r.issues || x.c);
  record('05 200 POs x 1', x, { audit_cells_added: x.c.r.result.audit_rows * h.tables.import_batch_changes.grid[0].length });
  // ---- 06: 201 rows are refused in the page ----
  h.tick(); await openImporter(s);
  let nv = s.validations.length, nc = s.commits.length, writes = h.writes(), atomic = h.atomic.calls.length;
  await page.locator('#km-imb-file').setInputFiles(file('06-limit-201.xlsx'));
  await page.waitForFunction(() => /At most 200 rows/.test((document.querySelector('#km-imb-status') || {}).textContent || ''));
  const text201 = await statusText(s);
  check('A 06 201 rows: the page names the limit and the count, Validate stays unavailable, nothing was sent or written', /At most 200 rows/.test(text201) && /has 201/.test(text201) && /Nothing was submitted/.test(text201) && await page.evaluate(() => document.querySelector('#km-imb-validate').disabled) &&
    s.validations.length === nv && s.commits.length === nc && h.writes() === writes && h.atomic.calls.length === atomic && linesOf(h, /-C06-/).length === 0, text201);
  await page.screenshot({ path: path.join(out, '06-refused.png'), fullPage: true });
  evidence.cases.push({ case: '06 limit 201', rows_in_file: 201, refused_in_page: true, requests_sent: 0 });
  // ---- the replay check: the identical 01 file again ----
  h.tick(); await openImporter(s); nc = s.commits.length; writes = h.writes(); atomic = h.atomic.calls.length;
  await page.locator('#km-imb-file').setInputFiles(file('01-control-25.xlsx'));
  const rv = await validate(s), replayText = await statusText(s);
  check('A replay: the same file gets the same batch id; the page answers "already applied" from the receipt with no Apply, no write', (rv.r.receipt && rv.r.receipt.status === 'COMMITTED' && rv.r.receipt.same_content === true &&
    /already applied/.test(replayText) && /nothing was applied again/.test(replayText) && s.commits.length === nc && h.writes() === writes && h.atomic.calls.length === atomic && linesOf(h, /-C01-/).length === 25 && await page.evaluate(() => document.querySelector('#km-imb-apply').disabled)), replayText);
  check('A replay: that batch id is the one case 01 committed', rv.body.import_batch_id === s.commits[0].body.import_batch_id);
  await page.screenshot({ path: path.join(out, '01-replay.png'), fullPage: true });
  // ---- 07: New receipt on 200 EXISTING lines. The page offers no export for this mode: the console helper asks the same server read
  //      (KM.DB.importTemplateGet, include_data) and builds the file with the page's own KM.importBatch._exportSpec + KM.templateExport.buildAndDownload ----
  check('A the page itself exports with data only for "Update current data" (New receipt has no such control)', await page.evaluate(() => { const m = KM.poFactoryImport._adapter().modes; return m.filter(x => x.value === 'NEW_RECEIPT')[0].withData === false && m.filter(x => x.value === 'UPDATE_REMAINING')[0].withData === true; }));
  h.tick(); download = page.waitForEvent('download');
  const exported = await helper(s, 'exportExisting', { factory: 'FACTORY-A', mode: 'NEW_RECEIPT' }), exportReceipt = path.join(out, 'export-receipt.xlsx'); await (await download).saveAs(exportReceipt);
  check('A 07 the helper\'s read-only export downloaded all 665 existing lines and wrote nothing', exported.ok === true && exported.rows === 665 && kit.sheetCells(fs.readFileSync(exportReceipt), '_SYSTEM').cells.B7 === 'UPDATE_EXPORT' && h.writes() === writes);
  let r = await tool.main(['existing', '--export', exportReceipt, '--mode', 'receipt', '--tag', 'BRWA01', '--case', 'C04', '--out', dir], l => lines.push(l));
  check('A 07 the generator keeps the 200 tagged lines of case 04 and drops the other 465 rows', r === 0 && lines.some(l => /kept 200 tagged row\(s\); dropped 465 untagged and 0 over the 200-row limit/.test(l)), lines.slice(-4));
  let before = Object.fromEntries(h.rows('purchase_order_lines').map(l => [l.purchase_order_line_id, Object.assign({}, l)])), mvCount = count(h, 'factory_stock_movements');
  x = await importFile(s, file('07-existing-receipt-200.xlsx'), { shot: '07' }); rows = x.v.body.sheets.StockPO;
  const hit = new Set(rows.map(r0 => r0.purchase_order_line_id));
  check('A 07 the page sent 200 rows with their exported line id and row version, quantity 5, no unproduced value', rows.length === 200 && hit.size === 200 && rows.every(r0 => /^[0-9a-f]{64}$/.test(r0.row_version) && r0.quantity === 5 && (r0.unproduced_qty === '' || r0.unproduced_qty === undefined) && /-C04-001$/.test(r0.po_no) && r0.company === 'KM') && x.v.body.mode === 'NEW_RECEIPT');
  check('A 07 validates and commits as ONE atomic call', x.v.r.valid === true && x.c.r.success === true && x.atomic === 1 && x.c.r.result.readback_verified === true, x.v.r.issues || x.c);
  check('A 07 +5 on each of the 200 lines; shipped and ordered unchanged; one new movement per line; no other line touched', count(h, 'factory_stock_movements') === mvCount + 200 && h.rows('purchase_order_lines').every(l => { const b = before[l.purchase_order_line_id], d = hit.has(l.purchase_order_line_id) ? 5 : 0;
    return l.completed_qty === b.completed_qty + d && l.remaining_qty === b.remaining_qty + d && l.shipped_qty === b.shipped_qty && l.ordered_qty === b.ordered_qty && (d || l.updated_at === b.updated_at); }) && c04.length === 200 && linesOf(h, /-C04-001$/).every(l => l.remaining_qty === 15));
  record('07 New receipt on 200 existing lines', x);
  // the receipt export is now stale for the lines of case 05 (same SKUs): a file made from it is refused
  r = await tool.main(['existing', '--export', exportReceipt, '--mode', 'receipt', '--tag', 'BRWA01', '--case', 'C05', '--out', path.join(out, 'stale')], l => lines.push(l)); assert.equal(r, 0);
  writes = h.writes(); nc = s.commits.length;
  x = await importFile(s, path.join(out, 'stale', '07-existing-receipt-200.xlsx'), { shot: '07-stale' });
  check('A 07 a file from the stale export is refused at Validate (PFI_STALE_EXPORT); Apply is unavailable; nothing written', x.v.r.valid !== true && /PFI_STALE_EXPORT/.test(JSON.stringify(x.v.r.issues)) && /The file has problems/.test(x.validText) && x.c === null && s.commits.length === nc && h.writes() === writes &&
    await page.evaluate(() => document.querySelector('#km-imb-apply').disabled), x.validText);
  // ---- 08: Update current data - the page's OWN export (workflow "Update current data" > Download) ----
  h.tick(); await openImporter(s); await page.locator('#km-imb-workflow-1').click();
  download = page.waitForEvent('download'); await page.locator('#km-imb-download').click();
  const exportUpdate = path.join(out, 'export-update.xlsx'); await (await download).saveAs(exportUpdate);
  check('A 08 the page\'s real "Update current data" Download exported the 425 lines that have remaining units', kit.sheetCells(fs.readFileSync(exportUpdate), '_SYSTEM').cells.B12 === 'UPDATE_REMAINING' && s.templates[s.templates.length - 1].body.include_data === true && s.templates[s.templates.length - 1].r.sheets[0].rows.length === 425);
  r = await tool.main(['existing', '--export', exportUpdate, '--mode', 'remaining', '--tag', 'BRWA01', '--case', 'C04', '--out', dir], l => lines.push(l));
  check('A 08 the generator keeps the 200 tagged lines of case 04 and sets remaining - 1', r === 0 && lines.some(l => /kept 200 tagged row\(s\); dropped 225 untagged and 0 over the 200-row limit; quantity sum 3000 -> 2800/.test(l)), lines.slice(-4));
  before = Object.fromEntries(h.rows('purchase_order_lines').map(l => [l.purchase_order_line_id, Object.assign({}, l)])); mvCount = count(h, 'factory_stock_movements');
  const stockBefore = Object.fromEntries(h.rows('factory_stock').map(r0 => [r0.sku, r0.fac_current_stock]));
  x = await importFile(s, file('08-update-remaining-200.xlsx'), { shot: '08' }); rows = x.v.body.sheets.StockPO;
  const hit8 = new Set(rows.map(r0 => r0.purchase_order_line_id));
  check('A 08 the page sent 200 rows in UPDATE_REMAINING with target remaining 14; validates and commits as ONE atomic call', rows.length === 200 && x.v.body.mode === 'UPDATE_REMAINING' && rows.every(r0 => r0.quantity === 14 && !('unproduced_qty' in r0)) && x.v.r.valid === true && x.c.r.success === true && x.atomic === 1, x.v.r.issues || x.c);
  check('A 08 remaining - 1 on each of the 200 lines and their stock; shipped / ordered / reserved and every other line unchanged', h.rows('purchase_order_lines').every(l => { const b = before[l.purchase_order_line_id], d = hit8.has(l.purchase_order_line_id) ? 1 : 0;
    return l.remaining_qty === b.remaining_qty - d && l.completed_qty === b.completed_qty - d && l.shipped_qty === b.shipped_qty && l.ordered_qty === b.ordered_qty && (d || l.updated_at === b.updated_at); }) &&
    h.rows('factory_stock').every(r0 => r0.fac_current_stock === stockBefore[r0.sku] - 1 && Number(r0.fac_reserved_stock || 0) === 0) && count(h, 'factory_stock_movements') === mvCount + 200);
  record('08 Update current data on 200 lines', x);
  r = await tool.main(['existing', '--export', exportUpdate, '--mode', 'remaining', '--tag', 'BRWA01', '--case', 'C05', '--out', path.join(out, 'stale')], l => lines.push(l)); assert.equal(r, 0);
  writes = h.writes(); nc = s.commits.length;
  x = await importFile(s, path.join(out, 'stale', '08-update-remaining-200.xlsx'), { shot: '08-stale' });
  check('A 08 a stale re-upload (another file from the same export) is refused: PFI_STALE_EXPORT, nothing written', x.v.r.valid !== true && /PFI_STALE_EXPORT/.test(JSON.stringify(x.v.r.issues)) && x.c === null && s.commits.length === nc && h.writes() === writes, x.validText);
  // ---- the opening, on the same book the cases ran on ----
  const ck = await helper(s, 'check');
  check('A check() reads the four installed values, all matching, with no write', ck.ok === true && ck.rows.length === 4 && ck.rows.every(k => k.match === true) && ck.limits.max_rows === 200 && ck.limits.pfa_max_bytes === 8000000 && h.writes() === writes, ck);
  await openingFlow(s, 'A', 'BRWA01', skus, 7);
  // ---- the whole world: every commit was one atomic call ----
  const done = s.commits.filter(c => c.r.success === true && c.r.replayed !== true), receipts = h.rows('import_batches'), log = await page.evaluate(() => window.po200Opening.log());
  check('A every commit was exactly one atomic call: ' + done.length + ' commits, ' + h.atomic.calls.length + ' atomic calls, ' + receipts.length + ' COMMITTED receipts', done.length === 9 && h.atomic.calls.length === 9 && receipts.length === 9 && receipts.every(b => b.status === 'COMMITTED') && s.commits.length === 11);
  check('A the watch() tap saw every Validate and Commit and changed none', log.filter(e => e.call === 'importValidate').length === s.validations.length && log.filter(e => e.call === 'importCommit').length === s.commits.length &&
    log.filter(e => e.call === 'importCommit').every((e, i) => e.batch === s.commits[i].body.import_batch_id && JSON.stringify(e.metrics) === JSON.stringify(s.commits[i].r.metrics || null)));
  const poDone = done.filter(c => c.body.domain === 'po_factory_stock'), stockDone = done.filter(c => c.body.domain === 'factory_inventory');
  check('A documents / emails are 0 on each of the ' + poDone.length + ' PO commits; the stock-only answer has no such fields; no file or folder was created', poDone.length === 8 && poDone.every(c => c.r.result.documents === 0 && c.r.result.emails === 0) &&
    stockDone.length === 1 && !('documents' in stockDone[0].r.result) && (h.files || []).length === 0 && (h.folders || []).length === 0, { files: (h.files || []).length, keys: Object.keys(stockDone[0].r.result) });
  check('A the helper printed no address', s.console.length > 20 && !s.console.some(l => /https?:|script\.google|127\.0\.0\.1/.test(l)));
  check('A no browser exceptions and no outbound network', s.ui.errors.length === 0 && s.ui.outbound.length === 0, { errors: s.ui.errors, outbound: s.ui.outbound.length });
  fs.writeFileSync(path.join(out, 'console-world-a.log'), s.console.join('\n') + '\n');
  await page.close();
}

async function worldB(browser) {
  const h = bigWorld(210), skus = Array.from({ length: 200 }, (_, i) => skuName(i));
  let s = await session(browser, h), w = h.writes();
  await s.page.addScriptTag({ content: helperSource() });
  // refusals before anything is read
  let why = await helperRefused(s, 'planStock', { factory: 'FACTORY-A', skus, qty: 30, tag: 'BRWB01' });
  check('B planStock without the sandbox flag is refused before any request', /PO200 REFUSED/.test(why) && /iUnderstandThisIsTheIsolatedSandbox: true/.test(why) && s.templates.length === 0 && s.validations.length === 0, why);
  why = await helperRefused(s, 'planOpening', { factory: 'FACTORY-A', company: 'KM', tag: 'BRWB01', orderDate: '2026-11-20', skus, iUnderstandThisIsTheIsolatedSandbox: 'yes' });
  check('B planOpening without the flag (or with anything but true) is refused before any request', /iUnderstandThisIsTheIsolatedSandbox: true/.test(why) && s.templates.length === 0 && s.validations.length === 0, why);
  why = await helperRefused(s, 'planStock', Object.assign({ factory: 'FACTORY-A', skus, qty: 30, tag: 'BRWB01' }, FLAG));
  check('B with the flag but before check(), planning is still refused', /run po200Opening\.check\(\) first/.test(why) && s.validations.length === 0, why);
  why = await helperRefused(s, 'commitOpening'); const why2 = await helperRefused(s, 'commitStock');
  check('B a commit with nothing planned is refused and sends nothing', /nothing is planned/.test(why) && /nothing is planned/.test(why2) && s.commits.length === 0);
  const ck = await helper(s, 'check');
  check('B check() prints the row limit, both builds and the byte guard, and whether KM.DB.envId exists - read-only', ck.ok === true && ck.limits.max_rows === 200 && ck.limits.pfi_build === h.c.PFI_BUILD_VERSION_ && ck.limits.pfa_build === h.c.PFA_BUILD_VERSION_ && ck.limits.pfa_max_bytes === h.c.PFA_MAX_BYTES_ &&
    typeof ck.environment.envId_present === 'boolean' && s.templates.length === 1 && s.templates[0].body.mode === 'NEW_RECEIPT' && JSON.stringify(s.templates[0].body.scope) === '{}' && h.writes() === w && s.console.some(l => /ENVIRONMENT \(printed, not judged\)/.test(l)) && s.console.filter(l => /^\[po200\] MATCH /.test(l)).length === 4, ck);
  // bad arguments are refused locally
  for (const [label, arg, pattern] of [['a lower-case tag', { factory: 'FACTORY-A', skus, qty: 30, tag: 'brwb01' }, /tag must be 4-12/], ['201 SKUs', { factory: 'FACTORY-A', skus: [...skus, skuName(200)], qty: 30, tag: 'BRWB01' }, /1-200 SKU IDs/],
    ['a SKU twice', { factory: 'FACTORY-A', skus: [skuName(1), skuName(1)], qty: 30, tag: 'BRWB01' }, /same SKU more than once/], ['a zero quantity', { factory: 'FACTORY-A', skus, qty: 0, tag: 'BRWB01' }, /whole number of at least 1/]]) {
    why = await helperRefused(s, 'planStock', Object.assign(arg, FLAG)); check('B planStock refuses ' + label + ' without a request', pattern.test(why) && s.validations.length === 0, why);
  }
  why = await helperRefused(s, 'planOpening', Object.assign({ factory: 'FACTORY-A', company: 'KM', tag: 'BRWB01', orderDate: '2026-11-20', skus }, FLAG));
  check('B planOpening before any stock exists is refused: the server\'s opening export names none of the SKUs; nothing planned', /200 of the 200 SKUs have no unassigned stock/.test(why) && s.validations.length === 0 && h.writes() === w, why);
  await openingFlow(s, 'B', 'BRWB01', skus, 30);
  check('B the fresh world holds exactly: 200 stock rows of 30, 200 movements, 8 POs, 200 lines, 2 receipts, 2 atomic calls', count(h, 'factory_stock') === 200 && h.rows('factory_stock').every(r => r.fac_current_stock === 30) && count(h, 'factory_stock_movements') === 200 &&
    count(h, 'purchase_orders') === 8 && count(h, 'purchase_order_lines') === 200 && count(h, 'import_batches') === 2 && h.atomic.calls.length === 2);
  check('B no browser exceptions and no outbound network', s.ui.errors.length === 0 && s.ui.outbound.length === 0, { errors: s.ui.errors, outbound: s.ui.outbound.length });
  fs.writeFileSync(path.join(out, 'console-world-b.log'), s.console.join('\n') + '\n');
  await s.page.close();

  // ---- halt 1: a new session that reuses the tag - the server already holds that batch; the helper halts, no new id, no resend ----
  s = await session(browser, h); await s.page.addScriptTag({ content: helperSource() });
  w = h.writes(); let atomic = h.atomic.calls.length; await helper(s, 'check');
  let res = await helper(s, 'planStock', Object.assign({ factory: 'FACTORY-A', skus, qty: 30, tag: 'BRWB01' }, FLAG));
  check('B a used tag: planStock prints the full answer and halts (the batch already has a receipt)', res.ok === false && res.halted === true && /already has a receipt \(COMMITTED/.test(res.reason) && s.console.some(l => /FULL ANSWER/.test(l)) && s.console.some(l => /STOP\. Do not resend/.test(l)), res.reason);
  why = await helperRefused(s, 'commitStock'); const whyPlan = await helperRefused(s, 'planOpening', Object.assign({ factory: 'FACTORY-A', company: 'KM', tag: 'BRWB02', orderDate: '2026-11-20', skus }, FLAG));
  check('B once halted, every commit and every plan is refused - also with another tag - and nothing was sent or written', /this session is halted/.test(why) && /this session is halted/.test(whyPlan) && s.commits.length === 0 && h.writes() === w && h.atomic.calls.length === atomic && (await helper(s, 'status')).halted !== false);
  await s.page.close();

  // ---- halt 2: the installed code does not report the limits (not the candidate) ----
  s = await session(browser, h); await s.page.addScriptTag({ content: helperSource() }); s.flags.noLimits = true;
  res = await helper(s, 'check');
  check('B a server that reports no limits: check() says NOT the candidate', res.ok === false && res.rows.every(k => k.match === false && k.installed === 'NOT REPORTED') && s.console.some(l => /NOT the candidate/.test(l)));
  why = await helperRefused(s, 'planStock', Object.assign({ factory: 'FACTORY-A', skus: [skuName(205)], qty: 1, tag: 'BRWB03' }, FLAG));
  check('B and the plan functions stay refused', /run po200Opening\.check\(\) first/.test(why) && s.validations.length === 0, why);
  await s.page.close();

  // ---- halt 3: a commit that gets no answer is never sent again ----
  s = await session(browser, h); await s.page.addScriptTag({ content: helperSource() });
  await helper(s, 'check'); h.tick();
  res = await helper(s, 'planStock', Object.assign({ factory: 'FACTORY-A', skus: [skuName(205), skuName(206)], qty: 3, tag: 'BRWB04' }, FLAG)); assert.equal(res.ok, true, JSON.stringify(res));
  s.flags.loseCommit = true; w = h.writes(); atomic = h.atomic.calls.length;
  res = await helper(s, 'commitStock');
  check('B a commit with no answer: the helper says the result is unknown and halts', res.ok === false && res.halted === true && /NO ANSWER - the result is unknown/.test(res.reason) && s.console.some(l => /STOP\. Do not resend/.test(l)), res);
  s.flags.loseCommit = false; why = await helperRefused(s, 'commitStock');
  check('B it is not sent again, even though the server would answer now', /this session is halted/.test(why) && s.commits.length === 0 && h.writes() === w && h.atomic.calls.length === atomic, why);
  check('B no browser exceptions and no outbound network in the halt sessions', s.ui.errors.length === 0 && s.ui.outbound.length === 0, { errors: s.ui.errors, outbound: s.ui.outbound.length });
  await s.page.close();

  // ---- halt 4 (a fact the operator must know): the server's opening export checks EVERY stock row of the factory. One unrelated row
  //      whose stock is below its PO coverage makes the whole export fail, so the opening cannot be planned for any SKU ----
  s = await session(browser, h); await s.page.addScriptTag({ content: helperSource() });
  await helper(s, 'check');
  const st = h.tables.factory_stock, cStock = st.grid[0].indexOf('fac_current_stock'), cSku = st.grid[0].indexOf('sku'), row0 = st.grid.findIndex((r, i) => i > 0 && r[cSku] === skuName(0)), kept = st.grid[row0][cStock];
  st.grid[row0][cStock] = 1; w = h.writes(); atomic = h.atomic.calls.length;
  res = await helper(s, 'planOpening', Object.assign({ factory: 'FACTORY-A', company: 'KM', tag: 'BRWB05', orderDate: '2026-11-20', skus: [skuName(205)] }, FLAG));
  st.grid[row0][cStock] = kept;
  check('B one unrelated stock row below its PO coverage: the opening export fails as a whole (PFI_BASELINE_MISMATCH), the helper prints it and halts, nothing is written', res.ok === false && res.halted === true && /opening export did not succeed/.test(res.reason) &&
    res.answer.success === false && res.answer.code === 'PFI_BASELINE_MISMATCH' && s.validations.length === 0 && s.commits.length === 0 && h.writes() === w && h.atomic.calls.length === atomic, res);
  await s.page.close();
}

function runMutants() {
  const { spawnSync } = require('node:child_process'), results = [];
  for (const name of Object.keys(HELPER_MUTANTS)) {
    const r = spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { KM_PO200_HELPER_MUTANT: name }), encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    const text = String(r.stdout) + String(r.stderr), failed = (text.split('\n').filter(l => /AssertionError|Error: /.test(l))[0] || '').trim().slice(0, 220);
    const caught = r.status !== 0 && !/PO200_SYNTHETIC_TOOLS_BROWSER_PASS/.test(text) && HELPER_MUTANTS[name][2].test(text);
    results.push({ mutant: name, exit: r.status, caught, passes_before_failure: (text.match(/^PASS /gm) || []).length, failed_at: failed });
    console.log((caught ? 'CAUGHT   ' : 'SURVIVED ') + name + ' exit=' + r.status + ' :: ' + failed);
  }
  const dir = path.join(root, 'output/po200-20261127/tools-browser-mutants'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify(results, null, 1) + '\n');
  const n = results.filter(x => x.caught).length;
  console.log('PO200_HELPER_MUTANTS_CAUGHT ' + n + '/' + results.length);
  process.exitCode = n === results.length ? 0 : 1;
}
if (process.argv.includes('--mutants')) runMutants();
else (async () => {
  fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    if (!mutantName) await worldA(browser);                      // a mutant of the console helper is judged on world B alone
    await worldB(browser);
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(Object.assign({ checks }, evidence), null, 1) + '\n');
    console.log('PO200_SYNTHETIC_TOOLS_BROWSER_PASS ' + checks + ' worlds=2 outbound=0 live_business_writes=0 native_sheets=NOT_RUN');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
