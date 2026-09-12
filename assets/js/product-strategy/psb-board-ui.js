/* ==================================================================================================
   PRODUCT STRATEGY COMMAND CENTER — non-runtime prototype renderer            P0-R3-R2
   ==================================================================================================

   THIS FILE RENDERS. It does not hold data and does not know where data comes from: it is handed an
   adapter that satisfies ProductStrategyDataContract and asks that adapter for rows. Swap the
   adapter and nothing here changes — which is the point of the seam, and the thing P1-B1 has to be
   able to do without touching a chart.

   IT READS NOTHING AND STORES NOTHING. No request of any kind, no browser storage, no dependency.
   The sidebar's collapsed state lives in a variable, not in localStorage: a preference worth
   persisting is a preference worth an owner, and this page has neither.

   WHAT P0-R3-R2 CHANGED
     CATEGORY IS THE FIRST SCOPE. An electric can opener is not an alternative to a spatula, so they
     never share a price axis. Every chart, table, summary and finding on a category page comes from
     ONE scoped row set, and the cross-category view is cards and a table — never a shared Y axis.

     THE Y AXIS IS FIVE UNITS PER TICK, ALWAYS. floor(min/5)*5 to ceil(max/5)*5, step 5, every tick
     drawn. When the range is tall the PIXELS compress; the SCALE never does. An axis that quietly
     switches to 20s to keep itself tidy is an axis that has stopped answering the question it was
     drawn to answer.

     THE EVERYDAY PRICE IS A PHOTOGRAPH. Where the image identity is verified the marker IS the
     product, sitting with its CENTRE on the price. The rect is placed at cy - size/2 and the anchor
     dot is drawn at cy, so enlarging the picture on hover cannot move the datum.

   ORDER OF THE FILE
     1  integer-cents arithmetic          6  the chart, the five-unit axis and the image markers
     2  the adapter seam and pipeline     7  views: overview, category, risk, quality
     3  variant grouping                  8  Strategy Workspace and Advanced details
     4  currency panels                   9  shell: sidebar, scope ladder, print, presentation
     5  the analysis engine              10  automated DOM assertions, then boot
   ================================================================================================== */

(function () {
  'use strict';

  var CONTRACT = this.PSB_CONTRACT;
  var PREVIEW = this.PSB_PREVIEW;
  /* THE SINGLE SOURCE OF TRUTH FOR EVERY DERIVATION. If this is missing the page must not guess its
     way to a chart: an absent pipeline is a broken build, not a reason to re-implement the rules. */
  var SEL = this.PSB_SELECTORS;
  if (!SEL) throw new Error('PSB_SELECTORS is not loaded — selectors.js must precede prototype.js');

  /* ================================================================================================
     1  EVERY RULE BELOW LIVES IN selectors.js, AND THESE ARE THE NAMES THIS FILE CALLS THEM BY.

     P1-B2 moved the whole data pipeline out of this file. What is left here is rendering. The names
     are kept — `cents`, `groupNodes`, `analyse`, `tierOf` — so the chart, the tables and the two
     hundred DOM assertions below did not have to be rewritten to prove a refactor, but each one is now
     a single delegation and NOT a second copy. That distinction is the point: two implementations of
     the grouping rule would agree on the day they were written and drift afterwards.

     INTEGER CENTS, still, and still not a style preference: 32.99 - 24.99 is 8.000000000000004 in
     IEEE-754, so a step exactly equal to a threshold of 8.00 would satisfy `distance > threshold`, be
     reported as a gap, and render through two decimals as "gap 8.00 exceeds threshold 8.00" — a
     measurement that refutes itself on screen.
     ================================================================================================ */
  function cents(v) { return SEL.cents(v); }
  function fromCents(c) { return SEL.fromCents(c); }
  function money(c, cur) { return SEL.money(c, cur); }
  function priceSignature(r) { return SEL.priceSignature(r); }
  function groupNodes(rows) { return SEL.groupNodes(rows); }
  function labelOf(r) { return SEL.labelOf(r); }
  function splitByCurrency(nodes) { return SEL.splitByCurrency(nodes); }
  function sellInterval(n) { return SEL.sellInterval(n); }
  function liveOnlyInterval(n) { return SEL.liveOnlyInterval(n); }
  function analyse(panel, thrC) { return SEL.analyse(panel, thrC); }
  function tierOf(panel, node) { return SEL.tierOf(panel, node); }
  function withinPeriod(r) { return SEL.withinPeriod(r); }
  var CLASS = SEL.CLASS;
  var PREVIEW_TODAY = SEL.PREVIEW_TODAY;

  /* ================================================================================================
     2  THE ADAPTER SEAM, AND THE PIPELINE.

     The adapter now hands over the CANONICAL universe — every site it knows about, unfiltered — and
     every narrowing happens in selectors.js afterwards. That is the opposite of what this file used to
     do, and the reason is a defect this round measured rather than suspected:

         the adapter took `{category, company, country, ...}` as one flat sieve and also published a
         `categories` list it had computed ONCE over every site. On DE — which sells one category — the
         menu offered three, and picking either of the other two produced an empty category card for
         products that country does not stock.

     A menu can only be right if it is built from the rows that survived membership, so membership has
     to happen first, which means the pipeline has to own the order. `ADAPTER.categories` no longer
     exists to fall back to.
     ================================================================================================ */
  var ADAPTER = null;              // set by boot(); the renderer never reaches past it
  var CANON = null;                // the last canonical LoadResult
  var LOAD = null;                 // provenance and notice, for the banner and Advanced details
  var MODEL = null;                // the whole derived model for the current scope
  var ROWS = [];                   // view rows for the CURRENT scope, overlay applied

  /* ------------------------------------------------------------------------------------------------
     THE STATE. One object, no storage of any kind, and reload starts again from nothing.

     `overrides` is the scenario. It is here, in the same object as the view and the filters, precisely
     because that object has no persistence: a simulated price is discarded by the same mechanism that
     forgets which tab was open. There is no localStorage, no sessionStorage, no IndexedDB, no cookie
     and no URL parameter anywhere in this prototype, and the suite checks the source text for each.

     THE SITE DEFAULTS TO A REAL, COMPLETE ONE. Not to ALL. A price ladder needs one currency, a
     scenario needs one site, and a board that opens on an aggregate would have to refuse both on the
     first screen a person sees.
     ------------------------------------------------------------------------------------------------ */
  /* P1-B4 §3.4 — THE DEFAULT, WRITTEN DOWN ONCE.
     "Is this filter non-default?" is the whole question the `More filters · 1` count asks, and it
     cannot be asked of a number that exists only as a literal in an initialiser. */
  var DEFAULT_THRESHOLD_C = 800;

  var STATE = {
    view: 'overview',              // overview | category | risk | quality | workspace | advanced
    rail: false,                   // sidebar collapsed to an icon rail — a variable, never storage
    category: null,                // null on the overview; a category name on every other view
    company: 'Kitchen Mama', country: 'US', marketplace: 'Amazon',
    currency: 'ALL', series: 'ALL',
    search: '',
    includeInactive: false,
    thresholdC: DEFAULT_THRESHOLD_C,
    selected: {},
    drawerOpen: false,
    advancedOpen: false,
    presentation: false,
    elements: [],
    seq: 0,
    /* ---- P1-B2A: what the chart DRAWS. UI state, and only UI state ----
       Layers, the view mode and the zoom change what is painted and nothing else. None of them is
       written to storage, none reaches the canonical rows, and none can move a price: the zoom is an
       element width over an unchanged viewBox, and a hidden layer is an element that was not created.
       A reload restores the defaults because a reload builds this object again. */
    layers: { images: true, msrp: true, floor: true, promo: true, scenario: true, steps: true },
    viewMode: 'detail',            // detail | clean — a shortcut that SETS layers, not a third mode
    zoom: 'fit',                   // fit | 1 | 1.25 | 1.5 — COMFORTABLE ONLY, see chartMode
    /* ---- P1-B2C: HOW BIG, DECIDED BY THE ROOM THERE IS ----
       `chartMode` is auto or comfortable, `fullscreen` is a separate flag rather than a third mode
       because it composes with both: going fullscreen and coming back must not change which of the
       two you were in. `box` is the last measurement, quantised — the only measured thing in the
       state, and it is an INPUT to a pure function rather than a decision. */
    chartMode: 'auto',             // auto | comfortable
    fullscreen: false,
    layersOpen: false,             // the Layers popover, so six checkboxes are not a permanent row
    box: { w: null, h: null },
    boxKey: '',                    // what the last layout was derived from; a resize that matches
                                   // it is not a resize, and redrawing on it is how a loop starts
    fsReturnScroll: 0,
    /* P1-B4 §3 — MORE FILTERS IS A POPOVER, NOT A SECTION. `advancedOpenFilters` expanded a
       full-width band that pushed the chart down by its own height every time it opened; this holds
       the same two settings in an absolutely-positioned panel that overlays instead of displacing. */
    moreFiltersOpen: false,
    openPopover: null,             // the id of the one open info popover, or null
    catSearch: '',
    dqDetailOpen: false,
    /* MEETING MODE STARTS CLOSED, and that is a density decision rather than a preference. The
       scenario is a deliberate act somebody comes to the page to perform; the price architecture is
       what the page is FOR. With the panel open by default the chart began below the fold at
       1920x1080 — measured on a screenshot, because no DOM assertion can see a fold. It opens in one
       click and it stays open for the rest of the session. */
    meetingOpen: false,
    catMenuOpen: false,
    /* P1-B4 §4 — NO LONGER REACHABLE FROM THE UI, AND NOT A SETTING A PERSON CAN FIND.
       The stress fixture is a density load test, not a product feature. It stays in the state
       because the test harness and an explicit developer mode still switch adapters with it; what
       is gone is the checkbox, and there is no URL parameter that could set it. */
    stress: false,
    /* ---- the scenario, in memory and nowhere else ---- */
    overrides: {},                 // overrides[siteKey][series][priceField] = {mode, value}
    undoStack: [],                 // previous override objects; Undo pops one. Also in memory only.
    scenarioSeries: '',            // NO default of 'ALL': a reach you cannot see is not a scenario
    scenarioField: SEL.SCENARIO_DEFAULT_FIELD,
    scenarioAdjustment: 'set',
    scenarioInput: '',
    scenarioRefusal: null,
    scenarioNotice: null
  };

  /* THE TWO SHORTCUTS, AS LAYER SETS. Clean and Detail are not a third kind of state that the
     individual checkboxes then have to agree with — they WRITE the checkboxes, which is why a person
     can press Clean and then re-enable one layer without the mode fighting them. */
  function applyViewMode(mode) {
    STATE.viewMode = mode;
    LAYERS.forEach(function (l) { STATE.layers[l.id] = (mode === 'clean') ? l.clean : true; });
  }

  function siteSelection() {
    return { company: STATE.company, country: STATE.country, marketplace: STATE.marketplace };
  }
  function siteIdentity() { return SEL.deriveSiteIdentity(siteSelection()); }

  /* THE DIMENSION FILTERS — what narrows INSIDE the site, and nothing about which site it is. */
  function scopeFilters(categoryOverride) {
    var cat = categoryOverride === undefined ? STATE.category : categoryOverride;
    return {
      category: cat || 'ALL',
      currency: STATE.currency,
      series: STATE.series,
      search: STATE.search
    };
  }

  /* ONE MODEL PER RENDER, and every view reads it. A view that re-derived its own would be the third
     chance to narrow differently. */
  function buildModel(categoryOverride) {
    return SEL.deriveBoardModel({
      rows: CANON.rows,
      selection: siteSelection(),
      filters: scopeFilters(categoryOverride),
      overrides: STATE.overrides,
      includeInactive: STATE.includeInactive,
      thresholdC: STATE.thresholdC
    });
  }

  function reload() {
    CANON = ADAPTER.loadCanonical();
    LOAD = CANON;
    MODEL = buildModel();
    ROWS = MODEL.rows;
  }

  /* ------------------------------------------------------------------------------------------------
     THE CATEGORY MENU. Six places used to read `ADAPTER.categories`, a cross-site list computed once.
     They all read this instead, and this reads the CURRENT site's eligible universe.

     THERE IS NO FALLBACK AND NO DEFAULT LIST. If a site sells nothing, the answer is an empty array
     and the screen shows a true empty state. An empty menu and a menu of three demonstration values
     are different answers and must look different.
     ------------------------------------------------------------------------------------------------ */
  function categoryValues() {
    var m = MODEL || buildModel();
    return m.categoryOptions.options.map(function (o) { return o.value; });
  }
  function categoryOptionRows() {
    var m = MODEL || buildModel();
    return m.categoryOptions;
  }
  /** The first category of THIS site, or null. Never index [0] of a list from somewhere else. */
  function firstCategory() {
    var v = categoryValues();
    return v.length ? v[0] : null;
  }

  /* ================================================================================================
     6  THE CHART. Hand-built inline SVG, no library.
     ================================================================================================ */
  var SVGNS = 'http://www.w3.org/2000/svg';

  /* ---- GEOMETRY -----------------------------------------------------------------------------------
     THE DESIGN WIDTH IS DECLARED, NOT MEASURED. The prototype reads no layout box anywhere (no
     getBoundingClientRect, no offsetWidth), because a chart whose geometry depends on when it is
     measured is a chart that draws differently on a slow load. Instead the SVG carries a viewBox at a
     declared design width and the element is sized in CSS, so it fits whatever card holds it — and the
     ZOOM control changes the element's width while the viewBox stays byte-identical. That is what makes
     "zoom cannot move a price" provable rather than promised. */
  /* ---- P1-B2C: THE SIZES MOVED OUT ---------------------------------------------------------------

     Every number that used to live here — the design width, the column bounds, the image size, the
     gridline pitch, the lane height — now comes from `chart-layout.js`, which decides them from the
     container, the viewport, the product count and the price domain. What is left below is what the
     RENDERER owns: how much room to reserve around the page, how far a measurement has to move
     before it is worth redrawing, and the fallbacks for a paint that happens before anything has
     been measured.

     WHY THE MEASUREMENT IS ALLOWED NOW. P1-B2A wrote "no layout box is measured anywhere", and the
     reasoning — a chart whose geometry depends on WHEN it was measured draws differently on a slow
     load — is still right. It is an argument against a HIDDEN dependency. Measuring in one named
     place and passing the result into a pure function as an argument is the opposite of hidden: the
     layout is still deterministic given its inputs, a test can hand it 1366x768 with no browser at
     all, and there is exactly one line in this file where a box is read.
     ------------------------------------------------------------------------------------------------ */
  var LAYOUT = (typeof PSB_CHART_LAYOUT !== 'undefined') ? PSB_CHART_LAYOUT : null;
  var TICK_C = 500;                 // the preferred step; the ladder lives in chart-layout.js
  /* READ FROM THE ENGINE, NOT RESTATED HERE. A second copy of a padding is a second padding the
     day somebody changes one of them. */
  var PAD_L = LAYOUT.PAD_L, PAD_R = LAYOUT.PAD_R, PAD_T = LAYOUT.PAD_T;

  /* THE PAGE CHROME, DECLARED RATHER THAN MEASURED AT SCROLL TIME. The height available to the
     chart is the viewport minus the furniture above and below it inside its own card. Deriving that
     from the card's live top offset would make the layout depend on the SCROLL POSITION, so the
     chart would re-lay-out as the reader scrolled past it — which is a worse defect than the one
     this round is fixing. These are the card's own furniture, and they do not move. */
  var CHROME_H = 232;               // banner + panel header + control bar + legend + card padding
  var CARD_INSET = 44;              // the panel's horizontal padding and borders
  var FS_CHROME_H = 132;            // the same, in fullscreen, where there is no page around it
  var MEASURE_QUANT = 8;            // sub-pixel jitter must not churn the layout
  var MK_HOVER_SCALE = 1.32;        // the hover growth, as a ratio of whatever the image size is

  /* ---- THE THREE BANDS SURVIVE P1-B2C; ONLY THEIR SIZES MOVED ------------------------------------

     P1-B2B found the product photographs touching the text beneath them, because labels were drawn
     inside the same coordinate space the prices use: the bottom of the scale and the top of the
     type were the same pixel, and an image centred on the lowest price hung half its height into
     the words. The answer was three stacked bands, and that answer is unchanged:

         PAD_T      air above the top gridline
         gutter     half an image plus five, so a marker on an end tick still clears the edge
         plot       the price scale: gridline to gridline, and NOTHING else lives here
         gutter     the same at the bottom
         lane       sku, price, variants — and no price coordinate at all

     What P1-B2C changes is that the gutter is now derived from the image size the layout engine
     chose, rather than from a 50px image that was assumed. A smaller photograph gets a smaller
     gutter and the guarantee is the same one: the gutter is always at least half an image.
     ------------------------------------------------------------------------------------------------ */

  /* ---- THE CHART LAYERS ---------------------------------------------------------------------------
     SIX, AND THERE ARE SIX BECAUSE THE DATA HAS SIX THINGS TO SHOW — not because six boxes looked
     balanced. In particular there is ONE band layer and not two:

         the legend's "Floor to list price" is a single band drawn from `minimum_price` to `msrp`, and
         `msrp` IS the list price — `pricing_list.msrp` is the only list-price column the schema has.

     An "MSRP" layer and a "List price" layer would therefore be two switches over one field: two names
     for the same number, which is how a reader comes to believe the board holds data it does not have.
     So the top cap is ONE layer, named for both words, and its tooltip says they are one column.

     The band LINE between the caps needs both ends. With one cap hidden it is not a shortened band, it
     is a line from a price to nothing, so it is not drawn at all.
     ------------------------------------------------------------------------------------------------ */
  var LAYERS = [
    { id: 'images', label: 'Product images', clean: true,
      help: 'The photograph on the everyday-price marker. Shown only where an authoritative record'
        + ' names that exact file; otherwise a neutral placeholder, never another product’s picture.' },
    { id: 'msrp', label: 'MSRP / list price', clean: false,
      help: 'The upper cap, from pricing_list.msrp. MSRP and "list price" are the SAME column — there'
        + ' is no second field — so this is one layer and not two.' },
    { id: 'floor', label: 'Lowest / floor price', clean: false,
      help: 'The lower cap, from pricing_list.minimum_price. With both caps shown the band between them'
        + ' is drawn; with one hidden there is no band, because a band needs two ends.' },
    { id: 'promo', label: 'Live promotion', clean: false,
      help: 'A campaign price whose start and end dates cover today. A promotion with no dates is not'
        + ' treated as live and carries no risk finding.' },
    { id: 'scenario', label: 'Proposed scenario', clean: false,
      help: 'The board-owned proposed price, including anything Meeting Mode is simulating. Never a'
        + ' price the company charges.' },
    { id: 'steps', label: 'Price gaps', clean: false,
      help: 'Difference between two adjacent everyday prices that exceeds the selected gap threshold. It indicates an unoccupied price tier for review; it is not an inventory shortage or an order status. Measured inside one category and one currency;'
        + ' nothing is ever compared across two, and the comparison is strictly greater than the'
        + ' threshold — a step exactly equal to it is not a gap.' }
  ];
  var ZOOMS = [
    { id: 'fit', label: 'Fit' },
    { id: '1', label: '100%' },
    { id: '1.25', label: '125%' },
    { id: '1.5', label: '150%' }
  ];

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.appendChild(document.createTextNode(String(text)));
    return n;
  }
  function svg(tag, attrs) {
    var n = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, String(attrs[k])); });
    return n;
  }
  function svgText(attrs, text) {
    var n = svg('text', attrs);
    n.appendChild(document.createTextNode(String(text)));
    return n;
  }
  function byId(id) { return document.getElementById(id); }
  /* P1-B7 — THREE CLASSES, TOGGLED, NEVER ASSIGNED. This used to be
     `document.body.className = …`, which does not add three classes so much as delete every other
     one. The board does not own `<body>` in the Operation System: utils/resizable-columns.js marks a
     column drag there, and the prototype's body carries `psb-page` so the scoped stylesheet can find
     it. A redraw is not a reason for either to disappear. */
  var BODY_STATE_CLASSES = ['presenting', 'has-scenario', 'is-fullscreen'];
  function setBodyState() {
    var b = document && document.body;
    if (!b) return;
    var on = [STATE.presentation === true, MODEL.scenario.active === true, STATE.fullscreen === true];
    var keep = String(b.className || '').split(/\s+/).filter(function (t) {
      return t !== '' && BODY_STATE_CLASSES.indexOf(t) < 0;
    });
    for (var i = 0; i < BODY_STATE_CLASSES.length; i++) {
      if (on[i]) keep.push(BODY_STATE_CLASSES[i]);
    }
    b.className = keep.join(' ');
  }
  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }
  function uniq(a) {
    var s = {}, o = [];
    a.forEach(function (x) {
      if (x !== null && x !== undefined && x !== '' && !s[x]) { s[x] = 1; o.push(x); }
    });
    return o;
  }
  function layerOn(id) { return STATE.layers[id] === true; }

  /* ---- THE FIVE-UNIT AXIS -----------------------------------------------------------------------
     axis_min = floor(min / 5) * 5      axis_max = ceil(max / 5) * 5      every tick is +5.
     No "nice number" search, no magnitude rounding, no adaptive step. The only thing that varies
     with the range is the PIXEL distance between ticks, and it is clamped so a tall category
     compresses rather than dropping a tick. */
  /* ---- THE AXIS AND THE PLOT HEIGHT NOW COME FROM THE ENGINE -------------------------------------

     `priceAxis` and `plotHeightFor` are gone. They encoded two decisions that turned out to be one
     decision taken twice: which tick step to use, and how tall the plot should be. Those cannot be
     settled independently — the step that fits depends on the height available, and the height that
     works depends on how many ticks the step produces — which is why splitting them produced a 48px
     floor that outranked being able to see the axis. `deriveResponsiveChartLayout` settles both at
     once, against the room there actually is.
     ------------------------------------------------------------------------------------------------ */

  /* ---- THE DOMAIN BELONGS TO THE SCOPE, NOT TO THE CHECKBOXES -------------------------------------

     P1-B2B ROOT CAUSE, and it was four lines. The axis extent used to be computed like this:

         [n._regular_c,
          layerOn('floor') ? n._min_c : null,
          layerOn('msrp')  ? n._msrp_c : null, ...]

     — the VISIBLE LAYERS decided the y domain. Switching off MSRP therefore removed the top of the
     range, every gridline re-spaced, the tick count changed, plotHeightFor returned a shorter plot,
     and so: the axis re-scaled, every product marker slid DOWN toward the labels, the photographs
     closed on the text, and the whole card changed height and shoved the comparison table. One
     checkbox, described as "show/hide a line", silently re-drew every coordinate on the chart.

     The comment above it said the reason: "a hidden MSRP must not keep reserving the top of the
     chart — the reason to switch it off is to get the space back". That is a real want, and it is
     the wrong trade: a person hides a layer to read the REST of the chart more easily, and a chart
     that moves everything else while they do it cannot be read at all. Reclaiming a few pixels is
     not worth making two views of the same prices disagree about where those prices are.

     So visibility and geometry are now two separate things:

         visibility      decides whether an element is DRAWN            (the checkboxes)
         domain          decides where every price SITS                 (the scope)

     The domain is the canonical price envelope of the products currently in scope — company,
     country, marketplace, category, series, currency. Not the whole database (a US ladder must not
     be stretched by a European one), and not the visible layers. Changing a ring of the scope
     re-derives it, which is right: those are different products. Ticking a box does not, which is
     also right: those are the same products.

     A SCENARIO CAN ONLY EVER EXPAND IT. The canonical values are always in the envelope, so a
     simulated price inside the existing range changes nothing at all; one outside pushes the bound
     out and the axis rounding supplies the padding. Resetting the scenario returns to exactly the
     canonical domain, because the canonical envelope never depended on the scenario in the first
     place. */
  function scopeDomain(ns) {
    var lo = null, hi = null, sLo = null, sHi = null;
    function take(v) {
      if (v === null || v === undefined) return;
      if (lo === null || v < lo) lo = v;
      if (hi === null || v > hi) hi = v;
    }
    function takeScenario(v) {
      if (v === null || v === undefined) return;
      if (sLo === null || v < sLo) sLo = v;
      if (sHi === null || v > sHi) sHi = v;
    }
    ns.forEach(function (n) {
      var c = n._canonical || {};
      /* CANONICAL, AND EVERY FIELD OF IT — including the ones whose layer is switched off. */
      take(c.regular_c === undefined ? n._regular_c : c.regular_c);
      take(c.proposed_c === undefined ? n._proposed_c : c.proposed_c);
      take(n._min_c);
      take(n._msrp_c);
      if (n._deal_live) take(n._deal_c);
      /* WHAT THE SIMULATION IS SHOWING, separately, so "did the scenario move the axis" is a fact
         the chart can publish rather than a thing a reader has to infer. */
      takeScenario(n._regular_c);
      takeScenario(n._proposed_c);
    });
    var expanded = (sLo !== null && lo !== null && sLo < lo)
      || (sHi !== null && hi !== null && sHi > hi);
    return {
      canonical_lo: lo, canonical_hi: hi,
      lo: (sLo !== null && (lo === null || sLo < lo)) ? sLo : lo,
      hi: (sHi !== null && (hi === null || sHi > hi)) ? sHi : hi,
      expanded_by_scenario: expanded
    };
  }

  function diamond(cx, cy, r) {
    return [cx, cy - r, cx + r, cy, cx, cy + r, cx - r, cy].join(',');
  }

  /* ---- THE EVERYDAY-PRICE MARKER, AND THE BLACK DOT THAT IS NO LONGER ON IT ----------------------
     P1-B2A ROOT CAUSE. There was exactly one source and it was here: a `<circle r="2">` of class
     `mk-anchor`, fill #14181f, appended LAST inside this function — therefore on top of the
     photograph, at the plate's exact centre. Its purpose was honest (make the datum visible and
     provably independent of the plate size) and its placement was not: the one pixel that proves the
     coordinate was sitting on the one thing a person came to look at.

     THE FIX IS NOT TRANSPARENCY. A dot made invisible is still a dot, still hit-tested, and still
     there for the next reader to rediscover. The circle is GONE. The datum is now a crosshair drawn
     BEHIND the plate and extending past it on both sides, so what remains visible are two short stubs
     that meet the gridline — more readable than the dot was, and nowhere near the picture. It keeps
     the class, the exact coordinate and the price, so the assertions that prove the plate is centred
     on its price still have something to read.

     No image -> the neutral placeholder, modelled on the Operation System's `.cr-img-placeholder`
     (campaign-risk.css:440): grey plate, light border, small muted text. Never a broken image, never
     another sku's photograph, never a shape that could be mistaken for a product.
     ------------------------------------------------------------------------------------------------ */
  function everydayMarker(g, cx, cy, n, lay) {
    var showImage = layerOn('images');
    var base = (lay && lay.imageSize) || 50;
    var size = showImage ? base : Math.round(base * 0.62);
    var half = size / 2;
    var grp = svg('g', { 'class': 'mk-reg-group', 'data-cy': cy });

    /* THE DATUM, FIRST, SO NOTHING OF IT LANDS ON THE PHOTOGRAPH. */
    grp.appendChild(svg('line', {
      x1: cx - half - 8, y1: cy, x2: cx + half + 8, y2: cy,
      'class': 'mk-anchor mk-reg', 'data-cx': cx, 'data-cy': cy,
      'data-price-c': n._regular_c,
      'data-frac': (lay && lay.frac !== undefined) ? lay.frac : ''
    }));

    grp.appendChild(svg('rect', { x: cx - half + 1, y: cy - half + 2, width: size, height: size,
      rx: 9, 'class': 'mk-img-shadow' }));
    var hasImage = showImage && !!n.image;
    grp.appendChild(svg('rect', { x: cx - half, y: cy - half, width: size, height: size, rx: 9,
      'class': 'mk-img-plate' + (hasImage ? '' : ' mk-fallback'),
      'data-role': hasImage ? 'image-marker' : 'fallback-marker' }));
    if (hasImage) {
      var im = svg('image', { x: cx - half + 3, y: cy - half + 3, width: size - 6, height: size - 6,
        preserveAspectRatio: 'xMidYMid meet', 'class': 'mk-img' });
      /* THE VALUE ON THE NODE, VERBATIM. No directory is prefixed and no extension appended here. */
      im.setAttribute('href', n.image);
      im.setAttribute('data-src', n.image);
      grp.appendChild(im);
    } else {
      /* ---- THE CODE HAS TO FIT THE PLATE IT IS WRITTEN ON ---------------------------------------

         P1-B2C made the plate a variable size, and this text did not follow it: `shortCode` kept
         returning up to seven characters, so at the overview density six characters of sku were
         painted across a 24px marker and forty-four of them ran into each other. A screenshot
         found it; every assertion about the plates was green, because none of them was about the
         text inside one.

         So the budget comes from the plate, and below four characters there is NO text at all. A
         two-letter stump is not an identifier, it is noise on top of the one thing the marker is
         for — and the sku is still on the column's hover panel, its focus panel, its aria-label
         and the lane beneath it. */
      var codeChars = Math.floor((size - 6) / 5.6);
      var codeFont = Math.max(7.5, Math.min(10.5, Math.round(size * 0.22 * 10) / 10));
      var missText = showImage
        ? 'No product photograph is on record for this product.'
        : 'Product images are switched off for this chart.';
      if (codeChars >= 4) {
        var t = svgText({ x: cx, y: cy + codeFont * 0.35, 'class': 'mk-fallback-text',
          'font-size': codeFont, 'data-chars': codeChars,
          'text-anchor': 'middle' }, shortCode(n.label, codeChars));
        var mt = svg('title', {});
        /* IN WORDS. This string is VISIBLE text on the category page, and that page carries no
           engineering vocabulary — the column it comes from is named in the layers popover
           instead, which a reader opens deliberately. */
        mt.appendChild(document.createTextNode(missText));
        t.appendChild(mt);
        grp.appendChild(t);
      } else {
        /* THE PLATE ALONE IS THE MARKER, and it still has to say what it is. */
        var pt = svg('title', {});
        pt.appendChild(document.createTextNode(n.label + ' \u2014 ' + missText));
        grp.childNodes[grp.childNodes.length - 1].appendChild(pt);
      }
    }
    g.appendChild(grp);
    return grp;
  }
  function shortCode(label, chars) {
    var s = String(label || '');
    var n = chars === undefined ? 7 : Math.max(1, chars);
    return s.length <= n ? s : s.slice(0, n);
  }

  /* ---- WHAT A PRICE GAP IS CALLED ----------------------------------------------------------------

     The chart used to write `10.00 open` beside the line. "Open" on a page that also shows orders,
     stock and promotions can be read as an open order, open stock, an opening price or an open
     promotion — and the one thing it meant was none of those: a rung of the price ladder that no
     product stands on. Every surface now says the same three words, in the panel's own currency.

     THE INTERNAL CONTRACT IS UNCHANGED. `kind: 'PRICE_GAP'`, `distance_c` and `threshold_c` keep
     their names in selectors.js and in every finding object, because renaming a key is a migration
     and this round is about what a person reads. The vocabulary changed; the data did not.
     ------------------------------------------------------------------------------------------- */
  function plain(c) {
    var v = fromCents(c);
    return v === null ? '\u2014' : String(v).replace(/\.00$/, '');
  }
  function gapText(c, cur, short) {
    return cur + ' ' + plain(c) + (short ? ' gap' : ' Price gap');
  }
  function gapAria(f, cur) {
    return gapText(f.distance_c, cur, false) + ' between ' + f.a.label + ' at '
      + money(f.a._regular_c, cur) + ' and ' + f.b.label + ' at ' + money(f.b._regular_c, cur)
      + '. Threshold in force ' + money(f.threshold_c, cur) + '.';
  }
  function gapTipLines(f, cur) {
    return [
      { t: gapText(f.distance_c, cur, false), head: true },
      { t: 'Lower  ' + f.b.label + '  ' + money(f.b._regular_c, cur) },
      { t: 'Upper  ' + f.a.label + '  ' + money(f.a._regular_c, cur) },
      { t: 'Gap  ' + money(f.distance_c, cur) },
      { t: 'Gap threshold in force  ' + money(f.threshold_c, cur) },
      { t: 'Difference between two adjacent everyday prices that exceeds the selected gap threshold. It indicates an unoccupied price tier for review; it is not an inventory shortage or an order status.' }
    ];
  }

  /* ---- THE MEASUREMENT, IN ONE PLACE -------------------------------------------------------------

     THE ONE LINE IN THIS FILE THAT READS A LAYOUT BOX. `#view` is observed rather than the chart's
     own container, and that is deliberate: `#view` is never replaced by a render, so an observer
     attached to it survives every redraw, while an observer on a node the renderer recreates would
     silently stop firing the first time the chart was drawn again.

     The width is quantised before it is used. A container that reports 1281.6px and then 1281.4px
     has not changed, and treating those as two layouts is how an observer turns into a loop.
     ------------------------------------------------------------------------------------------------ */
  function measureBox() {
    var host = byId('view');
    var w = host ? Number(host.clientWidth || 0) : 0;
    var vw = (typeof window !== 'undefined' && window) ? Number(window.innerWidth || 0) : 0;
    var vh = (typeof window !== 'undefined' && window) ? Number(window.innerHeight || 0) : 0;
    function q(v) { return Math.round(v / MEASURE_QUANT) * MEASURE_QUANT; }
    if (STATE.fullscreen) {
      return {
        w: vw > 0 ? q(vw - 48) : null,
        h: vh > 0 ? q(vh - FS_CHROME_H) : null
      };
    }
    return {
      w: w > 0 ? q(w - CARD_INSET) : null,
      h: vh > 0 ? q(vh - CHROME_H) : null
    };
  }
  /** The string that decides whether a resize is worth a redraw. */
  function boxKey(b) {
    return [b.w, b.h, STATE.chartMode, STATE.fullscreen ? 'fs' : '-', STATE.zoom].join('|');
  }

  function layoutFor(ns, dom) {
    var box = STATE.box || { w: null, h: null };
    return LAYOUT.deriveResponsiveChartLayout({
      containerWidth: box.w,
      availableHeight: box.h,
      productCount: ns.length,
      domainLowC: dom.lo,
      domainHighC: dom.hi,
      mode: STATE.fullscreen ? 'fullscreen' : STATE.chartMode
    });
  }

  function renderChart(panel, thrC, findings) {
    var ns = panel.plotted;
    var wrap = el('div', 'chartwrap');
    wrap.setAttribute('data-zoom', STATE.zoom);
    if (!ns.length) {
      wrap.appendChild(el('p', 'refusal', 'No product in this scope has an everyday price on '
        + 'record, so no axis is drawn. Nothing is substituted.'));
      return wrap;
    }
    /* THE AXIS RANGE FOLLOWS THE SCOPE, AND THE CHECKBOXES CANNOT REACH IT. See scopeDomain: the
       domain is the canonical envelope of these products, so a layer toggle moves nothing, and a
       scenario can only ever push a bound outward. P1-B2C changes how many PIXELS that domain is
       painted across; it does not touch which prices are in it. */
    var dom = scopeDomain(ns);
    var lay = layoutFor(ns, dom);
    var t = { lo: lay.axisLoC, hi: lay.axisHiC, step: lay.tickStepC, ticks: lay.ticks };
    var PLOT_H = lay.plotH;
    var PLOT_TOP = lay.plotTop;
    var PLOT_BOT = lay.plotBottom;
    var LANE_TOP = lay.laneTop;
    var W = lay.viewBoxW;
    var H = lay.viewBoxH;
    wrap.setAttribute('data-mode', lay.mode);
    wrap.setAttribute('data-density', lay.density);
    wrap.setAttribute('data-overflow', lay.overflow);

    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, 'class': 'chart',
      preserveAspectRatio: 'xMidYMid meet',
      role: 'img', 'data-tick-step-c': t.step, 'data-axis-min-c': t.lo, 'data-axis-max-c': t.hi,
      'data-currency': panel.currency, 'data-category': (ns[0] || {}).category || '',
      'data-vb-w': W, 'data-vb-h': H, 'data-col-w': lay.colW, 'data-zoom': STATE.zoom,
      /* PUBLISHED, SO THE CLAIM IS CHECKABLE RATHER THAN PROMISED. A reader — and the suite — can
         read what the domain was derived from, whether a scenario widened it, how many pixels a
         gridline is worth, where the label lane begins, and now: which mode and density the engine
         chose, what it measured to choose them, and what it could not make fit. */
      'data-domain-source': 'canonical-scope',
      'data-domain-lo-c': dom.canonical_lo === null ? '' : dom.canonical_lo,
      'data-domain-hi-c': dom.canonical_hi === null ? '' : dom.canonical_hi,
      'data-domain-expanded': String(dom.expanded_by_scenario),
      'data-plot-top': PLOT_TOP, 'data-plot-bottom': PLOT_BOT, 'data-plot-h': PLOT_H,
      'data-tick-px': lay.pxPerTick,
      'data-lane-top': LANE_TOP, 'data-lane-h': lay.laneH,
      'data-mode': lay.mode, 'data-density': lay.density,
      'data-image-size': lay.imageSize, 'data-gutter': lay.gutter,
      'data-label-stride': lay.labelStride,
      'data-fits-height': String(lay.fitsHeight), 'data-fits-width': String(lay.fitsWidth),
      'data-overflow': lay.overflow,
      'data-measured-w': lay.measured.containerWidth,
      'data-measured-h': lay.measured.availableHeight,
      'aria-label': 'Price band by product, ' + panel.currency });

    /* ---- HOW WIDE IT IS PAINTED ---------------------------------------------------------------

       AUTO FIT HAS NO FLOOR ANY MORE, BECAUSE IT NO LONGER NEEDS ONE. P1-B2A added a "fit floor"
       after a screenshot showed `width: 100%` painting a 3364px drawing at 0.42x inside a 1400px
       card: every coordinate correct and every pixel unreadable. That was the right diagnosis of a
       layout that had already gone wrong upstream — the drawing should never have needed 3364px in
       a 1400px card. Now it does not: the engine picks a density whose columns fit the container,
       and when even the smallest legible column will not fit, it says so (`fitsWidth: false`) and
       the container scrolls at natural size. Fit means fit; overflow is declared rather than
       discovered.

       COMFORTABLE KEEPS THE ZOOM BUTTONS, and there the zoom is still only a width over an
       unchanged viewBox, which is what makes "zoom cannot move a price" provable. */
    if (STATE.chartMode === 'comfortable' && !STATE.fullscreen && STATE.zoom !== 'fit') {
      s.setAttribute('width', String(Math.round(W * Number(STATE.zoom))));
    } else if (lay.fitsWidth) {
      s.setAttribute('width', '100%');
    } else {
      s.setAttribute('width', String(W));
      s.setAttribute('data-natural-width', 'true');
    }
    s.setAttribute('height', String(H));

    /* THE SCALE OCCUPIES PLOT_H AND NOTHING ELSE. The gutter above and below is for markers: it is
       not part of the scale, so an image centred on the top or bottom tick stays inside the
       drawing without any price being nudged to make room for it. */
    function y(c) { return PLOT_BOT - ((c - t.lo) / (t.hi - t.lo)) * PLOT_H; }
    function frac(c) { return LAYOUT.frac(c, t.lo, t.hi); }
    function x(i) { return lay.offset + i * lay.colW + lay.colW / 2; }

    /* THE GRIDLINES BELONG TO THE PLOT; THE SCALE BELONGS TO THE READER.

       They are drawn as two groups because they behave differently the moment the drawing is wider
       than its container. The lines scroll with the products they cross. The scale — the tick
       numbers, the axis rule and the title — is pinned: `.axis-scale` is translated by the
       container's scroll offset, so a chart you are reading at column forty still tells you what
       the prices are. §三.2 asked whether a sticky axis was necessary; on a forty-four product
       Comfortable chart, scrolling the numbers off the screen leaves a grid of markers with no
       way to read any of them, so the answer is yes.

       IT IS A TRANSLATE, AND ONLY A TRANSLATE, IN X. No price moves; the group slides sideways by
       exactly as much as the container scrolled, which is how it stays still on screen. */
    var gGrid = svg('g', { 'class': 'axis axis-grid' });
    t.ticks.forEach(function (v) {
      var yy = y(v);
      gGrid.appendChild(svg('line', { x1: PAD_L - 8, y1: yy, x2: W - PAD_R, y2: yy,
        'class': 'grid' + ((v / t.step) % 2 === 0 ? ' is-major' : ''), 'data-tick-c': v }));
    });
    s.appendChild(gGrid);

    var gAxis = svg('g', { 'class': 'axis axis-scale', 'data-sticky': 'x' });
    gAxis.appendChild(svg('rect', { x: 0, y: 0, width: PAD_L - 6, height: H,
      'class': 'axis-backing' }));
    t.ticks.forEach(function (v) {
      gAxis.appendChild(svgText({ x: PAD_L - 12, y: y(v) + 4, 'class': 'ytick',
        'font-size': lay.tickPx, 'data-tick-c': v, 'text-anchor': 'end' }, fromCents(v)));
    });
    gAxis.appendChild(svg('line', { x1: PAD_L - 8, y1: PLOT_TOP, x2: PAD_L - 8, y2: PLOT_BOT,
      'class': 'axisline' }));
    gAxis.appendChild(svgText({ x: 16, y: PLOT_TOP + PLOT_H / 2, 'class': 'axtitle',
      'font-size': Math.max(9.5, lay.tickPx - 1),
      transform: 'rotate(-90 16 ' + (PLOT_TOP + PLOT_H / 2) + ')', 'text-anchor': 'middle' },
      'Price (' + panel.currency + ')  ·  ' + plain(t.step) + ' ' + panel.currency
        + ' per gridline'));
    s.appendChild(gAxis);

    /* THE LABEL LANE, AS AN ELEMENT. It is declared before the columns draw into it so its height
       is a property of the drawing rather than a consequence of what the longest label happened to
       be, and so a test can assert that no plate ever reaches it. */
    var lane = svg('g', { 'class': 'labellane',
      'data-lane-top': LANE_TOP, 'data-lane-h': lay.laneH });
    lane.appendChild(svg('line', { x1: PAD_L - 8, y1: LANE_TOP, x2: W - PAD_R, y2: LANE_TOP,
      'class': 'lane-rule' }));
    s.appendChild(lane);

    /* ---- PRICE GAPS -----------------------------------------------------------------------------
       "10.00 open" was three words short of a sentence and none of them said what it meant. Open
       could be read as an open order, open stock, an opening price or an unfilled slot in a plan;
       the thing it actually marks is a rung of the ladder that no product stands on. The label is
       now the amount in the panel's own currency followed by "Price gap", the legend and the layer
       switch say the same words, and the tooltip names both neighbours, the distance and the
       threshold in force — so the reading cannot be guessed at.
       --------------------------------------------------------------------------------------------- */
    if (layerOn('steps')) {
      var placed = [];
      findings.filter(function (f) {
        return f.kind === 'PRICE_GAP' && f.currency === panel.currency;
      }).forEach(function (f) {
        var ia = ns.indexOf(f.a), ib = ns.indexOf(f.b);
        if (ia < 0 || ib < 0) return;
        var ya = y(f.a._regular_c), yb = y(f.b._regular_c);
        var mx = (x(ia) + x(ib)) / 2;
        var my = (ya + yb) / 2;
        /* A NARROW GAP GETS THE SHORT LABEL, and a label that would land on one already drawn goes
           to the other side of its line. Neither ever moves a price: the LINE is the measurement
           and it stays on the midpoint between the two columns, which is the gutter — half a
           column is at least 37px and half a plate is 25px, so the text cannot reach a photograph. */
        /* THE LABEL HAS TO FIT IN THE GUTTER IT IS DRAWN IN.

           The line sits on the boundary between two columns, so the room beside it is half a
           column — and "USD 10 Price gap" is about 100px of type. At four products in a 1180px
           card that fitted; at a narrower column it ran past the next product's centre and landed
           on its band and its promotion diamond. A screenshot found that; the assertion in place
           checked the label against the PHOTOGRAPHS and the photographs were clear.

           So the form is chosen by what fits: the full phrase, then the short one, then the
           amount alone. A shorter label is a small loss; a label lying across a price marker is a
           chart that shows two things in one place. */
        var room = lay.colW / 2 - 12;
        var CH = 6.4;                                   // 11.5px monospace, measured once
        /* A NAKED NUMBER IS NOT A LABEL. The shortest form still names the currency, because
           "10" beside a line on a price chart is the same ambiguity this round removed from the
           word "open" — it could be a price, a count, a percentage or a rank. If not even that
           fits, the label is omitted and the LINE carries the measurement, with the whole
           sentence on hover, on focus and in the aria-label. */
        var forms = [gapText(f.distance_c, panel.currency, false),
          gapText(f.distance_c, panel.currency, true),
          panel.currency + ' ' + plain(f.distance_c)];
        var text = '';
        for (var fi = 0; fi < forms.length; fi++) {
          if (forms[fi].length * CH <= room) { text = forms[fi]; break; }
        }
        var full = forms[0];
        var tight = text !== full;
        var left = placed.some(function (q2) {
          return Math.abs(q2.y - my) < 22 && Math.abs(q2.x - mx) < 140;
        });
        placed.push({ x: mx, y: my });
        var g = svg('g', { 'class': 'gapmark', 'data-layer': 'steps',
          'data-gap-c': f.distance_c, 'data-threshold-c': f.threshold_c,
          'data-lower-label': f.a.label, 'data-lower-c': f.a._regular_c,
          'data-upper-label': f.b.label, 'data-upper-c': f.b._regular_c,
          'data-side': left ? 'left' : 'right', 'data-short': String(tight),
          'data-label-w': Math.round(text.length * CH), 'data-room': Math.round(room),
          tabindex: '0', role: 'group', 'aria-label': gapAria(f, panel.currency) });
        g.appendChild(svg('line', { x1: mx, y1: ya, x2: mx, y2: yb, 'class': 'gapline' }));
        g.appendChild(svg('line', { x1: mx - 5, y1: ya, x2: mx + 5, y2: ya, 'class': 'gapend' }));
        g.appendChild(svg('line', { x1: mx - 5, y1: yb, x2: mx + 5, y2: yb, 'class': 'gapend' }));
        var lt = svgText({ x: mx + (left ? -7 : 7), y: my + 4, 'class': 'gaplabel',
          'data-gap-label': 'true', 'data-shown': text,
          'text-anchor': left ? 'end' : 'start' }, text);
        /* THE WHOLE SENTENCE IS ALWAYS REACHABLE, whichever form is painted. */
        var gttl = svg('title', {});
        gttl.appendChild(document.createTextNode(gapAria(f, panel.currency)));
        lt.appendChild(gttl);
        g.appendChild(lt);
        g.addEventListener('mouseenter', function (ev) {
          paintTip(gapTipLines(f, panel.currency), 'pointer'); moveTip(ev);
        });
        g.addEventListener('mousemove', moveTip);
        g.addEventListener('mouseleave', hideTip);
        g.addEventListener('focus', function () {
          paintTip(gapTipLines(f, panel.currency), 'focus');
        });
        g.addEventListener('blur', hideTip);
        s.appendChild(g);
      });
    }

    ns.forEach(function (n, i) {
      var cx = x(i);
      var scen = n._scenario && n._scenario.active;
      /* THE FRACTION IS THE PRICE'S REAL COORDINATE, AND IT IS PUBLISHED.

         `data-cy` is pixels and it is supposed to change: that is the whole point of a responsive
         chart. `data-frac` is where the price sits in its own domain — a number between 0 and 1 —
         and it must be identical at 1920 and at 768, in Auto Fit and in Comfortable, at every
         density. Separating the two turns "resizing cannot move a price" from a promise in a
         comment into two attributes a reader can compare across screenshots and a test can compare
         across seven viewports. */
      var g = svg('g', { 'class': 'col' + (scen ? ' is-scenario' : ''), 'data-label': n.label,
        'data-currency': panel.currency, 'data-category': n.category,
        'data-regular-c': n._regular_c, 'data-regular-frac': frac(n._regular_c),
        'data-scenario': String(!!scen),
        tabindex: '0', role: 'group',
        'aria-label': ariaFor(n, panel.currency) });
      /* The cap's half-width follows the column, so a 26px column does not carry a 26px cap that
         reaches into both of its neighbours. */
      var capW = Math.max(6, Math.min(13, lay.colW * 0.28));
      var dia = Math.max(4, Math.min(7, lay.colW * 0.16));

      /* THE BAND NEEDS BOTH ENDS. One cap hidden is not a shorter band; it is a line to nothing. */
      if (layerOn('floor') && layerOn('msrp') && n._min_c !== null && n._msrp_c !== null) {
        g.appendChild(svg('line', { x1: cx, y1: y(n._min_c), x2: cx,
          y2: y(n._msrp_c), 'class': 'band', 'data-layer': 'band' }));
      }
      if (layerOn('msrp') && n._msrp_c !== null) {
        g.appendChild(svg('line', { x1: cx - capW, y1: y(n._msrp_c),
          x2: cx + capW, y2: y(n._msrp_c),
          'class': 'cap cap-msrp', 'data-layer': 'msrp', 'data-price-c': n._msrp_c,
          'data-frac': frac(n._msrp_c) }));
      }
      if (layerOn('floor') && n._min_c !== null) {
        g.appendChild(svg('line', { x1: cx - capW, y1: y(n._min_c),
          x2: cx + capW, y2: y(n._min_c),
          'class': 'cap cap-floor', 'data-layer': 'floor', 'data-price-c': n._min_c,
          'data-frac': frac(n._min_c) }));
      }
      /* The deal markers are drawn BEFORE the everyday plate so the photograph never hides a
         promotion; and they keep their own shapes, so an image marker cannot be read as a deal. */
      if (layerOn('promo') && n._deal_live && n._deal_c !== null) {
        g.appendChild(svg('polygon', { points: diamond(cx, y(n._deal_c), dia),
          'class': 'mk-deal', 'data-layer': 'promo', 'data-price-c': n._deal_c,
          'data-frac': frac(n._deal_c) }));
      }
      if (layerOn('scenario') && n._proposed_c !== null) {
        g.appendChild(svg('polygon', { points: diamond(cx, y(n._proposed_c), dia),
          'class': 'mk-prop', 'data-layer': 'scenario', 'data-price-c': n._proposed_c,
          'data-frac': frac(n._proposed_c) }));
      }
      /* THE ORIGINAL, BESIDE THE SIMULATION. When a scenario has moved this product's everyday price
         the canonical position is drawn as a hollow ghost with a connector, so the difference is a
         distance a person can see rather than a number they have to remember. */
      if (scen && n._canonical && n._canonical.regular_c !== null
        && n._canonical.regular_c !== n._regular_c) {
        var yo = y(n._canonical.regular_c);
        g.appendChild(svg('line', { x1: cx, y1: yo, x2: cx, y2: y(n._regular_c),
          'class': 'scen-link', 'data-layer': 'scenario' }));
        g.appendChild(svg('circle', { cx: cx, cy: yo, r: 5, 'class': 'scen-ghost',
          'data-layer': 'scenario', 'data-price-c': n._canonical.regular_c }));
      }
      everydayMarker(g, cx, y(n._regular_c), n,
        { imageSize: lay.imageSize, frac: frac(n._regular_c) });

      /* ---- THE LABEL LANE. ONE BASELINE FOR EVERY PRODUCT. ----
         Two rows, both measured from LANE_TOP and never from a price, so the lane is identical for
         a product at the top of the range and one at the bottom. Row one is the sku; row two is
         its everyday price and, where there is more than one, the variant count.

         THE SERIES IS NOT REPEATED HERE. It is already stated by the filter that selected it and
         by the panel heading; printing it a third time under every column would be the same fact
         occupying the space the sku and the price need. */
      /* LABEL DENSITY IS THE FIRST THING TO GIVE WAY, and at forty-four columns it has to. A
         label needs about 46px to say anything; below that the engine returns a STRIDE and the
         lane prints one label every Nth column rather than a row of four-character stumps. Every
         product keeps its marker, its hover panel, its focus panel and its aria-label — nothing is
         lost, the printed text is thinned. */
      var labelled = (lay.labelStride <= 1) || (i % lay.labelStride === 0);
      var full = String(n.label);
      var shown = full.length > lay.labelChars
        ? full.slice(0, lay.labelChars - 1) + '\u2026' : full;
      if (!labelled) shown = '';
      var lab = svgText({ x: cx, y: LANE_TOP + lay.laneRow1, 'class': 'xlabel',
        'font-size': lay.labelPx,
        'data-row': 'a', 'data-full': full, 'data-shown': shown,
        'data-truncated': String(labelled && shown !== full),
        'data-printed': String(labelled),
        'text-anchor': 'middle' }, shown);
      /* TRUNCATED IS NOT LOST. The whole label is on the node, in a <title>, in the aria-label and
         in the hover panel — the column is simply too narrow to print it without running into its
         neighbour, and a label that overlaps the next one is less readable than a short one.

         THE <title> IS ADDED ONLY WHEN IT IS NEEDED. An SVG <title> is not painted, but it IS part
         of the element's textContent, so attaching one to every label would make each label read as
         its own text twice to anything that reads text — including the assertions. */
      /* A TITLE ONLY WHERE THERE IS TEXT TO EXPLAIN. A column the stride skipped prints nothing,
         so there is nothing for a native tooltip to hang on — and attaching one anyway would put
         a second copy of the label inside an element whose textContent is supposed to be empty.
         The skipped column keeps everything it had: its marker, its hover panel, its focus panel
         and its aria-label. */
      if (labelled && shown !== full) {
        var ttl = svg('title', {});
        ttl.appendChild(document.createTextNode(full));
        lab.appendChild(ttl);
      }
      g.appendChild(lab);
      var subText = labelled
        ? (fromCents(n._regular_c)
          + (lay.density === 'spacious' && n.variant_count > 1
            ? '  \u00b7  ' + n.variant_count + ' colours' : ''))
        : '';
      g.appendChild(svgText({ x: cx, y: LANE_TOP + lay.laneRow2, 'class': 'xsub',
        'font-size': lay.subPx,
        'data-row': 'b', 'data-printed': String(labelled),
        'text-anchor': 'middle' }, subText));

      g.addEventListener('mouseenter', function (ev) { showTip(ev, n); });
      g.addEventListener('mousemove', moveTip);
      g.addEventListener('mouseleave', hideTip);
      /* KEYBOARD REACHES THE SAME FACTS. A chart a person can only interrogate with a mouse is a chart
         half the reviewers cannot interrogate at all. */
      g.addEventListener('focus', function () { focusTip(n); });
      g.addEventListener('blur', hideTip);
      s.appendChild(g);
    });

    /* ---- THE SCALE FOLLOWS THE READER SIDEWAYS ---------------------------------------------
       §三.2 asked whether a sticky axis was necessary. On a forty-four product Comfortable chart
       it is: scroll to column forty and the tick numbers have left the screen, so what remains is
       a grid of markers with no way to read a single price off it.

       It is a translate in X and nothing else. The group slides right by exactly as much as the
       container scrolled left, so it stays still on screen while the plot moves under it. No
       price coordinate is touched — the gridlines are a separate group and they scroll with the
       products they cross, which is what makes the two legible together. */
    if (lay.overflow === 'container-x' || lay.overflow === 'container-both') {
      wrap.setAttribute('data-sticky-axis', 'true');
      wrap.addEventListener('scroll', function () {
        var dx = Number(wrap.scrollLeft) || 0;
        gAxis.setAttribute('transform', 'translate(' + dx + ',0)');
        gAxis.setAttribute('data-pinned-x', String(dx));
      });
    }

    wrap.appendChild(s);
    return wrap;
  }

  /** Everything the tooltip says, as one string, for a screen reader and for a focus ring. */
  function ariaFor(n, cur) {
    var bits = [n.label, 'everyday ' + money(n._regular_c, cur)];
    if (n._msrp_c !== null) bits.push('list ' + money(n._msrp_c, cur));
    if (n._min_c !== null) bits.push('floor ' + money(n._min_c, cur));
    if (n._deal_live && n._deal_c !== null) bits.push('live promotion ' + money(n._deal_c, cur));
    if (n._proposed_c !== null) bits.push('proposed ' + money(n._proposed_c, cur));
    if (n.variant_count > 1) bits.push(n.variant_count + ' colours');
    if (n._scenario && n._scenario.active) {
      bits.push('SIMULATED, original ' + money(n._canonical.regular_c, cur));
    }
    return bits.join(', ');
  }

  /* ================================================================================================
     PROGRESSIVE DISCLOSURE — ONE `?` AND ONE POPOVER COMPONENT, USED EVERYWHERE.

     The screen carried a great deal of correct technical prose, permanently. Correct prose that nobody
     can get past is not documentation, it is furniture: the review's complaint was density, not
     accuracy, so nothing here is deleted — it moves behind a control, and the control is the same one
     every time so a reader learns it once.

     IT IS NOT A HOVER TOOLTIP. Hover alone excludes keyboard users and every touch device, so this is
     a button: click or Enter/Space toggles, hover only previews, Escape closes, clicking outside
     closes, and clicking it again closes. `aria-expanded` and `aria-controls` carry the state, and the
     panel has role="note" so it is announced rather than merely painted.

     ONE AT A TIME. `STATE.openPopover` holds an id, not a boolean per icon, so two panels can never be
     open over each other — and closing is a single assignment rather than a sweep.
     ================================================================================================ */
  function infoIcon(id, heading, paras) {
    var wrap = el('span', 'info');
    wrap.setAttribute('data-info', id);
    var btn = el('button', 'info-btn', '?');
    btn.id = 'info-' + id;
    btn.setAttribute('type', 'button');
    btn.setAttribute('aria-label', 'About ' + heading);
    btn.setAttribute('aria-expanded', STATE.openPopover === id ? 'true' : 'false');
    btn.setAttribute('aria-controls', 'infopanel-' + id);
    btn.addEventListener('click', function (ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      STATE.openPopover = (STATE.openPopover === id) ? null : id;
      render();
    });
    btn.addEventListener('keydown', function (ev) {
      if (!ev) return;
      if (ev.key === 'Escape') { STATE.openPopover = null; render(); }
    });
    wrap.appendChild(btn);
    if (STATE.openPopover === id) {
      var pop = el('div', 'info-pop');
      pop.id = 'infopanel-' + id;
      pop.setAttribute('role', 'note');
      pop.setAttribute('aria-label', heading);
      pop.appendChild(el('div', 'info-head', heading));
      (paras || []).forEach(function (t) { pop.appendChild(el('p', 'info-p', t)); });
      var close = el('button', 'info-close', 'Close');
      close.setAttribute('type', 'button');
      close.addEventListener('click', function (ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        STATE.openPopover = null;
        render();
      });
      pop.appendChild(close);
      wrap.appendChild(pop);
    }
    return wrap;
  }

  /** A section heading with its `?` beside it — so every block discloses the same way. */
  function headingWithInfo(tag, text, id, heading, paras) {
    var h = el('div', 'h-row');
    h.appendChild(el(tag, null, text));
    h.appendChild(infoIcon(id, heading || text, paras));
    return h;
  }

  /* ================================================================================================
     THE CHART CONTROLS. What is drawn, and how large it is painted — never what the numbers are.
     ================================================================================================ */
  /* ================================================================================================
     THE CONTROL BAR. What is drawn, and how large it is painted — never what the numbers are.

     P1-B2C REORGANISED IT AROUND WHAT IS ACTUALLY DECIDED. It had grown to six permanent
     checkboxes, two mode buttons, four zoom buttons and a reset — thirteen controls in one row,
     above a chart that was itself too tall to see. Most of them are settings a person touches once
     a session; the one they touch constantly is how big it is. So:

         View     Auto Fit · Comfortable · Fullscreen      the decision that matters
         Detail   Clean · Detail                           the two presets
         Layers   one button, a popover, and a count       the six, folded away
         Size     100% · 125% · 150%                       COMFORTABLE ONLY, and see below

     THE SIZE BUTTONS ARE HIDDEN IN AUTO FIT ON PURPOSE. Auto Fit means "the engine chose the size";
     a 125% button sitting beside it would be a second, contradictory answer to the same question,
     and whichever one won, the other would be lying.
     ================================================================================================ */
  function chartControls(lay) {
    var box = el('div', 'chartctl');
    box.id = 'chartControls';

    /* ---- VIEW: the size decision ---- */
    var view = el('div', 'ctl-group');
    view.setAttribute('data-group', 'view');
    view.appendChild(el('span', 'ctl-label', 'View'));
    [['auto', 'Auto Fit'], ['comfortable', 'Comfortable']].forEach(function (m) {
      var b = el('button', 'segbtn' + (STATE.chartMode === m[0] && !STATE.fullscreen
        ? ' is-on' : ''), m[1]);
      b.id = 'mode-' + m[0];
      b.setAttribute('type', 'button');
      b.setAttribute('data-mode', m[0]);
      b.setAttribute('aria-pressed', STATE.chartMode === m[0] && !STATE.fullscreen
        ? 'true' : 'false');
      b.addEventListener('click', function () {
        STATE.chartMode = m[0];
        if (m[0] === 'auto') STATE.zoom = 'fit';
        remeasure();
        renderData();
      });
      view.appendChild(b);
    });
    var fs = el('button', 'segbtn' + (STATE.fullscreen ? ' is-on' : ''),
      STATE.fullscreen ? 'Exit fullscreen' : 'Fullscreen');
    fs.id = 'mode-fullscreen';
    fs.setAttribute('type', 'button');
    fs.setAttribute('aria-pressed', STATE.fullscreen ? 'true' : 'false');
    fs.addEventListener('click', function () { toggleFullscreen(); });
    view.appendChild(fs);
    view.appendChild(infoIcon('viewsize', 'How the chart is sized', [
      'Auto Fit measures the card and the window and chooses the gridline step, the plot height,'
        + ' the image size and the column width that let the whole chart — both axes, the labels'
        + ' and the legend — sit inside the card without scrolling it.',
      'Comfortable keeps the large product images and the generous gridline spacing for close'
        + ' study. When that does not fit, the CHART scrolls inside its own card; the page never'
        + ' scrolls sideways and you are never asked to zoom the browser.',
      'Fullscreen gives the chart the whole window for a meeting, and keeps your site, filters,'
        + ' layers and scenario exactly as they were. Escape leaves it and returns you to where'
        + ' you were on the page.',
      'None of the three changes a price. The drawing keeps one coordinate system: every marker'
        + ' carries the fraction of the price range it sits at, and that number is identical in'
        + ' every mode and at every window size.'
    ]));
    box.appendChild(view);

    /* ---- DETAIL: the two presets ---- */
    var modes = el('div', 'ctl-group');
    modes.setAttribute('data-group', 'detail');
    modes.appendChild(el('span', 'ctl-label', 'Detail'));
    [['clean', 'Clean'], ['detail', 'Detail']].forEach(function (m) {
      var b = el('button', 'segbtn' + (STATE.viewMode === m[0] ? ' is-on' : ''), m[1]);
      b.id = 'view-' + m[0];
      b.setAttribute('type', 'button');
      b.setAttribute('aria-pressed', STATE.viewMode === m[0] ? 'true' : 'false');
      /* A view mode draws different elements. It does not change which products exist, so it
         rebuilds no control — and because the domain does not depend on the layers, it does not
         change one coordinate or the height of the card either. */
      b.addEventListener('click', function () { applyViewMode(m[0]); renderData(); });
      modes.appendChild(b);
    });
    modes.appendChild(infoIcon('viewmode', 'Clean and Detail', [
      'Clean shows the product images and the everyday price only. Detail turns every layer on.',
      'They are shortcuts that SET the layer switches beside them, not a separate mode — so you can'
        + ' press Clean and then turn one layer back on without the two disagreeing.',
      'Neither changes any data. A layer that is off is an element that was not drawn; the price it'
        + ' represents is unchanged and comes back exactly when you switch it on.'
    ]));
    box.appendChild(modes);

    /* ---- LAYERS: one button, a count, and a popover ---- */
    var on = LAYERS.filter(function (l) { return layerOn(l.id); }).length;
    var lay2 = el('div', 'ctl-group ctl-layers');
    lay2.setAttribute('data-group', 'layers');
    var lt = el('button', 'segbtn ctl-disclose' + (STATE.layersOpen ? ' is-open' : ''));
    lt.id = 'layersToggle';
    lt.setAttribute('type', 'button');
    lt.setAttribute('aria-expanded', STATE.layersOpen ? 'true' : 'false');
    lt.setAttribute('aria-controls', 'layersPanel');
    lt.appendChild(document.createTextNode('Layers'));
    /* THE COUNT IS THE STATE, AND IT STAYS VISIBLE WHEN THE LIST DOES NOT. Folding six switches
       away is a density decision; folding away WHICH of them are on would be hiding the state. */
    var cnt = el('span', 'ctl-count', on + '/' + LAYERS.length);
    cnt.id = 'layersCount';
    lt.appendChild(cnt);
    lt.addEventListener('click', function (ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      STATE.layersOpen = !STATE.layersOpen;
      renderData();
    });
    lay2.appendChild(lt);
    if (STATE.layersOpen) {
      var panel = el('div', 'ctl-pop');
      panel.id = 'layersPanel';
      panel.setAttribute('role', 'group');
      panel.setAttribute('aria-label', 'Chart layers');
      LAYERS.forEach(function (l) {
        var lab = el('label', 'chk');
        lab.setAttribute('data-layer', l.id);
        var cb = document.createElement('input');
        cb.id = 'layer-' + l.id;
        cb.setAttribute('type', 'checkbox');
        cb.checked = layerOn(l.id);
        cb.setAttribute('aria-label', l.label + '. ' + l.help);
        cb.addEventListener('change', function () {
          STATE.layers[l.id] = !!cb.checked;
          /* THE MODE FOLLOWS THE SWITCHES, not the other way round: once a person edits a layer the
             badge must stop claiming a preset they are no longer in. */
          var isClean = LAYERS.every(function (x) { return STATE.layers[x.id] === x.clean; });
          var isDetail = LAYERS.every(function (x) { return STATE.layers[x.id] === true; });
          STATE.viewMode = isClean ? 'clean' : (isDetail ? 'detail' : 'custom');
          renderData();
        });
        lab.appendChild(cb);
        lab.appendChild(el('span', 'chk-text', l.label));
        panel.appendChild(lab);
      });
      var close = el('button', 'info-close', 'Close');
      close.id = 'layersClose';
      close.setAttribute('type', 'button');
      close.addEventListener('click', function (ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        STATE.layersOpen = false;
        renderData();
      });
      panel.appendChild(close);
      lay2.appendChild(panel);
    }
    lay2.appendChild(infoIcon('layers', 'Chart layers', LAYERS.map(function (l) {
      return l.label + ' — ' + l.help;
    })));
    box.appendChild(lay2);

    /* ---- SIZE: comfortable only ---- */
    if (STATE.chartMode === 'comfortable' && !STATE.fullscreen) {
      var z = el('div', 'ctl-group');
      z.setAttribute('data-group', 'zoom');
      z.appendChild(el('span', 'ctl-label', 'Size'));
      ZOOMS.forEach(function (o) {
        var b = el('button', 'segbtn' + (String(STATE.zoom) === o.id ? ' is-on' : ''), o.label);
        b.id = 'zoom-' + o.id.replace('.', '-');
        b.setAttribute('type', 'button');
        b.setAttribute('data-zoom', o.id);
        b.setAttribute('aria-pressed', String(STATE.zoom) === o.id ? 'true' : 'false');
        b.addEventListener('click', function () { STATE.zoom = o.id; renderData(); });
        z.appendChild(b);
      });
      box.appendChild(z);
    }

    /* ---- RESET VIEW ---- */
    var rgroup = el('div', 'ctl-group');
    rgroup.setAttribute('data-group', 'reset');
    var reset = el('button', 'segbtn is-reset', 'Reset view');
    reset.id = 'zoom-reset';
    reset.setAttribute('type', 'button');
    /* RESET IS NOT A SECOND "AUTO FIT". It restores the whole VIEW — the mode, the zoom and the
       layer set — which is the thing a person wants after ten minutes of a meeting and cannot
       reconstruct from memory. */
    reset.addEventListener('click', function () {
      STATE.chartMode = 'auto';
      STATE.zoom = 'fit';
      STATE.layersOpen = false;
      applyViewMode('detail');
      remeasure();
      renderData();
    });
    rgroup.appendChild(reset);
    box.appendChild(rgroup);

    /* ---- WHAT THE ENGINE HAD TO GIVE UP, SAID OUT LOUD ---------------------------------------
       A chart that quietly shows a fraction of what you asked for is worse than one that says so.
       When Auto Fit has stepped down to the overview density, the card says which mode to switch
       to for the large images — because the reader's next question is always "can I see them
       bigger", and the answer should not require them to guess. */
    if (lay && lay.density === 'overview' && STATE.chartMode === 'auto') {
      var note = el('p', 'ctl-note', 'Compact overview — switch to Comfortable for larger product'
        + ' images. Every product and every price is on the chart; only the pictures and the'
        + ' labels are smaller.');
      note.id = 'densityNote';
      note.setAttribute('data-density', lay.density);
      box.appendChild(note);
    } else if (lay && !lay.fitsWidth) {
      var note2 = el('p', 'ctl-note', 'The chart is wider than the card, so it scrolls sideways'
        + ' inside it. The page does not.');
      note2.id = 'densityNote';
      note2.setAttribute('data-density', lay.density);
      box.appendChild(note2);
    }
    return box;
  }

  /* ================================================================================================
     FULLSCREEN — A CSS OVERLAY, NOT THE BROWSER'S FULLSCREEN API, AND THAT IS A CHOICE.

     `Element.requestFullscreen` needs a trusted user gesture, is refused outright in a headless
     render and in a print, cannot be entered by the page's own self-test, and hands the Escape key
     to the browser so the page cannot tell the difference between leaving and a stray keypress. An
     overlay gives the same thing — the whole window, the chart at the size the engine derives for
     it — while staying testable, printable and ours to leave.

     IT CARRIES THE STATE ACROSS. The scope, the layers, the scenario and the zoom are all in the
     same object and none of them is touched; the only things recorded are where the reader was on
     the page and the fact that they are in it, so leaving puts them back.
     ================================================================================================ */
  function toggleFullscreen() {
    if (!STATE.fullscreen) {
      STATE.fsReturnScroll = (typeof window !== 'undefined' && window)
        ? (window.scrollY || window.pageYOffset || 0) : 0;
      STATE.fullscreen = true;
      STATE.layersOpen = false;
      remeasure();
      render();
    } else {
      STATE.fullscreen = false;
      remeasure();
      render();
      if (typeof window !== 'undefined' && window && window.scrollTo) {
        window.scrollTo(0, STATE.fsReturnScroll);
      }
    }
  }

  function legend() {
    var box = el('div', 'legend');
    box.id = 'chartLegend';
    /* THE LEGEND IS BUILT FROM THE LAYER STATE, so an entry cannot outlive the thing it describes.
       Hiding a line and leaving its key on screen is worse than showing the line: the reader is told
       the chart contains something it does not. */
    var items = [
      { layer: 'images', sw: 'sw-reg', text: 'Everyday price — product photograph' },
      { layer: null, sw: 'sw-miss', text: 'Everyday price — no verified photograph' },
      { layer: 'promo', sw: 'sw-deal', text: 'Live promotion' },
      { layer: 'scenario', sw: 'sw-prop', text: 'Proposed scenario' },
      { layer: 'band', sw: 'sw-band', text: 'Floor to list price' },
      { layer: 'msrp', sw: 'sw-msrp', text: 'MSRP / list price' },
      { layer: 'floor', sw: 'sw-floor', text: 'Lowest / floor price' },
      { layer: 'steps', sw: 'sw-gap', text: 'Price gap' }
    ];
    items.forEach(function (p) {
      if (p.layer === 'band' ? !(layerOn('floor') && layerOn('msrp'))
        : (p.layer !== null && !layerOn(p.layer))) return;
      var it = el('span', 'legend-item');
      it.setAttribute('data-layer', p.layer === null ? 'always' : p.layer);
      it.appendChild(el('i', 'sw ' + p.sw));
      it.appendChild(el('span', 'lg-text', p.text));
      box.appendChild(it);
    });
    return box;
  }

  function tipLines(n) {
    var L = [];
    L.push({ t: n.product_name + '  (' + n.label + ')', head: true });
    L.push({ t: 'List price ' + money(n._msrp_c, n.currency) });
    L.push({ t: 'Everyday ' + money(n._regular_c, n.currency) });
    if (n._deal_live) {
      L.push({ t: 'Live promotion ' + money(n._deal_c, n.currency)
        + '  ' + n.deal_start + ' to ' + n.deal_end });
    }
    if (n._proposed_c !== null) {
      L.push({ t: 'Proposed ' + money(n._proposed_c, n.currency)
        + '  (a scenario on this board, not a live offer)' });
    }
    L.push({ t: 'Floor ' + money(n._min_c, n.currency) });
    L.push({ t: n.variant_count + (n.variant_count === 1 ? ' variant' : ' variants')
      + (n.variant_names.length ? ': ' + n.variant_names.join(', ') : '') });
    if (n.image) {
      L.push({ t: 'Photograph: ' + n.representative_image_sku + ' (verified database mapping)' });
    } else {
      L.push({ t: 'IMAGE SOURCE MISSING — no verified mapping for this product', miss: true });
    }
    L.push({ t: 'Current selling price is not shown, and neither is margin: no source of record.' });
    return L;
  }
  /** ONE PAINTER. A product and a price gap are two different things to explain in the same box. */
  function paintTip(lines, anchor) {
    var t = byId('tip');
    if (!t) return;
    clear(t);
    lines.forEach(function (l) {
      t.appendChild(el('div', 'tipline' + (l.head ? ' is-head' : '') + (l.miss ? ' is-miss' : ''),
        l.t));
    });
    t.setAttribute('data-anchor', anchor);
    if (anchor === 'focus') { t.style.left = ''; t.style.top = ''; }
    t.hidden = false;
  }
  function showTip(ev, n) {
    paintTip(tipLines(n), 'pointer');
    moveTip(ev);
  }
  function moveTip(ev) {
    var t = byId('tip');
    if (!t || t.hidden) return;
    t.style.left = (ev.clientX + 16) + 'px';
    t.style.top = (ev.clientY + 16) + 'px';
  }
  function hideTip() { var t = byId('tip'); if (t) t.hidden = true; }

  /**
   * THE SAME FACTS, REACHED BY KEYBOARD. There is no pointer to follow, and this file measures no
   * layout box, so the panel is pinned to a corner of the viewport rather than guessed at. It carries
   * `data-anchor="focus"` so a test can tell the two routes apart.
   */
  function focusTip(n) { paintTip(tipLines(n), 'focus'); }

  /* ================================================================================================
     7  THE VIEWS.
     Every view below is built from ONE scoped row set. The category page never sees a row from
     another category, and the overview never puts two categories on one axis — it puts them on
     cards and in a table, which is the only honest way to show them together.
     ================================================================================================ */

  /* Everything a category page needs, derived once so the summary, the chart, the table and the
     findings cannot disagree with each other. */
  function categoryModel(category) {
    /* ONE PIPELINE, RUN WITH THE CATEGORY PINNED. The nodes, panels and findings come back already
       derived, so the summary, the chart, the table and the findings drawer cannot disagree — and the
       scenario overlay is inside the same call, so none of them can show an un-simulated number while
       another shows a simulated one. */
    var m = buildModel(category);
    return {
      category: category,
      load: LOAD,
      model: m,
      universe: m.universe,
      rows: m.rows,
      nodes: m.architecture.nodes,
      panels: m.architecture.panels,
      findings: m.architecture.findings
    };
  }

  function countBy(findings, cls) {
    return findings.filter(function (f) { return f.cls === cls; }).length;
  }

  function kpiStrip(m) {
    var box = el('div', 'kpis');
    var plotted = 0, variants = 0, noPrice = 0, noImg = 0;
    m.nodes.forEach(function (n) {
      if (n._plottable) plotted++; else noPrice++;
      variants += n.variant_count;
      if (n.image_state !== 'VERIFIED_DB_MAPPING') noImg++;
    });
    var ranges = m.panels.map(function (p) {
      if (!p.plotted.length) return null;
      return fromCents(p.plotted[0]._regular_c) + ' – '
        + fromCents(p.plotted[p.plotted.length - 1]._regular_c) + ' ' + p.currency;
    }).filter(function (x) { return !!x; });
    [['Products on the axis', plotted, ''],
     ['Variants covered', variants, ''],
     ['Price range', ranges.join('  ·  ') || '—', ''],
     ['Opportunities', countBy(m.findings, CLASS.OPP), 'is-opp'],
     ['To watch', countBy(m.findings, CLASS.WATCH), 'is-watch'],
     ['Risks', countBy(m.findings, CLASS.RISK), 'is-risk'],
     ['Data to fix', countBy(m.findings, CLASS.DQ), '']].forEach(function (p) {
      var c = el('div', 'kpi');
      c.appendChild(el('div', 'kpi-v ' + p[2], p[1]));
      c.appendChild(el('div', 'kpi-k', p[0]));
      box.appendChild(c);
    });
    return box;
  }

  /* ---- the cross-category overview ------------------------------------------------------------- */
  function categoryCard(cat) {
    var m = categoryModel(cat);
    var card = el('div', 'catcard');
    card.setAttribute('data-category', cat);
    var top = el('div', 'catcard-top');

    /* The representative image: the first node in this category that has a VERIFIED one. If no
       product in the category has a verified mapping, the card says so — it does not borrow. */
    var rep = null;
    m.nodes.forEach(function (n) { if (!rep && n.image) rep = n; });
    var fig = el('div', 'catfig');
    if (rep) {
      var im = document.createElement('img');
      im.setAttribute('src', rep.image);
      im.setAttribute('alt', cat + ' — ' + rep.representative_image_sku);
      im.className = 'catfig-img';
      fig.appendChild(im);
    } else {
      fig.appendChild(el('span', 'tfig-miss', 'IMAGE SOURCE MISSING'));
    }
    top.appendChild(fig);

    var head = el('div', 'catcard-head');
    head.appendChild(el('h3', null, cat));
    head.appendChild(el('div', 'catcard-sub',
      rep ? ('Representative photograph: ' + rep.representative_image_sku)
        : 'No verified photograph in this category'));
    top.appendChild(head);
    card.appendChild(top);

    var plotted = 0, variants = 0, noPrice = 0, noImg = 0;
    m.nodes.forEach(function (n) {
      if (n._plottable) plotted++; else noPrice++;
      variants += n.variant_count;
      if (n.image_state !== 'VERIFIED_DB_MAPPING') noImg++;
    });

    var dl = el('dl', 'catrows');
    function row(k, v, cls) {
      dl.appendChild(el('dt', null, k));
      dl.appendChild(el('dd', cls || null, v));
    }
    row('Products / models', String(plotted + noPrice));
    row('Variants', String(variants));
    /* ONE RANGE PER CURRENCY. Never a range across two, and never a converted one. */
    m.panels.forEach(function (p) {
      if (!p.plotted.length) return;
      row('Everyday range · ' + p.currency,
        fromCents(p.plotted[0]._regular_c) + ' – '
          + fromCents(p.plotted[p.plotted.length - 1]._regular_c));
    });
    row('Price gap opportunities', String(countBy(m.findings, CLASS.OPP)),
      countBy(m.findings, CLASS.OPP) ? 'is-opp' : null);
    row('Deal risks', String(countBy(m.findings, CLASS.RISK)),
      countBy(m.findings, CLASS.RISK) ? 'is-risk' : null);
    row('Missing prices', String(noPrice));
    row('Missing photographs', String(noImg));
    card.appendChild(dl);

    var btn = el('button', 'openbtn', 'Open Category Analysis');
    btn.setAttribute('type', 'button');
    btn.setAttribute('data-open-category', cat);
    btn.addEventListener('click', function () {
      STATE.category = cat;
      STATE.view = 'category';
      render();
    });
    card.appendChild(btn);
    return card;
  }

  function viewOverview(host) {
    var head = el('section', 'card');
    head.appendChild(el('h1', 'rtitle', 'Executive Overview'));
    head.appendChild(el('div', 'rmeta',
      'All categories, side by side. Every category keeps its own price scale, so this view is '
      + 'cards and a table — there is no shared price axis here, and no gap, overlap or '
      + 'cannibalisation is computed across two categories.'));
    host.appendChild(head);

    var cats = categoryValues();
    var grid = el('div', 'catgrid');
    grid.id = 'catGrid';
    cats.forEach(function (c) { grid.appendChild(categoryCard(c)); });
    host.appendChild(grid);

    /* The cross-category table. Numbers per category, never a merged ladder. */
    var card = el('section', 'card');
    var h = el('div', 'card-h');
    h.appendChild(el('h2', null, 'All categories'));
    h.appendChild(el('span', 'card-sub', 'counts and ranges only — prices are never pooled'));
    card.appendChild(h);
    var wrap = el('div', 'tablewrap');
    var tb = el('table', 'grid-t');
    tb.id = 'overviewTable';
    var thead = el('thead'), tr = el('tr');
    ['Category', 'Models', 'Variants', 'Currencies', 'Everyday range', 'Opportunities', 'Watch',
      'Risks', 'Data to fix'].forEach(function (t) { tr.appendChild(el('th', null, t)); });
    thead.appendChild(tr);
    tb.appendChild(thead);
    var tbody = el('tbody');
    cats.forEach(function (c) {
      var m = categoryModel(c);
      var variants = 0;
      m.nodes.forEach(function (n) { variants += n.variant_count; });
      var r = el('tr');
      r.setAttribute('data-category', c);
      r.appendChild(el('td', 'tname', c));
      r.appendChild(el('td', 'num', String(m.nodes.length)));
      r.appendChild(el('td', 'num', String(variants)));
      r.appendChild(el('td', 'num', String(m.panels.length)));
      r.appendChild(el('td', 'num', m.panels.map(function (p) {
        return p.plotted.length
          ? (fromCents(p.plotted[0]._regular_c) + '–'
            + fromCents(p.plotted[p.plotted.length - 1]._regular_c) + ' ' + p.currency)
          : ('— ' + p.currency);
      }).join('   ')));
      r.appendChild(el('td', 'num', String(countBy(m.findings, CLASS.OPP))));
      r.appendChild(el('td', 'num', String(countBy(m.findings, CLASS.WATCH))));
      r.appendChild(el('td', 'num', String(countBy(m.findings, CLASS.RISK))));
      r.appendChild(el('td', 'num', String(countBy(m.findings, CLASS.DQ))));
      tbody.appendChild(r);
    });
    tb.appendChild(tbody);
    wrap.appendChild(tb);
    card.appendChild(wrap);
    card.appendChild(el('p', 'card-note',
      'Every figure above is a demonstration figure. Ranges are shown per currency and never '
      + 'converted.'));
    host.appendChild(card);
  }

  /* ---- the product comparison table ------------------------------------------------------------ */
  function productTable(m) {
    var wrap = el('div', 'tablewrap');
    var tb = el('table', 'grid-t');
    tb.id = 'productTable';
    tb.setAttribute('data-category', m.category || '');
    var thead = el('thead'), tr = el('tr');
    ['', 'Model', 'Representative SKU', 'Variants', 'Series', 'Floor', 'Everyday', 'List',
      'Official deal', 'Proposed', 'Status', 'Data quality']
      .forEach(function (t) { tr.appendChild(el('th', null, t)); });
    thead.appendChild(tr);
    tb.appendChild(thead);
    var tbody = el('tbody');
    m.panels.forEach(function (p) {
      p.plotted.concat(p.notPlotted).forEach(function (n) {
        var r = el('tr');
        r.setAttribute('data-category', n.category);
        r.setAttribute('data-label', n.label);
        var tdF = el('td');
        var fig = el('div', 'tfig');
        if (n.image) {
          var im = document.createElement('img');
          im.setAttribute('src', n.image);
          im.setAttribute('alt', n.product_name + ' ' + n.label);
          im.className = 'tfig-img';
          fig.appendChild(im);
        } else {
          fig.appendChild(el('span', 'tfig-miss', 'NO IMAGE'));
        }
        tdF.appendChild(fig);
        r.appendChild(tdF);

        var tdM = el('td');
        tdM.appendChild(el('div', 'tname', n.product_name));
        tdM.appendChild(el('div', 'tsku', n.label
          + (n.grouping_state === 'GROUPED_BY_VARIANT_GROUP' ? '' : '  · ungrouped')));
        r.appendChild(tdM);

        r.appendChild(el('td', 'tsku', n.representative_sku));
        r.appendChild(el('td', 'num', String(n.variant_count)));
        r.appendChild(el('td', null, n.series));
        r.appendChild(el('td', 'num', money(n._min_c, n.currency)));
        r.appendChild(el('td', 'num', money(n._regular_c, n.currency)));
        r.appendChild(el('td', 'num', money(n._msrp_c, n.currency)));

        var tdD = el('td', 'num');
        if (n._deal_c === null) { tdD.appendChild(document.createTextNode('—')); }
        else {
          tdD.appendChild(document.createTextNode(money(n._deal_c, n.currency)));
          tdD.appendChild(el('div', 'pill ' + (n._deal_live ? 'is-risk' : 'is-warn'),
            n._deal_live ? 'live' : (n._deal_period_ok ? 'expired' : 'no dates')));
        }
        r.appendChild(tdD);

        var tdP = el('td', 'num');
        if (n._proposed_c === null) { tdP.appendChild(document.createTextNode('—')); }
        else {
          tdP.appendChild(document.createTextNode(money(n._proposed_c, n.currency)));
          tdP.appendChild(el('div', 'pill', 'board scenario'));
        }
        r.appendChild(tdP);

        r.appendChild(el('td', null, n.lifecycle_status));

        var tdQ = el('td');
        var issues = [];
        if (!n._plottable) issues.push(['is-risk', 'no price']);
        if (n.image_state !== 'VERIFIED_DB_MAPPING') issues.push(['is-warn', 'no photograph']);
        if (n.grouping_state !== 'GROUPED_BY_VARIANT_GROUP') issues.push(['is-warn', 'no grouping']);
        if (!issues.length) issues.push(['is-ok', 'complete']);
        issues.forEach(function (i2) { tdQ.appendChild(el('span', 'pill ' + i2[0], i2[1])); });
        r.appendChild(tdQ);

        tbody.appendChild(r);
      });
    });
    tb.appendChild(tbody);
    wrap.appendChild(tb);
    return wrap;
  }

  /* ---- findings ------------------------------------------------------------------------------- */
  var CLS_NOTE = {};
  CLS_NOTE[CLASS.OPP] = 'A step in the ladder wider than the threshold — room a product could occupy.';
  CLS_NOTE[CLASS.WATCH] = 'Two products selling into the same window. Not wrong; worth knowing.';
  CLS_NOTE[CLASS.RISK] = 'A dearer product discounting to or below a cheaper one’s everyday price.';
  CLS_NOTE[CLASS.DQ] = 'Something a source could not supply. Nothing was substituted.';

  function findingsDrawer(findings, idPrefix) {
    var box = el('section', 'drawer');
    var btn = el('button', 'drawer-toggle');
    btn.setAttribute('type', 'button');
    btn.id = (idPrefix || '') + 'drawerToggle';
    btn.setAttribute('aria-expanded', STATE.drawerOpen ? 'true' : 'false');
    btn.appendChild(el('h2', null, 'Insight drawer'));
    /* ---- THE SUMMARY PILLS ---------------------------------------------------------------------

       ROOT CAUSE, AND IT IS ONE LINE OF CSS. These used to be `<span class="cls cls-RISK">`, and
       the stylesheet gives `.cls-RISK` a background colour and nothing else — the padding, the
       radius, the weight and the white text all live in `.fgroup-h .cls`, a DESCENDANT rule that
       only matches inside a finding group's header. So the same class produced a proper pill in
       one place and a bare saturated rectangle with default dark text in the other: four blocks of
       colour jammed together, unreadable, and nothing like anything else in the Operation System.
       A class that is only half-styled somewhere is two components wearing one name.

       WHAT THEY ARE NOW. Label and count, the way the Operation System's own `.km-tab-rail__count`
       does it (components.css:929) — the word is the label layer, the number is the emphasis
       layer, in a 999px pill of its own. Colour comes from the semantic text tokens base.css
       already declares (`--text-success`, `--text-warning`, `--text-error`, `--text-secondary`),
       as a tinted surface with a matching border and dark-on-light text, never saturated fill
       under black type.

       THEY ARE NOT BUTTONS. Nothing in this round filters by clicking one, and a control that
       looks pressable and does nothing costs a reader more than a plain label ever saves them. */
    var sum = el('div', 'dsum');
    sum.id = (idPrefix || '') + 'insightPills';
    sum.setAttribute('role', 'list');
    [[CLASS.OPP, 'Opportunities', 'opp'], [CLASS.WATCH, 'Watch', 'watch'],
      [CLASS.RISK, 'Risks', 'risk'], [CLASS.DQ, 'Data quality', 'dq']].forEach(function (p) {
      var n = countBy(findings, p[0]);
      if (!n) return;
      var pill = el('span', 'kpill kpill-' + p[2]);
      pill.setAttribute('role', 'listitem');
      pill.setAttribute('data-kind', p[2]);
      pill.setAttribute('data-count', String(n));
      pill.appendChild(el('span', 'kpill-label', p[1]));
      pill.appendChild(el('span', 'kpill-count', String(n)));
      sum.appendChild(pill);
    });
    btn.appendChild(sum);
    btn.addEventListener('click', function () { STATE.drawerOpen = !STATE.drawerOpen; render(); });
    box.appendChild(btn);

    var body = el('div', 'drawer-body');
    body.id = (idPrefix || '') + 'drawerBody';
    body.hidden = !STATE.drawerOpen;
    [CLASS.OPP, CLASS.WATCH, CLASS.RISK, CLASS.DQ].forEach(function (cls) {
      var group = findings.filter(function (f) { return f.cls === cls; });
      if (!group.length) return;
      var g = el('div', 'fgroup');
      var h = el('div', 'fgroup-h');
      h.appendChild(el('span', 'cls cls-' + cls.replace(/\s/g, ''), cls));
      h.appendChild(el('span', 'cls-note', CLS_NOTE[cls]));
      g.appendChild(h);
      group.forEach(function (f) {
        var it = el('div', 'finding');
        it.setAttribute('data-kind', f.kind);
        it.setAttribute('data-class', cls);
        if (f.category) it.setAttribute('data-category', f.category);
        var hd = el('div', 'f-head');
        hd.appendChild(el('span', 'f-title', f.headline));
        hd.appendChild(el('span', 'tag tag-demo', 'DEMONSTRATION INSIGHT'));
        if (f.kind === 'DEAL_CANNIBALIZATION' || f.kind === 'PRICE_BAND_OVERLAP') {
          hd.appendChild(el('span', 'tag ' + (f.proposal_driven ? 'tag-prop' : 'tag-live'),
            f.proposal_driven ? 'PROPOSAL-DRIVEN' : 'LIVE PROMOTION'));
        }
        it.appendChild(hd);
        it.appendChild(el('div', 'f-detail', f.detail));
        g.appendChild(it);
      });
      body.appendChild(g);
    });
    if (!findings.length) {
      body.appendChild(el('p', 'refusal', 'Nothing to report in this scope.'));
    }
    box.appendChild(body);
    return box;
  }

  function recommendation(m) {
    var card = el('section', 'card reco');
    card.appendChild(el('h2', null, 'Executive recommendation'));
    var ul = el('ul');
    var opp = m.findings.filter(function (f) { return f.cls === CLASS.OPP; });
    var risk = m.findings.filter(function (f) { return f.cls === CLASS.RISK; });
    var dq = m.findings.filter(function (f) { return f.cls === CLASS.DQ; });
    if (opp.length) {
      /* THE LAST "open" ON THE PAGE, and it took a screenshot to find it: this round's searches
         were all for "open price step", and this sentence says "open step". */
      ul.appendChild(el('li', null, opp.length + ' price gap'
        + (opp.length === 1 ? '' : 's') + ' in the ladder — the widest is '
        + fromCents(Math.max.apply(null, opp.map(function (f) { return f.distance_c; })))
        + '. That is an unoccupied price tier: a product placed there would not sit on top of an'
        + ' existing one. It is not an inventory shortage and not an order status.'));
    }
    if (risk.length) {
      ul.appendChild(el('li', null, risk.length + ' cannibalisation risk'
        + (risk.length === 1 ? '' : 's') + ' — a dearer product reaching a cheaper one’s '
        + 'everyday price. Check whether the discount is intended to move that unit or to defend it.'));
    }
    if (dq.length) {
      ul.appendChild(el('li', null, dq.length + ' data-quality item'
        + (dq.length === 1 ? '' : 's') + ' — these are the cheapest findings to close, and every '
        + 'one of them is a field somebody can fill in.'));
    }
    ul.appendChild(el('li', null, 'Nothing here is a conclusion about Kitchen Mama’s products. '
      + 'Every price is a demonstration figure; the product identities and photographs are real.'));
    card.appendChild(ul);
    return card;
  }

  function viewCategory(host) {
    var cat = STATE.category || firstCategory();
    STATE.category = cat;
    var m = categoryModel(cat);

    var head = el('section', 'card');
    head.appendChild(el('h1', 'rtitle', cat));
    head.appendChild(el('div', 'rmeta', 'Price architecture · ' + scopeLabel()
      + ' · prepared ' + PREVIEW_TODAY));
    host.appendChild(head);

    host.appendChild(kpiStrip(m));

    m.panels.forEach(function (p) {
      var panel = el('section', 'panel');
      panel.setAttribute('data-currency', p.currency);
      panel.setAttribute('data-category', cat);
      var h = el('div', 'panel-h');
      h.appendChild(el('h3', null, 'Price architecture'));
      h.appendChild(el('span', 'cur', p.currency));
      h.appendChild(el('span', 'card-sub', p.plotted.length + ' product'
        + (p.plotted.length === 1 ? '' : 's') + ' on the axis'));
      panel.appendChild(h);
      /* ONE DERIVATION, TWO READERS. The control bar needs to know what the engine decided (so it
         can say "compact overview" rather than leaving the reader to wonder why the pictures got
         small), and the chart needs to draw it. Deriving it twice would be two answers to one
         question the moment anything about the derivation changed. */
      var lay = LAYOUT.deriveResponsiveChartLayout({
        containerWidth: (STATE.box || {}).w,
        availableHeight: (STATE.box || {}).h,
        productCount: p.plotted.length,
        domainLowC: scopeDomain(p.plotted).lo,
        domainHighC: scopeDomain(p.plotted).hi,
        mode: STATE.fullscreen ? 'fullscreen' : STATE.chartMode
      });
      panel.setAttribute('data-density', lay.density);
      panel.appendChild(chartControls(lay));
      panel.appendChild(renderChart(p, STATE.thresholdC, m.findings));
      panel.appendChild(legend());
      host.appendChild(panel);
    });

    var tcard = el('section', 'card');
    var th = el('div', 'card-h');
    th.appendChild(el('h2', null, 'Product comparison'));
    th.appendChild(el('span', 'card-sub', cat + ' only · ' + scopeLabel()));
    tcard.appendChild(th);
    tcard.appendChild(productTable(m));
    host.appendChild(tcard);

    host.appendChild(findingsDrawer(m.findings, ''));
    host.appendChild(recommendation(m));
  }

  /**
   * THE SITE-ELIGIBILITY DIAGNOSTIC — WHERE THE MISSING MAPPINGS ARE VISIBLE.
   *
   * The brief asks for a place a product with no regional record can be SEEN rather than merely
   * omitted. This is that place, and it is deliberately a ledger rather than a warning: it shows the
   * canonical count, what membership kept, what the status gate dropped, and what is kept but cannot be
   * plotted — with the reason on each row. Four numbers that add up are harder to argue with than a
   * sentence saying the data is fine.
   */
  function viewEligibility(host) {
    var u = MODEL.universe;
    var site = MODEL.site;
    var card = el('section', 'card');
    card.id = 'eligibilityCard';
    var h = el('div', 'card-h');
    h.appendChild(el('h2', null, 'Site eligibility and missing mappings'));
    h.appendChild(el('span', 'card-sub', site.complete ? site.key : 'aggregate scope'));
    h.appendChild(infoIcon('eligibility', 'How this page decides what exists', [
      'Order of operations: ' + u.order.join(' → ') + '.',
      'Membership authority: ' + u.membership_authority + '. A product is on this site because a'
        + ' listing row says so — never because the product master knows about it and never because'
        + ' its price is in this site’s currency.',
      'A listing with no regional record is KEPT, reported here, and kept off the price chart. Those'
        + ' are three different outcomes on purpose: "we cannot describe this listing" must not look'
        + ' like "it is not sold here" or like "everything is fine".'
    ]));
    card.appendChild(h);

    /* §七.8 — THE DETAIL STAYS, COLLAPSED. This page is where the engineering vocabulary belongs, so
       nothing here is shortened; it simply does not have to be the first thing on the screen. The
       one-line summary above it is what a reader sees until they ask. */
    var sum = el('p', 'card-note');
    sum.id = 'dqSummary';
    sum.appendChild(document.createTextNode(u.counts.eligible + ' listings on this site · '
      + u.counts.chartable + ' can be plotted · ' + u.dataQuality.total
      + ' data quality item' + (u.dataQuality.total === 1 ? '' : 's')));
    card.appendChild(sum);
    var dqBtn = el('button', 'filt-toggle',
      (STATE.dqDetailOpen ? 'Hide' : 'Show') + ' the full eligibility ledger');
    dqBtn.id = 'dqDetailToggle';
    dqBtn.setAttribute('type', 'button');
    dqBtn.setAttribute('aria-expanded', STATE.dqDetailOpen ? 'true' : 'false');
    dqBtn.setAttribute('aria-controls', 'dqDetail');
    dqBtn.addEventListener('click', function () {
      STATE.dqDetailOpen = !STATE.dqDetailOpen;
      render();
    });
    card.appendChild(dqBtn);
    var detail = el('div', 'dq-detail');
    detail.id = 'dqDetail';
    detail.hidden = !STATE.dqDetailOpen;
    card.appendChild(detail);
    var card0 = card;
    card = detail;

    var wrap = el('div', 'tablewrap');
    var t = el('table', 'grid-t');
    t.id = 'eligibilityTable';
    var thead = el('thead');
    var hr = el('tr');
    ['Stage', 'Rows', 'What it means'].forEach(function (x) { hr.appendChild(el('th', null, x)); });
    thead.appendChild(hr);
    t.appendChild(thead);
    var tb = el('tbody');
    [['canonical', u.counts.canonical, 'every listing the adapter handed over, across every site'],
      ['on this site', u.counts.after_site, 'survived marketplace_skus membership'],
      ['past the status gate', u.counts.after_status,
        'status in ' + u.permitted_statuses.join(' / ')
          + (u.include_inactive ? ' (inactive included)' : '')],
      ['eligible', u.counts.eligible, 'shown on this board'],
      ['plottable', u.counts.chartable,
        'has an everyday price AND a regional record — the rest are listed, not plotted'],
      ['excluded', u.counts.excluded, 'every one of them with a named reason']
    ].forEach(function (row) {
      var tr = el('tr');
      tr.setAttribute('data-stage', row[0]);
      tr.appendChild(el('td', null, row[0]));
      tr.appendChild(el('td', 'num', String(row[1])));
      tr.appendChild(el('td', null, row[2]));
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    wrap.appendChild(t);
    card.appendChild(wrap);

    /* ---- THE MISSING-MAPPING LEDGER ---- */
    var buckets = [
      ['regional_details_missing', u.dataQuality.regional_details_missing,
        'listed on this site, and sku_regional_details has no row for this exact four-part identity.'
          + ' KEPT — membership never depended on that table — reported here, and off the price chart.'],
      ['category_source_missing', u.dataQuality.category_source_missing,
        'sku_details.category is blank. The SKU is kept, shown as ' + SEL.UNMAPPED_LABEL
          + ', and never renamed "Other".'],
      ['price_source_missing', u.dataQuality.price_source_missing,
        'no everyday price on record, so there is no coordinate to plot. No stand-in is used.'],
      ['status_missing_or_unrecognised', u.dataQuality.status_missing_or_unrecognised,
        'the site status is blank or outside the shipped vocabulary, so it was NOT read as sellable.'],
      ['master_record_missing', u.dataQuality.master_record_missing,
        'a site listing whose master sku_details row could not be joined.']
    ];
    var dq = el('div', 'dqlist');
    dq.id = 'dqBuckets';
    buckets.forEach(function (b) {
      var row = el('div', 'dqrow');
      row.setAttribute('data-bucket', b[0]);
      row.setAttribute('data-count', String(b[1].length));
      var hd = el('div', 'f-head');
      hd.appendChild(el('span', 'f-title', b[0] + ' — ' + b[1].length));
      row.appendChild(hd);
      row.appendChild(el('div', 'f-detail', b[2]));
      if (b[1].length) row.appendChild(el('div', 'mono', b[1].join(' · ')));
      dq.appendChild(row);
    });
    card.appendChild(dq);
    card.appendChild(el('p', 'card-note', 'Total Data Quality items on this site: '
      + u.dataQuality.total + '. A count of zero here is a measurement, not an absence of checking.'));
    host.appendChild(card0);
  }

  function viewFindings(host, cls, title, blurb) {
    var cats = STATE.category ? [STATE.category] : categoryValues();
    var head = el('section', 'card');
    head.appendChild(el('h1', 'rtitle', title));
    head.appendChild(el('div', 'rmeta', blurb));
    host.appendChild(head);
    var total = 0;
    cats.forEach(function (c) {
      var m = categoryModel(c);
      var f = m.findings.filter(function (x) { return x.cls === cls; });
      total += f.length;
      var card = el('section', 'card');
      card.setAttribute('data-category', c);
      var h = el('div', 'card-h');
      h.appendChild(el('h2', null, c));
      h.appendChild(el('span', 'card-sub', f.length + ' item' + (f.length === 1 ? '' : 's')));
      card.appendChild(h);
      if (!f.length) {
        card.appendChild(el('p', 'refusal', 'Nothing to report in this category.'));
      } else {
        f.forEach(function (x) {
          var it = el('div', 'finding');
          it.setAttribute('data-kind', x.kind);
          it.setAttribute('data-class', cls);
          it.setAttribute('data-category', c);
          var hd = el('div', 'f-head');
          hd.appendChild(el('span', 'f-title', x.headline));
          hd.appendChild(el('span', 'tag tag-demo', 'DEMONSTRATION INSIGHT'));
          if (x.kind === 'DEAL_CANNIBALIZATION' || x.kind === 'PRICE_BAND_OVERLAP') {
            hd.appendChild(el('span', 'tag ' + (x.proposal_driven ? 'tag-prop' : 'tag-live'),
              x.proposal_driven ? 'PROPOSAL-DRIVEN' : 'LIVE PROMOTION'));
          }
          it.appendChild(hd);
          it.appendChild(el('div', 'f-detail', x.detail));
          card.appendChild(it);
        });
      }
      host.appendChild(card);
    });
    head.appendChild(el('p', 'card-note', total + ' item' + (total === 1 ? '' : 's')
      + ' across ' + cats.length + ' categor' + (cats.length === 1 ? 'y' : 'ies')
      + '. Each category is counted on its own; nothing is compared across two.'));
  }

  /* ================================================================================================
     8  STRATEGY WORKSPACE and ADVANCED DETAILS.
     ================================================================================================ */
  function viewWorkspace(host) {
    var cat = STATE.category || firstCategory();
    STATE.category = cat;
    var m = categoryModel(cat);

    var head = el('section', 'card');
    head.appendChild(el('h1', 'rtitle', 'Strategy Workspace'));
    head.appendChild(el('div', 'rmeta', cat + ' · a scratch surface. Nothing here is saved, '
      + 'because nothing here has anywhere to be saved to.'));
    host.appendChild(head);

    var ws = el('div', 'ws');
    var pick = el('section', 'picker');
    pick.appendChild(el('h2', 'card-sub', 'Products'));
    var search = document.createElement('input');
    search.id = 'fSearch';
    search.setAttribute('type', 'text');
    search.setAttribute('placeholder', 'Search this category');
    search.value = STATE.search;
    search.addEventListener('input', function () { STATE.search = search.value; render(); });
    pick.appendChild(search);
    var list = el('div', 'picklist');
    list.id = 'pickList';
    var q = String(STATE.search || '').toLowerCase();
    m.nodes.filter(function (n) {
      return !q || (n.label + ' ' + n.product_name).toLowerCase().indexOf(q) >= 0;
    }).forEach(function (n) {
      var lab = el('label', 'pick');
      var cb = document.createElement('input');
      cb.setAttribute('type', 'checkbox');
      cb.className = 'pickbox';
      cb.setAttribute('data-key', n.key);
      cb.checked = !!STATE.selected[n.key];
      cb.addEventListener('change', function () {
        STATE.selected[n.key] = cb.checked;
        render();
      });
      lab.appendChild(cb);
      lab.appendChild(el('span', null, n.label + '  ' + money(n._regular_c, n.currency)));
      list.appendChild(lab);
    });
    pick.appendChild(list);
    ws.appendChild(pick);

    var right = el('div');
    var tools = el('div', 'wstools');
    [['wsText', 'Add text', false], ['wsBand', 'Add price band', false],
     ['wsMatrix', 'Add matrix', false],
     ['wsShare', 'Share', true], ['wsSave', 'Save layout', true], ['wsExport', 'Export', true],
     ['wsHistory', 'Version history', true], ['wsComment', 'Comments', true],
     ['wsAssign', 'Assign owner', true]].forEach(function (t) {
      var b = el('button', 'tool', t[1]);
      b.id = t[0];
      b.setAttribute('type', 'button');
      if (t[2]) {
        b.disabled = true;
        b.title = 'Not implemented in this prototype: it would need a place to write to.';
      } else {
        b.addEventListener('click', function () {
          STATE.elements.push({ id: 'e' + (++STATE.seq), kind: t[0], text: '' });
          render();
        });
      }
      tools.appendChild(b);
    });
    right.appendChild(tools);

    var board = el('div', 'board');
    board.id = 'board';
    var sel = m.nodes.filter(function (n) { return !!STATE.selected[n.key]; });
    if (sel.length) {
      var p = { currency: sel[0].currency,
        plotted: sel.filter(function (n) { return n._plottable; })
          .sort(function (a, b) { return a._regular_c - b._regular_c; }),
        notPlotted: sel.filter(function (n) { return !n._plottable; }) };
      board.appendChild(renderChart(p, STATE.thresholdC, []));
    } else {
      board.appendChild(el('p', 'refusal', 'Choose products on the left to chart them.'));
    }
    STATE.elements.forEach(function (e) {
      var b = el('div', 'bel');
      b.setAttribute('data-kind', e.kind);
      var h = el('div', 'bel-head');
      h.appendChild(el('span', null, e.kind === 'wsText' ? 'Text'
        : e.kind === 'wsBand' ? 'Price band note' : 'Matrix note'));
      var del = el('button', 'bel-del', 'remove');
      del.setAttribute('type', 'button');
      del.addEventListener('click', function () {
        STATE.elements = STATE.elements.filter(function (z) { return z.id !== e.id; });
        render();
      });
      h.appendChild(del);
      b.appendChild(h);
      var ta = document.createElement('textarea');
      ta.className = e.kind === 'wsBand' ? 'bel-bandnote' : 'bel-note';
      ta.value = e.text;
      ta.addEventListener('input', function () { e.text = ta.value; });
      b.appendChild(ta);
      board.appendChild(b);
    });
    right.appendChild(board);
    ws.appendChild(right);
    host.appendChild(ws);
  }

  function viewAdvanced(host) {
    var head = el('section', 'card');
    head.appendChild(el('h1', 'rtitle', 'Advanced details'));
    head.appendChild(el('div', 'rmeta', 'Source columns, provenance and the rules the page applies. '
      + 'Everything here is engineering detail; none of it appears on the executive surface.'));
    host.appendChild(head);

    var box = el('section', 'advanced');
    var btn = el('button', 'adv-toggle');
    btn.id = 'advToggle';
    btn.setAttribute('type', 'button');
    btn.setAttribute('aria-expanded', STATE.advancedOpen ? 'true' : 'false');
    btn.appendChild(el('h2', null, 'Contract, provenance and refusals'));
    btn.addEventListener('click', function () { STATE.advancedOpen = !STATE.advancedOpen; render(); });
    box.appendChild(btn);

    var body = el('div', 'adv-body');
    body.id = 'advBody';
    body.hidden = !STATE.advancedOpen;

    var pv = LOAD.provenance || {};
    body.appendChild(el('p', 'mono', 'adapter ' + pv.adapter + '  ·  connected '
      + String(pv.connected) + '  ·  requests ' + pv.requests_made
      + '  ·  identity ' + pv.identity_source + '  ·  prices ' + pv.price_source
      + '  ·  verified images ' + pv.images_verified));
    body.appendChild(el('p', 'mono', 'scope order  '
      + (CONTRACT.SCOPE_ORDER || []).join(' → ')));
    body.appendChild(el('p', 'mono', 'category authority  '
      + CONTRACT.CATEGORY_AUTHORITY.source + '  ('
      + CONTRACT.CATEGORY_AUTHORITY.shipped_at + ')'));

    var wrap = el('div', 'tablewrap');
    var tb = el('table', 'grid-t');
    tb.id = 'contractTable';
    var thead = el('thead'), tr = el('tr');
    ['Field', 'Source table', 'Source column', 'Nullable', 'On missing', 'Available today']
      .forEach(function (t) { tr.appendChild(el('th', null, t)); });
    thead.appendChild(tr);
    tb.appendChild(thead);
    var tbody = el('tbody');
    CONTRACT.FIELDS.forEach(function (f) {
      var r = el('tr');
      r.appendChild(el('td', 'mono', f.field));
      r.appendChild(el('td', 'mono', f.gap ? 'GAP — no table has it' : f.source_table));
      r.appendChild(el('td', 'mono', f.gap ? '—' : f.source_column));
      r.appendChild(el('td', null, f.nullable ? 'yes' : 'no'));
      r.appendChild(el('td', 'mono', f.on_missing));
      r.appendChild(el('td', null, f.needs_p1b1 ? 'needs a P1-B1 read owner' : 'yes'));
      tbody.appendChild(r);
    });
    tb.appendChild(tbody);
    wrap.appendChild(tb);
    body.appendChild(wrap);

    var mp = el('div', 'tablewrap');
    var mt = el('table', 'grid-t');
    mt.id = 'mappingTable';
    var mh = el('thead'), mr = el('tr');
    ['SKU', 'image_url on the sku_details row', 'Evidence'].forEach(function (t) {
      mr.appendChild(el('th', null, t));
    });
    mh.appendChild(mr);
    mt.appendChild(mh);
    var mb = el('tbody');
    Object.keys(CONTRACT.IMAGE_POLICY.verified_mappings).forEach(function (sku) {
      var r = el('tr');
      r.setAttribute('data-sku', sku);
      r.appendChild(el('td', 'mono', sku));
      r.appendChild(el('td', 'mono', CONTRACT.IMAGE_POLICY.verified_mappings[sku]));
      r.appendChild(el('td', null, CONTRACT.IMAGE_POLICY.verified_mapping_basis));
      mb.appendChild(r);
    });
    mt.appendChild(mb);
    mp.appendChild(mt);
    body.appendChild(el('p', 'card-note', CONTRACT.IMAGE_POLICY.verified_mapping_caveat));
    body.appendChild(mp);

    box.appendChild(body);
    host.appendChild(box);
  }

  /* ================================================================================================
     9  THE SHELL — sidebar, scope ladder, print, presentation.

     The navigation is a SIDEBAR, not a row of buttons. That is the actual difference between this
     and the previous round: the tools were all at the same visual weight and in the same place, so
     nothing was primary and the page read as a toolbox. A sidebar states the hierarchy — where you
     are, what else exists, and what is an action rather than a place.

     Icons are inline SVG, 18px, stroked, currentColor. No emoji, no icon font, no CDN. They are UI
     glyphs; not one of them is ever used where a product photograph would go.
     ================================================================================================ */
  var NAV = [
    { id: 'overview', label: 'Executive Overview', icon: 'M3 10.5 10 4l7 6.5M5.5 9.5V16h9V9.5' },
    { id: 'category', label: 'Category Analysis',
      icon: 'M3.5 16V8M8 16V4.5M12.5 16v-5M17 16V6.5' },
    { id: 'risk', label: 'Deal Risk',
      icon: 'M10 3.5 17.5 16.5h-15zM10 8.5v3.5M10 14.2v.1' },
    { id: 'quality', label: 'Data Quality',
      icon: 'M4 5.5h12M4 10h12M4 14.5h7M14.2 13.4l1.6 1.6 2.6-3' },
    { id: 'workspace', label: 'Strategy Workspace',
      icon: 'M3 5.5h14v9H3zM3 8.5h14M7.5 8.5v6' },
    { id: 'advanced', label: 'Advanced Details',
      icon: 'M8 3.5h4l.4 2 1.8 1 1.9-.8 2 3.4-1.5 1.3v2.2l1.5 1.3-2 3.4-1.9-.8-1.8 1-.4 2H8'
        + 'l-.4-2-1.8-1-1.9.8-2-3.4L3.4 12.7v-2.2L1.9 9.2l2-3.4 1.9.8 1.8-1z' }
  ];

  function icon(d) {
    var s = svg('svg', { viewBox: '0 0 20 20', 'class': 'ic', 'aria-hidden': 'true' });
    s.appendChild(svg('path', { d: d }));
    return s;
  }

  function renderNav() {
    var ul = byId('nav');
    if (!ul) return;          /* P1-B7 — a host that is not there is a missing control, not a dead page */
    clear(ul);
    NAV.forEach(function (item) {
      var li = document.createElement('li');
      var b = el('button', 'navbtn' + (STATE.view === item.id ? ' is-active' : ''));
      b.setAttribute('type', 'button');
      b.id = 'nav-' + item.id;
      b.setAttribute('data-view', item.id);
      b.setAttribute('data-tip', item.label);
      b.setAttribute('title', item.label);
      b.setAttribute('aria-current', STATE.view === item.id ? 'page' : 'false');
      b.appendChild(icon(item.icon));
      b.appendChild(el('span', 'nav-text', item.label));
      b.addEventListener('click', function () {
        STATE.view = item.id;
        /* Leaving the overview picks up a category; the overview itself has none, because it is the
           only view allowed to look across them. */
        if (item.id === 'overview') { STATE.category = null; }
        else if (!STATE.category) { STATE.category = firstCategory(); }
        render();
      });
      li.appendChild(b);
      ul.appendChild(li);
    });
  }

  /* ================================================================================================
     THE SCOPE LADDER — INVERTED IN P1-B2, AND THE INVERSION IS THE ROUND'S ARCHITECTURAL CHANGE.

     P0-R3-R2 made category the first ring. That was right while the board had one site, and it became
     wrong the moment the site decided which products exist: a category menu built before the site is
     known is a menu over every site, and on DE — which sells one category — it offered three.

     THE ORDER IS NOW THE SOURCE'S OWN ORDER (design freeze 33.6, 72_ ppwMembership_):

         company -> country -> marketplace   the SITE. Membership. Which SKUs exist at all.
           -> category                       derived from what survived
             -> series -> currency           derived from that
               -> gap threshold              a display parameter, not a scope

     Everything to the right of a ring is rebuilt when that ring changes, which is why changing the
     country cannot leave the previous site's category selected: the selection is validated against the
     new menu in the same handler that changed it.
     ================================================================================================ */
  function scopeLabel() {
    var site = siteIdentity();
    var bits = [];
    bits.push(site.company === 'ALL' ? 'all companies' : site.company);
    bits.push(site.country === 'ALL' ? 'all countries' : site.country);
    bits.push(site.marketplace === 'ALL' ? 'all marketplaces' : site.marketplace);
    if (STATE.currency !== 'ALL') bits.push(STATE.currency);
    if (STATE.series !== 'ALL') bits.push(STATE.series);
    return bits.join(' · ');
  }

  function renderCrumbs() {
    var c = byId('crumbs');
    if (!c) return;           /* P1-B7 — see renderNav */
    clear(c);
    var item = null;
    NAV.forEach(function (n) { if (n.id === STATE.view) item = n; });
    c.appendChild(el('span', 'crumb-1', 'Product Strategy'));
    c.appendChild(el('span', 'crumb-sep', '/'));
    c.appendChild(el('span', 'crumb-2', (item ? item.label : '')
      + (STATE.category && STATE.view !== 'overview' ? ' · ' + STATE.category : '')));
  }

  /* The distinct values of one site dimension, across the CANONICAL universe. These three are the only
     menus that may be built before membership, because they are what membership is selected FROM. */
  function siteDimensionValues(key) {
    var seen = {}, out = [];
    CANON.rows.forEach(function (r) {
      var v = String(r[key] === null || r[key] === undefined ? '' : r[key]);
      if (v === '' || seen[v]) return;
      seen[v] = 1;
      out.push(v);
    });
    return out.sort();
  }

  /**
   * P1-B4 §1.3 — THE OPTIONS OF ONE TIER, NARROWED BY THE TIERS ABOVE IT.
   *
   * `siteDimensionValues` reads the whole table, which is right for "what does this data contain"
   * and wrong for "what can I pick next". Offering every country in the database under a chosen
   * company is offering a journey that ends in an empty chart, and `narrowAfterSiteChange` only
   * cleared the selection AFTER it had been made — a repair where a constraint belongs.
   *
   * The ladder is Company -> Country -> Marketplace. Each level filters on the levels above it and on
   * nothing below, so choosing a marketplace never restricts the country list that produced it.
   */
  var SCOPE_LADDER = ['company', 'country', 'marketplace'];
  function scopeDimensionValues(key) {
    var idx = SCOPE_LADDER.indexOf(key);
    var above = idx < 0 ? [] : SCOPE_LADDER.slice(0, idx);
    var seen = {}, out = [];
    CANON.rows.forEach(function (r) {
      for (var i = 0; i < above.length; i++) {
        var k = above[i];
        if (STATE[k] !== 'ALL' && String(r[k]) !== String(STATE[k])) return;
      }
      var v = String(r[key] === null || r[key] === undefined ? '' : r[key]);
      if (v === '' || seen[v]) return;
      seen[v] = 1;
      out.push(v);
    });
    return out.sort();
  }

  /**
   * CHANGING A RING INVALIDATES EVERYTHING TO ITS RIGHT, HERE, IN ONE PLACE.
   *
   * "切換 country 不殘留上一站點資料" is not a rendering concern; it is a state concern. A category that
   * the new site does not sell would otherwise stay selected and every downstream view would filter to
   * zero rows — a screen that looks like a site with no products instead of a stale selection.
   */
  /**
   * P1-B4 §4 — THE STRESS FIXTURE, REACHABLE ONLY DELIBERATELY.
   *
   * `Load generated stress fixture (density test)` was a checkbox in the filters. It is a generated
   * load test — forty-four invented products — and a control that loads fake data sitting beside the
   * controls that filter real data is one misclick from a meeting shown fiction.
   *
   * SO IT IS NOT IN THE UI AT ALL, AND THERE IS NO URL PARAMETER. §4.6 rules that out explicitly,
   * and it is the right rule: a link is forwardable, so a query string is a way for one person's
   * debugging to become another person's screenshot. The only two ways in are:
   *
   *   1. `window.__PSB_DEV_MODE__ = true` set BEFORE the scripts run — which only someone editing the
   *      page or a harness can do, and which then also shows a labelled developer strip.
   *   2. `window.__psbUseStressFixture(true)`, defined only in that mode, which is what the suites
   *      call. Query-independent fixture injection, exactly as §4.3 asks.
   *
   * A production build defines neither, so there is nothing to find and nothing to toggle.
   */
  function devModeOn() {
    return typeof window !== 'undefined' && window && window.__PSB_DEV_MODE__ === true;
  }

  function applyFixtureChoice(useStress) {
    STATE.stress = !!useStress;
    STATE.company = 'ALL'; STATE.country = 'ALL'; STATE.marketplace = 'ALL';
    STATE.category = null; STATE.series = 'ALL'; STATE.currency = 'ALL';
    STATE.overrides = {}; STATE.undoStack = []; STATE.scenarioSeries = '';
    STATE.view = 'overview';
    ADAPTER = STATE.stress ? PREVIEW.StressProductStrategyDataAdapter
      : PREVIEW.PreviewProductStrategyDataAdapter;
    reload();
    var firstSite = CANON.rows[0];
    if (firstSite) {
      STATE.company = firstSite.company;
      STATE.country = firstSite.country;
      STATE.marketplace = firstSite.marketplace;
    }
    narrowAfterSiteChange();
    render();
  }

  function exposeDevHooks() {
    if (typeof window === 'undefined' || !window || !devModeOn()) return;
    /* NAMED FOR WHAT IT IS. Anyone reading a stack trace or a console sees "stress fixture", not a
       neutral verb that could be mistaken for loading the real thing. */
    window.__psbUseStressFixture = function (on) { applyFixtureChoice(on !== false); };
    window.__psbDevState = function () {
      return { stress: STATE.stress, adapter: STATE.stress ? 'Stress' : 'Preview' };
    };
  }

  function narrowAfterSiteChange() {
    MODEL = buildModel();
    var cats = MODEL.categoryOptions.options.map(function (o) { return o.value; });
    if (STATE.category !== null && cats.indexOf(STATE.category) < 0) {
      STATE.category = null;
      if (STATE.view !== 'overview') STATE.view = 'overview';
    }
    var ser = MODEL.seriesOptions.options.map(function (o) { return o.value; });
    if (STATE.series !== 'ALL' && ser.indexOf(STATE.series) < 0) STATE.series = 'ALL';
    var cur = SEL.deriveDimensionValues(MODEL.universe, 'currency');
    if (STATE.currency !== 'ALL' && cur.indexOf(STATE.currency) < 0) STATE.currency = 'ALL';
    /* AN UNMADE CHOICE STAYS UNMADE. This used to reset to 'ALL', which is precisely the silent
       default P1-B2A removed: a Series box reading "All" tells a person their change has a reach they
       cannot see. When the site changes and the chosen Series is not on the new one, the choice goes
       back to EMPTY and the form asks again. */
    if (STATE.scenarioSeries !== '' && ser.indexOf(STATE.scenarioSeries) < 0) {
      STATE.scenarioSeries = '';
    }
    STATE.scenarioRefusal = null;
  }

  /**
   * ONE SELECT, BUILT ONE WAY.
   *
   * `placeholder` gives the empty value a caption ("Choose a Series…") so an unmade choice reads as
   * unmade rather than as "All" — the brief's point that a default of All hides the reach of a change.
   * `labelFn` maps a value to what a person should read, which is how the scenario form shows
   * "Proposed price" while the state keeps `proposed_scenario_price`: one translation, at the edge,
   * so no internal name can reach the screen by being forgotten about.
   */
  function selectEl(id, label, values, current, onChange, disabled, placeholder, labelFn) {
    var fl = el('div', 'fl');
    var lab = el('label', 'fl-label', label);
    lab.setAttribute('for', id);
    fl.appendChild(lab);
    var sel = document.createElement('select');
    sel.id = id;
    sel.disabled = !!disabled;
    values.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v;
      o.setAttribute('value', v);
      var text = v === '' ? (placeholder || '') : (labelFn ? labelFn(v) : (v === 'ALL' ? 'All' : v));
      o.appendChild(document.createTextNode(text));
      sel.appendChild(o);
    });
    sel.value = current;
    sel.addEventListener('change', function () { onChange(sel.value); });
    fl.appendChild(sel);
    return fl;
  }

  /**
   * ==============================================================================================
   * P1-B4 §1/§2/§3 — ONE COMPACT COMMAND BAR
   * ==============================================================================================
   *
   * WHAT WAS WRONG WAS NOT THE CONTROLS, IT WAS THAT EACH OF THEM HAD A CARD.
   *
   * Site, Analysis, Advanced and Price Scenario were four stacked blocks, each with its own heading,
   * its own `?`, its own state line and its own border. MEASURED: 422px at 1920x1080, 1366x768 and
   * 1024x768, and 458px at 768 — 43% of a 1080-high viewport, 63% of a 768-high one, with the first
   * KPI at y=678. Four headings is not information architecture; it is four frames around five
   * dropdowns.
   *
   * So there is one bar, and the hierarchy is carried by POSITION and WEIGHT rather than by
   * furniture. Row one is the ladder a person walks in order — Company, Country, Marketplace,
   * Category, Series — with the two secondary entrances pushed to the right. Row two is a quiet
   * summary of where you are. Everything else is behind a popover or a drawer, which OVERLAY rather
   * than displace: the old Advanced band pushed the chart down by its own height every time it
   * opened, which is a layout that punishes you for looking.
   *
   * NO RED CAPITALS AS HIERARCHY (§1.8). The labels are 11px uppercase in the muted token; the values
   * are 14px in the primary token. Emphasis is size and colour weight, not alarm.
   */
  function renderScope() {
    var host = byId('scope');
    clear(host);
    var site = siteIdentity();
    var opts = categoryOptionRows();
    var cats = opts.options.map(function (o) { return o.value; });
    var countBySite = {};
    opts.options.forEach(function (o) { countBySite[o.value] = o.siteSkuCount; });

    var bar = el('div', 'cmdbar');
    bar.id = 'cmdBar';

    /* ---- ROW 1 · THE LADDER, IN ORDER, ALWAYS VISIBLE ----------------------------------------
       `#scopeSite` keeps its id: the resize observer's identity contract (P1-B2C) is asserted
       against this node surviving a redraw, and renaming it would quietly retire that assertion. */
    var row1 = el('div', 'cmdbar-row cmdbar-primary');
    row1.id = 'scopeSite';

    var ladder = el('div', 'cmd-fields');
    ladder.id = 'scopeFields';
    SCOPE_LADDER.forEach(function (dim) {
      ladder.appendChild(scopeField(dim));
    });
    /* Category and Series close the ladder. They narrow INSIDE the site and cannot widen it, which
       is why they come after all three site dimensions and not between them. */
    ladder.appendChild(categoryField(cats, countBySite, opts));
    ladder.appendChild(seriesField());
    row1.appendChild(ladder);

    /* ---- ROW 1 RIGHT · THE TWO SECONDARY ENTRANCES ------------------------------------------- */
    var tools = el('div', 'cmd-tools');
    tools.id = 'cmdTools';
    tools.appendChild(moreFiltersControl());
    tools.appendChild(meetingScenarioControl());
    row1.appendChild(tools);
    bar.appendChild(row1);

    /* ---- ROW 2 · WHERE YOU ARE, QUIETLY ------------------------------------------------------ */
    bar.appendChild(scopeSummaryRow(site));

    host.appendChild(bar);

    /* The drawer is a SIBLING of the bar, not a child: it is position:fixed, so nesting it inside a
       flex row would put a fixed element in a layout that believes it participates. */
    renderScenarioDrawer(host);

    if (devModeOn()) host.appendChild(devStrip());
  }

  /**
   * §1.4 — ONE OPTION IS A FACT, NOT A CHOICE.
   *
   * A dropdown with a single item is a control that cannot do anything: it takes a click, opens, and
   * offers you what you already have. Worse, it reads as a decision still to be made. So a dimension
   * with exactly one value renders as READ-ONLY CONTEXT — the label and the value, no chevron, no
   * focus stop — and the suite asserts there is no `<select>` there at all.
   *
   * `ALL` IS NOT AN OPTION WHEN THERE IS ONLY ONE VALUE EITHER. Offering "All" beside a single
   * country is offering the same set twice under two names.
   */
  function scopeField(dim) {
    var LABEL = { company: 'Company', country: 'Country', marketplace: 'Marketplace' };
    var values = scopeDimensionValues(dim);
    var id = 'f' + dim.charAt(0).toUpperCase() + dim.slice(1);

    if (values.length === 1) {
      /* THE SELECTION IS CORRECTED TO THE ONLY VALUE, so the state and the screen agree. A scope
         reading 'ALL' while one value exists is the same scope described two ways, and the site key
         downstream would say "aggregate" about a single site. */
      if (STATE[dim] !== values[0]) {
        STATE[dim] = values[0];
        MODEL = buildModel();
      }
      return contextField(id, LABEL[dim], values[0], 'only one on this scope');
    }
    var g = selectEl(id, LABEL[dim], ['ALL'].concat(values), STATE[dim], function (v) {
      STATE[dim] = v;
      /* §1.5 — the tiers BELOW are cleared here, and the ones above are untouched. */
      clearBelow(dim);
      narrowAfterSiteChange();
      render();
    }, false);
    g.className = 'filter-group cmd-field';
    return g;
  }

  /** §1.5 — changing a tier invalidates the tiers below it, by position in the ladder. */
  function clearBelow(dim) {
    var idx = SCOPE_LADDER.indexOf(dim);
    if (idx < 0) return;
    for (var i = idx + 1; i < SCOPE_LADDER.length; i++) {
      var k = SCOPE_LADDER[i];
      var still = scopeDimensionValues(k);
      /* Kept when it is still reachable, cleared when it is not. Clearing unconditionally would
         throw away a valid choice every time somebody re-picked the same company. */
      if (STATE[k] !== 'ALL' && still.indexOf(STATE[k]) < 0) STATE[k] = 'ALL';
    }
  }

  /** Read-only context in the shape of a filter, so the row's rhythm survives. */
  function contextField(id, label, value, why) {
    var g = el('div', 'filter-group cmd-field cmd-field--context');
    var lab = el('span', 'fl-label', label);
    g.appendChild(lab);
    var v = el('span', 'cmd-context-value', value);
    v.id = id + 'Context';
    v.setAttribute('data-context-for', id);
    if (why) v.setAttribute('title', label + ': ' + value + ' — ' + why);
    g.appendChild(v);
    return g;
  }

  /** Category keeps its two shapes (chips / searchable menu) but loses its card and its heading. */
  function categoryField(cats, countBySite, opts) {
    var g = el('div', 'filter-group cmd-field cmd-field--category');
    var lab = el('span', 'fl-label', 'Category');
    g.appendChild(lab);
    g.appendChild(renderCategoryControl(cats, countBySite, opts,
      { provenance: false, shape: 'menu' }));
    return g;
  }

  function seriesField() {
    var pool = STATE.category ? buildModel(STATE.category) : null;
    var serValues = pool
      ? pool.seriesOptions.options.map(function (o) { return o.value; })
      : MODEL.seriesOptions.options.map(function (o) { return o.value; });
    if (STATE.category !== null && serValues.length === 1) {
      return contextField('fSeries', 'Series', serValues[0], 'the only series in this category');
    }
    var g = selectEl('fSeries', 'Series', ['ALL'].concat(serValues), STATE.series,
      function (v) { STATE.series = v; render(); }, STATE.category === null);
    g.className = 'filter-group cmd-field';
    return g;
  }

  /**
   * §2 — THE SUMMARY, AND IT SHOWS VALUES RATHER THAN EXPLAINING ITSELF.
   *
   *     US  ·  Amazon  ·  Electric Can Opener  ·  All series  ·  USD
   *
   * No "Company:" prefixes and no internal keys: `KM|US|Amazon` is the site KEY and it belongs in the
   * `?` popover with the rest of the mapping, not on a line a person reads twenty times an hour.
   * Company appears ONLY when it is a real choice — with one company in scope it is not information,
   * it is a word taking up the line every time.
   *
   * §6 — CURRENCY LIVES HERE. On a complete site it is derived, not chosen: P1-B3 proved the read
   * refuses to pool currencies, so a single site has exactly one and a dropdown offering it is a
   * decision that has already been made. It becomes a real control in More filters only when the
   * scope is an aggregate and there is genuinely more than one.
   */
  function scopeSummaryRow(site) {
    var row = el('div', 'cmdbar-row cmdbar-context');
    row.id = 'scopeSummaryRow';
    var sum = el('div', 'cmd-summary');
    sum.id = 'scopeSummary';
    sum.setAttribute('role', 'status');
    sum.setAttribute('aria-live', 'polite');

    var parts = [];
    if (scopeDimensionValues('company').length > 1) {
      parts.push({ k: 'company', t: STATE.company === 'ALL' ? 'All companies' : STATE.company });
    }
    parts.push({ k: 'country', t: STATE.country === 'ALL' ? 'All countries' : STATE.country });
    parts.push({ k: 'marketplace',
      t: STATE.marketplace === 'ALL' ? 'All marketplaces' : STATE.marketplace });
    parts.push({ k: 'category', t: STATE.category === null ? 'No category selected' : STATE.category });
    parts.push({ k: 'series', t: STATE.series === 'ALL' ? 'All series' : STATE.series });
    var curs = SEL.deriveDimensionValues(MODEL.universe, 'currency');
    parts.push({ k: 'currency',
      t: STATE.currency !== 'ALL' ? STATE.currency
        : (curs.length === 1 ? curs[0] : (curs.length === 0 ? 'No currency' : curs.length + ' currencies')) });

    parts.forEach(function (p, i) {
      if (i > 0) sum.appendChild(el('span', 'cmd-sep', '·'));
      var c = el('span', 'cmd-sum-part', p.t);
      c.setAttribute('data-part', p.k);
      sum.appendChild(c);
    });
    row.appendChild(sum);
    row.appendChild(scenarioStatusChip());

    /* THE COUNT IS CONTEXT, NOT A HEADLINE. Two numbers, because "listings" and "listings that can
       be plotted" are different and the gap between them is the Data Quality story. */
    /* #siteState KEEPS ITS ID AND ITS data-site-state. This is the same line it always was — the
       site's own state, in words — and it is the thing eleven assertions and the site-identity
       contract identify by name. Renaming it because the container changed would retire those
       checks silently, which is the one kind of change this project treats as a defect. */
    var n = el('span', 'cmd-counts' + (site.complete ? '' : ' cmd-counts--agg'), site.complete
      ? MODEL.universe.counts.eligible + ' listings · '
        + MODEL.universe.counts.chartable + ' with a price to plot'
      : 'Aggregate across ' + site.aggregate_dimensions.join(' and ')
        + ' · prices are never pooled across currencies');
    n.id = 'siteState';
    n.setAttribute('data-site-state', site.state);
    row.appendChild(n);

    /* §2 — THE FULL MAPPING GOES IN THE `?`, and nowhere near the line above. */
    var help = infoIcon('scope', 'Scope, eligibility and mapping', [
      'A site is company + country + marketplace, all three. Membership comes from the marketplace'
        + ' listing table — never from the product master, and never from a price that happens to be'
        + ' in your currency. This scope resolves to the site key ' + site.key + '.',
      'Category and Series narrow INSIDE the site and cannot widen it. The category list is this'
        + ' site’s own, derived from the listings that survived membership and the status gate.'
        + ' Trim is the only normalisation: two spellings differing by case are kept apart and'
        + ' reported, because merging two business categories is a decision an operator owns.'
        /* F10 CAUGHT THIS GOING MISSING. Merging the site and category help icons dropped the
           blank-category rule out of the text, and the assertion that demanded it is the reason
           that was visible rather than discovered later by a reader who could not find it. */
        + ' A listing whose category cell is empty keeps its product, shows as “'
        + SEL.UNMAPPED_LABEL + '”, and is never renamed “Other” — because'
        + ' “Other” is a value an operator could then look for in the sheet and not find.'
        + ' There is no allowlist and no maximum: the number of categories is whatever the data has.',
      'A listing needs a price, a currency and a confirmed Regional Detail before it can be plotted.'
        + ' One without a Regional Detail is not confirmed as sold on this site at all, so it stays'
        + ' off the price axis and appears in Data Quality instead.',
      'Sources: marketplace_skus for membership, sku_details.category and .series for the taxonomy,'
        + ' pricing_list.currency for the currency. Preview data — the countries, marketplaces,'
        + ' categories and series here are a demonstration fixture, not the live universe.'
    ]);
    help.id = 'scopeHelp';
    row.appendChild(help);
    return row;
  }

  /**
   * §3 — MORE FILTERS. A POPOVER, AND THE NAME A PERSON CAN READ.
   *
   * "Advanced filters" is developer vocabulary for "the ones we put away", and §3.9 is right to
   * refuse it: nothing behind this button is expert analysis, it is a threshold and a checkbox.
   *
   * THE COUNT IS ON THE BUTTON because a filter you cannot see is a filter you forget you set — the
   * same argument as the Layers count in P1-B2C. `More filters · 1` means one non-default
   * condition is active; no suffix means none is.
   */
  /** How many listings on screen currently carry a simulated price. PURE over MODEL. */
  function simulatedListingCount() {
    var rows = (MODEL && MODEL.rows) || [];
    var n = 0;
    rows.forEach(function (r) { if (r && r._scenario && r._scenario.active) n++; });
    return n;
  }

  function moreFiltersCount() {
    var n = 0;
    if (STATE.thresholdC !== DEFAULT_THRESHOLD_C) n++;
    if (STATE.includeInactive) n++;
    if (STATE.currency !== 'ALL') n++;
    return n;
  }

  function moreFiltersControl() {
    var wrap = el('div', 'kmf cmd-more');
    wrap.id = 'moreFilters';
    var n = moreFiltersCount();
    var btn = el('button', 'kmf-trigger cmd-trigger' + (n ? ' is-set' : ''));
    btn.id = 'moreFiltersToggle';
    btn.setAttribute('type', 'button');
    btn.setAttribute('aria-expanded', STATE.moreFiltersOpen ? 'true' : 'false');
    btn.setAttribute('aria-controls', 'moreFiltersPanel');
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('data-active-count', String(n));
    var lab = el('span', 'kmf-trigger__label', 'More filters');
    btn.appendChild(lab);
    if (n) {
      var cnt = el('span', 'km-tab-rail__count cmd-count', String(n));
      cnt.id = 'moreFiltersCount';
      btn.appendChild(cnt);
    }
    btn.appendChild(el('span', 'kmf-trigger__icon', STATE.moreFiltersOpen ? '▴' : '▾'));
    btn.addEventListener('click', function (ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      STATE.moreFiltersOpen = !STATE.moreFiltersOpen;
      /* One popover at a time, the same rule the `?` icons already follow. */
      STATE.openPopover = null;
      STATE.catMenuOpen = false;
      render();
    });
    btn.addEventListener('keydown', function (ev) {
      if (ev && ev.key === 'Escape' && STATE.moreFiltersOpen) {
        STATE.moreFiltersOpen = false;
        render();
      }
    });
    wrap.appendChild(btn);
    if (STATE.moreFiltersOpen) wrap.appendChild(moreFiltersPanel());
    return wrap;
  }

  function moreFiltersPanel() {
    var disabled = STATE.category === null;
    /* `.kmf-panel` is the Operation System's own popover chrome — absolute, its own shadow, a
       viewport clamp and a right-edge collision modifier. Using it means this panel cannot drift
       from every other dropdown in the app, and it means opening it moves NOTHING. */
    var panel = el('div', 'kmf-panel kmf-panel--right cmd-pop');
    panel.id = 'moreFiltersPanel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'More filters');
    /* The panel swallows clicks so the document handler does not read its own contents as "outside".
       §3.8 — THE RULE IS ONE SENTENCE: changing a value never closes this panel. Only Escape, a click
       outside, or the trigger again. A panel that closed on each change would make setting two
       conditions two round trips, and a panel that closed on some changes and not others is a rule
       nobody can learn. */
    panel.addEventListener('click', function (ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
    });

    var gthr = el('div', 'filter-group cmd-pop-field');
    var thrLab = el('label', 'fl-label', 'Price gap threshold');
    thrLab.setAttribute('for', 'fThreshold');
    gthr.appendChild(thrLab);
    var inp = document.createElement('input');
    inp.id = 'fThreshold';
    inp.setAttribute('type', 'text');
    inp.setAttribute('inputmode', 'decimal');
    inp.value = fromCents(STATE.thresholdC);
    inp.disabled = disabled;
    inp.addEventListener('change', function () {
      var c = cents(inp.value);
      if (c !== null && c > 0) STATE.thresholdC = c;
      render();
    });
    gthr.appendChild(inp);
    gthr.appendChild(el('p', 'cmd-pop-hint',
      'A gap wider than this is called out on the chart. Strictly greater than.'));
    panel.appendChild(gthr);

    var incl = el('div', 'filter-group filter-checkbox-item cmd-pop-field');
    var cbLab = el('label', 'chk');
    var cb = document.createElement('input');
    cb.id = 'fInactive';
    cb.setAttribute('type', 'checkbox');
    cb.checked = !!STATE.includeInactive;
    cb.addEventListener('change', function () {
      STATE.includeInactive = !!cb.checked;
      narrowAfterSiteChange();
      render();
    });
    cbLab.appendChild(cb);
    cbLab.appendChild(el('span', 'chk-text', 'Include inactive and discontinued listings'));
    incl.appendChild(cbLab);
    panel.appendChild(incl);

    /* §6 — CURRENCY APPEARS HERE ONLY WHEN IT IS A REAL CHOICE. On a single site it is derived and
       shown in the summary; an aggregate scope can hold more than one, and then pooling them would
       be adding dollars to yen, so the choice has to exist. */
    var curValues = SEL.deriveDimensionValues(MODEL.universe, 'currency');
    if (curValues.length > 1) {
      var gc = selectEl('fCurrency', 'Currency', ['ALL'].concat(curValues), STATE.currency,
        function (v) { STATE.currency = v; render(); }, false);
      gc.className = 'filter-group cmd-pop-field';
      panel.appendChild(gc);
    }

    var tools = el('div', 'kmf-tools cmd-pop-tools');
    var reset = el('button', 'kmf-link', 'Reset filters');
    reset.id = 'moreFiltersReset';
    reset.setAttribute('type', 'button');
    reset.disabled = moreFiltersCount() === 0;
    reset.addEventListener('click', function () {
      STATE.thresholdC = DEFAULT_THRESHOLD_C;
      STATE.includeInactive = false;
      STATE.currency = 'ALL';
      narrowAfterSiteChange();
      /* STAYS OPEN, by the same rule as any other value change — so the reader can see the row of
         controls go back to their defaults instead of watching the panel vanish. */
      render();
    });
    tools.appendChild(reset);
    panel.appendChild(tools);
    return panel;
  }

  /**
   * §5 — MEETING SCENARIO: A SECONDARY BUTTON, AND A STATUS CHIP WHEN IT IS LIVE.
   *
   * The scenario used to be a permanent block with a heading and a badge, open or closed, on every
   * screen. It is a deliberate act somebody comes to the page to perform — not a thing the page is
   * about — so it gets one button. When a scenario IS active that has to be impossible to miss and
   * still quiet: a tinted chip with the count of listings it reaches, not a red banner.
   */
  function meetingScenarioControl() {
    var wrap = el('div', 'cmd-scn');
    wrap.id = 'meetingScenario';
    var active = MODEL.scenario.active;
    /* .btn-quiet, NOT .btn-secondary — AND THE SHARED CLASS IS THE PROBLEM, NOT THE CHOICE.
       components.css's `.btn-secondary` is a SOLID GREEN FILLED button: background soft-green,
       white text, no border, and its own literal `padding: 0.8rem 1.5rem` / `border-radius: 8px`
       that override the `--btn-*` token contract `.btn` sets one line above it. So a class named
       'secondary' renders as a saturated primary and breaks the height every other control shares.
       Two green pills here is exactly the loud hierarchy S1.8 and S5 rule out. `.btn-quiet` is the
       real quiet secondary this page already uses for Undo, and the shared layer's missing one is
       recorded as a gap. */
    var btn = el('button', 'btn btn-quiet cmd-trigger'
      + (STATE.meetingOpen ? ' is-open' : '') + (active ? ' is-on' : ''));
    btn.id = 'meetingToggle';
    btn.setAttribute('type', 'button');
    btn.setAttribute('aria-expanded', STATE.meetingOpen ? 'true' : 'false');
    btn.setAttribute('aria-controls', 'scenarioDrawer');
    btn.appendChild(el('span', 'cmd-scn-label', 'Meeting scenario'));
    btn.addEventListener('click', function (ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      STATE.meetingOpen = !STATE.meetingOpen;
      /* renderData() ONLY — not render(). Opening the drawer must not rebuild the controls or the
         chart, and P1-B2B's contract is what makes that a guarantee rather than a hope. */
      render();
    });
    wrap.appendChild(btn);

    wrap.setAttribute('data-chip-id', 'scenarioChip');
    return wrap;
  }

  /** The scenario status chip, for the CONTEXT row. */
  function scenarioStatusChip() {
    var active = MODEL.scenario.active;
    var chip = el('span', 'cmd-chip' + (active ? ' cmd-chip--on' : ''), active
      ? SEL.SCENARIO_UNSAVED_LABEL
      : 'No scenario');
    chip.id = 'scenarioChip';
    chip.setAttribute('data-active', String(active));
    chip.setAttribute('role', 'status');
    if (active) {
      var listings = simulatedListingCount();
      var c = el('span', 'km-tab-rail__count cmd-count', String(listings));
      c.id = 'scenarioChipCount';
      c.setAttribute('data-listings', String(listings));
      c.setAttribute('title', listings + ' listing' + (listings === 1 ? '' : 's')
        + ' on this chart show a simulated price');
      chip.appendChild(c);
    }
    return chip;
  }

  /**
   * §5 — THE DRAWER, AND WHY IT IS BUILT HERE RATHER THAN REUSED.
   *
   * §5 asks for the Operation System's drawer component if one exists. IT DOES NOT. Three pages
   * define their own — `.glm-drawer` (global logistics map), `.oow-drawer` (overseas ops) and one in
   * sku-regional-details — every one of them page-prefixed and page-local. There is no shared drawer
   * in components.css, and no `--drawer-*` token. So this is a fourth local drawer, and that is
   * recorded as a real gap rather than presented as reuse: the thing to add to the shared layer
   * before a fifth page needs one.
   *
   * What IS reused is everything that exists: the `--filter-*` and `--btn-*` token contract, `.btn`
   * / `.btn-secondary` for the buttons, `.kmf-panel` chrome for the popover, and
   * `.km-tab-rail__count` for the counts.
   *
   * POSITION:FIXED, AND THAT IS THE WHOLE GEOMETRY ARGUMENT. The drawer is taken out of flow, so the
   * chart's container never changes width and the layout engine is never re-measured — opening it
   * cannot move a price. The old inline panel was IN the flow, which is why every open and close
   * pushed the chart down and back.
   */
  function renderScenarioDrawer(host) {
    var d = el('aside', 'scn-drawer' + (STATE.meetingOpen ? ' is-open' : ''));
    d.id = 'scenarioDrawer';
    d.setAttribute('aria-label', 'Meeting scenario');
    d.setAttribute('data-open', String(STATE.meetingOpen));
    if (!STATE.meetingOpen) d.hidden = true;

    var head = el('div', 'scn-drawer-head');
    head.appendChild(el('h2', 'scn-drawer-title', 'Meeting scenario'));
    var close = el('button', 'scn-drawer-close', '×');
    close.id = 'scenarioDrawerClose';
    close.setAttribute('type', 'button');
    close.setAttribute('aria-label', 'Close meeting scenario');
    close.addEventListener('click', function (ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      /* CLOSING IS NOT CLEARING (§5). The overrides stay exactly where they are, the chart keeps
         showing them, and the command bar keeps its chip — because a person who closes a panel is
         putting it away, not undoing their work. Only Reset clears, and only a reload forgets. */
      STATE.meetingOpen = false;
      render();
    });
    head.appendChild(close);
    d.appendChild(head);

    var body = el('div', 'scn-drawer-body');
    body.id = 'scenarioDrawerBody';
    d.appendChild(body);
    host.appendChild(d);
    /* The form is the SAME form, in its documented order: site context, series, price to simulate,
       adjustment, amount, Apply, Undo/Reset, and the unsaved explanation. Re-housing it keeps every
       refusal code and every status line that P1-B2/B2A proved. */
    renderScenarioPanel(body);
  }

  /**
   * §6 — THE DEVELOPER STRIP, AND IT ONLY EXISTS IN DEVELOPER MODE.
   *
   * Fixture switching, raw identity and self-test detail are developer-only information, and §6 says
   * they may not sit in the normal operating flow. So they are not merely collapsed — in a normal
   * load this function is never called, the hook is never defined, and there is nothing to discover.
   */
  function devStrip() {
    var strip = el('div', 'dev-strip');
    strip.id = 'devStrip';
    strip.setAttribute('role', 'note');
    strip.appendChild(el('span', 'dev-strip-tag', 'DEVELOPER MODE'));
    strip.appendChild(el('span', 'dev-strip-text',
      'Fixture switching is enabled on this load. ' + (STATE.stress
        ? 'Showing the GENERATED STRESS FIXTURE — 44 invented products, not data from anywhere.'
        : 'Showing the preview fixture.')));
    var b = el('button', 'btn btn-quiet dev-strip-btn',
      STATE.stress ? 'Back to preview fixture' : 'Load generated stress fixture');
    b.id = 'devStressToggle';
    b.setAttribute('type', 'button');
    b.addEventListener('click', function () { applyFixtureChoice(!STATE.stress); });
    strip.appendChild(b);
    return strip;
  }

  /**
   * THE CATEGORY CONTROL, AND WHY IT HAS TWO SHAPES.
   *
   * Chips are the right control for a handful of categories: every option is visible, one click, no
   * menu to open. They are the wrong control for forty — a wall of chips is not a menu, it is a
   * paragraph you have to read, and it pushes the chart below the fold, which is exactly the density
   * complaint this round exists to answer.
   *
   * So above a threshold the same list becomes a searchable popover with the busiest categories kept
   * out front. The COUNT stays on every option in both shapes, because a category's size is part of
   * choosing it.
   */
  var CATEGORY_CHIP_LIMIT = 6;
  function renderCategoryControl(cats, countBySite, opts, view) {
    /* `view.provenance === false` omits the counts paragraph. It is not dropped information: the
       same facts (how many categories, how many blank, how many needing review) are in the scope
       `?` popover, which §2 makes the home of the full mapping. In a command bar this paragraph was
       the tallest element in the row. */
    view = view || {};
    /* THE SHAPE IS THE CALLER'S, because the right control depends on the container and not only on
       the number of options. A card can host chips; a fixed-height command bar cannot host a control
       whose width grows with the category count. Unset keeps the original count-based rule. */
    var shape = view.shape === 'menu' || view.shape === 'chips' ? view.shape
      : (cats.length > CATEGORY_CHIP_LIMIT ? 'menu' : 'chips');
    var wrap = el('div', 'catctl');
    wrap.id = 'categoryControl';
    wrap.setAttribute('data-shape', shape);
    wrap.setAttribute('data-count', String(cats.length));

    function chip(value, label, on, onClick) {
      var b = el('button', 'catbtn' + (on ? ' is-on' : ''), label);
      b.setAttribute('type', 'button');
      b.id = 'cat-' + String(value).replace(/\s+/g, '-');
      b.setAttribute('data-category', value);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.addEventListener('click', onClick);
      return b;
    }
    var bar = el('div', 'catbar');
    bar.id = 'catBar';
    function selectAll() {
      STATE.category = null;
      STATE.view = 'overview';
      STATE.catMenuOpen = false;
      render();
    }
    /* IN MENU SHAPE THERE IS NO STANDING "All categories" CHIP. It is the first row of the menu
       instead, which is where a select puts it — a chip beside the trigger would be a second control
       for the same dimension, and 110px of bar for a choice that is already in the list. */
    if (shape === 'chips') {
      bar.appendChild(chip('ALL', 'All categories', STATE.category === null, selectAll));
    }

    /* THE BUSIEST FIRST when the list is long — "common + More", not an arbitrary alphabetical five. */
    var ordered = cats.slice();
    if (shape === 'menu') {
      ordered.sort(function (a, b) {
        var d = (countBySite[b] || 0) - (countBySite[a] || 0);
        return d !== 0 ? d : (a < b ? -1 : 1);
      });
    }
    /* Menu shape shows NO chips: every category, including the busiest, is in the one menu. */
    var shown = shape === 'menu' ? [] : ordered;
    shown.forEach(function (c) {
      bar.appendChild(chip(c, c + ' (' + countBySite[c] + ')', STATE.category === c, function () {
        STATE.category = c;
        STATE.catMenuOpen = false;
        if (STATE.view === 'overview') STATE.view = 'category';
        render();
      }));
    });

    if (shape === 'menu') {
      var rest = ordered.slice(0);
      /* THE TRIGGER READS LIKE A FILTER, so it names the current value rather than the menu. "More
         (8)" is right when five chips are already showing and this is the overflow; as the ONLY
         control for the dimension it has to say what is selected, the way a select does. */
      var more = el('button', 'catbtn is-more' + (STATE.category !== null ? ' is-on' : ''),
        (STATE.category !== null
          ? STATE.category + ' (' + countBySite[STATE.category] + ')'
          : 'All categories (' + rest.length + ')'));
      more.id = 'catMore';
      more.setAttribute('type', 'button');
      more.setAttribute('aria-expanded', STATE.catMenuOpen ? 'true' : 'false');
      more.setAttribute('aria-controls', 'catMenu');
      more.addEventListener('click', function (ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        STATE.catMenuOpen = !STATE.catMenuOpen;
        render();
      });
      bar.appendChild(more);

      if (STATE.catMenuOpen) {
        var menu = el('div', 'catmenu');
        menu.id = 'catMenu';
        menu.setAttribute('role', 'listbox');
        var sb = document.createElement('input');
        sb.id = 'catSearch';
        sb.setAttribute('type', 'text');
        sb.setAttribute('placeholder', 'Search categories…');
        sb.setAttribute('aria-label', 'Search categories');
        sb.value = STATE.catSearch;
        sb.addEventListener('input', function () { STATE.catSearch = sb.value; render(); });
        menu.appendChild(sb);
        var q = String(STATE.catSearch || '').toLowerCase();
        var hits = ordered.filter(function (c) {
          return q === '' || c.toLowerCase().indexOf(q) >= 0;
        });
        var list = el('div', 'catmenu-list');
        /* The reset row, first, and only in menu shape — in chip shape the standing chip is the
           reset and two of them would be two controls for one choice. */
        if (shape === 'menu' && q === '') {
          var allRow = el('button', 'catmenu-item catmenu-item--all'
            + (STATE.category === null ? ' is-on' : ''), 'All categories');
          allRow.setAttribute('type', 'button');
          allRow.setAttribute('role', 'option');
          allRow.setAttribute('data-category', 'ALL');
          allRow.setAttribute('aria-selected', STATE.category === null ? 'true' : 'false');
          allRow.addEventListener('click', selectAll);
          list.appendChild(allRow);
        }
        if (!hits.length) {
          list.appendChild(el('p', 'catmenu-empty', 'No category on this site matches “'
            + STATE.catSearch + '”.'));
        }
        hits.forEach(function (c) {
          var o = el('button', 'catmenu-item' + (STATE.category === c ? ' is-on' : ''),
            c + '  (' + countBySite[c] + ')');
          o.setAttribute('type', 'button');
          o.setAttribute('role', 'option');
          o.setAttribute('data-category', c);
          o.setAttribute('aria-selected', STATE.category === c ? 'true' : 'false');
          o.addEventListener('click', function () {
            STATE.category = c;
            STATE.catMenuOpen = false;
            if (STATE.view === 'overview') STATE.view = 'category';
            render();
          });
          list.appendChild(o);
        });
        menu.appendChild(list);
        bar.appendChild(menu);
      }
    }

    /* A TRUE EMPTY STATE. Not three demonstration values, not a placeholder — the sentence a site
       with no eligible listings has actually earned. */
    if (cats.length === 0) {
      var none = el('p', 'scope-empty',
        'This site sells nothing that passed membership and the status gate, so there is no category'
          + ' menu to show. That is an answer about the site, not a failure to load.');
      none.id = 'catEmpty';
      bar.appendChild(none);
    }
    wrap.appendChild(bar);

    /* THE PROVENANCE LINE — one line, and the detail is behind the `?` above. */
    var prov = el('p', 'scope-state');
    prov.id = 'catProvenance';
    prov.setAttribute('data-count', String(cats.length));
    prov.appendChild(document.createTextNode(cats.length + ' categor'
      + (cats.length === 1 ? 'y' : 'ies') + ' on this site'
      + (opts.blank_count ? '  ·  ' + opts.blank_count + ' listing'
        + (opts.blank_count === 1 ? '' : 's') + ' with no category' : '')
      + (opts.normalization_review.length ? '  ·  ' + opts.normalization_review.length
        + ' needing review' : '')));
    if (view.provenance !== false) wrap.appendChild(prov);
    return wrap;
  }

  /* ================================================================================================
     MEETING MODE — one Series, on this site, right now.

     REDESIGNED IN P1-B2A AROUND WHAT A PERSON IS ACTUALLY DOING. The first version exposed the data
     model: a field called `proposed_scenario_price`, a mode called `PERCENT`, a Series box defaulting
     to `All`. Those are precise names and they belong in the override object; nobody in a meeting
     should have to read one, and `All` by default is worse than imprecise — it is a change whose reach
     you cannot see.

     So: the site is READ-ONLY CONTEXT (it is chosen upstairs, in the scope ladder, and a scenario
     never gets to disagree with it), the Series must be chosen, the field and the adjustment are
     sentences, and nothing applies until a validator that reports in those same sentences says it may.
     ================================================================================================ */
  function renderScenarioPanel(host) {
    var site = siteIdentity();
    var box = el('div', 'scenario' + (MODEL.scenario.active ? ' is-on' : ''));
    box.id = 'scenarioPanel';
    box.setAttribute('data-permitted', String(MODEL.scenario.permitted));
    box.setAttribute('data-active', String(MODEL.scenario.active));

    var head = el('div', 'scenario-head');
    var toggle = el('button', 'scenario-toggle',
      (STATE.meetingOpen ? '\u2212' : '+') + '  Price scenario — meeting mode');
    toggle.id = 'meetingToggle';
    toggle.setAttribute('type', 'button');
    toggle.setAttribute('aria-expanded', STATE.meetingOpen ? 'true' : 'false');
    toggle.setAttribute('aria-controls', 'scenarioBody');
    toggle.addEventListener('click', function () {
      STATE.meetingOpen = !STATE.meetingOpen;
      render();
    });
    head.appendChild(toggle);
    var badge = el('span', 'scenario-badge', MODEL.scenario.active
      ? SEL.SCENARIO_UNSAVED_LABEL : 'No scenario');
    badge.id = 'scenarioBadge';
    head.appendChild(badge);
    head.appendChild(infoIcon('scenario', 'Price scenario', [
      'A scenario changes what this page draws, for as long as this page is open. It is held in the'
        + ' page’s memory and nowhere else.',
      'It is never written to the database, a spreadsheet, an export, a saved view or browser storage,'
        + ' and no Save or Submit path can reach it. Reloading restores every source value.',
      'The contract name for that is ' + SEL.SCENARIO_STORAGE + ', and survives_reload is '
        + String(SEL.SCENARIO_SURVIVES_RELOAD) + ' — both published by the pipeline so a reader can'
        + ' check them rather than trust this sentence.',
      'Anything simulated is labelled on screen and on paper: the banner carries an UNSAVED SCENARIO'
        + ' mark whenever one is active, and the printed page keeps it.'
    ]));
    box.appendChild(head);

    /* THE BADGE AND THE BANNER MARK STAY OUTSIDE THE COLLAPSE. A scenario that is active while its
       panel is shut must still be visible as active — hiding the control is a density choice, hiding
       the STATE would be a lie. */
    var body = el('div', 'scenario-body');
    body.id = 'scenarioBody';
    body.hidden = !STATE.meetingOpen;
    box.appendChild(body);

    if (!MODEL.scenario.permitted) {
      var r = el('p', 'scenario-refusal', 'Choose one company, one country and one marketplace to'
        + ' open meeting mode. A simulated price belongs to a site, because the currency does.');
      r.id = 'scenarioRefusal';
      body.appendChild(r);
      host.appendChild(box);
      return;
    }

    /* ---- 1. THE SITE, AS CONTEXT AND NOT AS A CONTROL ---- */
    var currencies = SEL.deriveDimensionValues(MODEL.universe, 'currency');
    var ctx = el('div', 'scenario-ctx');
    ctx.id = 'scenarioContext';
    [['Company', site.company], ['Country', site.country], ['Marketplace', site.marketplace],
      ['Currency', currencies.length === 1 ? currencies[0] : currencies.join(' / ') || '—']
    ].forEach(function (pair) {
      var c = el('span', 'ctx-item');
      c.setAttribute('data-ctx', pair[0].toLowerCase());
      c.appendChild(el('span', 'ctx-k', pair[0]));
      c.appendChild(el('span', 'ctx-v', pair[1]));
      ctx.appendChild(c);
    });
    body.appendChild(ctx);

    /* ---- 2..5. THE FORM ---- */
    var choices = seriesChoiceValues();
    var adjustments = SEL.scenarioAdjustmentsFor(STATE.scenarioField);
    if (!adjustments.filter(function (a) { return a.id === STATE.scenarioAdjustment; }).length) {
      STATE.scenarioAdjustment = adjustments.length ? adjustments[0].id : '';
    }
    var adj = SEL.scenarioAdjustment(STATE.scenarioAdjustment);

    /* THE ROW IS A FIXED GRID, and the grid is why switching the price field cannot shove the
       chart. Proposed and Everyday offer different adjustments, so the OPTIONS inside the third
       control change — but the control keeps its column, its width and its height, and no row is
       ever added or removed. A form that changes shape while you read it is a form that moves the
       thing you were reading. */
    var row = el('div', 'scenario-row scenario-grid');
    row.id = 'scenarioRow';
    /* ---- EVERY DROPDOWN UPDATES THE FORM IN PLACE, AND NOTHING ELSE ----
       These used to call render(). See the note on renderData: a change of dropdown is not a change
       of data, and rebuilding the page around a control the person is still holding is what threw
       the viewport. */
    row.appendChild(selectEl('scSeries', 'Series',
      choices, STATE.scenarioSeries,
      function (v) {
        STATE.scenarioSeries = v; STATE.scenarioRefusal = null; updateScenarioForm();
      },
      false, 'Choose a Series…'));
    row.appendChild(selectEl('scField', 'Price to simulate',
      SEL.SCENARIO_FIELD_CHOICES.map(function (c) { return c.id; }), STATE.scenarioField,
      function (v) {
        STATE.scenarioField = v;
        var allowed = SEL.scenarioAdjustmentsFor(v);
        /* THE OLD CHOICE SURVIVES IF THE NEW FIELD STILL ALLOWS IT; otherwise the first legal one
           is taken. Everyday price does not offer "Set" at all — the flattening combination cannot
           be expressed — so moving Proposed/Set to Everyday lands on a percentage, silently and
           without the viewport moving a pixel. */
        if (!allowed.filter(function (a) { return a.id === STATE.scenarioAdjustment; }).length) {
          STATE.scenarioAdjustment = allowed.length ? allowed[0].id : '';
        }
        STATE.scenarioRefusal = null;
        updateScenarioForm();
      }, false, null, function (id) { return SEL.scenarioFieldLabel(id); }));
    row.appendChild(selectEl('scAdjust', 'Adjustment',
      adjustments.map(function (a) { return a.id; }), STATE.scenarioAdjustment,
      function (v) {
        STATE.scenarioAdjustment = v; STATE.scenarioRefusal = null; updateScenarioForm();
      },
      false, null, function (id) {
        var a = SEL.scenarioAdjustment(id);
        return a ? a.label : id;
      }));

    var fl = el('div', 'fl');
    var lbl = el('label', 'fl-label', adj ? (adj.unit === 'percent' ? 'Percentage'
      : (adj.unit === 'amount' ? 'Amount' : 'Price')) : 'Value');
    lbl.id = 'scValueLabel';
    lbl.setAttribute('for', 'scValue');
    fl.appendChild(lbl);
    var input = document.createElement('input');
    input.id = 'scValue';
    input.setAttribute('type', 'text');
    input.setAttribute('inputmode', 'decimal');
    input.setAttribute('placeholder', adj ? adj.placeholder : '');
    input.setAttribute('aria-label', (adj ? adj.label : 'Value') + '. ' + (adj ? adj.help : ''));
    input.value = STATE.scenarioInput;
    input.addEventListener('change', function () {
      STATE.scenarioInput = input.value;
      STATE.scenarioRefusal = null;
      updateScenarioReady();
    });
    input.addEventListener('input', function () {
      STATE.scenarioInput = input.value;
      updateScenarioReady();
    });
    fl.appendChild(input);
    row.appendChild(fl);

    var apply = el('button', 'btn btn-apply', 'Apply to chart');
    apply.id = 'scApply';
    apply.setAttribute('type', 'button');
    apply.addEventListener('click', function () {
      var v = byId('scValue');
      if (v) STATE.scenarioInput = v.value;
      var check = SEL.scenarioValidate({ site: site, series: STATE.scenarioSeries,
        field: STATE.scenarioField, adjustment: STATE.scenarioAdjustment,
        value: STATE.scenarioInput });
      if (!check.ok) {
        STATE.scenarioRefusal = check;
        STATE.scenarioNotice = null;
        /* A REFUSAL IS A SENTENCE, NOT A REDRAW. Nothing was applied, so nothing on the chart
           changed; writing the message into the reserved status row leaves every other pixel and
           the scroll position exactly where they were. */
        updateScenarioForm();
        return;
      }
      var affected = SEL.scenarioAffected(MODEL.rows, STATE.scenarioSeries);
      /* UNDO IS A STACK OF PREVIOUS OBJECTS, pushed BEFORE the change. The overrides are immutable
         values, so remembering one costs a reference and undoing is an assignment. */
      STATE.undoStack.push(SEL.cloneScenarioOverrides(STATE.overrides));
      STATE.overrides = SEL.setScenarioOverride(STATE.overrides, {
        site: site, series: STATE.scenarioSeries, field: STATE.scenarioField,
        mode: check.mode, value: STATE.scenarioInput });
      STATE.scenarioRefusal = null;
      STATE.scenarioNotice = {
        series: STATE.scenarioSeries,
        field: SEL.scenarioFieldLabel(STATE.scenarioField),
        adjustment: adj ? adj.label : '',
        value: STATE.scenarioInput,
        skus: affected.skus
      };
      /* APPLY REALLY DOES CHANGE THE DATA, so the chart, the comparison and the findings are drawn
         again — and still no control is rebuilt and the anchor does not move. */
      renderData();
    });
    row.appendChild(apply);
    body.appendChild(row);

    /* ---- TWO PERMANENT LINES, REWRITTEN IN PLACE -------------------------------------------------
       The reach line and the status line used to be created and destroyed as the state changed, and
       every appearance and disappearance changed the panel's height — which pushed the chart, the
       comparison table and everything the reader was looking at. They are elements that always
       exist now, with a reserved minimum height in the stylesheet, and their TEXT is what changes.
       An empty status row costs one line of space; a status row that shoves the page costs the
       reader their place. */
    var reach = el('p', 'scenario-reach');
    reach.id = 'scenarioReach';
    body.appendChild(reach);

    var status = el('div', 'scenario-status');
    status.id = 'scenarioStatus';
    status.setAttribute('data-state', 'idle');
    body.appendChild(status);

    /* ---- UNDO AND THE THREE RESETS ---- */
    var resets = el('div', 'scenario-resets');
    var undo = el('button', 'btn btn-quiet', 'Undo last change');
    undo.id = 'scUndo';
    undo.setAttribute('type', 'button');
    undo.disabled = STATE.undoStack.length === 0;
    undo.addEventListener('click', function () {
      if (!STATE.undoStack.length) return;
      STATE.overrides = STATE.undoStack.pop();
      STATE.scenarioNotice = null;
      STATE.scenarioRefusal = null;
      renderData();
    });
    resets.appendChild(undo);
    [['scResetSeries', 'Reset this Series', function () {
      STATE.undoStack.push(SEL.cloneScenarioOverrides(STATE.overrides));
      STATE.overrides = SEL.resetScenarioOverrides(STATE.overrides,
        { scope: 'series', site: site, series: STATE.scenarioSeries });
    }], ['scResetSite', 'Reset current site', function () {
      STATE.undoStack.push(SEL.cloneScenarioOverrides(STATE.overrides));
      STATE.overrides = SEL.resetScenarioOverrides(STATE.overrides, { scope: 'site', site: site });
    }], ['scResetAll', 'Reset all scenarios', function () {
      STATE.undoStack.push(SEL.cloneScenarioOverrides(STATE.overrides));
      STATE.overrides = SEL.resetScenarioOverrides(STATE.overrides, { scope: 'all' });
    }]].forEach(function (spec) {
      var b = el('button', 'btn btn-quiet', spec[1]);
      b.id = spec[0];
      b.setAttribute('type', 'button');
      b.addEventListener('click', function () {
        spec[2]();
        STATE.scenarioNotice = null;
        STATE.scenarioRefusal = null;
        renderData();
      });
      resets.appendChild(b);
    });
    body.appendChild(resets);

    var note = el('p', 'scenario-note');
    note.id = 'scenarioNote';
    /* IN WORDS ON THE SURFACE, IN THE TOKEN BEHIND THE `?`. `IN_MEMORY_ONLY` is exact and it is
       an identifier; the sentence says the same thing to somebody who has not read the contract. */
    note.appendChild(document.createTextNode('Active overrides: '
      + MODEL.scenario.override_count
      + (MODEL.architecture.scenario_nodes.length
        ? ' · simulated on screen: ' + MODEL.architecture.scenario_nodes.join(' · ') : '')
      + ' · held in this page only, and cleared by a reload.'));
    body.appendChild(note);
    host.appendChild(box);
    /* THE READOUTS ARE WRITTEN BY THE SAME CODE THAT LATER UPDATES THEM. One path, so a freshly
       built panel and a panel that has been used for ten minutes cannot say different things. */
    updateScenarioForm();
  }

  /* ================================================================================================
     THE IN-PLACE UPDATE. Nothing below replaces a node the reader can be holding.

     `fillOptions` rewrites the `<option>` children of a `<select>` and leaves the `<select>` itself
     alone — so the element keeps its identity, its focus and its position, and a native dropdown
     that has just closed is still the same element the browser was tracking. It also does nothing
     at all when the option list is unchanged, which is the common case: changing the Series does
     not change which adjustments exist.
     ================================================================================================ */
  function setText(node, text) {
    if (!node) return;
    clear(node);
    node.appendChild(document.createTextNode(String(text)));
  }
  function sameOptions(sel, values) {
    if (!sel || sel.childNodes.length !== values.length) return false;
    for (var i = 0; i < values.length; i++) {
      if (sel.childNodes[i].getAttribute('value') !== values[i]) return false;
    }
    return true;
  }
  function fillOptions(sel, values, labelFn, placeholder) {
    if (!sel || sameOptions(sel, values)) return false;
    var keep = sel.value;
    clear(sel);
    values.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v;
      o.setAttribute('value', v);
      o.appendChild(document.createTextNode(
        v === '' ? (placeholder || '') : (labelFn ? labelFn(v) : v)));
      sel.appendChild(o);
    });
    sel.value = values.indexOf(keep) >= 0 ? keep : (values.length ? values[0] : '');
    return true;
  }

  /** Just the Apply button's readiness — cheap enough to run on every keystroke. */
  function updateScenarioReady() {
    var apply = byId('scApply');
    if (!apply) return;
    /* THE BUTTON STAYS CLICKABLE ON PURPOSE. A disabled Apply would hide the refusal, and the
       refusal is the only thing that says WHY — "choose a Series first" is more use than a control
       that does nothing and explains nothing. Readiness is published as state instead, so the
       styling can go quiet without the explanation going away. */
    var ready = !!STATE.scenarioSeries && String(STATE.scenarioInput || '').trim() !== '';
    apply.setAttribute('data-ready', String(ready));
    apply.setAttribute('aria-disabled', String(!ready));
  }

  /**
   * THE STATUS LINE IS ONE ELEMENT THAT NEVER LEAVES.
   *
   * Reserving its height in the stylesheet was half the answer. The other half is that nothing is
   * added to or removed from the document when the state changes: the same `<p>` is here on an
   * empty form, on a refusal and after an Apply, and what changes is its id, its class and its
   * words. A row that exists only sometimes is a row that pushes the page sometimes, whatever the
   * stylesheet reserves — and "sometimes" is precisely the shape of the defect this fixes.
   */
  function updateScenarioStatus() {
    var box = byId('scenarioStatus');
    if (!box) return;
    /* FOUND BY CLASS, NOT BY ID — because its id is one of the things that changes. Looking it
       up by the id it has when idle meant that after one refusal the lookup failed and a SECOND
       line was appended: the panel then carried a stale refusal and a fresh one at the same time,
       and `#scenarioModeRefusal` resolved to whichever came first. A node that renames itself
       cannot also be addressed by its name. */
    var line = box.querySelector('.scenario-status-line');
    if (!line) {
      line = el('p', 'scenario-status-line');
      line.id = 'scenarioStatusLine';
      box.appendChild(line);
    }
    var state = STATE.scenarioRefusal ? 'refused' : (STATE.scenarioNotice ? 'applied' : 'idle');
    if (state === 'refused') {
      line.className = 'scenario-status-line scenario-refusal';
      line.setAttribute('role', 'alert');
      line.setAttribute('data-code', STATE.scenarioRefusal.code);
      line.id = 'scenarioModeRefusal';
      setText(line, STATE.scenarioRefusal.message);
    } else if (state === 'applied') {
      line.className = 'scenario-status-line scenario-applied';
      line.setAttribute('role', 'status');
      line.setAttribute('data-code', '');
      line.id = 'scenarioApplied';
      setText(line, 'Applied: ' + STATE.scenarioNotice.field + ' · '
        + STATE.scenarioNotice.adjustment + ' ' + STATE.scenarioNotice.value + ' · '
        + STATE.scenarioNotice.series + ' · ' + STATE.scenarioNotice.skus + ' listing'
        + (STATE.scenarioNotice.skus === 1 ? '' : 's')
        + '. The original position stays on the chart as a hollow marker.');
    } else {
      line.className = 'scenario-status-line';
      line.setAttribute('role', 'status');
      line.setAttribute('data-code', '');
      line.id = 'scenarioStatusLine';
      setText(line, '');
    }
    box.setAttribute('data-state', state);
  }

  /**
   * THE SERIES MENU, IN ONE PLACE. There is no "All" option and there is no path that could add
   * one: the only entry that is not a series is the empty placeholder that reads "Choose a Series…".
   * Both the builder and the updater call this, so a change of site cannot leave the two disagreeing
   * about what is on offer.
   */
  function seriesChoiceValues() { return [''].concat(SEL.scenarioSeriesChoices(MODEL)); }

  /**
   * P1-B4 — THE CHIP IS STATE, AND IT LIVES OUTSIDE THE PANEL THAT KNOWS ABOUT IT.
   *
   * The scenario status chip is in the command bar's context row; Apply runs renderData(), which
   * deliberately rebuilds no control. So the chip has to be written IN PLACE, for exactly the reason
   * the badge below it is: a chart showing a simulated price beside a chip reading "No scenario" is
   * the worst defect that could be on the screen. P1-B2A found this same shape on the badge and the
   * fix is the same one — which is why it is worth naming rather than quietly repeating.
   *
   * It runs BEFORE the permitted check: a scope where a scenario is not permitted still needs its
   * chip to say so, and an early return would leave the last site's state on the screen.
   */
  function updateScenarioChip() {
    var chip = byId('scenarioChip');
    if (!chip || !MODEL || !MODEL.scenario) return;
    var active = MODEL.scenario.active === true;
    chip.className = 'cmd-chip' + (active ? ' cmd-chip--on' : '');
    chip.setAttribute('data-active', String(active));
    setText(chip, active ? SEL.SCENARIO_UNSAVED_LABEL : 'No scenario');
    if (!active) return;
    /* The count is appended rather than written into the text, so the label and the number stay two
       layers — the Operation System's own count-pill model, and the thing §9 of P1-B2C asked for. */
    var n = simulatedListingCount();
    var c = el('span', 'km-tab-rail__count cmd-count', String(n));
    c.id = 'scenarioChipCount';
    c.setAttribute('data-listings', String(n));
    c.setAttribute('title', n + ' listing' + (n === 1 ? '' : 's')
      + ' on this chart show a simulated price');
    chip.appendChild(c);
  }

  function updateScenarioForm() {
    updateScenarioChip();
    var panel = byId('scenarioPanel');
    if (!panel || !MODEL || !MODEL.scenario || !MODEL.scenario.permitted) return;

    /* THE BADGE IS STATE, NOT DECORATION. renderData() deliberately rebuilds no control, so the
       one thing on this panel that must never be stale has to be written here — a page showing a
       simulated price while its badge reads "No scenario" would be the worst defect on the screen. */
    panel.className = 'scenario' + (MODEL.scenario.active ? ' is-on' : '');
    panel.setAttribute('data-active', String(MODEL.scenario.active));
    setText(byId('scenarioBadge'),
      MODEL.scenario.active ? SEL.SCENARIO_UNSAVED_LABEL : 'No scenario');

    var seriesSel = byId('scSeries');
    if (seriesSel) {
      var choices = seriesChoiceValues();
      fillOptions(seriesSel, choices, null, 'Choose a Series…');
      if (choices.indexOf(STATE.scenarioSeries) < 0) STATE.scenarioSeries = '';
      seriesSel.value = STATE.scenarioSeries;
    }

    var allowed = SEL.scenarioAdjustmentsFor(STATE.scenarioField);
    var ids = allowed.map(function (a) { return a.id; });
    if (ids.indexOf(STATE.scenarioAdjustment) < 0) {
      STATE.scenarioAdjustment = ids.length ? ids[0] : '';
    }
    var adjSel = byId('scAdjust');
    if (adjSel) {
      fillOptions(adjSel, ids, function (i2) {
        var a = SEL.scenarioAdjustment(i2);
        return a ? a.label : i2;
      });
      adjSel.value = STATE.scenarioAdjustment;
    }
    var fieldSel = byId('scField');
    if (fieldSel) fieldSel.value = STATE.scenarioField;

    var adj = SEL.scenarioAdjustment(STATE.scenarioAdjustment);
    setText(byId('scValueLabel'), adj ? (adj.unit === 'percent' ? 'Percentage'
      : (adj.unit === 'amount' ? 'Amount' : 'Price')) : 'Value');
    var input = byId('scValue');
    if (input) {
      input.setAttribute('placeholder', adj ? adj.placeholder : '');
      input.setAttribute('aria-label', (adj ? adj.label : 'Value') + '. ' + (adj ? adj.help : ''));
    }

    var reach = byId('scenarioReach');
    if (reach) {
      var preview = SEL.scenarioAffected(MODEL.rows, STATE.scenarioSeries);
      reach.setAttribute('data-skus', String(preview.skus));
      setText(reach, STATE.scenarioSeries
        ? (preview.skus + ' listing' + (preview.skus === 1 ? '' : 's') + ' in "'
          + STATE.scenarioSeries + '" would be simulated on this site'
          + (STATE.scenarioField === 'proposed_scenario_price'
            && STATE.scenarioAdjustment === 'set'
            ? ' — all of them at the same figure, because a promotion is one price.' : '.'))
        : 'Choose a Series to see how many listings a change would reach.');
    }

    var undo = byId('scUndo');
    if (undo) undo.disabled = STATE.undoStack.length === 0;
    var note = byId('scenarioNote');
    if (note) {
      setText(note, 'Active overrides: ' + MODEL.scenario.override_count
        + (MODEL.architecture.scenario_nodes.length
          ? ' · simulated on screen: ' + MODEL.architecture.scenario_nodes.join(' · ') : '')
        + ' · held in this page only, and cleared by a reload.');
    }
    updateScenarioReady();
    updateScenarioStatus();
  }

  /**
   * THE SCENARIO MARK. Present in the DOM exactly when a simulated number is on screen, inside the
   * banner, undismissable, and it prints.
   *
   * The preview notice above it is untouched — it is still never re-rendered and never conditional.
   * This is a SECOND statement, and it has to be conditional, because "one of these prices is
   * simulated" is only true sometimes and a warning that is always shown teaches a reader to ignore it.
   * A printed page is the one artefact that leaves the room, so it is the one that most needs to say
   * that a number on it is not a price the company charges.
   */
  function renderScenarioMark() {
    var banner = byId('banner');
    var existing = byId('scenarioPrintMark');
    if (!MODEL.scenario.active) {
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
      return;
    }
    /* P1-B7 — WITHOUT A STRIP THERE IS NO WARNING, SO THERE MUST BE NO SCENARIO PRINT EITHER. This
       returns rather than inventing a host: the mark exists to say that a printed number is
       simulated, and a mark appended somewhere arbitrary is a warning nobody reads. The production
       partial provides `#banner` for exactly this. */
    if (!banner) return;
    var text = 'SCENARIO — ' + MODEL.scenario.override_count
      + ' simulated price override' + (MODEL.scenario.override_count === 1 ? '' : 's')
      + ' on ' + siteIdentity().key + '. These are not prices the company charges, they are not saved'
      + ' anywhere, and they disappear when this page is reloaded.';
    if (existing) {
      clear(existing);
      existing.appendChild(document.createTextNode(text));
      return;
    }
    var mark = el('span', 'badge-scenario', text);
    mark.id = 'scenarioPrintMark';
    banner.appendChild(mark);
  }

  /* ================================================================================================
     P1-B2B — THREE REDRAWS, BECAUSE THERE ARE THREE SIZES OF CHANGE.

     THE SCROLL JUMP HAD ONE CAUSE AND IT WAS THIS FUNCTION. Every control on the page called
     `render()`, and `render()` rebuilt the nav, the crumbs, the WHOLE scope area — site filters,
     analysis filters, the advanced drawer and the entire scenario panel — and then emptied and
     refilled `#view`. Choosing a Series from the scenario's own dropdown therefore destroyed that
     dropdown: the `<select>` the person had just used no longer existed when their change finished.

     Three consequences followed, and together they are the jump the operator saw:

       1. the focused element vanished, so the browser had nothing to keep in view and fell back to
          whatever its scroll anchoring could find;
       2. the panel's own height changed as the validation line and the "Applied:" line appeared and
          disappeared, so content genuinely moved under the viewport;
       3. because the rebuild happened ABOVE and AROUND the reading position, whether it jumped up,
          jumped down, or happened to look still depended entirely on where the page was scrolled —
          which is exactly the symptom: "if the operator is at one particular position it does not
          jump, and the same action at another position does".

     So the fix is not to save and restore a scroll offset around a rebuild that should not happen.
     It is to stop rebuilding:

         render()              everything. A site, a country, a marketplace, a category, a series or
                               a currency changed — different products, so the menus below are
                               genuinely different menus.
         renderData()          the banner mark and `#view`. The data being drawn changed — Apply,
                               Undo, a reset, a layer, a zoom — but every control is still valid, so
                               no control is touched.
         updateScenarioForm()  nothing is replaced at all. A dropdown changed; its dependent options,
                               placeholder, reach count, readiness and status line are written in
                               place, and every node keeps its identity, including the `<select>`
                               that has focus.

     And around the two that do rebuild, an ANCHOR, not a saved offset — see withViewport.
     ================================================================================================ */
  function paintView() {
    var host = byId('view');
    clear(host);
    if (STATE.view === 'overview') viewOverview(host);
    else if (STATE.view === 'category') viewCategory(host);
    else if (STATE.view === 'risk') {
      viewFindings(host, CLASS.RISK, 'Deal Risk',
        'A dearer product discounting to or below a cheaper product’s everyday price, within one '
        + 'category and one currency. Live promotions and board scenarios are never merged.');
    } else if (STATE.view === 'quality') {
      viewEligibility(host);
      viewFindings(host, CLASS.DQ, 'Data Quality',
        'Everything a source could not supply. Nothing on this page was substituted for a missing '
        + 'value — an absent price stays absent and an unproven photograph is not shown.');
    } else if (STATE.view === 'workspace') viewWorkspace(host);
    else viewAdvanced(host);
  }

  /* ---- THE VIEWPORT CONTRACT ----------------------------------------------------------------------

     A SAVED scrollY IS NOT A POSITION, IT IS A DISTANCE FROM THE TOP. Restoring it after a redraw
     that changed the height of anything above the reading position puts the reader somewhere else
     and calls it unchanged. So what is preserved here is an ANCHOR: `#view` is never replaced — only
     its children are — so its distance from the top of the window is a measurement of the same piece
     of content before and after, and the difference is exactly how far the page moved.

     THE COMPENSATION ONLY FIRES WHEN THE ANCHOR ACTUALLY MOVED. If nothing above the reading
     position changed height — which is the normal case, because `renderData()` touches nothing above
     `#view` — the delta is zero and `scrollTo` is never called at all. This is deliberately not a
     blind `scrollTo(savedX, savedY)` after every render: that would hide an unnecessary rebuild
     instead of removing it, and it would be wrong in precisely the case it was added for.

     MEASURING A BOX HERE IS NOT MEASURING ONE FOR GEOMETRY. The chart still reads no layout box: its
     coordinates come from a declared design width, so it draws identically on a slow load. This
     reads the live layout to answer a question only the live layout can answer — did the page move
     under the reader — and it changes no coordinate, no price and nothing that is drawn. */
  function viewportNow() {
    if (typeof window === 'undefined' || !window) return null;
    return { x: window.scrollX || window.pageXOffset || 0,
      y: window.scrollY || window.pageYOffset || 0 };
  }
  function anchorTop() {
    var a = byId('view');
    if (!a || typeof a.getBoundingClientRect !== 'function') return null;
    var r = a.getBoundingClientRect();
    return r ? r.top : null;
  }
  /** The chart's own sideways position is the reader's too, and a redraw must not send it home. */
  function chartScrolls() {
    var out = [], wraps = document.querySelectorAll('.chartwrap');
    for (var i = 0; i < wraps.length; i++) out.push(wraps[i].scrollLeft || 0);
    return out;
  }
  function restoreChartScrolls(saved) {
    var wraps = document.querySelectorAll('.chartwrap');
    for (var i = 0; i < wraps.length && i < saved.length; i++) {
      if (saved[i]) wraps[i].scrollLeft = saved[i];
    }
  }
  function withViewport(fn) {
    var before = viewportNow();
    var topBefore = anchorTop();
    var sideways = chartScrolls();
    fn();
    restoreChartScrolls(sideways);
    var topAfter = anchorTop();
    if (before && topBefore !== null && topAfter !== null && topAfter !== topBefore
      && typeof window !== 'undefined' && window && typeof window.scrollTo === 'function') {
      window.scrollTo(before.x, Math.max(0, before.y + (topAfter - topBefore)));
    }
  }

  function render() {
    withViewport(function () {
      hideTip();
      reload();
      setBodyState();
      /* P1-B7 — ABSENT ON PURPOSE IN PRODUCTION. `#shell` and `#btnRail` are the prototype's own
         sidebar and its collapse toggle; the Operation System owns navigation and §6 forbids a
         second sidebar, so the production partial has neither. Unguarded, this line was a TypeError
         on the first render and the board never drew at all. */
      var shellEl = byId('shell');
      if (shellEl) shellEl.className = 'shell' + (STATE.rail ? ' is-rail' : '');
      var rb = byId('btnRail');
      if (rb) {
        rb.setAttribute('aria-expanded', STATE.rail ? 'false' : 'true');
        rb.setAttribute('title', STATE.rail ? 'Expand navigation' : 'Collapse navigation');
      }
      renderNav();
      renderCrumbs();
      renderScope();
      renderScenarioMark();
      paintView();
    });
  }

  /**
   * THE DATA CHANGED; THE CONTROLS DID NOT. Apply, Undo, the three resets, every layer checkbox and
   * every zoom button come here. Nothing above `#view` is rebuilt — not the filters, not the
   * scenario panel, not one `<select>` — so the anchor cannot move and no focus is lost. The
   * scenario panel's own readouts are written in place afterwards.
   */
  function renderData() {
    withViewport(function () {
      hideTip();
      reload();
      setBodyState();
      renderScenarioMark();
      paintView();
      /* INSIDE THE MEASUREMENT, not after it. The readouts are part of the redraw: measuring the
         anchor before them and compensating for only half the change would leave the page moved by
         exactly the half that was missed. */
      updateScenarioForm();
    });
  }

  /* ================================================================================================
     10  AUTOMATED DOM ASSERTIONS.
     ================================================================================================ */
  var T = { pass: 0, fail: 0, items: [] };
  function ok(cond, label, got) {
    if (cond) { T.pass++; T.items.push({ ok: true, label: label }); }
    else {
      T.fail++;
      T.items.push({ ok: false, label: label, got: got });
      try { console.error('SELFTEST FAIL ' + label, got); } catch (e) {}
    }
  }
  function eqv(a, b, label) { ok(JSON.stringify(a) === JSON.stringify(b), label, a); }

  function setSel(id, v) {
    var s = byId(id);
    s.value = v;
    s.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function viewHost() { return byId('view'); }
  function qsa(sel) { return viewHost().querySelectorAll(sel); }
  function findingsIn(kind) { return qsa('.finding[data-kind="' + kind + '"]'); }
  function textOf(node) { return node ? String(node.textContent || '') : ''; }
  /* WHAT A READER ACTUALLY SEES. textContent includes hidden subtrees, so a claim about "the
     executive page" that used it would be a claim about the collapsed drawer too. */
  function visibleTextOf(node) {
    if (!node) return '';
    if (node.nodeType === 1 && node.hidden) return '';
    var kids = node.childNodes || [];
    if (!kids.length) return String(node.textContent || '');
    var out = '';
    for (var i = 0; i < kids.length; i++) out += visibleTextOf(kids[i]);
    return out;
  }
  function goto_(view, cat) {
    STATE.view = view;
    STATE.category = cat === undefined ? STATE.category : cat;
    render();
  }

  function selfTest() {
    var start = { view: STATE.view, category: STATE.category, country: STATE.country,
      rail: STATE.rail, drawer: STATE.drawerOpen, advanced: STATE.advancedOpen,
      threshold: STATE.thresholdC, selected: JSON.stringify(STATE.selected) };

    /* ---- A  integer cents ---- */
    eqv(cents('32.99') - cents('24.99'), 800, 'A1 the difference that motivates integer cents');
    ok(32.99 - 24.99 !== 8, 'A2 and the float that does not survive it');
    eqv(fromCents(cents('19.99')), '19.99', 'A3 round trip');
    eqv(cents(null), null, 'A4 absent stays absent');

    /* ---- B  the contract: category is a field and the first scope ---- */
    ok(CONTRACT.FIELD_NAMES.indexOf('category') >= 0, 'B1 category is a contract field');
    eqv(CONTRACT.fieldSpec('category').source_column, 'category',
      'B2 sourced from sku_details.category');
    eqv(CONTRACT.fieldSpec('category').source_table, 'sku_details', 'B3 on the master table');
    ok(CONTRACT.FIELD_NAMES.indexOf('image_identity_status') >= 0,
      'B4 image_identity_status travels with the row');
    eqv(CONTRACT.SCOPE_ORDER[0], 'category', 'B5 category is the first scope');
    eqv(CONTRACT.SCOPE_ORDER,
      ['category', 'company', 'country', 'marketplace', 'currency', 'series'],
      'B6 and the whole ladder is declared in order');
    eqv(CONTRACT.CATEGORY_AUTHORITY.cross_category_price_axis, false,
      'B7 two categories never share a price axis');
    eqv(CONTRACT.CATEGORY_AUTHORITY.cross_category_findings, false,
      'B8 and no finding is computed across two');
    var vr = CONTRACT.validateRows(PREVIEW.PreviewProductStrategyDataAdapter.load({}).rows);
    eqv([vr.ok, vr.mismatches.length], [true, 0],
      'B9 every preview row satisfies the contract, field for field', vr.mismatches.slice(0, 3));
    ok(vr.checked >= 40, 'B10 and there were rows to check', vr.checked);

    /* ---- C  the adapter seam ---- */
    eqv(PREVIEW.PreviewProductStrategyDataAdapter.id, 'PREVIEW', 'C1 the preview adapter is in use');
    var db = CONTRACT.OperationDbProductStrategyDataAdapter;
    eqv(db.enabled, false, 'C2 the Operation DB adapter is defined and DISABLED');
    var dbr = db.load({});
    eqv(dbr.state, 'SOURCE_NOT_CONNECTED', 'C3 and it refuses rather than pretending');
    eqv([dbr.rows.length, dbr.provenance.requests_made], [0, 0],
      'C4 zero rows and zero requests');
    eqv(LOAD.provenance.connected, false, 'C5 the live load says it is not connected');
    eqv(LOAD.provenance.requests_made, 0, 'C6 and made no request');
    eqv(LOAD.provenance.price_source, 'PREVIEW_DEMONSTRATION',
      'C7 prices are demonstration figures …');
    eqv(LOAD.provenance.identity_source, 'USER_PROVIDED_DB_EVIDENCE',
      'C8 … while the identities came from the database the operator read');

    /* ---- D  the permanent notice ---- */
    eqv(byId('notice').textContent,
      'Preview data — not connected to Operation System Database', 'D1 the banner says it exactly');
    ok(!byId('banner').hidden, 'D2 and it is never hidden');
    var page = visibleTextOf(document.body).toUpperCase();
    ['LIVE DATA', 'CURRENT DATA', 'OFFICIAL DATABASE'].forEach(function (w, i) {
      ok(page.indexOf(w) < 0, 'D3.' + (i + 1) + ' the page never says "' + w + '"');
    });

    /* ---- E  variant grouping and the representative image ---- */
    goto_('category', 'Electric Can Opener');
    var nodes = groupNodes(ROWS);
    var usd = nodes.filter(function (n) { return n.currency === 'USD'; });
    var co1150 = usd.filter(function (n) { return n.label === 'CO1150'; });
    eqv(co1150.length, 2, 'E1 one variant_group with two prices splits into two nodes');
    eqv(co1150[0].variant_count, 3, 'E2 the merged node carries its three colours');
    eqv(co1150[1].variant_count, 1, 'E3 and the price-split sibling stands alone');
    ok(!!co1150[0].image, 'E4 the merged node shows its verified photograph …');
    eqv(co1150[1].image, null,
      'E5 … and the sibling does NOT inherit it — an image represents its own grouping');
    eqv(co1150[0].representative_image_sku, 'CO1150-R', 'E6 named, so it can be checked');
    ok(co1150[0].grouped_skus.indexOf('CO1150-R') >= 0,
      'E7 and the grouped skus are published beside it');
    var ungrouped = usd.filter(function (n) {
      return n.grouping_state === 'VARIANT_GROUPING_SOURCE_MISSING'; });
    eqv(ungrouped.length, 1, 'E8 a row with no grouping authority stands alone');
    eqv(ungrouped[0].label, 'CO1201-MW', 'E9 keyed by its own sku, not by a truncated prefix');

    /* ---- F  currency never shares an axis ---- */
    setSel('fCountry', 'ALL');
    var panels = qsa('.panel');
    eqv(panels.length, 3, 'F1 three currencies, three panels', panels.length);
    var curs = [];
    for (var p = 0; p < panels.length; p++) curs.push(panels[p].getAttribute('data-currency'));
    eqv(curs.sort(), ['EUR', 'GBP', 'USD'], 'F2 one panel each');
    var charts = qsa('.chart');
    eqv(charts.length, 3, 'F3 three axes, not one');
    var mixed = 0;
    for (var q = 0; q < charts.length; q++) {
      var cs = {};
      var cols = charts[q].querySelectorAll('.col');
      for (var r2 = 0; r2 < cols.length; r2++) cs[cols[r2].getAttribute('data-currency')] = 1;
      if (Object.keys(cs).length > 1) mixed++;
    }
    eqv(mixed, 0, 'F4 and no axis carries two currencies');
    var fx = 0;
    qsa('.finding').forEach && qsa('.finding').forEach(function () {});
    eqv(fx, 0, 'F5 no exchange rate is applied anywhere on the page');

    /* ---- G  the five-unit axis ---- */
    setSel('fCountry', 'US');
    var ch = qsa('.chart')[0];
    eqv(ch.getAttribute('data-tick-step-c'), '500', 'G1 the tick step is 5 currency units');
    var ticks = ch.querySelectorAll('.ytick');
    var vals = [];
    for (var g1 = 0; g1 < ticks.length; g1++) {
      vals.push(Number(ticks[g1].getAttribute('data-tick-c')));
    }
    ok(vals.length >= 3, 'G2 there is a real scale', vals.length);
    var badStep = 0;
    for (var g2 = 1; g2 < vals.length; g2++) if (vals[g2] - vals[g2 - 1] !== 500) badStep++;
    eqv(badStep, 0, 'G3 every gridline is exactly 5 units from the last', vals);
    var mod = 0;
    vals.forEach(function (v) { if (v % 500 !== 0) mod++; });
    eqv(mod, 0, 'G4 and every tick is a multiple of 5');
    /* THE ROUNDING, MEASURED AGAINST THE DATA RATHER THAN AGAINST ITSELF. */
    var lo = null, hi = null;
    groupNodes(ROWS).filter(function (n) { return n.currency === 'USD' && n._plottable; })
      .forEach(function (n) {
        [n._min_c, n._msrp_c, n._regular_c, n._deal_live ? n._deal_c : null, n._proposed_c]
          .forEach(function (v) {
            if (v === null || v === undefined) return;
            if (lo === null || v < lo) lo = v;
            if (hi === null || v > hi) hi = v;
          });
      });
    eqv(Number(ch.getAttribute('data-axis-min-c')), Math.floor(lo / 500) * 500,
      'G5 axis_min is the data minimum rounded DOWN to 5');
    eqv(Number(ch.getAttribute('data-axis-max-c')), Math.ceil(hi / 500) * 500,
      'G6 axis_max is the data maximum rounded UP to 5');
    eqv(vals[0], Number(ch.getAttribute('data-axis-min-c')), 'G7 the first tick is axis_min');
    eqv(vals[vals.length - 1], Number(ch.getAttribute('data-axis-max-c')),
      'G8 and the last is axis_max');
    var grids = ch.querySelectorAll('.grid');
    eqv(grids.length, vals.length, 'G9 one gridline per tick, none unlabelled');
    /* THE LAYOUT IS DERIVED, AND IT IS DERIVED THE SAME WAY EVERY TIME.

       P1-B2B asserted a fixed 48px pitch here. P1-B2C makes that a PREFERENCE, so what is checked
       is what is actually promised: the same inputs give the same layout, a wide range widens the
       tick step rather than producing an unreadable scale, and the gridline pitch stays above the
       point where a tick label is worth drawing. */
    var L1 = LAYOUT.deriveResponsiveChartLayout({ containerWidth: 1180, availableHeight: 520,
      productCount: 7, domainLowC: 1199, domainHighC: 4299, mode: 'auto' });
    var L2 = LAYOUT.deriveResponsiveChartLayout({ containerWidth: 1180, availableHeight: 520,
      productCount: 7, domainLowC: 1199, domainHighC: 4299, mode: 'auto' });
    eqv(JSON.stringify(L1), JSON.stringify(L2), 'G10 the layout engine is deterministic');
    eqv(L1.tickStepC, 500, 'G11 an ordinary range keeps the five-unit step');
    ok(L1.pxPerTick >= LAYOUT.MIN_PITCH_AUTO,
      'G12 and the gridline pitch is above the point where a label is worth drawing', L1.pxPerTick);
    var wide = LAYOUT.deriveResponsiveChartLayout({ containerWidth: 1180, availableHeight: 460,
      productCount: 7, domainLowC: 500, domainHighC: 500000, mode: 'auto' });
    ok(wide.tickStepC > 500, 'G12a an enormous range widens the step instead', wide.tickStepC);
    ok(wide.pxPerTick >= LAYOUT.MIN_PITCH_AUTO, 'G12b and the pitch survives it', wide.pxPerTick);
    /* AND AUTO FIT MEANS FIT: the whole drawing is inside the height it was given. */
    ok(L1.viewBoxH <= 520, 'G12c Auto Fit keeps the whole drawing inside the room it has',
      { h: L1.viewBoxH });

    /* ---- H  the image price markers ---- */
    var imgMarks = ch.querySelectorAll('image');
    ok(imgMarks.length >= 1, 'H1 the everyday price is drawn as a photograph where one is verified',
      imgMarks.length);
    var srcOk = 0;
    for (var h1 = 0; h1 < imgMarks.length; h1++) {
      var src = imgMarks[h1].getAttribute('data-src') || '';
      if (src.indexOf('images/') === 0 && src.indexOf('..') < 0) srcOk++;
    }
    eqv(srcOk, imgMarks.length, 'H2 every one is a local sibling file');
    /* THE COORDINATE IS THE DATUM, THE PLATE IS CENTRED ON IT, AND NOTHING SITS ON THE PICTURE.

       P1-B2A replaced the 2px centre dot with a crosshair drawn BEHIND the plate and extending past
       it, so the datum is still visible and provable while the photograph is clear. These read the
       crosshair's own coordinates rather than a circle's cx/cy. */
    var cols = ch.querySelectorAll('.col');
    var bad = 0, checked = 0, notLine = 0, tooShort = 0;
    for (var h2 = 0; h2 < cols.length; h2++) {
      var anchor = cols[h2].querySelector('.mk-anchor');
      var plate = cols[h2].querySelector('.mk-img-plate');
      if (!anchor || !plate) continue;
      checked++;
      if (String(anchor.localName || '').toLowerCase() !== 'line') notLine++;
      var cy = Number(anchor.getAttribute('data-cy'));
      var py = Number(plate.getAttribute('y')), ph = Number(plate.getAttribute('height'));
      if (Math.abs((py + ph / 2) - cy) > 0.001) bad++;
      var cx = Number(anchor.getAttribute('data-cx'));
      var px = Number(plate.getAttribute('x')), pw = Number(plate.getAttribute('width'));
      if (Math.abs((px + pw / 2) - cx) > 0.001) bad++;
      /* IT REACHES PAST THE PLATE ON BOTH SIDES, which is the whole reason it is readable without
         being on the picture: what a person sees are the two stubs meeting the gridline. */
      var x1 = Number(anchor.getAttribute('x1')), x2 = Number(anchor.getAttribute('x2'));
      if (!(x1 < px && x2 > px + pw)) tooShort++;
      if (Number(anchor.getAttribute('y1')) !== cy
        || Number(anchor.getAttribute('y2')) !== cy) bad++;
    }
    ok(checked >= 5, 'H3 every column was inspected', checked);
    eqv(bad, 0, 'H4 the marker CENTRE is the price coordinate, in both axes');
    eqv(notLine, 0, 'H4a the datum is a crosshair, not a dot on the photograph');
    eqv(tooShort, 0, 'H4b and it reaches past the plate on both sides, so it stays readable');
    /* THE BLACK DOT IS GONE, NOT HIDDEN. A dot made transparent is still a dot: still in the tree,
       still hit-tested, and still there for the next reader to rediscover. */
    var plates = ch.querySelectorAll('.mk-img-plate');
    var onPicture = 0;
    var circles = ch.querySelectorAll('circle');
    for (var h2b = 0; h2b < circles.length; h2b++) {
      var ccx = Number(circles[h2b].getAttribute('cx')), ccy = Number(circles[h2b].getAttribute('cy'));
      for (var h2c = 0; h2c < plates.length; h2c++) {
        var qx = Number(plates[h2c].getAttribute('x')), qy = Number(plates[h2c].getAttribute('y'));
        var qw = Number(plates[h2c].getAttribute('width')), qh = Number(plates[h2c].getAttribute('height'));
        if (ccx > qx && ccx < qx + qw && ccy > qy && ccy < qy + qh) onPicture++;
      }
    }
    eqv(onPicture, 0, 'H4c no circle of any kind sits inside a product-image plate');
    /* AND THE COORDINATE IS THE PRICE, not something the picture decided. */
    var mism = 0;
    for (var h3 = 0; h3 < cols.length; h3++) {
      var a2 = cols[h3].querySelector('.mk-anchor');
      if (!a2) continue;
      if (a2.getAttribute('data-price-c') !== cols[h3].getAttribute('data-regular-c')) mism++;
    }
    eqv(mism, 0, 'H5 and it carries the everyday price it was placed at');
    /* THE FALLBACK. Clean, neutral, carries a code, and is never a broken image. */
    var fbs = ch.querySelectorAll('.mk-fallback');
    ok(fbs.length >= 1, 'H6 products with no verified photograph get a neutral marker', fbs.length);
    eqv(ch.querySelectorAll('.mk-img-plate').length, cols.length,
      'H7 every column has exactly one everyday plate — image or fallback');
    /* THE IMAGE MARKER IS THE EVERYDAY PRICE AND NOTHING ELSE. */
    var dealMarks = ch.querySelectorAll('.mk-deal');
    var propMarks = ch.querySelectorAll('.mk-prop');
    ok(dealMarks.length >= 1 && propMarks.length >= 1,
      'H8 deals and proposals keep their own shapes');
    var conf = 0;
    for (var h4 = 0; h4 < dealMarks.length; h4++) {
      if (dealMarks[h4].querySelector && dealMarks[h4].querySelector('image')) conf++;
    }
    eqv(conf, 0, 'H9 and no photograph is attached to a deal marker');
    /* NO PATH IS EVER COMPOSED. */
    var rsrc = String(everydayMarker) + String(SEL.ingest);
    ok(rsrc.indexOf('.jpg') < 0 && rsrc.indexOf('assets/') < 0 && rsrc.indexOf("'images/'") < 0,
      'H10 the renderer composes no image path of its own');

    /* ---- I  the three rules and their boundaries ---- */
    var m = categoryModel('Electric Can Opener');
    var usdPanel = null;
    m.panels.forEach(function (p2) { if (p2.currency === 'USD') usdPanel = p2; });
    var f = m.findings.filter(function (x) { return x.currency === 'USD'; });
    var gaps = f.filter(function (x) { return x.kind === 'PRICE_GAP'; });
    var laddr = usdPanel.plotted.map(function (n) { return n._regular_c; });
    eqv(laddr, [2199, 2499, 3299, 3499, 4499, 5999, 7499], 'I1 the USD ladder', laddr);
    eqv(gaps.length, 3, 'I2 three steps exceed the 8.00 threshold', gaps.map(function (x) {
      return x.distance_c; }));
    var eight = 0;
    for (var i2 = 1; i2 < laddr.length; i2++) if (laddr[i2] - laddr[i2 - 1] === 800) eight++;
    eqv(eight, 1, 'I3 and exactly one step is EXACTLY the threshold …');
    eqv(gaps.filter(function (x) { return x.distance_c === 800; }).length, 0,
      'I4 … which is not a gap, because the test is strictly greater');
    var ov = f.filter(function (x) { return x.kind === 'PRICE_BAND_OVERLAP'; });
    eqv(ov.length, 1, 'I5 one real overlap', ov.map(function (x) { return x.headline; }));
    eqv(ov[0].hi_c - ov[0].lo_c, 100, 'I6 of exactly 1.00');
    var can = f.filter(function (x) { return x.kind === 'DEAL_CANNIBALIZATION'; });
    eqv(can.length, 3, 'I7 three cannibalisation risks', can.map(function (x) {
      return x.headline; }));
    eqv(can.filter(function (x) { return x.offer_c === x.b._regular_c; }).length, 2,
      'I8 two of them sit EXACTLY on the boundary, which is inclusive');
    eqv(can.filter(function (x) { return x.basis === 'LIVE'; }).length, 2, 'I9 two live …');
    eqv(can.filter(function (x) { return x.basis === 'PROPOSED'; }).length, 1, 'I10 … one proposed');
    eqv(can.filter(function (x) { return x.proposal_driven && x.basis === 'LIVE'; }).length, 0,
      'I11 and the two are never conflated');
    /* An expired campaign and a dateless promotion raise no risk. */
    var expired = usdPanel.plotted.filter(function (n) {
      return n._deal_c !== null && n._deal_period_ok && !n._deal_live; });
    eqv(expired.length, 1, 'I12 one campaign has closed …');
    eqv(can.filter(function (x) { return x.a === expired[0]; }).length, 0,
      'I13 … and it raises no risk');

    /* ---- J  data quality ---- */
    eqv(f.filter(function (x) { return x.kind === 'NO_PRICE'; }).length, 1,
      'J1 the product with no price is reported, not back-filled');
    eqv(f.filter(function (x) { return x.kind === 'DEAL_PERIOD_MISSING'; }).length, 1,
      'J2 a promotion price with no dates is a data finding, not a risk');
    eqv(f.filter(function (x) { return x.kind === 'VARIANT_GROUPING_SOURCE_MISSING'; }).length, 1,
      'J3 and so is a product nothing can group');
    eqv(f.filter(function (x) { return x.kind === 'IMAGE_SOURCE_MISSING'; }).length, 1,
      'J4 photographs are reported once per reason, not once per product');

    /* ---- K  every insight is a demonstration ---- */
    goto_('category', 'Electric Can Opener');
    STATE.drawerOpen = true; render();
    var fs = qsa('.finding');
    ok(fs.length >= 10, 'K1 the drawer holds the findings', fs.length);
    var unlabelled = 0;
    for (var k1 = 0; k1 < fs.length; k1++) if (!fs[k1].querySelector('.tag-demo')) unlabelled++;
    eqv(unlabelled, 0, 'K2 and EVERY one is tagged DEMONSTRATION INSIGHT');
    ok(qsa('.tag-live').length >= 1, 'K3 live promotions are tagged LIVE PROMOTION');
    ok(qsa('.tag-prop').length >= 1, 'K4 proposals as PROPOSAL-DRIVEN');
    eqv(qsa('.tag-prop.tag-live').length, 0, 'K5 and nothing is tagged both');
    STATE.drawerOpen = false; render();
    eqv(byId('drawerBody').hidden, true, 'K6 the drawer is collapsed again');

    /* ---- L  the sidebar ---- */
    eqv(STATE.rail, false, 'L1 the sidebar starts expanded');
    eqv(byId('shell').className.indexOf('is-rail') < 0, true, 'L2 and is not a rail');
    ok(byId('nav').querySelectorAll('.navbtn').length === 6, 'L3 six destinations',
      byId('nav').querySelectorAll('.navbtn').length);
    var actives = byId('nav').querySelectorAll('.navbtn.is-active');
    eqv(actives.length, 1, 'L4 exactly one is active');
    eqv(actives[0].getAttribute('data-view'), STATE.view, 'L5 and it is the one being shown');
    byId('btnRail').click();
    eqv(STATE.rail, true, 'L6 the collapse button collapses it …');
    ok(byId('shell').className.indexOf('is-rail') >= 0, 'L7 … to an icon rail');
    var tips = byId('nav').querySelectorAll('.navbtn[data-tip]');
    eqv(tips.length, 6, 'L8 every rail item still names itself in a tooltip');
    eqv(tips[0].getAttribute('title'), tips[0].getAttribute('data-tip'),
      'L9 and in its title, so the name survives the label being hidden');
    byId('btnRail').click();
    eqv(STATE.rail, false, 'L10 and it expands again');
    ok(String(render).indexOf('localStorage') < 0
      && String(renderNav).indexOf('sessionStorage') < 0,
      'L11 none of which touches browser storage');
    var emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    ok(!emoji.test(visibleTextOf(byId('side'))), 'L12 no emoji is used as an icon');
    eqv(byId('side').querySelectorAll('svg.ic').length >= 6, true,
      'L13 the icons are inline SVG, one per destination plus the actions');
    eqv(byId('side').querySelectorAll('.pimg-img, .catfig-img, image').length, 0,
      'L14 and not one of them stands in for a product photograph');

    /* ---- M  THE SITE IS THE FIRST SCOPE, THE CATEGORY IS DERIVED FROM IT, AND NOTHING LEAKS ----

       These five used to assert the number three: three cards, three table rows, and a literal list of
       three category names. That is precisely the shape the P1-B2 audit was asked to explain — a count
       that came from a fixture and had quietly become a contract. Changing 3 to 4 would have been the
       same defect one number along, so each one now asserts the DERIVATION: however many categories
       this site sells, that is how many cards there are, and switching the site changes the answer. */
    goto_('overview', null);
    eqv(qsa('.chart').length, 0, 'M1 the overview draws NO price axis at all');
    var cats = categoryValues();
    var cards = qsa('.catcard');
    eqv(cards.length, cats.length, 'M2 one card per category THIS SITE sells', cards.length);
    eqv(qsa('#overviewTable tbody tr').length, cats.length, 'M3 and one table row each');
    eqv(byId('fCountry').disabled, false,
      'M4 the SITE ring is never disabled — it decides what the other rings can even offer');
    /* THE PROPERTY IS ABSENT, not merely undefined — and it is asked without naming the property in
       a way a reader could mistake for a use of it. The suite scans this file's source for any reader
       of that name, so an assertion that read it would be indistinguishable from the defect. */
    ok(!Object.prototype.hasOwnProperty.call(ADAPTER, 'categor' + 'ies'),
      'M5a there is no cross-site category list to fall back to');
    eqv(cats, cats.slice().sort(), 'M5b the menu is sorted, never in source order', cats);
    eqv(cats, categoryOptionRows().options.map(function (o) { return o.value; }),
      'M5c and the buttons are exactly the pipeline\'s options');
    /* M5d THE ONE THAT WOULD HAVE CAUGHT THE ORIGINAL DEFECT: change the country and the menu must
       change with it. Before P1-B2 this list was identical on every site. */
    var usCats = cats.slice();
    var usCountry = STATE.country;
    setSel('fCountry', 'DE');
    var deCats = categoryValues();
    ok(deCats.length > 0 && deCats.join('|') !== usCats.join('|'),
      'M5d another country has a DIFFERENT menu, so the list is the site\'s', deCats);
    eqv(deCats.filter(function (c) { return usCats.indexOf(c) < 0; }).length > 0, true,
      'M5e including at least one category the first site does not sell', deCats);
    eqv(qsa('.catcard').length, deCats.length, 'M5f and the cards followed it');
    setSel('fCountry', usCountry);
    eqv(categoryValues(), usCats, 'M5g and switching back restores the first site exactly');
    cats.forEach(function (c, ci) {
      goto_('category', c);
      var only = {};
      qsa('#productTable tbody tr').forEach
        ? qsa('#productTable tbody tr').forEach(function (tr2) {
          only[tr2.getAttribute('data-category')] = 1; })
        : (function () {
          var rs = qsa('#productTable tbody tr');
          for (var z = 0; z < rs.length; z++) only[rs[z].getAttribute('data-category')] = 1;
        }());
      eqv(Object.keys(only), [c], 'M6.' + (ci + 1) + ' ' + c + ': the table shows only it');
      var chs = qsa('.chart');
      var chc = {};
      for (var z2 = 0; z2 < chs.length; z2++) chc[chs[z2].getAttribute('data-category')] = 1;
      eqv(Object.keys(chc), [c], 'M7.' + (ci + 1) + ' ' + c + ': and so does every axis');
      var fcat = {};
      var ff = qsa('.finding');
      for (var z3 = 0; z3 < ff.length; z3++) fcat[ff[z3].getAttribute('data-category')] = 1;
      eqv(Object.keys(fcat).filter(function (k) { return k && k !== c; }), [],
        'M8.' + (ci + 1) + ' ' + c + ': and no finding belongs to another category');
    });
    /* NO STALE ANYTHING WHEN THE CATEGORY CHANGES. */
    goto_('category', 'Electric Can Opener');
    var beforeRows = qsa('#productTable tbody tr').length;
    var beforeFind = qsa('.finding').length;
    goto_('category', 'Silicone Spatula');
    var afterRows = qsa('#productTable tbody tr').length;
    ok(beforeRows !== afterRows, 'M9 switching category rebuilds the table', [beforeRows, afterRows]);
    eqv(qsa('#productTable tbody tr[data-category="Electric Can Opener"]').length, 0,
      'M10 with not one row of the category just left');
    eqv(qsa('.finding[data-category="Electric Can Opener"]').length, 0,
      'M11 and not one of its findings');
    ok(beforeFind > 0, 'M12 (the previous category did have findings)', beforeFind);
    /* THE SAME ROW SET FEEDS THE SUMMARY, THE CHART, THE TABLE AND THE INSIGHTS. */
    var sm = categoryModel('Silicone Spatula');
    var plottedNodes = 0;
    sm.panels.forEach(function (p3) { plottedNodes += p3.plotted.length; });
    eqv(qsa('.col').length, plottedNodes, 'M13 the chart plots exactly the scoped nodes');
    eqv(qsa('#productTable tbody tr').length, sm.nodes.length,
      'M14 the table lists exactly the scoped nodes');
    eqv(Number(textOf(qsa('.kpi')[0]).replace(/[^0-9]/g, '')), plottedNodes,
      'M15 and the summary counts the same ones');
    /* THE OVERVIEW NEVER PRODUCES A CROSS-CATEGORY FINDING. */
    goto_('overview', null);
    var crossKinds = 0;
    var ofs = qsa('.finding');
    for (var m1 = 0; m1 < ofs.length; m1++) {
      var kk = ofs[m1].getAttribute('data-kind');
      if (kk === 'PRICE_GAP' || kk === 'PRICE_BAND_OVERLAP' || kk === 'DEAL_CANNIBALIZATION') {
        crossKinds++;
      }
    }
    eqv(crossKinds, 0, 'M16 and the cross-category view raises no gap, overlap or cannibalisation');

    /* ---- N  the product comparison table ---- */
    goto_('category', 'Electric Can Opener');
    setSel('fCountry', 'US');
    var head = qsa('#productTable thead th');
    var hs = [];
    for (var n1 = 0; n1 < head.length; n1++) hs.push(textOf(head[n1]));
    ['Model', 'Representative SKU', 'Variants', 'Series', 'Floor', 'Everyday', 'List',
      'Official deal', 'Proposed', 'Status', 'Data quality'].forEach(function (h, i3) {
      ok(hs.indexOf(h) >= 0, 'N1.' + (i3 + 1) + ' the table carries ' + h);
    });
    eqv(qsa('#productTable .tfig').length, qsa('#productTable tbody tr').length,
      'N2 every row has an image slot …');
    ok(qsa('#productTable .tfig img').length >= 1, 'N3 … some of them filled …');
    ok(qsa('#productTable .tfig-miss').length >= 1, 'N4 … and the rest saying so in words');
    eqv(qsa('#productTable tbody tr[data-category="Silicone Spatula"]').length, 0,
      'N5 and nothing from another category');

    /* ---- O  no network, no storage, nothing substituted ---- */
    /* `ingest` is no longer a function in this file — the pipeline owns it (selectors.js). Naming a
       removed function here would throw and take the whole self-test with it, so the scan covers what
       this file still has AND the pipeline it delegates to. */
    var src = String(SEL.ingest) + String(renderChart) + String(reload) + String(render)
      + String(categoryModel) + String(everydayMarker) + String(SEL.applyScenarioPriceOverlay)
      + String(SEL.setScenarioOverride) + String(SEL.getEligibleProductUniverse);
    ['fetch(', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'indexedDB', 'WebSocket',
      'navigator.', 'KM.DB'].forEach(function (b, i4) {
      ok(src.indexOf(b) < 0, 'O1.' + (i4 + 1) + ' the renderer never reaches for ' + b);
    });
    /* FIVE NOW: the contract, the LAYOUT ENGINE, the pipeline, the fixture and this file. The
       count is asserted rather than the names because the point is that nothing is loaded from
       anywhere else — a fifth local file is a decision, a sixth remote one would be a defect. */
    var scripts = [].slice.call(document.querySelectorAll('script[src]'))
      .map(function (n) { return n.getAttribute('src'); });
    eqv(scripts.length, 5, 'O2 five local scripts, and no sixth');
    eqv(scripts.filter(function (u) { return /^https?:|^\/\//.test(u); }), [],
      'O2a and not one of them is remote');
    /* P1-B8A — TWO, AND THE ORDER IS THE POINT. This was one: the board stylesheet carried its own
       copy of fifty base.css tokens so this page could render without reaching further into
       assets/**. The copy is gone, so the tokens now come from base.css — which means base.css must
       load FIRST, because the board sheet overrides some of what it defines. A test that only
       counted the links would pass with them the wrong way round and the page quietly wrong. */
    var sheets = [].slice.call(document.querySelectorAll('link[rel="stylesheet"]'))
      .map(function (n) { return n.getAttribute('href'); });
    eqv(sheets.length, 2, 'O3 two local stylesheets');
    /* THE SHIM FIRST, AND IT IS NOT base.css. This page cannot link base.css — that file sets
       `body { overflow: hidden }` for the application shell and would kill scrolling here — so the
       fifty tokens it needs come from a prototype-only shim held to base.css by test. Order matters:
       the board sheet consumes these tokens and overrides some of them. */
    ok(/prototype-tokens\.css$/.test(sheets[0] || ''), 'O3a the prototype token shim is first');
    ok(/product-strategy-board\.css$/.test(sheets[1] || ''), 'O3b and the board sheet is second');
    eqv(sheets.filter(function (u) { return /(^|\/)(base|components)\.css$/.test(u); }), [],
      'O3d and neither shared sheet is loaded — they cannot be loaded a la carte');
    eqv(sheets.filter(function (u) { return /^https?:|^\/\//.test(u); }), [],
      'O3c and neither is remote');
    var pageText = visibleTextOf(document.body);
    ok(pageText.indexOf('margin') < 0, 'O4 no margin figure is shown, because there is no source');
    ok(pageText.indexOf('Current selling price') < 0
      || pageText.indexOf('not shown') > 0, 'O5 nor a current selling price');

    /* ---- P  print and presentation ---- */
    byId('btnPresent').click();
    ok(document.body.className.indexOf('presenting') >= 0, 'P1 presentation mode turns on');
    ok(!byId('banner').hidden, 'P2 and the notice stays');
    byId('btnPresent').click();
    ok(document.body.className.indexOf('presenting') < 0, 'P3 and off again');
    ok(!!byId('btnPrint'), 'P4 print is an action in the sidebar, not a loose button');
    eqv(byId('btnPrint').getAttribute('title'), 'Print or save as PDF', 'P5 and it says what it does');

    /* ---- Q  the verified image mappings ---- */
    var VM = CONTRACT.IMAGE_POLICY.verified_mappings;
    eqv(Object.keys(VM).length, 7, 'Q1 seven verified mappings, and no eighth');
    eqv(CONTRACT.IMAGE_POLICY.local_copies_in_preview, 7, 'Q2 seven copies shipped');
    eqv(CONTRACT.IMAGE_POLICY.authority, 'sku_details.image_url',
      'Q3 the authority is unchanged');
    ok(!!CONTRACT.IMAGE_POLICY.evidence_accepted.E, 'Q4 evidence class E is declared');
    ok(String(CONTRACT.IMAGE_POLICY.evidence_accepted.E).indexOf('OPERATOR_ASSERTED') >= 0,
      'Q5 and it names what it rests on');
    eqv([CONTRACT.IMAGE_POLICY.fallback_to_local_file,
      CONTRACT.IMAGE_POLICY.fallback_to_another_sku_image,
      CONTRACT.IMAGE_POLICY.may_derive_path_from_sku,
      CONTRACT.IMAGE_POLICY.may_extend_a_mapping_to_a_sibling_sku], [false, false, false, false],
      'Q6 no derivation, no substitution, no extension to a sibling');
    /* THE NEAR MISSES. Both files exist in the repo and neither may be used. */
    ok(!Object.prototype.hasOwnProperty.call(VM, 'CO2600-R'),
      'Q7 CO2600-R is NOT a mapping, though the file exists');
    ok(!Object.prototype.hasOwnProperty.call(VM, 'CO5600-R'),
      'Q8 nor is CO5600-R — the operator named CO5600-RB');
    /* EVERY IMAGE ON THE PAGE TRACES TO A MAPPING, by sku, not by shape. */
    goto_('category', 'Electric Can Opener');
    setSel('fCountry', 'US');
    var used = {};
    var allImgs = document.querySelectorAll('img, image');
    for (var q1 = 0; q1 < allImgs.length; q1++) {
      var s2 = allImgs[q1].getAttribute('src') || allImgs[q1].getAttribute('data-src') || '';
      if (s2) used[s2] = 1;
    }
    var allowed = {};
    Object.keys(VM).forEach(function (sku) { allowed['images/' + sku + '.jpg'] = 1; });
    var stray = Object.keys(used).filter(function (u) { return !allowed[u]; });
    eqv(stray, [], 'Q9 every image on the page is one of the seven', stray);
    var nodes2 = groupNodes(ROWS);
    var verified = nodes2.filter(function (n) { return n.image_state === 'VERIFIED_DB_MAPPING'; });
    verified.forEach(function (n, i5) {
      ok(Object.prototype.hasOwnProperty.call(VM, n.representative_image_sku),
        'Q10.' + (i5 + 1) + ' ' + n.label + ' shows ' + n.representative_image_sku
        + ', which is a named mapping');
      ok(n.grouped_skus.indexOf(n.representative_image_sku) >= 0,
        'Q11.' + (i5 + 1) + ' and that sku is a member of this very grouping');
    });


    /* ---- R  the P0-R3 / R3-R1 guarantees, still standing after the rebuild ---- */
    /* This round replaced the whole shell, so the earlier rounds' claims are re-asserted here
       against the new markup rather than assumed to have survived it. */
    eqv(CONTRACT.FIELD_NAMES.length, CONTRACT.FIELDS.length, 'R1 the contract is self-consistent');
    ok(CONTRACT.FIELDS.length >= 24, 'R2 and it carries the whole row shape',
      CONTRACT.FIELDS.length);
    eqv(CONTRACT.GAP_FIELDS, ['variant_group', 'variant_name'],
      'R3 exactly two fields are GAPs — no column in any table has them');
    ok(CONTRACT.FIELDS_NEEDING_P1B1.length === 9,
      'R4 nine fields still have no bounded read owner today', CONTRACT.FIELDS_NEEDING_P1B1);
    eqv(CONTRACT.REFUSAL_STATES.sort(),
      ['CONTRACT_MISMATCH', 'MIXED_CURRENCY_REFUSED', 'PARTIAL_DATA', 'SOURCE_MISSING',
        'SOURCE_NOT_CONNECTED'], 'R5 five refusal states, named');
    eqv(CONTRACT.fieldSpec('product_image').source_column, 'image_url',
      'R6 the image column is still sku_details.image_url');
    eqv(CONTRACT.fieldSpec('variant_group').gap, true,
      'R7 variant_group is still a GAP, not a column somebody found');
    ok(String(CONTRACT.OperationDbProductStrategyDataAdapter.requires.must_not_create)
      .indexOf('SECOND') >= 0, 'R8 and the disabled adapter still refuses to be a second authority');

    /* THE EXECUTIVE SURFACE CARRIES NO ENGINEERING VOCABULARY — measured on VISIBLE text, because
       textContent reads straight through the collapsed drawer and the collapsed Advanced page. */
    goto_('category', 'Electric Can Opener');
    STATE.drawerOpen = false; STATE.advancedOpen = false; render();
    var execText = visibleTextOf(byId('view'));
    ok(textOf(byId('view')).length > execText.length,
      'R9 the collapsed sections are rendered but not visible, so this is measured on what a '
      + 'reader can actually read');
    ['pricing_list', 'campaign_sku_lines', 'marketplace_skus', 'sku_details',
      'sku_regional_details', 'campaigns', 'promo_price', 'marketplace_sku_id', 'image_url']
      .forEach(function (t2, i7) {
        ok(execText.indexOf(t2) < 0,
          'R10.' + (i7 + 1) + ' no schema name on the executive page: ' + t2);
      });
    ok(!/\bD-[0-9]\b/.test(execText), 'R11 and no decision code such as D-1');
    ok(execText.indexOf('§') < 0, 'R12 and no section marks');
    ok(execText.indexOf('SOURCE_MISSING') < 0,
      'R13 nor raw refusal identifiers — they are said in words instead');

    /* ADVANCED DETAILS: its own destination, collapsed until asked for, and it is where the
       engineering vocabulary lives. */
    goto_('advanced');
    eqv(byId('advBody').hidden, true, 'R14 Advanced details opens collapsed');
    byId('advToggle').click();
    eqv(byId('advBody').hidden, false, 'R15 and opens on request');
    ok(qsa('#contractTable tbody tr').length === CONTRACT.FIELDS.length,
      'R16 listing every contract field', qsa('#contractTable tbody tr').length);
    eqv(qsa('#mappingTable tbody tr').length, 7,
      'R17 and every verified image mapping, one row each');
    var advText = visibleTextOf(byId('view'));
    ok(advText.indexOf('sku_details') >= 0,
      'R18 THIS is where a schema name belongs, and it is here');
    ok(advText.indexOf('requests 0') >= 0, 'R19 with the request count on the page');
    byId('advToggle').click();
    eqv(byId('advBody').hidden, true, 'R20 and it closes again');

    /* THE WORKSPACE. */
    goto_('workspace', 'Electric Can Opener');
    ok(qsa('#pickList .pick').length >= 5, 'R21 the picker lists the category’s products',
      qsa('#pickList .pick').length);
    byId('fSearch').value = 'CO1150';
    byId('fSearch').dispatchEvent(new Event('input', { bubbles: true }));
    ok(qsa('#pickList .pick').length < 5, 'R22 and search narrows it',
      qsa('#pickList .pick').length);
    byId('fSearch').value = '';
    byId('fSearch').dispatchEvent(new Event('input', { bubbles: true }));
    var disabledTools = 0, liveTools = 0;
    ['wsText', 'wsBand', 'wsMatrix', 'wsShare', 'wsSave', 'wsExport', 'wsHistory', 'wsComment',
      'wsAssign'].forEach(function (id) {
      if (byId(id).disabled) disabledTools++; else liveTools++;
    });
    eqv([liveTools, disabledTools], [3, 6],
      'R23 three tools work and six are visibly disabled rather than pretending');
    byId('wsText').click();
    byId('wsBand').click();
    eqv(qsa('#board .bel').length, 2, 'R24 the working tools create real elements');
    /* THE CLASS COLLISION P0-R3 FOUND THE HARD WAY: the card and its textarea must not share a
       class, or a selector for one silently matches the other. */
    eqv(qsa('#board .bel-note, #board .bel-bandnote').length, 2,
      'R25 and each carries its own distinctly-named field');
    eqv(qsa('#board .bel.bel-note').length, 0, 'R26 with no element that is both');
    qsa('#board .bel-del').forEach
      ? qsa('#board .bel-del').forEach(function (b) { b.click(); })
      : (function () { var d = qsa('#board .bel-del'); while (d.length) { d[0].click(); d = qsa('#board .bel-del'); } }());
    eqv(qsa('#board .bel').length, 0, 'R27 and they can be removed again');
    ok(!byId('banner').hidden, 'R28 the notice is on the workspace too');

    /* THE BANNER IS OUTSIDE EVERY VIEW, so no navigation can drop it. */
    ['overview', 'category', 'risk', 'quality', 'workspace', 'advanced'].forEach(function (v, i8) {
      goto_(v);
      ok(!byId('banner').hidden && byId('notice').textContent.indexOf('not connected') > 0,
        'R29.' + (i8 + 1) + ' the notice survives ' + v);
      ok(byId('view').querySelectorAll('#banner').length === 0,
        'R30.' + (i8 + 1) + ' because it is not inside the view that ' + v + ' replaced');
    });
    /* ---- Z  the page is put back ---- */
    STATE.view = start.view;
    STATE.category = start.category;
    STATE.country = start.country;
    STATE.rail = start.rail;
    STATE.drawerOpen = start.drawer;
    STATE.advancedOpen = start.advanced;
    STATE.thresholdC = start.threshold;
    STATE.selected = JSON.parse(start.selected);
    render();
    eqv(STATE.view, start.view, 'Z1 the self-test restored the view it found');
    eqv(STATE.category, start.category, 'Z2 and the category');
    eqv(STATE.rail, start.rail, 'Z3 and the sidebar');
  }

  function renderSelfTest() {
    var badge = byId('stBadge');
    clear(badge);
    badge.appendChild(document.createTextNode('self-test ' + T.pass + '/' + (T.pass + T.fail)));
    badge.className = 'stbadge ' + (T.fail === 0 ? 'is-ok' : 'is-bad');
    var host = byId('stList');
    clear(host);
    T.items.forEach(function (it) {
      host.appendChild(el('div', 'st ' + (it.ok ? 'st-ok' : 'st-bad'),
        (it.ok ? 'ok   ' : 'FAIL ') + it.label
        + (it.ok ? '' : '   got ' + JSON.stringify(it.got))));
    });
  }

  /* ================================================================================================
     BOOT.
     ================================================================================================ */
  /* ================================================================================================
     THE OBSERVER, AND WHY IT CANNOT BECOME A LOOP.

     Three guards, and each one closes a different way a resize observer eats a page:

       1. IT OBSERVES `#view`, WHICH THE RENDERER NEVER REPLACES. An observer attached to the chart's
          own container would stop firing the first time the chart was redrawn, because the node it
          was watching had been thrown away — the classic version of this bug, where resizing works
          exactly once.
       2. THE MEASUREMENT IS QUANTISED AND COMPARED. A container that reports 1281.6 and then 1281.4
          has not changed. `boxKey` is the whole set of inputs the layout depends on; if it matches
          the last one, nothing is redrawn, so even a genuine feedback path terminates after one
          pass instead of running forever.
       3. THE CALLBACK ONLY SCHEDULES. Work happens on the next animation frame, so a drag that
          fires forty resize events produces one redraw.

     The fallback for an environment with no ResizeObserver is a window resize listener, which is
     strictly worse — it cannot see the sidebar collapse — and is why the observer is preferred
     rather than the other way round.
     ================================================================================================ */
  var _resizeScheduled = false;
  function remeasure() {
    var b = measureBox();
    STATE.box = b;
    var k = boxKey(b);
    var changed = k !== STATE.boxKey;
    STATE.boxKey = k;
    return changed;
  }
  function onContainerResize() {
    if (_resizeScheduled) return;
    _resizeScheduled = true;
    var run = function () {
      _resizeScheduled = false;
      /* THE LAYOUT IS THE ONLY THING THAT CHANGED, so only the drawing is redrawn: renderData
         leaves the filters, the scenario panel and every control node exactly where they are, and
         holds the reader's place while it works. A resize must not cost somebody their scenario,
         their filters or their position on the page. */
      if (remeasure()) renderData();
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else run();
  }
  function observeContainer() {
    var host = byId('view');
    if (!host) return;
    if (typeof ResizeObserver === 'function') {
      try {
        var ro = new ResizeObserver(onContainerResize);
        ro.observe(host);
        STATE.observing = 'ResizeObserver';
        return;
      } catch (e) { /* fall through to the window listener */ }
    }
    if (typeof window !== 'undefined' && window && window.addEventListener) {
      window.addEventListener('resize', onContainerResize);
      STATE.observing = 'window-resize';
    } else {
      STATE.observing = 'none';
    }
  }

  function boot(opts) {
    /* THE ONE PLACE AN ADAPTER IS CHOSEN. Everything above this line is adapter-agnostic, and P1-B5
       replaced this single expression and touched no chart, no table and no rule — which is the
       whole reason the swap is believable: the renderer cannot tell live data from preview data,
       so it cannot be rendering them differently.

       The default is still the preview fixture, so opening index.html in a browser does exactly
       what it did before. A caller that passes an adapter gets that one; a caller that passes
       nothing in a page with no fixture loaded gets no board rather than an invented one. */
    opts = opts || {};
    ADAPTER = opts.adapter || (PREVIEW && PREVIEW.PreviewProductStrategyDataAdapter) || null;
    if (!ADAPTER) {
      throw new Error('psb-board-ui: no adapter. Pass one to PSB_BOARD.mount({adapter}) —'
        + ' there is no fixture fallback.');
    }

    /* BIND WHAT IS THERE. The prototype supplies all four; the Operation System shell supplies the
       navigation rail itself and has no self-test panel, and a board that threw over a missing
       navigation toggle would be a board that only runs in one host. Presentation and Print are
       board features (§8) and are bound wherever they exist. */
    function on(id, ev, fn) {
      var n = byId(id);
      if (n) n.addEventListener(ev, fn);
      return !!n;
    }
    on('btnRail', 'click', function () { STATE.rail = !STATE.rail; render(); });
    on('btnPresent', 'click', function () {
      STATE.presentation = !STATE.presentation;
      render();
    });
    on('btnPrint', 'click', function () {
      try { window.print(); } catch (e) {}
    });
    on('btnStDetail', 'click', function () {
      var s = byId('selftest');
      if (s) s.hidden = !s.hidden;
    });

    /* ---- CLOSING A POPOVER, THE THREE WAYS A PERSON EXPECTS -------------------------------------
       Escape anywhere, a click outside, or the control again. The document listeners are registered
       ONCE here rather than per popover: a handler added on every render is a handler removed on no
       render, and after a dozen re-renders one Escape would close the panel a dozen times over. */
    function anyPopoverOpen() {
      return STATE.openPopover !== null || STATE.catMenuOpen || STATE.moreFiltersOpen;
    }
    function closeAllPopovers() {
      STATE.openPopover = null;
      STATE.catMenuOpen = false;
      /* P1-B4 §3.6 — More filters closes the same three ways as everything else, from the same one
         pair of listeners. A component that registered its own would be a second rule to keep in
         step, and the drawer is deliberately NOT in this set: it is a workspace, not a popover, and
         Escape inside a form a person is filling in should not throw the form away. */
      STATE.moreFiltersOpen = false;
    }
    document.addEventListener('keydown', function (ev) {
      if (!ev || ev.key !== 'Escape') return;
      if (!anyPopoverOpen()) return;
      closeAllPopovers();
      render();
    });
    document.addEventListener('click', function () {
      /* The buttons that OPEN these stop the event before it reaches the document, so arriving here
         means the click landed somewhere else. */
      if (!anyPopoverOpen()) return;
      closeAllPopovers();
      render();
    });

    /* ---- ESCAPE LEAVES FULLSCREEN, and it is checked before the popovers because it is the
       bigger thing to be inside: a reader pressing Escape in a fullscreen chart means the chart. */
    document.addEventListener('keydown', function (ev) {
      if (!ev || ev.key !== 'Escape' || !STATE.fullscreen) return;
      toggleFullscreen();
    });

    exposeDevHooks();
    remeasure();
    render();
    observeContainer();
    /* THE SELF-TEST IS ABOUT THE PREVIEW FIXTURE, so it runs where the preview fixture is. It
       asserts the demonstration banner, the demonstration prices and the disabled Operation DB
       adapter — all true while the fixture is in use, none of them a statement about the board.
       Over live rows they would report that production data is not preview data, which is a suite
       measuring its own fixture's absence. */
    if (ADAPTER && ADAPTER.id === 'PREVIEW') {
      try { selfTest(); } catch (e) {
        ok(false, 'SELF-TEST THREW: ' + (e && e.message ? e.message : String(e)),
          String(e && e.stack || '').split('\n').slice(0, 3).join(' | '));
      }
      renderSelfTest();
    }
  }

  /* ------------------------------------------------------------------------------------------------
     TWO WAYS IN, AND THE DEFAULT IS THE ONE THAT ALREADY EXISTED.

     The prototype loads this file and the board appears, exactly as it has since P0 — no flag, no
     call, nothing for it to get wrong. A host that needs to fetch before it can render sets
     PSB_BOARD_DEFER first and calls mount() when its data has arrived, which is the ONLY way to
     give this renderer live rows: `load()` is synchronous by contract, so the asynchrony has to
     finish before mounting rather than during it.
     ------------------------------------------------------------------------------------------------ */
  var BOARD = {
    mount: function (opts) { return boot(opts); },
    /* Stated as data so a suite can assert the seam rather than grep for it. */
    CONTRACT: {
      adapter_is_an_argument: true,
      default_adapter: 'PREVIEW (prototype only)',
      fixture_fallback_when_an_adapter_is_given: false,
      /* P1-B7 — WAS 'PSB_BOARD_DEFER === true', WHICH MADE EVERY OTHER HOST CARRY A GLOBAL. The
         auto-boot exists so the prototype renders with no calling code, and what makes the
         prototype the prototype is that it loads a fixture. A host with no fixture and no call has
         not misconfigured anything; it has loaded a renderer it is not using yet, and answering
         that with a thrown exception at load meant every page in the Operation System threw for a
         feature that is switched off. */
      auto_mounts_when: 'a preview fixture is present AND PSB_BOARD_DEFER !== true',
      auto_mounts_unless: 'PSB_BOARD_DEFER === true || no preview fixture is loaded',
      /* Unchanged and deliberate: an explicit mount() with no adapter in a page with no fixture
         still throws. That is a caller asking for a board it has given no data for. */
      mount_without_adapter_or_fixture: 'throws'
    }
  };
  this.PSB_BOARD = BOARD;
  if (this.PSB_BOARD_DEFER !== true && PREVIEW && PREVIEW.PreviewProductStrategyDataAdapter) boot();
}).call(this);
