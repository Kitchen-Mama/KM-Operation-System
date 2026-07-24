// Sidebar nav — TEMP Phase-2 disable of "Overseas Inbound" / "Overseas Outbound" (pure Node source-scan, no DOM).
// Asserts the two sidebar items stay VISIBLE but are non-interactive: the showSection() nav owner
// (assets/js/app.js) guards/omits them, keyboard cannot activate them (tabindex=-1 + aria-disabled),
// the markup carries the disabled affordance, and the guard is scoped to ONLY these two ids so every
// other sidebar item still navigates. Run: node assets/tests/sidebar-overseas-disabled.test.js

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..', '..');
var indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
var appJs = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'app.js'), 'utf8');

var failures = 0;
function ok(cond, label) {
  if (cond) { console.log('ok   ' + label); }
  else { failures++; console.error('FAIL ' + label); }
}

// Isolate the two disabled menu-item <div> blocks from index.html.
function menuItemBlock(label) {
  // Grab a chunk starting at the menu-label and walking back to its opening <div ...> tag.
  var re = new RegExp('<div class="menu-item[^>]*>\\s*<span class="menu-label">' + label + '</span>[\\s\\S]*?</div>');
  var m = indexHtml.match(re);
  return m ? m[0] : '';
}
var inbound = menuItemBlock('Overseas Inbound');
var outbound = menuItemBlock('Overseas Outbound');

// --- items still present / visible (not deleted, not display:none) ---
ok(indexHtml.indexOf('>Overseas Inbound<') >= 0, 'Overseas Inbound item still present in sidebar');
ok(indexHtml.indexOf('>Overseas Outbound<') >= 0, 'Overseas Outbound item still present in sidebar');
ok(inbound && inbound.indexOf('display:none') < 0 && inbound.indexOf('display: none') < 0, 'Overseas Inbound not hidden (stays visible)');
ok(outbound && outbound.indexOf('display:none') < 0 && outbound.indexOf('display: none') < 0, 'Overseas Outbound not hidden (stays visible)');

// --- click does NOT trigger a route: onclick=showSection removed from the two items ---
ok(inbound.indexOf("showSection('overseas-inbound')") < 0, 'Overseas Inbound has no showSection onclick (click cannot route)');
ok(outbound.indexOf("showSection('overseas-outbound')") < 0, 'Overseas Outbound has no showSection onclick (click cannot route)');

// --- and even if reached, the nav owner guards these two ids (early return) ---
ok(/if\s*\(\s*section\s*===\s*['"]overseas-inbound['"]\s*\|\|\s*section\s*===\s*['"]overseas-outbound['"]\s*\)\s*\{\s*return\s*;?\s*\}/.test(appJs),
   'showSection() early-returns for overseas-inbound / overseas-outbound');

// --- guard is scoped to ONLY these two ids (other sections not blocked) ---
var guardHits = (appJs.match(/return\s*;?\s*\}/g) || []); // sanity: guard exists
ok(guardHits.length >= 1, 'guard return present in app.js');
ok(appJs.indexOf("=== 'factory-stock'") < 0 && appJs.indexOf("=== 'overseas-stock'") < 0,
   'guard does not block other sidebar sections (factory-stock / overseas-stock untouched)');
// The routing section map must still contain the two ids (routes/pages NOT deleted).
ok(appJs.indexOf("'overseas-inbound': 'overseas-inbound-section'") >= 0, 'overseas-inbound route/section map kept (page not deleted)');
ok(appJs.indexOf("'overseas-outbound': 'overseas-outbound-section'") >= 0, 'overseas-outbound route/section map kept (page not deleted)');

// --- keyboard cannot activate: removed from tab order + aria-disabled ---
ok(/tabindex\s*=\s*"-1"/.test(inbound), 'Overseas Inbound tabindex="-1" (out of tab order)');
ok(/tabindex\s*=\s*"-1"/.test(outbound), 'Overseas Outbound tabindex="-1" (out of tab order)');
ok(/aria-disabled\s*=\s*"true"/.test(inbound), 'Overseas Inbound aria-disabled="true"');
ok(/aria-disabled\s*=\s*"true"/.test(outbound), 'Overseas Outbound aria-disabled="true"');

// --- disabled affordance styling (opacity/cursor via menu-item--disabled) ---
ok(/menu-item--disabled/.test(inbound), 'Overseas Inbound uses menu-item--disabled style class');
ok(/menu-item--disabled/.test(outbound), 'Overseas Outbound uses menu-item--disabled style class');
var layoutCss = fs.readFileSync(path.join(ROOT, 'assets', 'css', 'layout.css'), 'utf8');
ok(/\.menu-item--disabled[\s\S]*?pointer-events:\s*none/.test(layoutCss), 'menu-item--disabled disables pointer-events (cannot click)');
ok(/\.menu-item--disabled[\s\S]*?cursor:\s*not-allowed/.test(layoutCss), 'menu-item--disabled uses not-allowed cursor');

// --- other sidebar items are unaffected (still route via showSection) ---
ok(indexHtml.indexOf("showSection('factory-stock')") >= 0, 'Factory Inventory still navigates (unaffected)');
ok(indexHtml.indexOf("showSection('overseas-stock')") >= 0, 'Overseas Inventory still navigates (unaffected)');

// --- Preview badge kept on both ---
ok(/stage-badge">Preview/.test(inbound), 'Overseas Inbound keeps its Preview badge');
ok(/stage-badge">Preview/.test(outbound), 'Overseas Outbound keeps its Preview badge');

console.log('\n' + (failures ? (failures + ' FAILURE(S)') : 'ALL PASS'));
process.exit(failures ? 1 : 0);
