// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 44_gap_materialization_scheduler.gs — F1-4B-FM5-R3 Gap Materialization Scheduler + Post-Import Orchestration
// NOTE: All .gs files in this folder share ONE global scope in the Apps Script project. Copy them together and
//       REDEPLOY. No imports. Structure-only split.
// ============================================================
//
// ORCHESTRATION / SCHEDULING ONLY. This file authors NO formula and performs NO calculation. F1-4B-FM5-R4J: the
// daily entry points START the SAME backend-owned RESUMABLE job the manual "Recalculate All Sites" buttons start
// (owner = 46_api_v1_gap_materialization_job.gs → gapJobStart_), so manual + scheduled share ONE logical job owner:
//   • Inventory Replenishment gap → gapJobStart_('INVENTORY')      → inventory_replenishment_gap
//   • Order Planning gap          → gapJobStart_('ORDER_PLANNING') → order_planning_gap
// The ~13–14 min workload is too long for a single execution, so START only enqueues (freezes context + schedules
// the first continuation trigger) and the backend owns the job to terminal completion. If a product job is already
// PENDING/RUNNING, START returns it unchanged → the scheduler reports SKIPPED_ALREADY_RUNNING (no duplicate job).
//
// FROZEN production cadence (Asia/Taipei — mirrors the Amazon import scheduleTimezone; the Apps Script PROJECT
// timezone MUST be Asia/Taipei so trigger atHour matches):
//   Step A  source imports (Amazon + future marketplaces)  ~12:00–13:00 Day D   (runAmazonSnapshotImports — unchanged)
//   Step B  runDailyInventoryGapMaterialization()          13:30 Day D          (after the source-import window)
//   Step C  daily warnings (FUTURE) MUST consume the freshly materialized inventory_replenishment_gap — never recalc
//   Step D  runDailyOrderPlanningGapMaterialization()      03:30 Day D+1        (the morning AFTER Day-D source+inv gap)
// Same-day-import → same-day Inventory gap → NEXT-day (D+1) Order Planning gap. Frozen; no 15h-vs-same-day ambiguity.
//
// HARD LIMITS (F1-4B-FM5-R3 §10): NO change to any gap/stock/allocation formula, KMHP/KMTPP/KMMSA/KMALLOC/KMQI,
// DB schema, gap columns, or UI calc. NO AI Plan, NO Execution Plan, NO warnings, NO order/shipment writes, NO
// browser timer, NO page-load calculation, NO per-SKU HTTP loop. The Amazon import trigger is NOT touched.
//
// CALCULATION-DATE / -MONTH ROLLOVER: FROZEN + IMPLEMENTED in F1-4B-FM5-R4. The scheduler derives a DETERMINISTIC
// Asia/Taipei calculation context via the canonical owner `gapCalcResolveContext_` (in 43) and INJECTS it into the
// batch owner — RECOMMENDATION_CALCULATION_DATE / _MONTH Script Properties are NO LONGER required for scheduled (or
// manual) runs and are NEVER mutated (they remain an optional debug/override authority for direct workspace.get).
// If a valid deterministic context cannot be established → CONFIG_BLOCKED (never UTC / browser / stale / blank).

var GAP_SCHED_TZ_ = 'Asia/Taipei';       // frozen operational timezone (authority: import scheduleTimezone)
// F1-4B-FM5-R4J — the bounded run lock + duplicate protection now live in gapJobStart_ (LockService, owner = 46);
// the scheduler no longer holds its own orchestration lock (it merely STARTs the job and returns).
var GAP_SCHED_OWNED_HANDLERS_ = ['runDailyInventoryGapMaterialization', 'runDailyOrderPlanningGapMaterialization'];

// PURE — is a trigger handler one of THIS scheduler's own entry points? Used by the installer's duplicate-protection
// so it can NEVER delete the Amazon import trigger (runAmazonSnapshotImports) or any other handler.
function gapSchedIsOwnedHandler_(name) { return GAP_SCHED_OWNED_HANDLERS_.indexOf(String(name == null ? '' : name)) !== -1; }

function gapSchedTimestamp_() { try { return Utilities.formatDate(new Date(), GAP_SCHED_TZ_, 'yyyy-MM-dd HH:mm:ss'); } catch (e) { return ''; } }

// F1-4B-FM5-R4J thin orchestration — START the canonical backend-owned resumable job (owner = 46_..._job.gs) and
// return a structured summary. gapJobStart_ owns the bounded LockService lock + duplicate protection + the FROZEN
// FM5-R4 Asia/Taipei calculation context (Inventory → Day D; Order Planning → previous day = latest completed source
// cycle). This function performs NO calculation and derives NO formula — it only translates the START envelope into
// the scheduler log summary. STARTED / SKIPPED_ALREADY_RUNNING (job already active → no duplicate) / ERROR (no fake
// success). Backend continuations then own the job to terminal completion, independent of any request lifetime.
function gapSchedStartJob_(jobName, product) {
  var startedAt = gapSchedTimestamp_();
  try {
    var res = gapJobStart_(product, gapJobDefaultEnv_(product));                    // §14 the SAME owner the manual button starts
    var d = (res && res.data) || {};
    var status = (!res || res.success !== true) ? 'ERROR' : (d.alreadyRunning ? 'SKIPPED_ALREADY_RUNNING' : 'STARTED');
    var summary = { job: jobName, product: product, status: status, runId: d.runId || null,
      scopesTotal: (d.scopesTotal != null ? d.scopesTotal : null), startedAt: startedAt, finishedAt: gapSchedTimestamp_(),
      timezone: GAP_SCHED_TZ_, batchErrors: (res && res.errors) ? res.errors : [] };
    try { Logger.log('[gapScheduler] ' + JSON.stringify(summary)); } catch (_s) {}
    return summary;
  } catch (e2) {
    var err = { job: jobName, product: product, status: 'ERROR', startedAt: startedAt, finishedAt: gapSchedTimestamp_(), message: (e2 && e2.message ? String(e2.message) : String(e2)) };
    try { Logger.log('[gapScheduler] ' + JSON.stringify(err)); } catch (_e) {}
    return err;                                                                     // no fake success
  }
}

// ---- NAMED SCHEDULER ENTRY POINTS (attach to Apps Script time triggers; Asia/Taipei) --------------------------
// Step B — daily Inventory Replenishment gap. Preferred trigger: 13:30 Asia/Taipei (after the source import window).
// STARTS the canonical resumable job (execution Asia/Taipei Day D context, frozen inside the job at START).
function runDailyInventoryGapMaterialization() { return gapSchedStartJob_('INVENTORY_GAP', 'INVENTORY'); }
// Step D — daily Order Planning gap. Preferred trigger: 03:30 Asia/Taipei (Day D+1). STARTS the canonical resumable
// job; its ORDER_PLANNING context resolves to the PREVIOUS Asia/Taipei date (Day D = latest completed source cycle).
function runDailyOrderPlanningGapMaterialization() { return gapSchedStartJob_('ORDER_PLANNING_GAP', 'ORDER_PLANNING'); }

// ---- MANUAL, USER-RUN trigger installer (run ONCE from the Apps Script editor; NOT wired to any POST/trigger) ----
// Duplicate-protection: deletes ONLY triggers whose handler is one of this scheduler's own entry points, then
// creates fresh daily triggers. It NEVER touches runAmazonSnapshotImports or any other handler. atHour is in the
// SCRIPT project timezone — the project timezone MUST be Asia/Taipei (matches the frozen import scheduleTimezone).
function installGapMaterializationTriggers_() {
  var existing = ScriptApp.getProjectTriggers(), removed = [];
  for (var i = 0; i < existing.length; i++) {
    var h = existing[i].getHandlerFunction();
    if (gapSchedIsOwnedHandler_(h)) { ScriptApp.deleteTrigger(existing[i]); removed.push(h); }   // never the Amazon trigger
  }
  ScriptApp.newTrigger('runDailyInventoryGapMaterialization').timeBased().everyDays(1).atHour(13).nearMinute(30).create();
  ScriptApp.newTrigger('runDailyOrderPlanningGapMaterialization').timeBased().everyDays(1).atHour(3).nearMinute(30).create();
  var msg = { installed: ['runDailyInventoryGapMaterialization@13:30', 'runDailyOrderPlanningGapMaterialization@03:30'], removedDuplicates: removed, timezone: GAP_SCHED_TZ_,
    note: 'Set the Apps Script project timezone to Asia/Taipei so atHour matches the frozen cadence.' };
  try { Logger.log('[gapScheduler] ' + JSON.stringify(msg)); } catch (_i) {}
  return msg;
}
// Companion manual uninstaller — removes ONLY this scheduler's triggers (never the Amazon trigger).
function uninstallGapMaterializationTriggers_() {
  var existing = ScriptApp.getProjectTriggers(), removed = [];
  for (var i = 0; i < existing.length; i++) {
    var h = existing[i].getHandlerFunction();
    if (gapSchedIsOwnedHandler_(h)) { ScriptApp.deleteTrigger(existing[i]); removed.push(h); }
  }
  try { Logger.log('[gapScheduler] removed ' + JSON.stringify(removed)); } catch (_u) {}
  return { removed: removed };
}
