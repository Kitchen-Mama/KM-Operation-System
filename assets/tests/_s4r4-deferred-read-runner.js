/**
 * ==================================================================================================
 * S4-R4 — WHAT EACH PILOT PAGE ASKS FOR BEFORE ANYONE HAS ASKED IT ANYTHING
 * ==================================================================================================
 *
 * Three pages, one run, four questions each.
 *
 *   1. SHAPE (§3). Entering the route cold: which tables, in what order, over how many sequential
 *      rounds, and what is on screen when it settles. Then the FIRST CONSUMER interaction, counted
 *      separately, and then the SAME interaction again — because §7 asks for 1 and then 0.
 *   2. RE-ENTRY (§9). Leave, come back, and bounce A->B->A. S4-R2 bought retained models and a
 *      listener scope; a deferred read is the first thing that could spend them again.
 *   3. FAILURE (§7). The secondary table refused at the transport. Is the primary UI still there, is
 *      the refusal scoped to the secondary feature, is it distinguishable from empty, and does Retry
 *      perform exactly ONE new read.
 *   4. STALENESS (§12.8). A secondary answer that arrives after the user has left. It must not commit.
 *
 * WHAT IS AUTHORITATIVE: request counts and the tables behind them, read ROUNDS from sent/settled
 * marks, and DOM outcomes. All three are properties of control flow and hold at any server speed,
 * which the two SERVER_MS settings demonstrate rather than assert.
 *
 * WHAT IS NOT: milliseconds. S4-R1 measured why (virtual time freezes the clock inside a task) and
 * S4-R3 repeated the finding. Nothing here is reported in ms.
 *
 * ONE WAIT, AND IT IS THE S4-R2 ONE. A page mid-flight can look exactly like a page that has
 * finished — S4-R2 published a false finding from a wait that believed a transient empty box. So
 * `settle()` requires BOTH no outstanding request AND the same observation three times running.
 *
 * USAGE:  node assets/tests/_s4r4-deferred-read-runner.js [serverMs] [mode]
 *   mode: all | shape | reentry | failure | stale | invalidation
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
const R2 = require('./_s4r2-reentry-runner.js');   // its listener probe, not a second copy of it

const ROOT = path.join(__dirname, '..', '..');

/* ---------------------------------------------------------------------------------------------
   THE PILOTS, and the classification each one is being held to.

   `critical` are the tables the FIRST USEFUL UI provably consumes; `deferred` are the ones it
   provably does not. Naming both here (rather than only the deferred set) means the suite can ask
   whether a critical read went missing, which is the failure mode a deferral round actually risks.

   `firstUseful` is the selector for the thing the user can act on the moment the page settles. For
   all three pilots that is a CONTROL, not a row: Promotion Risk opens on a country picker with no
   scope chosen, and the other two open on filters above a table that says to click Search. That is
   the shipped design, not a fixture artifact, and §2 is asking exactly what it can render without.
   --------------------------------------------------------------------------------------------- */
const PILOTS = [
  {
    key: 'campaign-risk', section: 'campaign-risk-section', label: 'Promotion Risk Tracker',
    critical: ['getTable:marketplace_skus'],
    deferred: ['getTable:marketplaces', 'getTable:sku_details', 'getTable:campaigns', 'getTable:campaign_sku_lines'],
    firstUseful: '#cr-country option[value]:not([value=""])',
    primary: '#cr-kpi-cards .cr-kpi-card',
    dep: 'promotionRisk.scope',
    consumer: 'a country is selected',
    // The interaction that reaches the deferred set for the first time.
    fire: 'var s = document.getElementById("cr-country"); s.value = "US"; onCrCountryChange();',
    // What the deferred data is FOR, once it lands.
    consumed: '#cr-marketplace option[value]:not([value=""])',
    errorBox: '#campaign-risk-section .cr-empty-state--error',
    retry: 'crRetrySecondary()'
  },
  {
    key: 'factory-stock', section: 'factory-stock-section', label: 'Factory Inventory',
    critical: ['getTable:factory_stock', 'getTable:warehouses', 'getTable:sku_details'],
    deferred: ['getTable:factory_stock_movements'],
    // The dual-layer table renders DIVs, not rows. S4-R1's census asked for 'tr' here and recorded
    // useful:0 for a table that was in fact full - the count was an artifact of the selector.
    firstUseful: '#factory-stock-fixed-body .fixed-row',
    primary: '#factory-stock-fixed-body .fixed-row',
    dep: 'factoryInventory.movements',
    consumer: 'the Movement Log tab is opened',
    fire: 'switchFactoryTab("movement");',
    consumed: '[data-fs-panel="movement"] .fmv-dropdown-panel[data-filter="warehouse"] input[type="checkbox"]',
    errorBox: '[data-fs-panel="movement"] .fmv-secondary-error',
    retry: 'fmvRetrySecondary()'
  },
  {
    key: 'carrier-rate-card', section: 'carrier-rate-card-section', label: 'Carrier Rate Card',
    critical: ['getTable:carrier_rate_cards', 'getTable:carriers'],
    deferred: ['getTable:carrier_lead_times'],
    firstUseful: '#crcCarrierPanel input[type="checkbox"]',
    primary: '#crcCarrierPanel input[type="checkbox"]',
    dep: 'carrierRateCard.leadTimes',
    consumer: 'Search is clicked',
    fire: 'crcSearch();',
    consumed: '#crc-table-wrap table tbody tr',
    errorBox: '#carrier-rate-card-section .crc-secondary-error',
    retry: 'crcRetryLeadTimes()'
  }
];

const AWAY = 'supplychain';

/* ---------------------------------------------------------------------------------------------
   THE DRIVER.
   --------------------------------------------------------------------------------------------- */
function driver(mode) {
  const M = JSON.stringify(mode || 'all');
  return [
    '<pre id="__measurements"></pre>',
    '<script>',
    '(function () {',
    '  var P = window.__P;',
    '  var MODE = ' + M + ';',
    '  var PILOTS = ' + JSON.stringify(PILOTS) + ';',
    '  var AWAY = ' + JSON.stringify(AWAY) + ';',
    '  var OUT = { serverMs: window.__SERVER_MS, mode: MODE, shape: {}, reentry: {}, failure: {},',
    '    stale: {}, invalidation: {}, errors: [], fatal: null, progress: null, done: false };',
    '  function publish() { try { document.getElementById("__measurements").textContent = JSON.stringify(OUT); } catch (e) {} }',
    '  function tick(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }',
    '  function nav(expr) { try { (0, eval)(expr); return null; } catch (e) { return String(e && e.message).slice(0, 140); } }',
    '  function go(key) { return nav("showSection(" + JSON.stringify(key) + ")"); }',
    '  function count(sel) { try { return document.querySelectorAll(sel).length; } catch (e) { return -1; } }',
    '  function active(id) { var s = document.getElementById(id); return !!(s && s.classList.contains("active")); }',
    '  function liveListeners() { try { return window.__L.census().live; } catch (e) { return null; } }',
    '  function dstate(name) { try { return window.KM.deferredRead.state(name); } catch (e) { return "(none)"; } }',
    '  function dbg() { try { return window.__kmLifecycleDebug ? window.__kmLifecycleDebug() : {}; } catch (e) { return {}; } }',
    '  function openReqs() {',
    '    try { return (window.KM && window.KM.transport && window.KM.transport.openRequestDetails)',
    '      ? window.KM.transport.openRequestDetails().length : 0; } catch (e) { return 0; }',
    '  }',
    '  function tables() {',
    '    var o = {}; Object.keys(P.byAction).forEach(function (k) { if (k.indexOf("getTable:") === 0) o[k] = P.byAction[k]; });',
    '    return o;',
    '  }',
    '  /* Read ROUNDS, not request count: with a bounded read pool the cost the user waits through is',
    '     how many reads were paid for one AFTER another. Same derivation S4-R1 published. */',
    '  function rounds() {',
    '    var marks = P.marks;',
    '    if (!marks.length) return 0;',
    '    var sorted = marks.slice().sort(function (a, b) { return a.sent - b.sent; });',
    '    var n = 1, boundary = null;',
    '    sorted.forEach(function (m, i) {',
    '      if (i === 0) { boundary = m.settled; return; }',
    '      if (boundary !== null && m.sent >= boundary) { n++; boundary = m.settled; }',
    '      else if (m.settled !== null && (boundary === null || m.settled < boundary)) boundary = m.settled;',
    '    });',
    '    return n;',
    '  }',
    '',
    '  /* THE WAIT. S4-R2 shipped a false finding because its predicate accepted a transient empty box',
    '     as a settled page. Two conditions, both required: nothing is outstanding at the transport,',
    '     AND the observation has not changed across three consecutive polls. A page still working',
    '     fails one of them. */',
    '  async function settle(p, capMs) {',
    '    var cap = capMs || 15000, t0 = performance.now(), last = null, same = 0;',
    '    while (performance.now() - t0 < cap) {',
    '      var obs = null;',
    '      try {',
    '        obs = [openReqs(), count(p.primary), count(p.firstUseful), count(p.consumed),',
    '               count(p.errorBox), active(p.section)].join("|");',
    '      } catch (e) { obs = "ERR"; }',
    '      if (obs === last && obs.indexOf("0|") !== 0) same++; else { same = 0; last = obs; }',
    '      if (openReqs() === 0 && same >= 2) return true;',
    '      await tick(10);',
    '    }',
    '    return false;',
    '  }',
    '  function reading(p) {',
    '    return { api: P.api, tables: tables(), rounds: rounds(), openRequests: openReqs(),',
    '      active: active(p.section), firstUseful: count(p.firstUseful), primary: count(p.primary),',
    '      consumed: count(p.consumed), errorBox: count(p.errorBox),',
    '      visibleSections: dbg().activeVisibleSectionCount,',
    '      mountedSections: (dbg().mountedSections || []).length };',
    '  }',
    '',
    '  async function enter(p, capMs) { P.reset(); go(p.key); await settle(p, capMs); return reading(p); }',
    '  async function leave() { go(AWAY); await tick(400); }',
    '',
    '  (async function () {',
    '    try {',
    '      await tick(1200);   // boot',
    '',
    '      /* ---------------- 1. SHAPE (§3, §4, §7) ---------------- */',
    '      if (MODE === "all" || MODE === "shape") {',
    '        for (var i = 0; i < PILOTS.length; i++) {',
    '          var p = PILOTS[i];',
    '          OUT.progress = "shape:" + p.key; publish();',
    '          var rec = { label: p.label };',
    '          rec.initial = await enter(p, 20000);',
    '          /* THE FIRST CONSUMER. Counted on its own reset, so "what the interaction cost" is not',
    '             mixed with "what the mount cost". */',
    '          P.reset();',
    '          rec.fireError = nav(p.fire);',
    '          await settle(p, 20000);',
    '          rec.firstConsumer = reading(p);',
    '          /* THE SECOND USE. §7: 0 additional reads while the page model is still valid. */',
    '          P.reset();',
    '          nav(p.fire);',
    '          await settle(p, 20000);',
    '          rec.secondUse = reading(p);',
    /* THE DOUBLE CLICK. Invalidate, then fire the interaction TWICE with no wait between, which is
       two callers reaching ensure() while one read is in flight. One shared flight means one read;
       a single-flight written as a boolean, or none at all, means two. Nothing else in this file
       asks twice during a read, so without this the shared-flight guard is unobservable. */
    '          nav("window.KM.deferredRead.invalidate(" + JSON.stringify(p.dep) + ")");',
    '          P.reset();',
    '          nav(p.fire); nav(p.fire);',
    '          await settle(p, 20000);',
    '          rec.doubleFire = { api: P.api, tables: tables(), consumed: count(p.consumed),',
    '            reads: (function () { try { return window.KM.deferredRead.readCount(p.dep); } catch (e) { return null; } }()) };',
    '          await leave();',
    '          OUT.shape[p.key] = rec; publish();',
    '        }',
    '      }',
    '',
    '      /* ---------------- 2. RE-ENTRY (§9) ---------------- */',
    '      if (MODE === "all" || MODE === "reentry") {',
    '        for (var j = 0; j < PILOTS.length; j++) {',
    '          var q = PILOTS[j];',
    '          OUT.progress = "reentry:" + q.key; publish();',
    '          var r = { label: q.label };',
    '          r.cold = await enter(q, 20000);',
    '          await leave();',
    '          // Steady state reached: one mount and one unmount have happened, so what follows measures',
    '          // the MARGINAL cost of further cycles - the same statistic S4-R2 sealed at 0.',
    '          var beforeL = liveListeners();',
    '          r.onLeave = { openRequests: openReqs(), stillActive: active(q.section),',
    '            mountedSections: (dbg().mountedSections || []).length };',
    '          r.warm = await enter(q, 20000);',
    '          /* SECONDARY LOADED, THEN LEAVE AND RETURN. The deferred model is a page model like any',
    '             other: S4-R2 says a valid one survives the trip. */',
    '          P.reset(); nav(q.fire); await settle(q, 20000);',
    '          await leave();',
    '          r.afterSecondary = await enter(q, 20000);',
    '          P.reset(); nav(q.fire); await settle(q, 20000);',
    '          r.secondaryAfterReturn = reading(q);',
    '          /* RAPID A->B->A, no settle in between: the navigation sequence, not the data. */',
    '          P.reset();',
    '          go(q.key); await tick(30); go(AWAY); await tick(30); go(q.key);',
    '          await settle(q, 20000);',
    '          r.rapid = reading(q);',
    '          /* DRIFT IS READ WITH THE PAGE UNMOUNTED. Read while it is still on screen this counts',
    '             OCCUPANCY - the listeners a live page is entitled to - and every page looks like a leak.',
    '             S4-R2 reported 0 for two of these three pages and its seal still passes, so a disagreement',
    '             here would have been the instrument, not the application. */',
    '          await leave();',
    '          var afterL = liveListeners();',
    '          r.listenerDrift = (afterL == null || beforeL == null) ? null : (afterL - beforeL);',
    '          OUT.reentry[q.key] = r; publish();',
    '        }',
    '      }',
    '',
    '      /* ---------------- 3. FAILURE (§7, §12) ---------------- */',
    '      if (MODE === "all" || MODE === "failure") {',
    '        for (var k = 0; k < PILOTS.length; k++) {',
    '          var f = PILOTS[k];',
    '          OUT.progress = "failure:" + f.key; publish();',
    '          var rf = { label: f.label };',
    '          rf.primaryBefore = await enter(f, 20000);',
    '          /* Refuse EVERY deferred table once. A page that reads four of them must survive all four',
    '             failing, not just the first. */',
    '          P.reset();',
    '          f.deferred.forEach(function (t) { P.failFor[t] = 1; });',
    '          nav(f.fire);',
    '          await settle(f, 20000);',
    '          rf.onFailure = reading(f);',
    '          rf.failedCount = P.failed;',
    '          /* IS IT AN ERROR OR IS IT "EMPTY"? A page that answers "no rows" to a refused read has',
    '             told the user something false, and §7 counts that separately from a missing banner. */',
    '          rf.bodyText = (function () {',
    '            var s = document.getElementById(f.section);',
    '            return s ? String(s.innerText || "").replace(/\\s+/g, " ").slice(0, 400) : "";',
    '          }());',
    '          /* RETRY = ONE new read, against a network that now answers. The refusals are lifted',
    '             first: a scoped read rejects its whole batch on the first refusal, so a set of four',
    '             armed tables is not spent by one failed attempt, and leaving them armed would test',
    '             "does Retry survive a second outage" while reporting it as "does Retry recover". */',
    '          P.failFor = {};',
    '          P.reset();',
    '          rf.retryError = nav(f.retry);',
    '          await settle(f, 20000);',
    '          rf.onRetry = reading(f);',
    '          rf.retryApi = P.api;',
    '          rf.retryTables = tables();',
    '          await leave();',
    '          OUT.failure[f.key] = rf; publish();',
    '        }',
    '      }',
    '',
    '      /* ---------------- 4. STALENESS (§12.8) ---------------- */',
    '      if (MODE === "all" || MODE === "stale") {',
    '        for (var z = 0; z < PILOTS.length; z++) {',
    '          var t = PILOTS[z];',
    '          OUT.progress = "stale:" + t.key; publish();',
    '          var rs = { label: t.label };',
    '          await enter(t, 20000);',
    '          /* Make the secondary read arrive LATE, fire it, then leave before it lands. The answer',
    '             is for a route the user is no longer on; committing it is the defect. */',
    '          P.reset();',
    '          t.deferred.forEach(function (tb) { P.delayFor[tb] = 2500; });',
    '          nav(t.fire);',
    '          await tick(120);',
    '          go(AWAY);',
    '          await tick(3500);',
    '          rs.awayAfterLateAnswer = { visibleSections: dbg().activeVisibleSectionCount,',
    '            stillActive: active(t.section), openRequests: openReqs(),',
    '            mountedSections: (dbg().mountedSections || []).length };',
    '          t.deferred.forEach(function (tb) { delete P.delayFor[tb]; });',
    '          rs.backAfterStale = await enter(t, 20000);',
    '          await leave();',
    '          OUT.stale[t.key] = rs; publish();',
    '        }',
    '      }',
    '',
    '      /* ---------------- 5. INVALIDATION (\u00a78, \u00a712.9) ---------------- */',
    '      if (MODE === "all" || MODE === "invalidation") {',
    '        for (var w = 0; w < PILOTS.length; w++) {',
    '          var u = PILOTS[w];',
    '          OUT.progress = "invalidation:" + u.key; publish();',
    '          var ri = { label: u.label };',
    '          await enter(u, 20000);',
    '          P.reset(); nav(u.fire); await settle(u, 20000);',
    '          ri.afterFirstUse = { api: P.api, state: dstate(u.dep) };',
    /* A WRITE HAS HAPPENED, as far as this dependency is concerned. §8 says a deferred model must
       not survive a write that could have changed the same rows, so the question is whether
       invalidate() really returns it to NOT_LOADED and whether the NEXT use pays for exactly one
       read - neither zero, which would be stale, nor two, which would be a storm. */
    '          nav("window.KM.deferredRead.invalidate(" + JSON.stringify(u.dep) + ")");',
    '          ri.afterInvalidate = { state: dstate(u.dep) };',
    '          P.reset(); nav(u.fire); await settle(u, 20000);',
    '          ri.afterReuse = { api: P.api, state: dstate(u.dep), consumed: count(u.consumed), primary: count(u.primary) };',
    '          // And once more with no invalidation in between: still zero.',
    '          P.reset(); nav(u.fire); await settle(u, 20000);',
    '          ri.afterReuseAgain = { api: P.api };',
    '          ri.reads = (function () { try { return window.KM.deferredRead.readCount(u.dep); } catch (e) { return null; } }());',
    '          await leave();',
    '          OUT.invalidation[u.key] = ri; publish();',
    '        }',
    '      }',
    '',
    '      OUT.errors = (P.errors || []).slice(0, 12);',
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
  html = html.replace(/<head([^>]*)>/i, '<head$1>' + R11.probeScript(serverMs) + R2.listenerProbe());
  html = html.replace(/<\/body>/i, driver(mode));
  const file = path.join(ROOT, '__s4r4-deferred-' + serverMs + '-' + (mode || 'all') + '-' + process.pid + '.html');
  fs.writeFileSync(file, html, 'utf8');
  try {
    const url = 'file:///' + file.split(path.sep).join('/').split(' ').join('%20');
    const r = cp.spawnSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--user-data-dir=' + KM_CHROME_PROFILE,
      '--disable-extensions', '--allow-file-access-from-files',
      '--virtual-time-budget=900000', '--dump-dom', url],
      { encoding: 'utf8', timeout: parseInt(process.env.S4R4_TIMEOUT || '1500000', 10), maxBuffer: 256 * 1024 * 1024 });
    const m = /<pre id="__measurements">([\s\S]*?)<\/pre>/.exec(r.stdout || '');
    if (!m) return { noMeasurements: true, status: r.status, stderr: String(r.stderr || '').slice(0, 600) };
    const raw = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    try { return JSON.parse(raw); } catch (e) { return { parseError: String(e.message), raw: raw.slice(0, 1200) }; }
  } finally {
    try { fs.unlinkSync(file); } catch (e) {}
  }
}

module.exports = { run, PILOTS, AWAY };

if (require.main === module) {
  const ms = parseInt(process.argv[2] || '400', 10);
  const mode = process.argv[3] || 'all';
  console.log(JSON.stringify(run(ms, mode), null, 1));
}
