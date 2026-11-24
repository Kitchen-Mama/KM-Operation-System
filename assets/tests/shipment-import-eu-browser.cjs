'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createEuWorld } = require('./helpers/shipment-import-eu-world.cjs');
const { root, read } = require('./helpers/order-mainline-world.cjs');
const runtime = process.env.KM_NODE_MODULES || 'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1119-907-0_26.1119.907.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const { chromium } = require(require.resolve('playwright', { paths: [runtime] }));
const ExcelJS = require('../vendor/exceljs-4.4.0.min.js');
const out = path.join(root, 'output/shipment-import-eu-20261124/browser');
let checks = 0;
function check(label, value) { assert(value, label); checks++; console.log('PASS ' + label); }
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [1440, 390]) {
      const h = createEuWorld(), validations = [], errors = [], network = [];
      const page = await browser.newPage({ viewport: { width, height: 900 }, acceptDownloads: true });
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/*', r => { network.push(r.request().url()); return r.abort(); });
      await page.setContent('<!doctype html><main style="font:14px Arial"><div id="shActionsList" hidden></div></main>');
      await page.exposeFunction('euTemplate', body => h.c.handleImportTemplateGet_(body));
      await page.exposeFunction('euValidate', body => { const r = h.c.handleImportValidate_(body); validations.push({ body, r }); return r; });
      for (const file of ['assets/vendor/exceljs-4.4.0.min.js', 'assets/js/utils/template-export.js', 'assets/js/utils/import-batch.js', 'assets/js/pages/shipping-history.js']) await page.addScriptTag({ content: read(file) });
      await page.evaluate(() => { KM.DB = { importTemplateGet: euTemplate, importValidate: euValidate }; shRunAction('import'); });
      await page.locator('#km-imb-scope-company').selectOption('ResUS');
      await page.locator('#km-imb-workflow-0').click();
      const downloaded = page.waitForEvent('download'); await page.locator('#km-imb-download').click();
      const file = path.join(out, 'shipment-eu-' + width + '.xlsx'); await (await downloaded).saveAs(file);
      const wb = new ExcelJS.Workbook(); await wb.xlsx.load(fs.readFileSync(file));
      const t = h.template(), b = h.body();
      for (const s of t.sheets) {
        const ws = wb.getWorksheet(s.name), values = b.sheets[s.name][0];
        const headerRow = [1, 2, 3, 4, 5].find(r => ws.getRow(r).values.includes(s.columns[0].header));
        assert(headerRow); const headers = {};
        ws.getRow(headerRow).eachCell((cell, col) => { headers[String(cell.value)] = col; });
        s.columns.forEach(col => { const at = headers[col.header] || headers[col.key]; assert(at); ws.getCell(headerRow + 1, at).value = values[col.key] ?? null; });
      }
      const upload = async name => {
        const buffer = Buffer.from(await wb.xlsx.writeBuffer());
        await page.locator('#km-imb-file').setInputFiles({ name, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer });
        await page.waitForFunction(() => !document.querySelector('#km-imb-validate').disabled);
        await page.locator('#km-imb-validate').click();
        await page.waitForFunction(() => !document.querySelector('#km-imb-validate').disabled);
      };
      await upload('eu-pl.xlsx');
      check(width + ' actual XLSX EU -> PL upload passes real GS validation', validations[0]?.r.valid === true);
      check(width + ' parser preserves EU business scope', validations[0].body.sheets.Header[0].country === 'EU');
      check(width + ' real route preview lists PL template', validations[0].r.preview.rows.some(r => r.route?.candidates?.some(c => c.route_template_id === 'ROUTE-0')));
      await page.locator('#km-imb-confirm').check();
      check(width + ' reviewed valid EU -> PL enables Apply', await page.locator('#km-imb-apply').isEnabled());
      await page.screenshot({ path: path.join(out, 'eu-pl-valid-' + width + '.png'), fullPage: true });
      h.put('warehouses', 'warehouse_id', 'RESUS-FBA', 'country', 'US');
      await upload('eu-us-refused.xlsx');
      check(width + ' non-member destination remains blocked in actual upload', validations[1]?.r.valid === false && validations[1].r.issues.some(i => i.code === 'SHIPMENT_DESTINATION_COUNTRY_MISMATCH'));
      check(width + ' rejected upload disables Apply', await page.locator('#km-imb-apply').isDisabled());
      check(width + ' template/upload/preview leave business tables empty', h.rows('shipments').length === 0 && h.rows('import_batches').length === 0);
      check(width + ' no viewport overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      check(width + ' no browser errors or real network', errors.length === 0 && network.length === 0);
      await page.close();
    }
    console.log('SHIPMENT_EU_BROWSER_PASS ' + checks + ' live_business_writes=0');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
