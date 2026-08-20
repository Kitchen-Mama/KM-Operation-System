// Kitchen Mama Operation System — F1-7N-UX-INVENTORY-IMPORT-WAREHOUSE-SCOPE-GUARDS-R1
// Overseas import EXCLUDES FBA/RETURN/FACTORY (picker + server); Factory import REQUIRES an explicit factory selection
// (picker + server scope gate), one-factory-per-file, warehouse_code match — all fail-closed, no partial import. No
// inventory identity / formula / schema change. NO 'use strict' — extracted pure fns eval'd into module scope.
// Run: node assets/tests/inventory-import-warehouse-scope-guards-f1-7n-r1.test.js

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
function section(n) { console.log('\n== ' + n + ' =='); }

var OVS_GS = read('specs/active/apps-script/05_overseas_inventory_handlers.gs');
var OVS_JS = read('js/pages/overseas-stock.js');
var FAC_GS = read('specs/active/apps-script/21_factory_inventory_handlers.gs');
var FAC_JS = read('js/pages/factory-stock.js');
var FAC_HTML = read('html/pages/factory-stock.html');

// ---- eval overseas server predicate (with its module const) + frontend eligibility --------------------------------
eval(extractFn(OVS_GS, 'overseasImportTruthy_'));
eval('var OVS_EXEC_WH_TYPES_ = { FBA: 1, RETURN: 1, FACTORY: 1 };');
eval(extractFn(OVS_GS, 'overseasImportWarehouseIssue_'));
// frontend eligibility (self-contained; reads _osGet)
var _OSWH = [];
function _osGet() { return _OSWH; }
eval(extractFn(OVS_JS, '_ovsEligibleWarehouses'));

// ---- eval factory server scope gate + frontend eligibility/scope helpers -----------------------------------------
eval(extractFn(FAC_GS, 'factoryImportScopeEq_'));
eval(extractFn(FAC_GS, 'factoryImportScopeCheck_'));
var _FSWH = [];
function _fsGet() { return _FSWH; }
eval(extractFn(FAC_JS, '_fiiEligibleFactories'));
eval(extractFn(FAC_JS, '_fiiFactoryScopeCheck'));

// =================================================================================================================
section('OVERSEAS server predicate — FBA / RETURN / FACTORY / inactive rejected; 3PL accepted');
ok(overseasImportWarehouseIssue_({ isActive: true, isFactory: false, type: '3PL' }) === null, 'H/A active 3PL overseas accepted');
ok(overseasImportWarehouseIssue_({ isActive: true, isFactory: false, type: 'FBA' }) === 'WAREHOUSE_NOT_OVERSEAS', 'B/F FBA rejected by server');
ok(overseasImportWarehouseIssue_({ isActive: true, isFactory: false, type: 'RETURN' }) === 'WAREHOUSE_NOT_OVERSEAS', 'D RETURN rejected by server');
ok(overseasImportWarehouseIssue_({ isActive: true, isFactory: true, type: 'FACTORY' }) === 'WAREHOUSE_NOT_OVERSEAS', 'C/G factory rejected by server');
ok(overseasImportWarehouseIssue_({ isActive: false, isFactory: false, type: '3PL' }) === 'WAREHOUSE_INACTIVE', 'E inactive rejected by server');
ok(overseasImportWarehouseIssue_(null) === 'WAREHOUSE_NOT_FOUND', 'unknown rejected by server');
ok(overseasImportWarehouseIssue_({ isActive: true, isFactory: false, type: '' }) === null, 'blank type (legacy sheet) still accepted (backward compatible)');

section('OVERSEAS picker — FBA/RETURN/FACTORY/inactive excluded; 3PL + blank-type self visible');
_OSWH = [
  { warehouseId: 'WH-KM-US-3PL-WINIT', warehouseType: '3PL', isFactoryWarehouse: false, isActive: true },
  { warehouseId: 'WH-KM-US-3PL-AMZLGS', warehouseType: '3PL', isFactoryWarehouse: false, isActive: true },
  { warehouseId: 'WH-KM-US-FBA-ONT8', warehouseType: 'FBA', isFactoryWarehouse: false, isActive: true },
  { warehouseId: 'WH-KM-US-RET', warehouseType: 'RETURN', isFactoryWarehouse: false, isActive: true },
  { warehouseId: 'WH-KM-CN-FACT', warehouseType: 'FACTORY', isFactoryWarehouse: true, isActive: true },
  { warehouseId: 'WH-KM-US-3PL-OLD', warehouseType: '3PL', isFactoryWarehouse: false, isActive: false },
  { warehouseId: 'WH-KM-US-SELF', warehouseType: '', isFactoryWarehouse: false, isActive: true }
];
eq(_ovsEligibleWarehouses().map(function (w) { return w.warehouseId; }).sort(),
   ['WH-KM-US-3PL-AMZLGS', 'WH-KM-US-3PL-WINIT', 'WH-KM-US-SELF'],
   'A/B/C/D/E picker = active non-FBA/non-RETURN/non-FACTORY only (WINIT+AMZLGS+blank-type self; FBA/RETURN/FACTORY/inactive out)');

section('OVERSEAS identity unchanged (business key warehouse_id|sku; no schema/formula change)');
ok(/Business key: warehouse_id \+ sku/.test(OVS_GS), 'I overseas upsert identity (warehouse_id + sku) unchanged');
ok(!/insertSheet|createSheet/.test(OVS_GS.replace(/\/\/[^\n]*/g, '')), 'I no schema creation in the overseas handler');

// =================================================================================================================
section('FACTORY picker — only active canonical factories (is_factory + type FACTORY); non-factory/inactive excluded');
_FSWH = [
  { warehouseId: 'WH-CN-YOUXIN', warehouseName: 'CN Youxin', warehouseCode: 'CN_YOUXIN', warehouseType: 'FACTORY', isFactoryWarehouse: true, isActive: true },
  { warehouseId: 'WH-TW-SHENGYI', warehouseName: 'TW Shengyi', warehouseCode: 'TW_SHENGYI', warehouseType: 'FACTORY', isFactoryWarehouse: true, isActive: true },
  { warehouseId: 'WH-KM-US-3PL', warehouseType: '3PL', isFactoryWarehouse: false, isActive: true },
  { warehouseId: 'WH-KM-US-FBA', warehouseType: 'FBA', isFactoryWarehouse: false, isActive: true },
  { warehouseId: 'WH-CN-OLDFACT', warehouseType: 'FACTORY', isFactoryWarehouse: true, isActive: false }
];
var facIds = _fiiEligibleFactories().map(function (w) { return w.warehouseId; }).sort();
eq(facIds, ['WH-CN-YOUXIN', 'WH-TW-SHENGYI'], 'J/K/L only active factories (CN + TW); M non-factory excluded; N inactive factory excluded');

section('FACTORY server scope gate — valid / row-mismatch / code-mismatch / non-factory / inactive / unknown / no-op');
var WHBY = {
  'WH-CN-YOUXIN': { warehouseId: 'WH-CN-YOUXIN', warehouseCode: 'CN_YOUXIN', isActive: true, isFactory: true, type: 'FACTORY' },
  'WH-TW-SHENGYI': { warehouseId: 'WH-TW-SHENGYI', warehouseCode: 'TW_SHENGYI', isActive: true, isFactory: true, type: 'FACTORY' },
  'WH-KM-US-3PL': { warehouseId: 'WH-KM-US-3PL', warehouseCode: '3PLC', isActive: true, isFactory: false, type: '3PL' },
  'WH-CN-OLD': { warehouseId: 'WH-CN-OLD', warehouseCode: 'OLD', isActive: false, isFactory: true, type: 'FACTORY' }
};
function fgate(rows, scope) { return factoryImportScopeCheck_(rows, scope, WHBY); }
// P valid selected factory + all rows match
ok(fgate([{ warehouse_id: 'WH-CN-YOUXIN', sku: 'A' }, { warehouse_id: 'WH-CN-YOUXIN', sku: 'B' }], { warehouse_id: 'WH-CN-YOUXIN' }).ok === true, 'P valid factory + matching rows passes');
// P2 warehouse_code match ok
ok(fgate([{ warehouse_id: 'WH-CN-YOUXIN', warehouse_code: 'CN_YOUXIN', sku: 'A' }], { warehouse_id: 'WH-CN-YOUXIN', warehouse_code: 'CN_YOUXIN' }).ok === true, 'P2 matching warehouse_code passes');
// Q a CN + a TW row under selected CN → whole import rejected (row diagnostics)
var q = fgate([{ warehouse_id: 'WH-CN-YOUXIN', sku: 'A' }, { warehouse_id: 'WH-TW-SHENGYI', sku: 'B' }], { warehouse_id: 'WH-CN-YOUXIN' });
ok(q.ok === false && q.code === 'FACTORY_SCOPE_ROW_MISMATCH' && q.details.row_number === 2 && q.details.expected_warehouse_id === 'WH-CN-YOUXIN' && q.details.actual_warehouse_id === 'WH-TW-SHENGYI', 'Q mixed CN+TW rows → FACTORY_SCOPE_ROW_MISMATCH (row/expected/actual)');
// R warehouse_code mismatch → rejected
var rr = fgate([{ warehouse_id: 'WH-CN-YOUXIN', warehouse_code: 'WRONG', sku: 'A' }], { warehouse_id: 'WH-CN-YOUXIN' });
ok(rr.ok === false && rr.code === 'FACTORY_SCOPE_ROW_CODE_MISMATCH', 'R row warehouse_code mismatch → rejected');
// S unknown factory → rejected
ok(fgate([{ warehouse_id: 'WH-NOPE', sku: 'A' }], { warehouse_id: 'WH-NOPE' }).code === 'FACTORY_SCOPE_INVALID', 'S unknown selected factory → FACTORY_SCOPE_INVALID');
// M2 non-factory selected → rejected
ok(fgate([{ warehouse_id: 'WH-KM-US-3PL', sku: 'A' }], { warehouse_id: 'WH-KM-US-3PL' }).code === 'FACTORY_SCOPE_INVALID', 'non-factory selected → FACTORY_SCOPE_INVALID (is_factory != true)');
// N2 inactive factory selected → rejected
ok(fgate([{ warehouse_id: 'WH-CN-OLD', sku: 'A' }], { warehouse_id: 'WH-CN-OLD' }).code === 'FACTORY_SCOPE_INVALID', 'inactive factory selected → FACTORY_SCOPE_INVALID');
// selected code mismatch vs canonical → rejected before rows
ok(fgate([{ warehouse_id: 'WH-CN-YOUXIN', sku: 'A' }], { warehouse_id: 'WH-CN-YOUXIN', warehouse_code: 'WRONG' }).code === 'FACTORY_SCOPE_INVALID', 'declared warehouse_code != canonical → FACTORY_SCOPE_INVALID');
// no scope declared → no-op (backward compatible; per-row eval still applies elsewhere)
ok(fgate([{ warehouse_id: 'WH-TW-SHENGYI', sku: 'A' }], {}).ok === true, 'T/no-op: absent scope → gate no-op (per-row eligibility still authoritative)');

section('FACTORY frontend advisory scope check + enable gating + one-factory-per-file');
ok(_fiiFactoryScopeCheck([{ warehouse_id: 'WH-CN-YOUXIN' }], { warehouse_id: '' }).ok === false, 'O advisory: no factory selected → blocked');
ok(_fiiFactoryScopeCheck([{ warehouse_id: 'WH-CN-YOUXIN' }], { warehouse_id: 'WH-CN-YOUXIN' }).ok === true, 'advisory: matching rows pass');
ok(_fiiFactoryScopeCheck([{ warehouse_id: 'WH-CN-YOUXIN' }, { warehouse_id: 'WH-TW-SHENGYI' }], { warehouse_id: 'WH-CN-YOUXIN' }).ok === false, 'advisory: mixed factories blocked');

section('FACTORY wiring — required selector + file starts disabled + scope sent to validate/commit');
ok(/id="factory-import-factory"[\s\S]{0,120}_fiiOnFactoryChosen\(\)/.test(FAC_HTML), 'HTML: required Factory selector wired to _fiiOnFactoryChosen');
ok(/id="factory-import-file"[^>]*disabled/.test(FAC_HTML), 'O HTML: file input starts DISABLED (until factory chosen)');
ok(/factoryInventoryImportValidate\(\{[^}]*scope: _scope/.test(FAC_JS), 'validate sends the selected factory scope');
ok(/factoryInventoryImportCommit\(\{[^}]*scope: \{ warehouse_id: _fiiFactory\.warehouseId/.test(FAC_JS), 'commit sends the selected factory scope');
ok(/var scopeGate = factoryImportScopeCheck_\(rows, body\.scope/.test(FAC_GS), 'server prepare runs the factory scope gate (validate + commit share it)');

section('U/V/W/X/Y/Z — factory identity + SET semantics + no cross-domain change');
ok(/Identity = warehouse_id \+ sku/.test(FAC_JS), 'U factory_stock identity (warehouse_id + sku) unchanged');
ok(/SET_CURRENT_STOCK/.test(FAC_GS), 'V SET_CURRENT_STOCK semantics unchanged');
ok(!/generate[A-Za-z]*Recommendation|weeklyAiPlan|shipping_allocation|request_order|purchase_order/.test(FAC_GS.replace(/\/\/[^\n]*/g, '')), 'W/X/Y/Z factory handler: no Weekly/shipment/RO/PO/recommendation change');
ok(!/generate[A-Za-z]*Recommendation|weeklyAiPlan|shipping_allocation/.test(OVS_GS.replace(/\/\/[^\n]*/g, '')), 'W/X overseas handler: no Weekly/shipment/recommendation change');

console.log('\n----------------------------------------');
console.log('INVENTORY IMPORT WAREHOUSE SCOPE GUARDS (F1-7N-R1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
