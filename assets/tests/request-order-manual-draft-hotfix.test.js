// Kitchen Mama Operation System — Manual Request Order Draft Phase-1 Hotfix (remove Supplier dependency).
// Run: node assets/tests/request-order-manual-draft-hotfix.test.js
// -----------------------------------------------------------------------------
// Proves: (A) the REAL frontend line resolver treats SKU (sku_details) + units_per_carton as the authority and
// Supplier as optional (no fabricated values); (B) source-scan guards prove the Supplier gate is gone and Factory
// no longer depends on Supplier; (C) the REAL backend manual validator enforces Factory + SKU + Qty (structured
// tokens) with Supplier optional, and leaves the allocation "Send Request" path exempt; plus Golden/suite health.
// NOT strict — extracted functions bind into module scope via direct eval.

var fs = require('fs');
var path = require('path');
var cp = require('child_process');
var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// balanced-brace extractor for `function NAME(...) { ... }`
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
function extractVar(src, re) { var m = src.match(re); if (!m) throw new Error('var not found: ' + re); return m[0]; }

var FE = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'request-order-draft.js'), 'utf8');
var BE = fs.readFileSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script', '13_procurement_handlers.gs'), 'utf8');

// =====================================================================================================
section('A. Frontend line resolver (REAL _roResolveCommercial) — SKU authority + Supplier optional');
var feEnv = (function () {
  var window = { KM: { DB: { getSkuDetails: function () { return []; }, getSupplierPriceList: function () { return []; } } } };
  eval(extractVar(FE, /var RO_TERMINAL_LIFECYCLE = \{[^}]*\};/));
  eval(extractFn(FE, '_roEq'));
  eval(extractFn(FE, '_roActiveFlag'));
  eval(extractFn(FE, '_roSkuTerminal'));
  eval(extractFn(FE, '_roSkuMaster'));
  eval(extractFn(FE, '_roSupplierPriceList'));
  eval(extractFn(FE, '_roResolveCommercial'));
  return { window: window, resolve: _roResolveCommercial, terminal: _roSkuTerminal };
})();
(function () {
  var W = feEnv.window;
  // SKU present in sku_details only (absent from marketplace_skus/replenishment/forecast — none consulted).
  W.KM.DB.getSkuDetails = function () { return [{ sku: 'NEW-100', unitsPerCarton: 12, lifecycle: 'Running in the Market' }]; };
  W.KM.DB.getSupplierPriceList = function () { return []; };
  var r1 = feEnv.resolve('KM', '', 'WH-F', 'NEW-100');   // supplier BLANK
  ok(r1.status === 'ok' && r1.unitsPerCarton === 12, '1 sku_details-only SKU resolves OK with Supplier blank');
  ok(r1.supplierSku === null && r1.unitCost === null && r1.currency === null, '2 missing supplier data stays null (never fabricated 0/--)');
  var r2 = feEnv.resolve('KM', '', 'WH-F', 'GHOST');
  ok(r2.status === 'sku-not-found', '3 SKU absent from sku_details is rejected (sku-not-found)');
  W.KM.DB.getSkuDetails = function () { return [{ sku: 'DISC-1', unitsPerCarton: 12, lifecycle: 'Discontinued' }]; };
  ok(feEnv.resolve('KM', '', 'WH-F', 'DISC-1').status === 'sku-inactive', '4 terminal-lifecycle SKU is rejected (sku-inactive)');
  W.KM.DB.getSkuDetails = function () { return [{ sku: 'UP-1', unitsPerCarton: 6, lifecycle: 'Upcoming SKU' }]; };
  ok(feEnv.resolve('KM', '', 'WH-F', 'UP-1').status === 'ok', '5 Upcoming SKU (non-terminal) is eligible');
  W.KM.DB.getSkuDetails = function () { return [{ sku: 'NOUPC', unitsPerCarton: 0, lifecycle: 'Running in the Market' }]; };
  ok(feEnv.resolve('KM', '', 'WH-F', 'NOUPC').status === 'no-upc', '6 SKU with no units_per_carton fails closed (no-upc)');
  // existing supplier value + active mapping → enrichment accepted
  W.KM.DB.getSkuDetails = function () { return [{ sku: 'NEW-100', unitsPerCarton: 12, lifecycle: 'Running in the Market' }]; };
  W.KM.DB.getSupplierPriceList = function () { return [{ isActive: true, supplierName: 'ACME', sku: 'NEW-100', supplierSku: 'ACME-100', unitCost: 3.5, currency: 'USD', effectiveFrom: '2026-01-01' }]; };
  var r3 = feEnv.resolve('KM', 'ACME', 'WH-F', 'NEW-100');
  ok(r3.status === 'ok' && r3.supplierSku === 'ACME-100' && r3.unitCost === 3.5 && r3.currency === 'USD', '7 existing Supplier + active mapping still enriches supplier_sku/unit_cost/currency');
})();

// =====================================================================================================
section('B. Frontend source-scan guards — Supplier gate removed');
(function () {
  ok(!/Select supplier first/i.test(FE), '8 no "Select supplier first" string anywhere');
  ok(!/Supplier master not configured/i.test(FE), '9 no "Supplier master not configured" string');
  ok(!/status:\s*'no-supplier'/.test(FE), '10 resolver no longer emits a no-supplier blocking status');
  // Factory fill no longer takes a supplier-enable param; company-only signature.
  ok(/function _roFillFactorySelect\(company\)/.test(FE), '11 _roFillFactorySelect(company) — no supplier-enable param');
  // Company change rebuilds Factory directly (not gated by supplier); supplier change does NOT touch Factory.
  ok(/_roFillFactorySelect\(company\);\s*\/\/ Company/.test(FE), '12 Company change enables Factory (no supplier dependency)');
  ok(!/_roFillFactorySelect\([^)]*supplier/i.test(FE), '13 Factory fill never receives a supplier argument');
  // Create gate requires company + factory only (supplier explicitly commented optional).
  ok(/var ok = !!\(company && factory\);/.test(FE), '14 Create gate = company && factory (Supplier NOT required)');
  // Submit no longer hard-requires a supplier.
  ok(!/if \(!supplierName\) return fail\('Select a Supplier\.'\);/.test(FE), '15 submit no longer requires a Supplier');
  // Supplier control retained + labeled optional.
  ok(/Supplier \(Optional/.test(FE), '16 Supplier control retained + labeled optional');
  // Payload still carries supplier_id / supplier_name / factory_id / warehouse_id (DTO shape preserved).
  ok(/supplier_id: supplierId \|\| ''/.test(FE) && /factory_id: factoryCode \|\| warehouseId/.test(FE) && /warehouse_id: warehouseId/.test(FE), '17 DTO shape preserved (supplier_id/supplier_name/factory_id/warehouse_id)');
})();

// =====================================================================================================
section('C. Backend manual validator (REAL validateManualRequestOrderDraft_)');
var beEnv = (function () {
  eval(extractVar(BE, /var RO_TERMINAL_LIFECYCLE_ = \{[^}]*\};/));
  eval(extractFn(BE, 'validateManualRequestOrderDraft_'));
  return { validate: validateManualRequestOrderDraft_ };
})();
(function () {
  var factoryMap = { 'wh-f': { warehouseId: 'WH-F', isFactory: true, isActive: true, company: 'KM' }, 'wh-off': { warehouseId: 'WH-OFF', isFactory: true, isActive: false, company: 'KM' }, 'wh-ov': { warehouseId: 'WH-OV', isFactory: false, isActive: true, company: 'KM' } };
  var skuLifecycle = { 'new-100': 'Running in the Market', 'disc-1': 'Discontinued', 'up-1': 'Upcoming SKU' };
  var upcMap = { 'NEW-100': 12, 'UP-1': 6, 'DISC-1': 12 };
  var maps = { factoryMap: factoryMap, skuLifecycle: skuLifecycle, upcMap: upcMap };
  function body(o) { return o; }

  var good = { company: 'KM', warehouse_id: 'WH-F', supplier_id: '', supplier_name: '', lines: [{ sku: 'NEW-100', requested_qty: 100, units_per_carton: 12 }] };
  ok(beEnv.validate(good, maps).ok === true, '18 valid Factory + valid SKU + Qty + BLANK supplier → ok (supplier not required)');
  ok(beEnv.validate(body({ company: 'KM', lines: good.lines }), maps).error === 'FACTORY_REQUIRED', '19 missing factory → FACTORY_REQUIRED');
  ok(beEnv.validate(body({ company: 'KM', warehouse_id: 'WH-GHOST', lines: good.lines }), maps).error === 'FACTORY_NOT_FOUND', '20 unknown factory → FACTORY_NOT_FOUND');
  ok(beEnv.validate(body({ company: 'KM', warehouse_id: 'WH-OV', lines: good.lines }), maps).error === 'FACTORY_NOT_FOUND', '21 non-factory warehouse → FACTORY_NOT_FOUND');
  ok(beEnv.validate(body({ company: 'KM', warehouse_id: 'WH-OFF', lines: good.lines }), maps).error === 'FACTORY_INACTIVE', '22 inactive factory → FACTORY_INACTIVE');
  ok(beEnv.validate(body({ company: 'KM', warehouse_id: 'WH-F', lines: [{ sku: 'GHOST', requested_qty: 5, units_per_carton: 12 }] }), maps).error === 'SKU_NOT_FOUND', '23 SKU absent from sku_details → SKU_NOT_FOUND (no free-text SKUs)');
  ok(beEnv.validate(body({ company: 'KM', warehouse_id: 'WH-F', lines: [{ sku: 'DISC-1', requested_qty: 5, units_per_carton: 12 }] }), maps).error === 'SKU_INACTIVE', '24 terminal SKU → SKU_INACTIVE');
  ok(beEnv.validate(body({ company: 'KM', warehouse_id: 'WH-F', lines: [{ sku: 'NEW-100', requested_qty: 0, units_per_carton: 12 }] }), maps).error === 'REQUESTED_QTY_INVALID', '25 qty <= 0 → REQUESTED_QTY_INVALID');
  ok(beEnv.validate(body({ company: 'KM', warehouse_id: 'WH-F', lines: [{ sku: 'NEW-100', requested_qty: 5 }] }), { factoryMap: factoryMap, skuLifecycle: skuLifecycle, upcMap: {} }).error === 'UNITS_PER_CARTON_MISSING', '26 no units_per_carton (line or sku_details) → UNITS_PER_CARTON_MISSING');
  ok(beEnv.validate(body({ company: 'KM', warehouse_id: 'WH-F', lines: [{ requested_qty: 5, units_per_carton: 12 }] }), maps).error === 'SKU_REQUIRED', '27 no SKU line → SKU_REQUIRED');
  // Upcoming SKU accepted (non-terminal)
  ok(beEnv.validate(body({ company: 'KM', warehouse_id: 'WH-F', lines: [{ sku: 'UP-1', requested_qty: 5, units_per_carton: 6 }] }), maps).ok === true, '28 Upcoming SKU accepted');
  // Allocation "Send Request" path (source_ref_type set) is EXEMPT — blank company/factory does NOT regress.
  ok(beEnv.validate(body({ company: '', source_ref_type: 'request_order_allocation', lines: [{ sku: 'ANY', requested_qty: 5 }] }), maps).ok === true, '29 allocation path (source_ref_type set) exempt — no regression');
  // cross-company factory rejected
  ok(beEnv.validate(body({ company: 'RESUS', warehouse_id: 'WH-F', lines: good.lines }), maps).error === 'FACTORY_NOT_FOUND', '30 cross-company factory rejected');
})();

// =====================================================================================================
section('D. Backend safety — validate-before-mutate, no schema/sheet creation, supplier optional writes');
(function () {
  ok(/validateManualRequestOrderDraft_\(body, \{/.test(BE) && BE.indexOf('validateManualRequestOrderDraft_(body') < BE.indexOf('procurementAppendByHeader_(rolSheet'), '31 manual validation runs BEFORE any append (validate-before-mutate)');
  ok(/procurementEnsureSheet_\(ss, 'request_orders'/.test(BE), '32 still uses procurementEnsureSheet_ (no new sheet creation/repair)');
  ok(/supplier_id: supplierId,/.test(BE) && /supplier_name: supplierName,/.test(BE), '33 supplier fields written from blank-safe values (header order preserved, no schema change)');
  ok(!/insertSheet|setColumnWidth|deleteColumn/.test(BE), '34 no schema/header mutation added');
})();

// =====================================================================================================
section('E. Golden Matrix + full-suite health');
(function () {
  var out;
  try { out = cp.execSync('node assets/tests/supply-planning-golden-scenarios.test.js', { cwd: path.join(__dirname, '..', '..'), encoding: 'utf8' }); }
  catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
  ok(/39\/40 scenarios EXECUTED_EXISTING_CORE and PASSED/.test(out), '35 Golden Matrix remains ≥ 39/1/0');
  ok(/1\/40 scenarios IMPLEMENTATION_PENDING/.test(out) && /0\/40 scenarios reported as CANONICAL-BLOCKED/.test(out), '36 Scenario #34 remains Pending');
})();

console.log('\n----------------------------------------');
console.log('REQUEST ORDER MANUAL DRAFT HOTFIX: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
