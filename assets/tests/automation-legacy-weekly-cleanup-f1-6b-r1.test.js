// Kitchen Mama Operation System — F1-6B-AUTOMATION-LEGACY-WEEKLY-CLEANUP-R1
// The legacy ambiguous handler runWeeklyRecommendation is FULLY REMOVED (function + schedulability), while the
// canonical trigger-sweep + config-migration authority is PRESERVED. Two canonical targets remain.
// Run: node assets/tests/automation-legacy-weekly-cleanup-f1-6b-r1.test.js
// NOTE: no 'use strict' — 45_ is eval'd into module scope.

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

var GS45 = read('specs/active/apps-script/45_api_v1_automation_schedule.gs');
var GS47 = read('specs/active/apps-script/47_api_v1_recommendation_generation.gs');
var GS49 = read('specs/active/apps-script/49_api_v1_weekly_recommendation_job.gs');

var H = (new Function(GS45 + '\n return {'
  + ' get: handleAutomationScheduleGet_, update: handleAutomationScheduleUpdate_, readConfig: automationReadConfig_,'
  + ' allowed: automationHandlerAllowed_, deletable: automationHandlerDeletable_, retired: automationHandlerRetired_,'
  + ' allowlist: automationAllowedHandlers_, jobByKey: automationJobByKey_, PROP_KEY: AUTOMATION_SCHEDULE_PROP_KEY_ };'))();
function makeIo(triggerHandlers, configJson) {
  var props = {}; props[H.PROP_KEY] = configJson || null;
  var triggers = (triggerHandlers || []).map(function (h) { return { handler: h }; });
  var log = { deleted: [], created: [] };
  return {
    now: function () { return new Date(); }, tz: function () { return 'Asia/Taipei'; }, stamp: function () { return '2026-08-13 00:00:00'; },
    getConfig: function () { return props[H.PROP_KEY]; }, setConfig: function (v) { props[H.PROP_KEY] = v; },
    getTriggers: function () { return triggers.map(function (t) { return { handler: t.handler }; }); },
    deleteTriggersByHandler: function (handler) { if (!H.deletable(handler)) return 0; var n = 0; for (var i = triggers.length - 1; i >= 0; i--) { if (triggers[i].handler === handler) { triggers.splice(i, 1); n++; } } log.deleted.push({ handler: handler, n: n }); return n; },
    createTrigger: function (handler, norm) { if (H.allowlist().indexOf(handler) === -1) return null; triggers.push({ handler: handler, norm: norm }); return { handler: handler, frequency: norm.frequency }; },
    _triggers: triggers, _props: props, _log: log
  };
}
function jobsOf(res) { var m = {}; (res.data.jobs || []).forEach(function (j) { m[j.key] = j; }); return m; }
function countHandler(io, h) { var n = 0; io._triggers.forEach(function (t) { if (t.handler === h) n++; }); return n; }

section('§6 D — the legacy runtime function is GONE');
ok(GS47.indexOf('function runWeeklyRecommendation(') === -1, 'D 47_ no longer defines runWeeklyRecommendation (function selector no longer exposes it)');
ok(!/\brunWeeklyRecommendation\s*\(/.test(GS47.replace(/\/\/[^\n]*/g, '')), 'D no runtime CALL of runWeeklyRecommendation remains in 47_');

section('§6 C — the two canonical trigger targets remain (unchanged)');
ok(/function runWeeklyInventoryRecommendation\(\)/.test(GS47), 'C runWeeklyInventoryRecommendation present');
ok(/function runMonthlyOrderRecommendation\(\)/.test(GS47), 'C runMonthlyOrderRecommendation present');

section('§6 A/B — active registry: canonical keys present, legacy key absent');
var jm = jobsOf(H.get({}, makeIo([])));
ok(jm.weeklyInventoryRecommendation && jm.monthlyOrderRecommendation, 'A registry has weeklyInventoryRecommendation + monthlyOrderRecommendation');
ok(!jm.weeklyRecommendation, 'B registry has NO weeklyRecommendation (not schedulable)');
ok(H.allowlist().indexOf('runWeeklyRecommendation') === -1 && H.allowlist().length === 5, 'B legacy handler not allowlisted (5 implemented handlers)');

section('§6 E — a live legacy trigger is DELETABLE / swept on Save & Apply');
ok(H.deletable('runWeeklyRecommendation') === true && H.retired('runWeeklyRecommendation') === true, 'E legacy handler is retired+deletable');
var ioSweep = makeIo(['runWeeklyRecommendation', 'runAmazonSnapshotImports']);
var uSweep = H.update({ payload: { key: 'weeklyInventoryRecommendation', config: { enabled: true, frequency: 'WEEKLY', dayOfWeek: 'MONDAY', hour: 14, minute: 0 } } }, ioSweep);
ok(countHandler(ioSweep, 'runWeeklyRecommendation') === 0 && uSweep.data.applied.retiredSwept.runWeeklyRecommendation === 1, 'E a pre-existing runWeeklyRecommendation trigger is deleted on Save & Apply');
ok(countHandler(ioSweep, 'runAmazonSnapshotImports') === 1, 'E unrelated trigger untouched (sweep targets only the retired handler)');

section('§6 F — the legacy handler can NEVER be created');
ok(H.allowed('runWeeklyRecommendation') === false, 'F not allowlisted for creation');
ok(makeIo([]).createTrigger('runWeeklyRecommendation', { frequency: 'WEEKLY', hour: 14, minute: 0 }) === null, 'F createTrigger refuses the retired handler (returns null)');

section('§6 G — legacy stored config migrates to Weekly Inventory + can never reactivate the legacy handler');
var legacy = JSON.stringify({ version: 1, jobs: { weeklyRecommendation: { enabled: true, frequency: 'WEEKLY', dayOfWeek: 'FRIDAY', hour: 9, minute: 15 } } });
var ioMig = makeIo([], legacy);
var jmMig = jobsOf(H.get({}, ioMig));
ok(!jmMig.weeklyRecommendation, 'G migrated config never surfaces a weeklyRecommendation job');
ok(jmMig.weeklyInventoryRecommendation.enabled === true && jmMig.weeklyInventoryRecommendation.dayOfWeek === 'FRIDAY', 'G legacy config reinterpreted as Weekly Inventory (same enabled/day)');
ok(jmMig.monthlyOrderRecommendation.enabled === false && jmMig.monthlyOrderRecommendation.dayOfMonth === 10, 'G legacy config NOT copied into Monthly Order');
// applying a save after migration reconciles the Weekly Inventory trigger + sweeps any legacy trigger — never creates runWeeklyRecommendation
var uMig = H.update({ payload: { key: 'weeklyInventoryRecommendation', config: { enabled: true, frequency: 'WEEKLY', dayOfWeek: 'FRIDAY', hour: 9, minute: 15 } } }, ioMig);
ok(countHandler(ioMig, 'runWeeklyRecommendation') === 0 && countHandler(ioMig, 'runWeeklyInventoryRecommendation') === 1, 'G post-migration Save & Apply → Weekly Inventory trigger only, never the legacy handler');

section('§6 H/I/J — canonical product isolation + Monthly day 10 preserved');
var inv = extractFn(GS47, 'runWeeklyInventoryRecommendation'), mon = extractFn(GS47, 'runMonthlyOrderRecommendation');
ok(/runRecommendationGeneration\('INVENTORY'\)/.test(inv) && !/ORDER_PLANNING|weeklyRecoStart_/.test(inv), 'H Weekly = INVENTORY only (no ORDER_PLANNING)');
ok(/weeklyRecoStart_\(weeklyRecoDefaultEnv_\(\)\)/.test(mon) && !/runRecommendationGeneration\('INVENTORY'\)|INVENTORY/.test(mon), 'I Monthly = ORDER_PLANNING persistence run only (no INVENTORY)');
ok(H.jobByKey('monthlyOrderRecommendation').defaults.dayOfMonth === 10 && H.jobByKey('monthlyOrderRecommendation').defaults.frequency === 'MONTHLY', 'J Monthly default = MONTHLY day 10');
ok(H.jobByKey('weeklyInventoryRecommendation').defaults.frequency === 'WEEKLY', 'Weekly default = WEEKLY');

section('§6 K/L — prerequisite gates + no second engine/scheduler/persister');
ok(/recGenAutomationEnabled_\('weeklyInventoryRecommendation'\)/.test(inv) && /recGenAutomationEnabled_\('monthlyOrderRecommendation'\)/.test(mon), 'K each handler defensively checks its OWN enabled state');
ok(/runRecommendationGeneration\('INVENTORY'\)/.test(inv), 'K Weekly consumes the canonical gap-DONE-gated runtime (Inventory Gap prerequisite)');
ok(/status === 'SKIPPED'.*BLOCKED|BLOCKED.*ORDER_PLANNING_GAP_NOT_READY/.test(mon.replace(/\n/g, ' ')), 'K Monthly surfaces BLOCKED when the OP gap is not ready (blocked != success)');
var cleaned47 = GS47.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
ok(!/ScriptApp\.newTrigger|var [A-Z_]+_HEADERS_\s*=/.test(cleaned47), 'L cleanup added no new scheduler/table (47_ still delegates to the ONE canonical KMREC runtime — no second engine)');
var jobsBlk = (function () { var s = GS45.indexOf('var AUTOMATION_JOBS_ ='); var e = GS45.indexOf('];', s); return GS45.slice(s, e + 2); })();
ok((jobsBlk.match(/key: '/g) || []).length === 5, 'L exactly 5 automation registry entries (no third ambiguous recommendation automation)');
ok(/continueWeeklyRecommendationJob/.test(GS49), 'the canonical one-off continuation handler (49_) is untouched (distinct from the removed legacy handler)');

console.log('\n----------------------------------------');
console.log('AUTOMATION LEGACY WEEKLY CLEANUP (F1-6B-R1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
