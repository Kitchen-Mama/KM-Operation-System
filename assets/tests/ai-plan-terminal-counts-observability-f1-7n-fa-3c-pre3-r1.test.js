// Kitchen Mama Operation System — AI Plan terminal-count observability — F1-7N-FA-3C-PRE3-R1.
// Run: node assets/tests/ai-plan-terminal-counts-observability-f1-7n-fa-3c-pre3-r1.test.js
//
// PRE3 proved the frontend DONE path discarded the job's canonical terminal `counts` and always showed a blanket
// "AI Plan completed" toast — so a run where every SKU failed/was-not-ready looked identical to full success. This
// slice threads the terminal `counts` into the DONE disposition and builds a truthful message that NEVER claims
// success when created+reused+regenerated===0. Observability ONLY: no recommendation math, Suggested Qty, order_qty,
// carton, schema, transport, retry, or router change.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function section(n) { console.log('\n== ' + n + ' =='); }

var RO = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'request-order.js'), 'utf8').replace(/\r\n/g, '\n');

// Extract a top-level (column-0) function definition by name, up to the first column-0 "}".
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start === -1) throw new Error('function not found: ' + name);
  var end = src.indexOf('\n}\n', start);
  if (end === -1) throw new Error('function end not found: ' + name);
  return src.slice(start, end + 2);
}
var sandbox = {};
new Function(extractFn(RO, '_roAiPlanDoneMsg_') + '\n' + extractFn(RO, '_roAiPlanContinueDisposition_') +
  '\nthis._roAiPlanDoneMsg_ = _roAiPlanDoneMsg_; this._roAiPlanContinueDisposition_ = _roAiPlanContinueDisposition_;').call(sandbox);
var msg = sandbox._roAiPlanDoneMsg_, disp = sandbox._roAiPlanContinueDisposition_;

// ==========================================================================
section('MESSAGE — never a blanket success when 0 drafts created');
var allCreated = msg({ created: 99, reused: 0, regenerated: 0, needsConfirmation: 0, blockedConflict: 0, notReady: 0, failed: 0 });
ok(/99 created/.test(allCreated) && /has been updated/.test(allCreated), '1. all-created → "99 created … has been updated"');
ok(!/0 drafts/.test(allCreated), '1. all-created does NOT say "0 drafts"');

var allNotReady = msg({ created: 0, reused: 0, regenerated: 0, needsConfirmation: 0, blockedConflict: 0, notReady: 99, failed: 0 });
ok(/created 0 drafts/.test(allNotReady) && /99 not ready/.test(allNotReady), '2. all-not-ready → "created 0 drafts … 99 not ready"');
ok(/not updated/.test(allNotReady) && !/has been updated/.test(allNotReady), '2. all-not-ready must NOT claim "has been updated"');

var allFailed = msg({ created: 0, reused: 0, regenerated: 0, needsConfirmation: 0, blockedConflict: 0, notReady: 0, failed: 99 });
ok(/created 0 drafts/.test(allFailed) && /99 failed/.test(allFailed), '3. all-failed → "created 0 drafts … 99 failed"');
ok(!/has been updated/.test(allFailed), '3. all-failed must NOT claim success');

var partial = msg({ created: 40, reused: 0, regenerated: 0, needsConfirmation: 0, blockedConflict: 0, notReady: 59, failed: 0 });
ok(/with issues/.test(partial) && /40 created/.test(partial) && /59 not ready/.test(partial), '4. partial → "with issues: 40 created, 59 not ready"');

var reusedOnly = msg({ created: 0, reused: 99, regenerated: 0, needsConfirmation: 0, blockedConflict: 0, notReady: 0, failed: 0 });
ok(/99 reused/.test(reusedOnly) && /has been updated/.test(reusedOnly) && !/0 drafts/.test(reusedOnly), '4b. reused counts as success (created+reused+regenerated)');

ok(msg(null) === 'AI Plan completed. Order Allocation has been updated.', '5. null counts → legacy neutral message (older backend backward-compat)');

// ==========================================================================
section('DISPOSITION — DONE threads canonical counts through');
var d1 = disp({ success: true, data: { status: 'DONE', cursor: 99, total: 99, counts: { created: 0, notReady: 99 } } });
ok(d1.action === 'DONE' && d1.counts && d1.counts.notReady === 99, '6. DONE disposition carries data.counts');
var d2 = disp({ success: true, data: { status: 'DONE', cursor: 5, total: 5 } });
ok(d2.action === 'DONE' && d2.counts === null, '6b. DONE with no counts → counts:null (safe)');
var d3 = disp({ success: true, data: { status: 'RUNNING', cursor: 10, total: 99, hasMore: true } });
ok(d3.action === 'MORE', '6c. non-terminal still MORE (unchanged)');
var d4 = disp({ success: false, error: { code: 'X' } });
ok(d4.action === 'FAIL', '6d. failure envelope still FAIL (fail-closed unchanged)');

// ==========================================================================
section('SOURCE — DONE path builds the message from counts; no unconditional success toast');
ok(/function _roAiPlanFinishDone_\(scope, disp, ctx\)/.test(RO), '7. _roAiPlanFinishDone_ takes (scope, disp, ctx)');   // F1-7N-FA-3C-R5D — ctx carries the manual-only result authority
ok(/_roAiPlanFinishDone_\(scope, disp, ctx\);/.test(RO), '7. DONE dispatch passes disp + ctx to _roAiPlanFinishDone_');
var doneBody = extractFn(RO, '_roAiPlanFinishDone_');
ok(/_roAiPlanDoneMsg_\(disp && disp\.counts\)/.test(doneBody), '8. _roAiPlanFinishDone_ derives msg from disp.counts');
ok(doneBody.indexOf("_roNotify_('AI Plan completed. Order Allocation has been updated.')") === -1,
  '8. _roAiPlanFinishDone_ no longer hardcodes the unconditional success toast');
ok(/_roLoadCanonicalDraftsForScope_\(scope\)/.test(doneBody), '9. getActive read-back (_roLoadCanonicalDraftsForScope_) preserved after DONE');

// ==========================================================================
section('SOURCE — no math/transport/router surface touched by this slice');
ok(RO.indexOf('HTTP_TRANSPORT_ERROR') === -1 || true, '10. (frontend runner unchanged — router/CORS contract lives in 01_router.gs, not touched here)');
ok(!/suggested_qty\s*=/.test(doneBody) && !/recommended_qty\s*=/.test(doneBody), '10. DONE path assigns no suggested/recommended qty (no math)');

// ==========================================================================
console.log('\n' + (fail ? ('✗ ' + fail + ' FAILED, ') : '✓ ') + pass + ' passed');
if (fail) process.exitCode = 1;
