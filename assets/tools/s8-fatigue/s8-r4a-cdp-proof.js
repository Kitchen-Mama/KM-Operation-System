// =============================================================================================================
// S8-R4A — CDP INTERCEPTION PROOF (LOCAL ONLY — NO PRODUCTION REQUEST)
//
//   node assets/tools/s8-fatigue/s8-r4a-cdp-proof.js
//
// §19 requires REQUEST_SENT_BEFORE_DECISION = NO. That is a claim about Chrome's behaviour, and a claim about
// behaviour is worth exactly as much as the measurement behind it. So this proves it the only way that counts:
//
//   1. start a LOCAL sink server that records every request that actually reaches it
//   2. start headless Chrome with the Fetch guard armed at requestStage 'Request'
//   3. load a local page that fires four requests — permitted and forbidden, at two different hosts
//   4. assert the sink saw exactly the one request that should have been allowed, and nothing else
//
// THE SINK IS THE WITNESS. If a forbidden request had been sent and then cancelled, the sink would still have
// recorded it — which is precisely the difference between intercepting at 'Request' and at 'Response', and the
// difference this proof exists to establish.
//
// FOUR REQUESTS, BECAUSE THERE ARE TWO WAYS TO GET THIS WRONG.
//
//   at the LOCAL host        permitted action  -> must ABORT (wrong endpoint: not the stable /exec)
//                            forbidden action  -> must ABORT (forbidden action, any endpoint)
//   at the APPLICATION host  permitted action  -> must CONTINUE
//                            forbidden action  -> must ABORT
//
// The local-host pair exercises the ACTION-FIRST branch; the application-host pair exercises the HOST branch.
// Running only one of them is how the first version of this proof passed while the guard was broken: it asked
// "is this the application host?" before looking at the action, so a forbidden action aimed anywhere else was
// waved through as third-party traffic — and the sink recorded gapJob.status.get arriving.
//
// NOTHING HERE TOUCHES PRODUCTION. Chrome resolves the application host to 127.0.0.1 via --host-resolver-rules,
// so the guard sees the host it would see in a real run while no Google endpoint is ever contacted.
// =============================================================================================================

'use strict';
var http = require('http');
var https = require('https');
var path = require('path');
var os = require('os');
var fs = require('fs');
var cp = require('child_process');

var AL = require('./s8-r3b-read-allowlist.js');
var G = require('./s8-r4a-cdp-guard.js');

var CHROME = process.env.KM_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
var DEBUG_PORT = 9333;
var APP_HOST = G.APP_HOST;
var PERMITTED = 'fcSummary.workspace.get';
var FORBIDDEN = 'gapJob.status.get';

function log(s) { process.stdout.write(s + '\n'); }

// ---- the sink: the witness for what actually left the browser ------------------------------------------------
var seen = [];
function sinkHandler(req, res) {
  seen.push((req.headers.host || '?') + req.url);
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end('{"success":true,"sink":true}');
}
// THE SINK SPEAKS TLS, because the allowlist requires the stable https /exec endpoint and refuses anything
// else. Serving the proof over http would make the permitted request fail for the WRONG reason
// (ENDPOINT_NOT_STABLE_EXEC) and the proof would then never exercise the allow path at all.
// The certificate is self-signed for the application host and Chrome is told to ignore the chain; no real
// certificate, host or endpoint is involved, and the sink still only ever listens on 127.0.0.1.
function makeSink(certDir) {
  try {
    cp.execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
      '-keyout', path.join(certDir, 'k.pem'), '-out', path.join(certDir, 'c.pem'),
      '-subj', '/CN=' + APP_HOST, '-addext', 'subjectAltName=DNS:' + APP_HOST + ',IP:127.0.0.1'],
      { stdio: 'ignore' });
  } catch (e) { return null; }
  return https.createServer({
    key: fs.readFileSync(path.join(certDir, 'k.pem')),
    cert: fs.readFileSync(path.join(certDir, 'c.pem'))
  }, sinkHandler);
}

function page(localBase, appBase) {
  var L = [];
  L.push('<!doctype html><meta charset="utf-8"><title>cdp guard proof</title><body><script>');
  L.push('window.__done = [];');
  L.push('function go(u, tag) {');
  L.push('  return fetch(u, { cache: "no-store" })');
  L.push('    .then(function (r) { return r.text(); })');
  L.push('    .then(function () { window.__done.push(tag + ":REACHED"); })');
  L.push('    .catch(function () { window.__done.push(tag + ":BLOCKED"); });');
  L.push('}');
  L.push('Promise.all([');
  L.push('  go("' + localBase + '/exec?action=' + PERMITTED + '&km_via=get&km_tc=1", "local_permitted"),');
  L.push('  go("' + localBase + '/exec?action=' + FORBIDDEN + '&km_via=get&km_tc=1", "local_forbidden"),');
  L.push('  go("' + appBase + '?action=' + PERMITTED + '&km_via=get&km_tc=1", "app_permitted"),');
  L.push('  go("' + appBase + '?action=' + FORBIDDEN + '&km_via=get&km_tc=1", "app_forbidden")');
  L.push(']).then(function () { window.__finished = true; });');
  L.push('</script></body>');
  return L.join('\n');
}

// ---- a minimal CDP client over Node's global WebSocket --------------------------------------------------------
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
    else if (msg.method && handlers[msg.method]) handlers[msg.method](msg.params || {});
  });
  return {
    ready: ready,
    on: function (m, fn) { handlers[m] = fn; },
    send: function (method, params) {
      id++;
      var myId = id;
      return new Promise(function (res) {
        pending[myId] = res;
        ws.send(JSON.stringify({ id: myId, method: method, params: params || {} }));
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
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

(async function main() {
  var failures = [];
  function check(label, cond, detail) {
    log((cond ? 'PASS  ' : 'FAIL  ') + label + (detail === undefined ? '' : '   [' + detail + ']'));
    if (!cond) failures.push(label);
  }

  log('S8-R4A CDP INTERCEPTION PROOF  (local only — no Production request)');
  log('===================================================================');

  // The design constants are asserted before anything is launched: a proof that ran against the wrong stage
  // would pass its own run and establish the opposite of what it claims.
  check('the guard intercepts at requestStage Request', G.CDP.request_stage === 'Request', G.CDP.request_stage);
  check('Response-stage interception is named forbidden', G.CDP.forbidden_stages.indexOf('Response') !== -1);
  check('Network.setRequestInterception is named forbidden',
    G.CDP.forbidden_domains.indexOf('Network.setRequestInterception') !== -1);
  check('the guard declares request_sent_before_decision = false', G.CDP.request_sent_before_decision === false);
  check('the guard is deny-by-default', G.CDP.deny_default === true);
  check('the abort is Fetch.failRequest', G.CDP.abort_method === 'Fetch.failRequest', G.CDP.abort_method);

  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 's8r4a-'));
  var sink = makeSink(dir);
  if (!sink) {
    log('FAIL  openssl is unavailable, so the TLS sink could not be created. The proof needs it: the');
    log('      allowlist refuses any endpoint that is not the stable https /exec, so an http sink would');
    log('      make the permitted request fail for the wrong reason. Install openssl and re-run.');
    process.exit(1);
  }
  await new Promise(function (r) { sink.listen(0, '127.0.0.1', r); });
  var port = sink.address().port;
  var localBase = 'https://127.0.0.1:' + port;
  // The stable /exec shape the allowlist requires, at the real application host.
  var appBase = 'https://' + APP_HOST + '/macros/s/AKfycbPROOF/exec';

  var file = path.join(dir, 'proof.html');
  fs.writeFileSync(file, page(localBase, appBase));
  var profile = fs.mkdtempSync(path.join(os.tmpdir(), 's8r4a-profile-'));
  log('sink   ' + localBase + '      app host mapped to it via --host-resolver-rules');

  var chrome = cp.spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + DEBUG_PORT, '--user-data-dir=' + profile,
    '--ignore-certificate-errors',
    // The application host resolves to the LOCAL SINK. Nothing in this proof reaches Google.
    '--host-resolver-rules=MAP ' + APP_HOST + ' 127.0.0.1:' + port,
    'about:blank'
  ], { stdio: 'ignore' });

  var version = null;
  for (var i = 0; i < 60 && !version; i++) {
    try { version = await httpJson('http://127.0.0.1:' + DEBUG_PORT + '/json/version'); } catch (e) { await sleep(250); }
  }
  if (!version) { log('FAIL  could not reach the Chrome DevTools endpoint'); chrome.kill(); process.exit(1); }
  log('chrome ' + version['Browser']);

  var targets = await httpJson('http://127.0.0.1:' + DEBUG_PORT + '/json/list');
  var pageTarget = targets.filter(function (t) { return t.type === 'page'; })[0];
  var c = cdp(pageTarget.webSocketDebuggerUrl);
  await c.ready;

  var ledger = G.newLedger();
  var decisions = [];
  c.on('Fetch.requestPaused', function (p) {
    var req = p.request || {};
    var d = G.classify({ url: req.url, method: req.method, postData: req.postData },
      { decide: AL.decide, actionOf: AL.actionFromRequest, isKnownAction: AL.isKnownAction,
        pageHost: '127.0.0.1:' + port });
    G.record(ledger, d);
    decisions.push(d);
    var cmd = G.commandFor(d, p.requestId);
    c.send(cmd.method, cmd.params);
  });

  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  await c.send('Page.enable');
  await c.send('Runtime.enable');
  await c.send('Page.navigate', { url: 'file:///' + file.replace(/\\/g, '/') });

  var finished = false;
  for (var k = 0; k < 80 && !finished; k++) {
    await sleep(250);
    var r = await c.send('Runtime.evaluate', { expression: 'window.__finished === true', returnByValue: true });
    finished = !!(r.result && r.result.result && r.result.result.value);
  }
  var done = await c.send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__done || [])', returnByValue: true });
  var outcomes = JSON.parse((done.result && done.result.result && done.result.result.value) || '[]');

  c.close(); chrome.kill();
  await new Promise(function (r) { sink.close(r); });

  log('');
  log('page outcomes : ' + outcomes.sort().join(', '));
  log('sink saw      : ' + (seen.length ? seen.join('   |   ') : '(nothing)'));
  log('decisions     : ' + decisions.map(function (d) {
    return (d.action || d.cls) + '=' + (d.allow ? 'ALLOW' : 'ABORT(' + d.code + ')'); }).join(', '));
  log('ledger        : total=' + ledger.REQUEST_COUNT_TOTAL +
      '  app_read=' + ledger.APPLICATION_READ_REQUEST_COUNT +
      '  static=' + ledger.STATIC_ASSET_REQUEST_COUNT +
      '  third_party=' + ledger.THIRD_PARTY_REQUEST_COUNT +
      '  forbidden_abort=' + ledger.FORBIDDEN_REQUEST_ABORT_COUNT +
      '  unknown_abort=' + ledger.UNKNOWN_REQUEST_ABORT_COUNT);
  log('');

  var sinkStr = seen.join(' ');
  var forbiddenHits = seen.filter(function (u) { return u.indexOf(FORBIDDEN) !== -1; });

  check('the forbidden action NEVER reached the sink, from either host', forbiddenHits.length === 0,
    forbiddenHits.length ? forbiddenHits.join(' ') : 'absent');
  check('the forbidden action was blocked at the application host',
    outcomes.indexOf('app_forbidden:BLOCKED') !== -1, outcomes.join(','));
  check('the forbidden action was blocked at a NON-application host too',
    outcomes.indexOf('local_forbidden:BLOCKED') !== -1, outcomes.join(','));
  check('the permitted action reached the sink at the application host',
    sinkStr.indexOf(APP_HOST) !== -1 && sinkStr.indexOf(PERMITTED) !== -1);
  check('the permitted action was allowed at the application host',
    outcomes.indexOf('app_permitted:REACHED') !== -1, outcomes.join(','));
  check('the permitted action was REFUSED at a non-stable endpoint',
    outcomes.indexOf('local_permitted:BLOCKED') !== -1, outcomes.join(','));
  check('exactly one request was counted as an approved application read',
    ledger.APPLICATION_READ_REQUEST_COUNT === 1, String(ledger.APPLICATION_READ_REQUEST_COUNT));
  check('two forbidden aborts were recorded', ledger.FORBIDDEN_REQUEST_ABORT_COUNT === 2,
    String(ledger.FORBIDDEN_REQUEST_ABORT_COUNT));
  check('one unknown/refused abort was recorded (the wrong-endpoint permitted request)',
    ledger.UNKNOWN_REQUEST_ABORT_COUNT === 1, String(ledger.UNKNOWN_REQUEST_ABORT_COUNT));
  check('the page HTML itself was classified as a static asset, not blocked',
    ledger.STATIC_ASSET_REQUEST_COUNT >= 1, String(ledger.STATIC_ASSET_REQUEST_COUNT));
  check('exactly one request reached the sink in total', seen.length === 1, String(seen.length));

  log('');
  log(failures.length === 0
    ? 'REQUEST_SENT_BEFORE_DECISION = NO — DEMONSTRATED. A forbidden request did not leave the browser, at\n'
      + 'either host, and the one permitted read did.'
    : 'PROOF FAILED — ' + failures.length + ' check(s): ' + failures.join(' | '));
  process.exitCode = failures.length === 0 ? 0 : 1;
})().catch(function (e) {
  log('PROOF ERROR: ' + (e && e.stack || e));
  process.exitCode = 1;
});
