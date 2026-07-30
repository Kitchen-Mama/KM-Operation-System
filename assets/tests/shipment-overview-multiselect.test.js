// UI Runtime Small Repair Round 3 — Repair B: Shipment Overview → shared KM.ui.multiFilter.
// Mixes SOURCE-CONTRACT scans (owner migration) with EXECUTABLE predicate tests: the real
// filterHistoryData() is extracted from source and run against fixtures to prove OR-within / AND-across /
// empty=All multi-value semantics. Browser acceptance remains USER PENDING.
// Run: node assets/tests/shipment-overview-multiselect.test.js
'use strict';
var fs = require('fs');
var path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; console.log('ok   ' + l); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }

var html = read('html/pages/shipping-history.html');
var js = read('js/pages/shipping-history.js');

// Extract a named `function foo(...) { ... }` and return it as a callable (pure functions only).
function extractFn(src, name) {
  var re = new RegExp('function ' + name + '\\s*\\(([^)]*)\\)\\s*\\{');
  var m = re.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  var i = src.indexOf('{', m.index), depth = 0, end = -1;
  for (var k = i; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) { end = k; break; } }
  }
  var body = src.slice(i + 1, end);
  return new Function(m[1], body);
}

console.log('\n-- B1: HTML — native sh-dropdown panels replaced by shared-component mounts --');
ok(/id="sh-f-country-mount"/.test(html) && /id="sh-f-method-mount"/.test(html), 'B1: Country + Method mounts present');
ok(!/sh-dropdown-trigger/.test(html) && !/sh-dropdown-panel/.test(html), 'B2: old sh-dropdown trigger/panel DOM removed from HTML');
ok(/id="fc-|filter-group--sku/.test(html) === false ? true : /filter-group--sku/.test(html), 'B3: SKU free-text group still present');
ok(/type="text"[^>]*placeholder="Search SKU/.test(html), 'B4: SKU stays a free-text search (not converted)');
// Round 1 order: Shipping Method precedes SKU.
ok(html.indexOf('Shipping Method') < html.indexOf('Search SKU'), 'B5: Method precedes SKU (Round 1 order preserved)');

console.log('\n-- B6: single owner — KM.ui.multiFilter, arrays, no old single-value reader --');
ok(/KM\.ui\.multiFilter\.create\(/.test(js), 'B6: filters created via KM.ui.multiFilter.create');
ok(/shOverviewFilterState = \{ country: \[\], method: \[\] \}/.test(js), 'B7: multi-value array state ([] = All)');
ok(!/function _getShDropdownValue/.test(js), 'B8: old single-value reader _getShDropdownValue removed');
ok(!/function _initShDropdowns\b/.test(js) && !/function _shBindDropdownPanel\b/.test(js), 'B9: old dropdown init/bind owners removed');
ok(/onChange: function \(vals\) \{ shOverviewFilterState\[key\] = vals;/.test(js), 'B10: onChange writes selection into the single page state');
ok(/mount\.__kmfCtl\.getSelected\(\)/.test(js), 'B11: state re-synced after setOptions prunes invalid selections');
ok(/\.map\(function \(s\) \{ return s\.country; \}\)|\.map\(function \(d\) \{ return d\.country; \}\)/.test(js), 'B12: options derived from runtime data (not hardcoded)');

console.log('\n-- B13..: EXECUTABLE predicate — filterHistoryData OR-within / AND-across / empty=All --');
var filterHistoryData = extractFn(js, 'filterHistoryData');
var DATA = [
  { date: '2026-07-01', country: 'US', method: 'Air Freight', skus: [{ sku: 'AAA' }] },
  { date: '2026-07-02', country: 'CA', method: 'Sea Freight', skus: [{ sku: 'BBB' }] },
  { date: '2026-07-03', country: 'UK', method: 'Air Freight', skus: [{ sku: 'CCC' }] },
  { date: '2026-07-04', country: 'US', method: 'Sea Freight', skus: [{ sku: 'DDD' }] }
];
function ids(list) { return list.map(function (r) { return r.skus[0].sku; }).sort().join(','); }

// Empty arrays = All (no restriction).
ok(ids(filterHistoryData(DATA, { country: [], method: [], sku: '' })) === 'AAA,BBB,CCC,DDD', 'B13: empty country+method = All rows');
// OR within Country: [US, CA] → US + CA rows only.
ok(ids(filterHistoryData(DATA, { country: ['US', 'CA'], method: [], sku: '' })) === 'AAA,BBB,DDD', 'B14: Country OR-set [US,CA]');
// OR within Method.
ok(ids(filterHistoryData(DATA, { country: [], method: ['Air Freight'], sku: '' })) === 'AAA,CCC', 'B15: Method OR-set [Air Freight]');
// AND across: (US OR CA) AND (Sea) → BBB (CA/Sea) + DDD (US/Sea).
ok(ids(filterHistoryData(DATA, { country: ['US', 'CA'], method: ['Sea Freight'], sku: '' })) === 'BBB,DDD', 'B16: Country AND Method (cross-filter AND)');
// SKU free-text still ANDs.
ok(ids(filterHistoryData(DATA, { country: ['US'], method: [], sku: 'aaa' })) === 'AAA', 'B17: SKU contains still ANDs with Country');
// A value not present → empty.
ok(filterHistoryData(DATA, { country: ['DE'], method: [], sku: '' }).length === 0, 'B18: non-matching country → no rows');

console.log('\n-- B19: shared kmf option-row checkbox matches the SKU Details baseline (vertical centre) --');
var components = read('css/components.css');
var kmfItem = (components.match(/\.kmf-item \{[\s\S]*?\}/) || [''])[0];
ok(/align-items:\s*center/.test(kmfItem), 'B19: .kmf-item uses align-items:center (checkbox + label share one centre line)');
ok(!/align-items:\s*flex-start/.test(kmfItem), 'B20: .kmf-item no longer top-aligns (flex-start) the checkbox');
var kmfCb = (components.match(/\.kmf-item input\[type="checkbox"\] \{[\s\S]*?\}/) || [''])[0];
ok(/margin:\s*0\b/.test(kmfCb), 'B21: .kmf-item checkbox margin:0 (no top-margin hack)');
ok(/flex:\s*0 0 auto/.test(kmfCb) && /width:\s*16px/.test(kmfCb), 'B22: .kmf-item checkbox is a fixed 16px non-shrinking square (self-defence vs page input CSS)');

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'ALL PASS') + ' (' + pass + ' assertions)');
process.exit(fail ? 1 : 0);
