// Kitchen Mama Operation System — AI Plan job router response-contract — F1-7N-FA-3C-PRE2-R2.
// Run: node assets/tests/ai-plan-job-router-jsonresponse-contract-f1-7n-fa-3c-pre2-r2.test.js
//
// ROOT CAUSE PINNED: the four requestOrderDraft.job.* handlers in 48_ return a RAW gapBatchEnvelope_ object (the same
// convention the 46_ gap-job family uses). The router dispatched them WITHOUT jsonResponse_, so doPost returned a
// plain JS object → Apps Script emitted a non-ContentService HTML page with NO Access-Control-Allow-Origin → the
// browser fetch CORS-rejected it → the client surfaced HTTP_TRANSPORT_ERROR (HTTP 200 + text/html + missing ACAO).
// The known-good control (orderPlanningGap.job.start) works precisely because the router wraps it in jsonResponse_.
//
// This test asserts the transport contract, NOT business math: every requestOrderDraft.job.* dispatch is serialized
// through jsonResponse_ (ContentService.JSON), matching the gap-job control; the 48_ handlers stay raw (so the wrap
// MUST live at the router); and the 47_ generateFromGap/getActive handlers wrap INTERNALLY (so the router must NOT
// double-wrap them). No allocation / §41 / Net Order Need / Suggested Qty / carton / job semantics are touched.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }

var GS = path.join(__dirname, '..', 'specs', 'active', 'apps-script');
function read(f) { return fs.readFileSync(path.join(GS, f), 'utf8'); }
var ROUTER = read('01_router.gs');
var F48 = read('48_api_v1_request_order_draft_job.gs');
var F47 = read('47_api_v1_recommendation_generation.gs');
var F43 = read('43_api_v1_gap_materialization.gs');

function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
// Extract the single `return <expr>;` that the router runs for a given action string.
function routerReturnFor(action) {
  var re = new RegExp("action === '" + esc(action) + "'\\s*\\)\\s*\\{\\s*return ([\\s\\S]*?);", 'm');
  var m = re.exec(ROUTER);
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

// ==========================================================================
console.log('\n== BUG FIX — the 4 requestOrderDraft.job.* dispatches serialize through jsonResponse_ (CORS-readable) ==');
var JOB_ACTIONS = [
  { action: 'requestOrderDraft.job.start',    handler: 'handleStartRequestOrderDraftJob_' },
  { action: 'requestOrderDraft.job.continue', handler: 'handleContinueRequestOrderDraftJob_' },
  { action: 'requestOrderDraft.job.status',   handler: 'handleGetRequestOrderDraftJobStatus_' },
  { action: 'requestOrderDraft.job.cancel',   handler: 'handleCancelRequestOrderDraftJob_' }
];
JOB_ACTIONS.forEach(function (j) {
  var ret = routerReturnFor(j.action);
  ok(ret !== null, j.action + ' is dispatched by the router');
  ok(ret === 'jsonResponse_(' + j.handler + '(body))',
    j.action + ' → jsonResponse_(' + j.handler + '(body)) [got: ' + ret + ']');
});

// ==========================================================================
console.log('\n== CONTROL PARITY — the known-good gap-job START uses the SAME jsonResponse_ wrap ==');
var gapStart = routerReturnFor('orderPlanningGap.job.start');
ok(gapStart === 'jsonResponse_(handleStartOrderPlanningGapJob_(body))',
  'orderPlanningGap.job.start → jsonResponse_(handleStartOrderPlanningGapJob_(body)) [got: ' + gapStart + ']');
ok(routerReturnFor('inventoryReplenishmentGap.job.start') === 'jsonResponse_(handleStartInventoryReplenishmentGapJob_(body))',
  'inventoryReplenishmentGap.job.start also wrapped (family parity)');

// ==========================================================================
console.log('\n== WHY THE WRAP MUST LIVE AT THE ROUTER — 48_ handlers return a RAW envelope (no ContentService) ==');
ok(F48.indexOf('jsonResponse_') === -1, '48_ never calls jsonResponse_ (handlers return raw gapBatchEnvelope_)');
ok(F48.indexOf('ContentService') === -1, '48_ never touches ContentService (raw-object convention, like 46_)');
// gapBatchEnvelope_ (the 48_/46_ envelope) is a PLAIN object — the exact reason a router wrap is required.
var envRe = /function gapBatchEnvelope_[\s\S]*?return ok \?\s*\{ success: true/;
ok(envRe.test(F43), 'gapBatchEnvelope_ returns a plain { success, data, meta, errors } object (not a ContentService output)');

// ==========================================================================
console.log('\n== NO DOUBLE-WRAP — 47_ generateFromGap/getActive wrap INTERNALLY, so the router must NOT re-wrap ==');
// Router calls these handlers bare (they already return jsonResponse_ themselves).
ok(routerReturnFor('requestOrderDraft.generateFromGap') === 'handleGenerateRequestOrderDraftFromGap_(body)',
  'generateFromGap dispatched bare (handler wraps internally — no router double-wrap)');
ok(routerReturnFor('requestOrderDraft.getActive') === 'handleGetActiveRequestOrderDraftReadback_(body)',
  'getActive dispatched bare (handler wraps internally — no router double-wrap)');
// prove the 47_ handlers really do wrap internally (so bare dispatch is correct, not another latent bug).
function bodyOf(src, fn) {
  var i = src.indexOf('function ' + fn + '('); if (i === -1) return '';
  return src.slice(i, i + 4000);
}
ok(/return jsonResponse_\(/.test(bodyOf(F47, 'handleGenerateRequestOrderDraftFromGap_')),
  'handleGenerateRequestOrderDraftFromGap_ returns jsonResponse_(...) internally');
ok(/return jsonResponse_\(/.test(bodyOf(F47, 'handleGetActiveRequestOrderDraftReadback_')),
  'handleGetActiveRequestOrderDraftReadback_ returns jsonResponse_(...) internally');

// ==========================================================================
console.log('\n== GUARD — no requestOrderDraft.job.* dispatch returns the raw handler object (regression trap) ==');
JOB_ACTIONS.forEach(function (j) {
  var re = new RegExp("action === '" + esc(j.action) + "'\\s*\\)\\s*\\{\\s*return " + esc(j.handler) + "\\(body\\);");
  ok(!re.test(ROUTER), j.action + ' is NOT dispatched as a bare raw-object return (' + j.handler + ')');
});

// ==========================================================================
console.log('\n' + (fail ? ('✗ ' + fail + ' FAILED, ') : '✓ ') + pass + ' passed');
if (fail) process.exitCode = 1;
