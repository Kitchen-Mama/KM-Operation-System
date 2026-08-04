// Kitchen Mama Operation System — FC Summary Base-FC inline edit + Sidebar hierarchy hotfix tests (2026-08-04).
// Run: node assets/tests/fc-base-edit-and-sidebar.test.js
// LOCAL / SOURCE-LEVEL. Extracts + evals the REAL pure helpers from assets/js/pages/fc-summary.js (not a
// re-implementation) and asserts the canonical-write / identity / validation logic, plus source-level assertions
// on the edit-mode wiring and the sidebar CSS hierarchy. No DOM, no live Spreadsheet, no network.

var fs = require('fs');
var path = require('path');

var JS = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'fc-summary.js'), 'utf8');
var LAYOUT = fs.readFileSync(path.join(__dirname, '..', 'css', 'layout.css'), 'utf8');
var INDEX = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
var APP = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('source function not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced braces: ' + name);
}
var REG_MONTH_KEYS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
eval(extractFn(JS, '_fcUp'));
eval(extractFn(JS, 'fcRowIdentityKey'));
eval(extractFn(JS, 'fcValidateMonthRaw'));
eval(extractFn(JS, 'fcBuildRegularWriteRows'));

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// ==========================================================================
section('§18 — value rules (pure fcValidateMonthRaw)');
ok(fcValidateMonthRaw('').valid === false && fcValidateMonthRaw('').reason === 'blank', 'V1 blank is INVALID (never silently 0)');
eq(fcValidateMonthRaw('0'), { valid: true, value: 0 }, 'V2 explicit zero is valid');
ok(fcValidateMonthRaw('-5').valid === false, 'V3 negative rejected');
ok(fcValidateMonthRaw('3.5').valid === false, 'V4 decimal rejected visibly (integer schema)');
ok(fcValidateMonthRaw('abc').valid === false, 'V5 non-numeric rejected');
eq(fcValidateMonthRaw('  4282 '), { valid: true, value: 4282 }, 'V6 whitespace-trimmed integer parsed (no locale)');
ok(fcValidateMonthRaw('4,282').valid === false, 'V7 locale thousands-separator rejected (no locale parsing)');

section('§18 — canonical row identity (pure fcRowIdentityKey)');
var us = { year: 2026, company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'GA0450' };
var ca = { year: 2026, company: 'KM', country: 'CA', marketplace: 'AMAZON_CA', sku: 'GA0450' };
ok(fcRowIdentityKey(us) !== fcRowIdentityKey(ca), 'ID1 same SKU in two countries → DISTINCT identity (not SKU alone)');
ok(fcRowIdentityKey(us).indexOf('GA0450') >= 0 && fcRowIdentityKey(us).indexOf('US') >= 0 && fcRowIdentityKey(us).indexOf('KM') >= 0, 'ID2 identity carries full business key (year|company|country|marketplace|sku)');
ok(fcRowIdentityKey({ year: '2026', company: 'km', country: 'us', marketplace: 'amazon_us', sku: 'ga0450' }) === fcRowIdentityKey(us), 'ID3 identity is case/trim-normalized');

section('§18 — batch delta payload (pure fcBuildRegularWriteRows)');
var base = { months: [1,2,3,4,5,6,7,8,9,10,11,12] };
var rows = fcBuildRegularWriteRows([{ identity: us, base: base, months: { 9: 4282 } }]);
ok(rows.length === 1, 'B1 only the changed row is emitted (row-level delta)');
ok(rows[0].oct === 4282, 'B2 edited month (Oct) written');
ok(rows[0].jan === 1 && rows[0].dec === 12 && rows[0].sep === 9, 'B3 unchanged months preserved exactly');
ok(rows[0].sku === 'GA0450' && rows[0].year === 2026 && rows[0].company === 'KM' && rows[0].country === 'US' && rows[0].marketplace === 'AMAZON_US', 'B4 full identity on every write row');
ok(REG_MONTH_KEYS.every(function (m) { return Object.prototype.hasOwnProperty.call(rows[0], m); }), 'B5 full 12-month upsert vector (canonical importFcRegularForecastBatch DTO)');
eq(fcBuildRegularWriteRows([]), [], 'B6 no dirty entries → empty payload (no write)');
// two dirty identities → two rows, each independent
var multi = fcBuildRegularWriteRows([{ identity: us, base: base, months: { 0: 100 } }, { identity: ca, base: base, months: { 0: 200 } }]);
ok(multi.length === 2 && multi[0].jan === 100 && multi[1].jan === 200 && multi[0].country === 'US' && multi[1].country === 'CA', 'B7 two identities update only their own row (same SKU, different country)');

section('§18 — edit-mode wiring (source-level over the REAL functions)');
var confirmSrc = extractFn(JS, 'confirmFcEdit');
ok(/_fcRegularEditSource\(\)/.test(confirmSrc) && !/fcRegularMock/.test(confirmSrc), 'W1 edit snapshot binds to the LIVE source (_fcRegularEditSource), not the empty fcRegularMock');
ok(/JSON\.parse\(JSON\.stringify/.test(confirmSrc), 'W2 immutable snapshot of the current scope is taken');
ok(/_fcSetEditLock\(true\)/.test(confirmSrc), 'W3 scope-changing controls are locked on enter');
var renderSrc = extractFn(JS, 'renderFcRegularTableEditable');
ok(/input type="number"/.test(renderSrc), 'W4 Jan–Dec become numeric inputs');
ok(/fc-cell-readonly/.test(renderSrc) && /aria-label=/.test(renderSrc), 'W5 identity columns read-only + inputs have accessible labels');
ok(/fcEditState\.editRows/.test(renderSrc), 'W6 editable table renders the immutable edit-scope snapshot');

var saveSrc = extractFn(JS, 'saveFcChanges');
ok(/importFcRegularForecastBatch/.test(saveSrc), 'W7 Save uses the canonical FC write authority (importFcRegularForecastBatch)');
ok(!/Successfully saved/.test(saveSrc) && !/console\.log\('Saving changes'/.test(saveSrc), 'W8 NO hardcoded false-success (the P0 fake toast is gone from Regular Save)');
ok(/res\.success === false|res && res\.success === false/.test(saveSrc) && /\.catch\(/.test(saveSrc), 'W9 honest error handling (checks success + catch), no optimistic success');
ok(/exitEditMode\(\)/.test(saveSrc) && /NOT written to DB/.test(saveSrc), 'W10 success reconciles + demo path is honestly labeled (never claims DB write)');
ok(/counts\.invalid > 0/.test(saveSrc), 'W11 Save blocked while any cell is invalid');
ok(/entries\.length === 0/.test(saveSrc), 'W12 Save with no changes performs no DB call');

var cancelSrc = extractFn(JS, 'cancelFcEdit');
ok(!/KM\.DB|fetch|importFcRegularForecastBatch/.test(cancelSrc), 'W13 Cancel makes ZERO backend calls');
ok(/confirm\(/.test(cancelSrc) && /exitEditMode\(\)/.test(cancelSrc), 'W14 Cancel confirms on dirty then restores via exitEditMode');
var updSrc = extractFn(JS, 'updateFcMonth');
ok(/fcValidateMonthRaw/.test(updSrc) && /invalid\[mIdx\] = true/.test(updSrc), 'W15 blank/invalid input flagged invalid — never coerced to 0');

section('§12 — scope discipline: only Regular changed; Event/Target/New/Import intact');
ok(/function saveEventChanges\(/.test(JS) && /function saveRegularUpdate\(/.test(JS), 'S1 Special Event save + New-FC-Update builder still present (untouched)');
ok(/window\.KM\.DB\.importFcRegularForecastBatch\(rows/.test(JS) || /importFcRegularForecastBatch\(rows/.test(JS), 'S2 Import Forecast path still calls the batch authority');

section('§17 — sidebar visual hierarchy (source-level over layout.css)');
ok(/\.sidebar > \.menu-item\s*\{[^}]*font-weight/.test(LAYOUT), 'C1 first-level standalone items get a distinct weight');
ok(/\.menu-parent\.is-open\s*\{[^}]*soft-green/.test(LAYOUT), 'C2 expanded Level-1 group gets a brand-green accent');
ok(/\.menu-children\.is-open\s*\{[^}]*background/.test(LAYOUT), 'C3 Level-2 children sit on a distinct recessed surface');
ok(/\.menu-children \.menu-item\s*\{[\s\S]*?border-left[\s\S]*?\}/.test(LAYOUT) && /\.menu-children \.menu-item\s*\{[\s\S]*?font-size[\s\S]*?\}/.test(LAYOUT), 'C4 Level-2 items differ by indent/guide-rail + smaller font');
ok(/\.menu-children \.menu-item\.active\s*\{[\s\S]*?soft-green[\s\S]*?border-left: 3px solid #ffffff/.test(LAYOUT), 'C5 active child = brand green + white guide (distinct from Level-1 active orange border)');
ok(/\.menu-item\.active\s*\{[\s\S]*?border-left: 4px solid var\(--warm-orange\)/.test(LAYOUT), 'C6 Level-1 active keeps the warm-orange border (parent-active ≠ child-active)');
ok(/var\(--soft-green\)/.test(LAYOUT) && /var\(--warm-orange\)/.test(LAYOUT), 'C7 uses existing brand tokens (no invented palette)');

section('§3/§17 — navigation + interaction preserved (no route/logic change)');
ok(/function toggleMenu\(menuId\)/.test(APP) && /classList\.toggle\("is-open"\)/.test(APP), 'N1 expand/collapse logic (toggleMenu / is-open) unchanged');
ok(/menu-item.*onclick="showSection\('ops'\)"/.test(INDEX), 'N2 first-level route (Inventory → showSection) intact');
ok(/onclick="showSection\('fc-summary'\)"/.test(INDEX), 'N3 child route (FC Summary) intact');
ok(/class="stage-badge">Preview<|class="stage-badge">Soon</.test(INDEX), 'N4 preview/soon badges intact');
ok((INDEX.match(/menu-item--disabled/g) || []).length >= 3, 'N5 disabled/preview items intact');

// ==========================================================================
if (fail === 0) console.log('\nAll FC base-edit + sidebar hotfix assertions passed (' + pass + ' assertions).');
else { console.error('\n' + fail + ' FAILURE(S) of ' + (pass + fail) + ' assertions'); process.exit(1); }
