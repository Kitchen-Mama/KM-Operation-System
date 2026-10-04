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
var R = require('./s8-r4a-resilience.js');

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
//
// EVERY command is bounded. The first version resolved only on a matching reply id, which is how one
// unanswered Runtime.evaluate parked the measurement loop for three hours inside an `await` that the loop's
// own MAX_WAIT_MS deadline could never interrupt. The registry owns id allocation, the timers and the
// tombstones; see s8-r4a-resilience.js §3 for why timed-out ids are never reused.
function cdp(wsUrl, opts) {
  opts = opts || {};
  var ws = new WebSocket(wsUrl);
  var handlers = {};
  var reg = R.createPendingRegistry({ timeoutMs: opts.timeoutMs, onTimeout: opts.onTimeout });
  var ctx = opts.context || function () { return {}; };
  var ready = new Promise(function (res, rej) {
    ws.addEventListener('open', function () { res(); });
    ws.addEventListener('error', function () { rej(new Error('devtools websocket error')); });
  });
  ws.addEventListener('message', function (ev) {
    var msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
    if (typeof msg.id === 'number') { reg.deliver(msg); }
    else if (msg.method && handlers[msg.method]) { handlers[msg.method](msg.params || {}); }
  });
  // A dead socket must settle every live command. Otherwise the process parks exactly as it did before.
  ws.addEventListener('close', function () { reg.rejectAll('devtools socket closed'); });
  return {
    ready: ready,
    registry: reg,
    on: function (m, fn) { handlers[m] = fn; },
    send: function (method, params) {
      var myId = reg.nextId();
      var p = reg.register(myId, method, ctx());
      try { ws.send(JSON.stringify({ id: myId, method: method, params: params || {} })); }
      catch (e) { reg.deliver({ id: myId, error: String(e) }); }
      return p;
    },
    // Fire-and-forget, for the abort/continue commands whose reply the measurement never reads. Without this
    // every intercepted request would leave a pending entry that could only ever end as a timeout.
    emit: function (method, params) {
      var myId = reg.nextId();
      var p = reg.register(myId, method, ctx());
      p.catch(function () {});
      try { ws.send(JSON.stringify({ id: myId, method: method, params: params || {} })); } catch (e) {}
    },
    close: function () { try { ws.close(); } catch (e) {} }
  };
}
// Resource teardown, reachable from the top-level catch. A failure before the run proper used to leave the
// process alive forever: process.exitCode only takes effect when the event loop drains, and a spawned Chrome
// plus a listening server keep it from ever draining. The hang this round repaired had a second mouth.
var teardown = function () {};

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
  var windowTag = { surface: null, scenario: null, cycle: 0 };
  var cdpTimeouts = [];
  var ckpt = R.createCheckpointWriter(OUT);
  var dialogs = R.createDialogHandler();
  var watchdog = R.createWatchdog({
    thresholdMs: parseInt(arg('watchdog', String(R.WATCHDOG_THRESHOLD_MS)), 10),
    onTrip: function (dump) { onWatchdogTrip(dump); }
  });

  var c = cdp(targets.filter(function (t) { return t.type === 'page'; })[0].webSocketDebuggerUrl, {
    timeoutMs: parseInt(arg('cdptimeout', String(R.CDP_COMMAND_TIMEOUT_MS)), 10),
    context: function () { return windowTag; },
    onTimeout: function (info) {
      cdpTimeouts.push(info);
      log('  !! CDP_COMMAND_TIMEOUT ' + info.method + ' after ' + info.elapsedMs + 'ms' +
          (info.surface ? ' on ' + info.surface + ' [' + info.scenario + ']' : ''));
    }
  });
  // Everything that can hold the event loop open is now known, so the failure path can release it. And the
  // watchdog is armed HERE — before the CDP domains are enabled — because a hang during setup is still a
  // hang, and the first version armed it only once the run proper had started.
  teardown = function () {
    try { watchdog.stop(); } catch (e) {}
    try { c.close(); } catch (e) {}
    try { chrome.kill(); } catch (e) {}
    try { server.close(); } catch (e) {}
  };
  watchdog.start();

  await c.ready;

  // ---- instrumentation state --------------------------------------------------------------------------------
  var ledger = G.newLedger();
  // S8-R4B-0 — the open-request map lives in the resilience module so its eviction rules can be driven
  // by a test with an injected clock. See that module for why an eviction is never a completion.
  var openMap = R.createOpenMap({ onEvict: function (ev) {
    // Every eviction is announced. A silently forgiven request is how the first defect survived a whole
    // matrix: the run simply stopped being able to call anything stable and never said why.
    log('  !! OPEN_MAP_EVICTION ' + ev.why + '  ' + (ev.action || '(no action)') +
        '  open ' + ev.openMs + 'ms  from ' + ev.scenario + '/' + ev.surface);
  } });
  var events = [];            // every request, with the window it belonged to
  var consoleErrors = [];
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
    if (d.cls === G.CLASS.APPROVED_READ && p.networkId) openMap.add(p.networkId, rec);

    // emit, not send: the measurement never reads the reply to a continue/abort, and registering a command
    // whose result is discarded would leave one pending entry per intercepted request, each of which could
    // only ever end its life as a timeout.
    var cmd = G.commandFor(d, p.requestId);
    c.emit(cmd.method, cmd.params);
  });

  function settleFrom(id) {
    if (!openMap.settle(id)) return;
    lastActivity = Date.now();
  }

  // ---- S8-R4B-0 — ABANDONED READS LEAVE THE OPEN MAP ---------------------------------------------------------
  //
  // THE DEFECT. `open` was written on Fetch.requestPaused and deleted only by settleFrom. Scenario D's rapid
  // burst navigates away mid-flight BY DESIGN; a read the renderer drops without a matching
  // Network.loadingFinished or loadingFailed stayed in the map forever, and the stability predicate
  // `stillOpen.length === 0` could never be true again. Four of 161 windows reported a null stable time.
  //
  // AN EVICTION IS NOT A COMPLETION, and the whole correctness of this rests on that distinction. `ms` is the
  // measured backend duration and is written ONLY by settleFrom, from a real Network event. Writing it here
  // would invent a duration for a request that never answered, and that invented number would then flow into
  // every median in the report. An evicted record carries `abandoned` and `abandoned_after_ms` instead —
  // named so they cannot be read as a duration — and never gains an `ms`, an `http` or a success.
  c.on('Network.loadingFinished', function (p) { settleFrom(p.requestId); lastActivity = Date.now(); });
  c.on('Network.loadingFailed', function (p) {
    var o = openMap.get(p.requestId);
    if (o) { o.rec.failed = String(p.errorText || 'failed'); }
    settleFrom(p.requestId); lastActivity = Date.now();
  });
  c.on('Network.responseReceived', function (p) {
    var o = openMap.get(p.requestId);
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

  // ---- §4 JavaScript dialogs ---------------------------------------------------------------------------------
  // An open native dialog blocks the renderer, so every later Runtime.evaluate hangs. That is the most likely
  // trigger of the three-hour stall in R4A_HUNG_RUN_1, and it is unobservable without this handler.
  //
  // The dialog is ALWAYS answered, and for an application dialog always with DISMISS — the outcome that
  // performs no write. A confirm() is the last gate in front of a destructive action, so accepting one is the
  // single click that could turn a read-only run into a write; CONFIRM_ACCEPTED_COUNT is an invariant.
  var abortSurface = null;    // set when a dialog cannot be proven read-only-safe
  c.on('Page.javascriptDialogOpening', function (p) {
    var out = dialogs.handle(p, windowTag);
    log('  !! DIALOG ' + out.record.type + ' -> ' + out.decision.action +
        ' on ' + (windowTag.surface || '?') + ' [' + (windowTag.scenario || '?') + ']  "' +
        out.record.message.slice(0, 120) + '"');
    if (out.decision.action === 'ABORT_SURFACE') { abortSurface = out.record; }
    c.emit(out.command.method, out.command.params);
    lastActivity = Date.now();
  });

  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  await c.send('Network.enable');
  await c.send('Page.enable');
  await c.send('Runtime.enable');
  await c.send('Log.enable');

  // A timed-out evaluate returns undefined rather than throwing. The caller is a measurement loop whose job
  // is to keep its own deadline; turning one dead command into a thrown run is the opposite of the repair.
  async function evalJs(expr) {
    var r;
    try { r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: false }); }
    catch (e) { return undefined; }
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
    abortSurface = null;
    var tmo0 = cdpTimeouts.length;
    var evi0 = openMap.evictionCount();
    var mark = events.length;
    var t0 = Date.now();
    lastActivity = t0;
    watchdog.progress(scenario + ':' + S.name);
    await installObserver(S.sectionId);
    await evalJs('window.showSection(' + JSON.stringify(S.routeKey) + ')');

    var firstContentMs = null, stableMs = null, st = null, why = null, ended = null;
    while (Date.now() - t0 < MAX_WAIT_MS) {
      await sleep(250);
      // A surface whose dialog could not be proven read-only-safe is abandoned for measurement, and a surface
      // whose commands are timing out is not being measured either — in both cases continuing to poll would
      // spend the remaining budget learning nothing.
      if (abortSurface) { ended = 'DIALOG_ABORT'; break; }
      if (cdpTimeouts.length - tmo0 >= 2) { ended = 'CDP_TIMEOUT'; break; }
      // Age out reads the application itself has already abandoned. This can only REMOVE a blocker on
      // `stillOpen.length === 0`; the quiet-network and quiet-DOM conditions below are untouched, so an
      // eviction cannot by itself make a page look stable.
      openMap.evictStale();
      st = await sectionState(S.sectionId);
      if (firstContentMs === null && st && st.present && st.active) firstContentMs = Date.now() - t0;
      var quietNet = Date.now() - lastActivity;
      // No mutation at all is maximally quiet, not zero quiet. The old default was the second, which is how a
      // page that had finished rendering could never be called stable.
      var quietDom = (st && st.lastMut) ? (Date.now() - st.lastMut) : (Date.now() - t0);
      var stillOpen = openMap.ids();
      // A TIMEOUT must say which condition never came true, or the next person debugging it repeats this run.
      why = { firstContent: firstContentMs !== null, openRequests: stillOpen.length,
              openActions: openMap.actions(),
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
      ended: ended,
      dialog_abort: abortSurface ? { type: abortSurface.type, message: abortSurface.message } : null,
      cdp_timeouts: cdpTimeouts.length - tmo0,
      // Recorded per window so a measurement taken while a read was abandoned is identifiable afterwards,
      // rather than silently indistinguishable from a clean one.
      open_map_evictions: openMap.evictionCount() - evi0,
      evicted: openMap.evictionList().slice(evi0).map(function (e) { return e.why + ':' + (e.action || '?'); }),
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

  // §5 — every completed window is durable the moment it completes. The previous runner wrote samples once,
  // at the end, so a single unsettled promise cost three hours of real measurement. Losing window N+1 must
  // cost window N+1 and nothing else.
  function persist(r) {
    watchdog.progress((r && r.scenario) + ':' + (r && r.surface));
    ckpt.record(r, { scenario: r && r.scenario, surface: r && r.surface, cycle: r && r.cycle,
                     status: 'RUNNING', safety: safetySnapshot() });
  }
  function safetySnapshot() {
    return { GAP_JOB_STATUS_REQUEST_SENT_COUNT: SAFETY.GAP_JOB_STATUS_REQUEST_SENT_COUNT,
             GAP_JOB_STATUS_REQUEST_INTERCEPTED_COUNT: SAFETY.GAP_JOB_STATUS_REQUEST_INTERCEPTED_COUNT,
             UNKNOWN_APPLICATION_REQUEST_SENT_COUNT: SAFETY.UNKNOWN_APPLICATION_REQUEST_SENT_COUNT,
             UNKNOWN_APPLICATION_REQUEST_ABORT_COUNT: SAFETY.UNKNOWN_APPLICATION_REQUEST_ABORT_COUNT,
             WRITE_ACTIONS_SENT: SAFETY.WRITE_ACTIONS_SENT,
             CONFIRM_ACCEPTED_COUNT: dialogs.confirmAcceptedCount(),
             DIALOG_COUNT: dialogs.count(),
             CDP_COMMAND_TIMEOUT_COUNT: cdpTimeouts.length,
             OPEN_MAP_EVICTION_COUNT: openMap.evictionCount(),
             EPHEMERAL_PROFILE_ONLY: true, ledger: ledger };
  }

  // §6 — the watchdog dumps what the run was doing and exits non-zero. It is a CLIENT exit: it sends nothing
  // to Production and cancels no Production request. The worst it can do is stop measuring.
  // Defensive about everything it reads: the watchdog is armed BEFORE the CDP domains are enabled, so it can
  // trip while half of this state is still undefined. A dump that throws is a watchdog that does not fire.
  function onWatchdogTrip(dump) {
    try { dump.windowTag = windowTag; } catch (e) {}
    try { dump.pendingCdpCommands = c.registry.snapshot(); } catch (e) { dump.pendingCdpCommands = 'unavailable'; }
    try { dump.openRequests = openMap.actions(); } catch (e) { dump.openRequests = 'unavailable'; }
    try { dump.dialogs = dialogs.dialogs().slice(-5); } catch (e) { dump.dialogs = 'unavailable'; }
    try { dump.cdpTimeouts = cdpTimeouts.slice(-5); } catch (e) { dump.cdpTimeouts = 'unavailable'; }
    try { dump.completedWindows = samples.length; } catch (e) { dump.completedWindows = 0; }
    log('');
    log('WATCHDOG TRIPPED — no progress for ' + dump.idleMs + ' ms (threshold ' + dump.thresholdMs + ')');
    log('  last progress     : ' + dump.lastProgress);
    log('  pending CDP cmds  : ' + JSON.stringify(dump.pendingCdpCommands));
    log('  open requests     : ' + JSON.stringify(dump.openRequests));
    log('  dialogs seen      : ' + JSON.stringify(dump.dialogs));
    ckpt.consolidate('s8-r4a-watchdog-dump.json', dump);
    ckpt.note({ scenario: windowTag.scenario, surface: windowTag.surface, cycle: windowTag.cycle,
                status: 'WATCHDOG_EXIT', detail: dump });
    log('AUTOMATED_FATIGUE_STATUS = WATCHDOG_EXIT');
    teardown();
    process.exit(3);
  }

  function note(r) {
    samples.push(r);
    persist(r);
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
    // The old document is gone and so is any read it had in flight. Entries left here would otherwise block
    // the stability predicate for the rest of the run — which is exactly what happened to scenario E.
    openMap.evictAll('DOCUMENT_REPLACED');
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
      if (openMap.size() === 0 && Date.now() - lastActivity > 1500) break;
    }
  }

  // ---- §11 human test coordination ---------------------------------------------------------------------------
  // Manual testing may run alongside this. Only ONE surface is under timing measurement at a time, and the
  // live surface is in s8-r4a-progress.json, rewritten after every window — so the avoid-list is readable
  // while the matrix runs rather than only in this banner.
  log('');
  log('AUTOMATED_FATIGUE_STATUS = RUNNING');
  log('HUMAN_TEST_SAFE = YES');
  log('HUMAN_TEST_AVOID = the surface named in ' + ckpt.files.progress + ' (one at a time)');
  log('HUMAN_TEST_SAFE_SURFACES = every other surface of the ' + list.length + ' measured');
  log('ALSO AVOID = starting a gap recalculation during Site Inventory measurement');
  log('');
  ckpt.note({ status: 'RUNNING', detail: { human_test_safe: true, surfaces: list.length } });

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
    var burstSample = { surface: 'RAPID_BURST', scenario: 'D-burst', cycle: 1,
      REQUEST_COUNT_TOTAL: burst.length,
      APPLICATION_READ_REQUEST_COUNT: burst.filter(function (e) { return e.cls === G.CLASS.APPROVED_READ; }).length,
      FORBIDDEN_REQUEST_ABORT_COUNT: burst.filter(function (e) { return e.cls === G.CLASS.FORBIDDEN_ACTION; }).length,
      UNKNOWN_REQUEST_ABORT_COUNT: burst.filter(function (e) { return e.cls === G.CLASS.UNKNOWN; }).length,
      DUPLICATE_REQUEST_COUNT: 0, PAGE_FULL_STABLE_MS: Date.now() - bt0,
      switches: 10, actions: burst.filter(function (e) { return e.cls === G.CLASS.APPROVED_READ; }).map(function (e) { return e.action; }) };
    samples.push(burstSample); persist(burstSample);
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
    // Paused rather than given a wider threshold: a threshold wide enough to cover a planned five-minute
    // idle would also hide a real five-minute stall everywhere else in the run.
    watchdog.pause('scenario-E-idle');
    await sleep(idleMs);
    watchdog.resume();
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
      var fSample = { surface: S3.name, n: S3.n, scenario: 'F-interact', cycle: 1,
        clicks: clicked || 0, PAGE_FULL_STABLE_MS: Date.now() - ft0,
        REQUEST_COUNT_TOTAL: fEv.length,
        APPLICATION_READ_REQUEST_COUNT: fEv.filter(function (e) { return e.cls === G.CLASS.APPROVED_READ; }).length,
        FORBIDDEN_REQUEST_ABORT_COUNT: fEv.filter(function (e) { return e.cls === G.CLASS.FORBIDDEN_ACTION; }).length,
        UNKNOWN_REQUEST_ABORT_COUNT: fEv.filter(function (e) { return e.cls === G.CLASS.UNKNOWN; }).length,
        DUPLICATE_REQUEST_COUNT: 0,
        dialog_abort: abortSurface ? { type: abortSurface.type, message: abortSurface.message } : null,
        actions: fEv.filter(function (e) { return e.cls === G.CLASS.APPROVED_READ; }).map(function (e) { return e.action; }) };
      samples.push(fSample); persist(fSample);
      log('  F-interact   ' + S3.name.padEnd(24) + clicked + ' read-only clicks, ' + fEv.length + ' requests');
    }
  }

  // ---- listener / lifecycle duplication, measured once at the end of the cycles ------------------------------
  var listeners = await evalJs('(function(){ try { return document.querySelectorAll("*").length; } catch(e){ return null; } })()');

  watchdog.stop();
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
    // S8-R4A1 resilience evidence. Recorded in the report because "the harness did not hang" is a claim that
    // has to be checkable after the fact, not a thing the absence of a hang implies.
    resilience: {
      CDP_COMMAND_TIMEOUT_MS: c.registry.timeoutMs,
      CDP_COMMAND_TIMEOUT_COUNT: cdpTimeouts.length,
      CDP_COMMAND_TIMEOUTS: cdpTimeouts,
      CDP_PENDING_AT_EXIT: c.registry.pendingCount(),
      WATCHDOG_THRESHOLD_MS: watchdog.thresholdMs,
      WATCHDOG_TRIPPED: watchdog.isTripped(),
      DIALOG_COUNT: dialogs.count(),
      DIALOG_DEFAULT_ACTION: dialogs.defaultAction,
      CONFIRM_ACCEPTED_COUNT: dialogs.confirmAcceptedCount(),
      DIALOGS: dialogs.dialogs(),
      ABORTED_SURFACES: dialogs.abortedSurfaces(),
      OPEN_MAP_EVICTION_COUNT: openMap.evictionCount(),
      OPEN_MAP_EVICTIONS: openMap.evictionList(),
      OPEN_MAP_STALE_BOUND_MS: openMap.staleMs,
      CHECKPOINT_WRITES: ckpt.writeCount(),
      CHECKPOINTED_WINDOWS: ckpt.count()
    },
    events: events
  };
  fs.writeFileSync(path.join(OUT, 's8-r4a-samples.json'), JSON.stringify(report, null, 1));
  ckpt.note({ status: 'COMPLETE', scenario: null, surface: null, cycle: null });

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
  log('CONFIRM_ACCEPTED_COUNT = ' + dialogs.confirmAcceptedCount() +
      '   DIALOG_COUNT = ' + dialogs.count() +
      '   CDP_COMMAND_TIMEOUT_COUNT = ' + cdpTimeouts.length +
      '   WATCHDOG_TRIPPED = ' + (watchdog.isTripped() ? 'YES' : 'NO'));
})().catch(function (e) {
  log('RUNNER FAILED: ' + (e && e.stack || e));
  log('AUTOMATED_FATIGUE_STATUS = FAILED');
  // Tear down explicitly and exit. Setting process.exitCode alone leaves a spawned Chrome and a listening
  // server holding the event loop open, which is a hang wearing a failure's clothes.
  try { teardown(); } catch (e2) {}
  process.exit(1);
});
