/**
 * ==================================================================================================
 * THE ENVELOPE NAMES THE ACTION IT SERVED   —   P1-B7E · R10
 * ==================================================================================================
 *
 * THE DEFECT WAS FOUND BY CALLING THE DEPLOYED /exec, NOT BY READING THE SOURCE, AND THAT IS WHY IT
 * SURVIVED TWO ROUNDS. `ppwEnvelope_` hard-coded `action: PPW_ACTION_`, which was true while 72_ served
 * one action and became a lie the moment it served two. Every productPricing.siteUniverse.get response —
 * refusal, success and exception alike — published
 *
 *     meta.action        = "productPricing.workspace.get"      <- the envelope's fixed idea
 *     data.schema.action = "productPricing.siteUniverse.get"   <- what actually answered
 *
 * and the shipped accessor requires those two to agree, so it rejected every one with
 * RESPONSE_ACTION_MISMATCH and reported SOURCE_NOT_CONNECTED — "not connected", written over a response
 * that had arrived, which is the exact failure that validator exists to prevent.
 *
 * WHY THE P1-B6 SUITE PASSED THROUGHOUT. Its envelopes were written by hand and their meta.action was
 * set to what the author expected the server to send. Both sides agreed in the suite and disagreed in
 * production. A FIXTURE ENCODES ITS AUTHOR'S ASSUMPTION UNLESS SOMETHING PINS IT TO WHAT THE SERVER
 * ACTUALLY DOES — so §G here runs the real captured /exec body, and §H builds every other envelope by
 * EXECUTING the shipped handler rather than by describing it.
 *
 * TWO THINGS THIS SUITE REFUSES TO DO, because both would hide the defect rather than fix it: it does
 * not relax the client validator, and it does not let the client fall back to data.schema.action. The
 * validator is the thing that caught this. Weakening it to make the symptom go away would spend the
 * only instrument that worked.
 *
 * ENVELOPES ARE JSON ROUND-TRIPPED BEFORE THEY REACH THE CLIENT, because that is what the wire does. A
 * vm context has its own Array, so an envelope handed straight across realms fails `sites instanceof
 * Array` for a reason production never has — which is a shim artefact masquerading as a contract breach,
 * and this suite is about not confusing those two.
 * ==================================================================================================
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..', '..');
var JS = path.join(ROOT, 'assets', 'js');
var GSDIR = path.join(ROOT, 'assets', 'specs', 'active', 'apps-script');

function read(p) { return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n'); }
function readRoot(p) { return read(path.join(ROOT, p)); }

var SRC = {
  ppw: read(path.join(GSDIR, '72_api_v1_product_pricing_workspace.gs')),
  health: read(path.join(GSDIR, '63_api_v1_system_health.gs')),
  router: read(path.join(GSDIR, '01_router.gs')),
  accessor: read(path.join(JS, 'api', 'km-product-pricing-workspace.js')),
  releaseOrder: read(path.join(__dirname, '_release-order.js'))
};

var CAPTURE = require(path.join(__dirname, '_p1b7d-exec-capture.js'));

var WORKSPACE_ACTION = 'productPricing.workspace.get';
var UNIVERSE_ACTION = 'productPricing.siteUniverse.get';
var R9 = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R9';
var R10 = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R10';

var pass = 0, fail = 0, mutCaught = 0, mutSurvived = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra === undefined ? '' : '  ' + JSON.stringify(extra))); }
}
function eq(a, b, label) {
  var A = JSON.stringify(a), B = JSON.stringify(b);
  ok(A === B, label, A === B ? undefined : { got: a, want: b });
}

// ===================================================================================================
// RUNNING THE REAL SERVER FILE
// ===================================================================================================
function gsContext(src) {
  var sb = { console: { log: function () {}, warn: function () {}, error: function () {} },
    JSON: JSON, Math: Math, Date: Date, Object: Object, Array: Array, String: String, Number: Number,
    Boolean: Boolean, isNaN: isNaN, parseFloat: parseFloat, parseInt: parseInt, Error: Error,
    RegExp: RegExp, encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(src === undefined ? SRC.ppw : src, sb, { filename: '72_.gs' });
  return sb;
}
function io(opts) {
  opts = opts || {};
  var log = { opens: 0, reads: 0 };
  return {
    __log: log,
    now: function () { return 1700000000000; },
    nextSeq: function () { return 7; },
    flagEnabled: function () { return opts.flag === true; },
    openTarget: function () {
      log.opens++;
      if (opts.openThrows) throw new Error('TARGET_UNAVAILABLE');
      return { __ss: true };
    },
    readTable: function () {
      log.reads++;
      if (opts.readThrows) throw new Error('marketplace_skus is missing a required column');
      return opts.rows || [];
    }
  };
}
/** THROUGH JSON, because that is what the wire does. See the header. */
function wire(env) { return JSON.parse(JSON.stringify(env)); }

function callUniverse(opts, ctx) {
  ctx = ctx || gsContext();
  return wire(ctx.handleProductPricingSiteUniverseGet_({ requestId: 'REQ-B7E' }, io(opts)));
}
function callWorkspace(opts, ctx) {
  ctx = ctx || gsContext();
  var payload = opts.payload === undefined
    ? { scope: { company: 'KM', country: 'US', marketplace: 'Shopify' } } : opts.payload;
  return wire(ctx.handleProductPricingWorkspaceGet_({ requestId: 'REQ-B7E', payload: payload },
    io(opts)));
}

var ROWS = [];
[['KM', 'US', 'Shopify', 3], ['KM', 'US', 'Target', 2], ['ResTW', 'JP', 'Amazon', 4]]
  .forEach(function (s, si) {
    for (var i = 0; i < s[3]; i++) {
      ROWS.push({ marketplace_sku_id: 'MS' + si + '-' + i, company: s[0], country: s[1],
        marketplace: s[2], marketplace_sku_status: 'active' });
    }
  });

/** The client chain, loaded fresh so the capability mirror starts where the file declares it. */
function clientChain(env) {
  Object.keys(require.cache).forEach(function (k) {
    if (/product-strategy|product-pricing/.test(k)) delete require.cache[k];
  });
  global.PSB_CONTRACT = require(path.join(JS, 'product-strategy', 'psb-data-contract.js')).PSB_CONTRACT;
  require(path.join(JS, 'product-strategy', 'psb-selectors.js'));
  require(path.join(JS, 'api', 'km-product-pricing-adapter.js'));
  var UNI = require(path.join(JS, 'product-strategy', 'km-product-strategy-site-universe.js'));
  var ACC = require(path.join(JS, 'api', 'km-product-pricing-workspace.js'));
  ACC.setCapability({ product_strategy_enabled: true });
  global.KM = global.KM || {};
  global.KM.api = { transport: {
    post: function () { return Promise.resolve({ __b: env }); },
    safeReadJsonResponse: function (r) { return r.__b; } } };
  return ACC.getSiteUniverse({}).then(function (out) {
    return { out: out, universe: UNI.adapt(out), UNI: UNI };
  });
}

// ===================================================================================================
console.log('\n=== §A  EVERY ENVELOPE CALL SITE, AND THE PROOF THERE IS NO OTHER ===');
// ===================================================================================================
(function () {
  /* `apiVersion` is the envelope's signature field. Exactly one occurrence in the whole file means no
     response is assembled anywhere else — which is what makes an audit of the call sites complete
     rather than a list of the ones somebody remembered. */
  eq((SRC.ppw.match(/apiVersion/g) || []).length, 1,
    'A1 ppwEnvelope_ is the ONLY thing in 72_ that builds a response envelope');

  var calls = SRC.ppw.match(/ppwEnvelope_\(/g) || [];
  eq(calls.length, 9, 'A2 nine occurrences: one declaration and eight call sites');
  eq((SRC.ppw.match(/ppwEnvelope_\(PPW_ACTION_,/g) || []).length, 4,
    'A3 four call sites answer for productPricing.workspace.get');
  eq((SRC.ppw.match(/ppwEnvelope_\(PPW_SITE_UNIVERSE_ACTION_,/g) || []).length, 4,
    'A4 and four for productPricing.siteUniverse.get');
  ok(!/ppwEnvelope_\((?:true|false)\b/.test(SRC.ppw),
    'A5 not one call site still uses the old shape, where the action was assumed');

  /* FOUR PATHS PER HANDLER, AND THEY ARE THE FOUR THAT EXIST: the flag refusal, a second refusal, the
     success, and the exception. §4 asks for proof that no path was missed, and the paths are what the
     handlers' own control flow allows — a refusal that returns, a build that returns, a throw. */
  var wsBody = /function handleProductPricingWorkspaceGet_[\s\S]*?\n}/.exec(SRC.ppw)[0];
  var suBody = /function handleProductPricingSiteUniverseGet_[\s\S]*?\n}/.exec(SRC.ppw)[0];
  eq((wsBody.match(/return ppwEnvelope_\(/g) || []).length, 4,
    'A6 the workspace handler has exactly four exits, all of them envelopes');
  eq((suBody.match(/return ppwEnvelope_\(/g) || []).length, 4,
    'A7 and the site-universe handler the same');
  ok(!/return\s*\{\s*success/.test(wsBody) && !/return\s*\{\s*success/.test(suBody),
    'A8 and neither returns a hand-built object that would bypass the builder');
}());

// ===================================================================================================
console.log('\n=== §B  workspace.get — SUCCESS, REFUSAL AND ERROR ALL SAY workspace.get ===');
// ===================================================================================================
(function () {
  var disabled = callWorkspace({ flag: false });
  eq(disabled.meta.action, WORKSPACE_ACTION, 'B1 flag refused');
  eq(disabled.meta.refusalCode, 'FEATURE_DISABLED', 'B1a and it is still FEATURE_DISABLED');

  var badScope = callWorkspace({ flag: true, payload: { scope: { company: 'KM' } } });
  eq(badScope.meta.action, WORKSPACE_ACTION, 'B2 incomplete scope refused');
  eq(badScope.meta.refused, true, 'B2a and it is a refusal');

  var okEnv = callWorkspace({ flag: true, rows: [] });
  eq(okEnv.meta.action, WORKSPACE_ACTION, 'B3 success');
  eq(okEnv.success, true, 'B3a and it succeeded');

  var thrown = callWorkspace({ flag: true, openThrows: true });
  eq(thrown.meta.action, WORKSPACE_ACTION, 'B4 exception');
  eq(thrown.success, false, 'B4a and the envelope reports failure');
  eq(thrown.data, null, 'B4b with no data');

  /* THE DATA AGREES WITH THE META. The workspace response names its action in `provenance.action`
     (the site-universe one uses `schema.action` — the two data shapes differ, and this round makes
     meta agree with each rather than redesigning either). */
  eq(disabled.data.provenance.action, disabled.meta.action,
    'B5 and the refusal payload names the same action the envelope does');
  eq(okEnv.data.provenance.action, okEnv.meta.action, 'B5a as does the success payload');
}());

// ===================================================================================================
console.log('\n=== §C  siteUniverse.get — SUCCESS, REFUSAL AND ERROR ALL SAY siteUniverse.get ===');
// ===================================================================================================
(function () {
  var disabled = callUniverse({ flag: false });
  eq(disabled.meta.action, UNIVERSE_ACTION, 'C1 flag refused');
  eq(disabled.meta.refusalCode, 'FEATURE_DISABLED', 'C1a and it is still FEATURE_DISABLED');
  eq([disabled.meta.dbOpened, disabled.meta.tablesRead], [false, 0],
    'C1b and it still refuses before opening the database');

  var unreadable = callUniverse({ flag: true, readThrows: true });
  eq(unreadable.meta.action, UNIVERSE_ACTION, 'C2 unreadable table refused');
  eq(unreadable.meta.refusalCode, 'SOURCE_TABLE_UNREADABLE', 'C2a with its own code');
  eq(unreadable.data.sourceState, 'SOURCE_PARTIALLY_READABLE',
    'C2b and a missing table is still not an empty one');

  var ready = callUniverse({ flag: true, rows: ROWS });
  eq(ready.meta.action, UNIVERSE_ACTION, 'C3 success');
  eq(ready.data.sourceState, 'READY', 'C3a and it is READY');
  eq(ready.data.site_count, 3, 'C3b with the three sites the rows describe');

  var thrown = callUniverse({ flag: true, openThrows: true });
  eq(thrown.meta.action, UNIVERSE_ACTION, 'C4 exception');
  eq(thrown.success, false, 'C4a and the envelope reports failure');

  eq(disabled.data.schema.action, disabled.meta.action,
    'C5 the refusal payload names the same action the envelope does');
  eq(ready.data.schema.action, ready.meta.action, 'C5a as does the success payload');
  eq(unreadable.data.schema.action, unreadable.meta.action, 'C5b and the unreadable-table refusal');

  /* THE TWO ACTIONS ARE NOW DISTINGUISHABLE, WHICH IS THE WHOLE POINT. */
  ok(callWorkspace({ flag: false }).meta.action !== callUniverse({ flag: false }).meta.action,
    'C6 two actions from one file no longer answer under one name');
}());

// ===================================================================================================
console.log('\n=== §D  THE ACTION IS AN INPUT AND IS STILL NOT TRUSTED ===');
// ===================================================================================================
(function () {
  var ctx = gsContext();
  eq(ctx.ppwEnvelopeActions_().sort(), [UNIVERSE_ACTION, WORKSPACE_ACTION].sort(),
    'D1 the allowlist is exactly this file\'s two own constants');

  var threw = null;
  try { ctx.ppwEnvelope_('productPricing.anything.get', true, {}, [], {}); }
  catch (e) { threw = e; }
  ok(threw !== null, 'D2 an action outside the allowlist is refused, not published');
  ok(threw && /must be one of/.test(threw.message), 'D2a and the refusal says why');

  ['', null, undefined, 0, {}].forEach(function (v, i) {
    var t = null;
    try { ctx.ppwEnvelope_(v, true, {}, [], {}); } catch (e) { t = e; }
    ok(t !== null, 'D3.' + (i + 1) + ' and so is ' + JSON.stringify(v === undefined ? 'undefined' : v));
  });

  /* A CALLER'S META MAY NOT RENAME THE ACTION. The merge happens first and the action is stamped over
     the top; the other way round, the allowlist would be advice. */
  var env = ctx.ppwEnvelope_(UNIVERSE_ACTION, true, { sites: [] }, [],
    { action: WORKSPACE_ACTION, requestId: 'R' });
  eq(env.meta.action, UNIVERSE_ACTION, 'D4 a meta carrying its own action does not win');
  eq(env.meta.requestId, 'R', 'D4a while the rest of the caller\'s meta is still merged');

  /* AND NOTHING READS AN ACTION OUT OF THE REQUEST. The handlers take body.requestId and body.payload
     and nothing else; an action string arriving from a caller has no path to this field. */
  ok(!/body\s*&&\s*body\.action|payload\.action|\.action\s*\|\|\s*PPW_/.test(SRC.ppw),
    'D5 no handler reads an action from the request body');
  var injected = callWorkspace({ flag: false,
    payload: { scope: { company: 'KM', country: 'US', marketplace: 'Shopify' },
      action: 'productPricing.siteUniverse.get' } });
  eq(injected.meta.action, WORKSPACE_ACTION,
    'D6 and an action smuggled in the payload changes nothing');
}());

// ===================================================================================================
console.log('\n=== §E  THE ROUTER STILL REFUSES WHAT IT DOES NOT KNOW ===');
// ===================================================================================================
(function () {
  var tbl = /function rtrGetReadHandlers_\(\)[\s\S]*?\n}/.exec(SRC.router)[0];
  ok(tbl.indexOf("'" + UNIVERSE_ACTION + "'") > 0, 'E1 the read table routes the site universe');
  ok(tbl.indexOf("'" + WORKSPACE_ACTION + "'") > 0, 'E2 and the workspace read');
  ok(tbl.indexOf('productPricing.anything') < 0, 'E3 and nothing else under that prefix');
  ok(SRC.router.indexOf("action === '" + UNIVERSE_ACTION + "'") > 0,
    'E4 and doPost dispatches it too — an action cannot be routed for one verb only');

  /* The terminal unknown-action answers the client keys on are untouched. */
  ['Invalid POST action', 'Missing or invalid action parameter'].forEach(function (m, i) {
    ok(SRC.router.indexOf(m) > 0, 'E5.' + (i + 1) + ' the router still says "' + m + '"');
  });
  ok(SRC.router.indexOf('RTR_BUILD_VERSION_ = \'' + R9 + '\'') > 0,
    'E6 AND THE ROUTER DID NOT CHANGE THIS ROUND — its stamp is still R9, because no action was added');
}());

// ===================================================================================================
console.log('\n=== §F  THE CLIENT VALIDATOR WAS NOT RELAXED ===');
// ===================================================================================================
(function () {
  ok(/env\.meta\.action !== SITE_UNIVERSE_ACTION/.test(SRC.accessor),
    'F1 the accessor still requires meta.action to be the site-universe action');
  ok(/RESPONSE_ACTION_MISMATCH/.test(SRC.accessor), 'F1a and still has a name for the failure');
  ok(/SERVER_SENT_A_CLIENT_ONLY_STATE/.test(SRC.accessor),
    'F2 and still refuses a server-sent client-only state');
  ok(/RESPONSE_MISSING_SITES/.test(SRC.accessor) && /RESPONSE_MISSING_REFUSALS/.test(SRC.accessor),
    'F3 and still requires the two arrays');
  ok(!/schema\.action/.test(SRC.accessor),
    'F4 AND IT DOES NOT FALL BACK TO data.schema.action — the fix is on the side that was wrong');
}());

// ===================================================================================================
console.log('\n=== §G  THE R9 CAPTURE STILL REPRODUCES THE DEFECT ===');
// ===================================================================================================
/**
 * The evidence file is not edited to agree with the fix — the fix is what has to stop agreeing with it.
 * An evidence file quietly updated to match the current code proves nothing at all.
 */
var G = (function () {
  eq(CAPTURE.siteUniverse.meta.action, WORKSPACE_ACTION,
    'G1 the deployed R9 named the WORKSPACE action on a site-universe response');
  eq(CAPTURE.siteUniverse.data.schema.action, UNIVERSE_ACTION,
    'G2 while its own schema named the site-universe action — the two disagreed');
  eq(CAPTURE.siteUniverse.meta.build, R9, 'G3 measured on R9');
  eq(CAPTURE.siteUniverse.meta.refusalCode, 'FEATURE_DISABLED', 'G4 the gate refused, live');
  eq([CAPTURE.siteUniverse.meta.dbOpened, CAPTURE.siteUniverse.meta.tablesRead], [false, 0],
    'G5 before the database was opened');
  eq(CAPTURE.health.deployed_action_contract_version, 14, 'G6 the deployment served contract 14');
  eq(CAPTURE.health.mixed_deployment, false, 'G7 and was not a mixed sync');
  eq(CAPTURE.provenance.is_immutable_evidence, true, 'G8 and the capture declares itself immutable');

  /* DE-IDENTIFIED. Nothing that identifies the deployment survives in the fixture. */
  var blob = JSON.stringify({ h: CAPTURE.health, s: CAPTURE.siteUniverse });
  ['script.google.com', 'AKfycb', '/exec', 'macros/s/'].forEach(function (n, i) {
    ok(blob.indexOf(n) < 0, 'G9.' + (i + 1) + ' the capture carries no ' + n);
  });
  ok(blob.indexOf('requestId') < 0, 'G9.5 nor the per-request id');
  ok(blob.indexOf('server_timestamp') < 0, 'G9.6 nor the server timestamp');

  /* AND THE REAL BODY, THROUGH THE REAL ACCESSOR, STILL FAILS THE WAY IT FAILED IN PRODUCTION. */
  return clientChain(CAPTURE.siteUniverse).then(function (r) {
    eq(r.out.meta.refusalCode, 'SOURCE_NOT_CONNECTED',
      'G10 the shipped accessor still rejects the R9 body');
    eq(r.out.data.refusals[0].detail, 'RESPONSE_ACTION_MISMATCH',
      'G10a naming the action mismatch as the reason');
    eq(r.universe.state, 'SOURCE_NOT_CONNECTED',
      'G11 and the board would still have said "not connected" over a response that arrived');
  });
}());

// ===================================================================================================
// §H  THE FIXED SERVER, THROUGH THE REAL CLIENT
// ===================================================================================================
var H = G.then(function () {
  console.log('\n=== §H  THE FIXED ENVELOPE PASSES THE UNCHANGED ACCESSOR ===');
  return clientChain(callUniverse({ flag: false })).then(function (r) {
    eq(r.out.meta.refusalCode, 'FEATURE_DISABLED',
      'H1 a refusal now reaches the client AS a refusal');
    ok(r.out.data.refusals[0].detail.indexOf('PRODUCT_STRATEGY_ENABLED_') >= 0,
      'H1a carrying the server\'s own sentence, not a transport guess');
    eq(r.universe.state, 'FEATURE_DISABLED',
      'H2 and the site-universe module classifies it as FEATURE_DISABLED');
    ok(r.universe.state !== 'SOURCE_NOT_CONNECTED',
      'H2a which is NOT what it said before — the two are different facts');
  }).then(function () {
    /* A REFUSAL IS THE EASY HALF. §5 asks for the success path too, because an envelope that only ever
       carries zero sites can agree with a validator for reasons that have nothing to do with rows. */
    return clientChain(callUniverse({ flag: true, rows: ROWS })).then(function (r) {
      eq(r.out.meta.refused, undefined === r.out.meta.refused ? undefined : false,
        'H3 a READY response is not refused');
      eq(r.universe.state, 'OK', 'H4 the module accepts it');
      eq(r.universe.sites.length, 3, 'H5 with all three sites');
      eq(r.UNI.companies(r.universe).sort(), ['KM', 'ResTW'],
        'H6 and the ladder is built from them');
      eq(r.UNI.marketplacesFor(r.universe, 'KM', 'US').sort(), ['Shopify', 'Target'],
        'H7 narrowed to the chosen company and country, not to every marketplace in the universe');
    });
  });
});

// ===================================================================================================
// §I  R9 IS IMMUTABLE, R10 IS BOOKKEPT
// ===================================================================================================
var I = H.then(function () {
  console.log('\n=== §I  R9 UNCHANGED · R10 RECORDED · CONTRACT STILL 14 ===');

  ok(SRC.ppw.indexOf("var PPW_BUILD_VERSION_ = '" + R10 + "'") > 0, 'I1 72_ declares R10');
  /* THE RELEASE HAS MOVED PAST R10 AND 72_'s STAMP HAS NOT — which is the rule this section was
     written to demonstrate, now visible in a single tree instead of across two rounds. I1 above still
     reads R10 from 72_ because 72_ has not changed since; P1-B8D minted R11 for the activation, and
     marching 72_'s stamp to it would have claimed a behaviour change that did not happen and put an
     unchanged file on the sync list. "Which release is this deployment meant to be" and "which round
     did THIS FILE last change" are two questions with two answers, and this is what that looks like. */
  ok(SRC.health.indexOf("var SYS_DEPLOYMENT_RELEASE_ = '" + R10 + "'") < 0,
    'I2 the release has moved past R10 — a later round minted its own');
  ok(/var SYS_DEPLOYMENT_RELEASE_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R11';/.test(SRC.health),
    'I2a and it is R11, the activation release');
  ok(SRC.health.indexOf("var SYS_BUILD_VERSION_ = '" + R10 + "'") < 0,
    'I3 63_ moved with it, because the release lives in 63_ and changing it changes that file');
  ok(SRC.health.indexOf("symbol: 'PPW_BUILD_VERSION_', expected: '" + R10 + "'") > 0,
    'I4 and the manifest expects R10 from 72_ — a stamp without its manifest entry is a MIXED sync');
  ok(SRC.health.indexOf("symbol: 'SYS_BUILD_VERSION_', expected: '" + R10 + "'") < 0,
    'I5 while 63_\'s own manifest row moved with 63_ — the self-referential row tracks the file, not the release');
  ok(SRC.health.indexOf("symbol: 'RTR_BUILD_VERSION_', expected: '" + R9 + "'") > 0,
    'I6 WHILE 01_router STAYS AT R9 — it did not change, and a stamp names the round its own file belongs to');

  var order = SRC.releaseOrder;
  ok(order.indexOf("'" + R9 + "'") > 0 && order.indexOf("'" + R10 + "'") > 0,
    'I7 the append-only ledger carries both');
  ok(order.indexOf("'" + R9 + "'") < order.indexOf("'" + R10 + "'"),
    'I7a with R10 after R9, appended rather than inserted');

  /* THE ACTION CONTRACT COUNTS ACTIONS, AND NO ACTION CHANGED. Bumping it would tell every browser its
     deployment was too old for a reason that is not about what the deployment can do. */
  ok(/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = 14;/.test(SRC.health),
    'I8 the deployed action contract is still 14');
  ok(/var KM_EXPECTED_ACTION_CONTRACT_VERSION_ = 14;/
    .test(read(path.join(JS, 'api', 'operation-system-db-api.js'))),
    'I8a and the client pin still 14, so no page is told to republish');
  ok(/var SYS_REQUIRED_ACTION_LIST_VERSION_ = 12;/.test(SRC.health),
    'I9 the required-action list version is still 12');
  var reqList = /var SYS_REQUIRED_ACTIONS_ = \[[\s\S]*?\n\];/.exec(SRC.health)[0];
  /* `action:` specifically — each entry carries an action AND a handler, so counting bare strings
     counts every row twice and would agree with 88 as readily as with 44. */
  eq((reqList.match(/action: '/g) || []).length, CAPTURE.health.required_action_count,
    'I10 and it still holds the ' + CAPTURE.health.required_action_count
    + ' actions the deployment counted');

  /* THE CAPTURE STILL DESCRIBES R9 — it is evidence of a build that is now superseded, and it must not
     have been dragged forward with the release. */
  eq(CAPTURE.siteUniverse.meta.build, R9, 'I11 the captured evidence still names R9, not R10');
  eq(CAPTURE.health.build_id, R9, 'I11a on both bodies');
});

// ===================================================================================================
// §J  ZERO-WRITE REACHABILITY
// ===================================================================================================
var J = I.then(function () {
  console.log('\n=== §J  NOTHING ON EITHER PATH CAN WRITE ===');
  var writers = ['appendRow', 'setValue', 'setValues', 'deleteRow', 'insertSheet', 'deleteSheet',
    'getRange().set', 'DriveApp', 'MailApp', 'GmailApp', 'CacheService', 'PropertiesService',
    'LockService', 'UrlFetchApp'];
  var bare = SRC.ppw.replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').map(function (l) { return l.split('//')[0]; }).join('\n');
  var found = writers.filter(function (w) { return bare.indexOf(w) >= 0; });
  eq(found, [], 'J1 72_ contains no writer, no Drive, no mail, no cache, no lock and no fetch', found);

  var d = callUniverse({ flag: false });
  eq([d.meta.read_only, d.meta.db_writes], [true, 0], 'J2 the refusal declares read-only, zero writes');
  var r = callUniverse({ flag: true, rows: ROWS });
  eq([r.meta.read_only, r.meta.db_writes], [true, 0], 'J3 and so does the success');
  var probe = io({ flag: false });
  gsContext().handleProductPricingSiteUniverseGet_({ requestId: 'X' }, probe);
  eq([probe.__log.opens, probe.__log.reads], [0, 0],
    'J4 and a disabled read opens nothing and reads nothing — MEASURED, not declared');
});

// ===================================================================================================
// §K  MUTANTS
// ===================================================================================================
function mut(label, file, from, to, probe) {
  var full = path.join(ROOT, file);
  var original = fs.readFileSync(full, 'utf8');
  var norm = original.replace(/\r\n/g, '\n');
  var n = norm.split(from).length - 1;
  if (n !== 1) { mutSurvived++; console.log('  MUTANT SURVIVED (anchor x' + n + ') ' + label); return; }
  fs.writeFileSync(full, norm.replace(from, to), 'utf8');
  var caught = false, why = '';
  try { caught = probe(read(full)) === true; } catch (e) { caught = true; why = String(e && e.message); }
  fs.writeFileSync(full, original, 'utf8');
  if (caught) { mutCaught++; console.log('  ok   ' + label + ' (caught)'); }
  else { mutSurvived++; console.log('  MUTANT SURVIVED ' + label + ' ' + why); }
}
/** Run the mutated 72_ and report what the client chain makes of it. */
function chainOf(src, opts) {
  var ctx = gsContext(src);
  var env = wire(ctx.handleProductPricingSiteUniverseGet_({ requestId: 'M' }, io(opts || { flag: false })));
  return env;
}

var PPW = 'assets/specs/active/apps-script/72_api_v1_product_pricing_workspace.gs';
J.then(function () {
  console.log('\n=== §K  MUTANTS ===');

  mut('K1 a site-universe REFUSAL is stamped with the workspace action again', PPW,
    "      return ppwEnvelope_(PPW_SITE_UNIVERSE_ACTION_, true,\n        ppwSiteUniverseRefused_('FEATURE_DISABLED',",
    "      return ppwEnvelope_(PPW_ACTION_, true,\n        ppwSiteUniverseRefused_('FEATURE_DISABLED',",
    function (src) { return chainOf(src).meta.action !== UNIVERSE_ACTION; });

  mut('K2 a site-universe SUCCESS is stamped with the workspace action', PPW,
    "    var data = ppwSiteUniverseBuild_(rows, io.now(), capped);\n    return ppwEnvelope_(PPW_SITE_UNIVERSE_ACTION_, true,",
    "    var data = ppwSiteUniverseBuild_(rows, io.now(), capped);\n    return ppwEnvelope_(PPW_ACTION_, true,",
    function (src) {
      return chainOf(src, { flag: true, rows: ROWS }).meta.action !== UNIVERSE_ACTION;
    });

  mut('K3 the workspace read starts claiming to be the site universe', PPW,
    "    var data = ppwWorkspaceBuild_(tables, req, io.now());\n    return ppwEnvelope_(PPW_ACTION_, true,",
    "    var data = ppwWorkspaceBuild_(tables, req, io.now());\n    return ppwEnvelope_(PPW_SITE_UNIVERSE_ACTION_, true,",
    function (src) {
      var ctx = gsContext(src);
      var env = wire(ctx.handleProductPricingWorkspaceGet_({ requestId: 'M',
        payload: { scope: { company: 'KM', country: 'US', marketplace: 'Shopify' } } },
        io({ flag: true, rows: [] })));
      return env.meta.action !== WORKSPACE_ACTION || env.meta.action !== env.data.provenance.action;
    });

  mut('K4 the refusal path forgets the action and the exception path keeps it', PPW,
    "      return ppwEnvelope_(PPW_SITE_UNIVERSE_ACTION_, true,\n        (function () {\n          var d = ppwSiteUniverseRefused_('SOURCE_TABLE_UNREADABLE',",
    "      return ppwEnvelope_(PPW_ACTION_, true,\n        (function () {\n          var d = ppwSiteUniverseRefused_('SOURCE_TABLE_UNREADABLE',",
    function (src) {
      return chainOf(src, { flag: true, readThrows: true }).meta.action !== UNIVERSE_ACTION;
    });

  mut('K5 a caller\'s meta is allowed to rename the action it was served by', PPW,
    "  if (meta) { for (var k in meta) m[k] = meta[k]; }\n  m.action = action;",
    "  m.action = action;\n  if (meta) { for (var k in meta) m[k] = meta[k]; }",
    function (src) {
      var ctx = gsContext(src);
      return ctx.ppwEnvelope_(UNIVERSE_ACTION, true, { sites: [] }, [],
        { action: WORKSPACE_ACTION }).meta.action !== UNIVERSE_ACTION;
    });

  mut('K6 any string the caller passes becomes the published action', PPW,
    "  if (ppwEnvelopeActions_().indexOf(action) < 0) {",
    "  if (false) {",
    function (src) {
      var ctx = gsContext(src);
      return ctx.ppwEnvelope_('productPricing.whatever.get', true, {}, [], {}).meta.action
        === 'productPricing.whatever.get';
    });

  mut('K7 the client validator is relaxed to make the symptom go away',
    'assets/js/api/km-product-pricing-workspace.js',
    "    if (!isObj(env.meta) || env.meta.action !== SITE_UNIVERSE_ACTION) {",
    "    if (false) {",
    function () {
      return !/env\.meta\.action !== SITE_UNIVERSE_ACTION/
        .test(read(path.join(JS, 'api', 'km-product-pricing-workspace.js')));
    });

  mut('K8 the action contract is bumped for a change that adds no action',
    'assets/specs/active/apps-script/63_api_v1_system_health.gs',
    'var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = 14;',
    'var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = 15;',
    function (src) { return !/SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = 14;/.test(src); });
}).then(function () {
  console.log('\n' + new Array(101).join('='));
  console.log('passed ' + pass + '  failed ' + fail
    + '  |  mutants caught ' + mutCaught + '  survived ' + mutSurvived);
  console.log(new Array(101).join('='));
  if (fail > 0 || mutSurvived > 0) process.exitCode = 1;
});
