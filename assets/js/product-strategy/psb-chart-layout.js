/* ===================================================================================================
   PRODUCT STRATEGY BOARD — THE RESPONSIVE CHART LAYOUT ENGINE  (P1-B2C)

   ONE PURE FUNCTION DECIDES EVERY SIZE ON THE CHART, AND IT TOUCHES NOTHING.

   No DOM, no window, no storage, no network, no clock, no random. Everything it needs — how wide the
   container is, how much vertical room is left, how many products there are, how far the price domain
   reaches — arrives as an argument. That is the whole design, and it is a deliberate correction of
   the position this file's predecessor took.

   WHAT CHANGED, AND WHY IT IS NOT A REVERSAL. P1-B2A wrote "NO LAYOUT BOX IS MEASURED ANYWHERE",
   because a chart whose geometry depends on WHEN it was measured draws differently on a slow load.
   That reasoning is still right, and it is about a HIDDEN dependency. A measurement that arrives as a
   named argument to a pure function is not hidden: the same inputs give the same drawing forever, a
   test can supply 1366x768 without a browser, and the moment of measurement is one explicit call in
   the render layer rather than an accident distributed through the drawing code.

   WHAT P1-B2B GOT WRONG, STATED PLAINLY. It fixed a real collision by nailing three numbers down —
   50px images, 48px per gridline, a 78vh cap — and a fixed floor is not a layout, it is a guess that
   happens to be right for one screen. On 1280x720 an ordinary seven-product chart no longer fitted
   in the card: you had to scroll the chart to see its own axis. So 48px is now the PREFERRED pitch,
   honoured whenever there is room for it, and it is no longer a floor that outranks being able to see
   the thing.

   IT ALSO REPEATED A CLAIM THAT WAS NOT TRUE. P1-B2B justified the 48px floor with "two 50px
   photographs 28px apart overlap". They do not: two products sit in two COLUMNS, so their markers are
   separated horizontally whatever the pitch is. The real reason to want a generous pitch is that a
   price scale you cannot read the labels on is not a scale. That is a preference about legibility,
   which is exactly the kind of thing that should yield when the alternative is not seeing the axis at
   all — and the kind of thing a floor should never have been used for.

   WHAT IS NOT NEGOTIABLE, AND WHY THE MATHS IS PUBLISHED SEPARATELY FROM THE PIXELS.
   A price's position in its domain — `(price - lo) / (hi - lo)` — is identical at every viewport, in
   every mode, at every density. Only the number of pixels that fraction is painted across changes.
   Every marker carries that fraction as `data-frac`, so "resizing cannot move a price" is something a
   reader and a test can check rather than something this comment asserts.
   =================================================================================================== */
var PSB_CHART_LAYOUT = (function () {
  'use strict';
  var L = {};

  /* ---- THE THREE MODES ---------------------------------------------------------------------------
     auto         fit the card. The default, and the answer to "why can I not see my own axis".
     comfortable  keep the big picture and the generous pitch; overflow goes to the CONTAINER.
     fullscreen   the auto algorithm with the whole viewport to spend. For a room with a projector.
     ------------------------------------------------------------------------------------------------ */
  L.MODES = ['auto', 'comfortable', 'fullscreen'];

  /* ---- DENSITY PROFILES ---------------------------------------------------------------------------
     THE ONLY PLACE A SIZE IS WRITTEN DOWN. Four profiles, and a profile is a coherent set: an image
     size, a lane that fits the type it holds, a column minimum that the image fits inside, and font
     sizes that stay legible at that scale. Mixing a 50px image with a 26px column would be a chart
     that technically has both.

     The brief's bands: spacious 50 · normal 42-46 · compact 32-38 · overview a small thumbnail.
     ------------------------------------------------------------------------------------------------ */
  /* PSB-DEMO-R3 §A — THE TYPE IS SIZED FOR A ROOM, NOT FOR A SCREENSHOT. The axis numbers and the
     product labels start at 14-16px in every profile (they were 10.5-12.5), and the lane, the column
     minimum and the left margin grow with them, so the larger type has the room it needs rather than
     being drawn over its neighbours. `dealPx` is the activity-price label; `axTitlePx` the axis title.
     These are the ONLY sizes: the stylesheet no longer declares a competing one (it used to, and CSS
     outranks an SVG attribute, so the per-density sizes here were never what a reader saw). */
  L.DENSITY = {
    spacious: { id: 'spacious', image: 50, laneH: 64, row1: 24, row2: 47,
      labelPx: 16, subPx: 13.5, tickPx: 15, dealPx: 14.5, axTitlePx: 13.5, colMin: 78, showSub: true },
    normal: { id: 'normal', image: 44, laneH: 60, row1: 23, row2: 45,
      labelPx: 15, subPx: 13, tickPx: 14.5, dealPx: 14, axTitlePx: 13, colMin: 60, showSub: true },
    compact: { id: 'compact', image: 34, laneH: 56, row1: 22, row2: 43,
      labelPx: 14.5, subPx: 12.5, tickPx: 14, dealPx: 13.5, axTitlePx: 13, colMin: 44, showSub: true },
    overview: { id: 'overview', image: 24, laneH: 52, row1: 21, row2: 40,
      labelPx: 14, subPx: 12, tickPx: 14, dealPx: 13, axTitlePx: 12.5, colMin: 26, showSub: true }
  };
  L.DENSITY_ORDER = ['spacious', 'normal', 'compact', 'overview'];

  /* ---- COUNT BANDS --------------------------------------------------------------------------------
     THE COUNT PICKS THE STARTING DENSITY; THE CONTAINER DECIDES WHETHER IT SURVIVES. Twelve products
     start spacious and stay spacious on any desktop; twenty-four start at normal and step down to
     compact on a narrow one; twenty-five or more start at overview because there is no width at which
     forty-four 50px photographs are a readable row, and saying otherwise on a 1280px screen would be
     a chart that lies about how much it can show.
     ------------------------------------------------------------------------------------------------ */
  L.COUNT_BANDS = [
    { upTo: 12, density: 'spacious' },
    { upTo: 24, density: 'normal' },
    { upTo: Infinity, density: 'overview' }
  ];

  L.PREFERRED_PITCH = 48;      // P1-B2B's number, kept — as a preference
  L.MIN_PITCH_AUTO = 22;       // below this a gridline label is not worth drawing
  L.MIN_PLOT_H = 140;          // a two-tick chart must still be a chart
  L.MAX_PLOT_H = 960;
  L.COL_MAX = 208;
  L.PAD_L = 78;                // the FLOOR; padLFor widens it to the longest tick label at its size
  L.PAD_R = 30;
  L.PAD_T = 30;
  L.GUTTER_EXTRA = 5;          // gutter = half an image + this, so a marker on an end tick clears
  L.STEP_LADDER_C = [500, 1000, 2000, 2500, 5000, 10000, 25000, 50000];
  L.MIN_LABEL_W = 46;          // at 12.5px; scaled with the label size by minLabelW
  L.CHAR_W_AT_11_5 = 6.4;      // one monospace character, measured once
  L.CHAR_EM = L.CHAR_W_AT_11_5 / 11.5;   // the same measurement, per pixel of type

  /** PSB-DEMO-R3 §A — the left margin THESE tick labels need: the longest one ("1250.00" is seven
      characters, "40.00" five) at the largest tick size any profile uses, plus the rotated axis title and
      the gap to the rule. It is computed for each candidate axis the walk tries, so a narrow domain is not
      charged for a four-digit price it will never print; the floor is the old fixed margin. */
  L.TITLE_ROOM = 40;
  L.padLForAxis = function (ax) {
    var maxAbs = Math.max(Math.abs(Number(ax && ax.lo) || 0), Math.abs(Number(ax && ax.hi) || 0));
    var chars = (Math.floor(maxAbs / 100)).toString().length + 3 + ((Number(ax && ax.lo) || 0) < 0 ? 1 : 0);
    return Math.max(L.PAD_L, Math.ceil(chars * L.CHAR_EM * L.DENSITY.spacious.tickPx + L.TITLE_ROOM));
  };
  /* A lane label needs ~46px at the old 11.5px type; at the size it is printed now it needs proportionally
     more, so a column too narrow for it prints every Nth label rather than a row of truncated stumps. */
  L.minLabelW = function (d) { return Math.round(L.MIN_LABEL_W * (d.labelPx / 11.5)); };

  /* THE FALLBACKS ARE DECLARED, NOT GUESSED AT RENDER TIME. When nothing has been measured yet — the
     first paint, a print, a test with no browser — the engine uses the Operation System card's own
     content width and a height that fits a 1080p window. A first paint that is right and a second
     that is better is fine; a first paint that is empty because nothing had been measured is not. */
  L.FALLBACK_WIDTH = 1180;
  L.FALLBACK_HEIGHT = 520;
  L.MIN_AVAILABLE_HEIGHT = 240;
  L.MAX_AVAILABLE_HEIGHT = 1200;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function numOr(v, dflt) {
    var n = Number(v);
    return (typeof v !== 'undefined' && v !== null && isFinite(n) && n > 0) ? n : dflt;
  }

  /** The count band's density, by name. */
  L.densityForCount = function (count) {
    for (var i = 0; i < L.COUNT_BANDS.length; i++) {
      if (count <= L.COUNT_BANDS[i].upTo) return L.COUNT_BANDS[i].density;
    }
    return 'overview';
  };

  /** Ticks for one candidate step. Rounded OUT, so no product is ever outside its own axis. */
  L.ticksFor = function (loC, hiC, stepC) {
    var lo = Math.floor(loC / stepC) * stepC;
    var hi = Math.ceil(hiC / stepC) * stepC;
    if (hi === lo) hi = lo + stepC;
    var out = [];
    for (var v = lo; v <= hi; v += stepC) out.push(v);
    return { lo: lo, hi: hi, step: stepC, ticks: out };
  };

  /**
   * THE LAYOUT. Given a container, a viewport budget, a product count and a price domain, decide
   * every size on the chart — and report what did not fit rather than pretending it did.
   */
  L.deriveResponsiveChartLayout = function (input) {
    input = input || {};
    var mode = L.MODES.indexOf(input.mode) >= 0 ? input.mode : 'auto';
    var containerWidth = Math.round(numOr(input.containerWidth, L.FALLBACK_WIDTH));
    var availableHeight = clamp(Math.round(numOr(input.availableHeight, L.FALLBACK_HEIGHT)),
      L.MIN_AVAILABLE_HEIGHT, L.MAX_AVAILABLE_HEIGHT);
    var count = Math.max(0, Math.floor(Number(input.productCount) || 0));
    var loC = Number(input.domainLowC);
    var hiC = Number(input.domainHighC);
    if (!isFinite(loC) || !isFinite(hiC)) { loC = 0; hiC = L.STEP_LADDER_C[0]; }

    function availFor(ax) { return Math.max(120, containerWidth - L.padLForAxis(ax) - L.PAD_R); }
    var startDensity = L.densityForCount(count);
    var startIndex = L.DENSITY_ORDER.indexOf(startDensity);
    var reasons = [];

    /* COMFORTABLE DOES NOT NEGOTIATE. It is the mode a person chooses when they want the big picture
       and are willing to scroll for it, so it takes the spacious profile and the preferred pitch and
       lets the CONTAINER carry whatever will not fit. The one thing it may not do is push the page
       itself sideways, which is a stylesheet rule, not this function's. */
    if (mode === 'comfortable') {
      var cd = L.DENSITY.spacious;
      var caxis = L.pickStep(loC, hiC, L.PREFERRED_PITCH, L.MAX_PLOT_H);
      return L.assemble({
        mode: mode, density: cd, axis: caxis, pitch: L.PREFERRED_PITCH,
        count: count, containerWidth: containerWidth, availWidth: availFor(caxis), padL: L.padLForAxis(caxis),
        availableHeight: availableHeight,
        reasons: ['comfortable: the preferred pitch and the full image are kept, and the container'
          + ' scrolls for whatever does not fit'],
        negotiated: false
      });
    }

    /* AUTO AND FULLSCREEN WALK TWO LADDERS. Density from the count band downward, and inside each
       density the tick step from fine to coarse. The FIRST combination that fits both dimensions
       wins, which means the chart gives up the least it can: a coarser axis before a smaller
       photograph, and a smaller photograph before an axis you cannot see. */
    var best = null;
    for (var di = startIndex; di < L.DENSITY_ORDER.length; di++) {
      var d = L.DENSITY[L.DENSITY_ORDER[di]];
      var gutter = Math.ceil(d.image / 2) + L.GUTTER_EXTRA;
      var budget = availableHeight - L.PAD_T - 2 * gutter - d.laneH;
      for (var si = 0; si < L.STEP_LADDER_C.length; si++) {
        var ax = L.ticksFor(loC, hiC, L.STEP_LADDER_C[si]);
        var spans = Math.max(1, ax.ticks.length - 1);
        var pitch = budget / spans;
        var heightOK = pitch >= L.MIN_PITCH_AUTO;
        var availWidth = availFor(ax);
        var colW = count > 0
          ? clamp(availWidth / count, d.colMin, L.COL_MAX) : L.COL_MAX;
        var widthOK = count === 0 || colW * count <= availWidth + 0.5;
        var cand = { density: d, axis: ax, pitch: Math.min(L.PREFERRED_PITCH, pitch),
          heightOK: heightOK, widthOK: widthOK, availWidth: availWidth, padL: L.padLForAxis(ax),
          overflowX: Math.max(0, Math.round(colW * count - availWidth)) };
        if (!best) best = cand;
        if (heightOK && widthOK) { best = cand; di = L.DENSITY_ORDER.length; break; }
        /* WHEN NOTHING FITS, STILL CHOOSE. A candidate that fits one dimension beats one that fits
           none — and between two that fit the same dimensions, the one that overflows LESS wins.
           Without that last clause the walk keeps the first near-miss it happens to meet, which on
           a tablet meant twenty-four 44px photographs and 776px of sideways scroll when stepping
           down one profile would have left eight. Overflowing anyway is not a reason to overflow
           as much as possible. */
        if (L.score(cand) > L.score(best)) best = cand;
      }
    }
    if (!best.heightOK) {
      reasons.push('the price range needs more vertical room than this viewport has, even at the'
        + ' coarsest gridline step — the plot is as tall as the card allows');
    }
    if (!best.widthOK) {
      reasons.push('there is no column width at which ' + count + ' products fit across '
        + containerWidth + 'px and stay legible — the chart keeps its natural width and the'
        + ' container scrolls sideways');
    }
    if (best.density.id !== startDensity) {
      reasons.push('stepped down from ' + startDensity + ' to ' + best.density.id
        + ' to fit the space available');
    }
    return L.assemble({
      mode: mode, density: best.density, axis: best.axis, pitch: best.pitch,
      count: count, containerWidth: containerWidth, availWidth: best.availWidth, padL: best.padL,
      availableHeight: availableHeight, reasons: reasons, negotiated: true,
      heightOK: best.heightOK, widthOK: best.widthOK
    });
  };

  /**
   * HOW GOOD IS A NEAR-MISS. Fitting both dimensions is out of reach by the time this is consulted,
   * so: fitting the height matters most (a chart you cannot scroll vertically is the promise Auto
   * Fit makes), then fitting the width, then overflowing by as little as possible. Deterministic,
   * and the whole ordering is in one expression rather than spread through the walk.
   */
  L.score = function (c) {
    return (c.heightOK ? 1000000 : 0) + (c.widthOK ? 500000 : 0) - Math.min(499999, c.overflowX);
  };

  /** The coarsest step that keeps the whole domain inside a given pitch and height cap. */
  L.pickStep = function (loC, hiC, pitch, maxPlot) {
    for (var i = 0; i < L.STEP_LADDER_C.length; i++) {
      var ax = L.ticksFor(loC, hiC, L.STEP_LADDER_C[i]);
      if ((ax.ticks.length - 1) * pitch <= maxPlot || i === L.STEP_LADDER_C.length - 1) return ax;
    }
    return L.ticksFor(loC, hiC, L.STEP_LADDER_C[0]);
  };

  /** Turn a chosen (density, axis, pitch) into every number the renderer needs. */
  L.assemble = function (c) {
    var d = c.density;
    var spans = Math.max(1, c.axis.ticks.length - 1);
    var gutter = Math.ceil(d.image / 2) + L.GUTTER_EXTRA;
    var plotH = Math.round(clamp(c.pitch * spans, L.MIN_PLOT_H, L.MAX_PLOT_H));
    var pitch = plotH / spans;

    var plotTop = L.PAD_T + gutter;
    var plotBottom = plotTop + plotH;
    var laneTop = plotBottom + gutter;
    var viewBoxH = laneTop + d.laneH;

    var colW = c.count > 0
      ? clamp(c.availWidth / c.count, d.colMin, L.COL_MAX) : L.COL_MAX;
    var plotW = colW * c.count;
    var padL = c.padL || L.PAD_L;
    var viewBoxW = Math.max(c.containerWidth, Math.round(padL + plotW + L.PAD_R));
    var offset = plotW < c.availWidth ? padL + (c.availWidth - plotW) / 2 : padL;

    /* LABEL DENSITY GIVES WAY BEFORE THE IMAGE DOES, and before anything else at all. A lane label
       needs about 46px to say anything; below that the honest move is to print one every Nth column
       rather than a row of four-character stumps. Every product keeps its marker, its hover panel
       and its aria-label — only the printed text thins out. */
    /* PSB-DEMO-R3 §A — measured AT THE SIZE THE LABEL IS PRINTED. Both numbers used to assume 11.5px type,
       so a larger label would have been given room for more characters than it can hold. */
    var minW = L.minLabelW(d);
    var stride = colW >= minW ? 1 : Math.ceil(minW / Math.max(1, colW));
    var chars = Math.max(3, Math.floor((colW * stride - 6) / (L.CHAR_EM * d.labelPx)));

    return {
      mode: c.mode,
      density: d.id,
      negotiated: !!c.negotiated,
      fitsHeight: c.heightOK === undefined ? true : !!c.heightOK,
      fitsWidth: c.widthOK === undefined ? (plotW <= c.availWidth + 0.5) : !!c.widthOK,
      reasons: c.reasons || [],

      axisLoC: c.axis.lo, axisHiC: c.axis.hi, tickStepC: c.axis.step, ticks: c.axis.ticks,
      pxPerTick: Math.round(pitch * 100) / 100,

      padL: padL, padR: L.PAD_R, padT: L.PAD_T,
      gutter: gutter, plotH: plotH, plotTop: plotTop, plotBottom: plotBottom,
      laneTop: laneTop, laneH: d.laneH, laneRow1: d.row1, laneRow2: d.row2,
      showSub: d.showSub,

      imageSize: d.image,
      colW: Math.round(colW * 100) / 100,
      plotW: Math.round(plotW * 100) / 100,
      viewBoxW: viewBoxW, viewBoxH: viewBoxH,
      offset: Math.round(offset * 100) / 100,

      labelStride: stride, labelChars: chars,
      labelPx: d.labelPx, subPx: d.subPx, tickPx: d.tickPx, dealPx: d.dealPx, axTitlePx: d.axTitlePx,

      /* THE OVERFLOW POLICY IS PART OF THE ANSWER, NOT AN AFTERTHOUGHT. A layout that does not fit
         has to say which way it does not fit, because "scroll the container" and "shrink further"
         are different promises to the reader. */
      overflow: (c.mode === 'comfortable')
        ? 'container-both'
        : ((c.widthOK === false) ? 'container-x' : 'none'),

      measured: {
        containerWidth: c.containerWidth,
        availableHeight: c.availableHeight,
        availableWidth: Math.round(c.availWidth),
        productCount: c.count
      }
    };
  };

  /**
   * THE FRACTION, AND IT IS THE WHOLE POINT.
   *
   * A price's place in its domain is a number between 0 and 1 that no viewport, mode or density can
   * change. `y` is that fraction painted across however many pixels the layout allowed. Publishing
   * both means "resizing cannot move a price" is checkable: `data-frac` is identical at 1920 and at
   * 768, and `data-cy` is not.
   */
  L.frac = function (priceC, loC, hiC) {
    if (hiC === loC) return 0;
    return Math.round(((priceC - loC) / (hiC - loC)) * 1e6) / 1e6;
  };

  /* ---- THE REUSABLE CONTRACT ----------------------------------------------------------------------
     Published as data so the next Operation System chart can adopt the rules rather than the code,
     and so a reader can see what was claimed to be general before anything else adopts it. */
  L.CONTRACT = {
    id: 'KM_RESPONSIVE_CHART_LAYOUT_V1',
    container_driven: true,
    reads_window_width_directly: false,
    modes: L.MODES,
    density_profiles: L.DENSITY_ORDER,
    coordinates_are_separate_from_pixels: true,
    layer_visibility_changes_layout: false,
    state_survives_resize: true,
    print_uses_its_own_layout: true,
    applies_to: 'product-strategy-board prototype only, until a page adopts it deliberately'
  };

  return L;
}());

if (typeof module !== 'undefined' && module.exports) module.exports = PSB_CHART_LAYOUT;
