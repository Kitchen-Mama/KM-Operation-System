/**
 * S3-R5A §5/§6 — REQUEST BUDGET AND CONCURRENCY, MEASURED IN A BROWSER.
 *
 * Production reported peak_concurrent_requests = 7. A stub that answers instantly cannot reproduce that:
 * each request settles before the next is dispatched, so every page looks perfectly serial. The backend
 * this system talks to takes seconds, so the stub HOLDS each answer for a configurable delay — which is
 * the only way overlap becomes visible at all.
 *
 * Counted here: every request, with the action parsed off the wire, the number already open at dispatch,
 * and which page was being entered. Nothing is inferred from durations.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const REPO = path.join(__dirname, '..', '..');   // the repo root, not a machine-specific path
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe'
].find((c) => { try { return c && fs.existsSync(c); } catch (e) { return false; } });

const DELAY = parseInt(process.env.S3R5_DELAY || '900', 10);

function probe() {
  return ['<script>', '(function () {',
    '  var LOG = console.log.bind(console);',
    '  var P = { open: 0, peak: 0, n: 0, phase: "BOOT", rows: [] };',
    '  window.__C = P;',
    '  P.say = function () { try { LOG("RS5|" + Array.prototype.join.call(arguments, "|")); } catch (e) {} };',
    '  var REAL = window.fetch;',
    '  window.fetch = function (u, init) {',
    '    var url = String(u);',
    '    if (!/^https?:/i.test(url)) return REAL.apply(window, arguments);',
    '    var act = "(none)";',
    '    try { var m = /[?&]action=([^&]*)/.exec(url); act = m ? decodeURIComponent(m[1]) : "(post)"; } catch (e) {}',
    '    // THE INCLUDE IS WHAT SEPARATES A DUPLICATE FROM A STAGED READ. Two fcSummary requests are a defect',
    '    // if they ask the same question and by design if they ask for different slices.',
    '    try {',
    '      var mb = /[?&]km_body=([^&]*)/.exec(url);',
    '      if (mb) {',
    '        var j = JSON.parse(decodeURIComponent(mb[1]));',
    '        var inc = (j && j.payload && j.payload.include) || null;',
    '        if (inc) act += "[" + Object.keys(inc).map(function (k) { return k + "=" + inc[k]; }).join(",") + "]";',
    '      }',
    '    } catch (e) {}',
    '    P.n++; P.open++; if (P.open > P.peak) P.peak = P.open;',
    '    var at = P.open, id = P.n, ph = P.phase;',
    '    P.say("REQ", ph, id, act, "open_at_dispatch=" + at);',
    '    // HOLD THE ANSWER. An instantly-resolving stub reports every page as perfectly serial, which is a',
    '    // property of the stub and not of the page.',
    '    return new Promise(function (res) {',
    '      setTimeout(function () {',
    '        P.open--;',
    '        P.rows.push({ phase: ph, id: id, action: act, open_at_dispatch: at });',
    '        var body = { success: true, data: {}, meta: { rowsReturned: 0 } };',
    '        res({ ok: true, status: 200, redirected: true,',
    '          url: "https://script.googleusercontent.com/macros/echo?user_content_key=K" + id,',
    '          headers: { get: function () { return "application/json"; } },',
    '          json: function () { return Promise.resolve(body); },',
    '          text: function () { return Promise.resolve(JSON.stringify(body)); } });',
    '      }, ' + DELAY + ');',
    '    });',
    '  };',
    '  window.alert = function () {}; window.confirm = function () { return false; };',
    '  window.prompt = function () { return null; };',
    '  window.addEventListener("unhandledrejection", function () {});',
    '}());', '</script>'].join('\n');
}

const STEPS = [
  // RAPID: four routes with no settle window between them. A user who clicks through the menu produces
  // exactly this, and a sequential walk cannot show it.
  { phase: 'RAPID', expr: "showSection('fc-summary'); showSection('skuDetails'); showSection('sku-regional-details'); showSection('shippingplan')", wait: 12000 },
  { phase: 'FC_SUMMARY', expr: "showSection('fc-summary')", wait: 9000 },
  { phase: 'SKU_DETAILS', expr: "showSection('skuDetails')", wait: 9000 },
  { phase: 'SKU_REGIONAL', expr: "showSection('sku-regional-details')", wait: 9000 },
  { phase: 'PSB', expr: "showSection('product-strategy')", wait: 7000 },
  { phase: 'SHIPPINGPLAN', expr: "showSection('shippingplan')", wait: 9000 },
  { phase: 'SHIPPINGPLAN_REENTRY', expr: "showSection('fc-summary'); showSection('shippingplan')", wait: 9000 }
];

function driver() {
  return ['<pre id="__measurements"></pre>', '<script>', '(function () {',
    '  var P = window.__C, say = P.say;',
    '  var STEPS = ' + JSON.stringify(STEPS) + ';',
    '  var i = 0;',
    '  function step() {',
    '    if (i >= STEPS.length) {',
    '      var tp = (window.KM && window.KM.transport) || null;',
    '      var m = tp ? tp.metrics() : null;',
    '      say("TRANSPORT", JSON.stringify({',
    '        requests: m && m.requests, retries: m && m.retries, coalesced: m && m.coalesced,',
    '        recoveries: m && m.recoveries, byCode: m && m.byCode, byAction: m && m.byAction,',
    '        peak: tp && tp.peakConcurrentRequests(), open: tp && tp.openRequests() }));',
    '      say("OBSERVED", JSON.stringify({ requests: P.n, peak: P.peak, open: P.open }));',
    '      var byPhase = {};',
    '      P.rows.forEach(function (r) {',
    '        byPhase[r.phase] = byPhase[r.phase] || { n: 0, maxOpen: 0, actions: {} };',
    '        byPhase[r.phase].n++;',
    '        if (r.open_at_dispatch > byPhase[r.phase].maxOpen) byPhase[r.phase].maxOpen = r.open_at_dispatch;',
    '        byPhase[r.phase].actions[r.action] = (byPhase[r.phase].actions[r.action] || 0) + 1;',
    '      });',
    '      Object.keys(byPhase).forEach(function (k) { say("PHASE", k, JSON.stringify(byPhase[k])); });',
    '      say("END", "1");',
    '      return;',
    '    }',
    '    var s = STEPS[i++];',
    '    P.phase = s.phase;',
    '    try { (0, eval)(s.expr); } catch (e) { say("NAV_THREW", s.phase, String(e && e.message).slice(0, 90)); }',
    '    setTimeout(step, s.wait);',
    '  }',
    '  setTimeout(step, 7000);',
    '}());', '</script>'].join('\n');
}

function run() {
  if (!CHROME) { console.log('CHROME NOT FOUND'); return; }
  let html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
  html = html.replace(/<head([^>]*)>/i, '<head$1>' + probe());
  html = html.replace(/<\/body>/i, driver() + '</body>');
  const file = path.join(REPO, '__sp5-concurrency.html');
  fs.writeFileSync(file, html, 'utf8');
  try {
    const url = 'file:///' + file.split(path.sep).join('/').split(' ').join('%20');
    const r = cp.spawnSync(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
      '--disable-extensions', '--allow-file-access-from-files', '--virtual-time-budget=120000',
      '--enable-logging=stderr', '--log-level=0', '--dump-dom', url],
      { encoding: 'utf8', timeout: 300000, maxBuffer: 256 * 1024 * 1024 });
    String(r.stderr || '').split(String.fromCharCode(10))
      .filter((l) => l.indexOf('RS5|') !== -1)
      .forEach((l) => console.log(l.slice(l.indexOf('RS5|')).replace(/", source:.*$/, '')));
    console.log('--- status=' + r.status + ' ---');
  } finally { try { fs.unlinkSync(file); } catch (e) {} }
}
module.exports = { run };
if (require.main === module) run();
