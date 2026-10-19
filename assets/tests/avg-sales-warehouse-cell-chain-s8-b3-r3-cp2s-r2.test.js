// Kitchen Mama Operation System - S8-B3-R3-CP2S-R2
// THE WHOLE CHAIN, RUN: real expander -> real envelope mapping -> real picker -> the actual cell.
//
// Run: node assets/tests/avg-sales-warehouse-cell-chain-s8-b3-r3-cp2s-r2.test.js
//
// LOCAL / OFFLINE. No network, no DB, no writes.
//
// WHY THIS SUITE EXISTS. CP2S-R1 reported that all four destination/demand combinations carry a
// historical average. That was proved at TWO boundaries - the server's basis builder and the page's
// response mapper - with a third one in between that nobody ran: `_irCanonicalSalesBasis_`, the picker
// the row actually reads. It accepts a line only when `destinationType === 'MARKETPLACE'`, so every
// warehouse basis the previous round added was mapped correctly into page state and then dropped one
// call before the cell. The report said "the chain is complete". The chain was two thirds of a chain.
//
// It is worse than a no-op, and running it is how that became visible. `_irRecoHasCanonicalBasis_()`
// scans the SAME lines without the destination filter, so it answers TRUE: the refresh fires, the
// in-place updater runs, and it repaints the cells with the placeholder they already had. The page
// does work, concludes nothing, and prints the dash that means "no sales".
//
// So this suite does not assert against source text at any point. It builds a fixture, runs the REAL
// `recoWsExpandWarehouse_` (with the REAL KMCALC, KMDA and KMDR owners), takes the lines it returns,
// feeds them through the REAL `_irRecoApplyEnvelope`, asks the REAL picker, and reads the REAL cell
// that `_irRecoUpdateVelocityCells_` writes. Every section below failed on d6651700/cb3efc7b.
// NOTE: no 'use strict' - the shipped IRRECO region is eval'd into MODULE scope, and a strict eval
// keeps its declarations to itself. The repo's other region-extracting suites carry the same note.
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var ROOT = path.join(__dirname, '..', '..');

var passed = 0, failed = 0;
function ok(c, m, d) { if (c) { passed++; console.log('ok   ' + m); } else { failed++; console.log('FAIL ' + m + (d === undefined ? '' : '\n       got ' + JSON.stringify(d))); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }

var IRSRC = fs.readFileSync(path.join(ROOT, 'assets/js/pages/inventory-replenishment.js'), 'utf8');
var RECO = fs.readFileSync(path.join(ROOT, 'assets/specs/active/apps-script/42_api_v1_recommendation_workspace.gs'), 'utf8').replace(/\r\n/g, '\n');

// ---------------------------------------------------------------------------------------------------
// THE SERVER SANDBOX - the real 42_, with the real frozen owners.
// ---------------------------------------------------------------------------------------------------
// KMCALC, KMDA and KMDR are the actual shipped modules, so the rate below is computed by the frozen
// §22 owner rather than declared by this file. Only KMPA/KMPS/KMPCX are stubs: they assemble the
// production source, which this suite deliberately blocks - a warehouse whose runtime will not
// assemble is one of the two states the round is about, and the sales history must survive it.
var KMCALC = require(path.join(ROOT, 'assets/js/core/supply-planning-calculations.js'));
var KMDA = require(path.join(ROOT, 'assets/js/core/supply-planning-demand-allocation.js'));
var KMDR = require(path.join(ROOT, 'assets/js/core/supply-planning-destination-runtime.js'));

var srvBox = {
  console: console, KMCALC: KMCALC, KMDA: KMDA, KMDR: KMDR,
  KMPA: { assembleProductionRecommendationFacts: function () { return { ready: false, issues: [{ code: 'RECOMMENDATION_RUNTIME_BLOCKED', message: 'runtime blocked (fixture)' }] }; } },
  KMPS: { buildProductionRecommendationSource: function () { return { ready: false, issues: [] }; } },
  KMPCX: { _forecastWeightMonths: function () { return ['2026-10']; } }
};
var srvCtx = vm.createContext(srvBox);
vm.runInContext(RECO, srvCtx);

function snap(headers, rows) { return { headers: headers, rows: rows }; }
var SKU = 'CO1150-AG';
var SCOPE = { company: 'KM', country: 'US', marketplace: 'Amazon', marketplaceId: 'MKT-1' };
var CALC = { calculationDate: '2026-10-15', calculationMonth: '2026-10', planningCycle: 'W1' };
var VMETA = { formulaVersion: 'v1', sourceDataAsOf: '2026-10-15' };

// 30 dated rows at 10 units + 2 undated rows. The undated pair is the CP2S skip: it must not delete the
// 30 that have a date, and its count must still arrive at the page.
function dailyRows(units) {
  var r = [];
  for (var d = 1; d <= 30; d++) r.push(['2026-09-' + ('0' + d).slice(-2), SKU, 'US', 'Amazon', 'AMZ', units]);
  r.push(['', SKU, 'US', 'Amazon', 'AMZ', 99]);
  r.push(['', SKU, 'US', 'Amazon', 'AMZ', 99]);
  return r;
}
function baseSnapshots(units, model) {
  return {
    amazonDailySalesSnapshot: snap(['snapshot_date', 'sku', 'country', 'marketplace', 'channel', 'sales_units'], dailyRows(units)),
    amazonWeeklySalesSnapshot: snap(['week_end_date', 'sku', 'country', 'marketplace', 'channel', 'sales_units_7d'], []),
    marketplaceSkus: snap(['sku', 'company', 'country', 'marketplace', 'marketplace_sku_id', 'replenishment_model', 'site_sku'],
      [[SKU, 'KM', 'US', 'Amazon', 'MSKU-1', model || 'sales_driven', 'SS-1']]),
    marketplaces: snap(['company', 'country', 'marketplace', 'marketplace_id'], [['KM', 'US', 'Amazon', 'MKT-1']]),
    campaigns: snap(['campaign_id'], []), campaignSkuLines: snap(['campaign_id'], []),
    fcSpecialEvents: snap(['company'], []), fcRegularForecast: snap(['sku'], []),
    fcTargetRules: snap(['company'], []), skuDetails: snap(['sku', 'units_per_carton'], [[SKU, 12]])
  };
}
var RULE_HEADERS = ['company', 'country', 'marketplace', 'destination_warehouse_id', 'status', 'forecast_allocation_ratio', 'sales_allocation_ratio', 'effective_from', 'effective_to'];
function expandWarehouse(snapshots) {
  srvBox.__read = { snapshots: snapshots };
  return vm.runInContext('recoWsExpandWarehouse_(__read, null, ' + JSON.stringify(SCOPE) + ', ' + JSON.stringify(SKU)
    + ', "SS-1", ' + JSON.stringify(CALC) + ', ' + JSON.stringify(VMETA) + ')', srvCtx);
}

// ---------------------------------------------------------------------------------------------------
section('A  a warehouse whose ALLOCATION RULES are not configured still has a sales history');
// ---------------------------------------------------------------------------------------------------
// The ruleset gate is an EARLY RETURN that fires before the resolver is ever called, so the post-loop
// attachment CP2S-R1 added cannot reach it. The comment above that attachment already claimed "a
// ruleset that would not assemble ... is not a reason to withhold the site SKU's sales history" - the
// code returned four lines above it. A comment is not an implementation.
var sA = baseSnapshots(10);
sA.warehouses = snap(['warehouse_id', 'company', 'is_active'], []);
sA.replenishmentDemandAllocationRules = snap(RULE_HEADERS, []);
var A = expandWarehouse(sA);

eq(A.lines.length, 1, 'A1  the lane still answers with one blocked line');
eq(A.lines[0].blockedReason, 'DEMAND_ALLOCATION_RULE_NOT_CONFIGURED', 'A1a naming the configuration problem');
ok(A.lines[0].horizonBasis != null,
  'A2  and it CARRIES the historical basis - a missing allocation rule says nothing about past sales',
  A.lines[0].horizonBasis);
eq(A.lines[0].horizonBasis && A.lines[0].horizonBasis.avgSalesPerDay, 10,
  'A2a the rate the frozen owner computed from the 30 dated rows');
eq(A.lines[0].horizonBasis && A.lines[0].horizonBasis.blankDateRows, 2,
  'A2b and the undated rows it skipped to get there');

// ---------------------------------------------------------------------------------------------------
section('B  two warehouses, ONE basis - never summed, never averaged');
// ---------------------------------------------------------------------------------------------------
var sB = baseSnapshots(10);
sB.warehouses = snap(['warehouse_id', 'company', 'is_active', 'warehouse_code', 'warehouse_name'],
  [['WH-A', 'KM', true, 'A', 'Alpha'], ['WH-B', 'KM', true, 'B', 'Beta']]);
sB.replenishmentDemandAllocationRules = snap(RULE_HEADERS,
  [['KM', 'US', 'Amazon', 'WH-A', 'active', 0.5, 0.5, '2026-01-01', ''],
   ['KM', 'US', 'Amazon', 'WH-B', 'active', 0.5, 0.5, '2026-01-01', '']]);
var B = expandWarehouse(sB);

eq(B.lines.length, 2, 'B1  one line per warehouse');
ok(B.lines[0].horizonBasis === B.lines[1].horizonBasis,
  'B2  both lines carry the SAME OBJECT - one site SKU has one history, not one per warehouse');
eq(B.lines[0].horizonBasis.avgSalesPerDay, 10,
  'B3  and the rate is the site SKU rate, NOT halved across two warehouses');
eq(B.lines[1].horizonBasis.avgSalesPerDay, 10, 'B3a on the second line too');
ok(B.lines[0].blockedReason === 'RECOMMENDATION_RUNTIME_BLOCKED',
  'B4  these lines are BLOCKED by the runtime - and still publish the history');

// a forecast_driven site SKU resolves the same history (the display is not a planning input)
var sBf = baseSnapshots(10, 'forecast_driven');
sBf.warehouses = sB.warehouses; sBf.replenishmentDemandAllocationRules = sB.replenishmentDemandAllocationRules;
var Bf = expandWarehouse(sBf);
eq(Bf.lines[0].horizonBasis.avgSalesPerDay, 10,
  'B5  a forecast_driven WAREHOUSE site still publishes its real historical average');
eq(Bf.lines[0].horizonBasis.demandMode, 'forecast_driven', 'B5a carrying the mode it was built for');

// ---------------------------------------------------------------------------------------------------
section('C  the page: REAL envelope mapping -> REAL picker');
// ---------------------------------------------------------------------------------------------------
var F1A = require('./_f1a-scope-guard.js');
var IRREGION = IRSRC.slice(IRSRC.indexOf('// __IRRECO_START__'), IRSRC.indexOf('// __IRRECO_END__'));

// The host surface the region touches. `document` is replaced per DOM test in section D.
var DOM = { rows: [] };
global.window = { IRContext: { toScopeRequest: function () { return { company: 'KM', country: 'US', marketplace: 'Amazon' }; } }, KM_FLAGS: {} };
global.document = { querySelectorAll: function (sel) { return /scroll-row/.test(sel) ? DOM.rows : []; }, getElementById: function () { return null; } };
global.AbortController = function () { this.signal = {}; this.abort = function () {}; };
var REPLEN_ITEMS = [];
function escapeReplenHtml(s) { return String(s == null ? '' : s); }
function getReplenishmentData() { return REPLEN_ITEMS; }
function updateReplenRecoContext() { return {}; }
function _irRecoRerenderSummaries() {}
function _legacyRecSummaryTableHtml() { return ''; }
function _recSummaryRows() { return ''; }
function _irSearchApplied_() { return true; }
var RENDER_CALLS = 0;
function renderReplenishment() { RENDER_CALLS++; }
// The quality/flag helpers the in-place updater calls live outside the region.
eval(F1A.guardPreamble(IRSRC));
eval(IRSRC.slice(IRSRC.indexOf('var IR_AVG_QUALITY_TEXT'), IRSRC.indexOf('function _irScrollRowHtml_')));
eval(IRREGION);

function applyLines(lines) {
  _irRecoApplyEnvelope({ success: true, data: { lines: lines }, meta: { requestId: 'r1' } },
    'ctx1', { company: 'KM', country: 'US', marketplace: 'Amazon' });
}
applyLines(B.lines);

eq(_irRecoState.status, 'READY', 'C1  the warehouse-only response lands as READY');
eq(_irRecoState.linesBySku[SKU].length, 2, 'C1a with both lines indexed under the SKU');
eq(_irRecoState.linesBySku[SKU][0].horizonBasis.avgSalesPerDay, 10,
  'C1b and the response MAPPING carries the rate - this part CP2S-R1 did prove');

function pickRate2(sku) { var b = _irCanonicalSalesBasis_(sku); return b ? b.avgSalesPerDay : null; }
var picked = _irCanonicalSalesBasis_(SKU);
ok(picked != null,
  'C2  THE PICKER RESOLVES IT - the step between the mapping and the cell, which no suite ran',
  picked);
eq(picked ? picked.avgSalesPerDay : null, 10, 'C2a with the site SKU rate');
eq(picked ? picked.blankDateRows : null, 2, 'C2b and the skipped-row count still attached');

// the gate and the picker must agree about whether an answer exists
ok(_irRecoHasCanonicalBasis_() === (_irCanonicalSalesBasis_(SKU) != null),
  'C3  the repaint gate and the picker agree - a gate that says YES over a picker that says NO '
  + 'repaints the placeholder and calls it an update');

// the ruleset-blocked single line resolves too
applyLines(A.lines);
eq(pickRate2(SKU), 10, 'C4  and so does the line blocked by a missing allocation rule');

// ---------------------------------------------------------------------------------------------------
section('D  the CELL - what the operator actually reads');
// ---------------------------------------------------------------------------------------------------
// _irRecoUpdateVelocityCells_ writes from getReplenishmentData(); the row item's avgDailySales comes
// from the basis through the shipped projection, which is executed here rather than restated. The
// slice is bounded at BOTH ends so it cannot run past the fields it owns.
var PROJ = IRSRC.slice(IRSRC.indexOf("var _avgDisplay = '--';"),
  IRSRC.indexOf('// Forecast breakdown (next 3 months, Target Rule applied)'));
ok(PROJ.length > 200 && PROJ.indexOf('_avgExcluded') > 0, 'D0  the shipped projection slice is bounded and complete');

var IR_DAYS = { daysOfSupply: function (stock, rate) { return (rate == null || rate <= 0) ? null : Math.floor(stock / rate); } };
function projectItem(sku, currentStock) {
  var f = new Function('_irCanonicalSalesBasis_', 'IR', 'mp', 'currentStock', 'Math',
    PROJ + ' return { avgDailySales: _avgDisplay, daysOfSupply: _dosDisplay, avgSalesQualityError: _avgQualityError,'
    + ' avgSalesSource: _avgSource, avgSalesWarning: _avgWarning, avgSalesNormalDayCount: _avgNormalDays };');
  var o = f(_irCanonicalSalesBasis_, IR_DAYS, { sku: sku }, currentStock, Math);
  o.sku = sku; return o;
}
function el(tag, cls) {
  return { tag: tag, className: cls || '', innerHTML: '', textContent: '', value: '', _attrs: {}, children: [],
    setAttribute: function (k, v) { this._attrs[k] = String(v); },
    removeAttribute: function (k) { delete this._attrs[k]; },
    getAttribute: function (k) { return this._attrs[k] === undefined ? null : this._attrs[k]; },
    querySelector: function (sel) {
      var want = sel.replace('.', '');
      for (var i = 0; i < this.children.length; i++) {
        if ((' ' + this.children[i].className + ' ').indexOf(' ' + want + ' ') !== -1) return this.children[i];
      } return null;
    } };
}
function tableRow(sku) {
  var row = el('div', 'scroll-row'); row.setAttribute('data-sku', sku);
  var avg = el('div', 'scroll-cell replen-avg-cell'); avg.innerHTML = '--';
  var dos = el('div', 'scroll-cell replen-dos-cell'); dos.textContent = '--';
  row.children.push(avg, dos);
  return { row: row, avg: avg, dos: dos };
}

applyLines(B.lines);
var R = tableRow(SKU);
DOM.rows = [R.row];
REPLEN_ITEMS = [projectItem(SKU, 500)];
_irRecoUpdateVelocityCells_();

eq(R.avg.innerHTML, '10.0',
  'D1  THE CELL PRINTS THE RATE. A self_fulfilled site is routed to the WAREHOUSE lane, so this cell '
  + 'held the same "--" it holds for a SKU with no sales at all');
eq(R.dos.textContent, '50', 'D1a and Days of Supply is computed from it (500 / 10)');
ok(R.avg.className.indexOf('replen-cell--avg-error') === -1, 'D1b with no error class on a clean basis');

// a NAMED quality error still reaches the cell through the same path
var sD = baseSnapshots(10);
sD.warehouses = sB.warehouses; sD.replenishmentDemandAllocationRules = sB.replenishmentDemandAllocationRules;
sD.marketplaceSkus = snap(['sku', 'company', 'country', 'marketplace', 'marketplace_sku_id', 'replenishment_model', 'site_sku'],
  [[SKU, 'KM', 'US', 'Amazon', 'MSKU-1', 'sales_driven', 'SS-1'],
   [SKU, 'KM', 'US', 'Amazon', 'MSKU-2', 'sales_driven', 'SS-1']]);   // two ids for one scope -> named refusal
var D2 = expandWarehouse(sD);
eq(D2.lines[0].horizonBasis.basisQualityError, 'MARKETPLACE_SKU_AMBIGUOUS',
  'D2  an ambiguous site identity is published as a NAMED error on the warehouse line');
applyLines(D2.lines);
var R2 = tableRow(SKU); DOM.rows = [R2.row]; REPLEN_ITEMS = [projectItem(SKU, 500)];
_irRecoUpdateVelocityCells_();
ok(R2.avg.innerHTML.indexOf('unavailable') !== -1,
  'D2a and the cell says so, instead of the dash that reads as "no sales"', R2.avg.innerHTML);
ok(R2.avg.className.indexOf('replen-cell--avg-error') !== -1, 'D2b with the error class');

// a CONFIRMED ZERO is a rate, and must survive the picker
var sD3 = baseSnapshots(0);
sD3.warehouses = sB.warehouses; sD3.replenishmentDemandAllocationRules = sB.replenishmentDemandAllocationRules;
var D3 = expandWarehouse(sD3);
eq(D3.lines[0].horizonBasis.avgSalesPerDay, 0, 'D3  thirty days of zero sales is a rate of 0, not an absence');
applyLines(D3.lines);
eq(pickRate2(SKU), 0, 'D3a and the picker returns it - a falsy rate is still an answer');
var R3 = tableRow(SKU); DOM.rows = [R3.row]; REPLEN_ITEMS = [projectItem(SKU, 500)];
_irRecoUpdateVelocityCells_();
eq(R3.avg.innerHTML, '0.0', 'D3b the cell prints 0.0 rather than --');

// ---------------------------------------------------------------------------------------------------
section('E  what the picker must NOT do');
// ---------------------------------------------------------------------------------------------------
function pageLine(dest, basis, whId) { return { sku: SKU, destinationType: dest, warehouseId: whId || null, horizonBasis: basis }; }
// Null-safe readers. A picker that returns null is the defect under test, so the suite must REPORT that
// rather than die on the first dereference and hide the sections after it.
function pickRate(sku) { var b = _irCanonicalSalesBasis_(sku); return b ? b.avgSalesPerDay : null; }
function pickErr(sku) { var b = _irCanonicalSalesBasis_(sku); return b ? b.basisQualityError : null; }
function basisOf(rate, err) {
  return { demandMode: 'sales_driven', avgSalesPerDay: (rate === undefined ? null : rate), source: 'normalized_30d',
    warning: '', normalDayCount: 30, excludedDates: [], horizonOpeningQty: null, qualifiedIncomingCount: null,
    blankDateRows: 0, basisQualityError: (err || null), contaminationSource: null };
}
// three warehouses carrying the same fact -> one answer, unchanged
applyLines([pageLine('WAREHOUSE', basisOf(10), 'A'), pageLine('WAREHOUSE', basisOf(10), 'B'), pageLine('WAREHOUSE', basisOf(10), 'C')]);
eq(pickRate(SKU), 10,
  'E1  three warehouses agreeing on 10 resolve to 10 - not 30 (summed) and not 3.33 (averaged)');

// a genuine disagreement is NOT settled by taking the first line
applyLines([pageLine('WAREHOUSE', basisOf(10), 'A'), pageLine('WAREHOUSE', basisOf(999), 'B')]);
var conflict = _irCanonicalSalesBasis_(SKU);
ok(conflict != null, 'E2  a conflict still produces an answer rather than silence', conflict);
eq(conflict ? conflict.avgSalesPerDay : 'NO BASIS', null, 'E2a with NO rate - picking the first would publish one of two numbers as fact');
eq(conflict ? conflict.basisQualityError : 'NO BASIS', 'SALES_BASIS_LINE_CONFLICT', 'E2b and a NAMED reason the operator can act on');

// a line that says NOTHING does not outrank one that says something
applyLines([pageLine('WAREHOUSE', basisOf(undefined), 'A'), pageLine('WAREHOUSE', basisOf(10), 'B')]);
eq(pickRate(SKU), 10,
  'E3  an empty basis is skipped rather than returned - it is not a conflict, it is silence');

// a named error alone is an answer
applyLines([pageLine('WAREHOUSE', basisOf(undefined, 'SALES_BASIS_UNAVAILABLE'), 'A')]);
eq(pickErr(SKU), 'SALES_BASIS_UNAVAILABLE',
  'E4  a basis with only a named error is still an answer');

// MARKETPLACE is unchanged
applyLines([pageLine('MARKETPLACE', basisOf(139.08))]);
eq(pickRate(SKU), 139.08, 'E5  the marketplace lane is untouched');

// the F1A stale-scope guard still refuses
var goodKey = _irRecoState.appliedScopeKey;
_irRecoState.appliedScopeKey = F1A.MISMATCHED_SCOPE_KEY;
eq(_irCanonicalSalesBasis_(SKU), null,
  'E6  a result produced for ANOTHER scope is still refused - the guard was not widened with the picker');
_irRecoState.appliedScopeKey = goodKey;
eq(pickRate(SKU), 139.08, 'E6a and the correctly-stamped twin still resolves');

// ---------------------------------------------------------------------------------------------------
section('F  the skip count survives every failure that happens AFTER it was taken');
// ---------------------------------------------------------------------------------------------------
// blankDates is counted while filtering the daily rows. Every failure returned after that point knows
// the number; returning null there says "not counted", which is a different fact. 0 is a third one, and
// it may only be reported by a scope that actually had none.
function resolveRate(snapshots) {
  srvBox.__snaps = { snapshots: snapshots };   // CP2X-R2 D - the three per-SKU helpers take `read` now, so they can reach the per-request
  // row cache (recoWsRows_). The fixture is the same; it is handed over in the envelope the
  // runtime hands over. A FRESH object per call, so no caching is shared between cases.
  return vm.runInContext('recoWsResolveSalesRate_(__snaps, ' + JSON.stringify(SCOPE) + ', ' + JSON.stringify(SKU) + ', "2026-10-15")', srvCtx);
}
var sF = baseSnapshots(10);
sF.marketplaceSkus = sD.marketplaceSkus;              // ambiguous site identity, AFTER the count
var f1 = resolveRate(sF);
eq(f1.reason, 'MARKETPLACE_SKU_AMBIGUOUS', 'F1  the identity refusal fires');
eq(f1.blankDateRows, 2, 'F1a and still reports the 2 rows it had already skipped');

var sF2 = baseSnapshots(10);                           // two channels -> ambiguous, also after the count
sF2.amazonDailySalesSnapshot.rows.push(['2026-09-15', SKU, 'US', 'Amazon', 'OTHER', 5]);
var f2 = resolveRate(sF2);
eq(f2.reason, 'SALES_BASIS_AMBIGUOUS', 'F2  an ambiguous channel fires');
eq(f2.blankDateRows, 2, 'F2a and carries the count too');

var sF3 = baseSnapshots(10);                           // clean scope: a real zero
sF3.amazonDailySalesSnapshot.rows = sF3.amazonDailySalesSnapshot.rows.filter(function (r) { return r[0] !== ''; });
eq(resolveRate(sF3).blankDateRows, 0, 'F3  a scope with no undated rows reports 0 - it counted, and found none');

// before the count, null is the only honest answer
srvBox.__snaps = { snapshots: baseSnapshots(10) };
var f4 = vm.runInContext('recoWsResolveSalesRate_(__snaps, ' + JSON.stringify(SCOPE) + ', ' + JSON.stringify(SKU) + ', "")', srvCtx);
eq(f4.reason, 'CALCULATION_DATE_NOT_CONFIGURED', 'F4  a failure BEFORE the filter runs');
eq(f4.blankDateRows, undefined, 'F4a reports no count at all - it did not count zero, it did not count');

console.log('\n' + (failed === 0 ? 'PASS' : 'FAIL') + '  ' + passed + ' passed, ' + failed + ' failed');
process.exitCode = failed === 0 ? 0 : 1;
