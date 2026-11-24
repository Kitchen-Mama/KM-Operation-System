'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { world, root, read, plain } = require('./helpers/po-factory-unproduced-world.cjs');
const { openHarness, mount } = require('./order-mainline-browser-c1.cjs');
const runtime = process.env.KM_NODE_MODULES || 'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1119-907-0_26.1119.907.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const { chromium } = require(require.resolve('playwright', { paths: [runtime] }));
const ExcelJS = require('../vendor/exceljs-4.4.0.min.js');
const out = path.join(root, 'output/po-factory-unproduced-20261124/browser');
let checks = 0;
function check(label, value) { assert(value, label); checks++; console.log('PASS ' + label); }
(async () => {
  fs.mkdirSync(out, { recursive: true }); const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [1440, 390]) {
      const h = world(), validations = [], commits = [], ui = await openHarness(browser, width, h), { page } = ui;
      await page.exposeFunction('stockPoTemplate', body => plain(h.c.handleImportTemplateGet_(body)));
      await page.exposeFunction('stockPoValidate', body => { const r = plain(h.c.handleImportValidate_(body)); validations.push({ body, r }); return r; });
      await page.exposeFunction('stockPoCommit', body => { const r = plain(h.c.handleImportCommit_(body)); commits.push({ body, r }); return r; });
      for (const file of ['assets/vendor/exceljs-4.4.0.min.js', 'assets/js/utils/template-export.js', 'assets/js/utils/import-batch.js', 'assets/js/utils/po-factory-import.js']) await page.addScriptTag({ content: read(file) });
      await page.evaluate(() => { Object.assign(KM.DB, { importTemplateGet: stockPoTemplate, importValidate: stockPoValidate, importCommit: stockPoCommit,
        refreshPoFactoryTables: async () => ({ success: true }) }); KM.poFactoryImport.open(); });
      await page.locator('#km-imb-scope-warehouse_id').selectOption('FACTORY-A');
      await page.locator('#km-imb-workflow-0').click();
      const download = page.waitForEvent('download'); await page.locator('#km-imb-download').click();
      const file = path.join(out, 'stockpo-' + width + '.xlsx'); await (await download).saveAs(file);
      const wb = new ExcelJS.Workbook(); await wb.xlsx.load(fs.readFileSync(file));
      const t = h.c.handleImportTemplateGet_({ domain: 'po_factory_stock', mode: 'NEW_RECEIPT', scope: { warehouse_id: 'FACTORY-A' } });
      const ws = wb.getWorksheet('StockPO'), headers = {}, def = t.sheets[0], values = h.body().sheets.StockPO[0];
      const headerRow = [1, 2, 3, 4].find(r => ws.getRow(r).values.includes('po_no')); assert(headerRow);
      ws.getRow(headerRow).eachCell((cell, col) => { headers[String(cell.value)] = col; });
      def.columns.forEach(c => { ws.getCell(headerRow + 1, headers[c.header]).value = c.key === 'transaction_id' ? null : values[c.key] ?? null; });
      const pending = def.columns.find(c => c.key === 'unproduced_qty');
      check(width + ' downloaded XLSX contains readable unproduced quantity', pending && headers[pending.header] > 0);
      const stable = await page.evaluate(async template => {
        const old = JSON.parse(JSON.stringify(template)); old.sheets[0].columns = old.sheets[0].columns.filter(c => c.key !== 'unproduced_qty');
        const parsed = () => ({ sheets: { StockPO: [{ company: 'KM', sku: 'CO1150-N', quantity: 200, ordered_qty: 1000 }] } });
        return await KM.poFactoryImport._batchId(parsed(), old) === await KM.poFactoryImport._batchId(parsed(), template);
      }, plain(t)); check(width + ' legacy auto batch ID stays stable with new optional blank column', stable);
      const upload = async name => {
        await page.locator('#km-imb-file').setInputFiles({ name, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(await wb.xlsx.writeBuffer()) });
        await page.waitForFunction(() => !document.querySelector('#km-imb-validate').disabled);
        await page.locator('#km-imb-validate').click(); await page.waitForFunction(() => !document.querySelector('#km-imb-validate').disabled);
      };
      ws.getCell(headerRow + 1, headers.quantity).value = 800; await upload('over-ordered.xlsx');
      check(width + ' actual XLSX sum above ordered is refused with no stock/PO writes', validations[0]?.r.valid === false && h.rows('purchase_orders').length === 0 && h.rows('factory_stock').length === 0);
      ws.getCell(headerRow + 1, headers.quantity).value = 200; await upload('partial-production.xlsx');
      check(width + ' actual Chinese column parses and validates 200 stock / 300 pending', validations[1]?.r.valid === true && validations[1].body.sheets.StockPO[0].unproduced_qty === 300);
      await page.locator('#km-imb-confirm').check(); await page.locator('#km-imb-apply').click();
      await page.waitForFunction(() => document.querySelector('#km-imb-status')?.textContent.includes('Data read back'));
      check(width + ' reviewed import commits only 200 stock and historical counters once', commits[0]?.r.success && h.rows('factory_stock')[0].fac_current_stock === 200 && h.rows('purchase_order_lines')[0].shipped_qty === 500);
      const poId = h.rows('purchase_orders')[0].purchase_order_id;
      await mount(page, 'purchase-order-list', 'initPurchaseOrderListPage');
      await page.locator('#pol-tbody tr').filter({ hasText: 'CO1150-N' }).waitFor();
      check(width + ' Overview reads imported production through real workspace', (await page.locator('#pol-tbody').innerText()).includes('700'));
      await page.screenshot({ path: path.join(out, 'overview-' + width + '.png'), fullPage: true });
      await mount(page, 'purchase-order-overview', 'initPurchaseOrderOverviewPage');
      const po = page.locator('[id="po-card-' + poId + '"]'); await po.waitFor();
      await po.getByRole('button', { name: 'Receive', exact: true }).waitFor();
      check(width + ' imported PO is in production and directly receivable, not draft approval', h.rows('purchase_orders')[0].order_status === 'partial_completed' && await po.getByRole('button', { name: 'Send PO', exact: true }).count() === 0);
      await po.getByRole('button', { name: 'Receive', exact: true }).click(); await page.locator('.po-rcv-input').waitFor();
      check(width + ' actual fresh receipt preconditions show exactly 300 unproduced', await page.locator('.po-rcv-input').inputValue() === '300');
      await page.screenshot({ path: path.join(out, 'pending-receipt-' + width + '.png'), fullPage: true });
      await page.getByRole('button', { name: 'Confirm Receive', exact: true }).click();
      await page.locator('#po-modal').waitFor({ state: 'detached' });
      check(width + ' real receipt completes PO and stock becomes 500, not 1000', h.rows('purchase_orders')[0].order_status === 'completed' && h.rows('factory_stock')[0].fac_current_stock === 500 && h.rows('purchase_order_lines')[0].completed_qty === 1000);
      await po.waitFor({ state: 'detached' });
      check(width + ' completed PO leaves active Workspace and its selectors', await page.locator('#po-groups [data-status="completed"]').count() === 0 && !await page.locator('#po-toolbar').isVisible());
      const receipt = h.calls.find(c => c.action === 'receivePurchaseOrderLines' && !c.mode), before = h.writes();
      const replay = await page.evaluate(body => KM.DB.receivePurchaseOrderLines(body), receipt);
      check(width + ' receipt replay is idempotent with zero additional writes', replay.already_recorded === true && h.writes() === before);
      await mount(page, 'purchase-order-list', 'initPurchaseOrderListPage');
      await page.getByRole('button', { name: /Ready \/ Completed/ }).click();
      await page.locator('#pol-tbody tr').filter({ hasText: 'CO1150-N' }).waitFor();
      check(width + ' completed PO remains in Overview', (await page.locator('#pol-tbody').innerText()).includes('1,000'));
      check(width + ' no browser exceptions or real outbound network', ui.errors.length === 0 && ui.outbound.length === 0);
      await page.screenshot({ path: path.join(out, 'completed-' + width + '.png'), fullPage: true }); await page.close();
    }
    console.log('PO_FACTORY_UNPRODUCED_BROWSER_PASS ' + checks + ' live_business_writes=0');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
