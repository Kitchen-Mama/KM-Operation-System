// Kitchen Mama Operation System — F1-4B-FM6-R4E2-B2 Resumable Scope Request-Order Draft Generation Job.
// Run: node assets/tests/request-order-draft-job-f1-4b-fm6r4e2b2.test.js
// -----------------------------------------------------------------------------
// Proves the request-driven resumable job orchestrates the EXISTING R4E2 per-SKU authority into one logical
// scope-wide job with NO browser fan-out, NO trigger/scheduler, NO second persister, NO gap recompute:
//   lifecycle fixtures A–J (multi-continuation, interruption/resume, lease, manual-edit needsConfirmation, blocked,
//   gap-change fail-closed, 93-SKU multi-slice, cancel, state-size gate, gap-not-ready) driven through an injected
//   env; the PURE eligible-SKU enumeration + scope read-back assembly (47_) evaluated directly; and source-scans
//   asserting the negative constraints (no triggers/allocation/second-persister/frontend/schema change).
// NOTE: no top-level 'use strict' — the PURE blocks are eval'd into module scope (strict eval would sandbox them).

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function slice(src, m1, m2) { var a = src.indexOf(m1), b = src.indexOf(m2); if (a < 0 || b < 0) throw new Error('markers not found: ' + m1); return src.slice(a, b); }

var GS47 = read('specs/active/apps-script/47_api_v1_recommendation_generation.gs');
var GS48 = read('specs/active/apps-script/48_api_v1_request_order_draft_job.gs');
var GS_ROUTER = read('specs/active/apps-script/01_router.gs');
var GS24 = read('specs/active/apps-script/24_recommendation_orchestrator.gs');

// ---- eval the pure 47_ block + the whole 48_ module (production env references only resolve when CALLED) ----
eval(slice(GS47, '// __GAPDRAFT_PURE_START__', '// __GAPDRAFT_PURE_END__'));
eval(GS48);
ok(typeof reqDraftJobStart_ === 'function' && typeof reqDraftJobContinue_ === 'function', 'X1 48_ job lifecycle eval OK');
ok(typeof recGenEnumerateEligibleGapRows_ === 'function' && typeof recGenBuildScopeReadback_ === 'function', 'X2 47_ pure helpers eval OK');

// ---- fake env factory (mirrors 46_ test injection) ----
function makeEnv(cfg) {
  cfg = cfg || {};
  var store = {};
  var clock = { ms: (cfg.startMs || 1000) };
  var tok = { n: 0 };
  var lockHeld = { v: false };
  var calls = { gen: {}, genOrder: [] };   // per-SKU generate call counts + order
  var env = {
    props: { get: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; }, set: function (k, v) { store[k] = v; }, del: function (k) { delete store[k]; } },
    lock: { acquire: function () { if (lockHeld.v) return false; lockHeld.v = true; return true; }, release: function () { lockHeld.v = false; } },
    timestamp: function () { return 'T' + clock.ms; },
    nowMs: function () { return clock.ms; },
    token: function () { tok.n++; return 'tok' + tok.n; },
    newRunId: function (scope) { return cfg.runId || ('RUN-' + reqDraftJobScopeKey_(scope)); },
    envelope: function (okv, data, code, msg) { return okv ? { success: true, data: data, errors: [] } : { success: false, data: null, errors: [{ code: code, message: msg }] }; },
    readGapBinding: function () { return cfg.gapBinding ? cfg.gapBinding() : { jobRunId: 'G1', jobStatus: 'DONE' }; },
    enumerateEligible: function () { return { skuList: (cfg.skuList || []).slice(), planningCycle: '2026-08' }; },
    readGapRowsMap: function () { return cfg.gapRowsMap || {}; },
    readUpcMap: function () { return cfg.upcMap || {}; },
    generateOneSku: function (scope, sku, gapRow, upc, opts) {
      calls.gen[sku] = (calls.gen[sku] || 0) + 1; calls.genOrder.push(sku);
      return (cfg.genFn || function () { return { sku: sku, status: 'CREATED', draftId: 'D-' + sku }; })(scope, sku, gapRow, upc, opts, calls);
    },
    maxSkusPerContinue: (cfg.maxSkus != null ? cfg.maxSkus : 25),
    workerBudgetMs: (cfg.budgetMs != null ? cfg.budgetMs : 120000)
  };
  env._store = store; env._clock = clock; env._calls = calls; env._lockHeld = lockHeld;
  return env;
}
var SCOPE = { company: 'KM', country: 'US', marketplace: 'AMAZON_US' };
function stateOf(env) { return JSON.parse(env._store[REQ_DRAFT_JOB_PROP_KEY_]); }
function runToDone(env, maxRounds) {
  var rounds = 0, last;
  do { last = reqDraftJobContinue_(env, null); rounds++; } while (last.data && last.data.hasMore && rounds < (maxRounds || 100));
  return { last: last, rounds: rounds };
}

// =============================================================================
section('Fixture A — 3-SKU scope job: START → CONTINUE → DONE (create/reuse mixed)');
(function () {
  var env = makeEnv({ skuList: ['S1', 'S2', 'S3'], genFn: function (sc, sku) { return { sku: sku, status: (sku === 'S2' ? 'REUSED' : 'CREATED'), draftId: 'D-' + sku }; } });
  var s = reqDraftJobStart_(env, SCOPE, {});
  eq([s.success, s.data.status, s.data.total], [true, 'RUNNING', 3], 'A1 START RUNNING total 3');
  var c = reqDraftJobContinue_(env, null);
  eq([c.data.status, c.data.cursor, c.data.processedThisRun, c.data.hasMore], ['DONE', 3, 3, false], 'A2 one CONTINUE processes all 3 → DONE');
  eq(c.data.counts, { created: 2, reused: 1, regenerated: 0, needsConfirmation: 0, blockedConflict: 0, notReady: 0, committedUnverified: 0, failed: 0 }, 'A3 truthful mixed counts');
})();

section('Fixture B — forced multi-continuation (maxSkus=2): cursor advances, resumes, no duplicate');
(function () {
  var env = makeEnv({ skuList: ['S1', 'S2', 'S3'], maxSkus: 2 });
  reqDraftJobStart_(env, SCOPE, {});
  var c1 = reqDraftJobContinue_(env, null);
  eq([c1.data.cursor, c1.data.processedThisRun, c1.data.hasMore], [2, 2, true], 'B1 first CONTINUE processes 2, hasMore');
  var c2 = reqDraftJobContinue_(env, null);
  eq([c2.data.status, c2.data.cursor, c2.data.processedThisRun, c2.data.hasMore], ['DONE', 3, 1, false], 'B2 second CONTINUE processes last 1 → DONE');
  eq(Object.keys(env._calls.gen).sort(), ['S1', 'S2', 'S3'], 'B3 every SKU generated exactly once (no duplicate)');
  ok(env._calls.gen.S1 === 1 && env._calls.gen.S2 === 1 && env._calls.gen.S3 === 1, 'B4 no SKU generated twice');
})();

section('Fixture C — interruption between continuations resumes at the next SKU (no reprocess)');
(function () {
  var env = makeEnv({ skuList: ['S1', 'S2', 'S3'], maxSkus: 1 });
  reqDraftJobStart_(env, SCOPE, {});
  reqDraftJobContinue_(env, null);                       // processes S1 only, cursor 1, lease released
  eq(stateOf(env).cursor, 1, 'C1 cursor checkpointed at 1 after S1');
  // "interruption" = the next continuation simply runs later; it must resume at S2
  reqDraftJobContinue_(env, null);                       // S2
  reqDraftJobContinue_(env, null);                       // S3 → DONE
  eq(env._calls.genOrder, ['S1', 'S2', 'S3'], 'C2 resumed in order, each once (S1 never reprocessed)');
  eq(stateOf(env).status, 'DONE', 'C3 DONE after resume');
})();

section('Fixture D — a second CONTINUE holding no lease sees a live lease → BUSY, does not process');
(function () {
  var env = makeEnv({ skuList: ['S1', 'S2'], maxSkus: 25 });
  reqDraftJobStart_(env, SCOPE, {});
  // simulate a concurrent continuation currently owning the lease (not expired)
  var st = stateOf(env); st.lease = { owner: 'other-worker', expiresAtMs: env._clock.ms + 100000 }; env._store[REQ_DRAFT_JOB_PROP_KEY_] = JSON.stringify(st);
  var c = reqDraftJobContinue_(env, null);
  eq([c.data.busy, c.data.cursor], [true, 0], 'D1 CONTINUE reports BUSY, cursor unchanged');
  eq(Object.keys(env._calls.gen).length, 0, 'D2 no SKU processed while another continuation holds the lease');
})();

section('Fixture E — manual-edit SKU records REGENERATE_NEEDS_CONFIRMATION, never auto-confirmed, others continue');
(function () {
  var sawConfirm = { v: null };
  var env = makeEnv({ skuList: ['S1', 'S2', 'S3'], genFn: function (sc, sku, gr, upc, opts) {
    if (sku === 'S1') sawConfirm.v = opts.confirmRegenerateOverUserEdits;   // capture what the job passed
    return sku === 'S2' ? { sku: sku, status: 'REGENERATE_NEEDS_CONFIRMATION', code: 'REGENERATE_NEEDS_CONFIRMATION' } : { sku: sku, status: 'CREATED', draftId: 'D-' + sku };
  } });
  reqDraftJobStart_(env, SCOPE, {});   // no confirmRegenerateOverUserEdits → defaults false
  var c = reqDraftJobContinue_(env, null);
  eq(c.data.counts.needsConfirmation, 1, 'E1 needsConfirmation recorded (S2)');
  eq(c.data.counts.created, 2, 'E2 other SKUs still created');
  eq([c.data.status, c.data.cursor], ['DONE', 3], 'E3 job completes despite a needs-confirmation SKU (no infinite retry)');
  eq(sawConfirm.v, false, 'E4 job NEVER auto-sends confirmRegenerateOverUserEdits=true');
})();

section('Fixture F — BLOCKED_CONFLICT on one SKU is truthful; A/C persist, job DONE');
(function () {
  var env = makeEnv({ skuList: ['S1', 'S2', 'S3'], genFn: function (sc, sku) {
    return sku === 'S2' ? { sku: sku, status: 'BLOCKED_CONFLICT', code: 'DUPLICATE_ACTIVE_DRAFT' } : { sku: sku, status: 'CREATED', draftId: 'D-' + sku };
  } });
  reqDraftJobStart_(env, SCOPE, {});
  var c = reqDraftJobContinue_(env, null);
  eq([c.data.counts.created, c.data.counts.blockedConflict, c.data.status], [2, 1, 'DONE'], 'F1 mixed outcome truthful; job DONE');
})();

section('Fixture G — gap generation changed mid-job → fail closed (no mixed generations)');
(function () {
  var gen = { runId: 'G1' };
  var env = makeEnv({ skuList: ['S1', 'S2', 'S3'], maxSkus: 1, gapBinding: function () { return { jobRunId: gen.runId, jobStatus: 'DONE' }; } });
  reqDraftJobStart_(env, SCOPE, {});
  reqDraftJobContinue_(env, null);            // S1 with G1
  gen.runId = 'G2';                            // a NEW gap materialization happened between continuations
  var c = reqDraftJobContinue_(env, null);
  eq([c.data.status, c.data.lastError], ['FAILED', 'GAP_GENERATION_CHANGED'], 'G1 CONTINUE fails closed when gap generation changed');
  eq(env._calls.gen.S2 || 0, 0, 'G2 no SKU from the new generation was persisted');
})();

section('Fixture H — 93-SKU scope: state fits, multiple continuations, eventually DONE');
(function () {
  var skus = []; for (var i = 1; i <= 93; i++) skus.push('CO' + (1000 + i) + '-R');
  var env = makeEnv({ skuList: skus, maxSkus: 25 });
  var s = reqDraftJobStart_(env, SCOPE, {});
  eq([s.success, s.data.total], [true, 93], 'H1 START snapshots 93 SKUs');
  ok(s.data.stateBytes < REQ_DRAFT_JOB_SAFE_BYTES_, 'H2 93-SKU state (' + s.data.stateBytes + ' bytes) is under the safe threshold ' + REQ_DRAFT_JOB_SAFE_BYTES_);
  var r = runToDone(env, 20);
  eq([r.last.data.status, r.last.data.cursor], ['DONE', 93], 'H3 DONE after multiple continuations');
  ok(r.rounds >= 4 && r.rounds <= 5, 'H4 ~4 continuations for 93 SKUs @25 (got ' + r.rounds + ')');
  eq(Object.keys(env._calls.gen).length, 93, 'H5 all 93 SKUs processed exactly once');
})();

section('§4 — state-size gate: a scope too large for one Script Property fails closed at START');
(function () {
  var skus = []; for (var i = 0; i < 4000; i++) skus.push('SKU-CODE-' + i);
  var env = makeEnv({ skuList: skus });
  var s = reqDraftJobStart_(env, SCOPE, {});
  eq([s.success, s.errors[0].code], [false, 'REQUEST_ORDER_DRAFT_JOB_STATE_LIMIT'], 'SZ1 oversized scope → REQUEST_ORDER_DRAFT_JOB_STATE_LIMIT (never a silent split)');
  ok(!env._store[REQ_DRAFT_JOB_PROP_KEY_], 'SZ2 no job state persisted when the size gate fails');
})();

section('START guards — empty scope + gap-not-ready fail closed; CANCEL is terminal + preserves');
(function () {
  var e1 = makeEnv({ skuList: [] });
  eq(reqDraftJobStart_(e1, SCOPE, {}).errors[0].code, 'REQUEST_ORDER_DRAFT_EMPTY_SCOPE', 'GRD1 empty eligible set → EMPTY_SCOPE');
  var e2 = makeEnv({ skuList: ['S1'], gapBinding: function () { return { jobRunId: 'G9', jobStatus: 'RUNNING' }; } });
  eq(reqDraftJobStart_(e2, SCOPE, {}).errors[0].code, 'ORDER_PLANNING_GAP_NOT_READY', 'GRD2 gap job RUNNING → GAP_NOT_READY');
  var e3 = makeEnv({ skuList: ['S1', 'S2'], maxSkus: 1 });
  reqDraftJobStart_(e3, SCOPE, {}); reqDraftJobContinue_(e3, null);   // process S1
  var cancel = reqDraftJobCancel_(e3, null);
  eq(cancel.data.status, 'CANCELLED', 'GRD3 CANCEL → terminal CANCELLED');
  var after = reqDraftJobContinue_(e3, null);
  eq([after.data.status, Object.keys(e3._calls.gen).length], ['CANCELLED', 1], 'GRD4 CONTINUE after CANCEL does nothing (S1 draft preserved; S2 never processed)');
})();

section('Fixture I — scope read-back classifies PERSISTED / NO_DRAFT / BLOCKED_CONFLICT; SKU→T1/T2/T3 sorted');
(function () {
  var scope = { company: 'KM', country: 'US', marketplace: 'AMAZON_US' };
  var headerRows = [
    { request_allocation_draft_id: 'DA', company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'A', status: 'draft', draft_version: 1 },
    { request_allocation_draft_id: 'DB1', company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'B', status: 'draft' },
    { request_allocation_draft_id: 'DB2', company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'B', status: 'site_confirmed' }  // conflict for B
  ];
  var lineRows = [
    { request_allocation_draft_id: 'DA', request_bucket: 'T2', request_month: '2026-09', recommended_qty: 3920, order_qty: 3600, calculated_gap_qty_snapshot: 3884, units_per_carton: 40, carton_qty: 98 },
    { request_allocation_draft_id: 'DA', request_bucket: 'T1', request_month: '2026-08', recommended_qty: 0, order_qty: 0, calculated_gap_qty_snapshot: 0, units_per_carton: 40, carton_qty: 0 },
    { request_allocation_draft_id: 'DA', request_bucket: 'T4', request_month: '2026-11', recommended_qty: 999 }   // T4 must be dropped
  ];
  var rb = recGenBuildScopeReadback_(headerRows, lineRows, ['A', 'B', 'C'], scope, '');
  eq(rb.drafts.length, 1, 'I1 one PERSISTED draft (A)');
  eq(rb.drafts[0].lines.map(function (l) { return l.request_bucket; }), ['T1', 'T2'], 'I2 lines sorted T1,T2 and T4 excluded');
  eq(rb.noDraftSkus, ['C'], 'I3 C has NO_DRAFT');
  eq(rb.conflicts.map(function (c) { return c.sku; }), ['B'], 'I4 B is BLOCKED_CONFLICT (>1 active)');
  eq([rb.drafts[0].lines[1].recommended_qty, rb.drafts[0].lines[1].order_qty], [3920, 3600], 'I5 recommended_qty + order_qty surfaced separately (read-only snapshot vs user qty)');
})();

section('Fixture J — enumeration = READY gap rows only, SKU ASC; recommended verbatim; no factory/formula');
(function () {
  var rows = [
    { company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'ZZ', calculation_status: 'READY' },
    { company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'AA', calculation_status: 'READY' },
    { company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'BLK', calculation_status: 'BLOCKED' },   // excluded
    { company: 'KM', country: 'CA', marketplace: 'AMAZON_CA', sku: 'OTHER', calculation_status: 'READY' }    // wrong scope
  ];
  var el = recGenEnumerateEligibleGapRows_(rows, { company: 'KM', country: 'US', marketplace: 'AMAZON_US' });
  eq(el.map(function (e) { return e.sku; }), ['AA', 'ZZ'], 'J1 only READY in-scope SKUs, sorted ASC (BLOCKED + other-scope excluded)');
  var b = recGenBuildGapDraftBody_({ company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'AA' },
    { sku: 'AA', calculation_status: 'READY', calculated_at: 'T0', calculation_month: '2026-08', t1_month: '2026-08', t1_gap_qty: 3884, t1_suggested_qty: 3920, t2_month: '2026-09', t2_gap_qty: 0, t2_suggested_qty: 0, t3_month: '2026-10', t3_gap_qty: 0, t3_suggested_qty: 0 }, 40, {});
  eq(b.body.facts.lines[0].recommendedQty, 3920, 'J2 recommended_qty VERBATIM from gap suggested (no re-cartonization)');
  eq(b.body.facts.formulaVersion, 'ORDER_PLANNING_GAP', 'J3 gap-backed authority marker');
})();

section('D/§19/§21/§23 — no triggers/scheduler, no allocation/formula/second-persister, router + no frontend change');
(function () {
  function code(src) { return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1'); }
  var j = code(GS48);
  ok(!/ScriptApp|newTrigger|timeBased|scheduleContinuation|\.after\(/.test(j), 'N1 48_ introduces NO time trigger / scheduler (request-driven only)');
  ok(!/calculateGap|calculateSuggestedOrderQty|KMSF|KMAR|KMALLOC|KMFC|allocateFactory/.test(j), 'N2 48_ has no gap/quantity recompute + no factory allocation');
  ok(!/insertSheet|createSheet/.test(j), 'N3 48_ creates NO sheet/table (state = Script Properties only)');
  ok(/props\.set\(REQ_DRAFT_JOB_PROP_KEY_/.test(GS48), 'N4 job state persisted to ONE Script Property');
  ok(/recGenGenerateOneSkuCompact_/.test(GS48), 'N5 per-SKU authority reuses the existing R4E2 compact generator (no second persister)');
  // router wires the four job actions + scope-optional getActive
  ['requestOrderDraft.job.start', 'requestOrderDraft.job.continue', 'requestOrderDraft.job.status', 'requestOrderDraft.job.cancel'].forEach(function (a) {
    ok(GS_ROUTER.indexOf("'" + a + "'") >= 0, 'N6 router wires ' + a);
  });
  // 24_ still delegates to KMPW (no second persister) and the public handler wraps the extracted plain-result core
  ok(/rpoGenerateRecommendationDraftLockedResult_/.test(GS24) && /KMPW\.persistProductionRecommendation/.test(GS24), 'N7 24_ plain-result core still delegates to KMPW');
  ok(/function handleGenerateRecommendationDraftLocked_\(body\)\s*\{\s*return jsonResponse_\(rpoGenerateRecommendationDraftLockedResult_\(body\)\)/.test(GS24), 'N8 public handler wraps the core (backward compatible)');
  // frontend wiring moved to R4E3 — the AI Plan action now DRIVES this backend job (start → continue → getActive).
  var RO_JS = read('js/pages/request-order.js');
  ok(/startRequestOrderDraftJob/.test(RO_JS) && /continueRequestOrderDraftJob/.test(RO_JS), 'N9 request-order.js NOW drives this job (F1-4B-FM6-R4E3 wires start + continue over the R4E2-B2 backend; see ai-plan-canonical-job-f1-4b-fm6r4e3.test.js)');
})();

console.log('\n----------------------------------------');
console.log('REQUEST ORDER DRAFT JOB (F1-4B-FM6-R4E2-B2): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
