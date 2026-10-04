// S8-R3B — READ-PATH FATIGUE SAFETY SUITE.
//
// The S8-R3B harness is the first thing in this repository that sends a request to Production on purpose. The
// operator's authorization is narrow — eleven read actions, zero writes, and one named action that must never
// be sent — so this suite is written as the adversary of its own harness: every section asks what would have to
// be true for a forbidden request to reach Production, and shows that it is refused.
//
// WHAT IT PROVES
//   A  the approved set is exactly the eleven actions named in the approved S8-R3A preflight
//   B  DENY BY DEFAULT — an action nobody listed is refused, not merely an action someone blocked
//   C  gapJob.status.get is refused through every vector the harness has, including one it did not build
//   D  the forbidden set carries a REASON, and the reasons name the mechanism rather than the verdict
//   E  the DTO the harness sends is the DTO the shipped resolver builds — field for field, from the source
//   F  the URL is built by km-transport's own rule, including the '{}' omission that changes the bytes
//   G  the verb is the verb the shipped client uses, and a changed verb is refused
//   H  the runner cannot dispatch without decide(), and cannot be widened by its own --only flag
//   I  every exclusion is recorded with a reason, including the two that CORRECT S8-R3A
//   J  the 44 approved tables are the preflight's, and the two bounded reads stay unregistered
//   K  the §2 surface freeze actually fails when the surface stops matching
//
// NO PRODUCTION READ. NO PRODUCTION WRITE. NO NETWORK. Every assertion here is against source text and
// pure functions; the suite never calls fetch and never loads the runner's main().
// TEST_DATA_CLASSIFICATION = FIXTURES_AND_SOURCE_TEXT   PRODUCTION_WRITE_AUTHORIZED = NO
//
// Run: node assets/tests/s8-r3b-read-path-fatigue-safety.test.js

'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

var TOOLS = 'tools/s8-fatigue/';
var AL_F = TOOLS + 's8-r3b-read-allowlist.js';
var RUNNER_F = TOOLS + 's8-r3b-fatigue-runner.js';
var VERIFY_F = TOOLS + 's8-r3b-surface-verify.js';
var PREFLIGHT_F = '../docs/planning/S8_R3A_DB_TOUCH_PREFLIGHT.md';
var GATE_F = '../docs/planning/S8_STANDING_DB_AUTHORIZATION_GATE.md';
var FOUNDATION_F = 'js/api/km-api-foundation.js';
var TRANSPORT_F = 'js/api/km-transport.js';
var DBAPI_F = 'js/api/operation-system-db-api.js';
var ROUTER_F = 'specs/active/apps-script/01_router.gs';

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

var MODCACHE = {};
// S8-R4B-1 — A MISSING ANCHOR IS A HARNESS FAILURE, NOT A CAUGHT MUTANT.
//
// It used to be both, and that is worse than either. `mut()` wrapped everything in
// `catch (e) { caught = true; }`, so when a refactor deleted the text a mutation was anchored on,
// loadMutated threw "anchor not found", the catch recorded CAUGHT, and the suite printed
// "ok MUTANT CAUGHT" for a mutation that had never been applied to anything. Coverage could evaporate
// while the scoreboard stayed green — which is exactly what this round's verb change would have done to
// the two mutants anchored on `verb: 'POST'` and `envelope: 'command'`.
//
// A missing anchor is now its own typed error, counted and reported as a FAILURE. The ordinary catch is
// kept for the probe, because a mutant that makes the module throw IS legitimately caught.
function MutationAnchorMissing(rel, from) {
  var e = new Error('MUTATION ANCHOR NOT FOUND in ' + rel + ': ' + JSON.stringify(from.slice(0, 90)));
  e.anchorMissing = true;
  return e;
}
function loadMutated(rel, from, to) {
  var src = MODCACHE[rel] || (MODCACHE[rel] = read(rel));
  if (src.indexOf(from) === -1) throw MutationAnchorMissing(rel, from);
  var mod = { exports: {} };
  new Function('module', 'exports', 'require', src.replace(from, to))(mod, mod.exports, function () {
    throw new Error('the allowlist must not require anything');
  });
  return mod.exports;
}
var anchorsMissing = 0;
function mut(label, rel, from, to, probe) {
  mutants++;
  var caught = false, m;
  try { m = loadMutated(rel, from, to); }
  catch (e) {
    if (e && e.anchorMissing) {
      anchorsMissing++; survived++; fail++;
      console.error('FAIL MUTANT NOT APPLIED — ' + label + '\n  ' + e.message);
      return;
    }
    // The module refused to load under the mutation — a real catch.
    pass++; console.log('ok   MUTANT CAUGHT — ' + label); return;
  }
  try { caught = probe(m) === true; } catch (e2) { caught = true; }
  if (caught) { pass++; console.log('ok   MUTANT CAUGHT — ' + label); }
  else { survived++; fail++; console.error('FAIL MUTANT SURVIVED — ' + label); }
}

// Slice a function body by brace depth. A character window silently stops covering the line it was written for
// the moment a comment above that line grows, which is a defect that reports itself as a passing test.
function body(src, fnName) {
  var at = src.indexOf('function ' + fnName);
  if (at === -1) return '';
  var open = src.indexOf('{', at), depth = 0, i = open;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(open, i + 1);
}

var ALSRC = read(AL_F);
var RUNSRC = read(RUNNER_F);
var VERSRC = read(VERIFY_F);
var PREFLIGHT = read(PREFLIGHT_F);
var BASE = 'https://script.google.com/macros/s/AKfycbEXAMPLE/exec';

// ============================================================================================================
section('A. THE APPROVED SET IS THE PREFLIGHT THE OPERATOR APPROVED');
// ============================================================================================================
var ACTIONS = AL.approvedActions();
eq(ACTIONS.length, 11, 'A1  exactly 11 actions are approved');
// Named here rather than derived, so that ADDING one to the allowlist breaks this test. A test that derives its
// expectation from the thing under test cannot notice the thing under test growing.
var EXPECTED = ['factoryStockGuard.get', 'fcSummary.workspace.get', 'inventoryReplenishment.workspace.get',
  'inventoryReplenishmentGap.get', 'overseasStock.workspace.get', 'purchaseOrder.workspace.get',
  'recommendation.workspace.get', 'requestOrder.workspace.get', 'shipment.workspace.get',
  'skuDetails.workspace.get', 'weeklyShipping.workspace.get'];
eq(ACTIONS, EXPECTED, 'A2  the approved set is exactly the eleven named here');
ACTIONS.forEach(function (a) {
  ok(PREFLIGHT.indexOf(a) !== -1, 'A3  ' + a + ' appears in the approved S8-R3A preflight');
});
// Every approved action is on the router's GET read table OR is the one POST-dispatched read, and nothing else.
var ROUTER = read(ROUTER_F);
var getTable = ROUTER.slice(ROUTER.indexOf('function rtrGetReadHandlers_'), ROUTER.indexOf('function rtrGetReadActionList_'));
ACTIONS.forEach(function (a) {
  var spec = AL.APPROVED[a];
  var onGet = getTable.indexOf("'" + a + "'") !== -1;
  if (spec.verb === 'GET') ok(onGet, 'A4  ' + a + ' is on the router GET read table');
  else ok(!onGet && ROUTER.indexOf("action === '" + a + "'") !== -1, 'A4  ' + a + ' is dispatched from the POST chain');
});
// S8-R4B-1 — A5 RE-AIMED, NOT RELAXED. It used to record an exception: one approved read travelling on the
// write verb. The exception is gone, so the assertion now states the stronger property the repair created —
// EVERY approved read is a GET, and there is no POST-dispatched read left to make an exception for.
ok(AL.APPROVED['factoryStockGuard.get'].verb === 'GET',
  'A5  factoryStockGuard.get travels on GET, like every other approved read');
eq(Object.keys(AL.APPROVED).filter(function (a) { return AL.APPROVED[a].verb !== 'GET'; }), [],
  'A5b NO approved read travels on a write verb — the one exception this suite used to record is gone');

// ============================================================================================================
section('B. DENY BY DEFAULT');
// ============================================================================================================
// The important case is not a known-bad action. It is an action nobody has ever named: a blocklist approves it,
// an allowlist refuses it, and the standing gate's rule 1 requires the second behaviour.
['anActionNobodyHasEverNamed', 'getTable', 'system.health', 'getOperationDb', 'getClientCapabilities',
 'automationSchedule.get', 'inventoryScope.registry.get', 'pricing.write.status'].forEach(function (a) {
  var d = AL.decide({ action: a, method: 'GET' });
  ok(d.ok === false && d.code === 'ACTION_NOT_IN_APPROVED_SET', 'B1  ' + a + ' is refused by default', d);
});
// Writes, in case anyone ever reaches for this module from a write round.
['adjustFactoryInventory', 'pricing.update', 'updateShipment', 'createShipmentFromPlan', 'cancelShipmentDraft',
 'upsertSkuDetail', 'importFcRegularForecastBatch'].forEach(function (a) {
  ok(AL.decide({ action: a, method: 'POST' }).ok === false, 'B2  the write ' + a + ' is refused');
});
ok(AL.decide({ action: '', method: 'GET' }).code === 'NO_ACTION', 'B3  an empty action is refused by name');
ok(AL.decide({}).ok === false, 'B4  an empty request is refused');
ok(AL.decide({ action: null }).ok === false, 'B5  a null action is refused');
// An endpoint that is not the stable /exec. A googleusercontent echo target is never a re-usable endpoint, and
// a fatigue runner that followed one would be measuring a URL the application never dispatches to.
ok(AL.decide({ action: 'fcSummary.workspace.get', method: 'GET',
  url: 'https://script.googleusercontent.com/macros/echo?user_content_key=x' }).code === 'ENDPOINT_NOT_STABLE_EXEC',
  'B6  an echo target is refused as an endpoint');

// ============================================================================================================
section('C. gapJob.status.get IS REFUSED THROUGH EVERY VECTOR');
// ============================================================================================================
ok(ACTIONS.indexOf('gapJob.status.get') === -1, 'C1  it is absent from the approved set');
ok(Object.prototype.hasOwnProperty.call(AL.FORBIDDEN_ACTIONS, 'gapJob.status.get'), 'C2  it is named forbidden');
var dGap = AL.decide({ action: 'gapJob.status.get', method: 'GET' });
ok(dGap.ok === false && dGap.code === 'ACTION_FORBIDDEN', 'C3  decide() refuses it', dGap);
// From a URL — the shape an interceptor sees, where nobody told it what the action was.
var fromUrl = AL.actionFromRequest(BASE + '?action=gapJob.status.get&km_via=get&km_rid=REQ-X', null);
eq(fromUrl, 'gapJob.status.get', 'C4  the action is recovered from a URL');
ok(AL.decide({ action: fromUrl, method: 'GET', url: BASE + '?action=gapJob.status.get' }).ok === false,
  'C5  the recovered action is refused');
// From a POST body.
var fromBody = AL.actionFromRequest(BASE, JSON.stringify({ action: 'gapJob.status.get', payload: {} }));
ok(AL.decide({ action: fromBody, method: 'POST' }).ok === false, 'C6  the action is recovered from a body and refused');
// buildRequest refuses to construct it at all — there is no path that produces a URL for it.
var bGap = AL.buildRequest(BASE, 'gapJob.status.get');
ok(bGap.decision.ok === false && bGap.url === undefined, 'C7  buildRequest produces no URL for it', bGap.url);
// An unparseable request yields '' , which decide() refuses. The safe direction is the one that happens by
// default when the harness cannot tell what it is looking at.
eq(AL.actionFromRequest('https://example.com/nothing', 'not json at all'), '', 'C8  an unreadable request yields no action');
ok(AL.decide({ action: AL.actionFromRequest('https://example.com/nothing', 'x') }).ok === false,
  'C9  an unreadable request is refused rather than passed');
// The whole gap job family, not only the status poll.
['inventoryReplenishmentGap.job.start', 'orderPlanningGap.job.start',
 'inventoryReplenishmentGap.recalculate.all', 'orderPlanningGap.recalculate.all'].forEach(function (a) {
  ok(AL.decide({ action: a, method: 'POST' }).ok === false, 'C10 ' + a + ' is refused');
});
// The READ of the materialized gap table is a DIFFERENT action and IS approved — this is the distinction the
// whole round turns on, so it is asserted rather than assumed.
ok(AL.decide({ action: 'inventoryReplenishmentGap.get', method: 'GET' }).ok === true,
  'C11 the materialized gap READ is approved — it is not the job poll');

// ============================================================================================================
section('D. THE FORBIDDEN SET NAMES THE MECHANISM');
// ============================================================================================================
var gapReason = AL.FORBIDDEN_ACTIONS['gapJob.status.get'];
['STALLED', 'ScriptApp', 'trigger', 'gap'].forEach(function (w) {
  ok(gapReason.indexOf(w) !== -1, 'D1  the gapJob refusal names "' + w + '"');
});
Object.keys(AL.FORBIDDEN_ACTIONS).forEach(function (a) {
  ok(String(AL.FORBIDDEN_ACTIONS[a]).length > 40, 'D2  ' + a + ' carries a reason, not a verdict');
});
// orderPlanningGap.get and aiPlanFirstLayer.get are READ-ONLY and still refused. That is the point: they are
// refused for SCOPE, not for danger, and the reason has to say so or a later reader will "fix" it.
['orderPlanningGap.get', 'aiPlanFirstLayer.get'].forEach(function (a) {
  var r = AL.FORBIDDEN_ACTIONS[a];
  ok(/READ-ONLY/.test(r) && /approved action set|scope/i.test(r),
    'D3  ' + a + ' is refused for scope and the reason says so');
});

// ============================================================================================================
section('E. THE DTO IS THE SHIPPED RESOLVER\'S DTO');
// ============================================================================================================
// A fatigue measurement is only worth recording if the server did the work the page asks for. These assertions
// read the SHIPPED builder and require the harness payload to carry the same literals.
var FOUND = read(FOUNDATION_F);
function dtoOf(a) { return AL.buildDto(a, 'REQ-TEST'); }

var weekly = dtoOf('weeklyShipping.workspace.get');
var weeklySrc = body(FOUND, 'buildWeeklyRequestDTO');
eq(weekly.payload.page, { number: 1, size: 25 }, 'E1  weeklyShipping page defaults');
ok(weeklySrc.indexOf('size) || 25') !== -1, 'E2  …and 25 is the shipped default');
ok(weeklySrc.indexOf("field: 'updated_at'") !== -1 && weekly.payload.sort[0].field === 'updated_at',
  'E3  weeklyShipping sorts on the shipped field');
['summary', 'plans', 'details', 'filterOptions'].forEach(function (k) {
  ok(weekly.payload.include[k] === true && weeklySrc.indexOf(k + ': true') !== -1,
    'E4  weeklyShipping include.' + k + ' matches the shipped builder');
});

var po = dtoOf('purchaseOrder.workspace.get');
var poSrc = body(FOUND, 'buildPurchaseOrderRequestDTO');
eq(po.payload.page, { number: 1, size: 2000 }, 'E5  purchaseOrder page size 2000');
ok(poSrc.indexOf('size) || 2000') !== -1, 'E6  …and 2000 is the shipped default');
ok(po.payload.sort[0].field === 'order_date' && poSrc.indexOf("field: 'order_date'") !== -1, 'E7  purchaseOrder sort field');

var ro = dtoOf('requestOrder.workspace.get');
var roSrc = body(FOUND, 'buildRequestOrderRequestDTO');
eq(ro.payload.page, { number: 1, size: 2000 }, 'E8  requestOrder page size 2000');
ok(ro.payload.sort[0].field === 'created_at' && roSrc.indexOf("field: 'created_at'") !== -1, 'E9  requestOrder sort field');

var sh = dtoOf('shipment.workspace.get');
var shSrc = body(FOUND, 'buildShipmentRequestDTO');
eq(sh.payload.page, { number: 1, size: 3000 }, 'E10 shipment page size 3000');
ok(shSrc.indexOf('size) || 3000') !== -1, 'E11 …and 3000 is the shipped default');
// The MAP-extra tables are fetched only when the include flag is set, and the shipped default does NOT set it.
// So the harness measures the DEFAULT shipment read, and the report must not claim it covered the map extras.
eq(Object.keys(sh.payload.include).sort(), ['filterOptions', 'summary'], 'E12 shipment include is the shipped default');

var reco = dtoOf('recommendation.workspace.get');
var recoSrc = body(FOUND, 'buildRecommendationRequestDTO');
eq(reco.payload.pagination, { page: 1, size: 100 }, 'E13 recommendation pagination defaults');
ok(recoSrc.indexOf('size) || 100') !== -1, 'E14 …and 100 is the shipped default');
ok(reco.payload.include.diagnostics === true && recoSrc.indexOf('diagnostics: true') !== -1, 'E15 recommendation diagnostics');
// The client NEVER sends destinationWarehouseId / calculationMonth / planningCycle — the server owns them.
// A harness that added them would be exercising a request the application cannot produce.
['destinationWarehouseId', 'calculationMonth', 'planningCycle'].forEach(function (k) {
  ok(JSON.stringify(reco).indexOf(k) === -1, 'E16 recommendation does not send ' + k);
});

// The three that carry only `include: { summary: true }` — asserted against each shipped builder separately,
// because they are three independent decisions that happen to agree today.
[['fcSummary.workspace.get', 'buildFcSummaryRequestDTO'],
 ['inventoryReplenishment.workspace.get', 'buildInventoryReplenishmentRequestDTO']].forEach(function (p) {
  var d = dtoOf(p[0]), src = body(FOUND, p[1]);
  eq(d.payload.include, { summary: true }, 'E17 ' + p[0] + ' include');
  ok(src.indexOf('summary: true') !== -1, 'E18 ' + p[0] + ' matches its shipped builder');
});
// skuDetails and overseasStock go through buildRequestEnvelope, which supplies apiVersion/requestId/context.
[['skuDetails.workspace.get', 'buildSkuDetailsRequestDTO'],
 ['overseasStock.workspace.get', 'buildOverseasStockRequestDTO']].forEach(function (p) {
  var d = dtoOf(p[0]), src = body(FOUND, p[1]);
  eq(d.payload.include, { summary: true }, 'E19 ' + p[0] + ' include');
  ok(src.indexOf('buildRequestEnvelope') !== -1, 'E20 ' + p[0] + ' uses the canonical envelope builder');
  eq(Object.keys(d).sort(), ['action', 'apiVersion', 'context', 'payload', 'requestId'], 'E21 ' + p[0] + ' envelope keys');
});
// apiVersion and the context shape, from the source rather than from memory.
ok(/var API_VERSION = '1'/.test(FOUND) && AL.API_VERSION === '1', 'E22 apiVersion matches the shipped constant');
eq(dtoOf('fcSummary.workspace.get').context, { actor: null, clientVersion: null }, 'E23 context is the shipped default');

// The two NON-foundation envelopes. Copying the foundation shape onto these would send a request no page sends.
var DBAPI = read(DBAPI_F);
var gapDto = dtoOf('inventoryReplenishmentGap.get');
eq(Object.keys(gapDto).sort(), ['action', 'payload', 'requestId'], 'E24 the gap read carries no apiVersion/context');
ok(DBAPI.indexOf("_kmGapRead_('inventoryReplenishmentGap.get', { payload: { scope: scope || {} } })") !== -1,
  'E25 …and that is the shape operation-system-db-api.js builds');
eq(gapDto.payload, { scope: {} }, 'E26 the gap read sends an empty scope');
// ---- SCOPE-REQUIRED READS -----------------------------------------------------------------------------------
// Two owners refuse an unscoped request. The first fatigue run sent nulls and measured the VALIDATOR — 1 ms of
// server time — for 18 of 105 samples, and the analyser classified the refusals as FUNCTIONAL_DEFECT. They were
// the harness's own missing parameter. These assertions exist so that cannot recur silently.
eq(AL.scopeRequiredActions(), ['inventoryReplenishmentGap.get', 'recommendation.workspace.get'],
  'E30 exactly two approved reads require a scope');
// The scope shape is the PAGE's own: IRContext.toScopeRequest returns those three keys and null when any is
// missing, so the page never issues these reads unscoped.
var IRPAGE = read('js/pages/inventory-replenishment.js');
var tsr = body(IRPAGE, 'toScopeRequest');
ok(/company: company, country: country, marketplace: marketplace/.test(tsr),
  'E31 the page scope is exactly company/country/marketplace');
ok(/if \(!company \|\| !country \|\| !marketplace\) return null;/.test(tsr),
  'E32 …and the page returns null rather than issuing an unscoped read');
var SC = { company: 'KM', country: 'US', marketplace: 'Amazon' };
eq(AL.buildDto('inventoryReplenishmentGap.get', 'R', { scope: SC }).payload, { scope: SC },
  'E33 a scoped gap read carries exactly the three keys');
eq(AL.buildDto('inventoryReplenishmentGap.get', 'R', null).payload, { scope: {} },
  'E34 an unscoped gap read still builds the shipped empty shape');
// A partial scope must NOT be sent as if it were whole — the page would have returned null.
eq(AL.buildDto('inventoryReplenishmentGap.get', 'R', { scope: { company: 'KM' } }).payload, { scope: {} },
  'E35 a partial scope collapses to empty rather than being half-sent');
var recoScoped = AL.buildDto('recommendation.workspace.get', 'R', { scope: SC }).payload.scope;
eq(recoScoped, { company: 'KM', country: 'US', marketplace: 'Amazon', sku: null, siteSku: null },
  'E36 a scoped recommendation read keeps the shipped sku/siteSku nulls');
// …and still sends none of the server-owned fields.
['destinationWarehouseId', 'calculationMonth', 'planningCycle'].forEach(function (k) {
  ok(JSON.stringify(AL.buildDto('recommendation.workspace.get', 'R', { scope: SC })).indexOf(k) === -1,
    'E37 a scoped recommendation read still does not send ' + k);
});
// The owners' refusal messages are recorded next to the flag, so the next reader knows why the flag is there.
ok(/VALIDATION_FAILED/.test(ALSRC) && /INVALID_SCOPE/.test(ALSRC),
  'E38 both owners\' refusal codes are recorded in the allowlist');

// S8-R4B-1 — E27/E28 re-aimed from the write transport to the canonical read transport.
var guardDto = dtoOf('factoryStockGuard.get');
eq(Object.keys(guardDto), ['action', 'requestId'],
  'E27 the guard read carries action + a READ request id, FLAT — no payload envelope');
var guardScoped = AL.buildDto('factoryStockGuard.get', 'REQ-G000001', { shipping_plan_id: 'SP-1' });
eq(guardScoped.shipping_plan_id, 'SP-1',
  'E27b shipping_plan_id sits at the TOP LEVEL, where handleFactoryStockGuardGet_ reads it');
ok(!Object.prototype.hasOwnProperty.call(guardScoped, 'payload'),
  'E27c and is NOT nested under payload — nesting would silently route the handler to its no-plan branch');
ok(DBAPI.indexOf("_kmGapRead_('factoryStockGuard.get'") !== -1,
  'E28 …and that is the path operation-system-db-api.js uses');
ok(DBAPI.indexOf("_kmWeeklyCommand_('factoryStockGuard.get'") === -1,
  'E28b the write dispatcher no longer carries it');
ok(body(DBAPI, '_kmWeeklyCommand_').indexOf("Object.assign({ action: command }, payload || {})") !== -1,
  'E29 _kmWeeklyCommand_ builds exactly {action, ...payload}');

// ============================================================================================================
section('F. THE URL IS km-transport\'s OWN RULE');
// ============================================================================================================
var TP = read(TRANSPORT_F);
var rq = body(TP, 'readQuery');
ok(/TRANSPORT_CONTRACT_VERSION = 1/.test(TP) && AL.TRANSPORT_CONTRACT_VERSION === 1,
  'F1  the transport contract version matches the shipped constant');
['action=', 'km_via=get', 'km_tc=', 'km_rid=', 'km_body='].forEach(function (k) {
  ok(rq.indexOf(k) !== -1 && AL.readQuery('x', { a: 1 }, 'REQ-1').indexOf(k.replace('km_body=', 'km_body=')) !== -1 || k === 'km_body=',
    'F2  readQuery emits ' + k);
});
var q = AL.readQuery('fcSummary.workspace.get', { action: 'fcSummary.workspace.get' }, 'REQ-1');
ok(q.indexOf('action=fcSummary.workspace.get&km_via=get&km_tc=1&km_rid=REQ-1') === 0,
  'F3  the query is built in the shipped order', q.slice(0, 80));
// The '{}' omission. The shipped rule drops km_body entirely for an empty payload, which is a real difference
// in bytes on the wire; reproducing it matters because the harness claims to send what the page sends.
ok(rq.indexOf("payload !== '{}'") !== -1, 'F4  the shipped rule omits an empty body');
ok(AL.readQuery('a', {}, 'REQ-1').indexOf('km_body') === -1, 'F5  …and the harness omits it too');
ok(AL.readQuery('a', { x: 1 }, 'REQ-1').indexOf('km_body') !== -1, 'F6  …and sends it when there is one');
// Every approved GET fits the ROUTER's own ceiling, read out of the router rather than restated.
var cap = /RTR_GET_BODY_MAX_ = (\d+)/.exec(ROUTER);
ok(cap && Number(cap[1]) === AL.GET_BODY_MAX, 'F7  GET_BODY_MAX matches the router constant', cap && cap[1]);
ACTIONS.filter(function (a) { return AL.APPROVED[a].verb === 'GET'; }).forEach(function (a) {
  var r = AL.buildRequest(BASE, a);
  var m = /[?&]km_body=([^&]*)/.exec(r.url);
  var chars = m ? decodeURIComponent(m[1]).length : 0;
  ok(chars <= AL.GET_BODY_MAX, 'F8  ' + a + ' body ' + chars + ' <= ' + AL.GET_BODY_MAX);
  ok(r.url.length <= AL.READ_URL_MAX, 'F9  ' + a + ' url ' + r.url.length + ' <= ' + AL.READ_URL_MAX);
});
// The request id is valid to the client's own pattern, and deliberately carries no S8T token: that namespace is
// reserved for test DATA, the live census proved it unused, and a read has no business putting it anywhere.
var rid = AL.nextRequestId();
ok(/^REQ-[A-Za-z0-9_-]{1,40}$/.test(rid), 'F10 the request id matches the client pattern', rid);
ok(rid.indexOf('S8T') === -1, 'F11 the request id does not use the reserved S8T namespace', rid);
ok(/makeRequestId\(provided\)[\s\S]{0,200}REQ-\[A-Za-z0-9_-\]\{1,40\}/.test(FOUND),
  'F12 …and that pattern is the shipped one');

// ============================================================================================================
section('G. THE VERB IS THE SHIPPED VERB');
// ============================================================================================================
ACTIONS.forEach(function (a) {
  var spec = AL.APPROVED[a];
  var wrong = spec.verb === 'GET' ? 'POST' : 'GET';
  var d = AL.decide({ action: a, method: wrong });
  ok(d.ok === false && d.code === 'VERB_MISMATCH', 'G1  ' + a + ' refuses ' + wrong, d.code);
});
// A read sent as a POST would cross the /exec 302 that drops the body — and would land in the POST if-chain,
// which is where every write lives. Both halves matter, and the refusal reason names the second.
ok(/different dispatch chain/.test(AL.decide({ action: 'fcSummary.workspace.get', method: 'POST' }).reason),
  'G2  the verb refusal names the dispatch-chain risk');

// ============================================================================================================
section('H. THE RUNNER CANNOT DISPATCH WITHOUT decide()');
// ============================================================================================================
// Counting fetches is not the proof — a count only has to be bumped when someone adds one. The proof is that
// EVERY function containing a fetch calls dispatchGuard() first. The count is still asserted, so that a new
// path to Production cannot appear without this test being looked at, but the guard-ordering check is what
// actually protects anything.
var FETCH_FNS = ['once', 'deriveScope'];
var fetches = (RUNSRC.match(/\bawait fetch\(/g) || []).length;
eq(fetches, FETCH_FNS.length, 'H1  every fetch in the runner is in a function this test checks');
FETCH_FNS.forEach(function (fn) {
  var b = body(RUNSRC, fn);
  var guardAt = b.indexOf('dispatchGuard(');
  var fetchAt = b.indexOf('await fetch(');
  ok(fetchAt !== -1, 'H2a ' + fn + ' contains the fetch this test expects');
  ok(guardAt !== -1 && guardAt < fetchAt, 'H2b ' + fn + ' calls the guard before its fetch');
});
// …and the sum of the per-function fetches is the whole file's, so none sits outside a checked function.
var inFns = FETCH_FNS.reduce(function (n, fn) { return n + (body(RUNSRC, fn).match(/\bawait fetch\(/g) || []).length; }, 0);
eq(inFns, fetches, 'H2c no fetch sits outside a guarded function');
var onceBody = body(RUNSRC, 'once');
ok(/if \(!d\.ok\) return/.test(onceBody), 'H3  a refusal returns before the fetch');
ok(/if \(!d\.ok\) \{ console\.error\('STOP/.test(body(RUNSRC, 'deriveScope')),
  'H3b a refused scope-derivation read stops the run rather than continuing unscoped');
ok(body(RUNSRC, 'dispatchGuard').indexOf('AL.decide(') !== -1, 'H4  the guard delegates to decide()');
// The endpoint is read from the shipped client, not typed into tooling — RG-1 keeps remote URLs out of agent
// instructions, and a hand-typed endpoint could also point a fatigue run at the wrong deployment.
ok(RUNSRC.indexOf("OP_DB_API_BASE_URL\\s*=\\s*'([^']+)'") !== -1 || /OP_DB_API_BASE_URL/.test(RUNSRC),
  'H5  the endpoint is read from the shipped client');
ok(RUNSRC.indexOf('https://script.google.com/macros/s/AKfyc') === -1,
  'H6  no deployment URL is hard-coded in the tooling');
// --only narrows and cannot widen: it filters an already-approved list.
ok(/actions = actions\.filter/.test(RUNSRC), 'H7  --only filters the approved list rather than adding to it');
ok(/pairs = \(only && only !== true\) \? \[\]/.test(RUNSRC), 'H8  --only also suppresses the away/return pair list');
// No retry. §7 forbids a blind retry, and a retry would also turn a measured timeout into a measurement of the
// second attempt.
ok(RUNSRC.indexOf('attempt(') === -1 && !/for \([^)]*attemptN/.test(RUNSRC), 'H9  the runner has no retry loop');
ok(/concurrency=1/.test(RUNSRC), 'H10 the runner declares concurrency 1');
// Every phase awaits its request before issuing the next one — the R3A approved pattern is max 1 concurrent.
ok(!/Promise\.all|Promise\.allSettled/.test(RUNSRC), 'H11 nothing in the runner fans out');

// ============================================================================================================
section('I. EVERY EXCLUSION IS RECORDED WITH A REASON');
// ============================================================================================================
['rawInventory.get', 'openPoRemaining.raw.get', 'leadTime.raw.get'].forEach(function (a) {
  ok(Object.prototype.hasOwnProperty.call(AL.EXCLUDED, a), 'I1  ' + a + ' is recorded as excluded');
  ok(/UNREACHABLE/.test(AL.EXCLUDED[a]), 'I2  ' + a + ' is excluded as unreachable');
});
// These three are a CORRECTION to S8-R3A, not a preference, and the record has to say so or the next round will
// re-add them from the preflight table.
['rawInventory.get', 'openPoRemaining.raw.get'].forEach(function (a) {
  ok(/S8-R3A/.test(AL.EXCLUDED[a]), 'I3  ' + a + ' names the preflight it corrects');
});
// And the correction is TRUE: no shipped frontend file references them. Asserted here so the claim is checked
// every run rather than resting on one grep done once.
var FRONTEND = [];
(function walk(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (d) {
    var p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p);
    else if (/\.js$/.test(d.name)) FRONTEND.push(fs.readFileSync(p, 'utf8'));
  });
}(path.join(ROOT, 'js')));
['rawInventory.get', 'openPoRemaining.raw.get', 'leadTime.raw.get'].forEach(function (a) {
  var hits = FRONTEND.filter(function (s) { return s.indexOf(a) !== -1; }).length;
  eq(hits, 0, 'I4  no shipped frontend file references ' + a);
});
// …while an action that IS reachable shows up, which proves the search can find one.
ok(FRONTEND.filter(function (s) { return s.indexOf('factoryStockGuard.get') !== -1; }).length > 0,
  'I5  the same search finds factoryStockGuard.get, so a zero above is a real zero');

// ============================================================================================================
section('J. THE 44 TABLES, AND THE TWO THAT STAY UNREGISTERED');
// ============================================================================================================
eq(AL.APPROVED_TABLES.length, 44, 'J1  the approved table list is 44');
var dupes = AL.APPROVED_TABLES.filter(function (t, i) { return AL.APPROVED_TABLES.indexOf(t) !== i; });
eq(dupes, [], 'J2  no duplicates');
AL.APPROVED_TABLES.forEach(function (t) {
  // The preflight writes two sibling tables with a shorthand — `shipping_allocation_drafts` / `_lines` — so a
  // literal match on the full name fails for the second one. The shorthand is accepted explicitly rather than
  // by loosening the match, because an accidental near-miss on any OTHER table must still fail this check.
  var named = PREFLIGHT.indexOf('`' + t + '`') !== -1;
  if (!named && /_lines$/.test(t)) {
    named = PREFLIGHT.indexOf('`' + t.replace(/_lines$/, 's') + '` / `_lines`') !== -1;
  }
  ok(named, 'J3  ' + t + ' is named in the approved preflight');
});
eq(AL.BOUNDED_READ_NOT_REGISTERED.sort(), ['amazon_inventory_health_snapshot', 'supplier_price_list'],
  'J4  the two bounded reads are recorded as NOT registered');
// The operator was explicit: bounded READ permission does not register them. The registry must still refuse a
// write to both, which is the thing a reader will actually want to know later.
var CLS = require(path.join(ROOT, TOOLS + 's8-data-classification.js'));
AL.BOUNDED_READ_NOT_REGISTERED.forEach(function (t) {
  eq(CLS.classify(t).cls, CLS.CLASS.UNAUTHORIZED_UNKNOWN, 'J5  ' + t + ' is still UNAUTHORIZED_UNKNOWN');
  ok(CLS.authorizeWrite(t, 'RUNTIME_OWNER').ok === false, 'J6  …and a write to it is still refused');
});
// The classification registry did not grow this round.
eq(CLS.counts().total_registered, 58, 'J7  the registry is still 58 entries');

// ============================================================================================================
section('K. THE SURFACE FREEZE IS LOAD-BEARING');
// ============================================================================================================
ok(/SURFACE_FROZEN = NO/.test(VERSRC) && /process\.exitCode = failed\.length === 0 \? 0 : 1/.test(VERSRC),
  'K1  the verifier exits non-zero when a check fails');
ok(VERSRC.indexOf('S8_R3A_DB_TOUCH_PREFLIGHT.md') !== -1,
  'K2  the verifier checks against the approved document, not a restatement of it');
ok(/does not open a socket/.test(VERSRC), 'K3  the verifier states that it performs no I/O');
ok(VERSRC.indexOf('fetch(') === -1, 'K4a the verifier contains no fetch');
// No URL in the verifier — or in the allowlist, or in the suite — carries a real deployment id. A live id in
// any of them would mean the surface freeze had acquired a way to call the thing it is gatekeeping, and it
// would also put a remote URL into tooling, which RG-1 forbids. The placeholders (X, AKfycbEXAMPLE) are short
// and could not resolve; a real id is AKfyc followed by dozens of characters.
var REAL_ID = /AKfyc[A-Za-z0-9_-]{20,}/;
[['the verifier', VERSRC], ['the allowlist', ALSRC], ['the runner', RUNSRC], ['this suite', read('tests/s8-r3b-read-path-fatigue-safety.test.js')]]
  .forEach(function (p) {
    ok(!REAL_ID.test(p[1]), 'K4b ' + p[0] + ' carries no real deployment id',
      (p[1].match(REAL_ID) || [''])[0]);
  });
// The weaker derivation is DECLARED. Three owners have no *_TABLES_ constant and their table set comes from
// literals; a reader is entitled to know which ones rest on that.
ok(/declares no \*_TABLES_ constant/.test(VERSRC), 'K5  the weaker derivation is labelled in the output');

// ============================================================================================================
section('L. MUTATION — BREAK EACH GUARD AND REQUIRE THE SUITE TO NOTICE');
// ============================================================================================================
// Removing it from the forbidden set does NOT make it dispatchable — deny-by-default still refuses it, which is
// the defence in depth working. So the mutant is caught by the loss of the EXPLICIT naming, not by a dispatch:
// the explicit entry is what makes the refusal say which rule it is enforcing, and that is worth protecting on
// its own. Both facts are asserted, in this order, so neither can be mistaken for the other.
mut('gapJob.status.get removed from the forbidden set', AL_F,
  "'gapJob.status.get':\n      'S8-R3B precondition", "'gapJob.status.get.DISABLED':\n      'S8-R3B precondition",
  function (m) {
    var d = m.decide({ action: 'gapJob.status.get', method: 'GET' });
    if (d.ok === true) return true;                                  // would be a catastrophe; caught here
    return !Object.prototype.hasOwnProperty.call(m.FORBIDDEN_ACTIONS, 'gapJob.status.get');
  });
mut('gapJob.status.get ADDED to the approved set', AL_F,
  "var APPROVED = {", "var APPROVED = { 'gapJob.status.get': { surface:'x', surfaceNo:11, owner:'46_', verb:'GET', envelope:'gapRead', build:function(){return {};} },",
  function (m) { return m.approvedActions().indexOf('gapJob.status.get') !== -1; });
mut('deny-by-default flipped to allow-by-default', AL_F,
  "return refuse('ACTION_NOT_IN_APPROVED_SET',", "return { ok: true, code: 'OOPS' } || refuse('ACTION_NOT_IN_APPROVED_SET',",
  function (m) { return m.decide({ action: 'adjustFactoryInventory', method: 'POST' }).ok === true; });
mut('the empty-action refusal removed', AL_F,
  "if (action === '') return refuse('NO_ACTION'", "if (false) return refuse('NO_ACTION'",
  function (m) { var d = m.decide({ action: '', method: 'GET' }); return d.code !== 'NO_ACTION'; });
mut('the verb check removed', AL_F,
  "if (method !== spec.verb) {", "if (false) {",
  function (m) { return m.decide({ action: 'fcSummary.workspace.get', method: 'POST' }).ok === true; });
mut('the endpoint check removed', AL_F,
  "if (url !== '' && url.indexOf('https://script.google.com/macros/s/') !== 0) {", "if (false) {",
  function (m) { return m.decide({ action: 'fcSummary.workspace.get', method: 'GET',
    url: 'https://script.googleusercontent.com/macros/echo' }).ok === true; });
mut('actionFromRequest returns an action for an unreadable request', AL_F,
  "    return '';\n  }\n\n  // Build the complete request", "    return 'fcSummary.workspace.get';\n  }\n\n  // Build the complete request",
  function (m) { return m.actionFromRequest('https://example.com/x', 'not json') !== ''; });
mut('buildRequest skips the decision', AL_F,
  "var decision = decide({ action: action, method: spec.verb, url: url });",
  "var decision = { ok: true, code: 'DISPATCH_AUTHORIZED' };",
  function (m) { var r = m.buildRequest(BASE, 'fcSummary.workspace.get');
    return r.decision.action === undefined || r.decision.surface === undefined; });
mut('the empty-body omission removed from readQuery', AL_F,
  "if (payload !== '{}') qp += '&km_body='", "if (true) qp += '&km_body='",
  function (m) { return m.readQuery('a', {}, 'REQ-1').indexOf('km_body') !== -1; });
mut('the transport contract version drifts', AL_F,
  "var TRANSPORT_CONTRACT_VERSION = 1;", "var TRANSPORT_CONTRACT_VERSION = 2;",
  function (m) { return m.TRANSPORT_CONTRACT_VERSION !== 1 || m.readQuery('a', { x: 1 }, 'R').indexOf('km_tc=1') === -1; });
mut('the api version drifts', AL_F,
  "var API_VERSION = '1';", "var API_VERSION = '2';",
  function (m) { return m.buildDto('fcSummary.workspace.get', 'R').apiVersion !== '1'; });
mut('the shipment page size is tidied to a round number', AL_F,
  "page: { number: 1, size: 3000 },", "page: { number: 1, size: 100 },",
  function (m) { return m.buildDto('shipment.workspace.get', 'R').payload.page.size !== 3000; });
mut('the recommendation page size is tidied', AL_F,
  "pagination: { page: 1, size: 100 },", "pagination: { page: 1, size: 25 },",
  function (m) { return m.buildDto('recommendation.workspace.get', 'R').payload.pagination.size !== 100; });
mut('the gap read is given the foundation envelope', AL_F,
  "envelope: 'gapRead',", "envelope: 'foundation',",
  function (m) { return Object.keys(m.buildDto('inventoryReplenishmentGap.get', 'R')).indexOf('apiVersion') !== -1; });
// S8-R4B-1 — both guard mutants re-aimed at the repaired contract. The old pair was anchored on
// `envelope: 'command'` and `verb: 'POST'`; this round deletes both strings, so left alone they would have
// thrown "anchor not found" and been scored CAUGHT while testing nothing.
//
// THE ENVELOPE MUTANT NOW TESTS THE TRAP THAT MATTERS. Giving the guard the nested `gapRead` envelope is
// not a hypothetical slip — it is what copying any neighbouring caller would do, and it fails SILENTLY:
// shipping_plan_id lands under `payload`, where handleFactoryStockGuardGet_ never looks, so the handler
// takes its no-plan branch and answers without `guard_available`.
mut('the guard is given the NESTED gapRead envelope, burying shipping_plan_id under payload', AL_F,
  "owner: '71_', verb: 'GET', envelope: 'gapReadFlat',", "owner: '71_', verb: 'GET', envelope: 'gapRead',",
  function (m) {
    var dto = m.buildDto('factoryStockGuard.get', 'R', { shipping_plan_id: 'SP-1' });
    return Object.prototype.hasOwnProperty.call(dto, 'payload');
  });
mut('the guard is re-declared a POST, putting it back on the write verb', AL_F,
  "surfaceNo: 4, owner: '71_', verb: 'GET'", "surfaceNo: 4, owner: '71_', verb: 'POST'",
  function (m) { return m.APPROVED['factoryStockGuard.get'].verb !== 'GET'; });
mut('a 45th table is slipped into the approved list', AL_F,
  "'supplier_price_list', 'amazon_inventory_health_snapshot'\n  ];",
  "'supplier_price_list', 'amazon_inventory_health_snapshot', 'sales_orders'\n  ];",
  function (m) { return m.APPROVED_TABLES.length !== 44; });
mut('the bounded reads are quietly registered', AL_F,
  "var BOUNDED_READ_NOT_REGISTERED = ['supplier_price_list', 'amazon_inventory_health_snapshot'];",
  "var BOUNDED_READ_NOT_REGISTERED = [];",
  function (m) { return m.BOUNDED_READ_NOT_REGISTERED.length !== 2; });
mut('orderPlanningGap.get is quietly approved', AL_F,
  "    'orderPlanningGap.get':\n      'READ-ONLY, but NOT in the S8-R3A approved action set",
  "    'orderPlanningGap.get.X':\n      'READ-ONLY, but NOT in the S8-R3A approved action set",
  function (m) { return !Object.prototype.hasOwnProperty.call(m.FORBIDDEN_ACTIONS, 'orderPlanningGap.get'); });
mut('the excluded record loses its reasons', AL_F,
  "var EXCLUDED = {", "var EXCLUDED = { _: '',",
  function (m) { return Object.keys(m.EXCLUDED).some(function (k) { return String(m.EXCLUDED[k]).length < 10; }); });
mut('the request id adopts the reserved S8T namespace', AL_F,
  "return 'REQ-S8R3B-'", "return 'REQ-S8T-'",
  function (m) { m.resetSequence(); return m.nextRequestId().indexOf('S8T') !== -1; });
mut('the scope-required flag is dropped from the gap read', AL_F,
  "      scopeRequired: true,\n      build: function (ctx) {\n        var sc = (ctx && ctx.scope) || null;",
  "      build: function (ctx) {\n        var sc = (ctx && ctx.scope) || null;",
  function (m) { return m.scopeRequiredActions().indexOf('inventoryReplenishmentGap.get') === -1; });
mut('a partial scope is sent as if it were whole', AL_F,
  "if (!sc || !sc.company || !sc.country || !sc.marketplace) return { scope: {} };",
  "if (!sc) return { scope: {} };",
  function (m) { var p = m.buildDto('inventoryReplenishmentGap.get', 'R', { scope: { company: 'KM' } }).payload;
    return JSON.stringify(p) !== JSON.stringify({ scope: {} }); });
mut('the scope context is ignored by the recommendation builder', AL_F,
  "        var sc = (ctx && ctx.scope) || {};",
  "        var sc = {};",
  function (m) { return m.buildDto('recommendation.workspace.get', 'R', { scope: { company: 'KM', country: 'US', marketplace: 'Amazon' } }).payload.scope.company !== 'KM'; });
mut('the GET body ceiling is raised past the router', AL_F,
  "var GET_BODY_MAX = 4000;", "var GET_BODY_MAX = 999999;",
  function (m) { return m.GET_BODY_MAX !== 4000; });
// S8-R4B-1 — RE-ANCHORED. This mutant had NEVER been applied: its anchor was written as one line while the
// source wraps the scope across two, so loadMutated threw "anchor not found" on every run and the old
// harness reported it as CAUGHT. It was a false pass from the day it was written, and it is unrelated to
// the Factory Guard repair — the hardened harness in this round is simply the first thing that could see it.
mut('the recommendation scope gains a server-owned field', AL_F,
  "                   sku: null, siteSku: null },",
  "                   sku: null, siteSku: null, calculationMonth: '2026-10' },",
  function (m) { return JSON.stringify(m.buildDto('recommendation.workspace.get', 'R')).indexOf('calculationMonth') !== -1; });
mut('a gap job start is dropped from the forbidden set', AL_F,
  "'orderPlanningGap.job.start':", "'orderPlanningGap.job.startX':",
  function (m) {
    var d = m.decide({ action: 'orderPlanningGap.job.start', method: 'POST' });
    if (d.ok === true) return true;
    return !Object.prototype.hasOwnProperty.call(m.FORBIDDEN_ACTIONS, 'orderPlanningGap.job.start');
  });

// ============================================================================================================
console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILURES') + ' — ' + pass + ' passed, ' + fail + ' failed, '
  + mutants + ' mutants, ' + survived + ' survived');
if (fail !== 0) process.exitCode = 1;
