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
eval('function _resolveErrs(serverEnv){ ' + slice + ' return _outErrs; }');
// 1. errors[] present → surfaced verbatim (byte-compatible with prior behavior)
eq(_resolveErrs({ success: false, errors: [{ code: 'IR_SCHEMA_MISSING', message: 'x', details: null }] }),
   [{ code: 'IR_SCHEMA_MISSING', message: 'x', details: null }], 'errors[] preferred + surfaced verbatim');
// 2. no errors[] but string error → BACKEND_ERROR carrying the message (previously DROPPED → generic)
eq(_resolveErrs({ success: false, error: 'Invalid POST action. Supported: ...' }),
   [{ code: 'BACKEND_ERROR', message: 'Invalid POST action. Supported: ...', details: null }], 'string-form router error → BACKEND_ERROR (real message no longer masked)');
eq(_resolveErrs({ success: false, error: 'handleFoo_ is not defined' }),
   [{ code: 'BACKEND_ERROR', message: 'handleFoo_ is not defined', details: null }], 'ReferenceError-style string surfaced as BACKEND_ERROR');
// 3. neither → generic WORKSPACE_ERROR (unchanged fallback)
eq(_resolveErrs({ success: false }),
   [{ code: 'WORKSPACE_ERROR', message: 'workspace returned failure', details: null }], 'no errors[]/error → generic WORKSPACE_ERROR (unchanged)');
eq(_resolveErrs({ success: false, error: '   ' }),
   [{ code: 'WORKSPACE_ERROR', message: 'workspace returned failure', details: null }], 'blank string error → generic (not BACKEND_ERROR)');
eq(_resolveErrs({ success: false, errors: [] }),
   [{ code: 'WORKSPACE_ERROR', message: 'workspace returned failure', details: null }], 'empty errors[] → generic (unchanged)');
// errors[] wins even if a string error is also present (precedence)
eq(_resolveErrs({ success: false, errors: [{ code: 'A', message: 'a' }], error: 'ignored' }),
   [{ code: 'A', message: 'a' }], 'errors[] takes precedence over a co-present string error');

// ===================================================================================================================
console.log('\n== success envelope unchanged ==');
ok(/return \{ success: true, data: \(serverEnv\.data === undefined \? null : serverEnv\.data\), meta: outMeta, errors: \[\] \};/.test(FND), 'success path returns { success:true, data, meta, errors:[] } — unchanged');

console.log('\n' + (fail ? ('✗ ' + fail + ' FAILED, ') : '✓ ') + pass + ' passed');
if (fail) process.exitCode = 1;
