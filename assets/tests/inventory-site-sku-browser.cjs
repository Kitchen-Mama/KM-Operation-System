const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const runtime = process.env.KM_NODE_MODULES || 'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1119-907-0_26.1119.907.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const { chromium } = require(require.resolve('playwright', { paths: [runtime] }));
const ExcelJS = require('../vendor/exceljs-4.4.0.min.js');
(async () => {
  const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('StockPO');
  sheet.addRow(['sku', 'quantity']); sheet.addRow(['CO1150-N-TG', 20]); sheet.addRow(['UNKNOWN-<tag>', 20]);
  const buffer = Buffer.from(await book.xlsx.writeBuffer());
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const output = 'output/inventory-site-sku-20261123'; fs.mkdirSync(output, { recursive: true });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [], requests = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/*', r => { requests.push(r.request().url()); return r.abort(); });
      await page.setContent('<!DOCTYPE html><html><head></head><body></body></html>');
      await page.addStyleTag({ content: fs.readFileSync('assets/css/base.css', 'utf8') });
      await page.addScriptTag({ content: fs.readFileSync('assets/vendor/exceljs-4.4.0.min.js', 'utf8') });
      await page.addScriptTag({ content: fs.readFileSync('assets/js/utils/import-batch.js', 'utf8') });
      await page.evaluate(() => {
        window.validations = [];
        window.KM.DB = {
          importTemplateGet: async () => ({ success: true, schema_version: 'FIXTURE', sheets: [{ name: 'StockPO', columns: [{ key: 'sku' }, { key: 'quantity' }] }] }),
          importValidate: async b => {
            window.validations.push(b);
            return { success: true, valid: true, import_batch_id: b.import_batch_id, preview_digest: 'SYNTHETIC',
              preview: { counts: { create: 1, update: 0, skipped: 1, reject: 0 }, rows: [{ sku: 'CO1150-N-TG', action: 'create' }],
                skipped: { rows: [{ row: 3, sku: 'UNKNOWN-<tag>' }] } } };
          },
          importCommit: async () => { throw Error('Browser verification must never commit'); }
        };
        window.KM.importBatch.open({ domain: 'po_factory_stock', title: 'Import PO and Factory Stock',
          combinedWorkflowButtons: true, modes: [{ value: 'NEW_RECEIPT', label: 'New receipt' }],
          scope: () => ({ warehouse_id: 'FACTORY-A' }), batchId: () => 'SYNTHETIC-BATCH-001' });
      });
      await page.locator('#km-imb-workflow-0').click();
      await page.locator('#km-imb-file').setInputFiles({ name: 'site-sku.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer });
      await page.waitForFunction(() => !document.getElementById('km-imb-validate').disabled);
      await page.locator('#km-imb-validate').click();
      await page.locator('#km-imb-preview summary').filter({ hasText: 'Skipped SKUs: 1' }).waitFor();
      await page.locator('#km-imb-preview summary').filter({ hasText: 'Skipped SKUs: 1' }).click();
      assert((await page.locator('#km-imb-preview').innerText()).includes('UNKNOWN-<tag>'));
      assert.equal(await page.locator('#km-imb-preview tag').count(), 0);
      assert.equal(await page.evaluate(() => validations[0].sheets.StockPO[0].sku), 'CO1150-N-TG');
      assert.equal(await page.locator('#km-imb-apply').isDisabled(), true);
      const fits = await page.locator('#km-imb-modal').evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && el.scrollWidth <= el.clientWidth + 1; });
      assert(fits, 'import dialog fits viewport');
      await page.screenshot({ path: path.join(output, 'preview-' + width + '.png'), fullPage: true });
      assert.deepEqual(errors, []); assert.deepEqual(requests, []);
      console.log('PASS ' + width + ': real XLSX parse, SKU identity, escaped skip list, review gate, no network/commits');
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
