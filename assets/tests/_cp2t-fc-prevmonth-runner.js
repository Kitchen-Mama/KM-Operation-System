/**
 * S8-B3-R3-CP2T P1 - THE prevMonth BUILDER, OPERATED IN A REAL BROWSER.
 *
 * FCB1 derived the Based period from Target and made both inputs non-editable, and FCB1-R1 accepted that
 * with node-side tests over the shipped source. Those prove the handler and the markup; they do not prove
 * that an operator who OPENS the page, switches the method and types a Target gets a page that behaves
 * that way - the partial loader, the modal, the option lists and the change handlers all sit in between.
 *
 * THE OPERATION, exactly as specified: open -> choose "Adjust From Previous Month Forecast" ->
 * Target Year 2027, Target Month January -> Based must read 2026 / December.
 *
 * WHAT IS CHECKED, and why each needs a browser rather than a source read:
 *   derived      - the Based fields hold 2026 / December after the real change handlers ran.
 *   not editable - not "the attribute is present" but TYPING INTO THEM CHANGES NOTHING: a real value is
 *                  assigned and a real `input`/`change` event dispatched, and the field must not move.
 *                  `readonly` on a number input and `disabled` on a select are different mechanisms and
 *                  only an attempt tells you both held.
 *   revocation   - Preview, then change Target, and the preview must be withdrawn and Save disabled.
 *   growth base  - switching to "Apply Growth Rate" must leave ITS Base Year/Month EDITABLE. The round
 *                  that locked one pair must not have locked the other, and that is a different pair of
 *                  elements in a different row.
 *
 * NOTHING IS SAVED. The run never clicks Save; Save is only ever READ for its disabled state, which is
 * the acceptance the Owner set for this builder.
 *
 *   node assets/tests/_cp2t-fc-prevmonth-runner.js <outDir>
 */
const http = require('http');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const sha = (rel) => crypto.createHash('sha256').update(read(rel).replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe'
];
function findBrowser() { return CHROMES.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } }); }
const MAX_HOLD_MS = 120000;

const MKT_ID = 'MP-FIXTURE-US-AMZ';
const SKUS = ['FX-001', 'FX-002', 'FX-003'];

function fcWorkspace() {
  return {
    marketplaces: [{ marketplace_id: MKT_ID, company: 'FixtureCo', country: 'US', marketplace: 'Amazon',
      marketplace_display_name: 'Amazon', status: 'active' }],
    marketplace_skus: SKUS.map((s, i) => ({ marketplace_sku_id: 'MSKU-' + i, marketplace_id: MKT_ID,
      company: 'FixtureCo', country: 'US', marketplace: 'Amazon', sku: s, site_sku: 'SS-' + i,
      marketplace_sku_status: 'active' })),
    sku_details: SKUS.map(s => ({ sku: s, product_name: s + ' Product', status: 'active', company: 'FixtureCo' })),
    /* Both the target month (2027-01) and the month BEFORE it (2026-12) carry rows, so a prevMonth preview
       has something real to read on both sides. */
    fc_regular_forecast: SKUS.map((s, i) => ({ forecast_id: 'FC-' + i, sku: s, company: 'FixtureCo',
      country: 'US', marketplace: 'Amazon', forecast_year: 2026,
      jan: 100 + i, feb: 100 + i, mar: 100 + i, apr: 100 + i, may: 100 + i, jun: 100 + i,
      jul: 100 + i, aug: 100 + i, sep: 100 + i, oct: 100 + i, nov: 100 + i, dec: 200 + i }))
      .concat(SKUS.map((s, i) => ({ forecast_id: 'FC27-' + i, sku: s, company: 'FixtureCo',
        country: 'US', marketplace: 'Amazon', forecast_year: 2027,
        jan: 10 + i, feb: 0, mar: 0, apr: 0, may: 0, jun: 0, jul: 0, aug: 0, sep: 0, oct: 0, nov: 0, dec: 0 }))),
    fc_target_rules: [], fc_special_events: [], campaigns: [], campaign_sku_lines: []
  };
}

function withCorrelation(payload, action, rid) {
  if (!payload || typeof payload !== 'object') return payload;
  const out = Object.assign({}, payload);
  out.meta = Object.assign({}, out.meta || {}, { action: action, requestId: rid || undefined });
  return out;
}
function apiAnswer(action) {
  if (action === 'getClientCapabilities') {
    return { success: true, data: { product_strategy_enabled: true, capabilitiesVersion: 'fixture-cp2t' } };
  }
  if (action === 'inventoryScope.registry.get') {
    return { success: true, data: {
      marketplaces: [{ marketplace_id: MKT_ID, company: 'FixtureCo', country: 'US', marketplace: 'Amazon',
        marketplace_display_name: 'Amazon' }],
      countries: ['US'], marketplace_ids_by_country: { US: [MKT_ID] }, empty: false, empty_reason: '' } };
  }
  if (action === 'fcSummary.workspace.get') return { success: true, data: fcWorkspace() };
  return { success: true, action: action,
    data: { rows: [], items: [], records: [], countries: ['US'], marketplaces: [], tables: {}, servedAction: action } };
}

function measureScript(capId) {
  return `
(function(){
  var CAP = ${JSON.stringify(capId)};
  var out = { capId: CAP, steps: [], notes: [], fatal: null, checks: {} };
  function now(){ return performance.now(); }
  function step(n, v){ out.steps.push({ step: n, t: +now().toFixed(1), v: v === undefined ? null : v }); return v; }
  function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
  window.alert = function(){}; window.confirm = function(){ return true; }; window.prompt = function(){ return null; };

  function waitFor(fn, ms, label){
    var t0 = now();
    return new Promise(function(res){
      (function poll(){
        var v = null; try { v = fn(); } catch(e) { v = null; }
        if (v) return res({ ok: true, waitedMs: +(now()-t0).toFixed(1), v: v });
        if (now()-t0 > ms) return res({ ok: false, waitedMs: +(now()-t0).toFixed(1), label: label });
        setTimeout(poll, 30);
      }());
    });
  }
  function $(id){ return document.getElementById(id); }
  function visible(el){ if (!el) return false; var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }
  function fire(el, type){ el.dispatchEvent(new Event(type, { bubbles: true })); }
  function setVal(el, v, type){ el.value = v; fire(el, type || 'change'); }

  /* WHAT "NOT EDITABLE" CAN AND CANNOT BE PROVED FROM INSIDE THE PAGE.
     The first version assigned el.value and concluded the field was editable when the assignment stuck.
     That measured the SCRIPT, not the operator: readonly and disabled restrain the USER AGENT, and a
     programmatic assignment bypasses both by design. It would have failed against a perfectly locked field.
     What the browser does enforce, and what is therefore checked:
       - a DISABLED control cannot take focus. That is real, browser-enforced, and observable here.
       - a readonly input CAN take focus but the UA refuses typed input; proving THAT needs real key
         injection (CDP Input), which this harness does not do - so it is reported as attributes plus
         "not reachable by keyboard", and NOT claimed as a keystroke test.
     Section FORCED below covers the case the lock cannot: if the value is changed by some other means,
     the Preview must still use the period DERIVED from Target. */
  async function probeLock(el){
    var before = el.value;
    var focusable = null;
    try { el.focus(); focusable = (document.activeElement === el); } catch(e) { focusable = null; }
    try { el.blur(); } catch(e) {}
    var forced = null;
    el.value = (el.tagName === 'SELECT') ? '5' : '1999';
    fire(el, 'input'); fire(el, 'change');
    await sleep(100);
    forced = el.value;
    el.value = before; fire(el, 'change');
    await sleep(60);
    return {
      tag: el.tagName, readOnly: !!el.readOnly, disabled: !!el.disabled, tabIndex: el.tabIndex,
      keyboardReachable: el.tabIndex >= 0,
      focusTaken: focusable,
      uaLocked: (el.tagName === 'SELECT') ? (!!el.disabled && focusable === false) : (!!el.readOnly && el.tabIndex < 0),
      programmaticAssignmentStuck: forced !== before   // expected true for BOTH - it is not a lock test
    };
  }

  function report(){
    try {
      var x = new XMLHttpRequest();
      x.open('POST', '/__measure?id=' + encodeURIComponent(CAP), true);
      x.setRequestHeader('Content-Type', 'application/json');
      x.send(JSON.stringify(out));
    } catch(e) {}
    var img = new Image(); img.src = '/__hold?id=' + encodeURIComponent(CAP);
  }

  async function go(){
    try {
      var ready = await waitFor(function(){ return typeof window.showSection === 'function' ? true : null; }, 40000, 'app');
      if (!ready.ok) { out.fatal = 'APP_NOT_READY'; return report(); }
      window.showSection('fc-summary');
      var sec = await waitFor(function(){ return $('fc-summary-section'); }, 25000, 'fc-section');
      step('fc-section', sec.ok ? sec.waitedMs : 'MISSING');
      if (!sec.ok) { out.fatal = 'NO_FC_SECTION'; return report(); }
      await sleep(900);

      /* THE OPERATOR'S PATH, not a shortcut into the builder. The first version of this runner called
         openRegularUpdateModal() directly and the builder never appeared: that opener REFUSES when the
         builder prerequisites are not loaded and re-opens the mode-select modal instead. Nobody reaches
         the builder that way - the real route is the "+ New FC Update" button, the Regular card, and
         Next, which LOADS the prerequisites and then opens the builder exactly once. Driving the real
         route is also the only way the load/switch behaviour is exercised at all. */
      var addBtn = null;
      Array.prototype.forEach.call(document.querySelectorAll('#fc-summary-section button'), function(b){
        if (!addBtn && /new fc update/i.test((b.textContent || '').trim())) addBtn = b;
      });
      out.checks.addButtonFound = !!addBtn;
      if (addBtn) addBtn.click();
      else if (typeof window.openAddEventModal === 'function') window.openAddEventModal();
      else { out.fatal = 'NO_ENTRY_POINT'; return report(); }

      var sel = await waitFor(function(){ var m = $('fc-mode-select-modal'); return (m && visible(m)) ? m : null; }, 20000, 'mode-select');
      out.checks.modeSelectVisible = sel.ok;
      step('mode-select', sel.ok ? sel.waitedMs : 'NOT_VISIBLE');
      if (!sel.ok) { out.fatal = 'MODE_SELECT_NOT_VISIBLE'; return report(); }

      var radio = document.querySelector('input[name="fc-mode"][value="regular"]');
      if (radio) { radio.checked = true; fire(radio, 'change'); }
      await sleep(150);
      var nextBtn = $('fc-mode-next-btn');
      if (!nextBtn) { out.fatal = 'NO_NEXT_BUTTON'; return report(); }
      nextBtn.click();

      /* The prerequisite load is asynchronous and may REFUSE. A refusal is a finding, not a crash, so it
         is captured with whatever the page said rather than reported as "the modal did not appear". */
      var modal = await waitFor(function(){ var m = $('fc-regular-update-modal'); return (m && visible(m)) ? m : null; }, 30000, 'builder');
      out.checks.builderVisible = modal.ok;
      if (!modal.ok) {
        var refusal = document.querySelector('#fc-mode-select-modal .fc-prereq-refusal, #fc-mode-select-modal [class*="refus"], #fc-mode-select-modal [class*="error"]');
        out.checks.prereqRefusalText = refusal ? (refusal.textContent || '').trim().slice(0, 300) : null;
        out.checks.modeSelectStillOpen = visible($('fc-mode-select-modal'));
        out.checks.nextBtnDisabled = nextBtn.disabled;
        out.fatal = 'BUILDER_NOT_VISIBLE';
        return report();
      }
      step('builder', modal.waitedMs);
      await sleep(400);

      // ---- choose the prevMonth method -------------------------------------------------------------
      var method = $('regular-update-method');
      if (!method) { out.fatal = 'NO_METHOD_SELECT'; return report(); }
      setVal(method, 'prevMonth');
      await sleep(300);
      out.checks.basedRowVisible = visible($('regular-based-row'));
      out.checks.baseRowHiddenUnderPrevMonth = !visible($('regular-base-row'));
      step('method', method.value);

      // ---- Target 2027 / January -------------------------------------------------------------------
      var ty = $('regular-target-year'), tm = $('regular-target-month');
      if (!ty || !tm) { out.fatal = 'NO_TARGET_INPUTS'; return report(); }
      ty.value = '2027'; fire(ty, 'input'); fire(ty, 'change');
      await sleep(200);
      setVal(tm, '0');                       // January
      await sleep(300);

      var by = $('regular-based-year'), bm = $('regular-based-month');
      out.checks.target = { year: ty.value, month: tm.value };
      out.checks.derived = { basedYear: by ? by.value : null, basedMonth: bm ? bm.value : null,
        basedMonthText: (bm && bm.selectedIndex >= 0 && bm.options[bm.selectedIndex]) ? bm.options[bm.selectedIndex].text : null };
      step('derived', out.checks.derived);

      // ---- neither Based field may be edited --------------------------------------------------------
      out.checks.basedYearAttrs = by ? { readOnly: !!by.readOnly, disabled: !!by.disabled, tabIndex: by.tabIndex } : null;
      out.checks.basedMonthAttrs = bm ? { readOnly: !!bm.readOnly, disabled: !!bm.disabled, tabIndex: bm.tabIndex } : null;
      out.checks.basedYearLock = by ? await probeLock(by) : null;
      out.checks.basedMonthLock = bm ? await probeLock(bm) : null;

      // ---- the SCOPE, because a Preview with no scope has nothing to preview -------------------------
      // The first run reported "no preview" and that was the harness, not the page: the builder opened
      // with no country / marketplace / SKU chosen, which is a refusal the operator would also get.
      var rc = $('regular-country'), rm = $('regular-marketplace');
      if (rc && rc.options.length) {
        for (var ci = 0; ci < rc.options.length; ci++) if (rc.options[ci].value) { setVal(rc, rc.options[ci].value); break; }
        await sleep(400);
      }
      if (rm && rm.options.length) {
        for (var mi = 0; mi < rm.options.length; mi++) if (rm.options[mi].value) { setVal(rm, rm.options[mi].value); break; }
        await sleep(400);
      }
      out.checks.scope = { country: rc ? rc.value : null, marketplace: rm ? rm.value : null };
      var skuEl = $('regular-sku');
      if (skuEl) {
        var dl = $('regular-sku-datalist');
        var firstSku = (dl && dl.options && dl.options.length) ? dl.options[0].value : 'FX-001';
        skuEl.value = firstSku; fire(skuEl, 'input'); fire(skuEl, 'change');
        await sleep(400);
      }
      out.checks.sku = skuEl ? skuEl.value : null;
      out.checks.skuOptionCount = ($('regular-sku-datalist') && $('regular-sku-datalist').options) ? $('regular-sku-datalist').options.length : 0;

      // ---- Preview, then change Target: the preview must be withdrawn -------------------------------
      var prevBtn = null;
      var btns = document.querySelectorAll('#fc-regular-update-modal button, #fc-regular-update-modal .fc-btn');
      Array.prototype.forEach.call(btns, function(b){
        if (!prevBtn && /preview/i.test((b.textContent || '').trim())) prevBtn = b;
      });
      out.checks.previewButtonFound = !!prevBtn;
      var save = $('regular-save-btn');
      if (prevBtn) {
        prevBtn.click();
        var prev = await waitFor(function(){ var p = $('regular-preview'); return (p && visible(p)) ? p : null; }, 15000, 'preview');
        out.checks.previewShown = prev.ok;
        out.checks.previewHtmlLen = prev.ok ? (prev.v.innerHTML || '').length : 0;
        out.checks.saveEnabledAfterPreview = save ? !save.disabled : null;
        await sleep(300);

        // change the Target YEAR - the preview that was computed for the old one must not survive
        ty.value = '2028'; fire(ty, 'input'); fire(ty, 'change');
        await sleep(500);
        out.checks.previewVisibleAfterTargetChange = visible($('regular-preview'));
        out.checks.saveDisabledAfterTargetChange = save ? !!save.disabled : null;
        out.checks.derivedAfterYearChange = { basedYear: by ? by.value : null, basedMonth: bm ? bm.value : null };
      }

      // ---- FORCED: if the locked field is changed by other means, Preview must ignore it ------------
      // The lock stops the operator. It does not stop a script, an extension, or a future code path - and
      // FCB1's actual repair was that Preview DERIVES the period from Target rather than reading the
      // field back out of the DOM. That is the defence worth testing, because it holds when the lock does not.
      if (bm && ty && tm) {
        ty.value = '2027'; fire(ty, 'input'); fire(ty, 'change'); await sleep(150);
        setVal(tm, '0'); await sleep(250);
        bm.value = '5'; fire(bm, 'change');          // force June into the locked field
        by.value = '1999'; fire(by, 'input'); fire(by, 'change');
        await sleep(200);
        if (prevBtn) {
          prevBtn.click();
          var p2 = await waitFor(function(){ var p = $('regular-preview'); return (p && visible(p)) ? p : null; }, 15000, 'preview2');
          out.checks.forcedPreviewShown = p2.ok;
          out.checks.forcedPreviewText = p2.ok ? (p2.v.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 400) : null;
          out.checks.basedAfterForcedPreview = { year: by.value, month: bm.value };
        }
      }

      // ---- Apply Growth Rate keeps ITS OWN base editable --------------------------------------------
      setVal(method, 'actual');
      await sleep(350);
      var gy = $('regular-base-year'), gm = $('regular-base-month');
      out.checks.growthRowVisible = visible($('regular-base-row'));
      out.checks.growthBaseYearAttrs = gy ? { readOnly: !!gy.readOnly, disabled: !!gy.disabled } : null;
      out.checks.growthBaseMonthAttrs = gm ? { readOnly: !!gm.readOnly, disabled: !!gm.disabled } : null;
      if (gy) { var b0 = gy.value; gy.value = '2025'; fire(gy, 'input'); fire(gy, 'change'); await sleep(150);
        out.checks.growthBaseYearEditable = gy.value === '2025'; gy.value = b0; fire(gy, 'change'); }
      if (gm) { gm.value = '3'; fire(gm, 'change'); await sleep(150);
        out.checks.growthBaseMonthEditable = gm.value === '3'; }

      step('done', out.checks);
      report();
    } catch (e) { out.fatal = String(e && e.message || e); try { report(); } catch (e2) {} }
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(go, 0);
  else window.addEventListener('DOMContentLoaded', function(){ setTimeout(go, 0); });
}());
`;
}

function buildPage(port, capId) {
  let html = read('index.html');
  html = html.replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/[^"']+/g, 'http://127.0.0.1:' + port + '/__stub.js');
  const preamble = `
<script>
(function(){
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
}());
</script>`;
  const first = html.indexOf('<script');
  html = html.slice(0, first) + preamble + '\n' + html.slice(first);
  html = html.replace('</body>', '<script>' + measureScript(capId) + '</script>\n</body>');
  return html;
}

function startServer(pages, held, results, cfg) {
  return http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    const p = decodeURIComponent(u.pathname);
    const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    if (p === '/__measure') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        const id = u.searchParams.get('id') || '';
        try { results[id] = JSON.parse(body); } catch (e) { results[id] = { parseError: String(e.message) }; }
        res.writeHead(204); res.end();
        const h = held[id];
        if (h) { delete held[id]; clearTimeout(h.timer); h.release('measured'); }
      });
      return;
    }
    if (p === '/__hold') {
      const id = u.searchParams.get('id') || '';
      const release = (why) => { try { res.writeHead(200, { 'Content-Type': 'image/gif', 'X-Release': why }); res.end(GIF); } catch (e) {} };
      const timer = setTimeout(() => { if (held[id]) { delete held[id]; release('timeout'); } }, MAX_HOLD_MS);
      held[id] = { release, timer };
      return;
    }
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
    if (pages[p]) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(pages[p]); return; }
    const fp = path.join(ROOT, p.replace(/^\//, ''));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      const ext = path.extname(fp).toLowerCase();
      const type = ext === '.js' ? 'text/javascript' : ext === '.css' ? 'text/css'
        : ext === '.html' ? 'text/html' : ext === '.json' ? 'application/json' : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(fs.readFileSync(fp));
      return;
    }
    res.writeHead(404); res.end('nf');
  });
}

function runChromeAsync(browser, args, timeoutMs) {
  return new Promise(resolve => {
    const child = cp.spawn(browser, args, { stdio: 'ignore' });
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; try { child.kill(); } catch (e) {} resolve('timeout'); } }, timeoutMs);
    child.on('exit', () => { if (!done) { done = true; clearTimeout(t); resolve('exit'); } });
  });
}

async function main() {
  const outDir = process.argv[2];
  if (!outDir) { console.error('usage: node _cp2t-fc-prevmonth-runner.js <outDir>'); process.exit(2); }
  fs.mkdirSync(outDir, { recursive: true });
  const browser = findBrowser();
  if (!browser) { console.error('no Chrome found'); process.exit(3); }

  const cfg = { log: [], t0: Date.now() };
  const pages = {}, held = {}, results = {};
  const capId = 'fcprev-' + Date.now();
  const srv = startServer(pages, held, results, cfg);
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  pages['/__page'] = buildPage(port, capId);

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cp2t-fc-'));
  const why = await runChromeAsync(browser, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=' + profile, '--window-size=1600,1000',
    'http://127.0.0.1:' + port + '/__page'
  ], 180000);

  const r = results[capId] || { fatal: 'NO_RESULT (' + why + ')' };
  const evidence = {
    round: 'S8-B3-R3-CP2T P1',
    what: 'FC Regular builder, prevMonth: derived Based period, non-editability, preview revocation, growth base still editable',
    takenAt: new Date().toISOString(), browser: browser,
    sources: {
      'index.html': sha('index.html'),
      'assets/js/pages/fc-summary.js': sha('assets/js/pages/fc-summary.js'),
      'assets/html/pages/fc-summary.html': sha('assets/html/pages/fc-summary.html')
    },
    actionLog: cfg.log, result: r
  };
  fs.writeFileSync(path.join(outDir, 'fc-prevmonth.json'), JSON.stringify(evidence, null, 2));
  srv.close();

  const c = r.checks || {};
  console.log('\n== CP2T P1: FC prevMonth, real browser ==');
  console.log('fatal :', r.fatal || 'none');
  if (r.notes && r.notes.length) console.log('notes :', r.notes.join(' | '));
  console.log(JSON.stringify(c, null, 1));
  const want = [
    ['basedRowVisible', c.basedRowVisible === true],
    ['derived 2026/December', c.derived && c.derived.basedYear === '2026' && c.derived.basedMonthText === 'December'],
    ['based year UA-locked (readonly + off the tab order)', c.basedYearLock && c.basedYearLock.uaLocked === true],
    ['based month UA-locked (disabled + cannot take focus)', c.basedMonthLock && c.basedMonthLock.uaLocked === true],
    ['preview shown', c.previewShown === true],
    ['preview revoked on Target change', c.previewVisibleAfterTargetChange === false],
    ['save disabled after Target change', c.saveDisabledAfterTargetChange === true],
    ['growth base year editable', c.growthBaseYearEditable === true],
    ['growth base month editable', c.growthBaseMonthEditable === true]
  ];
  let bad = 0;
  want.forEach(([n, v]) => { if (!v) bad++; console.log((v ? 'ok   ' : 'FAIL ') + n); });
  console.log('\nwrote ' + path.join(outDir, 'fc-prevmonth.json'));
  process.exitCode = (bad === 0 && !r.fatal) ? 0 : 1;
}

main();
