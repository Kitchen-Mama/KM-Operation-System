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
   §U2 — THE SETTLEMENT ORDER OF THE UNIVERSE RETRY.

   THIS SECTION EXISTS BECAUSE THE SUITE ABOVE PASSED WHILE PRODUCTION WAS BROKEN. F15 asked only
   whether the button SURVIVED a second failure; it did - disabled, aria-busy="true", labelled
   "Retrying...", permanently, about a read that had already finished failing. A live gate found it
   and a unit suite did not, because "is it still there" is not "can it still be used".

   `retryUniverse` cleared its latch in the continuation that ran AFTER `loadUniverseResolved` had
   already drawn the refusal, and that render reads the latch - so the settled box was drawn from a
   pending promise. The fix clears the latch first and then redraws the same box through the same
   renderer, and the assertions below pin BOTH ends: a control that lies in the other direction
   (enabled while the request is open) would be just as wrong.
   ============================================================================================= */

  .then(function () {
    section('SU2 - the universe retry settles before it is redrawn');

    capServerTrue();
    var releaseSecond = null;
    var acc = {
      calls: { universe: 0, workspace: 0 },
      isEnabled: ACC.isEnabled, capabilityState: ACC.capabilityState,
      capabilityFailure: ACC.capabilityFailure,
      getSiteUniverse: function () {
        acc.calls.universe++;
        if (acc.calls.universe === 1) return Promise.resolve(universeRefusal('HTTP_NOT_FOUND'));
        return new Promise(function (res) { releaseSecond = res; });
      },
      get: function () { acc.calls.workspace++; return Promise.resolve(null); }
    };
    var m = mount(acc);
    return m.c.loadUniverse().then(function () {
      retryBtn(m.dom).click();
      return new Promise(function (r) { setTimeout(r, 20); }).then(function () {
        /* ---- U2a - DURING FLIGHT the control must say so, truthfully. ---- */
        var busy = retryBtn(m.dom);
        ok(!!busy, 'U2a1 the control is still on screen while its own read is open');
        eq(busy.disabled, true, 'U2a2 disabled while the retry is in flight  [MF2]');
        eq(busy.getAttribute('aria-busy'), 'true', 'U2a3 and aria-busy for a screen reader  [MF2]');
        ok(/Retrying/.test(String(busy.textContent || '')), 'U2a4 labelled Retrying  [MF2]');
        ok(m.c.universeRetryInFlight !== null, 'U2a5 and the latch is genuinely held');
        var before = acc.calls.universe;
        m.c.retryUniverse();
        eq(acc.calls.universe, before, 'U2a6 a second activation while busy issues ZERO more reads');
        eq(m.c.retries.siteUniverse, 1, 'U2a7 and counts one logical retry, not two');

        /* ---- U2b - SETTLED FAILURE: the control must come back. ---- */
        releaseSecond(universeRefusal('SOURCE_TIMED_OUT'));
        return new Promise(function (r2) { setTimeout(r2, 30); }).then(function () {
          var reads = acc.calls.universe;
          eq(m.c.universeRetryInFlight, null, 'U2b1 the latch is cleared once the retry settles');
          eq(m.c.state, 'SOURCE_TIMED_OUT', 'U2b2 the newest precise code is preserved  [M3]');
          var back = retryBtn(m.dom);
          ok(!!back, 'U2b3 the control is still rendered');
          eq(back.disabled, false, 'U2b4 and ENABLED again - this is the R10E-F1 defect  [MF1]');
          eq(back.getAttribute('aria-busy'), 'false', 'U2b5 aria-busy is cleared  [MF1]');
          ok(!/Retrying/.test(String(back.textContent || '')),
            'U2b6 and it no longer says Retrying  [MF1]');
          ok(m.dom.document.activeElement === back, 'U2b7 focus returned to the button');
          eq(acc.calls.universe, reads, 'U2b8 the redraw read NOTHING - request delta 0');
          eq(acc.calls.workspace, 0, 'U2b9 and no workspace read followed');
          return new Promise(function (r3) { setTimeout(r3, 40); }).then(function () {
            eq(acc.calls.universe, reads, 'U2b10 and still nothing a moment later - no auto-retry');
          });
        });
      });
    });
  })

  .then(function () {
    /* ---- U2c - SETTLED SUCCESS: the refusal goes away, and nothing is read twice. ---- */
    capServerTrue();
    var SITE_B = { company: 'KM', country: 'JP', marketplace: 'Amazon',
      membership_row_count: 3, active_count: 3, phasing_out_count: 0, inactive_count: 0,
      discontinued_count: 0, unknown_status_count: 0, blank_id_count: 0, refusal_reasons: [],
      default_status_row_count: 0, selectable: true, selectable_with_inactive: true,
      site_key: 'KM|JP|Amazon' };
    var acc = scriptedAccessor(
      [universeRefusal('HTTP_NOT_FOUND'), universeOk([SITE, SITE_B])], []);
    var m = mount(acc);
    return m.c.loadUniverse().then(function () {
      retryBtn(m.dom).click();
      return new Promise(function (r) { setTimeout(r, 30); }).then(function () {
        eq(m.c.universeRetryInFlight, null, 'U2c1 the latch is cleared on success too');
        eq(m.c.universe && m.c.universe.state, 'OK', 'U2c2 the universe is built');
        ok(retryBtn(m.dom) === null, 'U2c3 and the control is gone - nothing left to retry');
        eq(acc.calls.universe, 2, 'U2c4 exactly two reads: the first, and the one asked for');
        eq(acc.calls.workspace, 0, 'U2c5 the workspace stays blocked until a real selection');
      });
    });
  })

  .then(function () {
    /* ---- U2d - UNMOUNTED DURING SETTLEMENT: a slow retry must not touch a dead page. ---- */
    capServerTrue();
    var release = null;
    var acc = {
      calls: { universe: 0, workspace: 0 },
      isEnabled: ACC.isEnabled, capabilityState: ACC.capabilityState,
      capabilityFailure: ACC.capabilityFailure,
      getSiteUniverse: function () {
        acc.calls.universe++;
        if (acc.calls.universe === 1) return Promise.resolve(universeRefusal('HTTP_NOT_FOUND'));
        return new Promise(function (res) { release = res; });
      },
      get: function () { acc.calls.workspace++; return Promise.resolve(null); }
    };
    var m = mount(acc);
    return m.c.loadUniverse().then(function () {
      retryBtn(m.dom).click();
      return new Promise(function (r) { setTimeout(r, 20); }).then(function () {
        m.c.alive = false;                                  // the page went away mid-flight
        var readsAtUnmount = acc.calls.universe;
        var threw = false;
        try { release(universeRefusal('SOURCE_TIMED_OUT')); } catch (e) { threw = true; }
        return new Promise(function (r2) { setTimeout(r2, 30); }).then(function () {
          ok(!threw, 'U2d1 settling onto an unmounted controller does not throw');
          eq(m.c.universeRetryInFlight, null, 'U2d2 the latch is released even when nobody is home');
          eq(acc.calls.universe, readsAtUnmount, 'U2d3 and no request followed the unmount');
          m.c.alive = true;
          eq(acc.calls.universe, readsAtUnmount, 'U2d4 route return re-reads nothing by itself');
          eq(acc.calls.workspace, 0, 'U2d5 and reads no workspace');
        });
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

/* =============================================================================================
   §MF — THE TWO MUTANTS FOR THE SETTLEMENT ORDER, CAUGHT BY BEHAVIOUR RATHER THAN BY REGEX.

   Every mutant above this point is checked by reading the mutated source. That was enough for the
   questions they ask, and it was NOT enough for this one: the stuck-control defect lived in an
   ordering between a latch write and a render, and no amount of source matching distinguishes the
   broken order from the fixed one. So these two MOUNT the mutated page and drive it, and the probe
   returns the exact value the paired assertion checks.
   ============================================================================================= */
  .then(function () {
    section('SMF - settlement-order mutants, mounted and driven');

    /* The page is a UMD module, so a mutated copy can be loaded and mounted like the real one. */
    function pageFromSource(src) {
      var sandbox = { module: { exports: {} }, console: console, Promise: Promise,
        setTimeout: setTimeout, clearTimeout: clearTimeout };
      sandbox.globalThis = sandbox;
      sandbox.exports = sandbox.module.exports;
      vm.createContext(sandbox);
      vm.runInContext(src, sandbox, { filename: 'psb-mutant.js' });
      return sandbox.module.exports;
    }
    function mountFrom(P2, accessor) {
      var dom = H.makeDom(partialSkeleton);
      return { dom: dom, c: P2.create({ document: dom.document, accessor: accessor,
        siteUniverse: UNI, liveAdapter: LIVE, board: null }) };
    }
    function deferredUniverseAccessor() {
      var acc = {
        calls: { universe: 0, workspace: 0 }, release: null,
        isEnabled: ACC.isEnabled, capabilityState: ACC.capabilityState,
        capabilityFailure: ACC.capabilityFailure,
        getSiteUniverse: function () {
          acc.calls.universe++;
          if (acc.calls.universe === 1) return Promise.resolve(universeRefusal('HTTP_NOT_FOUND'));
          return new Promise(function (res) { acc.release = res; });
        },
        get: function () { acc.calls.workspace++; return Promise.resolve(null); }
      };
      return acc;
    }
    function mutateAsync(label, from, to, probe) {
      if (SRC.page.indexOf(from) < 0) {
        mutSurvived++;
        console.error('  FAIL ' + label + ' - PROBE ERROR: anchor not found');
        return Promise.resolve();
      }
      return Promise.resolve()
        .then(function () { return probe(SRC.page.replace(from, to)); })
        .then(function (v) { return v === false; }, function () { return true; })
        .then(function (caught) {
          if (caught) { mutCaught++; console.log('  ok   ' + label + ' (caught)'); }
          else { mutSurvived++; console.error('  FAIL ' + label + ' - MUTANT SURVIVED'); }
        });
    }

    /* MF1 - the settlement no longer redraws the box after clearing the latch, so the control is
       left exactly as the read drew it: disabled and busy forever. This is the shipped defect. */
    return mutateAsync('MF1 the settled retry never redraws the control',
      'if (C.universe && C.universe.state !== \'OK\') { renderUniverseRefusal(C.universe); }', '',
      function (src) {
        capServerTrue();
        var acc = deferredUniverseAccessor();
        var m = mountFrom(pageFromSource(src), acc);
        return m.c.loadUniverse().then(function () {
          retryBtn(m.dom).click();
          return new Promise(function (r) { setTimeout(r, 20); }).then(function () {
            acc.release(universeRefusal('SOURCE_TIMED_OUT'));
            return new Promise(function (r2) { setTimeout(r2, 30); }).then(function () {
              var b = retryBtn(m.dom);
              return !!b && b.disabled === false;      // exactly what U2b4 asserts
            });
          });
        });
      })

    /* MF2 - the control stops being kept while its own read is open, so nothing on screen says a
       retry is running. The UI lies in the OTHER direction from MF1.

       RE-AIMED, AND THE REASON IS WORTH KEEPING. It was first pointed at the refusal render's
       `!!C.universeRetryInFlight`, on the assumption that this was the expression a person sees
       while the retry is in flight. It is not: during the read the visible box is the LOADING one,
       and the refusal render only runs after the read has settled -- so hard-coding that particular
       argument to false changed nothing U2a could observe, and the mutant survived while the suite
       was otherwise green. The expression that actually governs the in-flight control is the gate
       on the loading render, and that is what is mutated now. The refusal render's truthful read is
       not left unpinned: MF1 depends on it, because the stuck button it produces IS that expression
       evaluating true. */
      .then(function () {
        return mutateAsync('MF2 the control is dropped while its own read is open',
          'C.universeRetryInFlight ? busyAction(function () { C.retryUniverse(); }) : null);',
          'null);',
          function (src) {
            capServerTrue();
            var acc = deferredUniverseAccessor();
            var m = mountFrom(pageFromSource(src), acc);
            return m.c.loadUniverse().then(function () {
              retryBtn(m.dom).click();
              return new Promise(function (r) { setTimeout(r, 20); }).then(function () {
                var b = retryBtn(m.dom);
                return !!b && b.disabled === true;     // exactly what U2a2 asserts
              });
            });
          });
      });
  })

/* =============================================================================================
   §L — DOM OWNERSHIP AFTER UNMOUNT (P1-B8D-R10E-F2).

   MEASURED ON DEPLOYED F1 BYTES. A controlled gate held a universe retry open, routed away, and
   watched the board for 140 seconds: at the read's own 60-second budget the settlement wrote a
   disabled, aria-busy "Retrying..." control into a section that never became visible again, and
   left it there. 0 requests, 0 throws -- and a DOM mutation into a page the controller no longer
   owned. `C.alive` already existed and already meant exactly this; the three RETRY continuations
   honoured it and the two READ continuations did not.

   The unmount is simulated by setting `alive` false, which is what §H already does and what H4
   pins `onUnmount` to actually do -- so the simulation cannot drift away from the lifecycle.
   ============================================================================================= */
  .then(function () {
    section('SL - a settled read does not write into a page it no longer owns');

    /* A SERIALISER THE TEST DOM ACTUALLY SUPPORTS. The first version of this section compared
       `innerHTML`, which this lightweight DOM does not implement -- every snapshot was the string
       "undefined", so every "unchanged" assertion compared undefined to undefined and passed no
       matter what the page did. The fake supports tagName, attributes, textContent and childNodes,
       so the tree is walked and written out from those. */
    function serialize(n) {
      if (!n) return '';
      if (n.nodeType === 3 || (!n.tagName && typeof n.textContent === 'string')) {
        return String(n.textContent || '');
      }
      var out = '<' + String(n.tagName || '?').toLowerCase();
      ['data-cy', 'class', 'id', 'aria-busy', 'aria-live', 'disabled', 'type'].forEach(function (a) {
        var v = (n.getAttribute && n.getAttribute(a));
        if (v !== null && v !== undefined && v !== '') out += ' ' + a + '="' + v + '"';
      });
      if (n.disabled === true) out += ' [disabled]';
      out += '>';
      (n.childNodes || []).forEach(function (k) { out += serialize(k); });
      return out + '</' + String(n.tagName || '?').toLowerCase() + '>';
    }
    /* THE BOARD HOSTS ARE PART OF THE PAGE'S DOM TOO, and they are what `clearBoard()` empties --
       so a guard that runs one line too late is invisible unless they are in the snapshot. That is
       exactly the mutant LM3 makes, and with only the two state hosts here it survived. */
    function hostSnapshot(doc) {
      var out = serialize(doc.getElementById('psb-state-host'))
        + '||' + serialize(doc.getElementById('psb-site-host'))
        + '||' + serialize(doc.getElementById('psb-filters'));
      ['nav', 'crumbs', 'banner', 'scope', 'view'].forEach(function (id) {
        out += '||' + serialize(doc.getElementById(id));
      });
      return out;
    }
    function domOf(m) { return hostSnapshot(m.dom.document); }
    function deferredUni(firstRefusal) {
      var acc = {
        calls: { universe: 0, workspace: 0 }, release: null,
        isEnabled: ACC.isEnabled, capabilityState: ACC.capabilityState,
        capabilityFailure: ACC.capabilityFailure,
        getSiteUniverse: function () {
          acc.calls.universe++;
          if (acc.calls.universe === 1) return Promise.resolve(universeRefusal(firstRefusal || 'HTTP_NOT_FOUND'));
          return new Promise(function (res) { acc.release = res; });
        },
        get: function () { acc.calls.workspace++; return Promise.resolve(wsRefusal()); }
      };
      return acc;
    }
    function wsRefusal() {
      return { success: true,
        data: { normalizedRows: [], counts: null, refusals: [{ code: 'HTTP_NOT_FOUND' }],
          analysis_permitted: false, filterOptions: null },
        meta: { action: 'productPricing.workspace.get', refused: true,
          refusalCode: 'HTTP_NOT_FOUND' }, errors: [] };
    }
    /* A GENUINELY ANALYSABLE ANSWER. The first cut of this helper sent zero rows, which the
       adapter correctly reads as SOURCE_EMPTY -- `may_analyse` false, no board, nothing to park --
       so L5 and L6 were failing on the fixture rather than on the page. The row shape is the one
       the pricing contract validates; one row is enough to make the state OK. */
    function wsRow() {
      return {
        identity: 'MSKU:L-1', marketplace_sku_id: 'L-1', master_sku: 'CO1000-R',
        site_sku: 'B01', product_name: 'Product 1',
        category: 'Openers', series: 'Classic', variant_group: 'Classic', variant_name: null,
        company: SITE.company, country: SITE.country, marketplace: SITE.marketplace,
        marketplace_sku_status: 'active', lifecycle: 'active', currency: 'USD',
        regular_price: 29.99, minimum_price: 24.99, msrp: 34.99, product_image: null,
        regional: { regional_detail_id: 'RGD-L-1', site_sku: 'B01',
          marketplace_product_id: 'MPL-1', product_url: null,
          packaging_regulation: null, language: 'en' },
        campaigns: [], analysable: true, source_status: [], missing_reasons: [], findings: [],
        provenance: { membership: 'marketplace_skus (company + country + marketplace)' }
      };
    }
    function wsOk() {
      var rows = [wsRow()];
      return { success: true,
        data: { normalizedRows: rows, refusals: [], findings: [], analysis_permitted: true,
          counts: { siteSkuCount: rows.length },
          filterOptions: { categories: [{ value: 'Openers' }], series: [{ value: 'Classic' }] },
          pagination: null, scope: null, sourceState: 'READY',
          schema: { contract_version: 2, read_at: '2026-09-11T02:14:07.000Z',
            read_at_is: 'WHEN_THE_SERVER_READ_THE_TABLES', source_modified_at: null,
            build: 'F2-TEST' } },
        meta: { action: 'productPricing.workspace.get', build: 'test' }, errors: [] };
    }

    /* ---- L1: a FAILED universe settlement after unmount ---- */
    capServerTrue();
    var accL = deferredUni();
    var mL = mount(accL);
    var beforeL, readsL, wsL, btnAtUnmountL;

    return mL.c.loadUniverse()
      .then(function () {
        retryBtn(mL.dom).click();
        ok(!!mL.c.universeRetryInFlight, 'L1a the latch is held while the retry is open');
        mL.c.alive = false;                       // what onUnmount does to the outgoing controller
        beforeL = domOf(mL);
        btnAtUnmountL = retryBtn(mL.dom);
        readsL = accL.calls.universe;
        wsL = accL.calls.workspace;
        accL.release(universeRefusal('SOURCE_TIMED_OUT'));
        return new Promise(function (r) { setTimeout(r, 40); });
      })
      .then(function () {
        eq(domOf(mL), beforeL,
          'L1b a FAILED settlement after unmount leaves the hosts byte-for-byte unchanged');
        /* NOT "the button is gone" -- it was on screen when the page was unmounted, because
           the retry had just been pressed, and leaving it exactly as it was IS the contract.
           What must not happen is a REDRAW, and a redraw builds a new element: node identity
           catches that where equal markup would not. `eq` cannot be used on a DOM node --
           it stringifies, and a node is circular. */
        ok(retryBtn(mL.dom) === btnAtUnmountL,
          'L1c the control is the very node left at unmount, not a redrawn one');
        eq(mL.c.universeRetryInFlight, null, 'L1d the latch is still released');
        eq(accL.calls.universe - readsL, 0, 'L1e no request followed the unmount');
        eq(accL.calls.workspace - wsL, 0, 'L1f and no workspace read either');
      })

      /* ---- L2: a SUCCESSFUL settlement -- the case a show()-only guard would have missed ---- */
      .then(function () {
        capServerTrue();
        var accS = deferredUni();
        var mS = mount(accS);
        return mS.c.loadUniverse().then(function () {
          retryBtn(mS.dom).click();
          mS.c.alive = false;
          var before = domOf(mS);
          var reads = accS.calls.universe;
          accS.release(universeOk([SITE]));                 // this retry SUCCEEDS
          return new Promise(function (r) { setTimeout(r, 40); }).then(function () {
            eq(domOf(mS), before,
              'L2a a SUCCESSFUL settlement after unmount changes nothing in the hosts');
            ok(mS.dom.document.getElementById('psbSiteCompany') === null,
              'L2b the chooser is not rebuilt into a page nobody is on');
            eq(accS.calls.workspace, 0,
              'L2c and the resolved scope issues NO workspace read  [this guard stops a REQUEST]');
            eq(accS.calls.universe - reads, 0, 'L2d and no further universe read');
            eq(mS.c.universeRetryInFlight, null, 'L2e the latch is released either way');
          });
        });
      })

      /* ---- L3: the capability path ---- */
      .then(function () {
        var release = null, calls = 0;
        global.KM.DB.retryClientCapabilities = function () {
          calls++;
          return new Promise(function (res) { release = res; });
        };
        capFailed('SOURCE_TIMED_OUT');
        var accC = {
          calls: { universe: 0, workspace: 0 },
          isEnabled: ACC.isEnabled, capabilityState: ACC.capabilityState,
          capabilityFailure: ACC.capabilityFailure,
          getSiteUniverse: function () { accC.calls.universe++; return Promise.resolve(universeOk([SITE])); },
          get: function () { accC.calls.workspace++; return Promise.resolve(wsRefusal()); }
        };
        var mC = mount(accC);
        return mC.c.loadUniverse().then(function () {
          var b = retryBtn(mC.dom);
          ok(!!b, 'L3a a capability refusal offers a control');
          b.click();
          eq(calls, 1, 'L3b the click reached the shared bootstrap');
          mC.c.alive = false;
          var before = domOf(mC);
          capServerTrue();                         // the shared mirror moves under its OWN owner
          release({ ok: true });
          return new Promise(function (r) { setTimeout(r, 40); }).then(function () {
            eq(domOf(mC), before,
              'L3c a capability settlement after unmount does not render into the page');
            eq(ACC.capabilityState(), 'SERVER_TRUE',
              'L3d while the shared mirror is still free to move under its own authority');
            eq(mC.c.capabilityRetrying, false, 'L3e and the capability latch is released');
          });
        });
      })

      /* ---- L4: the workspace path, whose success branch bypasses show() entirely ---- */
      .then(function () {
        capServerTrue();
        var released = null;
        var accW = {
          calls: { universe: 0, workspace: 0 },
          isEnabled: ACC.isEnabled, capabilityState: ACC.capabilityState,
          capabilityFailure: ACC.capabilityFailure,
          getSiteUniverse: function () { accW.calls.universe++; return Promise.resolve(universeOk([SITE])); },
          get: function () {
            accW.calls.workspace++;
            return new Promise(function (res) { released = res; });
          }
        };
        var boardStub = { mount: function () { return true; }, unmount: function () {},
          notices: function () { return []; } };
        var mW = mount(accW, boardStub);
        /* NOT AWAITED, DELIBERATELY. A single complete site auto-narrows, so `loadUniverse` runs
           straight into the workspace read -- and this scenario is precisely the one where that
           read is never answered until we say so. Awaiting the outer promise would therefore wait
           on the very request the test is holding open, and the suite would hang rather than fail. */
        mW.c.loadUniverse();
        return new Promise(function (r) { setTimeout(r, 30); }).then(function () {
          ok(accW.calls.workspace >= 1, 'L4a a workspace read is open');
          ok(typeof released === 'function', 'L4b and it is genuinely unresolved');
          mW.c.alive = false;
          var before = domOf(mW);
          released(wsOk());                        // it answers AFTER the page has gone
          return new Promise(function (r) { setTimeout(r, 40); }).then(function () {
            eq(domOf(mW), before,
              'L4c a workspace settlement after unmount writes no rows, refusal, loading or focus');
            eq(mW.c.inFlight, false, 'L4d the workspace latch is released');
            eq(mW.c.mounted, false, 'L4e and no board is mounted into the dead page');
          });
        });
      })

      /* ---- L5: THE GUARD MUST NOT EAT A LEGITIMATE RENDER. Without this, every assertion above
                 could be satisfied by a page that simply never draws anything. ---- */
      .then(function () {
        capServerTrue();
        var accF = {
          calls: { universe: 0, workspace: 0 },
          isEnabled: ACC.isEnabled, capabilityState: ACC.capabilityState,
          capabilityFailure: ACC.capabilityFailure,
          getSiteUniverse: function () { accF.calls.universe++; return Promise.resolve(universeOk([SITE])); },
          get: function () { accF.calls.workspace++; return Promise.resolve(wsOk()); }
        };
        var boardStub = { mount: function () { return true; }, unmount: function () {},
          notices: function () { return []; } };
        var mF = mount(accF, boardStub);
        ok(mF.c.alive === true, 'L5a a freshly created controller is alive');
        return mF.c.loadUniverse().then(function () {
          eq(accF.calls.universe, 1, 'L5b the universe is read normally on a live controller');
          ok(accF.calls.workspace >= 1, 'L5c and a resolved scope still reads the workspace');
          ok(String(domOf(mF)).indexOf('psb-state-host') >= 0 || String(domOf(mF)).length > 4,
             'L5d the hosts are present and serialise to real markup');
          ok(mF.c.mounted === true, 'L5e and the board mounts on a live controller');
        });
      })

      /* ---- L6: the route-return contract, BOTH branches. An always-0 or always-1 answer is
                 wrong; which is right depends on whether a usable snapshot exists. ---- */
      .then(function () {
        capServerTrue();
        var accR = {
          calls: { universe: 0, workspace: 0 },
          isEnabled: ACC.isEnabled, capabilityState: ACC.capabilityState,
          capabilityFailure: ACC.capabilityFailure,
          getSiteUniverse: function () { accR.calls.universe++; return Promise.resolve(universeRefusal('HTTP_NOT_FOUND')); },
          get: function () { accR.calls.workspace++; return Promise.resolve(wsOk()); }
        };
        var mR = mount(accR);
        return mR.c.loadUniverse().then(function () {
          ok(!mR.c.universe || mR.c.universe.state !== 'OK', 'L6a the universe is unresolved');
          mR.c.alive = false;
          eq(mR.c.restore(), false,
            'L6b an unresolved universe does not restore, so a return is a fresh mount');
          var before = accR.calls.universe;
          var m2 = mount(accR);                    // the fresh mount that a return performs
          return m2.c.loadUniverse().then(function () {
            eq(accR.calls.universe - before, 1,
              'L6c route return with no usable snapshot performs exactly ONE fresh universe read');
          });
        });
      })
      .then(function () {
        capServerTrue();
        var accV = {
          calls: { universe: 0, workspace: 0 },
          isEnabled: ACC.isEnabled, capabilityState: ACC.capabilityState,
          capabilityFailure: ACC.capabilityFailure,
          getSiteUniverse: function () { accV.calls.universe++; return Promise.resolve(universeOk([SITE])); },
          get: function () { accV.calls.workspace++; return Promise.resolve(wsOk()); }
        };
        var boardStub = { mount: function () { return true; }, unmount: function () {},
          notices: function () { return []; } };
        var mV = mount(accV, boardStub);
        return mV.c.loadUniverse().then(function () {
          var uBefore = accV.calls.universe, wBefore = accV.calls.workspace;
          ok(mV.c.mounted === true, 'L6d a complete site leaves a mounted board to park');
          mV.c.alive = false;                      // onUnmount
          eq(mV.c.restore(), true, 'L6e a controller holding a complete site restores');
          ok(mV.c.alive === true, 'L6f restore makes it live again, so the guard does not strand it');
          eq(accV.calls.universe - uBefore, 0,
            'L6g route return WITH a usable snapshot performs zero unnecessary rereads');
          eq(accV.calls.workspace - wBefore, 0, 'L6h and no workspace reread either');
          ok(String(domOf(mV)).length > 0, 'L6i and the restored page is drawn, not merely silent');
        });
      });
  })

/* =============================================================================================
   §LMF — THE OWNERSHIP MUTANTS, ALL DRIVEN RATHER THAN READ.

   No source regex separates a guard that runs before the first write from one that runs after it:
   both spellings contain the same characters. Each mutant here mounts the mutated page, drives it
   to the moment §L drives the real one to, and returns the exact value the paired assertion checks.
   ============================================================================================= */
  .then(function () {
    section('SLMF - ownership-guard mutants, mounted and driven');

    var SHOW_GUARD = "      if (!C.alive) {\n"
      + "        return { state: state, mounted: false, may_analyse: false, refusals: refusals || [] };\n"
      + "      }\n";
    var REFUSAL_GUARD = "      if (!C.alive) {\n"
      + "        return { state: u.state, mounted: false, may_analyse: false, refusals: u.refusals || [] };\n"
      + "      }\n";
    var READ_GUARD = "          if (!C.alive) {\n"
      + "            return { state: u.state, mounted: false, may_analyse: false, refusals: u.refusals || [] };\n"
      + "          }\n";

    /* The same analysable answer §L uses, so a mutant and its paired assertion see one fixture. */
    function readyWorkspace() {
      var row = {
        identity: 'MSKU:L-1', marketplace_sku_id: 'L-1', master_sku: 'CO1000-R',
        site_sku: 'B01', product_name: 'Product 1',
        category: 'Openers', series: 'Classic', variant_group: 'Classic', variant_name: null,
        company: SITE.company, country: SITE.country, marketplace: SITE.marketplace,
        marketplace_sku_status: 'active', lifecycle: 'active', currency: 'USD',
        regular_price: 29.99, minimum_price: 24.99, msrp: 34.99, product_image: null,
        regional: { regional_detail_id: 'RGD-L-1', site_sku: 'B01',
          marketplace_product_id: 'MPL-1', product_url: null,
          packaging_regulation: null, language: 'en' },
        campaigns: [], analysable: true, source_status: [], missing_reasons: [], findings: [],
        provenance: { membership: 'marketplace_skus (company + country + marketplace)' }
      };
      return { success: true,
        data: { normalizedRows: [row], refusals: [], findings: [], analysis_permitted: true,
          counts: { siteSkuCount: 1 },
          filterOptions: { categories: [{ value: 'Openers' }], series: [{ value: 'Classic' }] },
          pagination: null, scope: null, sourceState: 'READY',
          schema: { contract_version: 2, read_at: '2026-09-11T02:14:07.000Z',
            read_at_is: 'WHEN_THE_SERVER_READ_THE_TABLES', source_modified_at: null,
            build: 'F2-TEST' } },
        meta: { action: 'productPricing.workspace.get', build: 'test' }, errors: [] };
    }
    function pageFrom(src) {
      var sandbox = { module: { exports: {} }, console: console, Promise: Promise,
        setTimeout: setTimeout, clearTimeout: clearTimeout };
      sandbox.globalThis = sandbox;
      sandbox.exports = sandbox.module.exports;
      vm.createContext(sandbox);
      vm.runInContext(src, sandbox, { filename: 'psb-mutant-f2.js' });
      return sandbox.module.exports;
    }
    function mountF(P2, accessor, board) {
      var dom = H.makeDom(partialSkeleton);
      return { dom: dom, c: P2.create({ document: dom.document, accessor: accessor,
        siteUniverse: UNI, liveAdapter: LIVE, board: board || null }) };
    }
    /* A SERIALISER THE TEST DOM ACTUALLY SUPPORTS. The first version of this section compared
       `innerHTML`, which this lightweight DOM does not implement -- every snapshot was the string
       "undefined", so every "unchanged" assertion compared undefined to undefined and passed no
       matter what the page did. The fake supports tagName, attributes, textContent and childNodes,
       so the tree is walked and written out from those. */
    function serialize(n) {
      if (!n) return '';
      if (n.nodeType === 3 || (!n.tagName && typeof n.textContent === 'string')) {
        return String(n.textContent || '');
      }
      var out = '<' + String(n.tagName || '?').toLowerCase();
      ['data-cy', 'class', 'id', 'aria-busy', 'aria-live', 'disabled', 'type'].forEach(function (a) {
        var v = (n.getAttribute && n.getAttribute(a));
        if (v !== null && v !== undefined && v !== '') out += ' ' + a + '="' + v + '"';
      });
      if (n.disabled === true) out += ' [disabled]';
      out += '>';
      (n.childNodes || []).forEach(function (k) { out += serialize(k); });
      return out + '</' + String(n.tagName || '?').toLowerCase() + '>';
    }
    /* THE BOARD HOSTS ARE PART OF THE PAGE'S DOM TOO, and they are what `clearBoard()` empties --
       so a guard that runs one line too late is invisible unless they are in the snapshot. That is
       exactly the mutant LM3 makes, and with only the two state hosts here it survived. */
    function hostSnapshot(doc) {
      var out = serialize(doc.getElementById('psb-state-host'))
        + '||' + serialize(doc.getElementById('psb-site-host'))
        + '||' + serialize(doc.getElementById('psb-filters'));
      ['nav', 'crumbs', 'banner', 'scope', 'view'].forEach(function (id) {
        out += '||' + serialize(doc.getElementById(id));
      });
      return out;
    }
    function hostsOf(dom) { return hostSnapshot(dom.document); }
    function deferredAcc(wsAnswer) {
      var acc = {
        calls: { universe: 0, workspace: 0 }, release: null,
        isEnabled: ACC.isEnabled, capabilityState: ACC.capabilityState,
        capabilityFailure: ACC.capabilityFailure,
        getSiteUniverse: function () {
          acc.calls.universe++;
          if (acc.calls.universe === 1) return Promise.resolve(universeRefusal('HTTP_NOT_FOUND'));
          return new Promise(function (res) { acc.release = res; });
        },
        get: function () { acc.calls.workspace++; return Promise.resolve(wsAnswer); }
      };
      return acc;
    }
    function mutateAsync2(label, from, to, probe) {
      if (SRC.page.indexOf(from) < 0) {
        mutSurvived++;
        console.error('  FAIL ' + label + ' - PROBE ERROR: anchor not found');
        return Promise.resolve();
      }
      return Promise.resolve()
        .then(function () { return probe(SRC.page.replace(from, to)); })
        .then(function (v) { return v === false; }, function () { return true; })
        .then(function (caught) {
          if (caught) { mutCaught++; console.log('  ok   ' + label + ' (caught)'); }
          else { mutSurvived++; console.error('  FAIL ' + label + ' - MUTANT SURVIVED'); }
        });
    }
    /* THE GUARDS ARE DEFENCE IN DEPTH, SO A MUTANT MUST BE AIMED WHERE ITS TARGET STANDS ALONE.
       Removing the guard in `show()` changes nothing on the universe failure path, because the read
       continuation refuses before `show` is ever reached -- that redundancy is the design working,
       not a hole. `show()` IS the only guard on the CAPABILITY settlement, so that is where the
       show()-guard mutants are driven. L3c is the paired assertion. */
    function capabilityProbe(src) {
      var release = null;
      global.KM.DB.retryClientCapabilities = function () {
        return new Promise(function (res) { release = res; });
      };
      capFailed('SOURCE_TIMED_OUT');
      var acc = {
        calls: { universe: 0, workspace: 0 },
        isEnabled: ACC.isEnabled, capabilityState: ACC.capabilityState,
        capabilityFailure: ACC.capabilityFailure,
        getSiteUniverse: function () { acc.calls.universe++; return Promise.resolve(universeOk([SITE])); },
        get: function () { acc.calls.workspace++; return Promise.resolve(readyWorkspace()); }
      };
      var m = mountF(pageFrom(src), acc);
      return m.c.loadUniverse().then(function () {
        var b = retryBtn(m.dom);
        if (!b) return false;                            // no control: the probe never got started
        b.click();
        m.c.alive = false;
        var before = hostsOf(m.dom);
        capServerTrue();
        if (typeof release === 'function') release({ ok: true });
        return new Promise(function (r) { setTimeout(r, 40); }).then(function () {
          return hostsOf(m.dom) === before;              // exactly what L3c asserts
        });
      });
    }
    /* A CHOOSER IS ON SCREEN WHEN THE PAGE DIES. `renderUniverseRefusal` empties `siteHost`
       BEFORE it calls `show`, so that write is above `show`'s reach -- and it is only observable
       when there is a chooser there to lose. Returns whether the chooser survived. */
    function chooserProbe(src) {
      capServerTrue();
      var acc = {
        calls: { universe: 0, workspace: 0 }, release: null,
        isEnabled: ACC.isEnabled, capabilityState: ACC.capabilityState,
        capabilityFailure: ACC.capabilityFailure,
        getSiteUniverse: function () {
          acc.calls.universe++;
          if (acc.calls.universe === 1) return Promise.resolve(universeOk([SITE, SITE_B]));
          return new Promise(function (res) { acc.release = res; });
        },
        get: function () { acc.calls.workspace++; return Promise.resolve(readyWorkspace()); }
      };
      var m = mountF(pageFrom(src), acc);
      return m.c.loadUniverse().then(function () {
        if (!m.dom.document.getElementById('psbSiteCompany')) return false;
        m.c.loadUniverse();                       // a second read, which will fail
        return new Promise(function (r) { setTimeout(r, 20); }).then(function () {
          m.c.alive = false;
          acc.release(universeRefusal('SOURCE_TIMED_OUT'));
          return new Promise(function (r2) { setTimeout(r2, 40); }).then(function () {
            return !!m.dom.document.getElementById('psbSiteCompany');
          });
        });
      });
    }
    /* WHERE `show()`'s GUARD STANDS ALONE. On the universe failure path `renderUniverseRefusal`
       refuses first, so removing the central guard changes nothing there -- correctly. The
       WORKSPACE REFUSAL branch is deliberately left to fall through to `show`, so that is the path
       on which the central guard is the only thing holding the line, and the only path where a
       mutant against it means anything. L4c is the paired assertion. */
    function workspaceRefusalProbe(src) {
      capServerTrue();
      var released = null;
      var acc = {
        calls: { universe: 0, workspace: 0 },
        isEnabled: ACC.isEnabled, capabilityState: ACC.capabilityState,
        capabilityFailure: ACC.capabilityFailure,
        getSiteUniverse: function () { acc.calls.universe++; return Promise.resolve(universeOk([SITE])); },
        get: function () {
          acc.calls.workspace++;
          return new Promise(function (res) { released = res; });
        }
      };
      /* A BOARD THAT LEAVES SOMETHING BEHIND. `clearBoard()` empties `#view`, and a guard that
         runs after it would be undetectable against an empty one. */
      var doc0 = null;
      var board = {
        mount: function () {
          var v = doc0 && doc0.getElementById('view');
          if (v) { var n = doc0.createElement('div'); n.setAttribute('class', 'psb-board-output');
            v.appendChild(n); }
          return true;
        },
        unmount: function () {}, notices: function () { return []; }
      };
      var m = mountF(pageFrom(src), acc, board);
      doc0 = m.dom.document;
      m.c.loadUniverse();                         // not awaited: the workspace read is held open
      return new Promise(function (r) { setTimeout(r, 30); }).then(function () {
        if (typeof released !== 'function') return false;   // fixture never opened a read
        m.c.alive = false;
        var before = hostsOf(m.dom);
        released({ success: true,
          data: { normalizedRows: [], counts: null, refusals: [{ code: 'HTTP_NOT_FOUND' }],
            analysis_permitted: false, filterOptions: null },
          meta: { action: 'productPricing.workspace.get', refused: true,
            refusalCode: 'HTTP_NOT_FOUND' }, errors: [] });
        return new Promise(function (r2) { setTimeout(r2, 40); }).then(function () {
          return hostsOf(m.dom) === before;       // exactly what L4c asserts
        });
      });
    }
    /* Drive a FAILED settlement onto an unmounted controller; report whether the hosts survived.
       L1b is the paired assertion. */
    function failureProbe(src) {
      capServerTrue();
      var acc = deferredAcc(null);
      var m = mountF(pageFrom(src), acc);
      return m.c.loadUniverse().then(function () {
        retryBtn(m.dom).click();
        m.c.alive = false;
        var before = hostsOf(m.dom);
        acc.release(universeRefusal('SOURCE_TIMED_OUT'));
        return new Promise(function (r) { setTimeout(r, 40); }).then(function () {
          return hostsOf(m.dom) === before;               // exactly what L1b asserts
        });
      });
    }
    /* And a SUCCESSFUL one; L2a + L2c are the pair. */
    function successProbe(src) {
      capServerTrue();
      var acc = deferredAcc(readyWorkspace());
      var m = mountF(pageFrom(src), acc);
      return m.c.loadUniverse().then(function () {
        retryBtn(m.dom).click();
        m.c.alive = false;
        var before = hostsOf(m.dom);
        acc.release(universeOk([SITE]));
        return new Promise(function (r) { setTimeout(r, 40); }).then(function () {
          return hostsOf(m.dom) === before && acc.calls.workspace === 0;
        });
      });
    }

    return mutateAsync2('LM1 the show() ownership guard is removed', SHOW_GUARD, '', workspaceRefusalProbe)

      .then(function () {
        return mutateAsync2('LM2 the show() guard polarity is inverted',
          '      if (!C.alive) {\n        return { state: state, mounted: false',
          '      if (C.alive) {\n        return { state: state, mounted: false',
          failureProbe);
      })

      /* LM3 - the guard survives but moves BELOW the first DOM mutation, which is the ordering
         mistake this programme keeps finding. `clearBoard()` has already emptied the board hosts
         by the time it runs. The original guard is removed first, or it would mask the moved one. */
      .then(function () {
        /* "THE GUARD RUNS AFTER THE FIRST DOM MUTATION", aimed where that is observable.
           In `show()` it is NOT: the first mutation there is `clearBoard()`, and every read's own
           loading render clears the board WHILE STILL ALIVE -- so by the time any settlement lands
           the board hosts are already empty, and moving the guard past them changes nothing anyone
           can see. In `renderUniverseRefusal` the first mutation is the CHOOSER clear, which is
           still on screen when the settlement arrives. Same defect class, and measurable. */
        var CLEAR_CHOOSER = '      /* FAIL CLOSED: no list, no controls. */\n      if (siteHost) { while (siteHost.firstChild) siteHost.removeChild(siteHost.firstChild); }';
        return mutateAsync2('LM3 the ownership guard runs after the first DOM mutation',
          REFUSAL_GUARD + CLEAR_CHOOSER,
          CLEAR_CHOOSER + '\n' + REFUSAL_GUARD,
          chooserProbe);
      })

      /* LM4 - the FAILURE path bypasses its own guard, so the chooser is wiped out of a dead page
         even while show() refuses to draw. show()'s guard is removed too, or it would mask this. */
      .then(function () {
        /* WHAT THIS GUARD UNIQUELY PROTECTS IS THE CHOOSER. `renderUniverseRefusal` empties
           `siteHost` BEFORE it calls `show`, so `show`'s guard cannot save it -- but only when
           there is a chooser there to lose. The scenario therefore loads a HEALTHY universe first
           (chooser drawn), then fails a retry, then dies mid-flight. `show`'s guard is left in
           place: this mutant is about the one write that happens above it. */
        return mutateAsync2('LM4 a dead controller empties the chooser before show() can refuse',
          REFUSAL_GUARD, '', chooserProbe);
      })

      /* LM5 - the SUCCESS path bypasses its guard, so a universe arriving after the page is gone
         resolves a scope and asks for a workspace nobody is waiting for. */
      .then(function () {
        return mutateAsync2('LM5 the success path bypasses the ownership guard', READ_GUARD, '',
          successProbe);
      })

      /* LM6 / LM7 - the route-return contract broken in each direction, both driven through the
         real park/restore decision rather than through a source match. */
      .then(function () {
        return mutateAsync2('LM6 route return never reuses a valid snapshot (always rereads)',
          "      C.alive = true;\n      if (!C.universe || C.universe.state !== 'OK') return false;",
          '      C.alive = true;\n      return false;',
          function (src) {
            capServerTrue();
            var acc = {
              calls: { universe: 0, workspace: 0 },
              isEnabled: ACC.isEnabled, capabilityState: ACC.capabilityState,
              capabilityFailure: ACC.capabilityFailure,
              getSiteUniverse: function () { acc.calls.universe++; return Promise.resolve(universeOk([SITE])); },
              get: function () { acc.calls.workspace++; return Promise.resolve(readyWorkspace()); }
            };
            var board = { mount: function () { return true; }, unmount: function () {},
              notices: function () { return []; } };
            var m = mountF(pageFrom(src), acc, board);
            return m.c.loadUniverse().then(function () {
              m.c.alive = false;
              return m.c.restore() === true;               // exactly what L6e asserts
            });
          });
      })
      .then(function () {
        return mutateAsync2('LM7 route return reuses a snapshot it does not have',
          "      if (!C.universe || C.universe.state !== 'OK') return false;\n      if (!C.narrowed || !C.narrowed.complete) return false;\n      if (!C.adapter) return false;",
          '      if (false) return false;\n      if (false) return false;\n      if (false) return false;',
          function (src) {
            capServerTrue();
            var acc = {
              calls: { universe: 0, workspace: 0 },
              isEnabled: ACC.isEnabled, capabilityState: ACC.capabilityState,
              capabilityFailure: ACC.capabilityFailure,
              getSiteUniverse: function () { acc.calls.universe++; return Promise.resolve(universeRefusal('HTTP_NOT_FOUND')); },
              get: function () { acc.calls.workspace++; return Promise.resolve(null); }
            };
            /* A BOARD STUB, or `restore()` refuses because `board.mount` is missing -- which has
               nothing to do with the preconditions this mutant removes, and would have made it
               survive for the wrong reason. */
            var board = { mount: function () { return true; }, unmount: function () {},
              notices: function () { return []; } };
            var m = mountF(pageFrom(src), acc, board);
            return m.c.loadUniverse().then(function () {
              m.c.alive = false;
              return m.c.restore() === false;              // exactly what L6b asserts
            });
          });
      });
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
