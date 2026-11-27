'use strict';
// PO200-UI - the REAL Factory Stock page shows a 200-row import in its own table, without a reload (1440 and 390).
//
// REAL in this run
//   page     assets/html/pages/factory-stock.html + assets/js/pages/factory-stock.js, started the way the route mount starts it
//            (_fsRearmOnEntry_ then initFactoryStockPage); its own More Options > Import Inventory opens the importer; its own
//            post-commit step (_fiiAdoptCombinedReadback) and its own renderer draw the table that is asserted.
//   client   operation-system-db-api.js unmodified: loadFactoryInventoryWorkspace, importTemplateGet / importValidate / importCommit,
//            refreshPoFactoryTables (four getTable reads), getFactoryStock, getFactoryStockMovements; core/script-loader.js (the two lazy
//            modules arrive as real script requests, answered from the working tree); core/deferred-read.js; utils/inventory-sku-identity.js;
//            po-factory-import.js, import-batch.js, template-export.js, ExcelJS; a real XLSX built from the downloaded template.
//   server   in memory: 78_/79_/81_/82_/82a_ (import), 88_ handleFactoryInventoryWorkspaceGet_ with the real default io of 70_ reading
//            the world's sheets, and handleGetTable_ (03_) with readSheetAsObjects_ / filterRows_ / formatValue_ (02_) taken out by name.
// STAND-INS, each one named
//   - window.fetch: carries the request body (POST) or the action/table of the query (GET) to the in-memory server. No HTTP, no router
//     (01_), no session, no production profile; the action -> handler map below repeats the router's four lines.
//   - KM.api.getWorkspace: one line that forwards { workspace, payload } to the server handler (km-api-foundation.js is not loaded).
//   - KM_PRODUCTION_GUARD_: a fixed environment key, so refreshPoFactoryTables' environment check has something to compare.
//   - KM.lifecycle / KM.partialLoader / KM.loadState / dual-layer resize / index.html: not loaded; the markup is placed in the body.
//   - Sheets, Apps Script, LockService: the synthetic world of helpers/po-factory-unproduced-world.cjs.
//   - metrics on the commit answer: the server does not send them yet; this suite adds them to the answer (marked INJECTED below).
// NOT shown here: real Sheets, real Apps Script time or limits, the live router, sign-in.
// CAN FAIL: KM_PO200_FS_MUTANT=adoption-off runs the same suite with the page's post-commit adoption disabled in memory only
// (nothing is written to disk); that run must end non-zero.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { world, root, read, plain } = require('./helpers/po-factory-unproduced-world.cjs');
const { extract } = require('./ad4/extract.cjs');
const runtime = process.env.KM_NODE_MODULES || 'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1119-907-0_26.1119.907.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const { chromium } = require(require.resolve('playwright', { paths: [runtime] }));
const ExcelJS = require('../vendor/exceljs-4.4.0.min.js');

const out = path.join(root, 'output/po200-20261127/browser');
const gs = 'assets/specs/active/apps-script/';
const ORIGIN = 'http://127.0.0.1:59999', PAGE_PATH = '/factory-stock-test';
const LAZY = ['assets/js/utils/po-factory-import.js', 'assets/js/utils/import-batch.js'];
const ROWS = 200, PER_PO = 50, QTY = 200, FACTORY = 'FACTORY-A', FACTORY_NAME = 'Fixture Factory';
const MUTANT = process.env.KM_PO200_FS_MUTANT || '';
const skuName = i => 'ROW200-' + String(i).padStart(3, '0');
const num = s => Number(String(s).split(',').join(''));
let checks = 0;
const failed = [];   // the mutant run only: every failing check is listed instead of stopping at the first, so the proof names the table checks
function check(label, value, detail) {
  if (MUTANT && !value) { failed.push(label); console.log('FAIL ' + label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail).slice(0, 300))); return; }
  assert(value, label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))); checks++; console.log('PASS ' + label);
}

// INJECTED metrics (the server sends none yet). 1440: every field, at the top of the answer. 390: inside result, two usable fields and
// four that must be ignored (text, negative, not finite, text) - nothing the server sends as text may reach the page.
const METRICS = {
  1440: { at: 'top', value: { requests: 10, bytes: 3795693, cells: 94000, ms_validate: 400, ms_stage: 2100, ms_request: 8000, ms_readback: 2200, ms_total: 12300 },
    suffix: ' · request 3.80 MB in 10 parts, 94000 cells · server 12.3 s (validate 0.4 / stage 2.1 / write 8.0 / readback 2.2)' },
  390: { at: 'result', value: { requests: '<img src=x onerror=alert(1)>', bytes: 6483210, cells: -5, ms_stage: 'abc', ms_request: null, ms_total: 61000 },
    suffix: ' · request 6.48 MB · server 61.0 s' }
};

function serverWorld() {
  const h = world(), c = h.c;
  h.sheet('sku_regional_details', ['sku', 'site_sku'], Array.from({ length: ROWS }, (_, i) => ({ sku: 'CO1150-N', site_sku: skuName(i) })));
  // the Factory Inventory workspace also joins shipments: two empty tabs with the columns it requires
  for (const [name, headers] of [['shipments', ['shipment_id', 'status']], ['shipment_lines', ['shipment_line_id', 'shipment_id', 'sku', 'shipment_qty']]]) {
    if (!h.tables[name]) h.sheet(name, headers);
  }
  c.KMSLS = require('../js/core/supply-planning-shipment-line-source.js');
  for (const file of ['70_api_v1_overseas_stock_workspace.gs', '88_api_v1_warehouse_lifecycle.gs']) vm.runInContext(read(gs + file), c, { filename: file });
  const pick = (file, names) => {
    const wanted = names.filter(n => typeof c[n] === 'undefined'), got = extract(read(gs + file), n => wanted.includes(n), () => false);
    assert.equal(got.length, wanted.length, 'server functions not found in ' + file + ': ' + wanted.join(', '));
    return got.map(p => p.text).join('\n');
  };
  vm.runInContext(pick('02_core_sheet_db.gs', ['readSheetAsObjects_', 'filterRows_', 'formatValue_']) + '\n' +
    pick('03_master_data_handlers.gs', ['handleGetTable_']), c, { filename: 'getTable-by-name' });
  return h;
}

async function run(browser, width) {
  const h = serverWorld(), validations = [], commits = [], loads = [], errors = [], outbound = [], dialogs = [];
  const metrics = METRICS[width] || METRICS[1440];
  h.calls = [];
  // the router's lines for these actions (01_ is not loaded): action -> the real handler
  h.dispatch = body => {
    h.calls.push(plain(body));
    const action = body.action;
    if (action === 'workspace' && body.workspace === 'factoryInventory') return plain(h.c.handleFactoryInventoryWorkspaceGet_({ action: 'factoryInventory.workspace.get', payload: body.payload || {} }));
    if (action === 'getTable') return plain(h.c.handleGetTable_(String(body.table || '').trim()));
    if (action === 'import.template.get') return plain(h.c.handleImportTemplateGet_(body));
    if (action === 'import.validate') { const r = plain(h.c.handleImportValidate_(body)); validations.push({ body, r }); return r; }
    if (action === 'import.commit') {
      const r = plain(h.c.handleImportCommit_(body)); commits.push({ body, r: plain(r) });
      if (r && r.success) { if (metrics.at === 'top') r.metrics = metrics.value; else r.result = Object.assign({}, r.result, { metrics: metrics.value }); }   // INJECTED
      return r;
    }
    throw Error('Unexpected synthetic action: ' + action);
  };
  const page = await browser.newPage({ viewport: { width, height: 950 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', async d => { dialogs.push(d.message()); await d.dismiss(); });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === ORIGIN && url.pathname === PAGE_PATH) {
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"></head><body></body></html>' });
    }
    const lazy = url.origin === ORIGIN && LAZY.find(f => url.pathname === '/' + f);
    if (lazy) { loads.push(lazy + url.search); return route.fulfill({ contentType: 'application/javascript; charset=utf-8', body: read(lazy) }); }
    outbound.push(route.request().url()); return route.abort();
  });
  await page.exposeFunction('fixtureDispatch', body => h.dispatch(body));
  try {
    await page.goto(ORIGIN + PAGE_PATH);
    for (const file of ['assets/css/base.css', 'assets/css/components.css', 'assets/css/layout.css', 'assets/css/responsive-foundation.css', 'assets/css/pages/factory-stock.css']) await page.addStyleTag({ content: read(file) });
    await page.addStyleTag({ content: 'body{font:14px Arial;margin:0;color:#172f46;background:#fff}main{padding:16px;min-width:0}.module-section{display:block!important}' });
    await page.evaluate(() => {
      window.KM_PRODUCTION_CONFIG_ = { endpoint: 'https://script.google.com/macros/s/SYNTHETIC_ONLY/exec' };
      window.KM_PRODUCTION_GUARD_ = { environmentKey: () => 'env:synthetic:po200', ready: async () => true, isActionAllowed: () => true };
      window.KM = { api: { workspaceApiActive: () => true, getWorkspace: (workspace, payload) => fixtureDispatch({ action: 'workspace', workspace, payload }) } };
      window.fetch = async (url, init) => {
        let body;
        if (init && init.body) body = JSON.parse(init.body);
        else { const q = new URL(String(url)).searchParams; body = { action: q.get('action'), table: q.get('table') }; }
        return new Response(JSON.stringify(await fixtureDispatch(body)), { status: 200, headers: { 'Content-Type': 'application/json' } });
      };
    });
    for (const file of ['assets/js/api/operation-system-db-api.js', 'assets/js/core/script-loader.js', 'assets/js/core/deferred-read.js', 'assets/js/utils/inventory-sku-identity.js',
      'assets/vendor/exceljs-4.4.0.min.js', 'assets/js/utils/template-export.js']) await page.addScriptTag({ content: read(file) });
    let pageSource = read('assets/js/pages/factory-stock.js');
    if (MUTANT === 'adoption-off') {                                             // in memory only: the page keeps its old model after a commit
      const anchor = 'function _fiiAdoptCombinedReadback() {', mutated = pageSource.replace(anchor, anchor + ' return;');
      assert.notEqual(mutated, pageSource, 'mutant anchor not found'); pageSource = mutated;
      console.log('MUTANT adoption-off: _fiiAdoptCombinedReadback returns at once (in memory only)');
    } else assert.equal(MUTANT, '', 'unknown KM_PO200_FS_MUTANT');
    await page.addScriptTag({ content: pageSource });
    await page.evaluate(html => { document.body.innerHTML = '<main>' + html + '</main>'; window.__sameDocument = 'kept'; }, read('assets/html/pages/factory-stock.html'));
    await page.evaluate(() => { window._fsRearmOnEntry_(); window.initFactoryStockPage(); });   // what the route mount does
    await page.waitForFunction(() => window._fsLoadState_().status === 'READY');

    const snapshot = () => page.evaluate(() => {
      const section = document.querySelector('#factory-stock-section'), text = id => document.getElementById(id).textContent.trim();
      return {
        skus: Array.from(section.querySelectorAll('#factory-stock-fixed-body .fixed-row')).map(e => e.textContent.trim()),
        rows: Array.from(section.querySelectorAll('#factory-stock-scroll-body .scroll-row')).map(r => Array.from(r.querySelectorAll('.scroll-cell')).map(c => c.textContent.trim())),
        body: section.querySelector('#factory-stock-scroll-body').textContent.trim().slice(0, 80),
        kpi: { current: text('fi-kpi-current'), reserved: text('fi-kpi-reserved'), available: text('fi-kpi-available'), inProduction: text('fi-kpi-inproduction'), pendingShipout: text('fi-kpi-pendingshipout') },
        filters: Array.from(section.querySelectorAll('[data-fs-panel="snapshot"] .fc-dropdown-trigger')).map(t => t.dataset.filter + '=' + t.querySelector('.fc-dropdown-text').textContent.trim()),
        factoryOptions: Array.from(section.querySelectorAll('.fc-dropdown-panel[data-filter="factory"] input')).map(i => i.value + ':' + i.checked),
        skuFilter: section.querySelector('#factory-sku-input') ? section.querySelector('#factory-sku-input').value : null,
        pager: section.querySelectorAll('[data-fs-panel="snapshot"] [class*="pagin"], [data-fs-panel="snapshot"] [id*="pagin"], [data-fs-panel="snapshot"] [class*="pager"]').length,
        loadStatus: window._fsLoadState_().status, modelStock: _fsReadModel ? _fsReadModel.factoryStock.length : -1, modelMoves: _fsReadModel ? _fsReadModel.factoryStockMovements.length : -1,
        sameDocument: window.__sameDocument === 'kept' && performance.getEntriesByType('navigation').length === 1
      };
    });
    const worldStock = () => h.rows('factory_stock').filter(r => r.warehouse_id === FACTORY);
    const count = pred => h.calls.filter(pred).length;

    // ---- before the import ----
    const before = await snapshot();
    check(width + ' Factory Stock page mounted by its own init from ONE factoryInventory workspace read (real 88_ handler); no whole-DB read',
      before.loadStatus === 'READY' && count(c => c.action === 'workspace' && c.workspace === 'factoryInventory') === 1 && h.calls.length === 1 && count(c => c.action === 'getOperationDb') === 0, h.calls.map(c => c.action));
    check(width + ' before: the page shows 0 stock rows and a total of 0, and the server holds 0 factory stock rows',
      before.skus.length === 0 && before.rows.length === 0 && before.body === 'No factory stock rows.' && num(before.kpi.current) === 0 && worldStock().length === 0, before);
    await page.screenshot({ path: path.join(out, 'factory-stock-before-' + width + '.png'), fullPage: true });

    // ---- the page's own control opens the shared importer ----
    await page.locator('#factoryActionsTrigger').click();
    await page.getByRole('menuitem', { name: 'Import Inventory', exact: true }).click();
    await page.locator('#km-imb-scope-warehouse_id').waitFor();
    const named = (file, source) => { const m = source.split("'").find(s => s.startsWith(file + '?v=')); assert(m, 'loader url not found: ' + file); return m; };
    check(width + ' More Options > Import Inventory loaded both modules through the real script loader, by the tokens their callers name',
      loads.length === 2 && loads[0] === named(LAZY[0], pageSource.slice(pageSource.indexOf('function _fiiOpenBatchImport'))) && loads[1] === named(LAZY[1], read(LAZY[0])), loads);
    check(width + ' the module limit is 200', await page.evaluate(() => KM.poFactoryImport.MAX_ROWS) === ROWS);
    await page.waitForFunction(() => document.querySelectorAll('#km-imb-scope-warehouse_id option').length > 1);
    await page.locator('#km-imb-scope-warehouse_id').selectOption(FACTORY);
    await page.locator('#km-imb-workflow-0').click();
    const download = page.waitForEvent('download'); await page.locator('#km-imb-download').click();
    const file = path.join(out, 'factory-stock-template-' + width + '.xlsx'); await (await download).saveAs(file);
    const t = h.c.handleImportTemplateGet_({ domain: 'po_factory_stock', mode: 'NEW_RECEIPT', scope: { warehouse_id: FACTORY } }), def = t.sheets[0], values = h.body().sheets.StockPO[0];
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(fs.readFileSync(file));
    const ws = wb.getWorksheet('StockPO'), headers = {};
    const headerRow = [1, 2, 3, 4].find(r => ws.getRow(r).values.includes('po_no')); assert(headerRow);
    ws.getRow(headerRow).eachCell((cell, col) => { headers[String(cell.value)] = col; });
    const exampleKept = headers.row_type ? String(ws.getCell(headerRow + 1, headers.row_type).value || '') === 'example' : false, first = headerRow + (exampleKept ? 2 : 1);
    for (let i = 0; i < ROWS; i++) def.columns.forEach(c => {                    // 4 POs x 50 SKUs; the template's example row stays in the file
      ws.getCell(first + i, headers[c.header]).value = c.key === 'transaction_id' || c.key === 'row_type' ? null : c.key === 'sku' ? skuName(i) : c.key === 'po_no' ? 'PO-FS-' + String(Math.floor(i / PER_PO)) : values[c.key] ?? null;
    });
    await page.locator('#km-imb-file').setInputFiles({ name: 'factory-stock-rows-200.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(await wb.xlsx.writeBuffer()) });
    await page.waitForFunction(() => !document.querySelector('#km-imb-validate').disabled);

    // ---- the long batch id stays inside its box (Task 2) ----
    const fit = () => page.evaluate(() => {
      const box = id => { const e = document.getElementById(id); return { scroll: e.scrollWidth, client: e.clientWidth, chars: e.textContent.length, hidden: e.hidden }; };
      return { batch: box('km-imb-batch'), status: box('km-imb-status'), modal: box('km-imb-modal') };
    });
    const fits = f => f.batch.scroll <= f.batch.client && f.status.scroll <= f.status.client && f.modal.scroll <= f.modal.client;
    const fitChosen = await fit();
    check(width + ' file chosen: the "Batch PFI-auto-<64 hex> · file name" line does not overflow and the dialog has no horizontal scroll',
      fits(fitChosen) && (await page.locator('#km-imb-batch').innerText()).startsWith('Batch PFI-auto-'), fitChosen);

    await page.locator('#km-imb-validate').click();
    await page.waitForFunction(() => !document.querySelector('#km-imb-validate').disabled);
    const v = validations[0];
    check(width + ' the real XLSX parsed to exactly 200 data rows with one generated batch id (example row left in the file: ' + exampleKept + ')',
      v && v.body.sheets.StockPO.length === ROWS && v.body.import_batch_id.startsWith('PFI-auto-') && v.body.import_batch_id.length === 73 && v.body.sheets.StockPO[ROWS - 1].sku === skuName(ROWS - 1), v && v.body.sheets.StockPO.length);
    check(width + ' Validate accepts the file with no write', v.r.valid === true && h.rows('purchase_orders').length === 0 && h.atomic.calls.length === 0 && worldStock().length === 0, v.r.issues);
    const fitValid = await fit();
    check(width + ' validated: the status box naming the batch does not overflow', fits(fitValid) && !fitValid.status.hidden, fitValid);
    const unchanged = await snapshot();
    check(width + ' Validate did not change the page table', unchanged.skus.length === 0 && num(unchanged.kpi.current) === 0);

    // ---- Commit ----
    const callsBeforeCommit = h.calls.length;
    await page.locator('#km-imb-confirm').check(); await page.locator('#km-imb-apply').click();
    await page.waitForFunction(() => { const s = document.querySelector('#km-imb-status'), x = s ? s.textContent : ''; return x.includes('Data read back') || x.includes('readback failed') || x.includes('Nothing was written') || x.includes('unknown'); }, null, { timeout: 120000 });
    const after = await snapshot();                                              // read at once: no wait, no reload, no re-entry
    const statusAfter = await page.locator('#km-imb-status').evaluate(e => ({ text: e.textContent, html: e.innerHTML }));
    const c = commits[0], id = v.body.import_batch_id;
    check(width + ' Commit succeeded as ONE atomic request, read back by the server', commits.length === 1 && c.r.success === true && c.r.result.atomic_commit === true && c.r.result.readback_verified === true && h.atomic.calls.length === 1, c && c.r.code);
    check(width + ' after Commit the importer says "Data read back"', statusAfter.text.includes('Data read back.') && !statusAfter.text.includes('readback failed'), statusAfter.text.slice(0, 200));
    const stock = worldStock(), total = stock.reduce((n, r) => n + Number(r.fac_current_stock), 0), last = skuName(ROWS - 1);
    check(width + ' server: 4 POs, 200 lines, 200 stock rows of 200 for the factory (40,000), 200 movements, one committed receipt',
      h.rows('purchase_orders').length === ROWS / PER_PO && h.rows('purchase_order_lines').length === ROWS && stock.length === ROWS && stock.every(r => Number(r.fac_current_stock) === QTY) && total === 40000 &&
      h.rows('factory_stock_movements').length === ROWS && h.rows('import_batches').length === 1 && h.rows('import_batches')[0].status === 'COMMITTED');
    const readback = h.calls.slice(callsBeforeCommit).map(x => x.action === 'getTable' ? 'getTable:' + x.table : x.action);
    check(width + ' the client read back with the real refreshPoFactoryTables: commit, then four getTable reads, no workspace re-read, no whole-DB read',
      JSON.stringify(readback) === JSON.stringify(['import.commit', 'getTable:purchase_orders', 'getTable:purchase_order_lines', 'getTable:factory_stock', 'getTable:factory_stock_movements']), readback);

    // ---- THE TABLE, in the page, without a manual reload ----
    check(width + ' no reload: the same document, and the page was not re-entered', after.sameDocument && after.loadStatus === 'READY');
    check(width + ' no pagination and no narrowing filter: every filter reads All, the SKU box is empty, the only factory option is the fixture factory',
      after.pager === 0 && after.skuFilter === '' && after.filters.length === 5 && after.filters.every(f => f.endsWith('=All')) && JSON.stringify(after.factoryOptions) === JSON.stringify([':true', FACTORY_NAME + ':true']), { filters: after.filters, factory: after.factoryOptions, pager: after.pager });
    const lastAt = after.skus.indexOf(last), lastRow = after.rows[lastAt] || [];
    check(width + ' TABLE: the row of the LAST SKU of the file is shown once, for the fixture factory, Current 200 / Reserved 0 / Available 200',
      lastAt >= 0 && after.skus.filter(s => s === last).length === 1 && lastRow[0] === FACTORY_NAME && num(lastRow[3]) === QTY && num(lastRow[4]) === 0 && num(lastRow[5]) === QTY, { lastAt, lastRow, shown: after.skus.length, body: after.body });
    check(width + ' TABLE: the page shows 200 stock rows for the factory - the same number the server holds',
      after.skus.length === ROWS && after.rows.length === ROWS && after.rows.filter(r => r[0] === FACTORY_NAME).length === stock.length, { shown: after.skus.length, server: stock.length });
    const shown = Object.fromEntries(after.skus.map((s, i) => [s, num((after.rows[i] || [])[3])])), held = Object.fromEntries(stock.map(r => [r.sku, Number(r.fac_current_stock)]));
    check(width + ' TABLE: every shown SKU and Current quantity equals the server row (200 of 200)', Object.keys(shown).length === ROWS && JSON.stringify(Object.entries(shown).sort()) === JSON.stringify(Object.entries(held).sort()));
    const cellSum = after.rows.reduce((n, r) => n + num(r[3]), 0);
    check(width + ' TOTAL: the Current Stock card reads 40,000 = the sum of the shown rows = the sum of the server rows; Available reads 40,000, Reserved 0',
      num(after.kpi.current) === 40000 && cellSum === 40000 && total === 40000 && num(after.kpi.available) === 40000 && num(after.kpi.reserved) === 0, after.kpi);
    check(width + ' the page model holds the 200 movements of the import (the Movement Log tab is not opened here)', after.modelStock === ROWS && after.modelMoves === ROWS, { stock: after.modelStock, moves: after.modelMoves });
    check(width + ' the last row is really laid out in the table', lastAt >= 0 && await page.locator('#factory-stock-fixed-body .fixed-row').nth(lastAt).evaluate(e => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; }));
    // OBSERVED, not asserted as wanted: the adoption keeps the lifecycle join read at mount, so these two columns are not refreshed by an import.
    console.log('INFO ' + width + ' after import, without re-entry: In Production card "' + after.kpi.inProduction + '", Pending Shipout card "' + after.kpi.pendingShipout + '", last row cells "' + lastRow[6] + '" / "' + lastRow[7] + '"');

    // ---- the result line: batch id fits (Task 2), server metrics shown when sent (Task 3) ----
    const fitDone = await fit();
    check(width + ' applied: the status box "Applied. Batch PFI-auto-<64 hex> ..." does not overflow and the dialog has no horizontal scroll', fits(fitDone), fitDone);
    const expected = 'Applied. Batch ' + id + ' · ' + c.r.result.audit_rows + ' audit rows' + metrics.suffix + '. Data read back.';
    check(width + ' metrics sent (INJECTED, ' + metrics.at + '): the result line carries exactly the numbers, and only numbers', statusAfter.text === expected && statusAfter.html === expected, { got: statusAfter.html, expected });
    await page.screenshot({ path: path.join(out, 'factory-stock-importer-applied-' + width + '.png'), fullPage: true });
    await page.locator('#km-imb-close').click();
    await page.locator('#km-imb-modal').waitFor({ state: 'detached' });
    const closed = await snapshot();
    check(width + ' after Done the table still shows the 200 rows and 40,000', closed.skus.length === ROWS && num(closed.kpi.current) === 40000 && closed.sameDocument);
    if (lastAt >= 0) await page.locator('#factory-stock-fixed-body .fixed-row').nth(lastAt).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, 'factory-stock-after-' + width + (MUTANT ? '-mutant' : '') + '.png'), fullPage: true });

    // ---- a fresh entry re-reads the server and shows the same rows ----
    await page.evaluate(() => { window._fsRearmOnEntry_(); window.initFactoryStockPage(); });
    await page.waitForFunction(() => window._fsLoadState_().status === 'READY');
    const reentered = await snapshot();
    check(width + ' a fresh entry (one more workspace read) shows the same 200 rows and 40,000', reentered.skus.length === ROWS && num(reentered.kpi.current) === 40000 &&
      JSON.stringify(reentered.skus.slice().sort()) === JSON.stringify(after.skus.slice().sort()) && count(x => x.action === 'workspace') === 2, { rows: reentered.skus.length, kpi: reentered.kpi });
    console.log('INFO ' + width + ' after a fresh entry: In Production card "' + reentered.kpi.inProduction + '", Pending Shipout card "' + reentered.kpi.pendingShipout + '"');
    check(width + ' no browser exceptions, no dialogs, outbound requests = 0', errors.length === 0 && dialogs.length === 0 && outbound.length === 0, { errors, dialogs, outbound: outbound.length });
  } catch (e) {
    try { await page.screenshot({ path: path.join(out, 'factory-stock-failure-' + width + (MUTANT ? '-mutant' : '') + '.png'), fullPage: true }); } catch (_) { /* the failure itself is what matters */ }
    console.error('Browser errors:', errors, 'Dialogs:', dialogs, 'Outbound:', outbound.length); throw e;
  } finally { await page.close(); }
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of (process.env.KM_PO200_WIDTHS || '1440,390').split(',').map(Number)) await run(browser, width);
    if (MUTANT) {                                                                // a mutant run never prints the PASS line and never exits 0
      const table = failed.filter(l => l.includes(' TABLE: ') || l.includes(' TOTAL: '));
      throw Error(table.length ? 'MUTANT_KILLED ' + MUTANT + ': ' + failed.length + ' checks failed, ' + table.length + ' of them TABLE/TOTAL checks (' + checks + ' passed)'
        : 'MUTANT_SURVIVED ' + MUTANT + ': no TABLE/TOTAL check failed - the suite does not test the table');
    }
    console.log('PO_FACTORY_200_ROWS_FACTORY_STOCK_BROWSER_PASS ' + checks + ' live_business_writes=0 native_sheets=NOT_RUN');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
