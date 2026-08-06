// Kitchen Mama Operation System — Request Order Manual Draft SKU-line alignment (F1-S3-UI).
// Run: node assets/tests/request-order-draft-line-alignment-f1-s3-ui.test.js
// -----------------------------------------------------------------------------
// Proves the per-line resolver renders inline text ONLY for a real error (never "Currency null" / raw null on a
// valid row), toggles aria-invalid, and that the CSS keeps the five inputs on one baseline (empty error slot
// collapses; cells top-aligned so an error grows the row downward). Drives the REAL _roResolveLineRow against a
// fake row + source/CSS scans. Behavior (resolver/gate/authority) is unchanged. NOT strict (direct eval).

var fs = require('fs');
var path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var FE = read('js/pages/request-order-draft.js');
var CSS = read('css/pages/procurement.css');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}

// ---- fake DOM row ----
function fakeEl() { return { value: '', textContent: '', className: '', attrs: {}, setAttribute: function (k, v) { this.attrs[k] = v; }, removeAttribute: function (k) { delete this.attrs[k]; }, getAttribute: function (k) { return this.attrs[k]; } }; }
function fakeRow() {
  var sku = fakeEl(), upc = fakeEl(), ssku = fakeEl(), ucost = fakeEl(), cur = fakeEl(), msg = fakeEl();
  var map = { '[data-f="sku"]': sku, '[data-f="units_per_carton"]': upc, '[data-f="supplier_sku"]': ssku, '[data-f="unit_cost"]': ucost, '[data-f="currency"]': cur, '.ro-c-line-msg': msg };
  var cls = {};
  return {
    els: { sku: sku, upc: upc, ssku: ssku, ucost: ucost, cur: cur, msg: msg },
    querySelector: function (s) { return map[s] || null; },
    classList: { add: function (c) { cls[c] = 1; }, remove: function (c) { delete cls[c]; }, toggle: function (c, on) { if (on) cls[c] = 1; else delete cls[c]; }, contains: function (c) { return !!cls[c]; } }
  };
}

// ---- eval the REAL _roResolveLineRow with stubbed deps ----
var RES = { status: 'ok', unitsPerCarton: 40, supplierSku: null, unitCost: null, currency: null };
var window = {};
function _roCreateVal() { return ''; }
function _roResolveCommercial() { return RES; }
function _roLineStatusText(s) { return ({ 'sku-not-found': 'SKU not found', 'no-upc': 'Units/Carton not configured for this SKU', 'no-sku': 'Select a SKU' })[s] || 'Not available'; }
eval(extractFn(FE, '_roResolveLineRow'));
ok(typeof _roResolveLineRow === 'function', 'X1 _roResolveLineRow eval OK');

section('A. valid row (status ok, currency null) → NO helper text, compact, aligned');
RES = { status: 'ok', unitsPerCarton: 40, supplierSku: null, unitCost: null, currency: null };
var r = fakeRow(); r.els.sku.value = 'CO1100-S'; _roResolveLineRow(r);
ok(r.els.msg.textContent === '', 'A1 no text below SKU on a valid row');
ok(!/Currency/.test(r.els.msg.textContent), 'A2 "Currency null" is NOT rendered');
ok(r.els.msg.textContent.indexOf('null') < 0 && r.els.msg.textContent.indexOf('undefined') < 0, 'A3 no raw null / undefined rendered');
ok(r.els.msg.className === 'ro-c-line-msg', 'A4 message slot has no --ok/--error state on a valid row');
ok(!r.classList.contains('is-error'), 'A5 row not flagged is-error');
ok(r.els.sku.getAttribute('aria-invalid') === undefined, 'A6 SKU input not aria-invalid');
ok(String(r.els.upc.value) === '40', 'A7 Units/Ctn populated from source (source-proven)');
ok(r.els.ssku.value === '' && r.els.ucost.value === '', 'A8 optional Supplier SKU / Unit Cost left blank (no inline info)');

section('B. error row → inline error below SKU, row flagged, aria-invalid set');
RES = { status: 'sku-not-found', unitsPerCarton: null, supplierSku: null, unitCost: null, currency: null };
var e = fakeRow(); e.els.sku.value = 'BAD-SKU'; _roResolveLineRow(e);
ok(e.els.msg.textContent === 'SKU not found', 'B1 error text shown below SKU');
ok(/ro-c-line-msg--error/.test(e.els.msg.className), 'B2 canonical error style applied');
ok(e.classList.contains('is-error'), 'B3 row flagged is-error');
ok(e.els.sku.getAttribute('aria-invalid') === 'true', 'B4 SKU input aria-invalid=true');
RES = { status: 'no-upc', unitsPerCarton: null, supplierSku: null, unitCost: null, currency: null };
var e2 = fakeRow(); e2.els.sku.value = 'NOUPC'; _roResolveLineRow(e2);
ok(/Units\/Carton/.test(e2.els.msg.textContent) && e2.classList.contains('is-error'), 'B5 units-per-carton-unavailable surfaces as an error');

section('C. clearing the error restores the compact aligned state');
RES = { status: 'ok', unitsPerCarton: 40, supplierSku: null, unitCost: null, currency: null };
_roResolveLineRow(e);   // same row, now resolves ok
ok(e.els.msg.textContent === '' && !e.classList.contains('is-error') && e.els.sku.getAttribute('aria-invalid') === undefined, 'C1 error cleared → empty slot, no is-error, aria-invalid removed');

section('D. empty SKU → no text, not an error');
var em = fakeRow(); em.els.sku.value = ''; _roResolveLineRow(em);
ok(em.els.msg.textContent === '' && !em.classList.contains('is-error'), 'D1 empty SKU renders no helper text and is not an error');

section('E. source scans — info/debug text removed, error-only');
ok(!/'Currency '\s*\+\s*res\.currency/.test(FE), 'E1 the "Currency " + res.currency info line is gone');
ok(!/ro-c-line-msg--ok/.test(FE), 'E2 the informational --ok message state is no longer set');
ok(/res\.status !== 'ok'/.test(FE), 'E3 message shows only when status !== ok (error-only)');
ok(/aria-invalid/.test(FE) && /aria-describedby/.test(FE), 'E4 a11y: aria-invalid + aria-describedby wired');

section('F. CSS keeps inputs aligned (empty slot collapses; cells top-aligned)');
ok(/\.ro-c-line-msg:empty\s*\{[^}]*display:\s*none/.test(CSS), 'F1 empty error slot collapses to zero height');
ok(/#ro-c-lines td\s*\{[^}]*vertical-align:\s*top/.test(CSS), 'F2 line cells are top-aligned (error grows row downward, inputs stay put)');
ok(/\.ro-c-line-msg--error\s*\{[^}]*#dc2626/.test(CSS), 'F3 canonical red error color retained');

section('G. all five inputs share the pc-input control class + Supplier Phase-1 preserved');
var addFn = extractFn(FE, 'addCreateLine');
ok((addFn.match(/data-f="sku"/) && addFn.match(/data-f="requested_qty"/) && addFn.match(/data-f="units_per_carton"/) && addFn.match(/data-f="supplier_sku"/) && addFn.match(/data-f="unit_cost"/)) != null, 'G1 the five SKU-line controls are present');
ok((addFn.match(/pc-input/g) || []).length >= 5, 'G2 controls share the canonical pc-input class (uniform height/alignment)');
ok(/var ok = !!\(company && factory\)/.test(FE), 'G3 Create gate requires Company + Factory only (Supplier NOT a prerequisite)');
ok(/_roFillFactorySelect\(company\)/.test(FE) && /Factory options \(NO supplier dependency\)/.test(FE), 'G4 Factory options are Supplier-independent');
ok(/getSkuDetails/.test(FE), 'G5 SKU authority remains sku_details');

console.log('\n----------------------------------------');
console.log('RO DRAFT LINE ALIGNMENT (F1-S3-UI): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
