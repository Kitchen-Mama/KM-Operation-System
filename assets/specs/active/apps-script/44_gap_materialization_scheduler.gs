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
// CALCULATION-DATE / -MONTH ROLLOVER: HALTED (§7). RECOMMENDATION_CALCULATION_DATE + RECOMMENDATION_CALCULATION_MONTH
// are READ-ONLY Script Properties in this codebase (no setter exists) → they are MANUALLY maintained. This scheduler
// VALIDATES them (via the frozen resolvers) and fails safely with a clear diagnostic if missing/stale; it does NOT
// invent auto-roll. Rollover authority is NOT frozen: CALCULATION_DATE_ROLLOVER_AUTHORITY_NOT_FROZEN /
// CALCULATION_MONTH_ROLLOVER_AUTHORITY_NOT_FROZEN — authorize deterministic rollover in a separate round.

var GAP_SCHED_TZ_ = 'Asia/Taipei';       // frozen operational timezone (authority: import scheduleTimezone)
var GAP_SCHED_LOCK_MS_ = 10000;          // bounded wait for the orchestration-level Apps Script lock
var GAP_SCHED_OWNED_HANDLERS_ = ['runDailyInventoryGapMaterialization', 'runDailyOrderPlanningGapMaterialization'];

// PURE — is a trigger handler one of THIS scheduler's own entry points? Used by the installer's duplicate-protection
// so it can NEVER delete the Amazon import trigger (runAmazonSnapshotImports) or any other handler.
function gapSchedIsOwnedHandler_(name) { return GAP_SCHED_OWNED_HANDLERS_.indexOf(String(name == null ? '' : name)) !== -1; }

function gapSchedTimestamp_() { try { return Utilities.formatDate(new Date(), GAP_SCHED_TZ_, 'yyyy-MM-dd HH:mm:ss'); } catch (e) { return ''; } }

// Shared thin orchestration: bounded lock (§5, no overlap) → read-only config validation (§7, no auto-roll) →
// invoke the EXISTING canonical batch owner (§8, same as the manual button) → structured summary (§6, no fake
// success). A single blocked/error SKU never invalidates the valid rows — the batch's READY/BLOCKED/ERROR
// semantics are preserved verbatim (this layer only reports the batch's own counts).
function gapSchedRun_(jobName, configCheck, invoke) {
  var startedAt = gapSchedTimestamp_();
  var lock = null;
  try { lock = LockService.getScriptLock(); } catch (e) { lock = null; }
  if (lock && !lock.tryLock(GAP_SCHED_LOCK_MS_)) {                                  // §5 another full-site recalc is active → skip safely
    var skip = { job: jobName, status: 'SKIPPED_LOCKED', startedAt: startedAt, finishedAt: gapSchedTimestamp_(), reason: 'another gap materialization run is active' };
    try { Logger.log('[gapScheduler] ' + JSON.stringify(skip)); } catch (_l) {}
    return skip;
  }
  try {
    var cfg = configCheck();                                                        // §7 validate READ-ONLY authority; NO auto-roll
    if (!cfg.ok) {
      var blocked = { job: jobName, status: 'CONFIG_BLOCKED', code: cfg.code, message: cfg.message, startedAt: startedAt, finishedAt: gapSchedTimestamp_() };
      try { Logger.log('[gapScheduler] ' + JSON.stringify(blocked)); } catch (_b) {}
      return blocked;                                                               // no batch run, no fake success
    }
    var env = invoke();                                                             // §8 the SAME owner the manual button calls
    var d = (env && env.data) || {};
    var summary = {
      job: jobName,
      status: (env && env.success === true) ? 'OK' : 'ERROR',                       // §6 no fake success
      startedAt: startedAt,
      finishedAt: gapSchedTimestamp_(),
      timezone: GAP_SCHED_TZ_,
      calculationAuthority: cfg.authority || null,
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

// READ-ONLY config validators. They confirm the manually-maintained Script Property is present + well-formed via the
// SAME frozen resolvers the recommendation workspace uses (recoWsResolveCalcDate_ / recoWsResolveCalcContext_).
// They NEVER set or roll the property — rollover authority is NOT frozen (§7 HALT).
function gapSchedCheckInventoryConfig_() {
  var io = recommendationWorkspaceDefaultIo_();
  var d = recoWsResolveCalcDate_(io);                                               // RECOMMENDATION_CALCULATION_DATE (YYYY-MM-DD)
  if (!d.ok) return { ok: false, code: d.error.code, message: d.error.message };
  return { ok: true, authority: { calculationDate: d.calculationDate } };
}
function gapSchedCheckOrderPlanningConfig_() {
  var io = recommendationWorkspaceDefaultIo_();
  var m = recoWsResolveCalcContext_(io);                                            // RECOMMENDATION_CALCULATION_MONTH (YYYY-MM)
  if (!m.ok) return { ok: false, code: m.error.code, message: m.error.message };
  return { ok: true, authority: { calculationMonth: m.calculationMonth, planningCycle: m.planningCycle } };
}

// ---- NAMED SCHEDULER ENTRY POINTS (attach to Apps Script time triggers; Asia/Taipei) --------------------------
// Step B — daily Inventory Replenishment gap snapshot. Preferred trigger: 13:30 Asia/Taipei (after source import).
function runDailyInventoryGapMaterialization() {
  return gapSchedRun_('INVENTORY_GAP', gapSchedCheckInventoryConfig_, function () {
    return handleRecalculateInventoryReplenishmentGapBatch_({ requestId: 'SCHED-INV-GAP' });
  });
}
// Step D — daily Order Planning gap snapshot. Preferred trigger: 03:30 Asia/Taipei (Day D+1, the morning AFTER the
// Day-D source import + Inventory gap). Same-day-import → next-day Order Planning is frozen (see decision register).
function runDailyOrderPlanningGapMaterialization() {
  return gapSchedRun_('ORDER_PLANNING_GAP', gapSchedCheckOrderPlanningConfig_, function () {
    return handleRecalculateOrderPlanningGapBatch_({ requestId: 'SCHED-OP-GAP' });
  });
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
