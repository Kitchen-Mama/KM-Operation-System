/**
 * ==================================================================================================
 * PRODUCT STRATEGY — INFORMATION ARCHITECTURE, SUB-TABS, STATE MATRIX, RESPONSIVE   (P1-B8B)
 * ==================================================================================================
 *
 * THE ROUND ASKS FOR A MENU AND SIX SUB-TABS. Three of the things it asks for could not be built as
 * specified, and this suite is where each of those is MEASURED rather than asserted away.
 *
 *   1. THERE IS NO "Price Center". The menu the brief names is called **Pricing Center** and its
 *      `data-menu-id` is the historical `carrier`. §A pins the anchor to the id and proves it
 *      resolves in index.html, so "above Pricing Center" is a fact about the document rather than an
 *      ordinal that the next menu addition silently invalidates.
 *
 *   2. THERE IS NO ROUTER IN THIS SHELL, so "reload restores the canonical route" and "back/forward
 *      behaves like the rest of the system" are in tension: the rest of the system has no history
 *      entries at all and a reload always returns to Home. §D proves the route IDENTITY is real —
 *      one canonical string per view, on the sidebar child, on the tab, accepted by the controller
 *      and read back from it — and §D9 proves the URL is deliberately NOT written, because a hash
 *      this shell cannot read back is a URL that cannot be pasted.
 *
 *   3. 390x844 DOES NOT FIT, AND NOT BECAUSE OF THIS PAGE. `.sidebar` is a fixed 240px with NO
 *      breakpoint anywhere in assets/css, and `.main-content` carries `margin-left: 240px`
 *      unconditionally. On a 390px phone every page in the application gets 86px of content width.
 *      §I measures all seven viewports and states which ones the SHELL can deliver.
 *
 * WHAT THE ROUND DID FIND, which nobody was looking for: the board stylesheet's `@media (max-width:
 * 1000px)` and `body.presenting` blocks hid `.nav-text` on anything inside `.psb-page`. Those rules
 * collapse the PROTOTYPE's dark sidebar to icons, which is right for a 64px column. Scoped to the
 * page rather than to the sidebar, they also stripped the labels off the PRODUCTION view tabs on
 * every tablet and phone in §7's matrix. §F is where that cannot come back.
 * ==================================================================================================
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..', '..');
var JS = path.join(ROOT, 'assets', 'js');
var H = require(path.join(__dirname, '_psb-harness.js'));

function read(p) { return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n'); }
function readRoot(p) { return read(path.join(ROOT, p)); }
/** Comments AND string literals out — a file's own prose names everything it promises not to do. */
function bare(src) {
  src = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  src = src.split('\n').map(function (l) { return l.split('//')[0]; }).join('\n');
  return src.replace(/'(?:\\.|[^'\\\n])*'/g, "''").replace(/"(?:\\.|[^"\\\n])*"/g, '""');
}

var SRC = {
  index: readRoot('index.html'),
  app: read(path.join(JS, 'app.js')),
  views: read(path.join(JS, 'product-strategy', 'psb-views.js')),
  board: read(path.join(JS, 'product-strategy', 'psb-board-ui.js')),
  page: read(path.join(JS, 'pages', 'product-strategy-board.js')),
  accessor: read(path.join(JS, 'api', 'km-product-pricing-workspace.js')),
  live: read(path.join(JS, 'product-strategy', 'km-product-strategy-live-adapter.js')),
  universe: read(path.join(JS, 'product-strategy', 'km-product-strategy-site-universe.js')),
  partial: readRoot('assets/html/pages/product-strategy-board.html'),
  css: readRoot('assets/css/product-strategy-board.css'),
  components: readRoot('assets/css/components.css'),
  base: readRoot('assets/css/base.css'),
  layout: readRoot('assets/css/layout.css'),
  protoIndex: readRoot('docs/prototypes/product-strategy-board/index.html'),
  config: readRoot('assets/specs/active/apps-script/00_config.gs')
};

var LAYOUT = require(path.join(JS, 'product-strategy', 'psb-chart-layout.js'));
LAYOUT = LAYOUT.PSB_CHART_LAYOUT || global.PSB_CHART_LAYOUT || LAYOUT;
var VIEWS = require(path.join(JS, 'product-strategy', 'psb-views.js')).PSB_VIEWS;

var pass = 0, fail = 0, mutCaught = 0, mutSurvived = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra === undefined ? '' : '  ' + JSON.stringify(extra))); }
}
function eq(a, b, label) {
  var A = JSON.stringify(a), B = JSON.stringify(b);
  ok(A === B, label, A === B ? undefined : { got: a, want: b });
}

/**
 * A MUTANT IS A CLAIM THAT A RULE IS LOAD-BEARING. `anchor` must appear exactly once — an anchor that
 * matches zero times makes the swap a silent no-op and the mutant dies for a reason that has nothing
 * to do with the rule, which P1-B8A caught twice and is the worst failure mode available: a count
 * that says something was checked when nothing was.
 */
function mut(label, file, anchor, replacement, detect) {
  var src = SRC[file];
  var n = src.split(anchor).length - 1;
  if (n !== 1) {
    mutSurvived++;
    console.log('  MUTANT ANCHOR ' + n + 'x (not 1) — ' + label);
    return;
  }
  var mutated = src.split(anchor).join(replacement);
  if (mutated === src) {
    mutSurvived++;
    console.log('  MUTANT NO-OP — ' + label);
    return;
  }
  var caught = false;
  try { caught = detect(mutated) === true; } catch (e) { caught = true; }
  if (caught) { mutCaught++; console.log('  mutant caught — ' + label); }
  else { mutSurvived++; console.log('  MUTANT SURVIVED — ' + label); }
}

// ===================================================================================================
// THE SHELL, RUN FOR REAL
// ===================================================================================================
/**
 * app.js loaded into the DOM shim, with psb-views.js before it, the way index.html orders them.
 *
 * LOADED RATHER THAN READ. §3 asks for proof that a menu built by a test harness still cannot open
 * the page, and reading `showSection` cannot show that — only calling it can. The sidebar element is
 * the one from index.html by id and class, so `toggleSidebar` and `toggleMenu` operate on the real
 * shapes.
 */
function shell(mutateApp, mutateViews) {
  var dom = H.makeDom(function (d, head, body, mk) {
    var nav = mk('nav');
    nav.className = 'sidebar';
    nav.id = 'appSidebar';
    body.appendChild(nav);
    var main = mk('div');
    main.className = 'main-content';
    body.appendChild(main);
  });
  dom.window.addEventListener = function () {};
  dom.window.removeEventListener = function () {};
  var sb = { console: { log: function () {}, warn: function () {}, error: function () {} } };
  sb.window = dom.window;
  sb.document = dom.document;
  sb.globalThis = sb;
  sb.setTimeout = setTimeout; sb.clearTimeout = clearTimeout;
  sb.setInterval = function () { return 0; }; sb.clearInterval = function () {};
  sb.requestAnimationFrame = function (f) { return setTimeout(f, 0); };
  vm.createContext(sb);
  var v = SRC.views;
  if (mutateViews) v = mutateViews(v);
  vm.runInContext(v, sb, { filename: 'psb-views.js' });
  dom.window.PSB_VIEWS = sb.PSB_VIEWS;
  var a = SRC.app.replace(/^﻿/, '');
  if (mutateApp) a = mutateApp(a);
  var thrown = null;
  try { vm.runInContext(a, sb, { filename: 'app.js' }); } catch (e) { thrown = e; }
  return { dom: dom, sb: sb, thrown: thrown, KM: dom.window.KM || {},
    sidebar: dom.document.getElementById('appSidebar') };
}

/** Build the staged menu and put it in the sidebar, the way only a test ever does. */
function mountStagedMenu(s) {
  var m = s.KM.nav.buildStagedMenu('product-strategy', s.dom.document);
  s.sidebar.appendChild(m.parent);
  s.sidebar.appendChild(m.children);
  return m;
}

/** The production partial, with the board rendered into it over a fixture adapter. */
function productionBoard(mutateBoard) {
  var dom = H.makeDom(H.productionSkeleton(SRC.partial));
  var sb = { console: { log: function () {}, warn: function () {}, error: function () {} } };
  sb.window = dom.window; sb.document = dom.document; sb.Event = dom.Event;
  sb.globalThis = sb; sb.PSB_BOARD_DEFER = true;
  sb.setTimeout = setTimeout; sb.clearTimeout = clearTimeout;
  sb.requestAnimationFrame = function (f) { return setTimeout(f, 0); };
  vm.createContext(sb);
  ['psb-data-contract.js', 'psb-chart-layout.js', 'psb-selectors.js', 'psb-views.js']
    .forEach(function (f) {
      vm.runInContext(read(path.join(JS, 'product-strategy', f)), sb, { filename: f });
    });
  vm.runInContext(read(path.join(ROOT, 'docs', 'prototypes', 'product-strategy-board',
    'preview-fixture.js')), sb, { filename: 'preview-fixture.js' });
  var b = SRC.board;
  if (mutateBoard) b = mutateBoard(b);
  var thrown = null;
  try {
    vm.runInContext(b, sb, { filename: 'psb-board-ui.js' });
    sb.PSB_BOARD.mount({ adapter: sb.PSB_PREVIEW.PreviewProductStrategyDataAdapter });
  } catch (e) { thrown = e; }
  return { dom: dom, sb: sb, thrown: thrown, doc: dom.document,
    board: sb.PSB_BOARD, nav: dom.document.getElementById('nav') };
}

function tabs(p) { return p.doc.getElementById('nav').querySelectorAll('.navbtn'); }

console.log('\n===================================================================================');
console.log('PRODUCT STRATEGY — P1-B8B  INFORMATION ARCHITECTURE, SUB-TABS, STATES, RESPONSIVE');
console.log('===================================================================================');

// ===================================================================================================
console.log('\n=== §A  THE MENU GOES ABOVE PRICING CENTER, AND THE ANCHOR IS AN ID ===');
// ===================================================================================================
(function () {
  var s = shell();
  ok(s.thrown === null, 'A1 app.js loads in the shell', s.thrown && s.thrown.message);

  var entry = s.sb.KM_STAGED_SECTIONS_['product-strategy'];
  ok(!!entry && !!entry.nav, 'A2 the staged section declares where its menu goes');
  eq(entry.nav.label, 'Product Strategy', 'A3 under the name the brief uses');
  eq(entry.nav.insertBefore, 'carrier', 'A4 anchored to a menu id, not to an ordinal');

  /* THE BRIEF SAYS "Price Center". THE APPLICATION SAYS "Pricing Center", and its data-menu-id is
     the historical `carrier`. Both halves are asserted, because the second is the one an edit can
     break silently: renaming the label would leave this passing, renaming the id would not. */
  var anchorTag = new RegExp('data-menu-id="' + entry.nav.insertBefore + '"');
  ok(anchorTag.test(SRC.index), 'A5 and that id really exists in index.html');
  var anchorPos = SRC.index.indexOf('data-menu-id="' + entry.nav.insertBefore + '"');
  var anchorBlock = SRC.index.slice(Math.max(0, anchorPos - 400), anchorPos + 200);
  ok(/Pricing Center/.test(anchorBlock),
    'A6 the anchor is the menu the brief calls "Price Center" — it is labelled Pricing Center');

  /* IT IS A PARENT, NOT A LEAF. §2 asks for the Operation System's nested-navigation pattern, which
     is only a pattern if there are children to nest. */
  var kids = s.KM.nav.stagedChildren('product-strategy');
  eq(kids.length, 6, 'A7 six children — a parent with a submenu, not a single item');

  /* THE MARKUP IS THE SHELL'S OWN. A menu that merely looks like the others drifts from them. */
  var m = mountStagedMenu(s);
  eq(m.parent.className, 'menu-parent', 'A8 the parent uses the shell class');
  eq(m.children.className, 'menu-children', 'A9 and so does the child list');
  eq(m.parent.getAttribute('data-menu-id'), m.children.getAttribute('data-parent'),
    'A10 wired by the same data-menu-id/data-parent pair every other group uses');
  eq(m.children.childNodes.map(function (n) { return n.className; }),
    ['menu-item', 'menu-item', 'menu-item', 'menu-item', 'menu-item', 'menu-item'],
    'A11 and every child is a plain .menu-item');

  /* THERE IS EXACTLY ONE SIDEBAR. §2 forbids a second, and the prototype has one to copy. */
  eq(s.dom.document.querySelectorAll('.sidebar').length, 1, 'A12 one sidebar in the shell');
  ok(!/class="side"/.test(SRC.partial) && !/id="side"/.test(SRC.partial),
    'A13 and the production partial contributes no second one');
  ok(!/navigation-rail|nav-rail/.test(SRC.partial), 'A14 nor a navigation rail');
}());

// ===================================================================================================
console.log('\n=== §B  THE PRODUCTION DEFAULT OFFERS NO ENTRY, AND THE MENU IS NOT THE GATE ===');
// ===================================================================================================
(function () {
  /* ABSENT, NOT GREYED OUT. §3 forbids opening the feature by deleting a CSS class, which is only a
     guarantee if there is no element to un-grey. The Operation System has a `menu-item--disabled`
     pattern and this deliberately does not use it. */
  ok(SRC.index.indexOf('data-menu-id="product-strategy"') < 0,
    'B1 index.html has no Product Strategy menu parent');
  ok(SRC.index.indexOf('showProductStrategyView(') < 0,
    'B2 and no markup calls the view entry point');
  ok(SRC.index.indexOf("showSection('product-strategy')") < 0,
    'B3 nor the section entry point');
  ok(!/Product Strategy<\/span>/.test(SRC.index), 'B4 and the label appears in no menu item');

  /* B1-B4 SURVIVED THE ACTIVATION, AND THAT IS THE POINT OF THEM. P1-B8D switched this feature on
     and index.html STILL has no Product Strategy markup: the menu is built from the registry, so
     rolling the navigation back is an edit to one boolean rather than a deletion of markup, and §3's
     rule - that the feature may not be opened by removing a CSS class - stays a property rather than
     a promise. Had activation been done by writing a <div>, B1-B4 would have been deleted here and
     nobody would have been able to tell that from the feature simply being on.

     ONE CALLER NOW, AND IT IS GATED. The builder was called by nothing; it is called by exactly one
     function, `mountStagedMenus`, which refuses any section whose `enabled` is not `true`. "Nothing
     calls it" was never the real requirement - "no path reaches the menu without passing the switch"
     was, and that is what is asserted. Checked on stripped source so the builder's own prose, which
     names it repeatedly, is not read as a call. */
  var callers = ['app.js', 'index.html'];
  var appCalls = bare(SRC.app).split('buildStagedMenu').length - 1;
  eq(appCalls, 2, 'B5 app.js names buildStagedMenu twice — the definition and its one caller');
  var mountFn = bare(SRC.app).slice(bare(SRC.app).indexOf('window.KM.nav.mountStagedMenus = '));
  mountFn = mountFn.slice(0, mountFn.indexOf('\n};'));
  ok(mountFn.indexOf('buildStagedMenu') > 0,
    'B5a and the caller is mountStagedMenus');
  ok(mountFn.indexOf('entry.enabled !== true') < mountFn.indexOf('buildStagedMenu'),
    'B5b which refuses a section whose enabled is not exactly true BEFORE it builds anything');
  eq(SRC.index.split('buildStagedMenu').length - 1, 0, 'B6 and index.html never calls it');
  var prodJs = fs.readdirSync(path.join(JS, 'pages')).filter(function (f) {
    return /\.js$/.test(f) && bare(read(path.join(JS, 'pages', f))).indexOf('buildStagedMenu') >= 0;
  });
  eq(prodJs, [], 'B7 and no page controller calls it either');
  eq(callers.length, 2, 'B8 the two production documents are the two that were checked');

  /* NO QUERY PARAMETER, NO CONSOLE FLAG. §3 names both. */
  ['location.search', 'URLSearchParams', 'location.href', 'window.location', 'location.hash']
    .forEach(function (n, i) {
      ok(bare(SRC.app).indexOf(n) < 0, 'B9.' + (i + 1) + ' the shell never reads ' + n);
    });
  ok(bare(SRC.page).indexOf('location') < 0, 'B10 nor does the page controller');
  ok(bare(SRC.views).indexOf('location') < 0, 'B11 nor the view registry');

  /* AND THE BUILT MENU STILL CANNOT OPEN THE PAGE. This is the assertion §3 actually asks for: the
     test-only capability builds DOM, and DOM is not access. */
  var s = shell();
  var m = mountStagedMenu(s);
  var section = s.dom.document.createElement('div');
  section.id = 'product-strategy-board-section';
  section.className = 'module-section';
  s.dom.document.getElementById('appSidebar').parentNode.appendChild(section);

  /* THE GATE IS DRIVEN IN BOTH POSITIONS NOW, WHICH IS A BETTER TEST THAN EITHER VALUE WAS.
     B12 used to assert that clicking a built menu item does NOT open the section, and B13 pinned the
     value it was refused by. P1-B8D switched that value, so the old pair would have had to be either
     deleted or inverted - and inverting it would have left the same one-sided test pointing the other
     way. Instead the registry is set to each value in turn inside the sandbox and the click is
     re-issued: OFF must refuse, ON must open. That holds whatever the shipped value is, and it is
     what "the registry is the switch" actually means. */
  s.sb.KM_STAGED_SECTIONS_['product-strategy'].enabled = false;
  m.children.childNodes[0].click();
  ok(section.className.indexOf('active') < 0,
    'B12 WITH THE REGISTRY OFF, clicking a child of the built menu does not activate the section');

  s.sb.KM_STAGED_SECTIONS_['product-strategy'].enabled = true;
  m.children.childNodes[0].click();
  ok(section.className.indexOf('active') >= 0,
    'B13 and WITH IT ON the same click does — so the refusal was the registry, not an accident');
  section.className = 'module-section';
  eq(s.sb.KM_STAGED_SECTIONS_['product-strategy'].enabled, true,
    'B13a (left in the shipped position, which P1-B8D set to true)');

  /* THE PARENT STILL EXPANDS. A menu that cannot be opened at all would prove nothing about the
     navigation structure §3 asks to be verifiable. */
  m.parent.click();
  ok(m.parent.className.indexOf('is-open') >= 0, 'B14 the parent expands on click');
  ok(m.children.className.indexOf('is-open') >= 0, 'B15 and the child list opens with it');
  m.parent.click();
  ok(m.parent.className.indexOf('is-open') < 0, 'B16 and closes again — one toggle, both halves');

  /* THE SERVER FLAG IS A SEPARATE GATE, AND IT STAYS SERVER-SIDE. Its VALUE has one owner (the
     P1-B8D activation suite); what this suite cares about is that the browser cannot become a second
     authority for it - no mirror that can be raised locally, no copy in the shell. */
  ok(/var PRODUCT_STRATEGY_ENABLED_ = (?:true|false);/.test(SRC.config),
    'B17 PRODUCT_STRATEGY_ENABLED_ is one literal boolean in the config of record');
  ok(bare(SRC.app).indexOf('PRODUCT_STRATEGY_ENABLED_') < 0,
    'B17a and the shell holds no copy of it — the navigation switch is a different gate');
}());

// ===================================================================================================
console.log('\n=== §C  SIX SUB-TABS, IN ORDER, WITH ROUTES AND A RECORDED MATURITY ===');
// ===================================================================================================
(function () {
  eq(VIEWS.ids(), ['overview', 'category', 'risk', 'quality', 'workspace', 'advanced'],
    'C1 the six view ids, in the brief\'s order');
  eq(VIEWS.VIEWS.map(function (v) { return v.label; }),
    ['Executive Overview', 'Category Analysis', 'Deal Risk', 'Data Quality',
      'Strategy Workspace', 'Advanced Details'],
    'C2 under the six names the brief names');

  eq(VIEWS.VIEWS.map(function (v) { return VIEWS.routeOf(v.id); }),
    ['product-strategy/overview', 'product-strategy/category', 'product-strategy/risk',
      'product-strategy/quality', 'product-strategy/workspace', 'product-strategy/advanced'],
    'C3 and each has a canonical route');

  /* §2 ASKS WHETHER ANY OF THE SIX IS STILL A PLACEHOLDER. Answered by checking the renderer each
     view claims against the file that dispatches to it — a maturity field nobody verifies is a
     label, and a label is exactly what the question was about. */
  eq(VIEWS.VIEWS.map(function (v) { return v.maturity; }),
    ['built', 'built', 'built', 'built', 'built', 'built'],
    'C4 all six are recorded as built — none is a placeholder');
  var unbuilt = VIEWS.VIEWS.filter(function (v) {
    return v.renderer.split('+').some(function (fn) {
      return SRC.board.indexOf('function ' + fn + '(') < 0;
    });
  }).map(function (v) { return v.id; });
  eq(unbuilt, [], 'C5 and every named renderer really exists in psb-board-ui.js');
  /* NOT A WORD SEARCH. `placeholder` is an <input> attribute and a parameter name in this file, so
     searching the source for it finds eight matches and none of them is a stub — the G18 trap, which
     this round has now sprung in four separate probes. The Operation System marks an immature menu
     item with a THING: `<span class="stage-badge">Soon</span>`, which is how Tax & Referral Rates,
     Container Rate Card and Warehouse Pricing are marked in index.html today. None of the six
     carries one, and neither does the page. */
  ok(/stage-badge/.test(SRC.index), 'C6 the shell does have a maturity badge for immature items');
  var s6 = shell();
  var badged = s6.KM.nav.buildStagedMenu('product-strategy', s6.dom.document)
    .children.childNodes.filter(function (n) { return /stage-badge/.test(n.className || ''); });
  eq(badged.length, 0, 'C6a and not one of the six sub-tabs is marked Soon');
  ok(SRC.partial.indexOf('stage-badge') < 0, 'C6b nor is anything in the page itself');

  /* THE DISPATCH REACHES ALL SIX AND FALLS THROUGH TO NONE. `else viewAdvanced(host)` meant any
     unrecognised id rendered Advanced Details — a real-looking page nobody asked for. */
  VIEWS.ids().forEach(function (id, i) {
    ok(SRC.board.indexOf("STATE.view === '" + id + "'") > 0,
      'C7.' + (i + 1) + ' paintView dispatches ' + id + ' by name');
  });
  ok(/STATE\.view = VIEWS\.DEFAULT_VIEW; viewOverview\(host\)/.test(SRC.board),
    'C8 and an unknown view resolves to the default rather than to the last branch');
  eq(VIEWS.DEFAULT_VIEW, 'overview', 'C8a which is the overview');

  /* PARSING. An unknown route is null, not a substitute — the substitution is a separate decision. */
  eq(VIEWS.viewOfRoute('product-strategy/risk'), 'risk', 'C9 a route parses to its view');
  eq(VIEWS.viewOfRoute('product-strategy/rsik'), null, 'C10 a misspelling parses to NOTHING');
  eq(VIEWS.viewOfRoute('price-center/risk'), null, 'C11 and so does another namespace');
  eq(VIEWS.viewOfRoute(''), null, 'C12 and so does nothing at all');
  eq(VIEWS.resolve('product-strategy/rsik'), 'overview', 'C13 resolve() is the one that substitutes');
  eq(VIEWS.resolve('risk'), 'risk', 'C14 and it accepts a bare id too');
  eq(VIEWS.routeOf('nonesuch'), null, 'C15 an unknown id has no route');
}());

// ===================================================================================================
console.log('\n=== §D  ONE REGISTRY, TWO SURFACES — AND THE ROUTE IS ON BOTH ===');
// ===================================================================================================
(function () {
  /* THE SIX LABELS ARE WRITTEN ONCE. P1-B8A spent a round removing fifty duplicated tokens; this is
     the same shape one layer up, and the moment to check it is while both surfaces are new. */
  VIEWS.VIEWS.forEach(function (v, i) {
    eq(SRC.app.split(v.label).length - 1, 0,
      'D1.' + (i + 1) + ' app.js has no copy of the label "' + v.label + '"');
  });
  var boardLabelCopies = VIEWS.VIEWS.filter(function (v) {
    return bare(SRC.board).indexOf(v.label) >= 0;
  }).map(function (v) { return v.label; });
  eq(boardLabelCopies, [],
    'D2 and the board declares none of them either — both surfaces read PSB_VIEWS');
  ok(/var NAV = VIEWS\.VIEWS;/.test(SRC.board), 'D3 the board\'s NAV is a delegation');
  ok(/PSB_VIEWS is not loaded/.test(SRC.board),
    'D4 and a missing registry is a named error, not six empty tabs');

  var p = productionBoard();
  ok(p.thrown === null, 'D5 the board renders into the production partial', p.thrown && p.thrown.message);
  var t = tabs(p);
  eq(t.length, 6, 'D6 six tabs on the production rail');
  eq(t.map(function (b) { return b.getAttribute('data-view'); }), VIEWS.ids(),
    'D7 in the registry\'s order');
  eq(t.map(function (b) { return b.getAttribute('data-route'); }),
    VIEWS.ids().map(function (i) { return VIEWS.routeOf(i); }),
    'D8 each carrying its canonical route — not an index into an array');

  /* THE SIDEBAR CHILD AND THE TAB AGREE, STRING FOR STRING. Two surfaces that render the same six
     must be addressable the same way or the identity is decorative. */
  var s = shell();
  var m = mountStagedMenu(s);
  eq(m.children.childNodes.map(function (n) { return n.getAttribute('data-route'); }),
    t.map(function (b) { return b.getAttribute('data-route'); }),
    'D9 THE SIDEBAR CHILD AND THE TAB CARRY THE SAME ROUTE');
  eq(m.children.childNodes.map(function (n) { return n.textContent; }),
    t.map(function (b) { return b.getAttribute('title'); }),
    'D10 and the same label');

  /* THE ROUTE IS APPLIED AND READ BACK. */
  eq(p.board.showView('product-strategy/workspace'), 'workspace', 'D11 a route selects a view');
  eq(p.board.currentRoute(), 'product-strategy/workspace', 'D12 and reads back as that route');
  eq(p.board.showView('product-strategy/nonesuch'), 'overview',
    'D13 an unknown route lands on the canonical default, not on the last branch');

  /* THE URL IS DELIBERATELY NOT WRITTEN, AND THE CONTRACT SAYS SO RATHER THAN THE OMISSION
     IMPLYING IT. A missing thing and a refused thing look identical from outside. */
  var PAGE = require(path.join(JS, 'pages', 'product-strategy-board.js'));
  eq(PAGE.CONTRACT.views_have_canonical_routes, true, 'D14 the identity is stated as contract');
  eq(PAGE.CONTRACT.binds_route_to_url, false, 'D15 and so is the absence of a URL binding');
  eq(PAGE.CONTRACT.route_base, VIEWS.ROUTE_BASE, 'D16 under the registry\'s own namespace');

  /* AND THE SHELL REALLY HAS NO ROUTER — the premise the decision rests on, measured rather than
     remembered. If this ever stops being true the decision has to be revisited, and this is what
     will say so. */
  var routed = [];
  fs.readdirSync(path.join(JS)).forEach(function (f) {
    if (!/\.js$/.test(f)) return;
    var b = bare(read(path.join(JS, f)));
    if (/location\.hash|pushState|popstate|hashchange/.test(b)) routed.push(f);
  });
  eq(routed, [], 'D17 NO FILE IN assets/js/ ROUTES — the premise of D15, measured');
}());

// ===================================================================================================
console.log('\n=== §E  THE TABS ARE THE OPERATION SYSTEM\'S TAB COMPONENT, NOT A SECOND ONE ===');
// ===================================================================================================
(function () {
  ok(/<ul class="nav km-tab-rail" id="nav">/.test(SRC.partial),
    'E1 the production rail IS a .km-tab-rail');
  ok(/\.km-tab-rail\s*\{/.test(SRC.components), 'E2 which components.css owns');
  ok(SRC.css.indexOf('.km-tab-rail {') < 0, 'E3 and the board stylesheet does not redefine it');

  var p = productionBoard();
  var t = tabs(p);
  ok(t.every(function (b) { return /km-tab-rail__tab/.test(b.className); }),
    'E4 every production tab carries the shared tab class');

  /* THE PROTOTYPE'S HOST DOES NOT, AND THE HOST IS WHAT DECIDES. One renderer, no fork. */
  ok(!/km-tab-rail/.test(SRC.protoIndex), 'E5 the prototype\'s list is not a rail');
  var proto = H.bootPage(null);
  ok(!proto.thrown, 'E6 the prototype still boots');
  var protoTabs = proto.dom.document.getElementById('nav').querySelectorAll('.navbtn');
  eq(protoTabs.length, 6, 'E7 with its six sidebar buttons');
  ok(protoTabs.every(function (b) { return b.className.indexOf('km-tab-rail__tab') < 0; }),
    'E8 and NONE of them is a tab — the same renderer, told apart by its host');

  /* THE DARK-SIDEBAR RULES ARE THE SIDEBAR'S. Scoped to `.psb-page` they were painting the
     production rail, which is why it needed its own hover and active states underneath them. */
  ok(SRC.css.indexOf('.psb-page .side .navbtn {') > 0,
    'E9 the dark navbtn rules are scoped to the prototype sidebar');
  ok(SRC.css.indexOf('.psb-page .navbtn {\n') < 0,
    'E10 and there is no unscoped .psb-page .navbtn block left');
  ok(SRC.css.indexOf('.psb-page .psb-viewnav .navbtn:hover') < 0,
    'E11 the rail restates no hover — components.css owns it');
  ok(SRC.css.indexOf('.psb-page .psb-viewnav .nav {') < 0,
    'E12 nor its own flex direction or overflow');

  /* NO COPIED TOKENS, STILL. P1-B8A's rule, re-checked because this round touched the sheet. */
  eq((SRC.css.match(/^:root\s*\{/gm) || []).length, 0, 'E13 the board sheet declares no :root');
  var declared = (SRC.css.match(/^\s*(--[a-z0-9-]+):/gm) || []).map(function (l) {
    return l.trim().split(':')[0];
  });
  var baseTokens = (SRC.base.match(/^\s*(--[a-z0-9-]+):/gm) || []).map(function (l) {
    return l.trim().split(':')[0];
  });
  var redefined = declared.filter(function (d) { return baseTokens.indexOf(d) >= 0; });
  eq(redefined, [], 'E14 and redefines no base.css token');

  /* THE COUNT BADGE THE BOARD DOES SHOW IS THE SHARED ONE. */
  ok(/km-tab-rail__count/.test(SRC.board), 'E15 counts use the shared count pill');
  ok(SRC.css.indexOf('.nav-count') < 0 || !/^\.psb-page[^\n]*\.nav-count/m.test(SRC.css),
    'E16 and `.nav-count` — four rules for an element nothing ever created — is gone');
}());

// ===================================================================================================
console.log('\n=== §F  THE BOARD STYLESHEET STAYS INSIDE ITS PAGE, AT EVERY WIDTH ===');
// ===================================================================================================
(function () {
  /* P1-B8A SCOPED 444 SELECTORS. This round is the first to add rules since, so the containment is
     re-measured rather than assumed to have survived. */
  var body = SRC.css.replace(/\/\*[\s\S]*?\*\//g, '');
  var selectors = [];
  var re = /(^|\}|\{)\s*([^{}@][^{}]*?)\s*\{/g, m;
  while ((m = re.exec(body))) {
    m[2].split(',').forEach(function (sel) {
      sel = sel.trim();
      /* `@media`, `@supports` and friends are not selectors. The char class before them matched the
         newline, so the at-rule's prelude arrived here looking like one. */
      if (sel !== '' && sel.charAt(0) !== '@' && !/^\d/.test(sel) && sel.indexOf(':') !== 0) {
        selectors.push(sel);
      }
    });
  }
  var leaks = selectors.filter(function (sel) {
    if (sel.indexOf('.psb-page') >= 0) return false;
    if (/^(from|to|\d+%)$/.test(sel)) return false;
    return !/^body\.(presenting|is-fullscreen)$/.test(sel);
  });
  eq(leaks, [], 'F1 every selector is scoped to .psb-page, or is one of the two body modes');

  ['card', 'panel', 'col', 'grid', 'nav', 'main', 'kpi', 'shell', 'banner'].forEach(function (c, i) {
    var bare_ = selectors.filter(function (sel) { return sel === '.' + c; });
    eq(bare_, [], 'F2.' + (i + 1) + ' no bare .' + c + ' rule');
  });

  /* THE DEFECT THIS ROUND FOUND, AND IT CANNOT COME BACK.
     `@media (max-width: 1000px)` and `body.presenting` hid `.nav-text` on anything inside
     `.psb-page`. In the PROTOTYPE that collapses a 224px dark column to a 64px icon rail. In the
     PRODUCTION partial there is no column — so the same rule turned six labelled view tabs into six
     unlabelled glyphs at 1024x768, 768x1024 and 390x844: every tablet and every phone in §7's
     matrix. Scoped to `.side`, it applies where it was written for. */
  var narrow = /@media \(max-width: 1000px\) \{([\s\S]*?)\n\}/.exec(SRC.css);
  ok(!!narrow, 'F3 the narrow breakpoint block is found');
  ok(narrow[1].indexOf('.psb-page .side .nav-text') >= 0,
    'F4 AT <=1000px THE LABEL COLLAPSE IS SCOPED TO THE PROTOTYPE SIDEBAR');
  ok(!/\.psb-page \.nav-text[,{]/.test(narrow[1]),
    'F5 and no longer strips the label off the production tab rail');
  ok(!/\.psb-page \.navbtn[,{]/.test(narrow[1]),
    'F6 nor re-centres the tab as though it were an icon button');

  var present = SRC.css.slice(SRC.css.indexOf('body.presenting .psb-page .brand-text'));
  present = present.slice(0, present.indexOf('/* ------'));
  ok(present.indexOf('.psb-page .side .nav-text') >= 0,
    'F7 presentation mode collapses the prototype sidebar, by name');
  ok(!/body\.presenting \.psb-page \.nav-text/.test(present),
    'F8 and not the production tabs');
  ok(/body\.presenting \.psb-page \.psb-viewnav \{ display: none; \}/.test(SRC.css),
    'F9 which are hidden outright instead — a projector audience is not choosing a view');

  /* THE CHART SCROLLS INSIDE ITSELF, AND THE PAGE NEVER SCROLLS SIDEWAYS. §7's rule, as CSS. */
  ok(/\.psb-page \.chartwrap\[data-mode="auto"\]\[data-overflow="container-x"\][\s\S]{0,120}overflow-x: auto/
    .test(SRC.css), 'F10 an overflowing chart scrolls INSIDE the chart');
  ok(/\.main-content \{[\s\S]*?overflow-x: hidden/.test(SRC.layout),
    'F11 and the page itself cannot scroll sideways — layout.css owns that');
}());

// ===================================================================================================
console.log('\n=== §G  KEYBOARD, ARIA, AND ONE TAB STOP ===');
// ===================================================================================================
(function () {
  var p = productionBoard();
  var nav = p.doc.getElementById('nav');
  eq(nav.getAttribute('role'), 'tablist', 'G1 the production rail is a tablist');
  var t = tabs(p);
  ok(t.every(function (b) { return b.getAttribute('role') === 'tab'; }), 'G2 and each button a tab');
  ok(t.every(function (b) { return b.getAttribute('aria-controls') === 'view'; }),
    'G3 pointing at the panel it actually swaps');
  eq(t.map(function (b) { return b.getAttribute('aria-selected'); }),
    ['true', 'false', 'false', 'false', 'false', 'false'], 'G4 exactly one is selected');

  /* ONE TAB STOP, NOT SIX. Six stops in front of the page's real controls is the accessibility
     defect the roving-tabindex pattern exists to avoid. */
  eq(t.map(function (b) { return b.getAttribute('tabindex'); }),
    ['0', '-1', '-1', '-1', '-1', '-1'], 'G5 and only the selected one is in the tab order');

  /* aria-current="page" WAS WRONG HERE. It marks the current PAGE in a set of pages; these six
     change a panel. The prototype, where this rail IS the navigation, still uses it. */
  ok(t.every(function (b) { return b.getAttribute('aria-current') === null; }),
    'G6 no tab claims to be the current page');
  var proto = H.bootPage(null);
  var pt = proto.dom.document.getElementById('nav').querySelectorAll('.navbtn');
  ok(pt.some(function (b) { return b.getAttribute('aria-current') === 'page'; }),
    'G7 while the prototype, where the rail IS the navigation, still does');

  /* ARROW KEYS MOVE AND SELECT, AND FOCUS LANDS ON THE NODE THAT EXISTS AFTERWARDS. render()
     replaces every button, so focusing the pre-redraw neighbour would focus a detached node and the
     next key press would do nothing. */
  function key(el, k) {
    var ev = new p.dom.Event('keydown', { bubbles: true });
    ev.key = k;
    ev.preventDefault = function () {};
    el.dispatchEvent(ev);
  }
  key(tabs(p)[0], 'ArrowRight');
  eq(p.board.currentRoute(), 'product-strategy/category', 'G8 ArrowRight moves to the next view');
  eq(p.doc.activeElement && p.doc.activeElement.id, 'nav-category',
    'G9 and focus is on the REBUILT button, not the detached one');
  key(tabs(p)[1], 'ArrowLeft');
  eq(p.board.currentRoute(), 'product-strategy/overview', 'G10 ArrowLeft moves back');
  key(tabs(p)[0], 'End');
  eq(p.board.currentRoute(), 'product-strategy/advanced', 'G11 End goes to the last');
  key(tabs(p)[5], 'Home');
  eq(p.board.currentRoute(), 'product-strategy/overview', 'G12 Home to the first');
  key(tabs(p)[0], 'ArrowLeft');
  eq(p.board.currentRoute(), 'product-strategy/advanced', 'G13 and the ends wrap');

  /* A MOUSE STILL WORKS, and a touch is a click. */
  tabs(p)[2].click();
  eq(p.board.currentRoute(), 'product-strategy/risk', 'G14 a click selects too');

  /* ICON BUTTONS HAVE ACCESSIBLE NAMES, and the icon itself is hidden from the reader. */
  ok(tabs(p).every(function (b) { return (b.getAttribute('title') || '') !== ''; }),
    'G15 every tab has an accessible name');
  ok(/'aria-hidden': 'true'/.test(SRC.board), 'G16 and the glyph inside it is aria-hidden');

  /* POPOVERS: Escape closes, and state is carried by aria-expanded rather than by colour alone. */
  ok(/aria-expanded/.test(SRC.board), 'G17 disclosure state is announced');
  ok(/ev\.key === 'Escape'/.test(SRC.board), 'G18 and Escape closes a popover');
}());

// ===================================================================================================
console.log('\n=== §H  FIFTEEN STATES, AND FOUR THAT USED TO BE ONE SENTENCE ===');
// ===================================================================================================
var ACC = require(path.join(JS, 'api', 'km-product-pricing-workspace.js'));
var LIVE = require(path.join(JS, 'product-strategy', 'km-product-strategy-live-adapter.js'));
var UNI = require(path.join(JS, 'product-strategy', 'km-product-strategy-site-universe.js'));
(function () {
  /* THE CLASSIFIER IS PURE, so the matrix is provable without a network. */
  var C = ACC.classifyTransportError;
  eq(C({ apiCode: 'AUTH_OR_ACCESS_HTML' }, true), 'NOT_AUTHORIZED',
    'H1 a sign-in page is NOT AUTHORIZED — a server DID answer');
  eq(C({ transportStatus: 401 }, true), 'NOT_AUTHORIZED', 'H2 and so is a 401');
  eq(C({ transportStatus: 403 }, true), 'NOT_AUTHORIZED', 'H3 and a 403');
  eq(C({ message: 'Failed to fetch' }, false), 'BROWSER_OFFLINE', 'H4 no network is OFFLINE');
  eq(C({ apiCode: 'REQUEST_TIMEOUT' }, true), 'SOURCE_TIMED_OUT', 'H5 an elapsed bound is a TIMEOUT');
  eq(C({ kmTimeout: true }, true), 'SOURCE_TIMED_OUT', 'H5a however the transport flags it');
  eq(C({ apiCode: 'TRANSPORT_NON_JSON_RESPONSE' }, true), 'RESPONSE_NOT_READABLE',
    'H6 an HTML page that is not a login is a READABILITY problem, not a connection one');
  eq(C({ message: 'boom' }, true), 'SOURCE_NOT_CONNECTED', 'H7 and anything else is still the default');

  /* THE ORDER IS LOAD-BEARING, AND THESE TWO CASES ARE WHY.
     With no network a request does not fail fast — it fails when its bound elapses — so an offline
     read arrives looking exactly like a slow server. And a sign-in page cannot be served to a
     machine that is offline, so NOT_AUTHORIZED must outrank the offline flag rather than the
     reverse. */
  eq(C({ apiCode: 'REQUEST_TIMEOUT' }, false), 'BROWSER_OFFLINE',
    'H8 a timeout with no network is reported as OFFLINE, not as a slow server');
  eq(C({ apiCode: 'AUTH_OR_ACCESS_HTML' }, false), 'NOT_AUTHORIZED',
    'H9 but a sign-in page outranks the offline flag — it is proof something answered');

  /* `navigator.onLine === true` IS NOT EVIDENCE OF A ROUTE. A café wifi with no internet reports
     true, so it may only ever make an already-failed read MORE specific. */
  eq(C({ message: 'Failed to fetch' }, true), 'SOURCE_NOT_CONNECTED',
    'H10 an online flag never turns a failure into something it cannot prove');
  eq(C({ message: 'Failed to fetch' }, null), 'SOURCE_NOT_CONNECTED',
    'H11 and a host with no navigator at all decides nothing');

  /* END TO END: the accessor really returns them, and the two adapters really carry them through. */
  function failingTransport(err) {
    return { api: { transport: {
      post: function () { return Promise.reject(err); },
      safeReadJsonResponse: function (r) { return r; }
    } } };
  }
  var saved = global.KM;
  var results = {};
  var CASES = {
    NOT_AUTHORIZED: { apiCode: 'AUTH_OR_ACCESS_HTML' },
    SOURCE_TIMED_OUT: { apiCode: 'REQUEST_TIMEOUT' },
    RESPONSE_NOT_READABLE: { apiCode: 'TRANSPORT_NON_JSON_RESPONSE' },
    SOURCE_NOT_CONNECTED: { message: 'boom' }
  };
  var keys = Object.keys(CASES);
  var chain = Promise.resolve();
  keys.forEach(function (want) {
    chain = chain.then(function () {
      global.KM = failingTransport(CASES[want]);
      global.KM.productPricingWorkspace = ACC;
      ACC.setCapability({ product_strategy_enabled: true });
      return Promise.all([
        ACC.getSiteUniverse({}),
        ACC.get({ scope: { company: 'KM', country: 'US', marketplace: 'Shopify' } })
      ]).then(function (r) {
        results[want] = { universe: UNI.adapt(r[0]).state, workspaceRefusal: r[1].meta.refusalCode };
      });
    });
  });
  return chain.then(function () {
    global.KM = saved;
    ACC.setCapability({});
    keys.forEach(function (want, i) {
      eq(results[want].workspaceRefusal, want,
        'H12.' + (i + 1) + ' the workspace read reports ' + want);
      eq(results[want].universe, want,
        'H13.' + (i + 1) + ' and the site-universe adapter carries ' + want + ' through');
    });
  });
}().then(function () {
  /* A SERVER CANNOT CLAIM ONE. These describe what happened to the REQUEST; a response that came
     off the wire carrying one is a contract breach rather than a state. */
  var overTheWire = { success: true, meta: { action: 'productPricing.siteUniverse.get' },
    data: { sourceState: null, sites: [], refusals: [{ code: 'NOT_AUTHORIZED' }], findings: [],
      schema: { contract_version: 1 } } };
  eq(UNI.adapt(overTheWire).state, 'SOURCE_NOT_CONNECTED',
    'H14 a SERVER-SENT client-only code is not believed');

  /* THE FIFTEEN §9 NAMES ALL HAVE A UX ROW — a state with no row renders as a blank panel. */
  var WORKSPACE_STATES = ['OK', 'SOURCE_EMPTY', 'SOURCE_PARTIALLY_READABLE', 'STOP_DATA_INTEGRITY',
    'SOURCE_NOT_CONNECTED', 'FEATURE_DISABLED', 'SCHEMA_CONTRACT_MISMATCH', 'CONTRACT_MISMATCH',
    'BROWSER_OFFLINE', 'SOURCE_TIMED_OUT', 'NOT_AUTHORIZED', 'RESPONSE_NOT_READABLE'];
  eq(LIVE.LOAD_STATES, WORKSPACE_STATES, 'H15 the adapter declares twelve load states');
  var missing = WORKSPACE_STATES.filter(function (s) { return !LIVE.UX[s]; });
  eq(missing, [], 'H16 and every one of them has a UI row');
  var noNext = WORKSPACE_STATES.filter(function (s) {
    return s !== 'OK' && String((LIVE.UX[s] || {}).detail || '').trim() === '';
  });
  eq(noNext, [], 'H17 every state that is not OK says what it means');

  /* NOT ONE OF THEM MAY OFFER A FIXTURE. */
  var fixtured = WORKSPACE_STATES.filter(function (s) { return LIVE.UX[s].uses_fixture !== false; });
  eq(fixtured, [], 'H18 and not one of them shows demonstration data');
  var analysable = WORKSPACE_STATES.filter(function (s) { return LIVE.UX[s].may_analyse === true; });
  eq(analysable, ['OK'], 'H19 only OK may draw a chart');

  /* FOUR DIFFERENT SENTENCES, WHICH IS THE POINT OF §9. */
  var heads = ['SOURCE_NOT_CONNECTED', 'BROWSER_OFFLINE', 'SOURCE_TIMED_OUT', 'NOT_AUTHORIZED',
    'RESPONSE_NOT_READABLE'].map(function (s) { return LIVE.UX[s].headline; });
  eq(heads.length, new Set(heads).size, 'H20 FIVE FAILURE STATES, FIVE DIFFERENT SENTENCES');
  ok(LIVE.UX.NOT_AUTHORIZED.headline.indexOf('connect') < 0,
    'H21 and the one where a server DID answer does not mention connecting');

  /* NOTHING LEAKS. §9: no schema, no endpoint, no stack. */
  var all = WORKSPACE_STATES.map(function (s) {
    return LIVE.UX[s].headline + ' ' + (LIVE.UX[s].detail || '');
  }).join(' ');
  ['script.google.com', '/exec', 'http', 'at Object.', 'apiCode', 'stack', '.gs', 'SELECT ']
    .forEach(function (n, i) {
      ok(all.indexOf(n) < 0, 'H22.' + (i + 1) + ' no ' + n + ' in any state message');
    });
  ok(!/[A-Z_]{6,}/.test(all.replace(/Product Strategy|Operation System/g, '')),
    'H23 and no raw code is printed as a sentence');

  /* THE OTHER THREE OF THE FIFTEEN ARE THE PAGE'S OWN, AND THEY ARE STILL THERE. */
  var PAGE = require(path.join(JS, 'pages', 'product-strategy-board.js'));
  ['AWAITING_SITE_SELECTION', 'SITE_UNIVERSE_NOT_AVAILABLE', 'LOADING_SITE_UNIVERSE',
    'LOADING_WORKSPACE'].forEach(function (s, i) {
    ok(!!PAGE.UX_PAGE[s], 'H24.' + (i + 1) + ' the page state ' + s + ' has a row');
  });

  /* SCENARIO ACTIVE / RESET / IMAGE UNAVAILABLE / PRINT — the four the board owns. */
  ok(/renderScenarioMark/.test(SRC.board), 'H25 a scenario marks itself on the page');
  ok(/scResetAll|scResetSite/.test(SRC.board), 'H26 and can be reset');
  /* THE FIELD IS THE PRICING ADAPTER'S, not the live adapter's — the live adapter passes the row
     through. Asserting it on the wrong file passed for the wrong reason on nothing at all. */
  var ADAPTER_SRC = read(path.join(JS, 'api', 'km-product-pricing-adapter.js'));
  ok(/image_state/.test(ADAPTER_SRC), 'H27 an unverified image is a recorded state, not a blank');
  ok(/image_state:/.test(ADAPTER_SRC) && /verified|unverified|UNVERIFIED/.test(ADAPTER_SRC),
    'H27a with a named verdict rather than a truthiness');
  ok(/@media print/.test(SRC.css), 'H28 and print is a state the stylesheet answers');
}));

// ===================================================================================================
setTimeout(function () {
console.log('\n=== §I  SEVEN VIEWPORTS, MEASURED — AND THE ONE THE SHELL CANNOT DELIVER ===');
// ===================================================================================================
/**
 * NOT A SCREENSHOT, AND NOT A GUESS. Every number below comes from the pure layout engine given the
 * SHELL's real geometry: `.sidebar` is 240px (layout.css), `.content-area` pads 2rem each side, and
 * the board quantises `clientWidth - CARD_INSET` and `innerHeight - CHROME_H` before using them.
 * The constants are read from the files rather than retyped, so a change to either fails here.
 */
var SIDEBAR_W = Number((/\.sidebar \{[\s\S]*?width: (\d+)px/.exec(SRC.layout) || [])[1]);
var CONTENT_PAD = 64;   // .content-area { padding: 2rem } — 32px each side
var CARD_INSET = Number((/var CARD_INSET = (\d+)/.exec(SRC.board) || [])[1]);
var CHROME_H = Number((/var CHROME_H = (\d+)/.exec(SRC.board) || [])[1]);
var QUANT = Number((/var MEASURE_QUANT = (\d+)/.exec(SRC.board) || [])[1]);

var VIEWPORTS = [[1920, 1080], [1440, 900], [1366, 768], [1280, 720], [1024, 768],
  [768, 1024], [390, 844]];

function layoutAt(vw, vh, count) {
  function q(v) { return Math.round(v / QUANT) * QUANT; }
  return LAYOUT.deriveResponsiveChartLayout({
    containerWidth: q(vw - SIDEBAR_W - CONTENT_PAD - CARD_INSET),
    availableHeight: q(vh - CHROME_H),
    productCount: count, domainLowC: 1000, domainHighC: 4000, mode: 'auto'
  });
}
(function () {
  eq(SIDEBAR_W, 240, 'I1 the shell sidebar is 240px, read from layout.css');
  eq([CARD_INSET, CHROME_H, QUANT], [44, 232, 8], 'I2 and the board\'s own measurement constants');

  /* THE Y AXIS IS NEVER TRUNCATED. This is §7's headline promise — "you should not have to scroll
     up and down to see the axis" — and it holds at every viewport and every data volume. */
  var heightFails = [];
  VIEWPORTS.forEach(function (v) {
    [7, 12, 44].forEach(function (n) {
      if (layoutAt(v[0], v[1], n).fitsHeight !== true) heightFails.push(v.join('x') + '/' + n);
    });
  });
  eq(heightFails, [], 'I3 THE Y AXIS FITS AT EVERY VIEWPORT AND EVERY COUNT — 21 of 21');

  /* AN ORDINARY CHART SHOWS ITS WHOLE X AXIS ON EVERY DESKTOP AND TABLET. */
  [[1920, 1080], [1440, 900], [1366, 768], [1280, 720], [1024, 768], [768, 1024]]
    .forEach(function (v, i) {
      [7, 12].forEach(function (n) {
        var L = layoutAt(v[0], v[1], n);
        eq(L.overflow, 'none',
          'I4.' + (i + 1) + (n === 7 ? 'a' : 'b') + ' ' + v.join('x') + ', ' + n
          + ' products: the whole X axis, no scrolling');
      });
    });

  /* AND A LARGE ONE SCROLLS INSIDE THE CHART, WHICH IS THE OTHER HALF OF §7. */
  [[1440, 900], [1366, 768], [1280, 720], [1024, 768], [768, 1024]].forEach(function (v, i) {
    eq(layoutAt(v[0], v[1], 44).overflow, 'container-x',
      'I5.' + (i + 1) + ' ' + v.join('x') + ', 44 products: the CHART scrolls, not the page');
  });
  eq(layoutAt(1920, 1080, 44).overflow, 'none',
    'I6 and on a 1920 screen even 44 products fit without scrolling');

  /* LEGIBILITY HAS A FLOOR. "Fits" is not an achievement if the labels are stumps. */
  var illegible = [];
  VIEWPORTS.forEach(function (v) {
    [7, 12, 44].forEach(function (n) {
      var L = layoutAt(v[0], v[1], n);
      if (L.labelChars < 3 || L.imageSize < 24) illegible.push(v.join('x') + '/' + n);
    });
  });
  eq(illegible, [], 'I7 no layout shrinks a label below 3 characters or an image below 24px');

  /* ===== 390x844, AND THE REASON IT FAILS IS NOT THIS PAGE =====
     `.sidebar` is a fixed 240px with NO breakpoint anywhere in assets/css, and `.main-content`
     carries `margin-left: 240px` unconditionally. On a 390px phone that leaves 86px of content for
     EVERY page in the application. The board degrades honestly into it — overview density, the
     chart scrolling inside itself, no page overflow — but 40px of chart is not a usable page, and
     no rule in this stylesheet can widen it. Fixing it means giving the shell a breakpoint, which
     changes all twenty-odd pages, and §2 forbids rewriting the sidebar for one page.
     THE MEASUREMENT IS RECORDED SO THE CLAIM IS NOT "IT PASSES". */
  var mobileRules = [];
  ['base.css', 'components.css', 'layout.css', 'responsive-foundation.css'].forEach(function (f) {
    var css = readRoot('assets/css/' + f);
    var mre = /@media[^{]*\{/g, mm;
    while ((mm = mre.exec(css))) {
      var i = mm.index + mm[0].length, depth = 1;
      while (i < css.length && depth > 0) {
        if (css.charAt(i) === '{') depth++;
        else if (css.charAt(i) === '}') depth--;
        i++;
      }
      var blk = css.slice(mm.index + mm[0].length, i);
      if (/\.sidebar\b|\.main-content\b/.test(blk)) mobileRules.push(f + ' ' + mm[0].trim());
    }
  });
  eq(mobileRules, [],
    'I8 THE SHELL HAS NO RESPONSIVE SIDEBAR AT ALL — no breakpoint in any stylesheet touches it');
  var phone = layoutAt(390, 844, 12);
  eq(phone.measured.containerWidth, 40,
    'I9 so at 390x844 the chart is handed 40px, and that is the shell\'s arithmetic');
  eq(phone.fitsHeight, true, 'I10 the board still fits the height it is given');
  eq(phone.overflow, 'container-x', 'I11 and still scrolls inside itself rather than pushing the page');
  ok(phone.reasons.length > 0, 'I12 and SAYS why it could not fit, rather than failing silently');

  /* WITH THE SIDEBAR MANUALLY COLLAPSED — the only narrowing the shell offers, and a person has to
     press it — the phone gets 216px. Recorded because it is the difference between "unusable" and
     "unusable unless you know about a button". */
  function collapsed(vw, vh, n) {
    function q(v) { return Math.round(v / QUANT) * QUANT; }
    return LAYOUT.deriveResponsiveChartLayout({
      containerWidth: q(vw - 64 - CONTENT_PAD - CARD_INSET), availableHeight: q(vh - CHROME_H),
      productCount: n, domainLowC: 1000, domainHighC: 4000, mode: 'auto' });
  }
  ok(/\.sidebar\.is-collapsed ~ \.main-content \{[\s\S]*?margin-left: 64px/.test(SRC.layout),
    'I13 the collapsed sidebar is 64px');
  eq(collapsed(390, 844, 12).measured.containerWidth, 216,
    'I14 which gives a 390px phone 216px — still not a chart, and still not this page\'s to fix');
}());

// ===================================================================================================
console.log('\n=== §J  PRINT, AND THE UI FIXES THAT MUST NOT COME BACK ===');
// ===================================================================================================
(function () {
  var printBlocks = SRC.css.split('@media print').slice(1);
  ok(printBlocks.length >= 1, 'J1 the stylesheet has a print block');
  var print = printBlocks.join('\n');
  ok(/\.psb-page \.cmdbar[^\n]*display: none|\.psb-page \.cmdbar \{[\s\S]{0,200}display: none/.test(print)
    || /cmdbar/.test(print), 'J2 the controls are not printed');
  ok(/chartwrap\{ overflow: visible !important/.test(SRC.css) || /overflow: visible/.test(print),
    'J3 and the chart is not clipped to a scroller in print');
  ok(!/\bbody \{/.test(print.slice(0, 400)) || /\.psb-page/.test(print.slice(0, 400)),
    'J4 print rules are scoped to the page, not to every printed document in the app');

  /* §8's LIST, RE-CHECKED. Each of these was a defect somebody found and a round fixed; the value
     of the list is that it is re-run, not that it was written down. */
  ok(/data-frac/.test(SRC.board), 'J5 a marker still carries its price fraction (resize cannot move a price)');
  ok(/anchor/i.test(SRC.board), 'J6 the viewport contract still anchors rather than saving an offset');
  ok(/kmf-panel/.test(SRC.board), 'J7 More filters is still the shared popover chrome');
  ok(/moreFiltersOpen: false/.test(SRC.board), 'J8 and still closed by default');
  ok(/meetingOpen: false/.test(SRC.board), 'J9 Price Scenario is closed by default');
  ok(/scenarioBadge/.test(SRC.board), 'J10 while its badge stays visible');
  /* §8's LAST ITEM, QUOTED FROM THE SOURCE RATHER THAN PARAPHRASED. The brief asks that the open
     price step be explained as the distance between two adjacent everyday prices that no product
     occupies, and explicitly NOT as a shortage, an order status or a quantity to reorder. The
     sentence appears twice — the `?` popover and the legend — and both halves are checked, because
     the second sentence is the one that does the work. */
  var stepHelp = SRC.board.split(
    'Difference between two adjacent everyday prices that exceeds the selected gap threshold');
  eq(stepHelp.length - 1, 2, 'J11 the open-price-step explanation is present in both places');
  var bothSay = stepHelp.slice(1).every(function (rest) {
    var sentence = rest.slice(0, 260);
    return /unoccupied price tier/.test(sentence)
      && /not an inventory shortage/.test(sentence)
      && /order status/.test(sentence);
  });
  ok(bothSay,
    'J12 and both say it is an unoccupied PRICE TIER — not a shortage and not an order status');
  ok(/aria-expanded/.test(SRC.board) && !/onmouseover=/.test(SRC.board),
    'J13 help is a real popover, not hover-only');
}());

// ===================================================================================================
console.log('\n=== §K  NOTHING WAS ACTIVATED, AND NOTHING CAN WRITE ===');
// ===================================================================================================
(function () {
  var apiDir = path.join(JS, 'api');
  var actions = {};
  fs.readdirSync(apiDir).forEach(function (f) {
    if (!/\.js$/.test(f)) return;
    var src = read(path.join(apiDir, f));
    (src.match(/'productPricing\.[a-zA-Z.]+'/g) || []).forEach(function (a) { actions[a] = 1; });
  });
  eq(Object.keys(actions).sort(),
    ["'productPricing.siteUniverse.get'", "'productPricing.workspace.get'"],
    'K1 exactly two productPricing actions in the whole API layer');
  ok(Object.keys(actions).every(function (a) { return /\.get'$/.test(a); }),
    'K2 and both are reads');

  var writers = [];
  ['upsert', 'submit', 'create', 'delete', 'write', 'save'].forEach(function (w) {
    if (new RegExp("'productPricing\\.[a-zA-Z.]*" + w, 'i').test(SRC.accessor)) writers.push(w);
  });
  eq(writers, [], 'K3 no write-shaped action name exists');

  /* ON STRIPPED SOURCE, AND COUNTING RATHER THAN FORBIDDING. K4 used to assert that the string
     `enabled: true` appears nowhere in the code - true while everything was staged, and meaningless
     the moment one section is activated. What the pair was protecting is that a staged section has
     exactly ONE switch: two `enabled:` keys in one entry is a registry where the answer depends on
     which one a reader happens to find. So: one key per staged section, a literal boolean, and no
     second switch smuggled in beside it. */
  var reg = bare(SRC.app).slice(bare(SRC.app).indexOf('var KM_STAGED_SECTIONS_ = {'));
  reg = reg.slice(0, reg.indexOf('\n};'));
  eq((reg.match(/enabled:\s*(?:true|false)/g) || []).length, 1,
    'K4 the staged registry declares exactly one enabled switch, as a literal boolean');
  eq((reg.match(/enabled/g) || []).length, 1,
    'K5 and the word appears nowhere else in the entry — no second switch beside it');
  var PAGE = require(path.join(JS, 'pages', 'product-strategy-board.js'));
  eq(PAGE.CONTRACT.registered_in_navigation, false, 'K6 the page still states it is not in navigation');
  eq(PAGE.CONTRACT.loads_prototype_assets, false, 'K7 and loads no prototype asset');
  eq(PAGE.CONTRACT.fixture_fallback, false, 'K8 and has no fixture fallback');

  /* THE PRODUCTION PARTIAL REACHES INTO docs/prototypes FOR NOTHING. */
  /* LOAD PATHS, NOT PROSE. index.html carries a comment reading "NOT FROM docs/prototypes", which
     is the document stating the rule it obeys; a substring search reads that as a violation. So the
     check is on what the documents LOAD — src=, href= — which is the thing the rule is about. */
  var loads = (SRC.index.match(/(?:src|href)="([^"]+)"/g) || [])
    .concat(SRC.partial.match(/(?:src|href)="([^"]+)"/g) || [])
    .map(function (t) { return /"([^"]+)"/.exec(t)[1]; });
  ['preview-fixture', 'prototype-tokens', 'docs/prototypes'].forEach(function (n, i) {
    eq(loads.filter(function (u) { return u.indexOf(n) >= 0; }), [],
      'K9.' + (i + 1) + ' neither production document LOADS ' + n);
  });
  eq(loads.filter(function (u) { return /^\.\.\//.test(u); }), [],
    'K10 and nothing is loaded from above the application root');
  var prodLoads = (SRC.page + SRC.board + SRC.live).split('docs/prototypes').length - 1;
  eq(prodLoads, 0, 'K11 and no production module loads anything from there');
}());

// ===================================================================================================
console.log('\n=== §L  MUTANTS ===');
// ===================================================================================================
(function () {
  function viewsIn(src) {
    var ctx = { module: { exports: {} } };
    vm.createContext(ctx);
    vm.runInContext(src, ctx, { filename: 'psb-views.js' });
    return ctx.PSB_VIEWS;
  }

  mut('L1 the anchor really is what places the menu', 'app', "insertBefore: 'carrier'",
    "insertBefore: 'pricing-center'", function (m) {
      var s = shell(function () { return m; });
      return !new RegExp('data-menu-id="'
        + s.sb.KM_STAGED_SECTIONS_['product-strategy'].nav.insertBefore + '"').test(SRC.index);
    });

  /* THE RULE IS "THE SIDEBAR READS THE REGISTRY", NOT "THE SIDEBAR HAS SIX ITEMS". The first
     version of this mutant substituted a six-element stub and asserted the COUNT, so it agreed with
     the clean run and survived — a mutant measuring the one thing its own substitution had
     preserved. It now substitutes six items with the WRONG NAMES, which is what a drifting second
     copy of the list would actually look like, and detects it against PSB_VIEWS. */
  mut('L2 the six children really come from the registry', 'app',
    "    return V.VIEWS.map(function (v) {",
    "    return [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' },"
      + " { id: 'd', label: 'D' }, { id: 'e', label: 'E' }, { id: 'f', label: 'F' }]"
      + ".map(function (v) {",
    function (m) {
      var s = shell(function () { return m; });
      var got = s.KM.nav.stagedChildren('product-strategy').map(function (k) { return k.label; });
      var want = VIEWS.VIEWS.map(function (v) { return v.label; });
      return JSON.stringify(got) !== JSON.stringify(want);
    });

  mut('L3 a child click really goes through the staged gate', 'app',
    "  showSection('product-strategy');\n}",
    "  var sec = document.getElementById('product-strategy-board-section');\n"
    + "  if (sec) sec.classList.add('active');\n}", function (m) {
      var s = shell(function () { return m; });
      var mm = mountStagedMenu(s);
      var sec = s.dom.document.createElement('div');
      sec.id = 'product-strategy-board-section';
      sec.className = 'module-section';
      s.sidebar.parentNode.appendChild(sec);
      mm.children.childNodes[0].click();
      return sec.className.indexOf('active') >= 0;
    });

  mut('L4 the route parser really rejects a foreign namespace', 'views',
    "if (parts.length !== 2 || parts[0] !== V.ROUTE_BASE) return null;",
    "if (parts.length !== 2) return null;", function (m) {
      return viewsIn(m).viewOfRoute('price-center/risk') !== null;
    });

  mut('L5 a misspelled route really parses to nothing', 'views',
    "return V.get(parts[1]) ? parts[1] : null;", "return parts[1];", function (m) {
      return viewsIn(m).viewOfRoute('product-strategy/rsik') !== null;
    });

  mut('L6 resolve() really falls back to the canonical default', 'views',
    "return viaRoute || V.DEFAULT_VIEW;", "return viaRoute;", function (m) {
      return viewsIn(m).resolve('nonsense') !== 'overview';
    });

  mut('L7 the tab really carries its route', 'board',
    "b.setAttribute('data-route', VIEWS.routeOf(item.id));", "", function (m) {
      var p = productionBoard(function () { return m; });
      return p.thrown !== null || tabs(p).some(function (b) {
        return b.getAttribute('data-route') === null;
      });
    });

  mut('L8 the host really decides which component the rail is', 'board',
    "var rail = (' ' + (ul.className || '') + ' ').indexOf(' km-tab-rail ') >= 0;",
    "var rail = false;", function (m) {
      var p = productionBoard(function () { return m; });
      return p.thrown !== null || !tabs(p).every(function (b) {
        return /km-tab-rail__tab/.test(b.className);
      });
    });

  mut('L9 only the selected tab is really in the tab order', 'board',
    "b.setAttribute('tabindex', on ? '0' : '-1');", "b.setAttribute('tabindex', '0');",
    function (m) {
      var p = productionBoard(function () { return m; });
      if (p.thrown) return true;
      return tabs(p).filter(function (b) { return b.getAttribute('tabindex') === '0'; }).length !== 1;
    });

  mut('L10 aria-selected really tracks the view', 'board',
    "b.setAttribute('aria-selected', on ? 'true' : 'false');",
    "b.setAttribute('aria-selected', 'false');", function (m) {
      var p = productionBoard(function () { return m; });
      if (p.thrown) return true;
      return !tabs(p).some(function (b) { return b.getAttribute('aria-selected') === 'true'; });
    });

  mut('L11 the arrow key really focuses the REBUILT node', 'board',
    "      var fresh = byId('nav-' + nextId);\n          if (fresh && typeof fresh.focus === 'function') fresh.focus();",
    "      if (typeof b.focus === 'function') b.focus();", function (m) {
      var p = productionBoard(function () { return m; });
      if (p.thrown) return true;
      var ev = new p.dom.Event('keydown', { bubbles: true });
      ev.key = 'ArrowRight';
      ev.preventDefault = function () {};
      tabs(p)[0].dispatchEvent(ev);
      return !(p.doc.activeElement && p.doc.activeElement.id === 'nav-category');
    });

  mut('L12 the dispatch really has no fallthrough', 'board',
    "else { STATE.view = VIEWS.DEFAULT_VIEW; viewOverview(host); }",
    "else viewAdvanced(host);", function (m) {
      return !/STATE\.view = VIEWS\.DEFAULT_VIEW/.test(m);
    });

  mut('L13 a sign-in page really outranks the offline flag', 'accessor',
    "if (code === 'AUTH_OR_ACCESS_HTML' || status === 401 || status === 403) return 'NOT_AUTHORIZED';",
    "", function (m) {
      var ctx = { module: { exports: {} }, window: undefined, globalThis: {} };
      vm.createContext(ctx);
      vm.runInContext(m, ctx, { filename: 'acc.js' });
      return ctx.module.exports.classifyTransportError({ apiCode: 'AUTH_OR_ACCESS_HTML' }, false)
        !== 'NOT_AUTHORIZED';
    });

  mut('L14 offline is really checked before the timeout', 'accessor',
    "if (online === false) return 'BROWSER_OFFLINE';", "", function (m) {
      var ctx = { module: { exports: {} }, window: undefined, globalThis: {} };
      vm.createContext(ctx);
      vm.runInContext(m, ctx, { filename: 'acc.js' });
      return ctx.module.exports.classifyTransportError({ apiCode: 'REQUEST_TIMEOUT' }, false)
        !== 'BROWSER_OFFLINE';
    });

  mut('L15 a server really cannot claim a client-only state', 'universe',
    "&& (first === 'FEATURE_DISABLED' || locallyRefused)", "", function (m) {
      var ctx = { module: { exports: {} }, globalThis: {} };
      vm.createContext(ctx);
      vm.runInContext(m, ctx, { filename: 'uni.js' });
      var U = ctx.module.exports.KM_PRODUCT_STRATEGY_SITE_UNIVERSE || ctx.KM_PRODUCT_STRATEGY_SITE_UNIVERSE;
      return U.adapt({ success: true, meta: { action: 'x' },
        data: { sourceState: null, sites: [], refusals: [{ code: 'NOT_AUTHORIZED' }], findings: [],
          schema: { contract_version: 1 } } }).state === 'NOT_AUTHORIZED';
    });

  /* THE TWO CSS MUTANTS RUN §F's ACTUAL COMPARISON over the mutated text. P1-B8A had a mutant that
     returned the AND of two facts that were true before and after it changed anything — it was
     measuring nothing while being counted as caught. */
  mut('L16 the narrow breakpoint really is scoped to the prototype sidebar', 'css',
    '.psb-page .brand-text, .psb-page .side .nav-text, .psb-page .act-text{ display: none; }',
    '.psb-page .brand-text, .psb-page .nav-text, .psb-page .act-text{ display: none; }',
    function (m) {
      var blk = /@media \(max-width: 1000px\) \{([\s\S]*?)\n\}/.exec(m);
      return !!blk && /\.psb-page \.nav-text[,{]/.test(blk[1]);
    });

  mut('L17 presentation mode really hides the production rail', 'css',
    'body.presenting .psb-page .psb-viewnav { display: none; }', '', function (m) {
      return !/body\.presenting \.psb-page \.psb-viewnav \{ display: none; \}/.test(m);
    });

  /* THE MUTANT THAT NEARLY DIDN'T MEASURE ANYTHING. Removing the class from the `<ul>` leaves the
     partial's own COMMENT saying `km-tab-rail` twice, so `/km-tab-rail/.test(file)` still matched and
     the mutant survived while looking like a test. It now runs §E1's ACTUAL assertion — the element,
     not the file — and §E4's consequence, which is that the tabs stop being shared tabs. */
  mut('L18 the partial really asks for the shared rail', 'partial',
    '<ul class="nav km-tab-rail" id="nav">', '<ul class="nav" id="nav">', function (m) {
      if (/<ul class="nav km-tab-rail" id="nav">/.test(m)) return false;
      var dom = H.makeDom(H.productionSkeleton(m));
      return !/km-tab-rail/.test(dom.document.getElementById('nav').className || '');
    });
}());

// ===================================================================================================
setTimeout(function () {
  console.log('\n===================================================================================');
  console.log((fail === 0 && mutSurvived === 0 ? 'PASS' : 'FAIL')
    + ' — passed ' + pass + '  failed ' + fail
    + '  |  mutants caught ' + mutCaught + '  survived ' + mutSurvived);
  console.log('===================================================================================');
  process.exitCode = (fail === 0 && mutSurvived === 0) ? 0 : 1;
}, 0);
}, 0);
