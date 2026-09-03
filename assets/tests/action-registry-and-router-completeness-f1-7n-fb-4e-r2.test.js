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
// F1-7N-FB-4E-R4A1 — ANCHORED TO THE DECLARATION, NOT TO THE FIRST MENTION.
//
// These used indexOf('function doPost'), which matches PROSE as readily as code. An R4A1 comment containing the
// words "function doPost" moved the split above doGet, doPost swallowed the entire file, and G4 then reported
// that doPost dispatches system.health twice — a confident assertion about text it had mis-sliced. The anchors
// are now the declarations themselves, at the start of a line, and the slice is verified before it is used.
var _gAt = RTR.search(/(^|\n)function doGet\s*\(/);
var _pAt = RTR.search(/(^|\n)function doPost\s*\(/);
ok(_gAt > -1 && _pAt > _gAt, 'ROUTER SLICE doGet and doPost are located, in that order (' + _gAt + '/' + _pAt + ')');
var DO_GET = RTR.slice(_gAt, _pAt);
var DO_POST = RTR.slice(_pAt);
ok(/function doGet\s*\(/.test(DO_GET) && !/function doPost\s*\(/.test(DO_GET),
  'ROUTER SLICE the doGet slice contains doGet and not doPost');
ok(/function doPost\s*\(/.test(DO_POST), 'ROUTER SLICE the doPost slice contains doPost');

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
// F1-7N-FB-4E-R3 — STAMPS ARE CHECKED AS A RULE, NOT AS FROZEN STRINGS. R2 moved these three; R3 moved 01_ and
// 63_ again (a new routed action and a new registry entry) and left 68_ alone. Pinning the literal made R3's
// correct change look like a regression, which is the trap this repo already documents for release tokens. What
// must hold: each is at R2 or later, and 68_ — unchanged in R3 — is still exactly R2.
// F1-7N-FC-1A-R1 — DERIVED. The R[2-9] pattern encoded "an FB-4E revision at R2 or later", which held
// only while FB-4E was the family that last touched the router. R1 adds a dispatch and leaves that family.
// The rule this line is FOR — a change is never silent — is kept by pairing the declaration
// with the manifest expectation, which cannot drift apart in either direction.
var _r2RtrExpect = ((G63.match(/\{ file: '01_router\.gs',[^}]*expected: '([^']+)'/) || [])[1]) || '(none)';
ok(new RegExp("var RTR_BUILD_VERSION_ = '" + _r2RtrExpect + "'").test(RTR),
  '1. the ROUTER declares exactly the build its manifest expects (' + _r2RtrExpect + ')');
eq(/var EPC_BUILD_VERSION_ = '([^']+)'/.exec(G68)[1], 'F1-7N-FB-4E-R2', '1. 68_ moved in R2 and NOT since — R3 did not touch it');
// RESTATED (F1-7N-FC-1B-E3): the same family pin the four lines above already converted for the ROUTER,
// left literal for 63_. `F1-7N-FB-4E-R[2-9]` encoded "an FB-4E revision at R2 or later", which held only
// while FB-4E was the family that last touched 63_; E3 moves it out of that family (63_ now reports the
// effective inventory_ai_plan_db_generation_enabled value). Paired with its own manifest entry instead,
// which is the property that cannot drift in either direction.
var _r2SysExpect = ((G63.match(/\{ file: '63_api_v1_system_health\.gs',[^}]*expected: '([^']+)'/) || [])[1]) || '(none)';
ok(_r2SysExpect !== '(none)' && new RegExp("var SYS_BUILD_VERSION_ = '" + _r2SysExpect + "'").test(G63),
  '1. 63_ declares exactly the build its own manifest expects (' + _r2SysExpect + ')');
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
// 35 before R2, +4 in R2 = 39, +1 in R3 (overseasStock.workspace.get) = 40. The count grows; the rule is that
// it never SHRINKS below what R2 established and that every entry is still routed and handled (G1 below).
ok(regRows.length >= 39, '2. SYS_REQUIRED_ACTIONS_ holds at least the 39 entries R2 established (now ' + regRows.length + ')');
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

// R2 took these 7 -> 8; R3 took them 8 -> 9 for the same reasons (a new router action, a changed registry).
// Floored at R2's values so a future round may raise them and nothing can quietly lower one.
ok(ACTION_CONTRACT >= 8, '5. SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ is at R2 level or later (v' + ACTION_CONTRACT + ')');
ok(LIST_VERSION >= 8, '5. SYS_REQUIRED_ACTION_LIST_VERSION_ is at R2 level or later (v' + LIST_VERSION + ')');
eq(TRANSPORT_CONTRACT, 1, '5. SYS_TRANSPORT_CONTRACT_VERSION_ stays 1 — no router response-identity field changed');
eq(CLIENT_ACTION_PIN, ACTION_CONTRACT, '5. the client pin AGREES with the deployment contract');
eq(CLIENT_TRANSPORT_PIN, TRANSPORT_CONTRACT, '5. and so does the transport pin');
ok(CLIENT_ACTION_PIN >= 8, '5. the pin was RAISED to 8, never lowered');
ok(ACTION_CONTRACT >= 8 && LIST_VERSION >= 8, '5. and neither deployment stamp went backwards');
// The stamps the deployment reports must equal the constants, executed rather than read.
var H = post({ action: 'system.health' });
eq(H.deployed_action_contract_version, ACTION_CONTRACT, '5. EXECUTED: the answer reports the action contract it declares');
eq(H.required_action_list_version, LIST_VERSION, '5. EXECUTED: and the list version it declares');
eq(H.required_action_count, regRows.length, '5. EXECUTED: and counts exactly the registered actions');
// A deployment one contract behind is now rejected BY VERSION, which is the second gate the bump buys.
checks.push((function () {
  var behind = JSON.parse(JSON.stringify(H));
  behind.deployed_action_contract_version = ACTION_CONTRACT - 1;
  behind.caller_probe = { requested_by_caller: true, all_present: true, missing_actions: [], missing_symbols: [] };
  return makeClient(function (u) { return Promise.resolve(jsonResp(JSON.stringify(behind), String(u))); })
    .DB.checkDeploymentContract().then(function (v) {
      eq(v.ok, false, '5. a deployment one contract version behind is REFUSED by the raised pin');
      ok(new RegExp('action contract is v' + (ACTION_CONTRACT - 1) + ' but this frontend needs v' + ACTION_CONTRACT).test(v.message),
        '5. naming both versions and the fix');
    });
})());

// =============================================================================================================
section('§6 — THE JOINED PRODUCTION-LIKE PROBE: all four resolve, and it STILL fails closed');
// =============================================================================================================
// F1-7N-FB-4E-R4A1 — THE MOCK SPEAKS THE CANONICAL WIRE FORMAT, NOT ONE VERB'S VERSION OF IT.
//
// This mock read the probe list out of `init.body` and answered every request with doPost. Both halves assumed
// the read verb. R4A1 dispatches reads as a GET from the stable /exec (an Apps Script POST cannot survive the
// /exec 302), with the same body carried in `km_body` — so `init.body` was empty and `sent.probe_actions` threw.
// Nothing was wrong with the client. The mock now parses whichever form arrived and routes to the entry point the
// client actually addressed, which is the only way this stays a test of the shipped request.
var cap = {};
function _wireOf(url, init) {
  var body = (init && init.body) ? String(init.body) : '';
  if (body) return { method: 'POST', body: body };
  var m = /[?&]km_body=([^&]*)/.exec(String(url));
  return { method: 'GET', body: m ? decodeURIComponent(m[1]) : '{}' };
}
function _qsOf(url) {
  var qs = {};
  String(String(url).split('?')[1] || '').split('&').forEach(function (kv) {
    var i = kv.indexOf('='); if (i > 0) qs[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
  });
  return qs;
}
var client = makeClient(function (url, init) {
  var w = _wireOf(url, init);
  cap.body = w.body;
  cap.method = w.method;
  var out;
  if (w.method === 'GET') {
    // The router reconstructs the body from km_body itself, so the query map is what a GET actually delivers.
    out = DEP.doGet({ parameter: _qsOf(url) });
  } else {
    out = DEP.doPost({ postData: { contents: w.body, type: 'text/plain' }, parameter: _qsOf(url) });
  }
  cap.answer = out.getContent();
  return Promise.resolve(jsonResp(cap.answer, String(url)));
});
checks.push(client.DB.checkDeploymentContract().then(function (v) {
  var probe = (v.identity || {}).caller_probe || {};
  var sent = JSON.parse(cap.body || '{}');
  // The probe list must reach the deployment whichever verb carries it. That is the property §6 depends on, and
  // it was previously implied by the mock rather than asserted.
  ok(!!sent.probe_actions && sent.probe_actions.length > 0,
    '6. the probe list reached the deployment (via ' + cap.method + ')');
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
// F1-7N-FB-4F-B3 - 16_ LEAVES THIS LIST, AND IS REPLACED BY A STRONGER PAIR OF GUARDS RATHER THAN BY NOTHING.
//
// "UNCHANGED since R1" was the right protection for every round from R1 to B2, and it did its job twice: it is
// why the B1 route-identity contract went into a NEW file instead of into the writer. But B3 is the round whose
// entire purpose is to change this writer - it teaches the runtime the two append-only columns BEFORE they
// exist, because B2 measured that the opposite order breaks every allocation read and write. A guard that
// forbids the one round licensed to act is not protecting anything; it is only postponing the edit.
//
// So the property moves from "it never changes" to "it never changes SILENTLY, and its identity never moves":
//   (a) whatever 16_ declares, the deployment manifest expects exactly that - a change is always DECLARED, and
//       a half-synced deployment is still a named fact from either direction;
//   (b) sadK2GroupKey_ is BYTE-IDENTICAL - the ten dimensions in the frozen order - so no existing SADH-K2- id
//       can regenerate differently and no persisted row is re-keyed by a refactor.
// Both are asserted below. The other three business writers keep the original unchanged-since-R1 rule exactly.
// F1-7N-FC-1A — 11_ LEAVES THIS LIST, AND IS REPLACED BY THE SAME STRONGER PAIR THAT REPLACED 16_.
//
// "UNCHANGED since R1" was the right protection for 11_ through every round up to FC-0A, and it did its job:
// A2-R3, A2-R4 and A3 all recorded that they had NOT touched the Submit owner. FC-1A is the round whose
// purpose requires touching it. The FC-0A audit measured that Approve writes status='approved' and then
// creates the Shipment Draft inside a try/catch that does not undo it, reporting a bare success when the
// second half fails — so an approved plan with no shipment looked exactly like a healthy one. Fixing
// that means changing 11_'s answer. A guard that forbids the one round licensed to act is not protecting
// anything; it is only postponing the edit.
//
// So the property moves from "it never changes" to "it never changes SILENTLY, and its grouping never moves":
//   (a) whatever 11_ declares, the deployment manifest expects exactly that — a change is always
//       DECLARED, and a half-synced deployment is a named fact from either direction;
//   (b) shippingPlanRouteGroupKey_ carries no allocation_draft_id, so the frozen Option A grouping stands and
//       no persisted shipping plan can regroup.
// Both are asserted below. The other two business files keep the original unchanged-since-R1 rule exactly.
[['31_shipment_receipt_route_handlers.gs', 'shipment ETA + route-advance writers'],
 ['59_api_v1_sku_details_workspace.gs', 'SKU Details / SKU Regional workspace read']].forEach(function (p) {
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
// F1-7N-FB-4E-R4A — RESTATED, AND THE REASON IS WORTH RECORDING.
//
// This was an EXACT-LIST assertion pinned to the R1 commit, so it could only ever be correct until the next
// round legitimately added an Apps Script file. R3 added 70_api_v1_overseas_stock_workspace.gs and this line
// began failing at 8d42ca1 — before R4A existed, and it was NOT reported in the R3 completion report. The
// failure was confirmed independent of R4A: the git query it runs returns the same four files with a clean tree.
//
// A correct bump must not look like a regression, so the rule is stated as what it defends: this line touches
// only Apps Script files it OWNS, and never the four business writers (asserted separately above, unchanged).
// The set is therefore a SUBSET check against an allowlist that names the owning round — an unexpected file
// still fails, which is the property that mattered, while a later round adding its own file does not.
var GS_OWNED_SINCE_R1 = {
  '01_router.gs': 'FB-4E-R2 dispatch + FB-4E-R3 overseas action',
  '63_api_v1_system_health.gs': 'FB-4E-R2 registry entries + FB-4E-R3 contract 9',
  '68_api_v1_execution_plan_conflict_diagnostic.gs': 'FB-4E-R2 routed-path scope guard',
  '70_api_v1_overseas_stock_workspace.gs': 'FB-4E-R3 overseas scoped workspace owner (new file)',
  // F1-7N-FB-4E-R4B-R1 - the factory site allocation and the draft-readback coherence fix.
  '47_api_v1_recommendation_generation.gs': 'FB-4E-R4B-R1 flat scope readback: real submittedSkus + derived noDraftSkus',
  '56_api_v1_ai_plan_first_layer.gs': 'FB-4E-R4B-R1 Order Planning factory column = the KMFSA site allocation, not the whole pool',
  '90_generated_supply_planning_bundle.gs': 'FB-4E-R4B-R1 regenerated (KMFSA added, KMRDV2P readback fix) - GENERATED, never hand-edited',
  'TEMP_order_planning_draft_readback_diagnose.gs': 'FB-4E-R4B-R1 read-only live diagnostic (new file; NOT routed)',
  // F1-7N-FB-4F-B1 - the route identity + append-only schema CONTRACT. A NEW file, deliberately, because this
  // suite asserts by name that 16_shipping_allocation_handlers.gs (the allocation writer) is UNCHANGED - and
  // that guard is right: B1 is a contract round and must not touch the live writer. Not routed, no registry
  // symbol, no manifest entry, no live wiring. The owned-set entry is an OWNERSHIP RECORD, which is what this
  // map is for; the guard itself is untouched and an unexpected file still fails.
  '69_api_v1_route_identity_contract.gs': 'FB-4F-B1 frozen route identity + schema contract (new file; NOT routed)',
  // F1-7N-FB-4F-B3 - the code-first schema compatibility round. 16_ learns the two append-only columns before
  // they exist (30..35 header, 30..31 line) and calls 69_ for the typed refusals and the K4 identity; 69_
  // becomes a synchronized owner and joins the build manifest; 63_ carries both expectations.
  '16_shipping_allocation_handlers.gs': 'FB-4F-B3 code-first schema compatibility (the round licensed to change the writer)',
  // F1-7N-FB-4G-A2-R4 §J - a REQUIRED production action was owned by a file named TEMP, so doing what that name
  // invites (paste, run, remove) deleted the action and failed the deployment contract - taking Search, the
  // Execution Plan hydrate and every save with it. The handler, its configuration and its resolver moved into
  // the permanent Send owner; the TEMP file keeps only its editor-run wrappers.
  '66_api_v1_request_order_send.gs': 'FB-4G-A2-R4 permanent owner of system.requestOrderSendDiagnosticStatus + its configuration',
  'TEMP_request_order_send_diagnostics.gs': 'FB-4G-A2-R4 reduced to editor-run wrappers; owns no required action'
};
// F1-7N-FC-1A — the four owners of the Shipment Draft recovery + factory stock reservation. Each is an
// OWNERSHIP RECORD, which is what this map is for; an unexpected file still fails.
GS_OWNED_SINCE_R1['11_shipping_plan_handlers.gs'] = 'FC-1A the typed approval-recovery answer (the round licensed to change the Submit owner)';
GS_OWNED_SINCE_R1['12_shipment_handlers.gs'] = 'FC-1A Shipment Draft creation acquires the factory stock reservation, all-or-nothing, under one lock';
GS_OWNED_SINCE_R1['21_factory_inventory_handlers.gs'] = 'FC-1A THE single stock authority gains reservation acquire/release on the existing schema';
GS_OWNED_SINCE_R1['22_shipment_dispatch_handlers.gs'] = 'FC-1A dispatch DELEGATES to that authority and releases the reservation in the same movement row';
// F1-7N-FC-1A-R1 — the PO receipt owner. R1 replaces the silent over-receipt CLAMP with a typed
// PO_RECEIPT_EXCEEDS_REMAINING_QTY refusal, which is a behavioural change to this file and therefore an
// ownership record here. An unexpected file still fails.
GS_OWNED_SINCE_R1['13_procurement_handlers.gs'] = 'FC-1A-R1 typed PO over-receipt refusal (no silent clamp)';
// F1-7N-FC-1B-E3 — the CONFIG owner. E3 releases the Inventory AI Plan DB generation by setting
// INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ to true (the flag's whole purpose) and gives the file a build stamp
// so a half-synced config is a named mixed_deployment fault rather than a mystery. 63_ registers it in the
// module manifest. An unexpected file still fails.
GS_OWNED_SINCE_R1['00_config.gs'] = 'FC-1B-E3 the feature flags of record: Inventory AI Plan DB generation activated + CONFIG_BUILD_VERSION_ added';
var gsUnexpected = gsList.filter(function (f) { return !GS_OWNED_SINCE_R1[f]; });
// The 11_ half of the replacement pair (see the note above the unchanged-since-R1 list).
var _r2g11 = read('assets/specs/active/apps-script/11_shipping_plan_handlers.gs');
var _r2Expected = ((G63.match(/\{ file: '11_shipping_plan_handlers\.gs',[^}]*expected: '([^']+)'/) || [])[1]) || '(no manifest entry)';
eq((_r2g11.match(/var SP_BUILD_VERSION_ = '([^']+)'/) || [])[1], _r2Expected,
  '8. 11_ declares exactly the build its deployment manifest expects (' + _r2Expected + ')');
ok(_r2g11.indexOf('allocation_draft_id') === -1 ||
   (_r2g11.slice(_r2g11.indexOf('function shippingPlanRouteGroupKey_')).slice(0, 900).indexOf('allocation_draft_id') === -1),
  '8. and shippingPlanRouteGroupKey_ still carries no allocation_draft_id (frozen Option A grouping)');
eq(gsUnexpected.join(','), '', '8. no Apps Script file outside this line\'s owned set changed since the R1 commit');

// (a) A CHANGE TO THE ALLOCATION WRITER IS ALWAYS DECLARED. Read both halves from the files themselves, so the
// expectation and the declaration can only ever be edited together.
(function () {
  var sad = fs.readFileSync(path.join(ROOT, 'assets/specs/active/apps-script/16_shipping_allocation_handlers.gs'), 'utf8');
  var health = fs.readFileSync(path.join(ROOT, 'assets/specs/active/apps-script/63_api_v1_system_health.gs'), 'utf8');
  var declared = (sad.match(/var SAD_BUILD_VERSION_ = '([^']+)';/) || [])[1] || '';
  var expected = (health.match(/\{ file: '16_shipping_allocation_handlers\.gs',[^}]*expected: '([^']+)'/) || [])[1] || '';
  ok(!!declared, '8. the allocation writer declares a build stamp');
  eq(declared, expected, '8. and the deployment manifest expects exactly what it declares (no silent writer change)');

  // (b) THE K2 GROUP KEY IS BYTE-IDENTICAL. Appending a dimension would change the joined string for EVERY row,
  // including the ones whose new field is blank, so every SADH-K2- id would regenerate and every existing
  // header would be re-keyed - a silent bulk migration wearing the clothes of a refactor.
  var dims = (sad.match(/var SAD_K2_GROUP_DIMENSIONS_ = \[([\s\S]*?)\];/) || [])[1] || '';
  var names = (dims.match(/'[^']+'/g) || []).map(function (x) { return x.slice(1, -1); });
  // This suite's eq() is a strict === , so two equal arrays are still two objects. Compare the joined order.
  eq(names.join('|'), ['planning_cycle', 'company', 'country', 'marketplace', 'source_page',
    'recommended_source_warehouse_id', 'recommended_destination_warehouse_id',
    'recommended_shipping_method', 'recommended_last_mile_delivery', 'recommendation_group_no'].join('|'),
    '8. the K2 group dimensions are the frozen ten, in the frozen order');
  ok(sad.indexOf('destination_marketplace') !== -1, '8. 16_ knows the new column (B3 taught it)');
  var k2fn = sad.slice(sad.indexOf('function sadK2GroupKey_('), sad.indexOf('function sadK2DeterministicHeaderId_('));
  ok(k2fn.indexOf('destination_marketplace') === -1,
    '8. but sadK2GroupKey_ does NOT read it — K2 is frozen and no existing id regenerates');
})();
ok(gsList.indexOf('01_router.gs') !== -1 && gsList.indexOf('63_api_v1_system_health.gs') !== -1,
  '8. and the two files R2 itself had to change are still among them');
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
