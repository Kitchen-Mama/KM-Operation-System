// Kitchen Mama Operation System — API v1 · OVERSEAS ALLOCATION PREVIEW JOB (S8-B3-R1A, release R51).
// =============================================================================================================
// A READ-ONLY, ASYNCHRONOUS preview of the frozen §20/§24 overseas shared-pool allocation for ONE allocation
// group. It computes nothing of its own: pool eligibility comes from 43_'s gapOpReadSupplyPoolFacts_, demand from
// 43_'s gapOpHarvestReceivers_ (allocatedForecastQty), and the distribution from the ONE allocation owner,
// KMMSA.allocateMarketplaceReceiverSupply. There is no Apply, no reservation, and no business write of any kind.
//
// WHY A SEPARATE MODULE AND NOT A NEW GAP-JOB "PRODUCT" (D-S8-B3-8)
// Extending GAP_JOB_PROP_KEYS_ / gapJobNormalizeProduct_ / GAP_JOB_CONTINUATION_HANDLERS_ / gapJobResultTableFor_
// would change Gap Materialization in order to add something that is not gap materialization — and
// gapJobResultTableFor_ assumes a RESULT TABLE this feature deliberately does not have. The proven lifecycle is
// reused as a PATTERN; 46_ is not edited by this release.
//
// ONE PREVIEW RUN = ONE ALLOCATION GROUP = company + canonical country + master SKU (D-S8-B3-8).
// The competing receiver set is never split: conservation requires the COMPLETE set in one KMMSA call, so a group
// cannot be sliced. That is also what makes source consistency tractable — see SNAPSHOT CONSISTENCY below.
//
// THE SHORT-LOCK CONTRACT (D-S8-B3-15, USER-APPROVED Option A) — THE CRITICAL INVARIANT OF THIS FILE
// LockService.getScriptLock() is per-SCRIPT, so this job and the Gap Materialization job share ONE lock.
// gapJobContinue_ holds it across its ENTIRE slice loop (up to GAP_JOB_WORKER_BUDGET_MS_ = 240000 ms), while its
// bounded wait is only GAP_JOB_MAX_LOCK_WAITS_ (8) × GAP_JOB_CONTINUATION_DELAY_MS_ (1000 ms) before the truthful
// terminal LOCK_UNAVAILABLE_TIMEOUT → FAILED. The asymmetry is the whole point:
//   • Preview losing to a Gap job is TOLERABLE — it reschedules and says so.
//   • A Gap job losing to Preview would be a REGRESSION OF A SHIPPED PRODUCTION JOB.
// Therefore THIS job must never be the long holder. The lock is taken ONLY for short state transitions and is
// NEVER held across: a sheet read, a workspaceGet, a forecast calculation, a KMMSA allocation, or result
// serialization. Preview-vs-Preview exclusion comes from the OPTIMISTIC runId guard (the proven check in 46_),
// not from a longer lock. OAP_LOCK_RETRY_DELAY_MS_ × OAP_MAX_LOCK_WAITS_ is sized to outlast a Gap worker so
// waiting ends in a RESCHEDULED_LOCKED retry rather than a FAILED.
//
// SNAPSHOT CONSISTENCY (S8-B3-D4 §4) — WHAT IS AND IS NOT CLAIMED
// No atomic spreadsheet snapshot exists and none is claimed. gapJobProcessSlice_ demonstrably re-reads live facts
// on every continuation. This job does not rely on cross-slice stability because a group is INDIVISIBLE: the whole
// computation happens inside one execution, from one set of reads. What a single execution still cannot rule out
// is drift BETWEEN the read and the publication, so the inputs are fingerprinted at read time and REVALIDATED
// immediately before publishing. A mismatch is SOURCE_DRIFT: bounded retry, never a published number.
//
// RESULT STORE (D-S8-B3-12) — the EXISTING generation-keyed chunked Script-Property mechanism from 46_. The
// primitives it reuses (gapJobChunkString_, gapJobUtf8Len_, gapJobFnv1a_, gapJobPad4_) are product-agnostic
// top-level functions, so they are called directly and 46_ stays untouched. This module brings its own key prefix.
//
// TECHNICAL WRITES — EXHAUSTIVE (D-S8-B3-15 / S8-B3-R1A §10):
//   1. Script Properties under OAP_PROP_KEY_ and the OAP_RESULT_PREFIX_ prefix.
//   2. One-off continuation / self-heal triggers whose handler is OAP_CONTINUATION_HANDLER_.
// NOTHING ELSE. No sheet is ever written: no inventory quantity, no allocation reservation, no Request Order, no
// Purchase Order, no Shipment Draft or Overview, no forecast source, no materialized gap row (order_planning_gap
// and inventory_replenishment_gap are READ-ONLY to this module), no audit/journal row.
//
// DISABLED BY DEFAULT. overseasAllocationPreviewEnabled_() (00_config.gs) is checked BEFORE the spreadsheet is
// opened, before any job state is created and before any trigger is armed — the PRODUCT_STRATEGY_ENABLED_ pattern.

// ---- identity + budgets -------------------------------------------------------------------------------------
var OAP_PROP_KEY_ = 'OAP_PREVIEW_JOB';                  // the ONE job-state key (one Preview run at a time)
var OAP_RESULT_PREFIX_ = 'OAP_PREVIEW_RESULT';          // result chunk keys: <prefix>:<generationId>:<0000>
var OAP_CONTINUATION_HANDLER_ = 'continueOverseasAllocationPreviewJob';
var OAP_TZ_ = 'Asia/Taipei';
var OAP_VERSION_ = 'oap-s8-b3-r1a-1';
// Module build stamp — the release in which THIS FILE last changed (not the deployment release id). It is
// declared here and expected by SYS_MODULE_BUILD_STAMPS_ in 63_, so a project that was copied a file at a
// time and missed this NEW file reports itself unsynced instead of silently routing four dead actions.
var OAP_BUILD_VERSION_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R51';

var OAP_LOCK_MS_ = 10000;                               // bounded wait for the SHARED script lock
// D-S8-B3-15 — sized to OUTLAST a Gap worker's hold. A Gap worker exits cleanly at 240000 ms and, if hard-killed,
// at ~360000 ms. 8 × 60000 = 480000 ms > 360000 ms, so Preview waiting on Gap ends in a retry, never a FAILED.
// (The Gap job's own 1000 ms delay is right for ITS contention; it is wrong for a contender that must outlast it.)
var OAP_LOCK_RETRY_DELAY_MS_ = 60000;
var OAP_MAX_LOCK_WAITS_ = 8;
var OAP_CONTINUATION_DELAY_MS_ = 1000;                  // prompt first tick (no contention expected)
var OAP_WORKER_BUDGET_MS_ = 240000;                     // clean-exit budget; never rely on the ~6-min hard kill
var OAP_STALE_MS_ = 600000;                             // a non-terminal run with no progress past this is reclaimable
var OAP_RECOVERY_DELAY_MS_ = 420000;                    // LONGER than the hard kill → only fires on a kill
var OAP_MAX_RECOVERIES_ = 5;
var OAP_MAX_ATTEMPTS_ = 3;                              // bounded retry (also bounds SOURCE_DRIFT retries)
var OAP_RESULT_TTL_MS_ = 3600000;                       // a Preview result expires after 1 hour

// D-S8-B3-12 — per-CHUNK budget is the EXISTING one (never raised). The TOTAL budget is Preview-specific: the
// ~500 KB Script-Properties store is SHARED with the Gap job's state and partition chunks, so Preview declares a
// 25% slice rather than being free to starve it. Measured: ~1560 B per receiver, so 128 KB ≈ 84 receivers.
var OAP_RESULT_CHUNK_BYTES_ = 6912;
var OAP_RESULT_SAFE_BYTES_ = 131072;
var OAP_MAX_RECEIVERS_ = 80;                            // policy cap; the BYTE gate below is the real enforcement

// ---- tiny helpers (local; nothing here reaches into another module's state) ----------------------------------
function oapStr_(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }
function oapNum_(v) { if (v === '' || v === null || v === undefined) return null; var n = Number(v); return isFinite(n) ? n : null; }
// Country identity through the KMCID owner (UK ≡ GB), in a PREVIEW-SPECIFIC adapter. 64_api_v1_scope_registry.gs
// compares country RAW and drives the Inventory Replenishment selectors; canonicalizing it there would merge UK and
// GB in an unrelated page's dropdown (D-S8-B3-9). So the canonicalization lives here and 64_ is not touched.
function oapCanonCountry_(v) {
  return (typeof KMCID !== 'undefined' && KMCID && typeof KMCID.canonicalCountryCode === 'function')
    ? KMCID.canonicalCountryCode(v) : oapStr_(v).toUpperCase();
}
function oapGroupKey_(company, country, masterSku) { return oapStr_(company) + '||' + oapCanonCountry_(country) + '||' + oapStr_(masterSku); }
function oapIsTerminal_(status) { return status === 'DONE' || status === 'FAILED' || status === 'CANCELLED' || status === 'STALLED'; }
function oapEnvelope_(ok, data, code, message) {
  var out = { success: ok === true, data: (data === undefined ? null : data) };
  if (!out.success) out.errors = [{ code: oapStr_(code) || 'ERROR', message: oapStr_(message) || oapStr_(code) }];
  return out;
}
function oapDisabled_() {
  return oapEnvelope_(false, null, 'FEATURE_DISABLED',
    'Overseas Allocation Preview is staged OFF (OVERSEAS_ALLOCATION_PREVIEW_ENABLED_ = false). No job was created, no trigger armed and no database opened.');
}
function oapEnabled_() {
  return (typeof overseasAllocationPreviewEnabled_ === 'function') ? overseasAllocationPreviewEnabled_() === true : false;
}

// ---- job state (Script Properties; NEVER a table) -------------------------------------------------------------
function oapReadState_(env) {
  var raw = env.props.get(OAP_PROP_KEY_);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}
function oapWriteState_(env, state) { env.props.set(OAP_PROP_KEY_, JSON.stringify(state)); }
function oapClearState_(env) { if (env.props.del) env.props.del(OAP_PROP_KEY_); }
function oapTouch_(env, state) { state.updatedAt = env.timestamp(); state.updatedAtMs = env.nowMs ? env.nowMs() : 0; return state; }
function oapNewState_(env, runId, scope) {
  var now = env.timestamp();
  return { version: OAP_VERSION_, runId: runId, status: 'PENDING',
    company: scope.company, country: scope.country, masterSku: scope.masterSku, groupKey: oapGroupKey_(scope.company, scope.country, scope.masterSku),
    startedAt: now, updatedAt: now, updatedAtMs: env.nowMs ? env.nowMs() : 0, finishedAt: null, cancelledAt: null,
    attempts: 0, recoveryCount: 0, lockWaits: 0, recovering: false,
    receiverCount: null, resultMeta: null, lastError: null };
}

// ---- RESULT STORE — the EXISTING chunked mechanism, with a Preview-owned prefix (D-S8-B3-12) ------------------
// Atomic generation publication: chunks are written under generation-specific keys FIRST; the META (which is what
// a reader follows) is committed into job state LAST, under the short lock. A reader that follows a META is
// therefore following a COMPLETE generation, and a half-written generation is simply never pointed at.
function oapResultChunkKey_(generationId, i) { return OAP_RESULT_PREFIX_ + ':' + generationId + ':' + gapJobPad4_(i); }
function oapSerializeResult_(result) {
  var json = JSON.stringify(result);
  return { json: json, byteLength: gapJobUtf8Len_(json), checksum: gapJobFnv1a_(json) };
}
// Enforces the REAL gate — serialized UTF-8 bytes. The receiver cap is a policy guard checked earlier; a byte
// overflow here is a TRUTHFUL TYPED FAILURE and never a truncation.
function oapResultWriteChunks_(env, serialized, generationId) {
  if (serialized.byteLength > OAP_RESULT_SAFE_BYTES_) {
    throw new Error('PREVIEW_RESULT_SIZE_LIMIT: serialized result is ' + serialized.byteLength
      + ' bytes, above the ' + OAP_RESULT_SAFE_BYTES_ + '-byte Preview budget (no truncation is performed)');
  }
  var chunks = gapJobChunkString_(serialized.json, OAP_RESULT_CHUNK_BYTES_);
  for (var i = 0; i < chunks.length; i++) env.props.set(oapResultChunkKey_(generationId, i), chunks[i]);
  return { version: 1, generationId: generationId, chunkCount: chunks.length,
    byteLength: serialized.byteLength, checksum: serialized.checksum, createdAt: env.timestamp(),
    createdAtMs: env.nowMs ? env.nowMs() : 0, expiresAtMs: (env.nowMs ? env.nowMs() : 0) + OAP_RESULT_TTL_MS_ };
}
// FAIL-CLOSED on a missing chunk, a byte-length mismatch or a checksum mismatch. A partial or cross-generation
// result is never reconstructed and never returned.
function oapResultRead_(env, meta) {
  if (!meta) return null;
  var parts = [];
  for (var i = 0; i < meta.chunkCount; i++) {
    var v = env.props.get(oapResultChunkKey_(meta.generationId, i));
    if (v === null || v === undefined) throw new Error('PREVIEW_RESULT_CHUNK_MISSING: gen ' + meta.generationId + ' chunk ' + i + '/' + meta.chunkCount);
    parts.push(v);
  }
  var json = parts.join('');
  if (gapJobUtf8Len_(json) !== meta.byteLength || gapJobFnv1a_(json) !== meta.checksum) {
    throw new Error('PREVIEW_RESULT_CHECKSUM_MISMATCH: gen ' + meta.generationId);
  }
  return JSON.parse(json);
}
// Bounded STRICTLY to this module's own key prefix — it can never touch a Gap job key or any other property.
function oapResultPurge_(env, keepGenerationId) {
  if (!env.props.keys) return 0;
  var prefix = OAP_RESULT_PREFIX_ + ':', keep = keepGenerationId ? (prefix + keepGenerationId + ':') : null;
  var all = env.props.keys() || [], removed = 0;
  for (var i = 0; i < all.length; i++) {
    var k = all[i];
    if (k.indexOf(prefix) !== 0) continue;
    if (keep && k.indexOf(keep) === 0) continue;
    try { env.props.del(k); removed++; } catch (_e) {}
  }
  return removed;
}
function oapResultExpired_(env, meta) {
  if (!meta) return true;
  var now = env.nowMs ? env.nowMs() : 0;
  return !!(meta.expiresAtMs && now >= meta.expiresAtMs);
}

// ---- SOURCE FINGERPRINT (S8-B3-R1A §6) ------------------------------------------------------------------------
// A stable digest of exactly the inputs the allocation consumed: receiver membership, each receiver's demand and
// priority, and the pool composition. It is computed from the harvested facts (not from a sheet dump), so it is
// cheap to recompute and it changes if and only if something the ALLOCATION depends on changed. Sorted so that a
// re-read returning rows in a different order is NOT mistaken for drift — the output is order-independent, so the
// fingerprint must be too.
function oapFingerprint_(receivers, pools) {
  var r = (receivers || []).map(function (x) {
    return [oapStr_(x.key), oapStr_(x.marketplace), String(x.demandQty), String(x.allocationPriority), oapStr_(x.requiredByDate)].join('~');
  }).sort().join('|');
  var p = (pools || []).map(function (x) {
    return [oapStr_(x.poolKey), oapStr_(x.poolType), oapStr_(x.warehouseId), String(x.effectiveSupplyQty)].join('~');
  }).sort().join('|');
  return gapJobFnv1a_('R:' + r + '#P:' + p);
}

// ---- THE COMPUTATION (NO LOCK IS HELD HERE — this is the long part) -------------------------------------------
// Reads the group's receivers + pools and runs the ONE allocation owner. Every quantity and every rule comes from
// existing owners: eligibility from gapOpReadSupplyPoolFacts_ (3PL + active, FBA excluded, missing ≠ 0, negative
// fail-closed), demand from gapOpHarvestReceivers_ (allocatedForecastQty), distribution from KMMSA. Nothing is
// recomputed, re-weighted, re-ranked or re-moded here.
function oapReadGroup_(env, state) {
  var ss = env.openTarget();
  var company = oapStr_(state.company), country = oapCanonCountry_(state.country), sku = oapStr_(state.masterSku);
  var poolFacts = gapOpReadSupplyPoolFacts_(ss);
  var allScopes = env.enumerateScopes(ss) || [];
  // Group membership: every scope of this company whose CANONICAL country matches. The master-SKU narrowing is
  // done by the harvester's skuFilter, so a marketplace that does not carry the SKU contributes no receiver.
  var scopes = allScopes.filter(function (s) {
    return oapStr_(s.company) === company && oapCanonCountry_(s.country) === country;
  });
  var io = env.workspaceIo(state);
  var skuFilter = {}; skuFilter[sku] = 1;
  var harvested = gapOpHarvestReceivers_(scopes, io, ss, poolFacts, { skuFilter: skuFilter });
  var receivers = (harvested.receivers || []).filter(function (r) { return oapStr_(r.sku) === sku; });
  var pools = poolFacts.overseasPoolsByKey[company + '||' + country + '||' + sku] || [];
  return { receivers: receivers, pools: pools, scopeCount: scopes.length,
    calculationMonth: oapStr_(harvested.calculationMonth), fingerprint: oapFingerprint_(receivers, pools) };
}
function oapAllocate_(state, read) {
  if (typeof KMMSA === 'undefined' || !KMMSA || typeof KMMSA.allocateMarketplaceReceiverSupply !== 'function') {
    throw new Error('KMMSA_NOT_BUNDLED');
  }
  // EXACTLY the receiver DTO 43_'s gapOpBuildSupplyAllocation_ builds for the overseas lane — same fields, same
  // eligiblePoolTypes. Parity is the point: the Preview must answer what materialization would answer.
  var msaReceivers = read.receivers.map(function (r) {
    return { company: r.company, country: r.country, marketplace: r.marketplace, sku: r.sku,
      demandQty: r.demandQty, allocationPriority: r.allocationPriority, requiredByDate: r.requiredByDate,
      eligiblePoolTypes: ['THREE_PL'] };
  });
  return KMMSA.allocateMarketplaceReceiverSupply({
    company: oapStr_(state.company), masterSku: oapStr_(state.masterSku),
    overseasPools: read.pools, receivers: msaReceivers
  });
}
// Shapes the published result. Everything here is REPORTED, never derived: allocationMode is KMMSA's §40 mode
// verbatim (D-S8-B3-11 — the monthly path defaults survivalNeedQty to 0 by frozen decision 2, so supplying one
// would change mode selection and the numbers; no 18-day survival is invented here).
function oapBuildResult_(env, state, read, res) {
  var byReceiver = (res && res.byReceiver) || {};
  var ov = (res && res.overseas) || null;
  return {
    schemaVersion: OAP_VERSION_,
    runId: state.runId,
    scope: { company: oapStr_(state.company), country: oapCanonCountry_(state.country), masterSku: oapStr_(state.masterSku) },
    generation: { calculationMonth: read.calculationMonth || null, inputFingerprint: read.fingerprint,
      scopeCount: read.scopeCount, readAt: env.timestamp() },
    ready: res ? res.ready === true : false,
    blocked: res ? res.blocked === true : true,
    issues: (res && res.issues) ? res.issues : [],
    allocationMode: ov ? ov.allocationMode : null,            // VERBATIM §40 mode; absent for the singleReceiver case
    singleReceiver: res ? res.singleReceiver === true : false,
    receiverCount: res ? (res.receiverCount || 0) : 0,
    totals: ov ? { totalDemandQty: ov.totalDemandQty, totalSupplyQty: ov.totalSupplyQty,
      totalAllocatedQty: ov.totalAllocatedQty, totalUnallocatedDemandQty: ov.totalUnallocatedDemandQty,
      totalUnusedSupplyQty: ov.totalUnusedSupplyQty } : null,
    receivers: read.receivers.map(function (r) {
      var b = byReceiver[r.key] || null;
      return { receiverKey: r.key, marketplace: r.marketplace, sku: r.sku,
        demandQty: r.demandQty, demandBasis: 'allocatedForecastQty',
        allocationPriority: r.allocationPriority, priorityResolved: r.allocationPriority !== null && r.allocationPriority !== undefined,
        allocatedOverseasQty: b ? (b.allocatedOverseasQty || 0) : null };
    }),
    warehouseContributions: ov && ov.allocations ? ov.allocations : [],
    unusedSupply: ov && ov.unusedSupply ? ov.unusedSupply : [],
    unallocatedDemand: ov && ov.unallocatedDemand ? ov.unallocatedDemand : [],
    allocatorVersion: res ? res.VERSION : null
  };
}

// ---- START (short lock) ---------------------------------------------------------------------------------------
// A quick write: validate, claim the single job slot, persist PENDING state, arm the first continuation, return.
// NO calculation happens in the request. The gate is checked BEFORE env is built, so a disabled Preview opens no
// database, creates no job state and arms no trigger.
function oapJobStart_(env, scope) {
  var company = oapStr_(scope && scope.company), country = oapStr_(scope && scope.country), sku = oapStr_(scope && scope.masterSku);
  if (!company || !country || !sku) return oapEnvelope_(false, null, 'INVALID_SCOPE', 'company, country and masterSku are all required (one Preview run = one allocation group)');
  var lock = env.lock, locked = false;
  try { locked = lock ? lock.acquire(OAP_LOCK_MS_) : true; } catch (e) { locked = false; }
  if (lock && !locked) {
    // The shared lock is held — almost always by a Gap worker. This is TRUTHFUL and RETRYABLE; it is never
    // allowed to become a terminal failure, and it never makes the Gap job wait on us.
    return oapEnvelope_(false, null, 'PREVIEW_BUSY', 'the shared script lock is held by another job; retry shortly (no Preview job was created)');
  }
  try {
    var prior = oapReadState_(env);
    if (prior && !oapIsTerminal_(prior.status)) {
      var ageMs = (env.nowMs ? env.nowMs() : 0) - (prior.updatedAtMs || 0);
      if (ageMs < OAP_STALE_MS_) {
        return oapEnvelope_(false, { runId: prior.runId, status: prior.status, groupKey: prior.groupKey },
          'PREVIEW_ALREADY_RUNNING', 'a Preview run is already active for ' + prior.groupKey);
      }
      try { env.clearContinuationTriggers(); } catch (_c) {}        // reclaim a decisively stale run
    }
    var runId = env.newRunId();
    var state = oapNewState_(env, runId, { company: company, country: country, masterSku: sku });
    oapWriteState_(env, state);
    try { env.scheduleContinuation(OAP_CONTINUATION_DELAY_MS_); } catch (_s) {}
    return oapEnvelope_(true, { runId: runId, status: state.status, groupKey: state.groupKey });
  } finally { if (lock && locked) { try { lock.release(); } catch (_r) {} } }
}

// ---- STATUS (read-only; the ONLY write it may perform is the §7 self-heal of the SAME run) --------------------
function oapJobStatus_(env, runId) {
  var state = oapReadState_(env);
  if (!state) return oapEnvelope_(true, { status: 'NO_RUN', runId: null });
  if (runId && oapStr_(runId) !== oapStr_(state.runId)) {
    return oapEnvelope_(true, { status: 'SUPERSEDED', runId: state.runId, requestedRunId: oapStr_(runId) });
  }
  if (!oapIsTerminal_(state.status)) {
    var ageMs = (env.nowMs ? env.nowMs() : 0) - (state.updatedAtMs || 0);
    if (ageMs > OAP_STALE_MS_) {
      if ((state.recoveryCount || 0) >= OAP_MAX_RECOVERIES_) {
        state.status = 'STALLED'; state.lastError = state.lastError || 'STALE_NO_PROGRESS';
        state.finishedAt = env.timestamp(); oapTouch_(env, state); oapWriteState_(env, state);
      } else {
        // Self-heal: CONTINUE the same logical run from its own state. It never starts a new run, never
        // re-resolves scope and never computes anything.
        try { env.clearContinuationTriggers(); } catch (_c) {}
        try { env.scheduleContinuation(OAP_CONTINUATION_DELAY_MS_); } catch (_s) {}
        state.recoveryCount = (state.recoveryCount || 0) + 1; state.recovering = true;
        state.lastError = 'AUTO_RECOVERY #' + state.recoveryCount;
        oapTouch_(env, state); oapWriteState_(env, state);
      }
    }
  }
  // STATUS carries PROGRESS, never the result payload (the result has its own action).
  return oapEnvelope_(true, { runId: state.runId, status: state.status, groupKey: state.groupKey,
    receiverCount: state.receiverCount, attempts: state.attempts, recoveryCount: state.recoveryCount,
    startedAt: state.startedAt, updatedAt: state.updatedAt, finishedAt: state.finishedAt,
    lastError: state.lastError,
    resultAvailable: !!(state.status === 'DONE' && state.resultMeta && !oapResultExpired_(env, state.resultMeta)) });
}

// ---- RESULT (read-only) ---------------------------------------------------------------------------------------
function oapResultGet_(env, runId) {
  var state = oapReadState_(env);
  if (!state) return oapEnvelope_(false, null, 'NO_RUN', 'no Preview run exists');
  if (runId && oapStr_(runId) !== oapStr_(state.runId)) {
    return oapEnvelope_(false, { runId: state.runId }, 'RESULT_SUPERSEDED', 'the requested run is no longer the current one');
  }
  if (state.status !== 'DONE') return oapEnvelope_(false, { status: state.status }, 'RESULT_NOT_READY', 'the Preview run is ' + state.status);
  if (!state.resultMeta) return oapEnvelope_(false, null, 'RESULT_MISSING', 'the run completed without a published result');
  if (oapResultExpired_(env, state.resultMeta)) return oapEnvelope_(false, null, 'RESULT_EXPIRED', 'the Preview result has expired; start a new run');
  var payload;
  try { payload = oapResultRead_(env, state.resultMeta); }
  catch (e) { return oapEnvelope_(false, null, 'RESULT_INTEGRITY_FAILURE', (e && e.message) ? String(e.message) : String(e)); }
  return oapEnvelope_(true, { runId: state.runId, meta: state.resultMeta, result: payload });
}

// ---- CANCEL (short lock) --------------------------------------------------------------------------------------
function oapJobCancel_(env, runId) {
  var lock = env.lock, locked = false;
  try { locked = lock ? lock.acquire(OAP_LOCK_MS_) : true; } catch (e) { locked = false; }
  try {
    var state = oapReadState_(env);
    if (!state) return oapEnvelope_(false, null, 'NO_RUN', 'no Preview run exists');
    if (runId && oapStr_(runId) !== oapStr_(state.runId)) return oapEnvelope_(false, { runId: state.runId }, 'RUN_SUPERSEDED', 'the requested run is not the current one');
    if (oapIsTerminal_(state.status)) return oapEnvelope_(true, { runId: state.runId, status: state.status });
    state.status = 'CANCELLED'; state.cancelledAt = env.timestamp(); state.finishedAt = state.cancelledAt;
    oapTouch_(env, state); oapWriteState_(env, state);
    try { env.clearContinuationTriggers(); } catch (_c) {}
    return oapEnvelope_(true, { runId: state.runId, status: 'CANCELLED' });
  } finally { if (lock && locked) { try { lock.release(); } catch (_r) {} } }
}

// ---- THE WORKER — three phases, and only phases 1 and 3 take the lock -----------------------------------------
// PHASE 1 (SHORT LOCK): claim the run, arm the self-heal backstop, release.
// PHASE 2 (NO LOCK):    read the group, allocate, serialize, write result chunks, revalidate the source.
// PHASE 3 (SHORT LOCK): re-check runId + cancellation, commit the META, mark DONE.
// A stale worker that wakes after a newer run started finds a different runId in phase 3 and DISCARDS its work.
// A cancelled run finds a terminal status in phase 3 and publishes NOTHING.
function oapJobContinue_(env) {
  var lock = env.lock, locked = false;
  try { locked = lock ? lock.acquire(OAP_LOCK_MS_) : true; } catch (e) { locked = false; }
  if (lock && !locked) {
    // Bounded, and deliberately SLOW: OAP_LOCK_RETRY_DELAY_MS_ is sized to outlast a Gap worker's 240 s hold so
    // this path ends in a retry rather than a FAILED, and this job never pressures the Gap job's own budget.
    var ls = oapReadState_(env);
    if (ls && !oapIsTerminal_(ls.status)) {
      ls.lockWaits = (ls.lockWaits || 0) + 1; oapTouch_(env, ls);
      if (ls.lockWaits >= OAP_MAX_LOCK_WAITS_) {
        ls.status = 'FAILED'; ls.lastError = 'LOCK_UNAVAILABLE_TIMEOUT after ' + ls.lockWaits + ' waits';
        ls.finishedAt = env.timestamp(); oapTouch_(env, ls); oapWriteState_(env, ls);
        return { status: 'FAILED', runId: ls.runId };
      }
      oapWriteState_(env, ls);
      try { env.scheduleContinuation(OAP_LOCK_RETRY_DELAY_MS_); } catch (_s) {}
    }
    return { status: 'RESCHEDULED_LOCKED' };
  }

  var claimed = null;
  try {                                                                        // ---- PHASE 1 (locked, short) ----
    var state = oapReadState_(env);
    if (!state) { try { env.clearContinuationTriggers(); } catch (_c0) {} return { status: 'NO_STATE' }; }
    if (oapIsTerminal_(state.status)) { try { env.clearContinuationTriggers(); } catch (_c1) {} return { status: state.status, runId: state.runId }; }
    if ((state.attempts || 0) >= OAP_MAX_ATTEMPTS_) {
      state.status = 'FAILED'; state.lastError = state.lastError || 'MAX_ATTEMPTS_EXCEEDED';
      state.finishedAt = env.timestamp(); oapTouch_(env, state); oapWriteState_(env, state);
      try { env.clearContinuationTriggers(); } catch (_c2) {}
      return { status: 'FAILED', runId: state.runId };
    }
    state.status = 'RUNNING'; state.lockWaits = 0; state.recovering = false;
    state.attempts = (state.attempts || 0) + 1;
    state.workerStartedAtMs = env.nowMs ? env.nowMs() : 0;
    oapTouch_(env, state); oapWriteState_(env, state);
    // Hold the lock ⇒ authoritative over our own triggers. Arm the self-heal backstop BEFORE any work, at a delay
    // LONGER than the hard kill, so it survives only if this worker is killed without a clean exit.
    try { env.clearContinuationTriggers(); } catch (_c3) {}
    try { env.scheduleContinuation(OAP_RECOVERY_DELAY_MS_); } catch (_s2) {}
    claimed = state;
  } finally { if (lock && locked) { try { lock.release(); } catch (_r) {} } }
  if (!claimed) return { status: 'NO_STATE' };

  // ---- PHASE 2 — NO LOCK IS HELD. Sheet reads, workspaceGet, KMMSA and serialization all happen here. --------
  var read, res, serialized, meta, generationId;
  try {
    read = oapReadGroup_(env, claimed);
    if (read.receivers.length > OAP_MAX_RECEIVERS_) {
      throw new Error('PREVIEW_RECEIVER_LIMIT: ' + read.receivers.length + ' receivers exceeds the supported cap of ' + OAP_MAX_RECEIVERS_);
    }
    res = oapAllocate_(claimed, read);
    var result = oapBuildResult_(env, claimed, read, res);
    serialized = oapSerializeResult_(result);
    generationId = claimed.runId + '-' + read.fingerprint;
    meta = oapResultWriteChunks_(env, serialized, generationId);
    // SOURCE CONSISTENCY — revalidate immediately before publishing. A single execution does NOT give an atomic
    // snapshot, so the inputs are re-read and re-fingerprinted; a mismatch means the group moved under us and the
    // computed numbers describe a generation that no longer exists. That is never published.
    var recheck = oapReadGroup_(env, claimed);
    if (recheck.fingerprint !== read.fingerprint) {
      throw new Error('SOURCE_DRIFT: inputs changed between read and publish (' + read.fingerprint + ' -> ' + recheck.fingerprint + ')');
    }
    meta.receiverCount = read.receivers.length;
  } catch (e) {
    return oapFailOrRetry_(env, claimed, (e && e.message) ? String(e.message) : String(e));
  }

  try {                                                                        // ---- PHASE 3 (locked, short) ----
    locked = false;
    try { locked = lock ? lock.acquire(OAP_LOCK_MS_) : true; } catch (e2) { locked = false; }
    if (lock && !locked) {                                                     // cannot commit now → retry; chunks stay orphaned and are purged by the next publish
      try { env.scheduleContinuation(OAP_LOCK_RETRY_DELAY_MS_); } catch (_s3) {}
      return { status: 'RESCHEDULED_LOCKED', runId: claimed.runId };
    }
    var live = oapReadState_(env);
    // THE GUARD THAT REPLACES A LONG LOCK: a newer run, or a cancellation, wins — this worker publishes nothing.
    if (!live || oapStr_(live.runId) !== oapStr_(claimed.runId) || oapIsTerminal_(live.status)) {
      oapResultPurge_(env, (live && live.resultMeta) ? live.resultMeta.generationId : null);
      try { env.clearContinuationTriggers(); } catch (_c4) {}
      return { status: 'SUPERSEDED', runId: claimed.runId, current: live ? live.runId : null };
    }
    live.resultMeta = meta;                                                    // META committed LAST ⇒ atomic publication
    live.receiverCount = meta.receiverCount;
    live.status = 'DONE'; live.finishedAt = env.timestamp(); live.lastError = null;
    oapTouch_(env, live); oapWriteState_(env, live);
    try { env.clearContinuationTriggers(); } catch (_c5) {}
    oapResultPurge_(env, generationId);                                        // drop every older generation, prefix-bounded
    return { status: 'DONE', runId: live.runId, receiverCount: meta.receiverCount };
  } finally { if (lock && locked) { try { lock.release(); } catch (_r2) {} } }
}

// Bounded retry, then a TRUTHFUL terminal. A failing run is never left dangling PENDING/RUNNING.
function oapFailOrRetry_(env, claimed, reason) {
  var lock = env.lock, locked = false;
  try { locked = lock ? lock.acquire(OAP_LOCK_MS_) : true; } catch (e) { locked = false; }
  try {
    var live = oapReadState_(env);
    if (!live || oapStr_(live.runId) !== oapStr_(claimed.runId) || oapIsTerminal_(live.status)) {
      return { status: 'SUPERSEDED', runId: claimed.runId };
    }
    live.lastError = reason;
    if ((live.attempts || 0) >= OAP_MAX_ATTEMPTS_) {
      live.status = 'FAILED'; live.finishedAt = env.timestamp();
      oapTouch_(env, live); oapWriteState_(env, live);
      try { env.clearContinuationTriggers(); } catch (_c) {}
      return { status: 'FAILED', runId: live.runId, lastError: reason };
    }
    oapTouch_(env, live); oapWriteState_(env, live);
    try { env.clearContinuationTriggers(); env.scheduleContinuation(OAP_CONTINUATION_DELAY_MS_); } catch (_s) {}
    return { status: 'RETRY', runId: live.runId, attempts: live.attempts, lastError: reason };
  } finally { if (lock && locked) { try { lock.release(); } catch (_r) {} } }
}

// ---- PRODUCTION adapters (Apps Script globals; not exercised by the Node suites) -------------------------------
function oapScriptProps_() {
  var sp = PropertiesService.getScriptProperties();
  return { get: function (k) { return sp.getProperty(k); }, set: function (k, v) { sp.setProperty(k, v); },
    del: function (k) { sp.deleteProperty(k); }, keys: function () { return sp.getKeys() || []; } };
}
function oapScriptLock_() {
  var l = null; try { l = LockService.getScriptLock(); } catch (e) { l = null; }
  return { acquire: function (ms) { try { return l ? l.tryLock(ms) : true; } catch (e) { return false; } },
    release: function () { try { if (l) l.releaseLock(); } catch (e) {} } };
}
function oapTimestamp_() { try { return Utilities.formatDate(new Date(), OAP_TZ_, 'yyyy-MM-dd HH:mm:ss'); } catch (e) { return ''; } }
// Trigger deletion uses the SAME safe provenance pattern 46_ established: never delete the handle returned by
// create(); always re-read getProjectTriggers() and delete the object obtained from THAT read, matched on the
// EXACT handler. Bounded to OAP_CONTINUATION_HANDLER_, so a Gap job trigger can never be collected by this module
// (and gapJobDeleteTriggersByHandler_ is likewise bounded to its own handlers, so ours is safe from it).
function oapScheduleContinuation_(ms) {
  ScriptApp.newTrigger(OAP_CONTINUATION_HANDLER_).timeBased().after(Math.max(1, ms || OAP_CONTINUATION_DELAY_MS_)).create();
}
function oapClearContinuationTriggers_() {
  var all = ScriptApp.getProjectTriggers() || [], removed = 0;
  for (var i = 0; i < all.length; i++) {
    var t = all[i];
    try { if (t.getHandlerFunction() === OAP_CONTINUATION_HANDLER_) { ScriptApp.deleteTrigger(t); removed++; } } catch (e) {}
  }
  return removed;
}
function oapDefaultEnv_() {
  return {
    props: oapScriptProps_(),
    lock: oapScriptLock_(),
    timestamp: oapTimestamp_,
    nowMs: function () { return new Date().getTime(); },
    newRunId: function () { return 'OAP-' + oapTimestamp_().replace(/[^0-9]/g, '') + '-' + Math.floor(Math.random() * 1e6); },
    openTarget: function () { return gapMaterializationDefaultIo_().openTarget(); },
    enumerateScopes: function (ss) { return gapEnumerateScopes_(ss); },
    // The materialization io, built on the job's frozen calc context — the SAME io the slice processor uses, so
    // the demand the Preview reads is the demand materialization would read.
    workspaceIo: function (state) {
      var ctx = gapCalcResolveContext_('ORDER_PLANNING');
      var calcContext = { ok: true, jobType: 'ORDER_PLANNING', calculationDate: ctx.calculationDate,
        calculationMonth: ctx.calculationMonth, planningCycle: ctx.planningCycle, timezone: OAP_TZ_ };
      var io = gapMaterializationDefaultIo_(calcContext);
      return io;
    },
    scheduleContinuation: oapScheduleContinuation_,
    clearContinuationTriggers: oapClearContinuationTriggers_
  };
}
// The one-off continuation trigger target. Named so it can never collide with a Gap job handler.
function continueOverseasAllocationPreviewJob() {
  if (!oapEnabled_()) return;                                     // staged OFF ⇒ a stray trigger does nothing
  oapJobContinue_(oapDefaultEnv_());
}

// ---- ROUTER handlers — the gate is checked FIRST, before env, DB, state or trigger -----------------------------
function handleStartOverseasAllocationPreviewJob_(body) {
  if (!oapEnabled_()) return oapDisabled_();
  var p = (body && body.payload) || body || {};
  var scope = p.scope || p;
  return oapJobStart_(oapDefaultEnv_(), { company: scope.company, country: scope.country, masterSku: scope.masterSku || scope.sku });
}
function handleGetOverseasAllocationPreviewJobStatus_(body) {
  if (!oapEnabled_()) return oapDisabled_();
  var p = (body && body.payload) || body || {};
  return oapJobStatus_(oapDefaultEnv_(), p.runId || null);
}
function handleGetOverseasAllocationPreviewResult_(body) {
  if (!oapEnabled_()) return oapDisabled_();
  var p = (body && body.payload) || body || {};
  return oapResultGet_(oapDefaultEnv_(), p.runId || null);
}
function handleCancelOverseasAllocationPreviewJob_(body) {
  if (!oapEnabled_()) return oapDisabled_();
  var p = (body && body.payload) || body || {};
  return oapJobCancel_(oapDefaultEnv_(), p.runId || null);
}
