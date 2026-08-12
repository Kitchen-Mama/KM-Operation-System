// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 49_api_v1_weekly_recommendation_job.gs — F1-6B-PHASE1-E2E-PRE-CLOSURE-R1 Part A
//   Scheduled Recommendation → ACTIONABLE persisted AI Plan draft (backend-driven, browserless).
//   F1-6B-AUTOMATION-RECOMMENDATION-CLOSURE-R1: this is the ORDER_PLANNING scheduled-persistence run. It is now owned
//   by the MONTHLY Order Recommendation automation (47_ runMonthlyOrderRecommendation → weeklyRecoStart_); the internal
//   `weeklyReco*` names are historical (the F1-6A "weekly" origin) but functionally correct — it drives the 48_ job.
// NOTE: All .gs files share ONE global scope. Copy them together and REDEPLOY. Loads AFTER 43 (gapBatchEnvelope_ /
//       OP_GAP_TABLE_ / gapReadObjects_ / gapCalcResolveContext_), 46 (SAFE trigger primitives — reused verbatim),
//       47 (gap-DONE gate + eligible-SKU enumeration), 48 (the canonical resumable per-scope draft-persistence job).
// ============================================================
//
// WHY THIS EXISTS (audit-first divergence — see F1_6B doc §A):
//   MANUAL AI Plan  : request-order page → 48_ reqDraftJobStart_ → CLIENT polls reqDraftJobContinue_ (§19 client-driven)
//                     → recGenGenerateOneSkuCompact_ (47_) → 24_ rpoGenerateRecommendationDraftLockedResult_ (KMPW/KMPR)
//                     → PERSISTED request_order_allocation_drafts / _lines (the actionable AI Plan draft).
//   SCHEDULED (old) : 45_ weekly trigger → 47_ runWeeklyRecommendation → runRecommendationGeneration → KMREC.generateBatch
//                     → a NON-PERSISTENT in-memory summary. It STOPPED at compute and never entered the 48_ job.
//   The ONLY missing piece was a BROWSERLESS DRIVER for the EXISTING 48_ job. This module is that driver.
//
// WHAT IT IS — orchestration/lifecycle ONLY. It authors NO recommendation / gap / forecast / allocation / quantity
// math, owns NO formula, writes NO draft row itself, and creates NO second persister / second engine / second table.
// It converges the scheduled path onto the SAME canonical authority the manual AI Plan uses:
//   weekly trigger → weeklyRecoStart_ (enumerate ORDER_PLANNING scopes with READY gap rows; snapshot a queue) →
//   self-arming one-off continuation triggers → each fire drives the EXISTING 48_ job ONE step (START or one CONTINUE
//   slice) for the current scope, with mode 'SCHEDULED_REFRESH' → PERSISTED request_order_allocation_drafts, visible
//   verbatim to the existing AI Plan / Request Order read-back (requestOrderDraft.getActive).
//
// REUSE, NOT REINVENT (STEP A2/A3):
//   • Persistence authority  = 48_ reqDraftJobStart_ / reqDraftJobContinue_ → 24_ locked persister (UNCHANGED).
//   • Continuation mechanism = the SAME live-hardened Apps Script trigger primitives 46_ owns
//     (ScriptApp.newTrigger(h).timeBased().after(ms) + gapJobDeleteTriggersByHandler_ safe re-read/delete-by-handler).
//   • Job state              = Script Properties ONLY (KM_WEEKLY_RECO_RUN) — the SAME canonical owner 46_/48_ use.
//     NO new DB table, NO new schema, NO business fact stored here (all facts stay in the gap tables + the drafts).
//   • Provenance             = mode 'SCHEDULED_REFRESH' → the EXISTING generation_type 'scheduled' (bundle
//     MODE_TO_GENERATION_TYPE); NO new status/value invented (STEP A5). recommended_qty stays VERBATIM from the gap.
//
// IDEMPOTENCY / COLLISION (STEP A4) — all reused, none weakened:
//   • ONE weekly run at a time (single KM_WEEKLY_RECO_RUN property; a fresh non-terminal run is JOINED, never a 2nd).
//   • 48_ is single-active + lease-protected: a duplicate weekly fire, an overlapping continuation, a manual AI Plan
//     colliding, a timeout+retry, or a re-run of the same planning_cycle can never create a SECOND active draft — the
//     per-SKU persister returns REUSE / BLOCKED_CONFLICT and PROTECTS a user-edited order_qty (preserveUserQty).
//   • A foreign (manual) 48_ job blocking a scope is DEFERRED (bounded), never fought — the user keeps their draft.
//
// INVENTORY: there is NO resumable, backend-drivable persistence job for INVENTORY (WEEKLY_SHIPPING) — 48_ is
// ORDER_PLANNING-only and the inventory workspace (42_) is a READ-ONLY, browser-driven surface. Persisting inventory
// here would require a SECOND engine (prohibited). So the scheduler converges ORDER_PLANNING (the Request Order
// workflow the spec names) and INVENTORY remains the existing non-persistent summary (47_ runRecommendationGeneration).
//
// TESTABILITY: every side effect (Script Properties, LockService, one-off trigger scheduling, clock, scope
// enumeration, and the 48_ job calls) is reached through an injectable `env`. Production wiring is
// weeklyRecoDefaultEnv_(); Node tests inject fakes (and the REAL 48_ job) to drive the whole lifecycle deterministically.

var WEEKLY_RECO_PROP_KEY_ = 'KM_WEEKLY_RECO_RUN';                          // ONE weekly persistence run at a time (§3)
var WEEKLY_RECO_CONTINUATION_HANDLER_ = 'continueWeeklyRecommendationJob'; // the one-off self-arming worker (distinct from the recurring 45_ weekly trigger runWeeklyRecommendation)
var WEEKLY_RECO_PRODUCT_ = 'ORDER_PLANNING';                              // the ONLY product with a resumable backend-drivable persistence authority (48_)
var WEEKLY_RECO_MODE_ = 'SCHEDULED_REFRESH';                              // existing canonical mode → generation_type 'scheduled' (STEP A5); preserves user order_qty
var WEEKLY_RECO_ACTOR_ = 'weekly-recommendation-scheduler';               // provenance actor (existing metadata field, not a new status)
var WEEKLY_RECO_TZ_ = 'Asia/Taipei';                                      // mirrors the 45_ scheduler / gap job timezone
var WEEKLY_RECO_LOCK_MS_ = 10000;                                         // bounded wait for the script lock (momentary — never held across a 48_ call)
var WEEKLY_RECO_PROMPT_DELAY_MS_ = 1000;                                  // prompt next-step continuation (Apps Script schedules ~soon after)
var WEEKLY_RECO_RECOVERY_DELAY_MS_ = 420000;                             // >6-min recovery backstop armed BEFORE each step (survives a kill; never fires during a healthy short step)
var WEEKLY_RECO_LEASE_MS_ = 180000;                                      // worker lease (a live step keeps it; a dead one is reclaimable by the next fire)
var WEEKLY_RECO_STALE_MS_ = 600000;                                      // a non-terminal run untouched this long is reclaimable by a fresh weekly START
var WEEKLY_RECO_MAX_DEFERRALS_ = 3;                                      // per-scope: a foreign (manual) 48_ job blocking a scope is retried this many times, then the scope is left to the manual flow
var WEEKLY_RECO_MAX_SCOPE_ATTEMPTS_ = 6;                                 // bounded no-progress guard per cursor (a scope that never advances → recorded failed, never an endless chain)

// __WEEKLYRECO_PURE_START__
// Pure helpers (eval'd verbatim by the test harness). NO Drive / Script Properties / LockService / clock / trigger.
function weeklyRecoStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function weeklyRecoIsTerminal_(status) { return status === 'DONE' || status === 'FAILED' || status === 'CANCELLED' || status === 'STALLED'; }
function weeklyRecoScopeKey_(scope) { return [weeklyRecoStr_(scope && scope.company), weeklyRecoStr_(scope && scope.country), weeklyRecoStr_(scope && scope.marketplace)].join('||'); }

// PURE — distinct, deterministically-ordered ORDER_PLANNING scopes from stored gap rows. A scope is eligible iff it
// has at least one READY row (the exact eligibility signal recGenEnumerateEligibleGapRows_ uses; here at the
// scope grain). Ordered company-first then country then marketplace (stable) so the queue is reproducible across a
// duplicate/retry fire (STEP A4 deterministic). NO calculation, NO DB — operates on already-read rows.
function weeklyRecoDistinctScopes_(gapRows) {
  var seen = {}, out = [];
  for (var i = 0; i < (gapRows || []).length; i++) {
    var r = gapRows[i] || {};
    if (weeklyRecoStr_(r.calculation_status).toUpperCase() !== 'READY') continue;
    var company = weeklyRecoStr_(r.company), country = weeklyRecoStr_(r.country), marketplace = weeklyRecoStr_(r.marketplace);
    if (!company || !country || !marketplace) continue;
    var key = company + '||' + country + '||' + marketplace;
    if (seen[key]) continue;
    seen[key] = 1; out.push({ company: company, country: country, marketplace: marketplace });
  }
  out.sort(function (a, b) {
    if (a.company !== b.company) return a.company < b.company ? -1 : 1;
    if (a.country !== b.country) return a.country < b.country ? -1 : 1;
    return a.marketplace < b.marketplace ? -1 : (a.marketplace > b.marketplace ? 1 : 0);
  });
  return out;
}

function weeklyRecoNewState_(runId, planningCycle, scopes, nowStr, nowMs) {
  return {
    runId: runId, product: WEEKLY_RECO_PRODUCT_, planningCycle: planningCycle || '', status: 'PENDING',
    scopeQueue: scopes, scopeCursor: 0, scopesTotal: scopes.length, currentScopeRunId: null,
    counts: { scopesDone: 0, scopesDeferred: 0, scopesFailed: 0, created: 0, reused: 0, regenerated: 0, needsConfirmation: 0, blockedConflict: 0, notReady: 0, failed: 0 },
    deferrals: {}, lease: null,
    startedAt: nowStr, updatedAt: nowStr, startedAtMs: (nowMs || 0), updatedAtMs: (nowMs || 0),
    finishedAt: null, cancelledAt: null, lastError: null,
    lastContinuationScheduledAt: null, lastWorkerStartedAt: null, lastWorkerFinishedAt: null, lastProcessedScope: null,
    stuckCursor: null, stuckCount: 0
  };
}
// §9 compact public state — counts + cursor + lifecycle only (NEVER the scopeQueue payload, NEVER a per-SKU payload).
function weeklyRecoPublicState_(s) {
  return { runId: s.runId, product: s.product, planningCycle: s.planningCycle, status: s.status,
    scopeCursor: s.scopeCursor, scopesTotal: s.scopesTotal, counts: s.counts,
    startedAt: s.startedAt, updatedAt: s.updatedAt, finishedAt: s.finishedAt, cancelledAt: s.cancelledAt, lastError: s.lastError,
    lastContinuationScheduledAt: s.lastContinuationScheduledAt, lastWorkerStartedAt: s.lastWorkerStartedAt,
    lastWorkerFinishedAt: s.lastWorkerFinishedAt, lastProcessedScope: s.lastProcessedScope,
    hasMore: (!weeklyRecoIsTerminal_(s.status) && s.scopeCursor < s.scopesTotal) };
}
function weeklyRecoStaleNonterminal_(state, nowMs) {
  if (!state || weeklyRecoIsTerminal_(state.status)) return false;
  if (state.updatedAtMs == null && state.startedAtMs == null) return true;                 // legacy leftover (no lifecycle stamp)
  var stampMs = state.updatedAtMs || state.startedAtMs || 0;
  return !!(stampMs && ((nowMs || 0) - stampMs) > WEEKLY_RECO_STALE_MS_);
}
// PURE — fold a 48_ public counts object (created/reused/regenerated/needsConfirmation/blockedConflict/notReady/failed)
// into the weekly run's aggregate counts. The scheduler NEVER recomputes these — it sums what the 48_ job reported.
function weeklyRecoFold48Counts_(counts, c48) {
  var c = c48 || {};
  counts.created += (c.created || 0);
  counts.reused += (c.reused || 0);
  counts.regenerated += (c.regenerated || 0);
  counts.needsConfirmation += (c.needsConfirmation || 0);
  counts.blockedConflict += (c.blockedConflict || 0);
  counts.notReady += (c.notReady || 0);
  counts.failed += (c.failed || 0);
  return counts;
}
// PURE — classify a 48_ START envelope into the driver's decision. STARTED = a fresh scoped job (adopt its runId);
// ADOPT = the same-scope job is already running (join it); BUSY = a FOREIGN (manual) job holds 48_ (defer); EMPTY =
// no eligible READY-gap SKUs for the scope; NOT_READY = gap not DONE; FAIL = any other truthful failure.
function weeklyRecoInterpretStart_(res) {
  if (!res || res.success !== true) {
    var code = (res && res.errors && res.errors[0] && res.errors[0].code) || (res && res.error) || 'START_FAILED';
    if (code === 'REQUEST_ORDER_DRAFT_EMPTY_SCOPE') return { kind: 'EMPTY', code: code };
    if (code === 'ORDER_PLANNING_GAP_NOT_READY') return { kind: 'NOT_READY', code: code };
    return { kind: 'FAIL', code: String(code) };
  }
  var d = res.data || {};
  if (d.alreadyRunning === true) {
    if (d.busy === true || d.sameScope === false) return { kind: 'BUSY', runId: d.runId || null };  // a foreign scope owns the single 48_ slot
    return { kind: 'ADOPT', runId: d.runId || null };                                                // our own/ same-scope job resumes
  }
  return { kind: 'STARTED', runId: d.runId || null };
}
// PURE — classify a 48_ CONTINUE envelope. DONE = the scope's draft persistence finished (fold counts, advance);
// PROGRESS = a slice advanced, more remain (re-arm, same scope); BUSY = another owner holds the 48_ lease (retry);
// GONE = the run vanished / a different run took over (advance defensively); FAIL = the 48_ job went terminal-FAILED.
function weeklyRecoInterpretContinue_(res) {
  if (!res || res.success !== true) return { kind: 'FAIL', code: (res && res.errors && res.errors[0] && res.errors[0].code) || 'CONTINUE_FAILED' };
  var d = res.data || {};
  if (d.busy === true) return { kind: 'BUSY' };
  if (d.status === 'NONE') return { kind: 'GONE' };
  if (d.status === 'FAILED' || d.status === 'CANCELLED') return { kind: 'FAIL', code: d.lastError || d.status, counts: d.counts };
  if (d.status === 'DONE' || d.hasMore === false) return { kind: 'DONE', counts: d.counts };
  return { kind: 'PROGRESS', counts: d.counts };
}
// __WEEKLYRECO_PURE_END__

// ---- state IO + terminal marks (Script Properties via injectable env.props) ----------------------------------
function weeklyRecoTouchMs_(env, state) { if (state && env && env.nowMs) state.updatedAtMs = env.nowMs(); }
function weeklyRecoReadState_(env) { var raw = env.props.get(WEEKLY_RECO_PROP_KEY_); if (!raw) return null; try { return JSON.parse(raw); } catch (e) { return null; } }
function weeklyRecoWriteState_(env, state) { env.props.set(WEEKLY_RECO_PROP_KEY_, JSON.stringify(state)); }
function weeklyRecoLog_(tag, state) {
  try { if (typeof Logger !== 'undefined' && Logger.log) Logger.log('[WeeklyReco] ' + tag + (state ? ' run=' + state.runId + ' ' + (state.scopeCursor != null ? state.scopeCursor : '?') + '/' + (state.scopesTotal != null ? state.scopesTotal : '?') + ' ' + state.status : '')); } catch (e) {}
}
function weeklyRecoMarkDone_(env, state) {
  state.status = 'DONE'; state.finishedAt = env.timestamp(); state.updatedAt = state.finishedAt; state.lastWorkerFinishedAt = state.finishedAt;
  state.lease = null; weeklyRecoTouchMs_(env, state); weeklyRecoWriteState_(env, state); weeklyRecoLog_('DONE', state); return state;
}
function weeklyRecoMarkFailed_(env, state, reason) {
  state.status = 'FAILED'; state.lastError = String(reason == null ? (state.lastError || 'FAILED') : reason);
  state.finishedAt = env.timestamp(); state.updatedAt = state.finishedAt; state.lastWorkerFinishedAt = state.finishedAt;
  state.lease = null; weeklyRecoTouchMs_(env, state); weeklyRecoWriteState_(env, state); weeklyRecoLog_('FAILED', state); return state;
}
function weeklyRecoMarkCancelled_(env, state) {
  state.status = 'CANCELLED'; state.finishedAt = env.timestamp(); state.updatedAt = state.finishedAt; state.cancelledAt = state.finishedAt;
  state.lease = null; weeklyRecoTouchMs_(env, state); weeklyRecoWriteState_(env, state); weeklyRecoLog_('CANCELLED', state); return state;
}
// momentary-lock wrapper — the ONLY place the run holds the script lock; NEVER held across a 48_ START/CONTINUE call
// (48_ acquires the SAME script lock per SKU, so nesting would deadlock — claim → release → drive 48_ → re-lock → commit).
function weeklyRecoWithLock_(env, fn) {
  var lock = env.lock, locked = false;
  try { locked = lock ? lock.acquire(WEEKLY_RECO_LOCK_MS_) : true; } catch (e) { locked = false; }
  if (lock && !locked) return { lockFailed: true };
  try { return fn(); } finally { if (lock && locked) { try { lock.release(); } catch (_r) {} } }
}

// ---- START (§3) — the weekly trigger entry. Quick + fail-closed. Enumerates the eligible ORDER_PLANNING scope queue
// and arms the FIRST continuation; NO scope is driven in the request (the worker chain does that). Joins a fresh
// non-terminal run (never a 2nd); reclaims a stale one. Skips truthfully when the gap isn't DONE or no scope is eligible.
function weeklyRecoStart_(env) {
  var res = weeklyRecoWithLock_(env, function () {
    var existing = weeklyRecoReadState_(env);
    if (existing && !weeklyRecoIsTerminal_(existing.status)) {
      var stampMs = existing.updatedAtMs || existing.startedAtMs || 0;
      var ageMs = (env.nowMs ? env.nowMs() : 0) - stampMs;
      if (!stampMs || ageMs <= WEEKLY_RECO_STALE_MS_) {                                      // §3 a live run is JOINED, never duplicated
        return { envelope: env.envelope(true, { runId: existing.runId, status: existing.status, scopesTotal: existing.scopesTotal, scopeCursor: existing.scopeCursor, alreadyRunning: true }) };
      }
      try { env.clearContinuation(); } catch (_ec) {}                                        // stale non-terminal → reclaim
      weeklyRecoMarkFailed_(env, existing, 'RECLAIMED_STALLED after ' + ageMs + 'ms (killed worker / no re-arm)');
    }
    // gap-DONE gate — never consume a partially-refreshed order_planning_gap (parity with 47_/48_). Not ready ⇒ skip.
    var gap = env.gapReady ? env.gapReady() : { ready: true, status: 'NONE' };
    if (!gap.ready) return { envelope: env.envelope(true, { status: 'SKIPPED', reason: 'ORDER_PLANNING_GAP_NOT_READY', gapStatus: gap.status }) };
    var scopes = env.enumerateScopes() || [];
    if (!scopes.length) return { envelope: env.envelope(true, { status: 'SKIPPED', reason: 'NO_ELIGIBLE_SCOPES' }) };
    var cycle = '';
    try { cycle = env.planningCycle ? (env.planningCycle() || '') : ''; } catch (_pc) {}
    var runId = env.newRunId();
    var nowStr = env.timestamp(), nowMs = env.nowMs ? env.nowMs() : 0;
    var state = weeklyRecoNewState_(runId, cycle, scopes, nowStr, nowMs);
    // fail CLOSED at START: arm the first continuation BEFORE persisting a RUNNING-capable state; if scheduling THROWS
    // (trigger auth/quota) persist a TERMINAL FAILED — never a dangling PENDING that never drives (mirrors 46_ §A2).
    try { env.clearContinuation(); env.scheduleContinuation(WEEKLY_RECO_PROMPT_DELAY_MS_); state.lastContinuationScheduledAt = env.timestamp(); }
    catch (schedErr) {
      weeklyRecoMarkFailed_(env, state, 'CONTINUATION_SCHEDULE_FAILED: ' + (schedErr && schedErr.message ? schedErr.message : schedErr));
      return { envelope: env.envelope(false, null, 'CONTINUATION_SCHEDULE_FAILED', state.lastError) };
    }
    weeklyRecoWriteState_(env, state); weeklyRecoLog_('START', state);
    return { envelope: env.envelope(true, { runId: runId, status: 'PENDING', scopesTotal: scopes.length, planningCycle: cycle }) };
  });
  if (res.lockFailed) return env.envelope(false, null, 'WEEKLY_RECO_LOCK_UNAVAILABLE', 'another weekly recommendation operation is in progress');
  return res.envelope;
}

// ---- CONTINUATION WORKER — ONE 48_ step per fire (START the scope's job, or advance it ONE slice), then checkpoint
// and arm the next. Bounded + tiny (a single 48_ slice is ≤25 SKUs / well under the worker budget), so the chain
// always reaches its clean exit + re-arm. A recovery trigger armed BEFORE the (lock-free) 48_ step is the survivor if
// this worker is killed. The script lock is held ONLY for the momentary state read/checkpoint — NEVER across the 48_
// call (48_ acquires the same lock per SKU). --------------------------------------------------------------------
function weeklyRecoContinue_(env) {
  var token = env.token ? env.token() : ('tok-' + (env.nowMs ? env.nowMs() : 0));
  // Phase 1 — claim the lease + arm the recovery backstop (momentary lock).
  var claim = weeklyRecoWithLock_(env, function () {
    var s = weeklyRecoReadState_(env);
    if (!s) { try { env.clearContinuation(); } catch (_c0) {} return { noop: true, status: 'NONE' }; }
    if (weeklyRecoIsTerminal_(s.status)) { try { env.clearContinuation(); } catch (_c1) {} return { noop: true, state: s }; }
    var nowMs = env.nowMs ? env.nowMs() : 0;
    if (s.lease && s.lease.owner !== token && (s.lease.expiresAtMs || 0) > nowMs) { return { busy: true, state: s }; }   // another worker owns it
    try { env.clearContinuation(); env.scheduleContinuation(WEEKLY_RECO_RECOVERY_DELAY_MS_); s.lastContinuationScheduledAt = env.timestamp(); }
    catch (schedErr) { return { armFailed: true, state: weeklyRecoMarkFailed_(env, s, 'RECOVERY_ARM_FAILED: ' + (schedErr && schedErr.message ? schedErr.message : schedErr)) }; }
    s.lease = { owner: token, expiresAtMs: nowMs + WEEKLY_RECO_LEASE_MS_ };
    s.status = 'RUNNING'; s.lastWorkerStartedAt = env.timestamp(); s.updatedAt = s.lastWorkerStartedAt; weeklyRecoTouchMs_(env, s);
    weeklyRecoWriteState_(env, s); weeklyRecoLog_('WORKER_START', s);
    return { state: s };
  });
  if (claim.lockFailed) { try { env.scheduleContinuation(WEEKLY_RECO_PROMPT_DELAY_MS_); } catch (_l) {} return env.envelope(true, { status: 'RESCHEDULED_LOCKED' }); }
  if (claim.noop) return env.envelope(true, claim.state ? weeklyRecoPublicState_(claim.state) : { status: 'NONE' });
  if (claim.busy) { var b = weeklyRecoPublicState_(claim.state); b.busy = true; return env.envelope(true, b); }
  if (claim.armFailed) return env.envelope(false, null, 'CONTINUATION_SCHEDULE_FAILED', claim.state.lastError);
  var state = claim.state;

  // already drained? finalize DONE (defensive — normally caught before claiming).
  if (state.scopeCursor >= state.scopesTotal) {
    var done0 = weeklyRecoWithLock_(env, function () {
      var s = weeklyRecoReadState_(env); if (!s || s.runId !== state.runId || weeklyRecoIsTerminal_(s.status)) { try { env.clearContinuation(); } catch (_d0) {} return { state: s }; }
      try { env.clearContinuation(); } catch (_d1) {} return { state: weeklyRecoMarkDone_(env, s) };
    });
    return env.envelope(true, weeklyRecoPublicState_((done0 && done0.state) || state));
  }

  // Phase 2 — ONE 48_ operation for the current scope, LOCK-FREE (48_ manages its own lock).
  var scope = state.scopeQueue[state.scopeCursor];
  var outcome;
  if (!state.currentScopeRunId) {
    var sres = env.startScopeJob(scope, { mode: WEEKLY_RECO_MODE_, planningCycle: state.planningCycle, actor: WEEKLY_RECO_ACTOR_ });
    outcome = weeklyRecoInterpretStart_(sres);
  } else {
    var cres = env.continueScopeJob(state.currentScopeRunId);
    outcome = weeklyRecoInterpretContinue_(cres);
  }

  // Phase 3 — fold the outcome, advance / defer / fail, arm the next step or finish (momentary lock).
  var fin = weeklyRecoWithLock_(env, function () {
    var s = weeklyRecoReadState_(env);
    if (!s || s.runId !== state.runId || weeklyRecoIsTerminal_(s.status)) { try { env.clearContinuation(); } catch (_f0) {} return { state: s }; }
    if (!s.lease || s.lease.owner !== token) { return { state: s } }                          // lease lost/stolen → do not advance
    var scopeKey = weeklyRecoScopeKey_(scope);
    var advanced = false, k = outcome.kind;
    if (k === 'STARTED' || k === 'ADOPT') {
      s.currentScopeRunId = outcome.runId || s.currentScopeRunId;
    } else if (k === 'PROGRESS') {
      /* a 48_ slice advanced; keep the same scope + runId and re-arm (counts fold once, at DONE) */
    } else if (k === 'DONE') {
      weeklyRecoFold48Counts_(s.counts, outcome.counts);
      s.counts.scopesDone++; s.lastProcessedScope = scopeKey; s.currentScopeRunId = null; s.scopeCursor++; advanced = true;
    } else if (k === 'BUSY') {
      s.deferrals[scopeKey] = (s.deferrals[scopeKey] || 0) + 1;                               // foreign manual job → defer, bounded
      if (s.deferrals[scopeKey] >= WEEKLY_RECO_MAX_DEFERRALS_) { s.counts.scopesDeferred++; s.lastProcessedScope = scopeKey; s.currentScopeRunId = null; s.scopeCursor++; advanced = true; }
    } else {   // EMPTY | NOT_READY | FAIL | GONE — record + skip the scope (never block the queue)
      s.counts.scopesFailed++; s.lastError = outcome.code || k; s.lastProcessedScope = scopeKey; s.currentScopeRunId = null; s.scopeCursor++; advanced = true;
    }
    // bounded no-progress BACKSTOP. STARTED / ADOPT / PROGRESS are all genuine FORWARD steps (the 48_ job advanced its
    // own SKU cursor, or we just adopted its runId) and must NEVER count as stuck — else a legitimately large scope
    // (many 48_ slices) would false-fail. Only a step that neither advanced our cursor NOR moved the 48_ job forward
    // is "no progress"; that case is already bounded by the deferral cap, so this is a pure safety net.
    var forward = advanced || k === 'STARTED' || k === 'ADOPT' || k === 'PROGRESS';
    if (forward) { s.stuckCursor = s.scopeCursor; s.stuckCount = 0; }
    else {
      if (s.stuckCursor === s.scopeCursor) s.stuckCount = (s.stuckCount || 0) + 1; else { s.stuckCursor = s.scopeCursor; s.stuckCount = 1; }
      if (s.stuckCount > WEEKLY_RECO_MAX_SCOPE_ATTEMPTS_) {
        s.currentScopeRunId = null; s.counts.scopesFailed++; s.scopeCursor++;                 // give up on this scope, keep the run alive
        s.lastError = 'SCOPE_NO_PROGRESS at cursor ' + (s.scopeCursor - 1) + ' (' + scopeKey + ')';
        s.stuckCursor = s.scopeCursor; s.stuckCount = 0;
      }
    }
    s.lease = null; s.lastWorkerFinishedAt = env.timestamp(); s.updatedAt = s.lastWorkerFinishedAt; weeklyRecoTouchMs_(env, s);
    if (s.scopeCursor >= s.scopesTotal) { try { env.clearContinuation(); } catch (_f1) {} return { state: weeklyRecoMarkDone_(env, s) }; }
    try { env.clearContinuation(); env.scheduleContinuation(WEEKLY_RECO_PROMPT_DELAY_MS_); s.lastContinuationScheduledAt = env.timestamp(); } catch (_f2) {}
    weeklyRecoWriteState_(env, s); weeklyRecoLog_('WORKER_STEP', s);
    return { state: s };
  });
  var finalState = (fin && fin.state) || state;
  return env.envelope(true, weeklyRecoPublicState_(finalState));
}

// ---- STATUS (read-only) — a stale run is reported truthfully; the next weekly START reclaims it (no watchdog here). --
function weeklyRecoStatus_(env) {
  var state = weeklyRecoReadState_(env);
  if (!state) return env.envelope(true, { status: 'NONE' });
  if (weeklyRecoStaleNonterminal_(state, env.nowMs ? env.nowMs() : 0)) { var pub = weeklyRecoPublicState_(state); pub.stale = true; return env.envelope(true, pub); }
  return env.envelope(true, weeklyRecoPublicState_(state));
}

// ---- CANCEL — terminal CANCELLED for the active weekly run; already-persisted drafts are PRESERVED (no rollback). ---
function weeklyRecoCancel_(env, requestedRunId) {
  var res = weeklyRecoWithLock_(env, function () {
    var state = weeklyRecoReadState_(env);
    if (!state) return { envelope: env.envelope(true, { status: 'NONE', cancelled: false }) };
    if (requestedRunId && state.runId !== requestedRunId) return { envelope: env.envelope(true, { status: state.status, runId: state.runId, cancelled: false, note: 'RUNID_MISMATCH' }) };
    if (weeklyRecoIsTerminal_(state.status)) return { envelope: env.envelope(true, weeklyRecoPublicState_(state)) };
    try { env.clearContinuation(); } catch (_c) {}
    weeklyRecoMarkCancelled_(env, state);
    return { envelope: env.envelope(true, weeklyRecoPublicState_(state)) };
  });
  if (res.lockFailed) return env.envelope(false, null, 'WEEKLY_RECO_LOCK_UNAVAILABLE', 'another weekly recommendation operation is in progress');
  return res.envelope;
}

// ---- PRODUCTION side-effect adapters (Apps Script globals; not exercised by Node tests) ----------------------
// Reuses 46_'s Script-Property + lock + timestamp adapters and its SAFE trigger delete-by-handler primitive; reuses
// 47_'s gap-DONE gate; reuses 43_'s scope reader + planning-cycle resolver + envelope; drives the 48_ job verbatim.
function weeklyRecoScheduleContinuation_(ms) {
  ScriptApp.newTrigger(WEEKLY_RECO_CONTINUATION_HANDLER_).timeBased().after(Math.max(1, ms || WEEKLY_RECO_PROMPT_DELAY_MS_)).create();
}
function weeklyRecoClearContinuation_() { return gapJobDeleteTriggersByHandler_(WEEKLY_RECO_CONTINUATION_HANDLER_); }   // AUTH3 §2 safe provenance (re-read getProjectTriggers, delete by exact handler; only THIS handler)
function weeklyRecoEnumerateScopesProd_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return weeklyRecoDistinctScopes_(gapReadObjects_(ss, OP_GAP_TABLE_));   // READ ONLY over the already-materialized gap table
}
function weeklyRecoDefaultEnv_() {
  return {
    props: gapJobScriptProps_(),
    lock: gapJobScriptLock_(),
    timestamp: function () { return gapJobTimestamp_(); },
    nowMs: function () { try { return new Date().getTime(); } catch (e) { return 0; } },
    token: function () { try { return Utilities.getUuid(); } catch (e) { return 'tok-' + new Date().getTime(); } },
    newRunId: function () { return 'WREC-' + (function () { try { return Utilities.formatDate(new Date(), WEEKLY_RECO_TZ_, 'yyyyMMdd-HHmmss'); } catch (e) { return String(new Date().getTime()); } })(); },
    envelope: function (ok, data, token, message) { return gapBatchEnvelope_(ok, data, token, message); },
    planningCycle: function () { try { var ctx = gapCalcResolveContext_(WEEKLY_RECO_PRODUCT_); return (ctx && ctx.ok) ? ctx.planningCycle : ''; } catch (e) { return ''; } },
    gapReady: function () { return recGenGapReadyFromState_(recGenReadGapJobState_(WEEKLY_RECO_PRODUCT_)); },
    enumerateScopes: function () { return weeklyRecoEnumerateScopesProd_(); },
    // Drive the EXISTING 48_ job (its own default env → its own lock/state). NOTHING is reimplemented here.
    startScopeJob: function (scope, opts) {
      return handleStartRequestOrderDraftJob_({ payload: { scope: scope, mode: (opts && opts.mode) || WEEKLY_RECO_MODE_, planningCycle: (opts && opts.planningCycle) || '', actor: (opts && opts.actor) || WEEKLY_RECO_ACTOR_ } });
    },
    continueScopeJob: function (runId) { return handleContinueRequestOrderDraftJob_({ payload: { runId: runId } }); },
    scheduleContinuation: function (ms) { return weeklyRecoScheduleContinuation_(ms); },
    clearContinuation: function () { return weeklyRecoClearContinuation_(); }
  };
}

// ---- TIME-TRIGGER TARGET (NO trailing underscore — Apps Script trigger handlers must be callable by name) -------
// The one-off self-arming worker. Distinct from the recurring 45_ weekly trigger (runWeeklyRecommendation) which
// STARTS the run; this drives it to completion across bounded steps.
function continueWeeklyRecommendationJob(e) { return weeklyRecoContinue_(weeklyRecoDefaultEnv_()); }
