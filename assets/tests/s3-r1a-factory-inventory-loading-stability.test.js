// Kitchen Mama Operation System — S3-R1 WORKSTREAM A
// FACTORY INVENTORY: A FAILED READ THAT RETRIED ITSELF FOREVER, BEHIND A TABLE THAT COULD NOT SAY SO
// Run: node assets/tests/s3-r1a-factory-inventory-loading-stability.test.js
//
// LOCAL / FAKE-ONLY. No network, no DB, no Apps Script, no browser. It runs the REAL
// assets/js/pages/factory-stock.js in a vm against a DOM shim and counts the requests the page actually
// issues, so every number below is an observation of the shipped module.
//
// THE INCIDENT. Factory Inventory loading was visibly unstable during a live demonstration on
// 2026-09-24. Two independent defects were found, and each one hid the other.
//
// A-RC1 — THE FAILURE PATH WAS AN UNBOUNDED RETRY LOOP. Measured against a backend that always rejects,
// ONE page entry issued 41 requests and was still going when the harness cut it off. Two lines, each
// defensible alone:
//
//     guard        if (… && !_fsReadModel && !_factoryDbLoadTried) { _factoryDbLoadTried = true; read(); }
//     rejection    .catch(… { _factoryDbLoadTried = false; …; initFactoryStockPage(); })
//
// F1-7N-FB-4E §D9 cleared the tried-flag so a later mount could really retry — correct — and then
// re-entered the very function whose guard reads that flag. So the "later mount" was immediate.
//
// A-RC2 — THE INVENTORY TABLE NEVER ASKED THE STATE MACHINE ANYTHING. The same round built
// _fsStateHtml_ so LOADING, a typed transport failure and an unconfigured API would be three different
// screens, wired it into renderFactoryMovementTable and into all of overseas-stock.js, and did not wire
// it into renderFactoryStockTable — the primary table. So all three, plus a genuinely empty result,
// printed "尚未連接資料來源" ("no data source connected yet"): the typed error was unreachable, its
// Retry button was never drawn, and the request storm was invisible behind a screen asserting the one
// thing that was not true.
//
// The existing guard could not see it. F4 in shared-api-transport-reliability counted occurrences of
// the literal phrase, and the copy in renderFactoryStockTable was written 尚未… — the same
// eight characters on screen, different bytes in the file. That check now decodes escapes first.
//
// WHAT THE FIX DOES NOT DO. It does not make the page retry less eagerly by adding a delay, a backoff
// or a cap — those are timing assumptions, and §A3 forbids them. It separates two questions the one
// boolean was answering: "has a read been attempted?" and "may another start now?". _fsLoad.status
// answers the second, and only an explicit Retry or a fresh route entry returns it to IDLE.

'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var REPO = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO, rel), 'utf8'); }
var JS_REL = 'assets/js/pages/factory-stock.js';
var JS = read(JS_REL);

var fail = 0, pass = 0;
function ok(c, l, extra) {
  if (!c) { fail++; console.error('FAIL  ' + l + (extra === undefined ? '' : '\n   ' + JSON.stringify(extra))); }
  else { pass++; console.log('ok   ' + l); }
}
function eq(a, b, l) {
  var A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) { fail++; console.error('FAIL  ' + l + '\n   expected ' + B + '\n   actual   ' + A); }
  else { pass++; console.log('ok   ' + l); }
}
function section(t) { console.log('\n-- ' + t + ' ' + new Array(Math.max(2, 100 - t.length)).join('-')); }
// factory-stock.js carries trailing whitespace on many of its blank lines, and an anchor copied out of
// it through an editor that trims does not match the file it came from. The only difference tolerated is
// trailing spaces or tabs before a line break; everything else is literal, and the anchor must still
// match exactly once — a mutant that injects nothing proves nothing.
function swapSrc(src, a, b) {
  // \r is in the tolerated set because this file ships CRLF and an anchor written with \n would other-
  // wise miss every multi-line match — which is precisely how D1, D2 and D6 came back NOT FOUND while
  // the single-line mutants matched happily.
  var re = new RegExp(a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\n/g, '[ \\t\\r]*\\n'));
  var hits = src.match(new RegExp(re.source, 'g'));
  if (!hits) throw new Error('MUTANT ANCHOR NOT FOUND:\n' + a);
  if (hits.length !== 1) throw new Error('MUTANT ANCHOR NOT UNIQUE (' + hits.length + '):\n' + a);
  return src.replace(re, function () { return b; });
}
var PHRASE = '尚未連接資料來源';   // "no data source connected yet"

// =================================================================================================
// HARNESS — the real module, a DOM shim, and a backend whose behaviour each scenario chooses.
// =================================================================================================
function El(tag, byId, doc) {
  var e = {
    tagName: String(tag || 'div').toUpperCase(), children: [], parentNode: null,
    attrs: {}, style: {}, dataset: {}, className: '', _id: '', _html: '', _text: '',
    value: '', checked: false, disabled: false, _listeners: {},
    classList: { add: function () {}, remove: function () {}, contains: function () { return false; }, toggle: function () {} },
    setAttribute: function (k, v) { e.attrs[k] = String(v); if (k === 'id') e.id = String(v); },
    getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(e.attrs, k) ? e.attrs[k] : null; },
    removeAttribute: function (k) { delete e.attrs[k]; },
    addEventListener: function (t, fn) { (e._listeners[t] = e._listeners[t] || []).push(fn); doc.__elListeners++; },
    removeEventListener: function (t, fn) { var a = e._listeners[t] || []; var i = a.indexOf(fn); if (i > -1) { a.splice(i, 1); doc.__elListeners--; } },
    appendChild: function (c) { c.parentNode = e; e.children.push(c); return c; },
    removeChild: function (c) { var i = e.children.indexOf(c); if (i > -1) e.children.splice(i, 1); return c; },
    insertBefore: function (c) { return e.appendChild(c); },
    remove: function () {},
    getBoundingClientRect: function () { return { left: 0, top: 0, width: 100, height: 50 }; },
    closest: function () { return null; },
    querySelector: function (s) { var r = e.querySelectorAll(s); return r.length ? r[0] : null; },
    querySelectorAll: function () { return []; },
    focus: function () {}, click: function () {}
  };
  Object.defineProperty(e, 'id', { get: function () { return e._id; }, set: function (v) { e._id = String(v); if (v) byId[v] = e; } });
  Object.defineProperty(e, 'innerHTML', { get: function () { return e._html; }, set: function (v) { e._html = String(v); } });
  Object.defineProperty(e, 'textContent', { get: function () { return e._text; }, set: function (v) { e._text = String(v); } });
  return e;
}

/**
 * @param opts.mode  'ok' | 'fail' | 'slow' | 'empty'
 * @param opts.src   mutated source
 */
function world(opts) {
  opts = opts || {};
  var byId = {};
  var __ids = new Map(), __n = 0;
  var doc = {
    __elListeners: 0, __docReg: [],
    __fnId: function (fn) { if (!__ids.has(fn)) __ids.set(fn, ++__n); return __ids.get(fn); }
  };
  Object.defineProperty(doc, '__docListeners', { get: function () { return doc.__docReg.length; } });
  var mk = function (t) { return El(t, byId, doc); };
  var root = mk('div'); root.id = 'factory-stock-section';
  ['factory-stock-fixed-body', 'factory-stock-scroll-body', 'factory-movement-fixed-body',
   'factory-movement-scroll-body', 'factory-sku-input', 'factory-kpi-row'].forEach(function (i) {
    var e = mk('div'); e.id = i; root.appendChild(e);
  });
  root.querySelectorAll = function () { return []; };
  root.querySelector = function (sel) {
    var m = /^#([a-z0-9-]+)$/i.exec(sel);
    return m ? (byId[m[1]] || null) : null;
  };

  var seen = { requests: 0, tables: [] };
  var pending = [];
  var ctx = {
    console: { log: function () {}, warn: function () {}, error: function () {} },
    JSON: JSON, Object: Object, Array: Array, String: String, Number: Number, Math: Math, Date: Date,
    Promise: Promise, parseInt: parseInt, parseFloat: parseFloat, isNaN: isNaN, isFinite: isFinite,
    encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent,
    setTimeout: function (fn) { return 0; }, clearTimeout: function () {},
    setInterval: function () { throw new Error('the page must not poll'); }, clearInterval: function () {},
    localStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} },
    document: {
      body: mk('body'), head: mk('head'),
      createElement: mk, createElementNS: function (ns, t) { return mk(t); },
      getElementById: function (i) { return byId[i] || null; },
      querySelector: function (sel) { return sel === '#factory-stock-section' ? root : (byId[String(sel).replace('#', '')] || null); },
      querySelectorAll: function () { return []; },
      // A REAL removeEventListener IS A NO-OP for a handler that was never added, so the shim keeps the
      // actual (type, fn) pairs rather than a counter. A counter decremented unconditionally reported the
      // page shedding listeners it had never registered — initFactoryStockPage removes its outside-click
      // handler twice per call by design — which reads as drift in the wrong direction.
      addEventListener: function (t, fn) { doc.__docReg.push(t + '\u0000' + String(doc.__fnId(fn))); },
      removeEventListener: function (t, fn) {
        var i = doc.__docReg.indexOf(t + '\u0000' + String(doc.__fnId(fn)));
        if (i > -1) doc.__docReg.splice(i, 1);
      }
    },
    __seen: seen, __root: root, __byId: byId, __doc: doc,
    __release: function () { var q = pending.slice(); pending.length = 0; q.forEach(function (f) { f(); }); }
  };
  ctx.window = ctx;
  ctx.KM = {
    lifecycle: { register: function (id, h) { ctx.__life = h; } },
    partialLoader: { loadPartial: function () { return Promise.resolve(true); } },
    DemoData: { isEnabled: function () { return false; } },
    loadState: { bindElement: function () { return { beginLoad: function () {} }; } },
    DB: {
      isScopedReadEligible: function () { return true; },
      isProductionWriteEligible: function () { return true; },
      getApiBaseUrl: function () { return 'https://example.test/exec'; },
      loadOperationDb: function () { return Promise.resolve({}); },
      loadScopedTables: function (tables) {
        seen.requests++; seen.tables.push(tables.slice());
        var EMPTY = { factoryStock: [], factoryStockMovements: [], skuDetails: [], warehouses: [] };
        var ROWS = { factoryStock: [{ sku: 'CO1100', factory: 'F1', country: 'CN', category: 'c', series: 's', currentStock: 5, reservedStock: 0, stockStatus: 'OK' }],
                     factoryStockMovements: [], skuDetails: [], warehouses: [] };
        if (opts.mode === 'fail') return Promise.reject(Object.assign(new Error('boom'), { kmTransport: { code: 'HTTP_NOT_FOUND_HTML', phase: 'read' } }));
        if (opts.mode === 'slow') return new Promise(function (res) { pending.push(function () { res(ROWS); }); });
        if (opts.mode === 'empty') return Promise.resolve(EMPTY);
        return Promise.resolve(ROWS);
      }
    }
  };
  ctx.window.KM = ctx.KM;
  vm.createContext(ctx);
  vm.runInContext(opts.src || JS, ctx, { filename: 'factory-stock.js' });
  return ctx;
}

/** Drain the microtask queue so every settled promise has run its handlers. */
function settle() {
  var p = Promise.resolve();
  for (var i = 0; i < 60; i++) p = p.then(function () {});
  return p;
}
function body(ctx) { return ctx.__byId['factory-stock-scroll-body']._html; }
function stuckLoading(ctx) { return ctx._fsLoadState_().status === 'LOADING'; }

console.log('\n' + new Array(101).join('='));
console.log('S3-R1 §A — FACTORY INVENTORY LOADING STABILITY');
console.log(new Array(101).join('='));

var chain = Promise.resolve();

// =================================================================================================
chain = chain.then(function () {
  section('A. THE OWNERS — §A1');
  ok(/KM\.lifecycle\.register\('factory-stock-section'/.test(JS), 'A1 ROUTE OWNER: the page lifecycle, one registration');
  ok(/window\.KM\.DB\.loadScopedTables\(\['factory_stock', 'factory_stock_movements', 'sku_details', 'warehouses'\]\)/.test(JS),
    'A2 READ OWNER: ONE bounded scoped read of four named tables');
  // The page keeps a broad loadOperationDb branch, and that is correct: it is the documented Legacy
  // kill-switch posture (KM_SCOPED_PAGE_READS === false). What matters is that it is UNREACHABLE while
  // the scoped read is active, so the canonical path has exactly one read owner.
  ok(/if \(!demoOn && !_fsScopedActive\(\) && !window\._opDbCache && !_factoryDbLoadTried\) \{/.test(JS),
    'A3 the broad read is gated behind !_fsScopedActive() — the Legacy kill switch, not a fallback');
  ok(!/getOperationDb\(/.test(JS.replace(/\/\*[\s\S]*?\*\//g, '')),
    'A3b and getOperationDb is never called by this page at all');
  ok(/function _fsMayStartRead_\(\) \{ return _fsLoad\.status === 'IDLE'; \}/.test(JS),
    'A4 REQUEST OWNER: exactly one gate decides whether a read may start');
  ok(/var _fsReadGen_ = 0;/.test(JS) && /myGen !== _fsReadGen_/.test(JS),
    'A5 and the commit is guarded by monotonic request identity, not by timing — §A3');
  ok(/var _fsReadModel = null;/.test(JS), 'A6 CACHE OWNER: one read model');
  ok(/function _fsStateHtml_\(\)/.test(JS), 'A7 LOADING/ERROR OWNER: one state renderer');

  // A-RC2, at source: BOTH tables must consult it. This is the assertion whose absence was the defect.
  var stock = JS.slice(JS.indexOf('function renderFactoryStockTable'), JS.indexOf('function _renderFactoryKpis'));
  var mov = JS.slice(JS.indexOf('function renderFactoryMovementTable'));
  ok(/var _stF = _fsStateHtml_\(\);/.test(stock), 'A8 the INVENTORY table consults the state renderer');
  ok(/var _stF = _fsStateHtml_\(\);/.test(mov), 'A9 the MOVEMENTS table does too — the one that always did');
  // and the sentence it owns can be rendered from exactly one place, escapes decoded.
  var rendered = JS.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(function (l) { return /^\s*\/\//.test(l) ? '' : l; }).join('\n')
    .replace(/\\u([0-9a-fA-F]{4})/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); });
  eq(rendered.split(PHRASE).length - 1, 1, 'A10 "not connected" can be RENDERED from exactly one place — escapes decoded');
});

// =================================================================================================
chain = chain.then(function () {
  section('B. THE NINE SCENARIOS — §A2');

  // 1. FIRST ENTRY
  var c = world({ mode: 'ok' });
  c.initFactoryStockPage();
  return settle().then(function () {
    eq(c.__seen.requests, 1, 'B1 §A2.1 first entry issues exactly ONE request — FIRST_ENTRY_REQUESTS');
    eq(c.__seen.tables[0], ['factory_stock', 'factory_stock_movements', 'sku_details', 'warehouses'],
      'B2 ... for the four named tables, never a broad read');
    eq(c._fsLoadState_().status, 'READY', 'B3 ... and the load settles');
    ok(body(c).indexOf(PHRASE) === -1, 'B4 ... with rows, not "not connected"');

    // 2. LEAVE -> RE-ENTER
    c.initFactoryStockPage();
    return settle().then(function () {
      eq(c.__seen.requests, 1, 'B5 §A2.2 re-entry re-reads NOTHING — the model is already held — REENTRY_REQUESTS');
    });
  });
});

chain = chain.then(function () {
  // 3. FAST DOUBLE RE-ENTRY, while the first read is still in flight
  var c = world({ mode: 'slow' });
  c.initFactoryStockPage();
  c.initFactoryStockPage();
  c.initFactoryStockPage();
  return settle().then(function () {
    eq(c.__seen.requests, 1, 'B6 §A2.3 three entries during one flight issue ONE request — FAST_REENTRY_DUPLICATES = 0');
    ok(stuckLoading(c), 'B7 ... and the page is honestly LOADING while it waits');
    c.__release();
    return settle().then(function () {
      eq(c._fsLoadState_().status, 'READY', 'B8 §A2.4 a slow response still settles the load — LOADING_STUCK_COUNT = 0');
      eq(c.__seen.requests, 1, 'B9 ... and released nothing extra');
    });
  });
});

chain = chain.then(function () {
  // 5. RESPONSE FAILURE — the defect this round exists for.
  var c = world({ mode: 'fail' });
  c.initFactoryStockPage();
  return settle().then(function () {
    eq(c.__seen.requests, 1, 'B10 §A2.5 a failing read issues ONE request, not a storm (was 41 and climbing)');
    eq(c._fsLoadState_().status, 'ERROR', 'B11 ... the failure is a state, and it settles');
    ok(!stuckLoading(c), 'B12 ... never a permanent LOADING latch');
    ok(body(c).indexOf('Could not load') > -1, 'B13 ... the table says so, in the operator\'s words');
    ok(body(c).indexOf('HTTP_NOT_FOUND_HTML') > -1, 'B14 ... with the typed reason');
    ok(body(c).indexOf(PHRASE) === -1, 'B15 ... and NOT "not connected", which would be false — FALSE_EMPTY_COUNT = 0');
    // HTTP_NOT_FOUND_HTML is classified NON-retryable, so the honest screen offers NO Retry and says
    // what would actually fix it. Offering a button that cannot help is the failure mode here.
    ok(body(c).indexOf('Retryable: no') > -1, 'B16 ... a 404 page is marked non-retryable');
    ok(body(c).indexOf('_fsRetryRead_') === -1, 'B16b ... so no Retry button is drawn for it');
    ok(body(c).indexOf('publish a new Apps Script deployment version') > -1,
      'B16c ... and the screen names what would actually fix it');

    // the Retry is exactly one request, and it goes through the same gate
    var before = c.__seen.requests;
    c._fsRetryRead_();
    return settle().then(function () {
      eq(c.__seen.requests - before, 1, 'B17 §A3 one Retry = exactly ONE new request');

      // A TRANSIENT failure is the other half of the same rule: that one IS retryable, and says so.
      var t = world({ mode: 'ok' });
      t.KM.DB.loadScopedTables = function () {
        t.__seen.requests++;
        return Promise.reject(Object.assign(new Error('network'), { kmTransport: { code: 'HTTP_TRANSPORT_ERROR' } }));
      };
      t.initFactoryStockPage();
      return settle().then(function () {
        ok(body(t).indexOf('Retryable: yes') > -1, 'B17b a transient failure is marked retryable');
        ok(body(t).indexOf('_fsRetryRead_') > -1, 'B17c ... and DOES draw a Retry the operator can press');
        eq(t.__seen.requests, 1, 'B17d ... and it too issued exactly one request, not a storm');
      });
    });
  });
});

chain = chain.then(function () {
  // 5b. RECOVERY WITHOUT A RELOAD — F1-7N-FB-4E §D9's promise, kept by the route and not by the failure.
  var c = world({ mode: 'fail' });
  c.initFactoryStockPage();
  return settle().then(function () {
    eq(c.__seen.requests, 1, 'B18 the first entry failed, once');
    c._fsRearmOnEntry_();          // what the lifecycle mount does
    c.initFactoryStockPage();
    return settle().then(function () {
      eq(c.__seen.requests, 2, 'B19 §D9 a FRESH ROUTE ENTRY really retries — recovery needs no browser reload');
      // ... and re-entry on a healthy page does NOT re-read
      var d = world({ mode: 'ok' });
      d.initFactoryStockPage();
      return settle().then(function () {
        d._fsRearmOnEntry_(); d.initFactoryStockPage();
        return settle().then(function () {
          eq(d.__seen.requests, 1, 'B20 ... while re-entering a READY page re-reads nothing');
        });
      });
    });
  });
});

chain = chain.then(function () {
  // 6. STALE FIRST RESPONSE ARRIVING AFTER A NEWER ONE
  var c = world({ mode: 'slow' });
  c.initFactoryStockPage();                 // flight 1, held
  return settle().then(function () {
    // force a second dispatch the way a Retry would, while flight 1 is still open
    c._fsLoadState_().status = 'IDLE';
    c.initFactoryStockPage();               // flight 2
    return settle().then(function () {
      eq(c.__seen.requests, 2, 'B21 §A2.6 two flights are open');
      c.__release();                        // both resolve, oldest first
      return settle().then(function () {
        eq(c._fsLoadState_().status, 'READY', 'B22 ... the page settles');
        // the OLDER answer must not be the one that landed: generation says only the newest commits.
        ok(/if \(myGen !== _fsReadGen_\) return;/.test(JS),
          'B23 §A3 STALE_RESPONSE_COMMITS = 0 — an older answer is dropped by request identity');
      });
    });
  });
});

chain = chain.then(function () {
  // 8. EMPTY CANONICAL RESPONSE — a success with no rows is not a disconnection.
  var c = world({ mode: 'empty' });
  c.initFactoryStockPage();
  return settle().then(function () {
    eq(c._fsLoadState_().status, 'READY', 'B24 §A2.8 an empty read is READY, not an error');
    ok(body(c).indexOf(PHRASE) === -1, 'B25 ... and does NOT say "not connected" — that was the false-empty render');
    ok(body(c).indexOf('No factory stock rows') > -1, 'B26 ... it says the table is empty, which is what happened');
  });
});

chain = chain.then(function () {
  // 9. MALFORMED RESPONSE — the adapter hands back something unusable.
  var c = world({ mode: 'ok' });
  c.KM.DB.loadScopedTables = function () { c.__seen.requests++; return Promise.resolve(null); };
  c.initFactoryStockPage();
  return settle().then(function () {
    ok(!stuckLoading(c), 'B27 §A2.9 a malformed response still settles the load');
    eq(c.__seen.requests, 1, 'B28 ... and issues no extra request');
  });
});

chain = chain.then(function () {
  // 7. HARD RELOAD — a fresh module instance, no state carried.
  var c = world({ mode: 'ok' });
  eq(c._fsLoadState_().status, 'IDLE', 'B29 §A2.7 a hard reload starts from IDLE with no carried state');
  eq(c.__seen.requests, 0, 'B30 ... and has issued nothing before the page is entered — STATE_BLEED_COUNT = 0');
});

// =================================================================================================
chain = chain.then(function () {
  section('C. LISTENERS AND TIMERS — §A4, §4');
  var c = world({ mode: 'ok' });
  c.initFactoryStockPage();
  return settle().then(function () {
    // The FIRST init legitimately installs the outside-click handler, so the steady state begins at the
    // second. Drift is the question "does re-entering keep adding?", and that is what is measured.
    c.initFactoryStockPage();
    var steady = c.__doc.__docListeners;
    c.initFactoryStockPage(); c.initFactoryStockPage(); c.initFactoryStockPage();
    return settle().then(function () {
      eq(c.__doc.__docListeners, steady, 'C1 three more inits add no document listener — LISTENER_DRIFT = 0');
      ok(steady <= 2, 'C1b and the steady state is a small fixed number, not a growing one', steady);
      ok(/setInterval/.test(JS) === false, 'C2 the page registers no interval — no polling, TIMER_DRIFT = 0');
      ok(!/setTimeout\(\s*function[^)]*initFactoryStockPage/.test(JS), 'C3 and no timer re-arms the read');
    });
  });
});

// =================================================================================================
chain = chain.then(function () {
  section('D. MUTANTS — each returns TRUE when the defect is CAUGHT');
  var caught = 0, survived = [];
  function mutant(id, why, anchor, repl, probe, mode) {
    // Resolve the anchor FIRST and die loudly if it has drifted. A mutant that injects nothing "passes"
    // every probe, and a harness that cannot tell that apart from a real catch is worse than no harness.
    var src;
    try { src = swapSrc(JS, anchor, repl); }
    catch (e) {
      fail++; console.error('HARNESS ERROR  ' + id + ' — ' + e.message);
      return Promise.resolve();
    }
    return Promise.resolve().then(function () {
      var c = world({ mode: mode || 'fail', src: src });
      c.initFactoryStockPage();
      return settle().then(function () { return probe(c); });
    }).then(function (got) {
      if (got) { caught++; pass++; console.log('ok   ' + id + '  ' + why + ' (caught)'); }
      else { survived.push(id); fail++; console.error('FAIL  ' + id + '  ' + why + ' SURVIVED'); }
    }, function (e) {
      // A mutated page that throws IS caught — but only because the mutation ran. The anchor was
      // already proven above, so this arm can no longer be reached by a silent no-op.
      caught++; pass++; console.log('ok   ' + id + '  ' + why + ' (caught — the mutated page threw)');
    });
  }

  // A baseline that does not work would make every probe read as caught whatever the mutant did.
  var base = world({ mode: 'fail' });
  base.initFactoryStockPage();
  return settle().then(function () {
    ok(base.__seen.requests === 1 && base._fsLoadState_().status === 'ERROR',
      'D0  the unmutated baseline issues ONE request and lands in ERROR');

    return mutant('D1', 'the rejection re-arms the gate — the unbounded retry loop is back',
      "                _fsLoad = { status: _fsConfiguredApi_() ? 'ERROR' : 'EMPTY_CONFIGURATION',\n                    error: _fsConfiguredApi_() ? _fsReadFailure_(err) : null, requests: _fsLoad.requests };",
      "                _factoryDbLoadTried = false;\n                _fsLoad = { status: 'IDLE', error: null, requests: _fsLoad.requests };",
      function (c) { return c.__seen.requests > 1; })
      .then(function () {
        return mutant('D2', 'the inventory table stops consulting the state renderer — the typed error vanishes',
          "    var _stF = _fsStateHtml_();\n    if (_stF) { fixedBody.innerHTML = ''; scrollBody.innerHTML = _stF; return; }\n\n    // 檢查資料是否存在",
          "    // 檢查資料是否存在",
          function (c) { return body(c).indexOf('Could not load') === -1; });
      })
      .then(function () {
        return mutant('D3', 'the empty render claims a disconnection again — a false empty',
          "        scrollBody.innerHTML = '<div style=\"padding:20px;text-align:center;color:#94A3B8\">No factory stock rows.</div>';",
          "        scrollBody.innerHTML = '<div style=\"padding:20px;text-align:center;color:#94A3B8\">" + PHRASE + "</div>';",
          function (c) { return body(c).indexOf(PHRASE) > -1; }, 'empty');
      })
      .then(function () {
        return mutant('D4', 'the gate lets a second read start while one is in flight',
          "function _fsMayStartRead_() { return _fsLoad.status === 'IDLE'; }",
          "function _fsMayStartRead_() { return true; }",
          function (c) {
            // The mutant can only bite on a RE-ENTRY during a flight, so the probe performs one.
            c.initFactoryStockPage();
            return settle().then(function () { return c.__seen.requests !== 1; });
          }, 'slow');
      })
      .then(function () {
        // The old probe read the SOURCE and so could never fail. This one drives two overlapping
        // flights and asks which answer landed: with the guard removed, the STALE one does.
        return mutant('D5', 'an older answer is committed over a newer one — request identity removed',
          "                if (myGen !== _fsReadGen_) return;          // a newer read owns the model",
          "                if (false) return;",
          function (c) {
            var n = 0, release = [];
            c.KM.DB.loadScopedTables = function () {
              c.__seen.requests++;
              var tag = ++n;
              return new Promise(function (res) {
                release.push(function () {
                  res({ factoryStock: [{ sku: 'S' + tag, factory: 'F', country: 'CN', category: 'c', series: 's', currentStock: tag, reservedStock: 0, stockStatus: 'OK' }],
                        factoryStockMovements: [], skuDetails: [], warehouses: [], __tag: tag });
                });
              });
            };
            c._fsLoadState_().status = 'IDLE'; c._fsReadModel = null;
            c.initFactoryStockPage();                  // flight 1
            c._fsLoadState_().status = 'IDLE';
            c.initFactoryStockPage();                  // flight 2
            return settle().then(function () {
              release[1](); return settle();           // the NEWER one lands first
            }).then(function () {
              release[0](); return settle();           // then the older one arrives late
            }).then(function () {
              return c._fsReadModel && c._fsReadModel.__tag === 1;   // the stale answer won = caught
            });
          }, 'slow');
      })
      .then(function () {
        return mutant('D6', 'a fresh route entry no longer re-arms a failure — recovery needs a reload again',
          "        _fsLoad = { status: 'IDLE', error: null, requests: _fsLoad.requests };\n        _factoryDbLoadTried = false;\n    }\n}",
          "    }\n}",
          function (c) {
            var before = c.__seen.requests;
            c._fsRearmOnEntry_(); c.initFactoryStockPage();
            return settle().then(function () { return c.__seen.requests === before; });
          });
      })
      .then(function () {
        console.log('\n' + new Array(101).join('='));
        console.log('S3-R1 §A FACTORY INVENTORY LOADING STABILITY — passed ' + pass + '  failed ' + fail
          + '  |  mutants caught ' + caught + '  survived ' + survived.length
          + (survived.length ? ' (' + survived.join(', ') + ')' : ''));
        console.log('diagnostic invariants: DB_WRITES=0 · NETWORK_CALLS=0 · APPS_SCRIPT_EXECUTIONS=0 · DEPLOYMENTS=0');
        console.log(new Array(101).join('='));
        process.exit(fail ? 1 : 0);
      });
  });
});

chain.catch(function (e) {
  console.error('FAIL  the suite itself threw: ' + (e && e.stack || e));
  process.exit(1);
});
