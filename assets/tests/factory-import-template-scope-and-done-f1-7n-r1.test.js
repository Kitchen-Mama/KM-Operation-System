// Kitchen Mama Operation System — F1-7N-UX-FACTORY-IMPORT-TEMPLATE-SCOPE-AND-DONE-FIX-R1
// (1) Download Template is scoped to the CURRENTLY selected factory (warehouse_id + warehouse_code), switches without
// reload, and is blocked when no factory is selected. (2) After a successful commit the primary button becomes an
// enabled "Done" that CLOSES the modal (never re-imports, no extra DB reload). Behavioral test via stubs + fake DOM.
// Run: node assets/tests/factory-import-template-scope-and-done-f1-7n-r1.test.js
// NOTE: no 'use strict' — extracted fns eval into module scope.

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

var F_JS = read('js/pages/factory-stock.js');

// ---- fake DOM + globals -------------------------------------------------------------------------------------------
var _els = {};
function fakeEl(id) {
  return { id: id, value: '', innerHTML: '', textContent: '', hidden: false, disabled: false, style: {},
    _cls: {}, classList: { add: function (c) { this._cls = this._cls || {}; }, remove: function () {}, contains: function () { return false; } },
    selectedOptions: [], getAttribute: function (k) { return this._attrs && this._attrs[k] || ''; } };
}
function el(id) { if (!_els[id]) _els[id] = fakeEl(id); return _els[id]; }
var alertMsgs = [];
var commitCalls = 0, refreshCalls = 0, closeCalls = 0, capturedSpec = null;
global.alert = function (m) { alertMsgs.push(String(m)); };
global.document = { getElementById: function (id) { return el(id); }, querySelector: function () { return null; }, addEventListener: function () {} };
global.window = { KM: {
  templateExport: { buildAndDownload: function (spec) { capturedSpec = spec; return Promise.resolve(); } },
  DB: { factoryInventoryImportCommit: function () { commitCalls++; return Promise.resolve({ success: true, data: { importBatchId: 'B1', createdRows: 1 } }); } }
} };

// warehouses read-model (CN first in array — the OLD bug used whIds[0] = CN regardless of selection)
var WHS = [
  { warehouseId: 'WH-TW-CN-FACTORY-YOUXIN', warehouseName: 'CN Youxin', warehouseCode: 'CN_YOUXIN', warehouseType: 'FACTORY', isFactoryWarehouse: true, isActive: true },
  { warehouseId: 'WH-TW-TW-FACTORY-RES', warehouseName: 'TW Shengyi', warehouseCode: 'TW_RES', warehouseType: 'FACTORY', isFactoryWarehouse: true, isActive: true }
];
var SKUS = [{ sku: 'CO1100-R' }];
function _fsGet(t) { return t === 'warehouses' ? WHS : t === 'skuDetails' ? SKUS : []; }
function _fmvEscapeHtml(v) { return String(v == null ? '' : v); }
// stubs for the async success chain (not under test here — the commit stub above is what we count)
function _fiiRenderResult() {}
function _fiiRefreshAfterCommit() { refreshCalls++; return Promise.resolve(); }

// module state + extracted fns
var _fiiFactory = { warehouseId: '', warehouseCode: '' };
var _fiiCompleted = false, _fiiSubmitting = false, _fiiRows = null, _fiiValidated = null, _fiiBatchId = null;
eval(extractFn(F_JS, '_fiiEl'));
eval(extractFn(F_JS, '_fiiEsc'));
eval(extractFn(F_JS, '_fiiHide'));
eval(extractFn(F_JS, '_fiiSanitizeFilePart_'));
eval(extractFn(F_JS, 'downloadFactoryImportTemplate'));
eval(extractFn(F_JS, 'closeFactoryImportModal'));
eval(extractFn(F_JS, '_fiiDone'));
eval(extractFn(F_JS, 'confirmFactoryImport'));
// wrap closeFactoryImportModal to count Done-driven closes
var _realClose = closeFactoryImportModal;
closeFactoryImportModal = function () { closeCalls++; return _realClose.apply(this, arguments); };

function colKeys(spec) { return (spec.columns || []).map(function (c) { return c.key; }); }

// =================================================================================================================
section('A/B CN selected → template scoped to CN factory');
_fiiFactory = { warehouseId: 'WH-TW-CN-FACTORY-YOUXIN', warehouseCode: 'CN_YOUXIN' };
capturedSpec = null; downloadFactoryImportTemplate();
ok(capturedSpec && capturedSpec.exampleRow.warehouse_id === 'WH-TW-CN-FACTORY-YOUXIN', 'A CN template example warehouse_id = CN factory');
ok(capturedSpec.exampleRow.warehouse_code === 'CN_YOUXIN', 'B CN template example warehouse_code = CN_YOUXIN');
eq(capturedSpec.columns[0].dropdown, ['WH-TW-CN-FACTORY-YOUXIN'], 'A warehouse_id dropdown scoped to CN only');
ok(/WH-TW-CN-FACTORY-YOUXIN/.test(capturedSpec.filename), 'filename carries the CN factory scope');

section('C/D TW selected (no reload) → template scoped to TW factory');
_fiiFactory = { warehouseId: 'WH-TW-TW-FACTORY-RES', warehouseCode: 'TW_RES' };
capturedSpec = null; downloadFactoryImportTemplate();
ok(capturedSpec.exampleRow.warehouse_id === 'WH-TW-TW-FACTORY-RES', 'C TW template example warehouse_id = WH-TW-TW-FACTORY-RES (NOT whIds[0]=CN)');
ok(capturedSpec.exampleRow.warehouse_code === 'TW_RES', 'D TW template example warehouse_code = TW_RES');
eq(capturedSpec.columns[0].dropdown, ['WH-TW-TW-FACTORY-RES'], 'C/E TW dropdown = TW only');

section('E/F no cross-factory leakage in either template');
ok(capturedSpec.columns[0].dropdown.indexOf('WH-TW-CN-FACTORY-YOUXIN') === -1 && capturedSpec.exampleRow.warehouse_id.indexOf('CN') === -1, 'E TW template has NO CN factory id');
_fiiFactory = { warehouseId: 'WH-TW-CN-FACTORY-YOUXIN', warehouseCode: 'CN_YOUXIN' };
capturedSpec = null; downloadFactoryImportTemplate();
ok(capturedSpec.exampleRow.warehouse_id.indexOf('TW-FACTORY-RES') === -1 && capturedSpec.columns[0].dropdown.indexOf('WH-TW-TW-FACTORY-RES') === -1, 'F CN template has NO TW factory id');

section('G/H switching CN→TW→CN without reload returns the selected each time');
_fiiFactory = { warehouseId: 'WH-TW-TW-FACTORY-RES', warehouseCode: 'TW_RES' }; capturedSpec = null; downloadFactoryImportTemplate();
ok(capturedSpec.exampleRow.warehouse_id === 'WH-TW-TW-FACTORY-RES', 'G→TW returns TW');
_fiiFactory = { warehouseId: 'WH-TW-CN-FACTORY-YOUXIN', warehouseCode: 'CN_YOUXIN' }; capturedSpec = null; downloadFactoryImportTemplate();
ok(capturedSpec.exampleRow.warehouse_id === 'WH-TW-CN-FACTORY-YOUXIN', 'H→CN returns CN (no stale cache)');

section('I no factory selected → download blocked (notice, no template)');
_fiiFactory = { warehouseId: '', warehouseCode: '' }; capturedSpec = null; alertMsgs = [];
downloadFactoryImportTemplate();
ok(capturedSpec === null && /Select a factory first/.test(alertMsgs.join('|')), 'I no factory → blocked with "Select a factory first" (no default/unscoped template)');

section('J/K/L no hard-coded default + columns + SET semantics unchanged');
_fiiFactory = { warehouseId: 'WH-TW-TW-FACTORY-RES', warehouseCode: 'TW_RES' }; downloadFactoryImportTemplate();
eq(colKeys(capturedSpec), ['warehouse_id', 'warehouse_code', 'sku', 'current_stock_qty', 'effective_date', 'note'], 'K template columns unchanged (6-column contract)');
ok(/SET_CURRENT_STOCK/.test(capturedSpec.instructionRow), 'L SET_CURRENT_STOCK semantics retained in the instruction');
ok(!/WH-FACTORY-CN|whIds\[0\]/.test(extractFn(F_JS, 'downloadFactoryImportTemplate')), 'J no hard-coded default factory / whIds[0] fallback remains');

section('M-R Done closes + does NOT re-import / broad-reload');
_fiiCompleted = true; _fiiSubmitting = false; _fiiRows = [{}]; _fiiValidated = { summary: {} }; _fiiBatchId = 'B1';
commitCalls = 0; closeCalls = 0;
confirmFactoryImport();   // button is now "Done"
ok(commitCalls === 0, 'Q Done did NOT call factoryInventoryImportCommit again');
ok(closeCalls === 1, 'N/O Done closed the modal exactly once');
ok(_fiiCompleted === false && _fiiSubmitting === false && _fiiRows === null && _fiiValidated === null, 'P Done reset the import state (page usable)');

section('T/U/V reopen safety — a fresh confirm after reset performs a real import (not a no-op Done)');
// simulate reopen: state cleared (openFactoryImportModal resets these); a validated batch then commits
_fiiCompleted = false; _fiiSubmitting = false; _fiiRows = [{ warehouse_id: 'WH-TW-TW-FACTORY-RES', sku: 'CO1100-R' }];
_fiiValidated = { summary: { invalidRows: 0 } }; _fiiBatchId = 'B2'; _fiiFactory = { warehouseId: 'WH-TW-TW-FACTORY-RES', warehouseCode: 'TW_RES' };
commitCalls = 0;
confirmFactoryImport();
ok(commitCalls === 1, 'U/T after reopen a validated batch imports normally (Done branch not stuck)');
ok(/_fiiCompleted = false/.test(extractFn(F_JS, 'openFactoryImportModal')), 'V openFactoryImportModal resets _fiiCompleted (no stuck Done / duplicate listener)');

section('S post-import refresh reused exactly once (no broad DB reload added)');
ok(/_fiiRefreshAfterCommit\(\)/.test(extractFn(F_JS, 'confirmFactoryImport')), 'S existing bounded post-import refresh invoked once on success');
ok(!/getOperationDb\(/.test(extractFn(F_JS, '_fiiDone')) && !/getOperationDb\(/.test(extractFn(F_JS, 'confirmFactoryImport')), 'R no broad whole-DB reload introduced');

console.log('\n----------------------------------------');
console.log('FACTORY IMPORT TEMPLATE SCOPE + DONE (F1-7N-R1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
