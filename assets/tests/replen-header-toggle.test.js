// Inventory Replenishment — header colspan alignment (A1), SKU chevron / gear removal / whole-row toggle
// (A2), left/right second-layer sync (A3), Planning Model rename (A5), Category-tab + More Options parity
// (A4 / A6), and marketplace label (Canonical Decision 2). Pure Node source-scan + pure-logic mirrors
// (no DOM). Run: node assets/tests/replen-header-toggle.test.js
'use strict';
var fs = require('fs');
var path = require('path');
var fail = 0;
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else console.log('ok   ' + l); }

var html = fs.readFileSync(path.join(__dirname, '..', 'html', 'pages', 'inventory-replenishment.html'), 'utf8');
var js = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'inventory-replenishment.js'), 'utf8');
var css = fs.readFileSync(path.join(__dirname, '..', 'css', 'pages', 'inventory-replenishment.css'), 'utf8');

// ============================================================================
// A1 — Header group colspans + leaf sequence (source-scan the HTML) + CSS widths + body-cell order.
// ============================================================================
// Parent (level-1) group cells in order: [type, data-leaf-span, text].
var level1 = (html.match(/km-table__header-row--level1">([\s\S]*?)<\/div>\s*<!--|km-table__header-row--level1">([\s\S]*?)<div class="km-table__header-row--level2/) || [])[0] || '';
// Fallback: just scan the whole header block for the group cells (they are unique enough).
var groupRe = /km-table__header-cell--([a-z-]+)"\s+data-leaf-span="(\d+)"[^>]*>([^<]*)</g;
var groups = [], mm;
while ((mm = groupRe.exec(html)) !== null) groups.push({ type: mm[1], span: parseInt(mm[2], 10), text: mm[3].trim() });

eq(groups.map(function (g) { return g.type; }),
   ['status', 'company', 'marketplace', 'inventory', 'sales', 'replen', 'factory', 'note-span'],
   'A1: level-1 group cells appear in the correct order');
eq(groups.map(function (g) { return g.text; }),
   ['Planning Model', 'Company', 'Marketplace', 'Inventory', 'Sales', 'Replenishment', '工廠Stock', 'AI Action'],
   'A1/A5: parent header sequence (Status renamed to Planning Model)');
var spanByType = {}; groups.forEach(function (g) { spanByType[g.type] = g.span; });
eq(spanByType.replen, 2, 'A1: Replenishment colspan = 2');
eq(spanByType.factory, 2, 'A1: Factory Stock colspan = 2');
eq(spanByType.inventory, 3, 'A1: Inventory colspan = 3');
eq(spanByType.sales, 3, 'A1: Sales colspan = 3');

// Leaf (level-2) headers in order. Only the level-2 leaf cells carry the bare class
// "km-table__header-cell" (group cells always add a --modifier), so a global scan yields exactly them.
var leaves = (html.match(/<div class="km-table__header-cell">([^<]+)<\/div>/g) || [])
    .map(function (s) { return s.replace(/<[^>]+>/g, '').trim(); });
eq(leaves,
   ['Current Stock', 'On the Way', '3rd Party Stock', 'Avg. Sales/day', '60 days FC', 'Upcoming Event', 'Days of Supply', 'Suggested Qty', 'CN', 'TW'],
   'A1: leaf header sequence (…Days of Supply, Suggested Qty, CN, TW)');
// The four data-leaf groups must span exactly the number of leaves, 1:1.
eq(spanByType.inventory + spanByType.sales + spanByType.replen + spanByType.factory, leaves.length,
   'A1: group leaf-spans sum to the number of leaf columns (' + leaves.length + ')');
// Replenishment starts at leaf 7 (Days of Supply); Factory at leaf 9 (CN) — CN is NOT inside Replenishment.
eq(leaves[6], 'Days of Supply', 'A1: leaf 7 is the first Replenishment leaf');
eq(leaves[7], 'Suggested Qty', 'A1: leaf 8 is the second (last) Replenishment leaf');
eq(leaves[8], 'CN', 'A1: leaf 9 (CN) is the first Factory Stock leaf — NOT under Replenishment');
eq(leaves[9], 'TW', 'A1: leaf 10 (TW) is the second Factory Stock leaf');

// CSS width must equal colspan × 120px (240px for the 2-leaf groups).
var replenRule = (css.match(/\.km-table__header-cell--replen\s*\{[\s\S]*?\}/) || [''])[0];
eq(/width:\s*240px/.test(replenRule) && /min-width:\s*240px/.test(replenRule), true, 'A1: Replenishment group is 240px (2 × 120px)');
var factoryRule = (css.match(/\.km-table__header-cell--factory\s*\{[\s\S]*?\}/) || [''])[0];
eq(/width:\s*240px/.test(factoryRule) && /min-width:\s*240px/.test(factoryRule), true, 'A1: Factory Stock group is 240px (2 × 120px)');

// Body-cell order in renderReplenishment must line up 1:1 with the 10 leaves (after Planning Model /
// Company / Marketplace), i.e. the leaf fields appear in this exact sequence.
var scrollTpl = (js.match(/scrollBody\.innerHTML = data\.map\(item =>[\s\S]*?\.join\(''\);/) || [''])[0];
var bodyLeafTokens = ['item.currentInventory', 'item.onTheWay', 'item.thirdPartyStock', 'item.avgDailySales',
    'item.forecast60d', 'item.upcomingEventQty', 'item.daysOfSupply', 'replen-suggested-cell', 'item.cnStock', 'item.twStock'];
var lastIdx = -1, ordered = true;
bodyLeafTokens.forEach(function (t) { var i = scrollTpl.indexOf(t); if (i === -1 || i < lastIdx) ordered = false; lastIdx = i; });
eq(ordered, true, 'A1: first-layer body cells line up 1:1 with the leaves (inventory→sales→replen→factory)');

// ============================================================================
// A2 — SKU chevron, gear removal, whole-row toggle guard.
// ============================================================================
var fixedTpl = (js.match(/fixedBody\.innerHTML = data\.map\(item => \{[\s\S]*?\}\)\.join\(''\);/) || [''])[0];
eq(/class="replen-row-chevron"/.test(fixedTpl), true, 'A2: chevron rendered in the fixed SKU column');
eq(/<button type="button" class="replen-row-chevron"/.test(fixedTpl), true, 'A2: chevron is a native <button>');
eq(/aria-expanded="false"/.test(fixedTpl), true, 'A2: chevron has aria-expanded');
eq(/aria-controls="\$\{_irPanelId\(item\.sku\)\}"/.test(fixedTpl), true, 'A2: chevron aria-controls points at the detail panel id');
eq(/aria-label="Toggle replenishment details for /.test(fixedTpl), true, 'A2: chevron has a descriptive aria-label');
eq(/onclick="_replenChevronClick\(event, /.test(fixedTpl), true, 'A2: chevron wired to _replenChevronClick');
// The detail panel carries that id so aria-controls resolves.
eq(/replen-expand-panel--scroll" id="\$\{_irPanelId\(sku\)\}"/.test(js), true, 'A2: detail panel gets the matching id');
// Gear fully removed (DOM + tooltip).
eq(/planned-qty-config-btn/.test(js) || /planned-qty-config-btn/.test(css), false, 'A2: gear button (planned-qty-config-btn) removed from JS + CSS');
eq(/Configure shipping allocation/.test(js), false, 'A2: gear tooltip removed');
// Suggested Qty cell shows the value only.
eq(/replen-suggested-cell__value/.test(scrollTpl) && !/<button/.test((scrollTpl.match(/replen-suggested-cell">[\s\S]*?<\/div>/) || [''])[0]), true, 'A2: Suggested Qty cell shows value/status only (no button)');
// Chevron click stops propagation so it and the row handler never double-fire.
var chevronFn = (js.match(/function _replenChevronClick\(event, sku\)\s*\{[\s\S]*?\}/) || [''])[0];
eq(/stopPropagation\(\)/.test(chevronFn), true, 'A2: _replenChevronClick calls stopPropagation (single toggle)');
// Row click guards interactive targets (request-order _roIsInteractiveTarget pattern).
eq(/function _irIsInteractiveTarget\(/.test(js), true, 'A2: interactive-target guard exists');
var rowFn = (js.match(/function _replenRowClick\(event, sku\)\s*\{[\s\S]*?\}/) || [''])[0];
eq(/_irIsInteractiveTarget\(event\.target/.test(rowFn), true, 'A2: _replenRowClick excludes interactive targets from row toggle');
eq(/BUTTON: 1[\s\S]*?SELECT: 1/.test(js), true, 'A2: guard covers BUTTON/INPUT/SELECT/... tags');

// ============================================================================
// A3 — Single state drives BOTH sides; pure toggle logic can't desync.
// ============================================================================
// Pure-logic mirror of _irNextExpandedKey (the real function is source-scanned below).
function nextKey(current, clicked) { return current === clicked ? null : clicked; }
var key = null;                                  // (1) both sides start collapsed
eq(key, null, 'A3: initial state collapsed (no expanded key)');
key = nextKey(key, 'SKU-A');                     // (2) one toggle → expanded
eq(key, 'SKU-A', 'A3: one toggle → row expanded (single key set)');
key = nextKey(key, 'SKU-A');                     // (3) second toggle → collapsed
eq(key, null, 'A3: second toggle on same row → collapsed');
// (6) Rapid toggling never desyncs: one variable is the sole source; left/right both read it. Simulate a
// burst of clicks and confirm the key is always exactly the last-open row or null — never a split state.
var seq = ['A', 'A', 'B', 'B', 'B', 'C', 'A'];
var k = null; seq.forEach(function (s) { k = nextKey(k, s); });
eq(k, 'A', 'A3: rapid toggling resolves to a single deterministic key (no desync)');
// Real function present + used, and it drives ONE state variable read by both sides.
eq(/function _irNextExpandedKey\(currentKey, clickedKey\)\s*\{\s*return currentKey === clickedKey \? null : clickedKey;/.test(js.replace(/\s+/g, ' ')), true, 'A3: _irNextExpandedKey is the single-state decision');
var toggleFn = (js.match(/function toggleReplenRow\(sku\)\s*\{[\s\S]*?function updatePlannedQty/) || [''])[0];
eq(/_irNextExpandedKey\(currentExpandedRow, sku\)/.test(toggleFn), true, 'A3: toggleReplenRow uses the single-state decision');
eq(/fixedRow\.classList\.add\('expanded'\)/.test(toggleFn) && /scrollRow\.classList\.add\('expanded'\)/.test(toggleFn), true, 'A3: BOTH left (fixed) and right (scroll) get .expanded in the same pass');
// Both sides open synchronously BEFORE any deferred work: the two .expanded adds precede the first
// setTimeout, so neither side is staggered behind a timer (the only setTimeout is shared height/chart init).
var iFixed = toggleFn.indexOf("fixedRow.classList.add('expanded')");
var iScroll = toggleFn.indexOf("scrollRow.classList.add('expanded')");
var iTimer = toggleFn.indexOf('setTimeout(');
eq(iFixed !== -1 && iScroll !== -1 && iFixed < iTimer && iScroll < iTimer, true, 'A3: both sides open synchronously before any setTimeout (no per-side stagger)');
// aria-expanded stays in sync with the visual state.
eq(/setAttribute\('aria-expanded', 'false'\)/.test(toggleFn) && /setAttribute\('aria-expanded', 'true'\)/.test(toggleFn), true, 'A3/A2: chevron aria-expanded synced to open/closed');

// ============================================================================
// A5 — Planning Model display formatter (canonical values preserved).
// ============================================================================
function planningLabel(v) { var s = String(v == null ? '' : v).trim().toLowerCase(); if (s === 'forecast_driven') return 'Forecast'; if (s === 'sales_driven') return 'Sales'; return v ? String(v) : 'Sales'; }
eq(planningLabel('sales_driven'), 'Sales', 'A5: sales_driven → Sales');
eq(planningLabel('forecast_driven'), 'Forecast', 'A5: forecast_driven → Forecast');
eq(/function _replenPlanningModelLabel\(/.test(js), true, 'A5: shared formatter _replenPlanningModelLabel exists');
eq(/_replenPlanningModelLabel\(item\.replenishmentModel\)/.test(scrollTpl), true, 'A5: table cell uses the shared formatter');
eq(/Sales Driven|Forecast Driven/.test(scrollTpl), false, 'A5: table cell no longer shows "Sales Driven"/"Forecast Driven"');
eq(/>Sales Driven<|>Forecast Driven</.test(html), false, 'A5: Add/Edit forms show Sales/Forecast (no "…Driven") while keeping canonical values');
eq(/<option value="sales_driven">Sales<\/option>/.test(html) && /<option value="forecast_driven">Forecast<\/option>/.test(html), true, 'A5: canonical option values preserved (sales_driven / forecast_driven)');

// ============================================================================
// A4 — Category selector is now the SHARED Category Tab Rail (.km-tab-rail), unified with Order System /
// Promotion Risk (2026-07-28). The old measure-based "More Categories" overflow + the .replen-category-tab
// segmented control were removed; every category lives in one horizontally-scrollable rail. Active-tab blue
// (#3B82F6) now comes from the shared .km-tab-rail__tab.is-active rule in components.css.
// ============================================================================
eq(/class="[^"]*km-tab-rail[^"]*"[^>]*id="replenCategoryTabs"/.test(html), true, 'A4: category container uses the shared .km-tab-rail');
eq(/km-tab-rail__tab/.test(js) && /km-tab-rail__count/.test(js), true, 'A4: tabs render with the shared .km-tab-rail__tab / __count classes');
eq(/KM\.ui\.tabRail\.enhance/.test(js) && /scrollActiveIntoView/.test(js), true, 'A4: rail wired to KM.ui.tabRail (wheel/keyboard scroll + active-into-view)');
eq(/replen-category-more|_replenLayoutCategoryOverflow|More Categories/.test(js), false, 'A4: old "More Categories" overflow mode removed');
eq(/replen-category-tabs\.km-tab-rail/.test(css), true, 'A4: category container styled as a .km-tab-rail (page carries only spacing/z-index override)');

// ============================================================================
// A6 — More Options visual parity with SKU Details (neutral, no orange/toy look).
// ============================================================================
var trigger = (css.match(/#ops-section \.replen-actions-menu__trigger\s*\{[\s\S]*?\}/) || [''])[0];
eq(/background:\s*#f1f5f9/.test(trigger) && /color:\s*#334155/.test(trigger), true, 'A6: trigger uses SKU Details neutral colours (#f1f5f9 / #334155)');
var panel = (css.match(/#ops-section \.replen-actions-menu__list\s*\{[\s\S]*?\}/) || [''])[0];
eq(/shadow-soft/.test(panel) && /min-width:\s*240px/.test(panel) && /border:\s*1px solid var\(--border-light\)/.test(panel), true, 'A6: panel matches SKU Details (soft shadow, 240px, border-light)');
var item = (css.match(/#ops-section \.replen-actions-menu__item\s*\{[\s\S]*?\}/) || [''])[0];
eq(/padding:\s*9px 10px/.test(item) && /font-size:\s*var\(--font-size-body\)/.test(item) && /color:\s*var\(--text-primary\)/.test(item), true, 'A6: menu items match SKU Details tokens');

// ============================================================================
// Canonical Decision 2 — marketplace label = display name (no country suffix); value = marketplace_id;
// company hint only on same-country display-name collision.
// ============================================================================
var mpFn = (js.match(/function refreshReplenMarketplaceOptions\([\s\S]*?\n\}/) || [''])[0];
eq(/label: m\.marketplaceDisplayName \|\| m\.marketplace \|\| m\.marketplaceId/.test(mpFn), true, 'CD2: option label sourced from marketplace_display_name');
eq(/value="' \+ escapeReplenHtml\(o\.value\)/.test(mpFn), true, 'CD2: option value stays marketplace_id (identity)');
eq(/\(US\)|\(CA\)|o\.country|\+ ' \(' \+ [a-z]*ountry/.test(mpFn), false, 'CD2: no country suffix appended to the label');
eq(/labelCount\[o\.label\] > 1/.test(mpFn), true, 'CD2: company hint appended ONLY on same-country display-name collision');

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'ALL PASS'));
process.exit(fail ? 1 : 0);
