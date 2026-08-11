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

console.log('\n== §3/§16 confirm in place (no competing active row) ==');
ok(/_roIsCanonicalDraftSku_\(item\.sku\)/.test(send) && /if \(d\.isCanonical\)/.test(send), 'Send routes canonical-draft SKUs to the confirm path (R4E5B: routing captured as d.isCanonical)');
ok(/upsertRequestOrderAllocationDraft\(\{ request_allocation_draft_id: refD\.draftId, status: 'site_confirmed', expectedToken: tok, updated_by: 'request-order' \}\)/.test(send), '§3/§16 canonical SKU CONFIRMS the SAME draft in place (reuse id; NO new active row)');
ok(!/request_allocation_draft_id: refD\.draftId[\s\S]{0,120}generation_type/.test(send), '§4 confirm does NOT set generation_type (provenance preserved by the in-place update)');
ok(/refD\.draftId/.test(send) && /_roCanonicalDraftBySku\[_roCanonKey_\(sku\)\]/.test(send), 'confirm reuses the CACHED canonical draft id (from ONE getActive; no per-SKU readback fan-out)');

console.log('\n== §5 manual path (one canonical manual draft) ==');
ok(/\} else \{[\s\S]{0,900}status: 'site_confirmed', generation_type: 'user_created'/.test(send), '§5 manual / no-AI SKU creates ONE canonical draft (user_created) — no AI draft exists so no competing row');
ok(/upsertRequestOrderAllocationDraftLines/.test(send), '§5 manual path still writes its own lines');

console.log('\n== §9 fail-closed abort before downstream ==');
ok(/CONCURRENCY_TOKEN_MISMATCH\|VERSION_CONFLICT\|TOKEN_MISMATCH\|IMMUTABLE_TERMINAL_STATUS\|BLOCKED_CONFLICT/.test(send) && /staleSkus\.push\(sku\)/.test(send), '§9 a stale/terminal confirm is collected, not overwritten');
ok(/if \(staleSkus\.length\) \{[\s\S]{0,400}return;/.test(send), '§9 any stale SKU → abort BEFORE creating request orders (no partial downstream write)');
ok(/staleSkus[\s\S]{0,400}_roLoadCanonicalDraftsForScope_/.test(send), '§9 fail-closed reloads the latest canonical truth for review + retry');

console.log('\n== §3/§17 no submit-to-terminal; downstream preserved ==');
// R4E4 retired the submit step; F1-4B-FM6-R4E5B RESTORES it as the post-execution lifecycle (site_confirmed →
// submitted ONLY after the Request Order execution succeeds). See send-request-exactly-once-f1-4b-fm6r4e5b.test.js.
ok(/submitRequestOrderAllocationDrafts\(\{ draft_ids: coveredDraftIds/.test(send), '§11 (R4E5B) submit runs AFTER request execution, over the covered draft ids');
ok(/createRequestOrderDraft/.test(send), '§14/§17.K downstream Request Order (request_orders) creation preserved (consumable by the existing path)');

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
