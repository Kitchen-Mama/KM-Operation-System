// Kitchen Mama Operation System — F1-6B-AUTOMATION-SCHEDULE-UI-GROUPING-R2
// Administration Automation Schedule — ACTUAL visual grouping (frontend presentation only).
// Run: node assets/tests/automation-schedule-ui-grouping-f1-6b-r2.test.js
// -----------------------------------------------------------------------------
// Proves the renderer emits THREE real group containers (Source Data / Inventory Planning / Order Planning) with the
// exact card membership + order, every card exactly once, no empty group, a leftover fallback, the old misleading
// top-flow removed, and the existing card behavior / registry / backend untouched. The grouping function is executed
// (not just scanned) against a fake card renderer so the DOM structure is real. NOTE: no 'use strict'.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function section(n) { console.log('\n== ' + n + ' =='); }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '('); if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
function extractArrayVar(src, name) {
  var s = src.indexOf('var ' + name + ' ='); if (s < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('[', s), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '[') depth++; else if (ch === ']') { depth--; if (depth === 0) return src.slice(s, i + 1) + ';'; } }
  throw new Error('unbalanced array: ' + name);
}

var PAGEJS = read('js/pages/automation-schedule.js');
var PAGEHTML = read('html/pages/automation-schedule.html');
var PAGECSS = read('css/pages/automation-schedule.css');
var GS45 = read('specs/active/apps-script/45_api_v1_automation_schedule.gs');
var GS47 = read('specs/active/apps-script/47_api_v1_recommendation_generation.gs');

// ---- execute the REAL grouping function with a fake card renderer -------------------------------------------
var renderGroupsHtml = new Function('renderJobCard',
  'function esc(s){return String(s==null?"":s);}\n'
  + extractArrayVar(PAGEJS, 'AUTOMATION_GROUPS') + '\n'
  + extractFn(PAGEJS, 'renderGroupsHtml') + '\n return renderGroupsHtml;')(
  function (job) { return '<div class="auto-card" data-key="' + job.key + '">' + job.label + '</div>'; });

// server view order deliberately SCRAMBLED (proves the map re-orders, not raw iteration / not alphabetical)
var JOBS = [
  { key: 'monthlyOrderRecommendation', label: 'Monthly Order Recommendation' },
  { key: 'amazonImport', label: 'Amazon / Site Data Import' },
  { key: 'weeklyInventoryRecommendation', label: 'Weekly Inventory Recommendation' },
  { key: 'orderPlanningGap', label: 'Order Planning Gap Materialization' },
  { key: 'inventoryGap', label: 'Inventory Gap Materialization' }
];
var HTML = renderGroupsHtml(JOBS);
function idx(s) { return HTML.indexOf(s); }
function groupBlock(k) { var a = HTML.indexOf('automation-group--' + k); var b = HTML.indexOf('</section>', a); return a < 0 ? '' : HTML.slice(a, b); }
function occ(s, sub) { return s.split(sub).length - 1; }

section('§14 A — exactly three real group containers');
ok(occ(HTML, '<section class="automation-group') === 3, 'A exactly 3 <section class="automation-group"> containers');
ok(/automation-group__cards/.test(HTML), 'A cards live inside a real .automation-group__cards container (not headings between flat siblings)');

section('§14 B/C/D — group membership');
var gS = groupBlock('source'), gI = groupBlock('inventory'), gO = groupBlock('order');
ok(/data-key="amazonImport"/.test(gS) && occ(gS, 'data-key="') === 1, 'B SOURCE DATA = Amazon / Site Data Import only');
ok(/data-key="inventoryGap"/.test(gI) && /data-key="weeklyInventoryRecommendation"/.test(gI) && occ(gI, 'data-key="') === 2, 'C INVENTORY PLANNING = Inventory Gap + Weekly Inventory Recommendation');
ok(/data-key="orderPlanningGap"/.test(gO) && /data-key="monthlyOrderRecommendation"/.test(gO) && occ(gO, 'data-key="') === 2, 'D ORDER PLANNING = Order Planning Gap + Monthly Order Recommendation');

section('§14 E/F/G — every card once; Gap → Recommendation order; group order');
['amazonImport', 'inventoryGap', 'weeklyInventoryRecommendation', 'orderPlanningGap', 'monthlyOrderRecommendation'].forEach(function (k) {
  ok(occ(HTML, 'data-key="' + k + '"') === 1, 'E ' + k + ' appears exactly once');
});
ok(gI.indexOf('inventoryGap') < gI.indexOf('weeklyInventoryRecommendation'), 'F Inventory order = Gap → Recommendation');
ok(gO.indexOf('orderPlanningGap') < gO.indexOf('monthlyOrderRecommendation'), 'G Order order = Gap → Recommendation');
ok(idx('automation-group--source') < idx('automation-group--inventory') && idx('automation-group--inventory') < idx('automation-group--order'), '§6 group order = Source → Inventory → Order');
ok(/Source Data/.test(gS) && /Inventory Planning/.test(gI) && /Order Planning/.test(gO), '§5 group titles present');

section('§11 — no empty group; leftover card never dropped');
var onlyInv = renderGroupsHtml([{ key: 'inventoryGap', label: 'IG' }, { key: 'weeklyInventoryRecommendation', label: 'WIR' }]);
ok(occ(onlyInv, '<section class="automation-group') === 1 && /automation-group--inventory/.test(onlyInv) && !/automation-group--source/.test(onlyInv), '§11 groups with zero members are omitted (no empty panel)');
var withFuture = renderGroupsHtml(JOBS.concat([{ key: 'someFutureJob', label: 'Future' }]));
ok(/automation-group--other/.test(withFuture) && /data-key="someFutureJob"/.test(withFuture), 'a card not in the map falls into an "Other" group (never silently dropped)');

section('§14 H/I — flat-list-only removed; old misleading top flow removed');
ok(/host\.innerHTML = renderGroupsHtml\(jobs\)/.test(PAGEJS), 'H render() now emits grouped sections (not jobs.map(renderJobCard) flat list)');
ok(!/jobs\.map\(renderJobCard\)\.join/.test(PAGEJS), 'H the old flat-list render is gone');
ok(!/auto-sched-flow/.test(PAGEHTML) && !/auto-sched-flow/.test(PAGECSS), 'I old misleading "Source Import → Inventory Gap → Recommendation" top flow removed (HTML + CSS)');

section('§14 J/K/L/M — existing card behavior preserved');
ok(/function automationSaveJob|window\.automationSaveJob|onclick="automationSaveJob/.test(PAGEJS) && /Save &amp; Apply/.test(PAGEJS), 'J Save & Apply control + handler preserved');
ok(/cfg\.frequency === 'WEEKLY'\) cfg\.dayOfWeek = v\('dayOfWeek'\)/.test(PAGEJS), 'K weekly Day of Week still collected on save');
ok(/cfg\.frequency === 'MONTHLY'\) cfg\.dayOfMonth = parseInt/.test(PAGEJS), 'L monthly Day of Month still collected on save');
ok(/triggerActive/.test(PAGEJS) && /Trigger: /.test(PAGEJS), 'M trigger state still rendered per card');
ok(/host\.querySelector\('\.auto-card\[data-key="' \+ (job|key)/.test(PAGEJS), 'seeding + save still locate cards by data-key within the host (nesting-safe)');

section('§14 N — responsive: narrow layout drops the group indent/rule (no horizontal overflow)');
ok(/@media \(max-width: 640px\)/.test(PAGECSS) && /automation-group__cards \{ padding-left: 0; border-left: none;/.test(PAGECSS), 'N narrow breakpoint neutralizes the group left-rule/indent');
ok(/repeat\(auto-fit, minmax\(150px, 1fr\)\)/.test(PAGECSS), 'N card field grid remains auto-fit (wraps, no fixed width)');

section('§14 O/P — backend scheduler + registry unchanged; grouping ties to real registry keys');
['amazonImport', 'inventoryGap', 'orderPlanningGap', 'weeklyInventoryRecommendation', 'monthlyOrderRecommendation'].forEach(function (k) {
  ok(new RegExp("key: '" + k + "'").test(GS45), 'P registry key still owned by 45_: ' + k);
});
ok(/function runWeeklyInventoryRecommendation\(\)/.test(GS47) && /function runMonthlyOrderRecommendation\(\)/.test(GS47), 'O product-isolated handlers unchanged in 47_');
ok(/members: \['amazonImport'\]/.test(PAGEJS) && /members: \['inventoryGap', 'weeklyInventoryRecommendation'\]/.test(PAGEJS) && /members: \['orderPlanningGap', 'monthlyOrderRecommendation'\]/.test(PAGEJS), 'presentation map uses the exact existing registry keys (no duplicated registry data, no runtime ownership moved)');

console.log('\n----------------------------------------');
console.log('AUTOMATION SCHEDULE UI GROUPING (F1-6B-R2): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
