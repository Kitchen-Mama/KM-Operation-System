/* FX1-R4-R1 §5 — THE ADMINISTRATION PAGE'S ROUND TRIP, ACROSS EVERY REAL LAYER.
 *
 * WHAT THIS IS FOR. FX1-R4 shipped the page with 234 assertions on 75_ and 49 on the 04_ wiring, and
 * every one of them passed while the page could not save a non-empty book at all. Both halves were
 * verified; the SEAM between them was not, and the seam is where all four R4-R1 defects lived:
 *
 *   - the page never sent a per-row `version`, which 75_ requires, so every save of a non-empty book
 *     was refused — and refused with FX_VERSION_INVALID, which the page's conflict test matched, so
 *     the operator was told "somebody else saved this" and sent to reload, forever;
 *   - a SUCCESSFUL save returns a different envelope from a GET, and the page adopted it the same way,
 *     so the currencies, the capacity meter and `may_edit` were all cleared by success;
 *   - the change log read changed_at/changed_by/old_rate/new_rate, none of which 75_ emits.
 *
 * None of that is visible to a source probe or to a handler unit test. It needs the SHIPPED page, the
 * SHIPPED adapter, the SHIPPED 75_ and a real browser, which is what this runner assembles:
 *
 *   index.html + assets/js/** (served as-is)  ->  real KM.DB.getFxRateBook / saveFxRateBook
 *      ->  real _kmGapRead_ POST  ->  /__api  ->  real handleFxRateBookGet_ / handleFxRateBookSave_
 *      ->  an IN-MEMORY Property store.
 *
 * ISOLATED IO, ALWAYS. There is no PropertiesService, no SpreadsheetApp and no network here: the io is
 * an object literal in this file. Nothing this runner does can reach a real Property or a real price,
 * which is why it is safe to run it on a developer machine during a round that is forbidden to write.
 *
 * THE BOOK STARTS NON-EMPTY, at doc_version 3, because an EMPTY book saves fine — rates:[] has no
 * entries to validate — and that is exactly why FX1-R4's own checks never caught the missing version.
 *
 * Run: node assets/tests/_fx1-r4r1-roundtrip-runner.js <outDir> [--identity a@b.c] [--no-authority]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const cp = require('child_process');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '../..');
const GS = p => path.join(ROOT, 'assets/specs/active/apps-script', p);
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const sha = p => { try { return crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, p))).digest('hex').slice(0, 16); } catch (e) { return null; } };

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe'
];
function findBrowser() { return CHROMES.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } }); }
function arg(name, dflt) { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; }

/* ===================================================================================================
   THE BACKEND: the real 75_, in a sandbox, over an in-memory store.

   Built the same way verify-75-fx-rate-book.js builds it — the named 73_ declarations lifted out by a
   balanced-brace scan, then the whole of 75_ on top. fxBookDefaultIo_ is never called: every handler
   here is passed the isolated io explicitly, so a regression that made 75_ reach for a real Property
   would throw rather than quietly succeed.
   =================================================================================================== */
function extract(src, header) {
  const i = src.indexOf(header);
  if (i < 0) throw new Error('not found: ' + header);
  let depth = 0, started = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') { depth++; started = true; }
    else if (c === '}') { depth--; if (started && depth === 0) return src.slice(i, j + 1) + (header.startsWith('var') ? ';' : ''); }
  }
  throw new Error('unbalanced: ' + header);
}

function buildBackend() {
  const SRC73 = fs.readFileSync(GS('73_api_v1_pricing_write.gs'), 'utf8');
  const SRC75 = fs.readFileSync(GS('75_api_v1_fx_rate_book.gs'), 'utf8');
  const REUSED = [
    'var PRICING_FX_DECIMALS_ = {',
    'function pricingStr_(',
    'function pricingReadNumber_(',
    'function pricingDecimalsFor_(',
    'function pricingFxPairKey_(',
    'function pricingBuildRateTable_('
  ].map(h => extract(SRC73, h)).join('\n\n');
  const STUBS = `
var LockService = { getScriptLock: function () { return {
  tryLock: function () { return true; }, releaseLock: function () {} }; } };
`;
  return new Function(STUBS + '\n' + REUSED + '\n' + SRC75 + '\n' + `
return { get: handleFxRateBookGet_, save: handleFxRateBookSave_,
         byteLen: fxBookByteLen_, PROP: FX_BOOK_PROP_KEY_, EDITORS: FX_BOOK_EDITORS_PROP_KEY_ };`)();
}

// The isolated store. `user()` is what a deployment that CAN identify its caller returns; the
// --no-authority run leaves it empty, which is the deployment §6 says must stay read-only.
function makeIo(identity) {
  const store = {};
  return {
    get: k => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    set: (k, v) => { store[k] = String(v); },
    user: () => identity || '',
    raw: () => store
  };
}

// THE SEED. Two pairs, one of them with a closed period, at doc_version 3 — a book somebody has already
// been maintaining, which is the only kind a round-trip test can be about.
const SEED_RATES = [
  { base_currency: 'USD', quote_currency: 'JPY', rate: 158.02, source: 'manual', as_of: '2026-10-01',
    effective_from: '2026-10-01', effective_to: '', status: 'active', version: 2 },
  { base_currency: 'USD', quote_currency: 'CAD', rate: 1.37, source: 'manual', as_of: '2026-09-01',
    effective_from: '2026-09-01', effective_to: '2026-09-30', status: 'inactive', version: 1 }
];

/* ===================================================================================================
   THE PAGE SCRIPT — what is driven, in order, and what is recorded at each step.
   =================================================================================================== */
function measureScript(capId, opts) {
  return `
(function(){
  var CAP = ${JSON.stringify(capId)};
  var OPT = ${JSON.stringify(opts)};
  var out = { cap: CAP, phases: [], notes: [], fatal: null, steps: [] };
  function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
  function el(id){ return document.getElementById(id); }
  function txt(id){ var e = el(id); return e ? String(e.textContent || '').trim() : null; }
  function waitFor(fn, ms, label){
    var t0 = Date.now();
    return new Promise(function(res, rej){
      (function poll(){
        var v; try { v = fn(); } catch(e) { v = null; }
        if (v) return res(v);
        if (Date.now() - t0 > ms) return rej(new Error('timeout waiting for ' + label));
        setTimeout(poll, 40);
      }());
    });
  }
  function st(){ var p = window.KM && window.KM.fxRateBookPage; return p ? p._state : null; }

  // WHAT THE PAGE IS ACTUALLY SHOWING, read off the DOM rather than off the state object. The state
  // can be right while the render is stale, and three of the four defects are visible only here.
  function snap(label){
    var s = st() || {};
    var tableHost = el('fx-book-table');
    var rows = tableHost ? tableHost.querySelectorAll('tbody tr') : [];
    var sel0 = tableHost ? tableHost.querySelector('select[data-f="base_currency"]') : null;
    var rate0 = tableHost ? tableHost.querySelector('input[data-f="rate"]') : null;
    var logHost = el('fx-book-logbody');
    var logRows = logHost ? logHost.querySelectorAll('tbody tr') : [];
    var logCells = [];
    Array.prototype.slice.call(logRows, 0, 6).forEach(function(tr){
      logCells.push(Array.prototype.map.call(tr.querySelectorAll('td'), function(td){
        return String(td.textContent || '').trim(); }));
    });
    var warnHost = el('fx-book-warnings');
    var warnCodes = warnHost && !warnHost.hidden
      ? Array.prototype.map.call(warnHost.querySelectorAll('code'), function(c){ return String(c.textContent||'').trim(); })
      : [];
    var authHost = el('fx-book-authority');
    var p = {
      label: label,
      loaded: !!s.loaded,
      mayEdit: !!s.mayEdit,
      docVersion: (s.docVersion === undefined ? null : s.docVersion),
      stateRows: (s.rates || []).length,
      // THE PER-ROW VERSION, as the working copy holds it. A row that lost it cannot be saved, and
      // "lost it" is not visible anywhere else on the page.
      stateVersions: (s.rates || []).map(function(r){ return (r && r.version === undefined) ? '<<missing>>' : r.version; }),
      currencies: (s.currencies || []).length,
      logEntries: (s.log || []).length,
      capacityState: s.capacity ? (Number(s.capacity.used_bytes) + '/' + Number(s.capacity.limit_bytes)) : null,
      authorityReason: s.authorityReason === undefined ? null : s.authorityReason,
      domRows: rows.length,
      // THE CURRENCY SELECT. When supported_currencies is cleared, the select renders with ONE blank
      // option and the stored currency is no longer selectable — so the next save would send ''.
      domCurrencyOptions: sel0 ? sel0.options.length : null,
      domCurrencyValue: sel0 ? sel0.value : null,
      domRateValue: rate0 ? rate0.value : null,
      domSaveDisabled: el('fx-book-save') ? !!el('fx-book-save').disabled : null,
      domAddDisabled: el('fx-book-add') ? !!el('fx-book-add').disabled : null,
      domRemoveButtons: tableHost ? tableHost.querySelectorAll('button[data-drop]').length : null,
      domCapacityText: txt('fx-book-capacity'),
      domVersionText: txt('fx-book-version'),
      domSaveState: txt('fx-book-savestate'),
      domAuthorityVisible: authHost ? !authHost.hidden : null,
      domAuthorityText: authHost && !authHost.hidden ? String(authHost.textContent||'').trim().slice(0, 160) : null,
      domLogRows: logRows.length,
      domLogFirstRow: logCells[0] || null,
      domLogCells: logCells,
      domLogNote: logHost ? String(logHost.textContent||'').trim().slice(0, 80) : null,
      warnCodes: warnCodes
    };
    out.phases.push(p);
    return p;
  }

  function setField(i, f, value){
    var host = el('fx-book-table');
    var e = host ? host.querySelector('[data-i="' + i + '"][data-f="' + f + '"]') : null;
    if (!e) { out.notes.push('no field ' + i + '/' + f); return false; }
    e.value = value;
    e.dispatchEvent(new Event(e.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    return true;
  }

  function mark(label){
    return fetch('/__mark?label=' + encodeURIComponent(label)).then(function(){}, function(){});
  }

  async function go(){
    try {
      await waitFor(function(){ return window.KM && window.KM.lifecycle && window.KM.fxRateBookPage; }, 30000, 'KM + page');
      out.steps.push('shell-ready');

      // THE REAL ROUTE. showSection is what the menu entry calls; nothing here mounts the page by hand.
      if (typeof window.showSection === 'function') window.showSection('fx-rate-book');
      else await window.KM.lifecycle.switchTo('fx-rate-book-section');
      out.steps.push('switched');

      await waitFor(function(){ var s = st(); return s && s.loaded; }, 30000, 'page loaded');
      await sleep(400);
      await mark('opened');
      snap('opened');

      // ---- 1. EDIT, then SAVE ------------------------------------------------------------------
      setField(0, 'rate', '159.5');
      await sleep(120);
      snap('edited');

      await mark('save-1');
      el('fx-book-save').click();
      // The save is over when the page stops being busy, whichever way it went.
      await waitFor(function(){ var s = st(); return s && !s.busy; }, 20000, 'save 1 settled');
      await sleep(300);
      snap('saved-1');

      // ---- 2. CONTINUE EDITING on the same page, without reloading -----------------------------
      // This is the step the broken adopt() made impossible: a successful save disabled the editor.
      var afterSave = st() || {};
      if (afterSave.mayEdit) {
        setField(0, 'source', 'ecb');
        await sleep(80);
        el('fx-book-add').click();
        await sleep(120);
        var n = (st().rates || []).length - 1;
        setField(n, 'base_currency', 'USD');
        setField(n, 'quote_currency', 'EUR');
        setField(n, 'rate', '0.92');
        setField(n, 'as_of', '2026-10-20');
        setField(n, 'effective_from', '2026-10-20');
        setField(n, 'status', 'active');
        await sleep(120);
        snap('continued');

        await mark('save-2');
        el('fx-book-save').click();
        await waitFor(function(){ var s = st(); return s && !s.busy; }, 20000, 'save 2 settled');
        await sleep(300);
        snap('saved-2');
      } else {
        out.notes.push('save 1 left the page read-only — continue-editing not reachable');
        snap('continued-blocked');
      }

      // ---- 3. RELOAD: what the server really holds ----------------------------------------------
      await mark('reload');
      await window.KM.fxRateBookPage.reload();
      await sleep(300);
      snap('reloaded');

      // ---- 3b. REMOVE a pair and save, so the change log's THIRD kind is exercised. A log that can
      // render an addition and an edit still cannot be trusted to render a removal, and a removal is
      // the entry somebody will one day need most.
      if ((st() || {}).mayEdit) {
        var host = el('fx-book-table');
        var x = host ? host.querySelector('button[data-drop="1"]') : null;
        if (x) { x.click(); await sleep(150); } else { out.notes.push('no remove button for row 1'); }
        snap('row-removed');
        await mark('save-3');
        el('fx-book-save').click();
        await waitFor(function(){ var s = st(); return s && !s.busy; }, 20000, 'save 3 settled');
        await sleep(300);
        snap('saved-3');
      }

      // ---- 4. A REAL CONFLICT, and a validation refusal that is NOT one -------------------------
      // The server is told to bump the stored book behind this tab's back. The page is then holding a
      // stale doc_version and a save must be refused as FX_VERSION_CONFLICT — the ONE case where
      // "somebody else saved this" is the truth.
      if ((st() || {}).mayEdit) {
        await fetch('/__bump');
        setField(0, 'rate', '160.25');
        await sleep(80);
        el('fx-book-save').click();
        await waitFor(function(){ var s = st(); return s && !s.busy; }, 20000, 'conflict settled');
        await sleep(250);
        snap('conflict');

        // Now re-read (so the version is fresh) and send something the VALIDATOR refuses. The message
        // must name that refusal, not announce a competing editor.
        await window.KM.fxRateBookPage.reload();
        await sleep(250);
        setField(0, 'effective_to', '2020-01-01');   // before effective_from -> FX_EFFECTIVE_RANGE_INVERTED
        await sleep(80);
        el('fx-book-save').click();
        await waitFor(function(){ var s = st(); return s && !s.busy; }, 20000, 'invalid settled');
        await sleep(250);
        snap('invalid-not-conflict');
      }

      out.steps.push('done');
      report();
    } catch (e) {
      out.fatal = String(e && e.message || e);
      try { snap('fatal'); } catch (e2) {}
      try { report(); } catch (e3) {}
    }
  }

  function report(){
    try {
      fetch('/__measure?id=' + encodeURIComponent(CAP), { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(out) });
    } catch (e) {}
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(go, 0);
  else window.addEventListener('DOMContentLoaded', function(){ setTimeout(go, 0); });
}());
`;
}

function buildPage(port, capId, opts) {
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
  html = html.replace('</body>', '<script>' + measureScript(capId, opts) + '</script>\n</body>');
  return html;
}

/* =================================================================================================== */
function startServer(pages, held, results, cfg, onMeasured) {
  return http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    const p = decodeURIComponent(u.pathname);

    if (p === '/__measure') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        const id = u.searchParams.get('id') || '';
        try { results[id] = JSON.parse(body); } catch (e) { results[id] = { parseError: String(e.message) }; }
        res.writeHead(204); res.end();
        if (typeof onMeasured === 'function') setTimeout(onMeasured, 150);
      });
      return;
    }
    if (p === '/__mark') {
      cfg.marks.push({ label: u.searchParams.get('label') || '', atCall: cfg.calls.length });
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}');
      return;
    }
    // A COMPETING EDITOR, staged server-side. The page cannot see this happen, which is the point: a
    // conflict the harness announced to the page would not be a conflict.
    if (p === '/__bump') {
      const doc = JSON.parse(cfg.io.get(cfg.be.PROP));
      doc.doc_version = Number(doc.doc_version) + 1;
      doc.rates[0].rate = 157.01;
      cfg.io.set(cfg.be.PROP, JSON.stringify(doc));
      cfg.bumps++;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, doc_version: doc.doc_version }));
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
        const kmBody = u.searchParams.get('km_body');
        let dto = {};
        try { dto = JSON.parse(kmBody || body || '{}'); } catch (e) { dto = {}; }
        action = action || dto.action || '';

        let answer;
        if (action === 'fxRateBook.get') {
          answer = cfg.be.get(dto, cfg.io);
        } else if (action === 'fxRateBook.save') {
          answer = cfg.be.save(dto, cfg.io);
        } else {
          answer = { success: true, data: { rows: [], items: [], records: [], countries: [], marketplaces: [], tables: {} } };
        }

        // THE SERVER'S OWN RECORD of what the page sent and what it was told. "The page did not send a
        // version" is then an observation here rather than an inference from a refusal.
        if (action === 'fxRateBook.get' || action === 'fxRateBook.save') {
          const sent = (dto.payload && typeof dto.payload === 'object') ? dto.payload : {};
          cfg.calls.push({
            n: cfg.calls.length + 1,
            action: action,
            sentDocVersion: sent.doc_version === undefined ? '<<absent>>' : sent.doc_version,
            sentDocVersionType: typeof sent.doc_version,
            sentRowCount: Array.isArray(sent.rates) ? sent.rates.length : null,
            sentRowKeys: Array.isArray(sent.rates) && sent.rates[0] ? Object.keys(sent.rates[0]) : null,
            sentRowVersions: Array.isArray(sent.rates)
              ? sent.rates.map(r => (r && r.version === undefined ? '<<missing>>' : r.version)) : null,
            sentRowCurrencies: Array.isArray(sent.rates)
              ? sent.rates.map(r => String((r && r.base_currency) || '') + '>' + String((r && r.quote_currency) || '')) : null,
            ok: answer.success === true,
            errorCodes: (answer.errors || []).map(e => e.code),
            dataKeys: answer.data ? Object.keys(answer.data) : null,
            storedDocVersion: (() => { try { return JSON.parse(cfg.io.get(cfg.be.PROP) || '{}').doc_version; } catch (e) { return null; } })()
          });
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(answer));
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

function runChromeAsync(browser, args, timeoutMs, onChild) {
  return new Promise(resolve => {
    const child = cp.spawn(browser, args, { stdio: 'ignore' });
    let done = false;
    const finish = (why) => { if (done) return; done = true; clearTimeout(t); try { child.kill(); } catch (e) {} resolve(why); };
    const t = setTimeout(() => finish('timeout'), timeoutMs);
    child.on('exit', () => { if (!done) { done = true; clearTimeout(t); resolve('exit'); } });
    if (typeof onChild === 'function') onChild(function () { finish('measured'); });
  });
}

/* ===================================================================================================
   THE VERDICT — a pure function of the capture, so the suite and this runner cannot disagree.
   =================================================================================================== */
function evaluateRun(ev) {
  const failures = [];
  const ph = {};
  (ev.result && ev.result.phases || []).forEach(p => { ph[p.label] = p; });
  const calls = ev.serverCalls || [];
  const saves = calls.filter(c => c.action === 'fxRateBook.save');

  // A READ-ONLY RUN IS JUDGED BY READ-ONLY RULES. Running the editor's checklist over a deployment
  // that cannot identify its caller would print a wall of failures about a page behaving exactly as
  // §6 requires - and a verdict that is wrong in the safe direction is still a verdict nobody reads.
  if (ev.readOnlyExpected) {
    const o0 = ph['opened'];
    if (!o0) { failures.push('phase missing: opened'); return { failures, exitCode: 1 }; }
    if (o0.mayEdit) failures.push('read-only: an unidentifiable caller was granted may_edit');
    if (!o0.domSaveDisabled) failures.push('read-only: the save button was live');
    if (!o0.domAddDisabled) failures.push('read-only: the add-row button was live');
    if (o0.domRemoveButtons !== 0) failures.push('read-only: row removal controls were rendered');
    if (!o0.domAuthorityVisible) failures.push('read-only: no refusal band was shown');
    if (o0.authorityReason !== 'FX_AUTHORITY_UNVERIFIABLE')
      failures.push('read-only: the refusal was not named FX_AUTHORITY_UNVERIFIABLE, got ' + o0.authorityReason);
    // READING IS NOT GATED ON WRITING. The rates must still be on screen: refusing to show somebody
    // the coefficients that price the catalogue is a different decision, and not this one.
    if (!o0.domRows) failures.push('read-only: the stored rates were not shown at all');
    if (saves.length) failures.push('read-only: ' + saves.length + ' save request(s) reached the server');
    const stored = (ev.finalStored || {}).doc_version;
    if (stored !== 3) failures.push('read-only: the stored book moved from the seed, now at ' + stored);
    return { failures, exitCode: failures.length ? 1 : 0 };
  }

  const need = ['opened', 'edited', 'saved-1', 'continued', 'saved-2', 'reloaded'];
  need.forEach(k => { if (!ph[k]) failures.push('phase missing: ' + k); });
  if (ev.result && ev.result.fatal) failures.push('fatal: ' + ev.result.fatal);

  const o = ph['opened'], s1 = ph['saved-1'], c = ph['continued'], s2 = ph['saved-2'], r = ph['reloaded'];
  if (o) {
    if (!o.mayEdit) failures.push('opened: the identity on the allowlist was not granted may_edit');
    if (o.stateRows !== 2) failures.push('opened: expected the 2 seeded rows, got ' + o.stateRows);
    if ((o.stateVersions || []).some(v => v === '<<missing>>')) failures.push('opened: a loaded row lost its per-row version');
    if (!o.currencies) failures.push('opened: no supported currencies reached the page');
  }
  if (s1) {
    if (!saves[0] || !saves[0].ok) failures.push('save 1 was REFUSED: ' + JSON.stringify(saves[0] && saves[0].errorCodes));
    if (!s1.mayEdit) failures.push('saved-1: a successful save revoked may_edit');
    if (o && s1.currencies !== o.currencies) failures.push('saved-1: the currency list was cleared by success');
    if (!s1.capacityState) failures.push('saved-1: the capacity meter was cleared by success');
    if (s1.domSaveDisabled) failures.push('saved-1: the save button was disabled by a successful save');
    if (s1.domAuthorityVisible) failures.push('saved-1: the read-only band appeared after a successful save');
    if (o && !(s1.docVersion > o.docVersion)) failures.push('saved-1: doc_version did not advance');
  }
  if (c && c.stateRows !== 3) failures.push('continued: the added row is not in the working copy');
  if (s2) {
    if (!saves[1] || !saves[1].ok) failures.push('save 2 was REFUSED: ' + JSON.stringify(saves[1] && saves[1].errorCodes));
    if (s2.stateRows !== 3) failures.push('saved-2: the saved book does not hold 3 rows');
  }
  if (r) {
    if (r.stateRows !== 3) failures.push('reloaded: the server does not hold the 3 rows that were saved');
    if (String(r.domRateValue) !== '159.5') failures.push('reloaded: the edited rate did not survive, got ' + r.domRateValue);
    if (!r.domLogRows) failures.push('reloaded: the change log rendered no rows');
    if ((r.domLogFirstRow || []).some(cell => cell === '' || cell === undefined))
      failures.push('reloaded: the change log rendered a blank cell — ' + JSON.stringify(r.domLogFirstRow));
  }
  const rm = ph['saved-3'];
  if (rm) {
    if (!saves[2] || !saves[2].ok) failures.push('save 3 (the removal) was REFUSED: ' + JSON.stringify(saves[2] && saves[2].errorCodes));
    if (rm.stateRows !== 2) failures.push('saved-3: the removal did not reduce the book to 2 rows, got ' + rm.stateRows);
    const top = rm.domLogFirstRow || [];
    if (top[3] !== 'REMOVED') failures.push('saved-3: the newest change log entry is not a REMOVED, got ' + JSON.stringify(top[3]));
    if (top.some(cell => cell === '' || cell === undefined || cell === null))
      failures.push('saved-3: the REMOVED entry rendered a blank cell — ' + JSON.stringify(top));
  }
  const cf = ph['conflict'], iv = ph['invalid-not-conflict'];
  if (cf) {
    if (!(cf.warnCodes || []).includes('FX_VERSION_CONFLICT')) failures.push('conflict: not reported as FX_VERSION_CONFLICT');
    if (!/somebody else|someone else/i.test(String(cf.domSaveState || ''))) failures.push('conflict: the competing-editor message was not shown');
  }
  if (iv) {
    if (/somebody else|someone else/i.test(String(iv.domSaveState || '')))
      failures.push('invalid: a plain validation refusal was reported as a competing editor');
    if (!(iv.warnCodes || []).length) failures.push('invalid: no refusal code was shown at all');
  }
  return { failures, exitCode: failures.length ? 1 : 0 };
}

/* =================================================================================================== */
async function main() {
  const outDir = process.argv[2];
  if (!outDir) { console.error('usage: node _fx1-r4r1-roundtrip-runner.js <outDir> [--identity x] [--no-authority] [--name f.json]'); process.exit(2); }
  fs.mkdirSync(outDir, { recursive: true });
  const browser = findBrowser();
  if (!browser) { console.error('no Chrome found'); process.exit(3); }

  const NO_AUTH = process.argv.indexOf('--no-authority') !== -1;
  const identity = NO_AUTH ? '' : arg('--identity', 'fx.editor@example.test');

  const be = buildBackend();
  const io = makeIo(identity);
  io.set(be.EDITORS, 'fx.editor@example.test, someone.else@example.test');
  io.set(be.PROP, JSON.stringify({ shape: 1, doc_version: 3, rates: SEED_RATES, log: [] }));

  const cfg = { calls: [], marks: [], io, be, bumps: 0 };
  const pages = {}, held = {}, results = {};
  const capId = 'fxrt-' + Date.now();
  let closeBrowser = null;
  const srv = startServer(pages, held, results, cfg, function () { if (closeBrowser) closeBrowser(); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  pages['/__page'] = buildPage(port, capId, { identity: identity, seeded: SEED_RATES.length });

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fx1-r4r1-'));
  const why = await runChromeAsync(browser, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=' + profile, '--window-size=1600,1000',
    'http://127.0.0.1:' + port + '/__page'
  ], 180000, function (stop) { closeBrowser = stop; });

  const r = results[capId] || { fatal: 'NO_RESULT (' + why + ')' };
  let finalDoc = null;
  try { finalDoc = JSON.parse(io.get(be.PROP)); } catch (e) {}

  const evidence = {
    round: 'FX1-R4-R1',
    what: 'FX Rate Book Administration page: the full save -> continue -> save -> reload round trip, '
        + 'shipped page + real adapter + real 75_ + isolated in-memory IO',
    takenAt: new Date().toISOString(),
    browser: browser,
    identity: identity || '(none — unidentifiable caller)',
    readOnlyExpected: NO_AUTH,
    seed: { doc_version: 3, rates: SEED_RATES.length },
    sources: {
      'index.html': sha('index.html'),
      'assets/js/pages/fx-rate-book.js': sha('assets/js/pages/fx-rate-book.js'),
      'assets/html/pages/fx-rate-book.html': sha('assets/html/pages/fx-rate-book.html'),
      'assets/js/api/operation-system-db-api.js': sha('assets/js/api/operation-system-db-api.js'),
      'assets/specs/active/apps-script/75_api_v1_fx_rate_book.gs': sha('assets/specs/active/apps-script/75_api_v1_fx_rate_book.gs'),
      // THE HARNESS PINS ITSELF, so two captures are comparable only if the same scenarios drove them.
      'assets/tests/_fx1-r4r1-roundtrip-runner.js': sha('assets/tests/_fx1-r4r1-roundtrip-runner.js')
    },
    serverCalls: cfg.calls,
    marks: cfg.marks,
    competingSaves: cfg.bumps,
    // WHAT THE STORE REALLY HOLDS at the end. The page's claim about the book and the book are two
    // different things, and only one of them is the record.
    //
    // THE RAW VALUE IS KEPT AS WELL, verbatim, because a summary of a document is not the document: the
    // cross-layer suite feeds this straight into 04_'s Property store, and a reconstruction missing one
    // envelope field - `shape`, say - is refused by fxBookReadDoc_ and would turn a chain into two
    // similar numbers sitting next to each other.
    finalStoredRaw: io.get(be.PROP),
    finalStored: finalDoc ? { doc_version: finalDoc.doc_version, rates: finalDoc.rates, log: finalDoc.log } : null,
    result: r
  };
  const outName = arg('--name', NO_AUTH ? 'roundtrip-unidentified.json' : 'roundtrip.json');
  fs.writeFileSync(path.join(outDir, outName), JSON.stringify(evidence, null, 2));

  if (typeof srv.closeAllConnections === 'function') srv.closeAllConnections();
  srv.close();

  console.log('\n== FX1-R4-R1 round trip ==');
  console.log('identity          :', evidence.identity);
  console.log('fatal             :', r.fatal || 'none');
  if (r.notes && r.notes.length) console.log('notes             :', r.notes.join(' | '));
  (r.phases || []).forEach(p => {
    console.log('  ' + String(p.label).padEnd(22)
      + ' v=' + JSON.stringify(p.docVersion)
      + ' rows=' + p.stateRows
      + ' rowVer=' + JSON.stringify(p.stateVersions)
      + ' cur=' + p.currencies
      + ' mayEdit=' + p.mayEdit
      + ' saveDis=' + p.domSaveDisabled
      + ' cap=' + JSON.stringify(p.capacityState)
      + ' log=' + p.domLogRows
      + ' warn=' + JSON.stringify(p.warnCodes));
  });
  console.log('\nserver calls:');
  cfg.calls.forEach(c => console.log('  #' + c.n + ' ' + c.action.padEnd(18)
    + ' ok=' + c.ok + ' sentV=' + JSON.stringify(c.sentDocVersion)
    + ' rows=' + c.sentRowCount + ' rowVersions=' + JSON.stringify(c.sentRowVersions)
    + ' stored=' + c.storedDocVersion + ' err=' + JSON.stringify(c.errorCodes)));
  console.log('\nfinal stored doc_version:', finalDoc ? finalDoc.doc_version : null,
    ' rates:', finalDoc ? finalDoc.rates.length : null, ' log:', finalDoc ? finalDoc.log.length : null);

  const ev = evaluateRun(evidence);
  if (ev.failures.length) {
    console.log('\n== WHY THIS RUN FAILED ==');
    ev.failures.forEach(f => console.log('  ' + f));
  } else {
    console.log('\nround trip COMPLETE — no failures');
  }
  console.log('\nwrote ' + path.join(outDir, outName));
  process.exitCode = ev.exitCode;
}

module.exports = { evaluateRun: evaluateRun, SEED_RATES: SEED_RATES };
if (require.main === module) main();
