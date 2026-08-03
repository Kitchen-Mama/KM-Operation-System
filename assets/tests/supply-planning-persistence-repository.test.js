// Kitchen Mama Operation System — Recommendation Persistence production REPOSITORY tests (Phase 2C, Round 1D).
// Run: node assets/tests/supply-planning-persistence-repository.test.js
// Fake-sheet, pure Node — exercises assets/js/core/supply-planning-persistence-repository.js against the
// frozen §Persist-Adapter contract. No SpreadsheetApp; the fake sheet is { headers:[], rows:[[]] } arrays.

'use strict';
var R = require('../js/core/supply-planning-persistence-repository.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function throwsType(fn, l) { try { fn(); } catch (e) { if (e instanceof TypeError) { pass++; return; } fail++; console.error('FAIL ' + l + ' (threw ' + (e && e.name) + ')'); return; } fail++; console.error('FAIL ' + l + ' (no throw)'); }
function throwsRange(fn, l) { try { fn(); } catch (e) { if (e instanceof RangeError) { pass++; return; } fail++; console.error('FAIL ' + l + ' (threw ' + (e && e.name) + ')'); return; } fail++; console.error('FAIL ' + l + ' (no throw)'); }
function section(n) { console.log('\n== ' + n + ' =='); }

// ---- fake-sheet headers (realistic subsets incl. the additive columns) ------
var H = {
  shipping_allocation_drafts: ['allocation_draft_id', 'planning_cycle', 'company', 'country', 'marketplace', 'source_page', 'status', 'draft_version', 'updated_at'],
  shipping_allocation_draft_lines: ['allocation_draft_line_id', 'allocation_draft_id', 'sku', 'site_sku', 'window_code', 'recommended_qty', 'planned_qty', 'line_status', 'user_edited', 'user_edited_by', 'updated_at'],
  request_order_allocation_drafts: ['request_allocation_draft_id', 'planning_cycle', 'company', 'country', 'marketplace', 'draft_purpose', 'sku', 'status', 'draft_version', 'updated_at'],
  request_order_allocation_draft_lines: ['request_allocation_line_id', 'request_allocation_draft_id', 'request_month', 'request_bucket', 'recommended_qty', 'order_qty', 'carton_qty', 'line_status', 'user_edited', 'user_edited_by', 'updated_at']
};
function sheet() {
  var s = R.createSheetSet();
  Object.keys(H).forEach(function (t) { s[t].headers = H[t].slice(); });
  s[R.RUN_JOURNAL_TABLE].headers = R.RUN_JOURNAL_HEADERS.slice();
  return s;
}
function lines(s, table) { return s[table].rows.map(function (r) { var o = {}; s[table].headers.forEach(function (h, i) { o[h] = r[i]; }); return o; }); }

// ---- Monthly plan builder ---------------------------------------------------
var SCOPE_M = { planning_cycle: '2026-08', company: 'KM', country: 'US', marketplace: 'AMAZON_US', draft_purpose: 'regular', sku: 'GA0450' };
function monthlyPlan(draftId, version, lineOps, token, over) {
  var p = {
    recommendationType: 'MONTHLY_ORDER', sourceTables: { header: 'request_order_allocation_drafts', lines: 'request_order_allocation_draft_lines' },
    draftId: draftId, activeKey: 'MONTHLY_ORDER::' + R.buildBusinessScopeKey('MONTHLY_ORDER', SCOPE_M), calculationRunId: 'RUN::' + draftId + '::v' + version,
    draftVersion: version, expectedToken: token,
    runMeta: { planning_cycle: '2026-08', business_scope_key: R.buildBusinessScopeKey('MONTHLY_ORDER', SCOPE_M), formulaVersion: 'v4.7', sourceDataAsOf: '2026-08-03', action: 'CREATE' },
    headerOp: { op: 'INSERT', naturalKey: { request_allocation_draft_id: draftId }, row: { request_allocation_draft_id: draftId, planning_cycle: '2026-08', company: 'KM', country: 'US', marketplace: 'AMAZON_US', draft_purpose: 'regular', sku: 'GA0450', status: 'draft', draft_version: version } },
    lineOps: lineOps, lineageOps: lineOps.filter(function (o) { return o.op !== 'SUPERSEDE'; }).map(function (o) { return { naturalKey: o.naturalKey }; }),
    totals: { totalRecommendedQty: 0, totalUserQty: 0, activeLineCount: 0, blockedCount: 0, supersededCount: 0 },
    stages: R.STAGES.slice(), auditEvents: []
  };
  if (over) for (var k in over) p[k] = over[k];
  return p;
}
function mLine(month, bucket, rec, op, extra) {
  var o = { op: op || 'INSERT', naturalKey: { request_allocation_draft_id: 'RAD-1', request_month: month, request_bucket: bucket }, row: { recommended_qty: rec, order_qty: rec } };
  if (extra) for (var k in extra) { if (k === 'row') { for (var j in extra.row) o.row[j] = extra.row[j]; } else o[k] = extra[k]; }
  return o;
}
function tokenFor(s, draftId, version) {
  var snap = R.loadDraftSnapshot(s, draftId, 'MONTHLY_ORDER');
  return R.computeExpectedToken(version, snap.lines.map(function (l) { return { lineKey: l.lineKey, userQty: l.userQty, userEdited: l.userEdited }; }));
}

// ==========================================================================
section('A. schema / additive headers');
(function () {
  var res = R.ensureHeaders(['a', 'b', 'order_qty'], R.LINE_ADDITIVE_HEADERS);
  eq(res.headers, ['a', 'b', 'order_qty', 'user_edited', 'user_edited_by'], 'ensureHeaders appends additive columns');
  eq(res.added, ['user_edited', 'user_edited_by'], 'ensureHeaders reports added');
  var res2 = R.ensureHeaders(['a', 'user_edited', 'user_edited_by'], R.LINE_ADDITIVE_HEADERS);
  eq(res2.changed, false, 'ensureHeaders idempotent (no re-add)');
  eq(R.ensureHeaders(['x', 'y'], ['y']).headers, ['x', 'y'], 'ensureHeaders never reorders/removes existing');
  eq(R.RUN_JOURNAL_HEADERS.length, 16, 'run-journal has 16 canonical fields');
  ok(R.RUN_JOURNAL_HEADERS.indexOf('run_status') !== -1 && R.RUN_JOURNAL_HEADERS.indexOf('current_stage') !== -1, 'run-journal has run_status + current_stage');
})();

section('B. Active Draft lookup');
(function () {
  var s = sheet();
  var q = { recommendationType: 'MONTHLY_ORDER', planningCycle: '2026-08', businessScope: SCOPE_M };
  eq(R.loadActiveDraftContext(s, q).status, 'CREATE', 'B: 0 active → CREATE');
  s.request_order_allocation_drafts.rows.push(['RAD-1', '2026-08', 'KM', 'US', 'AMAZON_US', 'regular', 'GA0450', 'draft', 1, '']);
  eq(R.loadActiveDraftContext(s, q).status, 'REUSE', 'B: 1 active → REUSE');
  eq(R.loadActiveDraftContext(s, q).draftId, 'RAD-1', 'B: REUSE returns draftId');
  // submitted excluded
  s.request_order_allocation_drafts.rows[0][7] = 'submitted';
  eq(R.loadActiveDraftContext(s, q).status, 'CREATE', 'B: submitted excluded from Active');
  s.request_order_allocation_drafts.rows[0][7] = 'draft';
  // duplicate active → conflict, no latest-wins
  s.request_order_allocation_drafts.rows.push(['RAD-2', '2026-08', 'KM', 'US', 'AMAZON_US', 'regular', 'GA0450', 'site_confirmed', 1, '']);
  eq(R.loadActiveDraftContext(s, q).status, 'BLOCKED_CONFLICT', 'B: >1 active → BLOCKED_CONFLICT');
  // blank legacy scope is literal (blank ≠ wildcard)
  var s2 = sheet();
  s2.request_order_allocation_drafts.rows.push(['RAD-9', '2026-08', 'KM', 'US', '', 'regular', 'GA0450', 'draft', 1, '']);
  eq(R.loadActiveDraftContext(s2, q).status, 'CREATE', 'B: blank marketplace ≠ wildcard (no match)');
  // weekly selects the shipping table
  var w = R.loadActiveDraftContext(sheet(), { recommendationType: 'WEEKLY_SHIPPING', planningCycle: '2026-W32', businessScope: { company: 'KM', country: 'US', marketplace: 'AMAZON_US', source_page: 'REPLENISH' } });
  eq(w.status, 'CREATE', 'B: WEEKLY_SHIPPING resolves against shipping table');
})();

section('C. snapshot loading');
(function () {
  var s = sheet();
  s.request_order_allocation_draft_lines.rows.push(['RAL-2', 'RAD-1', '2026-08', 'T2', 60, 60, 6, 'active', 'FALSE', '', '']);
  s.request_order_allocation_draft_lines.rows.push(['RAL-1', 'RAD-1', '2026-08', 'T1', 100, 90, 9, 'active', 'TRUE', 'planner', '']);
  var SEP = String.fromCharCode(1);
  var snap = R.loadDraftSnapshot(s, 'RAD-1', 'MONTHLY_ORDER');
  eq(snap.lines.map(function (l) { return l.lineKey; }), ['2026-08' + SEP + 'T1', '2026-08' + SEP + 'T2'], 'C: lines stable-sorted by natural key');
  eq(snap.lines[0].userEdited, true, 'C: explicit user_edited=TRUE loaded');
  eq(snap.lines[0].userQty, 90, 'C: user qty loaded');
  eq(snap.lines[1].userEdited, false, 'C: explicit user_edited=FALSE loaded');
  // legacy row: user_edited blank → protected
  s.request_order_allocation_draft_lines.rows.push(['RAL-3', 'RAD-1', '2026-08', 'T3', 40, 40, 4, 'active', '', '', '']);
  var snap2 = R.loadDraftSnapshot(s, 'RAD-1', 'MONTHLY_ORDER');
  var t3 = snap2.lines.filter(function (l) { return l.lineKey === '2026-08' + SEP + 'T3'; })[0];
  eq(t3.legacyProtected, true, 'C: legacy row (blank user_edited) → legacyProtected');
  eq(t3.userEdited, true, 'C: legacy row treated conservatively as edited (protected), NOT value-compared');
})();

section('D. run journal + stage persistence');
(function () {
  var s = sheet();
  s.request_order_allocation_drafts.rows.push(['RAD-1', '2026-08', 'KM', 'US', 'AMAZON_US', 'regular', 'GA0450', 'draft', 1, '']);
  var tok = tokenFor(s, 'RAD-1', 1);
  var res = R.applyPersistencePlan(s, monthlyPlan('RAD-1', 1, [mLine('2026-08', 'T1', 100)], tok), tok, { now: '2026-08-03T00:00:00Z', actor: 'sys' });
  eq(res.runStatus, 'COMPLETED', 'D: run COMPLETED');
  var runs = lines(s, R.RUN_JOURNAL_TABLE);
  eq(runs.length, 1, 'D: one run row inserted');
  eq(runs[0].current_stage, 'COMPLETED', 'D: current_stage COMPLETED persisted');
  eq(runs[0].calculation_run_id, 'RUN::RAD-1::v1', 'D: calculation_run_id persisted');
  ok(runs[0].completed_at === '2026-08-03T00:00:00Z' && runs[0].completed_by === 'sys', 'D: completed_by/at from injected boundary');
  // replay of the SAME plan → re-drives idempotently: business lines unchanged, no duplicate run row
  var draftLinesBefore = JSON.stringify(s.request_order_allocation_draft_lines.rows);
  var res2 = R.applyPersistencePlan(s, monthlyPlan('RAD-1', 1, [mLine('2026-08', 'T1', 100)], tokenFor(s, 'RAD-1', 1)), tokenFor(s, 'RAD-1', 1), { now: 'x', actor: 'sys' });
  eq(res2.runStatus, 'COMPLETED', 'D: replay of completed run re-drives to COMPLETED');
  eq(JSON.stringify(s.request_order_allocation_draft_lines.rows), draftLinesBefore, 'D: replay leaves business lines unchanged (idempotent)');
  eq(lines(s, R.RUN_JOURNAL_TABLE).length, 1, 'D: no duplicate run row on replay');
  // loadIncompleteRun: none now (COMPLETED)
  eq(R.loadIncompleteRun(s, 'RAD-1').status, 'NOT_FOUND', 'D: no incomplete run after completion');
  // multiple incomplete → conflict
  var s2 = sheet();
  s2[R.RUN_JOURNAL_TABLE].rows.push(R.RUN_JOURNAL_HEADERS.map(function (h) { return h === 'draft_id' ? 'RAD-1' : (h === 'run_status' ? 'PARTIAL' : (h === 'calculation_run_id' ? 'RUN-A' : '')); }));
  s2[R.RUN_JOURNAL_TABLE].rows.push(R.RUN_JOURNAL_HEADERS.map(function (h) { return h === 'draft_id' ? 'RAD-1' : (h === 'run_status' ? 'RUNNING' : (h === 'calculation_run_id' ? 'RUN-B' : '')); }));
  eq(R.loadIncompleteRun(s2, 'RAD-1').status, 'BLOCKED_CONFLICT', 'D: >1 incomplete run → BLOCKED_CONFLICT');
})();

section('E. expected token');
(function () {
  var f1 = R.buildUserEditFingerprint([{ lineKey: 'A', userQty: 10, userEdited: false }, { lineKey: 'B', userQty: 20, userEdited: true }]);
  var f2 = R.buildUserEditFingerprint([{ lineKey: 'B', userQty: 20, userEdited: true }, { lineKey: 'A', userQty: 10, userEdited: false }]);
  eq(f1, f2, 'E: fingerprint is input-order independent');
  ok(f1 !== R.buildUserEditFingerprint([{ lineKey: 'A', userQty: 11, userEdited: false }, { lineKey: 'B', userQty: 20, userEdited: true }]), 'E: fingerprint detects a userQty edit');
  ok(f1 !== R.buildUserEditFingerprint([{ lineKey: 'A', userQty: 10, userEdited: true }, { lineKey: 'B', userQty: 20, userEdited: true }]), 'E: fingerprint detects a user_edited change');
  // concurrent edit → CONFLICT, zero writes
  var s = sheet();
  s.request_order_allocation_drafts.rows.push(['RAD-1', '2026-08', 'KM', 'US', 'AMAZON_US', 'regular', 'GA0450', 'draft', 1, '']);
  s.request_order_allocation_draft_lines.rows.push(['RAL-1', 'RAD-1', '2026-08', 'T1', 100, 100, 10, 'active', 'FALSE', '', '']);
  var staleTok = tokenFor(s, 'RAD-1', 1);
  s.request_order_allocation_draft_lines.rows[0][6] = 77; // a user edits planned/order qty after token capture
  s.request_order_allocation_draft_lines.rows[0][8] = 'TRUE';
  var before = JSON.stringify(s);
  var res = R.applyPersistencePlan(s, monthlyPlan('RAD-1', 1, [mLine('2026-08', 'T1', 120, 'UPDATE')], staleTok), staleTok, { now: 'x', actor: 'sys' });
  eq(res.conflict, true, 'E: stale token → CONFLICT');
  eq(JSON.stringify(s), before, 'E: CONFLICT performs zero writes');
  // version mismatch
  var s2 = sheet(); s2.request_order_allocation_drafts.rows.push(['RAD-1', '2026-08', 'KM', 'US', 'AMAZON_US', 'regular', 'GA0450', 'draft', 2, '']);
  var badVer = { draft_version: 1, userEditFingerprint: R.buildUserEditFingerprint([]) };
  eq(R.applyPersistencePlan(s2, monthlyPlan('RAD-1', 1, [], badVer), badVer, {}).conflict, true, 'E: draft_version mismatch → CONFLICT');
})();

section('F. shipping natural-key upsert');
(function () {
  function wsheet() {
    var s = sheet();
    s.shipping_allocation_drafts.rows.push(['SAD-1', '2026-W32', 'KM', 'US', 'AMAZON_US', 'REPLENISH', 'draft', 1, '']);
    return s;
  }
  var SCOPE_W = { planning_cycle: '2026-W32', company: 'KM', country: 'US', marketplace: 'AMAZON_US', source_page: 'REPLENISH' };
  function wplan(version, lineOps, token) {
    return {
      recommendationType: 'WEEKLY_SHIPPING', sourceTables: { header: 'shipping_allocation_drafts', lines: 'shipping_allocation_draft_lines' },
      draftId: 'SAD-1', activeKey: 'WEEKLY_SHIPPING::' + R.buildBusinessScopeKey('WEEKLY_SHIPPING', SCOPE_W), calculationRunId: 'RUN::SAD-1::v' + version,
      draftVersion: version, expectedToken: token, runMeta: { planning_cycle: '2026-W32', business_scope_key: R.buildBusinessScopeKey('WEEKLY_SHIPPING', SCOPE_W), formulaVersion: 'v4.7', sourceDataAsOf: '2026-08-03' },
      headerOp: { op: 'UPDATE', naturalKey: { allocation_draft_id: 'SAD-1' }, row: { allocation_draft_id: 'SAD-1', status: 'draft', draft_version: version } },
      lineOps: lineOps, lineageOps: [], totals: {}, stages: R.STAGES.slice(), auditEvents: []
    };
  }
  function wLine(sku, site, win, rec, op, extra) { var o = { op: op || 'INSERT', naturalKey: { allocation_draft_id: 'SAD-1', sku: sku, site_sku: site, window_code: win }, row: { recommended_qty: rec, planned_qty: rec } }; if (extra) for (var k in extra) { if (k === 'row') for (var j in extra.row) o.row[j] = extra.row[j]; else o[k] = extra[k]; } return o; }
  function wtok(s, v) { var snap = R.loadDraftSnapshot(s, 'SAD-1', 'WEEKLY_SHIPPING'); return R.computeExpectedToken(v, snap.lines.map(function (l) { return { lineKey: l.lineKey, userQty: l.userQty, userEdited: l.userEdited }; })); }

  var s = wsheet();
  R.applyPersistencePlan(s, wplan(1, [wLine('SKU1', 'ST1', 'W32', 50)], wtok(s, 1)), wtok(s, 1), { now: 't', actor: 'sys' });
  eq(s.shipping_allocation_draft_lines.rows.length, 1, 'F: INSERT one line');
  var L = lines(s, 'shipping_allocation_draft_lines')[0];
  eq([L.planned_qty, L.user_edited, L.line_status], [50, 'FALSE', 'active'], 'F: new system line → planned=recommended, user_edited FALSE, active');
  // user edits planned_qty
  s.shipping_allocation_draft_lines.rows[0][6] = 42; s.shipping_allocation_draft_lines.rows[0][8] = 'TRUE'; s.shipping_allocation_draft_lines.rows[0][9] = 'planner';
  // system refresh (UPDATE) must PRESERVE the edited planned_qty
  R.applyPersistencePlan(s, wplan(1, [wLine('SKU1', 'ST1', 'W32', 50, 'UPDATE')], wtok(s, 1)), wtok(s, 1), { now: 't2', actor: 'sys' });
  eq(lines(s, 'shipping_allocation_draft_lines')[0].planned_qty, 42, 'F: refresh preserves user-edited planned_qty');
  eq(s.shipping_allocation_draft_lines.rows.length, 1, 'F: replay/refresh → no duplicate row');
  // add a second line + supersede the first
  R.applyPersistencePlan(s, wplan(1, [wLine('SKU2', 'ST2', 'W32', 30), wLine('SKU1', 'ST1', 'W32', 50, 'SUPERSEDE')], wtok(s, 1)), wtok(s, 1), { now: 't3', actor: 'sys' });
  var byKey = {}; lines(s, 'shipping_allocation_draft_lines').forEach(function (r) { byKey[r.sku] = r; });
  eq(byKey.SKU1.line_status, 'superseded_user_review', 'F: removed user-edited line → superseded_user_review');
  eq(byKey.SKU2.line_status, 'active', 'F: new line active');
  eq(s.shipping_allocation_draft_lines.rows.length, 2, 'F: supersede never hard-deletes');
  // blocked line
  R.applyPersistencePlan(s, wplan(1, [wLine('SKU3', 'ST3', 'W33', null, 'INSERT', { targetLineStatus: 'blocked', row: { recommendation_flags: 'DEMAND_SOURCE_QTY_CONFLICT' } })], wtok(s, 1)), wtok(s, 1), { now: 't4', actor: 'sys' });
  var blk = lines(s, 'shipping_allocation_draft_lines').filter(function (r) { return r.sku === 'SKU3'; })[0];
  eq(blk.line_status, 'blocked', 'F: blocked line persisted with line_status=blocked');
  // duplicate natural key in sheet → conflict, no write
  s.shipping_allocation_draft_lines.rows.push(['DUP', 'SAD-1', 'SKU2', 'ST2', 'W32', 30, 30, 'active', 'FALSE', '', '']);
  var before = JSON.stringify(s);
  var dres = R.applyPersistencePlan(s, wplan(1, [wLine('SKU2', 'ST2', 'W32', 31, 'UPDATE')], wtok(s, 1)), wtok(s, 1), { now: 't5', actor: 'sys' });
  eq(dres.runStatus, 'FAILED', 'F: duplicate natural key → FAILED (no silent merge)');
  ok(dres.reason.indexOf('DUPLICATE_LINE_KEY') === 0, 'F: duplicate-key reason');
})();

section('G. procurement natural-key upsert (delete+replace migration)');
(function () {
  var s = sheet();
  s.request_order_allocation_drafts.rows.push(['RAD-1', '2026-08', 'KM', 'US', 'AMAZON_US', 'regular', 'GA0450', 'draft', 1, '']);
  // v1 create with a partial-carton user value later
  var t1 = tokenFor(s, 'RAD-1', 1);
  R.applyPersistencePlan(s, monthlyPlan('RAD-1', 1, [mLine('2026-08', 'T1', 100), mLine('2026-08', 'T2', 60)], t1), t1, { now: 't', actor: 'sys' });
  eq(s.request_order_allocation_draft_lines.rows.length, 2, 'G: INSERT two lines (no delete+replace churn)');
  // user sets an exact partial-carton order_qty
  var idxT1 = -1; s.request_order_allocation_draft_lines.rows.forEach(function (r, i) { if (r[3] === 'T1') idxT1 = i; });
  s.request_order_allocation_draft_lines.rows[idxT1][5] = 137; s.request_order_allocation_draft_lines.rows[idxT1][8] = 'TRUE'; s.request_order_allocation_draft_lines.rows[idxT1][9] = 'planner';
  // regenerate v1 refresh: must PRESERVE the exact partial-carton order_qty (no rounding)
  var t2 = tokenFor(s, 'RAD-1', 1);
  R.applyPersistencePlan(s, monthlyPlan('RAD-1', 1, [mLine('2026-08', 'T1', 100, 'UPDATE'), mLine('2026-08', 'T2', 60, 'UPDATE')], t2), t2, { now: 't2', actor: 'sys' });
  var t1row = lines(s, 'request_order_allocation_draft_lines').filter(function (r) { return r.request_bucket === 'T1'; })[0];
  eq(t1row.order_qty, 137, 'G: exact partial-carton order_qty preserved (not rounded/recomputed)');
  eq(s.request_order_allocation_draft_lines.rows.length, 2, 'G: upsert → no duplicate rows (replaces delete+replace)');
  // remove T2 (system) → superseded; T1 (edited) stays
  var t3 = tokenFor(s, 'RAD-1', 1);
  R.applyPersistencePlan(s, monthlyPlan('RAD-1', 1, [mLine('2026-08', 'T1', 100, 'UPDATE'), mLine('2026-08', 'T2', 60, 'SUPERSEDE')], t3), t3, { now: 't3', actor: 'sys' });
  var t2row = lines(s, 'request_order_allocation_draft_lines').filter(function (r) { return r.request_bucket === 'T2'; })[0];
  eq(t2row.line_status, 'superseded', 'G: removed system line → superseded (not deleted)');
  eq(s.request_order_allocation_draft_lines.rows.length, 2, 'G: superseded rows retained (no hard delete)');
})();

section('H. stage execution + partial-write recovery');
(function () {
  function fresh() { var s = sheet(); s.request_order_allocation_drafts.rows.push(['RAD-1', '2026-08', 'KM', 'US', 'AMAZON_US', 'regular', 'GA0450', 'draft', 1, '']); return s; }
  // fail before TOTALS → PARTIAL at LINEAGE
  var s = fresh(); var tk = tokenFor(s, 'RAD-1', 1);
  var res = R.applyPersistencePlan(s, monthlyPlan('RAD-1', 1, [mLine('2026-08', 'T1', 100)], tk), tk, { now: 't', actor: 'sys', failBeforeStage: 'TOTALS' });
  eq(res.runStatus, 'PARTIAL', 'H: failBeforeStage → PARTIAL');
  eq(res.stageReached, 'LINEAGE', 'H: PARTIAL stopped after LINEAGE');
  ok(!!R.loadIncompleteRun(s, 'RAD-1').run, 'H: incomplete run recorded');
  // resume by replaying the SAME plan → completes, no duplicates
  var res2 = R.applyPersistencePlan(s, monthlyPlan('RAD-1', 1, [mLine('2026-08', 'T1', 100)], tokenFor(s, 'RAD-1', 1)), tokenFor(s, 'RAD-1', 1), { now: 't2', actor: 'sys' });
  eq(res2.runStatus, 'COMPLETED', 'H: resume/replay completes');
  eq(lines(s, R.RUN_JOURNAL_TABLE).length, 1, 'H: no duplicate run on resume');
  eq(s.request_order_allocation_draft_lines.rows.length, 1, 'H: no duplicate line on resume');
  // crash between write and marker: LINES writes rows but marker not written
  var s2 = fresh(); var tk2 = tokenFor(s2, 'RAD-1', 1);
  var resC = R.applyPersistencePlan(s2, monthlyPlan('RAD-1', 1, [mLine('2026-08', 'T1', 100)], tk2), tk2, { now: 't', actor: 'sys', failBeforeMark: 'LINES' });
  eq(resC.runStatus, 'PARTIAL', 'H: crash before marker → PARTIAL');
  eq(s2.request_order_allocation_draft_lines.rows.length, 1, 'H: crashed stage DID write its rows');
  // replay: LINES re-runs idempotently (natural-key upsert prevents duplicate)
  var resC2 = R.applyPersistencePlan(s2, monthlyPlan('RAD-1', 1, [mLine('2026-08', 'T1', 100)], tokenFor(s2, 'RAD-1', 1)), tokenFor(s2, 'RAD-1', 1), { now: 't2', actor: 'sys' });
  eq(resC2.runStatus, 'COMPLETED', 'H: replay after crash completes');
  eq(s2.request_order_allocation_draft_lines.rows.length, 1, 'H: replay after crash → no duplicate line');
  // completed marker only at the end: after a mid PARTIAL, run_status never COMPLETED early
  var s3 = fresh(); var tk3 = tokenFor(s3, 'RAD-1', 1);
  R.applyPersistencePlan(s3, monthlyPlan('RAD-1', 1, [mLine('2026-08', 'T1', 100)], tk3), tk3, { now: 't', actor: 'sys', failBeforeStage: 'HEADER' });
  eq(lines(s3, R.RUN_JOURNAL_TABLE)[0].run_status, 'PARTIAL', 'H: no empty-success — run stays PARTIAL until COMPLETED');
})();

section('I. purity / serialization / validation');
(function () {
  var s = sheet(); s.request_order_allocation_drafts.rows.push(['RAD-1', '2026-08', 'KM', 'US', 'AMAZON_US', 'regular', 'GA0450', 'draft', 1, '']);
  var tk = tokenFor(s, 'RAD-1', 1);
  // determinism: same inputs → identical sheet
  var a = sheet(); a.request_order_allocation_drafts.rows.push(['RAD-1', '2026-08', 'KM', 'US', 'AMAZON_US', 'regular', 'GA0450', 'draft', 1, '']);
  var b = sheet(); b.request_order_allocation_drafts.rows.push(['RAD-1', '2026-08', 'KM', 'US', 'AMAZON_US', 'regular', 'GA0450', 'draft', 1, '']);
  var ta = tokenFor(a, 'RAD-1', 1), tb = tokenFor(b, 'RAD-1', 1);
  R.applyPersistencePlan(a, monthlyPlan('RAD-1', 1, [mLine('2026-08', 'T1', 100)], ta), ta, { now: 'T', actor: 'sys' });
  R.applyPersistencePlan(b, monthlyPlan('RAD-1', 1, [mLine('2026-08', 'T1', 100)], tb), tb, { now: 'T', actor: 'sys' });
  eq(a, b, 'I: deterministic — same inputs → identical sheet state');
  // validation matrix
  var good = monthlyPlan('RAD-1', 1, [mLine('2026-08', 'T1', 100)], tk);
  ok(R.validatePersistencePlan(good) === true, 'I: valid plan passes');
  throwsType(function () { R.validatePersistencePlan(null); }, 'I: non-object plan → TypeError');
  throwsRange(function () { R.validatePersistencePlan({}); }, 'I: empty plan (no recommendationType) → RangeError');
  throwsRange(function () { var p = monthlyPlan('RAD-1', 1, [mLine('2026-08', 'T1', 100)], tk); p.recommendationType = 'X'; R.validatePersistencePlan(p); }, 'I: bad recommendationType → RangeError');
  throwsRange(function () { var p = monthlyPlan('RAD-1', 1, [{ op: 'DELETE', naturalKey: { request_allocation_draft_id: 'RAD-1', request_month: 'm', request_bucket: 'T1' }, row: {} }], tk); R.validatePersistencePlan(p); }, 'I: bad line op → RangeError');
  throwsType(function () { var p = monthlyPlan('RAD-1', 1, [{ op: 'INSERT', naturalKey: { request_allocation_draft_id: 'RAD-1', request_month: 'm' }, row: { order_qty: 1 } }], tk); R.validatePersistencePlan(p); }, 'I: missing natural-key part → TypeError');
  throwsRange(function () { var p = monthlyPlan('RAD-1', 1, [mLine('2026-08', 'T1', 100), mLine('2026-08', 'T1', 50)], tk); R.validatePersistencePlan(p); }, 'I: duplicate line-op key → RangeError');
  throwsRange(function () { var p = monthlyPlan('RAD-1', 1, [mLine('2026-08', 'T1', -5, 'INSERT')], tk); R.validatePersistencePlan(p); }, 'I: negative qty → RangeError');
  throwsRange(function () { var p = monthlyPlan('RAD-1', 1, [mLine('2026-08', 'T1', 100)], tk); p.stages = ['HEADER']; R.validatePersistencePlan(p); }, 'I: wrong stage sequence → RangeError');
  throwsType(function () { var p = monthlyPlan('RAD-1', 1, [{ op: 'INSERT', naturalKey: { request_allocation_draft_id: 'RAD-1', request_month: 'm', request_bucket: 'T1' }, row: { order_qty: 1, bad: function () {} } }], tk); R.validatePersistencePlan(p); }, 'I: Sheet/function reference in row → TypeError');
})();

section('J. regression — no mutation of terminal rows, no hard delete');
(function () {
  var s = sheet();
  s.request_order_allocation_drafts.rows.push(['RAD-1', '2026-08', 'KM', 'US', 'AMAZON_US', 'regular', 'GA0450', 'draft', 1, '']);
  // a submitted line in the same draft (terminal) must never be touched by supersede/upsert of other keys
  s.request_order_allocation_draft_lines.rows.push(['RAL-S', 'RAD-1', '2026-07', 'T1', 99, 99, 9, 'submitted', 'TRUE', 'planner', '']);
  var before = JSON.stringify(s.request_order_allocation_draft_lines.rows[0]);
  var tk = tokenFor(s, 'RAD-1', 1);
  R.applyPersistencePlan(s, monthlyPlan('RAD-1', 1, [mLine('2026-08', 'T2', 60)], tk), tk, { now: 't', actor: 'sys' });
  eq(JSON.stringify(s.request_order_allocation_draft_lines.rows[0]), before, 'J: unrelated submitted line untouched');
  ok(s.request_order_allocation_draft_lines.rows.length === 2, 'J: no hard deletion (submitted + new line)');
})();

// ==========================================================================
console.log('');
if (fail) { console.error('\n' + fail + ' assertion(s) FAILED (' + pass + ' passed).'); process.exit(1); }
console.log('All Round 1D Recommendation Persistence Repository assertions passed (' + pass + ' assertions).');
