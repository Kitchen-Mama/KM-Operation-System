// Kitchen Mama Operation System — R6C system-wide SPA navigation / lifecycle / DB-provider closure — F1-7N-FA-3C-R6C.
// Run: node assets/tests/spa-navigation-lifecycle-db-provider-f1-7n-fa-3c-r6c.test.js
//
// Production-faithful: loads the REAL assets/js/core/lifecycle.js navigation authority against a minimal DOM, drives it
// through a router that mirrors app.js showSection (remove-all-.active → switchTo → async mount re-adds .active guarded),
// and exercises the REAL operation-system-db-api.js provider-eligibility functions + the KM.dbProvider readiness facade.
// It reproduces BOTH live R6C defects — the overlapping-page race and the scoped-cache DB-provider poisoning — and proves
// each is closed.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }
function done() { console.log('\n' + '-'.repeat(40)); console.log('R6C SPA NAV / LIFECYCLE / DB-PROVIDER (F1-7N-FA-3C-R6C): ' + pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1); }
var ROOT = path.join(__dirname, '..');
function extract(src, name) { var s = src.indexOf('function ' + name + '('); if (s < 0) throw new Error('missing ' + name); var i = src.indexOf('{', s), depth = 0; for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (!depth) return src.slice(s, i + 1); } } throw new Error('unbalanced ' + name); }
function slice(src, from, to) { var a = src.indexOf(from); var b = src.indexOf(to, a); if (a < 0 || b < 0) throw new Error('slice not found: ' + from); return src.slice(a, b + to.length); }

// ============================================================ PART A — real lifecycle.js navigation authority
section('A. REAL core/lifecycle.js — latest-navigation-wins + single-visible-section');
function makeSection(id) { var cls = { 'module-section': 1 }; return { id: id, classList: { add: function (c) { cls[c] = 1; }, remove: function (c) { delete cls[c]; }, contains: function (c) { return !!cls[c]; } } }; }
var sections = { 'request-order-section': makeSection('request-order-section'), 'fc-summary-section': makeSection('fc-summary-section'), 'ops-section': makeSection('ops-section') };
global.window = {};
global.KM = { lifecycle: {}, RELEASE: 'r6c-navlifecycle-20260822', dbProvider: { state: function () { return 'READY'; }, generation: function () { return 0; } } };
global.window.KM = global.KM;
global.MutationObserver = undefined;   // Node: the observer guard skips; enforceSingleActiveSection is exercised directly via switchTo
global.document = {
  body: {}, addEventListener: function () {},
  getElementById: function (id) { return sections[id] || null; },
  querySelectorAll: function (sel) {
    var all = Object.keys(sections).map(function (k) { return sections[k]; });
    if (sel === '.module-section') return all;
    if (sel === '.module-section.active') return all.filter(function (s) { return s.classList.contains('active'); });
    return [];
  }
};
eval(fs.readFileSync(path.join(ROOT, 'js', 'core', 'lifecycle.js'), 'utf8').replace(/\r\n/g, '\n'));

// A production-faithful page: mount(epoch) is called synchronously by switchTo; its partial-load `.then` is DEFERRED into
// `pendingMounts` so we can resolve slow/fast partials in a controlled order (exactly the live race). The `.then` bails via
// KM.lifecycle.commitGuard when superseded — the R6C fix each page carries.
var mountCounts = {}, unmountCounts = {}, initCounts = {}, pendingMounts = [];
function registerPage(id) {
  KM.lifecycle.register(id, {
    mount: function (epoch) {
      mountCounts[id] = (mountCounts[id] || 0) + 1;
      pendingMounts.push({ id: id, epoch: epoch, resolve: function () {
        if (!KM.lifecycle.commitGuard(epoch, id)) return;   // superseded navigation → discard this stale mount (no .active, no init)
        sections[id].classList.add('active');
        initCounts[id] = (initCounts[id] || 0) + 1;
      } });
    },
    unmount: function () { unmountCounts[id] = (unmountCounts[id] || 0) + 1; }
  });
}
['request-order-section', 'fc-summary-section', 'ops-section'].forEach(registerPage);
var menuActive = null;
function navigate(id) {   // mirrors app.js showSection: clear all .active, switchTo (mount async), set the active menu
  Object.keys(sections).forEach(function (k) { sections[k].classList.remove('active'); });
  KM.lifecycle.switchTo(id);
  menuActive = id;
}
function resolveMount(id) { for (var i = 0; i < pendingMounts.length; i++) { if (pendingMounts[i] && pendingMounts[i].id === id) { pendingMounts[i].resolve(); pendingMounts[i] = null; return; } } }
function resolveAll() { pendingMounts.forEach(function (m) { if (m) m.resolve(); }); pendingMounts = []; }
function visibleIds() { return document.querySelectorAll('.module-section.active').map(function (s) { return s.id; }); }

// Test 1 — slow Order partial followed by fast FC → only FC appears.
navigate('request-order-section');            // mount(order) queued as .then#order (epoch1)
navigate('fc-summary-section');               // superseded: mount(fc) queued (epoch2)
resolveMount('fc-summary-section');           // fast FC resolves first
resolveMount('request-order-section');        // slow Order resolves LATE → must be discarded
eq(visibleIds(), ['fc-summary-section'], '1/20/21. slow Order then fast FC → only FC visible (stale Order mount discarded, no overlap)');
eq(menuActive, 'fc-summary-section', '8. active menu matches the only visible section');

// Test 2 — slow FC followed by fast Order → only Order appears.
sections['fc-summary-section'].classList.remove('active'); pendingMounts = [];
navigate('fc-summary-section'); navigate('request-order-section');
resolveMount('request-order-section'); resolveMount('fc-summary-section');
eq(visibleIds(), ['request-order-section'], '2. slow FC then fast Order → only Order visible');

// Test 3 — rapid A→B→A → only final A commits.
Object.keys(sections).forEach(function (k) { sections[k].classList.remove('active'); }); pendingMounts = [];
navigate('request-order-section'); navigate('fc-summary-section'); navigate('request-order-section');
resolveAll();
eq(visibleIds(), ['request-order-section'], '3. rapid A→B→A → only the final A commits');

// Test 4 — ten rapid switches → exactly one visible section.
Object.keys(sections).forEach(function (k) { sections[k].classList.remove('active'); }); pendingMounts = [];
var seq = ['request-order-section', 'fc-summary-section', 'ops-section'];
for (var n = 0; n < 10; n++) navigate(seq[n % 3]);
resolveAll();
ok(visibleIds().length === 1, '4. ten rapid switches → exactly ONE visible section');
eq(visibleIds()[0], seq[9 % 3], '4. the single visible section is the final navigation target');

// Test 5/6/7 — an old partial/callback/data response cannot commit after a newer page.
navigate('fc-summary-section'); resolveAll();   // establish a DIFFERENT current page so the next Order nav actually mounts
Object.keys(sections).forEach(function (k) { sections[k].classList.remove('active'); }); pendingMounts = [];
navigate('request-order-section');            // epoch E1 (Order)
var stale = pendingMounts[0];                 // capture Order's pending mount .then
navigate('ops-section'); resolveMount('ops-section');
stale.resolve();                              // the OLD Order mount callback fires late
ok(!sections['request-order-section'].classList.contains('active'), '5/6/7. an old partial/script/data callback cannot mount/append after a newer page');
eq(visibleIds(), ['ops-section'], '5/6/7. only the newer page (ops) is visible');
var disc = KM.lifecycle.__debug().lastDiscarded;
ok(disc && disc.sectionId === 'request-order-section', 'the superseded navigation is recorded as lastDiscarded (observability)');

// Test 9/10 — previous section unmounts once, next mounts once (per transition).
mountCounts = {}; unmountCounts = {}; pendingMounts = [];
KM.lifecycle.switchTo('request-order-section');   // ensure current=order (may early-return if already)
navigate('fc-summary-section');
eq([unmountCounts['request-order-section'] || 0, mountCounts['fc-summary-section'] || 0], [1, 1], '9/10. previous section unmounts exactly once; next mounts exactly once');

// Test 11 — re-click the current section does not duplicate mount/DOM/listeners.
navigate('ops-section'); resolveAll();                 // move OFF fc so the first fc nav actually mounts
mountCounts = {};
navigate('fc-summary-section'); resolveAll();          // first fc nav → mounts once
navigate('fc-summary-section'); navigate('fc-summary-section');   // re-clicks on the current page
eq(mountCounts['fc-summary-section'] || 0, 1, '11. re-click current section → switchTo early-returns (no duplicate mount)');

// enforceSingleActiveSection is idempotent + repairs a stray .active (the belt-and-suspenders invariant the observer drives)
sections['ops-section'].classList.add('active');   // simulate a stray/late .active on a non-current section
KM.lifecycle.enforceSingleActiveSection();
ok(!sections['ops-section'].classList.contains('active') && sections['fc-summary-section'].classList.contains('active'), 'enforceSingleActiveSection strips a stray .active and keeps only the current target');

// ============================================================ PART B — real DB provider eligibility + readiness
section('B. REAL operation-system-db-api.js — scoped-cache poisoning fix + readiness authority');
var DB = fs.readFileSync(path.join(ROOT, 'js', 'api', 'operation-system-db-api.js'), 'utf8').replace(/\r\n/g, '\n');
(function () {
  var OP_DB_API_BASE_URL = 'https://script.google.com/macros/s/TEST/exec';   // a valid configured URL
  var isOperationDbApiConfigured, getOperationDbDataSourceMode;
  eval(extract(DB, 'isOperationDbApiConfigured'));
  eval(extract(DB, 'getOperationDbDataSourceMode'));
  window._opDbCache = null;
  // the REAL isScopedReadEligible + KM.dbProvider facade (assignments, not named fns → slice by source markers)
  window.KM = window.KM || {}; window.KM.DB = window.KM.DB || {};
  eval(slice(DB, 'window.KM.DB.isScopedReadEligible = function()', '};'));
  eval(slice(DB, '(function () {\n    var _providerGen = 0;', '})();'));

  // 13. cold cache → eligible (F1-7M-B2 cold-start preserved).
  window._opDbCache = null;
  ok(window.KM.DB.isScopedReadEligible() === true, '13. cold cache (null) is scoped-read ELIGIBLE');

  // THE R6C FIX — a scoped refresh used to create _opDbCache WITHOUT _sourceMode → coerced to mock → ineligible forever.
  window._opDbCache = {};   // populated-but-unmarked (the poisoned state)
  eq(getOperationDbDataSourceMode(), 'not-loaded', 'R6C: an unmarked populated cache defaults to "not-loaded" (was "mock" — the poisoning)');
  ok(window.KM.DB.isScopedReadEligible() === true, '14. an unmarked populated cache stays ELIGIBLE across navigation (poisoning closed)');

  // an EXPLICIT mock posture (real failure) is still unavailable.
  window._opDbCache = { _sourceMode: 'mock' };
  ok(window.KM.DB.isScopedReadEligible() === false, '16. an EXPLICIT mock posture (real provider failure) is correctly unavailable');
  eq(window.KM.dbProvider.state(), 'ERROR', '16. dbProvider.state()=ERROR on a real mock/failure posture');

  // healthy google-sheet posture.
  window._opDbCache = { _sourceMode: 'google-sheet' };
  eq(window.KM.dbProvider.state(), 'READY', '15/13. dbProvider READY on a google-sheet posture');
  window.KM.dbProvider.whenReady().then(function (r) { ok(r === true, '15. whenReady() resolves true when READY (mount waits, never a false empty)'); });

  // 17. retry recovers without a hard refresh (recompute; no stale rejected promise).
  window._opDbCache = { _sourceMode: 'mock' };
  var before = window.KM.dbProvider.isReady();
  window._opDbCache = { _sourceMode: 'google-sheet' };   // a later scoped read restores eligibility
  window.KM.dbProvider.retry().then(function (r) { ok(before === false && r === true, '17. provider.retry() recovers to READY without a hard refresh (no poisoned promise)'); });
})();

// functional proof: refreshCacheTables now STAMPS _sourceMode='google-sheet' (was the omission that poisoned eligibility)
(function () {
  var window = global.window; window._opDbCache = null;
  var _KM_TABLE_CACHE_KEY_ = { marketplaces: 'marketplaces' };
  function getOperationDbTableFromSheet(n) { return Promise.resolve([{ id: 1 }]); }
  function normalizeOperationDb(raw) { return { marketplaces: (raw && raw.marketplaces) || [] }; }
  var _kmRefreshCacheTables_;
  eval('_kmRefreshCacheTables_ = async ' + extract(DB, '_kmRefreshCacheTables_'));
  _kmRefreshCacheTables_(['marketplaces']).then(function () {
    eq(window._opDbCache._sourceMode, 'google-sheet', 'R6C: refreshCacheTables STAMPS _sourceMode=google-sheet after a live scoped read (no longer leaves the cache unmarked)');
  });
})();

// source guards for the two fix sites + factory sibling
ok(/return window\._opDbCache\._sourceMode \|\| 'not-loaded';/.test(DB), 'B(src): getOperationDbDataSourceMode defaults absent marker to not-loaded (not mock)');
ok((DB.match(/_sourceMode = 'google-sheet'/g) || []).length >= 2, 'B(src): both refreshCacheTables + refreshFactoryStockTables stamp google-sheet');

// ============================================================ PART C — request-order integration (nav safety)
section('C. request-order — mount epoch guard + pending-autosave flush on unmount (Objectives E/G)');
var RO = fs.readFileSync(path.join(ROOT, 'js', 'pages', 'request-order.js'), 'utf8').replace(/\r\n/g, '\n');
ok(/mount\(navEpoch\)/.test(RO) && /commitGuard\(navEpoch, 'request-order-section'\)/.test(RO), 'C: request-order mount discards a superseded navigation via commitGuard (no stale re-activate / no wasteful re-hydration)');
ok(/_roFlushPendingAutosaveOnUnmount_/.test(RO) && /unmount\(\)\s*\{[\s\S]{0,900}_roFlushPendingAutosaveOnUnmount_\(\)/.test(RO), 'C: unmount flushes pending autosave (a route change never silently drops a pending Note write)');

// functional: a pending debounced autosave is FIRED by the unmount flush (not silently dropped).
(function () {
  var _roAutosaveTimers_ = {}, _roAutosavePending_ = {}, _timers = [], fired = { n: 0 };
  function setTimeout2(fn) { _timers.push(fn); return _timers.length; } function clearTimeout2(id) { if (id) _timers[id - 1] = null; }
  var setTimeout = setTimeout2, clearTimeout = clearTimeout2;   // shadow for the extracted fns
  function _roAutosaveKey_(input) { return [input && input.dataset && input.dataset.sku, input && input.dataset && input.dataset.bucket, input && input.dataset && input.dataset.field].join('|'); }
  eval(extract(RO, '_roAutosaveDebounce_'));
  eval(extract(RO, '_roFlushPendingAutosaveOnUnmount_'));
  var input = { dataset: { sku: 'CO1100-R', bucket: 'T2', field: 'note' } };
  _roAutosaveDebounce_(input, function () { fired.n++; }, 600);   // schedule a pending write (not yet fired)
  eq([Object.keys(_roAutosaveTimers_).length, fired.n], [1, 0], 'C: a debounced Note write is pending (not yet fired) before navigation');
  _roFlushPendingAutosaveOnUnmount_();                            // navigate away → flush
  eq([fired.n, Object.keys(_roAutosaveTimers_).length], [1, 0], '23/E: navigation flushes the pending Note write exactly once (never silently dropped, never duplicated)');
})();

// note persistence classifier survives navigation (R6B2 classifier still present + used)
ok(/_roClassifyEditResult_/.test(RO) && /cls\.cleanSaved/.test(RO), 'H: the R6B2 flat-result classifier is preserved (note persistence stays correct after nav/rerender/cached hydration)');
ok(!/request_order_allocation_draft_lines/.test(extract(RO, '_roFlushPendingAutosaveOnUnmount_') + extract(RO, '_roAutosaveDebounce_')), '26. zero Draft-Line dependency in the nav/autosave path');

// ============================================================ PART D — observability (Objective I)
section('D. observability — __kmLifecycleDebug + __roDebug release/provider (read-only, no secrets)');
var dbg = KM.lifecycle.__debug();
['release', 'currentSection', 'navEpoch', 'pendingNav', 'lastCommitted', 'lastDiscarded', 'activeVisibleSectionIds', 'activeVisibleSectionCount', 'dbProviderState', 'mountedSections', 'pendingAutosaveCount', 'lastError'].forEach(function (k) {
  ok(k in dbg, 'I: __kmLifecycleDebug reports ' + k);
});
ok(dbg.release === 'r6c-navlifecycle-20260822', 'I: __kmLifecycleDebug exposes the release signature');
ok(!JSON.stringify(dbg).match(/token|secret|password|AKfyc/i), 'I: __kmLifecycleDebug contains no secrets/tokens');
ok(/release:/.test(RO) && /dbProviderState:/.test(RO), 'I: __roDebug includes release + dbProviderState');
// R6E1A re-bumped the centralized KM.RELEASE to the CUMULATIVE unified release token; namespace.js now carries it.
ok(/RELEASE:\s*'r6f-groupmodel-20260822'/.test(fs.readFileSync(path.join(ROOT, 'js', 'core', 'namespace.js'), 'utf8')), 'D: namespace.js defines the centralized KM.RELEASE signature (R6E1A unified token)');
var INDEX = fs.readFileSync(path.join(ROOT, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
ok(/request-order\.js\?v=r6f-groupmodel-20260822/.test(INDEX), 'D: request-order.js on the unified R6E1A token (R6E1A moved it off the stale r6c token so its R6E Site Confirm fix actually loads)');
// R6E1A (Objective A): the CUMULATIVE changed frontend assets since R6C1 are unified on r6f-groupmodel-20260822
// (namespace, operation-system-db-api, km-api-foundation, inventory-replenishment, request-order, app). lifecycle.js is
// UNCHANGED so it legitimately keeps its R6C token; the runtime release gate reads KM.RELEASE regardless of any one asset token.
ok(/lifecycle\.js\?v=r6c-navlifecycle-20260822/.test(INDEX) && /namespace\.js\?v=r6f-groupmodel-20260822/.test(INDEX) && /operation-system-db-api\.js\?v=r6f-groupmodel-20260822/.test(INDEX), 'D: framework assets carry a release token (R6E1A unified changed set = r6e1a; unchanged lifecycle.js keeps R6C)');

setTimeout(done, 50);   // allow the provider whenReady/retry promises to settle before the summary
