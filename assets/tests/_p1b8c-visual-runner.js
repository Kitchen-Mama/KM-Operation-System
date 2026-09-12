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
 * THE ONLY TEST-ONLY ACTS, both of which §3 and §5 permit and neither of which is a bypass:
 *   1. `KM.api.transport.post` answers from the capture (§5's one permitted substitution).
 *   2. `KM.nav.buildStagedMenu` is CALLED, which production never does, to render the declared menu.
 *      `KM_STAGED_SECTIONS_.enabled` stays false; the menu it builds still cannot open the page.
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
function buildPage(opts) {
  opts = opts || {};
  var index = read(path.join(ROOT, 'index.html'));
  var partial = read(path.join(ROOT, 'assets', 'html', 'pages', 'product-strategy-board.html'));

  /* EVERY STYLESHEET INDEX.HTML LOADS, IN ORDER. The cascade is the thing under test. */
  var links = (index.match(/<link rel="stylesheet" href="([^"]+)">/g) || [])
    .map(function (t) { return /href="([^"]+)"/.exec(t)[1]; })
    .map(function (h) { return '<link rel="stylesheet" href="../../' + h + '">'; })
    .join('\n  ');

  /* THE PAGE'S OWN SCRIPTS, from the same document, in the same order. Anything else index.html loads
     is shell machinery this page does not mount; loading all of it would pull in twenty pages'
     controllers and measure their boot, not this one's. */
  var WANTED = /product-strategy|km-product-pricing|km-api-foundation|km-transport|utils\/tab-rail/;
  var scripts = (index.match(/<script src="([^"]+)"><\/script>/g) || [])
    .map(function (t) { return /src="([^"]+)"/.exec(t)[1]; })
    .filter(function (s) { return WANTED.test(s); })
    .map(function (s) { return '<script src="../../' + s.split('?')[0] + '"></script>'; })
    .join('\n  ');

  var appJs = '<script src="../../assets/js/app.js"></script>';

  return [
    '<!DOCTYPE html>',
    '<html lang="en"><head>',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '  <title>P1-B8C acceptance</title>',
    '  ' + links,
    '</head>',
    '<body>',
    '  <header class="top-header"><div class="header-title">Kitchen Mama Operation System</div></header>',
    '  <div class="app-layout">',
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
    '    </nav>',
    '    <div class="main-content"><main class="content-area">',
    '      <div id="product-strategy-board-mount">',
    partial,
    '      </div>',
    '    </main></div>',
    '  </div>',
    '  ' + scripts,
    '  <script src="_p1b8c-capture.js"></script>',
    '  <script src="_p1b8c-replay.js"></script>',
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
  var site = opts.site || { company: 'Kitchen Mama', country: 'US', marketplace: 'Amazon' };
  return [
    '(function () {',
    '  window.__ready = false; window.__error = null;',
    '  try {',
    /* 1. THE STAGED MENU, BUILT AND PLACED. Production never calls this. */
    '    var m = KM.nav.buildStagedMenu("product-strategy", document);',
    '    var anchor = document.getElementById("psb-nav-anchor");',
    '    anchor.parentNode.insertBefore(m.parent, anchor);',
    '    anchor.parentNode.insertBefore(m.children, anchor);',
    '    m.parent.classList.add("is-open"); m.children.classList.add("is-open");',
    '    m.parent.classList.add("active");',
    /* 2. THE CAPTURE AT THE SOCKET. The one substitution §5 permits. */
    '    var cap = P1B8C_REPLAY.captureOf(P1B8C_CAPTURE);',
    opts.fail ? '    var failWith = ' + JSON.stringify(opts.fail) + ';' : '    var failWith = null;',
    '    var t = P1B8C_REPLAY.install(window, KM.productPricingWorkspace, cap,',
    '      failWith ? { fail: failWith } : {});',
    opts.capabilityOff ? '    KM.productPricingWorkspace.setCapability({});' : '',
    /* 3. MOUNT THROUGH `onMount`, WHICH IS THE PRODUCTION ENTRY POINT, NOT `create`.
          The first version of this called `create()` + `loadUniverse()` directly and photographed
          seven blank pages: `.module-section` is `display: none` until something adds `.active`, and
          the only thing that does is `onMount`. The board rendered perfectly into a subtree with no
          height, every screenshot was white, and nothing in the run said so. THE MEASUREMENTS SAID
          SO — `viewHost.w === 0` — which is the whole reason §10 asks for more than images. */
    '    KM.pages.productStrategyBoard.onMount()',
    '      .then(function () {',
    '        var c = KM.pages.productStrategyBoard.lastController;',
    '        return ' + (opts.noSite ? 'null' : 'c.select(' + JSON.stringify(site) + ')') + ';',
    '      })',
    '      .then(function () {',
    opts.view ? '        if (window.PSB_BOARD) PSB_BOARD.showView(' + JSON.stringify(opts.view) + ');' : '',
    opts.scenario ? scenarioScript() : '',
    '        window.__ready = true;',
    '      })',
    '      .catch(function (e) { window.__error = String(e && e.message || e); window.__ready = true; });',
    '  } catch (e) { window.__error = String(e && e.message || e); window.__ready = true; }',
    '}());',
    measureScript()
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
function measureScript() {
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
    '    captureKind: window.P1B8C_CAPTURE ? P1B8C_CAPTURE.CAPTURE_KIND : null,',
    '    captureFingerprint: window.P1B8C_CAPTURE ? P1B8C_CAPTURE.fingerprint() : null,',
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
  var out = process.argv[2] || path.join(ROOT, 'docs', 'evidence', 'p1-b8c-acceptance');
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
    viewports: {}, views: {}, states: {}, print: null };

  /* THE PAGE FILE LIVES BESIDE THE CAPTURE, because its <script src> paths are relative to it. */
  var pageFile = path.join(__dirname, '_p1b8c-acceptance.html');

  // 1. the seven viewports, on the Executive Overview
  /* THE VIEWPORT MATRIX IS PHOTOGRAPHED ON CATEGORY ANALYSIS, because that is the view with the
     chart in it. Executive Overview is KPI cards and has no axis, so a responsive matrix taken
     there would have reported `ticks: 0` at every size and proved nothing about either axis. */
  fs.writeFileSync(pageFile, buildPage({ view: 'category' }), 'utf8');
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
    fs.writeFileSync(pageFile, buildPage({ view: v }), 'utf8');
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
    { id: 'empty-site', opts: { site: { company: 'Cookware Co', country: 'UK', marketplace: 'Amazon' } } }
  ];
  STATES.forEach(function (s) {
    fs.writeFileSync(pageFile, buildPage(s.opts), 'utf8');
    var r = shot(browser, pageFile, out, { id: 'state-' + s.id, w: 1440, h: 900 });
    results.states[s.id] = r.measurements || {};
    results.states[s.id].__png = r.png ? path.basename(r.png) : null;
    console.log('  state ' + s.id + ' -> ' + (r.png ? path.basename(r.png) : 'NO PNG'));
  });

  // 4. a scenario, then print
  fs.writeFileSync(pageFile, buildPage({ view: 'category', scenario: true }), 'utf8');
  var sc = shot(browser, pageFile, out, { id: 'scenario-active', w: 1440, h: 900 });
  results.states['scenario-active'] = sc.measurements || {};
  results.states['scenario-active'].__png = sc.png ? path.basename(sc.png) : null;
  console.log('  scenario -> ' + (sc.png ? path.basename(sc.png) : 'NO PNG'));

  var p = pdf(browser, pageFile, out, 'print-scenario-active');
  results.print = p ? { file: path.basename(p.file), bytes: p.bytes } : null;
  console.log('  print -> ' + (p ? path.basename(p.file) + ' (' + p.bytes + ' bytes)' : 'NO PDF'));

  // 5. a full-page desktop capture
  fs.writeFileSync(pageFile, buildPage({ view: 'overview' }), 'utf8');
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
module.exports = { buildPage: buildPage, VIEWPORTS: VIEWPORTS, findBrowser: findBrowser };
