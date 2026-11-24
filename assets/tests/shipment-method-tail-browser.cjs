'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTokenWorld } = require('./helpers/shipment-method-tail-world.cjs');
const { root, read } = require('./helpers/order-mainline-world.cjs');
const runtime = process.env.KM_NODE_MODULES || 'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const { chromium } = require(require.resolve('playwright', { paths: [runtime] }));
const ExcelJS = require('../vendor/exceljs-4.4.0.min.js');
const out = path.join(root, 'output/shipment-method-tail-20261124/browser');
let checks = 0;
function check(label, value) { assert(value, label); checks++; console.log('PASS ' + label); }
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [1440, 390]) {
      const h = createTokenWorld('DE'), validations = [], errors = [], network = [];
      h.sheet('carrier_rate_cards', ['carrier_id', 'shipping_method', 'last_mile_delivery']);
      h.sheet('carrier_lead_times', ['carrier_id', 'shipping_method', 'last_mile_delivery']);
      const routes = h.tables.shipment_route_templates;
      routes.grid.splice(2);
      h.put('shipment_route_templates', 'route_template_id', 'ROUTE-0', 'last_mile_delivery', 'parcel');
      const page = await browser.newPage({ viewport: { width, height: 900 }, acceptDownloads: true });
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/*', r => { network.push(r.request().url()); return r.abort(); });
      await page.setContent('<!doctype html><main style="font:14px Arial"><div id="shActionsList" hidden></div></main>');
      await page.exposeFunction('tokenTemplate', body => h.c.handleImportTemplateGet_(body));
      await page.exposeFunction('tokenValidate', body => { const r = h.c.handleImportValidate_(body); validations.push({ body, r }); return r; });
      for (const file of ['assets/vendor/exceljs-4.4.0.min.js', 'assets/js/utils/template-export.js', 'assets/js/utils/import-batch.js', 'assets/js/pages/shipping-history.js']) await page.addScriptTag({ content: read(file) });
      await page.evaluate(() => { KM.DB = { importTemplateGet: tokenTemplate, importValidate: tokenValidate }; shRunAction('import'); });
      await page.locator('#km-imb-scope-company').selectOption('ResUS');
      await page.locator('#km-imb-workflow-0').click();
      const downloaded = page.waitForEvent('download'); await page.locator('#km-imb-download').click();
      const file = path.join(out, 'shipment-method-tail-' + width + '.xlsx'); await (await downloaded).saveAs(file);
      const wb = new ExcelJS.Workbook(); await wb.xlsx.load(fs.readFileSync(file));
      const t = h.template(), b = h.body('FACTORY', { last_mile_delivery: 'parcel' });
      const cells = {};
      for (const s of t.sheets) {
        const ws = wb.getWorksheet(s.name), values = b.sheets[s.name][0];
        const hr = [1, 2, 3, 4].find(r => ws.getRow(r).values.includes(s.columns[0].header));
        assert(hr); const headers = {};
        ws.getRow(hr).eachCell((cell, col) => { headers[String(cell.value)] = col; });
        s.columns.forEach(col => {
          const cell = ws.getCell(hr + 1, headers[col.header]); cell.value = values[col.key] ?? null;
          if (s.name === 'Header') cells[col.key] = cell;
        });
      }
      check(width + ' downloaded method dropdown contains tokens, not labels', /air/.test(JSON.stringify(cells.shipping_method.dataValidation)) && !/Fixture truck service/.test(JSON.stringify(cells.shipping_method.dataValidation)));
      check(width + ' independent method and Last mile are editable', cells.shipping_method.protection.locked === false && cells.last_mile_delivery.protection.locked === false);
      const upload = async name => {
        await page.locator('#km-imb-file').setInputFiles({ name, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(await wb.xlsx.writeBuffer()) });
        await page.waitForFunction(() => !document.querySelector('#km-imb-validate').disabled);
        await page.locator('#km-imb-validate').click();
        await page.waitForFunction(() => !document.querySelector('#km-imb-validate').disabled);
        return validations.at(-1);
      };
      let v = await upload('de-truck-parcel.xlsx');
      check(width + ' actual new XLSX metadata enforces direct tokens', JSON.parse(v.body.file_meta.scope).service_input === 'METHOD_LAST_MILE_V1');
      check(width + ' DE truck + parcel matches a template without rates or lead times', v.r.valid === true && v.r.preview.rows.some(r => r.route?.candidates?.some(c => c.route_template_id === 'ROUTE-0')));
      check(width + ' quote remains unavailable without blocking route', v.r.preview.rows.some(r => r.quote_status === 'QUOTE_UNAVAILABLE' && r.last_mile_delivery === 'parcel'));
      await page.locator('#km-imb-confirm').check();
      check(width + ' valid token import enables Apply after review', await page.locator('#km-imb-apply').isEnabled());
      await page.screenshot({ path: path.join(out, 'de-token-valid-' + width + '.png'), fullPage: true });
      cells.last_mile_delivery.value = null;
      v = await upload('tail-missing.xlsx');
      check(width + ' missing Last mile is rejected in actual XLSX upload', v.r.valid === false && v.r.issues.some(i => i.field === 'last_mile_delivery' && i.code === 'REQUIRED'));
      cells.last_mile_delivery.value = 'parcel'; cells.shipping_method.value = 'Fixture truck service';
      v = await upload('label-refused.xlsx');
      check(width + ' label is rejected instead of silently deriving a different tail', v.r.valid === false && v.r.issues.some(i => i.code === 'SHIPPING_SERVICE_TOKENS_REQUIRED'));
      check(width + ' invalid input keeps Apply disabled and writes no shipments', await page.locator('#km-imb-apply').isDisabled() && h.rows('shipments').length === 0);
      check(width + ' viewport fits without browser errors or real network', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1) && errors.length === 0 && network.length === 0);
      await page.close();
    }
    console.log('SHIPMENT_METHOD_TAIL_BROWSER_PASS ' + checks + ' live_business_writes=0');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
