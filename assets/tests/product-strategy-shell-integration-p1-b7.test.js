/**
 * ==================================================================================================
 * PRODUCT STRATEGY BOARD — SHELL INTEGRATION, THE TWO GATES, AND THE DEPLOYMENT ORDER    (P1-B7)
 * ==================================================================================================
 *
 * WHAT THIS ROUND ASKS THAT NO EARLIER ROUND COULD. P1-B5 built the adapter seam and P1-B6 built the
 * site universe, and both were asserted by READING: boot() takes an adapter, the default is the preview
 * fixture, no fixture fallback exists, the workspace read is never first. Every one of those statements
 * was true and none of them is the same as running the thing.
 *
 * Installing the page is what makes running it possible, and running it found three defects that two
 * rounds of reading had not:
 *
 *   1. THE BOARD COULD NOT RENDER IN THE SHELL AT ALL. `render()` dereferenced `#shell` and `#btnRail`
 *      unconditionally, and renderNav/renderCrumbs/renderScenarioMark appended into hosts the production
 *      partial does not have — because §6 forbids a second sidebar and P1-B5 correctly dropped it. The
 *      first render threw, so nothing after it ran.
 *   2. THE LIVE ADAPTER DID NOT IMPLEMENT THE METHOD THE RENDERER CALLS. psb-board-ui.js asks an adapter
 *      for `loadCanonical()`; the live adapter offered `load()` and a comment claiming the interfaces
 *      matched. Mounting threw on first render.
 *   3. LOADING THE SCRIPT CRASHED EVERY PAGE IN THE APPLICATION. psb-board-ui.js auto-boots on load and
 *      boot() throws when there is no adapter and no fixture — correct in the prototype, a thrown
 *      exception at startup of a shell where the feature is switched off.
 *
 * So §I mounts the real board, over the real live adapter, into a DOM built from the real production
 * partial. That is the assertion this suite exists for; the rest defend the two gates around it.
 *
 * THE OTHER HALF IS THE DEPLOYMENT ORDER, AND §K PROVES IT BY EXECUTION RATHER THAN BY READING A `<`.
 * P1-B6 moved the frontend's action-contract pin from 13 to 14 and recorded a binding consequence:
 * Apps Script first, frontend second. That claim is worth exactly as much as the rule behind it, so the
 * real gate is loaded into four sandboxes with the pin rewritten and the server's answer varied, and the
 * four cells are read off the function itself.
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

var CONTRACT = require(path.join(JS, 'product-strategy', 'psb-data-contract.js')).PSB_CONTRACT;
global.PSB_CONTRACT = CONTRACT;
var SEL = require(path.join(JS, 'product-strategy', 'psb-selectors.js')).PSB_SELECTORS;
require(path.join(JS, 'api', 'km-product-pricing-adapter.js'));
var LIVE = require(path.join(JS, 'product-strategy', 'km-product-strategy-live-adapter.js'));
var UNI = require(path.join(JS, 'product-strategy', 'km-product-strategy-site-universe.js'));
var ACC = require(path.join(JS, 'api', 'km-product-pricing-workspace.js'));
var PAGE = require(path.join(JS, 'pages', 'product-strategy-board.js'));

var SRC = {
  index: readRoot('index.html'),
  app: read(path.join(JS, 'app.js')),
  css: readRoot('assets/css/product-strategy-board.css'),
  partial: readRoot('assets/html/pages/product-strategy-board.html'),
  board: read(path.join(JS, 'product-strategy', 'psb-board-ui.js')),
  live: read(path.join(JS, 'product-strategy', 'km-product-strategy-live-adapter.js')),
  page: read(path.join(JS, 'pages', 'product-strategy-board.js')),
  accessor: read(path.join(JS, 'api', 'km-product-pricing-workspace.js')),
  dbapi: read(path.join(JS, 'api', 'operation-system-db-api.js')),
  health: readRoot('assets/specs/active/apps-script/63_api_v1_system_health.gs'),
  protoIndex: readRoot('docs/prototypes/product-strategy-board/index.html')
};

var pass = 0, fail = 0, mutCaught = 0, mutSurvived = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ok   ' + label); }
  else {
    fail++;
    console.log('  FAIL ' + label + (extra === undefined ? '' : '  ' + JSON.stringify(extra)));
  }
}
function eq(a, b, label) {
  var A = JSON.stringify(a), B = JSON.stringify(b);
  ok(A === B, label, A === B ? undefined : { got: a, want: b });
}

// ===================================================================================================
// THE PRODUCTION DOM, BUILT FROM THE PRODUCTION PARTIAL
// ===================================================================================================
/**
 * A SKELETON HELD TO THE FILE RATHER THAN TRANSCRIBED FROM IT — the harness's own rule, applied to the
 * other document. The prototype skeleton in _psb-harness.js is built from the prototype's index.html,
 * which is precisely why the missing production chrome was invisible for two rounds: the board had only
 * ever been rendered into a page that had all of it.
 *
 * This parses the real partial. It is a small parser and it does not need to be a big one — the partial
 * is flat markup with no script, no style, no void elements and no attribute that matters beyond id,
 * class and hidden. Comments are stripped first, because a comment naming an id is not an element.
 */
/* P1-B8B — THE PARSER MOVED TO _psb-harness.js, WHERE THE DOM SHIM ALREADY LIVES.
   P1-B8B needs the same production DOM, and a second copy of a parser is a second model of the same
   document: they agree on the day the copy is made and drift the first time the partial grows an
   attribute one of them handles. One reader kept it local; two make it shared. */
var partialSkeleton = H.productionSkeleton(SRC.partial);

// ===================================================================================================
// THE UNIVERSE THE LIVE READBACK MEASURED  (P1-B7 §2)
// ===================================================================================================
/**
 * The ten canonical sites and their membership row counts, exactly as the P1-B6 live readback reported
 * them on 2026-09-11T13:31:30.059Z. This is a FIXTURE REPRODUCING A MEASUREMENT, not a second
 * measurement: it never enters the production runtime, and nothing in production reads it.
 *
 * The currencies are the P1-B5 measurement (six, none of them shared by two sites of different scope),
 * and they are here because a site is single-currency BY CONSTRUCTION and the board's axis depends on
 * it. 101+19+64+35+51+39+26+42+100+18 = 495.
 */
var SITES = [
  { company: 'KM', country: 'US', marketplace: 'Shopify', currency: 'USD', rows: 101 },
  { company: 'KM', country: 'US', marketplace: 'Target', currency: 'USD', rows: 19 },
  { company: 'KM', country: 'US', marketplace: 'Walmart', currency: 'USD', rows: 64 },
  { company: 'ResTW', country: 'AU', marketplace: 'Amazon', currency: 'AUD', rows: 35 },
  { company: 'ResTW', country: 'CA', marketplace: 'Amazon', currency: 'CAD', rows: 51 },
  { company: 'ResTW', country: 'EU', marketplace: 'Amazon', currency: 'EUR', rows: 39 },
  { company: 'ResTW', country: 'JP', marketplace: 'Amazon', currency: 'JPY', rows: 26 },
  { company: 'ResTW', country: 'UK', marketplace: 'Amazon', currency: 'GBP', rows: 42 },
  { company: 'ResUS', country: 'US', marketplace: 'Amazon', currency: 'USD', rows: 100 },
  { company: 'ResUS', country: 'US', marketplace: 'Walmart', currency: 'USD', rows: 18 }
];
var EVIDENCE = {
  executed_at: '2026-09-11T13:31:30.059Z',
  fingerprint: 'D53C96CE', length: 7272, chunks: 2,
  build: 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R9',
  action: 'productPricing.siteUniverse.get', contract_version: 1,
  site_count: 10, membership_rows: 495, table_fingerprint: '2AF82658', table_columns: 15,
  capped: false, cap: 2000, is_whole_universe: true,
  writes: 0, writer_calls: 0, sheets_created: 0, rows_modified: 0,
  db_opened: false, tables_read: 0, refusal: 'FEATURE_DISABLED',
  source_state: 'READY', verdict: 'P1_B6_SITE_UNIVERSE_READY',
  evidence_gap: 'SOURCE_MODIFIED_AT_NOT_MEASURABLE_IN_THIS_DEPLOYMENT_SCOPE'
};

var CATEGORIES = ['Electric Can Opener', 'Manual Can Opener', 'Jar Opener', 'Bottle Opener',
  'Knife Sharpener', 'Kitchen Shears', 'Cutting Board', 'Food Storage', 'Mixing Bowl',
  'Measuring Set', 'Peeler', 'Grater', 'Unmapped / Needs Review'];
var SERIES = [];
(function () {
  var per = [4, 4, 4, 3, 4, 3, 3, 3, 3, 4, 3, 3, 2];
  CATEGORIES.forEach(function (c, i) {
    for (var k = 0; k < per[i]; k++) SERIES.push(c.split(' ')[0] + '-S' + (k + 1));
  });
}());

/** One row exactly as 72_ emits it. */
function liveRow(i, site, o) {
  o = o || {};
  return {
    identity: 'MSKU:' + o.id, marketplace_sku_id: o.id,
    master_sku: 'CO' + (1000 + (i % 192)) + '-R',
    site_sku: 'B0' + i, product_name: 'Product ' + (i % 192),
    category: o.category || CATEGORIES[i % CATEGORIES.length],
    series: SERIES[i % SERIES.length], variant_group: SERIES[i % SERIES.length], variant_name: null,
    company: site.company, country: site.country, marketplace: site.marketplace,
    marketplace_sku_status: 'active', lifecycle: 'active', currency: site.currency,
    regular_price: o.regular_price === undefined ? 29.99 : o.regular_price,
    minimum_price: o.minimum_price === undefined ? 24.99 : o.minimum_price,
    msrp: o.msrp === undefined ? 34.99 : o.msrp,
    product_image: null,
    regional: o.regional === undefined
      ? { regional_detail_id: 'RGD-' + o.id, site_sku: 'B0' + i,
          marketplace_product_id: 'MP' + o.id, product_url: null,
          packaging_regulation: null, language: 'en' }
      : o.regional,
    campaigns: [], analysable: o.analysable === undefined ? true : o.analysable,
    source_status: [], missing_reasons: o.missing_reasons || [], findings: [],
    provenance: { membership: 'marketplace_skus (company + country + marketplace)' }
  };
}
function rowsForSite(site) {
  var out = [];
  for (var k = 0; k < site.rows; k++) out.push(liveRow(k, site, { id: site.marketplace + '-' + k }));
  return out;
}
function envelope(rows, o) {
  o = o || {};
  var cats = {}, sers = {};
  rows.forEach(function (r) { if (r.category) cats[r.category] = 1; if (r.series) sers[r.series] = 1; });
  return {
    success: true,
    data: {
      normalizedRows: rows, refusals: o.refusals || [], findings: [],
      analysis_permitted: o.permitted === undefined ? true : o.permitted,
      counts: { siteSkuCount: rows.length },
      filterOptions: { categories: Object.keys(cats).sort().map(function (v) { return { value: v }; }),
        series: Object.keys(sers).sort().map(function (v) { return { value: v }; }) },
      pagination: null, scope: o.scope || null,
      sourceState: o.sourceState === undefined ? 'READY' : o.sourceState,
      schema: { contract_version: o.version === undefined ? 2 : o.version,
        read_at: EVIDENCE.executed_at, read_at_is: 'WHEN_THE_SERVER_READ_THE_TABLES',
        source_modified_at: null, build: EVIDENCE.build }
    },
    meta: { action: 'productPricing.workspace.get', build: 'p1-b7' }, errors: []
  };
}

// ===================================================================================================
console.log('\n=== §A  THE SHELL INSTALLS THE PAGE ===');
// ===================================================================================================
(function () {
  var NEEDED = [
    'assets/js/api/km-product-pricing-workspace.js',
    'assets/js/api/km-product-pricing-adapter.js',
    'assets/js/product-strategy/psb-data-contract.js',
    'assets/js/product-strategy/km-product-strategy-site-universe.js',
    'assets/js/product-strategy/km-product-strategy-live-adapter.js',
    'assets/js/product-strategy/psb-selectors.js',
    'assets/js/product-strategy/psb-chart-layout.js',
    'assets/js/product-strategy/psb-board-ui.js',
    'assets/js/pages/product-strategy-board.js'
  ];
  NEEDED.forEach(function (f, i) {
    ok(SRC.index.indexOf('<script src="' + f) > 0, 'A1.' + (i + 1) + ' index.html loads ' + f);
  });
  ok(SRC.index.indexOf('assets/css/product-strategy-board.css') > 0,
    'A2 and the one stylesheet');
  ok(SRC.index.indexOf('<div id="product-strategy-board-mount"></div>') > 0,
    'A3 and there is exactly one mount point for the partial');
  eq((SRC.index.match(/product-strategy-board-mount/g) || []).length, 1,
    'A3a and it is named exactly once — there is no second mount point to fill');
  ok(SRC.partial.indexOf('id="product-strategy-board-section"') > 0,
    'A4 the partial declares the section id the lifecycle registers');
  eq(PAGE.CONTRACT.lifecycle_section, 'product-strategy-board-section',
    'A5 and the controller registers exactly that id');
  eq(PAGE.CONTRACT.partial_url, 'assets/html/pages/product-strategy-board.html',
    'A6 from exactly one partial');
  ok(/KM\.lifecycle\.register\(/.test(bare(SRC.page)), 'A7 the controller registers a lifecycle');
  ok(/partialLoader/.test(bare(SRC.page)), 'A8 and fetches its markup through the shared loader');
  eq(PAGE.CONTRACT.installed_in_shell, true, 'A9 and it states that it is installed');
}());

// ===================================================================================================
console.log('\n=== §B  THE SCRIPT ORDER IS THE DEPENDENCY ORDER, MEASURED ===');
// ===================================================================================================
/**
 * NOT A LIST SOMEBODY WROTE DOWN. Each module's dependencies are read out of its own source — which
 * globals it references that another of these files defines — and the tag order in index.html is then
 * required to satisfy them. A hand-maintained expected order would agree on the day it was written.
 */
(function () {
  var DEFINES = {
    'assets/js/api/km-product-pricing-workspace.js': ['KM.productPricingWorkspace'],
    'assets/js/api/km-product-pricing-adapter.js': ['KM_PRODUCT_PRICING_ADAPTER'],
    'assets/js/product-strategy/psb-data-contract.js': ['PSB_CONTRACT'],
    'assets/js/product-strategy/km-product-strategy-site-universe.js': ['KM_PRODUCT_STRATEGY_SITE_UNIVERSE'],
    'assets/js/product-strategy/km-product-strategy-live-adapter.js': ['KM_PRODUCT_STRATEGY_LIVE_ADAPTER'],
    'assets/js/product-strategy/psb-selectors.js': ['PSB_SELECTORS'],
    'assets/js/product-strategy/psb-chart-layout.js': ['PSB_CHART_LAYOUT'],
    // P1-B8B - the view registry. Adding it here does not merely keep the count right: the graph
    // below is derived from the sources, so this entry is what PROVES psb-views.js loads before
    // psb-board-ui.js, which reads PSB_VIEWS at module scope and throws by name without it.
    'assets/js/product-strategy/psb-views.js': ['PSB_VIEWS'],
    'assets/js/product-strategy/psb-board-ui.js': ['PSB_BOARD'],
    'assets/js/pages/product-strategy-board.js': ['KM.pages.productStrategyBoard']
  };
  var files = Object.keys(DEFINES);
  var pos = {};
  files.forEach(function (f) { pos[f] = SRC.index.indexOf('<script src="' + f); });

  var violations = [];
  files.forEach(function (consumer) {
    var src = bare(read(path.join(ROOT, consumer)));
    files.forEach(function (provider) {
      if (provider === consumer) return;
      var used = DEFINES[provider].some(function (sym) { return src.indexOf(sym) >= 0; });
      if (!used) return;
      if (pos[provider] > pos[consumer]) {
        violations.push(consumer + ' uses ' + DEFINES[provider][0] + ' but loads first');
      }
    });
  });
  eq(violations, [], 'B1 every module loads after everything it references', violations);

  /* THE TRANSPORT IS ABOVE ALL OF THEM. The accessor reaches KM.api.transport, which km-api-foundation
     creates; a tag above that one is a TypeError on the first read rather than a slow degradation. */
  ok(SRC.index.indexOf('assets/js/api/km-api-foundation.js')
    < pos['assets/js/api/km-product-pricing-workspace.js'],
    'B2 and the shared transport is created before the accessor that uses it');
  ok(/KM\.api/.test(bare(SRC.accessor)), 'B2a which the accessor does in fact use');

  /* THE PAGE CONTROLLER IS LAST OF THE TEN. It names every other one. */
  var last = files.reduce(function (a, b) { return pos[a] > pos[b] ? a : b; });
  eq(last, 'assets/js/pages/product-strategy-board.js', 'B3 the page controller loads last');

  /* AND THE TEN ARE CONTIGUOUS — no unrelated tag between them. A block is how an order stays
     readable; an order spread through a file is one an edit breaks without looking wrong. */
  var first = files.reduce(function (a, b) { return pos[a] < pos[b] ? a : b; });
  var span = SRC.index.slice(pos[first], pos[last]);
  var tags = (span.match(/<script src="([^"]+)"/g) || []).map(function (t) {
    return /src="([^"?]+)/.exec(t)[1];
  });
  eq(tags.filter(function (t) { return files.indexOf(t) < 0; }), [],
    'B4 the ten tags are contiguous — nothing unrelated is loaded between them');

  /* THE BOARD ITSELF REFUSES A WRONG ORDER AT RUNTIME, which is what makes B1 a second line of
     defence rather than the only one. */
  ok(/PSB_SELECTORS is not loaded/.test(SRC.board),
    'B5 and psb-board-ui.js throws by name if its dependency is missing');
}());

// ===================================================================================================
console.log('\n=== §C  PRODUCTION NEVER REACHES INTO docs/prototypes ===');
// ===================================================================================================
(function () {
  /* ON THE MARKUP, NOT THE PROSE. The comment above the script block explains that production does
     NOT load from docs/prototypes, so a plain search finds the explanation. Comments may name
     anything; tags may not. */
  var indexMarkup = SRC.index.replace(/<!--[\s\S]*?-->/g, '');
  ok(indexMarkup.indexOf('docs/prototypes') < 0, 'C1 index.html loads nothing from docs/prototypes');
  ok(indexMarkup.indexOf('preview-fixture') < 0, 'C2 and no preview fixture');
  ['page', 'live', 'board', 'accessor'].forEach(function (k, i) {
    ok(bare(SRC[k]).indexOf('docs/prototypes') < 0,
      'C3.' + (i + 1) + ' and neither does the ' + k + ' module');
  });
  ok(SRC.partial.indexOf('preview-fixture') < 0 && SRC.partial.indexOf('docs/prototypes') < 0,
    'C4 nor the production partial');

  /* THE ARROW POINTS THE OTHER WAY, AND THAT IS ALLOWED. The prototype consumes the production
     modules — one copy of every derivation rule — and production consumes nothing of the
     prototype's. */
  ok(SRC.protoIndex.indexOf('assets/js/product-strategy/psb-board-ui.js') > 0,
    'C5 the prototype consumes the production modules');
  ok(SRC.protoIndex.indexOf('preview-fixture.js') > 0,
    'C6 and keeps its fixture to itself');

  /* THE FIXTURE CANNOT BE REACHED FROM PRODUCTION EVEN IF IT WERE LOADED. The board only mounts a
     fixture when one is in the page, and the production shell has none. */
  ok(/PSB_PREVIEW/.test(SRC.board), 'C7 the board names the fixture global it would use');
  ok(SRC.index.indexOf('PSB_PREVIEW') < 0, 'C7a and the shell never defines it');
  ok(/PREVIEW && PREVIEW\.PreviewProductStrategyDataAdapter\) boot\(\)/.test(SRC.board),
    'C8 and it only auto-boots where a fixture is actually present');
}());

// ===================================================================================================
console.log('\n=== §D  NAVIGATION IS INVISIBLE AND THE SECTION UNREACHABLE ===');
// ===================================================================================================
(function () {
  var markup = SRC.index.replace(/<!--[\s\S]*?-->/g, '');
  eq(markup.indexOf('Product Strategy'), -1,
    'D1 no rendered text in the shell names the feature — there is no menu item');
  ok(SRC.index.indexOf("showSection('product-strategy") < 0
    && SRC.index.indexOf('showSection("product-strategy') < 0,
    'D2 and nothing in the shell calls showSection for it');
  ok(markup.indexOf('product-strategy-board-mount') > 0,
    'D2a the mount point IS rendered — installed is not the same as hidden');

  /* A HIDDEN-BUT-CLICKABLE ITEM IS EXPLICITLY FORBIDDEN, so the check is on the menu markup itself
     rather than on visibility: nothing with a menu class mentions the section. */
  var menuItems = markup.match(/<div class="menu-item[^"]*"[\s\S]*?<\/div>/g) || [];
  eq(menuItems.filter(function (m) { return /product-strategy|Product Strategy/.test(m); }), [],
    'D3 no menu item, hidden or otherwise, refers to the section');

  ok(/var KM_STAGED_SECTIONS_ = \{/.test(SRC.app), 'D4 app.js declares the staged-section registry');
  ok(/'product-strategy':\s*\{[\s\S]{0,300}?enabled:\s*(?:true|false)/.test(SRC.app),
    'D5 and this section is in it with a literal boolean switch');
  ok(/reason:\s*'[^']+'/.test(SRC.app), 'D5a with the reason written down, not implied');
  /* D6 INVERTED AT P1-B8D, AND THE INVERSION IS THE ROUND. "In neither map" was how B7 proved the
     installed page was unreachable; the activation put it in both, and a section in only ONE of them
     is the defect worth guarding now - in the lifecycle map alone it mounts into a shell that is
     never revealed, in the display map alone it is revealed empty. Both, or the page is broken in a
     way that looks like a slow load. */
  eq((SRC.app.match(/'product-strategy': 'product-strategy-board-section'/g) || []).length, 2,
    'D6 and it is in BOTH section maps — the lifecycle one and the display one');

  /* THE GUARD RUNS BEFORE THE SHELL IS TOUCHED. Returning after the `.active` sweep would leave no
     section visible at all — a blank page, which reads as a crash rather than as a feature that is
     off. */
  /* ALSO ON CODE RATHER THAN PROSE: the guard's own comment names setHomeShellVisible(false) while
     explaining why it must run before it, so the non-greedy match ended inside the explanation. */
  var appCode = SRC.app.replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').map(function (l) { return l.split('//')[0]; }).join('\n');
  var body = /function showSection\(section\) \{([\s\S]*?)setHomeShellVisible\(false\)/.exec(appCode);
  ok(!!body && /KM_STAGED_SECTIONS_\[section\]/.test(body[1]),
    'D7 the guard is above every shell mutation in showSection');
  ok(!!body && /enabled !== true/.test(body[1]) && /return;/.test(body[1]),
    'D7a and it returns rather than falling through');

  /* THE SERVER GATE IS THE OTHER ONE, AND IT IS THE ONE THAT MATTERS — which is an argument about
     where the gate SITS, not about what it currently answers. P1-B8D moved the answer and left the
     position alone: one server-owned boolean, read through one resolver, checked before the door. */
  var cfg72 = readRoot('assets/specs/active/apps-script/72_api_v1_product_pricing_workspace.gs');
  ok(/var PRODUCT_STRATEGY_ENABLED_ = (?:true|false);/.test(
    readRoot('assets/specs/active/apps-script/00_config.gs')),
    'D8 and the server flag is one literal boolean in the config of record');
  ok(cfg72.indexOf('if (io.flagEnabled() !== true)') < cfg72.indexOf('var ss = io.openTarget();'),
    'D8a which the workspace read consults BEFORE it opens the spreadsheet');
}());

// ===================================================================================================
console.log('\n=== §E  A DIRECT CALL FAILS CLOSED, AT ZERO REQUESTS ===');
// ===================================================================================================
(function () {
  eq(ACC.isEnabled(), false, 'E1 the capability mirror is false on load');
  ok(/var _enabled = false;/.test(SRC.accessor), 'E1a and that is its declared default');
  ok(SRC.index.indexOf('setCapability') < 0, 'E2 the shell never raises it');
  ok(bare(SRC.page).indexOf('setCapability') < 0, 'E2a and neither does the page controller');

  /* THE CONTROLLER, DRIVEN THE WAY A DEVELOPER WOULD DRIVE IT: called directly, with the real
     accessor, in a document built from the real partial. */
  var dom = H.makeDom(partialSkeleton);
  var c = PAGE.create({ document: dom.document, accessor: ACC,
    siteUniverse: UNI, liveAdapter: LIVE, board: null });
  var done = c.loadUniverse();
  ok(done && typeof done.then === 'function', 'E3 loadUniverse answers a promise');
  return done.then(function (r) {
    eq(r.state, 'FEATURE_DISABLED', 'E4 a direct call answers FEATURE_DISABLED');
    eq(c.requests.siteUniverse, 0, 'E5 and sent ZERO site-universe requests');
    eq(c.requests.workspace, 0, 'E6 and ZERO workspace requests');
    eq(r.may_analyse, false, 'E7 and nothing may be analysed');
    var host = dom.document.getElementById('psb-state-host');
    ok(host && host.textContent.length > 0, 'E8 and it wrote a state into the partial\'s state host');
    ok(dom.document.getElementById('view').childNodes.length === 0,
      'E9 while the chart host stays empty — no fixture was drawn in its place');
  });
}());

// ===================================================================================================
console.log('\n=== §F  NO BYPASS ===');
// ===================================================================================================
(function () {
  ['location.search', 'URLSearchParams', 'location.href', 'window.location',
    'localStorage', 'sessionStorage', 'document.cookie'].forEach(function (n, i) {
    ok(bare(SRC.page).indexOf(n) < 0, 'F1.' + (i + 1) + ' the controller never touches ' + n);
    ok(bare(SRC.live).indexOf(n) < 0, 'F2.' + (i + 1) + ' nor does the live adapter');
  });
  ok(bare(SRC.accessor).indexOf('localStorage') < 0
    && bare(SRC.accessor).indexOf('location.search') < 0,
    'F3 nor the accessor');
  ok(bare(SRC.page).indexOf('__PSB_DEV_MODE__') < 0, 'F4 there is no developer-mode hook');
  ok(bare(SRC.app).indexOf('__PSB') < 0, 'F5 and the shell exposes no console flag for it');

  /* THE CAPABILITY IS A MIRROR, NOT A SWITCH: only a server payload can raise it, and the shape of
     that payload is a named field rather than truthiness. */
  ACC.setCapability({ product_strategy_enabled: 'yes' });
  eq(ACC.isEnabled(), false, 'F6 a truthy non-true capability value does not raise the mirror');
  ACC.setCapability({});
  eq(ACC.isEnabled(), false, 'F7 and an unreadable payload puts it back to false');
}());

// ===================================================================================================
console.log('\n=== §G  ONE COPY OF EVERY DEPENDENCY ===');
// ===================================================================================================
(function () {
  var files = ['km-product-pricing-workspace.js', 'km-product-pricing-adapter.js',
    'psb-data-contract.js', 'km-product-strategy-site-universe.js',
    'km-product-strategy-live-adapter.js', 'psb-selectors.js', 'psb-chart-layout.js',
    'psb-board-ui.js', 'product-strategy-board.js'];
  files.forEach(function (f, i) {
    var n = (SRC.index.match(new RegExp('<script src="[^"]*' + f.replace(/\./g, '\\.'), 'g')) || []).length;
    eq(n, 1, 'G1.' + (i + 1) + ' ' + f + ' is loaded exactly once');
  });
  eq((SRC.index.match(/product-strategy-board\.css/g) || []).length, 1,
    'G2 and the stylesheet exactly once');

  /* NO SECOND IMPLEMENTATION ANYWHERE IN THE TREE. A promotion that left a copy behind would pass
     every load-order check and disagree with the original the first time either changed. */
  var stray = [];
  (function walk(d) {
    fs.readdirSync(d).forEach(function (e) {
      var p = path.join(d, e);
      if (fs.statSync(p).isDirectory()) { if (e !== 'node_modules') walk(p); return; }
      if (files.indexOf(e) >= 0) stray.push(path.relative(ROOT, p).replace(/\\/g, '/'));
    });
  }(path.join(ROOT, 'assets')));
  eq(stray.sort(), [
    'assets/js/api/km-product-pricing-adapter.js',
    'assets/js/api/km-product-pricing-workspace.js',
    'assets/js/pages/product-strategy-board.js',
    'assets/js/product-strategy/km-product-strategy-live-adapter.js',
    'assets/js/product-strategy/km-product-strategy-site-universe.js',
    'assets/js/product-strategy/psb-board-ui.js',
    'assets/js/product-strategy/psb-chart-layout.js',
    'assets/js/product-strategy/psb-data-contract.js',
    'assets/js/product-strategy/psb-selectors.js'
  ], 'G3 exactly one copy of each module exists under assets/', stray);

  /* AND THE PROTOTYPE HOLDS NONE OF THEM — P1-B5 promoted them rather than copying them. */
  var protoDir = path.join(ROOT, 'docs', 'prototypes', 'product-strategy-board');
  eq(fs.readdirSync(protoDir).filter(function (e) { return files.indexOf(e) >= 0; }), [],
    'G4 and the prototype keeps no copy of any of them');
}());

// ===================================================================================================
console.log('\n=== §H  THE STYLESHEET IS A COMPONENT, NOT A PAGE ===');
// ===================================================================================================
/**
 * Linking a prototype's stylesheet into a shell is where a page becomes an application-wide restyle. The
 * leak here was measured against real markup and real JS class tokens before anything was changed, and
 * only what actually leaked was scoped: `.card`, `.view`, `.scope`, `.shell`, `.side`, `.main` and the
 * rest have zero occurrences anywhere in production outside this board, so renaming them would be churn
 * against a risk that does not exist. That residual is recorded in the design freeze, not pretended away.
 */
(function () {
  ok(!/^\* \{/m.test(SRC.css), 'H1 the sheet declares no global reset — base.css owns that');
  ok(/\* \{[\s\S]{0,80}box-sizing: border-box;/.test(readRoot('assets/css/base.css')),
    'H1a and base.css does declare it, more strongly (margin and padding too)');
  ok(!/^body \{/m.test(SRC.css), 'H2 and no `body` rule — it would restyle every page');
  ok(/^\.psb-page \{/m.test(SRC.css), 'H2a the page ground is the board\'s own root instead');
  ok(!/^h1, h2, h3, h4 \{/m.test(SRC.css), 'H3 headings are not restyled application-wide');
  ok(!/^button \{/m.test(SRC.css), 'H4 nor is every button element');

  ['.btn {', '.filter-group {', '.filter-group--check {', '.filter-checkbox-item {',
    '.kmf {', '.kmf-trigger {', '.kmf-panel {', '.kmf-tools {', '.kmf-link {'].forEach(function (sel, i) {
    ok(SRC.css.indexOf('\n' + sel) < 0, 'H5.' + (i + 1) + ' `' + sel + '` is not declared unscoped');
    ok(SRC.css.indexOf('\n.psb-page ' + sel) > 0,
      'H5.' + (i + 1) + 'a and it IS declared under .psb-page');
  });

  /* P1-B8A INVERTED THIS ONE, AND THE INVERSION IS THE POINT.
     P1-B7 scoped the leaking rules but KEPT the copied `:root` token block, reasoning that deleting
     it would drop P1-B2A's pin to base.css along with the leak. That reasoning held only while the
     copy had nowhere else to live. It does now: index.html loads base.css on :root before this
     sheet, so in PRODUCTION every one of those fifty declarations was redefining a token to the
     value it already had — and the prototype, which genuinely cannot link base.css, carries the copy
     in its own directory where P1-B2A §G still holds every value to the original. So the pin did not
     go; it moved to where the copy actually is. What must now be true here is the opposite of H6. */
  ok(!/--filter-height:\s*38px;/.test(SRC.css) && !/--btn-height:\s*36px;/.test(SRC.css),
    'H6 the Operation System token copies are GONE from the production sheet — base.css defines them');
  ok(!/(^|\n)\s*:root\s*\{/.test(SRC.css),
    'H6a and it declares no :root block, so it writes nothing to the document root');

  /* THE SCOPE ROOT EXISTS IN BOTH DOCUMENTS THAT USE THIS SHEET. */
  ok(/class="module-section psb-page"/.test(SRC.partial), 'H7 the production section carries it');
  ok(/<body class="psb-page">/.test(SRC.protoIndex), 'H8 and so does the prototype\'s body');
  ok(SRC.protoIndex.indexOf('assets/css/product-strategy-board.css') > 0,
    'H8a which is the same sheet, not a copy');

  /* AND THE PRINT RULE NO LONGER WHITENS EVERY PAGE'S PRINTED BACKGROUND. */
  ok(!/@media print \{\n  body \{/.test(SRC.css), 'H9 print does not restyle the document body');
}());

// ===================================================================================================
console.log('\n=== §I  THE BOARD RENDERS IN THE PRODUCTION PARTIAL, OVER THE LIVE ADAPTER ===');
// ===================================================================================================
/**
 * THE ASSERTION THIS SUITE EXISTS FOR. Everything about the seam was true when it was read and false
 * when it was run, and the only difference between the two rounds is that this one runs it.
 */
var MOUNTED = null;
(function () {
  var site = SITES[0];
  var adapter = LIVE.createFromResponse(envelope(rowsForSite(site),
    { scope: { company: site.company, country: site.country, marketplace: site.marketplace } }), {});
  var snap = adapter.load();
  eq(snap.state, 'OK', 'I1 the live adapter accepts a well-formed live response');
  eq(snap.row_count, site.rows, 'I2 and carries that site\'s ' + site.rows + ' rows');

  eq(typeof adapter.loadCanonical, 'function',
    'I3 the adapter implements loadCanonical — the method the RENDERER calls');
  ok(/ADAPTER\.loadCanonical\(\)/.test(SRC.board), 'I3a which the board does in fact call');
  eq(adapter.loadCanonical(), snap, 'I4 and it is the same snapshot as load()');
  eq(LIVE.CONTRACT.board_entry_point, 'loadCanonical', 'I4a stated as contract, not inferred');

  var dom = H.makeDom(partialSkeleton);
  var sandbox = { console: { log: function () {}, warn: function () {}, error: function () {} } };
  sandbox.window = dom.window; sandbox.document = dom.document; sandbox.Event = dom.Event;
  sandbox.globalThis = sandbox; sandbox.PSB_BOARD_DEFER = true;
  sandbox.setTimeout = setTimeout; sandbox.clearTimeout = clearTimeout;
  sandbox.requestAnimationFrame = function (f) { return setTimeout(f, 0); };
  vm.createContext(sandbox);
  /* P1-B8B — psb-views.js joins the load order, before the board. The board reads the six views from
     it instead of declaring them, because the Operation System sidebar renders the same six as the
     children of a `Product Strategy` parent and two lists of six labels would drift. The board throws
     BY NAME when it is missing, which is how this list stays honest: a forgotten dependency is a
     named error at load, not six empty tabs at render. */
  ['psb-data-contract.js', 'psb-chart-layout.js', 'psb-selectors.js', 'psb-views.js',
    'psb-board-ui.js']
    .forEach(function (f) {
      vm.runInContext(read(path.join(JS, 'product-strategy', f)), sandbox, { filename: f });
    });
  eq(typeof sandbox.PSB_BOARD, 'object', 'I5 the board loads into the shell without auto-booting');

  var threw = null;
  try { sandbox.PSB_BOARD.mount({ adapter: adapter }); } catch (e) { threw = e; }
  ok(threw === null, 'I6 PSB_BOARD.mount OVER THE LIVE ADAPTER, IN THE PRODUCTION PARTIAL, DOES NOT THROW',
    threw && (threw.message + ' | ' + String(threw.stack).split('\n')[1]));
  MOUNTED = threw === null ? dom : null;

  if (MOUNTED) {
    var d = dom.document;
    ok(d.getElementById('view').childNodes.length > 0, 'I7 the chart host was filled');
    ok(d.getElementById('scope').childNodes.length > 0, 'I8 and the command bar');
    eq(d.getElementById('nav').querySelectorAll('.navbtn').length, 6,
      'I9 all six views are reachable — the in-page rail, not a second sidebar');
    ok(d.getElementById('crumbs').textContent.indexOf('Product Strategy') >= 0,
      'I10 and the crumb says which view is showing');

    /* THE CHROME THE SHELL OWNS IS ABSENT, AND THAT IS THE POINT. */
    ok(!d.getElementById('shell'), 'I11 there is no second page shell in the partial');
    ok(!d.getElementById('side'), 'I12 and no second sidebar');
    ok(!d.getElementById('btnRail'), 'I13 and no second rail toggle');
    ok(SRC.partial.indexOf('psb-viewnav') > 0,
      'I13a the six views live in an in-page rail instead');

    /* THE BOARD DOES NOT OWN document.body. */
    eq(d.body.className.indexOf('presenting') >= 0, false, 'I14 no presentation class is set at rest');
    d.body.className = 'km-rescol-active';
    sandbox.PSB_BOARD.mount({ adapter: adapter });
    ok(d.body.className.indexOf('km-rescol-active') >= 0,
      'I15 and a redraw preserves a class another module put on body');

    /* NO FIXTURE REACHED THE PAGE. */
    ok(!sandbox.PSB_PREVIEW, 'I16 no preview fixture is defined in the production context');
    var text = d.body.textContent;
    ok(text.indexOf('Preview data') < 0, 'I17 and nothing on the page says it is preview data');
  }

  /* THE STATES THAT DRAW NOTHING STILL DRAW NOTHING. One state mounts; the rest do not. */
  var leaked = ['SOURCE_EMPTY', 'SOURCE_PARTIALLY_READABLE', 'STOP_DATA_INTEGRITY'].filter(function (st) {
    return LIVE.createFromResponse(envelope(rowsForSite(SITES[1]), { sourceState: st }), {})
      .loadCanonical().row_count > 0;
  });
  eq(leaked, [], 'I18 and no non-OK source state yields a row through loadCanonical either');
}());

// ===================================================================================================
console.log('\n=== §J  THE LIVE EVIDENCE, FROZEN ===');
// ===================================================================================================
(function () {
  eq(SITES.length, EVIDENCE.site_count, 'J1 ten sites');
  eq(SITES.reduce(function (a, s) { return a + s.rows; }, 0), EVIDENCE.membership_rows,
    'J2 and 495 membership rows across them');

  var companies = [];
  SITES.forEach(function (s) { if (companies.indexOf(s.company) < 0) companies.push(s.company); });
  eq(companies.sort(), ['KM', 'ResTW', 'ResUS'], 'J3 three companies, canonical spelling');
  ok(companies.indexOf('Kitchen Mama') < 0, 'J3a KM is NOT rewritten to Kitchen Mama');
  ok(SITES.some(function (s) { return s.country === 'EU'; }), 'J3b and EU is not split into countries');

  /* TWO SHAPES THAT A MENU KEYED ON THE WRONG THING WOULD DESTROY. */
  eq(SITES.filter(function (s) { return s.company === 'KM' && s.marketplace === 'Amazon'; }), [],
    'J4 KM sells on no Amazon marketplace at all');
  eq(companies.filter(function (c) {
    return SITES.some(function (s) { return s.company === c && s.country === 'US'; });
  }).sort(), ['KM', 'ResUS'], 'J5 and two different companies both sell in US');

  var cur = {};
  SITES.forEach(function (s) { cur[s.currency] = 1; });
  eq(Object.keys(cur).length, 6, 'J6 six currencies, as P1-B5 measured');
  var multi = SITES.filter(function (s) {
    return SITES.some(function (o) {
      return o.company === s.company && o.country === s.country && o.marketplace === s.marketplace
        && o.currency !== s.currency;
    });
  });
  eq(multi, [], 'J7 and no site carries two currencies — the axis depends on it');

  /* THE READBACK'S SAFETY FIELDS, RECORDED AS DATA SO THE LEDGER AND THE SUITE CANNOT DRIFT. */
  eq([EVIDENCE.writes, EVIDENCE.writer_calls, EVIDENCE.sheets_created, EVIDENCE.rows_modified],
    [0, 0, 0, 0], 'J8 the readback wrote nothing, on all four counters');
  eq(EVIDENCE.refusal, 'FEATURE_DISABLED', 'J9 the gate refused, live');
  eq([EVIDENCE.db_opened, EVIDENCE.tables_read], [false, 0],
    'J10 and refused BEFORE opening the database');
  eq([EVIDENCE.capped, EVIDENCE.is_whole_universe], [false, true],
    'J11 the read was the whole universe, not a capped sample');
  eq(EVIDENCE.build, 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R9',
    'J12 measured on the R9 build this release pins');

  /* THE EVIDENCE GAP IS STILL A GAP. */
  eq(EVIDENCE.evidence_gap, 'SOURCE_MODIFIED_AT_NOT_MEASURABLE_IN_THIS_DEPLOYMENT_SCOPE',
    'J13 source_modified_at is UNMEASURED and is not rewritten as proven');
  var freeze = readRoot('docs/planning/PRODUCT_STRATEGY_BOARD_DESIGN_FREEZE.md');
  ok(freeze.indexOf('D53C96CE') > 0, 'J14 the design freeze records the report fingerprint');
  ok(freeze.indexOf('SOURCE_MODIFIED_AT_NOT_MEASURABLE') > 0,
    'J15 and carries the evidence gap forward rather than closing it');
  ok(readRoot('docs/planning/DEPLOYMENT_RELEASE_LOG.md').indexOf('2AF82658') > 0,
    'J16 and the release ledger records the table fingerprint');
}());

// ===================================================================================================
console.log('\n=== §K  THE ACTION CONTRACT MATRIX, EXECUTED ===');
// ===================================================================================================
/**
 * P1-B6 raised the frontend pin 13 -> 14 and recorded "Apps Script first, frontend second" as binding.
 * That is a claim about a comparison, so the comparison is run: the real gate, loaded four times with
 * the pin rewritten and the deployment's own answer varied.
 *
 * IF THIS RULE WERE EQUALITY RATHER THAN A MINIMUM, backend-first would break every page for the whole
 * window between the two deployments, and the round would have to stop and design a compatibility
 * window instead. It is a minimum, and the 13/14 cell is the proof.
 */
var MATRIX = {};
function runGate(browserPin, serverContract) {
  var src = SRC.dbapi.replace('var KM_EXPECTED_ACTION_CONTRACT_VERSION_ = 14;',
    'var KM_EXPECTED_ACTION_CONTRACT_VERSION_ = ' + browserPin + ';');
  var win = { KM: { DB: {} }, location: { href: 'https://x/' },
    localStorage: { getItem: function () { return null; }, setItem: function () {},
      removeItem: function () {} },
    addEventListener: function () {} };
  var sandbox = { window: win, console: { log: function () {}, warn: function () {}, error: function () {} },
    document: { addEventListener: function () {}, getElementById: function () { return null; },
      querySelector: function () { return null; }, querySelectorAll: function () { return []; },
      createElement: function () { return { style: {}, classList: { add: function () {}, remove: function () {} } }; },
      body: { appendChild: function () {} } },
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    fetch: function () { return Promise.reject(new Error('no network in a test')); },
    navigator: { onLine: true } };
  sandbox.globalThis = sandbox; sandbox.self = sandbox;
  vm.createContext(sandbox);
  sandbox.HEALTH = { success: true, envelope: {
    build_id: EVIDENCE.build, deployed_action_contract_version: serverContract,
    transport_contract_version: 1, router_build: 'RTR-R9', required_action_list_version: 12,
    caller_probe: { all_present: true, missing_actions: [], missing_symbols: [] },
    module_build_stamps: { mixed_deployment: false, stale_modules: [], absent_modules: [] } } };
  vm.runInContext(src, sandbox, { filename: 'operation-system-db-api.js' });
  /* `_kmGapRead_` is a hoisted `async function` in that file, so it is replaced AFTER the load —
     a `var` assignment beforehand is simply overwritten by the hoisting. */
  vm.runInContext('_kmGapRead_ = function () { return Promise.resolve(HEALTH); };', sandbox);
  win.KM.DB.getEndpointClassification = function () { return { ok: true, kind: 'EXEC' }; };
  return win.KM.DB.checkDeploymentContract();
}

var K = (function () {
  return Promise.all([[13, 13], [13, 14], [14, 13], [14, 14]].map(function (c) {
    return runGate(c[0], c[1]).then(function (v) { MATRIX[c[0] + '/' + c[1]] = v.code; return v; });
  })).then(function () {
    eq(MATRIX['13/13'], 'DEPLOYMENT_CONTRACT_OK', 'K1 browser 13 · server 13 — today, unchanged');
    eq(MATRIX['13/14'], 'DEPLOYMENT_CONTRACT_OK',
      'K2 browser 13 · server 14 — BACKEND-FIRST IS SAFE: the deployed frontend accepts the new server');
    eq(MATRIX['14/13'], 'DEPLOYMENT_CONTRACT_MISMATCH',
      'K3 browser 14 · server 13 — FRONTEND-FIRST BREAKS EVERY PAGE');
    eq(MATRIX['14/14'], 'DEPLOYMENT_CONTRACT_OK', 'K4 browser 14 · server 14 — after both steps');

    /* THE RULE ITSELF, NAMED. A minimum, not an equality — which is the only reason K2 is OK. */
    ok(/identity\.deployed_action_contract_version < KM_EXPECTED_ACTION_CONTRACT_VERSION_/
      .test(SRC.dbapi), 'K5 the gate is minimum-compatible, not exact equality');
    ok(/var KM_EXPECTED_ACTION_CONTRACT_VERSION_ = 14;/.test(SRC.dbapi),
      'K6 and this build pins 14');
    ok(/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = 14;/.test(SRC.health),
      'K7 which equals what the deployment declares');

    /* THE ORDER IS THEREFORE FIXED AND HAS NO ZERO-DOWNTIME ALTERNATIVE IN THE OTHER DIRECTION. */
    ok(MATRIX['13/14'] === 'DEPLOYMENT_CONTRACT_OK' && MATRIX['14/13'] !== 'DEPLOYMENT_CONTRACT_OK',
      'K8 so the deployment order is Apps Script FIRST, frontend SECOND — with no interruption');

    /* AND THE NEW ACTION IS NOT IN THE PROBE LIST, which is what makes a ROLLBACK safe: a browser
       carrying this build against a rolled-back deployment reports the contract version, not a
       missing action, and the difference is the difference between one named fact and a list. */
    ok(SRC.dbapi.indexOf("'productPricing.siteUniverse.get'") < 0,
      'K9 the new action is not in the required-action probe list');
    ok(/var SYS_REQUIRED_ACTION_LIST_VERSION_ = 12;/.test(SRC.health),
      'K10 and the required-action list version did not move');
  });
}());

// ===================================================================================================
// §L  MUTANTS
// ===================================================================================================
function mut(label, file, from, to, probe) {
  var full = path.join(ROOT, file);
  var original = fs.readFileSync(full, 'utf8');
  var norm = original.replace(/\r\n/g, '\n');
  var n = norm.split(from).length - 1;
  if (n !== 1) {
    mutSurvived++;
    console.log('  MUTANT SURVIVED (anchor x' + n + ') ' + label);
    return;
  }
  fs.writeFileSync(full, norm.replace(from, to), 'utf8');
  var caught = false, why = '';
  try { caught = probe() === true; } catch (e) { caught = true; why = String(e && e.message); }
  fs.writeFileSync(full, original, 'utf8');
  if (caught) { mutCaught++; console.log('  ok   ' + label + ' (caught)'); }
  else { mutSurvived++; console.log('  MUTANT SURVIVED ' + label + ' ' + why); }
}
function reread(p) { return read(path.join(ROOT, p)); }
/**
 * THE SAME MUTANT, FOR A PROBE THAT ANSWERS LATER. `mut` compares `probe() === true`, and a Promise is
 * never true — so an asynchronous probe reports MUTANT SURVIVED whatever the code does, which is a red
 * suite claiming a rule is unprotected when in fact the harness could not read the answer. Restoring the
 * file before the promise settles is deliberate and safe: runGate reads the mutated source into a string
 * synchronously, so the sandbox still holds the mutant after the file on disk is whole again.
 */
function mutAsync(label, file, from, to, probe) {
  var full = path.join(ROOT, file);
  var original = fs.readFileSync(full, 'utf8');
  var norm = original.replace(/\r\n/g, '\n');
  var n = norm.split(from).length - 1;
  if (n !== 1) {
    mutSurvived++;
    console.log('  MUTANT SURVIVED (anchor x' + n + ') ' + label);
    return Promise.resolve();
  }
  fs.writeFileSync(full, norm.replace(from, to), 'utf8');
  /* THE PROBE IS CALLED SYNCHRONOUSLY, not deferred through `.then`. Its synchronous half is what
     reads the mutated file into the sandbox; deferring it to a microtask ran it after the restore
     below, so the mutant was measured against the original source and "survived" every time. */
  var settled;
  try { settled = Promise.resolve(probe()).then(function (c) { return c === true; },
    function () { return true; }); }
  catch (e) { settled = Promise.resolve(true); }
  fs.writeFileSync(full, original, 'utf8');
  return settled.then(function (caught) {
    if (caught) { mutCaught++; console.log('  ok   ' + label + ' (caught)'); }
    else { mutSurvived++; console.log('  MUTANT SURVIVED ' + label); }
  });
}

K.then(function () {
  console.log('\n=== §L  MUTANTS ===');

  /* L1 TURNED AROUND WHEN THE SECTION WAS ACTIVATED, for the same reason R3-R1's G13 did one round
     earlier: a mutant that flips `enabled: false` to `true` has no anchor once the value IS true, and
     "anchor not found" scores as SURVIVED - a mutant measuring nothing while reporting a failure.
     What D6 now guards is that the section is in BOTH section maps, so the defect to model is losing
     ONE of them: the half-wired page that mounts into a shell nobody reveals, or is revealed empty.
     The two entries differ only by indentation - eight spaces in the display map, twelve in the
     lifecycle one - which is what lets this anchor name exactly one of them. */
  mut('L1 the section is dropped from the display section map — D6', 'assets/js/app.js',
    "\n        'product-strategy': 'product-strategy-board-section'",
    "\n        'REMOVED-BY-MUTANT': 'product-strategy-board-section'",
    function () {
      var s = reread('assets/js/app.js');
      return (s.match(/'product-strategy': 'product-strategy-board-section'/g) || []).length !== 2;
    });

  mut('L2 the guard lets a staged section through', 'assets/js/app.js',
    "    if (staged && staged.enabled !== true) {", "    if (staged && staged.enabled === true) {",
    function () { return !/if \(staged && staged\.enabled !== true\)/.test(reread('assets/js/app.js')); });

  mut('L3 the guard moves below the shell mutation', 'assets/js/app.js',
    "    var staged = KM_STAGED_SECTIONS_[section];", "    var staged = undefined && {};",
    function () { return !/var staged = KM_STAGED_SECTIONS_\[section\];/
      .test(reread('assets/js/app.js')); });

  /* P1-B8A re-anchored: the ground declarations were merged into the one `.psb-page` block when
     the scoped token block and the ground rule stopped being two rules for the same selector. */
  mut('L4 the page ground goes back to being a document rule',
    'assets/css/product-strategy-board.css', "\n  background: var(--ground); color: var(--ink);",
    "\n}\nbody {\n  background: var(--ground); color: var(--ink);",
    function () { return /^body \{/m.test(reread('assets/css/product-strategy-board.css')); });

  mut('L5 the shared button token set escapes the board again',
    'assets/css/product-strategy-board.css', "\n.psb-page .btn {", "\n.btn {",
    function () { return reread('assets/css/product-strategy-board.css').indexOf('\n.btn {') >= 0; });

  mut('L6 the filter group escapes, and every filter on every page changes width',
    'assets/css/product-strategy-board.css', "\n.psb-page .filter-group {", "\n.filter-group {",
    function () { return reread('assets/css/product-strategy-board.css').indexOf('\n.filter-group {') >= 0; });

  mut('L7 the board dereferences a shell element production does not have',
    'assets/js/product-strategy/psb-board-ui.js',
    "      var shellEl = byId('shell');\n      if (shellEl) shellEl.className",
    "      var shellEl = byId('shell');\n      shellEl.className",
    function () {
      var dom = H.makeDom(partialSkeleton);
      var sb = { console: { log: function () {}, warn: function () {}, error: function () {} } };
      sb.window = dom.window; sb.document = dom.document; sb.Event = dom.Event;
      sb.globalThis = sb; sb.PSB_BOARD_DEFER = true;
      sb.setTimeout = setTimeout; sb.clearTimeout = clearTimeout;
      sb.requestAnimationFrame = function (f) { return setTimeout(f, 0); };
      vm.createContext(sb);
      ['psb-data-contract.js', 'psb-chart-layout.js', 'psb-selectors.js', 'psb-board-ui.js']
        .forEach(function (f) {
          vm.runInContext(read(path.join(JS, 'product-strategy', f)), sb, { filename: f });
        });
      var site = SITES[0];
      var ad = LIVE.createFromResponse(envelope(rowsForSite(site)), {});
      try { sb.PSB_BOARD.mount({ adapter: ad }); return false; } catch (e) { return true; }
    });

  mut('L8 the renderer loses the method it actually calls',
    'assets/js/product-strategy/km-product-strategy-live-adapter.js',
    "      loadCanonical: function () { return snapshot; },\n", "",
    function () {
      delete require.cache[require.resolve(path.join(JS, 'product-strategy',
        'km-product-strategy-live-adapter.js'))];
      var L2 = require(path.join(JS, 'product-strategy', 'km-product-strategy-live-adapter.js'));
      var bad = typeof L2.createFromResponse(envelope(rowsForSite(SITES[0])), {}).loadCanonical
        !== 'function';
      delete require.cache[require.resolve(path.join(JS, 'product-strategy',
        'km-product-strategy-live-adapter.js'))];
      require(path.join(JS, 'product-strategy', 'km-product-strategy-live-adapter.js'));
      return bad;
    });

  mut('L9 the board goes back to booting itself in a shell that has no data for it',
    'assets/js/product-strategy/psb-board-ui.js',
    "  if (this.PSB_BOARD_DEFER !== true && PREVIEW && PREVIEW.PreviewProductStrategyDataAdapter) boot();",
    "  if (this.PSB_BOARD_DEFER !== true) boot();",
    function () {
      return !/PREVIEW && PREVIEW\.PreviewProductStrategyDataAdapter\) boot\(\)/
        .test(reread('assets/js/product-strategy/psb-board-ui.js'));
    });

  mut('L10 a redraw takes ownership of the whole body class list',
    'assets/js/product-strategy/psb-board-ui.js',
    "    var keep = String(b.className || '').split(/\\s+/).filter(function (t) {\n      return t !== '' && BODY_STATE_CLASSES.indexOf(t) < 0;\n    });",
    "    var keep = [];",
    function () {
      var dom = H.makeDom(partialSkeleton);
      var sb = { console: { log: function () {}, warn: function () {}, error: function () {} } };
      sb.window = dom.window; sb.document = dom.document; sb.Event = dom.Event;
      sb.globalThis = sb; sb.PSB_BOARD_DEFER = true;
      sb.setTimeout = setTimeout; sb.clearTimeout = clearTimeout;
      sb.requestAnimationFrame = function (f) { return setTimeout(f, 0); };
      vm.createContext(sb);
      ['psb-data-contract.js', 'psb-chart-layout.js', 'psb-selectors.js', 'psb-board-ui.js']
        .forEach(function (f) {
          vm.runInContext(read(path.join(JS, 'product-strategy', f)), sb, { filename: f });
        });
      dom.document.body.className = 'km-rescol-active';
      try { sb.PSB_BOARD.mount({ adapter: LIVE.createFromResponse(envelope(rowsForSite(SITES[0])), {}) }); }
      catch (e) { return true; }
      return dom.document.body.className.indexOf('km-rescol-active') < 0;
    });

  mut('L11 the capability mirror defaults to open', 'assets/js/api/km-product-pricing-workspace.js',
    "  var _enabled = false;", "  var _enabled = true;",
    function () { return !/var _enabled = false;/
      .test(reread('assets/js/api/km-product-pricing-workspace.js')); });

  return mutAsync('L12 the deployment gate becomes an equality, so backend-first breaks every page',
    'assets/js/api/operation-system-db-api.js',
    "    if (identity.deployed_action_contract_version < KM_EXPECTED_ACTION_CONTRACT_VERSION_) {",
    "    if (identity.deployed_action_contract_version !== KM_EXPECTED_ACTION_CONTRACT_VERSION_) {",
    function () {
      SRC.dbapi = reread('assets/js/api/operation-system-db-api.js');
      return runGate(13, 14).then(function (v) { return v.code !== 'DEPLOYMENT_CONTRACT_OK'; });
    });
}).then(function () {
  SRC.dbapi = reread('assets/js/api/operation-system-db-api.js');
  console.log('\n' + new Array(101).join('='));
  console.log('passed ' + pass + '  failed ' + fail
    + '  |  mutants caught ' + mutCaught + '  survived ' + mutSurvived);
  console.log(new Array(101).join('='));
  if (fail > 0 || mutSurvived > 0) process.exitCode = 1;
});
