// Kitchen Mama Operation System — PRODUCT-STRATEGY-P1-B4
// The compact command bar, More filters, the meeting scenario drawer, and the removal of the fixture.
//
// THE ONE THING THIS ROUND DECIDES is how much of the screen the controls may take and in what order
// a person meets them. So the suite is built around the ways a command bar turns back into four
// cards: a control that grows with its data, a panel that displaces instead of overlaying, a
// developer tool left within reach, and a workspace that moves the chart when it opens.
//
// WHAT THIS FILE CAN AND CANNOT SEE. The DOM shim has no layout engine — it cannot tell you the bar
// is 112px tall. The §7 pixel targets are measured in a real browser and recorded in the design
// freeze; THIS file asserts the STRUCTURAL facts that produce them: one bar and not four cards, one
// card and not two nested, the popover absolutely positioned, the drawer fixed, the category control
// a single trigger, and the media queries that carry the three widths. A structural assertion cannot
// prove a height. It can prove that the things which made it 422px are gone.
//
// Run: node assets/tests/product-strategy-board-p1-b4.test.js

var fs = require('fs'), path = require('path');
var H = require('./_psb-harness.js');
var SRC = H.SRC, bare = H.bare, bootPage = H.bootPage, pipeline = H.pipeline;

var pass = 0, fail = 0, mutCaught = 0, mutSurvived = 0;
function ok(c, l, d) {
  if (c) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + (d === undefined ? '' : '\n  got ' + JSON.stringify(d))); }
}
function eq(a, e, l, d) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else {
    fail++;
    console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A
      + (d === undefined ? '' : '\n  ctx ' + JSON.stringify(d)));
  }
}
// A THROWING MUTANT IS NOT A CAUGHT ONE — an anchor that stopped matching must read as SURVIVED, or a
// rule nobody checks gets a green light. This project has met that three times.
function mut(label, f) {
  var caught = false, why = null;
  try { caught = f() === true; } catch (e) { caught = false; why = String((e && e.message) || e); }
  if (caught) { mutCaught++; console.log('ok   ' + label + ' (caught)'); }
  else {
    mutSurvived++; fail++;
    console.error('FAIL ' + label + ' — MUTANT SURVIVED' + (why ? ' [threw: ' + why + ']' : ''));
  }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

function q(p, sel) { return p.dom.document.querySelectorAll(sel); }
function id(p, x) { return p.dom.document.getElementById(x); }
function withProto(mutate) {
  return bootPage(function (k, s) { return k === 'prototype' ? mutate(s) : s; });
}
function withProtoDev(mutate) {
  return bootPage(function (k, s) { return k === 'prototype' ? mutate(s) : s; }, { devMode: true });
}
function swap(a, b) {
  return function (src) {
    var n = src.split(a).length - 1;
    if (n !== 1) throw new Error('mutant anchor ' + n + 'x: ' + a.slice(0, 60));
    return src.replace(a, b);
  };
}
function chartPage(opts) {
  var p = bootPage(null, opts || null);
  if (p.thrown) return p;
  H.pickCategory(p, 'Silicone Spatula');
  return p;
}
function fire(p, elId, value) {
  var n = id(p, elId);
  if (!n) throw new Error('no control #' + elId);
  if (value !== undefined) n.value = value;
  n.dispatchEvent(new p.dom.Event('change', { bubbles: true }));
  return n;
}
/** The field ids of the standing ladder, in the order they appear. */
function ladderOf(p) {
  return q(p, '#scopeFields .cmd-field').map(function (f) {
    var c = f.querySelectorAll('select').concat(
      f.querySelectorAll('.cmd-context-value'), f.querySelectorAll('.catbtn.is-more'))[0];
    return String((c && (c.id || c.getAttribute('data-context-for'))) || '?')
      .replace(/Context$/, '');
  });
}
/**
 * The values a dimension currently offers, WHATEVER SHAPE IT IS IN.
 *
 * §1.4 turns a single-valued dimension into read-only context, which has no `<option>` elements at
 * all — so a helper that only reads options reports "no marketplaces" for a country that sells on
 * exactly one. That is the feature working and the helper being naive. This asks the question of
 * whichever control is there.
 */
function optionsOf(p, selId) {
  var opts = q(p, '#' + selId + ' option').map(function (o) { return o.getAttribute('value'); })
    .filter(function (v) { return v !== 'ALL'; });
  if (opts.length) return opts;
  var ctx = id(p, selId + 'Context');
  return ctx ? [ctx.textContent] : [];
}

console.log('=== PRODUCT-STRATEGY-P1-B4 — compact command bar · more filters · scenario drawer ===');
var PG = chartPage();
ok(PG.thrown === null, 'A0 the page boots with no exception',
  PG.thrown && (PG.thrown.message + ' :: ' + String(PG.thrown.stack).split('\n')[1]));
if (PG.thrown) { console.log('\npassed ' + pass + '  failed ' + (fail + 1)); process.exit(1); }
var V = H.selfTestVerdict(PG);
console.log('     (the page reported ' + V.badge + ')');
eq(V.bad.map(function (b) { return b.text; }), [],
  'A1 and every one of its own DOM assertions still passes');

// ===================================================================================================
section('SECTION A  §1 ONE BAR, AND THE ORDER A PERSON WALKS IT');
// ===================================================================================================
ok(!!id(PG, 'cmdBar'), 'A2 there is one command bar');
eq(id(PG, 'scope').childNodes.map(function (n) { return n.id; }),
  ['cmdBar', 'scenarioDrawer'],
  'A2a and the scope area holds exactly the bar and the (closed) drawer — no tier stack');
['scopeAnalysis', 'scopeAdvanced', 'advFiltersToggle', 'advFiltersBody'].forEach(function (gone, i) {
  eq(id(PG, gone), null, 'A2b.' + (i + 1) + ' ' + gone + ' is gone');
});
eq(id(PG, 'cmdBar').childNodes.map(function (n) { return n.id; }),
  ['scopeSite', 'scopeSummaryRow'], 'A2c two rows: the ladder, then the context line');

// A3 THE ORDER, AND IT IS THE ORDER OF DEPENDENCE.
var ladder = ladderOf(PG);
eq(ladder, ['fCompany', 'fCountry', 'fMarketplace', 'catMore', 'fSeries'],
  'A3 company → country → marketplace → category → series', ladder);
q(PG, '#scopeFields .cmd-field').forEach(function (f, i) {
  ok(String(f.className).indexOf('filter-group') >= 0,
    'A3a.' + (i + 1) + ' field ' + i + ' carries the shared `.filter-group` class', f.className);
});
// A3b THE TWO SECONDARY ENTRANCES ARE OUTSIDE THE LADDER, so they cannot compete for its width.
eq(id(PG, 'cmdTools').childNodes.map(function (n) { return n.id; }),
  ['moreFilters', 'meetingScenario'], 'A3b More filters and Meeting scenario sit in the tools group');
eq(id(PG, 'scopeFields').querySelectorAll('#moreFiltersToggle').length, 0,
  'A3c and not among the fields');

// A4 §1.2 — NO CARD PER SECTION, and the bar is not a card inside a card either.
ok(/\.scope\s*\{[^}]*background:\s*none/.test(SRC.css),
  'A4 `.scope` is a plain container — the bar inside it is the only card');
ok(/\.cmdbar\s*\{[^}]*border:\s*1px solid/.test(SRC.css), 'A4a and the bar IS the card');
['scope-tier', 'tier-h', 'tier-label', 'adv-body-row'].forEach(function (dead, i) {
  ok(SRC.css.indexOf('.' + dead) < 0,
    'A4b.' + (i + 1) + ' the dead rule .' + dead + ' is deleted, not left to be reused');
});

// A5 §1.8 — HIERARCHY IS NOT ALARM COLOUR.
var barCss = /\/\* =+\s*\n\s+P1-B4 — THE COMMAND BAR[\s\S]*?(?=\/\* =+\s*\n\s+S5 — THE MEETING)/
  .exec(SRC.css);
ok(!!barCss, 'A5 the command bar has its own stylesheet block');
if (barCss) {
  ok(!/text-transform:\s*uppercase/.test(barCss[0]),
    'A5a no uppercase is used as emphasis in the bar');
  ok(!/#f04f5e|#dc2626|#b3392f|var\(--accent\)|var\(--risk\)/.test(barCss[0]),
    'A5b and no error or alarm colour');
}
ok(/\.cmd-field \.fl-label[\s\S]{0,220}--filter-label-font-size/.test(SRC.css),
  'A5c the labels read from the shared filter-label tokens rather than the prototype\'s own');

// ===================================================================================================
section('SECTION B  §1.3/§1.5 DEPENDENT FILTERS — A MENU IS THE TIER ABOVE IT');
// ===================================================================================================
var P = pipeline();
var CANON = P.canon;

// B1 EVERY MARKETPLACE MENU IS EXACTLY THAT COUNTRY'S MARKETPLACES.
(function () {
  var p = bootPage(null);
  var truth = {};
  CANON.forEach(function (r) {
    truth[r.country] = truth[r.country] || {};
    truth[r.country][r.marketplace] = 1;
  });
  var wrong = [], seen = {}, shapes = {};
  optionsOf(p, 'fCountry').forEach(function (country) {
    fire(p, 'fCountry', country);
    var offered = optionsOf(p, 'fMarketplace').sort();
    seen[country] = offered;
    /* WHICH SHAPE each country produced, because the answer is part of the rule: one marketplace
       means read-only context, more than one means a select. */
    shapes[country] = id(p, 'fMarketplace') ? 'select'
      : (id(p, 'fMarketplaceContext') ? 'context' : 'neither');
    var want = Object.keys(truth[country] || {}).sort();
    if (JSON.stringify(offered) !== JSON.stringify(want)) {
      wrong.push({ country: country, offered: offered, real: want, shape: shapes[country] });
    }
  });
  eq(wrong, [], 'B1 every Marketplace menu is exactly that country\'s marketplaces', seen);
  /* AND THE SHAPE FOLLOWS THE COUNT, per country — §1.4 measured across the whole ladder rather
     than on the one dimension that happens to be single-valued in this fixture. */
  var shapeWrong = [];
  Object.keys(shapes).forEach(function (c) {
    var n = Object.keys(truth[c] || {}).length;
    var want = n === 1 ? 'context' : 'select';
    if (shapes[c] !== want) shapeWrong.push({ country: c, marketplaces: n, shape: shapes[c] });
  });
  eq(shapeWrong, [],
    'B1b a country with one marketplace shows context, a country with several shows a select',
    shapes);
  /* AND THEY ARE NOT ALL THE SAME LIST — otherwise B1 would pass on a global menu. */
  var distinct = {};
  Object.keys(seen).forEach(function (k) { distinct[JSON.stringify(seen[k])] = 1; });
  ok(Object.keys(distinct).length > 1,
    'B1a and the countries do NOT all offer the same marketplaces, so B1 means something', seen);
}());

// B2 §1.5 — A DOWNSTREAM VALUE THAT NO LONGER EXISTS IS CLEARED, NOT KEPT.
(function () {
  var p = bootPage(null);
  var countries = optionsOf(p, 'fCountry');
  /* Find a country/marketplace pair that is unique to one country. */
  var only = null;
  countries.forEach(function (country) {
    fire(p, 'fCountry', country);
    optionsOf(p, 'fMarketplace').forEach(function (m) {
      var elsewhere = CANON.filter(function (r) {
        return r.marketplace === m && r.country !== country;
      }).length;
      if (only === null && elsewhere === 0) only = { country: country, marketplace: m };
    });
  });
  ok(only !== null, 'B2 the fixture has a marketplace that exists in only one country', only);
  if (only) {
    fire(p, 'fCountry', only.country);
    fire(p, 'fMarketplace', only.marketplace);
    eq(id(p, 'fMarketplace') ? id(p, 'fMarketplace').value : null, only.marketplace,
      'B2a it can be selected');
    var other = countries.filter(function (c) { return c !== only.country; })[0];
    fire(p, 'fCountry', other);
    var nowSel = id(p, 'fMarketplace');
    var nowCtx = id(p, 'fMarketplaceContext');
    var value = nowSel ? nowSel.value : (nowCtx ? nowCtx.textContent : null);
    ok(value !== only.marketplace,
      'B2b and after switching country it is NOT still selected — the stale option is cleared',
      { was: only, nowValue: value, offered: nowSel ? optionsOf(p, 'fMarketplace') : 'context' });
  }
}());

// B3 A CATEGORY THE NEW SITE DOES NOT SELL CANNOT SURVIVE THE SWITCH.
(function () {
  var p = chartPage();
  var chosen = 'Silicone Spatula';
  ok(String(id(p, 'catMore').textContent).indexOf(chosen) === 0,
    'B3 the trigger names the chosen category', id(p, 'catMore').textContent);
  var others = optionsOf(p, 'fCountry').filter(function (c) { return c !== 'US'; });
  fire(p, 'fCountry', others[0]);
  var offered = H.categoryOptionsOffered(p);
  var label = String(id(p, 'catMore').textContent);
  ok(offered.indexOf(chosen) >= 0 ? label.indexOf(chosen) === 0 : label.indexOf(chosen) < 0,
    'B3a after the switch it is kept only if the new site sells it',
    { country: others[0], offered: offered, label: label });
}());

// ===================================================================================================
section('SECTION C  §1.4 ONE OPTION IS A FACT, NOT A DROPDOWN');
// ===================================================================================================
(function () {
  var counts = { company: {}, country: {}, marketplace: {} };
  CANON.forEach(function (r) {
    counts.company[r.company] = 1; counts.country[r.country] = 1;
    counts.marketplace[r.marketplace] = 1;
  });
  console.log('     (this fixture has ' + Object.keys(counts.company).length + ' company, '
    + Object.keys(counts.country).length + ' countries, '
    + Object.keys(counts.marketplace).length + ' marketplaces)');
  var p = bootPage(null);

  // C1 THE SINGLE-VALUED DIMENSION IS READ-ONLY CONTEXT. This fixture has one company.
  eq(Object.keys(counts.company).length, 1, 'C1 the fixture has exactly one company');
  eq(id(p, 'fCompany'), null, 'C1a so there is NO Company dropdown at all');
  var ctx = id(p, 'fCompanyContext');
  ok(!!ctx, 'C1b it is read-only context instead');
  eq(ctx.textContent, Object.keys(counts.company)[0], 'C1c naming the one value', ctx.textContent);
  eq(ctx.localName, 'span', 'C1d as a span — nothing to focus, nothing to open');
  eq(ctx.getAttribute('data-context-for'), 'fCompany',
    'C1e and it says which dimension it stands for');
  /* THE ROW'S RHYTHM SURVIVES: it is still a `.filter-group` with a label. */
  var field = q(p, '.cmd-field--context')[0];
  ok(String(field.className).indexOf('filter-group') >= 0, 'C1f inside a normal filter group');
  ok(q(p, '.cmd-field--context .fl-label').length === 1, 'C1g with its label still there');

  // C2 AND THE STATE AGREES WITH THE SCREEN — no 'ALL' behind a single value.
  ok(String(id(p, 'siteState').getAttribute('data-site-state')).indexOf('COMPLETE') === 0
    || Object.keys(counts.country).length === 1,
    'C2 one company does not leave the scope reading "aggregate"',
    id(p, 'siteState').getAttribute('data-site-state'));

  // C3 A MULTI-VALUED DIMENSION IS STILL A REAL SELECT.
  ok(Object.keys(counts.country).length > 1, 'C3 the fixture has several countries');
  ok(!!id(p, 'fCountry') && id(p, 'fCountry').localName === 'select',
    'C3a so Country is a select');
  eq(id(p, 'fCountryContext'), null, 'C3b and not read-only context');

  // C4 SERIES BECOMES CONTEXT TOO when a category has only one.
  var sole = null;
  var bySeries = {};
  CANON.forEach(function (r) {
    if (r.country !== 'US' || r.marketplace !== 'Amazon') return;
    bySeries[r.category] = bySeries[r.category] || {};
    bySeries[r.category][r.series] = 1;
  });
  Object.keys(bySeries).forEach(function (c) {
    if (sole === null && Object.keys(bySeries[c]).length === 1) sole = c;
  });
  if (sole === null) {
    console.log('     (no US/Amazon category has exactly one series — C4 asserts the rule in code)');
    ok(/return contextField\('fSeries'/.test(SRC.prototype),
      'C4 the single-series case renders context (no category in this fixture exercises it)');
  } else {
    var p2 = chartPage();
    H.pickCategory(p2, sole);
    eq(id(p2, 'fSeries'), null, 'C4 a category with one series shows no Series dropdown', sole);
    ok(!!id(p2, 'fSeriesContext'), 'C4a but names the series as context');
  }
}());

// ===================================================================================================
section('SECTION D  §2 THE SUMMARY — VALUES, NOT AN EXPLANATION OF ITSELF');
// ===================================================================================================
(function () {
  var p = chartPage();
  var sum = id(p, 'scopeSummary');
  ok(!!sum, 'D1 there is a scope summary');
  eq(sum.getAttribute('role'), 'status', 'D1a announced to a screen reader');
  eq(sum.getAttribute('aria-live'), 'polite', 'D1b politely, so it is not shouted on every change');
  var parts = q(p, '#scopeSummary .cmd-sum-part').map(function (n) {
    return n.getAttribute('data-part') + '=' + n.textContent;
  });
  console.log('     (' + sum.textContent + ')');
  var keys = q(p, '#scopeSummary .cmd-sum-part').map(function (n) {
    return n.getAttribute('data-part');
  });
  eq(keys, ['country', 'marketplace', 'category', 'series', 'currency'],
    'D2 country · marketplace · category · series · currency', parts);
  /* COMPANY IS ABSENT BECAUSE IT IS NOT A CHOICE HERE. With one company it is not information, it is
     a word occupying the line every time a person reads it. */
  eq(keys.indexOf('company'), -1,
    'D2a company is omitted while there is only one — §2.4', parts);

  // D3 NO INTERNAL KEYS ON THE LINE.
  ok(sum.textContent.indexOf('|') < 0, 'D3 the site KEY is not on the summary line', sum.textContent);
  ['COMPLETE_SITE', 'AGGREGATE', 'marketplace_skus', 'sku_details', 'siteSkuCount'].forEach(
    function (t, i) {
      ok(sum.textContent.indexOf(t) < 0, 'D3.' + (i + 1) + ' nor "' + t + '"');
    });

  // D4 IT UPDATES IMMEDIATELY.
  var before = sum.textContent;
  var other = optionsOf(p, 'fCountry').filter(function (c) { return c !== 'US'; })[0];
  fire(p, 'fCountry', other);
  var after = id(p, 'scopeSummary').textContent;
  ok(after !== before, 'D4 changing the scope changes the summary at once',
    { before: before, after: after });
  ok(after.indexOf(other) >= 0, 'D4a and it names the new value', after);

  // D5 THE FULL MAPPING IS BEHIND THE `?`, AND IT IS ONE `?`.
  var p2 = chartPage();
  eq(q(p2, '#scopeSummaryRow .info').length, 1, 'D5 the context row has exactly one help icon');
  id(p2, 'info-scope').click();
  var pop = id(p2, 'infopanel-scope');
  ok(!!pop, 'D5a which opens a panel');
  ['marketplace_skus', 'sku_details.category', 'pricing_list.currency'].forEach(function (t, i) {
    ok(pop.textContent.indexOf(t) > 0,
      'D5b.' + (i + 1) + ' the panel names ' + t + ' — the mapping a person asked for');
  });
  ok(pop.textContent.indexOf('Regional Detail') > 0,
    'D5c and the eligibility rule that decides what may be plotted');
  ok(/\|/.test(pop.textContent), 'D5d the site key lives HERE, not on the summary line');
}());

// ===================================================================================================
section('SECTION E  §3 MORE FILTERS — A POPOVER, A COUNT, AND ONE CLOSING RULE');
// ===================================================================================================
(function () {
  var p = chartPage();

  // E1 THE NAME. §3.9 — "Advanced" is developer vocabulary for "the ones we put away".
  var t = id(p, 'moreFiltersToggle');
  ok(!!t, 'E1 there is a More filters control');
  ok(t.textContent.indexOf('More filters') === 0,
    'E1a and it is called "More filters", not "Advanced"', t.textContent);
  ok(bare(SRC.prototype).indexOf('advanced filters') < 0,
    'E1b the words "advanced filters" appear nowhere in the render code');

  // E2 CLOSED BY DEFAULT, AND CLOSED MEANS ABSENT.
  eq(id(p, 'moreFiltersPanel'), null, 'E2 it starts closed — the panel is not in the DOM');
  eq(t.getAttribute('aria-expanded'), 'false', 'E2a and says so');
  eq(t.getAttribute('aria-haspopup'), 'dialog', 'E2b announced as a popover');
  eq(t.getAttribute('aria-controls'), 'moreFiltersPanel', 'E2c pointing at what it owns');

  // E3 IT OVERLAYS RATHER THAN DISPLACES — §3.2, and the whole reason for the change.
  H.openMoreFilters(p);
  var panel = id(p, 'moreFiltersPanel');
  ok(!!panel, 'E3 clicking opens the panel');
  eq(panel.getAttribute('role'), 'dialog', 'E3a as a dialog');
  ok(String(panel.className).indexOf('kmf-panel') >= 0,
    'E3b built from the Operation System `.kmf-panel` primitive', panel.className);
  ok(/\.kmf-panel\s*\{[^}]*position:\s*absolute/.test(SRC.css),
    'E3c which is absolutely positioned, so opening it moves nothing');
  /* AND THE BAR'S OWN STRUCTURE DOES NOT CHANGE when it opens: same two rows, same fields. */
  eq(id(p, 'cmdBar').childNodes.map(function (n) { return n.id; }),
    ['scopeSite', 'scopeSummaryRow'], 'E3d the bar still has its two rows');
  eq(ladderOf(p), ['fCompany', 'fCountry', 'fMarketplace', 'catMore', 'fSeries'],
    'E3e and the same five fields');

  // E4 WHAT IS INSIDE — only the things §3 lists.
  ok(panel.querySelectorAll('#fThreshold').length === 1, 'E4 the price gap threshold is inside');
  ok(panel.querySelectorAll('#fInactive').length === 1, 'E4a and the inactive listings checkbox');
  var labels = panel.querySelectorAll('label').map(function (l) { return l.textContent; });
  ok(labels.join(' ').indexOf('Price gap threshold') >= 0,
    'E4b named "Price gap threshold" — the P1-B2B vocabulary, not "open"', labels);
  ok(panel.textContent.indexOf('Include inactive and discontinued listings') >= 0,
    'E4c and the checkbox says what it includes');

  // E5 THE ACTIVE COUNT IS ON THE BUTTON — §3.4.
  eq(t.getAttribute('data-active-count'), '0', 'E5 no non-default filter, no count');
  eq(id(p, 'moreFiltersCount'), null, 'E5a and no pill');
  fire(p, 'fThreshold', '25');
  var t2 = id(p, 'moreFiltersToggle');
  eq(t2.getAttribute('data-active-count'), '1', 'E5b one non-default condition, count 1');
  ok(!!id(p, 'moreFiltersCount'), 'E5c and the pill appears');
  eq(id(p, 'moreFiltersCount').textContent, '1', 'E5d showing 1');
  ok(String(id(p, 'moreFiltersCount').className).indexOf('km-tab-rail__count') >= 0,
    'E5e reusing the Operation System count pill', id(p, 'moreFiltersCount').className);
  /* TWO CONDITIONS, TWO. */
  var cb = id(p, 'fInactive');
  cb.checked = true;
  cb.dispatchEvent(new p.dom.Event('change', { bubbles: true }));
  eq(id(p, 'moreFiltersToggle').getAttribute('data-active-count'), '2',
    'E5f and a second condition makes it 2');

  // E6 §3.8 — ONE CLOSING RULE: A VALUE CHANGE NEVER CLOSES IT.
  ok(!!id(p, 'moreFiltersPanel'),
    'E6 the panel is STILL open after two value changes — one rule, stated and kept');

  // E7 RESET.
  var reset = id(p, 'moreFiltersReset');
  ok(!!reset, 'E7 there is a Reset filters control');
  reset.click();
  eq(id(p, 'moreFiltersToggle').getAttribute('data-active-count'), '0',
    'E7a resetting clears every non-default condition');
  eq(id(p, 'fThreshold').value, '8.00', 'E7b the threshold is back to its default',
    id(p, 'fThreshold').value);
  eq(id(p, 'fInactive').checked, false, 'E7c and the checkbox is off');
  ok(!!id(p, 'moreFiltersPanel'), 'E7d and the panel stays open, by the same rule as E6');
  eq(id(p, 'moreFiltersReset').disabled, true,
    'E7e with Reset disabled once there is nothing to reset');

  // E8 THE THREE WAYS TO CLOSE — §3.6.
  var p8 = chartPage();
  H.openMoreFilters(p8);
  id(p8, 'moreFiltersToggle').click();
  eq(id(p8, 'moreFiltersPanel'), null, 'E8 the trigger again closes it');
  H.openMoreFilters(p8);
  p8.dom.document.dispatchEvent(new p8.dom.Event('keydown', { key: 'Escape' }));
  eq(id(p8, 'moreFiltersPanel'), null, 'E8a Escape closes it');
  H.openMoreFilters(p8);
  p8.dom.document.dispatchEvent(new p8.dom.Event('click', { bubbles: true }));
  eq(id(p8, 'moreFiltersPanel'), null, 'E8b and a click outside closes it');

  // E9 ONE POPOVER AT A TIME — it shares the single registry the `?` icons use.
  var p9 = chartPage();
  id(p9, 'info-scope').click();
  eq(q(p9, '.info-pop').length, 1, 'E9 a help popover is open');
  H.openMoreFilters(p9);
  eq(q(p9, '.info-pop').length, 0, 'E9a opening More filters closed it');
  ok(!!id(p9, 'moreFiltersPanel'), 'E9b and More filters is the one that is open');
}());

// ===================================================================================================
section('SECTION F  §4 THE STRESS FIXTURE IS NOT IN THE PRODUCT');
// ===================================================================================================
(function () {
  var p = chartPage();

  // F1 NOT IN THE UI, ANYWHERE.
  eq(id(p, 'fStress'), null, 'F1 there is no stress-fixture control on the page');
  ok(p.dom.document.body.textContent.indexOf('stress fixture') < 0,
    'F1a and the words do not appear on screen');
  ok(p.dom.document.body.textContent.indexOf('density test') < 0, 'F1b nor "density test"');

  // F2 NOT IN MORE FILTERS EITHER — §4.2 says so explicitly.
  H.openMoreFilters(p);
  var panel = id(p, 'moreFiltersPanel');
  ok(panel.querySelectorAll('#fStress').length === 0, 'F2 it is not hidden inside More filters');
  ok(panel.textContent.toLowerCase().indexOf('stress') < 0, 'F2a not even by name');

  // F3 NO HOOK ON A NORMAL LOAD — §4.5.
  eq(H.devHookPresent(p), false, 'F3 the developer hook does not exist on a normal load');
  eq(H.useStressFixture(p), false, 'F3a so a caller cannot switch the adapter');
  eq(id(p, 'devStrip'), null, 'F3b and there is no developer strip');

  // F4 NO URL PARAMETER — §4.6. A link is forwardable, so a query string is how one person's
  // debugging becomes another person's screenshot.
  var src = bare(SRC.prototype);
  ['location.search', 'URLSearchParams', 'location.href', 'window.location'].forEach(function (t, i) {
    ok(src.indexOf(t) < 0, 'F4.' + (i + 1) + ' the page never reads ' + t);
  });

  // F5 IT IS REACHABLE ONLY WHEN DEVELOPER MODE WAS SET BEFORE THE SCRIPTS RAN — §4.4.
  var d = chartPage({ devMode: true });
  eq(H.devHookPresent(d), true, 'F5 developer mode defines the hook');
  ok(!!id(d, 'devStrip'), 'F5a and shows a labelled strip, so nobody is in it by accident');
  ok(id(d, 'devStrip').textContent.indexOf('DEVELOPER MODE') >= 0, 'F5b saying what it is');
  eq(H.useStressFixture(d), true, 'F5c and the fixture can be loaded');
  ok(id(d, 'devStrip').textContent.indexOf('not data from anywhere') >= 0,
    'F5d with the loaded fixture described as invented, not as data');

  // F6 AND IT REALLY IS THE STRESS FIXTURE — 44 products, so the tests that need density still can.
  H.pickCategory(d, 'Electric Can Opener');
  eq(q(d, '.col').length, 44, 'F6 forty-four products are on the chart', q(d, '.col').length);

  // F7 PREVIEW AND PRODUCTION STAY SEPARATE — §4.7. The banner never stops saying so.
  eq(id(p, 'notice').textContent,
    'Preview data — not connected to Operation System Database',
    'F7 the preview notice is unchanged and unconditional');
  ok(!!id(p, 'banner'), 'F7a in a banner that is never re-rendered');
}());

// ===================================================================================================
section('SECTION G  §5 THE MEETING SCENARIO IS A DRAWER, AND IT OWNS NO GEOMETRY');
// ===================================================================================================
(function () {
  var p = chartPage();

  // G1 THE COMMAND BAR SHOWS ONE BUTTON AND ONE CHIP.
  var btn = id(p, 'meetingToggle');
  ok(!!btn, 'G1 there is a Meeting scenario button');
  eq(btn.textContent, 'Meeting scenario', 'G1a named exactly that', btn.textContent);
  ok(String(btn.className).indexOf('btn-quiet') >= 0,
    'G1b as a QUIET secondary — not the shared `.btn-secondary`, which is a filled green primary',
    btn.className);
  ok(String(btn.className).indexOf('btn-secondary') < 0, 'G1c so it is not a green pill');
  eq(btn.getAttribute('aria-controls'), 'scenarioDrawer', 'G1d pointing at the drawer');

  // G2 THE CHIP IS CONTEXT, NOT A CONTROL — §6 files scenario status under Context.
  var chip = id(p, 'scenarioChip');
  ok(!!chip, 'G2 there is a scenario status chip');
  eq(chip.localName, 'span', 'G2a it is a span — nothing to press');
  eq(chip.getAttribute('role'), 'status', 'G2b announced as status');
  eq(chip.getAttribute('data-active'), 'false', 'G2c inactive to begin with');
  eq(chip.textContent, 'No scenario', 'G2d saying so in words');
  ok(id(p, 'scopeSummaryRow').querySelectorAll('#scenarioChip').length === 1,
    'G2e and it lives on the CONTEXT row, beside the summary');

  // G3 CLOSED TO BEGIN WITH.
  var d = id(p, 'scenarioDrawer');
  ok(!!d, 'G3 the drawer exists in the DOM');
  eq(d.hidden, true, 'G3a hidden');
  eq(d.getAttribute('data-open'), 'false', 'G3b and says so');
  eq(btn.getAttribute('aria-expanded'), 'false', 'G3c as does the button');

  // G4 IT IS position:fixed, WHICH IS THE WHOLE GEOMETRY GUARANTEE.
  ok(/\.scn-drawer\s*\{[^}]*position:\s*fixed/.test(SRC.css),
    'G4 the drawer is position:fixed — out of flow, so it cannot resize the chart');
  ok(/\.scn-drawer\s*\{[^}]*right:\s*0/.test(SRC.css), 'G4a anchored to the right — §5');

  // G5 OPENING IT.
  btn.click();
  var d2 = id(p, 'scenarioDrawer');
  eq(d2.hidden, false, 'G5 clicking opens it');
  eq(d2.getAttribute('data-open'), 'true', 'G5a and says so');
  eq(id(p, 'meetingToggle').getAttribute('aria-expanded'), 'true', 'G5b as does the button');

  // G6 THE FORM, IN §5's ORDER.
  var order = ['scenarioContext', 'scenarioRow', 'scValue', 'scApply', 'scUndo', 'scenarioNote'];
  var seen = q(p, '#scenarioDrawerBody [id]').map(function (n) { return n.id; })
    .filter(function (i) { return order.indexOf(i) >= 0; });
  eq(seen, order,
    'G6 site context → series/price/adjustment → amount → Apply → Undo → the unsaved explanation',
    seen);
  ok(q(p, '#scenarioRow #scSeries').length + q(p, '#scenarioRow select').length >= 3,
    'G6a the row holds the series, the price to simulate and the adjustment',
    q(p, '#scenarioRow select').length);
  ok(id(p, 'scenarioNote').textContent.indexOf('cleared by a reload') > 0,
    'G6b and the explanation says the scenario is not saved',
    id(p, 'scenarioNote').textContent);

  // G7 IT DOES NOT COVER THE CHART CONTROLS — §5. The drawer is 420px of a wide screen, and the
  // controls it must not cover are asserted to still be reachable.
  ['mode-auto', 'mode-comfortable', 'layersToggle', 'drawerToggle'].forEach(function (c, i) {
    ok(!!id(p, c), 'G7.' + (i + 1) + ' ' + c + ' is still on the page with the drawer open');
  });

  // G8 CLOSING IS NOT CLEARING — §5.
  var chart = q(p, '.chart')[0];
  var boxBefore = chart.getAttribute('viewBox');
  id(p, 'scenarioDrawerClose').click();
  eq(id(p, 'scenarioDrawer').hidden, true, 'G8 the close button closes it');
  eq(q(p, '.chart')[0].getAttribute('viewBox'), boxBefore,
    'G8a and the chart geometry is untouched by opening and closing');

  // G9 A SCENARIO SURVIVES THE DRAWER CLOSING.
  var p9 = chartPage();
  id(p9, 'meetingToggle').click();
  var sSeries = id(p9, 'scSeries');
  if (sSeries) {
    var vals = q(p9, '#scSeries option').map(function (o) { return o.getAttribute('value'); })
      .filter(function (v) { return v !== ''; });
    fire(p9, 'scSeries', vals[0]);
    fire(p9, 'scValue', '9.99');
    id(p9, 'scApply').click();
    var activeAfterApply = id(p9, 'scenarioChip').getAttribute('data-active');
    eq(activeAfterApply, 'true', 'G9 applying a scenario marks the chip active');
    var countPill = id(p9, 'scenarioChipCount');
    ok(!!countPill, 'G9a and the chip carries the affected listing count');
    ok(Number(countPill.getAttribute('data-listings')) > 0,
      'G9b which is greater than zero', countPill.getAttribute('data-listings'));
    id(p9, 'scenarioDrawerClose').click();
    eq(id(p9, 'scenarioDrawer').hidden, true, 'G9c closing the drawer');
    eq(id(p9, 'scenarioChip').getAttribute('data-active'), 'true',
      'G9d does NOT clear the scenario — the chip is still active');
    ok(!!id(p9, 'scenarioPrintMark'),
      'G9e and the banner still declares that a simulated number is on screen');
  } else {
    ok(false, 'G9 the drawer has a series control to drive');
  }

  // G10 A RELOAD DOES CLEAR IT — and nothing is written anywhere that could survive one.
  var srcBare = bare(SRC.prototype);
  ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'google.script.run',
    'fetch(', 'XMLHttpRequest'].forEach(function (t, i) {
    ok(srcBare.indexOf(t) < 0, 'G10.' + (i + 1) + ' the page never touches ' + t);
  });
  var fresh = chartPage();
  eq(id(fresh, 'scenarioChip').getAttribute('data-active'), 'false',
    'G10a so a fresh load starts with no scenario');
  ok(/SCENARIO_SURVIVES_RELOAD = false/.test(SRC.selectors)
    || /survives_reload/.test(SRC.selectors),
    'G10b and the pipeline declares that a scenario does not survive a reload');
}());

// ===================================================================================================
section('SECTION H  §7 THE STRUCTURAL FACTS BEHIND THE HEIGHT');
// ===================================================================================================
/*
 * The shim has no layout engine. These assert the things that MADE the old bar 422px — four cards,
 * a nested card, a displacing band, a control that grows — and the media queries that carry the
 * three widths. The pixels themselves are measured in Chrome and recorded in design freeze §39.
 */
(function () {
  var p = chartPage();

  // H1 ONE ROW OF FIELDS AND ONE CONTEXT ROW. Four headings are gone.
  eq(q(p, '#cmdBar .cmdbar-row').length, 2, 'H1 the bar has exactly two rows');
  eq(q(p, '#scopeFields .cmd-field').length, 5, 'H1a and five fields in the first');
  /* NO HEADING PER SECTION. Four `<h*>` in the control area is what four cards looked like. */
  eq(q(p, '#cmdBar h1').length + q(p, '#cmdBar h2').length + q(p, '#cmdBar h3').length, 0,
    'H1b with no heading of its own — the labels are the headings');

  // H2 THE CATEGORY CONTROL IS ONE TRIGGER, whatever the category count.
  eq(id(p, 'categoryControl').getAttribute('data-shape'), 'menu',
    'H2 the category control is the single-trigger menu');
  eq(q(p, '#catBar .catbtn').length, 1, 'H2a one button in the bar');
  var d = chartPage({ devMode: true });
  H.useStressFixture(d);
  eq(id(d, 'categoryControl').getAttribute('data-count'), '12',
    'H2b twelve categories …');
  eq(q(d, '#catBar .catbtn').length, 1, 'H2c … and still one button');

  /* H3 THE THREE WIDTHS ARE DECLARED — and the BLOCK is extracted rather than matched through a
     character window. A `[\s\S]{0,900}` window is a brittle way to ask "is this rule inside that
     media query": it passes or fails on how long the comments are, which is not a property of the
     layout. Reading the block and searching inside it asks the real question. */
  function mediaBlock(px) {
    var open = SRC.css.indexOf('@media (max-width: ' + px + 'px) {');
    if (open < 0) return null;
    var i2 = SRC.css.indexOf('{', open), depth = 0;
    for (var j = i2; j < SRC.css.length; j++) {
      if (SRC.css[j] === '{') depth++;
      else if (SRC.css[j] === '}') { depth--; if (depth === 0) return SRC.css.slice(open, j + 1); }
    }
    return null;
  }
  var m1400 = mediaBlock(1400), m820 = mediaBlock(820);
  ok(!!m1400, 'H3 there is a rule for the 1400px width');
  ok(!!m820, 'H3a and one for 820px');
  ok(m1400 && m1400.indexOf('.cmd-field') >= 0,
    'H3b the 1400 rule narrows the fields, so the ladder stays at two rows');
  ok(m820 && /[.]cmd-field[{ ][^}]*flex: 0 0 auto/.test(m820),
    'H3e and the row flex-basis is cleared, so it cannot become a height in a column',
    m820 && (m820.match(/[.]cmd-field[^{]*[{][^}]*[}]/g) || []).join(' | '));

  // H4 THE 38px CONTROL HEIGHT IS NEVER TRADED AWAY — §7's last line.
  ok(/\.cmd-field--context \.cmd-context-value\s*\{[^}]*height:\s*var\(--filter-height\)/
    .test(SRC.css), 'H4 read-only context is the same height as a control');
  ok(/\.kmf-trigger\s*\{[^}]*height:\s*var\(--filter-height\)/.test(SRC.css),
    'H4a so is the popover trigger');
  ok(/\.catbtn\.is-more\s*\{[^}]*height:\s*var\(--filter-height\)/.test(SRC.css),
    'H4b and so is the category trigger — the height target is met by deleting furniture');

  // H5 THE DRAWER AND THE POPOVER ARE BOTH OUT OF FLOW, so neither can add to the bar.
  ok(/\.kmf-panel\s*\{[^}]*position:\s*absolute/.test(SRC.css), 'H5 the popover is absolute');
  ok(/\.scn-drawer\s*\{[^}]*position:\s*fixed/.test(SRC.css), 'H5a the drawer is fixed');

  // H6 PRINT PUTS THE FIXED DRAWER BACK IN FLOW — the P1-B2C correction, applied to the new overlay.
  var printBlock = /@media print \{[\s\S]*?\n\}/g;
  var prints = SRC.css.match(/@media print \{[\s\S]*?\n\}/g) || [];
  ok(prints.join('\n').indexOf('.scn-drawer') >= 0,
    'H6 a print block makes the drawer static rather than covering the first page');
  ok(prints.join('\n').indexOf('.cmd-tools') >= 0,
    'H6a and drops the two entrances, which do nothing on paper');
}());

// ===================================================================================================
section('SECTION I  §8 WHAT IS REUSED, AND WHAT THE SHARED LAYER DOES NOT HAVE');
// ===================================================================================================
(function () {
  var p = chartPage();
  var base = fs.readFileSync(path.join(H.ROOT, 'assets', 'css', 'base.css'), 'utf8');
  var comp = fs.readFileSync(path.join(H.ROOT, 'assets', 'css', 'components.css'), 'utf8');

  // I1 THE COPIED TOKENS STILL MATCH base.css, VALUE FOR VALUE — including the three added this round.
  var protoTokens = fs.readFileSync(path.join(H.PROTO, 'prototype-tokens.css'), 'utf8');
  var mism = [];
  ['--filter-height', '--filter-border-radius', '--filter-border-color', '--filter-padding-inline',
    '--filter-padding-block', '--filter-font-size', '--filter-text-color', '--filter-gap',
    '--filter-panel-radius', '--filter-option-font-size', '--filter-option-padding',
    '--filter-search-font-size', '--filter-muted-color', '--filter-label-font-size',
    '--filter-label-color', '--filter-chevron-size', '--filter-chevron-color', '--filter-panel-z',
    '--btn-height', '--radius-sm', '--radius-md', '--radius-lg'].forEach(function (tok) {
    /* P1-B8A — read from the PROTOTYPE SHIM, which is where the copy lives now. It was in
       assets/css/product-strategy-board.css until this round; there it was redefining tokens that
       index.html already defines via base.css, on every page in the application. */
    var a = new RegExp(tok.replace(/-/g, '\\-') + ':\\s*([^;]+);').exec(protoTokens);
    var b = new RegExp(tok.replace(/-/g, '\\-') + ':\\s*([^;]+);').exec(base);
    if (!a || !b) { mism.push(tok + ' MISSING'); return; }
    if (a[1].trim().split(/\s+\/\*/)[0].trim() !== b[1].trim().split(/\s+\/\*/)[0].trim()) {
      mism.push(tok + ': proto ' + a[1].trim() + ' vs base ' + b[1].trim());
    }
  });
  eq(mism, [], 'I1 every copied token equals the value in assets/css/base.css', mism);
  /* AND THE PRODUCTION SHEET CARRIES NO COPY AT ALL. */
  ok(!/(^|\n)\s*:root\s*\{/.test(SRC.css),
    'I1a while the production stylesheet declares no :root block, so it redefines nothing');

  // I2 THE POPOVER PRIMITIVE IS THE SHARED ONE, copied rule for rule.
  ['.kmf {', '.kmf-trigger {', '.kmf-panel {', '.kmf-panel--right', '.kmf-tools', '.kmf-link']
    .forEach(function (sel, i) {
      ok(SRC.css.indexOf(sel) >= 0, 'I2.' + (i + 1) + ' the prototype carries ' + sel);
      ok(comp.indexOf(sel) >= 0, 'I2.' + (i + 1) + 'a and components.css is where it comes from');
    });
  /* THE ONE VALUE THAT MUST NOT DRIFT: the panel is absolute in both. */
  ok(/\.kmf-panel\s*\{[^}]*position:\s*absolute/.test(comp),
    'I2a the shared sheet agrees that the panel is absolute');

  // I3 THE COUNT PILL IS THE SHARED ONE.
  ok(comp.indexOf('.km-tab-rail__count') >= 0, 'I3 `.km-tab-rail__count` is an Operation System class');
  H.openMoreFilters(p);
  fire(p, 'fThreshold', '25');
  ok(String(id(p, 'moreFiltersCount').className).indexOf('km-tab-rail__count') >= 0,
    'I3a and the active-filter count uses it');

  // I4 WHY THE REAL STYLESHEETS ARE NOT LOADED — measured, and it is a finding for the merge.
  ok(/^\s*button\s*\{/m.test(comp), 'I4 components.css styles the bare `button` element');
  var btnRule = /\n\s*button\s*\{[\s\S]*?\}/.exec(comp);
  ok(!!btnRule && /background:\s*var\(--soft-green\)/.test(btnRule[0]),
    'I4a with a solid green background — every button on a page that loads it turns green',
    btnRule && btnRule[0].slice(0, 120));
  ok(/body\s*\{[\s\S]*?overflow:\s*hidden/.test(base),
    'I4b and base.css sets `body { overflow: hidden }`, which would kill page scrolling');
  /* SO THE PROTOTYPE DOES NOT LOAD THEM, and says why rather than pretending it is aligned. */
  var indexHtml = fs.readFileSync(path.join(H.PROTO, 'index.html'), 'utf8');
  /* P1-B8A — TWO NOW: the prototype-only token shim, then the board's own sheet. The count matters
     less than what is NOT in the list, which I4e still checks. */
  eq((indexHtml.match(/<link[^>]+rel="stylesheet"/g) || []).length, 2,
    'I4c the prototype loads two stylesheets — its token shim and the board\'s own');
  ok(indexHtml.indexOf('prototype-tokens.css') >= 0,
    'I4c1 the first is the prototype-only shim, which lives beside it and not in assets/css');
  ok(indexHtml.indexOf('assets/css/product-strategy-board.css') >= 0,
    'I4d and it is the PROMOTED board stylesheet, the same one the production page loads');
  /* THE RULE WAS NEVER ABOUT THE DIRECTORY. It is about these two files: components.css styles the
     bare `button` element solid green, base.css sets `body { overflow: hidden }`, and either one
     loaded beside a page that did not expect it breaks that page. P1-B5 moved the board's own
     stylesheet into assets/css, so naming the directory would now forbid the promotion instead of
     the hazard. */
  /* READ THE LINKS, NOT THE PROSE. P1-B8A added a comment to the prototype's head explaining WHY
     it cannot link base.css — and a bare string search for "base.css" found the explanation and
     called it a defect. The same trap P1-B2C's G18 documents for `requestFullscreen`, sprung again
     in a different file: a probe that greps the whole document cannot tell a link from a sentence
     about a link. */
  var protoHrefs = (indexHtml.match(/<link[^>]+rel="stylesheet"[^>]*>/g) || [])
    .map(function (t) { return (t.match(/href="([^"]+)"/) || [])[1] || ''; });
  eq(protoHrefs.filter(function (h) { return /(^|\/)(base|components)\.css$/.test(h); }), [],
    'I4e and it still does not load either shared sheet, which cannot be loaded a la carte');
  /* AND THE SHIM MUST NOT BECOME A BACK DOOR FOR THEM. */
  var shimSrc = fs.readFileSync(path.join(H.PROTO, 'prototype-tokens.css'), 'utf8');
  ok(shimSrc.indexOf('@import') < 0,
    'I4f nor does the shim @import them, which would reintroduce both hazards through the side door');

  // I5 THERE IS NO SHARED DRAWER, AND NO SHARED STATUS CHIP. Recorded, not papered over.
  ok(comp.indexOf('.drawer') < 0 && !/--drawer-/.test(base + comp),
    'I5 components.css has no shared drawer and there is no --drawer-* token');
  var pages = fs.readdirSync(path.join(H.ROOT, 'assets', 'css', 'pages'));
  var localDrawers = pages.filter(function (f) {
    return fs.readFileSync(path.join(H.ROOT, 'assets', 'css', 'pages', f), 'utf8')
      .indexOf('drawer') >= 0;
  });
  ok(localDrawers.length >= 3,
    'I5a while at least three PAGES define their own — which is the gap', localDrawers);
  ok(!/--badge-/.test(base + comp),
    'I5b and there is no --badge-* token set either, so the status chip is local too');

  // I6 `.btn-secondary` IS NOT A SECONDARY BUTTON — the finding that changed what this round used.
  var sec = /\.btn-secondary\s*\{[\s\S]*?\}/.exec(comp);
  ok(!!sec, 'I6 components.css defines `.btn-secondary`');
  ok(/background:\s*var\(--soft-green\)/.test(sec[0]),
    'I6a and it is a SOLID GREEN FILL, not a quiet secondary', sec[0].slice(0, 90));
  ok(/padding:\s*0\.8rem 1\.5rem/.test(sec[0]) && /border-radius:\s*8px/.test(sec[0]),
    'I6b with literal padding and radius that override `.btn`\'s own --btn-* tokens');
  ok(bare(SRC.prototype).indexOf('btn-secondary') < 0,
    'I6c so this round uses `.btn-quiet` instead, and the gap is recorded');
}());

// ===================================================================================================
section('SECTION J  §6 INFORMATION HIERARCHY, AND WHAT IS NOT IN THE OPERATING FLOW');
// ===================================================================================================
(function () {
  var p = chartPage();
  var barText = id(p, 'cmdBar').textContent;

  // J1 DEVELOPER-ONLY INFORMATION IS NOT IN THE BAR.
  ['MSKU:', 'marketplace_sku_id', 'PSB_', 'adapter', 'schema', 'data-contract', 'self-test']
    .forEach(function (t, i) {
      ok(barText.indexOf(t) < 0, 'J1.' + (i + 1) + ' "' + t + '" is not in the command bar');
    });

  // J2 THE SELF-TEST DETAIL IS BEHIND A CONTROL, not on the page.
  ok(!!id(p, 'selftest'), 'J2 the self-test section exists');
  eq(id(p, 'selftest').hidden, true, 'J2a and starts hidden');
  ok(!!id(p, 'btnStDetail'), 'J2b behind an explicit "details" control');

  // J3 PRIMARY / SECONDARY / CONTEXT, BY PLACEMENT.
  eq(q(p, '#scopeFields .cmd-field').length, 5, 'J3 five primary fields');
  /* The shim has no child combinator, and it does not need one here: the tools group holds exactly
     its two children and nothing nests inside it. */
  eq(id(p, 'cmdTools').childNodes.length, 2,
    'J3a two secondary entrances', id(p, 'cmdTools').childNodes.map(function (n) { return n.id; }));
  var ctxRow = id(p, 'scopeSummaryRow');
  ok(ctxRow.querySelectorAll('#scopeSummary').length === 1
    && ctxRow.querySelectorAll('#siteState').length === 1
    && ctxRow.querySelectorAll('#scenarioChip').length === 1,
    'J3b and the context row carries the summary, the counts and the scenario status');

  // J4 THE ACTIVE FILTER COUNT IS CONTEXT TOO — on the control it describes.
  H.openMoreFilters(p);
  fire(p, 'fThreshold', '25');
  ok(id(p, 'moreFiltersToggle').querySelectorAll('#moreFiltersCount').length === 1,
    'J4 the active-filter count is on the More filters button itself');
}());

// ===================================================================================================
section('SECTION K  §9 KEYBOARD, TOUCH AND ARIA');
// ===================================================================================================
(function () {
  var p = chartPage();

  // K1 EVERY CONTROL IS A REAL CONTROL, so Enter and Space already work.
  ['moreFiltersToggle', 'meetingToggle', 'scenarioDrawerClose', 'catMore'].forEach(function (c, i) {
    var n = id(p, c);
    ok(!!n && n.localName === 'button',
      'K1.' + (i + 1) + ' #' + c + ' is a <button>', n && n.localName);
    ok(!n.getAttribute('tabindex') || n.getAttribute('tabindex') !== '-1',
      'K1.' + (i + 1) + 'a and is reachable by keyboard');
  });

  // K2 THE POPOVER AND THE DRAWER ANNOUNCE THEIR STATE.
  eq(id(p, 'moreFiltersToggle').getAttribute('aria-expanded'), 'false', 'K2 aria-expanded false');
  H.openMoreFilters(p);
  eq(id(p, 'moreFiltersToggle').getAttribute('aria-expanded'), 'true', 'K2a and true when open');
  eq(id(p, 'moreFiltersPanel').getAttribute('role'), 'dialog', 'K2b the panel is a dialog');
  eq(id(p, 'moreFiltersPanel').getAttribute('aria-label'), 'More filters', 'K2c with a name');
  eq(id(p, 'scenarioDrawer').getAttribute('aria-label'), 'Meeting scenario',
    'K2d and the drawer has one too');

  // K3 ESCAPE ON THE CONTROL ITSELF, not only on the document.
  var p3 = chartPage();
  H.openMoreFilters(p3);
  id(p3, 'moreFiltersToggle').dispatchEvent(new p3.dom.Event('keydown', { key: 'Escape' }));
  eq(id(p3, 'moreFiltersPanel'), null, 'K3 Escape on the trigger closes the popover');

  // K4 ESCAPE DOES **NOT** THROW AWAY THE DRAWER. A workspace is not a popover: a person halfway
  // through typing a price should not lose the form to a stray key.
  var p4 = chartPage();
  id(p4, 'meetingToggle').click();
  p4.dom.document.dispatchEvent(new p4.dom.Event('keydown', { key: 'Escape' }));
  eq(id(p4, 'scenarioDrawer').hidden, false,
    'K4 Escape leaves the drawer open — it closes popovers, not workspaces');
  ok(/the drawer is deliberately NOT in this set/.test(SRC.prototype),
    'K4a and the code says that is deliberate');

  // K5 TOUCH: the targets are not smaller than the shared control height.
  ok(/\.kmf-trigger\s*\{[^}]*height:\s*var\(--filter-height\)/.test(SRC.css),
    'K5 the popover trigger is a full 38px tall');
  ok(/\.scn-drawer-close\s*\{[^}]*(width:\s*30px|height:\s*30px)/.test(SRC.css),
    'K5a and the drawer close button is a 30px square, not an 12px glyph');

  // K6 THE CHIP IS NOT A FAKE BUTTON — §5 and §9 of P1-B2C's lesson about pressable-looking labels.
  var chip = id(p, 'scenarioChip');
  eq(chip.localName, 'span', 'K6 the status chip is a span');
  eq(chip.getAttribute('tabindex'), null, 'K6a with no tab stop');
  eq(chip.getAttribute('onclick'), null, 'K6b and no click handler attribute');
}());

// ===================================================================================================
console.log('\n=== MUTANTS ===');
// ===================================================================================================

mut('M1 the two entrances rejoin the field row, so the ladder and the tools fight for the width',
  function () {
    /* MEASURED HARM. While `.cmd-fields` grew to the full row, the tools wrapped onto a second line
       and the primary row came to 194px instead of 57px. Putting the entrances back INSIDE the
       wrapping field container reproduces exactly that: they become two more things competing for
       the same space, and the bar grows a row. */
    var m = withProto(swap('    row1.appendChild(tools);', '    ladder.appendChild(tools);'));
    function toolsInFields(pg) {
      if (pg.thrown) return 'THREW';
      return pg.dom.document.getElementById('scopeFields')
        .querySelectorAll('#moreFiltersToggle').length;
    }
    return toolsInFields(bootPage(null)) === 0 && toolsInFields(m) === 1;
  });

mut('M2 the ladder stops narrowing by the tier above it, so a country offers every marketplace',
  function () {
    var m = withProto(swap(
      '      for (var i = 0; i < above.length; i++) {\n'
      + '        var k = above[i];\n'
      + "        if (STATE[k] !== 'ALL' && String(r[k]) !== String(STATE[k])) return;\n"
      + '      }',
      '      for (var i = 0; i < 0; i++) { }'));
    /* READ WHICHEVER SHAPE IS THERE. DE sells on exactly one marketplace, so the clean page renders
       read-only CONTEXT with no <option> elements — an options-only reader saw nothing on the clean
       side and the comparison never reached the mutant. A mutant that cannot see the clean state
       cannot say anything about the dirty one. */
    function marketplacesFor(pg, country) {
      if (pg.thrown) return 'THREW';
      var doc = pg.dom.document;
      var c = doc.getElementById('fCountry');
      c.value = country;
      c.dispatchEvent(new pg.dom.Event('change', { bubbles: true }));
      var opts = doc.querySelectorAll('#fMarketplace option')
        .map(function (o) { return o.getAttribute('value'); })
        .filter(function (v) { return v !== 'ALL'; });
      if (opts.length) return opts.sort().join(',');
      var ctx = doc.getElementById('fMarketplaceContext');
      return ctx ? ctx.textContent : '';
    }
    /* DE sells on Amazon only in this fixture; a global menu would offer Walmart as well. */
    var clean = marketplacesFor(bootPage(null), 'DE');
    var dirty = marketplacesFor(m, 'DE');
    return clean === 'Amazon' && dirty !== clean;
  });

mut('M3 a single-option dimension goes back to being a one-item dropdown', function () {
  var m = withProto(swap('    if (values.length === 1) {', '    if (values.length === 0) {'));
  function shape(pg) {
    if (pg.thrown) return 'THREW';
    var doc = pg.dom.document;
    if (doc.getElementById('fCompany')) return 'SELECT';
    if (doc.getElementById('fCompanyContext')) return 'CONTEXT';
    return 'NEITHER';
  }
  return shape(bootPage(null)) === 'CONTEXT' && shape(m) === 'SELECT';
});

mut('M4 More filters closes itself whenever a value changes, so setting two is two round trips',
  function () {
    /* §3.8 asks for ONE consistent rule. The rule chosen is "a value change never closes it"; this
       adopts the other one, and the cost is measurable — the panel is gone after a single edit. */
    var m = withProto(swap(
      "      if (c !== null && c > 0) STATE.thresholdC = c;\n      render();",
      "      if (c !== null && c > 0) STATE.thresholdC = c;\n"
      + "      STATE.moreFiltersOpen = false;\n      render();"));
    function stillOpen(pg) {
      if (pg.thrown) return 'THREW';
      H.pickCategory(pg, 'Silicone Spatula');
      H.openMoreFilters(pg);
      var i2 = pg.dom.document.getElementById('fThreshold');
      i2.value = '25';
      i2.dispatchEvent(new pg.dom.Event('change', { bubbles: true }));
      return pg.dom.document.getElementById('moreFiltersPanel') !== null;
    }
    return stillOpen(bootPage(null)) === true && stillOpen(m) === false;
  });

mut('M5 the active-filter count stops counting, so a filter you cannot see stays set', function () {
  var m = withProto(swap('    if (STATE.thresholdC !== DEFAULT_THRESHOLD_C) n++;',
    '    if (false) n++;'));
  function countAfterThreshold(pg) {
    if (pg.thrown) return 'THREW';
    H.pickCategory(pg, 'Silicone Spatula');
    H.openMoreFilters(pg);
    var i2 = pg.dom.document.getElementById('fThreshold');
    i2.value = '25';
    i2.dispatchEvent(new pg.dom.Event('change', { bubbles: true }));
    return pg.dom.document.getElementById('moreFiltersToggle').getAttribute('data-active-count');
  }
  return countAfterThreshold(bootPage(null)) === '1' && countAfterThreshold(m) === '0';
});

mut('M6 Reset filters resets the threshold but forgets the checkbox', function () {
  var m = withProto(swap("      STATE.includeInactive = false;\n      STATE.currency = 'ALL';",
    "      STATE.currency = 'ALL';"));
  function afterReset(pg) {
    if (pg.thrown) return 'THREW';
    H.pickCategory(pg, 'Silicone Spatula');
    H.openMoreFilters(pg);
    var cb = pg.dom.document.getElementById('fInactive');
    cb.checked = true;
    cb.dispatchEvent(new pg.dom.Event('change', { bubbles: true }));
    pg.dom.document.getElementById('moreFiltersReset').click();
    return pg.dom.document.getElementById('moreFiltersToggle').getAttribute('data-active-count');
  }
  return afterReset(bootPage(null)) === '0' && afterReset(m) === '1';
});

mut('M7 the stress fixture comes back within reach on a normal load', function () {
  /* The harm is one misclick from a meeting shown invented data. The defence is that the control does
     not exist AND the hook is undefined without developer mode; this mutant opens the gate. */
  var m = withProto(swap(
    '  function devModeOn() {\n'
    + "    return typeof window !== 'undefined' && window && window.__PSB_DEV_MODE__ === true;\n"
    + '  }',
    '  function devModeOn() { return true; }'));
  function reachable(pg) {
    if (pg.thrown) return 'THREW';
    return (pg.dom.document.getElementById('devStrip') !== null)
      || (typeof pg.ctx.__psbUseStressFixture === 'function');
  }
  return reachable(bootPage(null)) === false && reachable(m) === true;
});

mut('M8 the drawer joins the layout, so opening a scenario moves every price', function () {
  var m = withProto(swap(
    "    var d = el('aside', 'scn-drawer' + (STATE.meetingOpen ? ' is-open' : ''));",
    "    var d = el('aside', 'scn-inline' + (STATE.meetingOpen ? ' is-open' : ''));"));
  /* THE CLASS IS WHAT TAKES IT OUT OF FLOW. Dropping `.scn-drawer` drops `position: fixed` with it,
     and the drawer becomes a block in the document — which is the 422px layout coming back. The shim
     has no layout engine, so what is observable here is the class the page publishes; the geometry
     itself was measured in Chrome (design freeze §39: viewBox, every data-cy and the view width all
     identical with the drawer open). */
  function cls(pg) {
    if (pg.thrown) return 'THREW';
    H.pickCategory(pg, 'Silicone Spatula');
    pg.dom.document.getElementById('meetingToggle').click();
    return String(pg.dom.document.getElementById('scenarioDrawer').className);
  }
  var clean = cls(bootPage(null)), dirty = cls(m);
  return clean.indexOf('scn-drawer') >= 0 && dirty.indexOf('scn-drawer') < 0
    && /\.scn-drawer\s*\{[^}]*position:\s*fixed/.test(SRC.css);
});

mut('M9 closing the drawer clears the scenario, so putting a panel away undoes the work',
  function () {
    var m = withProto(swap('      STATE.meetingOpen = false;\n      render();\n    });\n'
      + '    head.appendChild(close);',
      '      STATE.meetingOpen = false;\n      STATE.overrides = {};\n      render();\n    });\n'
      + '    head.appendChild(close);'));
    function activeAfterClose(pg) {
      if (pg.thrown) return 'THREW';
      H.pickCategory(pg, 'Silicone Spatula');
      var doc = pg.dom.document;
      doc.getElementById('meetingToggle').click();
      var vals = doc.querySelectorAll('#scSeries option')
        .map(function (o) { return o.getAttribute('value'); })
        .filter(function (v) { return v !== ''; });
      if (!vals.length) return 'NO_SERIES';
      var sSel = doc.getElementById('scSeries');
      sSel.value = vals[0];
      sSel.dispatchEvent(new pg.dom.Event('change', { bubbles: true }));
      var v = doc.getElementById('scValue');
      v.value = '9.99';
      v.dispatchEvent(new pg.dom.Event('change', { bubbles: true }));
      doc.getElementById('scApply').click();
      if (doc.getElementById('scenarioChip').getAttribute('data-active') !== 'true') {
        return 'DID_NOT_APPLY';
      }
      doc.getElementById('scenarioDrawerClose').click();
      return doc.getElementById('scenarioChip').getAttribute('data-active');
    }
    return activeAfterClose(bootPage(null)) === 'true' && activeAfterClose(m) === 'false';
  });

mut('M10 the chip stops reporting how many listings are simulated', function () {
  var m = withProto(swap(
    "    rows.forEach(function (r) { if (r && r._scenario && r._scenario.active) n++; });",
    '    rows.forEach(function (r) { if (false) n++; });'));
  function listings(pg) {
    if (pg.thrown) return 'THREW';
    H.pickCategory(pg, 'Silicone Spatula');
    var doc = pg.dom.document;
    doc.getElementById('meetingToggle').click();
    var vals = doc.querySelectorAll('#scSeries option')
      .map(function (o) { return o.getAttribute('value'); })
      .filter(function (v) { return v !== ''; });
    if (!vals.length) return 'NO_SERIES';
    var sSel = doc.getElementById('scSeries');
    sSel.value = vals[0];
    sSel.dispatchEvent(new pg.dom.Event('change', { bubbles: true }));
    var v = doc.getElementById('scValue');
    v.value = '9.99';
    v.dispatchEvent(new pg.dom.Event('change', { bubbles: true }));
    doc.getElementById('scApply').click();
    var c = doc.getElementById('scenarioChipCount');
    return c ? c.getAttribute('data-listings') : 'NONE';
  }
  var clean = listings(bootPage(null)), dirty = listings(m);
  return Number(clean) > 0 && dirty === '0';
});

mut('M11 the summary prints the internal site key instead of the values', function () {
  var m = withProto(swap(
    "    parts.push({ k: 'country', t: STATE.country === 'ALL' ? 'All countries' : STATE.country });",
    "    parts.push({ k: 'country', t: site.key });"));
  function summary(pg) {
    if (pg.thrown) return 'THREW';
    H.pickCategory(pg, 'Silicone Spatula');
    return pg.dom.document.getElementById('scopeSummary').textContent;
  }
  var clean = summary(bootPage(null)), dirty = summary(m);
  return clean.indexOf('|') < 0 && dirty.indexOf('|') >= 0;
});

mut('M12 Escape closes the drawer, so a half-typed price is thrown away by a stray key', function () {
  var m = withProto(swap("      STATE.moreFiltersOpen = false;\n    }",
    "      STATE.moreFiltersOpen = false;\n      STATE.meetingOpen = false;\n    }"));
  function openAfterEsc(pg) {
    if (pg.thrown) return 'THREW';
    H.pickCategory(pg, 'Silicone Spatula');
    var doc = pg.dom.document;
    doc.getElementById('meetingToggle').click();
    doc.getElementById('info-scope').click();
    doc.dispatchEvent(new pg.dom.Event('keydown', { key: 'Escape' }));
    return doc.getElementById('scenarioDrawer').hidden === false;
  }
  return openAfterEsc(bootPage(null)) === true && openAfterEsc(m) === false;
});

console.log('\npassed ' + pass + '  failed ' + fail
  + '  |  mutants caught ' + mutCaught + '  survived ' + mutSurvived);
process.exit(fail ? 1 : 0);
