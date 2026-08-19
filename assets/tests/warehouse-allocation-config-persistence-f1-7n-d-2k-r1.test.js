// Kitchen Mama Operation System — F1-7N-D-2k-R1 Warehouse Allocation SYSTEM-CONFIG persistence reconciliation.
// Run: node assets/tests/warehouse-allocation-config-persistence-f1-7n-d-2k-r1.test.js
// -----------------------------------------------------------------------------------------------------------------
// Proves CASE B: the Warehouse Allocation config now persists in the KM_WAREHOUSE_ALLOCATION_CONFIG Script-Property
// JSON blob (owner 50_api_v1_warehouse_allocation_config.gs) instead of the replenishment_demand_allocation_rules
// Google Sheet tab, while the frozen KMDA rule MODEL is preserved unchanged (the blob is materialized into the SAME
// snake-case rule rows KMDA consumes). Verifies: save/reopen round-trip, single-warehouse 1/1, invalid totals
// blocked, Walmart self lane vs platform lane, FBA FC never selected, HEADLESS backend + scheduler read parity
// (PropertiesService only, no browser), no localStorage, no second (Sheet-tab) authority, no Request/PO/shipment
// side effect, Monthly + count-once unchanged. NO 'use strict' — extracted pure fns eval'd into module scope.

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
function section(n) { console.log('\n== ' + n + ' =='); }

var WAC = read('specs/active/apps-script/50_api_v1_warehouse_allocation_config.gs');
var MDH = read('specs/active/apps-script/03_master_data_handlers.gs');
var ROUTER = read('specs/active/apps-script/01_router.gs');
var RECO = read('specs/active/apps-script/42_api_v1_recommendation_workspace.gs');
var DBAPI = read('js/api/operation-system-db-api.js');
var IR_JS = read('js/pages/inventory-replenishment.js');
var IR_HTML = read('html/pages/inventory-replenishment.html');

// ---- the real frozen KMDA rule engine (UMD; storage-agnostic — consumes injected rows) -------------------------
var KMDA = require('../js/core/supply-planning-demand-allocation.js');

// ---- eval 50_ PURE config fns (dependency order) ----------------------------------------------------------------
eval(extractFn(WAC, 'waStr_'));
eval(extractFn(WAC, 'waScopeKey_'));
eval(extractFn(WAC, 'waRuleId_'));
eval(extractFn(WAC, 'waNumOrNull_'));
var WAREHOUSE_ALLOCATION_CONFIG_VERSION_ = 1;
eval(extractFn(WAC, 'warehouseAllocationParseConfig_'));
eval(extractFn(WAC, 'warehouseAllocationSerializeConfig_'));
eval(extractFn(WAC, 'warehouseAllocationConfigToRuleRows_'));
eval(extractFn(WAC, 'warehouseAllocationUpsertScope_'));
// backend materializer (io-injected → headless / scheduler-readable)
eval(extractFn(WAC, 'warehouseAllocationRuleRows_'));

// ---- eval D-2j PURE planner (unchanged; the validation authority the writer reuses) -----------------------------
eval((WAC && extractFn(MDH, 'replenDarStr_')));
eval(extractFn(MDH, 'replenDarBool_'));
eval(extractFn(MDH, 'replenDarRatioBp_'));
eval('var REPLEN_DAR_EXEC_TYPES_ = { FBA: 1, RETURN: 1, FACTORY: 1 };');
eval(extractFn(MDH, 'replenDemandAllocationPlan_'));

// ---- eval frontend hydrate helpers ------------------------------------------------------------------------------
eval(extractFn(IR_JS, '_replenDarEqv'));
eval(extractFn(IR_JS, '_replenDarRuleActive'));
eval(extractFn(IR_JS, '_replenDarCandidates'));
eval(extractFn(IR_JS, '_replenDarConfigToRuleRows'));

// ---- in-memory Script-Property IO (the fake the production default-IO seam abstracts) ---------------------------
function makeIo() { var s = { v: null }; return { getConfig: function () { return s.v; }, setConfig: function (v) { s.v = v; }, stamp: function () { return '2026-08-19'; }, _s: s }; }
function wh(id, type, active, factory, company) { return { warehouse_id: id, warehouse_type: type, is_active: active === undefined ? true : active, is_factory_warehouse: !!factory, company: company || 'KM', country: 'US' }; }
var WHBYID = {
  'WH-KM-US-3PL-AMZLGS': wh('WH-KM-US-3PL-AMZLGS', '3PL', true, false),
  'WH-KM-US-3PL-WINIT': wh('WH-KM-US-3PL-WINIT', '3PL', true, false),
  'WH-KM-US-FBA-ONT8': wh('WH-KM-US-FBA-ONT8', 'FBA', true, false)
};
// mirrors handleReplenishmentDemandAllocationSave_ core sequence (parse → validate → upsert → serialize) headlessly.
function saveScope(io, scope, allocations) {
  var cfg = warehouseAllocationParseConfig_(io.getConfig());
  var existing = warehouseAllocationConfigToRuleRows_(cfg, scope);
  var plan = replenDemandAllocationPlan_(scope, allocations, existing, WHBYID);
  if (!plan.ok) return { ok: false, error: plan.error };
  io.setConfig(warehouseAllocationSerializeConfig_(warehouseAllocationUpsertScope_(cfg, scope, plan.upserts, 'tester', io.stamp())));
  return { ok: true, active: plan.upserts, deactivated: plan.deactivates };
}
// mirrors the modal read handler (warehouseAllocation.get) — scope-targeted allocations from the blob.
function readScope(io, scope) {
  var rows = warehouseAllocationConfigToRuleRows_(warehouseAllocationParseConfig_(io.getConfig()), scope);
  return { company: scope.company, country: scope.country, marketplace: scope.marketplace, allocations: rows.map(function (r) { return { destination_warehouse_id: r.destination_warehouse_id, forecast_ratio: r.forecast_allocation_ratio, sales_ratio: r.sales_allocation_ratio, status: 'active' }; }) };
}
var SHOPIFY = { company: 'KM', country: 'US', marketplace: 'Shopify' };
var WALMART = { company: 'KM', country: 'US', marketplace: 'Walmart' };

// =================================================================================================================
section('1 Shopify config SAVE 30/70 (persists to the Script-Property blob, not a Sheet tab)');
var io = makeIo();
var s1 = saveScope(io, SHOPIFY, [
  { destination_warehouse_id: 'WH-KM-US-3PL-AMZLGS', forecast_ratio: 0.3, sales_ratio: 0.3 },
  { destination_warehouse_id: 'WH-KM-US-3PL-WINIT', forecast_ratio: 0.7, sales_ratio: 0.7 }
]);
ok(s1.ok === true, '1 save ok');
ok(typeof io._s.v === 'string' && io._s.v.indexOf('KM||US||Shopify') !== -1, '1 blob holds the scope key');
ok(io._s.v.indexOf('replenishment_demand_allocation_rules') === -1, '1 blob is NOT a Sheet tab (no tab name persisted)');

section('2 reopen → hydrates 30/70 (getWarehouseAllocationConfig → _replenDarConfigToRuleRows → _replenDarCandidates)');
var data2 = readScope(io, SHOPIFY);
var rows2 = _replenDarConfigToRuleRows(data2);
var nwh = function (id, type) { return { warehouseId: id, warehouseType: type, isActive: true, company: 'KM', country: 'US', warehouseName: id }; };
var cand2 = _replenDarCandidates([nwh('WH-KM-US-3PL-AMZLGS', '3PL'), nwh('WH-KM-US-3PL-WINIT', '3PL')], rows2, SHOPIFY);
var amz = cand2.filter(function (r) { return r.warehouseId === 'WH-KM-US-3PL-AMZLGS'; })[0];
var win = cand2.filter(function (r) { return r.warehouseId === 'WH-KM-US-3PL-WINIT'; })[0];
ok(amz && amz.checked === true && amz.forecastPct === 30 && amz.salesPct === 30, '2 AMZLGS hydrated 30/30');
ok(win && win.checked === true && win.forecastPct === 70 && win.salesPct === 70, '2 WINIT hydrated 70/70');

section('3 single warehouse → explicit 1/1');
var io3 = makeIo();
saveScope(io3, SHOPIFY, [{ destination_warehouse_id: 'WH-KM-US-3PL-AMZLGS', forecast_ratio: 1, sales_ratio: 1 }]);
var only = warehouseAllocationConfigToRuleRows_(warehouseAllocationParseConfig_(io3._s.v), SHOPIFY);
eq(only.length, 1, '3 one row');
ok(only[0].forecast_allocation_ratio === 1 && only[0].sales_allocation_ratio === 1, '3 explicit 1.0 / 1.0');

section('4 invalid totals blocked (config never written on a bad save)');
var io4 = makeIo();
var s4 = saveScope(io4, SHOPIFY, [
  { destination_warehouse_id: 'WH-KM-US-3PL-AMZLGS', forecast_ratio: 0.3, sales_ratio: 0.3 },
  { destination_warehouse_id: 'WH-KM-US-3PL-WINIT', forecast_ratio: 0.6, sales_ratio: 0.7 }
]);
ok(s4.ok === false && s4.error.indexOf('DEMAND_ALLOCATION_RATIO_TOTAL_INVALID') === 0, '4 forecast != 100% rejected');
ok(io4._s.v === null, '4 blob untouched on invalid save (atomic — no partial ratios)');

section('5 Walmart SELF lane uses config; the SAME frozen KMDA rule model validates + allocates the materialized rows');
saveScope(io, WALMART, [{ destination_warehouse_id: 'WH-KM-US-3PL-WINIT', forecast_ratio: 1, sales_ratio: 1 }]);
var wmRows = warehouseAllocationConfigToRuleRows_(warehouseAllocationParseConfig_(io._s.v), WALMART);
var active = KMDA.readActiveAllocationRules(wmRows, WALMART, '2026-08');
var ruleset = KMDA.validateAllocationRules(active, WALMART, { 'WH-KM-US-3PL-WINIT': { is_active: true, company: 'KM' } });
ok(ruleset.ok === true, '5 materialized Walmart rows pass KMDA.validateAllocationRules (rule model preserved)');
var split = KMDA.allocateMarketplaceDemand(137, ruleset, 'forecast');
ok(split.ready === true && split.byKey['WH-KM-US-3PL-WINIT'] === 137, '5 KMDA allocates the Walmart self demand to the configured warehouse');

section('6 Walmart PLATFORM lane ignores config — a scope with no saved self rows materializes to []');
var none = warehouseAllocationConfigToRuleRows_(warehouseAllocationParseConfig_(io._s.v), { company: 'KM', country: 'US', marketplace: 'Amazon' });
eq(none, [], '6 unsaved (platform) scope → no allocation rows (platform destination stays logical MARKETPLACE)');

section('7 Amazon physical FBA FC never selected (rejected at SAVE → never persisted → never materialized)');
var io7 = makeIo();
var s7 = saveScope(io7, SHOPIFY, [{ destination_warehouse_id: 'WH-KM-US-FBA-ONT8', forecast_ratio: 1, sales_ratio: 1 }]);
ok(s7.ok === false && s7.error.indexOf('SELF_DESTINATION_INELIGIBLE') === 0, '7 FBA FC rejected by the writer');
ok(io7._s.v === null, '7 FBA never enters the config blob');

section('8 backend Weekly AI Plan reads the config HEADLESSLY (warehouseAllocationRuleRows_ via injected io; no browser)');
var allRows = warehouseAllocationRuleRows_(io);
ok(allRows.length >= 3, '8 all-scope rule rows materialized from the blob (Shopify 2 + Walmart 1)');
ok(allRows.every(function (r) { return r.status === 'active' && r.company && r.destination_warehouse_id; }), '8 rows are the canonical snake shape KMDA consumes');

section('9 scheduled Weekly owner reads the SAME config (deterministic; identical bytes → identical rows)');
eq(warehouseAllocationRuleRows_(io), warehouseAllocationRuleRows_(io), '9 two headless reads of the same blob are identical (scheduler parity)');
ok(/PropertiesService\.getScriptProperties\(\)\.getProperty\(WAREHOUSE_ALLOCATION_CONFIG_PROP_KEY_\)/.test(WAC), '9 default IO reads the Script Property (backend + time-trigger readable, no session)');
ok(RECO.indexOf('snaps.replenishmentDemandAllocationRules = warehouseAllocationSnapshot_()') !== -1, '9 the server planning path (42_) overrides the rule snapshot with the config at its read boundary');

section('10 NO browser/localStorage dependency anywhere in the config persistence path');
ok(WAC.indexOf('localStorage') === -1 && WAC.indexOf('sessionStorage') === -1, '10 config owner never touches browser storage');
ok(RECO.indexOf('warehouseAllocationSnapshot_') !== -1, '10 server reads the config (materialized snapshot), not a browser cache');
ok(/getWarehouseAllocationConfig\s*=\s*async function/.test(DBAPI) && DBAPI.indexOf("action: 'warehouseAllocation.get'") !== -1, '10 frontend read is a backend fetch (config is server-owned, not browser-persisted)');

section('11 NO second authority — the Sheet tab is retired; the config replaces the snapshot at the single read boundary');
ok(RECO.indexOf('warehouseAllocationSnapshot_()') !== -1, '11 42_ overrides the Sheet snapshot with the config (retired Sheet rows discarded, never planning authority)');
var writer = extractFn(MDH, 'handleReplenishmentDemandAllocationSave_');
ok(writer.indexOf("getSheetByName('replenishment_demand_allocation_rules')") === -1 && writer.indexOf('appendRow') === -1, '11 writer no longer reads/writes the Sheet tab');
ok(writer.indexOf('warehouseAllocationConfigIo_') !== -1 && writer.indexOf('io.setConfig') !== -1, '11 writer persists to the Script-Property config blob');

section('12 NO Request Order / PO / shipment side effect (config owner + writer touch none)');
ok(WAC.indexOf('request_order') === -1 && WAC.indexOf('purchase_order') === -1 && WAC.indexOf('shipment') === -1 && WAC.indexOf('shipping_plan') === -1, '12 config owner writes nothing but its own Script Property');
ok(writer.indexOf('request_order') === -1 && writer.indexOf('purchase_order') === -1 && writer.indexOf('shipments') === -1, '12 writer has no Request/PO/shipment side effect');
ok(WAC.indexOf('appendRow') === -1 && WAC.indexOf('setValue') === -1, '12 config owner performs no spreadsheet DB write');

section('13 Monthly unchanged — the MARKETPLACE (Monthly Order) expander never consumes allocation rules');
var mkt = extractFn(RECO, 'recoWsExpandMarketplace_');
ok(mkt.indexOf('recoWsAllocationRuleRows_') === -1 && mkt.indexOf('replenishmentDemandAllocationRules') === -1, '13 Monthly/MARKETPLACE path untouched by the storage move');

section('14 count-once unchanged — KMDA largest-remainder conserves the demand qty exactly');
var io14 = makeIo();
saveScope(io14, SHOPIFY, [
  { destination_warehouse_id: 'WH-KM-US-3PL-AMZLGS', forecast_ratio: 0.3, sales_ratio: 0.3 },
  { destination_warehouse_id: 'WH-KM-US-3PL-WINIT', forecast_ratio: 0.7, sales_ratio: 0.7 }
]);
var rs14 = KMDA.validateAllocationRules(KMDA.readActiveAllocationRules(warehouseAllocationRuleRows_(io14), SHOPIFY, '2026-08'), SHOPIFY, { 'WH-KM-US-3PL-AMZLGS': { is_active: true, company: 'KM' }, 'WH-KM-US-3PL-WINIT': { is_active: true, company: 'KM' } });
var sp14 = KMDA.allocateMarketplaceDemand(101, rs14, 'forecast');
ok(sp14.ready === true && (sp14.byKey['WH-KM-US-3PL-AMZLGS'] + sp14.byKey['WH-KM-US-3PL-WINIT']) === 101, '14 split conserves 101 exactly (30/71 largest-remainder; counted once)');

section('R round-trip — save → serialize → parse → materialize is byte-stable');
var io2 = makeIo();
saveScope(io2, SHOPIFY, [{ destination_warehouse_id: 'WH-KM-US-3PL-AMZLGS', forecast_ratio: 1, sales_ratio: 1 }]);
eq(readScope(io2, SHOPIFY).allocations, [{ destination_warehouse_id: 'WH-KM-US-3PL-AMZLGS', forecast_ratio: 1, sales_ratio: 1, status: 'active' }], 'R read-back equals what was saved');

section('S wiring — router action + async modal + config materializer helper');
ok(/action === 'warehouseAllocation\.get'/.test(ROUTER) && /handleWarehouseAllocationConfigGet_\(body\)/.test(ROUTER), 'S router registers warehouseAllocation.get');
ok(ROUTER.indexOf('warehouseAllocation.get') !== -1 && /Supported:[^']*warehouseAllocation\.get/.test(ROUTER), 'S action listed in fallthrough');
ok(/async function openReplenDemandAllocationModal/.test(IR_JS) && IR_JS.indexOf('getWarehouseAllocationConfig(scope)') !== -1, 'S modal hydrates async from the config');
ok(IR_JS.indexOf('window._replenDarConfigToRuleRows') !== -1, 'S config→ruleRows helper exported');

console.log('\n----------------------------------------');
console.log('WAREHOUSE ALLOCATION CONFIG PERSISTENCE (F1-7N-D-2k-R1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
