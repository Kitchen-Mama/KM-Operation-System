// Kitchen Mama Operation System — Inventory Replenishment Recommendation READ cutover (F1-4B-B).
// Run: node assets/tests/replen-recommendation-cutover-f1-4b-b.test.js
// -----------------------------------------------------------------------------
// Proves the page connects the Recommendation Summary to recommendation.workspace.get behind default-false
// flags: ONE request per READY scope (never per SKU), maps API outputs WITHOUT recomputation, distinguishes
// EMPTY / VALID_ZERO / BLOCKED / API_ERROR / NOT_FOUND / CONFLICT, canonical composite row identity,
// stale-response guard, invalidation on context change, and legacy preservation when flags are off — with
// no page-side formula, no runtime import, no whole-DB reload, and no write. Behavioral: the IRContext +
// F1-4B-B read blocks are extracted from the page source and eval'd with fake window/document/KM.api.
// Source-scan: DOM wiring + placeholder preservation. No DOM render, no network, no live Spreadsheet.
// NOTE: intentionally NOT in strict mode — the IRContext + read blocks are loaded via direct eval and
// their top-level declarations must bind into this module scope (strict-mode eval would isolate them).

var fs = require('fs');
var path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var JS = read('js/pages/inventory-replenishment.js');
var CSS = read('css/pages/inventory-replenishment.css');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function slice(m1, m2) { var a = JS.indexOf(m1), b = JS.indexOf(m2); if (a < 0 || b < 0) throw new Error('markers not found: ' + m1); return JS.slice(a, b); }

// ---- harness: eval IRContext + the F1-4B-B read block into one scope with fakes ---------------------
var IRCTX = slice('// __IRCTX_START__', '// __IRCTX_END__');
var IRRECO = slice('// __IRRECO_START__', '// __IRRECO_END__');
ok(IRCTX.length > 0 && IRRECO.length > 0, 'X0 extraction markers present');

global.window = { IRCountry: { matches: function (a, b) { return String(a).trim().toUpperCase() === String(b).trim().toUpperCase(); } } };
global.document = { getElementById: function () { return null; }, querySelectorAll: function () { return []; } };
global.AbortController = function () { this.signal = {}; this.abort = function () { this._aborted = true; }; };

// shared page-scope vars/stubs the read block references (declared here so direct eval binds them)
var _irctxLastContext = null;
function escapeReplenHtml(s) { return String(s == null ? '' : s); }
function getReplenishmentData() { return []; }
function _recSummaryRows() { return '<tr><td>legacy</td></tr>'; }   // legacy body stub
function updateReplenRecoContext() { return _irctxLastContext; }
eval(IRCTX);           // defines window.IRContext
eval(IRRECO);          // defines _irReco* + loadRecommendationWorkspace_ (closes over the harness vars)
var IR = global.window.IRContext;
ok(typeof loadRecommendationWorkspace_ === 'function' && typeof _irRecommendationWorkspaceEnabled === 'function', 'X1 read-cutover functions eval OK');

// ---- fakes -----------------------------------------------------------------------------------------
function makeApi(active, env) {
  var calls = { getWorkspace: 0, lastParams: null };
  return { _calls: calls,
    workspaceApiActive: function (n) { return active && n === 'recommendation'; },
    getWorkspace: function (name, params) { calls.getWorkspace++; calls.lastName = name; calls.lastParams = params; return Promise.resolve(env); } };
}
function envOk(lines) { return { success: true, data: { lines: lines, pagination: { page: 1, size: 100, total: lines.length }, dataVersion: { formulaVersion: 'v4.7', sourceDataAsOf: '2026-08-01' } }, meta: { requestId: 'REQ-R1', source: 'recommendation.workspace.get', mode: 'WORKSPACE', tablesRead: 11 }, errors: [] }; }
function envFail(code) { return { success: false, data: null, meta: { requestId: 'REQ-E1' }, errors: [{ code: code, message: code + ' message', details: null }] }; }
function line(over) { var L = { sku: 'CO1100-R', siteSku: 'ST-1', destinationWarehouseId: 'WH-3PL', currentStockQty: 100, qualifiedIncomingQty: 24, calculatedGap: 100, recommendedQty: 96, blocked: false, blockedReason: null, formulaVersion: 'v4.7', sourceDataAsOf: '2026-08-01', diagnostics: { issues: [] } }; if (over) for (var k in over) L[k] = over[k]; return L; }
var READY = { status: 'READY', company: 'KM', country: 'US', marketplace: 'AMAZON_US', marketplaceId: 'MP1', destinationWarehouseId: 'WH-3PL', calculationMonth: '2026-08', planningCycle: '2026-W40', missing: [], issues: [] };
function setCtx(m) { _irctxLastContext = m; }
function tick() { return Promise.resolve().then(function () {}).then(function () {}); }
// reset read state between independent scenarios so the (correct) same-context dedupe never suppresses a
// scenario's request; tolerate a null return (dedupe / not-ready paths return null, not a promise).
function freshLoad(active, env, ctx) { _irRecoInvalidate('CONTEXT_NOT_READY'); var api = makeApi(active, env); global.window.KM = { api: api }; setCtx(ctx || READY); return Promise.resolve(loadRecommendationWorkspace_()).then(tick).then(function () { return api; }); }

(async function main() {

  section('A. Effective cutover predicate');
  global.window.KM = { api: makeApi(false, envOk([line()])) };
  ok(_irRecommendationWorkspaceEnabled() === false, 'A1 workspaceApiActive false → disabled');
  global.window.KM = { api: makeApi(true, envOk([line()])) };
  ok(_irRecommendationWorkspaceEnabled() === true, 'A2 workspaceApiActive true → enabled');
  delete global.window.KM;
  ok(_irRecommendationWorkspaceEnabled() === false, 'A3 no KM.api → disabled');

  section('B. Request gating — flags/context');
  var apiOff = makeApi(false, envOk([line()])); global.window.KM = { api: apiOff }; setCtx(READY);
  loadRecommendationWorkspace_(); await tick();
  ok(apiOff._calls.getWorkspace === 0 && _irRecoState.status === 'DISABLED', 'B1 flags OFF → no request, DISABLED');
  var apiNR = makeApi(true, envOk([line()])); global.window.KM = { api: apiNR }; setCtx({ status: 'NOT_READY', missing: ['destinationWarehouseId'] });
  loadRecommendationWorkspace_(); await tick();
  ok(apiNR._calls.getWorkspace === 0 && _irRecoState.status === 'CONTEXT_NOT_READY', 'B2 context NOT_READY → no request');
  var apiInv = makeApi(true, envOk([line()])); global.window.KM = { api: apiInv }; setCtx({ status: 'INVALID', missing: [] });
  loadRecommendationWorkspace_(); await tick();
  ok(apiInv._calls.getWorkspace === 0, 'B3 context INVALID → no request');
  var apiB = makeApi(true, envOk([line()])); global.window.KM = { api: apiB }; setCtx({ status: 'DESTINATION_BLOCKED', missing: [] });
  loadRecommendationWorkspace_(); await tick();
  ok(apiB._calls.getWorkspace === 0, 'B4 context DESTINATION_BLOCKED → no request');

  section('C. READY → exactly one request; DTO from IRContext; no per-SKU loop');
  var apiC = await freshLoad(true, envOk([line(), line({ sku: 'CO1150-R', siteSku: 'ST-2' }), line({ sku: 'SP3120-R', siteSku: 'ST-3' })]), READY);
  ok(apiC._calls.getWorkspace === 1, 'C1 exactly one request for a 3-line scope (no per-SKU HTTP loop)');
  var pr = apiC._calls.lastParams;
  ok(pr.scope.company === 'KM' && pr.scope.country === 'US' && pr.scope.marketplace === 'AMAZON_US', 'C2 DTO scope from IRContext');
  ok(pr.destinationWarehouseId === 'WH-3PL' && pr.calculationMonth === '2026-08' && pr.planningCycle === '2026-W40', 'C3 DTO destination/month/cycle from IRContext (not reconstructed/inferred)');
  ok(pr.pagination.size === 100 && pr.pagination.page === 1, 'C4 DTO pagination size 100 / page 1');
  ok(pr.include.diagnostics === true, 'C5 DTO include.diagnostics true');
  ok(pr.filters.sku === null && pr.filters.siteSku === null && pr.filters.category === null && pr.filters.series === null, 'C6 DTO filters all null (full scope)');
  ok(_irRecoState.status === 'READY' && Object.keys(_irRecoState.linesByKey).length === 3, 'C7 state READY with 3 indexed lines');
  ok(_irRecoState.requestId === 'REQ-R1', 'C8 requestId retained');
  loadRecommendationWorkspace_(); await tick();   // recall, same context
  ok(apiC._calls.getWorkspace === 1, 'C9 identical-context recall → no duplicate request');

  section('D. Response → per-SKU mapping + state distinctions (no recompute, no ||0)');
  function loadWith(env) { return freshLoad(true, env, READY); }
  await loadWith(envOk([line()]));
  var L = _irRecoLineForSku({ sku: 'CO1100-R', siteSku: 'ST-1' });
  ok(L && L.currentStockQty === 100 && L.qualifiedIncomingQty === 24 && L.calculatedGap === 100 && L.recommendedQty === 96, 'D1 fields mapped directly from API');
  ok(L.blocked === false, 'D2 non-blocked line');
  await loadWith(envOk([line({ recommendedQty: 0, calculatedGap: 0, currentStockQty: 0 })]));
  var Z = _irRecoLineForSku({ sku: 'CO1100-R', siteSku: 'ST-1' });
  ok(Z.recommendedQty === 0 && Z.calculatedGap === 0 && Z.currentStockQty === 0, 'D3 legitimate zero preserved (0 ≠ missing)');
  await loadWith(envOk([line({ recommendedQty: null, qualifiedIncomingQty: undefined })]));
  var M = _irRecoLineForSku({ sku: 'CO1100-R', siteSku: 'ST-1' });
  ok(M.recommendedQty === null && M.qualifiedIncomingQty === null, 'D4 missing field → null (no missing-to-zero)');
  await loadWith(envOk([]));
  ok(_irRecoState.status === 'EMPTY', 'D5 success + zero lines → EMPTY');
  await loadWith(envOk([line({ blocked: true, blockedReason: 'MISSING_FORECAST_WEIGHT_SOURCE', recommendedQty: null })]));
  var B = _irRecoLineForSku({ sku: 'CO1100-R', siteSku: 'ST-1' });
  ok(B.blocked === true && B.blockedReason === 'MISSING_FORECAST_WEIGHT_SOURCE', 'D6 blocked line carries reason');
  await loadWith(envFail('WRONG_SPREADSHEET_TARGET'));
  ok(_irRecoState.status === 'API_ERROR' && _irRecoState.errors[0].code === 'WRONG_SPREADSHEET_TARGET' && _irRecoState.requestId === 'REQ-E1', 'D7 structured failure → API_ERROR + code + requestId (no silent fallback)');
  await loadWith(envFail('MISSING_FORECAST_WEIGHT_SOURCE'));
  ok(_irRecoState.errors[0].code === 'MISSING_FORECAST_WEIGHT_SOURCE', 'D8 missing-forecast differentiated');
  await loadWith(envFail('MISSING_DESTINATION_WAREHOUSE'));
  ok(_irRecoState.errors[0].code === 'MISSING_DESTINATION_WAREHOUSE', 'D9 missing-destination differentiated');

  section('E. Row identity — canonical composite key; not-found + conflict');
  await freshLoad(true, envOk([line({ sku: 'CO1100-R', siteSku: 'ST-1' }), line({ sku: 'CO1100-R', siteSku: 'ST-2' })]), READY);
  ok(_irRecoLineForSku({ sku: 'CO1100-R', siteSku: 'ST-1' }).siteSku === 'ST-1', 'E1 same sku, different siteSku → distinct lines (not SKU-alone merge)');
  ok(_irRecoLineForSku({ sku: 'CO1100-R', siteSku: 'ST-2' }).siteSku === 'ST-2', 'E2 second siteSku line resolves separately');
  ok(_irRecoLineForSku({ sku: 'NOPE', siteSku: 'X' }) === undefined, 'E3 no matching line → undefined (RECOMMENDATION_LINE_NOT_FOUND)');
  await freshLoad(true, envOk([line({ sku: 'CO1100-R', siteSku: 'ST-1' }), line({ sku: 'CO1100-R', siteSku: 'ST-1', recommendedQty: 50 })]), READY);
  var C = _irRecoLineForSku({ sku: 'CO1100-R', siteSku: 'ST-1' });
  ok(C && C.__conflict === true, 'E4 duplicate composite key → CONFLICT marker (never latest-win)');

  section('F. Stale-response guard + invalidation');
  var envA = envOk([line({ recommendedQty: 1 })]);
  var envB = envOk([line({ recommendedQty: 999 })]);
  var apiF = { workspaceApiActive: function () { return true; }, getWorkspace: function (n, p) { return Promise.resolve(p.destinationWarehouseId === 'WH-B' ? envB : envA); } };
  _irRecoInvalidate('CONTEXT_NOT_READY'); global.window.KM = { api: apiF };
  setCtx(Object.assign({}, READY, { destinationWarehouseId: 'WH-A' })); loadRecommendationWorkspace_();
  setCtx(Object.assign({}, READY, { destinationWarehouseId: 'WH-B' })); loadRecommendationWorkspace_();
  await tick(); await tick();
  ok(_irRecoState.destinationWarehouseId === 'WH-B', 'F1 latest context wins (older response ignored)');
  var seqBefore = _irRecoSeq; _irRecoInvalidate('CONTEXT_NOT_READY');
  ok(_irRecoSeq === seqBefore + 1 && _irRecoState.status === 'CONTEXT_NOT_READY' && _irRecoState.loadedOk === false, 'F2 invalidate bumps seq + clears state');

  section('G. Flag rollback ON→OFF clears API values');
  await freshLoad(true, envOk([line()]), READY);
  ok(_irRecoState.status === 'READY', 'G1 loaded under flags ON');
  global.window.KM = { api: makeApi(false, envOk([line()])) };
  loadRecommendationWorkspace_(); await tick();
  ok(_irRecoState.status === 'DISABLED' && Object.keys(_irRecoState.linesByKey).length === 0, 'G2 flags OFF → state cleared to DISABLED (no stale API values)');

  section('H. Enabled-but-unavailable API → visible error (never fake success)');
  _irRecoInvalidate('CONTEXT_NOT_READY');
  global.window.KM = { api: { workspaceApiActive: function () { return true; } } };   // no getWorkspace
  setCtx(READY); loadRecommendationWorkspace_(); await tick();
  ok(_irRecoState.status === 'API_ERROR' && _irRecoState.errors[0].code === 'WORKSPACE_UNAVAILABLE', 'H1 enabled but getWorkspace missing → API_ERROR (no fake success)');

  section('I. Source-scan — cutover wiring + negative constraints');
  (function () {
    function strip(s) { return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1'); }
    var scan = strip(IRRECO);
    ok(/_irRecoSummaryCardBody\(skuData\)/.test(JS), 'I1 Recommendation Summary card uses the workspace/legacy body switch');
    ok(/_recSummaryRows\(skuData\)/.test(strip(JS)), 'I2 legacy table body (_recSummaryRows) preserved for flags-off mode');
    ok(/No recommendation generated/.test(JS) && /AI Pending/.test(JS), 'I3 legacy placeholders preserved in source (flags-off mode)');
    ok(!/forEach[\s\S]{0,80}getWorkspace/.test(scan) && !/for\s*\([\s\S]{0,80}getWorkspace/.test(scan), 'I4 no per-SKU getWorkspace loop');
    ok(!/require\(\s*['"]\.\.\/core\/supply-planning/.test(JS) && !/require\(\s*['"]\.\.\/api\/km-api-foundation/.test(JS), 'I5 no runtime/formula/Foundation module imported into the page');
    ok(!/calculateGap|calculateSuggestedOrderQty|sumRemainingShortages|normalizedAvgSalesPerDay/.test(scan), 'I6 no supply-planning formula invoked in the cutover code');
    ok(/_irNumOrNull/.test(scan) && !/recommendedQty[^\n]*\|\|\s*0/.test(scan) && !/currentStockQty[^\n]*\|\|\s*0/.test(scan), 'I7 explicit null handling; no `|| 0` for recommendation fields');
    ok(!/getOperationDb|loadOperationDb|reloadOperationDb/.test(scan), 'I8 no whole-DB reload in the cutover code');
    ok(!/upsert|appendRow|setValue|importMarketplaceSkusBatch|saveAllocation|submitReplenishmentPlans|_saveAllocationDraft|createExecutionRoute|addExecutionRoute/i.test(scan), 'I9 no write / persistence / Submit / Execution-Plan mutation in the cutover code');
    ok(/my !== _irRecoSeq/.test(scan), 'I10 stale-response guard present');
    ok(/AbortController/.test(scan) && /\.abort\(\)/.test(scan), 'I11 AbortController used to invalidate the browser response');
    ok(/workspaceApiActive\(\s*['"]recommendation['"]\s*\)/.test(scan), 'I12 effective predicate delegates to Foundation workspaceApiActive');
    ok(/loadRecommendationWorkspace_\(\)/.test(JS), 'I13 read cutover invoked from wiring');
    ok(/_irRecoInvalidate\('DISABLED'\)/.test(JS), 'I14 unmount invalidates the request');
    ok(/role="status" aria-live="polite"/.test(IRRECO), 'I15 workspace summary body uses role=status aria-live=polite');
    var blockedFn = IRRECO.slice(IRRECO.indexOf('if (line.blocked)'), IRRECO.indexOf('var zeroNote'));
    ok(!/Recommended Qty/.test(blockedFn), 'I16 blocked line does not display Recommended Qty');
  })();

  section('J. Source-scan — CSS states + legacy card switch');
  ok(/\.replen-recsum-ws--ready\b/.test(CSS) && /\.replen-recsum-ws--blocked\b/.test(CSS) && /\.replen-recsum-ws--error\b/.test(CSS) && /\.replen-recsum-ws--zero-state\b/.test(CSS), 'J1 CSS defines ready/blocked/error/zero states');
  ok(/border-left/.test(CSS), 'J2 states carry a border cue (not color-fill only)');

  console.log('\n----------------------------------------');
  console.log('REPLEN RECOMMENDATION CUTOVER (F1-4B-B): ' + pass + ' passed, ' + fail + ' failed');
  if (fail > 0) { process.exitCode = 1; }
})();
