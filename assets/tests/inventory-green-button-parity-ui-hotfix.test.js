// Kitchen Mama Operation System — Factory/Overseas Inventory green/blue button parity (UI-HOTFIX).
// Run: node assets/tests/inventory-green-button-parity-ui-hotfix.test.js
// -----------------------------------------------------------------------------
// UI-only. Proves the GREEN (.btn-secondary) buttons on the Factory Inventory and Overseas Inventory
// pages + their modals inherit the SAME geometry as the BLUE (.btn / .btn-primary) authority — only the
// color differs — via a rule SCOPED to each section (no global .btn-secondary refactor, no transform /
// negative-margin / offset hacks). Source-scan test (repo has no visual-snapshot harness).

var fs = require('fs');
var path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }

var COMP = read('css/components.css');
var FAC = read('css/pages/factory-stock.css');
var OVS = read('css/pages/overseas-stock.css');
var FAC_HTML = read('html/pages/factory-stock.html');
var OVS_HTML = read('html/pages/overseas-stock.html');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// Extract the block that starts at the scoped selector head and ends at the next closing brace.
function ruleBody(css, selector) {
  var i = css.indexOf(selector);
  if (i < 0) return null;
  var open = css.indexOf('{', i), close = css.indexOf('}', open);
  return (open < 0 || close < 0) ? null : css.slice(open + 1, close);
}

section('A. root-cause anchor — the GLOBAL .btn-secondary override is untouched (no global refactor)');
ok(/\.btn-secondary\s*\{[^}]*padding:\s*0\.8rem 1\.5rem/.test(COMP), 'A1 global .btn-secondary still carries its original padding (we did NOT edit the shared component)');
ok(/\.btn\s*\{[^}]*padding:\s*0 var\(--btn-padding-inline\)/.test(COMP), 'A2 blue .btn authority geometry is padding:0 var(--btn-padding-inline)');

section('B. Factory Inventory — scoped green parity to the blue .btn token geometry');
var facGreen = ruleBody(FAC, '#factory-stock-section .btn.btn-secondary');
ok(facGreen !== null, 'B1 factory-stock.css scopes #factory-stock-section .btn.btn-secondary');
ok(/padding:\s*0 var\(--btn-padding-inline\)/.test(facGreen), 'B2 green padding matches blue (0 var(--btn-padding-inline)) — kills the low-label vertical padding');
ok(/border-radius:\s*var\(--btn-radius\)/.test(facGreen), 'B3 green border-radius uses the shared token');
ok(/font-size:\s*var\(--btn-font-size\)/.test(facGreen), 'B4 green font-size uses the shared token');
ok(/height:\s*var\(--btn-height\)/.test(facGreen), 'B5 green height uses the shared token');
ok(/box-shadow:\s*none/.test(facGreen), 'B6 green drops the extra box-shadow (matches blue)');
var facBtn = ruleBody(FAC, '#factory-stock-section .btn');
ok(facBtn && /display:\s*inline-flex/.test(facBtn) && /align-items:\s*center/.test(facBtn) && /justify-content:\s*center/.test(facBtn), 'B7 factory .btn family uses inline-flex centering (blue+green one family)');

section('C. Overseas Inventory — scoped green parity to the blue .btn token geometry');
var ovsGreen = ruleBody(OVS, '#overseas-stock-section .btn.btn-secondary');
ok(ovsGreen !== null, 'C1 overseas-stock.css scopes #overseas-stock-section .btn.btn-secondary');
ok(/padding:\s*0 var\(--btn-padding-inline\)/.test(ovsGreen), 'C2 green padding matches blue');
ok(/border-radius:\s*var\(--btn-radius\)/.test(ovsGreen), 'C3 green border-radius uses the shared token');
ok(/font-size:\s*var\(--btn-font-size\)/.test(ovsGreen), 'C4 green font-size uses the shared token');
ok(/height:\s*var\(--btn-height\)/.test(ovsGreen), 'C5 green height uses the shared token');
ok(/box-shadow:\s*none/.test(ovsGreen), 'C6 green drops the extra box-shadow');
var ovsBtn = ruleBody(OVS, '#overseas-stock-section .btn');
ok(ovsBtn && /display:\s*inline-flex/.test(ovsBtn) && /align-items:\s*center/.test(ovsBtn) && /justify-content:\s*center/.test(ovsBtn), 'C7 overseas .btn family uses inline-flex centering');

section('D. no forbidden positioning hacks in the new scoped blocks');
[['factory', facGreen + '\n' + facBtn], ['overseas', ovsGreen + '\n' + ovsBtn]].forEach(function (p) {
  ok(!/transform:\s*translateY/.test(p[1]), 'D1 ' + p[0] + ': no transform:translateY hack');
  ok(!/margin[^:]*:\s*-/.test(p[1]), 'D2 ' + p[0] + ': no negative-margin hack');
  ok(!/position:\s*absolute/.test(p[1]) && !/\btop:\s*-?\d/.test(p[1]), 'D3 ' + p[0] + ': no absolute/relative-top offset hack');
});

section('E. markup unchanged — same button family classes present (behavior untouched)');
ok(/id="factory-stock-import-btn"[^>]*class="btn btn-primary"|class="btn btn-primary"[^>]*id="factory-stock-import-btn"/.test(FAC_HTML), 'E1 Factory Import Inventory stays blue (btn-primary)');
ok(/id="factory-stock-edit-btn"[^>]*class="btn btn-secondary"|class="btn btn-secondary"[^>]*id="factory-stock-edit-btn"/.test(FAC_HTML), 'E2 Factory Inventory Adjustment stays green (btn-secondary)');
ok(/id="overseas-import-btn"[^>]*class="btn btn-primary"|class="btn btn-primary"[^>]*id="overseas-import-btn"/.test(OVS_HTML), 'E3 Overseas Import Inventory stays blue (btn-primary)');
ok(/id="overseas-adjust-btn"[^>]*class="btn btn-secondary"|class="btn btn-secondary"[^>]*id="overseas-adjust-btn"/.test(OVS_HTML), 'E4 Overseas Inventory Adjustment stays green (btn-secondary)');

console.log('\n----------------------------------------');
console.log('INVENTORY GREEN/BLUE BUTTON PARITY (UI-HOTFIX): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
