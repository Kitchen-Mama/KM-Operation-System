// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 45_api_v1_automation_schedule.gs — ADMIN-AUTOMATION-R1 Automation Schedule Settings (config owner + trigger API)
// NOTE: All .gs files in this folder share ONE global scope in the Apps Script project. Copy them together and
//       REDEPLOY. No imports. Structure-only split.
// ============================================================
//
// SCHEDULE CONFIGURATION + TRIGGER MANAGEMENT ONLY. This file authors NO business logic and NO formula. It never
// touches Inventory / Order Planning / gap / Amazon-import calculation, never reads or writes the production
// spreadsheet DB, and never creates a DB table. It owns exactly two things:
//   1. the canonical schedule CONFIG — one JSON object in Script Properties (KM_AUTOMATION_SCHEDULE_CONFIG); and
//   2. RECONCILIATION of the OWNED time triggers — via a STRICT handler allowlist (never enumerate-and-delete).
//
// Canonical persistence owner : PropertiesService.getScriptProperties()  (NOT the spreadsheet DB)
// Canonical execution owner   : Apps Script installable time triggers (best-effort scheduling windows)
// Timezone authority          : Asia/Taipei (the Apps Script PROJECT timezone MUST be Asia/Taipei so atHour matches)
//
// API actions (dispatched from 01_router.gs doPost):
//   automationSchedule.get    → handleAutomationScheduleGet_(body)    (read-only: config + trigger presence)
//   automationSchedule.update → handleAutomationScheduleUpdate_(body) (validate → write property → reconcile ONE owned trigger)
//
// TRIGGER SAFETY (ADMIN-AUTOMATION-R1 §7): when updating one automation the reconciler (a) matches ONLY triggers
// whose handler === that automation's OWN allowlisted handler, (b) deletes only those, (c) creates exactly one
// replacement iff enabled, (d) creates none iff disabled, (e) NEVER touches another automation's / a form / an
// email / a future / an unknown handler's trigger, (f) never creates a duplicate. `automationHandlerAllowed_`
// double-guards every delete so an un-allowlisted handler can never be removed.
//
// ADMIN AUTHORITY (§9): the API layer has NO source-provable PER-USER admin/role gate — every existing write
// (updateSkuLifecycle, runAmazonSnapshotImports, …) is authorized ONLY at the Apps Script DEPLOYMENT level (who can
// invoke the Web App). This handler REUSES that same existing authority (it invents NO new security model). The
// single hook `automationScheduleAuthority_` is the one integration point to wire a real per-user role owner when
// one exists; until then the write proceeds under the identical deployment authority that already governs
// runAmazonSnapshotImports (which itself mutates data with no per-user gate).

var AUTOMATION_SCHEDULE_PROP_KEY_ = 'KM_AUTOMATION_SCHEDULE_CONFIG';
var AUTOMATION_TZ_ = 'Asia/Taipei';
var AUTOMATION_SCHEDULE_HANDLER_VERSION_ = 'admin-automation-r1';
var AUTOMATION_WEEKDAYS_ = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

// The ONE place automations are declared. A future automation is added HERE (+ its real handler) with NO page or
// API redesign. `implemented:false` (no handler yet) renders as "Coming Soon" and can NEVER be enabled or given a
// trigger. `orderStep` expresses the operational sequence (Source Import → Inventory Gap → Recommendation; Order
// Planning runs separately the next morning) for the dependency hint — it drives NO scheduling by itself.
var AUTOMATION_JOBS_ = [
  { key: 'amazonImport', label: 'Amazon / Site Data Import', handler: 'runAmazonSnapshotImports',
    implemented: true, weeklyCapable: false, orderStep: 1,
    defaults: { enabled: true, frequency: 'DAILY', hour: 12, minute: 30 } },
  { key: 'inventoryGap', label: 'Inventory Gap Materialization', handler: 'runDailyInventoryGapMaterialization',
    implemented: true, weeklyCapable: false, orderStep: 2,
    defaults: { enabled: true, frequency: 'DAILY', hour: 13, minute: 30 } },
  { key: 'orderPlanningGap', label: 'Order Planning Gap Materialization', handler: 'runDailyOrderPlanningGapMaterialization',
    implemented: true, weeklyCapable: false, orderStep: 4,
    defaults: { enabled: true, frequency: 'DAILY', hour: 3, minute: 30 } },
  { key: 'weeklyRecommendation', label: 'Weekly Recommendation', handler: null,
    implemented: false, weeklyCapable: true, orderStep: 3,
    defaults: { enabled: false, frequency: 'WEEKLY', dayOfWeek: 'MONDAY', hour: 14, minute: 0 } }
];

// ---- PURE helpers ---------------------------------------------------------------------------------------------
function automationStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function automationJobByKey_(key) { var k = automationStr_(key); for (var i = 0; i < AUTOMATION_JOBS_.length; i++) { if (AUTOMATION_JOBS_[i].key === k) return AUTOMATION_JOBS_[i]; } return null; }
// Allowlist = the handlers of the IMPLEMENTED jobs only. Weekly Recommendation (handler:null) is never allowlisted,
// so its trigger can never be created and no un-owned handler can ever be deleted by the reconciler.
function automationAllowedHandlers_() { var out = []; for (var i = 0; i < AUTOMATION_JOBS_.length; i++) { var j = AUTOMATION_JOBS_[i]; if (j.implemented && j.handler) out.push(j.handler); } return out; }
function automationHandlerAllowed_(handler) { return automationAllowedHandlers_().indexOf(automationStr_(handler)) !== -1; }

function automationIsInt_(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; }
function automationCanonWeekday_(v) { var s = automationStr_(v).toUpperCase(); return AUTOMATION_WEEKDAYS_.indexOf(s) !== -1 ? s : null; }

// PURE — validate + normalize ONE job's requested config against its registry entry. Returns { ok, config } or
// { ok:false, error }. Rejects: unknown job; enabling a not-implemented job; bad frequency; out-of-range hour/
// minute; WEEKLY without a valid dayOfWeek. Times are validated as integers in the Asia/Taipei clock.
function automationValidateJobConfig_(job, raw) {
  if (!job) return { ok: false, error: { code: 'UNKNOWN_AUTOMATION', message: 'unknown automation key' } };
  raw = (raw && typeof raw === 'object') ? raw : {};
  var enabled = raw.enabled === true;
  // §12/§M — a job with no real handler (Weekly Recommendation) can NEVER be enabled until its owner exists.
  if (enabled && !job.implemented) return { ok: false, error: { code: 'WEEKLY_RECOMMENDATION_NOT_AVAILABLE', message: job.label + ' has no handler yet and cannot be enabled' } };
  var frequency = automationStr_(raw.frequency).toUpperCase() || (job.defaults.frequency || 'DAILY');
  if (frequency !== 'DAILY' && frequency !== 'WEEKLY') return { ok: false, error: { code: 'INVALID_FREQUENCY', message: 'frequency must be DAILY or WEEKLY' } };
  var hour = raw.hour, minute = raw.minute;
  if (!automationIsInt_(hour) || hour < 0 || hour > 23) return { ok: false, error: { code: 'INVALID_TIME', message: 'hour must be an integer 0–23 (Asia/Taipei)' } };
  if (!automationIsInt_(minute) || minute < 0 || minute > 59) return { ok: false, error: { code: 'INVALID_TIME', message: 'minute must be an integer 0–59 (Asia/Taipei)' } };
  var out = { enabled: enabled, frequency: frequency, hour: hour, minute: minute };
  if (frequency === 'WEEKLY') {
    var wd = automationCanonWeekday_(raw.dayOfWeek);
    if (!wd) return { ok: false, error: { code: 'INVALID_DAY_OF_WEEK', message: 'dayOfWeek is required for a WEEKLY schedule' } };
    out.dayOfWeek = wd;
  }
  return { ok: true, config: out };
}

// PURE — non-blocking dependency hints (§8). NEVER mutates another schedule; only surfaces a warning so the admin
// can decide. The core rule: Inventory Gap must not run before / too close to (≤30 min after) the Source Import.
function automationDependencyWarnings_(cfgByKey) {
  var w = [];
  var imp = cfgByKey.amazonImport, inv = cfgByKey.inventoryGap;
  if (imp && inv && imp.enabled && inv.enabled && imp.frequency === 'DAILY' && inv.frequency === 'DAILY') {
    var impMin = imp.hour * 60 + imp.minute, invMin = inv.hour * 60 + inv.minute;
    if (invMin <= impMin + 30) {
      w.push({ code: 'INVENTORY_GAP_TOO_EARLY', severity: 'warning',
        message: 'Inventory Gap Materialization is scheduled at or too close to (within ~30 min of) the Source Import. Inventory Gap should run AFTER the import window completes.' });
    }
  }
  return w;
}

// ---- CONFIG owner (Script Properties) -------------------------------------------------------------------------
// Read the saved config JSON (may be absent/empty/corrupt → treated as {}); merge registry defaults for any job
// not yet saved. NEVER throws. `weeklyRecommendation` is always represented as disabled regardless of stored value.
function automationReadConfig_(io) {
  var stored = {};
  try { var raw = io.getConfig(); if (raw) { var p = JSON.parse(raw); if (p && p.jobs && typeof p.jobs === 'object') stored = p.jobs; } } catch (e) { stored = {}; }
  var jobs = {};
  for (var i = 0; i < AUTOMATION_JOBS_.length; i++) {
    var j = AUTOMATION_JOBS_[i], s = (stored[j.key] && typeof stored[j.key] === 'object') ? stored[j.key] : null;
    var c = { enabled: j.defaults.enabled === true, frequency: j.defaults.frequency, hour: j.defaults.hour, minute: j.defaults.minute, updatedAt: null };
    if (j.defaults.dayOfWeek) c.dayOfWeek = j.defaults.dayOfWeek;
    if (s) {
      if (typeof s.enabled === 'boolean') c.enabled = s.enabled;
      if (s.frequency) c.frequency = automationStr_(s.frequency).toUpperCase();
      if (automationIsInt_(s.hour)) c.hour = s.hour;
      if (automationIsInt_(s.minute)) c.minute = s.minute;
      if (s.dayOfWeek) c.dayOfWeek = automationCanonWeekday_(s.dayOfWeek) || c.dayOfWeek;
      if (s.updatedAt) c.updatedAt = automationStr_(s.updatedAt);
    }
    if (!j.implemented) c.enabled = false;   // §12/§M — never surface a not-implemented job as enabled
    jobs[j.key] = c;
  }
  return jobs;
}
function automationWriteConfig_(io, jobsByKey) { io.setConfig(JSON.stringify({ version: 1, jobs: jobsByKey })); }

// ---- TRIGGER reconciliation (STRICT allowlist; the only mutation point) ---------------------------------------
// Reconcile ONE owned handler's trigger to match `norm`. Deletes ONLY triggers whose handler === job.handler
// (double-guarded by the allowlist), then creates EXACTLY ONE iff enabled. Never touches any other handler; never
// duplicates. Returns a truthful { deleted, created, present, ... } summary.
function automationReconcileTrigger_(io, job, norm) {
  if (!job || !job.handler || !automationHandlerAllowed_(job.handler)) {
    return { reconciled: false, reason: 'HANDLER_NOT_AVAILABLE', deleted: 0, created: 0, present: false };
  }
  var deleted = io.deleteTriggersByHandler(job.handler);        // ONLY this exact handler (allowlist-guarded in io)
  var created = 0, descriptor = null;
  if (norm.enabled) { descriptor = io.createTrigger(job.handler, norm); created = 1; }
  return { reconciled: true, deleted: deleted, created: created, present: created > 0, descriptor: descriptor };
}

// Read-only trigger presence for a handler (GET path — NEVER mutates). count>1 is reported truthfully (e.g. a
// pre-existing manually-created duplicate) so the UI shows the real state; a Save & Apply then normalizes to one.
function automationTriggerStatus_(io, handler) {
  var all = io.getTriggers() || [], n = 0;
  for (var i = 0; i < all.length; i++) { if (automationStr_(all[i].handler) === automationStr_(handler)) n++; }
  return { present: n > 0, count: n };
}

// ---- default io (production) — the ONLY place Spreadsheet-free Apps Script services are touched ----------------
function automationDefaultIo_() {
  return {
    now: function () { return new Date(); },
    tz: function () { return AUTOMATION_TZ_; },
    stamp: function () { try { return Utilities.formatDate(new Date(), AUTOMATION_TZ_, 'yyyy-MM-dd HH:mm:ss'); } catch (e) { return ''; } },
    getConfig: function () { return PropertiesService.getScriptProperties().getProperty(AUTOMATION_SCHEDULE_PROP_KEY_); },
    setConfig: function (v) { PropertiesService.getScriptProperties().setProperty(AUTOMATION_SCHEDULE_PROP_KEY_, v); },
    getTriggers: function () {
      var out = [];
      try { var all = ScriptApp.getProjectTriggers(); for (var i = 0; i < all.length; i++) out.push({ handler: all[i].getHandlerFunction() }); } catch (e) {}
      return out;
    },
    // Deletes ONLY triggers whose handler matches AND is on the allowlist. The allowlist guard here is a hard
    // backstop: even if a caller passes an unexpected handler, an un-owned trigger can never be removed.
    deleteTriggersByHandler: function (handler) {
      if (!automationHandlerAllowed_(handler)) return 0;
      var n = 0;
      try {
        var all = ScriptApp.getProjectTriggers();
        for (var i = 0; i < all.length; i++) { if (all[i].getHandlerFunction() === handler) { ScriptApp.deleteTrigger(all[i]); n++; } }
      } catch (e) {}
      return n;
    },
    createTrigger: function (handler, norm) {
      if (!automationHandlerAllowed_(handler)) return null;
      var b = ScriptApp.newTrigger(handler).timeBased();
      if (norm.frequency === 'WEEKLY') { b = b.onWeekDay(ScriptApp.WeekDay[norm.dayOfWeek]).atHour(norm.hour).nearMinute(norm.minute); }
      else { b = b.everyDays(1).atHour(norm.hour).nearMinute(norm.minute); }
      b.create();
      return { handler: handler, frequency: norm.frequency, hour: norm.hour, minute: norm.minute, dayOfWeek: norm.dayOfWeek || null };
    }
  };
}

// ---- envelope -------------------------------------------------------------------------------------------------
function automationEnvelope_(ok, data, errors) {
  var meta = { apiVersion: '1', source: 'automationSchedule', timezone: AUTOMATION_TZ_, automationScheduleHandlerVersion: AUTOMATION_SCHEDULE_HANDLER_VERSION_,
    note: 'Scheduled execution time is approximate — Apps Script time triggers run within a scheduling window.' };
  return { success: !!ok, data: ok ? (data === undefined ? null : data) : null, meta: meta, errors: ok ? [] : (errors || []) };
}

// PURE — assemble the presentation view of all jobs from config + trigger presence (no secrets: handler is under
// `details`, never a Script ID / URL / spreadsheet ID). Used by BOTH get and update (post-reconcile readback).
function automationBuildView_(io, cfgByKey) {
  var jobs = [];
  for (var i = 0; i < AUTOMATION_JOBS_.length; i++) {
    var j = AUTOMATION_JOBS_[i], c = cfgByKey[j.key];
    var status = j.handler ? automationTriggerStatus_(io, j.handler) : { present: false, count: 0 };
    var view = {
      key: j.key, label: j.label, implemented: j.implemented, weeklyCapable: j.weeklyCapable,
      status: j.implemented ? (c.enabled ? 'ENABLED' : 'DISABLED') : 'COMING_SOON',
      enabled: c.enabled, frequency: c.frequency, hour: c.hour, minute: c.minute,
      timeLabel: ('0' + c.hour).slice(-2) + ':' + ('0' + c.minute).slice(-2), timezone: AUTOMATION_TZ_,
      dayOfWeek: c.dayOfWeek || null, lastUpdatedAt: c.updatedAt || null,
      triggerActive: status.present, triggerCount: status.count,
      details: { handler: j.handler || null }   // technical name only; NO Script ID / URL / secret
    };
    jobs.push(view);
  }
  return { jobs: jobs, timezone: AUTOMATION_TZ_, warnings: automationDependencyWarnings_(cfgByKey) };
}

// ---- ADMIN authority hook (§9) — reuse the existing DEPLOYMENT-level authority; invent no new model -----------
function automationScheduleAuthority_(body) {
  // No source-provable per-user role gate exists in the API layer (all existing writes are deployment-gated). This
  // is the single integration point for a future real role owner. Returns the current (deployment) authority; it
  // does NOT fabricate a passing/failing identity check.
  return { ok: true, model: 'DEPLOYMENT_ACCESS' };
}

// ---- API: GET (read-only) -------------------------------------------------------------------------------------
// Returns the canonical saved config merged with defaults + current trigger presence. NEVER writes (§11/§N): merely
// opening the Admin page must not mutate any property or trigger — including the manually-created Amazon trigger.
function handleAutomationScheduleGet_(body, io) {
  io = io || automationDefaultIo_();
  try {
    var cfg = automationReadConfig_(io);
    return automationEnvelope_(true, automationBuildView_(io, cfg));
  } catch (e) {
    return automationEnvelope_(false, null, [{ code: 'AUTOMATION_SCHEDULE_GET_ERROR', message: (e && e.message) ? String(e.message) : String(e) }]);
  }
}

// ---- API: UPDATE (admin; validate → write property → reconcile ONE owned trigger → readback) ------------------
function handleAutomationScheduleUpdate_(body, io) {
  io = io || automationDefaultIo_();
  try {
    var auth = automationScheduleAuthority_(body);
    if (!auth.ok) return automationEnvelope_(false, null, [{ code: 'NOT_AUTHORIZED', message: 'not authorized to change automation schedules' }]);

    var payload = (body && body.payload && typeof body.payload === 'object') ? body.payload : (body && typeof body === 'object' ? body : {});
    var key = automationStr_(payload.key);
    var job = automationJobByKey_(key);
    if (!job) return automationEnvelope_(false, null, [{ code: 'UNKNOWN_AUTOMATION', message: 'unknown automation key: ' + key }]);

    var reqCfg = (payload.config && typeof payload.config === 'object') ? payload.config : payload;
    var v = automationValidateJobConfig_(job, reqCfg);
    if (!v.ok) return automationEnvelope_(false, null, [v.error]);

    // Persist ONLY this job's block (merge into the full saved config; other jobs untouched). §5 single owner.
    var cfgByKey = automationReadConfig_(io);
    var norm = v.config;
    var saved = { enabled: norm.enabled, frequency: norm.frequency, hour: norm.hour, minute: norm.minute, updatedAt: io.stamp() };
    if (norm.dayOfWeek) saved.dayOfWeek = norm.dayOfWeek;
    // Write back the FULL merged jobs map (strip the transient updatedAt-less defaults into concrete stored blocks).
    var toStore = {};
    for (var k in cfgByKey) { if (Object.prototype.hasOwnProperty.call(cfgByKey, k)) { var cc = cfgByKey[k]; toStore[k] = { enabled: cc.enabled, frequency: cc.frequency, hour: cc.hour, minute: cc.minute }; if (cc.dayOfWeek) toStore[k].dayOfWeek = cc.dayOfWeek; if (cc.updatedAt) toStore[k].updatedAt = cc.updatedAt; } }
    toStore[key] = saved;
    automationWriteConfig_(io, toStore);

    // Reconcile ONLY this job's owned trigger (delete matching handler → create ≤1). Never touches other handlers.
    var recon = automationReconcileTrigger_(io, job, norm);

    // Readback the resulting truthful state (§7.7 "re-reading after update must report exactly the resulting state").
    var after = automationReadConfig_(io);
    var view = automationBuildView_(io, after);
    view.applied = { key: key, reconcile: recon };
    return automationEnvelope_(true, view);
  } catch (e) {
    return automationEnvelope_(false, null, [{ code: 'AUTOMATION_SCHEDULE_UPDATE_ERROR', message: (e && e.message) ? String(e.message) : String(e) }]);
  }
}
