// Kitchen Mama Operation System — Inventory recalc determinism + contamination tolerance (F1-4B-FM5-R4UI-R4 §5).
// Run: node assets/tests/inventory-recalc-determinism-f1-4b-fm5r4uir4.test.js
// -----------------------------------------------------------------------------
// Reproduces + guards the R3a→R4 READY→BLOCKED defect: a Sales-Driven SKU with a valid daily-sales basis must
// materialize READY, and re-running the exact canonical Inventory batch on IDENTICAL source facts must yield the
// SAME READY status + SAME D18/D30/D45/D90 values (deterministic). The optional campaign/event contamination
// FILTER must NEVER gate READY: TABLE PRESENT + 0 rows AND TABLE ABSENT both mean "no exclusion" — neither turns a
// READY row BLOCKED (that was the R3a over-strict CONTAMINATION_SOURCE_UNAVAILABLE). Also confirms batch↔workspace
// snapshot parity: the batch invokes handleRecommendationWorkspaceGet_ → KMPS.readCanonicalSnapshots (all 17
// tables incl. daily/weekly sales + campaigns), so the Sales-Driven owner sees the same tables in batch + runtime.
// Handler-eval harness (BUNDLE + 42 + 43); no live DB.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var BUNDLE = read('specs/active/apps-script/90_generated_supply_planning_bundle.gs');
var F42 = read('specs/active/apps-script/42_api_v1_recommendation_workspace.gs');
var F43 = read('specs/active/apps-script/43_api_v1_gap_materialization.gs');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

var PRE = 'function prodRequireSheet_(ss, name){ var sh = ss.getSheetByName(name); if(!sh) throw new Error("MISSING_SHEET:"+name); return sh; }\n';
var H = (new Function(BUNDLE + '\n' + F42 + '\n' + PRE + F43 + '\n return {' +
  ' invBatch: handleRecalculateInventoryReplenishmentGapBatch_,' +
  ' wsGet: handleRecommendationWorkspaceGet_,' +
  ' getInvGap: handleGetInventoryReplenishmentGap_ };'))();

function sheetFrom(headers, rows) {
  var data = [headers.slice()].concat((rows || []).map(function (r) { return r.slice(); }));
  return {
    getLastRow: function () { return data.length; }, getLastColumn: function () { return headers.length; },
    getDataRange: function () { return { getValues: function () { return data.map(function (r) { return r.slice(); }); } }; },
    getRange: function (row, col, numRows, numCols) {
      return {
        getValues: function () { var out = []; for (var i = 0; i < (numRows || 1); i++) { var rr = data[(row - 1) + i] || []; var line = []; for (var j = 0; j < (numCols || headers.length); j++) line.push(rr[(col - 1) + j]); out.push(line); } return out; },
        setValues: function (vals) { for (var i = 0; i < vals.length; i++) { var t = row - 1 + i; while (data.length <= t) data.push([]); data[t] = vals[i].slice(); } },
        setValue: function (v) { data[row - 1] = data[row - 1] || []; data[row - 1][col - 1] = v; }
      };
    },
    appendRow: function (arr) { data.push(arr.slice()); }
  };
}
function makeSs(tables) { var sheets = {}; Object.keys(tables).forEach(function (n) { sheets[n] = sheetFrom(tables[n].headers, tables[n].rows); }); return { getSheetByName: function (n) { return sheets[n] || null; } }; }
function ioFor(ss) {
  return {
    now: function () { return 0; }, tz: function () { return 'UTC'; }, openTarget: function () { return ss; },
    workspaceGet: function (body, sharedSs) {
      var recoIo = { now: function () { return 0; }, nextSeq: function () { return 1; }, configMonth: function () { return '2026-08'; }, configDate: function () { return '2026-08-07'; }, openTarget: function () { return sharedSs; } };
      return H.wsGet(body, recoIo);
    }
  };
}

var INV_HEADERS = ['company', 'country', 'marketplace', 'sku', 'calculation_status', 'calculation_date',
  'd18_gap_qty', 'd18_suggested_qty', 'd30_gap_qty', 'd30_suggested_qty', 'd45_gap_qty', 'd45_suggested_qty',
  'd90_gap_qty', 'd90_suggested_qty', 'note', 'calculated_at', 'updated_at'];
var DS_H = ['snapshot_date', 'country', 'marketplace', 'channel', 'sku', 'sales_units'];
var CAMP_H = ['campaign_id', 'company', 'country', 'marketplace', 'marketplace_id', 'start_date', 'end_date', 'status'];
var CSL_H = ['campaign_sku_line_id', 'campaign_id', 'marketplace_sku_id', 'sku'];
var EVT_H = ['event_fc_id', 'company', 'country', 'marketplace', 'marketplace_id', 'sku', 'event_start_date', 'event_end_date', 'status', 'fc_qty'];
var dsDates = ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25', '2026-07-26', '2026-07-27', '2026-07-28', '2026-07-29'];

// A Sales-Driven US/Amazon SKU: 10 confirmed days × 100 units → Avg Sales/day 100. Site Stock 5000.
function salesTables(opts) {
  opts = opts || {};
  var t = {
    marketplace_skus: { headers: ['company', 'country', 'marketplace', 'sku', 'site_sku', 'marketplace_sku_id', 'replenishment_model'], rows: [['KM', 'US', 'AMAZON_US', 'CO1100-R', 'ST', 'MSK-US', 'sales_driven']] },
    marketplaces: { headers: ['marketplace_id', 'company', 'country', 'marketplace', 'fulfillment_model', 'status'], rows: [['MP1', 'KM', 'US', 'AMAZON_US', 'platform_fulfilled', 'active']] },
    warehouses: { headers: ['warehouse_id', 'company', 'country', 'is_active', 'is_factory_warehouse', 'warehouse_type'], rows: [['WH-A', 'KM', 'US', 'TRUE', 'FALSE', '3PL']] },
    sku_details: { headers: ['sku', 'units_per_carton'], rows: [['CO1100-R', 40]] },
    // regular forecast present (the destination/Site-Stock resolution runs through the monthly path). NOTE: for a
    // Sales-Driven SKU the horizon DEMAND ignores this FC (run-rate authority) — it is here only so Site Stock (the
    // horizon opening = L.currentStockQty) resolves. A Sales-Driven SKU with NO forecast has null Site Stock → BLOCKED
    // (a pre-existing opening/forecast coupling, documented — NOT the R3a contamination defect this round fixes).
    fc_regular_forecast: { headers: ['company', 'country', 'marketplace', 'sku', 'year', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'forecast_id'], rows: [['KM', 'US', 'AMAZON_US', 'CO1100-R', 2026, 0, 0, 0, 0, 0, 0, 0, 3100, 3000, 3100, 3000, 0, 'F1']] },
    amazon_inventory_snapshot: { headers: ['country', 'marketplace', 'sku', 'available_qty'], rows: [['US', 'AMAZON_US', 'CO1100-R', 5000]] },
    amazon_daily_sales_snapshot: { headers: DS_H, rows: dsDates.map(function (d) { return [d, 'US', 'AMAZON_US', 'amazon.com', 'CO1100-R', 100]; }) },
    amazon_weekly_sales_snapshot: { headers: ['week_end_date', 'country', 'marketplace', 'channel', 'sku', 'sales_units_7d'], rows: [] },
    inventory_replenishment_gap: { headers: INV_HEADERS, rows: [] }
  };
  if (!opts.omitContam) {   // contamination sources PRESENT (header-only = 0 rows) unless the test omits them
    t.campaigns = { headers: CAMP_H, rows: [] };
    t.campaign_sku_lines = { headers: CSL_H, rows: [] };
    t.fc_special_events = { headers: EVT_H, rows: [] };
  }
  if (opts.omitForecast) delete t.fc_regular_forecast;   // Sales-Driven SKU with NO regular forecast (R5 §4 case)
  return t;
}
function invRow(ss) { return H.getInvGap({ payload: { scope: { company: 'KM', country: 'US', marketplace: 'AMAZON_US' } } }, ioFor(ss)).data.rows[0]; }

// =============================================================================================================
section('§5 J — READY + deterministic recalc (Sales-Driven, valid basis, present-empty contamination)');
var ss = makeSs(salesTables());
var run1 = H.invBatch({ requestId: 'REQ-INV-1' }, ioFor(ss));
ok(run1.success === true, 'J0 batch run 1 success');
var r1 = invRow(ss);
eq(r1.calculation_status, 'READY', 'J1 Sales-Driven SKU with a valid daily-sales basis materializes READY (NOT BLOCKED)');
// avg 100/day: D18 dem 1800 vs Site 5000 → gap 0; D90 dem 9000 vs 5000 → gap 4000; suggested = ceil(4000/40)*40 = 4000.
eq([r1.d18_gap_qty, r1.d90_gap_qty], [0, 4000], 'J2 D18 gap 0 (covered), D90 gap 4000 (avg×90 − Site 5000) — run-rate authority');
eq(r1.d90_suggested_qty, 4000, 'J3 D90 suggested = CEIL(4000/40)×40 = 4000 (KMCALC carton owner)');
var run2 = H.invBatch({ requestId: 'REQ-INV-2' }, ioFor(ss));   // recalc on IDENTICAL facts
var r2 = invRow(ss);
eq([r2.calculation_status, r2.d18_gap_qty, r2.d30_gap_qty, r2.d45_gap_qty, r2.d90_gap_qty, r2.d90_suggested_qty],
   [r1.calculation_status, r1.d18_gap_qty, r1.d30_gap_qty, r1.d45_gap_qty, r1.d90_gap_qty, r1.d90_suggested_qty],
   'J4 recalc on identical facts → SAME READY status + SAME D18/D30/D45/D90 (deterministic; READY→recalc→READY)');

section('§5 K — TABLE PRESENT + 0 rows is NOT unavailable (present-empty contamination → still READY)');
var ssK = makeSs(salesTables());
H.invBatch({ requestId: 'REQ-INV-K' }, ioFor(ssK));
ok(invRow(ssK).calculation_status === 'READY', 'K1 present-but-empty campaigns/campaign_sku_lines/fc_special_events → READY (no exclusion, never SOURCE_UNAVAILABLE)');

section('§5 L — contamination source ABSENT does NOT turn READY into BLOCKED (the R3a defect, now fixed)');
var ssNoContam = makeSs(salesTables({ omitContam: true }));   // campaigns/campaign_sku_lines/fc_special_events sheets ABSENT
var runNo = H.invBatch({ requestId: 'REQ-INV-3' }, ioFor(ssNoContam));
ok(runNo.success === true, 'L0 batch success with contamination sheets absent');
var rNo = invRow(ssNoContam);
eq(rNo.calculation_status, 'READY', 'L1 absent campaign/event sheets → STILL READY (optional filter never gates READY) — deterministic vs present-empty');
eq([rNo.d18_gap_qty, rNo.d90_gap_qty], [r1.d18_gap_qty, r1.d90_gap_qty], 'L2 identical values whether contamination sheets are present-empty or absent (no exclusion either way)');

section('R5 §4 — Sales-Driven SKU with a valid Site Stock but NO regular forecast → READY (horizon opening decoupled)');
// Under R4 the unified resolver returned a null line (no monthly forecast demand) → null Site Stock → null horizons
// → HORIZONS_NOT_AVAILABLE. R5 resolves the horizon opening from the canonical Site Stock owner directly, so a
// Sales-Driven SKU with a real Site Stock + sales basis materializes READY even without any regular forecast.
var ssNoFc = makeSs(salesTables({ omitForecast: true }));
var runFc = H.invBatch({ requestId: 'REQ-INV-4' }, ioFor(ssNoFc));
ok(runFc.success === true, 'S4a batch success with no regular forecast');
var rFc = invRow(ssNoFc);
eq(rFc.calculation_status, 'READY', 'S4b Sales-Driven + valid Site Stock + no forecast → READY (was BLOCKED/HORIZONS_NOT_AVAILABLE)');
eq([rFc.d18_gap_qty, rFc.d90_gap_qty], [r1.d18_gap_qty, r1.d90_gap_qty], 'S4c same run-rate horizon values as the with-forecast case (Site Stock 5000, avg 100 → D18 0, D90 4000) — forecast never entered the horizon');
H.invBatch({ requestId: 'REQ-INV-4b' }, ioFor(ssNoFc));
eq(invRow(ssNoFc).d90_gap_qty, rFc.d90_gap_qty, 'S4d deterministic recalc (no-forecast case): READY→recalc→READY, identical D90');

section('§5 batch response is a COMPACT summary (no per-SKU payload) — §8');
eq(Object.keys(run1.data).sort().join(','), ['blocked', 'calculatedAt', 'errors', 'product', 'ready', 'scopeErrors', 'scopesCalculated', 'totalScopes', 'written'].join(','), 'RS1 batch envelope carries ONLY the compact summary counts (no per-SKU rows returned)');
ok(!Array.isArray(run1.data.lines) && run1.data.rows === undefined, 'RS2 no lines/rows array in the manual-recalc response');

console.log('\n----------------------------------------');
console.log('INVENTORY RECALC DETERMINISM (F1-4B-FM5-R4UI-R4): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
