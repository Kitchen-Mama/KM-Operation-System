// =============================================================================================================
// S8-R4B-2 — SITE INVENTORY CONTROLLED SEARCH EVIDENCE
//
// Drives the REAL shipped Search path in a real browser and measures it. No synthetic raw-table read ever
// substitutes for the handler: every sample goes
//
//   searchReplenishment()
//     -> _irWorkspaceRefresh_({carrier:true, quiet:true, owner:'SEARCH_CLICK'})
//       -> KM.api.getWorkspace('inventoryReplenishment', {recentWindow:true})
//         -> _kmGapRead_  (GET)  ->  inventoryReplenishment.workspace.get
//
// WHY A BROWSER AND NOT A FETCH LOOP. S8-R3B measured this action by sending requests directly, which is a
// valid measurement of the BACKEND but says nothing about what the page does. The page turns out to matter:
// a repeated Search in one session reuses _irReadModel and issues NO request at all. Arm D exists to hold
// that claim to account rather than assert it.
//
// SAFETY. Delegates every allow/deny decision to the R4A allowlist + CDP guard: action-first, deny-by-default,
// Fetch requestStage 'Request' so a refusal never leaves the browser, gapJob.status.get explicitly forbidden.
// Ephemeral Chrome profile per run, never the operator's. Bounded CDP commands, watchdog, safe dialog
// dismissal, open-map eviction. Checkpoints are written after EVERY sample, not at the end.
//
// READ ONLY. The harness sends no write action and cannot: the guard refuses anything not on the frozen list.
// =============================================================================================================
'use strict';
var fs = require('fs');
var os = require('os');
var path = require('path');
var http = require('http');
var cp = require('child_process');

var ROOT = path.resolve(__dirname, '..', '..', '..');
function arg(name, dflt) {
  var i = process.argv.indexOf('--' + name);
  return i === -1 ? dflt : process.argv[i + 1];
}
var APP = arg('app', 'https://Kitchen-Mama.github.io/KM-Operation-System');
var CHROME = process.env.KM_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
var PORT = parseInt(arg('port', '9471'), 10);
var OUT = arg('out', path.join(os.tmpdir(), 's8r4b2-out'));
var SPACED_GAP_MS = parseInt(arg('spacedgap', '180000'), 10);
var MAX_WAIT_MS = parseInt(arg('maxwait', '200000'), 10);   // a single Search may legitimately exceed 133 s
var SETTLE_MS = parseInt(arg('settle', '2500'), 10);

var AL = require(path.join(ROOT, 'assets/tools/s8-fatigue/s8-r4a-action-allowlist.js'));
var G = require(path.join(ROOT, 'assets/tools/s8-fatigue/s8-r4a-cdp-guard.js'));
var R = require(path.join(ROOT, 'assets/tools/s8-fatigue/s8-r4a-resilience.js'));

var ACTION = 'inventoryReplenishment.workspace.get';

function log(s) { process.stdout.write(s + '\n'); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function httpJson(u) {
  return new Promise(function (res, rej) {
    http.get(u, function (r) {
      var c = []; r.on('data', function (d) { c.push(d); });
      r.on('end', function () { try { res(JSON.parse(Buffer.concat(c).toString('utf8'))); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}
try { fs.mkdirSync(OUT, { recursive: true }); } catch (e) {}

function cdp(wsUrl, onTimeout) {
  var ws = new WebSocket(wsUrl);
  var handlers = {};
  var reg = R.createPendingRegistry({ timeoutMs: R.CDP_COMMAND_TIMEOUT_MS, onTimeout: onTimeout });
  var ready = new Promise(function (res, rej) {
    ws.addEventListener('open', function () { res(); });
    ws.addEventListener('error', function () { rej(new Error('devtools websocket error')); });
  });
  ws.addEventListener('message', function (ev) {
    var msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
    if (typeof msg.id === 'number') { reg.deliver(msg); }
    else if (msg.method && handlers[msg.method]) {
      handlers[msg.method].forEach(function (h) { try { h(msg.params || {}); } catch (e) {} });
    }
  });
  ws.addEventListener('close', function () { reg.rejectAll('devtools socket closed'); });
  return {
    ready: ready, registry: reg,
    on: function (m, fn) { (handlers[m] = handlers[m] || []).push(fn); },
    send: function (method, params) {
      var id = reg.nextId(); var p = reg.register(id, method, {});
      try { ws.send(JSON.stringify({ id: id, method: method, params: params || {} })); }
      catch (e) { reg.deliver({ id: id, error: String(e) }); }
      return p;
    },
    emit: function (method, params) {
      var id = reg.nextId(); var p = reg.register(id, method, {}); p['catch'](function () {});
      try { ws.send(JSON.stringify({ id: id, method: method, params: params || {} })); } catch (e) {}
    },
    close: function () { try { ws.close(); } catch (e) {} }
  };
}

// URL class WITHOUT the token. A Location header carries a one-time user_content_key; it is never persisted.
function urlClass(u) {
  u = String(u || '');
  if (/script\.google\.com\/macros\/s\/[^/]+\/exec/.test(u)) return 'EXEC';
  if (/script\.googleusercontent\.com\/macros\/echo/.test(u)) return 'ECHO';
  if (/script\.google(usercontent)?\.com/.test(u)) return 'GOOGLE_OTHER';
  return 'OTHER';
}
function userContentKey(u) {
  var m = /[?&]user_content_key=([^&]+)/.exec(String(u || ''));
  if (!m) return null;
  // A short non-reversible fingerprint only: enough to say "changed" / "same", never the token.
  var h = 0, s = m[1];
  for (var i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
  return 'uck#' + (h >>> 0).toString(36);
}
function kmRid(u) { var m = /[?&]km_rid=([^&]+)/.exec(String(u || '')); return m ? decodeURIComponent(m[1]) : null; }

(async function main() {
  var profile = fs.mkdtempSync(path.join(os.tmpdir(), 's8r4b2-profile-'));
  log('S8-R4B-2 — SITE INVENTORY CONTROLLED SEARCH');
  log('app      ' + APP);
  log('profile  ' + profile + '   EPHEMERAL — OPERATOR_PROFILE_TOUCHED = NO');
  log('out      ' + OUT);
  log('allowlist ' + AL.approvedActions().length + ' actions, deny-by-default, frozen');
  log('');
  log('AUTOMATED_FATIGUE_STATUS = RUNNING');
  log('HUMAN_TEST_AVOID = Site Inventory, and starting any gap recalculation');
  log('HUMAN_TEST_SAFE  = YES for unrelated surfaces');
  log('');

  var chrome = cp.spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--window-size=1600,1200',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile, 'about:blank'
  ], { stdio: 'ignore' });
  var teardown = function () { try { chrome.kill(); } catch (e) {} };
  process.on('exit', teardown);

  var version = null;
  for (var i = 0; i < 80 && !version; i++) {
    try { version = await httpJson('http://127.0.0.1:' + PORT + '/json/version'); } catch (e) { await sleep(250); }
  }
  if (!version) { log('STOP — DevTools endpoint never came up.'); teardown(); process.exit(2); }
  log('chrome ' + version['Browser']);
  var targets = await httpJson('http://127.0.0.1:' + PORT + '/json/list');
  var pageT = targets.filter(function (t) { return t.type === 'page'; })[0];
  var cdpTimeouts = [];
  var c = cdp(pageT.webSocketDebuggerUrl, function (info) { cdpTimeouts.push(info); });
  await c.ready;

  // ---- safety counters, named exactly as the §12 contract names them ---------------------------------------
  var SAFETY = {
    WRITE_ACTIONS_SENT: 0,
    GAP_JOB_STATUS_REQUEST_SENT_COUNT: 0,
    GAP_JOB_STATUS_REQUEST_INTERCEPTED_COUNT: 0,
    GAP_JOB_START_COUNT: 0,
    GAP_WRITE_COUNT: 0,
    UNKNOWN_APPLICATION_REQUEST_ABORT_COUNT: 0,
    UNKNOWN_APPLICATION_REQUEST_SENT_COUNT: 0
  };
  var WRITE_SHAPED = /(\.write|\.save|\.submit|\.approve|\.confirm|\.cancel|\.delete|\.recalculate|\.start|\.upsert|\.adjust|\.dispatch|\.receipt|\.transfer)/i;
  var ledger = G.newLedger();
  var actionsSeen = {};
  var dialogs = R.createDialogHandler();

  // ---- network evidence, per in-flight workspace request ----------------------------------------------------
  var reqs = {};        // networkId -> record
  var current = null;   // the sample being measured

  c.on('Network.requestWillBeSent', function (p) {
    var u = (p.request && p.request.url) || '';
    var act = '';
    try { act = AL.actionFromRequest(u, p.request && p.request.postData) || ''; } catch (e) {}
    if (p.redirectResponse) {
      var rec = reqs[p.requestId];
      if (rec) {
        rec.hops.push({
          status: p.redirectResponse.status,
          statusText: String(p.redirectResponse.statusText || '').slice(0, 40),
          method: (p.request && p.request.method) || null,
          from: urlClass(p.redirectResponse.url),
          to: urlClass(u),
          location_present: !!(p.redirectResponse.headers &&
            (p.redirectResponse.headers.Location || p.redirectResponse.headers.location)),
          location_class: urlClass((p.redirectResponse.headers &&
            (p.redirectResponse.headers.Location || p.redirectResponse.headers.location)) || ''),
          km_rid: kmRid(u),
          user_content_key: userContentKey(u)
        });
      }
      return;
    }
    if (act !== ACTION) { return; }
    reqs[p.requestId] = {
      networkId: p.requestId, km_rid: kmRid(u), startedAt: Date.now(),
      urlClass: urlClass(u), hops: [], status: null, encodedBytes: null, finishedAt: null,
      sample: current ? current.id : null
    };
    if (current) { current.networkIds.push(p.requestId); }
  });
  c.on('Network.responseReceived', function (p) {
    var r = reqs[p.requestId]; if (!r) { return; }
    r.status = p.response && p.response.status;
    r.finalClass = urlClass((p.response && p.response.url) || '');
  });
  c.on('Network.loadingFinished', function (p) {
    var r = reqs[p.requestId]; if (!r) { return; }
    r.encodedBytes = p.encodedDataLength || null;
    r.finishedAt = Date.now();
  });
  c.on('Network.loadingFailed', function (p) {
    var r = reqs[p.requestId]; if (!r) { return; }
    r.failed = String(p.errorText || 'failed').slice(0, 80);
    r.finishedAt = Date.now();
  });

  c.on('Page.javascriptDialogOpening', function (p) {
    var out = dialogs.handle(p, { surface: 'Site Inventory' });
    c.emit(out.command.method, out.command.params);
  });

  c.on('Fetch.requestPaused', function (p) {
    var req = p.request || {};
    var d = G.classify({ url: req.url, method: req.method, postData: req.postData },
      { decide: AL.decide, actionOf: AL.actionFromRequest, isKnownAction: AL.isKnownAction,
        pageHost: (/^https?:\/\/([^/]+)/.exec(APP) || [])[1] || '' });
    G.record(ledger, d);
    if (d.action) { actionsSeen[d.action] = (actionsSeen[d.action] || 0) + 1; }
    if (d.action === 'gapJob.status.get') {
      if (d.allow) { SAFETY.GAP_JOB_STATUS_REQUEST_SENT_COUNT++; }
      else { SAFETY.GAP_JOB_STATUS_REQUEST_INTERCEPTED_COUNT++; }
    }
    if (d.cls === G.CLASS.UNKNOWN) {
      if (d.allow) { SAFETY.UNKNOWN_APPLICATION_REQUEST_SENT_COUNT++; }
      else { SAFETY.UNKNOWN_APPLICATION_REQUEST_ABORT_COUNT++; }
    }
    if (d.allow && d.action && WRITE_SHAPED.test(d.action)) { SAFETY.WRITE_ACTIONS_SENT++; }
    if (d.allow && d.action && /\.job\.start/.test(d.action)) { SAFETY.GAP_JOB_START_COUNT++; }
    var cmd = G.commandFor(d, p.requestId);
    c.emit(cmd.method, cmd.params);
  });

  await c.send('Runtime.enable', {});
  await c.send('Log.enable', {});
  await c.send('Network.enable', {});
  await c.send('Page.enable', {});
  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });

  async function evalJs(expr) {
    var r;
    try { r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: false }); }
    catch (e) { return undefined; }
    var res = r && r.result;
    if (res && res.exceptionDetails) { return { __err: String(res.exceptionDetails.text || 'exception') }; }
    return res && res.result ? res.result.value : undefined;
  }

  var samples = [];
  function checkpoint() {
    R.writeAtomic(path.join(OUT, 's8-r4b2-samples.json'),
      JSON.stringify({ at: new Date().toISOString(), samples: samples, safety: SAFETY,
        ledger: ledger, actionsSeen: actionsSeen, cdpTimeouts: cdpTimeouts.length }, null, 2));
  }

  async function bootApp() {
    await c.send('Page.navigate', { url: APP + '/index.html' });
    for (var b = 0; b < 160; b++) {
      await sleep(400);
      // ONLY showSection here. inventory-replenishment.js is PARTIAL-LOADED by the script loader when the
      // section is first shown, so searchReplenishment does not exist at boot -- waiting for it here is
      // waiting for something that can only appear after the navigation this function precedes.
      if ((await evalJs("typeof window.showSection === 'function'")) === true) { return true; }
    }
    return false;
  }

  async function mountSiteInventory() {
    await evalJs("window.showSection('ops')");
    // The page script arrives with the section, then the scope selectors are filled by
    // inventoryScope.registry.get. Both must be true before a Search can be driven.
    for (var i = 0; i < 200; i++) {
      await sleep(500);
      var st = await evalJs("(function(){try{var m=document.getElementById('replenMarketplace');"
        + "return JSON.stringify({fn:typeof window.searchReplenishment,opts:m?m.options.length:0,"
        + "country:!!document.getElementById('replenCountry')});}catch(e){return null;}})()");
      var p2 = null; try { p2 = st ? JSON.parse(st) : null; } catch (e) {}
      if (p2 && p2.fn === 'function' && p2.country && p2.opts > 1) { return true; }
      if (i === 60 && p2) { log('  …still mounting: ' + st); }
    }
    return false;
  }

  async function resolveScope() {
    return await evalJs("(function(){try{"
      + "var cEl=document.getElementById('replenCountry');var mEl=document.getElementById('replenMarketplace');"
      + "function opts(el){var a=[];if(!el)return a;for(var i=0;i<el.options.length;i++){a.push({v:el.options[i].value,t:el.options[i].text});}return a;}"
      + "return {countries:opts(cEl),marketplaces:opts(mEl)};"
      + "}catch(e){return {__err:String(e)};}})()");
  }

  // ONE controlled Search. `expectRequest` records what the arm predicts, so a surprise is visible as a
  // surprise rather than being quietly absorbed into the numbers.
  async function doSearch(id, armName, expectRequest) {
    var s = { id: id, arm: armName, expectRequest: expectRequest, networkIds: [],
              startedAt: Date.now(), wallMs: null, meta: null, requests: [], note: null };
    current = s;
    var before = Object.keys(reqs).length;
    var t0 = Date.now();
    var kicked = await evalJs("(function(){try{window.searchReplenishment();return 'ok';}catch(e){return 'ERR '+e;}})()");
    s.kick = kicked;
    // settle: the read model is assigned on success; poll the page's own state rather than guessing
    var quietSince = Date.now(), lastSeen = -1, settledBy = null;
    while (Date.now() - t0 < MAX_WAIT_MS) {
      await sleep(400);
      var st = await evalJs("(function(){try{return JSON.stringify({status:(typeof _irSearch!=='undefined'&&_irSearch)?_irSearch.status:null,"
        + "inFlight:(typeof _irSearch!=='undefined'&&_irSearch)?!!_irSearch.inFlight:null,"
        + "hasModel:(typeof _irReadModel!=='undefined')&&!!_irReadModel,"
        + "metaAt:(typeof _irLastReadMeta!=='undefined'&&_irLastReadMeta)?_irLastReadMeta.at:null});}catch(e){return null;}})()");
      var parsed = null; try { parsed = st ? JSON.parse(st) : null; } catch (e) {}
      s.lastState = parsed;
      var n = Object.keys(reqs).length;
      if (n !== lastSeen) { lastSeen = n; quietSince = Date.now(); }
      if (parsed && parsed.inFlight === false && (parsed.status === 'READY' || parsed.status === 'EMPTY' || parsed.status === 'ERROR')) {
        if (Date.now() - quietSince >= SETTLE_MS) { settledBy = 'SEARCH_STATE'; break; }
      }
      // the zero-request arm settles the moment it is clear nothing was dispatched
      if (!expectRequest && Date.now() - t0 > 9000 && Object.keys(reqs).length === before) { settledBy = 'NO_REQUEST'; break; }
    }
    s.wallMs = Date.now() - t0;
    s.settledBy = settledBy || 'MAX_WAIT';
    var metaJson = await evalJs("(function(){try{return (typeof _irLastReadMeta!=='undefined'&&_irLastReadMeta)?JSON.stringify(_irLastReadMeta):null;}catch(e){return null;}})()");
    try { s.meta = metaJson ? JSON.parse(metaJson) : null; } catch (e) { s.meta = null; }
    s.requests = s.networkIds.map(function (nid) { return reqs[nid]; }).filter(Boolean);
    s.requestCount = s.requests.length;
    current = null;
    samples.push(s); checkpoint();
    var r0 = s.requests[0] || null;
    log('  [' + id + '] ' + armName + '  wall=' + s.wallMs + 'ms  requests=' + s.requestCount
      + '  hops=' + (r0 ? (r0.hops.length + 1) : 0)
      + '  bytes=' + (r0 ? r0.encodedBytes : '-')
      + '  serverMs=' + (s.meta ? s.meta.server_execution_ms : '-')
      + '  openMs=' + (s.meta ? s.meta.open_ms : '-')
      + '  settled=' + s.settledBy);
    return s;
  }

  // ---- RUN ---------------------------------------------------------------------------------------------------
  if (!(await bootApp())) { log('STOP — app never booted.'); checkpoint(); c.close(); teardown(); process.exit(2); }
  if (!(await mountSiteInventory())) { log('STOP — scope selectors never populated.'); checkpoint(); c.close(); teardown(); process.exit(2); }
  var scope = await resolveScope();
  log('scope options: ' + JSON.stringify(scope).slice(0, 400));

  var pick = await evalJs("(function(){try{"
    + "var cEl=document.getElementById('replenCountry');var mEl=document.getElementById('replenMarketplace');"
    + "var ci=-1;for(var i=0;i<cEl.options.length;i++){if(String(cEl.options[i].value)==='US'){ci=i;break;}}"
    + "if(ci<0)return {__err:'US not offered'};"
    + "cEl.value='US';cEl.dispatchEvent(new Event('change',{bubbles:true}));"
    + "var mi=-1;for(var j=0;j<mEl.options.length;j++){var t=(mEl.options[j].text||'').toLowerCase();"
    + "if(mEl.options[j].value && t.indexOf('amazon')!==-1){mi=j;break;}}"
    + "if(mi<0){for(var k=0;k<mEl.options.length;k++){if(mEl.options[k].value){mi=k;break;}}}"
    + "if(mi<0)return {__err:'no marketplace option'};"
    + "mEl.value=mEl.options[mi].value;mEl.dispatchEvent(new Event('change',{bubbles:true}));"
    + "return {country:cEl.value,marketplaceId:mEl.value,marketplaceText:mEl.options[mi].text};"
    + "}catch(e){return {__err:String(e)};}})()");
  log('SEARCH SCOPE: ' + JSON.stringify(pick));
  if (!pick || pick.__err) { log('STOP — could not select the scope.'); checkpoint(); c.close(); teardown(); process.exit(2); }
  R.writeAtomic(path.join(OUT, 's8-r4b2-scope.json'), JSON.stringify({ scope: pick, options: scope }, null, 2));

  async function reloadAndMount() {
    await c.send('Page.navigate', { url: APP + '/index.html' });
    if (!(await bootApp())) { return false; }
    if (!(await mountSiteInventory())) { return false; }
    var ok = await evalJs("(function(){try{"
      + "var cEl=document.getElementById('replenCountry');var mEl=document.getElementById('replenMarketplace');"
      + "cEl.value=" + JSON.stringify(pick.country) + ";cEl.dispatchEvent(new Event('change',{bubbles:true}));"
      + "mEl.value=" + JSON.stringify(pick.marketplaceId) + ";mEl.dispatchEvent(new Event('change',{bubbles:true}));"
      + "return mEl.value===" + JSON.stringify(pick.marketplaceId) + ";"
      + "}catch(e){return false;}})()");
    return ok === true;
  }

  // CORRECTED ARM C (--armc). THE FIRST RUN OF ARM C MEASURED NOTHING, AND THE REASON IS WORTH KEEPING.
  //
  // The design said 'reload between each Search' to force a fresh read. It does not. On reload the page
  // restores the remembered scope and _irBootstrapScope_ performs the workspace read AS PART OF MOUNT.
  // By the time Search is pressed one of two things is true, and both destroy the measurement:
  //   * the bootstrap read has resolved  -> _irReadModel is populated -> Search issues NO request;
  //   * the bootstrap read is STILL RUNNING -> _irSearch.inFlight is true -> searchReplenishment() returns
  //     at its single-flight guard, having issued nothing.
  // C2 and C3 hit the second case: 0 requests, 60 s of waiting, and an ERROR that belonged to the MOUNT's
  // read, not to any Search.
  //
  // So this arm does not reload. It clears the client read model in place -- exactly what _irRenderError_
  // does on a failed read -- and waits for the single-flight gate to open before each press. THIS IS A
  // HARNESS INTERVENTION and is declared as one: it reproduces R3B's request-level repetition with no
  // mount read inside the measured window.
  if (arg('armc', null) !== null) {
    log('CORRECTED ARM C - IMMEDIATE REQUEST REPEAT (3, no reload, model cleared in place)');
    for (var ccI = 1; ccI <= 3; ccI++) {
      for (var g = 0; g < 60; g++) {
        var openGate = await evalJs("(function(){try{return (typeof _irSearch!=='undefined'&&_irSearch)?!_irSearch.inFlight:true;}catch(e){return true;}})()");
        if (openGate === true) { break; }
        await sleep(500);
      }
      var cleared = await evalJs("(function(){try{_irReadModel=null;return _irReadModel===null;}catch(e){return 'ERR '+e;}})()");
      log('  model cleared: ' + JSON.stringify(cleared));
      await doSearch('CC' + ccI, 'IMMEDIATE_REPEAT_CORRECTED', true);
    }
    checkpoint();
    log('AUTOMATED_FATIGUE_STATUS = COMPLETE');
    log('evidence -> ' + OUT);
    c.close(); teardown(); process.exit(0);
  }

  log('\n== ARM A — COLD (1) ==');
  await doSearch('A1', 'COLD', true);

  log('\n== ARM B — SPACED (3, >=' + Math.round(SPACED_GAP_MS / 1000) + 's apart, reload between) ==');
  for (var bI = 1; bI <= 3; bI++) {
    if (bI > 1) { log('  …cooldown ' + Math.round(SPACED_GAP_MS / 1000) + 's'); await sleep(SPACED_GAP_MS); }
    if (!(await reloadAndMount())) { log('  reload/mount failed, skipping B' + bI); continue; }
    await doSearch('B' + bI, 'SPACED', true);
  }

  log('\n== ARM C — IMMEDIATE REQUEST REPEAT (3, reload between, back-to-back) ==');
  for (var cI = 1; cI <= 3; cI++) {
    if (!(await reloadAndMount())) { log('  reload/mount failed, skipping C' + cI); continue; }
    await doSearch('C' + cI, 'IMMEDIATE_REPEAT', true);
  }

  log('\n== ARM D — SAME-SESSION UI REPEAT CONTROL (2, NO reload) ==');
  // Deliberately continues in the SAME page session as C3: _irReadModel is already populated.
  var dBefore = Object.keys(reqs).length;
  await doSearch('D1', 'UI_REPEAT_CONTROL', false);
  await doSearch('D2', 'UI_REPEAT_CONTROL', false);
  var dAfter = Object.keys(reqs).length;
  var dExtra = dAfter - dBefore;

  // ---- report --------------------------------------------------------------------------------------------
  checkpoint();
  log('\n================ S8-R4B-2 EVIDENCE ================');
  log('SEARCH_COUNTRY        ' + pick.country);
  log('SEARCH_MARKETPLACE    ' + pick.marketplaceText);
  log('SEARCH_MARKETPLACE_ID ' + pick.marketplaceId);
  log('');
  samples.forEach(function (s) {
    var r = s.requests[0] || null;
    var m = s.meta || {};
    var top5 = (m.slowest_tables || []).map(function (t) { return t.table + ':' + t.ms + 'ms/' + t.rows + 'r'; }).join(' ');
    var top5sum = (m.slowest_tables || []).reduce(function (a, t) { return a + (t.ms || 0); }, 0);
    var unacc = (typeof m.server_execution_ms === 'number')
      ? (m.server_execution_ms - (m.open_ms || 0) - top5sum) : null;
    log(s.id + ' ' + s.arm);
    log('   wall_ms=' + s.wallMs + '  requests=' + s.requestCount
      + '  exec_hops=' + (r ? (r.hops.length + 1) : 0)
      + '  http=' + (r ? r.status : '-') + '  bytes=' + (r ? r.encodedBytes : '-'));
    log('   km_rid=' + (r ? r.km_rid : '-') + '  networkId=' + (r ? r.networkId : '-'));
    if (r && r.hops.length) {
      r.hops.forEach(function (h, i) {
        log('     hop' + (i + 1) + ' ' + h.status + ' ' + h.from + '->' + h.to
          + ' loc=' + (h.location_present ? h.location_class : 'none')
          + ' rid=' + h.km_rid + ' ' + (h.user_content_key || 'uck:none'));
      });
    }
    log('   server_ms=' + (m.server_execution_ms === undefined ? '-' : m.server_execution_ms)
      + '  open_ms=' + (m.open_ms === undefined ? '-' : m.open_ms)
      + '  tables_read=' + m.tables_read + '  rows_returned=' + m.rows_returned);
    log('   top5=' + (top5 || '-'));
    log('   top5_sum_ms=' + top5sum + '  unaccounted_ms=' + unacc);
    if (m.counts) {
      var ck = Object.keys(m.counts).sort();
      log('   counts(' + ck.length + ')=' + ck.map(function (k) { return k + ':' + m.counts[k]; }).join(' '));
    }
    if (m.recent_window) {
      var rw = Object.keys(m.recent_window).map(function (k) {
        var w = m.recent_window[k]; return k + ' ' + w.before + '->' + w.after + ' (-' + w.dropped + ')';
      });
      log('   recentWindow=' + rw.join(' | '));
    }
  });
  log('');
  log('ARM_D_ADDITIONAL_WORKSPACE_REQUESTS = ' + dExtra);
  log('UI_REPEAT_ZERO_REQUEST_CLAIM_CONFIRMED = ' + (dExtra === 0 ? 'YES' : 'NO'));
  log('');
  log('SAFETY');
  Object.keys(SAFETY).forEach(function (k) { log('  ' + k + ' = ' + SAFETY[k]); });
  log('  CDP_COMMAND_TIMEOUT_COUNT = ' + cdpTimeouts.length);
  log('  DIALOG_COUNT = ' + dialogs.count() + '  CONFIRM_ACCEPTED_COUNT = ' + dialogs.confirmAcceptedCount());
  log('  ACTIONS_SEEN = ' + JSON.stringify(actionsSeen));
  log('  FORBIDDEN_REQUEST_ABORT_COUNT = ' + ledger.FORBIDDEN_REQUEST_ABORT_COUNT);
  log('');
  log('AUTOMATED_FATIGUE_STATUS = COMPLETE');
  log('evidence -> ' + OUT);
  c.close(); teardown(); process.exit(0);
})().catch(function (e) {
  console.error('S8-R4B-2 FAILED: ' + (e && e.stack || e));
  process.exit(1);
});
