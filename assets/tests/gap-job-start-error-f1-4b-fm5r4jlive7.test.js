// Kitchen Mama Operation System — F1-4B-FM5-R4J-LIVE7 START error root-cause closure.
// Run: node assets/tests/gap-job-start-error-f1-4b-fm5r4jlive7.test.js
// -----------------------------------------------------------------------------
// A failed manual gap-job START must NEVER collapse to a bare "status: ERROR". The truthful named backend code
// (CONTINUATION_SCHEDULE_FAILED / GAP_JOB_LOCK_UNAVAILABLE / CALCULATION_CONTEXT_INVALID / GAP_JOB_START_ERROR …)
// must reach BOTH the user-facing alert (via lastError) AND a [GapJob] START_ERROR DevTools line. The DB API must
// read the gap-family STRUCTURED envelope (errors[]), not the legacy singular error string. The WRITE is issued
// EXACTLY ONCE (never auto-retried), the button returns to idle, and Cancel stays hidden. Inventory + Order
// Planning share ONE START contract. Trigger continuation handlers physically exist and their configured names
// match the top-level Apps Script functions exactly. Deterministic: all start/status fns injected (no network).

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var GR = require('../js/utils/gap-recalc-transport.js');
var F46 = read('specs/active/apps-script/46_api_v1_gap_materialization_job.gs');
var ROUTER = read('specs/active/apps-script/01_router.gs');
var DBAPI = read('js/api/operation-system-db-api.js');
var INV = read('js/pages/inventory-replenishment.js');
var RO = read('js/pages/request-order.js');

var fail = 0, pass = 0;
var REAL_ERR = console.error;   // stable reference so FAIL output is never swallowed by a capture window
function ok(c, l) { if (!c) { fail++; REAL_ERR('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

var immediate = function () { return Promise.resolve(); };

// Capture console.error lines emitted during ONE run (the mandated START_ERROR diagnostic). Runs are serialized by
// the caller so the global console.error swap never overlaps; ok()'s FAIL output uses REAL_ERR and is unaffected.
function captureConsole(fn) {
  var lines = [];
  console.error = function () { lines.push(Array.prototype.join.call(arguments, ' ')); };
  return Promise.resolve().then(fn).then(function (r) { console.error = REAL_ERR; return { r: r, lines: lines }; },
    function (e) { console.error = REAL_ERR; throw e; });
}

// Drive runJob with a scripted START result + a scripted status sequence; capture UI events + start-call count.
function runStart(startResult, statusSeq, extra) {
  var ev = [], startCalls = 0, i = 0;
  var startFn = function () { startCalls++; return Promise.resolve(startResult); };
  var statusFn = function () { var s = (statusSeq || [{ status: 'DONE', scopesProcessed: 1, scopesTotal: 1 }])[Math.min(i++, (statusSeq || []).length - 1)]; return Promise.resolve({ success: true, data: s }); };
  var opts = Object.assign({
    wait: immediate, interval: 1, maxPolls: 20, maxStallPolls: 5,
    refresh: function () { ev.push('refresh'); },
    ui: {
      starting: function () { ev.push('starting'); },
      progress: function (s) { ev.push('progress:' + s.scopesProcessed + '/' + s.scopesTotal); },
      refreshing: function () { ev.push('refreshing'); },
      done: function () { ev.push('done'); },
      cancelled: function () { ev.push('cancelled'); },
      failed: function (st) { ev.push('failed'); ev.lastFailed = st; }
    }
  }, extra || {});
  return GR.runJob(startFn, statusFn, opts).then(function (res) { return { ev: ev, res: res, startCalls: startCalls }; });
}

// A structured backend START failure as the DB API now surfaces it (errors[0] → { code, message, details }).
function startErr(code, message, details) { return { success: false, data: null, error: { code: code, message: message, details: details || { command: 'inventoryReplenishmentGap.job.start' } } }; }
function startOk(runId, scopesTotal) { return { success: true, data: { runId: runId, status: 'PENDING', scopesTotal: scopesTotal } }; }

var jobs = [];

section('A1/A2 — a successful START flows to PENDING → poll → DONE (never ui.failed)');
jobs.push(runStart(startOk('R-INV', 5), [{ status: 'RUNNING', scopesProcessed: 2, scopesTotal: 5 }, { status: 'DONE', scopesProcessed: 5, scopesTotal: 5 }], { product: 'INVENTORY' })
  .then(function (r) { ok(r.ev.indexOf('failed') === -1 && r.ev.indexOf('done') !== -1 && r.res.started === true, 'A1 Inventory START success → poll → DONE (no failure)'); }));
jobs.push(runStart(startOk('R-OP', 3), [{ status: 'DONE', scopesProcessed: 3, scopesTotal: 3 }], { product: 'ORDER_PLANNING' })
  .then(function (r) { ok(r.ev.indexOf('failed') === -1 && r.ev.indexOf('done') !== -1, 'A2 Order Planning START success → DONE (no failure)'); }));

section('B1–B4 — a named START failure is surfaced VERBATIM (alert lastError + [GapJob] START_ERROR diagnostic)');
var B_CASES = [['CONTINUATION_SCHEDULE_FAILED', 'ScriptApp trigger not authorized'],
 ['GAP_JOB_LOCK_UNAVAILABLE', 'another gap job operation is in progress'],
 ['CALCULATION_CONTEXT_INVALID', 'invalid calculation context'],
 ['GAP_JOB_START_ERROR', 'cannot open target spreadsheet']];
// Serialized — each case captures the global console.error alone (no overlapping swap window).
function runBCase(idx) {
  if (idx >= B_CASES.length) return Promise.resolve();
  var pair = B_CASES[idx];
  return captureConsole(function () {
    return runStart(startErr(pair[0], pair[1], { product: 'INVENTORY' }), null, { product: 'INVENTORY' });
  }).then(function (cap) {
    var st = cap.r.ev.lastFailed || {};
    ok(cap.r.ev.indexOf('failed') !== -1, 'B' + (idx + 1) + ' [' + pair[0] + '] START failure → ui.failed');
    ok(st.status === 'ERROR' && st.code === pair[0] && String(st.lastError).indexOf(pair[0]) === 0, 'B' + (idx + 1) + ' [' + pair[0] + '] failed-state carries the TRUE code in code + lastError (not a bare ERROR)');
    ok(cap.lines.some(function (l) { return l.indexOf('[GapJob] START_ERROR') === 0 && l.indexOf('code=' + pair[0]) !== -1 && l.indexOf('product=INVENTORY') !== -1; }), 'B' + (idx + 1) + ' [' + pair[0] + '] emits the [GapJob] START_ERROR DevTools diagnostic (product + code + message)');
    ok(!cap.r.ev.some(function (e) { return String(e).indexOf('progress:') === 0; }), 'B' + (idx + 1) + ' [' + pair[0] + '] no Calculating on a failed START');
    return runBCase(idx + 1);
  });
}
jobs.push(runBCase(0));

section('D1–D3 — failed START returns the UI to idle; Cancel hidden (page contract)');
// The page's ui.failed handler always calls restore(), which resets the button label + hides Cancel.
// F1-7N-FB-4E-R4B-R3 - RESTATED on the routing rather than on the exact character sequence of the handler.
// The contract is unchanged: a failed START tells the truth and returns the UI to idle. R4B-R3 added a
// third statement to the same handler - the failure is ALSO written to the AI Support notice, because the
// menu item this used to speak through is inside a panel the click that started the job already hid.
var _D1 = (INV.match(/failed:\s*function\s*\(st\)\s*\{[\s\S]*?\n\s*\}\s*\n?\s*\}/) || [''])[0];
ok(/_irGapJobFailMsg_\('Inventory',\s*st\)/.test(_D1) && /alert\(/.test(_D1) && /restore\(\)/.test(_D1),
  'D1 Inventory failed START → truthful message → restore() (button back to idle)');
ok(/_irAiSupportNotice_\('bad'/.test(_D1),
  'D1b ... and it is also reported OUTSIDE the menu panel the click hid');
// F1-7N-FB-4E-R4B-R1 - RESTATED FROM A CHARACTER SEQUENCE TO THE BEHAVIOUR. This pinned the exact body of the
// failed handler, so R4B-R1 adding a VISIBLE notice beside the alert (the whole point of that round: the
// in-panel button this flow reported to was display:none) broke a line whose property was never violated.
// The rule is: a failed START alerts truthfully AND returns the UI to idle. Both are asserted, inside the
// handler, in either order and with anything else it may also do.
var _roFailedFn = /failed:\s*function\s*\(st\)\s*\{[\s\S]*?\}\s*\n/.exec(RO);
ok(!!_roFailedFn, 'D2 Order Planning has a failed-START handler');
var _roFailed = _roFailedFn ? _roFailedFn[0] : '';
ok(/alert\(_roGapJobFailMsg_\('Order Planning',\s*st\)\)/.test(_roFailed), 'D2 Order Planning failed START → alert(truthful)');
ok(/restore\(\)/.test(_roFailed), 'D2 ... and returns the UI to idle');
ok(/_roAiSupportNotice_\('bad'/.test(_roFailed), 'D2b ... and states the failure on a surface OUTSIDE the AI Support panel (R4B-R1 §3)');
ok(/function restore\(\)\s*\{[^}]*_irShowCancel_\(false\)[^}]*setBtn\(label[^}]*\}/.test(INV) && /function restore\(\)\s*\{[^}]*_roShowCancel_\(false\)[^}]*setBtn\(label[^}]*\}/.test(RO), 'D3 restore() hides Cancel and restores the idle label on both pages');

section('E1/E2 — the START write is issued EXACTLY ONCE (no automatic retry on failure)');
jobs.push(runStart(startErr('CONTINUATION_SCHEDULE_FAILED', 'no auth'), null, { product: 'INVENTORY' })
  .then(function (r) { ok(r.startCalls === 1 && r.res.started === false, 'E1/E2 failed START → startFn called exactly once, no auto retry'); }));

section('F1–F3 — router dispatches the three gap-job actions to the exact handler functions (parity, no dup owner)');
ok(/'inventoryReplenishmentGap\.job\.start'[\s\S]{0,80}handleStartInventoryReplenishmentGapJob_/.test(ROUTER) && (ROUTER.match(/handleStartInventoryReplenishmentGapJob_\(body\)/g) || []).length === 1, 'F1 inventoryReplenishmentGap.job.start → handleStartInventoryReplenishmentGapJob_ (single owner)');
ok(/'orderPlanningGap\.job\.start'[\s\S]{0,80}handleStartOrderPlanningGapJob_/.test(ROUTER) && (ROUTER.match(/handleStartOrderPlanningGapJob_\(body\)/g) || []).length === 1, 'F2 orderPlanningGap.job.start → handleStartOrderPlanningGapJob_ (single owner)');
ok(/'gapJob\.status\.get'[\s\S]{0,60}handleGetGapJobStatus_/.test(ROUTER), 'F3 gapJob.status.get → handleGetGapJobStatus_');
ok(/'inventoryReplenishmentGap\.job\.cancel'[\s\S]{0,80}handleCancelInventoryReplenishmentGapJob_/.test(ROUTER) && /'orderPlanningGap\.job\.cancel'[\s\S]{0,80}handleCancelOrderPlanningGapJob_/.test(ROUTER), 'F4 both cancel routes dispatch to their handlers');

section('G1/G2 — configured continuation-handler names EXACTLY match the top-level Apps Script functions');
// The names ScriptApp.newTrigger(...) receives come from GAP_JOB_CONTINUATION_HANDLERS_.
var invHandlerName = (F46.match(/INVENTORY:\s*'([^']+)'\s*,\s*ORDER_PLANNING:\s*'([^']+)'\s*\}\s*;/) || []);
var mapMatch = F46.match(/GAP_JOB_CONTINUATION_HANDLERS_\s*=\s*\{\s*INVENTORY:\s*'([^']+)'\s*,\s*ORDER_PLANNING:\s*'([^']+)'\s*\}/);
ok(!!mapMatch, 'G0 GAP_JOB_CONTINUATION_HANDLERS_ map parsed');
var invName = mapMatch ? mapMatch[1] : '', opName = mapMatch ? mapMatch[2] : '';
ok(invName === 'continueInventoryGapMaterializationJob' && new RegExp('function\\s+' + invName + '\\s*\\(').test(F46), 'G1 Inventory continuation handler string === declared top-level function continueInventoryGapMaterializationJob');
ok(opName === 'continueOrderPlanningGapMaterializationJob' && new RegExp('function\\s+' + opName + '\\s*\\(').test(F46), 'G2 Order Planning continuation handler string === declared top-level function continueOrderPlanningGapMaterializationJob');
// Handlers must be top-level (no trailing underscore → callable by name from a trigger).
ok(!/function continueInventoryGapMaterializationJob_\s*\(/.test(F46) && !/function continueOrderPlanningGapMaterializationJob_\s*\(/.test(F46), 'G3 continuation handlers are NOT private (no trailing underscore) — trigger-callable');

section('DB API — the gap-family STRUCTURED envelope (errors[]) is read, not the legacy singular error string');
// _kmWeeklyCommand_ (which start/cancel use) must prefer json.errors[0] so a named START code is never flattened.
var _cmdStart = DBAPI.indexOf('async function _kmWeeklyCommand_');
var cmdBody = DBAPI.slice(_cmdStart, DBAPI.indexOf('return _kmCmdOk_(command, json.data)', _cmdStart) + 60);
ok(/json\.errors\s*&&\s*json\.errors\[0\]/.test(cmdBody), 'DB1 _kmWeeklyCommand_ reads the structured json.errors[0] envelope (gap START/CANCEL)');
ok(/_structured\s*&&\s*_structured\.code/.test(cmdBody) && /json\.error\)/.test(cmdBody), 'DB2 prefers structured code, falls back to the legacy singular error (non-gap handlers unchanged)');
ok(/startInventoryReplenishmentGapJob\s*=\s*function[\s\S]{0,80}_kmWeeklyCommand_\('inventoryReplenishmentGap\.job\.start'/.test(DBAPI) && /startOrderPlanningGapJob\s*=\s*function[\s\S]{0,80}_kmWeeklyCommand_\('orderPlanningGap\.job\.start'/.test(DBAPI), 'DB3 both START commands route through _kmWeeklyCommand_ (shared truthful contract)');

section('shared START contract + version');
ok(/product:\s*'INVENTORY'/.test(INV) && /product:\s*'ORDER_PLANNING'/.test(RO), 'S1 both pages pass product to runJob so the diagnostic names the product');
ok(/gap-recalc-fm5r4jlive10-1/.test(read('js/utils/gap-recalc-transport.js')), 'S2 transport VERSION at LIVE10');
ok(/START_ERROR/.test(read('js/utils/gap-recalc-transport.js')), 'S3 runJob emits a START_ERROR diagnostic on a failed START');

Promise.all(jobs).then(function () {
  console.log('\n----------------------------------------');
  console.log('GAP JOB START ERROR (F1-4B-FM5-R4J-LIVE7): ' + pass + ' passed, ' + fail + ' failed');
  if (fail > 0) { process.exitCode = 1; }
});
