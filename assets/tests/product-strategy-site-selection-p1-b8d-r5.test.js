/**
 * ==================================================================================================
 * PRODUCT STRATEGY — THE UNIVERSE ARRIVED AND NOTHING COULD USE IT          (P1-B8D-R5)
 * ==================================================================================================
 *
 * P1-B8D-R4 gave the capability mirror a producer, shipped, and the live page stopped saying
 * FEATURE_DISABLED. It then said this, on all six sub-tabs, for ever:
 *
 *     Choose a site to analyse.
 *     This board reads one site at a time — a company, a country and a marketplace — because
 *     prices from two sites on one axis would compare products that do not compete.
 *
 * AND THERE WAS NOTHING TO CHOOSE WITH. `productPricing.siteUniverse.get` was sent, answered, and
 * adapted: ten READY sites, three companies. `SU.narrow` computed the option lists for all three
 * tiers. The page then rendered a sentence asking the operator to pick one and NO CONTROL OF ANY
 * KIND — zero `<select>` elements on the document.
 *
 * THE SAME SHAPE AS LAST ROUND, ONE LAYER OUT. R4's mirror was a gate with no producer. This is a
 * STATE WITH NO EXIT: `AWAITING_SITE_SELECTION` is left only by `C.select(scope)`, and the only
 * production caller of `C.select` is the initial `C.select({})` inside `loadUniverseResolved`.
 * Nothing a person can click reaches it.
 *
 * WHY THE SELECTOR LOOKED PRESENT. The partial HAS a `#scope` host and `psb-board-ui.js` HAS a
 * Company → Country → Marketplace ladder. They are not this ladder. The board's one is derived from
 * the LOADED ROWS and is rendered by `renderScope()`, reachable only from `render()`, reachable only
 * from `boot()`, reachable only from `board.mount({adapter})` — which happens after `workspace.get`
 * succeeds. The control that would let you choose a site only exists once you have chosen one.
 *
 * WHY EVERY SUITE PASSED, AGAIN. Every suite hands the controller a scope:
 * `PAGE.mount({ scope: { company: 'KM', country: 'US', marketplace: 'Shopify' } })`. Production's
 * only caller is `P.onMount`, which passes `{ route: wanted }` and NO SCOPE. A harness that supplies
 * the one input production never supplies cannot fail for the one reason production fails — the same
 * sentence as R4, about a different input.
 *
 * TWO SMALLER FINDINGS OF THE SAME FAMILY, both reproduced here:
 *
 *   · SUB-TABS 2..6 ARE NO-OPS. `showProductStrategyView` records `KM.pendingRoute` and calls
 *     `showSection`, which calls `lifecycle.switchTo` — which returns immediately when the section is
 *     already current ("re-click current page must not duplicate mount"). `pendingRoute` is consumed
 *     only by `onMount`. So the first click works and the next five set a variable nobody reads.
 *   · PRESENTATION IS UNBOUND UNTIL A BOARD MOUNTS. `on('btnPresent', …)` lives inside `boot()`.
 *     With no workspace there is no listener, which is CORRECT — §6 forbids pretending — but it is
 *     also why the operator saw a button that did nothing.
 *
 * WHAT THIS SUITE HOLDS. The chooser is rendered by the PAGE, from the UNIVERSE, into a host the
 * board does not own; its options are exactly the universe's; a selection outside the universe is
 * refused; completing the scope reads the workspace exactly once; re-picking the same site reads
 * nothing; a stale answer never lands on a newer selection; and no harness in this file ever hands
 * the controller a scope.
 * ==================================================================================================
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var pass = 0, fail = 0, neg = { caught: 0, missed: 0 };
function ok(c, l, extra) {
  if (c) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + (extra === undefined ? '' : '\n  got ' + JSON.stringify(extra))); }
}
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(t) { console.log('\n== ' + t + ' =='); }
function score(label, r) {
  if (r === true) { neg.caught++; pass++; console.log('ok   ' + label + ' (caught)'); }
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}
/** For a probe that must await the wire. Returns a promise the caller MUST chain. */
function mutP(label, f) {
  var r;
  try { r = f(); } catch (e) {
    neg.missed++; fail++;
    console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message));
    return Promise.resolve();
  }
  return Promise.resolve(r).then(function (v) { score(label, v); },
    function (e) {
      neg.missed++; fail++;
      console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message));
    });
}

var ROOT = path.join(__dirname, '..', '..');
/* LINE ENDINGS NORMALIZED ON READ. `core.autocrlf=true` means the working tree can be CRLF while
   the blob is LF, and every multi-line mutant anchor below would then match zero times — which
   `withMutant` reports as an ANCHOR error about a rule that is in fact perfectly guarded. The
   harness normalizes for the same reason, and this file reads the same files. */
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
}
var H = require(path.join(__dirname, '_psb-harness.js'));
var CAP = require(path.join(__dirname, '_p1b8c-r2-live-derived.js'));

var SRC = {
  page: read('assets/js/pages/product-strategy-board.js'),
  partial: read('assets/html/pages/product-strategy-board.html'),
  app: read('assets/js/app.js'),
  board: read('assets/js/product-strategy/psb-board-ui.js'),
  replay: read('assets/tests/_p1b8c-replay.js'),
  runner: read('assets/tests/_p1b8c-visual-runner.js'),
  universe: read('assets/js/product-strategy/km-product-strategy-site-universe.js')
};

/* THE TWO SENTENCES OFF THE SCREENSHOT, spelled once. "Reproduced the live failure" has to mean the
   same characters, not a similar-looking state. */
/* P1-B8D-R7 MOVED THE EXPLANATION AND KEPT THE INSTRUCTION.
   The state used to carry a headline and a two-line paragraph about why a board reads one site at
   a time. The paragraph is correct and answers a question a person asks once; standing permanently
   above the three controls it explained, it was the largest block on the page. It now lives behind
   the header's `i` button, and what remains here is the one sentence that says what to do next —
   which is why this constant is an instruction rather than a description. The paragraph is asserted
   where it now is, by product-strategy-final-usability-p1-b8d-r7. */
var LIVE_HEADLINE = 'Select a company, country and marketplace to begin.';

/* ------------------------------------------------------------------------------------------------
   ONE REALM, GLOBAL SCOPE — and this is load-bearing rather than convenient.

   `km-product-pricing-workspace.js` validates the universe with `d.sites instanceof Array`. A `vm`
   context has its own `Array`, so a capture created in this realm and validated in that one fails
   with RESPONSE_MISSING_SITES — a refusal no browser can produce. The first version of this file's
   probe did exactly that and "reproduced" a SOURCE_NOT_CONNECTED that does not exist. The page
   modules are therefore loaded into THIS realm's global scope, the way a browser loads them.
   ------------------------------------------------------------------------------------------------ */
var MODULES = [
  'assets/js/product-strategy/psb-data-contract.js',
  'assets/js/product-strategy/psb-chart-layout.js',
  'assets/js/product-strategy/psb-selectors.js',
  'assets/js/product-strategy/psb-views.js',
  'assets/js/product-strategy/psb-board-ui.js',
  'assets/js/product-strategy/km-product-strategy-site-universe.js',
  'assets/js/api/km-product-pricing-adapter.js',
  'assets/js/product-strategy/km-product-strategy-live-adapter.js',
  /* P1-B8D-R10A — THE TRANSPORT IS PART OF THE PRODUCTION PAGE, and this list did not have it.
     index.html loads km-transport.js before the accessor, and every Product Strategy read goes
     through it. Omitting it here was invisible only because the accessor carried a POST fallback;
     R10A removed that, and this sandbox went red — correctly, because it was modelling a page that
     cannot exist. Loaded first, as index.html loads it. */
  'assets/js/api/km-transport.js',
  'assets/js/api/km-product-pricing-workspace.js',
  'assets/js/pages/product-strategy-board.js'
];
function loadInto(rel, src) {
  vm.runInThisContext(src === undefined ? read(rel) : src, { filename: rel });
}
global.window = global;
global.PSB_BOARD_DEFER = true;          // no fixture is loaded, but say so rather than rely on it
global.ResizeObserver = function () { this.observe = function () {}; this.disconnect = function () {}; };
global.requestAnimationFrame = function (fn) { return typeof fn === 'function' ? 0 : 0; };
global.print = function () { global.__printed = (global.__printed || 0) + 1; };
MODULES.forEach(function (m) { loadInto(m); });

var partialSkeleton = H.productionSkeleton(SRC.partial);

/** Reload every module from disk, undoing any mutant. */
function restoreModules() { MODULES.forEach(function (m) { loadInto(m); }); }

/**
 * THE COUNTING SOCKET. It serves the real captured universe and the real captured workspaces, and
 * it records every action. It NEVER pre-selects anything: the only way past
 * AWAITING_SITE_SELECTION is a call the page itself makes because something on screen was used.
 */
function countingApi(opts) {
  opts = opts || {};
  var calls = [];
  var universe = opts.universe !== undefined ? opts.universe : CAP.universeEnvelope();
  var workspaces = CAP.workspaces();
  var api = {
    transport: {
      post: function (dto) {
        var action = dto && dto.action;
        calls.push(String(action));
        if (typeof opts.before === 'function') {
          var pre = opts.before(action, dto, calls.length);
          if (pre !== undefined) return pre;
        }
        if (action === 'system.health') {
          return Promise.resolve({ success: true, ok: true, product_strategy_enabled: true });
        }
        if (action === 'productPricing.siteUniverse.get') return Promise.resolve(universe);
        if (action === 'productPricing.workspace.get') {
          var p = (dto && dto.payload) || {};
          var s = (p.scope) || p;
          var key = [s.company, s.country, s.marketplace].join('|');
          var env = workspaces[key];
          if (!env) return Promise.reject(new Error('NO CAPTURE FOR SITE: ' + key));
          return Promise.resolve(env);
        }
        return Promise.reject(new Error('UNSERVED ACTION: ' + action));
      },
      safeReadJsonResponse: function (v) { return v; },
      configured: function () { return true; }
    }
  };
  /* P1-B8D-R10A — THE DOOR THE ACCESSOR NOW USES.

     R10A removed the last Product Strategy caller of `KM.api.transport.post`, so a socket offering
     only `post` records nothing and the page refuses before sending. `request` serves the SAME
     envelopes from the SAME capture — one source of answers, reached the way production reaches it.
     A capture miss still rejects, because that is a harness error and should be loud. */
  var transport = {
    request: function (o) {
      var dto = (o && o.payload) || {};
      return Promise.resolve(api.transport.post({ action: o && o.action, payload: dto.payload || dto }))
        .then(function (env) { return { success: true, envelope: env }; },
          function (err) { return Promise.reject(err); });
    }
  };
  return {
    api: api,
    transport: transport,
    calls: calls,
    countOf: function (a) { return calls.filter(function (c) { return c === a; }).length; },
    writeShaped: function () {
      return calls.filter(function (c) { return !/\.get$/.test(c) && c !== 'system.health'; });
    }
  };
}

/**
 * ONE PAGE LIFE, THROUGH THE PRODUCTION ENTRY.
 *
 * `P.onMount` calls `P.mount({ route: wanted })`. Not `{ scope: … }` — that argument exists and no
 * production caller passes it, which is the whole finding. Nothing here passes it either.
 */
function live(opts) {
  opts = opts || {};
  var dom = H.makeDom(partialSkeleton);
  var t = countingApi(opts);
  var ACC = global.KM.productPricingWorkspace;
  ACC.setCapability({});                 // a module singleton must not carry the last scenario's server
  var saved = { KM: global.KM, doc: global.document };
  global.document = dom.document;
  global.KM = { api: t.api, transport: t.transport, productPricingWorkspace: ACC,
    pages: saved.KM && saved.KM.pages, lifecycle: saved.KM && saved.KM.lifecycle };
  var P = global.KM.pages.productStrategyBoard;
  var BOARD = global.PSB_BOARD;

  function txt(id) {
    var n = dom.document.getElementById(id);
    return n ? String(n.textContent || '').replace(/\s+/g, ' ').trim() : null;
  }
  function fieldsOf() {
    var host = dom.document.getElementById('psb-site-host');
    if (!host) return null;
    return host.querySelectorAll('select').map(function (s) {
      return {
        dim: s.getAttribute('data-psb-site-dim'),
        value: s.value,
        disabled: !!s.disabled,
        options: s.childNodes.filter(function (o) { return o.tagName === 'OPTION'; })
          .map(function (o) { return o.getAttribute('value'); })
      };
    });
  }
  function pick(dim, value) {
    var host = dom.document.getElementById('psb-site-host');
    if (!host) return Promise.reject(new Error('NO SITE HOST'));
    var sel = host.querySelector('[data-psb-site-dim="' + dim + '"]');
    if (!sel) return Promise.reject(new Error('NO CONTROL FOR DIMENSION: ' + dim));
    sel.value = value;
    var ev = new dom.Event('change');
    sel.dispatchEvent(ev);
    return Promise.resolve(P.lastSelection);
  }

  var api = {
    dom: dom, P: P, board: BOARD, calls: t.calls, t: t,
    txt: txt, fields: fieldsOf, pick: pick,
    controller: function () { return P.lastController; },
    stateText: function () { return txt('psb-state-host'); },
    selects: function () { return dom.document.querySelectorAll('select').length; },
    siteHost: function () { return dom.document.getElementById('psb-site-host'); },
    release: function () { global.KM = saved.KM; global.document = saved.doc; }
  };
  return P.mount({ route: opts.route || '' }).then(function (res) {
    api.result = res;
    return api;
  });
}

/** Run a page life, hand it to `fn`, and always release the globals. */
function withLive(opts, fn) {
  return live(opts).then(function (L) {
    return Promise.resolve(fn(L)).then(
      function (v) { L.release(); return v; },
      function (e) { L.release(); throw e; });
  });
}

/** Load a mutated module, run a probe, then put every module back. */
function withMutant(rel, from, to, probe) {
  var src = read(rel);
  var n = src.split(from).length - 1;
  if (n !== 1) throw new Error('ANCHOR MATCHED ' + n + ' TIMES in ' + rel);
  loadInto(rel, src.replace(from, to));
  return Promise.resolve()
    .then(probe)
    .then(function (v) { restoreModules(); return v; },
      function (e) { restoreModules(); throw e; });
}

var PENDING = Promise.resolve();
function step(fn) { PENDING = PENDING.then(fn); }

// =================================================================================================
section('A — THE LIVE SCREEN, REPRODUCED THROUGH THE PRODUCTION ENTRY');
// =================================================================================================

/* THE PRODUCTION CALLER PASSES NO SCOPE, AND THIS IS READ OUT OF THE SOURCE rather than asserted
   about the source. If a later round starts passing one, this is the assertion that argues. */
ok(/P\.mount\(\{\s*route:\s*wanted\s*\}\)/.test(SRC.page),
  'A1  the production mount passes a ROUTE and no scope');
ok(!/P\.mount\(\{[^}]*scope:/.test(SRC.page),
  'A2  and there is no production call site that supplies one');

step(function () {
  return withLive({}, function (L) {
    var C = L.controller();
    eq(C.requests.siteUniverse, 1, 'A3  the universe IS read — exactly once');
    eq(C.requests.workspace, 0, 'A4  and the workspace is not, because no site was chosen');
    eq(C.universe.state, 'OK', 'A5  the universe answered OK');
    eq(C.universe.sites.length, 10, 'A6  with the ten live sites');
    eq(C.narrowed.complete, false, 'A7  and three companies cannot narrow to one site on their own');
    var head = L.dom.document.querySelector('.psb-state__headline');
    eq(head && String(head.textContent), LIVE_HEADLINE, 'A8  the live headline, character for character');
    /* AND NOTHING BELOW IT. A state that asks for an action is one sentence; the reasoning behind
       the rule is a disclosure, not a standing notice (P1-B8D-R7 §8). */
    var det = L.dom.document.querySelector('.psb-state__detail');
    eq(det, null, 'A9  and no standing paragraph under it',
      det && String(det.textContent).slice(0, 60));
  });
});

// =================================================================================================
section('B — THE OPTIONS EXISTED ALL ALONG');
// =================================================================================================

step(function () {
  return withLive({}, function (L) {
    var C = L.controller();
    eq(C.narrowed.options.company, ['KM', 'ResTW', 'ResUS'],
      'B1  narrow() computed the company options before anything was rendered');
    ok(C.narrowed.options.country.length === 0,
      'B2  and country is empty until a company is chosen, which is the ladder working');
    /* THE FINDING, STATED AS A NUMBER. Ten sites, three choices, nothing to click. */
    ok(L.siteHost() !== null, 'B3  the page has a site-selection host of its own');
    ok(L.selects() > 0, 'B4  and the screen asking for a site offers at least one control',
      { selects: L.selects() });
  });
});

// =================================================================================================
section('C — THE CHOOSER IS THE UNIVERSE, AND NOTHING ELSE');
// =================================================================================================

step(function () {
  return withLive({}, function (L) {
    var f = L.fields();
    ok(f !== null && f.length >= 1, 'C1  the chooser renders into the page-owned host');
    var byDim = {};
    (f || []).forEach(function (x) { byDim[x.dim] = x; });
    ok(!!byDim.company, 'C2  Company is a real control while three companies are on offer');
    eq(byDim.company ? byDim.company.options.filter(function (v) { return v !== ''; }) : null,
      ['KM', 'ResTW', 'ResUS'], 'C3  its options are the universe companies and only those');
    ok(byDim.company && byDim.company.options.indexOf('') === 0,
      'C4  led by an unchosen placeholder — the page never picks for the operator');
    ok(!byDim.country || byDim.country.disabled === true,
      'C5  Country cannot be used before Company, rather than offering every country');
  });
});

/* NO HARD-CODED SITE ANYWHERE IN THE PAGE. The live universe happens to start with KM/US/Shopify and
   a default that spelled it would pass every test in this file while being exactly the forbidden
   thing. Read as code so a comment naming the site is not a failure. */
var pageCode = SRC.page.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
ok(!/['"]Shopify['"]/.test(pageCode), 'C6  the page names no marketplace in its code');
ok(!/['"]KM['"]/.test(pageCode), 'C7  it names no company');
ok(!/['"]US['"]/.test(pageCode), 'C8  and no country');
ok(!/location\.(search|href|hash)|URLSearchParams|localStorage|sessionStorage/.test(pageCode),
  'C9  and it reads no URL and no browser storage to decide a site');

// =================================================================================================
section('D — CHOOSING CONVERGES, AND READS ONCE');
// =================================================================================================

step(function () {
  return withLive({}, function (L) {
    return L.pick('company', 'ResTW').then(function () {
      var C = L.controller();
      eq(C.narrowed.scope.company, 'ResTW', 'D1  the choice is taken');
      eq(C.requests.workspace, 0, 'D2  and no workspace read yet — the scope is still incomplete');
      var byDim = {};
      (L.fields() || []).forEach(function (x) { byDim[x.dim] = x; });
      eq(byDim.country ? byDim.country.options.filter(function (v) { return v !== ''; }) : null,
        ['AU', 'CA', 'EU', 'JP', 'UK'], 'D3  Country has re-converged onto that company');
      return L.pick('country', 'AU');
    }).then(function () {
      var C = L.controller();
      eq(C.narrowed.scope, { company: 'ResTW', country: 'AU', marketplace: 'Amazon' },
        'D4  one marketplace on that country resolves itself — a fact is not a choice');
      eq(C.requests.workspace, 1, 'D5  and THAT completes the scope: exactly one workspace read');
      eq(L.t.countOf('productPricing.workspace.get'), 1, 'D6  exactly one on the wire, too');
      ok(C.mounted === true, 'D7  the board mounted', { state: C.state });
    });
  });
});

step(function () {
  return withLive({}, function (L) {
    return L.pick('company', 'KM').then(function () {
      eq(L.controller().narrowed.scope,
        { company: 'KM', country: 'US', marketplace: null },
        'D8  one country under KM resolves itself and marketplace stays open');
      eq(L.controller().requests.workspace, 0, 'D9  still no read — two of three is not a scope');
      return L.pick('marketplace', 'Target');
    }).then(function () {
      eq(L.controller().narrowed.scope,
        { company: 'KM', country: 'US', marketplace: 'Target' }, 'D10 the third tier completes it');
      eq(L.controller().requests.workspace, 1, 'D11 one read');
      /* THE SAME SITE AGAIN IS NOT A NEW QUESTION. */
      return L.pick('marketplace', 'Target');
    }).then(function () {
      eq(L.controller().requests.workspace, 1,
        'D12 re-picking the SAME site reads nothing — a repeat click is not an unbounded request');
      return L.pick('marketplace', 'Walmart');
    }).then(function () {
      eq(L.controller().requests.workspace, 2, 'D13 a DIFFERENT site does read again');
      eq(L.controller().narrowed.scope.marketplace, 'Walmart', 'D14 and the scope followed it');
    });
  });
});

// =================================================================================================
section('E — MEMBERSHIP, STALENESS, AND FAILING CLOSED');
// =================================================================================================

step(function () {
  return withLive({}, function (L) {
    return L.pick('company', 'NotACompany').then(function () {
      var C = L.controller();
      ok(C.narrowed.scope.company === null,
        'E1  a company outside the universe is refused, not adopted', C.narrowed.scope);
      eq(C.requests.workspace, 0, 'E2  and nothing is read for it');
    });
  });
});

/* A STALE ANSWER MUST NOT LAND ON A NEWER SELECTION. The first workspace read is held open until the
   second has been made, then released — the exact order that puts one site's rows under another
   site's heading. */
step(function () {
  var releaseFirst = null;
  return withLive({
    before: function (action, dto, nth) {
      if (action !== 'productPricing.workspace.get') return undefined;
      if (nth && releaseFirst === null) {
        var p = (dto && dto.payload) || {};
        var s = p.scope || p;
        if (s.marketplace === 'Shopify') {
          return new Promise(function (res) {
            releaseFirst = function () {
              res(CAP.workspaces()[[s.company, s.country, s.marketplace].join('|')]);
            };
          });
        }
      }
      return undefined;
    }
  }, function (L) {
    return L.pick('company', 'KM')
      .then(function () { L.pick('marketplace', 'Shopify'); return null; })   // deliberately not awaited
      .then(function () { return L.pick('marketplace', 'Walmart'); })
      .then(function () {
        if (releaseFirst) releaseFirst();
        return new Promise(function (r) { setTimeout(r, 10); });
      })
      .then(function () {
        var C = L.controller();
        eq(C.narrowed.scope.marketplace, 'Walmart',
          'E3  the newer selection is the one on screen');
        ok(C.dropped >= 1, 'E4  and the older answer was DROPPED rather than rendered',
          { dropped: C.dropped });
      });
  });
});

/* FAIL CLOSED. A universe that cannot be read offers no controls at all — an empty chooser beside a
   "could not read" notice is the shape that reads as success. */
step(function () {
  return withLive({ universe: { success: false, data: null, meta: {}, errors: [{ code: 'BOOM' }] } },
    function (L) {
      var C = L.controller();
      ok(C.universe.state !== 'OK', 'E5  an unreadable universe is not OK', C.universe.state);
      eq(L.selects(), 0, 'E6  and NO control is offered over a list that was never read');
      eq(C.requests.workspace, 0, 'E7  and nothing is read on its behalf');
    });
});

// =================================================================================================
section('F — SIX VIEWS, SIX DIFFERENT PAGES');
// =================================================================================================

var ROUTES = ['product-strategy/overview', 'product-strategy/category', 'product-strategy/risk',
  'product-strategy/quality', 'product-strategy/workspace', 'product-strategy/advanced'];

function viewSignature(dom) {
  var v = dom.document.getElementById('view');
  var t = v ? String(v.textContent || '') : '';
  var tags = [];
  (function walk(n) {
    (n.childNodes || []).forEach(function (c) {
      if (c.tagName) { tags.push(c.tagName + (c.className ? '.' + c.className : '')); walk(c); }
    });
  }(v || { childNodes: [] }));
  return { len: t.length, nodes: tags.length, text: t.replace(/\s+/g, ' ').trim(),
    shape: tags.join('>') };
}

step(function () {
  return withLive({}, function (L) {
    return L.pick('company', 'KM')
      .then(function () { return L.pick('marketplace', 'Shopify'); })
      .then(function () {
        ok(L.controller().mounted === true, 'F0  a site is loaded before any view is asked for');
        var sigs = ROUTES.map(function (r) {
          L.P.applyRoute(r, L.board);
          return { route: r, sig: viewSignature(L.dom), current: L.P.currentRoute(L.board) };
        });
        sigs.forEach(function (s, i) {
          eq(s.current, ROUTES[i], 'F1.' + (i + 1) + ' ' + ROUTES[i].split('/')[1] + ' is the showing route');
        });
        var shapes = sigs.map(function (s) { return s.sig.shape; });
        var distinctShapes = shapes.filter(function (v, i) { return shapes.indexOf(v) === i; });
        eq(distinctShapes.length, 6, 'F2  the six views render six DIFFERENT DOM shapes');
        var texts = sigs.map(function (s) { return s.sig.text; });
        var distinctText = texts.filter(function (v, i) { return texts.indexOf(v) === i; });
        eq(distinctText.length, 6, 'F3  and six different bodies of text');
        sigs.forEach(function (s, i) {
          ok(s.sig.nodes > 0, 'F4.' + (i + 1) + ' ' + ROUTES[i].split('/')[1] + ' rendered something',
            s.sig.nodes);
        });
        /* THE HEADINGS, SEPARATELY FROM THE SHAPES. Two views could differ in node count while
           presenting themselves under the same title, which is the version of this defect a reader
           would actually meet: six tabs, six renders, one page. */
        var heads = ROUTES.map(function (r) {
          L.P.applyRoute(r, L.board);
          var v = L.dom.document.getElementById('view');
          /* H2 BEFORE H3, AND THE ORDER IS THE ASSERTION. `h3` is a product card — "Cutting Board"
             is the first one in three of the six views — so reading it first compares the data
             rather than the view and reports six distinct pages as duplicates. `h2` is the section
             title, which is what "this view's own heading" means. */
          var h = v && (v.querySelector('h2') || v.querySelector('h3') || v.querySelector('.card-title')
            || v.querySelector('.kpi-label'));
          return h ? String(h.textContent || '').replace(/\s+/g, ' ').trim() : '';
        });
        var distinctHeads = heads.filter(function (v, i) { return heads.indexOf(v) === i; });
        ok(heads.every(function (h) { return h !== ''; }),
          'F2a every view leads with a heading of its own', heads);
        eq(distinctHeads.length, 6, 'F2b and the six headings are six different sentences');

        /* NOT A NUMBER THAT LEAKED OUT OF A CALCULATION. */
        var all = texts.join(' ');
        ok(all.indexOf('NaN') < 0, 'F5  no NaN on any of the six');
        ok(all.indexOf('undefined') < 0, 'F6  no undefined');
        ok(all.indexOf('[object Object]') < 0, 'F7  no [object Object]');
        /* THE SHARED STATE HOST IS EMPTY WHILE A BOARD IS SHOWING. */
        eq(L.txt('psb-state-host'), '', 'F8  and the shared state host is not covering any of them');
        /* CATEGORY ANALYSIS HAS A CHART; the other five are not therefore allowed to be empty, which
           F4 already said. */
        L.P.applyRoute('product-strategy/category', L.board);
        var svg = L.dom.document.querySelectorAll('svg');
        ok(svg.length > 0, 'F9  Category Analysis draws an actual chart', { svg: svg.length });
      });
  });
});

// =================================================================================================
section('G — PRESENTATION IS A STATE, NOT A CLASS');
// =================================================================================================

step(function () {
  return withLive({}, function (L) {
    return L.pick('company', 'KM')
      .then(function () { return L.pick('marketplace', 'Shopify'); })
      .then(function () {
        var btn = L.dom.document.getElementById('btnPresent');
        ok(!!btn, 'G1  the Presentation control exists');
        ok(((btn.listeners && btn.listeners.click) || []).length > 0,
          'G2  and a loaded board binds it');
        var before = String(L.dom.document.body.className || '');
        btn.dispatchEvent(new L.dom.Event('click'));
        var during = String(L.dom.document.body.className || '');
        ok(during !== before, 'G3  clicking it CHANGES the page, not just the button',
          { before: before, during: during });
        ok(during.indexOf('presenting') >= 0, 'G4  into presentation mode', during);
        btn.dispatchEvent(new L.dom.Event('click'));
        var after = String(L.dom.document.body.className || '');
        eq(after, before, 'G5  and the same control brings it back');
      });
  });
});

/* THE KEYBOARD CONTRACT AS IT ALREADY STANDS, not one invented here. psb-board-ui.js is explicit:
   "ESCAPE LEAVES FULLSCREEN, and it is checked before the popovers because it is the bigger thing to
   be inside". Presentation has no Escape binding and is left with the same control that entered it,
   which G5 holds. Asserting an Escape-exits-Presentation rule would be writing a new contract in a
   test and calling the existing behaviour a regression. */
step(function () {
  return withLive({}, function (L) {
    return L.pick('company', 'KM')
      .then(function () { return L.pick('marketplace', 'Shopify'); })
      .then(function () {
        /* P1-B8D-R9 - G7 STANDS; G8 AND G9 GO BACK TO WHAT THEY SAID BEFORE R8.

           R8 read `不只是隱藏 Fullscreen 單一按鈕` as a decision about the whole row and removed all
           nine controls. R9 corrects it in one line - `只移除 Fullscreen 按鈕。其他工具列控制恢復。`
           - so Auto Fit, Comfortable, Clean, Detail, Layers, Size and Reset view are on the
           production board again and Fullscreen is not.

           THE ASSERTION THAT WAS ACTUALLY ABOUT THE DEFECT IS THE ONE THAT DID NOT MOVE. G7 has
           said the same thing through both readings, because in both of them the control that
           replaces the PAGE - covering the shell's own header and navigation from inside a page -
           is the one that does not belong on this board. The two that moved were statements about
           how much went with it, and they follow the correction. */
        var doc = L.dom.document;
        ok(!doc.getElementById('mode-fullscreen'),
          'G7  the fullscreen control is NOT on the production board (R8, kept by R9)');
        ok(!!doc.getElementById('chartControls'),
          'G8  but the row that held it is back (R9 §4)');
        ok(doc.querySelectorAll('.chartctl button').length >= 6,
          'G9  carrying the controls that size and layer the chart',
          doc.querySelectorAll('.chartctl button').length);
        eq([].slice.call(doc.querySelectorAll('.chartctl button')).filter(function (b) {
          return /fullscreen/i.test((b.textContent || '') + (b.id || ''));
        }).length, 0, 'G9a and not one of them is a fullscreen control');
      });
  });
});

/* NO BOARD, NO PRETENCE. */
step(function () {
  return withLive({}, function (L) {
    var btn = L.dom.document.getElementById('btnPresent');
    btn.dispatchEvent(new L.dom.Event('click'));
    ok(String(L.dom.document.body.className || '').indexOf('presenting') < 0,
      'G6  with no workspace, Presentation does not pretend to open');
  });
});

// =================================================================================================
section('H — THE SIDEBAR SUB-TABS');
// =================================================================================================

/* THE NO-OP, NAMED. `switchTo` returns early for the current page — correctly, it must not double
   mount — and `pendingRoute` is read only by `onMount`. Something must apply the route when the
   section is already showing, or five of the six sidebar children do nothing at all. */
ok(/if \(currentPage === pageName\)/.test(read('assets/js/core/lifecycle.js')),
  'H1  switchTo refuses to re-mount the current page');
ok(/KM\.pendingRoute/.test(SRC.page), 'H2  and the page consumes pendingRoute on mount');
var appCode = SRC.app.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
ok(/function showProductStrategyView/.test(appCode), 'H3  the sidebar children call one entry point');
ok(/applyRoute/.test(appCode),
  'H4  which applies the route itself when the section is ALREADY the current one');

// =================================================================================================
section('I — MUTANTS');
// =================================================================================================

var PAGE_REL = 'assets/js/pages/product-strategy-board.js';
var BOARD_REL = 'assets/js/product-strategy/psb-board-ui.js';

/* I1 — the chooser is never rendered: the universe arrives and the page draws only the sentence.
   This is the live defect itself, held as a mutant so it cannot come back quietly. */
step(function () {
  return mutP('I1  the universe arrives and nothing is rendered from it', function () {
    return withMutant(PAGE_REL, 'P.renderSiteChooser(siteHost, C.narrowed, onPick, doc);', 'void 0;', function () {
      return withLive({}, function (L) { return L.selects() === 0; })
        .then(function (v) { return v === true; });
    });
  });
});

/* I2 — a selection outside the universe is adopted. */
step(function () {
  return mutP('I2  a site that is not in the universe is adopted', function () {
    return withMutant('assets/js/product-strategy/km-product-strategy-site-universe.js',
      'if (wantCompany !== \'\' && options.company.indexOf(wantCompany) >= 0) {',
      'if (wantCompany !== \'\') {',
      function () {
        return withLive({}, function (L) {
          return L.pick('company', 'NotACompany').then(function () {
            return L.controller().narrowed.scope.company === 'NotACompany';
          });
        });
      });
  });
});

/* I3 — the chooser keeps the selection null however the operator uses it. */
step(function () {
  return mutP('I3  ten sites are offered and the selection stays null', function () {
    return withMutant(PAGE_REL, 'C.select(next)', 'C.select({})', function () {
      return withLive({}, function (L) {
        return L.pick('company', 'KM').then(function () {
          return L.controller().narrowed.scope.company === null;
        });
      });
    });
  });
});

/* I4 — a hard-coded default site. It would render a board on the live universe and be the exact
   forbidden thing; the source assertions C6..C8 are what catch it. */
step(function () {
  return mutP('I4  a default site is hard-coded into the page', function () {
    return withMutant(PAGE_REL, 'return C.select(isObj(opts.scope) ? opts.scope : {});',
      'return C.select(isObj(opts.scope) ? opts.scope : { company: \'KM\', country: \'US\', marketplace: \'Shopify\' });',
      function () {
        var mutated = read(PAGE_REL).replace('return C.select(isObj(opts.scope) ? opts.scope : {});',
          'return C.select(isObj(opts.scope) ? opts.scope : { company: \'KM\', country: \'US\', marketplace: \'Shopify\' });');
        var code = mutated.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
        return /['"]Shopify['"]/.test(code) && /['"]KM['"]/.test(code);
      });
  });
});

/* I5 — changing the site does not re-read the workspace. */
step(function () {
  return mutP('I5  switching site does not read the new one', function () {
    return withMutant(PAGE_REL, 'return C.loadWorkspace();',
      'return C.mounted ? Promise.resolve({ state: C.state, mounted: true }) : C.loadWorkspace();',
      function () {
        return withLive({}, function (L) {
          return L.pick('company', 'KM')
            .then(function () { return L.pick('marketplace', 'Shopify'); })
            .then(function () { return L.pick('marketplace', 'Walmart'); })
            .then(function () { return L.controller().requests.workspace === 1; });
        });
      });
  });
});

/* I6 — a stale answer is rendered over a newer selection. */
step(function () {
  return mutP('I6  a superseded answer is rendered anyway', function () {
    return withMutant(PAGE_REL, 'if (myToken !== C.token) {', 'if (false) {', function () {
      var releaseFirst = null;
      return withLive({
        before: function (action, dto) {
          if (action !== 'productPricing.workspace.get') return undefined;
          var p = (dto && dto.payload) || {}; var s = p.scope || p;
          if (s.marketplace === 'Shopify' && releaseFirst === null) {
            return new Promise(function (res) {
              releaseFirst = function () {
                res(CAP.workspaces()[[s.company, s.country, s.marketplace].join('|')]);
              };
            });
          }
          return undefined;
        }
      }, function (L) {
        return L.pick('company', 'KM')
          .then(function () { L.pick('marketplace', 'Shopify'); return null; })
          .then(function () { return L.pick('marketplace', 'Walmart'); })
          .then(function () { if (releaseFirst) releaseFirst(); return new Promise(function (r) { setTimeout(r, 10); }); })
          .then(function () { return L.controller().dropped === 0; });
      });
    });
  });
});

/* I7 — all six routes dispatch the same renderer. */
step(function () {
  return mutP('I7  the six routes all render the same view', function () {
    return withMutant(BOARD_REL, 'showView: function (idOrRoute) { selectView(VIEWS.resolve(idOrRoute)); return STATE.view; },',
      'showView: function (idOrRoute) { selectView(VIEWS.resolve(\'overview\')); return STATE.view; },',
      function () {
        return withLive({}, function (L) {
          return L.pick('company', 'KM')
            .then(function () { return L.pick('marketplace', 'Shopify'); })
            .then(function () {
              var shapes = ROUTES.map(function (r) {
                L.P.applyRoute(r, L.board);
                return viewSignature(L.dom).shape;
              });
              var d = shapes.filter(function (v, i) { return shapes.indexOf(v) === i; });
              return d.length < 6;
            });
        });
      });
  });
});

/* I8 — the shared state host stays over the board. */
step(function () {
  return mutP('I8  the state host is left covering the mounted board', function () {
    /* THE ANCHOR MOVED WITH P1-B8D-R7: `board.mount` now carries the three things this host
       declares about itself, so the single-line call this matched no longer exists. The mutant is
       unchanged in meaning — write a state over a board that has just mounted. */
    /* P1-B8D-R8 - RE-ANCHORED AGAIN, for the same kind of reason as last round: the mount
       and the flag moved into `mountBoard()`, which is now the one place a board is put up
       (a first load and a restored visit have to agree about what this host declares). The
       mutant is unchanged in meaning - write a state over a board that has just mounted. */
    var I8_ANCHOR = '      C.mounted = true;' + String.fromCharCode(10)
      + '      showBoardNotices();';
    return withMutant(PAGE_REL, I8_ANCHOR,
      I8_ANCHOR + String.fromCharCode(10)
      + '      show(P.AWAITING_SITE_SELECTION, P.UX_PAGE.AWAITING_SITE_SELECTION, []);',
      function () {
        return withLive({}, function (L) {
          return L.pick('company', 'KM')
            .then(function () { return L.pick('marketplace', 'Shopify'); })
            .then(function () { return L.txt('psb-state-host') !== ''; });
        });
      });
  });
});

/* I9 — the Presentation handler does nothing. */
step(function () {
  return mutP('I9  Presentation is bound to a no-op', function () {
    return withMutant(BOARD_REL, 'STATE.presentation = !STATE.presentation;\n      render();',
      '/* no-op */', function () {
        return withLive({}, function (L) {
          return L.pick('company', 'KM')
            .then(function () { return L.pick('marketplace', 'Shopify'); })
            .then(function () {
              var btn = L.dom.document.getElementById('btnPresent');
              var before = String(L.dom.document.body.className || '');
              btn.dispatchEvent(new L.dom.Event('click'));
              return String(L.dom.document.body.className || '') === before;
            });
        });
      });
  });
});

/* I10 — the button changes and the page does not. */
step(function () {
  return mutP('I10 only the control changes, the presentation state does not', function () {
    return withMutant(BOARD_REL, 'STATE.presentation = !STATE.presentation;\n      render();',
      'byId(\'btnPresent\').className += \' is-on\';', function () {
        return withLive({}, function (L) {
          return L.pick('company', 'KM')
            .then(function () { return L.pick('marketplace', 'Shopify'); })
            .then(function () {
              var btn = L.dom.document.getElementById('btnPresent');
              btn.dispatchEvent(new L.dom.Event('click'));
              return String(L.dom.document.body.className || '').indexOf('presenting') < 0;
            });
        });
      });
  });
});

/* I11 — a write-shaped action reaches the wire. */
step(function () {
  return mutP('I11 a write-shaped action is sent', function () {
    return withMutant('assets/js/api/km-product-pricing-workspace.js',
      "var SITE_UNIVERSE_ACTION = 'productPricing.siteUniverse.get';",
      "var SITE_UNIVERSE_ACTION = 'productPricing.siteUniverse.save';",
      function () {
        return withLive({}, function (L) { return L.t.writeShaped().length > 0; });
      });
  });
});

/* I12 — the replay harness pre-selects a site for the page. */
ok(!/install[\s\S]{0,400}?scope:\s*\{/.test(SRC.replay),
  'I12 the replay harness does not hand the page a scope');
ok(!/setCapability\(\{\s*product_strategy_enabled:\s*true\s*\}\)/.test(
  SRC.replay.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')),
  'I13 and it still does not raise the capability for it');

/* I14 — the visual runner feeds rows straight to the adapter. */
var runnerCode = SRC.runner.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
ok(!/PSB_BOARD\.mount\(\s*\{\s*adapter/.test(runnerCode),
  'I14 the visual runner does not mount the board with rows of its own');
ok(/P1B8C_REPLAY\.install/.test(runnerCode),
  'I15 it drives the page through the same transport seam as everything else');

/* I16/I17 — THE OTHER PRE-SELECTION DOOR, AND IT WAS OPEN. The runner used to call
   `c.select({company,country,marketplace})`, reaching past the screen to hand the controller the
   one input a live operator could not give. Seven viewports of a working board were photographed
   over a page that offered no way to choose anything — the same failure as R4's capability, one
   layer out. Read as code so the comment that records this is not itself the finding. */
ok(!/\bc\.select\(/.test(runnerCode),
  'I16 the visual runner no longer selects a site by calling the controller');
ok(/P1B8C_REPLAY\.chooseSite\(document,/.test(runnerCode),
  'I17 it operates the real controls and dispatches real change events');
ok(/data-psb-site-dim/.test(SRC.replay) && /dispatchEvent/.test(SRC.replay),
  'I18 and chooseSite reaches the page only through what is on screen');

// =================================================================================================
section('J — THE RULES THIS ROUND DOES NOT OWN');
// =================================================================================================

ok(/PRODUCT_STRATEGY_ENABLED_/.test(read('assets/specs/active/apps-script/00_config.gs')),
  'J1  the server flag is still the last gate — activation suite §F');
ok(/refreshCapability/.test(read('assets/js/api/km-product-pricing-workspace.js')),
  'J2  the capability is still derived, not declared — R4 suite §E');
ok(/psb-state-host/.test(SRC.partial), 'J3  every refusal still has exactly one host');

// =================================================================================================
PENDING.then(function () {
  console.log('\npassed ' + pass + '  failed ' + fail
    + '  |  mutants caught ' + neg.caught + '  survived ' + neg.missed);
  if (fail > 0) process.exitCode = 1;
}).catch(function (e) {
  console.error('SUITE THREW: ' + (e && e.stack || e));
  process.exitCode = 1;
});
