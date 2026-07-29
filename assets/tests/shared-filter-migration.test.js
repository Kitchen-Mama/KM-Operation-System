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

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'ALL PASS'));
process.exit(fail ? 1 : 0);
