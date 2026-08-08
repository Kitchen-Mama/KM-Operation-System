// Kitchen Mama Operation System — Gap Materialization Scheduler + post-import orchestration (F1-4B-FM5-R3,
// updated for F1-4B-FM5-R4 deterministic calculation-context injection).
// Run: node assets/tests/gap-materialization-scheduler-f1-4b-fm5r3.test.js
// -----------------------------------------------------------------------------
// The scheduler is ORCHESTRATION ONLY: named entry points DERIVE the canonical deterministic Asia/Taipei
// calculation context (R4; via the ONE owner in 43) and INJECT it into EXACTLY the existing canonical gap batch
// owners (the same ones the manual "Recalculate All Sites" buttons call) — no second formula, no per-SKU HTTP, no
// browser dependency, and NO Script Property is required or mutated. A bounded orchestration lock prevents
// overlapping full-site recalcs. Timezone = Asia/Taipei. The installer never touches the Amazon import trigger.
// Isolated harness: Apps Script globals + the 43 context owner + the batch owners are stubbed so we can spy.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var SCHED = read('specs/active/apps-script/44_gap_materialization_scheduler.gs');
var ROUTER = read('specs/active/apps-script/01_router.gs');
var GAP43 = read('specs/active/apps-script/43_api_v1_gap_materialization.gs');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// Build the scheduler in an isolated scope with injectable stubs. `spy` records batch-owner calls, the derived
// context, and the injected io; `opts` drives lock grant / batch env / context validity / installer triggers.
function harness(opts) {
  opts = opts || {};
  var spy = { inv: 0, op: 0, ctxCalls: [], injectedCtx: [], invIo: null, opIo: null, logs: [], deleted: [], created: [], tz: [] };
  var preamble = [
    'var Logger = { log: function (m) { __spy.logs.push(m); } };',
    'var Utilities = { formatDate: function (d, tz, f) { __spy.tz.push(tz); return "2026-08-07 13:30:00"; } };',
    'var LockService = { getScriptLock: function () { return { tryLock: function () { return __opts.lockGranted !== false; }, releaseLock: function () {} }; } };',
    // F1-4B-FM5-R4 canonical calc-context owner (defined in 43) — STUBBED so the test drives the derived context:
    'var gapCalcResolveContext_ = function (jobType, nowMs) { __spy.ctxCalls.push({ jobType: jobType, nowMs: nowMs });' +
      ' if (__opts.ctxOk === false) return { ok: false, code: "CALCULATION_CONTEXT_DATE_INVALID", message: "invalid execution date" };' +
      ' return { ok: true, jobType: jobType, calculationDate: (jobType === "ORDER_PLANNING" ? "2026-08-06" : "2026-08-07"), calculationMonth: "2026-08", planningCycle: "RECO-2026-08", timezone: "Asia/Taipei" }; };',
    // context-carrying io factory (defined in 43) — STUBBED to capture the injected context:
    'var gapMaterializationDefaultIo_ = function (ctx) { __spy.injectedCtx.push(ctx); return { __io: true, calcContext: ctx }; };',
    // canonical batch owners — SPIED (same symbols the router/manual button use); capture the injected io:
    'var handleRecalculateInventoryReplenishmentGapBatch_ = function (body, io) { __spy.inv++; __spy.invBody = body; __spy.invIo = io; return __opts.env || { success: true, data: { totalScopes: 2, scopesCalculated: 2, written: 5, ready: 4, blocked: 1, errors: 0, calculatedAt: "2026-08-07 13:30:00" }, errors: [] }; };',
    'var handleRecalculateOrderPlanningGapBatch_ = function (body, io) { __spy.op++; __spy.opBody = body; __spy.opIo = io; return __opts.env || { success: true, data: { totalScopes: 2, scopesCalculated: 2, written: 3, ready: 2, blocked: 0, errors: 1, calculatedAt: "2026-08-07 13:30:00" }, errors: [] }; };',
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
section('A/B/E — scheduler derives the canonical context and invokes EXACTLY the existing batch owner');
var hA = harness();
var rInv = hA.api.runInv();
eq([hA.spy.inv, hA.spy.op], [1, 0], 'A Inventory scheduler calls handleRecalculateInventoryReplenishmentGapBatch_ exactly once (not the OP owner)');
eq(hA.spy.ctxCalls[0].jobType, 'INVENTORY', 'A2 it derives the INVENTORY context (execution-day rule) via the canonical owner');
eq(hA.spy.invIo.calcContext.calculationDate, '2026-08-07', 'A3 the derived context is INJECTED into the batch io (calculationDate 2026-08-07) — not a Script Property');
var hB = harness();
hB.api.runOp();
eq([hB.spy.inv, hB.spy.op], [0, 1], 'B Order Planning scheduler calls handleRecalculateOrderPlanningGapBatch_ exactly once');
eq([hB.spy.ctxCalls[0].jobType, hB.spy.opIo.calcContext.calculationDate], ['ORDER_PLANNING', '2026-08-06'], 'B2 it derives the ORDER_PLANNING context (previous-day rule → 2026-08-06) and injects it');
ok(/handleRecalculateInventoryReplenishmentGapBatch_/.test(SCHED) && /handleRecalculateOrderPlanningGapBatch_/.test(SCHED), 'E scheduler references the SAME canonical batch owners');
ok(/handleRecalculateInventoryReplenishmentGapBatch_\(body\)/.test(ROUTER) && /handleRecalculateOrderPlanningGapBatch_\(body\)/.test(ROUTER), 'E2 the router-dispatched owners are the same owners (manual + scheduled share one pathway)');

section('C — no formula owner duplicated (orchestration only)');
var CODE = SCHED.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/Math\.(ceil|floor|round)/.test(CODE), 'C1 no gap/carton arithmetic in the scheduler');
ok(!/KMTPP|KMMSA|KMALLOC|KMHP|KMCALC|projectTimePhasedSupply|allocateMarketplaceReceiverSupply|projectHorizons/.test(CODE), 'C2 no runtime formula owner invoked/duplicated in the scheduler');
ok(!/gapOpMapFromLines_|gapInvMapFromLines_|gapUpsertByKey_|workspaceGet|recommendation\.workspace\.get/.test(CODE), 'C3 scheduler does not re-map / re-upsert / recompute — it only injects context + invokes the batch owner');

section('F — concurrent duplicate execution prevented (bounded orchestration lock)');
var hF = harness({ lockGranted: false });
var rF = hF.api.runInv();
eq([rF.status, hF.spy.inv, hF.spy.ctxCalls.length], ['SKIPPED_LOCKED', 0, 0], 'F lock held → SKIPPED_LOCKED; no context derived, batch NEVER invoked (no overlapping full-site recalc)');

section('G — blocked/error rows remain truthful; no fake success');
var hG = harness();
var rG = hG.api.runInv();
eq([rG.status, rG.readyCount, rG.blockedCount, rG.errorCount, rG.rowsProcessed, rG.scopesProcessed], ['OK', 4, 1, 0, 5, 2], 'G1 summary passes through the batch READY/BLOCKED/ERROR counts verbatim');
eq(rG.calculationAuthority, { calculationDate: '2026-08-07', calculationMonth: '2026-08', planningCycle: 'RECO-2026-08' }, 'G1b summary reports the deterministic calculation authority used');
var hGerr = harness({ env: { success: false, data: null, errors: [{ code: 'GAP_BATCH_ERROR' }] } });
eq(hGerr.api.runOp().status, 'ERROR', 'G2 batch success:false → scheduler status ERROR (never a fabricated success)');
ok(rG.startedAt && rG.finishedAt && rG.calculatedAt === '2026-08-07 13:30:00', 'G3 summary carries startedAt / finishedAt / calculatedAt');

section('R4 — deterministic context replaces the Script Property (§O / §10); invalid context → CONFIG_BLOCKED');
var hInvalid = harness({ ctxOk: false });
var rBad = hInvalid.api.runInv();
eq([rBad.status, rBad.code, hInvalid.spy.inv], ['CONFIG_BLOCKED', 'CALCULATION_CONTEXT_DATE_INVALID', 0], 'CTX1 an invalid deterministic context → CONFIG_BLOCKED, batch NOT run (never UTC/blank/fabricated)');
ok(!/recoWsResolveCalcDate_|recoWsResolveCalcContext_|RECOMMENDATION_CALCULATION_DATE|RECOMMENDATION_CALCULATION_MONTH/.test(CODE), 'CTX2 the scheduler code no longer reads the RECOMMENDATION_CALCULATION_DATE/MONTH Script Properties (not required for scheduled runs)');
ok(!/setProperty/.test(SCHED), 'CTX3 the scheduler NEVER writes a Script Property (context is injected, not a mutated global)');
ok(/gapCalcResolveContext_\(jobType, nowMs\)/.test(SCHED), 'CTX4 the scheduler derives context via the ONE canonical owner (shared with the manual batch path)');

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
eq(hD.spy.inv, 2, 'D re-running the scheduler simply re-invokes the latest-state UPSERT batch — no duplicate-row logic in the scheduler');
ok(!/appendRow|insertRow|setValues/.test(CODE), 'D2 the scheduler writes NO sheet rows itself (idempotency is the batch UPSERT owner\'s)');

section('H/I/J — page-open no-calc · no DB/schema · no AI/Execution/notification write');
ok(!/openTarget|getSheetByName|SpreadsheetApp|createSheet|insertSheet|setName/i.test(CODE), 'H/I scheduler performs NO page-load calc and NO sheet/schema creation (batch owns the read/write)');
ok(!/shipment|purchase_order|request_order|notification|warning|executionPlan|aiPlan|sendEmail|MailApp/i.test(CODE), 'J no AI Plan / Execution Plan / warning / order / shipment write in the scheduler');
var READ = (GAP43.split('function gapReadScopeRows_')[1] || '').split('\nfunction handleGetOrderPlanningGap_')[0];
ok(!/workspaceGet|recommendation\.workspace\.get|projectTimePhasedSupply|KMTPP|KMHP/.test(READ), 'H2 materialized read owner (page expand) performs ZERO recalculation — reads stored rows only');

console.log('\n----------------------------------------');
console.log('GAP MATERIALIZATION SCHEDULER (F1-4B-FM5-R3 / R4 context): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
