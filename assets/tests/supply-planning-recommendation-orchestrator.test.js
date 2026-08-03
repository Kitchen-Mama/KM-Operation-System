// Kitchen Mama Operation System — Recommendation Orchestrator bridge tests (Phase 2C, Round 1G).
// Run: node assets/tests/supply-planning-recommendation-orchestrator.test.js
// Wires the REAL locking (KMPL) + repository (KMPR) over a fake sheet + fake lock and drives the full production
// bridge KMPB → KMPC → KMPPB → locked apply. Verifies create/reuse/duplicate/foreign/terminal/token-race/
// user-edit-preserved/missing-source, that the locked apply is the ONLY write path, and the keyed-delta planner.

'use strict';
var ORCH = require('../js/core/supply-planning-recommendation-orchestrator.js');
var KMPL = require('../js/core/supply-planning-persistence-locking.js');
var KMPR = require('../js/core/supply-planning-persistence-repository.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function num(v) { if (v === '' || v == null) return null; var n = Number(v); return isFinite(n) ? n : null; }

var H = {
  request_order_allocation_drafts: ['request_allocation_draft_id', 'planning_cycle', 'company', 'country', 'marketplace', 'draft_purpose', 'sku', 'status', 'generation_type', 'calculation_run_id', 'formula_version', 'source_data_as_of', 'draft_version', 'updated_at'],
  request_order_allocation_draft_lines: ['request_allocation_line_id', 'request_allocation_draft_id', 'request_month', 'request_bucket', 'recommended_qty', 'order_qty', 'carton_qty', 'units_per_carton', 'allocation_method', 'recommendation_reason', 'recommendation_flags', 'line_status', 'submitted_by', 'submitted_at', 'user_edited', 'user_edited_by', 'updated_at']
};
function sheet() {
  var s = KMPR.createSheetSet();
  Object.keys(H).forEach(function (t) { s[t].headers = H[t].slice(); });
  s[KMPR.RUN_JOURNAL_TABLE].headers = KMPR.RUN_JOURNAL_HEADERS.slice();
  return s;
}
function lrows(s) { return s.request_order_allocation_draft_lines.rows.map(function (r) { var o = {}; s.request_order_allocation_draft_lines.headers.forEach(function (h, i) { o[h] = r[i]; }); return o; }); }
var SCOPE_M = { planning_cycle: '2026-08', company: 'KM', country: 'US', marketplace: 'AMAZON_US', draft_purpose: 'regular', sku: 'GA0450' };
var TYPE = 'MONTHLY_ORDER';

// injected computeFacts fixture (source-readiness aware)
function facts(lines, ready, reason) { return { lines: lines, ready: ready !== false, reason: reason, formulaVersion: 'v4.7', sourceDataAsOf: '2026-08-03' }; }
function lf(bucket, rec, extra) { var o = { request_month: '2026-08', request_bucket: bucket, recommendedQty: rec, snapshotRow: { units_per_carton: 20 } }; if (extra) for (var k in extra) o[k] = extra[k]; return o; }

// Wire the REAL locked apply over a fake sheet + fake lock. Records counters + optional pre-reload mutation.
function makeLocked(s, opts) {
  opts = opts || {};
  var query = { recommendationType: TYPE, planningCycle: '2026-08', businessScope: SCOPE_M };
  var canonicalDraftId = null; // resolved lazily from the plan
  var c = { apply: 0, acquire: 0, release: 0 };
  var lockedApply = function (plan, expectedToken, o) {
    canonicalDraftId = plan.draftId;
    var deps = {
      validatePlan: function (p) { return KMPR.validatePersistencePlan(p); },
      acquireLock: function () { c.acquire++; return opts.lockOk !== false; },
      releaseLock: function () { c.release++; },
      loadActiveDraftContext: function () { return KMPR.loadActiveDraftContext(s, query); },
      reloadSnapshot: function () { if (opts.mutate) { opts.mutate(s); opts.mutate = null; } return KMPR.loadDraftSnapshot(s, canonicalDraftId, TYPE); },
      recomputeToken: function (snap) { return KMPR.computeExpectedToken(snap.draft ? num(snap.draft.draft_version) : plan.draftVersion, snap.lines.map(function (l) { return { lineKey: l.lineKey, userQty: l.userQty, userEdited: l.userEdited }; })); },
      applyPlan: function (tok, oo) { c.apply++; return KMPR.applyPersistencePlan(s, plan, tok, oo || o || {}); }
    };
    return KMPL.executeLockedPersistence({ plan: plan, expectedToken: expectedToken, opts: o, generationType: o.generationType, deps: deps });
  };
  return { lockedApply: lockedApply, counters: c };
}
function deps(s, factsObj, lockOpts) {
  var query = { recommendationType: TYPE, planningCycle: '2026-08', businessScope: SCOPE_M };
  var L = makeLocked(s, lockOpts);
  return {
    _c: L.counters,
    loadActiveContext: function (q) { return KMPR.loadActiveDraftContext(s, q); },
    loadPriorSnapshot: function (id) { return KMPR.loadDraftSnapshot(s, id, TYPE); },
    computeFacts: function () { return factsObj; },
    lockedApply: L.lockedApply
  };
}
function runCreate(s, lines) {
  var d = deps(s, facts(lines));
  var r = ORCH.runRecommendationGeneration({ recommendationType: TYPE, mode: 'SCHEDULED_REFRESH', planningCycle: '2026-08', businessScope: SCOPE_M, actor: 'sys', now: 'T' }, d);
  return { r: r, c: d._c };
}

// ==========================================================================
section('A. Monthly create → locked COMPLETED');
(function () {
  var s = sheet();
  var out = runCreate(s, [lf('T1', 100), lf('T2', 137)]);
  eq(out.r.status, 'COMPLETED', 'A: create COMPLETED');
  eq(out.r.coreAction, 'CREATE', 'A: core action CREATE');
  eq(out.r.generationType, 'scheduled', 'A: generation_type scheduled');
  eq(lrows(s).length, 2, 'A: two lines written to the sheet');
  var t2 = lrows(s).filter(function (r) { return r.request_bucket === 'T2'; })[0];
  eq([t2.recommended_qty, t2.order_qty, t2.line_status], [137, 137, 'active'], 'A: recommended snapshot + order_qty init + active');
  eq(out.c.apply, 1, 'A: locked apply invoked exactly once');
  eq(out.c.release, 1, 'A: lock released exactly once');
})();

section('B. zero active → create; one active → reuse (refresh preserves user edit)');
(function () {
  var s = sheet();
  runCreate(s, [lf('T1', 100), lf('T2', 60)]);
  // user edits T1 order_qty on the sheet
  var lr = s.request_order_allocation_draft_lines, Hl = lr.headers;
  lr.rows.forEach(function (r) { if (r[Hl.indexOf('request_bucket')] === 'T1') { r[Hl.indexOf('order_qty')] = 137; r[Hl.indexOf('user_edited')] = 'TRUE'; r[Hl.indexOf('user_edited_by')] = 'planner'; } });
  // refresh (same facts) → reuse, edit preserved, no dup rows
  var out = runCreate(s, [lf('T1', 100), lf('T2', 60)]);
  eq(out.r.status, 'COMPLETED', 'B: refresh COMPLETED');
  eq(out.r.coreAction, 'REFRESH', 'B: core action REFRESH (reuse existing active draft)');
  eq(lrows(s).length, 2, 'B: no duplicate rows on reuse');
  var t1 = lrows(s).filter(function (r) { return r.request_bucket === 'T1'; })[0];
  eq(t1.order_qty, 137, 'B: user-edited order_qty PRESERVED across scheduled refresh');
  eq(t1.recommended_qty, 100, 'B: recommended snapshot present');
})();

section('C. duplicate active → BLOCKED_CONFLICT, zero writes');
(function () {
  var s = sheet();
  runCreate(s, [lf('T1', 100)]);
  // seed a second active draft at the same scope (different id)
  s.request_order_allocation_drafts.rows.push(['RAD-DUP', '2026-08', 'KM', 'US', 'AMAZON_US', 'regular', 'GA0450', 'site_confirmed', 'scheduled', 'RUN-X', 'v4.7', '2026-08-03', 1, '']);
  var out = runCreate(s, [lf('T1', 120)]);
  eq(out.r.status, 'BLOCKED_CONFLICT', 'C: duplicate active → BLOCKED_CONFLICT');
  eq(out.r.reason, 'DUPLICATE_ACTIVE_DRAFT', 'C: duplicate reason');
  eq(out.c.apply, 0, 'C: zero locked applies (zero writes)');
})();

section('D. foreign / legacy draft (non-canonical id) → adopt-required, zero writes');
(function () {
  var s = sheet();
  s.request_order_allocation_drafts.rows.push(['RAD-LEGACY', '2026-08', 'KM', 'US', 'AMAZON_US', 'regular', 'GA0450', 'draft', 'scheduled', 'RUN-L', 'v4.7', '2026-08-03', 1, '']);
  var out = runCreate(s, [lf('T1', 100)]);
  eq(out.r.status, 'BLOCKED_CONFLICT', 'D: foreign draft → BLOCKED_CONFLICT');
  eq(out.r.reason, 'FOREIGN_DRAFT_ADOPT_REQUIRED', 'D: adopt-required reason');
  eq(out.c.apply, 0, 'D: zero writes');
})();

section('E. terminal draft at canonical id → blocked (never mutates submitted)');
(function () {
  var s = sheet();
  runCreate(s, [lf('T1', 100)]);
  // mark the canonical draft submitted (terminal) directly on the sheet
  var dr = s.request_order_allocation_drafts; var Hd = dr.headers;
  dr.rows.forEach(function (r) { r[Hd.indexOf('status')] = 'submitted'; });
  var before = JSON.stringify(s);
  var out = runCreate(s, [lf('T1', 999)]);
  ok(out.r.status === 'BLOCKED_CONFLICT' && out.r.reason.indexOf('IMMUTABLE_TERMINAL_STATUS') === 0, 'E: submitted canonical draft → terminal block');
  eq(out.c.apply, 0, 'E: zero writes against a submitted draft');
  eq(JSON.stringify(s), before, 'E: submitted draft byte-unchanged');
})();

section('F. token race between capture and lock → CONFLICT, zero writes');
(function () {
  var s = sheet();
  runCreate(s, [lf('T1', 100), lf('T2', 60)]);
  var d = deps(s, facts([lf('T1', 100), lf('T2', 60)]), { mutate: function (sh) {
    // a racing user edit lands AFTER the orchestrator captured expectedToken but BEFORE the lock reload
    var lr = sh.request_order_allocation_draft_lines, Hl = lr.headers;
    lr.rows.forEach(function (r) { if (r[Hl.indexOf('request_bucket')] === 'T1') { r[Hl.indexOf('order_qty')] = 55; r[Hl.indexOf('user_edited')] = 'TRUE'; } });
  } });
  var out = ORCH.runRecommendationGeneration({ recommendationType: TYPE, mode: 'SCHEDULED_REFRESH', planningCycle: '2026-08', businessScope: SCOPE_M, actor: 'sys', now: 'T' }, d);
  eq(out.status, 'CONFLICT', 'F: token race → CONFLICT');
  eq(out.reason, 'CONCURRENCY_TOKEN_MISMATCH', 'F: concurrency reason surfaced');
  eq(d._c.apply, 0, 'F: zero writes on conflict');
})();

section('G. missing source → blocked result, NOT a fabricated zero draft');
(function () {
  var s = sheet();
  var d = deps(s, facts([], false, 'MISSING_SNAPSHOT'));
  var out = ORCH.runRecommendationGeneration({ recommendationType: TYPE, mode: 'SCHEDULED_REFRESH', planningCycle: '2026-08', businessScope: SCOPE_M }, d);
  ok(out.status === 'BLOCKED_CONFLICT' && out.reason === 'SOURCE_NOT_READY:MISSING_SNAPSHOT', 'G: unready source → blocked (no fabricated draft)');
  eq(d._c.apply, 0, 'G: zero writes when source not ready');
  eq(lrows(s).length, 0, 'G: nothing written');
})();

section('H. blocked line flows through as blocked (no fabricated zero)');
(function () {
  var s = sheet();
  var out = runCreate(s, [lf('T1', 100), { request_month: '2026-08', request_bucket: 'T2', blocked: true, reason: 'DEMAND_SOURCE_QTY_CONFLICT' }]);
  eq(out.r.status, 'COMPLETED', 'H: draft with a blocked line still COMPLETED');
  var t2 = lrows(s).filter(function (r) { return r.request_bucket === 'T2'; })[0];
  eq(t2.line_status, 'blocked', 'H: blocked line persisted as blocked');
  ok(t2.order_qty === '' || t2.order_qty == null, 'H: blocked line has no fabricated order_qty');
})();

section('I. lock unavailable → LOCK_UNAVAILABLE, zero writes; no unlocked apply');
(function () {
  var s = sheet();
  var d = deps(s, facts([lf('T1', 100)]), { lockOk: false });
  var out = ORCH.runRecommendationGeneration({ recommendationType: TYPE, mode: 'SCHEDULED_REFRESH', planningCycle: '2026-08', businessScope: SCOPE_M }, d);
  eq(out.status, 'LOCK_UNAVAILABLE', 'I: lock unavailable surfaced');
  eq(d._c.apply, 0, 'I: no apply when lock unavailable (no unlocked bypass)');
  eq(lrows(s).length, 0, 'I: nothing written');
})();

section('J. keyed-delta write planner (pure)');
(function () {
  var before = [['a', 1], ['b', 2], ['c', 3]];
  var after = [['a', 1], ['b', 9], ['c', 3], ['d', 4]];
  var delta = ORCH.computeKeyedDeltaWrites(before, after);
  eq(delta.updates, [{ rowIndex: 1, values: ['b', 9] }], 'J: only the changed row is an update (targeted, not full-table)');
  eq(delta.appends, [['d', 4]], 'J: appended row detected');
  eq(delta.unchanged, 2, 'J: unchanged rows counted (a + c not rewritten)');
  eq(ORCH.computeKeyedDeltaWrites(before, before), { updates: [], appends: [], unchanged: 3 }, 'J: identical → no writes');
})();

// ==========================================================================
console.log('');
if (fail) { console.error('\n' + fail + ' assertion(s) FAILED (' + pass + ' passed).'); process.exit(1); }
console.log('All Round 1G Recommendation Orchestrator assertions passed (' + pass + ' assertions).');
