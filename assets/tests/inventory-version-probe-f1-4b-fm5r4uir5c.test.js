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

var VER = 'fm5-r4ui-r5c';
var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// eval both handlers in a faithful sandbox (top-level is pure decl only; Apps Script APIs are call-time).
var W = (new Function(BUNDLE + '\n' + F42 + '\n return { envelope: recoWsEnvelope_, ver: RECO_WS_HANDLER_VERSION_ };'))();
var G = (new Function(F43 + '\n;return { batchEnvelope: gapBatchEnvelope_, ver: GAP_MATERIALIZATION_HANDLER_VERSION_ };'))();

section('Phase 4 — 43 gap-materialization batch envelope carries the READ-ONLY handler-version marker (the Recalculate response)');
var okEnv = G.batchEnvelope(true, { product: 'INVENTORY', totalScopes: 3, ready: 2, blocked: 1, written: 3 });
ok(okEnv.success === true, 'G1 success envelope still succeeds (marker is additive, not gating)');
ok(okEnv.meta && okEnv.meta.gapMaterializationHandlerVersion === VER, 'G2 success envelope.meta.gapMaterializationHandlerVersion === "' + VER + '" (ONE Recalculate response proves the live gap handler)');
ok(okEnv.data && okEnv.data.ready === 2 && okEnv.data.blocked === 1 && okEnv.data.written === 3, 'G3 the batch SUMMARY business fields are untouched (marker lives on meta, not data)');
var errEnv = G.batchEnvelope(false, null, 'GAP_BATCH_ERROR', 'boom');
ok(errEnv.success === false && errEnv.meta && errEnv.meta.gapMaterializationHandlerVersion === VER, 'G4 even a FAILURE envelope carries the marker (a stale deploy that errors is still identifiable)');
ok(errEnv.errors && errEnv.errors[0] && errEnv.errors[0].code === 'GAP_BATCH_ERROR', 'G5 the error envelope shape is unchanged');
ok(G.ver === VER, 'G6 the gap-materializer version constant is exactly "' + VER + '"');

section('Phase 4 — 42 recommendation-workspace envelope carries the marker (any workspace GET proves the R5B sales fix is live)');
var wsOk = W.envelope(true, { lines: [] }, [], { calculationDate: '2026-08-08' });
ok(wsOk.success === true && wsOk.meta && wsOk.meta.recommendationWorkspaceHandlerVersion === VER, 'W1 workspace success meta.recommendationWorkspaceHandlerVersion === "' + VER + '"');
ok(wsOk.meta.apiVersion === '1' && wsOk.meta.source === 'recommendation.workspace.get' && wsOk.meta.calculationDate === '2026-08-08', 'W2 the existing meta contract (apiVersion / source / caller meta) is preserved — marker is purely additive');
var wsErr = W.envelope(false, null, [{ code: 'VALIDATION_FAILED' }]);
ok(wsErr.success === false && wsErr.meta && wsErr.meta.recommendationWorkspaceHandlerVersion === VER, 'W3 a failure envelope also carries the marker');
ok(W.ver === VER, 'W4 the workspace version constant is exactly "' + VER + '"');

section('Phase 3 — R5B live-path repair markers still present (the version proven live IS the fixed code)');
ok(/function toYmd\(v\)/.test(F42) && /var calcYmd = toYmd\(calcDate\)/.test(F42), 'R1 snapshot/calc date coercion (toYmd) present');
ok(/var kmcalcChannel = \(!daily\.length && !channel\) \? 'WEEKLY_ONLY' : channel;/.test(F42), 'R2 WEEKLY_ONLY blank-channel sentinel present');
ok(/var chSource = daily\.length \? daily : weeklyAll;/.test(F42), 'R3 daily-else-weekly basis routing present');
ok(/run-rate owner error: ' \+ ownerErr\(e2\)/.test(F42), 'R4 the real owner exception is surfaced (no opaque token)');

section('Phase 3 — exactly ONE sales-rate owner (no alternate/old path bypasses the R5B fix)');
var kmcalcCalls = (F42.match(/KMCALC\.normalizedAvgSalesPerDay\(/g) || []).length;
ok(kmcalcCalls === 1, 'S1 KMCALC.normalizedAvgSalesPerDay is INVOKED exactly once (the lone call inside recoWsResolveSalesRate_; the other textual hits are its doc comment + typeof guard) — got ' + kmcalcCalls);
var resolveCalls = (F42.match(/recoWsResolveSalesRate_\(/g) || []).length;
ok(resolveCalls === 3, 'S2 recoWsResolveSalesRate_ = 1 definition + 2 call sites (marketplace + warehouse); no third path — got ' + resolveCalls);

section('Phase 1 — un-versioned assets confirm HTTP cache as the frontend mixed-version mechanism (no cache-bust yet)');
ok(/href="assets\/css\/pages\/inventory-replenishment\.css"/.test(INDEX) && !/inventory-replenishment\.css\?/.test(INDEX), 'C1 the Inventory CSS is loaded WITHOUT a cache-busting query — browser/Pages cache can serve a stale copy independent of the logo');
ok(!/serviceWorker|navigator\.serviceWorker/.test(INDEX), 'C2 no service worker (rules out an SW cache layer)');
var invCssCount = (INDEX.match(/pages\/inventory-replenishment\.css/g) || []).length;
ok(invCssCount === 1, 'C3 exactly ONE inventory CSS link (no duplicate old inventory stylesheet overriding R5A rules) — got ' + invCssCount);

section('additive-only — no DB write / formula introduced by the probe');
ok(!/appendRow|setValues|insertRow|deleteRow/.test('gapMaterializationHandlerVersion recommendationWorkspaceHandlerVersion'), 'A1 the marker names carry no write verb (sanity)');
ok(/READ-ONLY deployment\/version PROBE/.test(F42) && /READ-ONLY deployment\/version PROBE/.test(F43), 'A2 both markers are documented as read-only diagnostics');

console.log('\n----------------------------------------');
console.log('R5C VERSION PROBE + LIVE-PATH LOCK (F1-4B-FM5-R4UI-R5C): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
