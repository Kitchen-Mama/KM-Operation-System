// F1-4B-FM6-R4E4 — Send Request canonical draft lifecycle + active-draft collision closure.
// Proves Send Request no longer creates a competing active allocation row: a canonical (AI-Plan) draft is CONFIRMED
// in place (draft → site_confirmed) via its id under the optimistic-lock token (recommended_qty / generation_type /
// lines preserved), the confirmed quantity is the canonical persisted order_qty, stale tokens FAIL CLOSED, real
// duplicates still FAIL CLOSED (getActive unchanged), T4 stays non-actionable, and no frontend recommendation/gap
// recompute is introduced. Pure helpers are eval'd; the rest are source guards over request-order.js + 15_ + 47_.
// Run: node assets/tests/send-request-lifecycle-f1-4b-fm6r4e4.test.js
// NOTE: no 'use strict' — extracted helpers are eval'd into module scope.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '('); if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}

var RO = read('js/pages/request-order.js');
var GS15 = read('specs/active/apps-script/15_request_allocation_handlers.gs');
var GS47 = read('specs/active/apps-script/47_api_v1_recommendation_generation.gs');
var send = extractFn(RO, 'handleSendRequest');

// ---- eval the pure Send quantity helper (canonical persisted order_qty vs manual effective) ----
var _canonRow = null;
function _roCanonicalRowFor_(sku, bucket) { return _canonRow; }
var _effValue = null;
function _roEffectiveOrderQty(item, idx, edit) { return _effValue; }
eval(extractFn(RO, '_roSendOrderQty_'));

console.log('\n== §10 Send quantity authority (A/B/H) ==');
_canonRow = { line: { order_qty: 1000 } }; _effValue = 555;
eq(_roSendOrderQty_({ sku: 'X' }, 0, 'T1', {}), 1000, 'A canonical persisted order_qty (1000) wins over any live value');
_canonRow = { line: { order_qty: 800 } };
eq(_roSendOrderQty_({ sku: 'X' }, 0, 'T1', {}), 800, 'B edited persisted order_qty (800) is the confirmed quantity');
_canonRow = null; _effValue = 320;
eq(_roSendOrderQty_({ sku: 'X' }, 0, 'T1', {}), 320, 'H no canonical draft → manual effective value (NO AI recompute)');
_canonRow = { line: { order_qty: '' } }; _effValue = 77;
eq(_roSendOrderQty_({ sku: 'X' }, 0, 'T1', {}), 77, 'blank canonical order_qty → manual effective fallback (never a fabricated 0)');

console.log('\n== §9 backend optimistic-lock verify (F) ==');
// stub the bundle authority the backend confirm reuses
var _snap = { draft: { draft_version: 2 }, lines: [] };
var KMPR = {
  TABLES: { MONTHLY_ORDER: { header: 'request_order_allocation_drafts', lines: 'request_order_allocation_draft_lines' } },
  RUN_JOURNAL_TABLE: 'recommendation_run_journal',
  loadDraftSnapshot: function () { return _snap; },
  computeExpectedToken: function (dv, lines) { return { draft_version: dv, userEditFingerprint: 'FP-' + (lines ? lines.length : 0) }; }
};
function rprBuildSheetSet_() { return { set: {} }; }
var SpreadsheetApp = { getActiveSpreadsheet: function () { return {}; } };
eval(extractFn(GS15, 'raVerifyDraftToken_'));
eq(raVerifyDraftToken_('D1', { draft_version: 2, userEditFingerprint: 'FP-0' }), { ok: true }, 'F token match → ok (confirmation proceeds)');
eq(raVerifyDraftToken_('D1', { draft_version: 1, userEditFingerprint: 'FP-0' }).error, 'CONCURRENCY_TOKEN_MISMATCH', 'F stale draft_version → CONCURRENCY_TOKEN_MISMATCH (fail closed)');
eq(raVerifyDraftToken_('D1', { draft_version: 2, userEditFingerprint: 'STALE' }).error, 'CONCURRENCY_TOKEN_MISMATCH', 'F stale line fingerprint → fail closed (no overwrite)');
eq(raVerifyDraftToken_('D1', null), { ok: true }, 'no token supplied → check skipped (backward compatible)');
_snap = { draft: null };
eq(raVerifyDraftToken_('D1', { draft_version: 2, userEditFingerprint: 'FP-0' }).error, 'DRAFT_NOT_FOUND', 'missing draft → fail closed');

console.log('\n== F1-7N-FB-3B §E: the lifecycle invariants, re-asserted at their NEW OWNER (66_) ==');
// THE BUSINESS INVARIANTS BELOW ARE UNCHANGED. What changed is WHERE they execute. FB-3B retires the browser's
// per-SKU saga (§B/§C/§E) because a display filter could truncate it and a closed tab could abandon it. Each
// assertion is therefore relocated to the server orchestration, and several are STRENGTHENED on the way:
//   · "confirm in place, never a competing active row" -> the orchestration NEVER creates or confirms a draft at
//     all. It consumes only rows that are ALREADY persisted, so a competing active row cannot arise from a Send.
//   · "manual SKU creates one canonical draft during Send" -> RETIRED by §C (reported as a canonical conflict):
//     a raw AI Plan row without a persisted canonical draft may not enter the workset.
//   · "stale token aborts before any downstream write" -> replaced by a full QUANTITY read-back barrier that
//     blocks the ENTIRE Send on any drift, absence or unsaved edit.
//   · "submit runs after request execution" -> now create -> PROVE THE OUTPUT -> then advance.
var GS66 = read('specs/active/apps-script/66_api_v1_request_order_send.gs');
var orch = extractFn(GS66, 'handleRequestOrderSendOrchestrate_');
var ws = extractFn(GS66, 'rosBuildWorkset_');

// §3/§16 — no competing active row is possible: the Send neither creates nor confirms an allocation draft.
ok(!/upsertRequestOrderAllocationDraft\b/.test(orch) && !/upsertRequestOrderAllocationDraftLines/.test(orch),
  '§3/§16 the orchestration never writes an allocation draft header or line (no competing active row)');
ok(/rosDraftIsActive_/.test(ws) && /ROS_ACTIVE_STATUSES_\[rosDraftStatus_\(row\)\] === 1/.test(extractFn(GS66, 'rosDraftIsActive_')),
  '§3/§16 it consumes only ALREADY-ACTIVE persisted drafts, addressed by their own persisted id');
ok(!/upsertRequestOrderAllocationDraft/.test(send),
  '§5 (§C) the Send transition no longer creates or confirms a draft — the create-inside-Send path is retired');

// §9 — the read-back barrier that replaces the stale-token abort, and it blocks the WHOLE Send.
var verify = extractFn(GS66, 'rosVerifyQuantities_');
ok(/QUANTITY_DRIFT/.test(verify) && /UNSAVED_NO_PERSISTED_DRAFT/.test(verify) && /UNSAVED_TIER_ABSENT/.test(verify),
  '§9 drift / no-persisted-draft / tier-absent are each named distinctly, never merged');
ok(/out\.blocked = out\.failures\.length > 0;/.test(verify), '§9 any single failure blocks the run');
var iVerify = orch.indexOf('QUANTITY_VERIFICATION_FAILED'), iCreate = orch.indexOf('io.createRequestOrderDraft');
ok(iVerify > -1 && iCreate > -1 && iVerify < iCreate,
  '§9 the barrier runs BEFORE any Request Order is created (no partial downstream write)');
// and the client refuses to send over an edit that did not persist
ok(/if \(flush\.failed\) \{/.test(send) && /Nothing was sent and nothing was written/.test(send),
  '§9 the page also blocks the Send when a pending quantity edit failed to save');

// §11 / §14 / §17.K — ordering, and the canonical writers are still the only writers.
var iProof = orch.indexOf('REQUEST_ORDER_OUTPUT_VERIFICATION_FAILED'), iSubmit = orch.indexOf('io.submitAllocationDrafts');
ok(iCreate < iProof && iProof < iSubmit,
  '§11 create Request Order -> PROVE the header + line count -> only then advance the lifecycle');
ok(/createRequestOrderDraft: function \(body\) \{ return rosUnwrap_\(handleCreateRequestOrderDraft_\(body\)\); \}/.test(GS66),
  '§14/§17.K downstream Request Order creation is DELEGATED to the existing canonical writer (13_)');
ok(/submitAllocationDrafts: function \(body\) \{ return rosUnwrap_\(handleSubmitRequestOrderAllocationDrafts_\(body\)\); \}/.test(GS66),
  '§11 and the lifecycle advance to the existing canonical submit writer (15_)');
ok(/_roLoadCanonicalDraftsForScope_/.test(send), 'the page still reloads the latest canonical truth after a Send');

console.log('\n== §10/§18 no frontend recommendation/gap recompute for execution (I) ==');
ok(!/getOrderPlanningGap|calculateGap|KMREC|calculateSuggestedOrderQty|getInventoryReplenishmentGap/.test(send), 'I Send performs NO gap/KMREC/suggested recompute (execution qty = persisted order_qty)');
ok(!/startRequestOrderDraftJob|continueRequestOrderDraftJob/.test(send), 'J Send does not drive the AI Plan job (no per-SKU generation fan-out introduced)');

console.log('\n== §12 T4 non-actionable ==');
ok(/if \(bucket === 'T4'\) continue;/.test(GS15), '§12 the line writer drops T4 (never an actionable/executed allocation line)');

console.log('\n== §8 real conflicts still fail closed (E) — getActive NOT weakened ==');
ok(/if \(st !== 'draft' && st !== 'site_confirmed'\) continue;/.test(GS47), '§8 active set unchanged (draft|site_confirmed) — not weakened to tolerate duplicates');
ok(/if \(hs\.length > 1\) \{ conflicts\.push/.test(GS47), 'E >1 active canonical row still → BLOCKED_CONFLICT (no newest-row-wins / silent selection)');
ok(/if \(hs\.length > 1\) return jsonResponse_\(\{ success: true, data: \{ status: 'BLOCKED_CONFLICT'/.test(GS47), 'E single-SKU getActive also still reports BLOCKED_CONFLICT');

console.log('\n== §9 backend terminal guard intact ==');
ok(/st0 === 'submitted' \|\| st0 === 'cancelled'\) return jsonResponse_\(\{ success: false, error: 'IMMUTABLE_TERMINAL_STATUS/.test(GS15), 'terminal (submitted/cancelled) confirmation still rejected');
ok(/if \(body && body\.expectedToken != null\) \{[\s\S]{0,120}raVerifyDraftToken_/.test(GS15), '§9 the public upsert handler enforces the optimistic-lock token when supplied');

console.log('\n----------------------------------------');
console.log('SEND REQUEST LIFECYCLE (F1-4B-FM6-R4E4): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
