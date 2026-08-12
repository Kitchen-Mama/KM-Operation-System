// F1-6A-WEEKLY-RECOMMENDATION-SCHEDULER-R1 — wire the Administration Weekly Recommendation schedule to the ONE
// canonical recommendation runtime. Proves: runWeeklyRecommendation is a THIN trigger target that delegates to the
// shared owner (runRecommendationGeneration), resolves the deterministic planning cycle (gapCalcResolveContext_),
// is defensive on enabled, contains NO recommendation/gap/forecast math, and creates NO second engine/table. The
// registry flip (implemented + handler) is proven; trigger/config authority stays the existing 45_ owner.
// Run: node assets/tests/weekly-recommendation-scheduler-f1-6a-r1.test.js
// NOTE: no 'use strict' — the handler is executed with injected global stubs.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '('); if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}

var GS45 = read('specs/active/apps-script/45_api_v1_automation_schedule.gs');
var GS47 = read('specs/active/apps-script/47_api_v1_recommendation_generation.gs');
var GS43 = read('specs/active/apps-script/43_api_v1_gap_materialization.gs');
var runWeeklyFn = extractFn(GS47, 'runWeeklyRecommendation');

// Build runWeeklyRecommendation with injected global stubs (records delegation + supplies deterministic cycle).
function buildWeekly(cfg, calcCtx) {
  var calls = { runGen: [], readConfig: 0 };
  var fn = new Function('automationReadConfig_', 'automationDefaultIo_', 'gapCalcResolveContext_', 'runRecommendationGeneration', 'Logger',
    runWeeklyFn + '\n return runWeeklyRecommendation;')(
    function () { calls.readConfig++; return cfg; },
    function () { return {}; },
    function (jobType) { calls.calcCtx = (calls.calcCtx || []); calls.calcCtx.push(jobType); return calcCtx; },
    function (product) { calls.runGen.push(product); return { ok: true, product: product, summary: { count: 1 } }; },
    { log: function () {} });
  return { fn: fn, calls: calls };
}

console.log('\n== registry flip: weeklyRecommendation is now implemented + handler wired ==');
function jobsBlock() { var s = GS45.indexOf('var AUTOMATION_JOBS_ ='); var e = GS45.indexOf('];', s); return GS45.slice(s, e + 2); }
var JB = jobsBlock();
ok(/key: 'weeklyRecommendation', label: 'Weekly Recommendation', handler: 'runWeeklyRecommendation'/.test(JB), 'weeklyRecommendation.handler = runWeeklyRecommendation');
ok(/handler: 'runWeeklyRecommendation',\s*\n?\s*implemented: true/.test(JB) || /handler: 'runWeeklyRecommendation',[\s\S]{0,60}implemented: true/.test(JB), 'weeklyRecommendation.implemented = true');
ok(/defaults: \{ enabled: false, frequency: 'WEEKLY', dayOfWeek: 'MONDAY'/.test(JB), 'defaults stay disabled (opt-in) + WEEKLY MONDAY');
// the other three implemented jobs are unchanged
['amazonImport', 'inventoryGap', 'orderPlanningGap'].forEach(function (k) { ok(new RegExp("key: '" + k + "'").test(JB), 'unchanged job present: ' + k); });

console.log('\n== L/S enabled: delegates to the ONE canonical runtime for both products + deterministic cycle ==');
var en = buildWeekly({ weeklyRecommendation: { enabled: true } }, { ok: true, planningCycle: 'RECO-2026-08' });
var rEn = en.fn();
eq(en.calls.runGen, ['INVENTORY', 'ORDER_PLANNING'], 'L delegates to runRecommendationGeneration for both planning products');
ok(rEn.ok === true, 'L returns ok when the owner succeeds');
eq(rEn.results.ORDER_PLANNING.planningCycle, 'RECO-2026-08', 'S planning cycle supplied deterministically (RECO-YYYY-MM via gapCalcResolveContext_)');
eq(en.calls.calcCtx, ['INVENTORY', 'ORDER_PLANNING'], 'S cycle resolved per product via the canonical calc-context owner');

console.log('\n== K/N/O/P disabled + defensive: no-op, no delegation (idempotent by construction) ==');
var dis = buildWeekly({ weeklyRecommendation: { enabled: false } }, { ok: true, planningCycle: 'RECO-2026-08' });
var rDis = dis.fn();
ok(rDis.skipped === true && rDis.reason === 'WEEKLY_RECOMMENDATION_DISABLED', 'K disabled schedule -> skipped (does not execute)');
eq(dis.calls.runGen, [], 'K disabled -> the recommendation runtime is NOT invoked');
// non-persistent owner (stub returns summary only) -> repeated invocation cannot create duplicate drafts
var twice = buildWeekly({ weeklyRecommendation: { enabled: true } }, { ok: true, planningCycle: 'RECO-2026-08' });
twice.fn(); twice.fn();
eq(twice.calls.runGen.length, 4, 'N/O duplicate/near-simultaneous firing just re-delegates (owner is non-persistent summary -> no duplicate draft)');

console.log('\n== M no copied recommendation/gap/forecast math in the scheduler handler ==');
ok(!/KMREC|generateBatch|calculateGap|calculateSuggested|forecast|recommended_qty|units_per_carton/i.test(runWeeklyFn), 'M handler contains NO recommendation/gap/forecast formula (delegation only)');
ok(/runRecommendationGeneration\(p\)/.test(runWeeklyFn), 'M handler delegates to the ONE shared owner');
ok(!/setValue|appendRow|prodRequireSheet_|SpreadsheetApp|insertSheet/.test(runWeeklyFn), 'M handler writes nothing itself');

console.log('\n== T no second engine/table; U canonical owner unchanged ==');
ok(!/_HEADERS_ =|function KMREC|KMREC\s*=/.test(runWeeklyFn), 'T handler declares no new table/engine');
ok(/function runRecommendationGeneration\(product\) \{/.test(GS47) && /KMREC\.generateBatch\(p, rows, \{\}\)/.test(GS47), 'U the canonical owner runRecommendationGeneration is unchanged (still the KMREC summary owner)');
ok(/function runInventoryRecommendationGeneration\(\)/.test(GS47) && /function runOrderPlanningRecommendationGeneration\(\)/.test(GS47), 'U existing named wrappers untouched');

console.log('\n== S planning-cycle authority is deterministic (RECO-YYYY-MM, Asia/Taipei) ==');
ok(/planningCycle: 'RECO-' \+ calcMonth/.test(GS43), 'planning cycle owner yields RECO-YYYY-MM (43_ gapCalcContextForJob_)');
ok(/function gapCalcResolveContext_\(jobType, nowMs\)/.test(GS43), 'gapCalcResolveContext_ resolver exists (deterministic, reused — not reimplemented)');

console.log('\n== timezone + trigger authority reused (Asia/Taipei; max-one weekly trigger) ==');
ok(/var AUTOMATION_TZ_ = 'Asia\/Taipei'/.test(GS45), 'timezone authority = Asia/Taipei (unchanged constant)');
ok(/onWeekDay\(ScriptApp\.WeekDay\[norm\.dayOfWeek\]\)\.atHour\(norm\.hour\)\.nearMinute\(norm\.minute\)/.test(GS45), 'existing WEEKLY trigger branch reused (onWeekDay/atHour/nearMinute)');
ok(/io\.deleteTriggersByHandler\(job\.handler\)/.test(GS45) && /io\.createTrigger\(job\.handler, norm\)/.test(GS45), 'reconciler is delete-then-create (max one owned trigger)');

console.log('\n== V/W upstream + responsive surface: only 45_/47_ changed; UI is the existing responsive card ==');
var CSS = read('css/pages/automation-schedule.css');
ok(/auto-fit,\s*minmax\(/.test(CSS), 'W the existing automation card grid is responsive (auto-fit minmax) — reused for the weekly card, no overflow');
// scheduler handler does not touch RO/PO/shipment/forecast owners
ok(!/purchase_order|shipment_line_allocations|request_order|shipped_qty|factory_stock|final_output/i.test(runWeeklyFn), 'V handler touches no RO/PO/Shipment/Export owner');

console.log('\n----------------------------------------');
console.log('WEEKLY RECOMMENDATION SCHEDULER (F1-6A-R1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
