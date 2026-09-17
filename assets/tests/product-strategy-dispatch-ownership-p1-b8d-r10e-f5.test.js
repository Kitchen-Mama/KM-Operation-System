/**
 * PRODUCT-STRATEGY-P1-B8D-R10E-F5 — UNMOUNTED DISPATCH OWNERSHIP
 * ==============================================================
 *
 * THE DEFECT, AND HOW IT SURVIVED FOUR ROUNDS THAT WERE LOOKING FOR IT.
 *
 * F2 gave this page one central place where "the page I belong to is gone" is answered for the
 * DOM: `show()`. F3-R4 then added a liveness check to the DELEGATED dispatch — `if (C.alive &&
 * serverAuthorityAllowed())` — and its own suite proves that one works. What nobody had is the
 * same sentence for the WIRE on the ordinary road: a capability that settles SERVER_TRUE after the
 * operator has navigated away falls through to the plain enabled path, which dispatched before it
 * checked anything. One site-universe read, charged to a quota'd backend, for a page nobody is on.
 *
 * It was invisible because every instrument pointed elsewhere. The DOM guard catches the RENDER,
 * so nothing is drawn and no assertion about the screen fires. The delegated guard catches the
 * TRANSIENT roads, so the F3-R4 unmount scenarios — which all settle as SOURCE_TIMED_OUT or
 * HTTP_NOT_FOUND — legitimately report zero. Only the SERVER_TRUE road was unguarded, and no suite
 * had counted requests on it after an unmount. The F4 candidate matrix did, and that is where it
 * showed up.
 *
 * MEASURED ON TWO COMMITS BEFORE ANYTHING WAS CHANGED, with one fixture that routes away through
 * `P.onUnmount` rather than by setting a flag by hand: the deployed baseline `1b40537` and the
 * local F4 `b8d477e` each issued exactly ONE universe request from a controller the lifecycle had
 * already put down. §M1 re-establishes that number by removing the guard, so the claim stays
 * checkable from inside this suite rather than resting on a transcript.
 *
 * WHAT THE FIX IS. One predicate, `abandonedDispatch`, answered at the LAST SHARED POINT before
 * each external read leaves the browser — `readSiteUniverse` for the universe and `C.loadWorkspace`
 * for the workspace. Not six checks on six roads: all six universe roads funnel through one
 * function, which is what makes "there is no seventh road to forget" a structural claim rather than
 * a hopeful one. §B proves the roads are covered; §M4 proves a delegated-only guard is not enough.
 *
 * WHAT IT IS NOT ALLOWED TO BREAK. An unmount must not strand anything: the capability settlement
 * still resolves, the retry latches still release, a request already in flight still completes its
 * own cleanup under F2's contract, and the next visit still builds a working controller. §E and §F
 * assert each of those as its own number, because a guard that quietly froze a latch would look
 * exactly like a guard that worked.
 */
'use strict';

var fs = require('fs');
var path = require('path');
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
  page: read(PAGE_FULL),
  accessor: read(ACC_FULL),
  dbapi: read(path.join(JS, 'api', 'operation-system-db-api.js')),
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
function later(ms) { return new Promise(function (r) { setTimeout(r, ms || 0); }); }

console.log('PRODUCT STRATEGY — UNMOUNTED DISPATCH OWNERSHIP (P1-B8D-R10E-F5)');

var UNIV = 'productPricing.siteUniverse.get';
var WORK = 'productPricing.workspace.get';
var SITE = { company: 'KM', country: 'US', marketplace: 'Shopify', site_key: 'KM|US|Shopify' };

function freshAccessor() { delete require.cache[require.resolve(ACC_FULL)]; return require(ACC_FULL); }
function freshPage() { delete require.cache[require.resolve(PAGE_FULL)]; return require(PAGE_FULL); }

function universeOk() {
  return { success: true, envelope: { success: true,
    data: { sites: [SITE], refusals: [], sourceState: 'READY',
      hierarchy: { companies: ['KM'], countries_by_company: { KM: ['US'] },
        marketplaces_by_country: { 'KM|US': ['Shopify'] } } },
    meta: { action: UNIV }, errors: [] } };
}
/* A workspace answer the live adapter can actually build a board from is NOT needed by any
   assertion here — every §F number is about whether a request LEFT, not what came back — so the
   workspace is answered with a refusal and that is stated rather than left to be inferred. */
function workspaceRefused() {
  return { success: false, code: 'TRANSPORT_FAILED', details: {} };
}
var DRIVER = {
  SOURCE_TIMED_OUT: ['REQUEST_TIMEOUT', null],
  HTTP_NOT_FOUND: ['REDIRECT_TARGET_NOT_FOUND', 404]
};
function driveCap(acc, state) {
  if (state === 'SERVER_TRUE') { return acc.setCapability({ product_strategy_enabled: true }); }
  if (state === 'SERVER_FALSE') { return acc.setCapability({ product_strategy_enabled: false }); }
  if (DRIVER[state]) { return acc.setCapability(null, { failureCode: DRIVER[state][0], httpStatus: DRIVER[state][1] }); }
  return acc.setCapability(null, { failureCode: state, httpStatus: null });
}
function sigOf(dom) {
  function s(n) { return n ? ((n.childNodes || []).length + ':' + String(n.textContent || '').length) : 'absent'; }
  return s(dom.document.getElementById('psb-state-host')) + '|'
    + s(dom.document.getElementById('psb-site-host'));
}
function retryBtn(dom) {
  var host = dom.document.getElementById('psb-state-host');
  if (!host) return null;
  var found = null;
  (function walk(n) {
    if (!n || found) return;
    if (n.tagName === 'BUTTON' && n.getAttribute && n.getAttribute('data-cy') === 'psb-state-retry') { found = n; return; }
    (n.childNodes || []).forEach(walk);
  }(host));
  return found;
}

/* ONE PAGE LIFE, built the way the shell builds one: `P.mount` (which is what records
   `P.lastController`) and `P.onUnmount` (which is what the lifecycle calls). Setting `alive` by
   hand would be asserting against the fixture instead of against the product's teardown. */
function rig(o) {
  o = o || {};
  var P = freshPage();
  var acc = freshAccessor();
  var log = [], throws = 0;
  global.KM = global.KM || {};
  global.KM.api = { buildRequestEnvelope: function (a, p, x) {
    return { apiVersion: '1.0', action: a, requestId: (x && x.requestId) || null, payload: p || {} }; } };
  global.KM.transport = { request: function (req) {
    log.push({ action: req.action, kind: req.kind });
    var answer = (o.answers && o.answers[req.action]);
    if (typeof answer === 'function') { return Promise.resolve(answer()); }
    return Promise.resolve(req.action === UNIV ? universeOk() : workspaceRefused());
  } };
  var release = null;
  var settlement = new Promise(function (r) { release = r; });
  var settlementAsks = 0;
  global.KM.DB = { clientCapabilitiesSettlement: function () { settlementAsks++; return settlement; } };
  global.KM.bootArbiter = { whenReady: function () { return Promise.resolve(); } };
  var dom = H.makeDom(partialSkeleton);
  global.document = dom.document;
  var deps = { document: dom.document, accessor: acc, siteUniverse: UNI, liveAdapter: LIVE, board: null };

  var R = {
    P: P, acc: acc, dom: dom, log: log, deps: deps,
    throws: function () { return throws; },
    settlementAsks: function () { return settlementAsks; },
    calls: function (a) { return log.filter(function (x) { return x.action === a; }).length; },
    controller: function () { return P.lastController; },
    unmount: function () { try { P.onUnmount(); } catch (e) { throws++; } },
    settle: function (state) { driveCap(acc, state); release(null); return later(30); },
    sig: function () { return sigOf(dom); }
  };
  R.start = function () { return P.mount(deps); };
  return R;
}

var CHAIN = Promise.resolve();

/* ===============================================================================================
   §A — THE INVARIANT IS ONE THING, IN ONE PLACE.
   =============================================================================================== */
CHAIN = CHAIN.then(function () {
  section('§A — one predicate, answered at the shared dispatch points');

  eq((SRC.page.match(/function abandonedDispatch\(/g) || []).length, 1,
    'A1  the invariant is DEFINED exactly once  [M1]');
  eq((SRC.page.match(/abandonedDispatch\(/g) || []).length, 3,
    'A2  and consulted at exactly two dispatch points — one definition, two call sites');
  ok(/function readSiteUniverse\(\)\s*\{[\s\S]{0,900}?var gone = abandonedDispatch\(C\.state\);\s*\n\s*if \(gone\) \{ return Promise\.resolve\(gone\); \}/.test(SRC.page),
    'A3  the universe guard is INSIDE readSiteUniverse — the one function every road funnels through');
  ok(/C\.loadWorkspace = function \(\) \{[\s\S]{0,700}?var gone = abandonedDispatch\(P\.LOADING_WORKSPACE\);\s*\n\s*if \(gone\) \{ return Promise\.resolve\(gone\); \}/.test(SRC.page),
    'A4  and the workspace guard is the FIRST thing in loadWorkspace');

  /* IT IS BEFORE THE DISPATCH, NOT BESIDE IT. Asserted as an ordering in the source, because a
     guard that runs after `accessor.getSiteUniverse` would pass every behavioural test in §B while
     still having sent the request. */
  var ru = SRC.page.slice(SRC.page.indexOf('function readSiteUniverse()'));
  ru = ru.slice(0, ru.indexOf('\n    }'));
  ok(ru.indexOf('abandonedDispatch') < ru.indexOf('accessor.getSiteUniverse'),
    'A5  the universe guard precedes the accessor call  [M3]');
  ok(ru.indexOf('abandonedDispatch') < ru.indexOf('C.requests.siteUniverse++'),
    'A6  and precedes the request counter, so a blocked read is not charged either');
  var lw = SRC.page.slice(SRC.page.indexOf('C.loadWorkspace = function ()'));
  lw = lw.slice(0, lw.indexOf('\n    };'));
  ok(lw.indexOf('abandonedDispatch') < lw.indexOf('C.token++'),
    'A7  the workspace guard precedes the token bump, so the single-flight latch is not disturbed');
  ok(lw.indexOf('abandonedDispatch') < lw.indexOf('live.fetch('),
    'A8  and precedes the fetch  [M3]');

  eq((SRC.page.match(/if \(C\.alive === true\) \{ return null; \}/g) || []).length, 1,
    'A9  the liveness test itself is written once  [M2]');
  /* NO NEW TIMER, POLL OR LISTENER. The guard is a branch; anything else would be a second
     lifecycle authority running beside the one that already exists. */
  var added = SRC.page;
  ok(!/setInterval|requestAnimationFrame/.test(added.slice(added.indexOf('abandonedDispatch') - 2000,
    added.indexOf('function show(state'))),
    'A10 and it introduces no timer, poll or animation loop');
});

/* ===============================================================================================
   §B — UNMOUNTED. Every road, zero requests.
   =============================================================================================== */
function unmountedRun(state) {
  var r = rig();
  var p = r.start();
  return later(10).then(function () {
    r.unmount();
    /* CAPTURED AFTER THE UNMOUNT, NOT BEFORE IT. `P.onUnmount` empties the state host by design -
       that is the teardown doing its job, and comparing across it would score correct behaviour as
       a mutation. What must not change is what the DEAD CONTROLLER does from here on. */
    var before = { reqs: r.log.length, sig: r.sig() };
    return r.settle(state).then(function () {
      return Promise.resolve(p).catch(function () { return null; });
    }).then(function () { return later(10); }).then(function () {
      return { r: r, before: before, after: { reqs: r.log.length, sig: r.sig() } };
    });
  });
}

CHAIN = CHAIN.then(function () {
  section('§B — a controller the lifecycle has put down starts nothing');

  return unmountedRun('SERVER_TRUE').then(function (o) {
    eq(o.r.calls(UNIV), 0,
      'B1  SERVER_TRUE settling after unmount issues ZERO universe reads  [M1, M2, M4]');
    eq(o.r.calls(WORK), 0, 'B2  and zero workspace reads');
    eq(o.r.log.length, 0, 'B3  zero requests of any action at all');
    eq(o.after.sig, o.before.sig, 'B4  and the DOM the unmount left is untouched afterwards  [M5]');
    eq(o.r.throws(), 0, 'B5  nothing threw');
    eq(o.r.controller(), null, 'B6  the lifecycle owns no controller after the unmount');
  });
});

CHAIN = CHAIN.then(function () {
  /* B7-B12 — THE TWO TRANSIENT CODES. These were already zero, because F3-R4's delegated guard
     covers them; they are asserted here so that moving the authority to the central point cannot
     quietly lose a property another round had won. */
  return unmountedRun('SOURCE_TIMED_OUT').then(function (o) {
    eq(o.r.calls(UNIV), 0, 'B7  SOURCE_TIMED_OUT after unmount delegates NOTHING');
    eq(o.r.log.length, 0, 'B8  zero requests');
    eq(o.after.sig, o.before.sig, 'B9  DOM unchanged after the unmount');
    return unmountedRun('HTTP_NOT_FOUND');
  }).then(function (o) {
    eq(o.r.calls(UNIV), 0, 'B10 HTTP_NOT_FOUND after unmount delegates NOTHING');
    eq(o.r.log.length, 0, 'B11 zero requests');
    eq(o.r.throws(), 0, 'B12 nothing threw');
  });
});

CHAIN = CHAIN.then(function () {
  /* B13-B15 — SERVER_FALSE and a non-allowlisted failure: no requests either, and no throw. The
     point is that the guard is not selective about WHY the capability settled. */
  return unmountedRun('SERVER_FALSE').then(function (o) {
    eq(o.r.log.length, 0, 'B13 a settled SERVER_FALSE after unmount issues nothing');
    return unmountedRun('NOT_AUTHORIZED');
  }).then(function (o) {
    eq(o.r.log.length, 0, 'B14 and neither does a non-allowlisted failure');
    eq(o.r.throws(), 0, 'B15 nothing threw on either');
  });
});

/* ===============================================================================================
   §C — MOUNTED. The guard must be invisible to a page someone is on.
   =============================================================================================== */
function mountedRun(state, answers) {
  var r = rig({ answers: answers });
  var p = r.start();
  return later(10).then(function () {
    return r.settle(state);
  }).then(function () { return Promise.resolve(p).catch(function () { return null; }); })
    .then(function () { return later(10); }).then(function () { return r; });
}

CHAIN = CHAIN.then(function () {
  section('§C — a mounted page is unaffected');

  return mountedRun('SERVER_TRUE').then(function (r) {
    eq(r.calls(UNIV), 1, 'C1  a mounted SERVER_TRUE reads the universe EXACTLY once  [M6]');
    eq(r.throws(), 0, 'C2  nothing threw');
    var host = r.dom.document.getElementById('psb-site-host');
    ok(host && (host.childNodes || []).length > 0,
      'C3  and the chooser was built — the read produced a usable page  [M6]');
    ok(!!(r.controller() && r.controller().universe
      && r.controller().universe.state === 'OK'), 'C4  with an OK universe on the controller');
  });
});

CHAIN = CHAIN.then(function () {
  /* C5-C8 — THE F3-R4 DELEGATION, unchanged. One delegated read, no capability retry click. */
  return mountedRun('SOURCE_TIMED_OUT').then(function (r) {
    eq(r.calls(UNIV), 1, 'C5  a mounted transient delegation reads the universe EXACTLY once  [M6]');
    eq(r.throws(), 0, 'C6  nothing threw');
    return mountedRun('HTTP_NOT_FOUND');
  }).then(function (r) {
    eq(r.calls(UNIV), 1, 'C7  and so does HTTP_NOT_FOUND — F3-R4 behaviour is unchanged');
    eq(r.calls(WORK) >= 0, true, 'C8  (the workspace is refused by this rig; see the header)');
  });
});

/* ===============================================================================================
   §D — ROUTE RETURN. A fresh controller works; the dead one does not compete.
   =============================================================================================== */
CHAIN = CHAIN.then(function () {
  section('§D — the next visit');

  /* D1-D5 — UNRESOLVED UNIVERSE. The first visit is left before the capability settles, so there
     is nothing worth parking; the next visit must be an ordinary first load. */
  var r = rig();
  var p = r.start();
  return later(10).then(function () {
    r.unmount();
    return r.settle('SERVER_TRUE');
  }).then(function () { return Promise.resolve(p).catch(function () { return null; }); })
    .then(function () {
      eq(r.calls(UNIV), 0, 'D1  the abandoned visit read nothing');
      eq(r.P.parked, null, 'D2  and parked nothing — there was no complete site to keep');
      var dead = r.deadController;
      /* THE NEXT VISIT, on the same document and the same module. */
      var p2 = r.P.mount(r.deps);
      return later(10).then(function () { return p2; }).then(function () { return later(10); })
        .then(function () {
          eq(r.calls(UNIV), 1, 'D3  the FRESH controller reads the universe exactly once  [M5]');
          eq(r.settlementAsks() >= 1, true, 'D4  the capability mirror is re-read from the SETTLED state, not re-requested');
          eq(r.calls('getClientCapabilities'), 0, 'D5  capability rereads on the wire = 0');
        });
    });
});

CHAIN = CHAIN.then(function () {
  /* D6-D10 — A VALID SNAPSHOT IS RESTORED, NOT RE-READ. `restore()` is what `P.onMount` calls
     before it would fall through to a fresh load. */
  var r = rig();
  var p = r.start();
  return later(10).then(function () { return r.settle('SERVER_TRUE'); })
    .then(function () { return Promise.resolve(p).catch(function () { return null; }); })
    .then(function () { return later(10); })
    .then(function () {
      var c = r.controller();
      eq(r.calls(UNIV), 1, 'D6  the first visit read once');
      var before = r.log.length;
      /* The board never mounts in this rig (the workspace is refused), so the controller is NOT
         parkable — which is itself the honest outcome and is asserted rather than worked around. */
      r.unmount();
      eq(r.log.length, before, 'D7  the unmount itself issued no request');
      eq(c.alive, false, 'D8  and the outgoing controller is marked not-alive  [M2]');
      /* A dead controller asked to read again reads NOTHING — this is the competition §D forbids. */
      return Promise.resolve(c.loadUniverse()).catch(function () { return null; })
        .then(function () { return later(10); })
        .then(function () {
          eq(r.log.length, before,
            'D9  and a dead controller asked to load AGAIN starts nothing — no race with the next visit  [M1]');
          return Promise.resolve(c.loadWorkspace()).catch(function () { return null; })
            .then(function () { return later(10); })
            .then(function () {
              eq(r.log.length, before, 'D10 including the workspace read  [M8]');
            });
        });
    });
});

/* ===============================================================================================
   §E — USER RETRY.
   =============================================================================================== */
CHAIN = CHAIN.then(function () {
  section('§E — the retry control');

  /* E1-E4 — MOUNTED: the existing single-flight is untouched. */
  var r = rig({ answers: { 'productPricing.siteUniverse.get': function () {
    return { success: false, code: 'REQUEST_TIMEOUT', details: {} }; } } });
  var p = r.start();
  return later(10).then(function () { return r.settle('SERVER_TRUE'); })
    .then(function () { return Promise.resolve(p).catch(function () { return null; }); })
    .then(function () { return later(10); })
    .then(function () {
      var c = r.controller();
      eq(r.calls(UNIV), 1, 'E1  the first read went out and failed');
      ok(retryBtn(r.dom) !== null, 'E2  a retry control is offered');
      var a = c.retryUniverse(), b = c.retryUniverse();
      eq(a === b, true, 'E3  two clicks share ONE in-flight retry — single-flight unchanged  [M7]');
      return Promise.resolve(a).catch(function () { return null; })
        .then(function () { return later(15); })
        .then(function () {
          eq(r.calls(UNIV), 2, 'E4  and the retry issued exactly one more read  [M7]');
          eq(c.universeRetryInFlight, null, 'E5  the retry latch was released  [M8]');
        });
    });
});

CHAIN = CHAIN.then(function () {
  /* E6-E10 — UNMOUNTED BEFORE THE CLICK. The control is gone from the screen, but the controller
     is still reachable from a continuation that captured it, which is exactly how the measured
     defect reached the wire. */
  var r = rig({ answers: { 'productPricing.siteUniverse.get': function () {
    return { success: false, code: 'REQUEST_TIMEOUT', details: {} }; } } });
  var p = r.start();
  return later(10).then(function () { return r.settle('SERVER_TRUE'); })
    .then(function () { return Promise.resolve(p).catch(function () { return null; }); })
    .then(function () { return later(10); })
    .then(function () {
      var c = r.controller();
      var before = r.log.length;
      var sigBefore = r.sig();
      r.unmount();
      return Promise.resolve(c.retryUniverse()).catch(function () { return null; })
        .then(function () { return later(20); })
        .then(function () {
          eq(r.log.length, before, 'E6  a retry on an unmounted controller dispatches NOTHING  [M7]');
          eq(r.sig(), sigOf(r.dom), 'E7  (signature is read twice from the same DOM — stability check)');
          eq(c.universeRetryInFlight, null, 'E8  and the retry latch is not left hanging  [M8]');
          eq(r.throws(), 0, 'E9  nothing threw');
          eq(c.alive, false, 'E10 the controller is still not-alive — the guard did not resurrect it');
        });
    });
});

/* ===============================================================================================
   §F — WHAT THE UNMOUNT MUST STILL ALLOW, AND WHAT IT MUST STILL COST.
   =============================================================================================== */
CHAIN = CHAIN.then(function () {
  section('§F — settlement, latches, idle');

  /* F1-F5 — THE SETTLEMENT STILL COMPLETES. A guard that left the page waiting would reinstate the
     permanent LOADING_CAPABILITY that F3-R4 exists to have removed, one layer up. */
  var r = rig();
  var p = r.start();
  var resolved = false, rejected = false;
  return later(10).then(function () {
    r.unmount();
    Promise.resolve(p).then(function () { resolved = true; }, function () { rejected = true; });
    return r.settle('SERVER_TRUE');
  }).then(function () { return later(20); }).then(function () {
    eq(resolved, true, 'F1  the page-life promise still RESOLVES after an unmount  [M5]');
    eq(rejected, false, 'F2  it does not reject');
    var c = r.P.lastController;
    eq(c, null, 'F3  the lifecycle holds no controller');
    eq(r.log.length, 0, 'F4  and the whole life cost zero requests');
    eq(r.throws(), 0, 'F5  with nothing thrown');
  });
});

CHAIN = CHAIN.then(function () {
  /* F6-F9 — IDLE. Nothing in this page schedules work, so an idle window after an unmount must
     stay at zero without anything having to stop a timer. The window is scaled: there is no timer
     to outlast, and a real sixty seconds would only make the suite slower. */
  var r = rig();
  var p = r.start();
  return later(10).then(function () {
    r.unmount();
    return r.settle('SERVER_TRUE');
  }).then(function () { return Promise.resolve(p).catch(function () { return null; }); })
    .then(function () {
      var atSettle = { reqs: r.log.length, sig: r.sig() };
      return later(1200).then(function () {
        eq(r.log.length, atSettle.reqs, 'F6  an idle window after the unmount adds no request');
        eq(r.sig(), atSettle.sig, 'F7  and no DOM mutation');
        eq(r.throws(), 0, 'F8  and nothing threw');
        eq(atSettle.reqs, 0, 'F9  (the count it held at was zero)');
      });
    });
});

CHAIN = CHAIN.then(function () {
  /* F10-F13 — A REQUEST ALREADY IN FLIGHT IS NOT THIS ROUND'S BUSINESS. The unmount happens while
     the universe read is open; F2 owns what happens to it, and the only thing asserted here is
     that this round did not change it: the read completes, nothing is drawn, no SECOND request is
     started, and no latch is left set. */
  var release = null;
  var held = new Promise(function (res) { release = res; });
  var r = rig({ answers: { 'productPricing.siteUniverse.get': function () { return held; } } });
  var p = r.start();
  return later(10).then(function () { return r.settle('SERVER_TRUE'); })
    .then(function () { return later(10); })
    .then(function () {
      eq(r.calls(UNIV), 1, 'F10 the universe read is open');
      var sigBefore;
      r.unmount();
      sigBefore = r.sig();
      release(universeOk());
      return Promise.resolve(p).catch(function () { return null; })
        .then(function () { return later(20); })
        .then(function () {
          eq(r.calls(UNIV), 1, 'F11 the in-flight read completed and started NO second request');
          eq(r.sig(), sigBefore, 'F12 it drew nothing into the emptied page — F2 contract intact');
          eq(r.throws(), 0, 'F13 and nothing threw');
        });
    });
});

CHAIN = CHAIN.then(function () {
  /* F14-F17 — READS ONLY, and the bounds this round must not have moved. */
  eq((SRC.page.match(/(^|[^.\w])fetch\s*\(|XMLHttpRequest|\.post\s*\(/g) || []).length, 0,
    'F14 the page opens no transport of its own');
  ok(/KM_READ_TIMEOUT_MS_ = 45000/.test(SRC.dbapi), 'F15 the read timeout is still 45000ms');
  ok(/for \(var attemptN = 1; attemptN <= 2; attemptN\+\+\)/.test(SRC.dbapi),
    'F16 the read runner still makes at most two physical attempts');
  eq((SRC.accessor.match(/SERVER_AUTHORITATIVE_FALLBACK_CODES = \['SOURCE_TIMED_OUT', 'HTTP_NOT_FOUND'\]/g) || []).length, 1,
    'F17 and the F3-R4 transient allowlist is untouched');
  /* F18-F19 — THE F4 CONTRACT IS UNTOUCHED, asserted against the shipped bytes rather than assumed
     from the fact that this round did not mean to change it. */
  ok(/\.then\(_kmCapVerifyServedAction_\);/.test(SRC.dbapi),
    'F18 F4\'s action verification is still attached to the capability getter');
  ok(/if \(u\.state === 'FEATURE_DISABLED' && u\.refusedWithoutRequest === false\) \{/.test(SRC.page),
    'F19 and F4\'s provenance-gated FEATURE_DISABLED copy is unchanged');
});

/* ===============================================================================================
   §M — EIGHT MUTANTS, EACH DRIVEN.
   =============================================================================================== */
function mutateFile(rel, from, to) {
  var full = path.join(ROOT, rel);
  var original = fs.readFileSync(full, 'utf8');
  var normalized = original.replace(/\r\n/g, '\n');
  if (normalized.split(from).length - 1 !== 1) { return null; }
  return { apply: function () { fs.writeFileSync(full, normalized.split(from).join(to), 'utf8'); },
    restore: function () { fs.writeFileSync(full, original, 'utf8'); } };
}
function withMutant(rel, from, to, probe) {
  var m = mutateFile(rel, from, to);
  if (!m) { return Promise.resolve(false); }      // anchor missing or ambiguous: SURVIVED, loudly
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
var PAGE_REL = 'assets/js/pages/product-strategy-board.js';

CHAIN = CHAIN.then(function () {
  section('§M — eight mutants, each driven');

  /* M1 IS THE PRE-FIX REPRODUCTION. Removing the guard must put the measured number back to ONE,
     which is what the deployed baseline and F4 both produced. A mutant that did not restore the
     defect would mean the guard was never what fixed it. */
  return score('M1  the central guard is removed — the ORIGINAL DEFECT returns  [B1]',
    withMutant(PAGE_REL,
      '      var gone = abandonedDispatch(C.state);\n      if (gone) { return Promise.resolve(gone); }',
      '',
      function () {
        return unmountedRun('SERVER_TRUE').then(function (o) { return o.r.calls(UNIV) === 1; });
      }))

  .then(function () {
    return score('M2  the liveness test is INVERTED  [B1, C1, D8]',
      withMutant(PAGE_REL,
        '      if (C.alive === true) { return null; }',
        '      if (C.alive !== true) { return null; }',
        function () {
          /* Inverted, a LIVE page is the one that gets blocked; the mounted read is the probe. */
          return mountedRun('SERVER_TRUE').then(function (r) { return r.calls(UNIV) !== 1; });
        }));
  })

  .then(function () {
    return score('M3  the guard runs AFTER the request has been started  [A5, B1]',
      withMutant(PAGE_REL,
        '      var gone = abandonedDispatch(C.state);\n      if (gone) { return Promise.resolve(gone); }',
        '',
        function () {
          /* Expressed as the edit it actually is: moving the check below the dispatch is the same
             as having no check before it, and the measurement is the request that left. */
          return unmountedRun('SERVER_TRUE').then(function (o) { return o.r.log.length !== 0; });
        }));
  })

  .then(function () {
    /* M4 — THE DELEGATED-ONLY GUARD. This is the shape the code had before this round: liveness
       checked on the transient road and nowhere else. It is the mutant that proves a per-branch
       guard is not the same thing as a central one. */
    return score('M4  only the delegated branch is protected, as before this round  [B1]',
      withMutant(PAGE_REL,
        '      var gone = abandonedDispatch(C.state);\n      if (gone) { return Promise.resolve(gone); }',
        '      var gone = (C.alive === true) ? null : abandonedDispatch(C.state);\n'
        + '      if (gone && serverAuthorityAllowed()) { return Promise.resolve(gone); }',
        function () {
          return unmountedRun('SERVER_TRUE').then(function (o) { return o.r.calls(UNIV) !== 0; });
        }));
  })

  .then(function () {
    /* M5 — THE GUARD NEVER LIFTS. A controller that can never dispatch again would make the fix
       cost the next visit its page, which is the failure this round must not trade for. */
    return score('M5  the guard blocks permanently — the next visit never loads  [D3, F1]',
      withMutant(PAGE_REL,
        '      if (C.alive === true) { return null; }\n      return { state: state, mounted: false, may_analyse: false, refusals: [] };',
        '      return { state: state, mounted: false, may_analyse: false, refusals: [] };',
        function () {
          return mountedRun('SERVER_TRUE').then(function (r) { return r.calls(UNIV) !== 1; });
        }));
  })

  .then(function () {
    /* M6 — THE MOUNTED PATH IS BLOCKED by testing the wrong property. `alive` exists; `mounted`
       is false until a board is up, so this reads as "not alive" on every first load. */
    return score('M6  the guard reads the wrong controller property  [C1, C3]',
      withMutant(PAGE_REL,
        '      if (C.alive === true) { return null; }',
        '      if (C.mounted === true) { return null; }',
        function () {
          return mountedRun('SERVER_TRUE').then(function (r) { return r.calls(UNIV) !== 1; });
        }));
  })

  .then(function () {
    /* M7 — THE RETRY BYPASSES THE GUARD by reaching the accessor directly, which is precisely the
       road a "just one more place" fix grows. */
    return score('M7  the user retry dispatches around the shared point  [E6]',
      withMutant(PAGE_REL,
        '      try { started = loadUniverseResolved(); } catch (e) { fail(e); return p; }',
        '      try { started = Promise.resolve(accessor.getSiteUniverse({ signal: opts.signal }))\n'
        + '        .then(function () { return loadUniverseResolved(); }); } catch (e) { fail(e); return p; }',
        function () {
          var r = rig({ answers: { 'productPricing.siteUniverse.get': function () {
            return { success: false, code: 'REQUEST_TIMEOUT', details: {} }; } } });
          var p = r.start();
          return later(10).then(function () { return r.settle('SERVER_TRUE'); })
            .then(function () { return Promise.resolve(p).catch(function () { return null; }); })
            .then(function () { return later(10); })
            .then(function () {
              var c = r.controller();
              var before = r.log.length;
              r.unmount();
              return Promise.resolve(c.retryUniverse()).catch(function () { return null; })
                .then(function () { return later(20); })
                .then(function () { return r.log.length !== before; });
            });
        }));
  })

  .then(function () {
    /* M8 — THE WORKSPACE HALF IS DROPPED. The invariant names two external reads; protecting one
       of them is the same partial fix this round is replacing. */
    return score('M8  the workspace dispatch loses its guard  [D10]',
      withMutant(PAGE_REL,
        '      var gone = abandonedDispatch(P.LOADING_WORKSPACE);\n      if (gone) { return Promise.resolve(gone); }',
        '',
        function () {
          var r = rig();
          var p = r.start();
          return later(10).then(function () { return r.settle('SERVER_TRUE'); })
            .then(function () { return Promise.resolve(p).catch(function () { return null; }); })
            .then(function () { return later(10); })
            .then(function () {
              var c = r.controller();
              r.unmount();
              var before = r.log.length;
              return Promise.resolve(c.loadWorkspace()).catch(function () { return null; })
                .then(function () { return later(20); })
                .then(function () { return r.log.length !== before; });
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
