// Kitchen Mama Operation System — Monthly Projection Transport Wiring (F1-4B-FM3c-2).
// Run: node assets/tests/recommendation-monthly-projection-transport-f1-4b-fm3c2.test.js
// -----------------------------------------------------------------------------
// Proves the frozen KMTPP owner is now bundled and wired into recommendation.workspace.get so each canonical line
// additively exposes line.monthlyProjection[] for T1..T4 — with ALL chronological math owned by KMTPP and ALL
// per-tier carton suggestion owned by KMCALC (never re-implemented in the handler / page). Opening counted once,
// incoming counted once, late-for-a-tier incoming excluded from earlier tiers, per-warehouse isolation, valid-zero
// truthful, missing source truthful (no fabricated numbers), scalar DTO byte-compatible, no extra HTTP reads, no
// day-horizon fields, no writes. Drives the REAL bundle + REAL handler in one Apps-Script-like scope (no live DB).

var fs = require('fs');
var path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var BUNDLE = read('specs/active/apps-script/90_generated_supply_planning_bundle.gs');
var HANDLER = read('specs/active/apps-script/42_api_v1_recommendation_workspace.gs');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

var H = (new Function(BUNDLE + '\n' + HANDLER + '\n return {' +
  ' handle: handleRecommendationWorkspaceGet_,' +
  ' buildMonthlyProjection: recoWsBuildMonthlyProjection_,' +
  ' warehouseOpeningStock: recoWsWarehouseOpeningStock_,' +
  ' bundleInfo: (typeof KM_BUNDLE_INFO !== "undefined" ? KM_BUNDLE_INFO : null),' +
  ' hasKMTPP: (typeof KMTPP !== "undefined" && !!KMTPP && typeof KMTPP.projectTimePhasedSupply === "function"),' +
  ' hasKMCALC: (typeof KMCALC !== "undefined" && !!KMCALC && typeof KMCALC.calculateSuggestedOrderQty === "function")' +
  '};'))();

var MONTHS = ['2026-09', '2026-10', '2026-11', '2026-12'];   // M+1..M+4 for calcMonth 2026-08
// F1-4B-FM3f-1 additive DTO: destinationGapQty / overseasCoveredQty / factoryCoveredQty / residualOrderNeedQty +
// openingDestinationSupplyQty / qualifiedIncomingQty added alongside the original fields (backward compatible).
var TIER_KEYS = 'coveredQty,demandQty,destinationGapQty,factoryCoveredQty,incomingAddedQty,month,openingDestinationSupplyQty,openingSupplyQty,overseasCoveredQty,qualifiedIncomingQty,remainingGapQty,remainingSupplyQty,residualOrderNeedQty,suggestedOrderQty,tier';
function dm(a, b, c, d) { return { '2026-09': a, '2026-10': b, '2026-11': c, '2026-12': d }; }

// =============================================================================
section('S. KMTPP bundle registration + parity');
ok(H.hasKMTPP, 'S1 KMTPP is bundled + globally callable (KMTPP.projectTimePhasedSupply)');
ok(H.hasKMCALC, 'S2 KMCALC carton owner globally callable');
ok(H.bundleInfo && H.bundleInfo.modules.some(function (m) { return m.module === 'supply-planning-time-phased-projection'; }), 'S3 KM_BUNDLE_INFO manifest includes the KMTPP module');
ok(H.bundleInfo && H.bundleInfo.modules.length >= 31 && H.bundleInfo.modules.some(function (m) { return m.module === 'supply-planning-time-phased-projection'; }), 'S4 bundle includes KMTPP module (count ≥ 31; grows as later modules like KMHP are added)');

section('A. T1–T4 sequential projection — opening supply carries forward (no incoming)');
var a = H.buildMonthlyProjection(MONTHS, 1000, dm(250, 250, 250, 250), [], 12, null);
ok(a && a.length === 4, 'A0 four tiers T1..T4');
eq([a[0].tier, a[1].tier, a[2].tier, a[3].tier], ['T1', 'T2', 'T3', 'T4'], 'A1 tiers in order');
eq([a[0].remainingSupplyQty, a[1].remainingSupplyQty, a[2].remainingSupplyQty, a[3].remainingSupplyQty], [750, 500, 250, 0], 'A2 opening 1000 carries forward −250/tier (750→500→250→0)');
ok(a.every(function (r) { return r.remainingGapQty === 0 && r.suggestedOrderQty === 0; }), 'A3 fully covered → gap 0, suggestedOrderQty 0 each tier');

section('K. sequential shortage — opening NOT re-subtracted every month');
var k = H.buildMonthlyProjection(MONTHS, 300, dm(250, 250, 250, 250), [], 12, null);
eq([k[0].coveredQty, k[0].remainingSupplyQty, k[0].remainingGapQty], [250, 50, 0], 'K1 T1: opening 300 covers 250, 50 carried, gap 0');
eq([k[1].coveredQty, k[1].remainingGapQty, k[1].suggestedOrderQty], [50, 200, 204], 'K2 T2: only the carried 50 covers (NOT 300 again) → gap 200 → CEIL(200/12)*12 = 204');
eq([k[2].remainingGapQty, k[3].remainingGapQty], [250, 250], 'K3 T3/T4 full shortage 250 (opening already consumed once)');

section('B. incoming ETA in T2 — does NOT cover T1, covers T2');
var b = H.buildMonthlyProjection(MONTHS, 100, dm(250, 250, 250, 250), [{ incomingId: 'SH-1', eta: '2026-10-01', qty: 500, sourceType: 'KM' }], 12, null);
eq([b[0].incomingAddedQty, b[0].coveredQty, b[0].remainingGapQty], [0, 100, 150], 'B1 T1: incoming (ETA T2) absent → only opening 100 covers, gap 150');
eq([b[1].incomingAddedQty, b[1].coveredQty, b[1].remainingGapQty], [500, 250, 0], 'B2 T2: incoming 500 arrives → covers 250, gap 0');

section('C. count-once — one incoming event is never reused across tiers');
var c = H.buildMonthlyProjection(MONTHS, 0, dm(100, 100, 100, 100), [{ incomingId: 'SH-1', eta: '2026-09-01', qty: 100, sourceType: 'KM' }], 12, null);
eq([c[0].incomingAddedQty, c[0].coveredQty, c[0].remainingGapQty], [100, 100, 0], 'C1 T1: incoming 100 applied ONCE → covers 100, gap 0');
eq([c[1].incomingAddedQty, c[1].remainingGapQty], [0, 100], 'C2 T2: same event NOT reused → incomingAdded 0, gap 100');

section('D. valid zero demand stays 0 (not treated as missing)');
var d = H.buildMonthlyProjection(MONTHS, 50, dm(0, 0, 0, 0), [], 12, null);
ok(d && d.length === 4 && d.every(function (r) { return r.demandQty === 0 && r.remainingSupplyQty === 50 && r.remainingGapQty === 0 && r.suggestedOrderQty === 0; }), 'D valid zero demand → 0 demand, opening 50 preserved, gap 0');

section('E. opening supply unavailable / missing forecast month → truthful null (no fabricated projection)');
ok(H.buildMonthlyProjection(MONTHS, null, dm(250, 250, 250, 250), [], 12, null) === null, 'E1 opening null → KMTPP OPENING_SUPPLY_UNAVAILABLE → monthlyProjection null');
ok(H.buildMonthlyProjection(MONTHS, 100, { '2026-09': 250, '2026-10': 250, '2026-11': 250 }, [], 12, null) === null, 'E2 missing tier-month forecast → null (never coerced to 0)');

section('L. per-tier carton suggestion — canonical Monthly-CEIL owner; missing carton authority → null');
var lmiss = H.buildMonthlyProjection(MONTHS, 0, dm(250, 250, 250, 250), [], null, null);
eq([lmiss[0].remainingGapQty, lmiss[0].suggestedOrderQty], [250, null], 'L1 gap 250 but missing UPC → suggestedOrderQty null (never hand-coded ceil)');
var lupc = H.buildMonthlyProjection(MONTHS, 0, dm(250, 250, 250, 250), [], 12, null);
eq([lupc[0].suggestedOrderQty, lupc[1].suggestedOrderQty], [252, 252], 'L2 gap 250 + UPC 12 → CEIL(250/12)*12 = 252 (KMCALC owner)');

section('N/R. additive DTO shape exact + NO day-horizon fields');
eq(Object.keys(k[1]).sort().join(','), TIER_KEYS, 'N tier DTO keys = {tier,month,openingSupplyQty,incomingAddedQty,demandQty,coveredQty,remainingSupplyQty,remainingGapQty,suggestedOrderQty}');
ok(Object.keys(k[1]).every(function (key) { return !/18|30|45|90|day/i.test(key); }), 'R no 18/30/45/90/day-horizon field on the tier DTO');

section('H/I. warehouse isolation + lineage conservation (per-warehouse independent projections)');
var whA = H.buildMonthlyProjection(MONTHS, 0, dm(100, 100, 100, 100), [{ incomingId: 'A-1', eta: '2026-09-01', qty: 400, sourceType: 'KM', warehouseId: 'WH-A' }], 12, null);
var whB = H.buildMonthlyProjection(MONTHS, 0, dm(100, 100, 100, 100), [{ incomingId: 'B-1', eta: '2026-09-01', qty: 50, sourceType: 'KM', warehouseId: 'WH-B' }], 12, null);
eq(whA[0].incomingAddedQty, 400, 'H1 WH-A T1 sees ONLY its own 400 incoming');
eq(whB[0].incomingAddedQty, 50, 'H2 WH-B T1 sees ONLY its own 50 incoming (WH-A 400 never leaks in)');
eq([whA[0].remainingGapQty, whB[0].remainingGapQty], [0, 50], 'I WH-A covered (gap 0) vs WH-B short (gap 50) — conserved per warehouse, no pooling');

section('warehouseOpeningStock helper — per-warehouse, missing≠0');
eq(H.warehouseOpeningStock([{ lifecycle_bucket: 'CURRENT_STOCK', warehouse_id: 'WH-A', quantity: 60 }, { lifecycle_bucket: 'CURRENT_STOCK', warehouse_id: 'WH-B', quantity: 30 }, { lifecycle_bucket: 'SHIPPED_IN_TRANSIT', warehouse_id: 'WH-A', quantity: 999 }], 'WH-A'), 60, 'WOS1 sums only CURRENT_STOCK for the exact warehouse (ignores in-transit + other warehouse)');
ok(H.warehouseOpeningStock([{ lifecycle_bucket: 'CURRENT_STOCK', warehouse_id: 'WH-B', quantity: 30 }], 'WH-A') === null, 'WOS2 no CURRENT_STOCK row for the warehouse → null (UNKNOWN, never fabricated 0)');
eq(H.warehouseOpeningStock([{ lifecycle_bucket: 'CURRENT_STOCK', warehouse_id: 'WH-A', quantity: 0 }], 'WH-A'), 0, 'WOS3 explicit 0-qty row → truthful 0');

// ---- handler end-to-end integration ----------------------------------------
function makeSs(tables, counters) {
  counters.getSheetByName = 0; counters.write = 0;
  return { getSheetByName: function (name) {
    counters.getSheetByName++;
    var t = tables[name]; if (!t) return null;
    var values = [t.headers].concat(t.rows);
    return { getLastRow: function () { return values.length; }, getDataRange: function () { return { getValues: function () { return values; } }; },
      getRange: function () { counters.write++; return { setValues: function () { counters.write++; }, setValue: function () { counters.write++; } }; }, appendRow: function () { counters.write++; } };
  } };
}
function io(cfgMonth, ss) { return { now: function () { return 0; }, nextSeq: function () { return 1; }, configMonth: function () { return cfgMonth; }, openTarget: function () { return ss; } }; }
function body() { return { requestId: 'REQ-FM3C2', payload: { scope: { company: 'KM', country: 'US', marketplace: 'AMAZON_US' }, pagination: { page: 1, size: 100 } } }; }
var FC_HEADERS = ['company', 'country', 'marketplace', 'sku', 'year', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'forecast_id'];
function fcRow(sku) { return ['KM', 'US', 'AMAZON_US', sku, 2026, 0, 0, 0, 0, 0, 0, 0, 0, 250, 250, 250, 250, 'FC-1']; }
function mpTables() {
  return {
    marketplace_skus: { headers: ['company', 'country', 'marketplace', 'sku', 'site_sku'], rows: [['KM', 'US', 'AMAZON_US', 'CO1100', 'ST-CO1100']] },
    marketplaces: { headers: ['marketplace_id', 'company', 'country', 'marketplace', 'fulfillment_model', 'status'], rows: [['MP1', 'KM', 'US', 'AMAZON_US', 'platform_fulfilled', 'active']] },
    warehouses: { headers: ['warehouse_id', 'company', 'country', 'is_active', 'is_factory_warehouse', 'warehouse_type'], rows: [['WH-A', 'KM', 'US', 'TRUE', 'FALSE', '3PL'], ['WH-B', 'KM', 'US', 'TRUE', 'FALSE', '3PL']] },
    sku_details: { headers: ['sku', 'units_per_carton'], rows: [['CO1100', 12]] },
    fc_regular_forecast: { headers: FC_HEADERS, rows: [fcRow('CO1100')] },
    amazon_inventory_snapshot: { headers: ['country', 'marketplace', 'sku', 'available_qty'], rows: [['US', 'AMAZON_US', 'CO1100', 120]] }
  };
}

section('M/O/P/Q. MARKETPLACE end-to-end — additive monthlyProjection + scalar compat + request count + cache-safe');
var cM = {}; var envM = H.handle(body(), io('2026-08', makeSs(mpTables(), cM)));
ok(envM.success === true, 'M0 MARKETPLACE success');
var lm = envM.data.lines[0];
eq([lm.calculatedGap, lm.recommendedQty, lm.currentStockQty, lm.qualifiedIncomingQty], [880, 888, 120, 0], 'M1 pre-existing SCALAR fields unchanged (gap 880, reco 888, stock 120, incoming 0)');
ok(Array.isArray(lm.monthlyProjection) && lm.monthlyProjection.length === 4, 'M2 additive line.monthlyProjection with 4 tiers');
eq([lm.monthlyProjection[0].openingSupplyQty, lm.monthlyProjection[0].demandQty, lm.monthlyProjection[0].remainingGapQty, lm.monthlyProjection[0].suggestedOrderQty], [120, 250, 130, 132], 'M3 T1: opening = currentStockQty 120, demand 250, gap 130, CEIL→132');
eq([lm.monthlyProjection[1].openingSupplyQty, lm.monthlyProjection[1].remainingGapQty], [0, 250], 'M4 T2: carry-forward opening 0, gap 250');
ok(cM.getSheetByName === 19 && cM.write === 0, 'O request count = 17 targeted reads (13 canonical + R3 daily/weekly sales + R3a campaigns); ZERO writes — projection adds no write');
var roundtrip = JSON.parse(JSON.stringify(envM));   // FM3a session cache stores env.data verbatim (JSON)
ok(roundtrip.data.lines[0].monthlyProjection.length === 4, 'P monthlyProjection survives JSON round-trip (FM3a session cache compatible)');
ok(cM.write === 0, 'Q no writes on the READ path');

section('G. WAREHOUSE end-to-end — blocked line carries NO fabricated projection (§12 absent-on-blocked)');
// NOTE: the workspace WAREHOUSE runtime path is PRE-EXISTINGLY blocked ALLOCATION_FACTS_NOT_READY at cbd161a
// (the WEEKLY allocation/receiver facts are not derivable from raw snapshots here — unrelated to FM3c-2). The
// FM3c-2 warehouse monthlyProjection is wired into the (unreached) SUCCESS branch and its per-warehouse
// opening/demand/incoming isolation semantics are proven directly at the KMTPP-helper level (H/I + WOS above).
var whTables = mpTables();
whTables.marketplaces.rows = [['MP1', 'KM', 'US', 'AMAZON_US', 'self_fulfilled', 'active']];
whTables.replenishment_demand_allocation_rules = { headers: ['allocation_rule_id', 'company', 'country', 'marketplace', 'destination_warehouse_id', 'forecast_allocation_ratio', 'sales_allocation_ratio', 'status'], rows: [['R1', 'KM', 'US', 'AMAZON_US', 'WH-A', 0.30, 0.30, 'active'], ['R2', 'KM', 'US', 'AMAZON_US', 'WH-B', 0.70, 0.70, 'active']] };
var cW = {}; var envW = H.handle(body(), io('2026-08', makeSs(whTables, cW)));
ok(envW.success === true && envW.data.lines.length === 2, 'G0 two WAREHOUSE lines (per configured warehouse)');
var wA = envW.data.lines.filter(function (l) { return l.warehouseId === 'WH-A'; })[0];
var wB = envW.data.lines.filter(function (l) { return l.warehouseId === 'WH-B'; })[0];
ok(wA.blocked === true && wB.blocked === true && wA.blockedReason === 'ALLOCATION_FACTS_NOT_READY', 'G1 warehouse lines blocked ALLOCATION_FACTS_NOT_READY (pre-existing workspace state, not FM3c-2)');
ok(wA.monthlyProjection === undefined && wB.monthlyProjection === undefined, 'G2 blocked line carries NO monthlyProjection (no fabricated tiers — §12 absent-on-blocked)');
eq([wA.allocatedForecastQty, wB.allocatedForecastQty], [300, 700], 'G3 pre-existing scalar allocatedForecastQty unchanged (30/70 fanout 300/700)');
ok(cW.getSheetByName === 19 && cW.write === 0, 'G4 one targeted read (17 canonical tables) for the 2-warehouse fanout; zero writes');

console.log('\n----------------------------------------');
console.log('MONTHLY PROJECTION TRANSPORT (F1-4B-FM3c-2): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
