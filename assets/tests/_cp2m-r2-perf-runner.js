/**
 * ==================================================================================================
 * S8-B3-R3-CP2M-R2 — THE NAVIGATION PERFORMANCE HARNESS
 * ==================================================================================================
 *
 * WHY NOT THE S4-R1 INSTRUMENT. That runner timed the Chrome PROCESS from Node, and its own header
 * says why it had to: under `--virtual-time-budget` Chrome freezes the clock while a task runs, so
 * `performance.now()` inside the page measures scheduling rather than work — a page spinning on
 * `Date.now()` never terminates. Process timing is real, but it is ONE number: it "cannot separate
 * shell from partial from JS from render", and its route deltas (-82 to +154 ms) sat inside the
 * baseline's own 840 ms spread with two of them negative.
 *
 * SO THIS CHANGES THREE THINGS, AND EACH ONE IS THE REASON A NUMBER HERE MEANS SOMETHING.
 *
 *   1. NO VIRTUAL TIME. The clock is the real one. Nothing in this file passes
 *      --virtual-time-budget, and a regression test asserts that it never will.
 *
 *   2. THE PAGE REPORTS ITSELF, over loopback HTTP. Without virtual time, `--dump-dom` returns at
 *      load and would capture nothing, so the driver POSTs its results to this process when it is
 *      done. That also removes `file://`, which matters more than it sounds: on file:// Resource
 *      Timing has no transferSize and no response phases, so the DOWNLOAD half of every measurement
 *      would have been unavailable. Over http://127.0.0.1 it is complete and same-origin.
 *
 *   3. THE BUSINESS REQUEST IS INTERCEPTED, NOT REMOVED. Every absolute non-local URL is re-issued
 *      against this process's own /__api, which answers from a FIXTURE after a declared delay. So the
 *      API phase is a real fetch with a real round trip that Resource Timing records as `fetch`, and
 *      not one byte leaves the machine. Chrome is additionally launched with a resolver rule that maps
 *      every host except 127.0.0.1 to NOTFOUND, so "no Production contact" is enforced by the browser
 *      rather than promised by this comment.
 *
 * WHAT IS REAL HERE AND WHAT IS NOT — stated up front so the report cannot overclaim:
 *
 *   REAL  the route's JavaScript bytes, their download over HTTP, their EXECUTION time, the partial
 *         fetch, DOM construction, style, layout, and the two paints that prove the screen changed.
 *   REAL  the ORDER and COUNT of requests a navigation makes.
 *   NOT REAL  the server's own think time. /__api answers after API_MS (default 120 ms), which is a
 *         declared constant, not a measurement of Apps Script. Any "API" figure in the output is the
 *         harness's own latency and is labelled as such. Production API latency is NOT MEASURED, and
 *         could not be without reading Production.
 *   NOT REAL  the data volume, which is the fixture's. Where a page renders zero rows the output says
 *         `rows: 0` and the render figure is an EMPTY-STATE render, not a data render.
 *
 * COLD vs WARM is a property of the PROCESS, so they are not mixed inside one.
 *   COLD  one freshly launched Chrome, with its own empty profile and disk cache, performing exactly
 *         ONE navigation. The route's scripts have never been fetched or executed.
 *   WARM  inside one process: visit, leave, return. The scripts are loaded and executed; the partial
 *         is injected; the module registries are populated.
 *
 * USAGE: node assets/tests/_cp2m-r2-perf-runner.js [outDir] [coldRepeats] [warmRepeats] [onlyRoutes]
 * A helper, not a suite: the leading underscore keeps the sweep from executing it.
 * ==================================================================================================
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const os = require('os');
const http = require('http');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const API_MS = 120;          // the harness's declared, synthetic server think time. NOT a measurement.
const SETTLE_MS = 900;       // quiet period the driver waits after a navigation before moving on
const BOOT_MS = 2500;        // time allowed for the boot chain before the program starts

const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
];
function findBrowser() { for (const b of BROWSERS) { if (fs.existsSync(b)) return b; } return null; }

/* THE ROUTES UNDER TEST. `ready` is the selector that proves DATA is drawn rather than a shell: the
   observer refuses to call a spinner a rendered page, and this is how it is told what a real row of
   each page looks like. `views` drives the six Product Strategy sub-pages, which are in-page view
   switches rather than navigations and are measured as their own kind of sample. */
const ROUTES = [
  { key: 'home', sectionId: 'home-section', kind: 'boot',
    ready: '#home-section .home-card, #home-section .kpi-card, #home-section .home-grid > *' },
  { key: 'ops', sectionId: 'ops-section', kind: 'route',
    ready: '#ops-section table tbody tr, #ops-section .ir-table tbody tr' },
  { key: 'global-logistics-map', sectionId: 'global-logistics-map-section', kind: 'route',
    ready: '#global-logistics-map-section canvas' },
  { key: 'site-priority', sectionId: 'site-priority-section', kind: 'route',
    ready: '#site-priority-section tr[data-sp-row]' },
  { key: 'carrier-rate-card', sectionId: 'carrier-rate-card-section', kind: 'plain',
    ready: '#carrier-rate-card-section table tbody tr, #carrier-rate-card-section .crc-row' },
  { key: 'product-strategy', sectionId: 'product-strategy-board-section', kind: 'route',
    ready: '#product-strategy-board-section .psb-view, #product-strategy-board-section canvas, #product-strategy-board-section table tbody tr',
    views: ['overview', 'category', 'risk', 'quality', 'workspace', 'advanced'] }
];

// ---- the fixture the stub API answers from -------------------------------------------------------
// Small, synthetic and obviously fake. It exists so pages have something to lay out; it is never
// asserted on as business truth, and no row here resembles a real SKU, site or customer.
function fixtureDb() {
  const mk = (n, f) => Array.from({ length: n }, (_, i) => f(i));
  return {
    skuDetails: mk(40, i => ({ sku: 'TEST-SKU-' + i, product_name: 'Fixture Product ' + i, category: 'FIXTURE',
      status: 'active', company: i % 2 ? 'KitchenMama' : 'ResourceUS' })),
    marketplaces: mk(7, i => ({ marketplace_id: 'M' + i, company: i < 5 ? 'KitchenMama' : 'ResourceUS',
      country: ['US', 'GB', 'DE', 'JP', 'CA', 'US', 'US'][i], marketplace: ['Amazon', 'Amazon', 'Amazon', 'Rakuten', 'Walmart', 'Amazon', 'eBay'][i],
      allocation_priority: [100, 80, 80, 0, '', 50, '7abc'][i], currency: 'USD', status: 'active',
      updated_by: 'fixture', updated_at: '2026-10-13T00:00:00Z' })),
    warehouses: mk(6, i => ({ warehouse_id: 'W' + i, warehouse_name: 'Fixture WH ' + i, country: 'US', type: 'overseas' })),
    factoryStock: mk(40, i => ({ sku: 'TEST-SKU-' + i, qty: 100 + i })),
    overseasStock: mk(60, i => ({ sku: 'TEST-SKU-' + (i % 40), warehouse_id: 'W' + (i % 6), qty: 10 + i })),
    shipments: mk(25, i => ({ shipment_id: 'SH' + i, sku: 'TEST-SKU-' + (i % 40), qty: 5 + i,
      origin: 'W0', destination: 'W' + (i % 6), status: 'in_transit', etd: '2026-10-01', eta: '2026-11-01' })),
    carrierRateCards: mk(30, i => ({ carrier: 'FixtureCarrier ' + (i % 4), lane: 'CN-US', shipping_method: 'SEA',
      min_kg: i * 10, max_kg: (i + 1) * 10, rate: 1.5 + i / 10, currency: 'USD' })),
    carrierLeadTimes: mk(12, i => ({ carrier: 'FixtureCarrier ' + (i % 4), lane: 'CN-US', shipping_method: 'SEA', days: 30 + i })),
    pricingList: mk(40, i => ({ sku: 'TEST-SKU-' + i, marketplace_id: 'M' + (i % 7), price: 9.99 + i })),
    productFeatures: [], campaigns: [], campaignSkuLines: [], marketplaceSkus: [],
    fcRegularForecast: [], shippingPlans: [], skuHandbookSummaries: [], skuKnowledgeItems: [],
    pricingChangeLog: []
  };
}

/**
 * THE STUB'S ANSWER, BY ACTION.
 *
 * `getTable` is answered EXACTLY: it has one documented shape ({success,data:{rows}}) and one
 * parameter, so the pages that read through it -- Site Priority and Carrier Rate Card among them --
 * receive real fixture rows and produce a real DATA render. Those two routes therefore carry a
 * measured t_data_visible rather than an empty-state one.
 *
 * The scoped `*.get` reads each have their own envelope, and guessing at them would produce a page
 * that renders a plausible-looking nothing. So they get a GENERIC success envelope and the route is
 * reported as an EMPTY-STATE render, named as such in the evidence. A measurement that is honest
 * about what it did not measure is worth more than one that quietly pads itself.
 */
function apiAnswer(action, table) {
  const db = fixtureDb();
  const TABLES = {
    marketplaces: db.marketplaces, sku_details: db.skuDetails, warehouses: db.warehouses,
    carrier_rate_cards: db.carrierRateCards, carrier_lead_times: db.carrierLeadTimes,
    factory_stock: db.factoryStock, overseas_stock: db.overseasStock, shipments: db.shipments,
    pricing_list: db.pricingList,
    // Observed from the harness's own action log: Carrier Rate Card asks for this one by name.
    carriers: db.carrierRateCards.map(r => ({ carrier: r.carrier })).filter((v, i, a) =>
      a.findIndex(x => x.carrier === v.carrier) === i)
  };
  if (action === 'getTable') {
    return { success: true, data: { rows: TABLES[table] || [], table: table } };
  }
  if (action === 'getOperationDb') return { success: true, data: db };
  /* THE CAPABILITY MIRROR TAKES THE LITERAL `true` AND NOTHING ELSE (km-product-pricing-workspace.js
     reads `caps.product_strategy_enabled` and treats undefined, null, "true" and 1 all as "this build
     cannot read the answer"). Without it the board renders a refusal state and every view measurement
     would have been timing an error box. */
  if (action === 'getClientCapabilities') {
    return { success: true, data: { product_strategy_enabled: true,
      requestOrderDraftV2FlatCutover: true, requestOrderSiteConfirmRequired: true,
      inventoryAiPlanDbGenerationEnabled: false, capabilitiesVersion: 'fixture-cp2m-r2' } };
  }
  /* THE SITE INVENTORY SCOPE REGISTRY, answered in its real shape (scope-registry.js adapt() reads
     data.marketplaces, data.countries and data.marketplace_ids_by_country). Without it the Country
     selector stays empty, and the Site Inventory table legitimately draws nothing -- which would have
     been reported as a render that never happened rather than as a page waiting for a scope. */
  if (action === 'inventoryScope.registry.get') {
    const mk = db.marketplaces;
    const byCountry = {};
    mk.forEach(m => { (byCountry[m.country] = byCountry[m.country] || []).push(m.marketplace_id); });
    return { success: true, data: {
      marketplaces: mk.map(m => ({ marketplace_id: m.marketplace_id, company: m.company,
        country: m.country, marketplace: m.marketplace, marketplace_display_name: m.marketplace })),
      countries: Object.keys(byCountry).sort(),
      marketplace_ids_by_country: byCountry, empty: false, empty_reason: ''
    } };
  }
  // A generic success for every scoped read. Shapes are NOT invented; the page sees an empty result
  // set and renders its empty state, which the evidence records as EMPTY_STATE.
  return { success: true, action: action,
    data: { rows: [], items: [], records: [], countries: [], marketplaces: [], tables: {},
            capabilities: {}, servedAction: action } };
}

// ---- the local server ----------------------------------------------------------------------------

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

function startServer(pageHtml, onResult, apiLog, beacons) {
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    const p = decodeURIComponent(u.pathname);

    /* A TIMEOUT THAT CANNOT SAY WHERE IT STOPPED IS NOT A DIAGNOSIS. The driver pings here as it
       enters and leaves every step, so a run that never finishes still reports the last thing it did. */
    if (p === '/__beacon') {
      beacons.push(u.searchParams.get('at') || '?');
      res.writeHead(204); res.end();
      return;
    }

    if (p === '/__perf' && req.method === 'POST') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok');
        try { onResult(JSON.parse(body)); } catch (e) { onResult({ error: String(e.message) }); }
      });
      return;
    }

    // THE STUB BACKEND. Every action gets the same envelope shape the real transport expects; the
    // action name is logged so the harness can say exactly which reads a navigation performed.
    if (p === '/__api') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        let action = u.searchParams.get('action') || '';
        let table = u.searchParams.get('table') || '';
        if (!action && body) { try { const j = JSON.parse(body); action = j.action || ''; table = table || j.table || ''; } catch (e) {} }
        apiLog.push(table ? (action + ':' + table) : (action || '(none)'));
        const payload = apiAnswer(action, table);
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
            'Timing-Allow-Origin': '*' });
          res.end(JSON.stringify(payload));
        }, API_MS);
      });
      return;
    }

    /* THE TWO CDN SCRIPTS. index.html loads chart.js and exceljs from jsdelivr; the resolver rule that
       keeps this harness off the network blocks both, and the first runs recorded them as page errors.
       They are served here as INERT LOCAL STUBS so a third-party outage is not mistaken for a render
       defect -- and so the harness still never reaches the internet. This intercepts a THIRD-PARTY
       request, which is permitted; the page's own layout, cascade and scripts are untouched. That these
       two exist on the boot path at all is itself recorded in the evidence as a cold-start finding. */
    if (p === '/__stub.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store',
        'Timing-Allow-Origin': '*' });
      res.end('window.Chart = window.Chart || function(){ return { destroy:function(){}, '
        + 'update:function(){}, resize:function(){}, data:{}, options:{} }; }; '
        + 'window.Chart.register = window.Chart.register || function(){}; '
        + 'window.ExcelJS = window.ExcelJS || { Workbook: function(){} };');
      return;
    }

    if (p === '/__page') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(pageHtml);
      return;
    }

    // Static, read-only, and confined to the repo: a path that escapes ROOT is refused rather than served.
    const abs = path.join(ROOT, p.replace(/^\/+/, ''));
    if (!abs.startsWith(ROOT)) { res.writeHead(403); res.end('no'); return; }
    fs.readFile(abs, (err, buf) => {
      if (err) { res.writeHead(404); res.end('404'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store', 'Timing-Allow-Origin': '*' });
      res.end(buf);
    });
  });
  return srv;
}

// ---- the page ------------------------------------------------------------------------------------

/**
 * index.html, unchanged in structure, with exactly two insertions:
 *   - a PREAMBLE before the first script, which installs the request interception; and
 *   - the observer plus a DRIVER after the last one.
 * The shell, the sidebar, the stylesheet order and every page script are the shipped ones. Nothing
 * about the LAYOUT is substituted — only the data and the destination of business requests.
 */
function buildPage(port, program, routes) {
  let html = read('index.html');
  // Point the two third-party script tags at the local inert stub. Nothing else in the document moves.
  html = html.replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/[^"']+/g, 'http://127.0.0.1:' + port + '/__stub.js');

  const preamble = `
<script>
(function(){
  var LOCAL = 'http://127.0.0.1:${port}';
  var _f = window.fetch;
  /* INTERCEPT, DO NOT REMOVE. An absolute URL that is not this harness is a business request: it is
     re-issued against the local stub with its method and body intact, so the call still crosses a real
     network boundary and Resource Timing still records it as a fetch. Nothing is cached, nothing is
     short-circuited, and the page cannot tell the difference apart from the answer it gets. */
  window.fetch = function(input, init){
    var url = (typeof input === 'string') ? input : (input && input.url) || '';
    if (/^https?:\\/\\//i.test(url) && url.indexOf(LOCAL) !== 0) {
      var qs = url.indexOf('?') >= 0 ? url.slice(url.indexOf('?')) : '';
      return _f.call(this, LOCAL + '/__api' + qs, init);
    }
    return _f.apply(this, arguments);
  };
  /* A PAGE THAT THREW IS NOT A PAGE THAT WAS SLOW. Without this, a route whose script failed would
     report "never rendered" and read as a performance finding instead of the breakage it is. Captured
     from the first line, before any application script runs, so nothing is missed. Messages only --
     no stack contents are kept beyond the first line, and no value from any variable. */
  window.__kmErrors = [];
  window.addEventListener('error', function(e){
    /* A RESOURCE that failed to load fires its error event on the ELEMENT and carries no message at
       all, so the first version of this recorded two useless entries both reading "error". The
       element's own src identifies it, reduced to a basename so no query token is retained.
       (No backticks in here: this whole block lives inside a template literal.) */
    var t = e && e.target;
    if (t && t !== window && (t.src || t.href)) {
      var u = String(t.src || t.href).split('?')[0];
      window.__kmErrors.push('resource: ' + u.slice(u.lastIndexOf('/') + 1));
    } else {
      window.__kmErrors.push(String((e && e.message) || 'error').slice(0,160));
    }
  }, true);
  window.addEventListener('unhandledrejection', function(e){
    window.__kmErrors.push('reject: ' + String((e && e.reason && e.reason.message) || e.reason || '').slice(0,160));
  });
  var _ce = console.error;
  console.error = function(){
    try { window.__kmErrors.push('console: ' + Array.prototype.slice.call(arguments).map(String).join(' ').slice(0,160)); } catch(x){}
    return _ce.apply(this, arguments);
  };
  window.__kmHarness = { port: ${port} };
}());
</script>`;

  const firstScript = html.indexOf('<script');
  html = html.slice(0, firstScript) + preamble + '\n' + html.slice(firstScript);

  const driver = `
<script src="assets/js/core/perf-observer.js"></script>
<script>
(function(){
  var ROUTES = ${JSON.stringify(routes)};
  var PROGRAM = ${JSON.stringify(program)};
  var SETTLE = ${SETTLE_MS}, BOOT = ${BOOT_MS};
  var log = [];

  function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
  function rows(sel){ try { return document.querySelectorAll(sel).length; } catch(e){ return -1; } }

  /* A REAL CLICK, not a function call. showSection() invoked directly would skip the capture-phase
     listener the observer uses for t_click and skip whatever the menu item itself does, so the
     measurement would start after the part of the work the operator actually waits through. */
  function clickRoute(key){
    /* HOME IS NOT A showSection ROUTE. It is reached by showHome(), which is what the logo's own
       onclick calls. Driving it through showSection('home') resolved to no section at all, so the
       navigation was correctly ABANDONED -- which nonetheless meant every leave step in the earlier
       runs measured a navigation that never happened. */
    if (key === 'home') {
      var logo = document.querySelector('.logo-text[onclick*="showHome"]');
      if (logo) { logo.click(); return 'click'; }
      if (window.showHome) { window.showHome(); return 'call'; }
      return 'none';
    }
    var el = document.querySelector('[onclick*="showSection(\\'' + key + '\\')"]');
    if (el) { el.click(); return 'click'; }
    if (window.showSection) { window.showSection(key); return 'call'; }
    return 'none';
  }

  /* CHOOSING A SCOPE IS WHAT MAKES THE SITE INVENTORY TABLE DRAW. The page mounts with empty Country
     and Marketplace selectors by design -- it does not read an inventory workspace nobody has scoped --
     so a measurement that stops at mount is measuring the filter bar, not the page. This drives the two
     selectors the way an operator does: set the value, dispatch a real change event. */
  async function selectScope(){
    var sec = document.getElementById('ops-section');
    if (!sec) return 'no-section';
    /* THE SECOND SELECTOR IS REBUILT BY THE FIRST. Setting both in one pass set a Marketplace that the
       Country change then replaced, so the page was left with a country and no marketplace and issued
       no read at all -- which the first run reported as "0 requests" and looked like a page that simply
       did not load. They are set in order, with a wait between them, the way an operator does it. */
    var country = sec.querySelector('#replenCountry') || sec.querySelectorAll('select')[0];
    var market  = sec.querySelector('#replenMarketplace') || sec.querySelectorAll('select')[1];
    if (!country || country.options.length < 2) return 'no-country-options';
    KM.perf.markInteraction('ops-scope', 'ops-section');
    country.selectedIndex = 1;
    country.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(350);
    if (!market || market.options.length < 2) return 'country-only:' + country.value;
    market.selectedIndex = 1;
    market.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(120);
    /* NO SPECULATIVE BUTTON PRESS. An earlier version looked for an apply button with
       [onclick*="load"], which also matches downloadReplenImportTemplate -- so the harness pressed
       DOWNLOAD TEMPLATE, headless Chrome raised a download, and the renderer never came back. Six runs
       reported TIMEOUT with nothing to show for it. The page reads on change; there is no button to
       press, and a selector that guesses at one is how a measurement harness starts operating the
       application. */
    return 'scoped:' + country.value + '/' + market.value;
  }

  function clickView(viewId){
    KM.perf.markInteraction('psb-view:' + viewId, 'product-strategy-board-section');
    return clickViewInner(viewId);
  }

  function clickViewInner(viewId){
    var sels = ['#product-strategy-board-section [data-route$="/' + viewId + '"]',
                '#product-strategy-board-section [data-view="' + viewId + '"]',
                '#product-strategy-board-section [data-psb-view="' + viewId + '"]'];
    for (var i=0;i<sels.length;i++){
      var b = null; try { b = document.querySelector(sels[i]); } catch(e){}
      if (b) { b.click(); return 'click'; }
    }
    if (window.PSB_BOARD && typeof window.PSB_BOARD.showView === 'function') {
      try { window.PSB_BOARD.showView(viewId); return 'call'; } catch(e){ return 'threw:' + String(e.message).slice(0,60); }
    }
    return 'none:' + (window.PSB_BOARD ? 'board-no-showView' : 'no-board')
         + '/' + (window.PSB_VIEWS ? 'views-ok' : 'no-views');
  }

  function beacon(at){
    try { var i = new Image(); i.src = 'http://127.0.0.1:' + window.__kmHarness.port + '/__beacon?at=' + encodeURIComponent(at); } catch(e){}
  }

  function send(payload){
    return fetch('http://127.0.0.1:' + window.__kmHarness.port + '/__perf',
      { method:'POST', headers:{'Content-Type':'text/plain'}, body: JSON.stringify(payload) });
  }

  async function run(){
    var sel = {};
    ROUTES.forEach(function(r){ sel[r.sectionId] = r.ready; });
    var navStart = performance.timing ? 0 : 0;

    beacon('boot-wait');
    await sleep(BOOT);
    beacon('boot-done');
    // The boot is over; Home's own cold render is read from the observer only if it was enabled in
    // time, which it is not — so Home's BOOT figure comes from Navigation Timing instead, below.
    KM.perf.enable({ readySelectors: sel });

    var bootMetrics = (function(){
      var nav = performance.getEntriesByType('navigation')[0];
      var paints = performance.getEntriesByType('paint');
      var fcp = null;
      paints.forEach(function(p){ if (p.name === 'first-contentful-paint') fcp = +p.startTime.toFixed(1); });
      var home = document.getElementById('home-section');
      return {
        domContentLoaded: nav ? +nav.domContentLoadedEventEnd.toFixed(1) : null,
        loadEvent: nav ? +nav.loadEventEnd.toFixed(1) : null,
        responseEnd: nav ? +nav.responseEnd.toFixed(1) : null,
        firstContentfulPaint: fcp,
        bootScriptBytes: performance.getEntriesByType('resource')
          .filter(function(e){ return e.initiatorType === 'script'; })
          .reduce(function(a,e){ return a + (e.encodedBodySize||0); }, 0),
        bootScriptCount: performance.getEntriesByType('resource').filter(function(e){ return e.initiatorType==='script'; }).length,
        bootRequestCount: performance.getEntriesByType('resource').length,
        homeRows: home ? rows(sel['home-section']||'#home-section *') : -1,
        homeVisible: !!(home && home.getBoundingClientRect().height > 0)
      };
    }());

    for (var i=0; i<PROGRAM.length; i++){
      var step = PROGRAM[i];
      var before = performance.getEntriesByType('resource').length;
      /* CLOSE WHATEVER IS OPEN FIRST, so a sample left over from the previous step is not the one this
         step reads back. That is how a view switch inherited a navigation's clock base. */
      KM.perf.flush();
      var sampleBase = KM.perf.samples().length;
      beacon('step' + i + ':' + step.phase + ':enter');
      var how = step.scope ? await selectScope()
              : step.view ? clickView(step.view)
              : clickRoute(step.key);
      beacon('step' + i + ':' + step.phase + ':acted:' + String(how).slice(0,24));
      await sleep(step.wait || SETTLE);
      KM.perf.flush();
      beacon('step' + i + ':' + step.phase + ':measured');
      var r = ROUTES.filter(function(x){ return x.key === step.key; })[0];
      var sec = document.getElementById(r ? r.sectionId : '');
      var ss = KM.perf.samples();
      /* THIS STEP'S SAMPLE, NOT THE LAST ONE RECORDED. A step that opened no sample (a view switch, a
         re-click of the current page) would otherwise inherit the PREVIOUS navigation's clock base and
         report a negative elapsed time -- which is exactly what the first run of this harness printed
         for the map's leave step (-833.8 ms). A negative duration is the instrument confessing.
         (No backticks here: this block lives inside a template literal.) */
      var mineAll = ss.slice(sampleBase);
      var mine = mineAll.length ? mineAll[0] : null;
      log.push({
        step: i, key: step.key, view: step.view || null, phase: step.phase, how: how,
        sampleLabel: mine ? mine.label : null,
        sampleShellVisible: mine && mine.t_shell_visible !== null ? +(mine.t_shell_visible - (mine.t_click!==null?mine.t_click:mine.t_nav)).toFixed(1) : null,
        sampleDataVisible: mine && mine.t_data_visible !== null ? +(mine.t_data_visible - (mine.t_click!==null?mine.t_click:mine.t_nav)).toFixed(1) : null,
        sampleDataBasis: mine ? mine.dataBasis : null,
        sampleScripts: mine ? mine.scripts : [],
        samplesOpened: mineAll.length,
        /* The section's own visible text, truncated. Every row on screen comes from the harness fixture,
           so this carries no real data -- and it is the difference between "slow" and "refused", which a
           timing number alone cannot make. */
        sectionText: sec ? String(sec.innerText || sec.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 220) : '',
        rows: r ? rows(r.ready) : -1,
        sectionActive: !!(sec && sec.classList && sec.classList.contains('active')),
        sectionHeight: sec ? Math.round(sec.getBoundingClientRect().height) : 0,
        requestsAdded: performance.getEntriesByType('resource').length - before
      });
    }

    beacon('disabling');
    var off = KM.perf.disable();
    await send({
      ok: true, boot: bootMetrics, program: log,
      pageErrors: (window.__kmErrors||[]).slice(0,25), pageErrorCount: (window.__kmErrors||[]).length,
      samples: KM.perf.samples(), summary: KM.perf.summary(),
      teardown: off, installedAfterDisable: KM.perf.installedCount(),
      listenerLeakCheck: (function(){
        // Enable/disable twice and confirm the live count returns to the same place. A wrapper that
        // re-wrapped, or a listener that was added twice, shows up here as a rising number.
        var a = KM.perf.installedCount();
        KM.perf.enable({ readySelectors: sel }); var b = KM.perf.installedCount();
        KM.perf.enable({ readySelectors: sel }); var c = KM.perf.installedCount();
        KM.perf.disable(); var d = KM.perf.installedCount();
        return { afterDisable: a, afterEnable: b, afterSecondEnable: c, afterSecondDisable: d };
      }())
    });
  }

  /* A DRIVER THAT THREW LOOKED EXACTLY LIKE A BROWSER THAT HUNG: the run simply never POSTed and the
     harness reported TIMEOUT 60 seconds later, with nothing to say what went wrong. It now reports its
     own failure, which is the difference between a diagnosis and a shrug. */
  function runGuarded(){
    return Promise.resolve().then(run).catch(function(e){
      return send({ ok: false, reason: 'DRIVER_THREW',
        message: String((e && e.message) || e).slice(0, 300),
        where: String((e && e.stack) || '').split(String.fromCharCode(10))[1] || '',
        program: log, pageErrors: (window.__kmErrors||[]).slice(0,25) });
    });
  }
  if (document.readyState === 'complete') runGuarded();
  else window.addEventListener('load', runGuarded);
}());
</script>`;

  html = html.replace('</body>', driver + '\n</body>');
  return html;
}


/**
 * THE INJECTED SCRIPTS ARE SYNTAX-CHECKED BEFORE A BROWSER IS LAUNCHED.
 *
 * Both injected blocks are built inside TEMPLATE LITERALS, and a template literal silently eats one
 * level of backslash. A regex written as /\s+/ arrives in the page as /s+/ and quietly deletes every
 * letter s from the text it was supposed to normalise; a string written as '
' arrives as a real
 * newline and makes the whole block a syntax error. Both happened in this round. The second cost six
 * 60-second TIMEOUTs that said nothing about the cause, because a page whose driver never parsed
 * looks exactly like a browser that hung.
 *
 * So the block is compiled here, in Node, before Chrome is started. A failure names the file and the
 * message instead of producing a timeout with no evidence in it.
 */
function assertInjectedScriptsParse(html, label) {
  var out = [];
  var re = /<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g;
  var m, i = 0;
  while ((m = re.exec(html))) {
    i++;
    var body = m[1];
    // Only the blocks this harness injected are its responsibility; the application's own inline
    // scripts are the application's, and one of them legitimately contains an HTML comment that this
    // deliberately simple scanner would mis-slice.
    if (body.indexOf('__kmHarness') < 0 && body.indexOf('__REQ_W') < 0
        && body.indexOf('var ROUTES =') < 0 && body.indexOf('function boxOf') < 0) continue;
    try { new Function(body); }
    catch (e) { out.push('inline#' + i + ': ' + e.message); }
  }
  if (out.length) {
    throw new Error('INJECTED_SCRIPT_SYNTAX_ERROR (' + label + '): ' + out.join(' | '));
  }
  return true;
}

// ---- driving one Chrome process ------------------------------------------------------------------

function once(browser, port, pageHtml, program, routes, timeoutMs) {
  return new Promise((resolve) => {
    const apiLog = [];
    let settled = false;
    const beacons = [];
    const srv = startServer(pageHtml, (payload) => {
      if (settled) return;
      settled = true;
      payload.apiActions = apiLog.slice(0, 60);
      payload.apiCallCount = apiLog.length;
      payload.beacons = beacons.slice(-24);
      finish(payload);
    }, apiLog, beacons);

    let child = null;
    const profile = path.join(os.tmpdir(), 'km-cp2m-r2-' + process.pid + '-' + Math.random().toString(36).slice(2, 8));
    let timer = null;

    function finish(payload) {
      if (timer) clearTimeout(timer);
      try { if (child) child.kill(); } catch (e) {}
      try { srv.close(); } catch (e) {}
      setTimeout(() => resolve(payload), 60);
    }

    try { assertInjectedScriptsParse(pageHtml, 'perf-driver'); }
    catch (e) { finish({ ok: false, reason: 'INJECTED_SCRIPT_SYNTAX_ERROR', message: e.message }); return; }
    srv.listen(port, '127.0.0.1', () => {
      const args = [
        '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-extensions',
        '--force-device-scale-factor=1', '--window-size=1440,900',
        '--user-data-dir=' + profile,
        // THE BROWSER ITSELF CANNOT REACH PRODUCTION. Every host but loopback resolves to NOTFOUND, so
        // an interception bug cannot become a live read. This is the enforcement; the fetch shim is the
        // convenience.
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
        'http://127.0.0.1:' + port + '/__page'
      ];
      child = cp.spawn(browser, args, { stdio: 'ignore' });
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        finish({ ok: false, reason: 'TIMEOUT', apiCallCount: apiLog.length,
          apiActions: apiLog.slice(0, 40), beacons: beacons.slice(-24),
          lastBeacon: beacons.length ? beacons[beacons.length - 1] : '(none)' });
      }, timeoutMs);
    });
  });
}

let nextPort = 39150;
function allocPort() { return nextPort++; }

// ---- the programs --------------------------------------------------------------------------------

/** COLD: a brand-new process that performs exactly one navigation. */
function coldProgram(key) {
  const p = [{ key: key, phase: 'cold' }];
  // Site Inventory draws nothing until a scope is chosen, so its cold program includes the choice and
  // measures the table render separately from the mount.
  if (key === 'ops') p.push({ key: key, scope: true, phase: 'cold-scoped', wait: 1800 });
  return p;
}

/** WARM: visit, leave to Home, return. Only the third step is the warm measurement. */
function warmProgram(key) {
  return [{ key: key, phase: 'prime' }, { key: 'home', phase: 'leave' }, { key: key, phase: 'warm' }];
}

/** The six Product Strategy views, after the board itself is up. */
function viewProgram(views) {
  const p = [{ key: 'product-strategy', phase: 'prime', wait: 2200 }];
  views.forEach(v => p.push({ key: 'product-strategy', view: v, phase: 'view:' + v, wait: 900 }));
  return p;
}

async function main() {
  const outDir = process.argv[2] || path.join(os.tmpdir(), 'km-cp2m-r2-perf');
  const coldN = parseInt(process.argv[3] || '5', 10);
  const warmN = parseInt(process.argv[4] || '5', 10);
  // An optional comma-separated route filter, so one misbehaving route can be isolated without
  // re-running the whole matrix. Empty means every route.
  const only = String(process.argv[5] || '').split(',').map(x => x.trim()).filter(Boolean);
  fs.mkdirSync(outDir, { recursive: true });
  const browser = findBrowser();
  if (!browser) { console.log(JSON.stringify({ ok: false, reason: 'NO_BROWSER' })); return; }

  const runs = [];
  const navRoutes = ROUTES.filter(r => r.kind !== 'boot' && (!only.length || only.indexOf(r.key) >= 0));

  for (const r of navRoutes) {
    for (let i = 0; i < coldN; i++) {
      const port = allocPort();
      const html = buildPage(port, coldProgram(r.key), ROUTES);
      const res = await once(browser, port, html, coldProgram(r.key), ROUTES, 60000);
      runs.push({ route: r.key, phase: 'cold', iteration: i, result: res });
      process.stderr.write('.');
    }
    for (let i = 0; i < warmN; i++) {
      const port = allocPort();
      const html = buildPage(port, warmProgram(r.key), ROUTES);
      const res = await once(browser, port, html, warmProgram(r.key), ROUTES, 75000);
      runs.push({ route: r.key, phase: 'warm', iteration: i, result: res });
      process.stderr.write('+');
    }
  }

  // The six Product Strategy sub-pages, in one process each.
  const psb = ROUTES.filter(r => r.views)[0];
  const runViews = !only.length || only.indexOf('product-strategy') >= 0;
  for (let i = 0; runViews && i < Math.min(coldN, 3); i++) {
    const port = allocPort();
    const prog = viewProgram(psb.views);
    const html = buildPage(port, prog, ROUTES);
    const res = await once(browser, port, html, prog, ROUTES, 90000);
    runs.push({ route: 'product-strategy-views', phase: 'views', iteration: i, result: res });
    process.stderr.write('v');
  }

  process.stderr.write('\n');
  const sha = (rel) => crypto.createHash('sha256').update(read(rel).replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
  const out = {
    ok: true, browser: path.basename(browser),
    capturedAt: new Date().toISOString().slice(0, 10),
    apiThinkTimeMs: API_MS,
    apiLatencyIsSynthetic: true,
    coldRepeats: coldN, warmRepeats: warmN,
    sources: {
      'index.html': sha('index.html'),
      'assets/js/app.js': sha('assets/js/app.js'),
      'assets/js/core/lifecycle.js': sha('assets/js/core/lifecycle.js'),
      'assets/js/core/script-loader.js': sha('assets/js/core/script-loader.js'),
      'assets/js/core/partial-loader.js': sha('assets/js/core/partial-loader.js'),
      'assets/js/core/perf-observer.js': sha('assets/js/core/perf-observer.js'),
      'assets/tests/_cp2m-r2-perf-runner.js': sha('assets/tests/_cp2m-r2-perf-runner.js')
    },
    runs: runs
  };
  fs.writeFileSync(path.join(outDir, 'perf.json'), JSON.stringify(out, null, 1), 'utf8');
  console.log(JSON.stringify({ ok: true, outDir: outDir, runs: runs.length }));
}

if (require.main === module) main();
module.exports = { ROUTES, buildPage, findBrowser, fixtureDb };
