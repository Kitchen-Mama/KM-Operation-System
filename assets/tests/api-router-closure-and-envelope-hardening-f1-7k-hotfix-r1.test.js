// Kitchen Mama Operation System — F1-7K-HOTFIX-ROUTER-CLOSURE-AND-RELEASE-GATE-R1
// Production release-blocker hotfix. Proves: (1) every router-dispatched handler is defined in the .gs release set
// (ROUTER_HANDLER_CLOSURE = PASS, 0 dangling); (2) the 5 unimplemented Weekly-Plan L1/L2 + Combined-Plan actions are
// no longer advertised/dispatched by the router; (3) the km-api-foundation failure envelope prefers errors[], then
// surfaces a string-form router error as BACKEND_ERROR, else the generic WORKSPACE_ERROR; (4) success envelope
// unchanged. No new business functionality.
// Run: node assets/tests/api-router-closure-and-envelope-hardening-f1-7k-hotfix-r1.test.js
// NOTE: no 'use strict' — extracted source slice is eval'd into module scope.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }

var GS_DIR = path.join(__dirname, '..', 'specs', 'active', 'apps-script');
var FND = fs.readFileSync(path.join(__dirname, '..', 'js', 'api', 'km-api-foundation.js'), 'utf8');

// ===================================================================================================================
console.log('\n== ROUTER_HANDLER_CLOSURE: every router-dispatched handle*_ is defined in the .gs release set ==');
var gsFiles = fs.readdirSync(GS_DIR).filter(function (f) { return /\.gs$/.test(f); }).sort();
var allGs = ''; var router = '';
gsFiles.forEach(function (f) { var s = fs.readFileSync(path.join(GS_DIR, f), 'utf8'); allGs += '\n' + s; if (f === '01_router.gs') router = s; });
ok(gsFiles.length >= 60, 'release set present (' + gsFiles.length + ' .gs files)');
var defined = {}; var m, defRe = /function\s+([A-Za-z_$][\w$]*)\s*\(/g;
while ((m = defRe.exec(allGs))) defined[m[1]] = true;
var dispatched = {}; var dRe = /\b(handle[A-Za-z0-9_]+_)\s*\(/g;
while ((m = dRe.exec(router))) dispatched[m[1]] = true;
var dispatchedNames = Object.keys(dispatched);
var dangling = dispatchedNames.filter(function (h) { return !defined[h]; });
ok(dispatchedNames.length > 0, 'router dispatches ' + dispatchedNames.length + ' distinct handle*_ functions');
eq(dangling, [], 'DANGLING_ROUTER_DISPATCHES = 0 (every dispatched handler is defined in the release set)');
// canonical read handlers must all be defined
['handleInventoryReplenishmentWorkspaceGet_', 'handleSkuDetailsWorkspaceGet_', 'handleFcSummaryRawGet_',
 'handleOpenPoRemainingRawGet_', 'handleGetOperationDb_', 'handleGetTable_'].forEach(function (h) {
  ok(defined[h] === true, 'canonical handler defined: ' + h);
});

// ===================================================================================================================
console.log('\n== the 5 unimplemented Weekly-Plan actions are NOT advertised/dispatched by the router ==');
var REMOVED_ACTIONS = ['getWeeklyPlanRateCandidates', 'updateShippingPlanRationale', 'selectShippingPlanCarrier', 'combineShippingPlans', 'uncombineShippingPlans'];
var REMOVED_HANDLERS = ['handleGetWeeklyPlanRateCandidates_', 'handleUpdateShippingPlanRationale_', 'handleSelectShippingPlanCarrier_', 'handleCombineShippingPlans_', 'handleUncombineShippingPlans_'];
REMOVED_ACTIONS.forEach(function (a) {
  ok(router.indexOf("action === '" + a + "'") === -1, 'router no longer dispatches action ' + a);
});
REMOVED_HANDLERS.forEach(function (h) {
  ok(router.indexOf(h + '(') === -1, 'router no longer calls undefined handler ' + h);
  ok(defined[h] !== true, 'no phantom backend handler ' + h + ' was invented (removal, not fake implementation)');
});
// the sibling read action getShippingMethodCandidates (real handler) is UNTOUCHED
ok(router.indexOf("action === 'getShippingMethodCandidates'") !== -1 && defined['handleGetShippingMethodCandidates_'] === true, 'getShippingMethodCandidates (real handler) kept intact');

// ===================================================================================================================
console.log('\n== foundation failure-envelope precedence: errors[] > string error (BACKEND_ERROR) > generic ==');
// Extract the ACTUAL hardened branch and wrap it as a pure resolver.
var startTok = 'var _outErrs;';
var endTok = 'return { success: false, data: null, meta: outMeta, errors: _outErrs };';
var si = FND.indexOf(startTok), ei = FND.indexOf(endTok);
ok(si !== -1 && ei !== -1 && ei > si, 'hardened failure branch present in km-api-foundation.js');
var slice = FND.slice(si, ei);
// F1-7N-FB-4C-R1 — the extracted slice now consults the shared unknown-action authority (that is the fix: the
// router's terminal "I do not know this action" answer is no longer flattened into BACKEND_ERROR). The harness
// therefore has to provide the same collaborators the shipped function has, extracted from the SAME source file
// so this test cannot pass against a stale copy of them.
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '('); if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), d = 0;
  for (; i < src.length; i++) { var c = src[i]; if (c === '{') d++; else if (c === '}') { d--; if (d === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
function extractVar(src, name) {
  var m = new RegExp('var ' + name + '\\s*=').exec(src); if (!m) throw new Error('not found: ' + name);
  var i = src.indexOf('=', m.index) + 1;
  while (' \t\r\n'.indexOf(src[i]) >= 0) i++;
  if (src[i] === '{' || src[i] === '[') {
    var open = src[i], close = open === '{' ? '}' : ']', d = 0, j = i;
    for (; j < src.length; j++) { if (src[j] === open) d++; else if (src[j] === close) { d--; if (d === 0) break; } }
    return src.slice(m.index, j + 1) + ';';
  }
  return src.slice(m.index, src.indexOf(';', i) + 1);
}
eval(extractVar(FND, 'UNKNOWN_ACTION_PATTERNS'));
eval(extractVar(FND, 'DOGET_TERMINAL_HINT'));
eval(extractFn(FND, 'isUnknownActionText'));
eval(extractFn(FND, 'looksLikeDoGetAnswer'));
// F1-7N-FB-4E — the evidence branch normalizes the router's typed fields, so the shared normalizer joins the
// extraction list. An ADDITION to what the suite executes; nothing below it changes meaning.
eval(extractFn(FND, 'normName'));
// F1-7N-FB-4E — the hand-written 4-key stub could silently make a NEW code resolve to `undefined`, so the
// harness now takes the taxonomy from the SAME source file as the slice. It cannot drift from what ships.
eval(extractVar(FND, 'API_ERROR_CODES'));
['CLIENT_ACTION_REQUIRED', 'DEPLOYMENT_CONTRACT_MISMATCH', 'REQUEST_METHOD_DOWNGRADED', 'RESPONSE_ACTION_MISMATCH',
 'RESPONSE_CORRELATION_UNPROVEN', 'RESPONSE_REQUEST_ID_MISMATCH', 'API_ENDPOINT_CONFIGURATION_INVALID'].forEach(function (k) {
  ok(API_ERROR_CODES[k] === k, 'taxonomy carries ' + k + ' (self-named)');
});
var dto = { action: 'weeklyShipping.workspace.get', requestId: 'REQ-TEST1' };
eval('function _resolveErrs(serverEnv){ ' + slice + ' return _outErrs; }');
// 1. errors[] present → surfaced verbatim (byte-compatible with prior behavior)
eq(_resolveErrs({ success: false, errors: [{ code: 'IR_SCHEMA_MISSING', message: 'x', details: null }] }),
   [{ code: 'IR_SCHEMA_MISSING', message: 'x', details: null }], 'errors[] preferred + surfaced verbatim');
// 2. no errors[] but a string error.
//
// SUPERSEDED BY F1-7N-FB-4C-R1, AND THIS IS THE POINT OF THAT ROUND. F1-7K was right to stop DROPPING the
// router's `error` string; it was wrong to label every such string BACKEND_ERROR. "Invalid POST action" and
// "Missing or invalid action parameter" are the router saying it does not know the action — a DEPLOYMENT fact
// with a specific next step — not a backend business failure. Labelling them BACKEND_ERROR is exactly what
// printed an unactionable banner on SKU Details and SKU Regional Details. A genuine business/runtime string is
// still surfaced verbatim, so the F1-7K guarantee is intact.
var _dm = _resolveErrs({ success: false, error: 'Invalid POST action. Supported: ...' })[0];
eq(_dm.code, 'DEPLOYMENT_CONTRACT_MISMATCH', 'a router unknown-action string is a DEPLOYMENT fact, not a backend error');
eq(_dm.details.retryable, false, 'and it is NOT retryable — retrying cannot publish a deployment');
eq(_dm.details.missing_action, 'weeklyShipping.workspace.get', 'naming the action the caller asked for');
eq(_dm.details.router_message, 'Invalid POST action. Supported: ...', 'while keeping the router text verbatim for diagnosis');
// doGet's own terminal message says WHO answered. F1-7N-FB-4E §L is explicit that this alone is NOT enough to
// claim a method downgrade: that claim needs the client to have dispatched POST, the router to report it
// received a GET, doGet to have answered, the POST body to have been unavailable, AND the answer to correlate
// to this request. A bare message (a deployment older than the typed contract) proves only the handler, so the
// honest verdict is the narrower RESPONSE_CORRELATION_UNPROVEN — and the same publish step fixes either reading.
var _mdBare = _resolveErrs({ success: false, error: 'Missing or invalid action parameter. Use: getOperationDb, getTable, system.health or inventoryScope.registry.get' })[0];
eq(_mdBare.code, 'RESPONSE_CORRELATION_UNPROVEN', 'doGet\u2019s action list alone proves the handler, NOT the downgrade');
eq(_mdBare.details.received_by, 'doGet', 'the handler is still named explicitly');
eq(_mdBare.details.retryable, true, 'and it is retryable — nothing says the deployment is broken');
// WITH the router's typed evidence, the downgrade IS proved and is claimed.
var _md = _resolveErrs({ success: false, code: 'POST_ONLY_ACTION_ON_GET', received_method: 'GET', handler: 'doGet',
  sent_as_post: true, post_body_present: false, action_present_in_query: true, request_id: 'REQ-TEST1',
  error: 'Missing or invalid action parameter. Use: getOperationDb, getTable, system.health or inventoryScope.registry.get' })[0];
eq(_md.code, 'REQUEST_METHOD_DOWNGRADED', 'the router\u2019s typed method/handler/body facts DO prove a redirect downgrade');
eq(_md.details.received_by, 'doGet', 'named explicitly');
eq(_md.details.retryable, true, 'and it IS retryable — the deployment is fine, the request lost its body');
eq(_md.details.evidence.post_body_present, false, 'the proof is recorded, not inferred');
eq(_md.details.evidence.request_id_correlated, true, 'including that the answer belongs to this request');
// §M — and the message may NOT claim the action was dropped when the query string carried it and the router
// named it back. That sentence contradicted itself and is the contradiction §M requires fixing.
ok(!/therefore its action . was dropped/.test(_md.message) && /survived in the request URL/.test(_md.message),
  'the message states only what the evidence supports');
// a genuine runtime/business string is still BACKEND_ERROR, verbatim
var _be = _resolveErrs({ success: false, error: 'handleFoo_ is not defined' })[0];
eq(_be.code, 'BACKEND_ERROR', 'ReferenceError-style string surfaced as BACKEND_ERROR');
eq(_be.message, 'handleFoo_ is not defined', 'with its message verbatim');
eq(_be.details.action, 'weeklyShipping.workspace.get', 'now carrying the action, so the banner can name it (\u00a7F)');
eq(_be.details.request_id, 'REQ-TEST1', 'and the request id');
// 3. neither → generic WORKSPACE_ERROR (code + message unchanged; details now carry the correlation \u00a7F needs)
['no errors[]/error', 'blank string error', 'empty errors[]'].forEach(function (label, i) {
  var input = [{ success: false }, { success: false, error: '   ' }, { success: false, errors: [] }][i];
  var g = _resolveErrs(input)[0];
  eq(g.code, 'WORKSPACE_ERROR', label + ' \u2192 generic WORKSPACE_ERROR (unchanged)');
  eq(g.message, 'workspace returned failure', label + ' \u2192 with the unchanged generic message');
  eq(g.details.action, 'weeklyShipping.workspace.get', label + ' \u2192 and the action for the banner');
});
// errors[] wins even if a string error is also present (precedence)
eq(_resolveErrs({ success: false, errors: [{ code: 'A', message: 'a' }], error: 'ignored' }),
   [{ code: 'A', message: 'a' }], 'errors[] takes precedence over a co-present string error');

// ===================================================================================================================
console.log('\n== success envelope unchanged ==');
ok(/return \{ success: true, data: \(serverEnv\.data === undefined \? null : serverEnv\.data\), meta: outMeta, errors: \[\] \};/.test(FND), 'success path returns { success:true, data, meta, errors:[] } — unchanged');

console.log('\n' + (fail ? ('✗ ' + fail + ' FAILED, ') : '✓ ') + pass + ' passed');
if (fail) process.exitCode = 1;
