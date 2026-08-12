// Kitchen Mama Operation System — ADMIN-AUTOMATION-R1 Automation Schedule Settings.
// Run: node assets/tests/automation-schedule-admin-r1.test.js
// -----------------------------------------------------------------------------
// Admin UI + schedule config owner + trigger-management API. Config lives in Script Properties (NOT the DB); the
// UPDATE action reconciles ONLY the owned time trigger via a strict handler allowlist. These tests drive the
// backend owner (45_api_v1_automation_schedule.gs) with an in-memory FAKE io (props + trigger list), so no real
// PropertiesService / ScriptApp is touched, and assert the frontend/router/client wiring by source.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var SRC = read('specs/active/apps-script/45_api_v1_automation_schedule.gs');
var ROUTER = read('specs/active/apps-script/01_router.gs');
var DBAPI = read('js/api/operation-system-db-api.js');
var PAGEJS = read('js/pages/automation-schedule.js');
var PAGEHTML = read('html/pages/automation-schedule.html');
var PAGECSS = read('css/pages/automation-schedule.css');
var APPJS = read('js/app.js');
var INDEX = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

var H = (new Function(SRC + '\n return {'
  + ' get: handleAutomationScheduleGet_, update: handleAutomationScheduleUpdate_,'
  + ' validate: automationValidateJobConfig_, reconcile: automationReconcileTrigger_,'
  + ' readConfig: automationReadConfig_, allowed: automationHandlerAllowed_, allowlist: automationAllowedHandlers_,'
  + ' deletable: automationHandlerDeletable_,'
  + ' warnings: automationDependencyWarnings_, jobByKey: automationJobByKey_, PROP_KEY: AUTOMATION_SCHEDULE_PROP_KEY_ };'))();

// In-memory io mirroring the production contract (incl. the allowlist delete-guard).
function makeIo(triggerHandlers, configJson) {
  var props = {}; props[H.PROP_KEY] = configJson || null;
  var triggers = (triggerHandlers || []).map(function (h) { return { handler: h }; });
  var log = { deleted: [], created: [] };
  return {
    now: function () { return new Date(); },
    tz: function () { return 'Asia/Taipei'; },
    stamp: function () { return '2026-08-08 13:30:00'; },
    getConfig: function () { return props[H.PROP_KEY]; },
    setConfig: function (v) { props[H.PROP_KEY] = v; log.wrote = (log.wrote || 0) + 1; },
    getTriggers: function () { return triggers.map(function (t) { return { handler: t.handler }; }); },
    deleteTriggersByHandler: function (handler) {
      if (!H.deletable(handler)) return 0;                                // production guard mirrored (allowlisted OR retired)
      var n = 0; for (var i = triggers.length - 1; i >= 0; i--) { if (triggers[i].handler === handler) { triggers.splice(i, 1); n++; } }
      log.deleted.push({ handler: handler, n: n }); return n;
    },
    createTrigger: function (handler, norm) {
      if (!H.allowed(handler)) return null;                               // retired handlers are deletable but NEVER creatable
      triggers.push({ handler: handler, norm: norm }); log.created.push({ handler: handler, norm: norm });
      return { handler: handler, frequency: norm.frequency, hour: norm.hour, minute: norm.minute, dayOfWeek: norm.dayOfWeek || null, dayOfMonth: (norm.dayOfMonth != null ? norm.dayOfMonth : null) };
    },
    _triggers: triggers, _props: props, _log: log
  };
}
function jobsOf(res) { var m = {}; (res.data.jobs || []).forEach(function (j) { m[j.key] = j; }); return m; }
function countHandler(io, h) { var n = 0; io._triggers.forEach(function (t) { if (t.handler === h) n++; }); return n; }
var INV = 'runDailyInventoryGapMaterialization', AMZ = 'runAmazonSnapshotImports', OPG = 'runDailyOrderPlanningGapMaterialization';

// =============================================================================================================
section('A — config read (no property → registry defaults for all four automations)');
var g = H.get({}, makeIo([]));
ok(g.success === true, 'A1 GET succeeds with no saved config');
var jm = jobsOf(g);
ok(jm.amazonImport && jm.amazonImport.hour === 12 && jm.amazonImport.minute === 30, 'A2 Amazon Import default 12:30');
ok(jm.inventoryGap && jm.inventoryGap.hour === 13 && jm.inventoryGap.minute === 30, 'A3 Inventory Gap default 13:30');
ok(jm.orderPlanningGap && jm.orderPlanningGap.hour === 3 && jm.orderPlanningGap.minute === 30, 'A4 Order Planning Gap default 03:30');
// F1-6B — the ambiguous Weekly Recommendation is split into two product-isolated automations (opt-in, default off).
ok(!jm.weeklyRecommendation, 'A5 the ambiguous Weekly Recommendation entry is retired (no longer surfaced)');
ok(jm.weeklyInventoryRecommendation && jm.weeklyInventoryRecommendation.status === 'DISABLED' && jm.weeklyInventoryRecommendation.frequency === 'WEEKLY' && jm.weeklyInventoryRecommendation.implemented === true, 'A5a Weekly Inventory Recommendation = WEEKLY, DISABLED (opt-in)');
ok(jm.monthlyOrderRecommendation && jm.monthlyOrderRecommendation.status === 'DISABLED' && jm.monthlyOrderRecommendation.frequency === 'MONTHLY' && jm.monthlyOrderRecommendation.dayOfMonth === 10, 'A5b Monthly Order Recommendation = MONTHLY, day 10, DISABLED (opt-in)');

section('B — config update persists + is read back');
var ioB = makeIo([]);
var uB = H.update({ payload: { key: 'inventoryGap', config: { enabled: true, frequency: 'DAILY', hour: 14, minute: 15 } } }, ioB);
ok(uB.success === true, 'B1 UPDATE succeeds');
ok(JSON.parse(ioB._props[H.PROP_KEY]).jobs.inventoryGap.hour === 14, 'B2 the Script-Property config JSON now stores hour 14');
ok(jobsOf(H.get({}, ioB)).inventoryGap.hour === 14, 'B3 a fresh GET reads back 14:15');

section('C — time validation');
ok(H.validate(H.jobByKey('inventoryGap'), { enabled: true, frequency: 'DAILY', hour: 24, minute: 0 }).error.code === 'INVALID_TIME', 'C1 hour 24 rejected');
ok(H.validate(H.jobByKey('inventoryGap'), { enabled: true, frequency: 'DAILY', hour: 13, minute: 60 }).error.code === 'INVALID_TIME', 'C2 minute 60 rejected');
ok(H.validate(H.jobByKey('inventoryGap'), { enabled: true, frequency: 'DAILY', hour: 13.5, minute: 0 }).error.code === 'INVALID_TIME', 'C3 non-integer hour rejected');
ok(H.validate(H.jobByKey('inventoryGap'), { enabled: true, frequency: 'DAILY', hour: 0, minute: 0 }).ok === true, 'C4 00:00 accepted (valid boundary)');

section('D — enabled/disabled controls the trigger');
var ioD = makeIo([]);
H.update({ payload: { key: 'inventoryGap', config: { enabled: true, frequency: 'DAILY', hour: 13, minute: 30 } } }, ioD);
ok(countHandler(ioD, INV) === 1, 'D1 enabled → exactly one owned trigger created');
H.update({ payload: { key: 'inventoryGap', config: { enabled: false, frequency: 'DAILY', hour: 13, minute: 30 } } }, ioD);
ok(countHandler(ioD, INV) === 0, 'D2 disabled → the owned trigger is removed');

section('E — daily schedule descriptor');
var ioE = makeIo([]);
var uE = H.update({ payload: { key: 'orderPlanningGap', config: { enabled: true, frequency: 'DAILY', hour: 3, minute: 30 } } }, ioE);
ok(uE.data.applied.reconcile.created === 1 && ioE._log.created[0].norm.frequency === 'DAILY', 'E1 DAILY trigger created with DAILY frequency');

section('F — weekly schedule representation + validation');
ok(jm.weeklyInventoryRecommendation.weeklyCapable === true && jm.weeklyInventoryRecommendation.status === 'DISABLED', 'F1 Weekly Inventory Recommendation is a weekly-capable, disabled (opt-in) row');
ok(H.validate(H.jobByKey('inventoryGap'), { enabled: true, frequency: 'WEEKLY', hour: 14, minute: 0 }).error.code === 'INVALID_DAY_OF_WEEK', 'F2 WEEKLY without dayOfWeek rejected');
var wOk = H.validate(H.jobByKey('inventoryGap'), { enabled: true, frequency: 'WEEKLY', dayOfWeek: 'monday', hour: 14, minute: 0 });
ok(wOk.ok === true && wOk.config.dayOfWeek === 'MONDAY', 'F3 WEEKLY with a valid dayOfWeek accepted + canonicalized');

section('G — timezone authority = Asia/Taipei');
ok(g.data.timezone === 'Asia/Taipei' && g.meta.timezone === 'Asia/Taipei', 'G1 view + meta timezone = Asia/Taipei');
ok(jm.inventoryGap.timezone === 'Asia/Taipei', 'G2 each job carries Asia/Taipei');

section('H/I — only the matching handler trigger is touched; unrelated triggers untouched');
var ioHI = makeIo([AMZ, INV, 'someFormSubmitHandler', OPG, 'onEditEmailNotifier']);
H.update({ payload: { key: 'inventoryGap', config: { enabled: true, frequency: 'DAILY', hour: 13, minute: 30 } } }, ioHI);
// The reconcile deletes ONLY the inventory-gap handler; a separate retired-handler sweep runs too but deletes nothing
// here (no runWeeklyRecommendation present). So the ONLY handler actually removed is the inventory-gap one.
var realDeletes = ioHI._log.deleted.filter(function (d) { return d.n > 0; });
ok(realDeletes.length === 1 && realDeletes[0].handler === INV, 'H1 the only handler actually deleted is the inventory-gap handler');
ok(countHandler(ioHI, AMZ) === 1 && countHandler(ioHI, OPG) === 1, 'I1 Amazon + Order-Planning triggers untouched');
ok(countHandler(ioHI, 'someFormSubmitHandler') === 1 && countHandler(ioHI, 'onEditEmailNotifier') === 1, 'I2 unrelated form + email triggers untouched');
ok(countHandler(ioHI, INV) === 1, 'I3 exactly one inventory-gap trigger remains after reconcile');

section('J — duplicate trigger prevention (pre-existing duplicates collapse to one)');
var ioJ = makeIo([INV, INV, INV]);   // 3 stale duplicates
H.update({ payload: { key: 'inventoryGap', config: { enabled: true, frequency: 'DAILY', hour: 13, minute: 30 } } }, ioJ);
ok(countHandler(ioJ, INV) === 1, 'J1 three duplicate triggers reconciled down to exactly one');

section('K — re-save is idempotent');
var ioK = makeIo([]);
var payloadK = { payload: { key: 'inventoryGap', config: { enabled: true, frequency: 'DAILY', hour: 13, minute: 30 } } };
H.update(payloadK, ioK); H.update(payloadK, ioK);
ok(countHandler(ioK, INV) === 1, 'K1 saving the same schedule twice still yields exactly one trigger');
ok(JSON.parse(ioK._props[H.PROP_KEY]).jobs.inventoryGap.hour === 13, 'K2 config stable across re-save');

section('L — disabled job leaves zero owned triggers');
var ioL = makeIo([INV]);
H.update({ payload: { key: 'inventoryGap', config: { enabled: false, frequency: 'DAILY', hour: 13, minute: 30 } } }, ioL);
ok(countHandler(ioL, INV) === 0, 'L1 disabling removes the owned trigger and creates none');

section('M — the two split Recommendation automations are schedulable (F1-6B)');
var ioM = makeIo([]);
var uMw = H.update({ payload: { key: 'weeklyInventoryRecommendation', config: { enabled: true, frequency: 'WEEKLY', dayOfWeek: 'MONDAY', hour: 14, minute: 0 } } }, ioM);
ok(uMw.success === true && countHandler(ioM, 'runWeeklyInventoryRecommendation') === 1, 'M1 Weekly Inventory Recommendation → exactly one WEEKLY trigger (runWeeklyInventoryRecommendation)');
var uMm = H.update({ payload: { key: 'monthlyOrderRecommendation', config: { enabled: true, frequency: 'MONTHLY', dayOfMonth: 10, hour: 14, minute: 0 } } }, ioM);
ok(uMm.success === true && countHandler(ioM, 'runMonthlyOrderRecommendation') === 1, 'M2 Monthly Order Recommendation → exactly one MONTHLY trigger (runMonthlyOrderRecommendation)');
var monTrig = ioM._log.created.filter(function (c) { return c.handler === 'runMonthlyOrderRecommendation'; })[0];
ok(monTrig && monTrig.norm.frequency === 'MONTHLY' && monTrig.norm.dayOfMonth === 10, 'M2a MONTHLY trigger carries dayOfMonth 10');
var allow = H.allowlist();
ok(allow.indexOf('runWeeklyInventoryRecommendation') !== -1 && allow.indexOf('runMonthlyOrderRecommendation') !== -1 && allow.indexOf('runWeeklyRecommendation') === -1 && allow.length === 5, 'M3 allowlist has both split handlers + NOT the retired one (5 implemented handlers)');
ok(jobsOf(H.get({}, ioM)).monthlyOrderRecommendation.dayOfMonth === 10 && jobsOf(H.get({}, ioM)).weeklyInventoryRecommendation.status === 'ENABLED', 'M4 persisted split schedules read back (Monthly day 10; Weekly ENABLED)');
var uMoff = H.update({ payload: { key: 'monthlyOrderRecommendation', config: { enabled: false, frequency: 'MONTHLY', dayOfMonth: 10, hour: 14, minute: 0 } } }, ioM);
ok(uMoff.success === true && countHandler(ioM, 'runMonthlyOrderRecommendation') === 0, 'M5 disabling Monthly Order removes its trigger (execution stops)');
// retirement sweep: a lingering old ambiguous trigger is deleted on any Save & Apply.
var ioMr = makeIo(['runWeeklyRecommendation']);
var uMr = H.update({ payload: { key: 'weeklyInventoryRecommendation', config: { enabled: true, frequency: 'WEEKLY', dayOfWeek: 'MONDAY', hour: 14, minute: 0 } } }, ioMr);
ok(countHandler(ioMr, 'runWeeklyRecommendation') === 0 && uMr.data.applied.retiredSwept.runWeeklyRecommendation === 1, 'M6 a pre-migration runWeeklyRecommendation trigger is SWEPT on Save & Apply (no 3rd hidden trigger)');

section('N — GET (page load) writes NOTHING (no property write, no trigger mutation)');
var ioN = makeIo([AMZ]);
var beforeProp = ioN._props[H.PROP_KEY], beforeCount = ioN._triggers.length;
H.get({}, ioN);
ok(ioN._props[H.PROP_KEY] === beforeProp && ioN._triggers.length === beforeCount, 'N1 GET mutates no property and no trigger');
ok((ioN._log.wrote || 0) === 0 && ioN._log.deleted.length === 0 && ioN._log.created.length === 0, 'N2 GET issued zero writes/deletes/creates');
ok(/mount:\s*function[\s\S]*loadAndRender\(\)/.test(PAGEJS) && !/mount:\s*function[\s\S]{0,400}updateAutomationSchedule/.test(PAGEJS), 'N3 page mount calls loadAndRender (read-only), never update on load');

section('O — no DB / schema access anywhere in the owner');
ok(!/getOperationDb|SpreadsheetApp|openTarget|setValues|appendRow|insertRow|prodRequireSheet_|INV_GAP_TABLE_/.test(SRC), 'O1 45_ touches no spreadsheet DB / table / sheet API');

section('P — no Inventory / Order Planning formula dependency');
ok(!/KMHP|KMTPP|KMCALC|KMMSA|KMALLOC|gapInvMapFromLines_|handleRecalculate/.test(SRC), 'P1 45_ references no gap/formula runtime owner');

section('Q — no secret / deployment identifier exposed to the UI');
var getJson = JSON.stringify(H.get({}, makeIo([AMZ])).data);
ok(!/AKfyc|\/exec|script\.google\.com|\/macros\/s\//.test(getJson), 'Q1 GET payload exposes no Script ID / exec URL / deployment id');
ok(!/AKfyc|\/exec|script\.google\.com|spreadsheetId|SpreadsheetApp/.test(PAGEJS + PAGEHTML + PAGECSS), 'Q2 the page assets contain no secret / deployment identifier');
ok(/details:\s*\{ handler:/.test(SRC) && !/deploymentId|scriptId|spreadsheetId/.test(SRC), 'Q3 the only technical field surfaced is the handler name (under Details)');

section('R — an existing (manually-created) Amazon trigger is not changed until Save & Apply');
var ioR = makeIo([AMZ]);
H.get({}, ioR);                                   // opening the page
ok(countHandler(ioR, AMZ) === 1 && ioR._log.deleted.length === 0 && ioR._log.created.length === 0, 'R1 GET leaves the existing Amazon trigger exactly as-is');
ok(jobsOf(H.get({}, ioR)).amazonImport.triggerActive === true, 'R2 GET represents the existing Amazon trigger truthfully as Active');

section('wiring — router + KM.DB client + navigation + section map');
ok(/action === 'automationSchedule\.get'/.test(ROUTER) && /handleAutomationScheduleGet_\(body\)/.test(ROUTER), 'X1 router dispatches automationSchedule.get');
ok(/action === 'automationSchedule\.update'/.test(ROUTER) && /handleAutomationScheduleUpdate_\(body\)/.test(ROUTER), 'X2 router dispatches automationSchedule.update');
ok(/KM\.DB\.getAutomationSchedule = function\(\)/.test(DBAPI) && /automationSchedule\.get/.test(DBAPI), 'X3 KM.DB.getAutomationSchedule wired (read runner)');
ok(/KM\.DB\.updateAutomationSchedule = function\(payload\)/.test(DBAPI) && /automationSchedule\.update/.test(DBAPI), 'X4 KM.DB.updateAutomationSchedule wired (command runner)');
ok(/showSection\('automation'\)/.test(INDEX) && /Automation Schedule/.test(INDEX), 'X5 Administration → Automation Schedule nav item present');
ok(/id="automation-schedule-mount"/.test(INDEX) && /pages\/automation-schedule\.css/.test(INDEX) && /pages\/automation-schedule\.js/.test(INDEX), 'X6 mount point + css + js included in index.html');
ok((APPJS.match(/'automation':\s*'automation-schedule-section'/g) || []).length === 2, 'X7 section map wired in both showSection maps');
ok(/loadPartial\('automation-schedule'/.test(PAGEJS) && /KM\.lifecycle\.register\('automation-schedule-section'/.test(PAGEJS), 'X8 page registers its partial + lifecycle mount');

section('UX — approximate-window note + duplicate-submit guard present');
ok(/scheduling window/i.test(PAGEHTML) && /scheduling window/i.test(SRC), 'U1 the "approximate scheduling window" note is shown (page) + in meta (server)');
ok(/_busy\[key\]/.test(PAGEJS) && /btn\.disabled = true/.test(PAGEJS), 'U2 Save disables duplicate submission while in flight');

console.log('\n----------------------------------------');
console.log('AUTOMATION SCHEDULE ADMIN (ADMIN-AUTOMATION-R1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
