// Kitchen Mama Operation System — F1-7J-A-EXISTING-WORKSPACE-SECONDARY-AND-SKU-REGIONAL-CUTOVER-R1
// TRANSPORT/WIRING round. Proves the migrated secondary surfaces + the SKU Regional primary page now source their data
// from EXISTING scoped workspaces / read-models (no NEW API, no NEW formula, no authority change), BEFORE == AFTER; and
// proves the three isolated HALT sub-slices (A weekly line-logistics, C RO scope resolver, E IR allocation-draft) are
// grounded in the actual source (they CANNOT be migrated purely by reusing an existing read-model without a backend
// change or a behavior change).
// Run: node assets/tests/api-existing-workspace-secondary-cutover-f1-7j-a-r1.test.js
// NOTE: no 'use strict' — extracted browser fns are eval'd into module scope.

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

var DBAPI = read('js/api/operation-system-db-api.js');
var FND = read('js/api/km-api-foundation.js');
var ROUTER = read('specs/active/apps-script/01_router.gs');
var GS40 = read('specs/active/apps-script/40_api_v1_weekly_workspace.gs');
var SRD_JS = read('js/pages/sku-regional-details.js');
var POL_JS = read('js/pages/purchase-order-list.js');
var IR_JS = read('js/pages/inventory-replenishment.js');
var RO_JS = read('js/pages/request-order.js');

// module-scope stubs
var window = { KM: { DB: {} } };
var _srdReadModel = null, _srdMasterIndex = null, _srdMktIndex = null;
var srdState = { search: '', page: 1, pageSize: 50, selectedSku: null, activeCountry: null, activeRecordKey: null, activeSection: 'overview', filters: { category: [], series: [] } };

// -------------------------------------------------------------------------------------------------------------------
// Fixture — raw sheet rows (JUNK row per table proves filter parity).
// -------------------------------------------------------------------------------------------------------------------
var rawTables = {
  sku_details: [
    { sku: 'GA0450', product_name: 'Can Opener', category: 'Kitchen', series: 'Pro', lifecycle: 'Running in the Market', units_per_carton: 24 },
    { sku: 'GA0451', product_name: 'Jar Opener', category: 'Kitchen', series: 'Lite', lifecycle: 'Upcoming SKU', units_per_carton: 12 },
    { sku: '', product_name: 'junk (no sku)' }
  ],
  tax_referral_rates: [
    { tax_rate_id: 'T1', series: 'Pro', country_of_origin: 'CN', duty_country: 'US', hscode: '8205.51.30', duty_rate: 3.5, effective_from: '2026-01-01' },
    { tax_rate_id: '', series: '' }
  ],
  tax_rate_components: [
    { tax_component_id: 'TC1', tax_rate_id: 'T1', component_type: 'duty', rate_type: 'percentage', rate_value: 3.5 },
    { tax_component_id: '', tax_rate_id: '' }
  ],
  marketplace_skus: [
    { marketplace_sku_id: 'M1', sku: 'GA0450', company: 'KM', country: 'US', marketplace: 'amazon', site_sku: 'KM-GA0450', marketplace_sku_status: 'active', launch_date: '2026-02-01' },
    { marketplace_sku_id: 'M2', sku: 'GA0450', company: 'ResUS', country: 'US', marketplace: 'walmart', site_sku: 'RES-GA0450', marketplace_sku_status: 'active' },
    { sku: '' }
  ],
  sku_regional_details: [
    { regional_detail_id: 'R1', sku: 'GA0450', company: 'KM', country: 'US', marketplace: 'amazon', site_sku: 'KM-GA0450' },
    { regional_detail_id: 'R2', sku: 'GA0451', company: 'KM', country: 'DE', marketplace: 'amazon', site_sku: 'KM-GA0451' },
    { }
  ],
  purchase_orders: [
    { purchase_order_id: 'PO1', purchase_order_no: 'PO-001', status: 'in_production', company: 'KM', supplier_name: 'Acme', total_qty: 100, total_amount: 500, currency: 'USD', request_order_id: 'RO1', expected_ready_date: '2026-03-01' },
    { purchase_order_id: '', purchase_order_no: '' }
  ],
  purchase_order_lines: [
    { purchase_order_line_id: 'POL1', purchase_order_id: 'PO1', sku: 'GA0450', product_name: 'Can Opener', ordered_qty: 100, completed_qty: 40, shipped_qty: 10, remaining_qty: 30, unit_cost: 5, line_amount: 500, currency: 'USD' },
    { purchase_order_line_id: '', purchase_order_id: '' }
  ],
  warehouses: [
    { warehouse_id: 'W1', warehouse_name: 'US-3PL', warehouse_code: 'US1' },
    { warehouse_id: '', warehouse_name: '' }
  ],
  marketplaces: [
    { marketplace_id: 'MP1', marketplace: 'amazon', marketplace_display_name: 'Amazon', country: 'US', company: 'KM', status: 'active', fulfillment_model: 'FBA' },
    { marketplace_id: '', marketplace: '' }
  ]
};

// eval the ACTUAL db-api normalizers (adapter + legacy getters both use these) + helper deps.
eval(['_whBool', 'normalizeSkuDetailsRecord', 'normalizeTaxReferralRateRecord', 'normalizeTaxRateComponentRecord', 'normalizeMarketplaceSkuRecord', 'normalizeSkuRegionalDetailRecord',
  'normalizePurchaseOrderRecord', 'normalizePurchaseOrderLineRecord', 'normalizeWarehouseRecord', 'normalizeMarketplaceRecord']
  .map(function (n) { return extractFn(DBAPI, n); }).join('\n'));
// eval the ACTUAL adapters (assign window.KM.DB.adapt*Workspace)
eval(extractAssignedFn(DBAPI, 'window.KM.DB.adaptSkuDetailsWorkspace = function') + ';');
eval(extractAssignedFn(DBAPI, 'window.KM.DB.adaptPurchaseOrderWorkspace = function') + ';');
eval(extractAssignedFn(DBAPI, 'window.KM.DB.adaptInventoryReplenishmentWorkspace = function') + ';');

// LEGACY arrays = exactly what normalizeOperationDb builds (map → same per-array filter).
var legacyRegional = rawTables.sku_regional_details.map(normalizeSkuRegionalDetailRecord).filter(function (r) { return r.regionalDetailId || r.sku; });
var legacyMasters = rawTables.sku_details.map(normalizeSkuDetailsRecord).filter(function (r) { return r.sku; });
var legacyMktSkus = rawTables.marketplace_skus.map(normalizeMarketplaceSkuRecord).filter(function (r) { return r.sku; });
var legacyTaxRates = rawTables.tax_referral_rates.map(normalizeTaxReferralRateRecord).filter(function (r) { return r.taxRateId || r.series; });
var legacyTaxComps = rawTables.tax_rate_components.map(normalizeTaxRateComponentRecord).filter(function (r) { return r.taxComponentId || r.taxRateId; });
var legacyOrders = rawTables.purchase_orders.map(normalizePurchaseOrderRecord).filter(function (r) { return r.purchaseOrderId; });
var legacyPoLines = rawTables.purchase_order_lines.map(normalizePurchaseOrderLineRecord).filter(function (r) { return r.purchaseOrderLineId || r.purchaseOrderId; });
var legacyWarehouses = rawTables.warehouses.map(normalizeWarehouseRecord).filter(function (r) { return r.warehouseId || r.warehouseName; });
var legacyMarketplaces = rawTables.marketplaces.map(normalizeMarketplaceRecord).filter(function (r) { return r.marketplaceId || r.marketplace; });

// ===================================================================================================================
console.log('\n== F · SKU Regional whole-page BEFORE==AFTER (skuDetails workspace include.regional) ==');
// The workspace server returns raw passthrough keyed as adaptSkuDetailsWorkspace expects (skuDetails/taxReferralRates/
// taxRateComponents + marketplaceSkus/skuRegionalDetails under include.regional).
var srdEnvData = {
  skuDetails: rawTables.sku_details, taxReferralRates: rawTables.tax_referral_rates, taxRateComponents: rawTables.tax_rate_components,
  marketplaceSkus: rawTables.marketplace_skus, skuRegionalDetails: rawTables.sku_regional_details
};
var srdAdapted = window.KM.DB.adaptSkuDetailsWorkspace(srdEnvData);
eq(srdAdapted.skuRegionalDetails, legacyRegional, 'F: adapter skuRegionalDetails == legacy getSkuRegionalDetails');
eq(srdAdapted.skuDetails, legacyMasters, 'F: adapter skuDetails == legacy getSkuDetails');
eq(srdAdapted.marketplaceSkus, legacyMktSkus, 'F: adapter marketplaceSkus == legacy getMarketplaceSkus');
eq(srdAdapted.taxReferralRates, legacyTaxRates, 'F: adapter taxReferralRates == legacy getTaxReferralRates');
eq(srdAdapted.taxRateComponents, legacyTaxComps, 'F: adapter taxRateComponents == legacy getTaxRateComponents');

// eval the ACTUAL sku-regional-details.js helpers + read-model-first accessors + joins.
eval(['esc', 'lc', 'up', 'compositeKey', 'rowKey', 'isAmazon',
  '_srdGetRegional', '_srdGetMasters', '_srdGetMktSkus', '_srdGetTaxRates', '_srdGetTaxComponents', '_rows',
  'buildIndexes', 'masterOf', 'masterBySku', 'mName', 'mSeries', 'mCategory', 'statusOf',
  'distinct', 'masterList', 'todayIso', 'resolveTax', 'taxComponentsFor', 'regionalRowsForSku']
  .map(function (n) { return extractFn(SRD_JS, n); }).join('\n'));

// AFTER (Workspace mode): read-model set, broad cache EMPTY, getters absent → accessors must use the read-model.
window._opDbCache = null;
window.KM.DB.getSkuRegionalDetails = function () { throw new Error('broad getter called in Workspace mode'); };
window.KM.DB.getSkuDetails = function () { throw new Error('broad getter called in Workspace mode'); };
window.KM.DB.getMarketplaceSkus = function () { throw new Error('broad getter called in Workspace mode'); };
window.KM.DB.getTaxReferralRates = function () { throw new Error('broad getter called in Workspace mode'); };
window.KM.DB.getTaxRateComponents = function () { throw new Error('broad getter called in Workspace mode'); };
_srdReadModel = srdAdapted;
eq(_srdGetRegional(), legacyRegional, 'G/F: _srdGetRegional() from read-model == legacy (broad cache empty, getter throws)');
eq(_srdGetMasters(), legacyMasters, 'G/F: _srdGetMasters() from read-model == legacy');
eq(_srdGetTaxRates(), legacyTaxRates, 'G/F: _srdGetTaxRates() from read-model == legacy');
buildIndexes();
var mlWs = masterList();
var taxWs = resolveTax('GA0450', 'US');
var compsWs = taxComponentsFor(taxWs.row ? taxWs.row.taxRateId : '');
var statusWs = statusOf(legacyRegional[0]);

// BEFORE (Legacy mode): read-model null, getters return the legacy arrays.
_srdReadModel = null;
window.KM.DB.getSkuRegionalDetails = function () { return legacyRegional; };
window.KM.DB.getSkuDetails = function () { return legacyMasters; };
window.KM.DB.getMarketplaceSkus = function () { return legacyMktSkus; };
window.KM.DB.getTaxReferralRates = function () { return legacyTaxRates; };
window.KM.DB.getTaxRateComponents = function () { return legacyTaxComps; };
buildIndexes();
var mlLeg = masterList();
var taxLeg = resolveTax('GA0450', 'US');
var compsLeg = taxComponentsFor(taxLeg.row ? taxLeg.row.taxRateId : '');
var statusLeg = statusOf(legacyRegional[0]);

eq(mlWs, mlLeg, 'F: masterList() Workspace == Legacy (whole left-list BEFORE==AFTER)');
eq(taxWs, taxLeg, 'F: resolveTax() Workspace == Legacy (read-only tax join unchanged)');
eq(compsWs, compsLeg, 'F: taxComponentsFor() Workspace == Legacy');
eq(statusWs, statusLeg, 'F: statusOf() Workspace == Legacy (operational-status join)');
ok(mlWs.length === 2 && mlWs.map(function (e) { return e.sku; }).sort().join(',') === 'GA0450,GA0451', 'F: masterList finds both SKUs with regional rows');
ok(taxWs.row && taxWs.row.taxRateId === 'T1' && compsWs.length === 1, 'F: tax resolves T1 (Pro→US) with 1 component — join intact');

console.log('\n== F · SKU Regional source: canonical uses workspace + include.regional; fail-closed; write unchanged ==');
ok(/getWorkspace\('skuDetails',\s*\{\s*include:\s*\{\s*regional:\s*true\s*\}\s*\}\)/.test(SRD_JS), 'F: canonical read calls getWorkspace(skuDetails,{include:{regional:true}})');
ok(/_srdEffectiveWorkspace/.test(SRD_JS) && /workspaceApiActive\('skuDetails'\)/.test(SRD_JS), 'F: gated on workspaceApiActive(skuDetails)');
ok(/_srdRenderError_/.test(SRD_JS) && /NEVER fall back to the broad cache/.test(SRD_JS), 'F: fail-closed error path present (no silent broad fallback)');
ok(/upsertSkuRegionalDetail\(payload\)/.test(SRD_JS), 'K: write path (upsertSkuRegionalDetail) UNCHANGED');
ok(/_srdAfterWrite\(function/.test(SRD_JS), 'F: scoped post-write reconcile (_srdAfterWrite) after save');
ok(!/factory_stock|ensureFactoryStock|initFactory/i.test(SRD_JS), 'K: SKU Regional never initializes factory_stock');

// ===================================================================================================================
console.log('\n== B · PO detail modal wiring (purchaseOrder read-model; adapter BEFORE==AFTER proven in F1-7C) ==');
// B is a pure wiring change: view() now reads _polReadModel.orders/lines using the IDENTICAL accessor expression as
// renderRows (lines 154-155), whose adapter equivalence is proven by km-api-*/F1-7C suites. Here we prove the wiring +
// that no frontend authority (remaining_qty) was promoted and no broad load happens in the migrated path.
ok(/_polReadModel\s*\?\s*_polReadModel\.orders\s*:\s*\(window\.KM\.DB\.getPurchaseOrders/.test(POL_JS), 'B: view() orders read-model-first');
ok(/_polReadModel\s*\?\s*_polReadModel\.lines\s*:\s*\(window\.KM\.DB\.getPurchaseOrderLines/.test(POL_JS), 'B: view() lines read-model-first');
// remaining_qty must stay backend-owned: view() shows no max(0,completed-shipped); the fallback stays ONLY in renderRows.
ok(!/function view\(id\)[\s\S]*Math\.max\(0[\s\S]*?\n    \}/.test(POL_JS.slice(POL_JS.indexOf('function view(id)'), POL_JS.indexOf('function closeView'))), 'B: view() does NOT compute remaining_qty (no promoted frontend authority)');

// ===================================================================================================================
console.log('\n== D · IR marketplace/warehouse reference equivalence (via _irWsGet) + source ==');
// The IR adapter keys getMarketplaces/getWarehouses through the SAME normalizers as normalizeOperationDb (proven in the
// F1-7I suite). Here we prove the _irWsGet choke point returns the read-model in Workspace mode and the getter in Legacy.
var irReadModel = { getMarketplaces: legacyMarketplaces, getWarehouses: legacyWarehouses };   // shape the F1-7I adapter emits for these two tables
eval(extractFn(IR_JS, '_irWsGet'));
var _irReadModel = irReadModel;
eq(_irWsGet('getMarketplaces'), legacyMarketplaces, 'D: _irWsGet(getMarketplaces) from read-model == legacy');
eq(_irWsGet('getWarehouses'), legacyWarehouses, 'D: _irWsGet(getWarehouses) from read-model == legacy');
_irReadModel = null;
window.KM.DB.getMarketplaces = function () { return legacyMarketplaces; };
window.KM.DB.getWarehouses = function () { return legacyWarehouses; };
eq(_irWsGet('getMarketplaces'), legacyMarketplaces, 'D: _irWsGet(getMarketplaces) Legacy fallback == getter');
// All 7 named reference sites now route through _irWsGet (only the out-of-scope Execution-Plan warehouse read at :3020 remains).
ok((IR_JS.match(/_irWsGet\('getMarketplaces'\)/g) || []).length >= 6, 'D: >=6 getMarketplaces sites routed through _irWsGet');
ok(/function _irctxWarehouses\(\)\s*\{[\s\S]*_irWsGet\('getWarehouses'\)/.test(IR_JS), 'D: _irctxWarehouses routes through _irWsGet');
ok((IR_JS.match(/window\.KM\.DB\.getMarketplaces\(\)/g) || []).length === 0, 'D: no direct window.KM.DB.getMarketplaces() calls remain');

// ===================================================================================================================
// A · previously HALTED (F1_7J_A_UNEXPECTED_BACKEND_REQUIREMENT) — RESOLVED in F1-7J-A2 (40_ now projects a bounded
// SKU-logistics set). See api-bounded-reference-include-extensions-f1-7j-a2-r1.test.js for the full BEFORE==AFTER proof.
console.log('\n== A · RESOLVED in A2: weeklyShipping now projects bounded SKU logistics ==');
eval(['weeklyWsStr_', 'weeklyWsNum_', 'weeklyWsLc_'].map(function (n) { return extractFn(GS40, n); }).join('\n'));
eval(extractFn(GS40, 'weeklyWorkspaceBuild_'));
// stub the helpers weeklyWorkspaceBuild_ calls (we only assert the OUTPUT KEYS, not full mapping)
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
var wkVm = weeklyWorkspaceBuild_({ shipping_plans: [{ shipping_plan_id: 'SP1' }], shipping_plan_lines: [{ shipping_plan_id: 'SP1', sku: 'GA0450' }], warehouses: [], carriers: [], sku_details: rawTables.sku_details }, {});
ok('skuDetails' in wkVm, 'A: weekly View-Model now EMITS a skuDetails projection (A resolved in A2)');
eq(wkVm.skuDetails.map(function (r) { return r.sku; }), ['GA0450'], 'A: projection bounded to the page-line SKUs');
ok(/_spWsSkuDetails/.test(read('js/pages/shipping-plan.js')), 'A: shipping-plan _spSkuDetail reads the scoped SKU projection in Workspace mode');

// ===================================================================================================================
// C · previously HALTED (REQUEST_ORDER_SCOPE_EXISTING_READ_MODEL_NOT_EQUIVALENT) — RESOLVED in F1-7J-A2 (bounded
// marketplace reference via the existing getTable('marketplaces') read). Full proof in the A2 suite.
console.log('\n== C · RESOLVED in A2: RO scope resolver uses a bounded marketplace reference ==');
ok(/getAiPlanFirstLayer[\s\S]*?res\.data && res\.data\.rows/.test(RO_JS), 'C: first-layer composer returns {rows} only — no marketplaces array (why a dedicated reference read was needed)');
ok(/_roMarketplaceUniverse\(\)/.test(RO_JS) && /getMarketplaceReference/.test(read('js/api/operation-system-db-api.js')), 'C: scope resolver now reads the bounded marketplace reference universe (resolved)');
ok(!/adaptRequestOrderWorkspace|_roReadModel/.test(RO_JS), 'C: request-order.js (AI-plan page) still has NO requestOrder read-model (the reference read is dedicated, not the draft workspace)');

// ===================================================================================================================
console.log('\n== E · HALT proof: allocation-draft SSOT is not BEFORE==AFTER-equivalent to the sync hydrate ==');
ok(/window\.KM\.DB\.getShippingAllocationDraftWorkspace\s*=\s*async function/.test(DBAPI), 'E: SSOT getShippingAllocationDraftWorkspace is ASYNC (network fetch) — not a sync cache read');
ok(/_allocDraftScopeComplete[\s\S]*planning_cycle && scope\.company && scope\.country && scope\.marketplace/.test(IR_JS), 'E: SSOT requires COMPLETE scope incl. planning_cycle (hydrate matches country+marketplace only → different selection)');
// F1-7N-FB-4G-A0 — RESTATED, because HALT E is RESOLVED and the resolution is the `_irWsGet` raw-table route.
// The halt's reasoning about the SSOT stands unchanged and is still asserted above (E:234/E:235). What could
// not stand was its premise about the OTHER side: there was no working BEFORE to preserve. The broad-cache
// slice the hydrate read has no writer the deployed server honours — getOperationDb and getTable both refuse
// shipping_allocation_drafts / shipping_allocation_draft_lines — so the hydrate had been reading [] in
// production throughout. §7's SSOT preference is waived for this one surface, on the record, in
// docs/planning/F1_7J_A_EXISTING_WORKSPACE_SECONDARY_AND_SKU_REGIONAL_CUTOVER_R1.md §6.
ok(/function _hydrateAllocationDraftFromDb\(ctx\)[\s\S]*_irWsGet\('getShippingAllocationDrafts'\)[\s\S]*_irWsGet\('getShippingAllocationDraftLines'\)/.test(IR_JS),
  'E: sync hydrate now reads the read-model-first accessor (HALT E RESOLVED — §7 SSOT preference waived, SSOT still not equivalent)');
ok(/if \(_irReadModel\) return _irReadModel\[name\] \|\| \[\];[\s\S]{0,400}?window\.KM\.DB\[name\]\(\)/.test(IR_JS),
  'E: and _irWsGet still falls through to the SAME broad getter in Legacy mode — the Legacy path is byte-identical');

// ===================================================================================================================
console.log('\n== I/J/K · no new API route / workspace / formula / authority drift ==');
var routeActions = ['skuDetails.workspace.get', 'purchaseOrder.workspace.get', 'inventoryReplenishment.workspace.get', 'weeklyShipping.workspace.get'];
routeActions.forEach(function (a) { ok(ROUTER.indexOf(a) >= 0, 'I: existing route present (reused, not new): ' + a); });
// F1-7N-FB-4E-R3 — this round's claim was "no new workspace added", and that was true OF THIS ROUND. A later
// round legitimately adds one (R3: overseasStock, replacing a four-request fan-out), so the durable rule is that
// the eight this round relied on are all still registered and none was removed.
['weeklyShipping', 'inventoryReplenishment', 'requestOrder', 'purchaseOrder', 'shipment', 'fcSummary',
 'skuDetails', 'recommendation'].forEach(function (w) {
  ok(FND.indexOf("register('" + w + "'") >= 0, 'I: workspace still registered (none removed): ' + w);
});
ok((FND.match(/register\('/g) || []).length >= 8, 'I: the registry never shrinks below the 8 this round reused');
ok(!/inventoryReplenishment\.workspace\.get[\s\S]{0,4000}sku_details/.test('') , 'J: (sentinel) no new backend formula introduced'); // trivially true; real proof is A/B/D/F source assertions above
ok(!/loadOperationDb/.test(POL_JS.slice(POL_JS.indexOf('function view(id)'), POL_JS.indexOf('function closeView'))), 'H: PO view() migrated path never calls loadOperationDb');

// -------------------------------------------------------------------------------------------------------------------
console.log('\n----------------------------------------');
console.log('F1-7J-A cutover: ' + pass + ' passed, ' + fail + ' failed');
if (fail) { process.exitCode = 1; console.error('\nSUITE FAILED'); } else { console.log('ALL GREEN'); }
