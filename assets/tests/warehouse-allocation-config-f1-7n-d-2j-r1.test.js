// Kitchen Mama Operation System — F1-7N-D-2j Site Inventory Warehouse Allocation config UX + persistence.
// Run: node assets/tests/warehouse-allocation-config-f1-7n-d-2j-r1.test.js
// -----------------------------------------------------------------------------------------------------------------
// Proves the Warehouse Allocation config over replenishment_demand_allocation_rules (the SOLE planning-membership
// authority, D-2i-R1): the backend PURE planner (scope-safe reconciliation, ratio 100% contract, FBA/execution
// rejection, single-warehouse explicit-1) and the frontend PURE helpers (3PL picker candidate set unioned with
// rule-linked warehouses, FBA excluded, validation, payload). Plus wiring source-string checks (router action,
// db-api writer, menu item, modal). NOTE: no 'use strict' — extracted pure fns eval'd into module scope.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function extractFn(src, name) {
  var sig = 'function ' + name + '('; var i = src.indexOf(sig); if (i < 0) throw new Error('fn not found: ' + name);
  var start = i, depth = 0, started = false;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') { depth++; started = true; } else if (ch === '}') { depth--; if (started && depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced fn: ' + name);
}
function extractAssignedFn(src, marker) {
  var i = src.indexOf(marker); if (i < 0) throw new Error('not found: ' + marker);
  var k = src.indexOf('{', i), depth = 0;
  for (; k < src.length; k++) { if (src[k] === '{') depth++; else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); } }
  throw new Error('unbalanced: ' + marker);
}
function section(n) { console.log('\n== ' + n + ' =='); }

var MDH = read('specs/active/apps-script/03_master_data_handlers.gs');
var ROUTER = read('specs/active/apps-script/01_router.gs');
var DBAPI = read('js/api/operation-system-db-api.js');
var IR_JS = read('js/pages/inventory-replenishment.js');
var IR_HTML = read('html/pages/inventory-replenishment.html');

// ---- eval backend pure planner + its helpers -------------------------------------------------------------------
eval(read('specs/active/apps-script/03_master_data_handlers.gs') && extractAssignedFn(MDH, 'var REPLEN_DAR_EXEC_TYPES_ =') + ';');
eval(extractFn(MDH, 'replenDarBool_'));
eval(extractFn(MDH, 'replenDarStr_'));
eval(extractFn(MDH, 'replenDarRatioBp_'));
eval(extractFn(MDH, 'replenDemandAllocationPlan_'));
// ---- eval frontend pure helpers --------------------------------------------------------------------------------
eval(extractFn(IR_JS, '_replenDarEqv'));
eval(extractFn(IR_JS, '_replenDarRuleActive'));
eval(extractFn(IR_JS, '_replenDarCandidates'));
eval(extractFn(IR_JS, '_replenDarValidate'));
eval(extractFn(IR_JS, '_replenDarBuildPayload'));

// warehouse index (RAW snake_case) for the backend planner
function wh(id, type, active, factory, company) { return { warehouse_id: id, warehouse_type: type, is_active: active === undefined ? true : active, is_factory_warehouse: !!factory, company: company || 'KM', country: 'US' }; }
var WHBYID = {
  'WH-KM-US-3PL-AMZLGS': wh('WH-KM-US-3PL-AMZLGS', '3PL', true, false),
  'WH-KM-US-3PL-WINIT': wh('WH-KM-US-3PL-WINIT', '3PL', true, false),
  'WH-KM-US-FBA-ONT8': wh('WH-KM-US-FBA-ONT8', 'FBA', true, false),
  'WH-KM-US-FACT': wh('WH-KM-US-FACT', 'FACTORY', true, true),
  'WH-KM-US-INACTIVE': wh('WH-KM-US-INACTIVE', '3PL', false, false),
  'WH-RESUS-US-3PL': wh('WH-RESUS-US-3PL', '3PL', true, false, 'ResUS'),
  'WH-KM-US-SELF-NEW': wh('WH-KM-US-SELF-NEW', 'SELF', true, false)   // future non-3PL self-operated node
};
var SCOPE = { company: 'KM', country: 'US', marketplace: 'Shopify' };

// =================================================================================================================
section('A backend planner — valid 30/70 two-warehouse split');
var A = replenDemandAllocationPlan_(SCOPE, [
  { destination_warehouse_id: 'WH-KM-US-3PL-AMZLGS', forecast_ratio: 0.3, sales_ratio: 0.3 },
  { destination_warehouse_id: 'WH-KM-US-3PL-WINIT', forecast_ratio: 0.7, sales_ratio: 0.7 }
], [], WHBYID);
ok(A.ok === true, 'A ok');
eq(A.upserts.length, 2, 'A two upserts');
eq(A.upserts[0].allocationRuleId, 'RDAR-KM-US-SHOPIFY-WH-KM-US-3PL-AMZLGS', 'A canonical allocation_rule_id');
eq(A.deactivates, [], 'A nothing to deactivate');

section('B backend planner — FBA / factory / cross-company / inactive / non-canonical all REJECTED');
ok(replenDemandAllocationPlan_(SCOPE, [{ destination_warehouse_id: 'WH-KM-US-FBA-ONT8', forecast_ratio: 1, sales_ratio: 1 }], [], WHBYID).error.indexOf('SELF_DESTINATION_INELIGIBLE') === 0, 'B FBA rejected');
ok(replenDemandAllocationPlan_(SCOPE, [{ destination_warehouse_id: 'WH-KM-US-FACT', forecast_ratio: 1, sales_ratio: 1 }], [], WHBYID).error.indexOf('SELF_DESTINATION_INELIGIBLE') === 0, 'B factory rejected');
ok(replenDemandAllocationPlan_(SCOPE, [{ destination_warehouse_id: 'WH-RESUS-US-3PL', forecast_ratio: 1, sales_ratio: 1 }], [], WHBYID).error.indexOf('DESTINATION_WAREHOUSE_INVALID') === 0, 'B cross-company rejected');
ok(replenDemandAllocationPlan_(SCOPE, [{ destination_warehouse_id: 'WH-KM-US-INACTIVE', forecast_ratio: 1, sales_ratio: 1 }], [], WHBYID).error.indexOf('DESTINATION_WAREHOUSE_INVALID') === 0, 'B inactive rejected');
ok(replenDemandAllocationPlan_(SCOPE, [{ destination_warehouse_id: 'WH-NOPE', forecast_ratio: 1, sales_ratio: 1 }], [], WHBYID).error.indexOf('DESTINATION_WAREHOUSE_INVALID') === 0, 'B non-canonical rejected');

section('C backend planner — ratio contract');
ok(replenDemandAllocationPlan_(SCOPE, [{ destination_warehouse_id: 'WH-KM-US-3PL-AMZLGS', forecast_ratio: 0.3, sales_ratio: 0.3 }, { destination_warehouse_id: 'WH-KM-US-3PL-WINIT', forecast_ratio: 0.6, sales_ratio: 0.7 }], [], WHBYID).error.indexOf('DEMAND_ALLOCATION_RATIO_TOTAL_INVALID') === 0, 'C forecast !=100% blocked');
ok(replenDemandAllocationPlan_(SCOPE, [{ destination_warehouse_id: 'WH-KM-US-3PL-AMZLGS', forecast_ratio: 1.5, sales_ratio: 1 }], [], WHBYID).error.indexOf('DEMAND_ALLOCATION_RATIO_INVALID') === 0, 'C ratio out of [0,1] blocked');
ok(replenDemandAllocationPlan_(SCOPE, [{ destination_warehouse_id: 'WH-KM-US-3PL-AMZLGS', forecast_ratio: 0.5, sales_ratio: 0.5 }, { destination_warehouse_id: 'WH-KM-US-3PL-AMZLGS', forecast_ratio: 0.5, sales_ratio: 0.5 }], [], WHBYID).error.indexOf('DEMAND_ALLOCATION_DESTINATION_CONFLICT') === 0, 'C duplicate destination blocked');

section('D backend planner — single warehouse explicit 1/1 (EXPLICIT_1_REQUIRED)');
var D = replenDemandAllocationPlan_(SCOPE, [{ destination_warehouse_id: 'WH-KM-US-3PL-AMZLGS', forecast_ratio: 1, sales_ratio: 1 }], [], WHBYID);
ok(D.ok === true && D.upserts.length === 1, 'D single-warehouse 1/1 valid');
ok(replenDemandAllocationPlan_(SCOPE, [], [], WHBYID).error.indexOf('NO_WAREHOUSE_SELECTED') === 0, 'D empty selection fail-closed (no implicit clear)');

section('E backend planner — scope-safe reconciliation (unselected previously-active → deactivate)');
var E = replenDemandAllocationPlan_(SCOPE, [{ destination_warehouse_id: 'WH-KM-US-3PL-AMZLGS', forecast_ratio: 1, sales_ratio: 1 }],
  [{ destination_warehouse_id: 'WH-KM-US-3PL-AMZLGS' }, { destination_warehouse_id: 'WH-KM-US-3PL-WINIT' }], WHBYID);
ok(E.ok === true, 'E ok');
eq(E.deactivates, ['WH-KM-US-3PL-WINIT'], 'E previously-active WINIT (no longer selected) deactivated; AMZLGS retained');

section('F backend planner — future non-3PL SELF-operated warehouse ADMITTED (exclusion, not 3PL-only)');
var F = replenDemandAllocationPlan_(SCOPE, [{ destination_warehouse_id: 'WH-KM-US-SELF-NEW', forecast_ratio: 1, sales_ratio: 1 }], [], WHBYID);
ok(F.ok === true, 'F non-3PL non-execution self warehouse accepted by SAVE (rules are membership authority)');

// =================================================================================================================
// Frontend candidate helper (normalized camelCase warehouses + rules)
function nwh(id, type, active, company) { return { warehouseId: id, warehouseType: type, isActive: active === undefined ? true : active, company: company || 'KM', country: 'US', warehouseName: id }; }
var WHS = [
  nwh('WH-KM-US-3PL-AMZLGS', '3PL', true), nwh('WH-KM-US-3PL-WINIT', '3PL', true),
  nwh('WH-KM-US-FBA-ONT8', 'FBA', true), nwh('WH-KM-US-FBA-ABE2', 'FBA', true),
  nwh('WH-KM-US-FACT', 'FACTORY', true), nwh('WH-RESUS-US-3PL', '3PL', true, 'ResUS'),
  nwh('WH-KM-US-SELF-NEW', 'SELF', true)
];
var RULES = [
  { company: 'KM', country: 'US', marketplace: 'Shopify', destinationWarehouseId: 'WH-KM-US-3PL-AMZLGS', forecastAllocationRatio: 0.3, salesAllocationRatio: 0.4, status: 'active' },
  { company: 'KM', country: 'US', marketplace: 'Shopify', destinationWarehouseId: 'WH-KM-US-SELF-NEW', forecastAllocationRatio: 0.7, salesAllocationRatio: 0.6, status: 'active' },
  { company: 'KM', country: 'US', marketplace: 'Target', destinationWarehouseId: 'WH-KM-US-3PL-WINIT', forecastAllocationRatio: 1, salesAllocationRatio: 1, status: 'active' }
];

section('G frontend candidates — 3PL picker set UNION rule-linked; FBA/FACTORY/cross-company excluded');
var G = _replenDarCandidates(WHS, RULES, SCOPE);
var Gids = G.map(function (r) { return r.warehouseId; });
ok(Gids.indexOf('WH-KM-US-3PL-AMZLGS') !== -1 && Gids.indexOf('WH-KM-US-3PL-WINIT') !== -1, 'G both KM 3PL shown');
ok(Gids.indexOf('WH-KM-US-FBA-ONT8') === -1 && Gids.indexOf('WH-KM-US-FBA-ABE2') === -1, 'G FBA FCs NOT offered');
ok(Gids.indexOf('WH-KM-US-FACT') === -1, 'G factory NOT offered');
ok(Gids.indexOf('WH-RESUS-US-3PL') === -1, 'G cross-company (ResUS) NOT offered');
ok(Gids.indexOf('WH-KM-US-SELF-NEW') !== -1, 'G rule-linked non-3PL self warehouse IS shown (membership preserved)');

section('H frontend candidates — hydrate checked + ratios from active scope rules');
var amz = G.filter(function (r) { return r.warehouseId === 'WH-KM-US-3PL-AMZLGS'; })[0];
var winit = G.filter(function (r) { return r.warehouseId === 'WH-KM-US-3PL-WINIT'; })[0];
ok(amz.checked === true && amz.forecastPct === 30 && amz.salesPct === 40, 'H AMZLGS hydrated from active rule (30/40)');
ok(winit.checked === false && winit.forecastPct === '' && winit.salesPct === '', 'H WINIT unselected / neutral (no rule)');

section('I frontend validation + payload');
ok(_replenDarValidate([{ warehouseId: 'A', checked: true, forecastPct: 30, salesPct: 30 }, { warehouseId: 'B', checked: true, forecastPct: 70, salesPct: 70 }]).ok === true, 'I 30/70 valid');
ok(_replenDarValidate([{ warehouseId: 'A', checked: true, forecastPct: 30, salesPct: 30 }, { warehouseId: 'B', checked: true, forecastPct: 60, salesPct: 70 }]).ok === false, 'I forecast !=100 blocked');
ok(_replenDarValidate([{ warehouseId: 'A', checked: true, forecastPct: 30, salesPct: 30 }, { warehouseId: 'B', checked: true, forecastPct: 70, salesPct: 60 }]).ok === false, 'I sales !=100 blocked');
ok(_replenDarValidate([]).ok === false, 'I no selection blocked');
ok(_replenDarValidate([{ warehouseId: 'A', checked: true, forecastPct: 100, salesPct: 100 }]).ok === true, 'I single 100/100 valid');
var pl = _replenDarBuildPayload(SCOPE, [{ warehouseId: 'WH-A', checked: true, forecastPct: 30, salesPct: 30 }, { warehouseId: 'WH-B', checked: true, forecastPct: 70, salesPct: 70 }, { warehouseId: 'WH-C', checked: false, forecastPct: '', salesPct: '' }]);
eq(pl, { company: 'KM', country: 'US', marketplace: 'Shopify', allocations: [{ destination_warehouse_id: 'WH-A', forecast_ratio: 0.3, sales_ratio: 0.3 }, { destination_warehouse_id: 'WH-B', forecast_ratio: 0.7, sales_ratio: 0.7 }] }, 'I payload = scope + checked allocations (ratios /100)');

section('J wiring — router action, db-api writer, menu item, modal, action branch');
ok(/action === 'replenishmentDemandAllocation\.save'/.test(ROUTER) && /handleReplenishmentDemandAllocationSave_\(body\)/.test(ROUTER), 'J router registers replenishmentDemandAllocation.save');
ok(ROUTER.indexOf('replenishmentDemandAllocation.save') !== -1 && /Supported:[^']*replenishmentDemandAllocation\.save/.test(ROUTER), 'J action listed in fallthrough');
ok(/saveReplenishmentDemandAllocationRules = async function/.test(DBAPI) && DBAPI.indexOf("action: 'replenishmentDemandAllocation.save'") !== -1, 'J db-api writer posts the action');
ok(IR_HTML.indexOf("runReplenAction('demandAllocation')") !== -1 && IR_HTML.indexOf('id="replen-dar-modal"') !== -1, 'J menu item + modal present in HTML');
ok(IR_JS.indexOf("kind === 'demandAllocation'") !== -1 && IR_JS.indexOf('window.openReplenDemandAllocationModal') !== -1, 'J page wires the action + exports modal opener');

console.log('\n----------------------------------------');
console.log('WAREHOUSE ALLOCATION CONFIG (F1-7N-D-2j): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
