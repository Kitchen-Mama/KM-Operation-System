// Kitchen Mama Operation System — F1-UI-PLANNING-ACTION-HIERARCHY-R1 toolbar action visual convergence.
// Run: node assets/tests/toolbar-action-hierarchy-f1-ui-r1.test.js
// -----------------------------------------------------------------------------
// UI-ONLY. Proves the Inventory + Order Planning top toolbars converge on ONE shared geometry contract (the existing
// --km-button-* tokens) with a professional action hierarchy: Submit/Send = filled-orange primary CTA (unchanged),
// AI Support = restrained ghost-orange PLANNING secondary (belongs to the workflow family, one level below Submit,
// NOT a filled block), Search = operational, More Options = neutral utility. AI Plan is the emphasized row inside the
// AI Support menu (restrained brand text + subtle surface, never a full-orange row). Handlers/markup onclicks are
// unchanged. No Apps Script / DB / formula / bundle touched.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var COMPONENTS = read('css/components.css');
var INV_CSS = read('css/pages/inventory-replenishment.css');
var RO_CSS = read('css/pages/request-order.css');
var INV_HTML = read('html/pages/inventory-replenishment.html');
var RO_HTML = read('html/pages/request-order.html');
var INDEX = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
// extract a single CSS rule body by exact selector head (first occurrence).
function ruleBody(css, selector) {
  var i = css.indexOf(selector);
  if (i === -1) return '';
  var b = css.indexOf('{', i), e = css.indexOf('}', b);
  return (b === -1 || e === -1) ? '' : css.slice(b + 1, e);
}

// =============================================================================
section('§5 — ONE shared toolbar-action geometry contract (existing --km-button-* tokens)');
var trig = ruleBody(COMPONENTS, '.km-action-menu__trigger {');
ok(/height:\s*var\(--km-button-height/.test(trig) && /min-height:\s*var\(--km-button-height/.test(trig), 'AI Support trigger height = --km-button-height (was: no height → shorter than the buttons)');
ok(/border-radius:\s*var\(--km-button-radius/.test(trig), 'AI Support trigger radius = --km-button-radius (was --radius-sm)');
ok(/padding:\s*0 var\(--km-button-padding-x/.test(trig), 'AI Support trigger horizontal padding = --km-button-padding-x');
ok(/box-sizing:\s*border-box/.test(trig) && /line-height:\s*1/.test(trig), 'AI Support trigger is border-box + normalized line-height (clean vertical alignment)');

var more = ruleBody(INV_CSS, '#ops-section .replen-actions-menu__trigger {');
ok(/height:\s*var\(--km-button-height/.test(more) && /border-radius:\s*var\(--km-button-radius/.test(more) && /padding:\s*0 var\(--km-button-padding-x/.test(more), 'More Options trigger shares the SAME --km-button-* geometry contract');
ok(/font-size:\s*13px/.test(more) && /box-sizing:\s*border-box/.test(more), 'More Options trigger normalized font-size + box-sizing');

// Search + Submit .replen-btn already anchor the contract (regression guard).
var replenBtn = ruleBody(INV_CSS, '#ops-section .replen-btn {');
ok(/height:\s*var\(--km-button-height/.test(replenBtn) && /border-radius:\s*var\(--km-button-radius/.test(replenBtn) && /padding:\s*0 var\(--km-button-padding-x/.test(replenBtn), 'Search + Submit (.replen-btn) already on the same --km-button-* contract → all four Inventory toolbar controls identical height');

section('§2 — AI Support = restrained PLANNING accent (ghost-orange), NOT a filled block');
var invAi = ruleBody(INV_CSS, '#ops-section .km-action-menu__trigger {');
ok(/color:\s*var\(--warm-orange/.test(invAi) && /border-color:\s*var\(--warm-orange/.test(invAi), 'Inventory AI Support carries warm-orange text + border (planning family, one level below Submit)');
ok(/background:\s*#fff/.test(invAi) && !/background:\s*var\(--warm-orange/.test(invAi), 'Inventory AI Support is a WHITE/ghost surface — NOT a solid filled-orange block');
var roAi = ruleBody(RO_CSS, '.ro-action-group .km-action-menu__trigger {');
ok(/color:\s*var\(--warm-orange/.test(roAi) && /border-color:\s*var\(--warm-orange/.test(roAi) && /background:\s*#fff/.test(roAi), 'Order Planning AI Support carries the SAME restrained ghost-orange planning treatment');
ok(/height:\s*var\(--filter-height/.test(roAi) && /border-radius:\s*var\(--filter-border-radius/.test(roAi) && /font-size:\s*var\(--filter-font-size/.test(roAi), 'OP AI Support is sized to the OP action-row contract (--filter-* : identical to Send Request + Request Type on the same row)');

section('§8/§2 — Submit strongest CTA + More Options neutral (unchanged semantic colours)');
ok(/background:\s*var\(--warm-orange\)/.test(ruleBody(INV_CSS, '#ops-section .replen-btn--primary {')), 'Submit Plan remains the FILLED warm-orange primary CTA (strongest)');
ok(/background:\s*#f1f5f9/.test(more) && !/warm-orange/.test(more), 'More Options remains NEUTRAL grey (no orange) — lowest-priority utility');

section('§6 — AI Plan is the emphasized menu row (restrained), Recalculate rows stay neutral, no full-orange row');
var invPlan = ruleBody(INV_CSS, '#replen-ai-plan-btn.km-action-menu__item {');
var roPlan = ruleBody(RO_CSS, '#ro-ai-plan-btn.km-action-menu__item {');
ok(/color:\s*var\(--warm-orange/.test(invPlan) && /font-weight:\s*600/.test(invPlan), 'Inventory AI Plan row = restrained emphasis (brand text + weight)');
ok(/color:\s*var\(--warm-orange/.test(roPlan) && /font-weight:\s*600/.test(roPlan), 'OP AI Plan row = restrained emphasis');
// the emphasis surface is a SUBTLE rgba tint, never a solid --warm-orange filled block (§6/§11)
ok(/background:\s*rgba\(255,\s*140,\s*66/.test(invPlan) && !/background:\s*var\(--warm-orange\)/.test(invPlan), 'Inventory AI Plan surface is a subtle warm tint — NOT a full-orange filled row');
ok(/background:\s*rgba\(255,\s*140,\s*66/.test(roPlan) && !/background:\s*var\(--warm-orange\)/.test(roPlan), 'OP AI Plan surface is a subtle warm tint — NOT a full-orange filled row');
// components.css AI Support menu items are still background:none (no orange rows leaked into the shared component)
ok(/\.km-action-menu__item\s*\{[^}]*background:\s*none/.test(COMPONENTS) && !/--warm-orange/.test(COMPONENTS.match(/\.km-action-menu[\s\S]*$/)[0]), 'shared .km-action-menu component stays neutral (no --warm-orange leaked into components.css)');

section('§10/§14 — handlers + user-facing actions UNCHANGED (markup onclicks intact)');
ok(/onclick="submitReplenishmentPlans\(\)"/.test(INV_HTML) && /onclick="searchReplenishment\(\)"/.test(INV_HTML), 'Inventory Submit + Search onclick handlers unchanged');
ok(/onclick="toggleReplenAiSupportMenu\(event\)"/.test(INV_HTML) && /onclick="runReplenAiSupport\('aiplan'\)"/.test(INV_HTML) && /onclick="toggleReplenActionsMenu\(event\)"/.test(INV_HTML), 'Inventory AI Support / AI Plan / More Options handlers unchanged');
ok(/onclick="handleSendRequest\(\)"/.test(RO_HTML) && /onclick="handleRequestOrderSearch\(\)"/.test(RO_HTML) && /onclick="runRoAiSupport\('aiplan'\)"/.test(RO_HTML), 'Order Planning Send Request / Search / AI Plan handlers unchanged');
ok(/✦ AI Support/.test(INV_HTML) && /✦ AI Support/.test(RO_HTML), 'user-facing action labels unchanged (✦ AI Support on both pages)');

section('§7 — Inventory / Order Planning parity via the SHARED .km-action-menu class');
ok(/class="km-action-menu__trigger"/.test(INV_HTML) && /class="km-action-menu__trigger"/.test(RO_HTML), 'both pages use the shared .km-action-menu trigger class (one component system)');

section('deployment — changed CSS is cache-versioned so browsers refetch');
ok(/assets\/css\/components\.css\?v=toolbarui-20260811/.test(INDEX), 'components.css cache token bumped');
ok(/assets\/css\/pages\/inventory-replenishment\.css\?v=toolbarui-20260811/.test(INDEX), 'inventory-replenishment.css cache token bumped');
ok(/assets\/css\/pages\/request-order\.css\?v=toolbarui-20260811/.test(INDEX), 'request-order.css cache token bumped');

console.log('\n----------------------------------------');
console.log('TOOLBAR ACTION HIERARCHY (F1-UI-PLANNING-ACTION-HIERARCHY-R1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
