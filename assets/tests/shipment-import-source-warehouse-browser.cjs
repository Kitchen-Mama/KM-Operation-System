'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createShipmentImportWorld } = require('./helpers/shipment-import-source-world.cjs');
const { root, read } = require('./helpers/order-mainline-world.cjs');
const runtime = process.env.KM_NODE_MODULES || 'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1119-907-0_26.1119.907.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const { chromium } = require(require.resolve('playwright', { paths: [runtime] }));
const ExcelJS = require('../vendor/exceljs-4.4.0.min.js');
const out = path.join(root, 'output/shipment-import-source-warehouse-20261123/browser');
let checks = 0;
function check(label, value) { assert(value, label); checks++; console.log('PASS ' + label); }
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [1440, 390]) {
      const h = createShipmentImportWorld(), validations = [], errors = [], network = [];
      const page = await browser.newPage({ viewport: { width, height: 900 }, acceptDownloads: true });
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/*', r => { network.push(r.request().url()); return r.abort(); });
      await page.setContent('<!doctype html><main style="font:14px Arial"><div id="shActionsList" hidden></div></main>');
      await page.exposeFunction('sourceTemplate', body => h.c.handleImportTemplateGet_(body));
      await page.exposeFunction('sourceValidate', body => { const r = h.c.handleImportValidate_(body); validations.push({ body, r }); return r; });
      for (const file of ['assets/vendor/exceljs-4.4.0.min.js', 'assets/js/utils/template-export.js', 'assets/js/utils/import-batch.js', 'assets/js/pages/shipping-history.js']) {
        await page.addScriptTag({ content: read(file) });
      }
      await page.evaluate(() => { KM.DB = { importTemplateGet: sourceTemplate, importValidate: sourceValidate }; shRunAction('import'); });
      await page.locator('#km-imb-scope-company').selectOption('ResUS');
      await page.locator('#km-imb-workflow-0').click();
      const downloaded = page.waitForEvent('download'); await page.locator('#km-imb-download').click();
      const file = path.join(out, 'shipment-source-' + width + '.xlsx'); await (await downloaded).saveAs(file);
      const wb = new ExcelJS.Workbook(); await wb.xlsx.load(fs.readFileSync(file));
      const t = h.template(), head = wb.getWorksheet('Header');
      let sourceCol = 0;
      head.getRow(2).eachCell((cell, col) => { if (cell.value === '\u51fa\u8ca8\u5009') sourceCol = col; });
      check(width + ' actual downloaded XLSX uses source warehouse label', sourceCol > 0);
      const dv = head.getCell(3, sourceCol).dataValidation;
      let choices = (dv.formulae || []).join(' ');
      if (!choices.includes('RESUS-3PL')) {
        const lists = wb.getWorksheet('_LISTS');
        if (lists) lists.eachRow(row => row.eachCell(cell => { choices += ' ' + String(cell.value || ''); }));
      }
      check(width + ' XLSX source dropdown contains factory and own overseas warehouse', choices.includes('FACTORY') && choices.includes('RESUS-3PL'));
      check(width + ' XLSX source dropdown excludes another company and inactive/unsupported warehouses', !['KM-3PL', 'RESUS-3PL-OFF', 'FACTORY-OFF', 'RESUS-FBA', 'RESUS-RETURN'].some(id => choices.includes(id)));
      const b = h.body();
      for (const s of t.sheets) {
        const ws = wb.getWorksheet(s.name), values = b.sheets[s.name][0];
        const headerRow = [1, 2, 3, 4, 5].find(r => ws.getRow(r).values.includes(s.columns[0].header));
        assert(headerRow, s.name + ' header');
        const headers = {};
        ws.getRow(headerRow).eachCell((cell, col) => { headers[String(cell.value)] = col; });
        s.columns.forEach(col => { const at = headers[col.header] || headers[col.key]; assert(at, col.key); ws.getCell(headerRow + 1, at).value = values[col.key] ?? null; });
      }
      head.getCell(2, sourceCol).value = '\u51fa\u8ca8\u5de5\u5ee0\u5009';
      const legacy = await wb.xlsx.writeBuffer();
      await page.locator('#km-imb-file').setInputFiles({ name: 'legacy-source-header.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(legacy) });
      await page.waitForFunction(() => !document.querySelector('#km-imb-validate').disabled);
      await page.locator('#km-imb-validate').click();
      await page.waitForFunction(() => !document.querySelector('#km-imb-validate').disabled);
      assert.equal(validations[0]?.r.valid, true, JSON.stringify(validations));
      check(width + ' actual old-header XLSX parses source id and passes real server validation', validations.length === 1 && validations[0].r.valid === true && validations[0].body.sheets.Header[0].source_warehouse_id === 'RESUS-3PL');
      head.getCell(3, sourceCol).value = 'KM-3PL'; const bad = await wb.xlsx.writeBuffer();
      await page.locator('#km-imb-file').setInputFiles({ name: 'wrong-company-source.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(bad) });
      await page.waitForFunction(() => !document.querySelector('#km-imb-validate').disabled);
      await page.locator('#km-imb-validate').click(); await page.waitForFunction(() => !document.querySelector('#km-imb-validate').disabled);
      check(width + ' pasted cross-company source is refused after actual XLSX upload', validations[1]?.r.valid === false && validations[1].r.issues.some(i => i.code === 'SHIPMENT_SOURCE_COMPANY_MISMATCH'));
      check(width + ' template/upload/preview do not create shipments or receipts', h.rows('shipments').length === 0 && h.rows('import_batches').length === 0);
      check(width + ' modal has no viewport overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      check(width + ' no browser exceptions or real network', errors.length === 0 && network.length === 0);
      await page.screenshot({ path: path.join(out, 'shipment-import-' + width + '.png'), fullPage: true });
      await page.close();
    }
    console.log('SHIPMENT_SOURCE_BROWSER_PASS ' + checks + ' live_business_writes=0');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
