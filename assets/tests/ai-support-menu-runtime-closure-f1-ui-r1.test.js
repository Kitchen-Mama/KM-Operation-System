// Kitchen Mama Operation System — F1-UI-RUNTIME-CLOSURE-R1 AI Support consolidation + More Options visual closure.
// Run: node assets/tests/ai-support-menu-runtime-closure-f1-ui-r1.test.js
// -----------------------------------------------------------------------------
// Source-level assertions for the runtime UI closure: AI Plan + Recalculate All Sites are REMOVED from the main
// toolbar and live inside ONE neutral "AI Support" dropdown (shared .km-action-menu primitive, parity with SKU
// Details More Options — white panel, compact text rows, NO orange filled blocks). Menu items REUSE the existing
// handlers verbatim (no second gap/recommendation engine). The stale-asset root cause is closed by cache-versioning
// index.html's CSS/JS (§7). Frontend-only; no formula/DB/Apps Script change.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var INV_HTML = read('html/pages/inventory-replenishment.html');
var RO_HTML = read('html/pages/request-order.html');
var INV_JS = read('js/pages/inventory-replenishment.js');
var RO_JS = read('js/pages/request-order.js');
var COMPONENTS = read('css/components.css');
var INDEX = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
var SKU_CSS = read('css/pages/sku-details.css');
var INV_CSS = read('css/pages/inventory-replenishment.css');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
// The Inventory action group (ops group) — the toolbar area that must NOT contain standalone AI/recalc buttons.
function invActionGroup() { var m = INV_HTML.match(/replen-actions__ops[\s\S]*?<!-- "Sync Regional Details"/); return m ? m[0] : INV_HTML; }
function roActionGroup() { var m = RO_HTML.match(/ro-action-group[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/); return m ? m[0] : RO_HTML; }

// =============================================================================
section('A — Inventory toolbar: AI Plan + Recalculate All Sites removed from the toolbar, moved into AI Support');
var invOps = invActionGroup();
ok(/id="replenAiSupportTrigger"/.test(INV_HTML) && /✦ AI Support/.test(INV_HTML), 'A1 Inventory AI Support trigger exists');
// the AI Plan + Recalc ids now live ONLY inside the AI Support panel (km-action-menu__item), never as standalone toolbar buttons
ok(/km-action-menu__item"[^>]*id="replen-ai-plan-btn"|id="replen-ai-plan-btn"[^>]*class="km-action-menu__item"|class="km-action-menu__item" id="replen-ai-plan-btn"/.test(INV_HTML), 'A2 AI Plan is a km-action-menu item (not a toolbar button)');
ok(/class="km-action-menu__item" id="replen-recalc-all-btn"|id="replen-recalc-all-btn"[^>]*km-action-menu__item/.test(INV_HTML), 'A3 Recalculate All Sites is a km-action-menu item');
ok(!/replen-btn ro-btn--ai" id="replen-ai-plan-btn"/.test(INV_HTML), 'A4 no standalone .replen-btn AI Plan button remains');
ok(!/<button class="replen-btn" id="replen-recalc-all-btn"/.test(INV_HTML), 'A5 no standalone .replen-btn Recalculate All Sites button remains');
ok(/AI Support[\s\S]*Recalculate Current Scope/.test(INV_HTML), 'A6 AI Support contains a "Recalculate Current Scope" entry');
ok(/replen-btn replen-btn--primary" onclick="submitReplenishmentPlans\(\)/.test(INV_HTML) && /replen-btn--search" onclick="searchReplenishment/.test(INV_HTML), 'A7 Search + Submit Plan remain primary toolbar buttons (unchanged)');
ok(/id="replenActionsTrigger"/.test(INV_HTML), 'A8 More Options menu still present');

section('B — Order Planning toolbar: AI Plan + Recalculate All Sites removed, moved into AI Support');
ok(/id="roAiSupportTrigger"/.test(RO_HTML) && /✦ AI Support/.test(RO_HTML), 'B1 Order Planning AI Support trigger exists');
ok(/class="km-action-menu__item" id="ro-ai-plan-btn"|id="ro-ai-plan-btn"[^>]*km-action-menu__item/.test(RO_HTML), 'B2 AI Plan is a km-action-menu item');
ok(/class="km-action-menu__item" id="ro-recalc-all-btn"|id="ro-recalc-all-btn"[^>]*km-action-menu__item/.test(RO_HTML), 'B3 Recalculate All Sites is a km-action-menu item');
ok(!/ro-btn ro-btn--ai" id="ro-ai-plan-btn"/.test(RO_HTML), 'B4 no standalone .ro-btn AI Plan button remains');
ok(!/<button type="button" class="ro-btn" id="ro-recalc-all-btn"/.test(RO_HTML), 'B5 no standalone .ro-btn Recalculate All Sites button remains');
ok(/AI Support[\s\S]*Recalculate Current Scope/.test(RO_HTML), 'B6 AI Support contains "Recalculate Current Scope"');
ok(/ro-btn ro-btn--primary" onclick="handleSendRequest\(\)/.test(RO_HTML) && /id="ro-request-type"/.test(RO_HTML), 'B7 All Request + Send Request remain unchanged');

section('C — More Options + AI Support are NEUTRAL (no orange), parity with SKU Details');
// AI Support rows carry ONLY km-action-menu classes — never a primary/orange button class
ok(!/km-action-menu__item[^"]*(replen-btn|ro-btn|btn-primary|--primary)/.test(INV_HTML + RO_HTML), 'C1 no AI Support row carries a primary/orange button class');
// shared component: white panel, item background none, restrained danger, neutral disabled, NO orange
ok(/\.km-action-menu__panel\s*\{[\s\S]*?background:\s*#ffffff/.test(COMPONENTS), 'C2 .km-action-menu panel is white');
ok(/\.km-action-menu__item\s*\{[\s\S]*?background:\s*none/.test(COMPONENTS), 'C3 .km-action-menu item background is none (no filled block)');
ok(/\.km-action-menu__item--danger\s*\{\s*color:\s*var\(--km-ui-danger/.test(COMPONENTS), 'C4 danger is restrained TEXT colour (not a solid orange fill)');
ok(/\.km-action-menu__item\[disabled\][\s\S]*?cursor:\s*not-allowed/.test(COMPONENTS), 'C5 disabled item is neutral + not-allowed');
ok(!/--warm-orange/.test(COMPONENTS.match(/\.km-action-menu[\s\S]*$/)[0]), 'C6 no --warm-orange anywhere in the .km-action-menu component');
// existing Inventory More Options rows remain neutral (background:none), never orange
ok(/#ops-section \.replen-actions-menu__item\s*\{[\s\S]*?background:\s*none/.test(INV_CSS), 'C7 More Options rows remain background:none (neutral)');
ok(/\.more-options-item\s*\{[\s\S]*?background:\s*none/.test(SKU_CSS), 'C8 SKU Details reference rows are background:none (the visual authority)');

section('D — handler REUSE (no second gap/recommendation engine)');
ok(/function runReplenAiSupport[\s\S]*?handleReplenAiPlan\(\)[\s\S]*?recalcInventoryGapCurrentScope\(\)[\s\S]*?handleRecalcAllInventoryGap\(\)/.test(INV_JS), 'D1 Inventory AI Support dispatches to the EXISTING AI Plan / scoped-recalc / recalc-all handlers');
ok(/function runRoAiSupport[\s\S]*?handleRequestOrderAiPlan\(\)[\s\S]*?recalcOrderPlanningGapCurrentScope\(\)[\s\S]*?handleRecalcAllOrderPlanningGap\(\)/.test(RO_JS), 'D2 Order Planning AI Support dispatches to the existing handlers');
// no new calculation/recommendation engine introduced in the menu code
ok(!/allocateFactory|allocateOverseas|Math\.ceil\(.*\* ?18|new .*Engine|function .*Recommendation.*generate/i.test(RO_JS.match(/runRoAiSupport[\s\S]{0,1200}/)[0]), 'D3 AI Support dispatcher contains no calculation/allocation/recommendation logic');

section('E — menu behavior: toggle + outside-click + Escape + one-at-a-time');
ok(/function toggleReplenAiSupportMenu/.test(INV_JS) && /function toggleRoAiSupportMenu/.test(RO_JS), 'E1 both pages expose an AI Support toggle');
ok(/_replenBindAiSupportGlobal[\s\S]*?addEventListener\('click'[\s\S]*?_replenAiClose/.test(INV_JS), 'E2 Inventory AI Support binds outside-click close');
ok(/_roBindAiSupportGlobal[\s\S]*?ev\.key === 'Escape'[\s\S]*?_roAiClose\(true\)/.test(RO_JS), 'E3 Order Planning AI Support closes on Escape');
ok(/window\.toggleReplenAiSupportMenu\s*=/.test(INV_JS) && /window\.toggleRoAiSupportMenu\s*=/.test(RO_JS), 'E4 toggles are window-exposed for the inline onclick');

section('F — Cancel is contextual, not a permanent idle toolbar control');
ok(/id="replen-cancel-recalc-btn"[^>]*style="display:none"/.test(INV_HTML), 'F1 Inventory Cancel is display:none when idle (shown only while a job runs)');
ok(/id="ro-cancel-recalc-btn"[^>]*style="display:none"/.test(RO_HTML), 'F2 Order Planning Cancel is display:none when idle');

section('G — §7 deployment closure: index.html assets are cache-versioned (defeats stale browser-cached CSS)');
ok(/assets\/css\/components\.css\?v=/.test(INDEX) && /assets\/css\/pages\/inventory-replenishment\.css\?v=/.test(INDEX), 'G1 page/component CSS carry a ?v= cache-version');
ok(/assets\/js\/pages\/inventory-replenishment\.js\?v=/.test(INDEX) && /assets\/js\/pages\/request-order\.js\?v=/.test(INDEX), 'G2 page JS carry a ?v= cache-version');
ok((INDEX.match(/assets\/[^"?]+\.(?:css|js)\?v=/g) || []).length >= 60, 'G3 the version was applied broadly across local assets (not a single file)');
ok(/cdn\.jsdelivr\.net\/npm\/chart\.js"><\/script>/.test(INDEX), 'G4 external CDN scripts were NOT versioned (only local assets)');

console.log('\n----------------------------------------');
console.log('AI SUPPORT MENU RUNTIME CLOSURE (F1-UI-R1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
