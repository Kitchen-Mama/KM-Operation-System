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

  /* P1-B8D-R7 — THE REASON MOVED; IT WAS NOT DELETED.
     The long paragraph is correct and it is the answer to a question a person asks ONCE. Standing
     permanently above the controls, it was two lines of explanation in front of the three
     dropdowns it was explaining, in the largest block on the page. It now lives behind the header's
     info button, where a reader can get it on purpose; the state box keeps the one sentence that
     tells them what to do next. */
  P.HELP = {
    heading: 'How this board reads a site',
    paragraphs: [
      'This board reads one site at a time — a company, a country and a marketplace — because prices'
        + ' from two sites on one axis would compare products that do not compete.',
      'The sites offered are the ones the server reports as readable. There is no default site and'
        + ' none is remembered between visits: a board that chose for you would report one'
        + ' marketplace\u2019s prices under a heading nobody selected.',
      'Changing the company clears the country and the marketplace below it, because those values'
        + ' belong to the company they were chosen under. Category and Series come from the site'
        + ' that is loaded and are re-derived whenever the site changes.'
    ]
  };

  P.UX_PAGE = {
    AWAITING_SITE_SELECTION: { may_analyse: false, uses_fixture: false, severity: 'info',
      headline: 'Select a company, country and marketplace to begin.' },
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

    /* THE CHOOSER'S HOST IS THE PAGE'S, NOT THE BOARD'S. `#scope` is redrawn by `board.mount`
       from the rows of the site in hand; a chooser living there would be erased by the answer to
       its own question, and there would be no way back to a different site. */
    var siteHost = doc && typeof doc.getElementById === 'function'
      ? doc.getElementById(P.SITE_HOST_ID) : null;

    var C = {
      universe: null,
      narrowed: null,
      state: null,
      mounted: false,
      requests: { siteUniverse: 0, workspace: 0 },
      /* The site the in-flight workspace read is for, or null. */
      requestedScope: null,
      /* THE TOKEN. Incremented on every intent to read; a response carrying an old one is dropped.
         `inFlight` is the single-flight latch — a second selection supersedes rather than races. */
      token: 0,
      inFlight: false,
      dropped: 0
    };

    /**
     * P1-B8D-R7 — THE BOARD COMES DOWN WITH THE SITE IT WAS DRAWN FOR.
     *
     * MEASURED, THROUGH THE PRODUCTION LADDER: load KM · US · Shopify, then change Company to
     * ResTW. The controller is immediately and correctly right — its scope is ResTW with nothing
     * below it — and it writes "select a company, country and marketplace" into the state host.
     * And the ENTIRE KM board stays on screen underneath: the chart, the tables, and the command
     * bar's own read-only Company / Country / Marketplace row, still reading KM · US · Shopify,
     * sitting closer to the numbers than the chooser is.
     *
     * So the page asks you to choose a site while showing you a site, and the label next to the
     * data still names the one you just left. *That* is what "my selection jumped back and it
     * asked me to choose again" is: not a control losing its value — the trace shows the controls
     * never lost one — but the page keeping a board it had already stopped believing in.
     *
     * `show()` is the one place every non-board answer is written, so the teardown belongs here
     * rather than at each of its callers: a state that renders a notice can never again be a state
     * that leaves the previous site's chart behind it.
     */
    /**
     * P1-B8D-R7 — A PANEL WITH NOTHING IN IT IS NOT A PANEL.
     *
     * FOUND BY THE STATE SWEEP: on FEATURE_DISABLED and on an unreadable universe the page draws no
     * chooser (correctly — fail closed) and no board, and the merged card rendered anyway: a white
     * bar of controls with no controls in it, directly above the notice explaining that nothing
     * could be read. That is the shape R5's own comment warns about, one layer out — "an empty
     * dropdown beside a could-not-read notice is the shape that reads as success".
     *
     * THE PAGE SAYS SO RATHER THAN THE STYLESHEET GUESSING. `:empty` cannot see this: the card
     * holds two element children that are themselves empty, and `:has()` would make a
     * correctness rule depend on a selector the cascade may not support. The controller knows
     * exactly when it has drawn a chooser and when it has cleared one.
     */
    function syncFiltersHost() {
      if (!doc || typeof doc.getElementById !== 'function') return;
      var panel = doc.getElementById(P.FILTERS_HOST_ID);
      if (!panel) return;
      var scopeEl = doc.getElementById('scope');
      var hasControls = !!((siteHost && siteHost.firstChild) || (scopeEl && scopeEl.firstChild));
      panel.setAttribute('data-psb-empty', hasControls ? 'false' : 'true');
    }
    C.syncFiltersHost = syncFiltersHost;

    /**
     * P1-B8D-R8 — THE RENDERER IS TOLD TO STOP, AND ONLY THEN IS ITS OUTPUT REMOVED.
     *
     * MEASURED: this function did the second half and not the first, and in three runs out of six
     * the board was back in `#view` two hundred milliseconds later. `psb-board-ui` keeps a size
     * observer on `#view`; emptying it IS a size change, and the observer answers it by repainting
     * the entire chart out of a STATE that nothing here can reach. Emptying somebody else's output
     * is not the same as telling them to stop.
     */
    function clearBoard() {
      if (board && typeof board.unmount === 'function') board.unmount();
      if (!doc || typeof doc.getElementById !== 'function') return;
      P.BOARD_HOSTS.forEach(function (id) {
        var n = doc.getElementById(id);
        while (n && n.firstChild) n.removeChild(n.firstChild);
      });
      C.mounted = false;
      syncFiltersHost();
    }
    C.clearBoard = clearBoard;

    /**
     * P1-B8D-R8 — ONE PLACE THE BOARD IS MOUNTED, so a restore and a first load cannot drift.
     *
     * WHAT THIS HOST DECLARES, AND WHY EACH ONE IS A DECISION THE RENDERER CANNOT MAKE:
     *
     *   siteOwnedByPage             the chooser above is the site control  (R7)
     *   inlineHelpIcons             the `?` row came off the screen        (R7)
     *   axisPriceRow                the price is in the tooltip, not twice (R7)
     *   chartToolbar                §4 — the whole View/Detail/Layers row  (R8)
     *   inlineFilterNotes           §3 — no sentence hanging off a control (R8)
     *   clearScenarioOnSiteChange   §8 — a simulation belongs to its site  (R8)
     *   siteIdentity                the canonical key, which only this controller knows
     *
     * THE IDENTITY IS PASSED RATHER THAN DERIVED. The renderer can read a company off its rows, but
     * "the site these rows are from" and "the site the operator has selected" are the same fact
     * only while they agree — and the window in which they disagree is precisely the window §5 and
     * §7 are about. The controller is the authority, so the controller says it.
     */
    function mountBoard(adapter) {
      var sc = (C.narrowed && C.narrowed.scope) || {};
      board.mount({
        adapter: adapter,
        siteOwnedByPage: true,
        inlineHelpIcons: false,
        axisPriceRow: false,
        chartToolbar: false,
        inlineFilterNotes: false,
        clearScenarioOnSiteChange: true,
        siteIdentity: [sc.company, sc.country, sc.marketplace].join('|')
      });
      C.mounted = true;
      showBoardNotices();
      return true;
    }

    /**
     * §3 — THE SENTENCE MOVES; IT DOES NOT DISAPPEAR.
     *
     * A site whose listings carry no category still has to say so, and it says so HERE, in the one
     * element every other answer is written into, rather than as a paragraph hanging off the
     * Category button. The board is left exactly where it is: there are rows, they have prices and
     * the chart is correct — this is a note about one control, not a refusal.
     */
    function showBoardNotices() {
      if (!host) return;
      while (host.firstChild) host.removeChild(host.firstChild);
      var list = (board && typeof board.notices === 'function') ? board.notices() : [];
      if (!list || !list.length) return;
      var n = list[0];
      P.renderState(host, { may_analyse: true, uses_fixture: false, severity: n.severity || 'info',
        headline: n.headline, detail: n.detail }, [], doc);
    }
    C.showBoardNotices = showBoardNotices;

    function show(state, ux, refusals) {
      C.state = state;
      /* NOT A CHART BESIDE A NOTICE. The partial has said since P1-B5 that the chart is never drawn
         beside a refusal; until this round that was true only of the FIRST answer, because nothing
         removed a chart that had already been drawn. */
      clearBoard();
      P.renderState(host, ux, refusals || [], doc);
      return { state: state, mounted: false, may_analyse: false, refusals: refusals || [] };
    }

    function capabilityOk() {
      return !!accessor && typeof accessor.isEnabled === 'function' && accessor.isEnabled() === true;
    }
    /* P1-B8D-R4 - THE PAGE MAY ASK THE SERVER WHAT IT ALLOWS; IT MAY NEVER DECLARE IT.
       The mirror is only ever as good as its producer, and until this round it had none: nothing in
       the shipped frontend called `setCapability`, so a browser held `false` from load to unload and
       this page reported a feature that was switched ON at both of its authorities. The derive is one
       read of the server's own health, resolved once per page life, and it returns nothing - the
       answer is read back through capabilityOk() above, so there is still exactly one mirror and no
       second opinion. An accessor without the step (an older build, a test double) keeps whatever it
       already had rather than being treated as an error. */
    function capabilityResolved() {
      if (capabilityOk()) return Promise.resolve(true);
      if (!accessor || typeof accessor.refreshCapability !== 'function') return Promise.resolve(false);
      return Promise.resolve(accessor.refreshCapability())
        .then(function () { return capabilityOk(); }, function () { return false; });
    }

    /** STEP 1 + 2. The capability, then the universe. Never the workspace. */
    C.loadUniverse = function () {
      return capabilityResolved().then(loadUniverseResolved);
    };

    function loadUniverseResolved() {
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
            /* FAIL CLOSED: no list, no controls. */
            if (siteHost) { while (siteHost.firstChild) siteHost.removeChild(siteHost.firstChild); }
            var ux = SU.UX[u.state] || SU.UX.SOURCE_NOT_CONNECTED;
            return show(u.state, { may_analyse: false, uses_fixture: false,
              severity: ux.severity, headline: ux.headline, detail: ux.detail }, u.refusals);
          }
          // The initial narrow resolves any tier that has exactly one value, and nothing else.
          return C.select(isObj(opts.scope) ? opts.scope : {});
        });
    }

    /**
     * STEP 3. A person chooses. Downstream values the new upstream does not offer are cleared, and the
     * workspace read happens ONLY when all three tiers are resolved.
     */
    /**
     * Redraw the chooser from whatever the universe currently allows.
     *
     * CALLED AFTER EVERY NARROWING, because the narrowing is what changes the options: picking a
     * company is the event that gives Country anything to offer. A universe that is not OK draws
     * nothing at all.
     */
    function paintChooser() {
      if (!siteHost) return;
      if (!C.universe || C.universe.state !== 'OK') {
        while (siteHost.firstChild) siteHost.removeChild(siteHost.firstChild);
        syncFiltersHost();
        return;
      }
      P.renderSiteChooser(siteHost, C.narrowed, onPick, doc);
      syncFiltersHost();
    }

    /**
     * A person used one of the three controls.
     *
     * TIERS BELOW THE ONE THAT CHANGED ARE DROPPED RATHER THAN KEPT AND VALIDATED. Choosing a new
     * company while the old country is still in the desired scope asks `narrow` to reconcile two
     * different sites, and the tie-break would decide which one a person meant. Only what is ABOVE
     * the changed tier survives, and `narrow` re-resolves everything below it.
     */
    function onPick(dim, value) {
      var scope = (C.narrowed && C.narrowed.scope) || {};
      var next = {};
      var reached = false;
      P.SITE_TIERS.forEach(function (d) {
        if (d === dim) { reached = true; if (str(value) !== '') next[d] = str(value); return; }
        if (!reached && str(scope[d]) !== '') next[d] = str(scope[d]);
      });
      P.lastSelection = C.select(next);
      return P.lastSelection;
    }
    C.pick = onPick;

    C.select = function (desired) {
      if (!C.universe || C.universe.state !== 'OK') {
        return Promise.resolve(show(P.SITE_UNIVERSE_NOT_AVAILABLE,
          P.UX_PAGE.SITE_UNIVERSE_NOT_AVAILABLE, [{ code: 'NO_UNIVERSE_LOADED' }]));
      }
      var previous = C.narrowed ? C.narrowed.scope : null;
      var next = SU.narrow(C.universe, desired);

      /* THE SAME SITE IS NOT A NEW QUESTION (§4). A second click on the marketplace already showing
         is not a narrower scope and not a refresh; re-reading for it is how a control that is held
         down turns into an unbounded queue of identical requests. It is refused only while that
         site's answer is already here or already coming - a re-pick after a failure must still be
         able to try again. */
      if (next.complete && previous && SU.sameSite(previous, next.scope)
        && (C.inFlight === true || C.mounted === true)) {
        C.narrowed = next;
        paintChooser();
        /* NOTHING IS TORN DOWN HERE, deliberately: this is the SAME site, already on screen or
           already coming, so the board that is up is the board this scope asks for. */
        return Promise.resolve({ state: C.state, mounted: C.mounted,
          may_analyse: C.mounted === true, refusals: [], unchanged: true });
      }

      C.narrowed = next;

      /* P1-B8D-R7 — A QUESTION THAT HAS BEEN WITHDRAWN MUST NOT BE ANSWERED.
         FOUND BY THE STALE-RESPONSE TRACE, and it is a second kind of staleness from the one
         `token` was built for. That one is a read SUPERSEDED by another read: two sites asked for,
         the slow answer dropped because a newer token exists. This one is a read superseded by
         NOTHING — a person with a load outstanding changes Company, the scope becomes incomplete,
         no new read starts, so the token never moves and the outstanding answer is still "current".
         It landed and mounted a board for a marketplace that was no longer selected, underneath a
         notice asking for one.

         Advancing the token is what withdraws the question. `requestedScope` is the site the
         outstanding read is FOR, so re-picking the very same complete site while its own read is in
         the air is left alone — that answer is still the answer. */
      if (C.inFlight === true && !(C.narrowed.complete && C.requestedScope
        && SU.sameSite(C.requestedScope, C.narrowed.scope))) {
        C.token++;
        C.inFlight = false;
      }

      /* A SITE SWITCH INVALIDATES WHAT WAS DERIVED FROM THE OLD SITE (§8). Category and series
         belong to the site they were chosen on; carrying them across is how a filter names
         something the new site does not have.

         P1-B8D-R7 — THIS COMMENT USED TO SAY THE RE-MOUNT CLEARED THEM, AND IT DID NOT. A trace
         through the production ladder chose `Cutting Board` on KM · US · Shopify, switched to
         ResTW · JP · Amazon, and found the category menu offering three options with none of them
         selected: `boot()` swapped the adapter and rendered, and every derived choice came through
         untouched. The renderer has always had `narrowAfterSiteChange()` for exactly this, and it
         simply had no caller on this path; `boot()` now calls it when a new adapter arrives. The
         clearing is therefore the RENDERER's, at the one place a new adapter can enter it, rather
         than a property of re-mounting that nothing implemented. */
      if (previous && !SU.sameSite(previous, C.narrowed.scope)) C.siteChanged = true;

      paintChooser();

      if (!C.narrowed.complete) {
        // NOT A REQUEST. An incomplete scope is answered here, at zero cost.
        return Promise.resolve(show(P.AWAITING_SITE_SELECTION, P.UX_PAGE.AWAITING_SITE_SELECTION, []));
      }
      return C.loadWorkspace();
    };

    C.paintChooser = paintChooser;

    /**
     * P1-B8D-R8 §7 — PUT THE SAME PAGE BACK, AND ASK THE SERVER NOTHING.
     *
     * THE REPORT WAS A SPLIT BRAIN: leave Product Strategy, come back, and the old board is still
     * underneath while the chooser above has reset to "Select a company, country and marketplace".
     * Half of that was the renderer repainting a host it had been told nothing about (fixed at
     * `clearBoard`); the other half is this — the controller, with its universe, its scope and its
     * loaded site, was thrown away on every unmount, so the only consistent page the next visit
     * could build was an empty one.
     *
     * PRESERVE, NOT CLEAR, and §7 asks for the reason. Everything this restores was read during
     * THIS page life and cannot have changed without a reload that would destroy it anyway: the
     * universe, the capability and the workspace are all resolved once and never refreshed while
     * the page is open, so a restored board is showing exactly what it would show if the operator
     * had never left. What is NOT restored is anything the renderer has to re-derive — `boot()`
     * rebuilds CANON from this same adapter and `narrowAfterSiteChange()` keeps only the category,
     * series and currency those rows still offer, so the filters cannot come back naming something
     * the board does not have. And because the identity is unchanged, §8's rule leaves the meeting
     * scenario alone: coming back to your own site does not cost you your work.
     *
     * ZERO REQUESTS, and that is the test rather than the intention: the adapter is the answer that
     * was already paid for, and mounting it again is a render, not a read.
     */
    C.restore = function () {
      if (!C.universe || C.universe.state !== 'OK') return false;
      if (!C.narrowed || !C.narrowed.complete) return false;
      if (!C.adapter) return false;
      if (!board || typeof board.mount !== 'function') return false;
      /* THE HOSTS HAVE TO BE THERE. The partial is fetched once and stays, but a restore into a
         document that no longer holds it would report a mounted board nobody can see. */
      if (!doc || typeof doc.getElementById !== 'function') return false;
      if (!doc.getElementById('view') || !siteHost) return false;
      paintChooser();
      if (host) { while (host.firstChild) host.removeChild(host.firstChild); }
      mountBoard(C.adapter);
      syncFiltersHost();
      return true;
    };

    /** STEP 4 + 5. One read, one board. Single-flight, and stale answers are dropped. */
    C.loadWorkspace = function () {
      var scope = C.narrowed.scope;
      /* WHICH SITE THE OUTSTANDING READ IS FOR. Copied rather than referenced: `C.narrowed` is
         replaced by the next narrowing, so holding the object would mean comparing a scope with
         itself and never finding a difference. */
      C.requestedScope = { company: scope.company, country: scope.country,
        marketplace: scope.marketplace };
      C.token++;
      var myToken = C.token;
      C.inFlight = true;
      /* THE PREVIOUS SITE'S BOARD GOES BEFORE THE NEXT SITE'S READ, via `show`. Leaving it up
         "until the new data arrives" is the same mistake one step earlier: for the length of the
         read the page would show one site's prices under a heading that has already changed, and a
         slow read is exactly when a person looks hardest. THE SELECTION IS NOT TOUCHED — the
         chooser keeps every value a person has confirmed; it is the BOARD that is stale. */
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
          /* P1-B8D-R8 §7 — KEPT SO A RETURN COSTS NOTHING. The adapter is the answer to the one
             read this page makes; holding it is what lets `onMount` put the same board back
             without asking the server the same question again. It is dropped the moment a
             different site is chosen, because `loadWorkspace` overwrites it. */
          C.adapter = adapter;
          /* P1-B8D-R7 — WHAT THIS HOST OWNS, SAID ONCE, AT MOUNT.
             The renderer's other host is the prototype, which loads a fixture of many sites and is
             a demonstration of the whole component. This page is not that: the site is already
             chosen upstairs by the chooser above, the shell supplies the page header, and the long
             help text lives behind one `i` in it. Each of the three is the host's decision rather
             than something the renderer could infer from rows that look identical either way. */
          mountBoard(adapter);
          syncFiltersHost();
          return { state: snap.state, mounted: true, may_analyse: true,
            row_count: snap.row_count, refusals: [] };
        });
    };

    return C;
  };

  /* ==============================================================================================
     THE ROUTE (P1-B8B §2)

     A view of this board has a canonical name — `product-strategy/<view>` — and psb-views.js owns the
     six. These two functions are the ONLY place anything outside the board translates between that
     name and what is on screen, which is what makes the identity real rather than decorative: the
     sidebar child, the in-page tab, the controller and a test all say the same string.

     WHAT IS NOT HERE IS A URL, and that is in psb-views.js's header at length. Briefly: this shell has
     no router — no `location.hash`, no `pushState`, no `popstate` anywhere in assets/js — so a hash
     written here could not be pasted, could not survive a reload, and would sit in the address bar
     while the shell showed Home. Making it true means giving the whole application a router, and
     P1-B8A is one round old: a disabled page does not get to change how every other page reloads.
     ============================================================================================== */

  /** Select a view on the mounted board. Returns the canonical route that is now showing, or null. */
  P.applyRoute = function (route, board) {
    var b = board || boardOf({});
    if (!b || typeof b.showView !== 'function') return null;
    b.showView(route);
    return typeof b.currentRoute === 'function' ? b.currentRoute() : null;
  };

  /** Which view is showing, as a route. Null when no board is mounted. */
  P.currentRoute = function (board) {
    var b = board || boardOf({});
    return (b && typeof b.currentRoute === 'function') ? b.currentRoute() : null;
  };

  /**
   * The one-call entry point: build a controller and load the universe.
   *
   * A `route` is applied AFTER the load resolves and ONLY if the board actually mounted. Applying it
   * first would select a view on a board that is about to be replaced; applying it when the load
   * refused would be selecting a view of a page that is showing a refusal instead of a board.
   */
  P.mount = function (opts) {
    opts = isObj(opts) ? opts : {};
    var c = P.create(opts);
    P.lastController = c;
    return c.loadUniverse().then(function (res) {
      if (res && res.mounted === true && str(opts.route) !== '') {
        P.applyRoute(opts.route, boardOf(opts));
      }
      return res;
    });
  };

  /* ==============================================================================================
     THE SITE CHOOSER (P1-B8D-R5)

     THE UNIVERSE ARRIVED AND NOTHING COULD USE IT. `siteUniverse.get` was sent, answered and
     adapted - ten READY sites, three companies - `SU.narrow` computed the option list for every
     tier, and the page rendered "Choose a site to analyse." above zero controls. The state was left
     only by `C.select(scope)`, whose sole production caller was the initial `C.select({})` a few
     lines above. It was a state with no exit.

     WHAT IS AND IS NOT AN OPTION HERE. Every value comes from `narrowed.options`, which comes from
     the universe response and from nothing else. There is no default site, no remembered site, no
     site in a query string - a link is forwardable, so a query string is how one person's debugging
     becomes another person's screenshot, and this file has said so since P1-B5.

     ONE OPTION IS A FACT, NOT A CHOICE. A tier the universe has already resolved renders as
     read-only context rather than as a dropdown holding the value it already has. `psb-board-ui.js`
     makes the same distinction about the loaded rows; this is the same rule about the universe.

     THE PAGE NEVER PICKS. The first option is an empty placeholder and stays selected until a
     person acts. The shell's own scope modal takes the same position in as many words - "never
     auto-confirm All/unselected" - and a board that chose a site for you would be a board that
     reports one marketplace's prices under a heading nobody selected.
     ============================================================================================== */

  /* EVERY HOST THE BOARD DRAWS INTO. Named here because the page has to be able to take the board
     DOWN, and a teardown that knows four of five hosts leaves the fifth on screen — which is
     exactly the shape of the defect this round is repairing. */
  P.BOARD_HOSTS = ['nav', 'crumbs', 'banner', 'scope', 'view'];
  P.FILTERS_HOST_ID = 'psb-filters';
  P.SITE_HOST_ID = 'psb-site-host';
  P.HELP_BUTTON_ID = 'psbPageHelp';
  P.HELP_PANEL_ID = 'psbPageHelpPanel';
  P.HELP_HOST_ID = 'psb-help-host';
  P.SITE_TIERS = ['company', 'country', 'marketplace'];
  P.SITE_LABELS = { company: 'Company', country: 'Country', marketplace: 'Marketplace' };

  /**
   * Render the three tiers into `host`. `onPick(dim, value)` is called with the raw value of the
   * control that changed; the controller decides what that means.
   *
   * FAILS CLOSED. Without a narrowing there is nothing legal to offer, so the host is emptied and
   * no control is drawn. An empty dropdown beside a "could not read the list" notice is the shape
   * that reads as success, and this page has one of those already.
   */
  /**
   * P1-B8D-R7 — IT UPDATES; IT NO LONGER REBUILDS.
   *
   * THE MEASURED DEFECT. Every version of this function began by emptying the host and building
   * three fresh controls, and `paintChooser()` runs on EVERY narrowing — so every single pick
   * destroyed the control the person was using. A browser trace of the production ladder recorded
   * `focus: body` after every step, including the step that focused the control immediately before
   * changing it. The value in the control was always right; the CONTROL was always new. To a person
   * that is the same experience as a value being thrown away: the thing they were operating is gone
   * and the keyboard does nothing, so they go back and choose it again.
   *
   * SO THE CANONICAL STATE IS RESTORED INTO THE CONTROLS THAT EXIST. A tier is rebuilt only when
   * what it OFFERS has changed — a different option list, or a change between a dropdown and
   * read-only context. When only the chosen value changed, the `<select>` keeps its identity, its
   * listener, its scroll position and its focus, and just carries the new value.
   *
   * AND WHEN A CONTROL MUST GO, THE FOCUS IS PLACED RATHER THAN DROPPED. If the tier that had focus
   * still has a control, it kept focus by itself. If that tier became read-only, focus moves to the
   * first tier below it that can still be acted on — which is where the person was going anyway.
   */
  function tierPlan(narrowed, dim, i) {
    var values = narrowed.options[dim] instanceof Array ? narrowed.options[dim] : [];
    var current = str(narrowed.scope[dim]);
    return {
      dim: dim,
      values: values,
      current: current,
      /* ONE OPTION IS A FACT, NOT A CHOICE (§7). A tier the universe has already resolved renders
         as read-only context rather than as a dropdown holding the value it already has. */
      shape: (values.length === 1 && current === values[0]) ? 'context' : 'select',
      disabled: values.length === 0,
      controlId: 'psbSite' + dim.charAt(0).toUpperCase() + dim.slice(1),
      /* AN UNUSABLE TIER SAYS WHY. "Choose a country first" and "Choose a marketplace" are
         different situations and a person can act on only one of them. */
      placeholder: values.length > 0
        ? ('Choose ' + P.SITE_LABELS[dim].toLowerCase())
        : ('Choose ' + P.SITE_LABELS[P.SITE_TIERS[i > 0 ? i - 1 : 0]].toLowerCase() + ' first')
    };
  }

  /** Is the field on screen still the right SHAPE for this plan, offering exactly these options? */
  function fieldMatches(field, plan) {
    if (!field || field.getAttribute('data-psb-shape') !== plan.shape) return false;
    if (plan.shape === 'context') return true;
    var sel = field.querySelector('select');
    if (!sel) return false;
    if (String(sel.getAttribute('data-psb-options') || '') !== plan.values.join('\u001f')) return false;
    return String(sel.getAttribute('data-psb-placeholder') || '') === plan.placeholder;
  }

  function buildField(plan, onPick, doc) {
    var field = doc.createElement('div');
    field.className = 'psb-site__field filter-group';
    field.setAttribute('data-psb-site-field', plan.dim);
    field.setAttribute('data-psb-shape', plan.shape);

    var lab = doc.createElement('label');
    lab.className = 'psb-site__label';
    /* The label names the control rather than sitting above it by coincidence: clicking it
       focuses the select, and a screen reader reads the pair as one thing. */
    lab.setAttribute('for', plan.controlId);
    lab.textContent = P.SITE_LABELS[plan.dim];
    field.appendChild(lab);

    if (plan.shape === 'context') {
      var v = doc.createElement('span');
      v.className = 'psb-site__value';
      v.setAttribute('data-psb-site-value', plan.dim);
      v.textContent = plan.current;
      field.appendChild(v);
      return field;
    }

    var sel = doc.createElement('select');
    sel.className = 'psb-site__select';
    sel.id = plan.controlId;
    sel.setAttribute('data-psb-site-dim', plan.dim);
    sel.setAttribute('aria-label', P.SITE_LABELS[plan.dim]);
    /* WHAT THIS CONTROL CURRENTLY OFFERS, written on the control. It is how the next paint knows
       whether this node is still the right one to keep — comparing the rendered <option>s would
       read the placeholder as an option and rebuild on every pick, which is the defect. */
    sel.setAttribute('data-psb-options', plan.values.join('\u001f'));
    sel.setAttribute('data-psb-placeholder', plan.placeholder);

    var ph = doc.createElement('option');
    ph.setAttribute('value', '');
    ph.textContent = plan.placeholder;
    sel.appendChild(ph);

    plan.values.forEach(function (value) {
      var o = doc.createElement('option');
      o.setAttribute('value', value);
      o.textContent = value;
      sel.appendChild(o);
    });

    sel.disabled = plan.disabled;
    if (!plan.disabled && typeof onPick === 'function') {
      /* THE HANDLER READS THE CONTROL IT IS ON, and the controller reads its own canonical scope.
         Nothing about the previous narrowing is captured here, so a listener that outlives a
         repaint cannot act on a scope that has since changed. */
      sel.addEventListener('change', function () { onPick(plan.dim, sel.value); });
    }
    field.appendChild(sel);
    return field;
  }

  /* THE LOWEST COMMON DENOMINATOR OF TWO DOCUMENTS. This renderer runs in a browser and against
     the minimal document P1-B8D-R5's suite builds, where an element has children and attributes
     and very little else. `children`, `select.options` and `replaceChild` are conveniences of the
     full DOM; `childNodes`, `appendChild` and `removeChild` are what both have. */
  function kidsOf(node) {
    var out = [];
    var kids = (node && node.childNodes) || [];
    for (var i = 0; i < kids.length; i++) { if (kids[i]) out.push(kids[i]); }
    return out;
  }
  function replaceInPlace(parent, oldNode, newNode) {
    if (typeof parent.replaceChild === 'function') { parent.replaceChild(newNode, oldNode); return; }
    parent.removeChild(oldNode);
    parent.appendChild(newNode);
  }

  /** Put the canonical value into a field that is being kept. */
  function applyValue(field, plan) {
    if (plan.shape === 'context') {
      var v = field.querySelector('[data-psb-site-value]');
      if (v) v.textContent = plan.current;
      return;
    }
    var sel = field.querySelector('select');
    if (!sel) return;
    if (String(sel.value) !== plan.current) sel.value = plan.current;
    /* THE ATTRIBUTE FOLLOWS THE PROPERTY, so a serialised copy of the document shows what the
       live one shows. Without it a print, a snapshot or a dumped DOM reports the placeholder.

       THROUGH `childNodes`, NOT `select.options`. `HTMLSelectElement.options` is a convenience of
       the full DOM and this function also runs against the minimal document P1-B8D-R5's suite
       builds, where a <select> is an element with children and nothing more. Reading the children
       is what both have, and it is what this function actually needs. */
    var kids = sel.childNodes || [];
    for (var i = 0; i < kids.length; i++) {
      var opt = kids[i];
      if (!opt || opt.tagName !== 'OPTION' || !opt.setAttribute) continue;
      var val = opt.getAttribute ? String(opt.getAttribute('value')) : String(opt.value);
      if (val === plan.current && plan.current !== '') {
        opt.setAttribute('selected', 'selected');
      } else if (opt.removeAttribute) {
        opt.removeAttribute('selected');
      }
    }
    sel.disabled = plan.disabled;
  }

  /**
   * Render the three tiers into `host`. `onPick(dim, value)` is called with the raw value of the
   * control that changed; the controller decides what that means.
   *
   * FAILS CLOSED. Without a narrowing there is nothing legal to offer, so the host is emptied and
   * no control is drawn. An empty dropdown beside a "could not read the list" notice is the shape
   * that reads as success, and this page has one of those already.
   */
  P.renderSiteChooser = function (host, narrowed, onPick, doc) {
    doc = doc || (host && host.ownerDocument) || root.document;
    if (!host) return null;
    if (!isObj(narrowed) || !isObj(narrowed.options) || !isObj(narrowed.scope)) {
      while (host.firstChild) host.removeChild(host.firstChild);
      return null;
    }

    /* WHICH TIER THE PERSON IS ON, read BEFORE anything is replaced. */
    var active = doc.activeElement;
    var focusedDim = active && active.getAttribute
      ? str(active.getAttribute('data-psb-site-dim')) : '';

    /* P1-B8D-R6 — THE SHARED FILTER BAR, NOT A PRIVATE COPY OF ONE.
       `km-filter-bar` + `filter-group` are the Operation System's own contract for a label above a
       control: base.css calls the `--filter-*` tokens the single source of truth for every filter
       and says never to hardcode them per page, and `.km-filter-bar .filter-group label` is the one
       owner of the label spec. Carrying the classes means this page inherits both — the 38px
       control height, the border, the radius, the focus ring and the 12px muted label — instead of
       restating them and drifting. The `psb-site__*` classes stay for what is local: the read-only
       tier, and the field's place in the consolidated panel. */
    var bar = host.querySelector('.psb-site');
    if (!bar) {
      while (host.firstChild) host.removeChild(host.firstChild);
      bar = doc.createElement('div');
      bar.className = 'psb-site km-filter-bar';
      bar.setAttribute('data-cy', 'psb-site');
      host.appendChild(bar);
    }

    var replaced = {};
    var plans = P.SITE_TIERS.map(function (dim, i) { return tierPlan(narrowed, dim, i); });

    plans.forEach(function (plan) {
      var existing = bar.querySelector('[data-psb-site-field="' + plan.dim + '"]');
      if (fieldMatches(existing, plan)) {
        applyValue(existing, plan);
      } else {
        var field = buildField(plan, onPick, doc);
        if (existing) { replaceInPlace(bar, existing, field); } else { bar.appendChild(field); }
        applyValue(field, plan);
        replaced[plan.dim] = true;
      }
    });

    /* Anything that is not one of the three tiers does not belong in this bar. */
    kidsOf(bar).forEach(function (n) {
      if (!n.getAttribute || str(n.getAttribute('data-psb-site-field')) === '') bar.removeChild(n);
    });

    /* ORDER IS PART OF THE CONTRACT: Company, then Country, then Marketplace, left to right,
       whatever was kept and whatever was rebuilt.

       AND IT IS ONLY TOUCHED WHEN IT IS WRONG. Moving a node is a remove and an insert, and a
       browser blurs whatever was focused inside one — so a reorder running on every paint would
       undo, every time, the exact thing this rewrite exists to protect. The order can only change
       when a field was rebuilt, and a rebuild is already placing the focus. */
    var orderNow = kidsOf(bar).map(function (n) {
      return n.getAttribute ? str(n.getAttribute('data-psb-site-field')) : '';
    }).join(',');
    if (orderNow !== P.SITE_TIERS.join(',')) {
      P.SITE_TIERS.forEach(function (dim) {
        var n2 = bar.querySelector('[data-psb-site-field="' + dim + '"]');
        if (n2) bar.appendChild(n2);
      });
    }

    /* THE FOCUS, PLACED RATHER THAN DROPPED — and only when this paint actually took it away. */
    if (focusedDim !== '' && replaced[focusedDim] === true) {
      var order = P.SITE_TIERS.indexOf(focusedDim);
      var target = null;
      for (var k = order; k < P.SITE_TIERS.length && !target; k++) {
        var cand = bar.querySelector('[data-psb-site-dim="' + P.SITE_TIERS[k] + '"]');
        if (cand && !cand.disabled) target = cand;
      }
      if (target && typeof target.focus === 'function') target.focus();
    }
    return bar;
  };

  /* ==============================================================================================
     THE PAGE HELP BUTTON  (P1-B8D-R7 §8)

     WHAT IT REPLACES. The awaiting state used to carry a two-line paragraph explaining why a board
     reads one site at a time — permanently, in the largest block on the page, above the three
     controls it was explaining. It is a good paragraph and it answers a question a person asks
     once. So it moves behind a control, and the control is the one the rest of this board already
     uses for exactly this: click or Enter/Space toggles, Escape closes, a click outside closes,
     the button carries `aria-expanded` and `aria-controls`, and the panel is a `role="note"`.

     IT IS NOT A HOVER TOOLTIP, and it is not a bare `?`. Hover alone excludes keyboard users and
     every touch device. The glyph is an `i`, because the chart's `?` controls are being taken off
     the screen in the same round and a page that removed six question marks and added a seventh
     would have moved one rather than made a decision.

     THE PAGE OWNS IT, NOT THE BOARD. `psb-board-ui.js` re-renders its own header furniture on every
     interaction and only exists once a workspace has loaded; this button has to be there before a
     site is chosen, which is precisely when its paragraph is worth reading.
     ============================================================================================== */

  P.helpOpen = false;

  P.closeHelp = function (doc) {
    doc = doc || root.document;
    P.helpOpen = false;
    var panel = doc && doc.getElementById(P.HELP_PANEL_ID);
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    var btn = doc && doc.getElementById(P.HELP_BUTTON_ID);
    if (btn) btn.setAttribute('aria-expanded', 'false');
  };

  P.toggleHelp = function (doc, open) {
    doc = doc || root.document;
    var host = doc.getElementById(P.HELP_HOST_ID);
    var btn = doc.getElementById(P.HELP_BUTTON_ID);
    if (!host || !btn) return false;
    var want = open === undefined ? !P.helpOpen : !!open;
    if (!want) { P.closeHelp(doc); return false; }
    if (P.helpOpen) return true;
    var panel = doc.createElement('div');
    panel.className = 'psb-help__panel';
    panel.id = P.HELP_PANEL_ID;
    panel.setAttribute('role', 'note');
    panel.setAttribute('aria-label', P.HELP.heading);
    var h = doc.createElement('div');
    h.className = 'psb-help__head';
    h.textContent = P.HELP.heading;
    panel.appendChild(h);
    P.HELP.paragraphs.forEach(function (t) {
      var p = doc.createElement('p');
      p.className = 'psb-help__p';
      p.textContent = t;
      panel.appendChild(p);
    });
    var close = doc.createElement('button');
    close.className = 'psb-help__close';
    close.setAttribute('type', 'button');
    close.textContent = 'Close';
    close.addEventListener('click', function (ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      P.closeHelp(doc);
      if (typeof btn.focus === 'function') btn.focus();
    });
    panel.appendChild(close);
    host.appendChild(panel);
    btn.setAttribute('aria-expanded', 'true');
    P.helpOpen = true;
    return true;
  };

  /**
   * Build the button once, into the header's action group. Idempotent: a second mount finds the
   * button already there and leaves it, rather than adding a second one.
   */
  P.renderHeaderHelp = function (doc) {
    doc = doc || root.document;
    var host = doc.getElementById(P.HELP_HOST_ID);
    if (!host) return null;
    if (doc.getElementById(P.HELP_BUTTON_ID)) return doc.getElementById(P.HELP_BUTTON_ID);

    var btn = doc.createElement('button');
    btn.className = 'psb-help__btn';
    btn.id = P.HELP_BUTTON_ID;
    btn.setAttribute('type', 'button');
    /* AN ACCESSIBLE NAME THAT SAYS WHAT IT OPENS. "More information" names the control's genre and
       not its subject, which is no help at all in a page that will one day have two of them. */
    btn.setAttribute('aria-label', 'About this board: ' + P.HELP.heading);
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', P.HELP_PANEL_ID);
    btn.setAttribute('title', P.HELP.heading);
    btn.textContent = 'i';
    btn.addEventListener('click', function (ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      P.toggleHelp(doc);
    });
    btn.addEventListener('keydown', function (ev) {
      if (!ev) return;
      if (ev.key === 'Escape') { P.closeHelp(doc); return; }
      /* Enter and Space already activate a <button>; they are not re-implemented here. */
    });
    host.appendChild(btn);

    /* THE TWO WAYS OUT, REGISTERED ONCE FOR THE PAGE rather than once per open. A listener added
       on every open is a listener removed on no close, and after a dozen opens one Escape would
       fire a dozen times — the same argument psb-board-ui.js makes about its own popovers. */
    if (!P.helpListenersBound) {
      P.helpListenersBound = true;
      doc.addEventListener('keydown', function (ev) {
        if (!ev || ev.key !== 'Escape' || !P.helpOpen) return;
        var b = doc.getElementById(P.HELP_BUTTON_ID);
        P.closeHelp(doc);
        if (b && typeof b.focus === 'function') b.focus();
      });
      doc.addEventListener('click', function (ev) {
        if (!P.helpOpen) return;
        var panel = doc.getElementById(P.HELP_PANEL_ID);
        /* A CLICK INSIDE THE PANEL IS NOT A CLICK OUTSIDE IT. The button stops its own event; a
           reader selecting the text of the paragraph must not close what they are reading. */
        if (panel && ev && ev.target && panel.contains(ev.target)) return;
        P.closeHelp(doc);
      });
    }
    return btn;
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
      /* BEFORE THE READ, not after it. Its paragraph explains why the page is asking for a site,
         which is the state the page is in while the read is still outstanding. */
      P.renderHeaderHelp(doc);
      /* The route the sidebar child asked for, consumed ONCE. Left in place it would re-select that
         view on a later visit that asked for a different one — a stale intent is worse than none,
         because it looks like a working restore. */
      var wanted = (root.KM && root.KM.pendingRoute) || '';
      if (root.KM) root.KM.pendingRoute = null;
      /* P1-B8D-R8 §7 — THE SAME PAGE, NOT A NEW ONE. A controller parked by the last unmount is
         taken back if it can still put its own board up; it is consumed either way, so a restore
         that fails for any reason falls through to a completely ordinary first load rather than
         leaving something half-restored behind it. */
      var parked = P.parked;
      P.parked = null;
      if (parked && parked.restore() === true) {
        P.lastController = parked;
        if (str(wanted) !== '') P.applyRoute(wanted, boardOf({}));
        return { state: parked.state, mounted: true, may_analyse: true, refusals: [],
          restored: true };
      }
      return P.mount({ route: wanted });
    });
  };

  /**
   * The controller the last unmount put down, or null.
   *
   * It is a MODULE field rather than something hung on the DOM, because what it holds — a universe,
   * a narrowed scope and one workspace answer — is exactly as long-lived as this module: a reload
   * destroys both together, which is what makes "nothing here can be stale" true by construction
   * rather than by a freshness check nobody would run.
   */
  P.parked = null;

  /**
   * The lifecycle unmount. The MARKUP stays — the partial is fetched once and re-fetching it would be
   * a request for something already in the document. The CONTROLLER does not: it holds a universe, a
   * chosen scope, a request token and a mounted board, and carrying those into the next visit is how
   * one site's scope ends up above another site's rows.
   */
  P.onUnmount = function () {
    /* P1-B8D-R8 §7 — PUT IT DOWN, DO NOT THROW IT AWAY. A controller that is showing a complete
       site is kept for the next visit; anything less than that (no universe, no complete scope, no
       loaded board) is not worth restoring and is dropped, so the next visit starts clean. The
       comment above used to say carrying these across "is how one site's scope ends up above
       another site's rows" — which is true of carrying HALF of them, and this carries all or
       nothing. */
    var prev = P.lastController;
    P.parked = (prev && prev.universe && prev.universe.state === 'OK'
      && prev.narrowed && prev.narrowed.complete === true
      && prev.mounted === true && prev.adapter) ? prev : null;
    P.lastController = null;
    var doc = root.document;
    var sec = doc && doc.getElementById(P.SECTION_ID);
    if (sec && sec.classList) sec.classList.remove('active');
    var host = doc && doc.getElementById('psb-state-host');
    if (host) { while (host.firstChild) host.removeChild(host.firstChild); }
    /* THE CHOOSER GOES WITH THE CONTROLLER THAT OWNED IT. Its options came from one universe read
       and its handlers close over one controller; leaving it on screen would offer the next visit a
       set of sites nothing is listening to. */
    var sh = doc && doc.getElementById(P.SITE_HOST_ID);
    if (sh) { while (sh.firstChild) sh.removeChild(sh.firstChild); }
    /* AND THE BOARD — TOLD TO STOP FIRST, then emptied. It keeps a size observer on `#view`, and
       the section going `display: none` is a size change it answers by repainting the whole chart
       one frame later, into the host this loop has just emptied. Measured at three runs in six;
       that repaint IS the old board the operator found underneath a reset chooser. */
    var b = root.PSB_BOARD;
    if (b && typeof b.unmount === 'function') b.unmount();
    P.BOARD_HOSTS.forEach(function (id) {
      var n = doc && doc.getElementById(id);
      while (n && n.firstChild) n.removeChild(n.firstChild);
    });
    P.closeHelp(doc);
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
    // P1-B8B — the identity exists; the URL binding does not, and the distinction is the point.
    // Every view has a canonical route, carried on the sidebar child and on the tab, applied on
    // mount and readable at any time. Nothing writes it to `location`, because this shell has no
    // router to read it back and a URL that cannot be pasted is worse than none.
    views_have_canonical_routes: true,
    route_base: 'product-strategy',
    binds_route_to_url: false,
    url_binding_owner: 'shell (not this page) — P1-B8C',
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
    derives_site_universe_from_workspace_response: false,
    // P1-B8D-R5 — the universe is now REACHABLE. It was read, adapted and narrowed before this
    // round too; what did not exist was any way for a person to act on it.
    site_chooser_host: 'psb-site-host',
    site_chooser_owner: 'this page controller (never psb-board-ui renderScope)',
    site_options_source: 'productPricing.siteUniverse.get, via SU.narrow — and nothing else',
    default_site: null,
    auto_selects_a_site: false,
    reselecting_the_same_site_reads_again: false,
    // P1-B8D-R7 — the selection survives a repaint, and the board does not survive its site.
    chooser_rebuilds_on_every_pick: false,
    chooser_restores_state_into_existing_controls: true,
    board_is_torn_down_when_state_is_not_ok: true,
    withdrawing_a_scope_invalidates_an_outstanding_read: true,
    board_hosts: P.BOARD_HOSTS.join(','),
    site_selectors_rendered_by_board: false,
    long_explanation_is_behind: 'psbPageHelp (one page-level info button)',
    page_help_button_glyph: 'i',
    help_opens_on: 'click and keyboard; never hover alone'
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = P; }
  root.KM = root.KM || {};
  root.KM.pages = root.KM.pages || {};
  root.KM.pages.productStrategyBoard = P;
}(typeof globalThis !== 'undefined' ? globalThis : this));
