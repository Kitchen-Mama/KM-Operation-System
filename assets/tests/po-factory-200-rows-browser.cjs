'use strict';
// PO200 - a real Chrome uploads a real 200-row XLSX through the shared importer, from both pages that open it
// (Purchase Order Overview at 1440, Factory Stock at 390), validates, applies, and reads back. The server is the real
// 78_/79_/81_/82_/82a_ in memory. Synthetic data only; every outbound request is aborted and counted.
// NOT shown here: real Sheets, real Apps Script time, the live router or session.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { world, root, read, plain } = require('./helpers/po-factory-unproduced-world.cjs');
const { openHarness, mount } = require('./order-mainline-browser-c1.cjs');
const runtime = process.env.KM_NODE_MODULES || 'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1119-907-0_26.1119.907.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const { chromium } = require(require.resolve('playwright', { paths: [runtime] }));
const ExcelJS = require('../vendor/exceljs-4.4.0.min.js');
const out = path.join(root, 'output/po200-20261127/browser');
const skuName = i => 'ROW200-' + String(i).padStart(3, '0');
let checks = 0;
function check(label, value, detail) { assert(value, label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))); checks++; console.log('PASS ' + label); }
(async () => {
  fs.mkdirSync(out, { recursive: true }); const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of (process.env.KM_PO200_WIDTHS || '1440,390').split(',').map(Number)) {
      const h = world(), validations = [], commits = [], loads = [];
      h.sheet('sku_regional_details', ['sku', 'site_sku'], Array.from({ length: 201 }, (_, i) => ({ sku: 'CO1150-N', site_sku: skuName(i) })));
      const ui = await openHarness(browser, width, h), { page } = ui;
      await page.exposeFunction('stockPoTemplate', body => plain(h.c.handleImportTemplateGet_(body)));
      await page.exposeFunction('stockPoValidate', body => { const r = plain(h.c.handleImportValidate_(body)); validations.push({ body, r }); return r; });
      await page.exposeFunction('stockPoCommit', body => { const r = plain(h.c.handleImportCommit_(body)); commits.push({ body, r }); return r; });
      await page.exposeFunction('recordLoad', src => { loads.push(src); });
      for (const file of ['assets/vendor/exceljs-4.4.0.min.js', 'assets/js/utils/template-export.js', 'assets/js/utils/import-batch.js']) await page.addScriptTag({ content: read(file) });
      const moduleSource = read('assets/js/utils/po-factory-import.js');
      // the page's own lazy loader is what brings the module in: the token it asks for is recorded, then the real file is evaluated
      await page.evaluate(source => {
        KM.scriptLoader = { load: async src => { await recordLoad(src); if (/po-factory-import\.js/.test(src)) (0, eval)(source); return true; } };
        Object.assign(KM.DB, { importTemplateGet: stockPoTemplate, importValidate: stockPoValidate, importCommit: stockPoCommit, refreshPoFactoryTables: async () => ({ success: true }) });
      }, moduleSource);
      if (width === 1440) {                                                    // entry 1: Purchase Order Overview > Actions > Import Purchase Order
        await mount(page, 'purchase-order-list', 'initPurchaseOrderListPage');
        await page.locator('#polActionsTrigger').click();
        await page.getByRole('menuitem', { name: 'Import Purchase Order', exact: true }).click();
      } else {                                                                 // entry 2: Factory Stock's import opener
        await page.addScriptTag({ content: read('assets/js/pages/factory-stock.js') });
        // HARNESS LIMIT, stated: the Factory Stock page itself is not mounted here (no harness builds its workspace). Its post-commit step
        // (_fiiAdoptCombinedReadback) is run for real against a placeholder read model, and the page re-render it ends with is replaced by a counter.
        // So this proves the opener, the module, the upload, Validate, Commit and that the page's adoption step runs once - NOT the Factory Stock
        // table redrawing with the new rows (FACTORY_STOCK_TABLE_REDRAW = NOT_RUN in a browser).
        await page.evaluate(() => { _fsReadModel = { factoryStock: [], factoryStockMovements: [] }; window.__fsRedraws = 0; window.initFactoryStockPage = function () { window.__fsRedraws++; }; _fiiOpenBatchImport(); });
      }
      await page.locator('#km-imb-scope-warehouse_id').waitFor();
      check(width + ' the page loaded the 200-row module by its new token', loads.length === 1 && loads[0] === 'assets/js/utils/po-factory-import.js?v=po200-20261127-v1', loads);
      check(width + ' the module limit is 200', await page.evaluate(() => KM.poFactoryImport.MAX_ROWS) === 200);
      await page.locator('#km-imb-scope-warehouse_id').selectOption('FACTORY-A');
      await page.locator('#km-imb-workflow-0').click();
      const download = page.waitForEvent('download'); await page.locator('#km-imb-download').click();
      const file = path.join(out, 'template-' + width + '.xlsx'); await (await download).saveAs(file);
      const t = h.c.handleImportTemplateGet_({ domain: 'po_factory_stock', mode: 'NEW_RECEIPT', scope: { warehouse_id: 'FACTORY-A' } }), def = t.sheets[0], values = h.body().sheets.StockPO[0];
      // build an n-row workbook from the downloaded template. The template's example row is LEFT IN PLACE: it is not a data row.
      const build = async n => {
        const wb = new ExcelJS.Workbook(); await wb.xlsx.load(fs.readFileSync(file));
        const ws = wb.getWorksheet('StockPO'), headers = {};
        const headerRow = [1, 2, 3, 4].find(r => ws.getRow(r).values.includes('po_no')); assert(headerRow);
        ws.getRow(headerRow).eachCell((cell, col) => { headers[String(cell.value)] = col; });
        const typeCol = headers.row_type, exampleKept = typeCol ? String(ws.getCell(headerRow + 1, typeCol).value || '') === 'example' : false;
        const first = headerRow + (exampleKept ? 2 : 1);
        for (let i = 0; i < n; i++) def.columns.forEach(c => {
          const v = c.key === 'transaction_id' || c.key === 'row_type' ? null : c.key === 'sku' ? skuName(i) : c.key === 'po_no' ? 'PO-BROWSER-' + String(Math.floor(i / 50)) : values[c.key] ?? null;
          ws.getCell(first + i, headers[c.header]).value = v;
        });
        return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), exampleKept };
      };
      const upload = async (name, buffer) => {
        await page.locator('#km-imb-file').setInputFiles({ name, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer });
      };
      // ---- 201 rows: refused in the browser, nothing sent ----
      const f201 = await build(201); await upload('rows-201.xlsx', f201.buffer);
      await page.waitForFunction(() => /At most 200 rows/.test(document.querySelector('#km-imb-status')?.textContent || document.body.innerText));
      const text201 = await page.evaluate(() => document.body.innerText);
      check(width + ' 201 rows: the page names the limit and the count, and sent nothing', /At most 200 rows/.test(text201) && /has 201/.test(text201) && validations.length === 0 && commits.length === 0);
      check(width + ' 201 rows: no 25-row wording anywhere', !/At most 25/.test(text201));
      await page.screenshot({ path: path.join(out, 'rows-201-refused-' + width + '.png'), fullPage: true });
      // ---- 200 rows (4 POs x 50 SKUs), the example row still in the file ----
      const f200 = await build(200); await upload('rows-200.xlsx', f200.buffer);
      await page.waitForFunction(() => !document.querySelector('#km-imb-validate').disabled);
      await page.locator('#km-imb-validate').click();
      await page.waitForFunction(() => !document.querySelector('#km-imb-validate').disabled);
      const v = validations[0];
      check(width + ' 200 rows: the real XLSX parsed to exactly 200 data rows (example row left out: ' + f200.exampleKept + ')', v && v.body.sheets.StockPO.length === 200 && v.body.sheets.StockPO.every(r => String(r.row_type || '') !== 'example'), v && v.body.sheets.StockPO.length);
      check(width + ' 200 rows: one generated batch id on every row, and the last row is the last SKU', /^PFI-auto-[0-9a-f]{64}$/.test(v.body.import_batch_id) && v.body.sheets.StockPO.every(r => r.transaction_id === v.body.import_batch_id) && v.body.sheets.StockPO[199].sku === skuName(199));
      check(width + ' 200 rows: Validate accepts the file with no write', v.r.valid === true && h.rows('purchase_orders').length === 0 && h.atomic.calls.length === 0, v.r.issues);
      const previewText = await page.evaluate(() => document.body.innerText);
      check(width + ' 200 rows: the preview shows the last row', previewText.includes(skuName(199)));
      await page.screenshot({ path: path.join(out, 'rows-200-validated-' + width + '.png'), fullPage: true });
      await page.locator('#km-imb-confirm').check(); await page.locator('#km-imb-apply').click();
      await page.waitForFunction(() => { const t = document.querySelector('#km-imb-status')?.textContent || ''; return t.includes('Data read back') || /read ?back|Reload|not ready|unavailable/i.test(t) && !t.includes('Reading the data back'); }, null, { timeout: 120000 });
      const statusAfter = await page.evaluate(() => document.querySelector('#km-imb-status')?.textContent || '');
      check(width + ' after Commit the importer says the data was read back', statusAfter.includes('Data read back') && !/readback failed/i.test(statusAfter), statusAfter.slice(0, 200));
      if (width !== 1440) check(width + ' Factory Stock ran its own post-commit adoption exactly once', await page.evaluate(() => window.__fsRedraws) === 1);
      const c = commits[0];
      check(width + ' 200 rows: Commit succeeded as ONE atomic request, read back', commits.length === 1 && c.r.success === true && c.r.result.atomic_commit === true && c.r.result.readback_verified === true && h.atomic.calls.length === 1, c && c.r.code);
      check(width + ' 200 rows: 4 POs, 200 lines, 200 stock rows of 200, 200 movements, one committed receipt', h.rows('purchase_orders').length === 4 && h.rows('purchase_order_lines').length === 200 &&
        h.rows('factory_stock').length === 200 && h.rows('factory_stock').every(s => s.fac_current_stock === 200) && h.rows('factory_stock_movements').length === 200 &&
        h.rows('import_batches').length === 1 && h.rows('import_batches')[0].status === 'COMMITTED');
      check(width + ' 200 rows: the last row of the file is stored', h.rows('purchase_order_lines').filter(l => l.sku === skuName(199)).length === 1 && h.rows('factory_stock').filter(s => s.sku === skuName(199)).length === 1);
      await page.screenshot({ path: path.join(out, 'rows-200-committed-' + width + '.png'), fullPage: true });
      if (width === 1440) {                                                    // the page that opened the importer refreshed and shows the new POs
        await page.locator('#pol-tbody tr').filter({ hasText: skuName(199) }).first().waitFor({ timeout: 30000 });
        check(width + ' Purchase Order Overview shows the imported last row after the refresh', (await page.locator('#pol-tbody').innerText()).includes(skuName(199)));
        await page.screenshot({ path: path.join(out, 'overview-after-' + width + '.png'), fullPage: true });
      }
      // ---- the same file again: the same batch id, nothing added ----
      const sameId = await page.evaluate(async args => KM.poFactoryImport._batchId({ sheets: { StockPO: args.rows.map(r => Object.assign({}, r, { transaction_id: '' })) } }, args.template), { rows: v.body.sheets.StockPO, template: plain(t) });
      check(width + ' the same content gives the same batch id', sameId === v.body.import_batch_id);
      const writes = h.writes(), again = plain(h.c.handleImportCommit_(c.body));
      check(width + ' sending the same batch again applies nothing', again.replayed === true && h.writes() === writes && h.atomic.calls.length === 1 && h.rows('factory_stock_movements').length === 200);
      check(width + ' no browser exceptions and no outbound network', ui.errors.length === 0 && ui.outbound.length === 0, { errors: ui.errors, outbound: ui.outbound.length });
      await page.close();
    }
    console.log('PO_FACTORY_200_ROWS_BROWSER_PASS ' + checks + ' live_business_writes=0 native_sheets=NOT_RUN');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
