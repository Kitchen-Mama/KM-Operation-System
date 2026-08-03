// Kitchen Mama Operation System — Locked User Decision Edit tests (Phase 2C, Round 1H).
// Run: node assets/tests/supply-planning-user-edit.test.js
// Wires the pure KMUE user-edit orchestrator over a fake sheet + fake lock (KMPR.applyUserDecisionEdits in
// memory). Verifies locked, terminal-guarded, token-checked, keyed, provenance-stamped decision edits that
// preserve the recommended_qty snapshot and never touch terminal lines or create a calculation run.

'use strict';
var KMUE = require('../js/core/supply-planning-user-edit.js');
var KMPR = require('../js/core/supply-planning-persistence-repository.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function num(v) { if (v === '' || v == null) return null; var n = Number(v); return isFinite(n) ? n : null; }

var Hm = {
  request_order_allocation_drafts: ['request_allocation_draft_id', 'planning_cycle', 'company', 'country', 'marketplace', 'draft_purpose', 'sku', 'status', 'draft_version', 'updated_at'],
  request_order_allocation_draft_lines: ['request_allocation_line_id', 'request_allocation_draft_id', 'request_month', 'request_bucket', 'recommended_qty', 'order_qty', 'carton_qty', 'units_per_carton', 'allocation_method', 'line_status', 'note', 'user_edited', 'user_edited_by', 'updated_at']
};
var Hw = {
  shipping_allocation_drafts: ['allocation_draft_id', 'planning_cycle', 'company', 'country', 'marketplace', 'source_page', 'status', 'draft_version', 'updated_at'],
  shipping_allocation_draft_lines: ['allocation_draft_line_id', 'allocation_draft_id', 'sku', 'site_sku', 'window_code', 'recommended_qty', 'planned_qty', 'selected_shipping_method', 'line_status', 'note', 'user_edited', 'user_edited_by', 'updated_at']
};
function sheet(H) { var s = KMPR.createSheetSet(); Object.keys(H).forEach(function (t) { s[t].headers = H[t].slice(); }); s[KMPR.RUN_JOURNAL_TABLE].headers = KMPR.RUN_JOURNAL_HEADERS.slice(); return s; }
function mrow(s, t) { return s[t].rows.map(function (r) { var o = {}; s[t].headers.forEach(function (h, i) { o[h] = r[i]; }); return o; }); }

function tokenOf(s, draftId, type, version) {
  var snap = KMPR.loadDraftSnapshot(s, draftId, type);
  return KMPR.computeExpectedToken(version, snap.lines.map(function (l) { return { lineKey: l.lineKey, userQty: l.userQty, userEdited: l.userEdited }; }));
}
// Wire the KMUE deps over a fake sheet + fake lock. Records counters + optional pre-reload mutation.
function makeDeps(s, type, draftId, opts) {
  opts = opts || {};
  var c = { acquire: 0, release: 0, apply: 0 };
  var deps = {
    _c: c,
    acquireLock: function () { c.acquire++; if (opts.acquireThrow) throw new Error('boom'); return opts.lockOk !== false; },
    releaseLock: function () { c.release++; if (opts.releaseThrow) throw new Error('rel'); },
    reloadSnapshot: function () { if (opts.mutate) { opts.mutate(s); opts.mutate = null; } return KMPR.loadDraftSnapshot(s, draftId, type); },
    recomputeToken: function (snap) { return KMPR.computeExpectedToken(snap.draft ? num(snap.draft.draft_version) : 1, snap.lines.map(function (l) { return { lineKey: l.lineKey, userQty: l.userQty, userEdited: l.userEdited }; })); },
    applyEdits: function (cmd) { c.apply++; if (opts.applyThrow) throw new Error('apply'); return KMPR.applyUserDecisionEdits(s, cmd, { now: 'T', actor: cmd.actor || 'planner' }); }
  };
  return deps;
}

// seed a monthly draft with two active lines
function seedMonthly() {
  var s = sheet(Hm);
  s.request_order_allocation_drafts.rows.push(['RAD-1', '2026-08', 'KM', 'US', 'AMAZON_US', 'regular', 'GA0450', 'draft', 1, '']);
  s.request_order_allocation_draft_lines.rows.push(['RAL-1', 'RAD-1', '2026-08', 'T1', 100, 100, 5, 20, 'ENGINE_B', 'active', '', 'FALSE', '', '']);
  s.request_order_allocation_draft_lines.rows.push(['RAL-2', 'RAD-1', '2026-08', 'T2', 60, 60, 3, 20, 'ENGINE_B', 'active', '', 'FALSE', '', '']);
  return s;
}
function editCmd(over) {
  var c = { recommendationType: 'MONTHLY_ORDER', draftId: 'RAD-1', edits: [{ naturalKey: { request_month: '2026-08', request_bucket: 'T1' }, fields: { order_qty: 137 } }], actor: 'planner' };
  if (over) for (var k in over) c[k] = over[k];
  return c;
}

// ==========================================================================
section('A. procurement order_qty edit under lock');
(function () {
  var s = seedMonthly();
  var cmd = editCmd({ expectedToken: tokenOf(s, 'RAD-1', 'MONTHLY_ORDER', 1) });
  var d = makeDeps(s, 'MONTHLY_ORDER', 'RAD-1');
  var r = KMUE.runUserDecisionEdit(cmd, d);
  eq(r.status, 'COMPLETED', 'A: edit COMPLETED');
  var t1 = mrow(s, 'request_order_allocation_draft_lines').filter(function (x) { return x.request_bucket === 'T1'; })[0];
  eq(t1.order_qty, 137, 'A: order_qty updated (partial-carton exact 137)');
  eq(t1.recommended_qty, 100, 'A: recommended_qty snapshot UNCHANGED');
  eq([t1.user_edited, t1.user_edited_by], ['TRUE', 'planner'], 'A: explicit provenance set');
  eq(d._c.release, 1, 'A: lock released exactly once');
  eq(s[KMPR.RUN_JOURNAL_TABLE].rows.length, 0, 'A: NO calculation run created for a user edit');
  var t2 = mrow(s, 'request_order_allocation_draft_lines').filter(function (x) { return x.request_bucket === 'T2'; })[0];
  eq([t2.order_qty, t2.user_edited], [60, 'FALSE'], 'A: unrelated row (T2) unchanged');
})();

section('B. stale token / terminal / duplicate / missing line / lock — zero write');
(function () {
  // stale token
  var s = seedMonthly();
  var stale = tokenOf(s, 'RAD-1', 'MONTHLY_ORDER', 1);
  var d = makeDeps(s, 'MONTHLY_ORDER', 'RAD-1', { mutate: function (sh) { var lr = sh.request_order_allocation_draft_lines, H = lr.headers; lr.rows[0][H.indexOf('order_qty')] = 55; lr.rows[0][H.indexOf('user_edited')] = 'TRUE'; } });
  var before = JSON.stringify(s);
  var r = KMUE.runUserDecisionEdit(editCmd({ expectedToken: stale }), d);
  eq(r.status, 'CONFLICT', 'B: stale token → CONFLICT');
  eq(r.reason, 'CONCURRENCY_TOKEN_MISMATCH', 'B: concurrency reason');
  eq(d._c.apply, 0, 'B: zero applyEdits on stale token');
  // terminal draft
  var s2 = seedMonthly(); s2.request_order_allocation_drafts.rows[0][7] = 'submitted';
  var b2 = JSON.stringify(s2);
  var r2 = KMUE.runUserDecisionEdit(editCmd({ expectedToken: tokenOf(s2, 'RAD-1', 'MONTHLY_ORDER', 1) }), makeDeps(s2, 'MONTHLY_ORDER', 'RAD-1'));
  ok(r2.status === 'BLOCKED_CONFLICT' && r2.reason.indexOf('IMMUTABLE_TERMINAL_STATUS:submitted') === 0, 'B: submitted draft → terminal block');
  eq(JSON.stringify(s2), b2, 'B: terminal draft byte-unchanged');
  // duplicate natural key in edits
  var s3 = seedMonthly();
  var dupCmd = editCmd({ expectedToken: tokenOf(s3, 'RAD-1', 'MONTHLY_ORDER', 1), edits: [{ naturalKey: { request_month: '2026-08', request_bucket: 'T1' }, fields: { order_qty: 1 } }, { naturalKey: { request_month: '2026-08', request_bucket: 'T1' }, fields: { order_qty: 2 } }] });
  var r3 = KMUE.runUserDecisionEdit(dupCmd, makeDeps(s3, 'MONTHLY_ORDER', 'RAD-1'));
  ok(r3.status === 'CONFLICT' && r3.reason.indexOf('DUPLICATE_LINE_KEY') === 0, 'B: duplicate line key → CONFLICT');
  // missing line (no allowInsert) → LINE_NOT_FOUND
  var s4 = seedMonthly();
  var missCmd = editCmd({ expectedToken: tokenOf(s4, 'RAD-1', 'MONTHLY_ORDER', 1), edits: [{ naturalKey: { request_month: '2026-08', request_bucket: 'T3' }, fields: { order_qty: 10 } }] });
  var r4 = KMUE.runUserDecisionEdit(missCmd, makeDeps(s4, 'MONTHLY_ORDER', 'RAD-1'));
  ok(r4.status === 'CONFLICT' && r4.reason.indexOf('LINE_NOT_FOUND') === 0, 'B: missing line (no allowInsert) → LINE_NOT_FOUND');
  // missing draft
  var s5 = sheet(Hm);
  var r5 = KMUE.runUserDecisionEdit(editCmd({ expectedToken: KMPR.computeExpectedToken(1, []) }), makeDeps(s5, 'MONTHLY_ORDER', 'RAD-1'));
  eq(r5.reason, 'DRAFT_NOT_FOUND', 'B: missing draft → DRAFT_NOT_FOUND');
  // lock unavailable
  var s6 = seedMonthly();
  var d6 = makeDeps(s6, 'MONTHLY_ORDER', 'RAD-1', { lockOk: false });
  var r6 = KMUE.runUserDecisionEdit(editCmd({ expectedToken: tokenOf(s6, 'RAD-1', 'MONTHLY_ORDER', 1) }), d6);
  eq(r6.status, 'LOCK_UNAVAILABLE', 'B: lock unavailable');
  eq([d6._c.apply, d6._c.release], [0, 0], 'B: lock unavailable → no apply, no release');
})();

section('C. invalid edit field + INSERT-only-with-allowInsert + reconcile');
(function () {
  // invalid field (recommended_qty is NOT editable)
  var s = seedMonthly();
  var badCmd = editCmd({ expectedToken: tokenOf(s, 'RAD-1', 'MONTHLY_ORDER', 1), edits: [{ naturalKey: { request_month: '2026-08', request_bucket: 'T1' }, fields: { recommended_qty: 999 } }] });
  var before = JSON.stringify(s);
  var r = KMUE.runUserDecisionEdit(badCmd, makeDeps(s, 'MONTHLY_ORDER', 'RAD-1'));
  ok(r.status === 'CONFLICT' && r.reason.indexOf('INVALID_EDIT_FIELD:recommended_qty') === 0, 'C: recommended_qty not editable → INVALID_EDIT_FIELD');
  eq(JSON.stringify(s), before, 'C: invalid field → zero write');
  // batch adapter: allowInsert + reconcile (legacy 15_ semantics)
  var s2 = seedMonthly();
  var batch = { recommendationType: 'MONTHLY_ORDER', draftId: 'RAD-1', allowInsert: true, reconcile: true, actor: 'request-order',
    expectedToken: tokenOf(s2, 'RAD-1', 'MONTHLY_ORDER', 1),
    edits: [
      { naturalKey: { request_month: '2026-08', request_bucket: 'T1' }, fields: { order_qty: 90 } },     // UPDATE
      { naturalKey: { request_month: '2026-08', request_bucket: 'T3' }, fields: { order_qty: 40 }, recommendedSnapshot: { recommended_qty: 40, units_per_carton: 20 } } // INSERT
      // T2 omitted → superseded
    ] };
  var r2 = KMUE.runUserDecisionEdit(batch, makeDeps(s2, 'MONTHLY_ORDER', 'RAD-1'));
  eq(r2.status, 'COMPLETED', 'C: batch adapter COMPLETED');
  var rows = mrow(s2, 'request_order_allocation_draft_lines');
  eq(rows.filter(function (x) { return x.request_bucket === 'T1'; })[0].order_qty, 90, 'C: T1 updated');
  eq(rows.filter(function (x) { return x.request_bucket === 'T3'; })[0].recommended_qty, 40, 'C: T3 inserted with snapshot');
  eq(rows.filter(function (x) { return x.request_bucket === 'T2'; })[0].line_status, 'superseded', 'C: T2 reconcile → superseded (not deleted)');
  eq(rows.length, 3, 'C: no hard delete (2 kept + 1 inserted)');
})();

section('D. terminal LINE never mutated inside an active draft');
(function () {
  var s = seedMonthly();
  // mark T2 line submitted (terminal line) inside an otherwise-active draft
  var lr = s.request_order_allocation_draft_lines, H = lr.headers;
  lr.rows.forEach(function (r) { if (r[H.indexOf('request_bucket')] === 'T2') r[H.indexOf('line_status')] = 'submitted'; });
  var before = JSON.stringify(lr.rows[1]);
  var batch = { recommendationType: 'MONTHLY_ORDER', draftId: 'RAD-1', allowInsert: true, reconcile: true, actor: 'planner',
    expectedToken: tokenOf(s, 'RAD-1', 'MONTHLY_ORDER', 1),
    edits: [{ naturalKey: { request_month: '2026-08', request_bucket: 'T2' }, fields: { order_qty: 5 } }] };
  var r = KMUE.runUserDecisionEdit(batch, makeDeps(s, 'MONTHLY_ORDER', 'RAD-1'));
  eq(r.status, 'COMPLETED', 'D: run completes');
  eq(JSON.stringify(lr.rows[1]), before, 'D: submitted LINE untouched (skippedTerminal)');
})();

section('E. shipping planned_qty edit');
(function () {
  var s = sheet(Hw);
  s.shipping_allocation_drafts.rows.push(['SAD-1', '2026-W32', 'KM', 'US', 'AMAZON_US', 'REPLENISH', 'draft', 1, '']);
  s.shipping_allocation_draft_lines.rows.push(['SAL-1', 'SAD-1', 'GA0450', 'ST1', 'W32', 50, 50, 'SEA', 'active', '', 'FALSE', '', '']);
  var tok = tokenOf(s, 'SAD-1', 'WEEKLY_SHIPPING', 1);
  var cmd = { recommendationType: 'WEEKLY_SHIPPING', draftId: 'SAD-1', actor: 'planner', expectedToken: tok,
    edits: [{ naturalKey: { sku: 'GA0450', site_sku: 'ST1', window_code: 'W32' }, fields: { planned_qty: 42, selected_shipping_method: 'AIR', note: 'expedite' } }] };
  var r = KMUE.runUserDecisionEdit(cmd, makeDeps(s, 'WEEKLY_SHIPPING', 'SAD-1'));
  eq(r.status, 'COMPLETED', 'E: shipping edit COMPLETED');
  var l = mrow(s, 'shipping_allocation_draft_lines')[0];
  eq([l.planned_qty, l.selected_shipping_method, l.note], [42, 'AIR', 'expedite'], 'E: planned_qty + method + note updated');
  eq(l.recommended_qty, 50, 'E: recommended_qty snapshot unchanged');
  eq([l.user_edited, l.user_edited_by], ['TRUE', 'planner'], 'E: explicit provenance');
  // stale token
  var tok2 = tokenOf(s, 'SAD-1', 'WEEKLY_SHIPPING', 1);
  s.shipping_allocation_draft_lines.rows[0][s.shipping_allocation_draft_lines.headers.indexOf('planned_qty')] = 7;
  var r2 = KMUE.runUserDecisionEdit(cmd, makeDeps(s, 'WEEKLY_SHIPPING', 'SAD-1'));
  eq(r2.status, 'CONFLICT', 'E: shipping stale token → CONFLICT');
})();

section('F. determinism + release safety + validation');
(function () {
  var s1 = seedMonthly(), s2 = seedMonthly();
  var a = KMUE.runUserDecisionEdit(editCmd({ expectedToken: tokenOf(s1, 'RAD-1', 'MONTHLY_ORDER', 1) }), makeDeps(s1, 'MONTHLY_ORDER', 'RAD-1'));
  var b = KMUE.runUserDecisionEdit(editCmd({ expectedToken: tokenOf(s2, 'RAD-1', 'MONTHLY_ORDER', 1) }), makeDeps(s2, 'MONTHLY_ORDER', 'RAD-1'));
  eq(a, b, 'F: same inputs → identical DTO (deterministic)');
  // applyEdits throws → FAILED, release once
  var s3 = seedMonthly();
  var d3 = makeDeps(s3, 'MONTHLY_ORDER', 'RAD-1', { applyThrow: true });
  var r3 = KMUE.runUserDecisionEdit(editCmd({ expectedToken: tokenOf(s3, 'RAD-1', 'MONTHLY_ORDER', 1) }), d3);
  ok(r3.status === 'FAILED' && r3.reason.indexOf('EXCEPTION:') === 0, 'F: applyEdits throw → FAILED');
  eq(d3._c.release, 1, 'F: release once on exception');
  // release throw → does not hide COMPLETED
  var s4 = seedMonthly();
  var r4 = KMUE.runUserDecisionEdit(editCmd({ expectedToken: tokenOf(s4, 'RAD-1', 'MONTHLY_ORDER', 1) }), makeDeps(s4, 'MONTHLY_ORDER', 'RAD-1', { releaseThrow: true }));
  ok(r4.status === 'COMPLETED' && r4.issues.length === 1 && r4.issues[0].indexOf('RELEASE_FAILED:') === 0, 'F: release failure reported, primary success preserved');
  // validation
  var threw = false; try { KMUE.runUserDecisionEdit({ recommendationType: 'X' }, makeDeps(seedMonthly(), 'MONTHLY_ORDER', 'RAD-1')); } catch (e) { threw = e instanceof TypeError; }
  ok(threw, 'F: bad recommendationType → TypeError');
  eq(Object.keys(KMUE.STATUS).sort(), ['BLOCKED_CONFLICT', 'COMPLETED', 'CONFLICT', 'FAILED', 'LOCK_UNAVAILABLE'], 'F: five canonical status tokens');
})();

// ==========================================================================
console.log('');
if (fail) { console.error('\n' + fail + ' assertion(s) FAILED (' + pass + ' passed).'); process.exit(1); }
console.log('All Round 1H Locked User Decision Edit assertions passed (' + pass + ' assertions).');
