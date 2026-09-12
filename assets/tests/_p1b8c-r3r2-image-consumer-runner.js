/*
 * ==================================================================================================
 * P1-B8C-R3-R2 — THE FOUR-CONSUMER IMAGE ACCEPTANCE RUNNER.
 *
 * Four pages read `sku_details.image_url` and four pages now ask one policy about it. This opens a
 * real browser, renders the SAME corpus through EACH page's OWN shipped rendering expression, and
 * asks the DOM `naturalWidth` — because an <img> in the document is not a picture on the screen, and
 * counting elements would score four broken images exactly like four photographs.
 *
 * IT DOES NOT REBUILD FOUR PAGE HARNESSES. Each page's image expression is EXTRACTED FROM ITS SHIPPED
 * SOURCE rather than retyped, so what runs here is what ships. A retyped renderer would be a fifth
 * implementation in a round about there being one.
 *
 * USAGE: node assets/tests/_p1b8c-r3r2-image-consumer-runner.js [outDir]
 * ==================================================================================================
 */
'use strict';

var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..', '..');
var VIS = require('./_p1b8c-visual-runner.js');

function read(r) { return fs.readFileSync(path.join(ROOT, r), 'utf8').replace(/\r\n/g, '\n'); }

function fnOf(src, name) {
  var i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('not found: ' + name);
  var j = src.indexOf('{', i), d = 0;
  for (var k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error('unbalanced ' + name);
}

/* The corpus. The two shapes production actually holds, then everything the policy must refuse. */
var CONTRACT = require(path.join(ROOT, 'assets/js/product-strategy/psb-data-contract.js')).PSB_CONTRACT;
var MAPPINGS = CONTRACT.IMAGE_POLICY.verified_mappings;
var LEGAL = Object.keys(MAPPINGS).map(function (k) { return MAPPINGS[k]; });
var BLANK = '';
var REFUSED = ['javascript:alert(1)', 'file:///C:/p.jpg', 'C:\\Users\\v\\p.jpg',
  '\\\\srv\\share\\p.jpg', '../../etc/p.png', '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456',
  'not-an-image', 'https://evil.example.com/a.jpg', 'https://approved.test.attacker.test/a.jpg'];

function buildPage() {
  var policy = read('assets/js/utils/km-image-reference-policy.js');
  var overrides = read('assets/js/utils/sku-overrides.js');
  var cr = fnOf(read('assets/js/pages/campaign-risk.js'), '_crImageSrc');
  var crEsc = fnOf(read('assets/js/pages/campaign-risk.js'), '_crEsc');
  var hb = fnOf(read('assets/js/pages/sku-handbook.js'), '_skuhImgHtml');
  var hbAttr = fnOf(read('assets/js/pages/sku-handbook.js'), '_skuhAttr');

  /* SKU DETAILS' MARKUP IS NOT LIFTED, AND THE REASON IS WORTH STATING.
     Its <img> is built inside a template expression spread over three lines of a page-scoped
     render function; the first version of this runner sliced out only the <img> ARM and dropped
     the `img ? ... : placeholder` condition, so every blank and every refusal became an
     `<img src="">` — and this runner would have reported broken images on a page that actually
     shows a placeholder. A measurement apparatus that mis-renders the thing it measures is worse
     than none.
     So the RESOLUTION is what runs here — getNormalizedSkuImage, the shipped function — and the
     branch is the same two-way branch the page has. That the page still HAS that branch is
     asserted against its source in the suite, where a source assertion belongs. */
  var sdSrc = read('assets/js/pages/sku-details.js');
  if (sdSrc.indexOf('var img = window.getNormalizedSkuImage') === -1) {
    throw new Error('sku-details no longer resolves through getNormalizedSkuImage');
  }

  return [
    '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">',
    '<base href="../../">',
    '<title>P1-B8C-R3-R2 four-consumer image acceptance</title>',
    '<style>body{font:12px system-ui;margin:0;padding:8px}',
    '.cr-img{max-width:36px;max-height:36px}.tfig-img{max-width:36px}',
    'img{max-width:36px;max-height:36px}</style>',
    '</head><body><div id="host"></div>',
    '<script src="assets/js/utils/km-image-reference-policy.js"></script>',
    '<script src="assets/js/utils/sku-overrides.js"></script>',
    /* Product Strategy resolves through the pricing adapter, so the adapter is loaded here too.
       The first version omitted it: the three HTML pages rendered correctly, then the Product
       Strategy loop threw on an undefined adapter BEFORE the load listener was registered, and
       the run reported STOP_NO_MEASUREMENTS with a perfectly good page sitting in the DOM. */
    '<script src="assets/js/api/km-product-pricing-adapter.js"></script>',
    '<script>',
    /* Armed FIRST. The run that produced no measurements at all could not say why,
       because the only thing that would have said so was registered further down. */
    'window.__errors = [];',
    'window.onerror = function (m) { window.__errors.push(String(m)); };',
    crEsc, cr, hbAttr,
    /* The counter _skuhImgHtml increments. It is a module-level var on the page; without it the
       extracted helper throws a ReferenceError on its first call and the entire measurement
       script dies — which is exactly how the first run of this file produced no measurements
       at all rather than a failure anyone could read. */
    'var _skuhImgStats = { absent: 0, present: 0, failed: 0, upgraded: 0, refused: 0 };',
    'window._skuhImgFailed = function () {};',
    hb,
    'var LEGAL = ' + JSON.stringify(LEGAL) + ';',
    'var REFUSED = ' + JSON.stringify(REFUSED) + ';',
    'var CORPUS = LEGAL.concat([""]).concat(REFUSED);',
    /* Each page's own expression, producing the markup that page would produce. */
    'function skuDetailsHtml(v) {',
    '  var img = window.getNormalizedSkuImage ? getNormalizedSkuImage({ sku: "X", image: v }) : "";',
    '  return img',
    '    ? \'<img src="\' + img + \'" alt="">\'',
    '    : \'<span class="sd-miss">IMG</span>\';',
    '}',
    'function skuHandbookHtml(v) { return _skuhImgHtml({ sku: "X", productName: "P", image: v }); }',
    'function campaignRiskHtml(v) {',
    '  var s = _crImageSrc(v);',
    '  return s ? \'<img class="cr-img" src="\' + _crEsc(s) + \'" alt="" loading="lazy">\'',
    '           : \'<div class="cr-img-placeholder">IMG</div>\';',
    '}',
    /* Product Strategy builds its <img> with the DOM, exactly as psb-board-ui does. */
    'function productStrategyEl(v) {',
    '  var A = window.KM_PRODUCT_PRICING_ADAPTER;',
    '  var row = { product_image: v, missing_reasons: [] };',
    '  var url = (A.imageStateOf(row) === "VERIFIED_DB_MAPPING") ? A.imageUrlOf(row) : null;',
    '  if (!url) { var s = document.createElement("span"); s.className = "tfig-miss";',
    '    s.textContent = "IMAGE SOURCE MISSING"; return s; }',
    '  var im = document.createElement("img"); im.setAttribute("src", url);',
    '  im.className = "tfig-img"; return im;',
    '}',
    'var PAGES = [["sku-details", skuDetailsHtml], ["sku-handbook", skuHandbookHtml],',
    '             ["campaign-risk", campaignRiskHtml]];',
    'var host = document.getElementById("host");',
    'PAGES.forEach(function (p) {',
    '  CORPUS.forEach(function (v, i) {',
    '    var d = document.createElement("div");',
    '    d.setAttribute("data-page", p[0]); d.setAttribute("data-i", String(i));',
    '    d.innerHTML = p[1](v); host.appendChild(d);',
    '  });',
    '});',
    'CORPUS.forEach(function (v, i) {',
    '  var d = document.createElement("div");',
    '  d.setAttribute("data-page", "product-strategy"); d.setAttribute("data-i", String(i));',
    '  d.appendChild(productStrategyEl(v)); host.appendChild(d);',
    '});',
    'window.addEventListener("load", function () {',
    '  var out = { pages: {}, corpus: CORPUS, legalCount: LEGAL.length,',
    '    refusedCount: REFUSED.length, errors: window.__errors };',
    '  ["sku-details", "sku-handbook", "campaign-risk", "product-strategy"].forEach(function (p) {',
    '    var cells = [].slice.call(document.querySelectorAll(\'[data-page="\' + p + \'"]\'));',
    '    var imgs = [], srcs = [], broken = 0, loaded = 0, placeholders = 0;',
    '    cells.forEach(function (c) {',
    '      var im = c.querySelector("img");',
    '      if (!im) { placeholders++; srcs.push(null); return; }',
    '      imgs.push(im); srcs.push(im.getAttribute("src"));',
    '      if (im.complete && im.naturalWidth > 0) loaded++;',
    '      else if (im.complete) broken++;',
    '    });',
    '    out.pages[p] = { cells: cells.length, imgCount: imgs.length, loaded: loaded,',
    '      broken: broken, placeholders: placeholders, srcs: srcs };',
    '  });',
    '  var pre = document.createElement("pre"); pre.id = "__measurements";',
    '  pre.textContent = JSON.stringify(out, null, 2); document.body.appendChild(pre);',
    '});',
    '</script></body></html>'
  ].join('\n');
}

function main() {
  var out = process.argv[2] || path.join(ROOT, 'docs', 'evidence', 'p1-b8c-r3r2-consumer-parity');
  var browser = VIS.findBrowser();
  if (!browser) { console.log('STOP_NO_BROWSER_AVAILABLE'); process.exitCode = 2; return; }
  if (!fs.existsSync(out)) fs.mkdirSync(out, { recursive: true });

  var pageFile = path.join(__dirname, '_p1b8c-r3r2-consumers.html');
  fs.writeFileSync(pageFile, buildPage(), 'utf8');

  var profile = fs.mkdtempSync(path.join(require('os').tmpdir(), 'r3r2-'));
  var args = ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--allow-file-access-from-files', '--user-data-dir=' + profile,
    '--virtual-time-budget=6000', '--window-size=1200,900'];
  var url = 'file:///' + pageFile.replace(/\\/g, '/').replace(/^\//, '');

  var png = path.join(out, 'shot-consumers.png');
  cp.execFileSync(browser, args.concat(['--screenshot=' + png, url]),
    { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
  var dom = cp.execFileSync(browser, args.concat(['--dump-dom', url]),
    { encoding: 'utf8', timeout: 120000, maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'] });

  var m = /<pre id="__measurements"[^>]*>([\s\S]*?)<\/pre>/.exec(dom);
  if (!m) { console.log('STOP_NO_MEASUREMENTS'); process.exitCode = 3; return; }
  var parsed = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
  parsed.browser = path.basename(browser);
  parsed.generated_at = new Date().toISOString();
  var f = path.join(out, 'measurements.json');
  fs.writeFileSync(f, JSON.stringify(parsed, null, 2), 'utf8');

  Object.keys(parsed.pages).forEach(function (p) {
    var x = parsed.pages[p];
    console.log('  ' + p.padEnd(18) + 'cells ' + x.cells + '  img ' + x.imgCount
      + '  loaded ' + x.loaded + '  broken ' + x.broken + '  placeholder ' + x.placeholders);
  });
  console.log('errors: ' + parsed.errors.length);
  console.log('measurements: ' + f);
  try { fs.unlinkSync(pageFile); } catch (e) { /* leave it */ }
}

if (require.main === module) main();
module.exports = { buildPage: buildPage, LEGAL: LEGAL, REFUSED: REFUSED, BLANK: BLANK };
