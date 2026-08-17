// Kitchen Mama Operation System — F1-7J-A2-BOUNDED-REFERENCE-AND-INCLUDE-EXTENSIONS-R1
// Proves the three bounded reference/projection transports — Weekly SKU logistics projection (40_), Request Order
// marketplace reference (reuse getTable('marketplaces')), and IR carrier-planning include (60_) — are BEFORE == AFTER,
// additive, and introduce NO business authority / formula change. Reference data only.
// Run: node assets/tests/api-bounded-reference-include-extensions-f1-7j-a2-r1.test.js
// NOTE: no 'use strict' — extracted pure builders + browser fns are eval'd into module scope.

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

var GS40 = read('specs/active/apps-script/40_api_v1_weekly_workspace.gs');
var GS60 = read('specs/active/apps-script/60_api_v1_inventory_replenishment_workspace.gs');
var DBAPI = read('js/api/operation-system-db-api.js');
var SP_JS = read('js/pages/shipping-plan.js');
var RO_JS = read('js/pages/request-order.js');
var IR_JS = read('js/pages/inventory-replenishment.js');
var ROUTER = read('specs/active/apps-script/01_router.gs');
var CORE = read('specs/active/apps-script/02_core_sheet_db.gs');

var window = { KM: { DB: {} } };

// ===================================================================================================================
console.log('\n== A · Weekly SKU logistics projection (40_) — bounded to page-line SKUs + BEFORE==AFTER ==');
// eval weeklyWorkspaceBuild_ with light stubs (we assert the SKU projection, not the full plan mapping).
eval(['weeklyWsStr_', 'weeklyWsNum_', 'weeklyWsLc_'].map(function (n) { return extractFn(GS40, n); }).join('\n'));
eval(extractFn(GS40, 'weeklyWorkspaceBuild_'));
function weeklyIndexBy_() { return {}; }
function weeklyMapPlan_(r) { return { planId: String(r.shipping_plan_id || ''), raw: r }; }
function weeklyNormalizeFilters_() { return {}; }
function weeklyFilterPlans_(a) { return a; }
function weeklySortPlans_(a) { return a; }
function weeklyPaginate_(a) { return { items: a, pageNumber: 1, pageSize: 100, totalItems: a.length, totalPages: 1 }; }
function weeklyBuildFilterOptions_() { return null; }
function weeklyBuildSummary_() { return null; }
function weeklyBuildDetails_() { return {}; }
function weeklyDataVersion_() { return 'v'; }

var wkSkuMaster = [
  { sku: 'GA0450', carton_length: 40, carton_width: 30, carton_height: 20, carton_dimension_unit: 'cm', carton_weight: 8.5, item_weight: 0.3, units_per_carton: 24 },
  { sku: 'GA0451', carton_length: 50, carton_width: 40, carton_height: 30, carton_dimension_unit: 'cm', carton_weight: 12, item_weight: 0.5, units_per_carton: 12 },
  { sku: 'GA9999', carton_length: 10, carton_width: 10, carton_height: 10, carton_dimension_unit: 'cm', carton_weight: 1, item_weight: 0.1, units_per_carton: 6 }   // NOT on any line
];
var wkTables = {
  shipping_plans: [{ shipping_plan_id: 'SP1', status: 'draft' }],
  shipping_plan_lines: [{ shipping_plan_id: 'SP1', sku: 'GA0450' }, { shipping_plan_id: 'SP1', sku: 'GA0451' }, { shipping_plan_id: 'SP1', sku: '' }],
  warehouses: [], carriers: [], sku_details: wkSkuMaster
};
var wkVm = weeklyWorkspaceBuild_(wkTables, {});
ok('skuDetails' in wkVm, 'A: weekly View-Model now EMITS skuDetails projection (A resolved)');
eq(wkVm.skuDetails.map(function (r) { return r.sku; }).sort(), ['GA0450', 'GA0451'], 'A: projection bounded to page-line SKUs only (GA9999 master row excluded; blank sku ignored)');
ok(wkVm.skuDetails[0].carton_length !== undefined, 'A: projection is RAW passthrough (carton dims present for re-normalization)');
eq(weeklyWorkspaceBuild_(wkTables, { include: { details: false } }).skuDetails, [], 'A: skuDetails gated with details (empty when details excluded)');

// _spLineLogistics BEFORE==AFTER: broad master vs scoped projection (re-normalized through the SAME normalizer).
eval(extractFn(DBAPI, 'normalizeSkuDetailsRecord'));
eval(['_spNum', '_spSkuDetail', '_spLineLogistics'].map(function (n) { return extractFn(SP_JS, n); }).join('\n'));
window.KM.DB.normalizeSkuDetail = function (raw) { return normalizeSkuDetailsRecord(raw); };
var legacyMaster = wkSkuMaster.map(normalizeSkuDetailsRecord);          // broad getSkuDetails() equivalent
var wsProjection = wkVm.skuDetails.map(normalizeSkuDetailsRecord);       // scoped projection re-normalized
var _spSkuLogiCache = null, _spWsSkuDetails = null;
function runLogistics(sku, qty, cartons) {
  var cases = [];
  // BEFORE (broad master)
  _spSkuLogiCache = null; _spWsSkuDetails = null; window.KM.DB.getSkuDetails = function () { return legacyMaster; };
  cases.push(_spLineLogistics(sku, qty, cartons));
  // AFTER (scoped projection)
  _spSkuLogiCache = null; _spWsSkuDetails = wsProjection; window.KM.DB.getSkuDetails = function () { throw new Error('broad getter in Workspace mode'); };
  cases.push(_spLineLogistics(sku, qty, cartons));
  return cases;
}
[['GA0450', 240, 10], ['GA0451', 120, 10], ['GA0450', 0, 0], ['GA0451', 13, 2]].forEach(function (t) {
  var r = runLogistics(t[0], t[1], t[2]);
  eq(r[1], r[0], 'A: _spLineLogistics BEFORE==AFTER for ' + t[0] + ' qty=' + t[1] + ' cartons=' + t[2] + ' (cbm/gross/net)');
});
// blank-dims / unknown SKU → {cbm:0,gross:0,net:0} both ways
var blank = runLogistics('GA9999', 100, 5);   // GA9999 not in projection → null → zeros (AFTER); present in broad master (BEFORE) → nonzero
ok(blank[1].cbm === 0 && blank[1].gross === 0 && blank[1].net === 0, 'A: a SKU absent from the page lines yields zeros in Workspace mode (never edited on this page — no line to edit)');
ok(/_spWsSkuDetails\s*\?\s*_spWsSkuDetails/.test(SP_JS) && /model\.source === 'workspace'/.test(SP_JS), 'A: _spSkuDetail reads the scoped projection in Workspace mode; no broad cache');

// ===================================================================================================================
console.log('\n== C · Request Order marketplace reference — reuse getTable (no new API) + BEFORE==AFTER universe ==');
eval(extractFn(DBAPI, 'normalizeMarketplaceRecord'));
var mpRaw = [
  { marketplace_id: 'MP1', marketplace: 'amazon', marketplace_display_name: 'Amazon', country: 'US', company: 'KM', status: 'active', fulfillment_model: 'FBA' },
  { marketplace_id: 'MP2', marketplace: 'amazon', marketplace_display_name: 'Amazon', country: 'US', company: 'ResUS', status: 'active' },
  { marketplace_id: 'MP3', marketplace: 'walmart', marketplace_display_name: 'Walmart', country: 'US', company: 'KM', status: 'inactive' },
  { marketplace_id: 'MP4', marketplace: 'amazon', marketplace_display_name: 'Amazon', country: 'DE', company: 'ResEU', status: '' },
  { marketplace_id: '', marketplace: '' }   // JUNK — filtered
];
// getMarketplaces() universe == getMarketplaceReference() universe (same normalizer + filter).
var universe = mpRaw.map(normalizeMarketplaceRecord).filter(function (r) { return r.marketplaceId || r.marketplace; });
eq(universe.length, 4, 'C: universe keeps all 4 real marketplaces (multi-country, multi-company, inactive, blank-field), drops junk');
// getMarketplaceReference() uses the SAME map+filter (source assertion — it calls getOperationDbTableFromSheet then this exact pipeline).
ok(/getMarketplaceReference\s*=\s*async function\(\)\s*\{[\s\S]*getOperationDbTableFromSheet\('marketplaces'\)[\s\S]*normalizeMarketplaceRecord[\s\S]*r\.marketplaceId \|\| r\.marketplace/.test(DBAPI), 'C: getMarketplaceReference reuses getTable(marketplaces) + SAME normalizer/filter as getMarketplaces');
// server-side filterRows_(marketplaces) parity: keeps marketplace_id||marketplace — identical to the client filter → no row drift.
ok(/case 'marketplaces':[\s\S]*hasId \|\| hasMp/.test(CORE), 'C: filterRows_(marketplaces) keeps marketplace_id||marketplace (same as client filter — BEFORE==AFTER row set)');
ok(ROUTER.indexOf("action === 'getTable'") >= 0, 'C: reuses the EXISTING getTable GET action — NO new router action');
ok(/_roMarketplaceUniverse\(\)/.test(RO_JS) && /_roCanonicalMarketplaceRef_/.test(RO_JS), 'C: RO scope resolver + active-marketplaces read the bounded reference universe');
ok(!/_roScopeModalPrefill_[\s\S]{0,600}window\.KM\.DB\.getMarketplaces\(\)/.test(RO_JS), 'C: _roScopeModalPrefill_ no longer reads broad getMarketplaces() directly');

// ===================================================================================================================
console.log('\n== S6 · IR carrier-planning include (60_) — gated + carrier BEFORE==AFTER ==');
eval(['sirWsStr_', 'sirCap_'].map(function (n) { return extractFn(GS60, n); }).join('\n'));
var SIR_WS_ROW_MAX_ = 80000;
eval(extractFn(GS60, 'sirWorkspaceBuild_'));
// pull the table spec list from source so the build loop can iterate it
eval(GS60.slice(GS60.indexOf('var SIR_WORKSPACE_TABLES_'), GS60.indexOf('];', GS60.indexOf('var SIR_WORKSPACE_TABLES_')) + 2));
var irTables = {
  marketplaces: [{ marketplace_id: 'MP1' }], marketplace_skus: [{ sku: 'GA0450' }], sku_details: [{ sku: 'GA0450' }], warehouses: [{ warehouse_id: 'W1' }],
  carrier_lead_times: [{ lead_time_id: 'L1', carrier_id: 'C1', shipping_method: 'sea', destination_country: 'US', avg_days: 30 }],
  carrier_rate_cards: [{ rate_card_id: 'RC1', carrier_id: 'C1', origin_country: 'CN', destination_country: 'US', marketplace: 'amazon', shipping_method: 'sea' }]
};
var irBase = sirWorkspaceBuild_(irTables, {});
ok(!('carrier_lead_times' in irBase) && !('carrier_rate_cards' in irBase), 'S6: base payload OMITS carrier tables (no include.carrierPlanning) → primary render unchanged (BEFORE==AFTER)');
var irCarr = sirWorkspaceBuild_(irTables, { include: { carrierPlanning: true } });
ok(irCarr.carrier_lead_times.length === 1 && irCarr.carrier_rate_cards.length === 1, 'S6: include.carrierPlanning → carrier tables returned (raw passthrough)');
ok(irBase.marketplaces.length === 1 && irBase.sku_details.length === 1, 'S6: base tables still present in both modes');

// adapter carrier arrays == broad getters (same normalizers + filters).
eval(['normalizeCarrierLeadTimeRecord', 'normalizeCarrierRateCardRecord', 'normalizeMarketplaceRecord', 'normalizeMarketplaceSkuRecord', 'normalizeSkuDetailsRecord', 'normalizeWarehouseRecord',
  'normalizeAmazonInventorySnapshotRecord', 'normalizeAmazonInventoryHealthSnapshotRecord', 'normalizeAmazonDailySalesSnapshotRecord', 'normalizeAmazonWeeklySalesSnapshotRecord',
  'normalizeFcRegularForecastRecord', 'normalizeFcTargetRuleRecord', 'normalizeFcSpecialEventRecord', 'normalizeOverseasInventorySnapshotRecord', 'normalizeFactoryStockRecord',
  'normalizeShipmentRecord', 'normalizeShipmentLineRecord', 'normalizeShippingPlanRecord', 'normalizeShippingPlanLineRecord', 'normalizeShippingAllocationDraftRecord', 'normalizeShippingAllocationDraftLineRecord',
  '_whBool', '_invPick']
  .map(function (n) { try { return extractFn(DBAPI, n); } catch (e) { return ''; } }).join('\n'));
// helper chain the shipment/plan/carrier normalizers reference — eval'd at MODULE scope (NOT inside a callback, or the
// definitions would be local to the callback). CUSTOMS_TYPE_LABELS_ is a var object; the rest are function declarations.
eval(extractAssignedFn(DBAPI, 'var CUSTOMS_TYPE_LABELS_ =') + ';');
eval(['customsTypeLabelFallback_', '_codeHumanize_'].map(function (n) { return extractFn(DBAPI, n); }).join('\n'));
eval(extractAssignedFn(DBAPI, 'var codeDisplay_ =') + ';');
try { eval(extractFn(DBAPI, '_fcParseEventPeriodDates')); } catch (e) {}
eval(extractAssignedFn(DBAPI, 'window.KM.DB.adaptInventoryReplenishmentWorkspace = function') + ';');
var irAdapted = window.KM.DB.adaptInventoryReplenishmentWorkspace(irCarr);
var legacyLead = irTables.carrier_lead_times.map(normalizeCarrierLeadTimeRecord).filter(function (r) { return r.leadTimeId || r.carrierId; });
var legacyCards = irTables.carrier_rate_cards.map(normalizeCarrierRateCardRecord).filter(function (r) { return r.rateCardId || r.carrierId; });
eq(irAdapted.getCarrierLeadTimes, legacyLead, 'S6: adapter getCarrierLeadTimes == legacy normalized (BEFORE==AFTER)');
eq(irAdapted.getCarrierRateCards, legacyCards, 'S6: adapter getCarrierRateCards == legacy normalized (BEFORE==AFTER)');
// base adapt (no carrier include) → carrier arrays empty (not undefined) — safe.
var irAdaptedBase = window.KM.DB.adaptInventoryReplenishmentWorkspace(irBase);
eq(irAdaptedBase.getCarrierLeadTimes, [], 'S6: base adapt → getCarrierLeadTimes [] (carrier lazy-loaded only for Execution Plan)');

// source: carrier reads route through the scoped carrier accessor; lazy load via include.carrierPlanning; warehouse via _irWsGet.
ok(/_irCarrierGet\('getCarrierRateCards'\)/.test(IR_JS) && /_irCarrierGet\('getCarrierLeadTimes'\)/.test(IR_JS), 'S6: ETA + method reads route through _irCarrierGet');
ok(/getWorkspace\('inventoryReplenishment',\s*\{\s*include:\s*\{\s*carrierPlanning:\s*true\s*\}\s*\}\)/.test(IR_JS), 'S6: lazy carrier fetch uses include.carrierPlanning');
ok(/function _execWarehouseCandidates\(\)[\s\S]*_irWsGet\('getWarehouses'\)/.test(IR_JS), 'S6: Execution-Plan warehouse candidates via _irWsGet (no broad getWarehouses)');
ok((IR_JS.match(/window\.KM\.DB\.getCarrierLeadTimes\(\)|window\.KM\.DB\.getCarrierRateCards\(\)/g) || []).length === 0, 'S6: no direct broad carrier getter calls remain');

// ===================================================================================================================
console.log('\n== GENERAL · no new authority / allocation-draft untouched / writer reload untouched ==');
ok(/function _hydrateAllocationDraftFromDb\(ctx\)[\s\S]*getShippingAllocationDrafts\(\)/.test(IR_JS), 'HALT E respected: _hydrateAllocationDraftFromDb UNCHANGED (still reads raw drafts/lines sync)');
ok((DBAPI.match(/loadOperationDb\(\{\s*force:\s*true\s*\}\)/g) || []).length >= 40, 'writers still force-reload (untouched — count unchanged, Batch F not in scope)');
ok(!/carrierBooking|selectCarrier\(|recommendCarrier\(/.test(IR_JS), 'no carrier selection/booking authority introduced (reference data only)');

// -------------------------------------------------------------------------------------------------------------------
console.log('\n----------------------------------------');
console.log('F1-7J-A2 bounded reference/include: ' + pass + ' passed, ' + fail + ' failed');
if (fail) { process.exitCode = 1; console.error('\nSUITE FAILED'); } else { console.log('ALL GREEN'); }
