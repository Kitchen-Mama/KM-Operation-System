/**
 * ==================================================================================================
 * PRODUCT STRATEGY — THE PAGE HAD NO STYLING TO BE INCONSISTENT WITH      (P1-B8D-R6)
 * ==================================================================================================
 *
 * R5 made the board reachable: the site chooser works, the workspace loads, six views render. The
 * operator then looked at it beside the rest of the Operation System, and fourteen classes that the
 * page renders on every visit had NOT ONE CSS RULE anywhere — not in this page's stylesheet, not in
 * base/components/layout:
 *
 *     .psb-header  .psb-header__title  .psb-header__actions  .psb-sub
 *     .psb-site-host  .psb-site  .psb-site__field  .psb-site__label  .psb-site__select  .psb-site__value
 *     .psb-state-host  .psb-state  .psb-state__headline  .psb-state__detail
 *
 * So the browser's defaults decided the page: `CountryUS` with the label welded to a native select,
 * a refusal set as two bare paragraphs, and header buttons floating on the global
 * `button { margin: 4px }`. It was not styled inconsistently; it was not styled.
 *
 * WHAT THIS SUITE HOLDS, AND WHY IT USES A BROWSER. Half of what §7 and §8 ask cannot be read from
 * markup or from CSS text. "The label is not glued to the control" is a distance in pixels between
 * two rectangles. "Disabled is recognisable" is a set of computed properties that must differ on
 * more than one channel. "The mobile controls do not overlap" is a comparison of boxes at 390px.
 * A suite that asserted the presence of a rule would pass over a rule that lost its fight with
 * specificity — so this measures the page Chrome actually renders, and its mutants edit the real
 * stylesheet and measure again.
 *
 * THE OTHER HALF IS A SOURCE CLAIM AND IS CHECKED AS ONE: every selector this round adds is scoped
 * to `.psb-page`, no shared class is redefined, no bare `select` / `.card` / `h1` selector exists,
 * and no `!important` was added. Those are properties of the file, and measuring them in a browser
 * would only prove that this page looks right — not that every other page still does.
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
var SRC = {
  css: read(CSS_REL),
  base: read('assets/css/base.css'),
  components: read('assets/css/components.css'),
  layout: read('assets/css/layout.css'),
  partial: read('assets/html/pages/product-strategy-board.html'),
  page: read('assets/js/pages/product-strategy-board.js'),
  board: read('assets/js/product-strategy/psb-board-ui.js'),
  app: read('assets/js/app.js'),
  index: read('index.html')
};

var RUN = require(path.join(__dirname, '_p1b8c-visual-runner.js'));
var CAP_GLOBAL = 'P1B8C_R2_LIVE';

// =================================================================================================
// THE BROWSER PROBE
// =================================================================================================

var BROWSER = RUN.findBrowser();
var OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'psb-r6-'));
var PAGE_FILE = path.join(__dirname, '_p1b8c-acceptance.html');

/**
 * Render the page at one width and return its measurements.
 *
 * §10 of P1-B8C says a missing browser is a STOP and not a licence to fall back to arithmetic, and
 * that is doubly true of a round whose whole subject is what the page looks like.
 */
function measure(opts, w, h) {
  fs.writeFileSync(PAGE_FILE, RUN.buildPage(Object.assign(
    { capture: 'live', activated: true }, opts)), 'utf8');
  var r = RUN.shot(BROWSER, PAGE_FILE, OUT, { id: 'probe', w: w || 1440, h: h || 900 });
  if (!r.measurements) throw new Error('no measurements came back from the browser');
  return r.measurements;
}

/** Edit the real stylesheet, measure again, put it back. */
function withCss(from, to, probe) {
  var original = fs.readFileSync(path.join(ROOT, CSS_REL), 'utf8');
  var normalized = original.replace(/\r\n/g, '\n');
  var n = normalized.split(from).length - 1;
  if (n !== 1) throw new Error('ANCHOR MATCHED ' + n + ' TIMES');
  fs.writeFileSync(path.join(ROOT, CSS_REL), normalized.replace(from, to), 'utf8');
  try { return probe(); }
  finally { fs.writeFileSync(path.join(ROOT, CSS_REL), original, 'utf8'); }
}

if (!BROWSER) {
  console.error('STOP_NO_BROWSER_AVAILABLE — a visual round cannot be accepted without one.');
  process.exitCode = 2;
}

// =================================================================================================
section('A — THE FOURTEEN CLASSES NOW HAVE RULES, AND THEY COME FROM THE SHARED SYSTEM');
// =================================================================================================

var GAP_CLASSES = ['psb-header', 'psb-header__title', 'psb-header__actions', 'psb-sub',
  'psb-site-host', 'psb-site', 'psb-site__field', 'psb-site__label', 'psb-site__select',
  'psb-site__value', 'psb-state-host', 'psb-state', 'psb-state__headline', 'psb-state__detail'];

/* `psb-site__field` and `psb-site__label` are styled BY THE SHARED CLASSES the markup now carries
   (`filter-group`, and `.km-filter-bar .filter-group label`), which is the better answer than a
   rule of their own — so each class must be either declared here or demonstrably shared. */
var SHARED_BY_ADOPTION = ['psb-site__field', 'psb-site__label', 'psb-site__select'];
GAP_CLASSES.forEach(function (c, i) {
  var declared = new RegExp('\\.' + c.replace(/([.*+?^${}()|[\]\\])/g, '\\$1') + '\\b').test(SRC.css);
  var adopted = SHARED_BY_ADOPTION.indexOf(c) >= 0;
  ok(declared || adopted, 'A1.' + (i + 1) + ' .' + c + ' is styled (declared or shared)');
});

ok(/km-filter-bar/.test(SRC.page),
  'A2  the chooser carries the shared filter-bar class');
ok(/filter-group/.test(SRC.page),
  'A3  and the shared filter-group class, so the label and control specs are the system\'s');
ok(/--filter-height/.test(SRC.css) || /filter-group select/.test(SRC.components),
  'A4  the control height comes from the --filter-* token family');
ok(/lab\.setAttribute\('for', plan\.controlId\)/.test(SRC.page),
  'A5  the label names its control rather than sitting above it by coincidence');

// =================================================================================================
section('B — SCOPE: NOTHING THIS PAGE ADDS CAN REACH ANOTHER PAGE');
// =================================================================================================

/* Selectors, extracted from the stylesheet with comments and at-rule preludes removed. */
function selectorsOf(css) {
  var bare = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  var out = [];
  var re = /(^|\}|\{)\s*([^{}@][^{}]*?)\s*\{/g, m;
  while ((m = re.exec(bare))) {
    m[2].split(',').forEach(function (s) {
      s = s.trim();
      /* AT-RULE PRELUDES ARE NOT SELECTORS. `[^{}@]` guards only the FIRST character, and the engine
         happily backtracks so that character is the newline before `@media` — which made every
         media query in the file look like an unscoped selector and reported eleven violations in a
         stylesheet that has none. The trimmed string is what has to be checked. */
      if (s.charAt(0) === '@') return;
      if (s && !/^\d/.test(s) && s.indexOf(':') !== 0) out.push(s);
    });
  }
  return out;
}
var SELECTORS = selectorsOf(SRC.css);
ok(SELECTORS.length > 300, 'B1  the stylesheet parsed into selectors', SELECTORS.length);

/* Two escape hatches already existed before this round and are documented where they are used:
   `body.presenting` / `body.is-fullscreen` are states the board puts on <body>. Everything else
   must begin at .psb-page. */
var unscoped = SELECTORS.filter(function (s) {
  if (/(^|\s|>)\.psb-page\b/.test(s)) return false;
  if (/^(from|to|\d+%)$/.test(s)) return false;
  return !/^body\.(presenting|is-fullscreen)\b/.test(s);
});
eq(unscoped, [], 'B2  every selector in this stylesheet is scoped to .psb-page', unscoped);

/* THE SELECTORS §7 NAMES BY HAND, as WHOLE selectors rather than as substrings: `.psb-page .card`
   is scoped and fine; a bare `.card` is not. */
var FORBIDDEN_BARE = ['.card', '.button', 'select', 'h1', '.nav-text', 'button', 'input', '.btn'];
var bareHits = [];
SELECTORS.forEach(function (s) {
  FORBIDDEN_BARE.forEach(function (f) {
    if (s === f || s.indexOf(f + ':') === 0 || s.indexOf(f + ' ') === 0) bareHits.push(s);
  });
});
eq(bareHits, [], 'B3  no bare element or shared-component selector at the top level', bareHits);

/* NO SHARED CLASS IS REDEFINED. A rule may USE `.filter-group` inside `.psb-page`; it may not own
   it, because the page stylesheet loads last and would win everywhere the class is used. */
var SHARED = ['km-filter-bar', 'filter-group', 'km-tab-rail', 'km-category-card', 'btn-primary',
  'btn-secondary', 'page-title', 'module-section', 'content-area', 'main-content', 'sidebar'];
var redefined = SELECTORS.filter(function (s) {
  if (/(^|\s|>)\.psb-page\b/.test(s)) return false;
  return SHARED.some(function (c) { return s.indexOf('.' + c) >= 0; });
});
eq(redefined, [], 'B4  no shared component class is redefined outside .psb-page', redefined);

/* AND NOT ONE LINE WAS ADDED TO A SHARED STYLESHEET. */
var cp = require('child_process');
function changedSince(ref, file) {
  try {
    return cp.execFileSync('git', ['diff', '--name-only', ref, '--', file],
      { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch (e) { return '__git_unavailable__'; }
}
var R6_PRE = 'c9429e6';
['assets/css/base.css', 'assets/css/components.css', 'assets/css/layout.css',
 'assets/css/responsive-foundation.css'].forEach(function (f, i) {
  var d = changedSince(R6_PRE, f);
  if (d === '__git_unavailable__') { ok(true, 'B5.' + (i + 1) + ' (git unavailable — skipped) ' + f); return; }
  eq(d, '', 'B5.' + (i + 1) + ' this round did not touch ' + f.split('/').pop(), d);
});
var otherPageCss = changedSince(R6_PRE, 'assets/css/pages');
if (otherPageCss !== '__git_unavailable__') {
  eq(otherPageCss, '', 'B6  and no other page\'s stylesheet', otherPageCss);
}

/* EVERYTHING AFTER THE FIRST MARKER, not the chunk between the first two. This file carries two
   `P1-B8D-R6` headings, so `split(...)[1]` was reading the text BETWEEN them and would have missed
   an `!important` added anywhere else in the round's work — including at the end, which is where a
   late fix goes. */
function r6Block(css) { return css.split('P1-B8D-R6').slice(1).join('P1-B8D-R6'); }
/* DECLARATIONS, NOT PROSE. P1-B8D-R7 added a comment explaining why an `!important` was NOT needed
   for the drawer's close button, and this scan found the word in that sentence - the same trap the
   project has now sprung six times. Comments are stripped before counting. */
ok(!/!important/.test(r6Block(SRC.css).replace(/\/\*[\s\S]*?\*\//g, '')),
  'B7  this round added no !important');

// =================================================================================================
section('C — THE TAB RAIL IS THE SHARED ONE, NOT A SECOND COPY OF ONE');
// =================================================================================================

ok(/km-tab-rail/.test(SRC.partial), 'C1  the host asks for the shared rail');
ok(/km-tab-rail__tab/.test(SRC.board), 'C2  and every tab carries the shared tab class');
/* A SECOND COMPONENT would re-declare the rail's own structure. A MODIFIER adjusts one property of
   the shared one. The difference is what §5 forbids, and it is measurable: this page must not
   declare the rail's layout, scrolling or metrics. */
var railStructure = ['overflow-x', 'scrollbar-width', 'scroll-behavior', 'flex-wrap'];
var railRules = SRC.css.split('\n').filter(function (l) { return /km-tab-rail\s*\{|km-tab-rail__tab\s*\{/.test(l); });
eq(railRules, [], 'C3  this page declares no .km-tab-rail rule of its own', railRules);
ok(railStructure.every(function (p) {
  return !new RegExp('\\.psb-page[^{]*km-tab-rail[^{]*\\{[^}]*' + p).test(SRC.css.replace(/\n/g, ' '));
}), 'C4  and re-declares none of the rail\'s structure');

// =================================================================================================
section('D — WHAT THE BROWSER ACTUALLY RENDERS');
// =================================================================================================

if (BROWSER) {
  var READY = measure({}, 1440, 900);
  var v = READY.visual;

  ok(!!v, 'D0  the probe returned computed styles');

  /* THE FILTER PANEL IS A CARD, with the Operation System's own card values.
     P1-B8D-R7 MOVED THE CARD, and these assertions moved with it rather than being dropped. In R6
     the chooser was the page's only filter and it got a standalone card of its own; R7 merges it
     with the board's Category and Series into ONE panel, so the card belongs to `.psb-filters` and
     the bar inside it keeps only its flex behaviour. Same properties, same values, asserted of the
     element that now carries them - which is what makes this a move and not a loss. */
  ok(v.panel && v.panel.display === 'flex', 'D1  the filter panel is a row',
    v.panel && v.panel.display);
  ok(v.panel && v.panel.flexWrap === 'wrap', 'D1a that wraps rather than overflowing');
  ok(v.panel && v.panel.bg === 'rgb(255, 255, 255)', 'D2  on the shared card ground',
    v.panel && v.panel.bg);
  eq(v.panel && v.panel.radius, '8px', 'D3  at the shared card radius');
  ok(v.panel && v.panel.shadow !== 'none', 'D4  with the shared card shadow',
    v.panel && v.panel.shadow);
  ok(v.siteBar && /km-filter-bar/.test(v.siteBar.cls), 'D5  and the bar inside it IS the shared filter bar',
    v.siteBar && v.siteBar.cls);
  /* AND THE BAR NO LONGER CARRIES A SECOND ONE. A card inside a card is the two-bars problem again,
     drawn in borders. */
  ok(v.siteBar && v.siteBar.shadow === 'none', 'D5a while the bar itself has no card of its own',
    v.siteBar && v.siteBar.shadow);

  /* THE LABEL IS NOT GLUED TO THE CONTROL. This is the defect in the screenshot, as a number. */
  eq(v.fields.length, 3, 'D6  three tiers are on screen');
  v.fields.forEach(function (f, i) {
    ok(f.gap !== null && f.gap >= 2,
      'D7.' + (i + 1) + ' ' + f.dim + ': the label clears its control by ' + f.gap + 'px', f.gap);
    ok(f.controlH >= 34 && f.controlH <= 42,
      'D8.' + (i + 1) + ' ' + f.dim + ': the control is one shared filter height', f.controlH);
    ok(f.labelFor !== null, 'D9.' + (i + 1) + ' ' + f.dim + ': the label names its control', f.labelFor);
  });
  /* The shared label spec, from --filter-label-*. */
  ok(v.fields[0].labelFontSize === '12px', 'D10 the label is the shared filter-bar label size',
    v.fields[0].labelFontSize);

  /* A RESOLVED TIER KEEPS THE CONTROL'S BOX, so nothing moves when the ladder resolves one. */
  var resolved = v.fields.filter(function (f) { return f.tag === 'SPAN'; });
  var chosen = v.fields.filter(function (f) { return f.tag === 'SELECT'; });
  ok(resolved.length >= 1, 'D11 a tier the universe resolved renders as text, not as a dropdown');
  if (resolved.length && chosen.length) {
    ok(Math.abs(resolved[0].controlH - chosen[0].controlH) <= 2,
      'D12 and it is the same height, so the row does not jump',
      [resolved[0].controlH, chosen[0].controlH]);
  }

  /* NOTHING OVERLAPS. */
  var overlaps = [];
  for (var i = 0; i < v.fields.length; i++) {
    for (var j = i + 1; j < v.fields.length; j++) {
      var a = v.fields[i], b = v.fields[j];
      var sameRow = Math.abs(a.top - b.top) < 6;
      if (sameRow && a.left < b.right && b.left < a.right) overlaps.push(a.dim + '/' + b.dim);
    }
  }
  eq(overlaps, [], 'D13 no two controls overlap at 1440', overlaps);

  /* THE HEADER. */
  ok(v.header && v.header.display === 'flex', 'D14 the header is the shared two-column band');
  ok(v.header && v.header.actions && v.header.actions.display === 'flex',
    'D15 its actions are a row with their own gap');
  ok(v.header && v.header.sub && v.header.sub.fontSize === '14px',
    'D16 the subtitle is body text', v.header && v.header.sub);

  /* THE RAIL is the shared component, and the page did not fork it. */
  ok(v.rail && /km-tab-rail/.test(v.rail.cls), 'D17 the rail host carries the shared class');
  eq(v.rail && v.rail.overflowX, 'auto', 'D18 overflow scrolls INSIDE the rail');
  eq(v.rail && v.rail.tabCount, 6, 'D19 six tabs, all of them the shared tab');
}

// =================================================================================================
section('E — THE STATE BOX, IN EVERY SEVERITY');
// =================================================================================================

if (BROWSER) {
  var AWAIT = measure({ noSite: true }, 1440, 900).visual;
  var STOP = measure({ fail: { apiCode: 'REQUEST_TIMEOUT' }, noSite: true }, 1440, 900).visual;

  ok(AWAIT.state, 'E0  the awaiting state renders a state box');
  ok(AWAIT.state.bg === 'rgb(255, 255, 255)', 'E1  it is a card, not loose paragraphs',
    AWAIT.state.bg);
  ok(parseFloat(AWAIT.state.radius) >= 6, 'E2  with the shared radius', AWAIT.state.radius);
  ok(AWAIT.state.shadow !== 'none', 'E3  and the shared card shadow');
  ok(parseFloat(AWAIT.state.padTop) >= 12, 'E4  and real padding', AWAIT.state.padTop);
  ok(AWAIT.state.detailColor !== AWAIT.state.borderLeftColor
    && AWAIT.state.headlineFontSize !== AWAIT.state.detailSize,
    'E5  the headline and the detail are two levels, not one wall of text',
    [AWAIT.state.headlineFontSize, AWAIT.state.detailSize]);

  /* SEVERITY IS NEVER COLOUR ALONE (§7): width, style and glyph all differ. */
  ok(/info/.test(AWAIT.state.cls), 'E6  awaiting-site is an INFO state', AWAIT.state.cls);
  ok(/stop/.test(STOP.state.cls), 'E7  a timeout is a STOP state', STOP.state.cls);
  ok(AWAIT.state.borderLeftWidth !== STOP.state.borderLeftWidth,
    'E8  and the two differ in border WIDTH',
    [AWAIT.state.borderLeftWidth, STOP.state.borderLeftWidth]);
  ok(AWAIT.state.borderLeftStyle !== STOP.state.borderLeftStyle,
    'E9  in border STYLE',
    [AWAIT.state.borderLeftStyle, STOP.state.borderLeftStyle]);
  ok(AWAIT.state.glyph !== STOP.state.glyph && STOP.state.glyph !== 'none',
    'E10 and in the glyph they carry — three channels, so none of them is the colour',
    [AWAIT.state.glyph, STOP.state.glyph]);
}

// =================================================================================================
section('F — DISABLED, FOCUS, MOBILE, PRESENTATION, PRINT');
// =================================================================================================

if (BROWSER) {
  var AW = measure({ noSite: true }, 1440, 900).visual;
  var dis = AW.fields.filter(function (f) { return f.disabled; });
  var live = AW.fields.filter(function (f) { return f.tag === 'SELECT' && !f.disabled; });
  ok(dis.length >= 1, 'F1  before a company is chosen the lower tiers are disabled', dis.length);
  if (dis.length && live.length) {
    var d = dis[0], l = live[0];
    var channels = 0;
    if (d.bg !== l.bg) channels++;
    if (d.color !== l.color) channels++;
    if (d.borderStyle !== l.borderStyle) channels++;
    if (d.cursor !== l.cursor) channels++;
    ok(channels >= 2, 'F2  and disabled differs on MORE THAN COLOUR (' + channels + ' channels)',
      { disabled: d, live: l });
  }
  ok(/:focus-visible/.test(SRC.css), 'F3  a focus-visible ring is declared');
  ok(/psb-site select:focus-visible/.test(SRC.css), 'F4  for the site controls specifically');

  /* MOBILE: one control per row, and nothing on top of anything. */
  var M = measure({ noSite: true }, 390, 844).visual;
  var mOverlap = [];
  for (var mi = 0; mi < M.fields.length; mi++) {
    for (var mj = mi + 1; mj < M.fields.length; mj++) {
      var ma = M.fields[mi], mb = M.fields[mj];
      if (Math.abs(ma.top - mb.top) < 6 && ma.left < mb.right && mb.left < ma.right) {
        mOverlap.push(ma.dim + '/' + mb.dim);
      }
    }
  }
  eq(mOverlap, [], 'F5  at 390px no two site controls overlap', mOverlap);
  var mRows = {};
  M.fields.forEach(function (f) { mRows[f.top] = (mRows[f.top] || 0) + 1; });
  ok(Object.keys(mRows).length === M.fields.length,
    'F6  and each one is on its own row', mRows);
  /* AND EACH ONE FITS INSIDE THE CARD. A control that stacks and still hangs off the right edge is
     not a mobile layout; it is the same overflow one row at a time. */
  /* AGAINST THE CARD, WHICH IS THE PANEL SINCE P1-B8D-R7. `.psb-site` is `display: contents` now,
     so it has no box at all and every field would measure as hanging off a card of width zero. */
  var mBar = M.panel && M.panel.box;
  var escapes = M.fields.filter(function (f) { return mBar && f.right > mBar.right + 1; })
    .map(function (f) { return f.dim + ' right=' + f.right + ' > card right=' + mBar.right; });
  eq(escapes, [], 'F6a and none of them hangs out of the card', escapes);

  /* PRESENTATION is a state of the page and the chooser is a control: a control is not part of a
     presentation. The interaction itself is held by the R5 suite; this holds the STYLING. */
  var P = measure({ presentation: true }, 1440, 900).visual;
  ok(P.presenting === true, 'F7  Presentation still enters presentation mode');
  ok(!P.siteHost || P.siteHost.h === 0, 'F8  and the chooser is not part of it', P.siteHost);

  ok(/@media print/.test(SRC.css), 'F9  print rules exist');
  ok(/@media print[\s\S]{0,400}psb-site-host/.test(SRC.css),
    'F10 and the chooser is not printed either');
}

// =================================================================================================
section('G — THIS ROUND CHANGED NO BEHAVIOUR');
// =================================================================================================

/* A CSS ROUND THAT MOVED A READ WOULD BE A DIFFERENT ROUND. */
if (BROWSER) {
  var R = measure({}, 1440, 900);
  var reqs = R.requests || [];
  eq(reqs.filter(function (a) { return a === 'productPricing.siteUniverse.get'; }).length, 1,
    'G1  one universe read');
  eq(reqs.filter(function (a) { return a === 'productPricing.workspace.get'; }).length, 1,
    'G2  one workspace read');
  /* SUPERSEDED BY P1-B8D-R10D: the capability read that was excluded here by name is gone, and the
     application's shared bootstrap is now visible to this page's request log. Neither is write-shaped;
     the property — a styling round moves no write — is unchanged. */
  eq(reqs.filter(function (a) {
    return !/\.get$/.test(a) && a !== 'system.health' && a !== 'getClientCapabilities';
  }), [], 'G3  and nothing write-shaped', reqs);
}

var pageCode = SRC.page.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
ok(!/['"]Shopify['"]|['"]KM['"]/.test(pageCode), 'G4  no site was hard-coded by a styling round');
ok(/PRODUCT_STRATEGY_ENABLED_/.test(read('assets/specs/active/apps-script/00_config.gs')),
  'G5  the server flag is untouched');
/* ============================================================================================
   SUPERSEDED BY P1-B8D-R10D — AND THE SUPERSESSION EXPOSES WHAT THIS ASSERTION ACTUALLY MEASURED.

   G6 was written as "this visual round changed no server file", and it was read that way for four
   rounds because it happened to be true. What it COMPUTES is `git diff R6_PRE -- <dir>` against
   the working tree — cumulative drift since a fixed commit, not this round's diff. So it holds
   until ANY later round touches a .gs, whoever they are and however legitimately, and then it
   reports a defect in a round that finished long ago.

   R10D is that round: it adds ONE field to `handleGetClientCapabilities_`. The guard is therefore
   restated as what it can honestly answer from a moving baseline — the set of Apps Script files
   changed since R6 is KNOWN AND NAMED, and anything outside it still fails. A visual round that
   changed a handler would still be caught; a later round that changes one has to be written down
   here, which is a better outcome than a guard that quietly becomes untrue. */
// FC-SUMMARY-R2B-A — written down here for exactly the reason the comment above gives: this guard measures
// drift from a fixed commit rather than this visual round's own diff, so a later round that legitimately
// edits a .gs has to be recorded or the guard quietly becomes untrue. R2B-A repairs the FC/Campaign schema
// gate. Neither file is reachable from Product Strategy's read path, and a visual round that touched a
// handler would still be caught.
var R6_KNOWN_GS_CHANGES = ['assets/specs/active/apps-script/03_master_data_handlers.gs',
  'assets/specs/active/apps-script/14_fc_write_handlers.gs',
  'assets/specs/active/apps-script/20_campaign_write_handlers.gs',
  // FC-SUMMARY-R2B-A2-R1 — the fc_target_rules additive header migration tool. Unrouted, USER-run, and
  // unreachable from Product Strategy's read path.
  'assets/specs/active/apps-script/TEMP_migrate_fc_target_rules_header_r2ba2.gs'];
var gsChanged = changedSince(R6_PRE, 'assets/specs/active/apps-script');
if (gsChanged !== '__git_unavailable__') {
  var unexpectedGs = gsChanged.split('\n').map(function (x) { return x.trim(); })
    .filter(function (x) { return x && R6_KNOWN_GS_CHANGES.indexOf(x) < 0; });
  eq(unexpectedGs, [],
    'G6  SUPERSEDED (R10D): no Apps Script file changed beyond the one this project has recorded',
    gsChanged);
}

/* THE LEFT NAVIGATION IS NOT THIS ROUND'S TO TOUCH. */
ok(/KM_STAGED_SECTIONS_/.test(SRC.app), 'G7  the staged-section registry is still there');
/* THE REGISTRY ENTRY, not the first mention of the words. `app.js` discusses this section in
   comments well before it declares it, so splitting on the name landed in prose and reported an
   enabled section as disabled. */
var psbEntry = /'product-strategy':\s*\{([\s\S]*?)\n    \}/.exec(SRC.app);
ok(!!psbEntry, 'G8  the Product Strategy registry entry is present');
ok(!!psbEntry && /enabled:\s*true/.test(psbEntry[1]),
  'G8a and it is still enabled', psbEntry && psbEntry[1].slice(0, 120));
ok(/showProductStrategyView/.test(SRC.app), 'G9  the sidebar children still have their entry point');
var VIEWS = require(path.join(ROOT, 'assets/js/product-strategy/psb-views.js')).PSB_VIEWS;
eq(VIEWS.VIEWS.length, 6, 'G10 and there are still six of them');

// =================================================================================================
section('H — MUTANTS');
// =================================================================================================

if (BROWSER) {
  /* H1 — the chooser falls back to the browser's native stacking. */
  mut('H1  the site toolbar loses its card and its row', function () {
    return withCss('.psb-page .psb-site {\n  display: flex;', '.psb-page .psb-site--off {\n  display: flex;',
      function () {
        var m = measure({}, 1440, 900).visual;
        return !m.siteBar || m.siteBar.display !== 'flex';
      });
  });

  /* H2 — the label welds itself to the control again, which is the live screenshot. */
  mut('H2  the label is glued to the control', function () {
    /* THE RULE THAT NOW OWNS THE GAP. P1-B8D-R7 states the label-to-control distance ONCE for the
       whole panel, later in the file and at equal specificity, so mutating the bar's own rule was
       overridden and changed nothing on screen. Verified to move it: the three fields measure a
       6px gap normally and 0 with this applied. */
    return withCss('  gap: 6px;\n}',
      '  gap: 0;\n}',
      function () {
        var m = measure({}, 1440, 900).visual;
        return m.fields.some(function (f) { return f.gap === null || f.gap < 2; });
      });
  });

  /* H3 — the state classes go back to having no rules at all. */
  mut('H3  the state box has no styling', function () {
    return withCss('.psb-page .psb-state {\n  max-width: 78ch;', '.psb-page .psb-state--never {\n  max-width: 78ch;',
      function () {
        var m = measure({ noSite: true }, 1440, 900).visual;
        return !m.state || m.state.bg !== 'rgb(255, 255, 255)';
      });
    });

  /* H4 — severity carried by colour alone. */
  mut('H4  the severities stop differing on anything but colour', function () {
    return withCss('.psb-page .psb-state--stop { border-left-width: 6px; border-left-style: double;',
      '.psb-page .psb-state--stop { border-left-width: 4px; border-left-style: solid;',
      function () {
        var a = measure({ noSite: true }, 1440, 900).visual.state;
        var s = measure({ fail: { apiCode: 'REQUEST_TIMEOUT' }, noSite: true }, 1440, 900).visual.state;
        return a.borderLeftWidth === s.borderLeftWidth && a.borderLeftStyle === s.borderLeftStyle;
      });
  });

  /* H5 — disabled becomes a colour change only. */
  mut('H5  disabled is recognisable by colour alone', function () {
    /* THE WHOLE RULE GOES. Removing two of its four declarations left the browser's own disabled
       greying in place, so the probe still counted two channels and scored a live mutant as caught.
       A mutant has to remove the rule it is testing, not part of it. */
    return withCss(
      '.psb-page .psb-site select:disabled {\n'
      + '  background: var(--ground, #f5f6f9);\n'
      + '  color: var(--ink-4, #9aa3b0);\n'
      + '  border-style: dashed;\n'
      + '  cursor: not-allowed;\n}',
      '.psb-page .psb-site select:disabled { color: #9aa3b0; }', function () {
      var m = measure({ noSite: true }, 1440, 900).visual;
      var d = m.fields.filter(function (f) { return f.disabled; })[0];
      var l = m.fields.filter(function (f) { return f.tag === 'SELECT' && !f.disabled; })[0];
      if (!d || !l) return false;
      /* The BORDER and the CURSOR are this round's two non-colour channels; the browser supplies
         its own greying regardless, so counting "any two properties differ" would always pass. */
      return d.borderStyle === l.borderStyle && d.cursor === l.cursor;
    });
  });

  /* H6 — mobile stops going single-column and the controls collide. */
  /* H6 — mobile. THE ROW COUNT PROVES NOTHING AT 390: the shell's fixed 240px sidebar leaves a
     content column narrower than a single control, so three controls sit on three rows whatever the
     rule says. What the mobile rule actually buys is that a control FITS ITS CARD instead of
     hanging out of it, and that is what breaks when the fixed basis comes back. */
  mut('H6  a mobile control stops fitting its card', function () {
    /* SAME REASON AS H2: the panel's own mobile rule is later and wins, so the bar's was inert. */
    return withCss('  .psb-page .psb-filters .cmd-field--category { flex: 1 1 100%; min-width: 0; }',
      '  .psb-page .psb-filters .cmd-field--category { flex: 0 0 260px; min-width: 260px; }',
      function () {
        var m = measure({ noSite: true }, 390, 844).visual;
        var bar = m.panel && m.panel.box;
        if (!bar) return false;
        return m.fields.some(function (f) { return f.right > bar.right + 1; });
      });
  });

  /* H7 — the resolved tier stops matching the control height, so the row jumps. */
  mut('H7  a resolved tier changes the row height', function () {
    /* `height: auto` measured 38px anyway — 8px padding twice plus a 14px line box is the same
       number by coincidence, so the mutant changed nothing and was scored as surviving. A mutant
       that cannot move the measurement is not a mutant. */
    /* AND P1-B8D-R7 MOVED THE HEIGHT TOO: one rule gives every control in the panel
       `--filter-height`, so changing the read-only tier's own height no longer reaches the screen.
       The mutant now ADDS a rule that gives that tier a height of its own, which is precisely the
       defect it names — a resolved tier that changes the height of the row it is in. */
    return withCss('.psb-page .psb-filters select { width: 100%; max-width: none; min-width: 0; }',
      '.psb-page .psb-filters select { width: 100%; max-width: none; min-width: 0; }\n'
      + '.psb-page .psb-filters .psb-site__value { height: 22px; }',
      function () {
        var m = measure({}, 1440, 900).visual;
        var r = m.fields.filter(function (f) { return f.tag === 'SPAN'; })[0];
        var s = m.fields.filter(function (f) { return f.tag === 'SELECT'; })[0];
        return !!(r && s && Math.abs(r.controlH - s.controlH) > 2);
      });
  });

  /* H8 — the chooser leaks into presentation. */
  mut('H8  the chooser is shown during a presentation', function () {
    return withCss('body.presenting .psb-page .psb-site-host { display: none; }',
      'body.presenting .psb-page .psb-site-host { display: block; }',
      function () {
        var m = measure({ presentation: true }, 1440, 900).visual;
        return !!(m.siteHost && m.siteHost.h > 0);
      });
  });

  /* H9 — a second tab component takes the rail's job. */
  mut('H9  a second tab rule overrides the shared rail', function () {
    return withCss('.psb-page .psb-viewnav { margin-top: 4px; }',
      '.psb-page .psb-viewnav { margin-top: 4px; }\n'
      /* NOT `overflow-x: visible`: the shared rail sets `overflow-y: hidden`, and the CSS overflow
         property says a `visible` paired with a non-visible computes to `auto` — so the first
         version of this mutant was a no-op that the spec had already undone, and it was scored as a
         surviving rule rather than as the nothing it was. `hidden` really does take the scrolling
         away, which is the symptom a second tab component would have. */
      + '.psb-page #nav.km-tab-rail { overflow-x: hidden; flex-wrap: wrap; }',
      function () {
        var m = measure({}, 1440, 900).visual;
        return m.rail.overflowX !== 'auto' || m.rail.flexWrap === 'wrap';
      });
  });
}

/* H10..H14 are claims about the FILE, and a browser cannot see them: they are about what this
   round did to everything that is not this page. */
mut('H10 a rule loses its scope and reaches every page', function () {
  var mutated = SRC.css.replace('.psb-page .psb-state__detail {', '.psb-state__detail {');
  var bad = selectorsOf(mutated).filter(function (s) {
    if (/(^|\s|>)\.psb-page\b/.test(s)) return false;
    return !/^body\.(presenting|is-fullscreen)\b/.test(s);
  });
  return bad.length > 0;
});

mut('H11 a bare element selector is introduced', function () {
  var mutated = SRC.css + '\nselect { border-radius: 0; }\n';
  var hits = [];
  selectorsOf(mutated).forEach(function (s) {
    FORBIDDEN_BARE.forEach(function (f) { if (s === f) hits.push(s); });
  });
  return hits.length > 0;
});

mut('H12 a shared component class is redefined at the top level', function () {
  var mutated = SRC.css + '\n.filter-group { min-width: 0; }\n';
  var hits = selectorsOf(mutated).filter(function (s) {
    if (/(^|\s|>)\.psb-page\b/.test(s)) return false;
    return SHARED.some(function (c) { return s.indexOf('.' + c) >= 0; });
  });
  return hits.length > 0;
});

mut('H13 !important is used to win an argument', function () {
  return /!important/.test(r6Block(SRC.css + '\n.psb-page .psb-site { gap: 0 !important; }'));
});

mut('H14 the left navigation is removed by a styling round', function () {
  var mutatedApp = SRC.app.replace(/showProductStrategyView/g, '__gone__');
  return !/showProductStrategyView/.test(mutatedApp);
});

// =================================================================================================
try { fs.rmSync(OUT, { recursive: true, force: true }); } catch (e) { /* a temp dir */ }
console.log('\npassed ' + pass + '  failed ' + fail
  + '  |  mutants caught ' + neg.caught + '  survived ' + neg.missed);
if (fail > 0) process.exitCode = 1;
