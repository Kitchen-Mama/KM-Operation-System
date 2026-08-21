// Kitchen Mama Operation System — MONTHLY flat V2 FRONTEND + edit/submit/Send app layer — F1-7N-FA-3C-DRAFT-MODEL-R2b-3.
// Run: node assets/tests/request-order-v2-frontend-app-f1-7n-fa-3c-r2b3.test.js
// Proves the MONTHLY_ORDER flat V2 application layer is code-ready end-to-end: flat readback DTO -> frontend UI
// projection -> per-tier edit -> per-tier submit -> Send Request explosion, with NO child-line id anywhere and the
// formal request contract unchanged. Pure / tests-only: no Sheets, no live DB, no DOM. Cutover flag stays OFF (this
// suite drives the flat pure core + adapters directly; the .gs dispatch is cutover-gated and dormant live).

'use strict';
var fs = require('fs'), path = require('path');
var KMRDV2 = require('../js/core/supply-planning-request-draft-v2.js');
var P = require('../js/core/supply-planning-request-draft-v2-persistence.js');
var KMPR = require('../js/core/supply-planning-persistence-repository.js');

var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }

// ---- extract + eval the request-order.js pure adapter block (between the __RO_EDIT_PURE__ markers) --------------
var roSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'request-order.js'), 'utf8').replace(/\r\n/g, '\n');
var pureStart = roSrc.indexOf('// __RO_EDIT_PURE_START__'), pureEnd = roSrc.indexOf('// __RO_EDIT_PURE_END__');
ok(pureStart !== -1 && pureEnd > pureStart, 'harness: pure adapter block present in request-order.js');
var pureBlock = roSrc.slice(pureStart, pureEnd);
// eval the block + return an object literal capturing the declarations (strict-mode eval keeps its own scope).
var _RO = eval(pureBlock + '\n;({ _roBuildOrderQtyEditCommand_: _roBuildOrderQtyEditCommand_, _roV2IsFlatDraft_: _roV2IsFlatDraft_, _roV2NormalizeFlatDraft_: _roV2NormalizeFlatDraft_, _roV2BuildSendLinesFromFlat_: _roV2BuildSendLinesFromFlat_ })');
var _roBuildOrderQtyEditCommand_ = _RO._roBuildOrderQtyEditCommand_;
var _roV2IsFlatDraft_ = _RO._roV2IsFlatDraft_;
var _roV2NormalizeFlatDraft_ = _RO._roV2NormalizeFlatDraft_;
var _roV2BuildSendLinesFromFlat_ = _RO._roV2BuildSendLinesFromFlat_;

// ---- fixtures --------------------------------------------------------------
var SCOPE = { company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'GA0450', draft_purpose: 'regular' };
function fresh() { var s = KMPR.createSheetSet(); s.request_order_allocation_drafts.headers = KMRDV2.V2_HEADERS.slice(); s.recommendation_calculation_runs.headers = KMPR.RUN_JOURNAL_HEADERS.slice(); return s; }
function deps(s) { return {
  loadActiveContext: function (q) { return P.loadActiveFlat(s, q); },
  loadById: function (id) { return P.loadFlatById(s, id); },
  computeFacts: function () { return { ready: true, lines: [
    { request_bucket: 'T1', request_month: '2026-09', recommended_qty: 100, units_per_carton: 10 },
    { request_bucket: 'T2', request_month: '2026-10', recommended_qty: 200 },
    { request_bucket: 'T3', request_month: '2026-11', recommended_qty: 0 }
  ], provenance: { calculationRunId: 'RUN-A', formulaVersion: 'ORDER_PLANNING_GAP', sourceDataAsOf: '2026-08-20' } }; },
  lockedApply: function (plan, tok, o) { return P.applyFlat(s, plan, tok, o); }
}; }
function makeDraft(s) { return P.generateMonthlyFlat({ recommendationType: 'MONTHLY_ORDER', mode: 'ai_plan', planningCycle: '2026-09', businessScope: SCOPE, actor: 'sys', now: 'T0' }, deps(s)); }
function dtoOf(s, id) { return P.flatReadbackDto(P.loadFlatById(s, id).row); }

// ==========================================================================
var s = fresh(); var g = makeDraft(s); var id = g.draftId; var dto0 = dtoOf(s, id);

section('1-7 flat DTO → T1/T2/T3 UI projection (one normalization seam; no child-line id; no T4)');
ok(_roV2IsFlatDraft_(dto0) === true, '1a flat DTO detected (tiers[] + scope)');
ok(_roV2IsFlatDraft_({ header: {}, lines: [] }) === false, '1b legacy {header,lines} DTO NOT treated as flat');
var norm = _roV2NormalizeFlatDraft_(dto0);
eq(Object.keys(norm.lines).sort(), ['T1', 'T2', 'T3'], '1 projects exactly T1/T2/T3');
ok(norm.draftId === id && norm.model === 'flat_v2' && norm.status === 'draft', '1 carries draftId/status/model');
ok(norm.lines.T1.request_month === '2026-09' && norm.lines.T1.request_bucket === 'T1', '3 month/bucket projected');
ok(norm.lines.T1.recommended_qty === 100 && norm.lines.T2.recommended_qty === 200, '3 Suggested from recommendedQty');
ok(norm.lines.T1.order_qty === 100 && norm.lines.T2.order_qty === 200, '4 Order Qty from orderQty');
ok(norm.lines.T1.carton_qty === 10, '5 Carton from cartonQty (100/10)');
ok(norm.lines.T1.note === '', '6 Note projected');
ok(!('request_allocation_line_id' in norm.lines.T1) && !('request_allocation_line_id' in norm.lines.T2), '2 NO request_allocation_line_id in the UI model');
ok(norm.lines.T4 === undefined, '7 no T4 projection from V2');

section('8-11 per-tier EDIT (flat) — T2 only; recommendation protected; user_edited stamped; stale token blocked');
var s2 = fresh(); var g2 = makeDraft(s2); var id2 = g2.draftId;
var tok2 = P.tokenForDraft(s2, id2).expectedToken;
var eRes = P.editMonthlyFlat({ draftId: id2, edits: [{ naturalKey: { request_bucket: 'T2', request_month: '2026-10' }, fields: { order_qty: 250, note: 'bump' } }], expectedToken: tok2, actor: 'user', now: 'E1' }, deps(s2));
var row2 = P.loadFlatById(s2, id2).row;
ok(eRes.wrote === true && eRes.outcome === 'EDITED', '8 edit persisted');
ok(row2.t2_order_qty === 250 && row2.t2_user_edited === true && row2.t2_user_edited_by === 'user', '10 T2 order_qty + user_edited stamped');
ok(row2.t1_order_qty === 100 && row2.t1_user_edited === false && row2.t3_order_qty === 0, '8 T1/T3 untouched by a T2 edit');
ok(row2.t2_recommended_qty === 200 && row2.t1_recommended_qty === 100, '9 recommended_qty NEVER rewritten by a user edit');
var staleEdit = P.editMonthlyFlat({ draftId: id2, edits: [{ naturalKey: { request_bucket: 'T1' }, fields: { order_qty: 7 } }], expectedToken: { draft_version: 1, userEditFingerprint: 'stale' }, actor: 'user', now: 'E2' }, deps(s2));
ok(staleEdit.outcome === 'CONFLICT' && staleEdit.wrote !== true, '11 stale optimistic token → CONFLICT, no write');
ok(_roBuildOrderQtyEditCommand_(id2, '2026-10', 'T2', 250, tok2).edits[0].naturalKey.request_bucket === 'T2', '11 frontend edit command shape unchanged (dispatch by backend)');

section('12-17 per-tier SUBMIT (flat) — partial → full; zero not submittable; submitted/cancelled protected');
var s3 = fresh(); var g3 = makeDraft(s3); var id3 = g3.draftId;
var subT1 = P.submitMonthlyFlat({ draftId: id3, buckets: ['T1'], expectedToken: P.tokenForDraft(s3, id3).expectedToken, actor: 'user', now: 'S1' }, deps(s3));
var row3 = P.loadFlatById(s3, id3).row;
ok(subT1.results.T1 === 'SUBMITTED' && row3.t1_status === 'submitted', '12 submit T1 only');
eq(row3.status, 'partially_submitted', '13 partial header status (T1 submitted, T2 draft, T3 zero)');
ok(row3.t2_status === 'draft' && row3.t3_status === 'draft', '13 T2/T3 remain draft');
var subT2 = P.submitMonthlyFlat({ draftId: id3, buckets: ['T2'], expectedToken: P.tokenForDraft(s3, id3).expectedToken, actor: 'user', now: 'S2' }, deps(s3));
eq(P.loadFlatById(s3, id3).row.status, 'submitted', '14 full header status after T2 (T3 zero never blocks)');
var subZero = P.submitMonthlyFlat({ draftId: id3, buckets: ['T3'], expectedToken: P.tokenForDraft(s3, id3).expectedToken, actor: 'user', now: 'S3' }, deps(s3));
ok(subZero.success === false && subZero.error === 'NO_TIER_SUBMITTED', '15 zero-qty tier not submittable');
var editSubmitted = P.editMonthlyFlat({ draftId: id3, edits: [{ naturalKey: { request_bucket: 'T1' }, fields: { order_qty: 9 } }], expectedToken: P.tokenForDraft(s3, id3).expectedToken, actor: 'user', now: 'E3' }, deps(s3));
ok(editSubmitted.success === false && editSubmitted.results[0].reason === 'TIER_TERMINAL', '17 submitted tier protected from edit');
var s4 = fresh(); var g4 = makeDraft(s4); var id4 = g4.draftId;
P.cancelMonthlyFlat({ draftId: id4, expectedToken: P.tokenForDraft(s4, id4).expectedToken, actor: 'user', now: 'C1', reason: 't' }, deps(s4));
var subCancelled = P.submitMonthlyFlat({ draftId: id4, buckets: ['T1'], expectedToken: P.tokenForDraft(s4, id4).expectedToken, actor: 'user', now: 'C2' }, deps(s4));
ok(subCancelled.success === false && subCancelled.error === 'HEADER_CANCELLED', '16 cancelled header protected from submit');

section('18-24 Send Request explosion + formal contract (no line id; deterministic RD id; no RAD)');
var s5 = fresh(); var g5 = makeDraft(s5); var id5 = g5.draftId; var dto5 = dtoOf(s5, id5);
var sendFrontend = _roV2BuildSendLinesFromFlat_(dto5);
var sendKM = KMRDV2.explodeSendRequestLinesFromDto(dto5);
var sendCore = P.buildSendRequestLines(dto5);
eq(sendFrontend, sendKM, '18 frontend Send lines == KMRDV2 authority (no independent tier rederivation)');
eq(sendCore, sendKM, '18 KMRDV2P.buildSendRequestLines == KMRDV2 authority');
eq(sendKM.map(function (l) { return l.request_bucket + ':' + l.requested_qty; }), ['T1:100', 'T2:200'], '18/19 T1+T2 exploded, T3(zero) skipped');
ok(sendKM.every(function (l) { return !('request_allocation_line_id' in l); }), '20 NO request_allocation_line_id in the request payload');
ok(sendKM.every(function (l) { return l.request_allocation_draft_id === id5; }), '22 draft lineage FK = request_allocation_draft_id');
var l0 = sendKM[0];
eq(Object.keys(l0).sort(), ['carton_qty', 'company', 'country', 'marketplace', 'request_allocation_draft_id', 'request_bucket', 'request_month', 'requested_qty', 'sku', 'units_per_carton'], '21 formal request-line payload shape (consumed verbatim by handleCreateRequestOrderDraft_)');
ok(/^RD::MONTHLY_ORDER::2026-09::/.test(id5) && !/RAD-/.test(id5), '23/24 deterministic RD id; no new RAD write');

section('25-27 flat readback after edit / submit / Send reflects persisted state');
var s6 = fresh(); var g6 = makeDraft(s6); var id6 = g6.draftId;
P.editMonthlyFlat({ draftId: id6, edits: [{ naturalKey: { request_bucket: 'T1' }, fields: { order_qty: 111 } }], expectedToken: P.tokenForDraft(s6, id6).expectedToken, actor: 'user', now: 'E' }, deps(s6));
ok(_roV2NormalizeFlatDraft_(dtoOf(s6, id6)).lines.T1.order_qty === 111, '25 readback after edit shows new order_qty');
P.submitMonthlyFlat({ draftId: id6, buckets: ['T1'], expectedToken: P.tokenForDraft(s6, id6).expectedToken, actor: 'user', now: 'S' }, deps(s6));
ok(_roV2NormalizeFlatDraft_(dtoOf(s6, id6)).lines.T1.line_status === 'submitted', '26 readback after submit shows submitted tier');
ok(s6.request_order_allocation_draft_lines.rows.length === 0, '27 Send/readback path never wrote a child-line row');

section('28-32 cutover OFF legacy shape / cutover ON flat / weekly / AI panel / business math');
var legacyDraft = { header: { sku: 'X', request_allocation_draft_id: 'RD::x', draft_version: 1, status: 'draft' }, lines: [{ request_bucket: 'T1', request_month: '2026-09', order_qty: 5, recommended_qty: 5 }] };
ok(_roV2IsFlatDraft_(legacyDraft) === false, '28 cutover-OFF legacy {header,lines} still recognized as legacy (frontend adapts to shape sent)');
ok(_roV2IsFlatDraft_(dto5) === true, '29 cutover-ON flat DTO recognized + fully wired (edit/submit/send proven above)');
ok(KMPR.TABLES.WEEKLY_SHIPPING.header === 'shipping_allocation_drafts' && KMPR.TABLES.WEEKLY_SHIPPING.userQty === 'planned_qty', '30 WEEKLY engine untouched');
ok(/_roRenderAiPlanResult_/.test(roSrc) && /_roSetAiPlanResult_/.test(roSrc) && /reasonCounts/.test(roSrc), '31 AI Plan result panel (reasonCounts / terminal counts) preserved in request-order.js');
// business math: recommended never changes; send qty == order_qty
ok(dto5.tiers[0].recommendedQty === 100 && sendKM[0].requested_qty === dto5.tiers[0].orderQty, '32 no business-math change (recommended untouched; requested_qty = order_qty)');

// ==========================================================================
console.log('\n' + '-'.repeat(40));
console.log('MONTHLY V2 FRONTEND/APP LAYER (F1-7N-FA-3C-R2b-3): ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
