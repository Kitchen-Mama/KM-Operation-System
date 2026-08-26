// Kitchen Mama Operation System — F1-7K-BATCH-F-WRITER-FULL-RELOAD-RETIREMENT-R1
// Proves the canonical WRITE_FORCES_FULL_RELOAD transport pattern is retired: every one of the 47 writer
// success paths no longer calls loadOperationDb({force:true}); the shared post-write seam (_kmWriterPostWrite_)
// reloads the whole DB ONLY in a NON-scoped (rollback/kill-switch) posture and does NOTHING in the canonical
// posture; the ONE broad-cache primary surface (site confirmations) keeps its slice fresh via a BOUNDED targeted
// re-read; failure never invalidates; app.js prime + authority-debt code + writer payloads are unchanged.
// Run: node assets/tests/api-batch-f-writer-full-reload-retirement-f1-7k-r1.test.js
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
var IR_JS = read('js/pages/inventory-replenishment.js');
var APP_JS = read('js/app.js');
var FORCE = 'loadOperationDb({ force: true })';

// ===================================================================================================================
console.log('\n== §0/§21 the 47 writer success paths no longer force a whole-DB reload ==');
// 43 direct writers (window.KM.DB.X = async function). Site confirmations is the ONE bounded-patch exception.
var DIRECT_WRITERS = [
  'updateSkuLifecycle', 'upsertMarketplace', 'upsertMarketplaceSku', 'updateMarketplaceSkuModel', 'upsertSkuDetail',
  'upsertSkuRegionalDetail', 'upsertTaxReferralRate', 'upsertTaxRateComponent', 'confirmShipmentAndDispatch',
  'generateShipmentLineAllocations', 'updateShipmentReceipt', 'advanceShipmentRoutePoint', 'updateShipmentEta',
  'syncMarketplaceSkusToSkuRegionalDetails', 'createShippingPlansBatch', 'createShipmentFromPlan', 'updateShipment',
  'createRequestOrderDraft', 'upsertRequestOrderAllocationDraft', 'upsertRequestOrderAllocationDraftLines',
  'submitRequestOrderAllocationDrafts', 'importCarrierRateTemplate', 'updateRequestOrderStatus',
  'updateRequestOrderLineQty', 'cancelRequestOrderTier', 'createPurchaseOrderFromRequest', 'updatePurchaseOrderStatus',
  'updatePurchaseOrderLine', 'updatePurchaseOrderHeader', 'receivePurchaseOrderLines', 'upsertCampaign',
  'upsertCampaignSkuLines', 'upsertFcSpecialEvent', 'importFcSpecialEventsBatch', 'deleteFcSpecialEvent',
  'upsertFcTargetRule', 'deleteFcTargetRule', 'importMarketplaceSkusBatch', 'importFcRegularForecastBatch',
  'importOverseasInventorySnapshotBatch', 'adjustOverseasInventory', 'adjustFactoryInventory'
];
var SITE_CONF = 'upsertRequestOrderSiteConfirmations';
var bodies = {};
DIRECT_WRITERS.concat([SITE_CONF]).forEach(function (name) {
  bodies[name] = extractAssignedFn(DBAPI, 'window.KM.DB.' + name + ' = async function');
});
ok(Object.keys(bodies).length === 43, 'extracted 43 direct writer bodies (42 seam + 1 bounded) — got ' + Object.keys(bodies).length);

// (a) NO direct writer body contains the whole-DB force reload anymore.
DIRECT_WRITERS.concat([SITE_CONF]).forEach(function (name) {
  ok(bodies[name].indexOf(FORCE) === -1, 'writer ' + name + ' no longer calls loadOperationDb({force:true})');
});
// (b) the 42 (all direct writers except site confirmations) route their post-write through the shared seam.
DIRECT_WRITERS.forEach(function (name) {
  ok(bodies[name].indexOf('_kmWriterPostWrite_()') !== -1, 'writer ' + name + ' routes post-write through _kmWriterPostWrite_()');
});
// (c) site confirmations uses the BOUNDED targeted patch (broad-cache primary surface), NOT the seam, NOT a reload.
ok(bodies[SITE_CONF].indexOf("_kmRefreshCacheTables_(['request_order_site_confirmations'])") !== -1, SITE_CONF + ' uses the bounded targeted cache patch');
ok(bodies[SITE_CONF].indexOf('_kmWriterPostWrite_') === -1, SITE_CONF + ' does not also call the generic seam');

// The 4 unwired Weekly L1/L2/Combined writers go through _kmShippingPost_ with reloadAfter=true.
var SHIPPING_POST_WRITERS = ['updateShippingPlanRationale', 'selectShippingPlanCarrier', 'combineShippingPlans', 'uncombineShippingPlans'];
SHIPPING_POST_WRITERS.forEach(function (name) {
  var line = extractAssignedFn(DBAPI, 'window.KM.DB.' + name + ' =');
  ok(/_kmShippingPost_\([^)]*,\s*true\s*\)/.test(line), name + ' still requests reloadAfter=true via _kmShippingPost_');
});
var shippingPost = extractFn(DBAPI, '_kmShippingPost_');
ok(shippingPost.indexOf(FORCE) === -1, '_kmShippingPost_ no longer force-reloads directly');
ok(shippingPost.indexOf('if (reloadAfter) await _kmWriterPostWrite_();') !== -1, '_kmShippingPost_ routes reloadAfter through the seam');
// TOTAL writer methods off the whole-DB reload = 42 seam + 1 bounded + 4 shipping-post = 47.
ok(DIRECT_WRITERS.length + 1 + SHIPPING_POST_WRITERS.length === 47, 'writer methods accounted for == 47 (42 seam + 1 bounded + 4 shipping-post)');

// Only TWO literal whole-DB force reload CALLS survive in the db-api: the seam's own fallback + the manual/debug
// util (counting `await loadOperationDb({ force: true });` — the 2 doc-comment mentions are not calls).
var forceCount = (DBAPI.split('await ' + FORCE + ';').length - 1);
eq(forceCount, 2, 'db-api makes exactly 2 whole-DB force reload calls (seam fallback + reloadOperationDb debug util)');
ok(extractFn(DBAPI, '_kmWriterPostWrite_').indexOf(FORCE) !== -1, 'the seam fallback IS one of the two (posture-gated whole reload)');
ok(extractAssignedFn(DBAPI, 'window.reloadOperationDb = async function').indexOf(FORCE) !== -1, 'the manual/debug reloadOperationDb IS the other (unchanged explicit reload)');

// ===================================================================================================================
console.log('\n== §1/§13/§23/§25 auto-coupled posture probe: reload ONLY in a non-scoped (rollback) posture ==');
var window = { KM: {} };
var _KM_CANONICAL_WORKSPACES_;
eval(extractAssignedFn(DBAPI, 'var _KM_CANONICAL_WORKSPACES_ =') + ';');
eval(extractFn(DBAPI, '_kmScopedPostureActive_'));
function allActiveApi() { return { workspaceApiActive: function () { return true; } }; }

// Canonical production posture: all 8 workspaces active, no kill switch → fully scoped → NO reload.
window = { KM: { api: allActiveApi() } };
ok(_kmScopedPostureActive_() === true, 'default posture (all workspaces active, no flags) → scoped → seam skips reload');
// Explicit master rollback flag → reload.
window = { KM: { api: allActiveApi() }, KM_WRITER_FULL_RELOAD: true };
ok(_kmScopedPostureActive_() === false, 'KM_WRITER_FULL_RELOAD===true → NOT scoped → seam reloads (rollback lever §23)');
// A3 non-workspace scoped-page kill switch → reload.
window = { KM: { api: allActiveApi() }, KM_SCOPED_PAGE_READS: false };
ok(_kmScopedPostureActive_() === false, 'KM_SCOPED_PAGE_READS===false → NOT scoped → seam reloads (A3 kill switch)');
// Any ONE canonical workspace rolled back (setWorkspaceEnabled(name,false)) → reload (single-lever rollback stays fresh).
window = { KM: { api: { workspaceApiActive: function (n) { return n !== 'shipment'; } } } };
ok(_kmScopedPostureActive_() === false, 'one workspace (shipment) disabled → NOT scoped → seam reloads (§25 no stale legacy consumer)');
// Foundation unavailable → cannot confirm scoped → reload (fail-safe).
window = { KM: {} };
ok(_kmScopedPostureActive_() === false, 'Foundation (KM.api) absent → cannot confirm → seam reloads (fail-safe)');
// workspaceApiActive throws → caught → reload (fail-safe).
window = { KM: { api: { workspaceApiActive: function () { throw new Error('boom'); } } } };
ok(_kmScopedPostureActive_() === false, 'workspaceApiActive throwing → caught → seam reloads (fail-safe)');
// The 8 gated workspaces are exactly the canonical set.
eq(_KM_CANONICAL_WORKSPACES_.slice().sort(), ['fcSummary', 'inventoryReplenishment', 'purchaseOrder', 'recommendation', 'requestOrder', 'shipment', 'skuDetails', 'weeklyShipping'], 'posture probe gates on exactly the 8 canonical workspaces');

// The seam body: reload iff NOT scoped (structural — no other behavior, no new cache/TTL).
var seamBody = extractFn(DBAPI, '_kmWriterPostWrite_');
ok(/if\s*\(!_kmScopedPostureActive_\(\)\)\s*\{\s*await loadOperationDb\(\{ force: true \}\);\s*\}/.test(seamBody), 'seam = reload iff !scoped posture (nothing else)');

// ===================================================================================================================
console.log('\n== §17 error semantics: a FAILED write never invalidates (seam is only in the success branch) ==');
// throw-style writers: the seam/patch call appears AFTER the `if (!json.success) throw` guard.
['upsertSkuDetail', 'createRequestOrderDraft', 'updatePurchaseOrderStatus', 'upsertCampaign', SITE_CONF].forEach(function (name) {
  var b = bodies[name] || extractAssignedFn(DBAPI, 'window.KM.DB.' + name + ' = async function');
  var g = b.indexOf('if (!json.success)');
  var s = Math.max(b.indexOf('_kmWriterPostWrite_()'), b.indexOf('_kmRefreshCacheTables_'));
  ok(g !== -1 && s !== -1 && s > g, name + ': post-write readback is AFTER the failure guard (error → no invalidation)');
});
// success-gated writers: the seam is wrapped in `if (json && json.success) { ... }`.
['confirmShipmentAndDispatch', 'updateShipmentReceipt', 'advanceShipmentRoutePoint', 'updateShipmentEta', 'importMarketplaceSkusBatch', 'importFcRegularForecastBatch', 'importOverseasInventorySnapshotBatch', 'adjustOverseasInventory', 'adjustFactoryInventory', 'importFcSpecialEventsBatch'].forEach(function (name) {
  // tolerate both the single-line and multi-line `if (json && json.success) { await _kmWriterPostWrite_(); }` forms.
  ok(/if \(json && json\.success\) \{\s*await _kmWriterPostWrite_\(\);\s*\}/.test(bodies[name]), name + ': seam fires only when json.success (no invalidation on failure)');
});

// ===================================================================================================================
console.log('\n== §12 writer PAYLOAD authority unchanged (transport-only round) ==');
// Each writer still POSTs its SAME canonical action — the change touched only the post-write line.
// (updateSkuLifecycle delegates the POST to updateSkuLifecycleInSheet, so its action lives outside the writer body — excluded here.)
var ACTIONS = {
  upsertMarketplace: 'upsertMarketplace', upsertMarketplaceSku: 'upsertMarketplaceSku',
  upsertSkuDetail: 'upsertSkuDetail', confirmShipmentAndDispatch: 'confirmShipmentAndDispatch',
  generateShipmentLineAllocations: 'generateShipmentLineAllocations', updateShipmentReceipt: 'shipment.receipt.update',
  updateShipment: 'updateShipment', createRequestOrderDraft: 'createRequestOrderDraft', updateRequestOrderStatus: 'updateRequestOrderStatus',
  createPurchaseOrderFromRequest: 'createPurchaseOrderFromRequest', receivePurchaseOrderLines: 'receivePurchaseOrderLines',
  upsertCampaign: 'upsertCampaign', upsertFcTargetRule: 'upsertFcTargetRule', adjustFactoryInventory: 'adjustFactoryInventory',
  importCarrierRateTemplate: 'importCarrierRateCards', upsertRequestOrderSiteConfirmations: 'upsertRequestOrderSiteConfirmations'
};
Object.keys(ACTIONS).forEach(function (name) {
  var b = bodies[name] || extractAssignedFn(DBAPI, 'window.KM.DB.' + name + ' = async function');
  ok(b.indexOf("action: '" + ACTIONS[name] + "'") !== -1, name + " still POSTs action:'" + ACTIONS[name] + "' (payload authority unchanged)");
});

// ===================================================================================================================
console.log('\n== §3/§10 bounded targeted cache patch: refreshes ONLY the named slice, reuses the SAME normalizer ==');
var normNames = (DBAPI.match(/function (normalize[A-Za-z]+Record)\(/g) || []).map(function (m) { return m.replace('function ', '').replace('(', ''); });
var uniq = {}; normNames = normNames.filter(function (n) { if (uniq[n]) return false; uniq[n] = 1; return true; });
eval(extractAssignedFn(DBAPI, 'var CUSTOMS_TYPE_LABELS_ =') + ';');
eval(['_whBool', '_invPick', 'customsTypeLabelFallback_', '_codeHumanize_', '_fcParseEventPeriodDates'].map(function (n) { try { return extractFn(DBAPI, n); } catch (e) { return ''; } }).join('\n'));
eval(extractAssignedFn(DBAPI, 'var codeDisplay_ =') + ';');
eval(normNames.map(function (n) { return extractFn(DBAPI, n); }).join('\n'));
eval(extractFn(DBAPI, 'normalizeOperationDb'));
eval(extractAssignedFn(DBAPI, 'var _KM_TABLE_CACHE_KEY_ =') + ';');
// extractFn drops the leading `async ` keyword; restore it so the eval'd fn keeps its await.
// F1-7N-FB-4E — both multi-table loaders now share ONE bounded reader, so the harness extracts it too.
var KM_SCOPED_READ_CONCURRENCY_ = 2;
eval('async ' + extractFn(DBAPI, '_kmReadTablesBounded_'));
eval('async ' + extractFn(DBAPI, '_kmRefreshCacheTables_'));

var asyncOk = true;
var mainPromise = (async function () {
  // Pre-existing cache with OTHER slices populated — the patch must NOT disturb them.
  window = { _opDbCache: normalizeOperationDb({ sku_details: [{ sku: 'GA0450', product_name: 'Can Opener' }], shipments: [{ shipment_id: 'SH1' }] }) };
  var beforeSku = JSON.stringify(window._opDbCache.skuDetails);
  var beforeShip = JSON.stringify(window._opDbCache.shipments);
  // eslint-disable-next-line no-unused-vars
  getOperationDbTableFromSheet = async function (n) {
    if (n === 'request_order_site_confirmations') return [{ site_confirmation_id: 'SC1', planning_cycle: '2026-08', company: 'KM', country: 'US', marketplace: 'Amazon', bucket: 'A', status: 'confirmed' }, { site_confirmation_id: '' }];
    return [];
  };
  await _kmRefreshCacheTables_(['request_order_site_confirmations']);
  var patched = window._opDbCache.requestOrderSiteConfirmations || [];
  ok(patched.length === 1 && patched[0].siteConfirmationId === 'SC1', 'bounded patch refreshed requestOrderSiteConfirmations (junk row filtered by the SAME normalizer)');
  ok(JSON.stringify(window._opDbCache.skuDetails) === beforeSku, 'bounded patch left the skuDetails slice untouched');
  ok(JSON.stringify(window._opDbCache.shipments) === beforeShip, 'bounded patch left the shipments slice untouched');
})().catch(function (e) { asyncOk = false; console.error('ASYNC FAIL', e && e.stack || e); });

// ===================================================================================================================
console.log('\n== §2/§3-§11 page-level post-write readback intact (no duplicate fetch, scoped where expected) ==');
// IR CSV import now owns its readback via _irAfterWrite (the single-row Add path already did) — no reliance on a reload.
ok(/_irAfterWrite\(function \(\) \{ if \(typeof renderReplenishment === 'function'\) renderReplenishment\(\); \}\);/.test(IR_JS), 'IR CSV import routes readback through _irAfterWrite (matches the single-row Add path)');
ok(IR_JS.indexOf('_irAfterWrite(function () { renderReplenishment(); })') !== -1, 'IR single-row Add readback via _irAfterWrite unchanged');
ok(IR_JS.indexOf('wrapper already reloaded the DB cache') === -1, 'IR CSV import no longer assumes the writer reloaded the whole DB');
// _irAfterWrite still does a scoped workspace re-read in Workspace mode (Legacy render-only).
ok(/function _irAfterWrite\(cb\)\s*\{[\s\S]*_irWorkspaceRefresh_\(\)/.test(IR_JS), '_irAfterWrite still performs the scoped IR workspace re-read (Workspace mode)');

// ===================================================================================================================
console.log('\n== §14/§15/§34-§38 debt untouched: app.js prime + authority-debt code unchanged ==');
// §15/§34 at F1-7K the app.js global prime remained; F1-7L has since removed it (writer-reload retirement is
// independent of the startup prime, so this Batch-F suite only asserts app.js has no WRITER reload path).
ok(!/_kmWriterPostWrite_|force: true/.test(APP_JS), 'app.js contains no writer full-reload path (Batch-F invariant holds regardless of the F1-7L prime removal)');
// §38 allocation-draft writers already used _kmWeeklyCommand_ (NO whole-DB reload) — unchanged, still no force reload.
['upsertShippingAllocationDraft', 'upsertShippingAllocationDraftLines', 'submitShippingAllocationDrafts', 'cancelShippingAllocationDraft'].forEach(function (name) {
  var line = extractAssignedFn(DBAPI, 'window.KM.DB.' + name + ' =');
  ok(line.indexOf('_kmWeeklyCommand_') !== -1 && line.indexOf(FORCE) === -1, name + ' still routes via _kmWeeklyCommand_ (no whole-DB reload) — unchanged');
});
// §38 IR allocation-draft hydrate (HALT E) reads the bare broad getters — the sole app-prime-removal blocker, untouched here.
ok(IR_JS.indexOf('getShippingAllocationDrafts') !== -1, 'IR allocation-draft hydrate still reads broad getters (HALT E untouched; not a Batch-F concern)');
// §36 refreshFactoryStockTables remains a TARGETED per-table re-read (never a whole-DB reload).
var rfst = extractAssignedFn(DBAPI, 'window.KM.DB.refreshFactoryStockTables = async function');
ok(rfst.indexOf(FORCE) === -1 && rfst.indexOf('getOperationDbTableFromSheet') !== -1, 'refreshFactoryStockTables stays a bounded per-table re-read (unchanged)');

// ===================================================================================================================
mainPromise.then(function () {
  ok(asyncOk, 'async (bounded-patch) section completed without error');
  console.log('\n' + (fail ? ('✗ ' + fail + ' FAILED, ') : '✓ ') + pass + ' passed');
  if (fail) process.exitCode = 1;
});
