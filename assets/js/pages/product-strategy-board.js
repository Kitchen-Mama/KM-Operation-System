/**
 * ================================================================================================================
 * PRODUCT STRATEGY BOARD — THE PRODUCTION PAGE CONTROLLER   (PRODUCT-STRATEGY-P1-B5 §4, §5)
 * ================================================================================================================
 *
 * NOT REGISTERED, AND THAT IS THE POINT. This file is not referenced from index.html, there is no menu item and
 * no entry in the app.js section map, so `showSection` cannot reach it. P1-B5 §4 forbids enabling the navigation
 * entry and §11 forbids changing it; production visibility for this feature stays zero by construction rather
 * than by a hidden button — the same discipline the accessor has carried since P1-B1.
 *
 * WHAT IT DOES, AND HOW LITTLE OF IT IS ITS OWN WORK. Four things, in order, and every one of them delegates:
 *
 *   1. ask the capability mirror whether the feature is on — the ACCESSOR owns that, and refuses locally with
 *      the same code the server would have sent, rather than spending a round trip to be told;
 *   2. resolve the SITE SCOPE, which is an input to the read and not a derivation from it (see below);
 *   3. fetch once through the accessor and hand the response to the live adapter, which maps the server's
 *      source-state vocabulary onto the board's and decides whether a chart may be drawn at all;
 *   4. mount the board with that adapter, or render the state and mount nothing.
 *
 * There is no fifth step in which something is shown anyway.
 *
 * ------------------------------------------------------------------------------------------------------------
 * THE SCOPE IS AN INPUT, AND FINDING THAT OUT IS WHAT THIS ROUND MEASURED
 *
 * The board derives its Company -> Country -> Marketplace ladder from the rows its adapter hands over, because
 * the preview fixture hands over the CANONICAL universe: every site it knows about, unfiltered, with the
 * narrowing done afterwards in the selectors. That is correct for a fixture and it is the whole reason the
 * ladder worked.
 *
 * `productPricing.workspace.get` cannot do that, and must not. It is site-scoped by construction — company,
 * country and marketplace are required, the server refuses without them, and P1-B1 built it that way precisely
 * so that one site's rows can never appear under another site's heading. Its `filterOptions` carries categories
 * and series for the site already chosen; it carries no site list, and there is nowhere honest for one to come
 * from in a site-scoped answer.
 *
 * So the live universe cannot populate the top three rungs of the ladder, and no existing read owner publishes
 * the marketplace_skus membership across sites. That is a GAP, not a defect in the board: the board is correct
 * for the adapter it was given. It is recorded here, it fails closed as SITE_UNIVERSE_NOT_AVAILABLE, and this
 * file does NOT invent an endpoint to close it — a second read authority for marketplace_skus is the one thing
 * the adapter contract names as forbidden, because two owners of one resource disagree.
 *
 * `opts.siteUniverse` is the seam a later round wires. Until then a caller supplies a complete scope or the
 * page says, in a sentence, that it cannot know which sites exist.
 *
 * ------------------------------------------------------------------------------------------------------------
 * NO FIXTURE, NO URL, NO STORAGE. This file contains no fixture and no reference to one. It never reads
 * `location.search`, `URLSearchParams` or `location.href`: a link is forwardable, so a query string is how one
 * person's debugging becomes another person's screenshot, and a board reached with `?demo=1` in a meeting is a
 * meeting shown fiction. It writes no localStorage, no sessionStorage, no cookie. The scenario overrides the
 * board holds stay in memory and a reload clears them, which is the behaviour P1-B4 proved and §8 preserves.
 * ================================================================================================================
 */
(function (root) {
  'use strict';

  var P = {};

  P.BUILD = 'PRODUCT-STRATEGY-P1-B5';
  P.SECTION_ID = 'product-strategy-board-section';

  /** The page's own state, added to the adapter's. It is never a source state — nothing was read. */
  P.SITE_UNIVERSE_NOT_AVAILABLE = 'SITE_UNIVERSE_NOT_AVAILABLE';

  P.UX_SITE_UNIVERSE = {
    may_analyse: false,
    uses_fixture: false,
    severity: 'stop',
    headline: 'No site scope selected, and the list of sites cannot be read yet.',
    detail: 'This board reads one site at a time — a company, a country and a marketplace — because a '
      + 'price comparison that pooled two sites would compare products that do not compete. No read owner '
      + 'publishes the list of sites yet, so a scope has to be supplied explicitly until one does.'
  };

  function isObj(v) { return !!v && typeof v === 'object' && !(v instanceof Array); }
  function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }

  function accessorOf(opts) {
    return (opts && opts.accessor) || (root.KM && root.KM.productPricingWorkspace) || null;
  }
  function liveAdapterOf(opts) {
    return (opts && opts.liveAdapter) || root.KM_PRODUCT_STRATEGY_LIVE_ADAPTER || null;
  }
  function boardOf(opts) {
    return (opts && opts.board) || root.PSB_BOARD || null;
  }

  /**
   * A scope is complete or it is not a scope. Two of three is not a narrower question — it is a question the
   * server cannot answer, and asking it costs a round trip to be told what is checkable here.
   */
  P.scopeIsComplete = function (scope) {
    if (!isObj(scope)) return false;
    return str(scope.company) !== '' && str(scope.country) !== '' && str(scope.marketplace) !== '';
  };

  /**
   * Render one state, and nothing else. Deliberately plain: this panel exists to be read and acted on, and
   * every state it can show is one where the numbers a person came for are not available. Dressing that up
   * with the chart's furniture would suggest there is something to look at.
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
   * MOUNT. Returns a Promise for the outcome so a caller — and a test — can see which of the states
   * happened without reading the DOM back.
   */
  P.mount = function (opts) {
    opts = isObj(opts) ? opts : {};
    var doc = opts.document || root.document;
    var host = opts.host || (doc && doc.getElementById('psb-state-host'));
    var live = liveAdapterOf(opts);
    var accessor = accessorOf(opts);

    function stop(state, ux, refusals) {
      P.renderState(host, ux, refusals || [], doc);
      return { state: state, mounted: false, may_analyse: false, refusals: refusals || [] };
    }

    if (!live) {
      return Promise.resolve(stop('SOURCE_NOT_CONNECTED',
        { severity: 'stop', headline: 'The board could not start.',
          detail: 'km-product-strategy-live-adapter.js is not loaded.' },
        [{ code: 'LIVE_ADAPTER_NOT_LOADED' }]));
    }

    // 1. THE CAPABILITY. Asked before anything else, so a disabled feature costs no request at all.
    if (!accessor || typeof accessor.isEnabled !== 'function' || accessor.isEnabled() !== true) {
      return Promise.resolve(stop('FEATURE_DISABLED', live.UX.FEATURE_DISABLED,
        [{ code: 'FEATURE_DISABLED', detail: 'the client capability mirror is false; no request was sent' }]));
    }

    // 2. THE SCOPE, which is an input. See the note at the top about why it cannot be derived.
    var scope = isObj(opts.scope) ? opts.scope : null;
    if (!P.scopeIsComplete(scope)) {
      return Promise.resolve(stop(P.SITE_UNIVERSE_NOT_AVAILABLE, P.UX_SITE_UNIVERSE,
        [{ code: 'SCOPE_INCOMPLETE', detail: 'company, country and marketplace are all required',
          subject: scope ? Object.keys(scope).join(', ') : null }]));
    }

    // 3. ONE READ. `asOf` is passed down as a parameter all the way to the promotion resolution, so the
    //    same response on the same day gives the same rows — the board never reads a clock.
    return live.fetch({
      scope: scope,
      filters: isObj(opts.filters) ? opts.filters : {},
      include: isObj(opts.include) ? opts.include : { regional: true, pricing: true, campaigns: true }
    }, { accessor: accessor, asOf: opts.asOf, signal: opts.signal })
      .then(function (adapter) {
        var snap = adapter.load();
        if (snap.may_analyse !== true) {
          return stop(snap.state, snap.ux, snap.refusals);
        }
        // 4. THE BOARD, with live rows. Nothing about it changed to accept them.
        var board = boardOf(opts);
        if (!board || typeof board.mount !== 'function') {
          return stop('SOURCE_NOT_CONNECTED',
            { severity: 'stop', headline: 'The board could not start.',
              detail: 'psb-board-ui.js is not loaded.' },
            [{ code: 'BOARD_UI_NOT_LOADED' }]);
        }
        if (host) { while (host.firstChild) host.removeChild(host.firstChild); }
        board.mount({ adapter: adapter });
        return { state: snap.state, mounted: true, may_analyse: true,
          row_count: snap.row_count, refusals: [] };
      });
  };

  /** The boundary as data — asserted by the suite rather than described in prose. */
  P.CONTRACT = {
    build: P.BUILD,
    registered_in_navigation: false,
    reads_url_parameters: false,
    writes_browser_storage: false,
    fixture_fallback: false,
    only_state_that_mounts: 'OK',
    accessor: 'KM.productPricingWorkspace',
    adapter: 'KM_PRODUCT_PRICING_ADAPTER via KM_PRODUCT_STRATEGY_LIVE_ADAPTER',
    board: 'PSB_BOARD (assets/js/product-strategy/psb-board-ui.js)',
    scope_is_an_input: true,
    site_universe_owner: null,
    site_universe_gap: 'no read owner publishes marketplace_skus membership across sites; a second'
      + ' authority for that table is forbidden by the adapter contract'
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = P; }
  root.KM = root.KM || {};
  root.KM.pages = root.KM.pages || {};
  root.KM.pages.productStrategyBoard = P;
}(typeof globalThis !== 'undefined' ? globalThis : this));
