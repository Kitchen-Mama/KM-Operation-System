// F1-7N-FB-2 — Production API transport + Submit-to-Map persistence closure.
// Run: node assets/tests/api-transport-and-submit-persistence-f1-7n-fb-2.test.js
//
// The transport tests EXERCISE THE REAL SHIPPED api-foundation module (required directly, with an injected
// fetcher), and the eligibility/failure-message tests EXECUTE THE REAL SHIPPED frontend functions extracted
// from operation-system-db-api.js. No network call, no Apps Script execution, no DB or Drive write, no email.

var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); }
var API = read('js/api/operation-system-db-api.js');
var FOUND = read('js/api/km-api-foundation.js');
var INV = read('js/pages/inventory-replenishment.js');
var SP = read('js/pages/shipping-plan.js');
var POJS = read('js/pages/purchase-order-overview.js');
var SHJS = read('js/pages/shipping-history.js');
var RTR = read('specs/active/apps-script/01_router.gs');
var G63 = read('specs/active/apps-script/63_api_v1_system_health.gs');
var G50 = read('specs/active/apps-script/50_api_v1_purchase_order_workspace.gs');
var G57 = read('specs/active/apps-script/57_api_v1_shipment_workspace.gs');
var G39 = read('specs/active/apps-script/39_document_runtime_service.gs');
var G13 = read('specs/active/apps-script/13_procurement_handlers.gs');
var G16 = read('specs/active/apps-script/16_shipping_allocation_handlers.gs');
var apiFoundation = require(path.join(ROOT, 'js/api/km-api-foundation.js'));

var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }
var RE_PRECEDERS_ = '(,=:[!&|?{};+-*%<>~^';
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) start = src.indexOf(name + ' = function');
  if (start < 0) throw new Error('missing fn ' + name);
  var i = src.indexOf('{', start), depth = 0, prev = '';
  for (; i < src.length; i++) {
    var c = src[i], n2 = src.substr(i, 2);
    if (n2 === '//') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (n2 === '/*') { i = src.indexOf('*/', i) + 1; continue; }
    if (c === '"' || c === "'" || c === '`') { var q = c; i++; for (; i < src.length; i++) { if (src[i] === '\\') { i++; continue; } if (src[i] === q) break; } prev = q; continue; }
    if (c === '/' && RE_PRECEDERS_.indexOf(prev) !== -1) { i++; for (; i < src.length; i++) { if (src[i] === '\\') { i++; continue; } if (src[i] === '[') { for (i++; i < src.length && src[i] !== ']'; i++) { if (src[i] === '\\') i++; } continue; } if (src[i] === '/') break; } prev = '/'; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (!depth) return src.slice(start, i + 1); }
    if (!/\s/.test(c)) prev = c;
  }
  throw new Error('unbalanced ' + name);
}
function code(src) { return src.split('\n').filter(function (l) { return !/^\s*(\/\/|\*|\/\*)/.test(l); }).join('\n'); }

// ---- load the REAL shipped eligibility + message functions ---------------------------------------------
// They are assigned onto window.KM.DB, so provide the minimal globals they close over.
var _mode = 'not-loaded', _configured = true;
global.window = { location: { hostname: 'shopkitchenmama.github.io' }, KM: { DB: {} } };
function isOperationDbApiConfigured() { return _configured; }
function getOperationDbDataSourceMode() { return _mode; }
var OP_DB_API_BASE_URL = 'https://script.google.com/macros/s/TESTID/exec';
var KM = { DB: {} };
eval(API.match(/window\.KM\.DB\.isProductionWriteEligible = function\(\) \{[\s\S]*?\n\};/)[0]);
eval(API.match(/window\.KM\.DB\.isDevLocalModeAllowed = function\(\) \{[\s\S]*?\n\};/)[0]);
eval(API.match(/window\.KM\.DB\.describeWriteFailure = function\(action, res\) \{[\s\S]*?\n\};/)[0]);
var DB = global.window.KM.DB;

// =======================================================================================================
section('FB2-1. the Demo/local Submit root cause is closed — production writes FAIL CLOSED');

// The defect: isCloudWriteEnabled() demands a PRIMED broad cache, which an F1-7L zero-prime session never has.
ok(/isCloudWriteEnabled = function\(\) \{\s*\n\s*return isOperationDbApiConfigured\(\) && getOperationDbDataSourceMode\(\) === 'google-sheet';/.test(API),
  '1. the OLD write gate required a primed broad cache (getDataSourceMode() === google-sheet)');
ok(/isProductionWriteEligible = function\(\)/.test(API), '1. a configuration-based write predicate now exists');
_mode = 'not-loaded';
eq(DB.isProductionWriteEligible(), true, '1. a COLD session (not-loaded) is write-eligible — the cold-start defect is gone');
_mode = 'google-sheet';
eq(DB.isProductionWriteEligible(), true, '1. a primed session is eligible');
_mode = 'mock';
eq(DB.isProductionWriteEligible(), false, '1. an explicit mock posture is NOT eligible');
_mode = 'not-loaded'; _configured = false;
eq(DB.isProductionWriteEligible(), false, '1. an unconfigured API is NOT eligible');
_configured = true;

// Submit must gate on the new predicate and never on the cache-dependent one
ok(/_writeEligible = !!\(_db && _db\.isProductionWriteEligible && _db\.isProductionWriteEligible\(\)\)/.test(INV),
  '1. Submit Plan gates on isProductionWriteEligible');
ok(!/isCloudWriteEnabled/.test(code(INV)), '1. and no longer on isCloudWriteEnabled anywhere in the page');
var submitFn = extractFn(INV, 'submitReplenishmentPlans');
ok(/return;\s*\/\/ fail CLOSED/.test(submitFn) || /fail CLOSED/.test(submitFn), '1. an ineligible production write returns early — fail closed');
var localIdx = submitFn.indexOf("sessionStorage.setItem('allShippingPlans'");
var guardIdx = submitFn.indexOf('isDevLocalModeAllowed');
ok(guardIdx > 0 && guardIdx < localIdx, '1. the dev-only guard is evaluated BEFORE any local write can happen');
ok(!/Weekly Shipping Plan created \(Demo \/ local mode\)/.test(code(INV)),
  '1. the fabricated "created (Demo / local mode)" SUCCESS message is gone');
ok(/\[DEV LOCAL MODE\] Nothing was saved to the database\./.test(INV),
  '1. the dev-only branch now says plainly that nothing was saved');

// =======================================================================================================
section('FB2-2. local mode is unreachable from the production build');

global.window.KM_DEV_LOCAL_MODE = true;
global.window.location.hostname = 'shopkitchenmama.github.io';
eq(DB.isDevLocalModeAllowed(), false, '2. GitHub Pages can NEVER enter local mode, even with the flag set');
global.window.location.hostname = 'operations.shopkitchenmama.com';
eq(DB.isDevLocalModeAllowed(), false, '2. nor can a custom production domain');
global.window.location.hostname = 'localhost';
eq(DB.isDevLocalModeAllowed(), true, '2. localhost WITH the explicit opt-in may');
global.window.KM_DEV_LOCAL_MODE = false;
eq(DB.isDevLocalModeAllowed(), false, '2. localhost WITHOUT the opt-in may not — the flag is required');
delete global.window.KM_DEV_LOCAL_MODE;
eq(DB.isDevLocalModeAllowed(), false, '2. an absent flag is not an opt-in');
global.window.KM_DEV_LOCAL_MODE = true;
global.window.location.hostname = '127.0.0.1';
eq(DB.isDevLocalModeAllowed(), true, '2. 127.0.0.1 counts as local');
global.window.location.hostname = 'shopkitchenmama.github.io'; delete global.window.KM_DEV_LOCAL_MODE;
// neither of the production fallback triggers §C forbids may flip the mode
['HTTP error', 'timeout', 'non-JSON', 'missing config', 'auth failure', 'cold start', 'action not found']
  .forEach(function (t) { ok(DB.isDevLocalModeAllowed() === false, '2. no production path enters local mode after: ' + t); });

// =======================================================================================================
section('FB2-3. an API failure can never read as success');

var msg = DB.describeWriteFailure('submitAllocationDraftsToShippingPlans', {
  code: 'TRANSPORT_NON_JSON_RESPONSE', requestId: 'REQ-123',
  details: { httpStatus: 404, contentType: 'text/html; charset=utf-8' }, zero_write: true
});
ok(/Could not save — nothing was written\./.test(msg), '3. the message leads with the truth: nothing was written');
ok(/Action: submitAllocationDraftsToShippingPlans/.test(msg), '3. it names the action');
ok(/Request ID: REQ-123/.test(msg), '3. the request_id');
ok(/HTTP status: 404/.test(msg), '3. the HTTP status');
ok(/Response type: text\/html; charset=utf-8/.test(msg), '3. the response content type');
ok(/Reason: TRANSPORT_NON_JSON_RESPONSE/.test(msg), '3. the typed transport reason');
ok(/Confirmed: 0 database rows were written\./.test(msg), '3. and the proven zero-write confirmation');
ok(/system\.health/.test(msg), '3. with actionable retry guidance');
ok(!/created|success|Success/.test(msg), '3. and nothing in it can be read as a success');
// no secret may leak into a user-facing failure
var secretish = DB.describeWriteFailure('x', { code: 'E', message: 'boom', details: { httpStatus: 500, contentType: 'text/html' } });
ok(!/script\.google\.com|AKfycb|spreadsheet|Bearer|token/i.test(secretish), '3. no endpoint id, token or spreadsheet id is exposed');
ok(!/responsePrefix|<html|<!doctype/i.test(secretish), '3. and no raw HTML body');

// =======================================================================================================
section('FB2-4. ONE authoritative production endpoint, resolved at call time');

// Count real ENDPOINT literals (an /exec deployment URL), not the origin-prefix guard used for validation.
var urlLiterals = (API + FOUND + INV + SP + POJS + SHJS).match(/https:\/\/script\.google\.com\/macros\/s\/[^\s'"]*/g) || [];
eq(urlLiterals.length, 1, '4. exactly ONE Apps Script ENDPOINT literal exists across the client + every affected page');
ok(/\/exec$/.test(urlLiterals[0] || ''), '4. and it is an /exec deployment URL');
var originGuards = (API.match(/startsWith\('https:\/\/script\.google\.com\/'\)/g) || []);
eq(originGuards.length, 1, '4. the only other occurrence is the single origin-prefix validation guard');
ok(/const OP_DB_API_BASE_URL = 'https:\/\/script\.google\.com\/macros\/s\/[^']+\/exec';/.test(API),
  '4. it lives in the single client authority and is an /exec endpoint');
ok(!/\/dev'/.test(API) && !/macros\/s\/[^']*\/dev/.test(API + FOUND), '4. no /dev URL exists in production source');
ok(/function resolveBaseUrl\(\)/.test(FOUND) && /window\.KM\.DB\.getApiBaseUrl/.test(FOUND),
  '4. the workspace transport resolves that ONE authority at call time');
ok(!/https:\/\/script\.google\.com/.test(FOUND), '4. and holds no duplicate literal of its own');
[['inventory-replenishment', INV], ['shipping-plan', SP], ['purchase-order-overview', POJS], ['shipping-history', SHJS]]
  .forEach(function (p) { ok(!/https:\/\/script\.google\.com/.test(p[1]), '4. no page-specific endpoint in ' + p[0]); });
// business APIs must never fall back to a static JSON/GitHub asset
ok(!/fetch\((['"])\.?\/?(data|assets)\/[^)]*\.json/.test(code(API)), '4. no business API falls back to a bundled JSON asset');

// =======================================================================================================
section('FB2-5. non-JSON / 404 HTML is classified, never silently swallowed');

function fakeResp(status, ctype, body) {
  return { status: status, headers: { get: function (k) { return /content-type/i.test(k) ? ctype : null; } },
    text: function () { return Promise.resolve(body); } };
}
var inst = apiFoundation.createApiFoundation ? apiFoundation.createApiFoundation({}) : apiFoundation.createDefault();
var safeRead = inst.transport.safeReadJsonResponse;
var CODES = apiFoundation.API_ERROR_CODES;
eq(CODES.TRANSPORT_NON_JSON_RESPONSE, 'TRANSPORT_NON_JSON_RESPONSE', '5. the taxonomy has a dedicated non-JSON code');
var checks = [];
checks.push(safeRead(fakeResp(404, 'text/html; charset=utf-8', '<!doctype html><html><body>Not Found</body></html>')).then(
  function () { ok(false, '5. a 404 HTML body must NOT parse as success'); },
  function (e) {
    eq(e.apiCode, 'TRANSPORT_NON_JSON_RESPONSE', '5. a 404 text/html body is classified TRANSPORT_NON_JSON_RESPONSE');
    eq(e.transportStatus, 404, '5. carrying the HTTP status');
    eq(e.transportContentType, 'text/html; charset=utf-8', '5. and the content type');
    ok(String(e.responsePrefix || '').length <= 201, '5. with a sanitized, length-capped prefix — never the full page');
    ok(/non-JSON response/.test(e.message), '5. and an explanatory message');
  }));
checks.push(safeRead(fakeResp(200, 'application/json', '{"success":true,"data":{"plans":[]},"meta":{},"errors":[]}')).then(
  function (v) { eq(v.success, true, '5. a real JSON envelope still parses'); },
  function () { ok(false, '5. a real JSON envelope must parse'); }));
checks.push(safeRead(fakeResp(200, 'text/html', '')).then(
  function () { ok(false, '5. an empty body must not parse'); },
  function (e) { eq(e.apiCode, 'TRANSPORT_NON_JSON_RESPONSE', '5. an EMPTY body is also non-JSON (not an empty result)'); }));
// a route/action-not-found is distinguishable from a transport failure
ok(/UNKNOWN_ACTION/.test(FOUND) && /TRANSPORT_ERROR/.test(FOUND) && /TRANSPORT_NOT_CONFIGURED/.test(FOUND),
  '5. action-not-found, transport failure and unconfigured transport are separate codes');
// 5 STRENGTHENED by F1-7N-FB-4C-R1. F1-7K stopped the router's `error` STRING being dropped, which was right.
// But it then labelled EVERY such string BACKEND_ERROR — including the router's terminal "I do not know this
// action" answer, which is not a backend error at all. That is exactly what printed
// "Missing or invalid action parameter … [BACKEND_ERROR]" on SKU Details / SKU Regional Details: a message with
// no action, no request id and no next step. A genuine business string is still surfaced verbatim; the two
// unknown-action cases are now named.
ok(/_outErrs = \[\{ code: 'BACKEND_ERROR', message: _txt, details: \{ action: dto\.action, request_id: dto\.requestId \} \}\];/.test(FOUND),
  '5. a genuine router-level business error is still surfaced verbatim (now with its action + request id)');
ok(/if \(isUnknownActionText\(_txt\)\) \{/.test(FOUND),
  '5. but the router unknown-action answer is classified instead of being called a backend error');
ok(/code: API_ERROR_CODES\.REQUEST_METHOD_DOWNGRADED/.test(FOUND),
  '5. a POST answered by doGet is REQUEST_METHOD_DOWNGRADED (retryable — the deployment is fine)');
ok(/code: API_ERROR_CODES\.DEPLOYMENT_CONTRACT_MISMATCH/.test(FOUND),
  '5. a genuinely absent action is DEPLOYMENT_CONTRACT_MISMATCH (not retryable — retrying cannot publish)');

// =======================================================================================================
section('FB2-6. the router cannot be the source of a 404 HTML body');

var doGet = extractFn(RTR, 'doGet'), doPost = extractFn(RTR, 'doPost');
ok(/return jsonResponse_\(\{ success: false, error: 'Missing or invalid action parameter/.test(doGet),
  '6. doGet returns JSON for an unknown action');
ok(/catch \(err\)[\s\S]*return jsonResponse_/.test(doGet), '6. and JSON from its top-level catch');
ok(/catch \(err\)[\s\S]*return jsonResponse_/.test(doPost), '6. doPost likewise returns JSON from its catch');
ok(!/HtmlService|ContentService\.createTextOutput\([^)]*<html/i.test(doGet + doPost), '6. neither entrypoint can emit HTML');
ok(/handleSystemHealth_/.test(doGet) && /handleSystemHealth_/.test(doPost),
  '6. so system.health is routed on BOTH verbs — the probe that tells a deployment fault from a transport flake');
ok(/a 404 text\/html body can NEVER be produced by this\s*\n\/\/ script/.test(G63),
  '6. and the health module records that conclusion');

// =======================================================================================================
section('FB2-7. system.health is read-only and non-sensitive');

ok(/action === 'system\.health'/.test(RTR), '7. the action is routed');
ok(/action === 'system\.submitFlowDiagnostic'/.test(RTR), '7. and so is the flow diagnostic');
var C63 = code(G63);
ok(!/\.setValue\(|appendRow|deleteRow|\.clear\(|PropertiesService/.test(C63), '7. it performs NO write');
ok(!/DriveApp|makeCopy|createFolder|getAs\(/.test(C63), '7. it touches NO Drive API');
ok(!/tryLock|LockService/.test(C63), '7. it takes NO lock');
ok(!/MailApp|GmailApp|sendEmail/i.test(C63), '7. it sends NO email');
ok(!/DEMO4A_|TEMP_demo_shipping/.test(C63), '7. it never touches Demo rows');
var healthFn = extractFn(G63, 'handleSystemHealth_');
ok(!/prodExpectedDbId_\(\)[^;]*request|spreadsheet_id|spreadsheetId/.test(healthFn), '7. it never returns a spreadsheet id');
ok(/schema\.error = 'DB_NOT_REACHABLE'/.test(healthFn), '7. a DB failure is reported as a code, never as a raw message that could contain the id');
['api_contract_version', 'build_version', 'environment_mode', 'router_ready', 'required_actions',
  'db_reachable', 'schema_ready', 'server_timestamp', 'request_id'].forEach(function (k) {
  ok(healthFn.indexOf(k) !== -1, '7. health reports ' + k);
});
ok(/read_only: true, db_writes: 0, drive_writes: 0, status_transitions: 0, emails: 0, demo_mutations: 0/.test(healthFn),
  '7. and states its zero-effect contract in the response');
// availability is probed by SYMBOL, never by invoking a handler
var probeFn = extractFn(G63, 'sysHandlerPresent_');
ok(/typeof this\[name\] === 'function'/.test(probeFn) && /eval\('typeof ' \+ name\)/.test(probeFn),
  '7. action availability is probed by symbol presence');
ok(!new RegExp('\\+ name \\+ \\(\\)').test(probeFn), '7. and never by calling the handler');
ok(/SYS_REQUIRED_ACTIONS_/.test(G63), '7. the required-action list exists — a partial Apps Script sync becomes visible');

// every handler the health module claims to probe must actually exist exactly once
var HANDLER_SOURCES = [read('specs/active/apps-script/01_router.gs'), G13, G16, G39, G50, G57, G63,
  read('specs/active/apps-script/15_request_allocation_handlers.gs'),
  read('specs/active/apps-script/64_api_v1_scope_registry.gs'),
  read('specs/active/apps-script/65_api_v1_flow_diagnostics.gs'),
  // F1-7N-FB-4A §C — the read-only Execution Plan conflict diagnostic's owner.
  read('specs/active/apps-script/68_api_v1_execution_plan_conflict_diagnostic.gs'),
  // F1-7N-FB-4A addendum §C/§D — the SINGLE owner of the Request Order Send TEMP diagnostics.
  read('specs/active/apps-script/TEMP_request_order_send_diagnostics.gs'),
  read('specs/active/apps-script/22_shipment_dispatch_handlers.gs'),
  read('specs/active/apps-script/34_shipment_final_output_handlers.gs'),
  read('specs/active/apps-script/58_api_v1_fc_summary_workspace.gs'),
  read('specs/active/apps-script/59_api_v1_sku_details_workspace.gs'),
  read('specs/active/apps-script/51_api_v1_request_order_workspace.gs'),
  read('specs/active/apps-script/60_api_v1_inventory_replenishment_workspace.gs'),
  read('specs/active/apps-script/40_api_v1_weekly_workspace.gs'),
  // F1-7N-FB-3B: the Send Request server orchestration owner. Every handler named in SYS_REQUIRED_ACTIONS_ must
  // be defined exactly once across these sources, so a new owner file has to be listed or the probe cannot see it.
  read('specs/active/apps-script/66_api_v1_request_order_send.gs'),
  // F1-7N-FB-3C: the read-only allocation-draft identity reconciliation owner.
  read('specs/active/apps-script/67_api_v1_allocation_draft_identity.gs'),
  // F1-7N-FB-4E-R2: the shipment ETA + route-advance writers. R2 REGISTERED them (they were routed and served
  // all along, but absent from SYS_REQUIRED_ACTIONS_, so the deployment reported them missing from itself), and
  // this probe counts definitions across the list above — so their owner has to be in it or the probe reads a
  // registered handler as undefined. That is exactly the case the list's own note warns about.
  read('specs/active/apps-script/31_shipment_receipt_route_handlers.gs')].join(String.fromCharCode(10));
(G63.match(/handler: '([A-Za-z0-9_]+)'/g) || []).forEach(function (m) {
  var h = m.replace(/handler: '|'/g, '');
  var n = (HANDLER_SOURCES.match(new RegExp('function ' + h + '\\(', 'g')) || []).length;
  eq(n, 1, '7. probed handler is defined exactly once: ' + h);
});

// =======================================================================================================
section('FB2-8. Weekly Shipping Plan distinguishes ERROR from EMPTY, offers Retry, keeps confirmed data');

ok(/function _spRenderReadError_\(err\)/.test(SP), '8. a dedicated error renderer exists');
var errFn = extractFn(SP, '_spRenderReadError_');
ok(/Could not load shipping plans/.test(errFn), '8. it says the read failed');
ok(/This is a read failure, not a proven-empty plan list\./.test(errFn) || /not an empty plan list/.test(errFn),
  '8. and states explicitly that this is not an empty result');
ok(/class="sp-read-retry"/.test(errFn) && /renderShippingPlanFromDb\(\)/.test(errFn), '8. it offers Retry wired to the canonical re-read');
ok(/window\.renderShippingPlanFromDb = renderShippingPlanFromDb;/.test(SP), '8. and that re-read is reachable from the inline handler');
ok(/httpStatus/.test(errFn) || /_spReadErrorDetailHtml_/.test(errFn), '8. it surfaces the HTTP status / content type');
ok(/role="alert"/.test(errFn), '8. announced to assistive tech');
// the previous behaviour blanked every other region; it must not any more
ok(!/ids\.forEach\(function\(id\) \{ var el = document\.getElementById\(id\); if \(el\) el\.innerHTML/.test(errFn),
  '8. it no longer overwrites the other status groups with an empty string');
ok(/el\.querySelector\('\.sp-card'\)/.test(errFn), '8. and preserves already-confirmed cards when present');
// error vs empty are separate render states
ok(/if \(model\.error\) \{[\s\S]{0,140}STATES\.ERROR/.test(SP), '8. a model error sets the ERROR state');
ok(/\(\(model\.plans \|\| \[\]\)\.length\) \? window\.KM\.loadState\.STATES\.READY : window\.KM\.loadState\.STATES\.EMPTY/.test(SP),
  '8. EMPTY is reached only on a SUCCESSFUL read with zero plans');
// a transport failure must not be laundered into legacy/local data
var loadFn = extractFn(SP, 'loadWeeklyShippingReadModel_');
ok(/return \{ source: 'workspace', error:/.test(loadFn), '8. a failed workspace read returns an error model');
// the legacy read exists only as the LEGACY-MODE branch, reached before any workspace call - never as a
// failure fallback. Prove it by position: every legacy getter sits outside the workspace `if` block.
var wsBlockEnd = loadFn.indexOf('    var maps = _spBuildLegacyLiveMaps_();');
ok(wsBlockEnd > 0, '8. the legacy-mode branch is identifiable');
var wsBlock = loadFn.slice(0, wsBlockEnd);
ok(/getWorkspace\('weeklyShipping'/.test(wsBlock), '8. the workspace branch is the one that calls the API');
ok(!/getShippingPlans\(\)|_spBuildLegacyLiveMaps_\(\)/.test(wsBlock),
  '8. and contains NO legacy-cache read — a transport failure can never be laundered into legacy data');
ok(/if \(_spEffectiveWorkspace\(\)\)/.test(loadFn), '8. mode selection happens up front, not after a failure');
// stale-response guard
ok(/var mySeq = \+\+_spReadSeq;/.test(SP) && /if \(mySeq !== _spReadSeq\) return;/.test(SP),
  '8. a stale response can never overwrite a newer one');
eq((SP.match(/if \(mySeq !== _spReadSeq\) return;/g) || []).length, 2,
  '8. guarded on BOTH the success and the failure path');

// =======================================================================================================
section('FB2-9. Submit persists through exactly ONE canonical backend owner');

eq((RTR.match(/action === 'submitAllocationDraftsToShippingPlans'/g) || []).length, 1,
  '9. the Submit action is routed exactly once');
eq((G16.match(/function handleSubmitAllocationDraftsToShippingPlans_\(/g) || []).length, 1,
  '9. and has exactly ONE backend handler');
var submitHandler = extractFn(G16, 'handleSubmitAllocationDraftsToShippingPlans_');
ok(/lock\.tryLock\(30000\)/.test(submitHandler), '9. it serializes its DB work under the canonical ScriptLock');
ok(/finally \{ try \{ lock\.releaseLock\(\)/.test(submitHandler), '9. and always releases it');
ok(/sadSubmitToShippingPlansCore_\(SpreadsheetApp\.getActiveSpreadsheet\(\), body, ids\)/.test(submitHandler),
  '9. delegating the DB work to ONE orchestration core');
// every pre-write failure must report zero_write so the client can state it truthfully
ok(/zero_write: true/.test(submitHandler), '9. and every early failure reports zero_write');
eq((G16.match(/function sadSubmitToShippingPlansCore_\(/g) || []).length, 1, '9. that core is defined exactly once');
var submitCore = extractFn(G16, 'sadSubmitToShippingPlansCore_');
ok(/shippingPlanCommitFromLines_/.test(submitCore),
  '9. and it writes through the SINGLE shipping_plans authority (11_ shippingPlanCommitFromLines_), not its own writer');
ok(/never ENSURE here — the shipping_plans WRITE authority lives in 11_/.test(G16),
  '9. the source states that this module is not a second shipping_plans writer');
ok(/execution_key|execKey/.test(submitCore), '9. the write is keyed by the idempotency execution key');
ok(/readback-verified inside the core/.test(G16), '9. with read-after-write verification');
ok(/POSTCHECK_FAILED_ROLLED_BACK/.test(submitCore), '9. and a rollback when the post-check fails');
ok(/zero_write: rolledOk/.test(submitCore), '9. reporting zero_write only when the rollback is verified');
// the ONE canonical shipping_plans writer really is single
var G11 = read('specs/active/apps-script/11_shipping_plan_handlers.gs');
eq((G11.match(/function shippingPlanCommitFromLines_\(/g) || []).length, 1, '9. shippingPlanCommitFromLines_ is defined exactly once');
ok(/shipping_plans/.test(G11) && /shipping_plan_lines/.test(G11), '9. and it owns both plan tables');
// the client sends only draft ids + an execution key: no client-authored plan lines
ok(/allocation_draft_id/.test(INV), '9. the client submits persisted allocation_draft_id values');
ok(/planLines above are retained\s*\n\s*\/\/ solely for the client-side carton pre-gate — they are NOT transmitted/.test(INV),
  '9. and never transmits client-authored plan lines');
ok(/_replenSubmitExecutionKey\(\)/.test(INV), '9. with a stable client execution key for idempotency');
var keyFn = extractFn(INV, '_replenSubmitExecutionKey');
ok(keyFn.length > 20, '9. that key is really computed, not a constant');
// single-flight so a double click cannot become two mutations
ok(/single-flight|in-flight/i.test(INV), '9. a second click shares the in-flight promise rather than mutating twice');

// =======================================================================================================
section('FB2-10. Demo rows never select local mode, and Demo isolation holds');

// mode selection is a function of CONFIGURATION only — no row count, no Demo table appears in it
var eligFn = extractFn(API, 'window.KM.DB.isProductionWriteEligible');
ok(!/demo|Demo|row|count|length/.test(eligFn), '10. write eligibility reads no row count and no Demo signal');
var devFn = extractFn(API, 'window.KM.DB.isDevLocalModeAllowed');
ok(!/demo|Demo|row|count/.test(devFn.replace(/KM_DEV_LOCAL_MODE/g, '')), '10. nor does the dev-mode predicate');
ok(!/DemoData\.isEnabled|KM\.DemoData/.test(extractFn(INV, 'submitReplenishmentPlans')), '10. Submit consults no Demo posture at all');
// nothing in this change touches the Demo seed
var CHANGED = [API, INV, SP, POJS, RTR, G63, G50].join('\n');
ok(!/TEMP_demo_shipping_shipment_map_seed_v2|DEMO4A_|demoSeedCommit|COMMIT_CONFIRM|CLEAR_CONFIRM/.test(CHANGED),
  '10. no changed file references the Demo seed tool, its helpers or its confirmation constants');
ok(fs.existsSync(path.join(ROOT, 'specs/active/apps-script/TEMP_demo_shipping_shipment_map_seed_v2.gs')),
  '10. and the Demo seed source is still present, unmodified by this task');

// =======================================================================================================
section('FB2-11. bounded reads — no unconditional registry scan on the hot PO path');

ok(/\{ name: 'generated_documents',  requiredCols: \[\], optional: true, include: 'documents' \}/.test(G50),
  '11. the PO workspace reads generated_documents ONLY when the caller asks (FB-1B shipped it unconditionally)');
ok(/\{ name: 'generated_documents',           requiredCols: \[\], optional: true, include: 'documents' \}/.test(G57),
  '11. the shipment workspace is bounded the same way');
ok(/include: \{ documents: true \}/.test(POJS), '11. and the PO page asks for it explicitly');
ok(/include: \{ documents: true \}/.test(SHJS), '11. as does the Shipment page');
// the include gate is honoured by the read loop
ok(/if \(spec\.include && !include\[spec\.include\]\) continue;/.test(G50), '11. the PO read loop skips un-requested tables');
ok(/if \(spec\.include && !include\[spec\.include\]\) continue;/.test(G57), '11. and so does the shipment loop');
ok(/if \(optional && !ss\.getSheetByName\(name\)\) return \[\];/.test(G50),
  '11. and an absent OPTIONAL table degrades to [] instead of failing the whole PO workspace read');
ok(/spec\.optional === true/.test(G50), '11. with the optional flag actually passed through');
// no N+1: documents are grouped ONCE per read, not fetched per entity
eq((G50.match(/poWsGroupDocuments_\(/g) || []).length, 2, '11. PO documents are grouped once (definition + single call)');
eq((G57.match(/shipWsGroupDocuments_\(/g) || []).length, 2, '11. shipment documents likewise — no per-entity query');
ok(!/forEach[\s\S]{0,200}dgsGeneratedFor_\(/.test(code(G50) + code(G57)), '11. no registry read inside a per-entity loop');
// the pages read their workspace once per refresh, guarded by a sequence
// one list read + one bounded single-PO readback (the third occurrence is the explanatory comment above them)
eq((POJS.match(/window\.KM\.api\.getWorkspace\('purchaseOrder'/g) || []).length, 2,
  '11. the PO page issues exactly one list read + one bounded readback — no duplicate load');
eq((SHJS.match(/window\.KM\.api\.getWorkspace\('shipment'/g) || []).length, 1,
  '11. and the Shipment page a single read path');
ok(/include: \{ documents: true \}/.test(POJS.slice(POJS.indexOf("getWorkspace('purchaseOrder'"))),
  '11. both PO reads request the documents include they depend on');
// every page read is sequence-guarded, so a route change or a slow response cannot double-render
ok(/mySeq !== _poReadSeq/.test(POJS) && /mySeq !== _shReadSeq/.test(SHJS) && /mySeq !== _spReadSeq/.test(SP),
  '11. every affected page guards against a stale/duplicate response');

// =======================================================================================================
section('FB2-12. the FB-1B/G1/G2 document contracts are untouched');

ok(/function dgsPoPrepare_/.test(G39) && /function dgsPoRenderPrepared_/.test(G39) && /function dgsPoFinalize_/.test(G39),
  '12. the staged PO saga is intact');
ok(!/dofProbeIo_|dgsDriveReadiness_|DriveApp/.test(code(extractFn(G39, 'dgsPoPrepare_'))),
  '12. STAGE 1 still makes no Drive call of any kind');
ok(/dgsDriveReadiness_\(dofProbeIo_\(\)/.test(extractFn(G39, 'dgsPoRenderPrepared_')),
  '12. readiness still probes in STAGE 2, outside the lock');
eq((G13.match(/setStatus\('issued'\)/g) || []).length, 1, '12. there is still exactly ONE order_status = issued writer');
ok(/poFin\.authorizes_issue !== true/.test(G13), '12. gated on the verifier authorization');
ok(fs.existsSync(path.join(ROOT, 'specs/active/apps-script/TEMP_document_diagnostics.gs')),
  '12. the TEMP document diagnostics are retained');
eq((RTR.match(/action === 'document\.(list|get|retry)'/g) || []).length, 3, '12. the production document actions survive');
ok(/action === 'document\.diagnostic\.purchaseOrder'/.test(RTR) && /action === 'document\.diagnostic\.shipment'/.test(RTR),
  '12. and both document diagnostics');
// no email anywhere in the changed backend
[['01_router', RTR], ['63_', G63], ['50_', G50], ['13_', G13]].forEach(function (p) {
  ok(!/MailApp|GmailApp|sendEmail/i.test(code(p[1])), '12. no email API in ' + p[0]);
});
ok(!/MailApp|GmailApp|sendEmail/i.test(code(API) + code(INV) + code(SP)), '12. nor in any changed frontend file');

// =======================================================================================================
Promise.all(checks).then(function () {
  console.log('\n----------------------------------------');
  console.log('PASS ' + pass + '   FAIL ' + fail);
  console.log('----------------------------------------');
  if (fail) process.exit(1);
});
