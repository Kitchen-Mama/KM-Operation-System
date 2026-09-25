/**
 * ==================================================================================================
 * S3-R3 — THE RUNTIME LIFECYCLE RUNNER: A REAL BROWSER, THE REAL SHELL, THE REAL ROUTER
 * ==================================================================================================
 *
 * S3-R2 closed one page and left twelve measured only structurally. It also proved WHY that debt had
 * to be paid in a browser rather than in a grep: two pages with the SAME static signature had
 * different runtime ownership, and the count that looked like a defect was not one. So this does not
 * read source. It loads index.html in headless Chrome, drives the production router, and counts what
 * actually happens.
 *
 * WHAT IS INSTRUMENTED, AND WHY EACH ONE IS THE HONEST CHOKE POINT
 *
 *   window.fetch          EVERY request bottoms out here. km-transport calls it through `_fetch` and
 *                         operation-system-db-api calls it directly, so counting anywhere else would
 *                         miss one of the two. The count is split: API calls (the Apps Script
 *                         endpoint) are the canonical reads this round is about; HTML partial fetches
 *                         are the router loading a section's markup and are reported separately so
 *                         they can never be mistaken for a business read.
 *
 *   add/removeEventListener on window and document — the only two targets a page can leak onto that
 *                         outlive its own DOM. A listener on an element inside a section dies with
 *                         the section; one on `document` does not.
 *
 *   setInterval/clearInterval — a live interval after unmount keeps working forever.
 *
 * THE ONE SUBSTITUTION, and it is the same one the P1-B8C visual runner already makes: the transport
 * answers from a stub instead of the network. Everything else — the shell, the script order, the
 * router, the lifecycle epochs, every page module — is production.
 *
 * NO REAL NETWORK CALL IS MADE. The stub is installed in <head>, before any application script runs,
 * so the real endpoint is never reached even once.
 *
 * MODES: ok | empty | reject | malformed. One Chrome run per mode; a mode is a property of the whole
 * run because the stub has to be in place before boot.
 *
 * USAGE:  node assets/tests/_s3r3-lifecycle-runner.js <mode>   → prints one JSON blob
 * It is a helper, not a suite: the leading underscore keeps the sweep from executing it.
 * ==================================================================================================
 */
'use strict';
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
];
function findChrome() {
  for (const c of CHROME_CANDIDATES) { try { if (c && fs.existsSync(c)) return c; } catch (e) {} }
  return null;
}

/**
 * THE AUDIT SET, reconciled against index.html rather than restated from S3-R2.
 *
 * `nav` is how a person actually reaches the page. Most are showSection(key); Shipment Overview has
 * its own entry point, and that difference is recorded rather than smoothed over — a page reached by
 * a different function is a page whose lifecycle may differ.
 *
 * Order Planning is ABSENT and that is the round's first finding: index.html:118 reaches it with
 * showSection('request-order'), the same route as Request Order. S3-R2 counted them as two pages.
 */
const PAGES = [
  { id: 'factory-stock',           label: 'Factory Inventory',      risk: 'P0', nav: "showSection('factory-stock')" },
  { id: 'overseas-stock',          label: 'Overseas Inventory',     risk: 'P0', nav: "showSection('overseas-stock')" },
  { id: 'request-order',           label: 'Request Order / Order Planning', risk: 'P0', nav: "showSection('request-order')" },
  { id: 'request-order-draft',     label: 'Request Order Draft',    risk: 'P0', nav: "showSection('request-order-draft')" },
  { id: 'shippingplan',            label: 'Weekly Shipping Plan',   risk: 'P0', nav: "showSection('shippingplan')" },
  { id: 'purchase-order-overview', label: 'Purchase Order Overview', risk: 'P0', nav: "showSection('purchase-order-overview')" },
  { id: 'purchase-order-list',     label: 'Purchase Order List',    risk: 'P0', nav: "showSection('purchase-order-list')" },
  { id: 'fc-summary',              label: 'FC Summary',             risk: 'P1', nav: "showSection('fc-summary')" },
  { id: 'skuDetails',              label: 'SKU Details',            risk: 'P1', nav: "showSection('skuDetails')" },
  { id: 'sku-regional-details',    label: 'SKU Regional Details',   risk: 'P1', nav: "showSection('sku-regional-details')" },
  { id: 'product-strategy',        label: 'Product Strategy Board', risk: 'P1', nav: "showSection('product-strategy')" },
  { id: 'shippinghistory',         label: 'Shipping History / Shipment Overview', risk: 'P1', nav: 'showShipmentOverview()' }
];

/** Installed in <head>, before one line of application code. */
function probeScript(mode) {
  return [
    '<script>',
    '(function () {',
    '  var P = { api: 0, partial: 0, calls: [], intervals: 0, clearedIntervals: 0,',
    '            docListeners: 0, winListeners: 0, removed: 0, errors: [], mode: ' + JSON.stringify(mode) + ' };',
    '  window.__P = P;',
    '  // THE ENDPOINT IS RECOGNISED BY SHAPE, not by a hard-coded URL: any absolute http(s) request is a',
    '  // network read, anything relative is the router fetching a section partial off disk.',
    '  function isApi(u) { return /^https?:/i.test(String(u)); }',
    '  window.__P.reset = function () { P.api = 0; P.partial = 0; P.calls.length = 0; };',
    '  var REAL_FETCH = window.fetch;',
    '  window.fetch = function (u, init) {',
    '    var url = String(u);',
    '    if (!isApi(url)) {',
    '      P.partial++;',
    '      return REAL_FETCH.apply(window, arguments);   // section markup really is on disk',
    '    }',
    '    P.api++; P.calls.push(url.slice(0, 48));',
    '    var m = P.mode;',
    '    if (m === "reject") return Promise.reject(new TypeError("Failed to fetch"));',
    '    var body = (m === "empty")',
    '      ? { success: true, data: {}, meta: { rowsReturned: 0 } }',
    '      : { success: true, data: {}, meta: { rowsReturned: 0 } };',
    '    return Promise.resolve({',
    '      ok: true, status: 200,',
    '      json: function () {',
    '        if (m === "malformed") return Promise.reject(new SyntaxError("Unexpected token <"));',
    '        return Promise.resolve(body);',
    '      },',
    '      text: function () {',
    '        return Promise.resolve(m === "malformed" ? "<html>nope" : JSON.stringify(body));',
    '      }',
    '    });',
    '  };',
    '  // LISTENER OWNERSHIP. Only window and document can outlive a section.',
    '  ["document", "window"].forEach(function (which) {',
    '    var t = which === "document" ? document : window;',
    '    var add = t.addEventListener, rem = t.removeEventListener;',
    '    t.addEventListener = function (type) {',
    '      if (which === "document") P.docListeners++; else P.winListeners++;',
    '      return add.apply(this, arguments);',
    '    };',
    '    t.removeEventListener = function () { P.removed++; return rem.apply(this, arguments); };',
    '  });',
    '  var si = window.setInterval, ci = window.clearInterval;',
    '  window.setInterval = function () { P.intervals++; return si.apply(window, arguments); };',
    '  window.clearInterval = function () { P.clearedIntervals++; return ci.apply(window, arguments); };',
    '  // A DIALOG BLOCKS HEADLESS CHROME FOREVER, and a harness that can hang forever is one whose',
    '  // silence carries no information. confirm() declines, which is the conservative answer.',
    '  window.alert = function () {}; window.confirm = function () { return false; };',
    '  window.prompt = function () { return null; };',
    '  window.addEventListener("error", function (e) {',
    '    if (P.errors.length < 12) P.errors.push(String(e.message).slice(0, 120));',
    '  });',
    '  window.addEventListener("unhandledrejection", function (e) {',
    '    var r = e && e.reason;',
    '    if (P.errors.length < 12) P.errors.push("REJECTION: " + String((r && r.message) || r).slice(0, 110));',
    '  });',
    '}());',
    '</script>'
  ].join('\n');
}

/** The driver. Runs after boot, walks every page, writes one JSON blob. */
// A debugging affordance, not a default: S3R3_PAGES=3 limits the walk so the runner itself can be
// diagnosed without waiting for twelve pages. Unset, every page runs.
function subset() {
  var from = parseInt(process.env.S3R3_FROM || "0", 10);
  var to = parseInt(process.env.S3R3_TO || String(PAGES.length), 10);
  return PAGES.slice(from, to);
}
function driverScript() {
  return [
    '<pre id="__measurements"></pre>',
    '<script>',
    '(function () {',
    '  var PAGES = ' + JSON.stringify(subset().map((p) => ({ id: p.id, nav: p.nav }))) + ';',
    '  var P = window.__P;',
    '  var OUT = { mode: P.mode, pages: {}, boot: {}, fatal: null, progress: null, done: false };',
    '  function say(tag, obj) { try { console.log("S3R3|" + tag + "|" + JSON.stringify(obj)); } catch (e) {} }',
    '  function publish() {',
    '    try { document.getElementById("__measurements").textContent = JSON.stringify(OUT); } catch (e) {}',
    '  }',
    '  function nav(expr) { try { (0, eval)(expr); return null; } catch (e) { return String(e.message).slice(0, 90); } }',
    '  function tick(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }',
    '  // What the operator would SEE. Text only; no styling judgements.',
    '  // THE WHOLE SECTION, not its first 400 characters. The first version truncated there and so read',
    '  // the TOOLBAR of every page — the table body, which is where a read failure actually renders, fell',
    '  // outside the window. Two pages were about to be reported as hiding their errors on that basis.',
    '  function visible() {',
    '    var a = document.querySelector(".module-section.active");',
    '    var t = a ? (a.textContent || "") : (document.body.textContent || "");',
    '    return t.replace(/\\s+/g, " ").trim();',
    '  }',
  // A MARKER IS A SENTENCE THE PAGE PRINTS, not a word that happens to appear. `empty` matched the
  // Overseas toolbar and reported a conflation that was not there, so the empty test now requires a
  // phrase a results area actually uses. The raw tail travels with every record so a surprising
  // classification can be checked by eye rather than trusted.
    '  function classify(txt) {',
    '    var s = txt.toLowerCase();',
    '    return {',
    '      says_loading: /loading\\b|loading…|searching|preparing|載入|讀取/.test(s),',
    '      says_error:   /error|failed|could not reach|unable to|無法|失敗/.test(s),',
    '      says_empty:   /no [a-z ]{0,18}(yet|found)|no (data|results|rows|records|items)|no matching|0 results|沒有資料|無資料/.test(s),',
    '      len: txt.length',
    '    };',
    '  }',
    '  function snap() { return { doc: P.docListeners, win: P.winListeners, rem: P.removed, iv: P.intervals }; }',
    '',
    '  (async function () {',
    '    try {',
    '      await tick(400);',
    '      OUT.boot = { api: P.api, partial: P.partial, errors: P.errors.slice(0) };',
    '',
    '      for (var i = 0; i < PAGES.length; i++) {',
    '        var pg = PAGES[i];',
    '        OUT.progress = pg.id; publish(); say("START", { page: pg.id });',
    '        var rec = { navError: null };',
    '',
    '        // ---- A/B  COLD ENTRY -------------------------------------------------------------',
    '        P.reset(); var l0 = snap();',
    '        say("NAV_IN", { page: pg.id });',
    '        rec.navError = nav(pg.nav);',
    '        say("NAV_OUT", { page: pg.id, err: rec.navError });',
    '        await tick(900);',
    '        rec.cold_api = P.api; rec.cold_partial = P.partial; say("PHASE", { page: pg.id, phase: "cold", api: P.api });',
    '        var v1 = visible();',
    '        rec.cold = classify(v1);',
    '        rec.cold_head = v1.slice(0, 120);',
    '        rec.cold_tail = v1.slice(-320);   // the body, which is where a failure is printed',
    '        var l1 = snap();',
    '        rec.listeners_added_cold = (l1.doc - l0.doc) + (l1.win - l0.win);',
    '        rec.intervals_added_cold = l1.iv - l0.iv;',
    '',
    '        // ---- H  WARM RE-ENTRY (leave, come back) -----------------------------------------',
    '        nav("showSection(\'supplychain\')"); await tick(400);',
    '        P.reset(); var l2 = snap();',
    '        nav(pg.nav); await tick(900);',
    '        rec.warm_api = P.api; say("PHASE", { page: pg.id, phase: "warm", api: P.api });',
    '        var l3 = snap();',
    '        rec.listeners_added_warm = (l3.doc - l2.doc) + (l3.win - l2.win);',
    '        rec.listeners_removed_warm = l3.rem - l2.rem;',
    '        rec.intervals_added_warm = l3.iv - l2.iv;',
    '        // NET, because a page that adds three and removes three has not leaked. Counting adds alone',
    '        // would report every well-behaved page as a leaker and bury the one that is not.',
    '        rec.listener_drift = rec.listeners_added_warm - rec.listeners_removed_warm;',
    '',
    '        // ---- G  RAPID LEAVE -> RE-ENTER (three navigations, no waiting) -------------------',
    '        P.reset();',
    '        nav(pg.nav); nav("showSection(\'supplychain\')"); nav(pg.nav);',
    '        await tick(1100);',
    '        rec.fast_api = P.api; say("PHASE", { page: pg.id, phase: "fast", api: P.api });',
    '        var vf = visible(); rec.fast = classify(vf); rec.fast_tail = vf.slice(-240);',
    '',
    '        // ---- L  UNMOUNT WHILE PENDING ----------------------------------------------------',
    '        P.reset();',
    '        nav(pg.nav);',
    '        nav("showSection(\'supplychain\')");   // leave immediately, mid-flight',
    '        await tick(900);',
    '        rec.unmount_api = P.api;',
    '        rec.after_unmount_text = visible().slice(0, 120);',
    '',
    '        rec.errors = P.errors.slice(0, 6);',
    '        OUT.pages[pg.id] = rec; say("PAGE", { page: pg.id, rec: rec });',
    '        OUT.progress = null; publish();',
    '      }',
    '    } catch (e) {',
    '      OUT.fatal = String((e && e.message) || e).slice(0, 200);',
    '    }',
    '    OUT.done = true; publish();',
    '  }());',
    '}());',
    '</script></body>'
  ].join('\n');
}

function run(mode) {
  const chrome = findChrome();
  if (!chrome) return { chromeMissing: true };
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  html = html.replace(/<head([^>]*)>/i, '<head$1>' + probeScript(mode));
  html = html.replace(/<\/body>/i, driverScript());
  // The file has to sit beside index.html so every relative asset path resolves exactly as it ships.
  const file = path.join(ROOT, '__s3r3-lifecycle-' + mode + '-'
    + (process.env.S3R3_FROM || '0') + '.html');
  fs.writeFileSync(file, html, 'utf8');
  try {
    const url = 'file:///' + file.split(path.sep).join('/').split(' ').join('%20');
    const r = cp.spawnSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
      '--disable-extensions', '--allow-file-access-from-files',
      '--virtual-time-budget=240000', '--enable-logging=stderr', '--log-level=0', '--dump-dom', url],
      { encoding: 'utf8', timeout: parseInt(process.env.S3R3_TIMEOUT||'900000',10), maxBuffer: 128 * 1024 * 1024 });
    const m = /<pre id="__measurements">([\s\S]*?)<\/pre>/.exec(r.stdout || '');
    var streamed = String(r.stderr || '').split(String.fromCharCode(10))
      .filter(function (l) { return l.indexOf('S3R3|') !== -1; })
      .map(function (l) { return l.slice(l.indexOf('S3R3|')); });
    if (!m) return { noMeasurements: true, status: r.status, streamed: streamed,
      stderr: String(r.stderr || '').slice(0, 200) };
    // A PARTIAL RESULT IS STILL EVIDENCE. `done:false` means the run was cut off; the pages already
    // in the blob were measured before that happened and `progress` names the one that stalled.
    const raw = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    try { return JSON.parse(raw); } catch (e) { return { parseError: String(e.message), raw: raw.slice(0, 400) }; }
  } finally {
    // ALWAYS. A stray untracked file in the repo root is what the canonical sweep reports as a suite
    // that left the tree dirty, and it would be this helper's fault rather than the page's.
    try { fs.unlinkSync(file); } catch (e) {}
  }
}

module.exports = { run, PAGES, findChrome };

if (require.main === module) {
  console.log(JSON.stringify(run(process.argv[2] || 'ok'), null, 1));
}
