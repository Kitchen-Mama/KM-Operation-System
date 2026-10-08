// S8-R4D-F1B-R2 — RESTING GAP PROBE.  READ-ONLY.  Paste into the DevTools console on Site Inventory.
//
// WHAT IT DOES: measures the two inter-block gaps and enumerates everything that could own them.
// WHAT IT DOES NOT DO: it calls no page function, issues no request, writes no storage, changes no DOM and
// touches no state. Every statement below is a read. It is safe to run on Production, repeatedly.
//
// HOW TO USE
//   1. Load Site Inventory, choose the site, press Search, and let the table finish rendering.
//   2. Scroll to the very top (the contract is about the RESTING position; the probe refuses to measure
//      otherwise rather than reporting a scrolled number as a resting one).
//   3. Paste this whole file into the console and press Enter.
//   4. Copy the entire output. Repeat for US/Amazon, US/Shopify and EU/Amazon.
//
// Report `copy(__F1B_R2__.json)` to put the machine-readable blob on the clipboard.
(function () {
  'use strict';
  var out = {};
  function r(el) {
    if (!el) return null;
    var b = el.getBoundingClientRect();
    return { top: +b.top.toFixed(2), bottom: +b.bottom.toFixed(2), left: +b.left.toFixed(2),
      right: +b.right.toFixed(2), width: +b.width.toFixed(2), height: +b.height.toFixed(2) };
  }
  function cs(el, props) {
    if (!el) return null;
    var c = getComputedStyle(el), o = {};
    props.forEach(function (p) { o[p] = c.getPropertyValue(p); });
    return o;
  }
  function name(el) {
    if (!el) return '(missing)';
    return el.tagName.toLowerCase() +
      (el.id ? '#' + el.id : '') +
      (el.className && typeof el.className === 'string' && el.className.trim()
        ? '.' + el.className.trim().split(/\s+/).join('.') : '');
  }

  // ---- 0. provenance: WHICH BYTES am I measuring? -------------------------------------------------------
  out.page = { url: location.pathname, scrollY: window.scrollY, dpr: window.devicePixelRatio,
    innerWidth: window.innerWidth, innerHeight: window.innerHeight };
  out.assets = performance.getEntriesByType('resource')
    .filter(function (e) { return /inventory-replenishment\.(js|css)/.test(e.name); })
    .map(function (e) { return e.name.replace(/^.*\/(?=assets)/, ''); });
  // A missing element and an empty one are DIFFERENT diagnoses and the first version of this probe conflated
  // them with `|| null`. Reported separately now.
  function selState(id) {
    var el = document.getElementById(id);
    if (!el) return { present: false, value: null };
    return { present: true, value: String(el.value == null ? '' : el.value) };
  }
  out.scope = {
    country: selState('replenCountry'),
    marketplace: selState('replenMarketplace'),
    applied: (window._irRenderScope_ ? window._irRenderScope_() : '(_irRenderScope_ not exported)')
  };

  // ---- 0b. PAGE STATE — THE PRECONDITION THE FIRST VERSION DID NOT REPORT -------------------------------
  // The defect under investigation is the stale notice, and the page refuses to render it unless a Search has
  // SUCCEEDED:
  //     _irMarkSearchStale_()  ->  if (!_irSearch.applied) { _irRenderSearchGate_(); return; }
  // So a capture taken with `applied === null` cannot contain the defect, however the selectors are moved.
  // Without this block a worthless checkpoint is indistinguishable from a valid one, which is exactly how the
  // first A/B/C attempt produced three identical captures and no finding.
  out.state = {
    search: (window._irSearchState_ ? window._irSearchState_() : '(_irSearchState_ not exported)'),
    bootstrap: (window._irBootstrapDiagnostic_ ? window._irBootstrapDiagnostic_() : '(not exported)'),
    renderIntegrity: (window._irRenderIntegrity_ ? window._irRenderIntegrity_() : '(not exported)')
  };
  var _s = out.state.search;
  out.VALID_FOR_DEFECT = !!(_s && typeof _s === 'object' && _s.applied &&
    (_s.status === 'READY' || _s.status === 'EMPTY'));
  out.VALID_REASON = out.VALID_FOR_DEFECT
    ? 'a Search has succeeded and a scope is applied — the stale notice CAN render here'
    : 'NO SEARCH HAS SUCCEEDED (applied=' + JSON.stringify(_s && _s.applied) + ', status=' +
      JSON.stringify(_s && _s.status) + '). _irMarkSearchStale_ returns before the notice, so this page ' +
      'CANNOT show the defect. Press Search, confirm the table renders rows, and start again at checkpoint A.';

  // ---- 1. the three blocks, as they actually render ------------------------------------------------------
  var panel = document.querySelector('#ops-section .replen-control-panel');
  var shell = document.querySelector('#ops-section .replen-category-shell');
  var rail  = document.querySelector('#ops-section .replen-category-rail');
  var table = document.getElementById('replen-detail-table');
  var hdr   = document.querySelector('#ops-section .table-header-bar');
  var page  = document.getElementById('opsSection');

  out.blocks = {
    page:  { node: name(page),  rect: r(page) },
    panel: { node: name(panel), rect: r(panel) },
    shell: { node: name(shell), rect: r(shell) },
    rail:  { node: name(rail),  rect: r(rail) },
    table: { node: name(table), rect: r(table) },
    header:{ node: name(hdr),   rect: r(hdr) }
  };

  if (window.scrollY !== 0) {
    out.REFUSED = 'scrollY is ' + window.scrollY + ', not 0. Scroll to the top and re-run: the contract is ' +
      'about the RESTING position, and a sticky block measured mid-scroll is not that.';
  }

  // ---- 2. THE TWO GAPS, three ways ----------------------------------------------------------------------
  // GEOMETRIC   border-box to border-box. This is what the margins actually produce.
  // PERCEIVED   edge of the last VISIBLE thing above to the first VISIBLE thing below. The category shell is
  //             #fff on a white .main-content, so its own box may not be a visible edge at all — the rail's
  //             1px border and the header bar's #f5f5f5 fill are. If GEOMETRIC is equal and PERCEIVED is not,
  //             the defect is which edges the design presents, not which margins it declares.
  function gap(aBottom, bTop) {
    return (aBottom == null || bTop == null) ? null : +(bTop - aBottom).toFixed(2);
  }
  var R = out.blocks;
  out.gaps = {
    GEOMETRIC: {
      A_panel_to_shell: gap(R.panel.rect && R.panel.rect.bottom, R.shell.rect && R.shell.rect.top),
      B_shell_to_table: gap(R.shell.rect && R.shell.rect.bottom, R.table.rect && R.table.rect.top)
    },
    PERCEIVED: {
      A_panel_to_rail:   gap(R.panel.rect && R.panel.rect.bottom, R.rail.rect && R.rail.rect.top),
      B_rail_to_header:  gap(R.rail.rect && R.rail.rect.bottom, R.header.rect && R.header.rect.top),
      B_rail_to_tablebox:gap(R.rail.rect && R.rail.rect.bottom, R.table.rect && R.table.rect.top)
    }
  };
  var g = out.gaps;
  out.gaps.DELTA = {
    geometric_B_minus_A: (g.GEOMETRIC.A_panel_to_shell == null) ? null
      : +(g.GEOMETRIC.B_shell_to_table - g.GEOMETRIC.A_panel_to_shell).toFixed(2),
    perceived_B_minus_A: (g.PERCEIVED.A_panel_to_rail == null) ? null
      : +(g.PERCEIVED.B_rail_to_header - g.PERCEIVED.A_panel_to_rail).toFixed(2)
  };

  // ---- 3. EVERY child of the page root, in order ---------------------------------------------------------
  // This is the one output that can find a cause the source cannot: anything occupying a gap shows up here
  // with a non-zero height between the blocks, whether or not it exists in the markup.
  out.pageChildren = page ? Array.prototype.map.call(page.children, function (el) {
    var c = getComputedStyle(el), b = el.getBoundingClientRect();
    return { node: name(el), display: c.display, position: c.position,
      height: +b.height.toFixed(2), top: +b.top.toFixed(2), bottom: +b.bottom.toFixed(2),
      marginTop: c.marginTop, marginBottom: c.marginBottom,
      inFlow: c.display !== 'none' && c.position !== 'fixed' && c.position !== 'absolute' };
  }) : [];
  out.occupantsOfGapA = out.pageChildren.filter(function (c) {
    return c.inFlow && R.panel.rect && R.shell.rect && c.top >= R.panel.rect.bottom - 0.5 && c.bottom <= R.shell.rect.top + 0.5 && c.height > 0;
  });
  out.occupantsOfGapB = out.pageChildren.filter(function (c) {
    return c.inFlow && R.shell.rect && R.table.rect && c.top >= R.shell.rect.bottom - 0.5 && c.bottom <= R.table.rect.top + 0.5 && c.height > 0;
  });

  // ---- 4. the children of the TABLE CARD, because F1B moved two banners in here -------------------------
  out.tableChildren = table ? Array.prototype.map.call(table.children, function (el) {
    var c = getComputedStyle(el), b = el.getBoundingClientRect();
    return { node: name(el), display: c.display, height: +b.height.toFixed(2), top: +b.top.toFixed(2),
      marginTop: c.marginTop, marginBottom: c.marginBottom };
  }) : [];
  out.banners = ['replenSearchState', 'replen-render-integrity'].map(function (id) {
    var el = document.getElementById(id);
    return { id: id, exists: !!el, parent: el ? name(el.parentElement) : null,
      display: el ? getComputedStyle(el).display : null, height: el ? +el.getBoundingClientRect().height.toFixed(2) : null,
      childCount: el ? el.children.length : null };
  });

  // ---- 5. computed geometry + the PAINT properties that decide where an edge APPEARS --------------------
  var GEO = ['margin-top', 'margin-bottom', 'padding-top', 'padding-bottom', 'border-top-width',
    'border-bottom-width', 'height', 'min-height', 'box-sizing', 'display', 'position', 'top', 'z-index',
    'overflow-x', 'overflow-y', 'scrollbar-gutter', 'transform'];
  var PAINT = ['background-color', 'box-shadow', 'border-top-color', 'border-bottom-color', 'border-radius'];
  out.computed = {
    main:   cs(document.querySelector('.main-content'), ['background-color']),
    content:cs(document.querySelector('.content-area'), ['background-color', 'padding-top', 'padding-bottom']),
    page:   cs(page,  GEO.concat(PAINT)),
    panel:  cs(panel, GEO.concat(PAINT)),
    shell:  cs(shell, GEO.concat(PAINT)),
    rail:   cs(rail,  GEO.concat(PAINT)),
    table:  cs(table, GEO.concat(PAINT)),
    header: cs(hdr,   GEO.concat(PAINT))
  };
  // Scrollbar actually taken by the rail (0 = none or overlay). This is the §B.4 question, answered.
  out.railScrollbarPx = rail ? +(rail.offsetHeight - rail.clientHeight).toFixed(2) : null;
  out.railOverflows = rail ? (rail.scrollWidth > rail.clientWidth + 0.5) : null;
  out.railTabCount = rail ? rail.children.length : null;

  // ---- 6. the sticky offset variables, which are measured at runtime ------------------------------------
  out.cssVars = page ? ['--km-sticky-top-base', '--km-replen-cat-rail-h', '--km-hscroll-gutter',
    '--km-sticky-header-total', '--space-lg'].reduce(function (o, v) {
      o[v] = getComputedStyle(page).getPropertyValue(v).trim(); return o;
    }, {}) : {};

  // ---- 7. verdict ---------------------------------------------------------------------------------------
  var tol = 2;
  out.verdict = {
    geometric_equal: g.DELTA.geometric_B_minus_A != null && Math.abs(g.DELTA.geometric_B_minus_A) <= tol,
    perceived_equal: g.DELTA.perceived_B_minus_A != null && Math.abs(g.DELTA.perceived_B_minus_A) <= tol,
    tolerance_px: tol
  };

  // ---- 8. THE MASKING TEST (R2 Phase 1B) ----------------------------------------------------------------
  // `.table-header-bar` carries `box-shadow: … , 0 -100vh 0 100vh white` at z-index 120 — a white curtain over
  // EVERYTHING above it. The stylesheet states the rule at inventory-replenishment.css:1701 and the category
  // rail was given z-index 125 specifically to escape it. A box-shadow is paint-only and NOT hit-testable, so
  // elementFromPoint cannot see this; the test is the z-order and the band height, reported together.
  var headerZ = hdr ? parseInt(getComputedStyle(hdr).zIndex, 10) : null;
  out.masking = {
    headerBar: { zIndex: headerZ, boxShadow: hdr ? getComputedStyle(hdr).boxShadow : null,
      hasWhiteCurtain: hdr ? /100vh/.test(getComputedStyle(hdr).boxShadow || '') : null },
    hosts: ['replenSearchState', 'replen-render-integrity'].map(function (id) {
      var el = document.getElementById(id);
      if (!el) return { id: id, exists: false };
      var c = getComputedStyle(el), b = el.getBoundingClientRect();
      var z = c.zIndex === 'auto' ? null : parseInt(c.zIndex, 10);
      var positioned = c.position !== 'static';
      // Masked when it paints BELOW the curtain and sits above the curtain's lower edge (the header's bottom).
      var masked = (c.display !== 'none') && b.height > 0 &&
        (!positioned || z === null || (headerZ != null && z < headerZ)) &&
        (!!hdr && b.top < hdr.getBoundingClientRect().bottom);
      return { id: id, exists: true, display: c.display, position: c.position, zIndex: c.zIndex,
        background: c.backgroundColor, rect: r(el), childCount: el.children.length,
        PAINTS_BELOW_CURTAIN: masked,
        bandPx: masked ? +b.height.toFixed(2) : 0 };
    })
  };
  out.masking.totalMaskedBandPx = out.masking.hosts.reduce(function (s, h) { return s + (h.bandPx || 0); }, 0);
  out.masking.verdict = out.masking.totalMaskedBandPx > 0
    ? 'A band of ' + out.masking.totalMaskedBandPx + 'px is occupied by a notice that paints BELOW the white ' +
      'curtain. It renders as blank space, which reads as extra gap. Confirm visually: that band should look ' +
      'WHITE, not amber/red.'
    : 'No notice host is currently occupying a masked band.';

  // ---- 9. checkpoint accumulator (addendum A / B / C) ---------------------------------------------------
  var prior = (window.__F1B_R2__ && window.__F1B_R2__.checkpoints) || {};
  out.checkpoints = prior;
  out.capture = function (label) {
    // REFUSES an invalid checkpoint rather than recording one. A capture that cannot contain the defect is
    // worse than no capture: it reads as evidence of absence.
    if (!out.VALID_FOR_DEFECT) {
      console.error('REFUSED to capture "' + label + '": ' + out.VALID_REASON);
      return prior;
    }
    if (window.scrollY !== 0) { console.error('REFUSED to capture "' + label + '": scrollY is ' + window.scrollY); return prior; }
    prior[label] = { valid: true, state: out.state, gaps: out.gaps, masking: out.masking, banners: out.banners,
      railScrollbarPx: out.railScrollbarPx, railOverflows: out.railOverflows, railTabCount: out.railTabCount,
      shellH: R.shell.rect && R.shell.rect.height, railH: R.rail.rect && R.rail.rect.height,
      tableTop: R.table.rect && R.table.rect.top, cssVars: out.cssVars, scope: out.scope,
      occupantsOfGapB: out.occupantsOfGapB };
    console.log('captured checkpoint "' + label + '"');
    return prior;
  };

  out.json = JSON.stringify(out, function (k, v) { return typeof v === 'function' ? undefined : v; });
  window.__F1B_R2__ = out;
  console.log('%cS8-R4D-F1B-R2 RESTING GAP PROBE', 'font-weight:bold');
  console.log('scope', out.scope, 'scrollY', out.page.scrollY);
  if (out.REFUSED) console.warn(out.REFUSED);
  if (out.VALID_FOR_DEFECT) console.log('%cVALID FOR DEFECT — ' + out.VALID_REASON, 'color:#166534');
  else console.warn('NOT VALID FOR DEFECT — ' + out.VALID_REASON);
  console.table(out.gaps.GEOMETRIC);
  console.table(out.gaps.PERCEIVED);
  console.log('delta', out.gaps.DELTA, 'verdict', out.verdict);
  console.log('occupants of GAP A', out.occupantsOfGapA);
  console.log('occupants of GAP B', out.occupantsOfGapB);
  console.log('rail scrollbar px', out.railScrollbarPx, 'overflows', out.railOverflows, 'tabs', out.railTabCount);
  console.log('MASKING', out.masking.verdict);
  console.table(out.masking.hosts);
  console.log('full blob in window.__F1B_R2__  —  copy(__F1B_R2__.json)');
  console.log('checkpoints: run this file, then __F1B_R2__.capture("A"|"B"|"C")');
  return out;
})();
