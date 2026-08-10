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
function gapJobNewState_(product, runId, ctx, scopesTotal, nowStr, nowMs) {
  return {
    runId: runId, product: product, status: 'PENDING',
    scopeCursor: 0, scopesTotal: scopesTotal, scopesProcessed: 0,
    rowsProcessed: 0, readyCount: 0, blockedCount: 0, errorCount: 0,
    calculationDate: ctx.calculationDate || '', calculationMonth: ctx.calculationMonth || '', planningCycle: ctx.planningCycle || '',
    startedAt: nowStr, updatedAt: nowStr, startedAtMs: (nowMs || 0), updatedAtMs: (nowMs || 0), finishedAt: null, cancelledAt: null, lastError: null, sliceAttempts: 0,
    lockWaits: 0, lastContinuationScheduledAt: null, lastWorkerStartedAt: null, lastWorkerFinishedAt: null, lastProcessedScope: null
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
    lastWorkerFinishedAt: s.lastWorkerFinishedAt, lastProcessedScope: s.lastProcessedScope };
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

// ---- START (§3): quick, browser-returning; NO calculation in the request -------------------------------------
function gapJobStart_(product, env) {
  product = gapJobNormalizeProduct_(product);
  if (!product) return gapBatchEnvelope_(false, null, 'INVALID_PRODUCT', 'product required (INVENTORY|ORDER_PLANNING)');
  var lock = env.lock, locked = false;
  try { locked = lock ? lock.acquire(GAP_JOB_LOCK_MS_) : true; } catch (e) { locked = false; }
  if (lock && !locked) return gapBatchEnvelope_(false, null, 'GAP_JOB_LOCK_UNAVAILABLE', 'another gap job operation is in progress');
  try {
    var existing = gapJobReadState_(env, product);
    if (existing && (existing.status === 'PENDING' || existing.status === 'RUNNING')) {   // §3.3 / §17 — never a 2nd job
      // R4J-LIVE2 §5/§7 — is the existing job actually ALIVE, or a killed worker frozen at its cursor? A healthy job
      // advances updatedAtMs every slice; a worker killed mid-slice leaves it stale with no re-arm. Only a LIVE (or
      // too-fresh-to-judge) job blocks a duplicate; a demonstrably STALLED job is reclaimed so the user can retry.
      var stampMs = existing.updatedAtMs || existing.startedAtMs || 0;
      var ageMs = (env.nowMs ? env.nowMs() : 0) - stampMs;
      if (!stampMs || ageMs <= GAP_JOB_STALE_MS_) {
        return gapBatchEnvelope_(true, { runId: existing.runId, product: product, status: existing.status, scopesTotal: existing.scopesTotal, scopesProcessed: existing.scopesProcessed, alreadyRunning: true });
      }
      try { env.clearContinuationTriggers(product); } catch (ecr) {}                     // drop any orphaned trigger before reclaiming
      gapJobMarkFailed_(env, product, existing, 'RECLAIMED_STALLED after ' + ageMs + 'ms without progress (killed worker / no re-arm)');
      // fall through → create a FRESH job (this is a user-initiated START, never an automatic write retry)
    }
    var ctx = env.resolveContext(product);                                              // §18 freeze the FM5-R4 canonical context now
    if (!ctx || !ctx.ok) return gapBatchEnvelope_(false, null, (ctx && ctx.code) || 'CALCULATION_CONTEXT_INVALID', (ctx && ctx.message) || 'invalid calculation context');
    var ss = env.openTarget();
    env.requireResultSheet(ss, product);                                                // fail CLOSED if the result table/header is missing (throws → catch)
    var scopes = gapJobOrderedScopes_(env.enumerateScopes(ss) || []);
    var runId = env.newRunId(product);                                                   // §2 the EXISTING gapRunId_ owner
    var nowStr = env.timestamp();
    var state = gapJobNewState_(product, runId, ctx, scopes.length, nowStr, env.nowMs ? env.nowMs() : 0);
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
    return gapBatchEnvelope_(true, { runId: runId, product: product, status: 'PENDING', scopesTotal: scopes.length });
  } catch (e) {
    var token = (e && e.safetyToken) ? e.safetyToken : (e && e.schemaStatus) ? e.schemaStatus : 'GAP_JOB_START_ERROR';
    return gapBatchEnvelope_(false, null, token, e && e.message ? String(e.message) : String(e));
  } finally { if (lock && locked) { try { lock.release(); } catch (_r) {} } }
}

// ---- CONTINUATION WORKER (§4/§5/§10) — process ONE bounded slice, persist, re-arm or finish -------------------
function gapJobContinue_(product, env) {
  product = gapJobNormalizeProduct_(product);
  if (!product) return { status: 'INVALID_PRODUCT' };
  // §11 trigger hygiene FIRST — remove this product's own pending one-off continuation triggers (this execution is
  // one of them) so they can never accumulate. ONLY our own continuation handlers are ever deleted.
  try { env.clearContinuationTriggers(product); } catch (e0) {}
  var lock = env.lock, locked = false;
  try { locked = lock ? lock.acquire(GAP_JOB_LOCK_MS_) : true; } catch (e) { locked = false; }
  if (lock && !locked) {                                                                // another slice is active → re-arm, but BOUNDED
    var ls = gapJobReadState_(env, product);
    if (ls && !gapJobIsTerminal_(ls.status)) {
      ls.lockWaits = (ls.lockWaits || 0) + 1; ls.updatedAt = env.timestamp(); gapJobTouchMs_(env, ls);
      if (ls.lockWaits >= GAP_JOB_MAX_LOCK_WAITS_) {                                     // §A2 a permanently stuck lock must NOT loop forever at 0/N
        gapJobMarkFailed_(env, product, ls, 'LOCK_UNAVAILABLE_TIMEOUT after ' + ls.lockWaits + ' waits');
        return ls;                                                                      // do NOT re-arm a permanently blocked worker
      }
      gapJobWriteState_(env, product, ls);
      try { env.scheduleContinuation(product, GAP_JOB_CONTINUATION_DELAY_MS_); } catch (er) {}
    }
    return { status: 'RESCHEDULED_LOCKED', product: product };
  }
  var product_ = product;   // stable ref for the finally-safe recovery path
  try {
    var state = gapJobReadState_(env, product);
    if (!state) return { status: 'NO_STATE', product: product };
    if (gapJobIsTerminal_(state.status)) return state;                                   // terminal → nothing to do
    // §A5 worker started — this timestamp proves the continuation trigger actually FIRED (vs never firing = auth/quota).
    state.lockWaits = 0;                                                                 // acquired → reset the lock-wait counter
    state.status = 'RUNNING';                                                            // §22 observable RUNNING
    state.lastWorkerStartedAt = env.timestamp(); state.updatedAt = state.lastWorkerStartedAt; gapJobTouchMs_(env, state);
    gapJobWriteState_(env, product, state); gapJobLog_('WORKER_START', state);
    // §18 the calculation context is taken from the FROZEN job state — NEVER re-resolved from the wall clock, so a
    // midnight rollover mid-job cannot change calculationDate/Month across slices.
    var ctx = { ok: true, calculationDate: state.calculationDate, calculationMonth: state.calculationMonth, planningCycle: state.planningCycle };
    var ss = env.openTarget();
    var sheet = env.requireResultSheet(ss, product);
    var scopes = gapJobOrderedScopes_(env.enumerateScopes(ss) || []);
    state.scopesTotal = scopes.length;
    if (state.scopeCursor >= scopes.length) return gapJobMarkDone_(env, product, state);
    var slice = gapJobNextSlice_(product, scopes, state.scopeCursor);
    var inc;
    try {
      inc = env.processSlice(product, slice.scopes, ss, sheet, ctx) || {};              // §6 reuse the canonical calc via 43's slice processors
    } catch (procErr) {
      // §10 — do NOT advance the cursor (the slice re-runs; latest-state UPSERT keeps it idempotent). Bounded
      // attempts, then TERMINAL FAILED — never an infinite RUNNING at the same cursor.
      state.sliceAttempts = (state.sliceAttempts || 0) + 1;
      state.lastError = (procErr && procErr.message) ? String(procErr.message) : String(procErr);
      state.lastWorkerFinishedAt = env.timestamp(); state.updatedAt = state.lastWorkerFinishedAt; gapJobTouchMs_(env, state);
      if (state.sliceAttempts >= GAP_JOB_MAX_SLICE_ATTEMPTS_) return gapJobMarkFailed_(env, product, state, state.lastError);
      gapJobWriteState_(env, product, state);
      try { env.scheduleContinuation(product, GAP_JOB_CONTINUATION_DELAY_MS_); state.lastContinuationScheduledAt = env.timestamp(); gapJobWriteState_(env, product, state); } catch (er2) {}
      return state;
    }
    // LIVE4 §3 — honor a CANCEL / reclaim that landed DURING this slice: re-read the durable owner BEFORE advancing
    // or re-arming. If the job was cancelled (terminal) or a new run took over, STOP immediately — a cancelled old
    // worker must NEVER advance the cursor or re-arm a continuation (no self-resurrection). Its written rows remain.
    var live = gapJobReadState_(env, product);
    if (!live || live.runId !== state.runId || gapJobIsTerminal_(live.status)) { gapJobLog_('CANCELLED', live || state); return live || state; }
    // fold the slice counts into the persisted progress and advance the cursor by a COMPLETE slice (§5)
    state.sliceAttempts = 0;
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
    // R4J-LIVE3 §2 — CRASH-SAFE FINALIZATION. Persist the ADVANCED cursor and ALWAYS arm a continuation BEFORE the
    // terminal decision, so a runtime termination in the finalize window self-heals: the durable state already shows
    // scopeCursor>=scopesTotal and a scheduled tick re-enters gapJobContinue_ and marks DONE at the top-of-worker
    // completion check (a pure state transition, no calculation, idempotent). This guarantees the §2 invariant —
    // scopesProcessed>=scopesTotal can NEVER remain RUNNING — even if the inline DONE write below is lost. On the
    // happy path DONE is written inline here and the armed tick simply no-ops on the terminal state (one cheap tick).
    state.status = 'RUNNING';
    try { env.scheduleContinuation(product, GAP_JOB_CONTINUATION_DELAY_MS_); state.lastContinuationScheduledAt = env.timestamp(); } catch (er3) {}
    gapJobWriteState_(env, product, state);                                                 // durable advance + armed self-heal continuation
    if (state.scopeCursor >= scopes.length) return gapJobMarkDone_(env, product, state);     // §9 DONE = reached every planned scope
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

// ---- STATUS (§8) — strictly READ ONLY: no write, no continuation, no calculation ----------------------------
function gapJobStatus_(product, runId, env) {
  product = gapJobNormalizeProduct_(product);
  if (!product) return gapBatchEnvelope_(false, null, 'INVALID_PRODUCT', 'product required (INVENTORY|ORDER_PLANNING)');
  var state = gapJobReadState_(env, product);
  if (!state) return gapBatchEnvelope_(true, { product: product, status: 'NONE', runId: runId || null });
  // LIVE4 §4 — authoritative NON-STUCK: a non-terminal job with NO progress past the stale window is decisively dead
  // (killed worker, no re-arm). Transition it to TERMINAL STALLED so a reload never resurrects Calculating. This is a
  // bounded state write (NEVER a calculation, NEVER a continuation, NEVER a gap-row write); best-effort under the
  // shared lock, with a clean re-read so a worker that just advanced is not wrongly stalled.
  if (gapJobStaleNonterminal_(state, env.nowMs ? env.nowMs() : 0)) {
      var lock = env.lock, locked = false;
      try { locked = lock ? lock.acquire(GAP_JOB_LOCK_MS_) : true; } catch (e) { locked = false; }
      try {
        var fresh = (locked ? gapJobReadState_(env, product) : null) || state;           // re-read under lock (avoid racing a live worker)
        if (gapJobStaleNonterminal_(fresh, env.nowMs ? env.nowMs() : 0)) {
            if (locked) { gapJobMarkStalled_(env, product, fresh); }                      // persist terminal STALLED
            else { fresh.status = 'STALLED'; gapJobLog_('STALLED', fresh); }              // lock busy → report-only (a later poll persists)
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
// §11 delete ONLY this product's own continuation triggers — NEVER runAmazonSnapshotImports, NEVER the daily
// runDailyInventoryGapMaterialization / runDailyOrderPlanningGapMaterialization, NEVER any unrelated trigger.
function gapJobClearContinuationTriggers_(product) {
  var h = GAP_JOB_CONTINUATION_HANDLERS_[product]; if (!h) return;
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) { if (triggers[i].getHandlerFunction() === h) ScriptApp.deleteTrigger(triggers[i]); }
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
function handleStartInventoryReplenishmentGapJob_(body) { return gapJobStart_('INVENTORY', gapJobDefaultEnv_('INVENTORY')); }
function handleStartOrderPlanningGapJob_(body) { return gapJobStart_('ORDER_PLANNING', gapJobDefaultEnv_('ORDER_PLANNING')); }
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

// ---- LIVE8 §B4/§B5 — ScriptApp trigger-authorization BOOTSTRAP + VERIFICATION ------------------------------------
// The live START failure is CONTINUATION_SCHEDULE_FAILED / "ScriptApp.newTrigger authorization required": the project
// identity has not granted the ScriptApp trigger-management scope (script.scriptapp) that gapJobScheduleContinuation_
// needs. Running continueInventoryGapMaterializationJob does NOT force that grant (a manual editor run of the worker
// reads state and returns NO_STATE without ever calling ScriptApp.newTrigger). This bounded helper forces + proves
// the SAME authorization the START path needs, WITHOUT running any gap calculation and WITHOUT installing a permanent
// trigger: for EACH gap continuation handler it creates a one-off trigger then immediately DELETES it. Cleanup can
// only ever delete OUR OWN gap continuation handlers (gapJobIsOwnedContinuationHandler_) — NEVER runAmazonSnapshotImports
// or any unrelated trigger. Testable core (injectable io) + a thin top-level USER-run editor wrapper.
//   SUCCESS → { status:'TRIGGER_AUTHORIZATION_OK', created:true, cleanup:true, handlers:[...] }
//   FAILURE → { status:'TRIGGER_AUTHORIZATION_FAILED', handlers:[{handler, created, cleanup, error:<EXACT exception>}] }
function gapJobVerifyTriggerAuth_(handlers, io) {
  var results = [], allOk = true;
  for (var i = 0; i < (handlers || []).length; i++) {
    var h = handlers[i], created = false, cleanup = false, error = null;
    try {
      var t = io.createTrigger(h);                                   // the SAME ScriptApp.newTrigger auth the START path needs
      created = true;
      if (io.isOwned(h)) { io.deleteTrigger(t); cleanup = true; }    // §B6 delete ONLY an owned gap continuation trigger
    } catch (e) {
      allOk = false; error = (e && e.message) ? String(e.message) : String(e);   // §B5 surface the EXACT exception (never hidden)
    }
    results.push({ handler: h, created: created, cleanup: cleanup, error: error });
  }
  return allOk ? { status: 'TRIGGER_AUTHORIZATION_OK', created: true, cleanup: true, handlers: results }
               : { status: 'TRIGGER_AUTHORIZATION_FAILED', handlers: results };
}
// Top-level, USER-run from the Apps Script editor (NOT wired to any POST/trigger). Run ONCE as the project owner to
// grant the trigger scope; it verifies BOTH products (§B8). NEVER performs a gap calculation.
function verifyGapTriggerAuthorization() {
  var out = gapJobVerifyTriggerAuth_(
    [GAP_JOB_CONTINUATION_HANDLERS_.INVENTORY, GAP_JOB_CONTINUATION_HANDLERS_.ORDER_PLANNING],
    { createTrigger: function (h) { return ScriptApp.newTrigger(h).timeBased().after(60000).create(); },
      deleteTrigger: function (t) { return ScriptApp.deleteTrigger(t); },
      isOwned: function (h) { return gapJobIsOwnedContinuationHandler_(h); } });
  try { if (typeof Logger !== 'undefined' && Logger.log) Logger.log('[GapJob] ' + JSON.stringify(out)); } catch (_l) {}
  return out;
}

// ---- TIME-TRIGGER TARGETS (NO trailing underscore — Apps Script trigger handlers must be callable by name) ----
function continueInventoryGapMaterializationJob(e) { return gapJobContinue_('INVENTORY', gapJobDefaultEnv_('INVENTORY')); }
function continueOrderPlanningGapMaterializationJob(e) { return gapJobContinue_('ORDER_PLANNING', gapJobDefaultEnv_('ORDER_PLANNING')); }
