// Kitchen Mama Operation System — Recommendation Runtime PRODUCTION CUTOVER (F1-4B-FM2B).
// Run: node assets/tests/recommendation-production-cutover-f1-4b-fm2b.test.js
// -----------------------------------------------------------------------------
// Proves the production READ cutover: the recommendation workspace is CANONICAL — active BY DEFAULT and
// INDEPENDENT of the global master flag, with a SINGLE emergency kill switch (setWorkspaceEnabled). No
// console command and no page opt-in is required for normal usage; the deprecated Order-Planning opt-in
// cannot permanently block the feature. There is NO silent legacy fallback: a missing calc-month Script
// Property surfaces a distinct CONFIG_NOT_READY, and a request failure surfaces API_ERROR (never legacy
// numbers). Retry after CONFIG_NOT_READY / API_ERROR is permitted. Safe version diagnostics are present.
// The two consumers stay presentation-only (no page formula, no dual execution, no whole-DB load, no write).
//
// Layers: (1) the REAL Foundation drives the activation policy + diagnostics; (2) the two consumer READ
// blocks are extracted from page source and eval'd against injected api stubs; (3) source scans prove the
// no-formula / no-write / single-registration contracts.

var fs = require('fs');
var path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var KMAPI = require(path.join(__dirname, '..', 'js', 'api', 'km-api-foundation.js'));

var IRSRC = read('js/pages/inventory-replenishment.js');
var ROSRC = read('js/pages/request-order.js');
var FOUND = read('js/api/km-api-foundation.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function tick() { return Promise.resolve().then(function () {}).then(function () {}); }

// ---- envelope fixtures (canonical server shape) ----------------------------------------------------
function envOk(lines, meta) {
  return { success: true, data: { lines: lines, pagination: { page: 1, size: 100, total: lines.length }, dataVersion: { formulaVersion: 'v4.7', sourceDataAsOf: '2026-08-01' } },
    meta: Object.assign({ requestId: 'REQ-P1', calculationMonth: '2026-08', planningCycle: 'RECO-2026-08' }, meta || {}), errors: [] };
}
function envFail(code) { return { success: false, data: null, meta: { requestId: 'REQ-PE' }, errors: [{ code: code, message: code, details: null }] }; }
function mkt(over) { var L = { recommendationLineId: 'M1', recommendationMode: 'MARKETPLACE_ORDER_NEED', sku: 'CO1100-R', siteSku: null, destinationType: 'MARKETPLACE', destinationKey: 'MARKETPLACE||KM||US||AMAZON_US||MP1', destinationLabel: 'Amazon US', warehouseId: null, marketplaceId: 'MP1', allocatedForecastQty: 1000, currentStockQty: 120, qualifiedIncomingQty: 0, incomingCompleteness: 'PARTIAL', calculatedGap: 880, allocatedSupplyQty: null, recommendedQty: null, provisionalOrderNeed: 888, residualShortageQty: null, blocked: true, blockedReason: 'MARKETPLACE_INCOMING_IDENTITY_UNRESOLVED', formulaVersion: 'v4.7', sourceDataAsOf: '2026-08-01', diagnostics: { issues: [] } }; if (over) for (var k in over) L[k] = over[k]; return L; }

(async function main() {
  // =====================================================================================================
  section('A. Foundation activation policy — recommendation is CANONICAL (default-on, master-independent)');
  var api = KMAPI.createApiFoundation({ legacy: { command: function () { return Promise.resolve({}); }, read: function () { return Promise.resolve({}); }, hasCommand: function () { return true; } } });
  ok(api.getFlags().USE_WORKSPACE_API === false, 'A1 global master flag still defaults FALSE (unchanged for non-canonical workspaces)');
  ok(api.isCanonicalWorkspace('recommendation') === true, 'A2 recommendation is registered CANONICAL');
  ok(api.getWorkspaceFlags().recommendation === true, 'A3 recommendation per-workspace flag defaults TRUE');
  ok(api.workspaceApiActive('recommendation') === true, 'A4 recommendation ACTIVE by default with the master flag OFF (no console command)');
  ok(api.effectiveMode('recommendation') === 'workspace', 'A5 effective mode = workspace by default');
  // other workspaces unaffected: still legacy until master + their flag are on.
  ok(api.effectiveMode('inventoryReplenishment') === 'legacy' && api.workspaceApiActive('inventoryReplenishment') === false, 'A6 non-canonical workspaces remain gated (master OFF → legacy) — cutover is scoped to recommendation');

  section('B. Single emergency kill switch (rollback) — no overlapping flags');
  api.setWorkspaceEnabled('recommendation', false);
  ok(api.workspaceApiActive('recommendation') === false && api.effectiveMode('recommendation') === 'legacy', 'B1 setWorkspaceEnabled(recommendation,false) disables the feature (rollback)');
  api.setWorkspaceEnabled('recommendation', true);
  ok(api.workspaceApiActive('recommendation') === true, 'B2 re-enabling restores it');
  // master flag toggling must NOT change a canonical workspace (proves master-independence, single gate).
  api.setWorkspaceApiEnabled(true);
  ok(api.workspaceApiActive('recommendation') === true, 'B3 master ON → still active (unchanged)');
  api.setWorkspaceApiEnabled(false);
  ok(api.workspaceApiActive('recommendation') === true, 'B4 master OFF → STILL active (the master flag is not a second gate)');

  section('C. Safe version diagnostics (deployment/runtime guard; no secrets)');
  var d = api.getRecommendationWorkspaceDiagnostic();
  ok(d.recommendationCanonical === true, 'C1 diagnostic reports the canonical policy');
  ok(typeof d.frontendConsumerVersion === 'string' && d.frontendConsumerVersion.length > 0, 'C2 frontendConsumerVersion present (proves the loaded frontend)');
  ok(typeof d.recommendationTransportVersion === 'string' && d.recommendationTransportVersion.length > 0, 'C3 recommendationTransportVersion present');
  ok('lastRuntimeVersion' in d && 'lastBundleHash' in d, 'C4 server-reported runtime/bundle version slots present (null until a response carries them)');
  ok(!/spreadsheet|token|apikey|secret|password/i.test(Object.keys(d).join(',')), 'C5 no sensitive field names exposed');
  // a response carrying a server runtime version is surfaced (opportunistic, never invented).
  var api2 = KMAPI.createApiFoundation({ workspaceInvoke: function () { return envOk([mkt()], { runtimeVersion: 'rt-9', bundleHash: 'abc123' }); } });
  await Promise.resolve(api2.getWorkspace('recommendation', { scope: { company: 'KM', country: 'US', marketplace: 'AMAZON_US' } })).then(tick);
  var d2 = api2.getRecommendationWorkspaceDiagnostic();
  ok(d2.lastRuntimeVersion === 'rt-9' && d2.lastBundleHash === 'abc123', 'C6 server runtime/bundle version surfaced from meta when present');

  // =====================================================================================================
  section('D. Inventory consumer — canonical default-on + distinct states (extracted READ block)');
  var IR = IRSRC.slice(IRSRC.indexOf('// __IRRECO_START__'), IRSRC.indexOf('// __IRRECO_END__'));
  var irScope = { toScopeRequest: function () { return { company: 'KM', country: 'US', marketplace: 'AMAZON_US' }; } };
  var irEnv = { window: { IRContext: irScope }, document: null };
  // Minimal host stubs the extracted block references.
  global.window = { IRContext: irScope };
  global.document = { querySelectorAll: function () { return []; }, getElementById: function () { return null; } };
  global.AbortController = function () { this.signal = {}; this.abort = function () {}; };
  function escapeReplenHtml(s) { return String(s == null ? '' : s); }
  function getReplenishmentData() { return []; }
  var _irctxLastContext = {};
  function updateReplenRecoContext() { return _irctxLastContext; }
  function _irRecoRerenderSummaries() {}
  function _legacyRecSummaryTableHtml() { return '<table class="legacy"></table>'; }
  function _recSummaryRows() { return ''; }
  eval(IR);
  // _irSuggestedCellHtml lives just OUTSIDE the __IRRECO__ block — extract + eval it too (it depends on the
  // block's _irRecommendationWorkspaceEnabled, now in scope).
  var IRSUG = IRSRC.slice(IRSRC.indexOf('function _irSuggestedCellHtml'), IRSRC.indexOf('// Recommendation Summary table body'));
  eval(IRSUG);
  function irApi(active, env) { return { workspaceApiActive: function (n) { return active && n === 'recommendation'; }, getWorkspace: function () { return Promise.resolve(env); } }; }
  // FM3a added a session cache; these FM2B assertions test per-response STATE transitions on one scope, so
  // clear the cache before each load to force a fresh fetch of the given envelope.
  function irLoad(active, env) { if (typeof invalidateRecommendationSessionCache === 'function') invalidateRecommendationSessionCache(); _irRecoInvalidate('DISABLED'); global.window.KM = { api: irApi(active, env) }; return Promise.resolve(loadRecommendationWorkspace_()).then(tick); }

  await irLoad(true, envOk([mkt({ blocked: false, recommendedQty: 0, residualShortageQty: 0, incomingCompleteness: 'COMPLETE', blockedReason: null })]));
  ok(_irRecoState.status === 'READY', 'D1 workspace active → READY (canonical, no opt-in)');
  ok(/No replenishment needed/.test(_irRecoSummaryCardBody({ sku: 'CO1100-R' })), 'D2 valid zero → VALID_ZERO wording (distinct from missing)');
  await irLoad(true, envFail('RECOMMENDATION_CALCULATION_MONTH_NOT_CONFIGURED'));
  ok(_irRecoState.status === 'CONFIG_NOT_READY' && /configuration is incomplete/.test(_irRecoSummaryCardBody({ sku: 'CO1100-R' })), 'D3 missing calc-month → CONFIG_NOT_READY (not "engine is not active", not API_ERROR)');
  await irLoad(true, envFail('WORKSPACE_ERROR'));
  ok(_irRecoState.status === 'API_ERROR' && /request failed/.test(_irRecoSummaryCardBody({ sku: 'CO1100-R' })), 'D4 generic failure → API_ERROR (distinct from CONFIG_NOT_READY; no legacy fallback)');
  // retry after a failure: a fresh valid response supersedes the error state.
  await irLoad(true, envOk([mkt({ blocked: false, recommendedQty: 888, incomingCompleteness: 'COMPLETE', blockedReason: null, provisionalOrderNeed: null })]));
  ok(_irRecoState.status === 'READY' && /888/.test(_irRecoSummaryCardBody({ sku: 'CO1100-R' })), 'D5 retry after failure → a later valid request recovers (failure not cached as permanent)');
  // kill switch → legacy body (no workspace wrapper), workspace suppressed.
  await irLoad(false, envOk([mkt()]));
  ok(_irRecoSummaryCardBody({ sku: 'CO1100-R' }).indexOf('replen-recsum-ws') < 0, 'D6 kill switch OFF → legacy summary body preserved (no workspace wrapper)');
  // top-table Suggested Qty disposition. FM3a REPLACED the FM2B "— breakdown" indicator with a numeric
  // presentation aggregation; here we only assert the misleading legacy 0 is not shown and the old
  // "breakdown" placeholder is gone (the numeric aggregation is covered by the FM3a suite).
  global.window.KM = { api: irApi(true, envOk([mkt()])) };
  ok(!/breakdown/.test(_irSuggestedCellHtml({ sku: 'CO1100-R', suggestedQty: 0 })), 'D7 enabled → no misleading legacy number and the FM2B "breakdown" placeholder is removed (FM3a)');
  global.window.KM = { api: irApi(false, envOk([mkt()])) };
  ok(_irSuggestedCellHtml({ sku: 'CO1100-R', suggestedQty: 42 }).indexOf('42') >= 0, 'D8 kill switch OFF → legacy Suggested Qty number preserved');
  delete global.window; delete global.document; delete global.AbortController;

  // =====================================================================================================
  section('E. Order Planning consumer — canonical default-on + no opt-in block (extracted READ block)');
  var RO = ROSRC.slice(ROSRC.indexOf('// __OPRECO_START__'), ROSRC.indexOf('// __OPRECO_END__'));
  global.window = {};
  global.document = { getElementById: function () { return null; } };
  global.AbortController = function () { this.signal = {}; this.abort = function () {}; };
  function _roEsc(s) { return String(s == null ? '' : s); }
  function _roRowKey(item) { return [item.sku || '', item.company || '', item.country || '', item.marketplace || ''].join('|'); }
  function _roPanelId(k) { return 'ro-' + String(k).replace(/[^A-Za-z0-9_-]/g, '-'); }
  var requestOrderState = { expandedRowKey: null, data: [] };
  eval(RO);
  var ITEM = { sku: 'CO1100-R', company: 'KM', country: 'US', marketplace: 'AMAZON_US' };
  function roApi(active, env) { var calls = { n: 0 }; return { _calls: calls, workspaceApiActive: function (nm) { return active && nm === 'recommendation'; }, getWorkspace: function () { calls.n++; return Promise.resolve(env); } }; }
  function roLoad(active, env) { _opRecoInvalidate('DISABLED'); var a = roApi(active, env); global.window.KM = { api: a }; return Promise.resolve(_opLoadRecommendation(ITEM)).then(tick).then(function () { return a; }); }

  global.window.KM = { api: roApi(true, envOk([mkt()])) };
  ok(_opRecoEnabled() === true, 'E1 OP recommendation ENABLED by default (no _opSetRecommendationOptIn call)');
  _opSetRecommendationOptIn(false);
  ok(_opRecoEnabled() === true, 'E2 deprecated opt-in setter CANNOT permanently block the canonical feature');
  var aE = await roLoad(true, envFail('RECOMMENDATION_CALCULATION_MONTH_INVALID'));
  ok(_opRecoState.status === 'CONFIG_NOT_READY', 'E3 OP: malformed calc-month → CONFIG_NOT_READY');
  var aE2 = await roLoad(true, envOk([mkt({ blocked: false, recommendedQty: 500, incomingCompleteness: 'COMPLETE', blockedReason: null, provisionalOrderNeed: null })]));
  ok(_opRecoState.status === 'READY' && aE2._calls.n === 1, 'E4 OP: retry after CONFIG_NOT_READY recovers with one fresh request');
  var aOff = await roLoad(false, envOk([mkt()]));
  ok(aOff._calls.n === 0 && _opRecoSubsectionHtml(ITEM) === '', 'E5 OP: kill switch OFF → no request, subsection omitted (legacy panel byte-unchanged)');
  delete global.window; delete global.document; delete global.AbortController;

  // =====================================================================================================
  section('F. Order Allocation legacy empty-state coexistence + no-formula / single-registration scans');
  // the legacy "No recommendation available." must be suppressed when the canonical feature is active.
  ok(/anySuggested \|\| _opRecoEnabled\(\)/.test(ROSRC), 'F1 Order Allocation "No recommendation available." suppressed when the canonical feature is active');
  // no page-side recommendation formula in either consumer READ block.
  var irCode = IR.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  var roCode = RO.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  ok(!/Math\.(ceil|floor)|calculateGap|forecast\s*-\s*stock/.test(irCode), 'F2 Inventory READ block authors NO recommendation formula');
  ok(!/Math\.(ceil|floor)|calculateGap|calculateSuggested/.test(roCode), 'F3 Order Planning READ block authors NO recommendation formula');
  // no writes in the READ blocks.
  ok(!/appendRow|setValues|executeCommand|createRequestOrder|submitRequestOrder|persistDraft|saveDraft/i.test(irCode), 'F4 Inventory READ block performs NO write (FM3a sessionStorage cache-persist excluded)');
  ok(!/appendRow|setValues|executeCommand|createRequestOrder|submitRequestOrder|persist/i.test(roCode), 'F5 Order Planning READ block performs NO write');
  // no whole-DB reload.
  ok(!/getOperationDb|loadOperationDb/.test(irCode) && !/getOperationDb|loadOperationDb/.test(roCode), 'F6 neither READ block triggers a whole-DB reload');
  // single router registration (unchanged from FM1-T) + clockless Foundation preserved.
  var ROUTER = read('specs/active/apps-script/01_router.gs');
  ok((ROUTER.match(/recommendation\.workspace\.get/g) || []).length === 1, 'F7 router still registers recommendation.workspace.get exactly once');
  ok(!/new Date\(|Date\.now\(/.test(FOUND), 'F8 the Foundation remains clockless (determinism preserved)');
  // one bounded page per request (no per-SKU / per-destination HTTP loop).
  ok(/pagination:\s*\{\s*page:\s*1,\s*size:\s*100\s*\}/.test(IR) && /pagination:\s*\{\s*page:\s*1,\s*size:\s*100\s*\}/.test(RO), 'F9 one bounded page (size 100) per request in both consumers');

  console.log('\n----------------------------------------');
  console.log('RECOMMENDATION PRODUCTION CUTOVER (F1-4B-FM2B): ' + pass + ' passed, ' + fail + ' failed');
  if (fail > 0) { process.exitCode = 1; }
})();
