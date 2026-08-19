// Kitchen Mama Operation System — F1-7N-D-2f-R2 workspace fulfillment_model DTO projection.
// Run: node assets/tests/weekly-ai-plan-workspace-fulfillment-projection-f1-7n-d-2f-r2.test.js
// -----------------------------------------------------------------------------------------------------------------
// The live weekly harvest (61_) reads line.fulfillmentModel, but handleRecommendationWorkspaceGet_ never emitted it
// even though it already resolves the canonical marketplaces.fulfillment_model internally (recoWsResolveFulfillment_).
// This proves the additive projection: every response line now carries the canonical fulfillment_model VERBATIM from
// the single owner (never re-read, never inferred from the marketplace name), and fails closed to '' when no
// marketplaces row exists. Uses the same bundle+handler eval harness as the FM4a horizon-transport suite.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var BUNDLE = read('specs/active/apps-script/90_generated_supply_planning_bundle.gs');
var HANDLER = read('specs/active/apps-script/42_api_v1_recommendation_workspace.gs');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }

var H = (new Function(BUNDLE + '\n' + HANDLER + '\n return { handle: handleRecommendationWorkspaceGet_ };'))();

function makeSs(tables) {
  return { getSheetByName: function (name) {
    var t = tables[name]; if (!t) return null; var values = [t.headers].concat(t.rows);
    return { getLastRow: function () { return values.length; }, getLastColumn: function () { return t.headers.length; },
      getDataRange: function () { return { getValues: function () { return values; } }; },
      getRange: function () { return { setValues: function () {}, setValue: function () {} }; }, appendRow: function () {} };
  } };
}
function io(ss) { return { now: function () { return 0; }, nextSeq: function () { return 1; }, configMonth: function () { return '2026-08'; }, configDate: function () { return '2026-08-07'; }, openTarget: function () { return ss; } }; }
function body(mkt) { return { requestId: 'REQ-D2F', payload: { scope: { company: 'KM', country: 'US', marketplace: mkt }, pagination: { page: 1, size: 100 } } }; }
var FC_HEADERS = ['company', 'country', 'marketplace', 'sku', 'year', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'forecast_id'];
function fcRow(mkt) { return ['KM', 'US', mkt, 'CO1100', 2026, 0, 0, 0, 0, 0, 0, 0, 3100, 3000, 3100, 3000, 0, 'FC-1']; }

// One scope's canonical tables; `fm` = marketplaces.fulfillment_model; `mktRow=false` omits the marketplaces row.
function tablesFor(mkt, fm, mktRow) {
  return {
    marketplace_skus: { headers: ['company', 'country', 'marketplace', 'sku', 'site_sku', 'replenishment_model'], rows: [['KM', 'US', mkt, 'CO1100', 'ST', 'forecast_driven']] },
    marketplaces: { headers: ['marketplace_id', 'company', 'country', 'marketplace', 'fulfillment_model', 'status'], rows: (mktRow === false ? [] : [['MP1', 'KM', 'US', mkt, fm, 'active']]) },
    warehouses: { headers: ['warehouse_id', 'company', 'country', 'is_active', 'is_factory_warehouse', 'warehouse_type'], rows: [['WH-A', 'KM', 'US', 'TRUE', 'FALSE', '3PL']] },
    sku_details: { headers: ['sku', 'units_per_carton'], rows: [['CO1100', 40]] },
    fc_regular_forecast: { headers: FC_HEADERS, rows: [fcRow(mkt)] },
    amazon_inventory_snapshot: { headers: ['country', 'marketplace', 'sku', 'available_qty'], rows: [['US', mkt, 'CO1100', 5000]] }
  };
}
function runLines(mkt, fm, mktRow) {
  var env = H.handle(body(mkt), io(makeSs(tablesFor(mkt, fm, mktRow))));
  return { env: env, lines: (env && env.data && env.data.lines) ? env.data.lines : [] };
}

// =================================================================================================================
section('A platform_fulfilled → line.fulfillmentModel emitted verbatim (MARKETPLACE mode)');
var A = runLines('AMAZON_US', 'platform_fulfilled', true);
ok(A.env.success === true, 'A success');
ok(A.lines.length > 0, 'A produced lines');
ok(A.lines.every(function (l) { return l.fulfillmentModel === 'platform_fulfilled'; }), 'A every line carries fulfillmentModel="platform_fulfilled"');

section('B self_fulfilled → line.fulfillmentModel emitted (WAREHOUSE mode; even a rule-blocked line carries it)');
var B = runLines('SHOPIFY_US', 'self_fulfilled', true);
ok(B.lines.length > 0, 'B produced lines (blocked or not)');
ok(B.lines.every(function (l) { return l.fulfillmentModel === 'self_fulfilled'; }), 'B every line carries fulfillmentModel="self_fulfilled"');

section('C hybrid marketplace + BLANK SKU-level fulfillment_model → per-SKU fail-closed (D-2h supersede)');
// Post-D-2h a hybrid marketplace resolves PER SKU from marketplace_skus.fulfillment_model; the fixture omits it, so
// the SKU-level value is blank → effective model '' → destination UNRESOLVED (never the marketplace-level 'hybrid').
var C = runLines('WALMART_US', 'hybrid', true);
ok(C.lines.length > 0, 'C produced lines');
ok(C.lines.every(function (l) { return l.fulfillmentModel === ''; }), 'C blank SKU-level → fulfillmentModel="" (per-SKU resolution, not marketplace-level hybrid)');
ok(C.lines.every(function (l) { return l.blocked === true && l.blockedReason === 'DESTINATION_AUTHORITY_UNRESOLVED'; }), 'C blank/both-lane SKU stays UNRESOLVED (never guessed)');

section('D no marketplaces row → fail-closed fulfillmentModel="" (never inferred from marketplace name)');
var D = runLines('MYSTERY_US', 'self_fulfilled', false);
ok(D.lines.length > 0, 'D produced (UNRESOLVED) lines');
ok(D.lines.every(function (l) { return l.fulfillmentModel === ''; }), 'D fulfillmentModel="" when no canonical marketplaces row');

section('E consumer contract — 61_ reads exactly line.fulfillmentModel');
var HARVEST = read('specs/active/apps-script/61_api_v1_weekly_ai_plan.gs');
ok(HARVEST.indexOf('line.fulfillmentModel') !== -1, 'E 61_ consumes line.fulfillmentModel (property name matches producer)');
// mirror 61_'s exact read to prove the value flows through
var siteFulfillment = (function (line) { function s(v) { return String(v === undefined || v === null ? '' : v).trim(); } return s(line.fulfillmentModel); })(A.lines[0]);
eq(siteFulfillment, 'platform_fulfilled', 'E 61_-style read of line.fulfillmentModel yields the canonical value');

console.log('\n----------------------------------------');
console.log('WEEKLY AI PLAN WORKSPACE FULFILLMENT PROJECTION (F1-7N-D-2f-R2): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
