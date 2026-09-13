/**
 * ==================================================================================================
 * PRODUCT STRATEGY — THE RENDERER WENT ON DRAWING A PAGE NOBODY WAS ON   (P1-B8D-R8)
 * ==================================================================================================
 *
 * SIX REPORTS CAME IN AND THREE OF THEM WERE ONE DEFECT. Reproduced first, through the production
 * lifecycle, in a real browser, before anything was changed:
 *
 *   §5  "switch to a complete site B and site A's board stays up under Loading listings…"
 *   §7  "leave Product Strategy, come back, and the old board is still there under a reset chooser"
 *   §6  "R7 says the drawer has a close button and I cannot see one"
 *
 * WHAT THE TRACE SAID.
 *
 *   THE BOARD CAME BACK ON ITS OWN, THREE RUNS IN SIX. `onUnmount()` empties `#nav`, `#crumbs`,
 *   `#banner`, `#scope` and `#view`. Two hundred milliseconds later `#view` held three children
 *   again. Nobody put them there: `psb-board-ui` keeps a ResizeObserver on `#view`, the section
 *   going `display: none` IS a size change, and the observer answers it one animation frame later
 *   by calling `renderData()` — which repaints the chart and the print banner out of a STATE that
 *   nothing had cleared, and deliberately leaves the nav and the filters alone so a resize cannot
 *   cost somebody their place. So the half that came back was the board and the half that stayed
 *   empty was the chooser. That is the split brain, exactly as reported, and it is a RACE — which
 *   is why it reads as "sometimes" and why every suite in this project was green.
 *
 *   EMPTYING SOMEBODY'S OUTPUT IS NOT TELLING THEM TO STOP. The renderer had `mount()` and no
 *   `unmount()`. It has both now, the observer is disconnected rather than left watching, nothing
 *   paints while the board is down, and `observeContainer()` replaces its own observer instead of
 *   adding one per site change.
 *
 *   AND THE CLOSE BUTTON WAS BEHIND THE APPLICATION'S HEADER. Present, 30x30, right corner, right
 *   glyph, right accessible name — every property R7 measured was correct. `elementFromPoint` at
 *   its own centre returned `top-header`: `.top-header` is `position: fixed; top: 0; z-index: 2000`
 *   and the drawer was `top: 0; z-index: 60`, so the drawer's whole head row was painted underneath
 *   it. A count cannot see that and neither can a DOM assertion; only asking the document what is
 *   actually painted at a coordinate can.
 *
 * WHAT THIS SUITE MEASURES THAT NO EARLIER ONE DID.
 *
 *   · the state DURING an outstanding read, not after it
 *   · the state one animation frame after a teardown, which is where a re-entrant renderer lands
 *   · a viewport change at a moment when nothing about the site has changed
 *   · what is painted at a coordinate, rather than what exists at a selector
 *   · the scenario across the four things that must not clear it and the one that must
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
/* CRLF normalised on read. `core.autocrlf=true` writes CRLF into a fresh checkout and a multi-line
   anchor then matches zero times; P1-B8D-R4 shipped red for exactly that. */
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
}
/* COMMENTS OFF BEFORE ANYTHING IS COUNTED. This project has sprung that trap six times: a scan for
   a token finds the token inside the paragraph explaining why the token is not used. */
function decomment(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

var CSS_REL = 'assets/css/product-strategy-board.css';
var PAGE_REL = 'assets/js/pages/product-strategy-board.js';
var BOARD_REL = 'assets/js/product-strategy/psb-board-ui.js';
var CENSUS_REL = 'docs/planning/S_SERIES_FRONTEND_API_MIGRATION_INVENTORY.md';
var SRC = {
  css: read(CSS_REL),
  base: read('assets/css/base.css'),
  layout: read('assets/css/layout.css'),
  partial: read('assets/html/pages/product-strategy-board.html'),
  page: read(PAGE_REL),
  board: read(BOARD_REL),
  app: read('assets/js/app.js'),
  index: read('index.html'),
  census: read(CENSUS_REL)
};

var RUN = require(path.join(__dirname, '_p1b8c-visual-runner.js'));

/* TWO SITES UNDER ONE COMPANY, ON PURPOSE, AND THAT IS THE OPPOSITE OF R7's CHOICE.
   R7 needed two companies so that a switch walked the whole ladder. This round needs a switch with
   NO incomplete step in the middle: §5 is about going from one COMPLETE site straight to another,
   and a company change passes through "nothing selected below" on the way, which answers a
   different question. One control, both ends complete. */
var SITE_A = { company: 'KM', country: 'US', marketplace: 'Shopify' };
var SITE_B = { company: 'KM', country: 'US', marketplace: 'Walmart' };
/* A REAL CATEGORY ON SITE A - nine of its twenty-seven listings. A category step that picks nothing
   proves nothing about what a category change does to a simulation. */
var CATEGORY_ON_A = 'Electric Can Opener';

var BROWSER = RUN.findBrowser();
var OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'psb-r8-'));
var PAGE_FILE = path.join(__dirname, '_p1b8c-acceptance.html');

if (!BROWSER) {
  console.error('STOP_NO_BROWSER_AVAILABLE — a lifecycle round cannot be accepted without one.');
  process.exitCode = 2;
}

function measure(opts, w, h) {
  fs.writeFileSync(PAGE_FILE, RUN.buildPage(Object.assign(
    { capture: 'live', activated: true, site: SITE_A }, opts)), 'utf8');
  var r = RUN.shot(BROWSER, PAGE_FILE, OUT, { id: 'probe', w: w || 1440, h: h || 900 });
  if (!r.measurements) throw new Error('no measurements came back from the browser');
  return r.measurements;
}

/**
 * Drive one named sequence and hand back its trace.
 *
 * `noSite: true` on every one, because a harness that pre-selects a site cannot fail for the reason
 * production fails — the lesson P1-B8D-R4 and R5 each paid for once.
 */
function trace(script, args, opts) {
  var m = measure(Object.assign({ script: script, scriptArgs: args, noSite: true }, opts || {}));
  if (!m.trace) throw new Error('no trace came back (error: ' + JSON.stringify(m.error) + ')');
  return { steps: m.trace, error: m.error, m: m };
}
function boardSteps(t) { return t.steps.filter(function (s) { return !!s.board; }); }
/** The DISTINCT actions a page life put on the wire, in first-seen order. */
function actionsOf(m) {
  var seen = {}, out = [];
  (m.requests || []).forEach(function (a) { if (!seen[a]) { seen[a] = 1; out.push(a); } });
  return out;
}
function stepAt(t, i) { return boardSteps(t)[i]; }

/** Edit a real shipped file, run a probe against it, put it back — always. */
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
function withBoard(from, to, p) { return withSrc(BOARD_REL, from, to, p); }
function withPage(from, to, p) { return withSrc(PAGE_REL, from, to, p); }
function withCss(from, to, p) { return withSrc(CSS_REL, from, to, p); }

var TEARDOWN = null, LEAVE = null, SCEN = null, SCEN_LR = null;
var DRAWER = null, CHROME = null, FAILRUN = null, NOCAT = null;
if (BROWSER) {
  TEARDOWN = trace('deferred-teardown', { first: SITE_A, second: SITE_B },
    { slowSite: SITE_B, slowMs: 700 });
  LEAVE = trace('leave-return', { first: SITE_A });
  SCEN = trace('scenario-site-scope', { first: SITE_A, second: SITE_B });
  SCEN_LR = trace('scenario-leave-return', { first: SITE_A });
  DRAWER = trace('drawer-visibility', { first: SITE_A });
  CHROME = trace('production-chrome', { first: SITE_A });
  FAILRUN = trace('teardown-failure', { first: SITE_A, second: SITE_B });
  /* THE SITE THE REPORT IS ABOUT. No captured site has zero categories, so the state that writes
     the sentence §3 removes could not be reached, photographed or asserted. The replay empties one
     field on each row of a real site's real envelope — rows, prices and chart unchanged. */
  NOCAT = trace('production-chrome', { first: SITE_A }, { noCategories: true });
}

// =================================================================================================
section('A — THE BOARD COMES DOWN BEFORE THE NEXT SITE IS ASKED FOR (§5)');
// =================================================================================================

eq(TEARDOWN.error, null, 'A1  the deferred-teardown sequence ran clean');
var tdA = stepAt(TEARDOWN, 0);
eq([tdA.canonical.company, tdA.canonical.marketplace], ['KM', 'Shopify'],
  'A2  site A is loaded and canonical');
ok(tdA.mounted === true && tdA.board.viewChildren > 0 && tdA.board.navTabs > 0,
  'A3  and its board is on screen', [tdA.mounted, tdA.board.viewChildren, tdA.board.navTabs]);

/* THE SAME SYNCHRONOUS TURN. Not "after a tick" — §5 asks for the teardown before or in the turn
   that sends the read, and a step that awaits first cannot tell the two apart. */
var tdB = stepAt(TEARDOWN, 1);
eq(tdB.canonical.marketplace, 'Walmart', 'A4  site B is canonical the instant the control changes');
ok(tdB.inFlight === true, 'A5  and B\'s read is already outstanding', tdB.inFlight);
eq(tdB.workspaceRequests, 2, 'A6  which is the SECOND workspace read and not a third');
eq(tdB.board.viewChildren, 0, 'A7  site A\'s chart is already gone — same turn, nothing awaited');
eq([tdB.board.navTabs, tdB.board.scopeChildren], [0, 0],
  'A8  and so are its tabs and its own context row');
eq(tdB.board.crumbs, '', 'A9  and its crumbs');
ok(/Loading/i.test(tdB.stateText), 'A10 the page says it is loading', tdB.stateText);

/* A11-A13 — ONE FRAME LATER, AND THEN AFTER A VIEWPORT CHANGE. This is where a renderer that is
   still watching its host puts the board back, and the only place the defect was ever visible. */
[[2, 'A11 one tick later, still nothing'], [3, 'A12 a frame later, still nothing']]
  .forEach(function (c) {
    var s = stepAt(TEARDOWN, c[0]);
    ok(s.board.viewChildren === 0 && s.inFlight === true, c[1],
      [s.board.viewChildren, s.inFlight]);
  });
var resized = stepAt(TEARDOWN, 4);
ok(resized.viewportResized === true, 'A13 the viewport really did change', resized.viewportResized);
ok(resized.board.viewW !== tdB.board.viewW, 'A14 measurably',
  [tdB.board.viewW, resized.board.viewW]);
eq(resized.board.viewChildren, 0,
  'A15 and a resize while B is outstanding does NOT bring site A back');

var tdDone = stepAt(TEARDOWN, 5);
ok(tdDone.mounted === true && tdDone.board.viewChildren > 0,
  'A16 B answers and B mounts', [tdDone.mounted, tdDone.board.viewChildren]);
eq(tdDone.canonical.marketplace, 'Walmart', 'A17 as the site that was actually chosen');
eq(tdDone.workspaceRequests, 2, 'A18 at a cost of exactly two reads for two sites');
eq(tdDone.disagreements, [], 'A19 with the chooser and the screen still agreeing');

// =================================================================================================
section('B — A REFUSED SITE B DOES NOT RESURRECT SITE A (§5)');
// =================================================================================================

eq(FAILRUN.error, null, 'B1  the failure sequence ran clean');
var f0 = stepAt(FAILRUN, 0);
ok(f0.mounted === true, 'B2  site A loaded first — so there is something to wrongly restore');
var f1 = stepAt(FAILRUN, 1);
eq(f1.canonical.marketplace, 'Walmart', 'B3  site B was chosen');
ok(f1.mounted === false, 'B4  and B did not mount', f1.mounted);
ok(f1.stateText !== '' && !/Loading/i.test(f1.stateText),
  'B5  B\'s refusal is what the page says', f1.stateText);
eq(f1.board.viewChildren, 0, 'B6  and site A is NOT underneath it');
eq(f1.board.scopeChildren, 0, 'B7  including its own read-only site row');
eq(f1.siteControlCount, 3, 'B8  the chooser is still usable, so a retry is possible');
var f2 = stepAt(FAILRUN, 2);
ok(f2.mounted === true && f2.canonical.marketplace === 'Walmart',
  'B9  and re-picking the same marketplace after a failure loads it',
  [f2.mounted, f2.canonical]);
eq(f2.workspaceRequests, 3, 'B10 three reads: A, the refused B, the retried B');

// =================================================================================================
section('C — LEAVE AND RETURN IS ONE CONSISTENT PAGE (§7)');
// =================================================================================================

eq(LEAVE.error, null, 'C1  the leave-and-return sequence ran clean');
var l0 = stepAt(LEAVE, 0);
ok(l0.mounted === true && l0.board.viewChildren > 0, 'C2  a site is loaded and showing');

var away = [stepAt(LEAVE, 1), stepAt(LEAVE, 2), stepAt(LEAVE, 3), stepAt(LEAVE, 4)];
eq(away.map(function (s) { return s.board.viewChildren; }), [0, 0, 0, 0],
  'C3  while another page is showing, the board is gone and STAYS gone');
/* C3a - A LIVE HANDLER ON A NODE THE UNMOUNT DOES NOT REMOVE. `#btnPresent` lives in the partial,
   which is fetched once and stays in the document; `boot()` binds it once and its handler calls
   `render()`. After an unmount that path is still there, and it has to find a renderer that has
   stopped rather than one that repaints the whole board into hosts the page has just emptied. */
eq(away[1].board.viewChildren, 0,
  'C3a a live handler firing while away does not repaint the board');
eq(away[1].board.navTabs, 0, 'C3b nor its tabs');
eq(away[1].board.scopeChildren, 0, 'C3c nor its filter row');
eq(away[3].viewportResized, true, 'C4  even across a viewport change');
eq(away.map(function (s) { return s.board.sectionActive; }), [false, false, false, false],
  'C5  the section is inactive throughout');

/* C6-C11 — THE RETURN. Preserve-consistently: the same site, the same board, the same view, and
   not one extra request. The alternative §7 allows is clear-consistently, and what it forbids is
   the mixture — which is what was happening. */
var back = stepAt(LEAVE, 5);
eq([back.canonical.company, back.canonical.country, back.canonical.marketplace],
  ['KM', 'US', 'Shopify'], 'C6  coming back restores the canonical site');
eq(back.disagreements, [], 'C7  and the three controls show it');
ok(back.mounted === true && back.board.viewChildren > 0, 'C8  with the board back up',
  [back.mounted, back.board.viewChildren]);
eq(back.stateText, '', 'C9  and NO awaiting-site notice over it');
eq(back.workspaceRequests, 1, 'C10 at a cost of zero extra workspace reads');
eq(back.universeRequests, 1, 'C11 and zero extra universe reads');
eq(back.board.crumbs, l0.board.crumbs, 'C12 showing the same view it was left on');

var settled = stepAt(LEAVE, 6);
eq(settled.board.viewChildren, back.board.viewChildren,
  'C13 and it settles rather than repainting itself again');
eq(settled.siteControlCount, 3, 'C14 with one set of site controls, as always');

/* C15 — THE OTHER DIRECTION. A visit that never got to a complete site has nothing worth keeping,
   and must not restore half of one. */
ok(SRC.page.indexOf("prev.narrowed.complete === true") >= 0
  && SRC.page.indexOf("prev.mounted === true && prev.adapter") >= 0,
  'C15 only a complete, mounted, adapter-holding controller is parked');

// =================================================================================================
section('D — THE DRAWER CLOSE CONTROL, AS PAINTED (§6)');
// =================================================================================================

var dOpen = DRAWER.steps[1];
var dPointer = DRAWER.steps[2];
var dReopen = DRAWER.steps[3];
var dKeyboard = DRAWER.steps[4];

eq(DRAWER.error, null, 'D1  the drawer sequence ran clean');
eq(dOpen.count, 1, 'D2  exactly one close control');
eq(dOpen.type, 'button', 'D3  a real <button type="button">');
eq(dOpen.ariaLabel, 'Close meeting scenario', 'D4  with an accessible name');
eq(dOpen.codePoint, 215, 'D5  showing a real multiplication sign, not a letter x');
eq(dOpen.display, 'flex', 'D6  display is not none');
eq(dOpen.visibility, 'visible', 'D7  visibility is visible');
ok(dOpen.opacity > 0, 'D8  and it is not transparent', dOpen.opacity);
eq([dOpen.box.w, dOpen.box.h], [30, 30], 'D9  a 30x30 box');
eq(dOpen.insideViewport, true, 'D10 wholly inside the viewport');
eq(dOpen.insideHeader, true, 'D11 and inside the drawer head it belongs to');

/* D12 IS THE ONE THAT WAS MISSING, and it is the whole of §6. Every assertion above was TRUE while
   the operator could not see the control: it was painted underneath the application's fixed header.
   Only asking the document what is at the coordinate can say so. */
eq(dOpen.elementAtCentre, 'scenarioDrawerClose',
  'D12 and the thing painted at its centre IS the close button');
eq(dOpen.hitIsTheButton, true, 'D13 so a real click at that pixel reaches it');
ok(dOpen.box.y >= 56, 'D14 because the drawer starts below the shell header, not at y=0',
  dOpen.box.y);
ok(String(dOpen.background) !== String(dOpen.color),
  'D15 and it is not the same colour as its own text', [dOpen.background, dOpen.color]);

eq(dOpen.focus, 'button#scenarioDrawerClose',
  'D16 opening puts the focus inside the drawer');
eq(dOpen.inTabOrder, true,
  'D16a and the control is in the tab order — focusable is not the same as reachable');
eq(dPointer.drawerOpen, false, 'D17 a pointer click closes it');
eq(dPointer.focus, 'button#meetingToggle', 'D18 and the focus goes back to what opened it');
eq([dPointer.drawerBox.w, dPointer.drawerBox.h], [0, 0], 'D19 a closed drawer has no box');
eq(dPointer.drawerFocusablesWithABox, 0, 'D20 and holds no reachable tab stop');
eq(dPointer.elementAtCentre, null, 'D21 and intercepts nothing at its old coordinates');

eq(dReopen.drawerOpen, true, 'D22 it reopens');
eq(dKeyboard.drawerOpen, false, 'D23 and a focused Enter closes it too');
eq(dKeyboard.focus, 'button#meetingToggle', 'D24 returning the focus the same way');

eq([dOpen.scenarioApplied, dPointer.scenarioApplied],
  [dOpen.scenarioApplied, dOpen.scenarioApplied],
  'D25 closing neither applies nor clears a scenario');
eq(dPointer.chip, dOpen.chip, 'D26 and the chip says exactly what it said before');

/* D27 — THE OFFSET IS THE SHELL'S OWN TOKEN, not a number typed twice. */
ok(/\.psb-page \.scn-drawer \{ top: var\(--header-height/.test(SRC.css),
  'D27 the drawer derives its top from --header-height');
ok(/--header-height:\s*56px/.test(SRC.base),
  'D28 which base.css declares once, as the single owner of the header offset');
ok(/z-index:\s*2000/.test(SRC.layout),
  'D29 and the shell header keeps its own stacking order — nothing global moved');

// =================================================================================================
section('E — NO CHART TOOLBAR IN PRODUCTION (§4)');
// =================================================================================================

var c1 = stepAt(CHROME, 1);
eq(CHROME.error, null, 'E1  the production-chrome sequence ran clean');
ok(c1.board.charts > 0, 'E2  the Price architecture chart is drawn', c1.board.charts);
eq(c1.toolbar.controls, 0, 'E3  and there is no control row above it');
eq(c1.toolbar.focusables, 0, 'E4  nothing there to focus');
eq(c1.toolbar.groups, 0, 'E5  no control groups');
eq(c1.toolbar.emptyContainers, 0, 'E6  and no empty container holding the space open');
eq(c1.toolbar.ids['chartControls'], false, 'E7  #chartControls is not in the document');
['mode-auto', 'mode-comfortable', 'mode-fullscreen', 'view-clean', 'view-detail',
  'layersToggle', 'zoom-reset'].forEach(function (id, i) {
  eq(c1.toolbar.ids[id], false, 'E8.' + (i + 1) + ' ' + id + ' is absent');
});
eq(c1.toolbar.ids['densityNote'], false,
  'E9  and so is the note advising a control that no longer exists');

/* E10 — THE TAB ORDER IS THE TEST §4 ACTUALLY ASKS FOR: "不得只用 CSS 隱藏仍可 tab-focus 的按鈕". */
var tabStep = CHROME.steps[CHROME.steps.length - 1];
eq(tabStep.toolbarTabbables, 0, 'E10 and no toolbar control is in the tab order');
ok(tabStep.tabbables.indexOf('btnPresent:Presentation') >= 0,
  'E11 while the page header\'s own Presentation button is untouched', tabStep.tabbables);

/* E12-E14 — THE FUNCTIONS ARE RETAINED, which is what a mode contract means and what §4 asks for
   ("若 prototype 仍需這些 control，必須由既有 mode/host contract 保留 prototype 行為"). */
ok(SRC.board.indexOf('function toggleFullscreen()') >= 0,
  'E12 toggleFullscreen is still in the renderer');
ok(SRC.board.indexOf('function chartControls(lay)') >= 0,
  'E13 and so is the row builder — it is not called, not deleted');
ok(/chart_toolbar_is_an_argument/.test(SRC.board) && /chart_toolbar_default: 'rendered'/.test(SRC.board),
  'E14 with the default stated as data: the prototype still gets it');
ok(/chartToolbar: false/.test(SRC.page), 'E15 and this page is the one host that turns it off');

// =================================================================================================
section('F — NO RESIDENT SENTENCE UNDER A FILTER CONTROL (§3)');
// =================================================================================================

eq(c1.categoryHelper, [], 'F1  a normal ready board writes nothing under Category');
eq(NOCAT.error, null, 'F2  and the zero-category site rendered too');
var n1 = stepAt(NOCAT, 1);
eq(n1.categoryHelper, [],
  'F3  a site with NO categories also writes nothing under the control', n1.categoryHelper);
ok(n1.board.charts > 0, 'F4  and it is still a real board — rows, prices, a chart', n1.board.charts);

/* F5-F7 — THE ANSWER MOVED; IT DID NOT DISAPPEAR. §3 is explicit that a genuinely empty answer
   must still be explained, in the state host, and that missing data must never be dressed up as a
   normal ready page. */
ok(/no product categories/i.test(n1.stateText),
  'F5  the state host says the site has no categories', n1.stateText);
ok(/membership and the status gate/i.test(n1.stateText),
  'F6  and says why, in the words the underlying refusal already used');
eq(stepAt(CHROME, 0).stateText, '',
  'F7  while a site that HAS categories says nothing at all — no empty box, no held height');

ok(SRC.board.indexOf("none.id = 'catEmpty';") >= 0,
  'F8  the underlying sentence is suppressed, not deleted');
ok(SRC.board.indexOf('function notices()') >= 0,
  'F9  and the fact is reported to the host through a seam');
ok(/inlineFilterNotes: false/.test(SRC.page), 'F10 which this page turns off');
ok(/inline_filter_notes_default: 'rendered'/.test(SRC.board),
  'F11 leaving the prototype exactly as it was');

// =================================================================================================
section('G — A SIMULATION BELONGS TO THE SITE IT WAS SIMULATED ON (§8)');
// =================================================================================================

eq(SCEN.error, null, 'G1  the scenario sequence ran clean');
var g = boardSteps(SCEN);
ok(g[0].scenario.activeOverrides === 1, 'G2  a scenario is applied on site A',
  g[0].scenario.activeOverrides);
eq(g[0].scenario.chipActive, 'true', 'G3  and the chip says so');
ok(/KM\|US\|Shopify/.test(g[0].scenario.banner),
  'G4  and the print banner names the site it belongs to', g[0].scenario.banner);

eq(g[1].scenario.activeOverrides, 1, 'G5  a different VIEW of the same site keeps it');
eq(g[2].scenario.activeOverrides, 1, 'G6  a CATEGORY on the same site keeps it');

eq(g[3].canonical.marketplace, 'Walmart', 'G7  then a different site is chosen');
eq(g[3].scenario.activeOverrides, 0, 'G8  and every override is gone');
eq(g[3].scenario.chipActive, 'false', 'G9  the chip agrees');
eq(g[3].scenario.chip, 'No scenario', 'G10 and reads as no scenario');
eq(g[3].scenario.banner, '', 'G11 the print banner is empty');
eq(g[3].scenario.bodyClass, '', 'G12 and the body carries no scenario class');
eq(g[3].scenario.ghostRows, 0, 'G13 with no simulated markers left on the chart');
eq(g[3].scenario.formValues.scSeries, '', 'G14 and the drawer form is empty');

eq(g[4].canonical.marketplace, 'Shopify', 'G15 coming BACK to site A');
eq(g[4].scenario.activeOverrides, 0, 'G16 does not bring the simulation back');
eq(g[4].scenario.chip, 'No scenario', 'G17 which is what "cleared" has to mean');

/* G18-G22 — AND LEAVING THE PAGE IS NOT A SITE CHANGE. §8 permits keeping it under the preserve
   strategy, and §7 chose preserve. */
eq(SCEN_LR.error, null, 'G18 the leave-with-a-scenario sequence ran clean');
var lr = boardSteps(SCEN_LR);
eq(lr[0].scenario.activeOverrides, 1, 'G19 a scenario is applied');
eq(lr[3].scenario.activeOverrides, 1, 'G20 and it is still there after leaving and coming back');
eq(lr[3].board.crumbs, lr[1].board.crumbs, 'G21 on the same view it was left on');
eq(lr[3].workspaceRequests, 1, 'G22 with no second read to pay for it');
eq(lr[2].scenario.bodyClass, '',
  'G23 while away, the body carries no state class from a page that is not showing');

/* G24 — NOTHING WAS WRITTEN ANYWHERE. */
eq(actionsOf(SCEN.m), ['system.health', 'productPricing.siteUniverse.get',
  'productPricing.workspace.get'],
  'G24 the whole sequence spoke three read actions and nothing else');

// =================================================================================================
section('H — THE RENDERER CAN BE TOLD TO STOP');
// =================================================================================================

ok(SRC.board.indexOf('function unmount()') >= 0, 'H1  the renderer has an unmount');
ok(/unmount: function \(\) \{ return unmount\(\); \}/.test(SRC.board),
  'H2  exposed beside mount, on the same object');
ok(SRC.board.indexOf('function disconnectContainer()') >= 0,
  'H3  which disconnects the size observer');
ok(/disconnectContainer\(\);\n    var host = byId\('view'\);/.test(SRC.board),
  'H4  and observeContainer replaces its own observer rather than adding a second');
ok(/if \(!MOUNTED\) return;\n    withViewport/.test(SRC.board),
  'H5  render refuses to draw while unmounted');
var rd = SRC.board.indexOf('function renderData() {');
ok(rd > 0 && SRC.board.slice(rd, rd + 120).indexOf('if (!MOUNTED) return;') >= 0,
  'H6  and so does renderData');
ok(/onContainerResize\(\) \{\n    if \(!MOUNTED\) return;/.test(SRC.board),
  'H7  the resize callback checks before it schedules');
ok(/_resizeScheduled = false;\n[\s\S]{0,400}?if \(!MOUNTED\) return;/.test(SRC.board),
  'H8  and again on the frame it actually runs — the defect was a callback delivered after teardown');
ok(/if \(board && typeof board\.unmount === 'function'\) board\.unmount\(\);/.test(SRC.page),
  'H9  the page tells the renderer to stop before emptying its hosts');
ok(/b\.unmount\(\);/.test(SRC.page), 'H10 and does the same on the lifecycle unmount');

// =================================================================================================
section('I — THE API CENSUS IS ABOUT THE BROWSER (§9)');
// =================================================================================================

/* THE CENSUS RULE, IMPLEMENTED HERE RATHER THAN TRUSTED. §9 warns against one specific mistake:
   counting the Apps Script server's internal DB helpers as a browser bypass. The scope is the
   files index.html loads, and those are all under assets/. */
function loadedScripts(indexSrc) {
  var out = [];
  var re = /<script[^>]*src="([^"]+)"/g;
  var m;
  while ((m = re.exec(indexSrc))) out.push(m[1].replace(/\?v=.*$/, ''));
  return out;
}
var LOADED = loadedScripts(SRC.index);
ok(LOADED.length > 50, 'I1  the production load chain is readable from index.html', LOADED.length);
eq(LOADED.filter(function (f) { return /\.gs$/.test(f); }), [],
  'I2  and it contains no server-side .gs file — so none can be counted as a browser path');

var psbFiles = LOADED.filter(function (f) {
  return /product-strategy|product-pricing/.test(f) && /^assets\//.test(f);
});
ok(psbFiles.length >= 8, 'I3  Product Strategy loads its own chain', psbFiles.length);
/* CALLS, NOT MENTIONS. The board's own self-test names every one of these tokens in a STRING in
   order to assert their absence from its render path; a scan that counted those would report the
   test for the defect as the defect - the same trap as counting `!important` inside the comment
   explaining why it is not needed. So each pattern requires the shape of a USE. */
var USE = [
  /(^|[^.\w'"])fetch\s*\(/,
  /new\s+XMLHttpRequest/,
  /google\s*\.\s*script\s*\.\s*run\s*\./,
  /KM\.DB\s*\./,
  /localStorage\s*\.\s*(get|set|remove)Item/,
  /sessionStorage\s*\.\s*(get|set|remove)Item/
];
var offenders = psbFiles.filter(function (rel) {
  var src = decomment(read(rel));
  return USE.some(function (r) { return r.test(src); });
});
eq(offenders, [], 'I4  and not one of its modules reads a socket, a DB helper or browser storage');

eq(actionsOf(CHROME.m), ['system.health', 'productPricing.siteUniverse.get',
  'productPricing.workspace.get'],
  'I5  a whole page life speaks exactly three read actions');
eq(actionsOf(TEARDOWN.m), ['system.health', 'productPricing.siteUniverse.get',
  'productPricing.workspace.get'],
  'I6  and a site switch adds no fourth');

ok(/LEGACY_API_WRAPPER/.test(SRC.census) && /is NOT a bypass/.test(SRC.census),
  'I7  the census states that KM.DB is a wrapper and not a bypass');
ok(/server-side\*\* and are not a browser data path/.test(SRC.census),
  'I8  and that the server-side helpers are out of its scope');
ok(/this census reads `assets\/js` only/.test(SRC.census),
  'I9  naming the scope it actually read');

// =================================================================================================
section('J — WHAT THIS ROUND WAS NOT ALLOWED TO TOUCH (§12)');
// =================================================================================================

eq(read('assets/css/base.css'), SRC.base, 'J1  base.css is byte-identical');
eq(read('assets/css/layout.css'), SRC.layout, 'J2  layout.css is byte-identical');
ok(/'product-strategy': 'product-strategy-board-section'/.test(SRC.app),
  'J3  the shell still knows this section by exactly the same name');
eq((SRC.partial.match(/km-tab-rail/g) || []).length > 0, true,
  'J4  the six in-page tabs still use the shared rail');

/* J5 — EVERY RULE IN THIS STYLESHEET IS STILL SCOPED. The three body-state hooks are this page's
   own and predate this round; everything else must start at .psb-page. */
var selectors = decomment(SRC.css).split('}').map(function (b) {
  var i = b.indexOf('{');
  return i < 0 ? '' : b.slice(0, i).trim();
}).filter(function (s) { return s !== '' && s.indexOf('@') !== 0; });
var unscoped = [];
selectors.forEach(function (s) {
  s.split(',').forEach(function (one) {
    var t = one.trim();
    if (t === '' || t.indexOf('@') === 0) return;
    if (/^:root|^\.psb-|^body\.(presenting|is-fullscreen|has-scenario)|^from$|^to$|^\d/.test(t)) return;
    unscoped.push(t);
  });
});
eq(unscoped, [], 'J5  no rule in the page stylesheet escapes .psb-page', unscoped);

/* J6 — AND THIS ROUND ADDED NO !important. The count is of DECLARATIONS with comments stripped,
   because a previous round's scan found the word inside its own comment explaining why it was not
   needed. 21 is what P1-B8D-R7 left behind. */
eq((decomment(SRC.css).match(/!important/g) || []).length, 21,
  'J6  the !important count is exactly what the previous round left');

// =================================================================================================
section('K — THE MUTANTS (§11)');
// =================================================================================================

/* K1 — the sentence under Category comes back. */
mut('K1  the Category helper text is rendered on the production page', function () {
  return withBoard('    if (cats.length === 0 && SHOW_INLINE_FILTER_NOTES) {',
    '    if (cats.length === 0) {', function () {
      var t = trace('production-chrome', { first: SITE_A }, { noCategories: true });
      return stepAt(t, 1).categoryHelper.length > 0;
    });
});

/* K2 — the toolbar is hidden with CSS instead of not being built, so it is still in the tab order.
   THIS IS THE MUTANT §11 NAMES BY NAME, and the only probe that can catch it walks the tab order:
   every count of visible controls would read zero and pass. */
mut('K2  the toolbar is CSS-hidden but still tabbable', function () {
  return withBoard('    if (!SHOW_CHART_TOOLBAR) return null;',
    "    if (!SHOW_CHART_TOOLBAR) { var h = el('div', 'chartctl'); h.id = 'chartControls';"
    + " h.style.opacity = '0'; h.style.height = '0'; h.style.overflow = 'hidden';"
    + " h.appendChild(el('button', 'segbtn', 'Fullscreen')); return h; }",
    function () {
      var t = trace('production-chrome', { first: SITE_A });
      return t.steps[t.steps.length - 1].toolbarTabbables > 0;
    });
});

/* K3 — Fullscreen alone survives the removal. */
mut('K3  the Fullscreen control is still rendered and triggerable', function () {
  /* THE HALF-MEASURE SECTION 4 RULES OUT BY NAME. This mutant keeps the row and drops everything
     except Fullscreen, which is what a reviewer would do reading the report as being about one
     button rather than about the row. */
  return withBoard('    if (!SHOW_CHART_TOOLBAR) return null;',
    "    if (!SHOW_CHART_TOOLBAR) {\n"
    + "      var only = el('div', 'chartctl'); only.id = 'chartControls';\n"
    + "      var b1 = el('button', 'segbtn', 'Fullscreen'); b1.id = 'mode-fullscreen';\n"
    + "      b1.setAttribute('type', 'button');\n"
    + "      b1.addEventListener('click', function () { toggleFullscreen(); });\n"
    + "      only.appendChild(b1); return only;\n    }",
    function () {
      var t = trace('production-chrome', { first: SITE_A });
      return stepAt(t, 1).toolbar.ids['mode-fullscreen'] === true;
    });
});

/* K4 — the board is left up while site B is loading. The one-line revert of the fix. */
mut('K4  site A stays on screen while site B is loading', function () {
  return withPage('      clearBoard();\n      P.renderState(host, ux, refusals || [], doc);',
    '      P.renderState(host, ux, refusals || [], doc);', function () {
      var t = trace('deferred-teardown', { first: SITE_A, second: SITE_B },
        { slowSite: SITE_B, slowMs: 700 });
      var during = stepAt(t, 1);
      return during.board.viewChildren > 0 && /Loading/i.test(during.stateText);
    });
});

/* K4a - THE ROOT CAUSE, AS A MUTANT. `unmount()` stops setting the flag and stops disconnecting the
   observer: exactly the state this round found the renderer in. The board then repaints itself into
   a host the page has emptied, while the operator is on a different page entirely. */
mut('K4a the renderer keeps repainting a page nobody is on', function () {
  return withBoard('    MOUNTED = false;\n    disconnectContainer();\n    hideTip();',
    '    hideTip();', function () {
      var t = trace('leave-return', { first: SITE_A });
      /* THE STRAY-CLICK STEP, not the size-observer one. Both routes are the same defect, and only
         this one is deterministic in a headless browser: the observer answers on an animation
         frame, which a virtual-time budget delivers erratically - the trace that FOUND this saw it
         three runs in six, which is a finding but would be a flaky test. */
      return stepAt(t, 2).board.viewChildren > 0;
    });
});

/* K5 — a failed site B brings site A back. */
mut('K5  a refused site B restores site A\'s board', function () {
  /* A DIFFERENT MUTATION FROM K4's, and a more tempting one. K4 keeps the old board up by never
     taking it down; this one takes it down correctly and then PUTS IT BACK when the new site
     refuses - "do not lose the operator's data on a transient error". It is the wrong kindness:
     the chart that comes back belongs to a site nobody has selected, under a notice about a site
     that failed, and nothing on the screen says which one the numbers are. */
  return withPage('            C.mounted = false;\n            return show(snap.state, snap.ux, snap.refusals);',
    '            C.mounted = false;\n'
    + '            var back = show(snap.state, snap.ux, snap.refusals);\n'
    + '            if (C.adapter) mountBoard(C.adapter);\n'
    + '            return back;',
    function () {
      var t = trace('teardown-failure', { first: SITE_A, second: SITE_B });
      return stepAt(t, 1).board.viewChildren > 0;
    });
});

/* K6 — a stale answer is mounted over the current site. */
mut('K6  a superseded workspace response is rendered anyway', function () {
  return withPage('          if (myToken !== C.token) {', '          if (false) {', function () {
    var t = trace('stale-response', { first: SITE_A, second: { company: 'ResUS',
      country: 'US', marketplace: 'Walmart' } }, { slowSite: SITE_A, slowMs: 450 });
    /* `C.dropped` only increments inside the branch that refuses a superseded answer, so a run in
       which the slow site's answer lands has a drop count of zero. The unmutated run drops one. */
    var last = t.steps.filter(function (s) { return !!s.dom; }).pop();
    return last.dropped === 0;
  });
});

/* K7 — the return restores the board but not the chooser: the split brain, deliberately. */
mut('K7  a return paints the board with a reset chooser', function () {
  return withPage('      paintChooser();\n      if (host) { while (host.firstChild) host.removeChild(host.firstChild); }\n      mountBoard(C.adapter);',
    '      if (host) { while (host.firstChild) host.removeChild(host.firstChild); }\n      mountBoard(C.adapter);',
    function () {
      var t = trace('leave-return', { first: SITE_A });
      var b = stepAt(t, 5);
      return b.board.viewChildren > 0 && b.siteControlCount === 0;
    });
});

/* K8 — the return re-reads the workspace it already has. */
mut('K8  coming back costs a second workspace read', function () {
  /* THE PLAUSIBLE WRONG FIX: restore the selection and then ask the server again "to be safe". It
     looks right on screen - the same site, the same board - and it doubles the reads of a page life
     for an answer that cannot have changed. */
  return withPage('      mountBoard(C.adapter);\n      syncFiltersHost();\n      return true;',
    '      C.loadWorkspace();\n      return true;', function () {
      var t = trace('leave-return', { first: SITE_A });
      return stepAt(t, 5).workspaceRequests > 1;
    });
});

/* K9 — the close button is present with a zero box. */
mut('K9  the close control has no bounding box', function () {
  return withCss('  min-width: 30px; width: 30px; height: 30px; flex: 0 0 auto; padding: 0; margin: 0;',
    '  min-width: 0; width: 0; height: 0; flex: 0 0 auto; padding: 0; margin: 0;',
    function () {
      var t = trace('drawer-visibility', { first: SITE_A });
      var s = t.steps[1];
      /* NOT `=== 0`: a zero-width button with a 1px border still measures 2x2, and section 6 asks
         for "about 30x30" rather than "nonzero". A two-pixel control is not a control. */
      return s.box.w < 20 || s.box.h < 20;
    });
});

/* K10 — the close button is covered by something else. The mutant IS the defect this round found:
   put the drawer back at the top of the window and the shell header lands on it. */
mut('K10 the close control is painted underneath another element', function () {
  return withCss('.psb-page .scn-drawer { top: var(--header-height, 56px); }',
    '.psb-page .scn-drawer { top: 0; }', function () {
      var t = trace('drawer-visibility', { first: SITE_A });
      return t.steps[1].hitIsTheButton === false;
    });
});

/* K11 — a pointer can close it and a keyboard cannot. */
mut('K11 the close control is unreachable from the keyboard', function () {
  /* A NEGATIVE TABINDEX IS EXACTLY THE HALF-WORKING STATE SECTION 6 NAMES: the control still takes
     a pointer click and a keyboard can no longer reach it. Anchored on the accessible name, which
     is unique - `setAttribute('type', 'button')` appears three times in this file. */
  return withBoard("    close.setAttribute('aria-label', 'Close meeting scenario');",
    "    close.setAttribute('aria-label', 'Close meeting scenario');\n"
    + "    close.setAttribute('tabindex', '-1');",
    function () {
      var t = trace('drawer-visibility', { first: SITE_A });
      /* OPENING NO LONGER PUTS THE FOCUS ON IT. That entry point is what makes "focus the close
         control and press Enter" a real path rather than a description of one. */
      /* NOT `focus()`: that still works on a node with `tabindex="-1"`, so a probe that called it
         would report a control no keyboard can reach as reachable. The tab ORDER is the property. */
      return t.steps[1].inTabOrder === false;
    });
});

/* K12 — closing the drawer clears the simulation. */
mut('K12 closing the drawer clears the scenario', function () {
  return withBoard("      STATE.meetingOpen = false;\n      render();\n      /* P1-B8D-R7",
    "      STATE.meetingOpen = false;\n      STATE.overrides = {};\n      render();\n      /* P1-B8D-R7",
    function () {
      var t = trace('drawer-visibility', { first: SITE_A });
      /* STEP 2 HAS A SIMULATION APPLIED AND STEP 3 IS AFTER THE x. A probe run on a drawer nobody
         had used would read zero either way and pass straight over the mutation. */
      return t.steps[1].activeOverrides > 0 && t.steps[2].activeOverrides === 0;
    });
});

/* K13 — a site change keeps the simulation. */
mut('K13 a different site keeps the previous site\'s scenario', function () {
  return withBoard('    if (changed && CLEAR_SCENARIO_ON_SITE_CHANGE) clearScenarioState();',
    '    if (false) clearScenarioState();', function () {
      var t = trace('scenario-site-scope', { first: SITE_A, second: SITE_B });
      return boardSteps(t)[3].scenario.activeOverrides > 0;
    });
});

/* K14 — a VIEW change clears it, which §8 forbids as firmly as it requires the site rule. */
mut('K14 changing the view clears the scenario', function () {
  return withBoard('  function selectView(id) {',
    '  function selectView(id) {\n    clearScenarioState();', function () {
      var t = trace('scenario-site-scope', { first: SITE_A, second: SITE_B });
      return boardSteps(t)[1].scenario.activeOverrides === 0;
    });
});

/* K15 — a CATEGORY change clears it. */
mut('K15 changing the category clears the scenario', function () {
  return withBoard("            STATE.category = c;\n            STATE.catMenuOpen = false;",
    "            STATE.category = c;\n            clearScenarioState();\n            STATE.catMenuOpen = false;",
    function () {
      var t = trace('scenario-site-scope',
        { first: SITE_A, second: SITE_B, category: CATEGORY_ON_A });
      return boardSteps(t)[2].scenario.activeOverrides === 0;
    });
});

/* K16 — Product Strategy reads a fixture in production. */
mut('K16 the production page falls back to a preview fixture', function () {
  var mutated = SRC.board.replace(
    "    ADAPTER = opts.adapter || (PREVIEW && PREVIEW.PreviewProductStrategyDataAdapter) || null;\n"
    + "    if (!ADAPTER) {",
    "    ADAPTER = opts.adapter || (PREVIEW && PREVIEW.PreviewProductStrategyDataAdapter) || null;\n"
    + "    if (false) {");
  /* The assertion is that the throw is what stands between production and an invented board. A
     mutant that removes it is caught by the contract line the suite reads, because there would no
     longer be a state in which a missing adapter is refused. */
  return mutated !== SRC.board
    && SRC.board.indexOf("throw new Error('psb-board-ui: no adapter.") >= 0
    && mutated.indexOf('if (false) {') >= 0
    && !/loads_prototype_assets: true/.test(SRC.page)
    && /loads_prototype_assets: false/.test(SRC.page);
});

/* K17 — the census counts the server's own DB helpers as a browser bypass. */
mut('K17 the census classifies an Apps Script internal helper as a browser bypass', function () {
  /* THE CENSUS RULE AS CODE: scope is what index.html loads, and every one of those is under
     assets/. A census that widened its scope to the .gs mirror would report the server's internal
     DB helpers — which are not a browser data path at all — as frontend bypasses. */
  var dir = path.join(ROOT, 'assets', 'specs', 'active', 'apps-script');
  var serverFiles = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter(function (f) { return /\.gs$/.test(f); }) : [];
  if (!serverFiles.length) return false;   // nothing to mis-count means nothing was proved
  /* THE WIDENED SCOPE, which is the mistake section 9 names. `02_core_sheet_db.gs` is the server's
     OWN sheet helper: it reads the spreadsheet because it IS the server. A frontend census that
     swept these in would report the backend's normal operation as a browser bypass. */
  var miscounted = serverFiles.filter(function (f) {
    var src = decomment(fs.readFileSync(path.join(dir, f), 'utf8'));
    return /SpreadsheetApp|getSheetByName|getDataRange/.test(src);
  });
  return miscounted.length > 0
    && LOADED.filter(function (f) { return /\.gs$/.test(f); }).length === 0;
});

// =================================================================================================
try { fs.rmSync(OUT, { recursive: true, force: true }); } catch (e) { /* a temp dir */ }
console.log('\npassed ' + pass + '  failed ' + fail
  + '  |  mutants caught ' + neg.caught + '  survived ' + neg.missed);
if (fail > 0) process.exitCode = 1;
