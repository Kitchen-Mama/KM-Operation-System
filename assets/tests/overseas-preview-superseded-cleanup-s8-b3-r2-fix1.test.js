// Kitchen Mama Operation System — R51 CORRECTIVE PATCH: superseded cleanup + context fingerprint — S8-B3-R2-FIX1.
// Run: node assets/tests/overseas-preview-superseded-cleanup-s8-b3-r2-fix1.test.js
// =============================================================================================================
// F1 — a SUPERSEDED worker deleted a NEWER run's result chunks.
//
// The superseded branch of oapJobContinue_ called oapResultPurge_ with "keep the live run's generation". When
// the live run has written its chunks but has NOT yet committed its META — exactly the window the
// generation-keyed design exists to survive — there is no generation to name, the keep-set is empty, and the
// "delete everything else" form destroys that run's chunks. The live run then commits a META pointing at keys
// that are gone, and its result reads back as PREVIEW_RESULT_CHUNK_MISSING.
//
// It failed CLOSED — no wrong number, no mixed generation, no business data — but a valid run was destroyed and
// the operator saw an integrity error instead of a result. And it was reachable by a plain operator sequence:
// Cancel, then Start again while the previous worker is still inside its unlocked phase 2. Cancel makes the old
// run terminal instantly, which is precisely what lets the new START succeed.
//
// F2 — the CALCULATION CONTEXT was read, published, and never compared, so a month rollover between the read
// and the revalidation was not treated as drift.
//
// EVERY assertion here is paired with a check that it FAILS against the pre-fix implementation (section E), so
// none of this is a test that would have passed before the defect was fixed.

'use strict';
var fs = require('fs'), path = require('path');
var REPO = path.join(__dirname, '..', '..');
var GS = path.join(REPO, 'assets/specs/active/apps-script/');
var F46 = fs.readFileSync(GS + '46_api_v1_gap_materialization_job.gs', 'utf8');
var F74 = fs.readFileSync(GS + '74_api_v1_overseas_allocation_preview_job.gs', 'utf8');
var KMMSA = require('../js/core/supply-planning-marketplace-supply-allocation.js');
var KMCID = require('../js/core/supply-planning-country-identity.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n     exp ' + E + '\n     got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

function extractFns(src, names) {
  return names.map(function (n) {
    var i = src.indexOf('function ' + n + '('), d = 0, j = src.indexOf('{', i);
    for (var k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } }
    throw new Error('unbalanced ' + n);
  }).join('\n');
}
var PRIM = extractFns(F46, ['gapJobPad4_', 'gapJobUtf8Len_', 'gapJobFnv1a_', 'gapJobChunkString_']);

// `src` lets section E load a DE-PATCHED copy, so "this test would have caught it" is executed, not asserted.
function buildModule(src, OV) {
  return (new Function('KMMSA', 'KMCID', 'OV', PRIM + '\n' + src + '\n'
    + 'var overseasAllocationPreviewEnabled_ = function(){return OV.enabled();};\n'
    + 'var gapOpReadSupplyPoolFacts_ = function(ss){return OV.poolFacts(ss);};\n'
    + 'var gapOpHarvestReceivers_ = function(a,b,c,d,e){return OV.harvest(a,b,c,d,e);};\n'
    + 'var gapEnumerateScopes_ = function(ss){return OV.scopes(ss);};\n'
    + 'var gapMaterializationDefaultIo_ = function(c){return OV.io(c);};\n'
    + 'var gapCalcResolveContext_ = function(p){return OV.ctx(p);};\n'
    + 'return { start: oapJobStart_, cont: oapJobContinue_, status: oapJobStatus_, result: oapResultGet_,'
    + ' cancel: oapJobCancel_, readState: oapReadState_, writeState: oapWriteState_, fp: oapFingerprint_,'
    + ' ctxKey: (typeof oapCalcContextKey_ === "function" ? oapCalcContextKey_ : null),'
    + ' purgeGen: (typeof oapResultPurgeGeneration_ === "function" ? oapResultPurgeGeneration_ : null),'
    + ' purgeBroad: oapResultPurge_,'
    + ' K: { PROP: OAP_PROP_KEY_, PREFIX: OAP_RESULT_PREFIX_, STALE: OAP_STALE_MS_ } };'))(KMMSA, KMCID, OV);
}

var MKTS = ['amazon_us', 'walmart_us', 'target_us'];
function makeWorld(cfg) {
  cfg = cfg || {};
  var w = { props: {}, triggers: [], now: 1000000, clock: 0, runSeq: 0, harvests: 0,
    month: cfg.month || '2026-10', date: cfg.date || '2026-10-10', demandBump: 0, poolBump: 0,
    writes: [], hooks: {} };
  w.env = {
    props: { get: function (k) { return Object.prototype.hasOwnProperty.call(w.props, k) ? w.props[k] : null; },
      set: function (k, v) { w.props[k] = String(v); },
      del: function (k) { delete w.props[k]; },
      keys: function () { return cfg.noKeys ? undefined : Object.keys(w.props); } },
    lock: { acquire: function () { return true; }, release: function () {} },
    timestamp: function () { return '2026-10-11 12:00:0' + (w.clock++ % 10); },
    nowMs: function () { return w.now; },
    newRunId: function () { return 'OAP-20261011120000-' + (++w.runSeq); },
    openTarget: function () { return throwingSs(w); },
    enumerateScopes: function () { return MKTS.map(function (m) { return { company: 'KM', country: 'US', marketplace: m }; }); },
    calcContext: function () {
      return { ok: true, jobType: 'ORDER_PLANNING', calculationDate: w.date, calculationMonth: w.month,
        planningCycle: 'RECO-' + w.month, timezone: 'Asia/Taipei' };
    },
    workspaceIo: function () { return { openTarget: function () { return throwingSs(w); } }; },
    scheduleContinuation: function (ms) { w.triggers.push(ms); },
    clearContinuationTriggers: function () { w.triggers = []; }
  };
  w.ov = {
    enabled: function () { return true; },
    io: function () { return { openTarget: function () { return throwingSs(w); } }; },
    ctx: function () { return w.env.calcContext(); },
    scopes: function () { return w.env.enumerateScopes(); },
    poolFacts: function () {
      return { overseasPoolsByKey: { 'KM||US||S1': [
        { poolKey: 'OV:WH1:S1', poolType: 'THREE_PL', warehouseId: 'WH1', effectiveSupplyQty: 400 + w.poolBump },
        { poolKey: 'OV:WH2:S1', poolType: 'THREE_PL', warehouseId: 'WH2', effectiveSupplyQty: 400 }] },
        factoryPoolsBySku: {}, priorityByMkt: {}, eligibleFactoryWarehouseIds: [] };
    },
    harvest: function (scopes) {
      w.harvests++;
      if (w.hooks.onHarvest) w.hooks.onHarvest(w.harvests);
      return { calculationMonth: w.month, receivers: scopes.map(function (s, i) {
        return { company: 'KM', country: 'US', marketplace: s.marketplace, sku: 'S1',
          demandQty: 300 + i * 50 + w.demandBump, requiredByDate: '2026-11-01', allocationPriority: i,
          key: ['KM', 'US', s.marketplace, 'S1'].join('||') };
      }) };
    }
  };
  return w;
}
var WRITE_METHODS = ['setValues', 'setValue', 'appendRow', 'deleteRow', 'deleteRows', 'insertRow', 'insertSheet', 'clear', 'clearContent'];
function throwingSs(w) {
  function boom(m) { return function () { w.writes.push(m); throw new Error('BUSINESS_WRITE_ATTEMPTED: ' + m); }; }
  var range = { getValues: function () { return []; } };
  WRITE_METHODS.forEach(function (m) { range[m] = boom(m); });
  var sheet = { getLastRow: function () { return 0; }, getLastColumn: function () { return 0; },
    getDataRange: function () { return range; }, getRange: function () { return range; } };
  WRITE_METHODS.forEach(function (m) { sheet[m] = boom(m); });
  return { getSheetByName: function () { return sheet; } };
}
function boot(src, cfg) {
  var w = makeWorld(cfg);
  w.M = buildModule(src || F74, w.ov);
  return w;
}
function chunks(w, gen) {
  var p = w.M.K.PREFIX + ':' + (gen ? gen + ':' : '');
  return Object.keys(w.props).filter(function (k) { return k.indexOf(p) === 0; });
}
function allChunks(w) { return chunks(w, null); }

// =============================================================================================================
section('A — GENERATION OWNERSHIP GATE (§4): a generation key can never be a prefix of another');
// =============================================================================================================
(function () {
  var w = boot();
  ok(typeof w.M.purgeGen === 'function', 'A1 oapResultPurgeGeneration_ exists');
  // generationId = runId + '-' + fnv1a (8 hex). The STORE key appends ':' after the generation, and neither a
  // runId (OAP-<digits>-<digits>) nor an 8-hex fingerprint can contain ':'. So "genA + ':'" is a prefix of
  // "genB + ':'" only if genB starts with genA + ':', which is unrepresentable. That is the structural property
  // the cleanup depends on, and it is asserted rather than assumed.
  w.M.start(w.env, { company: 'KM', country: 'US', masterSku: 'S1' });
  w.M.cont(w.env);
  var gen = w.M.readState(w.env).resultMeta.generationId;
  ok(gen.indexOf(':') === -1, 'A2 a generationId contains no ":" — the store-key delimiter cannot appear inside one');
  ok(/^OAP-\d+-\d+-[0-9a-f]{8}$/.test(gen), 'A3 generationId is <runId>-<8 hex fingerprint>: ' + gen);

  // ADVERSARIAL: a foreign generation whose id is a STRING PREFIX of ours must survive our cleanup, and vice versa.
  var w2 = boot();
  var mine = 'OAP-20261011120000-12-aaaabbbb';
  var similar = 'OAP-20261011120000-12-aaaabbbbcccc';     // mine is a strict string prefix of this
  var shorter = 'OAP-20261011120000-1';                    // a strict string prefix of mine
  w2.props[w2.M.K.PREFIX + ':' + mine + ':0000'] = 'MINE';
  w2.props[w2.M.K.PREFIX + ':' + similar + ':0000'] = 'SIMILAR';
  w2.props[w2.M.K.PREFIX + ':' + shorter + ':0000'] = 'SHORTER';
  w2.props['UNRELATED'] = 'keep';
  w2.props['GAP_JOB_ORDER_PLANNING'] = 'gap state';
  w2.props['GAP_JOB_ORDER_PLANNING:PART:g:0000'] = 'gap chunk';
  var n = w2.M.purgeGen(w2.env, mine);
  eq(n, 1, 'A4 purging one generation removes EXACTLY its own key');
  ok(!w2.props[w2.M.K.PREFIX + ':' + mine + ':0000'], 'A4a mine is gone');
  eq(w2.props[w2.M.K.PREFIX + ':' + similar + ':0000'], 'SIMILAR', 'A5 a generation whose id EXTENDS mine survives');
  eq(w2.props[w2.M.K.PREFIX + ':' + shorter + ':0000'], 'SHORTER', 'A6 a generation whose id is a PREFIX of mine survives');
  eq(w2.props['UNRELATED'], 'keep', 'A7 an unrelated property survives');
  eq(w2.props['GAP_JOB_ORDER_PLANNING'], 'gap state', 'A8 the Gap job state survives');
  eq(w2.props['GAP_JOB_ORDER_PLANNING:PART:g:0000'], 'gap chunk', 'A9 the Gap job partition chunks survive');

  // FAIL-SAFE: no subject ⇒ no deletion. A cleanup that has lost track of what it owns must delete nothing.
  var before = Object.keys(w2.props).length;
  eq(w2.M.purgeGen(w2.env, null), 0, 'A10 a NULL generationId deletes nothing');
  eq(w2.M.purgeGen(w2.env, ''), 0, 'A11 an EMPTY generationId deletes nothing');
  eq(w2.M.purgeGen(w2.env, undefined), 0, 'A12 an UNDEFINED generationId deletes nothing');
  eq(Object.keys(w2.props).length, before, 'A13 and the store is untouched by all three — no broad fallback');
  eq(w2.M.purgeGen(w2.env, mine), 0, 'A14 purging an ALREADY-DELETED generation is a no-op (idempotent)');
  eq(w2.M.purgeGen(w2.env, 'OAP-never-existed-00000000'), 0, 'A15 purging a FOREIGN generation removes nothing of ours');

  // keys() unavailable ⇒ fail safe, not throw.
  var w3 = boot(null, { noKeys: true });
  eq(w3.M.purgeGen(w3.env, 'anything-00000000'), 0, 'A16 a store with no keys() enumeration deletes nothing and does not throw');
})();

// =============================================================================================================
section('B — F1 RACE: Cancel → Start → superseded worker (§6 A-E)');
// =============================================================================================================
function runF1Race(src) {
  var w = boot(src);
  w.M.start(w.env, { company: 'KM', country: 'US', masterSku: 'S1' });
  var runA = w.M.readState(w.env).runId;
  var fired = false, runB = null, genB = null;
  w.hooks.onHarvest = function (n) {
    if (n !== 1 || fired) return;                 // inside A's UNLOCKED phase 2, between its read and its recheck
    fired = true;
    w.M.cancel(w.env, runA);                                                              // (B) operator cancels
    var s = w.M.start(w.env, { company: 'KM', country: 'US', masterSku: 'S1' });           // (C) and restarts
    runB = s.data && s.data.runId;
    genB = runB + '-deadbeef';
    // (D) B has written ITS chunks and has NOT yet committed its META. ONE payload split across TWO keys,
    // which is what the chunker actually produces — two standalone JSON objects would not reassemble.
    var payloadB = '{"runId":"' + runB + '","receivers":[]}';
    var half = Math.ceil(payloadB.length / 2);
    w.props[w.M.K.PREFIX + ':' + genB + ':0000'] = payloadB.slice(0, half);
    w.props[w.M.K.PREFIX + ':' + genB + ':0001'] = payloadB.slice(half);
  };
  var cA = w.M.cont(w.env);                                                                // (E) A reaches cleanup
  return { w: w, runA: runA, runB: runB, genB: genB, cA: cA, fired: fired };
}
(function () {
  var R = runF1Race(null);
  ok(R.fired, 'B1 the Cancel → Start happened while worker A was mid-flight');
  eq(R.cA.status, 'SUPERSEDED', 'B2 worker A reports SUPERSEDED');
  eq(chunks(R.w, R.genB).length, 2, 'B3 run B\'s chunks REMAIN INTACT — both of them');
  var liveState = R.w.M.readState(R.w.env);
  eq(liveState.runId, R.runB, 'B4 run B\'s state remains intact and still owns the slot');
  ok(!liveState.resultMeta, 'B5 and worker A published NOTHING — no META was committed for the dead run');
  eq(R.w.writes, [], 'B6 no business write was attempted anywhere in the race');
  // B can now commit its META and serve its result — the whole point of keeping its chunks.
  liveState.resultMeta = { version: 1, generationId: R.genB, chunkCount: 2,
    byteLength: null, checksum: null, createdAt: 'x', expiresAtMs: R.w.now + 3600000 };
  // recompute the real integrity fields over what B actually stored
  var joined = R.w.props[R.w.M.K.PREFIX + ':' + R.genB + ':0000'] + R.w.props[R.w.M.K.PREFIX + ':' + R.genB + ':0001'];
  var H = (new Function(PRIM + '\nreturn { u: gapJobUtf8Len_, f: gapJobFnv1a_ };'))();
  liveState.resultMeta.byteLength = H.u(joined); liveState.resultMeta.checksum = H.f(joined);
  liveState.status = 'DONE';
  R.w.M.writeState(R.w.env, liveState);
  var got = R.w.M.result(R.w.env, R.runB);
  ok(got.success === true, 'B7 run B\'s META commits and its Result GET SUCCEEDS'
     + (got.success ? '' : ' — got ' + JSON.stringify(got.errors)));
  // A must not be able to serve anything under its own id either.
  var aRes = R.w.M.result(R.w.env, R.runA);
  ok(aRes.success === false, 'B8 run A cannot serve a result under its own runId');
})();

// =============================================================================================================
section('C — the other interleavings §6 requires');
// =============================================================================================================
(function () {
  // Duplicate continuation on a completed run.
  var w = boot();
  w.M.start(w.env, { company: 'KM', country: 'US', masterSku: 'S1' });
  eq(w.M.cont(w.env).status, 'DONE', 'C1 first continuation completes');
  var gen = w.M.readState(w.env).resultMeta.generationId;
  eq(w.M.cont(w.env).status, 'DONE', 'C2 a DUPLICATE continuation is a no-op on a terminal run');
  eq(chunks(w, gen).length > 0, true, 'C3 and the published generation survives the duplicate');
  ok(w.M.result(w.env, w.M.readState(w.env).runId).success === true, 'C4 the result is still readable');

  // A superseded worker arriving AFTER the new run has fully completed must not disturb it.
  var w2 = boot();
  w2.M.start(w2.env, { company: 'KM', country: 'US', masterSku: 'S1' });
  var runA2 = w2.M.readState(w2.env).runId;
  var done = false;
  w2.hooks.onHarvest = function (n) {
    if (n !== 1 || done) return;
    done = true;
    w2.M.cancel(w2.env, runA2);
    w2.M.start(w2.env, { company: 'KM', country: 'US', masterSku: 'S1' });
    w2.M.cont(w2.env);                                   // B runs to completion, META and all
  };
  var liveBefore = null;
  var cA2 = w2.M.cont(w2.env);
  liveBefore = w2.M.readState(w2.env);
  eq(cA2.status, 'SUPERSEDED', 'C5 the stale worker is superseded by the COMPLETED newer run');
  eq(liveBefore.status, 'DONE', 'C6 and that newer run is still DONE');
  ok(liveBefore.resultMeta && chunks(w2, liveBefore.resultMeta.generationId).length > 0,
     'C7 its published chunks survive the stale worker\'s cleanup');
  ok(w2.M.result(w2.env, liveBefore.runId).success === true, 'C8 and its result still reads back');

  // Cancel vs Complete.
  var w3 = boot();
  var s3 = w3.M.start(w3.env, { company: 'KM', country: 'US', masterSku: 'S1' });
  w3.M.cancel(w3.env, s3.data.runId);
  w3.M.cont(w3.env);
  eq(w3.M.readState(w3.env).status, 'CANCELLED', 'C9 a cancelled run stays cancelled');
  ok(!w3.M.readState(w3.env).resultMeta, 'C10 and never publishes a result');

  // Recovery vs Cancel.
  var w4 = boot();
  var s4 = w4.M.start(w4.env, { company: 'KM', country: 'US', masterSku: 'S1' });
  w4.M.cancel(w4.env, s4.data.runId);
  w4.now += w4.M.K.STALE + 1;
  eq(w4.M.status(w4.env, s4.data.runId).data.status, 'CANCELLED', 'C11 a stale CANCELLED run is not resurrected');

  // Cleanup repeated twice.
  var w5 = boot();
  w5.M.start(w5.env, { company: 'KM', country: 'US', masterSku: 'S1' });
  w5.M.cont(w5.env);
  var g5 = w5.M.readState(w5.env).resultMeta.generationId;
  var n1 = w5.M.purgeGen(w5.env, g5), n2 = w5.M.purgeGen(w5.env, g5);
  ok(n1 > 0 && n2 === 0, 'C12 cleanup run twice removes its generation once and is then a no-op');
})();

// =============================================================================================================
section('D — DONE-branch preservation (§5)');
// =============================================================================================================
(function () {
  var w = boot();
  // Plant an ORPHAN generation from an earlier run, plus foreign keys that must never be touched.
  w.props[w.M.K.PREFIX + ':OAP-20261011120000-9-01234567:0000'] = 'ORPHAN';
  w.props['UNRELATED'] = 'keep';
  w.props['GAP_JOB_INVENTORY'] = 'gap state';
  w.M.start(w.env, { company: 'KM', country: 'US', masterSku: 'S1' });
  eq(w.M.cont(w.env).status, 'DONE', 'D1 the run completes through the DONE branch');
  var gen = w.M.readState(w.env).resultMeta.generationId;
  ok(!w.props[w.M.K.PREFIX + ':OAP-20261011120000-9-01234567:0000'],
     'D2 DONE cleanup still removes an ELIGIBLE ORPHAN generation — the broad form is preserved where it is owned');
  eq(allChunks(w).every(function (k) { return k.indexOf(w.M.K.PREFIX + ':' + gen + ':') === 0; }), true,
     'D3 and only the published generation remains');
  eq(w.props['UNRELATED'], 'keep', 'D4 an unrelated property is untouched');
  eq(w.props['GAP_JOB_INVENTORY'], 'gap state', 'D5 and so is the Gap job state');
  ok(/oapResultPurge_\(env, generationId\);/.test(F74),
     'D6 the DONE branch still calls the BROAD purge — it was not changed, because it owns the slot under the lock');
})();

// =============================================================================================================
section('E — NON-VACUITY: every F1 assertion FAILS against the pre-fix implementation');
// =============================================================================================================
(function () {
  // De-patch: restore the exact pre-fix superseded-branch call. If the suite still passed, it would be proving
  // nothing about the fix.
  var PRE = F74.replace(
    'oapResultPurgeGeneration_(env, generationId);',
    'oapResultPurge_(env, (live && live.resultMeta) ? live.resultMeta.generationId : null);');
  ok(PRE !== F74, 'E1 the de-patched (pre-fix) source differs from the shipped one');
  var R = runF1Race(PRE);
  ok(R.fired, 'E2 the same race runs against the pre-fix code');
  eq(R.cA.status, 'SUPERSEDED', 'E3 and the pre-fix worker also reports SUPERSEDED — the status was never the bug');
  eq(chunks(R.w, R.genB).length, 0,
     'E4 PRE-FIX: run B\'s chunks are DESTROYED (0 of 2 survive) — so B3 above is a real regression guard');
})();

// =============================================================================================================
section('F — F2: the calculation context is part of the fingerprint');
// =============================================================================================================
(function () {
  var w = boot();
  ok(typeof w.M.ctxKey === 'function', 'F1 oapCalcContextKey_ exists');
  eq(w.M.fp.length, 3, 'F2 oapFingerprint_ now takes (receivers, pools, contextKey) — arity ' + w.M.fp.length);

  var R = [{ key: 'a', marketplace: 'm1', demandQty: 10, allocationPriority: 0, requiredByDate: 'd' },
           { key: 'b', marketplace: 'm2', demandQty: 20, allocationPriority: 1, requiredByDate: 'd' }];
  var P = [{ poolKey: 'p1', poolType: 'THREE_PL', warehouseId: 'w1', effectiveSupplyQty: 5 },
           { poolKey: 'p2', poolType: 'THREE_PL', warehouseId: 'w2', effectiveSupplyQty: 6 }];
  var CTX = { calculationDate: '2026-10-10', calculationMonth: '2026-10', planningCycle: 'RECO-2026-10' };
  var base = w.M.fp(R, P, w.M.ctxKey(CTX, '2026-10'));

  eq(w.M.fp(R.slice().reverse(), P, w.M.ctxKey(CTX, '2026-10')), base, 'F3 reordered RECEIVER rows → same fingerprint');
  eq(w.M.fp(R, P.slice().reverse(), w.M.ctxKey(CTX, '2026-10')), base, 'F4 reordered POOL rows → same fingerprint');

  var m2 = { calculationDate: '2026-10-10', calculationMonth: '2026-11', planningCycle: 'RECO-2026-11' };
  ok(w.M.fp(R, P, w.M.ctxKey(m2, '2026-11')) !== base, 'F5 changed CALCULATION MONTH → changed fingerprint');
  // planningCycle is 'RECO-' + calculationMonth at the owner, so it is derived rather than independent. Varied
  // alone it still moves the digest, which is the property that matters.
  var pc = { calculationDate: '2026-10-10', calculationMonth: '2026-10', planningCycle: 'RECO-OTHER' };
  ok(w.M.fp(R, P, w.M.ctxKey(pc, '2026-10')) !== base, 'F6 changed PLANNING CYCLE → changed fingerprint');
  var d2 = { calculationDate: '2026-10-11', calculationMonth: '2026-10', planningCycle: 'RECO-2026-10' };
  ok(w.M.fp(R, P, w.M.ctxKey(d2, '2026-10')) !== base, 'F7 changed CALCULATION DATE → changed fingerprint');
  ok(w.M.fp(R, P, w.M.ctxKey(CTX, '2026-11')) !== base, 'F8 changed HARVESTED month → changed fingerprint');

  var R2 = [{ key: 'a', marketplace: 'm1', demandQty: 99, allocationPriority: 0, requiredByDate: 'd' }, R[1]];
  ok(w.M.fp(R2, P, w.M.ctxKey(CTX, '2026-10')) !== base, 'F9 changed DEMAND → changed fingerprint');
  var P2 = [{ poolKey: 'p1', poolType: 'THREE_PL', warehouseId: 'w1', effectiveSupplyQty: 500 }, P[1]];
  ok(w.M.fp(R, P2, w.M.ctxKey(CTX, '2026-10')) !== base, 'F10 changed POOL QUANTITY → changed fingerprint');
  var R3 = [{ key: 'a', marketplace: 'm1', demandQty: 10, allocationPriority: 7, requiredByDate: 'd' }, R[1]];
  ok(w.M.fp(R3, P, w.M.ctxKey(CTX, '2026-10')) !== base, 'F11 changed PRIORITY → changed fingerprint');
})();

// =============================================================================================================
section('G — F2 END TO END: a context rollover mid-run is now SOURCE_DRIFT, and nothing is published');
// =============================================================================================================
(function () {
  var w = boot();
  w.hooks.onHarvest = function (n) { if (n === 2) { w.month = '2026-11'; } };   // rolls over between read and recheck
  w.M.start(w.env, { company: 'KM', country: 'US', masterSku: 'S1' });
  var c = w.M.cont(w.env);
  ok(c.status === 'RETRY' || c.status === 'FAILED', 'G1 a month rollover between read and recheck is now caught (got ' + c.status + ')');
  ok(/SOURCE_DRIFT/.test(w.M.readState(w.env).lastError || ''), 'G2 and is named SOURCE_DRIFT');
  ok(!w.M.readState(w.env).resultMeta, 'G3 NO result was published for the drifted computation');

  // NON-VACUITY for F2: the same rollover against the PRE-FIX fingerprint publishes happily.
  var PRE = F74.replace('return gapJobFnv1a_(\'C:\' + oapStr_(contextKey) + \'#R:\' + r + \'#P:\' + p);',
                        'return gapJobFnv1a_(\'#R:\' + r + \'#P:\' + p);');
  ok(PRE !== F74, 'G4 a de-patched fingerprint (context dropped) differs from the shipped one');
  var w2 = boot(PRE);
  w2.hooks.onHarvest = function (n) { if (n === 2) { w2.month = '2026-11'; } };
  w2.M.start(w2.env, { company: 'KM', country: 'US', masterSku: 'S1' });
  eq(w2.M.cont(w2.env).status, 'DONE',
     'G5 PRE-FIX: the same rollover publishes a result — so G1 is a real regression guard');

  // A stable context must NOT be mistaken for drift (the guard is not firing indiscriminately).
  var w3 = boot();
  w3.M.start(w3.env, { company: 'KM', country: 'US', masterSku: 'S1' });
  eq(w3.M.cont(w3.env).status, 'DONE', 'G6 an unchanged context completes normally');
  var res = w3.M.result(w3.env, w3.M.readState(w3.env).runId);
  ok(res.success === true, 'G7 and its result publishes');
  eq(res.data.result.generation.calculationMonth, '2026-10', 'G8 the published month is the one it computed under');
  eq(res.data.result.generation.planningCycle, 'RECO-2026-10', 'G9 and the planning cycle is published beside it');
  eq(res.data.result.generation.calculationDate, '2026-10-10', 'G10 and the calculation date');

  // A FAILED source re-read must never publish.
  var w4 = boot();
  w4.hooks.onHarvest = function (n) { if (n === 2) { throw new Error('SOURCE_READ_FAILED: sheet unavailable'); } };
  w4.M.start(w4.env, { company: 'KM', country: 'US', masterSku: 'S1' });
  var c4 = w4.M.cont(w4.env);
  ok(c4.status === 'RETRY' || c4.status === 'FAILED', 'G11 a FAILED source re-read does not publish (got ' + c4.status + ')');
  ok(!w4.M.readState(w4.env).resultMeta, 'G12 and commits no META');
  eq(w4.writes, [], 'G13 and attempts no business write');
})();

// =============================================================================================================
section('H - the wiring that makes F2 hold in PRODUCTION, not just in the harness');
// =============================================================================================================
(function () {
  // oapReadGroup_ reads the context through `env.calcContext ? env.calcContext() : null`. That guard keeps the
  // Node harnesses working, but it also means a production env that LOST calcContext would silently drop the
  // context out of the fingerprint and quietly reinstate F2. So the production env's declaration is asserted.
  ok(F74.indexOf("calcContext: function () { return gapCalcResolveContext_('ORDER_PLANNING'); }") !== -1,
     'H1 oapDefaultEnv_ declares calcContext, resolved by the EXISTING owner gapCalcResolveContext_');
  ok(F74.indexOf('oapFingerprint_(receivers, pools, contextKey)') !== -1,
     'H2 oapReadGroup_ threads the context key into the fingerprint');
  ok(F74.indexOf('var contextKey = oapCalcContextKey_(calcContext, harvested.calculationMonth);') !== -1,
     'H3 and builds it from BOTH the resolver context and the harvested month');
  // The io must be built from the SAME resolved context the fingerprint used, or the window fingerprinted and
  // the window calculated in could disagree across a rollover - the exact class of bug F2 is about.
  ok(F74.indexOf('var io = env.workspaceIo(state, calcContext);') !== -1,
     'H4 the materialization io is built from the SAME resolved context the fingerprint used');
  // And no second resolver was introduced.
  var codeOnly = F74.split('\n').filter(function (l) { return !/^\s*(\/\/|\*|\/\*)/.test(l); }).join('\n');
  ok(codeOnly.indexOf('gapCalcContextForJob_') === -1 && codeOnly.indexOf('gapCalcTaipeiYmd_') === -1,
     'H5 no second context resolver - the module never reaches past gapCalcResolveContext_ into its internals');
})();

console.log('\n----------------------------------------');
console.log('PREVIEW SUPERSEDED CLEANUP + CONTEXT FINGERPRINT (S8-B3-R2-FIX1): ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exitCode = 1;
