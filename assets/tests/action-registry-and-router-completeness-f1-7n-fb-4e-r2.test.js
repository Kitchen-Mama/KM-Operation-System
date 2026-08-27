// F1-7N-FB-4E-R2 — THE REGISTRY, THE ROUTER AND THE CONTRACT STAMPS MUST DESCRIBE THE SAME EXECUTABLE TRUTH.
//
// WHERE THIS ROUND STARTS. FB-4E-R1 repaired a lost response envelope, and checkDeploymentContract() then began
// telling the truth for the first time — which immediately exposed a second fault it had been unable to report:
//
//   shipment.eta.update                          routed, handler defined, ABSENT from SYS_REQUIRED_ACTIONS_
//   shipment.route.advance                       routed, handler defined, ABSENT from SYS_REQUIRED_ACTIONS_
//   skuDetails.workspace.get                     routed, handler defined, ABSENT from SYS_REQUIRED_ACTIONS_
//   system.executionPlanDuplicateLineDiagnostic  handler defined in 68_, NO router dispatch in any commit ever
//
// TWO DIFFERENT FAULTS WEARING ONE MESSAGE. sysProbeRequested_ resolves a caller-named action ONLY through
// SYS_REQUIRED_ACTIONS_, so the first three were served correctly by the deployment and reported missing by it
// — a self-description gap presented to the operator as a stale deployment, which sends someone to re-publish
// something that was never wrong. The fourth was the opposite: three artifacts (68_'s docstring, the frontend's
// required list, this project's own expectations) asserted the action existed, and only the router disagreed,
// so a defined handler sat unreachable and no publish could ever supply it.
//
// WHAT THIS SUITE PROVES, BY EXECUTION RATHER THAN BY READING. All 78 .gs files are loaded into ONE shared
// global scope, the shipped client module is executed whole, and its fetch is wired into the executed router —
// so "the action resolves" means a real request reached a real handler, not that a string appears in a file.
//
//   §1  all four actions traced on every axis: dispatch, handler, method, envelope, registry, stamp
//   §2  the three registry additions are canonical and non-duplicate
//   §3  the new router dispatch exists, delegates correctly and preserves __km_handler
//   §4  the newly exposed diagnostic is read-only, bounded, and cannot reach the repair path
//   §5  the contract stamps moved consistently and the client pin agrees without being lowered
//   §6  the joined production-like probe reaches DEPLOYMENT_CONTRACT_OK — and still fails closed
//   §7  standing regression guards, so this class of drift cannot silently return
//   §8  the business actions this round touched are behaviourally unchanged
//
// Run: node assets/tests/action-registry-and-router-completeness-f1-7n-fb-4e-r2.test.js

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var ROOT = path.join(__dirname, '..', '..');
var GS_DIR = path.join(ROOT, 'assets', 'specs', 'active', 'apps-script');

var passed = 0, failed = 0, checks = [];
function ok(c, m) { if (c) { passed++; } else { failed++; console.log('  FAIL ' + m); } }
function eq(a, b, m) { ok(a === b, m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n' + t); }
function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }

var RTR = read('assets/specs/active/apps-script/01_router.gs');
var G63 = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
var G68 = read('assets/specs/active/apps-script/68_api_v1_execution_plan_conflict_diagnostic.gs');
var GS_FILES = fs.readdirSync(GS_DIR).filter(function (f) { return /\.gs$/.test(f); }).sort();
var GS_ALL = GS_FILES.map(function (f) { return fs.readFileSync(path.join(GS_DIR, f), 'utf8'); }).join('\n');

var THE_FOUR = [
  { action: 'shipment.eta.update', handler: 'handleUpdateShipmentEta_', owner: '31_shipment_receipt_route_handlers.gs',
    kind: 'WRITE', wasMissing: 'REGISTRY_ENTRY' },
  { action: 'shipment.route.advance', handler: 'handleAdvanceShipmentRoutePoint_', owner: '31_shipment_receipt_route_handlers.gs',
    kind: 'WRITE', wasMissing: 'REGISTRY_ENTRY' },
  { action: 'skuDetails.workspace.get', handler: 'handleSkuDetailsWorkspaceGet_', owner: '59_api_v1_sku_details_workspace.gs',
    kind: 'READ', wasMissing: 'REGISTRY_ENTRY' },
  { action: 'system.executionPlanDuplicateLineDiagnostic', handler: 'handleExecutionPlanDuplicateLineDiagnostic_',
    owner: '68_api_v1_execution_plan_conflict_diagnostic.gs', kind: 'READ', wasMissing: 'ROUTER_DISPATCH' }
];

function esc(a) { return a.replace(/\./g, '\\.'); }
function routed(a) { return new RegExp("action === '" + esc(a) + "'").test(RTR); }
function registryEntry(a) {
  var m = new RegExp("\\{ action: '" + esc(a) + "', handler: '([^']+)', used_by: '([^']*)' \\}").exec(G63);
  return m ? { handler: m[1], used_by: m[2] } : null;
}
function handlerDefined(h) { return new RegExp('function\\s+' + h + '\\s*\\(').test(GS_ALL); }
var DO_GET = RTR.slice(RTR.indexOf('function doGet'), RTR.indexOf('function doPost'));
var DO_POST = RTR.slice(RTR.indexOf('function doPost'));

// =============================================================================================================
// THE DEPLOYMENT, EXECUTED — with every write primitive instrumented so "read-only" is measured, not asserted.
// =============================================================================================================
function makeDeployment(opts) {
  opts = opts || {};
  var violations = [], opened = [];
  function forbid(name) { return function () { violations.push(name); return null; }; }

  function fakeSheet(name, table) {
    return {
      getName: function () { return name; },
      getDataRange: function () { return { getValues: function () { return table.map(function (r) { return r.slice(); }); } }; },
      getLastRow: function () { return table.length; },
      getLastColumn: function () { return (table[0] || []).length; },
      // Anything that could mutate is recorded rather than performed.
      getRange: function () {
        return { setValue: forbid('setValue'), setValues: forbid('setValues'), clearContent: forbid('clearContent'),
                 getValue: function () { return ''; }, getValues: function () { return []; } };
      },
      appendRow: forbid('appendRow'), deleteRow: forbid('deleteRow'), deleteRows: forbid('deleteRows'),
      insertRowAfter: forbid('insertRowAfter'), clear: forbid('clear'), clearContents: forbid('clearContents'),
      setName: forbid('setName')
    };
  }

  var sb = {
    console: console, JSON: JSON, Math: Math, Date: Date, Array: Array, Object: Object, String: String,
    Number: Number, Boolean: Boolean, RegExp: RegExp, Error: Error, isFinite: isFinite, isNaN: isNaN,
    parseInt: parseInt, parseFloat: parseFloat, encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent,
    ContentService: { MimeType: { JSON: 'application/json', TEXT: 'text/plain' },
      createTextOutput: function (t) { return { _t: t, setMimeType: function () { return this; }, getContent: function () { return this._t; } }; } },
    Utilities: { getUuid: function () { return 'FB4ER2-TEST-0000'; }, formatDate: function () { return '2026-08-27'; },
      sleep: function () {}, base64Encode: function (s) { return String(s); } },
    Logger: { log: function () {} },
    SpreadsheetApp: {
      openById: function (id) {
        opened.push(String(id));
        if (!opts.tables) throw new Error('no spreadsheet in test');
        return { getSheetByName: function (n) { return opts.tables[n] ? fakeSheet(n, opts.tables[n]) : null; },
                 getId: function () { return String(id); },
                 insertSheet: forbid('insertSheet'), deleteSheet: forbid('deleteSheet') };
      },
      getActiveSpreadsheet: function () { opened.push('ACTIVE'); return null; }
    },
    PropertiesService: { getScriptProperties: function () {
      return { getProperty: function () { return null; }, setProperty: forbid('setProperty'), deleteProperty: forbid('deleteProperty') }; } },
    Session: { getActiveUser: function () { return { getEmail: function () { return ''; } }; }, getScriptTimeZone: function () { return 'Asia/Taipei'; } },
    LockService: { getScriptLock: function () { violations.push('getScriptLock');
      return { tryLock: function () { return true; }, releaseLock: function () {} }; } },
    CacheService: { getScriptCache: function () { return { get: function () { return null; }, put: function () {} }; } },
    DriveApp: { createFile: forbid('DriveApp.createFile') }, UrlFetchApp: {},
    MailApp: { sendEmail: forbid('MailApp.sendEmail') }, GmailApp: {}, HtmlService: {},
    ScriptApp: { newTrigger: forbid('ScriptApp.newTrigger') }
  };
  sb.globalThis = sb;
  var ctx = vm.createContext(sb);
  GS_FILES.forEach(function (f) { vm.runInContext(fs.readFileSync(path.join(GS_DIR, f), 'utf8'), ctx, { filename: f }); });
  sb.__violations = violations; sb.__opened = opened;
  return sb;
}

var TP = require(path.join(ROOT, 'assets', 'js', 'api', 'km-transport.js'));
var DBAPI_SRC = read('assets/js/api/operation-system-db-api.js');
function makeClient(fetchImpl) {
  var win = { KM: { transportFactory: TP }, location: { origin: 'https://viczhou-glitch.github.io' } };
  var sb = {
    console: console, window: win, JSON: JSON, Math: Math, Date: Date, Promise: Promise,
    Array: Array, Object: Object, String: String, Number: Number, Boolean: Boolean, RegExp: RegExp, Error: Error,
    isFinite: isFinite, isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat,
    encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent,
    setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: function () {}, clearInterval: function () {},
    AbortController: AbortController, performance: { now: function () { return 0; } },
    document: { addEventListener: function () {}, readyState: 'complete' },
    localStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} },
    fetch: fetchImpl
  };
  sb.globalThis = sb; sb.self = sb;
  vm.runInContext(DBAPI_SRC, vm.createContext(sb), { filename: 'operation-system-db-api.js' });
  return { sb: sb, DB: win.KM.DB };
}
function jsonResp(text, url) {
  return { ok: true, status: 200, statusText: 'OK', redirected: false, type: 'basic',
    url: url || 'https://script.google.com/macros/s/AKfyc-test/exec',
    headers: { get: function (h) { return String(h).toLowerCase() === 'content-type' ? 'application/json' : null; } },
    text: function () { return Promise.resolve(text); } };
}

var DEP = makeDeployment();
function post(body) { return JSON.parse(DEP.doPost({ postData: { contents: JSON.stringify(body), type: 'text/plain' }, parameter: {} }).getContent()); }

// =============================================================================================================
section('§1 — ALL FOUR ACTIONS, TRACED MECHANICALLY ON EVERY AXIS');
// =============================================================================================================
THE_FOUR.forEach(function (t) {
  var reg = registryEntry(t.action);
  ok(routed(t.action), '1. ' + t.action + ' — has a router dispatch branch');
  ok(DO_POST.indexOf("action === '" + t.action + "'") !== -1, '1. ' + t.action + ' — dispatched from doPost (the method it is called with)');
  eq(DO_GET.indexOf("action === '" + t.action + "'"), -1, '1. ' + t.action + ' — and NOT from doGet, so the verb is unambiguous');
  ok(!!reg, '1. ' + t.action + ' — has a SYS_REQUIRED_ACTIONS_ entry');
  if (reg) eq(reg.handler, t.handler, '1. ' + t.action + ' — the registry names the handler the router actually calls');
  ok(handlerDefined(t.handler), '1. ' + t.action + ' — that handler is defined in ' + t.owner);
  ok(new RegExp('function\\s+' + t.handler + '\\s*\\(').test(fs.readFileSync(path.join(GS_DIR, t.owner), 'utf8')),
    '1. ' + t.action + ' — in the owner file this trace names, not merely somewhere');
  // Every one of the four answers through jsonResponse_, so the wire shape is the project's single envelope.
  var branch = new RegExp("action === '" + esc(t.action) + "'\\)\\s*\\{[\\s\\S]{0,200}?\\}").exec(RTR);
  ok(!!branch && /(jsonResponse_|handleUpdateShipmentEta_|handleAdvanceShipmentRoutePoint_)/.test(branch[0]),
    '1. ' + t.action + ' — the branch delegates to its handler and answers through jsonResponse_');
});
// The owner build stamps, which are what a partial sync is caught by.
eq(/var RTR_BUILD_VERSION_ = '([^']+)'/.exec(RTR)[1], 'F1-7N-FB-4E-R2', '1. the ROUTER build stamp moved: R2 changed it');
eq(/var EPC_BUILD_VERSION_ = '([^']+)'/.exec(G68)[1], 'F1-7N-FB-4E-R2', '1. the 68_ owner stamp moved: R2 changed it');
eq(/var SYS_BUILD_VERSION_ = '([^']+)'/.exec(G63)[1], 'F1-7N-FB-4E-R2', '1. the 63_ owner stamp moved: R2 changed it');
// 31_ and 59_ were NOT changed, so their stamps must NOT move — a stamp that moves without a change is noise.
ok(/SKD_BUILD_VERSION_', expected: 'F1-7N-FB-4C-R1'/.test(G63), '1. 59_ is unchanged this round and keeps its FB-4C-R1 stamp');
ok(!/SKD_BUILD_VERSION_ = 'F1-7N-FB-4E-R2'/.test(GS_ALL), '1. and nothing bumped it just to look current');
ok(!/var SHIP.*BUILD_VERSION_/.test(read('assets/specs/active/apps-script/31_shipment_receipt_route_handlers.gs')),
  '1. 31_ carries no build stamp at all — 63_ says so, and its currency is proven by the SYMBOL probe instead');

// =============================================================================================================
section('§2 — THE THREE REGISTRY ADDITIONS ARE CANONICAL AND NON-DUPLICATE');
// =============================================================================================================
var regRows = [], rre = /\{ action: '([^']+)',\s*handler: '([^']+)', used_by: '([^']*)' \}/g, rm;
while ((rm = rre.exec(G63))) regRows.push({ action: rm[1], handler: rm[2], used_by: rm[3] });
eq(regRows.length, 39, '2. SYS_REQUIRED_ACTIONS_ holds 39 entries (35 before R2, plus the four)');
var seenAction = {}, dupAction = [];
regRows.forEach(function (r) { if (seenAction[r.action]) dupAction.push(r.action); seenAction[r.action] = true; });
eq(dupAction.length, 0, '2. no action is registered twice' + (dupAction.length ? ': ' + dupAction.join(', ') : ''));
regRows.forEach(function (r) {
  ok(!!r.used_by, '2. every entry states what depends on it (' + r.action + ')');
});
['shipment.eta.update', 'shipment.route.advance', 'skuDetails.workspace.get'].forEach(function (a) {
  var e = registryEntry(a);
  ok(!!e && /owner = \d\d_/.test(e.used_by), '2. ' + a + ' names its OWNER file, so a partial sync points at a file');
});

// =============================================================================================================
section('§3 — THE NEW ROUTER DISPATCH: present, delegating, and preserving the canonical marker');
// =============================================================================================================
var NEW_ACTION = 'system.executionPlanDuplicateLineDiagnostic';
ok(routed(NEW_ACTION), '3. the dispatch branch exists');
ok(/if \(action === 'system\.executionPlanDuplicateLineDiagnostic'\) \{\s*\n\s*body\.__km_handler = 'doPost';\s*\n\s*return jsonResponse_\(handleExecutionPlanDuplicateLineDiagnostic_\(body\)\);\s*\n\s*\}/.test(RTR),
  '3. it sets __km_handler and delegates through jsonResponse_, exactly like the health branch');
var dupDispatch = (RTR.match(new RegExp("action === '" + esc(NEW_ACTION) + "'", 'g')) || []).length;
eq(dupDispatch, 1, '3. and it is dispatched EXACTLY once');
// Executed: the action now resolves rather than falling through to the terminal unknown-action answer.
var scoped = post({ action: NEW_ACTION, allocation_draft_id: 'SADH-K2-TEST' });
ok(!/Invalid POST action|Missing or invalid action parameter/.test(JSON.stringify(scoped)),
  '3. EXECUTED: the router no longer answers with its terminal unknown-action envelope');
eq(scoped.meta && scoped.meta.action, NEW_ACTION,
  '3. and the answer NAMES ITSELF correctly — the envelope used to hardcode its sibling action');
eq(scoped.meta && scoped.meta.read_only, true, '3. declaring itself read-only');
// The sibling it used to impersonate is unchanged.
var sib = post({ action: 'system.executionPlanConflictDiagnostic' });
eq(sib.meta && sib.meta.action, 'system.executionPlanConflictDiagnostic',
  '3. the conflict diagnostic still names itself — the defaulted parameter changed nothing for it');

// =============================================================================================================
section('§4 — THE NEWLY EXPOSED DIAGNOSTIC IS READ-ONLY, BOUNDED, AND CANNOT REACH THE REPAIR');
// =============================================================================================================
// (a) FAILS CLOSED, AND READS NOTHING, when a routed request names no scope.
var depA = makeDeployment();
var unscoped = JSON.parse(depA.doPost({ postData: { contents: JSON.stringify({ action: NEW_ACTION }), type: 'text/plain' }, parameter: {} }).getContent());
eq(unscoped.success, false, '4a an UNSCOPED routed request is refused');
eq(unscoped.errors[0].code, 'DIAGNOSTIC_SCOPE_REQUIRED', '4a with a typed code, not a generic error');
eq(unscoped.errors[0].rows_read, 0, '4a stating that nothing was read');
eq(depA.__opened.length, 0, '4a and PROVEN: the spreadsheet was never opened at all — the refusal precedes the read');
eq(depA.__violations.length, 0, '4a no write primitive was reached');

// (b) THE EDITOR PATH IS UNCHANGED — the guard keys on the router's marker, which an editor call never carries.
var depB = makeDeployment();
depB.handleExecutionPlanDuplicateLineDiagnostic_({});
ok(depB.__opened.length > 0, '4b an EDITOR invocation (no __km_handler) still proceeds to read — behaviour preserved');
eq(depB.__violations.length, 0, '4b and it too writes nothing');

// (c) A FULL SCOPED SCAN OVER REAL ROWS PERFORMS ZERO WRITES. Two rows share a primary key, so the handler runs
//     its whole duplicate-classification path rather than an early return.
var HEAD = ['allocation_draft_id', 'allocation_draft_line_id', 'sku', 'site_sku', 'window_code', 'planned_qty', 'route_no', 'line_status'];
var ROWS = [HEAD,
  ['SADH-K2-TEST', 'LINE-1', 'SKU-A', 'SKU-A-US', 'W1', 10, 'R1', 'active'],
  ['SADH-K2-TEST', 'LINE-1', 'SKU-A', 'SKU-A-US', 'W1', 10, 'R1', 'active'],
  ['SADH-K2-TEST', 'LINE-2', 'SKU-B', 'SKU-B-US', 'W1', 5, 'R1', 'active']];
var depC = makeDeployment({ tables: { shipping_allocation_draft_lines: ROWS, shipping_allocation_drafts: [['allocation_draft_id'], ['SADH-K2-TEST']] } });
var scan = JSON.parse(depC.doPost({ postData: { contents: JSON.stringify({ action: NEW_ACTION, allocation_draft_id: 'SADH-K2-TEST' }), type: 'text/plain' }, parameter: {} }).getContent());
eq(scan.success, true, '4c a scoped scan over real rows succeeds');
eq(scan.data.duplicate_group_count, 1, '4c and finds the duplicate primary key that is actually there');
eq(depC.__violations.length, 0, '4c ZERO WRITE PRIMITIVES were reached during a full scan (measured, not asserted)');
eq(scan.data.zero_write_proof.db_writes, 0, '4c the answer reports db_writes 0');
eq(scan.data.zero_write_proof.rows_deleted, 0, '4c and rows_deleted 0');
eq(scan.data.read_only, true, '4c and declares itself read-only');
eq(scan.meta.locks_taken, 0, '4c no lock was declared');
ok(/PROPOSAL ONLY/.test(scan.data.repair_proposal.statement), '4c the repair is a PROPOSAL, not an action');

// (d) THE REPAIR PATH IS NOT REACHABLE FROM THE NETWORK.
ok(/function TEMP_EXECUTION_PLAN_DUPLICATE_CLEANUP/.test(GS_ALL), '4d the cleanup entry point exists in 68_');
// The bare name appears in the router's own explanatory comment, so the guard looks for a DISPATCH or a CALL.
eq(/action === '[^']*CLEANUP'/.test(RTR), false, '4d and no router branch dispatches a CLEANUP action');
eq(/TEMP_EXECUTION_PLAN_DUPLICATE_CLEANUP\s*\(/.test(RTR), false, '4d nor does the router ever CALL it');
eq(/TEMP_EXECUTION_PLAN_DUPLICATE_CLEANUP\s*\(/.test(GS_ALL.replace(/function TEMP_EXECUTION_PLAN_DUPLICATE_CLEANUP\s*\(/g, '')), false,
  '4d and nothing anywhere in the deployment calls it — it is reachable only by an operator in the editor');
ok(/TEMP_DUPFIX_MODE_/.test(G68) && /COMMIT/.test(G68), '4d it additionally requires an explicit COMMIT mode');
ok(/TEMP_DUPFIX_CONFIRMATION_/.test(G68), '4d and a confirmation checksum covering the exact rows');
// The routed handler holds no write primitive at all, at source level as well as at runtime.
var hStart = G68.indexOf('function handleExecutionPlanDuplicateLineDiagnostic_');
var hSrc = G68.slice(hStart, G68.indexOf('\n}', G68.indexOf('return epcEnvelope_(true, {', hStart)) + 2);
ok(!/setValue|setValues|appendRow|deleteRow|insertRow|clearContent|getScriptLock|MailApp|DriveApp/.test(hSrc),
  '4d the handler source contains no write primitive of any kind');
// Authorization: stated for what it is rather than fabricated.
ok(/DEPLOYMENT_ACCESS/.test(read('assets/specs/active/apps-script/45_api_v1_automation_schedule.gs')),
  '4e the project authority model is DEPLOYMENT_ACCESS, declared in 45_');
ok(/NOT AN AUTHORIZATION MODEL/.test(G68) || /not an authorization model/i.test(G68),
  '4e and the new guard says plainly that it bounds EXPOSURE rather than pretending to be a role check');

// =============================================================================================================
section('§5 — THE CONTRACT STAMPS MOVED CONSISTENTLY, AND THE CLIENT PIN AGREES WITHOUT BEING LOWERED');
// =============================================================================================================
var ACTION_CONTRACT = Number(/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+)/.exec(G63)[1]);
var LIST_VERSION = Number(/var SYS_REQUIRED_ACTION_LIST_VERSION_ = (\d+)/.exec(G63)[1]);
var TRANSPORT_CONTRACT = Number(/var SYS_TRANSPORT_CONTRACT_VERSION_ = (\d+)/.exec(G63)[1]);
var CLIENT_ACTION_PIN = Number(/var KM_EXPECTED_ACTION_CONTRACT_VERSION_ = (\d+)/.exec(DBAPI_SRC)[1]);
var CLIENT_TRANSPORT_PIN = Number(/var KM_EXPECTED_TRANSPORT_CONTRACT_VERSION_ = (\d+)/.exec(DBAPI_SRC)[1]);

eq(ACTION_CONTRACT, 8, '5. SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ 7 -> 8, because a router ACTION was added');
eq(LIST_VERSION, 8, '5. SYS_REQUIRED_ACTION_LIST_VERSION_ 7 -> 8, because SYS_REQUIRED_ACTIONS_ changed');
eq(TRANSPORT_CONTRACT, 1, '5. SYS_TRANSPORT_CONTRACT_VERSION_ stays 1 — no router response-identity field changed');
eq(CLIENT_ACTION_PIN, ACTION_CONTRACT, '5. the client pin AGREES with the deployment contract');
eq(CLIENT_TRANSPORT_PIN, TRANSPORT_CONTRACT, '5. and so does the transport pin');
ok(CLIENT_ACTION_PIN >= 8, '5. the pin was RAISED to 8, never lowered');
ok(ACTION_CONTRACT >= 8 && LIST_VERSION >= 8, '5. and neither deployment stamp went backwards');
// The stamps the deployment reports must equal the constants, executed rather than read.
var H = post({ action: 'system.health' });
eq(H.deployed_action_contract_version, ACTION_CONTRACT, '5. EXECUTED: the answer reports the action contract it declares');
eq(H.required_action_list_version, LIST_VERSION, '5. EXECUTED: and the list version it declares');
eq(H.required_action_count, 39, '5. EXECUTED: and counts all 39 registered actions');
// A deployment one contract behind is now rejected BY VERSION, which is the second gate the bump buys.
checks.push((function () {
  var behind = JSON.parse(JSON.stringify(H));
  behind.deployed_action_contract_version = 7;
  behind.caller_probe = { requested_by_caller: true, all_present: true, missing_actions: [], missing_symbols: [] };
  return makeClient(function (u) { return Promise.resolve(jsonResp(JSON.stringify(behind), String(u))); })
    .DB.checkDeploymentContract().then(function (v) {
      eq(v.ok, false, '5. a deployment at contract v7 is REFUSED by the raised pin');
      ok(/action contract is v7 but this frontend needs v8/.test(v.message), '5. naming both versions and the fix');
    });
})());

// =============================================================================================================
section('§6 — THE JOINED PRODUCTION-LIKE PROBE: all four resolve, and it STILL fails closed');
// =============================================================================================================
var cap = {};
var client = makeClient(function (url, init) {
  cap.body = (init && init.body) ? String(init.body) : '';
  var out = DEP.doPost({ postData: { contents: cap.body, type: 'text/plain' }, parameter: {} });
  cap.answer = out.getContent();
  return Promise.resolve(jsonResp(cap.answer, String(url)));
});
checks.push(client.DB.checkDeploymentContract().then(function (v) {
  var probe = (v.identity || {}).caller_probe || {};
  var sent = JSON.parse(cap.body || '{}');
  THE_FOUR.forEach(function (t) {
    ok(sent.probe_actions.indexOf(t.action) !== -1, '6. the shipped client still PROBES ' + t.action + ' — none was removed');
    var row = (probe.actions || []).filter(function (a) { return a.action === t.action; })[0];
    ok(!!row, '6. and the deployment answers for it');
    if (row) {
      eq(row.known_to_this_build, true, '6. ' + t.action + ' is known to this build');
      eq(row.handler_present, true, '6. ' + t.action + ' its handler symbol is present');
      eq(row.available, true, '6. ' + t.action + ' RESOLVES');
    }
  });
  eq((probe.missing_actions || []).length, 0, '6. missing_actions is EMPTY');
  eq((probe.missing_symbols || []).length, 0, '6. missing_symbols is EMPTY');
  eq(probe.all_present, true, '6. the caller probe is fully satisfied');
  eq(v.ok, true, '6. DEPLOYMENT_CONTRACT_OK IS REACHABLE — the goal of this round');
  eq(v.code, 'DEPLOYMENT_CONTRACT_OK', '6. and it is that code, against the real executed router');
  eq(v.endpoint.endpointClass, 'STABLE_EXEC', '6. with the endpoint axis still classified separately');
  // Nothing was synthesized: the availability came off the wire.
  var wire = JSON.parse(cap.answer);
  eq(probe.all_present, wire.caller_probe.all_present, '6. availability equals what the deployment emitted, not a client default');
}));

// AND IT STILL FAILS CLOSED. An action that genuinely does not exist must still be reported missing.
checks.push((function () {
  var dep2 = makeDeployment();
  var body = { action: 'system.health', probe_actions: ['skuDetails.workspace.get', 'system.thisActionDoesNotExist'], probe_symbols: [] };
  var ans = JSON.parse(dep2.doPost({ postData: { contents: JSON.stringify(body), type: 'text/plain' }, parameter: {} }).getContent());
  eq(ans.caller_probe.all_present, false, '6. a probe naming a NON-EXISTENT action is not satisfied');
  eq(ans.caller_probe.missing_actions.join(','), 'system.thisActionDoesNotExist', '6. and exactly that action is named missing');
  eq(ans.ok, false, '6. the deployment itself reports NOT ok');
  var synth = JSON.parse(JSON.stringify(ans));
  return makeClient(function (u) { return Promise.resolve(jsonResp(JSON.stringify(synth), String(u))); })
    .DB.checkDeploymentContract().then(function (v) {
      eq(v.ok, false, '6. and the client REFUSES it — the OK verdict is earned, not automatic');
      eq(v.code, 'DEPLOYMENT_CONTRACT_MISMATCH', '6. as a contract mismatch');
      ok(/system\.thisActionDoesNotExist/.test(v.message), '6. naming the action that is actually absent');
    });
})());

// A missing SYMBOL must also still fail closed — the axis that catches a file one round behind.
checks.push((function () {
  var dep3 = makeDeployment();
  var body = { action: 'system.health', probe_actions: [], probe_symbols: ['thisSymbolWasNeverDefined_'] };
  var ans = JSON.parse(dep3.doPost({ postData: { contents: JSON.stringify(body), type: 'text/plain' }, parameter: {} }).getContent());
  eq(ans.caller_probe.missing_symbols.join(','), 'thisSymbolWasNeverDefined_', '6. an absent owner SYMBOL is still reported');
  return Promise.resolve();
})());

// =============================================================================================================
section('§7 — STANDING REGRESSION GUARDS: this class of drift cannot silently return');
// =============================================================================================================
// G1 — every registry entry must have a real router branch and a real handler. This is the guard that would
//      have caught the four from the other direction had it existed.
var g1bad = regRows.filter(function (r) { return !routed(r.action) || !handlerDefined(r.handler); });
eq(g1bad.length, 0, 'G1 every SYS_REQUIRED_ACTIONS_ entry is routed AND has a defined handler'
  + (g1bad.length ? ': ' + g1bad.map(function (r) { return r.action; }).join(', ') : ''));

// G2 — every action the CLIENT requires must be registered, routed and defined. This is the guard that fails if
//      a future round adds a probe action without wiring it, which is exactly how the fourth fault happened.
var probeList = (function () {
  var m = /var KM_REQUIRED_DEPLOYED_ACTIONS_ = \[([\s\S]*?)\n\];/.exec(DBAPI_SRC)[1];
  return (m.match(/'[A-Za-z][A-Za-z0-9.]*'/g) || []).map(function (x) { return x.slice(1, -1); });
})();
ok(probeList.length >= 15, 'G2 the client probe list is non-trivial (' + probeList.length + ' actions)');
var g2bad = probeList.filter(function (a) { return !registryEntry(a) || !routed(a); });
eq(g2bad.length, 0, 'G2 every client-probed required action is REGISTERED and ROUTED'
  + (g2bad.length ? ': ' + g2bad.join(', ') : ''));

// G3 — no duplicate registry entry (already counted above, asserted here as a standing rule).
eq(Object.keys(seenAction).length, regRows.length, 'G3 the registry has no duplicate action');

// G4 — no duplicate dispatch WITHIN an entrypoint. Cross-entrypoint duplication is deliberate for the three
//      read actions routed on both verbs, so the rule is scoped per entrypoint rather than banned outright.
[['doGet', DO_GET], ['doPost', DO_POST]].forEach(function (p) {
  var c = {}, dups = [];
  (p[1].match(/action === '[^']+'/g) || []).forEach(function (x) { c[x] = (c[x] || 0) + 1; if (c[x] === 2) dups.push(x); });
  eq(dups.length, 0, 'G4 ' + p[0] + ' dispatches no action twice' + (dups.length ? ': ' + dups.join(', ') : ''));
});
['system.health', 'inventoryScope.registry.get', 'getClientCapabilities'].forEach(function (a) {
  ok(DO_GET.indexOf("action === '" + a + "'") !== -1 && DO_POST.indexOf("action === '" + a + "'") !== -1,
    'G4 ' + a + ' remains deliberately routed on BOTH verbs');
});

// G5 — the module manifest must expect the stamps the files actually declare, or a correct deployment reports
//      itself partially synced.
var manifest = [], mre = /\{ file: '([^']+)', symbol: '([^']+)', expected: '([^']+)'/g, mm;
while ((mm = mre.exec(G63))) manifest.push({ file: mm[1], symbol: mm[2], expected: mm[3] });
ok(manifest.length >= 11, 'G5 the module build-stamp manifest is populated (' + manifest.length + ' files)');
var g5bad = manifest.filter(function (m) {
  var src; try { src = fs.readFileSync(path.join(GS_DIR, m.file), 'utf8'); } catch (e) { return true; }
  var d = new RegExp('var ' + m.symbol + " = '([^']+)'").exec(src);
  return !d || d[1] !== m.expected;
});
eq(g5bad.length, 0, 'G5 every manifest entry matches the build its file declares'
  + (g5bad.length ? ': ' + g5bad.map(function (m) { return m.file; }).join(', ') : ''));
// Executed: a correctly-synced deployment must NOT report itself mixed.
eq(H.mixed_deployment, false, 'G5 EXECUTED: a fully-synced deployment reports mixed_deployment false');
eq((H.module_build_stamps.stale_modules || []).length, 0, 'G5 EXECUTED: with no stale module');
eq((H.module_build_stamps.absent_modules || []).length, 0, 'G5 EXECUTED: and no absent module');

// G6 — the frontend must never synthesize availability. Every value in the identity comes off the wire.
var cdc = DBAPI_SRC.slice(DBAPI_SRC.indexOf('window.KM.DB.checkDeploymentContract'),
  DBAPI_SRC.indexOf('window.KM.DB.getRequestOrderSendDiagnosticStatus'));
ok(!/all_present\s*[:=]\s*true/.test(cdc), 'G6 the client never sets all_present itself');
ok(!/missing_actions\s*[:=]\s*\[\s*'[^']/.test(cdc), 'G6 nor invents a missing-actions list');
ok(!/available\s*[:=]\s*true/.test(cdc), 'G6 nor marks an action available');

// =============================================================================================================
section('§8 — THE BUSINESS ACTIONS THIS ROUND TOUCHED ARE BEHAVIOURALLY UNCHANGED');
// =============================================================================================================
// R2 added registry ROWS and one router BRANCH. It changed no handler for a business action, so the two write
// handlers it registered must be byte-identical to their committed state, proven against git rather than eyed.
// Asked of git rather than by comparing bytes: the stored blob is line-ending normalized, so a byte compare
// against the working file reports a difference that does not exist. `git diff --name-only` answers the actual
// question -- did this file change since the R1 commit -- and prints nothing when the answer is no.
var cp = require('child_process');
var R1_REF = 'c5048fd';
[['31_shipment_receipt_route_handlers.gs', 'shipment ETA + route-advance writers'],
 ['59_api_v1_sku_details_workspace.gs', 'SKU Details / SKU Regional workspace read'],
 ['16_shipping_allocation_handlers.gs', 'the allocation writer this diagnostic reports on'],
 ['11_shipping_plan_handlers.gs', 'the Submit-to-Shipping-Plan owner']].forEach(function (p) {
  var rel = 'assets/specs/active/apps-script/' + p[0];
  var changed = '?';
  try { changed = cp.execSync('git diff --name-only ' + R1_REF + ' -- "' + rel + '"', { cwd: ROOT, encoding: 'utf8' }).trim(); }
  catch (e) { changed = 'GIT_ERROR: ' + (e && e.message); }
  eq(changed, '', '8. ' + p[0] + ' (' + p[1] + ') is UNCHANGED since the R1 commit');
});
// Only the four files this round is allowed to touch on the Apps Script side may differ at all.
var gsChanged = '';
try { gsChanged = cp.execSync('git diff --name-only ' + R1_REF + ' -- "assets/specs/active/apps-script"', { cwd: ROOT, encoding: 'utf8' }).trim(); }
catch (e) { gsChanged = 'GIT_ERROR'; }
// Split without a regex literal: this file is written by tooling and an escaped newline class is fragile here.
var gsList = gsChanged ? gsChanged.split(String.fromCharCode(10))
  .map(function (x) { return x.trim().split('/').pop(); }).filter(Boolean).sort() : [];
eq(gsList.join(','), '01_router.gs,63_api_v1_system_health.gs,68_api_v1_execution_plan_conflict_diagnostic.gs',
  '8. exactly three Apps Script files changed this round, and they are the three this trace names');
// And within 68_, only the duplicate diagnostic's boundary changed: the conflict diagnostic's own logic is intact.
ok(/function handleExecutionPlanConflictDiagnostic_/.test(G68), '8. the conflict diagnostic handler still exists');
eq((G68.match(/DIAGNOSTIC_SCOPE_REQUIRED/g) || []).length, 1, '8. the new guard appears exactly once, on the routed path only');
ok(/epcEnvelope_\(false, null, \[\{ code: 'DB_NOT_REACHABLE'/.test(G68), '8. and the pre-existing fail-closed paths are intact');

// =============================================================================================================
Promise.all(checks).then(function () {
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
}, function (e) {
  console.log('\nSUITE ERROR: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
