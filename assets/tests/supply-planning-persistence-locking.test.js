// Kitchen Mama Operation System — Recommendation Persistence LOCKING tests (Phase 2C, Round 1E).
// Run: node assets/tests/supply-planning-persistence-locking.test.js
// Pure Node — exercises assets/js/core/supply-planning-persistence-locking.js against the frozen §Persist-Adapter
// PA-9/PA-10 boundary. Two wiring styles: (1) STUB deps for precise control of lock/reload/token/apply outcomes;
// (2) REAL deps wiring the actual KMPR repository over a fake sheet set to prove idempotent replay / zero-write
// conflict end-to-end under a fake lock. No SpreadsheetApp, no clock, no random.

'use strict';
var L = require('../js/core/supply-planning-persistence-locking.js');
var R = require('../js/core/supply-planning-persistence-repository.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function throwsType(fn, l) { try { fn(); } catch (e) { if (e instanceof TypeError) { pass++; return; } fail++; console.error('FAIL ' + l + ' (threw ' + (e && e.name) + ')'); return; } fail++; console.error('FAIL ' + l + ' (no throw)'); }
function section(n) { console.log('\n== ' + n + ' =='); }

// ---- minimal valid PersistencePlan (shape per PA-7; only fields the locking layer inspects matter here) ----
var TOKEN = { draft_version: 1, userEditFingerprint: 'abc12345' };
function plan(over) {
  var p = {
    recommendationType: 'MONTHLY_ORDER', draftId: 'RAD-1', calculationRunId: 'RUN::RAD-1::v1', draftVersion: 1,
    expectedToken: TOKEN, headerOp: { op: 'INSERT', row: { request_allocation_draft_id: 'RAD-1' } }
  };
  if (over) for (var k in over) p[k] = over[k];
  return p;
}
// A stub dependency bundle whose behaviour is fully controlled by `cfg`. Records the call log + release count.
function stub(cfg) {
  cfg = cfg || {};
  var log = { release: 0, acquire: 0, apply: 0, reload: 0, active: 0, token: 0, audit: [] };
  var deps = {
    acquireLock: function () { log.acquire++; if (cfg.acquireThrow) throw new Error('lock boom'); return cfg.acquire === undefined ? true : cfg.acquire; },
    releaseLock: function () { log.release++; if (cfg.releaseThrow) throw new Error('release boom'); },
    loadActiveDraftContext: function () { log.active++; if (cfg.activeThrow) throw new Error('active boom'); return cfg.active || { status: 'CREATE', draftId: null }; },
    reloadSnapshot: function () { log.reload++; if (cfg.reloadThrow) throw new Error('reload boom'); return cfg.snapshot || { draft: { status: 'draft', draft_version: 1 }, lines: [], runs: [] }; },
    recomputeToken: function () { log.token++; if (cfg.tokenThrow) throw new Error('token boom'); return cfg.liveToken || TOKEN; },
    applyPlan: function (tok, o) { log.apply++; log.appliedToken = tok; log.appliedOpts = o; if (cfg.applyThrow) throw new Error('apply boom'); return cfg.repo || { runStatus: 'COMPLETED', applied: { inserted: 1 } }; },
    audit: function (ev) { log.audit.push(ev); if (cfg.auditThrow) throw new Error('audit boom'); }
  };
  if (cfg.validatePlan) deps.validatePlan = cfg.validatePlan;
  return { deps: deps, log: log };
}
function run(cfg, over) { var s = stub(cfg); return { res: L.executeLockedPersistence({ plan: plan(over), expectedToken: TOKEN, opts: { actor: 'sys', now: 'T' }, generationType: (cfg && cfg.generationType) || 'SCHEDULED_REFRESH', deps: s.deps }), log: s.log }; }

// ==========================================================================
section('A. lock acquisition');
(function () {
  var r = run();
  eq(r.res.status, 'COMPLETED', 'A: acquired + clean revalidation → COMPLETED');
  eq(r.res.success, true, 'A: COMPLETED ⇒ success true');
  eq(r.log.acquire, 1, 'A: lock acquired exactly once');
  // timeout / tryLock returns false
  var r2 = run({ acquire: false });
  eq(r2.res.status, 'LOCK_UNAVAILABLE', 'A: tryLock false → LOCK_UNAVAILABLE');
  eq(r2.res.stage, 'lock', 'A: lock-failure stage = lock');
  eq(r2.res.reason, 'LOCK_UNAVAILABLE', 'A: lock-failure reason');
  eq(r2.res.applied, false, 'A: lock failure ⇒ applied false');
  eq(r2.log.apply, 0, 'A: lock failure ⇒ zero apply calls (zero writes)');
  eq(r2.log.reload, 0, 'A: lock failure ⇒ no reload');
  eq(r2.log.release, 0, 'A: no release when acquisition failed');
  // acquireLock throws
  var r3 = run({ acquireThrow: true });
  eq(r3.res.status, 'LOCK_UNAVAILABLE', 'A: acquireLock throw → LOCK_UNAVAILABLE');
  ok(r3.res.reason.indexOf('LOCK_ERROR:') === 0, 'A: acquire-throw reason carries LOCK_ERROR');
  eq(r3.log.release, 0, 'A: acquire throw ⇒ no release attempted');
  eq(r3.log.apply, 0, 'A: acquire throw ⇒ zero writes');
})();

section('B. revalidation under lock');
(function () {
  // unchanged token → apply
  var r = run();
  eq(r.log.apply, 1, 'B: unchanged token → applyPlan invoked once');
  eq(r.log.reload, 1, 'B: snapshot reloaded under lock');
  // draft_version mismatch
  var rv = run({ liveToken: { draft_version: 2, userEditFingerprint: 'abc12345' } });
  eq(rv.res.status, 'CONFLICT', 'B: draft_version mismatch → CONFLICT');
  eq(rv.res.reason, 'CONCURRENCY_TOKEN_MISMATCH', 'B: version mismatch reason');
  eq(rv.log.apply, 0, 'B: version mismatch → zero apply (zero writes)');
  eq(rv.res.conflict, true, 'B: version mismatch ⇒ conflict flag');
  // fingerprint mismatch
  var rf = run({ liveToken: { draft_version: 1, userEditFingerprint: 'DIFFERENT' } });
  eq(rf.res.status, 'CONFLICT', 'B: fingerprint mismatch → CONFLICT');
  eq(rf.log.apply, 0, 'B: fingerprint mismatch → zero writes');
  ok(rf.res.liveToken.userEditFingerprint === 'DIFFERENT' && rf.res.expectedToken.userEditFingerprint === 'abc12345', 'B: conflict DTO surfaces both tokens');
  // duplicate Active Draft appears after pre-read
  var rd = run({ active: { status: 'BLOCKED_CONFLICT', matchCount: 2 } });
  eq(rd.res.status, 'BLOCKED_CONFLICT', 'B: duplicate active under lock → BLOCKED_CONFLICT');
  eq(rd.res.reason, 'DUPLICATE_ACTIVE_DRAFT', 'B: duplicate-active reason');
  eq(rd.log.apply, 0, 'B: duplicate active → zero writes');
  eq(rd.res.matchCount, 2, 'B: duplicate-active DTO carries matchCount');
  // Draft disappeared: plan wants UPDATE but lookup now says CREATE
  var rm = run({ active: { status: 'CREATE', draftId: null } }, { headerOp: { op: 'UPDATE', row: {} } });
  eq(rm.res.status, 'CONFLICT', 'B: UPDATE plan but draft missing → CONFLICT');
  eq(rm.res.reason, 'ACTIVE_DRAFT_MISSING', 'B: draft-missing reason');
  eq(rm.log.apply, 0, 'B: draft missing → zero writes');
  // Draft now exists but plan wants INSERT (racer created it)
  var re = run({ active: { status: 'REUSE', draftId: 'RAD-1' } });
  eq(re.res.status, 'CONFLICT', 'B: INSERT plan but draft already exists → CONFLICT');
  eq(re.res.reason, 'ACTIVE_DRAFT_ALREADY_EXISTS', 'B: already-exists reason');
  // Reuse but identity drifted
  var ri = run({ active: { status: 'REUSE', draftId: 'RAD-OTHER' } }, { headerOp: { op: 'UPDATE', row: {} } });
  eq(ri.res.reason, 'ACTIVE_DRAFT_IDENTITY_MISMATCH', 'B: identity drift → CONFLICT reason');
  eq(ri.log.apply, 0, 'B: identity drift → zero writes');
  // Draft became submitted
  var rs = run({ snapshot: { draft: { status: 'submitted', draft_version: 1 }, lines: [], runs: [] } });
  eq(rs.res.status, 'CONFLICT', 'B: submitted draft → CONFLICT');
  ok(rs.res.reason.indexOf('IMMUTABLE_TERMINAL_STATUS:submitted') === 0, 'B: submitted terminal reason');
  eq(rs.log.apply, 0, 'B: submitted → zero writes');
  eq(rs.log.token, 0, 'B: terminal guard short-circuits before token recompute');
  // Draft became cancelled
  var rc = run({ snapshot: { draft: { status: 'CANCELLED', draft_version: 1 }, lines: [], runs: [] } });
  ok(rc.res.reason.indexOf('IMMUTABLE_TERMINAL_STATUS:cancelled') === 0, 'B: cancelled terminal reason (case-insensitive)');
  eq(rc.log.apply, 0, 'B: cancelled → zero writes');
})();

section('C. apply path');
(function () {
  var rc = run({ repo: { runStatus: 'COMPLETED', applied: { inserted: 2, updated: 1 } } });
  eq(rc.res.status, 'COMPLETED', 'C: repo COMPLETED → COMPLETED');
  eq(rc.res.applied, { inserted: 2, updated: 1 }, 'C: applied counts surfaced');
  // repo returns PARTIAL → honest failure, not success
  var rp = run({ repo: { runStatus: 'PARTIAL', stageReached: 'LINEAGE', applied: { inserted: 1 } } });
  eq(rp.res.status, 'FAILED', 'C: repo PARTIAL → FAILED (not success)');
  eq(rp.res.success, false, 'C: PARTIAL ⇒ success false');
  eq(rp.res.partial, true, 'C: PARTIAL flagged honestly');
  eq(rp.res.reason, 'REPOSITORY_PARTIAL', 'C: partial reason');
  // repo FAILED → FAILED, carries reason
  var rf = run({ repo: { runStatus: 'FAILED', reason: 'DUPLICATE_HEADER' } });
  eq(rf.res.status, 'FAILED', 'C: repo FAILED → FAILED');
  ok(rf.res.reason.indexOf('DUPLICATE_HEADER') !== -1, 'C: repo failure reason preserved');
  eq(rf.res.success, false, 'C: repo FAILED never converted to success');
  // repo conflict (its own internal revalidation) → CONFLICT
  var ri = run({ repo: { runStatus: 'CONFLICT', conflict: true, reason: 'TOKEN_MISMATCH' } });
  eq(ri.res.status, 'CONFLICT', 'C: repo CONFLICT → CONFLICT');
  eq(ri.res.applied, false, 'C: repo conflict ⇒ applied false');
  // apply receives the reloaded/under-lock expected token + opts
  var ra = run();
  eq(ra.log.appliedToken, TOKEN, 'C: applyPlan called with the revalidated expected token');
  eq(ra.log.appliedOpts.actor, 'sys', 'C: applyPlan receives opts (actor/now injection)');
})();

section('D. release safety');
(function () {
  eq(run().log.release, 1, 'D: release on success (exactly once)');
  eq(run({ liveToken: { draft_version: 9, userEditFingerprint: 'x' } }).log.release, 1, 'D: release on conflict');
  eq(run({ active: { status: 'BLOCKED_CONFLICT', matchCount: 2 } }).log.release, 1, 'D: release on blocked-conflict');
  eq(run({ applyThrow: true }).log.release, 1, 'D: release on apply exception');
  eq(run({ reloadThrow: true }).log.release, 1, 'D: release on reload exception');
  eq(run({ tokenThrow: true }).log.release, 1, 'D: release on token exception');
  eq(run({ activeThrow: true }).log.release, 1, 'D: release on active-lookup exception');
  // exception during apply → FAILED, primary error preserved, still released
  var ra = run({ applyThrow: true });
  eq(ra.res.status, 'FAILED', 'D: apply exception → FAILED');
  ok(ra.res.reason.indexOf('EXCEPTION:') === 0, 'D: apply exception reason carried');
  eq(ra.res.stage, 'apply', 'D: apply exception stage = apply');
  // reload exception surfaces at revalidate stage
  var rr = run({ reloadThrow: true });
  eq(rr.res.stage, 'revalidate', 'D: reload exception stage = revalidate');
  // releaseLock itself throws → primary success preserved, issue reported
  var rrl = run({ releaseThrow: true });
  eq(rrl.res.status, 'COMPLETED', 'D: release failure does NOT hide a successful apply');
  ok(rrl.res.issues.length === 1 && rrl.res.issues[0].indexOf('RELEASE_FAILED:') === 0, 'D: release failure reported as an issue');
  // release failure on a FAILED apply → stays FAILED (not converted), issue also reported
  var rrf = run({ applyThrow: true, releaseThrow: true });
  eq(rrf.res.status, 'FAILED', 'D: release failure never converts a failed apply into success');
  ok(rrf.res.issues.length === 1 && rrf.res.issues[0].indexOf('RELEASE_FAILED:') === 0, 'D: release+apply failure both surfaced');
})();

section('E. race scenarios (real KMPR repository under a fake lock)');
(function () {
  // build a fake sheet set with a live Draft + one line, wire REAL repository deps
  var H = {
    request_order_allocation_drafts: ['request_allocation_draft_id', 'planning_cycle', 'company', 'country', 'marketplace', 'draft_purpose', 'sku', 'status', 'draft_version', 'updated_at'],
    request_order_allocation_draft_lines: ['request_allocation_line_id', 'request_allocation_draft_id', 'request_month', 'request_bucket', 'recommended_qty', 'order_qty', 'carton_qty', 'line_status', 'user_edited', 'user_edited_by', 'updated_at']
  };
  var SCOPE = { planning_cycle: '2026-08', company: 'KM', country: 'US', marketplace: 'AMAZON_US', draft_purpose: 'regular', sku: 'GA0450' };
  function sheet() {
    var s = R.createSheetSet();
    Object.keys(H).forEach(function (t) { s[t].headers = H[t].slice(); });
    s[R.RUN_JOURNAL_TABLE].headers = R.RUN_JOURNAL_HEADERS.slice();
    s.request_order_allocation_drafts.rows.push(['RAD-1', '2026-08', 'KM', 'US', 'AMAZON_US', 'regular', 'GA0450', 'draft', 1, '']);
    return s;
  }
  function tokenOf(s) { var snap = R.loadDraftSnapshot(s, 'RAD-1', 'MONTHLY_ORDER'); return R.computeExpectedToken(snap.draft ? snap.draft.draft_version : 1, snap.lines.map(function (l) { return { lineKey: l.lineKey, userQty: l.userQty, userEdited: l.userEdited }; })); }
  function mLine(bucket, rec, op) { return { op: op || 'INSERT', naturalKey: { request_allocation_draft_id: 'RAD-1', request_month: '2026-08', request_bucket: bucket }, row: { recommended_qty: rec, order_qty: rec } }; }
  function pplan(lineOps, token) {
    return {
      recommendationType: 'MONTHLY_ORDER', sourceTables: { header: 'request_order_allocation_drafts', lines: 'request_order_allocation_draft_lines' },
      draftId: 'RAD-1', activeKey: 'MONTHLY_ORDER::' + R.buildBusinessScopeKey('MONTHLY_ORDER', SCOPE), calculationRunId: 'RUN::RAD-1::v1', draftVersion: 1, expectedToken: token,
      runMeta: { planning_cycle: '2026-08', business_scope_key: R.buildBusinessScopeKey('MONTHLY_ORDER', SCOPE), formulaVersion: 'v4.7', sourceDataAsOf: '2026-08-03' },
      headerOp: { op: 'UPDATE', row: { request_allocation_draft_id: 'RAD-1', status: 'draft', draft_version: 1 } },
      lineOps: lineOps, lineageOps: lineOps.filter(function (o) { return o.op !== 'SUPERSEDE'; }).map(function (o) { return { naturalKey: o.naturalKey }; }),
      totals: {}, stages: R.STAGES.slice(), auditEvents: [], businessScope: SCOPE
    };
  }
  function realDeps(s, lockOk, over) {
    var released = { n: 0 };
    var d = {
      acquireLock: function () { return lockOk !== false; },
      releaseLock: function () { released.n++; },
      loadActiveDraftContext: function () { return R.loadActiveDraftContext(s, { recommendationType: 'MONTHLY_ORDER', planningCycle: '2026-08', businessScope: SCOPE }); },
      reloadSnapshot: function () { return R.loadDraftSnapshot(s, 'RAD-1', 'MONTHLY_ORDER'); },
      recomputeToken: function (snap) { return R.computeExpectedToken(snap.draft ? snap.draft.draft_version : 1, snap.lines.map(function (l) { return { lineKey: l.lineKey, userQty: l.userQty, userEdited: l.userEdited }; })); },
      applyPlan: function (tok, o) { return R.applyPersistencePlan(s, over && over.planForApply ? over.planForApply : d._plan, tok, o || {}); },
      validatePlan: function (p) { return R.validatePersistencePlan(p); }
    };
    d._released = released;
    return d;
  }

  // Scenario: user edits a line's order_qty AFTER the token was captured (before the lock) → CONFLICT, zero writes.
  var s1 = sheet();
  s1.request_order_allocation_draft_lines.rows.push(['RAL-1', 'RAD-1', '2026-08', 'T1', 100, 100, 10, 'active', 'FALSE', '', '']);
  var staleToken = tokenOf(s1);
  s1.request_order_allocation_draft_lines.rows[0][5] = 77;   // racing user edit
  s1.request_order_allocation_draft_lines.rows[0][8] = 'TRUE';
  var before1 = JSON.stringify(s1);
  var d1 = realDeps(s1, true); d1._plan = pplan([mLine('T1', 120, 'UPDATE')], staleToken);
  var out1 = L.executeLockedPersistence({ plan: d1._plan, expectedToken: staleToken, opts: { actor: 'sys', now: 'T' }, deps: d1 });
  eq(out1.status, 'CONFLICT', 'E: racing user edit between calc and lock → CONFLICT');
  eq(out1.reason, 'CONCURRENCY_TOKEN_MISMATCH', 'E: race conflict reason');
  eq(JSON.stringify(s1), before1, 'E: CONFLICT performs zero writes on the real sheet');
  eq(d1._released.n, 1, 'E: real-deps path releases exactly once on conflict');

  // Scenario: draft_version increments before the lock → CONFLICT, zero writes.
  var s2 = sheet();
  s2.request_order_allocation_draft_lines.rows.push(['RAL-1', 'RAD-1', '2026-08', 'T1', 100, 100, 10, 'active', 'FALSE', '', '']);
  var tok2 = tokenOf(s2);
  s2.request_order_allocation_drafts.rows[0][8] = 2;   // a racer bumped draft_version
  var before2 = JSON.stringify(s2);
  var d2 = realDeps(s2, true); d2._plan = pplan([mLine('T1', 120, 'UPDATE')], tok2);
  var out2 = L.executeLockedPersistence({ plan: d2._plan, expectedToken: tok2, opts: { actor: 'sys', now: 'T' }, deps: d2 });
  eq(out2.status, 'CONFLICT', 'E: draft_version bump before lock → CONFLICT');
  eq(JSON.stringify(s2), before2, 'E: version-bump conflict → zero writes');

  // Scenario: clean happy path applies through the real repository and completes.
  var s3 = sheet();
  var tok3 = tokenOf(s3);
  var d3 = realDeps(s3, true); d3._plan = pplan([mLine('T1', 50, 'INSERT')], tok3);
  var out3 = L.executeLockedPersistence({ plan: d3._plan, expectedToken: tok3, opts: { actor: 'sys', now: 'T' }, deps: d3 });
  eq(out3.status, 'COMPLETED', 'E: clean path → COMPLETED via real repository');
  eq(s3.request_order_allocation_draft_lines.rows.length, 1, 'E: one line written under lock');
  eq(R.loadDraftSnapshot(s3, 'RAD-1', 'MONTHLY_ORDER').lines[0].userQty, 50, 'E: line persisted with order_qty');

  // Scenario: duplicate Active Draft created by a racer → BLOCKED_CONFLICT, zero writes.
  var s4 = sheet();
  s4.request_order_allocation_drafts.rows.push(['RAD-2', '2026-08', 'KM', 'US', 'AMAZON_US', 'regular', 'GA0450', 'site_confirmed', 1, '']);
  var tok4 = tokenOf(s4);
  var before4 = JSON.stringify(s4);
  var d4 = realDeps(s4, true); d4._plan = pplan([mLine('T1', 50, 'INSERT')], tok4);
  var out4 = L.executeLockedPersistence({ plan: d4._plan, expectedToken: tok4, opts: { actor: 'sys', now: 'T' }, deps: d4 });
  eq(out4.status, 'BLOCKED_CONFLICT', 'E: duplicate active draft (racer) → BLOCKED_CONFLICT');
  eq(JSON.stringify(s4), before4, 'E: duplicate active → zero writes');

  // Scenario: concurrent manual-regenerate simulation — stale confirmation token no longer matches → CONFLICT.
  var s5 = sheet();
  s5.request_order_allocation_draft_lines.rows.push(['RAL-1', 'RAD-1', '2026-08', 'T1', 100, 100, 10, 'active', 'TRUE', 'planner', '']);
  var confirmToken = tokenOf(s5);
  s5.request_order_allocation_draft_lines.rows[0][5] = 88;   // a newer user edit after the user confirmed
  var d5 = realDeps(s5, true); d5._plan = pplan([mLine('T1', 130, 'UPDATE')], confirmToken);
  var out5 = L.executeLockedPersistence({ plan: d5._plan, expectedToken: confirmToken, opts: { actor: 'sys', now: 'T' }, generationType: 'MANUAL_REGENERATE', deps: d5 });
  eq(out5.status, 'CONFLICT', 'E: manual-regenerate on stale confirmation → CONFLICT (renewed confirmation required)');
  eq(out5.generationType, 'MANUAL_REGENERATE', 'E: conflict DTO carries generationType for the caller');
})();

section('F. idempotent replay under lock (real repository)');
(function () {
  var H = {
    request_order_allocation_drafts: ['request_allocation_draft_id', 'planning_cycle', 'company', 'country', 'marketplace', 'draft_purpose', 'sku', 'status', 'draft_version', 'updated_at'],
    request_order_allocation_draft_lines: ['request_allocation_line_id', 'request_allocation_draft_id', 'request_month', 'request_bucket', 'recommended_qty', 'order_qty', 'carton_qty', 'line_status', 'user_edited', 'user_edited_by', 'updated_at']
  };
  var SCOPE = { planning_cycle: '2026-08', company: 'KM', country: 'US', marketplace: 'AMAZON_US', draft_purpose: 'regular', sku: 'GA0450' };
  function sheet() {
    var s = R.createSheetSet();
    Object.keys(H).forEach(function (t) { s[t].headers = H[t].slice(); });
    s[R.RUN_JOURNAL_TABLE].headers = R.RUN_JOURNAL_HEADERS.slice();
    s.request_order_allocation_drafts.rows.push(['RAD-1', '2026-08', 'KM', 'US', 'AMAZON_US', 'regular', 'GA0450', 'draft', 1, '']);
    return s;
  }
  function tokenOf(s) { var snap = R.loadDraftSnapshot(s, 'RAD-1', 'MONTHLY_ORDER'); return R.computeExpectedToken(snap.draft ? snap.draft.draft_version : 1, snap.lines.map(function (l) { return { lineKey: l.lineKey, userQty: l.userQty, userEdited: l.userEdited }; })); }
  function mLine(bucket, rec, op) { return { op: op || 'INSERT', naturalKey: { request_allocation_draft_id: 'RAD-1', request_month: '2026-08', request_bucket: bucket }, row: { recommended_qty: rec, order_qty: rec } }; }
  function pplan(token) {
    return {
      recommendationType: 'MONTHLY_ORDER', sourceTables: { header: 'request_order_allocation_drafts', lines: 'request_order_allocation_draft_lines' },
      draftId: 'RAD-1', activeKey: 'MONTHLY_ORDER::' + R.buildBusinessScopeKey('MONTHLY_ORDER', SCOPE), calculationRunId: 'RUN::RAD-1::v1', draftVersion: 1, expectedToken: token,
      runMeta: { planning_cycle: '2026-08', business_scope_key: R.buildBusinessScopeKey('MONTHLY_ORDER', SCOPE), formulaVersion: 'v4.7', sourceDataAsOf: '2026-08-03' },
      headerOp: { op: 'UPDATE', row: { request_allocation_draft_id: 'RAD-1', status: 'draft', draft_version: 1 } },
      lineOps: [mLine('T1', 50, 'INSERT')], lineageOps: [{ naturalKey: { request_allocation_draft_id: 'RAD-1', request_month: '2026-08', request_bucket: 'T1' } }],
      totals: {}, stages: R.STAGES.slice(), auditEvents: [], businessScope: SCOPE
    };
  }
  function realDeps(s) {
    var d = {
      acquireLock: function () { return true; }, releaseLock: function () {},
      loadActiveDraftContext: function () { return R.loadActiveDraftContext(s, { recommendationType: 'MONTHLY_ORDER', planningCycle: '2026-08', businessScope: SCOPE }); },
      reloadSnapshot: function () { return R.loadDraftSnapshot(s, 'RAD-1', 'MONTHLY_ORDER'); },
      recomputeToken: function (snap) { return R.computeExpectedToken(snap.draft ? snap.draft.draft_version : 1, snap.lines.map(function (l) { return { lineKey: l.lineKey, userQty: l.userQty, userEdited: l.userEdited }; })); },
      applyPlan: function (tok, o) { return R.applyPersistencePlan(s, d._plan, tok, o || {}); }, validatePlan: function (p) { return R.validatePersistencePlan(p); }
    };
    return d;
  }
  var s = sheet();
  var d = realDeps(s); d._plan = pplan(tokenOf(s));
  var out1 = L.executeLockedPersistence({ plan: d._plan, expectedToken: tokenOf(s), opts: { actor: 'sys', now: 'T' }, deps: d });
  eq(out1.status, 'COMPLETED', 'F: first locked apply completes');
  var afterFirst = JSON.stringify(s.request_order_allocation_draft_lines.rows);
  var runsAfterFirst = s[R.RUN_JOURNAL_TABLE].rows.length;
  // replay the SAME plan under the lock again (recompute token from current state)
  var d2 = realDeps(s); d2._plan = pplan(tokenOf(s));
  var out2 = L.executeLockedPersistence({ plan: d2._plan, expectedToken: tokenOf(s), opts: { actor: 'sys', now: 'T2' }, deps: d2 });
  eq(out2.status, 'COMPLETED', 'F: replay under lock re-drives to COMPLETED');
  eq(JSON.stringify(s.request_order_allocation_draft_lines.rows), afterFirst, 'F: replay leaves business lines byte-identical (idempotent)');
  eq(s[R.RUN_JOURNAL_TABLE].rows.length, runsAfterFirst, 'F: replay adds no duplicate run row');
})();

section('G. determinism + input validation + non-goals');
(function () {
  // same dependency results → identical DTO (deep equality incl. sorted issues)
  var a = run({ releaseThrow: true }).res;
  var b = run({ releaseThrow: true }).res;
  eq(a, b, 'G: same dependency outcomes → identical result DTO');
  // issues stable-sorted (audit + release failures)
  var multi = run({ releaseThrow: true, auditThrow: true }).res;
  var sorted = multi.issues.slice().sort();
  eq(multi.issues, sorted, 'G: issues stable-sorted');
  // no clock/random: DTO has no timestamp fields the helper invented
  ok(a.draftId === 'RAD-1' && a.calculationRunId === 'RUN::RAD-1::v1', 'G: DTO carries plan identity, no invented time/random');
  // input validation (throws BEFORE lock → no acquire/release)
  throwsType(function () { L.executeLockedPersistence(null); }, 'G: null command → TypeError');
  throwsType(function () { L.executeLockedPersistence({ plan: plan(), expectedToken: TOKEN, deps: {} }); }, 'G: missing deps → TypeError');
  throwsType(function () { L.executeLockedPersistence({ plan: {}, expectedToken: TOKEN, deps: stub().deps }); }, 'G: plan without draftId → TypeError');
  throwsType(function () { L.executeLockedPersistence({ plan: plan(), expectedToken: { draft_version: 1 }, deps: stub().deps }); }, 'G: expectedToken without fingerprint → TypeError');
  // validatePlan hook throws before acquiring the lock (no release attempted)
  var s = stub({ validatePlan: function () { throw new RangeError('bad plan'); } });
  var threw = false; try { L.executeLockedPersistence({ plan: plan(), expectedToken: TOKEN, deps: s.deps }); } catch (e) { threw = (e instanceof RangeError); }
  ok(threw, 'G: validatePlan structural throw propagates (pre-lock)');
  eq(s.log.acquire, 0, 'G: validation throw happens before lock acquisition');
  eq(s.log.release, 0, 'G: no release when validation throws pre-lock');
  // STATUS vocabulary is exactly the five frozen tokens (no synonyms)
  eq(Object.keys(L.STATUS).sort(), ['BLOCKED_CONFLICT', 'COMPLETED', 'CONFLICT', 'FAILED', 'LOCK_UNAVAILABLE'], 'G: exactly five canonical status tokens');
})();

// ==========================================================================
console.log('');
if (fail) { console.error('\n' + fail + ' assertion(s) FAILED (' + pass + ' passed).'); process.exit(1); }
console.log('All Round 1E Recommendation Persistence Locking assertions passed (' + pass + ' assertions).');
