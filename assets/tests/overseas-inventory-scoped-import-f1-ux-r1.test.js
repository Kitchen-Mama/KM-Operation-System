// Kitchen Mama Operation System — F1-UX-OVERSEAS-INVENTORY-SCOPED-IMPORT-R1
// Proves the scoped Overseas Inventory import: (A) relational Company/Country/Warehouse selectors from the canonical
// warehouses master (active, non-factory); (B) the template scopes to ONE warehouse; (C) the backend scope gate
// (pure overseasImportScopeCheck_) fails closed on mixed/mismatched/invalid warehouse — no partial import. No inventory
// quantity/formula/schema change.
// Run: node assets/tests/overseas-inventory-scoped-import-f1-ux-r1.test.js
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

var OVS_GS = read('specs/active/apps-script/05_overseas_inventory_handlers.gs');
var OVS_JS = read('js/pages/overseas-stock.js');
var OVS_HTML = read('html/pages/overseas-stock.html');

// =============================================================================
// §16 — BACKEND scope gate (pure overseasImportScopeCheck_ from the extractable __OVSIMPORT_PURE__ block)
// =============================================================================
console.log('\n== §16 backend scope gate (fail-closed, whole-batch) ==');
eval(slice(OVS_GS, '// __OVSIMPORT_PURE_START__', '// __OVSIMPORT_PURE_END__'));
ok(typeof overseasImportScopeCheck_ === 'function', 'overseasImportScopeCheck_ eval OK');

var WHById = {
  'WH-RESUS-US': { isActive: true, isFactory: false, company: 'ResUS', country: 'US' },
  'WH-KM-CA': { isActive: true, isFactory: false, company: 'KM', country: 'CA' },
  'WH-FAC': { isActive: true, isFactory: true, company: 'KM', country: 'CN' },
  'WH-INACT': { isActive: false, isFactory: false, company: 'ResTW', country: 'US' }
};
function gate(rows, scope) { return overseasImportScopeCheck_(rows, scope, WHById); }

// 1/2 one valid warehouse file, multiple SKUs same warehouse → ok
ok(gate([{ warehouse_id: 'WH-RESUS-US', sku: 'A' }, { warehouse_id: 'WH-RESUS-US', sku: 'B' }], { company: 'ResUS', country: 'US', warehouse_id: 'WH-RESUS-US' }).ok === true, '1/2 valid single-warehouse multi-SKU file passes');
// 3 csv warehouse != selected → FAIL (scope mismatch, row diagnostics)
var g3 = gate([{ warehouse_id: 'WH-RESUS-US', sku: 'A' }, { warehouse_id: 'WH-KM-CA', sku: 'B' }], { company: 'ResUS', country: 'US', warehouse_id: 'WH-RESUS-US' });
ok(g3.ok === false && g3.code === 'IMPORT_WAREHOUSE_SCOPE_MISMATCH' && g3.details.row_number === 2 && g3.details.expected_warehouse_id === 'WH-RESUS-US' && g3.details.actual_warehouse_id === 'WH-KM-CA', '3 a row with another warehouse_id → IMPORT_WAREHOUSE_SCOPE_MISMATCH (+ row/expected/actual diagnostics)');
// 4 mixed warehouse ids → FAIL on the first mismatch
ok(gate([{ warehouse_id: 'WH-KM-CA', sku: 'A' }], { company: 'ResUS', country: 'US', warehouse_id: 'WH-RESUS-US' }).code === 'IMPORT_WAREHOUSE_SCOPE_MISMATCH', '4 mixed warehouse file fails closed');
// 5 unknown selected warehouse → FAIL (invalid scope)
ok(gate([{ warehouse_id: 'WH-NOPE', sku: 'A' }], { company: 'X', country: 'Y', warehouse_id: 'WH-NOPE' }).code === 'IMPORT_WAREHOUSE_SCOPE_INVALID', '5 unknown selected warehouse → SCOPE_INVALID (fail closed)');
// 6 wrong company for the warehouse → FAIL
var g6 = gate([{ warehouse_id: 'WH-RESUS-US', sku: 'A' }], { company: 'KM', country: 'US', warehouse_id: 'WH-RESUS-US' });
ok(g6.ok === false && g6.code === 'IMPORT_WAREHOUSE_SCOPE_MISMATCH' && g6.details.expected_company === 'ResUS', '6 wrong company → SCOPE_MISMATCH (canonical company authority)');
// 7 wrong country for the warehouse → FAIL
var g7 = gate([{ warehouse_id: 'WH-RESUS-US', sku: 'A' }], { company: 'ResUS', country: 'CA', warehouse_id: 'WH-RESUS-US' });
ok(g7.ok === false && g7.code === 'IMPORT_WAREHOUSE_SCOPE_MISMATCH' && g7.details.expected_country === 'US', '7 wrong country → SCOPE_MISMATCH (canonical country authority)');
// 8 factory / ineligible selected warehouse → FAIL
ok(gate([{ warehouse_id: 'WH-FAC', sku: 'A' }], { company: 'KM', country: 'CN', warehouse_id: 'WH-FAC' }).code === 'IMPORT_WAREHOUSE_SCOPE_INVALID', '8 factory warehouse → SCOPE_INVALID (WAREHOUSE_NOT_OVERSEAS)');
ok(gate([{ warehouse_id: 'WH-INACT', sku: 'A' }], { company: 'ResTW', country: 'US', warehouse_id: 'WH-INACT' }).code === 'IMPORT_WAREHOUSE_SCOPE_INVALID', 'inactive selected warehouse → SCOPE_INVALID');
// 12 file for A, UI switched to B → mismatch fails closed (no silent import)
ok(gate([{ warehouse_id: 'WH-RESUS-US', sku: 'A' }], { company: 'KM', country: 'CA', warehouse_id: 'WH-KM-CA' }).code === 'IMPORT_WAREHOUSE_SCOPE_MISMATCH', '12 file prepared for A, scope switched to B → mismatch (cannot import silently)');
// no scope declared → legacy per-row path (backward compatible, gate is a no-op)
ok(gate([{ warehouse_id: 'WH-KM-CA', sku: 'A' }], {}).ok === true, 'no declared scope → gate no-op (legacy per-row path preserved)');
// case-insensitive company/country match
ok(gate([{ warehouse_id: 'WH-RESUS-US', sku: 'A' }], { company: 'resus', country: 'us', warehouse_id: 'WH-RESUS-US' }).ok === true, 'company/country match is case-insensitive');

// §16.13 — the handler runs the gate BEFORE any mutation (no partial write on scope failure)
var ovsCode = OVS_GS.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
var gateIdx = ovsCode.indexOf('overseasImportScopeCheck_(rows, importScope, warehouseById)');
var loopIdx = ovsCode.indexOf('for (var idx = 0; idx < rows.length');
ok(gateIdx > 0 && loopIdx > 0 && gateIdx < loopIdx, '13 scope gate runs BEFORE the row write loop (no partial mutation on scope failure)');
ok(/scopeGate\.ok[\s\S]{0,120}return jsonResponse_\(\{ success: false/.test(ovsCode), 'scope-gate failure returns fail-closed BEFORE writing');
ok(/wh_company = whHeaders\.indexOf\('company'\)/.test(OVS_GS) && /wh_country = whHeaders\.indexOf\('country'\)/.test(OVS_GS), 'handler reads canonical company/country warehouse facts (never inferred/CSV)');

// =============================================================================
// §14 — FRONTEND relational selectors (extract the pure-ish page helpers; stub getWarehouses)
// =============================================================================
console.log('\n== §14 relational Company/Country/Warehouse filtering ==');
var WHS = [
  { warehouseId: 'WH-KM-US', warehouseName: 'KM US 3PL', company: 'KM', country: 'US', isFactoryWarehouse: false, isActive: true },
  { warehouseId: 'WH-KM-CA', warehouseName: 'KM CA 3PL', company: 'KM', country: 'CA', isFactoryWarehouse: false, isActive: true },
  { warehouseId: 'WH-RESUS-US', warehouseName: 'ResUS WINIT', company: 'ResUS', country: 'US', isFactoryWarehouse: false, isActive: true },
  { warehouseId: 'WH-RESTW-US', warehouseName: 'ResTW US', company: 'ResTW', country: 'US', isFactoryWarehouse: false, isActive: true },
  { warehouseId: 'WH-FAC-CN', warehouseName: 'Factory', company: 'KM', country: 'CN', isFactoryWarehouse: true, isActive: true },   // factory excluded
  { warehouseId: 'WH-OLD', warehouseName: 'Retired', company: 'KM', country: 'US', isFactoryWarehouse: false, isActive: false }     // inactive excluded
];
var window = { KM: { DB: { getWarehouses: function () { return WHS; } } } };
var _ovsImportScope = { company: '', country: '', warehouseId: '' };
eval(['_ovsEligibleWarehouses', '_ovsWhById', '_ovsWhCompany', '_ovsWhCountry', '_ovsDistinctSorted', '_ovsScopeOptions', '_ovsImportScopeValid'
].map(function (n) { return extractFn(OVS_JS, n); }).join('\n'));

// 10/11 factory + inactive excluded from the eligible universe
eq(_ovsEligibleWarehouses().map(function (w) { return w.warehouseId; }).sort(), ['WH-KM-CA', 'WH-KM-US', 'WH-RESTW-US', 'WH-RESUS-US'], '10/11 factory + inactive warehouses excluded from eligible set');

// 9 no valid warehouses → empty options + invalid scope
WHS_EMPTY: (function () {})();
var savedGetWh = window.KM.DB.getWarehouses;
window.KM.DB.getWarehouses = function () { return [{ warehouseId: 'F', company: 'KM', country: 'US', isFactoryWarehouse: true, isActive: true }]; };
_ovsImportScope = { company: '', country: '', warehouseId: '' };
eq(_ovsScopeOptions().warehouses.length, 0, '9 all-factory master → no eligible warehouses');
ok(_ovsImportScopeValid() === false, '9 no valid warehouse → scope invalid');
window.KM.DB.getWarehouses = savedGetWh;

// base options (no selection): all companies + all countries + all eligible warehouses
_ovsImportScope = { company: '', country: '', warehouseId: '' };
eq(_ovsScopeOptions().companies, ['KM', 'ResTW', 'ResUS'], 'base companies = distinct eligible');
eq(_ovsScopeOptions().countries, ['CA', 'US'], 'base countries = distinct eligible');

// 4 select company first → countries + warehouses reduce to that company
_ovsImportScope = { company: 'KM', country: '', warehouseId: '' };
eq(_ovsScopeOptions().countries, ['CA', 'US'], '4 company=KM → countries CA,US (KM has both)');
eq(_ovsScopeOptions().warehouses.map(function (w) { return w.warehouseId; }).sort(), ['WH-KM-CA', 'WH-KM-US'], '4 company=KM → only KM eligible warehouses');
// 2 one country → multiple companies
_ovsImportScope = { company: '', country: 'US', warehouseId: '' };
eq(_ovsScopeOptions().companies, ['KM', 'ResTW', 'ResUS'], '2 country=US → companies KM,ResTW,ResUS');
eq(_ovsScopeOptions().warehouses.map(function (w) { return w.warehouseId; }).sort(), ['WH-KM-US', 'WH-RESTW-US', 'WH-RESUS-US'], '5 country=US → US eligible warehouses');
// 1 one company → multiple countries (KM: US + CA) already shown above
// 3 one company/country → the specific warehouse(s)
_ovsImportScope = { company: 'KM', country: 'US', warehouseId: '' };
eq(_ovsScopeOptions().warehouses.map(function (w) { return w.warehouseId; }), ['WH-KM-US'], '3 company=KM+country=US → WH-KM-US');
// 14 full convergence: selecting the warehouse resolves company+country; scope valid
_ovsImportScope = { company: 'KM', country: 'US', warehouseId: 'WH-KM-US' };
ok(_ovsImportScopeValid() === true, '14 company+country+warehouse converge → scope valid');
// company/country mismatch with the selected warehouse → invalid (no stale impossible combo)
_ovsImportScope = { company: 'ResUS', country: 'CA', warehouseId: 'WH-KM-US' };
ok(_ovsImportScopeValid() === false, 'stale impossible combo (Company/Country not the warehouse\'s) → invalid');
// 13 warehouse_code collision does not affect identity (identity = warehouse_id only; no code lookup used)
ok(!/warehouse_code|warehouseCode/.test(extractFn(OVS_JS, '_ovsWhById')), '13 warehouse resolution keys on warehouse_id ONLY (no code lookup)');

// change-handler pruning (7/8) — run the real handler with a permissive fake document
console.log('\n== §14 7/8 change-handler pruning (real handler) ==');
var _fakeEl = { value: '', innerHTML: '', style: {}, dataset: {}, disabled: false, files: [], setAttribute: function () {} };
window.document = { getElementById: function () { return _fakeEl; } };
global.window = window; global.document = window.document;
var _ovsEscapeHtml = function (s) { return String(s == null ? '' : s); };   // minimal stub (real one lives elsewhere in the page)
eval(['_ovsSanitizeFilePart_', '_ovsClearImportFile_', '_ovsRenderImportScope', 'onOverseasImportScopeChange'
].map(function (n) { return extractFn(OVS_JS, n); }).join('\n'));
_ovsImportScope = { company: 'KM', country: 'US', warehouseId: 'WH-KM-US' };
onOverseasImportScopeChange('company', 'ResUS');   // switch company → incompatible warehouse cleared
ok(_ovsImportScope.warehouseId === '' && _ovsImportScope.company === 'ResUS', '7 changing company clears the now-incompatible warehouse');
_ovsImportScope = { company: 'KM', country: 'US', warehouseId: 'WH-KM-US' };
onOverseasImportScopeChange('country', 'CA');       // KM has a CA warehouse (WH-KM-CA), but WH-KM-US is not in CA → cleared
ok(_ovsImportScope.warehouseId === '' && _ovsImportScope.country === 'CA', '8 changing country clears the now-incompatible warehouse');
// warehouse-first convergence via the handler
_ovsImportScope = { company: '', country: '', warehouseId: '' };
onOverseasImportScopeChange('warehouse', 'WH-RESUS-US');
ok(_ovsImportScope.company === 'ResUS' && _ovsImportScope.country === 'US' && _ovsImportScope.warehouseId === 'WH-RESUS-US', '6 warehouse-first → company/country converge from the warehouse');

// =============================================================================
// §15 — template matrix (source-scan the scoped template generator)
// =============================================================================
console.log('\n== §15 scoped template ==');
var tpl = slice(OVS_JS, 'function downloadOverseasImportTemplate', 'function _downloadOverseasCsvTemplateFallback_');
ok(/if \(!_ovsImportScopeValid\(\)\)[\s\S]{0,60}return;/.test(tpl), '1/2 template download gated on a valid scope');
ok(/dropdown: \[sc\.warehouseId\]/.test(tpl), '4 warehouse_id dropdown scoped to the SELECTED warehouse only');
ok(/exampleRow: \{ warehouse_id: sc\.warehouseId/.test(tpl), '4 example row prefilled with the selected warehouse_id');
ok(/filename: 'Overseas_Inventory_' \+ fnamePart \+ '_Import_Template\.xlsx'/.test(tpl) && /_ovsSanitizeFilePart_\(sc\.company\)/.test(tpl) && /_ovsSanitizeFilePart_\(sc\.warehouse/.test(tpl), '3 filename contains sanitized company/country/warehouse scope');
ok(/scope_company: sc\.company/.test(tpl) && /scope_warehouse_id: sc\.warehouseId/.test(tpl), '8 scope is stamped into the template system metadata');
// 5/6 no company/country data columns added; the exact existing inventory columns retained
OVERSEAS_IMPORT_HEADERS_EXPECTED = ['warehouse_id', 'sku', 'available_stock', 'reserved_stock', 'damaged_stock', 'on_the_way_qty', 'on_the_way_eta', 'note'];
OVERSEAS_IMPORT_HEADERS_EXPECTED.forEach(function (h) { ok(new RegExp("key: '" + h + "'").test(tpl), '6 retained inventory column ' + h); });
ok(!/key: 'company'|key: 'country'|key: 'warehouse_name'/.test(tpl), '5 NO company/country/warehouse_name columns added to the row schema');
ok(/decimals round UP|Number >= 0/.test(tpl), '7 numeric guidance retained');

// =============================================================================
// HTML modal — scope selectors present + gating attributes
// =============================================================================
console.log('\n== HTML modal scope selectors ==');
ok(/id="overseas-import-company"[\s\S]{0,120}onOverseasImportScopeChange\('company'/.test(OVS_HTML) &&
   /id="overseas-import-country"[\s\S]{0,120}onOverseasImportScopeChange\('country'/.test(OVS_HTML) &&
   /id="overseas-import-warehouse"[\s\S]{0,120}onOverseasImportScopeChange\('warehouse'/.test(OVS_HTML), 'modal has relational Company/Country/Warehouse selectors');
ok(/id="overseas-import-scope-readout"/.test(OVS_HTML), 'modal shows the resolved import scope');
ok(/id="overseas-import-file"[^>]*disabled/.test(OVS_HTML) && /id="overseas-import-run-btn"[^>]*disabled/.test(OVS_HTML), 'file input + Import button start DISABLED (require a valid scope)');
// upload sends the selected scope; server is the authority
ok(/importOverseasInventorySnapshotBatch\(rows, \{ createdBy: 'operation-system', scope: _ovsScope \}\)/.test(OVS_JS), 'upload sends the selected { company, country, warehouse_id } scope');
ok(/runOverseasImport[\s\S]{0,200}_ovsImportScopeValid\(\)/.test(OVS_JS), 'runOverseasImport gates on a valid scope before importing');
// no inventory quantity/formula/schema change
ok(!/insertSheet|createSheet|allocateOverseas|generate[A-Za-z]*Recommendation/.test(ovsCode), 'no schema creation / allocation / recommendation change in the handler');

console.log('\n----------------------------------------');
console.log('OVERSEAS INVENTORY SCOPED IMPORT (F1-UX-R1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
