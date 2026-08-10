// Kitchen Mama Operation System — F1-SMALL-SKU-MATERIAL Add SKU Material add-new-value support.
// Run: node assets/tests/sku-material-add-f1-small.test.js
// -----------------------------------------------------------------------------
// The Material field is a creatable multi-select TAG control: users select presets AND type brand-new values.
// A new value is trimmed, de-duplicated, selected on the current form, remembered as a SESSION suggestion (NOT a
// DB master table), and persisted verbatim into the EXISTING sku_details.material via the " + "-joined serialization.
// Behavioral tests run the REAL tag helpers (_skuTagControl / _skuTagAddValue / _skuTagParse / _skuTagSerialize)
// with the session registry; source-contract assertions pin the "＋ Add new" affordance + no-DB-master guarantee.

var fs = require('fs'), path = require('path');
var SRC = fs.readFileSync(path.join(__dirname, '..', 'js/pages/sku-details.js'), 'utf8');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { if (JSON.stringify(a) !== JSON.stringify(e)) { fail++; console.error('FAIL ' + l + '\n  exp ' + JSON.stringify(e) + '\n  got ' + JSON.stringify(a)); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

function fnText(name) {
  var s = SRC.indexOf('function ' + name);
  if (s < 0) throw new Error('not found: ' + name);
  var i = SRC.indexOf('{', s), depth = 0, end = -1;
  for (var p = i; p < SRC.length; p++) { if (SRC[p] === '{') depth++; else if (SRC[p] === '}') { depth--; if (depth === 0) { end = p + 1; break; } } }
  return SRC.slice(s, end);
}
// Assemble the pure (DOM-free) tag helpers + the session registry into one evaluable module.
var body = ['_skuTagParse', '_skuTagSerialize', '_skuTagControl', '_skuTagChipsHtml', '_skuTagAddValue'].map(fnText).join('\n') +
  '\n return { control:_skuTagControl, add:_skuTagAddValue, parse:_skuTagParse, serialize:_skuTagSerialize, data:_skuTagData, session:SKU_TAG_SESSION_ADDED_ };';
function makeApi() {
  var _skuTagData = {}, SKU_TAG_SESSION_ADDED_ = {};
  return new Function('_skuTagData', 'SKU_TAG_SESSION_ADDED_', '_skuEsc', body)(_skuTagData, SKU_TAG_SESSION_ADDED_, function (s) { return String(s == null ? '' : s); });
}
var PRESETS = ['ABS Plastic', 'Stainless Steel', 'Aluminum', 'Silicone', 'Glass', 'Other'];

section('M1 — existing material is selectable (presets seed the control)');
(function () {
  var api = makeApi();
  api.control('material', 'ABS Plastic', 'Add…', PRESETS);
  ok(api.data.material.presets.indexOf('ABS Plastic') !== -1, 'preset "ABS Plastic" offered as a selectable suggestion');
  eq(api.data.material.tags, ['ABS Plastic'], 'an existing stored material loads as a selected chip');
})();

section('M2/M3 — a NEW material can be typed/added and remains selected');
(function () {
  var api = makeApi();
  api.control('material', '', 'Add…', PRESETS);
  var changed = api.add('material', 'Borosilicate Glass');
  ok(changed === true, 'adding a not-yet-listed material returns true (accepted)');
  ok(api.data.material.tags.indexOf('Borosilicate Glass') !== -1, 'the new material stays SELECTED as a chip on the form');
})();

section('M4/M5 — Create payload contains the new material via the EXISTING " + " serialization');
(function () {
  var api = makeApi();
  api.control('material', 'ABS Plastic', 'Add…', PRESETS);
  api.add('material', 'Borosilicate Glass');
  var payload = api.serialize(api.data.material.tags);
  ok(payload.indexOf('Borosilicate Glass') !== -1, 'M4: serialized payload contains the new material');
  eq(payload, 'ABS Plastic + Borosilicate Glass', 'M5: existing " + "-joined serialization unchanged (delimiter preserved)');
})();

section('M6 — whitespace normalization (trim; no whitespace-only duplicates)');
(function () {
  var api = makeApi();
  api.control('material', '', 'Add…', PRESETS);
  api.add('material', '  Borosilicate Glass  ');
  eq(api.data.material.tags, ['Borosilicate Glass'], 'leading/trailing whitespace trimmed');
  ok(api.add('material', 'borosilicate glass') === false, 'case/space-variant duplicate rejected (no dup value)');
  ok(api.add('material', 'Borosilicate  Glass') === true, 'a genuinely different internal spacing is NOT silently renamed (distinct value)');
})();

section('M7 — a blank material is never added');
(function () {
  var api = makeApi();
  api.control('material', '', 'Add…', PRESETS);
  ok(api.add('material', '   ') === false && api.data.material.tags.length === 0, 'whitespace-only entry not added');
  ok(api.add('material', '') === false, 'empty entry not added');
})();

section('M8 — existing material workflow unchanged (selecting a preset still works)');
(function () {
  var api = makeApi();
  api.control('material', '', 'Add…', PRESETS);
  ok(api.add('material', 'Stainless Steel') === true && api.data.material.tags.indexOf('Stainless Steel') !== -1, 'selecting an existing preset adds it as a chip');
  ok((api.session.material || []).indexOf('Stainless Steel') === -1, 'selecting a PRESET does NOT pollute the session-added custom list');
})();

section('session reuse — a new material becomes a suggestion for the NEXT SKU (session only, no DB)');
(function () {
  var api = makeApi();
  api.control('material', '', 'Add…', PRESETS);
  api.add('material', 'Borosilicate Glass');
  ok((api.session.material || []).indexOf('Borosilicate Glass') !== -1, 'the new custom value is recorded in the session registry');
  // A freshly-opened control (same session registry) now offers it as a suggestion.
  api.control('material', '', 'Add…', PRESETS);
  ok(api.data.material.presets.indexOf('Borosilicate Glass') !== -1, 'the session-added material is offered as a suggestion on the next form');
})();

section('M9/M10 — no new material master table; unrelated SKU field mapping unchanged (source contract)');
ok(/type: 'tags', presets: SKU_MATERIAL_PRESETS_/.test(SRC), 'M10: Material field is still the tag control over SKU_MATERIAL_PRESETS_ (mapping unchanged)');
ok(/var SKU_TAG_SESSION_ADDED_ = \{\};/.test(SRC), 'session cache is a plain in-memory object (M9: no persistent/global material table)');
var sessBlock = SRC.slice(SRC.indexOf('SESSION-ONLY suggestion cache'), SRC.indexOf('var SKU_TAG_SESSION_ADDED_'));
ok(/NOT a persistent\/global material master|FUTURE Administration/.test(sessBlock), 'M9: documented as session-only, not a DB master (future Administration owns that)');
var addFn = fnText('_skuTagAddValue');
ok(!/KM\.DB|fetch\(|upsertSkuDetail|localStorage|sessionStorage/.test(addFn), 'M9: adding a material makes NO API/DB/storage write (session memory only)');
ok(/＋ Add new /.test(SRC), 'M2: the "＋ Add new …" creatable affordance is present in the suggestion dropdown');
// Material payload still flows through the shared _skuCollectAndValidate tag branch (unchanged mapping).
ok(/if \(f\.type === 'tags'\)/.test(SRC) && /_skuTagSerialize\(td\.tags\)/.test(SRC), 'M10: Add SKU submit still serializes tags via the existing collect path (no new material mapping)');

console.log('\n----------------------------------------');
console.log('SKU MATERIAL ADD (F1-SMALL-SKU-MATERIAL): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
