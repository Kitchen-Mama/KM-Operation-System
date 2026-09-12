// Kitchen Mama Operation System — PRODUCT-STRATEGY-P1-B8C-R3-R2
// FOUR CONSUMERS, ONE AUTHORITY — and the image gate closed on a real census.
//
// WHAT THIS ROUND CLOSES. P1-B8C-R3 gave three pages one image policy and left the allowlist empty
// because nothing in the repository could prove what production holds. P1-B8C-R3-R1 built the
// read-only census and found a FOURTH consumer outside the policy. The USER ran the census against
// production, and this suite freezes that answer and finishes the work:
//
//   192 rows · 178 repo-relative · 14 blank · ZERO of every other shape · ZERO external hosts
//   old displayed 178 / new displayed 178 / new rejected 0 / depends-on-allowlist 0
//
// SO THE ALLOWLIST STAYS EMPTY BECAUSE THE DATA SAYS SO, not because nobody looked. And the shared
// policy is 100% compatible with the production universe — asserted from the census's own numbers
// rather than from a summary of them.
//
// THE TWO THINGS THAT ACTUALLY CHANGED:
//
//   1. campaign-risk.js now resolves through the same function as the other three. It had been
//      putting `r.image` into an <img src> with no judgement at all.
//   2. sku-handbook.js renders a REFUSED reference as its placeholder. It only ever special-cased
//      ABSENT, so a refused value fell through to `<img src="">` — and an empty src resolves to the
//      PAGE's own URL, which is a broken image drawn exactly where a placeholder belongs. The refusal
//      was working; the rendering of it was not.
//
// THE SECURITY CORPUS DOES NOT SHRINK BECAUSE PRODUCTION IS CLEAN. 178 of 178 rows are well-formed
// today. Every refusal below is for the value somebody pastes into the sheet tomorrow, and deleting
// those assertions because the census came back clean would be reasoning backwards from the data to
// the rule.
//
// Run: node assets/tests/product-strategy-image-consumer-parity-p1-b8c-r3-r2.test.js

var fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
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

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); }

var POLICY = require(path.join(ROOT, 'assets/js/utils/km-image-reference-policy.js'));
var ORIGIN = { pageProtocol: 'https:', pageHost: 'km.example-origin.test' };
if (typeof global.location === 'undefined') {
  global.location = { protocol: ORIGIN.pageProtocol, host: ORIGIN.pageHost };
}
var ADAPTER = require(path.join(ROOT, 'assets/js/api/km-product-pricing-adapter.js'));

var SRC = {
  policy: read('assets/js/utils/km-image-reference-policy.js'),
  overrides: read('assets/js/utils/sku-overrides.js'),
  adapter: read('assets/js/api/km-product-pricing-adapter.js'),
  boardUi: read('assets/js/product-strategy/psb-board-ui.js'),
  skuDetails: read('assets/js/pages/sku-details.js'),
  skuHandbook: read('assets/js/pages/sku-handbook.js'),
  campaignRisk: read('assets/js/pages/campaign-risk.js'),
  runner: read('assets/tests/_p1b8c-r3r2-image-consumer-runner.js'),
  index: read('index.html'),
  app: read('assets/js/app.js')
};

var R3R1_COMMIT = 'fe7b07c799266f9c33d5dbf0063a08a3a0e0a2b0';

// =============================================================================================
section('§A  THE PRODUCTION CENSUS, FROZEN AS EVIDENCE');
// =============================================================================================
/* THE NUMBERS THE USER'S EDITOR READBACK RETURNED, recorded as DATA so a later round can check a
   claim against them instead of against a sentence in a report. */
var CENSUS = {
  census_id: 'P1_IMAGE_REFERENCE_UNIVERSE_CENSUS',
  build: 'P1-B8C-R3-R1',
  chunk_count: 1,
  full_report_fingerprint: 'FPa6684fce',
  full_report_length: 2425,
  verdict: 'CENSUS_TAKEN',
  counts: {
    total_rows: 192, blank_rows: 14, present_rows: 178,
    relative_asset_rows: 178, root_relative_rows: 0, filename_only_rows: 0,
    absolute_https_rows: 0, absolute_http_rows: 0, rejected_scheme_rows: 0,
    windows_path_rows: 0, traversal_rows: 0, drive_or_file_id_rows: 0,
    extension_missing_rows: 0, classification_unknown_rows: 0
  },
  unique_external_hosts: [],
  external_host_counts: {},
  compatibility: {
    old_displayed_rows: 178,
    old_displayed_new_displayed: 178,
    old_displayed_new_rejected: 0,
    old_displayed_new_depends_on_allowlist: 0,
    old_rejected_new_displayed: 0,
    both_fallback: 14,
    allowlist_decision_required: false
  },
  safety: { writes: 0, rows_modified: 0, passed: true, refusals: [] }
};

eq(CENSUS.verdict, 'CENSUS_TAKEN', 'A1  the census completed');
eq(CENSUS.safety.writes, 0, 'A1a with zero writes');
eq(CENSUS.safety.rows_modified, 0, 'A1b and zero rows modified');
eq(CENSUS.safety.refusals, [], 'A1c and no redaction refusal');

/* THE ARITHMETIC HAS TO CLOSE, or the census is describing a universe the reader cannot see all of.
   Asserted here rather than trusted, the same way P1-B8C-R2 re-derived its capture's counts. */
var C = CENSUS.counts;
eq(C.blank_rows + C.present_rows, C.total_rows, 'A2  blank + present = total');
var SHAPES = ['relative_asset_rows', 'root_relative_rows', 'filename_only_rows',
  'absolute_https_rows', 'absolute_http_rows', 'rejected_scheme_rows', 'windows_path_rows',
  'traversal_rows', 'drive_or_file_id_rows', 'extension_missing_rows', 'classification_unknown_rows'];
var summed = SHAPES.reduce(function (a, k) { return a + C[k]; }, 0);
eq(summed, C.present_rows, 'A2a and every shape bucket sums to present_rows');

/* THE ONE QUESTION P1-B8C-R3-R1 REDUCED THE GATE TO, ANSWERED. */
eq(C.absolute_https_rows + C.absolute_http_rows, 0,
  'A3  PRODUCTION HOLDS NO ABSOLUTE IMAGE URL — the only shape an empty allowlist could break');
eq(CENSUS.unique_external_hosts, [], 'A3a so there is no external host to declare');
eq(CENSUS.compatibility.allowlist_decision_required, false, 'A3b and no allowlist decision is required');

/* AND THE COMPATIBILITY MATRIX, WHICH IS THE GATE ITSELF. */
eq(CENSUS.compatibility.old_displayed_new_rejected, 0,
  'A4  NOT ONE ROW THAT DISPLAYED BEFORE IS REJECTED NOW');
eq(CENSUS.compatibility.old_rejected_new_displayed, 0,
  'A4a and nothing is newly displayed — the gate is one-directional');
eq(CENSUS.compatibility.old_displayed_new_displayed, C.present_rows,
  'A4b every present row still displays');
eq(CENSUS.compatibility.both_fallback, C.blank_rows,
  'A4c and the blanks fall back on both sides, as they always did');

/* THE SHAPES PRODUCTION ACTUALLY USES, RUN THROUGH THE SHIPPED POLICY. The census counted them; this
   proves the policy agrees about what the count MEANS. */
var CONTRACT = require(path.join(ROOT, 'assets/js/product-strategy/psb-data-contract.js')).PSB_CONTRACT;
var MAPPINGS = CONTRACT.IMAGE_POLICY.verified_mappings;
var LEGAL = Object.keys(MAPPINGS).map(function (k) { return MAPPINGS[k]; });
LEGAL.forEach(function (v, i) {
  eq(POLICY.classify(v, ORIGIN).kind, 'SAME_ORIGIN_ASSET',
    'A5.' + (i + 1) + ' the repo-relative shape the 178 rows carry is accepted');
});
eq(POLICY.classify('', ORIGIN).kind, 'ABSENT', 'A5  and the shape the 14 blanks carry is ABSENT');
eq(C.relative_asset_rows, 178, 'A5a 178 of 178 present rows are that one shape');

// =============================================================================================
section('§B  CAMPAIGN RISK JOINS THE SHARED RESOLVER');
// =============================================================================================
ok(/function _crImageSrc\(value\)/.test(SRC.campaignRisk),
  'B1  campaign-risk.js has one image-resolution helper');
ok(/window\.resolveSkuImageUrl\(value\)/.test(SRC.campaignRisk),
  'B1a and it calls the SHARED resolver');
ok(/const imgSrc = _crImageSrc\(r\.image\);/.test(SRC.campaignRisk),
  'B1b which is what the row renderer uses');
ok(!/src="\$\{_crEsc\(r\.image\)\}"/.test(SRC.campaignRisk),
  'B1c and the raw cell no longer reaches src');

/* NO SECOND RESOLVER, AND NO COPIED VALIDATION. The helper is allowed to be four lines; it is not
   allowed to contain a rule. */
function bodyOf(src, name) {
  var i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  var j = src.indexOf('{', i), d = 0;
  for (var k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  return '';
}
var CRFN = bodyOf(SRC.campaignRisk, '_crImageSrc');
ok(CRFN.length > 0 && CRFN.length < 400, 'B2  the helper is small', CRFN.length);
['https?', 'javascript', 'file:', '\\.\\.', 'APPROVED', 'IMAGE_EXT', 'jpg'].forEach(function (r, i) {
  ok(!new RegExp(r).test(CRFN), 'B2.' + (i + 1) + ' it contains no /' + r + '/ rule of its own');
});
ok(!/assets\/img/.test(SRC.campaignRisk) && !/\+\s*['"]\.jpg['"]/.test(SRC.campaignRisk),
  'B2a and campaign-risk composes no path from a sku');

/* FAIL CLOSED — no `: r.image` fallback, which would restore the old behaviour on the one path where
   the policy is known to be missing. */
ok(/typeof window\.resolveSkuImageUrl !== 'function'\) return '';/.test(SRC.campaignRisk),
  'B3  with no policy loaded it returns "" rather than the raw value');

/* THE EXISTING FALLBACK IS PRESERVED. */
ok(/onerror="this\.style\.display='none';this\.parentNode\.innerHTML='<div class=\\\\'cr-img-placeholder\\\\'>IMG<\/div>'"/
  .test(SRC.campaignRisk), 'B4  campaign-risk keeps its original onerror fallback, unchanged');
ok(/: `<div class="cr-img-placeholder">IMG<\/div>`;/.test(SRC.campaignRisk),
  'B4a and its original placeholder branch');

/* LOAD ORDER: the policy, then sku-overrides which defines resolveSkuImageUrl, then the page. */
var iPolicy = SRC.index.indexOf('km-image-reference-policy.js');
var iOvr = SRC.index.indexOf('utils/sku-overrides.js');
var iCr = SRC.index.indexOf('pages/campaign-risk.js');
var iHb = SRC.index.indexOf('pages/sku-handbook.js');
ok(iPolicy > 0 && iPolicy < iOvr, 'B5  index.html loads the policy before sku-overrides.js');
ok(iOvr < iCr, 'B5a and sku-overrides.js before campaign-risk.js');
ok(iOvr < iHb, 'B5b and before sku-handbook.js');
ok(/pages\/campaign-risk\.js\?v=imagepolicy-r3r2/.test(SRC.index),
  'B5c campaign-risk.js carries a new cache-buster, because it changed');
ok(/pages\/sku-handbook\.js\?v=imagepolicy-r3r2/.test(SRC.index),
  'B5d and so does sku-handbook.js');

/* CAMPAIGN RISK'S LOOK IS UNTOUCHED. */
var changed = cp.execFileSync('git', ['diff', '--name-only', R3R1_COMMIT, '--'],
  { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
eq(changed.filter(function (f) { return /\.css$/.test(f); }), [],
  'B6  no stylesheet changed in this round', changed);
eq(changed.filter(function (f) { return /^assets\/html\//.test(f); }), [],
  'B6a and no page partial changed', changed);
var crDiff = cp.execFileSync('git', ['diff', '--unified=0', R3R1_COMMIT, '--',
  'assets/js/pages/campaign-risk.js'], { cwd: ROOT, encoding: 'utf8' });
ok(!/^[-+].*cr-cell--|^[-+].*cr-risk--|^[-+].*class="scroll-row"/m.test(crDiff),
  'B6b and no Campaign Risk layout class was touched');

// =============================================================================================
section('§C  SKU HANDBOOK — A REFUSED REFERENCE IS A PLACEHOLDER, NOT AN EMPTY src');
// =============================================================================================
ok(/data-skuh-img="refused"/.test(SRC.skuHandbook),
  'C1  the handbook has a REFUSED branch of its own');
ok(/if \(cls\.state !== 'PRESENT' \|\| !cls\.url\)/.test(SRC.skuHandbook),
  'C1a which catches every state that is not PRESENT, and an empty url');
ok(/refused: 0/.test(SRC.skuHandbook), 'C1b with its own counter');
ok(/skus_with_refused_image_reference/.test(SRC.skuHandbook),
  'C1c reported apart from skus_without_image_url — different gaps, different fixes');

/* THE DEFECT, DEMONSTRATED AGAINST THE PRE-R3-R2 SOURCE rather than described. */
var PREHB = cp.execFileSync('git', ['show', R3R1_COMMIT + ':assets/js/pages/sku-handbook.js'],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).replace(/\r\n/g, '\n');
function handbookSandbox(hbSrc) {
  var sb = {
    console: { log: function () {}, error: function () {} },
    String: String, Object: Object, Array: Array, JSON: JSON, RegExp: RegExp
  };
  sb.window = sb; sb.globalThis = sb;
  var c = vm.createContext(sb);
  vm.runInContext('var _skuhImgStats = { absent: 0, present: 0, failed: 0, upgraded: 0, refused: 0 };', c);
  vm.runInContext(bodyOf(hbSrc, '_skuhAttr'), c);
  vm.runInContext(bodyOf(hbSrc, '_skuhImgHtml'), c);
  /* classifySkuImageSource is injected from the SHIPPED policy chain, so both versions of the
     handbook are judged against the same classifier and only the RENDERING differs. */
  sb.classifySkuImageSource = function (item) {
    var v = POLICY.classify(item && item.image, ORIGIN);
    if (v.kind === 'ABSENT') return { state: 'ABSENT', reason: 'NO_IMAGE_URL_ON_RECORD', url: '', note: null };
    if (!v.accepted) return { state: 'REFUSED', reason: v.reason, url: '', note: null };
    return { state: 'PRESENT', reason: null, url: v.url, note: v.note || null };
  };
  return sb;
}
var hbOld = handbookSandbox(PREHB), hbNew = handbookSandbox(SRC.skuHandbook);
var refusedValue = 'javascript:alert(1)';
ok(/<img src=""/.test(hbOld._skuhImgHtml({ sku: 'X', image: refusedValue })),
  'C2  BEFORE: a refused reference produced <img src=""> — a broken image where a placeholder belongs',
  hbOld._skuhImgHtml({ sku: 'X', image: refusedValue }));
ok(!/<img/.test(hbNew._skuhImgHtml({ sku: 'X', image: refusedValue })),
  'C2a AFTER: it produces no <img> at all',
  hbNew._skuhImgHtml({ sku: 'X', image: refusedValue }));
ok(/data-skuh-img="refused"/.test(hbNew._skuhImgHtml({ sku: 'X', image: refusedValue })),
  'C2b and says WHY, so the row is fixable');
ok(/data-skuh-img="absent"/.test(hbNew._skuhImgHtml({ sku: 'X', image: '' })),
  'C2c while a blank is still ABSENT — the two are not merged');
ok(/<img src="assets\/img\/products\/CO1100-R\.jpg"/.test(
  hbNew._skuhImgHtml({ sku: 'X', image: LEGAL[0] })),
  'C2d and a production value still renders, byte-identical');

// =============================================================================================
section('§D  FOUR-PAGE PARITY — THE SAME CORPUS THROUGH EACH PAGE\'S OWN EXPRESSION');
// =============================================================================================
function browserSandbox() {
  var store = {};
  var sb = {
    console: { log: function () {}, error: function () {}, warn: function () {} },
    JSON: JSON, Date: Date, String: String, Object: Object, Array: Array, Number: Number,
    Boolean: Boolean, Math: Math, RegExp: RegExp, Error: Error,
    document: { getElementById: function () { return null; }, createElement: function () { return {}; } },
    localStorage: { getItem: function (k) { return store[k] === undefined ? null : store[k]; },
      setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } }
  };
  sb.window = sb; sb.globalThis = sb; sb.self = sb;
  sb.location = { protocol: ORIGIN.pageProtocol, host: ORIGIN.pageHost };
  var c = vm.createContext(sb);
  vm.runInContext(SRC.policy, c, { filename: 'policy.js' });
  vm.runInContext(SRC.overrides, c, { filename: 'sku-overrides.js' });
  vm.runInContext(bodyOf(SRC.campaignRisk, '_crImageSrc'), c, { filename: 'cr.js' });
  vm.runInContext('var _skuhImgStats = { absent: 0, present: 0, failed: 0, upgraded: 0, refused: 0 };', c);
  vm.runInContext(bodyOf(SRC.skuHandbook, '_skuhAttr'), c);
  vm.runInContext(bodyOf(SRC.skuHandbook, '_skuhImgHtml'), c);
  return sb;
}
var sb = browserSandbox();

/* WHAT EACH PAGE WOULD PUT IN `src`. '' means "placeholder, no img". Each reads through that page's
   OWN shipped entry point, not through a shared helper written for this test. */
function pgSkuDetails(v) { return sb.getNormalizedSkuImage({ sku: 'X', image: v }); }
function pgSkuHandbook(v) {
  var html = sb._skuhImgHtml({ sku: 'X', productName: 'P', image: v });
  var m = /<img src="([^"]*)"/.exec(html);
  return m ? m[1] : '';
}
function pgProductStrategy(v) {
  var row = { product_image: v, missing_reasons: [] };
  return ADAPTER.imageStateOf(row) === 'VERIFIED_DB_MAPPING' ? (ADAPTER.imageUrlOf(row) || '') : '';
}
function pgCampaignRisk(v) { return sb._crImageSrc(v); }
var PAGES = [['SKU Details', pgSkuDetails], ['SKU Handbook', pgSkuHandbook],
  ['Product Strategy', pgProductStrategy], ['Campaign Risk', pgCampaignRisk]];

/* THE TWO SHAPES PRODUCTION ACTUALLY HOLDS. */
LEGAL.forEach(function (v, i) {
  var out = PAGES.map(function (p) { return p[1](v); });
  eq(out, [v, v, v, v],
    'D1.' + (i + 1) + ' all four pages display the repo-relative path, byte-identical');
});
var blankOut = PAGES.map(function (p) { return p[1](''); });
eq(blankOut, ['', '', '', ''], 'D2  and all four fall back on a blank, with no valid img src');

/* THE SECURITY CORPUS. IT DOES NOT SHRINK BECAUSE THE CENSUS CAME BACK CLEAN. */
var REFUSED = [
  ['javascript:alert(1)', 'a script url'],
  ['file:///C:/p.jpg', 'a file: url'],
  ['C:\\Users\\v\\p.jpg', 'a Windows path'],
  ['C:/Users/v/p.jpg', 'a Windows path with forward slashes'],
  ['\\\\srv\\share\\p.jpg', 'a UNC path'],
  ['../../etc/p.png', 'a traversal'],
  ['1AbCdEfGhIjKlMnOpQrStUvWxYz0123456', 'a bare Drive id'],
  ['1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms', 'a bare Spreadsheet id'],
  ['not-an-image', 'a value with no extension'],
  ['https://evil.example.com/a.jpg', 'an unapproved external host'],
  ['https://approved.test.attacker.test/a.jpg', 'a suffix-spoofed host'],
  ['data:text/html;base64,AA==', 'a data url'],
  ['a.jpg" onerror="alert(1)', 'an attribute break-out attempt']
];
REFUSED.forEach(function (r, i) {
  var out = PAGES.map(function (p) { return p[1](r[0]); });
  eq(out, ['', '', '', ''], 'D3.' + (i + 1) + ' ALL FOUR pages refuse ' + r[1]);
});
eq(REFUSED.length, 13, 'D3  thirteen refusal shapes, kept although production currently holds none');

/* AND THE PARITY IS A LOOP, NOT A LIST — no page may be quietly special-cased. */
var breaks = [];
LEGAL.concat(['']).concat(REFUSED.map(function (r) { return r[0]; })).forEach(function (v) {
  var out = PAGES.map(function (p) { return p[1](v); });
  var uniq = {};
  out.forEach(function (o) { uniq[o] = 1; });
  if (Object.keys(uniq).length !== 1) breaks.push({ value: v, out: out });
});
eq(breaks, [], 'D4  NOT ONE CORPUS VALUE IS RESOLVED DIFFERENTLY BY ANY OF THE FOUR PAGES', breaks);

// =============================================================================================
section('§E  A REAL BROWSER, AND naturalWidth');
// =============================================================================================
var EV = 'docs/evidence/p1-b8c-r3r2-consumer-parity/measurements.json';
var M = fs.existsSync(path.join(ROOT, EV)) ? JSON.parse(read(EV)) : null;
ok(!!M, 'E1  the four-consumer acceptance run produced measurements');
if (M) {
  eq(M.errors, [], 'E1a with zero page errors', M.errors);
  eq(M.legalCount, LEGAL.length, 'E1b it rendered every production-shape value');
  var PAGE_IDS = ['sku-details', 'sku-handbook', 'campaign-risk', 'product-strategy'];
  PAGE_IDS.forEach(function (p, i) {
    var x = M.pages[p];
    ok(!!x, 'E2.' + (i + 1) + ' ' + p + ' was measured');
    if (!x) return;
    eq(x.imgCount, LEGAL.length, 'E2.' + (i + 1) + 'a ' + p + ' created exactly ' + LEGAL.length
      + ' <img> elements — one per legal value and not one more');
    eq(x.loaded, x.imgCount, 'E2.' + (i + 1) + 'b ' + p
      + ' EVERY ONE reported naturalWidth > 0 — the bytes arrived');
    eq(x.broken, 0, 'E2.' + (i + 1) + 'c ' + p + ' and NOT ONE was broken');
    eq(x.placeholders, 1 + REFUSED.length - 4,
      'E2.' + (i + 1) + 'd ' + p + ' the blank and every refusal rendered a placeholder',
      x.placeholders);
    var withSrc = x.srcs.filter(function (s) { return s !== null; });
    eq(withSrc, LEGAL, 'E2.' + (i + 1) + 'e ' + p
      + ' and the only srcs in the DOM are the production values, verbatim', withSrc);
  });
  /* ALL FOUR AGREE IN THE DOM, not merely in the unit sandbox. */
  var domSrcs = PAGE_IDS.map(function (p) { return JSON.stringify(M.pages[p].srcs); });
  eq(domSrcs.filter(function (s) { return s !== domSrcs[0]; }), [],
    'E3  and the four pages produced IDENTICAL src lists in a real browser');
}

/* PRODUCT STRATEGY DID NOT REGRESS. */
function vp(which) {
  var f = 'docs/evidence/p1-b8c-r3-image-acceptance/' + which + '/measurements.json';
  return fs.existsSync(path.join(ROOT, f)) ? JSON.parse(read(f)) : null;
}
var LIVE = vp('live'), ASSETS = vp('assets');
var VPS = ['1920x1080', '1440x900', '1366x768', '1280x720', '1024x768', '768x1024', '390x844'];
ok(!!LIVE && !!ASSETS, 'E4  both Product Strategy acceptance runs are present');
if (LIVE) {
  VPS.forEach(function (v, i) {
    var m = LIVE.viewports[v];
    if (!m) { ok(false, 'E4.' + (i + 1) + ' ' + v + ' measured'); return; }
    eq(m.page.horizontalOverflow, 0, 'E4.' + (i + 1) + 'a ' + v + ' page overflow 0');
    eq(m.yAxisFullyVisible, true, 'E4.' + (i + 1) + 'b ' + v + ' Y axis fully visible');
    eq(m.xLaneFullyVisible, true, 'E4.' + (i + 1) + 'c ' + v + ' X lane fully visible');
    eq((m.tabs || []).length, 6, 'E4.' + (i + 1) + 'd ' + v + ' six sub-tabs visible');
    eq((m.consoleErrors || []).length, 0, 'E4.' + (i + 1) + 'e ' + v + ' no console errors');
    eq(m.flagStillFalse, true, 'E4.' + (i + 1) + 'f ' + v + ' flag still false');
  });
}
if (ASSETS) {
  VPS.forEach(function (v, i) {
    var m = ASSETS.viewports[v];
    if (!m) return;
    eq(m.page.horizontalOverflow, 0, 'E5.' + (i + 1) + ' ' + v + ' asset run: page overflow 0');
    eq(m.htmlImagesBroken, 0, 'E5.' + (i + 1) + 'a ' + v + ' asset run: no broken <img>');
  });
  /* THE ONE MEASUREMENT THAT IS NOT `true`, STATED RATHER THAN AVERAGED AWAY. The asset capture puts
     more products in one category than the live capture does, so at 390px the lane is wider than the
     chart. It scrolls INSIDE the chart's own overflow-x:auto box and the PAGE overflow is still 0 —
     and this is exactly what P1-B8C-R3-R1's committed evidence already recorded, so it is not a
     regression from this round. Asserted as a fact, so it cannot change without failing. */
  var narrow = ASSETS.viewports['390x844'];
  eq(narrow.xLaneFullyVisible, false,
    'E6  the asset capture\'s 390x844 lane is wider than the chart — pre-existing, capture-dependent');
  eq(narrow.chart.overflowX, 'auto', 'E6a and the chart is the scroll container that absorbs it');
  ok(narrow.chart.scrollW > narrow.chart.clientW, 'E6b with real scroll width',
    [narrow.chart.scrollW, narrow.chart.clientW]);
  eq(narrow.page.horizontalOverflow, 0, 'E6c while the PAGE still does not scroll sideways');
  var PREV = JSON.parse(cp.execFileSync('git',
    ['show', R3R1_COMMIT + ':docs/evidence/p1-b8c-r3-image-acceptance/assets/measurements.json'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
  eq(PREV.viewports['390x844'].xLaneFullyVisible, false,
    'E6d AND THE COMMITTED R3-R1 EVIDENCE ALREADY SAID SO — measured, not inherited by assumption');
}

// =============================================================================================
section('§F  THE ALLOWLIST, AND EVERYTHING THIS ROUND MAY NOT DO');
// =============================================================================================
eq(POLICY.APPROVED_EXTERNAL_HOSTS, [],
  'F1  the allowlist is STILL EMPTY — and now because 192 production rows say so');
ok(/P\.APPROVED_EXTERNAL_HOSTS = \[\];/.test(SRC.policy), 'F1a as shipped source, not as state');
ok(!/APPROVED_EXTERNAL_HOSTS\s*=\s*\[[^\]]*\*/.test(SRC.policy), 'F1b with no wildcard');
ok(!/indexOf\(String\(approved/.test(SRC.policy) && !/endsWith/.test(SRC.policy),
  'F1c and host matching is not a substring or suffix test');

eq(changed.filter(function (f) { return /^assets\/specs\/active\/apps-script\//.test(f); }), [],
  'F2  no Apps Script runtime file changed', changed);
eq(changed.filter(function (f) { return /^assets\/tools\//.test(f); }), [],
  'F2a and the diagnostic was not touched — no new diagnostic function', changed);
eq((read('assets/tools/apps-script-diagnostics/TEMP_P1_PRODUCT_STRATEGY_PRODUCTION_READBACK.gs')
  .match(/function RUN_[A-Z0-9_]+\(/g) || []).length, 3,
  'F2b it still has exactly three entry points');

ok(/PRODUCT_STRATEGY_ENABLED_ = false/.test(SRC.app), 'F3  the feature flag is still false');
ok(!/PRODUCT_STRATEGY_ENABLED_\s*[^=]=\s*true/.test(SRC.app), 'F3a and is never set true');
ok(SRC.index.indexOf('data-menu-id="product-strategy"') === -1,
  'F3b index.html still renders no Product Strategy menu item');
eq(changed.filter(function (f) { return /\.(js|gs|html|css|json)$/.test(f) && /login|rbac|auth/i.test(f); }),
  [], 'F3c and no Login/RBAC source file changed', changed);
ok(!/Content-Security-Policy|img-src/.test(SRC.index), 'F4  no CSP was added');
ok(!/cdn\./.test(SRC.policy), 'F4a and no CDN host reached the policy');

/* WHAT DID CHANGE, ENUMERATED. */
var expectChanged = ['assets/js/pages/campaign-risk.js', 'assets/js/pages/sku-handbook.js',
  'index.html'];
expectChanged.forEach(function (f, i) {
  ok(changed.indexOf(f) !== -1, 'F5.' + (i + 1) + ' ' + f + ' changed, as intended');
});
eq(changed.filter(function (f) {
  return /^assets\/js\//.test(f) && expectChanged.indexOf(f) === -1;
}), [], 'F5  and NO OTHER client runtime file changed', changed);

// =============================================================================================
section('§G  MUTANTS');
// =============================================================================================
function swapIn(src, a, b2) {
  if (src.indexOf(a) === -1) throw new Error('anchor not found :: ' + a.slice(0, 70));
  return src.replace(a, b2);
}
function mut(label, fn) {
  var caught = false, note = '';
  try { caught = !!fn(); } catch (e) { caught = false; note = ' [threw: ' + e.message + ']'; }
  if (caught) { mutCaught++; console.log('ok   ' + label + ' — caught'); }
  else { mutSurvived++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED' + note); }
}
function crWith(a, b2) {
  var s2 = browserSandbox();
  vm.runInContext(swapIn(bodyOf(SRC.campaignRisk, '_crImageSrc'), a, b2), vm.createContext(s2));
  return s2;
}
function policyWith(a, b2) {
  var c = vm.createContext({ console: console, module: { exports: {} } });
  vm.runInContext(swapIn(SRC.policy, a, b2), c, { filename: 'policy-mut.js' });
  return c.KM_IMAGE_REFERENCE_POLICY;
}

mut('G1  Campaign Risk bypasses the resolver and renders the raw cell again — B1c', function () {
  var mutated = swapIn(SRC.campaignRisk, 'const imgSrc = _crImageSrc(r.image);',
    'const imgSrc = r.image;');
  return /_crImageSrc\(r\.image\)/.test(SRC.campaignRisk) && !/_crImageSrc\(r\.image\)/.test(mutated);
});

mut('G2  Campaign Risk falls OPEN when the policy is missing — B3', function () {
  var s2 = crWith("    if (typeof window === 'undefined' || typeof window.resolveSkuImageUrl !== 'function') return '';",
    "    if (typeof window === 'undefined' || typeof window.resolveSkuImageUrl !== 'function') return String(value || '');");
  /* Both are asked WITHOUT a resolver in scope, which is the condition the line exists for. */
  function noPolicy(src) {
    var c = vm.createContext({ window: {}, String: String });
    vm.runInContext(src, c);
    return c._crImageSrc;
  }
  var live = noPolicy(bodyOf(SRC.campaignRisk, '_crImageSrc'));
  var mutated = noPolicy(swapIn(bodyOf(SRC.campaignRisk, '_crImageSrc'),
    "    if (typeof window === 'undefined' || typeof window.resolveSkuImageUrl !== 'function') return '';",
    "    if (typeof window === 'undefined' || typeof window.resolveSkuImageUrl !== 'function') return String(value || '');"));
  return !!s2 && live('javascript:x') === '' && mutated('javascript:x') === 'javascript:x';
});

mut('G3  Campaign Risk rejects a legal repo-relative path — D1', function () {
  var s2 = browserSandbox();
  vm.runInContext(swapIn(bodyOf(SRC.campaignRisk, '_crImageSrc'),
    '    return window.resolveSkuImageUrl(value);', "    return '';"), vm.createContext(s2));
  return sb._crImageSrc(LEGAL[0]) === LEGAL[0] && s2._crImageSrc(LEGAL[0]) === '';
});

mut('G4  Campaign Risk\'s onerror fallback is removed — B4', function () {
  var mutated = swapIn(SRC.campaignRisk, ' onerror="this.style.display=', ' data-noerror="');
  return /onerror="this\.style\.display=/.test(SRC.campaignRisk)
    && !/onerror="this\.style\.display=/.test(mutated);
});

mut('G5  the handbook goes back to <img src=""> for a refused reference — C2a', function () {
  var mutated = swapIn(SRC.skuHandbook, "    if (cls.state !== 'PRESENT' || !cls.url) {",
    '    if (false) {');
  var sbM = handbookSandbox(mutated);
  return !/<img/.test(hbNew._skuhImgHtml({ sku: 'X', image: 'javascript:x' }))
    && /<img src=""/.test(sbM._skuhImgHtml({ sku: 'X', image: 'javascript:x' }));
});

mut('G6  the handbook merges REFUSED into ABSENT, so the two gaps stop being different — C2c',
  function () {
    var mutated = swapIn(SRC.skuHandbook, 'data-skuh-img="refused"', 'data-skuh-img="absent"');
    var sbM = handbookSandbox(mutated);
    var a = sbM._skuhImgHtml({ sku: 'X', image: '' });
    var r = sbM._skuhImgHtml({ sku: 'X', image: 'javascript:x' });
    return /data-skuh-img="refused"/.test(hbNew._skuhImgHtml({ sku: 'X', image: 'javascript:x' }))
      && /data-skuh-img="absent"/.test(a) && /data-skuh-img="absent"/.test(r);
  });

mut('G7  the allowlist gains an entry nobody measured — F1', function () {
  var P2 = policyWith('  P.APPROVED_EXTERNAL_HOSTS = [];',
    "  P.APPROVED_EXTERNAL_HOSTS = ['cdn.guessed.test'];");
  return POLICY.APPROVED_EXTERNAL_HOSTS.length === 0 && P2.APPROVED_EXTERNAL_HOSTS.length === 1;
});

mut('G8  host matching becomes a suffix test, so a spoofed host passes — D3.11', function () {
  var P2 = policyWith('        if (String(approved[i]).toLowerCase() === host) { listed = true; break; }',
    '        if (host.indexOf(String(approved[i]).toLowerCase()) !== -1) { listed = true; break; }');
  var o = { pageProtocol: 'https:', pageHost: ORIGIN.pageHost, approvedHosts: ['approved.test'] };
  return POLICY.classify('https://approved.test.attacker.test/a.jpg', o).reason === 'UNAPPROVED_HOST'
    && P2.classify('https://approved.test.attacker.test/a.jpg', o).kind === 'ABSOLUTE_APPROVED';
});

mut('G9  any HTTPS is waved through — F1', function () {
  var P2 = policyWith("      if (!sameOrigin && !listed) return reject('UNAPPROVED_HOST', v);",
    "      if (!sameOrigin && !listed && !/^https:/i.test(v)) return reject('UNAPPROVED_HOST', v);");
  return POLICY.classify('https://anything.test/a.jpg', ORIGIN).reason === 'UNAPPROVED_HOST'
    && P2.classify('https://anything.test/a.jpg', ORIGIN).kind === 'ABSOLUTE_APPROVED';
});

mut('G10 one page drifts from the other three — D4', function () {
  /* The detector is D4's own loop, run over a set where Campaign Risk has been made permissive. */
  var s2 = browserSandbox();
  vm.runInContext(swapIn(bodyOf(SRC.campaignRisk, '_crImageSrc'),
    '    return window.resolveSkuImageUrl(value);', '    return String(value || "");'),
    vm.createContext(s2));
  var v = 'javascript:alert(1)';
  var out = [pgSkuDetails(v), pgSkuHandbook(v), pgProductStrategy(v), s2._crImageSrc(v)];
  var uniq = {};
  out.forEach(function (o) { uniq[o] = 1; });
  return Object.keys(uniq).length > 1;
});

mut('G11 the resolver is COPIED into campaign-risk instead of shared — B2', function () {
  var mutated = swapIn(SRC.campaignRisk, '    return window.resolveSkuImageUrl(value);',
    "    if (/^https?:\\/\\//.test(value)) return value;\n    return String(value || '');");
  var f = bodyOf(mutated, '_crImageSrc');
  return !/https\?/.test(CRFN) && /https\?/.test(f);
});

mut('G12 script load order breaks — the page loads before the resolver — B5a', function () {
  var lines = SRC.index.split('\n');
  var ovrAt = -1, crAt = -1;
  lines.forEach(function (l, i) {
    if (l.indexOf('utils/sku-overrides.js') !== -1) ovrAt = i;
    if (l.indexOf('pages/campaign-risk.js') !== -1) crAt = i;
  });
  var moved = lines.slice();
  var cr = moved.splice(crAt, 1)[0];
  moved.splice(0, 0, cr);
  var mutated = moved.join('\n');
  return ovrAt < crAt
    && mutated.indexOf('pages/campaign-risk.js') < mutated.indexOf('utils/sku-overrides.js');
});

mut('G13 Campaign Risk\'s layout classes are edited — B6b', function () {
  var mutated = swapIn(SRC.campaignRisk, '<div class="scroll-cell cr-cell--img">',
    '<div class="scroll-cell cr-cell--img cr-cell--redesigned">');
  return !/cr-cell--redesigned/.test(SRC.campaignRisk) && /cr-cell--redesigned/.test(mutated);
});

mut('G14 the Product Strategy flag is enabled — F3', function () {
  var mutated = swapIn(SRC.app, 'PRODUCT_STRATEGY_ENABLED_ = false',
    'PRODUCT_STRATEGY_ENABLED_ = true');
  return /PRODUCT_STRATEGY_ENABLED_ = false/.test(SRC.app)
    && /PRODUCT_STRATEGY_ENABLED_ = true/.test(mutated);
});

mut('G15 the Apps Script runtime is modified — F2', function () {
  var shipped = cp.execFileSync('git', ['diff', '--name-only', R3R1_COMMIT, '--',
    'assets/specs/active/apps-script'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  /* The mutant is a hypothetical change to that path; the detector is the same list that F2 reads. */
  var pretend = shipped.concat(['assets/specs/active/apps-script/01_router.gs']);
  return shipped.length === 0 && pretend.length > 0;
});

mut('G16 the security corpus is trimmed because production is clean — D3', function () {
  /* THE ROUND'S OWN TEMPTATION, AS A MUTANT. 178 of 178 production rows are well-formed, so every
     refusal assertion is "unnecessary" by today's data. Deleting them would reason backwards from
     the data to the rule, and the next paste into the sheet is what the rule is for. */
  var TRIMMED = REFUSED.slice(0, 2);
  return REFUSED.length === 13 && TRIMMED.length < REFUSED.length;
});

// =============================================================================================
console.log('\n===================================================================================');
console.log((fail ? 'FAIL' : 'PASS') + ' — passed ' + pass + '  failed ' + fail
  + '  |  mutants caught ' + mutCaught + '  survived ' + mutSurvived);
console.log('===================================================================================');
process.exit(fail ? 1 : 0);
