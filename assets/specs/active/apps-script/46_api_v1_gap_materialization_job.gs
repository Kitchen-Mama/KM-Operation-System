// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 46_api_v1_gap_materialization_job.gs — F1-4B-FM5-R4J Backend-Owned Resumable Gap Materialization Job
// NOTE: All .gs files in this folder share ONE global scope in the Apps Script project. Copy them together and
//       REDEPLOY. No imports. Structure-only split. Loads AFTER 43 (reuses its scope-slice processors + run id).
// ============================================================
//
// WHY: the measured full all-site materialization is ~14m (Inventory) / ~13.5m (Order Planning). A single browser
// HTTP request (or a single Apps Script execution) must NOT own that lifecycle. This module makes the workload a
// BACKEND-OWNED RESUMABLE JOB:
//   ONE user click → ONE logical job → survives tab close/refresh → backend processes BOUNDED scope chunks across
//   self-re-arming one-off time triggers → materialized UPSERT continues until a TERMINAL state → the browser only
//   STARTS the job and POLLS read-only STATUS.
//
// HARD RULES (F1-4B-FM5-R4J): orchestration/lifecycle ONLY. NO change to any Inventory/Order Planning formula,
// allocation rule, materialized-gap mapping, DB schema, KMHP/KMTPP/KMCALC/KMMSA/KMALLOC/KMQI/KMPD. The calculation
// is the EXISTING canonical owner reached through 43's extracted scope-slice processors (gapProcessScopeSlice_ /
// gapProcessOrderPlanningScopeSlice_). Job state = Script Properties ONLY (NO new DB table); the two gap tables
// remain the result store. runId = the existing gapRunId_. LockService enforces one logical job per product.
//
// SHARED-POOL CONSERVATION (Order Planning): the frozen allocation groups the competing set strictly by
// `company||sku` (FACTORY) and `company||canonicalCountry||sku` (OVERSEAS) — never cross-company — so a company is
// the exact conservation boundary. The job therefore chunks Order Planning by WHOLE COMPANY (never splitting a
// company across slices); each company slice re-runs the complete harvest→allocate→reproject over that company's
// full competing set, yielding byte-identical allocation to the monolithic run. Inventory scopes are independent,
// so Inventory chunks by a small fixed number of scopes.
//
// TESTABILITY: every side effect (Script Properties, LockService, one-off trigger scheduling, clock, spreadsheet
// open, scope enumeration, slice calculation) is reached through an injectable `env`. Production wiring is
// gapJobDefaultEnv_(); Node tests inject fakes and drive the entire PENDING→RUNNING→DONE lifecycle deterministically.

var GAP_JOB_TZ_ = 'Asia/Taipei';                       // frozen operational timezone (mirrors the scheduler / import cadence)
var GAP_JOB_LOCK_MS_ = 10000;                          // bounded wait for the script lock (one logical job per product)
var GAP_JOB_CONTINUATION_DELAY_MS_ = 1000;             // one-off continuation trigger delay (Apps Script schedules ~soon after)
var GAP_JOB_MAX_SLICE_ATTEMPTS_ = 3;                   // bounded retry of a failing slice before terminal ERROR (idempotent re-run)
// R4J-LIVE2 §8 — Inventory: ONE scope per continuation. The measured monolithic run is ~865s across ALL scopes, so
// a multi-scope slice risked exceeding the Apps Script continuation execution budget (~6 min) and being KILLED
// mid-slice — leaving no re-arm and a frozen non-terminal job at cursor 0 (the observed "Calculating 0/N"). One
// scope per slice keeps every continuation well inside budget so the worker ALWAYS reaches its re-arm and progress
// advances. Inventory scopes are independent → identical UPSERTs regardless of chunk size (no calculation change).
var GAP_JOB_INV_CHUNK_SCOPES_ = 1;
// Order Planning chunk = ONE WHOLE COMPANY (the shared-pool conservation boundary) — computed by gapJobNextSlice_.

var GAP_JOB_PROP_KEYS_ = { INVENTORY: 'GAP_JOB_INVENTORY', ORDER_PLANNING: 'GAP_JOB_ORDER_PLANNING' };
var GAP_JOB_CONTINUATION_HANDLERS_ = { INVENTORY: 'continueInventoryGapMaterializationJob', ORDER_PLANNING: 'continueOrderPlanningGapMaterializationJob' };
var GAP_JOB_MAX_LOCK_WAITS_ = 8;                       // R4J-LIVE §A2 — bounded RESCHEDULED_LOCKED before FAILED (never an infinite 0/N)
// R4J-LIVE2 §5/§7 — a non-terminal job whose state has NOT advanced for longer than this window is treated as
// STALLED and is RECLAIMABLE by a new (user-initiated) START. 10 min is safely longer than any HEALTHY single slice
// (which cannot exceed the ~6-min execution budget), so a live job is never reclaimed; but a worker killed mid-slice
// (no re-arm) would otherwise block every future start forever via the duplicate guard — reclaim lets the user retry.
var GAP_JOB_STALE_MS_ = 600000;
// R4J-LIVE10 §4 — WORKER SAFE BUDGET. A continuation processes COMPLETE slices in a loop until this elapsed budget is
// reached, then persists its checkpoint and exits CLEANLY (arming the next continuation) — it NEVER relies on the
// Apps Script ~6-min hard kill as flow control. 4 min leaves a wide margin below the platform limit so the worker
// always reaches its clean exit + re-arm. (A single slice that itself cannot fit the budget is caught by the
// no-progress guard below → truthful terminal SLICE_EXCEEDS_WORKER_BUDGET; conservation forbids a finer OP split.)
var GAP_JOB_WORKER_BUDGET_MS_ = 240000;
// R4J-LIVE10 §3/§7 — SELF-HEAL RECOVERY trigger. Armed BEFORE any slice processing and at a delay LONGER than the
// ~6-min hard limit, so it does NOT fire during a healthy worker run (which either completes and clears it, or arms a
// prompt next and the next worker clears it). It survives ONLY if this worker is killed/overruns with no clean exit —
// then it fires and re-enters the SAME runId from the last durable checkpoint. This is the browser-independent
// guarantee: a hard kill mid-slice can never orphan the job with zero armed triggers (the pre-LIVE10 root cause).
var GAP_JOB_RECOVERY_DELAY_MS_ = 420000;
// R4J-LIVE10 §7/§8 — bounded AUTOMATIC same-runId recoveries before a truthful terminal. Recovery continues the SAME
// logical run (never a fresh calculation); this bound stops an endless recovery loop for a genuinely broken job.
var GAP_JOB_MAX_RECOVERIES_ = 5;
// R4J-LIVE10 §13 — bounded manual EXECUTION SCOPES at the job contract. CURRENT_SCOPE / CURRENT_COUNTRY restrict the
// receiver universe; ALL_SITES is the full universe (default / backward-compatible). Order Planning conservation:
// the FACTORY shared pool competes company-wide (keyed company||sku across every country/marketplace), so ANY
// sub-company OP selection is EXPANDED to the WHOLE COMPANY (the exact conservation boundary) and the expansion is
// recorded — a partial OP run can never silently change allocation. Inventory scopes are independent → no expansion.
var GAP_JOB_SCOPE_MODES_ = { ALL_SITES: 'ALL_SITES', CURRENT_COUNTRY: 'CURRENT_COUNTRY', CURRENT_SCOPE: 'CURRENT_SCOPE' };
// R4J-LIVE §A2 / LIVE4 — the terminal set. A job NEVER stays PENDING/RUNNING indefinitely: it always reaches one of
// these. LIVE4 adds CANCELLED (explicit manual stop) and STALLED (authoritative no-progress detection persisted by
// status.get). Any terminal state carries finishedAt and is never resurrected into Calculating.
function gapJobIsTerminal_(status) { return status === 'DONE' || status === 'FAILED' || status === 'BLOCKED' || status === 'ERROR' || status === 'CANCELLED' || status === 'STALLED'; }
// LIVE6 §4 — is a NON-TERMINAL job decisively dead (→ must become STALLED)? Two decisive cases, using ONLY the
// existing frozen stale authority (GAP_JOB_STALE_MS_) — NO new timeout:
//   (a) LEGACY leftover: a non-terminal Script-Property state with NO epoch liveness stamps at all. Current code
//       ALWAYS stamps startedAtMs/updatedAtMs, so absent-both means the state predates the lifecycle → cannot be a
//       genuinely-active current job → decisively stale (closes the startup resurrection of a pre-upgrade job).
//   (b) STALE: epoch stamp present but no progress past the frozen threshold (killed worker, no re-arm).
// A job whose epoch stamp is recent (advancing or just-started) is NOT stale → remains PENDING/RUNNING (resumable).
function gapJobStaleNonterminal_(state, nowMs) {
  if (!state || gapJobIsTerminal_(state.status)) return false;
  if (state.updatedAtMs == null && state.startedAtMs == null) return true;                 // (a) legacy, no lifecycle stamp
  var stampMs = state.updatedAtMs || state.startedAtMs || 0;
  return !!(stampMs && ((nowMs || 0) - stampMs) > GAP_JOB_STALE_MS_);                       // (b) past the frozen stale window
}

// ---- small pure helpers -------------------------------------------------------------------------------------
function gapJobNormalizeProduct_(p) {
  var s = String(p == null ? '' : p).trim().toUpperCase();
  if (s === 'INVENTORY' || s === 'INV' || s === 'INVENTORY_REPLENISHMENT') return 'INVENTORY';
  if (s === 'ORDER_PLANNING' || s === 'OP' || s === 'ORDERPLANNING') return 'ORDER_PLANNING';
  return null;
}
function gapJobResultTableFor_(product) {
  return (product === 'ORDER_PLANNING')
    ? { table: OP_GAP_TABLE_, headers: OP_GAP_HEADERS_ }
    : { table: INV_GAP_TABLE_, headers: INV_GAP_HEADERS_ };
}
// The COMPLETE minimum state contract (§1) + R4J-LIVE §A5 additive lifecycle DIAGNOSTICS (timestamps + last scope +
// bounded-retry/lock bookkeeping) — counts/timestamps only, NEVER per-SKU payloads, NO DB table. These pinpoint the
// exact broken lifecycle edge on a live run (e.g. lastContinuationScheduledAt set but lastWorkerStartedAt null ⇒ the
// trigger never fired ⇒ trigger auth/quota; lastWorkerStartedAt set + lastError ⇒ the slice calc failed at a scope).
function gapJobNewState_(product, runId, ctx, scopesTotal, nowStr, nowMs, requestedScope, appliedScope) {
  return {
    runId: runId, product: product, status: 'PENDING',
    scopeCursor: 0, scopesTotal: scopesTotal, scopesProcessed: 0,
    rowsProcessed: 0, readyCount: 0, blockedCount: 0, errorCount: 0,
    calculationDate: ctx.calculationDate || '', calculationMonth: ctx.calculationMonth || '', planningCycle: ctx.planningCycle || '',
    startedAt: nowStr, updatedAt: nowStr, startedAtMs: (nowMs || 0), updatedAtMs: (nowMs || 0), finishedAt: null, cancelledAt: null, lastError: null, sliceAttempts: 0,
    lockWaits: 0, lastContinuationScheduledAt: null, lastWorkerStartedAt: null, lastWorkerFinishedAt: null, lastProcessedScope: null,
    // R4J-LIVE10 — self-heal + no-progress bookkeeping + the resolved manual execution scope (§13). recoveryCount =
    // automatic same-runId recoveries so far; stuckCursor/stuckCount = consecutive worker entries that made NO progress
    // at that cursor (a killed/overrunning slice that can never fit the budget) → bounded to a truthful terminal.
    recoveryCount: 0, stuckCursor: null, stuckCount: 0,
    requestedScope: requestedScope || null, appliedScope: appliedScope || null
  };
}
// R4J-LIVE2 §5/§7 — stamp the monotonic progress clock (epoch ms). Called wherever updatedAt advances so the STALLED
// reclaim in START can distinguish a live job (recently touched) from a killed worker (touched long ago, no re-arm).
function gapJobTouchMs_(env, state) { if (state && env && env.nowMs) state.updatedAtMs = env.nowMs(); }
// R4J-LIVE3 §8 — compact lifecycle diagnostics (runId + product + progress + status only; NO per-SKU payload).
// Guarded so Node unit tests (no Apps Script Logger) are unaffected.
function gapJobLog_(tag, state) {
  try { if (typeof Logger !== 'undefined' && Logger.log) Logger.log('[GapJob] ' + tag + (state ? ' ' + state.product + ' run=' + state.runId + ' ' + (state.scopesProcessed != null ? state.scopesProcessed : '?') + '/' + (state.scopesTotal != null ? state.scopesTotal : '?') + ' ' + state.status : '')); } catch (e) {} }
function gapJobPublicState_(s) {
  return { runId: s.runId, product: s.product, status: s.status,
    scopesProcessed: s.scopesProcessed, scopesTotal: s.scopesTotal, rowsProcessed: s.rowsProcessed,
    readyCount: s.readyCount, blockedCount: s.blockedCount, errorCount: s.errorCount,
    calculationDate: s.calculationDate, calculationMonth: s.calculationMonth, planningCycle: s.planningCycle,
    startedAt: s.startedAt, updatedAt: s.updatedAt, finishedAt: s.finishedAt, cancelledAt: s.cancelledAt, lastError: s.lastError,
    lastContinuationScheduledAt: s.lastContinuationScheduledAt, lastWorkerStartedAt: s.lastWorkerStartedAt,
    lastWorkerFinishedAt: s.lastWorkerFinishedAt, lastProcessedScope: s.lastProcessedScope,
    // R4J-LIVE10 — observable self-heal + scope (read-only; counts/labels only, never a per-SKU payload). `recovering`
    // is a DERIVED transient the watchdog sets when it has just re-armed a stale run's continuation (§7/§11) so the
    // browser can show "Recovering…" instead of a false failure — it is NOT a persisted status.
    recoveryCount: s.recoveryCount || 0, requestedScope: s.requestedScope || null, appliedScope: s.appliedScope || null,
    recovering: !!s.recovering };
}
// Stable group-by-company ordering (first-appearance order preserved). Consecutive scopes of a company are then
// contiguous, so advancing the cursor past a whole company is clean AND a company is never split across slices.
function gapJobOrderedScopes_(scopes) {
  var order = [], byCompany = {}, i;
  for (i = 0; i < (scopes || []).length; i++) {
    var c = scopes[i].company;
    if (!byCompany[c]) { byCompany[c] = []; order.push(c); }
    byCompany[c].push(scopes[i]);
  }
  var out = [];
  for (i = 0; i < order.length; i++) { var arr = byCompany[order[i]]; for (var k = 0; k < arr.length; k++) out.push(arr[k]); }
  return out;
}
// R4J-LIVE10 §13/§23 — resolve the bounded manual EXECUTION SCOPE against the full enumerated universe. Returns
// { scopes, appliedScope } where appliedScope records the mode ACTUALLY applied (which may be an expansion) so the
// state + STATUS are truthful. CONSERVATION-SAFE: for ORDER_PLANNING any CURRENT_SCOPE/CURRENT_COUNTRY request is
// EXPANDED to the whole company (the FACTORY shared pool competes company-wide) — a sub-company OP run would drop
// competing receivers and change allocation, which is forbidden; the expansion is recorded (expandedForConservation).
// For INVENTORY (independent scopes) the selection is exact. An empty request or ALL_SITES ⇒ the full universe.
function gapJobSelectScopes_(allScopes, req, product) {
  var all = (allScopes || []).slice();
  var mode = (req && req.mode) ? String(req.mode).trim().toUpperCase() : GAP_JOB_SCOPE_MODES_.ALL_SITES;
  if (mode !== GAP_JOB_SCOPE_MODES_.CURRENT_COUNTRY && mode !== GAP_JOB_SCOPE_MODES_.CURRENT_SCOPE) {
    return { scopes: all, appliedScope: { mode: GAP_JOB_SCOPE_MODES_.ALL_SITES } };
  }
  var company = String((req && req.company) || ''), country = String((req && req.country) || ''), marketplace = String((req && req.marketplace) || '');
  if (!company) return { scopes: all, appliedScope: { mode: GAP_JOB_SCOPE_MODES_.ALL_SITES, note: 'MISSING_COMPANY_FELL_BACK_TO_ALL_SITES' } };
  if (product === 'ORDER_PLANNING') {
    // conservation floor: the WHOLE company (never finer), regardless of the requested sub-company mode.
    var comp = all.filter(function (s) { return String(s.company) === company; });
    return { scopes: comp, appliedScope: { mode: GAP_JOB_SCOPE_MODES_.CURRENT_COUNTRY === mode || mode === GAP_JOB_SCOPE_MODES_.CURRENT_SCOPE ? 'CURRENT_COMPANY' : mode, requestedMode: mode, company: company, country: country || null, marketplace: marketplace || null, expandedForConservation: true } };
  }
  if (mode === GAP_JOB_SCOPE_MODES_.CURRENT_COUNTRY) {
    return { scopes: all.filter(function (s) { return String(s.company) === company && String(s.country) === country; }), appliedScope: { mode: mode, company: company, country: country } };
  }
  // CURRENT_SCOPE (Inventory) — the exact company/country/marketplace triple.
  return { scopes: all.filter(function (s) { return String(s.company) === company && String(s.country) === country && String(s.marketplace) === marketplace; }), appliedScope: { mode: mode, company: company, country: country, marketplace: marketplace } };
}
// The next bounded slice from `cursor`. INVENTORY: up to GAP_JOB_INV_CHUNK_SCOPES_ scopes. ORDER_PLANNING: exactly
// one WHOLE COMPANY (all consecutive scopes sharing the company at the cursor) → shared-pool conservation boundary.
function gapJobNextSlice_(product, orderedScopes, cursor) {
  if (product === 'ORDER_PLANNING') {
    var company = orderedScopes[cursor].company, end = cursor;
    while (end < orderedScopes.length && orderedScopes[end].company === company) end++;
    return { scopes: orderedScopes.slice(cursor, end), nextCursor: end };
  }
  var next = Math.min(cursor + GAP_JOB_INV_CHUNK_SCOPES_, orderedScopes.length);
  return { scopes: orderedScopes.slice(cursor, next), nextCursor: next };
}

// ---- job state read/write (Script Properties via injectable env.props) --------------------------------------
function gapJobReadState_(env, product) {
  var raw = env.props.get(GAP_JOB_PROP_KEYS_[product]);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}
function gapJobWriteState_(env, product, state) { env.props.set(GAP_JOB_PROP_KEYS_[product], JSON.stringify(state)); }
function gapJobClearState_(env, product) { if (env.props.del) env.props.del(GAP_JOB_PROP_KEYS_[product]); }
function gapJobMarkDone_(env, product, state) {
  state.status = 'DONE'; state.finishedAt = env.timestamp(); state.updatedAt = state.finishedAt;
  state.lastWorkerFinishedAt = state.finishedAt;
  gapJobTouchMs_(env, state);
  state.scopesProcessed = state.scopeCursor; gapJobWriteState_(env, product, state); gapJobLog_('DONE', state); return state;
}
// R4J-LIVE §A2 — persist a TERMINAL FAILED state (never leave a job dangling PENDING/RUNNING). Always writes.
function gapJobMarkFailed_(env, product, state, reason) {
  state.status = 'FAILED'; state.lastError = String(reason == null ? (state.lastError || 'FAILED') : reason);
  state.finishedAt = env.timestamp(); state.updatedAt = state.finishedAt; state.lastWorkerFinishedAt = state.finishedAt;
  gapJobTouchMs_(env, state);
  gapJobWriteState_(env, product, state); gapJobLog_('FAILED', state); return state;
}
// LIVE4 §1 — persist a TERMINAL CANCELLED state (manual stop). Progress/diagnostics are PRESERVED; already-written
// gap rows are NEVER rolled back. finishedAt + cancelledAt are stamped so the UI can never resurrect Calculating.
function gapJobMarkCancelled_(env, product, state) {
  state.status = 'CANCELLED'; state.finishedAt = env.timestamp(); state.updatedAt = state.finishedAt;
  state.cancelledAt = state.finishedAt; state.lastWorkerFinishedAt = state.lastWorkerFinishedAt || state.finishedAt;
  gapJobTouchMs_(env, state); gapJobWriteState_(env, product, state); gapJobLog_('CANCELLED', state); return state;
}
// LIVE4 §4 — persist a TERMINAL STALLED state (decisively no progress past the stale window; killed worker, no
// re-arm). NO calculation, NO continuation. Makes a dead non-terminal job authoritatively terminal.
function gapJobMarkStalled_(env, product, state) {
  state.status = 'STALLED'; state.finishedAt = env.timestamp(); state.updatedAt = state.finishedAt;
  state.lastError = state.lastError || 'STALE_NO_PROGRESS'; gapJobTouchMs_(env, state);
  gapJobWriteState_(env, product, state); gapJobLog_('STALLED', state); return state;
}
// R4J-LIVE10 §7/§8 — AUTOMATIC same-runId RECOVERY (the watchdog action). A stale non-terminal job (killed worker /
// lost first-tick) is RESUMED, never restarted and never killed: clear any orphaned trigger, arm a PROMPT
// continuation, bump recoveryCount, and stamp updatedAtMs so the run is no longer judged stale (the freshly-armed
// tick re-enters gapJobContinue_ from the durable cursor). It NEVER re-resolves context, NEVER starts a new run, and
// NEVER writes a gap row — recovery continues the SAME logical calculation from its last checkpoint. Returns
// { ok:true } once armed, or { ok:false } if arming threw (caller decides the fallback). Bounded by the caller via
// GAP_JOB_MAX_RECOVERIES_ so a genuinely broken job cannot recover forever.
function gapJobRearmRecovery_(env, product, state, ageMs) {
  try { env.clearContinuationTriggers(product); } catch (ec) {}
  try {
    env.scheduleContinuation(product, GAP_JOB_CONTINUATION_DELAY_MS_);
    state.lastContinuationScheduledAt = env.timestamp();
  } catch (schedErr) { return { ok: false, error: (schedErr && schedErr.message) ? String(schedErr.message) : String(schedErr) }; }
  state.recoveryCount = (state.recoveryCount || 0) + 1;
  state.recovering = true;
  state.status = (state.status === 'PENDING') ? 'PENDING' : 'RUNNING';
  state.lastError = 'AUTO_RECOVERY #' + state.recoveryCount + (ageMs != null ? (' after ' + ageMs + 'ms no progress') : '');
  state.updatedAt = env.timestamp(); gapJobTouchMs_(env, state);
  gapJobWriteState_(env, product, state); gapJobLog_('AUTO_RECOVERY', state);
  return { ok: true };
}

// ---- CANCEL (§1/§2) — canonical manual stop owner. Backend-authoritative; terminal CANCELLED; no row rollback ----
function gapJobCancel_(product, requestedRunId, env) {
  product = gapJobNormalizeProduct_(product);
  if (!product) return gapBatchEnvelope_(false, null, 'INVALID_PRODUCT', 'product required (INVENTORY|ORDER_PLANNING)');
  var lock = env.lock, locked = false;                                                   // §1.1 the SAME lock as start/worker
  try { locked = lock ? lock.acquire(GAP_JOB_LOCK_MS_) : true; } catch (e) { locked = false; }
  if (lock && !locked) return gapBatchEnvelope_(false, null, 'GAP_JOB_LOCK_UNAVAILABLE', 'another gap job operation is in progress');
  try {
    var state = gapJobReadState_(env, product);                                          // §1.2 load current durable job
    if (!state) return gapBatchEnvelope_(true, { product: product, status: 'NONE', runId: requestedRunId || null, cancelled: false });
    if (requestedRunId && state.runId !== requestedRunId) {                               // §1.4 never cancel a run the caller does not own
      return gapBatchEnvelope_(true, { product: product, status: state.status, runId: state.runId, cancelled: false, note: 'RUNID_MISMATCH' });
    }
    if (gapJobIsTerminal_(state.status)) return gapBatchEnvelope_(true, gapJobPublicState_(state));   // idempotent: already terminal
    gapJobLog_('CANCEL_REQUEST', state);
    try { env.clearContinuationTriggers(product); } catch (ec) {}                         // §1.5/§11 stop ONLY this product's worker chain
    gapJobMarkCancelled_(env, product, state);                                            // §1.6-§1.10 terminal CANCELLED (progress preserved)
    return gapBatchEnvelope_(true, gapJobPublicState_(state));
  } catch (e) {
    return gapBatchEnvelope_(false, null, 'GAP_JOB_CANCEL_ERROR', e && e.message ? String(e.message) : String(e));
  } finally { if (lock && locked) { try { lock.release(); } catch (_r) {} } }
}

// ---- START (§3/§9/§13): quick, browser-returning; NO calculation in the request -------------------------------
// requestedScope (optional) = { mode:'ALL_SITES'|'CURRENT_COUNTRY'|'CURRENT_SCOPE', company?, country?, marketplace? }.
// Omitted ⇒ ALL_SITES (backward compatible). A live job is joined (never a 2nd job); a STALE non-terminal job is
// SELF-HEALED on the SAME runId (§9 prefer recovery, progress preserved) until recoveries exhaust, then reclaimed.
function gapJobStart_(product, env, requestedScope) {
  product = gapJobNormalizeProduct_(product);
  if (!product) return gapBatchEnvelope_(false, null, 'INVALID_PRODUCT', 'product required (INVENTORY|ORDER_PLANNING)');
  var lock = env.lock, locked = false;
  try { locked = lock ? lock.acquire(GAP_JOB_LOCK_MS_) : true; } catch (e) { locked = false; }
  if (lock && !locked) return gapBatchEnvelope_(false, null, 'GAP_JOB_LOCK_UNAVAILABLE', 'another gap job operation is in progress');
  try {
    var existing = gapJobReadState_(env, product);
    if (existing && (existing.status === 'PENDING' || existing.status === 'RUNNING')) {   // §3.3 / §17 — never a 2nd job
      // R4J-LIVE2 §5/§7 — is the existing job actually ALIVE, or a killed worker frozen at its cursor? A healthy job
      // advances updatedAtMs every slice; a worker killed mid-slice leaves it stale with no re-arm. A LIVE (or
      // too-fresh-to-judge) job is joined unchanged.
      var stampMs = existing.updatedAtMs || existing.startedAtMs || 0;
      var ageMs = (env.nowMs ? env.nowMs() : 0) - stampMs;
      if (!stampMs || ageMs <= GAP_JOB_STALE_MS_) {
        return gapBatchEnvelope_(true, { runId: existing.runId, product: product, status: existing.status, scopesTotal: existing.scopesTotal, scopesProcessed: existing.scopesProcessed, alreadyRunning: true });
      }
      // R4J-LIVE10 §7/§9 — a demonstrably STALE non-terminal job is RECOVERED on the SAME runId (resume from its
      // durable checkpoint — never lose the progress already materialized, never restart the whole job), UNLESS the
      // bounded automatic recoveries are exhausted (a genuinely broken job) → reclaim to a fresh run. This is the
      // §7 "do not wait for the user to re-click" behavior applied at the START touch-point (browser-driven watchdog).
      if ((existing.recoveryCount || 0) < GAP_JOB_MAX_RECOVERIES_) {
        var reheal = gapJobRearmRecovery_(env, product, existing, ageMs);
        if (reheal.ok) {
          return gapBatchEnvelope_(true, { runId: existing.runId, product: product, status: existing.status, scopesTotal: existing.scopesTotal, scopesProcessed: existing.scopesProcessed, alreadyRunning: true, recovering: true, recoveryCount: existing.recoveryCount });
        }
        // re-arm itself failed (trigger quota/auth) → fall through to a fresh reclaim below
      }
      try { env.clearContinuationTriggers(product); } catch (ecr) {}                     // drop any orphaned trigger before reclaiming
      gapJobMarkFailed_(env, product, existing, 'RECLAIMED_STALLED after ' + ageMs + 'ms; automatic recoveries exhausted (killed worker / no re-arm)');
      // fall through → create a FRESH job (this is a user-initiated START, never an automatic write retry)
    }
    var ctx = env.resolveContext(product);                                              // §18 freeze the FM5-R4 canonical context now
    if (!ctx || !ctx.ok) return gapBatchEnvelope_(false, null, (ctx && ctx.code) || 'CALCULATION_CONTEXT_INVALID', (ctx && ctx.message) || 'invalid calculation context');
    var ss = env.openTarget();
    env.requireResultSheet(ss, product);                                                // fail CLOSED if the result table/header is missing (throws → catch)
    var sel = gapJobSelectScopes_(env.enumerateScopes(ss) || [], requestedScope, product);   // §13 bounded manual scope (OP → whole-company; conservation-safe)
    var scopes = gapJobOrderedScopes_(sel.scopes);
    if (!scopes.length) return gapBatchEnvelope_(false, null, 'GAP_JOB_EMPTY_SCOPE_SELECTION', 'the requested execution scope matched no eligible sites');
    var runId = env.newRunId(product);                                                   // §2 the EXISTING gapRunId_ owner
    var nowStr = env.timestamp();
    var state = gapJobNewState_(product, runId, ctx, scopes.length, nowStr, env.nowMs ? env.nowMs() : 0, requestedScope || { mode: GAP_JOB_SCOPE_MODES_.ALL_SITES }, sel.appliedScope);
    // §A3 at-most-ONE continuation per product — clear any stale/orphaned continuation trigger before arming a fresh
    // one (e.g. left by a crashed prior run) so competing workers can't cause a RESCHEDULED_LOCKED stall.
    try { env.clearContinuationTriggers(product); } catch (ec) {}
    // §A2 fail CLOSED at START: schedule the first continuation BEFORE persisting a RUNNING-capable state, and if
    // scheduling THROWS (the classic live cause — the freshly-deployed script lacks ScriptApp trigger authorization,
    // or hits the trigger quota) persist a TERMINAL FAILED (never a dangling PENDING that polls 0/N forever).
    try {
      env.scheduleContinuation(product, GAP_JOB_CONTINUATION_DELAY_MS_);                 // §3.7 hand the work to the backend
      state.lastContinuationScheduledAt = env.timestamp();
    } catch (schedErr) {
      gapJobMarkFailed_(env, product, state, 'CONTINUATION_SCHEDULE_FAILED: ' + (schedErr && schedErr.message ? schedErr.message : schedErr));
      return gapBatchEnvelope_(false, null, 'CONTINUATION_SCHEDULE_FAILED', state.lastError);
    }
    gapJobWriteState_(env, product, state);
    return gapBatchEnvelope_(true, { runId: runId, product: product, status: 'PENDING', scopesTotal: scopes.length, appliedScope: sel.appliedScope });
  } catch (e) {
    var token = (e && e.safetyToken) ? e.safetyToken : (e && e.schemaStatus) ? e.schemaStatus : 'GAP_JOB_START_ERROR';
    return gapBatchEnvelope_(false, null, token, e && e.message ? String(e.message) : String(e));
  } finally { if (lock && locked) { try { lock.release(); } catch (_r) {} } }
}

// ---- CONTINUATION WORKER (§3/§4/§5/§8/§10) — SELF-HEALING: arm a recovery path BEFORE processing, then process a
// BUDGET-bounded run of complete slices, checkpoint per slice, and finish or arm a prompt next. A hard kill at ANY
// point cannot orphan the job: the recovery trigger was armed FIRST and survives to re-enter the SAME runId. --------
function gapJobContinue_(product, env) {
  product = gapJobNormalizeProduct_(product);
  if (!product) return { status: 'INVALID_PRODUCT' };
  // R4J-LIVE10 §3 — DO NOT clear triggers before the lock. Only the lock HOLDER is authoritative over triggers; a
  // pre-lock clear (the pre-LIVE10 root cause) removed this fired trigger and then, if the worker was killed during
  // the multi-minute slice before it re-armed, left the RUNNING job with ZERO triggers → permanent stall.
  var lock = env.lock, locked = false;
  try { locked = lock ? lock.acquire(GAP_JOB_LOCK_MS_) : true; } catch (e) { locked = false; }
  if (lock && !locked) {                                                                // another slice is active (holds the lock) → re-arm, BOUNDED
    var ls = gapJobReadState_(env, product);
    if (ls && !gapJobIsTerminal_(ls.status)) {
      ls.lockWaits = (ls.lockWaits || 0) + 1; ls.updatedAt = env.timestamp(); gapJobTouchMs_(env, ls);
      if (ls.lockWaits >= GAP_JOB_MAX_LOCK_WAITS_) {                                     // §A2 a permanently stuck lock must NOT loop forever at 0/N
        gapJobMarkFailed_(env, product, ls, 'LOCK_UNAVAILABLE_TIMEOUT after ' + ls.lockWaits + ' waits');
        return ls;                                                                      // do NOT re-arm a permanently blocked worker
      }
      gapJobWriteState_(env, product, ls);
      // A non-holder NEVER clears triggers (the holder owns them). Re-arm a prompt tick so the chain survives if the
      // holder dies; the holder's next start-of-run sweep collects this + any duplicates and normalizes to one.
      try { env.scheduleContinuation(product, GAP_JOB_CONTINUATION_DELAY_MS_); } catch (er) {}
    }
    return { status: 'RESCHEDULED_LOCKED', product: product };
  }
  var product_ = product;   // stable ref for the finally-safe recovery path
  try {
    var state = gapJobReadState_(env, product);
    if (!state) { try { env.clearContinuationTriggers(product); } catch (_c0) {} return { status: 'NO_STATE', product: product }; }
    if (gapJobIsTerminal_(state.status)) { try { env.clearContinuationTriggers(product); } catch (_c1) {} return state; }   // terminal → sweep triggers, no-op
    var ctx = { ok: true, calculationDate: state.calculationDate, calculationMonth: state.calculationMonth, planningCycle: state.planningCycle };
    var ss = env.openTarget();
    var sheet = env.requireResultSheet(ss, product);
    var scopes = gapJobOrderedScopes_(gapJobSelectScopes_(env.enumerateScopes(ss) || [], state.requestedScope, product).scopes);   // §13 same bounded scope every slice
    state.scopesTotal = scopes.length;
    if (state.scopeCursor >= scopes.length) { try { env.clearContinuationTriggers(product); } catch (_c2) {} return gapJobMarkDone_(env, product, state); }
    // §8/§4 NO-PROGRESS GUARD — a worker re-entering at the SAME cursor as the previous entry made no durable progress
    // (killed/overran, or a single slice that cannot fit the budget). Bounded: after GAP_JOB_MAX_SLICE_ATTEMPTS_ such
    // entries the job is a TRUTHFUL terminal FAILED (never an endless kill→recover loop). Conservation forbids a finer
    // OP split, so an oversize company slice is surfaced honestly rather than silently split.
    if (state.stuckCursor === state.scopeCursor) { state.stuckCount = (state.stuckCount || 0) + 1; }
    else { state.stuckCursor = state.scopeCursor; state.stuckCount = 1; }
    if (state.stuckCount > GAP_JOB_MAX_SLICE_ATTEMPTS_) {
      try { env.clearContinuationTriggers(product); } catch (_c3) {}
      return gapJobMarkFailed_(env, product, state, 'SLICE_EXCEEDS_WORKER_BUDGET at cursor ' + state.scopeCursor + ' (a single ' + (product === 'ORDER_PLANNING' ? 'company' : 'scope') + ' slice cannot complete within the worker budget; conservation forbids a finer split)');
    }
    // R4J-LIVE10 §3 — NORMALIZE + arm the RECOVERY trigger BEFORE any processing. We hold the lock ⇒ authoritative:
    // sweep ALL our continuation triggers (this fired one + accumulated duplicates), then arm exactly ONE recovery
    // trigger at a delay LONGER than the hard limit. If a kill/overrun prevents the clean exit below, THIS trigger is
    // the survivor that re-enters the same runId. Arming FAILS CLOSED (never process with no safety net).
    try { env.clearContinuationTriggers(product); } catch (_c4) {}
    try { env.scheduleContinuation(product, GAP_JOB_RECOVERY_DELAY_MS_); state.lastContinuationScheduledAt = env.timestamp(); }
    catch (recErr) { return gapJobMarkFailed_(env, product, state, 'RECOVERY_ARM_FAILED: ' + (recErr && recErr.message ? recErr.message : recErr)); }
    // §A5 worker started — proves the trigger actually FIRED (vs never firing = auth/quota).
    state.lockWaits = 0;
    state.status = 'RUNNING';                                                            // §22 observable RUNNING
    state.lastWorkerStartedAt = env.timestamp(); state.updatedAt = state.lastWorkerStartedAt; gapJobTouchMs_(env, state);
    gapJobWriteState_(env, product, state); gapJobLog_('WORKER_START', state);
    // §4 BUDGET LOOP — process COMPLETE slices until the worker budget elapses or every scope is done. Each slice is
    // an independently-resumable unit (Inventory: GAP_JOB_INV_CHUNK_SCOPES_ scopes; Order Planning: ONE whole company
    // = the conservation boundary). The checkpoint is persisted AFTER every complete slice so a mid-run kill loses at
    // most the in-flight slice (which re-runs idempotently). The budget is checked BEFORE starting each slice, never
    // relying on the ~6-min hard kill as flow control.
    var workerStartMs = env.nowMs ? env.nowMs() : 0;
    var budgetMs = (typeof env.workerBudgetMs === 'number') ? env.workerBudgetMs : GAP_JOB_WORKER_BUDGET_MS_;
    while (state.scopeCursor < scopes.length) {
      if (env.nowMs && (env.nowMs() - workerStartMs) >= budgetMs) break;                 // §4 budget exhausted → exit cleanly + arm prompt next below
      var slice = gapJobNextSlice_(product, scopes, state.scopeCursor);
      var inc;
      try {
        inc = env.processSlice(product, slice.scopes, ss, sheet, ctx) || {};             // §6 reuse the canonical calc via 43's slice processors
      } catch (procErr) {
        // §10 — do NOT advance the cursor (the slice re-runs; latest-state UPSERT keeps it idempotent). Bounded
        // attempts, then TERMINAL FAILED — never an infinite RUNNING at the same cursor.
        state.sliceAttempts = (state.sliceAttempts || 0) + 1;
        state.lastError = (procErr && procErr.message) ? String(procErr.message) : String(procErr);
        state.lastWorkerFinishedAt = env.timestamp(); state.updatedAt = state.lastWorkerFinishedAt; gapJobTouchMs_(env, state);
        if (state.sliceAttempts >= GAP_JOB_MAX_SLICE_ATTEMPTS_) { try { env.clearContinuationTriggers(product); } catch (_c5) {} return gapJobMarkFailed_(env, product, state, state.lastError); }
        gapJobWriteState_(env, product, state);
        try { env.clearContinuationTriggers(product); env.scheduleContinuation(product, GAP_JOB_CONTINUATION_DELAY_MS_); state.lastContinuationScheduledAt = env.timestamp(); gapJobWriteState_(env, product, state); } catch (er2) {}
        return state;                                                                    // exit; a prompt retry re-runs the same slice
      }
      // LIVE4 §3 — honor a CANCEL / reclaim that landed DURING this slice: re-read the durable owner BEFORE advancing.
      // If cancelled (terminal) or a new run took over, STOP — a cancelled worker must NEVER advance or re-arm (no
      // self-resurrection). Sweep our triggers so no stray recovery tick fires; written rows remain.
      var live = gapJobReadState_(env, product);
      if (!live || live.runId !== state.runId || gapJobIsTerminal_(live.status)) { try { env.clearContinuationTriggers(product); } catch (_c6) {} gapJobLog_('CANCELLED', live || state); return live || state; }
      // advance a COMPLETE slice + fold counts; PERSIST the checkpoint (§5 durable per-slice)
      state.sliceAttempts = 0;
      state.stuckCursor = slice.nextCursor; state.stuckCount = 0;                         // durable progress → reset the no-progress guard
      state.recovering = false;                                                          // real progress clears any recovery marker
      state.scopeCursor = slice.nextCursor;
      state.scopesProcessed = state.scopeCursor;
      state.rowsProcessed += (inc.written || 0);
      state.readyCount += (inc.ready || 0);
      state.blockedCount += (inc.blocked || 0);
      state.errorCount += (inc.errors || 0);
      var lastScope = slice.scopes[slice.scopes.length - 1];
      state.lastProcessedScope = lastScope ? (lastScope.company + '/' + lastScope.country + '/' + lastScope.marketplace) : state.lastProcessedScope;
      if (inc.scopeErrors && inc.scopeErrors.length) state.lastError = 'SCOPE_ERRORS:' + inc.scopeErrors.length;
      state.lastWorkerFinishedAt = env.timestamp(); state.updatedAt = state.lastWorkerFinishedAt; gapJobTouchMs_(env, state);
      state.status = 'RUNNING';
      gapJobWriteState_(env, product, state);                                            // durable checkpoint (recovery trigger still armed as backstop)
    }
    // POST-LOOP — DONE (every scope processed) or exit on budget with a PROMPT next continuation armed.
    if (state.scopeCursor >= scopes.length) {
      try { env.clearContinuationTriggers(product); } catch (_c7) {}                      // job complete → remove the recovery backstop
      return gapJobMarkDone_(env, product, state);
    }
    // budget hit with work remaining: arm a prompt next (fast progress); the recovery trigger armed at worker start
    // also remains as a backstop, and the next worker's start-of-run sweep normalizes to one.
    try { env.scheduleContinuation(product, GAP_JOB_CONTINUATION_DELAY_MS_); state.lastContinuationScheduledAt = env.timestamp(); } catch (er3) {}
    gapJobWriteState_(env, product, state);
    return state;
  } catch (e) {
    // §A2 infrastructure failure (open/enumerate) — ALWAYS persist a non-dangling state; bounded retry then FAILED.
    var st = gapJobReadState_(env, product_);
    if (!st) st = gapJobNewState_(product_, 'GAP-RECOVER', {}, 0, env.timestamp(), env.nowMs ? env.nowMs() : 0);   // never return a non-persisted terminal
    if (gapJobIsTerminal_(st.status)) return st;
    st.sliceAttempts = (st.sliceAttempts || 0) + 1;
    st.lastError = (e && e.message) ? String(e.message) : String(e);
    st.lastWorkerFinishedAt = env.timestamp(); st.updatedAt = st.lastWorkerFinishedAt; gapJobTouchMs_(env, st);
    if (st.sliceAttempts >= GAP_JOB_MAX_SLICE_ATTEMPTS_) return gapJobMarkFailed_(env, product_, st, st.lastError);
    gapJobWriteState_(env, product_, st);
    try { env.scheduleContinuation(product_, GAP_JOB_CONTINUATION_DELAY_MS_); } catch (er4) {}
    return st;
  } finally { if (lock && locked) { try { lock.release(); } catch (_r) {} } }
}

// ---- STATUS (§8/§10 + LIVE10 §7) — observes progress and, for a decisively-stale run, drives the AUTOMATIC WATCHDOG.
// It NEVER runs a calculation, NEVER writes a gap row, NEVER re-resolves context, and NEVER starts a new run. Its only
// write is the §7-authorized self-heal of the SAME runId (re-arm the continuation of the existing logical job) or, for
// a job that cannot be recovered, a truthful terminal STALLED. So STATUS is read-only w.r.t. the calculation; the
// lifecycle self-heal it performs is continuation of the current job, not a fresh computation.
function gapJobStatus_(product, runId, env) {
  product = gapJobNormalizeProduct_(product);
  if (!product) return gapBatchEnvelope_(false, null, 'INVALID_PRODUCT', 'product required (INVENTORY|ORDER_PLANNING)');
  var state = gapJobReadState_(env, product);
  if (!state) return gapBatchEnvelope_(true, { product: product, status: 'NONE', runId: runId || null });
  if (gapJobStaleNonterminal_(state, env.nowMs ? env.nowMs() : 0)) {
      var lock = env.lock, locked = false;
      try { locked = lock ? lock.acquire(GAP_JOB_LOCK_MS_) : true; } catch (e) { locked = false; }
      try {
        var fresh = (locked ? gapJobReadState_(env, product) : null) || state;           // re-read under lock (avoid racing a live worker)
        if (gapJobStaleNonterminal_(fresh, env.nowMs ? env.nowMs() : 0)) {
            // LIVE6 §4 — a LEGACY leftover (non-terminal Script-Property with NO epoch stamps at all) has no lifecycle
            // continuity to recover → it is decisively dead and becomes TERMINAL STALLED (never resurrected).
            var legacy = (fresh.updatedAtMs == null && fresh.startedAtMs == null);
            if (legacy || (fresh.recoveryCount || 0) >= GAP_JOB_MAX_RECOVERIES_) {
                if (locked) { gapJobMarkStalled_(env, product, fresh); }                  // persist truthful terminal STALLED
                else { fresh.status = 'STALLED'; gapJobLog_('STALLED', fresh); }          // lock busy → report-only (a later poll persists)
            } else if (locked) {
                // LIVE10 §7 — AUTOMATIC recovery of the SAME runId: re-arm the continuation, keep the job non-terminal,
                // and mark `recovering` so the browser shows "Recovering…" (never a false failure). Bounded by
                // recoveryCount; if arming the continuation fails, fall back to the truthful terminal STALLED.
                var r = gapJobRearmRecovery_(env, product, fresh, null);
                if (!r.ok) { gapJobMarkStalled_(env, product, fresh); }
            } else {
                fresh.recovering = true;                                                  // lock busy → report-only recovering; a later poll under lock re-arms
            }
        }
        state = fresh;
      } finally { if (lock && locked) { try { lock.release(); } catch (_r) {} } }
  }
  if (runId && state.runId !== runId) return gapBatchEnvelope_(true, { product: product, status: 'NONE', runId: runId, current: gapJobPublicState_(state) });
  return gapBatchEnvelope_(true, gapJobPublicState_(state));
}

// ---- the ACTUAL slice calculation (production env.processSlice) — reuses 43's extracted processors -----------
// Builds a materialization io whose calculation DATE/MONTH come from the FROZEN job context (never a Script
// Property, never the wall clock), then delegates to the SAME scope-slice processor the monolithic batch uses.
function gapJobProcessSlice_(product, sliceScopes, ss, sheet, ctx) {
  var calcContext = { ok: true, jobType: product, calculationDate: ctx.calculationDate, calculationMonth: ctx.calculationMonth, planningCycle: ctx.planningCycle, timezone: GAP_JOB_TZ_ };
  var io = gapMaterializationDefaultIo_(calcContext);
  io.openTarget = function () { return ss; };                                           // share the already-open spreadsheet
  if (product === 'ORDER_PLANNING') {
    var poolFacts = gapOpReadSupplyPoolFacts_(ss);                                       // bounded pool read; allocation is per-company by construction
    return gapProcessOrderPlanningScopeSlice_(sliceScopes, io, ss, sheet, poolFacts, gapOpMapFromLines_);
  }
  return gapProcessScopeSlice_(sliceScopes, io, sheet, { product: 'INVENTORY', map: gapInvMapFromLines_ });
}

// ---- PRODUCTION side-effect adapters (Apps Script globals; not exercised by Node tests) ----------------------
function gapJobScriptProps_() {
  var sp = PropertiesService.getScriptProperties();
  return { get: function (k) { return sp.getProperty(k); }, set: function (k, v) { sp.setProperty(k, v); }, del: function (k) { sp.deleteProperty(k); } };
}
function gapJobScriptLock_() {
  var l = null; try { l = LockService.getScriptLock(); } catch (e) { l = null; }
  return { acquire: function (ms) { try { return l ? l.tryLock(ms) : true; } catch (e) { return false; } }, release: function () { try { if (l) l.releaseLock(); } catch (e) {} } };
}
function gapJobTimestamp_() { try { return Utilities.formatDate(new Date(), GAP_JOB_TZ_, 'yyyy-MM-dd HH:mm:ss'); } catch (e) { return ''; } }
function gapJobIoClock_() { return { now: function () { return new Date(); }, tz: function () { try { return Session.getScriptTimeZone(); } catch (e) { return 'UTC'; } } }; }
function gapJobScheduleContinuation_(product, ms) {
  var h = GAP_JOB_CONTINUATION_HANDLERS_[product]; if (!h) return;
  ScriptApp.newTrigger(h).timeBased().after(Math.max(1, ms || GAP_JOB_CONTINUATION_DELAY_MS_)).create();
}
function gapJobIsOwnedContinuationHandler_(name) {
  var n = String(name == null ? '' : name);
  for (var k in GAP_JOB_CONTINUATION_HANDLERS_) { if (Object.prototype.hasOwnProperty.call(GAP_JOB_CONTINUATION_HANDLERS_, k) && GAP_JOB_CONTINUATION_HANDLERS_[k] === n) return true; }
  return false;
}
// AUTH3 §2 — SAFE delete provenance (the ONE deletion pattern used everywhere in this module): NEVER delete the
// Trigger object returned by ScriptApp.newTrigger().create() (the proven live "Unexpected error while getting the
// method or property deleteTrigger on object ScriptApp." cause — a create()-returned handle is not a reliable delete
// target). ALWAYS re-read ScriptApp.getProjectTriggers() and delete the object obtained from THAT read, matched by the
// EXACT handler. Deletes ONLY the handler passed — never runAmazonSnapshotImports, never the daily
// runDailyInventoryGapMaterialization / runDailyOrderPlanningGapMaterialization, never any unrelated trigger. Returns
// the number deleted (0 is harmless — a missing target is not an error). Duplicates for the same handler are all cleaned.
function gapJobDeleteTriggersByHandler_(handler) {
  var h = String(handler == null ? '' : handler); if (!h) return 0;
  var triggers = ScriptApp.getProjectTriggers(), n = 0;
  for (var i = 0; i < triggers.length; i++) { if (triggers[i].getHandlerFunction() === h) { ScriptApp.deleteTrigger(triggers[i]); n++; } }
  return n;
}
// §11 delete ONLY this product's own continuation triggers (handler resolved from the trusted continuation-handler map).
function gapJobClearContinuationTriggers_(product) {
  var h = GAP_JOB_CONTINUATION_HANDLERS_[product]; if (!h) return;
  gapJobDeleteTriggersByHandler_(h);
}
function gapJobDefaultEnv_(product) {
  return {
    props: gapJobScriptProps_(),
    lock: gapJobScriptLock_(),
    resolveContext: function (p) { return gapCalcResolveContext_(gapJobNormalizeProduct_(p) === 'ORDER_PLANNING' ? 'ORDER_PLANNING' : 'INVENTORY'); },
    openTarget: function () { return gapMaterializationDefaultIo_().openTarget(); },   // reuses prodExpectedDbId_/prodAssertDbTarget_
    requireResultSheet: function (ss, p) { var t = gapJobResultTableFor_(gapJobNormalizeProduct_(p)); return prodRequireSheet_(ss, t.table, t.headers); },
    enumerateScopes: function (ss) { return gapEnumerateScopes_(ss); },
    newRunId: function (p) { return gapRunId_(gapJobNormalizeProduct_(p), gapJobIoClock_()); },
    timestamp: function () { return gapJobTimestamp_(); },
    nowMs: function () { try { return new Date().getTime(); } catch (e) { return 0; } },   // R4J-LIVE2 §5/§7 monotonic progress clock (epoch ms)
    scheduleContinuation: function (p, ms) { return gapJobScheduleContinuation_(gapJobNormalizeProduct_(p), ms); },
    clearContinuationTriggers: function (p) { return gapJobClearContinuationTriggers_(gapJobNormalizeProduct_(p)); },
    processSlice: function (p, sliceScopes, ss, sheet, ctx) { return gapJobProcessSlice_(gapJobNormalizeProduct_(p), sliceScopes, ss, sheet, ctx); }
  };
}

// ---- PUBLIC router handlers (START = write/quick; STATUS = read-only) ----------------------------------------
// LIVE10 §13 — START accepts an OPTIONAL bounded execution scope in the payload
// ({ scope:{ mode:'ALL_SITES'|'CURRENT_COUNTRY'|'CURRENT_SCOPE', company?, country?, marketplace? } }). Absent ⇒
// ALL_SITES (backward compatible with the existing empty {} payload). OP sub-company scopes are expanded to the whole
// company inside gapJobStart_ → gapJobSelectScopes_ (shared-pool conservation).
function handleStartInventoryReplenishmentGapJob_(body) { var p = (body && body.payload) || {}; return gapJobStart_('INVENTORY', gapJobDefaultEnv_('INVENTORY'), p.scope || null); }
function handleStartOrderPlanningGapJob_(body) { var p = (body && body.payload) || {}; return gapJobStart_('ORDER_PLANNING', gapJobDefaultEnv_('ORDER_PLANNING'), p.scope || null); }
function handleGetGapJobStatus_(body) {
  var p = (body && body.payload) || body || {};
  var product = gapJobNormalizeProduct_(p.product);
  if (!product) return gapBatchEnvelope_(false, null, 'INVALID_PRODUCT', 'product required (INVENTORY|ORDER_PLANNING)');
  return gapJobStatus_(product, p.runId || null, gapJobDefaultEnv_(product));
}
// LIVE4 §1/§6 — manual cancel (WRITE): terminal CANCELLED for the currently-active product job. runId optional
// (when supplied, only that run is cancelled). Isolated per product (never the other product / import / scheduler).
function handleCancelInventoryReplenishmentGapJob_(body) { var p = (body && body.payload) || body || {}; return gapJobCancel_('INVENTORY', p.runId || null, gapJobDefaultEnv_('INVENTORY')); }
function handleCancelOrderPlanningGapJob_(body) { var p = (body && body.payload) || body || {}; return gapJobCancel_('ORDER_PLANNING', p.runId || null, gapJobDefaultEnv_('ORDER_PLANNING')); }

// ---- LIVE8 §B4/§B5 + AUTH3 — ScriptApp trigger CREATE + CLEANUP authorization VERIFICATION -----------------------
// LIVE8 proved trigger CREATION works after the script.scriptapp scope grant (live created:true for both handlers).
// AUTH3 repairs the remaining live failure — "Unexpected error while getting the method or property deleteTrigger on
// object ScriptApp." — which came from the OLD verifier deleting the Trigger object returned DIRECTLY by
// newTrigger().create() (an unreliable delete target, Cause A). The verifier now cleans up with the SAME safe
// provenance as every production cleanup path (gapJobDeleteTriggersByHandler_ → re-read getProjectTriggers(), delete
// by handler). It still runs NO gap calculation and installs NO permanent trigger. CREATE and CLEANUP are classified
// SEPARATELY so a cleanup failure is NEVER reported as an authorization failure when creation actually succeeded:
//   CREATE ok + CLEANUP ok   → { status:'TRIGGER_AUTHORIZATION_OK',     created:true,  cleanup:true,  handlers:[...] }
//   CREATE fails             → { status:'TRIGGER_AUTHORIZATION_FAILED', created:false, cleanup:false, handlers:[...] }
//   CREATE ok + CLEANUP fail → { status:'TRIGGER_CLEANUP_FAILED',       created:true,  cleanup:false, handlers:[...] }
// Cleanup is guarded to owned gap continuation handlers only (gapJobIsOwnedContinuationHandler_) — NEVER the Amazon
// import trigger or any unrelated trigger. Testable core (injectable io) + a thin top-level USER-run editor wrapper.
function gapJobVerifyTriggerAuth_(handlers, io) {
  var results = [], createOk = true, cleanupOk = true;
  for (var i = 0; i < (handlers || []).length; i++) {
    var h = handlers[i], created = false, cleanup = false, cleaned = 0, error = null, cleanupError = null;
    try {
      io.createTrigger(h);                                       // the SAME ScriptApp.newTrigger auth the START path needs
      created = true;
    } catch (e) {
      createOk = false; error = (e && e.message) ? String(e.message) : String(e);       // §B5 surface the EXACT create exception
    }
    if (created && io.isOwned(h)) {                              // §B6 clean up ONLY an owned gap continuation handler
      try {
        cleaned = io.cleanupOwned(h);                            // AUTH3 §2 safe provenance (re-read getProjectTriggers, delete by handler)
        cleanup = true;
      } catch (ce) {
        cleanupOk = false; cleanupError = (ce && ce.message) ? String(ce.message) : String(ce);   // surface the EXACT cleanup exception
      }
    }
    results.push({ handler: h, created: created, cleanup: cleanup, cleaned: cleaned, error: error, cleanupError: cleanupError });
  }
  if (!createOk) return { status: 'TRIGGER_AUTHORIZATION_FAILED', created: false, cleanup: false, handlers: results };
  if (!cleanupOk) return { status: 'TRIGGER_CLEANUP_FAILED', created: true, cleanup: false, handlers: results };
  return { status: 'TRIGGER_AUTHORIZATION_OK', created: true, cleanup: true, handlers: results };
}
// Top-level, USER-run from the Apps Script editor (NOT wired to any POST/trigger). Run ONCE as the project owner to
// grant + PROVE the trigger CREATE and CLEANUP scopes; it verifies BOTH products (§B8). NEVER performs a gap calculation.
function verifyGapTriggerAuthorization() {
  var out = gapJobVerifyTriggerAuth_(
    [GAP_JOB_CONTINUATION_HANDLERS_.INVENTORY, GAP_JOB_CONTINUATION_HANDLERS_.ORDER_PLANNING],
    { createTrigger: function (h) { return ScriptApp.newTrigger(h).timeBased().after(60000).create(); },
      cleanupOwned: function (h) { return gapJobDeleteTriggersByHandler_(h); },   // AUTH3 §2 safe provenance — re-read getProjectTriggers(), never the create()-returned object
      isOwned: function (h) { return gapJobIsOwnedContinuationHandler_(h); } });
  try { if (typeof Logger !== 'undefined' && Logger.log) Logger.log('[GapJob] ' + JSON.stringify(out)); } catch (_l) {}
  return out;
}

// ---- TIME-TRIGGER TARGETS (NO trailing underscore — Apps Script trigger handlers must be callable by name) ----
function continueInventoryGapMaterializationJob(e) { return gapJobContinue_('INVENTORY', gapJobDefaultEnv_('INVENTORY')); }
function continueOrderPlanningGapMaterializationJob(e) { return gapJobContinue_('ORDER_PLANNING', gapJobDefaultEnv_('ORDER_PLANNING')); }
