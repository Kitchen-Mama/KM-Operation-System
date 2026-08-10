// Kitchen Mama Operation System — F1-SKU-DETAILS-UNIT-R1 Add SKU canonical metric unit lock.
// Run: node assets/tests/sku-add-unit-lock-f1-sku-details-unit-r1.test.js
// -----------------------------------------------------------------------------
// NEW SKU creation persists canonical metric units ONLY: dimensions = cm, weight = kg. The Add SKU unit selectors
// are LOCKED (disabled, sole canonical option) so users cannot create in/lb SKUs, and the Create payload force-
// normalizes the six unit tokens defensively. A legacy cached draft with in/lb is NEVER reinterpreted as metric —
// its ambiguous numeric values are cleared (no trusted converter exists). Edit mode is untouched.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var SRC = read('js/pages/sku-details.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { if (JSON.stringify(a) !== JSON.stringify(e)) { fail++; console.error('FAIL ' + l + '\n  exp ' + JSON.stringify(e) + '\n  got ' + JSON.stringify(a)); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// Real dim-group key mapping (mirrors SKU_DIM_GROUPS_).
var GROUPS = [
  { l: 'item_length', w: 'item_width', h: 'item_height', unit: 'item_dimension_unit', wt: 'item_weight', wtUnit: 'item_weight_unit' },
  { l: 'package_length', w: 'package_width', h: 'package_height', unit: 'package_dimension_unit', wt: 'package_weight', wtUnit: 'package_weight_unit' },
  { l: 'carton_length', w: 'carton_width', h: 'carton_height', unit: 'carton_dimension_unit', wt: 'carton_weight', wtUnit: 'carton_weight_unit' }
];
function makeSanitizer() {
  var s = SRC.indexOf('function _skuAddDraftSanitizeUnitsFields_');
  var i = SRC.indexOf('{', s), depth = 0, end = -1;
  for (var p = i; p < SRC.length; p++) { if (SRC[p] === '{') depth++; else if (SRC[p] === '}') { depth--; if (depth === 0) { end = p + 1; break; } } }
  return new Function('SKU_DIM_GROUPS_', SRC.slice(s, end) + '\n return _skuAddDraftSanitizeUnitsFields_;')(GROUPS);
}
var sanitize = makeSanitizer();

section('H/§5 — legacy non-metric cached draft: numbers CLEARED (never reinterpreted), units forced cm/kg');
(function () {
  var f = sanitize({ item_length: '19.5', item_width: '8.9', item_height: '6.7', item_dimension_unit: 'in', item_weight: '0.336', item_weight_unit: 'lb' });
  ok(f.item_length === '' && f.item_width === '' && f.item_height === '', '19.5 in dimensions are CLEARED (never kept as 19.5 cm)');
  ok(f.item_weight === '' && f.item_weight_unit === 'kg', 'lb weight cleared; weight unit forced kg');
  ok(f.item_dimension_unit === 'cm', 'dimension unit forced cm');
})();

section('A/B/C — already-metric or empty draft is PRESERVED (only unit token normalized)');
(function () {
  var f = sanitize({ carton_length: '56.8', carton_width: '45.8', carton_height: '23.5', carton_dimension_unit: 'cm', carton_weight: '14.5', carton_weight_unit: 'kg' });
  ok(f.carton_length === '56.8' && f.carton_weight === '14.5', 'metric carton values preserved verbatim');
  ok(f.carton_dimension_unit === 'cm' && f.carton_weight_unit === 'kg', 'metric units stay cm/kg');
  var e = sanitize({ package_length: '', package_dimension_unit: '', package_weight: '', package_weight_unit: '' });
  ok(e.package_length === '' && e.package_dimension_unit === 'cm' && e.package_weight_unit === 'kg', 'empty group → units default to cm/kg, no spurious values');
})();

section('D/§2 — Add SKU unit selectors are LOCKED (disabled, canonical-only); user cannot choose in/lb');
var dimBlock = SRC.slice(SRC.indexOf('function _skuDimBlock'), SRC.indexOf('function _skuDimBlock') + 1400);
ok(/_skuFormMode === 'add'/.test(dimBlock) && /disabled/.test(dimBlock) && /skuf-unit-locked/.test(dimBlock), 'ADD-mode unit control is a disabled locked select');
ok(/<option value="' \+ canonical \+ '" selected>' \+ canonical \+ '<\/option>/.test(dimBlock), 'the locked select exposes ONLY the canonical unit option (no in/lb choice)');
ok(/unitSel\(d\.unit, d\.unitOptions, 'cm'\)/.test(SRC) && /unitSel\(d\.wtUnit, d\.wtUnitOptions, 'kg'\)/.test(SRC), 'dimensions locked to cm, weight locked to kg');

section('E/F/§3/§6 — Create payload force-normalizes the six unit tokens (ADD only)');
ok(/if \(_skuFormMode === 'add'\) \{[\s\S]*payload\.item_dimension_unit = 'cm'; payload\.package_dimension_unit = 'cm'; payload\.carton_dimension_unit = 'cm';/.test(SRC), 'ADD payload forces the three dimension units to cm');
ok(/payload\.item_weight_unit = 'kg'; payload\.package_weight_unit = 'kg'; payload\.carton_weight_unit = 'kg';/.test(SRC), 'ADD payload forces the three weight units to kg');

section('I/§4 — Edit mode untouched (selectable unit path preserved; force is add-only)');
ok(/var v = String\(_skuLoadValue\(rec, key\) \|\| ''\)\.trim\(\);\s*\n\s*return '<select id="sku-f-' \+ key \+ '" class="skuf-unit-sel"><option value="">—<\/option>'/.test(dimBlock), 'Edit mode keeps the original selectable unit dropdown (— + all options)');
var collectBlock = SRC.slice(SRC.indexOf('function _skuCollectAndValidate'), SRC.indexOf('function _skuSetSaving'));
ok(/if \(_skuFormMode === 'add'\)/.test(collectBlock), 'payload unit force is guarded to ADD (Edit persists the per-record unit)');

section('§5 compat — asRec sanitizes; new drafts store canonical; no new columns / DB / converter');
ok(/var f = _skuAddDraftSanitizeUnitsFields_\(draft\.fields\)/.test(SRC), 'draft restore (asRec) runs the metric sanitizer');
ok(!/2\.54|0\.4535|convertUnit|toCm|toKg/.test(SRC), '§5 no second conversion formula/helper introduced (clear-not-convert)');
ok(!/KM\.DB|fetch\(/.test(SRC.slice(SRC.indexOf('function _skuAddDraftSanitizeUnitsFields_'), SRC.indexOf('function _skuAddDraftAsRec_') + 300)), 'unit sanitizer makes no API/DB call');
// no new persisted unit columns — the six canonical field names are unchanged
['item_dimension_unit', 'item_weight_unit', 'package_dimension_unit', 'package_weight_unit', 'carton_dimension_unit', 'carton_weight_unit'].forEach(function (c) {
  ok(SRC.indexOf(c) !== -1, 'canonical unit field preserved: ' + c);
});

console.log('\n----------------------------------------');
console.log('SKU ADD UNIT LOCK (F1-SKU-DETAILS-UNIT-R1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
