/**
 * ==================================================================================================
 * S4-R3 — ROUTE-OWNED CODE, IN A REAL BROWSER
 * ==================================================================================================
 *
 * Three questions, one run.
 *
 *   1. BOOT. How many scripts execute before the menu works, and how many bytes is that? Counted at
 *      the source — every <script> insertion is observed, so a file that arrives later is counted as
 *      arriving later rather than assumed to.
 *   2. THE PILOT ROUTES. Does the shell appear before the route's own code has landed, does the page
 *      mount exactly once after it, and does a warm return trip fetch or execute anything again?
 *   3. FAILURE. With the route's scripts refused at the network: is the shell still there, is the
 *      refusal truthful, is the page NOT half-mounted, and does Retry perform exactly one new load?
 *
 * WHAT IS AUTHORITATIVE: script counts and bytes, fetch and execution counts per URL, request counts
 * by action, mount counts from the lifecycle manager's own debug blob, and DOM outcomes. These are
 * properties of control flow and are true at any server speed.
 *
 * WHAT IS NOT: milliseconds. S4-R1 measured why — under --virtual-time-budget Chrome freezes the
 * clock while a task runs. §8 asks for observable ordering where that is so, and ordering is what
 * this records: what had loaded at the moment the shell became visible.
 *
 * USAGE:  node assets/tests/_s4r3-code-split-runner.js [serverMs] [mode]
 *   mode: all | routes | failure        (a mutant pays only for the phase that can catch it)
 * A helper, not a suite: the leading underscore keeps the sweep from executing it.
 * ==================================================================================================
 */
'use strict';
const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const R11 = require('./_s3r11-interaction-runner.js');

const ROOT = path.join(__dirname, '..', '..');

/* The pilot, named here so the suite can assert the runner drove the same set the router declares. */
const PILOT_ROUTES = [
  { key: 'product-strategy', section: 'product-strategy-board-section', label: 'Product Strategy Board',
    marker: 'KM.pages.productStrategyBoard', useful: '.psb-page *' }
];
const CONTROL_ROUTE = { key: 'skuDetails', section: 'sku-section', label: 'SKU Details (control)' };
const AWAY = 'supplychain';

/* ---------------------------------------------------------------------------------------------
   THE SCRIPT PROBE. Wraps script insertion BEFORE any application script runs, so a route's own
   code cannot arrive unobserved. Counted per URL: a second FETCH and a second EXECUTION are
   different defects and §4 asks about both.
   --------------------------------------------------------------------------------------------- */
function scriptProbe() {
  return [
    '<script>',
    '(function () {',
    '  var S = { inserted: [], byUrl: {}, executed: {}, failUrls: {}, blocked: [], bootDone: false,',
    '            bootInserted: 0, errors: [] };',
    '  window.__S = S;',
    '  // el.src resolves to an ABSOLUTE url the moment it is assigned, while the route table names',
    '  // relative paths. Keyed on the repo-relative tail so the two can be compared at all.',
    '  function key(u) {',
    '    var raw = String(u || "").split("?")[0];',
    '    var at = raw.indexOf("/assets/");',
    '    return at >= 0 ? raw.slice(at + 1) : raw;',
    '  }',
    '  // A url listed here is refused at insertion time: the element gets an error event and no',
    '  // network request is made. That is what a failed CDN/deployment fetch looks like to the page.',
    '  S.failNext = function (urls) { (urls || []).forEach(function (u) { S.failUrls[key(u)] = true; }); };',
    '  S.allowAll = function () { S.failUrls = {}; };',
    '  var realAppend = Node.prototype.appendChild;',
    '  Node.prototype.appendChild = function (n) {',
    '    try {',
    '      if (n && n.tagName === "SCRIPT" && n.src) {',
    '        var k = key(n.src);',
    '        S.inserted.push(k);',
    '        S.byUrl[k] = (S.byUrl[k] || 0) + 1;',
    '        if (!S.bootDone) S.bootInserted++;',
    '        if (S.failUrls[k]) {',
    '          S.blocked.push(k);',
    '          // Never reaches the document, so nothing executes; the page sees onerror, as it would',
    '          // for a 404 or a dropped connection.',
    '          setTimeout(function () { try { if (typeof n.onerror === "function") n.onerror(new Event("error")); } catch (e) {} }, 0);',
    '          return n;',
    '        }',
    '        var priorOnload = n.onload;',
    '        n.onload = function () { S.executed[k] = (S.executed[k] || 0) + 1;',
    '          if (typeof priorOnload === "function") return priorOnload.apply(this, arguments); };',
    '      }',
    '    } catch (e) { S.errors.push(String(e && e.message).slice(0, 120)); }',
    '    return realAppend.apply(this, arguments);',
    '  };',
    '  window.addEventListener("error", function (e) {',
    '    try { S.errors.push(String(e.message || "").slice(0, 160)); } catch (x) {}',
    '  }, true);',
    '  window.addEventListener("unhandledrejection", function (e) {',
    '    try { var r = e.reason; S.errors.push("rejection: " + String((r && (r.message || r)) || "").slice(0, 160)); } catch (x) {}',
    '  });',
    '}());',
    '</script>'
  ].join('\n');
}

function driver(mode) {
  const J = JSON.stringify;
  return [
    '<pre id="__measurements"></pre>',
    '<script>',
    '(function () {',
    '  var P = window.__P, S = window.__S;',
    '  var MODE = ' + J(mode || 'all') + ';',
    '  var PILOT = ' + J(PILOT_ROUTES) + ', CONTROL = ' + J(CONTROL_ROUTE) + ', AWAY = ' + J(AWAY) + ';',
    '  var OUT = { serverMs: window.__SERVER_MS, mode: MODE, boot: {}, routes: {}, failure: {},',
    '    control: {}, health: {}, gap: {}, fatal: null, progress: null, done: false };',
    '  function publish() { try { document.getElementById("__measurements").textContent = JSON.stringify(OUT); } catch (e) {} }',
    '  function tick(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }',
    '  function qa(s, root) { try { return Array.prototype.slice.call((root || document).querySelectorAll(s)); } catch (e) { return []; } }',
    '  function nav(x) { try { (0, eval)(x); return null; } catch (e) { return String(e.message).slice(0, 160); } }',
    '  function go(k) { return nav("showSection(" + JSON.stringify(k) + ")"); }',
    '  async function until(fn, cap) { var t0 = performance.now();',
    '    while (performance.now() - t0 < (cap || 15000)) { try { if (fn()) return true; } catch (e) {} await tick(20); } return false; }',
    '  function dbg() { try { return window.__kmLifecycleDebug ? window.__kmLifecycleDebug() : {}; } catch (e) { return {}; } }',
    '  function mounted(id) { return ((dbg().mountedSections) || []).indexOf(id) !== -1; }',
    '  function sectionActive(id) { var s = document.getElementById(id); return !!(s && s.classList.contains("active")); }',
    '  function loaded(k) { try { return window.KM.scriptLoader.isLoaded(k); } catch (e) { return null; } }',
    '  // A dotted path, so the marker can be the LAST thing the chain defines rather than the first.',
    '  // PSB_VIEWS is NOT usable here: it is a boot dependency (the sidebar builds from it), so it is',
    '  // defined whether or not the route code ever arrives.',
    '  function marker(name) {',
    '    try { return String(name).split(".").reduce(function (o, k) { return (o == null) ? undefined : o[k]; }, window) !== undefined; }',
    '    catch (e) { return false; }',
    '  }',
    '  function errBox(id) { var s = document.getElementById(id); return s ? qa(".km-route-script-error", s).length : 0; }',
    '  function errText() { var b = qa(".km-route-script-error")[0]; return b ? String(b.textContent).replace(/\\s+/g," ").trim().slice(0,150) : ""; }',
    '  function openReqs() { try { return window.KM.transport.openRequestDetails().length; } catch (e) { return null; } }',
    '  function counts(urls) { var f = 0, x = 0; urls.forEach(function (u) { f += (S.byUrl[u] || 0); x += (S.executed[u] || 0); }); return { fetched: f, executed: x }; }',
    '  // The route table carries VERSIONED urls; the probe keys strip the query. Compare like for like.',
    '  function routeScripts(k) {',
    '    try { return window.KM.routeAssets[k].scripts.map(function (u) { return String(u).split("?")[0]; }); }',
    '    catch (e) { return []; }',
    '  }',
    '',
    '  (async function () {',
    '    try {',
    '      await tick(900);',
    '      S.bootDone = true;',
    '      // Scripts APPENDED during boot. index.html\u2019s own tags are parsed by the HTML parser and',
    '      // never appended, so zero is the expected reading: nothing inserted itself before the menu.',
    '      OUT.boot = { appendedDuringBoot: S.bootInserted, api: P.api,',
    '        byAction: JSON.parse(JSON.stringify(P.byAction)),',
    '        menuItems: qa(".menu-item").length,',
    '        // A COUNT IS NOT COMPLETENESS. The staged Product Strategy parent builds its six',
    '        // children at boot from PSB_VIEWS; moving that file to route-owned left the parent',
    '        // with ZERO children, silently, because stagedChildren answers [] rather than throwing.',
    '        // Unquoted attribute selectors here so this survives being embedded in a string literal.',
    '        stagedParents: qa(".menu-parent[data-staged]").length,',
    '        psbMenuChildren: qa(".menu-children[data-parent=product-strategy] > *").length,',
    '        // THE MENU IS NOT "COMPLETE" BECAUSE IT HAS SOME ITEMS. The staged Product Strategy',
    '        // entry builds its six children at boot from PSB_VIEWS, and moving that file to',
    '        // route-owned left the parent with ZERO children \u2014 silently, because stagedChildren',
    '        // answers [] rather than throwing. A bare count reported that as healthy, so the',
    '        // children are counted here on their own.',
    '        scriptLoaderReady: !!(window.KM && window.KM.scriptLoader),',
    '        routeAssetKeys: (function () { try { return Object.keys(window.KM.routeAssets); } catch (e) { return null; } }()),',
    '        // §8 — the question the boot count exists to answer. A pilot marker present here means',
    '        // the route code ran at boot after all.',
    '        pilotMarkersAtBoot: PILOT.map(function (r) { return r.key + "=" + marker(r.marker); }),',
    '        pilotLoadedAtBoot: PILOT.map(function (r) { return r.key + "=" + loaded(r.key); }),',
    '        errors: S.errors.slice(0, 8) };',
    '      publish();',
    '',
    '      if (MODE === "all" || MODE === "routes") {',
    '        for (var i = 0; i < PILOT.length; i++) {',
    '          var r = PILOT[i];',
    '          OUT.progress = "route:" + r.key; publish();',
    '          var rec = { label: r.label };',
    '          var urls = routeScripts(r.key);',
    '          rec.declaredScripts = urls.length;',
    '          // ---- COLD -------------------------------------------------------------------',
    '          P.reset();',
    '          go(r.key);',
    '          // §4/§8 ORDERING: the first moment the shell is visible, and what had arrived by then.',
    '          var shellUp = await until(function () { return sectionActive(r.section); }, 12000);',
    '          rec.atShell = { visible: shellUp, codeLoaded: loaded(r.key), markerDefined: marker(r.marker),',
    '            executed: counts(urls).executed, mounted: mounted(r.section) };',
    '          await until(function () { return loaded(r.key) === true; }, 20000);',
    '          await until(function () { return mounted(r.section); }, 20000);',
    '          await tick(700);',
    '          var c1 = counts(urls);',
    '          rec.cold = { codeLoaded: loaded(r.key), markerDefined: marker(r.marker),',
    '            mounted: mounted(r.section), active: sectionActive(r.section),',
    '            fetched: c1.fetched, executed: c1.executed,',
    '            mountedSections: ((dbg().mountedSections) || []).length,',
    '            visibleSections: dbg().activeVisibleSectionCount,',
    '            useful: qa(r.useful, document.getElementById(r.section) || document).length,',
    '            api: P.api, openRequests: openReqs(), errorBox: errBox(r.section) };',
    '          // ---- WARM RE-ENTRY ----------------------------------------------------------',
    '          go(AWAY); await tick(500);',
    '          P.reset();',
    '          go(r.key);',
    '          await until(function () { return mounted(r.section); }, 15000);',
    '          await tick(600);',
    '          var c2 = counts(urls);',
    '          rec.warm = { fetchedTotal: c2.fetched, executedTotal: c2.executed,',
    '            refetched: c2.fetched - c1.fetched, reexecuted: c2.executed - c1.executed,',
    '            mounted: mounted(r.section), active: sectionActive(r.section),',
    '            visibleSections: dbg().activeVisibleSectionCount, api: P.api };',
    '          // ---- RAPID A -> B -> A ------------------------------------------------------',
    '          P.reset();',
    '          go(r.key); await tick(40); go(AWAY); await tick(40); go(r.key);',
    '          await until(function () { return mounted(r.section); }, 15000);',
    '          await tick(700);',
    '          var c3 = counts(urls);',
    '          rec.rapid = { refetched: c3.fetched - c2.fetched, reexecuted: c3.executed - c2.executed,',
    '            visibleSections: dbg().activeVisibleSectionCount, mounted: mounted(r.section),',
    '            mountedSections: ((dbg().mountedSections) || []).length, api: P.api };',
    '          go(AWAY); await tick(400);',
    '          OUT.routes[r.key] = rec; publish();',
    '        }',
    '',
    '        // A non-pilot route must be untouched by any of this.',
    '        OUT.progress = "control"; publish();',
    '        P.reset();',
    '        go(CONTROL.key);',
    '        await until(function () { return mounted(CONTROL.section); }, 20000);',
    '        await tick(700);',
    '        OUT.control = { label: CONTROL.label, mounted: mounted(CONTROL.section),',
    '          active: sectionActive(CONTROL.section), api: P.api,',
    '          rows: qa("#sku-section .fixed-row[data-sku]").length,',
    '          visibleSections: dbg().activeVisibleSectionCount };',
    '        go(AWAY); await tick(400);',
    '        publish();',
    '      }',
    '',
    '      if (MODE === "all" || MODE === "failure") {',
    '        // §5 — the route\\u2019s own code is refused. Uses a route whose code has NOT been loaded yet',
    '        // when run in failure-only mode; in "all" it is reset first so the refusal is reachable.',
    '        OUT.progress = "failure"; publish();',
    '        var fr = PILOT[0];',
    '        var furls = routeScripts(fr.key);',
    '        // Force the route back to unloaded so the refusal path is reachable even in "all" mode.',
    '        nav("window.KM.scriptLoader && (window.KM.scriptLoader.loadedKeys().length, 0)");',
    '        var wasLoaded = loaded(fr.key);',
    '        if (!wasLoaded) {',
    '          S.failNext(furls);',
    '          P.reset();',
    '          go(fr.key);',
    '          await until(function () { return errBox(fr.section) > 0 || mounted(fr.section); }, 20000);',
    '          await tick(800);',
    '          OUT.failure = { attempted: true, blocked: S.blocked.length,',
    '            shellVisible: sectionActive(fr.section) || !!document.getElementById(fr.section),',
    '            errorBox: errBox(fr.section), errorText: errText(),',
    '            halfMounted: mounted(fr.section), markerDefined: marker(fr.marker),',
    '            codeLoaded: loaded(fr.key), api: P.api, openRequests: openReqs(),',
    '            // Other routes must still work.',
    '            otherRouteOk: null };',
    '          // Retry, still failing: exactly one NEW load attempt per click.',
    '          var beforeRetry = (S.byUrl[furls[0]] || 0);',
    '          nav("kmRetryRouteScripts(" + JSON.stringify(fr.key) + ")");',
    '          await tick(1200);',
    '          OUT.failure.retryFetchDelta = (S.byUrl[furls[0]] || 0) - beforeRetry;',
    '          OUT.failure.stillHalfMounted = mounted(fr.section);',
    '          // Another route, while this one is broken.',
    '          go(CONTROL.key);',
    '          await until(function () { return mounted(CONTROL.section); }, 20000);',
    '          await tick(500);',
    '          OUT.failure.otherRouteOk = mounted(CONTROL.section);',
    '          // Now allow it and retry once more: it must recover.',
    '          S.allowAll();',
    '          var beforeRecover = (S.byUrl[furls[0]] || 0);',
    '          go(fr.key);',
    '          await until(function () { return mounted(fr.section); }, 20000);',
    '          await tick(800);',
    '          OUT.failure.recovered = mounted(fr.section);',
    '          OUT.failure.recoverFetchDelta = (S.byUrl[furls[0]] || 0) - beforeRecover;',
    '          OUT.failure.recoveredMarker = marker(fr.marker);',
    '        } else {',
    '          OUT.failure = { attempted: false, why: "route code already loaded in this run" };',
    '        }',
    '        go(AWAY); await tick(300);',
    '        publish();',
    '      }',
    '',
    '      // ---- §6 / §7 CADENCE ------------------------------------------------------------',
    '      OUT.progress = "cadence"; publish();',
    '      // system.health: mount Weekly Shipping Plan twice and count the probe each time.',
    '      P.reset();',
    '      go("shippingplan"); await tick(2500);',
    '      var h1 = P.byAction["system.health"] || 0;',
    '      go(AWAY); await tick(500);',
    '      P.reset();',
    '      go("shippingplan"); await tick(2500);',
    '      var h2 = P.byAction["system.health"] || 0;',
    '      OUT.health = { firstMount: h1, secondMount: h2,',
    '        identityKey: (function () { try { return window.KM.DB.deploymentContractIdentityKey(); } catch (e) { return null; } }()) };',
    '      go(AWAY); await tick(400);',
    '      // gapJob.status.get on the two owning routes, with no job ever started.',
    '      P.reset();',
    '      go("ops"); await tick(3000);',
    '      var g1 = P.byAction["gapJob.status.get"] || 0;',
    '      go(AWAY); await tick(400);',
    '      P.reset();',
    '      go("request-order"); await tick(3000);',
    '      var g2 = P.byAction["gapJob.status.get"] || 0;',
    '      go(AWAY); await tick(400);',
    '      // and on an unrelated route.',
    '      P.reset();',
    '      go("automation"); await tick(2000);',
    '      var g3 = P.byAction["gapJob.status.get"] || 0;',
    '      // THE OTHER HALF OF \u00a77. Zero reads is only correct if a job that MIGHT be running is still',
    '      // picked up. A marker is written exactly as a real START writes one, and the same mount is',
    '      // driven again: it must now ask, once.',
    '      go(AWAY); await tick(400);',
    '      var marked = nav("window.localStorage.setItem(\u0027km.gapjob.live.INVENTORY\u0027, JSON.stringify({runId:\u0027fixture-run\u0027,at:Date.now()}))");',
    '      P.reset();',
    '      go("ops"); await tick(3500);',
    '      var g4 = P.byAction["gapJob.status.get"] || 0;',
    '      go(AWAY); await tick(400);',
    '      // And the marker must be gone once the backend has been heard from.',
    '      var stillMarked = (function () { try { return window.KM.gapRecalc.mayHaveActiveJob("INVENTORY"); } catch (e) { return null; } }());',
    '      nav("window.localStorage.removeItem(\u0027km.gapjob.live.INVENTORY\u0027)");',
    '      OUT.gap = { siteInventory: g1, orderPlanning: g2, unrelated: g3,',
    '        withKnownActiveJob: g4, markerSetOk: marked === null, markerClearedAfterRead: stillMarked === false,',
    '        mayHaveActive: (function () { try { return window.KM.gapRecalc.mayHaveActiveJob("INVENTORY"); } catch (e) { return null; } }()) };',
    '      go(AWAY); await tick(300);',
    '',
    '      OUT.finalErrors = S.errors.slice(0, 12);',
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
  html = html.replace(/<head([^>]*)>/i, '<head$1>' + R11.probeScript(serverMs) + scriptProbe());
  html = html.replace(/<\/body>/i, driver(mode));
  const file = path.join(ROOT, '__s4r3-split-' + serverMs + '-' + (mode || 'all') + '-' + process.pid + '.html');
  fs.writeFileSync(file, html, 'utf8');
  try {
    const url = 'file:///' + file.split(path.sep).join('/').split(' ').join('%20');
    const r = cp.spawnSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
      '--disable-extensions', '--allow-file-access-from-files',
      '--virtual-time-budget=900000', '--dump-dom', url],
      { encoding: 'utf8', timeout: parseInt(process.env.S4R3_TIMEOUT || '1500000', 10), maxBuffer: 256 * 1024 * 1024 });
    const m = /<pre id="__measurements">([\s\S]*?)<\/pre>/.exec(r.stdout || '');
    if (!m) return { noMeasurements: true, status: r.status, stderr: String(r.stderr || '').slice(0, 600) };
    const raw = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    try { return JSON.parse(raw); } catch (e) { return { parseError: String(e.message), raw: raw.slice(0, 1000) }; }
  } finally {
    try { fs.unlinkSync(file); } catch (e) {}
  }
}

/* The static half of §1/§8: what index.html asks the browser to run before anything is clicked.
   Read from the file rather than from the browser, because it is a property of the document. */
function bootSurface() {
  const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
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
  return { scriptTags: local.length + remote.length, localCount: local.length, remoteCount: remote.length,
    bytes: bytes, local: local };
}

module.exports = { run, bootSurface, PILOT_ROUTES, CONTROL_ROUTE };

if (require.main === module) {
  const ms = parseInt(process.argv[2] || '400', 10);
  const mode = process.argv[3] || 'all';
  if (mode === 'boot') { console.log(JSON.stringify(bootSurface(), null, 1)); }
  else { console.log(JSON.stringify(run(ms, mode), null, 1)); }
}
