// Kitchen Mama Operation System — Order Planning Recommendation READ cutover (F1-4B-FM2).
// Run: node assets/tests/order-planning-recommendation-cutover-f1-4b-fm2.test.js
// -----------------------------------------------------------------------------
// Proves the expanded Order Planning row issues ONE scope-only recommendation.workspace.get per expanded
// SKU scope (company/country/marketplace/sku), renders canonical destination lines in the new read-only
// "Recommendation — Order Need" subsection (MARKETPLACE + each WAREHOUSE distinct), distinguishes canonical
// / valid-zero / blocked / partial-provisional / source-short / no-line / unavailable / api-error /
// identity-conflict, dedupes an identical scope, stale-ignores a superseded response, permits an OFF->ON
// request, and keeps Demand Summary demand-only — with NO page formula, NO write, NO Send Request, NO
// per-SKU HTTP loop, NO whole-DB reload. The __OPRECO__ block is extracted from the page source and eval'd.
// NOTE: intentionally NOT strict — extracted top-level declarations must bind into this module scope.

var fs = require('fs');
var path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var JS = read('js/pages/request-order.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function slice(m1, m2) { var a = JS.indexOf(m1), b = JS.indexOf(m2); if (a < 0 || b < 0) throw new Error('markers not found: ' + m1); return JS.slice(a, b); }

var OPRECO = slice('// __OPRECO_START__', '// __OPRECO_END__');
ok(OPRECO.length > 0, 'X0 extraction markers present');

// ---- host-page stubs the extracted block depends on -----------------------------------------------
global.window = {};
global.document = { getElementById: function () { return null; } };
global.AbortController = function () { this.signal = {}; this.abort = function () { this._aborted = true; }; };
function _roEsc(s) { return String(s == null ? '' : s); }
function _roRowKey(item) { return [item.sku || '', item.company != null ? item.company : '', item.country || '', item.marketplace || ''].join('|'); }
function _roPanelId(k) { return 'ro-expand-' + String(k == null ? '' : k).replace(/[^A-Za-z0-9_-]/g, '-'); }
var requestOrderState = { expandedRowKey: null, data: [] };
eval(OPRECO);
ok(typeof _opLoadRecommendation === 'function' && typeof _opRecoEnabled === 'function' && typeof _opRecoSubsectionHtml === 'function' && typeof _opSetRecommendationOptIn === 'function', 'X1 OP read-cutover functions eval OK');

// ---- fakes -----------------------------------------------------------------------------------------
var ITEM = { sku: 'CO1100-R', company: 'KM', country: 'US', marketplace: 'AMAZON_US' };
function makeApi(active, env) {
  var calls = { getWorkspace: 0, lastParams: null, lastName: null };
  return { _calls: calls,
    workspaceApiActive: function (n) { return active && n === 'recommendation'; },
    getWorkspace: function (name, params) { calls.getWorkspace++; calls.lastName = name; calls.lastParams = params; return Promise.resolve(env); } };
}
function envOk(lines, meta) { return { success: true, data: { lines: lines, pagination: { page: 1, size: 100, total: lines.length }, dataVersion: { formulaVersion: 'v4.7', sourceDataAsOf: '2026-08-01' } }, meta: Object.assign({ requestId: 'REQ-R1', calculationMonth: '2026-08', planningCycle: 'RECO-2026-08', sourceReadCount: 1, tablesRead: 12, conflicts: 0 }, meta || {}), errors: [] }; }
function envFail(code) { return { success: false, data: null, meta: { requestId: 'REQ-E1' }, errors: [{ code: code, message: code + ' message', details: null }] }; }
function whLine(over) { var L = { recommendationLineId: 'WAREHOUSE_REPLENISHMENT|KM|US|AMAZON_US|CO1100-R||WAREHOUSE||KM||US||AMAZON_US||WH-A', recommendationMode: 'WAREHOUSE_REPLENISHMENT', sku: 'CO1100-R', siteSku: null, destinationType: 'WAREHOUSE', destinationKey: 'WAREHOUSE||KM||US||AMAZON_US||WH-A', destinationLabel: 'US A', warehouseId: 'WH-A', marketplaceId: null, allocatedForecastQty: 300, currentStockQty: 100, qualifiedIncomingQty: 24, incomingCompleteness: 'COMPLETE', calculatedGap: 176, allocatedSupplyQty: 500, recommendedQty: 168, provisionalOrderNeed: null, residualShortageQty: 8, blocked: false, blockedReason: null, formulaVersion: 'v4.7', sourceDataAsOf: '2026-08-01', diagnostics: { issues: [] } }; if (over) for (var k in over) L[k] = over[k]; return L; }
function mktLine(over) { var L = { recommendationLineId: 'MARKETPLACE_ORDER_NEED|KM|US|AMAZON_US|CO1100-R||MARKETPLACE||KM||US||AMAZON_US||MP1', recommendationMode: 'MARKETPLACE_ORDER_NEED', sku: 'CO1100-R', siteSku: null, destinationType: 'MARKETPLACE', destinationKey: 'MARKETPLACE||KM||US||AMAZON_US||MP1', destinationLabel: 'Amazon US', warehouseId: null, marketplaceId: 'MP1', allocatedForecastQty: 1000, currentStockQty: 120, qualifiedIncomingQty: 0, incomingCompleteness: 'COMPLETE', calculatedGap: 880, allocatedSupplyQty: null, recommendedQty: 888, provisionalOrderNeed: 888, residualShortageQty: null, blocked: false, blockedReason: null, formulaVersion: 'v4.7', sourceDataAsOf: '2026-08-01', diagnostics: { issues: [] } }; if (over) for (var k in over) L[k] = over[k]; return L; }
function tick() { return Promise.resolve().then(function () {}).then(function () {}); }
function freshLoad(active, optIn, env, item) { _opRecoInvalidate('DISABLED'); _opSetRecommendationOptIn(optIn); var api = makeApi(active, env); global.window.KM = { api: api }; return Promise.resolve(_opLoadRecommendation(item || ITEM)).then(tick).then(function () { return api; }); }

(async function main() {
  section('A. feature gate (BOTH flags) — default OFF preserves legacy panel');
  ok(_opRecoEnabled() === false, 'A1 default OFF (opt-in false)');
  global.window.KM = { api: makeApi(true, envOk([whLine()])) };
  ok(_opRecoEnabled() === false, 'A2 workspace active but page opt-in OFF → still disabled');
  ok(_opRecoSubsectionHtml(ITEM) === '', 'A3 disabled → subsection omitted (legacy panel byte-unchanged)');
  _opSetRecommendationOptIn(true);
  ok(_opRecoEnabled() === true, 'A4 workspace active + opt-in ON → enabled');
  _opSetRecommendationOptIn(false);
  global.window.KM = { api: makeApi(false, envOk([whLine()])) };
  _opSetRecommendationOptIn(true);
  ok(_opRecoEnabled() === false, 'A5 opt-in ON but workspace inactive → still disabled (workspace flag authoritative)');

  section('B. flags ON + valid scope → ONE scope-only request, correct shape');
  var apiB = await freshLoad(true, true, envOk([whLine()]));
  ok(apiB._calls.getWorkspace === 1, 'B1 exactly one request per expanded scope');
  ok(apiB._calls.lastName === 'recommendation', 'B2 targets the recommendation workspace');
  var pr = apiB._calls.lastParams;
  ok(pr.scope.company === 'KM' && pr.scope.country === 'US' && pr.scope.marketplace === 'AMAZON_US' && pr.scope.sku === 'CO1100-R', 'B3 request carries company/country/marketplace/sku');
  ok(!('destinationWarehouseId' in pr) && !('calculationMonth' in pr) && !('planningCycle' in pr), 'B4 scope-only: NO destinationWarehouseId / calculationMonth / planningCycle');
  ok(pr.pagination.size === 100 && pr.pagination.page === 1, 'B5 one bounded page (size 100)');
  ok(pr.include.diagnostics === true, 'B6 include.diagnostics true');
  ok(pr.filters.sku === 'CO1100-R', 'B7 filters.sku scopes the server read to this SKU');
  ok(_opRecoState.status === 'READY' && _opRecoState.calcMonth === '2026-08' && _opRecoState.planningCycle === 'RECO-2026-08', 'B8 server-owned calc month/cycle surfaced from meta');

  section('C. OFF→ON permitted; invalid scope; dedupe; stale-ignore');
  await freshLoad(true, false, envOk([whLine()]));           // disabled render first
  var apiC = makeApi(true, envOk([whLine()])); global.window.KM = { api: apiC };
  _opSetRecommendationOptIn(true);
  await Promise.resolve(_opLoadRecommendation(ITEM)).then(tick);
  ok(apiC._calls.getWorkspace === 1, 'C1 OFF→ON permits a fresh request (prior DISABLED does not suppress)');
  var apiNo = await freshLoad(true, true, envOk([whLine()]), { sku: 'CO1100-R', company: '', country: 'US', marketplace: 'AMAZON_US' });
  ok(apiNo._calls.getWorkspace === 0 && _opRecoState.status === 'CONTEXT_NOT_READY', 'C2 incomplete scope (no company) → no request, CONTEXT_NOT_READY');
  var apiDup = await freshLoad(true, true, envOk([whLine()]));
  _opLoadRecommendation(ITEM); await tick();
  ok(apiDup._calls.getWorkspace === 1, 'C3 identical scope re-expand → deduped (no duplicate request)');
  _opRecoInvalidate('DISABLED'); _opSetRecommendationOptIn(true);
  var apiSlow = makeApi(true, envOk([whLine()])); global.window.KM = { api: apiSlow };
  var p1 = _opLoadRecommendation(ITEM);
  var p2 = _opLoadRecommendation({ sku: 'CO1100-R', company: 'KM', country: 'US', marketplace: 'WALMART_US' });
  await Promise.all([Promise.resolve(p1), Promise.resolve(p2)]).then(tick);
  ok(_opRecoState.scopeKey === _opRecoKey(_opRecoScopeFor({ sku: 'CO1100-R', company: 'KM', country: 'US', marketplace: 'WALMART_US' })), 'C4 scope change → latest wins (prior response stale-ignored)');

  section('D. per-destination rendering (MARKETPLACE + multiple WAREHOUSE, identity preserved)');
  var whB = whLine({ recommendationLineId: 'W|B', destinationKey: 'WAREHOUSE||KM||US||AMAZON_US||WH-B', destinationLabel: 'US B', warehouseId: 'WH-B', allocatedForecastQty: 700, recommendedQty: 456, residualShortageQty: 0 });
  await freshLoad(true, true, envOk([whLine(), whB]));
  var bodyD = _opRecoSubsectionHtml(ITEM);
  ok(/Recommendation — Order Need/.test(bodyD), 'D1 subsection titled "Recommendation — Order Need"');
  ok(/US A/.test(bodyD) && /US B/.test(bodyD), 'D2 two WAREHOUSE destinations render as distinct rows');
  ok((bodyD.match(/Warehouse Replenishment/g) || []).length === 2, 'D3 both rows labeled Warehouse Replenishment');
  ok(/168/.test(bodyD) && /456/.test(bodyD), 'D4 each warehouse shows its OWN recommendedQty (never merged into one total)');
  await freshLoad(true, true, envOk([mktLine()]));
  var bodyM = _opRecoSubsectionHtml(ITEM);
  ok(/Marketplace Order Need/.test(bodyM) && /Amazon US/.test(bodyM) && /888/.test(bodyM), 'D5 MARKETPLACE line renders order-need with marketplace label (warehouseId null tolerated)');

  section('E. truthful states — zero / blocked / partial-provisional / source-short / unavailable / no-line / error / identity-conflict');
  await freshLoad(true, true, envOk([whLine({ recommendedQty: 0, residualShortageQty: 0 })]));
  ok(/No order needed/.test(_opRecoSubsectionHtml(ITEM)), 'E1 valid zero → "No order needed" (distinct from missing)');
  await freshLoad(true, true, envOk([mktLine({ blocked: true, blockedReason: 'MARKETPLACE_INCOMING_IDENTITY_UNRESOLVED', incomingCompleteness: 'PARTIAL', recommendedQty: null, provisionalOrderNeed: 888 })]));
  var bodyP = _opRecoSubsectionHtml(ITEM);
  ok(/Partial incoming/.test(bodyP) && /prov\. 888/.test(bodyP) && /MARKETPLACE_INCOMING_IDENTITY_UNRESOLVED/.test(bodyP), 'E2 PARTIAL incoming → blocked + provisional distinctly; canonical qty withheld');
  await freshLoad(true, true, envOk([whLine({ blocked: true, blockedReason: 'DEMAND_ALLOCATION_RULE_NOT_CONFIGURED', recommendedQty: null })]));
  ok(/DEMAND_ALLOCATION_RULE_NOT_CONFIGURED/.test(_opRecoSubsectionHtml(ITEM)), 'E3 missing-rule blocked line surfaces the canonical token');
  await freshLoad(true, true, envOk([whLine({ recommendedQty: 168, residualShortageQty: 40 })]));
  ok(/Source short by 40/.test(_opRecoSubsectionHtml(ITEM)), 'E4 source-insufficient → recommendedQty + residual shortage (not an API error)');
  await freshLoad(true, true, envOk([whLine({ blocked: false, recommendedQty: null, residualShortageQty: null })]));
  ok(/Unavailable/.test(_opRecoSubsectionHtml(ITEM)), 'E5 missing runtime output (recommendedQty null, not blocked) → Unavailable (never recomputed in browser)');
  await freshLoad(true, true, envOk([]));
  ok(/EMPTY/.test(_opRecoSubsectionHtml(ITEM)), 'E6 no lines at all → EMPTY');
  await freshLoad(true, true, envOk([whLine({ sku: 'OTHER-SKU' })]));
  ok(/RECOMMENDATION_LINE_NOT_FOUND/.test(_opRecoSubsectionHtml(ITEM)), 'E7 line(s) present but none for this SKU → NOT_FOUND (distinct from EMPTY/zero)');
  await freshLoad(true, true, envFail('RECOMMENDATION_CALCULATION_MONTH_NOT_CONFIGURED'));
  ok(_opRecoState.status === 'API_ERROR' && /RECOMMENDATION_CALCULATION_MONTH_NOT_CONFIGURED/.test(_opRecoSubsectionHtml(ITEM)), 'E8 server error surfaces (no silent fallback)');
  await freshLoad(true, true, envOk([whLine()], { conflicts: 2 }));
  ok(/RECOMMENDATION_LINE_IDENTITY_CONFLICT/.test(_opRecoSubsectionHtml(ITEM)), 'E9 meta.conflicts>0 → identity-conflict surfaced');

  section('F. semantic boundary + safety (source scans on the extracted block / page)');
  var CODE = OPRECO.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');   // strip comments before negative scans
  ok(/renderExpandPanel[\s\S]*_opRecoSubsectionHtml\(item\)/.test(JS), 'F1 subsection wired into the expanded panel (Block 3)');
  ok(/function _roDemandForMonth/.test(JS) && /Demand Summary/.test(JS), 'F2 Demand Summary (demand-only) left intact');
  ok(!/allocEdits|orderQty|_roEffectiveOrderQty|_roTierSuggested/.test(CODE), 'F3 read block never touches the manual Order Qty / Suggested inputs');
  ok(!/appendRow|setValues|createRequestOrder|submitRequestOrder|Send Request|confirmSite|persist/i.test(CODE), 'F4 no write / Send Request / Confirm Site / persistence in the read block');
  ok(!/getOperationDb|loadOperationDb/.test(CODE), 'F5 read block never triggers a whole-DB reload');
  ok(!/Math\.(ceil|floor|round)|calculateGap|calculateSuggested|\/\s*upc|boxSize/.test(CODE), 'F6 no page-side recommendation formula (values are passed through, never computed)');
  ok(/pagination:\s*\{\s*page:\s*1,\s*size:\s*100\s*\}/.test(OPRECO), 'F7 one bounded page request (size 100) — no per-SKU/per-destination HTTP loop');
  ok(/_opRecoOptIn\s*=\s*false/.test(OPRECO), 'F8 page opt-in defaults false');

  console.log('\n----------------------------------------');
  console.log('ORDER PLANNING RECOMMENDATION CUTOVER (F1-4B-FM2): ' + pass + ' passed, ' + fail + ' failed');
  if (fail > 0) { process.exitCode = 1; }
})();
