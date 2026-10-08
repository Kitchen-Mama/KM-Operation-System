// S8-R4D-F1B — PRESENTATION STATE (preload without visual commit) + RESTING LAYOUT.
//
// Run: node assets/tests/presentation-state-and-resting-layout-s8-r4d-f1b.test.js
//
// WHAT THIS ROUND CHANGED, AND WHAT IT DELIBERATELY DID NOT.
//
//   BEFORE  a remembered scope made the mount read the first layer AND commit it: _irBootstrapScope_'s
//           COALESCED branch ended in _irApplySearch_(remembered, mySeq), so a table appeared for a scope the
//           operator had not confirmed in this session.
//   AFTER   the preload still runs, byte-identical, and nothing is committed. `applied` stays null, the page
//           stays PRE_SEARCH, and the FIRST Search commits — from memory when the preload has landed, and
//           coalesced onto the same in-flight request when it has not.
//
// The preload FAILURE branch is untouched on purpose. It never applied a scope (it is asserted here that it
// still does not), and rewriting what a failed read says is a different decision from when a successful one
// is shown. F1A's scope-stamp guard is untouched too, and §B re-proves it rather than trusting that.
//
// LAYOUT. The two inter-block gaps were already declared equal (24px, --space-lg). What differed was
// OCCUPANCY: the banner host is a flow sibling in the category→table gap and in no other, and its most
// frequent writer fires on the Country/Marketplace change itself. The host moved INSIDE the table card, so
// neither gap has a dynamic occupant any more. No margin value changed.
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var ROOT = path.join(__dirname, '..', '..');
var passed = 0, failed = 0;
function ok(c, m) { if (c) { passed++; console.log('ok   ' + m); } else { failed++; console.log('FAIL ' + m); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }
function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }

var IR = read('assets/js/pages/inventory-replenishment.js');
var CSS = read('assets/css/pages/inventory-replenishment.css');
var TRANSPORT = read('assets/js/api/km-transport.js');
var FOUND = read('assets/js/api/km-api-foundation.js');

// =============================================================================================================
// THE HARNESS — the REAL page module, executed. Nothing below asserts that a line of source exists; the
// bootstrap and the Search are DRIVEN and what is observed is the applied scope, the painted status and the
// number of workspace reads.
// =============================================================================================================
function makeIrHarness(opts, srcOverride) {
  opts = opts || {};
  var reads = [];          // every getWorkspace the page issued
  var painted = [];        // every renderReplenishment(), with the status at the time
  var loadRegion = [];
  var store = {};
  var now = { t: 1000000 };
  var gate = null;         // when opts.deferWorkspace, the pending resolver(s)

  var selects = {
    replenCountry: { value: '' },
    replenMarketplace: { value: '' },
    replenLTSFilter: { value: '' }
  };

  var win = {
    KM: {
      loadState: { STATES: { READY: 'READY', EMPTY: 'EMPTY' },
        bindElement: function () { return null; },
        createRegion: function () { return {
          beginLoad: function (hasData) { loadRegion.push('beginLoad:' + !!hasData); },
          set: function (st) { loadRegion.push('set:' + st); } }; } },
      api: {
        workspaceApiActive: function () { return true; },
        getWorkspace: function (name) {
          reads.push(name);
          if (opts.workspaceFails) return Promise.reject({ code: 'READ_FAILED', message: 'read failed' });
          if (opts.deferWorkspace) {
            return new Promise(function (res) { gate = function () { res({ success: true, data: { rows: [] } }); }; });
          }
          return Promise.resolve({ success: true, data: { rows: [] } });
        }
      },
      DB: { adaptInventoryReplenishmentWorkspace: function () { return { getMarketplaceSkus: [{ sku: 'SKU-A' }] }; } },
      // The registry is the picker authority: the bootstrap VALIDATES a remembered scope against it before
      // showing it, so the harness has to offer the four sites the fixtures use or every remembered scope
      // would be discarded as retired and the restore half of §A.1 could never be observed.
      scopeRegistry: {
        STATUS: { READY: 'READY', EMPTY: 'EMPTY', ERROR: 'ERROR' },
        ensureLoaded: function () {
          return Promise.resolve({ status: 'READY', model: { getMarketplaces: [
            { marketplace_id: 'MP-US', country: 'US', marketplace: 'Amazon', company: 'KM' },
            { marketplace_id: 'MP-CA', country: 'CA', marketplace: 'Amazon', company: 'KM' },
            { marketplace_id: 'MP-EU', country: 'DE', marketplace: 'Amazon', company: 'KM' },
            { marketplace_id: 'MP-JP', country: 'JP', marketplace: 'Amazon', company: 'KM' }
          ] } });
        },
        getState: function () { return { status: 'READY', requests: 1, from_cache: false }; }
      }
    },
    localStorage: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); },
      removeItem: function (k) { delete store[k]; }
    },
    location: { hash: '' }, alert: function () {}, addEventListener: function () {}, removeEventListener: function () {}
  };
  var sb = {
    console: { log: function () {}, warn: function () {}, error: function () {} },
    alert: function () {},
    window: win,
    document: {
      getElementById: function (id) { return Object.prototype.hasOwnProperty.call(selects, id) ? selects[id] : null; },
      querySelector: function () { return null; }, querySelectorAll: function () { return []; },
      addEventListener: function () {}, removeEventListener: function () {},
      createElement: function () { return { style: {}, classList: { add: function () {}, remove: function () {} }, appendChild: function () {} }; },
      readyState: 'complete', body: { classList: { add: function () {}, remove: function () {} } }
    },
    JSON: JSON, Math: Math, Promise: Promise, Array: Array, Object: Object, String: String, Number: Number,
    Boolean: Boolean, RegExp: RegExp, Error: Error, Set: Set, Map: Map, isFinite: isFinite, isNaN: isNaN,
    parseInt: parseInt, parseFloat: parseFloat, encodeURIComponent: encodeURIComponent,
    decodeURIComponent: decodeURIComponent, setTimeout: setTimeout, clearTimeout: clearTimeout,
    setInterval: function () {}, clearInterval: function () {},
    Date: { now: function () { return now.t; } },
    localStorage: win.localStorage, fetch: function () { return Promise.reject(new Error('no network here')); }
  };
  sb.globalThis = sb; sb.self = sb;
  var ctx = vm.createContext(sb);
  try { vm.runInContext(srcOverride || IR, ctx, { filename: 'inventory-replenishment.js' }); }
  catch (e) { return { loadError: String(e && e.message) }; }
  vm.runInContext('renderReplenishment = function () { __painted.push(_irSearch.status); };', ctx);
  sb.__painted = painted;

  return {
    reads: reads, painted: painted, loadRegion: loadRegion, selects: selects, store: store,
    run: function (code) { return vm.runInContext(code, ctx); },
    remember: function (scope) { store['km_site_inventory_last_scope_v1'] = JSON.stringify({ country: scope.country, marketplaceId: scope.marketplaceId, at: now.t }); },
    pick: function (scope) { selects.replenCountry.value = scope.country; selects.replenMarketplace.value = scope.marketplaceId; },
    release: function () { if (gate) { var g = gate; gate = null; g(); } },
    pending: function () { return !!gate; }
  };
}
// Let every already-resolved promise chain settle. The page chains Promise.all -> then -> then, so one tick
// is not enough and a fixed count is a guess; draining a generous number of microtask turns is deterministic.
function settle(n) {
  var p = Promise.resolve();
  for (var i = 0; i < (n || 12); i++) p = p.then(function () {});
  return p;
}

var US = { country: 'US', marketplaceId: 'MP-US' };
var CA = { country: 'CA', marketplaceId: 'MP-CA' };
var EU = { country: 'DE', marketplaceId: 'MP-EU' };
var JP = { country: 'JP', marketplaceId: 'MP-JP' };

var checks = [];

// =============================================================================================================
checks.push(Promise.resolve().then(function () {
  section('A — FRESH SESSION, NOTHING REMEMBERED (D-F: no remembered scope means no preload)');
  var h = makeIrHarness();
  ok(!h.loadError, 'A0  the shipped page module loads (' + (h.loadError || 'ok') + ')');
  if (h.loadError) return;
  return Promise.resolve(h.run('_irBootstrapScope_()')).then(function () {
    return settle().then(function () {
      var d = h.run('window._irBootstrapDiagnostic_()');
      eq(d.mode, 'REGISTRY_ONLY', 'A1  no remembered scope: the registry alone');
      eq(h.reads.length, 0, 'A2  and ZERO first-layer reads — D-F, unchanged');
      eq(h.run('_irSearch.applied'), null, 'A3  nothing is applied');
      eq(h.run('_irSearch.status'), 'PRE_SEARCH', 'A4  the page is PRE_SEARCH');
    });
  });
}));

// =============================================================================================================
checks.push(Promise.resolve().then(function () {
  section('B — HARD REFRESH WITH A REMEMBERED SCOPE: THE PRELOAD RUNS, NOTHING IS COMMITTED');
  var h = makeIrHarness();
  if (h.loadError) return;
  h.remember(US);
  return Promise.resolve(h.run('_irBootstrapScope_()')).then(function () {
    return settle().then(function () {
      var d = h.run('window._irBootstrapDiagnostic_()');
      eq(d.mode, 'COALESCED', 'B1  a remembered scope still preloads the first layer');
      eq(h.reads.length, 1, 'B2  exactly ONE first-layer read — the preload is not removed');
      ok(h.run('!!_irReadModel'), 'B3  and the read model IS in hand when it lands');
      // THE WHOLE POINT OF F1B.
      eq(h.run('_irSearch.applied'), null, 'B4  NOTHING is committed — `applied` is still null');
      eq(h.run('_irSearch.status'), 'PRE_SEARCH', 'B5  the page stays PRE_SEARCH until the operator searches');
      ok(h.painted.indexOf('READY') === -1, 'B6  no READY paint before Search (' + JSON.stringify(h.painted) + ')');
      ok(h.painted.indexOf('LOADING') === -1, 'B7  and no "Searching…" paint either');
      // The selectors ARE restored — §A.1. That is the half of the old behaviour the operator kept.
      eq(h.selects.replenCountry.value, 'US', 'B8  the remembered Country IS restored into the selector');
      eq(h.selects.replenMarketplace.value, 'MP-US', 'B9  and the remembered Marketplace');
      eq(h.loadRegion.length, 0, 'B10 the preload drove the load region ZERO times (' + JSON.stringify(h.loadRegion) + ')');
    });
  });
}));

// =============================================================================================================
checks.push(Promise.resolve().then(function () {
  section('C — PRELOAD COMPLETED, THEN SEARCH: THE COMMIT COSTS ZERO FURTHER READS (§A.7)');
  var h = makeIrHarness();
  if (h.loadError) return;
  h.remember(US);
  return Promise.resolve(h.run('_irBootstrapScope_()')).then(function () {
    return settle().then(function () {
      var readsAfterPreload = h.reads.length;
      eq(readsAfterPreload, 1, 'C1  the preload landed in one read');
      h.pick(US);
      h.run('searchReplenishment()');
      return settle().then(function () {
        eq(h.reads.length, readsAfterPreload, 'C2  Search issued NO further first-layer read — the preload is reused');
        eq(h.run('_irSearch.applied'), US, 'C3  and the scope is now committed');
        eq(h.run('_irSearch.status'), 'READY', 'C4  the table is READY only after an explicit Search');
        ok(h.painted.length > 0 && h.painted[h.painted.length - 1] === 'READY', 'C5  the commit painted exactly once, as READY');
      });
    });
  });
}));

// =============================================================================================================
checks.push(Promise.resolve().then(function () {
  section('D — SEARCH WHILE THE PRELOAD IS STILL IN FLIGHT (§A.8)');
  var h = makeIrHarness({ deferWorkspace: true });
  if (h.loadError) return;
  h.remember(US);
  h.run('_irBootstrapScope_()');
  return settle().then(function () {
    eq(h.reads.length, 1, 'D1  the preload is dispatched and still open');
    ok(h.pending(), 'D2  ... genuinely unresolved');
    h.pick(US);
    h.run('searchReplenishment()');
    return settle().then(function () {
      // The page cannot reuse a model it does not have yet, so it asks again — and the SAME payload is what
      // makes the transport share it (proven for real in §E). What matters here is that the page does not
      // commit anything while it waits.
      eq(h.run('_irSearch.applied'), null, 'D3  nothing is committed while the read is open');
      eq(h.run('_irSearch.status'), 'LOADING', 'D4  an explicit Search DOES show its own loading state');
      h.release();
      return settle(20).then(function () {
        eq(h.run('_irSearch.applied'), US, 'D5  when the read lands, the Search commits');
        eq(h.run('_irSearch.status'), 'READY', 'D6  ... as READY');
        ok(h.reads.length <= 2, 'D7  and the page never issued more than the preload plus the Search (' + h.reads.length + ')');
      });
    });
  });
}));

// =============================================================================================================
checks.push(Promise.resolve().then(function () {
  section('E — THE COALESCE IS REAL: the SHIPPED transport key, executed');
  // §A.8 is a transport property, not a page one. The page's two reads build the SAME payload; the shared
  // in-flight key is computed from that payload, so the second one returns the first one's promise instead of
  // dispatching. Both halves are executed here from the shipped sources rather than described.
  var sbT = { window: {}, module: { exports: {} }, console: { log: function () {} }, JSON: JSON, Math: Math,
    Promise: Promise, Date: Date, Object: Object, Array: Array, String: String, Number: Number, Boolean: Boolean,
    RegExp: RegExp, Error: Error, setTimeout: setTimeout, clearTimeout: clearTimeout, isFinite: isFinite,
    encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent, fetch: function () { return Promise.reject(new Error('none')); } };
  sbT.globalThis = sbT; sbT.self = sbT;
  var ctxT = vm.createContext(sbT);
  var loadErr = null;
  try { vm.runInContext(TRANSPORT, ctxT, { filename: 'km-transport.js' }); } catch (e) { loadErr = String(e && e.message); }
  ok(!loadErr, 'E0  the shipped transport loads (' + (loadErr || 'ok') + ')');
  var tp = sbT.window && sbT.window.KM && sbT.window.KM.transport;
  ok(!!(tp && tp.canonicalScope && tp.scopedSingleFlight), 'E1  it exposes canonicalScope + scopedSingleFlight');
  if (!tp || !tp.canonicalScope || !tp.scopedSingleFlight) return;

  // The exact first-layer payload the page builds, twice — once for the preload, once for the Search.
  var only = (function () {
    var m = IR.match(/var IR_FIRST_LAYER_TABLES_ = \[([\s\S]*?)\];/);
    ok(!!m, 'E2  the shipped first-layer table list is readable from the page');
    return m ? m[1].split(',').map(function (s) { return s.replace(/[\s'"]/g, ''); }).filter(Boolean) : [];
  })();
  ok(only.length > 0, 'E3  ... and is non-empty (' + only.length + ' tables)');
  var payloadA = { recentWindow: true, only: only.slice() };
  var payloadB = { recentWindow: true, only: only.slice() };
  var kA = tp.canonicalScope({ v: '1', p: payloadA });
  var kB = tp.canonicalScope({ v: '1', p: payloadB });
  ok(kA !== '' && kA === kB, 'E4  preload and Search produce the SAME shared key');
  var other = tp.canonicalScope({ v: '1', p: { recentWindow: true, only: only.slice(0, Math.max(1, only.length - 1)) } });
  ok(other !== kA, 'E5  ... and a DIFFERENT payload does not collide with it');

  var calls = 0, resolveIt = null;
  var work = function () { calls++; return new Promise(function (r) { resolveIt = r; }); };
  var p1 = tp.scopedSingleFlight('inventoryReplenishment.workspace.get', kA, work);
  var p2 = tp.scopedSingleFlight('inventoryReplenishment.workspace.get', kB, work);
  return settle().then(function () {
    eq(calls, 1, 'E6  TWO identical first-layer requests dispatched exactly ONE — they coalesced');
    ok(p1 === p2, 'E7  ... and the second received the first\'s promise');
    if (resolveIt) resolveIt({ ok: true });
    return Promise.all([p1, p2]).then(function () {
      // And the page's read is eligible for sharing: it supplies no abort signal, which is the only thing
      // that opts a read out (km-api-foundation.js).
      ok(/if \(tp && typeof tp\.canonicalScope === 'function' && !signal\)/.test(FOUND),
        'E8  a read with no abort signal takes the shared path');
      ok(!/getWorkspace\('inventoryReplenishment', _wsPayload, \{[^}]*signal/.test(IR),
        'E9  and the first-layer read supplies none');
    });
  });
}));

// =============================================================================================================
checks.push(Promise.resolve().then(function () {
  section('F — SAME-SESSION RE-ENTRY AFTER A CONFIRMED SEARCH (D-R: this one MAY restore)');
  var h = makeIrHarness();
  if (h.loadError) return;
  h.remember(US);
  return Promise.resolve(h.run('_irBootstrapScope_()')).then(function () {
    return settle().then(function () {
      h.pick(US);
      h.run('searchReplenishment()');
      return settle().then(function () {
        eq(h.run('_irSearch.applied'), US, 'F1  the operator confirmed US in this session');
        var readsBefore = h.reads.length;
        h.painted.length = 0;
        // Leave and come back.
        return Promise.resolve(h.run('_irBootstrapScope_()')).then(function () {
          var d = h.run('window._irBootstrapDiagnostic_()');
          eq(d.mode, 'RESTORED', 'F2  re-entry RESTORES the result the operator already confirmed — D-R');
          eq(d.workspace_requests, 0, 'F3  with zero blocking reads');
          eq(h.painted[0], 'READY', 'F4  and the first paint is READY, never a loading state');
          eq(h.run('_irSearch.applied'), US, 'F5  the applied scope is the one the operator confirmed');
          return settle().then(function () {
            ok(h.reads.length > readsBefore, 'F6  a quiet revalidation still runs behind it');
            eq(h.run('_irSearch.status'), 'READY', 'F7  ... and never took the table out of READY');
          });
        });
      });
    });
  });
}));

// =============================================================================================================
checks.push(Promise.resolve().then(function () {
  section('G — CHANGING COUNTRY WITHOUT SEARCH NEVER COMMITS ANOTHER SITE (§A.10)');
  var h = makeIrHarness();
  if (h.loadError) return;
  h.remember(US);
  return Promise.resolve(h.run('_irBootstrapScope_()')).then(function () {
    return settle().then(function () {
      h.pick(US); h.run('searchReplenishment()');
      return settle().then(function () {
        var readsBefore = h.reads.length;
        h.pick(CA);                       // the operator moves the dropdown and does NOT press Search
        h.run('_irMarkSearchStale_()');
        eq(h.run('_irSearch.applied'), US, 'G1  the APPLIED scope is still the searched one');
        eq(h.run('_irSearch.stale'), true, 'G2  the page marks the displayed result stale');
        eq(h.reads.length, readsBefore, 'G3  and a selector change issues NO read');
        h.run('searchReplenishment()');
        return settle().then(function () {
          eq(h.run('_irSearch.applied'), CA, 'G4  only Search moves the applied scope');
          eq(h.run('_irSearch.stale'), false, 'G5  and clears the stale mark');
        });
      });
    });
  });
}));

// =============================================================================================================
checks.push(Promise.resolve().then(function () {
  section('H — US -> CA -> EU -> JP BY SEARCH: the applied scope follows, and nothing lags');
  var h = makeIrHarness();
  if (h.loadError) return;
  var seq = [US, CA, EU, JP];
  var p = Promise.resolve(h.run('_irBootstrapScope_()')).then(function () { return settle(); });
  seq.forEach(function (s, i) {
    p = p.then(function () {
      h.pick(s); h.run('searchReplenishment()');
      return settle().then(function () {
        eq(h.run('_irSearch.applied'), s, 'H' + (i + 1) + '  ' + s.country + ' is applied after its Search');
        eq(h.run('_irAppliedScopeKey_()'), s.country.toLowerCase() + '|' + s.marketplaceId,
          'H' + (i + 1) + 'a ... and the scope KEY every async consumer compares against moved with it');
      });
    });
  });
  return p.then(function () {
    eq(h.run('_irRestoreScope_()'), JP, 'H5  the last CONFIRMED scope is the remembered one');
  });
}));

// =============================================================================================================
checks.push(Promise.resolve().then(function () {
  section('I — F1A IS INTACT: a late answer from an old scope is still refused');
  var h = makeIrHarness();
  if (h.loadError) return;
  return Promise.resolve(h.run('_irBootstrapScope_()')).then(function () {
    return settle().then(function () {
      h.pick(US); h.run('searchReplenishment()');
      return settle().then(function () {
        // A result stamped for US, consumed while CA is applied.
        var usKey = h.run('_irAppliedScopeKey_()');
        h.pick(CA); h.run('searchReplenishment()');
        return settle().then(function () {
          var caKey = h.run('_irAppliedScopeKey_()');
          ok(usKey !== caKey && caKey === 'ca|MP-CA', 'I1  the scope key advanced with the Search');
          eq(h.run('_irResultMatchesAppliedScope_({ appliedScopeKey: ' + JSON.stringify(usKey) + ' })'), false,
            'I2  a result stamped for the PREVIOUS scope is refused');
          eq(h.run('_irResultMatchesAppliedScope_({ appliedScopeKey: ' + JSON.stringify(caKey) + ' })'), true,
            'I3  and the current one is accepted');
          eq(h.run('_irResultMatchesAppliedScope_({})'), false, 'I4  an UNSTAMPED result is refused, not waved through');
          eq(h.run('_irResultMatchesAppliedScope_(null)'), false, 'I5  and so is nothing at all');
          // Before any commit the key is empty, so nothing stamped can match — Suggested Qty cannot show a
          // number carried over from a previous session's scope.
          var h2 = makeIrHarness();
          h2.remember(US);
          return Promise.resolve(h2.run('_irBootstrapScope_()')).then(function () {
            return settle().then(function () {
              eq(h2.run('_irAppliedScopeKey_()'), '', 'I6  during the preload the applied key is EMPTY');
              eq(h2.run('_irResultMatchesAppliedScope_({ appliedScopeKey: "us|MP-US" })'), false,
                'I7  so even a correctly-stamped US result cannot be consumed before the commit');
              eq(h2.run('_irSuggestedQtyState_({ sku: "SKU-A" }).state'), 'PENDING',
                'I8  Suggested Qty is PENDING before the first commit — never a stale number, never zero');
            });
          });
        });
      });
    });
  });
}));

// =============================================================================================================
checks.push(Promise.resolve().then(function () {
  section('J — THE FAILURE BRANCH IS UNTOUCHED (it never applied a scope, and still does not)');
  var h = makeIrHarness({ workspaceFails: true });
  if (h.loadError) return;
  h.remember(US);
  return Promise.resolve(h.run('_irBootstrapScope_()')).then(function () {
    return settle().then(function () {
      eq(h.run('_irSearch.applied'), null, 'J1  a failed preload commits nothing');
      eq(h.run('_irSearch.status'), 'ERROR', 'J2  and reports the read failure rather than claiming pre-search silence');
      eq(h.selects.replenCountry.value, 'US', 'J3  the validated scope is still SHOWN so Search is one click away');
      eq(h.run('_irRestoreScope_()'), US, 'J4  and a failed read never un-remembers a scope that worked before');
    });
  });
}));

// =============================================================================================================
// LAYOUT. Executed against a DOM small enough to be read in full, so "where was the node inserted" is observed.
// =============================================================================================================
function tinyDom() {
  function el(tag) {
    var e = {
      tagName: tag, id: '', style: {}, childNodes: [], _html: '',
      get children() { return e.childNodes; },
      get firstChild() { return e.childNodes.length ? e.childNodes[0] : null; },
      get innerHTML() { return e._html + e.childNodes.map(function (c) { return c.outerHTML || ''; }).join(''); },
      set innerHTML(v) { e._html = String(v); e.childNodes = parse(String(v)); },
      setAttribute: function () {}, getAttribute: function () { return null; },
      appendChild: function (c) { c.parentNode = e; e.childNodes.push(c); return c; },
      insertBefore: function (c, ref) {
        c.parentNode = e;
        var i = ref ? e.childNodes.indexOf(ref) : -1;
        if (i < 0) e.childNodes.push(c); else e.childNodes.splice(i, 0, c);
        return c;
      },
      removeChild: function (c) { var i = e.childNodes.indexOf(c); if (i >= 0) e.childNodes.splice(i, 1); c.parentNode = null; return c; },
      insertAdjacentHTML: function (pos, html) {
        var nodes = parse(String(html));
        if (pos === 'afterbegin') e.childNodes = nodes.concat(e.childNodes);
        else e.childNodes = e.childNodes.concat(nodes);
        nodes.forEach(function (n) { n.parentNode = e; });
      },
      querySelector: function (sel) {
        var cls = String(sel).replace(/^\./, '');
        for (var i = 0; i < e.childNodes.length; i++) if (e.childNodes[i].className === cls) return e.childNodes[i];
        return null;
      },
      querySelectorAll: function () { return []; },
      className: '', textContent: '', remove: function () { if (e.parentNode) e.parentNode.removeChild(e); }
    };
    return e;
  }
  // A banner is one top-level <div class="x">…</div>; that is all four producers ever emit.
  function parse(html) {
    var out = [], re = /<div class="([^"]+)"/g, m;
    while ((m = re.exec(html))) { var n = el('div'); n.className = m[1].split(' ')[0]; n.outerHTML = html; out.push(n); }
    return out;
  }
  var table = el('div'); table.id = 'replen-detail-table';
  var header = el('div'); header.className = 'table-header-bar';
  table.appendChild(header);
  var shell = el('div'); shell.className = 'replen-category-shell';
  var page = el('div'); page.id = 'opsSection';
  page.appendChild(shell); page.appendChild(table);
  // A LIVE lookup, walked from the page root. A fixed id map would have let _irStateHost_ look idempotent
  // while creating a fresh node on every call — which is exactly the property K6/L are here to check.
  function find(node, id) {
    if (node.id === id) return node;
    for (var i = 0; i < node.childNodes.length; i++) {
      var hit = find(node.childNodes[i], id);
      if (hit) return hit;
    }
    return null;
  }
  return {
    table: table, header: header, page: page,
    doc: {
      getElementById: function (id) { return find(page, id); },
      createElement: function (t) { return el(t); },
      querySelector: function () { return null; }
    }
  };
}
function sliceFn(src, name) {
  var NL = src.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('could not locate ' + name);
  var end = src.indexOf(NL + '}' + NL, start);
  if (end < 0) throw new Error('could not close ' + name);
  return src.slice(start, end + (NL + '}').length);
}
function layoutHarness(src) {
  var dom = tinyDom();
  var fn = new Function('document', 'window', '_irSearch', 'escapeReplenHtml', [
    // S8-R4D-F1B-R3 — _irStateHost_ now asks _irNoticeAnchor_ where inside the card the notice belongs, so the
    // harness has to carry it too. Slicing a function without its dependency makes the suite fail for a reason
    // that is not about what it tests.
    sliceFn(src, '_irNoticeAnchor_'),
    sliceFn(src, '_irStateHost_'),
    sliceFn(src, '_irStateHostSync_'),
    sliceFn(src, '_irRenderStaleNotice_'),
    sliceFn(src, '_irEsc_'),
    'return { host: _irStateHost_, stale: _irRenderStaleNotice_ };'
  ].join('\n'));
  var search = { stale: false };
  var api = fn(dom.doc, {}, search, null);
  return { dom: dom, api: api, search: search };
}

checks.push(Promise.resolve().then(function () {
  section('K — THE BANNER HOST MOVED OUT OF THE GAP AND INTO THE TABLE CARD (§B.1)');
  var L = layoutHarness(IR);
  var host = L.api.host();
  ok(!!host, 'K0  the host is created');
  eq(host.parentNode === L.dom.table, true, 'K1  the host is a CHILD of #replen-detail-table, not a sibling in the gap');
  eq(L.dom.page.childNodes.indexOf(host), -1, 'K2  ... so nothing dynamic sits between the category shell and the table');
  // S8-R4D-F1B-R3 — RESTATED. F1B put the host at the card's FIRST child, which is inside the span of the
  // `.table-header-bar` white curtain (0 -100vh 0 100vh white, z-index 120) — so the notice was present,
  // occupied its height, and painted white. R3 moved it BELOW the header bar, where the curtain ends. The
  // position belongs to R3's suite; what survives here is that the host is in the card beside the header,
  // not a flow sibling in the page's inter-block gap (K1/K2 above).
  eq(L.dom.table.childNodes.indexOf(host) > L.dom.table.childNodes.indexOf(L.dom.header), true,
    'K3  and it sits AFTER the sticky header bar — outside the white curtain (R3 owns this position)');
  eq(L.dom.table.childNodes.indexOf(L.dom.header) >= 0, true, 'K4  the sticky header bar is still in the card beside it');
  eq(host.style.display, 'none', 'K5  an empty host is display:none and reserves nothing');
  eq(L.api.host() === host, true, 'K6  the host is idempotent — one node, however many producers ask');
}));

checks.push(Promise.resolve().then(function () {
  section('L — FOUR PRODUCERS, ONE HOST: NO PRODUCER ERASES ANOTHER (§B.3)');
  var L = layoutHarness(IR);
  var host = L.api.host();
  // A data-loss warning is placed first, exactly as _irRenderUnsavedBanner_ places it.
  host.insertAdjacentHTML('afterbegin', '<div class="replen-unsaved-banner">unsaved</div>');
  host.style.display = '';
  // Now the operator changes Country.
  // S8-RENDER-INTEGRITY-R2 / GATE 1 = A1 — RESTATED. The visible stale notice is removed by product decision,
  // so L2/L3 can no longer be about it sitting beside the warning. What §B.3 actually protects is that one
  // producer may not erase another's node, and the removal of the informational notice is the sharpest test
  // of it: the data-loss warning must still be there afterwards.
  L.search.stale = true;
  L.api.stale();
  ok(!!host.querySelector('.replen-unsaved-banner'), 'L1  the unsaved-write warning SURVIVES a Country change');
  eq(!!host.querySelector('.replen-search-stale'), false, 'L2  and NO visible stale notice is rendered (Gate 1 = A1)');
  var names = host.childNodes.map(function (c) { return c.className; });
  eq(names, ['replen-unsaved-banner'],
    'L3  the host holds the data-loss warning and nothing else — the stale pass did not touch it');
  // Pressing Search clears only the stale notice.
  L.search.stale = false;
  L.api.stale();
  ok(!!host.querySelector('.replen-unsaved-banner'), 'L4  clearing the stale notice does not clear the warning');
  ok(!host.querySelector('.replen-search-stale'), 'L5  and the stale notice itself is gone');
  eq(host.style.display, '', 'L6  the host stays visible while any banner remains');
  // Remove the warning the way its own producer does, then re-sync.
  host.removeChild(host.querySelector('.replen-unsaved-banner'));
  L.api.stale();
  eq(host.style.display, 'none', 'L7  and hides itself only when it is genuinely empty');
  // Repeat passes stay inert. (Was: "never stacks duplicates" — with nothing emitted, the invariant that
  // matters is that repeated passes neither create a node nor un-hide an empty host.)
  L.search.stale = true;
  L.api.stale(); L.api.stale(); L.api.stale();
  eq(host.childNodes.length, 0, 'L8  repeated stale passes create nothing');
  eq(host.style.display, 'none', 'L8a ... and leave the empty host hidden');
}));

checks.push(Promise.resolve().then(function () {
  section('M — THE INTEGRITY NOTICE MOVED WITH IT, AND THE RESTING GEOMETRY IS UNCHANGED');
  // S8-R4D-F1B-R3 — RESTATED. This pinned the exact anchor expression (`tbl.firstChild`), which made it a
  // claim about WHERE INSIDE the card rather than about being inside it at all. R3 owns the position — the
  // notice moved below the sticky header so the white curtain cannot paint over it — and asserts it there.
  // What F1B owns, and all this should ever have said, is that the insert goes through the TABLE and not
  // through its parentNode, i.e. the notice is not a flow sibling in the page's inter-block gap.
  ok(/tbl\.insertBefore\(host,/.test(IR),
    'M1  the render-integrity notice is inserted INSIDE the table card (its position is R3\'s assertion)');
  ok(!/tbl\.parentNode\.insertBefore\(host, tbl\);/.test(IR) && !/table\.parentNode\.insertBefore\(el, table\);/.test(IR),
    'M2  and nothing is inserted beside the table any more');

  function block(sel) {
    var i = CSS.indexOf(sel);
    if (i === -1) return '';
    var o = CSS.indexOf('{', i), c = CSS.indexOf('}', o);
    return CSS.slice(o, c);
  }
  var panel = block('#ops-section .replen-control-panel {');
  var shell = block('#ops-section .replen-category-shell {');
  var tableCss = block('#ops-section .dual-layer-table {');
  var mPanel = panel.match(/margin-bottom:\s*([^;]+);/);
  var mShell = shell.match(/margin-bottom:\s*([^;]+);/);
  ok(!!mPanel && !!mShell, 'M3  both gaps are still declared by a margin-bottom on the block above them');
  eq(mPanel[1].trim(), mShell[1].trim(),
    'M4  and they are now declared IDENTICALLY — same token, same fallback (' + (mPanel ? mPanel[1].trim() : '?') + ')');
  ok(/var\(--space-lg/.test(mPanel[1]), 'M5  the gap is the design token, not a literal');
  ok(/margin-top:\s*0/.test(tableCss), 'M6  the table adds no margin of its own');
  ok(!/min-height|height:/.test(shell), 'M7  no fixed-height workaround was introduced on the category shell');

  var rail = block('#ops-section .replen-category-rail {');
  ok(/scrollbar-gutter:\s*stable/.test(rail),
    'M8  the category rail reserves its scrollbar gutter, so category overflow cannot change its height');
  ok(/overflow-x:\s*auto/.test(rail), 'M9  ... while still scrolling horizontally rather than wrapping');
  ok(!/min-height/.test(rail), 'M10 and it does so without a hard-coded height');
}));

checks.push(Promise.resolve().then(function () {
  section('N — STICKY BEHAVIOUR IS UNCHANGED (§B.6)');
  function block(sel) {
    var i = CSS.indexOf(sel); if (i === -1) return '';
    var o = CSS.indexOf('{', i), c = CSS.indexOf('}', o); return CSS.slice(o, c);
  }
  ok(/position:\s*sticky/.test(block('#ops-section .replen-control-panel {')), 'N1  the control panel is still sticky');
  ok(/position:\s*sticky/.test(block('#ops-section .replen-category-shell {')), 'N2  the category shell is still sticky');
  var hdr = block('#ops-section .table-header-bar {');
  ok(/position:\s*sticky/.test(hdr), 'N3  the table header is still sticky');
  ok(/top:\s*calc\(var\(--km-sticky-top-base[^)]*\)\s*\+\s*var\(--km-replen-cat-rail-h/.test(hdr),
    'N4  and still pins below the toolbar PLUS the live category-rail height');
  ok(/root\.style\.setProperty\('--km-replen-cat-rail-h'/.test(IR), 'N5  the rail height is still measured into its variable');
  ok(/new ResizeObserver\(measureCatRail\)/.test(IR), 'N6  and re-measured on resize');
}));

// =============================================================================================================
// MUTANTS. Each one re-creates the defect this round removed and asserts the suite above would have caught it.
// A guard nothing can break is not a guard.
// =============================================================================================================
checks.push(Promise.all(checks.slice()).then(function () {
  section('X — MUTATION COVERAGE');
  var survivors = [];

  function mutIr(find, replace, label, probe) {
    if (IR.indexOf(find) === -1) { survivors.push(label + ' (anchor not found: ' + find.slice(0, 50) + ')'); return Promise.resolve(); }
    var m = IR.replace(find, replace);
    return Promise.resolve(probe(m)).then(function (caught) {
      ok(caught, 'X-' + label);
      if (!caught) survivors.push(label);
    }, function () { ok(true, 'X-' + label + ' (mutant threw — caught)'); });
  }

  var muts = [];

  // X1 — put the auto-commit back. §B must see a committed scope before Search.
  muts.push(mutIr(
    '_irBootstrap.committed = false;',
    '_irBootstrap.committed = false; _irApplySearch_(remembered, mySeq);',
    'X1 restoring the bootstrap auto-commit is caught',
    function (src) {
      var h = makeIrHarness({}, src);
      if (h.loadError) return true;
      h.remember(US);
      return Promise.resolve(h.run('_irBootstrapScope_()')).then(function () {
        return settle().then(function () { return h.run('_irSearch.applied') !== null; });
      });
    }));

  // X2 — paint LOADING during the preload.
  muts.push(mutIr(
    "    _irSearch.status = 'PRE_SEARCH';\r\n    _irSearch.error = null;",
    "    _irSearch.status = 'LOADING';\r\n    _irSearch.error = null;",
    'X2 painting a loading state during the preload is caught',
    function (src) {
      var h = makeIrHarness({ deferWorkspace: true }, src);
      if (h.loadError) return true;
      h.remember(US);
      h.run('_irBootstrapScope_()');
      return settle().then(function () { return h.run('_irSearch.status') !== 'PRE_SEARCH'; });
    }));

  // X3 — put the banner host back beside the table. (Anchor updated for R3's insertion line.)
  muts.push(mutIr(
    'table.insertBefore(el, _irNoticeAnchor_(table));',
    'table.parentNode.insertBefore(el, table);',
    'X3 moving the banner host back into the gap is caught',
    function (src) {
      var L = layoutHarness(src);
      var host = L.api.host();
      return host.parentNode !== L.dom.table;
    }));

  // X4 — the wholesale innerHTML write that erased the other banners.
  // X4 — the original wholesale-innerHTML defect. Anchor updated for R2: the `if (_irSearch.stale)` branch is
  // gone with the banner, so the mutant now attacks the removal pass directly — a producer that clears the
  // whole host instead of only its own node must still be caught.
  muts.push(mutIr(
    "    var existing = host.querySelector ? host.querySelector('.replen-search-stale') : null;",
    "    host.innerHTML = ''; var existing = host.querySelector ? host.querySelector('.replen-search-stale') : null;",
    'X4 a wholesale host write that erases another producer is caught',
    function (src) {
      var L = layoutHarness(src);
      var host = L.api.host();
      host.insertAdjacentHTML('afterbegin', '<div class="replen-unsaved-banner">unsaved</div>');
      L.search.stale = true; L.api.stale();
      return !host.querySelector('.replen-unsaved-banner');
    }));

  // X5 — the F1A stamp comparison made tautological.
  muts.push(mutIr(
    "return st.appliedScopeKey === _irAppliedScopeKey_();",
    "return st.appliedScopeKey === st.appliedScopeKey;",
    'X5 a tautological scope-stamp comparison is caught',
    function (src) {
      var h = makeIrHarness({}, src);
      if (h.loadError) return true;
      return Promise.resolve(h.run('_irBootstrapScope_()')).then(function () {
        return settle().then(function () {
          h.pick(US); h.run('searchReplenishment()');
          return settle().then(function () {
            return h.run('_irResultMatchesAppliedScope_({ appliedScopeKey: "zz|NOPE" })') === true;
          });
        });
      });
    }));

  // X6 — the reserved scrollbar gutter removed.
  muts.push(Promise.resolve().then(function () {
    var mutated = CSS.replace(/\n\s*scrollbar-gutter:\s*stable;[^\n]*/, '');
    var i = mutated.indexOf('#ops-section .replen-category-rail {');
    var o = mutated.indexOf('{', i), c = mutated.indexOf('}', o);
    var caught = i !== -1 && !/scrollbar-gutter:\s*stable/.test(mutated.slice(o, c));
    ok(caught, 'X-X6 removing the reserved scrollbar gutter is caught');
    if (!caught) survivors.push('X6');
  }));

  // X7 — the two gap declarations allowed to diverge again.
  muts.push(Promise.resolve().then(function () {
    var mutated = CSS.replace('margin-bottom: var(--space-lg, 1.5rem);', 'margin-bottom: 18px;');
    function block(src, sel) { var i = src.indexOf(sel); if (i === -1) return ''; var o = src.indexOf('{', i), c = src.indexOf('}', o); return src.slice(o, c); }
    var a = (block(mutated, '#ops-section .replen-control-panel {').match(/margin-bottom:\s*([^;]+);/) || [])[1];
    var b = (block(mutated, '#ops-section .replen-category-shell {').match(/margin-bottom:\s*([^;]+);/) || [])[1];
    var caught = String(a).trim() !== String(b).trim();
    ok(caught, 'X-X7 letting the two gap declarations diverge is caught');
    if (!caught) survivors.push('X7');
  }));

  return Promise.all(muts).then(function () {
    eq(survivors, [], 'X0  NO mutant survived');
  });
}));

Promise.all(checks).then(function () {
  console.log('\nPASS ' + passed + '  FAIL ' + failed);
  if (failed) process.exitCode = 1;
}, function (e) {
  console.log('FAIL harness threw: ' + (e && e.stack || e));
  process.exitCode = 1;
});
