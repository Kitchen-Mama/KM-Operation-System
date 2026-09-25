/**
 * S3-R4 §5 — WEEKLY SHIPPING PLAN STALL BISECT.
 *
 * S3-R3 proved the stall exists. It could not say WHERE, because its only signal was a JSON blob
 * written at the end of a page walk: a stalled page publishes nothing after it stalls.
 *
 * This harness answers a different question, so it is built differently. Everything is STREAMED to
 * stderr as it happens, so the transcript survives the kill. The last line printed before the silence
 * IS the last completed boundary — that is the whole measurement.
 *
 * Three counters distinguish the three ways a page can stop:
 *
 *   MACROTASK HEARTBEAT stops, MO keeps climbing  -> microtask starvation (observer/promise recursion)
 *   MACROTASK HEARTBEAT stops, MO does not climb  -> a synchronous loop, inside whatever ran last
 *   MACROTASK HEARTBEAT keeps running             -> nothing is starved; the page is merely waiting
 *
 * The heartbeat deliberately closes over the ORIGINAL setTimeout, captured before the instrument
 * wraps it, so the instrument cannot inflate its own counters or be starved by its own bookkeeping.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..', '..');   // the repo root, not a machine-specific path
const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium'
];
function findChrome() {
  for (const c of CHROME_CANDIDATES) { try { if (c && fs.existsSync(c)) return c; } catch (e) {} }
  return null;
}

function probe(mode) {
  return [
    '<script>',
    '(function () {',
    '  var RAW_ST = window.setTimeout.bind(window);',
    '  var RAW_LOG = console.log.bind(console);',
    '  var C = { mo: 0, moBursts: 0, st: 0, stFired: 0, si: 0, micro: 0, raf: 0, beat: 0, logs: 0 };',
    '  var SEEN = Object.create(null);',
    '  window.__SP = { C: C };',
    '  function say() { try { RAW_LOG("SP4|" + Array.prototype.join.call(arguments, "|")); } catch (e) {} }',
    '  window.__SP.say = say;',
    '',
    '  // EVERY application console line is streamed. The page announces its own boundaries already',
    '  // ("[Lifecycle] Mounted:", "[ShippingPlan] mount"); the instrument only has to not lose them.',
    '  ["log", "warn", "error"].forEach(function (k) {',
    '    var real = console[k] ? console[k].bind(console) : RAW_LOG;',
    '    console[k] = function () {',
    '      C.logs++;',
    '      try {',
    '        var s = Array.prototype.map.call(arguments, function (a) {',
    '          try { return (a && a.message) ? String(a.message) : String(a); } catch (e) { return "?"; }',
    '        }).join(" ").slice(0, 200);',
    '        // Same rule as the request counter: a repeated line stops being evidence after the first few.',
    '        SEEN[s] = (SEEN[s] || 0) + 1;',
    '        if (s.indexOf("SP4|") !== 0 && SEEN[s] <= 3) RAW_LOG("SP4|APP|" + k + "|" + s);',
    '      } catch (e) {}',
    '      return real.apply(console, arguments);',
    '    };',
    '  });',
    '',
    '  // MutationObserver callbacks ARE microtasks. If this counter climbs while the heartbeat is dead,',
    '  // the macrotask queue is being starved by observer recursion and nothing else needs proving.',
    '  var MO = window.MutationObserver;',
    '  if (MO) {',
    '    var Wrapped = function (cb) {',
    '      return new MO(function (muts, obs) {',
    '        C.mo++;',
    '        if (C.mo % 2000 === 0) { C.moBursts++; say("MO", C.mo, "beat=" + C.beat); }',
    '        return cb.call(this, muts, obs);',
    '      });',
    '    };',
    '    Wrapped.prototype = MO.prototype;',
    '    window.MutationObserver = Wrapped;',
    '  }',
    '',
    '  var ST = window.setTimeout, SI = window.setInterval;',
    '  window.setTimeout = function (fn, ms) {',
    '    C.st++;',
    '    var rest = Array.prototype.slice.call(arguments, 2);',
    '    if (typeof fn !== "function") return ST.apply(window, arguments);',
    '    return ST(function () { C.stFired++; return fn.apply(null, rest); }, ms);',
    '  };',
    '  window.setInterval = function () { C.si++; return SI.apply(window, arguments); };',
    '  if (window.queueMicrotask) {',
    '    var QM = window.queueMicrotask;',
    '    window.queueMicrotask = function (f) { C.micro++; return QM.call(window, f); };',
    '  }',
    '  if (window.requestAnimationFrame) {',
    '    var RAF = window.requestAnimationFrame;',
    '    window.requestAnimationFrame = function (f) { C.raf++; return RAF.call(window, f); };',
    '  }',
    '',
    '  // THE HEARTBEAT. Raw setTimeout, so it measures the macrotask queue rather than the wrapper.',
    '  (function beat() {',
    '    C.beat++;',
    '    if (C.beat % 5 === 0) say("BEAT", C.beat, "mo=" + C.mo, "st=" + C.st + "/" + C.stFired,',
    '      "micro=" + C.micro, "raf=" + C.raf, "si=" + C.si, "api=" + C.api, "partial=" + C.partial);',
    '    RAW_ST(beat, 200);',
    '  }());',
    '',
    '  var isApi = function (u) { return /^https?:/i.test(String(u)); };',
    '  var REAL_FETCH = window.fetch;',
    '  C.api = 0; C.partial = 0;',
    '  window.fetch = function (u, init) {',
    '    var url = String(u);',
    '    if (!isApi(url)) { C.partial++; if (C.partial < 30) say("PARTIAL", url.slice(-42)); return REAL_FETCH.apply(window, arguments); }',
    '    C.api++;',
    '    // A MILLION IDENTICAL LINES IS NOT EVIDENCE, IT IS NOISE. The first forty name what is being',
    '    // asked for; after that only the rate matters, and the body of the request identifies the action.',
    '    if (C.api <= 8 || C.api % 200000 === 0) {',
    '      var act = "", meth = "";',
    '      try { meth = String((init && init.method) || "GET"); } catch (e) {}',
    '      try { act = String((init && init.body) || "").slice(0, 200); } catch (e) {}',
    '      // THE CALLER IS THE POINT. A url and a verb say what is being asked; the stack says who keeps asking.',
    '      var who = "";',
    '      try { throw new Error("x"); } catch (e) {',
    '        var st2 = String((e && e.stack) || "").split(String.fromCharCode(10)).slice(1, 8);',
    '        for (var q = 0; q < st2.length; q++) {',
    '          var ix = st2[q].lastIndexOf("/"); if (ix > 0) st2[q] = st2[q].slice(ix + 1);',
    '        }',
    '        who = st2.join(" <- ").slice(0, 420);',
    '      }',
    '      say("API", C.api, "beat=" + C.beat, meth, url.slice(0, 200), act, "WHO " + who);',
    '    }',
    '    if (' + JSON.stringify(mode) + ' === "reject") return Promise.reject(new TypeError("Failed to fetch"));',
    '    var body = { success: true, data: {}, meta: { rowsReturned: 0 } };',
    '    return Promise.resolve({ ok: true, status: 200,',
    '      json: function () { return Promise.resolve(body); },',
    '      text: function () { return Promise.resolve(JSON.stringify(body)); } });',
    '  };',
    '  window.alert = function () {}; window.confirm = function () { return false; };',
    '  window.prompt = function () { return null; };',
    '  window.addEventListener("error", function (e) { say("ERR", String(e.message).slice(0, 140)); });',
    '  window.addEventListener("unhandledrejection", function (e) {',
    '    var r = e && e.reason; say("REJ", String((r && r.message) || r).slice(0, 140));',
    '  });',
    '}());',
    '</script>'
  ].join('\n');
}

function driver(nav, extra) {
  return [
    '<pre id="__measurements"></pre>',
    '<script>',
    '(function () {',
    '  var say = window.__SP.say;',
    '  var RAW_ST = window.setTimeout;',
    '  function at(ms, f) { RAW_ST(f, ms); }',
    '  at(6000, function () {',
    '    say("PHASE", "boot-settled", "counters=" + JSON.stringify(window.__SP.C));',
    (extra || []).join('\n'),
    '    say("B", "00-before-nav");',
    '    var t0 = Date.now();',
    '    try {',
    '      ' + nav + ';',
    '      say("B", "99-nav-returned", Date.now() - t0 + "ms");',
    '    } catch (e) { say("B", "99-nav-THREW", String(e && e.message).slice(0, 140)); }',
    '    at(15000, function () { say("PHASE", "post-nav-15s", JSON.stringify(window.__SP.C)); });',
    '    at(40000, function () { say("PHASE", "post-nav-40s", JSON.stringify(window.__SP.C)); say("DONE", "1"); });',
    '  });',
    '}());',
    '</script>'
  ].join('\n');
}

function run(opts) {
  opts = opts || {};
  const chrome = findChrome();
  if (!chrome) { console.log('CHROME NOT FOUND'); return; }
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  html = html.replace(/<head([^>]*)>/i, '<head$1>' + probe(opts.mode || 'ok'));
  html = html.replace(/<\/body>/i, driver(opts.nav || "showSection('shippingplan')", opts.extra) + '</body>');
  const file = path.join(ROOT, '__sp4-bisect.html');
  fs.writeFileSync(file, html, 'utf8');
  try {
    const url = 'file:///' + file.split(path.sep).join('/').split(' ').join('%20');
    const r = cp.spawnSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
      '--disable-extensions', '--allow-file-access-from-files',
      '--virtual-time-budget=120000', '--enable-logging=stderr', '--log-level=0', '--dump-dom', url],
      { encoding: 'utf8', timeout: parseInt(opts.timeout || process.env.SP4_TIMEOUT || '180000', 10),
        maxBuffer: 256 * 1024 * 1024 });
    const lines = String(r.stderr || '').split(String.fromCharCode(10))
      .filter((l) => l.indexOf('SP4|') !== -1)
      .map((l) => l.slice(l.indexOf('SP4|')));
    console.log('--- status=' + r.status + '  lines=' + lines.length + ' ---');
    const max = parseInt(process.env.SP4_TAIL || '0', 10);
    (max ? lines.slice(-max) : lines).forEach((l) => console.log(l));
  } finally { try { fs.unlinkSync(file); } catch (e) {} }
}

module.exports = { run };
if (require.main === module) {
  run({ mode: process.argv[2] || 'ok', nav: process.argv[3] || undefined });
}
