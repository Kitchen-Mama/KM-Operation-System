'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { world, root, plain } = require('./helpers/po-factory-unproduced-world.cjs');
const { openHarness, mount } = require('./order-mainline-browser-c1.cjs');
const runtime = process.env.KM_NODE_MODULES;
const { chromium } = require(require.resolve('playwright', { paths: runtime ? [runtime] : undefined }));
const out = path.join(root, 'output/po-production-orderdate-20261127');
let checks = 0;
const check = (name, ok) => { assert(ok, name); checks++; console.log('PASS ' + name); };

function fixture() {
  const h = world();
  const cases = [
    ['ZZ-LATE', '2026-11-22'], ['ZZ-OLD', '2026-09-14'],
    ['AA-TIE', '2026-11-22'], ['BB-MID', '2026-10-27'], ['AA-UNDATED', '2026-11-22']
  ];
  for (let i = 1; i <= 26; i++) cases.push(['MID-' + String(i).padStart(2, '0'), '2026-10-' + String(i).padStart(2, '0')]);
  const body = h.body({}, 'PO-ORDERDATE-FIXTURE');
  body.sheets.StockPO = cases.map(([po_no, order_date], i) => ({
    ...body.sheets.StockPO[0], __row: i + 3, po_no, order_date,
    quantity: 0, unproduced_qty: 1000, ordered_qty: 1000
  }));
  h.commit(body);
  const headers = h.rows('purchase_orders');
  const undated = headers.find(o => o.po_no === 'AA-UNDATED');
  const grid = h.tables.purchase_orders.grid, names = grid[0];
  const row = grid.find(r => r[names.indexOf('purchase_order_id')] === undated.purchase_order_id);
  row[names.indexOf('order_date')] = '';
  row[names.indexOf('created_at')] = '2020-01-01 00:00:00';
  const mid = grid.find(r => r[names.indexOf('po_no')] === 'BB-MID');
  mid[names.indexOf('order_status')] = 'in_production';
  const expected = ['ZZ-OLD', ...Array.from({ length: 26 }, (_, i) => 'MID-' + String(i + 1).padStart(2, '0')), 'BB-MID', 'AA-TIE', 'ZZ-LATE', 'AA-UNDATED'];
  const original = h.dispatch;
  h.dispatch = body => {
    if (body.action === 'updatePurchaseOrderHeader') {
      h.calls.push(plain(body));
      return plain(h.c.handleUpdatePurchaseOrderHeader_(body));
    }
    return original(body);
  };
  return { h, expected };
}

async function scenario(browser, width) {
  const { h, expected } = fixture();
  const { page, errors, outbound, dialogs } = await openHarness(browser, width, h);
  const prefix = width + ' ';
  const tables = ['purchase_orders', 'purchase_order_lines', 'factory_stock', 'factory_stock_movements'];
  const snapshot = () => JSON.stringify(tables.map(n => h.tables[n].grid));
  const before = snapshot();
  try {
    check(prefix + 'zero-receipt import has 31 real PO headers and no physical stock or movements', h.rows('purchase_orders').length === 31 && h.rows('factory_stock').length === 0 && h.rows('factory_stock_movements').length === 0);
    await mount(page, 'purchase-order-overview', 'initPurchaseOrderOverviewPage');
    await page.locator('#po-groups .po-card').first().waitFor();
    const workspaceNos = () => page.locator('#po-groups .po-card .po-no').allTextContents();
    check(prefix + 'Workspace first page is the 25 earliest Order Dates', JSON.stringify(await workspaceNos()) === JSON.stringify(expected.slice(0, 25)));
    await page.getByRole('button', { name: 'Next', exact: false }).click();
    check(prefix + 'Workspace second page preserves date order across status, ties use PO number, undated is last', JSON.stringify(await workspaceNos()) === JSON.stringify(expected.slice(25)));
    const undatedId = h.rows('purchase_orders').find(o => o.po_no === 'AA-UNDATED').purchase_order_id;
    check(prefix + 'missing Order Date is not replaced with created_at', !(await page.locator('[id="po-card-' + undatedId + '"]').innerText()).includes('2020-01-01'));
    check(prefix + 'sorting and rendering perform zero business writes', snapshot() === before);
    await page.screenshot({ path: path.join(out, 'workspace-' + width + '.png'), fullPage: true });

    const id = h.rows('purchase_orders').find(o => o.po_no === 'ZZ-LATE').purchase_order_id;
    const card = page.locator('[id="po-card-' + id + '"]');
    await card.getByRole('button', { name: 'Update', exact: true }).click();
    await page.locator('#po-modal').waitFor();
    check(prefix + 'imported issued PO opens the existing Update editor without required dates', await page.locator('.po-edit[data-f="inspection_date"]').isEditable() && await page.locator('.po-edit[data-f="expected_completion_date"]').isEditable());
    await page.locator('.po-edit[data-f="inspection_date"]').fill('2026-12-01');
    await page.locator('.po-edit[data-f="expected_completion_date"]').fill('2026-12-04');
    await page.locator('.po-edit[data-f="expected_ship_date"]').fill('2026-12-05');
    await page.locator('.po-edit[data-f="note"]').fill('Synthetic imported PO timeline');
    check(prefix + 'edit dialog fits the viewport', await page.locator('#po-modal .pc-modal').evaluate(el => el.getBoundingClientRect().width <= innerWidth));
    await page.screenshot({ path: path.join(out, 'edit-' + width + '.png'), fullPage: true });
    await page.locator('#po-modal').getByRole('button', { name: 'Save', exact: true }).click();
    await page.locator('#po-modal').waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.body.textContent.includes('Synthetic imported PO timeline'));
    const saved = h.rows('purchase_orders').find(o => o.purchase_order_id === id);
    check(prefix + 'real header handler persists the three timeline dates and note', saved.inspection_date === '2026-12-01' && saved.expected_completion_date === '2026-12-04' && saved.expected_ship_date === '2026-12-05' && saved.note === 'Synthetic imported PO timeline');
    check(prefix + 'editing never changes the canonical issued status or creates stock', saved.order_status === 'issued' && h.rows('factory_stock').length === 0 && h.rows('factory_stock_movements').length === 0 && h.rows('purchase_order_lines').every(l => l.completed_qty === 0));
    check(prefix + 'existing edit sends exactly one header update', h.calls.filter(c => c.action === 'updatePurchaseOrderHeader').length === 1);
    check(prefix + 'Workspace order is unchanged after bounded readback', JSON.stringify(await workspaceNos()) === JSON.stringify(expected.slice(25)));

    await mount(page, 'purchase-order-list', 'initPurchaseOrderListPage');
    await page.locator('#pol-tbody .pol-po-link').first().waitFor();
    const overviewNos = () => page.locator('#pol-tbody .pol-po-link').allTextContents();
    check(prefix + 'Overview also starts with the 25 earliest Order Dates, not import creation time', JSON.stringify(await overviewNos()) === JSON.stringify(expected.slice(0, 25)));
    check(prefix + 'issued badges say In Production without altering raw status', (await page.locator('#pol-tbody .procurement-badge--issued').allTextContents()).every(t => t === 'In Production'));
    await page.getByRole('button', { name: 'Next', exact: false }).click();
    check(prefix + 'Overview pagination, same-date ordering and blank-last match Workspace', JSON.stringify(await overviewNos()) === JSON.stringify(expected.slice(25)));
    check(prefix + 'browser has no error, failure alert or outbound request', errors.length === 0 && outbound.length === 0 && dialogs.length === 0);
    check(prefix + 'Overview fits the viewport', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(out, 'overview-' + width + '.png'), fullPage: true });
  } finally { await page.close(); }
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try { for (const width of [1440, 390]) await scenario(browser, width); }
  finally { await browser.close(); }
  console.log('PO_PRODUCTION_ORDERDATE_BROWSER_PASS ' + checks + ' outbound=0 native_sheets=NOT_RUN');
})().catch(e => { console.error(e); process.exitCode = 1; });
