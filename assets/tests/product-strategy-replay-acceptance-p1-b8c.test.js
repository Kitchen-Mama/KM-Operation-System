/**
 * ==================================================================================================
 * PRODUCT STRATEGY — REPLAY THROUGH THE PRODUCTION CHAIN, AND THE CAPTURE THAT COULD NOT BE TAKEN
 * (P1-B8C)
 * ==================================================================================================
 *
 * THE ROUND'S FIRST ANSWER IS A STOP, AND §A IS WHERE IT IS PROVED RATHER THAN ASSERTED.
 *
 * §3 asks for a read-only capture of the production workspace response through the existing readback.
 * It cannot be taken, for two reasons that compose:
 *
 *   1. THE WIRE CANNOT PRODUCE ONE. `PRODUCT_STRATEGY_ENABLED_` is false — which §2 forbids changing —
 *      so the deployed endpoint answers FEATURE_DISABLED with dbOpened:false and tablesRead:0. That is
 *      not a guess: `_p1b7f-exec-capture-r10.js` is the live body, read by HTTPS on 2026-09-12.
 *   2. THE EDITOR PATH DISCARDS THE ROWS. `RUN_P1_PRODUCT_STRATEGY_PRODUCTION_READBACK()` does reach
 *      the pure builder legitimately, and `p1b3SitePass_` DOES call `ppwWorkspaceBuild_` for every
 *      site — then tallies `data.normalizedRows` into class counts and throws the rows away. The
 *      file's own contract says why: "It never reports a price, a cost, a margin, a URL, a customer."
 *
 * So the fields a renderer needs — identity, the three prices, currency, image availability, status,
 * per-row data quality — have never left the server. STOP_EXISTING_READBACK_INSUFFICIENT, and §3 says
 * to propose the minimum augmentation rather than build a live bypass. §A pins both halves of that
 * finding to the files, so it cannot rot into a claim.
 *
 * --------------------------------------------------------------------------------------------------
 * WHAT THE ROUND BUILT INSTEAD, AND WHY IT IS WORTH HAVING BEFORE THE DATA ARRIVES
 *
 * The machine that consumes a capture, proven end to end on data that says what it is. §5's chain runs
 * for real here — a capture goes in at `KM.api.transport.post`, the ONE substitution §5 permits, and
 * everything above it is shipped code: the accessor and its validator, the pricing adapter, the live
 * adapter, the selectors, the board, the production partial.
 *
 * THAT SEAM IS CHOSEN, NOT CONVENIENT. P1-B7E's live defect lived in the accessor's response
 * validator: the deployed envelope said `productPricing.workspace.get` for a siteUniverse response and
 * was refused as RESPONSE_ACTION_MISMATCH, while every suite stayed green because every suite handed
 * the ADAPTER rows it had built itself. A harness that starts below the validator cannot find the one
 * class of defect a replay round exists for.
 *
 * REALMS. The capture is loaded INTO the sandbox rather than required from Node, because
 * `instanceof Array` is realm-scoped and the accessor's shape check is written with it. A Node-realm
 * envelope is refused by production code that would accept it in a browser — which is a property of
 * the harness, not of the page, and getting it wrong would have made this suite test a rejection path
 * all day while reporting it as a contract failure.
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
function bare(src) {
  src = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  src = src.split('\n').map(function (l) { return l.split('//')[0]; }).join('\n');
  return src.replace(/'(?:\\.|[^'\\\n])*'/g, "''").replace(/"(?:\\.|[^"\\\n])*"/g, '""');
}

var SRC = {
  index: readRoot('index.html'),
  app: read(path.join(JS, 'app.js')),
  partial: readRoot('assets/html/pages/product-strategy-board.html'),
  css: readRoot('assets/css/product-strategy-board.css'),
  page: read(path.join(JS, 'pages', 'product-strategy-board.js')),
  accessor: read(path.join(JS, 'api', 'km-product-pricing-workspace.js')),
  board: read(path.join(JS, 'product-strategy', 'psb-board-ui.js')),
  capture: readRoot('assets/tests/_p1b8c-capture.js'),
  replay: readRoot('assets/tests/_p1b8c-replay.js'),
  readback: readRoot('assets/tools/apps-script-diagnostics/TEMP_P1_PRODUCT_STRATEGY_PRODUCTION_READBACK.gs'),
  config: readRoot('assets/specs/active/apps-script/00_config.gs'),
  manifest: readRoot('docs/planning/P1_B8C_LIVE_READBACK_AND_ACTIVATION_MANIFEST.md')
};

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
 * A MUTANT IS A CLAIM THAT A RULE IS LOAD-BEARING, AND IT MUST BE ABLE TO WAIT.
 *
 * Half the rules in this suite are only observable after a Promise resolves — the render chain is
 * asynchronous from the socket up. A detector that returned a Promise to a synchronous `=== true`
 * check reported SURVIVED every time, which is the worst failure mode available: six mutants that
 * looked like a finding and were a harness defect. `mut` now returns a promise and the runner awaits
 * every one of them.
 *
 * The anchor must still appear exactly once. An anchor that matches zero times makes the swap a
 * silent no-op and the mutant dies for a reason that has nothing to do with the rule.
 */
var MUTANTS = [];
function mut(label, file, anchor, replacement, detect) {
  var p = mutRun(label, file, anchor, replacement, detect);
  MUTANTS.push(p);
  return p;
}
function mutRun(label, file, anchor, replacement, detect) {
  var src = SRC[file];
  var n = src.split(anchor).length - 1;
  if (n !== 1) {
    mutSurvived++; console.log('  MUTANT ANCHOR ' + n + 'x (not 1) — ' + label);
    return Promise.resolve();
  }
  var mutated = src.split(anchor).join(replacement);
  if (mutated === src) {
    mutSurvived++; console.log('  MUTANT NO-OP — ' + label);
    return Promise.resolve();
  }
  return Promise.resolve()
    .then(function () { return detect(mutated); })
    .then(function (v) { return v === true; }, function () { return true; })
    .then(function (caught) {
      if (caught) { mutCaught++; console.log('  mutant caught — ' + label); }
      else { mutSurvived++; console.log('  MUTANT SURVIVED — ' + label); }
    });
}

// ===================================================================================================
// THE PRODUCTION PAGE, IN ONE SANDBOX
// ===================================================================================================
/**
 * Everything index.html loads for this page, in index.html's order, into a DOM built from the real
 * partial. `window` IS the sandbox global, because in a browser it is — and the accessor reaches for
 * `window` while the controller reaches for `globalThis`. Two objects here would put the accessor and
 * its caller on different globals, which is a fact about the harness that would look like a bug in the
 * page.
 */
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
    var src = read(path.join(JS, f));
    if (opts.mutate) src = opts.mutate(f, src);
    vm.runInContext(src, sb, { filename: f });
  });
  vm.runInContext(SRC.capture, sb, { filename: '_p1b8c-capture.js' });
  vm.runInContext(SRC.replay, sb, { filename: '_p1b8c-replay.js' });
  return {
    dom: dom, sb: sb, doc: dom.document,
    CAP: sb.P1B8C_CAPTURE, RP: sb.P1B8C_REPLAY,
    ACC: sb.KM.productPricingWorkspace,
    PAGE: sb.KM.pages.productStrategyBoard,
    BOARD: sb.PSB_BOARD
  };
}

/** Replay one site all the way to a rendered board. Resolves the controller and the transport log. */
function replaySite(p, site, opts) {
  var cap = p.RP.captureOf(p.CAP);
  var t = p.RP.install(p.sb, p.ACC, cap, opts || {});
  var c = p.PAGE.create({ document: p.doc });
  return c.loadUniverse()
    .then(function () { return c.select(site); })
    .then(function (res) { return { c: c, t: t, res: res }; });
}
function id(p, x) { return p.doc.getElementById(x); }
function tabs(p) { return id(p, 'nav').querySelectorAll('.navbtn'); }

var KM_US_AMZ = { company: 'Kitchen Mama', country: 'US', marketplace: 'Amazon' };

console.log('\n===================================================================================');
console.log('PRODUCT STRATEGY — P1-B8C  REPLAY · ACCEPTANCE · ACTIVATION MANIFEST');
console.log('===================================================================================');

// ===================================================================================================
console.log('\n=== §A  THE LIVE STATE, AND WHY THE LIVE CAPTURE COULD NOT BE TAKEN ===');
// ===================================================================================================
var LIVE_CAPTURE = require(path.join(__dirname, '_p1b7f-exec-capture-r10.js'));
(function () {
  /* THE DEPLOYMENT'S OWN ANSWER, read by HTTPS on 2026-09-12 and frozen. This is the §2 evidence and
     it is LIVE — the only live evidence this round has, and it is evidence of a refusal. */
  eq(LIVE_CAPTURE.health.product_strategy_enabled, false,
    'A1 the deployed health endpoint reports the flag FALSE');
  eq(LIVE_CAPTURE.health.db_writes, 0, 'A2 and zero database writes');
  eq(LIVE_CAPTURE.health.drive_writes, 0, 'A3 and zero Drive writes');
  eq(LIVE_CAPTURE.health.read_only, true, 'A4 and read_only');
  eq(LIVE_CAPTURE.siteUniverse.meta.refusalCode, 'FEATURE_DISABLED',
    'A5 the live siteUniverse read is REFUSED');
  eq(LIVE_CAPTURE.siteUniverse.meta.dbOpened, false, 'A6 with no database opened');
  eq(LIVE_CAPTURE.siteUniverse.meta.tablesRead, 0, 'A7 and no table read');
  eq(LIVE_CAPTURE.siteUniverse.data.site_count, 0, 'A8 and it carries no site');

  /* SO THE WIRE COULD NOT PRODUCE A POPULATED WORKSPACE, and the CAPTURE is what proves it. The
     assertions above read the captured envelope: refused, zero tables, zero sites. That is a fact
     about the deployment that answered on the day of the capture, and it stays true however the
     repository's flag reads afterwards - which is the point of capturing it. Reading the constant
     here added nothing and tied a frozen capture to a live value; P1-B8D flipped that value and the
     capture did not change at all. */
  eq(LIVE_CAPTURE.siteUniverse.meta.refused, true,
    'A9 and the deployment that answered this capture refused the read');

  /* THE OTHER HALF: the editor readback reaches the builder and DISCARDS the rows. Both facts are
     read off the tool, not remembered. */
  ok(/function RUN_P1_PRODUCT_STRATEGY_PRODUCTION_READBACK\(\)/.test(SRC.readback),
    'A10 the readback tool exists and has one entry point');
  ok(/ppwWorkspaceBuild_\(tables, req, readAt\)/.test(SRC.readback),
    'A11 and it DOES run the shipped builder for each site');
  var sitePass = /function p1b3SitePass_[\s\S]*?\n}/.exec(SRC.readback);
  ok(!!sitePass, 'A12 its per-site pass is found');
  ok(/\(data\.normalizedRows \|\| \[\]\)\.forEach/.test(sitePass[0]),
    'A13 which iterates normalizedRows');
  ok(sitePass[0].indexOf('normalizedRows:') < 0,
    'A14 AND NEVER RETURNS THEM — the rows are tallied and discarded');
  ['regular_price', 'minimum_price', 'msrp', 'product_image'].forEach(function (f, i) {
    ok(sitePass[0].indexOf(f + ':') < 0,
      'A15.' + (i + 1) + ' and no ' + f + ' is published by the site pass');
  });
  /* A16 RESTATED AT P1-B8C-R1, TWICE OVER.
     It matched the sentence on one physical line. The header was re-flowed when the file grew a second
     entry point, so `margin,` and `a URL` now sit on different lines and `.` does not cross a newline —
     THE SENTENCE DID NOT CHANGE, THE WRAP DID, and a probe that cannot tell those apart reports a
     contract as broken because a comment was re-flowed. Whitespace is normalised first.

     And the claim is now scoped. The file has TWO contracts: the census still reports no price, and the
     row-shape sample reports prices on purpose, under the USER's authorisation, with every locator
     still dropped. A14/A15 above remain the load-bearing half — they read `p1b3SitePass_` itself. */
  // THE COMMENT PREFIX IS PART OF THE WRAP. Collapsing whitespace alone leaves the ` * ` that starts
  // each continuation line sitting in the middle of the sentence, so the leader is stripped first.
  var flatRB = SRC.readback.replace(/^[ \t]*\*[ \t]?/gm, ' ').replace(/\s+/g, ' ');
  ok(flatRB.indexOf('never reports a price, a cost, a margin, a URL, a customer') !== -1,
    'A16 which is the CENSUS\'s own stated contract, not an oversight');
  ok(/RUN_P1_PRODUCT_STRATEGY_ROW_SHAPE_SAMPLE/.test(SRC.readback),
    'A16a and the file now carries the second entry point the USER authorised at P1-B8C-R1');
  ok(flatRB.indexOf('A SECOND ENTRY POINT WITH A DIFFERENT, NARROWER CONTRACT') !== -1,
    'A16b declared as a different contract rather than folded into the census\'s');

  /* THE VERDICT IS RECORDED AS A NAME, so the report and the code agree. */
  ok(/STOP_EXISTING_READBACK_INSUFFICIENT/.test(SRC.capture),
    'A17 the capture records STOP_EXISTING_READBACK_INSUFFICIENT');
  ok(/STOP_EXISTING_READBACK_INSUFFICIENT/.test(SRC.manifest),
    'A18 and so does the manifest document');
}());

// ===================================================================================================
console.log('\n=== §B  THE CAPTURE: WIRE-SHAPED, DE-IDENTIFIED, AND HONEST ABOUT WHAT IT IS ===');
// ===================================================================================================
var P0 = productionPage();
(function () {
  var CAP = P0.CAP, RP = P0.RP;
  eq(CAP.CAPTURE_KIND, 'DETERMINISTIC', 'B1 THE CAPTURE SAYS IT IS NOT LIVE');
  eq(CAP.IS_LIVE, false, 'B2 as a boolean a test can branch on');
  eq(CAP.READ_ONLY_CAPTURE, true, 'B3 it is marked READ_ONLY_CAPTURE');
  eq(CAP.NOT_LOADED_BY_PRODUCTION, true, 'B4 and NOT_LOADED_BY_PRODUCTION');

  var cap = RP.captureOf(CAP);

  /* DE-IDENTIFICATION, BY KEY AND BY SHAPE. The key walk catches a named field; the shape scan
     catches the same value smuggled under another name. A substring search would find the field
     NAMES in the file's own de-identification note — the G18 trap, five rounds running. */
  eq(RP.leaks(cap, CAP.MUST_BE_ABSENT_OR_NULL), [],
    'B5 no forbidden key carries a value anywhere in the capture');
  eq(RP.secretShapes(cap), [],
    'B6 and nothing in it has the SHAPE of a URL, a script id, an email or a sheet id');

  /* §4's KEPT FIELDS ARE ALL PRESENT, because a capture missing one is a capture that cannot drive
     the page it exists to drive. */
  var row = cap.workspaces[CAP.siteKey(CAP.SITES[0])].data.normalizedRows[0];
  ['identity', 'marketplace_sku_id', 'category', 'series', 'currency', 'regular_price',
    'minimum_price', 'msrp', 'product_image', 'marketplace_sku_status', 'missing_reasons',
    'findings', 'analysable'].forEach(function (f, i) {
    ok(Object.prototype.hasOwnProperty.call(row, f),
      'B7.' + (i + 1) + ' a captured row carries ' + f);
  });
  var env = cap.workspaces[CAP.siteKey(CAP.SITES[0])];
  ['sourceState', 'counts', 'filterOptions', 'schema', 'membership', 'pagination']
    .forEach(function (f, i) {
      ok(Object.prototype.hasOwnProperty.call(env.data, f),
        'B8.' + (i + 1) + ' and the envelope carries ' + f);
    });
  eq(env.data.schema.contract_version, CAP.CONTRACT_VERSION, 'B9 with the contract version');
  ok(typeof env.data.schema.read_at === 'string' && env.data.schema.read_at !== '',
    'B10 and a read timestamp');

  /* THE IMAGE IS A STRING OR NULL, WHICH IS WHAT 72_ SENDS, AND IT IS NEVER AN ADDRESS.
     This asserted `product_image.url === null` while the capture emitted an OBJECT — a shape the
     server has never sent. `72_` line 648 builds `image` as a URL string or null and publishes it
     as `product_image`; the pricing adapter reads it with `str(...)`, so an object would have
     arrived downstream as the string "[object Object]" and been treated as an address. */
  var rows0 = cap.workspaces[CAP.siteKey(CAP.SITES[0])].data.normalizedRows;
  var withImage = rows0.filter(function (r) { return r.product_image !== null; });
  var withoutImage = rows0.filter(function (r) { return r.product_image === null; });
  ok(withImage.length > 0, 'B11 some rows carry an image reference');
  ok(withoutImage.length > 0, 'B11a and some carry none — both states are covered');
  ok(withImage.every(function (r) { return typeof r.product_image === 'string'; }),
    'B12 and it is a STRING, the shape the server actually sends');
  ok(withImage.every(function (r) { return !/^https?:\/\//i.test(r.product_image); }),
    'B12a and never an absolute URL — §4 removes every address');
  /* THE CONSEQUENCE, STATED SO IT CANNOT BE MISTAKEN FOR AN OVERSIGHT. `A.imageStateOf` returns
     VERIFIED_DB_MAPPING only for an absolute http(s) URL, and only that state draws a photograph.
     So the photograph path is unreachable from ANY de-identified capture, live or not. §M measures
     the consequence in a browser; this pins the reason. */
  var AD = require(path.join(JS, 'api', 'km-product-pricing-adapter.js'));
  AD = AD.KM_PRODUCT_PRICING_ADAPTER || global.KM_PRODUCT_PRICING_ADAPTER || AD;
  eq(AD.imageStateOf(withImage[0]), 'UNVERIFIED_SOURCE_REFERENCE',
    'B12b so a captured image reference is UNVERIFIED — it cannot be drawn');
  eq(AD.imageStateOf(withoutImage[0]), 'IMAGE_SOURCE_MISSING',
    'B12c and an absent one is MISSING — a different state, and both are exercised');

  /* FINGERPRINTS, so a screenshot, a suite run and a report can name the same bytes. */
  var f1 = CAP.fingerprint();
  var f2 = CAP.fingerprint();
  eq(f1, f2, 'B13 the capture fingerprint is stable across calls');
  ok(/^[0-9a-f]{16}$/.test(f1), 'B14 and is a 16-hex digest');
  ok(CAP.fingerprint({ a: 1 }) !== CAP.fingerprint({ a: 2 }), 'B15 which changes when content does');

  /* THE MATRIX §7 ASKS FOR, COUNTED. */
  var comp = {}, coun = {}, mkt = {}, cur = {};
  CAP.SITES.forEach(function (s) {
    comp[s.company] = 1; coun[s.country] = 1; mkt[s.marketplace] = 1; cur[s.currency] = 1;
  });
  ok(Object.keys(comp).length >= 2, 'B16 two or more companies', Object.keys(comp));
  ok(Object.keys(coun).length >= 2, 'B17 two or more countries', Object.keys(coun));
  ok(Object.keys(mkt).length >= 2, 'B18 two or more marketplaces', Object.keys(mkt));
  ok(Object.keys(cur).length >= 2, 'B19 and more than one currency', Object.keys(cur));
  ok(CAP.CATEGORIES.length >= 3, 'B20 three or more categories');

  /* AND EVERY ROW-LEVEL CASE §7 LISTS REALLY OCCURS. A matrix that lists a case it does not contain
     is a matrix that reports coverage it does not have. */
  var all = [];
  Object.keys(cap.workspaces).forEach(function (k) {
    cap.workspaces[k].data.normalizedRows.forEach(function (r) { all.push(r); });
  });
  var cases = {
    'no image': function (r) { return r.product_image === null; },
    'an image': function (r) { return r.product_image !== null; },
    'no price': function (r) { return r.regular_price === null; },
    'a price': function (r) { return r.regular_price !== null; },
    'no msrp': function (r) { return r.regular_price !== null && r.msrp === null; },
    'an msrp': function (r) { return r.msrp !== null; },
    'no floor': function (r) { return r.regular_price !== null && r.minimum_price === null; },
    'a floor': function (r) { return r.minimum_price !== null; },
    'a promotion': function (r) { return r.campaigns.length > 0; },
    'no promotion': function (r) { return r.campaigns.length === 0; },
    'a data-quality finding': function (r) { return r.findings.length > 0; },
    'a non-active status': function (r) { return r.marketplace_sku_status !== 'active'; }
  };
  Object.keys(cases).forEach(function (name, i) {
    var n = all.filter(cases[name]).length;
    ok(n > 0, 'B21.' + (i + 1) + ' the capture contains ' + n + ' rows with ' + name);
  });
  var empty = CAP.SITES.filter(function (s) { return s.rows === 0; });
  eq(empty.length, 1, 'B22 and exactly one deliberately EMPTY site');
}());

// ===================================================================================================
console.log('\n=== §C  PRODUCTION LOADS THE CAPTURE ZERO TIMES ===');
// ===================================================================================================
(function () {
  /* LOAD PATHS, NOT PROSE — the P1-B8B correction, applied to the new file. */
  var loads = (SRC.index.match(/(?:src|href)="([^"]+)"/g) || [])
    .concat(SRC.partial.match(/(?:src|href)="([^"]+)"/g) || [])
    .map(function (t) { return /"([^"]+)"/.exec(t)[1]; });
  eq(loads.filter(function (u) { return /p1b8c/i.test(u); }), [],
    'C1 neither production document loads anything named p1b8c');
  eq(loads.filter(function (u) { return /assets\/tests\//.test(u); }), [],
    'C2 and neither loads anything from assets/tests at all');

  /* AND NO PRODUCTION MODULE REQUIRES IT. Checked on stripped source. */
  var offenders = [];
  MODULES.concat(['app.js']).forEach(function (f) {
    var b = bare(read(path.join(JS, f)));
    if (/_p1b8c|P1B8C_CAPTURE|P1B8C_REPLAY/.test(b)) offenders.push(f);
  });
  eq(offenders, [], 'C3 and no production module names the capture or the replay harness');

  /* THE CAPTURE IS NOT A FIXTURE FALLBACK EITHER: no failure path can reach it. */
  eq(P0.PAGE.CONTRACT.fixture_fallback, false, 'C4 the page still declares no fixture fallback');
  eq(P0.PAGE.CONTRACT.loads_prototype_assets, false, 'C5 and loads no prototype asset');
}());

// ===================================================================================================
console.log('\n=== §D  THE PRODUCTION RENDER CHAIN, DRIVEN FROM THE SOCKET ===');
// ===================================================================================================
var CHAIN = replaySite(P0, KM_US_AMZ).then(function (r) {
  var p = P0;
  eq(r.res.state, 'OK', 'D1 the capture renders as OK through the production chain');
  eq(r.res.mounted, true, 'D2 and the board is mounted');
  eq(r.res.row_count, 26, 'D3 carrying the site\'s 26 rows');

  /* THE SUBSTITUTION IS ONE FUNCTION AND IT IS THE SOCKET. Two requests, both reads, in the order
     the controller's contract promises: the universe first, the workspace only after a scope. */
  eq(r.t.actions(), ['productPricing.siteUniverse.get', 'productPricing.workspace.get'],
    'D4 exactly two requests, universe first — the read order is the shipped one');
  eq(r.c.requests, { siteUniverse: 1, workspace: 1 }, 'D5 and the controller counted both');

  /* EVERY LAYER REALLY RAN. Each of these is a fact only that layer can produce. */
  ok(id(p, 'view').childNodes.length > 0, 'D6 the renderer filled the chart host');
  ok(id(p, 'scope').childNodes.length > 0, 'D7 and the command bar');
  eq(tabs(p).length, 6, 'D8 with the six production tabs');
  ok(id(p, 'crumbs').textContent.indexOf('Product Strategy') >= 0, 'D9 and the crumb');
  ok(!id(p, 'psb-state-host').childNodes.length,
    'D10 and the state host is EMPTY — no refusal was written over a board that rendered');

  /* THE ACCESSOR'S VALIDATOR IS IN THE PATH, which is the seam P1-B7E's defect lived in. A wrong
     meta.action must still be refused when it arrives through this harness. */
  var p2 = productionPage();
  var cap2 = p2.RP.captureOf(p2.CAP);
  Object.keys(cap2.workspaces).forEach(function (k) {
    cap2.workspaces[k].meta.action = 'productPricing.siteUniverse.get';
  });
  var t2 = p2.RP.install(p2.sb, p2.ACC, cap2);
  var c2 = p2.PAGE.create({ document: p2.doc });
  return c2.loadUniverse().then(function () { return c2.select(KM_US_AMZ); }).then(function (res2) {
    t2.restore();
    ok(res2.state !== 'OK',
      'D11 AN ENVELOPE WITH THE WRONG meta.action IS STILL REFUSED — the validator is in the path');
    eq(res2.state, 'SOURCE_NOT_CONNECTED', 'D12 exactly as the deployed accessor refused it at P1-B7E');
  });
}).then(function () {
  /* THE SIX VIEWS EACH RENDER FROM THE SAME REPLAYED DATA. */
  var p = P0;
  var VIEWS = p.sb.PSB_VIEWS;
  VIEWS.ids().forEach(function (v, i) {
    p.BOARD.showView(v);
    ok(id(p, 'view').childNodes.length > 0,
      'D13.' + (i + 1) + ' view ' + v + ' renders content from the capture');
    eq(p.BOARD.currentRoute(), VIEWS.routeOf(v),
      'D14.' + (i + 1) + ' and reports its canonical route');
  });
  p.BOARD.showView('overview');
});

// ===================================================================================================
CHAIN = CHAIN.then(function () {
console.log('\n=== §E  THE SCOPE LADDER RE-CONVERGES, AND CANNOT CARRY A STALE OPTION ===');
// ===================================================================================================
  var p = productionPage();
  var cap = p.RP.captureOf(p.CAP);
  var t = p.RP.install(p.sb, p.ACC, cap);
  var SU = p.sb.KM_PRODUCT_STRATEGY_SITE_UNIVERSE;
  var c = p.PAGE.create({ document: p.doc });
  return c.loadUniverse().then(function () {
    var u = c.universe;
    eq(u.state, 'OK', 'E1 the universe loaded');
    eq(SU.companies(u), ['Cookware Co', 'Kitchen Mama'], 'E2 two companies, sorted');
    eq(SU.countriesFor(u, 'Kitchen Mama'), ['US', 'DE', 'CA'], 'E3 Kitchen Mama sells in three');
    eq(SU.countriesFor(u, 'Cookware Co'), ['US', 'UK'], 'E4 Cookware Co in two');
    eq(SU.marketplacesFor(u, 'Kitchen Mama', 'US'), ['Amazon', 'Shopify'],
      'E5 and US has two marketplaces');

    /* THE RULE §7 ASKS FOR: change an upper ring and the lower ones must re-converge. Shopify is a
       Kitchen Mama/US marketplace and Cookware Co/US does not have it. */
    return c.select({ company: 'Kitchen Mama', country: 'US', marketplace: 'Shopify' })
      .then(function (r1) {
        eq(r1.state, 'OK', 'E6 Kitchen Mama / US / Shopify resolves');
        eq(c.narrowed.scope.marketplace, 'Shopify', 'E7 with the marketplace chosen');
        return c.select({ company: 'Cookware Co', country: 'US', marketplace: 'Shopify' });
      })
      .then(function (r2) {
        /* A MARKETPLACE THAT THE NEW COMPANY DOES NOT HAVE MUST NOT SURVIVE THE CHANGE. */
        ok(c.narrowed.scope.marketplace !== 'Shopify',
          'E8 CHANGING THE COMPANY DROPS A MARKETPLACE THE NEW ONE DOES NOT SELL ON');
        eq(c.narrowed.cleared.indexOf('marketplace') >= 0, true,
          'E9 and it is reported as CLEARED rather than silently replaced');
        eq(c.narrowed.scope.marketplace, 'Target',
          'E10 Cookware Co / US has exactly one marketplace, so it resolves to it');
        eq(r2.state, 'OK', 'E11 and the new site loads');
        return c.select({ company: 'Cookware Co', country: 'UK', marketplace: 'Amazon' });
      })
      .then(function (r3) {
        /* THE EMPTY SITE IS A MEASUREMENT, NOT A FAILURE. */
        eq(r3.state, 'SOURCE_EMPTY', 'E12 the empty site reports SOURCE_EMPTY');
        eq(r3.may_analyse, false, 'E13 and refuses to draw');
        var host = p.doc.getElementById('psb-state-host');
        ok(host.textContent.indexOf('No products') >= 0,
          'E14 saying the source was READ and holds nothing');
        ok(host.textContent.indexOf('not connected') < 0
          && host.textContent.indexOf('Not connected') < 0,
          'E15 and NOT that it could not connect');
        t.restore();
      });
  });
});

// ===================================================================================================
CHAIN = CHAIN.then(function () {
console.log('\n=== §F  NAVIGATION AND THE SIX TABS, OVER REPLAYED DATA ===');
// ===================================================================================================
  var p = productionPage();
  return replaySite(p, KM_US_AMZ).then(function (r) {
    var VIEWS = p.sb.PSB_VIEWS;
    var t = tabs(p);
    eq(t.map(function (b) { return b.getAttribute('data-view'); }), VIEWS.ids(),
      'F1 the six tabs, in the registry order');
    eq(t.map(function (b) { return b.getAttribute('data-route'); }),
      VIEWS.ids().map(function (v) { return VIEWS.routeOf(v); }),
      'F2 each carrying its canonical route');
    eq(id(p, 'nav').getAttribute('role'), 'tablist', 'F3 the rail is a tablist');
    eq(t.map(function (b) { return b.getAttribute('tabindex'); }),
      ['0', '-1', '-1', '-1', '-1', '-1'], 'F4 one tab stop');

    /* EACH TAB REALLY CALLS ITS OWN RENDERER, checked by what lands in #view rather than by the
       handler's name. The crumb is the cheapest fact only that view produces. */
    VIEWS.VIEWS.forEach(function (v, i) {
      t[i].click();
      eq(p.BOARD.currentRoute(), VIEWS.routeOf(v.id),
        'F5.' + (i + 1) + ' clicking tab ' + i + ' selects ' + v.id);
      ok(id(p, 'crumbs').textContent.indexOf(v.label) >= 0,
        'F6.' + (i + 1) + ' and the crumb names ' + v.label);
    });

    /* KEYBOARD, over real data. */
    function key(el, k) {
      var ev = new p.dom.Event('keydown', { bubbles: true });
      ev.key = k; ev.preventDefault = function () {};
      el.dispatchEvent(ev);
    }
    tabs(p)[0].click();
    key(tabs(p)[0], 'ArrowRight');
    eq(p.BOARD.currentRoute(), 'product-strategy/category', 'F7 ArrowRight moves one view');
    key(tabs(p)[1], 'End');
    eq(p.BOARD.currentRoute(), 'product-strategy/advanced', 'F8 End goes to the last');
    key(tabs(p)[5], 'Home');
    eq(p.BOARD.currentRoute(), 'product-strategy/overview', 'F9 Home to the first');

    /* SWITCHING A VIEW DOES NOT MOVE THE PAGE. §6: no scroll jump. */
    p.dom.window.scrollTo(0, 400);
    var before = p.dom.window.scrollY;
    tabs(p)[3].click();
    eq(p.dom.window.scrollY, before, 'F10 SWITCHING A TAB DOES NOT MOVE THE SCROLL POSITION');

    /* AND THE SHELL MENU IS STILL DECLARED, STILL NOT RENDERED. */
    ok(SRC.index.indexOf('data-menu-id="product-strategy"') < 0,
      'F11 index.html still has no Product Strategy menu item');
    ok(/insertBefore: 'carrier'/.test(SRC.app), 'F12 while the placement is still declared');
    r.t.restore();
  });
});

// ===================================================================================================
CHAIN = CHAIN.then(function () {
console.log('\n=== §G  PRICE SCENARIO — IT CHANGES THE PICTURE AND WRITES NOTHING ===');
// ===================================================================================================
  var p = productionPage();
  return replaySite(p, KM_US_AMZ).then(function (r) {
    p.BOARD.showView('category');
    var toggle = id(p, 'meetingToggle');
    ok(!!toggle, 'G1 the Meeting scenario control exists');
    eq(toggle.getAttribute('aria-expanded'), 'false', 'G2 and is CLOSED by default');
    toggle.click();
    eq(id(p, 'meetingToggle').getAttribute('aria-expanded'), 'true', 'G3 it opens on click');

    var series = id(p, 'scSeries');
    ok(!!series, 'G4 the Series selector is present');
    eq(series.value, '', 'G5 with NO default series — a reach you cannot see is not a scenario');

    var apply = id(p, 'scApply');
    ok(!!apply, 'G6 Apply exists');

    /* APPLYING WITHOUT A SERIES MUST NOT HALF-APPLY. */
    var beforeBadge = id(p, 'scenarioBadge') ? id(p, 'scenarioBadge').textContent : '';
    apply.click();
    var afterBadge = id(p, 'scenarioBadge') ? id(p, 'scenarioBadge').textContent : '';
    eq(afterBadge, beforeBadge, 'G7 APPLY WITH NO SERIES CHANGES NOTHING — no half-applied state');

    /* A REAL SCENARIO. The series values come from the replayed capture, not from a fixture. */
    var opts = series.childNodes.map(function (n) { return n.value; })
      .filter(function (v) { return v !== ''; });
    ok(opts.length > 0, 'G8 the Series options come from the replayed site', opts.slice(0, 4));
    series.value = opts[0];
    series.dispatchEvent(new p.dom.Event('change', { bubbles: true }));
    var input = id(p, 'scValue');
    input.value = '19.99';
    input.dispatchEvent(new p.dom.Event('input', { bubbles: true }));
    id(p, 'scApply').click();
    var badge = id(p, 'scenarioBadge');
    ok(!!badge && /Unsaved/i.test(badge.textContent),
      'G9 a scenario is active and marked UNSAVED', badge && badge.textContent);

    /* NOTHING PERSISTED. Checked on the SOURCES, because a shim has no storage to inspect. */
    ['localStorage', 'sessionStorage', 'document.cookie', 'indexedDB', 'location.hash',
      'history.pushState'].forEach(function (n, i) {
      ok(bare(SRC.board).indexOf(n) < 0, 'G10.' + (i + 1) + ' the board never touches ' + n);
      ok(bare(SRC.page).indexOf(n) < 0, 'G11.' + (i + 1) + ' nor does the controller');
    });
    /* AND NO WRITE LEFT THE PAGE: the replay transport throws on any non-read action, so a request
       count of two after a full scenario is the proof. */
    eq(r.t.actions().filter(function (a) { return P0.RP.READ_ACTIONS.indexOf(a) < 0; }), [],
      'G12 and no non-read action was ever dispatched');
    eq(r.t.actions().length, 2, 'G13 the scenario cost ZERO additional requests');

    /* UNDO AND THE THREE RESETS EXIST AND CLEAR. */
    ['scUndo', 'scResetSeries', 'scResetSite', 'scResetAll'].forEach(function (b, i) {
      ok(!!id(p, b), 'G14.' + (i + 1) + ' ' + b + ' exists');
    });
    id(p, 'scResetAll').click();
    var badge2 = id(p, 'scenarioBadge');
    ok(!badge2 || !/Unsaved/i.test(badge2.textContent),
      'G15 Reset all scenarios clears the unsaved mark');

    /* A REBOOT RESTORES CANONICAL VALUES, because the override lives in memory and nowhere else. */
    var p2 = productionPage();
    return replaySite(p2, KM_US_AMZ).then(function (r2) {
      var b2 = p2.doc.getElementById('scenarioBadge');
      ok(!b2 || !/Unsaved/i.test(b2.textContent),
        'G16 A FRESH CONTROLLER OVER THE SAME CAPTURE HAS NO SCENARIO — a reload is the reset');
      r.t.restore(); r2.t.restore();
    });
  });
});

// ===================================================================================================
CHAIN = CHAIN.then(function () {
console.log('\n=== §H  THE STATE MATRIX, THROUGH THE PRODUCTION CONTROLLER ===');
// ===================================================================================================
  /* EVERY ROW IS DRIVEN AT THE SOCKET AND READ OFF THE RENDERED STATE HOST. §11's rule is that these
     must not be each other: offline is not timeout, timeout is not permission, auth is not
     "database disconnected", and a server refusal is not a network error. */
  var CASES = [
    { name: 'feature disabled', want: 'FEATURE_DISABLED', capability: false },
    { name: 'offline', want: 'BROWSER_OFFLINE', fail: { message: 'Failed to fetch' }, online: false },
    { name: 'timeout', want: 'SOURCE_TIMED_OUT', fail: { apiCode: 'REQUEST_TIMEOUT' } },
    { name: 'not authorized', want: 'NOT_AUTHORIZED', fail: { apiCode: 'AUTH_OR_ACCESS_HTML' } },
    { name: 'non-JSON response', want: 'RESPONSE_NOT_READABLE',
      fail: { apiCode: 'TRANSPORT_NON_JSON_RESPONSE' } },
    { name: 'source unavailable', want: 'SOURCE_NOT_CONNECTED', fail: { message: 'boom' } }
  ];
  var seen = {};
  var chain = Promise.resolve();
  CASES.forEach(function (cs) {
    chain = chain.then(function () {
      var p = productionPage();
      if (cs.online === false) { p.sb.navigator = { onLine: false }; }
      var cap = p.RP.captureOf(p.CAP);
      var t = p.RP.install(p.sb, p.ACC, cap, cs.fail ? { fail: cs.fail } : {});
      if (cs.capability === false) { p.ACC.setCapability({}); }
      var c = p.PAGE.create({ document: p.doc });
      return c.loadUniverse().then(function (res) {
        var box = p.doc.getElementById('psb-state-host');
        var headEl = box.querySelectorAll('.psb-state__headline')[0];
        seen[cs.name] = { state: res.state,
          text: box.textContent,
          headline: headEl ? headEl.textContent : '',
          requests: c.requests.siteUniverse };
        t.restore();
      });
    });
  });
  return chain.then(function () {
    CASES.forEach(function (cs, i) {
      eq(seen[cs.name].state, cs.want, 'H1.' + (i + 1) + ' ' + cs.name + ' reports ' + cs.want);
    });
    eq(seen['feature disabled'].requests, 0,
      'H2 A DISABLED FEATURE COSTS ZERO REQUESTS — it is refused before the wire');

    /* THE FOUR CONFUSIONS §11 NAMES, EACH CHECKED ON THE RENDERED TEXT. */
    ok(!/time|timed out/i.test(seen.offline.text), 'H3 OFFLINE DOES NOT SAY TIMEOUT');
    ok(!/permission|authori[sz]|sign.in/i.test(seen.timeout.text),
      'H4 TIMEOUT DOES NOT SAY PERMISSION');
    ok(!/not connected|no server answered/i.test(seen['not authorized'].text),
      'H5 AN AUTH PAGE DOES NOT SAY DATABASE DISCONNECTED — a server DID answer');
    ok(!/network|connect/i.test(seen['non-JSON response'].text),
      'H6 A NON-JSON ANSWER IS NOT REPORTED AS A NETWORK ERROR');

    /* EACH GIVES A NEXT STEP, AND THE CODE IS NAMED RATHER THAN SHOUTED.
       The first version of this asserted the code did not appear at all — which was wrong about the
       design, not about the code. `renderState` deliberately LISTS the refusal codes below the
       sentence, because P1-B2A's rule is that refusals are NAMED rather than counted: "3 problems"
       sends a reader to ask somebody, a code and a subject sends them to the row. What must not
       happen is the code being the SENTENCE — a reader meeting `RESPONSE_NOT_READABLE` as the
       headline has been told nothing. So the headline is checked, not the presence of the code. */
    CASES.forEach(function (cs, i) {
      var t = seen[cs.name].text;
      var head = seen[cs.name].headline;
      ok(t.length > 40, 'H7.' + (i + 1) + ' ' + cs.name + ' explains itself');
      ok(head.indexOf(cs.want) < 0,
        'H8.' + (i + 1) + ' and its HEADLINE is a sentence, not the code ' + cs.want, head);
      ok(/[a-z]{3}[^A-Z_]*\.$/.test(head.trim()),
        'H8b.' + (i + 1) + ' ending as a sentence ends', head);
    });

    /* NO STATE SHOWS DEMONSTRATION DATA, and the state host is where every one of them lands. */
    CASES.forEach(function (cs, i) {
      ok(!/preview|demo|sample data/i.test(seen[cs.name].text),
        'H9.' + (i + 1) + ' ' + cs.name + ' shows no demonstration data');
    });
  });
});

// ===================================================================================================
CHAIN = CHAIN.then(function () {
console.log('\n=== §I  AN INVALID CONTRACT STOPS, IT DOES NOT FALL BACK ===');
// ===================================================================================================
  var p = productionPage();
  var cap = p.RP.captureOf(p.CAP);
  Object.keys(cap.workspaces).forEach(function (k) {
    cap.workspaces[k].data.schema.contract_version = 99;
  });
  var t = p.RP.install(p.sb, p.ACC, cap);
  var c = p.PAGE.create({ document: p.doc });
  return c.loadUniverse().then(function () { return c.select(KM_US_AMZ); }).then(function (res) {
    eq(res.state, 'SCHEMA_CONTRACT_MISMATCH', 'I1 an unknown contract version STOPS');
    eq(res.mounted, false, 'I2 and no board is mounted');
    var host = p.doc.getElementById('psb-state-host');
    ok(!/preview|demo|fixture/i.test(host.textContent),
      'I3 AND NOTHING IS SUBSTITUTED — no silent fixture fallback');
    ok(id(p, 'view').childNodes.length === 0, 'I4 the chart host stays empty');
    t.restore();
  });
});

// ===================================================================================================
CHAIN = CHAIN.then(function () {
console.log('\n=== §J  ZERO WRITER REACHABILITY, AND THE CSS IS STILL CONTAINED ===');
// ===================================================================================================
  var apiDir = path.join(JS, 'api');
  var actions = {};
  fs.readdirSync(apiDir).forEach(function (f) {
    if (!/\.js$/.test(f)) return;
    (read(path.join(apiDir, f)).match(/'productPricing\.[a-zA-Z.]+'/g) || [])
      .forEach(function (a) { actions[a] = 1; });
  });
  eq(Object.keys(actions).sort(),
    ["'productPricing.siteUniverse.get'", "'productPricing.workspace.get'"],
    'J1 exactly two productPricing actions, and both are reads');

  /* THE HARNESS ITSELF REFUSES A WRITE, so "zero writes" is enforced rather than observed. */
  var p = productionPage();
  var cap = p.RP.captureOf(p.CAP);
  var t = p.RP.install(p.sb, p.ACC, cap);
  var threw = null;
  try { p.sb.KM.api.transport.post({ action: 'productPricing.workspace.upsert', payload: {} }); }
  catch (e) { threw = e; }
  ok(threw !== null, 'J2 THE REPLAY TRANSPORT THROWS on a non-read action');
  ok(/REFUSED A NON-READ ACTION/.test(threw.message), 'J3 naming what it refused');
  t.restore();

  /* CSS CONTAINMENT — re-measured because this round is the first since P1-B8B to touch the page. */
  var body = SRC.css.replace(/\/\*[\s\S]*?\*\//g, '');
  var selectors = [];
  var re = /(^|\}|\{)\s*([^{}@][^{}]*?)\s*\{/g, m;
  while ((m = re.exec(body))) {
    m[2].split(',').forEach(function (sel) {
      sel = sel.trim();
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
  eq(leaks, [], 'J4 every board selector is still scoped to .psb-page');

  /* NOTHING WAS ACTIVATED *BY THIS ROUND*, which is a claim about P1-B8C's diff and was written as
     a claim about the working tree. P1-B8D activated both gates deliberately, and both assertions
     failed while describing a correct tree. Scoped to B8C's own range they say what they meant. */
  var cp = require('child_process');
  var B8C_PRE = '24de9f5', B8C_COMMIT = '5c5861d';
  ['assets/js/app.js', 'assets/specs/active/apps-script/00_config.gs'].forEach(function (f, i) {
    var d = cp.execFileSync('git', ['diff', '--name-only', B8C_PRE, B8C_COMMIT, '--', f],
      { cwd: ROOT, encoding: 'utf8' }).trim();
    eq(d, '', 'J' + (5 + i) + ' this round did not touch ' + f.split('/').pop(), d);
  });
  return null;
});

// ===================================================================================================
CHAIN = CHAIN.then(function () {
console.log('\n=== §K  THE ACTIVATION MANIFEST ANSWERS EVERY QUESTION §12 ASKS ===');
// ===================================================================================================
  var M = SRC.manifest;
  var QUESTIONS = [
    ['commits to push', /## *A1\b/],
    ['frontend files to deploy', /## *A2\b/],
    ['Apps Script sync', /## *A3\b/],
    ['new Apps Script version', /## *A4\b/],
    ['the one flag location', /## *A5\b/],
    ['the one navigation location', /## *A6\b/],
    ['the order of operations', /## *A7\b/],
    ['how each step is verified', /## *A8\b/],
    ['the rollback order', /## *A9\b/],
    ['the fastest way back off', /## *A10\b/],
    ['proving DB writes are zero', /## *A11\b/],
    ['proving only two reads are open', /## *A12\b/],
    ['keeping the fixture out', /## *A13\b/],
    ['the cache-buster', /## *A14\b/],
    ['no other page restyled', /## *A15\b/]
  ];
  QUESTIONS.forEach(function (q, i) {
    ok(q[1].test(M), 'K1.' + (i + 1) + ' the manifest answers: ' + q[0]);
  });

  /* THE FLAG AND THE NAVIGATION EACH HAVE EXACTLY ONE LOCATION, and the manifest's claim is checked
     against the files rather than believed. */
  var flagHits = (SRC.config.match(/^var PRODUCT_STRATEGY_ENABLED_\s*=/gm) || []).length;
  eq(flagHits, 1, 'K2 PRODUCT_STRATEGY_ENABLED_ is declared in exactly one place');
  var stagedHits = (SRC.app.match(/enabled: false/g) || []).length;
  eq(stagedHits, 1, 'K3 and the staged section has exactly one enabled flag');

  /* ACTIVATION DEPENDS ON NOTHING THE SECURITY TRACK DEFERRED. */
  /* THE SECTION, NOT THE DOCUMENT. The first version of this bounded the A7 section with
     `(?=\n## |$)`, which never matched a `### ` heading — so "the A7 section" was the whole rest of
     the file, including §4's paragraph explaining which things activation does NOT depend on. It
     reported that the plan required a gateway because the plan says it does not. */
  var a7 = /\n### A7[\s\S]*?(?=\n### )/.exec(M);
  ok(!!a7, 'K4 the order-of-operations section is bounded');
  /* THE STEPS, NOT THE SECTION - AND THIS IS THE THIRD TIME THIS SESSION.
     A7 ends with "Activation depends on none of: Google Cloud, OAuth, an authentication
     gateway, Secret Manager ...", which is the plan stating the very constraint being checked.
     A probe that searches the SECTION reports that the plan requires a gateway BECAUSE the plan
     says it does not. The steps are the table rows - they are what somebody performs. */
  var steps = a7[0].split('\n').filter(function (l) { return /^\| *\d+ *\|/.test(l); });
  ok(steps.length >= 5, 'K4a the order of operations has numbered steps', steps.length);
  ['Google Cloud', 'OAuth', 'gateway', 'Secret Manager', 'Cloud Run'].forEach(function (n, i) {
    var hit = steps.filter(function (l) {
      return l.toLowerCase().indexOf(n.toLowerCase()) >= 0;
    });
    eq(hit, [], 'K4.' + (i + 1) + ' NO STEP requires ' + n);
  });
  ok(/depends on none of/i.test(a7[0]), 'K4b and the section says so in as many words');
  ok(/DEFERRED_TO_P2_A/.test(M), 'K5 and the manifest says where the security track went');

  /* IT IS A MANIFEST, NOT AN ACTION. */
  ok(/NOT EXECUTED|NOT_EXECUTED|not executed/.test(M), 'K6 the manifest states it was not executed');
  return null;
});

// ===================================================================================================
CHAIN = CHAIN.then(function () {
console.log('\n=== §M  WHAT A REAL BROWSER MEASURED — SCREENSHOTS THAT WERE CHECKED ===');
// ===================================================================================================
/**
 * §10 asks for a headless browser AND says the screenshots must be examined rather than merely
 * produced. This is the examining half: `_p1b8c-visual-runner.js` drives Chrome, and everything it
 * measured is asserted here, permanently, so a regression is a red suite rather than a picture
 * nobody looked at again.
 *
 * THE MEASUREMENTS EXIST BECAUSE THE SCREENSHOTS ALONE WERE WRONG, TWICE, AND SAID NOTHING.
 *   1. The first run mounted the controller with `create()` instead of `onMount()`, so
 *      `.module-section` never got `.active`, the whole board was `display: none`, and seven
 *      perfectly valid PNGs of a blank page were produced. `viewHost.w === 0` is what caught it.
 *   2. `--window-size=390` renders at 548 on this machine — Chrome clamps the window — so the phone
 *      column was a desktop screenshot with a phone's name on it. Framing the page in an exact-sized
 *      iframe is what fixed it, and `viewport.w === 390` is what proves it did.
 *
 * A picture cannot fail. A number can.
 */
  var MPATH = path.join(ROOT, 'docs', 'evidence', 'p1-b8c-acceptance', 'measurements.json');
  if (!fs.existsSync(MPATH)) {
    ok(false, 'M0 the browser acceptance has been run (node assets/tests/_p1b8c-visual-runner.js)');
    return null;
  }
  var M = JSON.parse(fs.readFileSync(MPATH, 'utf8'));
  ok(true, 'M0 the browser acceptance artifact exists');
  ok(/chrome|msedge/i.test(M.browser), 'M1 produced by a real browser', M.browser);

  var WANT = ['1920x1080', '1440x900', '1366x768', '1280x720', '1024x768', '768x1024', '390x844'];
  WANT.forEach(function (k, i) {
    ok(!!M.viewports[k], 'M2.' + (i + 1) + ' ' + k + ' was rendered');
  });
  ok(!!M.viewports['fullpage-1920x2400'], 'M3 and a full-page desktop capture');

  /* EVERY VIEWPORT IS THE SIZE IT CLAIMS. This is the assertion the iframe exists for. */
  WANT.forEach(function (k, i) {
    var v = M.viewports[k];
    var want = k.split('x');
    eq([v.viewport.w, v.viewport.h], [Number(want[0]), Number(want[1])],
      'M4.' + (i + 1) + ' ' + k + ' really rendered at that size');
  });

  /* AND EVERY ONE PRODUCED A PNG. */
  WANT.forEach(function (k, i) {
    ok(M.viewports[k].__png && M.viewports[k].__pngBytes > 5000,
      'M5.' + (i + 1) + ' ' + k + ' produced a screenshot', M.viewports[k].__pngBytes);
  });

  /* THE BOARD IS ACTUALLY ON THE PAGE. Defect (1) above, as a standing assertion. */
  WANT.forEach(function (k, i) {
    var v = M.viewports[k];
    ok(v.viewHost && v.viewHost.w > 0 && v.viewHost.h > 0,
      'M6.' + (i + 1) + ' ' + k + ' rendered a board with real size, not a display:none subtree',
      v.viewHost);
    eq(v.error, null, 'M6e.' + (i + 1) + ' with no error');
  });

  /* ---- §7's TWO RULES, MEASURED IN A BROWSER ---------------------------------------------------
     THE PAGE NEVER SCROLLS SIDEWAYS — including on the phone, which is the one §10 says Product
     Strategy must not make worse even though the shell cannot make it good. */
  WANT.concat(['fullpage-1920x2400']).forEach(function (k, i) {
    eq(M.viewports[k].page.horizontalOverflow, 0,
      'M7.' + (i + 1) + ' ' + k + ' NO PAGE HORIZONTAL OVERFLOW');
  });

  /* THE Y AXIS IS WHOLLY INSIDE THE CHART AT EVERY SIZE. */
  WANT.forEach(function (k, i) {
    eq(M.viewports[k].yAxisFullyVisible, true,
      'M8.' + (i + 1) + ' ' + k + ' the Y axis is fully inside the chart');
    ok(M.viewports[k].axisTickCount > 0,
      'M8t.' + (i + 1) + ' with ' + M.viewports[k].axisTickCount + ' tick labels drawn');
  });

  /* THE X LANE IS WHOLLY VISIBLE ON EVERY DESKTOP AND TABLET, AND THE CHART — NOT THE PAGE —
     SCROLLS ON THE PHONE. That is precisely §7's rule, and the phone is the only place it fires. */
  ['1920x1080', '1440x900', '1366x768', '1280x720', '1024x768', '768x1024'].forEach(function (k, i) {
    eq(M.viewports[k].xLaneFullyVisible, true,
      'M9.' + (i + 1) + ' ' + k + ' the X lane is fully visible');
    eq(M.viewports[k].chartInternalOverflow, 0,
      'M9o.' + (i + 1) + ' ' + k + ' and the chart does not need to scroll');
  });
  eq(M.viewports['390x844'].xLaneFullyVisible, false,
    'M10 at 390x844 the X lane does NOT fit');
  ok(M.viewports['390x844'].chartInternalOverflow > 0,
    'M10a so the CHART scrolls inside itself', M.viewports['390x844'].chartInternalOverflow);
  eq(M.viewports['390x844'].page.horizontalOverflow, 0,
    'M10b WHILE THE PAGE STILL DOES NOT — which is the part that is this page\u2019s to get right');

  /* ---- THE SHELL IS THE BLOCKER AT 390, MEASURED RATHER THAN ARGUED ---------------------------- */
  eq(M.viewports['390x844'].sidebar.w, 240,
    'M11 at 390x844 the shell sidebar is STILL 240px — no breakpoint touches it');
  eq(M.viewports['390x844'].contentArea.w, 150,
    'M12 so the whole content area is 150px, for every page in the application');
  ok(M.viewports['1440x900'].contentArea.w > 1000,
    'M12a where a desktop gets over a thousand', M.viewports['1440x900'].contentArea.w);

  /* ---- THE TAB LABELS SURVIVE EVERY VIEWPORT --------------------------------------------------
     P1-B8B found that `@media (max-width: 1000px)` stripped `.nav-text` off the production tabs,
     turning six labelled views into six identical glyphs on every tablet and phone. It was fixed by
     scoping the rule to the prototype sidebar. THIS is the first time that fix has been checked in a
     browser rather than in the stylesheet text. */
  WANT.forEach(function (k, i) {
    var tabs = M.viewports[k].tabs || [];
    eq(tabs.length, 6, 'M13.' + (i + 1) + ' ' + k + ' shows six tabs');
    var labelled = tabs.filter(function (t) { return t.labelVisible; }).length;
    eq(labelled, 6,
      'M14.' + (i + 1) + ' ' + k + ' AND ALL SIX LABELS ARE VISIBLE — not six anonymous icons');
  });

  /* ---- THE MENU IS ABOVE PRICING CENTER, IN A REAL LAYOUT -------------------------------------- */
  var parents = M.viewports['1440x900'].menuParents;
  var psb = null, carrier = null;
  parents.forEach(function (p) {
    if (p.id === 'product-strategy') psb = p;
    if (p.id === 'carrier') carrier = p;
  });
  ok(!!psb, 'M15 Product Strategy is in the sidebar');
  ok(!!carrier, 'M16 and so is Pricing Center');
  eq(psb.label, 'Product Strategy', 'M17 under its own name');
  eq(carrier.label, 'Pricing Center', 'M18 beside the menu the brief calls "Price Center"');
  ok(psb.y < carrier.y,
    'M19 AND PRODUCT STRATEGY IS ABOVE IT — measured in pixels, not in source order',
    { productStrategyY: psb.y, pricingCenterY: carrier.y });

  var kids = M.viewports['1440x900'].psbChildren;
  eq(kids.length, 6, 'M20 with six children');
  eq(kids.map(function (k2) { return k2.route; }),
    ['product-strategy/overview', 'product-strategy/category', 'product-strategy/risk',
      'product-strategy/quality', 'product-strategy/workspace', 'product-strategy/advanced'],
    'M21 in the canonical route order');
  ok(kids.every(function (k2) { return k2.visible; }), 'M22 and all six rendered');

  /* ---- THE SIX VIEWS EACH DREW SOMETHING DIFFERENT --------------------------------------------- */
  var VIEWS = ['overview', 'category', 'risk', 'quality', 'workspace', 'advanced'];
  VIEWS.forEach(function (v, i) {
    var mv = M.views[v];
    ok(!!mv && mv.viewHost && mv.viewHost.h > 100,
      'M23.' + (i + 1) + ' view ' + v + ' rendered content', mv && mv.viewHost);
    ok(!!mv.__png, 'M23p.' + (i + 1) + ' and was photographed');
  });
  var heights = VIEWS.map(function (v) { return M.views[v].viewHost.h; });
  ok(new Set(heights).size >= 5,
    'M24 and they are not the same page six times', heights);

  /* THE CHART IS IN CATEGORY ANALYSIS AND NOWHERE THAT DOES NOT NEED ONE. */
  ok(M.views.category.chart && M.views.category.chart.w > 300,
    'M25 Category Analysis draws a chart', M.views.category.chart);
  eq(M.views.overview.chart, null, 'M26 Executive Overview does not — it is a KPI view');

  /* THE IMAGE PATH, AND THE GAP IT LEAVES.
     `imageStateOf` calls a row VERIFIED_DB_MAPPING only for an ABSOLUTE http(s) URL, and only that
     state draws a photograph. §4 removes every URL. So the photograph path is unreachable from any
     de-identified capture — live or deterministic — and this records that as a measured fact rather
     than an omission. What IS exercised is the fallback marker, which is what a real site shows for
     every row whose image cannot be proved. */
  eq(M.views.category.imageMarkerCount, 0,
    'M27 NO PHOTOGRAPH IS DRAWN — a de-identified capture has no absolute URL to verify');
  ok(M.views.category.fallbackMarkerCount > 0,
    'M28 and every product shows its fallback marker instead',
    M.views.category.fallbackMarkerCount);
  eq(M.views.category.fallbackMarkerCount, M.views.category.laneLabelCount,
    'M29 one marker per labelled product — none is missing and none is orphaned');

  /* ---- THE STATE MATRIX, PHOTOGRAPHED AND READ BACK -------------------------------------------- */
  var STATE_WORDS = {
    'feature-disabled': /not enabled yet/i,
    'not-authorized': /cannot read/i,
    'timeout': /did not answer in time/i,
    'non-json': /not with a site list/i,
    'source-unavailable': /Not connected/i,
    'awaiting-site': /Choose a site/i,
    'empty-site': /No products are listed/i
  };
  Object.keys(STATE_WORDS).forEach(function (k, i) {
    var st = M.states[k];
    ok(!!st && !!st.__png, 'M30.' + (i + 1) + ' state ' + k + ' was photographed');
    ok(STATE_WORDS[k].test(st.stateText || ''),
      'M31.' + (i + 1) + ' and says its own sentence', (st.stateText || '').slice(0, 70));
  });

  /* THE FOUR CONFUSIONS §11 FORBIDS, CHECKED ON WHAT A BROWSER ACTUALLY PAINTED. */
  ok(!/did not answer in time/i.test(M.states['not-authorized'].stateText),
    'M32 the auth page does not say timeout');
  ok(!/Not connected|No server answered/i.test(M.states['not-authorized'].stateText),
    'M33 nor database disconnected');
  ok(!/cannot read|sign-in/i.test(M.states.timeout.stateText),
    'M34 and the timeout does not say permission');
  ok(!/network/i.test(M.states['non-json'].stateText),
    'M35 and the non-JSON answer is not a network error');

  /* NOT ONE STATE SHOWED DEMONSTRATION DATA, and each rendered a real box on the page. */
  Object.keys(STATE_WORDS).forEach(function (k, i) {
    ok(!/preview|demo data|sample data/i.test(M.states[k].stateText || ''),
      'M36.' + (i + 1) + ' ' + k + ' shows no demonstration data');
  });

  /* ---- THE SCENARIO, AND PRINT ------------------------------------------------------------------ */
  var sc = M.states['scenario-active'];
  ok(!!sc && !!sc.__png, 'M37 an active scenario was photographed');
  ok(/SCENARIO/i.test(sc.banner || ''), 'M38 and the page carries the scenario mark',
    (sc.banner || '').slice(0, 60));
  ok(/not prices the company charges/i.test(sc.banner || ''),
    'M39 saying the numbers are simulated, in words that survive being printed');
  eq(sc.page.horizontalOverflow, 0, 'M40 and applying a scenario did not push the page sideways');

  ok(!!M.print && M.print.bytes > 20000,
    'M41 a print/PDF was produced from the scenario page', M.print);

  /* TABLES SCROLL INSIDE THEMSELVES, WHICH IS §9's RULE AND THE PAGE-OVERFLOW RULE'S OTHER HALF. */
  (M.views.category.tables || []).forEach(function (t, i) {
    ok(t.scrollW <= t.clientW + 1 || t.parentOverflowX === 'auto' || t.parentOverflowX === 'scroll',
      'M42.' + (i + 1) + ' a wide table scrolls in its own container, not the page', t);
  });

  /* AND NOTHING THE BROWSER SAW WAS LIVE DATA, OR ACTIVATED. */
  eq(M.viewports['1440x900'].captureKind, 'DETERMINISTIC',
    'M43 EVERY SCREENSHOT IN THIS SET IS DETERMINISTIC — none of it is live evidence');
  ok(/^[0-9a-f]{16}$/.test(M.viewports['1440x900'].captureFingerprint || ''),
    'M44 taken from a fingerprinted capture', M.viewports['1440x900'].captureFingerprint);
  eq(M.viewports['1440x900'].flagStillFalse, true,
    'M45 and the staged flag was still false while the browser rendered it');
  return null;
});

// ===================================================================================================
CHAIN = CHAIN.then(function () {
console.log('\n=== §L  MUTANTS ===');
// ===================================================================================================
  function pageWith(file, mutated) {
    return productionPage({ mutate: function (f, src) {
      return f === file ? mutated : src;
    } });
  }

  mut('L1 the capture really declares itself non-live', 'capture',
    "C.CAPTURE_KIND = 'DETERMINISTIC';", "C.CAPTURE_KIND = 'LIVE_READBACK';", function (m) {
      var ctx = { module: { exports: {} } };
      vm.createContext(ctx);
      vm.runInContext(m, ctx, { filename: 'cap.js' });
      return ctx.P1B8C_CAPTURE.CAPTURE_KIND !== 'DETERMINISTIC';
    });

  mut('L2 the de-identification walk really reads KEYS, not the serialised text', 'replay',
    "if (forbiddenKeys.indexOf(k) >= 0 && v[k] !== null && v[k] !== undefined && v[k] !== '') {",
    "if (false) {", function (m) {
      var ctx = { module: { exports: {} } };
      vm.createContext(ctx);
      vm.runInContext(m, ctx, { filename: 'replay.js' });
      var R = ctx.P1B8C_REPLAY;
      return R.leaks({ a: { product_url: 'https://example.com/x' } }, ['product_url']).length === 0;
    });

  mut('L3 the replay really refuses a non-read action', 'replay',
    "        if (R.READ_ACTIONS.indexOf(action) < 0) {",
    "        if (false) {", function (m) {
      var ctx = { module: { exports: {} }, Promise: Promise };
      vm.createContext(ctx);
      vm.runInContext(m, ctx, { filename: 'replay.js' });
      var t = ctx.P1B8C_REPLAY.makeTransport({ universe: {}, workspaces: {} });
      /* IT MUST REFUSE BY NAME, NOT MERELY FAIL. With the guard removed the write still throws -
         further down, because there is no capture for the site key it invented. A detector that
         only asked "did it throw" was satisfied by the WRONG throw and reported the mutant as
         surviving while the rule was intact. The refusal has to be the one that names it. */
      var msg = '';
      try { t.api.transport.post({ action: 'productPricing.workspace.upsert' }); }
      catch (e) { msg = e.message; }
      return msg.indexOf('REFUSED A NON-READ ACTION') < 0;
    });

  mut('L4 the accessor validator really is in the replay path', 'capture',
    "        action: 'productPricing.workspace.get'\n      },\n      errors: []\n    };\n  };",
    "        action: 'productPricing.siteUniverse.get'\n      },\n      errors: []\n    };\n  };",
    function (m) {
      var p = productionPage();
      vm.runInContext(m, p.sb, { filename: 'cap-mut.js' });
      var cap = p.sb.P1B8C_REPLAY.captureOf(p.sb.P1B8C_CAPTURE);
      var t = p.sb.P1B8C_REPLAY.install(p.sb, p.ACC, cap);
      var c = p.PAGE.create({ document: p.doc });
      var got = null;
      return c.loadUniverse().then(function () { return c.select(KM_US_AMZ); })
        .then(function (r) { got = r.state; t.restore(); return got !== 'OK'; });
    });

  mut('L5 the workspace read really waits for a complete scope', 'page',
    "      if (!C.narrowed.complete) {", "      if (false) {", function (m) {
      var p = pageWith('pages/product-strategy-board.js', m);
      var cap = p.RP.captureOf(p.CAP);
      var t = p.RP.install(p.sb, p.ACC, cap);
      var c = p.PAGE.create({ document: p.doc });
      return c.loadUniverse().then(function () {
        t.restore();
        /* With no completeness gate the initial narrow (two companies, so nothing auto-resolves)
           would still reach for a workspace. Two requests instead of one is the tell. */
        return c.requests.workspace > 0;
      });
    });

  mut('L6 the empty site really reports SOURCE_EMPTY rather than nothing', 'capture',
    "    var state = rows.length === 0 ? 'SOURCE_EMPTY' : 'READY';",
    "    var state = 'READY';", function (m) {
      var p = productionPage();
      vm.runInContext(m, p.sb, { filename: 'cap-mut.js' });
      var cap = p.sb.P1B8C_REPLAY.captureOf(p.sb.P1B8C_CAPTURE);
      var t = p.sb.P1B8C_REPLAY.install(p.sb, p.ACC, cap);
      var c = p.PAGE.create({ document: p.doc });
      return c.loadUniverse()
        .then(function () {
          return c.select({ company: 'Cookware Co', country: 'UK', marketplace: 'Amazon' });
        })
        .then(function (r) { t.restore(); return r.state !== 'SOURCE_EMPTY'; });
    });

  /* THE TWO CSS/SOURCE MUTANTS RUN THE SECTION'S ACTUAL COMPARISON over the mutated text, because
     P1-B8A and P1-B8B each produced a mutant that measured something its own substitution had
     preserved. */
  /* AN ABSOLUTE URL IN THE CAPTURE MUST BE CAUGHT BY THE SHAPE SCAN. That is the whole
     de-identification promise for this field: a relative reference is a state, an address is a leak. */
  mut('L7 an image ADDRESS in the capture is caught as a leak', 'capture',
    "C.IMAGE_PLACEHOLDER = 'REDACTED_IMAGE_REFERENCE';",
    "C.IMAGE_PLACEHOLDER = 'https://images.example.com/CO1100-R.jpg';", function (m) {
      var ctx = { module: { exports: {} } };
      vm.createContext(ctx);
      vm.runInContext(m, ctx, { filename: 'cap.js' });
      var C = ctx.P1B8C_CAPTURE;
      var R = require(path.join(__dirname, '_p1b8c-replay.js'));
      var cap = { universe: C.universeEnvelope(), workspaces: C.workspaces() };
      return R.secretShapes(cap).length > 0;
    });

  mut('L8 the state host really carries the refusal text the matrix reads', 'page',
    "    P.renderState(host, ux, refusals || [], doc);", "", function (m) {
      var p = pageWith('pages/product-strategy-board.js', m);
      var cap = p.RP.captureOf(p.CAP);
      var t = p.RP.install(p.sb, p.ACC, cap, { fail: { apiCode: 'AUTH_OR_ACCESS_HTML' } });
      var c = p.PAGE.create({ document: p.doc });
      return c.loadUniverse().then(function () {
        var txt = p.doc.getElementById('psb-state-host').textContent;
        t.restore();
        return txt.length === 0;
      });
    });

  /* `\b` MATCHES BEFORE A HYPHEN, so renaming `A9` to `A9-REMOVED` left the detector's own regex
     still matching and the mutant "survived" while the rule it guards was intact. The mutant now
     removes the heading, and the detector runs §K's ACTUAL check over the mutated text. */
  MUTANTS.push(mut('L9 the manifest really has to answer the rollback question', 'manifest',
    '### A9 — Rollback order', '### A9x — Rollback order', function (m) {
      return !/## *A9\b/.test(m);
    }));

  return Promise.all(MUTANTS);
});

// ===================================================================================================
CHAIN.then(function () {
  console.log('\n===================================================================================');
  console.log((fail === 0 && mutSurvived === 0 ? 'PASS' : 'FAIL')
    + ' — passed ' + pass + '  failed ' + fail
    + '  |  mutants caught ' + mutCaught + '  survived ' + mutSurvived);
  console.log('===================================================================================');
  process.exitCode = (fail === 0 && mutSurvived === 0) ? 0 : 1;
}).catch(function (e) {
  console.log('\nSUITE THREW: ' + e.message);
  console.log(String(e.stack).split('\n').slice(1, 6).join('\n'));
  process.exitCode = 1;
});
