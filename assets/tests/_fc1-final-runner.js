/**
 * ==================================================================================================
 * FC1-FINAL — THE TWO READ-ONLY REFERENCE COLUMNS, OPERATED IN A REAL CHROME.
 * ==================================================================================================
 *
 * The production index.html and FC Summary page, served locally; every API call answers from a FIXTURE
 * (FixtureCo / US / Amazon, three SKUs, Regular FC for 2026 and 2027, three Special Event rows). The
 * fixture exists only here: nothing in the shipped page knows of it, and no history source is connected,
 * so every new cell must read "—" with its reason. Save is NEVER clicked; it is only read for its state.
 *
 *   P  New FC Update -> Regular -> Next. Apply Growth Rate, Target Oct 2027, Preview: the column reads
 *      "Actual Sales (Oct 2026)", sits between Category / Series and Current Forecast, every cell is a dash
 *      with its state and tooltip, and Save is still enabled (the empty column blocks nothing).
 *      Previous Month and Manual: the same. Target -> Jan 2028: "Actual Sales (Jan 2027)", nothing of
 *      Oct 2026 left. Last Year Same Month Actual: Preview refused by name, no table, Save disabled.
 *      The modal still fits: Save and Cancel are reachable, the table does not push the modal wider.
 *   E  Special Event tab: FC Qty, Actual Qty, Achievement % in that order; every new cell a dash with its
 *      reason; the header and body columns stay aligned after a horizontal scroll to the end; the Columns
 *      menu offers both and hides / re-shows them; a preference saved before they existed (event-period
 *      hidden) keeps its choice and does not hide them; Edit Event FC keeps exactly one input per row and
 *      the two new cells read-only; Cancel leaves edit without a write.
 *   W  every request the page made is a read.
 *
 * Widths: 1440 (desktop) and 820 (narrow).
 * MODES  node assets/tests/_fc1-final-runner.js <outDir> [before]
 *   `before` serves fc-summary.js, fc-summary.html and fc-overview.css AS THEY WERE AT BASE_REF, from git,
 *   in memory; the checks this round adds are expected to fail there.
 * ==================================================================================================
 */
'use strict';
const http = require('http');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const BASE_REF = '2af8d156';
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const sha = (rel) => crypto.createHash('sha256').update(read(rel).replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
const SOURCES = ['index.html', 'assets/js/pages/fc-summary.js', 'assets/html/pages/fc-summary.html', 'assets/css/pages/fc-overview.css',
  'assets/tests/_fc1-final-runner.js'];
const SWAPPED = ['assets/js/pages/fc-summary.js', 'assets/html/pages/fc-summary.html', 'assets/css/pages/fc-overview.css'];
const WIDTHS = [1440, 820];
const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe'
];
function findBrowser() { return CHROMES.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } }); }
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

const MKT_ID = 'MP-FIXTURE-US-AMZ';
const SKUS = ['FX-001', 'FX-002', 'FX-003'];
function fcWorkspace() {
  return {
    marketplaces: [{ marketplace_id: MKT_ID, company: 'FixtureCo', country: 'US', marketplace: 'Amazon', marketplace_display_name: 'Amazon', status: 'active' }],
    marketplace_skus: SKUS.map((s, i) => ({ marketplace_sku_id: 'MSKU-' + i, marketplace_id: MKT_ID, company: 'FixtureCo', country: 'US',
      marketplace: 'Amazon', sku: s, site_sku: 'SS-' + i, marketplace_sku_status: 'active' })),
    sku_details: SKUS.map(s => ({ sku: s, product_name: s + ' Product', status: 'active', company: 'FixtureCo', category: 'Fixture Category', series: 'FXS' })),
    fcRegularForecast: [2026, 2027].reduce((acc, y) => acc.concat(SKUS.map((s, i) => ({ forecast_id: 'FC' + y + '-' + i, sku: s, company: 'FixtureCo',
      country: 'US', marketplace: 'Amazon', year: y, jan: 100 + i, feb: 100 + i, mar: 100 + i, apr: 100 + i, may: 100 + i, jun: 100 + i,
      jul: 100 + i, aug: 100 + i, sep: 100 + i, oct: 300 + i, nov: 100 + i, dec: 200 + i }))), []),
    fcTargetRules: [],
    fcSpecialEvents: SKUS.map((s, i) => ({ event_fc_id: 'EFC-' + i, campaign_id: 'CMP-FX-BFCM', campaign_sku_line_id: 'CSL-' + i,
      marketplace_id: MKT_ID, company: 'FixtureCo', country: 'US', marketplace: 'Amazon', sku: s, category: 'Fixture Category', series: 'FXS',
      year: 2026, event_name: 'BFCM 2026', event_period: '2026-11-19~2026-11-30', event_start_date: '2026-11-19', event_end_date: '2026-11-30',
      fc_qty: i === 2 ? 0 : 40 + i })),
    campaigns: [], campaign_sku_lines: []
  };
}
function withCorrelation(payload, action, rid) {
  const out = Object.assign({}, payload);
  out.meta = Object.assign({}, out.meta || {}, { action: action, requestId: rid || undefined });
  return out;
}
function apiAnswer(action) {
  if (action === 'getClientCapabilities') return { success: true, data: { product_strategy_enabled: true, capabilitiesVersion: 'fixture-fc1-final' } };
  if (action === 'inventoryScope.registry.get') {
    return { success: true, data: { marketplaces: [{ marketplace_id: MKT_ID, company: 'FixtureCo', country: 'US', marketplace: 'Amazon', marketplace_display_name: 'Amazon' }],
      countries: ['US'], marketplace_ids_by_country: { US: [MKT_ID] }, empty: false, empty_reason: '' } };
  }
  if (action === 'fcSummary.workspace.get') return { success: true, data: fcWorkspace() };
  return { success: true, action: action, data: { rows: [], items: [], records: [], countries: ['US'], marketplaces: [], tables: {}, servedAction: action } };
}

function buildPage(port, prefScript) {
  let html = read('index.html');
  html = html.replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/[^"']+/g, 'http://127.0.0.1:' + port + '/__stub.js');
  const preamble = `
<script>
(function(){
  ${prefScript || ''}
  var LOCAL='http://127.0.0.1:${port}';
  var _f=window.fetch;
  window.fetch=function(input,init){
    var url=(typeof input==='string')?input:(input&&input.url)||'';
    if(/^https?:\\/\\//i.test(url)&&url.indexOf(LOCAL)!==0){
      var qs=url.indexOf('?')>=0?url.slice(url.indexOf('?')):'';
      return _f.call(this,LOCAL+'/__api'+qs,init);
    }
    return _f.apply(this,arguments);
  };
  window.alert=function(){}; window.confirm=function(){ return true; };
}());
</script>`;
  const first = html.indexOf('<script');
  return html.slice(0, first) + preamble + '\n' + html.slice(first);
}

function startServer(cfg) {
  return http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    const p = decodeURIComponent(u.pathname);
    if (p === '/__stub.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('window.Chart=window.Chart||function(){return{destroy:function(){},update:function(){},resize:function(){},data:{},options:{}};};'
        + 'window.Chart.register=window.Chart.register||function(){};window.ExcelJS=window.ExcelJS||{Workbook:function(){}};');
      return;
    }
    if (p === '/__api') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        let action = u.searchParams.get('action') || '';
        let rid = u.searchParams.get('km_rid') || '';
        const kmBody = u.searchParams.get('km_body');
        if (kmBody) { try { const j = JSON.parse(kmBody); action = action || j.action || ''; rid = rid || j.requestId || ''; } catch (e) {} }
        if (!action && body) { try { const j = JSON.parse(body); action = j.action || ''; rid = rid || j.requestId || ''; } catch (e) {} }
        cfg.log.push({ action: action, t: Date.now() - cfg.t0 });
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(withCorrelation(apiAnswer(action), action, rid)));
      });
      return;
    }
    if (cfg.pages[p]) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(cfg.pages[p]); return; }
    const rel = p.replace(/^\//, '');
    if (cfg.swap[rel] !== undefined) {
      const ext = path.extname(rel).toLowerCase();
      res.writeHead(200, { 'Content-Type': (ext === '.js' ? 'text/javascript' : ext === '.css' ? 'text/css' : 'text/html') + '; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(cfg.swap[rel]);
      return;
    }
    const fp = path.join(ROOT, rel);
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      const ext = path.extname(fp).toLowerCase();
      const type = ext === '.js' ? 'text/javascript' : ext === '.css' ? 'text/css' : ext === '.html' ? 'text/html'
        : ext === '.json' ? 'application/json' : ext === '.png' ? 'image/png' : ext === '.svg' ? 'image/svg+xml' : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type + (/^(text|application\/json)/.test(type) ? '; charset=utf-8' : ''), 'Cache-Control': 'no-store' });
      res.end(fs.readFileSync(fp));
      return;
    }
    res.writeHead(404); res.end('nf');
  });
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0; const pending = {};
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending[d.id]) { const p = pending[d.id]; delete pending[d.id]; if (d.error) p.rej(new Error(JSON.stringify(d.error))); else p.res(d.result); } };
  const open = new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  return { send: (method, params) => open.then(() => new Promise((res, rej) => {
    const my = ++id; pending[my] = { res, rej };
    ws.send(JSON.stringify({ id: my, method, params: params || {} }));
    setTimeout(() => { if (pending[my]) { delete pending[my]; rej(new Error('CDP timeout: ' + method)); } }, 30000);
  })) };
}

async function main() {
  const out = process.argv[2] ? path.resolve(process.argv[2]) : null;
  const mode = process.argv[3] === 'before' ? 'before' : 'after';
  if (!out) { console.error('usage: node _fc1-final-runner.js <outDir> [before]'); process.exit(2); }
  fs.mkdirSync(out, { recursive: true });
  const browser = findBrowser();
  if (!browser) { console.error('STOP: no Chrome found'); process.exit(3); }
  const ev = { round: 'FC1-FINAL', mode, base_ref: BASE_REF, takenAt: new Date().toISOString(), browser,
    data: 'FIXTURE (FixtureCo / US / Amazon), served by this runner only; no history source is connected', sources: {}, steps: [], checks: [] };
  SOURCES.forEach(f => { ev.sources[f] = sha(f); });
  const check = (name, okv, got) => ev.checks.push({ name, ok: !!okv, got: got === undefined ? null : got });
  const step = (name, data) => ev.steps.push({ name, data: data === undefined ? null : data });

  const cfg = { log: [], t0: Date.now(), pages: {}, swap: {} };
  if (mode === 'before') SWAPPED.forEach(rel => { cfg.swap[rel] = cp.execFileSync('git', ['show', BASE_REF + ':' + rel], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e8 }); });
  const srv = startServer(cfg);
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  cfg.pages['/__page'] = buildPage(port, '');
  // A preference written BEFORE these columns existed: the Event table's Event Period hidden, Regular Sep hidden.
  cfg.pages['/__page-oldpref'] = buildPage(port, "try{localStorage.setItem('km.ui.fcSummary.hiddenColumns.v1', JSON.stringify({v:1,hidden:{'fc-event':['event-period'],'fc-regular':['sep']}}));}catch(e){}");

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fc1-final-'));
  const chrome = cp.spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    '--force-device-scale-factor=1', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--window-size=1440,1000', 'about:blank'], { stdio: 'ignore' });
  const portFile = path.join(profile, 'DevToolsActivePort');
  const t0 = Date.now();
  while (!fs.existsSync(portFile) || !fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0]) {
    if (Date.now() - t0 > 20000) { console.error('Chrome did not open a DevTools port'); process.exit(3); }
    await delay(100);
  }
  const dport = fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0];
  const list = await (await fetch('http://127.0.0.1:' + dport + '/json/list')).json();
  const client = cdp(list.filter(t => t.type === 'page')[0].webSocketDebuggerUrl);
  await client.send('Page.enable'); await client.send('Runtime.enable');
  const js = async (expr) => {
    const r = await client.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
    return r.result.value;
  };
  const waitFor = async (expr, ms) => { const s = Date.now(); for (;;) { const v = await js(expr); if (v) return v; if (Date.now() - s > (ms || 20000)) throw new Error('timed out waiting for ' + expr); await delay(100); } };
  const shot = async (name) => { const r = await client.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(r.data, 'base64')); };
  const H = `
    window.__h = {
      $: function(id){ return document.getElementById(id); },
      vis: function(el){ if (!el) return false; var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; },
      fire: function(el, t){ el.dispatchEvent(new Event(t, { bubbles: true })); },
      set: function(id, v){ var el = document.getElementById(id); if (!el) return 'NO ' + id; el.value = v; this.fire(el, 'input'); this.fire(el, 'change'); return el.value; },
      btn: function(root, re){ var b = null; Array.prototype.forEach.call((root || document).querySelectorAll('button'), function(x){ if (!b && re.test((x.textContent || '').trim()) && window.__h.vis(x)) b = x; }); return b; },
      preview: function(){
        var box = document.getElementById('regular-preview'); var t = box && box.querySelector('table.fc-assist-preview-table:not([data-fc-preview-refused])');
        var save = document.getElementById('regular-save-btn');
        var out = { shown: !!(box && window.__h.vis(box)), table: !!t, save: save ? !save.disabled : null,
          help: ((document.getElementById('regular-manual-help') || {}).textContent || '').trim().slice(0, 300) };
        if (!t) return out;
        out.heads = Array.prototype.map.call(t.querySelectorAll('thead th'), function(th){ return th.textContent.trim(); });
        out.headTitle = (t.querySelector('thead th.fc-prev-ly') || {}).title || null;
        out.rows = Array.prototype.map.call(t.querySelectorAll('tbody tr'), function(tr){ var c = tr.querySelector('td.fc-prev-ly');
          return { cells: tr.children.length, text: c ? c.textContent : null, state: c ? c.getAttribute('data-fc-history-state') : null,
            period: c ? c.getAttribute('data-fc-ref-period') : null, title: c ? c.title : null, idx: c ? Array.prototype.indexOf.call(tr.children, c) : -1,
            inputs: tr.querySelectorAll('input').length }; });
        out.html = box.innerHTML.length;
        return out;
      },
      modalFit: function(){
        var m = document.querySelector('#fc-regular-update-modal .fc-modal-content') || document.getElementById('fc-regular-update-modal');
        var save = document.getElementById('regular-save-btn'), cancel = document.querySelector('#fc-regular-update-modal .fc-btn--cancel');
        var box = document.getElementById('regular-preview'); var t = box && box.querySelector('table');
        var mr = m.getBoundingClientRect();
        var clipped = [];
        if (t) Array.prototype.forEach.call(t.querySelectorAll('th, td'), function(c){ if (c.scrollWidth > c.clientWidth + 1 && getComputedStyle(c).whiteSpace === 'nowrap' && getComputedStyle(c).overflow !== 'visible') clipped.push(c.textContent.trim().slice(0, 40)); });
        var th = t ? t.querySelector('th.fc-prev-ly') : null, thr = th ? th.getBoundingClientRect() : null;
        return { modalW: Math.round(mr.width), viewW: window.innerWidth, modalInside: mr.left >= -0.5 && mr.right <= window.innerWidth + 0.5,
          tableW: t ? Math.round(t.getBoundingClientRect().width) : null, boxW: box ? Math.round(box.clientWidth) : null,
          boxScrollW: box ? box.scrollWidth : null, boxOverflowX: box ? getComputedStyle(box).overflowX : null,
          headInBox: thr ? (thr.right <= box.getBoundingClientRect().right + 0.5 || box.scrollWidth > box.clientWidth) : null,
          headWraps: th ? th.getClientRects().length > 1 || th.scrollHeight > th.clientHeight + 1 : null,
          saveReachable: !!save && save.getClientRects().length > 0, cancelReachable: !!cancel && cancel.getClientRects().length > 0, clipped: clipped };
      },
      eventTable: function(){
        var hdr = document.getElementById('fc-event-scroll-header'), body = document.getElementById('fc-event-scroll-body');
        var heads = Array.prototype.filter.call(hdr.children, function(c){ return c.classList.contains('header-cell'); });
        var rows = body.querySelectorAll('.scroll-row');
        var shownHeads = heads.filter(function(h){ return getComputedStyle(h).display !== 'none'; }).map(function(h){ return h.textContent.trim(); });
        var r0 = rows[0];
        var cells = r0 ? Array.prototype.filter.call(r0.children, function(c){ return c.classList.contains('scroll-cell'); }) : [];
        var newCells = Array.prototype.map.call(body.querySelectorAll('.fc-evt-history'), function(c){
          return { col: c.getAttribute('data-fc-evt-col'), text: c.textContent.trim(), state: c.getAttribute('data-fc-history-state'), title: c.title,
            shown: getComputedStyle(c).display !== 'none', inputs: c.querySelectorAll('input').length, ro: c.classList.contains('fc-cell-readonly') }; });
        var align = [];
        heads.forEach(function(h, i){ var c = cells[i]; if (!c || getComputedStyle(h).display === 'none') return;
          var a = h.getBoundingClientRect(), b = c.getBoundingClientRect(); align.push({ label: h.textContent.trim(), dx: Math.round(a.left - b.left), dw: Math.round(a.width - b.width) }); });
        var inputsPerRow = Array.prototype.map.call(rows, function(r){ return r.querySelectorAll('input').length; });
        return { labels: heads.map(function(h){ return h.textContent.trim(); }), shownHeads: shownHeads, rows: rows.length, cellsRow0: cells.length,
          newCells: newCells, align: align, inputsPerRow: inputsPerRow,
          headTitles: heads.slice(-2).map(function(h){ return h.title; }) };
      },
      scrollEventEnd: function(){
        var vp = document.querySelector('#fc-panel-event .table-body-bar .scroll-col') || document.querySelector('#fc-panel-event .scroll-body-viewport')
          || (document.getElementById('fc-event-scroll-body') || {}).parentElement;
        var cands = Array.prototype.filter.call(document.querySelectorAll('#fc-panel-event *'), function(e){ return e.scrollWidth > e.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(e).overflowX); });
        var el = cands[0] || vp; if (!el) return null;
        el.scrollLeft = el.scrollWidth; el.dispatchEvent(new Event('scroll'));
        return { scrolled: el.className || el.id, left: el.scrollLeft, sw: el.scrollWidth, cw: el.clientWidth };
      }
    }; true;`;

  async function load(page, width) {
    await client.send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    await client.send('Page.navigate', { url: 'http://127.0.0.1:' + port + page });
    await waitFor("typeof window.showSection === 'function'", 40000);
    await js(H);
    await js("window.showSection('fc-summary'); true");
    await waitFor("!!document.getElementById('fc-summary-section')", 25000);
    await delay(1500);
    await js(H);
  }
  async function openBuilder() {
    const opened = await js("(function(){ var b = window.__h.btn(document.getElementById('fc-summary-section'), /new fc update/i); if (!b) return false; b.click(); return true; })()");
    await waitFor("window.__h.vis(document.getElementById('fc-mode-select-modal'))", 20000);
    await js("(function(){ var r = document.querySelector('input[name=\"fc-mode\"][value=\"regular\"]'); r.click(); return true; })()");
    await delay(200);
    await js("document.getElementById('fc-mode-next-btn').click(); true");
    await waitFor("window.__h.vis(document.getElementById('fc-regular-update-modal'))", 30000);
    await delay(400);
    // scope: the first country and marketplace; one typed SKU (Single mode, the builder's default)
    await js("(function(){ var rc = document.getElementById('regular-country'); for (var i=0;i<rc.options.length;i++) if (rc.options[i].value) { window.__h.set('regular-country', rc.options[i].value); break; } return true; })()");
    await delay(400);
    await js("(function(){ var rm = document.getElementById('regular-marketplace'); for (var i=0;i<rm.options.length;i++) if (rm.options[i].value) { window.__h.set('regular-marketplace', rm.options[i].value); break; } return true; })()");
    await delay(400);
    await js("(function(){ var s = document.getElementById('regular-sku'); if (s) { s.value = 'FX-001'; window.__h.fire(s, 'input'); window.__h.fire(s, 'change'); } return true; })()");
    await delay(300);
    return opened;
  }
  async function target(year, month) { await js(`window.__h.set('regular-target-year', '${year}'); window.__h.set('regular-target-month', '${month}'); true`); await delay(350); }
  async function method(m) { await js(`window.__h.set('regular-update-method', '${m}'); true`); await delay(350); }
  async function previewClick() {
    await js("(function(){ var b = window.__h.btn(document.getElementById('fc-regular-update-modal'), /preview/i); if (b) b.click(); return !!b; })()");
    await delay(600);
    return js('window.__h.preview()');
  }
  const expectHeads = (lbl, cur) => ['SKU', 'Category / Series', 'Actual Sales (' + lbl + ')', 'Current Forecast (' + cur + ')', 'New Forecast', 'Change'];

  try {
    for (const w of WIDTHS) {
      await load('/__page', w);
      const opened = await openBuilder();
      check(`P ${w}: the builder opened by the operator's route (+ New FC Update -> Regular -> Next)`, opened);
      // Apply Growth Rate, Base Oct 2026, Target Oct 2027
      await method('actual');
      await js("window.__h.set('regular-base-year', '2026'); window.__h.set('regular-base-month', '9'); window.__h.set('regular-growth-rate', '10'); true");
      await target(2027, 9);
      let p = await previewClick();
      step(`${w} growth preview`, p);
      check(`P ${w} Apply Growth Rate: the column is "Actual Sales (Oct 2026)", between Category / Series and Current Forecast`, p.table && JSON.stringify(p.heads) === JSON.stringify(expectHeads('Oct 2026', 'Oct 2027')), p.heads);
      check(`P ${w} Apply Growth Rate: every cell is a dash, never 0`, p.rows && p.rows.length > 0 && p.rows.every(r => r.text === '—' && r.idx === 2), p.rows);
      check(`P ${w} Apply Growth Rate: each cell names its state (not connected) and period (2026-10)`, p.rows && p.rows.every(r => r.state === 'FC_HISTORY_NOT_CONNECTED' && r.period === '2026-10' && /not connected yet \(phase 2\)/.test(r.title)), p.rows && p.rows[0]);
      check(`P ${w} Apply Growth Rate: the heading's tooltip says it is reference only and not connected`, /Reference only/.test(p.headTitle || '') && /not connected yet/.test(p.headTitle || ''), p.headTitle);
      check(`P ${w} Apply Growth Rate: the empty column blocks nothing — Save is enabled`, p.save === true, p.save);
      const fit = await js('window.__h.modalFit()');
      step(`${w} modal fit`, fit);
      check(`P ${w}: the modal stays inside the window, Save and Cancel reachable`, fit.modalInside && fit.saveReachable && fit.cancelReachable, fit);
      check(`P ${w}: the table fits its box or scrolls inside it; no nowrap cell is cut`, (fit.boxScrollW <= fit.boxW + 1 || /auto|scroll/.test(fit.boxOverflowX)) && fit.clipped.length === 0, fit);
      await js("(function(){ var b = document.getElementById('regular-preview'); if (b) b.scrollIntoView({ block: 'center' }); return true; })()");
      await delay(200);
      await shot(`${mode}-${w}-P-growth-oct2027`);
      // Previous Month
      await method('prevMonth');
      p = await js('window.__h.preview()');
      check(`P ${w}: switching the method withdraws the old Preview`, !p.table, p);
      p = await previewClick();
      step(`${w} prevMonth preview`, p);
      check(`P ${w} Previous Month: the same column, "Actual Sales (Oct 2026)", a dash in every row`, p.table && JSON.stringify(p.heads) === JSON.stringify(expectHeads('Oct 2026', 'Oct 2027')) && p.rows.every(r => r.text === '—'), p.heads);
      // Target moves: Jan 2028 -> Jan 2027
      await target(2028, 0);
      p = await js('window.__h.preview()');
      check(`P ${w}: changing the Target withdraws the old Preview`, !p.table, p);
      p = await previewClick();
      step(`${w} prevMonth Jan 2028`, p);
      check(`P ${w}: Target Jan 2028 reads "Actual Sales (Jan 2027)" and nothing of Oct 2026 is left`, p.table && p.heads[2] === 'Actual Sales (Jan 2027)'
        && p.rows.every(r => r.period === '2027-01') && !(await js("document.getElementById('regular-preview').innerHTML.indexOf('Oct 2026') !== -1")), p.heads);
      // Manual
      await method('manual');
      await target(2027, 9);
      p = await previewClick();
      step(`${w} manual preview`, p);
      check(`P ${w} Manual: the same column, a dash, and the New Forecast inputs still there`, p.table && JSON.stringify(p.heads) === JSON.stringify(expectHeads('Oct 2026', 'Oct 2027'))
        && p.rows.every(r => r.text === '—' && r.inputs === 1), p.rows);
      await shot(`${mode}-${w}-P-manual-oct2027`);
      // Last Year Same Month Actual: refused by name
      await method('lastYearActual');
      p = await previewClick();
      step(`${w} lastYearActual`, p);
      check(`P ${w} Last Year Same Month Actual: Preview refused by name, no table, Save disabled`, !p.table && p.save === false && /FC_HISTORY_METHOD_NOT_AVAILABLE/.test(p.help), p);
      await js("(function(){ var c = document.querySelector('#fc-regular-update-modal .fc-btn--cancel'); if (c) c.click(); return true; })()");
      await delay(400);

      // ---- Special Events ----
      await js("(function(){ var t = document.querySelector('.fc-tab[data-tab=\"event\"]'); t.click(); return true; })()");
      await delay(500);
      await js("(function(){ var y = document.getElementById('fc-filter-year') || document.querySelector('#fc-summary-section select[id*=\"year\"]'); if (y) { for (var i=0;i<y.options.length;i++) if (y.options[i].value === '2026') { y.value = '2026'; window.__h.fire(y, 'change'); } } return true; })()");
      await delay(800);
      let t = await js('window.__h.eventTable()');
      step(`${w} event table`, t);
      check(`E ${w}: FC Qty, then Actual Qty, then Achievement %`, JSON.stringify(t.labels.slice(-3)) === JSON.stringify(['FC Qty', 'Actual Qty', 'Achievement %']), t.labels);
      check(`E ${w}: every row renders the two new cells, each a dash with the not-connected reason`, t.rows > 0 && t.newCells.length === t.rows * 2
        && t.newCells.every(c => c.text === '—' && c.state === 'FC_HISTORY_NOT_CONNECTED' && /not connected yet \(phase 2\)/.test(c.title)), t.newCells.slice(0, 2));
      check(`E ${w}: the headers explain both columns`, /event's start day to its end day/.test(t.headTitles[0] || '') && /Actual Qty \/ FC Qty x 100/.test(t.headTitles[1] || ''), t.headTitles);
      check(`E ${w}: header and body columns are aligned`, t.align.length === 11 && t.align.every(a => Math.abs(a.dx) <= 1 && Math.abs(a.dw) <= 1), t.align);
      await shot(`${mode}-${w}-E-special-events`);
      const sc = await js('window.__h.scrollEventEnd()');
      await delay(300);
      t = await js('window.__h.eventTable()');
      step(`${w} event table scrolled to the end`, { sc, align: t.align });
      check(`E ${w}: scrolled to the far right, header and body still aligned`, t.align.length === 11 && t.align.every(a => Math.abs(a.dx) <= 1 && Math.abs(a.dw) <= 1), { sc, align: t.align });
      await shot(`${mode}-${w}-E-special-events-scrolled-end`);
      // Columns menu: both offered; hide Actual Qty, header + body go; re-show
      await js("document.getElementById('fc-display-btn').click(); true");
      await delay(300);
      const menu = await js("Array.prototype.map.call(document.querySelectorAll('#fc-display-panel .fc-display-cb'), function(c){ return { key: c.getAttribute('data-colkey'), on: c.checked }; })");
      step(`${w} columns menu`, menu);
      check(`E ${w}: the Columns menu offers Actual Qty and Achievement %, both on`, menu.some(m => m.key === 'actual-qty' && m.on) && menu.some(m => m.key === 'achievement-pct' && m.on), menu);
      await js("(function(){ var c = document.querySelector('#fc-display-panel .fc-display-cb[data-colkey=\"actual-qty\"]'); if (c) c.click(); return !!c; })()");
      await delay(300);
      t = await js('window.__h.eventTable()');
      check(`E ${w}: hiding Actual Qty hides its header and its cells, and nothing else`, t.shownHeads.indexOf('Actual Qty') === -1 && t.shownHeads.length === 10
        && t.newCells.filter(c => c.col === 'actual-qty').every(c => !c.shown) && t.newCells.filter(c => c.col === 'achievement-pct').every(c => c.shown), t.shownHeads);
      await shot(`${mode}-${w}-E-columns-menu-actual-hidden`);
      await js("(function(){ var c = document.querySelector('#fc-display-panel .fc-display-cb[data-colkey=\"actual-qty\"]'); if (c) c.click(); return !!c; })()");
      await delay(300);
      t = await js('window.__h.eventTable()');
      check(`E ${w}: and re-showing it brings both back, aligned`, t.shownHeads.length === 11 && t.align.every(a => Math.abs(a.dx) <= 1 && Math.abs(a.dw) <= 1), t.shownHeads);
      await js("document.getElementById('fc-display-btn').click(); true");
      await delay(200);
      // Edit Event FC: one input per row, the new cells read-only; Cancel, never Save
      await js("(function(){ var b = document.getElementById('fc-event-edit-btn'); if (b) b.click(); return !!b; })()");
      await delay(500);
      t = await js('window.__h.eventTable()');
      step(`${w} edit mode`, { inputsPerRow: t.inputsPerRow, newCells: t.newCells.slice(0, 2) });
      check(`E ${w} Edit Event FC: exactly one input per row (FC Qty); the two new cells read-only, a dash`, t.inputsPerRow.length > 0 && t.inputsPerRow.every(n => n === 1)
        && t.newCells.length === t.rows * 2 && t.newCells.every(c => c.inputs === 0 && c.ro && c.text === '—'), t);
      check(`E ${w} Edit Event FC: header and body still aligned`, t.align.length === 11 && t.align.every(a => Math.abs(a.dx) <= 1 && Math.abs(a.dw) <= 1), t.align);
      await shot(`${mode}-${w}-E-edit-mode`);
      await js("(function(){ var b = document.getElementById('fc-event-cancel-btn'); if (b) b.click(); return !!b; })()");
      await delay(500);
      t = await js('window.__h.eventTable()');
      check(`E ${w}: Cancel leaves edit mode`, t.inputsPerRow.every(n => n === 0), t.inputsPerRow);
    }

    // ---- an OLD preference: written before these columns existed ----
    await load('/__page-oldpref', 1440);
    await js("(function(){ var t = document.querySelector('.fc-tab[data-tab=\"event\"]'); t.click(); return true; })()");
    await delay(800);
    const t2 = await js('window.__h.eventTable()');
    const pref = await js("localStorage.getItem('km.ui.fcSummary.hiddenColumns.v1')");
    step('old preference', { shownHeads: t2.shownHeads, pref });
    check('E an old preference: its choice (Event Period hidden) is kept', t2.shownHeads.indexOf('Event Period') === -1, t2.shownHeads);
    check('E an old preference: Actual Qty and Achievement % are shown, not silently hidden', t2.shownHeads.indexOf('Actual Qty') > -1 && t2.shownHeads.indexOf('Achievement %') > -1, t2.shownHeads);
    check('E an old preference: nothing else in it was cleared (Regular Sep still hidden)', pref && JSON.parse(pref).hidden['fc-regular'].indexOf('sep') > -1, pref);
    await shot(`${mode}-1440-E-old-preference`);
  } catch (e) {
    check('the run completed without an exception', false, String(e && e.stack || e));
  }

  // getTable is the legacy table READ: operation-system-db-api.js classifies it 'read' on every path.
  const reads = /\.get$|^getClientCapabilities$|^system\.health$|^getTable$/;
  const actions = cfg.log.map(x => x.action);
  step('wire', actions);
  check('W zero writes: every request the page made is a read', actions.length > 0 && actions.every(a => reads.test(a)), actions.filter(a => !reads.test(a)));

  const failed = ev.checks.filter(c => !c.ok);
  ev.summary = { checks: ev.checks.length, failed: failed.length };
  fs.writeFileSync(path.join(out, 'fc1-final.json'), JSON.stringify(ev, null, 2));
  console.log('FC1-FINAL [' + mode + '] ' + (ev.checks.length - failed.length) + '/' + ev.checks.length + ' checks');
  failed.forEach(c => console.log('  FAIL ' + c.name + '  ' + JSON.stringify(c.got).slice(0, 300)));
  try { chrome.kill(); } catch (e) {}
  srv.close();
  setTimeout(() => process.exit(mode === 'after' && failed.length ? 1 : 0), 300);
}

if (require.main === module) main();
