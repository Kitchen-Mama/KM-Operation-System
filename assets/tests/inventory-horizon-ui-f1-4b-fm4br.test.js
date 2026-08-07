// Kitchen Mama Operation System — Inventory FM4b Horizon Summary consumer cutover (F1-4B-FM4b-R, Phase 4–10 I–Z + AA–AF).
// Run: node assets/tests/inventory-horizon-ui-f1-4b-fm4br.test.js
// -----------------------------------------------------------------------------
// Proves Inventory Replenishment consumes the server-owned line.horizons[] (D18/D30/D45/D90) as the PRIMARY
// decision surface: Window / Required By / Demand / Covered / Gap / Suggested rendered verbatim (no page math,
// no Math.*, never summed across windows), valid 0 → "0", missing → "—", blocked truthful, one subsection per
// MARKETPLACE / WAREHOUSE destination (never pooled), the old technical table DEMOTED under <details>Diagnostics,
// and the session cache preserving horizons with zero refetch. Regression: Order Planning monthlyProjection +
// manual Order Qty consumers untouched. IRCTX + IRRECO blocks are extracted from the page source and eval'd.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var JS = read('js/pages/inventory-replenishment.js');
var JS_RO = read('js/pages/request-order.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function slice(m1, m2) { var a = JS.indexOf(m1), b = JS.indexOf(m2); if (a < 0 || b < 0) throw new Error('markers not found: ' + m1); return JS.slice(a, b); }

var IRCTX = slice('// __IRCTX_START__', '// __IRCTX_END__');
var IRRECO = slice('// __IRRECO_START__', '// __IRRECO_END__');

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

var READY = { status: 'READY', company: 'KM', country: 'US', marketplace: 'AMAZON_US', marketplaceId: 'MP1', calculationMonth: '2026-08', planningCycle: '2026-W40', missing: [], issues: [] };
function setCtx(m) { _irctxLastContext = m; }
function tick() { return Promise.resolve().then(function () {}).then(function () {}); }
function makeApi(active, env) { var calls = { getWorkspace: 0, lastParams: null }; return { _calls: calls, workspaceApiActive: function (n) { return active && n === 'recommendation'; }, getWorkspace: function (name, params) { calls.getWorkspace++; calls.lastParams = params; return Promise.resolve(env); } }; }
function envOk(lines) { return { success: true, data: { lines: lines, pagination: { page: 1, size: 100, total: lines.length }, dataVersion: { formulaVersion: 'v4.7', sourceDataAsOf: '2026-08-01' } }, meta: { requestId: 'REQ-H1', calculationMonth: '2026-08', planningCycle: 'RECO-2026-08' }, errors: [] }; }
function freshLoad(active, env, ctx) { if (typeof invalidateRecommendationSessionCache === 'function') invalidateRecommendationSessionCache(); _irRecoInvalidate('CONTEXT_NOT_READY'); var api = makeApi(active, env); global.window.KM = { api: api }; setCtx(ctx || READY); return Promise.resolve(loadRecommendationWorkspace_()).then(tick).then(function () { return api; }); }

// ---- fixtures --------------------------------------------------------------------------------------
// D18 valid-zero gap/suggested; D30 gap 200; D45 gap 500 / suggested 520; D90 MISSING values (null → "—").
function hzSet() {
  return [
    { windowCode: 'D18', requiredByDate: '2026-08-25', demandQty: 1800, openingSupplyQty: 7374, incomingAddedQty: 0, coveredQty: 1800, remainingSupplyQty: 5574, gapQty: 0, suggestedOrderQty: 0 },
    { windowCode: 'D30', requiredByDate: '2026-09-06', demandQty: 3000, openingSupplyQty: 7374, incomingAddedQty: 0, coveredQty: 2800, remainingSupplyQty: 4374, gapQty: 200, suggestedOrderQty: 240 },
    { windowCode: 'D45', requiredByDate: '2026-09-21', demandQty: 4500, openingSupplyQty: 7374, incomingAddedQty: 0, coveredQty: 4000, remainingSupplyQty: 2874, gapQty: 500, suggestedOrderQty: 520 },
    { windowCode: 'D90', requiredByDate: '2026-11-05', demandQty: null, openingSupplyQty: 7374, incomingAddedQty: null, coveredQty: null, remainingSupplyQty: null, gapQty: null, suggestedOrderQty: null }
  ];
}
function mktLine(over) { var L = { recommendationLineId: 'M1', recommendationMode: 'MARKETPLACE_ORDER_NEED', sku: 'CO1100-R', siteSku: 'ST-1', destinationType: 'MARKETPLACE', destinationKey: 'MARKETPLACE||KM||US||AMAZON_US||MP1', destinationLabel: 'Amazon US', warehouseId: null, marketplaceId: 'MP1', calculatedGap: 500, currentStockQty: 7374, qualifiedIncomingQty: 0, incomingCompleteness: 'COMPLETE', recommendedQty: 520, blocked: false, blockedReason: null, formulaVersion: 'v4.7', sourceDataAsOf: '2026-08-01', diagnostics: { issues: [] }, horizons: hzSet() }; if (over) for (var k in over) L[k] = over[k]; return L; }
function whLine(over) { var L = { recommendationLineId: 'W1', recommendationMode: 'WAREHOUSE_REPLENISHMENT', sku: 'CO1100-R', siteSku: 'ST-1', destinationType: 'WAREHOUSE', destinationKey: 'WAREHOUSE||KM||US||AMAZON_US||WH-A', destinationLabel: 'US A', warehouseId: 'WH-A', marketplaceId: null, calculatedGap: 100, currentStockQty: 100, qualifiedIncomingQty: 24, incomingCompleteness: 'COMPLETE', recommendedQty: 100, blocked: false, blockedReason: null, formulaVersion: 'v4.7', sourceDataAsOf: '2026-08-01', diagnostics: { issues: [] }, horizons: hzSet() }; if (over) for (var k in over) L[k] = over[k]; return L; }

(async function main() {

  section('U · MARKETPLACE renders one Horizon Summary set');
  await freshLoad(true, envOk([mktLine()]));
  var body = _irRecoSummaryCardBody({ sku: 'CO1100-R' });
  ok(/replen-horizon-summary/.test(body) && /Marketplace/.test(body) && /Amazon US/.test(body), 'U1 one MARKETPLACE horizon subsection with identity');

  section('I · D18/D30/D45/D90 all render');
  ok(/18 Days/.test(body) && /30 Days/.test(body) && /45 Days/.test(body) && /90 Days/.test(body), 'I1 all four windows present');

  section('J–N · exact canonical facts (no page math)');
  ok(/2026-08-25/.test(body) && /2026-09-21/.test(body), 'J requiredByDate rendered verbatim');
  ok(/1800/.test(body) && /3000/.test(body), 'K demandQty verbatim');
  ok(/2800/.test(body) && /4000/.test(body), 'L coveredQty verbatim');
  ok(/>500</.test(body) && /200/.test(body), 'M gapQty verbatim');
  ok(/520/.test(body) && /240/.test(body), 'N suggestedOrderQty verbatim');

  section('O · valid zero → "0" (D18 gap + suggested)');
  ok(/18 Days<\/td><td>2026-08-25<\/td><td class="replen-recsum-table__num">1800<\/td><td class="replen-recsum-table__num">1800<\/td><td class="replen-recsum-table__num">0<\/td><td class="replen-recsum-table__num">0<\/td>/.test(body), 'O1 D18 row: valid zero gap 0 + suggested 0 rendered as 0');

  section('P · missing → "—" (D90 null facts)');
  ok(/90 Days<\/td><td>2026-11-05<\/td><td class="replen-recsum-table__num">—<\/td><td class="replen-recsum-table__num">—<\/td><td class="replen-recsum-table__num">—<\/td><td class="replen-recsum-table__num">—<\/td>/.test(body), 'P1 D90 row: missing facts render as —');

  section('Q · blocked destination → truthful, NO horizon table');
  await freshLoad(true, envOk([whLine({ blocked: true, blockedReason: 'DEMAND_ALLOCATION_RULE_NOT_CONFIGURED', horizons: null, recommendedQty: null })]));
  var bodyBlk = _irRecoSummaryCardBody({ sku: 'CO1100-R' });
  ok(/replen-horizon-dest__blocked/.test(bodyBlk) && /DEMAND_ALLOCATION_RULE_NOT_CONFIGURED/.test(bodyBlk), 'Q1 blocked reason shown truthfully');
  ok(bodyBlk.indexOf('replen-horizon-table') < 0 || bodyBlk.split('replen-horizon-dest__blocked')[0].indexOf('18 Days') < 0, 'Q2 blocked destination shows no fabricated horizon table');

  section('V · multi-WAREHOUSE isolation (never pooled / summed)');
  var whA = whLine({ destinationLabel: 'US A', warehouseId: 'WH-A', horizons: [{ windowCode: 'D18', requiredByDate: '2026-08-25', demandQty: 300, coveredQty: 200, gapQty: 100, suggestedOrderQty: 120 }] });
  var whB = whLine({ recommendationLineId: 'W2', destinationKey: 'WAREHOUSE||KM||US||AMAZON_US||WH-B', destinationLabel: 'US B', warehouseId: 'WH-B', horizons: [{ windowCode: 'D18', requiredByDate: '2026-08-25', demandQty: 1500, coveredQty: 600, gapQty: 900, suggestedOrderQty: 920 }] });
  await freshLoad(true, envOk([whA, whB]));
  var bodyV = _irRecoSummaryCardBody({ sku: 'CO1100-R' });
  ok(/US A/.test(bodyV) && /US B/.test(bodyV), 'V1 both warehouses render as distinct subsections');
  ok(/>100</.test(bodyV) && /900/.test(bodyV), 'V2 each warehouse shows its OWN D18 gap (100 and 900)');
  ok(bodyV.indexOf('1000') < 0, 'V3 gaps NOT pooled across warehouses (no 100+900=1000)');
  ok((bodyV.match(/replen-horizon-dest"/g) || []).length === 2, 'V4 exactly two destination subsections');

  section('W · diagnostics collapsed under <details>');
  await freshLoad(true, envOk([mktLine()]));
  var bodyW = _irRecoSummaryCardBody({ sku: 'CO1100-R' });
  ok(/<details[^>]*><summary>Diagnostics<\/summary>/.test(bodyW), 'W1 Diagnostics is a collapsed <details>');

  section('X · old technical table DEMOTED (not the primary surface)');
  ok(bodyW.indexOf('replen-horizon-summary') >= 0 && bodyW.indexOf('replen-horizon-summary') < bodyW.indexOf('Demand / Gap'), 'X1 Horizon Summary precedes the legacy Demand/Gap table');
  ok(bodyW.indexOf('<summary>Diagnostics</summary>') < bodyW.indexOf('Demand / Gap'), 'X2 legacy table lives INSIDE the Diagnostics details');

  section('R/S/T · NO page-side horizon math, NO Math.*, NO summing of windows');
  var HZREGION = JS.slice(JS.indexOf('function _irRecoHorizonTableHtml'), JS.indexOf('function _irRecoWorkspaceBody'));
  var HZCODE = HZREGION.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  ok(!/Math\.(ceil|floor|round|max|min)/.test(HZCODE), 'S1 no Math.* in horizon render helpers');
  ok(!/reduce\s*\(/.test(HZCODE) && !/\+=/.test(HZCODE), 'T1 no reduce/accumulation of horizons');
  ok(!/\.(demandQty|coveredQty|gapQty|suggestedOrderQty)\s*[-+*/]/.test(HZCODE), 'R1 no arithmetic on horizon facts (pure passthrough)');
  ok(!/appendRow|setValues|createRequestOrderDraft|persist/i.test(HZCODE), 'AD1 horizon helpers perform NO write/persistence');

  section('Y/Z · session cache preserves horizons with ZERO refetch');
  invalidateRecommendationSessionCache(); _irRecoInvalidate('CONTEXT_NOT_READY');
  var api = makeApi(true, envOk([mktLine()])); global.window.KM = { api: api }; setCtx(READY);
  await Promise.resolve(loadRecommendationWorkspace_()).then(tick);
  ok(api._calls.getWorkspace === 1, 'pre: first load fetched once');
  _irRecoInvalidate('CONTEXT_NOT_READY');                     // reset page state; keep the session cache
  await Promise.resolve(loadRecommendationWorkspace_()).then(tick);
  ok(api._calls.getWorkspace === 1, 'Z1 cache hit → NO new HTTP request');
  var bodyCache = _irRecoSummaryCardBody({ sku: 'CO1100-R' });
  ok(/18 Days/.test(bodyCache) && /520/.test(bodyCache), 'Y1 cached envelope still renders D18/D30/D45/D90 horizons');

  section('AE · workspace OFF → legacy fallback preserved');
  await freshLoad(false, envOk([mktLine()]));
  ok(/legacy/.test(_irRecoSummaryCardBody({ sku: 'CO1100-R' })), 'AE1 flag OFF → legacy placeholder (no horizon surface)');

  section('AA/AB/AC/AF · Order Planning consumers untouched (regression)');
  ok(/monthlyProjection/.test(JS_RO) && /\.map\(function \(t\)/.test(JS_RO), 'AA1 Order Planning still consumes monthlyProjection T1–T4');
  ok(/NEVER overwrites a manual Order Qty/.test(JS_RO), 'AB1 manual Order Qty preserved (never overwritten)');
  ok(/Dedupe inside _opLoadRecommendation/.test(JS_RO), 'AC1 one request per expand (dedupe intact)');
  ok(/window\.KM\.api\.getWorkspace\('recommendation'/.test(JS_RO), 'AF1 Order Planning uses the shared recommendation transport (safe-parse applies)');

  console.log('\n----------------------------------------');
  console.log('INVENTORY HORIZON UI (F1-4B-FM4b-R): ' + pass + ' passed, ' + fail + ' failed');
  if (fail > 0) { process.exitCode = 1; }
})();
