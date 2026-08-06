// Kitchen Mama Operation System — Recommendation live activation + dual-consumer diagnostic (F1-4B-FM2A).
// Run: node assets/tests/recommendation-live-activation-f1-4b-fm2a.test.js
// -----------------------------------------------------------------------------
// Verifies the controlled single-tester activation surface: the SAFE bounded console diagnostic
// KM.api.getRecommendationWorkspaceDiagnostic() (flags/mode/readiness + last-request telemetry, no secrets),
// the feature-flag effective-mode gating, and — by source scan — the deployed call chain, single router
// registration, handler ownership, generated-bundle runtime modules, the Script-Property calc-month contract
// (no clock fallback), and the guarded consumer telemetry wiring. Behavior of the read flows is unchanged.

var fs = require('fs');
var path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var KMAPI = require(path.join(__dirname, '..', 'js', 'api', 'km-api-foundation.js'));

var FOUND = read('js/api/km-api-foundation.js');
var ROUTER = read('specs/active/apps-script/01_router.gs');
var GS = read('specs/active/apps-script/42_api_v1_recommendation_workspace.gs');
var BUNDLE = read('specs/active/apps-script/90_generated_supply_planning_bundle.gs');
var IR = read('js/pages/inventory-replenishment.js');
var RO = read('js/pages/request-order.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function tick() { return Promise.resolve().then(function () {}).then(function () {}); }

// F1-4B-FM2B extends the safe diagnostic with the canonical flag + deployment/runtime version guards.
var EXPECTED_DIAG_KEYS = ['masterFlagEnabled', 'recommendationFlagEnabled', 'recommendationCanonical', 'effectiveMode',
  'endpointImplemented', 'inventoryConsumerReady', 'orderPlanningConsumerReady', 'orderPlanningOptIn',
  'frontendConsumerVersion', 'recommendationTransportVersion', 'lastRequestId', 'lastScope',
  'lastHttpStatus', 'lastErrorCode', 'lastDataVersion', 'lastCalculationMonth', 'lastPlanningCycle',
  'lastDestinationCount', 'lastLineCount', 'lastClientDurationMs', 'lastRuntimeVersion', 'lastBundleHash'];

function makeApi(invoke, flagsOn) {
  return KMAPI.createApiFoundation({
    flags: { USE_WORKSPACE_API: flagsOn === true },
    workspaceFlags: { recommendation: flagsOn === true },
    workspaceInvoke: invoke
  });
}
function okEnv(lines, meta) {
  return { success: true, data: { lines: lines, pagination: { page: 1, size: 100, total: lines.length }, dataVersion: { formulaVersion: 'v4.7', sourceDataAsOf: '2026-08-01' } },
    meta: Object.assign({ calculationMonth: '2026-08', planningCycle: 'RECO-2026-08' }, meta || {}), errors: [] };
}
function failEnv(code) { return { success: false, data: null, meta: {}, errors: [{ code: code, message: code, details: null }] }; }

(async function main() {
  section('A. diagnostic shape — safe, bounded, whitelisted (no secrets)');
  var api = makeApi(function () { return okEnv([]); }, false);
  ok(typeof api.getRecommendationWorkspaceDiagnostic === 'function' && typeof api.recordRecommendationDiagnostic === 'function', 'A0 diagnostic interface present on KM.api');
  var d0 = api.getRecommendationWorkspaceDiagnostic();
  ok(EXPECTED_DIAG_KEYS.every(function (k) { return k in d0; }), 'A1 diagnostic exposes exactly the documented safe fields');
  ok(Object.keys(d0).length === EXPECTED_DIAG_KEYS.length, 'A2 diagnostic exposes NO extra fields');
  ok(!/spreadsheet|token|apikey|secret|rows|payload/i.test(Object.keys(d0).join(',')), 'A3 no sensitive field names (no spreadsheet id / token / raw rows / payload)');
  ok(d0.lastRequestId === null && d0.lastScope === null && d0.lastClientDurationMs === null, 'A4 unavailable fields are null before any request (never invented)');

  section('B. feature-flag effective mode');
  ok(d0.masterFlagEnabled === false && d0.recommendationFlagEnabled === false && d0.effectiveMode === 'legacy', 'B1 defaults: flags off → legacy mode');
  ok(d0.endpointImplemented === true, 'B2 recommendation workspace is IMPLEMENTED (endpoint present)');
  api.setWorkspaceApiEnabled(true); api.setWorkspaceEnabled('recommendation', true);
  var d1 = api.getRecommendationWorkspaceDiagnostic();
  ok(d1.masterFlagEnabled === true && d1.recommendationFlagEnabled === true && d1.effectiveMode === 'workspace', 'B3 both flags on → workspace mode');

  section('C. last-request telemetry reflects the ACTUAL request (auto-recorded by the resolver)');
  var api2 = makeApi(function () { return okEnv([
    { sku: 'CO1100-R', destinationKey: 'MARKETPLACE||KM||US||AMAZON_US||MP1' },
    { sku: 'CO1100-R', destinationKey: 'WAREHOUSE||KM||US||AMAZON_US||WH-A' }
  ], { calculationMonth: '2026-08', planningCycle: 'RECO-2026-08' }); }, true);
  await Promise.resolve(api2.getWorkspace('recommendation', { scope: { company: 'KM', country: 'US', marketplace: 'AMAZON_US' }, pagination: { page: 1, size: 100 } })).then(tick);
  var d2 = api2.getRecommendationWorkspaceDiagnostic();
  ok(/^REQ-/.test(String(d2.lastRequestId)), 'C1 lastRequestId captured');
  ok(d2.lastScope && d2.lastScope.company === 'KM' && d2.lastScope.marketplace === 'AMAZON_US', 'C2 lastScope captured (business scope only)');
  ok(d2.lastCalculationMonth === '2026-08' && d2.lastPlanningCycle === 'RECO-2026-08', 'C3 server-owned calc month/cycle surfaced');
  ok(d2.lastLineCount === 2 && d2.lastDestinationCount === 2, 'C4 line + distinct-destination counts captured');
  ok(d2.lastErrorCode === null, 'C5 no error code on a successful request');
  ok(d2.lastDataVersion && d2.lastDataVersion.formulaVersion === 'v4.7', 'C6 dataVersion captured');

  section('D. failure + whitelist');
  var api3 = makeApi(function () { return failEnv('RECOMMENDATION_CALCULATION_MONTH_NOT_CONFIGURED'); }, true);
  await Promise.resolve(api3.getWorkspace('recommendation', { scope: { company: 'KM', country: 'US', marketplace: 'AMAZON_US' } })).then(tick);
  var d3 = api3.getRecommendationWorkspaceDiagnostic();
  ok(d3.lastErrorCode === 'RECOMMENDATION_CALCULATION_MONTH_NOT_CONFIGURED' && d3.lastLineCount === null, 'D1 failure surfaces the structured code (no fake success)');
  api3.recordRecommendationDiagnostic({ spreadsheetId: 'SECRET-ID', accessToken: 'zzz', lastClientDurationMs: 42 });
  var d4 = api3.getRecommendationWorkspaceDiagnostic();
  ok(d4.lastClientDurationMs === 42 && !('spreadsheetId' in d4) && !('accessToken' in d4), 'D2 recorder whitelists safe keys only (sensitive keys ignored)');

  section('E. consumer readiness reflects the live window');
  global.window = { loadRecommendationWorkspace_: function () {}, _opLoadRecommendation: function () {}, _opGetRecommendationOptIn: function () { return true; } };
  var d5 = api2.getRecommendationWorkspaceDiagnostic();
  ok(d5.inventoryConsumerReady === true && d5.orderPlanningConsumerReady === true && d5.orderPlanningOptIn === true, 'E1 readiness + OP opt-in reflect window state');
  delete global.window;

  section('F. source: single registration, ownership, bundle modules');
  ok((ROUTER.match(/recommendation\.workspace\.get/g) || []).length === 1, 'F1 router registers recommendation.workspace.get exactly once');
  ok(/handleRecommendationWorkspaceGet_\(body\)/.test(ROUTER), 'F2 router delegates to the handler');
  ok(/function handleRecommendationWorkspaceGet_/.test(GS), 'F3 42_api_v1_recommendation_workspace.gs owns the handler');
  ok(/KMDR/.test(BUNDLE) && /KMDA/.test(BUNDLE) && /KMPS/.test(BUNDLE) && /KMPA/.test(BUNDLE) && /KMPCX/.test(BUNDLE), 'F4 generated bundle contains the runtime modules (KMDR/KMDA/KMPS/KMPA/KMPCX)');

  section('G. source: Script-Property calc-month contract (no clock fallback)');
  var calcFn = GS.slice(GS.indexOf('function recoWsResolveCalcContext_'), GS.indexOf('function recoWsResolveCalcContext_') + 700);
  ok(/io\.configMonth/.test(calcFn), 'G1 calc month comes from io.configMonth (Script Property)');
  ok(/RECOMMENDATION_CALCULATION_MONTH_NOT_CONFIGURED/.test(calcFn) && /RECOMMENDATION_CALCULATION_MONTH_INVALID/.test(calcFn), 'G2 missing → NOT_CONFIGURED, malformed → INVALID (fail closed)');
  ok(/'RECO-' \+ raw/.test(calcFn), 'G3 planningCycle = RECO-{YYYY-MM} derived only after a valid month');
  ok(!/new Date\(|Utilities\.formatDate|getScriptTimeZone/.test(calcFn), 'G4 NO clock fallback in the calc-context resolver');
  ok(/PropertiesService\.getScriptProperties\(\)\.getProperty\('RECOMMENDATION_CALCULATION_MONTH'\)/.test(GS), 'G5 the default io reads the RECOMMENDATION_CALCULATION_MONTH Script Property');

  section('H. source: Foundation clockless + guarded consumer telemetry');
  ok(!/new Date\(|Date\.now\(/.test(FOUND), 'H1 the API Foundation remains clockless (determinism preserved)');
  ok(/window\.KM\.api\.recordRecommendationDiagnostic/.test(IR) && /typeof window\.KM\.api\.recordRecommendationDiagnostic === 'function'/.test(IR), 'H2 Inventory pushes latency via a GUARDED recorder call');
  ok(/window\.KM\.api\.recordRecommendationDiagnostic/.test(RO) && /typeof window\.KM\.api\.recordRecommendationDiagnostic === 'function'/.test(RO), 'H3 Order Planning pushes latency via a GUARDED recorder call');
  ok(/window\._opGetRecommendationOptIn = function/.test(RO), 'H4 Order Planning exposes a read-only opt-in getter for the diagnostic');

  console.log('\n----------------------------------------');
  console.log('RECOMMENDATION LIVE ACTIVATION (F1-4B-FM2A): ' + pass + ' passed, ' + fail + ' failed');
  if (fail > 0) { process.exitCode = 1; }
})();
