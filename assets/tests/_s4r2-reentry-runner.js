/**
 * ==================================================================================================
 * S4-R2 — WARM RE-ENTRY, AND WHAT A ROUTE LEAVES BEHIND
 * ==================================================================================================
 *
 * Two questions, one browser, one world.
 *
 * 1. SKU REGIONAL RE-ENTRY (§3/§4). Production reported that leaving the page and coming back can
 *    fail with "Failed to fetch", and that Retry does not reliably recover. This drives the ten
 *    scenarios §4 lists against the REAL shipped page and the REAL transport, with the network
 *    under the harness's control: a read can be made to fail a chosen number of times, to arrive
 *    late, or to answer with a NARROWER world so the rendered row count names which response is on
 *    screen. Nothing here is inferred from a comment.
 *
 * 2. LISTENER LIFECYCLE (§7/§8). S4-R1 counted addEventListener minus removeEventListener across
 *    the whole process. That number is a call ledger, not a leak: a listener bound to a row that
 *    innerHTML then discards is unreachable and costs nothing. This runner therefore classifies
 *    every registration BY TARGET and asks, at measurement time, whether the target is still in the
 *    document:
 *
 *        window            — lives forever. Always drift.
 *        document          — lives forever. Always drift.
 *        element, connected    — still in the DOM. Drift.
 *        element, disconnected — detached; collectable. NOT drift, and reported separately so the
 *                                distinction stays visible rather than being quietly folded in.
 *
 *    WeakRef is used to hold the targets, so the instrument cannot itself be the reason an element
 *    survives. A target whose WeakRef has been cleared is counted as collected.
 *
 * WHAT IS AUTHORITATIVE: request counts, dispatch counts, DOM outcomes, and listener counts by
 * target class. WHAT IS NOT: milliseconds — the virtual clock freezes during a task, which S4-R1
 * measured rather than assumed. §11 is answered with ORDERING instead, which this harness can see.
 *
 * USAGE:  node assets/tests/_s4r2-reentry-runner.js [serverMs]   → one JSON blob
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

const SRD = { key: 'sku-regional-details', section: 'sku-regional-details-section' };
const AWAY = 'supplychain';
const READ = 'skuDetails.workspace.get';

/* The five pages S4-R1 measured as re-binding on every mount and releasing nothing, plus SKU
   Details as the CONTROL — it binds once and adds one per re-entry, so it is what a repaired page
   should look like. A control that is already correct is what keeps the repair honest. */
const LISTENER_PAGES = [
  { key: 'fc-summary',     section: 'fc-summary-section',     label: 'FC Summary' },
  { key: 'overseas-stock', section: 'overseas-stock-section', label: 'Overseas Inventory' },
  { key: 'campaign-risk',  section: 'campaign-risk-section',  label: 'Promotion Risk Tracker' },
  { key: 'factory-stock',  section: 'factory-stock-section',  label: 'Factory Inventory' },
  { key: 'forecast',       section: 'forecast-section',       label: 'Forecast' },
  { key: 'skuDetails',     section: 'sku-section',            label: 'SKU Details (control)', control: true }
];

/* ---------------------------------------------------------------------------------------------
   THE LISTENER PROBE. Injected after S3-R11's probe, still inside <head>, so it wraps the
   registration points before any application script can reach them.
   --------------------------------------------------------------------------------------------- */
function listenerProbe() {
  return [
    '<script>',
    '(function () {',
    '  var L = { entries: [], intervals: {}, nextId: 1, unhandled: 0, unhandledDetail: [],',
    '            errors: 0, errorDetail: [], undefinedGlobals: [] };',
    '  window.__L = L;',
    '',
    '  // An unhandled rejection and a window error are both §9 evidence, so both are captured with',
    '  // their message rather than merely counted — a count cannot tell one defect from another.',
    '  window.addEventListener("unhandledrejection", function (e) {',
    '    L.unhandled++;',
    '    try { var r = e.reason; L.unhandledDetail.push(String((r && (r.message || r)) || "(no reason)").slice(0, 200)); } catch (x) {}',
    '  });',
    '  window.addEventListener("error", function (e) {',
    '    L.errors++;',
    '    try { L.errorDetail.push(String(e.message || "").slice(0, 200)); } catch (x) {}',
    '    // A ReferenceError names the identifier that was not defined. §9 wants the NAME, because',
    '    // "two unhandled rejections" is not something anyone can act on.',
    '    try {',
    '      var m = /(\\w[\\w$]*) is not defined/.exec(String(e.message || ""));',
    '      if (m && L.undefinedGlobals.indexOf(m[1]) < 0) L.undefinedGlobals.push(m[1]);',
    '    } catch (x) {}',
    '  }, true);',
    '',
    '  var HAS_WEAKREF = (typeof WeakRef === "function");',
    '  function kindOf(t) {',
    '    if (t === window) return "window";',
    '    if (typeof document !== "undefined" && t === document) return "document";',
    '    if (t && t.nodeType === 1) return "element";',
    '    return "other";',
    '  }',
    '  var addT = EventTarget.prototype.addEventListener;',
    '  var remT = EventTarget.prototype.removeEventListener;',
    '  EventTarget.prototype.addEventListener = function (type, fn) {',
    '    try {',
    '      var k = kindOf(this);',
    '      L.entries.push({ id: L.nextId++, kind: k, type: String(type), removed: false,',
    '        ref: HAS_WEAKREF ? new WeakRef(this) : null, hard: HAS_WEAKREF ? null : this, fn: fn });',
    '    } catch (e) {}',
    '    return addT.apply(this, arguments);',
    '  };',
    '  EventTarget.prototype.removeEventListener = function (type, fn) {',
    '    try {',
    '      for (var i = L.entries.length - 1; i >= 0; i--) {',
    '        var e = L.entries[i];',
    '        if (e.removed || e.type !== String(type) || e.fn !== fn) continue;',
    '        var t = e.ref ? e.ref.deref() : e.hard;',
    '        if (t === this) { e.removed = true; break; }',
    '      }',
    '    } catch (x) {}',
    '    return remT.apply(this, arguments);',
    '  };',
    '',
    '  // Intervals only. A timeout settles by itself and is never drift; an interval that outlives',
    '  // its page is exactly the drift §8 is asking about.',
    '  var si = window.setInterval, ci = window.clearInterval;',
    '  window.setInterval = function () { var h = si.apply(window, arguments); L.intervals[h] = 1; return h; };',
    '  window.clearInterval = function (h) { if (h != null) delete L.intervals[h]; return ci.apply(window, arguments); };',
    '',
    '  /* THE CENSUS. Every live registration, classified by whether its target can still be reached.',
    '     `collected` and `detached` are reported but never counted as drift — that separation is the',
    '     whole reason this probe exists instead of the R1 net counter. */',
    '  L.census = function () {',
    '    var o = { window: 0, document: 0, elementConnected: 0, elementDetached: 0, collected: 0,',
    '      other: 0, removed: 0, total: 0, byType: {} };',
    '    for (var i = 0; i < L.entries.length; i++) {',
    '      var e = L.entries[i];',
    '      if (e.removed) { o.removed++; continue; }',
    '      o.total++;',
    '      var t = e.ref ? e.ref.deref() : e.hard;',
    '      if (t === undefined || t === null) { o.collected++; continue; }',
    '      if (t === window) { o.window++; }',
    '      else if (typeof document !== "undefined" && t === document) { o.document++; }',
    '      else if (t.nodeType === 1) { if (t.isConnected) o.elementConnected++; else o.elementDetached++; }',
    '      else o.other++;',
    '      if (t === window || (typeof document !== "undefined" && t === document) ||',
    '          (t.nodeType === 1 && t.isConnected)) {',
    '        o.byType[e.type] = (o.byType[e.type] || 0) + 1;',
    '      }',
    '    }',
    '    // LIVE is the honest headline: the registrations that are still reachable from a root that',
    '    // outlives the route. Everything else is bookkeeping.',
    '    o.live = o.window + o.document + o.elementConnected;',
    '    o.intervals = Object.keys(L.intervals).length;',
    '    return o;',
    '  };',
    '  /* Scoped census: only the registrations whose target is inside ONE section (plus the window',
    '     and document ones, which no section owns but every page can add to). A page cannot be held',
    '     responsible for another page\\u0027s listeners, and a whole-process total cannot tell them apart. */',
    '  L.censusFor = function (sectionId) {',
    '    var sec = document.getElementById(sectionId);',
    '    var o = { inSection: 0, window: 0, document: 0, byType: {} };',
    '    for (var i = 0; i < L.entries.length; i++) {',
    '      var e = L.entries[i]; if (e.removed) continue;',
    '      var t = e.ref ? e.ref.deref() : e.hard;',
    '      if (t === undefined || t === null) continue;',
    '      if (t === window) { o.window++; o.byType["window:" + e.type] = (o.byType["window:" + e.type] || 0) + 1; continue; }',
    '      if (typeof document !== "undefined" && t === document) { o.document++; o.byType["document:" + e.type] = (o.byType["document:" + e.type] || 0) + 1; continue; }',
    '      if (t.nodeType === 1 && t.isConnected && sec && sec.contains(t)) {',
    '        o.inSection++; o.byType["el:" + e.type] = (o.byType["el:" + e.type] || 0) + 1;',
    '      }',
    '    }',
    '    return o;',
    '  };',
    '}());',
    '</script>'
  ].join('\n');
}

/* ---------------------------------------------------------------------------------------------
   THE DRIVER.
   --------------------------------------------------------------------------------------------- */
function driver(mode) {
  const J = JSON.stringify;
  return [
    '<pre id="__measurements"></pre>',
    '<script>',
    '(function () {',
    '  var P = window.__P, L = window.__L;',
    '  var SRD = ' + J(SRD) + ', AWAY = ' + J(AWAY) + ', READ = ' + J(READ) + ';',
    '  var PAGES = ' + J(LISTENER_PAGES) + ';',
    '  var MODE = ' + J(mode || 'all') + ';',
    '  var DO_SRD = (MODE === "all" || MODE === "srd");',
    '  var DO_LISTENERS = (MODE === "all" || MODE === "listeners");',
    '  var OUT = { serverMs: window.__SERVER_MS, mode: MODE, boot: {}, scenarios: {}, listeners: {},',
    '    ordering: {}, globals: {}, fatal: null, progress: null, done: false };',
    '  function publish() { try { document.getElementById("__measurements").textContent = JSON.stringify(OUT); } catch (e) {} }',
    '  function tick(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }',
    '  function qa(sel, root) { try { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); } catch (e) { return []; } }',
    '  function nav(expr) { try { (0, eval)(expr); return null; } catch (e) { return String(e.message).slice(0, 140); } }',
    '  function go(key) { return nav("showSection(" + JSON.stringify(key) + ")"); }',
    '  async function until(fn, capMs) {',
    '    var t0 = performance.now(), cap = capMs || 20000;',
    '    while (performance.now() - t0 < cap) { try { if (fn()) return true; } catch (e) {} await tick(8); }',
    '    return false;',
    '  }',
    '  function openReqs() {',
    '    try { return (window.KM && window.KM.transport && window.KM.transport.openRequestDetails)',
    '      ? window.KM.transport.openRequestDetails().length : null; } catch (e) { return null; }',
    '  }',
    '  function openDetail() {',
    '    try { return window.KM.transport.openRequestDetails().map(function (o) {',
    '      return o.action + "/" + o.kind; }); } catch (e) { return [String(e.message).slice(0, 60)]; }',
    '  }',
    '  function sec() { return document.getElementById(SRD.section); }',
    '  function items() { return qa("#srd-list .srd-item").length; }',
    '  function skeletons() { return qa("#srd-list .srd-skel").length; }',
    '  function emptyBox() { var e = qa("#srd-list .srd-empty")[0]; return e ? String(e.textContent).trim().slice(0, 90) : null; }',
    '  function errBanner() { return qa("#sku-regional-details-section .srd-note--error").length; }',
    '  function warnBanner() { return qa("#sku-regional-details-section .srd-note--stale").length; }',
    '  function bannerText() {',
    '    var n = qa("#srd-mode-note")[0];',
    '    return n ? String(n.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 160) : "";',
    '  }',
    '  function reads() { return P.byAction[READ] || 0; }',
    '  /* One reading of the page, in the vocabulary §4 asks for. MODEL_GENERATION is the rendered',
    '     row count: the harness serves a different number of SKUs per generation, so the number on',
    '     screen names the response that committed. */',
    '  function read(extra) {',
    '    var r = { requestCount: reads(), realNewDispatchCount: reads(),',
    '      openRequestsAfterSettle: openReqs(), openDetails: openDetail(),',
    '      failedTotal: P.failed, callsThisScenario: P.calls.slice(0, 12),',
    '      modelPresent: items() > 0, modelGeneration: items(),',
    '      errorBannerCount: errBanner(), staleWarningCount: warnBanner(),',
    '      permanentLoadingCount: skeletons(), emptyBox: emptyBox(), banner: bannerText(),',
    '      freshness: (function () { try { return window.srdFreshness ? window.srdFreshness() : null; }',
    '        catch (e) { return "ERR:" + e.message; } }()),',
    '      sectionActive: !!(sec() && sec().classList.contains("active")) };',
    '    r.entry = lastEntry; lastEntry = null;',
    '    if (extra) for (var k in extra) r[k] = extra[k];',
    '    return r;',
    '  }',
    '  function clearFail() { P.failFor = {}; }',
    '  function failRead(n) { P.failFor[READ] = n; }',
    '  async function leave() { go(AWAY); await tick(400); }',
    /* WAITING FOR A SETTLED PAGE, not for the first frame that happens to look finished.

       The first version of this wait exited as soon as ANY terminal-looking surface appeared —
       including the empty box that _srdRenderError_ paints. The page then re-entered its load
       path and repainted a skeleton, so the reading taken afterwards showed a skeleton and an
       open request and was read as permanent loading. It was neither: it was a snapshot taken
       mid-flight because the harness stopped waiting too early.

       A settled reading now requires BOTH: no request outstanding for this page, AND the same
       terminal state observed twice across a real interval. A page still holding a skeleton is
       never settled, which is what makes a genuine permanent-loading finding possible at all. */
    '  var lastEntry = null;',
    '  function srdOpenCount() {',
    '    try { return window.KM.transport.openRequestDetails().filter(function (o) {',
    '      return String(o.action || "").indexOf("skuDetails") === 0; }).length; } catch (e) { return 0; }',
    '  }',
    '  function terminal() {',
    '    if (skeletons() > 0) return null;',
    '    if (srdOpenCount() > 0) return null;',
    '    if (items() > 0) return "rows:" + items();',
    '    if (errBanner() > 0) return "error";',
    '    if (emptyBox()) return "empty";',
    '    return null;',
    '  }',
    '  async function waitSettled(capMs) {',
    '    var cap = capMs || 15000, t0 = performance.now(), seen = null, stable = 0;',
    '    while (performance.now() - t0 < cap) {',
    '      var t = terminal();',
    '      if (t !== null && t === seen) { stable++; if (stable >= 3) return { settled: true, state: t }; }',
    '      else { seen = t; stable = t === null ? 0 : 1; }',
    '      await tick(120);',
    '    }',
    '    return { settled: false, state: seen };',
    '  }',
    '  async function enterSrd(capMs) {',
    '    var cap = capMs || 15000, t0 = performance.now();',
    '    go(SRD.key);',
    '    var r = await waitSettled(cap);',
    '    lastEntry = { settled: r.settled, state: r.state, waitedPolls: Math.round(performance.now() - t0),',
    '      cap: cap, atEnd: { items: items(), skel: skeletons(), err: errBanner(),',
    '        open: openDetail(), failed: P.failed } };',
    '    await tick(250);',
    '  }',
    '  function retry() { return nav("srdRetry()"); }',
    '',
    '  (async function () {',
    '    try {',
    '      await tick(700);',
    '      OUT.boot = { api: P.api, listeners: L.census(), unhandled: L.unhandled,',
    '        errors: L.errors, undefinedGlobals: L.undefinedGlobals.slice(0) };',
    '      publish();',
    '',
    '      if (DO_SRD) {',
    '      // ================= §4 — THE TEN RE-ENTRY SCENARIOS ============================',
    '      // A · cold open -> success',
    '      OUT.progress = "A"; publish();',
    '      P.reset(); clearFail();',
    '      await enterSrd(25000);',
    '      OUT.scenarios.A = read({ what: "cold open -> success" });',
    '',
    '      // B · leave -> immediate return',
    '      OUT.progress = "B"; publish();',
    '      await leave(); P.reset();',
    '      await enterSrd();',
    '      OUT.scenarios.B = read({ what: "leave -> immediate return" });',
    '',
    '      // C · leave -> wait -> return',
    '      OUT.progress = "C"; publish();',
    '      await leave(); await tick(3000); P.reset();',
    '      await enterSrd();',
    '      OUT.scenarios.C = read({ what: "leave -> wait -> return" });',
    '',
    '      // D · rapid SRD -> away -> SRD',
    '      OUT.progress = "D"; publish();',
    '      P.reset();',
    '      go(SRD.key); await tick(30); go(AWAY); await tick(30); go(SRD.key);',
    '      await waitSettled(15000);',
    '      await tick(400);',
    '      OUT.scenarios.D = read({ what: "rapid A -> B -> A",',
    '        visibleSections: qa(".module-section.active").length });',
    '',
    '      // E · leave WHILE the read is in flight -> return.',
    '      //     The model must be dropped first, or there is no read to interrupt.',
    '      OUT.progress = "E"; publish();',
    '      await leave();',
    '      nav("window.srdInvalidate && window.srdInvalidate()");',
    '      P.reset(); P.delayFor[READ] = 2500;',
    '      go(SRD.key); await tick(120);',
    '      var eMid = { reads: reads(), open: openReqs(), skeleton: skeletons() };',
    '      go(AWAY); await tick(80);',
    '      go(SRD.key);',
    '      await waitSettled(20000);',
    '      await tick(500);',
    '      P.delayFor = {};',
    '      OUT.scenarios.E = read({ what: "leave while in flight -> return", mid: eMid });',
    '',
    '      // F · a refresh on re-entry FAILS. The model is dropped first so a read is forced,',
    '      //     then every attempt is refused at the network.',
    '      OUT.progress = "F"; publish();',
    '      await leave();',
    '      nav("window.srdInvalidate && window.srdInvalidate()");',
    '      P.reset(); failRead(99);',
    '      await enterSrd();',
    '      OUT.scenarios.F = read({ what: "refresh failure on re-entry", failed: P.failed });',
    '',
    '      // G · failure -> Retry (the retry is allowed to succeed)',
    '      OUT.progress = "G"; publish();',
    '      clearFail(); P.reset();',
    '      retry();',
    '      await waitSettled(20000);',
    '      await tick(400);',
    '      OUT.scenarios.G = read({ what: "failure -> Retry (succeeds)" });',
    '',
    '      // H · failure -> Retry -> fails again -> Retry again',
    '      OUT.progress = "H"; publish();',
    '      await leave();',
    '      nav("window.srdInvalidate && window.srdInvalidate()");',
    '      P.reset(); failRead(99);',
    '      await enterSrd();',
    '      var hAfterEntry = reads();',
    '      retry(); await tick(900);',
    '      var hAfterR1 = reads();',
    '      retry(); await tick(900);',
    '      var hAfterR2 = reads();',
    '      OUT.scenarios.H = read({ what: "failure -> Retry -> Retry, all failing",',
    '        afterEntry: hAfterEntry, afterRetry1: hAfterR1, afterRetry2: hAfterR2,',
    '        retryDispatch1: hAfterR1 - hAfterEntry, retryDispatch2: hAfterR2 - hAfterR1 });',
    '',
    '      // F2 · THE CASE §5 IS ABOUT: rows already on screen, and the refresh is refused.',
    '      //      Retry over a last-good model forces a read; it must fail WITHOUT costing the rows.',
    '      OUT.progress = "F2"; publish();',
    '      clearFail(); await leave(); P.reset(); await enterSrd();',
    '      var f2Before = { items: items(), freshness: read().freshness };',
    '      failRead(99); P.reset();',
    '      retry();',
    '      await tick(2500);',
    '      OUT.scenarios.F2 = read({ what: "refresh fails WITH last-good model",',
    '        before: f2Before, failedDelta: P.failed });',
    '      publish();',

    '      // K · can repeated failing retries poison a later entry? Four refusals, then recovery.',
    '      OUT.progress = "K"; publish();',
    '      P.reset();',
    '      retry(); await tick(900); retry(); await tick(900); retry(); await tick(900);',
    '      var kWhileFailing = read();',
    '      clearFail(); P.reset();',
    '      retry(); await waitSettled(20000); await tick(300);',
    '      OUT.scenarios.K = read({ what: "repeated retry, then the network recovers",',
    '        whileFailing: { items: kWhileFailing.modelGeneration, warn: kWhileFailing.staleWarningCount,',
    '          err: kWhileFailing.errorBannerCount, freshness: kWhileFailing.freshness },',
    '        retriesWhileFailing: 3 });',
    '      publish();',

    '      // I · failure -> navigate away -> return. Does a past failure poison the next entry?',
    '      OUT.progress = "I"; publish();',
    '      clearFail();',
    '      await leave(); P.reset();',
    '      await enterSrd();',
    '      OUT.scenarios.I = read({ what: "failure -> leave -> return (recovers?)" });',
    '',
    '      // J · an OLDER response resolves after a NEWER one. The two answers carry different',
    '      //     SKU counts, so whichever is on screen names itself.',
    '      OUT.progress = "J"; publish();',
    '      await leave();',
    '      nav("window.srdInvalidate && window.srdInvalidate()");',
    '      P.reset(); P.skuCapFor[READ] = 4; P.delayFor[READ] = 2600;',
    '      go(SRD.key); await tick(150);',
    '      var jMid = { reads: reads(), open: openReqs() };',
    '      // A SECOND, FULL answer requested while the narrow one is still out.',
    '      P.skuCapFor[READ] = 0; P.delayFor[READ] = 0;',
    '      nav("window.srdInvalidate && window.srdInvalidate()");',
    '      go(AWAY); await tick(40); go(SRD.key);',
    '      await waitSettled(20000);',
    '      await tick(3200);                       // long enough for the SLOW one to land too',
    '      P.skuCapFor = {}; P.delayFor = {};',
    '      OUT.scenarios.J = read({ what: "old response resolves after newer", mid: jMid,',
    '        narrowSkuCount: 4 });',
    '      publish();',
    '',
    '      // ================= §11 — ORDERING (ms are not observable; ordering is) =========',
    '      OUT.progress = "ordering"; publish();',
    '      clearFail();',
    '      await leave(); await tick(300);',
    '      nav("window.srdInvalidate && window.srdInvalidate()");',
    '      // COLD: how much had settled when the section became visible, and when rows appeared.',
    '      P.reset(); P.delayFor[READ] = 1200;',
    '      go(SRD.key);',
    '      await until(function () { return !!(sec() && sec().classList.contains("active")); }, 12000);',
    '      var coldShell = { settled: P.marks.filter(function (m) { return m.settled !== null; }).length,',
    '        sent: P.marks.length, items: items(), skeleton: skeletons() };',
    '      await waitSettled(20000);',
    '      await tick(300);',
    '      var coldDone = { items: items(), reads: reads() };',
    '      // WARM: the same two readings on a return trip.',
    '      await leave(); await tick(300);',
    '      P.reset();',
    '      go(SRD.key);',
    '      await until(function () { return !!(sec() && sec().classList.contains("active")); }, 12000);',
    '      var warmShell = { settled: P.marks.filter(function (m) { return m.settled !== null; }).length,',
    '        sent: P.marks.length, items: items(), skeleton: skeletons() };',
    '      await tick(60);',
    '      var warmEarly = { items: items(), reads: reads(), settled: P.marks.filter(function (m) { return m.settled !== null; }).length };',
    '      await waitSettled(20000);',
    '      await tick(400);',
    '      P.delayFor = {};',
    '      OUT.ordering = { coldShell: coldShell, coldDone: coldDone, warmShell: warmShell,',
    '        warmEarly: warmEarly, warmFinal: { items: items(), reads: reads() } };',
    '      publish();',
    '',
    '      }',                      // end DO_SRD
    '      if (DO_LISTENERS) {',
    '      // ================= §7/§8 — LISTENER LIFECYCLE =================================',
    '      OUT.progress = "listeners"; publish();',
    '      await leave(); await tick(400);',
    '      for (var pi = 0; pi < PAGES.length; pi++) {',
    '        var pg = PAGES[pi];',
    '        OUT.progress = "listeners:" + pg.key; publish();',
    '        var rec = { label: pg.label, section: pg.section, control: !!pg.control, cycles: [] };',
    '        try {',
    '          // mount / unmount / mount / unmount, then ten rapid switches — §8 verbatim.',
    '          for (var c = 0; c < 2; c++) {',
    '            go(pg.key); await tick(1400);',
    '            var afterMount = L.censusFor(pg.section);',
    '            afterMount.global = L.census();',
    '            go(AWAY); await tick(700);',
    '            var afterUnmount = L.censusFor(pg.section);',
    '            afterUnmount.global = L.census();',
    '            rec.cycles.push({ mount: afterMount, unmount: afterUnmount });',
    '          }',
    '          var before10 = L.census();',
    '          for (var s = 0; s < 10; s++) { go(pg.key); await tick(260); go(AWAY); await tick(180); }',
    '          await tick(900);',
    '          var after10 = L.census();',
    '          go(pg.key); await tick(1400);',
    '          rec.afterTenReentries = L.censusFor(pg.section);',
    '          rec.afterTenReentries.global = L.census();',
    '          go(AWAY); await tick(700);',
    '          rec.tenSwitchDelta = { live: after10.live - before10.live,',
    '            window: after10.window - before10.window,',
    '            document: after10.document - before10.document,',
    '            elementConnected: after10.elementConnected - before10.elementConnected,',
    '            elementDetached: after10.elementDetached - before10.elementDetached,',
    '            intervals: after10.intervals - before10.intervals };',
    '        } catch (e) { rec.threw = String(e && e.message).slice(0, 160); }',
    '        OUT.listeners[pg.key] = rec; publish();',
    '      }',
    '',
    '      }',                      // end DO_LISTENERS
    '      // ================= §9 — UNDEFINED GLOBALS =====================================',
    '      OUT.progress = "globals"; publish();',
    '      OUT.globals = { unhandled: L.unhandled, unhandledDetail: L.unhandledDetail.slice(0, 12),',
    '        errors: L.errors, errorDetail: L.errorDetail.slice(0, 12),',
    '        undefinedGlobals: L.undefinedGlobals.slice(0),',
    '        forecastReviewDataDefined: (typeof window.forecastReviewData !== "undefined"),',
    '        forecastReviewDataLastYearDefined: (typeof window.forecastReviewDataLastYear !== "undefined") };',
    '      OUT.finalCensus = L.census();',
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
  html = html.replace(/<head([^>]*)>/i, '<head$1>' + R11.probeScript(serverMs) + listenerProbe());
  html = html.replace(/<\/body>/i, driver(mode));
  const file = path.join(ROOT, '__s4r2-reentry-' + serverMs + '-' + (mode || 'all') + '-' + process.pid + '.html');
  fs.writeFileSync(file, html, 'utf8');
  try {
    const url = 'file:///' + file.split(path.sep).join('/').split(' ').join('%20');
    const r = cp.spawnSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--user-data-dir=' + KM_CHROME_PROFILE,
      '--disable-extensions', '--allow-file-access-from-files', '--js-flags=--expose-gc',
      '--virtual-time-budget=900000', '--dump-dom', url],
      { encoding: 'utf8', timeout: parseInt(process.env.S4R2_TIMEOUT || '1500000', 10), maxBuffer: 256 * 1024 * 1024 });
    const m = /<pre id="__measurements">([\s\S]*?)<\/pre>/.exec(r.stdout || '');
    if (!m) return { noMeasurements: true, status: r.status, stderr: String(r.stderr || '').slice(0, 600) };
    const raw = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    try { return JSON.parse(raw); } catch (e) { return { parseError: String(e.message), raw: raw.slice(0, 1000) }; }
  } finally {
    try { fs.unlinkSync(file); } catch (e) {}
  }
}

// listenerProbe is exported so S4-R4 counts listeners with THIS instrument rather than a second
// copy of it: two rounds disagreeing about listener drift must mean the app changed, not the probe.
module.exports = { run, SRD, AWAY, READ, LISTENER_PAGES, listenerProbe };

if (require.main === module) {
  const ms = parseInt(process.argv[2] || '0', 10);
  console.log(JSON.stringify(run(ms, process.argv[3] || 'all'), null, 1));
}
