// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 48_api_v1_request_order_draft_job.gs — F1-4B-FM6-R4E2-B2 Resumable Scope Request-Order Draft Generation Job
// NOTE: All .gs files share ONE global scope. Copy them together and REDEPLOY. Loads AFTER 24 (locked persister
//       plain-result core), 43 (gap read owners + gapBatchEnvelope_), 46 (Script-Property/lock adapters reused),
//       47 (eligible-SKU enumeration + per-SKU compact generator).
// ============================================================
//
// WHY: one scope-wide Order Planning AI Plan (company/country/marketplace) can span ~90+ eligible SKUs (measured
// US·Amazon ~93). A single Apps Script execution cannot be PROVEN to persist all of them within the ~360s budget
// (R4E2-B audit), and a browser N-request fan-out is forbidden. This module makes it ONE logical, REQUEST-DRIVEN
// resumable job: START (snapshot eligible SKUs) → CONTINUE (bounded slice, repeat) → DONE → getActive.
//
// HARD RULES (R4E2-B2): orchestration ONLY around the EXISTING canonical R4E2 per-SKU authority
// (recGenGenerateOneSkuCompact_ → 24_ rpoGenerateRecommendationDraftLockedResult_ → KMPW/KMPR). NO second persister,
// NO gap recalculation/formula, NO factory reallocation, NO cartonization, NO DB table (state = Script Properties
// ONLY), NO time trigger / scheduler / recursive HTTP (§19 — the CLIENT drives CONTINUE). recommended_qty stays
// VERBATIM from order_planning_gap; manual order_qty stays protected by the existing engine (never auto-confirmed).
//
// TESTABILITY: every side effect + domain read/write is reached through an injectable `env`. Production wiring is
// reqDraftJobDefaultEnv_() (reuses 46's Script-Property/lock/timestamp adapters + 47's domain helpers); Node tests
// inject fakes and drive the entire START→CONTINUE→DONE lifecycle deterministically.

var REQ_DRAFT_JOB_PROP_KEY_ = 'REQ_ORDER_DRAFT_JOB';        // ONE active request-order draft job at a time (§3)
var REQ_DRAFT_JOB_LOCK_MS_ = 10000;                          // bounded wait for the script lock
// §4 — SAFE per-VALUE budget for the job state persisted in one Script Property. Script Properties allow ~9216 bytes
// per value; target <= 75% (margin). A state above this is a TRUTHFUL terminal REQUEST_ORDER_DRAFT_JOB_STATE_LIMIT at
// START — a paged/multi-property job state is a separate authorized design, never a silent split.
var REQ_DRAFT_JOB_SAFE_BYTES_ = 6912;
var REQ_DRAFT_JOB_MAX_SKUS_PER_CONTINUE_ = 25;               // §7 conservative SKU cap per continuation
var REQ_DRAFT_JOB_WORKER_BUDGET_MS_ = 120000;                // §7 elapsed budget per continuation (well below ~360s)
var REQ_DRAFT_JOB_LEASE_MS_ = 180000;                        // §14 continuation lease (> worker budget → a live continue keeps it; a dead one is reclaimable)
var REQ_DRAFT_JOB_STALE_MS_ = 600000;                        // a non-terminal job untouched this long is reclaimable by a fresh START

// ---- pure helpers (testable) --------------------------------------------------------------------------------
function reqDraftJobIsTerminal_(status) { return status === 'DONE' || status === 'FAILED' || status === 'CANCELLED'; }
function reqDraftJobStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function reqDraftJobScopeKey_(scope) { return [reqDraftJobStr_(scope && scope.company), reqDraftJobStr_(scope && scope.country), reqDraftJobStr_(scope && scope.marketplace)].join('||'); }
// single-char per-SKU outcome codes keep `statuses` (parallel to skuList) tiny so the whole state stays < safe bytes.
function reqDraftJobCodeForStatus_(status) {
  return status === 'CREATED' ? 'C' : status === 'REUSED' ? 'U' : status === 'REGENERATED' ? 'R'
    : status === 'REGENERATE_NEEDS_CONFIRMATION' ? 'N' : status === 'BLOCKED_CONFLICT' ? 'B'
    : status === 'NOT_READY' ? 'G' : 'F';
}
function reqDraftJobFoldCount_(counts, status) {
  if (status === 'CREATED') counts.created++;
  else if (status === 'REUSED') counts.reused++;
  else if (status === 'REGENERATED') counts.regenerated++;
  else if (status === 'REGENERATE_NEEDS_CONFIRMATION') counts.needsConfirmation++;
  else if (status === 'BLOCKED_CONFLICT') counts.blockedConflict++;
  else if (status === 'NOT_READY') counts.notReady++;
  else counts.failed++;
}
function reqDraftJobNewState_(runId, scope, skuList, gapBinding, nowStr, nowMs, planningCycle, opts) {
  var statuses = []; for (var i = 0; i < skuList.length; i++) statuses.push('');
  return {
    runId: runId, scope: { company: scope.company, country: scope.country, marketplace: scope.marketplace },
    planningCycle: planningCycle || '', status: 'RUNNING',
    cursor: 0, total: skuList.length, skuList: skuList, statuses: statuses,
    gapBinding: { jobRunId: (gapBinding && gapBinding.jobRunId) || null, jobStatus: (gapBinding && gapBinding.jobStatus) || 'NONE' },
    counts: { created: 0, reused: 0, regenerated: 0, needsConfirmation: 0, blockedConflict: 0, notReady: 0, failed: 0 },
    startedAt: nowStr, updatedAt: nowStr, startedAtMs: nowMs || 0, updatedAtMs: nowMs || 0, finishedAt: null, cancelledAt: null, lastError: null,
    lease: null,
    mode: (opts && opts.mode) || 'MANUAL_REGENERATE', draft_purpose: (opts && opts.draft_purpose) || 'regular',
    confirmRegenerateOverUserEdits: !!(opts && opts.confirmRegenerateOverUserEdits === true), actor: (opts && opts.actor) || 'system'
  };
}
// §9 compact public state — counts + cursor + lifecycle only (NEVER the skuList/statuses payload).
function reqDraftJobPublicState_(s) {
  return { runId: s.runId, scope: s.scope, planningCycle: s.planningCycle, status: s.status,
    cursor: s.cursor, total: s.total, counts: s.counts,
    startedAt: s.startedAt, updatedAt: s.updatedAt, finishedAt: s.finishedAt, cancelledAt: s.cancelledAt, lastError: s.lastError,
    hasMore: (!reqDraftJobIsTerminal_(s.status) && s.cursor < s.total) };
}
// §6 — the START-bound gap generation must not silently change under a running job. Changed iff a different gap-job
// runId materialized, or the gap job is no longer terminal-complete (DONE/NONE).
function reqDraftJobBindingChanged_(snapshot, current) {
  var snapRun = reqDraftJobStr_(snapshot && snapshot.jobRunId);
  var curRun = reqDraftJobStr_(current && current.jobRunId);
  var curStatus = (reqDraftJobStr_(current && current.jobStatus).toUpperCase()) || 'NONE';
  if (curRun !== snapRun) return true;
  if (curStatus !== 'DONE' && curStatus !== 'NONE') return true;
  return false;
}

// ---- state IO + terminal marks (Script Properties via injectable env.props) ---------------------------------
function reqDraftJobReadState_(env) { var raw = env.props.get(REQ_DRAFT_JOB_PROP_KEY_); if (!raw) return null; try { return JSON.parse(raw); } catch (e) { return null; } }
function reqDraftJobWriteState_(env, state) { env.props.set(REQ_DRAFT_JOB_PROP_KEY_, JSON.stringify(state)); }
function reqDraftJobMarkDone_(env, state) {
  state.status = 'DONE'; state.finishedAt = env.timestamp(); state.updatedAt = state.finishedAt;
  state.updatedAtMs = env.nowMs ? env.nowMs() : state.updatedAtMs; state.lease = null;
  reqDraftJobWriteState_(env, state); return state;
}
function reqDraftJobMarkFailed_(env, state, reason) {
  state.status = 'FAILED'; state.lastError = String(reason == null ? (state.lastError || 'FAILED') : reason);
  state.finishedAt = env.timestamp(); state.updatedAt = state.finishedAt; state.updatedAtMs = env.nowMs ? env.nowMs() : state.updatedAtMs; state.lease = null;
  reqDraftJobWriteState_(env, state); return state;
}
function reqDraftJobMarkCancelled_(env, state) {
  state.status = 'CANCELLED'; state.finishedAt = env.timestamp(); state.cancelledAt = state.finishedAt;
  state.updatedAt = state.finishedAt; state.updatedAtMs = env.nowMs ? env.nowMs() : state.updatedAtMs; state.lease = null;
  reqDraftJobWriteState_(env, state); return state;
}
// momentary-lock wrapper (§13/§14) — the ONLY place the job holds the script lock; NEVER held across a per-SKU
// persist (that path acquires the SAME script lock, so nesting is impossible — claim → release → persist → commit).
function reqDraftJobWithLock_(env, fn) {
  var lock = env.lock, locked = false;
  try { locked = lock ? lock.acquire(REQ_DRAFT_JOB_LOCK_MS_) : true; } catch (e) { locked = false; }
  if (lock && !locked) return { lockFailed: true };
  try { return fn(); } finally { if (lock && locked) { try { lock.release(); } catch (_r) {} } }
}

// ---- START (§3/§4/§5/§13): quick, browser-returning; snapshots eligible SKUs + gap binding; NO SKU processing ----
function reqDraftJobStart_(env, scope, opts) {
  scope = scope || {};
  var company = reqDraftJobStr_(scope.company), country = reqDraftJobStr_(scope.country), marketplace = reqDraftJobStr_(scope.marketplace);
  if (!company || !country || !marketplace) return env.envelope(false, null, 'INVALID_SCOPE', 'company + country + marketplace required');
  var scope3 = { company: company, country: country, marketplace: marketplace };
  var res = reqDraftJobWithLock_(env, function () {
    var existing = reqDraftJobReadState_(env);
    if (existing && !reqDraftJobIsTerminal_(existing.status)) {
      var stampMs = existing.updatedAtMs || existing.startedAtMs || 0;
      var ageMs = (env.nowMs ? env.nowMs() : 0) - stampMs;
      if (!stampMs || ageMs <= REQ_DRAFT_JOB_STALE_MS_) {   // §3 one active job — join same scope, else truthful BUSY
        var sameScope = reqDraftJobScopeKey_(existing.scope) === reqDraftJobScopeKey_(scope3);
        return { envelope: env.envelope(true, { runId: existing.runId, status: existing.status, scope: existing.scope, cursor: existing.cursor, total: existing.total, alreadyRunning: true, sameScope: sameScope, busy: !sameScope }) };
      }
      // stale non-terminal (killed continuation, no client re-drive) → reclaim on this user-initiated START
    }
    // §6 gap readiness gate — the gap-materialization job must be terminal-DONE (or absent); bind to its runId
    var binding = env.readGapBinding() || { jobRunId: null, jobStatus: 'NONE' };
    var bindStatus = (reqDraftJobStr_(binding.jobStatus).toUpperCase()) || 'NONE';
    if (bindStatus !== 'DONE' && bindStatus !== 'NONE') return { envelope: env.envelope(false, null, 'ORDER_PLANNING_GAP_NOT_READY', 'gap materialization job is ' + bindStatus) };
    var enumRes = env.enumerateEligible(scope3) || {};
    var skuList = enumRes.skuList || [];
    if (!skuList.length) return { envelope: env.envelope(false, null, 'REQUEST_ORDER_DRAFT_EMPTY_SCOPE', 'no eligible READY gap SKUs in the requested scope') };
    var runId = env.newRunId(scope3);
    var nowStr = env.timestamp(), nowMs = env.nowMs ? env.nowMs() : 0;
    var state = reqDraftJobNewState_(runId, scope3, skuList, binding, nowStr, nowMs, enumRes.planningCycle || (opts && opts.planningCycle) || '', opts);
    // §4 STATE SIZE GATE — statuses are single chars and skuList is fixed, so a state that fits now never grows past
    // the threshold during the run. A scope too large to represent in one property fails closed here (never split silently).
    var bytes = JSON.stringify(state).length;
    if (bytes > REQ_DRAFT_JOB_SAFE_BYTES_) {
      return { envelope: env.envelope(false, null, 'REQUEST_ORDER_DRAFT_JOB_STATE_LIMIT', 'job state ' + bytes + ' bytes > safe ' + REQ_DRAFT_JOB_SAFE_BYTES_ + ' (' + skuList.length + ' SKUs); a paged/multi-property job state is a separate authorized design') };
    }
    reqDraftJobWriteState_(env, state);
    return { envelope: env.envelope(true, { runId: runId, status: 'RUNNING', scope: scope3, total: state.total, cursor: 0, stateBytes: bytes }) };
  });
  if (res.lockFailed) return env.envelope(false, null, 'REQ_ORDER_DRAFT_JOB_LOCK_UNAVAILABLE', 'another draft job operation is in progress');
  return res.envelope;
}

// ---- CONTINUE (§7/§8/§13/§14) — claim a lease under a momentary lock, RELEASE it, then process a bounded slice of
// SKUs through the canonical per-SKU persister, checkpointing the cursor after EACH SKU under a momentary lock (a
// mid-run death loses at most the in-flight SKU; the idempotent persister makes a re-run a no-duplicate REUSE). ----
function reqDraftJobContinue_(env, requestedRunId) {
  var token = env.token ? env.token() : ('tok-' + (env.nowMs ? env.nowMs() : 0));
  var claim = reqDraftJobWithLock_(env, function () {
    var state = reqDraftJobReadState_(env);
    if (!state) return { envelope: env.envelope(true, { status: 'NONE', runId: requestedRunId || null }) };
    if (requestedRunId && state.runId !== requestedRunId) return { envelope: env.envelope(true, { status: 'NONE', runId: requestedRunId, current: reqDraftJobPublicState_(state) }) };
    if (reqDraftJobIsTerminal_(state.status)) return { envelope: env.envelope(true, reqDraftJobPublicState_(state)) };
    var nowMs = env.nowMs ? env.nowMs() : 0;
    if (state.lease && state.lease.owner !== token && (state.lease.expiresAtMs || 0) > nowMs) {   // §14 another continuation owns it
      var busy = reqDraftJobPublicState_(state); busy.busy = true; return { envelope: env.envelope(true, busy) };
    }
    var curBinding = env.readGapBinding() || { jobRunId: null, jobStatus: 'NONE' };               // §6 gap generation must be unchanged
    if (reqDraftJobBindingChanged_(state.gapBinding, curBinding)) {
      reqDraftJobMarkFailed_(env, state, 'GAP_GENERATION_CHANGED');
      return { envelope: env.envelope(true, reqDraftJobPublicState_(state)) };
    }
    state.lease = { owner: token, expiresAtMs: nowMs + REQ_DRAFT_JOB_LEASE_MS_ };
    state.status = 'RUNNING'; state.updatedAt = env.timestamp(); state.updatedAtMs = nowMs;
    reqDraftJobWriteState_(env, state);
    return { state: state };
  });
  if (claim.lockFailed) return env.envelope(false, null, 'REQ_ORDER_DRAFT_JOB_LOCK_UNAVAILABLE', 'another draft job operation is in progress');
  if (claim.envelope) return claim.envelope;
  var state = claim.state, scope = state.scope;
  var gapRowsMap = env.readGapRowsMap(scope) || {};   // §17 read gap rows + UPC ONCE per continuation
  var upcMap = env.readUpcMap(scope) || {};
  var processedThisRun = 0, startMs = env.nowMs ? env.nowMs() : 0;
  var budgetMs = (typeof env.workerBudgetMs === 'number') ? env.workerBudgetMs : REQ_DRAFT_JOB_WORKER_BUDGET_MS_;
  var maxSkus = (typeof env.maxSkusPerContinue === 'number') ? env.maxSkusPerContinue : REQ_DRAFT_JOB_MAX_SKUS_PER_CONTINUE_;
  while (true) {
    if (processedThisRun >= maxSkus) break;                                                    // §7 SKU cap
    if (env.nowMs && (env.nowMs() - startMs) >= budgetMs) break;                               // §7 time budget
    var head = reqDraftJobWithLock_(env, function () {
      var s = reqDraftJobReadState_(env);
      if (!s || s.runId !== state.runId || reqDraftJobIsTerminal_(s.status)) return { stop: true };
      if (!s.lease || s.lease.owner !== token) return { stop: true };                          // lease lost/stolen → stop
      if (s.cursor >= s.total) return { done: true };
      return { index: s.cursor, sku: s.skuList[s.cursor] };
    });
    if (head.lockFailed || head.stop || head.done) break;
    var idx = head.index, sku = head.sku;
    var gapRow = Object.prototype.hasOwnProperty.call(gapRowsMap, sku) ? gapRowsMap[sku] : null;
    var upc = upcMap[sku];
    var outcome;
    try {
      outcome = env.generateOneSku(scope, sku, gapRow, upc, {
        mode: state.mode, planningCycle: state.planningCycle, draft_purpose: state.draft_purpose,
        confirmRegenerateOverUserEdits: state.confirmRegenerateOverUserEdits, actor: state.actor,
        skipSchemaValidation: processedThisRun > 0   // §21 validate the authorized schemas ONCE per continuation
      }) || { sku: sku, status: 'FAILED', code: 'NO_RESULT' };
    } catch (ge) { outcome = { sku: sku, status: 'FAILED', code: (ge && ge.message) ? String(ge.message) : String(ge) }; }
    var commit = reqDraftJobWithLock_(env, function () {
      var s = reqDraftJobReadState_(env);
      if (!s || s.runId !== state.runId || reqDraftJobIsTerminal_(s.status)) return { stop: true };   // §12 CANCEL landed → stop, don't advance
      if (!s.lease || s.lease.owner !== token) return { stop: true };
      if (s.cursor !== idx) return { skip: true };                                              // durable cursor already past → idempotent no-op
      s.statuses[idx] = reqDraftJobCodeForStatus_(outcome.status);
      reqDraftJobFoldCount_(s.counts, outcome.status);
      s.cursor = idx + 1;
      var nm = env.nowMs ? env.nowMs() : 0;
      s.lease = { owner: token, expiresAtMs: nm + REQ_DRAFT_JOB_LEASE_MS_ };                    // renew lease each SKU
      s.updatedAt = env.timestamp(); s.updatedAtMs = nm;
      if (s.cursor >= s.total) { return { state: reqDraftJobMarkDone_(env, s) }; }
      reqDraftJobWriteState_(env, s); return { state: s };
    });
    if (commit.lockFailed || commit.stop) break;
    processedThisRun++;
    if (commit.state && reqDraftJobIsTerminal_(commit.state.status)) break;                     // DONE
  }
  var fin = reqDraftJobWithLock_(env, function () {
    var s = reqDraftJobReadState_(env);
    if (!s) return { state: null };
    if (s.runId === state.runId && !reqDraftJobIsTerminal_(s.status) && s.lease && s.lease.owner === token) {
      s.lease = null; s.updatedAt = env.timestamp(); s.updatedAtMs = env.nowMs ? env.nowMs() : s.updatedAtMs;   // release lease for the next continuation
      reqDraftJobWriteState_(env, s);
    }
    return { state: s };
  });
  var finalState = (fin && fin.state) || state;
  var pub = reqDraftJobPublicState_(finalState);
  pub.processedThisRun = processedThisRun;
  return env.envelope(true, pub);
}

// ---- STATUS (§10) — pure read (a stale job is reclaimed by the next START; no trigger/self-heal here) -----------
function reqDraftJobStatus_(env, requestedRunId) {
  var state = reqDraftJobReadState_(env);
  if (!state) return env.envelope(true, { status: 'NONE', runId: requestedRunId || null });
  if (requestedRunId && state.runId !== requestedRunId) return env.envelope(true, { status: 'NONE', runId: requestedRunId, current: reqDraftJobPublicState_(state) });
  return env.envelope(true, reqDraftJobPublicState_(state));
}

// ---- CANCEL (§16) — terminal CANCELLED; already-created drafts are PRESERVED (no rollback) ---------------------
function reqDraftJobCancel_(env, requestedRunId) {
  var res = reqDraftJobWithLock_(env, function () {
    var state = reqDraftJobReadState_(env);
    if (!state) return { envelope: env.envelope(true, { status: 'NONE', runId: requestedRunId || null, cancelled: false }) };
    if (requestedRunId && state.runId !== requestedRunId) return { envelope: env.envelope(true, { status: state.status, runId: state.runId, cancelled: false, note: 'RUNID_MISMATCH' }) };
    if (reqDraftJobIsTerminal_(state.status)) return { envelope: env.envelope(true, reqDraftJobPublicState_(state)) };   // idempotent
    reqDraftJobMarkCancelled_(env, state);
    return { envelope: env.envelope(true, reqDraftJobPublicState_(state)) };
  });
  if (res.lockFailed) return env.envelope(false, null, 'REQ_ORDER_DRAFT_JOB_LOCK_UNAVAILABLE', 'another draft job operation is in progress');
  return res.envelope;
}

// ---- PRODUCTION env (Apps Script globals; not exercised by Node tests) ----------------------------------------
// Reuses 46's Script-Property + lock + timestamp adapters (same global scope) and 47's domain helpers. The lock is
// the SAME LockService.getScriptLock() the per-SKU persister uses — safe because the job RELEASES it before every
// per-SKU persist (claim → release → persist → commit), so the two never nest.
function reqDraftJobDefaultEnv_() {
  return {
    props: gapJobScriptProps_(),
    lock: gapJobScriptLock_(),
    timestamp: function () { return gapJobTimestamp_(); },
    nowMs: function () { try { return new Date().getTime(); } catch (e) { return 0; } },
    token: function () { try { return Utilities.getUuid(); } catch (e) { return 'tok-' + new Date().getTime(); } },
    newRunId: function (scope) { return 'ROD-' + reqDraftJobScopeKey_(scope).replace(/[^A-Za-z0-9]+/g, '-') + '-' + (function () { try { return new Date().getTime(); } catch (e) { return 0; } })(); },
    envelope: function (ok, data, token, message) { return gapBatchEnvelope_(ok, data, token, message); },
    readGapBinding: function () { var st = recGenReadGapJobState_('ORDER_PLANNING'); return { jobRunId: (st && st.runId) || null, jobStatus: (st && st.status) || 'NONE' }; },
    enumerateEligible: function (scope) {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var eligible = recGenEnumerateEligibleGapRows_(gapReadObjects_(ss, OP_GAP_TABLE_), scope);
      return { skuList: eligible.map(function (e) { return e.sku; }), planningCycle: eligible.length ? r4e2Str_(eligible[0].row.calculation_month) : '' };
    },
    readGapRowsMap: function (scope) {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var eligible = recGenEnumerateEligibleGapRows_(gapReadObjects_(ss, OP_GAP_TABLE_), scope);
      var map = {}; for (var i = 0; i < eligible.length; i++) map[eligible[i].sku] = eligible[i].row; return map;
    },
    readUpcMap: function (scope) { return recGenUpcBySku_(SpreadsheetApp.getActiveSpreadsheet()); },
    generateOneSku: function (scope, sku, gapRow, upc, opts) {
      return recGenGenerateOneSkuCompact_({ company: scope.company, country: scope.country, marketplace: scope.marketplace, sku: sku }, gapRow, upc, opts);
    }
  };
}

// ---- PUBLIC router handlers (START/CONTINUE = write; STATUS = read; CANCEL = terminal) -------------------------
function handleStartRequestOrderDraftJob_(body) {
  var p = (body && body.payload) || body || {};
  var scope = p.scope || { company: p.company, country: p.country, marketplace: p.marketplace };
  return reqDraftJobStart_(reqDraftJobDefaultEnv_(), scope, {
    mode: p.mode, planningCycle: p.planningCycle, draft_purpose: p.draft_purpose,
    confirmRegenerateOverUserEdits: p.confirmRegenerateOverUserEdits === true, actor: p.actor || p.updated_by
  });
}
function handleContinueRequestOrderDraftJob_(body) { var p = (body && body.payload) || body || {}; return reqDraftJobContinue_(reqDraftJobDefaultEnv_(), p.runId || null); }
function handleGetRequestOrderDraftJobStatus_(body) { var p = (body && body.payload) || body || {}; return reqDraftJobStatus_(reqDraftJobDefaultEnv_(), p.runId || null); }
function handleCancelRequestOrderDraftJob_(body) { var p = (body && body.payload) || body || {}; return reqDraftJobCancel_(reqDraftJobDefaultEnv_(), p.runId || null); }
