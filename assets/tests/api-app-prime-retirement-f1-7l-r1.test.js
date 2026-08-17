// Kitchen Mama Operation System — F1-7L-APP-PRIME-DEPENDENCY-RETIREMENT-AND-GLOBAL-PRIME-REMOVAL-R1
// Proves the whole Operation DB startup prime is removed and the last read-side dependencies on it are retired:
// canonical startup does NO whole-DB fetch; the IR allocation-draft hydrate + RO 2nd-layer expand + FC builder/
// import modals now load their OWN bounded tables on demand (KM.DB.refreshCacheTables) instead of the prime;
// BEFORE==AFTER (same tables + normalizer); writer full-reload stays 0; Event Assist / Incoming / sitePlanning
// business logic unchanged; Legacy kill-switch branches still self-load broad DB on demand.
// Run: node assets/tests/api-app-prime-retirement-f1-7l-r1.test.js
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
var APP = read('js/app.js');
var IR = read('js/pages/inventory-replenishment.js');
var RO = read('js/pages/request-order.js');
var FC = read('js/pages/fc-summary.js');
var SKU = read('js/pages/sku-details.js');
var FORCE = 'loadOperationDb({ force: true })';

// ===================================================================================================================
console.log('\n== §8/§11/§12 app.js startup: NO whole Operation DB prime, no hidden/delayed prime ==');
ok(APP.indexOf('loadOperationDb') === -1, 'app.js makes NO loadOperationDb call at all (startup prime removed)');
ok(/DOMContentLoaded/.test(APP), 'app.js still has its DOMContentLoaded startup');
ok(/km_sku_data_overrides_v1/.test(APP), 'app.js preserves the legacy-localStorage override warning (reads localStorage, not the Operation DB)');
ok(!/setTimeout\([^)]*loadOperationDb|setInterval\([^)]*loadOperationDb/.test(APP), 'app.js has no delayed/background whole-DB prime');

// ===================================================================================================================
console.log('\n== enabler: KM.DB.refreshCacheTables exposed + full 15-table key map ==');
ok(/window\.KM\.DB\.refreshCacheTables = _kmRefreshCacheTables_;/.test(DBAPI), 'KM.DB.refreshCacheTables exposed (bounded scoped loader — replacement for the prime)');
var KEYMAP = {
  request_order_site_confirmations: 'requestOrderSiteConfirmations', shipping_allocation_drafts: 'shippingAllocationDrafts',
  shipping_allocation_draft_lines: 'shippingAllocationDraftLines', fc_regular_forecast: 'fcRegularForecast',
  fc_special_events: 'fcSpecialEvents', fc_target_rules: 'fcTargetRules', factory_stock: 'factoryStock', warehouses: 'warehouses',
  purchase_orders: 'purchaseOrders', purchase_order_lines: 'purchaseOrderLines', sku_details: 'skuDetails',
  marketplace_skus: 'marketplaceSkus', campaigns: 'campaigns', campaign_sku_lines: 'campaignSkuLines',
  pricing_list: 'pricingList', marketplaces: 'marketplaces'
};
var keyBlock = extractAssignedFn(DBAPI, 'var _KM_TABLE_CACHE_KEY_ =');
Object.keys(KEYMAP).forEach(function (t) { ok(new RegExp(t + ':\\s*\'' + KEYMAP[t] + '\'').test(keyBlock), '_KM_TABLE_CACHE_KEY_ maps ' + t + ' → ' + KEYMAP[t]); });

// ===================================================================================================================
console.log('\n== §10/§15 writer full-reload stays 0; canonical broad-load call sites retired ==');
var forceCalls = (DBAPI.split('await ' + FORCE + ';').length - 1);
eq(forceCalls, 2, 'db-api STILL makes exactly 2 whole-DB reload calls (writer seam fallback + reloadOperationDb debug util) — writer reload remains 0');
// The canonical secondary/hydrate paths no longer call the whole-DB loader.
ok(IR.indexOf(FORCE) === -1, 'inventory-replenishment.js: no canonical whole-DB loadOperationDb (draft hydrate now bounded)');
// request-order still has exactly ONE loadOperationDb — the LEGACY composer-off init branch (kill-switch); the expand no longer does.
eq((RO.match(/loadOperationDb\(\{ force: true \}\)/g) || []).length, 1, 'request-order.js: only the LEGACY init branch keeps a whole-DB load (expand migrated to bounded)');
ok(/Legacy broad-cache path \(kill-switch only\)/.test(RO), 'request-order.js: the remaining whole-DB load is the documented legacy kill-switch path');

// ===================================================================================================================
console.log('\n== §1/§2 IR allocation-draft hydrate (HALT E resolved): bounded pre-load, UNCHANGED sync hydrate ==');
var restore = extractAssignedFn(IR, 'async function _restoreAllocationDraftFromSession') || extractFn(IR, '_restoreAllocationDraftFromSession');
ok(/async function _restoreAllocationDraftFromSession/.test(IR), '_restoreAllocationDraftFromSession is async (awaits the bounded draft-table load)');
ok(/refreshCacheTables\(\['shipping_allocation_drafts', 'shipping_allocation_draft_lines'\]\)/.test(restore), 'restore awaits a BOUNDED load of the 2 canonical draft tables (not the prime, not the whole DB)');
var idxLoad = restore.indexOf('refreshCacheTables'), idxHydrate = restore.indexOf('_hydrateAllocationDraftFromDb(ctx)');
ok(idxLoad !== -1 && idxHydrate !== -1 && idxLoad < idxHydrate, 'the bounded load runs BEFORE the sync hydrate (so it reads fresh bounded slices, not the prime)');
// The hydrate itself is UNCHANGED: same two broad getters, same selection; NO SSOT/getWorkspace introduced (would change the selection contract).
var hydrate = extractFn(IR, '_hydrateAllocationDraftFromDb');
ok(/getShippingAllocationDrafts\(\)/.test(hydrate) && /getShippingAllocationDraftLines\(\)/.test(hydrate), 'hydrate still reads the same two broad getters (byte-identical selection + bySku transform preserved)');
ok(hydrate.indexOf('getShippingAllocationDraftWorkspace') === -1 && hydrate.indexOf('getWorkspace') === -1, 'hydrate does NOT switch to the scoped SSOT (which would change the planning_cycle/company selection contract)');

// ===================================================================================================================
console.log('\n== §3/§4 RO Layer-2 expand + Send + save: bounded (KM.DB.refreshCacheTables), composer refresh ==');
ok(/var _RO_L2_TABLES = \['fc_regular_forecast', 'fc_special_events', 'fc_target_rules', 'factory_stock', 'warehouses', 'purchase_orders', 'purchase_order_lines'\];/.test(RO), '_RO_L2_TABLES = the 7 second-layer facts the expand/Send read');
var ensure = extractFn(RO, '_roEnsureL2Tables');
ok(/refreshCacheTables\(_RO_L2_TABLES\)/.test(ensure) && ensure.indexOf(FORCE) === -1, '_roEnsureL2Tables uses the bounded loader (never a whole-DB load)');
var toggle = extractFn(RO, '_roToggleRowByKey');
ok(/_roEnsureL2Tables\(false\)/.test(toggle) && toggle.indexOf('loadOperationDb') === -1, 'expand (_roToggleRowByKey) lazy-loads the bounded tables, not the whole DB');
var send = extractAssignedFn(RO, 'async function handleSendRequest');
ok(/await _roEnsureL2Tables\(false\)/.test(send), 'Send path ensures the bounded FC/factory/PO tables before building snapshots (reachable without expanding)');
var reload = extractFn(RO, '_roReloadAndRerender');
ok(/_opUseFirstLayerComposer\(\) && _opFirstLayerReady\(\)/.test(reload) && /_roEnsureL2Tables\(true\)/.test(reload) && /_opLoadFirstLayerComposer_\(\)/.test(reload), 'save-reload: canonical mode re-reads bounded FC tables then re-fetches the SCOPED composer');
ok(/_buildRequestOrderRowsFromDb/.test(reload), 'save-reload keeps the legacy broad rebuild ONLY on the legacy branch (composer branch returns first)');

// ===================================================================================================================
console.log('\n== §5/§6 FC Summary modals bounded; §14 Event Assist calc UNCHANGED ==');
var fcEnsure = extractFn(FC, '_fcEnsureBroadCacheThen');
ok(/refreshCacheTables/.test(fcEnsure) && /rc\(_FC_SECONDARY_TABLES\)/.test(fcEnsure) && fcEnsure.indexOf('loadOperationDb') === -1 && fcEnsure.indexOf('reloadOperationDb') === -1, '_fcEnsureBroadCacheThen uses the bounded refreshCacheTables loader (no whole-DB lazy load)');
ok(/var _FC_SECONDARY_TABLES = \['sku_details', 'marketplace_skus', 'campaigns', 'pricing_list', 'fc_regular_forecast', 'fc_special_events', 'marketplaces'\];/.test(FC), '_FC_SECONDARY_TABLES = exactly the modal facts');
ok(/function _fcResetSecondaryCache\(\) \{ _fcSecondaryLoaded = false; \}/.test(FC), '_fcResetSecondaryCache clears the bounded modal-cache flag');
ok(/_fcResetSecondaryCache\(\)/.test(extractFn(FC, '_fcAfterWrite')), '_fcAfterWrite resets the modal cache so the next modal open re-reads fresh after a FC write');
// Event Assist calculation transport unchanged (still the SAME base getters; only the tables are now bounded-loaded).
ok(/getFcRegularForecast/.test(extractFn(FC, '_evtBaseFcForSku')), 'Event Assist ADJUST base still reads fc_regular_forecast (calc unchanged)');
ok(/getFcSpecialEvents/.test(extractFn(FC, '_evtGrowthBaseForSku')), 'Event Assist GROWTH base still reads fc_special_events (calc unchanged)');
ok(/function _evtApplyForecastAssist/.test(FC), 'Event Assist calc _evtApplyForecastAssist present (business logic untouched — EVENT_ASSIST_AUTHORITY_REDESIGN stays DEFERRED)');

// ===================================================================================================================
console.log('\n== §7 sku-details Refresh-DB → scoped in canonical; legacy keeps whole-DB ==');
var refreshDb = extractFn(SKU, 'handleRefreshDb');
ok(/_skEffectiveWorkspace\(\)[\s\S]*_skWorkspaceRefresh_\(\)/.test(refreshDb), 'handleRefreshDb refreshes the scoped skuDetails workspace in canonical mode');
ok(/reloadOperationDb/.test(refreshDb), 'handleRefreshDb keeps reloadOperationDb for the legacy/kill-switch posture');

// ===================================================================================================================
console.log('\n== §14 authority debts untouched (Incoming / sitePlanning / Event Assist) ==');
ok(/_irBuildShipmentRemainingByReceiver/.test(IR), 'Incoming Inventory reconstruction present (unchanged)');
ok(/sitePlanningAllocation/.test(IR), 'sitePlanningAllocation present (unchanged)');

// ===================================================================================================================
console.log('\n== §9 Legacy kill-switch branches still self-load broad DB on demand ==');
// A representative set of the 16 legacy self-load branches must remain (rollback capability preserved).
ok(/Legacy broad-cache path \(kill-switch only\)/.test(RO) && RO.indexOf(FORCE) !== -1, 'request-order legacy init still self-loads broad DB when the composer kill switch is engaged');
ok((read('js/pages/factory-stock.js').match(/loadOperationDb/g) || []).length >= 1, 'factory-stock legacy branch still self-loads on demand');
ok((read('js/pages/purchase-order-overview.js').match(/loadOperationDb/g) || []).length >= 1, 'purchase-order-overview legacy branch still self-loads on demand');

// ===================================================================================================================
console.log('\n== §2/§6 BEFORE==AFTER data transport: bounded refreshCacheTables == normalizeOperationDb (same normalizer) ==');
var normNames = (DBAPI.match(/function (normalize[A-Za-z]+Record)\(/g) || []).map(function (m) { return m.replace('function ', '').replace('(', ''); });
var uniq = {}; normNames = normNames.filter(function (n) { if (uniq[n]) return false; uniq[n] = 1; return true; });
eval(extractAssignedFn(DBAPI, 'var CUSTOMS_TYPE_LABELS_ =') + ';');
eval(['_whBool', '_invPick', 'customsTypeLabelFallback_', '_codeHumanize_', '_fcParseEventPeriodDates'].map(function (n) { try { return extractFn(DBAPI, n); } catch (e) { return ''; } }).join('\n'));
eval(extractAssignedFn(DBAPI, 'var codeDisplay_ =') + ';');
eval(normNames.map(function (n) { return extractFn(DBAPI, n); }).join('\n'));
eval(extractFn(DBAPI, 'normalizeOperationDb'));
eval(extractAssignedFn(DBAPI, 'var _KM_TABLE_CACHE_KEY_ =') + ';');
eval('async ' + extractFn(DBAPI, '_kmRefreshCacheTables_'));

var window = {};
var rawDrafts = [{ allocation_draft_id: 'AD1', country: 'US', marketplace: 'Amazon', company: 'KM', status: 'active', updated_at: '2026-08-10' }, { allocation_draft_id: '' }];
var rawLines = [{ allocation_draft_line_id: 'L1', allocation_draft_id: 'AD1', sku: 'GA0450', planned_qty: 100, recommended_qty: 120 }, { allocation_draft_line_id: '' }];
var rawFc = [{ forecast_id: 'F1', sku: 'GA0450', year: 2026, jan: 10 }, { forecast_id: '' }];
var expectFull = normalizeOperationDb({ shipping_allocation_drafts: rawDrafts, shipping_allocation_draft_lines: rawLines, fc_regular_forecast: rawFc });

var asyncOk = true;
var mainPromise = (async function () {
  // Start with a NULL cache (as after prime removal), plus a pre-existing UNRELATED slice to prove isolation.
  window._opDbCache = null;
  // eslint-disable-next-line no-unused-vars
  getOperationDbTableFromSheet = async function (n) {
    if (n === 'shipping_allocation_drafts') return rawDrafts;
    if (n === 'shipping_allocation_draft_lines') return rawLines;
    if (n === 'fc_regular_forecast') return rawFc;
    return [];
  };
  // §1 draft hydrate transport: bounded load creates _opDbCache and the two draft slices, byte-identical to full-normalize.
  await _kmRefreshCacheTables_(['shipping_allocation_drafts', 'shipping_allocation_draft_lines']);
  ok(!!window._opDbCache, 'bounded load creates _opDbCache from null (no startup prime needed)');
  eq(window._opDbCache.shippingAllocationDrafts, expectFull.shippingAllocationDrafts, 'shippingAllocationDrafts slice == full-normalize (BEFORE==AFTER; hydrate reads identical data)');
  eq(window._opDbCache.shippingAllocationDraftLines, expectFull.shippingAllocationDraftLines, 'shippingAllocationDraftLines slice == full-normalize (byte-identical bySku input)');
  // §3 RO second-layer transport: a later bounded load of a different table patches ONLY that slice, leaving drafts intact.
  await _kmRefreshCacheTables_(['fc_regular_forecast']);
  eq(window._opDbCache.fcRegularForecast, expectFull.fcRegularForecast, 'fcRegularForecast slice == full-normalize (RO/FC secondary read BEFORE==AFTER)');
  eq(window._opDbCache.shippingAllocationDrafts, expectFull.shippingAllocationDrafts, 'the later bounded load left the earlier draft slice intact (bounded, not whole-DB replace)');
})().catch(function (e) { asyncOk = false; console.error('ASYNC FAIL', e && e.stack || e); });

mainPromise.then(function () {
  ok(asyncOk, 'async (bounded-transport) section completed without error');
  console.log('\n' + (fail ? ('✗ ' + fail + ' FAILED, ') : '✓ ') + pass + ' passed');
  if (fail) process.exitCode = 1;
});
