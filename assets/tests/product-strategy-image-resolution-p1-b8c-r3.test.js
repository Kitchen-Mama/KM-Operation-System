// Kitchen Mama Operation System — PRODUCT-STRATEGY-P1-B8C-R3
// ONE COLUMN, TWO ANSWERS: the shared image resolution the board was supposed to inherit.
//
// THE ROUND'S QUESTION. `sku_details.image_url` is read by two pages. SKU Details renders the
// photograph. Product Strategy renders a fallback marker. Same column, same row, same value — and
// P1-B8C-R2 measured the consequence on production data: VERIFIED_DB_MAPPING reached ZERO times
// across sixty live rows, so the board would ship with no product photograph at all.
//
// WHY IT HAPPENED, AND WHY IT IS NOT A TYPO. Each page had its own rule and neither knew about the
// other:
//
//   SKU Details        resolveSkuImageUrl — upgrade http:// to https:// on an https page, and PASS
//                      EVERYTHING ELSE THROUGH. A relative path renders, because a browser resolves
//                      one against the page.
//   Product Strategy   imageStateOf — /^https?:\/\// or it is UNVERIFIED_SOURCE_REFERENCE.
//
// `assets/img/products/CO1100-R.jpg` is displayable under the first and refused by the second, and
// THAT IS THE SHAPE PRODUCTION ACTUALLY HOLDS: psb-data-contract.js's seven verified_mappings are
// operator-asserted `sku_details.image_url` values, every one of them a repo-relative path.
//
// THE SECOND DEFECT, FOUND ON THE WAY, AND THE MORE SERIOUS ONE. SKU Details validated NOTHING.
// `javascript:alert(1)`, `C:\Users\...\x.jpg` and a bare Drive id all reached `<img src>` verbatim.
// PASSING A VALUE THROUGH IS NOT THE SAME AS ACCEPTING IT. The board was strict about the wrong
// thing and SKU Details was not strict about anything.
//
// WHAT R3 DID. One policy file, asked by both pages: km-image-reference-policy.js. It is an
// EXTRACTION, not a second mapping — the http:// -> https:// upgrade moved across unchanged, the
// callers kept their names, and nothing in it composes a path from a sku. P0-R3-R1's retraction
// ("a filename proves the file's name; that is all it proves") is untouched.
//
// THREE LINES THIS SUITE REFUSES TO LET ANYONE CROSS:
//
//   1. PARITY IS AN ASSERTION, NOT A CLAIM. §D runs every case through BOTH pages and fails if the
//      two disagree about any of them, in either direction.
//   2. AN <img> IN THE DOM IS NOT A PICTURE ON THE SCREEN. §H reads `naturalWidth` out of a real
//      browser. Counting elements would score seven broken images the same as seven photographs.
//   3. THE LIVE ROWS CANNOT PROVE THIS FIX AND ARE NOT ASKED TO. R2's diagnostic REMOVED every image
//      address before the log left the editor, correctly, so the sixty live rows carry redaction
//      markers. §F uses them for what they can prove — that nothing regressed — and §E draws the
//      photographs from the only image values in this repository with a production provenance.
//
// Run: node assets/tests/product-strategy-image-resolution-p1-b8c-r3.test.js

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

var POLICY_FILE = 'assets/js/utils/km-image-reference-policy.js';
var OVERRIDES_FILE = 'assets/js/utils/sku-overrides.js';
var ADAPTER_FILE = 'assets/js/api/km-product-pricing-adapter.js';

var POLICY = require(path.join(ROOT, POLICY_FILE));
var ADAPTER = require(path.join(ROOT, ADAPTER_FILE));

var SRC = {
  policy: read(POLICY_FILE),
  overrides: read(OVERRIDES_FILE),
  adapter: read(ADAPTER_FILE),
  selectors: read('assets/js/product-strategy/psb-selectors.js'),
  boardUi: read('assets/js/product-strategy/psb-board-ui.js'),
  skuDetails: read('assets/js/pages/sku-details.js'),
  skuHandbook: read('assets/js/pages/sku-handbook.js'),
  runner: read('assets/tests/_p1b8c-visual-runner.js'),
  index: read('index.html')
};

/* A page origin every case is judged against, so nothing in this suite depends on where it runs. */
var ORIGIN = { pageProtocol: 'https:', pageHost: 'km.example-origin.test' };

/* THE NODE PROCESS HAS NO PAGE, AND THAT IS NOT A DETAIL — IT IS THE THING §D MEASURES.
   In a browser both consumers read ONE `window.location`, so they agree about what same-origin means
   and about whether an http:// image needs upgrading. Under Node there is no `location` at all, the
   policy sees an empty origin, and the adapter would refuse a same-origin absolute url that SKU
   Details' sandbox accepts — a disagreement invented by the test harness rather than by the code.
   Declaring the origin on the global models the page. It is asserted below rather than assumed. */
ok(typeof global.location === 'undefined', 'A0  Node starts with no page origin, as expected');
global.location = { protocol: ORIGIN.pageProtocol, host: ORIGIN.pageHost };

/** SKU Details, executed as the browser executes it: the policy first, then sku-overrides.js. */
function skuDetailsSandbox(opts) {
  var o = opts || {};
  var store = {};
  var sb = {
    console: { log: function () {}, error: function () {}, warn: function () {} },
    JSON: JSON, Date: Date, String: String, Number: Number, Boolean: Boolean, Array: Array,
    Object: Object, Math: Math, RegExp: RegExp, Error: Error, isFinite: isFinite, isNaN: isNaN,
    parseInt: parseInt, parseFloat: parseFloat,
    document: { getElementById: function () { return null; }, createElement: function () { return {}; } },
    localStorage: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); },
      removeItem: function (k) { delete store[k]; }
    }
  };
  sb.window = sb; sb.globalThis = sb; sb.self = sb;
  sb.location = { protocol: o.protocol || 'https:', host: o.host || ORIGIN.pageHost };
  var ctx = vm.createContext(sb);
  if (!o.withoutPolicy) vm.runInContext(SRC.policy, ctx, { filename: 'km-image-reference-policy.js' });
  if (o.approvedHosts && sb.KM_IMAGE_REFERENCE_POLICY) {
    sb.KM_IMAGE_REFERENCE_POLICY.APPROVED_EXTERNAL_HOSTS = o.approvedHosts;
  }
  vm.runInContext(o.source || SRC.overrides, ctx, { filename: 'sku-overrides.js' });
  return sb;
}

/** What SKU Details would put in `<img src>` for a stored value. '' means it renders the placeholder. */
function skuDetailsSrc(sb, value) { return sb.getNormalizedSkuImage({ sku: 'X', image: value }); }

/** What Product Strategy decides about the same stored value, through the shipped adapter. */
function boardState(value) { return ADAPTER.imageStateOf({ product_image: value, missing_reasons: [] }); }

/* Product Strategy's answers are read through the module the adapter itself resolves, so declaring a
   host here is the same declaration a page would make. The page origin, though, is `globalThis` in
   Node — there is no `location` — so an absolute url is judged against an EMPTY origin unless a host
   is declared. That is stated rather than worked around: §C3 covers same-origin separately. */
function withApprovedHosts(hosts, fn) {
  var before = POLICY.APPROVED_EXTERNAL_HOSTS;
  POLICY.APPROVED_EXTERNAL_HOSTS = hosts;
  try { return fn(); } finally { POLICY.APPROVED_EXTERNAL_HOSTS = before; }
}

// =============================================================================================
section('§A  THE REGRESSION, REPRODUCED AGAINST THE RULE THAT WAS ACTUALLY SHIPPED');
// =============================================================================================
/* NOT A RETYPED COPY OF THE OLD RULE. The pre-R3 imageStateOf is extracted from git — the commit
   P1-B8C-R2 left behind — and executed. An assertion about a defect is worth what its subject is
   worth, and a retyped "old version" is a guess about what used to be there. */
var PRE_R3_COMMIT = '5c5861de892b3c8b88890071957778144ea2417d';
var preSrc = null;
try {
  preSrc = cp.execFileSync('git', ['show', PRE_R3_COMMIT + ':' + ADAPTER_FILE],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).replace(/\r\n/g, '\n');
} catch (e) { preSrc = null; }
ok(!!preSrc, 'A1  the pre-R3 adapter is recoverable from ' + PRE_R3_COMMIT.slice(0, 7));

var preState = null;
if (preSrc) {
  var pctx = vm.createContext({ console: console, module: { exports: {} } });
  vm.runInContext(preSrc, pctx, { filename: 'km-product-pricing-adapter@pre-r3.js' });
  var PRE = pctx.KM_PRODUCT_PRICING_ADAPTER;
  ok(!!PRE && typeof PRE.imageStateOf === 'function', 'A1a and it exposes imageStateOf');
  preState = function (v) { return PRE.imageStateOf({ product_image: v, missing_reasons: [] }); };
  ok(/\/\^https\?:\\\/\\\/\/i\.test\(v\)/.test(preSrc),
    'A1b and the rule it applied really was a bare absolute-URL regex');
  ok(preSrc.indexOf('KM_IMAGE_REFERENCE_POLICY') === -1,
    'A1c and it consulted no shared policy — the drift is the thing being reproduced');
}

/* THE EXACT VALUE PRODUCTION HOLDS. Not an invented example: psb-data-contract.js records it as the
   operator's statement of a live sku_details row. */
var CONTRACT = require(path.join(ROOT, 'assets/js/product-strategy/psb-data-contract.js')).PSB_CONTRACT;
var MAPPINGS = CONTRACT.IMAGE_POLICY.verified_mappings;
var LIVE_SHAPE = MAPPINGS[Object.keys(MAPPINGS)[0]];
eq(LIVE_SHAPE, 'assets/img/products/CO1100-R.jpg', 'A2  the operator-asserted image_url shape');
eq(CONTRACT.IMAGE_POLICY.verified_mapping_basis, 'OPERATOR_ASSERTED_DB_RECORD + EXACT_REPO_FILE_EXISTS',
  'A2a and its basis is the operator reading the live row, not a filename that matches a sku');
ok(Object.keys(MAPPINGS).every(function (k) {
  return fs.existsSync(path.join(ROOT, MAPPINGS[k]));
}), 'A2b and every file it names exists at that exact path');

var sdA = skuDetailsSandbox();
if (preState) {
  /* THE DIVERGENCE, IN ONE PAIR OF LINES. */
  eq(skuDetailsSrc(sdA, LIVE_SHAPE), LIVE_SHAPE,
    'A3  SKU DETAILS RENDERS IT — the value goes into <img src> and a browser resolves it');
  eq(preState(LIVE_SHAPE), 'UNVERIFIED_SOURCE_REFERENCE',
    'A3a AND THE BOARD REFUSED THE SAME VALUE — this is the reported regression, reproduced');
  ok(skuDetailsSrc(sdA, LIVE_SHAPE) !== '' && preState(LIVE_SHAPE) !== 'VERIFIED_DB_MAPPING',
    'A3b so one page displayed and the other did not, off ONE row of ONE column');
}

/* AND THE SECOND DEFECT, WHICH POINTED THE OTHER WAY. */
var sdPre = (function () {
  /* SKU Details as it behaved before R3: resolveSkuImageUrl owned the rule and passed everything on.
     Extracted from the same commit rather than described. */
  var ovr = cp.execFileSync('git', ['show', PRE_R3_COMMIT + ':' + OVERRIDES_FILE],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).replace(/\r\n/g, '\n');
  var store = {};
  var sb = {
    console: { log: function () {}, error: function () {} }, JSON: JSON, Date: Date, String: String,
    Object: Object, Array: Array, Number: Number, Boolean: Boolean, Math: Math, RegExp: RegExp,
    document: { getElementById: function () { return null; }, createElement: function () { return {}; } },
    localStorage: { getItem: function (k) { return store[k] === undefined ? null : store[k]; },
      setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } }
  };
  sb.window = sb; sb.globalThis = sb;
  sb.location = { protocol: 'https:', host: ORIGIN.pageHost };
  vm.runInContext(ovr, vm.createContext(sb), { filename: 'sku-overrides@pre-r3.js' });
  return sb;
}());

var DANGEROUS = ['javascript:alert(1)', 'C:\\Users\\viczh\\Desktop\\photo.jpg',
  '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456', 'data:text/html;base64,PHNjcmlwdD4='];
DANGEROUS.forEach(function (v, i) {
  eq(sdPre.getNormalizedSkuImage({ sku: 'X', image: v }), v,
    'A4.' + (i + 1) + ' PRE-R3 SKU Details put ' + JSON.stringify(v).slice(0, 34)
    + ' straight into <img src>');
});
ok(true, 'A4  VERDICT: the board refused a value production holds, and SKU Details accepted values'
  + ' nothing should — two halves of ONE missing authority');

// =============================================================================================
section('§B  ONE RESOLVER, AND IT IS AN EXTRACTION RATHER THAN A SECOND MAPPING');
// =============================================================================================
eq(POLICY.CONTRACT_ID, 'KM_IMAGE_REFERENCE_POLICY_V1', 'B1  the policy declares a contract id');
eq(POLICY.CONTRACT.one_policy_per_system, true, 'B1a and that there is one of it per system');
eq(POLICY.CONTRACT.per_page_policy_permitted, false, 'B1b and that a page may not hold its own');
eq(POLICY.CONTRACT.composes_a_path_from_a_sku, false,
  'B1c and that it never composes a path from a sku — P0-R3-R1 stays retracted');
ok(POLICY.CONTRACT.consumers.length === 2, 'B1d and it names both consumers', POLICY.CONTRACT.consumers);

/* BOTH CONSUMERS ASK IT, AND NEITHER KEEPS A COPY OF THE RULE. */
ok(/_skuImagePolicy\(\)/.test(SRC.overrides) && /KM_IMAGE_REFERENCE_POLICY/.test(SRC.overrides),
  'B2  sku-overrides.js asks the policy');
ok(/imagePolicy\(\)/.test(SRC.adapter) && /KM_IMAGE_REFERENCE_POLICY/.test(SRC.adapter),
  'B2a and so does km-product-pricing-adapter.js');

/* THE OLD RULE IS GONE FROM BOTH, not merely unused. A dormant copy is a copy. */
function bodyOf(src, startMarker, endMarker) {
  var i = src.indexOf(startMarker);
  if (i < 0) return '';
  var j = src.indexOf(endMarker, i);
  return src.slice(i, j < 0 ? src.length : j);
}
var adapterImageFn = bodyOf(SRC.adapter, 'A.imageStateOf = function', 'A.imageUrlOf = function');
ok(adapterImageFn.indexOf('https?') === -1,
  'B3  the adapter\'s image function no longer carries a scheme regex of its own', adapterImageFn);
var resolverFn = bodyOf(SRC.overrides, 'function resolveSkuImageUrl', 'function classifySkuImageSource');
ok(!/http:\/\//.test(resolverFn.replace(/\/\/[^\n]*/g, '')),
  'B3a and the SKU Details resolver no longer rewrites a scheme itself');

/* THE UPGRADE MOVED ACROSS RATHER THAN BEING DROPPED — the one behaviour the old resolver owned. */
eq(POLICY.classify('http://cdn.approved.test/a.jpg',
  { pageProtocol: 'https:', pageHost: 'km.example-origin.test', approvedHosts: ['cdn.approved.test'] }).url,
  'https://cdn.approved.test/a.jpg', 'B4  the mixed-content upgrade survived the move');
eq(POLICY.classify('http://cdn.approved.test/a.jpg',
  { pageProtocol: 'http:', pageHost: 'km.example-origin.test', approvedHosts: ['cdn.approved.test'] }).url,
  'http://cdn.approved.test/a.jpg', 'B4a and is still CONDITIONAL on the page being https');

/* NO PAGE BUILDS A PATH OUT OF A SKU. The retraction, asserted rather than trusted — and aimed at
   the RENDERING statements, because the first version of this assertion failed on psb-board-ui.js's
   own self-test block, which builds `'images/' + sku + '.jpg'` as the set of paths it EXPECTS and
   then asserts that every image on the page is in it. That is the retraction being enforced, not
   broken, and a scan for the shape read it as the defect it exists to prevent. */
var SETTERS = SRC.boardUi.split('\n').filter(function (l) {
  return /setAttribute\(\s*['"](?:src|href)['"]/.test(l);
});
ok(SETTERS.length >= 3, 'B5  every <img>/<image> source assignment is found', SETTERS.length);
SETTERS.forEach(function (l, i) {
  ok(/setAttribute\(\s*['"](?:src|href)['"]\s*,\s*[A-Za-z_$][\w$.]*\s*\)/.test(l),
    'B5.' + (i + 1) + ' it is handed a bare value, never a composed path :: ' + l.trim());
});
[['psb-selectors.js', SRC.selectors], ['sku-overrides.js', SRC.overrides],
  ['km-image-reference-policy.js', SRC.policy]].forEach(function (p2, i) {
    ok(!/['"]assets\/img\/products\/['"]\s*\+/.test(p2[1]) && !/\+\s*['"]\.jpg['"]/.test(p2[1]),
      'B5' + String.fromCharCode(97 + i) + ' ' + p2[0] + ' composes no sku -> path');
  });

// =============================================================================================
section('§C  THE NINE CASES THE ROUND ASKS FOR');
// =============================================================================================
var sd = skuDetailsSandbox();

// ---- 1. GITHUB ASSET PATH -------------------------------------------------------------------
var c1 = POLICY.classify(LIVE_SHAPE, ORIGIN);
eq(c1.kind, 'SAME_ORIGIN_ASSET', 'C1  a GitHub asset path is a same-origin asset');
eq(c1.url, LIVE_SHAPE, 'C1a resolved verbatim — no directory prefixed, no extension appended');
eq(skuDetailsSrc(sd, LIVE_SHAPE), LIVE_SHAPE, 'C1b SKU Details renders it');
eq(boardState(LIVE_SHAPE), 'VERIFIED_DB_MAPPING', 'C1c AND THE BOARD NOW DOES TOO — the R3 fix');

// ---- 2. LOCAL / PRODUCTION ASSET MAPPING ----------------------------------------------------
Object.keys(MAPPINGS).forEach(function (skuKey, i) {
  var v = MAPPINGS[skuKey];
  eq(boardState(v), 'VERIFIED_DB_MAPPING', 'C2.' + (i + 1) + ' ' + skuKey + ' -> verified');
  eq(skuDetailsSrc(sd, v), v, 'C2.' + (i + 1) + 'a and SKU Details renders the same path');
});
eq(Object.keys(MAPPINGS).length, 7, 'C2  all seven operator-asserted mappings, and only seven');
var bare = 'sp02.jpg';
eq(boardState(bare), 'VERIFIED_DB_MAPPING', 'C2a a bare filename beside the page resolves too');

// ---- 3. ABSOLUTE APPROVED URL ---------------------------------------------------------------
var sameOrigin = 'https://' + ORIGIN.pageHost + '/Operation-System/' + LIVE_SHAPE;
var c3 = POLICY.classify(sameOrigin, ORIGIN);
eq(c3.kind, 'ABSOLUTE_APPROVED', 'C3  an absolute url on the PAGE\'S OWN origin is approved');
eq(c3.url, sameOrigin, 'C3a and is resolved unchanged');
ok(POLICY.APPROVED_EXTERNAL_HOSTS.length === 0,
  'C3b and it needed no allowlist entry — the origin is not a guess, it is where the page is');
var declared = POLICY.classify('https://cdn.declared.test/a.jpg',
  { pageProtocol: 'https:', pageHost: ORIGIN.pageHost, approvedHosts: ['cdn.declared.test'] });
eq(declared.kind, 'ABSOLUTE_APPROVED', 'C3c an EXTERNAL host is approved once the operator declares it');
withApprovedHosts(['cdn.declared.test'], function () {
  eq(boardState('https://cdn.declared.test/a.jpg'), 'VERIFIED_DB_MAPPING',
    'C3d and the board honours the same declaration');
  var sd3 = skuDetailsSandbox({ approvedHosts: ['cdn.declared.test'] });
  eq(skuDetailsSrc(sd3, 'https://cdn.declared.test/a.jpg'), 'https://cdn.declared.test/a.jpg',
    'C3e and so does SKU Details');
});

// ---- 4. MISSING IMAGE ------------------------------------------------------------------------
['', null, undefined, '   '].forEach(function (v, i) {
  eq(POLICY.classify(v, ORIGIN).kind, 'ABSENT', 'C4.' + (i + 1) + ' ' + JSON.stringify(v) + ' is ABSENT');
});
eq(POLICY.classify('', ORIGIN).reason, 'NO_IMAGE_URL_ON_RECORD', 'C4  and named as a DATA gap');
eq(boardState(''), 'IMAGE_SOURCE_MISSING', 'C4a the board calls it IMAGE_SOURCE_MISSING');
eq(skuDetailsSrc(sd, ''), '', 'C4b SKU Details renders its placeholder');
eq(sd.classifySkuImageSource({ sku: 'X', image: '' }).state, 'ABSENT', 'C4c reported as ABSENT');
eq(sd.classifySkuImageSource({ sku: 'X', image: '' }).reason, 'NO_IMAGE_URL_ON_RECORD',
  'C4d with the reason that tells an operator to fill the cell');

// ---- 5. INVALID / UNAPPROVED URL --------------------------------------------------------------
var REFUSALS = [
  ['javascript:alert(1)', 'UNSUPPORTED_SCHEME', 'a script url'],
  ['data:text/html;base64,PHNjcmlwdD4=', 'UNSUPPORTED_SCHEME', 'a data url'],
  ['vbscript:msgbox(1)', 'UNSUPPORTED_SCHEME', 'another script scheme'],
  ['C:\\Users\\viczh\\Desktop\\photo.jpg', 'LOCAL_FILE_PATH', 'a Windows path'],
  ['C:/Users/viczh/Desktop/photo.jpg', 'LOCAL_FILE_PATH', 'a Windows path with forward slashes'],
  ['\\\\server\\share\\photo.jpg', 'LOCAL_FILE_PATH', 'a UNC path'],
  ['file:///C:/photo.jpg', 'LOCAL_FILE_PATH', 'a file: url'],
  ['../../../etc/passwd.png', 'PATH_TRAVERSAL', 'a traversal'],
  ['1AbCdEfGhIjKlMnOpQrStUvWxYz0123456', 'OPAQUE_REFERENCE', 'a Drive id'],
  ['1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms', 'OPAQUE_REFERENCE', 'a Spreadsheet id'],
  ['https://evil.example.com/a.jpg', 'UNAPPROVED_HOST', 'an undeclared external host'],
  ['//evil.example.com/a.jpg', 'UNAPPROVED_HOST', 'a protocol-relative undeclared host'],
  ['https://cdn.declared.test/not-an-image', 'NOT_AN_IMAGE_FILENAME', 'an absolute url naming no file'],
  ['a.jpg" onerror="alert(1)', 'UNSUPPORTED_SCHEME', 'an attribute break-out attempt']
];
REFUSALS.forEach(function (r, i) {
  var v = POLICY.classify(r[0], ORIGIN);
  eq(v.kind, 'REJECTED', 'C5.' + (i + 1) + ' ' + r[2] + ' is REJECTED');
  eq(v.reason, r[1], 'C5.' + (i + 1) + 'a with reason ' + r[1]);
  eq(v.url, '', 'C5.' + (i + 1) + 'b AND `url` IS EMPTY — a caller reading only `url` still cannot'
    + ' put it in the DOM');
  eq(boardState(r[0]), 'UNVERIFIED_SOURCE_REFERENCE', 'C5.' + (i + 1) + 'c the board refuses it');
  eq(skuDetailsSrc(sd, r[0]), '', 'C5.' + (i + 1) + 'd AND SO DOES SKU DETAILS — which it did not before');
});
eq(sd.classifySkuImageSource({ sku: 'X', image: 'javascript:alert(1)' }).state, 'REFUSED',
  'C5  and SKU Details reports REFUSED, which is neither ABSENT nor PRESENT');
eq(sd.classifySkuImageSource({ sku: 'X', image: 'javascript:alert(1)' }).reason, 'UNSUPPORTED_SCHEME',
  'C5a naming what is wrong with the row, so it is fixable');

/* THE TWO FAILURES USED TO BE ONE ANSWER. "No url on the row" and "a url that is not an address"
   sent an operator to look for a missing value that was sitting right there. */
ok(sd.classifySkuImageSource({ sku: 'X', image: '' }).state
  !== sd.classifySkuImageSource({ sku: 'X', image: 'javascript:x' }).state,
  'C5b absent and refused are DIFFERENT states — the conflation is gone');

// ---- 6. BROKEN-IMAGE FALLBACK ----------------------------------------------------------------
/* THE POLICY CANNOT KNOW WHETHER A FILE IS THERE. It decides whether an address may be FETCHED;
   only the browser learns whether it WAS, so the fallback has to live in the renderer. SKU Details
   has had one since it shipped; the board had none, and drew an empty frame under a caption that
   claimed a photograph. */
ok(/onerror=/.test(SRC.skuDetails), 'C6  SKU Details has an onerror fallback (unchanged)');
eq((SRC.boardUi.match(/im\.onerror\s*=/g) || []).length, 2,
  'C6a and psb-board-ui.js now has one on BOTH of its <img> elements — there were two, not one');
ok(/IMAGE FAILED TO LOAD/.test(SRC.boardUi), 'C6b which says the file did not load');
ok(/IMAGE SOURCE MISSING/.test(SRC.boardUi), 'C6c and is a DIFFERENT message from "no url on the row"');
var figBlock = bodyOf(SRC.boardUi, 'var im = document.createElement(\'img\');', 'top.appendChild(fig)');
ok(figBlock.indexOf('removeChild(im)') !== -1,
  'C6d the failed <img> is REMOVED, not left behind the notice', figBlock.slice(0, 400));

// ---- 7/8/9 are §F, §H and §I ------------------------------------------------------------------

// =============================================================================================
section('§D  PARITY — THE TWO PAGES AGREE, IN BOTH DIRECTIONS');
// =============================================================================================
/* THE CONTRACT THE ROUND ASKED FOR, AS A LOOP RATHER THAN A CLAIM: whenever SKU Details can display
   a value, the board must display it; whenever SKU Details refuses, the board must refuse. A single
   table drives both, so neither side can be quietly special-cased. */
var PARITY = [].concat(
  Object.keys(MAPPINGS).map(function (k) { return MAPPINGS[k]; }),
  [bare, 'a/b/c/d.png', 'IMG_0042.JPEG', 'assets/img/products/CO1100-R.jpg?v=2', sameOrigin,
    '', '   ', 'javascript:alert(1)', 'C:\\x\\y.jpg', '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456',
    'https://evil.example.com/a.jpg', '../x.png', 'not-an-image', 'photo.jpg#frag']
);
var disagreements = [];
PARITY.forEach(function (v) {
  var shows = skuDetailsSrc(sd, v) !== '';
  var draws = boardState(v) === 'VERIFIED_DB_MAPPING';
  if (shows !== draws) disagreements.push({ value: v, skuDetails: shows, board: draws });
});
eq(disagreements, [], 'D1  NOT ONE VALUE IS DISPLAYED BY ONE PAGE AND REFUSED BY THE OTHER');
ok(PARITY.filter(function (v) { return skuDetailsSrc(sd, v) !== ''; }).length > 0,
  'D1a and the agreement is not "both refuse everything" — some do display');
ok(PARITY.filter(function (v) { return skuDetailsSrc(sd, v) === ''; }).length > 0,
  'D1b nor "both accept everything" — some are refused');

/* AND THE ADDRESS ITSELF MATCHES, not only the yes/no. A board that renders a DIFFERENT url from
   the one SKU Details renders is two mappings again, and the upgrade is where they would part. */
withApprovedHosts(['cdn.declared.test'], function () {
  var sdU = skuDetailsSandbox({ approvedHosts: ['cdn.declared.test'] });
  var v = 'http://cdn.declared.test/a.jpg';
  eq(ADAPTER.imageUrlOf({ product_image: v, missing_reasons: [] }), skuDetailsSrc(sdU, v),
    'D2  the two pages resolve the same value to the same ADDRESS, upgrade included');
  eq(ADAPTER.imageUrlOf({ product_image: v, missing_reasons: [] }), 'https://cdn.declared.test/a.jpg',
    'D2a and it is the upgraded one');
});
eq(ADAPTER.imageUrlOf({ product_image: 'javascript:x', missing_reasons: [] }), null,
  'D2b a refused reference yields no address at all');

/* THE ROW THE SELECTORS READ carries the resolved address, which is the seam that used to drop it. */
var adapted = ADAPTER.adaptRow({ marketplace_sku_id: 'M1', master_sku: 'CO1100-R',
  product_image: LIVE_SHAPE, missing_reasons: [], campaigns: [] }, '2026-09-12');
eq(adapted.image_identity_status, 'VERIFIED_DB_MAPPING', 'D3  the adapted row is verified');
eq(adapted.product_image, LIVE_SHAPE, 'D3a and carries the address the selectors put in <img src>');
eq(adapted.provenance.image_reference_kind, 'SAME_ORIGIN_ASSET',
  'D3b with the policy\'s verdict on the row, so "why no picture" is answerable from the data');
var adaptedBad = ADAPTER.adaptRow({ marketplace_sku_id: 'M2', master_sku: 'X',
  product_image: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456', missing_reasons: [], campaigns: [] }, '2026-09-12');
eq(adaptedBad.provenance.image_reference_reason, 'OPAQUE_REFERENCE',
  'D3c and a refused one carries the reason');
eq(adaptedBad.product_image, '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456',
  'D3d while the ORIGINAL cell survives on a refused row — an operator has to see what to fix');

/* THE SELECTORS' OWN EXPRESSION, run over both rows. */
function selectorImage(r) {
  return (r.image_identity_status === 'VERIFIED_DB_MAPPING' && r.product_image) ? r.product_image : null;
}
eq(selectorImage(adapted), LIVE_SHAPE, 'D4  the selectors draw the verified one');
eq(selectorImage(adaptedBad), null, 'D4a and draw nothing for the refused one');

// =============================================================================================
section('§E  THE ASSET-EVIDENCE CAPTURE, AND WHAT ITS PROVENANCE IS');
// =============================================================================================
var ASSETS = require(path.join(ROOT, 'assets/tests/_p1b8c-r3-asset-capture.js'));
eq(ASSETS.CAPTURE_KIND, 'ASSET_EVIDENCE', 'E1  the capture names its own kind');
eq(ASSETS.IMAGE_IDENTITY_IS_OPERATOR_ASSERTED, true, 'E1a the image identity is operator-asserted');
eq(ASSETS.PRICES_ARE_DEMONSTRATION_DATA, true, 'E1b AND THE PRICES ARE NOT — it says so itself');
eq(ASSETS.IMAGE_BASIS, 'OPERATOR_ASSERTED_DB_RECORD + EXACT_REPO_FILE_EXISTS', 'E1c with the basis');
eq(ASSETS.MAPPINGS, MAPPINGS, 'E2  it READS the contract\'s table rather than carrying a copy');
ok(!/CO1100-R\.jpg/.test(read('assets/tests/_p1b8c-r3-asset-capture.js')),
  'E2a and no path is retyped inside it, so the two cannot drift');
eq(ASSETS.MAPPED_SKUS.length, 7, 'E2b seven, and the list is closed');

var aw = ASSETS.workspaces();
var aKey = Object.keys(aw)[0];
var aRows = aw[aKey].data.normalizedRows;
eq(aRows.slice(0, 7).map(function (r) { return r.product_image; }),
  ASSETS.MAPPED_SKUS.map(function (k) { return MAPPINGS[k]; }),
  'E3  the first seven rows carry the seven asserted paths, in contract order');
eq(aRows[7].product_image, ASSETS.REFUSED_REFERENCE,
  'E3a AND THE EIGHTH CARRIES ONE THAT MUST BE REFUSED — a run where everything draws proves nothing');
eq(boardState(aRows[7].product_image), 'UNVERIFIED_SOURCE_REFERENCE', 'E3b and the board refuses it');
/* P1-B8C-R3-R1 EXTENDED THE CAPTURE. Rows 8 and 9 now carry the FILENAME-ONLY and ROOT-RELATIVE
   shapes, which the repository census found and R3's acceptance run had never rendered. */
eq(aRows[8].product_image, ASSETS.FILENAME_ONLY_REFERENCE,
  'E3c the ninth carries the legacy filename-only convention');
eq(aRows[9].product_image, ASSETS.ROOT_RELATIVE_REFERENCE,
  'E3c1 and the tenth the root-relative shape');
ok(aRows.slice(10).every(function (r) { return r.product_image === null; }),
  'E3c2 and the rest carry none, so every state is on one page');

/* THE THREE CAPTURES CANNOT WEAR EACH OTHER'S LABELS. */
var DET = require(path.join(ROOT, 'assets/tests/_p1b8c-capture.js'));
var LIVE = require(path.join(ROOT, 'assets/tests/_p1b8c-r2-live-derived.js'));
eq([DET.CAPTURE_KIND, LIVE.SOURCE_KIND, ASSETS.CAPTURE_KIND],
  ['DETERMINISTIC', 'LIVE_DERIVED_REDACTED', 'ASSET_EVIDENCE'], 'E4  three captures, three kinds');
eq(DET.IMAGE_PLACEHOLDER, 'REDACTED_IMAGE_REFERENCE',
  'E5  the deterministic redaction marker no longer looks like a file');
eq(POLICY.classify(DET.IMAGE_PLACEHOLDER, ORIGIN).reason, 'OPAQUE_REFERENCE',
  'E5a so the policy calls it what it is, and it cannot be drawn');
eq(boardState(DET.IMAGE_PLACEHOLDER), 'UNVERIFIED_SOURCE_REFERENCE',
  'E5b which keeps the de-identified capture unable to claim a photograph');
ok(/REDACTED/.test(String(LIVE.allRows()[0].product_image || 'null')) || LIVE.allRows()[0].product_image === null,
  'E5c and the live capture\'s addresses were removed by the diagnostic, as they had to be');

// =============================================================================================
section('§F  CASE 7 — THE LIVE SIXTY REPLAY, AND WHAT IT CAN AND CANNOT PROVE');
// =============================================================================================
var liveRows = LIVE.allRows();
eq(liveRows.length, 60, 'F1  sixty live-derived rows');
eq(LIVE.UNIVERSE_TOTAL_ROWS, 495, 'F1a out of a 495-row universe');
var liveStates = {};
liveRows.forEach(function (r) {
  var s2 = boardState(r.product_image);
  liveStates[s2] = (liveStates[s2] || 0) + 1;
});
eq(Object.keys(liveStates).sort(), ['IMAGE_SOURCE_MISSING', 'UNVERIFIED_SOURCE_REFERENCE'],
  'F2  every live row is still refused or absent — AND THAT IS NOT A REGRESSION');
eq(liveStates.UNVERIFIED_SOURCE_REFERENCE, 58, 'F2a fifty-eight carried a reference');
eq(liveStates.IMAGE_SOURCE_MISSING, 2, 'F2b and two carried nothing');
eq(LIVE.IMAGE_ADDRESS_IS_A_SUBSTITUTE, true,
  'F3  BECAUSE THE ADDRESSES WERE REMOVED BY THE DIAGNOSTIC, and the capture records that');
ok(true, 'F3a SO THE LIVE ROWS CANNOT DEMONSTRATE A RENDERED IMAGE, and are not asked to. Claiming'
  + ' "the live replay proves the pictures work" would be claiming evidence R2 deliberately destroyed.');

/* WHAT THE LIVE ROWS DO PROVE: that R3 broke nothing about the rest of the row. */
var liveAdapted = liveRows.map(function (r) { return ADAPTER.adaptRow(r, '2026-09-12'); });
eq(liveAdapted.length, 60, 'F4  all sixty still adapt');
ok(liveAdapted.every(function (r) { return r.marketplace_sku_id !== null; }), 'F4a with identity intact');
ok(liveAdapted.every(function (r) { return POLICY.REJECTION_REASONS.indexOf(
  r.provenance.image_reference_reason) !== -1 || r.provenance.image_reference_reason === 'NO_IMAGE_URL_ON_RECORD'; }),
  'F4b and every one carries a policy verdict rather than a silence');
ok(liveAdapted.every(function (r) { return selectorImage(r) === null; }),
  'F4c and not one of them offers an address to <img src>');

// =============================================================================================
section('§G  LOAD ORDER, AND FAILING CLOSED WHEN THE POLICY IS NOT THERE');
// =============================================================================================
var polTag = SRC.index.indexOf('km-image-reference-policy.js');
var ovrTag = SRC.index.indexOf('utils/sku-overrides.js');
var adpTag = SRC.index.indexOf('km-product-pricing-adapter.js');
ok(polTag > 0, 'G1  index.html loads the policy');
ok(polTag < ovrTag, 'G1a BEFORE sku-overrides.js');
ok(polTag < adpTag, 'G1b and before the pricing adapter');
ok(!/km-image-reference-policy\.js\?v=[^"]*p1b8c/.test(SRC.index),
  'G1c and its cache-bust token does not contain `p1b8c` — P1-B8C §C greps production for exactly that');

/* FAIL CLOSED. A safety rule with a lenient fallback is the lenient behaviour with extra steps. */
var sdNone = skuDetailsSandbox({ withoutPolicy: true });
eq(skuDetailsSrc(sdNone, LIVE_SHAPE), '',
  'G2  with no policy loaded SKU Details renders NOTHING rather than falling back to pass-through');
eq(sdNone.classifySkuImageSource({ sku: 'X', image: LIVE_SHAPE }).state, 'REFUSED',
  'G2a and reports REFUSED');
eq(sdNone.classifySkuImageSource({ sku: 'X', image: LIVE_SHAPE }).reason, 'IMAGE_POLICY_NOT_LOADED',
  'G2b naming the deployment fault rather than blaming the row');
var adpCtx = vm.createContext({ console: console, module: { exports: {} } });
vm.runInContext(SRC.adapter, adpCtx, { filename: 'adapter-no-policy.js' });
eq(adpCtx.KM_PRODUCT_PRICING_ADAPTER.imageStateOf({ product_image: LIVE_SHAPE, missing_reasons: [] }),
  'UNVERIFIED_SOURCE_REFERENCE', 'G2c and the adapter with no policy verifies NOTHING');

/* The acceptance runner is a browser too, and it had to be told. */
ok(/km-image-reference-policy/.test(SRC.runner),
  'G3  the visual runner loads the policy into its generated page');
ok(/<base href="\.\.\/\.\.\/">/.test(SRC.runner),
  'G3a and bases that page on the repo root, so a relative image resolves as it does when deployed');

// =============================================================================================
section('§H  CASE 8 — SEVEN VIEWPORTS IN A REAL BROWSER, AND naturalWidth');
// =============================================================================================
var EV = path.join(ROOT, 'docs', 'evidence', 'p1-b8c-r3-image-acceptance');
function measurements(which) {
  var f = path.join(EV, which, 'measurements.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}
var MA = measurements('assets'), ML = measurements('live');
ok(!!MA, 'H1  the asset-capture acceptance run produced measurements');
ok(!!ML, 'H1a and so did the live regression run');

var VPS = ['1920x1080', '1440x900', '1366x768', '1280x720', '1024x768', '768x1024', '390x844'];
if (MA) {
  eq(MA.capture, 'assets', 'H2  the asset run really replayed the asset capture');
  ok(/_p1b8c-r3-asset-capture\.js/.test(MA.capture_module), 'H2a and names both capture files');
  VPS.forEach(function (v, i) {
    var m = MA.viewports[v];
    ok(!!m, 'H3.' + (i + 1) + ' ' + v + ' was measured');
    if (!m) return;
    ok(m.htmlImages > 0, 'H3.' + (i + 1) + 'a ' + v + ' drew at least one <img>', m.htmlImages);
    eq(m.htmlImagesBroken, 0, 'H3.' + (i + 1) + 'b ' + v + ' AND NOT ONE OF THEM WAS BROKEN');
    eq(m.htmlImagesLoaded, m.htmlImages, 'H3.' + (i + 1) + 'c ' + v
      + ' every one reported naturalWidth > 0 — the bytes arrived');
    ok(m.imageMarkerCount > 0, 'H3.' + (i + 1) + 'd ' + v + ' and the chart drew photograph markers',
      m.imageMarkerCount);
    ok(m.fallbackMarkerCount > 0, 'H3.' + (i + 1) + 'e ' + v
      + ' WHILE STILL DRAWING PLATES for the rows that have none', m.fallbackMarkerCount);
    eq(m.page.horizontalOverflow, 0, 'H3.' + (i + 1) + 'f ' + v + ' no horizontal page overflow');
    eq((m.consoleErrors || []).length, 0, 'H3.' + (i + 1) + 'g ' + v + ' no console errors');
    eq(m.flagStillFalse, true, 'H3.' + (i + 1) + 'h ' + v + ' and the feature flag is still false');
  });
  /* THE HREFS ARE THE OPERATOR'S PATHS, not something the renderer built. */
  var hrefs = MA.viewports['1920x1080'].chartImageHrefs || [];
  ok(hrefs.length > 0, 'H4  the chart\'s image markers carry hrefs', hrefs);
  /* EVERY HREF IS A VALUE THE CAPTURE DECLARED — an operator-asserted mapping, or one of the two
     shapes P1-B8C-R3-R1 added and named. The rule being enforced is that NOTHING WAS COMPOSED: the
     renderer never builds an address, so every href must appear verbatim in the capture's own list. */
  var DECLARED = Object.keys(MAPPINGS).map(function (k) { return MAPPINGS[k]; })
    .concat([ASSETS.FILENAME_ONLY_REFERENCE, ASSETS.ROOT_RELATIVE_REFERENCE]);
  ok(hrefs.every(function (h) { return DECLARED.indexOf(h) !== -1; }),
    'H4a AND EVERY ONE IS A VALUE THE CAPTURE DECLARED — none was composed', hrefs);
  var ov = MA.views && MA.views.overview;
  if (ov) {
    ok(ov.catfigImages > 0, 'H5  the category cards drew photographs', ov.catfigImages);
    eq(ov.catfigLoaded, ov.catfigImages, 'H5a and every one of them loaded');
    eq(ov.catfigFailedNotices, 0, 'H5b with no "failed to load" notice');
  }
}
if (ML) {
  eq(ML.capture, 'live', 'H6  the live run replayed the live-derived capture');
  VPS.forEach(function (v, i) {
    var m = ML.viewports[v];
    if (!m) { ok(false, 'H6.' + (i + 1) + ' ' + v + ' was measured'); return; }
    eq(m.page.horizontalOverflow, 0, 'H6.' + (i + 1) + 'a ' + v + ' no overflow on live data');
    eq(m.yAxisFullyVisible, true, 'H6.' + (i + 1) + 'b ' + v + ' Y axis fully visible');
    eq(m.xLaneFullyVisible, true, 'H6.' + (i + 1) + 'c ' + v + ' X lane fully visible');
    eq((m.tabs || []).length, 6, 'H6.' + (i + 1) + 'd ' + v + ' six sub-tabs');
    eq((m.consoleErrors || []).length, 0, 'H6.' + (i + 1) + 'e ' + v + ' no console errors');
    eq(m.htmlImagesBroken, 0, 'H6.' + (i + 1) + 'f ' + v + ' AND NO BROKEN IMAGE — the redacted'
      + ' references are refused before they reach an <img>, not after');
    eq(m.flagStillFalse, true, 'H6.' + (i + 1) + 'g ' + v + ' flag still false');
  });
}

// =============================================================================================
section('§I  CASE 9 — NO OTHER PAGE CHANGED ITS LOOK');
// =============================================================================================
/* R3 SHIPPED NO CSS. The cheapest proof that no page's style moved is that no stylesheet did. */
var changed = cp.execFileSync('git', ['diff', '--name-only', PRE_R3_COMMIT, '--'],
  { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
eq(changed.filter(function (f) { return /\.css$/.test(f); }), [],
  'I1  not one stylesheet changed in this round', changed);
eq(changed.filter(function (f) { return /^assets\/html\//.test(f); }), [],
  'I1a and no page partial changed');
eq(changed.filter(function (f) { return /^assets\/specs\/active\/apps-script\//.test(f); }), [],
  'I1b and no Apps Script file changed');

/* index.html gained ONE script tag and nothing else. */
var idxDiff = cp.execFileSync('git', ['diff', '--unified=0', PRE_R3_COMMIT, '--', 'index.html'],
  { cwd: ROOT, encoding: 'utf8' }).split('\n');
var added = idxDiff.filter(function (l) { return /^\+[^+]/.test(l); });
var removed = idxDiff.filter(function (l) { return /^-[^-]/.test(l); });
eq(added.length, 1, 'I2  index.html gained exactly one line', added);
eq(removed.length, 0, 'I2a and lost none', removed);
ok(added.length === 1 && /km-image-reference-policy\.js/.test(added[0]),
  'I2b and that line is the policy script tag', added);

/* THE TWO PAGES THAT SHARE THE RESOLVER STILL CALL IT BY THE SAME NAMES. A rename would have been a
   migration for every caller; this round is a behaviour fix, not a refactor. */
ok(/window\.getNormalizedSkuImage\s*=\s*getNormalizedSkuImage/.test(SRC.overrides),
  'I3  getNormalizedSkuImage is still exported under its own name');
ok(/window\.resolveSkuImageUrl\s*=\s*resolveSkuImageUrl/.test(SRC.overrides),
  'I3a and so is resolveSkuImageUrl');
ok(/window\.classifySkuImageSource\s*=\s*classifySkuImageSource/.test(SRC.overrides),
  'I3b and classifySkuImageSource');
eq((SRC.overrides.match(/window\.resolveSkuImageUrl\s*=/g) || []).length, 1,
  'I3c exported ONCE — the duplicated export line beside it is gone');
ok(/getNormalizedSkuImage\(item\)/.test(SRC.skuDetails), 'I4  sku-details.js calls it unchanged');
ok(/getNormalizedSkuImage\(item\)/.test(SRC.skuHandbook), 'I4a and so does sku-handbook.js');

/* NO FEATURE FLAG, NAVIGATION, DEPLOYMENT OR RBAC MOVED. */
ok(!/PRODUCT_STRATEGY_ENABLED_\s*[^=]=\s*true/.test(read('assets/js/app.js')),
  'I5  the feature flag is still false');
ok(SRC.index.indexOf('data-menu-id="product-strategy"') === -1,
  'I5a index.html still renders no Product Strategy menu item');
/* AIMED AT SOURCE, NOT AT A FILENAME. The first version tested every changed path against
   /login|rbac|auth/i and matched `shot-state-not-authorized.png` — a SCREENSHOT of the board's
   not-authorized state, which is evidence that the state renders, not a change to Login or RBAC.
   Same shape of error as `REDACTION_FAILED` matching a search for `ACTION_`. */
eq(changed.filter(function (f) {
  return /\.(js|gs|html|css|json)$/.test(f) && /login|rbac|auth/i.test(f);
}), [], 'I5b and no Login/RBAC SOURCE file changed', changed);

// =============================================================================================
section('§J  MUTANTS');
// =============================================================================================
function swapIn(src, a, b2) {
  if (src.indexOf(a) === -1) throw new Error('anchor not found :: ' + a.slice(0, 80));
  return src.replace(a, b2);
}
function mut(label, fn) {
  var caught = false, note = '';
  try { caught = !!fn(); } catch (e) { caught = false; note = ' [threw: ' + e.message + ']'; }
  if (caught) { mutCaught++; console.log('ok   ' + label + ' — caught'); }
  else { mutSurvived++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED' + note); }
}
/** A policy built from mutated source, so a mutant tests the rule and not a stub. */
function policyWith(a, b2) {
  var ctx = vm.createContext({ console: console, module: { exports: {} } });
  vm.runInContext(swapIn(SRC.policy, a, b2), ctx, { filename: 'policy-mutant.js' });
  return ctx.KM_IMAGE_REFERENCE_POLICY;
}
function adapterWith(a, b2) {
  var ctx = vm.createContext({ console: console, module: { exports: {} },
    KM_IMAGE_REFERENCE_POLICY: POLICY });
  vm.runInContext(swapIn(SRC.adapter, a, b2), ctx, { filename: 'adapter-mutant.js' });
  return ctx.KM_PRODUCT_PRICING_ADAPTER;
}
function overridesWith(a, b2) {
  var sb = skuDetailsSandbox();
  var ctx = vm.createContext(sb);
  vm.runInContext(swapIn(SRC.overrides, a, b2), ctx, { filename: 'overrides-mutant.js' });
  return sb;
}

mut('J1  the extension test is dropped, so a Drive id becomes a drawable asset — C5.9', function () {
  var P2 = policyWith('    if (!hasImageExtension(v)) return reject(\'OPAQUE_REFERENCE\', v);', '');
  return POLICY.classify('1AbCdEfGhIjKlMnOpQrStUvWxYz0123456', ORIGIN).kind === 'REJECTED'
    && P2.classify('1AbCdEfGhIjKlMnOpQrStUvWxYz0123456', ORIGIN).kind === 'SAME_ORIGIN_ASSET';
});

mut('J2  the host allowlist stops being consulted, so any domain is approved — C5.11', function () {
  var P2 = policyWith('      if (!sameOrigin && !listed) return reject(\'UNAPPROVED_HOST\', v);', '');
  return POLICY.classify('https://evil.example.com/a.jpg', ORIGIN).reason === 'UNAPPROVED_HOST'
    && P2.classify('https://evil.example.com/a.jpg', ORIGIN).kind === 'ABSOLUTE_APPROVED';
});

mut('J3  the backslash check goes, so a UNC path reaches <img src> — C5.6', function () {
  /* THE FIRST VERSION USED `C:\\Users\\...` AND SURVIVED LEGITIMATELY. With the backslash rule
     removed, `C:` still matches the other-scheme guard, so the value stayed rejected — by a
     DIFFERENT rule. A mutant that dies to a rule it did not remove proves nothing about the one it
     did. A UNC path has no scheme and ends in a real filename, so only the backslash rule stands
     between it and an <img src>. */
  var P2 = policyWith("    if (v.indexOf('\\\\') !== -1) return reject('LOCAL_FILE_PATH', v);", '');
  var unc = '\\\\fileserver\\share\\photo.jpg';
  return POLICY.classify(unc, ORIGIN).reason === 'LOCAL_FILE_PATH'
    && P2.classify(unc, ORIGIN).accepted === true;
});

mut('J4  the other-scheme guard goes, so javascript: is treated as a relative path — C5.1',
  function () {
    var P2 = policyWith(
      "    if (/^[A-Za-z][A-Za-z0-9+.\\-]*:/.test(v)) return reject('UNSUPPORTED_SCHEME', v);", '');
    /* The mutant must not be caught by the extension rule instead of the one under test, so the
       value ends in a filename. A mutant that dies to a DIFFERENT rule proves nothing about this one. */
    var js = 'javascript:void(0)/x.jpg';
    return POLICY.classify(js, ORIGIN).kind === 'REJECTED' && P2.classify(js, ORIGIN).accepted === true;
  });

mut('J5  traversal is allowed, so a reference can climb out of the asset tree — C5.8', function () {
  var P2 = policyWith("    if (v.indexOf('..') !== -1) return reject('PATH_TRAVERSAL', v);", '');
  return POLICY.classify('../../secret/x.png', ORIGIN).reason === 'PATH_TRAVERSAL'
    && P2.classify('../../secret/x.png', ORIGIN).accepted === true;
});

mut('J6  `url` is filled in on a rejection, so a caller reading only `url` renders it — C5.*b',
  function () {
    var P2 = policyWith(
      "    return { accepted: false, kind: 'REJECTED', reason: reason, url: '', input: raw, note: null };",
      "    return { accepted: false, kind: 'REJECTED', reason: reason, url: raw, input: raw, note: null };");
    return POLICY.classify('javascript:alert(1)', ORIGIN).url === ''
      && P2.classify('javascript:alert(1)', ORIGIN).url === 'javascript:alert(1)';
  });

mut('J7  the mixed-content upgrade is dropped — B4', function () {
  var P2 = policyWith("        url = 'https://' + url.slice('http://'.length);", '');
  var o = { pageProtocol: 'https:', pageHost: ORIGIN.pageHost, approvedHosts: ['cdn.declared.test'] };
  return POLICY.classify('http://cdn.declared.test/a.jpg', o).url === 'https://cdn.declared.test/a.jpg'
    && P2.classify('http://cdn.declared.test/a.jpg', o).url === 'http://cdn.declared.test/a.jpg';
});

mut('J8  the upgrade becomes unconditional, so an http page rewrites too — B4a', function () {
  var P2 = policyWith("      if (/^http:\\/\\//i.test(url) && org.protocol === 'https:') {",
    "      if (/^http:\\/\\//i.test(url)) {");
  var o = { pageProtocol: 'http:', pageHost: ORIGIN.pageHost, approvedHosts: ['cdn.declared.test'] };
  return POLICY.classify('http://cdn.declared.test/a.jpg', o).url === 'http://cdn.declared.test/a.jpg'
    && P2.classify('http://cdn.declared.test/a.jpg', o).url === 'https://cdn.declared.test/a.jpg';
});

mut('J9  the adapter stops asking the policy and accepts anything non-blank — C1c/C5c', function () {
  var A2 = adapterWith("    if (!P.classify(v).accepted) return 'UNVERIFIED_SOURCE_REFERENCE';", '');
  var bad = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456';
  return ADAPTER.imageStateOf({ product_image: bad, missing_reasons: [] })
    === 'UNVERIFIED_SOURCE_REFERENCE'
    && A2.imageStateOf({ product_image: bad, missing_reasons: [] }) === 'VERIFIED_DB_MAPPING';
});

mut('J10 the adapter falls OPEN when the policy is missing — G2c', function () {
  var A2 = adapterWith("    if (!P) return 'UNVERIFIED_SOURCE_REFERENCE';",
    "    if (!P) return 'VERIFIED_DB_MAPPING';");
  /* Both are run WITHOUT a policy in scope, which is the condition the line exists for. */
  function noPolicy(src) {
    var ctx = vm.createContext({ console: console, module: { exports: {} } });
    vm.runInContext(src, ctx, { filename: 'x.js' });
    return ctx.KM_PRODUCT_PRICING_ADAPTER;
  }
  var live0 = noPolicy(SRC.adapter);
  var mutated = noPolicy(swapIn(SRC.adapter, "    if (!P) return 'UNVERIFIED_SOURCE_REFERENCE';",
    "    if (!P) return 'VERIFIED_DB_MAPPING';"));
  return A2 && live0.imageStateOf({ product_image: LIVE_SHAPE, missing_reasons: [] })
    === 'UNVERIFIED_SOURCE_REFERENCE'
    && mutated.imageStateOf({ product_image: LIVE_SHAPE, missing_reasons: [] }) === 'VERIFIED_DB_MAPPING';
});

mut('J11 sku-overrides falls back to pass-through when the policy is missing — G2', function () {
  /* A MUTATED MODULE GETS A FRESH SANDBOX. The first version ran the mutant into a context that had
     already executed the real file, and sku-overrides.js opens with `const SKU_LIFECYCLE_KEY` — so
     the mutant threw on a redeclaration and was scored as surviving. The throw had nothing to do
     with the rule; it was two copies of one module in one realm. */
  var mutated = swapIn(SRC.overrides,
    "        try { console.error('[SKU Overrides] km-image-reference-policy.js is not loaded; refusing to resolve an image reference.'); } catch (e) {}\n        return '';",
    "        return String(imageUrl || '');");
  var sb = skuDetailsSandbox({ withoutPolicy: true, source: mutated });
  return skuDetailsSrc(skuDetailsSandbox({ withoutPolicy: true }), 'javascript:x') === ''
    && sb.getNormalizedSkuImage({ sku: 'X', image: 'javascript:x' }) === 'javascript:x';
});

mut('J12 the adapter carries the RAW cell instead of the resolved address — D2', function () {
  var A2 = adapterWith(
    "      product_image: (imageState === 'VERIFIED_DB_MAPPING'\n"
    + "        ? A.imageUrlOf(live)\n"
    + "        : (str(live.product_image) || null)),",
    '      product_image: str(live.product_image) || null,');
  return withApprovedHosts(['cdn.declared.test'], function () {
    var row = { marketplace_sku_id: 'M', master_sku: 'X', missing_reasons: [], campaigns: [],
      product_image: 'http://cdn.declared.test/a.jpg' };
    return ADAPTER.adaptRow(row, '2026-09-12').product_image === 'https://cdn.declared.test/a.jpg'
      && A2.adaptRow(row, '2026-09-12').product_image === 'http://cdn.declared.test/a.jpg';
  });
});

mut('J13 ONE of the board\'s two broken-image fallbacks is removed — C6a', function () {
  /* THE DETECTOR HAS TO BE C6a's OWN COMPARISON, WHICH IS A COUNT. The first version asked
     whether `im.onerror` still appeared ANYWHERE; there are TWO of them, so removing one left
     the other and the mutant survived — while the defect it models is precisely the one this
     file already had: a fallback added to the category card and forgotten on the table. */
  function n(src) { return (src.match(/im\.onerror\s*=/g) || []).length; }
  var mutated = swapIn(SRC.boardUi, '      im.onerror = function () {',
    '      im.__noerror = function () {');
  return n(SRC.boardUi) === 2 && n(mutated) === 1;
});

mut('J14 the deterministic capture\'s redaction marker becomes drawable again — E5', function () {
  var capSrc = read('assets/tests/_p1b8c-capture.js');
  var mutated = swapIn(capSrc, "C.IMAGE_PLACEHOLDER = 'REDACTED_IMAGE_REFERENCE';",
    "C.IMAGE_PLACEHOLDER = '_p1b8c-swatch.svg';");
  var ctx = vm.createContext({ console: console, module: { exports: {} } });
  vm.runInContext(mutated, ctx, { filename: 'cap-mut.js' });
  return POLICY.classify(DET.IMAGE_PLACEHOLDER, ORIGIN).accepted === false
    && POLICY.classify(ctx.P1B8C_CAPTURE.IMAGE_PLACEHOLDER, ORIGIN).accepted === true;
});

mut('J15 the asset capture stops carrying a refusable reference, so everything draws — E3a',
  function () {
    var src = read('assets/tests/_p1b8c-r3-asset-capture.js');
    var mutated = swapIn(src, '    if (i === A.MAPPED_SKUS.length) return A.REFUSED_REFERENCE;', '');
    var ctx = vm.createContext({ console: console, module: { exports: {} },
      P1B8C_CAPTURE: DET, PSB_CONTRACT: CONTRACT });
    vm.runInContext(mutated, ctx, { filename: 'assets-mut.js' });
    var m2 = ctx.P1B8C_R3_ASSETS.workspaces();
    var k2 = Object.keys(m2)[0];
    return aRows[7].product_image === ASSETS.REFUSED_REFERENCE
      && m2[k2].data.normalizedRows[7].product_image === null;
  });

mut('J16 the asset capture retypes the mappings instead of reading the contract — E2', function () {
  var src = read('assets/tests/_p1b8c-r3-asset-capture.js');
  return /contract\(\)\.IMAGE_POLICY\.verified_mappings/.test(src)
    && !/'CO1100-R':\s*'assets\/img/.test(src);
});

mut('J17 the visual runner drops the policy from its page, so every image silently vanishes — G3',
  function () {
    var mutated = swapIn(SRC.runner, '|km-image-reference-policy/', '/');
    return /km-image-reference-policy/.test(SRC.runner)
      && !/WANTED = [^\n]*km-image-reference-policy/.test(mutated);
  });

mut('J18 the page loses its <base>, so a relative image 404s and the run photographs the fallback',
  function () {
    var mutated = swapIn(SRC.runner, "    '  <base href=\"../../\">',", '');
    return /<base href="\.\.\/\.\.\/">/.test(SRC.runner) && !/<base href/.test(mutated);
  });

mut('J19 whitespace inside a reference is allowed, so one cell becomes two attributes', function () {
  var P2 = policyWith("    if (/\\s/.test(v)) return reject('UNSUPPORTED_SCHEME', v);", '');
  var v = 'a.jpg onerror=alert(1) x.jpg';
  return POLICY.classify(v, ORIGIN).kind === 'REJECTED' && P2.classify(v, ORIGIN).accepted === true;
});

mut('J20 an absolute url stops needing to name a file — C5.13', function () {
  var P2 = policyWith("      if (!hasImageExtension(m[3] || '')) return reject('NOT_AN_IMAGE_FILENAME', v);", '');
  var o = { pageProtocol: 'https:', pageHost: ORIGIN.pageHost, approvedHosts: ['cdn.declared.test'] };
  return POLICY.classify('https://cdn.declared.test/redirect?to=x', o).kind === 'REJECTED'
    && P2.classify('https://cdn.declared.test/redirect?to=x', o).accepted === true;
});

// =============================================================================================
console.log('\n===================================================================================');
console.log((fail ? 'FAIL' : 'PASS') + ' — passed ' + pass + '  failed ' + fail
  + '  |  mutants caught ' + mutCaught + '  survived ' + mutSurvived);
console.log('===================================================================================');
process.exit(fail ? 1 : 0);
