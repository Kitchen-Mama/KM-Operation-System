/**
 * ==================================================================================================
 * P1-B8C — THE VISUAL ACCEPTANCE RUNNER: A REAL BROWSER, THE REAL SHELL, THE REPLAYED CAPTURE
 * ==================================================================================================
 *
 * §10 says the viewport acceptance must use a headless browser and that a mathematical model may not
 * stand in for all of it. It is right to insist. P1-B8B's viewport work was done entirely through the
 * pure layout engine — correct as far as it went, and it could not have seen the defect that round
 * actually found, which was a CSS rule stripping the labels off the tab rail at 1000px. No arithmetic
 * over `deriveResponsiveChartLayout` can see a `display: none` in a media query.
 *
 * SO THIS DRIVES CHROME. It builds an acceptance page, renders it at each viewport, takes a PNG,
 * prints a PDF, and — the part that matters more than the images — asks the LIVE DOM for measurements
 * that only a browser can answer: computed styles, bounding boxes, whether the page scrolls sideways,
 * whether an axis is inside its scroller, whether a label is visible.
 *
 * THE PAGE IS GENERATED FROM index.html, NOT WRITTEN BESIDE IT. Every `<link>` and every `<script>`
 * is read out of the real shell, in the real order, so the cascade under test is the cascade that
 * ships — including the fact that `product-strategy-board.css` loads LAST of twenty-four, which is
 * the whole reason P1-B8A's leak existed. A hand-written acceptance page would have had five
 * stylesheets and would have proved nothing about the twenty-four.
 *
 * THE SHELL CHROME IS THE REAL MARKUP TOO: `.app-layout > nav.sidebar + .main-content > .content-area`,
 * copied from index.html by structure, so `.sidebar { width: 240px }` and
 * `.main-content { margin-left: 240px }` really apply and the content width a chart is handed is the
 * width the application hands it.
 *
 * THE TEST-ONLY ACTS, none of which is a bypass:
 *   1. `KM.api.transport.post` answers from the capture (§5's one permitted substitution).
 *   2. In the DEFAULT mode, `KM.nav.buildStagedMenu` is CALLED, which production never did, to render
 *      the declared menu of a section that was switched off.
 *
 * P1-B8D — AND (2) IS RETIRED IN `activated` MODE, WHICH IS THE POINT OF THE MODE.
 *
 * The section is switched on now, so production mounts its own menu: `mountStagedMenus()` runs in the
 * DOMContentLoaded block, reads the registry, and inserts before the `insertBefore` anchor. Calling
 * the builder by hand would mean photographing a menu that production does not build — the runner
 * would be measuring itself. So `opts.activated` calls the production function instead, and swaps the
 * APPROXIMATED sidebar below for the real one, read out of index.html.
 *
 * The approximated sidebar was fine while the only question was "does the board fit beside 240px of
 * chrome". It stops being fine the moment the question is "is the item above Pricing Center", because
 * a hand-written sidebar is a second model of the document and the anchor would resolve against the
 * model rather than against the page. Same argument as the six view labels, one layer out.
 *
 * USAGE
 *     node assets/tests/_p1b8c-visual-runner.js [outDir]
 *
 * It exits non-zero if Chrome cannot be found, because §10 says a missing browser is a STOP and not
 * a licence to fall back to arithmetic.
 * ==================================================================================================
 */
'use strict';

var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..', '..');

function read(p) { return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n'); }

// ---------------------------------------------------------------------------------------------- 1
/** Chrome, or a STOP. Edge is accepted: it is the same engine and §10 asks for a browser, not a brand. */
var CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
];
function findBrowser() {
  for (var i = 0; i < CANDIDATES.length; i++) {
    try { if (fs.existsSync(CANDIDATES[i])) return CANDIDATES[i]; } catch (e) { /* next */ }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------- 2
/**
 * THE VIEWPORT MATRIX. §10's list, plus the phone §10 asks to be RECORDED rather than passed.
 * `print` is not a viewport; it is a separate Chrome mode and it is run separately.
 */
var VIEWPORTS = [
  { id: '1920x1080', w: 1920, h: 1080 },
  { id: '1440x900', w: 1440, h: 900 },
  { id: '1366x768', w: 1366, h: 768 },
  { id: '1280x720', w: 1280, h: 720 },
  { id: '1024x768', w: 1024, h: 768 },
  { id: '768x1024', w: 768, h: 1024 },
  { id: '390x844', w: 390, h: 844, shellBlocked: true }
];

// ---------------------------------------------------------------------------------------------- 3
/**
 * Build the acceptance page from index.html.
 *
 * `view` selects which of the six the board shows; `site` picks the replayed site; `state` forces one
 * of the refusal states instead of a board, so the state matrix can be photographed too.
 */
/** Which capture the page replays. Deterministic by default; R2 passes the live-derived one. */
var CAPTURES = {
  deterministic: { file: '_p1b8c-capture.js', global: 'P1B8C_CAPTURE',
    kindField: 'CAPTURE_KIND', site: { company: 'Kitchen Mama', country: 'US', marketplace: 'Amazon' } },
  live: { file: '_p1b8c-r2-live-derived.js', global: 'P1B8C_R2_LIVE',
    kindField: 'SOURCE_KIND', site: { company: 'KM', country: 'US', marketplace: 'Shopify' } },
  /* P1-B8C-R3 — THE ONE THAT CAN ACTUALLY DRAW A PHOTOGRAPH. The other two carry redaction markers
     where an address used to be, which is correct of both and leaves R3's fix unphotographable. This
     one wraps the deterministic capture and puts the operator-asserted paths on its rows, so it needs
     BOTH files in the page, in order. */
  assets: { files: ['_p1b8c-capture.js', '_p1b8c-r3-asset-capture.js'], global: 'P1B8C_R3_ASSETS',
    kindField: 'CAPTURE_KIND', site: { company: 'Kitchen Mama', country: 'US', marketplace: 'Amazon' } }
};
function captureOf(opts) { return CAPTURES[(opts && opts.capture) || 'deterministic']; }

/**
 * P1-B8D — THE REAL SIDEBAR, CUT OUT OF index.html RATHER THAN RE-TYPED.
 *
 * The slice is delimited by the opening <nav> and the first </nav>, and it STOPS rather than falling
 * back if either is missing: a runner that quietly produced a page with no sidebar would report a
 * Product Strategy item that is not above Pricing Center as an item that is not there at all, and
 * both read as "0" in a measurement.
 */
function realSidebar(index) {
  var open = index.indexOf('<nav class="sidebar" id="appSidebar">');
  if (open < 0) throw new Error('STOP_SIDEBAR_NOT_FOUND_IN_INDEX');
  var rest = index.slice(open);
  var close = rest.indexOf('</nav>');
  if (close < 0) throw new Error('STOP_SIDEBAR_NOT_CLOSED_IN_INDEX');
  return rest.slice(0, close + 6);
}
function captureFiles(cap) { return cap.files || [cap.file]; }

function buildPage(opts) {
  opts = opts || {};
  var cap = captureOf(opts);
  var index = read(path.join(ROOT, 'index.html'));
  var partial = read(path.join(ROOT, 'assets', 'html', 'pages', 'product-strategy-board.html'));

  /* EVERY STYLESHEET INDEX.HTML LOADS, IN ORDER. The cascade is the thing under test. */
  /* THE PAGE DECLARES THE REPO ROOT AS ITS BASE, AND EVERY REFERENCE IS WRITTEN ROOT-RELATIVE.
     P1-B8C-R3 needs this. The acceptance document is written into assets/tests/, so a row carrying
     `assets/img/products/CO1100-R.jpg` — the shape production's image_url actually has — resolved to
     assets/tests/assets/img/... and 404ed. EVERY IMAGE WOULD HAVE FAILED TO LOAD, the new onerror
     would have caught all seven, and the run would have photographed R3's fallback working perfectly
     while proving nothing about R3's fix. One <base> and no `../../` prefixes: the browser now
     resolves a relative image exactly the way the deployed page does. */
  var links = (index.match(/<link rel="stylesheet" href="([^"]+)">/g) || [])
    .map(function (t) { return /href="([^"]+)"/.exec(t)[1]; })
    .map(function (h) { return '<link rel="stylesheet" href="' + h + '">'; })
    .join('\n  ');

  /* THE PAGE'S OWN SCRIPTS, from the same document, in the same order. Anything else index.html loads
     is shell machinery this page does not mount; loading all of it would pull in twenty pages'
     controllers and measure their boot, not this one's. */
  /* P1-B8C-R3 added km-image-reference-policy.js, and it is NOT optional here. The adapter's
     imageStateOf fails CLOSED without it, so a page that skipped it would photograph a board with no
     photographs and report that as the measurement. */
  /* P1-B8D-R9 §5 added km-repo-asset-manifest.js, and it is NOT optional here either — for the
     OPPOSITE reason the policy is not. The policy fails CLOSED without its file, so omitting it
     would photograph a board with no photographs. The manifest fails OPEN, so omitting IT would
     photograph a board whose 404 gate is switched off while every assertion about the gate passes
     against the Node copy. A harness that loads one and not the other measures neither. */
  /* P1-B8D-R10D §12 added `operation-system-db-api`, and it is the file this page was MISSING while
     claiming to boot production.

     `app.js` has always been loaded here, so the run has always executed the production boot. But
     the one line of that boot this round is about — `KM.DB.applyClientCapabilities()` — is guarded
     on `KM.DB` EXISTING, and `KM.DB` is defined in this file. With it absent the guard silently
     failed and the bootstrap never ran: the page reported a production boot it had not performed.
     A suite could then only raise the capability by calling the setter itself, which is precisely
     the second activation path R4 removed for hiding a live defect for a whole round.

     It is the shipped file, loaded as shipped bytes. Nothing from it is reimplemented or stubbed
     here; the only substitution remains the fake `fetch` the replay installs BENEATH it.

     `core/boot-read-arbiter` comes with it because `app.js` declares the capability read to the
     arbiter and the page WAITS on that declaration. Without the arbiter the wait degrades to "read
     whatever the mirror says right now", which is a different code path from the shipped one — and
     the pending case is exactly what §10 asks this run to show. */
  var WANTED = /product-strategy|km-product-pricing|km-api-foundation|km-transport|utils\/tab-rail|km-image-reference-policy|km-repo-asset-manifest|api\/operation-system-db-api|core\/boot-read-arbiter/;
  /* INCIDENT-BOOT-FC-R2 — TOLERATE ATTRIBUTES ON THE SOURCE TAG.
     This matched `<script src="..."></script>` with nothing between the quote and the bracket. When
     index.html gained `defer`, it matched NOTHING, and the generated page was built with zero page
     scripts — so every scenario reported "no measurements came back from the browser" about a page
     that had never loaded the code under test. The tags are RE-EMITTED attribute-free two lines below,
     which is what this harness needs and must keep: its own inline script has to run after app.js, and
     an inline script cannot defer. Only the match changes. */
  var scripts = (index.match(/<script\s[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g) || [])
    .map(function (t) { return /src="([^"]+)"/.exec(t)[1]; })
    .filter(function (s) { return WANTED.test(s); })
    .map(function (s) { return '<script src="' + s.split('?')[0] + '"></script>'; })
    .join('\n  ');

  var appJs = '<script src="assets/js/app.js"></script>';

  return [
    '<!DOCTYPE html>',
    '<html lang="en"><head>',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '  <base href="../../">',
    '  <title>P1-B8C acceptance</title>',
    /* ============================================================================================
       P1-B8D-R9 §5 — THREE FAILURES THAT LOOK ALIKE IN A CONSOLE AND ARE NOT ALIKE AT ALL.

       §5 is explicit that a run must report a JavaScript exception, a network 404 and an expected
       image fallback as three separate numbers. Chrome writes all three into the same devtools pane
       in the same red, which is how a page full of 404s was read as "some console noise".

       A RESOURCE FAILURE AND A SCRIPT FAILURE ARRIVE ON THE SAME EVENT and the only thing that
       tells them apart is where it was aimed. A failed <img>, <script> or <link> fires `error` AT
       THE ELEMENT, and it only reaches a window listener in the CAPTURE phase, because resource
       errors do not bubble. A thrown exception fires at `window`. So: one listener with capture,
       one without, split on `e.target`, and neither can count the other.

       IT IS IN THE HEAD, BEFORE EVERY OTHER SCRIPT, and it is emitted HERE rather than written into
       the generated file — which is the mistake this round made once already. `_p1b8c-acceptance.
       html` is an ARTIFACT: every run overwrites it, so an edit to it survives exactly until the
       next measurement and then reports zero for the rest of time. The page builder is the page.
       ============================================================================================ */
    '  <script>',
    '    window.__resourceErrors = [];',
    '    window.__jsErrors = [];',
    '    window.addEventListener("error", function (e) {',
    '      var t = e && e.target;',
    '      if (!t || t === window || t === document) return;',
    '      try {',
    '        window.__resourceErrors.push({',
    '          tag: String(t.tagName || "").toLowerCase(),',
    '          src: t.currentSrc || t.src',
    '            || (t.getAttribute && (t.getAttribute("href") || t.getAttribute("data-src"))) || ""',
    '        });',
    '      } catch (x) {}',
    '    }, true);',
    '    window.addEventListener("error", function (e) {',
    '      if (e && e.target && e.target !== window && e.target !== document) return;',
    '      try { window.__jsErrors.push(String((e && e.message) || e)); } catch (x) {}',
    '    });',
    '  </script>',
    '  ' + links,
    '</head>',
    '<body>',
    '  <header class="top-header"><div class="header-title">Kitchen Mama Operation System</div></header>',
    '  <div class="app-layout">',
    opts.activated ? realSidebar(index) : [
      '    <nav class="sidebar" id="appSidebar">',
      '      <div class="sidebar-toggle"><span class="menu-label sidebar-toggle-label">Menu</span></div>',
      '      <div class="menu-item"><span class="menu-icon">&#127978;</span><span class="menu-label">Site Inventory</span></div>',
      '      <div class="menu-parent" data-menu-id="sku-management"><span class="menu-icon">&#128221;</span><span class="menu-label">SKU Management</span></div>',
      '      <div class="menu-children" data-parent="sku-management"></div>',
      '      <div id="psb-nav-anchor"></div>',
      '      <div class="menu-parent" data-menu-id="carrier"><span class="menu-icon">&#128176;</span><span class="menu-label">Pricing Center</span></div>',
      '      <div class="menu-children" data-parent="carrier"></div>',
      '      <div class="menu-parent" data-menu-id="training"><span class="menu-icon">&#127891;</span><span class="menu-label">Training Center</span></div>',
      '      <div class="menu-children" data-parent="training"></div>',
      '    </nav>'
    ].join('\n'),
    '    <div class="main-content"><main class="content-area">',
    '      <div id="product-strategy-board-mount">',
    partial,
    '      </div>',
    '    </main></div>',
    '  </div>',
    '  ' + scripts,
    /* THE CAPTURE IS A PARAMETER AT P1-B8C-R2, AND THE RUNNER IS NOT FORKED.
       R2 photographs the LIVE-DERIVED rows; R1's acceptance photographed the deterministic ones. Two
       runners that look almost alike is the failure mode this project already met with two tab
       components: the drift is invisible until they are side by side. One runner, one page builder,
       one measure script, and the capture module is an argument. */
    captureFiles(cap).map(function (f) {
      return '  <script src="assets/tests/' + f + '"></script>';
    }).join('\n'),
    '  <script src="assets/tests/_p1b8c-replay.js"></script>',
    '  <script src="assets/tests/_p1b8c-interactions.js"></script>',
    '  ' + appJs,
    '  <script>' + bootScript(opts) + '</script>',
    '</body></html>'
  ].join('\n');
}

/**
 * The boot script. It is inline rather than a file because it is the ONE piece of this page that is
 * not shipped code, and keeping it visible in the generated artifact is how a reader can see exactly
 * how small the test-only surface is.
 */
function bootScript(opts) {
  var cap = captureOf(opts);
  var site = opts.site || cap.site;
  return [
    '(function () {',
    '  window.__ready = false; window.__error = null;',
    /* P1-B8D-R5 — THE RUN COUNTS ITS OWN REQUESTS AND HEARS ITS OWN CONSOLE.
       §7 asks the browser, not a Node probe, how many reads a page life costs and whether anything
       write-shaped went out. Both are answered from inside the page: `__wire` is the same log the
       fake transport keeps, and `__consoleErrors` is what a person would have seen in devtools. */
    /* P1-B8D-R6 - OFFLINE IS A BROWSER FACT, so it is simulated as one. The accessor asks
       `navigator.onLine` and treats `false` as decisive; nothing else can produce BROWSER_OFFLINE,
       and faking the refusal code instead would photograph a state the classifier never chose. */
    opts.offline ? '  try { Object.defineProperty(navigator, "onLine", { get: function () { return false; }, configurable: true }); } catch (e) {}' : '',
    '  window.__consoleErrors = [];',
    '  (function () { var e = console.error; console.error = function () {',
    '    try { window.__consoleErrors.push(Array.prototype.slice.call(arguments).join(" ")); } catch (x) {}',
    '    return e.apply(console, arguments); }; }());',
    '  try {',
    /* 1. THE MENU.
          DEFAULT: built by hand, because production never built it for a switched-off section.
          ACTIVATED (P1-B8D): the PRODUCTION function, because production does build it now — and a
          runner that hand-built it would be photographing its own arrangement rather than the
          shipped one. If `mountStagedMenus` mounts nothing, that is a failure to record, not a
          reason to reach for the builder underneath it. */
    opts.activated
      ? [
        '    var mounted = KM.nav.mountStagedMenus(document);',
        '    if (!mounted || mounted.indexOf("product-strategy") < 0) {',
        '      throw new Error("STOP_PRODUCTION_MOUNT_BUILT_NO_MENU");',
        '    }',
        '    var m = {',
        '      parent: document.querySelector(".menu-parent[data-menu-id=\'product-strategy\']"),',
        '      children: document.querySelector(".menu-children[data-parent=\'product-strategy\']")',
        '    };'
      ].join('\n')
      : [
        '    var m = KM.nav.buildStagedMenu("product-strategy", document);',
        '    var anchor = document.getElementById("psb-nav-anchor");',
        '    anchor.parentNode.insertBefore(m.parent, anchor);',
        '    anchor.parentNode.insertBefore(m.children, anchor);'
      ].join('\n'),
    '    m.parent.classList.add("is-open"); m.children.classList.add("is-open");',
    '    m.parent.classList.add("active");',
    /* 2. THE CAPTURE AT THE SOCKET. The one substitution §5 permits. */
    '    var cap = P1B8C_REPLAY.captureOf(' + cap.global + ');',
    opts.fail ? '    var failWith = ' + JSON.stringify(opts.fail) + ';' : '    var failWith = null;',
    /* P1-B8D-R4 — capabilityOff is now a SERVER ANSWER, not a poke at the client. The page derives
       its capability from the health read the replay serves, so "the feature is off" is modelled the
       way production meets it: the server says no. */
    /* P1-B8D-R10A §6 — A GENUINELY OFFLINE BROWSER, not merely a fetch that rejects.

       BROWSER_OFFLINE is classified from `navigator.onLine`. A run that only makes fetch reject is
       therefore testing SOURCE_NOT_CONNECTED under another name: the browser still believes it is
       online, and the classifier is RIGHT to say so. What §6 asks about is what a person on a dead
       network is told, and that needs the browser to agree it is offline.

       Defined before any read is issued and left in place, so every attempt in the bounded sequence
       sees the same world. */
    '    var __off = ' + (opts.offline ? 'true' : 'false') + ';',
    '    if (__off) { try { Object.defineProperty(window.navigator, "onLine", {',
    '      get: function () { return false; }, configurable: true }); } catch (e) {} }',
    '    var capOn = ' + (opts.capabilityOff ? 'false' : 'true') + ';',
    '    var t = P1B8C_REPLAY.install(window, KM.productPricingWorkspace, cap,',
    '      Object.assign({ capability: capOn }, failWith ? { fail: failWith } : {},',
    '        ' + JSON.stringify(Object.assign({}, opts.hang ? { hang: opts.hang } : {},
      opts.emptyWorkspace ? { emptyWorkspace: true } : {},
      opts.noCategories ? { noCategories: true } : {},
      opts.forceBadImage ? { forceBadImage: true } : {},
      /* P1-B8D-R10 §8 — the network faults. These are applied by the fake `fetch` UNDER a real
         transport, so what they exercise is production's own classification and recovery. */
      opts.netFault ? { netFault: opts.netFault } : {},
      opts.netFaultOnce ? { netFaultOnce: true } : {},
      (typeof opts.netFaultFrom === 'number') ? { netFaultFrom: opts.netFaultFrom } : {},
      opts.netFaultWhen ? { netFaultWhen: opts.netFaultWhen } : {},
      (typeof opts.netFaultUntil === 'number') ? { netFaultUntil: opts.netFaultUntil } : {},
      (typeof opts.netFaultSlowMs === 'number') ? { netFaultSlowMs: opts.netFaultSlowMs } : {},
      /* P1-B8D-R10D §10 — THE TWO WAYS A BOOTSTRAP CAN ANSWER WITHOUT ANSWERING THIS QUESTION.
         A deployment that predates the field omits it; a deployment that sends `1` or `"true"` sends
         something this build must not read as a decision. Both fail closed and NEITHER is the server
         saying "off", which is the distinction §10 exists to protect — so both have to be reachable
         from a scenario, and a whitelist that silently dropped them was how the first run of this
         matrix reported a fail-open as a pass. */
      opts.bootstrapOmitsProductStrategy ? { bootstrapOmitsProductStrategy: true } : {},
      (opts.bootstrapProductStrategyValue !== undefined)
        ? { bootstrapProductStrategyValue: opts.bootstrapProductStrategyValue } : {},
      opts.delayMs ? { delayMs: opts.delayMs } : {},
      opts.failOnly ? { failOnly: opts.failOnly } : {},
      opts.slowSite ? { slowSite: opts.slowSite, slowMs: opts.slowMs || 300 } : {})) + '));',
    '    window.__wire = t;',
    /* 3. MOUNT THROUGH `onMount`, WHICH IS THE PRODUCTION ENTRY POINT, NOT `create`.
          The first version of this called `create()` + `loadUniverse()` directly and photographed
          seven blank pages: `.module-section` is `display: none` until something adds `.active`, and
          the only thing that does is `onMount`. The board rendered perfectly into a subtree with no
          height, every screenshot was white, and nothing in the run said so. THE MEASUREMENTS SAID
          SO — `viewHost.w === 0` — which is the whole reason §10 asks for more than images. */
    /* ============================================================================================
       P1-B8D-R10D §12 — THE MOUNT NOW HAPPENS WHEN PRODUCTION'S MOUNTS HAPPEN: AFTER THE BOOT.

       Everything above this line runs DURING PARSING, which is correct and must stay that way — the
       fake network has to be in place before the application's boot can dispatch anything, or a
       suite would send a real request to a real deployment. But the MOUNT was running there too,
       and production has no such moment: a page is reached by navigating, which is always after
       DOMContentLoaded, which is when `app.js` declares and fires the capability read.

       Mounting before that inverted the order and the measurement showed it: the board asked the
       boot arbiter to wait for a dependency `app.js` had not declared yet, the arbiter correctly
       answered that an undeclared name does not block, and every scenario photographed the page
       still waiting. The page was right, the arbiter was right, and the harness was staging an
       order production cannot produce.

       `app.js` registers its listener from a <script> ABOVE this one, and DOM listeners fire in
       registration order, so the boot runs first and the mount runs after it — by the same rule
       production relies on rather than by a timer. */
    '    window.addEventListener("DOMContentLoaded", function () {',
    '    KM.pages.productStrategyBoard.onMount()',
    '      .then(function () {',
    '        var c = KM.pages.productStrategyBoard.lastController;',
    /* P1-B8D-R5 — THE SITE IS CHOSEN ON THE SCREEN. This line used to read
       `c.select({company,country,marketplace})`, which reaches past the page into the controller and
       hands it the one input a live operator had no way to give: the live board read ten sites,
       asked for one, and rendered no control. `chooseSite` sets the real `<select>`s and dispatches
       real `change` events, so what the seven viewports photograph is a board reached the way a
       person reaches it. `c` is still read below for its request counts. */
    /* P1-B8D-R7 - A SEQUENCE OF INTERACTIONS, NOT ONE. `opts.script` is a named routine in
       `_p1b8c-interactions.js`, run through the same screen after the same production mount; it
       records what it did into `window.__trace`, which the measurement below carries out. A
       stability question is about the SECOND and THIRD act, and there was no way to perform one. */
    '        return ' + (opts.script
      ? 'P1B8C_ACTS.run(' + JSON.stringify(opts.script) + ', document, '
        + JSON.stringify(opts.scriptArgs || {}) + ')'
      : (opts.noSite ? 'null' : 'P1B8C_REPLAY.chooseSite(document, ' + JSON.stringify(site) + ')')) + ';',
    '      })',
    '      .then(function () {',
    /* P1-B8D-R7 - ONLY ON A MOUNTED BOARD, which is the rule production already follows:
       `P.mount` applies a route when `res.mounted === true` and not otherwise. Calling it
       unconditionally threw inside the scenarios where no board mounted, and the run reported
       the harness's own error beside the product's behaviour as if both were findings. */
    /* ON A MOUNTED BOARD ONLY, and `currentRoute()` is not that test: it answers from STATE, which
       has a default view whether or not anything was ever mounted. The CONTROLLER knows. */
    opts.view ? '        if (window.PSB_BOARD && KM.pages.productStrategyBoard.lastController'
      + ' && KM.pages.productStrategyBoard.lastController.mounted === true)'
      + ' PSB_BOARD.showView(' + JSON.stringify(opts.view) + ');' : '',
    opts.scenario ? scenarioScript() : '',
    opts.presentation ? '        var bp = document.getElementById("btnPresent"); if (bp) bp.click();' : '',
    '        window.__ready = true;',
    '      })',
    '      .catch(function (e) { window.__error = String(e && e.message || e); window.__ready = true; });',
    '    });',
    /* A HELD-OPEN READ NEVER RESOLVES, so the mount chain never sets __ready. The shot has to be
       taken WHILE the request is outstanding, which is the whole point of a loading state. */
    opts.hang ? '  setTimeout(function () { window.__ready = true; }, 400);' : '',
    '  } catch (e) { window.__error = String(e && e.message || e); window.__ready = true; }',
    '}());',
    measureScript(cap)
  ].join('\n');
}

/** Apply a Meeting scenario, so the UNSAVED mark can be photographed (§8, §9). */
function scenarioScript() {
  return [
    '        try {',
    '          var tg = document.getElementById("meetingToggle"); if (tg) tg.click();',
    '          var ss = document.getElementById("scSeries");',
    '          if (ss && ss.options.length > 1) {',
    '            ss.value = ss.options[1].value;',
    '            ss.dispatchEvent(new Event("change", { bubbles: true }));',
    '            var iv = document.getElementById("scValue");',
    '            if (iv) { iv.value = "19.99"; iv.dispatchEvent(new Event("input", { bubbles: true })); }',
    '            var ap = document.getElementById("scApply"); if (ap) ap.click();',
    '          }',
    '        } catch (e) { /* recorded by the measurement below */ }'
  ].join('\n');
}

/**
 * THE MEASUREMENTS — the half of §10 that a screenshot cannot give.
 *
 * "Check every screenshot" is only a checkable instruction if there is something to check. These are
 * read from the LIVE DOM after layout: computed styles, bounding boxes, scroll extents. Written into
 * a <pre> so `--dump-dom` can carry them back out of the browser.
 */
function measureScript(cap) {
  return [
    'function __measure() {',
    '  function box(sel) {',
    '    var e = typeof sel === "string" ? document.querySelector(sel) : sel;',
    '    if (!e) return null;',
    '    var r = e.getBoundingClientRect();',
    '    var cs = getComputedStyle(e);',
    '    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width),',
    '      h: Math.round(r.height), display: cs.display, visibility: cs.visibility,',
    '      overflowX: cs.overflowX, color: cs.color, bg: cs.backgroundColor,',
    '      fontSize: cs.fontSize, fontWeight: cs.fontWeight,',
    '      scrollW: Math.round(e.scrollWidth), clientW: Math.round(e.clientWidth) };',
    '  }',
    '  var tabs = [].slice.call(document.querySelectorAll("#nav .navbtn")).map(function (b) {',
    '    var lbl = b.querySelector(".nav-text");',
    '    var cs = lbl ? getComputedStyle(lbl) : null;',
    '    return { view: b.getAttribute("data-view"), route: b.getAttribute("data-route"),',
    '      label: lbl ? lbl.textContent : null,',
    '      labelVisible: !!(cs && cs.display !== "none" && cs.visibility !== "hidden"',
    '        && lbl.getBoundingClientRect().width > 0),',
    '      selected: b.getAttribute("aria-selected"), tabindex: b.getAttribute("tabindex"),',
    '      box: box(b) };',
    '  });',
    '  var menuItems = [].slice.call(document.querySelectorAll("#appSidebar .menu-parent"))',
    '    .map(function (p) { return { id: p.getAttribute("data-menu-id"),',
    '      label: (p.querySelector(".menu-label") || {}).textContent || null,',
    '      y: Math.round(p.getBoundingClientRect().top) }; });',
    '  var kids = [].slice.call(document.querySelectorAll(".menu-children[data-parent=\\"product-strategy\\"] .menu-item"))',
    '    .map(function (n) { return { route: n.getAttribute("data-route"),',
    '      label: (n.querySelector(".menu-label") || {}).textContent || null,',
    '      visible: n.getBoundingClientRect().width > 0 }; });',
    '  var chart = document.querySelector(".psb-page .chartwrap");',
    '  var svg = document.querySelector(".psb-page .chart");',
    /* THE REAL CLASS NAMES, read out of psb-board-ui.js rather than guessed. The first version of
       this counted `.tick` and `.lane-label`, which the renderer has never emitted, and reported
       zero ticks on a chart that had seven — a probe that cannot fail is not a probe. */
    '  var axisTicks = [].slice.call(document.querySelectorAll(".psb-page .chart text.ytick"));',
    '  var gridLines = [].slice.call(document.querySelectorAll(".psb-page .chart line.grid"));',
    '  var axisLine = document.querySelector(".psb-page .chart line.axisline");',
    '  var lane = document.querySelector(".psb-page .chart g.labellane");',
    /* `g.labellane` holds only the rule line; the product labels are `text.xlabel` drawn per column
       into their own groups. Counting the lane group\'s children reported zero labels on a chart
       that had twenty-six of them. */
    '  var laneLabels = [].slice.call(document.querySelectorAll(".psb-page .chart text.xlabel"));',
    '  var laneSubs = [].slice.call(document.querySelectorAll(".psb-page .chart text.xsub"));',
    '  var images = [].slice.call(document.querySelectorAll(".psb-page .chart image"));',
    '  function inside(el, host) {',
    '    if (!el || !host) return null;',
    '    var a = el.getBoundingClientRect(), b = host.getBoundingClientRect();',
    '    return a.left >= b.left - 1 && a.right <= b.right + 1',
    '      && a.top >= b.top - 1 && a.bottom <= b.bottom + 1;',
    '  }',
    '  var de = document.documentElement;',
    '  return {',
    '    ready: window.__ready, error: window.__error,',
    '    consoleErrors: (window.__consoleErrors || []).slice(),',
    '    requests: window.__wire ? window.__wire.actions() : null,',
    '    viewport: { w: window.innerWidth, h: window.innerHeight },',
    '    page: { scrollW: Math.round(de.scrollWidth), clientW: Math.round(de.clientWidth),',
    '      horizontalOverflow: de.scrollWidth - de.clientWidth },',
    '    mainContent: box(".main-content"), contentArea: box(".content-area"),',
    '    sidebar: box("#appSidebar"),',
    '    menuParents: menuItems, psbChildren: kids,',
    '    viewnav: box(".psb-viewnav"), navList: box("#nav"), tabs: tabs,',
    '    stateHost: box("#psb-state-host"),',
    '    stateText: (document.getElementById("psb-state-host") || {}).textContent || "",',
    '    crumbs: (document.getElementById("crumbs") || {}).textContent || "",',
    '    banner: (document.getElementById("banner") || {}).textContent || "",',
    '    scopeBar: box("#scope"), viewHost: box("#view"),',
    '    chart: box(chart), svg: box(svg),',
    '    chartInternalOverflow: chart ? Math.round(chart.scrollWidth - chart.clientWidth) : null,',
    '    axisTickCount: axisTicks.length, gridLineCount: gridLines.length,',
    '    laneLabelCount: laneLabels.length, laneSubCount: laneSubs.length,',
    '    imageCount: images.length,',
    /* P1-B8C-R3 — AN <img> IN THE DOM IS NOT A PICTURE ON THE SCREEN, AND THIS ROUND IS ENTIRELY
       ABOUT THE DIFFERENCE. Counting elements would have scored a page of seven broken images
       exactly the same as a page of seven photographs. `naturalWidth` is the browser telling us the
       bytes arrived and decoded; nothing else in this measure script can distinguish the two. */
    '    htmlImages: [].slice.call(document.images).length,',
    '    htmlImagesLoaded: [].slice.call(document.images).filter(function (im) {',
    '      return im.complete && im.naturalWidth > 0; }).length,',
    '    htmlImagesBroken: [].slice.call(document.images).filter(function (im) {',
    '      return im.complete && im.naturalWidth === 0; }).length,',
    '    catfigImages: document.querySelectorAll(".catfig img.catfig-img").length,',
    '    catfigLoaded: [].slice.call(document.querySelectorAll(".catfig img.catfig-img"))',
    '      .filter(function (im) { return im.complete && im.naturalWidth > 0; }).length,',
    '    catfigFailedNotices: [].slice.call(document.querySelectorAll(".catfig .tfig-miss"))',
    '      .filter(function (e) { return /FAILED TO LOAD/.test(e.textContent || ""); }).length,',
    '    catfigMissingNotices: [].slice.call(document.querySelectorAll(".catfig .tfig-miss"))',
    '      .filter(function (e) { return /SOURCE MISSING/.test(e.textContent || ""); }).length,',
    '    chartImageHrefs: images.map(function (im) {',
    '      return im.getAttribute("data-src") || im.getAttribute("href") || ""; }),',
    '    imageMarkerCount: document.querySelectorAll(".psb-page .chart [data-role=\'image-marker\']").length,',
    '    fallbackMarkerCount: document.querySelectorAll(".psb-page .chart [data-role=\'fallback-marker\']").length,',
    /* THE TWO QUESTIONS §7 ACTUALLY ASKS: is the whole Y axis inside the chart box without the
       reader scrolling, and is the X lane inside it too. Answered from real boxes. */
    '    yAxisFullyVisible: inside(axisLine, chart),',
    '    xLaneFullyVisible: inside(lane, chart),',
    '    firstTickBox: axisTicks.length ? box(axisTicks[0]) : null,',
    '    lastTickBox: axisTicks.length ? box(axisTicks[axisTicks.length - 1]) : null,',
    '    laneBox: box(lane),',
    '    imageBoxes: images.slice(0, 3).map(function (im) { return box(im); }),',
    '    tables: [].slice.call(document.querySelectorAll(".psb-page table")).map(function (tb) {',
    '      return { scrollW: Math.round(tb.scrollWidth), clientW: Math.round(tb.clientWidth),',
    '        parentOverflowX: getComputedStyle(tb.parentNode).overflowX }; }),',
    '    drawerOpen: !!document.querySelector(".psb-page .drawer.is-open, .psb-page .insight.is-open"),',
    '    badges: [].slice.call(document.querySelectorAll(".psb-page .badge, .psb-page .km-tab-rail__count"))',
    '      .map(function (b) { var cs = getComputedStyle(b);',
    '        return { text: b.textContent, bg: cs.backgroundColor, radius: cs.borderRadius }; }),',
    '    captureKind: window.' + cap.global + ' ? ' + cap.global + '.' + cap.kindField + ' : null,',
    '    captureGlobal: ' + JSON.stringify(cap.global) + ',',
    '    captureFingerprint: window.' + cap.global + ' ? ' + cap.global + '.fingerprint() : null,',
    /* P1-B8D — THE PRICE STATUS CHIP, READ OUT OF THE LIVE DOM. §4 asks that no price be readable
       as an official one without its data status beside it, and "the source contains a chip
       function" is not that claim: the chip has to be PRESENT, on this view, with the values on it.
       `title` carries the full disclosure, so it is measured too — an empty tooltip would be a
       disclosure nobody can read. */
    '    priceStatusChip: (function () {',
    '      var c = document.getElementById("priceStatusChip");',
    '      if (!c) return null;',
    '      var r = c.getBoundingClientRect();',
    '      return { text: c.textContent, state: c.getAttribute("data-price-status-state"),',
    '        values: c.getAttribute("data-price-status-values"),',
    '        titleLen: (c.getAttribute("title") || "").length,',
    '        visible: r.width > 0 && r.height > 0, role: c.getAttribute("role") };',
    '    }()),',
    '    priceStatusDisclosure: (function () {',
    '      var d = document.getElementById("priceStatusDisclosure");',
    '      return d ? { present: true, chars: d.textContent.length,',
    '        column: d.getAttribute("data-source-column") } : null;',
    '    }()),',
    /* P1-B8D-R6 - THE COMPUTED STYLES, because a visual round cannot be accepted on a DOM
       assertion. "The label is not glued to the control" is a distance in pixels; "disabled is
       recognisable" is a set of properties that differ; "the controls do not overlap" is a
       comparison of rectangles. None of those can be read from markup. */
    'visual: (function () {',
    '  function el(s) { return document.querySelector(s); }',
    /* P1-B8D-R7 - WHAT THE SEVEN REPORTED PROBLEMS MEASURE AS. Each is read from the live DOM after
       layout, because each of them is a fact about pixels, computed styles or reachability that no
       amount of reading the source can settle. */
    '  function all(s) { return [].slice.call(document.querySelectorAll(s)); }',
    '  function r7() {',
    '    var page = el(".psb-page"), head = el(".psb-header");',
    /* NOT EVERY CONTROL UNDER #psb-filters IS IN THE PANEL. The scenario drawer is a CHILD of
       `#scope` - deliberately, because it is `position: fixed` and nesting it in a flex row would
       put a fixed element in a layout that believes it participates - so its three selects are
       inside this subtree and are not on this row at all. Counting them reported a control of
       height 0 and three more that "did not sit on their row", which is true and is about a
       different panel. */
    '    var ctrls = all("#psb-filters select, #psb-filters .psb-site__value,'
    + ' #psb-filters .cmd-context-value, #psb-filters .catbtn.is-more,'
    + ' #psb-filters .cmd-tools button")',
    '    .filter(function (e) { return !e.closest(".scn-drawer"); })',
    '    .map(function (e) {',
    '      var r = e.getBoundingClientRect();',
    '      var g = e.closest(".filter-group, .cmd-field");',
    '      var lab = g ? g.querySelector("label, .fl-label, .psb-site__label") : null;',
    '      var lr = lab ? lab.getBoundingClientRect() : null;',
    '      return { id: e.id || e.className, h: Math.round(r.height),',
    '        top: Math.round(r.top * 10) / 10, bottom: Math.round(r.bottom * 10) / 10,',
    '        labelGap: lr ? Math.round(r.top - lr.bottom) : null };',
    '    });',
    /* THE ORDER A PERSON READS, taken from the rendered row rather than from the markup: with the
       wrappers flattened, document order and visual order are the same thing again. */
    '    var order = all("#psb-filters .filter-group, #psb-filters .cmd-field,'
    + ' #psb-filters .cmd-more, #psb-filters .cmd-scn").map(function (g) {',
    '      var lab = g.querySelector("label, .fl-label");',
    '      var btn = g.querySelector("button");',
    '      return lab ? String(lab.textContent || "").trim()',
    '        : (btn ? String(btn.textContent || "").trim().split("▾")[0].trim() : "?");',
    '    });',
    /* THE PRICE: gone from the axis, still in the hover panel and still in the aria label. */
    '    var xsub = all("#view .xsub").map(function (t) { return String(t.textContent || "").trim(); })',
    '      .filter(function (v) { return v !== "" && /[0-9]/.test(v); });',
    '    var money = /[0-9]+[.,][0-9]{2}/;',
    '    var firstCol = el("#view g[tabindex], #view .node, #view g.node");',
    '    var tipHas = null, ariaHas = null;',
    '    try {',
    '      var cols = all("#view svg g").filter(function (g) { return g.getAttribute("aria-label"); });',
    '      if (cols.length) {',
    '        ariaHas = money.test(cols[0].getAttribute("aria-label"));',
    '        cols[0].dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));',
    '        var tip = document.getElementById("tip");',
    '        tipHas = !!(tip && !tip.hidden && money.test(String(tip.textContent || "")));',
    '        cols[0].dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));',
    '      }',
    '    } catch (e) { /* recorded as null */ }',
    /* THE HELP BUTTON, exercised by click, by Escape and by a real Enter keypress - because
       "openable" and "openable without a mouse" are two different claims. */
    '    var hb = document.getElementById("psbPageHelp");',
    '    var help = { count: all(".psb-help__btn").length,',
    '      label: hb ? hb.getAttribute("aria-label") : null,',
    '      glyph: hb ? String(hb.textContent || "").trim() : null,',
    '      expandedBefore: hb ? hb.getAttribute("aria-expanded") : null };',
    '    if (hb) {',
    '      hb.click();',
    '      help.openedByClick = !!document.getElementById("psbPageHelpPanel");',
    '      help.expandedAfter = hb.getAttribute("aria-expanded");',
    '      var panel = document.getElementById("psbPageHelpPanel");',
    '      help.text = panel ? String(panel.textContent || "") : "";',
    '      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));',
    '      help.closedByEscape = !document.getElementById("psbPageHelpPanel");',
    /* A <button> is activated by Enter and Space natively, and `.click()` from a KEY handler is how
       that reaches a listener; dispatching a bare keydown would prove nothing about either. */
    '      hb.focus();',
    '      hb.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));',
    '      hb.click();',
    '      help.openedByKeyboard = !!document.getElementById("psbPageHelpPanel")',
    '        && document.activeElement === hb;',
    '      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));',
    '    }',
    '    return {',
    '      pageBg: page ? getComputedStyle(page).backgroundColor : null,',
    '      headerBg: head ? getComputedStyle(head).backgroundColor : null,',
    '      filterPanels: all(".psb-filters").length,',
    /* PAINTED, not merely present. A card that is `display: none` is not a panel on the screen, and
       a state with no controls must not draw one. */
    '      filterPanelsPainted: all(".psb-filters").filter(function (n) {',
    '        var r = n.getBoundingClientRect();',
    '        return r.width > 0 && r.height > 0 && getComputedStyle(n).display !== "none";',
    '      }).length,',
    '      panelControls: ctrls, panelOrder: order,',
    '      chartHelpIcons: all(".info-btn").length,',
    '      pageHelpButtons: help.count,',
    '      pageHelpGlyph: help.glyph,',
    '      axisPriceRows: xsub,',
    '      tooltipHasPrice: tipHas, ariaHasPrice: ariaHas,',
    '      help: help',
    '    };',
    '  }',
    /* P1-B8D-R8 - THE THREE THINGS THIS ROUND REMOVED OR MOVED, AND THE ONE IT MADE VISIBLE.
       Every one is a pixel or a hit-test rather than a selector count: the toolbar has to be gone
       from the TAB ORDER and not merely from view, the sentence has to be gone from UNDER the
       control and present in the state host, and the close button has to be the thing PAINTED at
       its own centre - which it was not, at any viewport, before this round. */
    /* ============================================================================================
       P1-B8D-R9. Four questions this round added, none of which an earlier block could answer.

       1. §4 THE ROW IS BACK AND ONE BUTTON IS NOT. `chartToolbarControls` alone cannot tell "the
          toolbar returned" from "the toolbar returned WITH Fullscreen", so the groups are listed by
          id and fullscreen is counted by three separate tests — the id, the accessible name and the
          visible text — because a control renamed is a control still there.

       2. §3 THE SCENARIO NOTICE IS NOT PAINTED LIKE A FAULT. Measured as COMPUTED COLOUR, not as a
          class name: a stylesheet assertion proves what the rule says, and this round is about what
          the operator SEES. The stop-state's own computed border is measured alongside it, so
          "different from a refusal" is a comparison rather than a claim.

       3. §5 THE THREE KINDS OF FAILURE, COUNTED APART. `__resourceErrors` is every <img>/<script>/
          <link> that failed to load (a 404 on a server, ERR_FILE_NOT_FOUND under file://);
          `__jsErrors` is every uncaught exception; the fallback counts are the page CORRECTLY
          reporting a missing picture. A round that adds the first to the second and calls the total
          "console noise" is how these survived.

       4. §5 THE CHART'S OWN IMAGES. `document.images` does not include SVG <image>, so every
          measurement of "broken images" this harness has ever made was blind to the markers on the
          chart — which are the only product photographs on the default view. */
    '  function r9() {',
    '    var byId = function (i) { return document.getElementById(i); };',
    '    var fsById = all("#mode-fullscreen").length;',
    '    var fsByName = all("button, [role=button]").filter(function (b) {',
    '      var t = ((b.getAttribute("aria-label") || "") + " " + (b.textContent || "")).toLowerCase();',
    '      return t.indexOf("fullscreen") >= 0; }).length;',
    '    var groups = all("#chartControls .ctl-group").map(function (g) {',
    '      return (g.getAttribute("data-group") || "?") + ":"',
    '        + [].slice.call(g.querySelectorAll("button")).map(function (b) { return b.id || "?"; }).join("+"); });',
    '    var ctl = byId("chartControls");',
    '    var ctlBox = ctl ? ctl.getBoundingClientRect() : null;',
    /* THE TOOLBAR MUST WRAP INSIDE THE CARD RATHER THAN WIDEN THE PAGE. Its own scrollWidth against
       its own clientWidth is the only measurement that separates "it wrapped" from "it pushed". */
    '    var ctlOverflow = ctl ? Math.round(ctl.scrollWidth - ctl.clientWidth) : null;',
    '    var ban = byId("banner");',
    '    var bs = ban ? getComputedStyle(ban) : null;',
    '    var tag = document.querySelector(".badge-scenario-tag");',
    '    var tagS = tag ? getComputedStyle(tag) : null;',
    '    var chipOn = document.querySelector(".cmd-chip--on");',
    '    var chipS = chipOn ? getComputedStyle(chipOn) : null;',
    '    var stop = document.querySelector(".psb-state--stop");',
    '    var stopS = stop ? getComputedStyle(stop) : null;',
    '    var svgImgs = all("#view svg image.mk-img");',
    '    var plates = all("#view svg .mk-img-plate");',
    '    return {',
    '      fullscreenById: fsById,',
    '      fullscreenByName: fsByName,',
    '      toolbarGroups: groups,',
    '      toolbarIds: all("#chartControls button").map(function (b) { return b.id || "?"; }),',
    '      toolbarBox: ctlBox ? { w: Math.round(ctlBox.width), h: Math.round(ctlBox.height) } : null,',
    '      toolbarInternalOverflow: ctlOverflow,',
    '      densityNote: byId("densityNote") ? String(byId("densityNote").textContent || "").slice(0, 40) : null,',
    /* P1-B8D-R9 — TWO BACKSLASHES, AND THE ONE THAT WAS MISSING ATE EVERY LETTER S.

       This whole block is JAVASCRIPT INSIDE A JAVASCRIPT STRING. In a single-quoted literal an
       unknown escape collapses to the character itself, so a single-escaped `\s` emitted a bare
       `s`, and the regex the browser actually compiled was `/s+/g` — which replaces every run of
       the letter s with a space. The measured banner came back as "1  imulated price override
       ... The e are not price  the company charge ".

       IT WAS IN R8'S `filterNotes` LINE TOO, and no assertion ever noticed, because both sides
       compared against an EMPTY list: the text was only ever read back when the measurement was
       expected to be empty. A probe that mangles what it reports is fine right up until somebody
       reads it — which is what §3 asked for this round.

       Both occurrences are fixed. There is no other single-escaped character class in this file. */
    '      bannerText: ban ? String(ban.textContent || "").replace(/\\s+/g, " ").trim() : "",',
    '      bannerTag: tag ? String(tag.textContent || "").trim() : null,',
    '      bannerBg: bs ? bs.backgroundColor : null,',
    '      bannerColor: bs ? bs.color : null,',
    '      bannerBorderLeft: bs ? (bs.borderLeftWidth + " " + bs.borderLeftStyle + " " + bs.borderLeftColor) : null,',
    '      bannerTagBg: tagS ? tagS.backgroundColor : null,',
    '      chipBg: chipS ? chipS.backgroundColor : null,',
    '      chipColor: chipS ? chipS.color : null,',
    '      stopBorderLeft: stopS ? (stopS.borderLeftWidth + " " + stopS.borderLeftStyle + " " + stopS.borderLeftColor) : null,',
    '      ghostStroke: (function () { var gh = document.querySelector(".scen-ghost");',
    '        return gh ? getComputedStyle(gh).stroke : null; }()),',
    '      svgImages: svgImgs.length,',
    '      svgImagePlates: plates.length,',
    '      svgImagesFailed: all("#view svg [data-image-failed=\'true\']").length,',
    '      imageMarkers: all("#view svg [data-role=\'image-marker\']").length,',
    '      fallbackMarkers: all("#view svg [data-role=\'fallback-marker\']").length,',
    '      resourceErrors: (window.__resourceErrors || []).slice(),',
    '      resourceErrorCount: (window.__resourceErrors || []).length,',
    '      imageResourceErrors: (window.__resourceErrors || []).filter(function (r) {',
    '        return r.tag === "img" || r.tag === "image"; }).length,',
    '      jsErrors: (window.__jsErrors || []).slice(),',
    '      jsErrorCount: (window.__jsErrors || []).length,',
    '      manifestLoaded: !!window.KM_REPO_ASSET_MANIFEST,',
    '      manifestCount: window.KM_REPO_ASSET_MANIFEST ? window.KM_REPO_ASSET_MANIFEST.count : null',
    '    };',
    '  }',
    '  function r8() {',
    '    var tools = all("#chartControls button, .chartctl button");',
    '    var tabbable = tools.filter(function (b) {',
    '      if (b.disabled) return false;',
    '      var ti = b.getAttribute("tabindex");',
    '      if (ti !== null && Number(ti) < 0) return false;',
    '      var c = getComputedStyle(b);',
    '      if (c.display === "none" || c.visibility === "hidden") return false;',
    '      var r = b.getBoundingClientRect();',
    '      return r.width > 0 && r.height > 0;',
    '    });',
    '    var notes = all("#catEmpty, #catProvenance, .psb-filters .scope-empty,'
    + ' .psb-filters .scope-state").filter(function (n) {',
    '      if (n.closest && n.closest("#scenarioDrawer")) return false;',
    '      var r = n.getBoundingClientRect();',
    '      return r.width > 0 || r.height > 0;',
    '    }).map(function (n) { return (n.id || n.className) + ": "',
    '      + String(n.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 60); });',
    '    var cb = document.getElementById("scenarioDrawerClose");',
    '    var drawerOpen = !!(document.getElementById("scenarioDrawer")',
    '      && !document.getElementById("scenarioDrawer").hidden);',
    '    var cr = cb ? cb.getBoundingClientRect() : null;',
    '    var hit = (cr && cr.width > 0)',
    '      ? document.elementFromPoint(Math.round(cr.left + cr.width / 2),',
    '        Math.round(cr.top + cr.height / 2)) : null;',
    '    return {',
    '      chartToolbarControls: tools.length,',
    '      chartToolbarTabbables: tabbable.length,',
    '      chartToolbarContainers: all(".chartctl").length,',
    '      chartPresent: all("#view svg").length,',
    '      filterNotes: notes,',
    '      drawerOpen: drawerOpen,',
    '      closeButtons: all("#scenarioDrawerClose").length,',
    '      closeBox: cr ? { x: Math.round(cr.left), y: Math.round(cr.top),',
    '        w: Math.round(cr.width), h: Math.round(cr.height) } : null,',
    '      closeHit: hit ? (hit.id || hit.className || hit.tagName) : null,',
    '      closeHitIsTheButton: !!(hit && cb && (hit === cb || cb.contains(hit))),',
    '      closeInTabOrder: (function () {',
    '        if (!cb) return false;',
    '        var ti = cb.getAttribute("tabindex");',
    '        if (ti !== null && Number(ti) < 0) return false;',
    '        var r = cb.getBoundingClientRect();',
    '        return r.width > 0 && r.height > 0;',
    '      }()),',
    '      headerHeight: getComputedStyle(document.documentElement)',
    '        .getPropertyValue("--header-height").trim()',
    '    };',
    '  }',
    '  function bx(s) { var e = el(s); if (!e) return null; var r = e.getBoundingClientRect();',
    '    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width),',
    '      h: Math.round(r.height), bottom: Math.round(r.bottom), right: Math.round(r.right) }; }',
    '  function cs(s) { var e = el(s); return e ? getComputedStyle(e) : null; }',
    '  var pn = el("#psb-filters");',
    '  var fields = [].slice.call(document.querySelectorAll("#psb-site-host .psb-site__field"))',
    '    .map(function (f) {',
    '      var lab = f.querySelector("label");',
    '      var ctl = f.querySelector("select") || f.querySelector(".psb-site__value");',
    '      var lb = lab ? lab.getBoundingClientRect() : null;',
    '      var cb = ctl ? ctl.getBoundingClientRect() : null;',
    '      var s = ctl ? getComputedStyle(ctl) : null;',
    '      var ls = lab ? getComputedStyle(lab) : null;',
    '      return {',
    '        dim: ctl ? (ctl.getAttribute("data-psb-site-dim") || ctl.getAttribute("data-psb-site-value")) : null,',
    '        tag: ctl ? ctl.tagName : null,',
    '        labelFor: lab ? lab.getAttribute("for") : null,',
    '        labelFontSize: ls ? ls.fontSize : null,',
    '        labelColor: ls ? ls.color : null,',
    '        labelBottom: lb ? Math.round(lb.bottom) : null,',
    '        gap: (lb && cb) ? Math.round(cb.top - lb.bottom) : null,',
    '        controlH: cb ? Math.round(cb.height) : null,',
    '        controlW: cb ? Math.round(cb.width) : null,',
    '        top: cb ? Math.round(cb.top) : null,',
    '        left: cb ? Math.round(cb.left) : null,',
    '        right: cb ? Math.round(cb.right) : null,',
    '        bottom: cb ? Math.round(cb.bottom) : null,',
    '        disabled: ctl ? !!ctl.disabled : false,',
    '        borderStyle: s ? s.borderTopStyle : null,',
    '        borderColor: s ? s.borderTopColor : null,',
    '        bg: s ? s.backgroundColor : null,',
    '        color: s ? s.color : null,',
    '        cursor: s ? s.cursor : null',
    '      };',
    '    });',
    '  var sb = el(".psb-site");',
    '  var stateBox = el(".psb-state");',
    '  var sh = stateBox ? stateBox.querySelector(".psb-state__headline") : null;',
    '  var sd = stateBox ? stateBox.querySelector(".psb-state__detail") : null;',
    '  var hdr = cs(".psb-header");',
    '  var act = cs(".psb-header__actions");',
    '  var sub = cs(".psb-sub");',
    '  var railEl = document.getElementById("nav");',
    '  var railCs = railEl ? getComputedStyle(railEl) : null;',
    '  var activeTab = document.querySelector("#nav .is-active");',
    '  var actCs = activeTab ? getComputedStyle(activeTab) : null;',
    '  return {',
    '    siteHost: bx("#psb-site-host"),',
    '    siteBar: sb ? (function () { var s = getComputedStyle(sb); return { box: bx(".psb-site"),',
    '      display: s.display, flexWrap: s.flexWrap, bg: s.backgroundColor, radius: s.borderTopLeftRadius,',
    '      shadow: s.boxShadow, padTop: s.paddingTop, padLeft: s.paddingLeft, gap: s.columnGap,',
    '      cls: sb.className }; }()) : null,',
    /* P1-B8D-R7 - THE CARD MOVED, so the measurement follows it. `.psb-site` keeps its flex
       behaviour and gives up its chrome to the panel that now holds it and the board's own
       Category and Series; measuring the card on the bar would report a card that is correctly
       absent as a card that is missing. */
    '    panel: pn ? (function () { var s = getComputedStyle(pn); return { box: bx("#psb-filters"),',
    '      display: s.display, flexWrap: s.flexWrap, bg: s.backgroundColor, radius: s.borderTopLeftRadius,',
    '      shadow: s.boxShadow, padTop: s.paddingTop, padLeft: s.paddingLeft, gap: s.columnGap,',
    '      cls: pn.className }; }()) : null,',
    '    fields: fields,',
    '    state: stateBox ? (function () { var s = getComputedStyle(stateBox); return {',
    '      box: bx(".psb-state"), cls: stateBox.className, bg: s.backgroundColor,',
    '      borderLeftWidth: s.borderLeftWidth, borderLeftStyle: s.borderLeftStyle,',
    '      borderLeftColor: s.borderLeftColor, radius: s.borderTopLeftRadius, padTop: s.paddingTop,',
    '      shadow: s.boxShadow,',
    '      headlineFontSize: sh ? getComputedStyle(sh).fontSize : null,',
    '      headlineWeight: sh ? getComputedStyle(sh).fontWeight : null,',
    '      glyph: sh ? getComputedStyle(sh, "::before").content : null,',
    '      detailColor: sd ? getComputedStyle(sd).color : null,',
    '      detailSize: sd ? getComputedStyle(sd).fontSize : null }; }()) : null,',
    '    header: hdr ? { display: hdr.display, justify: hdr.justifyContent, wrap: hdr.flexWrap,',
    '      marginBottom: hdr.marginBottom,',
    '      actions: act ? { display: act.display, gap: act.columnGap, align: act.alignItems } : null,',
    '      sub: sub ? { fontSize: sub.fontSize, color: sub.color, margin: sub.marginTop } : null } : null,',
    '    rail: railCs ? { cls: railEl.className, overflowX: railCs.overflowX, display: railCs.display,',
    '      flexWrap: railCs.flexWrap,',
    '      activeBg: actCs ? actCs.backgroundColor : null,',
    '      activeWeight: actCs ? actCs.fontWeight : null,',
    '      activePad: actCs ? actCs.paddingTop + " " + actCs.paddingLeft : null,',
    '      tabCount: document.querySelectorAll("#nav .km-tab-rail__tab").length } : null,',
    '    presenting: document.body.className.indexOf("presenting") >= 0,',
    '    r7: r7(),',
    '    r8: r8(),',
    '    r9: r9()',
    '  };',
    '}()),',
    '    trace: window.__trace || null,',
    '    stagedNavEnabled: KM.stagedSections["product-strategy"].enabled === true,',
    '    flagStillFalse: KM.stagedSections["product-strategy"].enabled === false',
    '  };',
    '}',
    '(function poll() {',
    '  if (!window.__ready) { return setTimeout(poll, 50); }',
    '  setTimeout(function () {',
    '    var pre = document.createElement("pre");',
    '    pre.id = "__measurements";',
    '    pre.textContent = JSON.stringify(__measure());',
    '    document.body.appendChild(pre);',
    '    document.documentElement.setAttribute("data-measured", "1");',
    '  }, 120);',
    '}());'
  ].join('\n');
}

// ---------------------------------------------------------------------------------------------- 4
/**
 * AN EXACT VIEWPORT, BECAUSE `--window-size` IS NOT ONE.
 *
 * Measured on this machine: Chrome headless clamps the window to 548px wide, so `--window-size=390`
 * renders at 548 and `--window-size=768` renders at 736. Screenshotting those and calling them 390
 * and 768 would be a viewport matrix that reports sizes it never rendered — worse than not running
 * it, because the numbers look measured.
 *
 * An IFRAME has its own viewport. Media queries inside it evaluate against the frame, `position:
 * fixed` resolves to the frame, and `documentElement.clientWidth` is the frame's width. So the page
 * under test is framed at exactly W x H inside a window big enough to hold it, and every measurement
 * is read from inside the frame. `--allow-file-access-from-files` is what lets the wrapper reach in.
 */
function wrapperFor(pageFile, w, h) {
  return [
    '<!DOCTYPE html><html><head><meta charset="utf-8"><style>',
    'html,body{margin:0;padding:0;background:#fff}',
    'iframe{border:0;display:block;width:' + w + 'px;height:' + h + 'px}',
    '</style></head><body>',
    '<iframe id="f" src="' + path.basename(pageFile) + '"></iframe>',
    '<script>',
    '(function poll(){',
    '  var f=document.getElementById("f");',
    '  var d=null; try{ d=f.contentDocument; }catch(e){}',
    '  if(!d || !d.documentElement || d.documentElement.getAttribute("data-measured")!=="1"){',
    '    return setTimeout(poll,60);',
    '  }',
    '  var pre=document.createElement("pre"); pre.id="__measurements";',
    '  pre.textContent=d.getElementById("__measurements").textContent;',
    '  pre.style.display="none";',
    '  document.body.appendChild(pre);',
    '  document.documentElement.setAttribute("data-measured","1");',
    '}());',
    '</script></body></html>'
  ].join('\n');
}

function runChrome(browser, args) {
  var r = cp.spawnSync(browser, args, { encoding: 'utf8', timeout: 90000,
    maxBuffer: 96 * 1024 * 1024 });
  return { out: r.stdout || '', err: r.stderr || '', status: r.status };
}

function baseArgs(extra) {
  return [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--disable-extensions', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--allow-file-access-from-files',
    '--virtual-time-budget=8000'
  ].concat(extra);
}

function fileUrl(p) {
  return 'file:///' + path.resolve(p).replace(/\\/g, '/').replace(/ /g, '%20')
    .replace(/#/g, '%23').replace(/\?/g, '%3F');
}

/** Render once at an EXACT viewport: a PNG plus the measurements the framed DOM reports. */
function shot(browser, pageFile, out, vp) {
  var png = path.join(out, 'shot-' + vp.id + (vp.suffix || '') + '.png');
  var wrapFile = path.join(path.dirname(pageFile), '_p1b8c-frame-' + vp.w + 'x' + vp.h + '.html');
  fs.writeFileSync(wrapFile, wrapperFor(pageFile, vp.w, vp.h), 'utf8');
  /* The WINDOW only has to be big enough to contain the frame; the FRAME is the viewport. */
  var winW = Math.max(vp.w, 560), winH = Math.max(vp.h, 200);
  runChrome(browser, baseArgs([
    '--window-size=' + winW + ',' + winH,
    '--screenshot=' + png,
    fileUrl(wrapFile)
  ]));
  var dom = runChrome(browser, baseArgs([
    '--window-size=' + winW + ',' + winH,
    '--dump-dom',
    fileUrl(wrapFile)
  ]));
  /* `[^>]*` because the wrapper's <pre> also carries a style attribute, and an exact-match
     regex found nothing and reported every viewport as unmeasured. */
  var m = /<pre id="__measurements"[^>]*>([\s\S]*?)<\/pre>/.exec(dom.out);
  var parsed = null;
  if (m) {
    try {
      parsed = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
    } catch (e) { parsed = { parseError: String(e.message) }; }
  }
  try { fs.unlinkSync(wrapFile); } catch (e) { /* leave it */ }
  return { png: fs.existsSync(png) ? png : null, measurements: parsed,
    pngBytes: fs.existsSync(png) ? fs.statSync(png).size : 0 };
}

function pdf(browser, pageFile, out, name) {
  var f = path.join(out, name + '.pdf');
  runChrome(browser, baseArgs(['--print-to-pdf=' + f, '--no-pdf-header-footer', fileUrl(pageFile)]));
  return fs.existsSync(f) ? { file: f, bytes: fs.statSync(f).size } : null;
}

// ---------------------------------------------------------------------------------------------- 5
function main() {
  /* argv[2] is the output directory, argv[3] the capture. R2 runs
     `node _p1b8c-visual-runner.js docs/evidence/p1-b8c-r2-live-acceptance live`. */
  /* THE NAME IS LOOKED UP RATHER THAN COMPARED. The first version tested `=== 'live'` and silently
     fell back to `deterministic` for anything else, so P1-B8C-R3's first run asked for `assets`, got
     the deterministic capture, and reported zero images as though that were the measurement. An
     unrecognised capture is now a STOP, because a run that quietly photographs different data than it
     was asked for is worse than one that does not start. */
  var which = process.argv[3] || 'deterministic';
  if (!Object.prototype.hasOwnProperty.call(CAPTURES, which)) {
    console.log('STOP_UNKNOWN_CAPTURE: ' + which);
    console.log('known captures: ' + Object.keys(CAPTURES).join(', '));
    process.exitCode = 2;
    return;
  }
  /* P1-B8D — the fourth argument, and it is a MODE rather than a second runner.
     `node _p1b8c-visual-runner.js <out> <capture> activated` photographs the same matrix through the
     production menu mount and against the real sidebar. Anything other than the literal word is
     refused rather than treated as false, for the same reason an unknown capture is a STOP: a run
     that quietly photographs the staged arrangement while its filename says `activated` is evidence
     of the wrong thing, and nothing in the output would say so. */
  var modeArg = process.argv[4];
  if (modeArg !== undefined && modeArg !== 'activated' && modeArg !== 'staged') {
    console.log('STOP_UNKNOWN_MODE: ' + modeArg);
    console.log('known modes: staged (default), activated');
    process.exitCode = 2;
    return;
  }
  var activated = modeArg === 'activated';
  var DEFAULT_OUT = { live: 'p1-b8c-r2-live-acceptance', assets: 'p1-b8c-r3-image-acceptance',
    deterministic: 'p1-b8c-acceptance' };
  var out = process.argv[2] || path.join(ROOT, 'docs', 'evidence',
    activated ? 'p1-b8d-activation-acceptance' : DEFAULT_OUT[which]);
  var browser = findBrowser();
  if (!browser) {
    console.log('STOP_NO_BROWSER_AVAILABLE');
    console.log('§10 requires a real headless browser and none of these exists:');
    CANDIDATES.forEach(function (c) { console.log('  ' + c); });
    process.exitCode = 2;
    return;
  }
  console.log('browser: ' + browser);
  if (!fs.existsSync(out)) fs.mkdirSync(out, { recursive: true });

  var results = { browser: path.basename(browser), generated_at_utc_date: '2026-09-12',
    capture: which, capture_module: captureFiles(CAPTURES[which]).join(' + '),
    capture_global: CAPTURES[which].global,
    mode: activated ? 'activated' : 'staged',
    menu_built_by: activated ? 'KM.nav.mountStagedMenus (production)' : 'KM.nav.buildStagedMenu (test-only)',
    sidebar: activated ? 'index.html, verbatim' : 'approximated in the runner',
    viewports: {}, views: {}, states: {}, print: null };
  console.log('capture: ' + which + '  (' + captureFiles(CAPTURES[which]).join(' + ') + ')');

  /* THE PAGE FILE LIVES BESIDE THE CAPTURE, because its <script src> paths are relative to it. */
  var pageFile = path.join(__dirname, '_p1b8c-acceptance.html');

  // 1. the seven viewports, on the Executive Overview
  /* THE VIEWPORT MATRIX IS PHOTOGRAPHED ON CATEGORY ANALYSIS, because that is the view with the
     chart in it. Executive Overview is KPI cards and has no axis, so a responsive matrix taken
     there would have reported `ticks: 0` at every size and proved nothing about either axis. */
  fs.writeFileSync(pageFile, buildPage({ view: 'category', capture: which, activated: activated }), 'utf8');
  VIEWPORTS.forEach(function (vp) {
    var r = shot(browser, pageFile, out, vp);
    results.viewports[vp.id] = r.measurements;
    results.viewports[vp.id] = results.viewports[vp.id] || {};
    results.viewports[vp.id].__png = r.png ? path.basename(r.png) : null;
    results.viewports[vp.id].__pngBytes = r.pngBytes;
    console.log('  ' + vp.id + ' -> ' + (r.png ? path.basename(r.png) : 'NO PNG')
      + '  measured=' + (r.measurements ? 'yes' : 'NO'));
  });

  // 2. each of the six views at 1440x900
  ['overview', 'category', 'risk', 'quality', 'workspace', 'advanced'].forEach(function (v) {
    fs.writeFileSync(pageFile, buildPage({ view: v, capture: which, activated: activated }), 'utf8');
    var r = shot(browser, pageFile, out, { id: 'view-' + v, w: 1440, h: 900 });
    results.views[v] = r.measurements || {};
    results.views[v].__png = r.png ? path.basename(r.png) : null;
    console.log('  view ' + v + ' -> ' + (r.png ? path.basename(r.png) : 'NO PNG'));
  });

  // 3. the state matrix, photographed
  var STATES = [
    { id: 'feature-disabled', opts: { capabilityOff: true, noSite: true } },
    { id: 'not-authorized', opts: { fail: { apiCode: 'AUTH_OR_ACCESS_HTML' }, noSite: true } },
    { id: 'timeout', opts: { fail: { apiCode: 'REQUEST_TIMEOUT' }, noSite: true } },
    { id: 'non-json', opts: { fail: { apiCode: 'TRANSPORT_NON_JSON_RESPONSE' }, noSite: true } },
    { id: 'source-unavailable', opts: { fail: { message: 'boom' }, noSite: true } },
    { id: 'awaiting-site', opts: { noSite: true } },
    /* A REAL SITE, CHOSEN THE REAL WAY, whose server answers with no rows. The previous version
       passed a site outside the universe and therefore photographed the REFUSAL under the name
       EMPTY — two different states wearing one label. */
    { id: 'empty-site', opts: { emptyWorkspace: true } },
    /* P1-B8D-R6 — the five §8 asks for that were never photographed. `ready` is the ordinary loaded
       board at the state grid's own viewport, so the matrix carries its own baseline rather than
       borrowing one from the viewport sweep. */
    { id: 'ready', opts: {} },
    { id: 'loading-universe', opts: { hang: 'universe', noSite: true } },
    { id: 'loading-workspace', opts: { hang: 'workspace' } },
    { id: 'offline', opts: { offline: true, fail: { message: 'network down' }, noSite: true } },
    { id: 'presentation', opts: { presentation: true } }
  ];
  STATES.forEach(function (s) {
    fs.writeFileSync(pageFile, buildPage(Object.assign({ capture: which, activated: activated }, s.opts)), 'utf8');
    var r = shot(browser, pageFile, out, { id: 'state-' + s.id, w: 1440, h: 900 });
    results.states[s.id] = r.measurements || {};
    results.states[s.id].__png = r.png ? path.basename(r.png) : null;
    console.log('  state ' + s.id + ' -> ' + (r.png ? path.basename(r.png) : 'NO PNG'));
  });

  // 4. a scenario, then print
  fs.writeFileSync(pageFile, buildPage({ view: 'category', scenario: true, capture: which, activated: activated }), 'utf8');
  var sc = shot(browser, pageFile, out, { id: 'scenario-active', w: 1440, h: 900 });
  results.states['scenario-active'] = sc.measurements || {};
  results.states['scenario-active'].__png = sc.png ? path.basename(sc.png) : null;
  console.log('  scenario -> ' + (sc.png ? path.basename(sc.png) : 'NO PNG'));

  var p = pdf(browser, pageFile, out, 'print-scenario-active');
  results.print = p ? { file: path.basename(p.file), bytes: p.bytes } : null;
  console.log('  print -> ' + (p ? path.basename(p.file) + ' (' + p.bytes + ' bytes)' : 'NO PDF'));

  // 5. a full-page desktop capture
  fs.writeFileSync(pageFile, buildPage({ view: 'overview', capture: which, activated: activated }), 'utf8');
  var full = shot(browser, pageFile, out, { id: 'fullpage-1920', w: 1920, h: 2400 });
  results.viewports['fullpage-1920x2400'] = full.measurements || {};
  results.viewports['fullpage-1920x2400'].__png = full.png ? path.basename(full.png) : null;
  console.log('  fullpage -> ' + (full.png ? path.basename(full.png) : 'NO PNG'));

  var mf = path.join(out, 'measurements.json');
  fs.writeFileSync(mf, JSON.stringify(results, null, 1), 'utf8');
  console.log('\nmeasurements: ' + mf);

  /* THE ARTIFACT STAYS, because the suite reads it back. The generated page is left in place too,
     so a person can open it and look at the same thing the runner photographed. */
  console.log('page: ' + pageFile);
}

if (require.main === module) { main(); }
/* `shot` is exported so a SUITE can take one measurement without driving the whole matrix: the
   visual-integration suite needs computed styles at two or three widths, not twenty-four images. */
module.exports = { buildPage: buildPage, VIEWPORTS: VIEWPORTS, findBrowser: findBrowser,
  shot: shot, wrapperFor: wrapperFor };
