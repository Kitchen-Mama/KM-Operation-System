// Inventory Replenishment — header colspan alignment (A1), SKU chevron / gear removal / whole-row toggle
// (A2), left/right second-layer sync (A3), Planning Model rename (A5), Category-tab + More Options parity
// (A4 / A6), and marketplace label (Canonical Decision 2). Pure Node source-scan + pure-logic mirrors
// (no DOM). Run: node assets/tests/replen-header-toggle.test.js
'use strict';
var fs = require('fs');
var path = require('path');
var fail = 0, pass = 0;
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; console.log('ok   ' + l); } }
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }

var html = fs.readFileSync(path.join(__dirname, '..', 'html', 'pages', 'inventory-replenishment.html'), 'utf8');
var js = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'inventory-replenishment.js'), 'utf8');
var css = fs.readFileSync(path.join(__dirname, '..', 'css', 'pages', 'inventory-replenishment.css'), 'utf8');

// ============================================================================
// A1 — Header group colspans + leaf sequence (source-scan the HTML) + CSS widths + body-cell order.
// ============================================================================
// S8-R48-J — STRUCTURAL, FAIL-CLOSED EXTRACTION.
//
// The previous version read the leaf row with /<div class="km-table__header-cell">([^<]+)<\/div>/g —
// the BARE class only — on the stated assumption that "group cells always add a --modifier, so a
// global scan yields exactly the leaves". That assumption stopped being true when the Current Stock
// LEAF gained `--current-stock` so CSS could hide it for Self-Fulfilled sites (D3). The regex then
// silently returned 9 leaves instead of 10, shifted every index after it, and failed six assertions
// that were all one missing cell. A scan that cannot tell "absent" from "shaped differently" fails
// open, so the row is now isolated first and every cell inside it is taken, modifiers and all.
function headerRowBlock(src, level) {
    var marker = 'km-table__header-row--level' + level;
    var at = src.indexOf(marker);
    if (at === -1) throw new Error('FAIL-CLOSED: header row level' + level + ' not found');
    var open = src.lastIndexOf('<div', at);
    if (open === -1) throw new Error('FAIL-CLOSED: unanchored header row level' + level);
    var re = /<div\b|<\/div>/g; re.lastIndex = open;
    var depth = 0, m;
    while ((m = re.exec(src)) !== null) {
        if (m[0] === '</div>') { if (--depth === 0) return src.slice(open, m.index + 6); }
        else depth++;
    }
    throw new Error('FAIL-CLOSED: unbalanced header row level' + level);
}
// EVERY header cell in the row — modifier classes included. m[1] is whatever follows the base class.
function headerCells(block) {
    var out = [], re = /<div class="km-table__header-cell([^"]*)"([^>]*)>([^<]*)<\/div>/g, m;
    while ((m = re.exec(block)) !== null) out.push({ mods: m[1].trim(), attrs: m[2], text: m[3].trim() });
    return out;
}
var L1 = headerCells(headerRowBlock(html, 1));
var groups = L1.map(function (c) {
    var t = (c.mods.match(/km-table__header-cell--([a-z-]+)/) || [, ''])[1];
    var s = (c.attrs.match(/data-leaf-span="(\d+)"/) || [, ''])[1];
    return { type: t, span: parseInt(s, 10), text: c.text };
});

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

// Leaf (level-2) headers, taken structurally from the level-2 ROW so a modifier-bearing leaf counts.
var L2 = headerCells(headerRowBlock(html, 2));
var leaves = L2.map(function (c) { return c.text; });
// INVENTORY_TABLE_MAPPING_SPEC §13.2 (D1/D2, ratified S8-R48-J): canonical 10-leaf model.
// Order is stock-flow: Current Stock → 3rd Party Stock → On the Way. The FC leaf is the 90-day
// DISPLAY REFERENCE (§13.1) — Base FC Month+1..+3, no Target%; the runtime identifier forecast60d()
// is a legacy name and is deliberately not the contract.
var CANONICAL_LEAVES = ['Current Stock', '3rd Party Stock', 'On the Way', 'Avg. Sales/day',
    '90 days FC', 'Upcoming Event', 'Days of Supply', 'Suggested Qty', 'CN', 'TW'];
eq(leaves, CANONICAL_LEAVES, 'A1/D1/D2: canonical 10-leaf header sequence');
eq(leaves.length, 10, 'A1: exactly 10 leaves');
// The modifier-bearing leaf is PRESENT and still carries its hook (D3 needs the class to exist).
eq(L2[0].mods, 'km-table__header-cell--current-stock',
   'A1/D3: the Current Stock leaf is class-tagged — and is still counted as a leaf');
// The four data-leaf groups must span exactly the number of leaves, 1:1.
eq(spanByType.inventory + spanByType.sales + spanByType.replen + spanByType.factory, leaves.length,
   'A1: group leaf-spans sum to the leaf-column count');
// Group boundaries, derived from the spans rather than hand-indexed, so a span change moves them.
var bounds = {}, cur = 0;
['inventory', 'sales', 'replen', 'factory'].forEach(function (t) {
    bounds[t] = leaves.slice(cur, cur + spanByType[t]); cur += spanByType[t];
});
eq(bounds.inventory, ['Current Stock', '3rd Party Stock', 'On the Way'], 'A1/D2: Inventory group = the 3 stock-flow leaves, in order');
eq(bounds.sales, ['Avg. Sales/day', '90 days FC', 'Upcoming Event'], 'A1/D1: Sales group carries the 90-day FC reference');
eq(bounds.replen, ['Days of Supply', 'Suggested Qty'], 'A1: Replenishment spans exactly Days of Supply + Suggested Qty');
eq(bounds.factory, ['CN', 'TW'], 'A1: CN/TW are Factory Stock leaves — NOT under Replenishment');

// CSS width must equal colspan × 120px (240px for the 2-leaf groups).
var replenRule = (css.match(/\.km-table__header-cell--replen\s*\{[\s\S]*?\}/) || [''])[0];
eq(/width:\s*240px/.test(replenRule) && /min-width:\s*240px/.test(replenRule), true, 'A1: Replenishment group is 240px (2 × 120px)');
var factoryRule = (css.match(/\.km-table__header-cell--factory\s*\{[\s\S]*?\}/) || [''])[0];
eq(/width:\s*240px/.test(factoryRule) && /min-width:\s*240px/.test(factoryRule), true, 'A1: Factory Stock group is 240px (2 × 120px)');

// Body-cell order in renderReplenishment must line up 1:1 with the 10 leaves (after Planning Model /
// Company / Marketplace), i.e. the leaf fields appear in this exact sequence.
// F1-7N-FB-4E-R4B-R3 - the row is now built by a NAMED BUILDER rather than inline in renderReplenishment, so
// that one row which cannot be built fails closed on its own instead of aborting the map. (It had to move: an
// HTML comment inside the old template literal contained a backtick, which ended the literal early and left
// every emitted row inside an unterminated comment - the live "only the first row has values" symptom.) The
// leaf ORDER this section defends is unchanged; it is read from the builder.
// S8-R48-J — brace-matched, not pattern-to-the-first-newline-brace. A `\n}` terminator is a window
// by another name: it ends wherever the source happens to put a column-0 brace.
function extractFn(src, name) {
    var at = src.indexOf('function ' + name);
    if (at === -1) throw new Error('FAIL-CLOSED: fn not found: ' + name);
    var depth = 0, started = false;
    for (var i = at; i < src.length; i++) {
        var ch = src[i];
        if (ch === '{') { depth++; started = true; }
        else if (ch === '}') { depth--; if (started && depth === 0) return src.slice(at, i + 1); }
    }
    throw new Error('FAIL-CLOSED: unbalanced fn: ' + name);
}
var scrollTpl = extractFn(js, '_irScrollRowHtml_');
// F1-7N-UX-SITE-INVENTORY-INVENTORY-COLUMN-ORDER-R1 — Inventory reading order is now Current Stock → 3rd Party Stock
// → On the Way (stock-flow: exists now → external/self warehouses → still inbound); body order tracks the header 1:1.
var bodyLeafTokens = ['item.currentInventory', 'item.thirdPartyStock', 'item.onTheWay', 'item.avgDailySales',
    'item.forecast60d', 'item.upcomingEventQty', 'item.daysOfSupply', 'replen-suggested-cell', 'item.cnStock', 'item.twStock'];
var lastIdx = -1, ordered = true;
bodyLeafTokens.forEach(function (t) { var i = scrollTpl.indexOf(t); if (i === -1 || i < lastIdx) ordered = false; lastIdx = i; });
eq(ordered, true, 'A1: first-layer body cells line up 1:1 with the leaves (inventory→sales→replen→factory)');

// ============================================================================
// A2 — SKU chevron, gear removal, whole-row toggle guard.
// ============================================================================
var fixedTpl = (js.match(/function _irFixedRowHtml_[\s\S]*?\n}/) || [''])[0];
eq(/class="replen-row-chevron"/.test(fixedTpl), true, 'A2: chevron rendered in the fixed SKU column');
eq(/<button type="button" class="replen-row-chevron"/.test(fixedTpl), true, 'A2: chevron is a native <button>');
eq(/aria-expanded="false"/.test(fixedTpl), true, 'A2: chevron has aria-expanded');
// Anchored on the BINDING (the panel id comes from _irPanelId(item.sku)) rather than on the interpolation
// spelling, which is what changed when the row moved out of a template literal.
eq(/aria-controls="[^]{0,10}_irPanelId\(item\.sku\)/.test(fixedTpl), true, 'A2: chevron aria-controls points at the detail panel id');
eq(/aria-label="Toggle replenishment details for /.test(fixedTpl), true, 'A2: chevron has a descriptive aria-label');
eq(/onclick="_replenChevronClick\(event, /.test(fixedTpl), true, 'A2: chevron wired to _replenChevronClick');
// The detail panel carries that id so aria-controls resolves.
eq(/replen-expand-panel--scroll" id="\$\{_irPanelId\(sku\)\}"/.test(js), true, 'A2: detail panel gets the matching id');
// Gear fully removed (DOM + tooltip).
eq(/planned-qty-config-btn/.test(js) || /planned-qty-config-btn/.test(css), false, 'A2: gear button (planned-qty-config-btn) removed from JS + CSS');
eq(/Configure shipping allocation/.test(js), false, 'A2: gear tooltip removed');
// Suggested Qty cell shows the value only.
// S8-R48-J — the markup moved out of the row builder into _irSuggestedCellHtml, so asserting it
// against the row builder asserted nothing: `replen-suggested-cell__value` simply was not there any
// more and the check failed while the product contract held. Follow the delegation instead.
eq(/replen-suggested-cell">'\s*\+\s*_irSuggestedCellHtml\(item\)/.test(scrollTpl), true,
   'A2: the Suggested Qty cell delegates to _irSuggestedCellHtml');
var sugFn = extractFn(js, '_irSuggestedCellHtml');
eq(/replen-suggested-cell__value/.test(sugFn), true, 'A2: ... which renders the value/status span');
eq(/<button/i.test(sugFn), false, 'A2: ... with NO button in the Suggested Qty cell');
eq(/onclick|addEventListener/i.test(sugFn), false, 'A2: ... and no inline handler either');
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
// A4 — Category selector is a SINGLE compact page-scoped shell + rail with INDEPENDENT replen-category-*
// classes (UI Runtime Small Repair Round 3, 2026-07-30). It NO LONGER uses the shared km-tab-rail /
// km-category-card component (that dependency was the Round 2 approach and is removed for full class
// ownership). The rail is still behavior-enhanced by the class-agnostic KM.ui.tabRail helper (wheel/
// keyboard scroll only — no styling/selection ownership). Active-tab blue (#3B82F6) comes from the
// page-scoped .replen-category-rail__tab.is-active rule in inventory-replenishment.css.
// ============================================================================
eq(/class="replen-category-rail" id="replenCategoryTabs"/.test(html), true, 'A4: category container uses the OWN .replen-category-rail (not km-tab-rail)');
eq(/km-tab-rail/.test(html.replace(/<!--[\s\S]*?-->/g, '')), false, 'A4: markup no longer uses the shared km-tab-rail class');
eq(/replen-category-rail__tab/.test(js) && /replen-category-rail__count/.test(js), true, 'A4: tabs render with the OWN .replen-category-rail__tab / __count classes');
eq(/KM\.ui\.tabRail\.enhance/.test(js) && /scrollActiveIntoView/.test(js), true, 'A4: rail still wired to KM.ui.tabRail (behavior-only wheel/keyboard scroll)');
eq(/replen-category-more|_replenLayoutCategoryOverflow|More Categories/.test(js), false, 'A4: old "More Categories" overflow mode removed');
eq(/#ops-section \.replen-category-shell/.test(css) && /#ops-section \.replen-category-rail/.test(css), true, 'A4: page-scoped shell + rail CSS present (own styling, not km-category-card)');

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

// ============================================================================
// A7 — D3: the Self-Fulfilled visibility exception (INVENTORY_TABLE_MAPPING_SPEC §13.2).
// ============================================================================
// VISUAL, NOT STRUCTURAL. The column is hidden with CSS; the header leaf and the body cell both stay
// in the DOM, and `data-leaf-span` is NOT rewritten — it is the STRUCTURAL body-cell count the render
// integrity validator reads. Writing 2 there once made a self_fulfilled scope declare 13 cells while
// rendering 14, failing every row on US/Shopify and US/Target. Eligibility comes from the canonical
// fulfillment_model; no marketplace is named here, and none may be.
// Loaded through `new Function` rather than eval: this file is 'use strict', where an eval'd
// declaration stays inside the eval's own scope and never reaches the assertions below.
var COLUMN_MODEL_SRC = extractFn(js, '_irInventoryColumnModel');
var _irInventoryColumnModel = new Function(COLUMN_MODEL_SRC + '; return _irInventoryColumnModel;')();

var SELF = _irInventoryColumnModel('self_fulfilled');
var PLAT = _irInventoryColumnModel('platform_fulfilled');
eq(SELF.hideCurrentStock, true, 'A7/D3: a qualifying Self-Fulfilled site hides Current Stock');
eq(SELF.columns, ['thirdPartyStock', 'onTheWay'], 'A7/D3: ... leaving 3rd Party Stock → On the Way, in canonical order');
eq(PLAT.hideCurrentStock, false, 'A7/D3: a non-qualifying (platform) site KEEPS Current Stock');
eq(_irInventoryColumnModel('hybrid').hideCurrentStock, false, 'A7/D3: hybrid is non-qualifying — full structure');
eq(_irInventoryColumnModel('').hideCurrentStock, false, 'A7/D3: an unresolved scope FAILS SAFE to the full structure');
eq(_irInventoryColumnModel('SELF_FULFILLED').hideCurrentStock, true, 'A7/D3: eligibility is the canonical value, case-insensitive — never a platform name');
eq(/shopify|target|amazon/i.test(extractFn(js, '_irInventoryColumnModel')), false, 'A7/D3: no marketplace is hardcoded in the eligibility rule');

// The logical column model is PRESERVED while hidden: the body still emits the cell unconditionally…
eq(/replen-cell--current-stock/.test(scrollTpl) && /item\.currentInventory/.test(scrollTpl), true,
   'A7/D3: the body ALWAYS emits the Current Stock cell (hidden ≠ removed)');
// …the apply step must not rewrite the structural span…
var applyFn = extractFn(js, '_irApplyInventoryColumnModel');
eq(/ir-hide-current-stock/.test(applyFn), true, 'A7/D3: one container class drives the hiding');
eq(/setAttribute\(\s*['"]data-leaf-span['"]/.test(applyFn), false,
   'A7/D3: data-leaf-span is NOT rewritten when the column hides — the structural count stays true');
eq(spanByType.inventory, 3, 'A7/D3: the declared Inventory span stays 3 in the markup');
// …and ONE class hides the header leaf and the body cell together, so the two rows cannot drift.
eq(/\.ir-hide-current-stock[^{]*\.km-table__header-cell--current-stock[^{]*\{[^}]*display:\s*none/.test(css)
   || /\.ir-hide-current-stock[\s\S]{0,200}?\.replen-cell--current-stock\s*\{[^}]*display:\s*none/.test(css), true,
   'A7/D3: header leaf + body cell are hidden by the SAME container class');
// Both declarations, checked separately: `[^}]*width:` also matches `min-width:`, so a single loose
// test would pass on a rule that shrank only one of them and still rendered misaligned.
function hideInventoryRule(c) {
    var m = c.match(/\.ir-hide-current-stock\s+\.km-table__header-cell--inventory\s*\{[^}]*\}/);
    if (!m) throw new Error('FAIL-CLOSED: the hidden-state Inventory group rule is missing');
    return m[0];
}
var HIDE_RULE = hideInventoryRule(css);
eq(/[^-]width:\s*240px/.test(HIDE_RULE) && /min-width:\s*240px/.test(HIDE_RULE), true,
   'A7/D3: the Inventory GROUP shrinks 360→240 (width AND min-width) so downstream groups stay aligned');

// ============================================================================
// §X — NEGATIVE MUTANTS. Every repair above must be able to fail.
// ============================================================================
// Each mutant edits an in-memory copy of the real source and re-runs the ONE check it should break.
// A thrown error counts as a kill ONLY for the fail-closed extractors, where throwing IS the contract;
// everywhere else a crash is reported as a crash, because a check that explodes proves nothing.
var mutants = 0, survived = 0;
function mutant(label, probe) {
    mutants++;
    var detected = false, crashed = null;
    try { detected = probe(); } catch (e) { crashed = e; }
    if (crashed) { detected = /FAIL-CLOSED/.test(String(crashed.message)); if (!detected) { survived++; fail++; console.error('FAIL X' + mutants + ' CRASHED (not a kill) — ' + label + ' — ' + crashed.message); return; } }
    if (!detected) { survived++; fail++; console.error('FAIL X' + mutants + ' SURVIVED — ' + label); }
    else console.log('ok   X' + mutants + ' killed — ' + label);
}
function leavesOf(h) { return headerCells(headerRowBlock(h, 2)).map(function (c) { return c.text; }); }
function spansOf(h) {
    var by = {}; headerCells(headerRowBlock(h, 1)).forEach(function (c) {
        var t = (c.mods.match(/km-table__header-cell--([a-z-]+)/) || [, ''])[1];
        by[t] = parseInt((c.attrs.match(/data-leaf-span="(\d+)"/) || [, ''])[1], 10);
    }); return by;
}

// X1 — the exact defect this round repaired: the modifier-bearing leaf dropped from the row.
mutant('the modifier-bearing Current Stock leaf is omitted', function () {
    var h = html.replace('<div class="km-table__header-cell km-table__header-cell--current-stock">Current Stock</div>', '');
    return JSON.stringify(leavesOf(h)) !== JSON.stringify(CANONICAL_LEAVES);
});
// X2 — D2 violated: Inventory columns reordered.
mutant('Inventory columns reordered (On the Way before 3rd Party Stock)', function () {
    // Whitespace-agnostic and fail-closed: a literal CRLF swap would quietly become a no-op the day
    // the markup is reindented, and a mutation that does nothing looks exactly like a passing test.
    var re = /(<div class="km-table__header-cell">)3rd Party Stock(<\/div>)(\s*)(<div class="km-table__header-cell">)On the Way(<\/div>)/;
    if (!re.test(html)) throw new Error('FAIL-CLOSED: the adjacent 3rd Party / On the Way leaves were not found');
    var h = html.replace(re, function (_m, a, b, ws, c, d) { return a + 'On the Way' + b + ws + c + '3rd Party Stock' + d; });
    return JSON.stringify(leavesOf(h)) !== JSON.stringify(CANONICAL_LEAVES);
});
// X3 — group spans no longer sum to the leaves.
mutant('group-span mismatch (Replenishment widened to 3)', function () {
    var h = html.replace('km-table__header-cell--replen" data-leaf-span="2"', 'km-table__header-cell--replen" data-leaf-span="3"');
    var s = spansOf(h);
    return (s.inventory + s.sales + s.replen + s.factory) !== leavesOf(h).length;
});
// X3b — and the boundary moves with it: CN would fall inside Replenishment.
mutant('a widened Replenishment span pulls CN out of Factory Stock', function () {
    var h = html.replace('km-table__header-cell--replen" data-leaf-span="2"', 'km-table__header-cell--replen" data-leaf-span="3"');
    var s = spansOf(h), lv = leavesOf(h), c = s.inventory + s.sales;
    return JSON.stringify(lv.slice(c, c + s.replen)) !== JSON.stringify(['Days of Supply', 'Suggested Qty']);
});
// X4 — D1 reverted: the display reference relabelled to the pre-R7 horizon.
mutant('90 days FC reverted to 60 days FC', function () {
    var h = html.replace('>90 days FC<', '>60 days FC<');
    return JSON.stringify(leavesOf(h)) !== JSON.stringify(CANONICAL_LEAVES);
});
// X5 — a button comes back into the Suggested Qty cell.
mutant('a button is injected into the Suggested Qty cell', function () {
    var mutated = sugFn.replace("return '<span class=\"replen-suggested-cell__value\">'",
                                "return '<button type=\"button\" onclick=\"x()\"></button><span class=\"replen-suggested-cell__value\">'");
    if (mutated === sugFn) throw new Error('mutation anchor absent in _irSuggestedCellHtml');
    return /<button/i.test(mutated) || /onclick/i.test(mutated);
});
// X6 — D3 inverted: a qualifying Self-Fulfilled site keeps Current Stock visible.
mutant('Current Stock stays VISIBLE for a qualifying Self-Fulfilled site', function () {
    var src = extractFn(js, '_irInventoryColumnModel').replace("=== 'self_fulfilled'", "=== '__never__'");
    var M = new Function(src + '; return _irInventoryColumnModel;')();
    return M('self_fulfilled').hideCurrentStock !== true;
});
// X7 — D3 over-applied: a non-qualifying site loses Current Stock.
mutant('Current Stock hidden for a NON-qualifying (platform) site', function () {
    var src = extractFn(js, '_irInventoryColumnModel').replace("=== 'self_fulfilled'", "!== '__never__'");
    var M = new Function(src + '; return _irInventoryColumnModel;')();
    return M('platform_fulfilled').hideCurrentStock !== false;
});
// X8 — hidden becomes REMOVED: the structural count is rewritten, which is the Production bug.
mutant('the logical column structure is removed instead of visually hidden', function () {
    var mutated = applyFn.replace('var m = _irInventoryColumnModel(fulfillmentModel);',
        "var m = _irInventoryColumnModel(fulfillmentModel); if (tbl) tbl.querySelector('x').setAttribute('data-leaf-span', m.inventoryLeafSpan);");
    if (mutated === applyFn) throw new Error('mutation anchor absent in _irApplyInventoryColumnModel');
    return /setAttribute\(\s*['"]data-leaf-span['"]/.test(mutated);
});
// X9 — alignment broken: the group no longer shrinks with the hidden leaf.
mutant('header/body alignment broken (Inventory group keeps 360px while a leaf is hidden)', function () {
    var r = hideInventoryRule(css);
    var mutatedRule = r.replace(/240px/g, '360px');
    if (mutatedRule === r) throw new Error('FAIL-CLOSED: no width to mutate in the hidden-state rule');
    return !(/[^-]width:\s*240px/.test(mutatedRule) && /min-width:\s*240px/.test(mutatedRule));
});
// X10b — and shrinking only ONE of the two is still misaligned, which the old loose test allowed.
mutant('only min-width shrinks — the group still renders 360px wide', function () {
    var mutatedRule = hideInventoryRule(css).replace(/([^-])width:\s*240px/, '$1width: 360px');
    return !(/[^-]width:\s*240px/.test(mutatedRule) && /min-width:\s*240px/.test(mutatedRule));
});
// X10 — the body stops emitting the hidden cell, so hiding really would remove data.
mutant('the body stops emitting the Current Stock cell', function () {
    var t = scrollTpl.replace(/<div class="scroll-cell replen-cell--current-stock">'[^;]*?\+\s*'<\/div>'\s*\+/, '');
    if (t === scrollTpl) t = scrollTpl.replace('replen-cell--current-stock', 'replen-cell--removed');
    return !(/replen-cell--current-stock/.test(t) && /item\.currentInventory/.test(t));
});

ok(mutants >= 9, 'X' + (mutants + 1) + ' the mutant set is non-empty (' + mutants + ' mutants) — not vacuous');

// S8-R48-J — a NUMERIC summary. "ALL PASS" carries no count, so this suite could never be verified
// as having run anything; it sat in the unverifiable 39 for exactly that reason.
console.log('\n' + (fail ? 'FAIL' : 'PASS') + '  ' + pass + ' passed, ' + fail + ' failed, '
    + mutants + ' mutants, ' + survived + ' survived, ' + (mutants >= 9 ? 'vacuity clean' : 'VACUOUS'));
process.exit(fail ? 1 : 0);
