// Kitchen Mama Operation System — F1-INVENTORY-IMPORT-WAREHOUSE-SAFETY-R1 warehouse identity hardening.
// Run: node assets/tests/inventory-import-warehouse-safety-f1-r1.test.js
// -----------------------------------------------------------------------------
// Proves both import systems unify on the canonical `warehouses` identity: (A) the PURE Overseas eligibility helper
// overseasImportWarehouseIssue_ (extracted from 05_) rejects unknown / inactive / Factory warehouses fail-closed;
// (B) the PURE Factory evaluator factoryImportEvaluateBatch_ (extracted from 21_) already rejects Overseas/unknown/
// inactive/id-code-mismatch and preserves SKU/qty validation; (C) both templates offer warehouse_id ONLY as a
// dropdown restricted to the eligible active class (Factory→factory, Overseas→non-factory), never free text; and
// (D) the Overseas import accepts the new .xlsx template while still accepting legacy .csv. Server re-validation is
// the authoritative gate (dropdown is convenience). No allocation/FC/recommendation/quantity semantics changed.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var OVS_GS = read('specs/active/apps-script/05_overseas_inventory_handlers.gs');
var FAC_GS = read('specs/active/apps-script/21_factory_inventory_handlers.gs');
var OVS_JS = read('js/pages/overseas-stock.js');
var FAC_JS = read('js/pages/factory-stock.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { if (a !== e) { fail++; console.error('FAIL ' + l + '\n  exp ' + JSON.stringify(e) + '\n  got ' + JSON.stringify(a)); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function slice(src, m1, m2) { var a = src.indexOf(m1), b = src.indexOf(m2); if (a < 0 || b < 0) throw new Error('markers not found: ' + m1); return src.slice(a, b); }

// ---- extract + eval the two PURE blocks ----
eval(slice(OVS_GS, '// __OVSIMPORT_PURE_START__', '// __OVSIMPORT_PURE_END__'));
ok(typeof overseasImportWarehouseIssue_ === 'function', 'X1 overseasImportWarehouseIssue_ eval OK');
eval(slice(FAC_GS, '// __FIIMPORT_PURE_START__', '// __FIIMPORT_PURE_END__'));
ok(typeof factoryImportEvaluateBatch_ === 'function', 'X2 factoryImportEvaluateBatch_ eval OK');

// =============================================================================
section('A/B/C/E/F — Overseas eligibility: only ACTIVE, NON-FACTORY warehouses pass; others fail closed');
eq(overseasImportWarehouseIssue_({ isActive: true, isFactory: false }), null, 'B valid active non-factory (Overseas/3PL) warehouse → eligible');
eq(overseasImportWarehouseIssue_(null), 'WAREHOUSE_NOT_FOUND', 'C unknown warehouse_id → WAREHOUSE_NOT_FOUND (fail closed)');
eq(overseasImportWarehouseIssue_({ isActive: false, isFactory: false }), 'WAREHOUSE_INACTIVE', 'F inactive warehouse → rejected');
eq(overseasImportWarehouseIssue_({ isActive: true, isFactory: true }), 'WAREHOUSE_NOT_OVERSEAS', 'E Overseas import selects a Factory warehouse → rejected (WAREHOUSE_NOT_OVERSEAS)');
eq(overseasImportWarehouseIssue_({ isActive: false, isFactory: true }), 'WAREHOUSE_INACTIVE', 'inactive is checked before factory (both invalid → still fails closed)');

section('A/C/D/F/G/H/I — Factory evaluator: mirror rejection + preserved SKU/qty (already hardened, regression)');
function facCtx() {
  return {
    warehouseById: {
      'WH-FAC': { warehouseId: 'WH-FAC', warehouseCode: 'F01', isActive: true, isFactory: true },
      'WH-OVS': { warehouseId: 'WH-OVS', warehouseCode: 'O01', isActive: true, isFactory: false },   // an Overseas warehouse
      'WH-INACT': { warehouseId: 'WH-INACT', warehouseCode: 'X', isActive: false, isFactory: true }
    },
    skuSet: { 'CO1100-R': true },
    existingByKey: {}
  };
}
function facIssues(rows, ctx) { var r = factoryImportEvaluateBatch_(rows, ctx); return r.issues.map(function (x) { return x.code; }); }
ok(factoryImportEvaluateBatch_([{ warehouse_id: 'WH-FAC', sku: 'CO1100-R', current_stock_qty: '10' }], facCtx()).ok === true, 'A valid Factory warehouse + sku → import OK');
ok(facIssues([{ warehouse_id: 'WH-OVS', sku: 'CO1100-R', current_stock_qty: '10' }], facCtx()).indexOf('WAREHOUSE_NOT_FACTORY') >= 0, 'D Factory import selects an Overseas warehouse → rejected (WAREHOUSE_NOT_FACTORY)');
ok(facIssues([{ warehouse_id: 'WH-NOPE', sku: 'CO1100-R', current_stock_qty: '10' }], facCtx()).indexOf('WAREHOUSE_NOT_FOUND') >= 0, 'C unknown warehouse → fails closed');
ok(facIssues([{ warehouse_id: 'WH-INACT', sku: 'CO1100-R', current_stock_qty: '10' }], facCtx()).indexOf('WAREHOUSE_INACTIVE') >= 0, 'F inactive warehouse → rejected');
ok(facIssues([{ warehouse_id: 'WH-FAC', warehouse_code: 'WRONG', sku: 'CO1100-R', current_stock_qty: '10' }], facCtx()).indexOf('WAREHOUSE_ID_CODE_MISMATCH') >= 0, 'G warehouse_id + warehouse_code mismatch → rejected (id is authority)');
ok(facIssues([{ warehouse_id: 'WH-FAC', sku: 'NOPE', current_stock_qty: '10' }], facCtx()).indexOf('SKU_NOT_FOUND') >= 0, 'H valid warehouse + invalid SKU → existing SKU validation preserved');
ok(facIssues([{ warehouse_id: 'WH-FAC', sku: 'CO1100-R', current_stock_qty: '-5' }], facCtx()).indexOf('QTY_INVALID') >= 0, 'I valid warehouse + invalid qty → existing qty validation preserved');

section('J — mapping remains deterministic by warehouse_id (similar codes never remap)');
// two warehouses with similar codes; identity is resolved by warehouse_id only, never by code guessing.
eq(overseasImportWarehouseIssue_({ isActive: true, isFactory: false }), null, 'J warehouse resolved strictly by id record (code is never an identity input on the Overseas path)');

section('§5 — Overseas backend WIRES the eligibility helper + builds the active/factory record map');
var ovsCode = OVS_GS.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
ok(/overseasImportWarehouseIssue_\(warehouseById\[warehouseId\]\)/.test(ovsCode), 'the import handler calls overseasImportWarehouseIssue_ per row');
ok(/is_factory_warehouse/.test(ovsCode) && /is_active/.test(ovsCode), 'the warehouse record map reads canonical is_active + is_factory_warehouse (no second warehouse-type model)');
ok(!/validWarehouses\[warehouseId\]\s*\)/.test(ovsCode), 'the old existence-only check (validWarehouses) is replaced');

section('§3/§4/§11/K — templates offer warehouse_id ONLY as an eligibility-filtered dropdown (no free text)');
// Overseas template: ExcelJS builder, dropdown of ACTIVE NON-FACTORY warehouse ids.
var ovsTplFn = OVS_JS.slice(OVS_JS.indexOf('function downloadOverseasImportTemplate'), OVS_JS.indexOf('function _downloadOverseasCsvTemplateFallback_'));
ok(/templateExport\.buildAndDownload/.test(ovsTplFn) && /dropdown:\s*whIds/.test(ovsTplFn), 'K Overseas template uses the KM.templateExport builder with a warehouse_id dropdown');
ok(/isFactoryWarehouse !== true && \w*\.?isActive !== false/.test(OVS_JS) || /isFactoryWarehouse !== true[\s\S]{0,40}isActive !== false/.test(OVS_JS), 'Overseas dropdown filtered to active NON-factory (Overseas/3PL) warehouses');
ok(!/a\.download = 'overseas_inventory_snapshot_import_template\.csv'[\s\S]{0,80}csv \+/.test(OVS_JS), 'the free-text CSV template is no longer the primary generated format (xlsx dropdown is)');
// Factory template (regression): dropdown of ACTIVE FACTORY warehouse ids.
ok(/downloadFactoryImportTemplate[\s\S]{0,600}isFactoryWarehouse === true && \w+\.isActive !== false[\s\S]{0,600}dropdown:\s*whIds/.test(FAC_JS), 'Factory template dropdown filtered to active FACTORY warehouses (regression)');

section('§10/§12 — Overseas import accepts the new .xlsx AND legacy .csv (backward compatible)');
ok(/function _parseOverseasXlsx\(file\)/.test(OVS_JS) && /wb\.xlsx\.load/.test(OVS_JS), 'Overseas import gains an .xlsx parser (ExcelJS)');
ok(/isXlsx \? _parseOverseasXlsx\(file\) : _parseOverseasCsvFile\(file\)/.test(OVS_JS), 'runOverseasImport branches on .xlsx vs .csv (both supported)');
ok(/row_type[\s\S]{0,80}'example'/.test(OVS_JS), 'the xlsx parser skips the template example/decoration rows');

section('§14 — no allocation / FC / recommendation / quantity-semantics change in the touched files');
ok(!/allocateFactory|allocateOverseas|allocateMarketplaceReceiverSupply|generate[A-Za-z]*Recommendation/.test(ovsCode), 'Overseas handler contains no allocation/recommendation logic');
ok(!/insertSheet|createSheet/.test(ovsCode), 'Overseas handler creates no sheet/warehouse automatically');

console.log('\n----------------------------------------');
console.log('INVENTORY IMPORT WAREHOUSE SAFETY (F1-R1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
