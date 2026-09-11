/**
 * ================================================================================================================
 * PRODUCT STRATEGY BOARD — THE PRODUCTION PAGE CONTROLLER   (P1-B5 §4/§5 · P1-B6 §7/§8)
 * ================================================================================================================
 *
 * INSTALLED, NOT ACTIVATED — AND THOSE ARE TWO FACTS, NOT ONE (P1-B7 §4/§7).
 *
 * Until P1-B7 this file was unreachable because nothing loaded it. That is no longer true: index.html loads it,
 * it registers a lifecycle for `product-strategy-board-section`, and the partial and mount point exist. What
 * keeps it unreachable now is three things that are written down rather than absent:
 *
 *   1. THE SERVER FLAG.  PRODUCT_STRATEGY_ENABLED_ = false in 00_config.gs. The read is refused at the source,
 *                        whatever any browser believes.
 *   2. THE NAVIGATION.   app.js `KM_STAGED_SECTIONS_` carries this section with `enabled: false` and
 *                        `showSection` returns on it before touching the shell. There is no menu item, and a
 *                        hidden-but-clickable one is forbidden.
 *   3. THE CAPABILITY.   The accessor's mirror starts FALSE and only a server capability payload can raise it.
 *                        This is what makes a DIRECT call to the controller answer FEATURE_DISABLED at ZERO
 *                        requests, which is the case the other two gates do not cover.
 *
 * A missing thing and a refused thing look identical from outside and are completely different in the code. The
 * first cannot be reviewed, asserted, or protected by a mutant; the second can, and is.
 *
 * ------------------------------------------------------------------------------------------------------------
 * THE ORDER OF READS, WHICH IS THE WHOLE SHAPE OF THIS FILE
 *
 *   1. the capability mirror            — refused locally, so a disabled feature costs ZERO requests
 *   2. productPricing.siteUniverse.get  — the sites a person may choose from
 *   3. a person chooses                 — Company, then Country, then Marketplace, each narrowed by the last
 *   4. productPricing.workspace.get     — ONLY once the scope is complete
 *   5. the one adapter, the selectors, the board
 *
 * STEP 4 NEVER RUNS FIRST. P1-B5 had no choice about this and fell back to SITE_UNIVERSE_NOT_AVAILABLE; now
 * there is an owner, and the rule is explicit: an incomplete scope is not a narrower question, it is a question
 * the server cannot answer, so asking it would cost a round trip to be refused. The suite asserts the request
 * count, not the intention.
 *
 * ------------------------------------------------------------------------------------------------------------
 * TWO ASYNCHRONOUS HAZARDS, AND THEY ARE DIFFERENT PROBLEMS
 *
 * SINGLE FLIGHT. One workspace request may be outstanding. A second selection while the first is in the air
 * does not start a race; it supersedes. Two concurrent reads of two different sites, resolving in an order
 * nobody controls, is the exact mechanism that puts one site's rows under another site's heading — the bug this
 * entire feature is scoped to prevent.
 *
 * STALENESS. Superseding is not enough, because the first request still resolves. Every request carries a
 * token, and a response whose token is not the current one is DROPPED — not merged, not rendered, not counted.
 * *A slow answer to a question nobody is asking any more is not late data; it is wrong data,* and it arrives
 * looking exactly like the right data because the only thing wrong with it is when it came back.
 *
 * ------------------------------------------------------------------------------------------------------------
 * NO FIXTURE, NO URL, NO STORAGE. There is no fixture in this file and no reference to one. It never reads
 * `location.search`, `URLSearchParams` or `location.href`: a link is forwardable, so a query string is how one
 * person's debugging becomes another person's screenshot. It writes no localStorage, no sessionStorage, no
 * cookie. Scenario overrides live in the board's memory and a reload clears them, which is what P1-B4 proved.
 * ================================================================================================================
 */
(function (root) {
  'use strict';

  var P = {};

  P.BUILD = 'PRODUCT-STRATEGY-P1-B7';

  /** States the PAGE owns. None of them is a source state — no table was read to reach one. */
  P.AWAITING_SITE_SELECTION = 'AWAITING_SITE_SELECTION';
  P.SITE_UNIVERSE_NOT_AVAILABLE = 'SITE_UNIVERSE_NOT_AVAILABLE';
  P.LOADING_SITE_UNIVERSE = 'LOADING_SITE_UNIVERSE';
  P.LOADING_WORKSPACE = 'LOADING_WORKSPACE';

  P.UX_PAGE = {
    AWAITING_SITE_SELECTION: { may_analyse: false, uses_fixture: false, severity: 'info',
      headline: 'Choose a site to analyse.',
      detail: 'This board reads one site at a time — a company, a country and a marketplace — because'
        + ' prices from two sites on one axis would compare products that do not compete.' },
    SITE_UNIVERSE_NOT_AVAILABLE: { may_analyse: false, uses_fixture: false, severity: 'stop',
      headline: 'The list of sites could not be read.',
      detail: 'No site can be chosen until it can, and nothing is shown in place of it.' },
    LOADING_SITE_UNIVERSE: { may_analyse: false, uses_fixture: false, severity: 'info',
      headline: 'Loading sites…' },
    LOADING_WORKSPACE: { may_analyse: false, uses_fixture: false, severity: 'info',
      headline: 'Loading listings…' }
  };

  function isObj(v) { return !!v && typeof v === 'object' && !(v instanceof Array); }
  function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }

  function accessorOf(o) { return (o && o.accessor) || (root.KM && root.KM.productPricingWorkspace) || null; }
  function liveAdapterOf(o) { return (o && o.liveAdapter) || root.KM_PRODUCT_STRATEGY_LIVE_ADAPTER || null; }
  function universeOf(o) { return (o && o.siteUniverse) || root.KM_PRODUCT_STRATEGY_SITE_UNIVERSE || null; }
  function boardOf(o) { return (o && o.board) || root.PSB_BOARD || null; }

  /** A scope is complete or it is not a scope. Two of three is not a narrower question. */
  P.scopeIsComplete = function (scope) {
    if (!isObj(scope)) return false;
    return str(scope.company) !== '' && str(scope.country) !== '' && str(scope.marketplace) !== '';
  };

  /**
   * Render one state, and nothing else. Deliberately plain: every state it can show is one where the
   * numbers a person came for are not available, and dressing that up with the chart's furniture would
   * suggest there is something to look at.
   */
  P.renderState = function (host, ux, refusals, doc) {
    doc = doc || (host && host.ownerDocument) || root.document;
    if (!host) return null;
    while (host.firstChild) host.removeChild(host.firstChild);

    var box = doc.createElement('div');
    box.className = 'psb-state psb-state--' + str(ux.severity || 'info');
    box.setAttribute('data-cy', 'psb-state');
    box.setAttribute('role', ux.severity === 'stop' ? 'alert' : 'status');

    var h = doc.createElement('p');
    h.className = 'psb-state__headline';
    h.textContent = str(ux.headline);
    box.appendChild(h);

    if (str(ux.detail) !== '') {
      var d = doc.createElement('p');
      d.className = 'psb-state__detail';
      d.textContent = str(ux.detail);
      box.appendChild(d);
    }

    /* THE REFUSALS ARE NAMED, NOT COUNTED. "3 problems" sends a reader to ask somebody; a code and a
       subject sends them to the row. §5 asks partially-readable to say WHICH source it could not read,
       and that is only possible if the codes survive to here. */
    if (refusals && refusals.length) {
      var ul = doc.createElement('ul');
      ul.className = 'psb-state__codes';
      refusals.slice(0, 12).forEach(function (r) {
        var li = doc.createElement('li');
        var code = str(r && r.code) || 'UNKNOWN';
        var subject = (r && r.subject !== undefined && r.subject !== null) ? str(r.subject) : '';
        li.textContent = subject === '' ? code : (code + ' — ' + subject);
        ul.appendChild(li);
      });
      box.appendChild(ul);
    }
    host.appendChild(box);
    return box;
  };

  /**
   * THE CONTROLLER. One per mounted page; holds the universe, the current scope and the request token.
   *
   * It is returned rather than hidden in a closure so a test can drive it the way a person would —
   * choose a company, then a country — without a DOM and without a clock.
   */
  P.create = function (opts) {
    opts = isObj(opts) ? opts : {};
    var doc = opts.document || root.document;
    var host = opts.host || (doc && typeof doc.getElementById === 'function'
      ? doc.getElementById('psb-state-host') : null);

    var accessor = accessorOf(opts);
    var live = liveAdapterOf(opts);
    var SU = universeOf(opts);
    var board = boardOf(opts);

    var C = {
      universe: null,
      narrowed: null,
      state: null,
      mounted: false,
      requests: { siteUniverse: 0, workspace: 0 },
      /* THE TOKEN. Incremented on every intent to read; a response carrying an old one is dropped.
         `inFlight` is the single-flight latch — a second selection supersedes rather than races. */
      token: 0,
      inFlight: false,
      dropped: 0
    };

    function show(state, ux, refusals) {
      C.state = state;
      P.renderState(host, ux, refusals || [], doc);
      return { state: state, mounted: C.mounted, may_analyse: false, refusals: refusals || [] };
    }

    function capabilityOk() {
      return !!accessor && typeof accessor.isEnabled === 'function' && accessor.isEnabled() === true;
    }

    /** STEP 1 + 2. The capability, then the universe. Never the workspace. */
    C.loadUniverse = function () {
      /* THE CAPABILITY IS ASKED FIRST — BEFORE EVEN CHECKING WHETHER THE MODULES LOADED.
         This ordering is the same discipline 72_ applies with "the flag, before the door", and it was
         wrong here first: a build with a missing script answered MODULE_NOT_LOADED to a person whose
         real situation was that the feature is off. The less alarming and more accurate answer is the
         one that should win, and the capability is also the cheaper question. */
      if (!capabilityOk()) {
        // ZERO REQUESTS. Asked before anything else, so a disabled feature never reaches the wire.
        return Promise.resolve(show('FEATURE_DISABLED',
          (live && live.UX && live.UX.FEATURE_DISABLED) || P.UX_PAGE.SITE_UNIVERSE_NOT_AVAILABLE,
          [{ code: 'FEATURE_DISABLED',
            detail: 'the client capability mirror is false; no request was sent' }]));
      }
      if (!SU || !live) {
        return Promise.resolve(show(P.SITE_UNIVERSE_NOT_AVAILABLE,
          P.UX_PAGE.SITE_UNIVERSE_NOT_AVAILABLE, [{ code: 'MODULE_NOT_LOADED' }]));
      }
      if (typeof accessor.getSiteUniverse !== 'function') {
        return Promise.resolve(show(P.SITE_UNIVERSE_NOT_AVAILABLE,
          P.UX_PAGE.SITE_UNIVERSE_NOT_AVAILABLE, [{ code: 'ACCESSOR_HAS_NO_SITE_UNIVERSE_READ' }]));
      }

      show(P.LOADING_SITE_UNIVERSE, P.UX_PAGE.LOADING_SITE_UNIVERSE, []);
      C.requests.siteUniverse++;
      return Promise.resolve(accessor.getSiteUniverse({ signal: opts.signal }))
        .then(function (env) {
          var u = SU.adapt(env);
          C.universe = u;
          if (u.state !== 'OK') {
            var ux = SU.UX[u.state] || SU.UX.SOURCE_NOT_CONNECTED;
            return show(u.state, { may_analyse: false, uses_fixture: false,
              severity: ux.severity, headline: ux.headline, detail: ux.detail }, u.refusals);
          }
          // The initial narrow resolves any tier that has exactly one value, and nothing else.
          return C.select(isObj(opts.scope) ? opts.scope : {});
        });
    };

    /**
     * STEP 3. A person chooses. Downstream values the new upstream does not offer are cleared, and the
     * workspace read happens ONLY when all three tiers are resolved.
     */
    C.select = function (desired) {
      if (!C.universe || C.universe.state !== 'OK') {
        return Promise.resolve(show(P.SITE_UNIVERSE_NOT_AVAILABLE,
          P.UX_PAGE.SITE_UNIVERSE_NOT_AVAILABLE, [{ code: 'NO_UNIVERSE_LOADED' }]));
      }
      var previous = C.narrowed ? C.narrowed.scope : null;
      C.narrowed = SU.narrow(C.universe, desired);

      /* A SITE SWITCH INVALIDATES WHAT WAS DERIVED FROM THE OLD SITE (§8). Category, series and any
         scenario override belong to the site they were chosen on; carrying them across is how a
         simulated price for one marketplace ends up drawn on another. The board is re-mounted with the
         new adapter, which is what clears them — there is no partial-update path that could miss one. */
      if (previous && !SU.sameSite(previous, C.narrowed.scope)) C.siteChanged = true;

      if (!C.narrowed.complete) {
        // NOT A REQUEST. An incomplete scope is answered here, at zero cost.
        return Promise.resolve(show(P.AWAITING_SITE_SELECTION, P.UX_PAGE.AWAITING_SITE_SELECTION, []));
      }
      return C.loadWorkspace();
    };

    /** STEP 4 + 5. One read, one board. Single-flight, and stale answers are dropped. */
    C.loadWorkspace = function () {
      var scope = C.narrowed.scope;
      C.token++;
      var myToken = C.token;
      C.inFlight = true;
      show(P.LOADING_WORKSPACE, P.UX_PAGE.LOADING_WORKSPACE, []);
      C.requests.workspace++;

      return live.fetch({
        scope: scope,
        filters: isObj(opts.filters) ? opts.filters : {},
        include: isObj(opts.include) ? opts.include : { regional: true, pricing: true, campaigns: true }
      }, { accessor: accessor, asOf: opts.asOf, signal: opts.signal })
        .then(function (adapter) {
          if (myToken !== C.token) {
            /* DROPPED. A newer selection has been made, and rendering this would put the previous
               site's rows under the current site's heading — silently, because nothing about the data
               is wrong except that nobody asked for it any more. */
            C.dropped++;
            return { state: 'SUPERSEDED', mounted: C.mounted, may_analyse: false, refusals: [],
              dropped: true };
          }
          C.inFlight = false;
          var snap = adapter.load();
          C.state = snap.state;
          if (snap.may_analyse !== true) {
            C.mounted = false;
            return show(snap.state, snap.ux, snap.refusals);
          }
          if (!board || typeof board.mount !== 'function') {
            return show('SOURCE_NOT_CONNECTED',
              { severity: 'stop', headline: 'The board could not start.',
                detail: 'psb-board-ui.js is not loaded.' }, [{ code: 'BOARD_UI_NOT_LOADED' }]);
          }
          if (host) { while (host.firstChild) host.removeChild(host.firstChild); }
          board.mount({ adapter: adapter });
          C.mounted = true;
          return { state: snap.state, mounted: true, may_analyse: true,
            row_count: snap.row_count, refusals: [] };
        });
    };

    return C;
  };

  /** The one-call entry point: build a controller and load the universe. */
  P.mount = function (opts) {
    var c = P.create(opts);
    P.lastController = c;
    return c.loadUniverse();
  };

  /* ==============================================================================================
     THE SHELL SIDE (P1-B7 §4). Everything above this line is shell-agnostic and is driven directly by
     the suites; everything below knows about KM.lifecycle, KM.partialLoader and one mount point.
     ============================================================================================== */

  P.SECTION_ID = 'product-strategy-board-section';
  P.PARTIAL_URL = 'assets/html/pages/product-strategy-board.html';
  P.MOUNT_SELECTOR = '#product-strategy-board-mount';

  /**
   * Fetch the partial once. Resolves true when the section markup is in the document.
   *
   * The board's own hosts — `#psb-state-host`, `#scope`, `#view`, `#nav`, `#crumbs`, `#banner` — all live
   * in that partial, so NOTHING may render before this resolves. That is why the read order starts here
   * rather than at the capability: a FEATURE_DISABLED notice also needs somewhere to be written.
   */
  P.ensureMarkup = function () {
    var doc = root.document;
    if (!doc) return Promise.resolve(false);
    if (doc.getElementById(P.SECTION_ID)) return Promise.resolve(true);
    var loader = root.KM && root.KM.partialLoader;
    if (!loader || typeof loader.loadPartial !== 'function') return Promise.resolve(false);
    return Promise.resolve(loader.loadPartial('product-strategy-board', P.PARTIAL_URL, P.MOUNT_SELECTOR))
      .then(function () { return !!doc.getElementById(P.SECTION_ID); })
      .catch(function () { return false; });
  };

  /**
   * The lifecycle mount. Registered unconditionally, reachable by nothing: app.js refuses this section
   * id by name, so `switchTo` is never called for it while the feature is staged.
   */
  P.onMount = function (epoch) {
    var doc = root.document;
    return P.ensureMarkup().then(function (ok) {
      /* THE NAVIGATION MAY HAVE MOVED WHILE THE PARTIAL WAS IN THE AIR. The lifecycle hands every
         mount its epoch for this; rendering into a section the operator has already left is the same
         mistake as rendering a superseded workspace response, one layer up. */
      var lc = root.KM && root.KM.lifecycle;
      if (lc && typeof lc.isCurrent === 'function' && !lc.isCurrent(epoch)) return null;
      if (!ok) return null;
      var sec = doc.getElementById(P.SECTION_ID);
      if (sec && sec.classList) sec.classList.add('active');
      return P.mount({});
    });
  };

  /**
   * The lifecycle unmount. The MARKUP stays — the partial is fetched once and re-fetching it would be
   * a request for something already in the document. The CONTROLLER does not: it holds a universe, a
   * chosen scope, a request token and a mounted board, and carrying those into the next visit is how
   * one site's scope ends up above another site's rows.
   */
  P.onUnmount = function () {
    P.lastController = null;
    var doc = root.document;
    var sec = doc && doc.getElementById(P.SECTION_ID);
    if (sec && sec.classList) sec.classList.remove('active');
    var host = doc && doc.getElementById('psb-state-host');
    if (host) { while (host.firstChild) host.removeChild(host.firstChild); }
  };

  if (root.KM && root.KM.lifecycle && typeof root.KM.lifecycle.register === 'function') {
    root.KM.lifecycle.register(P.SECTION_ID, { mount: P.onMount, unmount: P.onUnmount });
  }

  /** The boundary as data — asserted by the suite rather than described in prose. */
  P.CONTRACT = {
    build: P.BUILD,
    registered_in_navigation: false,
    // P1-B7 — INSTALLED is not ACTIVATED, and both halves are stated so neither can be inferred from
    // the other. The shell loads this file and knows this section; nothing can navigate to it.
    installed_in_shell: true,
    lifecycle_section: 'product-strategy-board-section',
    partial_url: 'assets/html/pages/product-strategy-board.html',
    mount_selector: '#product-strategy-board-mount',
    staged_section_key: 'product-strategy',
    loads_prototype_assets: false,
    reads_url_parameters: false,
    writes_browser_storage: false,
    fixture_fallback: false,
    only_state_that_mounts: 'OK',
    accessor: 'KM.productPricingWorkspace',
    adapter: 'KM_PRODUCT_PRICING_ADAPTER via KM_PRODUCT_STRATEGY_LIVE_ADAPTER',
    board: 'PSB_BOARD (assets/js/product-strategy/psb-board-ui.js)',
    scope_is_an_input: true,
    // P1-B6 CLOSED THE GAP P1-B5 RECORDED. The owner exists now, and it is the same Product Pricing
    // owner rather than a second authority for marketplace_skus membership.
    site_universe_owner: 'productPricing.siteUniverse.get',
    site_universe_gap: null,
    reads_universe_before_workspace: true,
    workspace_requires_complete_scope: true,
    single_flight_workspace: true,
    drops_stale_responses: true,
    derives_site_universe_from_workspace_response: false
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = P; }
  root.KM = root.KM || {};
  root.KM.pages = root.KM.pages || {};
  root.KM.pages.productStrategyBoard = P;
}(typeof globalThis !== 'undefined' ? globalThis : this));
