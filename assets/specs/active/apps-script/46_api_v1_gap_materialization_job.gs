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
// R4J-LIVE §A2 — the terminal set. A job NEVER stays PENDING/RUNNING after its worker irrecoverably fails.
function gapJobIsTerminal_(status) { return status === 'DONE' || status === 'FAILED' || status === 'BLOCKED' || status === 'ERROR'; }

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
    startedAt: nowStr, updatedAt: nowStr, startedAtMs: (nowMs || 0), updatedAtMs: (nowMs || 0), finishedAt: null, lastError: null, sliceAttempts: 0,
    lockWaits: 0, lastContinuationScheduledAt: null, lastWorkerStartedAt: null, lastWorkerFinishedAt: null, lastProcessedScope: null
  };
}
// R4J-LIVE2 §5/§7 — stamp the monotonic progress clock (epoch ms). Called wherever updatedAt advances so the STALLED
// reclaim in START can distinguish a live job (recently touched) from a killed worker (touched long ago, no re-arm).
function gapJobTouchMs_(env, state) { if (state && env && env.nowMs) state.updatedAtMs = env.nowMs(); }
function gapJobPublicState_(s) {
  return { runId: s.runId, product: s.product, status: s.status,
    scopesProcessed: s.scopesProcessed, scopesTotal: s.scopesTotal, rowsProcessed: s.rowsProcessed,
    readyCount: s.readyCount, blockedCount: s.blockedCount, errorCount: s.errorCount,
    calculationDate: s.calculationDate, calculationMonth: s.calculationMonth, planningCycle: s.planningCycle,
    startedAt: s.startedAt, updatedAt: s.updatedAt, finishedAt: s.finishedAt, lastError: s.lastError,
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
  state.scopesProcessed = state.scopeCursor; gapJobWriteState_(env, product, state); return state;
}
// R4J-LIVE §A2 — persist a TERMINAL FAILED state (never leave a job dangling PENDING/RUNNING). Always writes.
function gapJobMarkFailed_(env, product, state, reason) {
  state.status = 'FAILED'; state.lastError = String(reason == null ? (state.lastError || 'FAILED') : reason);
  state.finishedAt = env.timestamp(); state.updatedAt = state.finishedAt; state.lastWorkerFinishedAt = state.finishedAt;
  gapJobTouchMs_(env, state);
  gapJobWriteState_(env, product, state); return state;
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
    gapJobWriteState_(env, product, state);
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
    if (state.scopeCursor >= scopes.length) return gapJobMarkDone_(env, product, state);   // §9 DONE = reached every planned scope
    state.status = 'RUNNING';
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

// ---- STATUS (§8) — strictly READ ONLY: no write, no continuation, no calculation ----------------------------
function gapJobStatus_(product, runId, env) {
  product = gapJobNormalizeProduct_(product);
  if (!product) return gapBatchEnvelope_(false, null, 'INVALID_PRODUCT', 'product required (INVENTORY|ORDER_PLANNING)');
  var state = gapJobReadState_(env, product);
  if (!state) return gapBatchEnvelope_(true, { product: product, status: 'NONE', runId: runId || null });
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

// ---- TIME-TRIGGER TARGETS (NO trailing underscore — Apps Script trigger handlers must be callable by name) ----
function continueInventoryGapMaterializationJob(e) { return gapJobContinue_('INVENTORY', gapJobDefaultEnv_('INVENTORY')); }
function continueOrderPlanningGapMaterializationJob(e) { return gapJobContinue_('ORDER_PLANNING', gapJobDefaultEnv_('ORDER_PLANNING')); }
