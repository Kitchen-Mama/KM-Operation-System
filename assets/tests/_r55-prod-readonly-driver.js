/**
 * R55 PRODUCTION READ-ONLY ACCEPTANCE — a real Chrome on the PUBLISHED site, held open and driven step by step.
 *
 * NOT a test and NOT a fixture: it opens https://kitchen-mama.github.io/KM-Operation-System/ against the
 * production /exec and injects nothing into the page. It exists so every acceptance step leaves raw evidence:
 * screenshots, the console, and every request to Apps Script with its action and its answer.
 *
 * THE WRITE GUARD (the one thing it adds, and it acts on the NETWORK, not on the page):
 *   every request to script.google.com/macros/ is paused BEFORE it leaves Chrome and classified by its
 *   ACTION — never by its verb (workspace reads are POSTs) nor by its name. An action is let through only if
 *   the router's own contract makes it a read:
 *     - the five doGet branches of 01_router.gs (getOperationDb, getTable, getClientCapabilities,
 *       system.health, inventoryScope.registry.get), and
 *     - every key of rtrGetReadHandlers_() in 01_router.gs, read from the source at start-up (the table whose
 *       zero-write behaviour the R4A1 suite asserts behaviourally).
 *   Anything else — an unknown action, a body whose action disagrees with the query, an unparseable request —
 *   is FAILED in the browser (BlockedByClient) and recorded. It never reaches production.
 *
 * USAGE  node assets/tests/_r55-prod-readonly-driver.js <outDir> <controlPort>
 *   Control (127.0.0.1 only), JSON in, JSON out:
 *     POST /eval  {expr}            Runtime.evaluate (awaitPromise, returnByValue)
 *     POST /shot  {name}            <outDir>/<name>.png
 *     POST /mouse {type,x,y,button} Input.dispatchMouseEvent (mousePressed / mouseMoved / mouseReleased)
 *     POST /key   {key,code,keyCode,type?}
 *     POST /type  {text}            Input.insertText
 *     POST /mark  {label}           a step marker in the network log
 *     GET  /net                     the request log so far
 *     POST /stop                    writes net.json / console.json and exits
 */
'use strict';
var fs = require('fs');
var path = require('path');
var os = require('os');
var cp = require('child_process');
var http = require('http');

var ROOT = path.join(__dirname, '..', '..');
var SITE = 'https://kitchen-mama.github.io/KM-Operation-System/';
var OUT = path.resolve(process.argv[2] || '.');
var CTRL = Number(process.argv[3] || 9333);
fs.mkdirSync(path.join(OUT, 'bodies'), { recursive: true });

var ROUTER = fs.readFileSync(path.join(ROOT, 'assets/specs/active/apps-script/01_router.gs'), 'utf8');
var tbl = ROUTER.slice(ROUTER.indexOf('function rtrGetReadHandlers_'));
tbl = tbl.slice(0, tbl.indexOf('\n}'));
var READS = {};
(tbl.match(/'([A-Za-z.]+)'\s*:/g) || []).forEach(function (s) { READS[s.replace(/[':\s]/g, '')] = 'rtrGetReadHandlers_'; });
['getOperationDb', 'getTable', 'getClientCapabilities', 'system.health', 'inventoryScope.registry.get']
  .forEach(function (a) { READS[a] = 'doGet branch'; });
if (Object.keys(READS).length < 25) { console.error('STOP: router read table not parsed'); process.exit(3); }

var browser = require('./_p1b8c-visual-runner.js').findBrowser();
var profile = fs.mkdtempSync(path.join(os.tmpdir(), 'r55-prod-ro-'));
var chrome = cp.spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions',
  '--hide-scrollbars', '--force-device-scale-factor=1', '--remote-debugging-port=0', '--user-data-dir=' + profile,
  '--window-size=1440,1000', 'about:blank'], { stdio: 'ignore' });

var net = [], consoleLog = [], byId = {}, seq = 0;
function now() { return new Date().toISOString(); }
function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function cdp(wsUrl) {
  var ws = new WebSocket(wsUrl), id = 0, pending = {}, handlers = {};
  ws.onmessage = function (m) {
    var d = JSON.parse(m.data);
    if (d.id && pending[d.id]) { var p = pending[d.id]; delete pending[d.id]; if (d.error) p.rej(new Error(JSON.stringify(d.error))); else p.res(d.result); }
    else if (d.method && handlers[d.method]) handlers[d.method].forEach(function (h) { try { h(d.params); } catch (e) { console.error(e); } });
  };
  var open = new Promise(function (res, rej) { ws.onopen = res; ws.onerror = rej; });
  return {
    send: function (method, params) {
      return open.then(function () { return new Promise(function (res, rej) {
        var my = ++id; pending[my] = { res: res, rej: rej };
        ws.send(JSON.stringify({ id: my, method: method, params: params || {} }));
        setTimeout(function () { if (pending[my]) { delete pending[my]; rej(new Error('CDP timeout: ' + method)); } }, 120000);
      }); });
    },
    on: function (ev, h) { (handlers[ev] = handlers[ev] || []).push(h); }
  };
}

/* The action a request would run, from the query (transport puts it there for both verbs) and the body. */
function classify(req) {
  var u; try { u = new URL(req.url); } catch (e) { return { action: null, read: false, why: 'URL_UNPARSEABLE' }; }
  var qa = u.searchParams.get('action') || '';
  var ba = '';
  if (req.postData) { try { ba = String((JSON.parse(req.postData) || {}).action || ''); } catch (e) { return { action: qa, read: false, why: 'BODY_UNPARSEABLE' }; } }
  var kmBody = u.searchParams.get('km_body');
  if (kmBody) { try { var kb = JSON.parse(kmBody); if (kb && kb.action && kb.action !== qa) return { action: qa, read: false, why: 'KM_BODY_ACTION_MISMATCH ' + kb.action }; } catch (e) {} }
  if (qa && ba && qa !== ba) return { action: qa, read: false, why: 'QUERY_BODY_ACTION_MISMATCH ' + ba };
  var a = qa || ba;
  if (!a) return { action: null, read: false, why: 'NO_ACTION' };
  return READS[a] ? { action: a, read: true, why: READS[a] } : { action: a, read: false, why: 'NOT_A_CONTRACT_READ' };
}

var client;
function waitPort() {
  var f = path.join(profile, 'DevToolsActivePort'), t0 = Date.now();
  return (function loop() {
    if (fs.existsSync(f)) { var p = fs.readFileSync(f, 'utf8').split(/\r?\n/)[0]; if (p) return Promise.resolve(p); }
    if (Date.now() - t0 > 20000) return Promise.reject(new Error('no DevTools port'));
    return delay(100).then(loop);
  })();
}

waitPort().then(function (port) {
  return fetch('http://127.0.0.1:' + port + '/json/list').then(function (r) { return r.json(); });
}).then(function (list) {
  client = cdp(list.filter(function (t) { return t.type === 'page'; })[0].webSocketDebuggerUrl);
  client.on('Fetch.requestPaused', function (p) {
    var c = classify(p.request);
    var e = { seq: ++seq, t: now(), stage: 'guard', method: p.request.method, url: p.request.url.slice(0, 300),
      action: c.action, contract: c.why, decision: c.read ? 'ALLOWED_READ' : 'BLOCKED' };
    net.push(e);
    if (c.read) client.send('Fetch.continueRequest', { requestId: p.requestId }).catch(function () {});
    else client.send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'BlockedByClient' }).catch(function () {});
  });
  client.on('Network.requestWillBeSent', function (p) {
    var u = p.request.url;
    if (!/script\.google(usercontent)?\.com/.test(u)) return;
    var c = /script\.google\.com\/macros\//.test(u) ? classify(p.request) : { action: null, why: 'echo hop' };
    var e = byId[p.requestId];
    if (!e) { e = byId[p.requestId] = { seq: ++seq, t: now(), stage: 'network', requestId: p.requestId, method: p.request.method,
      action: c.action, contract: c.why, hops: [] }; net.push(e); }
    e.hops.push({ method: p.request.method, host: new URL(u).host, redirectStatus: p.redirectResponse ? p.redirectResponse.status : null });
  });
  client.on('Network.responseReceived', function (p) { var e = byId[p.requestId]; if (e) e.status = p.response.status; });
  client.on('Network.loadingFailed', function (p) { var e = byId[p.requestId]; if (e) { e.failed = p.errorText; e.blockedReason = p.blockedReason || null; } });
  client.on('Network.loadingFinished', function (p) {
    var e = byId[p.requestId]; if (!e) return;
    client.send('Network.getResponseBody', { requestId: p.requestId }).then(function (b) {
      var f = 'bodies/' + String(e.seq).padStart(4, '0') + '-' + String(e.action || 'x').replace(/[^A-Za-z0-9.]/g, '_') + '.json';
      fs.writeFileSync(path.join(OUT, f), b.body, 'utf8');
      e.body = f; e.bytes = b.body.length;
      try { var j = JSON.parse(b.body); e.success = j.success; e.error = j.error || (j.errors && j.errors[0]) || null; } catch (x) { e.nonJson = true; }
    }).catch(function (x) { e.bodyError = x.message; });
  });
  client.on('Runtime.consoleAPICalled', function (p) {
    consoleLog.push({ t: now(), type: p.type, text: p.args.map(function (a) { return a.value !== undefined ? String(a.value) : (a.description || a.type); }).join(' ').slice(0, 2000) });
  });
  client.on('Runtime.exceptionThrown', function (p) { consoleLog.push({ t: now(), type: 'exception', text: JSON.stringify(p.exceptionDetails).slice(0, 2000) }); });
  return client.send('Network.enable', { maxResourceBufferSize: 50000000, maxTotalBufferSize: 200000000 })
    .then(function () { return client.send('Network.setCacheDisabled', { cacheDisabled: true }); })
    .then(function () { return client.send('Fetch.enable', { patterns: [{ urlPattern: '*script.google.com/macros/*', requestStage: 'Request' }] }); })
    .then(function () { return client.send('Runtime.enable'); })
    .then(function () { return client.send('Page.enable'); })
    .then(function () { return client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }); })
    .then(function () { return client.send('Page.navigate', { url: SITE }); });
}).then(function () {
  fs.writeFileSync(path.join(OUT, 'guard-allowlist.json'), JSON.stringify(READS, null, 2));
  http.createServer(function (req, res) {
    var chunks = [];
    req.on('data', function (c) { chunks.push(c); });
    req.on('end', function () {
      var body = {}; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch (e) {}
      function reply(x) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(x)); }
      function fail(e) { reply({ error: String(e && e.message || e) }); }
      var u = req.url;
      if (u === '/eval') return client.send('Runtime.evaluate', { expression: body.expr, returnByValue: true, awaitPromise: true })
        .then(function (r) { reply(r.exceptionDetails ? { threw: JSON.stringify(r.exceptionDetails).slice(0, 1500) } : { value: r.result.value }); }).catch(fail);
      if (u === '/shot') return client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !!body.full })
        .then(function (r) { var f = path.join(OUT, body.name + '.png'); fs.writeFileSync(f, Buffer.from(r.data, 'base64')); reply({ file: f }); }).catch(fail);
      if (u === '/mouse') return client.send('Input.dispatchMouseEvent', { type: body.type, x: body.x, y: body.y, button: body.button || 'left',
        buttons: body.type === 'mouseReleased' ? 0 : (body.buttons === undefined ? 1 : body.buttons), clickCount: body.clickCount || 1 }).then(function () { reply({ ok: true }); }).catch(fail);
      if (u === '/key') {
        var k = { key: body.key, code: body.code || body.key, windowsVirtualKeyCode: body.keyCode || 0 };
        return client.send('Input.dispatchKeyEvent', Object.assign({ type: 'keyDown' }, k))
          .then(function () { return client.send('Input.dispatchKeyEvent', Object.assign({ type: 'keyUp' }, k)); })
          .then(function () { reply({ ok: true }); }).catch(fail);
      }
      if (u === '/type') return client.send('Input.insertText', { text: body.text }).then(function () { reply({ ok: true }); }).catch(fail);
      if (u === '/mark') { net.push({ seq: ++seq, t: now(), stage: 'MARK', label: body.label }); return reply({ ok: true, seq: seq }); }
      if (u === '/net') return reply(net);
      if (u === '/stop') {
        fs.writeFileSync(path.join(OUT, 'net.json'), JSON.stringify(net, null, 2));
        fs.writeFileSync(path.join(OUT, 'console.json'), JSON.stringify(consoleLog, null, 2));
        reply({ ok: true, requests: net.length });
        setTimeout(function () { try { chrome.kill(); } catch (e) {} process.exit(0); }, 300);
        return;
      }
      reply({ error: 'unknown ' + u });
    });
  }).listen(CTRL, '127.0.0.1', function () { console.log('READY ' + CTRL + ' reads=' + Object.keys(READS).length); });
}).catch(function (e) { console.error('STOP ' + e.message); try { chrome.kill(); } catch (x) {} process.exit(2); });
