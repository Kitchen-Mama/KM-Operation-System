// F1-7N-FB-4E-R1 — THE DEPLOYMENT-CONTRACT PROBE, TRACED AND EXECUTED END TO END.
//
// THE LIVE REPORT. The production frontend identified itself correctly — transport_build F1-7N-FB-4E,
// transport_contract_version 1, endpointClass STABLE_EXEC, endpoint.ok true — and yet
//
//     await window.KM.DB.checkDeploymentContract()
//
// answered DEPLOYMENT_CONTRACT_MISMATCH with build_id, contract_version, deployed_action_contract_version,
// transport_contract_version, router_build, router_response_identity, required_action_list_version and
// answered_by_handler ALL NULL, missing_actions [], and the message "The deployed Apps Script does not report an
// action-contract version, so it is older than this frontend build." The user had already verified the FB-4E
// constants in the editor and published a new version, against the same Deployment ID.
//
// THE ROOT CAUSE IS IN THE CLIENT, AND THE DEPLOYMENT WAS NEVER AT FAULT. handleSystemHealth_ answers through
// jsonResponse_(payload), which serializes the payload VERBATIM: the identity block is a set of TOP-LEVEL keys
// and the answer carries NO `data` key. checkDeploymentContract read it through _kmGapRead_, the GAP-ROW runner,
// which on success returned only `json.data || { rows: [] }` — so the entire identity was discarded before the
// caller ever saw it, `res.data` was `{ rows: [] }`, and every field normalized to null.
//
// The verdict was therefore UNFALSIFIABLE: no published deployment, however current, could ever have satisfied
// it, and the message told the operator to publish again — which could not change the answer.
//
// WHY THIS SUITE EXECUTES BOTH HALVES INSTEAD OF READING THEM. The defect survived because each half was
// verified in isolation: an existing suite asserts that 63_ EXPOSES build_id, and another asserts that the
// client HAS the fields. Both were true. The JOIN between them was never exercised, and the join was the bug.
// So this suite runs the REAL Apps Script source in one shared global scope (the way Apps Script runs it), sends
// the EXACT request the shipped client emits, and feeds the real answer back through the REAL shipped client:
//
//     window.KM.DB.checkDeploymentContract()   the shipped module, executed
//       -> _kmGapRead_('system.health', ...)   the shipped runner, executed
//         -> fetch spy                          no network
//           -> doPost(e) / doGet(e)             01_router.gs, executed
//             -> handleSystemHealth_(body)      63_api_v1_system_health.gs, executed
//               -> jsonResponse_(payload)       02_core_sheet_db.gs, executed
//
// Run: node assets/tests/deployment-contract-probe-routing-f1-7n-fb-4e-r1.test.js

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var ROOT = path.join(__dirname, '..', '..');
var GS_DIR = path.join(ROOT, 'assets', 'specs', 'active', 'apps-script');

// F1-7N-FB-4E-R2 — EXPECTATIONS ARE DERIVED FROM THE DECLARING SOURCE, PLUS A MONOTONIC FLOOR.
//
// R1 pinned 'F1-7N-FB-4E', 7 and 7 as literals, and R2 legitimately moved all three. A literal makes a correct
// bump look like a regression, which is the trap the FB-4E suite already documents for release tokens. So each
// expectation is read from the file that DECLARES it — the answer must equal what its own source says — and
// floored at the R2 values so a future round can raise them but nothing can quietly lower them. That is
// strictly what §8 requires ("do not lower expected versions") expressed as an assertion rather than a
// promise.
var DECL = (function () {
  function pick(file, re) { var m = re.exec(read('assets/specs/active/apps-script/' + file)); return m ? m[1] : null; }
  return {
    sysBuild: pick('63_api_v1_system_health.gs', /var SYS_BUILD_VERSION_ = '([^']+)'/),
    rtrBuild: pick('01_router.gs', /var RTR_BUILD_VERSION_ = '([^']+)'/),
    actionContract: Number(pick('63_api_v1_system_health.gs', /var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+)/)),
    listVersion: Number(pick('63_api_v1_system_health.gs', /var SYS_REQUIRED_ACTION_LIST_VERSION_ = (\d+)/)),
    transportContract: Number(pick('63_api_v1_system_health.gs', /var SYS_TRANSPORT_CONTRACT_VERSION_ = (\d+)/))
  };
})();
var FLOOR_ACTION_CONTRACT = 8;   // F1-7N-FB-4E-R2 added a router action; nothing may go below this
var FLOOR_LIST_VERSION = 8;      // F1-7N-FB-4E-R2 added four registry entries

var passed = 0, failed = 0, checks = [];
function ok(c, m) { if (c) { passed++; } else { failed++; console.log('  FAIL ' + m); } }
function eq(a, b, m) { ok(a === b, m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n' + t); }
function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }

// =============================================================================================================
// THE DEPLOYMENT, EXECUTED. Every .gs file in the mirror, loaded into ONE shared global scope, because that is
// exactly how Apps Script runs them ("All .gs files in this folder share ONE global scope" — 01_router.gs).
// Only the Google platform services are stubbed; none of the repository's own code is.
// =============================================================================================================
function makeDeployment() {
  var sb = {
    console: console, JSON: JSON, Math: Math, Date: Date, Array: Array, Object: Object, String: String,
    Number: Number, Boolean: Boolean, RegExp: RegExp, Error: Error, isFinite: isFinite, isNaN: isNaN,
    parseInt: parseInt, parseFloat: parseFloat, encodeURIComponent: encodeURIComponent,
    decodeURIComponent: decodeURIComponent,
    ContentService: {
      MimeType: { JSON: 'application/json', TEXT: 'text/plain' },
      createTextOutput: function (t) {
        return { _t: t, setMimeType: function () { return this; }, getContent: function () { return this._t; } };
      }
    },
    Utilities: {
      getUuid: function () { return 'FB4ER1-TEST-0000-0000'; },
      formatDate: function () { return '2026-08-27'; },
      sleep: function () {}, base64Encode: function (s) { return String(s); }
    },
    Logger: { log: function () {} },
    // The probe is READ-ONLY and never opens the database; system.health catches this and reports
    // DB_NOT_REACHABLE, which is the correct behaviour for a test with no spreadsheet.
    SpreadsheetApp: { openById: function () { throw new Error('no spreadsheet in test'); } },
    PropertiesService: { getScriptProperties: function () { return { getProperty: function () { return null; }, setProperty: function () {} }; } },
    Session: { getActiveUser: function () { return { getEmail: function () { return ''; } }; }, getScriptTimeZone: function () { return 'Asia/Taipei'; } },
    LockService: { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } },
    CacheService: { getScriptCache: function () { return { get: function () { return null; }, put: function () {} }; } },
    DriveApp: {}, UrlFetchApp: {}, MailApp: {}, GmailApp: {}, HtmlService: {}, ScriptApp: {}
  };
  sb.globalThis = sb;
  var ctx = vm.createContext(sb);
  var files = fs.readdirSync(GS_DIR).filter(function (f) { return /\.gs$/.test(f); }).sort();
  files.forEach(function (f) { vm.runInContext(fs.readFileSync(path.join(GS_DIR, f), 'utf8'), ctx, { filename: f }); });
  sb.__fileCount = files.length;
  return sb;
}

// =============================================================================================================
// THE CLIENT, EXECUTED. The shipped module, whole — not extracted fragments — with one injected fetch.
// =============================================================================================================
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
  var ctx = vm.createContext(sb);
  vm.runInContext(DBAPI_SRC, ctx, { filename: 'operation-system-db-api.js' });
  return { sb: sb, win: win, DB: win.KM.DB };
}

// A Response-like object carrying a JSON body from the executed router.
function jsonResponse(text, url) {
  return {
    ok: true, status: 200, statusText: 'OK', redirected: false, type: 'basic',
    url: url || 'https://script.google.com/macros/s/AKfyc-test/exec',
    headers: { get: function (h) { return String(h).toLowerCase() === 'content-type' ? 'application/json' : null; } },
    text: function () { return Promise.resolve(text); },
    json: function () { return Promise.resolve(JSON.parse(text)); }
  };
}

// The fetch spy that routes the client's real request into the executed router.
function routerFetch(dep, capture) {
  return function (url, init) {
    var body = (init && init.body) ? String(init.body) : '';
    capture.url = String(url);
    capture.method = (init && init.method) || 'GET';
    capture.body = body;
    var out = dep.doPost({ postData: { contents: body, type: 'text/plain' }, parameter: {} });
    capture.answer = out.getContent();
    return Promise.resolve(jsonResponse(capture.answer, String(url)));
  };
}

var DEP = makeDeployment();

// =============================================================================================================
section('§A — THE PROBE, TRACED END TO END: the exact action, the exact request, the executed router');
// =============================================================================================================
eq(DEP.__fileCount, fs.readdirSync(GS_DIR).filter(function (f) { return /\.gs$/.test(f); }).length,
  'A1 every .gs file in the deployment mirror loaded into ONE shared global scope, as Apps Script runs them');
eq(typeof DEP.doGet, 'function', 'A1 doGet is defined');
eq(typeof DEP.doPost, 'function', 'A1 doPost is defined');
eq(typeof DEP.handleSystemHealth_, 'function', 'A1 handleSystemHealth_ is defined');
eq(typeof DEP.jsonResponse_, 'function', 'A1 jsonResponse_ is defined');

// The request shape is taken FROM the shipped client, never retyped here: if the probe changes, this changes.
var probeClient = makeClient(function () { return Promise.reject(new Error('unused')); });
var PROBE_ACTIONS = probeClient.sb.KM_REQUIRED_DEPLOYED_ACTIONS_;
var PROBE_SYMBOLS = probeClient.sb.KM_REQUIRED_DEPLOYED_SYMBOLS_;
ok(Array.isArray(PROBE_ACTIONS) && PROBE_ACTIONS.length > 0, 'A2 the client publishes its caller-driven action probe list');
ok(Array.isArray(PROBE_SYMBOLS) && PROBE_SYMBOLS.length > 0, 'A2 and its owner-symbol probe list');
ok(probeClient.sb.KM_EXPECTED_ACTION_CONTRACT_VERSION_ >= FLOOR_ACTION_CONTRACT,
  'A2 the client pins action contract at or above v' + FLOOR_ACTION_CONTRACT +
  ' (got v' + probeClient.sb.KM_EXPECTED_ACTION_CONTRACT_VERSION_ + ')');
eq(probeClient.sb.KM_EXPECTED_ACTION_CONTRACT_VERSION_, DECL.actionContract,
  'A2 and it AGREES with the contract the deployment declares — neither side may drift alone');
eq(probeClient.sb.KM_EXPECTED_TRANSPORT_CONTRACT_VERSION_, DECL.transportContract,
  'A2 the transport axis likewise agrees with the deployment');

var EXACT_BODY = { action: 'system.health', probe_actions: PROBE_ACTIONS, probe_symbols: PROBE_SYMBOLS };
var postOut = DEP.doPost({ postData: { contents: JSON.stringify(EXACT_BODY), type: 'text/plain' }, parameter: {} });
var H = JSON.parse(postOut.getContent());

ok(H.success === true, 'A3 the executed router answers the probe successfully');
eq(H.build_id, DECL.sysBuild, 'A3 build_id equals what 63_ declares');
eq(H.router_build, DECL.rtrBuild, 'A3 router_build equals what 01_router.gs declares');
eq(H.transport_contract_version, DECL.transportContract, 'A3 transport_contract_version');
eq(H.deployed_action_contract_version, DECL.actionContract, 'A3 deployed_action_contract_version');
ok(H.deployed_action_contract_version >= FLOOR_ACTION_CONTRACT, 'A3 and it is at or above the R2 floor of ' + FLOOR_ACTION_CONTRACT);
eq(H.required_action_list_version, DECL.listVersion, 'A3 required_action_list_version');
ok(H.required_action_list_version >= FLOOR_LIST_VERSION, 'A3 and it is at or above the R2 floor of ' + FLOOR_LIST_VERSION);
eq(H.contract_version, '1', 'A3 contract_version');
eq(H.handler, 'doPost', 'A3 answered_by_handler names the entry point that served it');
eq(H.received_method, 'POST', 'A3 and the method it arrived on');
ok(H.router_response_identity && H.router_response_identity.emits_handler === true,
  'A3 the router declares the identity fields it can emit');

// The REQUIRED ACTION INVENTORY — the list, per action, with availability probed by symbol.
ok(Array.isArray(H.required_actions) && H.required_actions.length >= 30,
  'A4 the answer carries the required action inventory (' + (H.required_actions || []).length + ' actions)');
eq(H.required_action_count, H.required_actions.length, 'A4 required_action_count agrees with the inventory it counts');
ok(H.required_actions.every(function (a) { return typeof a.action === 'string' && typeof a.available === 'boolean'; }),
  'A4 every inventory row names an action and states its availability');
eq(H.missing_actions.length, 0, 'A4 no action in the deployment’s own list is unavailable');
ok(H.missing_actions_is_self_referential === true,
  'A4 and the answer states that its own missing_actions list proves nothing on its own');

// system.health is routed on BOTH verbs, so a caller can probe with either.
var getOut = DEP.doGet({ parameter: { action: 'system.health', probe_actions: PROBE_ACTIONS, probe_symbols: PROBE_SYMBOLS } });
var HG = JSON.parse(getOut.getContent());
eq(HG.build_id, H.build_id, 'A5 doGet answers the SAME identity as doPost');
eq(HG.handler, 'doGet', 'A5 and names itself as the handler, so a downgrade can never be mistaken for a POST answer');
eq(HG.received_method, 'GET', 'A5 with the method it arrived on');

// =============================================================================================================
section('§B — THE DEFECT, REPRODUCED FROM THE REAL ANSWER (this is what the live report saw)');
// =============================================================================================================
ok(!Object.prototype.hasOwnProperty.call(H, 'data'),
  'B1 the system.health envelope is FLAT: the identity is top-level and there is NO `data` key');
['build_id', 'contract_version', 'transport_contract_version', 'router_build',
 'deployed_action_contract_version', 'required_action_list_version', 'handler', 'caller_probe'].forEach(function (k) {
  ok(Object.prototype.hasOwnProperty.call(H, k), 'B1 `' + k + '` is a TOP-LEVEL key of the answer');
});

// The old client read, restated exactly: the gap-row runner's success return, then the identity lookup.
var OLD_res = { success: true, data: H.data || { rows: [] } };
var OLD_h = OLD_res.data || {};
['build_id', 'contract_version', 'deployed_action_contract_version', 'transport_contract_version',
 'router_build', 'router_response_identity', 'required_action_list_version'].forEach(function (k) {
  eq(OLD_h[k], undefined, 'B2 the OLD read lost `' + k + '` — it read `res.data`, which was { rows: [] }');
});
eq((OLD_h.missing_actions || []).length, 0, 'B3 and missing_actions came back [] — exactly as the live report showed');
ok(OLD_h.caller_probe === undefined, 'B3 and caller_probe was absent, which the old code reported as "predates this frontend"');

// The decisive property: the old verdict did not depend on the deployment at all.
var OTHER = JSON.parse(DEP.doPost({ postData: { contents: JSON.stringify({ action: 'system.health' }), type: 'text/plain' }, parameter: {} }).getContent());
eq(({ success: true, data: OTHER.data || { rows: [] } }).data.build_id, undefined,
  'B4 the same all-null verdict resulted from a DIFFERENT answer too — the old gate was unfalsifiable');

// =============================================================================================================
section('§C — THE REPAIR, DRIVEN THROUGH THE REAL SHIPPED CLIENT AGAINST THE REAL EXECUTED ROUTER');
// =============================================================================================================
var cap = {};
var client = makeClient(routerFetch(DEP, cap));

checks.push(client.DB.checkDeploymentContract().then(function (v) {
  // The request the client actually put on the wire, proven from the spy rather than assumed.
  var sent = JSON.parse(cap.body || '{}');
  eq(cap.method, 'POST', 'C1 the probe is dispatched as a POST');
  eq(sent.action, 'system.health', 'C1 with action system.health');
  ok(Array.isArray(sent.probe_actions) && sent.probe_actions.length === PROBE_ACTIONS.length,
    'C1 carrying the caller-driven action probe list');
  ok(Array.isArray(sent.probe_symbols) && sent.probe_symbols.length === PROBE_SYMBOLS.length,
    'C1 and the owner-symbol probe list');
  ok(/\/exec$/.test(cap.url), 'C1 to the stable /exec endpoint');

  var id = v.identity || {};
  ok(id.build_id !== null && id.build_id !== undefined, 'C2 the identity is NO LONGER NULL');
  eq(id.build_id, DECL.sysBuild, 'C2 build_id reaches the caller');
  eq(id.router_build, DECL.rtrBuild, 'C2 router_build reaches the caller');
  eq(id.transport_contract_version, DECL.transportContract, 'C2 transport_contract_version reaches the caller');
  eq(id.deployed_action_contract_version, DECL.actionContract, 'C2 deployed_action_contract_version reaches the caller');
  eq(id.required_action_list_version, DECL.listVersion, 'C2 required_action_list_version reaches the caller');
  eq(id.contract_version, '1', 'C2 contract_version reaches the caller');
  eq(id.answered_by_handler, 'doPost', 'C2 answered_by_handler reaches the caller');
  ok(id.router_response_identity && id.router_response_identity.emits_handler === true,
    'C2 router_response_identity reaches the caller');
  ok(id.caller_probe && id.caller_probe.requested_by_caller === true,
    'C2 and the non-self-referential caller probe reaches the caller');

  // NOTHING IS MANUFACTURED. Every value above must equal what the router actually emitted for THIS request.
  var wire = JSON.parse(cap.answer);
  eq(id.build_id, wire.build_id, 'C3 build_id equals the value the router emitted, not a client literal');
  eq(id.router_build, wire.router_build, 'C3 router_build equals the emitted value');
  eq(id.deployed_action_contract_version, wire.deployed_action_contract_version, 'C3 the action contract equals the emitted value');
  eq(id.transport_contract_version, wire.transport_contract_version, 'C3 the transport contract equals the emitted value');
  eq(id.required_action_list_version, wire.required_action_list_version, 'C3 the list version equals the emitted value');
  eq(id.answered_by_handler, wire.handler, 'C3 the handler equals the emitted value');

  // The endpoint axis is answered separately and was never the fault.
  eq(v.endpoint && v.endpoint.endpointClass, 'STABLE_EXEC', 'C4 the endpoint classifies as STABLE_EXEC');
  eq(v.endpoint && v.endpoint.ok, true, 'C4 and the endpoint gate passes, as the live report showed');

  // §D — WHAT R1 LEFT OPEN, AND WHAT R2 CLOSED.
  //
  // R1 repaired the lost envelope, and the verdict then became a mismatch decided on REAL evidence: four probed
  // actions unresolved. R1 deliberately did not fix them, because both corrections moved Apps Script contract
  // stamps the published deployment carried. R2 made those corrections, so this section now asserts the CLOSED
  // state — and keeps R1's structural findings, inverted: what R1 proved absent, R2 proves present.
  section('§D — R1 FOUND FOUR UNRESOLVED ACTIONS; R2 CLOSED ALL FOUR AND THE GATE NOW PASSES');
  var probe = id.caller_probe || {};
  eq((probe.missing_symbols || []).length, 0, 'D1 every owner SYMBOL the frontend requires is present');
  eq((probe.missing_actions || []).length, 0,
    'D1 and every probed ACTION now resolves — R1 reported four: ' + (probe.missing_actions || []).join(', '));
  eq(probe.all_present, true, 'D1 so the non-self-referential caller probe is satisfied');
  eq(v.ok, true, 'D2 the verdict is DEPLOYMENT_CONTRACT_OK');
  eq(v.code, 'DEPLOYMENT_CONTRACT_OK', 'D2 reached against the real executed router, not a synthetic answer');
  eq(v.message, '', 'D2 with no remaining complaint to make');
  return probe;
}).then(function () {
  // The four, each proven on BOTH axes now: a real router branch AND a registry entry. R1 proved three had the
  // branch but no entry, and one had neither.
  var RTR = read('assets/specs/active/apps-script/01_router.gs');
  var G63 = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
  var GS_ALL = fs.readdirSync(GS_DIR).filter(function (f) { return /\.gs$/.test(f); })
    .map(function (f) { return fs.readFileSync(path.join(GS_DIR, f), 'utf8'); }).join('\n');
  function routed(a) { return new RegExp("action === '" + a.replace(/\./g, '\\.') + "'").test(RTR); }
  function registered(a) { return new RegExp("action: '" + a.replace(/\./g, '\\.') + "'").test(G63); }

  [['shipment.eta.update', 'handleUpdateShipmentEta_'],
   ['shipment.route.advance', 'handleAdvanceShipmentRoutePoint_'],
   ['skuDetails.workspace.get', 'handleSkuDetailsWorkspaceGet_']].forEach(function (p) {
    ok(routed(p[0]), 'D3 ' + p[0] + ' is routed (it always was — R1 proved this)');
    ok(registered(p[0]), 'D3 ...and R2 added the SYS_REQUIRED_ACTIONS_ entry that was missing, so the probe can '
      + 'now resolve a deployment that was serving it all along');
    ok(new RegExp('function\\s+' + p[1] + '\\s*\\(').test(GS_ALL), 'D3 ...against a handler that is defined');
  });

  var WAS_UNROUTED = 'system.executionPlanDuplicateLineDiagnostic';
  ok(routed(WAS_UNROUTED), 'D4 ' + WAS_UNROUTED + ' now HAS a router dispatch branch — R1 proved it had none in '
    + 'any commit ever, while its handler sat defined and unreachable');
  ok(registered(WAS_UNROUTED), 'D4 ...and a registry entry');
  ok(/function handleExecutionPlanDuplicateLineDiagnostic_/.test(GS_ALL), 'D4 ...bound to the handler 68_ already had');
  ok(/body\.__km_handler = 'doPost';\s*\n\s*return jsonResponse_\(handleExecutionPlanDuplicateLineDiagnostic_\(body\)\)/.test(RTR),
    'D4 ...and the branch sets the canonical __km_handler marker before delegating');
}));

// =============================================================================================================
section('§E — THE GATE IS NOT WEAKENED: every refusal it could make before, it still makes');
// =============================================================================================================
// Each case drives the REAL checkDeploymentContract against a synthetic answer, so the refusals are the
// shipped function's own, not restatements of them.
function withAnswer(mutate) {
  var base = JSON.parse(JSON.stringify(H));
  mutate(base);
  var c = makeClient(function (url) {
    return Promise.resolve(jsonResponse(JSON.stringify(base), String(url)));
  });
  return c.DB.checkDeploymentContract();
}

checks.push(withAnswer(function (b) { delete b.deployed_action_contract_version; }).then(function (v) {
  eq(v.ok, false, 'E1 an answer with NO action-contract version is still refused');
  eq(v.code, 'DEPLOYMENT_CONTRACT_MISMATCH', 'E1 as a contract mismatch');
  ok(/does not report an action-contract version/.test(v.message),
    'E1 with the message that is now reachable ONLY when the deployment genuinely omits the field');
  eq(v.identity.build_id, DECL.sysBuild, 'E1 and the identity it DID report is still carried, not blanked');
}));

checks.push(withAnswer(function (b) { b.deployed_action_contract_version = 6; }).then(function (v) {
  eq(v.ok, false, 'E2 a LOWER action contract is still refused');
  ok(new RegExp('action contract is v6 but this frontend needs v' + DECL.actionContract).test(v.message),
    'E2 naming both versions: the deployed v6 and the pin this build actually carries');
}));

checks.push(withAnswer(function (b) { b.transport_contract_version = null; }).then(function (v) {
  eq(v.ok, false, 'E3 a missing TRANSPORT contract is still refused');
  eq(v.code, 'TRANSPORT_CONTRACT_MISMATCH', 'E3 on its own separate axis, not folded into the action axis');
}));

checks.push(withAnswer(function (b) { delete b.caller_probe; }).then(function (v) {
  eq(v.ok, false, 'E4 an answer that does not respond to the explicit probe is still refused');
  ok(/did not answer the explicit action\/symbol probe/.test(v.message), 'E4 and says so');
}));

checks.push(withAnswer(function (b) {
  b.caller_probe = { requested_by_caller: true, all_present: true, missing_actions: [], missing_symbols: [] };
  b.mixed_deployment = true; b.module_build_stamps = { modules: [], stale_modules: ['16_x.gs'], absent_modules: [] };
}).then(function (v) {
  eq(v.ok, false, 'E5 a PARTIAL sync is still refused');
  eq(v.code, 'DEPLOYMENT_PARTIAL_SYNC', 'E5 as its own named fault');
}));

// And the healthy path is genuinely reachable — a gate that can never pass is what this round is fixing.
checks.push(withAnswer(function (b) {
  b.caller_probe = { requested_by_caller: true, all_present: true, missing_actions: [], missing_symbols: [] };
}).then(function (v) {
  eq(v.ok, true, 'E6 with every probed item present the gate PASSES — it is falsifiable in both directions now');
  eq(v.code, 'DEPLOYMENT_CONTRACT_OK', 'E6 and reports the contract as OK');
  eq(v.identity.build_id, DECL.sysBuild, 'E6 carrying the real identity');
}));

// The client pins are not lowered, and no identity value is defaulted to a literal.
ok(probeClient.sb.KM_EXPECTED_ACTION_CONTRACT_VERSION_ >= FLOOR_ACTION_CONTRACT,
  'E7 the pinned action-contract minimum is never LOWERED below v' + FLOOR_ACTION_CONTRACT);
eq(probeClient.sb.KM_EXPECTED_TRANSPORT_CONTRACT_VERSION_, DECL.transportContract,
  'E7 and the transport-contract pin still agrees with the deployment');
var cdcSrc = DBAPI_SRC.slice(DBAPI_SRC.indexOf('window.KM.DB.checkDeploymentContract'),
  DBAPI_SRC.indexOf('window.KM.DB.getRequestOrderSendDiagnosticStatus'));
ok(!/build_id\s*[:=]\s*['"]F1-/.test(cdcSrc), 'E8 the client never defaults build_id to a literal build id');
ok(!/router_build\s*[:=]\s*['"]F1-/.test(cdcSrc), 'E8 nor router_build');
ok(!/deployed_action_contract_version\s*[:=]\s*[0-9]/.test(cdcSrc.replace(/KM_EXPECTED[^\n]*/g, '')),
  'E8 nor the deployed action contract version — every identity value comes off the wire');

// =============================================================================================================
Promise.all(checks).then(function () {
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
}, function (e) {
  console.log('\nSUITE ERROR: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
