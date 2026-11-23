'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { root, read, createWorld } = require('./helpers/order-mainline-world.cjs');
const { createPlanningWorld } = require('./helpers/order-planning-mainline-world.cjs');
const runtime = process.env.KM_NODE_MODULES || 'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1119-907-0_26.1119.907.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const { chromium } = require(require.resolve('playwright', { paths: [runtime] }));
const { openHarness, mount } = require('./order-mainline-browser-c1.cjs');
const output = path.resolve(root, process.env.KM_BROWSER_OUTPUT || 'output/order-mainline-c2-20261123');
let checks = 0;
function check(name, value) { assert(value, name); checks++; console.log('PASS ' + name); }

async function scenario(browser, width) {
  const h = createPlanningWorld(); h.generate();
  const { page, errors, outbound, dialogs } = await openHarness(browser, width, h);
  try {
    await page.evaluate(() => {
      window.fetch = async (url, init) => {
        const params = new URL(url).searchParams;
        const body = init.body ? JSON.parse(init.body) : JSON.parse(params.get('km_body') || '{}');
        return new Response(JSON.stringify(await fixtureDispatch(body)), { status: 200, headers: { 'Content-Type': 'application/json' } });
      };
    });
    await page.clock.setFixedTime(new Date('2026-11-23T10:00:00+08:00'));
    await page.addScriptTag({ content: read('assets/js/pages/request-order.js') });
    await page.evaluate(html => { document.body.innerHTML = '<main>' + html + '</main>'; }, read('assets/html/pages/request-order.html'));
    await page.evaluate(async () => {
      KM.api.requestOrderSiteConfirmRequired = () => false;
      _roL2Ready = true;
      requestOrderState.data = [{ sku: 'SKU-A', company: 'KM', country: 'US', marketplace: 'Amazon', series: 'SERIES-A', boxSize: 10 }];
      await _roLoadCanonicalDraftsForScope_({ company: 'KM', country: 'US', marketplace: 'Amazon' });
      if (_roSendOrderQty_(requestOrderState.data[0], 0, 'T1', {}) !== 40) throw new Error('Canonical hydration must expose the persisted 40 units');
      document.getElementById('ro-request-type').value = 't1';
    });
    const before = h.writes();
    await page.locator('#ro-send-request-btn').click();
    await page.waitForFunction(() => document.getElementById('ro-send-request-btn').classList.contains('is-success'));
    check(width + ' actual Send controller -> transport -> R64 -> real RO/flat writers', h.rows('request_orders').length === 1 && h.writes() > before && h.rows('request_order_allocation_drafts')[0].t1_status === 'submitted');
    check(width + ' Send has preview then execute; no fabricated commercial data', h.calls.filter(c => c.action === 'sendRequestOrderOrchestration').length === 2 && h.rows('request_order_lines')[0].unit_cost === '');
    const roId = h.rows('request_orders')[0].request_order_id;
    await mount(page, 'request-order-draft', 'initRequestOrderDraftPage');
    const ro = page.locator('[id="ro-card-' + roId + '"]'); await ro.waitFor();
    await ro.getByRole('button', { name: 'Submit', exact: true }).click();
    await ro.getByRole('button', { name: 'Approve', exact: true }).click();
    await ro.getByRole('button', { name: /Convert/ }).click();
    await page.locator('#ro-po-setup').waitFor();
    check(width + ' unpriced Request opens explicit purchase setup', await page.locator('#ro-po-confirm').isDisabled());
    await page.locator('#ro-po-supplier').selectOption({ label: 'Fixture Supplier' });
    let at = h.writes();
    await page.locator('#ro-po-check').click();
    await page.locator('#ro-po-confirm').waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.getElementById('ro-po-confirm').disabled);
    check(width + ' quote review renders supplier SKU, price and amount without writes', h.writes() === at && (await page.locator('#ro-po-quote').textContent()).includes('USD 2.5') && (await page.locator('#ro-po-quote').textContent()).includes('USD 100'));
    check(width + ' setup controls fit the viewport', await page.locator('#ro-po-setup select').evaluateAll(elements => elements.every(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })));
    await page.screenshot({ path: path.join(output, 'purchase-setup-' + width + '.png'), fullPage: true });
    // A price edit between review and confirmation must leave the approved Request intact.
    h.put('supplier_price_list', 'supplier_price_id', 'QUOTE-A', 'unit_cost', 3);
    at = h.writes();
    await page.locator('#ro-po-confirm').click();
    await page.getByRole('alert').filter({ hasText: 'PO_PURCHASE_SETUP_CHANGED_REVIEW_REQUIRED' }).waitFor();
    check(width + ' changed quote refuses conversion with zero business writes', h.writes() === at && h.rows('purchase_orders').length === 0 && await page.locator('#ro-po-confirm').isDisabled());
    await page.locator('#ro-po-check').click();
    await page.waitForFunction(() => !document.getElementById('ro-po-confirm').disabled);
    await page.locator('#ro-po-confirm').evaluate(btn => { btn.click(); btn.click(); });
    await page.locator('#ro-po-setup').waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.body.textContent.includes('Converted to PO'));
    check(width + ' confirmed double-click creates one priced PO', h.rows('purchase_orders').length === 1 && h.rows('purchase_order_lines')[0].unit_cost === 3);
    const poId = h.rows('purchase_orders')[0].purchase_order_id;
    await mount(page, 'purchase-order-overview', 'initPurchaseOrderOverviewPage');
    const po = page.locator('[id="po-card-' + poId + '"]'); await po.waitFor(); await po.locator('.sp-btn-expand').click();
    await po.getByRole('button', { name: 'Save', exact: true }).click();
    for (const [field, value] of Object.entries({ inspection_date: '2026-12-01', expected_completion_date: '2026-12-04', expected_ship_date: '2026-12-06' })) {
      await page.locator('.po-edit[data-f="' + field + '"]').fill(value);
    }
    await page.locator('#po-modal').getByRole('button', { name: 'Save', exact: true }).click();
    await page.locator('#po-modal').waitFor({ state: 'detached' });
    await po.getByRole('button', { name: 'Send PO', exact: true }).click();
    await po.getByRole('button', { name: 'Receive', exact: true }).waitFor();
    check(width + ' Send PO generates current document before production', h.files.length === 1 && h.files[0].matrix[1][1] === '3' && h.files[0].matrix[1][2] === '120' && h.rows('purchase_orders')[0].order_status === 'issued');
    await po.locator('.sp-btn-expand').click();
    check(width + ' Workspace exposes generated download', await po.getByRole('link', { name: 'Download', exact: true }).getAttribute('href') === 'https://example.invalid/pdf');
    await po.getByRole('button', { name: 'Receive', exact: true }).click();
    await page.locator('.po-rcv-input').fill('15');
    await page.getByRole('button', { name: 'Confirm Receive', exact: true }).click();
    await page.locator('#po-modal').waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.querySelector('[data-status="partial_completed"]'));
    check(width + ' Workspace receipt updates production and stock once', h.rows('factory_stock')[0].fac_current_stock === 15 && h.rows('factory_stock_movements').length === 1);
    await mount(page, 'purchase-order-list', 'initPurchaseOrderListPage');
    await page.locator('#pol-tbody tr').filter({ hasText: 'SKU-A' }).waitFor();
    await page.locator('.pol-gantt-toggle').click();
    const lane = page.locator('.pol-gantt-lane'); await lane.waitFor();
    check(width + ' Overview shows actual schedule and received inventory', /2026-12-04/.test(await lane.getAttribute('title')) && /C15\/S0\/R15/.test(await lane.getAttribute('title')));
    check(width + ' no runtime exceptions or outgoing network', errors.length === 0 && outbound.length === 0);
    check(width + ' no unexpected failure dialogs', !dialogs.some(d => /failed:|無法|非預期|blocked/i.test(d)));
    check(width + ' Overview fits viewport', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(output, 'overview-' + width + '.png'), fullPage: true });
    return { width, errors, outbound, documents: h.files.length, stock: 15 };
  } catch (e) {
    await page.screenshot({ path: path.join(output, 'failure-' + width + '.png'), fullPage: true });
    console.error({ dialogs, errors, calls: h.calls.slice(-4) }); throw e;
  } finally { await page.close(); }
}

async function oldBackendGuards(browser) {
  for (const kind of ['old-workspace', 'old-writer', 'downgraded-after-read']) {
    const h = createWorld(), roId = h.seedRequest();
    h.sheet('supplier_price_list', ['sku', 'supplier_id', 'supplier_name', 'unit_cost', 'currency'], [
      { sku: 'SKU-A', supplier_id: 'SUP-A', supplier_name: 'Fixture Supplier', unit_cost: 2, currency: 'USD' }
    ]);
    h.put('request_order_lines', 'request_order_line_id', h.rows('request_order_lines')[0].request_order_line_id, 'unit_cost', '');
    for (const transition of ['submit', 'approve']) assert.equal(h.dispatch({ action: 'updateRequestOrderStatus', request_order_id: roId, transition }).success, true);
    if (kind === 'old-workspace') vm.runInContext(read('output/dw2-workflow-20261122/release-4/candidate/Production/apps-script/51_api_v1_request_order_workspace.gs'), h.c);
    if (kind === 'old-writer') h.c.PO_PURCHASE_SETUP_CONTRACT_VERSION_ = undefined;
    const { page, errors, outbound, dialogs } = await openHarness(browser, 1440, h);
    try {
      await mount(page, 'request-order-draft', 'initRequestOrderDraftPage');
      const card = page.locator('[id="ro-card-' + roId + '"]'); await card.waitFor();
      const before = h.writes(), postBefore = h.calls.filter(c => c.action === 'createPurchaseOrderFromRequest').length;
      if (kind === 'downgraded-after-read') h.c.PO_PURCHASE_SETUP_CONTRACT_VERSION_ = undefined;
      await card.getByRole('button', { name: /Convert/ }).click();
      if (kind === 'downgraded-after-read') {
        await page.locator('#ro-po-supplier').selectOption({ label: 'Fixture Supplier' });
        await page.locator('#ro-po-check').click();
        await page.getByRole('alert').filter({ hasText: 'PO_PURCHASE_SETUP_BACKEND_UPDATE_REQUIRED' }).waitFor();
      } else {
        check(kind + ' has explicit backend upgrade notice', dialogs.some(d => d.includes('updated Apps Script backend')));
      }
      const error = await page.evaluate(async id => {
        try { await KM.DB.createPurchaseOrderFromRequest({ request_order_id: id, purchase_setup: {}, purchase_setup_preview: true }); return ''; }
        catch (e) { return e.message; }
      }, roId);
      check(kind + ' direct API wrapper also refuses legacy preview', error.includes('PO_PURCHASE_SETUP_BACKEND_UPDATE_REQUIRED'));
      check(kind + ' sends zero conversion POSTs and creates no PO', h.calls.filter(c => c.action === 'createPurchaseOrderFromRequest').length === postBefore && h.writes() === before && h.rows('purchase_orders').length === 0);
      check(kind + ' leaves approved Request intact with no browser/network errors', h.rows('request_orders')[0].request_status === 'approved' && errors.length === 0 && outbound.length === 0);
    } finally { await page.close(); }
  }
  return { legacyBackendPreviewProtection: true };
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const results = [];
    for (const width of [1440, 390]) results.push(await scenario(browser, width));
    results.push(await oldBackendGuards(browser));
    fs.writeFileSync(path.join(output, 'browser-results.json'), JSON.stringify({ checks, liveBusinessWrites: 0, deployments: 0, results }, null, 2) + '\n');
    console.log('ORDER_MAINLINE_C2_BROWSER_PASS ' + checks);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
