// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 44_gap_materialization_scheduler.gs — F1-4B-FM5-R3 Gap Materialization Scheduler + Post-Import Orchestration
// NOTE: All .gs files in this folder share ONE global scope in the Apps Script project. Copy them together and
//       REDEPLOY. No imports. Structure-only split.
// ============================================================
//
// ORCHESTRATION / SCHEDULING ONLY. This file authors NO formula. It reuses the ALREADY-PROVEN canonical batch
// owners the manual "Recalculate All Sites" buttons call, so manual + scheduled runs share ONE pathway:
//   • Inventory Replenishment gap → handleRecalculateInventoryReplenishmentGapBatch_ → inventory_replenishment_gap
//   • Order Planning gap          → handleRecalculateOrderPlanningGapBatch_          → order_planning_gap
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
var GAP_SCHED_LOCK_MS_ = 10000;          // bounded wait for the orchestration-level Apps Script lock
var GAP_SCHED_OWNED_HANDLERS_ = ['runDailyInventoryGapMaterialization', 'runDailyOrderPlanningGapMaterialization'];

// PURE — is a trigger handler one of THIS scheduler's own entry points? Used by the installer's duplicate-protection
// so it can NEVER delete the Amazon import trigger (runAmazonSnapshotImports) or any other handler.
function gapSchedIsOwnedHandler_(name) { return GAP_SCHED_OWNED_HANDLERS_.indexOf(String(name == null ? '' : name)) !== -1; }

function gapSchedTimestamp_() { try { return Utilities.formatDate(new Date(), GAP_SCHED_TZ_, 'yyyy-MM-dd HH:mm:ss'); } catch (e) { return ''; } }

// Shared thin orchestration: bounded lock (§5, no overlap) → derive the canonical DETERMINISTIC calc context
// (F1-4B-FM5-R4; Asia/Taipei; via the ONE owner in 43 — no Script Property, no auto-roll) → INJECT it into the
// EXISTING canonical batch owner (§8, same as the manual button) → structured summary (§6, no fake success). A
// single blocked/error SKU never invalidates the valid rows — the batch's READY/BLOCKED/ERROR semantics are
// preserved verbatim. `nowMs` is an OPTIONAL test seam (production triggers pass nothing → clock is read once).
function gapSchedRun_(jobName, jobType, invoke, nowMs) {
  var startedAt = gapSchedTimestamp_();
  var lock = null;
  try { lock = LockService.getScriptLock(); } catch (e) { lock = null; }
  if (lock && !lock.tryLock(GAP_SCHED_LOCK_MS_)) {                                  // §5 another full-site recalc is active → skip safely
    var skip = { job: jobName, status: 'SKIPPED_LOCKED', startedAt: startedAt, finishedAt: gapSchedTimestamp_(), reason: 'another gap materialization run is active' };
    try { Logger.log('[gapScheduler] ' + JSON.stringify(skip)); } catch (_l) {}
    return skip;
  }
  try {
    var ctx = gapCalcResolveContext_(jobType, nowMs);                               // §1/§2/§3 deterministic Asia/Taipei context (no Script Property)
    if (!ctx.ok) {                                                                  // §10 no fabricated/ambiguous context
      var blocked = { job: jobName, status: 'CONFIG_BLOCKED', code: ctx.code, message: ctx.message, startedAt: startedAt, finishedAt: gapSchedTimestamp_() };
      try { Logger.log('[gapScheduler] ' + JSON.stringify(blocked)); } catch (_b) {}
      return blocked;
    }
    var env = invoke(ctx);                                                          // §5 inject the derived context into the SAME owner the manual button calls
    var d = (env && env.data) || {};
    var summary = {
      job: jobName,
      status: (env && env.success === true) ? 'OK' : 'ERROR',                       // §6 no fake success
      startedAt: startedAt,
      finishedAt: gapSchedTimestamp_(),
      timezone: GAP_SCHED_TZ_,
      calculationAuthority: { calculationDate: ctx.calculationDate, calculationMonth: ctx.calculationMonth, planningCycle: ctx.planningCycle },
      scopesProcessed: (d.scopesCalculated != null ? d.scopesCalculated : (d.totalScopes != null ? d.totalScopes : null)),
      rowsProcessed: (d.written != null ? d.written : null),
      readyCount: (d.ready != null ? d.ready : null),
      blockedCount: (d.blocked != null ? d.blocked : null),
      errorCount: (d.errors != null ? d.errors : null),
      calculatedAt: (d.calculatedAt != null ? d.calculatedAt : null),
      batchErrors: (env && env.errors) ? env.errors : []
    };
    try { Logger.log('[gapScheduler] ' + JSON.stringify(summary)); } catch (_s) {}
    return summary;
  } catch (e2) {
    var err = { job: jobName, status: 'ERROR', startedAt: startedAt, finishedAt: gapSchedTimestamp_(), message: (e2 && e2.message ? String(e2.message) : String(e2)) };
    try { Logger.log('[gapScheduler] ' + JSON.stringify(err)); } catch (_e) {}
    return err;                                                                     // no fake success
  } finally {
    if (lock) { try { lock.releaseLock(); } catch (_r) {} }
  }
}

// ---- NAMED SCHEDULER ENTRY POINTS (attach to Apps Script time triggers; Asia/Taipei) --------------------------
// The optional `nowMs` argument is a test seam only — production time-triggers invoke these with no arguments.
// Step B — daily Inventory Replenishment gap snapshot. Preferred trigger: 13:30 Asia/Taipei (after source import).
// Canonical calculationDate = the execution's Asia/Taipei date (Day D). No manual Script Property required (§O).
function runDailyInventoryGapMaterialization(nowMs) {
  return gapSchedRun_('INVENTORY_GAP', 'INVENTORY', function (ctx) {
    return handleRecalculateInventoryReplenishmentGapBatch_({ requestId: 'SCHED-INV-GAP' }, gapMaterializationDefaultIo_(ctx));
  }, nowMs);
}
// Step D — daily Order Planning gap snapshot. Preferred trigger: 03:30 Asia/Taipei (Day D+1). Canonical
// calculationDate = the PREVIOUS Asia/Taipei date (Day D) — the latest COMPLETED source cycle. No property required.
function runDailyOrderPlanningGapMaterialization(nowMs) {
  return gapSchedRun_('ORDER_PLANNING_GAP', 'ORDER_PLANNING', function (ctx) {
    return handleRecalculateOrderPlanningGapBatch_({ requestId: 'SCHED-OP-GAP' }, gapMaterializationDefaultIo_(ctx));
  }, nowMs);
}

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
