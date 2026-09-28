/**
 * ==================================================================================================
 * S4-R1 — THE ROUTE CENSUS RUNNER: every user-visible route, in one real browser, over one world
 * ==================================================================================================
 *
 * S3's runner answered questions about four surfaces in depth. This one answers ONE question about
 * every surface: what does entering this route cost, what does leaving it leave behind, and what does
 * coming back cost again. It reuses S3-R11's fixture world verbatim (imported, not copied) so the two
 * rounds are measuring the same application.
 *
 * WHAT IS AUTHORITATIVE HERE, and it is the same list S3-R11 and S3-R12 published:
 *
 *   · REQUEST COUNTS and the ACTIONS behind them. A count is a property of control flow, not of
 *     latency, so it is true at any server speed — which the two SERVER_MS settings demonstrate
 *     rather than assert.
 *   · READ ROUNDS, derived from sent/settled marks. With a bounded read pool the interesting number
 *     is not how many requests there were but how many were paid for SEQUENTIALLY.
 *   · DOM OUTCOMES: whether a route reached useful content, whether a skeleton was left spinning,
 *     whether two sections were visible at once, whether a request was left open.
 *   · LISTENER AND TIMER DRIFT across a mount/unmount cycle, because both are counted at the source:
 *     addEventListener/removeEventListener and setInterval/clearInterval are wrapped in <head>,
 *     before any application script runs.
 *
 * WHAT IS NOT OBSERVABLE HERE, stated once so no field below has to be read hopefully:
 *
 *   MILLISECONDS. Chrome's `--virtual-time-budget` FREEZES the clock while a task executes and jumps
 *   it to the next due timer when the queue drains. This was measured, not assumed: a page running
 *   `while (Date.now() - t < 300) {}` under virtual time never terminates, because the clock the loop
 *   is waiting on does not advance while the loop is the running task. So `performance.now()` deltas
 *   here count POLL TICKS, and are named `pollMs` for that reason. Real client cost is measured
 *   SEPARATELY, by _s4r1-shell-timing-runner.js, which times the Chrome PROCESS from outside.
 *
 * USAGE:  node assets/tests/_s4r1-route-census-runner.js [serverMs]   → one JSON blob
 * A helper, not a suite: the leading underscore keeps the sweep from executing it.
 * ==================================================================================================
 */
'use strict';
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

/* A PRIVATE CHROME PROFILE FOR THIS PROCESS (S5-R2B).
   Without --user-data-dir every headless launch shares the default profile and contends on its lock and
   disk cache. Measured in the s4-r3 runner as a systematic every-third-run boot failure (RR.RR.RR), which
   made mutation probes drive a page that had never booted and report surviving mutants. One directory per
   process is enough here: within a process every launch is spawnSync, so they are already sequential. */
const KM_CHROME_PROFILE = fs.mkdtempSync(path.join(require('os').tmpdir(), 'kmsweep-'));
process.on('exit', function () { try { fs.rmSync(KM_CHROME_PROFILE, { recursive: true, force: true }); } catch (e) {} });

const R11 = require('./_s3r11-interaction-runner.js');

const ROOT = path.join(__dirname, '..', '..');

/* ---------------------------------------------------------------------------------------------
   THE ROUTE TABLE. Derived from index.html's menu and app.js's two section maps, not invented:
   `key` is what showSection() is called with, `section` is what it makes visible.

   `useful` is a CSS selector for the first piece of content that means the page has something to
   say. Where a page's first useful screen is a FORM or a CANVAS rather than rows, that is recorded
   as `shellIsUseful` instead of pretending a row count is the measure — a route whose useful state
   is its own controls must not be scored as "never became useful".
   --------------------------------------------------------------------------------------------- */
const ROUTES = [
  { key: 'ops',                     section: 'ops-section',                     label: 'Site Inventory',            useful: '#replen-dar-rows tr, #replen-detail-table tbody tr' },
  { key: 'factory-stock',           section: 'factory-stock-section',           label: 'Factory Inventory',         useful: '#factory-stock-fixed-body tr' },
  { key: 'overseas-stock',          section: 'overseas-stock-section',          label: 'Overseas Inventory',        useful: '#overseas-snapshot-fixed-body tr' },
  { key: 'forecast',                section: 'forecast-section',                label: 'Forecast',                  shellIsUseful: true },
  { key: 'request-order',           section: 'request-order-section',           label: 'Order Planning',            useful: '#ro-fixed-body tr' },
  { key: 'fc-summary',              section: 'fc-summary-section',              label: 'FC Summary',                useful: '#fc-regular-fixed-body tr' },
  { key: 'shippingplan',            section: 'shippingplan-section',            label: 'Weekly Shipping Plan',      useful: 'table tbody tr, .wsp-card' },
  { key: 'shipment-draft',          section: 'shipment-draft-section',          label: 'Shipment Draft',            useful: 'table tbody tr, .card, .sd-row' },
  { key: 'shipment-overview',       section: 'shippinghistory-section',         label: 'Shipment Overview',         useful: 'table tbody tr, .sh-row, .card' },
  { key: 'global-logistics-map',    section: 'global-logistics-map-section',    label: 'On-the-Way Map',            useful: 'canvas' },
  { key: 'request-order-draft',     section: 'request-order-draft-section',     label: 'Request Order Draft',       useful: 'table tbody tr, .rod-row, .card' },
  { key: 'purchase-order-overview', section: 'purchase-order-overview-section', label: 'Purchase Order Overview',   useful: 'table tbody tr, .card' },
  { key: 'purchase-order-list',     section: 'purchase-order-list-section',     label: 'Purchase Order Workspace',  useful: '#pol-tbody tr' },
  { key: 'campaign-risk',           section: 'campaign-risk-section',           label: 'Promotion Risk Tracker',    useful: '#cr-table-fixed-body tr, #cr-kpi-cards > *' },
  { key: 'skuDetails',              section: 'sku-section',                     label: 'SKU Details',               useful: '#sku-section .fixed-row[data-sku]' },
  { key: 'sku-regional-details',    section: 'sku-regional-details-section',    label: 'SKU Regional Details',      useful: '#srd-list .srd-item' },
  { key: 'product-strategy',        section: 'product-strategy-board-section',  label: 'Product Strategy Board',    shellIsUseful: true, notInMenu: true },
  { key: 'carrier-rate-card',       section: 'carrier-rate-card-section',       label: 'Carrier Rate Card',         useful: 'table tbody tr, .card' },
  { key: 'sku-handbook',            section: 'sku-handbook-section',            label: 'SKU Handbook',              shellIsUseful: true },
  { key: 'supplychain',             section: 'supplychain-section',             label: 'Supply Chain Canvas',       shellIsUseful: true },
  { key: 'automation',              section: 'automation-schedule-section',     label: 'Automation Schedule',       useful: '#auto-sched-cards > *' }
];

/* The routes §4/§5 exercises in depth. CHOSEN FROM THE FIRST CENSUS RUN rather than guessed, and
   revised once it had measured them — the first pick used `ops` for heavy and `sku-handbook` for
   light, and the census disagreed with both: `ops` renders nothing over this fixture (it reads
   inventory tables the world does not carry), and `sku-handbook` is 1 252 DOM nodes, which is not
   light by any measure that matters.

   THERE ARE TWO KINDS OF HEAVY and collapsing them would hide one. `skuDetails` is heavy in RENDER —
   one request, 120 rows, 3 863 nodes. `campaign-risk` is heavy in ROUNDS — five requests paid for
   one after another. A page can be fast on one axis and the worst in the building on the other, so
   both are carried. */
const REPRESENTATIVE = { light: 'automation', medium: 'sku-regional-details',
  heavy: 'skuDetails', roundsHeavy: 'campaign-risk' };

/* ---------------------------------------------------------------------------------------------
   THE CENSUS PROBE. Injected AFTER S3-R11's probe and still inside <head>, so both run before any
   application script. It wraps the four registration points a route can leak through.
   --------------------------------------------------------------------------------------------- */
function censusProbe() {
  return [
    '<script>',
    '(function () {',
    '  var C = { listeners: 0, listenerDetail: {}, intervals: 0, timeouts: 0, scripts: [], partials: [] };',
    '  window.__C = C;',
    '  // LISTENERS. Counted net: +1 on add, -1 on remove, keyed by type so a leak can be NAMED rather',
    '  // than merely totalled. Only element/document/window targets are wrapped, which is every target',
    '  // a page module can reach.',
    '  var addT = EventTarget.prototype.addEventListener;',
    '  var remT = EventTarget.prototype.removeEventListener;',
    '  EventTarget.prototype.addEventListener = function (t) {',
    '    C.listeners++; C.listenerDetail[t] = (C.listenerDetail[t] || 0) + 1;',
    '    return addT.apply(this, arguments);',
    '  };',
    '  EventTarget.prototype.removeEventListener = function (t) {',
    '    C.listeners--; C.listenerDetail[t] = (C.listenerDetail[t] || 0) - 1;',
    '    return remT.apply(this, arguments);',
    '  };',
    '  // TIMERS. An interval that outlives its page is the drift that matters; a timeout settles by',
    '  // itself, so it is counted but never reported as a leak.',
    '  var si = window.setInterval, ci = window.clearInterval;',
    '  window.setInterval = function () { C.intervals++; return si.apply(window, arguments); };',
    '  window.clearInterval = function (h) { if (h != null) C.intervals--; return ci.apply(window, arguments); };',
    '  var st = window.setTimeout;',
    '  window.setTimeout = function () { C.timeouts++; return st.apply(window, arguments); };',
    '  // SCRIPTS ADDED AFTER BOOT. index.html loads everything up front today; anything appended later',
    '  // is a dynamic import, and a DUPLICATE one is the J category in the debt ranking.',
    '  var _apn = Element.prototype.appendChild;',
    '  Element.prototype.appendChild = function (n) {',
    '    try { if (n && n.tagName === "SCRIPT" && n.src) C.scripts.push(String(n.src)); } catch (e) {}',
    '    return _apn.apply(this, arguments);',
    '  };',
    '  C.snapshot = function () {',
    '    return { listeners: C.listeners, intervals: C.intervals, timeouts: C.timeouts,',
    '      scripts: C.scripts.length, partials: C.partials.length };',
    '  };',
    '}());',
    '</script>'
  ].join('\n');
}

/* ---------------------------------------------------------------------------------------------
   THE DRIVER.
   --------------------------------------------------------------------------------------------- */
function censusDriver() {
  const J = JSON.stringify;
  return [
    '<pre id="__measurements"></pre>',
    '<script>',
    '(function () {',
    '  var P = window.__P, C = window.__C;',
    '  var ROUTES = ' + J(ROUTES) + ', REP = ' + J(REPRESENTATIVE) + ';',
    '  var OUT = { serverMs: window.__SERVER_MS, boot: {}, routes: {}, transitions: {},',
    '    shell: {}, fatal: null, progress: null, done: false };',
    '  function publish() { try { document.getElementById("__measurements").textContent = JSON.stringify(OUT); } catch (e) {} }',
    '  function tick(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }',
    '  function qa(sel, root) { try { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); } catch (e) { return []; } }',
    '  function nav(expr) { try { (0, eval)(expr); return null; } catch (e) { return String(e.message).slice(0, 120); } }',
    '  function go(key) { return nav("showSection(" + JSON.stringify(key).replace(/\\"/g, "\\u0027") + ")"); }',
    '  async function until(fn, capMs) {',
    '    var t0 = performance.now(), cap = capMs || 20000;',
    '    while (performance.now() - t0 < cap) { try { if (fn()) return true; } catch (e) {} await tick(8); }',
    '    return false;',
    '  }',
    '  function sectionActive(id) { var s = document.getElementById(id); return !!(s && s.classList.contains("active")); }',
    '  function dbg() { try { return window.__kmLifecycleDebug ? window.__kmLifecycleDebug() : {}; } catch (e) { return {}; } }',
    '  function openReqs() {',
    '    try { return (window.KM && window.KM.transport && window.KM.transport.openRequestDetails)',
    '      ? window.KM.transport.openRequestDetails().length : null; } catch (e) { return null; }',
    '  }',
    '  /* WHAT "USEFUL" MEANT, recorded beside the verdict rather than hidden behind it. A route whose',
    '     first useful screen is its own controls is scored on the shell, and says so. */',
    '  function usefulCount(r) {',
    '    var sec = document.getElementById(r.section);',
    '    if (!sec) return 0;',
    '    if (r.shellIsUseful) return sec.textContent.replace(/\\s+/g, " ").trim().length > 40 ? 1 : 0;',
    '    return qa(r.useful, sec).length;',
    '  }',
    '  function skeletons(r) {',
    '    var sec = document.getElementById(r.section);',
    '    return sec ? qa("[class*=skel], [class*=Skel], [data-state=loading]", sec).length : 0;',
    '  }',
    '  function errorSurface(r) {',
    '    var sec = document.getElementById(r.section); if (!sec) return null;',
    '    var hits = qa("[class*=error], [class*=refus], [role=alert], [class*=warn]", sec)',
    '      .filter(function (e) { return !e.hidden && String(e.textContent || "").trim(); });',
    '    return hits.length ? String(hits[0].textContent).replace(/\\s+/g, " ").trim().slice(0, 120) : null;',
    '  }',
    '  function dupes() { var d = 0; Object.keys(P.byAction).forEach(function (k) { if (P.byAction[k] > 1) d += P.byAction[k] - 1; }); return d; }',
    '  function _rounds(marks) {',
    '    if (!marks.length) return 0;',
    '    var sorted = marks.slice().sort(function (a, b) { return a.sent - b.sent; });',
    '    var rounds = 1, boundary = null;',
    '    sorted.forEach(function (m, i) {',
    '      if (i === 0) { boundary = m.settled; return; }',
    '      if (boundary !== null && m.sent >= boundary) { rounds++; boundary = m.settled; }',
    '      else if (m.settled !== null && (boundary === null || m.settled < boundary)) boundary = m.settled;',
    '    });',
    '    return rounds;',
    '  }',
    '  function reading(r) {',
    '    return { api: P.api, partial: P.partial, byAction: JSON.parse(JSON.stringify(P.byAction)),',
    '      rounds: _rounds(P.marks), dupes: dupes(),',
    '      useful: usefulCount(r), skeletons: skeletons(r), error: errorSurface(r),',
    '      active: sectionActive(r.section), openRequests: openReqs(),',
    '      visibleSections: dbg().activeVisibleSectionCount,',
    '      nodes: (function () { var s = document.getElementById(r.section); return s ? s.querySelectorAll("*").length : 0; }()) };',
    '  }',
    '  async function enter(r, capMs) {',
    '    P.reset();',
    '    var before = C.snapshot();',
    '    go(r.key);',
    '    var shellOk = await until(function () { return sectionActive(r.section); }, 12000);',
    '    /* DOES THE SHELL WAIT FOR DATA? Asked at the only moment that can answer it: how many of the',
    '       requests this mount SENT had already SETTLED when the section became visible. A shell that',
    '       is revealed with `settled: 0` was drawn before any answer arrived, which is the behaviour',
    '       §6 is asking about; the request COUNT alone cannot tell dispatched from awaited. Meaningless',
    '       at serverMs 0, where everything settles instantly — which is why this is read at 400. */',
    '    var settledAtShell = P.marks.filter(function (m) { return m.settled !== null; }).length;',
    '    var shell = { active: shellOk, api: P.api, partial: P.partial, settled: settledAtShell };',
    '    await until(function () { return usefulCount(r) > 0; }, capMs || 25000);',
    '    await tick(300);                       // let a late paint land, so "useful" is not a race',
    '    var rec = reading(r);',
    '    rec.shell = shell;',
    '    rec.listenersAdded = C.listeners - before.listeners;',
    '    rec.intervalsAdded = C.intervals - before.intervals;',
    '    return rec;',
    '  }',
    '',
    '  (async function () {',
    '    try {',
    '      // ============ BOOT / APP SHELL =================================================',
    '      await tick(600);',
    '      OUT.boot = { api: P.api, partial: P.partial, byAction: JSON.parse(JSON.stringify(P.byAction)),',
    '        errors: P.errors.slice(0), listeners: C.listeners, intervals: C.intervals,',
    '        scriptsAppended: C.scripts.length,',
    '        menuItems: qa(".menu-item").length,',
    '        menuItemsDisabled: qa(".menu-item--disabled").length,',
    '        sectionsInDom: qa(".module-section").length,',
    '        sectionsActive: qa(".module-section.active").length,',
    '        mountedSections: (dbg().mountedSections || []).slice(0),',
    '        domNodes: document.querySelectorAll("*").length };',
    '      publish();',
    '',
    '      // ============ PER-ROUTE CENSUS =================================================',
    '      for (var i = 0; i < ROUTES.length; i++) {',
    '        var r = ROUTES[i];',
    '        OUT.progress = "route:" + r.key; publish();',
    '        var rec = { label: r.label, section: r.section, notInMenu: !!r.notInMenu,',
    '          usefulBy: r.shellIsUseful ? "shell-text" : r.useful };',
    '        try {',
    '          var beforeMount = (dbg().mountedSections || []).length;',
    '          rec.cold = await enter(r);',
    '          // LEAVE. What a route leaves behind is the half nobody looks at, so it is read here:',
    '          // requests still open, a section still visible, listeners and intervals still live.',
    '          var beforeLeave = C.snapshot();',
    '          P.reset();',
    '          nav("showSection(\\u0027supplychain\\u0027)");',
    '          await tick(600);',
    '          rec.onLeave = { api: P.api, openRequests: openReqs(),',
    '            stillActive: sectionActive(r.section),',
    '            visibleSections: dbg().activeVisibleSectionCount,',
    '            listenersDelta: C.listeners - beforeLeave.listeners,',
    '            intervalsDelta: C.intervals - beforeLeave.intervals,',
    '            mountedSections: (dbg().mountedSections || []).length };',
    '          // WARM RE-ENTRY.',
    '          rec.warm = await enter(r, 20000);',
    '          rec.mountGrowth = (dbg().mountedSections || []).length - beforeMount;',
    '        } catch (e) { rec.threw = String(e && e.message).slice(0, 160); }',
    '        OUT.routes[r.key] = rec; publish();',
    '        nav("showSection(\\u0027supplychain\\u0027)"); await tick(300);',
    '      }',
    '',
    '      // ============ TRANSITIONS on the three representatives ==========================',
    '      OUT.progress = "transitions"; publish();',
    '      function byKey(k) { for (var n = 0; n < ROUTES.length; n++) if (ROUTES[n].key === k) return ROUTES[n]; return null; }',
    '      var keys = Object.keys(REP);',
    '      for (var t = 0; t < keys.length; t++) {',
    '        var A = byKey(REP[keys[t]]);',
    '        var B = byKey(REP[keys[(t + 1) % keys.length]]);',
    '        // A -> B while A is still reading. A may finish; it must not paint into B.',
    '        P.reset();',
    '        go(A.key);',
    '        await tick(Math.max(20, Math.round(window.__SERVER_MS / 3)));',
    '        go(B.key);',
    '        await tick(4000);',
    '        var rapid = { from: A.key, to: B.key, api: P.api,',
    '          byAction: JSON.parse(JSON.stringify(P.byAction)),',
    '          visibleSections: dbg().activeVisibleSectionCount,',
    '          visibleIds: dbg().activeVisibleSectionIds,',
    '          lastDiscarded: dbg().lastDiscarded,',
    '          aStillUseful: usefulCount(A), bUseful: usefulCount(B),',
    '          aSkeletons: skeletons(A), bSkeletons: skeletons(B),',
    '          openRequests: openReqs() };',
    '        // A -> B -> A: the return leg must not pay for A twice.',
    '        P.reset();',
    '        go(A.key);',
    '        await until(function () { return usefulCount(A) > 0; }, 20000);',
    '        await tick(300);',
    '        rapid.backToA = { api: P.api, byAction: JSON.parse(JSON.stringify(P.byAction)),',
    '          useful: usefulCount(A), skeletons: skeletons(A),',
    '          visibleSections: dbg().activeVisibleSectionCount, openRequests: openReqs() };',
    '        OUT.transitions[keys[t] + ":" + A.key + "->" + B.key] = rapid; publish();',
    '        nav("showSection(\\u0027supplychain\\u0027)"); await tick(300);',
    '      }',
    '',
    '      OUT.shell = { finalListeners: C.listeners, finalIntervals: C.intervals,',
    '        finalTimeouts: C.timeouts, scriptsAppended: C.scripts.slice(0, 10),',
    '        partialFetches: P.partial, domNodes: document.querySelectorAll("*").length,',
    '        mountedSections: (dbg().mountedSections || []).slice(0),',
    '        errors: P.errors.slice(0) };',
    '      OUT.progress = null; OUT.done = true; publish();',
    '    } catch (e) { OUT.fatal = String(e && e.message) + " @" + OUT.progress; publish(); }',
    '  }());',
    '}());',
    '</script>'
  ].join('\n');
}

function run(serverMs) {
  const chrome = R11.findChrome();
  if (!chrome) return { chromeMissing: true };
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  html = html.replace(/<head([^>]*)>/i, '<head$1>' + R11.probeScript(serverMs) + censusProbe());
  html = html.replace(/<\/body>/i, censusDriver());
  const file = path.join(ROOT, '__s4r1-census-' + serverMs + '.html');
  fs.writeFileSync(file, html, 'utf8');
  try {
    const url = 'file:///' + file.split(path.sep).join('/').split(' ').join('%20');
    const r = cp.spawnSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--user-data-dir=' + KM_CHROME_PROFILE,
      '--disable-extensions', '--allow-file-access-from-files',
      '--virtual-time-budget=900000', '--dump-dom', url],
      { encoding: 'utf8', timeout: parseInt(process.env.S4R1_TIMEOUT || '1500000', 10), maxBuffer: 256 * 1024 * 1024 });
    const m = /<pre id="__measurements">([\s\S]*?)<\/pre>/.exec(r.stdout || '');
    if (!m) return { noMeasurements: true, status: r.status, stderr: String(r.stderr || '').slice(0, 400) };
    const raw = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    try { return JSON.parse(raw); } catch (e) { return { parseError: String(e.message), raw: raw.slice(0, 800) }; }
  } finally {
    try { fs.unlinkSync(file); } catch (e) {}
  }
}

module.exports = { run, ROUTES, REPRESENTATIVE };

if (require.main === module) {
  const ms = parseInt(process.argv[2] || '0', 10);
  console.log(JSON.stringify(run(ms), null, 1));
}
