/**
 * ==================================================================================================
 * S4-R2 — WARM RE-ENTRY RELIABILITY · LISTENER LIFECYCLE · ROUTE RECOVERY
 * ==================================================================================================
 *
 * Three repairs, each measured in a real browser against the real shipped page, and each with a
 * planted defect that must be caught.
 *
 *   A · SKU Regional keeps its rows when a refresh fails, and says so instead of pretending.
 *   B · A page's listeners belong to its mount, and a return trip leaves none behind.
 *   C · The Forecast page stopped reading two globals that have not existed for months.
 *
 * WHAT IS ASSERTED FROM MEASUREMENT AND WHAT FROM SOURCE, stated once so no assertion below has to
 * be read hopefully. Request counts, rendered row counts, freshness states and live listener counts
 * are READ FROM A BROWSER RUN — they are properties of control flow, true at any server speed.
 * Ordering claims (§11) are read the same way. Only the STRUCTURE of a repair is asserted from
 * source, and then only where the structure is the contract: that the post-write read is forced,
 * that no repaint follows the nulling of the model.
 *
 * MILLISECONDS ARE NOT ASSERTED ANYWHERE. S4-R1 established that the virtual clock freezes during a
 * task, and §11 asks for ordering instead where that is so. This suite honours that.
 * ==================================================================================================
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const EV = path.join(ROOT, 'docs', 'evidence', 's4-r2-warm-reentry');

let passed = 0, failed = 0;
function ok(cond, msg, extra) {
  if (cond) { passed++; console.log('  ok   ' + msg); }
  else {
    failed++; console.log('FAIL  ' + msg);
    if (extra !== undefined) console.log('        ' + JSON.stringify(extra));
  }
}
function eq(a, b, msg) {
  const good = JSON.stringify(a) === JSON.stringify(b);
  if (good) { passed++; console.log('  ok   ' + msg); }
  else { failed++; console.log('FAIL  ' + msg); console.log('        expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); }
}
function section(t) { console.log('\n-- ' + t + ' ' + '-'.repeat(Math.max(0, 96 - t.length)) + '\n'); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function fnOf(src, name) {
  const at = src.indexOf('function ' + name + '(');
  if (at < 0) return '';
  // to the next top-level-ish declaration; generous, and only ever used to scope a search
  const next = src.indexOf('\n    function ', at + 10);
  return src.slice(at, next > 0 ? next : at + 4000);
}

const M = JSON.parse(fs.readFileSync(path.join(EV, 'measurements.json'), 'utf8'));
const SRD_JS = read('assets/js/pages/sku-regional-details.js');
const LIFECYCLE = read('assets/js/core/lifecycle.js');
const FORECAST = read('assets/js/pages/forecast.js');
const DATA = read('assets/js/utils/data.js');

/* ==================================================================================================
   A — SKU REGIONAL: WARM RE-ENTRY
   ================================================================================================== */
section('A. WARM RE-ENTRY — the rows are already there, and nothing is fetched to prove it');

const S = M.scenarios;
ok(!!S, 'A0  the evidence carries the scenario set');

eq(S.A.requestCount, 1, 'A1  cold entry costs exactly ONE canonical workspace read');
ok(S.A.modelGeneration > 0, 'A1a and it renders rows');
eq(S.A.freshness, 'CURRENT', 'A1b and the page calls its own state CURRENT');

// §5 WARM REENTRY: usable without waiting for a network response.
['B', 'C', 'D'].forEach(function (k) {
  eq(S[k].requestCount, 0, 'A2  warm re-entry (' + S[k].what + ') costs ZERO requests');
  ok(S[k].modelGeneration > 0, 'A2a and the rows are on screen');
  eq(S[k].permanentLoadingCount, 0, 'A2b with no skeleton left behind');
});

// §11 — ordering, because milliseconds are not observable here.
const O = M.ordering;
eq(O.coldShell.settled, 0, 'A3  SHELL_BEFORE_NETWORK_SETTLE: cold, the section is visible before any read has settled');
eq(O.warmShell.settled, 0, 'A3a warm, likewise — nothing had settled when the section appeared');
ok(O.warmShell.items > 0, 'A3b LAST_GOOD_MODEL_BEFORE_NETWORK_SETTLE: the rows were ALREADY there at that moment');
eq(O.warmShell.skeleton, 0, 'A3c and no loading surface was shown over them');
eq(O.warmFinal.reads, 0, 'A3d WARM_REENTRY_BLOCKS_ON_NETWORK = NO — there was no network to block on');

// §4-E — leaving mid-flight and returning must not duplicate the read.
eq(S.E.requestCount, 1, 'A4  leave-while-in-flight then return still costs ONE read, not two');
ok(S.E.modelGeneration > 0, 'A4a and it recovers to rows');

/* ==================================================================================================
   B — A FAILED REFRESH KEEPS THE ROWS
   ================================================================================================== */
section('B. REFRESH FAILURE — the network broke, not the data');

// F2 is the case §5 exists for: rows on screen, refresh refused.
ok(S.F2.before.items > 0, 'B0  the scenario began with a last-good model on screen');
ok(S.F2.modelGeneration > 0, 'B1  LAST_GOOD_MODEL_SURVIVES_REFRESH_FAILURE — the rows are still there');
eq(S.F2.modelGeneration, S.F2.before.items, 'B1a all of them, not a subset');
eq(S.F2.freshness, 'REFRESH_FAILED_WITH_LAST_GOOD', 'B1b and the page names that state rather than implying it');
eq(S.F2.staleWarningCount, 1, 'B2  a non-destructive warning is shown');
eq(S.F2.errorBannerCount, 0, 'B2a and NOT the error banner — the page is not in an error-only state');
eq(S.F2.permanentLoadingCount, 0, 'B2b PERMANENT_LOADING_COUNT = 0');

// The other branch is untouched: a failure with nothing to fall back on is still a truthful error.
eq(S.F.modelGeneration, 0, 'B3  with NO last-good model a failed read still shows nothing');
eq(S.F.errorBannerCount, 1, 'B3a and the truthful error banner instead');
eq(S.F.freshness, 'FAILED_NO_MODEL', 'B3b named FAILED_NO_MODEL, which is a different state');
eq(S.F.permanentLoadingCount, 0, 'B3c and still no permanent skeleton');

// Freshness must never be silently claimed. A retained model is never reported CURRENT.
ok(S.F2.freshness !== 'CURRENT', 'B4  stale data is NEVER presented as newly refreshed');

/* ==================================================================================================
   C — RETRY
   ================================================================================================== */
section('C. RETRY — one genuinely new request, and never at the cost of the rows');

// A logical read is ONE dispatch plus the transport's own bounded auto-retry. The page's contract is
// about how many READS it asks for, which is what these deltas measure.
eq(S.G.requestCount, 1, 'C1  RETRY_REAL_NEW_REQUEST_COUNT — a successful Retry is one read');
ok(S.G.modelGeneration > 0, 'C1a and it recovers');
eq(S.G.freshness, 'CURRENT', 'C1b to CURRENT');

eq(S.H.retryDispatch1, S.H.retryDispatch2, 'C2  a second Retry dispatches the same as the first — no reuse of a rejected promise');
ok(S.H.retryDispatch1 > 0, 'C2a and it IS a dispatch, not a no-op button');
eq(S.H.errorBannerCount, 1, 'C2b each failing Retry leaves exactly one error banner, not a stack of them');

// §12.4 — repeated retry must not poison a later entry.
eq(S.K.whileFailing.items, S.F2.before.items, 'C3  three failing retries in a row cost no rows');
eq(S.K.whileFailing.freshness, 'REFRESH_FAILED_WITH_LAST_GOOD', 'C3a and hold the same honest state throughout');
eq(S.K.requestCount, 1, 'C3b then the network recovers and ONE read fixes it');
eq(S.K.freshness, 'CURRENT', 'C3c REPEATED_RETRY_POISON_COUNT = 0');
ok(S.I.modelGeneration > 0, 'C4  and a past failure does not poison a later route entry either');

/* ==================================================================================================
   D — STALE RESPONSES
   ================================================================================================== */
section('D. GENERATION — an older answer may not overwrite a newer one');

// J serves a NARROW world slowly, then a full one; whichever is on screen names itself by row count.
ok(S.J.modelGeneration > 4, 'D1  STALE_RESPONSE_COMMIT_COUNT = 0 — the narrow, older answer did not win');
eq(S.J.modelGeneration, S.A.modelGeneration, 'D1a the full answer is what is rendered');
eq(S.J.freshness, 'CURRENT', 'D1b and the page is CURRENT, not quietly holding stale rows');

// The mechanism, asserted at source because it IS the contract.
ok(/mySeq !== _srdReadSeq/.test(SRD_JS), 'D2  the read-generation guard is retained');
const afterWrite = fnOf(SRD_JS, '_srdAfterWrite');
ok(/_srdWorkspaceRefresh_\(\{ force: true \}\)/.test(afterWrite),
  'D3  POST_WRITE_INVALIDATION_OWNER: _srdAfterWrite forces its read, so a pre-write flight cannot answer it');
ok(/CONSUMER_SUPPLIED_ABORT_SIGNAL|signal: new AbortController\(\)\.signal/.test(SRD_JS),
  'D3a using the existing no-sharing seam rather than a new transport path');

// §11 NO-GO: no TTL, no cross-route cache, no prefetch was introduced to get any of this.
ok(!/\bTTL\b|ttlMs|maxAge|setTimeout\([^)]*refresh/i.test(fnOf(SRD_JS, '_srdWorkspaceRefresh_')),
  'D4  NO TTL and no timer-driven refresh was added');
ok(!/localStorage|sessionStorage|indexedDB/i.test(SRD_JS),
  'D4a and nothing was persisted beyond the session — this is an in-memory last-good model only');
ok(!/prefetch/i.test(SRD_JS), 'D4b no speculative prefetch');

/* ==================================================================================================
   E — LISTENER LIFECYCLE
   ================================================================================================== */
section('E. LISTENERS — mount owns, unmount releases, a remount makes one equivalent set');

const L = M.listeners;
const PAGES = Object.keys(L);
eq(PAGES.length, 6, 'E0  all five measured pages plus the control were driven');

PAGES.forEach(function (k) {
  const r = L[k];
  eq(r.tenSwitchDelta.live, 0, 'E1  LISTENER_DRIFT = 0 after ten return trips: ' + r.label);
  eq(r.tenSwitchDelta.intervals, 0, 'E1a TIMER_DRIFT = 0: ' + r.label);
  eq(r.tenSwitchDelta.window, 0, 'E1b no window listener survives a leave: ' + r.label);
  eq(r.tenSwitchDelta.document, 0, 'E1c nor a document one: ' + r.label);
});

// Anti-vacuity: a run that bound nothing would also show zero drift.
const boundSomething = PAGES.filter(function (k) { return L[k].cycles[0].mount.inSection > 0; });
ok(boundSomething.length === PAGES.length, 'E2  every page actually bound listeners inside its own section', boundSomething.length);

// §8 — one user action, one handler execution. Measured as: the live set after ten re-entries is the
// same size as the set after one mount, so no handler exists twice.
PAGES.forEach(function (k) {
  const r = L[k];
  eq(r.afterTenReentries.inSection, r.cycles[1].mount.inSection,
    'E3  DUPLICATE_HANDLER_FIRE = 0 — one equivalent active set after ten re-entries: ' + r.label);
});

// The owner, and the ordering that makes it safe.
ok(/KM\.lifecycle\.listenerScope = function/.test(LIFECYCLE), 'E4  LISTENER_OWNER is the lifecycle manager');
ok(/KM\.lifecycle\.releaseListenerScope = function/.test(LIFECYCLE), 'E4a with an explicit release');
const switchTo = LIFECYCLE.slice(LIFECYCLE.indexOf('KM.lifecycle.switchTo = function'),
  LIFECYCLE.indexOf('KM.lifecycle.currentEpoch'));
ok(switchTo.indexOf('releaseListenerScope(currentPage)') > switchTo.indexOf('registry[currentPage].unmount(my)'),
  'E4b released AFTER the page’s own unmount hook, so a hand-written removal still wins');
ok((switchTo.match(/releaseListenerScope\(currentPage\)/g) || []).length === 2,
  'E4c and on the throwing path too — one broken teardown must not reintroduce the drift');

// §7 forbids three specific non-repairs. Asserted against the source of the repaired pages.
const REPAIRED = ['assets/js/pages/forecast.js', 'assets/js/pages/factory-stock.js',
  'assets/js/pages/sku-details.js'].map(read).join('\n');
ok(!/once:\s*true/.test(REPAIRED), 'E5  not repaired with a global once:true');
ok(!/hidden-page|neverUnmount|skipUnmount/i.test(REPAIRED), 'E5a nor with a never-unmount workaround');

/* ==================================================================================================
   F — THE UNDEFINED GLOBALS
   ================================================================================================== */
section('F. data.js — two globals that had not existed for months');

eq(M.globals.unhandled, 0, 'F1  UNHANDLED_REJECTION_COUNT_POST = 0');
eq(M.globals.errors, 0, 'F1a and no window errors either');
eq(M.globals.undefinedGlobals, [], 'F1b UNDEFINED_GLOBAL_READ_COUNT_POST = 0 — nothing named as undefined');
ok(M.baseline && M.baseline.unhandled > 0,
  'F2  and the baseline recorded the defect it replaced, so this is a repair rather than a claim', M.baseline);

ok(!/[^.\w]forecastReviewData\b/.test(DATA.replace(/\/\/[^\n]*/g, '')),
  'F3  data.js no longer reads the retired array outside comments');
ok(!/DataRepo\.getForecastReviewData|DataRepo\.getForecastReviewSummary/.test(FORECAST.replace(/\/\/[^\n]*/g, '')),
  'F3a and forecast.js no longer calls the retired methods');
ok(/_forecastSummaryFromSeries/.test(FORECAST), 'F4  the summary now derives from the series the page already fetched');
// §9 forbids the lazy repair by name.
ok(!/window\.forecastReviewData\s*=|var forecastReviewData\s*=|let forecastReviewData\s*=/.test(DATA + FORECAST),
  'F5  and NO dummy global was created to silence the error');

/* ==================================================================================================
   G — MUTATION. Every repair, broken on purpose.
   ================================================================================================== */
section('G. MUTATION — each repair, removed, must be caught');

const R = require('./_s4r2-reentry-runner.js');
const TARGETS = {
  srd: 'assets/js/pages/sku-regional-details.js',
  lifecycle: 'assets/js/core/lifecycle.js',
  forecast: 'assets/js/pages/forecast.js',
  data: 'assets/js/utils/data.js'
};

function swap(file, from, to) {
  const p = path.join(ROOT, file);
  const src = fs.readFileSync(p, 'utf8');
  if (src.indexOf(from) < 0) return { harness: 'ANCHOR NOT FOUND in ' + file + ': ' + from.slice(0, 70) };
  if (src.indexOf(from) !== src.lastIndexOf(from)) return { harness: 'ANCHOR AMBIGUOUS in ' + file };
  fs.writeFileSync(p, src.replace(from, to), 'utf8');
  return { restore: function () { fs.writeFileSync(p, src, 'utf8'); } };
}

let killed = 0, survived = 0, harnessErrors = 0;
function mutant(name, file, from, to, mode, detects) {
  const m = swap(file, from, to);
  if (m.harness) { harnessErrors++; failed++; console.log('HARNESS ERROR  ' + name + ' — ' + m.harness); return; }
  let out = null, threw = null;
  try { out = R.run(400, mode); } catch (e) { threw = e; } finally { m.restore(); }
  if (threw) { harnessErrors++; failed++; console.log('HARNESS ERROR  ' + name + ' — runner threw: ' + threw.message); return; }
  let caught = false, why = '';
  try { caught = !!detects(out); } catch (e) { why = ' (probe threw: ' + e.message + ')'; caught = false; }
  if (caught) { killed++; passed++; console.log('  ok   ' + name + ' KILLED'); }
  else { survived++; failed++; console.log('FAIL  ' + name + ' SURVIVED' + why); }
}

// G1 — let a failed refresh clear the model again (§12 "let refresh error clear the model").
mutant('G1 a failed refresh destroys the rows again', TARGETS.srd,
  '        if (_srdEffectiveWorkspace() && _srdReadModel) {\r\n            _srdFreshness = SRD_FRESHNESS.REFRESH_FAILED_WITH_LAST_GOOD;',
  '        if (false) {\r\n            _srdFreshness = SRD_FRESHNESS.REFRESH_FAILED_WITH_LAST_GOOD;',
  'srd',
  function (o) { return o.scenarios.F2.modelGeneration === 0 || o.scenarios.F2.staleWarningCount === 0; });

// G2 — report a retained model as freshly loaded (§6 "stale data must not be silently presented").
mutant('G2 a retained model reports itself CURRENT', TARGETS.srd,
  '            _srdFreshness = SRD_FRESHNESS.REFRESH_FAILED_WITH_LAST_GOOD;',
  '            _srdFreshness = SRD_FRESHNESS.CURRENT;',
  'srd',
  function (o) { return o.scenarios.F2.freshness !== 'REFRESH_FAILED_WITH_LAST_GOOD'; });

// G3 — Retry becomes a re-render again: the button that looks like it worked (§12.3).
mutant('G3 Retry over a last-good model dispatches nothing', TARGETS.srd,
  '        if (!(_srdEffectiveWorkspace() && _srdReadModel)) { loadAndInit(); return; }',
  '        { loadAndInit(); return; }',
  'srd',
  function (o) { return o.scenarios.F2.staleWarningCount === 0 || o.scenarios.K.whileFailing.warn === 0; });

// G4 — reuse the in-flight forced read forever, i.e. never evict it (§12 "remove failed-Promise eviction").
mutant('G4 the forced-retry latch is never cleared', TARGETS.srd,
  '            if (_srdForcedFlight_ === flight) _srdForcedFlight_ = null;\r\n            _srdRenderError_(err);',
  '            _srdRenderError_(err);',
  'srd',
  function (o) { return o.scenarios.K.requestCount === 0 || o.scenarios.K.freshness !== 'CURRENT'; });

// G5 — allow an older in-flight answer to satisfy a post-invalidation read (§12.5).
mutant('G5 a stale in-flight read may answer an invalidation', TARGETS.srd,
  '        if (_srdEffectiveWorkspace() && _srdInFlight && !_srdMustForce_) return;',
  '        if (_srdEffectiveWorkspace() && _srdInFlight) return;',
  'srd',
  function (o) { return o.scenarios.J.modelGeneration <= 4; });

// G6 — REPLACED, and the reason is recorded rather than hidden. The first G6 removed `force` from the
// POST-WRITE read, and it survived: no scenario here performs a write, so nothing could observe it. An
// inert mutant is worse than no mutant, because it reports a defence that was never tested (the S3-R10
// J5 precedent). The post-write read being forced is instead asserted from source at D3, where it is a
// structural claim; what is MUTATED here is the mechanism that makes forcing mean anything at all.
//
// Remove the AbortSignal and a forced read is no longer forced: the scoped single-flight hands it the
// request already in the air, which is the one carrying the answer the invalidation just discarded.
// Scenario J sees that immediately — the narrow, older world reappears on screen.
mutant('G6 a forced read stops bypassing in-flight sharing', TARGETS.srd,
  "        var readOpts = (force && typeof AbortController === 'function')",
  "        var readOpts = (false && typeof AbortController === 'function')",
  'srd',
  function (o) { return o.scenarios.J.modelGeneration <= 4; });

// G7 — suppress unmount cleanup (§12 "suppress unmount cleanup").
mutant('G7 unmount stops releasing the listener scope', TARGETS.lifecycle,
  '                KM.lifecycle.releaseListenerScope(currentPage);\r\n                console.log(`[Lifecycle] Unmounted: ${currentPage}`);',
  '                console.log(`[Lifecycle] Unmounted: ${currentPage}`);',
  'listeners',
  function (o) { return Object.keys(o.listeners).some(function (k) { return o.listeners[k].tenSwitchDelta.live !== 0; }); });

// G8 — the scope stops remembering, so release has nothing to remove.
mutant('G8 the scope binds but records nothing', TARGETS.lifecycle,
  '                _scopeList(name).push({ target: target, type: type, handler: handler, options: options });',
  '                void 0;',
  'listeners',
  function (o) { return Object.keys(o.listeners).some(function (k) { return o.listeners[k].tenSwitchDelta.live !== 0; }); });

// G9 — Forecast goes back to binding directly, which is the drift itself.
mutant('G9 Forecast binds outside its scope again', TARGETS.forecast,
  "  _fcOwned(document).addEventListener('keydown', (e) => {",
  "  document.addEventListener('keydown', (e) => {",
  'listeners',
  function (o) { return o.listeners['forecast'].tenSwitchDelta.document !== 0; });

// G10 — reintroduce the undefined global read (§12 "reintroduce undefined global read").
mutant('G10 the retired global is read again', TARGETS.forecast,
  '  const summary = _forecastSummaryFromSeries(series);',
  '  const summary = DataRepo.getForecastReviewSummary(collectForecastFilterParams(document.querySelector(\'.page-forecast-review\')));',
  'listeners',
  function (o) { return o.globals.unhandled > 0 || o.globals.errors > 0; });

console.log('\n  mutants: ' + killed + ' killed, ' + survived + ' survived, ' + harnessErrors + ' harness errors');
ok(survived === 0 && harnessErrors === 0, 'G  every planted defect was caught');

/* ==================================================================================================
   H — MANDATE
   ================================================================================================== */
section('H. MANDATE — what this round was told not to do');

const SHELL = ['assets/js/app.js', 'assets/js/core/partial-loader.js'].map(read).join('\n');
ok(!/serviceWorker/.test(SHELL + LIFECYCLE), 'H1  no service worker');
ok(!/prefetch/i.test(SHELL + LIFECYCLE), 'H2  no speculative prefetch');
ok(!/\bTTL\b|ttlMs/.test(LIFECYCLE), 'H3  no TTL in the lifecycle owner');
// §1.3 — the pilot is SKU Regional only. No other page gained a retained page model this round.
const OTHER_WARM = ['assets/js/pages/factory-stock.js', 'assets/js/pages/overseas-stock.js',
  'assets/js/pages/campaign-risk.js'].map(read).join('\n');
ok(!/REFRESH_FAILED_WITH_LAST_GOOD/.test(OTHER_WARM),
  'H4  the retained-model pilot did NOT roll out to the other warm-refetch routes');
// §10 — none of the deferred S4-R1 decisions was implemented.
ok(!/include:\s*\{\s*regional:\s*true\s*\}\s*\)/.test(SRD_JS) &&
   /include: \{ regional: true, pricing: true \}/.test(SRD_JS),
  'H5  SKU_REGIONAL_PRICING_SPLIT = DECLINED — pricing still rides the one read');

console.log('\n' + (failed === 0 ? 'PASS  ' : 'FAIL  ') + passed + ' passed, ' + failed + ' failed');
console.log('LAST_GOOD_MODEL_SURVIVES_REFRESH_FAILURE = YES · WARM_REENTRY_BLOCKS_ON_NETWORK = NO · ' +
  'RETRY_REAL_NEW_REQUEST_COUNT = 1 · STALE_RESPONSE_COMMIT_COUNT = 0 · PERMANENT_LOADING_COUNT = 0 · ' +
  'LISTENER_DRIFT = 0 · TIMER_DRIFT = 0 · UNHANDLED_REJECTION_COUNT_POST = 0');
process.exit(failed === 0 ? 0 : 1);
