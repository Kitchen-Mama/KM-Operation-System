// UI Runtime Small Repair Round 3 — Repair C: FC Summary → shared KM.ui.multiFilter.
// Mixes SOURCE-CONTRACT scans (owner migration + verified NON-CASCADING design) with EXECUTABLE predicate
// tests: the real filterFcRegular() / filterFcEvent() are extracted from source and run against fixtures
// to prove positive-inclusion OR-within / AND-across / none=show-nothing semantics. Browser acceptance
// remains USER PENDING.
//
// NOTE on cascading: the Round 3 instruction assumed FC Summary had cascading to preserve. The VERIFIED
// current code is deliberately NON-CASCADING (faceted narrowing was removed as a canonical decision — see
// fc-summary.js comment + FC_SUMMARY_SPEC §13 / DATABASE_RELATIONSHIP_MAP §13). These tests therefore
// assert the migration PRESERVES the full-option-set (non-cascading) behavior exactly, and never
// re-introduces faceting. See the completion report §16.
// Run: node assets/tests/fc-summary-multiselect.test.js
'use strict';
var fs = require('fs');
var path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; console.log('ok   ' + l); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }

var html = read('html/pages/fc-summary.html');
var js = read('js/pages/fc-summary.js');

function extractFn(src, name) {
  var re = new RegExp('function ' + name + '\\s*\\(([^)]*)\\)\\s*\\{');
  var m = re.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  var i = src.indexOf('{', m.index), depth = 0, end = -1;
  for (var k = i; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) { end = k; break; } }
  }
  return new Function(m[1], src.slice(i + 1, end));
}

console.log('\n-- C1: HTML — every fc-dropdown panel replaced by a shared-component mount --');
['company', 'marketplace', 'country', 'category', 'series', 'event'].forEach(function (k) {
  ok(new RegExp('id="fc-f-' + k + '-mount"').test(html), 'C1: mount present — ' + k);
});
ok(!/fc-dropdown-trigger/.test(html) && !/fc-dropdown-panel/.test(html) && !/fc-checkbox-item/.test(html),
   'C2: old fc-dropdown trigger/panel/checkbox DOM removed from HTML');
ok(/id="fc-year-select"/.test(html) && /id="fc-sku-input"/.test(html), 'C3: Year <select> + SKU free-text unchanged (not migrated)');

console.log('\n-- C4: single owner — KM.ui.multiFilter, array state, no old checkbox owners --');
ok(/KM\.ui\.multiFilter\.create\(/.test(js), 'C4: filters created via KM.ui.multiFilter.create');
ok(/fcFilterState = \{ company: \[\], marketplace: \[\], country: \[\], category: \[\], series: \[\], event: \[\] \}/.test(js),
   'C5: multi-value array state for all six dimensions');
ok(/emptyMeansAll: false/.test(js), 'C6: positive-inclusion semantics (emptyMeansAll:false — none = show nothing)');
ok(!/function toggleFcAll/.test(js) && !/function updateFcFilter\b/.test(js) && !/function updateFcFilterText/.test(js),
   'C7: old toggleFcAll / updateFcFilter / updateFcFilterText owners removed');
ok(!/function _rebuildFcPanel\b/.test(js), 'C8: old _rebuildFcPanel owner removed');
ok(/companies: fcFilterState\.company\.slice\(\)/.test(js), 'C9: getFcFilters reads the shared-component state (not DOM checkboxes)');
ok(/onChange: function \(vals\) \{\s*fcFilterState\[key\] = vals;/.test(js), 'C10: onChange writes selection into the single state');
ok(/mount\.__kmfCtl\.getSelected\(\)/.test(js), 'C11: state re-synced after setOptions prunes invalid selections');

console.log('\n-- C12: NON-CASCADING preserved — each dimension = full distinct set from the dataset --');
ok(/NON-CASCADING|non-cascading/i.test(js), 'C12: non-cascading design documented in source');
ok(!/function _fcCascadeFilters|function _rebuildFcPanelChecked/.test(js), 'C13: no faceted-cascade recompute functions defined (re-introduced)');
// _fcSyncFilterOptions derives each dimension from the FULL active dataset (regular/events), independent
// of other selections — i.e., option universes do not depend on the current selection of another filter.
ok(/function _fcSyncFilterOptions\(\)/.test(js), 'C14: _fcSyncFilterOptions builds option universes once per load');
ok(/distinct\(\(regular \|\| \[\]\)\.map\(function \(r\) \{ return r\.company; \}\)\)/.test(js),
   'C15: Company options = full distinct set of the dataset (not narrowed by other filters)');

console.log('\n-- C16..: EXECUTABLE predicate — filterFcRegular positive-inclusion OR/AND/none --');
var filterFcRegular = extractFn(js, 'filterFcRegular');
var filterFcEvent = extractFn(js, 'filterFcEvent');
var R = [
  { year: 2026, company: 'ResUS', marketplace: 'Amazon', country: 'US', category: 'Manual Opener', series: 'MO5600', sku: 'MO-1' },
  { year: 2026, company: 'ResTW', marketplace: 'Shopify', country: 'CA', category: 'Silicone Product', series: 'SP3120', sku: 'SP-1' },
  { year: 2026, company: 'ResUS', marketplace: 'Amazon', country: 'CA', category: 'Manual Opener', series: 'MO5600', sku: 'MO-2' }
];
var ALL = { year: '2026', companies: ['ResUS', 'ResTW'], marketplaces: ['Amazon', 'Shopify'], countries: ['US', 'CA'], categories: ['Manual Opener', 'Silicone Product'], series: ['MO5600', 'SP3120'], events: [], sku: '' };
function rids(list) { return list.map(function (r) { return r.sku; }).sort().join(','); }

ok(rids(filterFcRegular(R, ALL)) === 'MO-1,MO-2,SP-1', 'C16: all dimensions fully selected → all rows');
// none selected in a dimension → show nothing (positive-inclusion).
var noneCo = Object.assign({}, ALL, { companies: [] });
ok(filterFcRegular(R, noneCo).length === 0, 'C17: empty company selection → show nothing (none = none, NOT all)');
// OR within company.
var onlyResTW = Object.assign({}, ALL, { companies: ['ResTW'] });
ok(rids(filterFcRegular(R, onlyResTW)) === 'SP-1', 'C18: Company OR-set [ResTW] only');
// AND across company + country: ResUS AND US → MO-1 only.
var resusUs = Object.assign({}, ALL, { companies: ['ResUS'], countries: ['US'] });
ok(rids(filterFcRegular(R, resusUs)) === 'MO-1', 'C19: Company AND Country (cross-filter AND)');
// OR within country with single company: ResUS AND (US OR CA) → MO-1, MO-2.
var resusUsCa = Object.assign({}, ALL, { companies: ['ResUS'] });
ok(rids(filterFcRegular(R, resusUsCa)) === 'MO-1,MO-2', 'C20: Country OR-set within a single company');
// SKU contains ANDs.
ok(rids(filterFcRegular(R, Object.assign({}, ALL, { sku: 'mo-1' }))) === 'MO-1', 'C21: SKU contains ANDs with the dimension filters');
// Year mismatch removes all.
ok(filterFcRegular(R, Object.assign({}, ALL, { year: '2025' })).length === 0, 'C22: year filter excludes non-matching year');

console.log('\n-- C23: EXECUTABLE predicate — filterFcEvent uses events list membership --');
var E = [
  { year: 2026, company: 'ResUS', marketplace: 'Amazon', country: 'US', event: 'Prime Day', sku: 'EV-1' },
  { year: 2026, company: 'ResUS', marketplace: 'Amazon', country: 'US', event: 'BFCM', sku: 'EV-2' }
];
var EF = Object.assign({}, ALL, { events: ['Prime Day', 'BFCM'] });
ok(filterFcEvent(E, EF).length === 2, 'C23: both events selected → both rows');
ok(rids(filterFcEvent(E, Object.assign({}, EF, { events: ['BFCM'] }))) === 'EV-2', 'C24: Event OR-set [BFCM] only');
ok(filterFcEvent(E, Object.assign({}, EF, { events: [] })).length === 0, 'C25: empty event selection → show nothing');

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'ALL PASS') + ' (' + pass + ' assertions)');
process.exit(fail ? 1 : 0);
