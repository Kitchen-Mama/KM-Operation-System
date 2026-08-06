// Kitchen Mama Operation System — Factory Inventory Initial Stock Import (F0-HOTFIX-FI1).
// Run: node assets/tests/factory-inventory-import-f0-hotfix-fi1.test.js
// -----------------------------------------------------------------------------
// (A) Evals the PURE server batch evaluator factoryImportEvaluateBatch_ (extracted from
// 21_factory_inventory_handlers.gs) and proves SET semantics, create/update/unchanged classification,
// duplicate dedupe vs conflict, warehouse+sku authority, zero-valid / blank-missing / negative+decimal
// invalid, ATOMIC_BATCH_VALIDATION (any invalid ⇒ ok:false), and the row limit. (B) Evals the frontend CSV
// helpers (extracted from factory-stock.js) for header + quote + example-row handling. (C) Source-scans the
// handler / router / adapter / page / HTML for the mandated safety + wiring + UI-placement guarantees.
// NOTE: intentionally NOT strict — extracted top-level declarations must bind into this module scope.

var fs = require('fs');
var path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var GS = read('specs/active/apps-script/21_factory_inventory_handlers.gs');
var ROUTER = read('specs/active/apps-script/01_router.gs');
var ADAPTER = read('js/api/operation-system-db-api.js');
var PAGEJS = read('js/pages/factory-stock.js');
var HTML = read('html/pages/factory-stock.html');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function slice(src, m1, m2) { var a = src.indexOf(m1), b = src.indexOf(m2); if (a < 0 || b < 0) throw new Error('markers not found: ' + m1); return src.slice(a, b); }

// ---- extract + eval the PURE evaluator ----
var PURE = slice(GS, '// __FIIMPORT_PURE_START__', '// __FIIMPORT_PURE_END__');
ok(PURE.length > 0, 'X0 pure evaluator markers present');
eval(PURE);
ok(typeof factoryImportEvaluateBatch_ === 'function', 'X1 factoryImportEvaluateBatch_ eval OK');

// ---- extract + eval the frontend CSV helpers ----
var PAGE = slice(PAGEJS, '// __FIIPAGE_START__', '// __FIIPAGE_END__');
ok(PAGE.length > 0, 'X2 page block markers present');
eval(PAGE);
ok(typeof _fiiCsvToRows === 'function' && typeof _fiiAssertHeaders === 'function' && typeof _fiiMakeBatchId === 'function', 'X3 frontend CSV helpers eval OK');

// ---- canonical context ----
function ctx() {
  return {
    warehouseById: {
      'WH-CN': { warehouseId: 'WH-CN', warehouseCode: 'CN01', isActive: true, isFactory: true },
      'WH-INACT': { warehouseId: 'WH-INACT', warehouseCode: 'X', isActive: false, isFactory: true },
      'WH-NONFAC': { warehouseId: 'WH-NONFAC', warehouseCode: 'Y', isActive: true, isFactory: false }
    },
    skuSet: { 'CO1100-R': true, 'SP3120-B': true },
    existingByKey: { 'WH-CN||CO1100-R': { current: 100, reserved: 20 } }
  };
}
function firstIssue(res) { return res.issues.length ? res.issues[0].code : null; }
function byStatus(res, st) { return res.previewRows.filter(function (p) { return p.status === st; }); }

(function () {
  section('A. PURE evaluator — SET semantics + classification');
  var upd = factoryImportEvaluateBatch_([{ warehouse_id: 'WH-CN', sku: 'CO1100-R', current_stock_qty: '250' }], ctx());
  ok(upd.ok === true && upd.mode === 'SET_CURRENT_STOCK', 'A1 valid batch ok:true, mode SET_CURRENT_STOCK');
  var u = upd.previewRows[0];
  ok(u.status === 'UPDATE' && u.existingCurrentStock === 100 && u.importedCurrentStock === 250 && u.difference === 150, 'A2 existing row → UPDATE; imported SETS (100→250, diff +150, imported=250 not 350)');
  ok(upd.summary.updateRows === 1 && upd.summary.validRows === 1 && upd.summary.createRows === 0, 'A3 summary counts update');

  var cre = factoryImportEvaluateBatch_([{ warehouse_id: 'WH-CN', sku: 'SP3120-B', current_stock_qty: '0' }], ctx());
  ok(cre.ok === true && byStatus(cre, 'CREATE').length === 1 && cre.previewRows[0].importedCurrentStock === 0, 'A4 missing row → CREATE; zero qty is VALID');
  ok(cre.summary.createRows === 1, 'A5 createRows counted');

  var unch = factoryImportEvaluateBatch_([{ warehouse_id: 'WH-CN', sku: 'CO1100-R', current_stock_qty: '100' }], ctx());
  ok(byStatus(unch, 'UNCHANGED').length === 1 && unch.summary.unchangedRows === 1, 'A6 before==after → UNCHANGED (no false movement later)');

  section('B. PURE evaluator — authority + field validation (each blocks the batch)');
  var wnf = factoryImportEvaluateBatch_([{ warehouse_id: 'WH-UNKNOWN', sku: 'CO1100-R', current_stock_qty: '5' }], ctx());
  ok(wnf.ok === false && firstIssue(wnf) === 'WAREHOUSE_NOT_FOUND', 'B1 unknown warehouse blocks');
  var win = factoryImportEvaluateBatch_([{ warehouse_id: 'WH-INACT', sku: 'CO1100-R', current_stock_qty: '5' }], ctx());
  ok(win.ok === false && win.issues.some(function (i) { return i.code === 'WAREHOUSE_INACTIVE'; }), 'B2 inactive warehouse blocks');
  var wnf2 = factoryImportEvaluateBatch_([{ warehouse_id: 'WH-NONFAC', sku: 'CO1100-R', current_stock_qty: '5' }], ctx());
  ok(wnf2.ok === false && wnf2.issues.some(function (i) { return i.code === 'WAREHOUSE_NOT_FACTORY'; }), 'B3 non-factory warehouse blocks');
  var snf = factoryImportEvaluateBatch_([{ warehouse_id: 'WH-CN', sku: 'NOPE', current_stock_qty: '5' }], ctx());
  ok(snf.ok === false && snf.issues.some(function (i) { return i.code === 'SKU_NOT_FOUND'; }), 'B4 unknown sku blocks');
  var mis = factoryImportEvaluateBatch_([{ warehouse_id: 'WH-CN', warehouse_code: 'WRONG', sku: 'CO1100-R', current_stock_qty: '5' }], ctx());
  ok(mis.ok === false && mis.issues.some(function (i) { return i.code === 'WAREHOUSE_ID_CODE_MISMATCH'; }), 'B5 warehouse_code conflicting with warehouse_id blocks (id is identity)');
  var blank = factoryImportEvaluateBatch_([{ warehouse_id: 'WH-CN', sku: 'CO1100-R', current_stock_qty: '' }], ctx());
  ok(blank.ok === false && blank.issues.some(function (i) { return i.code === 'QTY_REQUIRED'; }), 'B6 blank qty is MISSING (not zero) → blocks');
  var neg = factoryImportEvaluateBatch_([{ warehouse_id: 'WH-CN', sku: 'CO1100-R', current_stock_qty: '-3' }], ctx());
  ok(neg.ok === false && neg.issues.some(function (i) { return i.code === 'QTY_INVALID'; }), 'B7 negative qty blocks');
  var dec = factoryImportEvaluateBatch_([{ warehouse_id: 'WH-CN', sku: 'CO1100-R', current_stock_qty: '3.5' }], ctx());
  ok(dec.ok === false && dec.issues.some(function (i) { return i.code === 'QTY_INVALID'; }), 'B8 decimal qty blocks (integer stock)');
  var ed = factoryImportEvaluateBatch_([{ warehouse_id: 'WH-CN', sku: 'CO1100-R', current_stock_qty: '5', effective_date: '2026-13-40' }], ctx());
  ok(ed.ok === false && ed.issues.some(function (i) { return i.code === 'EFFECTIVE_DATE_INVALID'; }), 'B9 malformed effective_date blocks');
  var longNote = new Array(502).join('x');
  var nl = factoryImportEvaluateBatch_([{ warehouse_id: 'WH-CN', sku: 'CO1100-R', current_stock_qty: '5', note: longNote }], ctx());
  ok(nl.ok === false && nl.issues.some(function (i) { return i.code === 'NOTE_TOO_LONG'; }), 'B10 over-long note blocks');

  section('C. PURE evaluator — duplicates + atomic batch');
  var dupId = factoryImportEvaluateBatch_([{ warehouse_id: 'WH-CN', sku: 'SP3120-B', current_stock_qty: '5' }, { warehouse_id: 'WH-CN', sku: 'SP3120-B', current_stock_qty: '5' }], ctx());
  ok(dupId.ok === true && dupId.summary.duplicateRows === 1 && byStatus(dupId, 'DUPLICATE_IDENTICAL_ROW').length === 1, 'C1 identical duplicate → deduped (ok, written once)');
  var dupConf = factoryImportEvaluateBatch_([{ warehouse_id: 'WH-CN', sku: 'SP3120-B', current_stock_qty: '5' }, { warehouse_id: 'WH-CN', sku: 'SP3120-B', current_stock_qty: '7' }], ctx());
  ok(dupConf.ok === false && dupConf.issues.some(function (i) { return i.code === 'DUPLICATE_FACTORY_SKU_CONFLICT'; }), 'C2 conflicting duplicate → blocks whole batch (no latest-win)');
  var mixed = factoryImportEvaluateBatch_([{ warehouse_id: 'WH-CN', sku: 'CO1100-R', current_stock_qty: '250' }, { warehouse_id: 'WH-CN', sku: 'NOPE', current_stock_qty: '5' }], ctx());
  ok(mixed.ok === false && mixed.summary.invalidRows >= 1 && mixed.summary.validRows === 1, 'C3 ATOMIC: one invalid ⇒ ok:false (caller writes NOTHING even though a valid row exists)');
  var big = []; for (var i = 0; i < 5001; i++) big.push({ warehouse_id: 'WH-CN', sku: 'CO1100-R', current_stock_qty: '1' });
  var rl = factoryImportEvaluateBatch_(big, ctx());
  ok(rl.ok === false && firstIssue(rl) === 'ROW_LIMIT_EXCEEDED', 'C4 row limit fails closed');

  section('D. frontend CSV parse');
  var rows = _fiiCsvToRows('warehouse_id,sku,current_stock_qty,note\nWH-CN,CO1100-R,10,"a, b"\nWH-CN,SP3120-B,0,ok\n');
  ok(rows.length === 2 && rows[0].warehouse_id === 'WH-CN' && rows[0].current_stock_qty === '10', 'D1 CSV rows parsed with header mapping');
  ok(rows[0].note === 'a, b', 'D2 quoted comma preserved');
  ok(rows[0].__row === 2, 'D3 __row carries the source line number');
  var threw = false; try { _fiiCsvToRows('warehouse_id,sku\nWH-CN,CO1100-R\n'); } catch (e) { threw = /current_stock_qty/.test(e.message); }
  ok(threw, 'D4 missing required header rejected');
  var dupH = false; try { _fiiAssertHeaders(['warehouse_id', 'sku', 'sku', 'current_stock_qty']); } catch (e) { dupH = /Duplicate/.test(e.message); }
  ok(dupH, 'D5 duplicate header rejected');
  var exRows = _fiiCsvToRows('warehouse_id,sku,current_stock_qty,row_type\nWH-CN,CO1100-R,0,example\nWH-CN,SP3120-B,7,\n');
  ok(exRows.length === 1 && exRows[0].sku === 'SP3120-B', 'D6 template example row (row_type=example) skipped');
  ok(/^FII-\d{8}-[A-Za-z0-9]{1,16}$/.test(_fiiMakeBatchId()), 'D7 batch id format FII-YYYYMMDD-XXXX');

  section('E. server handler safety + wiring (source scan)');
  var CG = GS.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  ok(/LockService\.getScriptLock/.test(CG), 'E1 commit uses LockService');
  ok(/prodAssertDbTarget_\(ss, prodExpectedDbId_\(\)\)/.test(CG), 'E2 exact Spreadsheet-ID gate before read');
  ok(/if \(!evalResult\.ok\)/.test(CG) && /BATCH_VALIDATION_FAILED/.test(CG), 'E3 ATOMIC gate: any block ⇒ zero writes');
  ok(/movement_type: 'inventory_import'/.test(CG) && /related_entity_type: 'factory_inventory_import'/.test(CG), 'E4 movement uses the real factory_stock_movements schema + import type');
  ok(/related_entity_id: batchId/.test(CG), 'E5 movement carries the import batch id (idempotency reference)');
  ok(/factoryImportCommittedKeys_/.test(CG), 'E6 per-row idempotency lookup by batch id (resume-safe retry)');
  ok(/setValue\(afterCurrent\)/.test(CG), 'E7 SETs fac_current_stock to the imported quantity (never appends/adds)');
  ok(/fac_reserved_stock/.test(GS) && !/setValue\(.*reserved/i.test(CG), 'E8 reserved is never written by import (available stays derived)');
  ok(/'FS-' \+ p\.warehouse_id \+ '-' \+ p\.sku/.test(CG), 'E9 missing row created with the canonical baseline id');
  ok(/IMPORT_AUDIT_WRITE_FAILED/.test(CG), 'E10 committed-with-audit-failure classification (compensation)');
  ok(!/supplier/i.test(CG), 'E11 no supplier dependency in the import handler');
  ok(!/insertSheet|createSheet|appendColumn|setHeader/i.test(CG), 'E12 no runtime sheet/header creation');

  section('F. router + adapter (thin routing; decoupled ack / targeted readback)');
  ok(/action === 'factoryInventory\.import\.validate'/.test(ROUTER) && /action === 'factoryInventory\.import\.commit'/.test(ROUTER), 'F1 both actions registered (thin)');
  ok(/handleFactoryInventoryImportValidate_\(body\)/.test(ROUTER) && /handleFactoryInventoryImportCommit_\(body\)/.test(ROUTER), 'F2 router delegates to the handlers (no business logic in router)');
  var commitFn = ADAPTER.slice(ADAPTER.indexOf('factoryInventoryImportCommit = async function'), ADAPTER.indexOf('refreshFactoryStockTables = async function')).replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  ok(commitFn.length > 0 && !/loadOperationDb/.test(commitFn), 'F3 commit adapter is DECOUPLED (no whole-DB reload on ack)');
  ok(/refreshFactoryStockTables/.test(ADAPTER) && /getOperationDbTableFromSheet\('factory_stock'\)/.test(ADAPTER), 'F4 targeted readback re-GETs only factory tables (never whole DB)');
  var refreshFn = ADAPTER.slice(ADAPTER.indexOf('refreshFactoryStockTables = async function'), ADAPTER.indexOf('refreshFactoryStockTables = async function') + 900);
  ok(!/loadOperationDb/.test(refreshFn), 'F5 targeted refresh never calls loadOperationDb');

  section('G. page + HTML (SET wording, button placement, double-click, no cross-module writes)');
  var PC = PAGE.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  ok(/_fiiSubmitting/.test(PC) && /if \(_fiiSubmitting\) return;/.test(PC), 'G1 double-click guard → one commit');
  ok(/refreshFactoryStockTables/.test(PC) && !/loadOperationDb/.test(PC), 'G2 page refresh is targeted (no whole-DB reload)');
  ok(!/executeCommand|createRequestOrder|createShippingPlan|createPurchaseOrder|createShipment|importFcRegularForecast|adjustFactoryInventory|sendRequestOrder/i.test(PC), 'G3 no cross-module writes / Send Request / forecast / recommendation / order / shipment');
  ok(/will SET Factory Current Stock/.test(PAGE) && /will NOT add/.test(PAGE), 'G4 confirmation copy states SET, not ADD');
  ok(HTML.indexOf('factory-stock-import-btn') < HTML.indexOf('factory-stock-edit-btn'), 'G5 Import Inventory button is to the LEFT of Inventory Adjustment');
  ok(/openFactoryImportModal\(\)/.test(HTML) && /Import Inventory/.test(HTML), 'G6 button opens the import modal');
  ok(/Set Current Stock/.test(HTML) && /does not add/.test(HTML), 'G7 modal states Set Current Stock mode (not add)');
  ok(/accept="\.xlsx,\.csv/.test(HTML), 'G8 upload accepts .xlsx and .csv');
  var modalHtml = HTML.slice(HTML.indexOf('factory-import-modal'), HTML.indexOf('factory-import-modal') + 2500);
  ok(!/id="[^"]*supplier|name="[^"]*supplier|<select[^>]*supplier/i.test(modalHtml), 'G9 no supplier field/select in the import modal (Phase 1 has no supplier)');

  console.log('\n----------------------------------------');
  console.log('FACTORY INVENTORY IMPORT (F0-HOTFIX-FI1): ' + pass + ' passed, ' + fail + ' failed');
  if (fail > 0) { process.exitCode = 1; }
})();
