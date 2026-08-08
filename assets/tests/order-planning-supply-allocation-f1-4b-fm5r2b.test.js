// Kitchen Mama Operation System — Order Planning MONTHLY supply-allocation runtime integration (F1-4B-FM5-R2b).
// Run: node assets/tests/order-planning-supply-allocation-f1-4b-fm5r2b.test.js
// -----------------------------------------------------------------------------
// Proves the FROZEN KMMSA marketplace-receiver allocation contract is wired END-TO-END for Order Planning ONLY:
//   canonical source facts → lineage-net Overseas (per-country THREE_PL) / Factory (company-wide FACTORY_SHARED)
//   pools → SKU-specific competing marketplace receivers → KMMSA (conserved) → composed opening supply
//   (Site + allocated Overseas + allocated Factory) → KMTPP T1–T4 → order_planning_gap UPSERT → materialized read.
// Overseas + Factory are INDEPENDENT pools, INDEPENDENTLY conserved. Site Stock owner + Inventory D18/D30/D45/D90
// are UNCHANGED (additive: absent allocation → opening == Site Stock). Lineage-net BY SOURCE CONSTRUCTION (only the
// current-stock snapshots enter the pool; shipments stay ETA-incoming) — NO heuristic subtraction, NO SKU+qty dedup.
// Handler-eval harness (BUNDLE + 42 + 43 in a new Function); fixtures clearly labelled; no network / live DB.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var BUNDLE = read('specs/active/apps-script/90_generated_supply_planning_bundle.gs');
var F42 = read('specs/active/apps-script/42_api_v1_recommendation_workspace.gs');
var F43 = read('specs/active/apps-script/43_api_v1_gap_materialization.gs');
var SRC42 = F42, SRC43 = F43;

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// ---- eval harness: expose the wired owners + the pure helpers, with a stubbed prodRequireSheet_ (io-injected ss) --
var PRE = 'function prodRequireSheet_(ss, name){ var sh = ss.getSheetByName(name); if(!sh) throw new Error("MISSING_SHEET:"+name); return sh; }\n';
var H = (new Function(BUNDLE + '\n' + F42 + '\n' + PRE + F43 + '\n return {' +
  ' opBatch: handleRecalculateOrderPlanningGapBatch_,' +
  ' invBatch: handleRecalculateInventoryReplenishmentGapBatch_,' +
  ' getOpGap: handleGetOrderPlanningGap_,' +
  ' wsGet: handleRecommendationWorkspaceGet_,' +
  ' buildAlloc: gapOpBuildSupplyAllocation_,' +
  ' readPools: gapOpReadSupplyPoolFacts_,' +
  ' compose: recoWsComposeOpeningSupply_,' +
  ' opMap: gapOpMapFromLines_,' +
  ' recvKey: (typeof KMMSA!=="undefined"?KMMSA.receiverKeyOf:null),' +
  ' hasKMMSA: (typeof KMMSA!=="undefined" && !!KMMSA) };'))();

// ---- fake spreadsheet (read sheets + capturing gap sheet; records which sheets are written) ----------------------
function sheetFrom(headers, rows, writeLog, name) {
  var data = [headers.slice()].concat((rows || []).map(function (r) { return r.slice(); }));
  return {
    getLastRow: function () { return data.length; },
    getLastColumn: function () { return headers.length; },
    getDataRange: function () { return { getValues: function () { return data.map(function (r) { return r.slice(); }); } }; },
    getRange: function (row, col, numRows, numCols) {
      return {
        getValues: function () {
          var out = []; for (var i = 0; i < (numRows || 1); i++) { var rr = data[(row - 1) + i] || []; var line = []; for (var j = 0; j < (numCols || headers.length); j++) line.push(rr[(col - 1) + j]); out.push(line); } return out;
        },
        setValues: function (vals) { if (writeLog) writeLog.push(name); for (var i = 0; i < vals.length; i++) { var t = row - 1 + i; while (data.length <= t) data.push([]); data[t] = vals[i].slice(); } },
        setValue: function (v) { if (writeLog) writeLog.push(name); data[row - 1] = data[row - 1] || []; data[row - 1][col - 1] = v; }
      };
    },
    appendRow: function (arr) { if (writeLog) writeLog.push(name); data.push(arr.slice()); },
    _data: data
  };
}
function makeSs(tables) {
  var writes = [], sheets = {};
  Object.keys(tables).forEach(function (n) { sheets[n] = sheetFrom(tables[n].headers, tables[n].rows, writes, n); });
  return { getSheetByName: function (n) { return sheets[n] || null; }, _writes: writes, _sheets: sheets };
}
// io wiring the REAL workspace handler over the shared fake ss (server-owned calc month; no clock, no day-horizon).
function ioFor(ss) {
  return {
    now: function () { return 0; }, tz: function () { return 'UTC'; },
    openTarget: function () { return ss; },
    workspaceGet: function (body, sharedSs) {
      var recoIo = { now: function () { return 0; }, nextSeq: function () { return 1; }, configMonth: function () { return '2026-08'; }, configDate: function () { return ''; }, openTarget: function () { return sharedSs; } };
      return H.wsGet(body, recoIo);
    }
  };
}

var OP_HEADERS = ['company', 'country', 'marketplace', 'sku', 'calculation_status', 'calculation_month',
  't1_month', 't1_gap_qty', 't1_suggested_qty', 't2_month', 't2_gap_qty', 't2_suggested_qty',
  't3_month', 't3_gap_qty', 't3_suggested_qty', 't4_month', 't4_gap_qty', 't4_suggested_qty',
  'note', 'calculated_at', 'updated_at', 'manual_order_qty'];   // + one EXTRA additive manual column (Z)

// FC row helper: company/country/marketplace/sku/year + jan..dec. sep..dec (M+1..M+4 of 2026-08) carry the demand.
var FC_H = ['company', 'country', 'marketplace', 'sku', 'year', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'forecast_id'];
function fcRow(cn, mk, per) { return ['KM', cn, mk, 'CO1100-R', 2026, 0, 0, 0, 0, 0, 0, 0, 0, per, per, per, per, 'FC-' + cn]; }

function baseTables() {
  return {
    marketplace_skus: { headers: ['company', 'country', 'marketplace', 'sku', 'site_sku'], rows: [['KM', 'US', 'AMAZON_US', 'CO1100-R', 'ST-US'], ['KM', 'CA', 'AMAZON_CA', 'CO1100-R', 'ST-CA']] },
    marketplaces: { headers: ['marketplace_id', 'company', 'country', 'marketplace', 'fulfillment_model', 'status', 'allocation_priority'], rows: [['MPU', 'KM', 'US', 'AMAZON_US', 'platform_fulfilled', 'active', 2], ['MPC', 'KM', 'CA', 'AMAZON_CA', 'platform_fulfilled', 'active', 1]] },
    warehouses: { headers: ['warehouse_id', 'company', 'country', 'warehouse_type', 'is_active', 'is_factory_warehouse'], rows: [['W3PL-US', 'KM', 'US', '3PL', 'TRUE', 'FALSE'], ['WF1', 'FACTORY_SHARED', 'CN', 'FACTORY', 'TRUE', 'TRUE']] },
    sku_details: { headers: ['sku', 'units_per_carton'], rows: [['CO1100-R', 40]] },
    fc_regular_forecast: { headers: FC_H, rows: [fcRow('US', 'AMAZON_US', 150), fcRow('CA', 'AMAZON_CA', 1000)] },   // US Σ=600, CA Σ=4000
    amazon_inventory_snapshot: { headers: ['country', 'marketplace', 'sku', 'available_qty'], rows: [['US', 'AMAZON_US', 'CO1100-R', 100], ['CA', 'AMAZON_CA', 'CO1100-R', 100]] },  // Site Stock = FBA current (NOT the overseas pool)
    overseas_inventory_snapshot: { headers: ['warehouse_id', 'sku', 'wh_available_stock', 'snapshot_date'], rows: [['W3PL-US', 'CO1100-R', 1000, '2026-08-01']] },   // US THREE_PL pool = 1000
    factory_stock: { headers: ['warehouse_id', 'sku', 'fac_current_stock', 'last_transaction_at'], rows: [['WF1', 'CO1100-R', 1000, '2026-08-01']] },                 // company-wide FACTORY pool = 1000
    order_planning_gap: { headers: OP_HEADERS, rows: [] }
  };
}

// =============================================================================================================
section('PURE opening-supply composition owner (§7) — N/O/P/A');
eq(H.compose(100, 1000, 250).openingSupplyQty, 1350, 'N opening = Site 100 + Overseas 1000 + Factory 250 = 1350 (exact; addition only)');
eq([H.compose(100, 1000, 250).siteStockQty, H.compose(100, 1000, 250).allocatedOverseasQty, H.compose(100, 1000, 250).allocatedFactoryQty], [100, 1000, 250], 'A auditable composition facts (Site/Overseas/Factory) exposed');
eq(H.compose(0, 0, 0).openingSupplyQty, 0, 'O explicit zero opening stays 0 (valid zero)');
eq(H.compose(null, 5, 5).openingSupplyQty, null, 'P missing Site Stock → null opening (missing ≠ 0; KMTPP then fails closed)');
eq(H.compose('', 5, 5).openingSupplyQty, null, 'P2 blank Site Stock → null opening');

section('PURE allocation builder over KMMSA (§3/§4/§5/§6) — B/C/D/E/F/G/H/I');
function R(over) { return Object.assign({ company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100-R', demandQty: 600, allocationPriority: 1, requiredByDate: '2026-09-01' }, over || {}); }
function ovPools(qty) { return { 'KM||US||CO1100-R': [{ poolKey: 'OV', poolType: 'THREE_PL', warehouseId: 'W3PL-US', effectiveSupplyQty: qty }] }; }
function fcPools(qty) { return { 'CO1100-R': [{ poolKey: 'FC', poolType: 'FACTORY', warehouseId: 'WF1', effectiveSupplyQty: qty }] }; }
var K = H.recvKey;

// C — single Factory receiver → 100% of the eligible pool (NOT demand-capped)
var c = H.buildAlloc([R({ demandQty: 250 })], { factoryPoolsBySku: fcPools(400), overseasPoolsByKey: {}, eligibleFactoryWarehouseIds: ['WF1'], priorityByMkt: {} });
eq(c.byReceiverKey[K(R())].factoryCoveredQty, 400, 'C single Factory receiver → 100% of the 400 pool (not capped to demand 250)');
// B — single Overseas receiver → 100%
var b = H.buildAlloc([R({ demandQty: 250 })], { overseasPoolsByKey: ovPools(1000), factoryPoolsBySku: {}, eligibleFactoryWarehouseIds: [], priorityByMkt: {} });
eq(b.byReceiverKey[K(R())].overseasCoveredQty, 1000, 'B single Overseas receiver → 100% of the 1000 THREE_PL pool (not capped to demand 250)');
// E — multiple Factory receivers company-wide conserved
var eUS = R({ marketplace: 'AMAZON_US', demandQty: 600, allocationPriority: 2 });
var eCA = R({ country: 'CA', marketplace: 'AMAZON_CA', demandQty: 4000, allocationPriority: 1 });
var e = H.buildAlloc([eUS, eCA], { factoryPoolsBySku: fcPools(1000), overseasPoolsByKey: {}, eligibleFactoryWarehouseIds: ['WF1'], priorityByMkt: {} });
var eF = e.byReceiverKey[K(eUS)].factoryCoveredQty + e.byReceiverKey[K(eCA)].factoryCoveredQty;
ok(eF === 1000 && e.byReceiverKey[K(eUS)].factoryCoveredQty < 1000 && e.byReceiverKey[K(eCA)].factoryCoveredQty < 1000, 'E multi Factory conserved: Σ = 1000 pool; neither gets the whole pool');
// D — multiple Overseas receivers SAME country conserved
var dA = R({ marketplace: 'AMAZON_US', demandQty: 600 });
var dB = R({ marketplace: 'WALMART_US', demandQty: 700 });
var d = H.buildAlloc([dA, dB], { overseasPoolsByKey: ovPools(1000), factoryPoolsBySku: {}, eligibleFactoryWarehouseIds: [], priorityByMkt: {} });
var dSum = d.byReceiverKey[K(dA)].overseasCoveredQty + d.byReceiverKey[K(dB)].overseasCoveredQty;
ok(dSum === 1000, 'D multi Overseas (same country) conserved: Σ = 1000 pool');
// F — SKU-specific eligible receiver set (a receiver for a DIFFERENT sku gets nothing from this pool)
var f = H.buildAlloc([R({ sku: 'CO1100-R' }), R({ sku: 'OTHER-SKU', marketplace: 'AMAZON_US' })], { factoryPoolsBySku: fcPools(1000), overseasPoolsByKey: {}, eligibleFactoryWarehouseIds: ['WF1'], priorityByMkt: {} });
ok(f.byReceiverKey[K(R({ sku: 'CO1100-R' }))].factoryCoveredQty === 1000 && (!f.byReceiverKey[K(R({ sku: 'OTHER-SKU' }))] || f.byReceiverKey[K(R({ sku: 'OTHER-SKU' }))].factoryCoveredQty === 0), 'F SKU-specific: only CO1100-R receiver draws the CO1100-R factory pool');
// G — zero receivers → allocate nothing
var g = H.buildAlloc([], { factoryPoolsBySku: fcPools(1000), overseasPoolsByKey: ovPools(1000), eligibleFactoryWarehouseIds: ['WF1'], priorityByMkt: {} });
eq(Object.keys(g.byReceiverKey).length, 0, 'G zero receivers → empty allocation (nothing allocated; no fabricated receiver)');
// H — company isolation: KM + OTHERCO receivers are grouped/allocated PER company (never pooled cross-company)
var hKM = R({ company: 'KM' });
var hXX = R({ company: 'OTHERCO' });
var h = H.buildAlloc([hKM, hXX], { factoryPoolsBySku: fcPools(1000), overseasPoolsByKey: {}, eligibleFactoryWarehouseIds: ['WF1'], priorityByMkt: {} });
ok(h.byReceiverKey[K(hKM)] && h.byReceiverKey[K(hXX)] && h.byReceiverKey[K(hKM)].factoryCoveredQty === 1000 && h.byReceiverKey[K(hXX)].factoryCoveredQty === 1000, 'H company isolation: each company allocated independently (no cross-company pooling in one KMMSA call)');
// I — UK ≡ GB via KMCID: a UK receiver draws a GB-keyed overseas pool (canonical country match)
var iUK = R({ country: 'UK', marketplace: 'AMAZON_UK' });
var i = H.buildAlloc([iUK], { overseasPoolsByKey: { 'KM||GB||CO1100-R': [{ poolKey: 'OVGB', poolType: 'THREE_PL', warehouseId: 'W3PL-GB', effectiveSupplyQty: 800 }] }, factoryPoolsBySku: {}, eligibleFactoryWarehouseIds: [], priorityByMkt: {} });
eq(i.byReceiverKey[K(iUK)].overseasCoveredQty, 800, 'I UK receiver draws the GB-canonical overseas pool (UK ≡ GB via KMCID)');

section('lineage-net pool reader (§4/§5/§16) — J/K');
var jkTables = baseTables();
jkTables.shipments = { headers: ['company', 'country', 'sku', 'status', 'qty'], rows: [['KM', 'US', 'CO1100-R', 'shipped', 500]] };  // in-transit — must NOT enter the opening pool
var jkPools = H.readPools(makeSs(jkTables));
eq(jkPools.overseasPoolsByKey['KM||US||CO1100-R'][0].effectiveSupplyQty, 1000, 'J Overseas pool = current-stock snapshot only (1000); the 500 shipped-in-transit is NOT added (lineage-net by source, no heuristic subtraction)');
eq(jkPools.factoryPoolsBySku['CO1100-R'][0].effectiveSupplyQty, 1000, 'K Factory pool = current factory stock only (1000); shipments never read into the pool');
eq(jkPools.eligibleFactoryWarehouseIds, ['WF1'], 'K2 eligibleFactoryWarehouseIds derived from is_factory_warehouse');
ok(!jkPools.overseasPoolsByKey['KM||CA||CO1100-R'], 'J2 CA has no 3PL warehouse → no CA overseas pool (per-country scope)');

section('END-TO-END batch → order_planning_gap (§1/§7/§10/§11/§12/§13/§14/§15) — L/M/Q/R/T/U/V/W/X/Y/Z/AD');
var ss = makeSs(baseTables());
var env = H.opBatch({ requestId: 'REQ-FM5R2B' }, ioFor(ss));
ok(env.success === true, 'W0 manual batch = ONE bounded server call → success');
ok(env.data.receiversConsidered === 2 && env.data.totalScopes === 2, 'X internal loop over the bounded receiver set (2 receivers, 2 scopes) — no per-SKU HTTP');
// read back the materialized rows (§13 mapping / Y page read)
var gapEnv = H.getOpGap({ payload: { scope: { company: 'KM', country: 'US', marketplace: 'AMAZON_US' } } }, ioFor(ss));
ok(gapEnv.success === true && gapEnv.data.rows.length === 1, 'Y page reads STORED order_planning_gap (US row present)');
var usRow = gapEnv.data.rows[0];
var caEnv = H.getOpGap({ payload: { scope: { company: 'KM', country: 'CA', marketplace: 'AMAZON_CA' } } }, ioFor(ss));
var caRow = caEnv.data.rows[0];
eq(usRow.calculation_status, 'READY', 'U US row READY');
eq([usRow.t1_month, usRow.t2_month, usRow.t3_month, usRow.t4_month], ['2026-09', '2026-10', '2026-11', '2026-12'], 'U T1–T4 months mapped from KMTPP monthlyProjection (M+1..M+4)');
// US opening = Site 100 + Overseas 1000 (single US receiver → 100%) + Factory (company-wide share). Demand Σ=600 → fully covered.
ok(usRow.t1_gap_qty === 0 && usRow.t1_suggested_qty === 0, 'T/§15 US fully covered (opening Site+Overseas1000+Factory ≥ demand) → gap 0, suggested 0');
// CA opening = Site 100 + Overseas 0 (no CA 3PL) + Factory residual. Demand Σ=4000 → shortage in later tiers → suggestion.
ok(caRow.t4_gap_qty > 0 && caRow.t4_suggested_qty > 0, 'T CA under-covered → later-tier gap + a cartonized suggested order (residual after supply)');
// Verify conserved composition via the workspace line's openingSupplyComposition (§7 audit).
var recvKeyUS = H.recvKey({ company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100-R' });
var recvKeyCA = H.recvKey({ company: 'KM', country: 'CA', marketplace: 'AMAZON_CA', sku: 'CO1100-R' });
var allocMap = H.buildAlloc([
  { company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100-R', demandQty: 600, allocationPriority: 2, requiredByDate: '2026-09-01' },
  { company: 'KM', country: 'CA', marketplace: 'AMAZON_CA', sku: 'CO1100-R', demandQty: 4000, allocationPriority: 1, requiredByDate: '2026-09-01' }
], H.readPools(ss)).byReceiverKey;
eq(allocMap[recvKeyUS].overseasCoveredQty, 1000, 'B/§15 end-to-end: US single-country overseas receiver → 100% of the 1000 pool');
ok(allocMap[recvKeyUS].factoryCoveredQty + allocMap[recvKeyCA].factoryCoveredQty === 1000, 'E/§14 end-to-end: US+CA factory allocations conserved to the 1000 company-wide pool');
// Compose the US opening to prove Site + Overseas + Factory (counted once; incoming excluded → L/M).
var usComp = H.compose(100, allocMap[recvKeyUS].overseasCoveredQty, allocMap[recvKeyUS].factoryCoveredQty);
eq(usComp.openingSupplyQty, 100 + 1000 + allocMap[recvKeyUS].factoryCoveredQty, 'M opening = Site + Overseas + Factory ONLY (no incoming lineage folded in — counted once)');
ok(usComp.openingSupplyQty > 100, 'L/§8 opening enlarged by allocated pools while shipments remain ETA-incoming (no double count)');
// R — KMTPP carry-forward: with a large opening the US line covers every tier (opening consumed once, carried).
ok(usRow.t2_gap_qty === 0 && usRow.t3_gap_qty === 0 && usRow.t4_gap_qty === 0, 'R T1→T4 carry-forward: US opening carried through all tiers (no gap re-opens)');
// Q — pre-T1 chronology preserved: all four writable tiers present, no PRE-T1 tier leaked into the table.
ok(usRow.t1_month && usRow.t2_month && usRow.t3_month && usRow.t4_month, 'Q four writable tiers T1–T4 present (PRE-T1 remains non-writable)');
// AD — the batch writes ONLY order_planning_gap.
ok(ss._writes.length > 0 && ss._writes.every(function (w) { return w === 'order_planning_gap'; }), 'AD batch writes ONLY order_planning_gap (no unrelated writes)');

section('UPSERT idempotency + manual-column preservation (§13/§19) — V/Z');
// seed a manual_order_qty on the US row, then re-run; the batch must UPDATE (not duplicate) and PRESERVE the manual value.
var usIdx = -1; ss._sheets.order_planning_gap._data.forEach(function (r, ix) { if (ix > 0 && r[0] === 'KM' && r[1] === 'US') usIdx = ix; });
ss._sheets.order_planning_gap._data[usIdx][OP_HEADERS.indexOf('manual_order_qty')] = 999;
var rowsBefore = ss._sheets.order_planning_gap._data.length;
H.opBatch({ requestId: 'REQ-FM5R2B-2' }, ioFor(ss));
eq(ss._sheets.order_planning_gap._data.length, rowsBefore, 'V re-run UPSERTs in place — no duplicate rows');
var usAfter = ss._sheets.order_planning_gap._data[usIdx];
eq(usAfter[OP_HEADERS.indexOf('manual_order_qty')], 999, 'Z manual_order_qty (additive user column) preserved across recalculation');

section('Inventory strict non-impact (§18) + no page-side formula + no scheduler — AA/AB/AC');
// AA — the Inventory day-horizon opening stays Site-Stock-only: the composed opening is used ONLY for monthlyProjection.
// FM5-R4UI-R5 §4: the horizon opening is now `horizonOpening` = L.currentStockQty, else the canonical Site Stock
// owner (KMDR.resolveMarketplaceCurrentStock) — STILL Site Stock ONLY, decoupled from the forecast/monthly line, and
// explicitly NOT the OP composed opening (composition.openingSupplyQty with overseas/factory). Allocation is never
// folded into D18/D30/D45/D90.
ok(/horizonOpening = recoWsNum_\(L\.currentStockQty\)/.test(SRC42) && /resolveMarketplaceCurrentStock\(\{ rows: amazonRows/.test(SRC42), 'AA horizon opening = Site Stock only (L.currentStockQty, else canonical resolveMarketplaceCurrentStock) — forecast-decoupled, NOT the OP composed opening');
ok(/recoWsBuildHorizons_\(calc, fcRows, tgtRows, evtRows, skuMeta, scope, sku, horizonOpening,/.test(SRC42), 'AA2 horizons receive horizonOpening (Site Stock), never composition.openingSupplyQty (Site+Overseas+Factory)');
ok(/allocatedOverseasQty: ov, allocatedFactoryQty: fc/.test(SRC42) && !/D18|D30|D45|D90/.test(H.compose.toString()), 'AA2 composition owner touches opening supply only (no horizon window arithmetic)');
// the Inventory batch is untouched (still the generic gapRunBatch_ path).
ok(/function handleRecalculateInventoryReplenishmentGapBatch_[\s\S]*?return gapRunBatch_\(body, io, \{ product: 'INVENTORY'/.test(SRC43), 'AA3 Inventory batch owner still delegates to the generic gapRunBatch_ (INVENTORY product) — no formula duplication (R4 added only deterministic context derivation)');
var invEnv = H.invBatch({ requestId: 'REQ-INV' }, (function () { var t = baseTables(); t.inventory_replenishment_gap = { headers: ['company', 'country', 'marketplace', 'sku', 'calculation_status', 'calculation_date', 'd18_gap_qty', 'd18_suggested_qty', 'd30_gap_qty', 'd30_suggested_qty', 'd45_gap_qty', 'd45_suggested_qty', 'd90_gap_qty', 'd90_suggested_qty', 'note', 'calculated_at', 'updated_at'], rows: [] }; return ioFor(makeSs(t)); })());
ok(invEnv.success === true, 'AA4 Inventory batch still runs (independent of R2b Order Planning wiring)');
// AB — no scheduler/trigger added in 43; AC — allocation math stays in KMMSA/KMALLOC, carton in KMCALC, chronology in KMTPP.
ok(!/ScriptApp\.newTrigger|createTrigger|everyHours|everyDays|onOpen|timeBased/.test(SRC43), 'AB no scheduler/trigger created or modified in the gap batch');
ok(/KMMSA\.allocateMarketplaceReceiverSupply/.test(SRC43) && !/largest.?remainder|distributeByWeight|survivalAlloc/.test(SRC43), 'AC allocation delegated to KMMSA/KMALLOC — no distribution math re-implemented in the batch');
ok(!/\bnew Date\(\)|Math\.random\b/.test(H.compose.toString()), 'AC2 composition owner is pure (no clock/RNG)');

console.log('\n----------------------------------------');
console.log('ORDER PLANNING SUPPLY ALLOCATION (F1-4B-FM5-R2b): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
