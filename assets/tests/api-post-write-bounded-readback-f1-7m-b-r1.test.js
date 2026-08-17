// Kitchen Mama Operation System — F1-7M-B-POST-WRITE-BOUNDED-READBACK-R1
// Proves B2: the RO Target% / FC second-layer edit post-write readback is now BOUNDED + PARALLEL, while the server
// stays authoritative:
//   • Target% edit → post-write refresh re-reads ONLY fc_target_rules (was the full 7-table _RO_L2_TABLES set).
//   • FC edit      → post-write refresh re-reads ONLY fc_regular_forecast (composer re-reads the first-layer FC fact).
//   • The bounded refresh and the composer re-read fire in the SAME wave (was serial refresh→composer); the composer's
//     SUCCESS render is GATED on the refresh so the still-open expand panel reads the fresh changed value.
//   • Conservative guard: narrow ONLY when the full L2 set was already primed (_roL2Ready) AND the caller named the
//     changed table(s); otherwise fall back to the prior full-set force refresh (byte-identical behavior).
//   • No new endpoint, no full-workspace read, no optimistic local mutation, no loadOperationDb, no app prime.
// It also LOCKS IN the deferrals (B1 Shipment / B3 IR = NEW_BOUNDED_ENDPOINT_REQUIRED: their readbacks are UNCHANGED).
// Run: node assets/tests/api-post-write-bounded-readback-f1-7m-b-r1.test.js
// NOTE: no 'use strict' — extracted source slices are eval'd into module scope.

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
function tick() { return new Promise(function (r) { setImmediate(r); }); }

var RO = read('js/pages/request-order.js');
var IR = read('js/pages/inventory-replenishment.js');

// ===================================================================================================================
console.log('\n== B2 structural: Target%/FC edits declare their single changed table; shared path forwards it ==');
ok(/_roBindEditModal\(function\(\) \{ return _roSaveTargetPct\([\s\S]*?\}, \['fc_target_rules'\]\);/.test(RO),
  'Target% edit binds the modal with changedTables=[fc_target_rules]');
ok(/_roBindEditModal\(function\(\) \{ return _roSaveFc\([\s\S]*?\}, \['fc_regular_forecast'\]\);/.test(RO),
  'FC edit binds the modal with changedTables=[fc_regular_forecast]');
ok(/function _roBindEditModal\(saveFn, changedTables\)/.test(RO), '_roBindEditModal takes changedTables');
ok(/_roReloadAndRerender\(changedTables\);/.test(RO), '_roBindEditModal forwards changedTables to _roReloadAndRerender');
ok(/function _roReloadAndRerender\(changedTables\)/.test(RO), '_roReloadAndRerender takes changedTables');
// The composer re-read (server authority) is RETAINED on the post-write path.
ok(/_opLoadFirstLayerComposer_\(refreshP\)/.test(RO), 'post-write path STILL re-reads the scoped composer (server authority) — gated on the bounded refresh');
// No full-workspace / broad read was introduced on this path.
ok(RO.indexOf('getWorkspace(') === -1 || !/_roReloadAndRerender[\s\S]{0,400}getWorkspace\(/.test(RO), 'no full-workspace readback introduced in _roReloadAndRerender');

// ===================================================================================================================
console.log('\n== B2 behavioral: bounded refresh + composer fire in ONE wave; render gated on BOTH ==');
var callLog, renderCount, errorState, _opFirstLayerSeq, requestOrderState, _roL2Ready;
var _RO_L2_TABLES = ['fc_regular_forecast', 'fc_special_events', 'fc_target_rules', 'factory_stock', 'warehouses', 'purchase_orders', 'purchase_order_lines'];
var _composerResolve, _composerPromise, _refreshResolve, _refreshPromise, _refreshNames, _fullRefreshCount;
function _resetEnv() {
  callLog = []; renderCount = 0; errorState = null; _opFirstLayerSeq = 0; requestOrderState = { data: [] }; _roL2Ready = true;
  _refreshNames = null; _fullRefreshCount = 0;
  _composerPromise = new Promise(function (r) { _composerResolve = r; });
  _refreshPromise = new Promise(function (r) { _refreshResolve = r; });
}
global.document = { getElementById: function () { return null; } };
global.window = { KM: {
  DB: {
    getAiPlanFirstLayer: function () { callLog.push('composer'); return _composerPromise; },
    refreshCacheTables: function (names) { callLog.push('refresh:' + names.join(',')); _refreshNames = names.slice(); return _refreshPromise; }
  },
  loadState: { STATES: { READY: 'READY', EMPTY: 'EMPTY', ERROR: 'ERROR' } }
} };
// Minimal stubs mirroring the real source (only what the extracted fns touch).
function _roUseDb() { return true; }
function _opUseFirstLayerComposer() { return true; }
function _opFirstLayerReady() { return true; }
function _opFirstLayerRegion_() { return { beginLoad: function () {}, set: function (s) { errorState = s; } }; }
function _roRenderAll() { renderCount++; callLog.push('render'); }
function _opFirstLayerError_(err) { requestOrderState.data = []; errorState = 'ERROR'; callLog.push('error:' + (err && err.code)); }
function _opFirstLayerCycle() { return 'RECO-2026-08'; }
function _buildRequestOrderRowsFromDb() { return []; }
function renderRequestOrderTable() {}
global.requestAnimationFrame = function () {};
function _roEnsureL2Tables(force) { _fullRefreshCount++; callLog.push('refreshFULL'); return _refreshPromise; }
eval(extractFn(RO, '_opLoadFirstLayerComposer_'));
eval(extractFn(RO, '_roReloadAndRerender'));

(async function () {
  // --- Target% edit: primed cache + named table → bounded refresh of ONLY fc_target_rules ---
  _resetEnv();
  _roReloadAndRerender(['fc_target_rules']);
  eq(callLog.slice().sort(), ['composer', 'refresh:fc_target_rules'], 'B2: Target% edit fires composer + bounded refresh(fc_target_rules) in the SAME wave');
  eq(_refreshNames, ['fc_target_rules'], 'B2: refresh re-reads ONLY fc_target_rules (not the 7-table set)');
  ok(_fullRefreshCount === 0, 'B2: the full 7-table _roEnsureL2Tables refresh is NOT used when the change is bounded');
  ok(renderCount === 0, 'B2: no render before both reads resolve');
  _composerResolve({ success: true, data: { rows: [{ sku: 'A' }] } });
  await tick();
  ok(renderCount === 0, 'B2: composer alone does NOT render — the render gate waits for the bounded refresh (fresh target% cache)');
  _refreshResolve();
  await tick();
  ok(renderCount === 1, 'B2: render fires once BOTH the composer and the bounded refresh resolve');
  eq(errorState, 'READY', 'B2: rows present → READY');

  // --- FC edit: bounded refresh of ONLY fc_regular_forecast ---
  _resetEnv();
  _roReloadAndRerender(['fc_regular_forecast']);
  eq(_refreshNames, ['fc_regular_forecast'], 'B2: FC edit re-reads ONLY fc_regular_forecast');
  ok(callLog.indexOf('composer') !== -1, 'B2: FC edit STILL re-reads the composer (first-layer FC authority)');
  ok(_fullRefreshCount === 0, 'B2: FC edit does not trigger the full 7-table refresh');

  // --- Conservative fallback: cache NOT yet primed → full-set refresh (unchanged behavior) ---
  _resetEnv(); _roL2Ready = false;
  _roReloadAndRerender(['fc_target_rules']);
  ok(_fullRefreshCount === 1, 'B2: when the L2 set is NOT primed, fall back to the full force refresh (unchanged behavior)');
  ok(_refreshNames === null, 'B2: bounded refresh not used in the un-primed fallback');

  // --- Conservative fallback: no named table → full-set refresh ---
  _resetEnv();
  _roReloadAndRerender();
  ok(_fullRefreshCount === 1, 'B2: no changedTables → full force refresh (unchanged behavior)');

  // --- READBACK FAILURE must not fake success: composer failure → bounded ERROR, no render ---
  _resetEnv();
  _roReloadAndRerender(['fc_target_rules']);
  _composerResolve({ success: false, errors: [{ code: 'READ_FAILED', message: 'x' }] });
  await tick();
  ok(renderCount === 0 && errorState === 'ERROR', 'B2: composer readback failure → bounded ERROR, no render, no fake success');

  // --- STALE-response protection: a newer post-write bumps the seq; the stale render is dropped ---
  _resetEnv();
  _roReloadAndRerender(['fc_target_rules']);        // seq → 1
  _composerResolve({ success: true, data: { rows: [{ sku: 'Z' }] } });
  await tick();
  _opFirstLayerSeq = 9;                              // a newer readback superseded this one
  _refreshResolve();
  await tick();
  ok(renderCount === 0, 'B2: a superseded (stale-seq) readback render is dropped even after its refresh resolves');

  // ===================================================================================================================
  console.log('\n== B4 Factory / B5 Overseas: post-write re-reads ONLY mutable tables; static tables MERGED, not clobbered ==');
  var FS = read('js/pages/factory-stock.js');
  var OS = read('js/pages/overseas-stock.js');
  // Shared harness: loadScopedTables mirrors the real normalizeOperationDb shape (EVERY key present; empties for
  // tables not requested) so the test proves the merge does not clobber retained static tables with [].
  function _fullShape(over) {
    var base = { factoryStock: [], factoryStockMovements: [], skuDetails: [], warehouses: [], overseasInventorySnapshot: [], overseasInventoryMovements: [] };
    return Object.assign(base, over || {});
  }
  var _scopedCalls;
  global.window.KM.DB.loadScopedTables = function (names) {
    _scopedCalls.push(names.slice());
    // Return a full-shaped object populated ONLY for the requested tables (rest empty) — like normalizeOperationDb.
    var over = {};
    if (names.indexOf('factory_stock') !== -1) over.factoryStock = [{ sku: 'FRESH_FS' }];
    if (names.indexOf('factory_stock_movements') !== -1) over.factoryStockMovements = [{ movementId: 'FRESH_MV' }];
    if (names.indexOf('sku_details') !== -1) over.skuDetails = [{ sku: 'FRESH_DET' }];
    if (names.indexOf('warehouses') !== -1) over.warehouses = [{ warehouseId: 'FRESH_WH' }];
    if (names.indexOf('overseas_inventory_snapshot') !== -1) over.overseasInventorySnapshot = [{ sku: 'FRESH_OS' }];
    if (names.indexOf('overseas_inventory_movements') !== -1) over.overseasInventoryMovements = [{ movementId: 'FRESH_OMV' }];
    return Promise.resolve(_fullShape(over));
  };

  // ---- B4 Factory ----
  await (function () {
    var _fsReadModel, _fsScopedActive = function () { return true; };
    eval(extractFn(FS, '_fsAfterWrite'));
    _fsReadModel = _fullShape({ factoryStock: [{ sku: 'OLD_FS' }], skuDetails: [{ sku: 'MOUNT_DET' }], warehouses: [{ warehouseId: 'MOUNT_WH' }] });
    _scopedCalls = [];
    return new Promise(function (done) {
      _fsAfterWrite(function () {
        eq(_scopedCalls, [['factory_stock', 'factory_stock_movements']], 'B4: primed → post-write re-reads ONLY the 2 mutable tables');
        eq(_fsReadModel.factoryStock, [{ sku: 'FRESH_FS' }], 'B4: mutable factory_stock refreshed from server');
        eq(_fsReadModel.skuDetails, [{ sku: 'MOUNT_DET' }], 'B4: static sku_details RETAINED (not clobbered)');
        eq(_fsReadModel.warehouses, [{ warehouseId: 'MOUNT_WH' }], 'B4: static warehouses RETAINED (not clobbered)');
        _fsReadModel = null; _scopedCalls = [];
        _fsAfterWrite(function () {
          eq(_scopedCalls, [['factory_stock', 'factory_stock_movements', 'sku_details', 'warehouses']], 'B4: un-primed fallback → full 4-table read (unchanged)');
          done();
        });
      });
    });
  })();

  // ---- B5 Overseas ----
  await (function () {
    var _osReadModel, _osScopedActive = function () { return true; };
    var _OS_TABLES = ['overseas_inventory_snapshot', 'overseas_inventory_movements', 'warehouses', 'sku_details'];
    var _OS_MUTABLE_TABLES = ['overseas_inventory_snapshot', 'overseas_inventory_movements'];
    eval(extractFn(OS, '_osAfterWrite'));
    _osReadModel = _fullShape({ overseasInventorySnapshot: [{ sku: 'OLD_OS' }], skuDetails: [{ sku: 'MOUNT_DET' }], warehouses: [{ warehouseId: 'MOUNT_WH' }] });
    _scopedCalls = [];
    return new Promise(function (done) {
      _osAfterWrite(function () {
        eq(_scopedCalls, [['overseas_inventory_snapshot', 'overseas_inventory_movements']], 'B5: primed → post-write re-reads ONLY the 2 mutable tables');
        eq(_osReadModel.overseasInventorySnapshot, [{ sku: 'FRESH_OS' }], 'B5: mutable snapshot refreshed from server');
        eq(_osReadModel.overseasInventoryMovements, [{ movementId: 'FRESH_OMV' }], 'B5: mutable movements refreshed from server');
        eq(_osReadModel.skuDetails, [{ sku: 'MOUNT_DET' }], 'B5: static sku_details RETAINED (not clobbered)');
        eq(_osReadModel.warehouses, [{ warehouseId: 'MOUNT_WH' }], 'B5: static warehouses RETAINED (not clobbered)');
        _osReadModel = null; _scopedCalls = [];
        _osAfterWrite(function () {
          eq(_scopedCalls, [['overseas_inventory_snapshot', 'overseas_inventory_movements', 'warehouses', 'sku_details']], 'B5: un-primed fallback → full 4-table read (unchanged)');
          done();
        });
      });
    });
  })();

  // ===================================================================================================================
  console.log('\n== B1 Shipment / B3 IR deferrals (NEW_BOUNDED_ENDPOINT_REQUIRED): readbacks UNCHANGED ==');
  // B3 IR: _irAfterWrite still does the FULL workspace readback (no sku/scope filter exists) — unchanged this round.
  ok(/getWorkspace\('inventoryReplenishment', \{\}\)/.test(IR), 'B3 IR post-write readback still the full unfiltered workspace (deferred — needs a new bounded endpoint)');
  ok(/function _irAfterWrite\(cb\)/.test(IR), 'B3 IR _irAfterWrite present and unchanged');

  // ===================================================================================================================
  console.log('\n== Frozen invariants (must not regress) ==');
  var FORCE = 'loadOperationDb({ force: true })';
  ok(read('js/app.js').indexOf('loadOperationDb') === -1, 'app prime remains 0');
  eq((read('js/api/operation-system-db-api.js').split('await ' + FORCE + ';').length - 1), 2, 'writer full-reload remains 0 (db-api 2 non-writer reloads)');
  eq((RO.match(/loadOperationDb\(\{ force: true \}\)/g) || []).length, 1, 'request-order.js canonical broad remains 0 (only the legacy kill-switch init branch)');
  ok(/_roEnsureL2Tables/.test(RO) && /refreshCacheTables/.test(RO), 'bounded getTable-based refresh path retained (no broad read introduced)');

  console.log('\n' + (fail ? ('✗ ' + fail + ' FAILED, ') : '✓ ') + pass + ' passed');
  if (fail) process.exitCode = 1;
})();
