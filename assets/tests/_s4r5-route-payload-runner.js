/**
 * ==================================================================================================
 * S4-R5 — THE TWO LARGEST ROUTE PAYLOADS, IN A REAL BROWSER
 * ==================================================================================================
 *
 * Site Inventory is one file of 947 KB. The On-the-Way map is eight files of 809 KB. Together they
 * were 1.58 MB of the 5.23 MB every boot parsed, and neither is reachable until its route is opened.
 *
 * Four questions, one run.
 *
 *   1. BOOT. Are they absent, is the menu complete anyway, and has neither page's code run?
 *   2. THE ROUTES. Cold entry fetches each script exactly once and executes it exactly once; the
 *      page mounts exactly once, after the code; a warm return fetches and executes nothing; a rapid
 *      A->B->A neither duplicates a load nor duplicates a mount.
 *   3. FAILURE. With a route's scripts refused at the network: the shell is still there, the refusal
 *      is truthful and scoped, the page is NOT half-mounted, no data was read, every other route
 *      still works, and Retry performs exactly ONE new load.
 *   4. LIFECYCLE. Listener drift and open requests across repeated entries, measured with S4-R2's
 *      own probe rather than a second copy of it.
 *
 * WHAT IS AUTHORITATIVE: script fetch and execution counts per URL, mount counts from the lifecycle
 * manager's own debug blob, request counts by action, and DOM outcomes. All are properties of
 * control flow and hold at any server speed.
 *
 * WHAT IS NOT: milliseconds. S4-R1 measured why and S4-R3 and S4-R4 repeated it - under
 * --virtual-time-budget Chrome freezes the clock inside a task. Nothing here is a duration.
 *
 * WHAT THIS RUNNER DOES NOT CLAIM: map FIDELITY. Markers, transport-mode icons, tooltips, multi-leg
 * behaviour and camera state are not asserted from here, and saying they were would be the
 * comfortable lie - a WebGL globe in headless Chrome is not where those are answerable. They are
 * owned by the forty-odd map suites that load the map sources into a vm and test them directly, and
 * this round changed NOT ONE BYTE of any map file. The fidelity evidence is those suites passing.
 *
 * USAGE:  node assets/tests/_s4r5-route-payload-runner.js [serverMs] [mode]
 *   mode: all | boot | routes | failure | lifecycle | crossroute
 * A helper, not a suite: the leading underscore keeps the sweep from executing it.
 * ==================================================================================================
 */
'use strict';
const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const R11 = require('./_s3r11-interaction-runner.js');
const R2 = require('./_s4r2-reentry-runner.js');            // its listener probe
const R3 = require('./_s4r3-code-split-runner.js');          // its script probe

const ROOT = path.join(__dirname, '..', '..');

/* The two routes this round moved. `marker` is a global that exists ONLY once the route's own code
   has run, so "has this route's code executed?" is answerable without guessing from the DOM. */
const TARGETS = [
  { key: 'ops', section: 'ops-section', label: 'Site Inventory',
    marker: 'typeof renderReplenishment === "function"',
    useful: '#ops-section .replen-card, #replen-dar-rows tr, #replen-detail-table',
    scripts: 1 },
  { key: 'global-logistics-map', section: 'global-logistics-map-section', label: 'On the Way',
    marker: 'typeof window.KMGlobe !== "undefined"',
    useful: '#global-logistics-map-section .glm-field, #global-logistics-map-section *',
    scripts: 8 }
];
const CONTROL = { key: 'skuDetails', section: 'sku-section', label: 'SKU Details (control)' };
const AWAY = 'supplychain';

function driver(mode) {
  return [
    '<pre id="__measurements"></pre>',
    '<script>',
    '(function () {',
    '  var P = window.__P, S = window.__S, L = window.__L;',
    '  var MODE = ' + JSON.stringify(mode || 'all') + ';',
    '  var T = ' + JSON.stringify(TARGETS) + ', CONTROL = ' + JSON.stringify(CONTROL) + ';',
    '  var AWAY = ' + JSON.stringify(AWAY) + ';',
    '  var OUT = { serverMs: window.__SERVER_MS, mode: MODE, boot: {}, routes: {}, failure: {},',
    '    lifecycle: {}, crossroute: {}, errors: [], fatal: null, progress: null, done: false };',
    '  function publish() { try { document.getElementById("__measurements").textContent = JSON.stringify(OUT); } catch (e) {} }',
    '  function tick(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }',
    '  function nav(expr) { try { return { v: (0, eval)(expr) }; } catch (e) { return { err: String(e && e.message).slice(0, 140) }; } }',
    '  function go(k) { return nav("showSection(" + JSON.stringify(k) + ")"); }',
    '  function count(sel) { try { return document.querySelectorAll(sel).length; } catch (e) { return -1; } }',
    '  function active(id) { var s = document.getElementById(id); return !!(s && s.classList.contains("active")); }',
    '  function dbg() { try { return window.__kmLifecycleDebug ? window.__kmLifecycleDebug() : {}; } catch (e) { return {}; } }',
    '  function live() { try { return L.census().live; } catch (e) { return null; } }',
    '  function openReqs() {',
    '    try { return (window.KM && window.KM.transport && window.KM.transport.openRequestDetails)',
    '      ? window.KM.transport.openRequestDetails().length : 0; } catch (e) { return 0; }',
    '  }',
    '  function marker(t) { var r = nav(t.marker); return r.err ? false : !!r.v; }',
    '  /* The urls the router declares for a route, as the probe keys them. */',
    '  function routeUrls(k) {',
    '    try {',
    '      return (window.KM.routeAssets[k].scripts || []).map(function (u) {',
    '        var raw = String(u).split("?")[0]; var at = raw.indexOf("assets/");',
    '        return at >= 0 ? raw.slice(at) : raw;',
    '      });',
    '    } catch (e) { return []; }',
    '  }',
    '  function fetched(k) { var n = 0; routeUrls(k).forEach(function (u) { n += (S.byUrl[u] || 0); }); return n; }',
    '  function executed(k) { var n = 0; routeUrls(k).forEach(function (u) { n += (S.executed[u] || 0); }); return n; }',
    '  function dupFetch(k) { var n = 0; routeUrls(k).forEach(function (u) { if ((S.byUrl[u] || 0) > 1) n += S.byUrl[u] - 1; }); return n; }',
    '  function dupExec(k) { var n = 0; routeUrls(k).forEach(function (u) { if ((S.executed[u] || 0) > 1) n += S.executed[u] - 1; }); return n; }',
    '',
    '  /* THE WAIT. S4-R2 published a false finding from a predicate that believed a transient empty',
    '     box, so this needs BOTH no outstanding request AND a stable observation. */',
    '  async function settle(t, capMs) {',
    '    var cap = capMs || 25000, t0 = performance.now(), last = null, same = 0;',
    '    while (performance.now() - t0 < cap) {',
    '      var obs = [openReqs(), active(t.section), marker(t), count(t.useful),',
    '                 count("#" + t.section + " .km-route-script-error"), fetched(t.key)].join("|");',
    '      if (obs === last) same++; else { same = 0; last = obs; }',
    '      if (openReqs() === 0 && same >= 2) return true;',
    '      await tick(10);',
    '    }',
    '    return false;',
    '  }',
    '  function reading(t) {',
    '    return { fetched: fetched(t.key), executed: executed(t.key),',
    '      dupFetch: dupFetch(t.key), dupExec: dupExec(t.key),',
    '      marker: marker(t), active: active(t.section), useful: count(t.useful),',
    '      errorBox: count("#" + t.section + " .km-route-script-error"),',
    '      api: P.api, openRequests: openReqs(),',
    '      visibleSections: dbg().activeVisibleSectionCount,',
    '      mountedSections: (dbg().mountedSections || []).length };',
    '  }',
    '  async function enter(t, cap) { go(t.key); await settle(t, cap); return reading(t); }',
    '  async function leave() { go(AWAY); await tick(400); }',
    '',
    '  (async function () {',
    '    try {',
    '      await tick(1400);',
    '      S.bootDone = true;',
    '',
    '      /* ------------- 1. BOOT (§10) ------------- */',
    '      OUT.boot = {',
    '        scriptsAppended: S.inserted.length,',
    '        bootInserted: S.bootInserted,',
    '        menuItems: count("#sidebar a, .sidebar a, .menu-item, [data-section]"),',
    '        markers: T.map(function (t) { return t.key + "=" + marker(t); }),',
    '        routeLoaded: T.map(function (t) {',
    '          var r = nav("window.KM.scriptLoader.isLoaded(" + JSON.stringify(t.key) + ")");',
    '          return t.key + "=" + (r.err ? "ERR" : !!r.v);',
    '        }),',
    '        api: P.api, listeners: live(), errors: S.errors.slice(0, 6)',
    '      };',
    '      publish();',
    '',
    '      /* ------------- 2. THE ROUTES (§4, §6) ------------- */',
    '      if (MODE === "all" || MODE === "routes") {',
    '        for (var i = 0; i < T.length; i++) {',
    '          var t = T[i];',
    '          OUT.progress = "routes:" + t.key; publish();',
    '          var rec = { label: t.label, declared: routeUrls(t.key).length };',
    '          P.reset();',
    '          rec.cold = await enter(t, 30000);',
    '          /* THE SHELL, and what had loaded when it appeared. Under virtual time a file:// script',
    '             resolves before the first poll, so this is NOT reported as an ordering proof - it is',
    '             reported as what it is. */',
    '          rec.mountedAfterCode = rec.cold.marker && rec.cold.active;',
    '          await leave();',
    '          rec.onLeave = { openRequests: openReqs(), stillActive: active(t.section),',
    '            mountedSections: (dbg().mountedSections || []).length };',
    '          /* WARM: the probe counters are cumulative, so a warm trip is measured as a DELTA. */',
    '          var f0 = fetched(t.key), e0 = executed(t.key);',
    '          P.reset();',
    '          rec.warm = await enter(t, 30000);',
    '          rec.warmDelta = { fetched: fetched(t.key) - f0, executed: executed(t.key) - e0 };',
    '          await leave();',
    '          /* RAPID A->B->A, with no settle in between. */',
    '          var f1 = fetched(t.key), e1 = executed(t.key);',
    '          var m1 = (dbg().mountedSections || []).length;',
    '          go(t.key); await tick(30); go(AWAY); await tick(30); go(t.key);',
    '          await settle(t, 30000);',
    '          rec.rapid = reading(t);',
    '          rec.rapidDelta = { fetched: fetched(t.key) - f1, executed: executed(t.key) - e1,',
    '            mountGrowth: (dbg().mountedSections || []).length - m1 };',
    '          await leave();',
    '          OUT.routes[t.key] = rec; publish();',
    '        }',
    '        /* THE CONTROL: a route this round did not touch still behaves. */',
    '        P.reset(); go(CONTROL.key); await tick(2500);',
    '        OUT.routes.__control = { active: active(CONTROL.section), api: P.api,',
    '          mountedSections: (dbg().mountedSections || []).length };',
    '        await leave(); publish();',
    '      }',
    '',
    '      /* ------------- 3. FAILURE (§4, §6) ------------- */',
    '      if (MODE === "all" || MODE === "failure") {',
    '        for (var j = 0; j < T.length; j++) {',
    '          var f = T[j];',
    '          OUT.progress = "failure:" + f.key; publish();',
    '          var rf = { label: f.label };',
    '          S.allowAll(); S.failNext(routeUrls(f.key));',
    '          var fb = fetched(f.key), eb = executed(f.key);',
    '          P.reset();',
    '          go(f.key); await settle(f, 30000);',
    '          rf.onFailure = reading(f);',
    '          rf.executedDelta = executed(f.key) - eb;',
    '          rf.blocked = S.blocked.length;',
    '          /* HALF-MOUNTED: the section is showing AND the code never ran. */',
    '          rf.halfMounted = rf.onFailure.active && !rf.onFailure.marker && rf.onFailure.errorBox === 0;',
    '          rf.apiDuringFailure = P.api;',
    '          rf.bodyText = (function () { var s = document.getElementById(f.section); return s ? String(s.innerText || "").replace(/\\s+/g, " ").slice(0, 300) : ""; }());',
    '          /* OTHER ROUTES STILL WORK. */',
    '          go(CONTROL.key); await tick(2200);',
    '          rf.controlStillWorks = active(CONTROL.section);',
    '          go(f.key); await tick(600);',
    '          /* RETRY = exactly one new load per declared script. */',
    '          S.allowAll();',
    '          var f2 = fetched(f.key);',
    '          nav("kmRetryRouteScripts(" + JSON.stringify(f.key) + ")");',
    '          await settle(f, 30000);',
    '          rf.onRetry = reading(f);',
    '          rf.retryFetchDelta = fetched(f.key) - f2;',
    '          rf.retryExecutedDelta = executed(f.key) - eb;',
    '          rf.retryBlocked = S.blocked.length;',
    '          rf.retryLoaderState = (function () { try { return { isLoaded: window.KM.scriptLoader.isLoaded(f.key), isLoading: window.KM.scriptLoader.isLoading(f.key) }; } catch (e) { return String(e.message); } }());',
    '          rf.retryMarker = marker(f);',
    '          rf.recovered = rf.onRetry.marker && rf.onRetry.errorBox === 0;',
    '          await leave();',
    '          OUT.failure[f.key] = rf; publish();',
    '        }',
    '      }',
    '',
    '      /* ------------- 4. LIFECYCLE (§8) ------------- */',
    '      if (MODE === "all" || MODE === "lifecycle") {',
    '        for (var k = 0; k < T.length; k++) {',
    '          var q = T[k];',
    '          OUT.progress = "lifecycle:" + q.key; publish();',
    '          await enter(q, 30000); await leave();',
    '          /* Baseline AFTER one full cycle: a first mount registers listeners a live page is',
    '             entitled to, and counting those makes every page look like a leak. S4-R4 published a',
    '             false +89 that way; the statistic S4-R2 sealed is the MARGINAL one. */',
    '          var before = live();',
    '          for (var c = 0; c < 3; c++) { await enter(q, 30000); await leave(); }',
    '          OUT.lifecycle[q.key] = {',
    '            listenerDrift: (live() == null || before == null) ? null : (live() - before),',
    '            openRequests: openReqs(),',
    '            mountedSections: (dbg().mountedSections || []).length,',
    '            visibleSections: dbg().activeVisibleSectionCount,',
    '            undefinedGlobals: (L.undefinedGlobals || []).slice(0),',
    '            unhandled: L.unhandled, windowErrors: L.errors',
    '          };',
    '          publish();',
    '        }',
    '      }',
    '',
    /* THE ONE THING THIS ROUND COULD ACTUALLY BREAK. Weekly Shipping Plan and Shipment Overview read
       `replenishmentMockData`, a top-level const that used to live in inventory-replenishment.js. It
       resolved only because both files were loaded at boot. Route-owning that page without moving the
       constant would have thrown ReferenceError for any operator who opened Weekly Shipping Plan
       first - the ordinary case, not an edge one. So: enter those routes having NEVER opened Site
       Inventory, and ask. */
    '      if (MODE === "all" || MODE === "crossroute") {',
    '        OUT.progress = "crossroute"; publish();',
    '        var errBefore = L.errors, undefBefore = (L.undefinedGlobals || []).length;',
    '        var irLoadedFirst = (function () { var r = nav("window.KM.scriptLoader.isLoaded(\\u0027ops\\u0027)"); return r.err ? "ERR" : !!r.v; }());',
    '        var sawMock = (function () { var r = nav("typeof replenishmentMockData"); return r.err ? ("THREW:" + r.err) : r.v; }());',
    '        var CROSS = [["shippingplan", "shippingplan-section"], ["shipment-overview", "shippinghistory-section"]];',
    '        var perRoute = {};',
    '        for (var ci = 0; ci < CROSS.length; ci++) {',
    '          var ck = CROSS[ci][0], cs = CROSS[ci][1];',
    '          P.reset();',
    '          go(ck); await tick(3000);',
    '          perRoute[ck] = { active: active(cs), api: P.api, nodes: count("#" + cs + " *"),',
    '            mountedSections: (dbg().mountedSections || []).length };',
    '          await leave();',
    '        }',
    '        OUT.crossroute = { siteInventoryEverLoaded: irLoadedFirst,',
    '          replenishmentMockDataTypeof: sawMock, routes: perRoute,',
    '          newWindowErrors: L.errors - errBefore,',
    '          newUndefinedGlobals: (L.undefinedGlobals || []).slice(undefBefore),',
    '          unhandled: L.unhandled };',
    '        publish();',
    '      }',
    '',
    '      OUT.errors = (S.errors || []).concat(P.errors || []).slice(0, 12);',
    '      OUT.undefinedGlobals = (L.undefinedGlobals || []).slice(0);',
    '      OUT.progress = null; OUT.done = true; publish();',
    '    } catch (e) { OUT.fatal = String(e && e.message) + " @" + OUT.progress; publish(); }',
    '  }());',
    '}());',
    '</script>'
  ].join('\n');
}

function run(serverMs, mode) {
  const chrome = R11.findChrome();
  if (!chrome) return { chromeMissing: true };
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  html = html.replace(/<head([^>]*)>/i, '<head$1>' + R11.probeScript(serverMs) + R2.listenerProbe() + R3.scriptProbe());
  html = html.replace(/<\/body>/i, driver(mode));
  const file = path.join(ROOT, '__s4r5-payload-' + serverMs + '-' + (mode || 'all') + '-' + process.pid + '.html');
  fs.writeFileSync(file, html, 'utf8');
  try {
    const url = 'file:///' + file.split(path.sep).join('/').split(' ').join('%20');
    const r = cp.spawnSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
      '--disable-extensions', '--allow-file-access-from-files',
      '--virtual-time-budget=900000', '--dump-dom', url],
      { encoding: 'utf8', timeout: parseInt(process.env.S4R5_TIMEOUT || '1500000', 10), maxBuffer: 256 * 1024 * 1024 });
    const m = /<pre id="__measurements">([\s\S]*?)<\/pre>/.exec(r.stdout || '');
    if (!m) return { noMeasurements: true, status: r.status, stderr: String(r.stderr || '').slice(0, 600) };
    const raw = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    try { return JSON.parse(raw); } catch (e) { return { parseError: String(e.message), raw: raw.slice(0, 1200) }; }
  } finally {
    try { fs.unlinkSync(file); } catch (e) {}
  }
}

/* The static half: what index.html asks the browser to run before anything is clicked, and what the
   router owns instead. Read from the files, because it is a property of the documents. */
function bootSurface() {
  const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(ROOT, 'assets/js/app.js'), 'utf8');
  const re = /<script([^>]*)src="([^"]+)"([^>]*)><\/script>/g;
  let m, local = [], remote = [], bytes = 0;
  while ((m = re.exec(idx))) {
    const src = m[2];
    if (/^https?:/.test(src)) { remote.push(src); continue; }
    const f = src.split('?')[0];
    let size = 0;
    try { size = fs.statSync(path.join(ROOT, f)).size; } catch (e) { size = -1; }
    local.push({ file: f, bytes: size, defer: /defer/.test((m[1] || '') + (m[3] || '')) });
    if (size > 0) bytes += size;
  }
  const RO = require('./_release-order.js');
  const routeAssets = Object.keys(RO.parseRouteAssetTokens(app));
  let routeBytes = 0;
  routeAssets.forEach(function (f) { try { routeBytes += fs.statSync(path.join(ROOT, f)).size; } catch (e) {} });
  return { scriptTags: local.length + remote.length, localCount: local.length, remoteCount: remote.length,
    bytes: bytes, local: local, routeAssets: routeAssets, routeBytes: routeBytes };
}

module.exports = { run, bootSurface, TARGETS, CONTROL, AWAY };

if (require.main === module) {
  const ms = parseInt(process.argv[2] || '400', 10);
  const mode = process.argv[3] || 'all';
  if (mode === 'boot') console.log(JSON.stringify(bootSurface(), null, 1));
  else console.log(JSON.stringify(run(ms, mode), null, 1));
}
