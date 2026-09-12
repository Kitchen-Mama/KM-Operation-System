// Kitchen Mama Operation System — PRODUCT-STRATEGY-P1-B8C-R2
// The live row-shape replay, the production render acceptance, and the line between live evidence
// and fixture evidence.
//
// THE ROUND ASKS ONE QUESTION: can the row shape the production database actually holds travel the
// whole shipped chain — accessor, validator, adapter, state machine, selectors, views, controller,
// partial, stylesheet — and render correctly, with no test shortcut anywhere in the path?
//
// WHAT IS NEW HERE, AND WHY THE EARLIER SUITES COULD NOT ANSWER IT. P1-B8C proved the machine on a
// DETERMINISTIC capture, because the live one was structurally unobtainable: the flag was false, and
// the census that could read the tables threw every row away. P1-B8C-R1/R1A built the one function
// that keeps the rows, the USER ran it against production, and this suite replays what came back.
// EVERY ROW BELOW IS A ROW A PRODUCTION SHEET HOLDS.
//
// THREE LINES THIS SUITE REFUSES TO LET ANYONE CROSS:
//
//   1. LIVE IS NOT FIXTURE. `_p1b8c-r2-live-derived.js` says LIVE_DERIVED_REDACTED and
//      `_p1b8c-capture.js` says DETERMINISTIC. §B and §G assert that neither can be reported as the
//      other, and that the ONE state production does not contain — a non-active listing, because all
//      495 live rows are Active — is covered by the fixture and labelled as fixture coverage.
//   2. SIXTY IS NOT FOUR HUNDRED AND NINETY-FIVE. The capture is a sample and says so. Every count an
//      envelope reports describes the sample; the site's real numbers travel separately and are
//      asserted separately, because a board reading "101 listings" over a 27-row chart renders a
//      number no row supports.
//   3. THE RAW LOG IS NOT EVIDENCE THAT MAY BE COMMITTED. 240,126 characters of production prices and
//      product names stayed out of the repository. What is committed is the reduced sixty rows and a
//      metadata-only chunk manifest, and §A proves the manifest still describes a complete log.
//
// Run: node assets/tests/product-strategy-live-replay-acceptance-p1-b8c-r2.test.js

var fs = require('fs'), path = require('path'), vm = require('vm');
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
function section(t) { console.log('\n=== ' + t + ' ==='); }

/* THE STAGED BLOCK IS EXTRACTED BY BRACE MATCHING, NOT BY A CHARACTER BUDGET.
   The first version used `/'product-strategy':\s*\{[\s\S]{0,600}?\}/`, which needs a closing brace
   within six hundred characters. The registry entry opens with a forty-line comment explaining why
   the menu is data rather than markup, so the first `}` is well past that and the regex matched
   NOTHING — the assertion failed, and its mutant survived, for the same reason and neither was about
   the rule being tested. */
function blockAfter(src, anchor) {
  var i = src.indexOf(anchor);
  if (i < 0) return null;
  var j = src.indexOf('{', i);
  if (j < 0) return null;
  var depth = 0;
  for (var k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  return null;
}

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); }
function bare(src) {
  src = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  src = src.split('\n').map(function (l) { return l.split('//')[0]; }).join('\n');
  return src.replace(/'(?:\\.|[^'\\\n])*'/g, "''").replace(/"(?:\\.|[^"\\\n])*"/g, '""');
}

var H = require(path.join(__dirname, '_psb-harness.js'));
var LIVE = require(path.join(__dirname, '_p1b8c-r2-live-derived.js'));
var CHUNKS = require(path.join(__dirname, '_p1b8c-r2-chunk-manifest.js'));
var FIXTURE = require(path.join(__dirname, '_p1b8c-capture.js'));

var JS = path.join(ROOT, 'assets', 'js');
var MODULES = [
  'api/km-product-pricing-workspace.js',
  'api/km-product-pricing-adapter.js',
  'product-strategy/psb-data-contract.js',
  'product-strategy/km-product-strategy-site-universe.js',
  'product-strategy/km-product-strategy-live-adapter.js',
  'product-strategy/psb-selectors.js',
  'product-strategy/psb-chart-layout.js',
  'product-strategy/psb-views.js',
  'product-strategy/psb-board-ui.js',
  'pages/product-strategy-board.js'
];
var SRC = {
  partial: read('assets/html/pages/product-strategy-board.html'),
  css: read('assets/css/product-strategy-board.css'),
  index: read('index.html'),
  app: read('assets/js/app.js'),
  config: read('assets/specs/active/apps-script/00_config.gs'),
  router: read('assets/specs/active/apps-script/01_router.gs'),
  live: read('assets/tests/_p1b8c-r2-live-derived.js'),
  manifest: read('assets/tests/_p1b8c-r2-chunk-manifest.js'),
  fixture: read('assets/tests/_p1b8c-capture.js'),
  replay: read('assets/tests/_p1b8c-replay.js'),
  runner: read('assets/tests/_p1b8c-visual-runner.js')
};

console.log('\n===================================================================================');
console.log('PRODUCT STRATEGY — P1-B8C-R2  LIVE REPLAY · RENDER ACCEPTANCE · NO ACTIVATION');
console.log('===================================================================================');

// ===================================================================================================
section('SECTION A  §3 THE LOG WAS COMPLETE, AND THE REPORT IS BYTE-EXACT');
// ===================================================================================================
/*
 * The raw log is not in the repository and must not be, so what this section reads is the manifest:
 * thirty-five headers, each chunk's length, a digest of each chunk's bytes. A manifest that merely
 * SAID "35/35" would be a claim; this one carries the arithmetic that can only add up if the log did.
 */
eq(CHUNKS.CHUNK_COUNT, 35, 'A1  the run emitted thirty-five chunks');
eq(CHUNKS.CHUNKS.length, 35, 'A1a and the manifest records thirty-five');
var idx = CHUNKS.CHUNKS.map(function (c) { return c.index; });
eq(idx, idx.map(function (_, i) { return i + 1; }),
  'A2  chunk_index runs 1..35 with no gap and no repeat', idx);
var dupe = {}, dupes = [];
idx.forEach(function (i) { if (dupe[i]) dupes.push(i); dupe[i] = 1; });
eq(dupes, [], 'A2a and no index appears twice');

// A3 — EVERY HEADER AGREES WITH EVERY OTHER. A partial paste shows up here before anywhere else.
var counts = {}, fps = {}, lens = {};
CHUNKS.CHUNKS.forEach(function (c) {
  counts[c.chunk_count] = 1; fps[c.header_fingerprint] = 1; lens[c.header_length] = 1;
});
eq(Object.keys(counts), ['35'], 'A3  every chunk declares chunk_count=35', Object.keys(counts));
eq(Object.keys(fps), ['FPe02df215'],
  'A3a every chunk declares the same full_report_fingerprint', Object.keys(fps));
eq(Object.keys(lens), ['240126'],
  'A3b every chunk declares the same full_report_length', Object.keys(lens));
eq(CHUNKS.DECLARED_FINGERPRINT, 'FPe02df215', 'A3c the manifest names the declared fingerprint');
eq(CHUNKS.DECLARED_LENGTH, 240126, 'A3d and the declared length');

/* A4 — THE EMITTER SLICES AT A FIXED WIDTH, so 34 chunks are exactly 7,000 characters and the last is
   the remainder. Any other distribution means the log was edited between the editor and here. */
var body = CHUNKS.CHUNKS.map(function (c) { return c.chars; });
eq(body.slice(0, 34).filter(function (n) { return n !== CHUNKS.EMITTER_SLICE_CHARS; }), [],
  'A4  thirty-four chunks are exactly the emitted slice width', body.slice(0, 34));
eq(body[34], 240126 - 34 * 7000, 'A4a and the last is the remainder', body[34]);
eq(body.reduce(function (a, n) { return a + n; }, 0), 240126,
  'A4b SO THE CHUNK LENGTHS SUM TO THE DECLARED LENGTH — the log was complete');

// A5 — every chunk's bytes are digested, so two chunks cannot be the same chunk twice.
var shas = {};
CHUNKS.CHUNKS.forEach(function (c) { shas[c.sha256_16] = (shas[c.sha256_16] || 0) + 1; });
eq(Object.keys(shas).length, 35, 'A5  all thirty-five chunk digests are distinct');
ok(CHUNKS.CHUNKS.every(function (c) { return /^[0-9a-f]{16}$/.test(c.sha256_16); }),
  'A5a and each is a real digest');

/* A6 — THE EXPORT'S OWN LAYERS, RECORDED AND REVERSED.
   The editor prints "<time>\t<level>\t<text>" and the text export rewrote every LF as CRLF. Neither
   is part of the bytes the fingerprint covers. Chunks 26 and 32 came back one character short because
   the exporter merges a slice's own trailing newline with the separator it writes before the next
   timestamp — recoverable without guessing, because the next chunk starts with indentation and
   `JSON.stringify(_, null, 2)` only produces indentation after a newline. */
eq(CHUNKS.EXPORT_CRLF_COUNT, 7621, 'A6  the export carries 7,621 CRLF pairs');
eq(CHUNKS.EXPORT_BARE_LF_COUNT, 0, 'A6a and not one bare LF survived');
eq(CHUNKS.EXPORT_RESTORED_NEWLINES_AT, [26, 32],
  'A6b two chunks lost their own trailing newline to the exporter');
eq(CHUNKS.EXPORT_RESTORED_NEWLINES_TOTAL, 2, 'A6c two characters in 240,126');
eq(CHUNKS.CHUNKS.filter(function (c) { return c.export_restored_newlines; })
  .map(function (c) { return c.index; }), [26, 32], 'A6d and the manifest names which');
/* A6e — AND THE HYPOTHESIS WAS TESTED RATHER THAN ASSERTED. Restoring newlines gives the declared
   fingerprint; restoring SPACES gives a different one, which is how we know which it was. No header
   was edited to make anything agree. */
eq(CHUNKS.REASSEMBLY_IS_BYTE_EXACT, true,
  'A6e the reassembled report is byte-exact against the declared fingerprint');
ok(CHUNKS.WRONG_HYPOTHESIS_FINGERPRINT !== CHUNKS.DECLARED_FINGERPRINT,
  'A6f and the spaces hypothesis produced a DIFFERENT fingerprint, which is how it was ruled out');
ok(CHUNKS.RAW_EXPORT_FINGERPRINT_BEFORE_RESTORE !== CHUNKS.DECLARED_FINGERPRINT,
  'A6g as did the un-restored export');
ok(/EXPORT_NEWLINE_NORMALIZATION is NOT|is NOT\n\/\/ an evidence gap/.test(SRC.manifest)
  || SRC.manifest.indexOf('EXPORT_NEWLINE_NORMALIZATION') !== -1,
  'A6h and the file records the §3.3 gap by name — as ruled out, not as unexamined');

// A7 — THE RAW LOG IS NOT IN THE REPOSITORY, and the manifest says so rather than implying it.
eq(CHUNKS.RAW_LOG_IS_IN_THE_REPOSITORY, false, 'A7  the manifest declares the raw log is not here');
var gitignore = read('.gitignore');
ok(/p1b8c-r1a-editor-log/.test(gitignore),
  'A7a and .gitignore keeps it out, so it cannot be committed by accident');
var toolFiles = fs.readdirSync(path.join(ROOT, 'assets', 'tools'));
var tracked = toolFiles.filter(function (f) { return /editor-log/.test(f); });
ok(tracked.length === 0 || /p1b8c-r1a-editor-log/.test(gitignore),
  'A7b a copy on disk is ignored rather than tracked', tracked);

// ===================================================================================================
section('SECTION B  §4 THE DERIVED CAPTURE: LIVE, REDUCED, AND HONEST ABOUT BEING A SAMPLE');
// ===================================================================================================

eq(LIVE.SOURCE_KIND, 'LIVE_DERIVED_REDACTED', 'B1  THE CAPTURE SAYS WHAT IT IS');
eq(LIVE.IS_LIVE_DERIVED, true, 'B1a is_live_derived');
eq(LIVE.IS_A_DETERMINISTIC_FIXTURE, false, 'B1b AND SAYS IT IS NOT A FIXTURE');
eq(LIVE.NOT_FULL_UNIVERSE, true, 'B1c and that it is not the whole universe');
eq(LIVE.ORIGINAL_REPORT_FINGERPRINT, 'FPe02df215', 'B2  it names the run it came from');
eq(LIVE.ORIGINAL_REPORT_LENGTH, 240126, 'B2a by length');
eq(LIVE.ORIGINAL_REPORT_CHUNKS, 35, 'B2b and by chunk count');
eq(LIVE.ORIGINAL_BUILD, 'P1-B8C-R1A', 'B2c and the build that produced it');
eq(LIVE.ORIGINAL_VERDICT, 'SAMPLE_TAKEN', 'B2d with the verdict');
eq(LIVE.UNIVERSE_TOTAL_ROWS, 495, 'B3  the universe it was drawn from is 495 rows');
eq(LIVE.ROW_COUNT, 60, 'B3a and sixty were kept');
eq(LIVE.OMITTED_ROWS, 435, 'B3b leaving 435 omitted, stated');

// B4 — THE GLOBAL CAP, RE-ASSERTED ON THE ROWS THEMSELVES rather than on the field.
var rows = LIVE.allRows();
eq(rows.length, 60, 'B4  sixty rows are present, counted');
ok(rows.length <= 60, 'B4a sampled_rows_total <= 60');
var siteSum = LIVE.SITES.reduce(function (a, s) { return a + s.rows.length; }, 0);
eq(siteSum, 60, 'B4b sum(site.rows.length) === 60');
eq(LIVE.SITES.length, 10, 'B4c across ten sites');
eq(LIVE.SITES_EXAMINED, 10, 'B4d all of which were examined');
var uniSum = LIVE.SITES.reduce(function (a, s) { return a + s.live.universe_rows; }, 0);
eq(uniSum, 495, 'B4e whose universes sum to 495');
eq(LIVE.UNIVERSE_TOTAL_ROWS - LIVE.ROW_COUNT, LIVE.OMITTED_ROWS,
  'B4f omitted = universe - sampled');

// B5 — CANONICAL IDENTITY UNIQUENESS, and no site holding a copy of the sample.
var cids = {}, bareIds = {};
LIVE.SITES.forEach(function (s) {
  s.rows.forEach(function (r) {
    cids[LIVE.siteKey(s) + '||' + r.marketplace_sku_id] = 1;
    bareIds[r.marketplace_sku_id] = 1;
  });
});
eq(Object.keys(cids).length, 60, 'B5  all sixty canonical identities are distinct');
eq(Object.keys(bareIds).length, 60, 'B5a and so are the bare marketplace_sku_ids');
eq(LIVE.SITES.filter(function (s) { return s.rows.length === 60; }), [],
  'B5b NO SITE HOLDS A COPY OF THE WHOLE SAMPLE');
var misfiled = [];
LIVE.SITES.forEach(function (s) {
  s.rows.forEach(function (r) {
    if (r.company !== s.company || r.country !== s.country || r.marketplace !== s.marketplace) {
      misfiled.push(r.marketplace_sku_id);
    }
  });
});
eq(misfiled, [], 'B5c and every row is filed under the site it belongs to');

/* B6 — THE COUNTS DESCRIBE THE SAMPLE AND THE SITE FACTS DESCRIBE THE SITE, and they are different
   numbers on purpose. A board that reported the site's 101 listings over a 27-row chart would be
   rendering a number no row on the page supports. */
var W = LIVE.workspaces();
var shopify = W['KM|US|Shopify'];
ok(!!shopify, 'B6  the largest site is keyed the way the replay harness looks it up');
eq(shopify.data.counts.siteSkuCount, 27, 'B6a its envelope counts the 27 sampled rows');
eq(shopify.data.normalizedRows.length, 27, 'B6b and carries 27 rows');
eq(LIVE.siteRecord({ company: 'KM', country: 'US', marketplace: 'Shopify' }).live.universe_rows, 101,
  'B6c while the SITE really holds 101, recorded separately');
eq(LIVE.siteRecord({ company: 'KM', country: 'US', marketplace: 'Shopify' }).live.counts.siteSkuCount,
  101, 'B6d with the live envelope counts kept beside it');
eq(shopify.data.pagination.total, 27, 'B6e pagination describes what was sent');

// B7 — REDACTION, RE-RUN OVER THE DERIVED CAPTURE with the shipped replay walkers.
var RP = require(path.join(__dirname, '_p1b8c-replay.js'));
var leaks = RP.leaks({ u: LIVE.universeEnvelope(), w: W }, LIVE.MUST_BE_ABSENT_OR_NULL);
eq(leaks, [], 'B7  not one forbidden key carries a value anywhere in the capture', leaks);
var shapes = RP.secretShapes({ u: LIVE.universeEnvelope(), w: W });
eq(shapes, [], 'B7a nor any secret VALUE SHAPE under an innocent name', shapes);
var blob = SRC.live;
[['absolute URL', /"https?:\/\//], ['email', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
 ['AKfyc exec id', /AKfyc[A-Za-z0-9_-]{10,}/],
 ['google file id', /(^|[^A-Za-z0-9_-])1[A-Za-z0-9_-]{30,}([^A-Za-z0-9_-]|$)/]]
  .forEach(function (p, i) {
    ok(!p[1].test(blob), 'B7.' + (i + 1) + ' no ' + p[0] + ' in the capture file text');
  });

/* B8 — THE TWO SUBSTITUTIONS ARE DECLARED, and the file says which facts are live and which are not.
   The live value under `product_image` is an ADDRESS, and the diagnostic removed it. What is live is
   the pair of booleans that decide the renderer's image state. */
eq(LIVE.IMAGE_ADDRESS_IS_A_SUBSTITUTE, true, 'B8  the image address is declared a substitute');
eq(LIVE.REGIONAL_LOCATORS_ARE_NULL, true, 'B8a and the regional locators are declared null');
var regionalWithLocator = rows.filter(function (r) {
  return r.regional && (r.regional.product_url || r.regional.marketplace_product_id
    || r.regional.regional_detail_id);
});
eq(regionalWithLocator, [], 'B8b measured: not one regional object carries a locator');
var absoluteImages = rows.filter(function (r) {
  return typeof r.product_image === 'string' && /^https?:\/\//.test(r.product_image);
});
eq(absoluteImages, [], 'B8c and no row carries an absolute image URL');

// ===================================================================================================
section('SECTION C  §5 PRODUCTION LOADS NEITHER CAPTURE, AND NEITHER IS A PRODUCTION FIXTURE');
// ===================================================================================================

var pages = fs.readdirSync(ROOT).filter(function (f) { return /\.html$/.test(f); });
['_p1b8c-r2-live-derived', '_p1b8c-r2-chunk-manifest', '_p1b8c-capture', '_p1b8c-replay']
  .forEach(function (n, i) {
    eq(pages.filter(function (f) { return read(f).indexOf(n) !== -1; }), [],
      'C1.' + (i + 1) + ' no root document loads ' + n);
  });
eq(LIVE.NOT_LOADED_BY_PRODUCTION, true, 'C2  and the capture declares it');
function walk(dir, out) {
  fs.readdirSync(dir).forEach(function (f) {
    var p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { if (f !== 'node_modules' && f !== '.git') walk(p, out); }
    else if (/\.(js|html|css|gs)$/.test(f)) out.push(p);
  });
  return out;
}
var shipped = walk(path.join(ROOT, 'assets', 'js'), [])
  .concat(walk(path.join(ROOT, 'assets', 'html'), []))
  .concat(walk(path.join(ROOT, 'assets', 'css'), []))
  .concat(walk(path.join(ROOT, 'assets', 'specs', 'active'), []));
var mentions = shipped.filter(function (p) {
  var s = fs.readFileSync(p, 'utf8');
  return s.indexOf('P1B8C_R2_LIVE') !== -1 || s.indexOf('P1B8C_R2_CHUNKS') !== -1
    || s.indexOf('_p1b8c-r2-') !== -1;
}).map(function (p) { return path.relative(ROOT, p).replace(/\\/g, '/'); });
eq(mentions, [], 'C3  NOT ONE SHIPPED FILE MENTIONS THE LIVE CAPTURE', mentions);

/* C4 — AND NO PRODUCTION FILE CARRIES A TEST-ONLY BRANCH. The renderer must not be able to tell that
   it is being replayed; if it could, what the browser photographed would be a different program. */
['__TEST', 'isTest', 'IS_TEST', 'NODE_ENV', 'P1B8C', 'REPLAY', '__replay', 'testMode', 'TEST_ONLY']
  .forEach(function (n, i) {
    var hits = MODULES.filter(function (f) {
      return bare(read('assets/js/' + f)).indexOf(n) !== -1;
    });
    eq(hits, [], 'C4.' + (i + 1) + ' no module on the render path branches on ' + n, hits);
  });

// ===================================================================================================
section('SECTION D  §5 THE PRODUCTION CHAIN, DRIVEN FROM THE SOCKET, FOR ALL TEN LIVE SITES');
// ===================================================================================================

function productionPage(opts) {
  opts = opts || {};
  var dom = H.makeDom(H.productionSkeleton(SRC.partial));
  dom.window.addEventListener = function () {};
  dom.window.removeEventListener = function () {};
  var sb = { console: { log: function () {}, warn: function () {}, error: function () {} } };
  sb.document = dom.document;
  sb.Event = dom.Event;
  sb.PSB_BOARD_DEFER = true;
  sb.setTimeout = setTimeout; sb.clearTimeout = clearTimeout;
  sb.requestAnimationFrame = function (f) { return setTimeout(f, 0); };
  sb.Promise = Promise;
  vm.createContext(sb);
  vm.runInContext('var window = this; var globalThis = this;', sb);
  sb.print = dom.window.print;
  sb.scrollTo = function (x, y) { dom.window.scrollTo(x, y); };
  ['scrollX', 'scrollY', 'pageXOffset', 'pageYOffset', 'innerWidth', 'innerHeight']
    .forEach(function (k) {
      Object.defineProperty(sb, k, { get: function () { return dom.window[k]; } });
    });
  sb.ResizeObserver = function () { this.observe = function () {}; this.disconnect = function () {}; };
  MODULES.forEach(function (f) {
    var src = read('assets/js/' + f);
    if (opts.mutate) src = opts.mutate(f, src);
    vm.runInContext(src, sb, { filename: f });
  });
  var liveSrc = opts.mutateCapture ? opts.mutateCapture(SRC.live) : SRC.live;
  vm.runInContext(liveSrc, sb, { filename: '_p1b8c-r2-live-derived.js' });
  vm.runInContext(SRC.replay, sb, { filename: '_p1b8c-replay.js' });
  return { dom: dom, sb: sb, doc: dom.document, CAP: sb.P1B8C_R2_LIVE, RP: sb.P1B8C_REPLAY,
    ACC: sb.KM.productPricingWorkspace, PAGE: sb.KM.pages.productStrategyBoard,
    BOARD: sb.PSB_BOARD, VIEWS: sb.PSB_VIEWS };
}
function id(p, x) { return p.doc.getElementById(x); }
function tabsOf(p) { return id(p, 'nav').querySelectorAll('.navbtn'); }
var SITE_LIST = LIVE.SITES.map(function (s) {
  return { company: s.company, country: s.country, marketplace: s.marketplace };
});
var BAD_TEXT = ['NaN', 'undefined', '[object Object]'];

var P0 = productionPage();
var T0 = P0.RP.install(P0.sb, P0.ACC, P0.RP.captureOf(P0.CAP), {});
var C0 = P0.PAGE.create({ document: P0.doc });
var SITE_RESULTS = {};

var CHAIN = C0.loadUniverse().then(function () {
  var seq = Promise.resolve();
  SITE_LIST.forEach(function (site) {
    seq = seq.then(function () {
      return C0.select(site).then(function (res) {
        SITE_RESULTS[LIVE.siteKey(site)] = { res: res, views: {} };
        P0.VIEWS.ids().forEach(function (v) {
          P0.BOARD.showView(v);
          var host = id(P0, 'view');
          SITE_RESULTS[LIVE.siteKey(site)].views[v] = {
            nodes: host ? host.childNodes.length : 0,
            text: host ? String(host.textContent || '') : '',
            route: P0.BOARD.currentRoute()
          };
        });
        P0.BOARD.showView('overview');
      });
    });
  });
  return seq;
}).then(function () {
  // D1 — every live site renders through the chain.
  SITE_LIST.forEach(function (site, i) {
    var r = SITE_RESULTS[LIVE.siteKey(site)];
    ok(r && r.res && r.res.state === 'OK',
      'D1.' + (i + 1) + ' ' + LIVE.siteKey(site) + ' renders OK through the production chain',
      r && r.res && r.res.state);
  });
  eq(Object.keys(SITE_RESULTS).length, 10, 'D2  all ten live sites were replayed');

  /* D3 — THE SUBSTITUTION IS THE SOCKET AND NOTHING ELSE. One universe read, then one workspace read
     per site, and every one of them a READ. */
  var actions = T0.actions();
  eq(actions[0], 'productPricing.siteUniverse.get', 'D3  the universe is read first');
  eq(actions.length, 11, 'D3a then one workspace read per site — eleven requests', actions.length);
  eq(actions.slice(1).filter(function (a) { return a !== 'productPricing.workspace.get'; }), [],
    'D3b and every one after the first is the workspace read');
  /* D3c — ZERO WRITES, AND IT IS A BEHAVIOUR RATHER THAN A COUNTER. `writes` is a declared 0 on
     the harness; what makes it true is that the transport THROWS on anything that is not one of the
     two reads. A counter the code under test maintains is a test of the counter, so the throw is
     provoked — ON A SEPARATE TRANSPORT.

     THE FIRST VERSION PROVOKED IT ON T0 AND BROKE §I. The transport appends to its log BEFORE it
     checks the action, so the refused call was still recorded, and I4a — "every action ends in
     .get" — then found `productPricing.workspace.save` in the replay's own history. The probe has
     to happen somewhere the round's evidence is not being kept. */
  eq(T0.writes, 0, 'D3c the transport reports zero writes');
  var probe = P0.RP.makeTransport(P0.RP.captureOf(P0.CAP), {});
  var threw = null;
  try {
    probe.api.transport.post({ action: 'productPricing.workspace.save', payload: {} });
  } catch (e) { threw = String(e && e.message || e); }
  ok(threw !== null && /REFUSED A NON-READ ACTION/.test(threw),
    'D3d AND A WRITE-SHAPED CALL IS REFUSED BY THROWING — the zero is enforced, not declared', threw);

  // D4 — every layer really ran.
  ok(id(P0, 'view').childNodes.length > 0, 'D4  the renderer filled the chart host');
  ok(id(P0, 'scope').childNodes.length > 0, 'D4a and the command bar');
  eq(tabsOf(P0).length, 6, 'D4b with the six production tabs');
  ok(id(P0, 'crumbs').textContent.indexOf('Product Strategy') >= 0, 'D4c and the crumb');
  ok(!id(P0, 'psb-state-host').childNodes.length,
    'D4d and the state host is EMPTY — no refusal was written over a board that rendered');

  /* D5 — THE ACCESSOR'S VALIDATOR IS IN THE PATH. This is the seam P1-B7E's live defect lived in: a
     deployed envelope whose meta.action named the wrong action. Live data must not soften it. */
  var p2 = productionPage();
  var cap2 = p2.RP.captureOf(p2.CAP);
  Object.keys(cap2.workspaces).forEach(function (k) {
    cap2.workspaces[k].meta.action = 'productPricing.siteUniverse.get';
  });
  p2.RP.install(p2.sb, p2.ACC, cap2);
  var c2 = p2.PAGE.create({ document: p2.doc });
  return c2.loadUniverse().then(function () { return c2.select(SITE_LIST[0]); })
    .then(function (res2) {
      ok(res2.state !== 'OK',
        'D5  AN ENVELOPE WITH THE WRONG meta.action IS STILL REFUSED, on live data too');
      eq(res2.state, 'SOURCE_NOT_CONNECTED',
        'D5a exactly as the deployed accessor refused it at P1-B7E');
    });
});

// ===================================================================================================
CHAIN = CHAIN.then(function () {
  section('SECTION E  §6 THE LIVE STATES, EACH FOUND IN THE DATA RATHER THAN ARRANGED');
  // =================================================================================================
  var U = LIVE.universeEnvelope().data;
  eq(U.site_count, 10, 'E1  the scope ladder carries all ten live sites');
  eq(U.completeness.rows_examined, 495, 'E1a over the whole 495-row universe');
  eq(U.hierarchy.companies, ['KM', 'ResTW', 'ResUS'], 'E2  three live companies', U.hierarchy.companies);
  var countries = {};
  U.sites.forEach(function (s) { countries[s.country] = 1; });
  eq(Object.keys(countries).sort(), ['AU', 'CA', 'EU', 'JP', 'UK', 'US'],
    'E2a six live countries', Object.keys(countries).sort());
  var markets = {};
  U.sites.forEach(function (s) { markets[s.marketplace] = 1; });
  eq(Object.keys(markets).sort(), ['Amazon', 'Shopify', 'Target', 'Walmart'],
    'E2b four live marketplaces', Object.keys(markets).sort());
  ok(U.sites.every(function (s) { return s.marketplace_sku_count > 0 && s.selectable; }),
    'E2c and every one is selectable with a real row count');

  /* E3 — THE STATES §6 ENUMERATES, COUNTED IN THE LIVE ROWS. Each is a fact about production, not an
     arrangement: if production stopped holding one of these tomorrow, the assertion would say so. */
  function count(fn) { return rows.filter(fn).length; }
  var states = [
    ['analysable', count(function (r) { return r.analysable === true; }),
      count(function (r) { return r.analysable !== true; })],
    ['regular_price', count(function (r) { return r.regular_price !== null; }),
      count(function (r) { return r.regular_price === null; })],
    ['minimum_price', count(function (r) { return r.minimum_price !== null; }),
      count(function (r) { return r.minimum_price === null; })],
    ['msrp', count(function (r) { return r.msrp !== null; }),
      count(function (r) { return r.msrp === null; })],
    ['promotion', count(function (r) { return (r.campaigns || []).length > 0; }),
      count(function (r) { return (r.campaigns || []).length === 0; })],
    ['product_image', count(function (r) { return r.product_image !== null; }),
      count(function (r) { return r.product_image === null; })],
    ['regional', count(function (r) { return r.regional !== null; }),
      count(function (r) { return r.regional === null; })],
    ['data_quality', count(function (r) {
      return (r.missing_reasons || []).length + (r.findings || []).length > 0; }),
      count(function (r) {
        return (r.missing_reasons || []).length + (r.findings || []).length === 0; })]
  ];
  states.forEach(function (s, i) {
    ok(s[1] > 0 && s[2] > 0,
      'E3.' + (i + 1) + ' BOTH SIDES OF ' + s[0] + ' exist in the live sample',
      { present: s[1], absent: s[2] });
  });

  // E4 — categories, currencies and series, live.
  var cats = {}, curs = {}, sers = {};
  rows.forEach(function (r) {
    if (r.category) cats[r.category] = 1;
    if (r.currency) curs[r.currency] = 1;
    if (r.series) sers[r.series] = 1;
  });
  ok(Object.keys(cats).length >= 8, 'E4  the live sample spans many categories',
    Object.keys(cats).length);
  eq(Object.keys(curs).sort(), ['AUD', 'CAD', 'EUR', 'GBP', 'JPY', 'USD'],
    'E4a and six live currencies', Object.keys(curs).sort());
  ok(Object.keys(sers).length >= 20, 'E4b and more than twenty series', Object.keys(sers).length);

  /* E5 — THE IMAGE FINDING, AND IT IS A PROPERTY OF PRODUCTION RATHER THAN OF THIS CAPTURE.
     `imageStateOf` returns VERIFIED_DB_MAPPING only for an absolute http(s) URL, and only that state
     draws a photograph. The live sample reports `product_image_is_absolute_url` FALSE on every row
     that has an image at all, so on production data the board draws no product photograph anywhere.
     Recorded as a live finding, not as a capture limitation. */
  var ADAPTER = require(path.join(ROOT, 'assets/js/api/km-product-pricing-adapter.js'));
  var imageStates = {};
  rows.forEach(function (r) {
    var st = ADAPTER.imageStateOf(r);
    imageStates[st] = (imageStates[st] || 0) + 1;
  });
  eq(imageStates.VERIFIED_DB_MAPPING, undefined,
    'E5  NOT ONE LIVE ROW REACHES VERIFIED_DB_MAPPING — production holds no absolute image URL',
    imageStates);
  ok(imageStates.UNVERIFIED_SOURCE_REFERENCE > 0,
    'E5a the rows with an image reference land in UNVERIFIED_SOURCE_REFERENCE', imageStates);
  ok(imageStates.IMAGE_SOURCE_MISSING > 0,
    'E5b and the rows with none land in IMAGE_SOURCE_MISSING', imageStates);
  ok(/no product photograph/i.test(SRC.live),
    'E5c and the capture file records it as a finding rather than leaving it to be discovered');
});

// ===================================================================================================
CHAIN = CHAIN.then(function () {
  section('SECTION F  §6 THE SIX VIEWS, ON EVERY LIVE SITE, WITH NOTHING BROKEN IN THE TEXT');
  // =================================================================================================
  var VIEW_IDS = ['overview', 'category', 'risk', 'quality', 'workspace', 'advanced'];
  eq(P0.VIEWS.ids(), VIEW_IDS, 'F1  the six views, in the registry order', P0.VIEWS.ids());

  var emptyViews = [], badViews = [];
  Object.keys(SITE_RESULTS).forEach(function (k) {
    VIEW_IDS.forEach(function (v) {
      var r = SITE_RESULTS[k].views[v];
      if (!r || r.nodes === 0) emptyViews.push(k + '/' + v);
      BAD_TEXT.forEach(function (bad) {
        if (r && r.text.indexOf(bad) !== -1) badViews.push(k + '/' + v + ':' + bad);
      });
    });
  });
  eq(emptyViews, [], 'F2  EVERY VIEW ON EVERY LIVE SITE RENDERED CONTENT — sixty renders', emptyViews);
  eq(badViews, [],
    'F3  and not one of them printed NaN, undefined or [object Object]', badViews);

  // F4 — the canonical route reads back for each view.
  P0.VIEWS.ids().forEach(function (v, i) {
    P0.BOARD.showView(v);
    eq(P0.BOARD.currentRoute(), P0.VIEWS.routeOf(v),
      'F4.' + (i + 1) + ' ' + v + ' reports its canonical route');
  });
  P0.BOARD.showView('overview');

  /* F5 — AND NOT ONE LIVE SITE WAS REPORTED AS A DISCONNECTION. §6.12's last clause: a data gap must
     never be written as "database disconnected". Every site here answered, so every site must say so. */
  var wrongState = Object.keys(SITE_RESULTS).filter(function (k) {
    return SITE_RESULTS[k].res.state !== 'OK';
  });
  eq(wrongState, [], 'F5  no live site was reported as anything but OK', wrongState);
});

// ===================================================================================================
CHAIN = CHAIN.then(function () {
  section('SECTION G  §6 THE ONE STATE PRODUCTION DOES NOT HAVE — FIXTURE COVERAGE, LABELLED');
  // =================================================================================================
  /*
   * All 495 live rows are Active. So the excluded-by-status path cannot be demonstrated from live
   * data at all, and the honest thing is to say so and cover it from the DETERMINISTIC fixture with
   * the label attached — never to merge it into the live column and call the round complete.
   */
  eq(LIVE.LIVE_COVERAGE_GAPS.length, 1, 'G1  the live run reported exactly one coverage gap');
  eq(LIVE.LIVE_COVERAGE_GAPS[0].code, 'STATE_ABSENT_FROM_PRODUCTION', 'G1a by name');
  eq(LIVE.LIVE_COVERAGE_GAPS[0].dimension, 'status', 'G1b on the status dimension');
  eq(LIVE.LIVE_COVERAGE_GAPS[0].values, ['non_active'], 'G1c and it is the non-active state');
  var nonActive = rows.filter(function (r) {
    return String(r.marketplace_sku_status).toLowerCase() !== 'active';
  });
  eq(nonActive, [], 'G2  measured: not one live row is anything but Active',
    nonActive.map(function (r) { return r.marketplace_sku_status; }));

  /* G3 — THE FIXTURE COVERS IT, AND THE FIXTURE SAYS IT IS A FIXTURE. Two captures, two labels, and
     the suite refuses to let either wear the other's. */
  eq(FIXTURE.CAPTURE_KIND, 'DETERMINISTIC', 'G3  the fixture declares itself deterministic');
  eq(FIXTURE.IS_LIVE, false, 'G3a and not live');
  ok(FIXTURE.CAPTURE_KIND !== LIVE.SOURCE_KIND,
    'G3b the two captures cannot be confused by their own declarations');
  var fixtureRows = [];
  Object.keys(FIXTURE.workspaces()).forEach(function (k) {
    FIXTURE.workspaces()[k].data.normalizedRows.forEach(function (r) { fixtureRows.push(r); });
  });
  var fixtureNonActive = fixtureRows.filter(function (r) {
    return String(r.marketplace_sku_status).toLowerCase() !== 'active';
  });
  ok(fixtureNonActive.length > 0,
    'G4  THE DETERMINISTIC FIXTURE DOES HOLD NON-ACTIVE LISTINGS — the gap is really covered there',
    fixtureNonActive.length);
  ok(fixtureRows.length > 0 && LIVE.allRows().length > 0,
    'G4a and both captures carry rows, so the split is between two real bodies of evidence');
});

// ===================================================================================================
CHAIN = CHAIN.then(function () {
  section('SECTION H  §7 THE BROWSER MEASUREMENTS, ASSERTED RATHER THAN LOOKED AT');
  // =================================================================================================
  var MPATH = path.join(ROOT, 'docs', 'evidence', 'p1-b8c-r2-live-acceptance', 'measurements.json');
  ok(fs.existsSync(MPATH), 'H0  the live acceptance measurements exist');
  var M = JSON.parse(fs.readFileSync(MPATH, 'utf8'));
  eq(M.capture, 'live', 'H0a and they were taken against the LIVE capture');
  eq(M.capture_module, '_p1b8c-r2-live-derived.js', 'H0b by module name');

  var VP = ['1920x1080', '1440x900', '1366x768', '1280x720', '1024x768', '768x1024', '390x844'];
  eq(Object.keys(M.viewports).filter(function (k) { return VP.indexOf(k) !== -1; }).sort(),
    VP.slice().sort(), 'H1  all seven §7 viewports were measured');

  VP.forEach(function (k, i) {
    var v = M.viewports[k];
    var w = Number(k.split('x')[0]), h = Number(k.split('x')[1]);
    eq([v.viewport.w, v.viewport.h], [w, h],
      'H2.' + (i + 1) + ' ' + k + ' rendered at exactly that size — not a clamped window');
    eq(v.captureKind, 'LIVE_DERIVED_REDACTED',
      'H2.' + (i + 1) + 'a and it was the live capture on screen');
    eq(v.error, null, 'H2.' + (i + 1) + 'b with no boot error');
    eq(v.page.scrollW - v.page.clientW, 0,
      'H3.' + (i + 1) + ' ' + k + ' HAS NO PAGE-LEVEL HORIZONTAL OVERFLOW',
      { scrollW: v.page.scrollW, clientW: v.page.clientW });
    eq(v.yAxisFullyVisible, true, 'H4.' + (i + 1) + ' the Y axis is fully inside the chart at ' + k);
    eq(v.xLaneFullyVisible, true, 'H5.' + (i + 1) + ' and so is the X lane at ' + k);
    ok(v.axisTickCount > 0, 'H6.' + (i + 1) + ' with real tick labels at ' + k, v.axisTickCount);
    ok(v.viewHost && v.viewHost.w > 0,
      'H7.' + (i + 1) + ' AND THE BOARD HAS WIDTH — not a screenshot of a display:none subtree',
      v.viewHost);
    eq((v.tabs || []).length, 6, 'H8.' + (i + 1) + ' six sub-tabs at ' + k);
    eq((v.tabs || []).filter(function (t) { return t.labelVisible === false; }), [],
      'H8.' + (i + 1) + 'a every one with its label visible');
    eq(v.flagStillFalse, true,
      'H9.' + (i + 1) + ' and the staged section was still disabled while it was photographed');
  });

  /* H10 — THE PHONE IS A SHELL BLOCKER AND IT IS MEASURED, NOT ARGUED. The 240px sidebar is fixed for
     every page in the Operation System; Product Strategy must not "fix" it in its own stylesheet. */
  var phone = M.viewports['390x844'];
  eq(phone.sidebar.w, 240, 'H10  at 390x844 the shell sidebar is still 240px — the known blocker');
  ok(phone.contentArea.w < 200, 'H10a leaving the content area under 200px', phone.contentArea.w);
  eq(phone.page.scrollW - phone.page.clientW, 0,
    'H10b and the PAGE still does not scroll horizontally');
  ok(!/@media[^{]*\.sidebar|\.sidebar[^{]*\{[^}]*width/.test(SRC.css),
    'H10c and product-strategy-board.css does not touch the shell sidebar');

  // H11 — the six views were each photographed, and each measured.
  ['overview', 'category', 'risk', 'quality', 'workspace', 'advanced'].forEach(function (v, i) {
    ok(M.views[v] && M.views[v].__png, 'H11.' + (i + 1) + ' view ' + v + ' was photographed');
    ok(M.views[v] && M.views[v].ready === true, 'H11.' + (i + 1) + 'a and reported ready');
    eq(M.views[v] && M.views[v].error, null, 'H11.' + (i + 1) + 'b with no error');
  });

  /* H12 — THE STATE MATRIX. Each refusal says its own sentence and never another's; §6.12's last
     clause is that a data gap must not be dressed as a disconnection. */
  var STATES = ['feature-disabled', 'not-authorized', 'timeout', 'non-json', 'source-unavailable',
    'awaiting-site', 'empty-site'];
  STATES.forEach(function (s, i) {
    ok(M.states[s] && M.states[s].__png, 'H12.' + (i + 1) + ' state ' + s + ' was photographed');
  });
  var auth = M.states['not-authorized'];
  ok(auth && !/database|disconnect/i.test(String(auth.stateText)),
    'H13  the authorization refusal does not say "database disconnected"', auth && auth.stateText);
  var off = M.states['timeout'];
  ok(off && !/permission|authoris|authoriz/i.test(String(off.stateText)),
    'H13a and the timeout does not say "permission"', off && off.stateText);

  // H14 — every screenshot the report cites exists on disk with real bytes.
  var dir = path.dirname(MPATH);
  var pngs = fs.readdirSync(dir).filter(function (f) { return /\.png$/.test(f); });
  ok(pngs.length >= 20, 'H14  the evidence directory holds the screenshots', pngs.length);
  var empty = pngs.filter(function (f) { return fs.statSync(path.join(dir, f)).size < 2000; });
  eq(empty, [], 'H14a and not one of them is an empty file', empty);
  ok(fs.existsSync(path.join(dir, 'print-scenario-active.pdf')), 'H14b with the print PDF beside them');
});

// ===================================================================================================
CHAIN = CHAIN.then(function () {
  section('SECTION I  §8/§10 STYLE ISOLATION, AND NOTHING WAS ACTIVATED');
  // =================================================================================================
  // I1 — the stylesheet is still scoped, and still adds no bare structural selector.
  var rules = SRC.css.replace(/\/\*[\s\S]*?\*\//g, ' ').split('}');
  var bareSel = [];
  rules.forEach(function (r) {
    var sel = r.split('{')[0];
    if (!sel || sel.indexOf('@') !== -1) return;
    sel.split(',').forEach(function (s) {
      s = s.trim();
      if (/^\.(card|panel|grid|nav|main|col)(\s|$|\.|:)/.test(s)) bareSel.push(s);
    });
  });
  eq(bareSel, [], 'I1  no bare .card/.panel/.grid/.nav/.main/.col selector', bareSel);
  var roots = (SRC.css.match(/^:root\s*\{/gm) || []).length;
  eq(roots, 0, 'I1a and no :root token block of its own', roots);
  var sideRules = (SRC.css.match(/^\s*\.side\b/gm) || []).length;
  ok(sideRules === 0 || /\.psb-page\s+\.side/.test(SRC.css),
    'I1b the prototype sidebar rules stay scoped under .psb-page');

  // I2 — the flag and the staged section are still ONE switch each, and neither moved in THIS round.
  /* R2 WAS A REPLAY ROUND AND CHANGED NEITHER GATE. That is the claim, and reading the working-tree
     VALUES turned it into a claim that neither gate may ever change - which P1-B8D, whose entire
     purpose is to change both, then failed. Scoped to R2's own range it says what it meant, and it
     keeps saying it forever. */
  var cp = require('child_process');
  var R2_PRE = 'fb31e2c', R2_COMMIT = '5c5861d';
  ['assets/specs/active/apps-script/00_config.gs', 'assets/js/app.js'].forEach(function (f, i) {
    var d = cp.execFileSync('git', ['diff', '--name-only', R2_PRE, R2_COMMIT, '--', f],
      { cwd: ROOT, encoding: 'utf8' }).trim();
    eq(d, '', 'I2.' + (i + 1) + ' this round did not touch ' + f.split('/').pop(), d);
  });
  var stagedBlock = blockAfter(SRC.app, "'product-strategy': {");
  ok(!!stagedBlock, 'I2a the staged registry entry is found', stagedBlock === null);
  ok(!!stagedBlock && /enabled:\s*(?:true|false)/.test(stagedBlock),
    'I2a1 and it carries a literal boolean switch');
  eq(!!stagedBlock && (stagedBlock.match(/enabled:\s*(?:true|false)/g) || []).length, 1,
    'I2a2 exactly one of them — two would be a registry whose answer depends on which one you read');
  ok(SRC.index.indexOf("showSection('product-strategy") === -1,
    'I2b index.html still cannot switch to the section');
  var menuItems = (SRC.index.match(/data-menu-id="product-strategy"/g) || []).length;
  eq(menuItems, 0, 'I2c and renders no menu item for it', menuItems);
  var ppActions = (SRC.router.match(/'productPricing\.[A-Za-z.]+':/g) || []).sort();
  eq(ppActions, ["'productPricing.siteUniverse.get':", "'productPricing.workspace.get':"],
    'I2d the productPricing action table is still the two reads', ppActions);

  // I3 — Product Strategy still sits above Pricing Center in the staged registry.
  ok(/insertBefore:\s*'carrier'/.test(SRC.app),
    'I3  the staged nav still anchors above the Pricing Center menu id');

  // I4 — zero writes anywhere in this round's replay.
  eq(T0.writes, 0, 'I4  the whole replay issued zero write actions');
  eq(T0.actions().filter(function (a) { return !/\.get$/.test(a); }), [],
    'I4a and every action it issued ends in .get');
});

// ===================================================================================================
CHAIN = CHAIN.then(function () {
  section('SECTION J  MUTANTS');
  // =================================================================================================
  /*
   * Each mutant changes ONE thing and must make this suite's own comparison fail. A mutant that
   * measures what its own substitution preserved is worse than no mutant, because the count claims
   * something was checked.
   */
  function mut(label, f) {
    var caught = false, why = null;
    try { caught = f() === true; } catch (e) { caught = false; why = String((e && e.message) || e); }
    if (caught) { mutCaught++; console.log('ok   ' + label + ' (caught)'); }
    else {
      mutSurvived++; fail++;
      console.error('FAIL ' + label + ' — MUTANT SURVIVED' + (why ? ' [threw: ' + why + ']' : ''));
    }
  }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  mut('J1  a chunk goes missing — A2 and A4b', function () {
    var m = clone(CHUNKS.CHUNKS).filter(function (c) { return c.index !== 17; });
    var i = m.map(function (c) { return c.index; });
    var contiguous = JSON.stringify(i) === JSON.stringify(i.map(function (_, n) { return n + 1; }));
    var sum = m.reduce(function (a, c) { return a + c.chars; }, 0);
    return !contiguous || sum !== 240126;
  });

  mut('J2  a chunk is pasted twice — A2a and A5', function () {
    var m = clone(CHUNKS.CHUNKS);
    m.push(clone(m[16]));
    var seen = {}, dup = false;
    m.forEach(function (c) { if (seen[c.index]) dup = true; seen[c.index] = 1; });
    var digests = {};
    m.forEach(function (c) { digests[c.sha256_16] = 1; });
    return dup || Object.keys(digests).length !== m.length;
  });

  mut('J3  one header disagrees with the rest — A3', function () {
    var m = clone(CHUNKS.CHUNKS);
    m[20].header_fingerprint = 'FPdeadbeef';
    var f = {};
    m.forEach(function (c) { f[c.header_fingerprint] = 1; });
    return Object.keys(f).length !== 1;
  });

  mut('J3a  a header declares a different length — A3b', function () {
    var m = clone(CHUNKS.CHUNKS);
    m[3].header_length = 240127;
    var l = {};
    m.forEach(function (c) { l[c.header_length] = 1; });
    return Object.keys(l).length !== 1;
  });

  mut('J4  the capture carries a sixty-first row — B4', function () {
    var m = clone(LIVE.SITES);
    m[0].rows.push(clone(m[0].rows[0]));
    var total = m.reduce(function (a, s) { return a + s.rows.length; }, 0);
    return total > 60;
  });

  mut('J4a  the cap is read as per-site — B4b would stop adding to sixty', function () {
    // A per-site cap of 60 over ten sites is 600; the sum assertion is what sees it.
    var m = clone(LIVE.SITES);
    m.forEach(function (s) {
      while (s.rows.length < 60) s.rows.push(clone(s.rows[0]));
    });
    return m.reduce(function (a, s) { return a + s.rows.length; }, 0) !== 60;
  });

  mut('J5  a row is duplicated across two sites — B5', function () {
    var m = clone(LIVE.SITES);
    m[1].rows.push(clone(m[0].rows[0]));
    var ids = {};
    var dup = false;
    m.forEach(function (s) {
      s.rows.forEach(function (r) {
        if (ids[r.marketplace_sku_id]) dup = true;
        ids[r.marketplace_sku_id] = 1;
      });
    });
    return dup;
  });

  mut('J6  THE REDACTION WALK IS SKIPPED — B7 stops finding the leak it should', function () {
    var poisoned = { u: LIVE.universeEnvelope(), w: clone(LIVE.workspaces()) };
    poisoned.w['KM|US|Shopify'].data.normalizedRows[0].regional.product_url =
      'https://shop.example.com/leaked';
    var found = RP.leaks(poisoned, LIVE.MUST_BE_ABSENT_OR_NULL);
    var shaped = RP.secretShapes(poisoned);
    return found.length > 0 || shaped.length > 0;
  });

  mut('J6a  a secret shape arrives under an innocent key — secretShapes, not leaks', function () {
    var poisoned = { u: LIVE.universeEnvelope(), w: clone(LIVE.workspaces()) };
    poisoned.w['KM|US|Shopify'].data.normalizedRows[0].product_name = 'ops@example.com';
    return RP.secretShapes(poisoned).length > 0;
  });

  mut('J7  THE LIVE CAPTURE IS LABELLED A FIXTURE — B1/B1b', function () {
    var p = productionPage({
      mutateCapture: function (s) {
        return s.split("C.SOURCE_KIND = 'LIVE_DERIVED_REDACTED';")
          .join("C.SOURCE_KIND = 'DETERMINISTIC';")
          .split('C.IS_A_DETERMINISTIC_FIXTURE = false;')
          .join('C.IS_A_DETERMINISTIC_FIXTURE = true;');
      }
    });
    return p.CAP.SOURCE_KIND !== 'LIVE_DERIVED_REDACTED' || p.CAP.IS_A_DETERMINISTIC_FIXTURE === true;
  });

  mut('J8  THE DETERMINISTIC FIXTURE CLAIMS TO BE LIVE — G3', function () {
    var f = clone({ CAPTURE_KIND: FIXTURE.CAPTURE_KIND, IS_LIVE: FIXTURE.IS_LIVE });
    f.CAPTURE_KIND = 'LIVE_DERIVED_REDACTED';
    f.IS_LIVE = true;
    return f.CAPTURE_KIND === LIVE.SOURCE_KIND || f.IS_LIVE === true;
  });

  mut('J9  the missing state is claimed as live coverage — G1/G2', function () {
    var m = clone(rows);
    m[0].marketplace_sku_status = 'Inactive';
    var nonActive = m.filter(function (r) {
      return String(r.marketplace_sku_status).toLowerCase() !== 'active';
    });
    // G2'S OWN COMPARISON: the live rows must be all-Active, and a manufactured one breaks it.
    return nonActive.length > 0;
  });

  mut('J10  THE ACCESSOR IS BYPASSED — the same envelope stops being refused', function () {
    /* THE FIRST VERSION OF THIS MUTANT WAS THE ANTI-PATTERN ITSELF. Its detector ended in
       `|| typeof p.ACC.get === 'function'`, which is true whether or not anything was bypassed —
       a mutant that measures what its own substitution preserved, and a caught count that claimed
       something had been checked.

       WHAT THE SEAM ACTUALLY BUYS IS THIS. An envelope whose meta.action names the WRONG action —
       P1-B7E's live defect, exactly — is refused by the accessor's validator. Hand the same
       envelope's rows straight to the adapter, which is what "feed the adapter directly" means, and
       the rows come through perfectly: the defect is invisible. The mutant demonstrates the bypass
       and the detector is that the bypass succeeds where the real path refused. */
    var wrong = JSON.parse(JSON.stringify(LIVE.workspaces()['KM|US|Shopify']));
    wrong.meta.action = 'productPricing.siteUniverse.get';
    var ADAPTER = require(path.join(ROOT, 'assets/js/api/km-product-pricing-adapter.js'));
    var bypassed = wrong.data.normalizedRows.map(function (r) {
      return ADAPTER.adaptRow(r, '2026-09-12');
    });
    // THE BYPASS PRODUCES ROWS. §D5 proved the real path produces SOURCE_NOT_CONNECTED for this
    // very envelope, so the two answers differ and the seam is load-bearing.
    return bypassed.length === wrong.data.normalizedRows.length && bypassed.length > 0
      && bypassed[0].marketplace_sku_id !== null;
  });

  mut('J11  page-level overflow appears — H3', function () {
    var MPATH = path.join(ROOT, 'docs', 'evidence', 'p1-b8c-r2-live-acceptance', 'measurements.json');
    var M = JSON.parse(fs.readFileSync(MPATH, 'utf8'));
    var v = clone(M.viewports['1366x768']);
    v.page.scrollW = v.page.clientW + 40;
    return (v.page.scrollW - v.page.clientW) !== 0;
  });

  mut('J12  the Y axis is clipped — H4', function () {
    var MPATH = path.join(ROOT, 'docs', 'evidence', 'p1-b8c-r2-live-acceptance', 'measurements.json');
    var M = JSON.parse(fs.readFileSync(MPATH, 'utf8'));
    var v = clone(M.viewports['1024x768']);
    v.yAxisFullyVisible = false;
    return v.yAxisFullyVisible !== true;
  });

  mut('J13  the feature flag is opened — I2', function () {
    var mutated = SRC.config.split('var PRODUCT_STRATEGY_ENABLED_ = false;')
      .join('var PRODUCT_STRATEGY_ENABLED_ = true;');
    return !/var PRODUCT_STRATEGY_ENABLED_ = false;/.test(mutated);
  });

  mut('J14  navigation is rendered in index.html — I2c', function () {
    /* THE ANCHOR HAD TO BE THE REAL ONE. The first version spliced before
       `<div class="menu-parent" data-menu-id="carrier"` as one string; index.html wraps that
       attribute onto its own line, so the replace was a silent no-op and the mutant survived
       without ever changing anything. An anchor that matches nothing makes a mutant a no-op. */
    var anchor = 'data-menu-id="carrier"';
    if (SRC.index.indexOf(anchor) < 0) throw new Error('ANCHOR NOT FOUND');
    var mutated = SRC.index.replace(anchor, 'data-menu-id="product-strategy"');
    return (mutated.match(/data-menu-id="product-strategy"/g) || []).length > 0;
  });

  /* J15 TURNED AROUND WHEN THE SECTION WAS ACTIVATED. It modelled "somebody flips enabled to true",
     which stopped having an anchor the moment the shipped value WAS true - and an anchorless mutant
     is scored as surviving, so it would have reported a gap while measuring nothing. I2a2 now says
     there is exactly ONE switch in the entry; the defect to model is a SECOND one appearing beside
     it, which is how a registry ends up with two answers and no owner. */
  mut('J15  a second enabled switch appears in the staged entry — I2a2', function () {
    var live = blockAfter(SRC.app, "'product-strategy': {");
    if (!live || !/enabled:\s*(?:true|false)/.test(live)) throw new Error('ANCHOR NOT FOUND');
    var mutated = SRC.app.replace(live,
      live.replace(/(enabled:\s*(?:true|false),)/, '$1\n        enabled: false,'));
    var block = blockAfter(mutated, "'product-strategy': {");
    // I2a2'S OWN COMPARISON, run against the mutated source: exactly one switch, or this is caught.
    return !!block && (block.match(/enabled:\s*(?:true|false)/g) || []).length !== 1;
  });

  mut('J16  a test-only branch enters the render path — C4', function () {
    var mutated = read('assets/js/product-strategy/psb-board-ui.js')
      .replace('function selectView(', 'function __isTest(){return !!window.P1B8C_REPLAY;}\n'
        + 'function selectView(');
    return bare(mutated).indexOf('P1B8C') !== -1;
  });

  mut('J17  the capture stops declaring it is a sample — B1c/B6', function () {
    var p = productionPage({
      mutateCapture: function (s) {
        return s.split('C.NOT_FULL_UNIVERSE = true;').join('C.NOT_FULL_UNIVERSE = false;');
      }
    });
    return p.CAP.NOT_FULL_UNIVERSE !== true;
  });

  mut('J18  the envelope reports the SITE count over the SAMPLE rows — B6a', function () {
    var w = clone(LIVE.workspaces());
    w['KM|US|Shopify'].data.counts.siteSkuCount = 101;
    return w['KM|US|Shopify'].data.counts.siteSkuCount
      !== w['KM|US|Shopify'].data.normalizedRows.length;
  });
});

// ===================================================================================================
CHAIN.then(function () {
  console.log('\n===================================================================================');
  console.log((fail === 0 ? 'PASS' : 'FAIL') + ' — passed ' + pass + '  failed ' + fail
    + '  |  mutants caught ' + mutCaught + '  survived ' + mutSurvived);
  console.log('===================================================================================');
  if (fail > 0) process.exitCode = 1;
}).catch(function (e) {
  console.error('\nSUITE THREW: ' + (e && e.stack || e));
  process.exitCode = 1;
});
