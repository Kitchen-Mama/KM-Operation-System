// S8-R4B-1 — FACTORY GUARD READ-TRANSPORT CONTRACT SUITE.
//
// THE DEFECT. `factoryStockGuard.get` is read-only — its reachable handler graph holds no write primitive at
// any depth, every return sets `zero_write: true`, and 63_ registers it as "read only" — and yet it was
// dispatched through `_kmWeeklyCommand_`: POST, a WRITE request id, a 90 s write bound, and a timeout
// reported as "may or may not have been committed" for an action that cannot commit anything. A POST cannot
// survive the /exec 302 either: per the Fetch spec the redirect is re-issued as a GET with the body dropped,
// which is the failure R3B reproduced twice in nine attempts.
//
// WHAT THIS SUITE PROVES
//   A  the action is on the canonical GET read path, both ends, and the POST route is still there
//   B  the request shape is FLAT — the trap that would fail silently rather than loudly
//   C  no write-shaped identity or write-shaped failure wording can reach this action
//   D  the handler, its response and its tables are untouched — transport changed, nothing else
//   E  the release stamps moved exactly as far as they should, and no further
//   F  Factory Inventory is not involved, which R4A corrected and this repair must not re-muddle
//
// NO BROWSER. NO NETWORK. NO PRODUCTION READ. Source text and pure functions.
// TEST_DATA_CLASSIFICATION = SOURCE_TEXT   PRODUCTION_WRITE_AUTHORIZED = NO
//
// Run: node assets/tests/s8-r4b1-factory-guard-read-transport.test.js

'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

var DBAPI_F = 'js/api/operation-system-db-api.js';
var ROUTER_F = 'specs/active/apps-script/01_router.gs';
var GUARD_F = 'specs/active/apps-script/71_api_v1_factory_stock_guard.gs';
var HEALTH_F = 'specs/active/apps-script/63_api_v1_system_health.gs';
var PLAN_F = 'js/pages/shipping-plan.js';
var AL_F = 'tools/s8-fatigue/s8-r3b-read-allowlist.js';

var DBAPI = read(DBAPI_F), ROUTER = read(ROUTER_F), GUARD = read(GUARD_F);
var HEALTH = read(HEALTH_F), PLAN = read(PLAN_F);
var AL = require(path.join(ROOT, AL_F));

var pass = 0, fail = 0, mutants = 0, survived = 0;
function ok(c, l, x) {
  if (c) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + (x === undefined ? '' : '\n  got ' + JSON.stringify(x))); }
}
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(n) { console.log('\n== ' + n + ' =='); }
function anchorMissing(rel, from) {
  var e = new Error('MUTATION ANCHOR NOT FOUND in ' + rel + ': ' + JSON.stringify(from.slice(0, 90)));
  e.anchorMissing = true; return e;
}
function loadMutated(rel, from, to) {
  var src = read(rel);
  if (src.indexOf(from) === -1) throw anchorMissing(rel, from);
  var mod = { exports: {} };
  new Function('module', 'exports', 'require', src.replace(from, to))(mod, mod.exports, require);
  return mod.exports;
}
// A missing anchor FAILS. See the same guard in s8-r3b-…: scoring an unapplied mutation as "caught" lets
// coverage evaporate while the scoreboard stays green, and this round found a mutant that had been doing
// exactly that since the day it was written.
function mut(label, rel, from, to, probe) {
  mutants++;
  var m;
  try { m = loadMutated(rel, from, to); }
  catch (e) {
    if (e && e.anchorMissing) { survived++; fail++; console.error('FAIL MUTANT NOT APPLIED — ' + label + '\n  ' + e.message); return; }
    pass++; console.log('ok   MUTANT CAUGHT — ' + label); return;
  }
  var caught = false;
  try { caught = probe(m) === true; } catch (e2) { caught = true; }
  if (caught) { pass++; console.log('ok   MUTANT CAUGHT — ' + label); }
  else { survived++; fail++; console.error('FAIL MUTANT SURVIVED — ' + label); }
}
// Slice a function body by brace depth.
function body(src, fn) {
  var at = src.indexOf('function ' + fn);
  if (at === -1) return '';
  var open = src.indexOf('{', at), d = 0, i = open;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (d === 0) break; } }
  return src.slice(open, i + 1);
}

// ============================================================================================================
section('A. THE CANONICAL GET READ PATH, BOTH ENDS');
// ============================================================================================================

ok(/'factoryStockGuard\.get':\s*handleFactoryStockGuardGet_/.test(ROUTER),
   'A1 the router serves it from the GET read table');
var getTable = body(ROUTER, 'rtrGetReadHandlers_');
ok(getTable.indexOf("'factoryStockGuard.get'") !== -1, 'A2 …inside rtrGetReadHandlers_, not merely somewhere in the file');
ok(/'factoryStockGuard\.get':\s*1/.test(DBAPI), 'A3 the client lists it in _KM_GET_READ_ACTIONS_');

// The POST route STAYS. Every other GET-routed read in this router is reachable on both verbs; removing
// this one's POST branch would make it the odd action out, and would break an assertion in the Factory
// Guard suite that is still telling the truth.
ok(ROUTER.indexOf("if (action === 'factoryStockGuard.get')") !== -1,
   'A4 the POST route is still present — repository precedent is that a GET-routed read keeps both');
['inventoryReplenishmentGap.get', 'orderPlanningGap.get', 'gapJob.status.get', 'skuDetails.workspace.get']
  .forEach(function (a) {
    ok(getTable.indexOf("'" + a + "'") !== -1 && ROUTER.indexOf("action === '" + a + "'") !== -1,
       'A5 precedent: ' + a + ' is on BOTH the GET read table and the POST chain');
  });

// ============================================================================================================
section('B. THE REQUEST SHAPE IS FLAT — THE TRAP THAT FAILS SILENTLY');
// ============================================================================================================
// Wrapping the payload would not throw. shipping_plan_id would land under `payload`, where
// handleFactoryStockGuardGet_ never looks; planId would be empty; the handler would take its NO-PLAN
// branch; the response would carry no `guard_available`; and the UI would print "could not be read".
// A wrong request wearing a failure's clothes.

ok(DBAPI.indexOf("_kmGapRead_('factoryStockGuard.get', payload || {})") !== -1,
   'B1 the caller passes the payload FLAT to _kmGapRead_');
ok(DBAPI.indexOf("_kmGapRead_('factoryStockGuard.get', { payload:") === -1,
   'B2 …and never wraps it in a payload envelope');
ok(DBAPI.indexOf("_kmWeeklyCommand_('factoryStockGuard.get'") === -1,
   'B3 the write dispatcher no longer carries it');

ok(/fsgStr_\(body\.shipping_plan_id\)/.test(GUARD),
   'B4 the handler reads shipping_plan_id at the TOP LEVEL of the body — the fact that makes B1 load-bearing');
var dto = AL.buildDto('factoryStockGuard.get', 'REQ-G000001', { shipping_plan_id: 'SP-TEST' });
eq(dto.shipping_plan_id, 'SP-TEST', 'B5 the modelled DTO carries the plan id at the top level');
ok(!Object.prototype.hasOwnProperty.call(dto, 'payload'), 'B6 and carries no payload envelope', Object.keys(dto));
eq(dto.action, 'factoryStockGuard.get', 'B7 with the unchanged action name');
ok(/^REQ-G/.test(dto.requestId), 'B8 and a READ request id', dto.requestId);

// The plan branch is what the product uses, and it is the only branch that answers with guard_available.
ok(/if \(planId\) \{[\s\S]{0,200}?fsgEvaluatePlanOverage_\(ss, planId\)/.test(GUARD),
   'B9 a non-empty planId selects fsgEvaluatePlanOverage_');
ok(/fsgReadInventoryFacts_\(ss, \{ selfPlanId: planId \}\)/.test(GUARD),
   'B10 …which reads with selfPlanId, not the no-plan branch');
ok(/ev\.guard_available = true;/.test(GUARD),
   'B11 and ONLY that branch sets guard_available, which is the field the UI tests');
ok(PLAN.indexOf('d.guard_available !== true') !== -1, 'B12 …and the UI does test it');
ok(PLAN.indexOf('factoryStockGuardGet({ shipping_plan_id: planId })') !== -1,
   'B13 the shipped caller always passes a plan id, so the plan branch is the shipped path');

// ============================================================================================================
section('C. NO WRITE IDENTITY AND NO WRITE-OUTCOME WORDING CAN REACH IT');
// ============================================================================================================

var gapBody = body(DBAPI, '_kmGapRead_');
ok(gapBody.indexOf('_kmNextWriteRequestId_') === -1, 'C1 the read dispatcher never mints a write request id');
ok(gapBody.indexOf('_kmMutationShape_') === -1, 'C2 …and never builds a mutation shape');
ok(gapBody.indexOf("_kmNextReadRequestId_") !== -1, 'C3 it mints a READ request id');
ok(gapBody.indexOf("_kmFetchBounded_(url, init, 'read')") !== -1,
   'C4 and bounds the request as a READ — 45 s, not the 90 s write bound');
ok(gapBody.indexOf("_kmTimeoutError_(action, 'read'") !== -1, 'C5 a timeout is classified as a read timeout');
ok(gapBody.indexOf("'write'") === -1, 'C6 the string "write" as a kind never appears in the read dispatcher');

// The canonical read timeout, from the shared helper — no new vocabulary was invented for this repair.
var toBody = body(DBAPI, '_kmTimeoutError_');
ok(/kind === 'write'/.test(toBody), 'C7 the shared helper still branches on kind');
ok(toBody.indexOf('REQUEST_TIMEOUT_WRITE_INDETERMINATE') !== -1,
   'C8 …and still has write-indeterminate wording for actions that really can write');
ok(/may or may not have been committed/.test(toBody),
   'C9 that wording exists in exactly one place, behind the write branch');
// The point: the guard can no longer reach it.
ok(DBAPI.indexOf("_kmWeeklyCommand_('factoryStockGuard.get'") === -1 &&
   DBAPI.indexOf("_kmGapRead_('factoryStockGuard.get'") !== -1,
   'C10 THE GUARD CANNOT REACH THE WRITE BRANCH — its only dispatcher hard-codes kind "read"');

// ============================================================================================================
section('D. HANDLER, RESPONSE AND TABLES ARE UNTOUCHED');
// ============================================================================================================
// Transport changed. If anything else changed, the repair exceeded its boundary.

ok(/function handleFactoryStockGuardGet_\(body\)/.test(GUARD), 'D1 the handler signature is unchanged');
eq((GUARD.match(/zero_write: true/g) || []).length >= 3, true, 'D2 every return still declares zero_write: true');
var reads = (GUARD.match(/read\('([a-z_]+)'\)/g) || []).map(function (s) { return s.replace(/read\('|'\)/g, ''); });
eq(reads, ['warehouses', 'factory_stock', 'shipping_allocation_drafts', 'shipping_allocation_draft_lines',
           'shipping_plans', 'shipping_plan_lines', 'marketplaces'],
   'D3 the SEVEN approved tables, in the same order, and no eighth');
['setValue(', 'setValues(', 'appendRow(', 'insertSheet(', 'deleteRow(', 'clearContent',
 'setProperty(', 'DriveApp', 'newTrigger(', 'LockService', 'CacheService'].forEach(function (w) {
  ok(body(GUARD, 'fsgReadInventoryFacts_').indexOf(w) === -1 &&
     body(GUARD, 'handleFactoryStockGuardGet_').indexOf(w) === -1,
     'D4 no ' + w.replace('(', '') + ' on the read path');
});
ok(GUARD.indexOf('FSG_OVERRIDE_AUDIT_TABLE_') !== -1 &&
   body(GUARD, 'handleFactoryStockGuardGet_').indexOf('FSG_OVERRIDE_AUDIT_TABLE_') === -1,
   'D5 the override-audit table exists in the file but is NOT reachable from the GET handler');

// ============================================================================================================
section('E. THE STAMPS MOVED EXACTLY AS FAR AS THEY SHOULD');
// ============================================================================================================

var rtrDecl = (ROUTER.match(/var RTR_BUILD_VERSION_ = '([^']+)'/) || [])[1];
var rtrExpect = (HEALTH.match(/\{ file: '01_router\.gs',[^}]*expected: '([^']+)'/) || [])[1];
eq(rtrDecl, rtrExpect, 'E1 the router stamp and the health mirror agree — they must move in ONE commit');
// S8-R4B-1A - RE-AIMED FROM R40 TO R41, AND THE REASON IS THE ASSERTION BELOW IT. The repair first
// stamped the router R40, which is coherent only if you read a stamp as "the newest id in the tree". R40
// was already CUT, against a tree whose owner set is 63_ alone and which deliberately carries 01_ at R39 -
// so stamping the router R40 made one id name two different trees, and the release ledger caught it in
// three places. R41 is the release this change actually belongs to.
var R41_ID = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R41';
var RO_ORDER = require('./_release-order.js').OWNER_STAMPS;
eq(rtrDecl, R41_ID,
   'E2 the router stamp advanced to R41, because 01_router.gs changed');
var headRelease = (HEALTH.match(/var SYS_DEPLOYMENT_RELEASE_ = '([^']+)'/) || [])[1];
// S8-R4B-2D - E2a WAS A CLAIM ABOUT R4B-1, WRITTEN AS A CLAIM ABOUT EVERY RELEASE AFTER IT. "the router
// stamp equals the HEAD release" is what OWNERSHIP looks like, and it was true for exactly as long as 01_
// was the newest release's owner. R42 changes 60_ and moves no route, so the router is CARRIED now - and
// a stamp that equals the head release while the file has not changed is the marched stamp this whole
// ledger exists to forbid. The claim R4B-1 actually earned is pinned at BOTH ends instead: the router
// declares R41, and R41 was the head release when it did.
eq(rtrDecl, R41_ID,
   'E2a 01_ declares R41 — the round its routing table really changed, which is what a module stamp is');
ok(headRelease === R41_ID || RO_ORDER.indexOf(headRelease) > RO_ORDER.indexOf(R41_ID),
   'E2a1 and the HEAD release is R41 or a LATER one — the router is an owner of R41, carried by whatever '
   + 'follows it, and never marched forward to look current', R41_ID + ' -> ' + headRelease);
ok(headRelease !== 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R40',
   'E2b R40 was NOT reopened to absorb this change - an id that names two trees cannot answer the question '
   + 'it exists for, which is the rule the ledger states against R30, R31 and now R41', headRelease);
var fsgDecl = (GUARD.match(/var FSG_BUILD_VERSION_ = '([^']+)'/) || [])[1];
eq(fsgDecl, 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R5-R1',
   'E3 the Factory Guard stamp did NOT move — 71_ is untouched, and a stamp records the round a FILE changed');
eq(Number((HEALTH.match(/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+)/) || [])[1]), 18,
   'E4 the action-contract version stays at 18: this adds a ROUTE for an existing action, not an action');

// ============================================================================================================
section('F. FACTORY INVENTORY IS NOT INVOLVED');
// ============================================================================================================
// R4A corrected an earlier attribution that named Factory Inventory as a caller. It never was.

var FI = read('js/pages/factory-stock.js');
ok(FI.indexOf('factoryStockGuard') === -1, 'F1 factory-stock.js does not mention the guard action at all');
ok(FI.indexOf('factoryStockGuardGet') === -1, 'F2 …and never calls it');
eq(AL.APPROVED['factoryStockGuard.get'].surface, 'Weekly Shipping Plan guard indicator',
   'F3 the allowlist surface no longer claims Factory Inventory as a caller');
var callers = (DBAPI + PLAN).split('factoryStockGuardGet').length - 1;
ok(callers >= 2, 'F4 the only call sites are the db-api definition and the shipping-plan caller', callers);

// ============================================================================================================
section('MUTANTS');
// ============================================================================================================

mut('the caller is put back on the write dispatcher', DBAPI_F,
  "window.KM.DB.factoryStockGuardGet = function(payload) { return _kmGapRead_('factoryStockGuard.get', payload || {}); };",
  "window.KM.DB.factoryStockGuardGet = function(payload) { return _kmWeeklyCommand_('factoryStockGuard.get', payload || {}); };",
  function () {
    var src = read(DBAPI_F).replace(
      "window.KM.DB.factoryStockGuardGet = function(payload) { return _kmGapRead_('factoryStockGuard.get', payload || {}); };",
      "window.KM.DB.factoryStockGuardGet = function(payload) { return _kmWeeklyCommand_('factoryStockGuard.get', payload || {}); };");
    return src.indexOf("_kmGapRead_('factoryStockGuard.get'") === -1;
  });

mut('the payload is wrapped, burying shipping_plan_id where the handler never looks', AL_F,
  "owner: '71_', verb: 'GET', envelope: 'gapReadFlat',", "owner: '71_', verb: 'GET', envelope: 'gapRead',",
  function (m) {
    var d = m.buildDto('factoryStockGuard.get', 'REQ-G1', { shipping_plan_id: 'SP-1' });
    return d.shipping_plan_id === undefined;
  });

mut('the plan id stops being carried, so every read takes the no-plan branch', AL_F,
  "        var id = (ctx && ctx.shipping_plan_id) || null;", "        var id = null;",
  function (m) {
    return m.buildDto('factoryStockGuard.get', 'REQ-G1', { shipping_plan_id: 'SP-1' }).shipping_plan_id === undefined;
  });

mut('the guard is dropped from the client read registry, so it silently POSTs again', DBAPI_F,
  "    'factoryStockGuard.get': 1", "    'factoryStockGuardX.get': 1",
  function () {
    var src = read(DBAPI_F).replace("    'factoryStockGuard.get': 1", "    'factoryStockGuardX.get': 1");
    return !/'factoryStockGuard\.get':\s*1/.test(src);
  });

mut('the router GET read table loses the action', ROUTER_F,
  "    'factoryStockGuard.get':                       handleFactoryStockGuardGet_",
  "    'factoryStockGuardX.get':                      handleFactoryStockGuardGet_",
  function () {
    var src = read(ROUTER_F).replace(
      "    'factoryStockGuard.get':                       handleFactoryStockGuardGet_",
      "    'factoryStockGuardX.get':                      handleFactoryStockGuardGet_");
    return body(src, 'rtrGetReadHandlers_').indexOf("'factoryStockGuard.get'") === -1;
  });

// The anchor names the ROUTER entry in full. `expected: '…R40'` alone is ambiguous — SYS_BUILD_VERSION_'s
// own entry already carries the same release string and appears first, so a bare replace mutates the wrong
// line and the mutant survives while appearing to test the mirror. Found by this mutant surviving.
var ROUTER_MIRROR = "{ file: '01_router.gs', symbol: 'RTR_BUILD_VERSION_', expected: 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R41'";
mut('the health mirror drifts from the router stamp', HEALTH_F,
  ROUTER_MIRROR, ROUTER_MIRROR.replace('-R41', '-R39'),
  function () {
    var src = read(HEALTH_F).replace(ROUTER_MIRROR, ROUTER_MIRROR.replace('-R41', '-R39'));
    return (src.match(/\{ file: '01_router\.gs',[^}]*expected: '([^']+)'/) || [])[1] !== rtrDecl;
  });

// S8-R4B-1A - THE RELEASE-CUT MUTANTS. Each is a way the R41 cut could be half-done and still look right.
mut('the router stamp is not rotated with the file it belongs to', ROUTER_F,
  "var RTR_BUILD_VERSION_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R41';",
  "var RTR_BUILD_VERSION_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R40';",
  function () {
    var src = read(ROUTER_F).replace("-R7-R41';", "-R7-R40';");
    return (src.match(/var RTR_BUILD_VERSION_ = '([^']+)'/) || [])[1] !== headRelease;
  });
// S8-R4B-2D - ANCHORED ON THE DECLARED HEAD RELEASE, NOT ON A LITERAL. The literal R41 stopped existing
// in 63_ the moment R42 was cut, and a mutant whose target is absent injects no fault at all - it reports
// a passing grade for a tree it never changed. The fault is the same one either way: the release moves and
// 63_'s own build stamp is left behind.
var _HEALTH_BUILD_LINE = "var SYS_BUILD_VERSION_ = '" + headRelease + "';";
mut('the release is cut but 63_ keeps the build stamp of the previous one', HEALTH_F,
  _HEALTH_BUILD_LINE, "var SYS_BUILD_VERSION_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R1';",
  function () {
    var src = read(HEALTH_F).replace(_HEALTH_BUILD_LINE,
      "var SYS_BUILD_VERSION_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R1';");
    var own = (src.match(/\{ file: '63_api_v1_system_health\.gs',[^}]*expected: '([^']+)'/) || [])[1];
    return (src.match(/var SYS_BUILD_VERSION_ = '([^']+)'/) || [])[1] !== own;
  });
mut('the action-contract version is bumped because the router changed', HEALTH_F,
  'var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = 18;',
  'var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = 19;',
  function () {
    var src = read(HEALTH_F).replace('var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = 18;',
      'var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = 19;');
    return Number((src.match(/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+)/) || [])[1]) !== 18;
  });
mut('71_ is stamped R41 to make the release look complete, though it never changed', GUARD_F,
  "var FSG_BUILD_VERSION_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R5-R1';",
  "var FSG_BUILD_VERSION_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R41';",
  function () {
    var src = read(GUARD_F).replace("-R7-R5-R1';", "-R7-R41';");
    return (src.match(/var FSG_BUILD_VERSION_ = '([^']+)'/) || [])[1] !== 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R5-R1';
  });

// ============================================================================================================
console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILURES') + ' — ' + pass + ' passed, ' + fail + ' failed, '
  + mutants + ' mutants, ' + survived + ' survived');
if (fail !== 0) process.exitCode = 1;
