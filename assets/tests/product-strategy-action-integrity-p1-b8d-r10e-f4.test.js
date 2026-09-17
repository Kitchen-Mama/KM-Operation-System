/**
 * PRODUCT-STRATEGY-P1-B8D-R10E-F4 — RESPONSE ACTION INTEGRITY AND TRUTHFUL REFUSAL COPY
 * =====================================================================================
 *
 * TWO DEFECTS, AND THE CENSUS THAT DECIDED HOW NARROW THE REPAIR COULD BE.
 *
 * 1. THE CAPABILITY BOOTSTRAP TRUSTED AN ANSWER WITHOUT ASKING WHAT IT ANSWERED.
 *
 *    `KM.transport.request` has validated `meta.action` since F1-7N-FB-4E, and the Product Strategy
 *    accessor validates it on both of its own reads. The capability read travels neither path: it
 *    goes through `_kmGapRead_`, which classifies the transport, parses the body, checks
 *    `json.success` and returns — with no comparison of any kind between the action requested and
 *    the action answered. `_kmApplyClientCapabilities_` then derives `caps` from `res.success &&
 *    res.data` and hands it to four consumers.
 *
 *    WHAT THAT COSTS is not an abstract one. A foreign envelope carrying `success: true` and a
 *    `data` object has no `product_strategy_enabled` in it, and the mirror reads a field that is
 *    absent from an answer to a DIFFERENT QUESTION as a product decision — publishing a confident
 *    `false`. The feature reads as switched off on the strength of an answer nobody asked for.
 *    72_ records that exact class of defect reaching production once already, one layer down, when
 *    every `siteUniverse.get` response published `meta.action = workspace.get`.
 *
 * 2. THE `FEATURE_DISABLED` SENTENCE OUTLIVED THE ONE ROAD ON WHICH IT WAS TRUE.
 *
 *    "The capability is off, so no request was sent" described every FEATURE_DISABLED this page
 *    could produce until F3-R4 gave a settled transient mirror a way to let the SERVER decide. On
 *    that road a request IS sent, the server answers `FEATURE_DISABLED`, and the second clause of
 *    the sentence is false. The code is right in both cases and stays; only the clause about the
 *    request changes, and only where it is false.
 *
 * WHY THE ENFORCEMENT IS NOT IN THE SHARED CLASSIFIER, WHICH IS WHERE IT LOOKS LIKE IT BELONGS.
 *
 *    §1's census found that of every response the shared read runners can receive, only the two
 *    `productPricing.*` reads and two `system.*` diagnostics carry an action AT ALL.
 *    `handleGetClientCapabilities_` answers `{ success, data }` and stamps one nowhere. A rule in
 *    `_kmClassifyAnswer_` that DEMANDED an action would therefore fail closed on every healthy read
 *    in the application; and that classifier never sees a parsed envelope anyway — it is handed raw
 *    text — and is shared with the WRITE runner, whose barriers key on its legacy codes.
 *
 *    So the rule is the one `KM.transport` already applies: COMPARE WHEN THE ANSWER CARRIES
 *    SOMETHING TO COMPARE, and be silent when it does not. §A and §B pin both halves, and §M kills
 *    a mutant for each way the comparison could be made vacuous — because a check that can never
 *    fire and a check that was never written are the same check.
 *
 * WHAT THIS SUITE DOES NOT CLAIM. Nothing here is a reliability measurement. Every answer is
 * scripted, and the only thing asserted is what the shipped bytes do when given one.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var H = require(path.join(__dirname, '_psb-harness.js'));

var ROOT = path.join(__dirname, '..', '..');
var JS = path.join(ROOT, 'assets', 'js');
function read(p) { return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n'); }
function readRoot(rel) { return read(path.join(ROOT, rel)); }

global.PSB_CONTRACT = require(path.join(JS, 'product-strategy', 'psb-data-contract.js')).PSB_CONTRACT;
require(path.join(JS, 'api', 'km-product-pricing-adapter.js'));
var LIVE = require(path.join(JS, 'product-strategy', 'km-product-strategy-live-adapter.js'));
var UNI = require(path.join(JS, 'product-strategy', 'km-product-strategy-site-universe.js'));

var ACC_FULL = path.join(JS, 'api', 'km-product-pricing-workspace.js');
var PAGE_FULL = path.join(JS, 'pages', 'product-strategy-board.js');
var SRC = {
  dbapi: read(path.join(JS, 'api', 'operation-system-db-api.js')),
  page: read(PAGE_FULL),
  accessor: read(ACC_FULL),
  transport: read(path.join(JS, 'api', 'km-transport.js')),
  router: readRoot('assets/specs/active/apps-script/01_router.gs'),
  handlers: readRoot('assets/specs/active/apps-script/03_master_data_handlers.gs'),
  ppw: readRoot('assets/specs/active/apps-script/72_api_v1_product_pricing_workspace.gs'),
  partial: readRoot('assets/html/pages/product-strategy-board.html'),
  index: readRoot('index.html')
};
var partialSkeleton = H.productionSkeleton(SRC.partial);

var pass = 0, fail = 0, mutCaught = 0, mutSurvived = 0;
var REACHED_THE_END = false;
process.on('exit', function () {
  if (!REACHED_THE_END) {
    console.error('  FAIL SUITE TRUNCATED — the assertion chain did not reach the end');
    process.exitCode = 1;
  }
});
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra === undefined ? '' : '  ' + JSON.stringify(extra))); }
}
function eq(a, e, label) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + '\n         exp ' + E + '\n         got ' + A); }
}
function section(t) { console.log('\n== ' + t + ' =='); }
function later(ms) { return new Promise(function (r) { setTimeout(r, ms || 0); }); }

console.log('PRODUCT STRATEGY — RESPONSE ACTION INTEGRITY (P1-B8D-R10E-F4)');

/* ===============================================================================================
   THE SHIPPED BYTES, LIFTED BY THEIR OWN MARKERS.

   Two blocks of the db api are cut out of the PRODUCTION SOURCE and executed: the F4 verification
   with the getter it is attached to, and the F3-R4 capability bootstrap that consumes it. They run
   in ONE sandbox and are wired to the REAL accessor module, so "a foreign answer arrives and the
   mirror does not move" is one chain here rather than two halves that never meet.

   WHAT IS STUBBED IS THE WIRE AND NOTHING ELSE. `_kmGapRead_` is the read; stubbing it is what
   makes a matching answer, a foreign answer and a failure all reachable without a network.
   `_kmMetadataSingleFlight_` is stubbed as its own production fallback — the branch it takes when
   `KM.transport` has not loaded — because the latch is not the subject and a shared latch would
   make one scenario's answer decide the next one's.
   =============================================================================================== */
var F4_FROM = '/* ============================================================================================\n'
  + '   PRODUCT-STRATEGY-P1-B8D-R10E-F4 §2/§3';
var F4_TO = '\n// F1-7N-FB-3 §C — SLIM SCOPE REGISTRY';
var BOOT_FROM = '/* ==================================================================================================\n'
  + '   PRODUCT-STRATEGY-P1-B8D-R10E-F3-R4 §2';
var BOOT_TO = 'window.KM.DB.capabilityRetryState = function () {';

function slice(src, from, to, what) {
  var i = src.indexOf(from), j = src.indexOf(to);
  if (i < 0 || j < 0 || j <= i) { return null; }
  return src.slice(i, j);
}
var F4_SRC = slice(SRC.dbapi, F4_FROM, F4_TO);
var BOOT_SRC = slice(SRC.dbapi, BOOT_FROM, BOOT_TO);
if (F4_SRC === null || BOOT_SRC === null) {
  console.error('FAIL STOP_F4_BLOCK_NOT_LOCATABLE — the shipped markers moved'
    + '  f4=' + (F4_SRC !== null) + ' boot=' + (BOOT_SRC !== null));
  process.exitCode = 2;
  REACHED_THE_END = true;
  return;
}

function freshAccessor() {
  delete require.cache[require.resolve(ACC_FULL)];
  return require(ACC_FULL);
}
function freshPage() {
  delete require.cache[require.resolve(PAGE_FULL)];
  return require(PAGE_FULL);
}

/* One sandbox: the shipped getter + verifier + bootstrap, one fresh accessor, one scripted wire. */
function rig(opts) {
  opts = opts || {};
  var acc = freshAccessor();
  var reads = [];
  var applied = [];
  var win = {
    KM: {
      DB: {},
      api: {
        /* THE FAIL-SAFE RETURN IS DISTINGUISHABLE FROM AN APPLIED ONE. The real
           `KM.api.applyClientCapabilities(null)` applies defaults and returns a snapshot rather
           than null, so a stub that returned null for both would make the snapshot assertion
           unable to tell a fail-safe apply from a foreign one. */
        applyClientCapabilities: function (caps) {
          applied.push(caps);
          return caps ? { failSafe: false, caps: caps } : { failSafe: true };
        },
        getClientCapabilitySnapshot: function () { return null; }
      },
      productPricingWorkspace: acc
    }
  };
  var ctx = {
    window: win, Promise: Promise, Date: Date, JSON: JSON, String: String,
    console: { warn: function () {}, error: function () {}, log: function () {} },
    _kmCapSeq_: 0, _kmCapAppliedSeq_: 0, _kmCapAppliedFromBackend_: false,
    _kmCapDeploymentIdentity_: opts.identity || function () { return 'dep-1'; },
    // The production fallback branch of the real latch, verbatim in behaviour.
    _kmMetadataSingleFlight_: function (key, fn) { return Promise.resolve().then(fn); },
    _kmGapRead_: function (action, payload) {
      reads.push({ action: action, payload: payload });
      return Promise.resolve(opts.answer ? opts.answer(reads.length) : { success: true, data: {} });
    }
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(F4_SRC, ctx, { filename: 'operation-system-db-api.js#f4-action-integrity' });
  vm.runInContext(BOOT_SRC, ctx, { filename: 'operation-system-db-api.js#capability-bootstrap' });
  return {
    acc: acc, win: win, ctx: ctx, reads: reads, applied: applied,
    get: function () { return win.KM.DB.getClientCapabilities(); },
    apply: function () { return win.KM.DB.applyClientCapabilities(); },
    servedAction: function (env) { return ctx._kmCapServedAction_(env); },
    verify: function (res) { return ctx._kmCapVerifyServedAction_(res); },
    ACTION: ctx.KM_CAPABILITY_ACTION_
  };
}

/* ---- the answers ---------------------------------------------------------------------------- */
function capsOk(extra) {
  var e = { success: true, data: { capabilitiesVersion: 'r6e1-flags-shipping-20260822',
    product_strategy_enabled: true } };
  if (extra) { for (var k in extra) { e.envelope = e.envelope || {}; } }
  e.envelope = { success: true, data: e.data };
  if (extra) { e.envelope.meta = extra; }
  return e;
}
/* THE SHAPE THE DEPLOYMENT ACTUALLY SENDS. `handleGetClientCapabilities_` returns
   `{ success, data }` and stamps no action anywhere — this is the envelope every healthy read in
   production carries, and it is the one that must NOT be refused. */
function capsCanonical() {
  return { success: true, data: { product_strategy_enabled: true },
    envelope: { success: true, data: { product_strategy_enabled: true } } };
}
/* A FOREIGN ANSWER. The productPricing envelope shape, which DOES stamp its action, carrying a
   `data` that has no `product_strategy_enabled` in it — exactly what a routing fault delivers. */
function foreign(action) {
  var d = { sites: [], refusals: [], sourceState: 'READY' };
  return { success: true, data: d,
    envelope: { success: true, data: d, meta: { apiVersion: '1', action: action, read_only: true },
      errors: [] } };
}
function legacyAttempted(action) {
  var d = { product_strategy_enabled: true };
  return { success: true, data: d, envelope: { success: true, data: d, attempted_action: action } };
}
function capsFail(code, status) {
  return { success: false, error: { code: code, transport: { code: code },
    details: (typeof status === 'number' ? { http_status: status } : {}) } };
}

var CHAIN = Promise.resolve();

/* ===============================================================================================
   §A — THE SERVED-ACTION READER. Which field is read, and which are deliberately not.
   =============================================================================================== */
CHAIN = CHAIN.then(function () {
  section('§A — which field names the action, and which fields are not it');

  var r = rig({});
  eq(r.ACTION, 'getClientCapabilities', 'A1  the expected action is the module constant, not a literal at the call site');
  eq(r.servedAction({ meta: { action: 'x.y' } }), 'x.y', 'A2  meta.action is read');
  eq(r.servedAction({ attempted_action: 'x.y' }), 'x.y',
    'A3  and the router error envelope\'s attempted_action is read when there is no meta');
  eq(r.servedAction({ meta: { action: 'from-meta' }, attempted_action: 'from-top' }), 'from-meta',
    'A4  meta wins, which is the order KM.transport reads them in');
  eq(r.servedAction({ data: { action: 'productPricing.workspace.get' } }), '',
    'A5  a field called `action` INSIDE data is NOT the deployment speaking  [M2]');
  eq(r.servedAction({ payload: { action: 'x' }, action: 'y' }), '',
    'A6  nor is a top-level `action`, which is the REQUEST\'s own echo, not the answer\'s');
  eq(r.servedAction({}), '', 'A7  an envelope naming nothing reads as nothing');
  eq(r.servedAction(null), '', 'A8  and a non-envelope cannot throw');
  eq(r.servedAction({ meta: { action: '   ' } }), '', 'A9  whitespace is not a claim');
  eq(r.servedAction({ meta: { action: null } }), '', 'A10 nor is an explicit null');
  eq(r.servedAction({ meta: 'not-an-object' }), '', 'A11 nor a meta that is not an object');
});

/* ===============================================================================================
   §B — THE VERIFIER. Matching, missing, mismatching — and what it refuses to touch.
   =============================================================================================== */
CHAIN = CHAIN.then(function () {
  section('§B — the rule: compare when there is something to compare');

  var r = rig({});
  var okRes = capsCanonical();
  eq(r.verify(okRes), okRes,
    'B1  THE SHAPE PRODUCTION ACTUALLY SENDS — no action anywhere — passes through UNCHANGED  [M6]');

  var matched = foreign('getClientCapabilities');
  eq(r.verify(matched), matched, 'B2  and so does an envelope that names the action it answered');

  var cased = { success: true, data: {}, envelope: { success: true, meta: { action: 'GETCLIENTCAPABILITIES' } } };
  eq(r.verify(cased), cased, 'B3  the comparison is case-insensitive, as KM.transport\'s is');

  var bad = foreign('productPricing.workspace.get');
  var v = r.verify(bad);
  eq(v.success, false, 'B4  a FOREIGN action is refused  [M1, M3]');
  eq(v.error.code, 'RESPONSE_ACTION_MISMATCH', 'B5  named as a routing fault');
  eq(v.error.transport.code, 'RESPONSE_ACTION_MISMATCH',
    'B6  and the TYPED code carries it, which is the field the apply chain reads first');
  eq(v.error.transport.answered_action, 'productPricing.workspace.get',
    'B7  the answer that arrived is reported, not just that one did');
  eq(v.error.transport.zero_write, true, 'B8  a read that was refused wrote nothing, and says so');
  eq(v.error.transport.retryable, false,
    'B9  and is NOT retryable — an identical request returns an identical answer');
  eq(v.data === undefined && v.envelope === undefined, true,
    'B10 the refusal carries NO data and NO envelope: nothing downstream can reach the payload  [M3]');

  var legacy = legacyAttempted('getClientCapabilities');
  eq(r.verify(legacy), legacy, 'B11 attempted_action agreeing is accepted');
  eq(r.verify(legacyAttempted('someOther.get')).success, false, 'B12 and disagreeing is refused');

  /* A FAILURE IS ALREADY FAILING CLOSED. Passing it through untouched is what keeps this round from
     changing a single existing error path. */
  var f = capsFail('REQUEST_TIMEOUT');
  eq(r.verify(f), f, 'B13 a FAILED read keeps its own code and is not re-labelled');
  eq(r.verify(null), null, 'B14 and a null result cannot throw');
  eq(r.verify({ success: false, error: { code: 'X' }, envelope: { meta: { action: 'wrong' } } }).error.code, 'X',
    'B15 even a failure carrying a foreign action keeps the code it earned');
});

/* ===============================================================================================
   §C — THE VERIFIER IS ACTUALLY ATTACHED TO THE SHIPPED GETTER.
   A rule nobody calls is a comment. Driven through `KM.DB.getClientCapabilities`, not read.
   =============================================================================================== */
CHAIN = CHAIN.then(function () {
  section('§C — the shipped getter, driven');

  var r = rig({ answer: function () { return foreign('productPricing.siteUniverse.get'); } });
  return Promise.resolve(r.get()).then(function (res) {
    eq(res.success, false, 'C1  a foreign answer through the REAL getter is refused  [M10]');
    eq(res.error.code, 'RESPONSE_ACTION_MISMATCH', 'C2  as a routing fault');
    eq(r.reads.length, 1, 'C3  at exactly ONE read — refusing is not retrying  [M: no second request]');
    eq(r.reads[0].action, 'getClientCapabilities', 'C4  and the read asked for the capability action');
  });
});

CHAIN = CHAIN.then(function () {
  var r = rig({ answer: capsCanonical });
  return Promise.resolve(r.get()).then(function (res) {
    eq(res.success, true, 'C5  and the canonical production shape still succeeds through the real getter');
    eq(res.data.product_strategy_enabled, true, 'C6  with its payload intact');
    eq(r.reads.length, 1, 'C7  at one read');
  });
});

/* ===============================================================================================
   §D — THE APPLY CHAIN. Four consumers, and none of them is updated and then corrected.
   =============================================================================================== */
CHAIN = CHAIN.then(function () {
  section('§D — consumer atomicity on a foreign answer');

  var r = rig({ answer: function () { return foreign('productPricing.workspace.get'); } });
  return Promise.resolve(r.apply()).then(function () { return later(5); }).then(function () {
    /* CONSUMER 1 — the foundation mirror. */
    eq(r.applied.length, 1, 'D1  KM.api.applyClientCapabilities was called exactly once');
    eq(r.applied[0], null,
      'D2  and was handed NULL — the fail-safe path, never the foreign payload  [M3, M4]');
    /* CONSUMER 2 — the Product Strategy mirror. */
    eq(r.acc.capabilityState(), 'FAILED',
      'D3  the Product Strategy mirror is FAILED, not SERVER_FALSE and not SERVER_TRUE  [M4]');
    eq(r.acc.capabilityFailure(), 'ACTION_MISMATCH',
      'D4  classified by the shipped classifier as a routing fault  [M: not RESPONSE_NOT_READABLE]');
    eq(r.acc.isEnabled(), false, 'D5  and the feature is not raised on a foreign answer');
    eq(r.acc.capabilityHeard(), false,
      'D6  NOTHING WAS HEARD — the mirror is closed but not latched, so a later real answer still counts');
    /* CONSUMERS 3 and 4 — the snapshot and its meta. */
    eq(r.ctx._kmCapAppliedFromBackend_, false,
      'D7  the bootstrap records that no backend answer was applied  [M3]');
    eq(r.ctx.window.__kmCapabilitySnapshot, { failSafe: true },
      'D8  the published snapshot is the FAIL-SAFE one and carries no part of the foreign payload  [M3]');
    eq(r.ctx.window.__kmCapabilityMeta.fromBackend, false, 'D9  the snapshot meta agrees');
    eq(r.ctx.window.__kmCapabilityMeta.errorCode, 'RESPONSE_ACTION_MISMATCH',
      'D10 and names WHY, so the gap is not silent');
    eq(r.reads.length, 1, 'D11 the whole bootstrap cost exactly one read');
  });
});

CHAIN = CHAIN.then(function () {
  /* D12-D16 — THE CONTROL. The same chain with the canonical answer must be untouched by this
     round, or the repair has been bought with the behaviour it was protecting. */
  var r = rig({ answer: capsCanonical });
  return Promise.resolve(r.apply()).then(function () { return later(5); }).then(function () {
    eq(r.acc.capabilityState(), 'SERVER_TRUE', 'D12 the canonical answer still raises the mirror');
    eq(r.acc.isEnabled(), true, 'D13 and the feature is enabled');
    eq(r.acc.capabilityFailure(), null, 'D14 with no failure remembered');
    eq(r.ctx._kmCapAppliedFromBackend_, true, 'D15 recorded as applied FROM the backend');
    eq(r.applied[0] && r.applied[0].product_strategy_enabled, true, 'D16 the foundation got the payload');
    eq(r.ctx.window.__kmCapabilitySnapshot.failSafe, false,
      'D16b and the snapshot is the APPLIED one, not the fail-safe - the control for D8');
  });
});

CHAIN = CHAIN.then(function () {
  /* D17-D19 — A SERVER `false` IS STILL A PRODUCT DECISION. The one outcome this round must not
     blur: an action-matched answer saying `false` is not a fault. */
  var r = rig({ answer: function () {
    var d = { product_strategy_enabled: false };
    return { success: true, data: d,
      envelope: { success: true, data: d, meta: { action: 'getClientCapabilities' } } };
  } });
  return Promise.resolve(r.apply()).then(function () { return later(5); }).then(function () {
    eq(r.acc.capabilityState(), 'SERVER_FALSE', 'D17 a matched answer of `false` is SERVER_FALSE');
    eq(r.acc.capabilityFailure(), null, 'D18 with no failure code — it is a decision, not a fault');
    eq(r.acc.capabilityHeard(), true, 'D19 and it WAS heard');
  });
});

CHAIN = CHAIN.then(function () {
  /* D20-D22 — MISSING, on the canonical shape, under the F3-R4 settlement. The legacy exception is
     not a gap in the rule; it IS the contract, and the settlement signal must still fire. */
  var r = rig({ answer: capsCanonical });
  var p = r.apply();
  var s = r.win.KM.DB.clientCapabilitiesSettlement();
  var settled = false;
  s.then(function () { settled = true; }, function () { settled = 'REJECTED'; });
  return Promise.resolve(p).then(function () { return later(5); }).then(function () {
    eq(settled, true, 'D20 the F3-R4 settlement signal still fires on the canonical answer');
    eq(r.acc.capabilityState(), 'SERVER_TRUE', 'D21 and the mirror settled');
    eq(r.reads.length, 1, 'D22 at one read');
  });
});

CHAIN = CHAIN.then(function () {
  /* D23-D25 — AND IT FIRES ON A REFUSAL TOO. A signal that only resolved on success would put back
     the permanent LOADING_CAPABILITY that F3-R4 exists to have removed. */
  var r = rig({ answer: function () { return foreign('system.requestOrderSendDiagnosticStatus'); } });
  var p = r.apply();
  var s = r.win.KM.DB.clientCapabilitiesSettlement();
  var settled = false, rejected = false;
  s.then(function () { settled = true; }, function () { rejected = true; });
  return Promise.resolve(p).then(function () { return later(5); }).then(function () {
    eq(settled, true, 'D23 an ACTION_MISMATCH settles the F3-R4 signal — the page is woken, not stranded');
    eq(rejected, false, 'D24 and it does not reject');
    eq(r.acc.capabilityFailure(), 'ACTION_MISMATCH', 'D25 with the routing fault on the mirror');
  });
});

/* ===============================================================================================
   §E — THE PAGE. ACTION_MISMATCH is not in the F3-R4 allowlist and must cost ZERO requests.
   =============================================================================================== */
var UNIV = 'productPricing.siteUniverse.get';
var WKSP = 'productPricing.workspace.get';
var SITE = { company: 'KM', country: 'US', marketplace: 'Shopify',
  site_id: 'KM|US|Shopify', listing_count: 1 };

function wire(answers) {
  var log = [];
  global.KM = global.KM || {};
  global.KM.api = global.KM.api || { buildRequestEnvelope: function (action, payload, o) {
    return { apiVersion: '1.0', action: action, requestId: (o && o.requestId) || null,
      payload: payload || {}, context: { actor: null, clientVersion: null } };
  } };
  global.KM.transport = {
    request: function (req) {
      log.push({ action: req.action, kind: req.kind });
      var a = answers[req.action];
      if (typeof a === 'function') { return Promise.resolve(a()); }
      return Promise.resolve(a || { success: false, code: 'TRANSPORT_FAILED', details: {} });
    }
  };
  return log;
}
function universeOk(sites) {
  var companies = [], byCompany = {}, byCountry = {};
  sites.forEach(function (x) {
    if (companies.indexOf(x.company) < 0) companies.push(x.company);
    byCompany[x.company] = byCompany[x.company] || [];
    if (byCompany[x.company].indexOf(x.country) < 0) byCompany[x.company].push(x.country);
    var k = x.company + '|' + x.country;
    byCountry[k] = byCountry[k] || [];
    if (byCountry[k].indexOf(x.marketplace) < 0) byCountry[k].push(x.marketplace);
  });
  return { success: true, envelope: { success: true,
    data: { sites: sites, refusals: [], sourceState: 'READY',
      hierarchy: { companies: companies, countries_by_company: byCompany,
        marketplaces_by_country: byCountry } },
    meta: { action: UNIV }, errors: [] } };
}
/* THE SERVER'S OWN FEATURE_DISABLED REFUSAL, in `ppwEnvelope_`'s shape.
   IT STAMPS NEITHER `transport` NOR `requestsMade`, and that absence is the whole provenance
   signal — see 72_ `ppwEnvelope_` against the accessor's `universeRefused`. */
function universeServerDisabled() {
  return { success: true, envelope: { success: true,
    data: { sites: [], site_count: 0, hierarchy: null, sourceState: null,
      refusals: [{ code: 'FEATURE_DISABLED',
        detail: 'PRODUCT_STRATEGY_ENABLED_ is false in the deployment that answered', subject: null }],
      findings: [], completeness: { rows_examined: 0, capped: false, is_whole_universe: false },
      schema: { contract_version: UNI.EXPECTED_CONTRACT_VERSION, action: UNIV,
        build: null, read_at: null, table: null } },
    meta: { apiVersion: '1', source: 'workspace', workspace: 'productPricing', read_only: true,
      db_writes: 0, cached: false, requestId: 'REQ-U000001', serverDurationMs: 3, tablesRead: 0,
      dbOpened: false, refused: true, refusalCode: 'FEATURE_DISABLED', action: UNIV },
    errors: [] } };
}
var DRIVER = {
  SOURCE_TIMED_OUT: ['REQUEST_TIMEOUT', null],
  HTTP_NOT_FOUND: ['REDIRECT_TARGET_NOT_FOUND', 404],
  ACTION_MISMATCH: ['RESPONSE_ACTION_MISMATCH', null],
  NOT_AUTHORIZED: ['AUTH_OR_ACCESS_HTML', 401],
  RESPONSE_NOT_READABLE: ['TRANSPORT_NON_JSON_RESPONSE', null],
  SOURCE_NOT_CONNECTED: ['HTTP_TRANSPORT_ERROR', null]
};
function driveCap(acc, state) {
  if (state === 'SERVER_TRUE') { return acc.setCapability({ product_strategy_enabled: true }); }
  if (state === 'SERVER_FALSE') { return acc.setCapability({ product_strategy_enabled: false }); }
  if (state === 'FIELD_ABSENT') { return acc.setCapability({}); }
  if (DRIVER[state]) { return acc.setCapability(null, { failureCode: DRIVER[state][0], httpStatus: DRIVER[state][1] }); }
  return acc.setCapability(null, { failureCode: state, httpStatus: null });
}
function rigBoard(o) {
  o = o || {};
  var P2 = freshPage();
  var acc = freshAccessor();
  var log = wire(o.answers || { 'productPricing.siteUniverse.get': function () { return universeOk([SITE]); } });
  global.KM.DB = global.KM.DB || {};
  var release = null;
  var settlement = new Promise(function (res) { release = res; });
  global.KM.DB.clientCapabilitiesSettlement = function () { return settlement; };
  global.KM.bootArbiter = { whenReady: function () { return Promise.resolve(); } };
  var dom = H.makeDom(partialSkeleton);
  var c = P2.create({ document: dom.document, accessor: acc,
    siteUniverse: UNI, liveAdapter: LIVE, board: null });
  return {
    P: P2, acc: acc, dom: dom, c: c, log: log,
    calls: function (action) { return log.filter(function (x) { return x.action === action; }).length; },
    settle: function (fn) { if (fn) { fn(acc); } release(null); return later(20); }
  };
}
function stateBox(dom) { return dom.document.getElementById('psb-state-host'); }
function boxText(dom) { var h = stateBox(dom); return h ? String(h.textContent || '') : ''; }
function retryBtn(dom) {
  var host = stateBox(dom);
  if (!host) return null;
  var found = null;
  (function walk(n) {
    if (!n || found) return;
    if (n.tagName === 'BUTTON' && n.getAttribute && n.getAttribute('data-cy') === 'psb-state-retry') { found = n; return; }
    (n.childNodes || []).forEach(walk);
  }(host));
  return found;
}

CHAIN = CHAIN.then(function () {
  section('§E — ACTION_MISMATCH on the page: zero requests, and not a product statement');

  var r = rigBoard();
  var p = r.c.loadUniverse();
  return later(5).then(function () {
    return r.settle(function (acc) { driveCap(acc, 'ACTION_MISMATCH'); });
  }).then(function () { return Promise.resolve(p); }).then(function () {
    eq(r.calls(UNIV), 0, 'E1  a settled ACTION_MISMATCH sends ZERO universe reads  [M5]');
    eq(r.calls(WKSP), 0, 'E2  and zero workspace reads');
    eq(r.log.length, 0, 'E3  zero requests of ANY action');
    ok(boxText(r.dom).indexOf('ACTION_MISMATCH') >= 0,
      'E4  it is reported as ACTION_MISMATCH', boxText(r.dom).slice(0, 140));
    ok(boxText(r.dom).indexOf('FEATURE_DISABLED') < 0,
      'E5  and NEVER as FEATURE_DISABLED — a routing fault is not a product decision');
    eq(retryBtn(r.dom), null,
      'E6  with no retry control: an identical request returns an identical answer');
    eq(r.c.state, 'ACTION_MISMATCH', 'E7  the controller state agrees with the box');
    eq(r.log.every(function (x) { return x.kind === 'read'; }), true, 'E8  writes and non-GET = 0');
  });
});

CHAIN = CHAIN.then(function () {
  /* E9-E12 — THE ALLOWLIST IS UNCHANGED, asserted as DATA rather than inferred from behaviour. */
  var acc = freshAccessor();
  eq(acc.SERVER_AUTHORITATIVE_FALLBACK_CODES, ['SOURCE_TIMED_OUT', 'HTTP_NOT_FOUND'],
    'E9  the F3-R4 allowlist is still exactly two codes  [M5]');
  driveCap(acc, 'ACTION_MISMATCH');
  eq(acc.capabilityFallbackEligible(), false,
    'E10 and ACTION_MISMATCH is not eligible for server-authoritative delegation  [M5]');
  var acc2 = freshAccessor();
  driveCap(acc2, 'SOURCE_TIMED_OUT');
  eq(acc2.capabilityFallbackEligible(), true, 'E11 while the two transients still are');
  var acc3 = freshAccessor();
  driveCap(acc3, 'HTTP_NOT_FOUND');
  eq(acc3.capabilityFallbackEligible(), true, 'E12 both of them');
});

CHAIN = CHAIN.then(function () {
  /* E13-E15 — and the accessor itself sends nothing when asked under a mismatch, even if a caller
     passes the opt-in flag. The gate is the mirror, not the request. */
  var acc = freshAccessor();
  var log = wire({});
  driveCap(acc, 'ACTION_MISMATCH');
  return Promise.resolve(acc.getSiteUniverse({ serverAuthoritativeFallback: true })).then(function (env) {
    eq(log.length, 0, 'E13 asking WITH the opt-in under ACTION_MISMATCH still sends nothing  [M5]');
    eq(env.meta.refusalCode, 'ACTION_MISMATCH', 'E14 and refuses with the routing fault');
    eq(env.meta.requestsMade, 0, 'E15 recording zero requests made');
  });
});

/* ===============================================================================================
   §F — THE TWO FEATURE_DISABLED ROADS, AND THE SENTENCE ON EACH.
   =============================================================================================== */
var LOCAL_SENTENCE = 'The capability is off, so no request was sent.';
var SERVER_SENTENCE = 'The server was asked and answered that Product Strategy is switched off in the'
  + ' deployment that replied.';

CHAIN = CHAIN.then(function () {
  section('§F — the FEATURE_DISABLED sentence follows the request, not the code');

  /* F1-F6 — LOCAL. The mirror heard `false`. No request leaves the browser, and the sentence that
     says so is the true one. */
  var r = rigBoard();
  var p = r.c.loadUniverse();
  return later(5).then(function () {
    return r.settle(function (acc) { driveCap(acc, 'SERVER_FALSE'); });
  }).then(function () { return Promise.resolve(p); }).then(function () {
    var t = boxText(r.dom);
    eq(r.log.length, 0, 'F1  a local SERVER_FALSE sends ZERO requests');
    ok(t.indexOf('FEATURE_DISABLED') >= 0, 'F2  reported as FEATURE_DISABLED');
    ok(t.indexOf(LOCAL_SENTENCE) >= 0,
      'F3  and the sentence still says no request was sent, because none was  [M7]', t.slice(0, 200));
    ok(t.indexOf(SERVER_SENTENCE) < 0, 'F4  it does NOT claim a server was asked  [M7]');
    eq(retryBtn(r.dom), null, 'F5  no retry control');
    eq(r.c.state, 'FEATURE_DISABLED', 'F6  and the code is unchanged by this round');
  });
});

CHAIN = CHAIN.then(function () {
  /* F7-F14 — DELEGATED. A settled transient let the SERVER decide; it answered FEATURE_DISABLED.
     One request WAS made, so the second clause of the old sentence is false and only that changes. */
  var r = rigBoard({ answers: { 'productPricing.siteUniverse.get': universeServerDisabled } });
  var p = r.c.loadUniverse();
  return later(5).then(function () {
    return r.settle(function (acc) { driveCap(acc, 'SOURCE_TIMED_OUT'); });
  }).then(function () { return Promise.resolve(p); }).then(function () { return later(5); }).then(function () {
    var t = boxText(r.dom);
    eq(r.calls(UNIV), 1, 'F7  the delegated read was made EXACTLY once');
    eq(r.calls(WKSP), 0, 'F8  and no workspace read followed a refusal');
    eq(r.c.state, 'FEATURE_DISABLED', 'F9  the code is FEATURE_DISABLED — unchanged, and no new code was minted  [M8]');
    ok(t.indexOf(SERVER_SENTENCE) >= 0,
      'F10 the sentence says the SERVER was asked and answered  [M8]', t.slice(0, 240));
    ok(t.indexOf(LOCAL_SENTENCE) < 0,
      'F11 and no longer claims no request was sent, which is now false  [M8]');
    ok(t.indexOf('Product Strategy is not enabled yet') >= 0,
      'F12 the headline is untouched — the product fact did not change, only its provenance');
    eq(retryBtn(r.dom), null, 'F13 and still NO retry on either road  [M9]');
    eq(r.log.every(function (x) { return x.kind === 'read'; }), true, 'F14 writes and non-GET = 0');
  });
});

CHAIN = CHAIN.then(function () {
  /* F15-F18 — THE ACCESSOR'S OWN LOCAL REFUSAL, reaching the same renderer. It stamps
     `transport: 'none'`, so it keeps the sentence that is true for it. This is the road a DIRECT
     call to the controller travels, and it must not be caught by the delegated substitution. */
  var acc = freshAccessor();
  wire({});
  driveCap(acc, 'SERVER_FALSE');
  return Promise.resolve(acc.getSiteUniverse({})).then(function (env) {
    eq(env.meta.transport, 'none', 'F15 the accessor\'s local refusal stamps transport: none');
    eq(env.meta.requestsMade, 0, 'F16 and requestsMade: 0 — both predate this round');
    var u = UNI.adapt(env);
    eq(u.state, 'FEATURE_DISABLED', 'F17 adapting it gives FEATURE_DISABLED');
    var srv = UNI.adapt(universeServerDisabled().envelope);
    eq(srv.state, 'FEATURE_DISABLED',
      'F18 and the SERVER refusal gives the identical state — the state cannot tell them apart, which is why the envelope must');
  });
});

CHAIN = CHAIN.then(function () {
  /* F19-F21 — THE SUBSTITUTION NEEDS POSITIVE PROOF. An envelope that says nothing about its own
     provenance keeps the sentence it has today; fail-closed applies to copy as well as to reads. */
  var P2 = freshPage();
  var src = read(PAGE_FULL);
  ok(/u\.refusedWithoutRequest === false/.test(src),
    'F19 the substitution tests for an explicit FALSE, not for falsiness  [M7]');
  ok(/m\.transport === 'none' \|\| m\.requestsMade === 0/.test(src),
    'F20 and reads the two markers the accessor already stamps');
  ok(/if \(!m \|\| typeof m !== 'object'\) \{ return false; \}/.test(src),
    'F21 an envelope with no meta reads as "a request was made" only through the renderer\'s own guard');
  eq(typeof P2.create, 'function', 'F22 the page module still loads');
});

/* ===============================================================================================
   §G — WHAT THIS ROUND DID NOT CHANGE. Bounds, the settlement, lifecycle, and the census facts
   the enforcement layer was chosen from.
   =============================================================================================== */
CHAIN = CHAIN.then(function () {
  section('§G — the census facts, and the bounds that did not move');

  /* THE CENSUS, ASSERTED AGAINST THE SOURCES IT WAS TAKEN FROM. If any of these stops being true
     the chosen layer stops being the right one, and this suite should be the thing that says so. */
  ok(/function handleGetClientCapabilities_\(\) \{\s*\n\s*return jsonResponse_\(\{ success: true, data: \{/.test(SRC.handlers),
    'G1  handleGetClientCapabilities_ answers { success, data } and stamps NO action — the legacy exception, from the source');
  ok(!/handleGetClientCapabilities_[\s\S]{0,600}meta:/.test(SRC.handlers),
    'G2  there is no meta in that envelope at all');
  ok(/if \(serverAction && serverAction\.toLowerCase\(\) !== str\(ctx\.action\)\.toLowerCase\(\)/.test(SRC.transport),
    'G3  KM.transport compares ONLY when an action is present — the rule this round mirrors');
  ok(/var serverAction = str\(\(isObj\(env\.meta\) && env\.meta\.action\) \|\| env\.attempted_action \|\| ''\);/.test(SRC.transport),
    'G4  and reads the same two fields in the same order');
  ok(/m\.action = action;/.test(SRC.ppw),
    'G5  the productPricing envelope DOES stamp an action — the shape a routing fault would deliver');
  ok(/env\.meta\.action !== SITE_UNIVERSE_ACTION/.test(SRC.accessor)
    && /env\.meta\.action !== ACTION/.test(SRC.accessor),
    'G6  and the business accessor already enforces it on both of its reads — untouched by this round');

  /* THE BOUNDS. Named in §6 as forbidden; asserted so a later edit cannot move them quietly. */
  ok(/KM_READ_TIMEOUT_MS_ = 45000/.test(SRC.dbapi), 'G7  the read timeout is still 45000ms');
  ok(/for \(var attemptN = 1; attemptN <= 2; attemptN\+\+\)/.test(SRC.dbapi),
    'G8  the read runner still makes at most two physical attempts');
  eq((SRC.dbapi.match(/fetch\s*\(/g) || []).length > 0, true,
    'G9  (the db api is the file that owns fetch; this round added none — see G10)');
  /* A DOTTED CALL IS NOT A TRANSPORT OF THE PAGE'S OWN. `live.fetch({...})` is the live
     adapter's method and is how this page is SUPPOSED to read; what must be zero is the page
     opening a transport itself, so the match requires `fetch` not to be preceded by a dot. */
  eq((SRC.page.match(/(^|[^.\w])fetch\s*\(|XMLHttpRequest|\.post\s*\(/g) || []).length, 0,
    'G10 the PAGE opens no direct fetch, XHR or POST of its own');
  ok(/live\.fetch\(\{/.test(SRC.page),
    'G10b and the adapter method it DOES read through is still the one it calls');
  eq((SRC.accessor.match(/fetch\s*\(|XMLHttpRequest/g) || []).length, 0,
    'G11 and neither does the accessor');
  eq((SRC.page.match(/system\.health/g) || []).length, 0, 'G12 system.health is not reached from the page');
  eq((SRC.dbapi.match(/_kmCapVerifyServedAction_/g) || []).length, 2,
    'G13 the verifier is DEFINED once and CALLED once — one rule, one call site');
  ok(/\.then\(_kmCapVerifyServedAction_\);/.test(SRC.dbapi),
    'G14 and it is attached to the capability getter  [M10]');
  ok(/window\.KM\.DB\.getClientCapabilities = function\(\) \{/.test(SRC.dbapi),
    'G15 whose published name is unchanged');
  ok(/return _kmMetadataSingleFlight_\('getClientCapabilities', function \(\) \{ return _kmGapRead_\('getClientCapabilities', \{\}\); \}\)/.test(SRC.dbapi),
    'G16 and whose single-flighted read is byte-identical to what it was');
  eq((SRC.dbapi.match(/_kmClassifyAnswer_\(/g) || []).length, 5,
    'G17 the SHARED classifier still has its four call sites and one definition — this round added none');
  eq((SRC.accessor.match(/SERVER_AUTHORITATIVE_FALLBACK_CODES = \['SOURCE_TIMED_OUT', 'HTTP_NOT_FOUND'\]/g) || []).length, 1,
    'G18 the transient allowlist source is unchanged  [M5]');
  eq((SRC.page.match(/P\.RETRYABLE_CODES = \['SOURCE_TIMED_OUT', 'HTTP_NOT_FOUND', 'SOURCE_NOT_CONNECTED',\n    'RESPONSE_NOT_READABLE', 'BROWSER_OFFLINE'\]/g) || []).length, 1,
    'G19 and FEATURE_DISABLED is still absent from the retryable set  [M9]');
});

CHAIN = CHAIN.then(function () {
  /* G20-G26 — LIFECYCLE AND SINGLE-FLIGHT, unchanged. */
  var r = rigBoard();
  var p = r.c.loadUniverse();
  return later(5).then(function () {
    r.c.alive = false;
    return r.settle(function (acc) { driveCap(acc, 'ACTION_MISMATCH'); });
  }).then(function () { return Promise.resolve(p); }).then(function () { return later(5); }).then(function () {
    eq(r.log.length, 0, 'G20 a settlement that lands after unmount issues NOTHING');
    eq(r.calls(UNIV), 0, 'G21 including the universe read');
  }).then(function () {
    /* G22-G24 — the single-flight fallback is still the branch a missing transport takes, and the
       verification does not turn one read into two. */
    var rr = rig({ answer: capsCanonical });
    return Promise.all([rr.get(), rr.get(), rr.get()]).then(function (all) {
      eq(rr.reads.length, 3,
        'G22 three direct getter calls with NO shared latch are three reads — the fallback branch, unchanged');
      eq(all.every(function (x) { return x.success === true; }), true, 'G23 and each is verified independently');
      var rf = rig({ answer: function () { return foreign('productPricing.workspace.get'); } });
      return Promise.all([rf.get(), rf.get()]).then(function (two) {
        eq(two.every(function (x) { return x.success === false; }), true,
          'G24 a foreign answer is refused for every consumer, not just the first');
        eq(rf.reads.length, 2, 'G25 and refusing never adds a read of its own');
      });
    });
  });
});

/* ===============================================================================================
   §M — TEN MUTANTS, EACH DRIVEN.

   A mutant is APPLIED TO THE SHIPPED FILE, the module is re-required, and the probe that runs is
   the one the paired assertion runs. A regex over the mutated text would pass against a build where
   the edit changed nothing — which is the failure mode that makes a mutation score a lie.
   =============================================================================================== */
function mutateFile(rel, from, to) {
  var full = path.join(ROOT, rel);
  var original = fs.readFileSync(full, 'utf8');
  var normalized = original.replace(/\r\n/g, '\n');
  if (normalized.split(from).length - 1 !== 1) { return null; }
  return { full: full,
    apply: function () { fs.writeFileSync(full, normalized.split(from).join(to), 'utf8'); },
    restore: function () { fs.writeFileSync(full, original, 'utf8'); } };
}
function withMutant(rel, from, to, probe) {
  var m = mutateFile(rel, from, to);
  if (!m) { return Promise.resolve(false); }     // anchor missing or ambiguous: scored as SURVIVED, loudly
  m.apply();
  var done = function (v) { m.restore(); return v; };
  var boom = function (e) { m.restore(); throw e; };
  try { return Promise.resolve(probe()).then(done, boom); }
  catch (e) { m.restore(); throw e; }
}
function score(label, p) {
  return Promise.resolve(p).then(function (caught) {
    if (caught === true) { mutCaught++; console.log('  ok   ' + label + ' (caught)'); }
    else { mutSurvived++; console.error('  FAIL ' + label + ' — MUTANT SURVIVED'); }
  }, function () { mutCaught++; console.log('  ok   ' + label + ' (caught by a throw)'); });
}
var DB_REL = 'assets/js/api/operation-system-db-api.js';
var ACC_REL = 'assets/js/api/km-product-pricing-workspace.js';
var PAGE_REL = 'assets/js/pages/product-strategy-board.js';

/* Re-lifts the CURRENT db api bytes and runs one bootstrap against a foreign answer. Every
   db-api mutant is scored on what the four consumers hold afterwards. */
function bootstrapUnderCurrentBytes(answer) {
  var cur = read(path.join(JS, 'api', 'operation-system-db-api.js'));
  var f4 = slice(cur, F4_FROM, F4_TO), boot = slice(cur, BOOT_FROM, BOOT_TO);
  if (f4 === null || boot === null) { return Promise.resolve(null); }
  var acc = freshAccessor();
  var applied = [];
  var win = { KM: { DB: {},
    api: { applyClientCapabilities: function (c) { applied.push(c); return c || { fromBackend: false }; },
      getClientCapabilitySnapshot: function () { return null; } },
    productPricingWorkspace: acc } };
  var ctx = { window: win, Promise: Promise, Date: Date, JSON: JSON, String: String,
    console: { warn: function () {}, error: function () {}, log: function () {} },
    _kmCapSeq_: 0, _kmCapAppliedSeq_: 0, _kmCapAppliedFromBackend_: false,
    _kmCapDeploymentIdentity_: function () { return 'dep-1'; },
    _kmMetadataSingleFlight_: function (k, fn) { return Promise.resolve().then(fn); },
    _kmGapRead_: function () { return Promise.resolve(answer()); } };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(f4, ctx, { filename: 'mutant#f4' });
  vm.runInContext(boot, ctx, { filename: 'mutant#boot' });
  return Promise.resolve(win.KM.DB.applyClientCapabilities()).then(function () { return later(5); })
    .then(function () {
      return { state: acc.capabilityState(), failure: acc.capabilityFailure(),
        enabled: acc.isEnabled(), applied: applied, fromBackend: ctx._kmCapAppliedFromBackend_ };
    });
}
var FOREIGN = function () { return foreign('productPricing.workspace.get'); };

/* Runs one settled-capability page life against the CURRENT bytes. */
function pageFor(state, answers) {
  var r = rigBoard({ answers: answers });
  var p = r.c.loadUniverse();
  return later(5).then(function () {
    return r.settle(function (acc) { driveCap(acc, state); });
  }).then(function () { return Promise.resolve(p); }).then(function () { return later(5); })
    .then(function () { return { r: r, text: boxText(r.dom), retry: retryBtn(r.dom),
      universe: r.calls(UNIV), state: r.c.state }; });
}

CHAIN = CHAIN.then(function () {
  section('§M — ten mutants, each driven');

  return score('M1  the action comparison is removed  [B4, D3]',
    withMutant(DB_REL,
      "    if (served.toLowerCase() === KM_CAPABILITY_ACTION_.toLowerCase()) { return res; }",
      "    return res;",
      function () {
        return bootstrapUnderCurrentBytes(FOREIGN).then(function (o) {
          return !o || o.state !== 'FAILED' ? true : false;
        });
      }))

  .then(function () {
    return score('M2  it compares the WRONG FIELD — `data.action` instead of the envelope\'s  [A5, D3]',
      withMutant(DB_REL,
        "    var a = (m && typeof m === 'object' && m.action !== undefined) ? m.action : env.attempted_action;",
        "    var a = (env.data && typeof env.data === 'object') ? env.data.action : env.attempted_action;",
        function () {
          return bootstrapUnderCurrentBytes(FOREIGN).then(function (o) {
            return !o || o.state !== 'FAILED' ? true : false;
          });
        }));
  })

  .then(function () {
    return score('M3  a mismatch is detected and the payload is APPLIED anyway  [B10, D2, D7]',
      withMutant(DB_REL,
        "    return { success: false, error: {\n        code: 'RESPONSE_ACTION_MISMATCH',",
        "    if (served) { return res; }\n    return { success: false, error: {\n        code: 'RESPONSE_ACTION_MISMATCH',",
        function () {
          return bootstrapUnderCurrentBytes(FOREIGN).then(function (o) {
            return !o || o.fromBackend !== false || o.applied[0] !== null ? true : false;
          });
        }));
  })

  .then(function () {
    return score('M4  a mismatch is turned into a SERVER answer instead of a fault  [D3, D5]',
      withMutant(DB_REL,
        "    if (!res || res.success !== true) { return res; }",
        "    if (!res || res.success !== true) { return res; }\n    if (res.envelope && res.envelope.meta && res.envelope.meta.action) {\n        return { success: true, data: { product_strategy_enabled: true } };\n    }",
        function () {
          return bootstrapUnderCurrentBytes(FOREIGN).then(function (o) {
            return !o || o.state !== 'FAILED' || o.enabled !== false ? true : false;
          });
        }));
  })

  .then(function () {
    return score('M5  ACTION_MISMATCH is admitted to the F3-R4 transient allowlist  [E1, E9, E10]',
      withMutant(ACC_REL,
        "var SERVER_AUTHORITATIVE_FALLBACK_CODES = ['SOURCE_TIMED_OUT', 'HTTP_NOT_FOUND'];",
        "var SERVER_AUTHORITATIVE_FALLBACK_CODES = ['SOURCE_TIMED_OUT', 'HTTP_NOT_FOUND', 'ACTION_MISMATCH'];",
        function () {
          return pageFor('ACTION_MISMATCH').then(function (o) { return o.universe !== 0; });
        }));
  })

  .then(function () {
    return score('M6  every action reads as MISSING, so the rule can never fire  [B1 vs B4, D3]',
      withMutant(DB_REL,
        "    if (!env || typeof env !== 'object') { return ''; }",
        "    if (env || !env) { return ''; }",
        function () {
          return bootstrapUnderCurrentBytes(FOREIGN).then(function (o) {
            return !o || o.state !== 'FAILED' ? true : false;
          });
        }));
  })

  .then(function () {
    return score('M7  the LOCAL refusal is handed the SERVER sentence  [F3, F19]',
      withMutant(PAGE_REL,
        "      if (u.state === 'FEATURE_DISABLED' && u.refusedWithoutRequest === false) {",
        "      if (u.state === 'FEATURE_DISABLED') {",
        function () {
          /* THE ROAD THAT REDRAWS A RETAINED REFUSAL THROUGH `renderUniverseRefusal`.
             The board's capability gate answers a local FEATURE_DISABLED in its own branch and
             never reaches that function, so driving `loadUniverse` cannot observe this mutant at
             all - which is what the first cut of this probe did, and it scored a survivor for a
             probe that was not testing it. The retry settle handler is the path that redraws
             `C.universe` when it is not OK, and a universe refused WITHOUT a request reaching the
             wire is exactly the case the guard exists to keep honest there. */
          var P2 = freshPage();
          var acc = freshAccessor();
          wire({});
          global.KM.DB = global.KM.DB || {};
          global.KM.DB.clientCapabilitiesSettlement = function () { return null; };
          global.KM.bootArbiter = { whenReady: function () { return Promise.resolve(); } };
          var dom = H.makeDom(partialSkeleton);
          var c = P2.create({ document: dom.document, accessor: acc,
            siteUniverse: UNI, liveAdapter: LIVE, board: null });
          driveCap(acc, 'SERVER_FALSE');
          return Promise.resolve(acc.getSiteUniverse({})).then(function (env) {
            var u = UNI.adapt(env);
            u.refusedWithoutRequest = true;            // the accessor stamped transport: 'none'
            c.universe = u;
            return Promise.resolve(c.retryUniverse()).then(function () { return later(15); });
          }).then(function () {
            return boxText(dom).indexOf(SERVER_SENTENCE) >= 0;
          });
        }));
  })

  .then(function () {
    return score('M8  the DELEGATED refusal keeps the "no request was sent" sentence  [F10, F11]',
      withMutant(PAGE_REL,
        "        detail = 'The server was asked and answered that Product Strategy is switched off in the'\n          + ' deployment that replied.';",
        "        detail = ux.detail;",
        function () {
          return pageFor('SOURCE_TIMED_OUT',
            { 'productPricing.siteUniverse.get': universeServerDisabled }).then(function (o) {
            return o.text.indexOf(SERVER_SENTENCE) < 0;
          });
        }));
  })

  .then(function () {
    return score('M9  a FEATURE_DISABLED refusal is offered a retry  [F13, G19]',
      withMutant(PAGE_REL,
        "  P.RETRYABLE_CODES = ['SOURCE_TIMED_OUT', 'HTTP_NOT_FOUND', 'SOURCE_NOT_CONNECTED',\n    'RESPONSE_NOT_READABLE', 'BROWSER_OFFLINE'];",
        "  P.RETRYABLE_CODES = ['SOURCE_TIMED_OUT', 'HTTP_NOT_FOUND', 'SOURCE_NOT_CONNECTED',\n    'RESPONSE_NOT_READABLE', 'BROWSER_OFFLINE', 'FEATURE_DISABLED'];",
        function () {
          return pageFor('SOURCE_TIMED_OUT',
            { 'productPricing.siteUniverse.get': universeServerDisabled }).then(function (o) {
            return o.retry !== null;
          });
        }));
  })

  .then(function () {
    /* THE CHECK RUNS BUT DOES NOT GATE. It is called, its verdict is computed, and the ORIGINAL
       answer is handed on to the consumers regardless — which is what "the action check happens
       after the consumers are updated" costs, expressed as an edit. */
    return score('M10 the verification runs but its verdict is discarded  [C1, D2, D7]',
      withMutant(DB_REL,
        "        .then(_kmCapVerifyServedAction_);",
        "        .then(function (r) { _kmCapVerifyServedAction_(r); return r; });",
        function () {
          return bootstrapUnderCurrentBytes(FOREIGN).then(function (o) {
            return !o || o.fromBackend !== false || o.applied[0] !== null ? true : false;
          });
        }));
  });
});

CHAIN.then(function () {
  REACHED_THE_END = true;
  console.log('');
  console.log('passed ' + pass + '  failed ' + fail
    + '  |  mutants caught ' + mutCaught + '  survived ' + mutSurvived);
  if (fail > 0 || mutSurvived > 0) { process.exitCode = 1; }
}, function (e) {
  REACHED_THE_END = true;
  console.error('  FAIL SUITE THREW — ' + (e && e.stack || e));
  process.exitCode = 1;
});
