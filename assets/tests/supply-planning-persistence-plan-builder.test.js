// Kitchen Mama Operation System — Persistence Plan Builder tests (Phase 2C, Round 1G).
// Run: node assets/tests/supply-planning-persistence-plan-builder.test.js
// Pure Node — exercises assets/js/core/supply-planning-persistence-plan-builder.js. Drives the real chain
// Plan Builder → Persistence Core → Persistence Plan Builder → Repository apply (fake sheet). Verifies the PA-7
// diff: header INSERT/UPDATE, line INSERT/UPDATE/SUPERSEDE, edited-line preservation, blocked lines, lineageOps,
// totals, auditEvents, deterministic order, no Sheet refs, expectedToken captured from PRIOR state.

'use strict';
var PPB = require('../js/core/supply-planning-persistence-plan-builder.js');
var PB = require('../js/core/supply-planning-plan-builder.js');
var CORE = require('../js/core/supply-planning-persistence.js');
var REPO = require('../js/core/supply-planning-persistence-repository.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function throwsType(fn, l) { try { fn(); } catch (e) { if (e instanceof TypeError) { pass++; return; } fail++; console.error('FAIL ' + l + ' (threw ' + (e && e.name) + ')'); return; } fail++; console.error('FAIL ' + l + ' (no throw)'); }
function section(n) { console.log('\n== ' + n + ' =='); }

var SEP = PB.SEP;
var SCOPE_M = { planning_cycle: '2026-08', company: 'KM', country: 'US', marketplace: 'AMAZON_US', draft_purpose: 'regular', sku: 'GA0450' };

var H = {
  request_order_allocation_drafts: ['request_allocation_draft_id', 'planning_cycle', 'company', 'country', 'marketplace', 'draft_purpose', 'sku', 'status', 'generation_type', 'calculation_run_id', 'formula_version', 'calculated_at', 'source_data_as_of', 'draft_version', 'created_by', 'created_at', 'updated_by', 'updated_at'],
  request_order_allocation_draft_lines: ['request_allocation_line_id', 'request_allocation_draft_id', 'request_month', 'request_bucket', 'recommended_qty', 'order_qty', 'carton_qty', 'units_per_carton', 'allocation_method', 'recommendation_reason', 'recommendation_flags', 'line_status', 'submitted_by', 'submitted_at', 'user_edited', 'user_edited_by', 'updated_at']
};
function sheet() {
  var s = REPO.createSheetSet();
  Object.keys(H).forEach(function (t) { s[t].headers = H[t].slice(); });
  s[REPO.RUN_JOURNAL_TABLE].headers = REPO.RUN_JOURNAL_HEADERS.slice();
  return s;
}
function rows(s, t) { return s[t].rows.map(function (r) { var o = {}; s[t].headers.forEach(function (h, i) { o[h] = r[i]; }); return o; }); }

function mCmd(lines, mode) {
  return PB.buildRecommendation({
    recommendationType: 'MONTHLY_ORDER', mode: mode || 'SCHEDULED_REFRESH', planningCycle: '2026-08', businessScope: SCOPE_M,
    calculationRunId: 'RUN-IGNORED', formulaVersion: 'v4.7', sourceDataAsOf: '2026-08-03', draftVersion: 1, lines: lines
  });
}
function mLineFact(bucket, rec, extra) {
  var f = { request_month: '2026-08', request_bucket: bucket, recommendedQty: rec, snapshotRow: { carton_qty: Math.ceil(rec / 20), units_per_carton: 20, allocation_method: 'ENGINE_B' } };
  if (extra) for (var k in extra) f[k] = extra[k];
  return f;
}
function identityFrom(store, result) {
  var d = store.drafts.filter(function (x) { return x.draftId === result.draftId; })[0];
  return { draftId: result.draftId, activeKey: d.activeKey, businessScopeKey: REPO.buildBusinessScopeKey('MONTHLY_ORDER', SCOPE_M) };
}
function tokenFromStore(store, draftId, version) {
  var lines = store.lines.filter(function (l) { return l.draftId === draftId; }).map(function (l) { return { lineKey: l.lineKey, userQty: l.userQty, userEdited: l.userEdited }; });
  return REPO.computeExpectedToken(version, lines);
}
function tokenFromSheet(s, draftId, version) {
  var snap = REPO.loadDraftSnapshot(s, draftId, 'MONTHLY_ORDER');
  return REPO.computeExpectedToken(version, snap.lines.map(function (l) { return { lineKey: l.lineKey, userQty: l.userQty, userEdited: l.userEdited }; }));
}
function buildPlan(prevStore, gen, out, token) {
  return PPB.buildPersistencePlan({
    recommendationType: 'MONTHLY_ORDER', identity: identityFrom(gen.store, gen.result),
    prevStore: prevStore, nextStore: gen.store, coreResult: gen.result, command: out.command,
    lineDetails: out.lineDetails, generationType: out.generationType, expectedToken: token, actor: 'sys', now: 'T'
  });
}

// ==========================================================================
section('A. CREATE — header INSERT + line INSERTs, applies to empty sheet');
(function () {
  var out = mCmd([mLineFact('T1', 100), mLineFact('T2', 137)]);
  var gen = CORE.generateRecommendationDraft(CORE.createStore(), out.command);
  eq(gen.result.action, 'CREATE', 'A: Core action CREATE');
  var token = tokenFromStore({ drafts: [], lines: [], runs: [] }, gen.result.draftId, 1);
  var plan = buildPlan({ drafts: [], lines: [], runs: [] }, gen, out, token);
  eq(plan.headerOp.op, 'INSERT', 'A: header INSERT for new draft');
  eq(plan.headerOp.row.generation_type, 'scheduled', 'A: generation_type mapped onto header');
  eq(plan.lineOps.length, 2, 'A: two line INSERT ops');
  ok(plan.lineOps.every(function (o) { return o.op === 'INSERT'; }), 'A: all INSERT');
  eq(plan.stages, REPO.STAGES, 'A: frozen stage sequence');
  ok(plan.expectedToken === token, 'A: expectedToken passed through (from prior state)');
  // applies cleanly through the real repository
  var s = sheet();
  var res = REPO.applyPersistencePlan(s, plan, token, { now: 'T', actor: 'sys' });
  eq(res.runStatus, 'COMPLETED', 'A: repository apply COMPLETED');
  var lr = rows(s, 'request_order_allocation_draft_lines');
  eq(lr.length, 2, 'A: two lines written');
  var t1 = lr.filter(function (r) { return r.request_bucket === 'T1'; })[0];
  eq([t1.recommended_qty, t1.order_qty, t1.line_status, t1.user_edited], [100, 100, 'active', 'FALSE'], 'A: recommended snapshot + order_qty init + active + user_edited FALSE');
  eq(t1.carton_qty, 5, 'A: carton snapshot preserved (100/20)');
  var t2 = lr.filter(function (r) { return r.request_bucket === 'T2'; })[0];
  eq(t2.recommended_qty, 137, 'A: partial-carton recommended snapshot exact (137)');
  eq(t2.order_qty, 137, 'A: order_qty initialized to recommended (137)');
})();

section('B. determinism + serialization + validation');
(function () {
  var out = mCmd([mLineFact('T1', 100), mLineFact('T2', 60)]);
  var g1 = CORE.generateRecommendationDraft(CORE.createStore(), out.command);
  var g2 = CORE.generateRecommendationDraft(CORE.createStore(), out.command);
  var tok = tokenFromStore({ drafts: [], lines: [], runs: [] }, g1.result.draftId, 1);
  var p1 = buildPlan({ drafts: [], lines: [], runs: [] }, g1, out, tok);
  var p2 = buildPlan({ drafts: [], lines: [], runs: [] }, g2, out, tok);
  eq(p1, p2, 'B: same inputs → identical plan (deterministic)');
  // no Sheet/Range/function references anywhere in the serialized plan
  var json = JSON.stringify(p1);
  ok(json.indexOf('function') === -1, 'B: plan is JSON-safe (no function refs)');
  ok(REPO.validatePersistencePlan(p1) === true, 'B: plan passes the frozen PA-7 validator');
  // stable line-op ordering by natural key
  eq(p1.lineOps.map(function (o) { return o.naturalKey.request_bucket; }), ['T1', 'T2'], 'B: line ops stable-ordered by natural key');
  // expectedToken is mandatory + must be the prior token (not synthesized)
  throwsType(function () {
    PPB.buildPersistencePlan({ recommendationType: 'MONTHLY_ORDER', identity: identityFrom(g1.store, g1.result), prevStore: { drafts: [], lines: [], runs: [] }, nextStore: g1.store, coreResult: g1.result, command: out.command, lineDetails: out.lineDetails, generationType: out.generationType });
  }, 'B: missing expectedToken → TypeError (never synthesized from next store)');
})();

section('C. REGENERATE — header UPDATE + line UPDATE (existing draft)');
(function () {
  var out1 = mCmd([mLineFact('T1', 100)]);
  var g1 = CORE.generateRecommendationDraft(CORE.createStore(), out1.command);
  var out2 = mCmd([mLineFact('T1', 120)], 'MANUAL_REGENERATE'); // no user edits → confirmation not required
  var g2 = CORE.generateRecommendationDraft(g1.store, out2.command);
  eq(g2.result.action, 'REGENERATE', 'C: Core action REGENERATE');
  eq(g2.result.draftVersion, 2, 'C: draft_version bumped on regenerate');
  var tok = tokenFromStore(g1.store, g2.result.draftId, 1);
  var plan = buildPlan(g1.store, g2, out2, tok);
  eq(plan.headerOp.op, 'UPDATE', 'C: header UPDATE (draft existed)');
  eq(plan.headerOp.row.generation_type, 'manual_refresh', 'C: manual_refresh generation_type on regenerate');
  eq(plan.lineOps[0].op, 'UPDATE', 'C: existing line → UPDATE');
  eq(plan.draftVersion, 2, 'C: plan draft_version = 2');
})();

section('D. SUPERSEDE + edited-line preservation (end-to-end apply)');
(function () {
  var s = sheet();
  var out1 = mCmd([mLineFact('T1', 100), mLineFact('T2', 60)]);
  var g1 = CORE.generateRecommendationDraft(CORE.createStore(), out1.command);
  var tok1 = tokenFromStore({ drafts: [], lines: [], runs: [] }, g1.result.draftId, 1);
  REPO.applyPersistencePlan(s, buildPlan({ drafts: [], lines: [], runs: [] }, g1, out1, tok1), tok1, { now: 'T', actor: 'sys' });
  var draftId = g1.result.draftId, t1key = '2026-08' + SEP + 'T1';
  // user edits T1 order_qty to a partial-carton value — mirror to BOTH the sheet and the Core store (reloaded-store parity)
  var lr = s.request_order_allocation_draft_lines; var Hl = lr.headers;
  lr.rows.forEach(function (r) { if (r[Hl.indexOf('request_bucket')] === 'T1') { r[Hl.indexOf('order_qty')] = 137; r[Hl.indexOf('user_edited')] = 'TRUE'; r[Hl.indexOf('user_edited_by')] = 'planner'; } });
  var edited = CORE.applyUserEdit(g1.store, { draftId: draftId, lineKey: t1key, userQty: 137, actor: 'planner' });
  // scheduled refresh that DROPS T2 → T2 superseded; T1 kept with the edit preserved
  var out2 = mCmd([mLineFact('T1', 100)], 'SCHEDULED_REFRESH');
  var g2 = CORE.generateRecommendationDraft(edited.store, out2.command);
  var t2line = g2.store.lines.filter(function (l) { return l.lineKey === '2026-08' + SEP + 'T2'; })[0];
  eq(t2line.lineStatus, 'SUPERSEDED', 'D: Core superseded the removed (unedited) T2');
  var tok2 = tokenFromSheet(s, draftId, 1);
  var plan2 = buildPlan(edited.store, g2, out2, tok2);
  // ops: T1 UPDATE with preserveUserQty; T2 SUPERSEDE
  var t1op = plan2.lineOps.filter(function (o) { return o.naturalKey.request_bucket === 'T1'; })[0];
  var t2op = plan2.lineOps.filter(function (o) { return o.naturalKey.request_bucket === 'T2'; })[0];
  eq([t1op.op, t1op.preserveUserQty], ['UPDATE', true], 'D: edited T1 → UPDATE + preserveUserQty');
  eq([t2op.op, t2op.targetLineStatus], ['SUPERSEDE', 'superseded'], 'D: removed T2 → SUPERSEDE (superseded)');
  var res2 = REPO.applyPersistencePlan(s, plan2, tok2, { now: 'T2', actor: 'sys' });
  eq(res2.runStatus, 'COMPLETED', 'D: refresh apply COMPLETED');
  var lr2 = rows(s, 'request_order_allocation_draft_lines');
  var t1r = lr2.filter(function (r) { return r.request_bucket === 'T1'; })[0];
  eq(t1r.order_qty, 137, 'D: user-edited order_qty PRESERVED across refresh (not reset to 100)');
  eq(t1r.recommended_qty, 100, 'D: recommended snapshot present');
  var t2r = lr2.filter(function (r) { return r.request_bucket === 'T2'; })[0];
  eq(t2r.line_status, 'superseded', 'D: T2 superseded on sheet (never hard-deleted)');
  eq(lr2.length, 2, 'D: no hard deletion');
})();

section('E. edited removed line → superseded_user_review');
(function () {
  var out1 = mCmd([mLineFact('T1', 100), mLineFact('T2', 60)]);
  var g1 = CORE.generateRecommendationDraft(CORE.createStore(), out1.command);
  var edited = CORE.applyUserEdit(g1.store, { draftId: g1.result.draftId, lineKey: '2026-08' + SEP + 'T2', userQty: 55, actor: 'planner' });
  var out2 = mCmd([mLineFact('T1', 100)], 'SCHEDULED_REFRESH'); // drop the EDITED T2
  var g2 = CORE.generateRecommendationDraft(edited.store, out2.command);
  var tok = tokenFromStore(edited.store, g1.result.draftId, 1);
  var plan = buildPlan(edited.store, g2, out2, tok);
  var t2op = plan.lineOps.filter(function (o) { return o.naturalKey.request_bucket === 'T2'; })[0];
  eq([t2op.op, t2op.targetLineStatus], ['SUPERSEDE', 'superseded_user_review'], 'E: removed EDITED line → superseded_user_review (never deleted)');
})();

section('F. blocked line — no fabricated qty; lineage + totals + audit');
(function () {
  var out = mCmd([mLineFact('T1', 100), { request_month: '2026-08', request_bucket: 'T2', blocked: true, reason: 'DEMAND_SOURCE_QTY_CONFLICT' }]);
  var gen = CORE.generateRecommendationDraft(CORE.createStore(), out.command);
  var tok = tokenFromStore({ drafts: [], lines: [], runs: [] }, gen.result.draftId, 1);
  var plan = buildPlan({ drafts: [], lines: [], runs: [] }, gen, out, tok);
  var blk = plan.lineOps.filter(function (o) { return o.naturalKey.request_bucket === 'T2'; })[0];
  eq(blk.targetLineStatus, 'blocked', 'F: blocked line op targetLineStatus=blocked');
  eq(blk.row.recommended_qty, '', 'F: blocked recommended_qty blank (never fabricated 0)');
  ok(blk.row.order_qty === undefined, 'F: blocked line carries no order_qty');
  // lineageOps only for active/blocked present lines (2), totals from Core, audit deterministic
  eq(plan.lineageOps.length, 2, 'F: lineageOps for present lines');
  eq(plan.totals.blockedCount, 1, 'F: totals.blockedCount from Core');
  eq(plan.totals.activeLineCount, 1, 'F: totals.activeLineCount from Core');
  eq(plan.auditEvents.length, 1, 'F: one deterministic audit event');
  eq([plan.auditEvents[0].recommendationType, plan.auditEvents[0].generationType, plan.auditEvents[0].blocked], ['MONTHLY_ORDER', 'scheduled', 1], 'F: audit event records type/generation/blocked');
  // applies cleanly
  var s = sheet();
  var res = REPO.applyPersistencePlan(s, plan, tok, { now: 'T', actor: 'sys' });
  eq(res.runStatus, 'COMPLETED', 'F: blocked plan applies COMPLETED');
  var t2 = rows(s, 'request_order_allocation_draft_lines').filter(function (r) { return r.request_bucket === 'T2'; })[0];
  eq(t2.line_status, 'blocked', 'F: blocked persisted');
  ok(t2.order_qty === '' || t2.order_qty === undefined || t2.order_qty === null, 'F: blocked order_qty not fabricated');
})();

// ==========================================================================
console.log('');
if (fail) { console.error('\n' + fail + ' assertion(s) FAILED (' + pass + ' passed).'); process.exit(1); }
console.log('All Round 1G Persistence Plan Builder assertions passed (' + pass + ' assertions).');
