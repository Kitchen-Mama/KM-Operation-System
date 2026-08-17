// Kitchen Mama Operation System — F1-7J-A3-REMAINING-NON-WORKSPACE-PRIMARY-SCOPED-READ-CUTOVER-R1
// Proves the 6 non-workspace primary pages (factory-stock, overseas-stock, overseas-ops-preview, campaign-risk,
// carrier-rate-card, sku-handbook) now source their data from ONE bounded getTable-based scoped read
// (KM.DB.loadScopedTables) instead of the whole-DB loadOperationDb / app prime — BEFORE == AFTER, no new API, no
// authority change. Also proves the §11 Batch-F blocker reconciliation.
// Run: node assets/tests/api-non-workspace-primary-scoped-cutover-f1-7j-a3-r1.test.js
// NOTE: no 'use strict' — extracted pure fns are eval'd into module scope.

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
var FS_JS = read('js/pages/factory-stock.js');
var OS_JS = read('js/pages/overseas-stock.js');
var OOP_JS = read('js/pages/overseas-ops-preview.js');
var CR_JS = read('js/pages/campaign-risk.js');
var CRC_JS = read('js/pages/carrier-rate-card.js');
var SKUH_JS = read('js/pages/sku-handbook.js');
var ROUTER = read('specs/active/apps-script/01_router.gs');
var IR_JS = read('js/pages/inventory-replenishment.js');
var FC_JS = read('js/pages/fc-summary.js');

var window = { KM: { DB: {} } };
var i18n = null;

// ===================================================================================================================
console.log('\n== loadScopedTables core: normalizeOperationDb on a PARTIAL table set == broad (BEFORE==AFTER) ==');
// Auto-extract EVERY normalizer + the helper chain, then normalizeOperationDb, all at module scope.
var normNames = (DBAPI.match(/function (normalize[A-Za-z]+Record)\(/g) || []).map(function (m) { return m.replace('function ', '').replace('(', ''); });
var uniq = {}; normNames = normNames.filter(function (n) { if (uniq[n]) return false; uniq[n] = 1; return true; });
eval(extractAssignedFn(DBAPI, 'var CUSTOMS_TYPE_LABELS_ =') + ';');
eval(['_whBool', '_invPick', 'customsTypeLabelFallback_', '_codeHumanize_', '_fcParseEventPeriodDates'].map(function (n) { try { return extractFn(DBAPI, n); } catch (e) { return ''; } }).join('\n'));
eval(extractAssignedFn(DBAPI, 'var codeDisplay_ =') + ';');
eval(normNames.map(function (n) { return extractFn(DBAPI, n); }).join('\n'));
eval(extractFn(DBAPI, 'normalizeOperationDb'));

var rawFull = {
  factory_stock: [
    { factory_stock_id: 'FS1', sku: 'GA0450', company: 'KM', factory: 'CN_YOUXIN', current_stock: 1200, reserved_stock: 200 },
    { factory_stock_id: 'FS2', sku: 'GA0450', company: 'ResTW', factory: 'TW_SHENGYI', current_stock: 300, reserved_stock: 0 },
    { factory_stock_id: '', sku: '' }   // JUNK
  ],
  factory_stock_movements: [{ movement_id: 'M1', sku: 'GA0450', quantity: 50 }, { movement_id: '', sku: '' }],
  warehouses: [{ warehouse_id: 'W1', warehouse_name: 'US-3PL', is_factory_warehouse: false, is_active: true }, { warehouse_id: '', warehouse_name: '' }],
  sku_details: [{ sku: 'GA0450', product_name: 'Can Opener', series: 'CO', category: 'Kitchen', lifecycle: 'Running in the Market' }, { sku: '' }],
  overseas_inventory_snapshot: [{ warehouse_id: 'W1', sku: 'GA0450', available_stock: 500 }, { warehouse_id: '', sku: '' }],
  campaigns: [{ campaign_id: 'C1', name: 'Promo' }, { campaign_id: '' }],
  carrier_rate_cards: [{ rate_card_id: 'RC1', carrier_id: 'CA1', origin_country: 'CN', destination_country: 'US', shipping_method: 'sea' }, { rate_card_id: '', carrier_id: '' }],
  product_features: [{ feature_id: 'PF1', scope_type: 'series', scope_id: 'CO', display_summary: 'Great opener' }],
  sku_handbook_summaries: [{ summary_id: 'S1', sku: 'GA0450', review_status: 'reviewed', display_summary: 'Reviewed summary' }]
};
var full = normalizeOperationDb(rawFull);
// Factory Stock scoped set (the page's 4 tables) — partial normalize == full for those tables, [] for the rest.
var fsScoped = normalizeOperationDb({ factory_stock: rawFull.factory_stock, factory_stock_movements: rawFull.factory_stock_movements, sku_details: rawFull.sku_details, warehouses: rawFull.warehouses });
eq(fsScoped.factoryStock, full.factoryStock, 'A3: scoped factoryStock == full-normalize factoryStock (shared-factory rows summed as-is; junk filtered identically)');
eq(fsScoped.warehouses, full.warehouses, 'A3: scoped warehouses == full');
eq(fsScoped.skuDetails, full.skuDetails, 'A3: scoped skuDetails == full');
eq(fsScoped.campaigns, [], 'A3: a table NOT in the scoped set → [] (bounded — no whole-DB read)');
ok(full.factoryStock.length === 2, 'A3: shared-factory pool keeps BOTH company rows (no factory→company collapse)');
// Overseas / campaign / carrier scoped sets likewise match.
var osScoped = normalizeOperationDb({ overseas_inventory_snapshot: rawFull.overseas_inventory_snapshot, warehouses: rawFull.warehouses, sku_details: rawFull.sku_details, overseas_inventory_movements: [] });
eq(osScoped.overseasInventorySnapshot, full.overseasInventorySnapshot, 'A3: scoped overseasInventorySnapshot == full');
var crScoped = normalizeOperationDb({ campaigns: rawFull.campaigns, campaign_sku_lines: [], marketplace_skus: [], sku_details: rawFull.sku_details, marketplaces: [] });
eq(crScoped.campaigns, full.campaigns, 'A3: scoped campaigns == full');
var crcScoped = normalizeOperationDb({ carrier_rate_cards: rawFull.carrier_rate_cards, carriers: [], carrier_lead_times: [] });
eq(crcScoped.carrierRateCards, full.carrierRateCards, 'A3: scoped carrierRateCards == full');

console.log('\n== SKU Handbook knowledge merge: scoped tables == broad (BEFORE==AFTER) ==');
eval(['getProductFeatureForSku', 'buildSkuKnowledgeItems'].map(function (n) { return extractFn(DBAPI, n); }).join('\n'));
window.buildSkuKnowledgeItems = buildSkuKnowledgeItems;
var kiFull = buildSkuKnowledgeItems(full.skuDetails, full.productFeatures, full.skuHandbookSummaries);
var skuhScoped = normalizeOperationDb({ sku_details: rawFull.sku_details, product_features: rawFull.product_features, sku_handbook_summaries: rawFull.sku_handbook_summaries });
var kiScoped = buildSkuKnowledgeItems(skuhScoped.skuDetails, skuhScoped.productFeatures, skuhScoped.skuHandbookSummaries);
eq(kiScoped, kiFull, 'A3: SKU Handbook knowledge items from the scoped 3-table read == from the full DB (BEFORE==AFTER)');
ok(kiScoped.length === 1 && kiScoped[0].sku === 'GA0450', 'A3: knowledge merge produced the SKU with its reviewed summary');

// ===================================================================================================================
console.log('\n== loadScopedTables enabler: reuses getTable, defensive normalize, never mutates global cache ==');
ok(/window\.KM\.DB\.loadScopedTables\s*=\s*async function/.test(DBAPI), 'A3: KM.DB.loadScopedTables exists');
ok(/loadScopedTables[\s\S]*getOperationDbTableFromSheet\(n\)[\s\S]*normalizeOperationDb\(rawDb\)/.test(DBAPI), 'A3: loadScopedTables = per-table getTable fetch + normalizeOperationDb (reuse; NO new API)');
ok(!/loadScopedTables[\s\S]{0,400}window\._opDbCache\s*=/.test(DBAPI), 'A3: loadScopedTables NEVER assigns the global window._opDbCache');
ok(/function normalizeOperationDb[\s\S]*db\.factory_stock \|\| \[\]/.test(DBAPI), 'A3: normalizeOperationDb is defensive (|| []) → partial input is safe');
ok(ROUTER.indexOf("action === 'getTable'") >= 0, 'A3: getTable route already exists (reused) — NO new router action');

// ===================================================================================================================
console.log('\n== per-page cutover source: mount scoped-load, reads via accessors, fail-closed, kill switch ==');
function pageChecks(name, src, tables, mountFn, readAccessor) {
  ok(new RegExp("loadScopedTables\\(\\[" + tables + "\\]|loadScopedTables\\(_[A-Z]+_TABLES\\)|loadScopedTables\\(\\['" ).test(src) || src.indexOf('loadScopedTables') >= 0, name + ': mount uses loadScopedTables (bounded scoped read)');
  ok(/KM_SCOPED_PAGE_READS !== false/.test(src), name + ': explicit kill switch (KM_SCOPED_PAGE_READS)');
  ok(/getDataSourceMode\(\) === 'google-sheet'/.test(src), name + ': canonical gated on cloud mode');
}
pageChecks('factory-stock', FS_JS);
pageChecks('overseas-stock', OS_JS);
pageChecks('overseas-ops-preview', OOP_JS);
pageChecks('campaign-risk', CR_JS);
pageChecks('carrier-rate-card', CRC_JS);
pageChecks('sku-handbook', SKUH_JS);
// reads routed through scoped accessors (no direct broad data getters left in canonical path)
ok((FS_JS.match(/_fsGet\('/g) || []).length >= 5 && !/window\.KM\.DB\.getFactoryStock\(\)/.test(FS_JS), 'factory-stock: reads via _fsGet; no direct getFactoryStock()');
ok((OS_JS.match(/_osGet\('/g) || []).length >= 4 && !/window\.KM\.DB\.getOverseasInventorySnapshot\(\)/.test(OS_JS), 'overseas-stock: reads via _osGet');
ok((OOP_JS.match(/_oopGet\('/g) || []).length >= 5 && !/window\.KM\.DB\.getShipments\(\)/.test(OOP_JS), 'overseas-ops-preview: reads via _oopGet');
ok(/_crDB\(\)[\s\S]*_crReadModel/.test(CR_JS) && /loadScopedTables\(\['campaigns'/.test(CR_JS), 'campaign-risk: _crDB() shim reads _crReadModel');
ok(/function getCards\(\)\s*\{\s*return _crcGet/.test(CRC_JS) && /function getLeadTimes\(\)/.test(CRC_JS), 'carrier-rate-card: getCards/getCarriers/getLeadTimes read the scoped model');
ok(/_skuhKnowledgeItems[\s\S]*buildSkuKnowledgeItems\(_skuhReadModel/.test(SKUH_JS), 'sku-handbook: knowledge merge from _skuhReadModel');
// fail-closed: sku-handbook canonical-but-not-loaded returns [] (NEVER a silent broad read)
ok(/_skuhScopedActive\(\)\)\s*\{[\s\S]*return \[\];\s*\/\/ canonical but not yet loaded/.test(SKUH_JS), 'sku-handbook: fail-closed (canonical-not-loaded → [], no broad fallback)');
// post-write scoped refresh on the writing pages
ok(/_fsAfterWrite\(/.test(FS_JS), 'factory-stock: post-write scoped refresh (_fsAfterWrite)');
ok(/_osAfterWrite\(/.test(OS_JS), 'overseas-stock: post-write scoped refresh (_osAfterWrite)');
ok(/_crcAfterWrite\(/.test(CRC_JS), 'carrier-rate-card: post-write scoped refresh (_crcAfterWrite)');

// ===================================================================================================================
console.log('\n== §11 Batch-F blocker reconciliation (source-grounded) ==');
// Batch F = replace the 47 writer post-write loadOperationDb({force:true}) with scoped reconciliation.
// A3 left them untouched (47→47); F1-7K has since retired them to the _kmWriterPostWrite_ seam (47→0).
ok(DBAPI.indexOf('_kmWriterPostWrite_') !== -1, 'Batch-F (F1-7K done): writer full-reloads retired to the _kmWriterPostWrite_ seam');
// 1+2+3 (incoming / sitePlanning / event-assist) read through scoped choke points → not a full-reload consumer.
ok(/function _irBuildShipmentRemainingByReceiver/.test(IR_JS), 'Batch-F item1: incoming reconstruction exists (reads via IR scoped get() — not a writer-reload consumer)');
ok(/no movement, no reserve|display-only|DISPLAY_ONLY/i.test(IR_JS), 'Batch-F item2: sitePlanningAllocation is display-only (no write/readback coupling)');
ok(/_fcAfterWrite/.test(FC_JS), 'Batch-F item3: Event Assist save reconciles via scoped _fcAfterWrite (not the whole-DB reload)');
// 4: allocation-draft hydrate reads bare broad getters (app-prime dependency) but its writers use _kmWeeklyCommand_ (NO reload).
ok(/_hydrateAllocationDraftFromDb[\s\S]*getShippingAllocationDrafts\(\)/.test(IR_JS), 'Batch-F item4: allocation-draft hydrate reads bare broad getters (blocks APP-PRIME removal, NOT Batch F)');
ok(/upsertShippingAllocationDraft\s*=\s*function\(payload\)\s*\{\s*return _kmWeeklyCommand_/.test(DBAPI), 'Batch-F item4: draft writers use _kmWeeklyCommand_ (NO whole-DB reload → not a Batch-F blocker)');

// -------------------------------------------------------------------------------------------------------------------
console.log('\n----------------------------------------');
console.log('F1-7J-A3 non-workspace primary scoped cutover: ' + pass + ' passed, ' + fail + ' failed');
if (fail) { process.exitCode = 1; console.error('\nSUITE FAILED'); } else { console.log('ALL GREEN'); }
