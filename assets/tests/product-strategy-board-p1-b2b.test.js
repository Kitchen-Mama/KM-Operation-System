// Kitchen Mama Operation System — PRODUCT-STRATEGY-P1-B2B
// A CHECKBOX MOVED EVERY PRICE, A PLATE SAT ON THE WORDS, AND A DROPDOWN THREW THE PAGE.
//
// Three defects from the same visual review, and all three were the same mistake told three ways:
// something that should have described the drawing was allowed to DERIVE it.
//
//   1. THE DOMAIN CAME FROM THE VISIBLE LAYERS. `layerOn('msrp') ? n._msrp_c : null` sat inside the
//      axis-extent loop, so hiding a line re-scaled the y axis, moved every product marker, changed
//      the tick count, shortened the plot and shoved the comparison table. "Show/hide a line"
//      silently redrew every coordinate on the chart.
//   2. THERE WAS NO LABEL LANE. Labels were drawn at `PLOT_H + 22` in the same space the prices use,
//      so a 50px plate centred on the lowest price hung 25px into the type. Widening the label area
//      could never have fixed it — the plate was overflowing the PLOT, not the labels.
//   3. EVERY CONTROL CALLED render(). Choosing a Series destroyed the `<select>` that was being used,
//      along with every filter and the whole scenario panel, and whether the page jumped up, jumped
//      down or happened to look still depended on where it was scrolled.
//
// WHAT THIS SUITE CAN AND CANNOT DO. It can hold coordinates, heights, identities, vocabulary and a
// scroll position; the shim now has a scroll, a focus and a synthetic layout so those are real
// failures rather than vacuous passes. It CANNOT see a fold, a colour or a line of type that is one
// pixel too close to another — §八 of the brief asks for screenshots and a person, and the checklist
// is in the design freeze. A DOM assertion is not a visual review and this file does not pretend so.
//
// ONE LIMIT, STATED. The shim's layout counts nodes, not pixels: an element's top is its index in
// document order. That models the question the viewport contract asks — does content ABOVE the
// reader change — but it cannot model a CSS `min-height` that reserves space for a row that is
// sometimes empty. So the anchor is asserted across the events that add and remove nothing, the
// scroll position is asserted across all of them, and the reserved height is asserted where it
// actually lives: in the stylesheet, with a mutant aimed at it.
//
// Run: node assets/tests/product-strategy-board-p1-b2b.test.js
'use strict';

var H = require('./_psb-harness.js');
var SRC = H.SRC, bootPage = H.bootPage, pipeline = H.pipeline;

var pass = 0, fail = 0, mutCaught = 0, mutSurvived = 0;
function ok(c, l, d) {
  if (c) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + (d === undefined ? '' : '\n  got ' + JSON.stringify(d))); }
}
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function mut(label, f) {
  var caught = false;
  try { caught = f() === true; } catch (e) { caught = false; }
  if (caught) { mutCaught++; console.log('ok   ' + label + ' (caught)'); }
  else { mutSurvived++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}
function withProto(mutate) {
  return bootPage(function (kind, src) { return kind === 'prototype' ? mutate(src) : src; });
}
function swap(a, b) {
  return function (src) {
    var n = src.split(a).length - 1;
    if (n !== 1) throw new Error('mutant anchor ' + n + 'x: ' + a.slice(0, 60));
    return src.replace(a, b);
  };
}

var P = pipeline();
var S = P.S, CANON = P.canon;
function board(over) {
  var spec = { rows: CANON,
    selection: { company: 'Kitchen Mama', country: 'US', marketplace: 'Amazon' } };
  Object.keys(over || {}).forEach(function (k) { spec[k] = over[k]; });
  return S.deriveBoardModel(spec);
}

function q(p, sel) { return p.dom.document.querySelectorAll(sel); }
function id(p, x) { return p.dom.document.getElementById(x); }
function num(n, a) { return Number(n.getAttribute(a)); }
function toChart(p, category) {
  if (p.thrown) return p;
  var chip = q(p, '#catBar .catbtn').filter(function (b) {
    return b.getAttribute('data-category') === (category || 'Silicone Spatula');
  });
  if (chip.length) chip[0].click();
  return p;
}
function openMeeting(p) {
  if (p.thrown) return p;
  var t = id(p, 'meetingToggle');
  if (t && t.getAttribute('aria-expanded') === 'false') t.click();
  return p;
}
function chartPage() { return toChart(bootPage(null)); }
function setLayer(p, layer, on) {
  var cb = id(p, 'layer-' + layer);
  cb.checked = !!on;
  cb.dispatchEvent(new p.dom.Event('change', { bubbles: true }));
}
function fire(p, elId, value) {
  var n = id(p, elId);
  if (!n) throw new Error('no control #' + elId);
  if (value !== undefined) n.value = value;
  n.dispatchEvent(new p.dom.Event('change', { bubbles: true }));
  return n;
}
/** Everything about the drawing that a checkbox must not be able to change. */
function geometryOf(p) {
  var c = q(p, '.chart')[0];
  if (!c) return null;
  return {
    axis: [c.getAttribute('data-axis-min-c'), c.getAttribute('data-axis-max-c')],
    step: c.getAttribute('data-tick-step-c'),
    plot: [c.getAttribute('data-plot-top'), c.getAttribute('data-plot-bottom')],
    lane: c.getAttribute('data-lane-top'),
    height: c.getAttribute('data-vb-h'),
    everyday: q(p, '.mk-anchor').map(function (n) { return n.getAttribute('data-cy'); })
  };
}

// ===================================================================================================
console.log('\n=== SECTION A  THE PAGE STILL BOOTS, AND STILL CHECKS ITSELF ===');
// ===================================================================================================
var PG = chartPage();
ok(PG.thrown === null, 'A1 the page boots with no exception',
  PG.thrown && (PG.thrown.message + ' :: ' + String(PG.thrown.stack).split('\n')[1]));
(function () {
  if (PG.thrown) return;
  var v = H.selfTestVerdict(PG);
  console.log('     (the page reported ' + v.badge + ')');
  eq(v.bad.map(function (b) { return b.text; }), [],
    'A2 and every one of its own DOM assertions still passes');
  ok(q(PG, '.chart').length === 1, 'A3 a chart is on screen to measure');
}());

// ===================================================================================================
console.log('\n=== SECTION B  THE DOMAIN BELONGS TO THE SCOPE, NOT TO THE CHECKBOXES ===');
// ===================================================================================================
(function () {
  if (PG.thrown) return;
  var base = geometryOf(chartPage());

  /* B1-B6 EACH LAYER, ALONE. The defect was per-layer: msrp removed the top of the range, floor the
     bottom, promo and scenario the outliers. Hiding any one of them must change what is DRAWN and
     nothing about where anything sits. */
  ['msrp', 'floor', 'promo', 'scenario', 'steps', 'images'].forEach(function (layer, i) {
    var p = chartPage();
    setLayer(p, layer, false);
    eq(geometryOf(p), base, 'B' + (i + 1) + ' hiding "' + layer
      + '" moves no price, no gridline, no lane and no card height');
  });

  /* B7 ALL OF THEM AT ONCE — the combination the review actually performed. */
  var pAll = chartPage();
  ['msrp', 'floor', 'promo', 'scenario', 'steps'].forEach(function (l) { setLayer(pAll, l, false); });
  eq(geometryOf(pAll), base, 'B7 and hiding all five at once still moves nothing');

  /* B8 CLEAN VIEW is the same claim through the shortcut. */
  var pClean = chartPage();
  id(pClean, 'view-clean').click();
  eq(geometryOf(pClean), base, 'B8 Clean view draws less and re-scales nothing');
  id(pClean, 'view-detail').click();
  eq(geometryOf(pClean), base, 'B9 and Detail comes back to exactly the same drawing');

  /* B10 THE ELEMENTS REALLY DID GO. A domain that ignores the layers would be worthless if the
     layers had quietly stopped working. */
  var pOff = chartPage();
  setLayer(pOff, 'msrp', false);
  eq(q(pOff, '.cap-msrp').length, 0, 'B10 a hidden layer draws no element');
  eq(q(pOff, '#chartLegend .legend-item').filter(function (n) {
    return n.getAttribute('data-layer') === 'msrp'; }).length, 0,
    'B11 and keeps no legend key');
  eq(q(pOff, '.band').length, 0, 'B12 and the band goes with its missing cap');

  // B13 THE CLAIM IS PUBLISHED, so a reader can check it rather than take it on trust.
  eq(q(PG, '.chart')[0].getAttribute('data-domain-source'), 'canonical-scope',
    'B13 the chart names what its domain was derived from');

  /* B14 THE SCOPE STILL RE-DERIVES IT. Not re-deriving on a category change would be the opposite
     defect: a ladder for one set of products drawn on another set's axis. */
  var pCat = toChart(bootPage(null), 'Electric Can Opener');
  var other = geometryOf(pCat);
  ok(other && JSON.stringify(other.axis) !== JSON.stringify(base.axis),
    'B14 a different category is a different set of products, so it re-derives',
    { was: base.axis, now: other && other.axis });

  /* B15 AND SO DOES A DIFFERENT SITE. */
  var pSite = bootPage(null);
  fire(pSite, 'fCountry', 'DE');
  var deCats = q(pSite, '#catBar .catbtn').map(function (b2) {
    return b2.getAttribute('data-category'); }).filter(function (v) { return v !== 'ALL'; });
  toChart(pSite, deCats[0]);
  ok(q(pSite, '.chart').length >= 1, 'B15 a different country draws its own chart', deCats);
  ok(q(pSite, '.chart')[0].getAttribute('data-currency') !== 'USD',
    'B15a in its own currency', q(pSite, '.chart')[0].getAttribute('data-currency'));
}());

// ===================================================================================================
console.log('\n=== SECTION C  A SCENARIO EXPANDS THE DOMAIN AND NEVER SHRINKS IT ===');
// ===================================================================================================
(function () {
  if (PG.thrown) return;
  function applyScenario(p, adjust, value) {
    openMeeting(p);
    fire(p, 'scSeries', 'Spatula');
    fire(p, 'scField', 'proposed_scenario_price');
    fire(p, 'scAdjust', adjust);
    fire(p, 'scValue', value);
    id(p, 'scApply').click();
    return p;
  }
  var base = geometryOf(chartPage());

  // C1 A SIMULATED PRICE INSIDE THE EXISTING RANGE CHANGES NOTHING ABOUT THE AXIS.
  var inside = applyScenario(chartPage(), 'set', '25.00');
  var gIn = geometryOf(inside);
  eq(gIn.axis, base.axis, 'C1 a scenario inside the range does not re-scale the chart');
  eq(gIn.height, base.height, 'C2 nor change its height');
  eq(q(inside, '.chart')[0].getAttribute('data-domain-expanded'), 'false',
    'C3 and it says so');
  ok(id(inside, 'scenarioApplied'), 'C4 while the scenario really did apply');

  // C5 ONE OUTSIDE IT PUSHES THE BOUND OUT, and says which way.
  var outside = applyScenario(chartPage(), 'set', '120.00');
  var gOut = geometryOf(outside);
  ok(Number(gOut.axis[1]) > Number(base.axis[1]),
    'C5 a scenario above the range expands the top', { was: base.axis, now: gOut.axis });
  eq(q(outside, '.chart')[0].getAttribute('data-domain-expanded'), 'true', 'C6 and says so');
  eq(q(outside, '.chart')[0].getAttribute('data-domain-lo-c'),
    q(PG, '.chart')[0].getAttribute('data-domain-lo-c'),
    'C7 the CANONICAL envelope underneath is untouched by the simulation');
  eq(q(outside, '.chart')[0].getAttribute('data-domain-hi-c'),
    q(PG, '.chart')[0].getAttribute('data-domain-hi-c'), 'C8 at both ends');

  // C9 RESETTING RETURNS TO THE CANONICAL DOMAIN EXACTLY — not to something close to it.
  id(outside, 'scResetAll').click();
  eq(geometryOf(outside), base, 'C9 Reset all scenarios returns the exact canonical drawing');

  // C10 AND SO DOES UNDO.
  var undone = applyScenario(chartPage(), 'set', '120.00');
  id(undone, 'scUndo').click();
  eq(geometryOf(undone), base, 'C10 Undo last change does too');
}());

// ===================================================================================================
console.log('\n=== SECTION D  VERTICAL READABILITY IS A PIXEL FLOOR ===');
// ===================================================================================================
(function () {
  if (PG.thrown) return;
  var c = q(PG, '.chart')[0];
  var pitch = num(c, 'data-tick-px');
  ok(pitch >= 44 && pitch <= 52, 'D1 a gridline is worth 44-52px, as the brief asked', pitch);
  eq(pitch, 48, 'D2 48 in the ordinary case');

  var ticks = q(PG, '.ytick').length;
  eq(num(c, 'data-plot-h'), (ticks - 1) * pitch,
    'D3 the plot height is derived from the tick count, not fixed');

  /* D4 NO MARKER LEAVES THE PLOT. This is what the gutter is for: a 50px plate centred on the
     lowest price used to hang into the words below it. */
  var top = num(c, 'data-plot-top'), bot = num(c, 'data-plot-bottom');
  var lane = num(c, 'data-lane-top');
  var plates = q(PG, '.mk-img-plate');
  ok(plates.length > 0, 'D4 there are plates to check', plates.length);
  var over = plates.filter(function (n) {
    var y = num(n, 'y'), h = num(n, 'height');
    return y + h > lane || y < 0;
  });
  eq(over.length, 0, 'D5 and not one of them reaches the label lane or leaves the drawing');
  var outsideGutter = plates.filter(function (n) {
    var y = num(n, 'y'), h = num(n, 'height');
    return y + h / 2 < top - 1 || y + h / 2 > bot + 1;
  });
  eq(outsideGutter.length, 0, 'D6 every plate is centred on a price inside the scale');

  eq(num(plates[0], 'height'), 50, 'D7 the image is the 50px the review asked for');

  /* D7a THE GUARANTEE, NOT THE INSTANCE. No product in this fixture happens to sit exactly on the
     bottom tick, so "no plate collides today" would pass on a chart that collides tomorrow. The
     gutter is what makes it impossible: it is at least half a plate at both ends, so a product AT
     an end tick still clears the lane and the top of the drawing. */
  var halfPlate = num(plates[0], 'height') / 2;
  ok(lane - bot >= halfPlate,
    'D7a the bottom gutter is at least half a plate, so a product on the lowest tick still clears'
    + ' the label lane', { gutter: lane - bot, halfPlate: halfPlate });
  ok(top >= halfPlate,
    'D7b and the top gutter is too', { gutter: top, halfPlate: halfPlate });

  /* D8 A HUGE RANGE WIDENS THE STEP INSTEAD OF CRUSHING THE PITCH. Keeping a 5-unit step while the
     pixels shrink is the defect; two 50px photographs 28px apart overlap. */
  eq(SRC.prototype.indexOf('var STEP_LADDER_C = [500, 1000, 2500, 5000, 10000, 25000];') >= 0, true,
    'D8 the renderer carries a step ladder rather than one fixed step');
  ok(/PX_PER_TICK_MIN\s*=\s*44/.test(SRC.prototype),
    'D9 and a declared readability floor');

  // D10 THE CONTAINER TAKES THE OVERFLOW, in both directions, and print undoes both.
  ok(/\.chartwrap\s*\{[^}]*overflow-y:\s*auto/.test(SRC.css),
    'D10 a drawing too tall for the card scrolls inside the card');
  ok(/@media print[\s\S]*\.chartwrap\s*\{[^}]*max-height:\s*none\s*!important/.test(SRC.css),
    'D11 and print lifts the cap so nothing is clipped on paper');
}());

// ===================================================================================================
console.log('\n=== SECTION E  THE LABEL LANE ===');
// ===================================================================================================
(function () {
  if (PG.thrown) return;
  var c = q(PG, '.chart')[0];
  var lane = num(c, 'data-lane-top'), laneH = num(c, 'data-lane-h');

  ok(q(PG, '.labellane').length === 1, 'E1 the lane is an element, with a declared height');
  eq(num(q(PG, '.labellane')[0], 'data-lane-h'), laneH, 'E2 and it is the drawing\u2019s own');
  eq(num(c, 'data-vb-h'), lane + laneH, 'E3 the chart is exactly the plot plus the lane');

  /* E4 ONE BASELINE. The stagger this replaced put half the labels 18px lower than the other half,
     which reads as two different kinds of product. */
  var labs = q(PG, '.xlabel').map(function (n) { return num(n, 'y'); });
  eq(labs.filter(function (v) { return v !== labs[0]; }).length, 0,
    'E4 every product label sits on one baseline');
  var subs = q(PG, '.xsub').map(function (n) { return num(n, 'y'); });
  eq(subs.filter(function (v) { return v !== subs[0]; }).length, 0,
    'E5 and so does every price beneath them');

  // E6 THE LANE IS MEASURED FROM THE LANE, never from a price.
  ok(labs[0] > lane && subs[0] > lane, 'E6 both rows are inside the lane', [lane, labs[0], subs[0]]);
  var gap = subs[0] - labs[0];
  ok(gap >= 6 && gap <= 24, 'E7 with clear space between the sku and its price', gap);
  ok(subs[0] <= lane + laneH, 'E8 and the second row still fits inside it');

  /* E9 THE SERIES IS NOT PRINTED UNDER EVERY COLUMN. The filter that selected it and the panel
     heading already say it; a third copy would take the space the sku and the price need. */
  var seriesNames = ['Spatula', 'Can Opener', 'Whisk'];
  var repeats = q(PG, '.xlabel').concat(q(PG, '.xsub')).filter(function (n) {
    return seriesNames.some(function (sname) { return n.textContent.indexOf(sname) >= 0; });
  });
  eq(repeats.length, 0, 'E9 no lane row repeats the Series');

  // E10 AND THE PRICE AND VARIANT COUNT ARE THERE.
  ok(/\d/.test(q(PG, '.xsub')[0].textContent), 'E10 the second row carries the everyday price');

  /* E11 TRUNCATION, NOT OVERLAP — measured on the 44-product chart where the columns are narrow. */
  var w = bootPage(null);
  id(w, 'advFiltersToggle').click();
  var sw = id(w, 'fStress');
  sw.checked = true;
  sw.dispatchEvent(new w.dom.Event('change', { bubbles: true }));
  id(w, 'catMore').click();
  var t2 = q(w, '.catmenu-item').filter(function (n) {
    return n.getAttribute('data-category') === 'Electric Can Opener'; });
  t2[0].click();
  var wide = q(w, '.chart')[0];
  var colW = num(wide, 'data-col-w');
  eq(q(w, '.col').length, 44, 'E11 forty-four columns to crowd');
  var wLabs = q(w, '.xlabel');
  /* READ THE DRAWN STRING, NOT textContent. An SVG <title> is never painted but it IS part of its
     parent's textContent, so a truncated label would read as its short form followed by its long
     one — which is why the drawn text is published as an attribute of its own. */
  var tooWide = wLabs.filter(function (n) {
    return String(n.getAttribute('data-shown')).length * 6.6 > colW;
  });
  eq(tooWide.length, 0, 'E12 and not one drawn label is wider than its own column',
    tooWide.map(function (n) { return n.getAttribute('data-shown'); }));
  var cut = wLabs.filter(function (n) { return n.getAttribute('data-truncated') === 'true'; });
  ok(cut.length > 0, 'E13 the long ones were shortened', cut.length);
  var lostText = cut.filter(function (n) {
    return !n.getAttribute('data-full') || n.querySelectorAll('title').length !== 1;
  });
  eq(lostText.length, 0, 'E14 and none of them lost its full text');
  var kept = wLabs.filter(function (n) { return n.getAttribute('data-truncated') === 'false'; });
  eq(kept.filter(function (n) { return n.querySelectorAll('title').length; }).length, 0,
    'E15 while a label that fits carries no second copy of itself');

  // E16 ONE BASELINE SURVIVES THE DENSITY TEST TOO.
  var wy = wLabs.map(function (n) { return n.getAttribute('y'); });
  eq(wy.filter(function (v) { return v !== wy[0]; }).length, 0,
    'E16 all 44 labels still share one baseline');
  eq(q(w, '.xlabel[data-row="b"]').length, 0, 'E17 nothing was dropped onto a second row');

  // E18 AND NO PLATE REACHES THE LANE AT 44 COLUMNS EITHER.
  var wLane = num(wide, 'data-lane-top');
  eq(q(w, '.mk-img-plate').filter(function (n) {
    return num(n, 'y') + num(n, 'height') > wLane; }).length, 0,
    'E18 no plate crosses into the lane at 44 columns');

  /* E19 THE PLACEHOLDER AND THE PHOTOGRAPH ARE THE SAME SHAPE. A fallback of a different size
     would make "no picture" look like a different kind of product. */
  var sizes = q(PG, '.mk-img-plate').map(function (n) {
    return num(n, 'width') + 'x' + num(n, 'height'); });
  eq(sizes.filter(function (v) { return v !== sizes[0]; }).length, 0,
    'E19 every marker plate is the same size, with or without a photograph');
}());

// ===================================================================================================
console.log('\n=== SECTION F  NOTHING JUMPS WHEN A LAYER IS SWITCHED ===');
// ===================================================================================================
(function () {
  if (PG.thrown) return;

  // F1 THE CARD IS THE SAME HEIGHT. This is what pushed the comparison table up and down.
  var p = chartPage();
  var h0 = q(p, '.chart')[0].getAttribute('height');
  setLayer(p, 'msrp', false);
  setLayer(p, 'floor', false);
  eq(q(p, '.chart')[0].getAttribute('height'), h0, 'F1 the chart keeps its height across a toggle');

  // F2 THE LEGEND BLOCK KEEPS ITS PLACE even as keys come and go.
  ok(/\.legend\s*\{[^}]*min-height:/.test(SRC.css),
    'F2 the legend reserves its block so losing a key does not drag the page up');

  // F3 THE ZOOM SURVIVES. A person who chose 150% for a room did not ask to leave it.
  var z = chartPage();
  id(z, 'zoom-1-5').click();
  var w150 = q(z, '.chart')[0].getAttribute('width');
  var vb150 = q(z, '.chart')[0].getAttribute('viewBox');
  setLayer(z, 'promo', false);
  eq(q(z, '.chart')[0].getAttribute('data-zoom'), '1.5', 'F3 a layer toggle keeps the zoom');
  eq(q(z, '.chart')[0].getAttribute('width'), w150, 'F4 and the painted width with it');
  eq(q(z, '.chart')[0].getAttribute('viewBox'), vb150,
    'F5 while the coordinate system is byte-identical, as it is at every size');
  eq(id(z, 'zoom-1-5').getAttribute('aria-pressed'), 'true', 'F6 and the control still says so');

  // F7 THE SIDEWAYS POSITION SURVIVES. Redrawing the chart must not send the reader back to column 1.
  var sc = chartPage();
  id(sc, 'zoom-1-5').click();
  q(sc, '.chartwrap')[0].scrollLeft = 240;
  setLayer(sc, 'steps', false);
  eq(q(sc, '.chartwrap')[0].scrollLeft, 240,
    'F7 the chart keeps the reader\u2019s horizontal position across a redraw');

  /* F8 NO MISLEADING MOTION. A transition on a position or a size would animate a price from one
     place to another, which says something untrue about the data. Opacity may fade. */
  var moving = (SRC.css.match(/transition:[^;]+;/g) || []).filter(function (d) {
    return /transform|top|left|height|width|cy|y\b/.test(d);
  });
  eq(moving, [], 'F8 no transition animates a position or a size anywhere in the stylesheet');

  // F9 CLEAN AND DETAIL ARE DETERMINISTIC — press each twice and get the same page.
  var d1 = chartPage();
  id(d1, 'view-clean').click();
  var after1 = q(d1, '.col')[0].childNodes.length;
  id(d1, 'view-detail').click();
  id(d1, 'view-clean').click();
  eq(q(d1, '.col')[0].childNodes.length, after1, 'F9 Clean draws the same thing every time');
}());

// ===================================================================================================
console.log('\n=== SECTION G  A PRICE GAP IS CALLED A PRICE GAP ===');
// ===================================================================================================
(function () {
  if (PG.thrown) return;
  var marks = q(PG, '.gapmark');
  ok(marks.length >= 1, 'G1 there is a gap on the chart to read', marks.length);
  var label = q(PG, '.gaplabel')[0];

  /* G2 THE WORDS, IN THE PANEL'S OWN CURRENCY — in whichever of the three forms fits the gutter
     the line is drawn in. Insisting on the long one would be insisting on a label that lies
     across the next product's markers, which is the defect a screenshot found this round. */
  var drawn = label.getAttribute('data-shown');
  ok(/^USD 10( Price gap| gap)?$/.test(drawn),
    'G2 the label names the amount in this panel\u2019s currency', drawn);
  ok(drawn.indexOf('open') < 0, 'G3 and the word "open" is gone from it');
  ok(num(marks[0], 'data-label-w') <= num(marks[0], 'data-room'),
    'G2a and whichever form is drawn fits between its line and the next column',
    { w: num(marks[0], 'data-label-w'), room: num(marks[0], 'data-room') });
  ok(label.querySelectorAll('title').length === 1
    && label.querySelectorAll('title')[0].textContent.indexOf('Price gap between') > 0,
    'G2b while the whole sentence stays on the element, whichever form is painted');

  // G4 NOWHERE ELSE EITHER — the switch and the legend say the same three words.
  var layerText = q(PG, '.ctl-layers .chk-text').map(function (n) { return n.textContent; });
  ok(layerText.indexOf('Price gaps') >= 0, 'G4 the layer switch is called Price gaps', layerText);
  eq(layerText.filter(function (t) { return /open/i.test(t); }), [],
    'G5 and no layer is called "open" anything');
  var legendText = q(PG, '#chartLegend .lg-text').map(function (n) { return n.textContent; });
  ok(legendText.indexOf('Price gap') >= 0, 'G6 the legend agrees', legendText);
  eq(legendText.filter(function (t) { return /open/i.test(t); }), [], 'G7 and so does it');

  // G8 THE FINDING A PERSON READS IN THE DRAWER.
  var m = board({ filters: { category: 'Silicone Spatula' }, thresholdC: 800 });
  var gaps = m.architecture.findings.filter(function (f) { return f.kind === 'PRICE_GAP'; });
  ok(gaps.length >= 1, 'G8 the pipeline found one', gaps.length);
  ok(gaps[0].headline.indexOf('Price gap of') === 0,
    'G9 and its headline says what it is', gaps[0].headline);
  ok(/not an\s+inventory shortage or an order status/.test(gaps[0].detail.replace(/\s+/g, ' ')),
    'G10 and says what it is NOT, because "gap" is read four ways on this page');

  /* G11 THE CONTRACT KEYS ARE UNCHANGED. Renaming a key is a migration; this round changed the
     words a person reads and nothing a consumer depends on. */
  eq(Object.keys(gaps[0]).filter(function (k) {
    return ['kind', 'distance_c', 'threshold_c'].indexOf(k) >= 0;
  }).sort(), ['distance_c', 'kind', 'threshold_c'], 'G11 kind, distance_c and threshold_c survive');
  eq(gaps[0].kind, 'PRICE_GAP', 'G12 with the same value');

  /* G13 THE BOUNDARY IS THE ONE THE SPEC ALREADY DECLARED — strictly greater than the threshold
     (selectors.js: "a step exactly equal to the threshold is not a gap"). The brief asked for >=;
     the spec is explicit and reasoned, so it is reported rather than quietly changed. */
  var exact = board({ filters: { category: 'Silicone Spatula' }, thresholdC: 1000 });
  eq(exact.architecture.findings.filter(function (f) { return f.kind === 'PRICE_GAP'; }).length, 0,
    'G13 a step of exactly the threshold is NOT a gap');
  var justUnder = board({ filters: { category: 'Silicone Spatula' }, thresholdC: 999 });
  eq(justUnder.architecture.findings.filter(function (f) {
    return f.kind === 'PRICE_GAP'; }).length, 1, 'G14 and one cent under it is');

  // G15 THE HOVER AND FOCUS PANEL NAMES BOTH NEIGHBOURS, THE DISTANCE AND THE THRESHOLD.
  var mark = marks[0];
  mark.dispatchEvent(new PG.dom.Event('focus', { bubbles: false }));
  var tipText = id(PG, 'tip').textContent;
  ok(/Lower/.test(tipText) && /Upper/.test(tipText), 'G15 the panel names both neighbours', tipText);
  ok(tipText.indexOf('Gap threshold in force') >= 0, 'G16 and the threshold in force');
  ok(/unoccupied price tier/.test(tipText), 'G17 and defines the term');
  ok(/not an inventory shortage or an order status/.test(tipText),
    'G18 and rules out the three readings it is not');
  eq(id(PG, 'tip').getAttribute('data-anchor'), 'focus', 'G19 reached by keyboard, not only hover');

  // G20 THE MEASUREMENT IS THE TWO NEIGHBOURS IT NAMES.
  eq(num(mark, 'data-gap-c'),
    num(mark, 'data-upper-c') - num(mark, 'data-lower-c'),
    'G20 the amount is the distance between the two prices on the mark');
  eq(num(mark, 'data-threshold-c'), 800, 'G21 and the threshold is the one in force');
  ok(num(mark, 'data-gap-c') > num(mark, 'data-threshold-c'),
    'G22 and it is above it, strictly');

  /* G23 THE LABEL IS NOT ON A PHOTOGRAPH. The line sits on the boundary between two columns, which
     is at least half a column from either centre, and half a column is wider than half a plate. */
  var lx = num(label, 'x');
  var tooClose = q(PG, '.mk-img-plate').filter(function (n) {
    var cx = num(n, 'x') + num(n, 'width') / 2;
    return Math.abs(cx - lx) < num(n, 'width') / 2;
  });
  eq(tooClose.length, 0, 'G23 no gap label lands on a product image');

  // G24 THE FORM IS CHOSEN BY WHAT FITS, and every gap on every chart is checked, not just one.
  var overflowing = marks.filter(function (n) {
    return num(n, 'data-label-w') > num(n, 'data-room');
  });
  eq(overflowing.length, 0, 'G24 no gap label is wider than the room beside its line');
  ok(SRC.prototype.indexOf("'data-side': left ? 'left' : 'right'") >= 0,
    'G25 and a label that would collide goes to the other side of its line');
}());

// ===================================================================================================
console.log('\n=== SECTION H  THE VIEWPORT DOES NOT MOVE ===');
// ===================================================================================================
/*
 * SIX STARTING POSITIONS, EIGHT ACTIONS EACH. The operator's report was that the jump depended on
 * where the page was scrolled, which is exactly what a rebuild above the reading position does — so
 * one position would have proved nothing.
 */
(function () {
  if (PG.thrown) return;
  var POSITIONS = [
    ['the top of the page', 0],
    ['the panel just below the fold', 400],
    ['the panel in the middle', 900],
    ['the panel near the bottom', 1400],
    ['the chart title in the middle', 2000],
    ['near the end of the page', 3000]
  ];
  var ACTIONS = [
    ['change Series', function (p) { fire(p, 'scSeries', 'Spatula'); }],
    ['Proposed to Everyday', function (p) { fire(p, 'scField', 'everyday_scenario_price'); }],
    ['Everyday to Proposed', function (p) { fire(p, 'scField', 'proposed_scenario_price'); }],
    ['change Adjustment', function (p) { fire(p, 'scAdjust', 'by_percent'); }],
    ['type an amount', function (p) {
      var n = id(p, 'scValue');
      n.value = '10';
      n.dispatchEvent(new p.dom.Event('input', { bubbles: true }));
      n.dispatchEvent(new p.dom.Event('change', { bubbles: true }));
    }],
    ['Apply', function (p) { id(p, 'scApply').click(); }],
    ['Undo', function (p) { id(p, 'scUndo').click(); }],
    ['Reset this Series', function (p) { id(p, 'scResetSeries').click(); }]
  ];
  /* THE FIRST FIVE ADD AND REMOVE NOTHING ANYWHERE, so the anchor is meaningful for them. Apply,
     Undo and Reset legitimately write into the reserved status row, which the node-counting layout
     model cannot tell apart from a real shift — so they are held to the scroll position and the
     reserved height is asserted in the stylesheet instead. See the header. */
  var ANCHORED = 5;

  /* WHAT WAS MEASURED, AND WHAT IT MEANS.

     Across all forty-eight interactions the ANCHOR never moves: the content the reader is looking
     at stays exactly where it was. The raw scroll offset is also unchanged for forty-two of them,
     because nothing was added to or removed from the page above the reading position.

     THE EXCEPTIONS ARE APPLY AND UNDO, AND THEY ARE CORRECT. Applying a scenario puts the
     UNSAVED SCENARIO line into the banner — a real new line of content, above everything, which
     is the whole point of it; undoing takes it away again. Holding the scroll offset constant
     across that would push the page by the height of that line, which is the defect wearing the
     opposite coat. So the offset moves by exactly that height and the reader sees the same thing:
     content preserved, not a number.

     AND ONE PLACE WHERE EVEN THAT IS NOT POSSIBLE. A page already scrolled to the very top cannot
     compensate for content DISAPPEARING above it — there is nowhere further up to go, so the
     remaining content rises by the height of the line that left. No implementation can avoid it,
     a browser's own scroll anchoring does the same, and pretending otherwise would mean asserting
     something untrue. It is allowed here exactly once, at exactly that position and only in that
     direction, and counted so the exemption cannot quietly grow. */
  var bad = [], anchorBad = [], focusBad = [], meetingBad = [], zoomBad = [], sideBad = [];
  var callsBad = [], clamped = [];
  var MOVES_THE_BANNER = { 5: 1, 6: 1 };        // Apply adds the UNSAVED line; Undo removes it
  POSITIONS.forEach(function (pos) {
    var p = openMeeting(chartPage());
    if (p.thrown) { bad.push(pos[0] + ': threw'); return; }
    id(p, 'zoom-1-25').click();
    var wrap = q(p, '.chartwrap')[0];
    wrap.scrollLeft = 180;
    var focused = id(p, 'scSeries');
    focused.focus();
    ACTIONS.forEach(function (act, ai) {
      p.dom.window.__place(0, pos[1]);
      var topBefore = id(p, 'view').getBoundingClientRect().top;
      act[1](p);
      var w = p.dom.window;
      var topAfter = id(p, 'view').getBoundingClientRect().top;
      if (topAfter !== topBefore) {
        if (w.scrollY === 0 && topAfter < topBefore) {
          clamped.push(pos[0] + ' / ' + act[0]);
        } else {
          anchorBad.push(pos[0] + ' / ' + act[0] + ': ' + topBefore + ' -> ' + topAfter);
        }
      }
      if (!MOVES_THE_BANNER[ai] && (w.scrollX !== 0 || w.scrollY !== pos[1])) {
        bad.push(pos[0] + ' / ' + act[0] + ': ' + w.scrollX + ',' + w.scrollY
          + ' (wanted 0,' + pos[1] + ')');
      }
      if (w.__scrollCalls > 1) callsBad.push(pos[0] + ' / ' + act[0] + ': ' + w.__scrollCalls);
      if (p.dom.document.activeElement !== focused) focusBad.push(pos[0] + ' / ' + act[0]);
      if (id(p, 'meetingToggle').getAttribute('aria-expanded') !== 'true') {
        meetingBad.push(pos[0] + ' / ' + act[0]);
      }
      var ch = q(p, '.chart')[0];
      if (ch && ch.getAttribute('data-zoom') !== '1.25') zoomBad.push(pos[0] + ' / ' + act[0]);
      var wr = q(p, '.chartwrap')[0];
      if (wr && wr.scrollLeft !== 180) {
        sideBad.push(pos[0] + ' / ' + act[0] + ': ' + wr.scrollLeft);
      }
    });
  });
  eq(anchorBad, [],
    'H1 forty-eight interactions and the content the reader was looking at never moves');
  eq(bad, [], 'H2 and the scroll offset itself is untouched by all but Apply and Undo');
  eq(clamped, ['the top of the page / Undo'],
    'H2a the single unavoidable case is a page already at the top losing a line above it');
  eq(callsBad, [], 'H3 no interaction scrolls the window more than once');
  eq(focusBad, [], 'H4 the control being used is never replaced under the reader\u2019s hands');
  eq(meetingBad, [], 'H5 a dropdown never collapses or opens meeting mode');
  eq(zoomBad, [], 'H6 nor resets the zoom');
  eq(sideBad, [], 'H6a nor the chart\u2019s horizontal position');

  /* H6b THE ONE MOVEMENT, NAMED. Apply adds the banner's UNSAVED SCENARIO line, and the offset
     moves by exactly the amount the content above the reader grew — which is what keeps the
     content still. It is a compensation, not a scroll. */
  (function () {
    var p = openMeeting(chartPage());
    fire(p, 'scSeries', 'Spatula');
    fire(p, 'scValue', '25.00');
    ok(!id(p, 'scenarioPrintMark'), 'H6b no scenario mark in the banner before Apply');
    p.dom.window.__place(0, 900);
    var topBefore = id(p, 'view').getBoundingClientRect().top;
    id(p, 'scApply').click();
    ok(!!id(p, 'scenarioPrintMark'), 'H6c Apply puts the UNSAVED SCENARIO line in the banner');
    eq(id(p, 'view').getBoundingClientRect().top, topBefore,
      'H6d and the reader\u2019s content is exactly where it was');
    eq(p.dom.window.__scrollCalls, 1, 'H6e having been compensated once, deliberately');
  }());

  /* H7 THE VALUES REALLY DID CHANGE. Every assertion above would also pass on a form that ignored
     every input, which would be the easiest way to keep a page still. */
  var p2 = openMeeting(chartPage());
  fire(p2, 'scSeries', 'Spatula');
  eq(id(p2, 'scSeries').value, 'Spatula', 'H7 the Series really changed');
  eq(id(p2, 'scenarioReach').getAttribute('data-skus') !== '0', true,
    'H8 and the reach count followed it', id(p2, 'scenarioReach').getAttribute('data-skus'));
  fire(p2, 'scField', 'everyday_scenario_price');
  var offered = id(p2, 'scAdjust').childNodes.map(function (o) { return o.getAttribute('value'); });
  eq(offered, ['by_amount', 'by_percent'],
    'H9 and the Adjustment options followed the price field');
  eq(id(p2, 'scAdjust').value, 'by_amount',
    'H10 landing on a legal choice, because Everyday cannot be Set to one figure');
  eq(id(p2, 'scValueLabel').textContent, 'Amount', 'H11 and the amount field is relabelled');
  fire(p2, 'scField', 'proposed_scenario_price');
  eq(id(p2, 'scAdjust').childNodes.map(function (o) { return o.getAttribute('value'); }),
    ['set', 'by_amount', 'by_percent'], 'H12 and back again');

  // H13 A REFUSAL IS A SENTENCE IN A ROW THAT WAS ALREADY THERE.
  var p3 = openMeeting(chartPage());
  p3.dom.window.__place(0, 700);
  id(p3, 'scApply').click();
  eq([p3.dom.window.scrollX, p3.dom.window.scrollY], [0, 700],
    'H13 refusing an incomplete form does not move the page');
  ok(!!id(p3, 'scenarioModeRefusal'), 'H14 and it does say why');
  eq(id(p3, 'scenarioStatus').getAttribute('data-state'), 'refused', 'H15 in the reserved row');

  // H16 THE ROW IS RESERVED IN THE STYLESHEET, which is the half the node model cannot see.
  ok(/\.scenario-status\s*\{[^}]*min-height:/.test(SRC.css),
    'H16 the status row holds its height whether or not it has anything to say');
  ok(/\.scenario-row\s*\{[^}]*display:\s*grid/.test(SRC.css),
    'H17 and the form is a grid, so a longer option label cannot re-wrap it');
  ok(/\.scenario-resets\s+\.btn\s*\{[^}]*min-width:/.test(SRC.css),
    'H18 a disabled reset button is the same size as an enabled one');

  /* H19 NO SCROLL API IN A HANDLER. The fix is the absence of the rebuild, not a scroll patch over
     it: the only scrollTo in the file is the anchor compensation, and it is conditional. */
  eq(SRC.prototype.split('scrollIntoView').length - 1, 0,
    'H19 nothing on the page scrolls an element into view');
  eq(SRC.prototype.split('window.scrollTo(').length - 1, 1,
    'H20 there is exactly one scrollTo, and it is the anchor compensation');
  ok(SRC.prototype.indexOf('if (before && topBefore !== null && topAfter !== null'
    + ' && topAfter !== topBefore') >= 0,
    'H21 which only runs when the anchor actually moved');
  eq(SRC.prototype.split('location.hash').length - 1, 0, 'H22 and nothing navigates to a fragment');
}());

// ===================================================================================================
console.log('\n=== SECTION I  WHAT KEEPS ITS IDENTITY ===');
// ===================================================================================================
(function () {
  if (PG.thrown) return;
  var p = openMeeting(chartPage());
  var names = ['scenarioPanel', 'scSeries', 'scField', 'scAdjust', 'scValue', 'scApply',
    'scenarioRow', 'scenarioReach', 'scenarioStatus', 'view', 'scopeSite', 'scopeAnalysis'];
  var before = {};
  names.forEach(function (n) { before[n] = id(p, n); });
  var chartBefore = q(p, '.chartwrap')[0];

  fire(p, 'scSeries', 'Spatula');
  fire(p, 'scField', 'everyday_scenario_price');
  fire(p, 'scAdjust', 'by_percent');
  fire(p, 'scField', 'proposed_scenario_price');

  var replaced = names.filter(function (n) { return id(p, n) !== before[n]; });
  eq(replaced, [], 'I1 four dropdown changes and not one node was replaced');
  eq(q(p, '.chartwrap')[0] === chartBefore, true, 'I2 including the chart, which was not redrawn');

  /* I3 THE OPTIONS INSIDE THE ADJUSTMENT SELECT DID CHANGE, though the select did not — which is
     the distinction the whole section is about. */
  var p2 = openMeeting(chartPage());
  var adj = id(p2, 'scAdjust');
  var optsBefore = adj.childNodes.length;
  fire(p2, 'scField', 'everyday_scenario_price');
  eq(id(p2, 'scAdjust') === adj, true, 'I3 the Adjustment select is the same element');
  ok(adj.childNodes.length !== optsBefore, 'I4 and its options were rewritten in place',
    [optsBefore, adj.childNodes.length]);

  /* I5 A CHANGE OF SITE DOES REBUILD THE MENUS, and must — those are different products. The rule
     is not "never rebuild", it is "rebuild what changed". */
  var p3 = chartPage();
  var siteBefore = id(p3, 'scopeAnalysis');
  fire(p3, 'fCountry', 'DE');
  ok(id(p3, 'scopeAnalysis') !== siteBefore,
    'I5 changing the country DOES rebuild the analysis filters, because the menus differ');
}());

// ===================================================================================================
console.log('\n=== SECTION J  WHAT ONLY A SCREENSHOT COULD SEE, AGAIN ===');
// ===================================================================================================
/*
 * Two more defects got past a green suite and were found by rendering the page and looking at it.
 * Both are here as the nearest assertion that would have caught them.
 *
 *   1. The executive recommendation still read "1 open step in the ladder". Every search this
 *      round had been for the phrase "open price step"; this sentence says "open step". A rename
 *      driven by grep finds the places you remembered to grep for.
 *   2. "USD 10 Price gap" is drawn beside its line, and the line sits between two columns — but
 *      the label is about 100px of type and half a column is 104px. It ran past the next
 *      product's centre and landed on that product's band and its live-promotion diamond. The
 *      assertion in place checked the label against the PHOTOGRAPHS, and the photographs were
 *      clear; nothing checked it against the other markers.
 */
(function () {
  if (PG.thrown) return;

  /* J1 NO PRICE ON THIS PAGE IS "OPEN" ANYTHING. Not the chart, not the legend, not the switch,
     not the findings drawer, and not the recommendation — which is where the survivor was. */
  function visibleText(node) {
    if (!node) return '';
    if (node.nodeType === 1 && node.hidden) return '';
    if (node.nodeType === 1 && String(node.localName).toLowerCase() === 'title') return '';
    var kids = node.childNodes || [];
    if (!kids.length) return String(node.textContent || '');
    var out = '';
    for (var i = 0; i < kids.length; i++) out += visibleText(kids[i]) + ' ';
    return out;
  }
  var page = visibleText(id(PG, 'view')) + ' ' + visibleText(id(PG, 'scope'));
  eq(page.match(/open\s+(step|steps|price|tier|gap)/gi), null,
    'J1 nothing on the page calls a price gap an "open" anything');
  eq(page.match(/\d[\d.,]*\s+open\b/gi), null, 'J2 and no amount is followed by the word');
  ok(/price gap/i.test(page), 'J3 while the page does say what it is', true);

  /* J4 THE RECOMMENDATION, SPECIFICALLY — the one surface the rename missed. */
  var reco = q(PG, '.reco li').concat(q(PG, 'li')).map(function (n) { return n.textContent; })
    .filter(function (t) { return /ladder/.test(t); });
  ok(reco.length >= 1, 'J4 the recommendation talks about the ladder', reco.length);
  eq(reco.filter(function (t) { return /open/i.test(t); }), [],
    'J5 and it does not call the gap an open step');

  /* J6 NO GAP LABEL LIES ACROSS ANOTHER PRODUCT'S MARKERS. The photographs were never the only
     things on the chart; the band, the caps and the promotion diamond are markers too. */
  var bad = [];
  q(PG, '.gapmark').forEach(function (mk) {
    var lbl = mk.querySelectorAll('.gaplabel')[0];
    if (!lbl) return;
    var x = num(lbl, 'x');
    var w = num(mk, 'data-label-w');
    var side = mk.getAttribute('data-side');
    var endX = side === 'left' ? x - w : x + w;
    var y = num(lbl, 'y');
    q(PG, '.col').forEach(function (col) {
      var plate = col.querySelectorAll('.mk-img-plate')[0];
      if (!plate) return;
      var cx = num(plate, 'x') + num(plate, 'width') / 2;
      var lo = Math.min(x, endX), hi = Math.max(x, endX);
      if (cx >= lo && cx <= hi) {
        bad.push(col.getAttribute('data-label') + ' crossed by a gap label at y=' + y);
      }
    });
  });
  eq(bad, [], 'J6 no gap label reaches another column\u2019s centre line');

  /* J7 AND THE SAME AT 44 COLUMNS, where the gutter is 37px and the long phrase cannot fit. */
  var w2 = bootPage(null);
  id(w2, 'advFiltersToggle').click();
  var sw2 = id(w2, 'fStress');
  sw2.checked = true;
  sw2.dispatchEvent(new w2.dom.Event('change', { bubbles: true }));
  id(w2, 'catMore').click();
  var tgt = q(w2, '.catmenu-item').filter(function (n) {
    return n.getAttribute('data-category') === 'Electric Can Opener'; });
  tgt[0].click();
  var wide = q(w2, '.gapmark');
  var over = wide.filter(function (n) {
    return num(n, 'data-label-w') > num(n, 'data-room');
  });
  eq(over.length, 0, 'J7 not one of the ' + wide.length
    + ' gap labels on the 44-product chart overflows its gutter');
}());

// ===================================================================================================
console.log('\n=== MUTANTS ===');
// ===================================================================================================

mut('M1 the domain is computed from the visible layers again, so a checkbox moves every price',
  function () {
    // THE DEFECT THIS ROUND EXISTS TO REMOVE.
    var m = withProto(swap('      take(n._msrp_c);', "      if (layerOn('msrp')) take(n._msrp_c);"));
    function axisAfterHiding(pg) {
      if (pg.thrown) return 'THREW';
      toChart(pg);
      var before = q(pg, '.chart')[0].getAttribute('data-axis-max-c');
      setLayer(pg, 'msrp', false);
      return before + '->' + q(pg, '.chart')[0].getAttribute('data-axis-max-c');
    }
    var clean = axisAfterHiding(bootPage(null)), dirty = axisAfterHiding(m);
    return clean.split('->')[0] === clean.split('->')[1]
      && dirty.split('->')[0] !== dirty.split('->')[1];
  });

mut('M2 the domain is taken from every site at once, so one country stretches another\u2019s ladder',
  function () {
    // §三.7: not the global price range. A US ladder read against a range that includes another
    // country's products is a ladder with no useful resolution left in it — and the prices it
    // shows are still correct, which is what makes it hard to notice.
    var m = withProto(swap('    var dom = scopeDomain(ns);',
      '    var dom = scopeDomain(groupNodes(CANON.rows));'));
    function axis(pg) {
      if (pg.thrown) return 'THREW';
      toChart(pg);
      var c = q(pg, '.chart')[0];
      return c.getAttribute('data-axis-min-c') + '..' + c.getAttribute('data-axis-max-c');
    }
    var clean = axis(bootPage(null)), dirty = axis(m);
    return clean === '1000..4500' && dirty !== clean;
  });

mut('M3 the marker gutter is narrowed, so a product on an end tick would sit on the words',
  function () {
    /* AIMED AT THE GUARANTEE, NOT AN INSTANCE. No product in this fixture sits exactly on the
       bottom tick, so a mutant observed as "does any plate collide today" would survive a chart
       that collides on the first dataset that does. What must hold is the gutter: at least half a
       plate between the lowest gridline and the lane. */
    var m = withProto(swap('  var PLOT_PAD = 30;', '  var PLOT_PAD = 10;'));
    function gutter(pg) {
      if (pg.thrown) return -1;
      toChart(pg);
      var c = q(pg, '.chart')[0];
      var half = Number(q(pg, '.mk-img-plate')[0].getAttribute('height')) / 2;
      return (Number(c.getAttribute('data-lane-top'))
        - Number(c.getAttribute('data-plot-bottom'))) - half;
    }
    return gutter(bootPage(null)) >= 0 && gutter(m) < 0;
  });

mut('M4 the gridline pitch is compressed again, so two photographs overlap', function () {
  var m = withProto(swap('  var PX_PER_TICK = 48;', '  var PX_PER_TICK = 28;'));
  function pitch(pg) {
    if (pg.thrown) return -1;
    toChart(pg);
    return Number(q(pg, '.chart')[0].getAttribute('data-tick-px'));
  }
  return pitch(bootPage(null)) >= 44 && pitch(m) < 44;
});

mut('M5 a layer toggle resets the zoom the room is reading at', function () {
  var m = withProto(swap("        STATE.viewMode = isClean ? 'clean' : (isDetail ? 'detail' : 'custom');\n        renderData();",
    "        STATE.viewMode = isClean ? 'clean' : (isDetail ? 'detail' : 'custom');\n        STATE.zoom = 'fit';\n        renderData();"));
  function zoomAfterToggle(pg) {
    if (pg.thrown) return 'THREW';
    toChart(pg);
    pg.dom.document.getElementById('zoom-1-5').click();
    setLayer(pg, 'promo', false);
    return q(pg, '.chart')[0].getAttribute('data-zoom');
  }
  return zoomAfterToggle(bootPage(null)) === '1.5' && zoomAfterToggle(m) === 'fit';
});

mut('M6 a chart redraw sends the reader back to the first column', function () {
  var m = withProto(swap('    restoreChartScrolls(sideways);', '    // restoreChartScrolls(sideways);'));
  function sidewaysAfterToggle(pg) {
    if (pg.thrown) return -1;
    toChart(pg);
    pg.dom.document.getElementById('zoom-1-5').click();
    q(pg, '.chartwrap')[0].scrollLeft = 240;
    setLayer(pg, 'steps', false);
    return q(pg, '.chartwrap')[0].scrollLeft;
  }
  return sidewaysAfterToggle(bootPage(null)) === 240 && sidewaysAfterToggle(m) === 0;
});

mut('M7 the Series dropdown calls the full render again, taking the page with it', function () {
  var m = withProto(swap(
    "        STATE.scenarioSeries = v; STATE.scenarioRefusal = null; updateScenarioForm();",
    "        STATE.scenarioSeries = v; STATE.scenarioRefusal = null; render();"));
  function selectSurvives(pg) {
    if (pg.thrown) return 'THREW';
    toChart(pg);
    openMeeting(pg);
    var before = pg.dom.document.getElementById('scSeries');
    before.focus();
    before.value = 'Spatula';
    before.dispatchEvent(new pg.dom.Event('change', { bubbles: true }));
    return pg.dom.document.getElementById('scSeries') === before ? 'SAME' : 'REPLACED';
  }
  return selectSurvives(bootPage(null)) === 'SAME' && selectSurvives(m) === 'REPLACED';
});

mut('M8 changing the price field replaces the whole scenario panel', function () {
  var m = withProto(swap(
    "        STATE.scenarioRefusal = null;\n        updateScenarioForm();\n      }, false, null, function (id) { return SEL.scenarioFieldLabel(id); }));",
    "        STATE.scenarioRefusal = null;\n        render();\n      }, false, null, function (id) { return SEL.scenarioFieldLabel(id); }));"));
  function panelSurvives(pg) {
    if (pg.thrown) return 'THREW';
    toChart(pg);
    openMeeting(pg);
    var before = pg.dom.document.getElementById('scenarioPanel');
    var f = pg.dom.document.getElementById('scField');
    f.value = 'everyday_scenario_price';
    f.dispatchEvent(new pg.dom.Event('change', { bubbles: true }));
    return pg.dom.document.getElementById('scenarioPanel') === before ? 'SAME' : 'REPLACED';
  }
  return panelSurvives(bootPage(null)) === 'SAME' && panelSurvives(m) === 'REPLACED';
});

mut('M9 updating the options replaces the select node instead of its children', function () {
  var m = withProto(swap('  function fillOptions(sel, values, labelFn, placeholder) {\n    if (!sel || sameOptions(sel, values)) return false;',
    '  function fillOptions(sel, values, labelFn, placeholder) {\n    if (!sel) return false;\n'
      + '    if (sel.parentNode) {\n'
      + '      var fresh = document.createElement(\'select\');\n'
      + '      fresh.id = sel.id;\n'
      + '      sel.parentNode.appendChild(fresh);\n'
      + '      sel.parentNode.removeChild(sel);\n'
      + '      sel = fresh;\n'
      + '    }'));
  function adjustSurvives(pg) {
    if (pg.thrown) return 'THREW';
    toChart(pg);
    openMeeting(pg);
    var before = pg.dom.document.getElementById('scAdjust');
    var f = pg.dom.document.getElementById('scField');
    f.value = 'everyday_scenario_price';
    f.dispatchEvent(new pg.dom.Event('change', { bubbles: true }));
    return pg.dom.document.getElementById('scAdjust') === before ? 'SAME' : 'REPLACED';
  }
  return adjustSurvives(bootPage(null)) === 'SAME' && adjustSurvives(m) === 'REPLACED';
});

mut('M10 a handler scrolls the panel into view, which is a jump with a friendly name', function () {
  var m = withProto(swap("        STATE.scenarioAdjustment = v; STATE.scenarioRefusal = null; updateScenarioForm();",
    "        STATE.scenarioAdjustment = v; STATE.scenarioRefusal = null; updateScenarioForm();\n"
      + "        byId('scenarioPanel').scrollIntoView();"));
  function scrollAfterAdjust(pg) {
    if (pg.thrown) return -1;
    toChart(pg);
    openMeeting(pg);
    pg.dom.window.__place(0, 900);
    var a = pg.dom.document.getElementById('scAdjust');
    a.value = 'by_percent';
    a.dispatchEvent(new pg.dom.Event('change', { bubbles: true }));
    return pg.dom.window.scrollY;
  }
  return scrollAfterAdjust(bootPage(null)) === 900 && scrollAfterAdjust(m) !== 900;
});

mut('M11 Apply re-focuses a control, and the browser scrolls the page to find it', function () {
  var m = withProto(swap("      renderData();\n    });\n    row.appendChild(apply);",
    "      renderData();\n      byId('scValue').focus();\n    });\n    row.appendChild(apply);"));
  function scrollAfterApply(pg) {
    if (pg.thrown) return 'THREW';
    toChart(pg);
    openMeeting(pg);
    var s2 = pg.dom.document.getElementById('scSeries');
    s2.value = 'Spatula';
    s2.dispatchEvent(new pg.dom.Event('change', { bubbles: true }));
    var v = pg.dom.document.getElementById('scValue');
    v.value = '25.00';
    v.dispatchEvent(new pg.dom.Event('change', { bubbles: true }));
    /* THE READER IS HOLDING THE SERIES BOX. That is the thing the contract protects: after Apply
       the focus is still where they put it, and the window has not gone looking for something
       else. Watching the scroll offset alone would have let this through — the control the mutant
       focuses happens to be on screen at some positions and not at others, which is the same
       position-dependence that made the original defect so hard to pin down. */
    pg.dom.document.getElementById('scSeries').focus();
    pg.dom.window.__place(0, 0);
    pg.dom.document.getElementById('scApply').click();
    var a2 = pg.dom.document.activeElement;
    return (a2 && a2.id) + '@' + pg.dom.window.scrollY;
  }
  return scrollAfterApply(bootPage(null)) === 'scSeries@24'
    && scrollAfterApply(m) !== 'scSeries@24';
});

mut('M12 a scenario select collapses meeting mode under the reader', function () {
  var m = withProto(swap("        STATE.scenarioSeries = v; STATE.scenarioRefusal = null; updateScenarioForm();",
    "        STATE.scenarioSeries = v; STATE.scenarioRefusal = null;\n"
      + "        STATE.meetingOpen = false; render();"));
  function openAfterSeries(pg) {
    if (pg.thrown) return 'THREW';
    toChart(pg);
    openMeeting(pg);
    var s2 = pg.dom.document.getElementById('scSeries');
    s2.value = 'Spatula';
    s2.dispatchEvent(new pg.dom.Event('change', { bubbles: true }));
    var t = pg.dom.document.getElementById('meetingToggle');
    return t ? t.getAttribute('aria-expanded') : 'GONE';
  }
  return openAfterSeries(bootPage(null)) === 'true' && openAfterSeries(m) === 'false';
});

mut('M13 the status line is created and destroyed again, so a refusal shoves the chart down',
  function () {
    /* THE RESERVED HEIGHT HAS TWO HALVES and this is the half a DOM assertion can reach: the same
       <p> is present on an empty form, on a refusal and after an Apply, so nothing is ever added
       to or removed from the page above the reading position. The other half — the stylesheet's
       min-height — is asserted as a stylesheet fact at H16, because that is where it lives. */
    /* AIMED WHERE THE REMOVAL WOULD BE. Making the line disappear only after it exists is not
       the defect — the defect is a row that is absent until there is something to say, so this
       mutant simply does not create it while the form is quiet. */
    /* AIMED WHERE THE REMOVAL WOULD BE. Making the line disappear only after it exists is not
       the defect — the defect is a row that is absent until there is something to say, so this
       mutant simply does not create it while the form is quiet. */
    var m = withProto(swap(
      "    var line = box.querySelector('.scenario-status-line');\n    if (!line) {",
      "    var line = box.querySelector('.scenario-status-line');\n"
        + "    if (!STATE.scenarioRefusal && !STATE.scenarioNotice) {\n"
        + "      if (line) line.parentNode.removeChild(line);\n"
        + "      box.setAttribute('data-state', 'idle');\n      return;\n    }\n"
        + "    if (!line) {"));
    function anchorAcrossARefusal(pg) {
      if (pg.thrown) return 'THREW: ' + pg.thrown.message;
      toChart(pg);
      openMeeting(pg);
      pg.dom.window.__place(0, 300);
      var before = pg.dom.document.getElementById('view').getBoundingClientRect().top;
      pg.dom.document.getElementById('scApply').click();          // refused: no Series, no value
      var after = pg.dom.document.getElementById('view').getBoundingClientRect().top;
      return before === after ? 'STILL' : 'MOVED';
    }
    return anchorAcrossARefusal(bootPage(null)) === 'STILL'
      && anchorAcrossARefusal(m) === 'MOVED';
  });

mut('M14 the gap label goes back to "open", which is read four ways on this page', function () {
  var m = withProto(swap(
    "    return cur + ' ' + plain(c) + (short ? ' gap' : ' Price gap');",
    "    return plain(c) + ' open';"));
  function labelText(pg) {
    if (pg.thrown) return 'THREW';
    toChart(pg);
    var l = pg.dom.document.querySelectorAll('.gaplabel')[0];
    return l ? l.getAttribute('data-shown') : 'NONE';
  }
  return labelText(bootPage(null)) === 'USD 10 gap' && /open/.test(labelText(m));
});

mut('M15 the gap amount is measured between the wrong two prices', function () {
  /* THE ARITHMETIC LIVES IN THE PIPELINE, so the mutant is aimed there — and the observation is
     the chart's own published pair: the mark carries the two neighbours it claims to span, and
     the amount it prints must be the distance between exactly those two. A mutant that measured
     from the cheapest product instead would still draw a plausible line with a plausible number
     on it, which is why this is checked as an identity rather than by eye. */
  var m = bootPage(function (kind, src) {
    if (kind !== 'selectors') return src;
    var a = '      var d = ns[i]._regular_c - ns[i - 1]._regular_c;';
    var n = src.split(a).length - 1;
    if (n !== 1) throw new Error('mutant anchor ' + n + 'x in selectors.js');
    return src.replace(a, '      var d = ns[i]._regular_c - ns[0]._regular_c;');
  });
  function agrees(pg) {
    if (pg.thrown) return 'THREW: ' + pg.thrown.message;
    toChart(pg);
    var marks = pg.dom.document.querySelectorAll('.gapmark');
    if (!marks.length) return 'NONE';
    return marks.every(function (n) {
      return Number(n.getAttribute('data-gap-c'))
        === Number(n.getAttribute('data-upper-c')) - Number(n.getAttribute('data-lower-c'));
    }) ? 'AGREES' : 'DISAGREES';
  }
  return agrees(bootPage(null)) === 'AGREES' && agrees(m) === 'DISAGREES';
});

mut('M16 the axis follows the simulated prices, so a scenario re-scales the chart under it',
  function () {
    /* THE CANONICAL TERM IS WHAT MAKES A SCENARIO ONE-WAY. Take the union with the canonical
       envelope away and the domain becomes whatever is currently being simulated — so the axis
       re-scales every time somebody tries a number, and the ladder they are comparing against
       moves while they compare it. */
    var m = withProto(swap(
      '      hi: (sHi !== null && (hi === null || sHi > hi)) ? sHi : hi,',
      '      hi: sHi === null ? hi : sHi,'));
    function axisAcrossAScenario(pg) {
      if (pg.thrown) return 'THREW';
      toChart(pg);
      openMeeting(pg);
      var before = q(pg, '.chart')[0].getAttribute('data-axis-max-c');
      var s2 = pg.dom.document.getElementById('scSeries');
      s2.value = 'Spatula';
      s2.dispatchEvent(new pg.dom.Event('change', { bubbles: true }));
      var f = pg.dom.document.getElementById('scField');
      f.value = 'everyday_scenario_price';
      f.dispatchEvent(new pg.dom.Event('change', { bubbles: true }));
      var a = pg.dom.document.getElementById('scAdjust');
      a.value = 'by_percent';
      a.dispatchEvent(new pg.dom.Event('change', { bubbles: true }));
      var v = pg.dom.document.getElementById('scValue');
      v.value = '10';
      v.dispatchEvent(new pg.dom.Event('change', { bubbles: true }));
      pg.dom.document.getElementById('scApply').click();
      var after = q(pg, '.chart')[0].getAttribute('data-axis-max-c');
      return before === after ? 'STABLE' : 'RESCALED';
    }
    return axisAcrossAScenario(bootPage(null)) === 'STABLE'
      && axisAcrossAScenario(m) === 'RESCALED';
  });

// ===================================================================================================
var verdict = (fail === 0 && mutSurvived === 0) ? 'PASS' : 'FAIL';
console.log('\n' + verdict + ' — passed ' + pass + ', failed ' + fail
  + ', mutants caught ' + mutCaught + ', survived ' + mutSurvived);
process.exit(verdict === 'PASS' ? 0 : 1);
