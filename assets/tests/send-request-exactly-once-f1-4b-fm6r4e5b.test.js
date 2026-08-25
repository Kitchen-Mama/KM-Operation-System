// F1-4B-FM6-R4E5B — Request Order exactly-once execution + allocation lineage.
// Proves: a deterministic execution key (company|cycle|series|sorted-unique draft-id set) stored in
// request_orders.source_ref_id is the idempotency authority; the locked pre-check reuses / fail-closes / creates
// exactly one Request Order (double-click / two-tab / retry / lost-response converge to one); header/line/source
// writes are compensated on failure; the exact allocation lineage FK (request_order_line_sources.request_allocation
// _draft_id) is persisted; site_confirmed → submitted happens ONLY after execution; submitted SKUs leave the active
// set + are excluded from re-send; quantity = persisted order_qty; recommended/provenance frozen; real conflicts
// still fail closed. Pure helpers eval'd; the rest are source guards. No live Apps Script.
// Run: node assets/tests/send-request-exactly-once-f1-4b-fm6r4e5b.test.js
// NOTE: no 'use strict' — extracted helpers are eval'd into module scope.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function slice(src, a, b) { var i = src.indexOf(a), j = src.indexOf(b); return src.slice(i, j); }
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '('); if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}

var GS13 = read('specs/active/apps-script/13_procurement_handlers.gs');
var GS47 = read('specs/active/apps-script/47_api_v1_recommendation_generation.gs');
var RO = read('js/pages/request-order.js');
var send = extractFn(RO, 'handleSendRequest');

// ---- eval pure helpers ----
eval(extractFn(GS13, 'roExecCanonicalString_'));
eval(extractFn(GS13, 'roFindByExecutionKey_'));
eval(extractFn(GS13, 'roDeleteRequestOrderById_'));
eval(extractFn(RO, '_roManualDraftId_'));
eval(slice(GS47, '// __GAPDRAFT_PURE_START__', '// __GAPDRAFT_PURE_END__'));   // r4e2Str_ + recGenSubmittedSkusForScope_ + recGenBuildScopeReadback_

// =============================================================================
console.log('\n== §1 execution key canonical serialization (N/O) ==');
eq(roExecCanonicalString_('KM', '2026', 'S1', ['D2', 'D1']), 'KM|2026|S1|D1,D2', 'canonical = company|cycle|series|sorted draft ids');
ok(roExecCanonicalString_('KM', '2026', 'S1', ['D2', 'D1']) === roExecCanonicalString_('KM', '2026', 'S1', ['D1', 'D2']), 'O same set, different order → SAME canonical (row order irrelevant)');
ok(roExecCanonicalString_('KM', '2026', 'S1', ['D1', 'D2']) !== roExecCanonicalString_('KM', '2026', 'S1', ['D1', 'D3']), 'N different draft set → DIFFERENT canonical');
eq(roExecCanonicalString_('KM', '2026', 'S1', ['D1', 'D1', 'D2']), 'KM|2026|S1|D1,D2', 'duplicate draft ids collapse (unique set)');
eq(roExecCanonicalString_(' KM ', '2026', 'S1', [' D1 ']), 'KM|2026|S1|D1', 'scalars + ids trimmed (canonical)');
ok(roExecutionKeyUsesDigest(), '§1 roExecutionKey_ = ROEXEC- + SHA-256 of the canonical string (deterministic hash)');
function roExecutionKeyUsesDigest() { var f = extractFn(GS13, 'roExecutionKey_'); return /roExecCanonicalString_/.test(f) && /Utilities\.computeDigest\(Utilities\.DigestAlgorithm\.SHA_256/.test(f) && /'ROEXEC-'/.test(f); }

console.log('\n== §6 idempotency lookup (C/D/E/P/Q) ==');
function fakeSheet(rows) { return { getDataRange: function () { return { getValues: function () { return rows; } }; } }; }
var H = ['request_order_id', 'request_order_no', 'request_status', 'source_ref_type', 'source_ref_id'];
eq(roFindByExecutionKey_(fakeSheet([H, ['RO1', 'REQ1', 'draft', 'request_order_allocation_batch', 'ROEXEC-ABC']]), 'request_order_allocation_batch', 'ROEXEC-ABC').length, 1, 'C/D/E one existing execution → reuse (found exactly 1)');
eq(roFindByExecutionKey_(fakeSheet([H, ['RO1', 'REQ1', 'cancelled', 'request_order_allocation_batch', 'ROEXEC-ABC']]), 'request_order_allocation_batch', 'ROEXEC-ABC').length, 0, 'cancelled request never counts as an existing execution');
eq(roFindByExecutionKey_(fakeSheet([H, ['RO1', 'REQ1', 'draft', 'request_order_allocation_batch', 'ROEXEC-ABC'], ['RO2', 'REQ2', 'approved', 'request_order_allocation_batch', 'ROEXEC-ABC']]), 'request_order_allocation_batch', 'ROEXEC-ABC').length, 2, 'Q >1 existing → caller fails closed (duplicate conflict)');
eq(roFindByExecutionKey_(fakeSheet([H, ['ROL', 'REQL', 'draft', '', '']]), 'request_order_allocation_batch', 'ROEXEC-ABC').length, 0, 'P legacy blank source_ref_id is never falsely matched');

console.log('\n== §8 compensation delete-by-request_order_id ==');
(function () {
  var lines = [['request_order_id'], ['RO1'], ['RO2'], ['RO1']];
  var sheet = { getDataRange: function () { return { getValues: function () { return lines.map(function (r) { return r.slice(); }); } }; }, deleteRow: function (n) { lines.splice(n - 1, 1); } };
  var ss = { getSheetByName: function (name) { return name === 'request_order_lines' ? sheet : null; } };
  roDeleteRequestOrderById_(ss, 'RO1');
  eq(lines, [['request_order_id'], ['RO2']], '§8 only THIS execution’s rows (RO1) are removed; others (RO2) preserved');
})();

console.log('\n== §3/§10 lineage FK ==');
ok(/'request_allocation_draft_id'\s*\n?\s*\];/.test(GS13.replace(/[ \t]+/g, ' ')) || /request_allocation_draft_id'[\s\S]{0,40}\];/.test(GS13), '§3 request_order_line_sources header includes request_allocation_draft_id');
var core = extractFn(GS13, 'roCreateRequestOrderCore_');
ok(/sheetEnsureColumns_\(srcSheet, \['request_allocation_draft_id'\]\)/.test(core), '§20 additive-column ensure owner adds the FK to an existing sheet');
ok(/request_allocation_draft_id: String\(\(l\.request_allocation_draft_id\)/.test(core), '§10 lineage FK persisted verbatim from the caller (never derived from sku/status/time)');
ok(/source_ref_id: String\(execKey \|\| \(body && body\.source_ref_id\)/.test(core), '§2 source_ref_id = execution key for allocation-batch executions');
ok(/roDeleteRequestOrderById_\(ss, requestOrderId\)/.test(core) && /REQUEST_ORDER_WRITE_FAILED/.test(core), '§8 write failure compensates (delete-by-id) then surfaces — no orphan header/lines');

console.log('\n== §6/§7 locked idempotency wrapper ==');
var pub = extractFn(GS13, 'handleCreateRequestOrderDraft_');
ok(/srcType !== RO_EXEC_SOURCE_REF_TYPE_\) return roCreateRequestOrderCore_\(body, ''\)/.test(pub), 'non-allocation callers keep the existing unguarded behavior');
ok(/LockService\.getScriptLock/.test(pub) && /roExecutionKey_\(body\.company, body\.planning_cycle, body\.series/.test(pub), '§6/§7 exactly-once runs under the canonical ScriptLock with a backend-computed key');
ok(/existing\.length === 1\) return jsonResponse_\(\{ success: true, data: \{[\s\S]{0,120}reused: true/.test(pub), '§6.C one existing → REUSE (no second Request Order)');
ok(/existing\.length > 1\) return jsonResponse_\(\{ success: false, error: 'REQUEST_ORDER_EXECUTION_DUPLICATE_CONFLICT'/.test(pub), '§6.D >1 existing → FAIL CLOSED');
ok(/return roCreateRequestOrderCore_\(body, execKey\)/.test(pub), '§6.E zero existing → create exactly one (key stored)');

console.log('\n== §14/§18/§20 submittedSkus (H) ==');
var subScope = { company: 'KM', country: 'US', marketplace: 'AMAZON_US' };
var hdrs = [
  { company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'AA', status: 'submitted', planning_cycle: '' },
  { company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'BB', status: 'draft', planning_cycle: '' }
];
eq(recGenSubmittedSkusForScope_(hdrs, subScope, ''), ['AA'], 'H submitted allocation → reported in submittedSkus');
var rb = recGenBuildScopeReadback_(hdrs, [], ['AA', 'BB'], subScope, '');
eq(rb.submittedSkus, ['AA'], 'H readback surfaces submittedSkus');
eq(rb.noDraftSkus, [], 'H already-executed SKU is NOT mislabeled NO_DRAFT');
eq(rb.drafts.map(function (d) { return d.header.sku; }), ['BB'], 'H active draft (BB) still returned; submitted (AA) not active');

console.log('\n== §5/§13 deterministic manual draft id (I) ==');
ok(_roManualDraftId_('KM', 'US', 'AMAZON_US', 'GA0450', '2026') === _roManualDraftId_('KM', 'US', 'AMAZON_US', 'GA0450', '2026'), 'I manual id deterministic (retry reuses SAME draft → stable execution key)');
ok(_roManualDraftId_('KM', 'US', 'AMAZON_US', 'GA0450', '2026') !== _roManualDraftId_('KM', 'US', 'AMAZON_US', 'GA0451', '2026'), 'different SKU → different manual id');
ok(/^RAD-M-/.test(_roManualDraftId_('KM', 'US', 'AMAZON_US', 'GA0450', '2026')), 'manual id is prefixed + grain-encoded');

console.log('\n== frontend Send wiring ==');
// F1-7N-FB-3B §E — THESE INVARIANTS DID NOT CHANGE; THEIR OWNER DID. The per-SKU browser saga is retired, so
// the execution-tagging, lineage-FK and ordering guarantees are now asserted where they actually execute: the
// server orchestration (66_). Nothing here is relaxed — an ordering that was previously only textual in one
// function is now a numbered PHASE sequence that also read-after-write proves the output before advancing the
// lifecycle, which the client loop never did.
var GS66 = read('specs/active/apps-script/66_api_v1_request_order_send.gs');
var orch = extractFn(GS66, 'handleRequestOrderSendOrchestrate_');
ok(/source_ref_type: 'request_order_allocation_batch'/.test(orch) && /planning_cycle: execCycle, series: g\.series/.test(orch),
  '§2 the orchestration tags the batch execution (source_ref_type + cycle + series) for the backend key');
ok(/request_allocation_draft_id: l\.request_allocation_draft_id/.test(orch),
  '§3/§10 every request-order line carries its canonical allocation lineage FK');
ok(/io\.createRequestOrderDraft\(writerBody\)/.test(orch) && !/appendRow|setValue\(/.test(orch),
  '§5 lineage + creation go through the EXISTING canonical writer — the orchestration writes no row itself');
ok(/io\.submitAllocationDrafts\(\{ draft_ids: ids, submitted_by: actor, submit_buckets: submitBuckets \}\)/.test(orch),
  '§11 the lifecycle advance runs over the covered draft ids through the canonical submit writer');
var iCreate = orch.indexOf('io.createRequestOrderDraft'), iProof = orch.indexOf('REQUEST_ORDER_OUTPUT_UNPROVEN'), iSubmit = orch.indexOf('io.submitAllocationDrafts');
ok(iCreate > -1 && iProof > iCreate && iSubmit > iProof,
  '§11/§16 create → PROVE the output → only then advance the lifecycle (stricter than the retired client order)');
// §C: the deterministic manual id is RETAINED as the documented identity of the retired path, but the Send
// transition must no longer reach it — a draft is never created from a raw AI Plan row and immediately sent.
ok(!/_roManualDraftId_/.test(send), '§C the Send transition no longer creates a manual draft (retired per FB-3B §C)');
ok(typeof _roManualDraftId_ === 'function', '§5 the deterministic manual-id authority is retained (reversible), not deleted');
// F1-7N-FB-3A §E — the exclusion is unchanged in EFFECT (still an immediate `return`); it is now also
// COUNTED, so the confirmation summary can explain the gap between rows on screen and rows written.
ok(/_roIsSubmittedSku_\(item\.sku\)\) \{ _roExcluded\.already_submitted_sku\+\+; return; \}/.test(send),
  '§14/§18 already-executed (submitted) SKUs are excluded from a new Send — and the exclusion is counted');
ok(/const eff = _roSendOrderQty_\(item, idx, b, e\)/.test(send), '§17 execution qty = canonical persisted order_qty (no recompute)');
ok(!/getOrderPlanningGap|calculateGap|KMREC|calculateSuggestedOrderQty/.test(send), '§17/§18 no gap/KMREC/suggested recompute in Send');
// F1-7N-FB-3B §C — the stale-token abort is superseded by a STRICTLY STRONGER barrier. The client loop aborted
// when a canonical TOKEN had moved; the orchestration now compares every asserted QUANTITY against the persisted
// value and blocks the ENTIRE Send on any drift, absence or unsaved edit — before a single Request Order exists.
var verifyFn = extractFn(GS66, 'rosVerifyQuantities_');
ok(/QUANTITY_DRIFT/.test(verifyFn) && /UNSAVED_NO_PERSISTED_DRAFT/.test(verifyFn) && /UNSAVED_TIER_ABSENT/.test(verifyFn),
  '§9 (J) drift / unsaved / missing persisted draft are each named distinctly');
var iVerify = orch.indexOf('QUANTITY_VERIFICATION_FAILED');
ok(iVerify > -1 && iVerify < iCreate, '§9 (J) and the whole Send is blocked BEFORE any Request Order is created');
ok(/zero_write: true/.test(orch.slice(iVerify - 400, iVerify + 700)), '§9 (J) reported as a proven zero-write');

console.log('\n== §8/§25 real conflicts still fail closed; §23 PO untouched ==');
ok(/if \(hs\.length > 1\) \{ conflicts\.push/.test(GS47), '§8/§25 >1 active canonical row still → BLOCKED_CONFLICT (not weakened)');
ok(/if \(st !== 'draft' && st !== 'site_confirmed'\) continue;/.test(GS47), '§20/§21 active set unchanged (draft|site_confirmed); submitted terminal');
var convert = extractFn(GS13, 'handleCreatePurchaseOrderFromRequest_');
ok(/request_orders/.test(convert) && /request_order_lines/.test(convert) && !/request_order_allocation/.test(convert), '§23 convert-to-PO still consumes request_orders/lines (allocation lineage does not enter the PO grain)');

console.log('\n----------------------------------------');
console.log('SEND REQUEST EXACTLY-ONCE (F1-4B-FM6-R4E5B): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
