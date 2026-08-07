// Kitchen Mama Operation System — Inventory Replenishment SCOPE-ONLY read cutover (F1-4B-FM1-T).
// Run: node assets/tests/replen-recommendation-cutover-f1-4b-b.test.js
// -----------------------------------------------------------------------------
// Proves the page sends ONE SCOPE-ONLY recommendation.workspace.get per valid Country/Marketplace scope (server
// owns destination fanout + calc month/cycle), renders one compact row per response destination (MARKETPLACE +
// each WAREHOUSE), distinguishes canonical / valid-zero / blocked / partial-provisional / no-line / API-error,
// dedupes identical scope, stale-ignores superseded responses, and preserves legacy when flags are off — with no
// internal month/cycle/destination prerequisite, no Recommendation Context UI, no persistence/Submit, no whole-DB
// reload, no write. The IRContext + read blocks are extracted from the page source and eval'd with fakes.
// NOTE: intentionally NOT strict — extracted top-level declarations must bind into this module scope.

var fs = require('fs');
var path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var JS = read('js/pages/inventory-replenishment.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function slice(m1, m2) { var a = JS.indexOf(m1), b = JS.indexOf(m2); if (a < 0 || b < 0) throw new Error('markers not found: ' + m1); return JS.slice(a, b); }

var IRCTX = slice('// __IRCTX_START__', '// __IRCTX_END__');
var IRRECO = slice('// __IRRECO_START__', '// __IRRECO_END__');
ok(IRCTX.length > 0 && IRRECO.length > 0, 'X0 extraction markers present');

global.window = { IRCountry: { matches: function (a, b) { return String(a).trim().toUpperCase() === String(b).trim().toUpperCase(); } } };
global.document = { getElementById: function () { return null; }, querySelectorAll: function () { return []; } };
global.AbortController = function () { this.signal = {}; this.abort = function () { this._aborted = true; }; };

var _irctxLastContext = null;
function escapeReplenHtml(s) { return String(s == null ? '' : s); }
function getReplenishmentData() { return []; }
function _recSummaryRows() { return '<tr><td>legacy</td></tr>'; }
function updateReplenRecoContext() { return _irctxLastContext; }
eval(IRCTX);
eval(IRRECO);
var IR = global.window.IRContext;
ok(typeof loadRecommendationWorkspace_ === 'function' && typeof _irRecommendationWorkspaceEnabled === 'function' && typeof _irRecoSummaryCardBody === 'function', 'X1 read-cutover functions eval OK');

// ---- fakes -----------------------------------------------------------------------------------------
function makeApi(active, env) {
  var calls = { getWorkspace: 0, lastParams: null };
  return { _calls: calls,
    workspaceApiActive: function (n) { return active && n === 'recommendation'; },
    getWorkspace: function (name, params) { calls.getWorkspace++; calls.lastName = name; calls.lastParams = params; return Promise.resolve(env); } };
}
function envOk(lines) { return { success: true, data: { lines: lines, pagination: { page: 1, size: 100, total: lines.length }, dataVersion: { formulaVersion: 'v4.7', sourceDataAsOf: '2026-08-01' } }, meta: { requestId: 'REQ-R1', calculationMonth: '2026-08', planningCycle: 'RECO-2026-08', sourceReadCount: 1, tablesRead: 12 }, errors: [] }; }
function envFail(code) { return { success: false, data: null, meta: { requestId: 'REQ-E1' }, errors: [{ code: code, message: code + ' message', details: null }] }; }
function whLine(over) { var L = { recommendationLineId: 'WAREHOUSE_REPLENISHMENT|KM|US|AMAZON_US|CO1100-R|ST-1|WAREHOUSE||KM||US||AMAZON_US||WH-A', recommendationMode: 'WAREHOUSE_REPLENISHMENT', sku: 'CO1100-R', siteSku: 'ST-1', destinationType: 'WAREHOUSE', destinationKey: 'WAREHOUSE||KM||US||AMAZON_US||WH-A', destinationLabel: 'US A', warehouseId: 'WH-A', marketplaceId: null, allocatedForecastQty: 300, allocatedSalesQty: null, currentStockQty: 100, qualifiedIncomingQty: 24, incomingCompleteness: 'COMPLETE', calculatedGap: 176, allocatedSupplyQty: 500, recommendedQty: 168, provisionalOrderNeed: null, residualShortageQty: 8, blocked: false, blockedReason: null, formulaVersion: 'v4.7', sourceDataAsOf: '2026-08-01', diagnostics: { issues: [] } }; if (over) for (var k in over) L[k] = over[k]; return L; }
function mktLine(over) { var L = { recommendationLineId: 'MARKETPLACE_ORDER_NEED|KM|US|AMAZON_US|CO1100-R|ST-1|MARKETPLACE||KM||US||AMAZON_US||MP1', recommendationMode: 'MARKETPLACE_ORDER_NEED', sku: 'CO1100-R', siteSku: 'ST-1', destinationType: 'MARKETPLACE', destinationKey: 'MARKETPLACE||KM||US||AMAZON_US||MP1', destinationLabel: 'Amazon US', warehouseId: null, marketplaceId: 'MP1', allocatedForecastQty: 1000, allocatedSalesQty: null, currentStockQty: 120, qualifiedIncomingQty: 0, incomingCompleteness: 'COMPLETE', calculatedGap: 880, allocatedSupplyQty: null, recommendedQty: 888, provisionalOrderNeed: 888, residualShortageQty: null, blocked: false, blockedReason: null, formulaVersion: 'v4.7', sourceDataAsOf: '2026-08-01', diagnostics: { issues: [] } }; if (over) for (var k in over) L[k] = over[k]; return L; }
var READY = { status: 'READY', company: 'KM', country: 'US', marketplace: 'AMAZON_US', marketplaceId: 'MP1', destinationWarehouseId: 'WH-3PL', calculationMonth: '2026-08', planningCycle: '2026-W40', missing: [], issues: [] };
function setCtx(m) { _irctxLastContext = m; }
function tick() { return Promise.resolve().then(function () {}).then(function () {}); }
// FM3a added a session cache; these assertions test per-response STATE transitions on one scope, so clear
// the cache before each load to force a fresh fetch of the given envelope.
function freshLoad(active, env, ctx) { if (typeof invalidateRecommendationSessionCache === 'function') invalidateRecommendationSessionCache(); _irRecoInvalidate('CONTEXT_NOT_READY'); var api = makeApi(active, env); global.window.KM = { api: api }; setCtx(ctx || READY); return Promise.resolve(loadRecommendationWorkspace_()).then(tick).then(function () { return api; }); }

(async function main() {
  section('A. flags OFF → legacy preserved, no request');
  var apiOff = await freshLoad(false, envOk([whLine()]));
  ok(apiOff._calls.getWorkspace === 0, 'A1 flags OFF → no Workspace request');
  ok(/legacy/.test(_irRecoSummaryCardBody({ sku: 'CO1100-R' })), 'A2 flags OFF → legacy placeholder rendered');

  section('B. flags ON + valid scope → ONE scope-only request');
  var apiB = await freshLoad(true, envOk([whLine()]));
  ok(apiB._calls.getWorkspace === 1, 'B1 exactly one request for a valid scope');
  var pr = apiB._calls.lastParams;
  ok(pr.scope.company === 'KM' && pr.scope.country === 'US' && pr.scope.marketplace === 'AMAZON_US', 'B2 request carries the business scope');
  ok(!('destinationWarehouseId' in pr) && !('calculationMonth' in pr) && !('planningCycle' in pr), 'B3 scope-only: NO destinationWarehouseId / calculationMonth / planningCycle on the wire');
  ok(pr.pagination.size === 100 && pr.pagination.page === 1, 'B4 pagination size 100 / page 1');
  ok(pr.include.diagnostics === true, 'B5 include.diagnostics true');
  ok(pr.filters.lts === null && pr.filters.series === null && pr.filters.category === null, 'B6 scope filters null (full scope)');
  ok(_irRecoState.status === 'READY' && _irRecoState.calculationMonth === '2026-08' && _irRecoState.planningCycle === 'RECO-2026-08', 'B7 server-owned calc month/cycle surfaced from meta');

  section('C. invalid scope → no request; dedupe; stale-ignore');
  var apiNo = await freshLoad(true, envOk([whLine()]), { status: 'NOT_READY', company: 'KM', country: 'US', marketplace: '', missing: ['marketplace'] });
  ok(apiNo._calls.getWorkspace === 0, 'C1 invalid scope (no marketplace) → no request');
  var apiDup = await freshLoad(true, envOk([whLine()]));
  loadRecommendationWorkspace_(); await tick();
  ok(apiDup._calls.getWorkspace === 1, 'C2 identical scope recall → deduped (no duplicate request)');
  _irRecoInvalidate('CONTEXT_NOT_READY');
  var apiSlow = makeApi(true, envOk([whLine()])); global.window.KM = { api: apiSlow }; setCtx(READY);
  var p1 = loadRecommendationWorkspace_();
  setCtx({ status: 'READY', company: 'KM', country: 'US', marketplace: 'WALMART_US', missing: [], issues: [] });
  var p2 = loadRecommendationWorkspace_();
  await Promise.all([Promise.resolve(p1), Promise.resolve(p2)]).then(tick);
  ok(_irRecoState.scope.marketplace === 'WALMART_US', 'C3 scope change → latest scope wins (prior response stale-ignored)');

  section('D. per-destination rendering (MARKETPLACE + multiple WAREHOUSE)');
  var whB = whLine({ recommendationLineId: 'W|B', destinationKey: 'WAREHOUSE||KM||US||AMAZON_US||WH-B', destinationLabel: 'US B', warehouseId: 'WH-B', allocatedForecastQty: 700, recommendedQty: 456, residualShortageQty: 0 });
  var apiD = await freshLoad(true, envOk([whLine(), whB]));
  var bodyD = _irRecoSummaryCardBody({ sku: 'CO1100-R' });
  ok(/US A/.test(bodyD) && /US B/.test(bodyD), 'D1 two WAREHOUSE destinations render as distinct rows');
  ok((bodyD.match(/Warehouse Replenishment/g) || []).length === 2, 'D2 both rows labeled Warehouse Replenishment');
  ok(/168/.test(bodyD) && /456/.test(bodyD), 'D3 each warehouse shows its own recommendedQty (never merged)');
  var apiM = await freshLoad(true, envOk([mktLine()]));
  var bodyM = _irRecoSummaryCardBody({ sku: 'CO1100-R' });
  ok(/Marketplace Order Need/.test(bodyM) && /Amazon US/.test(bodyM) && /888/.test(bodyM), 'D4 MARKETPLACE line renders order-need with marketplace label');

  section('E. canonical / zero / blocked / partial / no-line / error');
  var apiZero = await freshLoad(true, envOk([whLine({ recommendedQty: 0, residualShortageQty: 0 })]));
  ok(/No replenishment needed/.test(_irRecoSummaryCardBody({ sku: 'CO1100-R' })), 'E1 valid zero → "No replenishment needed" (distinct from missing)');
  var apiPartial = await freshLoad(true, envOk([mktLine({ blocked: true, blockedReason: 'MARKETPLACE_INCOMING_IDENTITY_UNRESOLVED', incomingCompleteness: 'PARTIAL', recommendedQty: null, provisionalOrderNeed: 888 })]));
  var bodyP = _irRecoSummaryCardBody({ sku: 'CO1100-R' });
  ok(/Partial incoming/.test(bodyP) && /prov\. 888/.test(bodyP) && /MARKETPLACE_INCOMING_IDENTITY_UNRESOLVED/.test(bodyP), 'E2 PARTIAL incoming → blocked + provisional distinctly, canonical qty withheld');
  var apiBlocked = await freshLoad(true, envOk([whLine({ blocked: true, blockedReason: 'DEMAND_ALLOCATION_RULE_NOT_CONFIGURED', recommendedQty: null })]));
  ok(/DEMAND_ALLOCATION_RULE_NOT_CONFIGURED/.test(_irRecoSummaryCardBody({ sku: 'CO1100-R' })), 'E3 missing-rule blocked line surfaces the canonical token');
  var apiShort = await freshLoad(true, envOk([whLine({ recommendedQty: 168, residualShortageQty: 40 })]));
  ok(/Source short by 40/.test(_irRecoSummaryCardBody({ sku: 'CO1100-R' })), 'E4 source-insufficient → recommendedQty + residual shortage (not an error)');
  var apiNoLine = await freshLoad(true, envOk([whLine()]));
  ok(/RECOMMENDATION_LINE_NOT_FOUND/.test(_irRecoSummaryCardBody({ sku: 'OTHER-SKU' })), 'E5 SKU with no line → NOT_FOUND (distinct from zero)');
  var apiErr = await freshLoad(true, envFail('RECOMMENDATION_CALCULATION_MONTH_NOT_CONFIGURED'));
  ok(_irRecoState.status === 'CONFIG_NOT_READY' && /configuration is incomplete/.test(_irRecoSummaryCardBody({ sku: 'CO1100-R' })) && /RECOMMENDATION_CALCULATION_MONTH_NOT_CONFIGURED/.test(_irRecoSummaryCardBody({ sku: 'CO1100-R' })), 'E6 FM2B: missing calc-month → distinct CONFIG_NOT_READY (never a silent fallback)');

  section('F. no internal-context prerequisite / no persistence / no whole-DB / no Context UI');
  var IRRECO_CODE = IRRECO.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');   // strip comments before negative scans
  ok(/toScopeRequest/.test(IRRECO_CODE) && !/toRequestContext/.test(IRRECO_CODE), 'F1 request path uses toScopeRequest (no destination/month/cycle prerequisite)');
  ok(!/createRequestOrderDraft|saveAllocationDraft|appendRow|setValues|persistDraft/i.test(IRRECO_CODE), 'F2 read block has no persistence / write');
  ok(!/getOperationDb|loadOperationDb/.test(IRRECO_CODE), 'F3 read block never triggers a whole-DB reload');
  ok(!/replen-reco-context-panel/.test(JS), 'F4 no reintroduced Recommendation Context UI panel');
  ok(/pagination:\s*\{\s*page:\s*1,\s*size:\s*100\s*\}/.test(IRRECO), 'F5 one bounded page request (size 100)');

  console.log('\n----------------------------------------');
  console.log('REPLEN SCOPE-ONLY CUTOVER (F1-4B-FM1-T): ' + pass + ' passed, ' + fail + ' failed');
  if (fail > 0) { process.exitCode = 1; }
})();
