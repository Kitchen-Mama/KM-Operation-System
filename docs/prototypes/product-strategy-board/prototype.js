/* =============================================================================================
   Product Strategy Board — NON-RUNTIME INTERACTIVE PROTOTYPE (P0-R2)

   NO NETWORK: no fetch, no XMLHttpRequest, no WebSocket, no EventSource, no dynamic import,
   no remote URL. NO STORAGE: localStorage / sessionStorage / IndexedDB are never called; state
   lives in STATE for the lifetime of the page and reload clears it. NO PRODUCTION DATA PATH: no
   client data-access accessor is referenced and no Apps Script action is invoked.
   NO DEPENDENCY: the charts are hand-built inline SVG.

   Every price below is INVENTED SAMPLE DATA. Field names are the real ones from the design
   freeze section 4, so the prototype shows where each value would come from.

   WHAT THIS FILE IS FOR: the first-priority screen. Choose SKUs, read a real X/Y price band, and
   watch the gap / overlap / cannibalisation arithmetic move. It is not a drag engine and does not
   pretend to be one - see the tool rail note in index.html.
   ============================================================================================= */
(function () {
  'use strict';

  /* ==========================================================================================
     1. INTEGER CENTS. Every comparison and every piece of arithmetic in this file runs on
     integer cents, never on the decimal a sheet would hold.

     THIS IS A CORRECTNESS RULE AND THE PROTOTYPE FOUND ITS OWN COUNTEREXAMPLE. `32.99 - 24.99`
     is 8.000000000000004 in IEEE-754, so a step EXACTLY equal to a threshold of 8.00 satisfies
     `distance > threshold`, is reported as a gap, and then renders through two decimals as
     "gap 8.00 exceeds threshold 8.00" - a measurement that refutes itself on screen. Design
     freeze section 9.3.4 carries the rule; this is where it is obeyed.
     ========================================================================================== */
  function cents(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    if (!isFinite(n)) return null;
    return Math.round(n * 100);
  }
  function fromCents(c) { return c === null || c === undefined ? null : (c / 100).toFixed(2); }
  function money(c, cur) { return c === null ? '—' : fromCents(c) + (cur ? ' ' + cur : ''); }

  /* ==========================================================================================
     2. MOCK DATA.

     One row per operational site SKU, at the grain the design freeze established: identity and
     series from `sku_details`, scope and status from `marketplace_skus`, the three price levels
     from `pricing_list`, the official deal price from `campaign_sku_lines.promo_price`, and the
     proposal from a board-owned DEAL_PLAN element.

     DELIBERATELY ABSENT, AND NOT SUBSTITUTED (design freeze section 9.1):
       current selling price  D-6  no column carries it, and regular / selling / promo may not stand in
       margin                 D-8  no cost source exists, so any margin here would be a made-up cost
     ========================================================================================== */
  var MOCK = {
    note: 'INVENTED SAMPLE DATA. No row here corresponds to a real SKU, price or campaign.',
    rows: [
      // ---- Can Opener, ResUS / US / Amazon, USD. Ten plotted + one SOURCE_MISSING. -------------
      { sku: 'CO1105-R', product_name: 'Can Opener Lite', series: 'Can Opener',
        company: 'ResUS', country: 'US', marketplace: 'Amazon', currency: 'USD',
        marketplace_sku_status: 'active',
        minimum_price: 21.99, regular_price: 29.99, msrp: 34.99,
        official_deal_price: null, official_campaign: null, proposed_deal_price: null },
      { sku: 'CO1108-R', product_name: 'Can Opener Lite Plus', series: 'Can Opener',
        company: 'ResUS', country: 'US', marketplace: 'Amazon', currency: 'USD',
        marketplace_sku_status: 'active',
        minimum_price: 24.99, regular_price: 32.99, msrp: 37.99,
        official_deal_price: 27.99, official_campaign: 'Spring Reset 2027 (2027-03-01 - 2027-03-14)',
        proposed_deal_price: null },
      { sku: 'CO1100-R', product_name: 'Can Opener Classic', series: 'Can Opener',
        company: 'ResUS', country: 'US', marketplace: 'Amazon', currency: 'USD',
        marketplace_sku_status: 'active',
        minimum_price: 29.99, regular_price: 39.99, msrp: 49.99,
        official_deal_price: 31.99, official_campaign: 'Prime Day 2027 (2027-07-08 - 2027-07-09)',
        proposed_deal_price: null },
      { sku: 'CO1120-R', product_name: 'Can Opener Comfort', series: 'Can Opener',
        company: 'ResUS', country: 'US', marketplace: 'Amazon', currency: 'USD',
        marketplace_sku_status: 'active',
        minimum_price: 31.99, regular_price: 44.99, msrp: 54.99,
        official_deal_price: null, official_campaign: null,
        // The proposal that drives both the overlap and the cannibalisation finding (D-4).
        proposed_deal_price: 34.99 },
      { sku: 'CO1130-R', product_name: 'Can Opener Comfort Wide', series: 'Can Opener',
        company: 'ResUS', country: 'US', marketplace: 'Amazon', currency: 'USD',
        marketplace_sku_status: 'active',
        minimum_price: 34.99, regular_price: 47.99, msrp: 57.99,
        official_deal_price: 42.99, official_campaign: 'Prime Day 2027 (2027-07-08 - 2027-07-09)',
        proposed_deal_price: null },
      { sku: 'CO1150-R', product_name: 'Can Opener Soft Grip', series: 'Can Opener',
        company: 'ResUS', country: 'US', marketplace: 'Amazon', currency: 'USD',
        marketplace_sku_status: 'active',
        minimum_price: 37.99, regular_price: 49.99, msrp: 59.99,
        official_deal_price: null, official_campaign: null, proposed_deal_price: null },
      { sku: 'CO1160-R', product_name: 'Can Opener Steel', series: 'Can Opener',
        company: 'ResUS', country: 'US', marketplace: 'Amazon', currency: 'USD',
        marketplace_sku_status: 'phasing_out',
        minimum_price: 39.99, regular_price: 52.99, msrp: 62.99,
        official_deal_price: 46.99, official_campaign: 'Prime Day 2027 (2027-07-08 - 2027-07-09)',
        proposed_deal_price: null },
      { sku: 'CO1180-R', product_name: 'Can Opener Pro', series: 'Can Opener',
        company: 'ResUS', country: 'US', marketplace: 'Amazon', currency: 'USD',
        marketplace_sku_status: 'active',
        minimum_price: 44.99, regular_price: 59.99, msrp: 69.99,
        official_deal_price: 52.99, official_campaign: 'Prime Day 2027 (2027-07-08 - 2027-07-09)',
        proposed_deal_price: null },
      // A deliberate wide step above: 59.99 -> 74.99 is 15.00, well over the 8.00 threshold.
      { sku: 'CO1190-R', product_name: 'Can Opener Pro X', series: 'Can Opener',
        company: 'ResUS', country: 'US', marketplace: 'Amazon', currency: 'USD',
        marketplace_sku_status: 'active',
        minimum_price: 54.99, regular_price: 74.99, msrp: 84.99,
        official_deal_price: null, official_campaign: null, proposed_deal_price: 64.99 },
      { sku: 'CO1195-R', product_name: 'Can Opener Pro X Bundle', series: 'Can Opener',
        company: 'ResUS', country: 'US', marketplace: 'Amazon', currency: 'USD',
        marketplace_sku_status: 'active',
        minimum_price: 59.99, regular_price: 82.99, msrp: 94.99,
        official_deal_price: null, official_campaign: null, proposed_deal_price: null },
      // D-2 / section 15.6 - no pricing_list row. LISTED, NEVER PLOTTED, and never back-filled
      // from sku_details.selling_price: that is a master base input, not a site effective price.
      { sku: 'CO1140-R', product_name: 'Can Opener Grip', series: 'Can Opener',
        company: 'ResUS', country: 'US', marketplace: 'Amazon', currency: 'USD',
        marketplace_sku_status: 'active',
        minimum_price: null, regular_price: null, msrp: null,
        official_deal_price: null, official_campaign: null, proposed_deal_price: null,
        missing_reason: 'no pricing_list row for this marketplace_sku_id' },

      // ---- Can Opener, KM-EU / DE / Amazon, EUR. Its own axis, never compared across (D-3). ----
      { sku: 'CO1100-R', product_name: 'Can Opener Classic', series: 'Can Opener',
        company: 'KM-EU', country: 'DE', marketplace: 'Amazon', currency: 'EUR',
        marketplace_sku_status: 'active',
        minimum_price: 27.99, regular_price: 36.99, msrp: 44.99,
        official_deal_price: null, official_campaign: null, proposed_deal_price: null },
      { sku: 'CO1130-R', product_name: 'Can Opener Comfort Wide', series: 'Can Opener',
        company: 'KM-EU', country: 'DE', marketplace: 'Amazon', currency: 'EUR',
        marketplace_sku_status: 'active',
        minimum_price: 32.99, regular_price: 43.99, msrp: 52.99,
        official_deal_price: 38.99, official_campaign: 'DE Sommerangebot 2027 (2027-06-20 - 2027-06-27)',
        proposed_deal_price: null },
      { sku: 'CO1180-R', product_name: 'Can Opener Pro', series: 'Can Opener',
        company: 'KM-EU', country: 'DE', marketplace: 'Amazon', currency: 'EUR',
        marketplace_sku_status: 'active',
        minimum_price: 41.99, regular_price: 54.99, msrp: 64.99,
        official_deal_price: 47.99, official_campaign: 'DE Sommerangebot 2027 (2027-06-20 - 2027-06-27)',
        proposed_deal_price: null },

      // ---- Can Opener, KM-UK / GB / Amazon, GBP. A third axis. -----------------------------
      { sku: 'CO1100-R', product_name: 'Can Opener Classic', series: 'Can Opener',
        company: 'KM-UK', country: 'GB', marketplace: 'Amazon', currency: 'GBP',
        marketplace_sku_status: 'active',
        minimum_price: 23.99, regular_price: 31.99, msrp: 38.99,
        official_deal_price: null, official_campaign: null, proposed_deal_price: null },
      { sku: 'CO1180-R', product_name: 'Can Opener Pro', series: 'Can Opener',
        company: 'KM-UK', country: 'GB', marketplace: 'Amazon', currency: 'GBP',
        marketplace_sku_status: 'active',
        minimum_price: 37.99, regular_price: 47.99, msrp: 56.99,
        official_deal_price: 41.99, official_campaign: 'UK Summer 2027 (2027-06-15 - 2027-06-22)',
        proposed_deal_price: null },

      // ---- Jar Opener, a second Series so the Series selector changes the SKU universe. --------
      { sku: 'JO2100-R', product_name: 'Jar Opener Lite', series: 'Jar Opener',
        company: 'ResUS', country: 'US', marketplace: 'Amazon', currency: 'USD',
        marketplace_sku_status: 'active',
        minimum_price: 17.99, regular_price: 24.99, msrp: 29.99,
        official_deal_price: 19.99, official_campaign: 'Spring Reset 2027 (2027-03-01 - 2027-03-14)',
        proposed_deal_price: null },
      // 24.99 -> 32.99 is EXACTLY 8.00 against the default threshold. It must NOT be a gap.
      { sku: 'JO2140-R', product_name: 'Jar Opener Comfort', series: 'Jar Opener',
        company: 'ResUS', country: 'US', marketplace: 'Amazon', currency: 'USD',
        marketplace_sku_status: 'active',
        minimum_price: 24.99, regular_price: 32.99, msrp: 39.99,
        official_deal_price: null, official_campaign: null, proposed_deal_price: null },
      { sku: 'JO2180-R', product_name: 'Jar Opener Pro', series: 'Jar Opener',
        company: 'ResUS', country: 'US', marketplace: 'Amazon', currency: 'USD',
        marketplace_sku_status: 'active',
        minimum_price: 29.99, regular_price: 41.99, msrp: 49.99,
        official_deal_price: 37.99, official_campaign: 'Spring Reset 2027 (2027-03-01 - 2027-03-14)',
        proposed_deal_price: null },
      // A single-point touch: this SKU's deal equals JO2180-R's regular exactly. Intervals that
      // meet at one point are NOT an overlap, and that is asserted rather than assumed.
      { sku: 'JO2200-R', product_name: 'Jar Opener Pro Wide', series: 'Jar Opener',
        company: 'ResUS', country: 'US', marketplace: 'Amazon', currency: 'USD',
        marketplace_sku_status: 'active',
        minimum_price: 34.99, regular_price: 47.99, msrp: 56.99,
        official_deal_price: 41.99, official_campaign: 'Spring Reset 2027 (2027-03-01 - 2027-03-14)',
        proposed_deal_price: null },

      // ---- Bottle Opener, a third Series, and its two rows sit on different marketplaces. -----
      { sku: 'BO3100-R', product_name: 'Bottle Opener Classic', series: 'Bottle Opener',
        company: 'ResUS', country: 'US', marketplace: 'Amazon', currency: 'USD',
        marketplace_sku_status: 'active',
        minimum_price: 11.99, regular_price: 16.99, msrp: 19.99,
        official_deal_price: null, official_campaign: null, proposed_deal_price: null },
      { sku: 'BO3150-R', product_name: 'Bottle Opener Steel', series: 'Bottle Opener',
        company: 'ResUS', country: 'US', marketplace: 'Shopify', currency: 'USD',
        marketplace_sku_status: 'active',
        minimum_price: 14.99, regular_price: 21.99, msrp: 25.99,
        official_deal_price: null, official_campaign: null, proposed_deal_price: null }
    ],
    revisions: [
      { revision_id: 'PSR-01C4F8A2', revision_type: 'SAVE_CHECKPOINT', board_version: 1,
        author_type: 'HUMAN', created_by: 'vic', created_at: '2027-01-14 09:00' },
      { revision_id: 'PSR-5B2E9017', revision_type: 'FREEZE_SNAPSHOT', board_version: 6,
        author_type: 'HUMAN', created_by: 'vic', created_at: '2027-01-15 11:40' },
      { revision_id: 'PSR-A7440D3E', revision_type: 'SAVE_CHECKPOINT', board_version: 12,
        author_type: 'HUMAN', created_by: 'vic', created_at: '2027-01-19 14:22' }
    ]
  };

  /** One row, normalised: every money value converted ONCE into integer cents. */
  function norm(r, i) {
    return {
      idx: i,
      sku: r.sku, product_name: r.product_name, series: r.series,
      company: r.company, country: r.country, marketplace: r.marketplace,
      currency: r.currency, marketplace_sku_status: r.marketplace_sku_status,
      scope: r.company + '|' + r.country + '|' + r.marketplace,
      // The row key. pricing_list has no company column, so a site row is only addressable
      // through the full scope plus the sku (design freeze section 4.4).
      key: r.company + '|' + r.country + '|' + r.marketplace + '|' + r.sku,
      minimum_c: cents(r.minimum_price),
      regular_c: cents(r.regular_price),
      msrp_c: cents(r.msrp),
      official_deal_c: cents(r.official_deal_price),
      official_campaign: r.official_campaign || null,
      proposed_deal_c: cents(r.proposed_deal_price),
      missing_reason: r.missing_reason || null
    };
  }
  var ROWS = MOCK.rows.map(norm);

  /* ==========================================================================================
     3. STATE. In memory only. Reload clears it, by design.
     ========================================================================================== */
  var STATE = {
    series: 'Can Opener',
    company: 'All', country: 'All', marketplace: 'All',
    thresholdCents: 800,
    search: '',
    selected: {},
    boardVersion: 12,
    lastCheckpoint: '14:22',
    revisions: MOCK.revisions.slice(),
    revSeq: 0,
    elements: [],
    elSeq: 0,
    selectedElementId: null,
    selftest: null
  };

  /* ==========================================================================================
     4. SMALL DOM HELPERS
     ========================================================================================== */
  var SVGNS = 'http://www.w3.org/2000/svg';
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }
  function svg(tag, attrs) {
    var n = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, String(attrs[k])); });
    return n;
  }
  function byId(id) { return document.getElementById(id); }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function uniq(a) {
    var o = [], s = {};
    a.forEach(function (x) { if (!s[x]) { s[x] = 1; o.push(x); } });
    return o;
  }

  /* ==========================================================================================
     5. SELECTION UNIVERSE - what the filters actually filter.

     The Series selector changes the SKU universe; Company / Country / Marketplace narrow it. A
     row that leaves the universe also leaves the selection, so the chart can never plot a SKU
     the current filters exclude.
     ========================================================================================== */
  function universe() {
    return ROWS.filter(function (r) {
      return r.series === STATE.series
        && (STATE.company === 'All' || r.company === STATE.company)
        && (STATE.country === 'All' || r.country === STATE.country)
        && (STATE.marketplace === 'All' || r.marketplace === STATE.marketplace);
    });
  }
  function searchHits(rows) {
    var q = String(STATE.search || '').trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(function (r) {
      return r.sku.toLowerCase().indexOf(q) >= 0
        || r.product_name.toLowerCase().indexOf(q) >= 0;
    });
  }
  function selectedRows() {
    return universe().filter(function (r) { return STATE.selected[r.key] === true; });
  }
  /** Drop selections the current filters have removed from the universe. */
  function pruneSelection() {
    var live = {};
    universe().forEach(function (r) { live[r.key] = true; });
    Object.keys(STATE.selected).forEach(function (k) {
      if (!live[k]) delete STATE.selected[k];
    });
  }

  /* ==========================================================================================
     6. THE ANALYSIS ENGINE - pure, and every finding carries the number that produced it.

     D-3: currency is a HARD PARTITION. Members are split into one group per currency and nothing
     is ever compared across groups - not a gap, not an overlap, not a cannibalisation flag, and
     above all not an axis. No FX conversion is performed anywhere in this file.
     ========================================================================================== */
  function splitByCurrency(rows) {
    var plotted = [], missing = [], by = {}, order = [];
    rows.forEach(function (r) {
      if (r.regular_c === null) { missing.push(r); return; }   // D-2: listed, never plotted
      plotted.push(r);
      if (!by[r.currency]) { by[r.currency] = []; order.push(r.currency); }
      by[r.currency].push(r);
    });
    order.sort();
    return {
      panels: order.map(function (c) { return { currency: c, members: by[c] }; }),
      missing: missing, plotted_count: plotted.length
    };
  }

  /** The deal a member actually has, and whether it is official or a board proposal. */
  function dealOf(r) {
    if (r.official_deal_c !== null) {
      return { c: r.official_deal_c, kind: 'OFFICIAL', label: 'campaign_sku_lines.promo_price' };
    }
    if (r.proposed_deal_c !== null) {
      return { c: r.proposed_deal_c, kind: 'PROPOSAL', label: 'board-owned proposed_deal_price' };
    }
    return null;
  }

  function analyse(members, thrC) {
    var ms = members.slice().sort(function (a, b) {
      if (a.regular_c !== b.regular_c) return a.regular_c - b.regular_c;
      return a.sku < b.sku ? -1 : 1;
    });
    ms.forEach(function (m, i) {
      m._tier = ms.length === 1 ? 'only'
        : i === 0 ? 'entry' : i === ms.length - 1 ? 'premium' : 'core';
      m._deal = dealOf(m);
      // The member's price interval: from its deal price (if any) up to its regular price.
      m._lo = m._deal ? Math.min(m._deal.c, m.regular_c) : m.regular_c;
      m._hi = m.regular_c;
    });

    // GAP - adjacent regular prices further apart than the threshold. STRICTLY greater, in cents,
    // so a step exactly equal to the threshold is not a gap.
    var gaps = [];
    for (var i = 1; i < ms.length; i++) {
      var d = ms[i].regular_c - ms[i - 1].regular_c;
      if (d > thrC) gaps.push({ from: ms[i - 1], to: ms[i], distance_c: d, threshold_c: thrC });
    }

    // OVERLAP - two intervals sharing MORE THAN A SINGLE POINT. `lo < hi` in cents, so intervals
    // that merely touch are not an overlap.
    var overlaps = [];
    for (var a = 0; a < ms.length; a++) {
      for (var b = a + 1; b < ms.length; b++) {
        var lo = Math.max(ms[a]._lo, ms[b]._lo), hi = Math.min(ms[a]._hi, ms[b]._hi);
        if (lo < hi) {
          overlaps.push({ a: ms[a], b: ms[b], from_c: lo, to_c: hi, width_c: hi - lo,
            proposal_driven: !!((ms[a]._deal && ms[a]._deal.kind === 'PROPOSAL')
              || (ms[b]._deal && ms[b]._deal.kind === 'PROPOSAL')) });
        }
      }
    }

    // CANNIBALISATION - A's deal price at or below B's regular price, where B sits BELOW A in the
    // normal-price order. A flag driven by a proposal is labelled as such, so a warning caused by
    // an idea on this board is never read as a warning caused by a live campaign.
    var cann = [];
    ms.forEach(function (A, ia) {
      if (!A._deal) return;
      ms.forEach(function (B, ib) {
        if (ib >= ia) return;
        if (A._deal.c <= B.regular_c) {
          cann.push({ higher: A, lower: B, deal_c: A._deal.c, kind: A._deal.kind,
            headroom_c: B.regular_c - A._deal.c });
        }
      });
    });

    var loD = Math.min.apply(null, ms.map(function (m) {
      return Math.min(m.minimum_c === null ? m.regular_c : m.minimum_c, m._lo);
    }));
    var hiD = Math.max.apply(null, ms.map(function (m) {
      return Math.max(m.msrp_c === null ? m.regular_c : m.msrp_c, m.regular_c);
    }));
    return { members: ms, gaps: gaps, overlaps: overlaps, cannibalisation: cann,
      threshold_c: thrC, domain_lo_c: loD, domain_hi_c: hiD };
  }

  /* ==========================================================================================
     7. THE CHART. Hand-built inline SVG: X axis is SKU, Y axis is price, and ONE PANEL PER
     CURRENCY, because a shared axis across currencies is refused (D-3).
     ========================================================================================== */
  var COL_W = 78, PAD_L = 62, PAD_R = 22, PLOT_H = 300, PAD_T = 18, LABEL_H = 74;

  function niceTicks(loC, hiC) {
    var span = Math.max(hiC - loC, 100);
    var pad = Math.round(span * 0.08);
    var lo = Math.max(0, loC - pad), hi = hiC + pad;
    var steps = [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000];
    var step = steps[steps.length - 1];
    for (var i = 0; i < steps.length; i++) {
      if ((hi - lo) / steps[i] <= 7) { step = steps[i]; break; }
    }
    var t0 = Math.floor(lo / step) * step, t1 = Math.ceil(hi / step) * step;
    var ticks = [];
    for (var v = t0; v <= t1 + 1; v += step) ticks.push(v);
    return { lo: t0, hi: t1, step: step, ticks: ticks };
  }

  function diamond(cx, cy, r) {
    return [cx + ',' + (cy - r), (cx + r) + ',' + cy,
      cx + ',' + (cy + r), (cx - r) + ',' + cy].join(' ');
  }

  function renderPanel(panel, thrC, opts) {
    opts = opts || {};
    var A = analyse(panel.members, thrC);
    var n = A.members.length;
    var sc = niceTicks(A.domain_lo_c, A.domain_hi_c);
    var W = PAD_L + n * COL_W + PAD_R;
    var H = PAD_T + PLOT_H + LABEL_H;
    function y(c) { return PAD_T + PLOT_H - ((c - sc.lo) / (sc.hi - sc.lo)) * PLOT_H; }
    function x(i) { return PAD_L + i * COL_W + COL_W / 2; }

    var wrap = el('div', 'panel');
    wrap.setAttribute('data-currency', panel.currency);

    var head = el('div', 'panel-head');
    head.appendChild(el('span', 'panel-cur', panel.currency));
    head.appendChild(el('span', 'panel-meta',
      n + (n === 1 ? ' SKU' : ' SKUs') + ' plotted · axis '
      + fromCents(sc.lo) + '–' + fromCents(sc.hi) + ' ' + panel.currency));
    head.appendChild(el('span', 'panel-thr',
      'gap threshold ' + fromCents(thrC) + ' ' + panel.currency));
    wrap.appendChild(head);

    var scroll = el('div', 'panel-scroll');
    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H,
      'class': 'chart', role: 'img',
      'aria-label': 'Price band for ' + STATE.series + ' in ' + panel.currency });

    // ---- Y axis: gridlines, ticks, labels, axis title ---------------------------------------
    var gy = svg('g', { 'class': 'y-axis' });
    sc.ticks.forEach(function (t) {
      gy.appendChild(svg('line', { 'class': 'grid', x1: PAD_L - 6, x2: W - PAD_R + 4,
        y1: y(t), y2: y(t) }));
      var tl = svg('text', { 'class': 'y-tick', x: PAD_L - 10, y: y(t) + 3.5,
        'text-anchor': 'end' });
      tl.textContent = fromCents(t);
      gy.appendChild(tl);
    });
    var yt = svg('text', { 'class': 'axis-title', x: 12, y: PAD_T + PLOT_H / 2,
      transform: 'rotate(-90 12 ' + (PAD_T + PLOT_H / 2) + ')', 'text-anchor': 'middle' });
    yt.textContent = 'Price (' + panel.currency + ')';
    gy.appendChild(yt);
    s.appendChild(gy);
    s.appendChild(svg('line', { 'class': 'axis', x1: PAD_L - 6, x2: PAD_L - 6,
      y1: PAD_T, y2: PAD_T + PLOT_H }));
    s.appendChild(svg('line', { 'class': 'axis', x1: PAD_L - 6, x2: W - PAD_R + 4,
      y1: PAD_T + PLOT_H, y2: PAD_T + PLOT_H }));

    // ---- one column per SKU -----------------------------------------------------------------
    A.members.forEach(function (m, i) {
      var cx = x(i);
      var g = svg('g', { 'class': 'col', 'data-sku': m.sku, 'data-key': m.key,
        tabindex: '0', role: 'button',
        'aria-label': m.sku + ' ' + m.product_name + ', regular ' + money(m.regular_c, panel.currency) });

      // the price band: minimum_price up to MSRP
      if (m.minimum_c !== null && m.msrp_c !== null) {
        g.appendChild(svg('line', { 'class': 'band', x1: cx, x2: cx,
          y1: y(m.minimum_c), y2: y(m.msrp_c) }));
        g.appendChild(svg('line', { 'class': 'cap', x1: cx - 11, x2: cx + 11,
          y1: y(m.msrp_c), y2: y(m.msrp_c) }));
        g.appendChild(svg('line', { 'class': 'floor', x1: cx - 11, x2: cx + 11,
          y1: y(m.minimum_c), y2: y(m.minimum_c) }));
      }
      // official deal price - filled diamond, only when campaign_sku_lines.promo_price exists
      if (m.official_deal_c !== null) {
        g.appendChild(svg('polygon', { 'class': 'mk-deal',
          points: diamond(cx, y(m.official_deal_c), 6) }));
      }
      // proposed deal price - dashed hollow diamond, never the same shape as an official one
      if (m.proposed_deal_c !== null) {
        g.appendChild(svg('polygon', { 'class': 'mk-prop',
          points: diamond(cx, y(m.proposed_deal_c), 7) }));
      }
      // regular price - the band basis (D-2), the primary marker
      g.appendChild(svg('circle', { 'class': 'mk-reg', cx: cx, cy: y(m.regular_c), r: 5.5 }));

      var tier = svg('text', { 'class': 'tier tier--' + m._tier, x: cx,
        y: PAD_T + PLOT_H + 14, 'text-anchor': 'middle' });
      tier.textContent = m._tier;
      g.appendChild(tier);
      var lab = svg('text', { 'class': 'x-label', x: cx, y: PAD_T + PLOT_H + 26,
        transform: 'rotate(38 ' + cx + ' ' + (PAD_T + PLOT_H + 26) + ')' });
      lab.textContent = m.sku;
      g.appendChild(lab);

      var ttl = svg('title');
      ttl.textContent = tipText(m, panel.currency);
      g.appendChild(ttl);

      g.addEventListener('mouseenter', function (ev) { showTip(ev, m, panel.currency); });
      g.addEventListener('mousemove', function (ev) { moveTip(ev); });
      g.addEventListener('mouseleave', hideTip);
      g.addEventListener('focus', function () { renderDetails(m, panel.currency); });
      g.addEventListener('click', function () { renderDetails(m, panel.currency); });
      s.appendChild(g);
    });

    // ---- analysis overlays, drawn where the findings are ------------------------------------
    var ov = svg('g', { 'class': 'overlays' });
    A.gaps.forEach(function (gp) {
      var i1 = A.members.indexOf(gp.from), i2 = A.members.indexOf(gp.to);
      var xm = (x(i1) + x(i2)) / 2;
      ov.appendChild(svg('line', { 'class': 'gap-bar', x1: x(i1), x2: x(i2),
        y1: y(gp.from.regular_c), y2: y(gp.to.regular_c) }));
      var gl = svg('text', { 'class': 'gap-label', x: xm,
        y: (y(gp.from.regular_c) + y(gp.to.regular_c)) / 2 - 6, 'text-anchor': 'middle' });
      gl.textContent = 'gap ' + fromCents(gp.distance_c) + ' > thr ' + fromCents(gp.threshold_c);
      ov.appendChild(gl);
    });
    A.overlaps.forEach(function (o) {
      var i1 = A.members.indexOf(o.a), i2 = A.members.indexOf(o.b);
      var xl = Math.min(x(i1), x(i2)), xr = Math.max(x(i1), x(i2));
      ov.appendChild(svg('rect', {
        'class': 'ov-box' + (o.proposal_driven ? ' ov-box--prop' : ''),
        x: xl, y: y(o.to_c), width: Math.max(xr - xl, 6),
        height: Math.max(y(o.from_c) - y(o.to_c), 3) }));
    });
    s.appendChild(ov);

    scroll.appendChild(s);
    wrap.appendChild(scroll);

    // ---- legend ------------------------------------------------------------------------------
    var lg = el('div', 'legend');
    [['mk-reg', 'regular_price', 'pricing_list.regular_price - the one band basis (D-2)'],
     ['mk-deal', 'official deal', 'campaign_sku_lines.promo_price - the only authoritative deal price'],
     ['mk-prop', 'proposed deal', 'board-owned proposal (D-4) - never official, never written back'],
     ['sw-band', 'minimum to MSRP', 'the vertical price band: pricing_list.minimum_price up to msrp'],
     ['sw-gap', 'gap', 'adjacent regular prices further apart than the displayed threshold'],
     ['sw-ov', 'overlap', 'two [deal, regular] intervals sharing MORE THAN a single point']
    ].forEach(function (row) {
      var it = el('span', 'legend-item');
      it.appendChild(el('span', 'sw ' + row[0]));
      it.appendChild(el('b', null, row[1]));
      it.appendChild(document.createTextNode(' - ' + row[2]));
      lg.appendChild(it);
    });
    var tiers = el('span', 'legend-item');
    tiers.appendChild(el('b', null, 'entry / core / premium'));
    tiers.appendChild(document.createTextNode(
      ' - positions in the sorted list, computed here. No tier column exists (section 3.5).'));
    lg.appendChild(tiers);
    wrap.appendChild(lg);

    // ---- findings, each carrying its own arithmetic -----------------------------------------
    var f = el('div', 'findings');
    A.gaps.forEach(function (gp) {
      var d = el('div', 'finding finding--gap');
      d.appendChild(el('b', null, 'GAP '));
      d.appendChild(document.createTextNode(gp.from.sku + ' → ' + gp.to.sku + ' = '
        + fromCents(gp.distance_c) + ' ' + panel.currency + ' '));
      d.appendChild(el('span', 'why', '- exceeds the gap threshold '
        + fromCents(gp.threshold_c) + ', which is displayed because a gap marking whose threshold'
        + ' is invisible is an opinion presented as a measurement'));
      f.appendChild(d);
    });
    A.overlaps.forEach(function (o) {
      var d = el('div', 'finding finding--over');
      d.appendChild(el('b', null, 'OVERLAP '));
      d.appendChild(document.createTextNode(o.a.sku + ' ∩ ' + o.b.sku + ' over '
        + fromCents(o.from_c) + '–' + fromCents(o.to_c) + ' ' + panel.currency + ' '));
      d.appendChild(el('span', 'why', o.proposal_driven
        ? '- PROPOSAL-DRIVEN: caused by a proposed deal price on this board, not by a live campaign'
        : '- both intervals are live'));
      f.appendChild(d);
    });
    A.cannibalisation.forEach(function (c) {
      var d = el('div', 'finding finding--cann');
      d.appendChild(el('b', null, 'CANNIBALISATION '));
      d.appendChild(document.createTextNode(c.higher.sku + ' deal ' + fromCents(c.deal_c)
        + ' ≤ ' + c.lower.sku + ' regular ' + fromCents(c.lower.regular_c) + ' '
        + panel.currency + ' '));
      d.appendChild(el('span', 'why', c.kind === 'PROPOSAL'
        ? '- PROPOSAL-DRIVEN: this warning comes from an idea on this board, not from a live campaign'
        : '- from a live campaign price'));
      f.appendChild(d);
    });
    if (!f.childNodes.length) {
      f.appendChild(el('div', 'finding',
        'No gap, overlap or cannibalisation finding in this currency at threshold '
        + fromCents(thrC) + '.'));
    }
    wrap.appendChild(f);

    if (opts.missing && opts.missing.length) wrap.appendChild(renderMissing(opts.missing));
    return wrap;
  }

  function renderMissing(missing) {
    var np = el('div', 'notplotted');
    np.appendChild(el('h4', null,
      'SOURCE_MISSING - listed, plotted nowhere (' + missing.length + ')'));
    var ul = el('ul');
    missing.forEach(function (m) {
      var li = el('li');
      li.appendChild(el('strong', null, m.sku));
      li.appendChild(document.createTextNode(' ' + m.product_name + ' - ' + m.scope + ' - '
        + (m.missing_reason || 'no pricing_list.regular_price') + '. '));
      li.appendChild(el('em', null, 'Not back-filled from sku_details.selling_price: that is a'
        + ' master base input, not a site effective price, and a substituted point would render'
        + ' identically to a measured one.'));
      ul.appendChild(li);
    });
    np.appendChild(ul);
    return np;
  }

  /* ---------------------------------------------------------------- tooltip + details ------- */
  function tipText(m, cur) {
    var L = [m.sku + ' - ' + m.product_name, m.scope + ' · ' + m.marketplace_sku_status,
      'MSRP            ' + money(m.msrp_c, cur),
      'regular_price   ' + money(m.regular_c, cur),
      'minimum_price   ' + money(m.minimum_c, cur)];
    if (m.official_deal_c !== null) {
      L.push('official deal   ' + money(m.official_deal_c, cur));
      if (m.official_campaign) L.push('  ' + m.official_campaign);
    } else {
      L.push('official deal   SOURCE_MISSING (never "no deal")');
    }
    if (m.proposed_deal_c !== null) {
      L.push('PROPOSED deal   ' + money(m.proposed_deal_c, cur) + '  (board-owned, not a Deal)');
    }
    L.push('band            ' + money(m.minimum_c, '') + ' – ' + money(m.msrp_c, cur));
    L.push('position        ' + (m._tier || '—'));
    L.push('current selling price / margin: not shown (D-6 / D-8)');
    return L.join('\n');
  }
  function showTip(ev, m, cur) {
    var t = byId('tip');
    if (!t) return;
    t.textContent = tipText(m, cur);
    t.hidden = false;
    moveTip(ev);
  }
  function moveTip(ev) {
    var t = byId('tip');
    if (!t || t.hidden) return;
    t.style.left = ((ev.clientX === undefined ? 0 : ev.clientX) + 14) + 'px';
    t.style.top = ((ev.clientY === undefined ? 0 : ev.clientY) + 14) + 'px';
  }
  function hideTip() { var t = byId('tip'); if (t) t.hidden = true; }

  function renderDetails(m, cur) {
    STATE.selectedElementId = null;
    var host = byId('propsBody');
    clear(host);
    var top = el('div');
    top.appendChild(el('span', 'props-el', 'SKU price detail'));
    host.appendChild(top);

    var s1 = el('div', 'props-sec');
    s1.appendChild(el('h4', null, m.sku + '  ' + cur));
    var dl = el('dl', 'props-kv');
    [['product', m.product_name], ['series', m.series], ['scope', m.scope],
     ['status', m.marketplace_sku_status],
     ['msrp', money(m.msrp_c, '')], ['regular', money(m.regular_c, '')],
     ['minimum', money(m.minimum_c, '')],
     ['official deal', m.official_deal_c === null ? 'SOURCE_MISSING' : money(m.official_deal_c, '')],
     ['proposed deal', m.proposed_deal_c === null ? '—' : money(m.proposed_deal_c, '')],
     ['position', m._tier || '—']].forEach(function (p) {
      dl.appendChild(el('dt', null, p[0]));
      dl.appendChild(el('dd', null, p[1]));
    });
    s1.appendChild(dl);
    host.appendChild(s1);

    if (m.official_campaign) {
      var s2 = el('div', 'props-sec');
      s2.appendChild(el('h4', null, 'Campaign'));
      s2.appendChild(el('p', 'props-note', m.official_campaign));
      host.appendChild(s2);
    }

    var s3 = el('div', 'props-sec');
    s3.appendChild(el('h4', null, 'Provenance'));
    var pl = el('dl', 'props-kv');
    [['regular', 'pricing_list.regular_price'], ['minimum', 'pricing_list.minimum_price'],
     ['msrp', 'pricing_list.msrp'], ['official deal', 'campaign_sku_lines.promo_price'],
     ['status', 'marketplace_skus.marketplace_sku_status'],
     ['proposed deal', 'board-owned DEAL_PLAN content_json']].forEach(function (p) {
      pl.appendChild(el('dt', null, p[0]));
      var dd = el('dd');
      dd.appendChild(el('code', null, p[1]));
      pl.appendChild(dd);
    });
    s3.appendChild(pl);
    s3.appendChild(el('p', 'props-note', 'Three tables supply one card, which is why a frozen'
      + ' snapshot records the column behind every number (section 8.2).'));
    host.appendChild(s3);

    var s4 = el('div', 'props-sec');
    s4.appendChild(el('h4', null, 'Deliberately absent'));
    s4.appendChild(el('p', 'props-note', 'current selling price (D-6) and margin (D-8) are GAPs.'
      + ' No field stands in for either - not blank, not zero, not a substitute.'));
    host.appendChild(s4);
  }

  /* ==========================================================================================
     8. RENDER: the SKU selector, the chart area, the board, the properties panel
     ========================================================================================== */
  function renderSkuPicker() {
    var uni = universe();
    var shown = searchHits(uni);
    var host = byId('skuList');
    clear(host);
    byId('skuCount').textContent = selectedRows().length + ' / ' + uni.length
      + (shown.length !== uni.length ? ' (' + shown.length + ' shown)' : '');
    if (!shown.length) {
      host.appendChild(el('p', 'skupick-empty',
        uni.length ? 'No SKU matches this search.' : 'No SKU matches these filters.'));
      return;
    }
    shown.forEach(function (r) {
      var row = el('label', 'skurow' + (r.regular_c === null ? ' skurow--missing' : ''));
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'skucb';
      cb.value = r.key;
      cb.setAttribute('data-sku', r.sku);
      cb.setAttribute('data-key', r.key);
      cb.checked = STATE.selected[r.key] === true;
      cb.addEventListener('change', function () {
        if (this.checked) STATE.selected[r.key] = true; else delete STATE.selected[r.key];
        renderSkuPicker();
        renderCharts();
      });
      row.appendChild(cb);
      var txt = el('span', 'skurow-txt');
      txt.appendChild(el('span', 'skurow-sku', r.sku));
      txt.appendChild(el('span', 'skurow-name', r.product_name));
      var meta = el('span', 'skurow-meta');
      meta.appendChild(el('span', 'skurow-cur', r.currency));
      meta.appendChild(document.createTextNode(' ' + r.country + '/' + r.marketplace + ' '));
      if (r.regular_c === null) {
        meta.appendChild(el('span', 'badge badge--miss', 'SOURCE_MISSING'));
      } else {
        meta.appendChild(el('span', 'skurow-price', fromCents(r.regular_c)));
      }
      txt.appendChild(meta);
      row.appendChild(txt);
      host.appendChild(row);
    });
  }

  function renderCharts() {
    var host = byId('charts');
    clear(host);
    var rows = selectedRows();
    if (!rows.length) {
      var e = el('div', 'charts-empty');
      e.appendChild(el('h3', null, 'No SKU selected'));
      e.appendChild(el('p', null, 'Tick SKUs on the left, or press Select all. The X axis is built'
        + ' from the ticked SKUs and updates immediately.'));
      host.appendChild(e);
      return;
    }
    var sp = splitByCurrency(rows);
    if (sp.panels.length > 1) {
      var ref = el('div', 'refusal');
      ref.appendChild(el('code', null, 'MIXED_CURRENCY_COMPARISON_REFUSED'));
      ref.appendChild(document.createTextNode('  ' + sp.panels.map(function (p) {
        return p.currency + ' (' + p.members.length + ')'; }).join(' · ')));
      ref.appendChild(el('p', null, 'The selection resolves to more than one currency, so it splits'
        + ' into one panel per currency, each with its own Y axis and its own domain. No shared axis'
        + ' is drawn and no FX conversion is performed - D-3, and P0 decided no FX policy. Gaps,'
        + ' overlaps, cannibalisation and entry/core/premium are computed WITHIN a panel only.'));
      host.appendChild(ref);
    }
    if (!sp.panels.length) {
      var only = el('div', 'panel');
      only.appendChild(el('div', 'panel-head', 'Nothing to plot'));
      only.appendChild(renderMissing(sp.missing));
      host.appendChild(only);
      return;
    }
    sp.panels.forEach(function (p, i) {
      host.appendChild(renderPanel(p, STATE.thresholdCents,
        { missing: i === sp.panels.length - 1 ? sp.missing : null }));
    });
  }

  /* ---------------------------------------------------------------- board elements ---------- */
  function addElement(type) {
    STATE.elSeq += 1;
    var id = 'PSE-PROTO-' + String(STATE.elSeq);
    var e = { element_id: id, element_type: type, author_type: 'HUMAN',
      created_by: 'vic', version: 1, content: {} };
    if (type === 'TEXT_NOTE') {
      e.content = { title: 'Note ' + STATE.elSeq,
        text: 'Positioning / target price / strategy reason / risk / to-do...' };
    } else if (type === 'SERIES_PRICE_BAND') {
      e.content = { series: STATE.series,
        keys: selectedRows().map(function (r) { return r.key; }),
        threshold_c: STATE.thresholdCents };
    } else if (type === 'MATRIX') {
      e.content = { x_axis: 'Price', y_axis: 'Product Tier', cells: [['', ''], ['', '']] };
    }
    STATE.elements.push(e);
    STATE.selectedElementId = id;
    renderBoard();
    renderElementProps(e);
    return e;
  }
  function removeElement(id) {
    STATE.elements = STATE.elements.filter(function (e) { return e.element_id !== id; });
    if (STATE.selectedElementId === id) STATE.selectedElementId = null;
    renderBoard();
    var host = byId('propsBody');
    clear(host);
    host.appendChild(el('p', 'props-empty',
      'Element deleted. Click a SKU column or another element.'));
  }

  function elCardShell(e, title) {
    var card = el('div', 'el el--' + e.element_type.toLowerCase().replace(/_/g, '-'));
    card.setAttribute('data-element-id', e.element_id);
    card.setAttribute('data-element-type', e.element_type);
    if (STATE.selectedElementId === e.element_id) card.className += ' is-selected';
    var head = el('div', 'el-head');
    head.appendChild(el('span', 'el-type', e.element_type));
    head.appendChild(el('span', 'el-title', title));
    head.appendChild(el('span', 'el-id', e.element_id));
    var del = el('button', 'el-del', '×');
    del.type = 'button';
    del.title = 'Delete this prototype element';
    del.setAttribute('aria-label', 'Delete ' + e.element_id);
    del.addEventListener('click', function (ev) {
      ev.stopPropagation();
      removeElement(e.element_id);
    });
    head.appendChild(del);
    card.appendChild(head);
    card.addEventListener('click', function () {
      STATE.selectedElementId = e.element_id;
      renderBoard();
      renderElementProps(e);
    });
    return card;
  }

  function renderTextEl(e, host) {
    var c = elCardShell(e, e.content.title);
    var ta = document.createElement('textarea');
    ta.className = 'note-edit';
    ta.value = e.content.text;
    ta.setAttribute('aria-label', 'Note text for ' + e.element_id);
    ta.addEventListener('input', function () { e.content.text = this.value; e.version += 1; });
    c.appendChild(ta);
    c.appendChild(el('div', 'src-note',
      'Board-owned content. It has no path to any source table.'));
    host.appendChild(c);
  }

  function renderBandEl(e, host) {
    var c = elCardShell(e, e.content.series + ' — price band');
    var rows = ROWS.filter(function (r) { return e.content.keys.indexOf(r.key) >= 0; });
    if (!rows.length) {
      c.appendChild(el('p', 'src-note', 'This element was created with no SKU selected, so there is'
        + ' nothing to plot. Tick SKUs above and add another one.'));
    } else {
      var sp = splitByCurrency(rows);
      if (sp.panels.length > 1) {
        var r = el('div', 'refusal refusal--sm');
        r.appendChild(el('code', null, 'MIXED_CURRENCY_COMPARISON_REFUSED'));
        c.appendChild(r);
      }
      sp.panels.forEach(function (p, i) {
        c.appendChild(renderPanel(p, e.content.threshold_c,
          { missing: i === sp.panels.length - 1 ? sp.missing : null }));
      });
    }
    c.appendChild(el('div', 'src-note', 'A snapshot of the selection at the moment it was added: '
      + e.content.keys.length + ' SKU key(s), threshold ' + fromCents(e.content.threshold_c)
      + '. Changing the selector above does not rewrite it.'));
    host.appendChild(c);
  }

  function renderMatrixEl(e, host) {
    var c = elCardShell(e, 'Matrix 2×2');
    var ax = el('div', 'mx-axes');
    [['x_axis', 'X axis'], ['y_axis', 'Y axis']].forEach(function (p) {
      var lab = el('label', 'mx-axis');
      lab.appendChild(el('span', null, p[1]));
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'mx-axis-input';
      inp.value = e.content[p[0]];
      inp.setAttribute('data-axis', p[0]);
      inp.setAttribute('aria-label', p[1] + ' name for ' + e.element_id);
      inp.addEventListener('input', function () {
        e.content[p[0]] = this.value;
        e.version += 1;
        var h = c.querySelector('.mx-head-' + p[0]);
        if (h) h.textContent = this.value;
      });
      lab.appendChild(inp);
      ax.appendChild(lab);
    });
    c.appendChild(ax);
    var t = el('table', 'mx');
    var thead = el('thead'), hr = el('tr');
    hr.appendChild(el('th', 'mx-corner', ''));
    var hx = el('th', 'mx-head-x_axis', e.content.x_axis);
    hx.setAttribute('colspan', '2');
    hr.appendChild(hx);
    thead.appendChild(hr);
    t.appendChild(thead);
    var tb = el('tbody');
    ['low', 'high'].forEach(function (rowName, ri) {
      var tr = el('tr');
      tr.appendChild(el('th', ri === 0 ? 'mx-head-y_axis' : null,
        ri === 0 ? e.content.y_axis : rowName));
      [0, 1].forEach(function (ci) {
        var td = el('td');
        var inp2 = document.createElement('input');
        inp2.type = 'text';
        inp2.className = 'mx-cell';
        inp2.value = e.content.cells[ri][ci];
        inp2.placeholder = '—';
        inp2.setAttribute('aria-label', 'cell ' + ri + ',' + ci);
        inp2.addEventListener('input', function () {
          e.content.cells[ri][ci] = this.value;
          e.version += 1;
        });
        td.appendChild(inp2);
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    c.appendChild(t);
    c.appendChild(el('div', 'src-note', 'Axis names are editable. In P1 a cell references an'
      + ' element_id; here it is free text.'));
    host.appendChild(c);
  }

  function renderBoard() {
    var host = byId('boardItems');
    clear(host);
    if (!STATE.elements.length) {
      host.appendChild(el('p', 'board-empty', 'Empty board. Use Text, Price Band or Matrix on the'
        + ' left - all three really create an element, and each one can be deleted again.'));
      return;
    }
    STATE.elements.forEach(function (e) {
      if (e.element_type === 'TEXT_NOTE') renderTextEl(e, host);
      else if (e.element_type === 'SERIES_PRICE_BAND') renderBandEl(e, host);
      else if (e.element_type === 'MATRIX') renderMatrixEl(e, host);
    });
  }

  function renderElementProps(e) {
    var host = byId('propsBody');
    clear(host);
    var top = el('div');
    top.appendChild(el('span', 'props-el', e.element_type));
    host.appendChild(top);
    var s = el('div', 'props-sec');
    s.appendChild(el('h4', null, 'Element'));
    var dl = el('dl', 'props-kv');
    [['element_id', e.element_id], ['author_type', e.author_type],
     ['created_by', e.created_by], ['version', String(e.version)],
     ['source_type', e.element_type === 'SERIES_PRICE_BAND' ? 'SERIES' : 'NONE']
    ].forEach(function (p) {
      dl.appendChild(el('dt', null, p[0]));
      dl.appendChild(el('dd', null, p[1]));
    });
    s.appendChild(dl);
    s.appendChild(el('p', 'props-note', 'author_type is written explicitly as HUMAN, never left'
      + ' blank to mean human - a blank is a third state (section 6.2).'));
    host.appendChild(s);
    var s2 = el('div', 'props-sec');
    s2.appendChild(el('h4', null, 'Not implemented here'));
    s2.appendChild(el('p', 'props-note', 'position_x/y, width, height and z_index are Canvas Core'
      + ' (section 11.5). This prototype stacks elements in a fixed column and does not drag,'
      + ' resize, pan or zoom.'));
    host.appendChild(s2);
    var s3 = el('div', 'props-sec');
    s3.appendChild(el('h4', null, 'Delete'));
    var b = el('button', 'btn btn--sm', 'Delete this element');
    b.type = 'button';
    b.addEventListener('click', function () { removeElement(e.element_id); });
    s3.appendChild(b);
    host.appendChild(s3);
  }

  /* ---------------------------------------------------------------- revisions --------------- */
  function fnv1a8(t) {
    var h = 0x811c9dc5;
    for (var i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
    return ('00000000' + h.toString(16)).slice(-8).toUpperCase();
  }
  function nowHM() {
    var d = new Date();
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }
  function nowStamp() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-'
      + ('0' + d.getDate()).slice(-2) + ' ' + nowHM();
  }
  function addRevision(type) {
    STATE.revSeq += 1;
    STATE.boardVersion += 1;
    STATE.revisions.push({
      revision_id: 'PSR-' + fnv1a8('PSR|b1|' + type + '|proto-' + STATE.revSeq),
      revision_type: type, board_version: STATE.boardVersion,
      author_type: 'HUMAN', created_by: 'vic', created_at: nowStamp(), _fresh: true });
    if (type === 'SAVE_CHECKPOINT') STATE.lastCheckpoint = nowHM();
    renderRevisions();
    renderMeta();
  }
  function renderRevisions() {
    var body = byId('revBody');
    clear(body);
    STATE.revisions.slice().reverse().forEach(function (r) {
      var tr = el('tr', r._fresh ? 'rev-row--fresh' : null);
      tr.appendChild(el('td', null, r.revision_id));
      var td = el('td');
      td.appendChild(el('span', 'rev-type'
        + (r.revision_type === 'FREEZE_SNAPSHOT' ? ' rev-type--freeze' : ''), r.revision_type));
      tr.appendChild(td);
      tr.appendChild(el('td', null, 'v' + r.board_version));
      tr.appendChild(el('td', null, r.author_type));
      tr.appendChild(el('td', null, r.created_by));
      tr.appendChild(el('td', null, r.created_at));
      body.appendChild(tr);
      r._fresh = false;
    });
  }
  function renderMeta() {
    byId('metaVersion').textContent = 'v' + STATE.boardVersion;
    byId('metaCheckpoint').textContent = STATE.lastCheckpoint;
    byId('metaRevisions').textContent = String(STATE.revisions.length);
    byId('revCount').textContent = String(STATE.revisions.length);
  }

  /* ==========================================================================================
     9. FILTERS
     ========================================================================================== */
  function fillSelect(id, values, current) {
    var s = byId(id);
    clear(s);
    values.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v;
      o.textContent = v;
      if (v === current) o.selected = true;
      s.appendChild(o);
    });
    s.value = current;
  }
  function seriesOf() { return uniq(ROWS.map(function (r) { return r.series; })).sort(); }
  function scopeValues(field) {
    var inSeries = ROWS.filter(function (r) { return r.series === STATE.series; });
    return ['All'].concat(uniq(inSeries.map(function (r) { return r[field]; })).sort());
  }
  function fillScopeSelects() {
    fillSelect('fCompany', scopeValues('company'), STATE.company);
    fillSelect('fCountry', scopeValues('country'), STATE.country);
    fillSelect('fMarketplace', scopeValues('marketplace'), STATE.marketplace);
  }
  function selectAll() {
    searchHits(universe()).forEach(function (r) { STATE.selected[r.key] = true; });
    renderSkuPicker();
    renderCharts();
  }
  function clearAll() {
    STATE.selected = {};
    renderSkuPicker();
    renderCharts();
  }

  /* ==========================================================================================
     10. AUTOMATED DOM ASSERTIONS.

     These run on load against the REAL DOM: they tick real checkboxes, change the real selects
     and read back the rendered SVG. They restore the starting state when they finish, so the page
     a person sees is the page the prototype boots with.
     ========================================================================================== */
  function fire(node, type) {
    var ev;
    try { ev = new Event(type, { bubbles: true }); }
    catch (e) {
      ev = document.createEvent('Event');
      ev.initEvent(type, true, true);
    }
    node.dispatchEvent(ev);
  }
  function setSelect(id, value) { var s = byId(id); s.value = value; fire(s, 'change'); }
  function tick(sku, on) {
    var boxes = byId('skuList').querySelectorAll('.skucb');
    for (var i = 0; i < boxes.length; i++) {
      if (boxes[i].getAttribute('data-sku') === sku) {
        if (boxes[i].checked !== on) { boxes[i].checked = on; fire(boxes[i], 'change'); }
        return true;
      }
    }
    return false;
  }
  function cols() { return byId('charts').querySelectorAll('.col'); }
  function colSkus() {
    var c = cols(), o = [];
    for (var i = 0; i < c.length; i++) o.push(c[i].getAttribute('data-sku'));
    return o;
  }
  function colBySku(sku) {
    var c = cols();
    for (var i = 0; i < c.length; i++) {
      if (c[i].getAttribute('data-sku') === sku) return c[i];
    }
    return null;
  }
  function panels() { return byId('charts').querySelectorAll('.panel'); }
  function findingTexts() {
    var o = [], f = byId('charts').querySelectorAll('.finding');
    for (var i = 0; i < f.length; i++) o.push(f[i].textContent);
    return o;
  }
  function gapFindings() {
    return findingTexts().filter(function (t) { return t.indexOf('GAP ') === 0; });
  }

  function runSelfTest() {
    var res = [];
    function T(label, cond, detail) {
      res.push({ label: label, pass: !!cond,
        detail: cond ? null : (detail === undefined ? null : detail) });
    }
    var save = { series: STATE.series, company: STATE.company, country: STATE.country,
      marketplace: STATE.marketplace, thr: STATE.thresholdCents,
      selected: JSON.parse(JSON.stringify(STATE.selected)),
      elementCount: STATE.elements.length };

    // ---- A. integer cents, which everything else rests on --------------------------------
    T('A1 cents() turns a decimal into an exact integer', cents(32.99) === 3299, cents(32.99));
    T('A2 cents() differences are exact where float differences are not',
      cents(32.99) - cents(24.99) === 800 && (32.99 - 24.99) !== 8,
      [cents(32.99) - cents(24.99), 32.99 - 24.99]);
    T('A3 cents() maps blank / null / undefined to null, never to 0',
      cents('') === null && cents(null) === null && cents(undefined) === null);
    T('A4 every mock money value normalised to an integer or null', (function () {
      for (var i = 0; i < ROWS.length; i++) {
        var r = ROWS[i];
        var vals = [r.minimum_c, r.regular_c, r.msrp_c, r.official_deal_c, r.proposed_deal_c];
        for (var j = 0; j < vals.length; j++) {
          if (vals[j] !== null && vals[j] !== Math.round(vals[j])) return false;
        }
      }
      return true;
    })());

    // ---- B. a known baseline, and an empty chart that says so -----------------------------
    setSelect('fSeries', 'Can Opener');
    setSelect('fCountry', 'US');
    byId('skuSearch').value = '';
    fire(byId('skuSearch'), 'input');
    clearAll();
    T('B1 clear all leaves no plotted column', cols().length === 0, cols().length);
    T('B2 and the chart says so rather than drawing an empty axis',
      byId('charts').querySelectorAll('.charts-empty').length === 1);

    // ---- C. multi-select changes the number of X-axis items --------------------------------
    tick('CO1105-R', true);
    var n1 = cols().length;
    tick('CO1100-R', true);
    var n2 = cols().length;
    tick('CO1180-R', true);
    var n3 = cols().length;
    T('C1 ticking one SKU puts one column on the X axis', n1 === 1, n1);
    T('C2 ticking a second adds a second', n2 === 2, n2);
    T('C3 ticking a third adds a third', n3 === 3, n3);
    tick('CO1100-R', false);
    T('C4 unticking removes that column again', cols().length === 2, cols().length);
    var lbl = colSkus();
    T('C5 and the columns left are exactly the ones still ticked',
      lbl.indexOf('CO1105-R') >= 0 && lbl.indexOf('CO1180-R') >= 0
      && lbl.indexOf('CO1100-R') === -1, lbl);
    T('C6 the X axis is ordered by regular_price ascending',
      lbl.join(',') === 'CO1105-R,CO1180-R', lbl);

    // ---- D. select all / clear all ---------------------------------------------------------
    selectAll();
    var uniUS = universe().length;
    var plottableUS = universe().filter(function (r) { return r.regular_c !== null; }).length;
    T('D1 select all ticks every SKU in the filtered universe',
      selectedRows().length === uniUS, [selectedRows().length, uniUS]);
    T('D2 and plots every one of them that has a regular_price',
      cols().length === plottableUS, [cols().length, plottableUS]);
    T('D3 the US Can Opener universe is 11 SKUs, 10 of them plottable',
      uniUS === 11 && plottableUS === 10, [uniUS, plottableUS]);
    T('D4 which is 8-12 members, enough to read a price architecture',
      plottableUS >= 8 && plottableUS <= 12, plottableUS);
    clearAll();
    T('D5 clear all empties the selection', selectedRows().length === 0);
    T('D6 and the X axis with it', cols().length === 0);

    // ---- E. search narrows the list without changing the selection ------------------------
    selectAll();
    var before = selectedRows().length;
    byId('skuSearch').value = 'pro x';
    fire(byId('skuSearch'), 'input');
    T('E1 search narrows the visible SKU list',
      byId('skuList').querySelectorAll('.skucb').length === 2,
      byId('skuList').querySelectorAll('.skucb').length);
    T('E2 without changing the selection or the chart',
      selectedRows().length === before && cols().length === 10,
      [selectedRows().length, before, cols().length]);
    byId('skuSearch').value = 'CO1190';
    fire(byId('skuSearch'), 'input');
    T('E3 and it matches the SKU code as well as the name',
      byId('skuList').querySelectorAll('.skucb').length === 1);
    byId('skuSearch').value = 'zzzz';
    fire(byId('skuSearch'), 'input');
    T('E4 no match says so rather than showing an empty box',
      byId('skuList').querySelectorAll('.skupick-empty').length === 1);
    byId('skuSearch').value = '';
    fire(byId('skuSearch'), 'input');

    // ---- F. Series really swaps the SKU universe ------------------------------------------
    setSelect('fSeries', 'Jar Opener');
    var jarSkus = universe().map(function (r) { return r.sku; });
    T('F1 switching Series replaces the SKU universe',
      jarSkus.length === 4 && jarSkus.indexOf('JO2100-R') >= 0
      && jarSkus.indexOf('CO1100-R') === -1, jarSkus);
    T('F2 and drops the previous Series selection rather than plotting it',
      cols().length === 0 && selectedRows().length === 0, cols().length);
    selectAll();
    T('F3 the Jar Opener universe plots four columns', cols().length === 4, cols().length);
    T('F4 and its X labels are the Jar Opener SKUs',
      colSkus().join(',') === 'JO2100-R,JO2140-R,JO2180-R,JO2200-R', colSkus());

    // ---- G. the band bounds, per SKU -------------------------------------------------------
    var jo = colBySku('JO2140-R');
    T('G1 the JO2140-R column exists', jo !== null);
    if (jo) {
      var band = jo.querySelector('.band'), cap = jo.querySelector('.cap');
      var floor = jo.querySelector('.floor'), reg = jo.querySelector('.mk-reg');
      T('G2 it draws a minimum-to-MSRP band', band !== null);
      T('G3 with a floor tick at the minimum and a cap tick at the MSRP',
        cap !== null && floor !== null);
      if (band && cap && floor && reg) {
        var y1 = Number(band.getAttribute('y1')), y2 = Number(band.getAttribute('y2'));
        var yc = Number(cap.getAttribute('y1')), yf = Number(floor.getAttribute('y1'));
        var yr = Number(reg.getAttribute('cy'));
        // SVG y grows downward, so the MSRP end is the SMALLER y
        T('G4 the band spans exactly the two ticks',
          Math.min(y1, y2) === yc && Math.max(y1, y2) === yf, [y1, y2, yc, yf]);
        T('G5 the MSRP end is above the minimum end on screen', yc < yf, [yc, yf]);
        T('G6 and regular_price sits strictly inside the band', yr < yf && yr > yc, [yc, yr, yf]);
      }
      T('G7 JO2140-R has no deal at all, so it draws neither deal marker',
        jo.querySelector('.mk-deal') === null && jo.querySelector('.mk-prop') === null);
    }
    T('G8 every plotted column draws its band', (function () {
      var c = cols();
      for (var i = 0; i < c.length; i++) if (!c[i].querySelector('.band')) return false;
      return c.length === 4;
    })());

    // ---- H. the three marker kinds, the legend and the axes -------------------------------
    var jo2180 = colBySku('JO2180-R');
    T('H1 a SKU with an official promo_price draws the official deal marker',
      jo2180 !== null && jo2180.querySelector('.mk-deal') !== null);
    T('H2 and not the proposal marker',
      jo2180 !== null && jo2180.querySelector('.mk-prop') === null);
    setSelect('fSeries', 'Can Opener');
    setSelect('fCountry', 'US');
    selectAll();
    var co1120 = colBySku('CO1120-R'), co1105 = colBySku('CO1105-R');
    T('H3 a SKU with only a board proposal draws the proposal marker',
      co1120 !== null && co1120.querySelector('.mk-prop') !== null);
    T('H4 and not the official one, because it has no promo_price',
      co1120 !== null && co1120.querySelector('.mk-deal') === null);
    T('H5 a SKU with neither draws only the regular marker',
      co1105 !== null && co1105.querySelector('.mk-reg') !== null
      && co1105.querySelector('.mk-deal') === null
      && co1105.querySelector('.mk-prop') === null);
    T('H6 every plotted column carries a regular_price marker', (function () {
      var c = cols();
      for (var i = 0; i < c.length; i++) if (!c[i].querySelector('.mk-reg')) return false;
      return c.length > 0;
    })());
    T('H7 official and proposal markers are distinct classes, and never both on one SKU',
      byId('charts').querySelectorAll('.col .mk-deal').length === 5
      && byId('charts').querySelectorAll('.col .mk-prop').length === 2
      && (function () {
        var c = cols();
        for (var i = 0; i < c.length; i++) {
          if (c[i].querySelector('.mk-deal') && c[i].querySelector('.mk-prop')) return false;
        }
        return true;
      })(),
      [byId('charts').querySelectorAll('.col .mk-deal').length,
        byId('charts').querySelectorAll('.col .mk-prop').length]);
    T('H7a and the legend carries one swatch of each of the three marker kinds',
      byId('charts').querySelectorAll('.legend .sw.mk-reg').length === 1
      && byId('charts').querySelectorAll('.legend .sw.mk-deal').length === 1
      && byId('charts').querySelectorAll('.legend .sw.mk-prop').length === 1);
    T('H8 the legend names seven symbols',
      byId('charts').querySelectorAll('.panel .legend .legend-item').length === 7,
      byId('charts').querySelectorAll('.panel .legend .legend-item').length);
    T('H9 the Y axis is drawn with numeric ticks',
      byId('charts').querySelectorAll('.panel .y-tick').length >= 4,
      byId('charts').querySelectorAll('.panel .y-tick').length);
    T('H10 the Y axis is titled with its currency',
      byId('charts').querySelector('.panel .axis-title').textContent === 'Price (USD)',
      byId('charts').querySelector('.panel .axis-title').textContent);
    T('H11 every column carries an X-axis SKU label',
      byId('charts').querySelectorAll('.panel .x-label').length === cols().length);
    T('H12 and a details tooltip',
      byId('charts').querySelectorAll('.panel .col title').length === cols().length);
    T('H13 whose text carries the five price levels and the two named absences', (function () {
      var t = byId('charts').querySelector('.panel .col title').textContent;
      return t.indexOf('MSRP') >= 0 && t.indexOf('regular_price') >= 0
        && t.indexOf('minimum_price') >= 0 && t.indexOf('official deal') >= 0
        && t.indexOf('D-6 / D-8') > 0;
    })(), byId('charts').querySelector('.panel .col title').textContent);

    // ---- I. SOURCE_MISSING never becomes a point -----------------------------------------
    T('I1 the SOURCE_MISSING SKU is not on the X axis',
      colSkus().indexOf('CO1140-R') === -1, colSkus());
    T('I2 but it IS listed, with its reason',
      byId('charts').querySelectorAll('.notplotted li').length === 1);
    T('I3 and the list says it was not back-filled from selling_price',
      byId('charts').querySelector('.notplotted').textContent
        .indexOf('Not back-filled from sku_details.selling_price') > 0);
    clearAll();
    tick('CO1140-R', true);
    T('I4 selecting it alone plots nothing at all', cols().length === 0, cols().length);
    T('I5 and still lists it rather than showing an empty page',
      byId('charts').querySelectorAll('.notplotted li').length === 1);
    T('I6 it is marked SOURCE_MISSING in the selector too',
      byId('skuList').querySelectorAll('.skurow--missing').length === 1);

    // ---- J. currency never shares an axis ------------------------------------------------
    setSelect('fCountry', 'All');
    selectAll();
    var ps = panels(), curs = [];
    for (var p1 = 0; p1 < ps.length; p1++) curs.push(ps[p1].getAttribute('data-currency'));
    T('J1 three currencies produce three panels', ps.length === 3, curs);
    T('J2 one per currency, EUR / GBP / USD', curs.join(',') === 'EUR,GBP,USD', curs);
    T('J3 every panel has its own Y axis',
      byId('charts').querySelectorAll('.panel .y-axis').length === 3);
    T('J4 no panel contains a column from another currency', (function () {
      for (var i = 0; i < ps.length; i++) {
        var cur = ps[i].getAttribute('data-currency');
        var cc = ps[i].querySelectorAll('.col');
        for (var j = 0; j < cc.length; j++) {
          var key = cc[j].getAttribute('data-key'), row = null;
          ROWS.forEach(function (r) { if (r.key === key) row = r; });
          if (!row || row.currency !== cur) return false;
        }
      }
      return true;
    })());
    T('J5 each panel titles its own axis with its own currency', (function () {
      var seen = [];
      for (var i = 0; i < ps.length; i++) {
        seen.push(ps[i].querySelector('.axis-title').textContent);
      }
      return seen.join(',') === 'Price (EUR),Price (GBP),Price (USD)';
    })());
    T('J6 and the refusal is stated on screen, above the split panels',
      byId('charts').querySelectorAll('.refusal').length === 1
      && byId('charts').querySelector('.refusal').textContent
        .indexOf('MIXED_CURRENCY_COMPARISON_REFUSED') === 0,
      byId('charts').querySelectorAll('.refusal').length);
    T('J7 no FX conversion is offered or performed',
      byId('charts').textContent.indexOf('no FX conversion is performed') > 0
      && byId('charts').textContent.toLowerCase().indexOf('converted to') === -1);
    T('J8 no finding crosses two currencies', (function () {
      for (var i = 0; i < ps.length; i++) {
        var cur = ps[i].getAttribute('data-currency');
        var ff = ps[i].querySelectorAll('.finding');
        for (var j = 0; j < ff.length; j++) {
          var txt = ff[j].textContent;
          if (/USD|EUR|GBP/.test(txt) && txt.indexOf(cur) === -1) return false;
        }
      }
      return true;
    })());

    // ---- K. the analysis arithmetic ------------------------------------------------------
    setSelect('fCountry', 'US');
    selectAll();
    var ft = findingTexts().join(' || ');
    T('K1 the 59.99-to-74.99 step is a gap at threshold 8.00',
      /GAP CO1180-R → CO1190-R = 15\.00 USD/.test(ft), ft);
    T('K2 and the finding displays the threshold that produced it',
      /exceeds the gap threshold 8\.00/.test(ft));
    T('K3 a 3.00 step is not a gap', /GAP CO1105-R → CO1108-R/.test(ft) === false);
    T('K4 the gap count at threshold 8.00 is exactly one',
      gapFindings().length === 1, gapFindings());
    T('K4a and the 74.99-to-82.99 step, EXACTLY 8.00, is not a second one',
      /GAP CO1190-R . CO1195-R/.test(ft) === false
      && cents(82.99) - cents(74.99) === 800,
      [cents(82.99) - cents(74.99)]);
    T('K5 the proposal-driven overlap is found',
      /OVERLAP CO1100-R ∩ CO1120-R over 34\.99–39\.99 USD/.test(ft), ft);
    T('K6 and labelled PROPOSAL-DRIVEN',
      /OVERLAP[^|]*PROPOSAL-DRIVEN/.test(ft), ft);
    T('K7 the proposal-driven cannibalisation is found',
      /CANNIBALISATION CO1120-R deal 34\.99 ≤ CO1100-R regular 39\.99 USD/.test(ft), ft);
    T('K8 and attributed to the board, not to a campaign',
      /CANNIBALISATION CO1120-R[^|]*PROPOSAL-DRIVEN/.test(ft), ft);
    T('K9 a live-campaign cannibalisation is NOT labelled proposal-driven', (function () {
      var live = findingTexts().filter(function (t) {
        return t.indexOf('CANNIBALISATION') === 0 && t.indexOf('CO1120-R') === -1; });
      return live.length > 0 && live.every(function (t) {
        return t.indexOf('PROPOSAL-DRIVEN') === -1
          && t.indexOf('from a live campaign price') > 0; });
    })(), findingTexts().filter(function (t) { return t.indexOf('CANNIBALISATION') === 0; }));
    T('K10 entry / core / premium are all labelled on the axis', (function () {
      var t = byId('charts').querySelectorAll('.panel .tier'), seen = {};
      for (var i = 0; i < t.length; i++) seen[t[i].textContent] = 1;
      return seen.entry === 1 && seen.core === 1 && seen.premium === 1;
    })());
    T('K11 exactly one entry and one premium per panel',
      byId('charts').querySelectorAll('.panel .tier--entry').length === 1
      && byId('charts').querySelectorAll('.panel .tier--premium').length === 1);
    T('K12 the gap is drawn on the chart, not only listed',
      byId('charts').querySelectorAll('.panel .gap-label').length === 1
      && byId('charts').querySelectorAll('.panel .gap-bar').length === 1,
      byId('charts').querySelectorAll('.panel .gap-label').length);
    T('K13 four overlap boxes are drawn, two of them marked proposal-driven',
      byId('charts').querySelectorAll('.panel .ov-box').length === 4
      && byId('charts').querySelectorAll('.panel .ov-box--prop').length === 2,
      [byId('charts').querySelectorAll('.panel .ov-box').length,
        byId('charts').querySelectorAll('.panel .ov-box--prop').length]);
    T('K13a and a touching pair is not among them (CO1160 regular 52.99 = CO1180 deal 52.99)',
      /OVERLAP CO1160-R . CO1180-R/.test(ft) === false, ft);

    // THE TWO BOUNDARY RULES, on data chosen to expose them.
    setSelect('fSeries', 'Jar Opener');
    selectAll();
    var ft2 = findingTexts().join(' || ');
    T('K14 a step EXACTLY equal to the threshold is not a gap (24.99 to 32.99 vs 8.00)',
      /GAP JO2100-R → JO2140-R/.test(ft2) === false, ft2);
    T('K15 intervals touching at a single point are not an overlap'
      + ' (JO2200-R deal 41.99 = JO2180-R regular 41.99)',
      /OVERLAP JO2180-R ∩ JO2200-R/.test(ft2) === false, ft2);
    T('K16 but that same touch IS a cannibalisation, because that test is <=',
      /CANNIBALISATION JO2200-R deal 41\.99 ≤ JO2180-R regular 41\.99/.test(ft2), ft2);

    // the threshold input really drives the arithmetic
    setSelect('fSeries', 'Can Opener');
    setSelect('fCountry', 'US');
    selectAll();
    var at8 = gapFindings().length;
    byId('fThreshold').value = '2.00';
    fire(byId('fThreshold'), 'input');
    var at2 = gapFindings().length;
    T('K17 lowering the threshold finds more gaps', at2 > at8, [at8, at2]);
    T('K18 and every gap finding re-states the new threshold',
      gapFindings().length > 0 && gapFindings().every(function (t) {
        return t.indexOf('gap threshold 2.00') > 0; }));
    byId('fThreshold').value = '8.00';
    fire(byId('fThreshold'), 'input');
    T('K19 restoring the threshold restores the gap count', gapFindings().length === at8);

    // ---- L. the filters really filter ----------------------------------------------------
    setSelect('fCountry', 'DE');
    T('L1 Country=DE narrows the universe to the EUR rows',
      universe().length === 3 && universe().every(function (r) {
        return r.currency === 'EUR'; }), universe().length);
    selectAll();
    T('L2 and only one panel is drawn', panels().length === 1);
    T('L3 which is the EUR one', panels()[0].getAttribute('data-currency') === 'EUR');
    setSelect('fMarketplace', 'Amazon');
    T('L4 Marketplace=Amazon keeps all three', universe().length === 3);
    setSelect('fCountry', 'US');
    setSelect('fMarketplace', 'All');
    setSelect('fCompany', 'ResUS');
    T('L5 Company=ResUS is a real filter',
      universe().length === 11 && universe().every(function (r) {
        return r.company === 'ResUS'; }), universe().length);
    setSelect('fCompany', 'KM-EU');
    T('L6 and Company=KM-EU excludes the US rows',
      universe().length === 0, universe().length);
    T('L7 an empty universe says so instead of drawing an axis',
      byId('skuList').querySelectorAll('.skupick-empty').length === 1);
    setSelect('fCompany', 'All');
    setSelect('fSeries', 'Bottle Opener');
    setSelect('fMarketplace', 'Shopify');
    T('L8 Series and Marketplace together narrow to one SKU',
      universe().length === 1 && universe()[0].sku === 'BO3150-R',
      universe().map(function (r) { return r.sku; }));
    selectAll();
    T('L9 a single-member panel labels it "only" rather than entry or premium',
      byId('charts').querySelectorAll('.panel .tier--only').length === 1);
    setSelect('fMarketplace', 'All');
    setSelect('fSeries', 'Can Opener');
    setSelect('fCountry', 'US');

    // ---- M. the board elements really work ------------------------------------------------
    var el0 = byId('boardItems').querySelectorAll('.el').length;
    var t1 = addElement('TEXT_NOTE');
    T('M1 Text creates one more visible element',
      byId('boardItems').querySelectorAll('.el').length === el0 + 1);
    T('M2 of type TEXT_NOTE, with an editable textarea',
      byId('boardItems').querySelector('[data-element-id="' + t1.element_id
        + '"][data-element-type="TEXT_NOTE"] .note-edit') !== null);
    var ta = byId('boardItems').querySelector('[data-element-id="' + t1.element_id
      + '"] .note-edit');
    ta.value = 'edited by the self-test';
    fire(ta, 'input');
    T('M3 and editing it updates the element', t1.content.text === 'edited by the self-test');
    selectAll();
    var b1 = addElement('SERIES_PRICE_BAND');
    T('M4 Price Band creates a visible chart element',
      byId('boardItems').querySelector('[data-element-id="' + b1.element_id
        + '"] svg.chart') !== null);
    T('M5 whose column count matches the selection it captured',
      byId('boardItems').querySelectorAll('[data-element-id="' + b1.element_id
        + '"] .col').length === 10,
      byId('boardItems').querySelectorAll('[data-element-id="' + b1.element_id + '"] .col').length);
    T('M6 and which does not change when the selector afterwards does', (function () {
      clearAll();
      var still = byId('boardItems').querySelectorAll('[data-element-id="' + b1.element_id
        + '"] .col').length;
      selectAll();
      return still === 10;
    })());
    var m1 = addElement('MATRIX');
    T('M7 Matrix creates a visible 2x2 with four editable cells',
      byId('boardItems').querySelectorAll('[data-element-id="' + m1.element_id
        + '"] .mx-cell').length === 4);
    var axi = byId('boardItems').querySelector('[data-element-id="' + m1.element_id
      + '"] .mx-axis-input[data-axis="x_axis"]');
    axi.value = 'Feature Level';
    fire(axi, 'input');
    T('M8 whose X axis name is editable and re-renders the header',
      m1.content.x_axis === 'Feature Level'
      && byId('boardItems').querySelector('[data-element-id="' + m1.element_id
        + '"] .mx-head-x_axis').textContent === 'Feature Level');
    var ayi = byId('boardItems').querySelector('[data-element-id="' + m1.element_id
      + '"] .mx-axis-input[data-axis="y_axis"]');
    ayi.value = 'Series';
    fire(ayi, 'input');
    T('M9 and so is the Y axis name', m1.content.y_axis === 'Series');
    var cell = byId('boardItems').querySelector('[data-element-id="' + m1.element_id
      + '"] .mx-cell');
    cell.value = 'CO1100-R';
    fire(cell, 'input');
    T('M10 a matrix cell is editable', m1.content.cells[0][0] === 'CO1100-R');
    T('M11 three prototype elements are on the board now',
      byId('boardItems').querySelectorAll('.el').length === el0 + 3,
      byId('boardItems').querySelectorAll('.el').length);
    T('M12 each carries a delete control',
      byId('boardItems').querySelectorAll('.el .el-del').length === el0 + 3);
    removeElement(m1.element_id);
    removeElement(b1.element_id);
    removeElement(t1.element_id);
    T('M13 and each one can be deleted again',
      byId('boardItems').querySelectorAll('.el').length === el0);
    T('M14 an empty board says so rather than showing nothing',
      byId('boardItems').querySelectorAll('.board-empty').length === 1);
    T('M15 the tools that are NOT implemented are disabled, not wired to a dialog', (function () {
      var off = document.querySelectorAll('.toolrail .tool--off');
      if (off.length !== 6) return false;
      for (var i = 0; i < off.length; i++) if (!off[i].disabled) return false;
      return true;
    })(), document.querySelectorAll('.toolrail .tool--off').length);
    T('M16 and the page says plainly that drag / resize / pan / zoom are absent',
      document.querySelector('.toolrail-note').textContent
        .indexOf('drag, resize, pan, zoom') > 0);

    // ---- N. the things that must NOT be here ---------------------------------------------
    // SCANNED OVER THE LOGIC, DELIBERATELY NOT OVER runSelfTest. The first version of this
    // assertion stringified the test itself - and the test has to name the forbidden APIs in order
    // to look for them, so it could only ever fail. The subject is the rendering and analysis code.
    T('N1 no storage API appears anywhere in the prototype logic', (function () {
      var src = String(renderPanel) + String(analyse) + String(addElement) + String(removeElement)
        + String(renderCharts) + String(renderBoard) + String(renderSkuPicker)
        + String(renderDetails) + String(addRevision) + String(norm) + String(splitByCurrency)
        + String(universe) + String(selectAll) + String(clearAll) + String(cents);
      return src.indexOf('localStorage') === -1 && src.indexOf('sessionStorage') === -1
        && src.indexOf('indexedDB') === -1 && src.indexOf('openDatabase') === -1;
    })());
    T('N2 no network API appears anywhere in the prototype logic', (function () {
      var src = String(renderPanel) + String(analyse) + String(addElement) + String(removeElement)
        + String(renderCharts) + String(renderBoard) + String(renderSkuPicker)
        + String(renderDetails) + String(addRevision) + String(norm) + String(splitByCurrency)
        + String(universe) + String(selectAll) + String(clearAll) + String(tipText);
      return src.indexOf('fetch(') === -1 && src.indexOf('XMLHttpRequest') === -1
        && src.indexOf('WebSocket') === -1 && src.indexOf('EventSource') === -1
        && src.indexOf('sendBeacon') === -1 && src.indexOf('import(') === -1;
    })());
    T('N3 the document loads exactly two local subresources', (function () {
      var n = document.querySelectorAll('script[src], link[href]');
      if (n.length !== 2) return false;
      for (var i = 0; i < n.length; i++) {
        var u = n[i].getAttribute('src') || n[i].getAttribute('href');
        if (u !== 'prototype.css' && u !== 'prototype.js') return false;
      }
      return true;
    })(), document.querySelectorAll('script[src], link[href]').length);
    T('N4 no production accessor is named in the rendered page',
      document.body.textContent.indexOf('KM.DB') === -1);
    T('N5 current selling price appears only as a named absence', (function () {
      var t = document.body.textContent;
      var i = t.indexOf('current selling price');
      return i === -1 || /current selling price[^.]{0,60}(not shown|GAP)/i.test(t);
    })());
    T('N6 margin appears only as a named absence', (function () {
      var t = document.body.textContent;
      var i = t.indexOf('margin');
      return i === -1 || /margin[^.]{0,60}(not shown|GAP|D-8)/i.test(t);
    })());
    T('N7 no margin FIGURE is rendered anywhere', (function () {
      // The first version of this looked for the WORD and flagged the prototype's own honest
      // sentence, "current selling price / margin: not shown (D-6 / D-8)". The requirement is that
      // no margin VALUE is shown, so the test looks for a number or a percent beside the word.
      var t = document.body.textContent;
      return /margin[^A-Za-z]{0,4}[-+]?[0-9]/i.test(t) === false
        && /margin[^.]{0,12}%/i.test(t) === false;
    })(), (document.body.textContent.match(/margin[^.]{0,30}/gi) || []).slice(0, 3));
    T('N8 the mock data declares itself as invented',
      MOCK.note.indexOf('INVENTED SAMPLE DATA') === 0);
    T('N9 the banner tells the reader it is not runtime',
      document.querySelector('.proto-banner').textContent.indexOf('NON-RUNTIME PROTOTYPE') >= 0);

    // ---- Z. restore the page the reader was looking at -----------------------------------
    STATE.search = '';
    byId('skuSearch').value = '';
    STATE.series = save.series;
    fillSelect('fSeries', seriesOf(), STATE.series);
    STATE.company = save.company;
    STATE.country = save.country;
    STATE.marketplace = save.marketplace;
    fillScopeSelects();
    STATE.thresholdCents = save.thr;
    byId('fThreshold').value = fromCents(save.thr);
    STATE.selected = save.selected;
    renderSkuPicker();
    renderCharts();
    renderBoard();
    T('Z1 the self-test restored the starting selection',
      selectedRows().length === Object.keys(save.selected).length,
      [selectedRows().length, Object.keys(save.selected).length]);
    T('Z2 and left none of its own elements behind',
      STATE.elements.length === save.elementCount);
    T('Z3 and the chart is back on screen', cols().length === 10, cols().length);

    var passed = res.filter(function (r) { return r.pass; }).length;
    STATE.selftest = { total: res.length, passed: passed, failed: res.length - passed,
      results: res };
    renderSelfTest();
    return STATE.selftest;
  }

  function renderSelfTest() {
    var st = STATE.selftest;
    if (!st) return;
    var badge = byId('selftestBadge'), sum = byId('selftestSummary'), list = byId('selftestList');
    var okAll = st.failed === 0;
    badge.textContent = 'self-test ' + st.passed + '/' + st.total;
    badge.className = 'banner-selftest ' + (okAll ? 'is-ok' : 'is-bad');
    badge.title = okAll ? 'every DOM assertion passed' : st.failed + ' assertion(s) failed';
    sum.textContent = st.passed + ' passed, ' + st.failed + ' failed, ' + st.total + ' total';
    sum.className = 'selftest-summary ' + (okAll ? 'is-ok' : 'is-bad');
    clear(list);
    st.results.forEach(function (r) {
      var li = el('li', r.pass ? 'st-ok' : 'st-bad');
      li.appendChild(el('span', 'st-mark', r.pass ? 'ok' : 'FAIL'));
      li.appendChild(document.createTextNode(' ' + r.label));
      if (!r.pass && r.detail !== null && r.detail !== undefined) {
        li.appendChild(el('code', 'st-detail', ' got ' + JSON.stringify(r.detail)));
      }
      list.appendChild(li);
    });
    try {
      if (window.console && console.log) {
        console.log('[PSB prototype] self-test ' + st.passed + '/' + st.total
          + (st.failed ? '  ' + st.failed + ' FAILED' : '  all passed'));
        st.results.forEach(function (r) {
          if (!r.pass) {
            console.error('FAIL ' + r.label
              + (r.detail === null ? '' : '  got ' + JSON.stringify(r.detail)));
          }
        });
      }
    } catch (e) { /* console is optional */ }
  }

  /* ==========================================================================================
     11. WIRING
     ========================================================================================== */
  byId('fSeries').addEventListener('change', function () {
    STATE.series = this.value;
    STATE.selected = {};
    STATE.company = 'All';
    STATE.country = 'All';
    STATE.marketplace = 'All';
    fillScopeSelects();
    renderSkuPicker();
    renderCharts();
  });
  [['fCompany', 'company'], ['fCountry', 'country'], ['fMarketplace', 'marketplace']]
    .forEach(function (p) {
      byId(p[0]).addEventListener('change', function () {
        STATE[p[1]] = this.value;
        pruneSelection();
        renderSkuPicker();
        renderCharts();
      });
    });
  byId('fThreshold').addEventListener('input', function () {
    var c = cents(this.value);
    STATE.thresholdCents = (c === null || c < 0) ? 0 : c;
    renderCharts();
  });
  byId('skuSearch').addEventListener('input', function () {
    STATE.search = this.value;
    renderSkuPicker();
  });
  byId('btnSelectAll').addEventListener('click', selectAll);
  byId('btnClearAll').addEventListener('click', clearAll);

  byId('toolText').addEventListener('click', function () { addElement('TEXT_NOTE'); });
  byId('toolBand').addEventListener('click', function () { addElement('SERIES_PRICE_BAND'); });
  byId('toolMatrix').addEventListener('click', function () { addElement('MATRIX'); });

  byId('btnCheckpoint').addEventListener('click', function () {
    addRevision('SAVE_CHECKPOINT');
    var d = byId('historyDrawer');
    if (d.hidden) { d.hidden = false; byId('btnHistory').setAttribute('aria-expanded', 'true'); }
  });
  byId('btnHistory').addEventListener('click', function () {
    var d = byId('historyDrawer');
    d.hidden = !d.hidden;
    this.setAttribute('aria-expanded', d.hidden ? 'false' : 'true');
  });
  byId('btnHistoryClose').addEventListener('click', function () {
    byId('historyDrawer').hidden = true;
    byId('btnHistory').setAttribute('aria-expanded', 'false');
  });
  byId('btnNewBoard').addEventListener('click', function () {
    // The seeded template of section 11.4, as far as this prototype implements it.
    STATE.elements = [];
    STATE.selectedElementId = null;
    var n = addElement('TEXT_NOTE');
    n.content.title = 'Objective / constraints';
    n.content.text = 'Seeded template: the objective, the constraints, and the questions this board'
      + ' has to answer.';
    addElement('SERIES_PRICE_BAND');
    addElement('MATRIX');
    addRevision('SAVE_CHECKPOINT');
    renderBoard();
  });
  byId('btnSelftestToggle').addEventListener('click', function () {
    var l = byId('selftestList');
    l.hidden = !l.hidden;
    this.textContent = l.hidden ? 'Show detail' : 'Hide detail';
    this.setAttribute('aria-expanded', l.hidden ? 'false' : 'true');
  });
  byId('btnSelftestRun').addEventListener('click', function () { runSelfTest(); });
  byId('selftestBadge').addEventListener('click', function () {
    var s = byId('selftest');
    if (s && s.scrollIntoView) s.scrollIntoView();
  });
  byId('boardSelect').addEventListener('change', function () { this.selectedIndex = 0; });

  /* ---------------------------------------------------------------- boot ------------------- */
  fillSelect('fSeries', seriesOf(), STATE.series);
  // Open on a useful screen rather than an empty one: the whole US price architecture.
  STATE.country = 'US';
  fillScopeSelects();
  universe().forEach(function (r) { STATE.selected[r.key] = true; });
  renderSkuPicker();
  renderCharts();
  renderBoard();
  renderRevisions();
  renderMeta();
  var host0 = byId('propsBody');
  clear(host0);
  host0.appendChild(el('p', 'props-empty',
    'Click a SKU column in the chart, or an element on the board.'));
  runSelfTest();
})();
