// Kitchen Mama Operation System — F1-4B-FM5-R4UI-R5C deployment/version-parity PROBE + live-path regression lock.
// Run: node assets/tests/inventory-version-probe-f1-4b-fm5r4uir5c.test.js
// -----------------------------------------------------------------------------
// LIVE symptom: after push + Apps Script sync + "Recalculate All Sites", CO1100-R still BLOCKED, updated_at still
// advances, the logo looks new but the Inventory page looks stale. We cannot read the live server/DOM from here, so
// R5C adds the SMALLEST possible READ-ONLY version marker to the two handler response envelopes the browser actually
// receives, so ONE Network response proves which handler is live (stale deployment vs genuine remaining defect):
//   • 43 gap-materialization batch  → envelope.meta.gapMaterializationHandlerVersion   (the Recalculate response)
//   • 42 recommendation workspace   → envelope.meta.recommendationWorkspaceHandlerVersion (any workspace GET)
// This test also LOCKS: the marker is additive (business fields untouched), the R5B sales-basis marshalling repair
// markers are still present, and there is exactly ONE sales-rate owner (no alternate/old path bypassing the fix).

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var BUNDLE = read('specs/active/apps-script/90_generated_supply_planning_bundle.gs');
var F42 = read('specs/active/apps-script/42_api_v1_recommendation_workspace.gs');
var F43 = read('specs/active/apps-script/43_api_v1_gap_materialization.gs');
var INDEX = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');

// S8-B3-R3-CP2T-R1 - THE TWO MARKERS ARE NOT ONE MARKER, and tying them to a single constant said they
// were. Each one exists to prove which handler of ITS OWN file is live, and the two files are deployed
// and change independently: CP2T-R1 repaired the campaign/event date passing in 42_ only, so 42_ owes a
// new version and 43_ does not. Marching 43_ to it would stamp a change onto a file that did not change,
// which is the per-module-stamp error the release governance already names.
var VER_WS = 'fm5-r4ui-r5e';     // 42_ recommendation workspace - r5e refuses a weekly rung with no source
var VER_WS_SUPERSEDED = ['fm5-r4ui-r5c', 'fm5-r4ui-r5d'];   // r5c mis-read campaign dates; r5d published a fabricated 0
var VER_GAP = 'fm5-r4ui-r5c';    // 43_ gap materialization - unchanged this round
var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// eval both handlers in a faithful sandbox (top-level is pure decl only; Apps Script APIs are call-time).
var W = (new Function(BUNDLE + '\n' + F42 + '\n return { envelope: recoWsEnvelope_, ver: RECO_WS_HANDLER_VERSION_ };'))();
var G = (new Function(F43 + '\n;return { batchEnvelope: gapBatchEnvelope_, ver: GAP_MATERIALIZATION_HANDLER_VERSION_ };'))();

section('Phase 4 — 43 gap-materialization batch envelope carries the READ-ONLY handler-version marker (the Recalculate response)');
var okEnv = G.batchEnvelope(true, { product: 'INVENTORY', totalScopes: 3, ready: 2, blocked: 1, written: 3 });
ok(okEnv.success === true, 'G1 success envelope still succeeds (marker is additive, not gating)');
ok(okEnv.meta && okEnv.meta.gapMaterializationHandlerVersion === VER_GAP, 'G2 success envelope.meta.gapMaterializationHandlerVersion === "' + VER_GAP + '" (ONE Recalculate response proves the live gap handler)');
ok(okEnv.data && okEnv.data.ready === 2 && okEnv.data.blocked === 1 && okEnv.data.written === 3, 'G3 the batch SUMMARY business fields are untouched (marker lives on meta, not data)');
var errEnv = G.batchEnvelope(false, null, 'GAP_BATCH_ERROR', 'boom');
ok(errEnv.success === false && errEnv.meta && errEnv.meta.gapMaterializationHandlerVersion === VER_GAP, 'G4 even a FAILURE envelope carries the marker (a stale deploy that errors is still identifiable)');
ok(errEnv.errors && errEnv.errors[0] && errEnv.errors[0].code === 'GAP_BATCH_ERROR', 'G5 the error envelope shape is unchanged');
ok(G.ver === VER_GAP, 'G6 the gap-materializer version constant is exactly "' + VER_GAP + '"');

section('Phase 4 — 42 recommendation-workspace envelope carries the marker (any workspace GET proves the R5B sales fix is live)');
var wsOk = W.envelope(true, { lines: [] }, [], { calculationDate: '2026-08-08' });
ok(wsOk.success === true && wsOk.meta && wsOk.meta.recommendationWorkspaceHandlerVersion === VER_WS, 'W1 workspace success meta.recommendationWorkspaceHandlerVersion === "' + VER_WS + '"');
ok(wsOk.meta.apiVersion === '1' && wsOk.meta.source === 'recommendation.workspace.get' && wsOk.meta.calculationDate === '2026-08-08', 'W2 the existing meta contract (apiVersion / source / caller meta) is preserved — marker is purely additive');
var wsErr = W.envelope(false, null, [{ code: 'VALIDATION_FAILED' }]);
ok(wsErr.success === false && wsErr.meta && wsErr.meta.recommendationWorkspaceHandlerVersion === VER_WS, 'W3 a failure envelope also carries the marker');
ok(W.ver === VER_WS, 'W4 the workspace version constant is exactly "' + VER_WS + '"');

section('Phase 3 — R5B live-path repair markers still present (the version proven live IS the fixed code)');
ok(/function toYmd\(v\)/.test(F42) && /var calcYmd = toYmd\(calcDate\)/.test(F42), 'R1 snapshot/calc date coercion (toYmd) present');
ok(/kmcalcChannel = \(!daily\.length && !channel\) \? 'WEEKLY_ONLY' : channel;/.test(F42), 'R2 WEEKLY_ONLY blank-channel sentinel present (single-market branch)');
ok(/var chSource = daily\.length \? daily : weeklyAll;/.test(F42), 'R3 daily-else-weekly basis routing present');
// S8-B3-R3-CP2R-R1 - the claim is unchanged, the DEAD VARIABLE NAME is not. `e2` was the second catch
// of a no-contamination retry that R1 removed: an un-excluded average is not a normal average, so the
// resolver fails closed instead of recomputing. The surfaced-exception behaviour this protects is
// unchanged and is also exercised directly, not only grepped.
ok(/run-rate owner error: ' \+ m/.test(F42), 'R4 the real owner exception is surfaced (no opaque token)');

section('Phase 5 — CP2T-R1: the PAGE accepts exactly the computation the server stamps');
// A page that accepts a version the server never sends caches nothing for the rest of the session; a page
// that accepts one the server no longer sends serves a pre-repair answer. The two files must agree, and
// nothing else in the repo checks that they do.
var IRPAGE = fs.readFileSync(path.join(__dirname, '..', 'js/pages/inventory-replenishment.js'), 'utf8');
var accepted = (IRPAGE.match(/var _IR_RECO_CACHE_HANDLERS = \[([^\]]*)\]/) || [])[1];
ok(accepted !== undefined, 'P1 the page declares the handler versions whose computation it will cache');
ok(String(accepted).indexOf("'" + VER_WS + "'") !== -1,
  'P2 and it accepts the version 42_ actually stamps (' + VER_WS + ') - otherwise the cache can never hit', accepted);
VER_WS_SUPERSEDED.forEach(function (v) {
  ok(String(accepted).indexOf("'" + v + "'") === -1,
    'P3 and NOT ' + v + ', whose stored answers are wrong rather than unreadable', accepted);
});

section('Phase 3 — exactly ONE sales-rate owner (no alternate/old path bypasses the R5B fix)');
var kmcalcCalls = (F42.match(/KMCALC\.normalizedAvgSalesPerDay\(/g) || []).length;
ok(kmcalcCalls === 1, 'S1 KMCALC.normalizedAvgSalesPerDay is INVOKED exactly once (the lone call inside recoWsResolveSalesRate_; the other textual hits are its doc comment + typeof guard) — got ' + kmcalcCalls);
var resolveCalls = (F42.match(/recoWsResolveSalesRate_\(/g) || []).length;
ok(resolveCalls === 3, 'S2 recoWsResolveSalesRate_ = 1 definition + 2 call sites (marketplace + warehouse); no third path — got ' + resolveCalls);

section('Phase 1 — assets are now CACHE-VERSIONED (F1-UI-RUNTIME-CLOSURE-R1 closed the stale-CSS vector)');
ok(/inventory-replenishment\.css\?v=/.test(INDEX), 'C1 the Inventory CSS now carries a ?v= cache-busting query — a deploy invalidates the browser/Pages cached copy (fixes the stale neutral-vs-orange render)');
ok(!/serviceWorker|navigator\.serviceWorker/.test(INDEX), 'C2 no service worker (rules out an SW cache layer)');
var invCssCount = (INDEX.match(/pages\/inventory-replenishment\.css/g) || []).length;
ok(invCssCount === 1, 'C3 exactly ONE inventory CSS link (no duplicate old inventory stylesheet overriding R5A rules) — got ' + invCssCount);

section('additive-only — no DB write / formula introduced by the probe');
ok(!/appendRow|setValues|insertRow|deleteRow/.test('gapMaterializationHandlerVersion recommendationWorkspaceHandlerVersion'), 'A1 the marker names carry no write verb (sanity)');
ok(/READ-ONLY deployment\/version PROBE/.test(F42) && /READ-ONLY deployment\/version PROBE/.test(F43), 'A2 both markers are documented as read-only diagnostics');

console.log('\n----------------------------------------');
console.log('R5C VERSION PROBE + LIVE-PATH LOCK (F1-4B-FM5-R4UI-R5C): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
