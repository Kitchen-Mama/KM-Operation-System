/**
 * PRODUCT-STRATEGY-P1-B8D-R10E-F3-R4 — CAPABILITY SETTLEMENT SIGNAL AND THE NARROW TRANSIENT FALLBACK
 * =================================================================================================
 *
 * WHAT WAS MEASURED, AND WHAT IT LEFT BROKEN.
 *
 * Twenty fresh cold boots on the deployed bytes settled the capability nineteen times. The
 * twentieth did not, and the reason was not a server refusing: the handler completed in five
 * seconds and the browser received nothing, because the failure lives in the /exec -> echo delivery
 * hop that server code cannot influence. The same twenty sessions showed something the arbiter was
 * never told about — in nineteen of them the capability settled AFTER the eight-second boot cap,
 * once eighty-two seconds after the read began. So a page that waited on the arbiter alone woke to
 * a mirror that still said PENDING, said so honestly, and then had no second moment to look again.
 * The answer arrived to nobody.
 *
 * THIS ROUND ADDS TWO THINGS AND NOTHING ELSE.
 *
 *   1. A SETTLEMENT SIGNAL. One promise — the one the shared bootstrap is already running — handed
 *      to whoever asks. No timer, no poll, no listener loop, no second read, no second mirror. It
 *      resolves with NOTHING on purpose, so a caller cannot mistake it for the answer; the caller
 *      re-reads the capability mirror, which stays the single authority.
 *
 *   2. A CLOSED TWO-CODE ALLOWLIST. SOURCE_TIMED_OUT and HTTP_NOT_FOUND — and only those two — may,
 *      once the capability has genuinely settled, be decided by the server's own feature gate
 *      instead of by the browser's silence. Both mean the answer never arrived and nothing was
 *      learned, and `productPricing.siteUniverse.get` refuses FEATURE_DISABLED before it opens any
 *      data source, so the flag is decided where the flag is defined.
 *
 * WHAT IS DELIBERATELY NOT IN THE ALLOWLIST, AND WHY THIS SUITE SPENDS SO MANY ASSERTIONS ON IT.
 * BROWSER_OFFLINE, NOT_AUTHORIZED, FIELD_ABSENT, RESPONSE_NOT_READABLE, SOURCE_NOT_CONNECTED,
 * FEATURE_DISABLED, SOURCE_EMPTY, SOURCE_PARTIALLY_READABLE, SCHEMA_CONTRACT_MISMATCH,
 * ACTION_MISMATCH, STOP_DATA_INTEGRITY and every code nobody has invented yet all keep the
 * fail-closed refusal they have today, at zero requests. In each of those the browser ALREADY knows
 * something definite — there is no network, there is no session, a server answered and its answer
 * carried no such field — and a read dispatched into that knowledge is a request known in advance
 * to be pointless. §D drives every one of them and counts the requests, and §M kills a mutant for
 * each of the four most tempting additions, because an allowlist that is not pinned from BOTH sides
 * is a list that grows quietly.
 *
 * THE FAIL-CLOSED DEFAULT IS THE ABSENCE OF THE SIGNAL, NOT THE PRESENCE OF A FLAG. A build with no
 * shared bootstrap — an older db api, or any harness that drives the mirror directly — gets `null`
 * from the getter, waits for nothing, delegates nothing and sends nothing. That is why every suite
 * written before this round keeps its exact behaviour: none of them has a bootstrap, so none of them
 * can reach the new path. §F asserts that as a property rather than leaving it to be discovered.
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
var PAGE = require(path.join(JS, 'pages', 'product-strategy-board.js'));

var ACC_FULL = path.join(JS, 'api', 'km-product-pricing-workspace.js');
var SRC = {
  dbapi: read(path.join(JS, 'api', 'operation-system-db-api.js')),
  page: read(path.join(JS, 'pages', 'product-strategy-board.js')),
  accessor: read(ACC_FULL),
  arbiter: read(path.join(JS, 'core', 'boot-read-arbiter.js')),
  index: readRoot('index.html'),
  partial: readRoot('assets/html/pages/product-strategy-board.html')
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
function decomment(s) { return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1'); }

console.log('PRODUCT STRATEGY — CAPABILITY SETTLEMENT SIGNAL (P1-B8D-R10E-F3-R4)');

/* ===============================================================================================
   THE SHIPPED BOOTSTRAP, LIFTED BY ITS OWN MARKERS AND RUN.

   The settlement signal is a property of a function that cannot be imported: the db api is a
   browser file six thousand lines long. So the capability bootstrap is cut out of the SHIPPED
   BYTES by markers that are part of the production source, and executed in a sandbox whose only
   stubs are the things it calls out to. The mirror it writes is the REAL accessor module — the
   same one the page reads — so "the bootstrap settles and the page wakes up" is one chain here
   rather than two halves that never meet.

   WHAT IS STUBBED IS THE WIRE, NOT THE SUBJECT. `getClientCapabilities` is the read; stubbing it
   is what makes an answer, a failure and a hang all reachable in a test. Stubbing the settlement
   would be testing the test.
   =============================================================================================== */
var BOOT_FROM = '/* ==================================================================================================\n   PRODUCT-STRATEGY-P1-B8D-R10E-F3-R4 §2';
var BOOT_TO = 'window.KM.DB.capabilityRetryState = function () {';
var bi = SRC.dbapi.indexOf(BOOT_FROM);
var bj = SRC.dbapi.indexOf(BOOT_TO);
if (bi < 0 || bj < 0 || bj <= bi) {
  console.error('FAIL STOP_BOOTSTRAP_BLOCK_NOT_LOCATABLE — the shipped markers moved');
  process.exitCode = 2;
  REACHED_THE_END = true;
  return;
}
var BOOT_SRC = SRC.dbapi.slice(bi, bj);

function freshAccessor() {
  delete require.cache[require.resolve(ACC_FULL)];
  return require(ACC_FULL);
}

/* One sandboxed bootstrap, wired to one fresh accessor. `answer` is what the capability read
   resolves with; a function may hold it open. Nothing here schedules anything. */
function bootstrapRig(opts) {
  opts = opts || {};
  var acc = freshAccessor();
  var reads = 0;
  var identity = opts.identity || function () { return 'dep-1'; };
  var win = {
    KM: {
      DB: { getClientCapabilities: function () { reads++; return Promise.resolve(opts.answer()); } },
      api: {
        applyClientCapabilities: function (caps) { return caps || {}; },
        getClientCapabilitySnapshot: function () { return null; }
      },
      productPricingWorkspace: acc
    }
  };
  var ctx = {
    window: win, Promise: Promise, Date: Date, JSON: JSON,
    console: { warn: function () {}, error: function () {}, log: function () {} },
    _kmCapSeq_: 0, _kmCapAppliedSeq_: 0, _kmCapAppliedFromBackend_: false,
    _kmCapDeploymentIdentity_: identity
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(BOOT_SRC, ctx, { filename: 'operation-system-db-api.js#capability-bootstrap' });
  return {
    acc: acc, win: win, ctx: ctx,
    reads: function () { return reads; },
    apply: function () { return win.KM.DB.applyClientCapabilities(); },
    retry: function () { return win.KM.DB.retryClientCapabilities(); },
    settlement: function () { return win.KM.DB.clientCapabilitiesSettlement(); }
  };
}

function later(ms) { return new Promise(function (r) { setTimeout(r, ms || 0); }); }
/* `navigator` IS A GETTER-ONLY GLOBAL UNDER NODE, so an offline scenario has to be defined onto the
   global rather than assigned, and put back exactly as it was. The classifier reads `navigator.onLine`
   and `online === false` is the only thing that tells an offline read from a slow one, so this is
   the input BROWSER_OFFLINE genuinely arrives on. */
function offline(fn) {
  var had = Object.prototype.hasOwnProperty.call(global, 'navigator');
  var prior = had ? Object.getOwnPropertyDescriptor(global, 'navigator') : null;
  Object.defineProperty(global, 'navigator', { value: { onLine: false }, configurable: true, writable: true });
  try { return fn(); }
  finally {
    if (prior) { Object.defineProperty(global, 'navigator', prior); }
    else { delete global.navigator; }
  }
}
function capsTrue() { return { success: true, data: { product_strategy_enabled: true } }; }
function capsFalse() { return { success: true, data: { product_strategy_enabled: false } }; }
function capsAbsent() { return { success: true, data: { capabilitiesVersion: 'x' } }; }
function capsFail(code, status) {
  return { success: false, error: { code: code, transport: { code: code },
    details: (typeof status === 'number' ? { http_status: status } : {}) } };
}

var CHAIN = Promise.resolve();

/* ===============================================================================================
   §A — THE SETTLEMENT SIGNAL. One promise, asked for and never polled.
   =============================================================================================== */
CHAIN = CHAIN.then(function () {
  section('§A — the shared settlement signal, on the shipped bootstrap bytes');

  var r = bootstrapRig({ answer: capsTrue });
  eq(typeof r.win.KM.DB.clientCapabilitiesSettlement, 'function',
    'A1  the db api publishes a settlement accessor');
  eq(r.settlement(), null,
    'A2  and before the bootstrap has run it answers NULL — fail closed, nothing to wait on');
  eq(r.reads(), 0, 'A3  asking for it dispatched ZERO capability reads  [M12]');

  var p0 = r.apply();
  var s1 = r.settlement(), s2 = r.settlement(), s3 = r.settlement();
  ok(s1 && typeof s1.then === 'function', 'A4  one bootstrap call arms it with a promise');
  ok(s1 === s2 && s2 === s3, 'A5  and every later ask returns the IDENTICAL promise object');
  eq(r.reads(), 1, 'A6  three asks and one bootstrap cost exactly ONE capability read  [M12]');

  var resolvedWith = 'NOT-SETTLED';
  var rejected = false;
  s1.then(function (v) { resolvedWith = v; }, function () { rejected = true; });

  return Promise.resolve(p0).then(function () { return later(5); }).then(function () {
    eq(resolvedWith, null,
      'A7  it RESOLVES once the bootstrap settles, and resolves with null  [M9: the payload is not an authority]');
    eq(rejected, false, 'A8  it does not reject');
    eq(r.acc.capabilityState(), 'SERVER_TRUE', 'A9  while the MIRROR is where the answer actually landed');
    eq(r.settlement(), s1, 'A10 and the promise identity survives settlement');
  });
});

CHAIN = CHAIN.then(function () {
  /* A11-A14 — the failure half. A bootstrap that could not be completed settles the signal too;
     a signal that only resolved on success would leave the waiter exactly where this round found it. */
  var r = bootstrapRig({ answer: function () { return capsFail('REQUEST_TIMEOUT'); } });
  var p = r.apply();
  var s = r.settlement();
  var settled = false, rejected = false;
  s.then(function () { settled = true; }, function () { rejected = true; });
  return Promise.resolve(p).then(function () { return later(5); }).then(function () {
    eq(settled, true, 'A11 a FAILED bootstrap settles the signal as well as a successful one');
    eq(rejected, false, 'A12 and it still does not reject  [M: a rejection would surface as an unhandled error]');
    eq(r.acc.capabilityState(), 'FAILED', 'A13 the mirror carries the failure');
    eq(r.acc.capabilityFailure(), 'SOURCE_TIMED_OUT', 'A14 classified by the shipped classifier');
  });
});

CHAIN = CHAIN.then(function () {
  /* A15-A18 — THE USER RETRY MUST NOT REPLACE THE BOOTSTRAP PROMISE. The retry calls the same
     internal function, so the only thing standing between it and a replaced signal is the arm
     guard. Driven, not read. */
  var r = bootstrapRig({ answer: function () { return capsFail('REDIRECT_TARGET_NOT_FOUND', 404); } });
  var p = r.apply();
  var before = r.settlement();
  return Promise.resolve(p).then(function () { return later(5); }).then(function () {
    eq(r.acc.capabilityFailure(), 'HTTP_NOT_FOUND', 'A15 the bootstrap settled as an echo 404');
    var rp = r.retry();
    eq(r.settlement(), before,
      'A16 a user retry does NOT replace the bootstrap settlement promise  [M11]');
    return Promise.resolve(rp).then(function () { return later(5); }).then(function () {
      eq(r.settlement(), before, 'A17 and it still does not after the retry has finished  [M11]');
      eq(r.reads(), 2, 'A18 while the retry WAS a real second read — one bootstrap, one retry');
    });
  });
});

CHAIN = CHAIN.then(function () {
  /* A19 — A DISCARDED ANSWER STILL RELEASES THE SIGNAL. The deployment-identity branch returns
     without writing the mirror, and a signal left pending there would reinstate the permanent
     LOADING this round exists to end. */
  var n = 0;
  var r = bootstrapRig({ answer: capsTrue, identity: function () { n++; return 'dep-' + n; } });
  var p = r.apply();
  var s = r.settlement();
  var settled = false;
  s.then(function () { settled = true; }, function () { settled = 'REJECTED'; });
  return Promise.resolve(p).then(function () { return later(5); }).then(function () {
    eq(settled, true, 'A19 an answer DISCARDED by the supersede guard still releases the signal');
    eq(r.acc.capabilityState(), 'PENDING', 'A19b and the mirror is correctly left unwritten');
  });
});

/* ===============================================================================================
   §B — THE ALLOWLIST, IN THE MODULE THAT CLASSIFIES THE FAILURE.
   =============================================================================================== */
var FORBIDDEN = ['BROWSER_OFFLINE', 'NOT_AUTHORIZED', 'RESPONSE_NOT_READABLE',
  'SOURCE_NOT_CONNECTED', 'ACTION_MISMATCH', 'SCHEMA_CONTRACT_MISMATCH',
  'SOURCE_EMPTY', 'SOURCE_PARTIALLY_READABLE', 'STOP_DATA_INTEGRITY', 'FEATURE_DISABLED',
  'CAPABILITY_NOT_REPORTED', 'A_CODE_NOBODY_HAS_INVENTED_YET'];

/* The TRANSPORT inputs production actually sends, so the classifier decides and this file does
   not get to name a state the wire cannot produce. */
var DRIVER = {
  SOURCE_TIMED_OUT: ['REQUEST_TIMEOUT', null],
  HTTP_NOT_FOUND: ['REDIRECT_TARGET_NOT_FOUND', 404],
  NOT_AUTHORIZED: ['AUTH_OR_ACCESS_HTML', 401],
  RESPONSE_NOT_READABLE: ['TRANSPORT_NON_JSON_RESPONSE', null],
  SOURCE_NOT_CONNECTED: ['HTTP_TRANSPORT_ERROR', null],
  ACTION_MISMATCH: ['RESPONSE_ACTION_MISMATCH', null]
};

CHAIN = CHAIN.then(function () {
  section('§B — the closed allowlist, held once, by the classifier that produces the codes');

  var A = freshAccessor();
  eq(A.SERVER_AUTHORITATIVE_FALLBACK_CODES, ['SOURCE_TIMED_OUT', 'HTTP_NOT_FOUND'],
    'B1  the allowlist is EXACTLY the two transient codes  [M1, M2]');
  eq(typeof A.capabilityFallbackEligible, 'function', 'B2  and eligibility has one implementation');

  eq(A.capabilityFallbackEligible(), false, 'B3  a module nobody has spoken to is not eligible — PENDING is not a fault');

  Object.keys(DRIVER).forEach(function (state) {
    var m = freshAccessor();
    m.setCapability(null, { failureCode: DRIVER[state][0], httpStatus: DRIVER[state][1] });
    eq(m.capabilityFailure(), state, 'B4.' + state + ' the driver produces ' + state);
    var want = (state === 'SOURCE_TIMED_OUT' || state === 'HTTP_NOT_FOUND');
    eq(m.capabilityFallbackEligible(), want,
      'B5.' + state + ' eligible = ' + want + (want ? '' : '  [fails closed]'));
  });

  /* B6 — offline is the one that can arrive wearing a timeout's clothes, and the classifier is
     what tells them apart. Driven through the same setter with the browser reporting offline. */
  var mo = offline(function () {
    var m = freshAccessor();
    m.setCapability(null, { failureCode: 'REQUEST_TIMEOUT', httpStatus: null });
    return m;
  });
  eq(mo.capabilityFailure(), 'BROWSER_OFFLINE', 'B6  an offline browser is BROWSER_OFFLINE, not a timeout');
  eq(mo.capabilityFallbackEligible(), false, 'B7  and it is NOT eligible  [M3]');

  [['SERVER_FALSE', { product_strategy_enabled: false }], ['FIELD_ABSENT', {}],
    ['SERVER_TRUE', { product_strategy_enabled: true }]].forEach(function (c) {
      var m = freshAccessor();
      m.setCapability(c[1]);
      eq(m.capabilityState(), c[0], 'B8.' + c[0] + ' the mirror reports ' + c[0]);
      eq(m.capabilityFallbackEligible(), false,
        'B9.' + c[0] + ' and a server that ANSWERED is never delegated  [M5]');
    });
  return null;
});

/* ===============================================================================================
   §C — THE ACCESSOR GATE. Asking is not enough, and the default is unchanged.
   =============================================================================================== */
function wire(answers) {
  var log = [];
  global.KM = global.KM || {};
  /* THE FOUNDATION IS PRESENT BUT EMPTY OF ROUTING. `transportOf()` is the accessor's check that an
     application exists at all, and `sharedTransport()` is the thing that actually carries the read;
     both are required, so both are supplied, and only the second one answers. */
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
    meta: { action: 'productPricing.siteUniverse.get' }, errors: [] } };
}
function universeRefused(code) {
  return { success: true, envelope: { success: true,
    data: { sites: [], refusals: [{ code: code }], sourceState: code },
    meta: { action: 'productPricing.siteUniverse.get', refused: true, refusalCode: code },
    errors: [] } };
}
var SITE = { company: 'KM', country: 'US', marketplace: 'Shopify',
  membership_row_count: 3, active_count: 3, phasing_out_count: 0, inactive_count: 0,
  discontinued_count: 0, unknown_status_count: 0, blank_id_count: 0, refusal_reasons: [],
  default_status_row_count: 0, selectable: true, selectable_with_inactive: true,
  site_key: 'KM|US|Shopify' };
var UNIV = 'productPricing.siteUniverse.get';

CHAIN = CHAIN.then(function () {
  section('§C — the accessor gate: the opt-in is necessary AND not sufficient');

  var log = wire({ 'productPricing.siteUniverse.get': function () { return universeOk([SITE]); } });
  var m = freshAccessor();
  m.setCapability(null, { failureCode: 'REQUEST_TIMEOUT', httpStatus: null });

  return Promise.resolve(m.getSiteUniverse({})).then(function (env) {
    eq(log.length, 0, 'C1  WITHOUT the opt-in a transient capability still refuses at ZERO requests');
    eq(env.data.refusals[0].code, 'SOURCE_TIMED_OUT', 'C2  and reports the transport fault it has');
    return Promise.resolve(m.getSiteUniverse({ serverAuthoritativeFallback: true }));
  }).then(function (env) {
    eq(log.length, 1, 'C3  WITH the opt-in it dispatches exactly ONE read  [M1]');
    eq(log[0], { action: UNIV, kind: 'read' }, 'C4  and it is a READ of the site universe — no new action');
    eq(env.data.sourceState, 'READY', 'C5  the server answered and the answer is passed through unchanged');

    var m2 = freshAccessor();
    m2.setCapability(null, { failureCode: 'AUTH_OR_ACCESS_HTML', httpStatus: 401 });
    return Promise.resolve(m2.getSiteUniverse({ serverAuthoritativeFallback: true })).then(function (e2) {
      eq(log.length, 1, 'C6  a caller ASKING under NOT_AUTHORIZED gets nothing dispatched  [M4]');
      eq(e2.data.refusals[0].code, 'NOT_AUTHORIZED', 'C7  and the refusal it already had');
    });
  }).then(function () {
    var m3 = freshAccessor();
    m3.setCapability({ product_strategy_enabled: false });
    return Promise.resolve(m3.getSiteUniverse({ serverAuthoritativeFallback: true })).then(function (e3) {
      eq(log.length, 1, 'C8  nor under an explicit server FALSE — a decision is not a fault');
      eq(e3.data.refusals[0].code, 'FEATURE_DISABLED', 'C9  which is still reported as FEATURE_DISABLED');
    });
  }).then(function () {
    var m4 = freshAccessor();
    m4.setCapability({});
    return Promise.resolve(m4.getSiteUniverse({ serverAuthoritativeFallback: true })).then(function (e4) {
      eq(log.length, 1, 'C10 nor under a missing field — a server ANSWERED  [M5]');
      eq(e4.data.refusals[0].code, 'CAPABILITY_NOT_REPORTED', 'C11 reported in its own words');
      var m5 = freshAccessor();
      return Promise.resolve(m5.getSiteUniverse({ serverAuthoritativeFallback: true })).then(function (e5) {
        eq(log.length, 1, 'C12 nor while the capability is still PENDING  [M7]');
        eq(e5.data.refusals[0].code, 'CAPABILITY_NOT_ESTABLISHED', 'C13 which is not a fault either');
      });
    });
  });
});

/* ===============================================================================================
   §D — THE BOARD, DRIVEN. The state/code matrix, counted in requests.
   =============================================================================================== */
function rigBoard(o) {
  o = o || {};
  var acc = freshAccessor();
  var log = wire(o.answers || { 'productPricing.siteUniverse.get': function () { return universeOk([SITE]); } });
  global.KM.DB = global.KM.DB || {};
  var release = null;
  var settlement = (o.noBootstrap === true) ? null
    : new Promise(function (res) { release = res; });
  global.KM.DB.clientCapabilitiesSettlement = function () { return settlement; };
  /* THE ARBITER'S CAP, ALREADY FIRED. Eight seconds of real time is not the subject; what the
     page does on the other side of it is. */
  global.KM.bootArbiter = { whenReady: function () { return Promise.resolve(); } };
  var dom = H.makeDom(partialSkeleton);
  var c = PAGE.create({ document: dom.document, accessor: acc,
    siteUniverse: UNI, liveAdapter: LIVE, board: null });
  return {
    acc: acc, dom: dom, c: c, log: log,
    universeCalls: function () {
      return log.filter(function (x) { return x.action === UNIV; }).length;
    },
    settle: function (fn) { if (fn) { fn(acc); } if (release) { release(null); } return later(15); }
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
function driveCap(acc, state) {
  if (state === 'SERVER_TRUE') { return acc.setCapability({ product_strategy_enabled: true }); }
  if (state === 'SERVER_FALSE') { return acc.setCapability({ product_strategy_enabled: false }); }
  if (state === 'FIELD_ABSENT') { return acc.setCapability({}); }
  if (state === 'BROWSER_OFFLINE') {
    return offline(function () {
      return acc.setCapability(null, { failureCode: 'HTTP_TRANSPORT_ERROR', httpStatus: null });
    });
  }
  if (DRIVER[state]) {
    return acc.setCapability(null, { failureCode: DRIVER[state][0], httpStatus: DRIVER[state][1] });
  }
  return acc.setCapability(null, { failureCode: state, httpStatus: null });
}

CHAIN = CHAIN.then(function () {
  section('§D — the board: capped, still PENDING, then settled');

  var r = rigBoard();
  var p = r.c.loadUniverse();
  return later(10).then(function () {
    eq(r.universeCalls(), 0,
      'D1  the arbiter cap fired, the mirror is still PENDING, and ZERO universe reads left  [M7]');
    eq(r.c.state, PAGE.LOADING_CAPABILITY,
      'D2  the page is in LOADING_CAPABILITY \u2014 still finding out, not an empty board');
    eq(r.c.capabilitySettlementWaiting, true, 'D3  and exactly one continuation is attached');
    return r.settle(function (acc) { driveCap(acc, 'SERVER_TRUE'); });
  }).then(function () {
    return Promise.resolve(p);
  }).then(function () {
    eq(r.universeCalls(), 1,
      'D4  the settlement wakes it and it reads the universe EXACTLY once  [M8: never twice]');
    eq(r.c.capabilitySettlementWaiting, false, 'D5  the continuation is released');
    eq(r.c.universe && r.c.universe.state, 'OK', 'D6  and the universe is usable');
    eq(r.log.every(function (x) { return x.kind === 'read'; }), true,
      'D7  every request in the page life was a READ — writes and non-GET = 0');
  });
});

CHAIN = CHAIN.then(function () {
  /* D8-D11 — SERVER_FALSE after the cap. The one answer that is a product decision. */
  var r = rigBoard();
  var p = r.c.loadUniverse();
  return later(5).then(function () {
    return r.settle(function (acc) { driveCap(acc, 'SERVER_FALSE'); });
  }).then(function () { return Promise.resolve(p); }).then(function () {
    eq(r.universeCalls(), 0, 'D8  a settled server FALSE reads NOTHING');
    ok(boxText(r.dom).indexOf('FEATURE_DISABLED') >= 0,
      'D9  and is reported as FEATURE_DISABLED', boxText(r.dom).slice(0, 120));
    eq(retryBtn(r.dom), null, 'D10 with NO retry control — a product decision is not a connection problem');
    eq(r.log.length, 0, 'D11 zero requests of any kind');
  });
});

/* D12-D17 — THE TWO CODES THE ROUND EXISTS FOR. */
[['SOURCE_TIMED_OUT', 'D12'], ['HTTP_NOT_FOUND', 'D14']].forEach(function (row) {
  CHAIN = CHAIN.then(function () {
    var r = rigBoard();
    var p = r.c.loadUniverse();
    return later(5).then(function () {
      eq(r.universeCalls(), 0, row[1] + 'a nothing is read while the capability is in flight  [M7]');
      return r.settle(function (acc) { driveCap(acc, row[0]); });
    }).then(function () { return Promise.resolve(p); }).then(function () {
      eq(r.universeCalls(), 1,
        row[1] + 'b a settled ' + row[0] + ' reads the universe EXACTLY once  [M1, M2, M8]');
      eq(r.c.universe && r.c.universe.state, 'OK',
        row[1] + 'c and the server — not the browser — decided the feature is on');
      eq(r.log.every(function (x) { return x.kind === 'read' && x.action === UNIV; }), true,
        row[1] + 'd through the existing action, with no new one');
    });
  });
});

/* D18+ — EVERY OTHER CODE, INCLUDING ONE NOBODY HAS INVENTED. Zero requests, refusal preserved. */
['BROWSER_OFFLINE', 'NOT_AUTHORIZED', 'FIELD_ABSENT', 'RESPONSE_NOT_READABLE',
  'SOURCE_NOT_CONNECTED', 'ACTION_MISMATCH', 'A_CODE_NOBODY_HAS_INVENTED_YET'].forEach(function (code, i) {
    CHAIN = CHAIN.then(function () {
      var r = rigBoard();
      var p = r.c.loadUniverse();
      return later(5).then(function () {
        return r.settle(function (acc) { driveCap(acc, code); });
      }).then(function () { return Promise.resolve(p); }).then(function () {
        eq(r.universeCalls(), 0,
          'D18.' + (i + 1) + ' ' + code + ' → ZERO universe reads  [M3, M4, M5, M6]');
        eq(r.log.length, 0, 'D19.' + (i + 1) + ' ' + code + ' → ZERO requests of any kind');
        ok(boxText(r.dom).length > 0,
          'D20.' + (i + 1) + ' ' + code + ' → the refusal it already had is on screen',
          boxText(r.dom).slice(0, 100));
        ok(boxText(r.dom).indexOf('FEATURE_DISABLED') < 0,
          'D21.' + (i + 1) + ' ' + code + ' → and it is NOT reported as a switched-off feature');
      });
    });
  });

CHAIN = CHAIN.then(function () {
  /* D22-D24 — THE SERVER SAYS NO. The delegated read reaches the real gate and its refusal is
     honoured verbatim: this round moves the authority, it does not soften the answer. */
  var r = rigBoard({ answers: { 'productPricing.siteUniverse.get': function () { return universeRefused('FEATURE_DISABLED'); } } });
  var p = r.c.loadUniverse();
  return later(5).then(function () {
    return r.settle(function (acc) { driveCap(acc, 'SOURCE_TIMED_OUT'); });
  }).then(function () { return Promise.resolve(p); }).then(function () {
    eq(r.universeCalls(), 1, 'D22 the delegated read went out exactly once');
    eq(r.c.universe && r.c.universe.state, 'FEATURE_DISABLED',
      'D23 and a SERVER FEATURE_DISABLED is kept as the code it is — not rewritten, not softened');
    ok(boxText(r.dom).indexOf('FEATURE_DISABLED') >= 0, 'D24 and it is what the page shows');
  });
});

CHAIN = CHAIN.then(function () {
  /* D25-D28 — the delegated read itself fails on the wire. The EXISTING user retry owns that,
     unchanged, and a second attempt that succeeds builds the chooser. */
  var n = 0;
  var r = rigBoard({ answers: { 'productPricing.siteUniverse.get': function () {
    n++;
    return (n === 1) ? universeRefused('SOURCE_TIMED_OUT') : universeOk([SITE]);
  } } });
  var p = r.c.loadUniverse();
  return later(5).then(function () {
    return r.settle(function (acc) { driveCap(acc, 'HTTP_NOT_FOUND'); });
  }).then(function () { return Promise.resolve(p); }).then(function () {
    eq(r.universeCalls(), 1, 'D25 one delegated read, and it was refused on the wire');
    var b = retryBtn(r.dom);
    ok(!!b, 'D26 the EXISTING universe retry control is offered — unchanged by this round');
    b.click();
    return later(30);
  }).then(function () {
    eq(r.universeCalls(), 2, 'D27 the click is ONE more logical read, carrying the same authority');
    eq(r.c.universe && r.c.universe.state, 'OK', 'D28 and the retry recovered');
  });
});

CHAIN = CHAIN.then(function () {
  /* D29-D31 — NO BOOTSTRAP, NO DELEGATION. The default this whole round rests on. */
  var r = rigBoard({ noBootstrap: true });
  driveCap(r.acc, 'SOURCE_TIMED_OUT');
  return Promise.resolve(r.c.loadUniverse()).then(function () { return later(10); }).then(function () {
    eq(r.universeCalls(), 0,
      'D29 with NO settlement signal a transient code still fails CLOSED — zero reads');
    ok(boxText(r.dom).indexOf('SOURCE_TIMED_OUT') >= 0,
      'D30 and the capability refusal is what the page shows', boxText(r.dom).slice(0, 120));
    eq(r.c.capabilitySettlementWaiting, undefined, 'D31 nothing was attached to anything');
  });
});

/* ===============================================================================================
   §E — LIFECYCLE. A settlement is not a licence to write into a page nobody is on.
   =============================================================================================== */
CHAIN = CHAIN.then(function () {
  section('§E — unmount, route return, and an idle page');

  var r = rigBoard();
  var p = r.c.loadUniverse();
  return later(5).then(function () {
    var before = String(stateBox(r.dom).innerHTML);
    r.c.alive = false;                                  // the page is left before the answer lands
    return r.settle(function (acc) { driveCap(acc, 'SOURCE_TIMED_OUT'); }).then(function () {
      return Promise.resolve(p).then(function () { return later(15); }).then(function () {
        eq(r.universeCalls(), 0,
          'E1  a settlement after unmount issues ZERO universe requests  [M10]');
        eq(r.log.length, 0, 'E2  and ZERO requests of any kind — no workspace read either');
        eq(String(stateBox(r.dom).innerHTML), before,
          'E3  and writes NOTHING into the page it no longer owns');
      });
    });
  });
});

CHAIN = CHAIN.then(function () {
  /* E4-E7 — COMING BACK. The mirror is re-read, the capability is not asked again, and the
     delegated read is the same one logical read a first visit would have made. */
  var r = rigBoard();
  var p = r.c.loadUniverse();
  return later(5).then(function () {
    return r.settle(function (acc) { driveCap(acc, 'HTTP_NOT_FOUND'); });
  }).then(function () { return Promise.resolve(p); }).then(function () {
    eq(r.universeCalls(), 1, 'E4  the first visit delegated one read');
    r.c.alive = false;
    var dom2 = H.makeDom(partialSkeleton);
    var c2 = PAGE.create({ document: dom2.document, accessor: r.acc,
      siteUniverse: UNI, liveAdapter: LIVE, board: null });
    return Promise.resolve(c2.loadUniverse()).then(function () { return later(15); }).then(function () {
      eq(r.universeCalls(), 2, 'E5  coming back re-reads the mirror and delegates once more');
      eq(c2.universe && c2.universe.state, 'OK', 'E6  and the returning page is usable too');
      eq(r.log.filter(function (x) { return x.action === 'getClientCapabilities'; }).length, 0,
        'E7  and the capability was never re-requested  [M11]');
    });
  });
});

CHAIN = CHAIN.then(function () {
  /* E8-E9 — AN IDLE PAGE SENDS NOTHING. The property a settlement signal is most likely to break,
     because a listener that fires more than once looks exactly like a timer from the wire. */
  var r = rigBoard();
  var p = r.c.loadUniverse();
  return later(5).then(function () {
    return r.settle(function (acc) { driveCap(acc, 'SOURCE_TIMED_OUT'); });
  }).then(function () { return Promise.resolve(p); }).then(function () {
    var at = r.log.length;
    return later(200).then(function () {
      eq(r.log.length, at, 'E8  a settled board left alone for 200ms sends NOTHING more');
      eq(r.universeCalls(), 1, 'E9  and the delegated read is still exactly one  [M8]');
    });
  });
});

/* ===============================================================================================
   §F — THE BOUNDS AND THE SHAPES THIS ROUND MAY NOT TOUCH.
   =============================================================================================== */
CHAIN = CHAIN.then(function () {
  section('§F — nothing scheduled, nothing widened, nothing new on the wire');

  var page = decomment(SRC.page);
  var db = decomment(SRC.dbapi);

  var newBlock = page.slice(page.indexOf('function capabilitySettlement()'),
    page.indexOf('function capabilityResolved()'));
  ok(newBlock.length > 0, 'F1  the new page block is locatable');
  eq((newBlock.match(/setInterval|setTimeout|requestAnimationFrame|addEventListener/g) || []).length, 0,
    'F2  it schedules nothing and listens to nothing');
  eq((newBlock.match(/getClientCapabilities|applyClientCapabilities|retryClientCapabilities/g) || []).length, 0,
    'F3  and it cannot issue or re-issue a capability read');

  var sig = db.slice(db.indexOf('var _kmCapSettlement_ = null;'),
    db.indexOf('async function _kmApplyClientCapabilities_'));
  eq((sig.match(/setInterval|setTimeout|XMLHttpRequest|fetch\s*\(/g) || []).length, 0,
    'F4  the signal itself schedules nothing and opens no socket');

  eq((db.match(/KM_READ_TIMEOUT_MS_\s*=\s*45000/g) || []).length, 1,
    'F5  the read budget is untouched at 45s');
  eq((db.match(/attemptN <= 2/g) || []).length, 1, 'F6  and the bounded two-attempt policy is untouched');
  ok(/_waitCapMs[^\n]*8000/.test(decomment(SRC.arbiter)),
    'F7  the arbiter cap is untouched at 8s — this round waits past it, it does not move it');

  eq((decomment(SRC.accessor).match(/SITE_UNIVERSE_ACTION\s*=\s*'productPricing\.siteUniverse\.get'/g) || []).length, 1,
    'F8  the action is the existing one — no new action, endpoint or payload');
  eq((page.match(/system\.health/g) || []).length, 0, 'F9  system.health is nowhere on this page');
  eq((page.match(/localStorage|sessionStorage|indexedDB/g) || []).length, 0,
    'F10 and nothing is cached in the browser');

  /* F11-F13 — ONE ALLOWLIST, WITH ONE IMPLEMENTATION. A second copy in the page would be a second
     authority, and the first time the two disagreed the page would be the one that was wrong.
     Asserted as "the page has no rule of its own", NOT as "these two names do not co-occur": the
     page's RETRYABLE_CODES table has named both of them since R10E for an unrelated reason, so a
     name census here would have been green against a page that had quietly grown a second list. */
  eq((page.match(/function capabilityFallbackEligible/g) || []).length, 0,
    'F11 the page implements no eligibility rule of its own');
  eq((page.match(/SERVER_AUTHORITATIVE_FALLBACK_CODES/g) || []).length, 0,
    'F12 and holds no copy of the allowlist');
  eq((page.match(/accessor\.capabilityFallbackEligible\(\)/g) || []).length, 1,
    'F13 it asks the accessor, in exactly one place');
  return null;
});

/* ===============================================================================================
   §M — TWELVE MUTANTS. Each one is a way this round could be wrong, and each dies by a named
   assertion above rather than by a census.
   =============================================================================================== */
function mutateFile(rel, from, to) {
  var full = path.join(ROOT, rel);
  var original = fs.readFileSync(full, 'utf8');
  var normalized = original.replace(/\r\n/g, '\n');
  if (normalized.split(from).length - 1 !== 1) { return null; }
  return { full: full, original: original,
    apply: function () { fs.writeFileSync(full, normalized.split(from).join(to), 'utf8'); },
    restore: function () { fs.writeFileSync(full, original, 'utf8'); } };
}
function score(label, p) {
  return Promise.resolve(p).then(function (caught) {
    if (caught === true) { mutCaught++; console.log('  ok   ' + label + ' (caught)'); }
    else { mutSurvived++; console.error('  FAIL ' + label + ' — MUTANT SURVIVED'); }
  }, function () { mutCaught++; console.log('  ok   ' + label + ' (caught by a throw)'); });
}
/* A MUTANT IS DRIVEN, NOT READ. Each one edits the shipped file, re-requires the module fresh and
   runs the probe the paired assertion runs; a regex over the mutated text would pass against a
   build where the edit had no effect. */
function withMutant(rel, from, to, probe) {
  var m = mutateFile(rel, from, to);
  if (!m) { return Promise.resolve(false); }     // anchor missing: report as survived, loudly
  m.apply();
  var done = function (v) { m.restore(); return v; };
  var boom = function (e) { m.restore(); throw e; };
  try { return Promise.resolve(probe()).then(done, boom); }
  catch (e) { m.restore(); throw e; }
}

var ACC_REL = 'assets/js/api/km-product-pricing-workspace.js';
var PAGE_REL = 'assets/js/pages/product-strategy-board.js';
var DB_REL = 'assets/js/api/operation-system-db-api.js';

/* The board module is a singleton too, so a mutant has to reload BOTH it and the accessor. */
function freshPage() {
  var full = path.join(JS, 'pages', 'product-strategy-board.js');
  delete require.cache[require.resolve(full)];
  return require(full);
}
/* Runs one settled-capability scenario against the CURRENT bytes and answers how many universe
   reads left the browser. Every allowlist mutant is scored on this one number. */
function universeReadsFor(state, o) {
  o = o || {};
  var P2 = freshPage();
  var acc = freshAccessor();
  var log = wire({ 'productPricing.siteUniverse.get': function () { return universeOk([SITE]); } });
  global.KM.DB = global.KM.DB || {};
  var release = null;
  var settlement = new Promise(function (res) { release = res; });
  global.KM.DB.clientCapabilitiesSettlement = function () { return settlement; };
  global.KM.bootArbiter = { whenReady: function () { return Promise.resolve(); } };
  var dom = H.makeDom(partialSkeleton);
  var c = P2.create({ document: dom.document, accessor: acc,
    siteUniverse: UNI, liveAdapter: LIVE, board: null });
  var p = c.loadUniverse();
  return later(5).then(function () {
    if (o.unmountBeforeSettle) { c.alive = false; }
    driveCap(acc, state);
    release(null);
    return later(25);
  }).then(function () { return Promise.resolve(p); }).then(function () { return later(5); })
    .then(function () {
      return { reads: log.filter(function (x) { return x.action === UNIV; }).length, c: c, dom: dom };
    });
}

CHAIN = CHAIN.then(function () {
  section('§M — twelve mutants, each driven');

  return score('M1  SOURCE_TIMED_OUT removed from the allowlist  [D12b, C3]',
    withMutant(ACC_REL,
      "var SERVER_AUTHORITATIVE_FALLBACK_CODES = ['SOURCE_TIMED_OUT', 'HTTP_NOT_FOUND'];",
      "var SERVER_AUTHORITATIVE_FALLBACK_CODES = ['HTTP_NOT_FOUND'];",
      function () {
        return universeReadsFor('SOURCE_TIMED_OUT').then(function (r) { return r.reads !== 1; });
      }))
    .then(function () {
      return score('M2  HTTP_NOT_FOUND removed from the allowlist  [D14b]',
        withMutant(ACC_REL,
          "var SERVER_AUTHORITATIVE_FALLBACK_CODES = ['SOURCE_TIMED_OUT', 'HTTP_NOT_FOUND'];",
          "var SERVER_AUTHORITATIVE_FALLBACK_CODES = ['SOURCE_TIMED_OUT'];",
          function () {
            return universeReadsFor('HTTP_NOT_FOUND').then(function (r) { return r.reads !== 1; });
          }));
    })
    .then(function () {
      return score('M3  BROWSER_OFFLINE added to the allowlist  [B7, D18]',
        withMutant(ACC_REL,
          "var SERVER_AUTHORITATIVE_FALLBACK_CODES = ['SOURCE_TIMED_OUT', 'HTTP_NOT_FOUND'];",
          "var SERVER_AUTHORITATIVE_FALLBACK_CODES = ['SOURCE_TIMED_OUT', 'HTTP_NOT_FOUND', 'BROWSER_OFFLINE'];",
          function () {
            return universeReadsFor('BROWSER_OFFLINE').then(function (r) { return r.reads !== 0; });
          }));
    })
    .then(function () {
      return score('M4  NOT_AUTHORIZED added to the allowlist  [C6, D18]',
        withMutant(ACC_REL,
          "var SERVER_AUTHORITATIVE_FALLBACK_CODES = ['SOURCE_TIMED_OUT', 'HTTP_NOT_FOUND'];",
          "var SERVER_AUTHORITATIVE_FALLBACK_CODES = ['SOURCE_TIMED_OUT', 'HTTP_NOT_FOUND', 'NOT_AUTHORIZED'];",
          function () {
            return universeReadsFor('NOT_AUTHORIZED').then(function (r) { return r.reads !== 0; });
          }));
    })
    .then(function () {
      /* M5 — FIELD_ABSENT is not a FAILED state, so adding the name is not enough to break it:
         the eligibility rule has to be widened as well. That is exactly the mutation a well-meaning
         change would make, and it is the one that would let a server that ANSWERED be overridden. */
      return score('M5  FIELD_ABSENT admitted by widening the eligibility rule  [B9, C10, D18]',
        withMutant(ACC_REL,
          '    if (_capabilityState !== CAP.FAILED) { return false; }   // only a read that could not complete',
          '    if (_capabilityState === CAP.FIELD_ABSENT) { return true; }\n    if (_capabilityState !== CAP.FAILED) { return false; }',
          function () {
            return universeReadsFor('FIELD_ABSENT').then(function (r) { return r.reads !== 0; });
          }));
    })
    .then(function () {
      return score('M6  RESPONSE_NOT_READABLE added to the allowlist  [D18]',
        withMutant(ACC_REL,
          "var SERVER_AUTHORITATIVE_FALLBACK_CODES = ['SOURCE_TIMED_OUT', 'HTTP_NOT_FOUND'];",
          "var SERVER_AUTHORITATIVE_FALLBACK_CODES = ['SOURCE_TIMED_OUT', 'HTTP_NOT_FOUND', 'RESPONSE_NOT_READABLE'];",
          function () {
            return universeReadsFor('RESPONSE_NOT_READABLE').then(function (r) { return r.reads !== 0; });
          }));
    })
    .then(function () {
      /* M7 — THE OVERLAP: A READ DISPATCHED WHILE THE CAPABILITY HAS NEVER BEEN ANSWERED.

         AIMED AT THE PAGE, NOT THE ACCESSOR. Making the accessor call PENDING "eligible" changes
         nothing observable, because the page never gets as far as asking: `capabilityResolved` waits
         on the settlement first, and a capability that is still PENDING has not settled.

         AND IT IS SCORED ON THE STATE, NOT ON THE REQUEST COUNT, for the same reason one level down.
         With the page's eligibility check gone the delegated branch runs, the read is counted, and
         the ACCESSOR still refuses it — so nothing reaches the wire and a probe that counted requests
         would report this mutant as harmless. Two guards protecting one number is the design working;
         it also means the number is the wrong instrument. What the mutant genuinely destroys is the
         ANSWER: a page that should be saying "still finding out" says "the capability has not been
         reported" instead, having spent a read attempt to learn nothing. That is what D2 asserts and
         that is what is measured here, alongside the attempt the page charged itself. */
      return score('M7  the delegated read is dispatched while the capability is still PENDING  [D1, D29]',
        withMutant(PAGE_REL,
          '        if (C.alive && serverAuthorityAllowed()) { return readSiteUniverse(); }',
          '        if (C.alive) { return readSiteUniverse(); }',
          function () {
            var P2 = freshPage();
            var acc = freshAccessor();
            var log = wire({ 'productPricing.siteUniverse.get': function () { return universeOk([SITE]); } });
            global.KM.DB = global.KM.DB || {};
            global.KM.DB.clientCapabilitiesSettlement = function () { return null; };
            global.KM.bootArbiter = { whenReady: function () { return Promise.resolve(); } };
            var dom = H.makeDom(partialSkeleton);
            var c = P2.create({ document: dom.document, accessor: acc,
              siteUniverse: UNI, liveAdapter: LIVE, board: null });
            return Promise.resolve(c.loadUniverse()).then(function () { return later(25); })
              .then(function () {
                return c.state !== P2.LOADING_CAPABILITY || c.requests.siteUniverse !== 0;
              });
          }));
    })
    .then(function () {
      /* M8 — THE CONTINUATION FIRES TWICE. A second attach is a second read for one answer, which
         is the shape every "harmless" listener regression takes. */
      return score('M8  a second settlement continuation is attached, so one answer reads twice  [D4, E9]',
        withMutant(PAGE_REL,
          '      if (C.capabilitySettlementWaiting) { return capabilityOk(); }',
          '      if (false) { return capabilityOk(); }',
          function () {
            var P2 = freshPage();
            /* The guard is what makes a second call cheap; with it gone, calling the resolver twice
               — which a re-render does — attaches twice, and one answer becomes two reads. */
            var acc = freshAccessor();
            var log = wire({ 'productPricing.siteUniverse.get': function () { return universeOk([SITE]); } });
            global.KM.DB = global.KM.DB || {};
            var release = null;
            var st = new Promise(function (res) { release = res; });
            global.KM.DB.clientCapabilitiesSettlement = function () { return st; };
            global.KM.bootArbiter = { whenReady: function () { return Promise.resolve(); } };
            var dom = H.makeDom(partialSkeleton);
            var c = P2.create({ document: dom.document, accessor: acc,
              siteUniverse: UNI, liveAdapter: LIVE, board: null });
            var a = c.loadUniverse();
            var b = c.loadUniverse();
            return later(5).then(function () {
              driveCap(acc, 'SOURCE_TIMED_OUT');
              release(null);
              return later(30);
            }).then(function () {
              return Promise.all([a, b]);
            }).then(function () {
              /* THE HONEST NUMBER. An earlier draft of this probe returned whether the guard was
                 still present in the mutated source — true by construction the moment the mutation
                 applies, which is a mutant that cannot fail. One settlement must produce ONE read,
                 however many times the resolver is entered. */
              return log.filter(function (x) { return x.action === UNIV; }).length !== 1;
            });
          }));
    })
    .then(function () {
      /* M9 — THE SIGNAL STARTS CARRYING THE ANSWER.

         AIMED AT THE SOURCE OF THE PAYLOAD, AND DELIBERATELY SO. There is nowhere in the page to
         PUT a trusted payload: `loadUniverseResolved` takes no argument and re-reads the mirror, so
         a mutant that made the continuation return the capability would change nothing observable.
         That is exactly the property this round wanted, and it means the contract worth defending
         lives one layer up — the signal resolving with NOTHING, so no later caller is ever offered a
         value to trust. This mutation is the helpful-looking change somebody would really make:
         hand the applied snapshot along with the settlement. A7 is what refuses it. */
      return score('M9  the settlement signal is made to carry the capability payload  [A7]',
        withMutant(DB_REL,
          '    _kmCapReleaseSettlement_(_capSettlement);\n    return applied;',
          '    if (_capSettlement && _capSettlement.release) { _capSettlement.release(applied); }\n    return applied;',
          function () {
            var src = read(path.join(JS, 'api', 'operation-system-db-api.js'));
            var i2 = src.indexOf(BOOT_FROM), j2 = src.indexOf(BOOT_TO);
            if (i2 < 0 || j2 <= i2) { return true; }
            var acc = freshAccessor();
            var win = { KM: { DB: { getClientCapabilities: function () { return Promise.resolve(capsTrue()); } },
              api: { applyClientCapabilities: function (c) { return c || {}; },
                getClientCapabilitySnapshot: function () { return null; } },
              productPricingWorkspace: acc } };
            var ctx = { window: win, Promise: Promise, Date: Date, JSON: JSON,
              console: { warn: function () {}, error: function () {}, log: function () {} },
              _kmCapSeq_: 0, _kmCapAppliedSeq_: 0, _kmCapAppliedFromBackend_: false,
              _kmCapDeploymentIdentity_: function () { return 'dep-1'; } };
            ctx.globalThis = ctx;
            vm.createContext(ctx);
            vm.runInContext(src.slice(i2, j2), ctx, { filename: 'mutant#bootstrap' });
            var p = win.KM.DB.applyClientCapabilities();
            var got = 'NOT-SETTLED';
            win.KM.DB.clientCapabilitiesSettlement().then(function (v) { got = v; });
            return Promise.resolve(p).then(function () { return later(5); })
              .then(function () { return got !== null; });
          }));
    })
    .then(function () {
      /* M10 — THE LIVENESS GUARD ON THE REQUEST. `show()` guards the RENDER; only this guard stops
         the REQUEST, which no render guard can.

         RE-AIMED BY P1-B8D-R10E-F5, AND THE PROPERTY IS THE SAME ONE. This mutant used to remove
         the liveness test from the DELEGATED branch, because at the time that branch was the only
         place a dead controller was stopped. F5 replaced that with a single `abandonedDispatch`
         answered at the last shared point every universe road funnels through — so the branch check
         is no longer what makes the property true, and a mutant aimed at it changes nothing that
         can be measured. Aiming at the branch that no longer decides would have left this suite
         reporting a caught mutant for a guard it had stopped testing.

         WHAT IT PROVES NOW IS STRICTLY MORE. F5's own reproduction showed the ORDINARY SERVER_TRUE
         road was never guarded at all: the deployed baseline and F4 each put one site-universe read
         on the wire for a page the lifecycle had already put down. That is the road this mutant
         kills on, measured by mounting a page, settling the capability after the unmount and
         counting what left the browser — 0 unmutated, 1 mutated. E1 is unchanged and still passes,
         and the delegated road stays at zero either way because its own branch check still stands
         beside the central one. */
      return score('M10 the central request-ownership guard is disabled  [E1]',
        withMutant(PAGE_REL,
          '      if (C.alive === true) { return null; }',
          '      return null;',
          function () {
            return universeReadsFor('SERVER_TRUE', { unmountBeforeSettle: true })
              .then(function (r) { return r.reads !== 0; });
          }));
    })
    .then(function () {
      /* M11 — THE RETRY REPLACES THE BOOTSTRAP PROMISE. Then a page that captured the signal at
         mount would be waiting on a promise nobody is going to resolve. */
      return score('M11 the user retry re-arms and replaces the bootstrap settlement  [A16, A17]',
        withMutant(DB_REL,
          '    if (_kmCapSettlement_) { return null; }      // already armed: a retry is not the bootstrap',
          '    _kmCapSettlement_ = null;',
          function () {
            var src = read(path.join(JS, 'api', 'operation-system-db-api.js'));
            var i = src.indexOf(BOOT_FROM), j = src.indexOf(BOOT_TO);
            if (i < 0 || j <= i) { return true; }
            var mutBoot = src.slice(i, j);
            var acc = freshAccessor();
            var reads = 0;
            var win = { KM: { DB: { getClientCapabilities: function () {
              reads++; return Promise.resolve(capsFail('REQUEST_TIMEOUT')); } },
              api: { applyClientCapabilities: function (c) { return c || {}; },
                getClientCapabilitySnapshot: function () { return null; } },
              productPricingWorkspace: acc } };
            var ctx = { window: win, Promise: Promise, Date: Date, JSON: JSON,
              console: { warn: function () {}, error: function () {}, log: function () {} },
              _kmCapSeq_: 0, _kmCapAppliedSeq_: 0, _kmCapAppliedFromBackend_: false,
              _kmCapDeploymentIdentity_: function () { return 'dep-1'; } };
            ctx.globalThis = ctx;
            vm.createContext(ctx);
            vm.runInContext(mutBoot, ctx, { filename: 'mutant#bootstrap' });
            var p = win.KM.DB.applyClientCapabilities();
            var before = win.KM.DB.clientCapabilitiesSettlement();
            return Promise.resolve(p).then(function () { return later(5); }).then(function () {
              win.KM.DB.retryClientCapabilities();
              return later(5);
            }).then(function () {
              return win.KM.DB.clientCapabilitiesSettlement() !== before;
            });
          }));
    })
    .then(function () {
      /* M12 — THE GETTER STARTS A READ. The one thing an accessor called "settlement" must never
         do, and the easiest line to add by accident. */
      return score('M12 the settlement getter starts a capability read  [A3, A6]',
        withMutant(DB_REL,
          '    return _kmCapSettlement_ ? _kmCapSettlement_.promise : null;',
          '    if (!_kmCapSettlement_) { _kmApplyClientCapabilities_(); }\n    return _kmCapSettlement_ ? _kmCapSettlement_.promise : null;',
          function () {
            var src = read(path.join(JS, 'api', 'operation-system-db-api.js'));
            var i = src.indexOf(BOOT_FROM), j = src.indexOf(BOOT_TO);
            if (i < 0 || j <= i) { return true; }
            var acc = freshAccessor();
            var reads = 0;
            var win = { KM: { DB: { getClientCapabilities: function () {
              reads++; return Promise.resolve(capsTrue()); } },
              api: { applyClientCapabilities: function (c) { return c || {}; },
                getClientCapabilitySnapshot: function () { return null; } },
              productPricingWorkspace: acc } };
            var ctx = { window: win, Promise: Promise, Date: Date, JSON: JSON,
              console: { warn: function () {}, error: function () {}, log: function () {} },
              _kmCapSeq_: 0, _kmCapAppliedSeq_: 0, _kmCapAppliedFromBackend_: false,
              _kmCapDeploymentIdentity_: function () { return 'dep-1'; } };
            ctx.globalThis = ctx;
            vm.createContext(ctx);
            vm.runInContext(src.slice(i, j), ctx, { filename: 'mutant#bootstrap' });
            win.KM.DB.clientCapabilitiesSettlement();
            return later(5).then(function () { return reads !== 0; });
          }));
    });
});

CHAIN.then(function () {
  console.log('\n== SUMMARY ==');
  console.log('  assertions : ' + pass + ' passed, ' + fail + ' failed');
  console.log('  mutants    : ' + mutCaught + ' caught, ' + mutSurvived + ' survived');
  REACHED_THE_END = true;
  if (fail || mutSurvived) { process.exitCode = 1; }
}, function (e) {
  console.error('  FAIL SUITE THREW — ' + (e && e.stack ? e.stack : e));
  REACHED_THE_END = true;
  process.exitCode = 1;
});
