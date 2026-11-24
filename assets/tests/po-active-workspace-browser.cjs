'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createWorld, root } = require('./helpers/order-mainline-world.cjs');
const { openHarness, mount } = require('./order-mainline-browser-c1.cjs');
const runtime = process.env.KM_NODE_MODULES || 'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const { chromium } = require(require.resolve('playwright', { paths: [runtime] }));
const out = path.join(root, 'output/shipment-method-tail-20261124/browser');
let checks = 0;
function check(label, value) { assert(value, label); checks++; console.log('PASS ' + label); }
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [1440, 390]) {
      const h = createWorld(), rows = [];
      for (let i = 0; i < 40; i++) rows.push({ purchase_order_id: 'DONE-' + i, po_no: 'DONE-' + i, company: 'KM', order_status: ['completed', 'closure', 'ready_to_ship', 'partial_shipped', 'shipped'][i % 5], order_date: '2026-11-20', warehouse_id: 'FACTORY-A' });
      for (const status of ['draft', 'issued', 'partial_completed']) rows.push({ purchase_order_id: 'ACTIVE-' + status, po_no: 'ACTIVE-' + status, company: 'KM', order_status: status, order_date: '2026-11-20', warehouse_id: 'FACTORY-A' });
      h.sheet('purchase_orders', h.tables.purchase_orders.grid[0], rows);
      const ui = await openHarness(browser, width, h), { page } = ui;
      await mount(page, 'purchase-order-overview', 'initPurchaseOrderOverviewPage');
      await page.locator('[id="po-card-ACTIVE-issued"]').waitFor();
      check(width + ' only draft and unfinished production appear among 43 orders', await page.locator('#po-groups .po-card').count() === 3);
      check(width + ' completed orders do not occupy pages or selectors', !/DONE-/.test(await page.locator('#po-po-select').innerText()) && !/Next/.test(await page.locator('#po-pagination').innerText()));
      check(width + ' no Completed section, active production stays receivable', !/Completed/.test(await page.locator('#po-groups .procurement-group__title').allInnerTexts().then(t => t.join(' '))) && await page.locator('[id="po-card-ACTIVE-issued"]').getByRole('button', { name: 'Receive', exact: true }).isVisible());
      check(width + ' list filtering does not modify persisted order status or counts', h.rows('purchase_orders').length === 43 && h.rows('purchase_orders')[0].order_status === 'completed');
      check(width + ' active workspace fits viewport without runtime or network errors', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1) && ui.errors.length === 0 && ui.outbound.length === 0);
      check(width + ' card summaries and actions do not overlap', await page.locator('#po-groups .po-card').evaluateAll(cards => cards.every(card => {
        const s = card.querySelector('.sp-card-summary').getBoundingClientRect(), a = card.querySelector('.sp-card-actions').getBoundingClientRect();
        return a.top >= s.bottom - 1 || a.left >= s.right - 1;
      })));
      await page.screenshot({ path: path.join(out, 'active-po-' + width + '.png'), fullPage: true });
      await page.close();
    }
    console.log('PO_ACTIVE_WORKSPACE_BROWSER_PASS ' + checks + ' live_business_writes=0');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
