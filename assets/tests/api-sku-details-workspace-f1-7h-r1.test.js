// Kitchen Mama Operation System — F1-7H-SKU-DETAILS-WORKSPACE-AND-CUTOVER-R1
// Proves the scoped SKU Details workspace + sku-details.js primary-render cutover WITHOUT changing business output:
//   - backend 59_ reads ONLY the SKU master/reference table set (sku_details / tax_referral_rates / tax_rate_components
//     BASE; marketplace_skus / sku_regional_details include.regional); never getOperationDb; raw passthrough of the FULL
//     tables (the pages need the complete set for their lifecycle/filter/country universes); non-silent `capped` backstop;
//     authors NO write side effects and NO Factory Stock initialization (that stays with master-SKU creation);
//   - the db-api adapter runs the SAME normalizers + per-array filters as normalizeOperationDb → arrays byte-identical to
//     the legacy getters (getSkuDetails / getTaxReferralRates / getTaxRateComponents / getMarketplaceSkus /
//     getSkuRegionalDetails);
//   - the ACTUAL browser grouping (getAllSkuDataWithOverrides) + option universe (_skuDistinctValues) produce IDENTICAL
//     output from the Workspace read-model as from the Legacy broad-cache getters (BEFORE == AFTER);
//   - skuDetails activated CANONICAL; router dispatch present; sku-details.js sources its primary read from the workspace
//     (no getOperationDb/loadOperationDb/_opDbCache in the primary read path), fail-closed on error; the write paths
//     (upsertSkuDetail incl. its Factory Stock baseline trigger, updateSkuLifecycle, upsertTaxReferralRate) are UNCHANGED.
// Run: node assets/tests/api-sku-details-workspace-f1-7h-r1.test.js
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

var GS59 = read('specs/active/apps-script/59_api_v1_sku_details_workspace.gs');
var ROUTER = read('specs/active/apps-script/01_router.gs');
var FND = read('js/api/km-api-foundation.js');
var DBAPI = read('js/api/operation-system-db-api.js');
var SK_JS = read('js/pages/sku-details.js');
var OVR = read('js/utils/sku-overrides.js');

// module-scope stubs the eval'd browser fns reference
var window = { KM: { DB: {} } };
var _skReadModel = null;
var localStorage = { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} };

// eval the WHOLE 59_ (pure builders + impure orchestrator; prod helpers referenced only inside the default io, never called here)
eval(GS59);
// eval the ACTUAL db-api normalizers (adapter + legacy getters both use these)
eval(['normalizeSkuDetailsRecord', 'normalizeTaxReferralRateRecord', 'normalizeTaxRateComponentRecord', 'normalizeMarketplaceSkuRecord', 'normalizeSkuRegionalDetailRecord']
  .map(function (n) { return extractFn(DBAPI, n); }).join('\n'));
// eval the ACTUAL adapter (assigns window.KM.DB.adaptSkuDetailsWorkspace)
eval(extractAssignedFn(DBAPI, 'window.KM.DB.adaptSkuDetailsWorkspace = function') + ';');
// eval the ACTUAL sku-overrides grouping helpers + the sku-details.js accessors
eval(['mapStatusToLifecycle', 'getNormalizedSkuStatus', 'getSkuImageOverrides', 'getSkuImageOverride', 'getSkuDataOverrides', 'getAllSkuDataWithOverrides']
  .map(function (n) { return extractFn(OVR, n); }).join('\n'));
eval(['_skGetSkuDetails', '_skGetTaxReferralRates', '_skGetTaxRateComponents', '_skuDistinctValues']
  .map(function (n) { return extractFn(SK_JS, n); }).join('\n'));

// -------------------------------------------------------------------------------------------------------------------
// Fixture — raw sheet rows. Includes a JUNK row per table to prove filter parity.
// -------------------------------------------------------------------------------------------------------------------
var rawTables = {
  sku_details: [
    { sku: 'GA0450', product_name: 'Can Opener', category: 'Kitchen', series: 'Pro', lifecycle: 'Running in the Market', units_per_carton: 24, item_length: 10, item_width: 5, item_height: 3, hscode: '' },
    { sku: 'GA0451', product_name: 'Jar Opener', category: 'Kitchen', series: 'Lite', lifecycle: 'Upcoming SKU', units_per_carton: 12 },
    { sku: 'GA0452', product_name: 'Old Tool', category: 'Tools', series: 'Legacy', lifecycle: 'Phasing Out', units_per_carton: 0 },
    { sku: '', product_name: 'junk (no sku)', category: 'X' }   // JUNK — no sku → filtered by normalizeOperationDb + adapter identically
  ],
  tax_referral_rates: [
    { tax_rate_id: 'T1', series: 'Pro', country_of_origin: 'CN', duty_country: 'US', hscode: '8205.51.30', duty_rate: 3.5, effective_from: '2026-01-01' },
    { tax_rate_id: '', series: '' }   // JUNK — no taxRateId/series → filtered
  ],
  tax_rate_components: [
    { tax_component_id: 'TC1', tax_rate_id: 'T1', component_type: 'duty', rate_type: 'percentage', rate_value: 3.5 },
    { tax_component_id: '', tax_rate_id: '' }   // JUNK — no taxComponentId/taxRateId → filtered
  ],
  marketplace_skus: [
    { marketplace_sku_id: 'M1', sku: 'GA0450', company: 'KM', country: 'US', marketplace: 'amazon_us', site_sku: 'KM-GA0450', marketplace_sku_status: 'active' },
    { marketplace_sku_id: 'M2', sku: 'GA0450', company: 'ResTW', country: 'TW', marketplace: 'shopee_tw', site_sku: 'RES-GA0450', marketplace_sku_status: 'active' },
    { sku: '' }   // JUNK — no sku → filtered
  ],
  sku_regional_details: [
    { regional_detail_id: 'R1', sku: 'GA0450', company: 'KM', country: 'US', marketplace: 'amazon_us', site_sku: 'KM-GA0450' },
    { }   // JUNK — no regionalDetailId/sku → filtered
  ]
};

// LEGACY arrays = exactly what normalizeOperationDb builds (map → same per-array filter).
var legacySku = rawTables.sku_details.map(normalizeSkuDetailsRecord).filter(function (r) { return r.sku; });
var legacyTaxRates = rawTables.tax_referral_rates.map(normalizeTaxReferralRateRecord).filter(function (r) { return r.taxRateId || r.series; });
var legacyTaxComps = rawTables.tax_rate_components.map(normalizeTaxRateComponentRecord).filter(function (r) { return r.taxComponentId || r.taxRateId; });
var legacyMktSkus = rawTables.marketplace_skus.map(normalizeMarketplaceSkuRecord).filter(function (r) { return r.sku; });
var legacyRegional = rawTables.sku_regional_details.map(normalizeSkuRegionalDetailRecord).filter(function (r) { return r.regionalDetailId || r.sku; });

// -------------------------------------------------------------------------------------------------------------------
console.log('\n== skdWorkspaceBuild_ View-Model: raw passthrough + include-gated regional ==');
var vmBase = skdWorkspaceBuild_(rawTables, {});
eq(vmBase.skuDetails.length, 4, 'BASE regular passthrough keeps ALL raw rows (adapter filters, not the builder)');
eq(vmBase.taxReferralRates.length, 2, 'BASE tax rates raw passthrough (full set)');
eq(vmBase.taxRateComponents.length, 2, 'BASE tax components raw passthrough (full set)');
ok(vmBase.marketplaceSkus === undefined && vmBase.skuRegionalDetails === undefined, "regional tables ABSENT without include.regional (bounded includes)");
ok(vmBase.skuDetails[0].sku === 'GA0450' && vmBase.skuDetails[0].units_per_carton === 24, 'sku rows are RAW (unmodified sheet rows)');
eq(vmBase.counts, { skuDetails: 4, taxReferralRates: 2, taxRateComponents: 2 }, 'counts reflect the raw set');
eq(vmBase.capped, { skuDetails: false, taxReferralRates: false, taxRateComponents: false }, 'nothing capped under the backstop');
var vmReg = skdWorkspaceBuild_(rawTables, { include: { regional: true } });
ok(vmReg.marketplaceSkus.length === 3 && vmReg.skuRegionalDetails.length === 2, 'include.regional → regional tables returned (raw passthrough)');
ok(vmReg.summary.marketplaceSkuCount === 3 && vmReg.summary.skuRegionalDetailCount === 2, 'summary carries regional counts when included');
ok(skdWorkspaceBuild_(rawTables, { include: { summary: false } }).summary === null, 'include.summary:false → summary omitted');
var vmEmpty = skdWorkspaceBuild_({}, {});
eq(vmEmpty.skuDetails.length, 0, 'empty tables → 0 skus (EMPTY ≠ ERROR)');

console.log('\n== orchestrator: bounded includes — un-requested regional tables are NOT read ==');
var readNames = [];
var mockIo = { now: function () { return 0; }, nextSeq: function () { return 1; }, openTarget: function () { return {}; }, readTable: function (ss, name) { readNames.push(name); return rawTables[name] || []; } };
readNames = []; handleSkuDetailsWorkspaceGet_({ payload: {} }, mockIo);
ok(readNames.indexOf('sku_details') >= 0 && readNames.indexOf('marketplace_skus') < 0 && readNames.indexOf('sku_regional_details') < 0, 'BASE call reads sku_details + tax; SKIPS the regional tables (no read cost)');
readNames = []; var envReg = handleSkuDetailsWorkspaceGet_({ payload: { include: { regional: true } } }, mockIo);
ok(readNames.indexOf('marketplace_skus') >= 0 && readNames.indexOf('sku_regional_details') >= 0, 'include.regional reads the regional tables');
ok(envReg.success === true && envReg.data && envReg.meta.workspace === 'skuDetails', 'orchestrator success envelope (workspace=skuDetails)');

console.log('\n== non-silent cap backstop (SKD_WS_ROW_MAX_) ==');
var big = []; for (var i = 0; i < 50001; i++) big.push({ sku: 'S' + i });
var capd = skdCap_(big);
ok(capd.capped === true && capd.rows.length === 50000 && capd.total === 50001, 'skdCap_ truncates at 50000 and REPORTS capped=true + true total (never silent)');
ok(skdCap_([{ sku: 'x' }]).capped === false, 'skdCap_ under the cap → capped=false');

console.log('\n== db-api adapter == legacy getters (BEFORE == AFTER via SAME normalizers + SAME filters) ==');
var adapted = window.KM.DB.adaptSkuDetailsWorkspace(vmReg);
eq(adapted.skuDetails, legacySku, 'adapted skuDetails === getSkuDetails() array (junk row dropped identically)');
eq(adapted.taxReferralRates, legacyTaxRates, 'adapted taxReferralRates === getTaxReferralRates() array');
eq(adapted.taxRateComponents, legacyTaxComps, 'adapted taxRateComponents === getTaxRateComponents() array');
eq(adapted.marketplaceSkus, legacyMktSkus, 'adapted marketplaceSkus === getMarketplaceSkus() array');
eq(adapted.skuRegionalDetails, legacyRegional, 'adapted skuRegionalDetails === getSkuRegionalDetails() array');
eq(adapted.skuDetails.length, 3, 'adapter drops the junk sku row (filter parity)');
ok(adapted.skuDetails[0].raw && adapted.skuDetails[0].raw.sku === 'GA0450', 'adapted record preserves .raw passthrough (the render/edit paths read r.raw)');
// shared-factory / multi-company proof: SAME master sku spans KM + ResTW marketplace rows, company passthrough verbatim
ok(adapted.marketplaceSkus.filter(function (r) { return r.sku === 'GA0450'; }).length === 2 &&
   adapted.marketplaceSkus.some(function (r) { return r.company === 'KM'; }) && adapted.marketplaceSkus.some(function (r) { return r.company === 'ResTW'; }),
   'shared master SKU across KM + ResTW marketplace rows — company passthrough verbatim, no inference');
// HS-code equivalence: the persisted hscode/duty transported byte-identical (no tax semantic change)
var t = adapted.taxReferralRates[0];
ok(t.hscode === '8205.51.30' && t.hsCode === '8205.51.30' && t.dutyRate === 3.5 && t.series === 'Pro', 'HS-code / duty transported verbatim (canonical tax_referral_rates owner unchanged)');

console.log('\n== BEFORE == AFTER: ACTUAL browser grouping + option universe — Workspace read-model vs Legacy getters ==');
// LEGACY: _skReadModel = null; getters return the normalizeOperationDb arrays
_skReadModel = null;
window.KM.DB.getSkuDetails = function () { return legacySku; };
window.KM.DB.getTaxReferralRates = function () { return legacyTaxRates; };
window.KM.DB.getTaxRateComponents = function () { return legacyTaxComps; };
var legGroups = getAllSkuDataWithOverrides();          // no arg → getter path (Legacy)
var legCats = _skuDistinctValues('category'), legSeries = _skuDistinctValues('series');
var legTaxRef = _skGetTaxReferralRates(), legTaxComp = _skGetTaxRateComponents();
// WORKSPACE: _skReadModel = adapted DTO; getters MUST NOT be consulted for the primary render
window.KM.DB.getSkuDetails = function () { throw new Error('primary render must not hit the broad-cache getter in Workspace mode'); };
window.KM.DB.getTaxReferralRates = function () { throw new Error('no getter'); };
window.KM.DB.getTaxRateComponents = function () { throw new Error('no getter'); };
_skReadModel = adapted;
var wsGroups = getAllSkuDataWithOverrides(_skGetSkuDetails());   // Workspace source (read-model)
var wsCats = _skuDistinctValues('category'), wsSeries = _skuDistinctValues('series');
eq(wsGroups, legGroups, 'lifecycle grouping (Upcoming/Running/Phasing/Closure): Workspace == Legacy');
ok(wsGroups['Running in the Market'].length === 1 && wsGroups['Upcoming SKU'].length === 1 && wsGroups['Phasing Out'].length === 1, 'each lifecycle bucket populated from sku_details.lifecycle');
eq(wsCats, legCats, 'Category option universe: Workspace == Legacy'); eq(wsSeries, legSeries, 'Series option universe: Workspace == Legacy');
eq(_skGetTaxReferralRates(), legTaxRef, 'accessor Tax rates: Workspace == Legacy (read-model)'); eq(_skGetTaxRateComponents(), legTaxComp, 'accessor Tax components: Workspace == Legacy');
ok(_skGetSkuDetails() === adapted.skuDetails, 'accessor reads the read-model in Workspace mode (not the getter)');

console.log('\n== source guards: 59_ read-only, no getOperationDb, no Factory Stock init, no Forecast/Gap/Recommendation ==');
var code59 = GS59.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
ok(!/getOperationDb/.test(code59), '59_ never calls getOperationDb');
ok(!/\.setValue\(|appendRow|insertSheet|deleteRow|\.setValues\(/.test(code59), '59_ writes nothing (read-only)');
ok(!/factory_stock|ensureFactoryStockBaseline_|fac_current_stock/.test(code59), '59_ NEVER initializes Factory Stock (that stays with master-SKU creation)');
ok(!/fc_regular_forecast|order_planning_gap|recommend|allocat|target_percentage|purchase_order/i.test(code59), '59_ runs NO Forecast/Gap/Recommendation/allocation/PO logic');
ok(/action === 'skuDetails\.workspace\.get'/.test(ROUTER) && /handleSkuDetailsWorkspaceGet_\(body\)/.test(ROUTER), 'router dispatches skuDetails.workspace.get');

console.log('\n== activation + registration ==');
ok(/WORKSPACE_CANONICAL = \{[^}]*skuDetails: true/.test(FND), 'skuDetails is CANONICAL');
ok(/WORKSPACE_ENABLED_DEFAULT = \{[^}]*skuDetails: true/.test(FND), 'skuDetails per-workspace flag defaults ON');
ok(/register\('skuDetails', \{[^}]*status: WORKSPACE_STATUS\.IMPLEMENTED, resolver: skuDetailsResolver/.test(FND), 'skuDetails registered IMPLEMENTED with resolver');
ok(/action: 'skuDetails\.workspace\.get'/.test(FND), 'foundation DTO targets skuDetails.workspace.get');
ok(/KM\.DB\.adaptSkuDetailsWorkspace = function/.test(DBAPI), 'db-api exposes adaptSkuDetailsWorkspace');

console.log('\n== page: workspace primary read, no broad DB in the read path, fail-closed, write paths unchanged ==');
ok(/workspaceApiActive\('skuDetails'\)/.test(SK_JS), 'sku-details: gates on canonical skuDetails workspace');
ok(/getWorkspace\('skuDetails'/.test(SK_JS) && /adaptSkuDetailsWorkspace/.test(SK_JS), 'sku-details: primary read via scoped workspace + adapter');
var refresh = extractFn(SK_JS, '_skWorkspaceRefresh_');
ok(!/getOperationDb|loadOperationDb|_opDbCache/.test(refresh), 'sku-details: the scoped read path has NO getOperationDb/loadOperationDb/_opDbCache');
ok(/SKU_DETAILS_READ_FAILED|WORKSPACE_UNAVAILABLE/.test(SK_JS), 'sku-details: fail-closed bounded read error');
ok(/KM\.loadState\.createRegion/.test(SK_JS), 'sku-details: reuses KM.loadState (no new loading infra)');
ok(/function _skAfterWrite/.test(SK_JS) && /_skWorkspaceRefresh_\(\)\.then/.test(SK_JS), 'sku-details: post-write does a SCOPED re-read (never a broad reload for the primary render)');
ok((SK_JS.match(/_skAfterWrite\(/g) || []).length >= 3, 'all 3 live write success paths reconcile via _skAfterWrite (sku save, lifecycle, tax)');
// write paths + Factory Stock trigger UNCHANGED (this round transports READ only)
ok(/upsertSkuDetail/.test(SK_JS) && /factory_baseline/.test(SK_JS), 'master-SKU write (upsertSkuDetail) + its factory_baseline handling are UNCHANGED');
ok(/upsertTaxReferralRate/.test(SK_JS) && /updateSkuLifecycle/.test(SK_JS), 'HS-code (upsertTaxReferralRate) + lifecycle (updateSkuLifecycle) write paths are UNCHANGED');
ok(!/ensureFactoryStockBaseline|fac_current_stock/.test(SK_JS), 'the cutover added NO Factory Stock logic to the frontend');
// shared helper backward-compatible optional source
ok(/function getAllSkuDataWithOverrides\(sourceItems\)/.test(OVR), 'getAllSkuDataWithOverrides accepts optional sourceItems (read-model) — backward compatible');

console.log('\n----------------------------------------');
console.log('API SKU DETAILS WORKSPACE (F1-7H-R1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
