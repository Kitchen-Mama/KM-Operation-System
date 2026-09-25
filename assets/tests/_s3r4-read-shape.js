/**
 * S3-R4 §3/§4/§10/§11 — WHAT EACH PAGE ACTUALLY ASKS THE BACKEND FOR.
 *
 * This does NOT measure latency. It cannot: there is no Apps Script runtime and no Sheets credential in
 * this environment, so every duration it could print would be the duration of a local stub. What it can
 * measure, and what the round needs before it may optimise anything, is the SHAPE of the demand — which
 * action, with which includes, how many times, and whether navigating between two pages that share a
 * backend asks that backend the same broad question twice.
 *
 * The action and the include flags are read out of the request itself (km_body), not out of the source,
 * so a page that says one thing in a comment and sends another is reported on what it sent.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..', '..');   // the repo root, not a machine-specific path
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe'
].find((c) => { try { return c && fs.existsSync(c); } catch (e) { return false; } });

/** Each step is a phase name and an expression to evaluate, with a settle window after it. */
const STEPS = [
  { phase: 'SKU_DETAILS_COLD', expr: "showSection('skuDetails')", wait: 4000 },
  { phase: 'SKU_BTN_ENUM', expr: "(function(){window.__B=[].slice.call(document.querySelectorAll('#sku-section button, #sku-section .tab, #sku-section [data-tab]'));return window.__B.length;}())", wait: 500 },
  { phase: 'SKU_BTN_8', expr: "(function(){var b=window.__B[8]; if(!b) return 'none'; b.click(); return String(b.textContent||b.id).trim().slice(0,30);}())", wait: 2000 },
  { phase: 'SKU_BTN_9', expr: "(function(){var b=window.__B[9]; if(!b) return 'none'; b.click(); return String(b.textContent||b.id).trim().slice(0,30);}())", wait: 2000 },
  { phase: 'SKU_BTN_10', expr: "(function(){var b=window.__B[10]; if(!b) return 'none'; b.click(); return String(b.textContent||b.id).trim().slice(0,30);}())", wait: 2000 },
  { phase: 'SKU_BTN_11', expr: "(function(){var b=window.__B[11]; if(!b) return 'none'; b.click(); return String(b.textContent||b.id).trim().slice(0,30);}())", wait: 2000 },
  { phase: 'SKU_BTN_12', expr: "(function(){var b=window.__B[12]; if(!b) return 'none'; b.click(); return String(b.textContent||b.id).trim().slice(0,30);}())", wait: 2000 },
  { phase: 'SKU_BTN_13', expr: "(function(){var b=window.__B[13]; if(!b) return 'none'; b.click(); return String(b.textContent||b.id).trim().slice(0,30);}())", wait: 2000 },
  { phase: 'SKU_BTN_14', expr: "(function(){var b=window.__B[14]; if(!b) return 'none'; b.click(); return String(b.textContent||b.id).trim().slice(0,30);}())", wait: 2000 },
  { phase: 'SKU_BTN_15', expr: "(function(){var b=window.__B[15]; if(!b) return 'none'; b.click(); return String(b.textContent||b.id).trim().slice(0,30);}())", wait: 2000 },
  { phase: 'SKU_REGIONAL_COLD', expr: "showSection('sku-regional-details')", wait: 4000 },
  { phase: 'SKU_DETAILS_WARM', expr: "showSection('skuDetails')", wait: 3000 },
  { phase: 'SKU_REGIONAL_WARM', expr: "showSection('sku-regional-details')", wait: 3000 },
  { phase: 'SKU_DETAILS_WARM2', expr: "showSection('skuDetails')", wait: 3000 }
];

function probe() {
  return [
    '<script>',
    '(function () {',
    '  var RAW_LOG = console.log.bind(console);',
    '  var P = { phase: "BOOT", n: 0 };',
    '  window.__RS = P;',
    '  function say() { try { RAW_LOG("RS|" + Array.prototype.join.call(arguments, "|")); } catch (e) {} }',
    '  window.__RS.say = say;',
    '  var REAL = window.fetch;',
    '  window.fetch = function (u, init) {',
    '    var url = String(u);',
    '    if (!/^https?:/i.test(url)) return REAL.apply(window, arguments);',
    '    P.n++;',
    '    var action = "", inc = "";',
    '    try {',
    '      var mA = /[?&]action=([^&]*)/.exec(url);',
    '      action = mA ? decodeURIComponent(mA[1]) : "(none)";',
    '      var mB = /[?&]km_body=([^&]*)/.exec(url);',
    '      var body = mB ? decodeURIComponent(mB[1]) : String((init && init.body) || "");',
    '      var j = JSON.parse(body);',
    '      var pl = (j && (j.payload || j)) || {};',
    '      inc = JSON.stringify({ include: pl.include || null, scope: pl.scope || null });',
    '    } catch (e) { inc = "(unparsed)"; }',
    '    say("REQ", P.phase, P.n, action, inc.slice(0, 180));',
    '    var body2 = { success: true, data: {}, meta: { rowsReturned: 0 } };',
    '    return Promise.resolve({ ok: true, status: 200,',
    '      json: function () { return Promise.resolve(body2); },',
    '      text: function () { return Promise.resolve(JSON.stringify(body2)); } });',
    '  };',
    '  window.alert = function () {}; window.confirm = function () { return false; };',
    '  window.prompt = function () { return null; };',
    '  window.addEventListener("unhandledrejection", function () {});',
    '}());',
    '</script>'
  ].join('\n');
}

function driver() {
  return ['<pre id="__measurements"></pre>', '<script>', '(function () {',
    '  var P = window.__RS, say = P.say;',
    '  var STEPS = ' + JSON.stringify(STEPS) + ';',
    '  var i = 0;',
    '  function step() {',
    '    if (i >= STEPS.length) { say("END", P.n); return; }',
    '    var s = STEPS[i++];',
    '    P.phase = s.phase;',
    '    var before = P.n, t0 = Date.now(), r = "";',
    '    try { r = String((0, eval)(s.expr)); } catch (e) { r = "THREW " + String(e && e.message).slice(0, 80); }',
    '    var sync = Date.now() - t0;',
    '    setTimeout(function () {',
    '      say("PHASE", s.phase, "requests=" + (P.n - before), "sync_ms=" + sync, "result=" + r.slice(0, 40));',
    '      step();',
    '    }, s.wait);',
    '  }',
    '  setTimeout(step, 6000);',
    '}());', '</script>'].join('\n');
}

function run() {
  if (!CHROME) { console.log('CHROME NOT FOUND'); return; }
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  html = html.replace(/<head([^>]*)>/i, '<head$1>' + probe());
  html = html.replace(/<\/body>/i, driver() + '</body>');
  const file = path.join(ROOT, '__sp4-readshape.html');
  fs.writeFileSync(file, html, 'utf8');
  try {
    const url = 'file:///' + file.split(path.sep).join('/').split(' ').join('%20');
    const r = cp.spawnSync(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
      '--disable-extensions', '--allow-file-access-from-files', '--virtual-time-budget=90000',
      '--enable-logging=stderr', '--log-level=0', '--dump-dom', url],
      { encoding: 'utf8', timeout: 300000, maxBuffer: 256 * 1024 * 1024 });
    String(r.stderr || '').split(String.fromCharCode(10))
      .filter((l) => l.indexOf('RS|') !== -1)
      .forEach((l) => console.log(l.slice(l.indexOf('RS|')).replace(/", source:.*$/, '')));
    console.log('--- status=' + r.status + ' ---');
  } finally { try { fs.unlinkSync(file); } catch (e) {} }
}
module.exports = { run };
if (require.main === module) run();
