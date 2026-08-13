// Kitchen Mama Operation System — F1-7E-PREREQ-3-SCOPED-RAW-INVENTORY-OWNER-R1
// GOLD-STANDARD equivalence: the NEW backend 54_ rivBuild_ (siteStockRawQty + overseasStockRawQty + factoryStockRawQty
// per SKU) MUST equal the CURRENT AI-Plan browser facts — request-order.js siteStock() + thirdParty() + factoryBySku —
// for the same fixture. We run the ACTUAL browser aggregations (extracted) over records from the ACTUAL db-api
// normalizers, and the ACTUAL backend over raw rows, asserting equality (browser null == backend 0). Transport
// migration: BEFORE FACT == AFTER FACT; no allocation, no planning engine, shared-factory pool preserved.
// Run: node assets/tests/api-raw-inventory-owner-f1-7e-prereq3-r1.test.js
// NOTE: no 'use strict' — extracted functions bind into module scope via direct eval.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function slice(src, a, b) { var i = src.indexOf(a), j = src.indexOf(b); return src.slice(i, j); }
function extractFn(src, name) {
  var sig = 'function ' + name + '('; var i = src.indexOf(sig); if (i < 0) throw new Error('fn not found: ' + name);
  var start = i, depth = 0, started = false;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') { depth++; started = true; } else if (ch === '}') { depth--; if (started && depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced fn: ' + name);
}

var GS54 = read('specs/active/apps-script/54_api_v1_raw_inventory_owner.gs');
var ROUTER = read('specs/active/apps-script/01_router.gs');
var DBAPI = read('js/api/operation-system-db-api.js');
var ROJS = read('js/pages/request-order.js');

// ---- eval the NEW backend (whole 54_; impure prod*/SpreadsheetApp refs live inside rivDefaultIo_, only when CALLED) ----
eval(GS54);

// ---- eval the REAL db-api inventory normalizers (the browser's input path) ----
eval(extractFn(DBAPI, '_invPick'));
eval(extractFn(DBAPI, '_whBool'));
eval(extractFn(DBAPI, 'normalizeFactoryStockRecord'));
eval(extractFn(DBAPI, 'normalizeOverseasInventorySnapshotRecord'));
eval(extractFn(DBAPI, 'normalizeAmazonInventorySnapshotRecord'));
eval(extractFn(DBAPI, 'normalizeWarehouseRecord'));

// ---- eval the REAL browser aggregations from request-order.js ----
var amzBySku, overseas, whById;   // siteStock/thirdParty close over these (reassigned per fixture)
eval(extractFn(ROJS, '_roUpper'));
eval(extractFn(ROJS, '_roLower'));
eval(extractFn(ROJS, 'siteStock'));     // nested — closes over amzBySku
eval(extractFn(ROJS, 'thirdParty'));    // nested — closes over overseas + whById

// The equivalence harness: OLD browser siteStock/thirdParty/factoryBySku vs NEW backend, on the SAME raw rows.
function runEquiv(label, rawAmz, rawOverseas, rawFactory, rawWh, scope, skus) {
  var normAmz = rawAmz.map(normalizeAmazonInventorySnapshotRecord);
  var normOverseas = rawOverseas.map(normalizeOverseasInventorySnapshotRecord);
  var normFactory = rawFactory.map(normalizeFactoryStockRecord);
  var normWh = rawWh.map(normalizeWarehouseRecord);
  amzBySku = {}; normAmz.forEach(function (r) { (amzBySku[_roUpper(r.sku)] = amzBySku[_roUpper(r.sku)] || []).push(r); });
  overseas = normOverseas;
  whById = {}; normWh.forEach(function (w) { if (w.warehouseId) whById[w.warehouseId] = w; });
  var factoryBySku = {}; normFactory.forEach(function (f) { factoryBySku[_roUpper(f.sku)] = (factoryBySku[_roUpper(f.sku)] || 0) + (parseFloat(f.currentStock) || 0); });
  var vm = rivBuild_({ amazon_inventory_snapshot: rawAmz, overseas_inventory_snapshot: rawOverseas, factory_stock: rawFactory, warehouses: rawWh }, { scope: scope, skus: skus });
  var newBySku = {}; vm.items.forEach(function (it) { newBySku[String(it.sku).toUpperCase()] = it; });
  skus.forEach(function (sku) {
    var got = newBySku[String(sku).toUpperCase()];
    var oldSite = siteStock(sku, scope.country || '', scope.marketplace || '');
    var oldOverseas = thirdParty(sku, scope.country || '');
    var oldFactory = factoryBySku[_roUpper(sku)] || 0;
    eq(got.siteStockRawQty, (oldSite === null ? 0 : oldSite), label + ' :: SITE ' + sku + ' (browser ' + JSON.stringify(oldSite) + ')');
    eq(got.overseasStockRawQty, (oldOverseas === null ? 0 : oldOverseas), label + ' :: OVERSEAS ' + sku + ' (browser ' + JSON.stringify(oldOverseas) + ')');
    eq(got.factoryStockRawQty, oldFactory, label + ' :: FACTORY ' + sku + ' (browser ' + oldFactory + ')');
  });
  return vm;
}

var WH_US = [{ warehouse_id: 'WH-US-1', country: 'US', is_factory_warehouse: 'false' }, { warehouse_id: 'WH-US-2', country: 'US', is_factory_warehouse: '' }, { warehouse_id: 'WH-CA-1', country: 'CA', is_factory_warehouse: 'no' }, { warehouse_id: 'WH-FAC', country: 'CN', is_factory_warehouse: 'true' }];

console.log('\n== SITE STOCK: strict scope, latest snapshot, 3-field sum ==');
// 1 one SKU; 3 exact site; 4 different country excluded; 5 different marketplace excluded; 7/8 multiple snapshots latest wins
runEquiv('site basic + latest + scope', [
  { snapshot_date: '2026-08-01', sku: 'GA0450', country: 'US', marketplace: 'amazon', available_qty: 100, fc_transfer_qty: 10, fc_processing_qty: 5 },   // older
  { snapshot_date: '2026-08-10', sku: 'GA0450', country: 'US', marketplace: 'amazon', available_qty: 200, fc_transfer_qty: 20, fc_processing_qty: 0 },   // LATEST -> 220
  { snapshot_date: '2026-08-20', sku: 'GA0450', country: 'CA', marketplace: 'amazon', available_qty: 999, fc_transfer_qty: 0, fc_processing_qty: 0 },    // CA excluded for US
  { snapshot_date: '2026-08-25', sku: 'GA0450', country: 'US', marketplace: 'walmart', available_qty: 777, fc_transfer_qty: 0, fc_processing_qty: 0 }     // walmart excluded for amazon
], [], [], WH_US, { country: 'US', marketplace: 'amazon', company: 'KM' }, ['GA0450', 'GHOST']);   // site 220 ; GHOST 0

// 2 multi-SKU; 6 company IGNORED (blank marketplace -> default 'Amazon'); 10 invalid numeric
runEquiv('site multi-SKU + default-Amazon + invalid', [
  { snapshot_date: '2026-08-10', sku: 'S1', country: 'US', marketplace: '', available_qty: 'x', fc_transfer_qty: 7, fc_processing_qty: 3 },   // blank mp -> 'Amazon'; invalid avail 'x'->0 => 10
  { snapshot_date: '2026-08-10', sku: 'S2', country: 'US', marketplace: 'Amazon', available_qty: 4, fc_transfer_qty: 0, fc_processing_qty: 0 }
], [], [], WH_US, { country: 'US', marketplace: 'amazon' }, ['S1', 'S2']);   // S1=10 (default Amazon matches), S2=4

console.log('\n== OVERSEAS: pooled across warehouses, factory excluded, country strict ==');
// 11 one wh; 12 multiple wh pooled; 13/14 multiple rows same wh (browser SUMS -> backend SUMS, BEFORE==AFTER); 15 scope; factory wh excluded
runEquiv('overseas pool + factory-exclude + country', [], [
  { snapshot_date: '2026-08-01', sku: 'OV', warehouse_id: 'WH-US-1', available_stock: 100 },   // US non-factory -> in
  { snapshot_date: '2026-08-02', sku: 'OV', warehouse_id: 'WH-US-2', available_stock: 50 },    // US non-factory -> in (pooled)
  { snapshot_date: '2026-08-03', sku: 'OV', warehouse_id: 'WH-US-1', available_stock: 25 },    // same wh, another row -> browser SUMS (pooled, no dedup)
  { snapshot_date: '2026-08-04', sku: 'OV', warehouse_id: 'WH-CA-1', available_stock: 999 },   // CA -> excluded for US scope
  { snapshot_date: '2026-08-05', sku: 'OV', warehouse_id: 'WH-FAC', available_stock: 500 },    // factory wh -> excluded
  { snapshot_date: '2026-08-06', sku: 'OV', warehouse_id: 'WH-UNKNOWN', available_stock: 42 }  // no wh record + country set -> excluded
], [], WH_US, { country: 'US', marketplace: 'amazon', company: 'KM' }, ['OV', 'NONE']);   // overseas = 100+50+25 = 175 ; NONE 0

// 16 zero + no-country scope includes unknown-warehouse rows (matches browser: wh missing + no country -> included)
runEquiv('overseas no-country scope includes unknown wh', [], [
  { sku: 'OV2', warehouse_id: 'WH-UNKNOWN', available_stock: 8 },
  { sku: 'OV2', warehouse_id: 'WH-FAC', available_stock: 500 }   // factory still excluded (wh found)
], [], WH_US, {}, ['OV2']);   // no country -> unknown wh included (8); factory excluded -> 8

console.log('\n== FACTORY: shared per-SKU pool (company/factory-INDEPENDENT) ==');
// 17 one row; 18 multiple rows same SKU summed; 19 multiple factories summed; 22 zero; 23 invalid numeric; fac_current_stock canonical
runEquiv('factory sum + canonical col + invalid', [], [], [
  { sku: 'FS', warehouse_id: 'WH-FAC', company: 'KM', fac_current_stock: 300 },     // canonical col
  { sku: 'FS', warehouse_id: 'WH-FAC2', company: 'ResTW', current_stock: 200 },     // legacy col + different company/factory -> still summed
  { sku: 'FS', warehouse_id: 'WH-FAC', company: 'ResUS', fac_current_stock: 'x' }   // invalid -> 0
], WH_US, { country: 'US', marketplace: 'amazon', company: 'KM' }, ['FS', 'NOFAC']);   // factory = 300+200+0 = 500 ; NOFAC 0

// 20/21 shared Factory A across KM / ResTW / ResUS -> SAME raw factory pool regardless of scope.company
console.log('\n== 20/21 shared-factory KM/ResTW/ResUS -> SAME raw factory pool (company context does NOT filter) ==');
var SHARED_FAC = [{ sku: 'SHARED', warehouse_id: 'FAC-A', company: 'KM', fac_current_stock: 700 }, { sku: 'SHARED', warehouse_id: 'FAC-A', company: 'ResTW', fac_current_stock: 300 }, { sku: 'SHARED', warehouse_id: 'FAC-A', company: 'ResUS', fac_current_stock: 200 }];
var facKM = rivBuild_({ factory_stock: SHARED_FAC }, { scope: { company: 'KM' }, skus: ['SHARED'] }).items[0].factoryStockRawQty;
var facTW = rivBuild_({ factory_stock: SHARED_FAC }, { scope: { company: 'ResTW' }, skus: ['SHARED'] }).items[0].factoryStockRawQty;
var facUS = rivBuild_({ factory_stock: SHARED_FAC }, { scope: { company: 'ResUS' }, skus: ['SHARED'] }).items[0].factoryStockRawQty;
ok(facKM === 1200 && facTW === 1200 && facUS === 1200, 'shared Factory A: KM==ResTW==ResUS == 1200 raw pool (company NEVER filters the raw factory fact)');

console.log('\n== COMBINED + ZERO/EMPTY/ERROR ==');
// 24 one SKU all three; 25 multi-SKU batch; 26 unknown SKU
var vmCombined = runEquiv('combined all-three', [
  { snapshot_date: '2026-08-10', sku: 'ALL', country: 'US', marketplace: 'amazon', available_qty: 60, fc_transfer_qty: 0, fc_processing_qty: 0 }
], [
  { sku: 'ALL', warehouse_id: 'WH-US-1', available_stock: 15 }
], [
  { sku: 'ALL', warehouse_id: 'WH-FAC', fac_current_stock: 40 }
], WH_US, { country: 'US', marketplace: 'amazon' }, ['ALL', 'UNKNOWN']);   // ALL: site 60, overseas 15, factory 40 ; UNKNOWN: 0/0/0
eq(vmCombined.items[1], { sku: 'UNKNOWN', siteStockRawQty: 0, overseasStockRawQty: 0, factoryStockRawQty: 0 }, 'unknown SKU -> 0/0/0 (deterministic)');

// 27 API error != zero; missing tables -> [] (graceful-empty)
var eio = { now: function () { return 0; }, nextSeq: function () { return 1; }, openTarget: function () { return {}; }, readTable: function (ss, name) { return name === 'factory_stock' ? [{ sku: 'Q', fac_current_stock: 9 }] : []; } };
var envOk = handleRawInventoryGet_({ payload: { scope: {}, skus: ['Q'] } }, eio);
ok(envOk.success === true && envOk.data.items[0].factoryStockRawQty === 9 && envOk.meta.workspace === 'rawInventory', 'orchestrator success envelope (missing snapshot tables -> 0, factory read)');
var throwIo = { now: function () { return 0; }, nextSeq: function () { return 1; }, openTarget: function () { var e = new Error('WRONG_SPREADSHEET_TARGET'); e.safetyToken = 'WRONG_SPREADSHEET_TARGET'; throw e; }, readTable: function () { return []; } };
var envErr = handleRawInventoryGet_({ payload: { scope: {}, skus: ['Q'] } }, throwIo);
ok(envErr.success === false && envErr.errors[0].code === 'WRONG_SPREADSHEET_TARGET' && envErr.data === null, 'backend failure -> ERROR envelope (never converted to zero)');
var io = rivDefaultIo_();
eq(io.readTable({ getSheetByName: function () { return null; } }, 'amazon_inventory_snapshot', [], true), [], 'io: missing optional inventory table -> [] (graceful-empty, not a throw)');

console.log('\n== source guards + no allocation + no cutover ==');
var code54 = GS54.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
ok(!/getOperationDb/.test(code54), '54_ never calls getOperationDb');
ok(!/\.setValue\(|appendRow|insertSheet|deleteRow|\.setValues\(/.test(code54), '54_ writes nothing (read-only)');
ok(!/KMPS|KMHP|KMTPP|allocat|order_planning_gap|generateRecommendation|calculatedGap|slaFifoCompare_|purchase_order_lines|fc_regular_forecast/.test(code54), '54_ runs NO allocation/gap/recommendation/FIFO/PO/forecast (no second inventory engine)');
ok(/amazon_inventory_snapshot/.test(GS54) && /overseas_inventory_snapshot/.test(GS54) && /factory_stock/.test(GS54) && /warehouses/.test(GS54), '54_ table scope = the 4 raw inventory/warehouse tables');
ok(/action === 'rawInventory\.get'/.test(ROUTER) && /handleRawInventoryGet_\(body\)/.test(ROUTER), 'router dispatches rawInventory.get');
// RAW-qualified DTO names (no ambiguous availableQty/allocatedQty/supplyQty)
ok(/siteStockRawQty/.test(GS54) && /overseasStockRawQty/.test(GS54) && /factoryStockRawQty/.test(GS54) && !/allocatedQty|supplyQty/.test(GS54), 'DTO names carry RAW semantics (no allocated/supply naming)');
// no AI-Plan cutover this round
ok(/function siteStock\(/.test(ROJS) && /function thirdParty\(/.test(ROJS) && /loadOperationDb\(\{ force: true \}\)/.test(ROJS), 'request-order.js still owns siteStock()/thirdParty()/factory sum + broad cache (NO cutover)');
ok(ROJS.indexOf('rawInventory.get') < 0 && ROJS.indexOf('siteStockRawQty') < 0, 'request-order.js does NOT yet consume the new owner (PREREQ-5)');

console.log('\n----------------------------------------');
console.log('API RAW INVENTORY OWNER (F1-7E-PREREQ-3-R1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
