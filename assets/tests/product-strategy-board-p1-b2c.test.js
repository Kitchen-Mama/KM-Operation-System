// Kitchen Mama Operation System — PRODUCT-STRATEGY-P1-B2C
// A FIXED FLOOR IS NOT A LAYOUT, AND A COLOUR IS NOT A PILL.
//
// P1-B2B fixed a real collision by nailing three numbers down — 50px images, 48px per gridline, a
// 78vh cap — and on 1280x720 an ordinary seven-product chart stopped fitting in its own card: you
// had to scroll the chart to see its own axis. That is what a floor does. It is right for the one
// screen it was measured on and wrong everywhere else, and the worse part is that it FAILS QUIETLY:
// a scrollbar appears, nothing is broken, and the reader simply cannot see the thing.
//
// So the sizes moved into `chart-layout.js`, a pure function that is handed the container width,
// the room left in the viewport, the product count and the price domain, and decides the gridline
// step, the plot height, the image size, the column width, the type sizes and the label density
// together — because they cannot be settled apart. 48px is now a PREFERENCE.
//
// THE MEASUREMENT IS NOT A REVERSAL OF P1-B2A'S "NO LAYOUT BOX IS MEASURED ANYWHERE". That rule was
// about a HIDDEN dependency: a chart whose geometry depends on WHEN it was measured draws
// differently on a slow load. A measurement that arrives as a named argument to a pure function is
// the opposite of hidden — this suite hands the engine 1366x768 and gets a layout, with no browser
// anywhere in the call.
//
// AND THE COORDINATE IS SEPARATE FROM THE PIXELS. Every marker carries `data-frac`, the price's
// place in its own domain. `data-cy` is meant to change when the window does; `data-frac` is not,
// and §D compares it across seven viewports.
//
// WHAT IT STILL CANNOT DO: see. Whether 24px thumbnails are legible in a meeting room, whether the
// pills look like the Operation System, whether the print is right — those are in §十二 of the
// brief, the checklist is in the design freeze, and this file does not pretend to cover them.
//
// Run: node assets/tests/product-strategy-board-p1-b2c.test.js
'use strict';

var H = require('./_psb-harness.js');
var L = require('../js/product-strategy/psb-chart-layout.js');
var SRC = H.SRC, bootPage = H.bootPage;

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
/* THE SAME SHAPE AS withProto, in developer mode — the stress fixture is reachable only through the
   hook now, and the hook exists only when developer mode was set BEFORE the scripts ran. */
function withProtoDev(mutate) {
  return bootPage(function (kind, src) { return kind === 'prototype' ? mutate(src) : src; },
    { devMode: true });
}
function withLayout(mutate) {
  return bootPage(function (kind, src) { return kind === 'layout' ? mutate(src) : src; });
}
function swap(a, b) {
  return function (src) {
    var n = src.split(a).length - 1;
    if (n !== 1) throw new Error('mutant anchor ' + n + 'x: ' + a.slice(0, 60));
    return src.replace(a, b);
  };
}

function q(p, sel) { return p.dom.document.querySelectorAll(sel); }
function id(p, x) { return p.dom.document.getElementById(x); }
function num(n, a) { return Number(n.getAttribute(a)); }
function chartOf(p) { return q(p, '.chart')[0]; }

/** The seven target viewports of §五, named the way the brief names them. */
var VIEWPORTS = [
  [1920, 1080], [1600, 900], [1440, 900], [1366, 768], [1280, 720], [1024, 768], [768, 1024]
];

function toChart(p, category) {
  if (p.thrown) return p;
  /* P1-B4 — ONE SHARED PICKER. The command bar asks the category control for its menu shape, so a
     chip lookup finds only the trigger. `H.pickCategory` works with either shape. */
  H.pickCategory(p, category || 'Silicone Spatula');
  return p;
}
function openLayers(p) {
  if (p.thrown) return p;
  var t = id(p, 'layersToggle');
  if (t && t.getAttribute('aria-expanded') === 'false') t.click();
  return p;
}
function comfortable(p) {
  if (p.thrown) return p;
  var b = id(p, 'mode-comfortable');
  if (b && b.getAttribute('aria-pressed') === 'false') b.click();
  return p;
}
/** Boot at a given window size, the way a person opens a window of that size. */
function pageAt(w, h, category) {
  var p = bootPage(null);
  if (p.thrown) return p;
  p.dom.window.__viewport(w, h);
  toChart(p, category);
  p.dom.window.__viewport(w, h);
  return p;
}
/** The 44-product stress fixture, loaded the way the Advanced drawer loads it. */
function stressPage(w, h) {
  var p = bootPage(null, { devMode: true });
  if (p.thrown) return p;
  if (w) p.dom.window.__viewport(w, h);
  H.stressChart(p, 'Electric Can Opener');
  if (w) p.dom.window.__viewport(w, h);
  return p;
}

// ===================================================================================================
console.log('\n=== SECTION A  THE PAGE STILL BOOTS, AND STILL CHECKS ITSELF ===');
// ===================================================================================================
var PG = toChart(bootPage(null));
ok(PG.thrown === null, 'A1 the page boots with no exception',
  PG.thrown && (PG.thrown.message + ' :: ' + String(PG.thrown.stack).split('\n')[1]));
(function () {
  if (PG.thrown) return;
  var v = H.selfTestVerdict(PG);
  console.log('     (the page reported ' + v.badge + ')');
  eq(v.bad.map(function (b) { return b.text; }), [],
    'A2 and every one of its own DOM assertions still passes');
  eq(chartOf(PG).getAttribute('data-mode'), 'auto', 'A3 Auto Fit is the default');
}());

// ===================================================================================================
console.log('\n=== SECTION B  THE LAYOUT FUNCTION IS PURE, AND IT IS THE WHOLE ENGINE ===');
// ===================================================================================================
(function () {
  function derive(o) { return L.deriveResponsiveChartLayout(o); }
  var base = { containerWidth: 1180, availableHeight: 520, productCount: 7,
    domainLowC: 1199, domainHighC: 4299, mode: 'auto' };

  // B1 SAME INPUTS, SAME ANSWER. Twenty times, because "usually deterministic" is not a thing.
  var first = JSON.stringify(derive(base));
  var drift = 0;
  for (var i = 0; i < 20; i++) if (JSON.stringify(derive(base)) !== first) drift++;
  eq(drift, 0, 'B1 the same inputs give byte-identical output, twenty times over');

  /* B2 AND IT TOUCHES NOTHING. A layout function that read a global, a clock or a random number
     would be deterministic in a test and not on a page. */
  var srcL = SRC.layout;
  ['document', 'window.', 'localStorage', 'Math.random', 'Date.now', 'new Date',
    'fetch(', 'requestAnimationFrame'].forEach(function (b, n) {
    ok(H.bare(srcL).indexOf(b) < 0, 'B2.' + (n + 1) + ' the engine never reaches for ' + b);
  });

  // B3 IT ANSWERS WITHOUT A BROWSER AT ALL — this whole section runs with no DOM in the process.
  ok(derive(base).viewBoxH > 0, 'B3 and it answers with no DOM in the process at all');

  /* B4 MISSING MEASUREMENTS FALL BACK, they do not throw and they do not return nothing. A first
     paint happens before anything has been measured, and an empty chart then is worse than a
     slightly-wrong one. */
  var blind = derive({ productCount: 7, domainLowC: 1199, domainHighC: 4299, mode: 'auto' });
  eq(blind.measured.containerWidth, L.FALLBACK_WIDTH, 'B4 an unmeasured container falls back');
  ok(blind.viewBoxH > 0 && blind.colW > 0, 'B5 and still produces a usable drawing');

  // B6 THE MODES ARE THE THREE THE BRIEF NAMES, and an unknown one is treated as Auto Fit.
  eq(L.MODES, ['auto', 'comfortable', 'fullscreen'], 'B6 three modes');
  eq(derive({ containerWidth: 1180, availableHeight: 520, productCount: 7,
    domainLowC: 1199, domainHighC: 4299, mode: 'nonsense' }).mode, 'auto',
    'B7 and an unrecognised one is Auto Fit rather than an exception');

  /* B8 THE DENSITY LADDER IS ORDERED AND COHERENT: each profile is smaller than the last in every
     dimension that matters, so "stepping down" is a single idea rather than four. */
  var prev = null, incoherent = [];
  L.DENSITY_ORDER.forEach(function (k) {
    var d = L.DENSITY[k];
    if (prev && !(d.image < prev.image && d.colMin < prev.colMin && d.laneH <= prev.laneH
      && d.labelPx <= prev.labelPx)) incoherent.push(k);
    prev = d;
  });
  eq(incoherent, [], 'B8 every density profile is smaller than the one above it, in every axis');
  eq(L.DENSITY.spacious.image, 50, 'B9 spacious is the 50px the last round settled on');
  ok(L.DENSITY.normal.image >= 42 && L.DENSITY.normal.image <= 46,
    'B10 normal is inside the brief\u2019s 42-46', L.DENSITY.normal.image);
  ok(L.DENSITY.compact.image >= 32 && L.DENSITY.compact.image <= 38,
    'B11 and compact inside its 32-38', L.DENSITY.compact.image);
  ok(L.DENSITY.overview.image >= 20,
    'B12 while the overview thumbnail stays big enough to be a picture',
    L.DENSITY.overview.image);

  /* B13 THE GUTTER IS DERIVED FROM THE IMAGE, ALWAYS. This is the P1-B2B guarantee, and it has to
     survive an image size that is no longer a constant: a marker centred on an end tick must
     still clear the plot edge at every density. */
  var bad = [];
  L.DENSITY_ORDER.forEach(function (k) {
    [1, 7, 24, 44].forEach(function (n) {
      var r = derive({ containerWidth: 1180, availableHeight: 520, productCount: n,
        domainLowC: 1199, domainHighC: 4299, mode: 'auto' });
      if (r.gutter < r.imageSize / 2) bad.push(r.density + '@' + n);
    });
  });
  eq(bad, [], 'B13 the marker gutter is at least half an image at every density');

  // B14 AND THE COUNT BANDS ARE THE BRIEF'S.
  eq([L.densityForCount(1), L.densityForCount(12), L.densityForCount(13),
    L.densityForCount(24), L.densityForCount(25), L.densityForCount(44)],
    ['spacious', 'spacious', 'normal', 'normal', 'overview', 'overview'],
    'B14 1-12 spacious, 13-24 normal, 25 and up overview');
}());

// ===================================================================================================
console.log('\n=== SECTION C  SEVEN PRODUCTS FIT, ON EVERY TARGET VIEWPORT ===');
// ===================================================================================================
/*
 * THE COMPLAINT THIS ROUND EXISTS TO ANSWER, checked on the seven screens the brief names. "Fits"
 * means the whole drawing — both gutters, the plot, the label lane — is inside the height the
 * engine was given, and the columns are inside the width. Not "mostly", and not "after a scroll".
 */
(function () {
  var tooTall = [], tooWide = [], noAxis = [], tiny = [];
  VIEWPORTS.forEach(function (v) {
    var p = pageAt(v[0], v[1]);
    if (p.thrown) { tooTall.push(v.join('x') + ': threw'); return; }
    var c = chartOf(p);
    if (!c) { noAxis.push(v.join('x') + ': no chart'); return; }
    var label = v.join('x') + ' (' + c.getAttribute('data-density') + ')';
    if (c.getAttribute('data-fits-height') !== 'true') tooTall.push(label);
    if (c.getAttribute('data-fits-width') !== 'true') tooWide.push(label);
    if (num(c, 'data-vb-h') > num(c, 'data-measured-h')) {
      tooTall.push(label + ' vb ' + c.getAttribute('data-vb-h')
        + ' > room ' + c.getAttribute('data-measured-h'));
    }
    /* THE AXIS AND THE LANE ARE BOTH PRESENT AND BOTH INSIDE THE BOX. A chart that fits by
       leaving its own axis off would pass every size assertion above. */
    var ticks = q(p, '.ytick');
    if (ticks.length < 3) noAxis.push(label + ' ticks:' + ticks.length);
    var lane = q(p, '.labellane')[0];
    if (!lane) noAxis.push(label + ' no lane');
    else if (num(lane, 'data-lane-top') + num(lane, 'data-lane-h') > num(c, 'data-vb-h')) {
      noAxis.push(label + ' lane outside the box');
    }
    if (num(c, 'data-image-size') < 20) tiny.push(label);
    if (num(c, 'data-tick-px') < L.MIN_PITCH_AUTO) tiny.push(label + ' pitch');
  });
  eq(tooTall, [], 'C1 seven products need no vertical scroll on any target viewport');
  eq(tooWide, [], 'C2 and no horizontal scroll either');
  eq(noAxis, [], 'C3 with both axes and the label lane inside the drawing on every one');
  eq(tiny, [], 'C4 and nothing shrunk below the point where it can be read');

  /* C5 THE PAGE ITSELF NEVER SCROLLS SIDEWAYS BECAUSE OF THE CHART. That is a stylesheet
     guarantee: the overflow belongs to the container, and the panel can actually shrink. */
  ok(/\.panel\s*\{[^}]*min-width:\s*0/.test(SRC.css),
    'C5 the panel can shrink, so an over-wide chart cannot push the page');
  ok(/\.chartwrap\s*\{[^}]*min-width:\s*0/.test(SRC.css), 'C5a and so can the chart container');

  /* C6 AUTO FIT NEVER PRODUCES A VERTICAL SCROLLBAR, as a rule and not as an outcome. */
  ok(/\.chartwrap\[data-mode="auto"\][^{]*\{[^}]*overflow-y:\s*hidden/.test(SRC.css),
    'C6 Auto Fit declares no vertical overflow at all');
  var smallest = pageAt(1024, 768);
  eq(q(smallest, '.chartwrap')[0].getAttribute('data-overflow'), 'none',
    'C7 and on the smallest desktop target it needs none');
}());

// ===================================================================================================
console.log('\n=== SECTION D  THE COORDINATE IS NOT THE PIXEL ===');
// ===================================================================================================
(function () {
  /* THE ONE THING NO VIEWPORT MAY CHANGE. `data-cy` is pixels and is SUPPOSED to move — that is
     what responsive means. `data-frac` is where the price sits in its own domain, and it has to
     be the same number on a phone-sized card and on a projector. */
  var fracs = null, mismatched = [], pixelSets = {};
  VIEWPORTS.forEach(function (v) {
    var p = pageAt(v[0], v[1]);
    if (p.thrown) return;
    var f = q(p, '.col').map(function (c) {
      return c.getAttribute('data-label') + '=' + c.getAttribute('data-regular-frac');
    });
    /* BOTH AXES OF THE PIXEL POSITION. At seven products the vertical layout is often identical
       across two nearby screens — the preferred pitch fits both — so checking only `cy` would
       report "nothing responsive happened" on a page that had responded perfectly well in x. */
    var px = q(p, '.mk-anchor').map(function (a) {
      return a.getAttribute('data-cx') + ',' + a.getAttribute('data-cy');
    }).join();
    if (fracs === null) fracs = f;
    else if (JSON.stringify(f) !== JSON.stringify(fracs)) mismatched.push(v.join('x'));
    pixelSets[px] = 1;
  });
  eq(mismatched, [], 'D1 every price keeps the same fraction of its domain at every viewport');
  ok(fracs && fracs.length > 0, 'D2 and there were prices to check', fracs && fracs.length);
  ok(Object.keys(pixelSets).length >= VIEWPORTS.length - 1,
    'D3 while the PIXELS did move — otherwise nothing responsive happened at all',
    Object.keys(pixelSets).length);

  /* D3a AND THE VERTICAL LAYOUT RESPONDS TOO, which needs a window short enough to force it: the
     preferred pitch fits comfortably at every target viewport, so the height only gives way when
     there is genuinely less room. */
  var tall = pageAt(1280, 1080), short = pageAt(1280, 600);
  ok(Number(chartOf(tall).getAttribute('data-plot-h'))
    > Number(chartOf(short).getAttribute('data-plot-h')),
    'D3a a shorter window produces a shorter plot',
    [chartOf(tall).getAttribute('data-plot-h'), chartOf(short).getAttribute('data-plot-h')]);
  eq(q(short, '.col').map(function (c) { return c.getAttribute('data-regular-frac'); }),
    q(tall, '.col').map(function (c) { return c.getAttribute('data-regular-frac'); }),
    'D3b and the fractions are identical across that too');

  // D4 THE DOMAIN ITSELF IS UNTOUCHED BY THE WINDOW. This is P1-B2B's rule, under a new engine.
  var domains = VIEWPORTS.map(function (v) {
    var p = pageAt(v[0], v[1]);
    var c = chartOf(p);
    return c ? (c.getAttribute('data-domain-lo-c') + '..' + c.getAttribute('data-domain-hi-c')) : '?';
  });
  eq(domains.filter(function (d) { return d !== domains[0]; }), [],
    'D4 the canonical domain is identical at every viewport');

  /* D5 AND SO IS THE SET OF PRODUCTS. A layout that dropped a product to make things fit would
     satisfy every size assertion in this file. */
  var counts = VIEWPORTS.map(function (v) { return q(pageAt(v[0], v[1]), '.col').length; });
  eq(counts.filter(function (c) { return c !== counts[0]; }), [],
    'D5 and so is the number of products drawn');
}());

// ===================================================================================================
console.log('\n=== SECTION E  DENSITY, FROM ONE PRODUCT TO FORTY-FOUR ===');
// ===================================================================================================
(function () {
  function densityAt(n, w, h) {
    var r = L.deriveResponsiveChartLayout({ containerWidth: w, availableHeight: h,
      productCount: n, domainLowC: 900, domainHighC: 10050, mode: 'auto' });
    return r;
  }
  var wide = 1620, room = 700;
  eq([densityAt(1, wide, room).density, densityAt(7, wide, room).density,
    densityAt(12, wide, room).density, densityAt(24, wide, room).density,
    densityAt(44, wide, room).density],
    ['spacious', 'spacious', 'spacious', 'normal', 'overview'],
    'E1 1/7/12 spacious, 24 normal, 44 overview');

  /* E2 EVERY PRODUCT SURVIVES EVERY PROFILE. The overview density is allowed to make the pictures
     small; it is not allowed to lose a product, merge two, or drop a price. */
  var lost = [];
  [1, 7, 12, 24, 44].forEach(function (n) {
    var r = densityAt(n, wide, room);
    if (r.colW * n > r.viewBoxW - L.PAD_L - L.PAD_R + 1) lost.push(n + ': columns overflow box');
  });
  eq(lost, [], 'E2 the box is always wide enough for every column the chart has');

  var s44 = stressPage(1920, 1080);
  ok(!s44.thrown, 'E3 the 44-product fixture loads', s44.thrown && s44.thrown.message);
  eq(q(s44, '.col').length, 44, 'E4 forty-four products, all of them');
  eq(q(s44, '.mk-anchor').length, 44, 'E5 and forty-four price points, none dropped');
  eq(chartOf(s44).getAttribute('data-density'), 'overview', 'E6 at the overview density');
  var prices44 = q(s44, '.mk-anchor').map(function (a) { return a.getAttribute('data-price-c'); });
  eq(prices44.filter(function (v) { return !v || v === 'null'; }), [],
    'E7 every one of them carrying its own price');
  /* E8 AND THE CARD SAYS SO, because a reader whose pictures just got small deserves to be told
     why and what to press. */
  var note = id(s44, 'densityNote');
  ok(!!note && /Compact overview/.test(note.textContent),
    'E8 the card says it is a compact overview', note && note.textContent);
  ok(!!note && /Comfortable/.test(note.textContent),
    'E9 and names the mode that gives the large images back');

  /* E10 COMFORTABLE REALLY DOES GIVE THEM BACK, and takes the scrolling that comes with it. */
  comfortable(s44);
  var cc = chartOf(s44);
  eq(cc.getAttribute('data-density'), 'spacious', 'E10 Comfortable restores the 50px images');
  eq(num(cc, 'data-image-size'), 50, 'E11 at the size the review asked for');
  eq(q(s44, '.chartwrap')[0].getAttribute('data-overflow'), 'container-both',
    'E12 and the container carries the overflow, not the page');
  eq(q(s44, '.col').length, 44, 'E13 with all forty-four still on it');

  /* E14 THE SCALE STAYS READABLE WHILE THE PLOT SCROLLS. Scrolling the tick numbers off the
     screen leaves a grid of markers nobody can read a price from. */
  var wrap = q(s44, '.chartwrap')[0];
  eq(wrap.getAttribute('data-sticky-axis'), 'true', 'E14 the axis is pinned when it has to be');
  wrap.scrollLeft = 420;
  wrap.dispatchEvent(new s44.dom.Event('scroll', {}));
  eq(q(s44, '.axis-scale')[0].getAttribute('data-pinned-x'), '420',
    'E15 and follows the reader by exactly the distance they scrolled');
  eq(q(s44, '.axis-scale')[0].getAttribute('transform'), 'translate(420,0)',
    'E16 as a translate in X, so no price moved');
}());

// ===================================================================================================
console.log('\n=== SECTION F  THE OBSERVER WATCHES THE CONTAINER ===');
// ===================================================================================================
(function () {
  var p = pageAt(1920, 1080);
  if (p.thrown) { ok(false, 'F0 boot', String(p.thrown)); return; }

  // F1 IT IS A ResizeObserver, ON A NODE THE RENDERER NEVER REPLACES.
  var obs = p.dom.window.__observers;
  ok(obs.length >= 1, 'F1 something is being observed', obs.length);
  eq(obs[0].target.id, 'view',
    'F2 and it is #view — a container, not the window, and not a node a redraw throws away');
  ok(SRC.prototype.indexOf('new ResizeObserver') >= 0,
    'F3 through a real ResizeObserver rather than a window resize listener');
  ok(SRC.prototype.indexOf("window.addEventListener('resize', onContainerResize)") >= 0,
    'F4 with a window listener kept only as the fallback for环境 without one'.replace('环境', 'an environment'));

  // F5 A RESIZE RE-LAYS-OUT.
  var before = chartOf(p).getAttribute('data-vb-w');
  p.dom.window.__viewport(1280, 720);
  var after = chartOf(p).getAttribute('data-vb-w');
  ok(before !== after, 'F5 a container resize produces a new layout', [before, after]);

  // F6 AND THE WORK IS DEFERRED TO A FRAME, so a drag is one redraw and not forty.
  ok(SRC.prototype.indexOf('requestAnimationFrame(run)') >= 0,
    'F6 the callback schedules rather than redraws');

  /* F7 THE SAME SIZE TWICE IS NOT A RESIZE. This is the guard that stops an observer becoming a
     loop: without it, a redraw that happens to nudge the container by a sub-pixel feeds itself. */
  var w1 = chartOf(p).getAttribute('data-vb-w');
  var calls1 = p.dom.window.__observers.length;
  p.dom.window.__viewport(1280, 720);
  p.dom.window.__viewport(1280, 720);
  p.dom.window.__viewport(1280, 720);
  eq(chartOf(p).getAttribute('data-vb-w'), w1, 'F7 re-reporting the same size changes nothing');
  eq(p.dom.window.__observers.length, calls1,
    'F8 and the page did not register a second observer while redrawing');
  /* F9 THE FRAME QUEUE DRAINS. A layout that scheduled another layout would never empty it. */
  ok(p.dom.window.__flush() < 3, 'F9 the redraw queue settles instead of feeding itself');

  /* F10 A RESIZE COSTS THE READER NOTHING. Not the scenario, not the filters, not the layers, not
     the mode, not the place they were reading. */
  var p2 = pageAt(1920, 1080);
  openLayers(p2);
  id(p2, 'layer-msrp').checked = false;
  id(p2, 'layer-msrp').dispatchEvent(new p2.dom.Event('change', { bubbles: true }));
  id(p2, 'meetingToggle').click();
  var sel = id(p2, 'scSeries');
  sel.value = 'Spatula';
  sel.dispatchEvent(new p2.dom.Event('change', { bubbles: true }));
  var v = id(p2, 'scValue');
  v.value = '25.00';
  v.dispatchEvent(new p2.dom.Event('change', { bubbles: true }));
  id(p2, 'scApply').click();
  var badgeBefore = id(p2, 'scenarioBadge').textContent;
  var countryBefore = id(p2, 'fCountry').value;
  /* P1-B4 — the SELECTED category is named on the trigger now, not on a pressed chip. Same claim:
     the choice a person made survives a resize. */
  var catBefore = q(p2, '#catMore')[0].textContent;
  p2.dom.window.__place(0, 700);
  p2.dom.window.__viewport(1280, 720);
  eq(id(p2, 'scenarioBadge').textContent, badgeBefore, 'F10 a resize keeps the scenario');
  eq(id(p2, 'fCountry').value, countryBefore, 'F11 and the filters');
  eq(q(p2, '#catMore')[0].textContent, catBefore, 'F12 and the category');
  eq(q(p2, '.cap-msrp').length, 0, 'F13 and the layers that were switched off');
  eq(chartOf(p2).getAttribute('data-mode'), 'auto', 'F14 and the mode');
  eq([p2.dom.window.scrollX, p2.dom.window.scrollY], [0, 700],
    'F15 and does not move the page under the reader');

  /* F16 AND IT DID NOT REBUILD THE CONTROLS TO DO IT. Only the drawing changed. */
  var p3 = pageAt(1920, 1080);
  var panelBefore = id(p3, 'scopeSite');
  var viewBefore = id(p3, 'view');
  p3.dom.window.__viewport(1440, 900);
  eq(id(p3, 'scopeSite') === panelBefore, true, 'F16 a resize rebuilds no filter control');
  eq(id(p3, 'view') === viewBefore, true, 'F17 and #view itself is never replaced');
}());

// ===================================================================================================
console.log('\n=== SECTION G  THE MODES ===');
// ===================================================================================================
(function () {
  var p = pageAt(1440, 900);
  if (p.thrown) { ok(false, 'G0 boot', String(p.thrown)); return; }

  eq(id(p, 'mode-auto').getAttribute('aria-pressed'), 'true', 'G1 Auto Fit is pressed by default');
  eq(id(p, 'zoom-1-5'), null, 'G2 and offers no contradicting manual size');

  comfortable(p);
  eq(chartOf(p).getAttribute('data-mode'), 'comfortable', 'G3 Comfortable is a mode of its own');
  eq(num(chartOf(p), 'data-image-size'), 50, 'G4 with the full-size images');
  eq(num(chartOf(p), 'data-tick-px'), 48, 'G5 and the preferred gridline pitch');
  ok(!!id(p, 'zoom-1-5'), 'G6 and the manual sizes appear with it');

  // G7 FULLSCREEN KEEPS EVERYTHING AND GIVES BACK THE PLACE IT TOOK.
  var p2 = pageAt(1440, 900);
  openLayers(p2);
  id(p2, 'layer-promo').checked = false;
  id(p2, 'layer-promo').dispatchEvent(new p2.dom.Event('change', { bubbles: true }));
  comfortable(p2);
  p2.dom.window.__place(0, 1200);
  id(p2, 'mode-fullscreen').click();
  ok(p2.dom.document.body.className.indexOf('is-fullscreen') >= 0, 'G7 fullscreen turns on');
  eq(chartOf(p2).getAttribute('data-mode'), 'fullscreen', 'G8 and the chart is laid out for it');
  ok(num(chartOf(p2), 'data-measured-h') > 700,
    'G9 with the whole window to spend', num(chartOf(p2), 'data-measured-h'));
  eq(q(p2, '.mk-deal').length, 0, 'G10 the layer that was off is still off');
  eq(id(p2, 'mode-comfortable').getAttribute('aria-pressed'), 'false',
    'G11 and fullscreen composes with the mode rather than replacing it');

  p2.dom.document.dispatchEvent(new p2.dom.Event('keydown', { key: 'Escape' }));
  ok(p2.dom.document.body.className.indexOf('is-fullscreen') < 0, 'G12 Escape leaves it');
  eq(p2.dom.window.scrollY, 1200, 'G13 and puts the reader back where they were');
  eq(chartOf(p2).getAttribute('data-mode'), 'comfortable', 'G14 in the mode they left from');
  eq(q(p2, '.mk-deal').length, 0, 'G15 with their layers intact');

  // G16 AND THE BUTTON DOES THE SAME THING AS THE KEY.
  var p3 = pageAt(1440, 900);
  p3.dom.window.__place(0, 800);
  id(p3, 'mode-fullscreen').click();
  id(p3, 'mode-fullscreen').click();
  ok(p3.dom.document.body.className.indexOf('is-fullscreen') < 0, 'G16 Exit fullscreen leaves it');
  eq(p3.dom.window.scrollY, 800, 'G17 and restores the scroll position too');

  /* G18 IT IS AN OVERLAY, NOT THE BROWSER'S FULLSCREEN API, and the reason is written down: that
     API needs a trusted gesture, is refused in a headless render and in print, and takes Escape
     away from the page. */
  /* READ THE CODE, NOT THE PROSE. This file's comments explain at length WHY it does not use
     `requestFullscreen`, so a plain string search finds the explanation and calls it a defect. */
  eq(H.bare(SRC.prototype).indexOf('requestFullscreen'), -1,
    'G18 the page never calls requestFullscreen — only explains why not');
  /* P1-B8A — `[^{]*` between the state class and the target absorbs the `.psb-page` scope the
     stylesheet gained. The state class and the declaration are what these assert. */
  ok(/body\.is-fullscreen[^{]*\.view\s*\{[^}]*position:\s*fixed/.test(SRC.css),
    'G19 it is a fixed overlay in the stylesheet');
  ok(/@media print[\s\S]*body\.is-fullscreen[^{]*\.view\s*\{[^}]*position:\s*static/.test(SRC.css),
    'G20 and print has its own layout, so a meeting overlay never reaches paper');

  /* G21 IN FULLSCREEN THERE IS ONE THING ON THE PAGE. A screenshot found the KPI strip wedged
     half-visible behind the chart card: it was not hidden, so it was still in the flow and the
     fixed overlay simply covered most of it. A half-visible summary is worse than no summary. */
  ok(/body\.is-fullscreen[^{]*\.kpis[^{]*\{[^}]*display:\s*none/.test(SRC.css),
    'G21 the KPI strip is hidden rather than covered');
  ok(/@media print[\s\S]*body\.is-fullscreen[^{]*\.view > \.kpis\s*\{[^}]*display:\s*grid/
    .test(SRC.css), 'G22 and comes back on paper, where there is no overlay');
}());

// ===================================================================================================
console.log('\n=== SECTION H  THE CONTROL BAR ===');
// ===================================================================================================
(function () {
  var p = pageAt(1024, 768);
  if (p.thrown) { ok(false, 'H0 boot', String(p.thrown)); return; }

  /* H1 THE SIX SWITCHES ARE FOLDED AWAY AND THEIR STATE IS NOT. Hiding a control is a density
     decision; hiding which of them are on would be hiding the state. */
  eq(id(p, 'layersToggle').getAttribute('aria-expanded'), 'false', 'H1 Layers starts folded');
  eq(id(p, 'layer-msrp'), null, 'H2 with its switches out of the bar');
  eq(id(p, 'layersCount').textContent, '6/6', 'H3 while the count stays on its face');
  openLayers(p);
  eq(id(p, 'layersToggle').getAttribute('aria-expanded'), 'true', 'H4 one press opens it');
  eq(q(p, '#layersPanel .chk').length, 6, 'H5 with all six inside');
  id(p, 'layer-msrp').checked = false;
  id(p, 'layer-msrp').dispatchEvent(new p.dom.Event('change', { bubbles: true }));
  eq(id(p, 'layersCount').textContent, '5/6', 'H6 and the count follows the switches');

  // H7 ACCESSIBILITY: it is a button, it says what it controls, and it can be closed.
  eq(id(p, 'layersToggle').localName, 'button', 'H7 the disclosure is a button');
  eq(id(p, 'layersToggle').getAttribute('aria-controls'), 'layersPanel',
    'H8 pointing at the panel it owns');
  eq(id(p, 'layersPanel').getAttribute('role'), 'group', 'H9 which is a labelled group');
  ok(!!id(p, 'layersPanel').getAttribute('aria-label'), 'H10 with a name');
  id(p, 'layersClose').click();
  eq(id(p, 'layersToggle').getAttribute('aria-expanded'), 'false', 'H11 and it closes');

  /* H12 THE BAR WRAPS RATHER THAN OVERFLOWS. At 1024 the groups go onto two lines; what they must
     not do is push the card wider than the page. */
  ok(/\.chartctl\s*\{[^}]*flex-wrap:\s*wrap/.test(SRC.css), 'H12 the control bar wraps');
  ok(/\.ctl-group\s*\{[^}]*flex-wrap:\s*wrap/.test(SRC.css), 'H13 and so does each group');

  /* H14 THE POPOVER DOES NOT PUSH THE CHART DOWN. An absolutely positioned panel is the whole
     reason to use one: opening it must not move the thing you opened it to look at. */
  ok(/\.ctl-pop\s*\{[^}]*position:\s*absolute/.test(SRC.css),
    'H14 the layers panel floats over the page rather than displacing it');
  var p2 = pageAt(1024, 768);
  var h0 = chartOf(p2).getAttribute('data-vb-h');
  openLayers(p2);
  eq(chartOf(p2).getAttribute('data-vb-h'), h0, 'H15 and the chart is the same size with it open');

  // H16 RESET VIEW RESTORES THE WHOLE VIEW, mode included.
  var p3 = pageAt(1440, 900);
  comfortable(p3);
  openLayers(p3);
  id(p3, 'layer-floor').checked = false;
  id(p3, 'layer-floor').dispatchEvent(new p3.dom.Event('change', { bubbles: true }));
  id(p3, 'zoom-reset').click();
  eq(id(p3, 'mode-auto').getAttribute('aria-pressed'), 'true', 'H16 Reset returns to Auto Fit');
  ok(q(p3, '.cap-floor').length > 0, 'H17 and brings the layers back');
  eq(id(p3, 'layersToggle').getAttribute('aria-expanded'), 'false', 'H18 and folds the panel');
}());

// ===================================================================================================
console.log('\n=== SECTION I  THE INSIGHT PILLS ===');
// ===================================================================================================
(function () {
  var p = pageAt(1440, 900);
  if (p.thrown) { ok(false, 'I0 boot', String(p.thrown)); return; }

  var pills = q(p, '.kpill');
  ok(pills.length >= 2, 'I1 the drawer summarises with pills', pills.length);

  /* I2 THE LABEL IS A WORD AND THE COUNT IS A NUMBER, in two layers. The old version printed
     "3 OPPORTUNITY" inside one saturated rectangle, which is a shout, not a summary. */
  var noLayers = pills.filter(function (n) {
    return !n.querySelectorAll('.kpill-label').length || !n.querySelectorAll('.kpill-count').length;
  });
  eq(noLayers.length, 0, 'I2 each is a label and a count, not one run-together string');
  var labels = pills.map(function (n) { return n.querySelectorAll('.kpill-label')[0].textContent; });
  eq(labels.filter(function (t) { return t !== t.replace(/[A-Z]{4,}/, ''); }), [],
    'I3 and the label is a word, not an enum shouted in capitals', labels);
  var counts = pills.map(function (n) { return n.querySelectorAll('.kpill-count')[0].textContent; });
  eq(counts.filter(function (t) { return !/^\d+$/.test(t); }), [],
    'I4 while the count is just the number');
  eq(pills.map(function (n) { return n.getAttribute('data-count'); }), counts,
    'I5 published as data as well as painted');

  /* I6 THEY ARE NOT BUTTONS. Nothing filters by clicking one this round, and a control that looks
     pressable and does nothing costs a reader more than a plain label ever saves them. */
  eq(pills.filter(function (n) { return n.localName === 'button'; }), [],
    'I6 they are status elements, not buttons that do nothing');
  eq(q(p, '#insightPills')[0].getAttribute('role'), 'list', 'I7 announced as a list');
  eq(pills.filter(function (n) { return n.getAttribute('role') !== 'listitem'; }), [],
    'I8 of list items');

  /* I9 SPACING, WRAPPING AND SHAPE COME FROM TOKENS, NOT FROM FOUR ADJACENT COLOUR BLOCKS. */
  ok(/\.dsum\s*\{[^}]*gap:\s*var\(--space-xs\)/.test(SRC.css),
    'I9 a token gap between them, so they are not flush');
  ok(/\.dsum\s*\{[^}]*flex-wrap:\s*wrap/.test(SRC.css),
    'I10 and they wrap onto a second line rather than squeezing');
  ok(/\.drawer-toggle\s*\{[^}]*flex-wrap:\s*wrap/.test(SRC.css),
    'I11 in a header that can be two rows');
  ok(/\.kpill\s*\{[^}]*border-radius:\s*999px/.test(SRC.css), 'I12 the pill is a capsule');
  ok(/\.kpill-count\s*\{[^}]*border-radius:\s*999px/.test(SRC.css),
    'I13 and so is the count inside it, like the Operation System tab-rail count');

  /* I14 DARK TEXT ON A LIGHT TINT, NEVER THE REVERSE. A saturated block under black type is both
     hard to read and, on paper, a quarter of a page of ink. */
  var kinds = ['opp', 'watch', 'risk', 'dq'];
  var wrongWay = kinds.filter(function (k) {
    var m = new RegExp('\\.kpill-' + k + '\\s*\\{([^}]*)\\}').exec(SRC.css);
    if (!m) return true;
    var body = m[1];
    return !/color:/.test(body) || !/background:/.test(body) || !/border-color:/.test(body);
  });
  eq(wrongWay, [], 'I14 every pill declares a foreground, a background and a border');
  var semantic = /\.kpill-opp\s*\{[^}]*background:\s*#ecfdf5/.test(SRC.css)
    && /\.kpill-watch\s*\{[^}]*background:\s*#fffbeb/.test(SRC.css)
    && /\.kpill-risk\s*\{[^}]*background:\s*#fef2f2/.test(SRC.css);
  ok(semantic, 'I15 with green, amber and red keeping their meanings');
  ok(/@media print[\s\S]*\.kpill\s*\{[^}]*background:\s*#fff\s*!important/.test(SRC.css),
    'I16 and print drops the tint rather than spending the ink');

  // I17 COLLAPSED SHOWS THE TITLE AND THE PILLS; OPEN ADDS THE FINDINGS.
  eq(id(p, 'drawerBody').hidden, true, 'I17 the drawer starts collapsed');
  ok(q(p, '.kpill').length > 0, 'I18 with the pills OUTSIDE the collapse, still visible');
  /* The cards are built and hidden rather than absent, which is what `hidden` is for — so what is
     checked is that they are inside the collapsed region, not that they do not exist. */
  eq(q(p, '#drawerBody .finding').length, q(p, '.finding').length,
    'I19 and every finding card is inside the part that is collapsed');
  id(p, 'drawerToggle').click();
  eq(id(p, 'drawerBody').hidden, false, 'I20 one press opens it');
  ok(q(p, '.finding').length > 0, 'I21 and the cards appear');

  /* I22 THE OLD HALF-STYLED CLASS IS GONE FROM THE SUMMARY. `.cls-RISK` sets a background and
     nothing else; every other part of that pill lived in a `.fgroup-h .cls` descendant rule, so
     the same class rendered a pill in one place and a bare colour block in the other. */
  eq(q(p, '.dsum .cls').length, 0,
    'I22 the summary no longer borrows the half-styled finding-group class');
}());

// ===================================================================================================
console.log('\n=== SECTION J  THE REUSABLE CONTRACT, PUBLISHED BEFORE ANYTHING ADOPTS IT ===');
// ===================================================================================================
(function () {
  var C = L.CONTRACT;
  ok(!!C && C.id === 'KM_RESPONSIVE_CHART_LAYOUT_V1', 'J1 the contract is published as data');
  eq(C.container_driven, true, 'J2 container-driven');
  eq(C.reads_window_width_directly, false, 'J3 not a table of window-width breakpoints');
  eq(C.coordinates_are_separate_from_pixels, true, 'J4 coordinates separate from pixels');
  eq(C.layer_visibility_changes_layout, false, 'J5 layer visibility changes no layout');
  eq(C.state_survives_resize, true, 'J6 state survives a resize');
  eq(C.print_uses_its_own_layout, true, 'J7 print has its own layout');
  ok(/prototype only/.test(C.applies_to),
    'J8 and it says out loud that nothing else has adopted it yet', C.applies_to);

  /* J9 NOTHING OUTSIDE THE PROTOTYPE WAS TOUCHED. The brief asks for a pilot, not a site-wide
     change, and this is the assertion that keeps the pilot a pilot. */
  var fs = require('fs'), path = require('path');
  var shell = path.join(H.ROOT, 'assets', 'js');
  ok(fs.existsSync(shell), 'J9 the production shell is where it was');
  eq(SRC.layout.indexOf('assets/'), -1, 'J10 and the engine reaches into none of it');
}());

// ===================================================================================================
console.log('\n=== SECTION K  WHAT ONLY A SCREENSHOT COULD SEE ===');
// ===================================================================================================
/*
 * Two defects got past every assertion in this file and were found by rendering the page in a real
 * browser and looking at it. Both are here now, as the nearest assertion that would have caught
 * them. This is the third round in a row that this section has been needed, which is itself the
 * finding: the things that survive a green suite are the things INSIDE the elements the suite is
 * checking, not the elements themselves.
 *
 *   1. THE FALLBACK CODE DID NOT SHRINK WITH ITS PLATE. `shortCode` returned up to seven
 *      characters whatever size the marker was, so at the overview density a six-character sku
 *      was painted across a 24px plate — about 38px of type in 24px of room — and forty-four of
 *      them ran into each other in a smear along the ladder. Every assertion was green: the
 *      plates were the right size, centred on the right prices, inside the plot and clear of the
 *      lane. Nothing measured the TEXT INSIDE one.
 *   2. THE GAP LABEL FELL BACK TO A NAKED NUMBER. When neither "USD 10 Price gap" nor "USD 10
 *      gap" fitted the gutter, the label printed "10" — which beside a line on a price chart is
 *      exactly the ambiguity this project spent a round removing from the word "open".
 */
(function () {
  if (PG.thrown) return;

  /* K1 NO TEXT IS WIDER THAN THE MARKER IT IS WRITTEN ON, at any density. */
  var overflowed = [];
  [[1920, 1080], [1280, 720], [768, 1024]].forEach(function (v) {
    var pg = stressPage(v[0], v[1]);
    if (pg.thrown) { overflowed.push(v.join('x') + ': threw'); return; }
    var size = num(chartOf(pg), 'data-image-size');
    q(pg, '.mk-fallback-text').forEach(function (t) {
      var chars = String(t.getAttribute('data-shown') || t.textContent.split('No product')[0]);
      var fontPx = num(t, 'font-size') || 10.5;
      if (chars.length * fontPx * 0.62 > size - 2) {
        overflowed.push(v.join('x') + ' "' + chars + '" @' + fontPx + 'px in ' + size + 'px');
      }
    });
  });
  eq(overflowed, [], 'K1 no marker code is wider than the plate it is painted on');

  /* K2 AND BELOW FOUR CHARACTERS THERE IS NONE AT ALL. A two-letter stump is not an identifier,
     it is noise on top of the one thing the marker is for. */
  var tiny = stressPage(1280, 720);
  eq(num(chartOf(tiny), 'data-image-size'), 24, 'K2 the overview marker is 24px');
  eq(q(tiny, '.mk-fallback-text').length, 0, 'K3 and carries no code at all at that size');
  /* K4 THE NAME IS STILL REACHABLE — on the plate's own title, on the column, and in the lane. */
  var plate = q(tiny, '.mk-img-plate')[0];
  ok(plate.querySelectorAll('title').length === 1,
    'K4 the plate says what it is instead');
  ok(/ST\d+/.test(plate.querySelectorAll('title')[0].textContent),
    'K5 naming the product', plate.querySelectorAll('title')[0].textContent);
  ok(/photograph/.test(plate.querySelectorAll('title')[0].textContent),
    'K6 and why there is no picture');
  var cols = q(tiny, '.col');
  ok(String(cols[0].getAttribute('aria-label')).indexOf('ST') === 0,
    'K7 while the column still announces it to a screen reader');

  /* K8 AND AT THE SPACIOUS SIZE THE CODE IS BACK, because there is room for it. */
  var big = stressPage(1920, 1080);
  comfortable(big);
  eq(num(chartOf(big), 'data-image-size'), 50, 'K8 Comfortable is back to 50px');
  ok(q(big, '.mk-fallback-text').length > 0, 'K9 and the codes come back with the room');
  var f0 = q(big, '.mk-fallback-text')[0];
  ok(String(f0.textContent).split('No product')[0].length >= 4,
    'K10 with enough characters to identify something');

  /* K11 THE GAP LABEL NEVER DEGRADES TO A BARE NUMBER. Three forms, and the shortest still names
     the currency; if even that will not fit, there is no label and the line carries it. */
  var forms = {};
  [[1920, 1080], [1440, 900], [1280, 720], [1024, 768], [768, 1024]].forEach(function (v) {
    var pg = pageAt(v[0], v[1]);
    if (pg.thrown) return;
    q(pg, '.gaplabel').forEach(function (l) {
      forms[String(l.getAttribute('data-shown'))] = v.join('x');
    });
  });
  var bare = Object.keys(forms).filter(function (t) { return /^[\d.,]+$/.test(t); });
  eq(bare, [], 'K11 no gap label is ever just a number', forms);
  var named = Object.keys(forms).filter(function (t) {
    return t !== '' && !/^[A-Z]{3} /.test(t);
  });
  eq(named, [], 'K12 every gap label that is printed names its currency first', forms);
  ok(Object.keys(forms).length >= 2,
    'K13 and more than one form was actually used across the five screens',
    Object.keys(forms));
}());

// ===================================================================================================
console.log('\n=== MUTANTS ===');
// ===================================================================================================

mut('M1 Auto Fit goes back to a fixed 48px per tick, whatever room there is', function () {
  /* THE DEFECT THIS ROUND EXISTS TO REMOVE — observed on a window short enough for it to matter.
     At 1280x720 the preferred pitch happens to fit, so a mutant watched there would agree with
     the clean page and be reported as caught for the wrong reason. 1280x600 is the shape of
     window where a fixed floor stops being a preference and starts being an overflow. */
  var m = withLayout(swap('        var pitch = budget / spans;',
    '        var pitch = L.PREFERRED_PITCH;'));
  function fitsAt(pg) {
    if (pg.thrown) return 'THREW: ' + pg.thrown.message;
    pg.dom.window.__viewport(1280, 600);
    toChart(pg);
    pg.dom.window.__viewport(1280, 600);
    var c = pg.dom.document.querySelectorAll('.chart')[0];
    return Number(c.getAttribute('data-vb-h'))
      <= Number(c.getAttribute('data-measured-h')) ? 'FITS' : 'OVERFLOWS';
  }
  return fitsAt(bootPage(null)) === 'FITS' && fitsAt(m) === 'OVERFLOWS';
});

mut('M2 the layout reads the window instead of the container', function () {
  /* A chart that sizes itself from `window.innerWidth` looks responsive and is not: it cannot see
     the sidebar collapse, a split view, or any container narrower than the window. */
  var m = withProto(swap('    var w = host ? Number(host.clientWidth || 0) : 0;',
    '    var w = (typeof window !== \'undefined\' && window) ? Number(window.innerWidth || 0) : 0;'));
  function widthAt(pg) {
    if (pg.thrown) return -1;
    pg.dom.window.__viewport(1920, 1080);
    toChart(pg);
    pg.dom.window.__viewport(1920, 1080);
    return Number(pg.dom.document.querySelectorAll('.chart')[0].getAttribute('data-measured-w'));
  }
  var clean = widthAt(bootPage(null)), dirty = widthAt(m);
  /* The container is narrower than the window by the sidebar and the card's own margins. A page
     that reports the window width has stopped measuring the thing the chart lives in. */
  return clean > 0 && dirty > clean + 200;
});

mut('M3 a resize clears the scenario', function () {
  var m = withProto(swap('      if (remeasure()) renderData();',
    '      if (remeasure()) { STATE.overrides = {}; renderData(); }'));
  function badgeAfterResize(pg) {
    if (pg.thrown) return 'THREW';
    pg.dom.window.__viewport(1920, 1080);
    toChart(pg);
    var doc = pg.dom.document;
    doc.getElementById('meetingToggle').click();
    var s2 = doc.getElementById('scSeries');
    s2.value = 'Spatula';
    s2.dispatchEvent(new pg.dom.Event('change', { bubbles: true }));
    var v = doc.getElementById('scValue');
    v.value = '25.00';
    v.dispatchEvent(new pg.dom.Event('change', { bubbles: true }));
    doc.getElementById('scApply').click();
    pg.dom.window.__viewport(1280, 720);
    return doc.getElementById('scenarioBadge').textContent;
  }
  var clean = badgeAfterResize(bootPage(null)), dirty = badgeAfterResize(m);
  return clean !== 'No scenario' && dirty === 'No scenario';
});

mut('M4 the forty-fourth product is cut off to make the chart fit', function () {
  var m = withProtoDev(swap('    var ns = panel.plotted;',
    '    var ns = panel.plotted.slice(0, 40);'));
  function drawn(pg) {
    if (pg.thrown) return -1;
    var p2 = pg;
    p2.dom.window.__viewport(1920, 1080);
    H.stressChart(p2, 'Electric Can Opener');
    return p2.dom.document.querySelectorAll('.col').length;
  }
  return drawn(bootPage(null, { devMode: true })) === 44 && drawn(m) === 40;
});

mut('M5 the label lane is folded back into the plot, so the axis loses its floor', function () {
  var m = withLayout(swap('    var laneTop = plotBottom + gutter;',
    '    var laneTop = plotBottom;'));
  function clearance(pg) {
    if (pg.thrown) return -1;
    toChart(pg);
    var c = pg.dom.document.querySelectorAll('.chart')[0];
    var half = Number(c.getAttribute('data-image-size')) / 2;
    return (Number(c.getAttribute('data-lane-top'))
      - Number(c.getAttribute('data-plot-bottom'))) - half;
  }
  return clearance(bootPage(null)) >= 0 && clearance(m) < 0;
});

mut('M6 Comfortable lets its overflow out onto the page', function () {
  var m = bootPage(function (kind, src) {
    if (kind !== 'prototype') return src;
    return src;
  });
  /* THIS ONE IS A STYLESHEET RULE, so it is checked against the stylesheet: `min-width: 0` on the
     panel is the whole reason an over-wide chart scrolls inside its card instead of pushing its
     ancestors, and it is the kind of line that gets tidied away by somebody who does not know
     what it is for. */
  var withIt = /\.panel\s*\{[^}]*min-width:\s*0/.test(SRC.css);
  var without = /\.panel\s*\{[^}]*min-width:\s*0/
    .test(SRC.css.replace(/(\.panel\s*\{)([^}]*)min-width:\s*0;?/, '$1$2'));
  return m.thrown === null && withIt && !without;
});

mut('M7 the observer redraws on every report, so a resize feeds itself', function () {
  var m = withProto(swap('      if (remeasure()) renderData();',
    '      remeasure(); renderData();'));
  function settles(pg) {
    if (pg.thrown) return 'THREW';
    pg.dom.window.__viewport(1440, 900);
    toChart(pg);
    /* Report the SAME size repeatedly. A guarded page does nothing; an unguarded one redraws
       every time, which is the shape a feedback loop takes before it becomes one. */
    var before = pg.dom.window.__renders || 0;
    var vb0 = pg.dom.document.querySelectorAll('.chart')[0];
    pg.dom.window.__viewport(1440, 900);
    var vb1 = pg.dom.document.querySelectorAll('.chart')[0];
    return vb0 === vb1 ? 'SETTLED' : 'REDREW';
  }
  return settles(bootPage(null)) === 'SETTLED' && settles(m) === 'REDREW';
});

mut('M8 the insight pills go back to four flush blocks of colour', function () {
  var m = withProto(swap("      var pill = el('span', 'kpill kpill-' + p[2]);",
    "      var pill = el('span', 'cls cls-' + p[1].toUpperCase().replace(/\\s/g, ''));"));
  function shape(pg) {
    if (pg.thrown) return 'THREW';
    toChart(pg);
    var pills = pg.dom.document.querySelectorAll('.kpill');
    var old = pg.dom.document.querySelectorAll('.dsum .cls');
    return pills.length + '/' + old.length;
  }
  var clean = shape(bootPage(null)), dirty = shape(m);
  return /^[1-9]\d*\/0$/.test(clean) && /^0\/[1-9]/.test(dirty);
});

mut('M9 leaving fullscreen loses the reader\u2019s place on the page', function () {
  var m = withProto(swap('        window.scrollTo(0, STATE.fsReturnScroll);',
    '        window.scrollTo(0, 0);'));
  function backAt(pg) {
    if (pg.thrown) return -1;
    pg.dom.window.__viewport(1440, 900);
    toChart(pg);
    pg.dom.window.__place(0, 900);
    pg.dom.document.getElementById('mode-fullscreen').click();
    pg.dom.document.dispatchEvent(new pg.dom.Event('keydown', { key: 'Escape' }));
    return pg.dom.window.scrollY;
  }
  return backAt(bootPage(null)) === 900 && backAt(m) === 0;
});

mut('M10 the density ladder stops stepping down, so a narrow card keeps the biggest images',
  function () {
    /* AIMED AT THE LADDER, AND OBSERVED ON THE MODULE.

       Two earlier attempts at this mutant were no-ops, and both for reasons worth recording. The
       first restricted the ladder walk and watched forty-four products: their count band already
       STARTS at the last profile, so there was nothing to step down to. The second broke the
       count band and watched the same chart: the ladder then did the band's work and arrived at
       the same answer, which is a defence being correct rather than a mutant being caught.

       Twelve products in a 660px card is the case where the two rules are distinguishable — the
       band says spacious and the ladder has to overrule it, because twelve 74px columns do not
       fit in 552px. And because the engine is a pure function, the whole thing is decided in two
       calls with no page, no fixture and no category to arrange. */
    var a = '    for (var di = startIndex; di < L.DENSITY_ORDER.length; di++) {';
    if (SRC.layout.split(a).length - 1 !== 1) throw new Error('mutant anchor in chart-layout.js');
    var mutated = new Function(
      SRC.layout.replace(a, '    for (var di = startIndex; di < startIndex + 1; di++) {')
      + '\nreturn PSB_CHART_LAYOUT;')();
    var input = { containerWidth: 660, availableHeight: 700, productCount: 12,
      domainLowC: 1199, domainHighC: 4299, mode: 'auto' };
    var clean = L.deriveResponsiveChartLayout(input);
    var dirty = mutated.deriveResponsiveChartLayout(input);
    return clean.density === 'compact' && clean.fitsWidth === true
      && dirty.density === 'spacious' && dirty.fitsWidth === false;
  });

mut('M11 a viewport change moves a price, not just its pixels', function () {
  var m = withProto(swap("        'data-regular-c': n._regular_c, 'data-regular-frac': frac(n._regular_c),",
    "        'data-regular-c': n._regular_c, 'data-regular-frac': y(n._regular_c),"));
  function fracsAcross(pg) {
    if (pg.thrown) return 'THREW';
    /* A PAIR OF WINDOWS THAT REALLY DO PRODUCE DIFFERENT PIXELS. Two screens where the preferred
       pitch fits both would give identical `y` values, and the mutant would pass by accident. */
    pg.dom.window.__viewport(1280, 1080);
    toChart(pg);
    pg.dom.window.__viewport(1280, 1080);
    var a = pg.dom.document.querySelectorAll('.col')
      .map(function (c) { return c.getAttribute('data-regular-frac'); }).join();
    pg.dom.window.__viewport(1280, 600);
    var b = pg.dom.document.querySelectorAll('.col')
      .map(function (c) { return c.getAttribute('data-regular-frac'); }).join();
    return a === b ? 'STABLE' : 'MOVED';
  }
  return fracsAcross(bootPage(null)) === 'STABLE' && fracsAcross(m) === 'MOVED';
});

mut('M12 the axis stops following the reader when the chart scrolls sideways', function () {
  var m = withProtoDev(swap("        gAxis.setAttribute('transform', 'translate(' + dx + ',0)');",
    "        gAxis.setAttribute('transform', 'translate(0,0)');"));
  function pinned(pg) {
    if (pg.thrown) return -1;
    pg.dom.window.__viewport(1280, 720);
    H.stressChart(pg, 'Electric Can Opener');
    pg.dom.document.getElementById('mode-comfortable').click();
    var w = pg.dom.document.querySelectorAll('.chartwrap')[0];
    w.scrollLeft = 300;
    w.dispatchEvent(new pg.dom.Event('scroll', {}));
    return pg.dom.document.querySelectorAll('.axis-scale')[0].getAttribute('transform');
  }
  return pinned(bootPage(null, { devMode: true })) === 'translate(300,0)'
    && pinned(m) === 'translate(0,0)';
});

mut('M13 the marker code stops shrinking with its plate, and forty-four of them smear',
  function () {
    // THE FIRST OF THE TWO DEFECTS A SCREENSHOT FOUND THIS ROUND.
    var m = withProtoDev(swap('      var codeChars = Math.floor((size - 6) / 5.6);',
      '      var codeChars = 7;'));
    function codeWidth(pg) {
      if (pg.thrown) return -1;
      pg.dom.window.__viewport(1280, 720);
      H.stressChart(pg, 'Electric Can Opener');
      pg.dom.window.__viewport(1280, 720);
      return pg.dom.document.querySelectorAll('.mk-fallback-text').length;
    }
    /* Clean: 24px plates carry no code at all. Mutant: forty-four six-character codes on 24px
       plates, which is what the smear was. */
    return codeWidth(bootPage(null)) === 0 && codeWidth(m) === 44;
  });

mut('M14 the gap label degrades to a naked number when the gutter is narrow', function () {
  var m = withProto(swap("          panel.currency + ' ' + plain(f.distance_c)];",
    "          plain(f.distance_c)];"));
  function shortestForm(pg) {
    if (pg.thrown) return 'THREW';
    pg.dom.window.__viewport(768, 1024);
    toChart(pg);
    pg.dom.window.__viewport(768, 1024);
    var l = pg.dom.document.querySelectorAll('.gaplabel')[0];
    return l ? String(l.getAttribute('data-shown')) : 'NONE';
  }
  var clean = shortestForm(bootPage(null)), dirty = shortestForm(m);
  return /^[A-Z]{3} /.test(clean) && /^[\d.]+$/.test(dirty);
});

// ===================================================================================================
var verdict = (fail === 0 && mutSurvived === 0) ? 'PASS' : 'FAIL';
console.log('\n' + verdict + ' — passed ' + pass + ', failed ' + fail
  + ', mutants caught ' + mutCaught + ', survived ' + mutSurvived);
process.exit(verdict === 'PASS' ? 0 : 1);
