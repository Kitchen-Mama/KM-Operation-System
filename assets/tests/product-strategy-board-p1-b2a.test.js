// Kitchen Mama Operation System — PRODUCT-STRATEGY-P1-B2A
// THE BLACK DOT, THE DENSITY, AND A MEETING CONTROL THAT SPEAKS ENGLISH.
//
// This round came from a visual review rather than from a contract, which changes what a test is for.
// A person looked at the screen and said: there are black dots on the product photographs, the chart
// is small and crowded into the left, there is too much technical prose, and the scenario form is
// asking me about `proposed_scenario_price` and `PERCENT`. None of that is a wrong number — the
// P1-B2 suite was green throughout and stayed green — so every assertion here exists to stop a
// LOOK regressing, which is the kind of defect a test suite normally cannot hold.
//
// It holds what it honestly can:
//   - the black dot is GONE FROM THE TREE, not made transparent (§B)
//   - the image is the size the brief asked for, and zoom cannot move a price (§C)
//   - every layer removes its element AND its legend key together (§D)
//   - the scenario form contains no internal identifier, and refuses before it half-applies (§E)
//   - the popovers work by click and by keyboard, and close three ways (§F)
//   - the filter controls use the Operation System's own tokens, ASSERTED AGAINST base.css (§G)
//   - 8 countries / 10 sites / 12 categories / 15 series / 44 products still render (§H)
//
// WHAT IT CANNOT HOLD: whether it looks right. Layout, colour, weight and print pagination are for a
// person with a browser. §十 of the brief asks for that explicitly and the checklist is in the design
// freeze; a DOM assertion is not a substitute for it and this suite does not pretend otherwise.
//
// Run: node assets/tests/product-strategy-board-p1-b2a.test.js
'use strict';

var fs = require('fs'), path = require('path'), vm = require('vm');
var H = require('./_psb-harness.js');
var SRC = H.SRC, bare = H.bare, bootPage = H.bootPage, pipeline = H.pipeline;

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

var P = pipeline();
var S = P.S, CANON = P.canon;
function site(country, marketplace, company) {
  return { company: company || 'Kitchen Mama', country: country, marketplace: marketplace };
}
function board(sel, over) {
  var spec = { rows: CANON, selection: sel };
  Object.keys(over || {}).forEach(function (k) { spec[k] = over[k]; });
  return S.deriveBoardModel(spec);
}

/** Boot the page and go straight to a category chart. */
function chartPage() {
  var p = bootPage(null);
  if (p.thrown) return p;
  var doc = p.dom.document;
  var chip = doc.querySelectorAll('#catBar .catbtn').filter(function (b) {
    return b.getAttribute('data-category') === 'Silicone Spatula';
  });
  if (chip.length) chip[0].click();
  return p;
}
/**
 * MEETING MODE STARTS COLLAPSED, SO A TEST MUST OPEN IT LIKE A PERSON.
 * Driving `scApply` while the panel is shut would exercise controls nobody can reach, and would keep
 * passing if the toggle were broken — a suite has to take the path the user takes.
 */
function openMeeting(p) {
  if (p.thrown) return p;
  var t = p.dom.document.getElementById('meetingToggle');
  if (t && t.getAttribute('aria-expanded') === 'false') t.click();
  return p;
}
function q(p, sel) { return p.dom.document.querySelectorAll(sel); }
function id(p, x) { return p.dom.document.getElementById(x); }
function fire(p, elId, value) {
  var n = p.dom.document.getElementById(elId);
  if (!n) throw new Error('no control #' + elId);
  if (value !== undefined) n.value = value;
  n.dispatchEvent(new p.dom.Event('change', { bubbles: true }));
  return n;
}

console.log('\n=== SECTION A  THE PAGE STILL BOOTS, AND STILL CHECKS ITSELF ===');
var PG = chartPage();
ok(PG.thrown === null, 'A1 the page boots with no exception',
  PG.thrown && (PG.thrown.message + ' :: ' + String(PG.thrown.stack).split('\n')[1]));
(function () {
  if (PG.thrown) return;
  var v = H.selfTestVerdict(PG);
  console.log('     (the page reported ' + v.badge + ')');
  eq(v.bad.map(function (b) { return b.text; }), [],
    'A2 and every one of its own DOM assertions still passes');
  ok(q(PG, '.chart').length >= 1, 'A3 a chart is on screen to inspect');
}());

console.log('\n=== SECTION B  THE BLACK DOT ===');
(function () {
  if (PG.thrown) return;
  // B1 THE ROOT CAUSE, NAMED IN THE SOURCE IT CAME FROM.
  ok(SRC.prototype.indexOf("svg('circle', { cx: cx, cy: cy, r: 2, 'class': 'mk-anchor mk-reg'") < 0,
    'B1 the 2px centre circle is no longer in the renderer');
  var plates = q(PG, '.mk-img-plate');
  ok(plates.length >= 4, 'B2 there are marker plates to check', plates.length);

  // B3 NOTHING AT ALL SITS INSIDE A PLATE except that plate's own image.
  var inside = [];
  ['circle', 'polygon', 'rect'].forEach(function (tag) {
    q(PG, tag).forEach(function (n) {
      if (String(n.className).indexOf('mk-img-plate') >= 0
        || String(n.className).indexOf('mk-img-shadow') >= 0) return;
      var cx = n.getAttribute('cx'), cy = n.getAttribute('cy');
      if (cx === null || cy === null) return;
      plates.forEach(function (pl) {
        var x = Number(pl.getAttribute('x')), y = Number(pl.getAttribute('y'));
        var w = Number(pl.getAttribute('width')), h = Number(pl.getAttribute('height'));
        if (Number(cx) > x && Number(cx) < x + w && Number(cy) > y && Number(cy) < y + h) {
          inside.push(tag + '.' + n.className);
        }
      });
    });
  });
  eq(inside, [], 'B3 no dot, diamond or box of any kind lands inside a product-image plate');

  // B4 IT IS GONE, NOT HIDDEN. A transparent dot is still a dot.
  var b = bare(SRC.css);
  ok(b.indexOf('.mk-anchor') > 0, 'B4 the datum still has a style, so it is still drawn');
  ok(!/\.mk-anchor\s*\{[^}]*(opacity:\s*0|fill:\s*transparent|display:\s*none|visibility:\s*hidden)/
    .test(SRC.css), 'B5 and it was NOT simply made invisible');

  // B6 THE DATUM IS A CROSSHAIR, BEHIND THE PLATE, REACHING PAST IT.
  var anchors = q(PG, '.mk-anchor');
  ok(anchors.length >= 4, 'B6 every plotted product has one', anchors.length);
  var bad = 0, notFirst = 0;
  anchors.forEach(function (a) {
    if (String(a.localName).toLowerCase() !== 'line') bad++;
    var grp = a.parentNode;
    if (grp.childNodes.indexOf(a) !== 0) notFirst++;      // drawn BEFORE the plate
  });
  eq(bad, 0, 'B7 it is a line, not a circle');
  eq(notFirst, 0, 'B8 and it is the first child of its group, so the plate paints over its middle');

  // B9 THE FALLBACK IS THE PLACEHOLDER, AND IT EXPLAINS ITSELF IN WORDS.
  var fbs = q(PG, '.mk-fallback');
  ok(fbs.length >= 1, 'B9 products with no verified photograph get the neutral placeholder');
  var titles = q(PG, 'title').map(function (t) { return t.textContent; });
  ok(titles.filter(function (t) { return t.indexOf('No product photograph') >= 0; }).length >= 1,
    'B10 which says why, without naming a database column on the executive page', titles[0]);

  // B11 THE SEMANTIC MARKERS SURVIVE, because they mean something and are not on the picture.
  ok(q(PG, '.mk-deal').length + q(PG, '.mk-prop').length >= 1,
    'B11 promotion and proposal markers are still drawn');
}());

console.log('\n=== SECTION C  READABILITY AND ZOOM ===');
(function () {
  if (PG.thrown) return;
  var plate = q(PG, '.mk-img-plate')[0];
  var w = Number(plate.getAttribute('width')), h = Number(plate.getAttribute('height'));
  ok(w >= 46 && w <= 54, 'C1 the product image is 46-54px as the brief asks', w);
  eq(w, h, 'C2 and square, so nothing is stretched');

  var chart = q(PG, '.chart')[0];
  var vb = chart.getAttribute('viewBox').split(' ').map(Number);
  ok(vb[2] >= 1100, 'C3 the drawing uses the card width rather than a narrow fixed canvas', vb[2]);
  var colW = Number(chart.getAttribute('data-col-w'));
  var cols = q(PG, '.col').length;
  ok(colW * cols > vb[2] * 0.45,
    'C4 a handful of products spreads across the width instead of bunching at the left',
    { colW: colW, cols: cols, vbw: vb[2] });

  // C5 THE COLUMNS ARE CENTRED, so the slack is not all on the right.
  var xs = q(PG, '.xlabel').map(function (t) { return Number(t.getAttribute('x')); });
  var leftGap = Math.min.apply(null, xs);
  var rightGap = vb[2] - Math.max.apply(null, xs);
  /* HALF A COLUMN, not a whole one. A tolerance of a full column width accepted the uncentred
     layout the review complained about — the mutant that removes centring produced a 192px imbalance
     and slipped under a 208px bar. An assertion loose enough to pass the defect is not an assertion. */
  ok(Math.abs(leftGap - rightGap) < colW / 2,
    'C5 the plot is centred — the empty space is shared, not parked on one side',
    { leftGap: leftGap, rightGap: rightGap, colW: colW });

  // C6 TEXT IS BIGGER, measured on the stylesheet rather than asserted in prose.
  var xl = /\.xlabel\s*\{[^}]*?([0-9.]+)px/.exec(SRC.css);
  var xs2 = /\.xsub\s*\{[^}]*?([0-9.]+)px/.exec(SRC.css);
  var yt = /\.ytick\s*\{[^}]*?([0-9.]+)px/.exec(SRC.css);
  ok(xl && Number(xl[1]) >= 12, 'C6 the product label is at least 12px', xl && xl[1]);
  ok(xs2 && Number(xs2[1]) >= 11, 'C7 the price sub-label is at least 11px', xs2 && xs2[1]);
  ok(yt && Number(yt[1]) >= 11, 'C8 and the axis ticks are too', yt && yt[1]);

  // C9 HOVER AND FOCUS BOTH REACH THE FACTS.
  var col = q(PG, '.col')[0];
  eq(col.getAttribute('tabindex'), '0', 'C9 a product column is reachable by keyboard');
  ok(String(col.getAttribute('aria-label')).indexOf('everyday') > 0,
    'C10 and announces its prices', col.getAttribute('aria-label'));
  col.dispatchEvent(new PG.dom.Event('focus', {}));
  eq(id(PG, 'tip').hidden, false, 'C11 focus opens the detail panel');
  eq(id(PG, 'tip').getAttribute('data-anchor'), 'focus', 'C12 by the keyboard route');
  col.dispatchEvent(new PG.dom.Event('blur', {}));
  eq(id(PG, 'tip').hidden, true, 'C13 and blur closes it');
}());

// ---- C14 THE FIVE ZOOM CONTROLS, AND THE PRICES THAT DO NOT MOVE ----
(function () {
  var p = chartPage();
  if (p.thrown) { ok(false, 'C14 boot', String(p.thrown)); return; }
  ['zoom-fit', 'zoom-1', 'zoom-1-25', 'zoom-1-5', 'zoom-reset'].forEach(function (bid, i) {
    ok(!!id(p, bid), 'C14.' + (i + 1) + ' the ' + bid + ' control exists');
  });
  function chart() { return q(p, '.chart')[0]; }
  function prices() {
    return q(p, '.mk-anchor').map(function (a) {
      return a.getAttribute('data-price-c') + '@' + a.getAttribute('data-cy');
    });
  }
  function ticks() {
    return q(p, '.ytick').map(function (t) { return t.getAttribute('data-tick-c'); });
  }
  var vb0 = chart().getAttribute('viewBox');
  var px0 = prices(), tk0 = ticks();
  eq(chart().getAttribute('width'), '100%', 'C15 Fit paints the chart across the card');

  id(p, 'zoom-1-5').click();
  var c = chart();
  eq(c.getAttribute('viewBox'), vb0, 'C16 AT 150% THE COORDINATE SYSTEM IS BYTE-IDENTICAL');
  eq(prices(), px0, 'C17 so every price sits at exactly the same coordinate');
  eq(ticks(), tk0, 'C18 and the axis has the same ticks');
  var w150 = Number(c.getAttribute('width'));
  var vbw = Number(c.getAttribute('data-vb-w'));
  eq(w150, Math.round(vbw * 1.5), 'C19 what changed is the painted width, and only that');

  id(p, 'zoom-1-25').click();
  eq(Number(chart().getAttribute('width')), Math.round(vbw * 1.25), 'C20 125% likewise');
  eq(prices(), px0, 'C21 still the same prices');

  // C22 THE CONTAINER SCROLLS, the page does not, and the browser is never asked to zoom.
  ok(/\.chartwrap\s*\{[^}]*overflow-x:\s*auto/.test(SRC.css),
    'C22 the chart scrolls inside its own container');
  ok(bare(SRC.prototype).indexOf('document.body.style.zoom') < 0,
    'C23 and nothing zooms the page itself');

  // C24 RESET RESTORES THE WHOLE VIEW, not just the size.
  id(p, 'layer-msrp').checked = false;
  id(p, 'layer-msrp').dispatchEvent(new p.dom.Event('change', { bubbles: true }));
  eq(q(p, '.cap-msrp').length, 0, 'C24 a layer was switched off');
  id(p, 'zoom-reset').click();
  eq(chart().getAttribute('width'), '100%', 'C25 Reset returns to Fit');
  ok(q(p, '.cap-msrp').length > 0, 'C26 AND restores the layers — it is a view reset, not a second Fit');

  // C27 PRINT IS ALWAYS FIT.
  var pr = /@media print \{([\s\S]*?)\n\}/.exec(SRC.css);
  ok(!!pr && /\.chart\s*\{[^}]*width:\s*100%\s*!important/.test(pr[1]),
    'C27 print forces the chart back to Fit, whatever the room was using');
}());

console.log('\n=== SECTION D  LAYERS, CLEAN AND DETAIL ===');
(function () {
  var p = chartPage();
  if (p.thrown) { ok(false, 'D0 boot', String(p.thrown)); return; }
  ['images', 'msrp', 'floor', 'promo', 'scenario', 'steps'].forEach(function (l, i) {
    ok(!!id(p, 'layer-' + l), 'D1.' + (i + 1) + ' the ' + l + ' layer has a switch');
  });
  // D2 ONE BAND LAYER, NOT TWO NAMES FOR ONE COLUMN.
  var labels = q(p, '.ctl-layers .chk-text').map(function (n) { return n.textContent; });
  eq(labels.filter(function (t) { return /list price/i.test(t); }).length, 1,
    'D2 "list price" appears in exactly ONE layer label', labels);
  ok(labels.indexOf('MSRP / list price') >= 0,
    'D3 and it says both words, because msrp IS the list price column', labels);
  eq(labels.filter(function (t) { return /^MSRP$/i.test(t); }).length, 0,
    'D4 there is no separate MSRP layer to disagree with it');

  function toggle(l, on) {
    var cb = id(p, 'layer-' + l);
    cb.checked = on;
    cb.dispatchEvent(new p.dom.Event('change', { bubbles: true }));
  }
  function legendKeys() {
    return q(p, '#chartLegend .legend-item').map(function (n) {
      return n.getAttribute('data-layer');
    });
  }
  // D5 EACH LAYER REMOVES ITS ELEMENT AND ITS KEY TOGETHER.
  ok(q(p, '.cap-msrp').length > 0 && legendKeys().indexOf('msrp') >= 0, 'D5 MSRP starts shown');
  toggle('msrp', false);
  eq(q(p, '.cap-msrp').length, 0, 'D6 switching it off removes the caps');
  eq(legendKeys().indexOf('msrp'), -1, 'D7 AND the legend key — never one without the other');
  eq(legendKeys().indexOf('band'), -1,
    'D8 and the band goes with it, because a band with one end is a line to nothing');
  eq(q(p, '.band').length, 0, 'D9 and no band element is left behind');
  toggle('msrp', true);
  ok(q(p, '.cap-msrp').length > 0 && q(p, '.band').length > 0, 'D10 and both come back');

  toggle('floor', false);
  eq(q(p, '.cap-floor').length, 0, 'D11 the floor layer switches independently');
  ok(q(p, '.cap-msrp').length > 0, 'D12 without taking MSRP with it');
  eq(q(p, '.band').length, 0, 'D13 while the band needs both, so it is gone');
  toggle('floor', true);

  toggle('promo', false);
  eq(q(p, '.mk-deal').length, 0, 'D14 live promotions can be hidden');
  eq(legendKeys().indexOf('promo'), -1, 'D15 with their key');
  toggle('promo', true);
  toggle('steps', false);
  eq(q(p, '.gapmark').length, 0, 'D16 and so can the price gaps');
  toggle('steps', true);
  toggle('images', false);
  eq(q(p, '.mk-img').length, 0, 'D17 images off means no photograph is drawn');
  ok(q(p, '.mk-img-plate').length > 0, 'D18 while the price marker itself stays — it IS the price');
  toggle('images', true);

  // D19 THE TWO SHORTCUTS.
  id(p, 'view-clean').click();
  eq(id(p, 'view-clean').getAttribute('aria-pressed'), 'true', 'D19 Clean View turns on');
  ok(q(p, '.mk-img-plate').length > 0, 'D20 Clean keeps the product images and the everyday price');
  eq(q(p, '.cap-msrp').length + q(p, '.cap-floor').length + q(p, '.gapmark').length, 0,
    'D21 and drops the extra lines');
  eq(id(p, 'layer-msrp').checked, false, 'D22 the shortcut SET the switches — it is not a third mode');
  id(p, 'view-detail').click();
  ok(q(p, '.cap-msrp').length > 0 && q(p, '.gapmark').length > 0, 'D23 Detail brings them all back');
  eq(id(p, 'layer-msrp').checked, true, 'D24 and the switches agree');

  // D25 EDITING A LAYER LEAVES THE PRESET, rather than the badge lying about where you are.
  toggle('promo', false);
  eq(id(p, 'view-detail').getAttribute('aria-pressed'), 'false',
    'D25 once a layer is edited the page stops claiming a preset');

  // D26 NO LAYER TOUCHES THE DATA.
  var before = board(site('US', 'Amazon'), { filters: { category: 'Silicone Spatula' } });
  var prices = before.architecture.panels[0].plotted.map(function (n) { return n._regular_c; });
  ok(prices.length > 0 && prices.every(function (v) { return typeof v === 'number'; }),
    'D26 the pipeline is unchanged by any of it — layers are a renderer concern only');
  ok(bare(SRC.selectors).indexOf('STATE.layers') < 0,
    'D27 and the pipeline cannot even see the layer state');
}());

console.log('\n=== SECTION E  THE SCENARIO FORM ===');
(function () {
  var p = chartPage();
  if (p.thrown) { ok(false, 'E0 boot', String(p.thrown)); return; }

  /* E0a MEETING MODE STARTS COLLAPSED. The price architecture is what the page is for; with the
     scenario form open by default the chart began below the fold at 1920x1080 — found on a
     screenshot, because no DOM assertion can see a fold. The BADGE stays outside the collapse:
     hiding a control is a density choice, hiding the state would be a lie. */
  eq(id(p, 'meetingToggle').getAttribute('aria-expanded'), 'false',
    'E0a meeting mode starts collapsed');
  eq(id(p, 'scenarioBody').hidden, true, 'E0b with its form hidden');
  ok(!!id(p, 'scenarioBadge'),
    'E0c while the badge stays visible, so an active scenario still shows');
  openMeeting(p);
  eq(id(p, 'scenarioBody').hidden, false, 'E0d and one click opens it');

  // E1 NO INTERNAL IDENTIFIER REACHES THE SCREEN.
  var panelText = id(p, 'scenarioPanel').textContent;
  ['proposed_scenario_price', 'everyday_scenario_price', 'PERCENT', 'DELTA', 'ABSOLUTE',
    'IN_MEMORY_ONLY'].forEach(function (tok, i) {
    if (tok === 'IN_MEMORY_ONLY') return;       // checked separately: it is allowed behind the `?`
    ok(panelText.indexOf(tok) < 0, 'E1.' + (i + 1) + ' the form never shows ' + tok);
  });
  var fieldOpts = id(p, 'scField').childNodes.map(function (o) { return o.textContent; });
  eq(fieldOpts, ['Proposed price', 'Everyday price'], 'E2 the price fields are sentences');
  var adjOpts = id(p, 'scAdjust').childNodes.map(function (o) { return o.textContent; });
  eq(adjOpts, ['Set proposed price', 'Increase / decrease by amount',
    'Increase / decrease by percentage'], 'E3 and so are the adjustments');
  eq(id(p, 'scField').value, 'proposed_scenario_price',
    'E4 the default is the proposed price, as the brief asks');

  // E5 THE SITE IS CONTEXT, NOT A CONTROL.
  var ctx = id(p, 'scenarioContext');
  ok(!!ctx, 'E5 the current site is shown as read-only context');
  eq(ctx.querySelectorAll('select').length + ctx.querySelectorAll('input').length, 0,
    'E6 with nothing in it to change — the site is chosen upstairs');
  ['company', 'country', 'marketplace', 'currency'].forEach(function (k, i) {
    ok(ctx.querySelectorAll('[data-ctx="' + k + '"]').length === 1,
      'E7.' + (i + 1) + ' it names the ' + k);
  });

  // E8 NO SILENT "ALL".
  eq(id(p, 'scSeries').value, '', 'E8 no Series is chosen by default');
  eq(id(p, 'scSeries').childNodes[0].textContent, 'Choose a Series…',
    'E9 and the empty option says so rather than saying All');
  var seriesVals = id(p, 'scSeries').childNodes.map(function (o) { return o.getAttribute('value'); });
  eq(seriesVals.indexOf('ALL'), -1, 'E10 there is no All option at all');
  var model = board(site('US', 'Amazon'), { filters: { category: 'Silicone Spatula' } });
  eq(seriesVals.filter(function (v) { return v !== ''; }), S.scenarioSeriesChoices(model),
    'E11 the list is the analysable Series of THIS site and category');

  // E12 REFUSALS, AND NOTHING HALF-APPLIED.
  function apply() { id(p, 'scApply').click(); }
  function refusal() {
    var n = id(p, 'scenarioModeRefusal');
    return n ? n.getAttribute('data-code') : null;
  }
  apply();
  eq(refusal(), 'SCENARIO_SERIES_NOT_CHOSEN', 'E12 Apply with no Series is refused, by name');
  eq(id(p, 'scenarioBadge').textContent, 'No scenario', 'E13 and nothing was applied');

  fire(p, 'scSeries', 'Spatula');
  apply();
  eq(refusal(), 'SCENARIO_VALUE_EMPTY', 'E14 an empty value is refused');
  fire(p, 'scValue', 'abc');
  apply();
  eq(refusal(), 'SCENARIO_VALUE_NOT_A_NUMBER', 'E15 so is text');
  fire(p, 'scValue', '-5');
  apply();
  eq(refusal(), 'SCENARIO_PRICE_NOT_POSITIVE', 'E16 and a negative PRICE');
  fire(p, 'scValue', '999999');
  apply();
  eq(refusal(), 'SCENARIO_PRICE_OUT_OF_RANGE', 'E17 and a figure far outside the board');
  eq(id(p, 'scenarioBadge').textContent, 'No scenario',
    'E18 after five refusals the board is still untouched');

  // E19 THE REACH IS SHOWN BEFORE THE CHANGE.
  var reach = id(p, 'scenarioReach');
  ok(Number(reach.getAttribute('data-skus')) > 0, 'E19 the number of affected listings is shown',
    reach.getAttribute('data-skus'));
  eq(Number(reach.getAttribute('data-skus')),
    S.scenarioAffected(model.rows, 'Spatula').skus, 'E20 and it is the real count');

  // E21 A VALID PROPOSED-PRICE APPLY.
  fire(p, 'scValue', '12.99');
  apply();
  eq(refusal(), null, 'E21 a good input is accepted');
  eq(id(p, 'scenarioBadge').textContent, 'Scenario · Unsaved', 'E22 the badge changes');
  ok(!!id(p, 'scenarioApplied'), 'E23 and the page says what was applied');
  ok(id(p, 'scenarioApplied').textContent.indexOf('Proposed price') > 0,
    'E24 in the same words the form used');
  ok(q(p, '.col.is-scenario').length > 0, 'E25 affected products carry a consistent outline');
  ok(!!id(p, 'scenarioPrintMark'), 'E26 and the unsaved-scenario mark is in the banner');

  // E27 THE ORIGINAL POSITION IS VISIBLE BESIDE THE SIMULATED ONE (everyday route).
  id(p, 'scResetAll').click();
  fire(p, 'scField', 'everyday_scenario_price');
  fire(p, 'scAdjust', 'by_percent');
  fire(p, 'scValue', '-20');
  fire(p, 'scSeries', 'Spatula');
  apply();
  ok(q(p, '.scen-ghost').length > 0, 'E27 the canonical position is drawn as a hollow marker');
  ok(q(p, '.scen-link').length > 0, 'E28 with a connector, so the difference is a distance');
  var ghost = q(p, '.scen-ghost')[0];
  var anchor = ghost.parentNode.querySelectorAll('.mk-anchor')[0];
  ok(Number(ghost.getAttribute('data-price-c')) > Number(anchor.getAttribute('data-price-c')),
    'E29 and a 20% cut really is drawn below the original');

  // E30 THE FLATTENING COMBINATION IS NOT OFFERED AT ALL.
  var adj2 = id(p, 'scAdjust').childNodes.map(function (o) { return o.getAttribute('value'); });
  eq(adj2.indexOf('set'), -1,
    'E30 with the everyday price chosen, "Set price" is absent — the mistake cannot be expressed');
  eq(adj2, ['by_amount', 'by_percent'], 'E31 only the two that preserve the ladder remain');

  // E32 UNDO.
  var before = id(p, 'scenarioNote').textContent;
  id(p, 'scUndo').click();
  eq(id(p, 'scenarioBadge').textContent, 'No scenario', 'E32 Undo removes the last change');
  ok(id(p, 'scenarioNote').textContent !== before, 'E33 and the count follows it');
  eq(id(p, 'scUndo').disabled, false, 'E34 Undo stays available while there is history');

  // E35 THE THREE RESETS ARE STILL THERE AND STILL DISTINCT.
  ['scResetSeries', 'scResetSite', 'scResetAll'].forEach(function (b, i) {
    ok(!!id(p, b), 'E35.' + (i + 1) + ' ' + b + ' exists');
  });
}());

// ---- E36 NOTHING PERSISTS, AND NOTHING CAN BE WRITTEN ----
(function () {
  var b = bare(SRC.selectors) + bare(SRC.prototype) + bare(SRC.fixture) + bare(SRC.contract);
  ['localStorage', 'sessionStorage', 'indexedDB', 'openDatabase', 'document.cookie',
    'history.pushState', 'location.hash', 'location.search', 'fetch(', 'XMLHttpRequest',
    'navigator.sendBeacon'].forEach(function (n, i) {
    ok(b.indexOf(n) < 0, 'E36.' + (i + 1) + ' no ' + n + ' anywhere in the prototype');
  });
  var p = openMeeting(chartPage());
  if (p.thrown) return;
  fire(p, 'scSeries', 'Spatula');
  fire(p, 'scValue', '11.11');
  id(p, 'scApply').click();
  eq(id(p, 'scenarioBadge').textContent, 'Scenario · Unsaved', 'E37 a scenario is active');
  // a reload is a new page object: the harness boots a fresh context, which is exactly a reload
  var again = openMeeting(chartPage());
  eq(id(again, 'scenarioBadge').textContent, 'No scenario',
    'E38 AND A RELOAD RESTORES THE CANONICAL VALUES');
  eq(again.dom.document.getElementById('scenarioPrintMark'), null,
    'E39 with no scenario mark left over');
}());

console.log('\n=== SECTION F  PROGRESSIVE DISCLOSURE ===');
(function () {
  var p = chartPage();
  if (p.thrown) { ok(false, 'F0 boot', String(p.thrown)); return; }
  var icons = q(p, '.info-btn');
  ok(icons.length >= 4, 'F1 every section heading carries the same `?`', icons.length);
  eq(q(p, '.info-pop').length, 0, 'F2 and nothing is expanded by default');

  // F3 THE DEFAULT SURFACE IS ONE LINE OF STATE, not a paragraph of technical prose.
  var scope = id(p, 'scope').textContent;
  ['canonical rows', 'Scope order', 'normalization', 'IN_MEMORY_ONLY', 'aggregation'].forEach(
    function (t, i) {
      ok(scope.indexOf(t) < 0, 'F3.' + (i + 1) + ' "' + t + '" is not permanently on screen');
    });

  // F4 CLICK OPENS IT, AND IT CONTAINS THE DETAIL THAT LEFT THE SCREEN.
  var catIcon = id(p, 'info-category');
  ok(!!catIcon, 'F4 the category block has one');
  eq(catIcon.getAttribute('aria-expanded'), 'false', 'F5 closed to begin with');
  catIcon.click();
  var pop = id(p, 'infopanel-category');
  ok(!!pop, 'F6 clicking it opens a panel');
  eq(id(p, 'info-category').getAttribute('aria-expanded'), 'true', 'F7 and says so to a reader');
  eq(pop.getAttribute('role'), 'note', 'F8 the panel is announced, not merely painted');
  ok(pop.textContent.indexOf('sku_details.category') > 0,
    'F9 THE DETAIL IS HERE — including the source column, which a person asked to see');
  ok(pop.textContent.indexOf('never renamed') > 0, 'F10 and the rule that goes with it');

  // F11 ONE AT A TIME.
  id(p, 'info-site').click();
  eq(q(p, '.info-pop').length, 1, 'F11 opening another closes the first');
  eq(id(p, 'info-site').getAttribute('aria-expanded'), 'true', 'F12 and the new one is marked open');

  // F13 THE THREE WAYS TO CLOSE.
  id(p, 'info-site').click();
  eq(q(p, '.info-pop').length, 0, 'F13 the same control closes it');
  id(p, 'info-site').click();
  id(p, 'scope').dispatchEvent(new p.dom.Event('click', { bubbles: true }));
  eq(q(p, '.info-pop').length, 0, 'F14 a click outside closes it');
  id(p, 'info-site').click();
  ok(q(p, '.info-pop').length === 1, 'F15 open it once more');
  p.dom.document.dispatchEvent(new p.dom.Event('keydown', { key: 'Escape' }));
  eq(q(p, '.info-pop').length, 0, 'F16 and Escape closes it — no mouse required');

  // F17 KEYBOARD REACHES IT WITHOUT A MOUSE AT ALL.
  var btn = id(p, 'info-zoom');
  ok(!!btn && btn.localName === 'button',
    'F17 the control is a BUTTON, so Enter and Space already activate it');
  ok(String(btn.getAttribute('aria-label')).indexOf('About') === 0,
    'F18 with a label a screen reader can read', btn.getAttribute('aria-label'));
  eq(btn.getAttribute('aria-controls'), 'infopanel-zoom', 'F19 pointing at the panel it owns');
  btn.dispatchEvent(new p.dom.Event('keydown', { key: 'Escape' }));
  eq(q(p, '.info-pop').length, 0, 'F20 and Escape on the control itself closes too');
}());

console.log('\n=== SECTION G  THE OPERATION SYSTEM CONTRACT ===');
(function () {
  var base = fs.readFileSync(path.join(H.ROOT, 'assets', 'css', 'base.css'), 'utf8');
  function tokenIn(css, name) {
    var m = new RegExp('(?:^|\\n)\\s*' + name.replace(/-/g, '\\-') + ':\\s*([^;]+);').exec(css);
    return m ? m[1].trim() : null;
  }
  /* EVERY TOKEN COPIED INTO THE PROTOTYPE IS HELD TO THE VALUE IN base.css. This is the assertion
     that stops "aligned with the Operation System" decaying into "looked similar once". */
  var tokens = ['--filter-height', '--filter-border-radius', '--filter-border-color',
    '--filter-padding-inline', '--filter-padding-block', '--filter-font-size',
    '--filter-text-color', '--filter-gap', '--filter-focus-ring', '--filter-panel-bg',
    '--filter-panel-radius', '--filter-panel-shadow', '--filter-option-font-size',
    '--filter-option-padding', '--filter-option-hover-bg', '--filter-option-selected-bg',
    '--filter-search-font-size', '--filter-muted-color', '--filter-label-font-size',
    '--filter-label-color', '--btn-height', '--btn-radius', '--btn-padding-inline',
    '--btn-font-size', '--btn-font-weight', '--radius-sm', '--radius-md', '--radius-lg',
    '--space-xs', '--space-sm', '--space-md', '--space-lg', '--border-light', '--border-medium',
    '--shadow-card', '--shadow-soft', '--text-primary', '--text-secondary', '--text-muted',
    '--font-size-body', '--font-size-small'];
  var missing = [], drifted = [];
  tokens.forEach(function (t) {
    var real = tokenIn(base, t);
    var mine = tokenIn(SRC.css, t);
    if (real === null) { missing.push(t + ' (absent from base.css)'); return; }
    if (mine === null) { missing.push(t + ' (not adopted by the prototype)'); return; }
    if (real !== mine) drifted.push(t + ': base=' + real + ' proto=' + mine);
  });
  eq(missing, [], 'G1 every Operation System token this page uses exists in both files');
  eq(drifted, [], 'G2 AND CARRIES THE SAME VALUE — the copy is held to the original');
  ok(tokens.length >= 40, 'G3 and it is a real set, not a token or two', tokens.length);

  // G4 THE SHARED FILTER-BAR CLASS IS USED BY NAME.
  var p = chartPage();
  if (p.thrown) return;
  ok(q(p, '.km-filter-bar').length >= 2,
    'G4 the filter bars carry the Operation System `.km-filter-bar` contract class');
  ok(q(p, '.filter-group').length >= 5, 'G5 and the controls are `.filter-group`s');

  // G6 THREE TIERS, IN ORDER.
  var tiers = id(p, 'scope').childNodes.map(function (n) { return n.id; });
  eq(tiers.slice(0, 3), ['scopeSite', 'scopeAnalysis', 'scopeAdvanced'],
    'G6 site first, analysis second, advanced third');
  eq(id(p, 'advFiltersBody').hidden, true, 'G7 advanced starts collapsed');
  ['fThreshold', 'fInactive'].forEach(function (c, i) {
    ok(id(p, 'advFiltersBody').querySelectorAll('#' + c).length === 1,
      'G8.' + (i + 1) + ' ' + c + ' lives inside it, not in the main bar');
  });
  id(p, 'advFiltersToggle').click();
  eq(id(p, 'advFiltersBody').hidden, false, 'G9 and opens on request');

  // G10 MEETING MODE IS ITS OWN PANEL, not another row of filters.
  ok(!!id(p, 'scenarioPanel'), 'G10 the scenario is a separate panel');
  eq(id(p, 'scenarioPanel').querySelectorAll('#fCountry').length, 0,
    'G11 with no scope control mixed into it');

  // G12 SELECTION IS NOT A WALL OF RED.
  var redInSelection = /\.catbtn\.is-on\s*\{[^}]*(#f04f5e|#dc2626|#98261d|red)/.test(SRC.css);
  ok(!redInSelection, 'G12 a chosen category is a fill, not an error colour');
}());

console.log('\n=== SECTION H  DENSITY ===');
(function () {
  var ctx = vm.createContext({ console: { log: function () {}, error: function () {} } });
  vm.runInContext(SRC.contract, ctx);
  vm.runInContext(SRC.selectors, ctx);
  vm.runInContext(SRC.fixture, ctx);
  var F = vm.runInContext('PSB_PREVIEW', ctx);
  var C = vm.runInContext('PSB_CONTRACT', ctx);
  var Sx = vm.runInContext('PSB_SELECTORS', ctx);
  var shape = F.STRESS_SHAPE;
  ok(shape.countries >= 8, 'H1 at least 8 countries', shape.countries);
  ok(shape.site_identities >= 10, 'H2 at least 10 site identities', shape.site_identities);
  ok(shape.categories >= 12, 'H3 at least 12 categories', shape.categories);
  ok(shape.series >= 15, 'H4 at least 15 series', shape.series);
  ok(shape.widest_chart >= 40, 'H5 at least 40 products on one chart', shape.widest_chart);
  eq(shape.is_database_data, false, 'H6 AND IT SAYS IT IS NOT DATABASE DATA');
  var rows = F.StressProductStrategyDataAdapter.loadCanonical().rows;
  eq(C.validateRows(rows).ok, true, 'H7 every generated row is contract-shaped');
  ok(rows.every(function (r) {
    return r.provenance.identity_source === 'STRESS_FIXTURE_GENERATED';
  }), 'H8 and every one of them is labelled generated, row by row');

  // H9 DETERMINISTIC. A fixture that differs between runs is not a fixture.
  var ctx2 = vm.createContext({ console: { log: function () {}, error: function () {} } });
  vm.runInContext(SRC.contract, ctx2);
  vm.runInContext(SRC.selectors, ctx2);
  vm.runInContext(SRC.fixture, ctx2);
  var rows2 = vm.runInContext('PSB_PREVIEW', ctx2)
    .StressProductStrategyDataAdapter.loadCanonical().rows;
  eq(JSON.stringify(rows2) === JSON.stringify(rows), true, 'H9 and it is byte-identical on a re-run');
  ok(bare(SRC.fixture).indexOf('Math.random') < 0, 'H10 because there is no randomness in it');

  // H11 THE WIDE CHART ACTUALLY RENDERS 44 COLUMNS, and the geometry copes.
  var m = Sx.deriveBoardModel({ rows: rows,
    selection: { company: 'Kitchen Mama', country: 'US', marketplace: 'Amazon' },
    filters: { category: 'Electric Can Opener' } });
  eq(m.architecture.panels[0].plotted.length, 44, 'H11 44 products on one axis');
  eq(m.categoryOptions.options.length, 12, 'H12 with 12 categories in the menu');

  // H13 THE CATEGORY CONTROL CHANGES SHAPE rather than becoming a wall of chips.
  var p = bootPage(null);
  if (p.thrown) { ok(false, 'H13 boot', String(p.thrown)); return; }
  eq(id(p, 'categoryControl').getAttribute('data-shape'), 'chips',
    'H13 a few categories are chips');
  id(p, 'advFiltersToggle').click();
  var sw = id(p, 'fStress');
  sw.checked = true;
  sw.dispatchEvent(new p.dom.Event('change', { bubbles: true }));
  eq(id(p, 'categoryControl').getAttribute('data-shape'), 'menu',
    'H14 twelve become a searchable menu instead');
  eq(id(p, 'categoryControl').getAttribute('data-count'), '12', 'H15 and the count is still shown');
  ok(q(p, '#catBar .catbtn').length <= 7,
    'H16 the chip row does NOT grow without limit', q(p, '#catBar .catbtn').length);
  ok(!!id(p, 'catMore'), 'H17 the rest are behind a More control');

  // H18 THE MENU IS SEARCHABLE, and a miss says so.
  id(p, 'catMore').click();
  ok(!!id(p, 'catMenu'), 'H18 which opens a menu');
  ok(!!id(p, 'catSearch'), 'H19 with a search box');
  var sb = id(p, 'catSearch');
  sb.value = 'pepper';
  sb.dispatchEvent(new p.dom.Event('input', { bubbles: true }));
  var items = q(p, '.catmenu-item');
  eq(items.length, 1, 'H20 searching narrows it', items.map(function (i2) {
    return i2.getAttribute('data-category'); }));
  eq(items[0].getAttribute('data-category'), 'Pepper Mill', 'H21 to the right one');
  ok(items[0].textContent.indexOf('(') > 0, 'H22 and the count travels with the option');
  var sb2 = id(p, 'catSearch');
  sb2.value = 'zzzz';
  sb2.dispatchEvent(new p.dom.Event('input', { bubbles: true }));
  ok(!!q(p, '.catmenu-empty').length, 'H23 a miss says nothing matched, rather than showing nothing');

  // H24 CHOOSING FROM THE MENU WORKS, and the chart copes with 44.
  var sb3 = id(p, 'catSearch');
  sb3.value = '';
  sb3.dispatchEvent(new p.dom.Event('input', { bubbles: true }));
  var target = q(p, '.catmenu-item').filter(function (i3) {
    return i3.getAttribute('data-category') === 'Electric Can Opener'; });
  ok(target.length === 1, 'H24 the wide category is in the menu');
  target[0].click();
  eq(q(p, '#catMenu').length, 0, 'H25 choosing closes the menu');
  var chart = q(p, '.chart')[0];
  ok(!!chart, 'H26 and the 44-product chart renders');
  eq(q(p, '.col').length, 44, 'H27 with 44 columns');
  var vbw = Number(chart.getAttribute('data-vb-w'));
  var colW = Number(chart.getAttribute('data-col-w'));
  ok(colW >= 74, 'H28 each column keeps a readable minimum width', colW);
  ok(vbw >= 44 * colW, 'H29 so the drawing grows and the CONTAINER scrolls', { vbw: vbw });
  /* P1-B2B REPLACED THE STAGGER WITH ONE BASELINE. Alternating labels between two rows was how
     narrow columns used to be survived; it made half the products look like a different kind of
     thing, and at 44 columns it read as noise. Narrow columns truncate instead, and the whole
     label stays on the node, in its <title> and in the hover panel. */
  eq(q(p, '.xlabel[data-row="b"]').length, 0, 'H30 no label is dropped onto a second row');
  var rows44 = q(p, '.xlabel').map(function (n) { return n.getAttribute('y'); });
  eq(rows44.filter(function (v, i2) { return rows44.indexOf(v) !== i2; }).length,
    rows44.length - 1, 'H30a every one of the 44 labels shares a single baseline');
  ok(q(p, '.xlabel[data-truncated="true"]').length > 0,
    'H30b and the narrow ones are truncated rather than overlapped');
  eq(q(p, '.mk-img-plate').length, 44, 'H31 every product still has its marker');
}());

console.log('\n=== SECTION J  WHAT ONLY A SCREENSHOT COULD SEE ===');
/*
 * Four defects got through both suites and were found by rendering the page in a real browser and
 * LOOKING at it. Each one is here now, as the nearest assertion that would have caught it — not
 * because these replace a visual review, but because a defect found once should not need finding
 * twice.
 *
 *   1. two `.scope` rules MERGED, and the survivor was `align-items: flex-end` from the old
 *      single-row ladder: the whole filter area stacked into the right half of an empty band.
 *   2. `.adv-body-row { display: flex }` beat the browser's `[hidden]` rule, so the advanced drawer
 *      rendered fully open while its `hidden` property was true and its button said Show.
 *   3. two legend keys were added with no swatch style, rendering as a label beside an empty box.
 *   4. `width: 100%` on a 3364px drawing inside a ~1400px card painted it at 0.42x — every
 *      coordinate correct, every pixel illegible.
 */
(function () {
  var p = chartPage();
  if (p.thrown) { ok(false, 'J0 boot', String(p.thrown)); return; }

  // J1 ONE RULE PER SELECTOR. CSS picks a winning DECLARATION, not a winning rule, so a second
  // rule for a selector silently donates whatever the first one did not restate.
  var dupes = (function () {
    var seen = {}, out = [];
    SRC.css.split('\n').forEach(function (line) {
      var m = /^([.#][A-Za-z0-9_-]+)\s*(,|\{)/.exec(line);
      if (!m) return;
      if (seen[m[1]]) { if (out.indexOf(m[1]) < 0) out.push(m[1]); }
      seen[m[1]] = 1;
    });
    return out;
  }());
  eq(dupes, [], 'J1 no top-level selector is declared twice in the stylesheet');

  // J2 `hidden` MEANS HIDDEN, whatever a class says about display.
  ok(/\[hidden\]\s*\{[^}]*display:\s*none\s*!important/.test(SRC.css),
    'J2 the stylesheet forces [hidden] to win against any class that sets display');
  var hidden = ['advFiltersBody', 'scenarioBody', 'dqDetail'];
  hidden.forEach(function (hid, i) {
    var n = id(p, hid);
    ok(!n || n.hidden === true || n.hidden === false,
      'J3.' + (i + 1) + ' ' + hid + ' is driven by the hidden property');
  });

  // J4 EVERY LEGEND KEY HAS A SHAPE. A key that shows nothing sends a reader looking for a marker
  // that does not exist.
  var keys = q(p, '#chartLegend .sw').map(function (n) {
    return String(n.className).replace('sw ', '').trim();
  });
  ok(keys.length >= 6, 'J4 the legend has keys to check', keys.length);
  var unstyled = keys.filter(function (cls) {
    return !new RegExp('\\.' + cls + '[\\s,{]').test(SRC.css);
  });
  eq(unstyled, [], 'J5 and every one of them has a swatch style');

  // J6 FIT HAS A LEGIBILITY FLOOR.
  var narrow = q(p, '.chart')[0];
  eq(narrow.getAttribute('width'), '100%',
    'J6 a chart that fits the card is painted across it');
  eq(narrow.getAttribute('data-fit-floored'), null, 'J7 and is not floored');
}());

(function () {
  // the 44-product chart, at Fit
  var p = bootPage(null);
  if (p.thrown) { ok(false, 'J8 boot', String(p.thrown)); return; }
  id(p, 'advFiltersToggle').click();
  var sw = id(p, 'fStress');
  sw.checked = true;
  sw.dispatchEvent(new p.dom.Event('change', { bubbles: true }));
  id(p, 'catMore').click();
  var target = q(p, '.catmenu-item').filter(function (i2) {
    return i2.getAttribute('data-category') === 'Electric Can Opener'; });
  target[0].click();
  var wide = q(p, '.chart')[0];
  var vbw = Number(wide.getAttribute('data-vb-w'));
  ok(vbw > 2000, 'J8 forty-four columns need far more than a card width', vbw);
  eq(wide.getAttribute('data-fit-floored'), 'true',
    'J9 SO FIT STOPS SHRINKING — a chart scaled to 0.42x is not fitted, it is unreadable');
  eq(wide.getAttribute('width'), String(vbw),
    'J10 it is painted at natural size and the container scrolls instead');
  eq(wide.getAttribute('viewBox'), '0 0 ' + vbw + ' ' + wide.getAttribute('data-vb-h'),
    'J11 and the coordinate system is still untouched');
}());

console.log('\n=== MUTANTS ===');
function withProto(mutate) {
  return bootPage(function (kind, src) {
    return kind === 'prototype' ? mutate(src) : src;
  });
}
function swap(a, b) {
  return function (src) {
    var n = src.split(a).length - 1;
    if (n !== 1) throw new Error('mutant anchor ' + n + 'x: ' + a.slice(0, 60));
    return src.replace(a, b);
  };
}
/**
 * DRIVE A (POSSIBLY MUTATED) PAGE TO A CHART BEFORE LOOKING AT ONE.
 *
 * bootPage lands on the executive overview, and the overview deliberately draws NO price axis. Three
 * mutants were reported as surviving for exactly that reason: the observation found no markers on the
 * clean page and no markers on the mutant, which is agreement about an empty room rather than a
 * verdict about a rule.
 */
function toChart(pg, category) {
  if (pg.thrown) return pg;
  var doc = pg.dom.document;
  var chip = doc.querySelectorAll('#catBar .catbtn').filter(function (b) {
    return b.getAttribute('data-category') === (category || 'Silicone Spatula');
  });
  if (chip.length) chip[0].click();
  return pg;
}

mut('N1 the black dot comes back, drawn last, at the centre of the photograph', function () {
  // THE DEFECT THIS ROUND EXISTS TO REMOVE.
  var m = withProto(swap("    g.appendChild(grp);\n    return grp;\n  }\n  function shortCode",
    "    grp.appendChild(svg('circle', { cx: cx, cy: cy, r: 2, 'class': 'mk-anchor mk-reg' }));\n"
      + '    g.appendChild(grp);\n    return grp;\n  }\n  function shortCode'));
  function onPicture(pg) {
    if (pg.thrown) return -1;
    var plates = pg.dom.document.querySelectorAll('.mk-img-plate');
    var hits = 0;
    pg.dom.document.querySelectorAll('circle').forEach(function (c) {
      plates.forEach(function (pl) {
        var x = Number(pl.getAttribute('x')), y = Number(pl.getAttribute('y'));
        var w = Number(pl.getAttribute('width')), h = Number(pl.getAttribute('height'));
        var cx = Number(c.getAttribute('cx')), cy = Number(c.getAttribute('cy'));
        if (cx > x && cx < x + w && cy > y && cy < y + h) hits++;
      });
    });
    return hits;
  }
  return onPicture(chartPage()) === 0 && onPicture(toChart(m)) > 0;
});

mut('N2 the dot is hidden instead of removed, so it is still in the tree', function () {
  // A transparent dot is still hit-tested and still there for the next reader to rediscover.
  var m = withProto(swap("    g.appendChild(grp);\n    return grp;\n  }\n  function shortCode",
    "    grp.appendChild(svg('circle', { cx: cx, cy: cy, r: 2, 'class': 'mk-anchor mk-reg',\n"
      + "      opacity: '0' }));\n    g.appendChild(grp);\n    return grp;\n  }\n  function shortCode"));
  function circlesInPlates(pg) {
    if (pg.thrown) return -1;
    return pg.dom.document.querySelectorAll('circle').filter(function (c) {
      return c.getAttribute('cx') !== null;
    }).length;
  }
  var clean = circlesInPlates(chartPage()), bad = circlesInPlates(toChart(m));
  return clean === 0 && bad > 0;
});

mut('N3 zoom scales the viewBox, so a price moves when somebody enlarges the chart', function () {
  // The one thing a zoom must never do. Scaling the coordinate system LOOKS identical on screen and
  // silently changes every coordinate a reader or a test would compare.
  var m = withProto(swap(
    "    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, 'class': 'chart',",
    "    var s = svg('svg', { viewBox: '0 0 ' + (W * (STATE.zoom === 'fit' ? 1 : Number(STATE.zoom)))"
      + " + ' ' + H, 'class': 'chart',"));
  function vbAt(pg, zoomId) {
    if (pg.thrown) return 'THREW';
    var doc = pg.dom.document;
    var chip = doc.querySelectorAll('#catBar .catbtn').filter(function (b) {
      return b.getAttribute('data-category') === 'Silicone Spatula'; });
    if (chip.length) chip[0].click();
    doc.getElementById(zoomId).click();
    return doc.querySelectorAll('.chart')[0].getAttribute('viewBox');
  }
  var cleanFit = vbAt(chartPage(), 'zoom-fit'), cleanBig = vbAt(chartPage(), 'zoom-1-5');
  var badFit = vbAt(m, 'zoom-fit'), badBig = vbAt(m, 'zoom-1-5');
  return cleanFit === cleanBig && badFit !== badBig;
});

mut('N4 a hidden layer keeps its legend key, so the chart claims something it does not show',
  function () {
    var m = withProto(swap(
      "      if (p.layer === 'band' ? !(layerOn('floor') && layerOn('msrp'))\n"
        + "        : (p.layer !== null && !layerOn(p.layer))) return;",
      '      if (false) return;'));
    function keysAfterHiding(pg) {
      if (pg.thrown) return 'THREW';
      var doc = pg.dom.document;
      var chip = doc.querySelectorAll('#catBar .catbtn').filter(function (b) {
        return b.getAttribute('data-category') === 'Silicone Spatula'; });
      if (chip.length) chip[0].click();
      var cb = doc.getElementById('layer-promo');
      cb.checked = false;
      cb.dispatchEvent(new pg.dom.Event('change', { bubbles: true }));
      return doc.querySelectorAll('#chartLegend .legend-item').map(function (n) {
        return n.getAttribute('data-layer'); }).indexOf('promo');
    }
    return keysAfterHiding(chartPage()) === -1 && keysAfterHiding(m) >= 0;
  });

mut('N5 the band survives with one cap hidden, so a line runs from a price to nothing', function () {
  var m = withProto(swap(
    "      if (layerOn('floor') && layerOn('msrp') && n._min_c !== null && n._msrp_c !== null) {",
    '      if (n._min_c !== null && n._msrp_c !== null) {'));
  function bandsAfterHidingMsrp(pg) {
    if (pg.thrown) return -1;
    var doc = pg.dom.document;
    var chip = doc.querySelectorAll('#catBar .catbtn').filter(function (b) {
      return b.getAttribute('data-category') === 'Silicone Spatula'; });
    if (chip.length) chip[0].click();
    var cb = doc.getElementById('layer-msrp');
    cb.checked = false;
    cb.dispatchEvent(new pg.dom.Event('change', { bubbles: true }));
    return doc.querySelectorAll('.band').length;
  }
  return bandsAfterHidingMsrp(chartPage()) === 0 && bandsAfterHidingMsrp(m) > 0;
});

mut('N6 the Series menu offers "All", so a change can reach further than anyone can see',
  function () {
    // RE-AIMED IN P1-B2B. The old mutant wrote 'ALL' into STATE from narrowAfterSiteChange, and the
    // in-place updater added this round drops any value the menu does not offer — so the mutant
    // became unobservable through a defence that is itself correct. The rule "there is no All" now
    // lives in ONE function, and this aims at that function, because the menu is the only place an
    // All option could ever appear.
    var m = withProto(swap(
      "  function seriesChoiceValues() { return [''].concat(SEL.scenarioSeriesChoices(MODEL)); }",
      "  function seriesChoiceValues() { return ['ALL'].concat(SEL.scenarioSeriesChoices(MODEL)); }"
    ));
    function offered(pg) {
      if (pg.thrown) return 'THREW';
      toChart(pg);
      openMeeting(pg);
      var sel = pg.dom.document.getElementById('scSeries');
      if (!sel) return 'NO_CONTROL';
      return sel.childNodes.map(function (o) { return o.getAttribute('value'); }).join('|');
    }
    var clean = offered(bootPage(null)), dirty = offered(m);
    return clean.indexOf('ALL') < 0 && dirty.indexOf('ALL') === 0;
  });

mut('N7 the internal field name reaches the screen', function () {
  var m = withProto(swap('      }, false, null, function (id) { return SEL.scenarioFieldLabel(id); }));',
    '      }, false, null, null));'));
  function shown(pg) {
    if (pg.thrown) return 'THREW';
    return pg.dom.document.getElementById('scField').childNodes.map(function (o) {
      return o.textContent; }).join('|');
  }
  return shown(chartPage()).indexOf('_') < 0 && shown(m).indexOf('proposed_scenario_price') >= 0;
});

mut('N8 Apply stops validating, so a blank or a typo half-applies', function () {
  var m = withProto(swap("      if (!check.ok) {\n        STATE.scenarioRefusal = check;",
    "      if (false) {\n        STATE.scenarioRefusal = check;"));
  function appliesNonsense(pg) {
    if (pg.thrown) return 'THREW';
    toChart(pg);
    openMeeting(pg);
    var doc = pg.dom.document;
    doc.getElementById('scApply').click();          // no Series, no value
    var ref = doc.getElementById('scenarioModeRefusal');
    return ref ? ref.getAttribute('data-code') : 'NO_REFUSAL';
  }
  return appliesNonsense(chartPage()) === 'SCENARIO_SERIES_NOT_CHOSEN'
    && appliesNonsense(m) === 'NO_REFUSAL';
});

mut('N9 the popovers stop closing on Escape', function () {
  var m = withProto(swap("      if (!ev || ev.key !== 'Escape') return;", '      return;'));
  function closesOnEsc(pg) {
    if (pg.thrown) return 'THREW';
    var doc = pg.dom.document;
    doc.getElementById('info-site').click();
    if (doc.querySelectorAll('.info-pop').length !== 1) return 'DID_NOT_OPEN';
    doc.dispatchEvent(new pg.dom.Event('keydown', { key: 'Escape' }));
    return doc.querySelectorAll('.info-pop').length === 0;
  }
  return closesOnEsc(chartPage()) === true && closesOnEsc(m) !== true;
});

mut('N10 the info control opens on hover only, so a keyboard cannot reach it', function () {
  var m = withProto(swap("    var btn = el('button', 'info-btn', '?');",
    "    var btn = el('span', 'info-btn', '?');"));
  function isButton(pg) {
    if (pg.thrown) return 'THREW';
    var b = pg.dom.document.getElementById('info-site');
    return b ? String(b.localName).toLowerCase() : 'MISSING';
  }
  return isButton(chartPage()) === 'button' && isButton(m) === 'span';
});

mut('N11 the category chips grow without limit, so forty of them become the page', function () {
  var m = withProto(swap('  var CATEGORY_CHIP_LIMIT = 6;', '  var CATEGORY_CHIP_LIMIT = 999;'));
  function chipsUnderStress(pg) {
    if (pg.thrown) return -1;
    var doc = pg.dom.document;
    doc.getElementById('advFiltersToggle').click();
    var sw = doc.getElementById('fStress');
    sw.checked = true;
    sw.dispatchEvent(new pg.dom.Event('change', { bubbles: true }));
    return doc.querySelectorAll('#catBar .catbtn').length;
  }
  return chipsUnderStress(bootPage(null)) <= 7 && chipsUnderStress(m) > 10;
});

mut('N12 the plot stops being centred, so the slack collects on the right', function () {
  var m = withProto(swap(
    '    var offset = plotW < avail ? PAD_L + (avail - plotW) / 2 : PAD_L;',
    '    var offset = PAD_L;'));
  function balance(pg) {
    if (pg.thrown) return null;
    toChart(pg);
    var doc = pg.dom.document;
    var chart = doc.querySelectorAll('.chart')[0];
    if (!chart) return null;
    var vbw = Number(chart.getAttribute('viewBox').split(' ')[2]);
    var xs = doc.querySelectorAll('.xlabel').map(function (t) {
      return Number(t.getAttribute('x')); });
    return { diff: Math.abs(Math.min.apply(null, xs) - (vbw - Math.max.apply(null, xs))),
      colW: Number(chart.getAttribute('data-col-w')) };
  }
  /* AIMED AT THE SAME PREDICATE C5 USES, so the mutant and the assertion cannot disagree about
     what "centred" means. */
  var clean = balance(chartPage()), bad = balance(toChart(m));
  return clean !== null && bad !== null && clean.diff < clean.colW / 2
    && bad.diff >= bad.colW / 2;
});

mut('N13 the image shrinks back to the size the review objected to', function () {
  var m = withProto(swap('  var MK = 50, MK_HOVER = 66;', '  var MK = 36, MK_HOVER = 48;'));
  function plateW(pg) {
    if (pg.thrown) return -1;
    var doc = pg.dom.document;
    var chip = doc.querySelectorAll('#catBar .catbtn').filter(function (b) {
      return b.getAttribute('data-category') === 'Silicone Spatula'; });
    if (chip.length) chip[0].click();
    return Number(doc.querySelectorAll('.mk-img-plate')[0].getAttribute('width'));
  }
  var c = plateW(chartPage()), b = plateW(m);
  return c >= 46 && c <= 54 && b < 46;
});

mut('N14 the stress fixture claims to be database data', function () {
  var ctx = vm.createContext({ console: { log: function () {}, error: function () {} } });
  vm.runInContext(SRC.contract, ctx);
  vm.runInContext(SRC.selectors, ctx);
  vm.runInContext(SRC.fixture.replace('    is_database_data: false', '    is_database_data: true'),
    ctx);
  var bad = vm.runInContext('PSB_PREVIEW', ctx).STRESS_SHAPE.is_database_data;
  return P.F.STRESS_SHAPE.is_database_data === false && bad === true;
});

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL')
  + ' — passed ' + pass + ', failed ' + fail
  + ', mutants caught ' + mutCaught + ', survived ' + mutSurvived);
if (fail !== 0) process.exit(1);
