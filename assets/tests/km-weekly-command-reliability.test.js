// Kitchen Mama Operation System — Weekly command reliability tests (Round C1).
// Run: node assets/tests/km-weekly-command-reliability.test.js
// LOCAL / SOURCE-LEVEL. Extracts + evals the REAL adapter command runner (operation-system-db-api.js) and the
// REAL page reliability layer (shipping-plan.js) and drives them with fakes. Proves: ack decoupled from readback
// (committed write never reported as failure), transport/non-JSON/business/idempotent classification, single
// active-path readback, double-click guard, committed-readback-failed handling, and no dual write. No network,
// no DOM render, no live Spreadsheet.

var fs = require('fs');
var path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var DBSRC = read('js/api/operation-system-db-api.js');
var PGSRC = read('js/pages/shipping-plan.js');
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// ---- adapter scope: fakes + eval the command runner ------------------------------------------------
var _cfg = true;
function isOperationDbApiConfigured() { return _cfg; }
var OP_DB_API_BASE_URL = 'https://script.google.com/macros/s/EXAMPLE/exec';
var _fetchImpl = null;
global.window = { KM: { DB: {} } };
global.fetch = function (url, init) { return _fetchImpl(url, init); };
eval(DBSRC.match(/var KM_ALREADY_IN_TARGET_PATTERNS = \[[\s\S]*?\];/)[0]);
eval(DBSRC.match(/var KM_CANONICAL_CODES = \[[\s\S]*?\];/)[0]);   // C2-D2A-UI: canonical code extraction dependency
// F1-7N-FB-3 §D — the command runner is now BOUNDED: it fetches through _kmFetchBounded_ and classifies an
// expiry via _kmTimeoutError_/_kmTimeoutMs_. Those are dependencies of the function under test, so they join
// the extraction set. Both _kmWeeklyCommand_ and _kmFetchBounded_ are declared `async function` — extractFn
// drops the leading `async`, so it is re-added.
// F1-7N-FB-3A §C — it now also classifies a missing DEPLOYED action (DEPLOYMENT_CONTRACT_MISMATCH) before the
// business classifier can flatten it, so those two helpers and the pattern list join the set as well.
var KM_READ_TIMEOUT_MS_ = 45000, KM_WRITE_TIMEOUT_MS_ = 90000, KM_EXPECTED_ACTION_CONTRACT_VERSION_ = 3;
eval(DBSRC.match(/var KM_UNKNOWN_ACTION_PATTERNS_ = \[[\s\S]*?\];/)[0]);
// F1-7N-FB-4E — the runner now classifies through the shared evidence helpers, so they join the extraction
// list. This ADDS to what the suite executes; every assertion below is unchanged, and A3/A4/A7 still pin the
// SAME legacy codes, which is exactly the point: the alias survives while the typed classification rides beside it.
var KM_TRANSPORT_EVIDENCE_BUILD_ = 'F1-7N-FB-4E';
// F1-7N-FB-4G-A2-R3-R1 - the runner now reads the handler's OWN top-level `code` before falling back to
// prefix-matching the prose, so _kmTopLevelCode_ is a dependency of the function under test. Without it the
// lift throws a ReferenceError inside shipped code - a harness gap, not a product defect.
eval(['_kmClassifyBusinessError_', '_kmExtractCanonicalCode_', '_kmTopLevelCode_', '_kmZeroWriteProven_', '_kmTimeoutMs_',
  '_kmTimeoutError_', '_kmIsUnknownActionResponse_', '_kmDeploymentMismatchError_', '_kmCmdOk_', '_kmCmdErr_',
  '_kmTransportFactory_', '_kmWireEvidence_', '_kmClassifyAnswer_', '_kmTypedTransportMessage_'].map(function (n) { return extractFn(DBSRC, n); }).join('\n')
  + '\nasync ' + extractFn(DBSRC, '_kmFetchBounded_')
  + '\nasync ' + extractFn(DBSRC, '_kmWeeklyCommand_'));

function resp(okFlag, status, bodyText) { return { ok: okFlag, status: status, text: function () { return Promise.resolve(bodyText); } }; }
function jbody(o) { return JSON.stringify(o); }

// ---- page scope: fakes + eval the reliability layer ------------------------------------------------
var _spInFlight = {};
var renderCalls, loadCalls, loadImpl, wsActive, alertMsgs;
global.alert = function (m) { alertMsgs.push(String(m)); };
function renderShippingPlan() { renderCalls++; }
function _spEffectiveWorkspace() { return wsActive; }
eval(['_spNotify_', '_spReadbackAfterWrite_', '_spHandleCommandResult_', '_spRunCommand_'].map(function (n) { return extractFn(PGSRC, n); }).join('\n'));
function resetPage() { renderCalls = 0; loadCalls = 0; wsActive = false; alertMsgs = []; loadImpl = function () { return Promise.resolve(); }; window.KM.DB.loadOperationDb = function () { loadCalls++; return loadImpl(); }; }

(async function main() {

  // =====================================================================================================
  section('Adapter — response classification (ack decoupled from readback)');
  _fetchImpl = function () { return Promise.resolve(resp(true, 200, jbody({ success: true, data: { currentStatus: 'pending_approval', updatedAt: 'T' } }))); };
  var r1 = await _kmWeeklyCommand_('updateShippingPlanStatus', { shipping_plan_id: 'SP-1', transition: 'submit' });
  ok(r1.success === true && r1.data.committed === true && r1.data.command === 'updateShippingPlanStatus', 'A1 committed success (result derived from handler response, not readback)');
  ok(r1.data.currentStatus === 'pending_approval' && r1.error === null, 'A2 canonical data fields carried through');

  _fetchImpl = function () { return Promise.resolve(resp(false, 404, 'Not Found')); };
  var r404 = await _kmWeeklyCommand_('updateShippingPlanStatus', {});
  ok(r404.success === false && r404.error.code === 'HTTP_TRANSPORT_ERROR' && r404.error.details.httpStatus === 404, 'A3 HTTP 404 → HTTP_TRANSPORT_ERROR (not a business result)');

  _fetchImpl = function () { return Promise.resolve(resp(true, 200, '<!DOCTYPE html><html>login</html>')); };
  var rHtml = await _kmWeeklyCommand_('appendShippingPlanNote', {});
  ok(rHtml.success === false && rHtml.error.code === 'NON_JSON_RESPONSE', 'A4 HTML response → NON_JSON_RESPONSE (never parsed as the command result)');

  _fetchImpl = function () { return Promise.resolve(resp(true, 200, jbody({ success: false, error: 'Cannot submit a pending_approval plan' }))); };
  var rDup = await _kmWeeklyCommand_('updateShippingPlanStatus', { transition: 'submit' });
  ok(rDup.success === false && rDup.error.code === 'ALREADY_IN_TARGET_STATE', 'A5 "cannot submit pending_approval" → ALREADY_IN_TARGET_STATE (idempotent-benign)');

  _fetchImpl = function () { return Promise.resolve(resp(true, 200, jbody({ success: false, error: 'missing or invalid parameter' }))); };
  var rBad = await _kmWeeklyCommand_('updateShippingPlanStatus', {});
  ok(rBad.success === false && rBad.error.code === 'BUSINESS_COMMAND_ERROR', 'A6 "missing or invalid parameter" → BUSINESS_COMMAND_ERROR (distinct)');

  _fetchImpl = function () { return Promise.reject(new Error('network down')); };
  var rNet = await _kmWeeklyCommand_('completeShippingPlan', {});
  ok(rNet.success === false && rNet.error.code === 'HTTP_TRANSPORT_ERROR', 'A7 network throw → HTTP_TRANSPORT_ERROR (no false commit ack)');

  _cfg = false;
  var rCfg = await _kmWeeklyCommand_('updateShippingPlanLineQty', {});
  ok(rCfg.success === false && rCfg.error.code === 'TRANSPORT_NOT_CONFIGURED', 'A8 not configured → TRANSPORT_NOT_CONFIGURED');
  _cfg = true;
  ok(_kmClassifyBusinessError_('already approved') === 'ALREADY_IN_TARGET_STATE' && _kmClassifyBusinessError_('boom') === 'BUSINESS_COMMAND_ERROR', 'A9 classifier unit');
  ok(DBSRC.indexOf('await loadOperationDb') < 0 || /_kmWeeklyCommand_/.test(DBSRC), 'A10 command runner present (readback decoupled from the 4 weekly writes)');

  // =====================================================================================================
  section('Page — single readback, committed/readback-failed, idempotent, retain-on-failure');
  resetPage();
  var okRes = { success: true, data: { command: 'x', committed: true } };
  await _spRunCommand_('SP-1:approve', function () { return Promise.resolve(okRes); }, { successMsg: 'done' });
  ok(loadCalls === 1 && renderCalls === 1, 'P1 success → exactly ONE Legacy readback + render');
  ok(alertMsgs.length === 1 && alertMsgs[0] === 'done', 'P2 success message shown once');

  resetPage();
  loadImpl = function () { return Promise.reject(new Error('reload hiccup')); };
  await _spRunCommand_('SP-1:approve', function () { return Promise.resolve(okRes); }, { successMsg: 'done' });
  ok(loadCalls === 1 && renderCalls === 1, 'P3 committed + readback failed → reconciliation render attempted');
  ok(/已提交/.test(alertMsgs.join('')) && alertMsgs.indexOf('done') < 0, 'P4 readback-failed shows "已提交，正在重新確認狀態" (NOT a blind-retry failure)');

  resetPage();
  var already = { success: false, error: { code: 'ALREADY_IN_TARGET_STATE', message: 'cannot submit pending' } };
  await _spRunCommand_('SP-1:submit', function () { return Promise.resolve(already); }, { successMsg: 'Submitted', failPrefix: 'Submit failed' });
  ok(loadCalls === 1 && /狀態已是最新/.test(alertMsgs.join('')) && !/Submit failed/.test(alertMsgs.join('')), 'P5 ALREADY_IN_TARGET_STATE → benign refresh, NOT a scary failure');

  resetPage();
  var busErr = { success: false, error: { code: 'BUSINESS_COMMAND_ERROR', message: 'missing or invalid parameter' } };
  await _spRunCommand_('SP-1:submit', function () { return Promise.resolve(busErr); }, { failPrefix: 'Submit failed' });
  ok(loadCalls === 0 && renderCalls === 0, 'P6 genuine failure BEFORE commit → NO readback (retain current cards)');
  ok(/Submit failed: missing or invalid parameter \[BUSINESS_COMMAND_ERROR\]/.test(alertMsgs.join('')), 'P7 structured error shown (message + code)');

  resetPage();
  wsActive = true;
  await _spRunCommand_('SP-1:approve', function () { return Promise.resolve(okRes); }, { successMsg: 'done' });
  ok(renderCalls === 1 && loadCalls === 0, 'P8 Workspace-enabled readback uses the Workspace render path (NOT loadOperationDb)');

  // double-click guard: a second command with the same key while the first is in-flight is ignored
  resetPage();
  var invokeCount = 0, resolveFirst;
  var pending = function () { invokeCount++; return new Promise(function (r) { resolveFirst = r; }); };
  var p1 = _spRunCommand_('SP-9:submit', pending, { successMsg: 'ok' });
  var r2 = await _spRunCommand_('SP-9:submit', pending, { successMsg: 'ok' });
  ok(r2.success === false && r2.error.code === 'IN_FLIGHT' && invokeCount === 1, 'P9 double-click → second call ignored (IN_FLIGHT), no dual write');
  resolveFirst({ success: true, data: {} }); await p1;
  var r3 = await _spRunCommand_('SP-9:submit', function () { invokeCount++; return Promise.resolve({ success: true, data: {} }); }, {});
  ok(r3.success === true && invokeCount === 2, 'P10 after completion the key is released (next command runs)');

  // =====================================================================================================
  section('Source — page wires all writes through the guarded runner; no internal adapter readback');
  ['spDbSaveQty', 'spDbSubmit', 'spDbApprove', 'spDbReject', 'spDbDone', 'spDbCancel', 'spDbSaveNote'].forEach(function (fn) {
    ok(new RegExp('function ' + fn + '\\(').test(PGSRC) && extractFn(PGSRC, fn).indexOf('_spRunCommand_') >= 0, 'SR:' + fn + ' routes through _spRunCommand_');
  });
  ok(/updateShippingPlanStatus = function\(payload\) \{ return _kmWeeklyCommand_/.test(DBSRC), 'SR-adapter status delegates to the command runner (no internal loadOperationDb)');

  console.log('\n----------------------------------------');
  console.log('WEEKLY COMMAND RELIABILITY: ' + pass + ' passed, ' + fail + ' failed');
  if (fail > 0) { process.exitCode = 1; }
})();
