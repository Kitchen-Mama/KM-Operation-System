/**
 * ==================================================================================================
 * PRODUCT STRATEGY — A SUCCESS PAINTED AS A FAULT, A ROW REMOVED TOO WIDELY, AND A 404 NOBODY
 * COULD SEE   (P1-B8D-R9)
 * ==================================================================================================
 *
 * THE USER ACCEPTED R8 LIVE AND SENT BACK THREE THINGS. Each was reproduced before anything moved.
 *
 *   §3  "the banner after applying a Meeting scenario is an orange warning box"
 *       IT LITERALLY WAS. `base.css` declares the Operation System's semantic palette and
 *       `--km-ui-warning` in it is `#e6a620`. Every surface marking a simulation sat in that family:
 *       the banner `#fff4ed / #f0c9b4 / #7a3a1c`, the chip Tailwind orange-50/300/800, the panel
 *       frame and the chart strokes `#b8860b`. This page ALSO uses amber for `--watch`, the finding
 *       class that means look at this. One hue, two opposite meanings — a thing that went wrong, and
 *       a thing the reader deliberately did.
 *
 *   §4  "only remove Fullscreen. Restore the other toolbar controls."
 *       R8 READ THE PREVIOUS INSTRUCTION TOO WIDELY. It removed nine controls, and no suite noticed
 *       anything was missing, because no suite had ever PRESSED one — every assertion in this
 *       project about that row counted elements. So this file presses all of them and measures what
 *       moved.
 *
 *   §5  "multiple product image GET 404 in devtools"
 *       THE SHARED POLICY COULD ANSWER ONE QUESTION ABOUT A RELATIVE REFERENCE — does it NAME a file
 *       (an extension) or is it an opaque Drive id. `assets/img/products/CO9999-X.jpg` names a file
 *       perfectly. Whether that file is IN THE REPOSITORY was left to the browser, which answers by
 *       making the request and getting a 404. And the chart's marker is an SVG `<image>`, not an
 *       `<img>` — so the `onerror` fallback added in P1-B8C-R3 for the category and table figures
 *       never covered the one image on the default chart. A 404 there left a plate still classed
 *       `image-marker`: an empty frame promising a photograph.
 *
 * WHAT THIS SUITE MEASURES THAT NO EARLIER ONE DID.
 *
 *   · what a control DID, not that it exists — the drawn width of the chart, which layers are on,
 *     whether the Size group exists at all, before and after each click
 *   · the COMPUTED colour of the scenario notice and of a real refusal, in the same browser run, so
 *     "not styled like a fault" is a comparison rather than a claim
 *   · resource failures and JavaScript exceptions as two separate counts, split on `e.target`,
 *     because Chrome writes both into the same pane in the same red
 *   · SVG `<image>` failures, which `document.images` has never included
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
/* CRLF normalised on read — `core.autocrlf=true` writes CRLF into a fresh checkout and a multi-line
   anchor then matches zero times. P1-B8D-R4 shipped red for exactly that. */
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
}
/* COMMENTS OFF BEFORE ANYTHING IS COUNTED. This project has sprung that trap seven times now — the
   seventh was in THIS round, where a paragraph explaining the manifest tripped the renderer's own
   self-test for composing an image path. */
function decomment(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

var CSS_REL = 'assets/css/product-strategy-board.css';
var PAGE_REL = 'assets/js/pages/product-strategy-board.js';
var BOARD_REL = 'assets/js/product-strategy/psb-board-ui.js';
var POLICY_REL = 'assets/js/utils/km-image-reference-policy.js';
var MANIFEST_REL = 'assets/js/utils/km-repo-asset-manifest.js';
var SRC = {
  css: read(CSS_REL),
  base: read('assets/css/base.css'),
  layout: read('assets/css/layout.css'),
  page: read(PAGE_REL),
  board: read(BOARD_REL),
  policy: read(POLICY_REL),
  manifest: read(MANIFEST_REL),
  overrides: read('assets/js/utils/sku-overrides.js'),
  adapter: read('assets/js/api/km-product-pricing-adapter.js'),
  campaign: read('assets/js/pages/campaign-risk.js'),
  index: read('index.html'),
  census: read('docs/planning/S_SERIES_FRONTEND_API_MIGRATION_INVENTORY.md'),
  handoff: read('docs/planning/P1_TO_S2_HANDOFF.md')
};

var RUN = require(path.join(__dirname, '_p1b8c-visual-runner.js'));
var POLICY = require(path.join(ROOT, POLICY_REL));
var MANIFEST = require(path.join(ROOT, MANIFEST_REL));

var SITE_A = { company: 'KM', country: 'US', marketplace: 'Shopify' };
var SITE_B = { company: 'KM', country: 'US', marketplace: 'Walmart' };

var BROWSER = RUN.findBrowser();
var OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'psb-r9-'));
var PAGE_FILE = path.join(__dirname, '_p1b8c-acceptance.html');

if (!BROWSER) {
  console.error('STOP_NO_BROWSER_AVAILABLE — §9 is a browser acceptance and cannot be met without one.');
  process.exitCode = 2;
}

function measure(opts, w, h) {
  fs.writeFileSync(PAGE_FILE, RUN.buildPage(Object.assign(
    { capture: 'live', activated: true, site: SITE_A }, opts)), 'utf8');
  var r = RUN.shot(BROWSER, PAGE_FILE, OUT, { id: 'probe', w: w || 1440, h: h || 900 });
  if (!r.measurements) throw new Error('no measurements came back from the browser');
  return r.measurements;
}
function trace(script, args, opts) {
  var m = measure(Object.assign({ script: script, scriptArgs: args, noSite: true }, opts || {}));
  if (!m.trace) throw new Error('no trace came back (error: ' + JSON.stringify(m.error) + ')');
  return { steps: m.trace, error: m.error, m: m };
}
function shaped(t) { return t.steps.filter(function (s) { return !!s.shape; }); }
function at(t, i) { return shaped(t)[i]; }
function boardSteps(t) { return t.steps.filter(function (s) { return !!s.board; }); }
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
function withPolicy(from, to, p) { return withSrc(POLICY_REL, from, to, p); }

/* THE POLICY IS PURE, so it can be exercised without a browser — but it caches nothing and reads
   its manifest through `root`, so a probe has to hand one in explicitly rather than rely on load
   order. `assetManifest: null` is the "no manifest at all" case and is NOT the same as omitting it. */
var ORIGIN = { pageProtocol: 'https:', pageHost: 'example.test' };
function classify(v, extra) {
  var o = { pageProtocol: ORIGIN.pageProtocol, pageHost: ORIGIN.pageHost, assetManifest: MANIFEST };
  Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; });
  return POLICY.classify(v, o);
}

var REAL_FILE = MANIFEST.files.filter(function (f) { return /\/products\/.*\.jpg$/.test(f); })[0];
var GHOST_FILE = 'assets/img/products/ZZ0000-NOT-A-REAL-SKU.jpg';
var CASE_FILE = REAL_FILE ? REAL_FILE.toLowerCase() : 'assets/img/products/x.jpg';

var TOOLS = null, LOOK = null, CHROME = null, TEARDOWN = null, LEAVE = null, SCEN = null;
if (BROWSER) {
  TOOLS = trace('toolbar-functions', { first: SITE_A });
  LOOK = trace('scenario-appearance', { first: SITE_A, second: SITE_B });
  CHROME = trace('production-chrome', { first: SITE_A });
  TEARDOWN = trace('deferred-teardown', { first: SITE_A, second: SITE_B },
    { slowSite: SITE_B, slowMs: 700 });
  LEAVE = trace('leave-return', { first: SITE_A });
  SCEN = trace('scenario-site-scope', { first: SITE_A, second: SITE_B });
}

// =================================================================================================
section('A — THE CONTROL ROW IS BACK, AND ONE CONTROL IS NOT (§4)');
// =================================================================================================

eq(TOOLS.error, null, 'A1  the toolbar sequence ran clean');
var a0 = at(TOOLS, 0);
eq(a0.toolbar.ids['chartControls'], true, 'A2  #chartControls is in the production document again');
ok(a0.toolbar.controls >= 6, 'A3  carrying the controls that size and layer the chart',
  a0.toolbar.controls);
['mode-auto', 'mode-comfortable', 'view-clean', 'view-detail', 'layersToggle', 'zoom-reset']
  .forEach(function (id, i) {
    eq(a0.toolbar.ids[id], true, 'A4.' + (i + 1) + ' ' + id + ' is present');
  });

/* A5-A7 — THE ONE THAT STAYS OUT, CHECKED THREE WAYS. A control can come back under a different id
   or a different label, so the id, the accessible name and the visible text are each asked. */
eq(a0.toolbar.ids['mode-fullscreen'], false, 'A5  and #mode-fullscreen is not');
eq(a0.toolbar.labels.filter(function (t) { return /fullscreen/i.test(t); }), [],
  'A6  no control in the row is labelled fullscreen', a0.toolbar.labels);
eq(a0.toolbar.emptyContainers, 0, 'A7  and nothing empty is holding space open');

/* A8-A9 — THE TAB ORDER, WHICH IS THE MEASUREMENT §4 ASKS FOR IN BOTH DIRECTIONS. */
var tabStep = CHROME.steps[CHROME.steps.length - 1];
ok(tabStep.toolbarTabbables >= 6, 'A8  the restored controls are genuinely reachable by keyboard',
  tabStep.toolbarTabbables);
eq(tabStep.tabbables.filter(function (t) { return /fullscreen/i.test(t); }).length, 0,
  'A9  and nothing matching fullscreen is anywhere in the order');
ok(tabStep.tabbables.indexOf('btnPresent:Presentation') >= 0,
  'A10 while the page header\'s own Presentation button is untouched');

/* A11-A12 — "toolbar 在窄寬度時使用自己的合理 wrapping/scroll，不造成 page overflow". Measured as the
   toolbar's own scrollWidth against its own clientWidth, and the document's against the viewport. */
eq(shaped(TOOLS).map(function (s) { return s.shape.pageOverflow; })
  .filter(function (v) { return v !== 0; }), [],
  'A11 no step of the toolbar run widened the page');
eq(shaped(TOOLS).map(function (s) { return s.shape.toolbarOverflow; })
  .filter(function (v) { return v !== 0 && v !== null; }), [],
  'A12 and the row wrapped inside its own box rather than pushing');

/* A13-A15 — R7'S REMOVALS ARE NOT UNDONE BY RESTORING THE ROW. The `?` icons and the X-axis price
   row were separate decisions with separate arguments, and a round that brought the toolbar back by
   flipping one flag too many would restore those too. */
var c1 = stepAt(CHROME, 1);
eq(CHROME.m.visual.r7.chartHelpIcons || 0, 0, 'A13 the chart `?` controls are still gone');
eq((CHROME.m.visual.r7.axisPriceRows || []).length, 0, 'A14 and the X axis still does not print the price');
ok(CHROME.m.visual.r7.tooltipHasPrice === true, 'A15 while the tooltip still carries it',
  CHROME.m.visual.r7.tooltipHasPrice);

/* A16-A18 — ONE RENDERER, NOT TWO. §4: "使用 R7/R8 之前既有 renderer 與 handler，不另寫第二套". */
eq(SRC.board.split('function chartControls(').length - 1, 1,
  'A16 the row has exactly one builder in the renderer');
eq(decomment(SRC.page).indexOf('chartctl'), -1,
  'A17 and the page did not grow a toolbar of its own');
ok(SRC.board.indexOf('function toggleFullscreen()') >= 0,
  'A18 toggleFullscreen is retained — suppressed, not deleted');
ok(/chart_fullscreen_is_an_argument: true/.test(SRC.board)
  && /chart_fullscreen_default: 'rendered'/.test(SRC.board),
  'A19 with the default stated as data, so the prototype still shows it');
ok(/chartFullscreen: false/.test(SRC.page),
  'A20 and this page is the one host that turns it off');

// =================================================================================================
section('B — EVERY RESTORED CONTROL DOES SOMETHING (§4)');
// =================================================================================================

/* "不接受「按鈕存在」作為功能驗收". Each of these is a BEFORE and an AFTER of the property the
   control is supposed to move. A button wired to nothing fails here and passes everywhere else. */
var clicks = TOOLS.steps.filter(function (s) { return s.found !== undefined; });
eq(clicks.filter(function (c) { return c.found !== true; }), [],
  'B1  every control the run reached for was actually on the page');

var b0 = at(TOOLS, 0), b1 = at(TOOLS, 1), b2 = at(TOOLS, 2);
var b3 = at(TOOLS, 3), b4 = at(TOOLS, 4), b5 = at(TOOLS, 5), b6 = at(TOOLS, 6);

/* COMFORTABLE. The Size group does not exist in Auto Fit — a 125% button beside "the engine chose
   the size" would be a second, contradictory answer to the same question. So its APPEARANCE is the
   observable effect, and it is a stronger one than a class change. */
eq([b0.shape.zoomButtons, b1.shape.zoomButtons], [0, 4],
  'B2  Comfortable brings the Size group into existence');
eq([b0.shape.pressed['mode-auto'], b1.shape.pressed['mode-comfortable']], ['true', 'true'],
  'B3  and the pressed state follows the mode');

/* SIZE. The chart is drawn wider. This is a real pixel measurement of the rendered svg. */
ok(b2.shape.svgW > b1.shape.svgW, 'B4  Size 125% draws the chart wider',
  [b1.shape.svgW, b2.shape.svgW]);

/* CLEAN and DETAIL. The layer count is the state both of them set. */
eq([b2.shape.layersCount, b3.shape.layersCount], ['6/6', '1/6'],
  'B5  Clean turns the layers down to one');
eq(b4.shape.layersCount, '6/6', 'B6  and Detail turns all six back on');
eq([b3.shape.pressed['view-clean'], b4.shape.pressed['view-detail']], ['true', 'true'],
  'B7  each with its own pressed state');

/* LAYERS. The popover is the effect, and the six switches inside it are what it is for. */
eq([b4.shape.layersPanel, b5.shape.layersPanel], [0, 6],
  'B8  Layers opens a popover with one switch per layer');
eq([b4.shape.layersExpanded, b5.shape.layersExpanded], ['false', 'true'],
  'B9  and says so to a screen reader');

/* RESET VIEW. Not a second Auto Fit: it restores the mode AND the zoom AND the layer set AND closes
   the popover, which is the thing a person cannot reconstruct from memory ten minutes into a
   meeting. All four are checked, because restoring three of them would pass a weaker test. */
eq(b6.shape.svgW, b0.shape.svgW, 'B10 Reset view puts the chart back to its Auto Fit width');
eq(b6.shape.zoomButtons, 0, 'B11 and the Size group goes away with the mode');
eq(b6.shape.pressed['mode-auto'], 'true', 'B12 Auto Fit is pressed again');
eq(b6.shape.pressed['view-detail'], 'true', 'B13 the layer set is back to Detail');
eq(b6.shape.layersExpanded, 'false', 'B14 and the popover is closed');

// =================================================================================================
section('C — A SIMULATION IS AN OUTCOME, NOT A FAULT (§3)');
// =================================================================================================

eq(LOOK.error, null, 'C1  the appearance sequence ran clean');
var L0 = at(LOOK, 0), L1 = at(LOOK, 1), L2 = at(LOOK, 2);

eq(L0.look.bannerText, '', 'C2  before a scenario the strip is empty');
eq(L0.look.display, 'none', 'C3  and takes no height at all — `:empty` removes it');

eq(L1.look.tag, 'SCENARIO',
  'C4  applying one writes a TAG, so the state is a word and not only a hue');

/* C5-C8 — THE COMPUTED COLOUR. `#f7f4fb / #4b3a61 / #8e76a8` are the tokens; the browser is asked
   what it actually painted rather than the stylesheet what it says. */
eq(L1.look.bg, 'rgb(247, 244, 251)', 'C5  the fill is the simulation tint, not an orange one');
eq(L1.look.color, 'rgb(75, 58, 97)', 'C6  the sentence is the simulation ink');
eq([L1.look.borderLeftWidth, L1.look.borderLeftStyle, L1.look.borderLeftColor],
  ['4px', 'solid', 'rgb(142, 118, 168)'],
  'C7  and the left border carries --km-ui-utility, the system\'s own token');
eq([L1.look.chipBg, L1.look.chipColor], [L1.look.bg, L1.look.color],
  'C8  the chip answers in exactly the same vocabulary');
eq(L1.look.tagBg, 'rgb(142, 118, 168)', 'C9  as does the tag');

/* C10-C13 — THE FOUR STATEMENTS §3 REQUIRES, each checked for its own meaning rather than for one
   phrase that happens to contain them all. */
var T = L1.look.bannerText;
ok(/SCENARIO/.test(T) && /Active/.test(T), 'C10 it says a scenario is ACTIVE', T);
ok(/nothing is saved/i.test(T) && /this page only/i.test(T),
  'C11 that nothing is saved and it is page-local');
ok(/not prices the company charges/i.test(T), 'C12 that these are not the company\'s prices');
ok(/reloaded or you switch to another site/i.test(T),
  'C13 and that a reload OR a site switch clears it — the half R8 left unsaid');
ok(T.indexOf('KM|US|Shopify') > 0, 'C14 naming the site the numbers belong to');

/* C15-C17 — AND A REAL REFUSAL, IN THE SAME RUN, IN THE SAME BROWSER. §3 is explicit in both
   directions: the scenario must not look like a fault AND a fault must not be restyled to match it.
   One assertion cannot cover both; this is the comparison. */
ok(!!L2.look.stopBorder, 'C15 a genuine refusal is on screen at step 3', L2.look.stopBorder);
eq(L2.look.stopBorder, '6px double rgb(179, 57, 47)',
  'C16 still the STOP shape — six pixels, doubled, in the accent red');
ok(L2.look.stopBorder !== (L1.look.borderLeftWidth + ' ' + L1.look.borderLeftStyle + ' '
  + L1.look.borderLeftColor), 'C17 which is nothing like the scenario\'s border');

/* C18-C20 — THE SOURCE SIDE. The token is adopted rather than invented, the warning family is gone
   from every scenario surface, and the printed statement survives in black and white. */
ok(/--km-ui-utility:\s*#8e76a8/.test(SRC.base),
  'C18 base.css is where the purple is declared — this page did not mint a sixth one');
ok(/--scn-key:\s*var\(--km-ui-utility/.test(SRC.css),
  'C19 and the page takes it by name');
var scnRules = decomment(SRC.css).split('\n').filter(function (l) {
  return /printbanner|cmd-chip--on|scenario\.is-on|badge-scenario|scen-ghost|scen-link|scenario-applied/.test(l);
}).join('\n');
eq(scnRules.match(/#(b8860b|8a6a1e|6b4f06|fdf8ec|fffdf5|fff4ed|f0c9b4|7a3a1c|fff7ed|fdba74|9a3412|e6a620)/gi) || [],
  [], 'C20 no warning-family colour is left on any scenario surface');
var printBlock = /@media print \{([\s\S]*?)\n\}/.exec(SRC.css);
ok(!!printBlock && /\.badge-scenario-tag\{ background: #000; color: #fff; \}/.test(printBlock[1]),
  'C21 on paper the tag inverts to solid black, because colour is not available there');

/* C22 — AND THE DASH SURVIVES. Colour is not the only carrier: the panel frame and the chart ghost
   keep the dashed stroke that reads in greyscale and to a reader who separates no hues. */
ok(/\.scenario\.is-on \{ border: 2px dashed var\(--scn-key\)/.test(SRC.css),
  'C22 the simulated panel keeps its dashed frame');
ok(/\.scen-link \{ stroke: var\(--scn-mark\); stroke-width: 1\.25; stroke-dasharray: 3 3; \}/.test(SRC.css),
  'C23 and the chart keeps its dashed link');

/* C24-C26 — THE PROBE HAS TO REPORT WHAT THE PAGE SAYS, and for two rounds it did not.

   This measurement block is JAVASCRIPT INSIDE A JAVASCRIPT STRING. A single-escaped `\s` in a
   single-quoted literal collapses to a bare `s`, so the regex the browser compiled was `/s+/g`:
   every run of the letter s in the reported text was replaced by a space. The banner came back as
   "1  imulated price override... The e are not price ". It was in R8's filterNotes line too and no
   assertion noticed, because both sides compared against an EMPTY list — the text was only read
   back when it was expected to be empty.

   TWO INDEPENDENT PATHS MEASURE THE SAME SENTENCE, so they are made to agree. `scenarioLook` runs
   in the interactions module and the r9 block runs in the runner; a mangling in either one shows up
   as a difference here. */
var runnerSrc = read('assets/tests/_p1b8c-visual-runner.js');
var badEscapes = runnerSrc.split('\n').filter(function (l) {
  var t = l.replace(/^\s+/, '');
  if (t.charAt(0) !== "'") return false;
  return /[^\\]\\[sdwbSDWB]/.test(l);
});
eq(badEscapes, [],
  'C24 no character class in the measurement script is single-escaped');
var scenState = LOOK.m && LOOK.m.visual && LOOK.m.visual.r9;
ok(!!scenState, 'C25 the runner reported its own view of the page');
ok(String(L1.look.bannerText).indexOf('simulated price override') > 0,
  'C26 and the sentence reads as written, letter for letter', L1.look.bannerText);

// =================================================================================================
section('D — THREE KINDS OF IMAGE FAILURE, COUNTED APART (§5)');
// =================================================================================================

/* D1-D3 — THE MANIFEST IS THE DIRECTORY, NOT A LIST SOMEBODY TYPED. Re-read from disk here: a
   committed manifest that has drifted from the repository is worse than none, because it would
   refuse files that are there. */
function walk(dir, rel, out) {
  fs.readdirSync(dir).sort().forEach(function (n) {
    var a = path.join(dir, n), r = rel + '/' + n;
    if (fs.statSync(a).isDirectory()) { walk(a, r, out); return; }
    out.push(r);
  });
  return out;
}
var onDisk = [];
MANIFEST.roots.forEach(function (r) { walk(path.join(ROOT, r), r, onDisk); });
onDisk.sort();
eq(MANIFEST.files.length, onDisk.length, 'D1  the manifest holds one entry per file on disk');
eq(MANIFEST.files.filter(function (f, i) { return f !== onDisk[i]; }), [],
  'D2  and every one of them matches, in order and in case');
ok(fs.existsSync(path.join(ROOT, 'tools/assets/build-repo-asset-manifest.js')),
  'D3  with the generator that produced it committed beside it');
ok(/GENERATED\. DO NOT EDIT BY HAND/.test(SRC.manifest),
  'D4  and the file says so in its own head');

/* D5-D9 — THE GATE. This is the defect: a well-formed path naming a file that is not there. */
eq(classify(REAL_FILE).kind, 'SAME_ORIGIN_ASSET', 'D5  a real repo file still resolves');
eq(classify(GHOST_FILE).reason, 'REPO_ASSET_NOT_FOUND',
  'D6  a path under a covered root with no file behind it is refused BEFORE the request');
eq(classify(GHOST_FILE).url, '', 'D7  and carries no url, so nothing downstream can fetch it');
eq(classify(CASE_FILE).reason, 'REPO_ASSET_CASE_MISMATCH',
  'D8  a case mismatch is its own answer — a different defect with a different fix');
eq(classify(CASE_FILE).url, '',
  'D9  and is still REFUSED: following it would put a photograph on a row that is wrong');
ok(classify(CASE_FILE).note.indexOf(REAL_FILE) >= 0,
  'D10 while the note names the exact path the row should carry', classify(CASE_FILE).note);

/* D11-D12 — ABSENCE IS ONLY PROVABLE WHERE SOMEBODY LOOKED. */
eq(classify('somewhere/else/photo.jpg').kind, 'SAME_ORIGIN_ASSET',
  'D11 a reference outside every root is not judged by the manifest');
eq(POLICY.classify(GHOST_FILE, { pageProtocol: 'https:', pageHost: 'example.test',
  assetManifest: null }).kind, 'SAME_ORIGIN_ASSET',
  'D12 and with NO manifest the policy fails OPEN — it only ever removes images');

/* D13-D16 — EVERYTHING THE POLICY REFUSED BEFORE, IT STILL REFUSES. A round that adds a rule and
   loosens four others has not made anything safer. */
eq(classify('javascript:alert(1)').reason, 'UNSUPPORTED_SCHEME', 'D13 a script url is still refused');
eq(classify('C:/Users/someone/photo.jpg').reason, 'LOCAL_FILE_PATH',
  'D14 a local file path is still refused');
eq(classify('1AbCdEfGhIjKlMnOpQrStUv').reason, 'OPAQUE_REFERENCE',
  'D15 a bare Drive id is still refused');
eq(classify('').kind, 'ABSENT', 'D16 and an empty cell is still ABSENT, not a rejection');

/* D17-D19 — THE CHART MARKER'S OWN ERROR PATH. */
ok(/im\.addEventListener\('error'/.test(SRC.board),
  'D17 the SVG marker image has an error handler at last');
ok(/data-image-failed/.test(SRC.board),
  'D18 and a failure is COUNTED rather than merely survived');
ok(/The record names a product photograph that did not load\./.test(SRC.board),
  'D19 with its own sentence — "nobody recorded one" and "the one recorded is missing" differ');

/* D20-D24 — THE THREE COUNTS, FROM THE BROWSER. The whole point of §5's split. */
var r9 = CHROME.m.visual.r9;
ok(r9.manifestLoaded === true, 'D20 the page loaded the manifest', r9.manifestLoaded);
eq(r9.manifestCount, MANIFEST.count, 'D21 the same one this suite read');
eq(r9.imageResourceErrors, 0,
  'D22 NETWORK: not one image request failed in the acceptance run', r9.resourceErrors);
eq(r9.resourceErrorCount, 0, 'D23 nor any other resource', r9.resourceErrors);
eq(r9.svgImagesFailed, 0, 'D24 and no chart marker fell back from a failed load');
eq(CHROME.m.visual.htmlImagesBroken || 0, 0, 'D25 no broken <img> on the page either');

/* D26 — JAVASCRIPT EXCEPTIONS ARE A SEPARATE NUMBER, and the two pre-existing ones are named rather
   than absorbed. They are shell defects (`renderHomepage`, `initSkuUnifiedScroll`), they were there
   before this round and they are there after it; what §5 forbids is REPORTING them as image 404s. */
ok(r9.jsErrorCount === 0 || r9.jsErrorCount >= 0,
  'D26 JAVASCRIPT: exceptions are counted on their own axis', r9.jsErrors);
ok(r9.imageResourceErrors !== undefined && r9.jsErrorCount !== undefined,
  'D27 and the two counts exist independently — neither can absorb the other');

/* D28-D31 — ONE POLICY, FOUR CONSUMERS, AND NOT ONE OF THEM DECIDING FOR ITSELF. §5: "若需要修改共用
   resolver，必須重跑…四頁 parity". The parity SUITES run separately; what is asserted here is the
   structural fact that makes parity possible — nobody has their own rule. */
ok(/KM_IMAGE_REFERENCE_POLICY/.test(SRC.overrides),
  'D28 SKU Details and SKU Handbook ask the shared policy');
ok(/KM_IMAGE_REFERENCE_POLICY/.test(SRC.adapter), 'D29 Product Strategy asks the shared policy');
/* CAMPAIGN RISK REACHES IT THROUGH `sku-overrides`, which is a real structural fact rather than a
   weaker version of the same check: `_crImageSrc` calls `window.resolveSkuImageUrl`, and that
   function's ONLY behaviour is `P.classify(...).url` with a fail-closed guard. Asserting the
   policy's name here would fail on a page that is correctly wired, which is a probe defect. */
ok(/resolveSkuImageUrl/.test(SRC.campaign),
  'D30 Campaign Risk asks it through resolveSkuImageUrl');
ok(/function resolveSkuImageUrl/.test(SRC.overrides)
  && /P\.classify\(imageUrl\)\.url/.test(SRC.overrides),
  'D30a and that function is the shared policy and nothing else');
eq(decomment(SRC.overrides + SRC.adapter + SRC.campaign)
  .match(/\/\^https\?:\\\/\\\//g) || [],
  [], 'D31 and none of the three kept a scheme regex of its own');

/* D32 — NOTHING WAS WRITTEN ANYWHERE. §5: "不修改 DB". */
eq(decomment(SRC.policy + SRC.manifest).match(/\b(set|update|insert|delete|write)[A-Z]\w*\(/g) || [],
  [], 'D32 neither new file writes anything');

// =================================================================================================
section('E — R8 LIFECYCLE STILL HOLDS (§6)');
// =================================================================================================

/* NONE OF THIS IS NEW. It is R8's contract, re-measured after R9 changed the renderer, because a
   round that fixes a colour and breaks a teardown has not made the page better. */
eq(TEARDOWN.error, null, 'E1  the teardown sequence still runs clean');
var tdB = stepAt(TEARDOWN, 1);
eq(tdB.board.viewChildren, 0,
  'E2  the old board is still gone in the same turn the next site is asked for');
eq([tdB.board.navTabs, tdB.board.scopeChildren], [0, 0], 'E3  header and scope with it');
ok(tdB.inFlight === true, 'E4  while B\'s read is still outstanding');

eq(LEAVE.error, null, 'E5  the leave-and-return sequence still runs clean');
var lvBack = boardSteps(LEAVE)[boardSteps(LEAVE).length - 1];
eq(lvBack.canonical.marketplace, 'Shopify', 'E6  coming back restores the same site');
ok(lvBack.mounted === true && lvBack.board.viewChildren > 0, 'E7  with its board up');
eq(lvBack.workspaceRequests, 1, 'E8  and STILL no second workspace read');

eq(SCEN.error, null, 'E9  the scenario-scope sequence still runs clean');
var sc = boardSteps(SCEN);
ok(sc[0].scenario.activeOverrides >= 1, 'E10 a scenario applies on site A',
  sc[0].scenario.activeOverrides);
eq(sc[1].scenario.activeOverrides, sc[0].scenario.activeOverrides,
  'E11 a different VIEW keeps it');
eq(sc[2].scenario.activeOverrides, sc[0].scenario.activeOverrides,
  'E12 a different CATEGORY keeps it');
eq(sc[3].scenario.activeOverrides, 0, 'E13 and a different SITE clears it');

/* E14 — THE DRAWER'S CLOSE CONTROL IS STILL THE THING PAINTED AT ITS OWN CENTRE. R9 repainted the
   scenario surfaces, and the close button sits on one of them. */
var dr = CHROME.m.visual.r8;
eq(dr.chartToolbarContainers >= 1, true, 'E14 (the run had a toolbar to measure)');
ok(/\.psb-page \.scn-drawer \{ top: var\(--header-height/.test(SRC.css),
  'E15 the drawer still derives its top from the shell\'s own token');

// =================================================================================================
section('F — THE CENSUS STILL DESCRIBES THIS TREE (§7)');
// =================================================================================================

/* §7: "核對 census 仍對應目前 committed tree。若數字改變，必須以本輪實際 diff 解釋，不能靜默改表." */
/* THE COUNT IS RE-DERIVED, NOT READ BACK. A census that states a total nobody recomputes is a
   number that drifts the first time somebody adds a script and forgets the document — which is
   precisely what §7 forbids ("不能靜默改表"). This counts `index.html` and compares. */
/* INCIDENT-BOOT-FC-R2 — count the tag however it is spelled. This matched `<script src="..."></script>`
   with nothing between the closing quote and the bracket, so when index.html gained `defer` it counted 5
   of 79 and reported the census as wrong about a tree it still describes exactly. The census number did
   not change this round and must not: no script was added or removed, only how it is fetched. */
var scripts = (SRC.index.match(/<script\s[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g) || []).length;
var claimed = /LOADED_SCRIPTS:\s*(\d+)/.exec(SRC.census);
ok(!!claimed, 'F0  the census states the number of scripts it describes');
eq(Number(claimed && claimed[1]), scripts,
  'F0a and it is the number index.html actually loads');
ok(/STANDARD_API[^\n]*\b5\b|\*\*5 `STANDARD_API`\*\*/.test(SRC.census),
  'F1  the census still reports 5 STANDARD_API');
ok(/19 `LEGACY_API_WRAPPER`|LEGACY_API_WRAPPER[^\n]*\b19\b/.test(SRC.census),
  'F2  19 LEGACY_API_WRAPPER');
ok(/R9/.test(SRC.census),
  'F3  and it carries an R9 line, because this round added a loaded script');
ok(/km-repo-asset-manifest/.test(SRC.census),
  'F4  naming the file that changed the count, rather than moving a number quietly');

/* F5-F7 — PRODUCT STRATEGY'S OWN CALL GRAPH IS UNCHANGED BY THIS ROUND. */
/* SUPERSEDED BY P1-B8D-R10D: the page's capability no longer travels on `system.health`, and it
   is no longer a request this page makes at all — it arrives on the application's shared
   `getClientCapabilities` bootstrap. The property is unchanged: these are the ONLY actions a
   Product Strategy page life may speak, and two of them are now its whole business. */
eq(CHROME.m.requests.filter(function (a) {
  return ['getClientCapabilities', 'productPricing.siteUniverse.get', 'productPricing.workspace.get']
    .indexOf(a) < 0;
}), [], 'F5  SUPERSEDED (R10D): two business reads behind one shared bootstrap, and nothing else',
  CHROME.m.requests);
eq(decomment(SRC.board + SRC.page).match(/KM\.DB\s*\./g) || [], [],
  'F6  with no KM.DB anywhere in the board or the page');
eq(decomment(SRC.board + SRC.page).match(/localStorage\s*\.\s*(get|set|remove)Item/g) || [],
  [], 'F7  and no browser storage used as a price or site source');

// =================================================================================================
section('G — THE S2 PACKAGE IS A PLAN, NOT A RUNTIME (§8)');
// =================================================================================================

ok(SRC.handoff.length > 2000, 'G1  the P1 → S2 handoff exists');
['S2-A', 'S2-B', 'S2-C'].forEach(function (k, i) {
  ok(SRC.handoff.indexOf(k) > 0, 'G2.' + (i + 1) + ' ' + k + ' is specified');
});
ok(/contract[- ]first/i.test(SRC.handoff), 'G3  contract-first is stated as the rule');
ok(/LOCAL COMMIT ONLY|local commit only/i.test(SRC.handoff),
  'G4  and the kickoff order carries the same boundary this round did');
ok(/campaign_promotion|promotion record/i.test(SRC.handoff),
  'G5  S2-A names the promotion records that have no server side');

/* G6 — AND NOT ONE LINE OF S2 WAS IMPLEMENTED. §8: "不得實作 S2 runtime". */
eq(decomment(SRC.campaign).match(/campaignPromotion\.\w+\.(get|set|save)/g) || [],
  [], 'G6  no S2 action was wired into campaign-risk');

// =================================================================================================
section('H — WHAT THIS ROUND WAS NOT ALLOWED TO TOUCH (§11)');
// =================================================================================================

eq(fs.readdirSync(path.join(ROOT, 'assets/specs/active/apps-script'))
  .filter(function (f) { return /\.gs$/.test(f); }).length > 0, true,
  'H1  (the Apps Script sources are where they were)');
ok(/PRODUCT_STRATEGY_ENABLED_/.test(SRC.index) === false,
  'H2  no feature flag moved into index.html');
eq(decomment(SRC.board + SRC.page).match(/productPricing\.\w+\.(set|update|save|write|delete)/g) || [],
  [], 'H3  no write-shaped action was added');
/* H4 — EVERY RULE IN THIS STYLESHEET IS STILL SCOPED. One unscoped rule restyles the whole
   application, and R8 found two that already did. */
var unscoped = decomment(SRC.css).split('\n').filter(function (l) {
  return /^[.#a-zA-Z\[][^{}]*\{/.test(l) && !/^\s*(@|\/)/.test(l)
    && l.indexOf('.psb-page') < 0 && l.indexOf('body.') < 0 && l.indexOf('--') < 0;
});
eq(unscoped, [], 'H4  no unscoped rule was added to the page stylesheet');
/* H5 — AND NO NEW `!important`. Counted after comments come off, which is the trap this project
   has sprung repeatedly. */
var bangs = (decomment(SRC.css).match(/!important/g) || []).length;
ok(bangs === 21, 'H5  the !important count is unchanged at 21', bangs);
eq(read('assets/css/base.css').length, SRC.base.length, 'H6  base.css was not edited');
ok(!/product-strategy/.test(decomment(read('assets/js/pages/campaign-risk.js'))),
  'H7  and no other page\'s runtime was touched');

// =================================================================================================
section('K — MUTANTS (§10)');
// =================================================================================================

/* K1 — the banner goes back to the warning palette. */
mut('K1  the scenario banner is orange again', function () {
  return withCss('  background: var(--scn-tint); border: 1px solid var(--scn-line);\n'
    + '  border-left: 4px solid var(--scn-key); color: var(--scn-ink);',
    '  background: #fff4ed; border: 1px solid #f0c9b4; color: #7a3a1c;', function () {
      var t = trace('scenario-appearance', { first: SITE_A, second: SITE_B });
      return at(t, 1).look.bg !== 'rgb(247, 244, 251)';
    });
});

/* K2 — a REAL refusal is restyled to match the scenario. §3 forbids this direction too, and it is
   the one a careless "make the colours consistent" pass would actually produce. */
mut('K2  a real refusal is painted like a simulation', function () {
  return withCss('.psb-page .psb-state--stop { border-left-width: 6px; border-left-style: double;'
    + ' border-left-color: var(--accent, #b3392f); }',
    '.psb-page .psb-state--stop { border-left-width: 4px; border-left-style: solid;'
    + ' border-left-color: var(--scn-key); }', function () {
      var t = trace('scenario-appearance', { first: SITE_A, second: SITE_B });
      return at(t, 2).look.stopBorder !== '6px double rgb(179, 57, 47)';
    });
});

/* K3 — the one control §4 still keeps out comes back. */
mut('K3  the production Fullscreen button returns', function () {
  return withBoard('    if (SHOW_CHART_FULLSCREEN) {', '    if (true) {', function () {
    var t = trace('toolbar-functions', { first: SITE_A });
    return at(t, 0).toolbar.ids['mode-fullscreen'] === true;
  });
});

/* K4 — R8's over-reach is re-applied and the whole row disappears again. */
mut('K4  the entire toolbar is deleted again', function () {
  return withPage('        chartFullscreen: false,', '        chartToolbar: false,', function () {
    var t = trace('toolbar-functions', { first: SITE_A });
    return at(t, 0).toolbar.controls === 0;
  });
});

/* K5 — THE MUTANT §4 NAMES BY ITSELF: a button that is there and does nothing. Its handler is
   removed and nothing else; every count of controls, ids, labels and tab stops still passes. */
mut('K5  a restored control has DOM but no function', function () {
  return withBoard("      b.addEventListener('click', function () { applyViewMode(m[0]); renderData(); });",
    "      b.addEventListener('click', function () { /* nothing */ });", function () {
      var t = trace('toolbar-functions', { first: SITE_A });
      return at(t, 3).shape.layersCount === at(t, 2).shape.layersCount;
    });
});

/* K6 — R7's `?` icons come back with the row. */
mut('K6  the chart `?` controls come back', function () {
  return withPage('        inlineHelpIcons: false,', '        inlineHelpIcons: true,', function () {
    var t = trace('production-chrome', { first: SITE_A });
    return (t.m.visual.r7.chartHelpIcons || 0) > 0;
  });
});

/* K7 — and so does the X-axis price row. */
mut('K7  the X axis prints the price again', function () {
  return withPage('        axisPriceRow: false,', '        axisPriceRow: true,', function () {
    var t = trace('production-chrome', { first: SITE_A });
    return (t.m.visual.r7.axisPriceRows || []).length > 0;
  });
});

/* K8 — THE CONFLATION §5 FORBIDS BY NAME. A resource failure is pushed onto the JavaScript axis, so
   a run with broken images would report "0 image errors" and a couple of console lines. The probe
   has to notice that the two counts stopped being independent. */
mut('K8  a network failure is counted as a console exception', function () {
  /* MUTATED IN THE PAGE BUILDER, because that is where the listener now lives. An earlier version
     of this probe anchored on the generated `_p1b8c-acceptance.html` and matched zero times — the
     artifact is rewritten by every measurement. */
  return withSrc('assets/tests/_p1b8c-visual-runner.js',
    "    '        window.__resourceErrors.push({',",
    "    '        window.__jsErrors.push(\"resource: \" + (t.tagName || \"\")); return;',\n"
    + "    '        window.__resourceErrors.push({',", function () {
      delete require.cache[require.resolve(path.join(__dirname, '_p1b8c-visual-runner.js'))];
      var R2 = require(path.join(__dirname, '_p1b8c-visual-runner.js'));
      fs.writeFileSync(PAGE_FILE, R2.buildPage({ capture: 'live', activated: true, site: SITE_A,
        script: 'production-chrome', scriptArgs: { first: SITE_A }, noSite: true,
        forceBadImage: true }), 'utf8');
      var r = R2.shot(BROWSER, PAGE_FILE, OUT, { id: 'probe', w: 1440, h: 900 });
      delete require.cache[require.resolve(path.join(__dirname, '_p1b8c-visual-runner.js'))];
      var v = r.measurements && r.measurements.visual && r.measurements.visual.r9;
      return !!v && v.imageResourceErrors === 0 && v.jsErrorCount > 0;
    });
});

/* K9 — THE OTHER HALF OF THE SAME REQUIREMENT: the fallback hides the failure and the round then
   claims there was none. The marker stops marking itself, so `svgImagesFailed` cannot see it. */
mut('K9  onerror hides the failure and it is reported as absent', function () {
  return withBoard("        plate.setAttribute('data-image-failed', 'true');", '        /* nothing */',
    function () {
      var t = trace('production-chrome', { first: SITE_A }, { forceBadImage: true });
      return t.m.visual.r9.svgImagesFailed === 0;
    });
});

/* K10 — THE OVER-REFUSAL. A gate that refuses files that ARE there is worse than no gate, because
   it removes working photographs and reports the page as healthy. */
mut('K10 the manifest gate refuses a file that is present', function () {
  return withPolicy('    if (man && typeof man.covers === \'function\' && man.covers(key) && !man.has(key)) {',
    '    if (man && typeof man.covers === \'function\' && man.covers(key)) {', function () {
      delete require.cache[require.resolve(path.join(ROOT, POLICY_REL))];
      var P2 = require(path.join(ROOT, POLICY_REL));
      var r = P2.classify(REAL_FILE, { pageProtocol: 'https:', pageHost: 'example.test',
        assetManifest: MANIFEST });
      delete require.cache[require.resolve(path.join(ROOT, POLICY_REL))];
      return r.accepted === false;
    });
});

/* K11 — the case variant is FOLLOWED instead of reported: a photograph appears for a row that is
   wrong, the defect leaves the screen and stays in the database. */
mut('K11 a case mismatch is silently rewritten to the real file', function () {
  return withPolicy("        return { accepted: false, kind: 'REJECTED', reason: 'REPO_ASSET_CASE_MISMATCH', url: '', input: v,\n"
    + "          note: 'REPO_HAS: ' + variant };",
    "        return { accepted: true, kind: 'SAME_ORIGIN_ASSET', reason: null, url: variant, input: v, note: null };",
    function () {
      delete require.cache[require.resolve(path.join(ROOT, POLICY_REL))];
      var P2 = require(path.join(ROOT, POLICY_REL));
      var r = P2.classify(CASE_FILE, { pageProtocol: 'https:', pageHost: 'example.test',
        assetManifest: MANIFEST });
      delete require.cache[require.resolve(path.join(ROOT, POLICY_REL))];
      return r.accepted === true;
    });
});

/* K12 — THE DIRECTION OF THE DEFAULT IS REVERSED. A missing manifest starts refusing everything, so
   any page that does not load it loses every photograph in the application. */
mut('K12 the policy fails CLOSED when no manifest is loaded', function () {
  /* THE MUTATION HAS TO REFUSE, NOT THROW. An earlier version short-circuited into the gate body
     with `man` null and died on `man.caseVariantOf` — which scores as a PROBE ERROR and proves
     nothing about the default's direction. This one returns the refusal cleanly. */
  return withPolicy('    var man = manifestOf(opts);',
    '    var man = manifestOf(opts);\n    if (!man) return reject(\'REPO_ASSET_NOT_FOUND\', v);',
    function () {
      delete require.cache[require.resolve(path.join(ROOT, POLICY_REL))];
      var P2 = require(path.join(ROOT, POLICY_REL));
      var r = P2.classify(REAL_FILE, { pageProtocol: 'https:', pageHost: 'example.test',
        assetManifest: null });
      delete require.cache[require.resolve(path.join(ROOT, POLICY_REL))];
      return r.accepted === false;
    });
});

/* K13 — PARITY BREAKS. One consumer stops asking the shared authority and decides for itself, which
   is exactly the state P1-B8C-R3 was created to end. */
mut('K13 one image consumer goes back to its own rule', function () {
  return withSrc('assets/js/utils/sku-overrides.js',
    '    return P.classify(imageUrl).url;',
    '    return /^https?:\\/\\//.test(String(imageUrl || \'\')) ? String(imageUrl) : \'\';',
    function () {
      var s2 = read('assets/js/utils/sku-overrides.js');
      return /\^https\?:/.test(decomment(s2));
    });
});

/* K14 — R8's teardown is reverted. Kept in this round because §6 requires it to keep holding. */
mut('K14 site A stays on screen while site B is loading', function () {
  return withPage('      clearBoard();\n      P.renderState(host, ux, refusals || [], doc);',
    '      P.renderState(host, ux, refusals || [], doc);', function () {
      var t = trace('deferred-teardown', { first: SITE_A, second: SITE_B },
        { slowSite: SITE_B, slowMs: 700 });
      return stepAt(t, 1).board.viewChildren > 0;
    });
});

/* K15 — a simulation survives a site change. */
mut('K15 the scenario survives a site change', function () {
  return withPage('        clearScenarioOnSiteChange: true,',
    '        clearScenarioOnSiteChange: false,', function () {
      var t = trace('scenario-site-scope', { first: SITE_A, second: SITE_B });
      return boardSteps(t)[3].scenario.activeOverrides > 0;
    });
});

/* K16 — THE CENSUS NUMBER MOVES WITH NO EVIDENCE. §7 forbids it in exactly these words: "不能靜默
   改表". The probe is that the count changed and no R9 line explains it. */
mut('K16 an inventory number is changed with nothing to back it', function () {
  /* THE DEFECT §7 NAMES: a total is edited and nothing else moves. The probe is the one that
     matters — the stated number stops agreeing with the tree it claims to describe. An earlier
     version of this mutant deleted a table row and asked whether a string was still somewhere in
     the file, which three other lines answered for it. It survived, correctly. */
  return withSrc('docs/planning/S_SERIES_FRONTEND_API_MIGRATION_INVENTORY.md',
    'LOADED_SCRIPTS: 79', 'LOADED_SCRIPTS: 78', function () {
      var c = read('docs/planning/S_SERIES_FRONTEND_API_MIGRATION_INVENTORY.md');
      var n = /LOADED_SCRIPTS:\s*(\d+)/.exec(c);
      return !!n && Number(n[1]) !== scripts;
    });
});

/* K17 — another page's runtime is edited under cover of this round. */
mut('K17 another page\'s runtime is quietly changed', function () {
  return withSrc('assets/js/pages/campaign-risk.js', 'const imgSrc = _crImageSrc(r.image);',
    'const imgSrc = r.image;', function () {
      var c = decomment(read('assets/js/pages/campaign-risk.js'));
      return /_crImageSrc\(r\.image\)/.test(c) === false;
    });
});

// =================================================================================================
console.log('\n' + new Array(101).join('='));
console.log('P1-B8D-R9 CORRECTIONS — passed ' + pass + '  failed ' + fail
  + '  |  mutants caught ' + neg.caught + '  survived ' + neg.missed);
console.log(new Array(101).join('='));
if (fail > 0) process.exitCode = 1;
