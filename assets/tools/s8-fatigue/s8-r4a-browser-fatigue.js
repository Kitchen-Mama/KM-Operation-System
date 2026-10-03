// =============================================================================================================
// S8-R4A — BROWSER / ROUTE-LEVEL READ FATIGUE RUNNER
//
//   node assets/tools/s8-fatigue/s8-r4a-browser-fatigue.js --out <dir> [--cycles 8] [--warm 3]
//                                                          [--only <routeKey>] [--scenarios ABCDEF]
//
// Drives the REAL shipped frontend in headless Chrome against Production, with every request decided before it
// leaves the browser. The frontend is served from this worktree, which `git diff main -- assets/js` proves is
// byte-identical to the deployed one; the backend is the live deployment the shipped client names.
//
// THE GUARD IS NOT ADVISORY. Fetch.enable at requestStage 'Request' pauses every request before it is issued.
// A request outside the frozen 16 is failed at the socket — including gapJob.status.get, which Site Inventory's
// mount can reach and which, against a stale non-terminal job, would persist STALLED, mutate Script Properties,
// delete and create triggers and resume gap processing that WRITES both gap tables.
//
// THE PROFILE IS EPHEMERAL AND THAT IS A SAFETY REQUIREMENT, not hygiene. The abort path inside the client's
// gap-resume handler calls clearJobLiveness — a localStorage write. In the operator's own profile that would
// erase their record of a running recalculation. A fresh --user-data-dir is created per run and never reused.
//
// WHAT IT NEVER DOES: click Save, Submit, Confirm, Adjust, Dispatch, Receive, Generate, Edit or Import. It
// navigates, it waits, and it reads the DOM. The guard means that even a mis-scripted interaction cannot put a
// write on the wire.
// =============================================================================================================

'use strict';
var http = require('http');
var path = require('path');
var os = require('os');
var fs = require('fs');
var cp = require('child_process');

var AL = require('./s8-r4a-action-allowlist.js');
var G = require('./s8-r4a-cdp-guard.js');

var ROOT = path.resolve(__dirname, '..', '..', '..');
var CHROME = process.env.KM_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
var DEBUG_PORT = 9444;

function arg(name, dflt) {
  var i = process.argv.indexOf('--' + name);
  if (i === -1) return dflt;
  var v = process.argv[i + 1];
  return (v === undefined || v.indexOf('--') === 0) ? true : v;
}
var CYCLES = parseInt(arg('cycles', '8'), 10);
var WARM = parseInt(arg('warm', '3'), 10);
var ONLY = arg('only', '');
var SCENARIOS = String(arg('scenarios', 'ABCDEF')).toUpperCase();
var OUT = String(arg('out', path.join(os.tmpdir(), 's8r4a-out')));
var SETTLE_MS = parseInt(arg('settle', '2000'), 10);     // quiet window that defines "stable"
var MAX_WAIT_MS = parseInt(arg('maxwait', '180000'), 10); // a page that never settles must not hang the run

// ---- the eleven approved surfaces, frozen -------------------------------------------------------------------
// routeKey is what showSection() takes; sectionId is what KM.lifecycle registers. Both are needed: the first
// drives navigation, the second identifies the DOM subtree to watch.
// The DATA container per surface, taken from the shipped partial markup. Where the partial does not expose one,
// the entry is null and the row count is reported as NULL rather than 0 - because a row count this harness
// cannot locate is an unknown, and reporting it as zero would manufacture a FALSE_EMPTY on a working page.
var ROW_CONTAINERS = {
  'fc-summary-section':              ['#fc-regular-scroll-body', '#fc-regular-fixed-body'],
  'sku-regional-details-section':    ['#srd-list'],
  'factory-stock-section':           ['#factory-stock-scroll-body', '#factory-stock-fixed-body'],
  'overseas-stock-section':          ['#overseas-snapshot-scroll-body', '#overseas-snapshot-fixed-body'],
  'ops-section':                     ['#replen-dar-rows'],
  'sku-section':                     null,
  'shippingplan-section':            null,
  'shippinghistory-section':         null,
  'shipment-draft-section':          null,
  'global-logistics-map-section':    null,
  'purchase-order-overview-section': null,
  'carrier-rate-card-section':       null
};

var SURFACES = [
  { n: 1,  name: 'FC Summary',           routeKey: 'fc-summary',              sectionId: 'fc-summary-section' },
  { n: 2,  name: 'SKU Details',          routeKey: 'skuDetails',              sectionId: 'sku-section' },
  { n: 3,  name: 'SKU Regional Details', routeKey: 'sku-regional-details',    sectionId: 'sku-regional-details-section' },
  { n: 4,  name: 'Factory Inventory',    routeKey: 'factory-stock',           sectionId: 'factory-stock-section' },
  { n: 5,  name: 'Overseas Inventory',   routeKey: 'overseas-stock',          sectionId: 'overseas-stock-section' },
  { n: 6,  name: 'Weekly Shipping Plan', routeKey: 'shippingplan',            sectionId: 'shippingplan-section' },
  { n: 7,  name: 'Shipment Overview',    routeKey: 'shipment-overview',       sectionId: 'shippinghistory-section' },
  { n: 8,  name: 'Shipment Draft',       routeKey: 'shipment-draft',          sectionId: 'shipment-draft-section' },
  { n: 9,  name: 'On-the-Way Map',       routeKey: 'global-logistics-map',    sectionId: 'global-logistics-map-section' },
  { n: 10, name: 'PO Overview',          routeKey: 'purchase-order-overview', sectionId: 'purchase-order-overview-section' },
  { n: 11, name: 'Carrier Rate Card',    routeKey: 'carrier-rate-card',       sectionId: 'carrier-rate-card-section' },
  { n: 12, name: 'Site Inventory',       routeKey: 'ops',                     sectionId: 'ops-section' }
];
// The preflight proposed eleven and listed Site Inventory separately under §7. Both are measured; the report
// states the count as 11 route surfaces + Site Inventory, which is 12 sections in total.

function log(s) { process.stdout.write(s + '\n'); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// ---- static server for the shipped frontend ------------------------------------------------------------------
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.map': 'application/json',
  '.csv': 'text/csv', '.txt': 'text/plain' };
function serveRepo() {
  return http.createServer(function (req, res) {
    var rel = decodeURIComponent(String(req.url).split('?')[0]);
    if (rel === '/' || rel === '') rel = '/index.html';
    var file = path.join(ROOT, rel.replace(/^\/+/, ''));
    if (file.indexOf(ROOT) !== 0) { res.writeHead(403); res.end('no'); return; }
    fs.readFile(file, function (err, buf) {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
                           'Cache-Control': 'no-store' });
      res.end(buf);
    });
  });
}

// ---- minimal CDP client over Node's global WebSocket ---------------------------------------------------------
function cdp(wsUrl) {
  var ws = new WebSocket(wsUrl);
  var id = 0, pending = {}, handlers = {};
  var ready = new Promise(function (res, rej) {
    ws.addEventListener('open', function () { res(); });
    ws.addEventListener('error', function () { rej(new Error('devtools websocket error')); });
  });
  ws.addEventListener('message', function (ev) {
    var msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
    if (msg.id && pending[msg.id]) { pending[msg.id](msg); delete pending[msg.id]; }
    else if (msg.method && handlers[msg.method]) { handlers[msg.method](msg.params || {}); }
  });
  return {
    ready: ready,
    on: function (m, fn) { handlers[m] = fn; },
    send: function (method, params) {
      id++;
      var myId = id;
      return new Promise(function (res) {
        pending[myId] = res;
        try { ws.send(JSON.stringify({ id: myId, method: method, params: params || {} })); }
        catch (e) { res({ error: String(e) }); }
      });
    },
    close: function () { try { ws.close(); } catch (e) {} }
  };
}
function httpJson(url) {
  return new Promise(function (res, rej) {
    http.get(url, function (r) {
      var b = ''; r.on('data', function (d) { b += d; });
      r.on('end', function () { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}

// =============================================================================================================
(async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  var started = new Date().toISOString();

  var server = serveRepo();
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var port = server.address().port;
  var origin = 'http://127.0.0.1:' + port;

  // EPHEMERAL PROFILE. Created per run, never reused, never the operator's.
  var profile = fs.mkdtempSync(path.join(os.tmpdir(), 's8r4a-profile-'));
  log('S8-R4A BROWSER FATIGUE');
  log('frontend ' + origin + '   (served from this worktree)');
  log('profile  ' + profile + '   EPHEMERAL — OPERATOR_PROFILE_TOUCHED = NO');
  log('allowlist ' + AL.approvedActions().length + ' actions, frozen');
  log('');
  log('AUTOMATED_FATIGUE_STATUS = RUNNING');
  log('HUMAN_TEST_SAFE = YES');
  log('HUMAN_TEST_AVOID = the surface named in each window below, while that window is open');
  log('');

  var chrome = cp.spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--window-size=1600,1200',
    '--remote-debugging-port=' + DEBUG_PORT, '--user-data-dir=' + profile, 'about:blank'
  ], { stdio: 'ignore' });

  var version = null;
  for (var i = 0; i < 80 && !version; i++) {
    try { version = await httpJson('http://127.0.0.1:' + DEBUG_PORT + '/json/version'); } catch (e) { await sleep(250); }
  }
  if (!version) { log('STOP — the Chrome DevTools endpoint never came up.'); chrome.kill(); process.exit(2); }
  log('chrome ' + version['Browser']);

  var targets = await httpJson('http://127.0.0.1:' + DEBUG_PORT + '/json/list');
  var c = cdp(targets.filter(function (t) { return t.type === 'page'; })[0].webSocketDebuggerUrl);
  await c.ready;

  // ---- instrumentation state --------------------------------------------------------------------------------
  var ledger = G.newLedger();
  var open = {};              // requestId -> { action, t0 }
  var events = [];            // every request, with the window it belonged to
  var consoleErrors = [];
  var windowTag = { surface: null, scenario: null, cycle: 0 };
  var lastActivity = Date.now();
  var SAFETY = {
    GAP_JOB_STATUS_REQUEST_SENT_COUNT: 0,
    GAP_JOB_STATUS_REQUEST_INTERCEPTED_COUNT: 0,
    UNKNOWN_APPLICATION_REQUEST_SENT_COUNT: 0,
    UNKNOWN_APPLICATION_REQUEST_ABORT_COUNT: 0,
    WRITE_ACTIONS_SENT: 0
  };
  var WRITE_SHAPED = /^(adjust|upsert|update|create|delete|submit|cancel|import|receive|complete|confirm|generate|run|seed|backfill|retire|finalize|sync|append|pricing\.update|replenishmentDemandAllocation\.save|weeklyAiPlan\.generate)/;

  // The identity of a request for duplicate detection: action + the complete km_body (or table name), hashed.
  // Computed from the FULL url, because the stored url is truncated for the report and comparing truncated
  // bodies would make two different reads look identical.
  function bodyKeyOf(url, postData) {
    var u = String(url || '');
    var b = /[?&]km_body=([^&]*)/.exec(u);
    var t = /[?&]table=([^&]*)/.exec(u);
    var raw = (b ? decodeURIComponent(b[1]) : '') + '|' + (t ? t[1] : '') + '|' + String(postData || '');
    // THE CORRELATION ID IS NOT PART OF THE REQUEST'S IDENTITY.
    // Every read carries its own requestId, in the body AND in km_rid. Hashing them meant two reads asking for
    // exactly the same thing never matched, so DUPLICATE_REQUEST_COUNT could only ever be zero - a metric that
    // reports a clean result because it cannot report anything else. Two reads that differ only by correlation
    // id ARE duplicates, which is the whole point of counting them.
    raw = raw.replace(/"requestId"\s*:\s*"[^"]*"/g, '"requestId":"*"')
             .replace(/REQ-[A-Za-z0-9_-]+/g, 'REQ-*');
    var h = 0;
    for (var i = 0; i < raw.length; i++) { h = ((h << 5) - h + raw.charCodeAt(i)) | 0; }
    return String(h);
  }

  c.on('Fetch.requestPaused', function (p) {
    var req = p.request || {};
    var d = G.classify({ url: req.url, method: req.method, postData: req.postData },
      { decide: AL.decide, actionOf: AL.actionFromRequest, isKnownAction: AL.isKnownAction, pageHost: '127.0.0.1:' + port });
    G.record(ledger, d);
    lastActivity = Date.now();

    if (d.action === 'gapJob.status.get') {
      if (d.allow) SAFETY.GAP_JOB_STATUS_REQUEST_SENT_COUNT++;
      else SAFETY.GAP_JOB_STATUS_REQUEST_INTERCEPTED_COUNT++;
    }
    if (d.cls === G.CLASS.UNKNOWN) {
      if (d.allow) SAFETY.UNKNOWN_APPLICATION_REQUEST_SENT_COUNT++;
      else SAFETY.UNKNOWN_APPLICATION_REQUEST_ABORT_COUNT++;
    }
    if (d.allow && d.action && WRITE_SHAPED.test(d.action)) SAFETY.WRITE_ACTIONS_SENT++;

    // THE REQUEST KEY IS networkId, NOT requestId.
    // Fetch.requestPaused carries a FETCH interception id; Network.loadingFinished carries a NETWORK id, and
    // they are different strings. Keying on the wrong one meant no read ever settled: every duration stayed
    // null, `open` never emptied, and every surface therefore reported a 180 s TIMEOUT that was entirely the
    // harness's. CDP guarantees networkId equals the Network.requestWillBeSent requestId when one exists.
    var rec = { t: Date.now(), surface: windowTag.surface, scenario: windowTag.scenario, cycle: windowTag.cycle,
      cls: d.cls, allow: d.allow, code: d.code, action: d.action, method: req.method,
      url: String(req.url).slice(0, 900), bodyKey: bodyKeyOf(req.url, req.postData), nid: p.networkId || null };
    events.push(rec);
    if (d.cls === G.CLASS.APPROVED_READ && p.networkId) open[p.networkId] = { rec: rec, t0: Date.now() };

    var cmd = G.commandFor(d, p.requestId);
    c.send(cmd.method, cmd.params);
  });

  function settleFrom(id) {
    var o = open[id];
    if (!o) return;
    o.rec.ms = Date.now() - o.t0;
    delete open[id];
    lastActivity = Date.now();
  }
  c.on('Network.loadingFinished', function (p) { settleFrom(p.requestId); lastActivity = Date.now(); });
  c.on('Network.loadingFailed', function (p) {
    var o = open[p.requestId];
    if (o) { o.rec.failed = String(p.errorText || 'failed'); }
    settleFrom(p.requestId); lastActivity = Date.now();
  });
  c.on('Network.responseReceived', function (p) {
    var o = open[p.requestId];
    if (o && p.response) { o.rec.http = p.response.status; o.rec.mime = p.response.mimeType; }
    lastActivity = Date.now();
  });
  c.on('Network.requestWillBeSent', function () { lastActivity = Date.now(); });
  c.on('Runtime.consoleAPICalled', function (p) {
    if (p.type === 'error') {
      var text = (p.args || []).map(function (a) { return String(a.value || a.description || ''); }).join(' ');
      consoleErrors.push({ surface: windowTag.surface, scenario: windowTag.scenario, cycle: windowTag.cycle, text: text.slice(0, 200) });
    }
  });
  c.on('Log.entryAdded', function (p) {
    var e = p.entry || {};
    if (e.level === 'error') {
      consoleErrors.push({ surface: windowTag.surface, scenario: windowTag.scenario, cycle: windowTag.cycle,
        text: String(e.text || '').slice(0, 200), source: e.source });
    }
  });

  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  await c.send('Network.enable');
  await c.send('Page.enable');
  await c.send('Runtime.enable');
  await c.send('Log.enable');

  async function evalJs(expr) {
    var r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: false });
    return r && r.result && r.result.result ? r.result.result.value : undefined;
  }

  // "STABLE" = a quiet window with no network AND no DOM mutation in the section subtree. Either alone is
  // satisfied by a page that is still broken: a stalled page makes no requests, and a spinner mutates forever.
  // OBSERVE THE DOCUMENT, FILTER TO THE SECTION.
  //
  // The first version observed the section element itself and installed the observer BEFORE navigating — but
  // these sections are PARTIAL-LOADED, so the element does not exist until the mount injects it. The observer
  // therefore never attached, __kmLastMut stayed 0, the DOM-quiet test could never be satisfied and every
  // single surface reported a TIMEOUT that was purely the harness's. Observing the document removes the
  // ordering problem entirely; the containment check keeps the measurement scoped to the section.
  async function installObserver(sectionId) {
    await evalJs('(function(){' +
      'window.__kmMut = 0; window.__kmMutSamples = [];' +
      'if (window.__kmObs) { try{window.__kmObs.disconnect();}catch(e){} }' +
      'window.__kmSecId = ' + JSON.stringify(sectionId) + ';' +
      'window.__kmLastMut = Date.now();' +
      'window.__kmObs = new MutationObserver(function(ms){' +
      '  var sec = document.getElementById(window.__kmSecId);' +
      '  if (!sec) return;' +
      '  var hit = 0;' +
      '  for (var i = 0; i < ms.length; i++) {' +
      '    var m = ms[i], t = m.target;' +
      '    if (!t || !(sec === t || sec.contains(t))) continue;' +
      '    hit++;' +
      '    if (window.__kmMutSamples.length < 12) {' +
      '      window.__kmMutSamples.push(m.type + " " + ((t.tagName||"?") + "." + ((t.className||"")+"")).slice(0,50) +' +
      '        (m.type === "attributes" ? " [" + m.attributeName + "]" : ""));' +
      '    }' +
      '  }' +
      '  if (hit) { window.__kmMut += hit; window.__kmLastMut = Date.now(); }' +
      '});' +
      'window.__kmObs.observe(document.documentElement,' +
      '  { childList:true, subtree:true, characterData:true, attributes:true });' +
      'return true; })()');
  }

  async function sectionState(sectionId) {
    return await evalJs('(function(){' +
      'var el = document.getElementById(' + JSON.stringify(sectionId) + ');' +
      'if (!el) return { present:false };' +
      'var txt = (el.innerText||"");' +
      'var sels = ' + JSON.stringify(ROW_CONTAINERS[sectionId] || null) + ';' +
      'var rows = null, rowSel = "UNKNOWN";' +
      'if (sels) {' +
      '  rows = 0;' +
      '  for (var si = 0; si < sels.length; si++) {' +
      '    var cc = el.querySelector(sels[si]);' +
      '    var n = cc && cc.children ? cc.children.length : 0;' +
      '    if (n > rows) { rows = n; rowSel = sels[si]; }' +
      '  }' +
      '  if (!rows) rowSel = sels[0] + " (empty)";' +
      '}' +
      'var loading = /loading|載入中|計算中|calculating/i.test(txt);' +
      'var errEl = el.querySelectorAll(".error, .km-error, .psb-state--error, [data-error]").length;' +
      'return { present:true, active: el.classList.contains("active"), rows: rows, chars: txt.length,' +
      '         textHead: txt.slice(0, 300),' +
      '         rowSel: rowSel,' +
      '         tables: el.querySelectorAll("table").length,' +
      '         tbodyRows: el.querySelectorAll("tbody tr").length,' +
      '         allRows: el.querySelectorAll("tr").length,' +
      '         mutSamples: (window.__kmMutSamples||[]).slice(0,12),' +
      '         loading: loading, visibleErrors: errEl, lastMut: window.__kmLastMut||0, muts: window.__kmMut||0 };' +
      '})()');
  }

  // ---- one measured page open --------------------------------------------------------------------------------
  async function openSurface(S, scenario, cycle) {
    windowTag = { surface: S.name, scenario: scenario, cycle: cycle };
    var mark = events.length;
    var t0 = Date.now();
    lastActivity = t0;
    await installObserver(S.sectionId);
    await evalJs('window.showSection(' + JSON.stringify(S.routeKey) + ')');

    var firstContentMs = null, stableMs = null, st = null, why = null;
    while (Date.now() - t0 < MAX_WAIT_MS) {
      await sleep(250);
      st = await sectionState(S.sectionId);
      if (firstContentMs === null && st && st.present && st.active) firstContentMs = Date.now() - t0;
      var quietNet = Date.now() - lastActivity;
      // No mutation at all is maximally quiet, not zero quiet. The old default was the second, which is how a
      // page that had finished rendering could never be called stable.
      var quietDom = (st && st.lastMut) ? (Date.now() - st.lastMut) : (Date.now() - t0);
      var stillOpen = Object.keys(open);
      // A TIMEOUT must say which condition never came true, or the next person debugging it repeats this run.
      why = { firstContent: firstContentMs !== null, openRequests: stillOpen.length,
              openActions: stillOpen.map(function (k) { return open[k].rec.action; }),
              quietNet: quietNet, quietDom: quietDom };
      if (firstContentMs !== null && stillOpen.length === 0 && quietNet >= SETTLE_MS && quietDom >= SETTLE_MS) {
        stableMs = Date.now() - t0;
        break;
      }
    }
    var mine = events.slice(mark);
    var appReads = mine.filter(function (e) { return e.cls === G.CLASS.APPROVED_READ; });
    var dataReadyMs = appReads.length
      ? Math.max.apply(null, appReads.map(function (e) { return (e.t - t0) + (e.ms || 0); }))
      : null;

    // DUPLICATE = same action AND same body within one window. A second read of a different slice is not a
    // duplicate; it is a second read, and calling it a duplicate would manufacture a finding.
    var keys = {}, dup = 0;
    appReads.forEach(function (e) {
      var k = e.action + '|' + e.bodyKey;
      keys[k] = (keys[k] || 0) + 1;
      if (keys[k] > 1) dup++;
    });
    // N+1 = three or more of the SAME action with DIFFERENT bodies in one mount.
    var byAction = {};
    appReads.forEach(function (e) { (byAction[e.action] = byAction[e.action] || {})[e.bodyKey] = 1; });
    var nPlusOne = Object.keys(byAction).filter(function (a) { return Object.keys(byAction[a]).length >= 3; });

    var lifecycle = await evalJs('(function(){ var m = window.__kmLifecycleLog || []; return m.length; })()');

    return {
      surface: S.name, n: S.n, scenario: scenario, cycle: cycle,
      PAGE_FIRST_CONTENT_READY_MS: firstContentMs,
      PAGE_DATA_READY_MS: dataReadyMs,
      PAGE_FULL_STABLE_MS: stableMs,
      timed_out: stableMs === null,
      stall_reason: stableMs === null ? why : null,
      REQUEST_COUNT_TOTAL: mine.length,
      APPLICATION_READ_REQUEST_COUNT: appReads.length,
      DUPLICATE_REQUEST_COUNT: dup,
      FORBIDDEN_REQUEST_ABORT_COUNT: mine.filter(function (e) { return e.cls === G.CLASS.FORBIDDEN_ACTION; }).length,
      UNKNOWN_REQUEST_ABORT_COUNT: mine.filter(function (e) { return e.cls === G.CLASS.UNKNOWN; }).length,
      STATIC_ASSET_REQUEST_COUNT: mine.filter(function (e) { return e.cls === G.CLASS.STATIC_ASSET; }).length,
      actions: appReads.map(function (e) { return e.action; }),
      waterfall: appReads.map(function (e) { return { action: e.action, start: e.t - t0, ms: e.ms === undefined ? null : e.ms }; }),
      rows: st ? st.rows : null,
      chars: st ? st.chars : null,
      text_head: st ? st.textHead : null,
      row_container: st ? st.rowSel : null,
      tables: st ? st.tables : null,
      tbody_rows: st ? st.tbodyRows : null,
      all_rows: st ? st.allRows : null,
      mutation_samples: st ? st.mutSamples : null,
      loading_at_stable: st ? !!st.loading : null,
      visible_errors: st ? st.visibleErrors : null,
      read_http: appReads.map(function (e) { return e.http === undefined ? null : e.http; }),
      read_failed: appReads.filter(function (e) { return e.failed; }).map(function (e) { return e.action + ':' + e.failed; }),
      n_plus_one: nPlusOne,
      lifecycle_marks: lifecycle === undefined ? null : lifecycle
    };
  }

  // ---- the run ------------------------------------------------------------------------------------------------
  var list = SURFACES.filter(function (S) { return !ONLY || ONLY === true || S.routeKey === String(ONLY); });
  var samples = [];
  function note(r) {
    samples.push(r);
    log('  ' + String(r.scenario).padEnd(12) + String(r.surface).padEnd(24) +
      'stable=' + String(r.PAGE_FULL_STABLE_MS === null ? 'TIMEOUT' : r.PAGE_FULL_STABLE_MS).padStart(8) +
      '  data=' + String(r.PAGE_DATA_READY_MS === null ? '-' : r.PAGE_DATA_READY_MS).padStart(8) +
      '  req=' + String(r.REQUEST_COUNT_TOTAL).padStart(3) +
      '  app=' + String(r.APPLICATION_READ_REQUEST_COUNT).padStart(2) +
      '  dup=' + r.DUPLICATE_REQUEST_COUNT +
      '  abort=' + (r.FORBIDDEN_REQUEST_ABORT_COUNT + r.UNKNOWN_REQUEST_ABORT_COUNT) +
      '  rows=' + String(r.rows === null ? '-' : r.rows).padStart(5) +
      (r.loading_at_stable ? '  STILL-LOADING' : ''));
  }

  // Wait for the APP to be ready, not for a number of milliseconds. A fixed sleep that is too short makes
  // showSection undefined, the navigation never happens, and the surface reports a 180 s TIMEOUT that is
  // entirely the harness's — which is the most expensive kind of wrong measurement.
  async function hardReload() {
    await c.send('Page.navigate', { url: origin + '/index.html' });
    var t0 = Date.now(), ready = false;
    while (Date.now() - t0 < 60000) {
      await sleep(200);
      ready = await evalJs('typeof window.showSection === "function" && !!(window.KM && window.KM.lifecycle)');
      if (ready === true) break;
    }
    if (ready !== true) throw new Error('the application never became navigable after a reload');
    // The boot reads (getClientCapabilities, and any deployment-contract probe) are in flight at this point.
    // Letting them settle keeps them out of the first surface's request count.
    var q0 = Date.now();
    while (Date.now() - q0 < 15000) {
      await sleep(250);
      if (Object.keys(open).length === 0 && Date.now() - lastActivity > 1500) break;
    }
  }

  // A — COLD OPEN. One hard reload, then first open of each surface. The reload is what makes it cold:
  // window._opDbCache and every in-page cache are gone with the document.
  if (SCENARIOS.indexOf('A') !== -1) {
    log('SCENARIO A — COLD OPEN');
    for (var a = 0; a < list.length; a++) {
      await hardReload();
      note(await openSurface(list[a], 'A-cold', 0));
    }
  }

  // B — WARM RETURN. Away to a cheap neighbour and back, in the SAME document, so caches stay warm.
  if (SCENARIOS.indexOf('B') !== -1) {
    log('\nSCENARIO B — WARM RETURN');
    await hardReload();
    for (var b = 0; b < list.length; b++) {
      var other = list[(b + 1) % list.length];
      for (var w = 0; w < WARM; w++) {
        await openSurface(other, 'B-away', w + 1);
        note(await openSurface(list[b], 'B-return', w + 1));
      }
    }
  }

  // C — REPEATED ROUTE CYCLES. Whole rounds, counted per cycle. This is the amplification measurement.
  if (SCENARIOS.indexOf('C') !== -1) {
    log('\nSCENARIO C — REPEATED ROUTE CYCLES (' + CYCLES + ')');
    await hardReload();
    for (var cy = 1; cy <= CYCLES; cy++) {
      for (var k = 0; k < list.length; k++) note(await openSurface(list[k], 'C-cycle', cy));
    }
  }

  // D — RAPID ROUTE CYCLES. No settle wait between switches: the shape that exposes lifecycle duplication.
  if (SCENARIOS.indexOf('D') !== -1) {
    log('\nSCENARIO D — RAPID BURST');
    await hardReload();
    windowTag = { surface: 'RAPID_BURST', scenario: 'D-burst', cycle: 1 };
    var burstMark = events.length, bt0 = Date.now();
    for (var r2 = 0; r2 < 10; r2++) {
      var S2 = list[r2 % list.length];
      await evalJs('window.showSection(' + JSON.stringify(S2.routeKey) + ')');
      await sleep(400);
    }
    await sleep(15000);
    var burst = events.slice(burstMark);
    samples.push({ surface: 'RAPID_BURST', scenario: 'D-burst', cycle: 1,
      REQUEST_COUNT_TOTAL: burst.length,
      APPLICATION_READ_REQUEST_COUNT: burst.filter(function (e) { return e.cls === G.CLASS.APPROVED_READ; }).length,
      FORBIDDEN_REQUEST_ABORT_COUNT: burst.filter(function (e) { return e.cls === G.CLASS.FORBIDDEN_ACTION; }).length,
      UNKNOWN_REQUEST_ABORT_COUNT: burst.filter(function (e) { return e.cls === G.CLASS.UNKNOWN; }).length,
      DUPLICATE_REQUEST_COUNT: 0, PAGE_FULL_STABLE_MS: Date.now() - bt0,
      switches: 10, actions: burst.filter(function (e) { return e.cls === G.CLASS.APPROVED_READ; }).map(function (e) { return e.action; }) });
    log('  D-burst      10 switches in ' + (Date.now() - bt0) + ' ms, ' + burst.length + ' requests');
  }

  // E — IDLE + RETURN.
  if (SCENARIOS.indexOf('E') !== -1) {
    log('\nSCENARIO E — IDLE + RETURN');
    var idleMs = parseInt(arg('idle', '300000'), 10);
    await hardReload();
    var pick = list.filter(function (S) { return S.routeKey === 'ops' || S.routeKey === 'fc-summary'; });
    if (!pick.length) pick = [list[0]];
    for (var e1 = 0; e1 < pick.length; e1++) note(await openSurface(pick[e1], 'E-before', 1));
    log('  idling ' + (idleMs / 1000) + ' s …');
    await sleep(idleMs);
    for (var e2 = 0; e2 < pick.length; e2++) note(await openSurface(pick[e2], 'E-return', 1));
  }

  // F — READ-ONLY FILTER / LAZY PANEL. Tabs, filters, search and pagination only. Nothing that can write:
  // the click targets are filtered by text, and the guard refuses a write even if a filter were wrong.
  if (SCENARIOS.indexOf('F') !== -1) {
    log('\nSCENARIO F — READ-ONLY UI');
    await hardReload();
    for (var f = 0; f < list.length; f++) {
      var S3 = list[f];
      await openSurface(S3, 'F-mount', 1);
      windowTag = { surface: S3.name, scenario: 'F-interact', cycle: 1 };
      var fMark = events.length, ft0 = Date.now();
      var clicked = await evalJs('(function(){' +
        'var sec = document.getElementById(' + JSON.stringify(S3.sectionId) + ');' +
        'if (!sec) return 0;' +
        'var SAFE = /^(tab|filter|search|all|clear|reset|next|prev|page|\\d+|expand|collapse|detail|view|refresh)$/i;' +
        'var BAD = /(save|submit|confirm|adjust|dispatch|receive|generate|edit|import|delete|cancel|approve|complete|recalc|calculate|send)/i;' +
        'var els = sec.querySelectorAll("button, .tab, [role=tab], a.page-link");' +
        'var n = 0;' +
        'for (var i = 0; i < els.length && n < 6; i++) {' +
        '  var t = (els[i].innerText||els[i].textContent||"").trim();' +
        '  if (!t || BAD.test(t) || !SAFE.test(t)) continue;' +
        '  try { els[i].click(); n++; } catch(e) {}' +
        '}' +
        'return n; })()');
      await sleep(6000);
      var fEv = events.slice(fMark);
      samples.push({ surface: S3.name, n: S3.n, scenario: 'F-interact', cycle: 1,
        clicks: clicked || 0, PAGE_FULL_STABLE_MS: Date.now() - ft0,
        REQUEST_COUNT_TOTAL: fEv.length,
        APPLICATION_READ_REQUEST_COUNT: fEv.filter(function (e) { return e.cls === G.CLASS.APPROVED_READ; }).length,
        FORBIDDEN_REQUEST_ABORT_COUNT: fEv.filter(function (e) { return e.cls === G.CLASS.FORBIDDEN_ACTION; }).length,
        UNKNOWN_REQUEST_ABORT_COUNT: fEv.filter(function (e) { return e.cls === G.CLASS.UNKNOWN; }).length,
        DUPLICATE_REQUEST_COUNT: 0,
        actions: fEv.filter(function (e) { return e.cls === G.CLASS.APPROVED_READ; }).map(function (e) { return e.action; }) });
      log('  F-interact   ' + S3.name.padEnd(24) + clicked + ' read-only clicks, ' + fEv.length + ' requests');
    }
  }

  // ---- listener / lifecycle duplication, measured once at the end of the cycles ------------------------------
  var listeners = await evalJs('(function(){ try { return document.querySelectorAll("*").length; } catch(e){ return null; } })()');

  c.close(); chrome.kill();
  await new Promise(function (r) { server.close(r); });

  var report = {
    round: 'S8-R4A', started: started, finished: new Date().toISOString(),
    cycles: CYCLES, warm: WARM, scenarios: SCENARIOS,
    approved_action_count: AL.approvedActions().length,
    approved_actions: AL.approvedActions(),
    ephemeral_profile: profile, operator_profile_touched: false,
    safety: SAFETY, ledger: ledger, samples: samples,
    console_errors: consoleErrors, dom_nodes_at_end: listeners,
    events: events
  };
  fs.writeFileSync(path.join(OUT, 's8-r4a-samples.json'), JSON.stringify(report, null, 1));

  log('');
  log('AUTOMATED_FATIGUE_STATUS = COMPLETE');
  log('wrote ' + path.join(OUT, 's8-r4a-samples.json'));
  log('requests total=' + ledger.REQUEST_COUNT_TOTAL + '  app_read=' + ledger.APPLICATION_READ_REQUEST_COUNT +
      '  static=' + ledger.STATIC_ASSET_REQUEST_COUNT + '  third_party=' + ledger.THIRD_PARTY_REQUEST_COUNT +
      '  forbidden_abort=' + ledger.FORBIDDEN_REQUEST_ABORT_COUNT +
      '  unknown_abort=' + ledger.UNKNOWN_REQUEST_ABORT_COUNT);
  log('GAP_JOB_STATUS_REQUEST_SENT_COUNT = ' + SAFETY.GAP_JOB_STATUS_REQUEST_SENT_COUNT +
      '   intercepted = ' + SAFETY.GAP_JOB_STATUS_REQUEST_INTERCEPTED_COUNT);
  log('UNKNOWN_APPLICATION_REQUEST_SENT_COUNT = ' + SAFETY.UNKNOWN_APPLICATION_REQUEST_SENT_COUNT);
  log('WRITE_ACTIONS_SENT = ' + SAFETY.WRITE_ACTIONS_SENT);
})().catch(function (e) {
  log('RUNNER FAILED: ' + (e && e.stack || e));
  process.exitCode = 1;
});
