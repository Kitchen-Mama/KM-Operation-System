// Kitchen Mama Operation System — F1-6B-AUTOMATION-RECOMMENDATION-CLOSURE-R1
// Weekly Inventory + Monthly Order Recommendation — prerequisite gate + product isolation + monthly scheduler.
// Run: node assets/tests/weekly-inventory-monthly-order-automation-f1-6b-r1.test.js
// -----------------------------------------------------------------------------
// The ambiguous single Weekly Recommendation (which ran BOTH products) is split into two canonical, product-isolated
// automations. This proves: registry split + MONTHLY/day-of-month scheduler support (45_ validation/reconciler/view/
// migration + retirement), the two product-isolated trigger targets (47_) with their OWN prerequisite Gap gate and
// NO cross-product invocation, and the UI extension. Scheduled ORDER_PLANNING persistence (via the 49_ run driving the
// 48_ job) is covered end-to-end by weekly-recommendation-persistence-f1-6b-r1.test.js; here the Monthly handler is
// proven to ENTER that canonical run. NOTE: no 'use strict' — evaluated/extracted code runs in module scope.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
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
var PAGEJS = read('js/pages/automation-schedule.js');

// ---- 45_ backend owner with an in-memory fake io (props + trigger list) --------------------------------------
var H = (new Function(GS45 + '\n return {'
  + ' get: handleAutomationScheduleGet_, update: handleAutomationScheduleUpdate_, validate: automationValidateJobConfig_,'
  + ' readConfig: automationReadConfig_, allowlist: automationAllowedHandlers_, deletable: automationHandlerDeletable_,'
  + ' jobByKey: automationJobByKey_, PROP_KEY: AUTOMATION_SCHEDULE_PROP_KEY_ };'))();
function makeIo(triggerHandlers, configJson) {
  var props = {}; props[H.PROP_KEY] = configJson || null;
  var triggers = (triggerHandlers || []).map(function (h) { return { handler: h }; });
  var log = { deleted: [], created: [] };
  return {
    now: function () { return new Date(); }, tz: function () { return 'Asia/Taipei'; }, stamp: function () { return '2026-08-12 14:00:00'; },
    getConfig: function () { return props[H.PROP_KEY]; }, setConfig: function (v) { props[H.PROP_KEY] = v; },
    getTriggers: function () { return triggers.map(function (t) { return { handler: t.handler }; }); },
    deleteTriggersByHandler: function (handler) { if (!H.deletable(handler)) return 0; var n = 0; for (var i = triggers.length - 1; i >= 0; i--) { if (triggers[i].handler === handler) { triggers.splice(i, 1); n++; } } log.deleted.push({ handler: handler, n: n }); return n; },
    createTrigger: function (handler, norm) { if (H.allowlist().indexOf(handler) === -1) return null; triggers.push({ handler: handler, norm: norm }); log.created.push({ handler: handler, norm: norm }); return { handler: handler, frequency: norm.frequency, hour: norm.hour, minute: norm.minute, dayOfWeek: norm.dayOfWeek || null, dayOfMonth: (norm.dayOfMonth != null ? norm.dayOfMonth : null) }; },
    _triggers: triggers, _props: props, _log: log
  };
}
function jobsOf(res) { var m = {}; (res.data.jobs || []).forEach(function (j) { m[j.key] = j; }); return m; }
function countHandler(io, h) { var n = 0; io._triggers.forEach(function (t) { if (t.handler === h) n++; }); return n; }

// ---- 47_ trigger targets with injected globals --------------------------------------------------------------
function buildInv(deps) {
  return new Function('recGenAutomationEnabled_', 'gapCalcResolveContext_', 'runRecommendationGeneration', 'Logger',
    extractFn(GS47, 'runWeeklyInventoryRecommendation') + '\n return runWeeklyInventoryRecommendation;')(
    deps.enabled, deps.calcCtx || function () { return { ok: true, planningCycle: 'RECO-2026-08' }; }, deps.runGen, { log: function () {} });
}
function buildMonthly(deps) {
  return new Function('recGenAutomationEnabled_', 'weeklyRecoStart_', 'weeklyRecoDefaultEnv_', 'Logger',
    extractFn(GS47, 'runMonthlyOrderRecommendation') + '\n return runMonthlyOrderRecommendation;')(
    deps.enabled, deps.weeklyStart, function () { return {}; }, { log: function () {} });
}

// =============================================================================
section('A — registry split + MONTHLY default day 10 + migration');
var g0 = H.get({}, makeIo([]));
var jm0 = jobsOf(g0);
ok(!jm0.weeklyRecommendation, 'A1 ambiguous Weekly Recommendation retired (no longer runs both products)');
ok(jm0.weeklyInventoryRecommendation && jm0.weeklyInventoryRecommendation.frequency === 'WEEKLY', 'A2 Weekly Inventory card = WEEKLY');
ok(jm0.monthlyOrderRecommendation && jm0.monthlyOrderRecommendation.frequency === 'MONTHLY', 'A3 Monthly Order card = MONTHLY');
ok(jm0.monthlyOrderRecommendation.dayOfMonth === 10, 'A4 Monthly default day = 10');
ok(jm0.weeklyInventoryRecommendation.timezone === 'Asia/Taipei' && jm0.monthlyOrderRecommendation.timezone === 'Asia/Taipei', 'A/§17 both carry Asia/Taipei');
// migration: a legacy stored weeklyRecommendation block → reinterpreted as weeklyInventoryRecommendation, NOT copied to Monthly
var legacy = JSON.stringify({ version: 1, jobs: { weeklyRecommendation: { enabled: true, frequency: 'WEEKLY', dayOfWeek: 'FRIDAY', hour: 9, minute: 15, updatedAt: '2026-07-01 00:00:00' } } });
var jmMig = jobsOf(H.get({}, makeIo([], legacy)));
ok(jmMig.weeklyInventoryRecommendation.enabled === true && jmMig.weeklyInventoryRecommendation.dayOfWeek === 'FRIDAY' && jmMig.weeklyInventoryRecommendation.hour === 9, '§3 legacy weeklyRecommendation migrated → Weekly Inventory (same day/time/enabled)');
ok(jmMig.monthlyOrderRecommendation.enabled === false && jmMig.monthlyOrderRecommendation.dayOfMonth === 10, '§3 legacy config NOT copied into Monthly Order (keeps its day-10 default, disabled)');

section('A5/A6/A7 — schedules persist + read back');
var ioP = makeIo([]);
H.update({ payload: { key: 'weeklyInventoryRecommendation', config: { enabled: true, frequency: 'WEEKLY', dayOfWeek: 'MONDAY', hour: 14, minute: 0 } } }, ioP);
H.update({ payload: { key: 'monthlyOrderRecommendation', config: { enabled: true, frequency: 'MONTHLY', dayOfMonth: 12, hour: 8, minute: 30 } } }, ioP);
var jmP = jobsOf(H.get({}, ioP));
ok(jmP.weeklyInventoryRecommendation.enabled === true && jmP.weeklyInventoryRecommendation.dayOfWeek === 'MONDAY', 'A5 Weekly schedule persists + reads back');
ok(jmP.monthlyOrderRecommendation.enabled === true && jmP.monthlyOrderRecommendation.dayOfMonth === 12 && jmP.monthlyOrderRecommendation.hour === 8, 'A6/A7 Monthly schedule (day 12, 08:30) persists + reads back');

section('A8/UI — the admin UI renders MONTHLY + Day of Month (data-driven, no hardcoded monthly UI)');
ok(/monthDayOptions/.test(PAGEJS) && /data-field="dayOfMonth"/.test(PAGEJS), 'UI has a Day-of-Month control');
ok(/value="MONTHLY"/.test(PAGEJS) && /freq\.value === 'MONTHLY'/.test(PAGEJS), 'UI Frequency includes Monthly + toggles the day-of-month field');
ok(/cfg\.frequency === 'MONTHLY'\) cfg\.dayOfMonth = parseInt/.test(PAGEJS), 'UI sends dayOfMonth for a MONTHLY schedule');
ok(/auto-card__grid/.test(read('css/pages/automation-schedule.css')) && /auto-fit,\s*minmax\(/.test(read('css/pages/automation-schedule.css')), 'A8 responsive card grid reused (no overflow)');

// =============================================================================
section('B — MONTHLY validation + reconciler + retirement');
eq(H.validate(H.jobByKey('monthlyOrderRecommendation'), { enabled: true, frequency: 'MONTHLY', hour: 8, minute: 0 }).error.code, 'INVALID_DAY_OF_MONTH', 'B MONTHLY without dayOfMonth rejected');
eq(H.validate(H.jobByKey('monthlyOrderRecommendation'), { enabled: true, frequency: 'MONTHLY', dayOfMonth: 31, hour: 8, minute: 0 }).error.code, 'INVALID_DAY_OF_MONTH', 'B day 31 rejected (1–28 guarantees every-month firing)');
var vMon = H.validate(H.jobByKey('monthlyOrderRecommendation'), { enabled: true, frequency: 'MONTHLY', dayOfMonth: 10, hour: 14, minute: 0 });
ok(vMon.ok === true && vMon.config.dayOfMonth === 10, 'B valid MONTHLY day 10 accepted');
var ioB = makeIo([]);
H.update({ payload: { key: 'monthlyOrderRecommendation', config: { enabled: true, frequency: 'MONTHLY', dayOfMonth: 10, hour: 14, minute: 0 } } }, ioB);
ok(countHandler(ioB, 'runMonthlyOrderRecommendation') === 1, 'B2 exactly one MONTHLY trigger created');
// B1/B3/B4/B5 weekly + edit + disable
var ioB2 = makeIo([]);
H.update({ payload: { key: 'weeklyInventoryRecommendation', config: { enabled: true, frequency: 'WEEKLY', dayOfWeek: 'MONDAY', hour: 14, minute: 0 } } }, ioB2);
ok(countHandler(ioB2, 'runWeeklyInventoryRecommendation') === 1, 'B1 Weekly Inventory → exactly one trigger');
H.update({ payload: { key: 'weeklyInventoryRecommendation', config: { enabled: true, frequency: 'WEEKLY', dayOfWeek: 'FRIDAY', hour: 9, minute: 0 } } }, ioB2);
ok(countHandler(ioB2, 'runWeeklyInventoryRecommendation') === 1, 'B5 editing the schedule replaces the trigger (still max one)');
H.update({ payload: { key: 'weeklyInventoryRecommendation', config: { enabled: false, frequency: 'WEEKLY', dayOfWeek: 'FRIDAY', hour: 9, minute: 0 } } }, ioB2);
ok(countHandler(ioB2, 'runWeeklyInventoryRecommendation') === 0, 'B3 disable removes the Weekly trigger');
// B6 retirement + isolation from other handlers
var ioB3 = makeIo(['runWeeklyRecommendation', 'runAmazonSnapshotImports']);
var uB3 = H.update({ payload: { key: 'monthlyOrderRecommendation', config: { enabled: true, frequency: 'MONTHLY', dayOfMonth: 10, hour: 14, minute: 0 } } }, ioB3);
ok(countHandler(ioB3, 'runWeeklyRecommendation') === 0 && uB3.data.applied.retiredSwept.runWeeklyRecommendation === 1, 'B6 old ambiguous trigger swept on Save & Apply');
ok(countHandler(ioB3, 'runAmazonSnapshotImports') === 1, 'B6b unrelated Amazon trigger untouched (no 3rd hidden recommendation trigger)');
var allow = H.allowlist();
ok(allow.indexOf('runWeeklyRecommendation') === -1 && allow.indexOf('runWeeklyInventoryRecommendation') !== -1 && allow.indexOf('runMonthlyOrderRecommendation') !== -1, 'B7 retired handler NOT creatable; both split handlers allowlisted');

// =============================================================================
section('C — prerequisite Gap gate: blocked ≠ success, no stale fallback');
(function () {
  var invRan = [];
  var invReady = buildInv({ enabled: function () { return true; }, runGen: function (p) { invRan.push(p); return { ok: true, product: p, summary: {} }; } });
  var r1 = invReady();
  ok(r1.ok === true && r1.status === 'OK' && invRan.length === 1 && invRan[0] === 'INVENTORY', 'C1 Inventory Gap DONE → Weekly proceeds (INVENTORY)');
  var invRan2 = [];
  var invBlocked = buildInv({ enabled: function () { return true; }, runGen: function (p) { invRan2.push(p); return { ok: false, code: 'GAP_JOB_NOT_DONE', jobStatus: 'RUNNING' }; } });
  var r2 = invBlocked();
  ok(r2.ok === false && r2.status === 'BLOCKED' && /GAP|NOT_DONE|RUNNING/.test(String(r2.reason)), 'C2/H1 Inventory Gap not DONE → Weekly BLOCKED (truthful reason, not success)');
  var monRan = [];
  var monReady = buildMonthly({ enabled: function () { return true; }, weeklyStart: function () { monRan.push('start'); return { success: true, data: { status: 'PENDING', runId: 'WREC-1' } }; } });
  var r3 = monReady();
  ok(r3.ok === true && r3.status === 'OK' && monRan.length === 1, 'C3 Order Planning Gap DONE → Monthly proceeds (persistence run started)');
  var monBlocked = buildMonthly({ enabled: function () { return true; }, weeklyStart: function () { return { success: true, data: { status: 'SKIPPED', reason: 'ORDER_PLANNING_GAP_NOT_READY' } }; } });
  var r4 = monBlocked();
  ok(r4.status === 'BLOCKED' && r4.reason === 'ORDER_PLANNING_GAP_NOT_READY', 'C4/H2 Order Planning Gap not READY → Monthly BLOCKED (truthful; not reported success)');
})();

section('D — product isolation (Weekly = INVENTORY only; Monthly = ORDER_PLANNING only)');
(function () {
  var invProducts = [];
  var inv = buildInv({ enabled: function () { return true; }, runGen: function (p) { invProducts.push(p); return { ok: true }; } });
  inv();
  ok(invProducts.length === 1 && invProducts[0] === 'INVENTORY', 'D1/D2 Weekly invokes INVENTORY only (never ORDER_PLANNING)');
  var monStarted = false, monInvoked = [];
  var mon = buildMonthly({ enabled: function () { return true; }, weeklyStart: function () { monStarted = true; return { success: true, data: { status: 'PENDING' } }; } });
  var mr = mon();
  ok(monStarted === true && mr.product === 'ORDER_PLANNING' && mr.mode === 'PERSISTENCE_RUN', 'D3/D4/E2 Monthly enters the ORDER_PLANNING persistence run only (never INVENTORY summary)');
  // the Monthly handler references the 49_ persistence run, not runRecommendationGeneration
  var monSrc = extractFn(GS47, 'runMonthlyOrderRecommendation');
  ok(/weeklyRecoStart_\(weeklyRecoDefaultEnv_\(\)\)/.test(monSrc) && !/runRecommendationGeneration/.test(monSrc), 'D3b Monthly = the canonical 49_→48_ persistence authority (no summary, no INVENTORY)');
  var invSrc = extractFn(GS47, 'runWeeklyInventoryRecommendation');
  ok(/runRecommendationGeneration\('INVENTORY'\)/.test(invSrc) && !/ORDER_PLANNING|weeklyRecoStart_/.test(invSrc), 'D1b Weekly = INVENTORY canonical runtime only (no ORDER_PLANNING, no 49_)');
})();

section('§16 — enable/disable safety; disabled handler no-ops');
(function () {
  var ran = false;
  var invDis = buildInv({ enabled: function () { return false; }, runGen: function () { ran = true; return { ok: true }; } });
  var r = invDis();
  ok(r.skipped === true && ran === false, 'disabled Weekly Inventory does NOT execute the runtime (defensive gate)');
  var mStart = false;
  var monDis = buildMonthly({ enabled: function () { return false; }, weeklyStart: function () { mStart = true; return { success: true }; } });
  ok(monDis().skipped === true && mStart === false, 'disabled Monthly Order does NOT start the persistence run');
})();

// =============================================================================
console.log('\n----------------------------------------');
console.log('WEEKLY INVENTORY + MONTHLY ORDER AUTOMATION (F1-6B): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
