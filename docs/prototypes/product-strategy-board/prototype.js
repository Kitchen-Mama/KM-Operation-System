/* =============================================================================================
   Product Strategy Board — NON-RUNTIME STATIC PROTOTYPE (P0-R1 §22)

   NO NETWORK: this file contains no fetch, no XMLHttpRequest, no WebSocket, no EventSource,
   no dynamic import, and no remote URL of any kind.
   NO STORAGE: localStorage / sessionStorage / IndexedDB are never touched. State lives in the
   STATE object below, for the lifetime of the page.
   NO PRODUCTION DATA: every value in MOCK is invented sample data. No table is read, no
   Apps Script action is invoked, and no client data-access accessor is referenced. The one
   action NAME below is a string inside mock snapshot data (captured_via, per design freeze
   section 8.2) - it records which read a snapshot came from; it is not a call.

   What this file is for: showing the information architecture and the flow. It is deliberately
   NOT a drag engine, NOT CRUD and NOT a data layer — those are §11.5 Canvas Core and §12 API,
   which P1 builds and P0-R1 only specifies.
   ============================================================================================= */
(function () {
  'use strict';

  /* ==========================================================================================
     1. MOCK DATA — invented. Field NAMES are the real ones from the design freeze (§4), so the
     prototype shows where each value would come from; the VALUES are all made up.
     ========================================================================================== */
  var MOCK = {

    // Series price-band members. `regular_price` is pricing_list.regular_price (D-2, the one basis).
    // `promo_price` is campaign_sku_lines.promo_price (the ONLY official deal price).
    // `proposed_deal_price` is board-owned content on a DEAL_PLAN (D-4) — never official.
    bands: {
      'Can Opener': [
        { sku: 'CO1105-R', product_name: 'Can Opener Lite',      regular_price: 29.99, currency: 'USD',
          promo_price: null,  proposed_deal_price: null,  scope: 'ResUS|US|Amazon' },
        { sku: 'CO1100-R', product_name: 'Can Opener Classic',   regular_price: 39.99, currency: 'USD',
          promo_price: 31.99, proposed_deal_price: null,  scope: 'ResUS|US|Amazon',
          campaign: 'Prime Day 2027 (2027-07-08 → 2027-07-09)' },
        { sku: 'CO1120-R', product_name: 'Can Opener Comfort',   regular_price: 44.99, currency: 'USD',
          promo_price: null,  proposed_deal_price: 34.99, scope: 'ResUS|US|Amazon' },
        { sku: 'CO1180-R', product_name: 'Can Opener Pro',       regular_price: 59.99, currency: 'USD',
          promo_price: 52.99, proposed_deal_price: null,  scope: 'ResUS|US|Amazon',
          campaign: 'Prime Day 2027 (2027-07-08 → 2027-07-09)' },
        { sku: 'CO1100-R', product_name: 'Can Opener Classic',   regular_price: 36.99, currency: 'EUR',
          promo_price: null,  proposed_deal_price: null,  scope: 'KM-EU|DE|Amazon' },
        { sku: 'CO1180-R', product_name: 'Can Opener Pro',       regular_price: 54.99, currency: 'EUR',
          promo_price: 47.99, proposed_deal_price: null,  scope: 'KM-EU|DE|Amazon',
          campaign: 'DE Sommerangebot 2027 (2027-06-20 → 2027-06-27)' },
        // D-2 / §15.6 — no pricing_list.regular_price. Listed with its reason and PLOTTED NOWHERE.
        // It is NOT back-filled from sku_details.selling_price (a master base input, not a site price).
        { sku: 'CO1140-R', product_name: 'Can Opener Grip',      regular_price: null,  currency: 'USD',
          promo_price: null,  proposed_deal_price: null,  scope: 'ResUS|US|Amazon',
          missing_reason: 'no pricing_list row for this marketplace_sku_id' }
      ],
      'Jar Opener': [
        { sku: 'JO2100-R', product_name: 'Jar Opener Lite',      regular_price: 24.99, currency: 'USD',
          promo_price: 19.99, proposed_deal_price: null,  scope: 'ResUS|US|Amazon',
          campaign: 'Spring Reset 2027 (2027-03-01 → 2027-03-14)' },
        { sku: 'JO2140-R', product_name: 'Jar Opener Comfort',   regular_price: 32.99, currency: 'USD',
          promo_price: null,  proposed_deal_price: null,  scope: 'ResUS|US|Amazon' },
        { sku: 'JO2180-R', product_name: 'Jar Opener Pro',       regular_price: 41.99, currency: 'USD',
          promo_price: 37.99, proposed_deal_price: null,  scope: 'ResUS|US|Amazon',
          campaign: 'Spring Reset 2027 (2027-03-01 → 2027-03-14)' }
      ]
    },

    // Board elements. Column names are §6.2's twenty; author_type is a REAL field, always written.
    elements: [
      {
        element_id: 'PSE-4A17C0D2', element_type: 'TEXT_NOTE',
        source_type: 'NONE', source_identity: '', source_mode: 'LIVE_REFERENCE',
        author_type: 'HUMAN', created_by: 'vic', updated_by: 'vic',
        created_at: '2027-01-14 09:02', updated_at: '2027-01-19 14:20', version: 4,
        position_x: 1, position_y: 1, width: 4, height: 3, z_index: 1,
        content: {
          title: 'Objective / constraints',
          text: 'Close the 30–45 USD hole without cannibalising Classic.\n' +
                'Comfort must not undercut Classic on a deal.\n' +
                'TODO: confirm whether DE gets its own band or follows US positioning.'
        }
      },
      {
        element_id: 'PSE-91B3E7A4', element_type: 'SKU_CARD',
        source_type: 'SKU', source_identity: 'CO1100-R', source_mode: 'LIVE_REFERENCE',
        author_type: 'HUMAN', created_by: 'vic', updated_by: 'vic',
        created_at: '2027-01-14 09:05', updated_at: '2027-01-14 09:05', version: 1,
        position_x: 6, position_y: 1, width: 4, height: 4, z_index: 2,
        content: { note: '' },
        resolved: {
          series: 'Can Opener', product_name: 'Can Opener Classic', lifecycle: 'Running in the Market',
          category: 'Kitchen Tools',
          regular_price: '39.99', msrp: '49.99', minimum_price: '29.99', currency: 'USD',
          price_source: 'manual_override', price_status: 'active'
        }
      },
      {
        element_id: 'PSE-3F02D8BB', element_type: 'REGIONAL_SKU_CARD',
        source_type: 'REGIONAL_SKU', source_identity: 'KM-EU|DE|Amazon|CO1180-R',
        source_mode: 'FROZEN_SNAPSHOT',
        author_type: 'HUMAN', created_by: 'vic', updated_by: 'vic',
        created_at: '2027-01-15 11:40', updated_at: '2027-01-15 11:40', version: 2,
        position_x: 11, position_y: 1, width: 4, height: 4, z_index: 3,
        content: { note: 'Frozen at the DE pricing review.' },
        snapshot: {
          snapshot_version: 1, captured_at: '2027-01-15T11:40:07Z',
          captured_via: 'skuDetails.workspace.get',
          values: {
            site_sku: 'DE-CO1180R', marketplace_product_id: 'B0C9XXXX21',
            marketplace_sku_status: 'active', regular_price: '54.99', currency: 'EUR',
            language: 'de-DE', label_version: 'v3'
          },
          value_provenance: {
            site_sku: 'sku_regional_details.site_sku',
            marketplace_product_id: 'sku_regional_details.marketplace_product_id',
            marketplace_sku_status: 'marketplace_skus.marketplace_sku_status',
            regular_price: 'pricing_list.regular_price',
            currency: 'pricing_list.currency'
          }
        },
        live_now: { regular_price: '57.99', marketplace_sku_status: 'active' }
      },
      {
        element_id: 'PSE-77CE1904', element_type: 'DEAL_PLAN',
        source_type: 'CAMPAIGN_SKU_LINE', source_identity: 'CSL-0000A31F',
        source_mode: 'LIVE_REFERENCE',
        author_type: 'HUMAN', created_by: 'vic', updated_by: 'vic',
        created_at: '2027-01-18 16:10', updated_at: '2027-01-19 10:03', version: 3,
        position_x: 1, position_y: 5, width: 9, height: 5, z_index: 4,
        content: {
          proposed_regular_price: 44.99,
          proposed_deal_price: 34.99,
          currency: 'USD',
          proposed_start_date: '2027-07-08',
          proposed_end_date: '2027-07-09',
          strategy_reason: 'Fill the 30–45 gap with Comfort rather than discounting Classic further.',
          expected_effect: 'Recover the mid band without moving Classic off 39.99.',
          cannibalization_risk: 'At 34.99 Comfort sits under Classic list — Classic must not also run a deal.',
          note: 'Needs a call with the DE team before it can be proposed for EU.',
          source_campaign_reference: 'CSL-0000A31F'
        },
        // Read from campaign_sku_lines through the official line. Absent here (§15.9): SOURCE_MISSING,
        // never "no deal", and NEVER the proposal promoted into its place.
        official: { campaign_sku_line_id: 'CSL-0000A31F', campaign: 'Prime Day 2027',
                    promo_price: null, price_units: 'USD',
                    missing_reason: 'the line exists but promo_price is blank' }
      },
      {
        element_id: 'PSE-2D5B8C60', element_type: 'MATRIX',
        source_type: 'NONE', source_identity: '', source_mode: 'LIVE_REFERENCE',
        author_type: 'HUMAN', created_by: 'vic', updated_by: 'vic',
        created_at: '2027-01-14 09:20', updated_at: '2027-01-16 08:55', version: 2,
        position_x: 11, position_y: 5, width: 4, height: 5, z_index: 5,
        content: {
          title: 'Price × Product Tier',
          x_axis: ['Entry', 'Core', 'Premium'],
          y_axis: ['Manual', 'Assisted'],
          cells: [['CO1105-R', 'CO1100-R', ''], ['', 'CO1120-R', 'CO1180-R']]
        }
      },
      {
        element_id: 'PSE-6E90AF13', element_type: 'SERIES_PRICE_BAND',
        source_type: 'SERIES', source_identity: 'Can Opener', source_mode: 'LIVE_REFERENCE',
        author_type: 'HUMAN', created_by: 'vic', updated_by: 'vic',
        created_at: '2027-01-14 09:30', updated_at: '2027-01-19 14:22', version: 9,
        position_x: 1, position_y: 11, width: 14, height: 7, z_index: 6,
        content: {
          price_basis: 'PRICING_LIST_REGULAR_PRICE',
          currency_basis: 'AS_QUOTED_SINGLE_CURRENCY',
          gap_threshold: 8.00
        }
      }
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

  /* ==========================================================================================
     2. IN-MEMORY STATE. Not persisted anywhere, by design (§22.2).
     ========================================================================================== */
  var STATE = {
    selectedId: 'PSE-6E90AF13',
    series: 'Can Opener',
    boardVersion: 12,
    lastCheckpoint: '14:22',
    revisions: MOCK.revisions.slice(),
    modes: {},          // element_id -> source_mode override made in this page session
    revSeq: 0
  };
  MOCK.elements.forEach(function (el) { STATE.modes[el.element_id] = el.source_mode; });

  /* ==========================================================================================
     3. SMALL HELPERS
     ========================================================================================== */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }
  function money(v, cur) {
    if (v === null || v === undefined) return null;
    return Number(v).toFixed(2) + (cur ? ' ' + cur : '');
  }
  // PRICES ARE COMPARED IN INTEGER CENTS, never as binary floats.
  // 32.99 - 24.99 is 8.000000000000004 in IEEE-754, so a step EXACTLY equal to the threshold
  // would be reported as a gap and then labelled "gap 8.00 exceeds threshold 8.00" - a finding
  // that refutes itself on screen. Every price comparison below goes through cents().
  function cents(v) { return Math.round(Number(v) * 100); }
  function byId(id) { return document.getElementById(id); }
  function mode(elem) { return STATE.modes[elem.element_id] || elem.source_mode; }
  function elementById(id) {
    for (var i = 0; i < MOCK.elements.length; i++) {
      if (MOCK.elements[i].element_id === id) return MOCK.elements[i];
    }
    return null;
  }
  // A deterministic-looking id, purely so the prototype's new rows look like §6.5 ids.
  // This is NOT fnv1a and is not a contract — the real derivation is in the design freeze.
  function fakeId(prefix, seedText) {
    var h = 0x811c9dc5;
    for (var i = 0; i < seedText.length; i++) {
      h ^= seedText.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return prefix + '-' + ('00000000' + h.toString(16)).slice(-8).toUpperCase();
  }
  function badge(cls, text, title) {
    var b = el('span', 'badge badge--' + cls, text);
    if (title) b.title = title;
    return b;
  }
  function kv(pairs) {
    var d = el('dl', 'kv');
    pairs.forEach(function (p) {
      d.appendChild(el('dt', null, p[0]));
      var dd = el('dd', p[2] || 'num', p[1] === null || p[1] === undefined ? '—' : p[1]);
      d.appendChild(dd);
    });
    return d;
  }

  /* ==========================================================================================
     4. PRICE-BAND ARITHMETIC (§9.3) — the whole point is that the picture is CHECKABLE.
     Every finding is computed here and carries the number that produced it.
     ========================================================================================== */

  // Split members by currency. D-3: one axis serves exactly one currency, always.
  function splitByCurrency(members) {
    var plotted = [], missing = [], byCur = {}, order = [];
    members.forEach(function (m) {
      if (m.regular_price === null || m.regular_price === undefined) { missing.push(m); return; }
      plotted.push(m);
      if (!byCur[m.currency]) { byCur[m.currency] = []; order.push(m.currency); }
      byCur[m.currency].push(m);
    });
    order.sort();
    return { tracks: order.map(function (c) { return { currency: c, members: byCur[c] }; }),
             missing: missing, plottedCount: plotted.length };
  }

  // The deal price a member actually has, and whether it is official or a proposal.
  function dealOf(m) {
    if (m.promo_price !== null && m.promo_price !== undefined) {
      return { price: m.promo_price, kind: 'OFFICIAL' };
    }
    if (m.proposed_deal_price !== null && m.proposed_deal_price !== undefined) {
      return { price: m.proposed_deal_price, kind: 'PROPOSAL' };
    }
    return null;
  }

  function analyseTrack(track, threshold) {
    var ms = track.members.slice().sort(function (a, b) { return a.regular_price - b.regular_price; });
    var lo = ms[0].regular_price, hi = ms[ms.length - 1].regular_price;
    var pad = Math.max((hi - lo) * 0.12, 1.5);
    var d0 = lo - pad, d1 = hi + pad;

    // Entry / core / premium are POSITIONS in the sorted list (§9.3.5) — no tier column exists.
    ms.forEach(function (m, i) {
      m._tier = (ms.length === 1) ? 'only'
              : (i === 0) ? 'entry'
              : (i === ms.length - 1) ? 'premium'
              : 'core';
      m._deal = dealOf(m);
      // The member's interval: from its deal price (if any) up to its regular price.
      m._span = m._deal ? [Math.min(m._deal.price, m.regular_price), m.regular_price]
                        : [m.regular_price, m.regular_price];
    });

    // GAP — adjacent distance greater than the user-set threshold, which is DISPLAYED with it.
    var gaps = [];
    for (var i = 1; i < ms.length; i++) {
      var distC = cents(ms[i].regular_price) - cents(ms[i - 1].regular_price);
      if (distC > cents(threshold)) {
        gaps.push({ from: ms[i - 1], to: ms[i], distance: distC / 100 });
      }
    }

    // OVERLAP — two members whose [deal, regular] intervals intersect.
    var overlaps = [];
    for (var a = 0; a < ms.length; a++) {
      for (var b = a + 1; b < ms.length; b++) {
        var A = ms[a]._span, B = ms[b]._span;
        var loI = Math.max(A[0], B[0]), hiI = Math.min(A[1], B[1]);
        if (cents(loI) < cents(hiI)) {
          overlaps.push({
            a: ms[a], b: ms[b], from: loI, to: hiI,
            proposal_driven: (ms[a]._deal && ms[a]._deal.kind === 'PROPOSAL') ||
                             (ms[b]._deal && ms[b]._deal.kind === 'PROPOSAL')
          });
        }
      }
    }

    // CANNIBALISATION — A's deal price <= B's regular price, where B sits BELOW A in normal order.
    var cann = [];
    ms.forEach(function (A, ia) {
      if (!A._deal) return;
      ms.forEach(function (B, ib) {
        if (ib >= ia) return;                        // B must sit below A
        if (cents(A._deal.price) <= cents(B.regular_price)) {
          cann.push({ higher: A, lower: B, deal: A._deal.price, kind: A._deal.kind });
        }
      });
    });

    return { members: ms, d0: d0, d1: d1, lo: lo, hi: hi,
             gaps: gaps, overlaps: overlaps, cannibalisation: cann };
  }

  function pct(v, d0, d1) { return ((v - d0) / (d1 - d0)) * 100; }

  function renderTrack(track, threshold, trackCount) {
    var A = analyseTrack(track, threshold);
    var wrap = el('div', 'track');

    var head = el('div', 'track-head');
    head.appendChild(el('span', 'track-cur', track.currency));
    head.appendChild(el('span', 'track-domain',
      money(A.lo, '') + ' – ' + money(A.hi, '') + '  ·  ' + A.members.length + ' plotted'));
    if (trackCount > 1) {
      head.appendChild(el('span', 'track-note', 'own axis, own domain — never compared across tracks'));
    }
    wrap.appendChild(head);

    var axis = el('div', 'axis');
    axis.appendChild(el('div', 'axis-line'));
    var e0 = el('div', 'axis-end axis-end--lo', money(A.d0, '')); axis.appendChild(e0);
    var e1 = el('div', 'axis-end axis-end--hi', money(A.d1, '')); axis.appendChild(e1);

    // markers
    A.members.forEach(function (m) {
      var x = pct(m.regular_price, A.d0, A.d1);
      var mk = el('div', 'mk'); mk.style.left = x + '%';
      var lab = el('div', 'mk-label');
      lab.appendChild(el('span', 'sku', m.sku));
      lab.appendChild(el('span', 'price', money(m.regular_price, track.currency)));
      mk.appendChild(lab);
      mk.appendChild(el('div', 'mk-dot'));
      var tier = el('div', 'mk-tier');
      var tb = el('b', null, m._tier); tier.appendChild(tb);
      mk.appendChild(tier);
      mk.title = m.sku + ' — ' + m.product_name + '\n' + m.scope +
                 '\nregular_price ' + money(m.regular_price, track.currency) +
                 ' (pricing_list.regular_price)';
      axis.appendChild(mk);

      if (m._deal) {
        var dx = pct(m._deal.price, A.d0, A.d1);
        var dmk = el('div', 'mk'); dmk.style.left = dx + '%';
        dmk.appendChild(el('div', 'mk-dia' + (m._deal.kind === 'PROPOSAL' ? ' mk-dia--prop' : '')));
        dmk.title = m.sku + ' — ' +
          (m._deal.kind === 'OFFICIAL'
            ? 'campaign_sku_lines.promo_price ' + money(m._deal.price, track.currency) +
              (m.campaign ? '\n' + m.campaign : '')
            : 'PROPOSAL — board-owned proposed_deal_price ' + money(m._deal.price, track.currency) +
              '\nNot a Deal. Not written to campaign_sku_lines.');
        axis.appendChild(dmk);
      }
    });

    // overlap bars
    A.overlaps.forEach(function (o) {
      var x0 = pct(o.from, A.d0, A.d1), x1 = pct(o.to, A.d0, A.d1);
      var bar = el('div', 'span');
      bar.style.left = x0 + '%'; bar.style.width = Math.max(x1 - x0, 0.6) + '%';
      bar.title = 'overlap ' + money(o.from, track.currency) + ' – ' + money(o.to, track.currency) +
                  '\n' + o.a.sku + ' ∩ ' + o.b.sku + (o.proposal_driven ? '\nproposal-driven' : '');
      axis.appendChild(bar);
      var lb = el('div', 'span-label', 'overlap ' + (o.to - o.from).toFixed(2) +
                  (o.proposal_driven ? ' (prop)' : ''));
      lb.style.left = ((x0 + x1) / 2) + '%';
      axis.appendChild(lb);
    });

    // gap markers — always labelled with the threshold that produced them
    A.gaps.forEach(function (g) {
      var x0 = pct(g.from.regular_price, A.d0, A.d1), x1 = pct(g.to.regular_price, A.d0, A.d1);
      var gm = el('div', 'gapmark');
      gm.style.left = x0 + '%'; gm.style.width = (x1 - x0) + '%';
      gm.title = 'gap ' + g.distance.toFixed(2) + ' > threshold ' + threshold.toFixed(2);
      axis.appendChild(gm);
      var gl = el('div', 'gapmark-label', 'gap ' + g.distance.toFixed(2) + ' (thr ' + threshold.toFixed(2) + ')');
      gl.style.left = ((x0 + x1) / 2) + '%';
      axis.appendChild(gl);
    });

    wrap.appendChild(axis);

    // findings, each carrying its own arithmetic
    var f = el('div', 'findings');
    A.gaps.forEach(function (g) {
      var n = el('div', 'finding finding--gap');
      n.appendChild(el('b', null, 'GAP '));
      n.appendChild(document.createTextNode(
        g.from.sku + ' → ' + g.to.sku + ' = ' + g.distance.toFixed(2) + ' ' + track.currency + ' '));
      n.appendChild(el('span', 'why', '— exceeds gap_threshold ' + threshold.toFixed(2) +
        ' (the threshold is displayed because a gap marking whose threshold is invisible is an opinion)'));
      f.appendChild(n);
    });
    A.overlaps.forEach(function (o) {
      var n = el('div', 'finding finding--over');
      n.appendChild(el('b', null, 'OVERLAP '));
      n.appendChild(document.createTextNode(
        o.a.sku + ' ∩ ' + o.b.sku + ' over ' + money(o.from, track.currency) + ' – ' +
        money(o.to, track.currency) + ' '));
      n.appendChild(el('span', 'why', o.proposal_driven
        ? '— caused by a PROPOSED deal price, not a live campaign'
        : '— both intervals are live'));
      f.appendChild(n);
    });
    A.cannibalisation.forEach(function (c) {
      var n = el('div', 'finding finding--cann');
      n.appendChild(el('b', null, 'CANNIBALISATION '));
      n.appendChild(document.createTextNode(
        c.higher.sku + ' deal ' + money(c.deal, track.currency) + ' ≤ ' +
        c.lower.sku + ' regular ' + money(c.lower.regular_price, track.currency) + ' '));
      n.appendChild(el('span', 'why', c.kind === 'PROPOSAL'
        ? '— PROPOSAL-DRIVEN. This warning comes from an idea on this board, not from a live campaign.'
        : '— from a live campaign price'));
      f.appendChild(n);
    });
    if (!f.childNodes.length) {
      f.appendChild(el('div', 'finding', 'No gap, overlap or cannibalisation finding in this track.'));
    }
    wrap.appendChild(f);

    return wrap;
  }

  function renderPriceBand(elem) {
    var members = MOCK.bands[STATE.series] || [];
    var split = splitByCurrency(members);
    var threshold = elem.content.gap_threshold;

    var card = el('div', 'el el--band');
    card.dataset.id = elem.element_id;

    var head = el('div', 'el-head');
    head.appendChild(el('span', 'el-type', 'SERIES_PRICE_BAND'));
    head.appendChild(el('span', 'el-title', STATE.series));
    head.appendChild(badge('live', 'LIVE_REFERENCE'));
    head.appendChild(el('span', 'el-id', elem.element_id));
    card.appendChild(head);

    var basis = el('div', 'band-head');
    var b1 = el('span', 'band-basis');
    b1.appendChild(document.createTextNode('price_basis '));
    b1.appendChild(el('code', null, 'PRICING_LIST_REGULAR_PRICE'));
    b1.appendChild(document.createTextNode('  ·  currency_basis '));
    b1.appendChild(el('code', null, 'AS_QUOTED_SINGLE_CURRENCY'));
    b1.appendChild(document.createTextNode('  ·  gap_threshold ' + threshold.toFixed(2)));
    basis.appendChild(b1);
    card.appendChild(basis);

    // D-3 — the split IS the answer; the refusal explains why it is not one picture.
    if (split.tracks.length > 1) {
      var ref = el('div', 'refusal');
      var rc = el('code', null, 'MIXED_CURRENCY_COMPARISON_REFUSED');
      ref.appendChild(rc);
      ref.appendChild(document.createTextNode('  ' +
        split.tracks.map(function (t) { return t.currency + ' (' + t.members.length + ')'; }).join(' · ')));
      var p = el('p', null,
        'Members resolve to more than one currency, so this element splits into one band track per ' +
        'currency, each with its own axis and its own domain. No shared axis is drawn and no ' +
        'conversion is performed — pricing_list.fx_rate is displayed as a source fact where present ' +
        'and is never applied. P1 decides no FX policy.');
      ref.appendChild(p);
      card.appendChild(ref);
    }

    split.tracks.forEach(function (t) {
      card.appendChild(renderTrack(t, threshold, split.tracks.length));
    });

    var leg = el('div', 'legend');
    [['● ', 'regular_price', 'pricing_list.regular_price — the one band basis (D-2)'],
     ['◆ ', 'promo_price', 'campaign_sku_lines.promo_price — the ONLY official deal price'],
     ['◇ ', 'proposed_deal_price', 'board-owned PROPOSAL (D-4) — never official, never written back'],
     ['', 'entry / core / premium', 'positions in the sorted list, not a column — no tier column exists']
    ].forEach(function (row) {
      var s = el('span');
      s.appendChild(el('b', null, row[0] + row[1]));
      s.appendChild(document.createTextNode(' — ' + row[2]));
      leg.appendChild(s);
    });
    card.appendChild(leg);

    // D-2 / §9.3.6 — listed, not plotted, with the reason. Never back-filled.
    if (split.missing.length) {
      var np = el('div', 'notplotted');
      np.appendChild(el('h4', null, 'SOURCE_MISSING — listed, plotted nowhere (' + split.missing.length + ')'));
      var ul = el('ul');
      split.missing.forEach(function (m) {
        var li = el('li');
        li.appendChild(el('strong', null, m.sku));
        li.appendChild(document.createTextNode(' ' + m.product_name + ' — ' + m.missing_reason + '. '));
        li.appendChild(el('em', null,
          'Not back-filled from sku_details.selling_price: that is a master base input, not a site ' +
          'effective price, and a substituted point would render identically to a measured one.'));
        ul.appendChild(li);
      });
      np.appendChild(ul);
      np.appendChild(el('p', 'src-note',
        'A Series where ' + split.missing.length + ' of ' + members.length +
        ' members have no regular_price must not look like a ' + split.plottedCount + '-member Series.'));
      card.appendChild(np);
    }

    return card;
  }

  /* ==========================================================================================
     5. ELEMENT CARD RENDERERS
     ========================================================================================== */

  function cardShell(elem, title) {
    var card = el('div', 'el');
    card.dataset.id = elem.element_id;
    if (elem.element_type === 'TEXT_NOTE') card.className += ' el--note';
    if (elem.element_type === 'DEAL_PLAN') card.className += ' el--deal';
    if (elem.element_type === 'MATRIX') card.className += ' el--matrix';

    var head = el('div', 'el-head');
    head.appendChild(el('span', 'el-type', elem.element_type));
    head.appendChild(el('span', 'el-title', title));
    if (elem.element_type !== 'TEXT_NOTE' && elem.element_type !== 'MATRIX') {
      var m = mode(elem);
      head.appendChild(m === 'FROZEN_SNAPSHOT'
        ? badge('frozen', 'FROZEN_SNAPSHOT', 'Shows the values that were on screen when it was frozen')
        : badge('live', 'LIVE_REFERENCE', 'Stores only the identity; resolves on every board open'));
    }
    head.appendChild(el('span', 'el-id', elem.element_id));
    card.appendChild(head);
    return card;
  }

  function renderTextNote(elem) {
    var card = cardShell(elem, elem.content.title);
    card.appendChild(el('div', 'note-text', elem.content.text));
    return card;
  }

  function renderSkuCard(elem) {
    var card = cardShell(elem, elem.source_identity);
    var r = elem.resolved;
    card.appendChild(kv([
      ['product_name', r.product_name, 'txt'],
      ['series', r.series, 'txt'],
      ['lifecycle', r.lifecycle, 'txt'],
      ['regular_price', money(r.regular_price, r.currency)],
      ['msrp', money(r.msrp, r.currency)],
      ['minimum_price', money(r.minimum_price, r.currency)],
      ['price_source', r.price_source, 'txt'],
      ['current selling price', 'not shown (D-6)', 'missing']
    ]));
    var n = el('div', 'src-note');
    n.appendChild(document.createTextNode('Prices from '));
    n.appendChild(el('code', null, 'pricing_list'));
    n.appendChild(document.createTextNode('; identity and series from '));
    n.appendChild(el('code', null, 'sku_details'));
    n.appendChild(document.createTextNode('. '));
    n.appendChild(el('strong', null, 'No "current selling price" and no margin: '));
    n.appendChild(document.createTextNode(
      'neither column exists (D-6, D-8), and nothing is shown in their place — not blank, not zero, ' +
      'not a substitute.'));
    card.appendChild(n);
    return card;
  }

  function renderRegionalCard(elem) {
    var card = cardShell(elem, elem.source_identity);
    var s = elem.snapshot, v = s.values;
    card.appendChild(kv([
      ['site_sku', v.site_sku, 'txt'],
      ['marketplace_product_id', v.marketplace_product_id, 'txt'],
      ['status', v.marketplace_sku_status, 'txt'],
      ['regular_price', money(v.regular_price, v.currency)],
      ['label_version', v.label_version, 'txt'],
      ['captured_at', s.captured_at, 'txt']
    ]));

    var n = el('div', 'src-note');
    n.appendChild(el('strong', null, 'Status comes from marketplace_skus, not from this table. '));
    n.appendChild(document.createTextNode(
      'sku_regional_details declares in its own header that it carries no status column, so the card ' +
      'resolves marketplace_sku_status on the shared sku+company+country+marketplace grain and labels ' +
      'it as such. value_provenance records the column behind every frozen number.'));
    card.appendChild(n);

    var d = el('div', 'src-note');
    d.appendChild(el('strong', null, 'Refresh would show a diff, not a rewrite: '));
    d.appendChild(document.createTextNode(
      'live regular_price is now ' + money(elem.live_now.regular_price, v.currency) +
      ' while the snapshot holds ' + money(v.regular_price, v.currency) +
      '. The snapshot always renders. A re-freeze is an explicit action, increments snapshot_version, ' +
      'and writes its FREEZE_SNAPSHOT revision first.'));
    card.appendChild(d);
    return card;
  }

  function renderDealPlan(elem) {
    var c = elem.content, o = elem.official;
    var card = cardShell(elem, 'CO1120-R — Comfort mid-band');

    // Permanent, non-dismissible PROPOSAL ONLY marker (§7.4.3)
    var mk = el('div', 'deal-marker');
    mk.appendChild(el('strong', null, 'PROPOSAL ONLY'));
    mk.appendChild(el('span', null,
      'Board-owned. Writes nothing to campaigns, campaign_sku_lines or pricing_list. ' +
      'No Deal has been created, scheduled, submitted or approved.'));
    card.appendChild(mk);

    var split = el('div', 'deal-split');

    var pc = el('div', 'deal-col');
    var h1 = el('h4', null, 'Proposal (board-owned)');
    h1.appendChild(badge('prop', 'proposed_*'));
    pc.appendChild(h1);
    pc.appendChild(kv([
      ['proposed_regular_price', money(c.proposed_regular_price, c.currency)],
      ['proposed_deal_price', money(c.proposed_deal_price, c.currency)],
      ['proposed_start_date', c.proposed_start_date, 'txt'],
      ['proposed_end_date', c.proposed_end_date, 'txt']
    ]));
    split.appendChild(pc);

    var oc = el('div', 'deal-col deal-col--official');
    var h2 = el('h4', null, 'Official campaign line (read only)');
    h2.appendChild(badge('miss', 'SOURCE_MISSING'));
    oc.appendChild(h2);
    oc.appendChild(kv([
      ['campaign_sku_line_id', o.campaign_sku_line_id, 'txt'],
      ['campaign', o.campaign, 'txt'],
      ['promo_price', 'SOURCE_MISSING', 'missing'],
      ['price_units', o.price_units, 'txt']
    ]));
    var on = el('div', 'src-note');
    on.appendChild(el('strong', null, 'Missing, not "no deal". '));
    on.appendChild(document.createTextNode(
      o.missing_reason + '. The proposal on the left is NOT promoted into this value, and the two are ' +
      'never merged, averaged, or drawn on one marker.'));
    oc.appendChild(on);
    split.appendChild(oc);

    card.appendChild(split);

    var free = el('div', 'deal-free');
    [['strategy_reason', c.strategy_reason],
     ['expected_effect', c.expected_effect],
     ['cannibalization_risk', c.cannibalization_risk],
     ['note', c.note]].forEach(function (row) {
      var p = el('div');
      p.appendChild(el('b', null, row[0] + ': '));
      p.appendChild(document.createTextNode(row[1]));
      free.appendChild(p);
    });
    card.appendChild(free);

    var n = el('div', 'src-note');
    n.appendChild(el('strong', null, 'Closed field list. '));
    n.appendChild(document.createTextNode(
      'content_json accepts exactly ten keys and the handler refuses any other ' +
      '(DEAL_PLAN_UNKNOWN_FIELD). Every price and date key is prefixed proposed_, so no key here ' +
      'shares a name with campaign_sku_lines.promo_price, campaign_sku_lines.regular_price, ' +
      'campaigns.start_date or campaigns.end_date. There is no promotion button, no action name and ' +
      'no reserved router branch.'));
    card.appendChild(n);
    return card;
  }

  function renderMatrix(elem) {
    var c = elem.content;
    var card = cardShell(elem, c.title);
    var t = el('table', 'mx');
    var thead = el('thead'), hr = el('tr');
    hr.appendChild(el('th', null, ''));
    c.x_axis.forEach(function (x) { hr.appendChild(el('th', null, x)); });
    thead.appendChild(hr); t.appendChild(thead);
    var tb = el('tbody');
    c.y_axis.forEach(function (y, i) {
      var tr = el('tr');
      tr.appendChild(el('th', null, y));
      c.x_axis.forEach(function (x, j) {
        var v = (c.cells[i] && c.cells[i][j]) || '';
        tr.appendChild(el('td', v ? 'filled' : null, v || '—'));
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    card.appendChild(t);
    card.appendChild(el('div', 'src-note',
      'Cells reference element_ids. Fixed grid in P1 — no infinite canvas, no live cursors.'));
    return card;
  }

  /* ==========================================================================================
     6. BOARD RENDER
     ========================================================================================== */
  function renderBoard() {
    var host = byId('boardItems');
    host.textContent = '';

    var row1 = el('div', 'board-row');
    row1.appendChild(renderTextNote(elementById('PSE-4A17C0D2')));
    row1.appendChild(renderSkuCard(elementById('PSE-91B3E7A4')));
    row1.appendChild(renderRegionalCard(elementById('PSE-3F02D8BB')));
    host.appendChild(row1);

    var row2 = el('div', 'board-row');
    row2.appendChild(renderDealPlan(elementById('PSE-77CE1904')));
    row2.appendChild(renderMatrix(elementById('PSE-2D5B8C60')));
    host.appendChild(row2);

    var row3 = el('div', 'board-row');
    row3.appendChild(renderPriceBand(elementById('PSE-6E90AF13')));
    host.appendChild(row3);

    // selection highlight
    var cards = host.querySelectorAll('.el');
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].dataset.id === STATE.selectedId) cards[i].classList.add('is-selected');
    }
  }

  /* ==========================================================================================
     7. PROPERTIES PANEL
     ========================================================================================== */
  function renderProps() {
    var host = byId('propsBody');
    host.textContent = '';
    var elem = elementById(STATE.selectedId);
    if (!elem) {
      host.appendChild(el('p', 'props-empty', 'Select an element on the board.'));
      return;
    }

    var top = el('div');
    top.appendChild(el('span', 'props-el', elem.element_type));
    host.appendChild(top);

    // source
    var s1 = el('div', 'props-sec');
    s1.appendChild(el('h4', null, 'Source'));
    var dl = el('dl', 'props-kv');
    [['source_type', elem.source_type],
     ['source_identity', elem.source_identity || '""']].forEach(function (p) {
      dl.appendChild(el('dt', null, p[0]));
      var dd = el('dd'); dd.appendChild(el('code', null, p[1])); dl.appendChild(dd);
    });
    s1.appendChild(dl);
    host.appendChild(s1);

    // mode
    var s2 = el('div', 'props-sec');
    s2.appendChild(el('h4', null, 'Mode'));
    if (elem.source_type === 'NONE') {
      s2.appendChild(el('p', 'props-note',
        'This element has no source, so the live/snapshot distinction does not apply to it.'));
    } else {
      var group = el('div', 'mode-radio');
      [['LIVE_REFERENCE', 'Live — stores only the identity'],
       ['FROZEN_SNAPSHOT', 'Snapshot — stores the displayed values + captured_at']
      ].forEach(function (opt) {
        var lab = el('label');
        var r = document.createElement('input');
        r.type = 'radio'; r.name = 'mode'; r.value = opt[0];
        r.checked = (mode(elem) === opt[0]);
        r.addEventListener('change', function () {
          STATE.modes[elem.element_id] = opt[0];
          if (opt[0] === 'FROZEN_SNAPSHOT') {
            // §8.6 — a freeze writes its revision, and it writes it FIRST.
            addRevision('FREEZE_SNAPSHOT');
          }
          renderBoard(); renderProps();
        });
        lab.appendChild(r);
        lab.appendChild(document.createTextNode(opt[1]));
        group.appendChild(lab);
      });
      s2.appendChild(group);
      var cap = el('dl', 'props-kv');
      cap.appendChild(el('dt', null, 'captured_at'));
      cap.appendChild(el('dd', null,
        mode(elem) === 'FROZEN_SNAPSHOT' && elem.snapshot ? elem.snapshot.captured_at : '—'));
      if (elem.snapshot) {
        cap.appendChild(el('dt', null, 'snap_ver'));
        cap.appendChild(el('dd', null, String(elem.snapshot.snapshot_version)));
      }
      s2.appendChild(cap);
      s2.appendChild(el('p', 'props-note',
        'Switching to Snapshot writes a FREEZE_SNAPSHOT revision before the element write (D-7, §8.6). ' +
        'A re-freeze is never silent: it increments snapshot_version and writes a new captured_at.'));
    }
    host.appendChild(s2);

    // notes
    var s3 = el('div', 'props-sec');
    s3.appendChild(el('h4', null, 'Notes'));
    var ta = document.createElement('textarea');
    ta.className = 'props-textarea';
    ta.value = (elem.content && (elem.content.note || elem.content.text)) || '';
    ta.setAttribute('aria-label', 'Element notes');
    s3.appendChild(ta);
    s3.appendChild(el('p', 'props-note', 'Board-owned content. It has no path to any source table.'));
    host.appendChild(s3);

    // geometry
    var s4 = el('div', 'props-sec');
    s4.appendChild(el('h4', null, 'Position / size'));
    var g = el('dl', 'props-kv');
    [['position_x', elem.position_x], ['position_y', elem.position_y],
     ['width', elem.width], ['height', elem.height], ['z_index', elem.z_index]
    ].forEach(function (p) {
      g.appendChild(el('dt', null, p[0]));
      g.appendChild(el('dd', null, String(p[1])));
    });
    s4.appendChild(g);
    s4.appendChild(el('p', 'props-note',
      'Geometry changes do NOT create a revision (§6.3). Drag, resize, pan, zoom and select never do.'));
    host.appendChild(s4);

    // audit
    var s5 = el('div', 'props-sec');
    s5.appendChild(el('h4', null, 'Audit'));
    var a = el('dl', 'props-kv');
    a.appendChild(el('dt', null, 'author_type'));
    var addl = el('dd');
    addl.appendChild(el('span', 'author-pill', elem.author_type));
    a.appendChild(addl);
    [['created_by', elem.created_by], ['created_at', elem.created_at],
     ['updated_by', elem.updated_by], ['updated_at', elem.updated_at],
     ['version', String(elem.version)], ['deleted', 'false']
    ].forEach(function (p) {
      a.appendChild(el('dt', null, p[0]));
      a.appendChild(el('dd', null, p[1]));
    });
    s5.appendChild(a);
    s5.appendChild(el('p', 'props-note',
      'author_type is a real column, written explicitly as HUMAN — never left blank to mean human. ' +
      'A blank is a third state, and the AI seam distinguishes AI content by the presence of a value.'));
    host.appendChild(s5);
  }

  /* ==========================================================================================
     8. REVISIONS
     ========================================================================================== */
  function nowHM() {
    var d = new Date();
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }
  function nowStamp() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
           ('0' + d.getDate()).slice(-2) + ' ' + nowHM();
  }

  function addRevision(type) {
    STATE.revSeq += 1;
    STATE.boardVersion += 1;
    var idem = 'proto-' + type + '-' + STATE.revSeq;
    STATE.revisions.push({
      revision_id: fakeId('PSR', 'PSR|b1|' + type + '|' + idem),
      revision_type: type,
      board_version: STATE.boardVersion,
      author_type: 'HUMAN',
      created_by: 'vic',
      created_at: nowStamp(),
      _fresh: true
    });
    if (type === 'SAVE_CHECKPOINT') STATE.lastCheckpoint = nowHM();
    renderRevisions();
    renderMeta();
  }

  function renderRevisions() {
    var body = byId('revBody');
    body.textContent = '';
    STATE.revisions.slice().reverse().forEach(function (r) {
      var tr = el('tr', r._fresh ? 'rev-row--fresh' : null);
      tr.appendChild(el('td', null, r.revision_id));
      var td = el('td');
      td.appendChild(el('span',
        'rev-type' + (r.revision_type === 'FREEZE_SNAPSHOT' ? ' rev-type--freeze' : ''),
        r.revision_type));
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
     9. WIRING
     ========================================================================================== */
  byId('boardItems').addEventListener('click', function (ev) {
    var node = ev.target;
    while (node && node !== this && !(node.classList && node.classList.contains('el'))) {
      node = node.parentNode;
    }
    if (node && node.dataset && node.dataset.id) {
      STATE.selectedId = node.dataset.id;
      renderBoard();
      renderProps();
    }
  });

  byId('seriesSelect').addEventListener('change', function () {
    STATE.series = this.value;
    var band = elementById('PSE-6E90AF13');
    band.source_identity = this.value;
    renderBoard();
    renderProps();
  });

  byId('btnCheckpoint').addEventListener('click', function () {
    addRevision('SAVE_CHECKPOINT');
    var drawer = byId('historyDrawer');
    if (drawer.hidden) { drawer.hidden = false; byId('btnHistory').setAttribute('aria-expanded', 'true'); }
  });

  byId('btnHistory').addEventListener('click', function () {
    var drawer = byId('historyDrawer');
    drawer.hidden = !drawer.hidden;
    this.setAttribute('aria-expanded', drawer.hidden ? 'false' : 'true');
  });
  byId('btnHistoryClose').addEventListener('click', function () {
    byId('historyDrawer').hidden = true;
    byId('btnHistory').setAttribute('aria-expanded', 'false');
  });

  byId('btnNewBoard').addEventListener('click', function () {
    // The seeding of a SERIES_PRICE_ARCHITECTURE board writes one SAVE_CHECKPOINT (§11.4), so a
    // board has a restorable initial state from the moment it exists. Nothing is created here.
    window.alert(
      'Prototype only — no board is created.\n\n' +
      'In P1 this seeds a SKU Series Price Architecture Board: one TEXT_NOTE, one SERIES_PRICE_BAND ' +
      'bound to the Series in the top bar, one MATRIX labelled Price x Product Tier, and one empty ' +
      'DEAL_PLAN — plus one SAVE_CHECKPOINT revision, so the initial state is restorable.');
  });

  byId('boardSelect').addEventListener('change', function () {
    window.alert('Prototype only — board switching is not implemented. ' +
                 'One board is illustrated, with the Series filter live.');
    this.selectedIndex = 0;
  });

  Array.prototype.forEach.call(document.querySelectorAll('.tool:not(:disabled)'), function (b) {
    b.addEventListener('click', function () {
      window.alert('Prototype only — element placement is not implemented.\n\n' +
                   'Tool: ' + this.dataset.tool + '\n\n' +
                   'Placement, drag, resize, pan and zoom belong to the Canvas Core (design freeze ' +
                   'section 11.5), which P1 extracts. This page demonstrates the information ' +
                   'architecture, not the engine.');
    });
  });

  /* ---------------------------------------------------------------- boot */
  renderBoard();
  renderProps();
  renderRevisions();
  renderMeta();
})();
