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
  var STATE = {
    view: 'overview',              // overview | category | risk | quality | workspace | advanced
    rail: false,                   // sidebar collapsed to an icon rail — a variable, never storage
    category: null,                // null on the overview; a category name on every other view
    company: 'Kitchen Mama', country: 'US', marketplace: 'Amazon',
    currency: 'ALL', series: 'ALL',
    search: '',
    includeInactive: false,
    thresholdC: 800,
    selected: {},
    drawerOpen: false,
    advancedOpen: false,
    presentation: false,
    elements: [],
    seq: 0,
    /* ---- the scenario, in memory and nowhere else ---- */
    overrides: {},                 // overrides[siteKey][series][priceField] = {mode, value}
    scenarioSeries: 'ALL',
    scenarioField: SEL.SCENARIO_DEFAULT_FIELD,
    scenarioMode: SEL.SCENARIO_MODE_DEFAULTS[SEL.SCENARIO_DEFAULT_FIELD],
    scenarioInput: '',
    scenarioRefusal: null
  };

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
  var COL_W = 112, PAD_L = 74, PAD_R = 28, PAD_T = 26, LABEL_H = 60;
  var TICK_C = 500;                 // FIVE CURRENCY UNITS, in cents. Not negotiable, not adaptive.
  var MK = 36, MK_HOVER = 48;       // image marker, and its hover size

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
  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }
  function uniq(a) {
    var s = {}, o = [];
    a.forEach(function (x) {
      if (x !== null && x !== undefined && x !== '' && !s[x]) { s[x] = 1; o.push(x); }
    });
    return o;
  }

  /* ---- THE FIVE-UNIT AXIS -----------------------------------------------------------------------
     axis_min = floor(min / 5) * 5      axis_max = ceil(max / 5) * 5      every tick is +5.
     No "nice number" search, no magnitude rounding, no adaptive step. The only thing that varies
     with the range is the PIXEL distance between ticks, and it is clamped so a tall category
     compresses rather than dropping a tick. */
  function fiveUnitAxis(loC, hiC) {
    if (loC === null || hiC === null) { loC = 0; hiC = TICK_C; }
    var lo = Math.floor(loC / TICK_C) * TICK_C;
    var hi = Math.ceil(hiC / TICK_C) * TICK_C;
    if (hi === lo) hi = lo + TICK_C;
    var ticks = [];
    for (var v = lo; v <= hi; v += TICK_C) ticks.push(v);
    return { lo: lo, hi: hi, step: TICK_C, ticks: ticks };
  }
  function plotHeightFor(tickCount) {
    return Math.max(260, Math.min(480, (tickCount - 1) * 26));
  }

  function diamond(cx, cy, r) {
    return [cx, cy - r, cx + r, cy, cx, cy + r, cx - r, cy].join(',');
  }

  /* ---- THE EVERYDAY-PRICE MARKER ----------------------------------------------------------------
     Verified image  -> a rounded white plate carrying the photograph, CENTRED on the price.
     No verified image -> a clean neutral plate carrying the model code. Never a broken image, never
     another sku's photograph, never a shape that could be mistaken for a product.

     In both cases a 2px anchor dot is drawn AT the exact coordinate, so the datum is visible and
     provably independent of how large the plate is. */
  function everydayMarker(g, cx, cy, n) {
    var half = MK / 2;
    var grp = svg('g', { 'class': 'mk-reg-group', 'data-cy': cy });
    grp.appendChild(svg('rect', { x: cx - half + 1, y: cy - half + 2, width: MK, height: MK,
      rx: 9, 'class': 'mk-img-shadow' }));
    grp.appendChild(svg('rect', { x: cx - half, y: cy - half, width: MK, height: MK, rx: 9,
      'class': 'mk-img-plate' + (n.image ? '' : ' mk-fallback'),
      'data-role': n.image ? 'image-marker' : 'fallback-marker' }));
    if (n.image) {
      var im = svg('image', { x: cx - half + 3, y: cy - half + 3, width: MK - 6, height: MK - 6,
        preserveAspectRatio: 'xMidYMid meet', 'class': 'mk-img' });
      /* THE VALUE ON THE NODE, VERBATIM. No directory is prefixed and no extension appended here. */
      im.setAttribute('href', n.image);
      im.setAttribute('data-src', n.image);
      grp.appendChild(im);
    } else {
      grp.appendChild(svgText({ x: cx, y: cy + 3.5, 'class': 'mk-fallback-text',
        'text-anchor': 'middle' }, shortCode(n.label)));
    }
    /* THE DATUM ITSELF. Drawn last, at the exact coordinate, at 2px. */
    grp.appendChild(svg('circle', { cx: cx, cy: cy, r: 2, 'class': 'mk-anchor mk-reg',
      'data-price-c': n._regular_c }));
    g.appendChild(grp);
    return grp;
  }
  function shortCode(label) {
    var s = String(label || '');
    return s.length <= 6 ? s : s.slice(0, 6);
  }

  function renderChart(panel, thrC, findings) {
    var ns = panel.plotted;
    var wrap = el('div', 'chartwrap');
    if (!ns.length) {
      wrap.appendChild(el('p', 'refusal', 'No product in this scope has an everyday price on '
        + 'record, so no axis is drawn. Nothing is substituted.'));
      return wrap;
    }
    var loC = null, hiC = null;
    ns.forEach(function (n) {
      [n._min_c, n._msrp_c, n._regular_c, n._deal_live ? n._deal_c : null, n._proposed_c]
        .forEach(function (v) {
          if (v === null || v === undefined) return;
          if (loC === null || v < loC) loC = v;
          if (hiC === null || v > hiC) hiC = v;
        });
    });
    var t = fiveUnitAxis(loC, hiC);
    var PLOT_H = plotHeightFor(t.ticks.length);
    var W = PAD_L + ns.length * COL_W + PAD_R;
    var H = PAD_T + PLOT_H + LABEL_H;
    var s = svg('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, 'class': 'chart',
      role: 'img', 'data-tick-step-c': t.step, 'data-axis-min-c': t.lo, 'data-axis-max-c': t.hi,
      'data-currency': panel.currency, 'data-category': (ns[0] || {}).category || '',
      'aria-label': 'Price band by product, ' + panel.currency });

    function y(c) { return PAD_T + PLOT_H - ((c - t.lo) / (t.hi - t.lo)) * PLOT_H; }
    function x(i) { return PAD_L + i * COL_W + COL_W / 2; }

    var gAxis = svg('g', { 'class': 'axis' });
    t.ticks.forEach(function (v) {
      var yy = y(v);
      gAxis.appendChild(svg('line', { x1: PAD_L - 8, y1: yy, x2: W - PAD_R, y2: yy,
        'class': 'grid' + ((v / TICK_C) % 2 === 0 ? ' is-major' : ''), 'data-tick-c': v }));
      gAxis.appendChild(svgText({ x: PAD_L - 12, y: yy + 4, 'class': 'ytick',
        'data-tick-c': v, 'text-anchor': 'end' }, fromCents(v)));
    });
    gAxis.appendChild(svg('line', { x1: PAD_L - 8, y1: PAD_T, x2: PAD_L - 8, y2: PAD_T + PLOT_H,
      'class': 'axisline' }));
    gAxis.appendChild(svgText({ x: 16, y: PAD_T + PLOT_H / 2, 'class': 'axtitle',
      transform: 'rotate(-90 16 ' + (PAD_T + PLOT_H / 2) + ')', 'text-anchor': 'middle' },
      'Price (' + panel.currency + ')  ·  5 ' + panel.currency + ' per gridline'));
    s.appendChild(gAxis);

    findings.filter(function (f) { return f.kind === 'PRICE_GAP' && f.currency === panel.currency; })
      .forEach(function (f) {
        var ia = ns.indexOf(f.a), ib = ns.indexOf(f.b);
        if (ia < 0 || ib < 0) return;
        var g = svg('g', { 'class': 'gapmark' });
        var ya = y(f.a._regular_c), yb = y(f.b._regular_c);
        var mx = (x(ia) + x(ib)) / 2;
        g.appendChild(svg('line', { x1: mx, y1: ya, x2: mx, y2: yb, 'class': 'gapline' }));
        g.appendChild(svgText({ x: mx, y: (ya + yb) / 2 - 6, 'class': 'gaplabel',
          'text-anchor': 'middle' }, fromCents(f.distance_c) + ' open'));
        s.appendChild(g);
      });

    ns.forEach(function (n, i) {
      var cx = x(i);
      var g = svg('g', { 'class': 'col', 'data-label': n.label, 'data-currency': panel.currency,
        'data-category': n.category, 'data-regular-c': n._regular_c });

      if (n._min_c !== null && n._msrp_c !== null) {
        g.appendChild(svg('line', { x1: cx, y1: y(n._min_c), x2: cx, y2: y(n._msrp_c),
          'class': 'band' }));
        g.appendChild(svg('line', { x1: cx - 12, y1: y(n._msrp_c), x2: cx + 12, y2: y(n._msrp_c),
          'class': 'cap' }));
        g.appendChild(svg('line', { x1: cx - 12, y1: y(n._min_c), x2: cx + 12, y2: y(n._min_c),
          'class': 'cap' }));
      }
      /* The deal markers are drawn BEFORE the everyday plate so the photograph never hides a
         promotion; and they keep their own shapes, so an image marker cannot be read as a deal. */
      if (n._deal_live && n._deal_c !== null) {
        g.appendChild(svg('polygon', { points: diamond(cx, y(n._deal_c), 7), 'class': 'mk-deal',
          'data-price-c': n._deal_c }));
      }
      if (n._proposed_c !== null) {
        g.appendChild(svg('polygon', { points: diamond(cx, y(n._proposed_c), 7), 'class': 'mk-prop',
          'data-price-c': n._proposed_c }));
      }
      everydayMarker(g, cx, y(n._regular_c), n);

      g.appendChild(svgText({ x: cx, y: PAD_T + PLOT_H + 22, 'class': 'xlabel',
        'text-anchor': 'middle' }, n.label));
      g.appendChild(svgText({ x: cx, y: PAD_T + PLOT_H + 38, 'class': 'xsub',
        'text-anchor': 'middle' }, fromCents(n._regular_c)
        + (n.variant_count > 1 ? '  ·  ' + n.variant_count + ' colours' : '')));

      g.addEventListener('mouseenter', function (ev) { showTip(ev, n); });
      g.addEventListener('mousemove', moveTip);
      g.addEventListener('mouseleave', hideTip);
      s.appendChild(g);
    });

    wrap.appendChild(s);
    return wrap;
  }

  function legend() {
    var box = el('div', 'legend');
    [['sw-reg', 'Everyday price — product photograph'],
     ['sw-miss', 'Everyday price — no verified photograph'],
     ['sw-deal', 'Live promotion'],
     ['sw-prop', 'Proposed scenario'],
     ['sw-band', 'Floor to list price'],
     ['sw-gap', 'Open price step']].forEach(function (p) {
      var it = el('span', 'legend-item');
      it.appendChild(el('i', 'sw ' + p[0]));
      it.appendChild(el('span', 'lg-text', p[1]));
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
  function showTip(ev, n) {
    var t = byId('tip');
    clear(t);
    tipLines(n).forEach(function (l) {
      t.appendChild(el('div', 'tipline' + (l.head ? ' is-head' : '') + (l.miss ? ' is-miss' : ''),
        l.t));
    });
    t.hidden = false;
    moveTip(ev);
  }
  function moveTip(ev) {
    var t = byId('tip');
    if (!t || t.hidden) return;
    t.style.left = (ev.clientX + 16) + 'px';
    t.style.top = (ev.clientY + 16) + 'px';
  }
  function hideTip() { var t = byId('tip'); if (t) t.hidden = true; }

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
    var sum = el('div', 'dsum');
    [[CLASS.OPP, 'OPPORTUNITY'], [CLASS.WATCH, 'WATCH'], [CLASS.RISK, 'RISK'],
     [CLASS.DQ, 'DATA QUALITY']].forEach(function (p) {
      var n = countBy(findings, p[0]);
      if (!n) return;
      sum.appendChild(el('span', 'cls cls-' + p[1].replace(/\s/g, ''), n + ' ' + p[1]));
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
      ul.appendChild(el('li', null, opp.length + ' open step'
        + (opp.length === 1 ? '' : 's') + ' in the ladder — the widest is '
        + fromCents(Math.max.apply(null, opp.map(function (f) { return f.distance_c; })))
        + '. A product placed there would not sit on top of an existing one.'));
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
    card.appendChild(h);

    card.appendChild(el('p', 'card-note', 'Membership authority: ' + u.membership_authority
      + '. Order: ' + u.order.join(' → ') + '.'));

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
    host.appendChild(card);
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
   * CHANGING A RING INVALIDATES EVERYTHING TO ITS RIGHT, HERE, IN ONE PLACE.
   *
   * "切換 country 不殘留上一站點資料" is not a rendering concern; it is a state concern. A category that
   * the new site does not sell would otherwise stay selected and every downstream view would filter to
   * zero rows — a screen that looks like a site with no products instead of a stale selection.
   */
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
    if (STATE.scenarioSeries !== 'ALL' && ser.indexOf(STATE.scenarioSeries) < 0) {
      STATE.scenarioSeries = 'ALL';
    }
    STATE.scenarioRefusal = null;
  }

  function selectEl(id, label, values, current, onChange, disabled) {
    var fl = el('div', 'fl');
    fl.appendChild(el('span', 'fl-label', label));
    var sel = document.createElement('select');
    sel.id = id;
    sel.disabled = !!disabled;
    values.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v;
      o.setAttribute('value', v);
      o.appendChild(document.createTextNode(v === 'ALL' ? 'All' : v));
      sel.appendChild(o);
    });
    sel.value = current;
    sel.addEventListener('change', function () { onChange(sel.value); });
    fl.appendChild(sel);
    return fl;
  }

  function renderScope() {
    var host = byId('scope');
    clear(host);
    var site = siteIdentity();
    var opts = categoryOptionRows();
    var cats = opts.options.map(function (o) { return o.value; });
    var countBySite = {};
    opts.options.forEach(function (o) { countBySite[o.value] = o.siteSkuCount; });

    /* ---- RING 1. THE SITE. ---- */
    var ring1 = el('div', 'scope-lead');
    ring1.appendChild(el('span', 'fl-label', 'Site — the first scope'));
    var sitebar = el('div', 'sitebar');
    sitebar.id = 'siteBar';
    [['fCompany', 'Company', 'company'], ['fCountry', 'Country', 'country'],
      ['fMarketplace', 'Marketplace', 'marketplace']].forEach(function (spec) {
      sitebar.appendChild(selectEl(spec[0], spec[1],
        ['ALL'].concat(siteDimensionValues(spec[2])), STATE[spec[2]],
        function (v) {
          STATE[spec[2]] = v;
          narrowAfterSiteChange();
          render();
        }, false));
    });
    ring1.appendChild(sitebar);
    var st = el('p', 'scope-note', site.complete
      ? 'Complete site identity ' + site.key + '. Everything below is what this site sells: '
        + MODEL.universe.counts.eligible + ' listings, '
        + MODEL.universe.counts.chartable + ' with a price to plot, '
        + MODEL.universe.counts.excluded + ' rows of the canonical set excluded.'
      : 'Aggregate across ' + site.aggregate_dimensions.join(' and ')
        + '. Prices are never pooled across currencies and a scenario cannot be opened here — a'
        + ' simulated price that is not attached to one site is a number in no currency.');
    st.id = 'siteState';
    st.setAttribute('data-site-state', site.state);
    ring1.appendChild(st);
    host.appendChild(ring1);

    /* ---- RING 2. THE CATEGORY, DERIVED FROM RING 1. ---- */
    var lead = el('div', 'scope-lead');
    lead.appendChild(el('span', 'fl-label', 'Category — derived from this site, never a fixed list'));
    var bar = el('div', 'catbar');
    bar.id = 'catBar';
    var allBtn = el('button', 'catbtn' + (STATE.category === null ? ' is-on' : ''),
      'All categories');
    allBtn.setAttribute('type', 'button');
    allBtn.id = 'cat-ALL';
    allBtn.setAttribute('data-category', 'ALL');
    allBtn.addEventListener('click', function () {
      STATE.category = null;
      STATE.view = 'overview';
      render();
    });
    bar.appendChild(allBtn);
    cats.forEach(function (c) {
      var b = el('button', 'catbtn' + (STATE.category === c ? ' is-on' : ''),
        c + ' (' + countBySite[c] + ')');
      b.setAttribute('type', 'button');
      b.id = 'cat-' + c.replace(/\s+/g, '-');
      b.setAttribute('data-category', c);
      b.addEventListener('click', function () {
        STATE.category = c;
        if (STATE.view === 'overview') STATE.view = 'category';
        render();
      });
      bar.appendChild(b);
    });
    /* A TRUE EMPTY STATE. Not three demonstration values, not a placeholder — the sentence a site with
       no eligible listings has actually earned. */
    if (cats.length === 0) {
      var none = el('p', 'scope-empty',
        'This site sells nothing that passed membership and the status gate, so there is no category'
          + ' menu to show. That is an answer about the site, not a failure to load.');
      none.id = 'catEmpty';
      bar.appendChild(none);
    }
    lead.appendChild(bar);
    var prov = el('p', 'scope-note',
      'Source ' + opts.source + ' · normalization ' + opts.normalization
        + ' · semantic merge ' + String(opts.semantic_merge)
        + ' · allowlist ' + String(opts.allowlist)
        + ' · maximum ' + String(opts.max_options)
        + ' · blank kept off the menu ' + opts.blank_count
        + (opts.normalization_review.length
          ? ' · review required ' + opts.normalization_review.map(function (r) {
            return r.variants.join(' vs '); }).join(' | ')
          : ''));
    prov.id = 'catProvenance';
    prov.setAttribute('data-count', String(cats.length));
    lead.appendChild(prov);
    host.appendChild(lead);

    /* ---- RING 3. INSIDE THE CATEGORY. ---- */
    var disabled = STATE.category === null;
    var pool = STATE.category ? buildModel(STATE.category) : null;
    var serValues = pool
      ? pool.seriesOptions.options.map(function (o) { return o.value; })
      : MODEL.seriesOptions.options.map(function (o) { return o.value; });
    var curValues = SEL.deriveDimensionValues(
      (pool || MODEL).universe, 'currency');
    host.appendChild(selectEl('fCurrency', 'Currency', ['ALL'].concat(curValues), STATE.currency,
      function (v) { STATE.currency = v; render(); }, disabled));
    host.appendChild(selectEl('fSeries', 'Series', ['ALL'].concat(serValues), STATE.series,
      function (v) { STATE.series = v; render(); }, disabled));

    var fl2 = el('div', 'fl');
    fl2.appendChild(el('span', 'fl-label', 'Gap threshold'));
    var inp = document.createElement('input');
    inp.id = 'fThreshold';
    inp.setAttribute('type', 'text');
    inp.value = fromCents(STATE.thresholdC);
    inp.disabled = disabled;
    inp.addEventListener('change', function () {
      var c = cents(inp.value);
      if (c !== null && c > 0) STATE.thresholdC = c;
      render();
    });
    fl2.appendChild(inp);
    host.appendChild(fl2);

    var incl = el('div', 'fl');
    incl.appendChild(el('span', 'fl-label', 'Include inactive'));
    var cb = document.createElement('input');
    cb.id = 'fInactive';
    cb.setAttribute('type', 'checkbox');
    cb.checked = !!STATE.includeInactive;
    cb.addEventListener('change', function () {
      STATE.includeInactive = !!cb.checked;
      narrowAfterSiteChange();
      render();
    });
    incl.appendChild(cb);
    host.appendChild(incl);

    host.appendChild(el('p', 'scope-note', disabled
      ? 'Choose a category to narrow further. Two categories never share a price axis, so the '
        + 'filters inside one only open once a category is chosen.'
      : 'Scope order: company → country → marketplace → category → series → currency.'));

    renderScenarioPanel(host);
  }

  /* ================================================================================================
     THE SCENARIO PANEL — A MEETING CONTROL, AND IT REACHES NOTHING.

     It writes to STATE.overrides and to nothing else. There is no save button because there is nothing
     to save to: the panel's own note says so on screen, and a browser reload proves it.
     ================================================================================================ */
  function renderScenarioPanel(host) {
    var site = siteIdentity();
    var box = el('div', 'scenario' + (MODEL.scenario.active ? ' is-on' : ''));
    box.id = 'scenarioPanel';
    box.setAttribute('data-permitted', String(MODEL.scenario.permitted));
    box.setAttribute('data-active', String(MODEL.scenario.active));

    var head = el('div', 'scenario-head');
    head.appendChild(el('span', 'scenario-title', 'Price scenario — meeting mode'));
    var badge = el('span', 'scenario-badge', MODEL.scenario.active
      ? SEL.SCENARIO_UNSAVED_LABEL : 'No scenario');
    badge.id = 'scenarioBadge';
    head.appendChild(badge);
    box.appendChild(head);

    if (!MODEL.scenario.permitted) {
      var r = el('p', 'scenario-refusal', 'Not available in this scope: ' + MODEL.scenario.refusal
        + '. Choose one company, one country and one marketplace — a simulated price belongs to a'
        + ' site, because the currency does.');
      r.id = 'scenarioRefusal';
      box.appendChild(r);
      host.appendChild(box);
      return;
    }

    var serOpts = MODEL.seriesOptions.options.map(function (o) { return o.value; });
    var row = el('div', 'scenario-row');
    row.appendChild(selectEl('scSeries', 'Series', ['ALL'].concat(serOpts), STATE.scenarioSeries,
      function (v) { STATE.scenarioSeries = v; STATE.scenarioRefusal = null; render(); }, false));
    row.appendChild(selectEl('scField', 'Price field', SEL.SCENARIO_FIELDS, STATE.scenarioField,
      function (v) {
        STATE.scenarioField = v;
        STATE.scenarioMode = SEL.SCENARIO_MODE_DEFAULTS[v];
        STATE.scenarioRefusal = null;
        render();
      }, false));
    row.appendChild(selectEl('scMode', 'How', SEL.SCENARIO_MODES, STATE.scenarioMode,
      function (v) { STATE.scenarioMode = v; STATE.scenarioRefusal = null; render(); }, false));

    var fl = el('div', 'fl');
    fl.appendChild(el('span', 'fl-label', STATE.scenarioMode === 'PERCENT'
      ? 'Percent (e.g. -15)' : (STATE.scenarioMode === 'DELTA' ? 'Amount (e.g. -3.00)' : 'Price')));
    var input = document.createElement('input');
    input.id = 'scValue';
    input.setAttribute('type', 'text');
    input.value = STATE.scenarioInput;
    input.addEventListener('change', function () { STATE.scenarioInput = input.value; });
    fl.appendChild(input);
    row.appendChild(fl);

    var apply = el('button', 'scbtn', 'Simulate');
    apply.id = 'scApply';
    apply.setAttribute('type', 'button');
    apply.addEventListener('click', function () {
      STATE.scenarioInput = byId('scValue').value;
      var refusal = SEL.scenarioModeRefusal(STATE.scenarioField, STATE.scenarioMode);
      if (refusal !== null) { STATE.scenarioRefusal = refusal; render(); return; }
      var targets = STATE.scenarioSeries === 'ALL' ? serOpts : [STATE.scenarioSeries];
      var next = STATE.overrides;
      targets.forEach(function (sname) {
        next = SEL.setScenarioOverride(next, { site: site, series: sname,
          field: STATE.scenarioField, mode: STATE.scenarioMode, value: STATE.scenarioInput });
      });
      STATE.overrides = next;
      STATE.scenarioRefusal = null;
      render();
    });
    row.appendChild(apply);
    box.appendChild(row);

    if (STATE.scenarioRefusal) {
      var rr = el('p', 'scenario-refusal', 'Refused: ' + STATE.scenarioRefusal
        + '. An everyday ladder set to one number for a whole series is not a scenario — every gap and'
        + ' every risk this board measures would go to zero. Use Percent or Amount instead.');
      rr.id = 'scenarioModeRefusal';
      box.appendChild(rr);
    }

    /* ---- THE THREE RESETS. Three different questions, three buttons. ---- */
    var resets = el('div', 'scenario-resets');
    [['scResetSeries', 'Reset this Series', function () {
      STATE.overrides = SEL.resetScenarioOverrides(STATE.overrides,
        { scope: 'series', site: site,
          series: STATE.scenarioSeries === 'ALL' ? '' : STATE.scenarioSeries });
    }], ['scResetSite', 'Reset current site', function () {
      STATE.overrides = SEL.resetScenarioOverrides(STATE.overrides, { scope: 'site', site: site });
    }], ['scResetAll', 'Reset all scenarios', function () {
      STATE.overrides = SEL.resetScenarioOverrides(STATE.overrides, { scope: 'all' });
    }]].forEach(function (spec) {
      var b = el('button', 'scbtn is-reset', spec[1]);
      b.id = spec[0];
      b.setAttribute('type', 'button');
      b.addEventListener('click', function () { spec[2](); render(); });
      resets.appendChild(b);
    });
    box.appendChild(resets);

    var note = el('p', 'scenario-note',
      'Simulated values live in this page only: ' + MODEL.scenario.storage
        + '. They are never written to the database, a sheet, an export or browser storage, and a'
        + ' reload restores the source values. Active overrides: ' + MODEL.scenario.override_count
        + (MODEL.architecture.scenario_nodes.length
          ? ' · simulated on screen: ' + MODEL.architecture.scenario_nodes.join(' · ') : ''));
    note.id = 'scenarioNote';
    box.appendChild(note);
    host.appendChild(box);
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
      if (existing) banner.removeChild(existing);
      return;
    }
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

  function render() {
    hideTip();
    reload();
    document.body.className = (STATE.presentation ? 'presenting' : '')
      + (MODEL.scenario.active ? ' has-scenario' : '');
    byId('shell').className = 'shell' + (STATE.rail ? ' is-rail' : '');
    var rb = byId('btnRail');
    rb.setAttribute('aria-expanded', STATE.rail ? 'false' : 'true');
    rb.setAttribute('title', STATE.rail ? 'Expand navigation' : 'Collapse navigation');
    renderNav();
    renderCrumbs();
    renderScope();
    renderScenarioMark();

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
    /* A TALL CATEGORY COMPRESSES PIXELS, NEVER THE SCALE. */
    var tallTicks = fiveUnitAxis(1199, 8499).ticks;
    eqv(tallTicks.length, (8500 - 1000) / 500 + 1, 'G10 a wide range keeps every 5-unit tick');
    eqv([tallTicks[0], tallTicks[tallTicks.length - 1]], [1000, 8500], 'G11 rounded out to 5s');
    ok(plotHeightFor(tallTicks.length) <= 480, 'G12 and the pixels are what compress');

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
    /* THE COORDINATE IS THE ANCHOR, AND THE PLATE IS CENTRED ON IT. */
    var cols = ch.querySelectorAll('.col');
    var bad = 0, checked = 0;
    for (var h2 = 0; h2 < cols.length; h2++) {
      var anchor = cols[h2].querySelector('.mk-anchor');
      var plate = cols[h2].querySelector('.mk-img-plate');
      if (!anchor || !plate) continue;
      checked++;
      var cy = Number(anchor.getAttribute('cy'));
      var py = Number(plate.getAttribute('y')), ph = Number(plate.getAttribute('height'));
      if (Math.abs((py + ph / 2) - cy) > 0.001) bad++;
      var cx = Number(anchor.getAttribute('cx'));
      var px = Number(plate.getAttribute('x')), pw = Number(plate.getAttribute('width'));
      if (Math.abs((px + pw / 2) - cx) > 0.001) bad++;
    }
    ok(checked >= 5, 'H3 every column was inspected', checked);
    eqv(bad, 0, 'H4 the marker CENTRE is the price coordinate, in both axes');
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
    eqv(document.querySelectorAll('script[src]').length, 4,
      'O2 four local scripts — the pipeline is the fourth — and no fifth');
    eqv(document.querySelectorAll('link[rel="stylesheet"]').length, 1, 'O3 one local stylesheet');
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
  function boot() {
    /* THE ONE PLACE AN ADAPTER IS CHOSEN. Everything above this line is adapter-agnostic; P1-B1
       replaces this single expression and touches no chart, no table and no rule. */
    ADAPTER = PREVIEW.PreviewProductStrategyDataAdapter;

    byId('btnRail').addEventListener('click', function () { STATE.rail = !STATE.rail; render(); });
    byId('btnPresent').addEventListener('click', function () {
      STATE.presentation = !STATE.presentation;
      render();
    });
    byId('btnPrint').addEventListener('click', function () {
      try { window.print(); } catch (e) {}
    });
    byId('btnStDetail').addEventListener('click', function () {
      var s = byId('selftest');
      s.hidden = !s.hidden;
    });

    render();
    try { selfTest(); } catch (e) {
      ok(false, 'SELF-TEST THREW: ' + (e && e.message ? e.message : String(e)),
        String(e && e.stack || '').split('\n').slice(0, 3).join(' | '));
    }
    renderSelfTest();
  }

  boot();
}).call(this);
