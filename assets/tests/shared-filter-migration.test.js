// System Repair 2 — Part D: shared searchable multi-select filter (KM.ui.multiFilter).
// (1) Contract guards over the ONE shared component (multi-select-filter.js): Search + Select All +
//     Clear + scrollable checkbox list + outside-click / Esc + idempotent create() + aria.
// (2) Migration guards: pages that were converted to the shared component actually use it (no leftover
//     native <select> filter), state is a multi-value array, and the query is an OR-set membership test.
// Pure Node source-scan (the DOM behavior itself is BROWSER-UNVERIFIED). Run:
//   node assets/tests/shared-filter-migration.test.js
'use strict';
var fs = require('fs');
var path = require('path');
var fail = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else console.log('ok   ' + l); }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }

// ---- Part 1: the ONE shared component contract -----------------------------------------------------
console.log('\n-- shared component contract (multi-select-filter.js) --');
var comp = read('js/utils/multi-select-filter.js');
ok(/window\.KM\.ui\.multiFilter\s*=\s*\{\s*create/.test(comp), 'D1: exposes a single KM.ui.multiFilter.create component');
ok(/data-kmf-act="all"[\s\S]*Select All/.test(comp) && /data-kmf-act="clear"[\s\S]*Clear/.test(comp), 'D2: Select All + Clear controls');
ok(/class="kmf-search"/.test(comp), 'D3: searchable (search input)');
ok(/type="checkbox"/.test(comp) && /class="kmf-list" role="listbox"/.test(comp), 'D4: scrollable checkbox option list');
ok(/Escape/.test(comp) && /_close\(\)/.test(comp), 'D5: Esc + outside-click close (one global handler)');
ok(/if \(mount\.__kmfCtl\)/.test(comp), 'D6: idempotent create() reuses the instance (no duplicate panels/listeners on rerender)');
ok(/aria-expanded/.test(comp) && /aria-controls/.test(comp) && /aria-multiselectable/.test(comp), 'D7: aria-expanded / aria-controls / listbox semantics');

// ---- Part 2: sku-regional-details migrated (native <select> → shared) ------------------------------
console.log('\n-- sku-regional-details migration (Category / Series) --');
var srdHtml = read('html/pages/sku-regional-details.html');
var srdJs = read('js/pages/sku-regional-details.js');
ok(!/<select id="srd-f-category"/.test(srdHtml) && !/<select id="srd-f-series"/.test(srdHtml), 'D8: the native <select> Category/Series filters are GONE from the toolbar');
ok(/id="srd-f-category-mount"/.test(srdHtml) && /id="srd-f-series-mount"/.test(srdHtml), 'D9: shared-filter mount points present');
ok(/KM\.ui\.multiFilter\.create\(/.test(srdJs), 'D10: filters created via the shared component');
ok(/filters:\s*\{\s*category:\s*\[\],\s*series:\s*\[\]\s*\}/.test(srdJs), 'D11: filter state is a multi-value array ([] = All)');
ok(/f\.category\.length && f\.category\.map\(lc\)\.indexOf\(lc\(e\.category\)\) === -1/.test(srdJs), 'D12: query is an OR-set membership test (preserves boundary; empty = All, §15)');
ok(/onChange: function \(vals\) \{ onFilterChange\(name, vals\); \}/.test(srdJs), 'D13: selection reported through onChange into the existing page state');

// ---- Part 3: previously-migrated pages still on the shared component (no regression) ---------------
console.log('\n-- prior migrations intact --');
ok(/KM\.ui\.multiFilter\.create/.test(read('js/pages/forecast.js')), 'D14: forecast.js still uses the shared component');
ok(/KM\.ui\.multiFilter\.create/.test(read('js/pages/sku-handbook.js')), 'D15: sku-handbook.js still uses the shared component');

// ---- Part 4: UI Small Fix Round — Forecast Management + Inventory Replenishment common-filter adoption
//      + shared filter-bar CSS owner (base.css tokens + components.css .km-filter-bar). Source-scan only;
//      pixel / computed styles remain BROWSER-UNVERIFIED. -----------------------------------------------
console.log('\n-- common-filter adoption: Forecast + Inventory Replenishment + shared owner --');
var baseCss = read('css/base.css');
var compCss = read('css/components.css');
var fcOverviewCss = read('css/pages/fc-overview.css');
var fcSummaryHtml = read('html/pages/fc-summary.html');
var forecastHtml = read('html/pages/forecast.html');
var forecastJs = read('js/pages/forecast.js');
var irHtml = read('html/pages/inventory-replenishment.html');
var irCss = read('css/pages/inventory-replenishment.css');

// Shared owner (single source of truth) — base.css tokens + components.css .km-filter-bar rule.
ok(/--filter-label-font-size:\s*12px/.test(baseCss) && /--filter-label-color:\s*#64748b/i.test(baseCss), 'D16: base.css owns the filter-label design tokens (--filter-label-font-size / --filter-label-color)');
ok(/\.km-filter-bar\s+\.filter-group\s+label\s*\{[^}]*var\(--filter-label-font-size\)[^}]*var\(--filter-label-color\)/.test(compCss), 'D17: components.css .km-filter-bar .filter-group label = single owner of the filter-label spec (via tokens)');

// All three bars opt into the ONE shared contract.
ok(/class="fc-filter-bar km-filter-bar"/.test(fcSummaryHtml), 'D18: FC Summary bar carries the shared km-filter-bar class');
ok(/class="forecast-filters km-filter-bar"/.test(forecastHtml), 'D19: Forecast bar carries km-filter-bar');
ok(/class="replen-filters km-filter-bar"/.test(irHtml), 'D20: Inventory Replenishment bar carries km-filter-bar');

// Forecast: shared .filter-group wrappers (old page wrappers gone) + data-driven options + no dead legacy.
ok(/class="filter-group filter-group--dropdown"/.test(forecastHtml) && !/class="forecast-filter forecast-filter--dropdown"/.test(forecastHtml), 'D21: Forecast dropdown groups use shared .filter-group / --dropdown');
ok(!/\.forecast-filter\s*\{/.test(fcOverviewCss) && !/\.forecast-filter\s+label\s*\{/.test(fcOverviewCss), 'D22: page-scoped .forecast-filter control/label duplicate rules removed from fc-overview.css');
ok(/_forecastFilterUniverse/.test(forecastJs) && /getForecastRows/.test(forecastJs), 'D23: Forecast options derived from the active dataset (getForecastRows), not a static list');
ok(!/var FORECAST_FILTER_OPTS\s*=/.test(forecastJs), 'D24: static FORECAST_FILTER_OPTS hardcoded option arrays removed (no static/demo options)');
ok(!/function initForecastDropdowns/.test(forecastJs) && !/function toggleForecastAll/.test(forecastJs), 'D25: dead legacy forecast-dropdown JS (second filter implementation) removed');

// Inventory Replenishment: shared classes + native single-select + Search gating preserved (visual-only).
ok(/class="filter-group"/.test(irHtml) && !/replen-filter-group/.test(irHtml), 'D26: IR filter groups use shared .filter-group (page-scoped .replen-filter-group gone from markup)');
ok(/<select id="replenCountry">/.test(irHtml) && /<select id="replenMarketplace">/.test(irHtml), 'D27: IR keeps native single-select Country/Marketplace (single-select preserved)');
ok(/searchReplenishment\(\)/.test(irHtml), 'D28: IR Search button retained (loads only after Country + Marketplace + Search)');
ok(!/\.replen-filter-group\s*\{/.test(irCss) && !/\.replen-filter-group\s+(select|label|input)/.test(irCss), 'D29: page-scoped .replen-filter-group control/label duplicate rules removed from inventory-replenishment.css');

// FC Summary: redundant page-scoped label override removed (shared owner is canonical; appearance same).
ok(!/#fc-summary-section \.filter-group label\s*\{/.test(fcOverviewCss), 'D30: redundant #fc-summary-section .filter-group label override removed (shared owner canonical)');

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'ALL PASS'));
process.exit(fail ? 1 : 0);
