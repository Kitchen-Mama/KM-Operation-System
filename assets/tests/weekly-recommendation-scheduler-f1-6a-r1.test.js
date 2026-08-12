// Kitchen Mama Operation System — F1-6A Weekly Recommendation Scheduler → F1-6B split migration guard.
// Run: node assets/tests/weekly-recommendation-scheduler-f1-6a-r1.test.js
// -----------------------------------------------------------------------------
// F1-6A introduced a SINGLE "Weekly Recommendation" automation that (post F1-6B-PHASE1) ran BOTH INVENTORY +
// ORDER_PLANNING. F1-6B-AUTOMATION-RECOMMENDATION-CLOSURE-R1 RETIRES that ambiguous automation and splits it into two
// product-isolated automations. This file guards the migration: the old registry entry/handler is gone, the retiring
// shim runs INVENTORY only, and the F1-6A invariants that must survive (canonical owner unchanged, Asia/Taipei,
// delete-then-create max-one trigger) still hold. The full split behavior is covered by
// weekly-inventory-monthly-order-automation-f1-6b-r1.test.js.
// NOTE: no 'use strict' — extracted handlers are eval'd into module scope.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }

var GS45 = read('specs/active/apps-script/45_api_v1_automation_schedule.gs');
var GS47 = read('specs/active/apps-script/47_api_v1_recommendation_generation.gs');
var GS43 = read('specs/active/apps-script/43_api_v1_gap_materialization.gs');

console.log('\n== retirement: the ambiguous single Weekly Recommendation entry is gone ==');
function jobsBlock() { var s = GS45.indexOf('var AUTOMATION_JOBS_ ='); var e = GS45.indexOf('];', s); return GS45.slice(s, e + 2); }
var JB = jobsBlock();
ok(!/key: 'weeklyRecommendation'/.test(JB), 'the ambiguous weeklyRecommendation registry entry is REMOVED');
ok(/AUTOMATION_RETIRED_HANDLERS_ = \['runWeeklyRecommendation'\]/.test(GS45), 'runWeeklyRecommendation is declared RETIRED (deletable, never creatable)');
ok(/key: 'weeklyInventoryRecommendation'/.test(JB) && /key: 'monthlyOrderRecommendation'/.test(JB), 'split into two product-isolated automations');

console.log('\n== retiring shim: old handler runs INVENTORY only + self-deletes its trigger ==');
var shim = new Function('gapJobDeleteTriggersByHandler_', 'runWeeklyInventoryRecommendation',
  (function () { var s = GS47.indexOf('function runWeeklyRecommendation('); var i = GS47.indexOf('{', s), d = 0; for (; i < GS47.length; i++) { if (GS47[i] === '{') d++; else if (GS47[i] === '}') { d--; if (!d) return GS47.slice(s, i + 1); } } })()
  + '\n return runWeeklyRecommendation;');
var calls = { del: [], inv: 0 };
var shimRes = shim(function (h) { calls.del.push(h); }, function () { calls.inv++; return { ok: true, product: 'INVENTORY' }; })();
ok(calls.del.length === 1 && calls.del[0] === 'runWeeklyRecommendation', 'shim self-deletes its own lingering trigger (safe delete-by-handler)');
ok(calls.inv === 1 && shimRes.retired === true && shimRes.delegatedTo === 'runWeeklyInventoryRecommendation', 'shim delegates to INVENTORY only (never ORDER_PLANNING) — ambiguous coupling gone');

console.log('\n== the two product-isolated handlers exist ==');
ok(/function runWeeklyInventoryRecommendation\(\)/.test(GS47), 'runWeeklyInventoryRecommendation exists');
ok(/function runMonthlyOrderRecommendation\(\)/.test(GS47), 'runMonthlyOrderRecommendation exists');

console.log('\n== F1-6A invariants that must survive ==');
ok(/function runRecommendationGeneration\(product\) \{/.test(GS47) && /KMREC\.generateBatch\(p, rows, \{\}\)/.test(GS47), 'the canonical owner runRecommendationGeneration is UNCHANGED (still the KMREC summary owner)');
ok(/function runInventoryRecommendationGeneration\(\)/.test(GS47) && /function runOrderPlanningRecommendationGeneration\(\)/.test(GS47), 'existing named wrappers untouched');
ok(/planningCycle: 'RECO-' \+ calcMonth/.test(GS43) && /function gapCalcResolveContext_\(jobType, nowMs\)/.test(GS43), 'planning-cycle authority deterministic (RECO-YYYY-MM, 43_) — reused, not reimplemented');
ok(/var AUTOMATION_TZ_ = 'Asia\/Taipei'/.test(GS45), 'timezone authority = Asia/Taipei (unchanged)');
ok(/io\.deleteTriggersByHandler\(job\.handler\)/.test(GS45) && /io\.createTrigger\(job\.handler, norm\)/.test(GS45), 'reconciler still delete-then-create (max one owned trigger)');

console.log('\n----------------------------------------');
console.log('WEEKLY RECOMMENDATION SCHEDULER → F1-6B SPLIT MIGRATION: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
