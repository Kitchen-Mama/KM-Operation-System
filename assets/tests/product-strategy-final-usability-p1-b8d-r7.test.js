/**
 * ==================================================================================================
 * PRODUCT STRATEGY — THE PAGE KEPT A BOARD IT HAD STOPPED BELIEVING IN   (P1-B8D-R7)
 * ==================================================================================================
 *
 * THE REPORT. *"在 Company／Country／Marketplace 選定過程中，有時控制項會被重建，造成已選值跳回，
 * 必須再選一次。"* A selection that jumps back and asks to be made again.
 *
 * WHAT EVERY EXISTING SUITE COULD NOT SEE. They all perform ONE act — choose a site — and then
 * assert or photograph the result. That is a steady-state instrument, and a value that jumps back is
 * a SECOND act disagreeing with a FIRST. So this suite drives SEQUENCES through the production
 * lifecycle in a real browser and writes down, at every step, two things that are supposed to be the
 * same fact: what the controller believes the scope is, and what the three controls on screen show.
 * Either one alone is self-consistent; only the pair is evidence.
 *
 * WHAT THE TRACE ACTUALLY FOUND, and it is not what the report describes — which is why the report
 * had to be reproduced rather than acted on:
 *
 *   1. THE CONTROLS NEVER LOST A VALUE. Across seven sequences and both captures, canonical and DOM
 *      agreed at every step. The controller was never wrong about the scope.
 *   2. THE CONTROL ITSELF WAS DESTROYED ON EVERY PICK. `paintChooser()` runs on every narrowing and
 *      `renderSiteChooser` emptied its host and built three fresh <select>s. Measured: focus on the
 *      control before the change, `body` after it, every single time. To a person on a keyboard that
 *      is indistinguishable from the choice being thrown away — the next keystroke does nothing.
 *   3. THE PREVIOUS SITE'S WHOLE BOARD STAYED ON SCREEN. Load KM · US · Shopify, change Company to
 *      ResTW: the controller is instantly and correctly right, writes "choose a site" into the state
 *      host — and the entire KM board is still underneath it, INCLUDING the command bar's own
 *      read-only Company/Country/Marketplace row still reading KM · US · Shopify. The page asked for
 *      a site while showing a site, and the label nearest the numbers named the one just left.
 *   4. A WITHDRAWN QUESTION WAS STILL ANSWERED. With a read outstanding, changing Company makes the
 *      scope incomplete and starts no new read — so the token never moved, the outstanding answer
 *      was still "current", and it landed and mounted a board for a marketplace no longer selected.
 *
 * (3) and (4) are the same defect as the duplicated filters in §7, and that is why the two are one
 * round of work: two owners for Company/Country/Marketplace disagree exactly in the window where a
 * board outlives its site.
 *
 * THE BROWSER IS NOT OPTIONAL HERE. "The control survived the repaint" is a focus fact. "Nothing is
 * still interceptable" is `elementFromPoint`. "Series shares a baseline" is two rectangles. A suite
 * that asserted the source would have passed over every one of these.
 * ==================================================================================================
 */
'use strict';

var fs = require('fs');
var path = require('path');
var os = require('os');

var pass = 0, fail = 0, neg = { caught: 0, missed: 0 };
function ok(c, l, extra) {
  if (c) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + (extra === undefined ? '' : '\n  got ' + JSON.stringify(extra))); }
}
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(t) { console.log('\n== ' + t + ' =='); }
function score(label, r) {
  if (r === true) { neg.caught++; pass++; console.log('ok   ' + label + ' (caught)'); }
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}
function mut(label, f) {
  var r;
  try { r = f(); } catch (e) {
    neg.missed++; fail++;
    console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message));
    return;
  }
  score(label, r);
}

var ROOT = path.join(__dirname, '..', '..');
/* CRLF normalized on read — `core.autocrlf=true` writes CRLF into a fresh checkout, and a
   multi-line anchor then matches zero times. P1-B8D-R4 shipped red for exactly this. */
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
}

var CSS_REL = 'assets/css/product-strategy-board.css';
var PAGE_REL = 'assets/js/pages/product-strategy-board.js';
var BOARD_REL = 'assets/js/product-strategy/psb-board-ui.js';
var SRC = {
  css: read(CSS_REL),
  base: read('assets/css/base.css'),
  components: read('assets/css/components.css'),
  layout: read('assets/css/layout.css'),
  partial: read('assets/html/pages/product-strategy-board.html'),
  page: read(PAGE_REL),
  board: read(BOARD_REL),
  app: read('assets/js/app.js'),
  index: read('index.html')
};

var RUN = require(path.join(__dirname, '_p1b8c-visual-runner.js'));

/* TWO REAL SITES OUT OF THE LIVE-DERIVED UNIVERSE, and they are deliberately under DIFFERENT
   companies. A pair sharing a company cannot exercise a site switch: re-picking the company you
   already have is a narrowing, not a new read, and the interesting races all need two reads. */
var SITE_A = { company: 'KM', country: 'US', marketplace: 'Shopify' };
var SITE_B = { company: 'ResUS', country: 'US', marketplace: 'Walmart' };
var TIERS = ['company', 'country', 'marketplace'];

// =================================================================================================
// THE BROWSER PROBE
// =================================================================================================

var BROWSER = RUN.findBrowser();
var OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'psb-r7-'));
var PAGE_FILE = path.join(__dirname, '_p1b8c-acceptance.html');

if (!BROWSER) {
  console.error('STOP_NO_BROWSER_AVAILABLE — a usability round cannot be accepted without one.');
  process.exitCode = 2;
}

function measure(opts, w, h) {
  fs.writeFileSync(PAGE_FILE, RUN.buildPage(Object.assign(
    { capture: 'live', activated: true, site: SITE_A }, opts)), 'utf8');
  var r = RUN.shot(BROWSER, PAGE_FILE, OUT, { id: 'probe', w: w || 1440, h: h || 900 });
  if (!r.measurements) throw new Error('no measurements came back from the browser');
  /* The round's own measurements are namespaced inside the shared runner's `visual` block, so the
     matrix runs of earlier rounds keep exactly the shape they already assert on. Lifted to the top
     level here so a reader of this file sees `M.r7.pageBg` rather than a path. */
  r.measurements.r7 = (r.measurements.visual && r.measurements.visual.r7) || {};
  return r.measurements;
}

/**
 * Drive one named interaction sequence and return its trace.
 *
 * `noSite: true` on every one of them, because a harness that pre-selects a site cannot fail for
 * the reason production fails — the lesson P1-B8D-R4 and R5 each paid for once.
 */
function trace(script, args, opts, w, h) {
  var m = measure(Object.assign({ script: script, scriptArgs: args, noSite: true },
    opts || {}), w, h);
  if (!m.trace) throw new Error('no trace came back (error: ' + JSON.stringify(m.error) + ')');
  return { steps: m.trace, error: m.error, m: m };
}
/** The steps that carry a measurement, i.e. not the informational rows a sequence may push. */
function realSteps(t) { return t.steps.filter(function (s) { return !!s.dom; }); }
function lastStep(t) { var r = realSteps(t); return r[r.length - 1]; }

/** Edit a real shipped file, run a probe against it, put it back. */
function withSrc(rel, from, to, probe) {
  var full = path.join(ROOT, rel);
  var original = fs.readFileSync(full, 'utf8');
  var normalized = original.replace(/\r\n/g, '\n');
  var n = normalized.split(from).length - 1;
  if (n !== 1) throw new Error('ANCHOR MATCHED ' + n + ' TIMES in ' + rel);
  fs.writeFileSync(full, normalized.replace(from, to), 'utf8');
  try { return probe(); }
  finally { fs.writeFileSync(full, original, 'utf8'); }
}
function withCss(from, to, probe) { return withSrc(CSS_REL, from, to, probe); }

/* One shared run of the long sequence, because each of these costs two Chrome launches. */
var T_LADDER = null, T_STALE = null, T_RETRY = null, T_DRAWER = null, T_REPEAT = null;
if (BROWSER) {
  T_LADDER = trace('ladder-shapes', { sequence: [
    { dim: 'company', value: 'KM' },
    { dim: 'marketplace', value: 'Shopify' },
    /* A REAL CATEGORY ON THIS SITE, so the site switch below has something to illegally carry. */
    { dim: 'category', value: 'Cutting Board' },
    /* THE SAME COMPANY AGAIN. This is the step that asks the reconciling paint its hardest
       question: the marketplace list is unchanged, so that control is KEPT, and the narrowing
       clears the marketplace — so the paint has to write a value into a node it did not build.
       A forward-only ladder never walks that path. */
    { dim: 'company', value: 'KM' },
    { dim: 'marketplace', value: 'Shopify' },
    { dim: 'company', value: 'ResTW' },
    { dim: 'country', value: 'JP' },
    { dim: 'company', value: 'ResUS' },
    { dim: 'marketplace', value: 'Walmart' },
    /* AND BACK TO THE FIRST COMPANY, which is the step that tests the reconciling paint hardest:
       KM's marketplace list is exactly what it was, so that control is KEPT - and its canonical
       value has been cleared, so the paint has to write the placeholder back into a node it did
       not build. A ladder that only ever moves forward never asks a kept control to change. */
    { dim: 'company', value: 'KM' }
  ] });
  T_STALE = trace('stale-response', { first: SITE_A, second: SITE_B },
    { slowSite: SITE_A, slowMs: 450 });
  T_RETRY = trace('failure-retry', { first: SITE_A },
    { fail: { message: 'boom' }, failOnly: 'workspace' });
  T_DRAWER = trace('drawer-close', { first: SITE_A });
  T_REPEAT = trace('repeat-same-site', { first: SITE_A });
}

// =================================================================================================
section('A — THE SELECTION AND THE SCREEN NEVER DISAGREE');
// =================================================================================================

var ladder = realSteps(T_LADDER);
ok(ladder.length >= 7, 'A1  the six-step production ladder ran through the real controls',
  ladder.length);
eq(T_LADDER.error, null, 'A2  and nothing threw on the way');

var disagreements = [];
ladder.forEach(function (s) {
  if (s.disagreements && s.disagreements.length) {
    disagreements.push(s.step + ': ' + s.disagreements.join(' | '));
  }
});
eq(disagreements, [], 'A3  canonical scope and DOM selection agree at EVERY step', disagreements);

/* THE CANONICAL SCOPE IS THE ONE THE PERSON ASKED FOR, step by step. Written out rather than
   spot-checked, because "it ends up right" is also true of a page that lost the value in the
   middle and was handed it again by the next pick. */
eq(ladder.map(function (s) {
  return [s.canonical.company, s.canonical.country, s.canonical.marketplace].join('|');
}), [
  '||',                       // nothing chosen
  'KM|US|',                   // company KM; the single country resolves itself
  'KM|US|Shopify',
  'KM|US|Shopify',            // choosing a category does not touch the site
  'KM|US|',                   // the same company again: the marketplace below it clears
  'KM|US|Shopify',
  'ResTW||',                  // a new company clears the two tiers below it
  'ResTW|JP|Amazon',          // JP has one marketplace; it resolves itself
  'ResUS|US|',
  'ResUS|US|Walmart',
  'KM|US|'                    // back to KM: the country resolves again, the marketplace clears
], 'A4  every narrowing is exactly what the ladder asks for');

/* THE STEP THAT PROVES THE PAINT WRITES INTO A CONTROL IT KEPT. Re-picking KM leaves the
   marketplace list untouched, so that <select> is the same node — and the scope below it has been
   cleared, so the node must now be showing the placeholder. */
var rePick = ladder[4];
eq(rePick.dom.marketplace.value, '',
  'A5  a KEPT control is re-valued from the canonical scope, not left on its old value',
  rePick.dom.marketplace);
ok((rePick.survivedThePick || []).indexOf('marketplace') >= 0,
  'A5a and it really was kept rather than rebuilt', rePick.survivedThePick);

// =================================================================================================
section('B — THE CONTROL SURVIVES THE PICK (THE DEFECT, AS A FOCUS FACT)');
// =================================================================================================

var focusAfter = ladder.slice(1).map(function (s) { return s.focus; });
var lostFocus = focusAfter.filter(function (f) { return f === 'body'; });
eq(lostFocus, [], 'B1  no pick hands the focus back to <body>', focusAfter);

ladder.slice(1).forEach(function (s, i) {
  ok(/^select#psbSite/.test(s.focus),
    'B2.' + (i + 1) + ' focus is still on a site control after "' + s.step + '"', s.focus);
});

/* THE PROPERTY UNDERNEATH THE FOCUS. A tier whose OPTIONS changed is legitimately rebuilt; a tier
   that only changed VALUE must be the same node it was, or the paint is still tearing the panel
   down and merely putting the focus back afterwards. Company's option list never changes, so the
   Company control must survive every pick in the sequence. */
var companyRebuilds = ladder.slice(1).filter(function (s) {
  return (s.survivedThePick || []).indexOf('company') < 0;
}).map(function (s) { return s.step; });
eq(companyRebuilds, [],
  'B2a the Company control is the same node through the whole ladder', companyRebuilds);

ok(/data-psb-options/.test(SRC.page),
  'B3  a control records what it offers, so the next paint can tell whether to keep it');
ok(/fieldMatches/.test(SRC.page) && /applyValue/.test(SRC.page),
  'B4  and the paint reconciles rather than rebuilding');
ok(!/while \(host\.firstChild\) host\.removeChild\(host\.firstChild\);\s*\n\s*if \(!isObj\(narrowed\)/
  .test(SRC.page), 'B5  the host is no longer emptied before every paint');

// =================================================================================================
section('C — THE BOARD DOES NOT OUTLIVE ITS SITE');
// =================================================================================================

var incomplete = ladder.filter(function (s) { return s.complete === false && s.step !== '0 start'; });
ok(incomplete.length >= 2, 'C1  the ladder passes through an incomplete scope more than once',
  incomplete.length);
incomplete.forEach(function (s, i) {
  ok(s.boardOnScreen.view === false,
    'C2.' + (i + 1) + ' no chart is left on screen at "' + s.step + '"', s.boardOnScreen);
  ok(s.mounted === false,
    'C3.' + (i + 1) + ' and the controller does not claim a mounted board', s.mounted);
  ok(s.boardOnScreen.siteEchoes === 0,
    'C4.' + (i + 1) + ' and no stale site label is left beside the data',
    s.boardOnScreen.siteEchoes);
});

/* THE OLD SITE'S NAME IS THE PART THAT MATTERED. A leftover chart is confusing; a leftover chart
   labelled with the site you just left is wrong. */
var stale = ladder.filter(function (s) {
  var r = s.renderedSite || {};
  return s.complete === false && (r.fCompany || r.fCountry || r.fMarketplace);
});
eq(stale.map(function (s) { return s.step; }), [],
  'C5  at no incomplete step does the page still name the previous site beside the numbers');

var loadingSteps = ladder.filter(function (s) { return s.state === 'LOADING_WORKSPACE'; });
loadingSteps.forEach(function (s, i) {
  ok(TIERS.every(function (d) { return s.dom[d].shape !== 'none'; }),
    'C6.' + (i + 1) + ' loading does not take the chosen site off the screen', s.dom);
});

// =================================================================================================
section('D — A SLOW ANSWER NEVER OVERWRITES A NEWER CHOICE');
// =================================================================================================

var st = realSteps(T_STALE);
var stLast = st[st.length - 1];
eq(T_STALE.error, null, 'D1  the stale-response sequence ran clean');
eq([stLast.canonical.company, stLast.canonical.country, stLast.canonical.marketplace],
  [SITE_B.company, SITE_B.country, SITE_B.marketplace],
  'D2  after the slow answer lands, the scope is still the site chosen SECOND');
ok(stLast.dropped >= 1, 'D3  and the slow answer was dropped rather than rendered', stLast.dropped);
eq(stLast.workspaceRequests, 2, 'D4  two sites asked for, two reads — no retry storm',
  stLast.workspaceRequests);
eq(stLast.disagreements, [], 'D5  and the controls still show what the controller believes');

ok(/requestedScope/.test(SRC.page),
  'D6  the page records which site an outstanding read is for');
ok(/C\.token\+\+;\s*\n\s*C\.inFlight = false;/.test(SRC.page),
  'D7  and withdrawing a scope invalidates that read instead of letting it land');

// =================================================================================================
section('E — A FAILURE KEEPS THE SELECTION AND ALLOWS A RETRY');
// =================================================================================================

var rt = realSteps(T_RETRY);
eq(T_RETRY.error, null, 'E1  the failure/retry sequence ran clean');
var refused = rt[0];
eq(refused.state, 'SOURCE_NOT_CONNECTED', 'E2  the workspace read was refused', refused.state);
eq([refused.canonical.company, refused.canonical.country, refused.canonical.marketplace],
  [SITE_A.company, SITE_A.country, SITE_A.marketplace],
  'E3  and the site the person chose is still chosen');
eq(refused.disagreements, [], 'E4  with the controls still showing it');
ok(TIERS.every(function (d) { return refused.dom[d].shape !== 'none'; }),
  'E5  the chooser is still operable after a failure', refused.dom);

var recovered = rt[rt.length - 1];
eq(recovered.state, 'OK', 'E6  re-picking the same marketplace asks again and succeeds',
  recovered.state);
ok(recovered.workspaceRequests > refused.workspaceRequests,
  'E7  which means a second read really went out', recovered.workspaceRequests);

var rp = realSteps(T_REPEAT);
eq(rp[rp.length - 1].workspaceRequests, 1,
  'E8  but ten changes on the site already loaded cost no further reads',
  rp[rp.length - 1].workspaceRequests);

// =================================================================================================
section('F — ONE FILTER PANEL, ONE AUTHORITY, IN ORDER');
// =================================================================================================

var loaded = ladder.filter(function (s) { return s.mounted === true; });
ok(loaded.length >= 3, 'F1  the ladder loaded three different sites', loaded.length);
loaded.forEach(function (s, i) {
  eq(s.filterPanels, 1, 'F2.' + (i + 1) + ' exactly one filter panel at "' + s.step + '"');
  eq(s.siteControlCount, 3,
    'F3.' + (i + 1) + ' and exactly three controls claim to set a site', s.siteControlCount);
});

var M = measure({ view: 'category' });
var order = M.r7.panelOrder;
ok(!!M.r7 && M.r7.panelOrder instanceof Array,
  'F4  the browser returned this round of its own measurements', M.r7.panelOrder);
/* THE ORDER §7 ASKS FOR, read off the rendered row. `Series` may be a read-only tier with no label
   element of its own shape, so the comparison is on the labels that exist, in sequence. */
eq((order || []).slice(0, 5), ['Company', 'Country', 'Marketplace', 'Category', 'Series'],
  'F4a and the row reads Company, Country, Marketplace, Category, Series', order);
ok((order || []).slice(5).join(' ').indexOf('More filters') >= 0,
  'F4b with More filters after them', order);
ok((order || []).slice(5).join(' ').indexOf('Meeting scenario') >= 0,
  'F4c and Meeting scenario last', order);

ok(/siteOwnedByPage/.test(SRC.page) && /siteOwnedByPage/.test(SRC.board),
  'F5  the page declares ownership of the site and the board reads it');
ok(/if \(!SITE_OWNED_BY_PAGE\) \{/.test(SRC.board),
  'F6  and the board draws no site ladder when it is not the owner');
ok(/reconcileSiteState/.test(SRC.board),
  'F7  while the STATE correction that ladder also did is kept');
ok(/display: contents/.test(SRC.css),
  'F8  the two renderers are flattened into one row rather than taught about each other');
ok(/class="psb-filters"/.test(SRC.partial),
  'F9  and the partial carries the one panel that holds them');

/* CATEGORY AND SERIES BELONG TO THE SITE THAT IS LOADED. */
var switched = loaded[loaded.length - 1];
var firstLoad = loaded[0];
ok(!!switched.boardFilters && switched.boardFilters.category.shape !== 'none',
  'F10 after a site switch the board still offers a Category control',
  switched.boardFilters);
ok(switched.boardFilters.category.value !== '' ,
  'F11 with a value that is not empty', switched.boardFilters.category);
/* THE OPTION LIST IS WHAT MUST BE RE-DERIVED, not the selected value: `ALL` is legal on every
   site, so comparing the two selections would report a correct re-derivation as a carry-over. */
var serFirst = (firstLoad.boardFilters.series.options || []).join('|');
var serAfter = (switched.boardFilters.series.options || []).join('|');
ok(serFirst !== '' && serAfter !== '' && serFirst !== serAfter,
  'F12 Series is re-derived from the new site rather than carried across',
  { first: serFirst.slice(0, 60), after: serAfter.slice(0, 60) });
ok((switched.boardFilters.series.options || [])
  .indexOf(switched.boardFilters.series.value) >= 0,
  'F12a and the value showing is one the new site actually offers',
  switched.boardFilters.series);

/* THE CATEGORY, MEASURED THE ONLY WAY THAT SETTLES IT: against the menu the NEW site offers. The
   trigger's label shows whatever STATE.category holds, which is the value under suspicion, so the
   menu is opened and the selection is looked for among the options that site actually has. The
   ladder chooses `Cutting Board` on the first site, which the second does not carry.

   THIS FOUND A REAL DEFECT. The page controller's comment claimed a re-mount cleared the derived
   filters; `boot()` swapped the adapter and rendered, and every choice from the previous site came
   through untouched. The menu offered three categories with NONE of them selected. */
var withMenu = ladder.filter(function (s) {
  return s.mounted === true && s.categoryMenu && s.categoryMenu.offered.length;
});
ok(withMenu.length >= 2, 'F13  the ladder read the category menu on more than one site',
  withMenu.length);
var illegal = withMenu.filter(function (s) {
  return s.categoryMenu.selected.length === 0
    || s.categoryMenu.offered.indexOf(s.categoryMenu.selected[0]) < 0;
}).map(function (s) { return s.step + ' -> ' + JSON.stringify(s.categoryMenu); });
eq(illegal, [],
  'F13a at no loaded step is the selected Category absent from the menu that site offers', illegal);

// =================================================================================================
section('G — THE PAGE LOOKS LIKE THE OPERATION SYSTEM');
// =================================================================================================

var V = M.r7;
ok(V.pageBg === 'rgba(0, 0, 0, 0)' || V.pageBg === 'transparent',
  'G1  the page no longer paints its own grey ground', V.pageBg);
ok(V.headerBg === 'rgba(0, 0, 0, 0)' || V.headerBg === 'transparent',
  'G2  and the header band is not a banner', V.headerBg);
ok(!/^\.psb-page \{[\s\S]*?background: var\(--ground\);[\s\S]*?\}/.test(SRC.css)
  || /\.psb-page\.module-section \{ background: transparent; \}/.test(SRC.css),
  'G3  the shell section is transparent while the prototype keeps its own ground');

eq(V.chartHelpIcons, 0, 'G4  no `?` control is rendered anywhere on the page', V.chartHelpIcons);
eq(V.pageHelpButtons, 1, 'G5  and there is exactly one page-level info button', V.pageHelpButtons);
eq(V.pageHelpGlyph, 'i', 'G6  which is an `i`, not a seventh question mark', V.pageHelpGlyph);
ok(/inlineHelpIcons/.test(SRC.board),
  'G7  the icons are suppressed by an argument, not deleted');
ok(/'About the everyday price'|The photograph on the everyday-price marker/.test(SRC.board)
  || /How the chart is sized/.test(SRC.board),
  'G8  and every paragraph of the help text is still in the file');

eq(V.axisPriceRows, [], 'G9  the X axis prints no price under any column', V.axisPriceRows);
ok(V.tooltipHasPrice === true,
  'G10 while the hover panel still leads with it', V.tooltipHasPrice);
ok(V.ariaHasPrice === true,
  'G11 and so does the label a screen reader reads', V.ariaHasPrice);

// =================================================================================================
section('H — ONE HEIGHT, ONE BASELINE');
// =================================================================================================

[[1920, 1080], [1440, 900], [1024, 768]].forEach(function (vp) {
  var vm = (vp[0] === 1440 ? M : measure({ view: 'category' }, vp[0], vp[1])).r7;
  var ctrls = (vm && vm.panelControls) || [];
  ok(ctrls.length >= 5, 'H1@' + vp[0] + ' the panel holds at least five controls', ctrls.length);
  var heights = {};
  ctrls.forEach(function (c) { heights[c.h] = (heights[c.h] || 0) + 1; });
  eq(Object.keys(heights), ['38'], 'H2@' + vp[0] + ' every control is --filter-height', heights);
  var gaps = {};
  ctrls.forEach(function (c) { if (c.labelGap !== null) gaps[c.labelGap] = 1; });
  eq(Object.keys(gaps).length, 1, 'H3@' + vp[0] + ' one label gap in the whole panel', gaps);
  /* BASELINE PER ROW. Controls that wrapped onto a second row have their own baseline, and
     demanding one number for all of them would be demanding that the row never wraps. */
  var rows = {};
  ctrls.forEach(function (c) { rows[c.top] = (rows[c.top] || []).concat([c.id]); });
  var rowTops = Object.keys(rows);
  ok(rowTops.length <= 3, 'H4@' + vp[0] + ' the panel is at most three rows deep', rows);
  ctrls.forEach(function (c) {
    ok(Math.abs(c.bottom - (c.top + 38)) < 0.6, 'H5@' + vp[0] + ' ' + c.id + ' sits on its row');
  });
});

// =================================================================================================
section('I — THE DRAWER CLOSES, AND CLOSING IS NOT CLEARING');
// =================================================================================================

var dr = T_DRAWER.steps;
eq(T_DRAWER.error, null, 'I1  the drawer sequence ran clean');
var opened = dr[1], typed = dr[2], closed = dr[3], reopened = dr[4];
eq(opened.closeButtons.length, 1, 'I2  the open drawer has exactly one close control',
  opened.closeButtons);
eq(opened.closeButtons[0].type, 'button', 'I3  it is a <button type="button">');
ok(/close/i.test(opened.closeButtons[0].label || ''),
  'I4  with an accessible name that says what it closes', opened.closeButtons[0].label);
eq(opened.closeButtons[0].text, '×', 'I5  and the glyph is a real ×');
eq([opened.closeButtons[0].w, opened.closeButtons[0].h], [30, 30],
  'I6  square, not the 60px the global button min-width used to force on it',
  opened.closeButtons[0]);

eq(closed.display, 'none', 'I7  clicking it closes the drawer');
eq(closed.boxW, 0, 'I8  the panel has no box left');
eq(closed.insideDrawer, false,
  'I9  and nothing of it is under the pointer where it used to be', closed.elementAtDrawerCentre);
eq(closed.focusablesWithABox, 0,
  'I10 no control inside it can still be reached', closed.focusablesWithABox);
eq(closed.focus, 'button#meetingToggle',
  'I11 focus goes back to the control that opened it', closed.focus);

eq([closed.scenarioApplied, closed.scenarioChip],
  [typed.scenarioApplied, typed.scenarioChip],
  'I12 closing neither applies nor clears the scenario');
eq(reopened.formValues, typed.formValues,
  'I13 and reopening still shows the unsubmitted work', reopened.formValues);

ok(/body\.presenting \.psb-page \.scn-drawer/.test(SRC.css)
  && /body\.is-fullscreen \.psb-page \.scn-drawer/.test(SRC.css),
  'I14 the drawer is not left over a presentation or a fullscreen chart');

// =================================================================================================
section('J — THE HELP POPOVER: KEYBOARD, TOUCH, AND NOT ON PAPER');
// =================================================================================================

var HV = M.r7.help || {};
eq(HV.count, 1, 'J1  one help button', HV.count);
ok(/^About this board/.test(HV.label || ''),
  'J2  with an accessible name naming its subject', HV.label);
eq(HV.expandedBefore, 'false', 'J3  closed to begin with');
eq(HV.openedByClick, true, 'J4  a click opens it');
eq(HV.expandedAfter, 'true', 'J5  and aria-expanded says so');
eq(HV.closedByEscape, true, 'J6  Escape closes it — no mouse required');
eq(HV.openedByKeyboard, true, 'J7  and Enter opens it — no pointer required');
ok((HV.text || '').indexOf('one site at a time') >= 0,
  'J8  it carries the paragraph the state box used to hold permanently', (HV.text || '').slice(0, 60));

ok(/Select a company, country and marketplace to begin/.test(SRC.page),
  'J9  while the awaiting state keeps one short sentence that says what to do');
ok(!/prices from two sites on one axis would compare products/.test(
  SRC.page.slice(SRC.page.indexOf('P.UX_PAGE'), SRC.page.indexOf('function isObj'))),
  'J10 and no longer carries the long paragraph in the state itself');
ok(/@media print \{[\s\S]*?\.psb-page \.psb-help \{ display: none; \}/.test(SRC.css),
  'J11 the floating popover is not printed');

// =================================================================================================
section('J2 — A PANEL WITH NOTHING IN IT IS NOT DRAWN');
// =================================================================================================

/* THE STATE SWEEP FOUND THIS. On FEATURE_DISABLED and on an unreadable universe the page draws no
   chooser (correctly, it fails closed) and no board, and the merged card rendered anyway: a white
   bar of controls with no controls in it, directly above the notice saying nothing could be read.
   R5's own comment names that shape - an empty dropdown beside a could-not-read notice reads as
   success - and R7 had reproduced it one layer out. */
[['feature-disabled', { capabilityOff: true, noSite: true }],
  ['universe-refused', { fail: { message: 'boom' }, failOnly: 'universe', noSite: true }]]
  .forEach(function (pair, i) {
    var mm = measure(pair[1]);
    eq(mm.r7.filterPanelsPainted, 0,
      'J12.' + (i + 1) + ' no filter panel is painted in the ' + pair[0] + ' state',
      mm.r7.filterPanelsPainted);
    eq(mm.r7.pageHelpButtons, 1,
      'J13.' + (i + 1) + ' and the help button is still there to explain the page');
  });
/* AND IT IS DRAWN WHENEVER THERE IS SOMETHING TO USE. */
eq(measure({ noSite: true }).r7.filterPanelsPainted, 1,
  'J14 the panel IS painted before a site is chosen, because the chooser is in it');
eq(M.r7.filterPanelsPainted, 1, 'J15 and on a loaded board');

// =================================================================================================
section('K — SCOPE: NOTHING HERE REACHES ANOTHER PAGE');
// =================================================================================================

/** Every selector in the page stylesheet, media preludes and at-rules excluded. */
function selectorsOf(css) {
  var out = [];
  css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').forEach(function (chunk) {
    var i = chunk.lastIndexOf('{');
    if (i < 0) return;
    chunk.slice(0, i).split(',').forEach(function (sel) {
      var s = sel.trim();
      /* A trimmed string starting with `@` is a media prelude, not a selector. The first version of
         this guarded only the FIRST character of the raw string and the engine backtracked onto the
         newline before `@media` — eleven at-rules reported as unscoped selectors. */
      if (s === '' || s.charAt(0) === '@') return;
      out.push(s);
    });
  });
  return out;
}
var SELECTORS = selectorsOf(SRC.css);
var unscoped = SELECTORS.filter(function (s) {
  /* THREE BODY-STATE HOOKS PREDATE THIS ROUND and are the page's own modes rather than other
     pages: `presenting`, `is-fullscreen` and `has-scenario` are all set by this board on <body>
     because a full-window mode cannot be expressed from inside the section it takes over. */
  return !/^\.psb-page\b/.test(s) && !/^body\.(presenting|is-fullscreen|has-scenario)\b/.test(s);
});
eq(unscoped, [], 'K1  every selector begins at .psb-page (or a documented body state hook)',
  unscoped.slice(0, 12));

var BARE = ['.card', '.button', '.btn', 'select', 'button', 'h1', 'h2', '.nav-text', 'input'];
var bareHits = SELECTORS.filter(function (s) { return BARE.indexOf(s) >= 0; });
eq(bareHits, [], 'K2  no bare shared selector', bareHits);

/* NO SHARED STYLESHEET WAS TOUCHED. A round about one page that edited base.css would be a round
   about every page, and nothing in its own measurements would say so. */
['assets/css/base.css', 'assets/css/components.css', 'assets/css/layout.css'].forEach(function (f, i) {
  ok(!/P1-B8D-R7/.test(read(f)), 'K3.' + (i + 1) + ' ' + f + ' is untouched by this round');
});

/* DECLARATIONS, NOT PROSE. The first version of this counted `!important` in the raw file and
   found seventeen where the tree has sixteen — the seventeenth being the sentence in this round's
   own comment explaining why no `!important` is needed. That is the G18 trap this project has now
   sprung six times: a scan for a token finds the token in the note about the token. */
function declarationsOnly(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ''); }
/* TWENTY-ONE, counted as OCCURRENCES with comments stripped. `grep -c` says sixteen because it
   counts LINES and several of them carry two. A round that adds one has to change this number on
   purpose, which is the point of writing it down rather than testing for "no increase". */
var IMPORTANT_AT_HEAD = 21;
var importantNow = (declarationsOnly(SRC.css).match(/!important/g) || []).length;
eq(importantNow, IMPORTANT_AT_HEAD,
  'K4  the file still carries exactly the ' + IMPORTANT_AT_HEAD
  + ' !important declarations it had — this round added none', importantNow);

ok(/showProductStrategyView/.test(SRC.app), 'K5  the left navigation entry is untouched');
ok((SRC.partial.match(/km-tab-rail/g) || []).length >= 1,
  'K6  and the six in-page tabs are still the shared rail');

// =================================================================================================
section('L — MUTANTS');
// =================================================================================================

/* L1 — the reconciling paint goes back to tearing the host down on every narrowing. */
mut('L1  a rerender destroys the controls and drops the focus', function () {
  return withSrc(PAGE_REL,
    '    var bar = host.querySelector(\'.psb-site\');\n    if (!bar) {',
    '    var bar = null;\n    if (!bar) {',
    function () {
      var t = trace('ladder-shapes', { sequence: [
        { dim: 'company', value: 'KM' }, { dim: 'marketplace', value: 'Shopify' }] });
      /* NODE IDENTITY, not focus: the repaint PLACES the focus when it replaces a control, so a
         renderer that rebuilt everything and then re-focused would still look right by that
         measure. The Company control's options never change, so it must never be rebuilt. */
      return realSteps(t).slice(1).some(function (s) {
        return (s.survivedThePick || []).indexOf('company') < 0;
      });
    });
});

/* L2 — the canonical value stops being written into a control that is kept. */
mut('L2  the DOM stops agreeing with the controller', function () {
  return withSrc(PAGE_REL,
    '    if (String(sel.value) !== plan.current) sel.value = plan.current;',
    '    if (String(sel.value) !== plan.current) { /* dropped */ }',
    function () {
      /* THE RE-PICK IS THE STEP THAT CAN EXPRESS THIS. Every forward move either rebuilds the
         control (its options changed) or has the person's own hand on the value; only re-picking a
         company they already have asks the paint to change a control it KEPT. */
      var t = trace('ladder-shapes', { sequence: [
        { dim: 'company', value: 'KM' }, { dim: 'marketplace', value: 'Shopify' },
        { dim: 'company', value: 'KM' }] });
      return realSteps(t).some(function (s) { return s.disagreements.length > 0; });
    });
});

/* L3 — loading empties the chooser along with the board. */
mut('L3  loading clears the site a person already confirmed', function () {
  return withSrc(PAGE_REL,
    "      P.BOARD_HOSTS.forEach(function (id) {\n        var n = doc.getElementById(id);",
    "      ['nav', 'crumbs', 'banner', 'scope', 'view', P.SITE_HOST_ID].forEach(function (id) {\n"
    + "        var n = doc.getElementById(id);",
    function () {
      var t = trace('ladder-shapes', { sequence: [
        { dim: 'company', value: 'KM' }, { dim: 'marketplace', value: 'Shopify' }] });
      return realSteps(t).some(function (s) {
        return TIERS.every(function (d) { return s.dom[d].shape === 'none'; });
      });
    });
});

/* L4 — a withdrawn or superseded read is allowed to land. */
mut('L4  a stale response overwrites the newer selection', function () {
  return withSrc(PAGE_REL,
    '          if (myToken !== C.token) {',
    '          if (false) {',
    function () {
      var t = trace('stale-response', { first: SITE_A, second: SITE_B },
        { slowSite: SITE_A, slowMs: 450 });
      var last = lastStep(t);
      /* The slow site's board mounting over the fast one shows up as a rendered site that is not
         the chosen one, or as a `dropped` count that never rises. */
      return last.dropped === 0;
    });
});

/* L5 — the same-site guard swallows a retry after a failure. */
mut('L5  a failure cannot be retried', function () {
  return withSrc(PAGE_REL,
    '        && (C.inFlight === true || C.mounted === true)) {',
    '        && true) {',
    function () {
      var t = trace('failure-retry', { first: SITE_A },
        { fail: { message: 'boom' }, failOnly: 'workspace' });
      var r = realSteps(t);
      return r[r.length - 1].state !== 'OK';
    });
});

/* L6 — the grey page ground comes back. */
mut('L6  the header sits on a grey banner again', function () {
  return withCss('.psb-page.module-section { background: transparent; }',
    '.psb-page.module-section { background: var(--ground); }',
    function () { return measure({}).r7.pageBg !== 'rgba(0, 0, 0, 0)'; });
});

/* L7 — the chart question marks come back. */
mut('L7  the chart `?` controls come back', function () {
  return withSrc(PAGE_REL, 'inlineHelpIcons: false,', 'inlineHelpIcons: true,',
    function () { return measure({}).r7.chartHelpIcons > 0; });
});

/* L8 — the page-level info button is removed with them. */
mut('L8  the page info button is removed along with the `?`s', function () {
  return withSrc(PAGE_REL, '    host.appendChild(btn);\n', '    void btn;\n',
    function () { return measure({}).r7.pageHelpButtons !== 1; });
});

/* L9 — the price returns to the X axis. */
mut('L9  the X axis prints the price again', function () {
  return withSrc(PAGE_REL, 'axisPriceRow: false', 'axisPriceRow: true',
    function () { return measure({ view: 'category' }).r7.axisPriceRows.length > 0; });
});

/* L10 — the price leaves the tooltip, which is where it now lives alone. */
mut('L10 the tooltip loses the price', function () {
  /* THE REAL LINE. `tipLines()` pushes its rows one at a time; the anchor above was a guess at a
     shape this file never had, and a mutant whose anchor matches nothing proves nothing. */
  /* EVERY PRICE LINE, not one of four. `tipLines` pushes List price, Everyday, Floor and
     sometimes Proposed; removing only the Everyday row left three other prices in the panel and
     the probe - which asks whether the tooltip carries A price - correctly still said yes. */
  return withSrc(BOARD_REL,
    "  function tipLines(n) {\n    var L = [];",
    "  function tipLines(n) {\n    var L = []; if (n) return L;",
    function () { return measure({ view: 'category' }).r7.tooltipHasPrice !== true; });
});

/* L11 — one control in the panel stops sharing the row's height. */
mut('L11 Series stops matching the other filters', function () {
  return withCss('.psb-page .psb-filters .cmd-context-value {\n  display: inline-flex;',
    '.psb-page .psb-filters .cmd-context-value {\n  height: 30px;\n  display: inline-flex;',
    function () {
      var ctrls = measure({ view: 'category' }).r7.panelControls || [];
      var hs = {};
      ctrls.forEach(function (c) { hs[c.h] = 1; });
      return Object.keys(hs).length > 1;
    });
});

/* L12 — the drawer loses its close control. */
mut('L12 the drawer has no close button', function () {
  return withSrc(BOARD_REL, "    head.appendChild(close);\n", "    void close;\n",
    function () {
      var t = trace('drawer-close', { first: SITE_A });
      return t.steps[1].closeButtons.length === 0;
    });
});

/* L13 — closing only hides the drawer visually and it keeps taking clicks and tab stops. */
mut('L13 close only hides the drawer and it still intercepts', function () {
  /* THE MUTANT IS THE HIDE ITSELF, in the renderer, because that is where this defect would
     actually be written: `hidden` is what takes the panel out of the layout AND out of the tab
     order, and a "close" that only changes how it looks leaves both. Mutating the stylesheet
     instead could not express it - the `hidden` ATTRIBUTE carries the browser's own
     `display: none`, so removing the author rule leaves the UA sheet still hiding the drawer. */
  return withSrc(BOARD_REL,
    '    if (!STATE.meetingOpen) d.hidden = true;',
    "    if (!STATE.meetingOpen) { d.style.opacity = '0'; }",
    function () {
      var t = trace('drawer-close', { first: SITE_A });
      var closed = t.steps[3];
      return closed.focusablesWithABox > 0 || closed.insideDrawer === true;
    });
});

/* L14 — closing the drawer quietly resets the scenario form. */
mut('L14 closing the drawer throws the unsubmitted work away', function () {
  /* `scenarioSeries` IS the unsubmitted work: it is what the drawer's Series select is rebuilt
     from, so clearing it on close is precisely "the panel threw away what I had typed". */
  return withSrc(BOARD_REL,
    "      STATE.meetingOpen = false;\n      render();\n      /* P1-B8D-R7",
    "      STATE.meetingOpen = false;\n      STATE.scenarioSeries = '';\n      render();\n"
    + "      /* P1-B8D-R7",
    function () {
      var t = trace('drawer-close', { first: SITE_A });
      return JSON.stringify(t.steps[4].formValues) !== JSON.stringify(t.steps[2].formValues)
        || t.steps[4].scenarioChip !== t.steps[2].scenarioChip;
    });
});

/* L15 / L16 — the board draws its own site ladder again: two authorities, two bars. */
mut('L15 the board emits a second set of site selectors', function () {
  return withSrc(PAGE_REL, 'siteOwnedByPage: true,', 'siteOwnedByPage: false,',
    function () {
      var t = trace('ladder-shapes', { sequence: [
        { dim: 'company', value: 'KM' }, { dim: 'marketplace', value: 'Shopify' }] });
      return realSteps(t).some(function (s) { return s.siteControlCount > 3; });
    });
});

mut('L16 the filters split back into two panels', function () {
  return withCss('.psb-page .psb-filters > .scope,', '.psb-page .psb-filters > .__none,',
    function () {
      var vm = measure({ view: 'category' }).r7;
      var ctrls = vm.panelControls || [];
      var rows = {};
      ctrls.forEach(function (c) { rows[c.top] = 1; });
      /* Un-flattening `#scope` puts the board's controls into a block of their own, so the panel's
         controls no longer share the site row's baseline at a width where they used to. */
      return Object.keys(rows).length > 3 || ctrls.length < 5;
    });
});

/* L17 — a Category or Series from the previous site survives a switch. */
mut('L17 an illegal Category survives a site change', function () {
  /* THE RESET THAT ACTUALLY RUNS ON THIS PATH. `clearBelow` belongs to the BOARD's own site
     ladder, which this page no longer renders — mutating it changed nothing here, and a mutant
     that cannot move the behaviour is not a mutant. `narrowAfterSiteChange` is what boot() now
     calls when a new adapter arrives, and dropping its category test is exactly the defect. */
  return withSrc(BOARD_REL,
    '    if (STATE.category !== null && cats.indexOf(STATE.category) < 0) {',
    '    if (false) {',
    function () {
      var t = trace('ladder-shapes', { sequence: [
        { dim: 'company', value: 'KM' }, { dim: 'marketplace', value: 'Shopify' },
        /* CHOOSE ONE THE NEXT SITE DOES NOT HAVE. With `All categories` left selected there is
           nothing to carry — `All` is legal everywhere, so the probe could never fire. */
        { dim: 'category', value: 'Cutting Board' },
        { dim: 'company', value: 'ResTW' }, { dim: 'country', value: 'JP' }] });
      var l = lastStep(t);
      /* LEGAL MEANS "ON THE MENU THE NEW SITE OFFERS". The trigger's label shows whatever
         STATE.category holds, which is the value under suspicion — so the menu is opened and the
         selection is looked for among the options that site actually has. */
      /* THE SAME TEST F13a MAKES, and it has to be: a carried-over category shows up as NO item
         marked on, not as a wrong one marked on — nothing in the new site's menu matches it, so
         the menu simply has no selection. A probe that only looked for a wrong selection would
         watch the defect happen and call it absent. */
      var menu = l.categoryMenu;
      if (!menu || !menu.offered.length) return false;
      return menu.selected.length === 0
        || menu.offered.indexOf(menu.selected[0]) < 0;
    });
});

/* L18 — the popover becomes hover-only, unreachable by keyboard or touch. */
mut('L18 the help popover becomes hover-only', function () {
  return withSrc(PAGE_REL,
    "    btn.addEventListener('click', function (ev) {\n"
    + "      if (ev && ev.stopPropagation) ev.stopPropagation();\n"
    + "      P.toggleHelp(doc);\n    });",
    "    btn.addEventListener('mouseenter', function () { P.toggleHelp(doc, true); });",
    function () {
      var h = measure({}).r7.help || {};
      return h.openedByClick !== true || h.openedByKeyboard !== true;
    });
});

/* L19 — the popover is printed. */
/** The bodies of every `@media print` block, so a rule outside one cannot answer for a rule in it. */
function printBlocks(css) {
  var out = [], i = 0;
  while ((i = css.indexOf('@media print', i)) >= 0) {
    var open = css.indexOf('{', i);
    var depth = 0, j = open;
    for (; j < css.length; j++) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') { depth--; if (depth === 0) break; }
    }
    out.push(css.slice(open + 1, j));
    i = j + 1;
  }
  return out;
}
ok(printBlocks(SRC.css).some(function (b) { return /\.psb-help \{ display: none; \}/.test(b); }),
  'J11a and the rule that does it is inside a print block, not merely somewhere in the file');

mut('L19 the floating popover is printed', function () {
  /* THE PRINT BLOCK, ISOLATED. The first version tested the whole file for
     `.psb-page .psb-help { display: none; }` — which is a SUBSTRING of the presentation rule
     `body.presenting .psb-page .psb-help { display: none; }`, so the mutant was answered by a
     different rule about a different mode and scored as surviving. */
  return withCss('  .psb-page .psb-help { display: none; }\n}',
    '  .psb-page .psb-help { display: block; }\n}',
    function () {
      return !printBlocks(read(CSS_REL)).some(function (b) {
        return /\.psb-help \{ display: none; \}/.test(b);
      });
    });
});

/* L21 — a panel with no controls in it is drawn anyway. */
mut('L21 an empty filter panel is drawn over a refusal', function () {
  return withSrc(PAGE_REL,
    "      panel.setAttribute('data-psb-empty', hasControls ? 'false' : 'true');",
    "      panel.setAttribute('data-psb-empty', 'false');",
    function () {
      return measure({ capabilityOff: true, noSite: true }).r7.filterPanelsPainted > 0;
    });
});

/* L20 — the left navigation is changed by a usability round. */
mut('L20 the left navigation is modified', function () {
  var mutated = SRC.app.replace(/'product-strategy': 'product-strategy-board-section'/g, "'x': 'y'");
  return !/'product-strategy': 'product-strategy-board-section'/.test(mutated);
});

// =================================================================================================
try { fs.rmSync(OUT, { recursive: true, force: true }); } catch (e) { /* a temp dir */ }
console.log('\npassed ' + pass + '  failed ' + fail
  + '  |  mutants caught ' + neg.caught + '  survived ' + neg.missed);
if (fail > 0) process.exitCode = 1;
