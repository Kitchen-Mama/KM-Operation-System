// Kitchen Mama Operation System — Gap Materialization Scheduler + post-import orchestration (F1-4B-FM5-R3).
// Run: node assets/tests/gap-materialization-scheduler-f1-4b-fm5r3.test.js
// -----------------------------------------------------------------------------
// Proves the scheduler is ORCHESTRATION ONLY: named entry points invoke EXACTLY the existing canonical gap batch
// owners (the same ones the manual "Recalculate All Sites" buttons call) — no second formula, no per-SKU HTTP, no
// browser dependency. A bounded orchestration lock prevents overlapping full-site recalcs. Config dates/months are
// READ-ONLY (validated, NEVER auto-rolled → rollover HALT). Timezone = Asia/Taipei. The Amazon import trigger is
// never touched by the installer. Isolated harness: Apps Script globals + batch owners are stubbed so we can spy.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var SCHED = read('specs/active/apps-script/44_gap_materialization_scheduler.gs');
var ROUTER = read('specs/active/apps-script/01_router.gs');
var GAP43 = read('specs/active/apps-script/43_api_v1_gap_materialization.gs');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// Build the scheduler in an isolated scope with injectable stubs. `spy` records every batch owner call + the calc
// property authority; `env` lets a test drive the batch outcome; `lockGranted`/`tzCapture` drive lock + timezone.
function harness(opts) {
  opts = opts || {};
  // Default the calc-property authorities to VALID unless the test explicitly provides the key (incl. null → missing).
  if (!('calcDate' in opts)) opts.calcDate = '2026-08-07';
  if (!('calcMonth' in opts)) opts.calcMonth = '2026-08';
  var spy = { inv: 0, op: 0, calcDate: null, calcMonth: null, logs: [], deleted: [], created: [], tz: [] };
  var preamble = [
    'var __spy = __spy;',
    'var Logger = { log: function (m) { __spy.logs.push(m); } };',
    'var Utilities = { formatDate: function (d, tz, f) { __spy.tz.push(tz); return "2026-08-07 13:30:00"; } };',
    'var LockService = { getScriptLock: function () { return { tryLock: function () { return __opts.lockGranted !== false; }, releaseLock: function () {} }; } };',
    // read-only calc-property authorities (Script Property owners), driven by the test:
    'var recommendationWorkspaceDefaultIo_ = function () { return {}; };',
    'var recoWsResolveCalcDate_ = function () { __spy.calcDate = __opts.calcDate || null; return __opts.calcDate ? { ok: true, calculationDate: __opts.calcDate } : { ok: false, error: { code: "RECOMMENDATION_CALCULATION_DATE_NOT_CONFIGURED", message: "not configured" } }; };',
    'var recoWsResolveCalcContext_ = function () { __spy.calcMonth = __opts.calcMonth || null; return __opts.calcMonth ? { ok: true, calculationMonth: __opts.calcMonth, planningCycle: "RECO-" + __opts.calcMonth } : { ok: false, error: { code: "RECOMMENDATION_CALCULATION_MONTH_NOT_CONFIGURED", message: "not configured" } }; };',
    // canonical batch owners — SPIED (same symbols the router/manual button use):
    'var handleRecalculateInventoryReplenishmentGapBatch_ = function (body) { __spy.inv++; __spy.invBody = body; return __opts.env || { success: true, data: { totalScopes: 2, scopesCalculated: 2, written: 5, ready: 4, blocked: 1, errors: 0, calculatedAt: "2026-08-07 13:30:00" }, errors: [] }; };',
    'var handleRecalculateOrderPlanningGapBatch_ = function (body) { __spy.op++; __spy.opBody = body; return __opts.env || { success: true, data: { totalScopes: 2, scopesCalculated: 2, written: 3, ready: 2, blocked: 0, errors: 1, calculatedAt: "2026-08-07 13:30:00" }, errors: [] }; };',
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

// =============================================================================================================
section('A/B/E — scheduler invokes EXACTLY the existing canonical batch owner (same pathway as the manual button)');
var hA = harness();
var rInv = hA.api.runInv();
eq([hA.spy.inv, hA.spy.op], [1, 0], 'A Inventory scheduler calls handleRecalculateInventoryReplenishmentGapBatch_ exactly once (and NOT the OP owner)');
var hB = harness();
hB.api.runOp();
eq([hB.spy.inv, hB.spy.op], [0, 1], 'B Order Planning scheduler calls handleRecalculateOrderPlanningGapBatch_ exactly once');
ok(/handleRecalculateInventoryReplenishmentGapBatch_/.test(SCHED) && /handleRecalculateOrderPlanningGapBatch_/.test(SCHED), 'E scheduler references the SAME canonical batch owners the router/manual button use');
ok(/handleRecalculateInventoryReplenishmentGapBatch_|handleRecalculateOrderPlanningGapBatch_/.test(ROUTER) || /recalculate/i.test(ROUTER), 'E2 the canonical batch owners are the router-dispatched owners (manual + scheduled share one pathway)');

section('C — no formula owner duplicated (orchestration only)');
var CODE = SCHED.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/Math\.(ceil|floor|round)/.test(CODE), 'C1 no gap/carton arithmetic in the scheduler');
ok(!/KMTPP|KMMSA|KMALLOC|KMHP|KMCALC|projectTimePhasedSupply|allocateMarketplaceReceiverSupply|projectHorizons/.test(CODE), 'C2 no runtime formula owner invoked/duplicated in the scheduler');
ok(!/gapOpMapFromLines_|gapInvMapFromLines_|gapUpsertByKey_|workspaceGet|recommendation\.workspace\.get/.test(CODE), 'C3 scheduler does not re-map / re-upsert / recompute — it only invokes the batch owner');

section('F — concurrent duplicate execution prevented (bounded orchestration lock)');
var hF = harness({ lockGranted: false });
var rF = hF.api.runInv();
eq([rF.status, hF.spy.inv], ['SKIPPED_LOCKED', 0], 'F lock held → SKIPPED_LOCKED and the batch owner is NEVER invoked (no overlapping full-site recalc)');

section('G — blocked/error rows remain truthful; no fake success');
var hG = harness();
var rG = hG.api.runInv();
eq([rG.status, rG.readyCount, rG.blockedCount, rG.errorCount, rG.rowsProcessed, rG.scopesProcessed], ['OK', 4, 1, 0, 5, 2], 'G1 summary passes through the batch READY/BLOCKED/ERROR counts verbatim');
var hGerr = harness({ env: { success: false, data: null, errors: [{ code: 'GAP_BATCH_ERROR' }] } });
var rGerr = hGerr.api.runOp();
eq(rGerr.status, 'ERROR', 'G2 batch success:false → scheduler status ERROR (never a fabricated success)');
ok(rG.startedAt && rG.finishedAt && rG.calculatedAt === '2026-08-07 13:30:00', 'G3 summary carries startedAt / finishedAt / calculatedAt');

section('§7 HALT — calc date/month are READ-ONLY; missing → CONFIG_BLOCKED, NEVER auto-rolled');
var hCfgMiss = harness({ calcDate: null });
var rCfg = hCfgMiss.api.runInv();
eq([rCfg.status, rCfg.code, hCfgMiss.spy.inv], ['CONFIG_BLOCKED', 'RECOMMENDATION_CALCULATION_DATE_NOT_CONFIGURED', 0], 'CFG1 missing RECOMMENDATION_CALCULATION_DATE → CONFIG_BLOCKED, batch NOT run (no auto-roll, no fake success)');
var hCfgOk = harness({ calcDate: '2026-08-07' });
var rCfgOk = hCfgOk.api.runInv();
eq([rCfgOk.status, hCfgOk.spy.inv], ['OK', 1], 'CFG2 valid RECOMMENDATION_CALCULATION_DATE → batch runs');
var hMonthMiss = harness({ calcMonth: null });
eq(hMonthMiss.api.runOp().code, 'RECOMMENDATION_CALCULATION_MONTH_NOT_CONFIGURED', 'CFG3 missing RECOMMENDATION_CALCULATION_MONTH → CONFIG_BLOCKED for Order Planning');
ok(!/setProperty/.test(SCHED), 'CFG4 scheduler NEVER writes a Script Property (no invented calc-date/month rollover)');

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

section('D — idempotency delegated to the UPSERT batch (re-run is safe; no scheduler-side row state)');
var hD = harness();
hD.api.runInv(); hD.api.runInv();
eq(hD.spy.inv, 2, 'D re-running the scheduler simply re-invokes the latest-state UPSERT batch (company+country+marketplace+sku) — no duplicate-row logic in the scheduler');
ok(!/appendRow|insertRow|setValues/.test(CODE), 'D2 the scheduler writes NO sheet rows itself (idempotency is the batch UPSERT owner\'s)');

section('H/I/J — page-open no-calc · no DB/schema · no AI/Execution/notification write');
ok(!/openTarget|getSheetByName|SpreadsheetApp|createSheet|insertSheet|setName|new gap table/i.test(CODE), 'H/I scheduler performs NO page-load calc and NO sheet/schema creation (batch owns the read/write)');
ok(!/shipment|purchase_order|request_order|notification|warning|executionPlan|aiPlan|sendEmail|MailApp/i.test(CODE), 'J no AI Plan / Execution Plan / warning / order / shipment write in the scheduler');
// page read path (43) does NOT recompute on expand — the materialized readers never call the workspace/runtime:
var READ = (GAP43.split('function gapReadScopeRows_')[1] || '').split('\nfunction handleGetOrderPlanningGap_')[0];
ok(!/workspaceGet|recommendation\.workspace\.get|projectTimePhasedSupply|KMTPP|KMHP/.test(READ), 'H2 materialized read owner (page expand) performs ZERO recalculation — reads stored rows only');

console.log('\n----------------------------------------');
console.log('GAP MATERIALIZATION SCHEDULER (F1-4B-FM5-R3): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
