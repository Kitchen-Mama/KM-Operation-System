/**
 * ==================================================================================================
 * S4-R3 — ROUTE-OWNED CODE · HEALTH AND STATUS CADENCE
 * ==================================================================================================
 *
 * Three changes, each measured in a real browser, each with a planted defect that must be caught.
 *
 *   A · The Product Strategy board's 575 KB no longer runs before the menu works. It is fetched when
 *       the route is first opened, once, and the page mounts only after it has arrived.
 *   B · A deployment probe is asked once per app session, keyed by the deployment it describes.
 *   C · A job status nobody started is no longer asked for on every mount.
 *
 * WHAT IS ASSERTED FROM MEASUREMENT: script counts and bytes, fetch and execution counts per URL,
 * mount counts from the lifecycle manager's own debug blob, and request counts by action. All are
 * properties of control flow and are true at any server speed.
 *
 * WHAT IS NOT ASSERTED: milliseconds, and one ordering claim that milliseconds would be needed for.
 * Under --virtual-time-budget a file:// script resolves before the first poll, so "the shell was up
 * before the code landed" is NOT OBSERVABLE here and is not claimed. The question §8 actually asks
 * IS observable and is asserted: at boot the route's code has not run and the menu is complete.
 * ==================================================================================================
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const EV = path.join(ROOT, 'docs', 'evidence', 's4-r3-route-owned-code');

let passed = 0, failed = 0;
function ok(cond, msg, extra) {
  if (cond) { passed++; console.log('  ok   ' + msg); }
  else { failed++; console.log('FAIL  ' + msg); if (extra !== undefined) console.log('        ' + JSON.stringify(extra)); }
}
function eq(a, b, msg) {
  if (JSON.stringify(a) === JSON.stringify(b)) { passed++; console.log('  ok   ' + msg); }
  else { failed++; console.log('FAIL  ' + msg); console.log('        expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); }
}
function section(t) { console.log('\n-- ' + t + ' ' + '-'.repeat(Math.max(0, 94 - t.length)) + '\n'); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

const M = JSON.parse(fs.readFileSync(path.join(EV, 'measurements.json'), 'utf8'));
const RO = require('./_release-order.js');
const APP = read('assets/js/app.js');
const INDEX = read('index.html');
const LOADER = read('assets/js/core/script-loader.js');
const DBAPI = read('assets/js/api/operation-system-db-api.js');
const GAP = read('assets/js/utils/gap-recalc-transport.js');

/* ==================================================================================================
   A — THE BOOT SURFACE
   ================================================================================================== */
section('A. BOOT — what runs before the menu works');

ok(M.boot.post.localScripts < M.boot.pre.localScripts,
  'A1  fewer local scripts execute at boot than before this round', [M.boot.pre.localScripts, M.boot.post.localScripts]);
ok(M.boot.removedBytes > 500 * 1024,
  'A1a and over 500 KB less JavaScript', M.boot.removedKb + ' KB');
eq(M.boot.post.localScripts, (INDEX.match(/<script[^>]+src="(assets\/[^"?]+)/g) || []).length,
  'A1b the recorded count matches index.html as it stands now');

// §8 — the question the boot count exists to answer, asked of the browser.
ok(M.boot.menuItemsAtBoot >= 20, 'A2  MENU_AVAILABLE_BEFORE_ROUTE_SCRIPTS: the menu is complete at boot', M.boot.menuItemsAtBoot);
eq(M.boot.pilotMarkersAtBoot, ['product-strategy=false'],
  'A2a and the route’s own code has NOT run — its global is undefined');
eq(M.boot.pilotLoadedAtBoot, ['product-strategy=false'], 'A2b the loader agrees it has not been loaded');
eq(M.boot.scriptsAppendedDuringBoot, 0, 'A2c and nothing inserted a script before the menu existed');

// The pilot set, and that it is genuinely gone from index.html.
// SEVEN, not eight. psb-views.js stays at boot because the shell's sidebar builds the board's six
// children from PSB_VIEWS before any route is opened; route-loading it left that parent empty.
eq(M.pilot.scriptCount, 7, 'A3  PILOT_SCRIPT_SET is the seven route-only Product Strategy modules');
ok(M.pilot.scripts.every(function (f) { return f.indexOf('psb-views.js') === -1; }),
  'A3z and psb-views.js is NOT among them — the shell depends on it at boot');
M.pilot.scripts.forEach(function (f) {
  ok(INDEX.indexOf(f) === -1, 'A3a index.html no longer loads ' + f.split('/').pop());
  ok(APP.indexOf(f) !== -1, 'A3b and KM_ROUTE_ASSETS_ does');
});
ok(M.pilot.bytes > 500 * 1024, 'A3c PILOT_BYTES_REMOVED_FROM_BOOT', M.pilot.kb + ' KB');

// §12 — moving a tag must not move a file out from under the cache-busting rule.
const routeTokens = RO.parseRouteAssetTokens(APP);
eq(Object.keys(routeTokens).length, M.pilot.scriptCount, 'A4  every route-loaded script carries a cache token');
Object.keys(routeTokens).forEach(function (f) {
  const want = RO.MAP_BROWSER_FILES.indexOf(f) !== -1 ? RO.currentMapToken() : RO.currentAppToken();
  eq(routeTokens[f], want, 'A4a ' + f.split('/').pop() + ' carries its family’s current token');
});
ok(RO.releaseAssetToken('assets/js/product-strategy/psb-views.js', INDEX, APP) === RO.currentAppToken(),
  'A4b and releaseAssetToken finds it, so the rule can still be asked of it');
ok(RO.releaseAssetToken('assets/js/nothing-here.js', INDEX, APP) === null,
  'A4c while a file this release does not ship answers null, which keeps the rule falsifiable');

/* ==================================================================================================
   B — LOAD BEFORE MOUNT
   ================================================================================================== */
section('B. THE ROUTE — loaded once, mounted after, never twice');

const R = M.routes['product-strategy'];
ok(!!R, 'B0  the pilot route was driven');

eq(R.cold.fetched, M.pilot.scriptCount, 'B1  cold entry fetches each script exactly once');
eq(R.cold.executed, M.pilot.scriptCount, 'B1a and executes each exactly once');
ok(R.cold.markerDefined, 'B1b the route’s global now exists');
ok(R.cold.mounted, 'B1c and the page is mounted');
ok(R.cold.useful > 0, 'B1d with content on screen', R.cold.useful);
eq(R.cold.visibleSections, 1, 'B1e exactly one section is visible');
eq(R.cold.mountedSections, 1, 'B1f DUPLICATE_MOUNT_COUNT = 0 — one mounted section');
eq(R.cold.errorBox, 0, 'B1g and no refusal is shown when nothing failed');

// §4 warm re-entry: nothing is fetched or executed again.
eq(R.warm.refetched, 0, 'B2  DUPLICATE_SCRIPT_FETCH_COUNT = 0 on warm re-entry');
eq(R.warm.reexecuted, 0, 'B2a DUPLICATE_SCRIPT_EXECUTION_COUNT = 0');
ok(R.warm.mounted, 'B2b and the page still mounts');
eq(R.warm.visibleSections, 1, 'B2c still one visible section');

// Rapid A -> B -> A, which is where a naive loader inserts the set twice.
eq(R.rapid.refetched, 0, 'B3  a rapid round trip fetches nothing again');
eq(R.rapid.reexecuted, 0, 'B3a and executes nothing again');
eq(R.rapid.mountedSections, 1, 'B3b and leaves one mounted section');
eq(R.rapid.visibleSections, 1, 'B3c and one visible section');

// MOUNT_BEFORE_SCRIPT_READY: the mount is inside the loader's .then, so it cannot precede it.
const routerBlock = APP.slice(APP.indexOf('var routeAssets = KM_ROUTE_ASSETS_[section];'),
  APP.indexOf('_kmUpdateMenuActive_();\r\n        return;'));
ok(routerBlock.indexOf('scriptLoader.ensure') < routerBlock.indexOf('lifecycle.switchTo'),
  'B4  MOUNT_BEFORE_SCRIPT_READY_COUNT = 0 — switchTo is reached only inside the loader’s .then');
ok(/ensure\(section, routeAssets\.scripts\)\.then/.test(routerBlock),
  'B4a and it is the ensure() promise it waits on, not a timer');

// A non-pilot route is untouched.
ok(M.control.mounted && M.control.rows > 0, 'B5  a non-pilot route is unaffected', M.control);
eq(M.control.visibleSections, 1, 'B5a and still shows exactly one section');
eq(M.errors, [], 'B6  GLOBAL_MISSING_SYMBOL_COUNT = 0 — no error or rejection in the whole run');

/* ==================================================================================================
   C — WHEN THE CODE DOES NOT ARRIVE
   ================================================================================================== */
section('C. FAILURE — the shell stays, the refusal is truthful, nothing half-mounts');

const F = M.failure;
ok(F.attempted, 'C0  the failure path was actually driven');
eq(F.blocked, M.pilot.scriptCount, 'C0a every script was refused at the network');
ok(F.shellVisible, 'C1  the route shell is still there');
eq(F.errorBox, 1, 'C1a and carries exactly one refusal');
ok(/could not be loaded/.test(F.errorText), 'C1b which says the page could not be loaded');
ok(/nothing was read/.test(F.errorText), 'C1c and that nothing was read — truthful about the data');
eq(F.api, 0, 'C1d SCRIPT_LOAD_FAILURE_FALSE_EMPTY = 0: no data read was attempted at all');
eq(F.halfMounted, false, 'C2  HALF_MOUNT_COUNT = 0 — the page is not mounted');
eq(F.markerDefined, false, 'C2a and its global does not exist, so nothing can half-run');
eq(F.codeLoaded, false, 'C2b the loader did NOT record a failed set as loaded');
ok(F.otherRouteOk, 'C3  other routes remain usable while this one is broken');
eq(F.retryFetchDelta, 1, 'C4  RETRY_DUPLICATE_LOAD_COUNT = 0 — Retry is exactly one new attempt');
eq(F.stillHalfMounted, false, 'C4a and a failed Retry still does not half-mount');
ok(F.recovered, 'C5  once the network allows it, the route recovers');
eq(F.recoverFetchDelta, 1, 'C5a in one more attempt');
ok(F.recoveredMarker, 'C5b and its code is now present');
// §5 forbids the quiet fallback by name.
ok(!/legacy|fallbackGlobal/i.test(APP.slice(APP.indexOf('function _kmRenderRouteScriptFailure_'),
  APP.indexOf('function kmRetryRouteScripts'))),
  'C6  and there is no silent fall back to a legacy global');

/* ==================================================================================================
   D — SYSTEM.HEALTH CADENCE
   ================================================================================================== */
section('D. system.health — once per app session, keyed by the deployment');

eq(M.health.firstMount, 1, 'D1  the first mount probes the deployment exactly once');
eq(M.health.secondMount, 0, 'D2  SYSTEM_HEALTH_DUPLICATE_REQUESTS = 0 — a re-entry probes zero times');
ok(!!M.health.identityKey, 'D3  SYSTEM_HEALTH_INVALIDATION_KEY is the deployment identity', M.health.identityKey);
ok(/\|/.test(M.health.identityKey) && M.health.identityKey.split('|').length === 4,
  'D3a built from build id, action contract, transport contract and router build');

ok(/_kmDeploymentVerdict_/.test(DBAPI), 'D4  SYSTEM_HEALTH_OWNER holds one verdict per session');
ok(/invalidateDeploymentContract/.test(DBAPI), 'D4a with an explicit invalidation seam');
// §6 forbids a clock by name, and the failure/mismatch cases must stay retryable.
const healthFn = DBAPI.slice(DBAPI.indexOf('window.KM.DB.checkDeploymentContract = async function'),
  DBAPI.indexOf('window.KM.DB.probeDeploymentContract_ = async function'));
ok(!/setTimeout|Date\.now|ttl|maxAge|expires/i.test(healthFn), 'D5  SYSTEM_HEALTH_TTL = NONE — nothing expires on a clock');
ok(/verdict\.ok === true/.test(healthFn),
  'D6  only a SUCCESSFUL verdict is retained — a failure stays retryable and a mismatch can be re-checked');

/* ==================================================================================================
   E — GAP JOB STATUS CADENCE
   ================================================================================================== */
section('E. gapJob.status.get — asked when a job might be running, and not otherwise');

eq(M.gap.unrelated, 0, 'E1  an unrelated route reads the job status zero times');
eq(M.gap.siteInventory, 0, 'E2  Site Inventory with no known job: zero reads');
eq(M.gap.orderPlanning, 0, 'E2a Order Planning with no known job: zero reads');
eq(M.gap.withKnownActiveJob, 1, 'E3  and with a job that MAY be running: exactly one read');
ok(M.gap.markerSetOk, 'E3a (the marker was written the way a real start writes it)');
ok(M.gap.markerClearedAfterRead, 'E4  the marker is cleared once the backend has been heard from');

// The owner, and that recovery was not quietly removed.
ok(/function markJobMayBeActive/.test(GAP) && /function mayHaveActiveJob/.test(GAP),
  'E5  GAP_STATUS_OWNER is gap-recalc-transport.js — one owner for start, resume and the marker');
ok(/markJobMayBeActive\(opts\.product, runId\)/.test(GAP), 'E5a a successful START declares the job live');
ok((GAP.match(/clearJobLiveness\(opts\.product\)/g) || []).length >= 3,
  'E5b and every terminal outcome clears it');
ok(/opts\.product && !opts\.force && !mayHaveActiveJob\(opts\.product\)/.test(GAP),
  'E6  the gate needs a product AND no force AND no known job — an explicit refresh always asks');
ok(/localStorage/.test(GAP),
  'E7  the marker outlives a reload and is visible to another tab, which is what recovery needs');
// §7 forbids a polling interval that no existing contract authorizes.
const resumeFn = GAP.slice(GAP.indexOf('function resumeIfRunning'), GAP.indexOf('function resumeIfRunning') + 2600);
ok(!/setInterval/.test(resumeFn), 'E8  and no polling interval was introduced');

/* ==================================================================================================
   F — MANDATE
   ================================================================================================== */
section('F. MANDATE — what §10 said not to touch');

const SHELL = APP + LOADER + read('assets/js/core/lifecycle.js') + read('assets/js/core/partial-loader.js');
ok(!/serviceWorker/.test(SHELL), 'F1  no service worker');
ok(!/\bTTL\b|ttlMs|maxAge/.test(SHELL), 'F2  no TTL cache');
ok(!/prefetch/i.test(SHELL), 'F3  no speculative prefetch');
ok(!/webpack|rollup|esbuild|import\(/.test(SHELL), 'F4  no bundler and no dynamic import() framework');
// §10 — the deferred S4-R1 decisions stay deferred.
const SRD = read('assets/js/pages/sku-regional-details.js');
ok(/include: \{ regional: true, pricing: true \}/.test(SRD), 'F5  SKU_REGIONAL_PRICING_SPLIT = DECLINED, still one read');
const CR = read('assets/js/pages/campaign-risk.js');
ok(!/KM_ROUTE_ASSETS_|scriptLoader/.test(CR), 'F6  Promotion Risk Tracker was not touched');
// S4-R2's seals must still hold structurally (their own suite proves them at runtime).
ok(/KM\.lifecycle\.listenerScope/.test(read('assets/js/core/lifecycle.js')), 'F7  the R2 listener scope is intact');
ok(/REFRESH_FAILED_WITH_LAST_GOOD/.test(SRD), 'F7a and the R2 warm-re-entry contract is intact');

/* ==================================================================================================
   G — MUTATION
   ================================================================================================== */
section('G. MUTATION — each change, broken on purpose');

const RUN = require('./_s4r3-code-split-runner.js');
const T = {
  app: 'assets/js/app.js',
  loader: 'assets/js/core/script-loader.js',
  dbapi: 'assets/js/api/operation-system-db-api.js',
  gap: 'assets/js/utils/gap-recalc-transport.js',
  index: 'index.html'
};

// `from` may be a single anchor or a LIST of [from, to] pairs. The list form exists because a
// defence held at two levels has to be removed at both to be observable at all — see G3.
function swap(file, from, to) {
  const p = path.join(ROOT, file);
  const src = fs.readFileSync(p, 'utf8');
  const edits = Array.isArray(from) ? from : [[from, to]];
  let next = src;
  for (const [f, t] of edits) {
    if (next.indexOf(f) < 0) return { harness: 'ANCHOR NOT FOUND in ' + file + ': ' + f.slice(0, 80) };
    if (next.indexOf(f) !== next.lastIndexOf(f)) return { harness: 'ANCHOR AMBIGUOUS in ' + file + ': ' + f.slice(0, 80) };
    next = next.replace(f, t);
  }
  fs.writeFileSync(p, next, 'utf8');
  return { restore: function () { fs.writeFileSync(p, src, 'utf8'); } };
}

let killed = 0, survived = 0, harnessErrors = 0;
function mutant(name, file, from, to, mode, detects) {
  const m = swap(file, from, to);
  if (m.harness) { harnessErrors++; failed++; console.log('HARNESS ERROR  ' + name + ' — ' + m.harness); return; }
  let out = null, threw = null;
  try { out = (mode === 'static') ? null : RUN.run(400, mode); } catch (e) { threw = e; }
  let statik = null;
  try { if (mode === 'static') statik = RUN.bootSurface(); } catch (e) { threw = threw || e; }
  m.restore();
  if (threw) { harnessErrors++; failed++; console.log('HARNESS ERROR  ' + name + ' — ' + threw.message); return; }
  let caught = false, why = '';
  try { caught = !!detects(out, statik); } catch (e) { caught = false; why = ' (probe threw: ' + e.message + ')'; }
  if (caught) { killed++; passed++; console.log('  ok   ' + name + ' KILLED'); }
  else { survived++; failed++; console.log('FAIL  ' + name + ' SURVIVED' + why); }
}

// G1 — put a pilot script back on the boot list (§11 "restore pilot script to boot list").
mutant('G1 a pilot script is restored to the boot list', T.index,
  '    <script src="assets/js/core/script-loader.js?v=' + RO.currentAppToken() + '" defer></script>',
  '    <script src="assets/js/core/script-loader.js?v=' + RO.currentAppToken() + '" defer></script>\r\n' +
  '    <script src="assets/js/product-strategy/psb-views.js?v=' + RO.currentAppToken() + '" defer></script>',
  'static',
  function (_o, boot) { return boot.localCount !== M.boot.post.localScripts; });

// G2 — mount before the script is ready (§11 "mount before script ready").
mutant('G2 the router mounts without waiting for the code', T.app,
  '        window.KM.scriptLoader.ensure(section, routeAssets.scripts).then(function (ok) {\r\n' +
  '            if (myNav !== _kmRouteNavSeq_) return;           // a newer navigation owns the screen\r\n' +
  '            if (window.KM.lifecycle && window.KM.lifecycle.switchTo) {\r\n' +
  '                window.KM.lifecycle.switchTo(routeAssets.sectionId);\r\n' +
  '            }',
  '        if (window.KM.lifecycle && window.KM.lifecycle.switchTo) {\r\n' +
  '            window.KM.lifecycle.switchTo(routeAssets.sectionId);\r\n' +
  '        }\r\n' +
  '        window.KM.scriptLoader.ensure(section, routeAssets.scripts).then(function (ok) {\r\n' +
  '            if (myNav !== _kmRouteNavSeq_) return;',
  'all',
  function (o) { var r = o.routes['product-strategy']; return !r || !r.cold.mounted || r.cold.useful === 0; });

// G3 — REPLACED, and the reason is worth recording because it is a fact about the loader rather
// than about the test. The original removed the SET-key latch in ensure(), and nothing changed: the
// per-URL latch in load() catches every member one level down, so the set is still inserted once.
// That is the same shape S3-R13's J1 had, and the same answer applies — an inert mutant reports a
// defence that was never tested, so it is replaced rather than banked. The set key earns its place
// by recording ALL-OK (which G4 breaks); de-duplication is the per-URL latch's job, and THAT is what
// is broken here. Remove it and a return trip re-inserts and re-runs 575 KB of module code.
mutant('G3 the loader stops de-duplicating', T.loader,
  [['        if (_loaded[url]) return Promise.resolve(true);',
    '        if (false) return Promise.resolve(true);'],
   ['        if (_loaded[key]) return Promise.resolve(true);',
    '        if (false) return Promise.resolve(true);']],
  null,
  'all',
  function (o) { var r = o.routes['product-strategy']; return !r || r.warm.refetched !== 0 || r.rapid.refetched !== 0; });

// G4 — a failed set is remembered as loaded, which is the permanently-broken-route bug.
mutant('G4 a partially loaded set is recorded as loaded', T.loader,
  '                if (allOk) _loaded[key] = true;',
  '                _loaded[key] = true;',
  'failure',
  function (o) { return o.failure.codeLoaded !== false || o.failure.recovered !== true ? true : false; });

// G5 — suppress the script-load refusal (§11 "suppress script-load refusal").
mutant('G5 a failed route shows nothing at all', T.app,
  '                _kmRenderRouteScriptFailure_(section);',
  '                void section;',
  'failure',
  function (o) { return o.failure.errorBox === 0; });

// G6 — REPLACED, and the reason is recorded rather than hidden. The first G6 dropped the `&& key`
// guard so a verdict could be held with no identity. In a world where the probe always answers, a
// key is always produced and the mutant changed nothing observable — inert, which reports a defence
// that was never tested (the S3-R10 J5 precedent). §6's promise is that the held value is keyed BY
// THE DEPLOYMENT, so that is what is broken here: a constant key describes every deployment equally,
// which is exactly the stale-across-publish bug identity keying exists to prevent.
mutant('G6 the held verdict is keyed by a constant, not the deployment', T.dbapi,
  "        var key = id ? [id.build_id, id.deployed_action_contract_version,",
  "        var key = id ? ['CONSTANT', id.deployed_action_contract_version,",
  'all',
  function (o) { return !o.health.identityKey || o.health.identityKey.indexOf('CONSTANT') === 0; });

// G9 — the session share itself. Without it every mount probes the deployment again, which is the
// measured behaviour this round replaced.
mutant('G9 the deployment verdict is not held across mounts', T.dbapi,
  '    if (_kmDeploymentVerdict_) return _kmDeploymentVerdict_;',
  '    if (false) return _kmDeploymentVerdict_;',
  'all',
  function (o) { return o.health.secondMount !== 0; });

// G7 — make gap status unconditional again (§11 "make gap status unconditional").
mutant('G7 the job status is asked for on every mount again', T.gap,
  '    if (opts.product && !opts.force && !mayHaveActiveJob(opts.product)) {',
  '    if (false) {',
  'all',
  function (o) { return o.gap.siteInventory !== 0 || o.gap.orderPlanning !== 0; });

// G8 — the inverse, and the one that matters more: never ask, so recovery is silently dropped.
mutant('G8 a job that IS running is never picked up', T.gap,
  '    if (opts.product && !opts.force && !mayHaveActiveJob(opts.product)) {',
  '    if (opts.product && !opts.force) {',
  'all',
  function (o) { return o.gap.withKnownActiveJob !== 1; });

console.log('\n  mutants: ' + killed + ' killed, ' + survived + ' survived, ' + harnessErrors + ' harness errors');
ok(survived === 0 && harnessErrors === 0, 'G  every planted defect was caught');

console.log('\n' + (failed === 0 ? 'PASS  ' : 'FAIL  ') + passed + ' passed, ' + failed + ' failed');
console.log('BOOT ' + M.boot.pre.localScripts + ' scripts / ' + M.boot.pre.mb + ' MB → ' +
  M.boot.post.localScripts + ' / ' + M.boot.post.mb + ' MB (−' + M.boot.removedKb + ' KB) · ' +
  'DUPLICATE_SCRIPT_FETCH = 0 · MOUNT_BEFORE_SCRIPT_READY = 0 · HALF_MOUNT = 0 · ' +
  'SYSTEM_HEALTH_REENTRY 1→0 · GAP_STATUS_UNRELATED = 0 · GAP_STATUS_ACTIVE_JOB = 1');
process.exit(failed === 0 ? 0 : 1);
