/**
 * ==================================================================================================
 * S4-R5 — LARGE ROUTE PAYLOAD REMOVAL: Inventory Replenishment + the On-the-Way map
 * ==================================================================================================
 *
 *   A · BOOT. 1.58 MB less JavaScript, and the menu is complete without either page's code.
 *   B · OWNERSHIP. The one symbol that made Site Inventory non-route-only, and where it went.
 *   C · THE ROUTES. Cold fetches each script once and executes it once; warm and rapid fetch nothing.
 *   D · FAILURE. Shell up, refusal truthful and scoped, nothing read, Retry is one load, and the
 *       refusal GOES AWAY when the code finally arrives — which is the defect this round found.
 *   E · CROSS-ROUTE. Weekly Shipping Plan, opened without ever visiting Site Inventory.
 *   F · TOKENS. Three families, none collapsed into another.
 *   G · LIFECYCLE. Drift, leaks and missing globals across repeated entries.
 *   H · MUTATION.
 *
 * WHAT IS NOT ASSERTED HERE: map fidelity, and the omission is deliberate. Markers, transport-mode
 * icons, tooltips and multi-leg behaviour are not answerable against a WebGL globe in headless
 * Chrome. They are owned by the map suites that load those sources into a vm — and this round changed
 * NOT ONE BYTE of any map file, which is asserted below instead of the thing that cannot be measured.
 * ==================================================================================================
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const EV = path.join(ROOT, 'docs', 'evidence', 's4-r5-route-payloads');

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
const RUN = require('./_s4r5-route-payload-runner.js');
const INDEX = read('index.html');
const APP = read('assets/js/app.js');
const IR = read('assets/js/pages/inventory-replenishment.js');
const SP = read('assets/js/pages/shipping-plan.js');

const MAP_FILES = M.map.files.map(f => f.file);
const TARGET_KEYS = ['ops', 'global-logistics-map'];

/* ==================================================================================================
   A — BOOT
   ================================================================================================== */
section('A. BOOT — what no longer runs before the menu works');

ok(M.boot.post.bytes < M.boot.pre.bytes, 'A1  less JavaScript at boot than before this round',
  [M.boot.pre.bytes, M.boot.post.bytes]);
ok(M.boot.removedBytes > 1500 * 1024, 'A1a over 1.5 MB removed', M.boot.removedKb + ' KB');
ok(M.boot.post.localScripts < M.boot.pre.localScripts, 'A1b and fewer script tags',
  [M.boot.pre.localScripts, M.boot.post.localScripts]);
/* Re-derived from the tree, not read back: a census nobody recomputes drifts the first time someone
   adds a script and forgets the document. */
const live = RUN.bootSurface();
eq(live.localCount, M.boot.post.localScripts, 'A1c the recorded count matches index.html as it stands');
/* S4-R6 — THIS WAS `eq(live.bytes, M.boot.post.bytes)`, AND IT FAILED THE FIRST TIME ANYBODY FIXED A BUG.

   The intent was right: a recorded census nobody recomputes drifts the moment someone adds a script and
   forgets the document. But an EXACT byte total is not that claim — it also asserts that no file at boot
   may ever change size again, for any reason. S4-R6 repaired five page modules and grew the total by
   15 121 bytes, which broke this rule while leaving S4-R5's achievement completely intact.

   So the byte claim became the removal itself — the total is still more than 1.5 MB below where this
   round found it — on the reasoning that "a script that crept back would change the set and blow the
   ceiling; a bug fix changes neither".

   S7-R2B1 — THAT PROMISE WAS FALSE BY 58 BYTES, AND THE SET GUARD WAS NEVER RUNNING.

   An aggregate floor measured against a historical total is a budget, not an invariant: it shrinks every
   time anyone maintains an approved boot owner, and it runs out at an arbitrary moment nobody chose. By
   S7-R2B the headroom was 58 bytes, and a two-line repair to a BLOCKING defect in the shared Document
   Panel — a boot-loaded file — could not land. The floor had stopped defending the architecture and was
   defending its own arithmetic.

   And the set comparison below never executed. It read `M.boot.post.local ? <set> : <count>`, and S4-R5
   never recorded post.local — so the live gate was `localCount === 67`. Swapping one boot script for
   another passed it. Adding one and removing one passed it. The guard everybody cited was a tally.

   SO THE GATE IS RE-ENCODED AROUND TOPOLOGY (_boot-topology.js), and on the structural side it is now
   STRICTLY STRONGER than what it replaces: the SET is pinned by name, the ORDER is pinned (the old
   comparison sorted both sides and could not see a reordering), and route-at-boot is checked against the
   WHOLE route registry rather than the nine files this round happened to move. What it stops doing is
   failing a bug fix because an approved owner grew by a few hundred bytes. The payload is still measured
   and printed on every run; budgeting it is S8_BOOT_PAYLOAD_HEADROOM_AND_LOADING_ARCHITECTURE. */
const BT = require('./_boot-topology.js');
const topo = BT.bootTopology(live.local, live.routeAssets);
eq(topo.undeclared, [],
  'A1d  UNDECLARED_BOOT_SCRIPT_COUNT = 0 — every script index.html loads is in the declared census');
eq(topo.missing, [],
  'A1d1 and no declared boot script has silently stopped loading');
eq(topo.setChangeCount, 0,
  'A1d2 BOOT_SCRIPT_SET_UNEXPECTED_CHANGE_COUNT = 0 — a swap is visible now, which it was not before');
eq(topo.orderDriftCount, 0,
  'A1d3 BOOT_ORDER_DRIFT_COUNT = 0 — and they still load in the declared order');
eq(topo.routeAtBoot, [],
  'A1d4 NEW_ROUTE_SCRIPT_AT_BOOT_COUNT = 0 — no file app.js owns as a ROUTE asset is loaded at boot, '
  + 'checked across the whole registry rather than against nine remembered names');
ok(live.bytes < M.boot.pre.bytes,
  'A1d5 and boot is still smaller than before this round deferred the two payloads. BOOT PAYLOAD IS '
  + 'REPORTED, NOT GATED — S8 owns the budget',
  { pre: M.boot.pre.bytes, now: live.bytes, removed: M.boot.pre.bytes - live.bytes });
ok(M.boot.percentReducedFromS4R1 > 30,
  'A1e PERCENT_BOOT_BYTES_REDUCED_FROM_S4_R1_BASELINE', M.boot.percentReducedFromS4R1 + '%');

/* §10 — the shell does not wait for either payload. */
eq(M.boot.atBoot.scriptsAppended, 0, 'A2  no route script has been appended at boot');
ok(M.boot.atBoot.menuItems >= 30, 'A2a MENU_AVAILABLE_WITH_IR_AND_MAP_UNLOADED', M.boot.atBoot.menuItems);
eq(M.boot.atBoot.markers, ['ops=false', 'global-logistics-map=false'],
  'A2b and neither page\'s code has run');
eq(M.boot.atBoot.routeLoaded, ['ops=false', 'global-logistics-map=false'],
  'A2c which the loader agrees with');
eq(M.boot.atBoot.errors, [], 'A2d and nothing threw getting there');

/* The two payloads are genuinely gone from index.html and genuinely declared by the router. */
ok(INDEX.indexOf('pages/inventory-replenishment.js') === -1,
  'A3  index.html no longer loads inventory-replenishment.js');
ok(APP.indexOf('pages/inventory-replenishment.js') !== -1, 'A3a and KM_ROUTE_ASSETS_ does');
MAP_FILES.forEach(function (f) {
  const base = f.split('/').pop();
  ok(INDEX.indexOf(f) === -1, 'A3b index.html no longer loads ' + base);
  ok(APP.indexOf(f) !== -1, 'A3c and KM_ROUTE_ASSETS_ does — ' + base);
});
eq(MAP_FILES.length, 8, 'A3d MAP_FAMILY_FILES is the eight-file family');

/* ==================================================================================================
   B — OWNERSHIP
   ================================================================================================== */
section('B. OWNERSHIP — the one symbol that had to move, and the ones that did not');

ok(IR.indexOf('const replenishmentMockData = [') === -1,
  'B1  inventory-replenishment.js no longer declares replenishmentMockData');
const MOCK = read('assets/js/data/replenishment-mock-data.js');
ok(/const replenishmentMockData = \[/.test(MOCK), 'B1a the shared data file does');
/* VERBATIM, and that is checkable: the seven SKUs are still the seven SKUs. */
['CO1100-R', 'CO1100-S', 'CO1150-R', 'CO1150-AG', 'SP3120-R', 'SP3410-R', 'MO5600-R'].forEach(function (sku) {
  ok(MOCK.indexOf('"' + sku + '"') !== -1, 'B1b ' + sku + ' survived the move');
});
ok(INDEX.indexOf('assets/js/data/replenishment-mock-data.js') !== -1,
  'B1c and it loads at BOOT, where Weekly Shipping Plan can still see it');
ok(/replenishmentMockData/.test(SP), 'B1d which is what shipping-plan.js needs — it reads it unguarded');

/* The dismissed false positives, recorded so the next round does not re-litigate them. */
function decomment(s) { return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1 '); }
const ARB = decomment(read('assets/js/core/boot-read-arbiter.js'));
const MREG = decomment(read('assets/js/core/method-registry.js'));
ok(!/_irBootstrapScope_|_irResumeGapJobOnMount_/.test(ARB),
  'B2  the boot read arbiter names no IR symbol in CODE (its hits were all comments)');
ok(!/_execLastMileOptionsHtml|_irCarrierModel|_irCarrierStatus/.test(MREG),
  'B2a nor does the method registry');
ok(!/replenishmentMockData|renderReplenishment|IRContext/.test(decomment(read('assets/js/utils/inventory-compat.js'))),
  'B2b nor inventory-compat.js');

/* The DOMContentLoaded handler this move drops on the floor was already doing nothing. */
ok(INDEX.indexOf('id="ops-section"') === -1,
  'B3  #ops-section is not in index.html, so the boot DOMContentLoaded init returned at once');
ok(/if \(!document\.getElementById\('ops-section'\)\) return;/.test(IR),
  'B3a which is exactly what _inventoryReplenStaticInit does when it is absent');
ok(/_inventoryReplenStaticInit\(\);/.test(IR), 'B3b and the mount calls it itself');

/* ==================================================================================================
   C — THE ROUTES
   ================================================================================================== */
section('C. ROUTES — fetched once, executed once, mounted once');

TARGET_KEYS.forEach(function (k, i) {
  const r = (k === 'ops') ? M.inventoryReplenishment.route : M.map.route;
  const at = 'C' + (i + 1);
  ok(!!r, at + '  the ' + k + ' route was driven');
  if (!r) return;
  eq(r.cold.fetched, r.declared, at + 'a cold entry fetches each declared script exactly once');
  eq(r.cold.executed, r.declared, at + 'b and executes each exactly once');
  eq(r.cold.dupFetch, 0, at + 'c DUPLICATE_SCRIPT_FETCH_COUNT = 0');
  eq(r.cold.dupExec, 0, at + 'd DUPLICATE_SCRIPT_EXECUTION_COUNT = 0');
  ok(r.cold.marker, at + 'e the route\'s own code is present after the load');
  ok(r.cold.active, at + 'f and the section is showing');
  eq(r.cold.mountedSections, 1, at + 'g exactly one mounted section');
  eq(r.onLeave.openRequests, 0, at + 'h nothing left open on leave');
  eq(r.onLeave.stillActive, false, at + 'i and the section is no longer showing');
  eq(r.warmDelta, { fetched: 0, executed: 0 }, at + 'j WARM re-entry fetches and executes NOTHING');
  eq(r.rapidDelta.fetched, 0, at + 'k a rapid A->B->A fetches nothing');
  eq(r.rapidDelta.executed, 0, at + 'l and executes nothing');
  eq(r.rapidDelta.mountGrowth, 0, at + 'm DUPLICATE_MOUNT_COUNT = 0');
  eq(r.rapid.visibleSections, 1, at + 'n with one visible section throughout');
});
eq(M.inventoryReplenishment.route.declared, 1, 'C3  Site Inventory is one script');
eq(M.map.route.declared, 8, 'C3a the map family is eight');
ok(M.control && M.control.active, 'C4  a route this round did not touch still opens', M.control);

/* ==================================================================================================
   D — FAILURE
   ================================================================================================== */
section('D. FAILURE — scoped, truthful, reads nothing, and clears when it recovers');

TARGET_KEYS.forEach(function (k, i) {
  const f = (k === 'ops') ? M.inventoryReplenishment.failure : M.map.failure;
  const at = 'D' + (i + 1);
  ok(!!f, at + '  the ' + k + ' failure path was driven');
  if (!f) return;
  ok(f.onFailure.active, at + 'a the shell is still visible');
  eq(f.onFailure.errorBox, 1, at + 'b the refusal is on screen, exactly once');
  eq(f.onFailure.marker, false, at + 'c and the route\'s code did NOT run');
  eq(f.executedDelta, 0, at + 'd SCRIPT executions during the failure = 0');
  eq(f.apiDuringFailure, 0, at + 'e NO DATA WAS READ before the code owner was ready');
  eq(f.halfMounted, false, at + 'f HALF_MOUNT_COUNT = 0');
  ok(f.controlStillWorks, at + 'g every other route is still usable');
  ok(/could not be loaded/.test(f.bodyText), at + 'h the refusal says so in words', f.bodyText.slice(0, 80));
  ok(!/no data|empty|No rows/i.test(f.bodyText), at + 'i and does not call it empty');
  /* §4 — Retry is exactly one new load PER DECLARED SCRIPT, not a storm and not zero. */
  eq(f.retryFetchDelta, (k === 'ops') ? 1 : 8, at + 'j Retry = exactly one new load per declared script');
  ok(f.retryMarker, at + 'k and the code is present afterwards');
  eq(f.onRetry.errorBox, 0, at + 'l THE REFUSAL IS GONE once the code arrives');
  ok(f.recovered, at + 'm RECOVERED');
});

/* The repair this round found, asserted at the source so it cannot quietly regress. */
ok(/_kmClearRouteScriptFailure_/.test(APP), 'D3  the router has a way to remove a refusal');
ok(/if \(ok\) \{ _kmClearRouteScriptFailure_\(section\); return; \}/.test(APP),
  'D3a and calls it on the success branch — a page that has loaded must not still say it is loading');

/* ==================================================================================================
   E — CROSS-ROUTE
   ================================================================================================== */
section('E. CROSS-ROUTE — Weekly Shipping Plan without ever opening Site Inventory');

const X = M.crossRoute;
eq(X.siteInventoryEverLoaded, false, 'E1  Site Inventory was never loaded in that run');
eq(X.replenishmentMockDataTypeof, 'object', 'E1a and replenishmentMockData still resolves');
ok(X.routes.shippingplan.active, 'E2  Weekly Shipping Plan opens');
ok(X.routes['shipment-overview'].active, 'E2a as does Shipment Overview');
eq(X.newWindowErrors, 0, 'E3  GLOBAL_MISSING_SYMBOL_COUNT = 0 — nothing threw');
eq(X.newUndefinedGlobals, [], 'E3a and no identifier was reported undefined');
eq(X.unhandled, 0, 'E3b with no unhandled rejection');

/* ==================================================================================================
   F — TOKENS
   ================================================================================================== */
section('F. TOKENS — three families, none collapsed');

/* S4-R6 — THIS ASSERTED A LITERAL AND THEREFORE ASSERTED THAT NO LATER ROUND MAY ROTATE.
   currentAppToken() is the LAST entry in the series, so `=== 's4r5-...'` held for exactly as long as
   S4-R5 was the most recent round and then began failing for the one reason it should not: the next
   round doing its job. The claim worth keeping is that THIS round's token is a real member of the
   application series and that the series has only ever grown past it — never been rewritten under it,
   which is what would silently re-serve these bytes to a browser that already has them. */
const R5_TOKEN = 's4r5-routepayload-20260927';
ok(RO.ROUND_TOKENS.indexOf(R5_TOKEN) !== -1, 'F1  this round\u0027s token is in the application series');
ok(RO.ROUND_TOKENS.indexOf(R5_TOKEN) === RO.ROUND_TOKENS.lastIndexOf(R5_TOKEN),
  'F1a and it appears exactly once');
ok(RO.ROUND_TOKENS.indexOf(RO.currentAppToken()) >= RO.ROUND_TOKENS.indexOf(R5_TOKEN),
  'F1b and the current token is this one or a later one');
eq(RO.staleAppTokenRefs(INDEX), [], 'F2  STALE_APPLICATION_TOKEN_REFS = 0 in index.html');
eq(RO.staleRouteAssetTokenRefs(APP), [], 'F2a and 0 among the route-owned assets');
eq(RO.misplacedReleaseTokens(INDEX, APP), [], 'F3  MISPLACED_TOKEN_FAMILY_REFS = 0 across the release');
const routeToks = RO.parseRouteAssetTokens(APP);
MAP_FILES.forEach(function (f) {
  const base = f.split('/').pop();
  ok(!!routeToks[f], 'F4 ' + base + ' is cache-versioned by the router');
});
/* The map family did NOT rotate, and that is the correct behaviour rather than an oversight: not one
   map byte moved, and rotating a file whose bytes stand still makes every browser refetch for nothing. */
eq(routeToks['assets/js/lib/km-globe.js'], 'map-transporticons-r10-20260926',
  'F5  km-globe.js keeps the map token it already had');
eq(routeToks['assets/js/data/world-countries-110m.js'], 'country-boundary-20260826',
  'F5a and world-countries-110m.js keeps its own family');
eq(routeToks['assets/js/pages/inventory-replenishment.js'], RO.currentAppToken(),
  'F5b while inventory-replenishment.js, which DID change, is on the current application token');
ok(RO.releaseLoadOrder(INDEX, APP).indexOf('assets/js/data/replenishment-mock-data.js') !== -1,
  'F6  the extracted data file is part of the release');

/* ==================================================================================================
   G — LIFECYCLE
   ================================================================================================== */
section('G. LIFECYCLE — drift, leaks and missing globals');

TARGET_KEYS.forEach(function (k, i) {
  const L = M.lifecycle[k];
  const at = 'G' + (i + 1);
  ok(!!L, at + '  ' + k + ' lifecycle was driven');
  if (!L) return;
  eq(L.listenerDrift, 0, at + 'a LISTENER_DRIFT = 0 across repeated entries');
  eq(L.openRequests, 0, at + 'b OPEN_REQUEST_LEAK_COUNT = 0');
  eq(L.mountedSections, 1, at + 'c one mounted section');
  eq(L.visibleSections, 1, at + 'd one visible section');
  eq(L.undefinedGlobals, [], at + 'e GLOBAL_MISSING_SYMBOL_COUNT = 0');
  eq(L.unhandled, 0, at + 'f no unhandled rejection');
  eq(L.windowErrors, 0, at + 'g no window error');
});

/* §8B, refused rather than faked. */
ok(/NOT SUPPORTED BY THE APP/.test(M.directRoute['B hard reload while the target route is selected']),
  'G3  the hard-reload case is recorded as not supported rather than as measured');
ok(!/location\.hash|hashchange/.test(APP), 'G3a and app.js has no hash route to reload into');

/* Map fidelity: asserted as the thing that IS true, rather than as the thing that cannot be measured. */
section('G2. MAP FIDELITY — by the only evidence that exists');
const changed = cp.spawnSync('git', ['diff', '--name-only', 'HEAD', '--'].concat(MAP_FILES),
  { cwd: ROOT, encoding: 'utf8' });
if (changed.status === 0) {
  eq(String(changed.stdout || '').trim(), '',
    'G4  not one byte of any map file changed this round — which is why icons, tooltips and multi-leg behaviour cannot have');
} else {
  console.log('   (git unavailable — G4 skipped)');
}
ok(/WHAT THIS RUNNER DOES NOT CLAIM: map FIDELITY/.test(read('assets/tests/_s4r5-route-payload-runner.js')),
  'G4a and the runner says so rather than implying otherwise');

/* ==================================================================================================
   H — MUTATION
   ================================================================================================== */
section('H. MUTATION — each defence broken on purpose');

const T = { app: 'assets/js/app.js', index: 'index.html', loader: 'assets/js/core/script-loader.js' };

function swap(file, from, to) {
  const p = path.join(ROOT, file);
  const src = fs.readFileSync(p, 'utf8');
  const edits = Array.isArray(from) ? from : [[from, to]];
  let next = src;
  for (const [f, t] of edits) {
    if (next.indexOf(f) < 0) return { harness: 'ANCHOR NOT FOUND in ' + file + ': ' + String(f).slice(0, 90) };
    if (next.indexOf(f) !== next.lastIndexOf(f)) return { harness: 'ANCHOR AMBIGUOUS in ' + file + ': ' + String(f).slice(0, 90) };
    next = next.replace(f, function () { return t; });
  }
  fs.writeFileSync(p, next, 'utf8');
  return { restore: function () { fs.writeFileSync(p, src, 'utf8'); } };
}

let killed = 0, survived = 0, harnessErrors = 0;
function mutant(name, file, from, to, mode, detects, whileMutated) {
  const m = swap(file, from, to);
  if (m.harness) { harnessErrors++; failed++; console.log('HARNESS ERROR  ' + name + ' — ' + m.harness); return; }
  let out = null, threw = null, snap = null;
  try { out = (mode === 'static') ? RUN.bootSurface() : RUN.run(400, mode); } catch (e) { threw = e; }
  // Taken BEFORE the restore: a probe that reads the source after it is put back inspects a healthy
  // tree and reports every source-level mutant as survived.
  try { if (whileMutated) snap = whileMutated(); } catch (e) { threw = threw || e; }
  m.restore();
  if (threw) { harnessErrors++; failed++; console.log('HARNESS ERROR  ' + name + ' — ' + threw.message); return; }
  if (out && (out.fatal || out.noMeasurements)) {
    harnessErrors++; failed++;
    console.log('HARNESS ERROR  ' + name + ' — ' + (out.fatal || 'no measurements'));
    return;
  }
  let caught = false, why = '';
  try { caught = !!detects(out, snap); } catch (e) { caught = false; why = ' (probe threw: ' + e.message + ')'; }
  if (caught) { killed++; passed++; console.log('  ok   ' + name + ' KILLED'); }
  else { survived++; failed++; console.log('FAIL  ' + name + ' SURVIVED' + why); }
}

// H1 — §13 "restore IR script to boot".
mutant('H1 inventory-replenishment.js is put back on the boot list', T.index,
  '    <script src="assets/js/data/replenishment-mock-data.js?v=' + RO.currentAppToken() + '" defer></script>',
  '    <script src="assets/js/data/replenishment-mock-data.js?v=' + RO.currentAppToken() + '" defer></script>\r\n' +
  '    <script src="assets/js/pages/inventory-replenishment.js?v=' + RO.currentAppToken() + '" defer></script>',
  'static',
  function (b) { return b.localCount !== M.boot.post.localScripts || b.bytes !== M.boot.post.bytes; });

// H2 — §13 "restore map script to boot".
mutant('H2 km-globe.js is put back on the boot list', T.index,
  '    <script src="assets/js/data/replenishment-mock-data.js?v=' + RO.currentAppToken() + '" defer></script>',
  '    <script src="assets/js/data/replenishment-mock-data.js?v=' + RO.currentAppToken() + '" defer></script>\r\n' +
  '    <script src="assets/js/lib/km-globe.js?v=map-transporticons-r10-20260926" defer></script>',
  'static',
  function (b) { return b.bytes !== M.boot.post.bytes; });

// H3 — §13 "mount before load". The router mounts without waiting for the code, so a route can show
// with nothing behind it.
mutant('H3 the router mounts without waiting for the code', T.app,
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
  'routes',
  function (o) {
    return TARGET_KEYS.some(function (k) { return !o.routes[k] || o.routes[k].cold.mountedSections !== 1; });
  });

// H4 — §13 "duplicate script insertion": the per-url guard goes, so a second entry re-inserts.
mutant('H4 the loader re-inserts scripts it already has', T.loader,
  [['        if (_loaded[url]) return Promise.resolve(true);',
    '        if (false) return Promise.resolve(true);'],
   ['        if (_loaded[key]) return Promise.resolve(true);',
    '        if (false) return Promise.resolve(true);']],
  null,
  'routes',
  function (o) {
    return TARGET_KEYS.some(function (k) {
      const r = o.routes[k];
      return !r || r.warmDelta.fetched !== 0 || r.rapidDelta.fetched !== 0;
    });
  });

// H5 — §13 "mark failed set loaded": a partially loaded set recorded as loaded, so Retry does nothing.
mutant('H5 a refused set is recorded as loaded anyway', T.loader,
  '                if (allOk) _loaded[key] = true;',
  '                _loaded[key] = true;',
  'failure',
  function (o) {
    return TARGET_KEYS.some(function (k) {
      const f = o.failure[k];
      return !f || f.retryFetchDelta === 0 || f.recovered !== true;
    });
  });

// H6 — §13 "use application token for map asset". The family rule must catch it.
mutant('H6 a map asset is served under the application token', T.app,
  "            'assets/js/lib/km-globe.js?v=map-transporticons-r10-20260926',",
  "            'assets/js/lib/km-globe.js?v=" + RO.currentAppToken() + "',",
  'static',
  function (_b, snap) { return snap && snap.misplaced > 0; },
  function () { return { misplaced: RO.misplacedReleaseTokens(read('index.html'), read('assets/js/app.js')).length }; });

// H7 — §13 "skip Retry reset". The refusal is left on screen after a successful recovery, which is
// the defect this round found in S4-R3's router and repaired.
mutant('H7 the refusal is left behind after a successful Retry', T.app,
  '            if (ok) { _kmClearRouteScriptFailure_(section); return; }',
  '            if (ok) return;',
  'failure',
  function (o) {
    return TARGET_KEYS.some(function (k) {
      const f = o.failure[k];
      return !f || f.onRetry.errorBox !== 0;
    });
  });

console.log('\n  mutants: ' + killed + ' killed, ' + survived + ' survived, ' + harnessErrors + ' harness errors');
ok(survived === 0 && harnessErrors === 0, 'H  every planted defect was caught');

/* ================================================================================================== */
console.log('\n' + '='.repeat(100));
console.log('S4-R5 ROUTE PAYLOADS: ' + passed + ' passed, ' + failed + ' failed');
console.log('='.repeat(100));
process.exit(failed === 0 ? 0 : 1);
