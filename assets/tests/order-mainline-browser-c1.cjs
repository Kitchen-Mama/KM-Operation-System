'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createWorld, root, read } = require('./helpers/order-mainline-world.cjs');
const runtime = process.env.KM_NODE_MODULES || 'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1119-907-0_26.1119.907.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const { chromium } = require(require.resolve('playwright', { paths: [runtime] }));
const output = path.resolve(root, process.env.KM_BROWSER_OUTPUT || 'output/order-mainline-c1-20261123');
let checks = 0;
function check(label, value) { assert(value, label); checks++; console.log('PASS ' + label); }

async function mount(page, name, init) {
  await page.evaluate(html => { document.body.innerHTML = '<main>' + html + '</main>'; }, read('assets/html/pages/' + name + '.html'));
  await page.evaluate(fn => window[fn](), init);
}

async function openHarness(browser, width, h, options = {}) {
  const page = await browser.newPage({ viewport: { width, height: 950 } });
  const errors = [], outbound = [], dialogs = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept(dialog.type() === 'prompt' ? 'Synthetic revision required' : undefined); });
  await page.route('**/*', async route => {
    if (route.request().url() === 'http://127.0.0.1:59999/order-mainline-test') {
      await route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head></head><body></body></html>' });
    } else { outbound.push(route.request().url()); await route.abort(); }
  });
  await page.exposeFunction('fixtureDispatch', body => h.dispatch(body));
  await page.goto('http://127.0.0.1:59999/order-mainline-test');
  for (const file of ['assets/css/components.css', 'assets/css/pages/shipping-plan.css', 'assets/css/pages/procurement.css']) {
    await page.addStyleTag({ content: read(file) });
  }
  await page.addStyleTag({ content: 'body{margin:0;font:14px Arial;color:#222;background:white}main{padding:16px;min-width:0}*{box-sizing:border-box}' });
  await page.evaluate(endpoint => {
    window.KM_PRODUCTION_CONFIG_ = { endpoint };
    window.KM = { api: {
      workspaceApiActive: () => true,
      getWorkspace: (workspace, payload) => fixtureDispatch({ action: 'workspace', workspace, payload })
    } };
    window.fetch = async (_url, init) => new Response(JSON.stringify(await fixtureDispatch(JSON.parse(init.body))),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  }, options.endpoint || 'https://script.google.com/macros/s/SYNTHETIC_ONLY/exec');
  await page.addScriptTag({ content: read('assets/js/api/operation-system-db-api.js') });
  await page.addScriptTag({ content: read('assets/js/utils/multi-select-filter.js') });
  await page.addScriptTag({ content: read('assets/js/pages/shipping-history.js') });
  for (const name of ['request-order-draft', 'purchase-order-overview', 'purchase-order-list']) {
    await page.addScriptTag({ content: read('assets/js/pages/' + name + '.js') });
  }
  return { page, errors, outbound, dialogs };
}

async function scenario(browser, width) {
  const h = createWorld(), roId = h.seedRequest();
  const { page, errors, outbound, dialogs } = await openHarness(browser, width, h);
  try {
    await mount(page, 'request-order-draft', 'initRequestOrderDraftPage');
    const ro = page.locator('[id="ro-card-' + roId + '"]');
    await ro.waitFor();
    await ro.locator('.sp-btn-expand').click();
    await ro.locator('.ro-appr-input').fill('30');
    const qty = ro.locator('.ro-co-input[data-company="KM"]');
    await qty.fill('30'); await qty.dispatchEvent('input');
    await ro.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.ro-co-input[data-company="KM"]')?.value === '30');
    check(width + ' Draft edit persisted through actual browser/API/GAS', h.rows('request_order_lines')[0].approved_qty === 30);
    await ro.getByRole('button', { name: 'Submit', exact: true }).click();
    await ro.getByRole('button', { name: 'Reject', exact: true }).waitFor();
    check(width + ' Submit advances to Pending Approval', h.rows('request_orders')[0].request_status === 'pending_approval');
    await ro.getByRole('button', { name: 'Reject', exact: true }).click();
    await ro.getByRole('button', { name: 'Submit', exact: true }).waitFor();
    check(width + ' Reject restores editable Draft with reason', h.rows('request_orders')[0].request_status === 'draft' &&
      h.rows('request_orders')[0].rejected_reason === 'Synthetic revision required');
    await ro.getByRole('button', { name: 'Submit', exact: true }).click();
    await ro.getByRole('button', { name: 'Approve', exact: true }).click();
    await ro.getByRole('button', { name: /Convert/ }).waitFor();
    check(width + ' Resubmit and Approve retain version 2', h.rows('request_orders')[0].request_order_version === 2 && h.rows('request_orders')[0].request_status === 'approved');
    await ro.getByRole('button', { name: /Convert/ }).click();
    await page.waitForFunction(() => document.body.textContent.includes('Converted to PO'));
    check(width + ' Conversion creates one positive PO line, not zero-company stock', h.rows('purchase_orders').length === 1 &&
      h.rows('purchase_order_lines').length === 1 && h.rows('purchase_order_lines')[0].ordered_qty === 30);
    const poId = h.rows('purchase_orders')[0].purchase_order_id;
    await mount(page, 'purchase-order-overview', 'initPurchaseOrderOverviewPage');
    const po = page.locator('[id="po-card-' + poId + '"]'); await po.waitFor();
    await po.locator('.sp-btn-expand').click();
    await po.getByRole('button', { name: 'Save', exact: true }).click();
    await page.locator('.po-edit[data-f="expected_completion_date"]').fill('2026-12-04');
    await page.locator('.po-edit[data-f="note"]').fill('Synthetic factory update');
    await page.locator('#po-modal').getByRole('button', { name: 'Save', exact: true }).click();
    await page.locator('#po-modal').waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.body.textContent.includes('Synthetic factory update'));
    check(width + ' PO Save uses scoped readback and preserves Draft', h.rows('purchase_orders')[0].expected_completion_date === '2026-12-04' && h.rows('purchase_orders')[0].order_status === 'draft');
    await po.getByRole('button', { name: 'Send PO', exact: true }).click();
    await po.getByRole('button', { name: 'Receive', exact: true }).waitFor();
    check(width + ' Send PO generates document before In Production', h.rows('purchase_orders')[0].order_status === 'issued' && h.files.length === 1 && h.rows('generated_documents')[0].pdf_file_id === 'FIXTURE_PDF');
    check(width + ' Rendered document contains approved quantity/canonical cost', h.files[0].matrix[1][1] === '2' && h.files[0].matrix[1][2] === '60');
    await po.locator('.sp-btn-expand').click();
    check(width + ' PO document panel exposes the registered download artifact', (await po.getByRole('link', { name: 'Download', exact: true }).getAttribute('href')) === 'https://example.invalid/pdf');
    check(width + ' Issuing PO does not receive stock', h.rows('factory_stock').length === 0);
    await po.getByRole('button', { name: 'Update', exact: true }).click();
    await page.locator('.po-edit[data-f="note"]').fill('Synthetic production update');
    await page.locator('#po-modal').getByRole('button', { name: 'Save', exact: true }).click();
    await page.locator('#po-modal').waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.body.textContent.includes('Synthetic production update'));
    check(width + ' Production Update does not reset issued state', h.rows('purchase_orders')[0].note === 'Synthetic production update' && h.rows('purchase_orders')[0].order_status === 'issued');
    await po.getByRole('button', { name: 'Receive', exact: true }).click();
    await page.locator('.po-rcv-input').fill('10');
    await page.getByRole('button', { name: 'Confirm Receive', exact: true }).click();
    await page.locator('#po-modal').waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.querySelector('[data-status="partial_completed"]'));
    check(width + ' Partial receipt updates PO and factory stock once', h.rows('purchase_order_lines')[0].completed_qty === 10 && h.rows('factory_stock')[0].fac_current_stock === 10 && h.rows('factory_stock_movements').length === 1);
    const receipt = h.calls.find(c => c.action === 'receivePurchaseOrderLines' && !c.mode);
    const before = h.writes();
    const replay = await page.evaluate(body => KM.DB.receivePurchaseOrderLines(body), receipt);
    check(width + ' Same-key browser replay is not counted twice', replay.already_recorded === true && h.writes() === before);
    await mount(page, 'purchase-order-list', 'initPurchaseOrderListPage');
    await page.locator('#pol-tbody tr').filter({ hasText: 'SKU-A' }).waitFor();
    await page.locator('.pol-gantt-toggle').click();
    const lane = page.locator('.pol-gantt-lane');
    await lane.waitFor();
    check(width + ' In Production Overview/Gantt has correct completed/shipped/remaining', (await lane.getAttribute('title')).includes('C10/S0/R10'));
    check(width + ' Gantt uses edited completion date', (await lane.getAttribute('title')).includes('2026-12-04'));
    check(width + ' Gantt axis dates do not overlap', await page.locator('.pol-gantt-axis span').evaluateAll(labels => {
      const rects = labels.map(el => el.getBoundingClientRect());
      return rects.every((r, i) => !i || r.left >= rects[i - 1].right);
    }));
    await page.screenshot({ path: path.join(output, 'production-' + width + '.png'), fullPage: true });
    await mount(page, 'purchase-order-overview', 'initPurchaseOrderOverviewPage'); await po.waitFor();
    await po.locator('.sp-btn-expand').click();
    await po.getByRole('button', { name: 'Receive', exact: true }).click();
    check(width + ' Fresh receipt defaults only the unreceived remainder', await page.locator('.po-rcv-input').inputValue() === '20');
    await page.getByRole('button', { name: 'Confirm Receive', exact: true }).click();
    await page.locator('#po-modal').waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.querySelector('[data-status="completed"]'));
    check(width + ' Full receipt closes production with exactly 30 stock', h.rows('purchase_orders')[0].order_status === 'completed' &&
      h.rows('factory_stock')[0].fac_current_stock === 30 && h.rows('factory_stock_movements').length === 2);
    await mount(page, 'purchase-order-list', 'initPurchaseOrderListPage');
    await page.getByRole('button', { name: /Ready \/ Completed/ }).click();
    await page.locator('#pol-tbody tr').filter({ hasText: 'SKU-A' }).waitFor();
    await lane.waitFor();
    check(width + ' Remounted Gantt synchronizes persisted expanded state', (await page.locator('#pol-gantt').getAttribute('class')).includes('is-open'));
    check(width + ' Ready Overview/Gantt retains completed inventory', (await lane.getAttribute('title')).includes('C30/S0/R30'));
    await page.evaluate(() => {
      window.importLoads = [];
      KM.scriptLoader = { load: async url => { importLoads.push(url); KM.poFactoryImport = { open: async () => true }; return true; } };
    });
    await page.locator('#polActionsTrigger').click();
    await page.getByRole('menuitem', { name: 'Import Purchase Order', exact: true }).click();
    check(width + ' PO import first-entry loads updated StockPO module', await page.evaluate(() => importLoads[0] === 'assets/js/utils/po-factory-import.js?v=stockpo-unproduced-20261124'));
    check(width + ' No broad DB reloads', !h.calls.some(c => c.action === 'getOperationDb'));
    check(width + ' No unexpected browser exceptions', errors.length === 0);
    check(width + ' No outgoing network requests', outbound.length === 0);
    check(width + ' No failure alerts hidden behind successful state', !dialogs.some(d => /failed:|Cannot save|Cannot.*Submit|NO_WEB_CRYPTO/i.test(d)));
    check(width + ' Completed Overview has no viewport overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(output, 'completed-' + width + '.png'), fullPage: true });
    return { width, calls: h.calls.length, errors, outbound, documents: h.files.length, stock: h.rows('factory_stock')[0].fac_current_stock };
  } catch (e) {
    await page.screenshot({ path: path.join(output, 'failure-' + width + '.png'), fullPage: true });
    console.error('Browser errors:', errors, 'Dialogs:', dialogs); throw e;
  } finally { await page.close(); }
}

async function receiptGuards(browser) {
  const h = createWorld(), roId = h.seedRequest();
  for (const transition of ['submit', 'approve']) assert.equal(h.dispatch({ action: 'updateRequestOrderStatus', request_order_id: roId, transition }).success, true);
  assert.equal(h.dispatch({ action: 'createPurchaseOrderFromRequest', request_order_id: roId }).success, true);
  const poId = h.rows('purchase_orders')[0].purchase_order_id, lineId = h.rows('purchase_order_lines')[0].purchase_order_line_id;
  const { page, errors, outbound, dialogs } = await openHarness(browser, 1440, h);
  try {
    await mount(page, 'purchase-order-overview', 'initPurchaseOrderOverviewPage');
    const po = page.locator('[id="po-card-' + poId + '"]'); await po.waitFor(); await po.locator('.sp-btn-expand').click();
    h.put('purchase_order_lines', 'purchase_order_line_id', lineId, 'unit_cost', '');
    h.put('purchase_order_lines', 'purchase_order_line_id', lineId, 'line_amount', '');
    let before = h.writes();
    await po.getByRole('button', { name: 'Send PO', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('button[aria-busy="true"]'));
    check('Missing required document price surfaces a blocked alert', dialogs.some(d => /Send PO blocked/.test(d)));
    check('Document refusal is zero business writes, files and folders', h.writes() === before && h.files.length === 0 && h.folders.length === 0 && h.rows('purchase_orders')[0].order_status === 'draft');
    h.put('purchase_order_lines', 'purchase_order_line_id', lineId, 'unit_cost', 2);
    h.put('purchase_order_lines', 'purchase_order_line_id', lineId, 'line_amount', 80);
    const issueBefore = h.calls.filter(c => c.action === 'updatePurchaseOrderStatus').length;
    await po.getByRole('button', { name: 'Send PO', exact: true }).evaluate(btn => { btn.click(); btn.click(); });
    await po.getByRole('button', { name: 'Receive', exact: true }).waitFor();
    check('Fast double-click sends one issue command and creates one file', h.calls.filter(c => c.action === 'updatePurchaseOrderStatus').length === issueBefore + 1 && h.files.length === 1);
    await po.getByRole('button', { name: 'Receive', exact: true }).click();
    await page.locator('.po-rcv-input').fill('41');
    before = h.calls.length;
    await page.getByRole('button', { name: 'Confirm Receive', exact: true }).click();
    check('Browser rejects over-receipt without a write request', h.calls.length === before && dialogs.some(d => d.includes('cannot exceed Unreceived Qty')));
    await page.locator('.po-rcv-input').fill('10');
    const concurrent = h.c.handleReceivePurchaseOrderLines_(h.receiptBody(h, poId, lineId, 5));
    assert.equal(concurrent.success, true, JSON.stringify(concurrent)); before = h.writes();
    await page.getByRole('button', { name: 'Confirm Receive', exact: true }).click();
    await page.locator('#po-modal').waitFor({ state: 'detached' });
    check('Two-tab stale receipt refreshes rather than posting old quantities', h.writes() === before && h.rows('factory_stock')[0].fac_current_stock === 5 && dialogs.some(d => d.includes('PO_RECEIPT_PRECONDITION_STALE')));
    check('Proven stale refusal releases the pending receipt', await page.evaluate(id => sessionStorage.getItem('km.po.receipt.pending.' + id) === null, poId));
    await po.getByRole('button', { name: 'Receive', exact: true }).click();
    await page.locator('.po-rcv-input').fill('10');
    await page.evaluate(() => {
      const base = fetch; let cut = true;
      window.fetch = async (url, init) => {
        const body = JSON.parse(init.body), result = await base(url, init);
        if (cut && body.action === 'receivePurchaseOrderLines' && !body.mode) { cut = false; throw new TypeError('SYNTHETIC_RESPONSE_LOST_AFTER_COMMIT'); }
        return result;
      };
    });
    await page.getByRole('button', { name: 'Confirm Receive', exact: true }).evaluate(btn => { btn.click(); btn.click(); });
    await page.waitForFunction(() => !document.querySelector('button[aria-busy="true"]'));
    const held = await page.evaluate(id => JSON.parse(sessionStorage.getItem('km.po.receipt.pending.' + id)), poId);
    check('Landed receipt with a lost answer keeps the exact operation key', held && h.rows('factory_stock')[0].fac_current_stock === 15 && dialogs.some(d => d.includes('server did not answer')));
    const requests = h.calls.filter(c => c.action === 'receivePurchaseOrderLines' && !c.mode);
    check('Double-click does not dispatch a duplicate receipt', requests.length === 2);
    before = h.writes();
    // Reload the actual page/controller, not just the modal: the receipt must recover from sessionStorage.
    await page.addScriptTag({ content: read('assets/js/pages/purchase-order-overview.js') });
    await mount(page, 'purchase-order-overview', 'initPurchaseOrderOverviewPage'); await po.waitFor(); await po.locator('.sp-btn-expand').click();
    await po.getByRole('button', { name: 'Receive', exact: true }).click();
    await page.locator('.po-rcv-input').fill('1');
    await page.getByRole('button', { name: 'Confirm Receive', exact: true }).click();
    await page.locator('#po-modal').waitFor({ state: 'detached' });
    const retried = h.calls.filter(c => c.action === 'receivePurchaseOrderLines' && !c.mode).at(-1);
    check('Re-entry resends held 10 units/key, not the newly typed 1 unit', retried.idempotency_key === held.key && retried.lines[0].receive_qty === 10);
    check('Recovered lost-answer receipt has no duplicate stock or movements', h.writes() === before && h.rows('factory_stock')[0].fac_current_stock === 15 && h.rows('factory_stock_movements').length === 2);
    check('Successful recovery clears the held operation', await page.evaluate(id => sessionStorage.getItem('km.po.receipt.pending.' + id) === null, poId));
    check('Guard scenarios have no unexpected JS exceptions or real network', errors.length === 0 && outbound.length === 0);
    return { scenarios: 'document gate, double clicks, stale receipt, lost answer and re-entry', errors, outbound };
  } catch (e) {
    console.error('Guard dialogs:', dialogs); throw e;
  } finally { await page.close(); }
}

module.exports = { openHarness, mount };
if (require.main === module) (async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const results = [];
    for (const width of [1440, 390]) results.push(await scenario(browser, width));
    results.push(await receiptGuards(browser));
    fs.writeFileSync(path.join(output, 'browser-results.json'), JSON.stringify({ checks, liveBusinessWrites: 0, appsScriptDeployments: 0, results }, null, 2) + '\n');
    console.log('ORDER_MAINLINE_C1_BROWSER_PASS ' + checks + ' live_business_writes=0');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
