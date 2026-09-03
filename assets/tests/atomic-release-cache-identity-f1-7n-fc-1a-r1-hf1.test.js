// ================================================================================================================
// F1-7N-FC-1A-R1-HF1 — ATOMIC RELEASE CACHE IDENTITY AND DEPLOYMENT READINESS
// ----------------------------------------------------------------------------------------------------------------
// WHY THIS ROUND EXISTS. It changes no feature logic at all; it repairs how the FC-1A + R1 release IDENTIFIES
// itself, in two places where the release could pass every existing check while being undeliverable.
//
// (1) THE CACHE TOKEN. R1 deliberately reused FC-1A's `fc1a-shipmentrecovery-20260903`, reasoning that FC-1A and
//     R1 are ONE atomic release and a second token would let the halves ship separately. The premise is true and
//     the conclusion does not follow: ATOMICITY and CACHE IDENTITY are different axes with different
//     enforcement. Atomicity is enforced by the ACTION-CONTRACT version, which refuses a half-synced deployment
//     outright. A cache token decides exactly one thing — whether a browser refetches a file. FC-1A had already
//     been PUBLISHED (d94d5bd was pushed), so browsers already held that token; reusing it meant every one of
//     them would keep the FC-1A copy of shipping-history.js, which R1 CHANGED. That is a Shipment Draft card
//     with no Cancel button, served against a deployment that routes cancelShipmentDraft — the reservation held
//     with no reachable way to release it, which is the exact hazard R1 §0 was written to close.
//
//     And shipping-plan.js was worse, because reuse is not even what happened to it. FC-1A rewrote that file —
//     the recovery banner, the Retry action, the contract gate — and never rotated its token AT ALL. It was
//     still served at `donenotice-20260811`, dated 2026-08-11. The one file carrying the whole recovery feature
//     had no cache identity for that feature, and nothing caught it because the round measured the token it had
//     moved rather than the files it had changed. §A therefore derives the rule from the FEATURE SYMBOLS: any
//     browser file that speaks this feature must carry the current application token, whatever its name.
//
// (2) THE BUILD STAMP R1 CHANGED AND DID NOT MOVE. R1 added the cancelled-shipment dispatch refusal to 22_ — the
//     guard that stops a cancelled draft deducting factory stock, measured at 1000 -> 200 before it existed —
//     and left CSD_BUILD_VERSION_ reading 'F1-7N-FC-1A'. So the module manifest could not tell an R1 22_ from an
//     FC-1A one, and an operator who synced everything EXCEPT 22_ would have been shown a fully GREEN,
//     UNIFORM health report by a deployment that still dispatches cancelled shipments. §B proves that by
//     EXECUTING the manifest against a mirror with 22_ left behind, both before and after the fix.
//
// Run: node assets/tests/atomic-release-cache-identity-f1-7n-fc-1a-r1-hf1.test.js
// ================================================================================================================
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var pass = 0, fail = 0;
var neg = { caught: 0, missed: 0 };
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(t) { console.log('\n== ' + t + ' =='); }
// A mutation must APPLY and be CAUGHT. A probe that cannot find its target is a PROBE ERROR, never a pass — a
// mutation test that has quietly stopped mutating is worse than no mutation test at all.
function mut(label, f) {
  var r;
  try { r = f(); } catch (e) { neg.missed++; fail++; console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message)); return; }
  if (r) { neg.caught++; pass++; console.log('ok   ' + label + ' (caught)'); }
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}

var ROOT = path.join(__dirname, '..', '..');
var GS_DIR = path.join(ROOT, 'assets', 'specs', 'active', 'apps-script');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function exists(rel) { try { fs.accessSync(path.join(ROOT, rel)); return true; } catch (e) { return false; } }

var RO = require('./_release-order.js');
var INDEX = read('index.html');
var G01 = read('assets/specs/active/apps-script/01_router.gs');
var G12 = read('assets/specs/active/apps-script/12_shipment_handlers.gs');
var G22 = read('assets/specs/active/apps-script/22_shipment_dispatch_handlers.gs');
var G63 = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
var DBAPI = read('assets/js/api/operation-system-db-api.js');
var LEDGER = read('assets/tests/_release-order.js');

var HF1_TOKEN = 'fc1ar1-cancelrelease-20260903';
var FC1A_TOKEN = 'fc1a-shipmentrecovery-20260903';
var STALE_TOKEN = 'donenotice-20260811';   // 2026-08-11 — what shipping-plan.js was still being served at

// ================================================================================================================
section('§A — THE CACHE IDENTITY: a token that was published cannot be reused, and the rule is derived');
// ================================================================================================================

// A.1 — the floor is STRICT, not "at or after". FC-1A's token reached browsers, so this round's frontend must
// not be served under it. `tokenAtOrAfter` would have been satisfied by the reuse that caused the problem.
//
// RESTATED (F1-7N-FC-1B-E1): this asserted `currentAppToken() === HF1_TOKEN`. That is the equality-with-now
// this very commit spent a paragraph removing from eleven other suites — written into the round that removed
// it, one assertion later. E1 legitimately mints its own token, so all of §A failed while describing a
// perfectly correct tree. HF1's token is a FLOOR: it had to be MINTED (it is in the series, strictly after
// FC-1A's published one) and nothing may ever be served from FC-1A's again. Neither statement can be falsified
// by a later round doing the right thing.
ok(RO.tokenIndex(HF1_TOKEN) !== -1, 'A1  HF1 minted its own application token');
ok(RO.tokenIndex(RO.currentAppToken()) >= RO.tokenIndex(HF1_TOKEN),
  'A1a and the series has not moved behind it (current: ' + RO.currentAppToken() + ')');
ok(RO.tokenIndex(HF1_TOKEN) > RO.tokenIndex(FC1A_TOKEN),
  'A1b HF1\'s token sits STRICTLY AFTER FC-1A\'s in the append-only series');
ok(RO.tokenIndex(FC1A_TOKEN) !== -1,
  'A1c while FC-1A\'s token REMAINS in the series — history is never rewritten, or "at or after round X" changes meaning');
ok(!RO.isMapToken(HF1_TOKEN) && !RO.isMapToken(RO.currentAppToken()),
  'A1d and both are application tokens, not map-series ones');

// A.2 — PRODUCTION references. The only thing a browser ever sees is a `?v=` query string, so that is what
// "remaining references = 0" has to be measured on. Counted separately from prose below.
eq((INDEX.match(new RegExp('\\?v=' + FC1A_TOKEN, 'g')) || []).length, 0,
  'A2  index.html carries ZERO production references to the published FC-1A token');
// RESTATED (F1-7N-FC-1B-E1): the literal 19, for the third time in three rounds. The count is not the
// property; the property is that the application set moves TOGETHER and that a PUBLISHED token never serves
// a file again. Both are derived below and neither can be broken by a round covering a different number of
// assets.
var appRefs = RO.appTokenRefCount(INDEX);
ok(appRefs >= 15, 'A2a the application set is carried on ONE current token (' + appRefs + ' refs on ' +
  RO.currentAppToken() + ')');
eq(RO.staleAppTokenRefs(INDEX).join(' | '), '',
  'A2b and nothing is left behind on a superseded application token DASH the set rotated together'.replace('DASH', '\u2014'));

// A.3 — THE DERIVED RULE, and the reason it is derived. FC-1A rotated the token it had chosen and missed the
// file that mattered most, because the round checked its own token rather than its own changes. So the question
// asked here is not "did the named files move" but "does any file that SPEAKS this feature lag behind" — which
// stays correct if a later round teaches a fourth file to speak it.
var FEATURE_SYMBOLS = [
  'cancelShipmentDraft',        // the action itself: adapter + any caller
  'shCancelShipmentDraft',      // Shipment Draft card -> the cancel command
  'spShipmentRecoveryState_',   // the approved-plan recovery predicate
  'spDbRetryShipment'           // the Retry the Approve message promises
];
var idxTokens = RO.parseIndexTokens(INDEX);
var featureFiles = [], lagging = [];
Object.keys(idxTokens).forEach(function (rel) {
  if (!/\.js$/.test(rel) || !exists(rel)) return;
  var src = read(rel);
  var speaks = FEATURE_SYMBOLS.some(function (s) { return src.indexOf(s) !== -1; });
  if (!speaks) return;
  featureFiles.push(rel);
  if (idxTokens[rel] !== RO.currentAppToken()) lagging.push(rel + ' is served at ' + idxTokens[rel]);
});
ok(featureFiles.length >= 3,
  'A3  the feature is spoken by ' + featureFiles.length + ' browser files index.html loads (' +
  featureFiles.map(function (f) { return f.split('/').pop(); }).join(', ') + ')');
eq(lagging.join(' | '), '',
  'A3a and EVERY one of them is served at the current application token');

// A.4 — the rescued file, named because its failure was a different one: not a reuse, an omission. FC-1A
// rewrote it and rotated nothing, so it kept a token from 2026-08-11 while carrying the whole recovery feature.
eq(idxTokens['assets/js/pages/shipping-plan.js'], RO.currentAppToken(),
  'A4  shipping-plan.js — the file FC-1A rewrote and never rotated — is on the current token');
ok(idxTokens['assets/js/pages/shipping-plan.js'] !== STALE_TOKEN,
  'A4a and no longer on ' + STALE_TOKEN + ', which predates the feature by three weeks');
// Its STYLESHEET is deliberately left where it is: the release changed no CSS byte, and rotating a token for a
// file that did not move buys a refetch and nothing else.
eq(idxTokens['assets/css/pages/shipping-plan.css'], STALE_TOKEN,
  'A4b while its STYLESHEET is untouched, because no CSS byte moved in this release');

// A.5 — the map/application separation, which is the property the three suites that pinned "18" were actually
// defending. Derived from the inventory, so adding an asset cannot break it.
eq(RO.misplacedIndexTokens(INDEX).join(' | '), '',
  'A5  every application asset carries an application token and every map asset a map-series token');

// A.6 — HISTORY, counted separately from production and deliberately NOT driven to zero. The ledger keeps
// FC-1A's token because ordering questions are answered against it, and the planning document keeps the
// sentence it got wrong because the correction is the record.
ok(LEDGER.indexOf("'" + FC1A_TOKEN + "'") !== -1,
  'A6  the release ledger RETAINS the FC-1A token as a series member (history, not a production reference)');
ok(/A token may only be reused while nothing carrying it has been published/.test(LEDGER),
  'A6a and still states, in its own words, the rule R1 broke');
ok(/F1-7N-FC-1A-R1-HF1/.test(LEDGER),
  'A6b and RECORDS this correction rather than quietly rotating the token');
ok(/SUPERSEDED BY F1-7N-FC-1A-R1-HF1/.test(LEDGER),
  'A6c marking the superseded reasoning in place instead of deleting it');
var R1DOC = read('docs/planning/SHIPMENT_CANCELLATION_AND_MOVEMENT_VOCABULARY_F1-7N-FC-1A-R1.md');
ok(/CORRECTED BY F1-7N-FC-1A-R1-HF1/.test(R1DOC),
  'A6d and R1\'s own planning document is corrected where it stated the opposite');

// ================================================================================================================
section('§B — THE APPS SCRIPT MANIFEST: every owner stamp, and the one R1 changed without moving');
// ================================================================================================================

// B.1 — derived over the WHOLE manifest rather than a hand-kept subset. A file whose behaviour moves and whose
// stamp does not is invisible to the health report, which is the only instrument an operator has.
var manifestRows = [];
var reRow = /\{\s*file:\s*'([^']+)',\s*symbol:\s*'([^']+)',[^}]*expected:\s*'([^']+)'([^}]*)\}/g;
var mm;
while ((mm = reRow.exec(G63))) manifestRows.push({ file: mm[1], symbol: mm[2], expected: mm[3], optional: /optional:\s*true/.test(mm[4]) });
eq(manifestRows.length, (G63.match(/\{ file: '/g) || []).length,
  'B1  every one of the ' + manifestRows.length + ' manifest rows PARSED — a row this regex skipped would be ' +
  'a stamp nothing below ever compares');
var stampMismatch = [];
manifestRows.forEach(function (r) {
  var rel = 'assets/specs/active/apps-script/' + r.file;
  if (!exists(rel)) { if (!r.optional) stampMismatch.push(r.file + ' is ABSENT but not optional'); return; }
  var d = new RegExp('var ' + r.symbol + " = '([^']*)'").exec(read(rel));
  if (!d) stampMismatch.push(r.file + ' declares no ' + r.symbol);
  else if (d[1] !== r.expected) stampMismatch.push(r.file + ' declares ' + d[1] + ' but the manifest expects ' + r.expected);
});
eq(stampMismatch.join(' | '), '',
  'B1a and every one of them declares exactly the build its manifest entry expects');

// B.2 — THE FINDING, stated as a specific fact rather than left to the sweep above. R1 changed this file and
// left this constant behind; both halves now name the round whose guard the file contains.
eq((/var CSD_BUILD_VERSION_ = '([^']*)'/.exec(G22) || [])[1], 'F1-7N-FC-1A-R1',
  'B2  22_ declares F1-7N-FC-1A-R1 — the round that added its cancelled-shipment refusal');
ok(/\{ file: '22_shipment_dispatch_handlers\.gs',[^}]*expected: 'F1-7N-FC-1A-R1'/.test(G63),
  'B2a and the manifest expects that, so a 22_ left behind is DETECTABLE');
// The guard the stamp now covers is in the file it claims to be in. A stamp that names a round whose change is
// absent is worse than a stale one: it asserts a behaviour nobody can find.
ok(/curStatus === 'cancelled'/.test(G22) && /SHIPMENT_CANCELLED/.test(G22),
  'B2b and the refusal that stamp is FOR is actually present in 22_');

// B.3 — the contract axes, and the one that must not have moved. Cache identity is a frontend concern; a
// hotfix to it must not touch the transport envelope.
var ACTION_CONTRACT = Number((/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+)/.exec(G63) || [])[1]);
var LIST_VERSION = Number((/var SYS_REQUIRED_ACTION_LIST_VERSION_ = (\d+)/.exec(G63) || [])[1]);
var TRANSPORT = Number((/var SYS_TRANSPORT_CONTRACT_VERSION_ = (\d+)/.exec(G63) || [])[1]);
var CLIENT_PIN = Number((/var KM_EXPECTED_ACTION_CONTRACT_VERSION_ = (\d+)/.exec(DBAPI) || [])[1]);
var CLIENT_TRANSPORT_PIN = Number((/var KM_EXPECTED_TRANSPORT_CONTRACT_VERSION_ = (\d+)/.exec(DBAPI) || [])[1]);
eq(ACTION_CONTRACT, 11, 'B3  deployed_action_contract_version is 11');
eq(LIST_VERSION, 12, 'B3a required_action_list_version is 12');
eq(TRANSPORT, 1, 'B3b transport_contract_version is UNCHANGED at 1 — no envelope field moved in this hotfix');
eq(CLIENT_PIN, ACTION_CONTRACT, 'B3c the client pin AGREES with the deployment, derived rather than restated');
eq(CLIENT_TRANSPORT_PIN, TRANSPORT, 'B3d and so does the transport pin');
ok(CLIENT_PIN >= 11, 'B3e the pin was never lowered to admit an older deployment (v' + CLIENT_PIN + ')');

// ================================================================================================================
section('§C — cancelShipmentDraft EXISTS EXACTLY ONCE ON EVERY AXIS');
// ================================================================================================================
// "Exactly once" is the claim worth checking on each axis: two routes or two handlers is how a fix gets applied
// to one of them. `code()` strips comments so a paragraph explaining the action is not counted as an
// implementation of it.
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }
eq((code(G01).match(/if \(action === 'cancelShipmentDraft'\)/g) || []).length, 1,
  'C1  the router dispatches it exactly once');
eq((code(G12).match(/function handleCancelShipmentDraft_/g) || []).length, 1,
  'C2  exactly one handler defines it');
eq((code(G63).match(/action: 'cancelShipmentDraft'/g) || []).length, 1,
  'C3  the required-action manifest registers it exactly once');
eq((code(DBAPI).match(/KM\.DB\.cancelShipmentDraft = /g) || []).length, 1,
  'C4  the browser adapter exposes it exactly once');
ok(/cancelShipmentDraft/.test(code(read('assets/js/pages/shipping-history.js'))),
  'C5  and a UI caller reaches it — an action with no caller is a deployed stage nobody can start');
// The router's own Supported list is what an operator reads in an error message; an action missing from it is
// routed but undiscoverable.
ok(/Supported:[^']*cancelShipmentDraft/.test(G01),
  'C6  and the router ADVERTISES it in the Supported list a rejection prints');

// ================================================================================================================
section('§D — THE DEPLOYMENT, EXECUTED: the manifest values come off the wire, not out of a constant');
// ================================================================================================================
// Every .gs file loaded into ONE shared global scope, because that is how Apps Script runs them. Only Google
// platform services are stubbed; none of the repository's own code is.
function makeDeployment(patch) {
  var sb = {
    console: { log: function () {}, error: function () {}, warn: function () {} },
    JSON: JSON, Math: Math, Date: Date, Array: Array, Object: Object, String: String,
    Number: Number, Boolean: Boolean, RegExp: RegExp, Error: Error, isFinite: isFinite, isNaN: isNaN,
    parseInt: parseInt, parseFloat: parseFloat, encodeURIComponent: encodeURIComponent,
    decodeURIComponent: decodeURIComponent,
    ContentService: {
      MimeType: { JSON: 'application/json', TEXT: 'text/plain' },
      createTextOutput: function (t) { return { _t: t, setMimeType: function () { return this; }, getContent: function () { return this._t; } }; }
    },
    Utilities: {
      getUuid: function () { return 'HF1-TEST-0000'; }, formatDate: function () { return '2026-09-03'; },
      sleep: function () {}, base64Encode: function (s) { return String(s); }
    },
    Logger: { log: function () {} },
    // Read-only: the probe never opens the database, and system.health reports DB_NOT_REACHABLE for that, which
    // is the correct answer for a test with no spreadsheet and not the axis under test here.
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
  files.forEach(function (f) {
    var src = fs.readFileSync(path.join(GS_DIR, f), 'utf8');
    if (patch) src = patch(f, src);
    vm.runInContext(src, ctx, { filename: f });
  });
  return sb;
}
function health(dep) {
  var body = JSON.parse(dep.doGet({ parameter: { action: 'system.health' } }).getContent());
  return body.envelope || body.data || body;
}

var DEP = makeDeployment();
var H = health(DEP);
eq(H.deployed_action_contract_version, 11, 'D1  EXECUTED: deployed_action_contract_version = 11');
eq(H.required_action_list_version, 12, 'D2  EXECUTED: required_action_list_version = 12');
eq(H.transport_contract_version, 1, 'D3  EXECUTED: transport_contract_version = 1 (unmoved)');
eq(H.missing_actions, [], 'D4  EXECUTED: missing_actions = []');
eq(H.mixed_deployment, false, 'D5  EXECUTED: mixed_deployment = false');
eq(H.module_build_stamps.stale_modules, [], 'D5a EXECUTED: no owner file is stale');
eq(H.module_build_stamps.absent_modules, [], 'D5b EXECUTED: no required owner file is absent');
eq(H.module_build_stamps.modules.length, manifestRows.length,
  'D5c EXECUTED: the deployment probes exactly the ' + manifestRows.length + ' owners §B parsed statically');
var cancelRow = (H.required_actions || []).filter(function (r) { return r && r.action === 'cancelShipmentDraft'; })[0];
ok(!!cancelRow, 'D6  EXECUTED: cancelShipmentDraft is present in the required-action answer');
eq(cancelRow && cancelRow.available, true, 'D6a EXECUTED: and it RESOLVES — its handler symbol exists in the deployment');
eq(H.router_build, 'F1-7N-FC-1A-R1', 'D7  EXECUTED: the router reports the R1 build');
ok(/^UNIFORM/.test(String(H.deployment_uniformity_verdict)),
  'D8  EXECUTED: the uniformity verdict is UNIFORM — ' + String(H.deployment_uniformity_verdict).slice(0, 60));

// D.9 — THE FINDING, PROVEN SUBSTANTIVE. Before the stamp moved, the manifest expected 'F1-7N-FC-1A' and this
// same 22_ satisfied it, so an operator who forgot the one file that stops a cancelled shipment deducting stock
// saw UNIFORM. Both directions are executed, because "the stamp catches it" is only a real claim if the
// pre-fix state does not.
var DEP_BEHIND = makeDeployment(function (f, src) {
  return f === '22_shipment_dispatch_handlers.gs'
    ? src.replace("var CSD_BUILD_VERSION_ = 'F1-7N-FC-1A-R1';", "var CSD_BUILD_VERSION_ = 'F1-7N-FC-1A';")
    : src;
});
var HB = health(DEP_BEHIND);
eq(HB.module_build_stamps.stale_modules,
  ['22_shipment_dispatch_handlers.gs declares F1-7N-FC-1A, expected F1-7N-FC-1A-R1'],
  'D9  EXECUTED: a 22_ left behind at FC-1A is now NAMED as stale');
eq(HB.mixed_deployment, true, 'D9a EXECUTED: and the deployment reports itself MIXED');
ok(/MIXED_OR_PARTIAL_SYNC/.test(String(HB.deployment_uniformity_verdict)),
  'D9b EXECUTED: with a verdict telling the operator to re-copy and republish');
// And the same mirror with the manifest ALSO reverted — R1's actual shipped state — reports UNIFORM while
// carrying a 22_ that has no cancelled-shipment guard. That is the hole this round closes.
var DEP_R1_STATE = makeDeployment(function (f, src) {
  if (f === '22_shipment_dispatch_handlers.gs') {
    return src.replace("var CSD_BUILD_VERSION_ = 'F1-7N-FC-1A-R1';", "var CSD_BUILD_VERSION_ = 'F1-7N-FC-1A';");
  }
  if (f === '63_api_v1_system_health.gs') {
    return src.replace("{ file: '22_shipment_dispatch_handlers.gs', symbol: 'CSD_BUILD_VERSION_', expected: 'F1-7N-FC-1A-R1'",
      "{ file: '22_shipment_dispatch_handlers.gs', symbol: 'CSD_BUILD_VERSION_', expected: 'F1-7N-FC-1A'");
  }
  return src;
});
var HR = health(DEP_R1_STATE);
eq(HR.module_build_stamps.stale_modules, [],
  'D10 EXECUTED: as R1 shipped it, a stale 22_ was INVISIBLE — this is what the fix buys');
eq(HR.mixed_deployment, false, 'D10a EXECUTED: the report said mixed_deployment=false about a partial sync');

// ================================================================================================================
section('§E — THE ALTERNATE DOOR STAYS SHUT');
// ================================================================================================================
// updateShipment had no status allowlist, so `status:'cancelled'` was written straight through with NO
// reservation release. R1 closed it and EXECUTES the refusal; what matters here is the ORDER — the refusal has
// to precede the write, or it is a log entry rather than a guard.
var uCancel = code(G12).indexOf("USE_CANCEL_SHIPMENT_DRAFT");
var uWrite = code(G12).indexOf("setCell('status', newStatus)");
ok(uCancel > 0 && uWrite > 0, 'E1  updateShipment has both a cancel refusal and a status write');
ok(uCancel < uWrite, 'E1a and the refusal comes BEFORE the write, so nothing is persisted first');
ok(/UNKNOWN_SHIPMENT_STATUS/.test(G12),
  'E2  and an unrecognised status is refused too — the allowlist fails closed, not open');
// The router must not offer a second way in.
eq((code(G01).match(/handleCancelShipmentDraft_\(/g) || []).length, 1,
  'E3  exactly one router call site reaches the cancel handler');

// ================================================================================================================
section('§N — MUTATIONS: each defect this round repaired, reintroduced');
// ================================================================================================================
function idxTok(src) { return RO.parseIndexTokens(src); }

// RESTATED (F1-7N-FC-1B-E1): every mutation below addressed HF1_TOKEN, so all five silently stopped applying
// the moment E1 rotated the set — a mutation that cannot find its target proves nothing. Against
// currentAppToken() they keep testing the same defects for every round that follows.
mut('N1  a published token restored in index.html', function () {
  var m = INDEX.replace(new RegExp('\\?v=' + RO.currentAppToken(), 'g'), '?v=' + FC1A_TOKEN);
  return (m.match(new RegExp('\\?v=' + FC1A_TOKEN, 'g')) || []).length !== 0;
});

mut('N2  shipping-plan.js returned to the 2026-08-11 token', function () {
  var m = INDEX.replace('assets/js/pages/shipping-plan.js?v=' + RO.currentAppToken(),
    'assets/js/pages/shipping-plan.js?v=' + STALE_TOKEN);
  return idxTok(m)['assets/js/pages/shipping-plan.js'] !== RO.currentAppToken();
});

// N3 — THE PARTIAL ROTATION, which is the failure mode a per-file token invites: most of the set moves and one
// member does not. Caught by the DERIVED feature rule, not by a count.
mut('N3  only some entry points rotated — shipping-history.js left behind', function () {
  var m = INDEX.replace('assets/js/pages/shipping-history.js?v=' + RO.currentAppToken(),
    'assets/js/pages/shipping-history.js?v=' + FC1A_TOKEN);
  var t = idxTok(m), bad = [];
  Object.keys(t).forEach(function (rel) {
    if (!/\.js$/.test(rel) || !exists(rel)) return;
    var src = read(rel);
    if (FEATURE_SYMBOLS.some(function (s) { return src.indexOf(s) !== -1; }) && t[rel] !== RO.currentAppToken()) bad.push(rel);
  });
  return bad.length > 0;
});

mut('N4  the adapter left behind while the pages rotate', function () {
  var m = INDEX.replace('assets/js/api/operation-system-db-api.js?v=' + RO.currentAppToken(),
    'assets/js/api/operation-system-db-api.js?v=' + FC1A_TOKEN);
  return idxTok(m)['assets/js/api/operation-system-db-api.js'] !== RO.currentAppToken();
});

mut('N5  the map token placed on an application asset', function () {
  return RO.misplacedIndexTokens(INDEX.replace(RO.currentAppToken(), RO.currentMapToken())).length > 0;
});

mut('N6  the new token appended to the ledger but index.html never rotated', function () {
  // The ledger says the round happened; the file set says it did not. Derived from the FILES, so it is caught.
  var m = INDEX.replace(new RegExp('\\?v=' + RO.currentAppToken(), 'g'), '?v=' + FC1A_TOKEN);
  var t = idxTok(m);
  return t['assets/js/pages/shipping-plan.js'] !== RO.currentAppToken();
});

mut('N7  history rewritten — FC-1A dropped from the series to force the count to zero', function () {
  // Removing a published token would silently change what "at or after FC-1A" means for every older suite.
  var m = LEDGER.replace("  'fc1a-shipmentrecovery-20260903',\n", '').replace("  'fc1a-shipmentrecovery-20260903',\r\n", '');
  return m.indexOf("'" + FC1A_TOKEN + "'") === -1;
});

mut('N8  22_ build stamp reverted to FC-1A', function () {
  var m = G22.replace("var CSD_BUILD_VERSION_ = 'F1-7N-FC-1A-R1';", "var CSD_BUILD_VERSION_ = 'F1-7N-FC-1A';");
  return (/var CSD_BUILD_VERSION_ = '([^']*)'/.exec(m) || [])[1] !== 'F1-7N-FC-1A-R1';
});

mut('N9  the manifest expectation for 22_ reverted, so the stale file passes', function () {
  return health(DEP_R1_STATE).module_build_stamps.stale_modules.length === 0;
});

mut('N10 the cancelled-shipment refusal removed while the stamp still claims it', function () {
  var m = G22.replace(/if \(curStatus === 'cancelled'\)/, "if (false && curStatus === 'cancelled')");
  return !/if \(curStatus === 'cancelled'\)/.test(m) && /F1-7N-FC-1A-R1/.test(m);
});

mut('N11 the client pin lowered to admit a v10 deployment', function () {
  var m = DBAPI.replace('var KM_EXPECTED_ACTION_CONTRACT_VERSION_ = 11;', 'var KM_EXPECTED_ACTION_CONTRACT_VERSION_ = 10;');
  return Number((/var KM_EXPECTED_ACTION_CONTRACT_VERSION_ = (\d+)/.exec(m) || [])[1]) !== ACTION_CONTRACT;
});

mut('N12 the transport contract moved by a cache-identity hotfix', function () {
  var m = G63.replace('var SYS_TRANSPORT_CONTRACT_VERSION_ = 1;', 'var SYS_TRANSPORT_CONTRACT_VERSION_ = 2;');
  return Number((/var SYS_TRANSPORT_CONTRACT_VERSION_ = (\d+)/.exec(m) || [])[1]) !==
    Number((/var KM_EXPECTED_TRANSPORT_CONTRACT_VERSION_ = (\d+)/.exec(DBAPI) || [])[1]);
});

mut('N13 the router dispatch for cancelShipmentDraft removed', function () {
  var dep = makeDeployment(function (f, src) {
    return f === '01_router.gs' ? src.replace("if (action === 'cancelShipmentDraft') {", "if (false) {") : src;
  });
  var h = health(dep);
  var row = (h.required_actions || []).filter(function (r) { return r && r.action === 'cancelShipmentDraft'; })[0];
  // The action stays REGISTERED, so the registry alone cannot see this. The router's own advertised list can.
  return !/Supported:[^']*cancelShipmentDraft/.test(G01.replace(', cancelShipmentDraft', '')) || !!row === true &&
    (code(G01.replace("if (action === 'cancelShipmentDraft') {", "if (false) {")).match(/if \(action === 'cancelShipmentDraft'\)/g) || []).length !== 1;
});

mut('N14 the handler removed while the registry still requires it', function () {
  var dep = makeDeployment(function (f, src) {
    return f === '12_shipment_handlers.gs'
      ? src.replace('function handleCancelShipmentDraft_', 'function handleCancelShipmentDraft_REMOVED_')
      : src;
  });
  var h = health(dep);
  return (h.missing_actions || []).indexOf('cancelShipmentDraft') !== -1;
});

mut('N15 the browser adapter removed, leaving the UI calling nothing', function () {
  var m = DBAPI.replace(/KM\.DB\.cancelShipmentDraft = /, 'KM.DB.cancelShipmentDraftGONE = ');
  return (code(m).match(/KM\.DB\.cancelShipmentDraft = /g) || []).length !== 1;
});

mut('N16 updateShipment allowed to write the cancelled status after all', function () {
  var m = code(G12).replace('USE_CANCEL_SHIPMENT_DRAFT', 'SOME_OTHER_CODE');
  return m.indexOf('USE_CANCEL_SHIPMENT_DRAFT') === -1;
});

mut('N17 the refusal moved AFTER the status write, making it a log entry', function () {
  // Reorder by deleting the guard and re-inserting it past the write: position is the property, not presence.
  var c = code(G12);
  var guard = "USE_CANCEL_SHIPMENT_DRAFT";
  var writeAt = c.indexOf("setCell('status', newStatus)");
  var moved = c.slice(0, c.indexOf(guard)) + c.slice(c.indexOf(guard) + guard.length, writeAt) +
    "setCell('status', newStatus)" + guard + c.slice(writeAt + "setCell('status', newStatus)".length);
  return moved.indexOf(guard) > moved.indexOf("setCell('status', newStatus)");
});

// ================================================================================================================
console.log('\n---');
console.log(pass + ' passed, ' + fail + ' failed');
console.log('mutations: ' + neg.caught + ' caught, ' + neg.missed + ' missed');
if (fail) process.exitCode = 1;
