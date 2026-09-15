/**
 * PRODUCT-STRATEGY-P1-B8D-R10E — USER-TRIGGERED RECOVERY
 * =============================================================================================
 *
 * WHAT THIS ROUND IS ANSWERING, AND WHY A TEST FILE HAS TO SAY IT.
 *
 * R10D's corrected reliability gate measured the deployed bytes and FAILED: 56 of 60 official
 * reads succeeded, and 19 of 20 fresh-session cold boots settled the capability. The single cold
 * boot that did not was not the server refusing — across 85 live logical reads, every one of the
 * twelve 404s landed on the /exec REDIRECT TARGET and NOT ONE landed on the stable endpoint, and
 * two reads that hit one recovered on the very next attempt with a 200 and a JSON body. One of
 * them, measured end to end, bounced between the two hosts five times with five 302s and no
 * response at all until the production read budget aborted it.
 *
 * SO THE ANSWER WAS THERE AND ONE HOP COULD NOT BE READ, and the cost of that is a whole page
 * life: the bootstrap runs once, the mirror settles to a classified failure, `refreshCapability`
 * dispatches nothing by design, and route-away and return re-read nothing. Every one of those is
 * correct on its own and together they mean the board stays unusable until somebody thinks to
 * reload a page that never told them to.
 *
 * WHAT R10E ADDS IS ONE MORE READ THAT A PERSON ASKS FOR. No timer, no second automatic
 * bootstrap, no raised retry ceiling, no longer timeout, no new action, no new socket. The whole
 * round is: a shared re-entry into the bootstrap that already existed, a button on the refusals
 * that can honestly change, and the discipline to keep the ones that cannot from getting one.
 *
 * WHAT THIS SUITE REFUSES TO ACCEPT AS EVIDENCE. Every section below asserts BEHAVIOUR and
 * REQUEST COUNTS. A test that checked for the string `retryClientCapabilities` in a source file
 * would pass against a function that dispatches nothing, against a timer that retries by itself,
 * and against a button rendered under FEATURE_DISABLED — which are three of the twelve mutants in
 * §M, and each of them is caught by a named assertion rather than by a census.
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

/* ORDER MATTERS, AND THE ADAPTER SAYS SO ITSELF: it throws if PSB_CONTRACT is absent, which is the
   same ordering index.html enforces with script tags. The contract module publishes onto its own
   module scope under Node, so the global it looks for has to be set the way every other suite in
   this family sets it — explicitly, from the export. */
global.PSB_CONTRACT = require(path.join(JS, 'product-strategy', 'psb-data-contract.js')).PSB_CONTRACT;
require(path.join(JS, 'api', 'km-product-pricing-adapter.js'));
var LIVE = require(path.join(JS, 'product-strategy', 'km-product-strategy-live-adapter.js'));
var UNI = require(path.join(JS, 'product-strategy', 'km-product-strategy-site-universe.js'));
var ACC = require(path.join(JS, 'api', 'km-product-pricing-workspace.js'));
var PAGE = require(path.join(JS, 'pages', 'product-strategy-board.js'));

var SRC = {
  dbapi: read(path.join(JS, 'api', 'operation-system-db-api.js')),
  page: read(path.join(JS, 'pages', 'product-strategy-board.js')),
  accessor: read(path.join(JS, 'api', 'km-product-pricing-workspace.js')),
  transport: read(path.join(JS, 'api', 'km-transport.js')),
  css: readRoot('assets/css/product-strategy-board.css'),
  index: readRoot('index.html'),
  partial: readRoot('assets/html/pages/product-strategy-board.html')
};
var partialSkeleton = H.productionSkeleton(SRC.partial);

var pass = 0, fail = 0, mutCaught = 0, mutSurvived = 0;
/* A PROMISE NOBODY RESOLVES DRAINS THE EVENT LOOP AND EXITS 0 WITH HALF THE SUITE UNRUN, which is
   the one failure mode an async suite can have that looks exactly like success. This flag makes the
   truncation itself a failure. */
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
function destring(s) {
  return decomment(s).replace(/'(?:[^'\\\n]|\\.)*'/g, "''").replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
}

/* =============================================================================================
   THE SHARED SEAM.

   The accessor is the PRODUCTION module and `setCapability` is the PRODUCTION setter the shared
   bootstrap calls — this file drives the mirror the same way db-api drives it, and never by
   assigning an internal. Resetting between scenarios matters because the accessor is a singleton
   this process shares with every other section.
   ============================================================================================= */
function capServerTrue() { ACC.setCapability({ product_strategy_enabled: true }); }
function capServerFalse() { ACC.setCapability({ product_strategy_enabled: false }); }
function capFieldAbsent() { ACC.setCapability({}); }
/* THE DRIVERS ARE THE INPUTS PRODUCTION ACTUALLY SENDS, not the states it produces. db-api hands
   the accessor a TRANSPORT code plus an http status, and the accessor classifies; driving it with
   its own OUTPUT names would test a path no deployment can reach. Measured from the shipped
   classifier: the status decides, except REQUEST_TIMEOUT, which is the one code that survives it. */
function capFailed(code, status) {
  ACC.setCapability(null, { failureCode: code, httpStatus: (status === undefined ? null : status) });
}
var CAP_DRIVER = {
  HTTP_NOT_FOUND:       function () { capFailed('HTTP_NOT_FOUND', 404); },
  SOURCE_TIMED_OUT:     function () { capFailed('REQUEST_TIMEOUT', null); },
  NOT_AUTHORIZED:       function () { capFailed('AUTH_OR_ACCESS_HTML', 401); },
  SOURCE_NOT_CONNECTED: function () { capFailed('HTTP_TRANSPORT_ERROR', null); }
};

/* A site universe answer in the production envelope shape, and a refusal in it too.

   `sourceState` IS THE SERVER'S VOCABULARY, NOT THE ADAPTER'S. The module freezes four states a
   server may send — READY, SOURCE_EMPTY, SOURCE_PARTIALLY_READABLE, STOP_DATA_INTEGRITY — and
   reports `OK` itself. A fixture that sent 'OK' would be rejected as SCHEMA_CONTRACT_MISMATCH,
   which is the adapter being right and the fixture being wrong. */
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
  return { success: true,
    data: { sites: sites, refusals: [], sourceState: 'READY',
      hierarchy: { companies: companies, countries_by_company: byCompany,
        marketplaces_by_country: byCountry } },
    meta: { action: 'productPricing.siteUniverse.get' }, errors: [] };
}
/* A site list that WAS read and is empty — the server's own SOURCE_EMPTY, not a failure. */
function universeEmpty() {
  return { success: true,
    data: { sites: [], refusals: [], sourceState: 'SOURCE_EMPTY',
      hierarchy: { companies: [], countries_by_company: {}, marketplaces_by_country: {} } },
    meta: { action: 'productPricing.siteUniverse.get' }, errors: [] };
}
function universeRefusal(code) {
  return { success: true,
    data: { sites: [], refusals: [{ code: code }], sourceState: code },
    meta: { action: 'productPricing.siteUniverse.get', refused: true, refusalCode: code }, errors: [] };
}
var SITE = { company: 'KM', country: 'US', marketplace: 'Shopify',
  membership_row_count: 3, active_count: 3, phasing_out_count: 0, inactive_count: 0,
  discontinued_count: 0, unknown_status_count: 0, blank_id_count: 0, refusal_reasons: [],
  default_status_row_count: 0, selectable: true, selectable_with_inactive: true,
  site_key: 'KM|US|Shopify' };

/* A scripted accessor that COUNTS, so "one click, one read" is a number rather than a claim. */
function scriptedAccessor(universeAnswers, workspaceAnswers) {
  var calls = { universe: 0, workspace: 0 };
  return {
    calls: calls,
    isEnabled: ACC.isEnabled, capabilityState: ACC.capabilityState,
    capabilityFailure: ACC.capabilityFailure, setCapability: ACC.setCapability,
    getSiteUniverse: function () {
      var i = Math.min(calls.universe, universeAnswers.length - 1);
      calls.universe++;
      return Promise.resolve(universeAnswers[i]);
    },
    get: function (params) {
      var i = Math.min(calls.workspace, workspaceAnswers.length - 1);
      calls.workspace++;
      var a = workspaceAnswers[i];
      return Promise.resolve(typeof a === 'function' ? a(params) : a);
    }
  };
}

function mount(accessor, board) {
  var dom = H.makeDom(partialSkeleton);
  var c = PAGE.create({ document: dom.document, accessor: accessor,
    siteUniverse: UNI, liveAdapter: LIVE, board: board || null });
  return { dom: dom, c: c };
}
function stateBox(dom) { return dom.document.getElementById('psb-state-host'); }
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
function boxText(dom) { var h = stateBox(dom); return h ? String(h.textContent || '') : ''; }

console.log('PRODUCT STRATEGY — USER-TRIGGERED RECOVERY (P1-B8D-R10E)');

/* =============================================================================================
   §A — THE CAPABILITY RETRY IS OWNED BY THE SHARED BOOTSTRAP, AND IT IS SINGLE-FLIGHTED.

   The block under test is the SHIPPED block, lifted out of operation-system-db-api.js by its own
   markers and run in a sandbox whose only stub is the function it calls. That is deliberate: the
   thing this section is proving is the LATCH, and a latch is only provable by issuing overlapping
   calls and counting how many reach the other side. Stubbing the bootstrap is what makes the
   count observable; stubbing the latch would be testing the test.
   ============================================================================================= */
section('§A — the shared retry: owner, re-entry and a real single-flight');

var RETRY_BLOCK = (function () {
  var m = /var _kmCapRetryInFlight_[\s\S]*?window\.KM\.DB\.capabilityRetryState = function \(\) \{[\s\S]*?\n\};/
    .exec(SRC.dbapi);
  return m ? m[0] : null;
}());
ok(RETRY_BLOCK !== null, 'A1  the shipped db-api carries the R10E retry block');

function runRetryBlock(bootstrapImpl) {
  var sandbox = { window: { KM: { DB: {} } }, Promise: Promise, console: console };
  sandbox._kmApplyClientCapabilities_ = bootstrapImpl;
  vm.createContext(sandbox);
  vm.runInContext(RETRY_BLOCK, sandbox);
  return sandbox.window.KM.DB;
}

/* A1..A6 — one click is one logical read; five clicks are still one. */
(function () {
  var issued = 0, release = null;
  var DB = runRetryBlock(function () {
    issued++;
    return new Promise(function (res) { release = res; });
  });
  eq(typeof DB.retryClientCapabilities, 'function', 'A2  KM.DB.retryClientCapabilities is the public API');
  eq(typeof DB.capabilityRetryState, 'function', 'A3  and its state is readable rather than inferred');
  eq(DB.capabilityRetryState().inFlight, false, 'A4  nothing is in flight before anybody clicks');

  var p1 = DB.retryClientCapabilities();
  eq(issued, 1, 'A5  one click issues exactly ONE logical read');
  eq(DB.capabilityRetryState().inFlight, true, 'A6  and the state says a retry is open');

  var p2 = DB.retryClientCapabilities();
  var p3 = DB.retryClientCapabilities();
  var p4 = DB.retryClientCapabilities();
  var p5 = DB.retryClientCapabilities();
  eq(issued, 1, 'A7  five clicks while one is open issue ONE read, not five  [M1]');
  ok(p1 === p2 && p2 === p3 && p3 === p4 && p4 === p5,
    'A8  and every later click gets the SAME promise, not a new one');

  release({});
  return p1.then(function () {
    eq(DB.capabilityRetryState().inFlight, false, 'A9  the latch clears on settlement');
    var p6 = DB.retryClientCapabilities();
    eq(issued, 2, 'A10 so the NEXT click is a real read — the latch is not a one-shot');
    release({});                      // settle it too, or the suite hangs on a promise nobody resolves
    return p6;
  });
}())
  .then(function () {
    /* A failed retry must release the latch too, or every later click inherits the first failure. */
    var issued = 0, rejectIt = null;
    var DB = runRetryBlock(function () {
      issued++;
      return new Promise(function (_r, rej) { rejectIt = rej; });
    });
    var p = DB.retryClientCapabilities();
    rejectIt(new Error('the read failed'));
    return p.then(function (v) {
      eq(v, null, 'A11a a rejected bootstrap resolves to null rather than rejecting the click');
      eq(DB.capabilityRetryState().inFlight, false, 'A11 a REJECTED retry releases the latch as well');
      DB.retryClientCapabilities();
      eq(issued, 2, 'A12 so a person can try again after a failure  [the "reload fixes it" bug]');
    });
  })
  .then(function () {
    /* A13 — the latch is a promise, not a time window. A debounce would re-issue the moment the
       window closed, which is exactly the case this exists for: the measured failures took 45-60s. */
    var body = decomment(RETRY_BLOCK);
    eq((body.match(/setTimeout|setInterval|Date\.now\(\)\s*-/g) || []).length, 0,
      'A13 the latch uses no timer and no time window  [M1/M2]');
    eq(typeof PAGE.isRetryableCode, 'function', 'A14 the page publishes its retryable table');
  })

/* =============================================================================================
   §B — NOTHING RETRIES BY ITSELF. Ever.
   ============================================================================================= */
  .then(function () {
    section('§B — no automatic retry anywhere in the round');
    var pageCode = decomment(SRC.page);
    var dbCode = decomment(SRC.dbapi);
    var r10e = RETRY_BLOCK ? decomment(RETRY_BLOCK) : '';

    eq((r10e.match(/setInterval|setTimeout/g) || []).length, 0,
      'B1  the shared retry schedules nothing  [M2]');
    var retryFns = (pageCode.match(/C\.retry(Capability|Universe|Workspace) = function[\s\S]*?\n    \};/g) || []);
    eq(retryFns.length, 3, 'B2  the page defines exactly three retries');
    eq(retryFns.join('').match(/setInterval|setTimeout|requestAnimationFrame/g) || [],
      [], 'B3  and not one of them schedules itself  [M2]');

    /* THE BEHAVIOURAL HALF OF THE SAME QUESTION: a controller left alone issues nothing. */
    capFailed('HTTP_NOT_FOUND', 404);
    var acc = scriptedAccessor([universeOk([SITE])], []);
    var m = mount(acc);
    return m.c.loadUniverse().then(function () {
      var before = acc.calls.universe + acc.calls.workspace;
      return new Promise(function (res) { setTimeout(res, 120); }).then(function () {
        eq(acc.calls.universe + acc.calls.workspace, before,
          'B4  a refused board left alone sends nothing more  [M2]');
        eq(before, 0, 'B5  and a failed capability sent nothing in the first place');
      });
    });
  })

/* =============================================================================================
   §C — THE CAPABILITY REFUSALS, AND WHICH OF THEM MAY OFFER A BUTTON.
   ============================================================================================= */
  .then(function () {
    section('§C — capability: fail closed, then a retry only where one can help');

    /* The four the capability path can actually reach, proven by driving the shipped classifier
       with the transport codes db-api sends rather than with state names it never receives. */
    var cases = [
      ['HTTP_NOT_FOUND', 404, true, 'C1'],
      ['SOURCE_TIMED_OUT', null, true, 'C2'],
      ['SOURCE_NOT_CONNECTED', null, true, 'C3'],
      ['NOT_AUTHORIZED', 401, false, 'C6']
    ];
    var chain = Promise.resolve();
    cases.forEach(function (row) {
      chain = chain.then(function () {
        CAP_DRIVER[row[0]]();
        var acc = scriptedAccessor([universeOk([SITE])], []);
        var m = mount(acc);
        return m.c.loadUniverse().then(function (r) {
          eq(r.state, row[0], row[3] + 'a ' + row[0] + ' is reported as itself');
          eq(acc.calls.universe, 0, row[3] + 'b and cost ZERO downstream reads');
          var btn = retryBtn(m.dom);
          eq(!!btn, row[2], row[3] + 'c retry offered = ' + row[2]
            + (row[2] ? '' : '  [retrying is pointless; it needs a person with access]'));
          ok(boxText(m.dom).indexOf(row[0]) >= 0,
            row[3] + 'd and the classified code is still on screen  [M3]');
        });
      });
    });
    return chain;
  })

  .then(function () {
    /* C7 — the one a button must NEVER appear under. */
    capServerFalse();
    var acc = scriptedAccessor([universeOk([SITE])], []);
    var m = mount(acc);
    return m.c.loadUniverse().then(function (r) {
      eq(r.state, 'FEATURE_DISABLED', 'C7a an explicit server false is FEATURE_DISABLED');
      eq(retryBtn(m.dom), null,
        'C7b and it gets NO retry button — a product decision is not a connection problem  [M11]');
      eq(acc.calls.universe, 0, 'C7c and zero requests');
    });
  })

  .then(function () {
    /* C8 — a server that answered without the field CAN change, and says so in its own words. */
    capFieldAbsent();
    var acc = scriptedAccessor([universeOk([SITE])], []);
    var m = mount(acc);
    return m.c.loadUniverse().then(function (r) {
      eq(r.state, 'CAPABILITY_NOT_REPORTED', 'C8a a missing field is CAPABILITY_NOT_REPORTED');
      var btn = retryBtn(m.dom);
      ok(!!btn, 'C8b it offers a re-read, because a newer deployment is what would change it');
      ok(btn && String(btn.textContent).indexOf('again') >= 0,
        'C8c and the label says READ AGAIN rather than reconnect');
      eq(boxText(m.dom).indexOf('switched off') >= 0, true,
        'C8d while the sentence still separates it from the board being off');
    });
  })

  .then(function () {
    /* C9-C12 — a transport failure NEVER becomes FEATURE_DISABLED, at any of the five codes. */
    var codes = ['HTTP_NOT_FOUND', 'SOURCE_TIMED_OUT', 'SOURCE_NOT_CONNECTED'];
    var chain = Promise.resolve();
    codes.forEach(function (code, i) {
      chain = chain.then(function () {
        CAP_DRIVER[code]();
        var acc = scriptedAccessor([universeOk([SITE])], []);
        var m = mount(acc);
        return m.c.loadUniverse().then(function (r) {
          ok(r.state !== 'FEATURE_DISABLED',
            'C9.' + (i + 1) + ' ' + code + ' is never rendered as FEATURE_DISABLED');
          eq(boxText(m.dom).indexOf('FEATURE_DISABLED'), -1,
            'C10.' + (i + 1) + ' and the words never reach the screen either');
        });
      });
    });
    return chain;
  })

/* =============================================================================================
   §D — CLICKING IT. The capability retry, driven through the real button.
   ============================================================================================= */
  .then(function () {
    section('§D — the capability retry, clicked');

    /* A stand-in for the SHARED bootstrap: it is what db-api exposes, and the page may only use
       this door. It settles the production mirror, exactly as `_kmApplyClientCapabilities_` does. */
    var bootstrapCalls = 0, nextAnswer = null;
    global.KM = global.KM || {};
    global.KM.DB = global.KM.DB || {};
    global.KM.DB.retryClientCapabilities = function () {
      bootstrapCalls++;
      return Promise.resolve().then(function () {
        if (nextAnswer === 'ok') { capServerTrue(); }
        else if (nextAnswer === 'absent') { capFieldAbsent(); }
        else { capFailed('HTTP_NOT_FOUND', 404); }
      });
    };

    capFailed('HTTP_NOT_FOUND', 404);
    nextAnswer = 'ok';
    var acc = scriptedAccessor([universeOk([SITE])], []);
    var m = mount(acc);
    return m.c.loadUniverse().then(function () {
      var btn = retryBtn(m.dom);
      ok(!!btn, 'D1  the refusal renders a retry control');
      eq(btn.tagName, 'BUTTON', 'D2  and it is a real <button>, not a styled div');
      eq(btn.type, 'button', 'D3  typed `button`, so it cannot submit anything');
      eq(btn.disabled, false, 'D4  enabled while idle');
      eq(btn.getAttribute('aria-busy'), 'false', 'D5  and not busy while idle');
      eq(acc.calls.universe, 0, 'D6  and still zero downstream reads before the click');

      btn.click();
      eq(bootstrapCalls, 1, 'D7  ONE click reaches the SHARED bootstrap exactly once');
      return new Promise(function (r) { setTimeout(r, 30); }).then(function () {
        eq(ACC.capabilityState(), 'SERVER_TRUE', 'D8  a successful retry settles the mirror');
        eq(acc.calls.universe, 1,
          'D9  and only NOW does the site universe get read  [M10: never before capability]');
        eq(m.c.retries.capability, 1, 'D10 the page counts one capability retry');
      });
    });
  })

  .then(function () {
    /* D11-D14 — a retry that fails again keeps the newest classified reason and stays clickable. */
    global.KM.DB.retryClientCapabilities = function () {
      return Promise.resolve().then(function () { CAP_DRIVER.SOURCE_TIMED_OUT(); });
    };
    capFailed('HTTP_NOT_FOUND', 404);
    var acc = scriptedAccessor([universeOk([SITE])], []);
    var m = mount(acc);
    return m.c.loadUniverse().then(function () {
      retryBtn(m.dom).click();
      return new Promise(function (r) { setTimeout(r, 30); }).then(function () {
        eq(m.c.state, 'SOURCE_TIMED_OUT',
          'D11 a retry that fails again shows the NEW reason, not the old one  [M3]');
        ok(boxText(m.dom).indexOf('SOURCE_TIMED_OUT') >= 0, 'D12 the new code is on screen');
        ok(!!retryBtn(m.dom), 'D13 and the button is still there — no dead end');
        eq(acc.calls.universe, 0, 'D14 a failed retry reads nothing downstream');
      });
    });
  })

  .then(function () {
    /* D15 — five clicks on the page's button are one logical retry, because the page latches too. */
    var calls = 0, release = null;
    global.KM.DB.retryClientCapabilities = function () {
      calls++;
      return new Promise(function (res) { release = res; });
    };
    capFailed('HTTP_NOT_FOUND', 404);
    var acc = scriptedAccessor([universeOk([SITE])], []);
    var m = mount(acc);
    return m.c.loadUniverse().then(function () {
      var b = retryBtn(m.dom);
      b.click();
      eq(calls, 1, 'D15 the first click reaches the bootstrap');
      m.c.retryCapability(); m.c.retryCapability(); m.c.retryCapability(); m.c.retryCapability();
      eq(calls, 1, 'D16 four more while it is open reach it ZERO more times  [M1]');
      eq(m.c.retries.capability, 1, 'D17 and the page counts ONE retry, not five');
      var busy = retryBtn(m.dom);
      ok(!!busy && busy.disabled === true, 'D18 the button is disabled while the read is open');
      eq(busy.getAttribute('aria-busy'), 'true', 'D19 and marked aria-busy for a screen reader');
      release();
      return new Promise(function (r) { setTimeout(r, 30); });
    });
  })

/* =============================================================================================
   §E — ACCESSIBILITY AND FOCUS. Keyboard first, because the box is destroyed and rebuilt.
   ============================================================================================= */
  .then(function () {
    section('§E — keyboard, busy state and the focus contract');

    global.KM.DB.retryClientCapabilities = function () {
      return Promise.resolve().then(function () { capServerTrue(); });
    };
    capFailed('HTTP_NOT_FOUND', 404);
    var acc = scriptedAccessor([universeOk([SITE])], []);
    var m = mount(acc);
    return m.c.loadUniverse().then(function () {
      var btn = retryBtn(m.dom);
      eq(btn.tagName, 'BUTTON',
        'E1  a real <button> — Enter and Space are the browser\'s contract, not this file\'s');
      ok(typeof btn.click === 'function', 'E2  and it is activatable');
      /* A <button> receives Enter/Space as a click from the browser. What this file must NOT do is
         re-implement them on a non-button, which E1 is what rules out. */
      var live = null;
      (function walk(n) {
        if (!n || live) return;
        if (n.getAttribute && n.getAttribute('data-cy') === 'psb-state-live') { live = n; return; }
        (n.childNodes || []).forEach(walk);
      }(stateBox(m.dom)));
      ok(!!live, 'E3  a polite live region accompanies the control');
      eq(live.getAttribute('aria-live'), 'polite', 'E4  announced politely, not assertively');
      eq(String(live.textContent || ''), '', 'E5  and silent while idle — nothing to announce yet');

      btn.click();
      var busyLive = null;
      (function walk(n) {
        if (!n || busyLive) return;
        if (n.getAttribute && n.getAttribute('data-cy') === 'psb-state-live') { busyLive = n; return; }
        (n.childNodes || []).forEach(walk);
      }(stateBox(m.dom)));
      ok(busyLive && String(busyLive.textContent || '').length > 0,
        'E6  and it announces the retry once it is open');

      return new Promise(function (r) { setTimeout(r, 30); }).then(function () {
        ok(m.dom.document.activeElement !== null,
          'E7  focus is placed after a successful retry, not dropped on <body>');
      });
    });
  })

  .then(function () {
    /* E8 — after a FAILED retry, focus returns to the button, which is where the person was. */
    global.KM.DB.retryClientCapabilities = function () {
      return Promise.resolve().then(function () { capFailed('HTTP_NOT_FOUND', 404); });
    };
    capFailed('HTTP_NOT_FOUND', 404);
    var acc = scriptedAccessor([universeOk([SITE])], []);
    var m = mount(acc);
    return m.c.loadUniverse().then(function () {
      retryBtn(m.dom).click();
      return new Promise(function (r) { setTimeout(r, 30); }).then(function () {
        var a = m.dom.document.activeElement;
        ok(a && a.tagName === 'BUTTON',
          'E8  a failed retry returns focus to the button — the next attempt is where they are');
      });
    });
  })

/* =============================================================================================
   §F — THE SITE UNIVERSE. Refusal and loaded-empty stay two different things.
   ============================================================================================= */
  .then(function () {
    section('§F — site universe: retry, and the empty/refused distinction');

    capServerTrue();
    var acc = scriptedAccessor([universeRefusal('HTTP_NOT_FOUND'), universeOk([SITE])], []);
    var m = mount(acc);
    return m.c.loadUniverse().then(function (r) {
      eq(r.state, 'HTTP_NOT_FOUND', 'F1  a refused universe reports its code');
      eq(acc.calls.universe, 1, 'F2  one read was attempted');
      eq(acc.calls.workspace, 0, 'F3  and NO workspace read followed  [M10]');
      var btn = retryBtn(m.dom);
      ok(!!btn, 'F4  a retryable universe refusal offers a button');

      btn.click();
      return new Promise(function (r2) { setTimeout(r2, 30); }).then(function () {
        eq(acc.calls.universe, 2, 'F5  the click issues exactly one more read');
        eq(m.c.universe && m.c.universe.state, 'OK', 'F6  and the universe is built on success');
        eq(m.c.retries.siteUniverse, 1, 'F7  counted as one universe retry');
      });
    });
  })

  .then(function () {
    /* F8 — an EMPTY site list was read successfully. It must not offer a retry. */
    capServerTrue();
    var acc = scriptedAccessor([universeEmpty()], []);
    var m = mount(acc);
    return m.c.loadUniverse().then(function (r) {
      ok(r.state !== 'HTTP_NOT_FOUND' && r.state !== 'SOURCE_TIMED_OUT',
        'F8  an empty list is not a transport failure');
      eq(retryBtn(m.dom), null,
        'F9  and gets NO retry button — it is a measurement, not a failure  [M4/empty-vs-refused]');
      eq(acc.calls.workspace, 0, 'F10 and reads no workspace');
    });
  })

  .then(function () {
    /* F11 — five clicks on the universe retry are one read. */
    capServerTrue();
    var resolveFirst = null;
    var acc = {
      calls: { universe: 0, workspace: 0 },
      isEnabled: ACC.isEnabled, capabilityState: ACC.capabilityState,
      capabilityFailure: ACC.capabilityFailure,
      getSiteUniverse: function () {
        acc.calls.universe++;
        if (acc.calls.universe === 1) return Promise.resolve(universeRefusal('SOURCE_TIMED_OUT'));
        return new Promise(function (res) { resolveFirst = function () { res(universeOk([SITE])); }; });
      },
      get: function () { acc.calls.workspace++; return Promise.resolve(null); }
    };
    var m = mount(acc);
    return m.c.loadUniverse().then(function () {
      retryBtn(m.dom).click();
      m.c.retryUniverse(); m.c.retryUniverse(); m.c.retryUniverse(); m.c.retryUniverse();
      eq(acc.calls.universe, 2, 'F11 one refusal plus five clicks = TWO reads, not six  [M1]');
      eq(m.c.retries.siteUniverse, 1, 'F12 and one counted retry');
      if (resolveFirst) resolveFirst();
      return new Promise(function (r) { setTimeout(r, 30); });
    });
  })

  .then(function () {
    /* F13 — a retry that fails again keeps the newest code and reads no workspace. */
    capServerTrue();
    var acc = scriptedAccessor(
      [universeRefusal('HTTP_NOT_FOUND'), universeRefusal('SOURCE_TIMED_OUT')], []);
    var m = mount(acc);
    return m.c.loadUniverse().then(function () {
      retryBtn(m.dom).click();
      return new Promise(function (r) { setTimeout(r, 30); }).then(function () {
        eq(m.c.state, 'SOURCE_TIMED_OUT', 'F13 the second refusal replaces the first  [M3]');
        eq(acc.calls.workspace, 0, 'F14 and still nothing downstream  [M10]');
        ok(!!retryBtn(m.dom), 'F15 the button survives a second failure');
      });
    });
  })

/* =============================================================================================
   §G — THE WORKSPACE. The retry is bound to the site selected when it is pressed.
   ============================================================================================= */
  .then(function () {
    section('§G — workspace: scope binding, generations and fail-closed');

    capServerTrue();
    var seen = [];
    var acc = {
      calls: { universe: 0, workspace: 0 },
      isEnabled: ACC.isEnabled, capabilityState: ACC.capabilityState,
      capabilityFailure: ACC.capabilityFailure,
      getSiteUniverse: function () { acc.calls.universe++; return Promise.resolve(universeOk([SITE])); },
      get: function (params) {
        acc.calls.workspace++;
        seen.push(params && params.scope ? params.scope : null);
        return Promise.resolve({ success: true,
          data: { normalizedRows: [], counts: null, refusals: [{ code: 'HTTP_NOT_FOUND' }],
            analysis_permitted: false, filterOptions: null },
          meta: { action: 'productPricing.workspace.get', refused: true,
            refusalCode: 'HTTP_NOT_FOUND' }, errors: [] });
      }
    };
    var m = mount(acc);
    return m.c.loadUniverse().then(function (r) {
      eq(acc.calls.workspace >= 1, true, 'G1  a single complete site reads the workspace');
      eq(m.c.requests.workspace >= 1, true, 'G2  and the page counted it');
      var before = acc.calls.workspace;
      var btn = retryBtn(m.dom);
      if (btn) {
        btn.click();
        return new Promise(function (r2) { setTimeout(r2, 40); }).then(function () {
          eq(acc.calls.workspace, before + 1, 'G3  the retry issues exactly one more read');
          eq(seen[seen.length - 1], { company: 'KM', country: 'US', marketplace: 'Shopify' },
            'G4  and sends the scope that is SELECTED, proven by what the accessor received  [M9]');
          eq(m.c.retries.workspace, 1, 'G5  counted as one workspace retry');
        });
      }
      ok(false, 'G3  a refused workspace should offer a retry');
      return null;
    });
  })

  .then(function () {
    /* G6 — an incomplete scope fails closed at ZERO external requests. */
    capServerTrue();
    var acc = scriptedAccessor([universeOk([SITE])], []);
    var m = mount(acc);
    return m.c.loadUniverse().then(function () {
      var before = acc.calls.workspace;
      m.c.narrowed = { scope: { company: 'KM', country: '', marketplace: '' }, complete: false };
      return Promise.resolve(m.c.retryWorkspace()).then(function (r) {
        eq(acc.calls.workspace, before,
          'G6  a retry with an incomplete scope sends ZERO external requests');
        eq(r && r.state, 'AWAITING_SITE_SELECTION',
          'G7  and says so rather than drawing an empty board  [M4]');
      });
    });
  })

  .then(function () {
    /* G8 — the existing token guard, not a second one. */
    var pageCode = decomment(SRC.page);
    /* G8 RE-AIMED. The first version asserted "exactly one place advances the generation", which was
       simply false about the file BEFORE this round: R7 added a second advance that WITHDRAWS an
       outstanding question when a person changes site mid-read, and `loadWorkspace` has always had
       its own. Two is the pre-existing shape. The question R10E actually has to answer is narrower
       and is the one M9 breaks: did the RETRY introduce a generation of its own? */
    var retryBodies = (pageCode.match(/C\.retry(Capability|Universe|Workspace) = function[\s\S]*?\s+\};/g) || []).join('');
    eq((retryBodies.match(/C\.token\s*\+\+/g) || []).length, 0,
      'G8a no retry advances the generation itself  [M9]');
    eq((pageCode.match(/C\.token\s*\+\+/g) || []).length, 2,
      'G8b the two pre-existing advances are unchanged — loadWorkspace, and R7 withdrawing a question');
    ok(/retryWorkspace[\s\S]{0,900}C\.loadWorkspace\(\)/.test(pageCode),
      'G9  and the retry goes THROUGH loadWorkspace, so it inherits that generation');
    eq((pageCode.match(/C\.(generation|gen2|retryToken)\b/g) || []).length, 0,
      'G10 no second generation was introduced  [M9]');
  })

/* =============================================================================================
   §H — ROUTE AWAY, RETURN, AND A RETRY THAT OUTLIVES ITS PAGE.
   ============================================================================================= */
  .then(function () {
    section('§H — unmount, return and the DOM a slow retry must not touch');

    capServerTrue();
    var acc = scriptedAccessor([universeOk([SITE])], []);
    var m = mount(acc);
    return m.c.loadUniverse().then(function () {
      var before = acc.calls.universe + acc.calls.workspace;
      m.c.alive = false;                       // what onUnmount does to the outgoing controller
      return Promise.resolve(m.c.retryUniverse()).then(function () {
        ok(true, 'H1  a retry on an unmounted controller resolves rather than throwing  [M12]');
        m.c.alive = true;
        eq(typeof m.c.restore, 'function', 'H2  and the controller can still be restored');
        ok(acc.calls.universe + acc.calls.workspace >= before, 'H3  accounting stayed monotonic');
      });
    });
  })

  .then(function () {
    var pageCode = decomment(SRC.page);
    ok(/prev\.alive = false/.test(pageCode),
      'H4  onUnmount marks the outgoing controller dead  [M12]');
    ok(/C\.alive = true/.test(pageCode),
      'H5  and restore() brings it back, so parking stays lossless');
    ok(/if \(!C\.alive[^)]*\) return/.test(pageCode),
      'H6  focusAfter refuses to touch the DOM of a dead controller  [M12]');
  })

/* =============================================================================================
   §J — WHAT THE ROUND DID NOT DO. The census that keeps the promises measurable.
   ============================================================================================= */
  .then(function () {
    section('§J — no new sockets, no new actions, no relaxed bounds');

    var pageDs = destring(SRC.page);
    var accDs = destring(SRC.accessor);
    var dbDs = destring(SRC.dbapi);
    var GLOBAL_FETCH = /(^|[^.\w$])fetch\s*\(/g;

    eq((pageDs.match(GLOBAL_FETCH) || []).length, 0, 'J1  the page opens no socket of its own  [M5]');
    eq((pageDs.match(/XMLHttpRequest/g) || []).length, 0, 'J2  and no XHR  [M5]');
    eq((accDs.match(GLOBAL_FETCH) || []).length, 0, 'J3  the accessor opens none either  [M5]');
    eq((pageDs.match(/system\.health/g) || []).length, 0,
      'J4  Product Strategy still dispatches ZERO system.health  [M6]');
    eq((accDs.match(/system\.health/g) || []).length, 0, 'J5  in the accessor too  [M6]');
    var shim = /api\s*\.\s*transport\s*\.\s*post\s*\(/g;
    eq((pageDs.match(shim) || []).length, 0, 'J6  no private POST shim caller in the page');
    eq((accDs.match(shim) || []).length, 0, 'J7  nor in the accessor');

    /* The two bounds this round promised not to move, read from the shipped files. */
    var readTimeout = /KM_READ_TIMEOUT_MS_\s*=\s*(\d+)/.exec(SRC.dbapi);
    eq(readTimeout && readTimeout[1], '45000', 'J8  the capability read budget is unchanged  [M8]');
    var tpTimeout = /deps\.readTimeoutMs\s*>\s*0.*?:\s*(\d+)/.exec(SRC.transport.replace(/\n/g, ' '));
    eq(tpTimeout && tpTimeout[1], '60000', 'J9  the business read budget is unchanged  [M8]');
    ok(/attemptN <= 2/.test(SRC.dbapi), 'J10 the bounded recovery is still at most two attempts  [M7]');
    ok(/Math\.max\(0, Math\.min\(1, opts\.maxRetries\)\)/.test(SRC.transport),
      'J11 and the shared transport still caps retries at one  [M7]');

    /* The retry must reuse the bootstrap, not re-implement it. */
    var r10e = decomment(RETRY_BLOCK || '');
    ok(/_kmApplyClientCapabilities_\(\)/.test(r10e),
      'J12 the retry CALLS the existing bootstrap rather than duplicating it');
    eq((r10e.match(/_kmGapRead_|fetch\s*\(|XMLHttpRequest/g) || []).length, 0,
      'J13 and issues nothing itself  [M5]');
    eq((r10e.match(/bootArbiter|declare\s*\(/g) || []).length, 0,
      'J14 it neither re-declares nor resets the boot arbiter');
  })

  .then(function () {
    /* J15-J18 — the retryable table is a real gate, not decoration. */
    eq(PAGE.isRetryableCode('HTTP_NOT_FOUND'), true, 'J15 HTTP_NOT_FOUND is retryable');
    eq(PAGE.isRetryableCode('SOURCE_TIMED_OUT'), true, 'J16 SOURCE_TIMED_OUT is retryable');
    eq(PAGE.isRetryableCode('NOT_AUTHORIZED'), false, 'J17 NOT_AUTHORIZED is NOT  [M11]');
    eq(PAGE.isRetryableCode('FEATURE_DISABLED'), false, 'J18 FEATURE_DISABLED is NOT  [M11]');
    eq(PAGE.isRetryableCode('SOURCE_EMPTY'), false, 'J19 and neither is an empty-but-read list  [M11]');
    eq(PAGE.isRetryableCode('SCHEMA_CONTRACT_MISMATCH'), false,
      'J20 nor a contract mismatch, which an identical request cannot change');

    /* The control has styling, which the four psb-state classes historically did not. */
    ok(/\.psb-state__retry\s*\{/.test(SRC.css), 'J21 the retry control is styled');
    ok(/\.psb-state__retry:disabled/.test(SRC.css), 'J22 including a visible disabled state');
    ok(/\.psb-state__retry:focus-visible/.test(SRC.css), 'J23 and a focus ring for the keyboard');

    /* Cache identity, measured with the repo's own definitions. */
    var RO = require(path.join(__dirname, '_release-order.js'));
    eq(RO.staleAppTokenRefs(SRC.index).length, 0, 'J24 no asset was left behind on an older token');
    eq(RO.misplacedIndexTokens(SRC.index).length, 0, 'J25 and no token sits on the wrong family');
    ok(RO.appTokenRefCount(SRC.index) > 0, 'J26 the co-deployed set carries the current token');
  })

/* =============================================================================================
   §M — THE MUTANTS. Each one is a plausible way to get this wrong, and each must be caught.
   ============================================================================================= */
  .then(function () {
    section('§M — mutants: twelve ways to break this, each caught by a named assertion');

    function mutate(label, src, from, to, probe) {
      if (src.indexOf(from) < 0) {
        mutSurvived++;
        console.error('  FAIL ' + label + ' — PROBE ERROR: anchor not found');
        return;
      }
      var mutated = src.replace(from, to);
      var caught = false;
      try { caught = probe(mutated) === false; } catch (e) { caught = true; }
      if (caught) { mutCaught++; console.log('  ok   ' + label + ' (caught)'); }
      else { mutSurvived++; console.error('  FAIL ' + label + ' — MUTANT SURVIVED'); }
    }

    /* M1 — remove the capability single-flight. Caught by A7/A10/D16. */
    mutate('M1  the shared single-flight latch is removed', RETRY_BLOCK,
      'if (_kmCapRetryInFlight_) { return _kmCapRetryInFlight_; }', '',
      function (m) {
        var issued = 0;
        var sandbox = { window: { KM: { DB: {} } }, Promise: Promise, console: console };
        sandbox._kmApplyClientCapabilities_ = function () {
          issued++; return new Promise(function () {});
        };
        vm.createContext(sandbox);
        vm.runInContext(m, sandbox);
        sandbox.window.KM.DB.retryClientCapabilities();
        sandbox.window.KM.DB.retryClientCapabilities();
        sandbox.window.KM.DB.retryClientCapabilities();
        return issued === 1;                       // the assertion A7 makes
      });

    /* M2 — the latch is replaced by a time window, so a slow read is re-issued. Caught by A13/B1. */
    mutate('M2  the latch becomes a debounce window', RETRY_BLOCK,
      'if (_kmCapRetryInFlight_) { return _kmCapRetryInFlight_; }',
      'if (_kmCapRetryInFlight_ && (Date.now() - 0) < 500) { return _kmCapRetryInFlight_; }',
      function (m) { return (decomment(m).match(/Date\.now\(\)\s*-/g) || []).length === 0; });

    /* M3 — the classified code is replaced by a generic sentence. Caught by C*d / D11 / F13. */
    mutate('M3  the refusal code is replaced by a generic message', SRC.page,
      "[{ code: capFail,", "[{ code: 'ERROR',",
      function (m) { return /\[\{ code: capFail,/.test(m); });

    /* M4 — a failed retry clears the refusals, drawing an empty board. Caught by F9/G7.
       RE-AIMED once: the first anchor carried a trailing comma from a four-argument call that no
       longer exists — the retry descriptor moved onto `snap.ux` so R8's K5 mutant would keep
       matching the teardown lines verbatim. The question is unchanged. */
    mutate('M4  a failed retry empties the refusal list', SRC.page,
      'return show(snap.state, snap.ux, snap.refusals);',
      'return show(snap.state, snap.ux, []);',
      function (m) { return /show\(snap\.state, snap\.ux, snap\.refusals\);/.test(m); });

    /* M5 — the retry opens its own socket. Caught by J1/J13. */
    mutate('M5  the retry opens a direct socket', RETRY_BLOCK,
      'p = Promise.resolve(_kmApplyClientCapabilities_())',
      'p = fetch(String(1))',
      function (m) { return /_kmApplyClientCapabilities_\(\)/.test(decomment(m)); });

    /* M6 — the capability retry is pointed back at system.health. Caught by J4/J5/J12. */
    mutate('M6  the retry is re-pointed at system.health', RETRY_BLOCK,
      '_kmApplyClientCapabilities_()', "_kmGapRead_('system.health', {})",
      function (m) {
        var d = destring(decomment(m));
        return (d.match(/system\.health/g) || []).length === 0
          && /_kmApplyClientCapabilities_\(\)/.test(d);
      });

    /* M7 — the bounded recovery is raised. Caught by J10. */
    mutate('M7  the bounded recovery ceiling is raised', SRC.dbapi,
      'attemptN <= 2', 'attemptN <= 4',
      function (m) { return /attemptN <= 2/.test(m); });

    /* M8 — the read budget is extended. Caught by J8. */
    mutate('M8  the capability read budget is extended', SRC.dbapi,
      'KM_READ_TIMEOUT_MS_ = 45000', 'KM_READ_TIMEOUT_MS_ = 120000',
      function (m) { return /KM_READ_TIMEOUT_MS_\s*=\s*45000/.test(m); });

    /* M9 — the workspace retry gets its own generation, so a stale answer can win. Caught by G8/G10. */
    mutate('M9  the retry introduces a second generation', SRC.page,
      'C.retries.workspace++;', 'C.retryToken = (C.retryToken || 0) + 1; C.retries.workspace++;',
      function (m) {
        return (decomment(m).match(/C\.(generation|gen2|retryToken)\b/g) || []).length === 0;
      });

    /* M10 — the workspace is read before the capability settles. Caught by D9/F3/F14. */
    mutate('M10 the universe is read before the capability succeeds', SRC.page,
      'if (!capabilityOk()) {', 'if (false) {',
      function (m) { return /if \(!capabilityOk\(\)\) \{/.test(m); });

    /* M11 — a button is offered under an explicit server false. Caught by C7b/J17-J19. */
    mutate('M11 FEATURE_DISABLED is offered a transport retry', SRC.page,
      "P.RETRYABLE_CODES = ['SOURCE_TIMED_OUT', 'HTTP_NOT_FOUND', 'SOURCE_NOT_CONNECTED',\n    'RESPONSE_NOT_READABLE', 'BROWSER_OFFLINE'];",
      "P.RETRYABLE_CODES = ['SOURCE_TIMED_OUT', 'HTTP_NOT_FOUND', 'SOURCE_NOT_CONNECTED',\n    'RESPONSE_NOT_READABLE', 'BROWSER_OFFLINE', 'FEATURE_DISABLED', 'NOT_AUTHORIZED'];",
      function (m) {
        var got = /P\.RETRYABLE_CODES = \[([\s\S]*?)\];/.exec(m);
        return !!got && got[1].indexOf('FEATURE_DISABLED') < 0 && got[1].indexOf('NOT_AUTHORIZED') < 0;
      });

    /* M12 — the liveness guard is removed, so a slow retry writes into an unmounted page. H4/H6. */
    mutate('M12 the unmounted-controller guard is removed', SRC.page,
      'if (prev) { prev.alive = false; }', '',
      function (m) { return /prev\.alive = false/.test(m); });
  })

/* ============================================================================================= */
  .then(function () {
    console.log('\n----------------------------------------');
    console.log('P1-B8D-R10E USER-TRIGGERED RECOVERY — passed ' + pass + '  failed ' + fail
      + '  |  mutants caught ' + mutCaught + '  survived ' + mutSurvived);
    if (fail > 0 || mutSurvived > 0) process.exitCode = 1;
    REACHED_THE_END = true;
  })
  .catch(function (e) {
    console.error('SUITE ERROR ' + (e && e.stack ? e.stack : e));
    process.exitCode = 1;
  });
