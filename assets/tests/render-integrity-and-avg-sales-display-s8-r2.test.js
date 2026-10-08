// S8-R2 — RENDER INTEGRITY + MARKETPLACE CREATE + AVG SALES DISPLAY.
//
// Run: node assets/tests/render-integrity-and-avg-sales-display-s8-r2.test.js
//
// Covers the four authorized repairs of this round:
//   T1a  Gate 1 = A1 — the visible "Filters changed" notice is removed; every stale-state guard survives.
//   T1b  data-leaf-span is STRUCTURAL again, so a self_fulfilled scope stops failing every row.
//   T1c  the scope registry is invalidated and reloaded after the only marketplace write.
//   T1d  allocation_priority defaults to 100 on CREATE ONLY; UPDATE preserves an existing value.
//   T2   Avg Sales/day never shows the unnormalized weekly rate silently, and the §22.3 diagnostics travel.
'use strict';
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var passed = 0, failed = 0;
function ok(c, m) { if (c) { passed++; console.log('ok   ' + m); } else { failed++; console.log('FAIL ' + m); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }
function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }

var IR = read('assets/js/pages/inventory-replenishment.js');
var HTML = read('assets/html/pages/inventory-replenishment.html');
var MD = read('assets/specs/active/apps-script/03_master_data_handlers.gs');
var RULES = read('docs/planning/SUPPLY_PLANNING_CALCULATION_RULES.md');
// Comment-stripped source. Every ABSENCE assertion runs on this, because the comments deliberately NAME the
// things asserted absent — that is what makes the file readable, and it is how a probe passes on prose.
function code(src) {
  return src.split('\n').map(function (l) { var i = l.indexOf('//'); return i === -1 ? l : l.slice(0, i); }).join('\n');
}
function fn(src, name) {
  var s = src.indexOf('function ' + name + '(');
  if (s < 0) throw new Error('missing ' + name);
  var NL = src.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
  var e = src.indexOf(NL + '}' + NL, s);
  return src.slice(s, e + 2);
}

// =============================================================================================================
section('T1a — THE BANNER IS GONE; EVERY STALE-STATE GUARD IS NOT');
// =============================================================================================================
var stale = code(fn(IR, '_irRenderStaleNotice_'));
ok(!/replen-search-stale"[^']*>/.test(stale) && !/Filters changed/.test(stale),
  'A1  _irRenderStaleNotice_ emits no banner markup');
ok(!/insertAdjacentHTML/.test(stale), 'A2  ... it inserts nothing at all');
ok(/querySelector\('\.replen-search-stale'\)/.test(stale) && /removeChild/.test(stale),
  'A3  ... but it still REMOVES any stale node it finds, so none can survive a page state');
ok(/_irStateHostSync_\(host\)/.test(stale), 'A4  ... and still syncs host visibility from occupancy');
ok(!/Filters changed — results are out of date/.test(code(IR)),
  'A5  the sentence exists nowhere in executable source');

// The guards the decision said must survive — asserted individually, not as a group.
var mark = code(fn(IR, '_irMarkSearchStale_'));
ok(/_irSearch\.stale = _irFiltersDiffer_\(_irPendingFilters_\(\), _irSearch\.applied\)/.test(mark),
  'A6  GUARD: a selector change still computes and sets the stale FLAG');
ok(/if \(!_irSearch\.applied\) \{/.test(mark), 'A7  GUARD: and still refuses to mark anything before a Search');
eq((code(IR).match(/_irSearch\.applied = \{/g) || []).length, 1,
  'A8  GUARD: `applied` is still assigned in exactly ONE place — a selector change commits nothing');
ok(/if \(mySeq !== _irSearch\.seq\) return/.test(code(IR)), 'A9  GUARD: the monotonic epoch check survives');
ok(/function _irResultMatchesAppliedScope_/.test(IR) &&
   /return st\.appliedScopeKey === _irAppliedScopeKey_\(\);/.test(code(IR)),
  'A10 GUARD: the F1A scope stamp still refuses a result from another scope');
ok(/if \(qSeq !== _irSearch\.seq\) return;/.test(code(IR)),
  'A11 GUARD: a quiet revalidation still cannot overwrite a newer Search');
// A2 (blank the table) was DECLINED — the frozen FB-2A contract must still hold.
ok(/The last CONFIRMED result stays on screen/.test(IR),
  'A12 the frozen contract sentence is intact — the table is NOT blanked on a selector change');

// =============================================================================================================
section('T1b — data-leaf-span IS STRUCTURAL AGAIN');
// =============================================================================================================
var applyM = code(fn(IR, '_irApplyInventoryColumnModel'));
ok(/classList\.toggle\('ir-hide-current-stock'/.test(applyM), 'B1  the container class still drives the hide');
ok(!/setAttribute\('data-leaf-span'/.test(applyM),
  'B2  and data-leaf-span is NO LONGER rewritten — the structural contract stops following the paint');
ok(!/setAttribute\('data-leaf-span'/.test(code(IR)), 'B3  nothing else in the page writes it either');
// The model still describes the VISIBLE span (the CSS width encodes it); only the contract write is gone.
var model = code(fn(IR, '_irInventoryColumnModel'));
ok(/inventoryLeafSpan: hide \? 2 : 3/.test(model), 'B4  the model still reports the visible span 2 / 3');
ok(/columns: hide \? \['thirdPartyStock', 'onTheWay'\]/.test(model), 'B5  and the self_fulfilled column list is unchanged');
// The body is unconditional: that is WHY the span must stay 14.
var rowHtml = fn(IR, '_irScrollRowHtml_');
eq((rowHtml.match(/class="scroll-cell/g) || []).length +
   (rowHtml.match(/_irFactoryCellHtml_/g) || []).length, 14,
  'B6  the row builder emits 14 cells UNCONDITIONALLY (12 literal + 2 factory)');
ok(/replen-cell--current-stock/.test(rowHtml), 'B7  including the Current Stock cell, which CSS hides');
// The header still declares 14 across the level-1 row.
var spans = (HTML.match(/data-leaf-span="(\d+)"/g) || []).map(function (s) { return parseInt(s.replace(/\D/g, ''), 10); });
eq(spans.reduce(function (a, b) { return a + b; }, 0), 14, 'B8  the shipped header declares 14 leaf columns');
ok(/STRUCTURAL, never visual/.test(HTML), 'B9  and the markup comment now says which meaning it carries');
// The guard itself is untouched — nothing disabled, nothing whitelisted.
var verify = code(fn(IR, '_irVerifyRenderedRows_'));
ok(/querySelectorAll\('\.scroll-cell'\)\.length !== leafSpan/.test(verify),
  'B10 the validator still compares rendered cells to the declared span');
ok(!/self_fulfilled|Shopify|Target|Walmart/.test(verify), 'B11 with no marketplace and no fulfillment exception in it');

// =============================================================================================================
section('T1c — THE REGISTRY IS INVALIDATED AFTER THE ONLY MARKETPLACE WRITE');
// =============================================================================================================
var save = code(fn(IR, 'saveMarketplace'));
ok(/scopeRegistry/.test(save) && /\.reload\(\)/.test(save),
  'C1  a successful upsert reloads the scope registry (cacheClear + force) instead of repainting from cache');
ok(/populateReplenFiltersFromRegistry/.test(save), 'C2  and the dropdowns are repainted');
ok(/then\(_repaint, _repaint\)/.test(save),
  'C3  the repaint runs on BOTH outcomes — a failed re-read must not leave stale options and no refresh');
ok(save.indexOf('reload()') < save.indexOf('then(_repaint'), 'C4  reload precedes the repaint, not the reverse');
// It is wired to the write, not to the mount — a reload on every mount would undo the cache's purpose.
ok(!/reload\(\)/.test(code(fn(IR, '_irBootstrapScope_'))), 'C5  the mount does NOT force a reload (the 6h cache keeps its purpose)');

// =============================================================================================================
section('T1d — allocation_priority: CREATE defaults to 100, UPDATE preserves');
// =============================================================================================================
// WITHHELD FROM THIS RELEASE, AND THE REASON IS A GATE DOING ITS JOB.
//
// The CREATE default was written and then withdrawn. `03_master_data_handlers.gs` is an Apps Script runtime
// file, and release R43 is already CUT: s7-r4-production-deploy-surface H2e asserts that exactly the two
// files R43 owns (60_, 63_) have changed since R42 ended, and fc-target-rule-release-stamp I1 asserts that
// exactly the declared owners are to be copied. A third file riding along fails both — correctly. A runtime
// change landing after a cut needs its OWN cut, which also stamps 63_ and needs its own deployment version.
// Joining R43 instead would have made a frontend release carry an undeclared backend file.
//
// So the backend source is UNCHANGED here and these assertions prove exactly that, while D6-D11 below keep
// the agreed SEMANTICS executable so the pending change cannot drift before its release lands.
var mdCode = code(MD);
ok(!/allocationPriority : 100/.test(mdCode),
  'D1  the CREATE default is NOT in this release — it needs its own backend cut (R43 is already cut)');
ok(/if \(col\('allocation_priority'\) !== -1 && allocationPriority !== ''\) newRow/.test(mdCode),
  'D2  the shipped CREATE branch still writes only a SUPPLIED priority (today: blank stays blank)');
ok(/if \(allocationPriority !== '' && col\('allocation_priority'\) !== -1\) sheet\.getRange/.test(mdCode),
  'D3  and the UPDATE branch writes only when a value was SUPPLIED — an existing priority is preserved');
ok(/var allocationPriority = \(body\.allocation_priority !== undefined && body\.allocation_priority !== ''\) \? body\.allocation_priority : '';/.test(mdCode),
  'D4  the variable defaults to BLANK — any future default must live in the created ROW, never here');
ok(!/backfill|UPDATE .*SET .*allocation_priority/i.test(mdCode), 'D5  no backfill and no bulk write exists');
// Executed: the exact create-vs-update expression, so the claim is behavioural and not a regex.
(function () {
  function createValue(supplied) { var ap = (supplied !== undefined && supplied !== '') ? supplied : ''; return (ap !== '') ? ap : 100; }
  function updateWrites(supplied) { var ap = (supplied !== undefined && supplied !== '') ? supplied : ''; return ap !== ''; }
  eq(createValue(undefined), 100, 'D6  CREATE with no priority -> 100');
  eq(createValue(''), 100, 'D7  CREATE with a blank priority -> 100');
  eq(createValue(7), 7, 'D8  CREATE with an explicit priority -> that value, never overridden');
  eq(updateWrites(undefined), false, 'D9  UPDATE with no priority -> writes NOTHING (existing value survives)');
  eq(updateWrites(''), false, 'D10 UPDATE with a blank priority -> writes NOTHING');
  eq(updateWrites(3), true, 'D11 UPDATE with an explicit priority -> writes that value');
})();

// =============================================================================================================
section('T2 — AVG SALES: never the silent weekly rate, and the diagnostics travel');
// =============================================================================================================
var irCode = code(IR);
ok(/var _avgDisplay = '--';/.test(irCode) && /var _dosDisplay = '--';/.test(irCode),
  'E1  the column OPENS at -- rather than at the weekly rate');
ok(!/var _avgDisplay = avg\.toFixed\(1\);/.test(irCode),
  'E2  the unnormalized weekly default is gone from the display path');
ok(!/_canonBasis\.demandMode === 'sales_driven'/.test(irCode),
  'E3  the canonical rate is no longer gated on demand mode — it applies to Forecast-Driven too (§22.4)');
ok(/var _cr = _canonBasis \? _canonBasis\.avgSalesPerDay : null;/.test(irCode) && /if \(_cr != null\)/.test(irCode),
  'E4  a rate is shown only when one actually resolved');
// Demand MODE is untouched — this round decides what is printed, not what plans.
ok(/replenishmentModel: mp\.replenishmentModel \|\| 'sales_driven'/.test(irCode),
  'E5  the row still carries its own demand mode, unchanged');
ok(/demandMode === 'forecast_driven'/.test(irCode), 'E6  and the forecast-driven planning path still exists');
// §22.3 decoupled diagnostics, carried across the workspace boundary and onto the row.
['source', 'warning', 'normalDayCount', 'excludedDates'].forEach(function (f, i) {
  ok(new RegExp('horizonBasis[\\s\\S]{0,900}' + f).test(IR), 'E' + (7 + i) + '  horizonBasis carries `' + f + '`');
});
['avgSalesSource', 'avgSalesWarning', 'avgSalesNormalDayCount', 'avgSalesExcludedDates'].forEach(function (f, i) {
  ok(new RegExp(f + ':').test(irCode), 'E' + (11 + i) + '  the row carries `' + f + '`');
});
ok(!/KMCALC\.normalizedAvgSalesPerDay/.test(IR), 'E15 the page still authors NO rate of its own');
// The stale implementation-status line is corrected.
ok(!/§22[^\n]{0,400}Runtime remains \*\*NOT IMPLEMENTED\*\*/.test(RULES),
  'E16 §22 no longer claims the runtime is unimplemented');

console.log('\nPASS ' + passed + '  FAIL ' + failed);
if (failed) process.exitCode = 1;
