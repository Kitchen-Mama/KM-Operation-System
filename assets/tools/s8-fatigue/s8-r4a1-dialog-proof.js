// =============================================================================================================
// S8-R4A1 — LIVE DIALOG PROOF
//
// The S8-R4A matrix stalled for three hours at the first Site Inventory step of scenario F. The named
// suspect was an unhandled native dialog: an open dialog blocks the renderer, so every later
// Runtime.evaluate waits for a reply the browser cannot send. That was a MECHANISM, consistent with the
// evidence — not something anyone had watched happen.
//
// This watches it happen, in a real browser, and then watches the repair remove it:
//
//   1  with NO dialog handler, Runtime.evaluate('confirm(...)') never returns        <- the hang, reproduced
//   2  the same command, bounded by the registry, fails in finite time               <- §3 contains it
//   3  with the handler installed, the same command RETURNS                          <- §4 removes it
//   4  and it returns FALSE — dismissed, the outcome that performs no write
//   5  alert and prompt behave the same, and prompt submits no text
//   6  evaluate keeps working afterwards, so a dialog costs one answer, not the run
//
// LOCAL ONLY. about:blank in an ephemeral profile. No application, no Production endpoint, no network.
//
// Run: node assets/tools/s8-fatigue/s8-r4a1-dialog-proof.js
// =============================================================================================================

'use strict';
var http = require('http');
var path = require('path');
var os = require('os');
var fs = require('fs');
var cp = require('child_process');
var R = require('./s8-r4a-resilience.js');

var CHROME = process.env.KM_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
var PORT = 9447;

var pass = 0, fail = 0;
function ok(c, l, x) {
  if (c) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + (x === undefined ? '' : '\n  got ' + JSON.stringify(x))); }
}
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function httpJson(url) {
  return new Promise(function (res, rej) {
    http.get(url, function (r) {
      var b = ''; r.on('data', function (d) { b += d; });
      r.on('end', function () { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}

// The same bounded client the runner uses, so what is proven here is what ships there.
function cdp(wsUrl, timeoutMs) {
  var ws = new WebSocket(wsUrl);
  var handlers = {};
  var reg = R.createPendingRegistry({ timeoutMs: timeoutMs });
  var ready = new Promise(function (res, rej) {
    ws.addEventListener('open', function () { res(); });
    ws.addEventListener('error', function () { rej(new Error('devtools websocket error')); });
  });
  ws.addEventListener('message', function (ev) {
    var msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
    if (typeof msg.id === 'number') { reg.deliver(msg); }
    else if (msg.method && handlers[msg.method]) { handlers[msg.method](msg.params || {}); }
  });
  return {
    ready: ready, registry: reg,
    on: function (m, fn) { handlers[m] = fn; },
    off: function (m) { delete handlers[m]; },
    send: function (method, params) {
      var id = reg.nextId();
      var p = reg.register(id, method);
      try { ws.send(JSON.stringify({ id: id, method: method, params: params || {} })); }
      catch (e) { reg.deliver({ id: id, error: String(e) }); }
      return p;
    },
    emit: function (method, params) {
      var id = reg.nextId();
      reg.register(id, method).catch(function () {});
      try { ws.send(JSON.stringify({ id: id, method: method, params: params || {} })); } catch (e) {}
    },
    close: function () { try { ws.close(); } catch (e) {} }
  };
}

(async function main() {
  var profile = fs.mkdtempSync(path.join(os.tmpdir(), 's8r4a1-dialog-'));
  console.log('profile  ' + profile + '   EPHEMERAL — OPERATOR_PROFILE_TOUCHED = NO');

  var chrome = cp.spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--remote-allow-origins=*', 'about:blank'
  ], { stdio: 'ignore' });

  var version = null;
  for (var i = 0; i < 60 && !version; i++) {
    try { version = await httpJson('http://127.0.0.1:' + PORT + '/json/version'); } catch (e) { await sleep(250); }
  }
  if (!version) { throw new Error('the browser never exposed a devtools endpoint'); }
  console.log('chrome   ' + version['Browser']);

  var targets = await httpJson('http://127.0.0.1:' + PORT + '/json/list');
  var page = targets.filter(function (t) { return t.type === 'page'; })[0];
  // A short bound here only so the proof is quick; the runner ships 20 s.
  var c = cdp(page.webSocketDebuggerUrl, 4000);
  await c.ready;
  await c.send('Page.enable');
  await c.send('Runtime.enable');

  function evaluate(expr) {
    return c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: false });
  }

  console.log('\n== 1. THE HANG, REPRODUCED ==');
  // No handler registered. The dialog opens, the renderer blocks, and the reply never comes.
  var t0 = Date.now();
  var r1 = await evaluate('confirm("S8-R4A1 proof: this blocks the renderer")')
    .then(function (v) { return { state: 'resolved', v: v }; },
          function (e) { return { state: 'rejected', code: e.code, elapsedMs: e.elapsedMs }; });
  eq(r1.state, 'rejected', 'WITH NO DIALOG HANDLER, Runtime.evaluate never returns — the stall mechanism is real');
  eq(r1.code, 'CDP_COMMAND_TIMEOUT', 'and the only thing that ends the wait is the §3 bound');
  ok(Date.now() - t0 >= 4000, 'it waited the full bound rather than failing for some other reason', Date.now() - t0);
  console.log('     (the unrepaired harness had no bound here: this is where three hours went)');

  console.log('\n== 2. THE PAGE IS STILL BLOCKED ==');
  // The dialog from step 1 is STILL OPEN. The bound freed the harness's promise, not the renderer — so every
  // later command on this page is queued behind a dialog nobody answered. This is the second half of the
  // incident and it is worth stating plainly: a timeout alone would have turned a three-hour stall into a
  // run that failed every remaining surface. §3 stops the harness hanging; only §4 keeps it measuring.
  var rBlocked = await evaluate('1 + 1')
    .then(function () { return 'resolved'; }, function (e) { return e.code; });
  eq(rBlocked, 'CDP_COMMAND_TIMEOUT', 'an ordinary expression ALSO times out while the dialog stands open');

  // Clear it the way the handler would have. The unrepaired harness never sent this command at all.
  c.emit('Page.handleJavaScriptDialog', { accept: false, promptText: '' });
  await sleep(300);
  var rCleared = await evaluate('1 + 1')
    .then(function (v) { return v && v.result && v.result.result && v.result.result.value; },
          function () { return 'REJECTED'; });
  eq(rCleared, 2, 'and the page recovers the moment the dialog is answered — nothing else was wrong with it');

  console.log('\n== 3. THE REPAIR ==');
  var dialogs = R.createDialogHandler();
  var seenDuringEvaluate = 0;
  c.on('Page.javascriptDialogOpening', function (p) {
    seenDuringEvaluate++;
    var out = dialogs.handle(p, { surface: 'proof', scenario: 'dialog-proof', cycle: 1 });
    c.emit(out.command.method, out.command.params);
  });

  var r2 = await evaluate('confirm("S8-R4A1 proof: dismissed?")')
    .then(function (v) { return { state: 'resolved', v: v }; },
          function (e) { return { state: 'rejected', code: e.code }; });
  eq(r2.state, 'resolved', 'WITH THE HANDLER INSTALLED, the identical command RETURNS');
  ok(seenDuringEvaluate >= 1, 'the dialog was observed while an evaluate was in flight', seenDuringEvaluate);
  eq(r2.v && r2.v.result && r2.v.result.result && r2.v.result.result.value, false,
     'AND confirm() RETURNED FALSE — dismissed, the outcome that performs no write');

  var r3 = await evaluate('alert("S8-R4A1 proof"), 1 + 1')
    .then(function (v) { return v && v.result && v.result.result && v.result.result.value; },
          function () { return 'REJECTED'; });
  eq(r3, 2, 'an alert is dismissed and the expression after it still evaluates');

  var r4 = await evaluate('prompt("name?", "default")')
    .then(function (v) { return v && v.result && v.result.result && v.result.result.value; },
          function () { return 'REJECTED'; });
  eq(r4, null, 'a prompt is dismissed and returns null — NO TEXT IS SUBMITTED');

  console.log('\n== 4. THE RUN CONTINUES ==');
  var r5 = await evaluate('6 * 7')
    .then(function (v) { return v && v.result && v.result.result && v.result.result.value; },
          function () { return 'REJECTED'; });
  eq(r5, 42, 'evaluate keeps working after the dialogs — one dialog costs one answer, not the run');
  eq(dialogs.count(), 3, 'three dialogs were handled');
  eq(dialogs.confirmAcceptedCount(), 0, 'CONFIRM_ACCEPTED_COUNT = 0');
  eq(dialogs.defaultAction, 'DISMISS', 'DIALOG_DEFAULT_ACTION = DISMISS');
  eq(c.registry.pendingCount(), 0, 'and no CDP command is left pending');

  c.close();
  chrome.kill();
  await sleep(300);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}

  console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILURES') + ' — ' + pass + ' passed, ' + fail + ' failed');
  console.log('DIALOG_DEFAULT_ACTION = DISMISS');
  console.log('CONFIRM_ACCEPTED_COUNT = ' + dialogs.confirmAcceptedCount());
  console.log('PRODUCTION_CONTACTED = NO   OPERATOR_PROFILE_TOUCHED = NO');
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) {
  console.error('PROOF FAILED: ' + (e && e.stack || e));
  process.exit(1);
});
