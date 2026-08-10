// Kitchen Mama Operation System — Gap Materialization Scheduler (F1-4B-FM5-R3, migrated in F1-4B-FM5-R4J to the
// backend-owned resumable job owner). Run: node assets/tests/gap-materialization-scheduler-f1-4b-fm5r3.test.js
// -----------------------------------------------------------------------------
// The ~13–14 min all-site materialization is too long for one Apps Script execution, so the daily scheduler no
// longer runs it synchronously. Its named entry points now START the SAME backend-owned resumable job the manual
// "Recalculate All Sites" buttons start (owner = 46_..._job.gs → gapJobStart_ via gapJobDefaultEnv_): manual +
// scheduled share ONE logical job owner. START is quick (freeze context + schedule the first continuation); the
// backend then owns the job to terminal completion. If a product job is already active, START returns it and the
// scheduler reports SKIPPED_ALREADY_RUNNING (never a duplicate competing job). The scheduler authors NO formula,
// performs NO calculation, holds NO lock of its own (the bounded lock lives in gapJobStart_), and the installer
// never touches the Amazon import trigger. Isolated harness: Apps Script globals + gapJobStart_ are stubbed to spy.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var SCHED = read('specs/active/apps-script/44_gap_materialization_scheduler.gs');
var ROUTER = read('specs/active/apps-script/01_router.gs');
var GAP43 = read('specs/active/apps-script/43_api_v1_gap_materialization.gs');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// Build the scheduler in an isolated scope with injectable stubs. `spy` records the job-owner START calls, the env
// products, and installer deletes/creates; `opts` drives the START envelope / exception / installer triggers.
function harness(opts) {
  opts = opts || {};
  var spy = { startCalls: [], envProducts: [], logs: [], deleted: [], created: [], tz: [] };
  var preamble = [
    'var Logger = { log: function (m) { __spy.logs.push(m); } };',
    'var Utilities = { formatDate: function (d, tz, f) { __spy.tz.push(tz); return "2026-08-10 13:30:00"; } };',
    // F1-4B-FM5-R4J job owner (defined in 46) — STUBBED so the scheduler test drives the START envelope:
    'var gapJobDefaultEnv_ = function (p) { __spy.envProducts.push(p); return { __env: p }; };',
    'var gapJobStart_ = function (product, env) { __spy.startCalls.push({ product: product, env: env });' +
      ' if (__opts.startThrows) throw new Error("start boom");' +
      ' if (__opts.startEnv) return __opts.startEnv;' +
      ' return { success: true, data: { runId: (product === "ORDER_PLANNING" ? "GAP-OP-1" : "GAP-INV-1"), status: "PENDING", scopesTotal: 34 }, errors: [] }; };',
    // ScriptApp — records installer deletes/creates without touching a real project:
    'var ScriptApp = { getProjectTriggers: function () { return (__opts.triggers || []).map(function (h) { return { getHandlerFunction: function () { return h; } }; }); },' +
      ' deleteTrigger: function (t) { __spy.deleted.push(t.getHandlerFunction()); },' +
      ' newTrigger: function (fn) { var b = { _fn: fn, timeBased: function () { return b; }, everyDays: function () { return b; }, atHour: function () { return b; }, nearMinute: function () { return b; }, create: function () { __spy.created.push(fn); } }; return b; } };'
  ].join('\n');
  var api = (new Function('__spy', '__opts', preamble + '\n' + SCHED + '\n return {' +
    ' runInv: runDailyInventoryGapMaterialization, runOp: runDailyOrderPlanningGapMaterialization,' +
    ' install: installGapMaterializationTriggers_, uninstall: uninstallGapMaterializationTriggers_,' +
    ' isOwned: gapSchedIsOwnedHandler_, TZ: GAP_SCHED_TZ_ };'))(spy, opts);
  return { api: api, spy: spy };
}

var CODE = SCHED.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

// =============================================================================================================
section('A/B/E — the daily entry points START the SAME canonical job owner (manual + scheduled share it)');
var hA = harness();
var rInv = hA.api.runInv();
eq([hA.spy.startCalls.length, hA.spy.startCalls[0] && hA.spy.startCalls[0].product], [1, 'INVENTORY'], 'A1 Inventory scheduler STARTs the job once with product INVENTORY');
eq([rInv.status, rInv.runId, rInv.product], ['STARTED', 'GAP-INV-1', 'INVENTORY'], 'A2 STARTED summary carries the job runId + product (no synchronous 14-min run)');
eq(hA.spy.envProducts[0], 'INVENTORY', 'A3 it uses gapJobDefaultEnv_(INVENTORY) — the SAME owner the manual button drives');
var hB = harness();
var rOp = hB.api.runOp();
eq([hB.spy.startCalls[0].product, rOp.status, rOp.runId], ['ORDER_PLANNING', 'STARTED', 'GAP-OP-1'], 'B Order Planning scheduler STARTs the ORDER_PLANNING job once');
ok(/gapJobStart_\(product, gapJobDefaultEnv_\(product\)\)/.test(SCHED), 'E scheduler delegates to gapJobStart_ (the ONE canonical owner)');
ok(/handleStartInventoryReplenishmentGapJob_\(body\)/.test(ROUTER) && /handleStartOrderPlanningGapJob_\(body\)/.test(ROUTER) && /gapJob\.status\.get/.test(ROUTER), 'E2 the router START handlers dispatch the SAME job owner (manual + scheduled = one pathway) + read-only status');

section('§14/§17 — an already-active job → SKIPPED_ALREADY_RUNNING (no duplicate competing job)');
var hDup = harness({ startEnv: { success: true, data: { runId: 'GAP-INV-9', status: 'RUNNING', alreadyRunning: true }, errors: [] } });
eq(hDup.api.runInv().status, 'SKIPPED_ALREADY_RUNNING', 'DUP1 START reports alreadyRunning → SKIPPED_ALREADY_RUNNING');

section('G — no fake success: START failure / exception → ERROR');
var hErr = harness({ startEnv: { success: false, data: null, errors: [{ code: 'GAP_JOB_LOCK_UNAVAILABLE' }] } });
eq(hErr.api.runOp().status, 'ERROR', 'G1 START success:false → scheduler status ERROR (never a fabricated success)');
var hThrow = harness({ startThrows: true });
eq(hThrow.api.runInv().status, 'ERROR', 'G2 an exception in START → ERROR (caught; no fake success)');
ok(rInv.startedAt && rInv.finishedAt, 'G3 summary carries startedAt / finishedAt');

section('C — orchestration only: NO formula, NO calculation, NO own lock, NO synchronous batch');
ok(!/Math\.(ceil|floor|round)/.test(CODE), 'C1 no gap/carton arithmetic in the scheduler');
ok(!/KMTPP|KMMSA|KMALLOC|KMHP|KMCALC|projectTimePhasedSupply|allocateMarketplaceReceiverSupply|projectHorizons/.test(CODE), 'C2 no runtime formula owner invoked/duplicated in the scheduler');
ok(!/gapOpMapFromLines_|gapInvMapFromLines_|gapUpsertByKey_|workspaceGet|recommendation\.workspace\.get/.test(CODE), 'C3 scheduler does not map / upsert / recompute');
ok(!/handleRecalculateInventoryReplenishmentGapBatch_|handleRecalculateOrderPlanningGapBatch_/.test(CODE), 'C4 scheduler no longer runs the synchronous monolithic batch (no second calculation implementation)');
ok(!/LockService/.test(CODE), 'C5 the scheduler holds NO lock of its own (the bounded run lock now lives in gapJobStart_)');

section('K — timezone authority Asia/Taipei');
eq(hA.api.TZ, 'Asia/Taipei', 'K1 GAP_SCHED_TZ_ = Asia/Taipei');
ok(hA.spy.tz.length > 0 && hA.spy.tz.every(function (t) { return t === 'Asia/Taipei'; }), 'K2 all scheduler timestamps are formatted in Asia/Taipei');

section('L — installer duplicate-protection never rewrites the Amazon import trigger');
eq([hA.api.isOwned('runDailyInventoryGapMaterialization'), hA.api.isOwned('runDailyOrderPlanningGapMaterialization')], [true, true], 'L1 the two gap entry points are the scheduler-owned handlers');
eq(hA.api.isOwned('runAmazonSnapshotImports'), false, 'L2 runAmazonSnapshotImports is NOT scheduler-owned (installer will never delete it)');
var hInst = harness({ triggers: ['runAmazonSnapshotImports', 'runDailyInventoryGapMaterialization', 'someOtherJob'] });
var rInst = hInst.api.install();
eq(hInst.spy.deleted, ['runDailyInventoryGapMaterialization'], 'L3 installer deletes ONLY the pre-existing gap trigger (Amazon + other handlers untouched)');
eq(hInst.spy.created, ['runDailyInventoryGapMaterialization', 'runDailyOrderPlanningGapMaterialization'], 'L4 installer creates the two daily gap triggers');
eq(rInst.timezone, 'Asia/Taipei', 'L5 installer reports the Asia/Taipei cadence');
ok(!/continueInventoryGapMaterializationJob|continueOrderPlanningGapMaterializationJob/.test(CODE), 'L6 the daily installer never references the job CONTINUATION handlers (those are owned + cleaned solely by 46.gs)');

section('D/H/I/J — no scheduler-side row writes / page calc / DB-schema creation / order-shipment writes');
ok(!/appendRow|insertRow|setValues/.test(CODE), 'D2 the scheduler writes NO sheet rows itself (idempotency + writes are the job/UPSERT owner\'s)');
ok(!/openTarget|getSheetByName|SpreadsheetApp|createSheet|insertSheet|setName/i.test(CODE), 'H/I scheduler performs NO page-load calc and NO sheet/schema creation');
ok(!/shipment|purchase_order|request_order|notification|warning|executionPlan|aiPlan|sendEmail|MailApp/i.test(CODE), 'J no AI Plan / Execution Plan / warning / order / shipment write in the scheduler');
var READ = (GAP43.split('function gapReadScopeRows_')[1] || '').split('\nfunction handleGetOrderPlanningGap_')[0];
ok(!/workspaceGet|recommendation\.workspace\.get|projectTimePhasedSupply|KMTPP|KMHP/.test(READ), 'H2 materialized read owner (page expand) performs ZERO recalculation — reads stored rows only');

console.log('\n----------------------------------------');
console.log('GAP MATERIALIZATION SCHEDULER (F1-4B-FM5-R3 / R4J job owner): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
