// F1-7N-FB-4E-R3 §F + §G — THE IMAGE FALLBACK, AND THE INVARIANTS THIS ROUND MUST NOT BREAK.
//
// §A proved by execution that the SKU Handbook image field is not lost anywhere in the pipeline: the sheet's
// `image_url` survives the scoped read as `image`, survives buildSkuKnowledgeItems and survives
// getNormalizedSkuImage. So §F is not a "restore the field" problem. What was actually wrong at the render
// boundary was two things, and this suite pins both:
//
//   1. THE PLACEHOLDER MEANT TWO DIFFERENT THINGS. A card showed the same 📦 whether the row had no image_url or
//      had one the browser refused, because the inline `onerror` replaced the container with the identical
//      placeholder. Those have opposite fixes — fill in the sheet vs fix the image host — and the page erased
//      the difference before anyone could act on it.
//   2. AN http:// IMAGE ON AN https:// PAGE IS BLOCKED as mixed content. Nothing has to change in the sheet for
//      that to start happening, which fits "images that PREVIOUSLY appeared now show the placeholder" exactly.
//
// §G then asserts, by execution wherever execution is possible, the invariants the whole round is accountable to.
//
// Run: node assets/tests/read-stability-images-and-invariants-f1-7n-fb-4e-r3.test.js

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var ROOT = path.join(__dirname, '..', '..');
var GS_DIR = path.join(ROOT, 'assets', 'specs', 'active', 'apps-script');

var passed = 0, failed = 0;
function ok(c, m) { if (c) { passed++; } else { failed++; console.log('  FAIL ' + m); } }
function eq(a, b, m) { ok(a === b, m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n' + t); }
function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }

var HANDBOOK = read('assets/js/pages/sku-handbook.js');
var OVERRIDES = read('assets/js/utils/sku-overrides.js');
var OVERSEAS = read('assets/js/pages/overseas-stock.js');
var DBAPI = read('assets/js/api/operation-system-db-api.js');
var FOUND = read('assets/js/api/km-api-foundation.js');
var TRANSPORT = read('assets/js/api/km-transport.js');
var SCOPEREG = read('assets/js/core/scope-registry.js');
var INV = read('assets/js/pages/inventory-replenishment.js');
var RTR = read('assets/specs/active/apps-script/01_router.gs');
var G63 = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
var G70 = read('assets/specs/active/apps-script/70_api_v1_overseas_stock_workspace.gs');
var HTML = read('index.html');

// A minimal DOM good enough for the image renderer: it creates one element and replaces one child.
function makeDom() {
  var created = [];
  function el(tag) {
    var e = { tagName: tag, className: '', textContent: '', attrs: {}, children: [], parentNode: null,
      setAttribute: function (k, v) { this.attrs[k] = String(v); },
      getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
      appendChild: function (c) { c.parentNode = this; this.children.push(c); return c; },
      replaceChild: function (n2, o2) { var i = this.children.indexOf(o2); if (i >= 0) { this.children[i] = n2; n2.parentNode = this; o2.parentNode = null; } return o2; } };
    created.push(e); return e;
  }
  return { document: { createElement: el, getElementById: function () { return null; },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    addEventListener: function () {}, removeEventListener: function () {} }, created: created, el: el };
}

// The two shipped modules that own the image, executed together with a controllable page protocol.
function loadImageStack(protocol) {
  var dom = makeDom();
  var store = {};
  var win = { location: { protocol: protocol || 'https:', origin: 'https://x.github.io' }, KM: {} };
  var sb = {
    console: console, window: win, document: dom.document, JSON: JSON, Math: Math, Date: Date, RegExp: RegExp,
    Array: Array, Object: Object, String: String, Number: Number, Boolean: Boolean, Error: Error, Set: Set,
    isFinite: isFinite, isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat,
    localStorage: { getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } }
  };
  sb.globalThis = sb; sb.self = sb;
  var ctx = vm.createContext(sb);
  vm.runInContext(OVERRIDES, ctx, { filename: 'sku-overrides.js' });
  // Only the image helpers are needed from the handbook, and it references page globals at load, so the helper
  // block is extracted rather than the whole file executed. Extracted from the SHIPPED source, not retyped.
  var start = HANDBOOK.indexOf('var _skuhImgStats =');
  var end = HANDBOOK.indexOf('function renderSkuCard(item) {');
  ok(start > 0 && end > start, 'F0 the image helper block is locatable in the shipped page');
  vm.runInContext(HANDBOOK.slice(start, end), ctx, { filename: 'sku-handbook-img.js' });
  return { sb: sb, win: win, dom: dom };
}

// =============================================================================================================
section('§F — THE IMAGE: absent and failed are now DIFFERENT states, and both are reported');
// =============================================================================================================
var S = loadImageStack('https:');

// (a) A valid image renders as an <img> with the url intact.
var htmlA = S.sb._skuhImgHtml({ sku: 'SKU-A', productName: 'Can Opener', image: 'https://cdn.example.com/a.jpg' });
ok(/^<img /.test(htmlA), 'F1 a row WITH an image renders an <img>, not a placeholder');
ok(htmlA.indexOf('src="https://cdn.example.com/a.jpg"') > 0, 'F1 with the canonical url intact');
ok(htmlA.indexOf('data-skuh-img="present"') > 0, 'F1 marked PRESENT, machine-readably');
ok(htmlA.indexOf('onerror="window._skuhImgFailed(this)"') > 0, 'F1 and wired to the non-destructive failure handler');
ok(htmlA.indexOf('loading="lazy"') > 0, 'F1 and lazy, so a long handbook does not fetch every image at once');
// The renderer must go through the CLASSIFIER, not its own inline test: the classifier is what performs the
// mixed-content upgrade and reports it, so a renderer that bypassed it would lose both silently.
ok(/window\.classifySkuImageSource \? classifySkuImageSource\(item\)/.test(HANDBOOK),
  'F1 the renderer resolves through classifySkuImageSource');
ok(/window\.classifySkuImageSource = classifySkuImageSource;/.test(OVERRIDES),
  'F1 which the overrides module exports — so the renderer cannot silently fall back to its own inline test');
eq(typeof S.sb.classifySkuImageSource, 'function', 'F1 and it is present in the executed stack');

// (b) A missing image renders the placeholder, and says WHY.
var htmlB = S.sb._skuhImgHtml({ sku: 'SKU-C', productName: 'No Image', image: '' });
ok(htmlB.indexOf('data-skuh-img="absent"') > 0, 'F2 a row WITHOUT an image renders the placeholder marked ABSENT');
ok(/sku_details\.image_url is empty/.test(htmlB), 'F2 and the title says it is a DATA gap, not a load failure');
ok(htmlB.indexOf('<img') < 0, 'F2 with no <img> tag at all');

// (c) THE DEFECT: the two states are now distinguishable. Before R3 both produced the same placeholder.
ok(htmlA.indexOf('data-skuh-img="present"') > 0 && htmlB.indexOf('data-skuh-img="absent"') > 0,
  'F3 absent and present are DIFFERENT states in the DOM — the conflation is gone');

// (d) A failure is non-destructive and produces a THIRD, distinct state.
var container = S.dom.el('div');
var img = S.dom.el('img');
var sibling = S.dom.el('span');
container.appendChild(img); container.appendChild(sibling);
S.win._skuhImgFailed(img);
eq(container.children.length, 2, 'F4 a failed image does NOT wipe its container — the sibling survives');
ok(container.children.indexOf(sibling) >= 0, 'F4 and it is still the same sibling node, not a re-created one');
eq(container.children[0].getAttribute('data-skuh-img'), 'failed', 'F4 the img is replaced by a FAILED marker');
ok(/image-hosting or permission problem/.test(container.children[0].getAttribute('title') || ''),
  'F4 whose title says it is a HOSTING problem, not missing data');
ok(container.children[0].textContent !== '📦', 'F4 and it does NOT reuse the "no image on record" glyph');
S.win._skuhImgFailed(img);
eq(S.win._skuhImageDiagnostic_().images_on_record_that_failed_to_load, 1, 'F4 a repeat onerror is counted once, not twice');

// (e) The counts separate the two faults, which is what makes §F.2 answerable at all.
var d = S.win._skuhImageDiagnostic_();
eq(d.skus_with_image_url, 1, 'F5 the diagnostic counts rows WITH an image');
eq(d.skus_without_image_url, 1, 'F5 and rows WITHOUT one, separately');
ok(/DATA gap/.test(d.note) && /HOSTING/.test(d.note), 'F5 and states plainly that these are different faults');

// (f) MIXED CONTENT: an http:// image on an https:// page is upgraded, and reported.
eq(S.sb.resolveSkuImageUrl('http://cdn.example.com/a.jpg'), 'https://cdn.example.com/a.jpg',
  'F6 an http:// image on an https:// page is upgraded — browsers BLOCK mixed content');
eq(S.sb.classifySkuImageSource({ sku: 'X', image: 'http://cdn.example.com/a.jpg' }).note, 'UPGRADED_HTTP_TO_HTTPS',
  'F6 and the upgrade is reported rather than silent');
var Shttp = loadImageStack('http:');
eq(Shttp.sb.resolveSkuImageUrl('http://cdn.example.com/a.jpg'), 'http://cdn.example.com/a.jpg',
  'F6 on an http: page nothing is rewritten — the upgrade is conditional, not a blanket rewrite');
eq(S.sb.resolveSkuImageUrl('/local/a.jpg'), '/local/a.jpg', 'F6 a relative path is untouched');
eq(S.sb.resolveSkuImageUrl(''), '', 'F6 and a blank stays blank');
eq(S.sb.classifySkuImageSource({ sku: 'X', image: '' }).state, 'ABSENT', 'F6 a blank is ABSENT');
eq(S.sb.classifySkuImageSource({ sku: 'X', image: '' }).reason, 'NO_IMAGE_URL_ON_RECORD', 'F6 named as a data gap');

// (g) NO LIVE DATA IS EDITED AND NO URL IS INVENTED.
ok(!/setSkuImageOverride\(/.test(HANDBOOK), 'F7 the handbook never writes an image override');
ok(!/upsertSkuDetail|image_url\s*[:=]\s*['"]http/.test(HANDBOOK), 'F7 and never writes or fabricates an image_url');
var resolveFn = OVERRIDES.slice(OVERRIDES.indexOf('function resolveSkuImageUrl'), OVERRIDES.indexOf('function classifySkuImageSource'));
ok(!/cdn|placeholder\.|example\.com|googleusercontent/.test(resolveFn),
  'F7 the resolver invents no host — it only rewrites the SCHEME of a value already on the row');

// (h) The url and alt are escaped: live sheet strings go into HTML attributes.
var htmlQ = S.sb._skuhImgHtml({ sku: 'Q', productName: 'He said "hi"', image: 'https://x/a.jpg?a=1&b=2' });
ok(htmlQ.indexOf('&amp;b=2') > 0, 'F8 an ampersand in the url is escaped, so the tag survives');
ok(htmlQ.indexOf('&quot;hi&quot;') > 0, 'F8 and a quote in the product name cannot break out of the alt attribute');
ok(htmlQ.indexOf('alt="He said "hi""') < 0, 'F8 the unescaped form is definitely not emitted');

// =============================================================================================================
section('§G — THE INVARIANTS THIS ROUND IS ACCOUNTABLE TO');
// =============================================================================================================

// G1 — no whole-DB primary read anywhere this round touched.
[['overseas-stock.js', OVERSEAS], ['sku-handbook.js', HANDBOOK], ['inventory-replenishment.js', INV]].forEach(function (p) {
  ok(!/getOperationDbFromSheet/.test(p[1]), 'G1 ' + p[0] + ' never calls the whole-DB reader');
});
var osPrimary = OVERSEAS.slice(OVERSEAS.indexOf('function _osLoadPrimary_'), OVERSEAS.indexOf('window._osReadPathDiagnostic_'));
ok(!/loadOperationDb/.test(osPrimary), 'G1 and the Overseas primary read path contains no whole-DB call');

// G2 — Overseas mounts on ONE scoped workspace request.
ok(/loadOverseasStockWorkspace/.test(osPrimary), 'G2 the Overseas primary read is the scoped workspace action');
ok(/action === 'overseasStock\.workspace\.get'/.test(RTR), 'G2 which the router dispatches');
ok(/function handleOverseasStockWorkspaceGet_/.test(G70), 'G2 to a handler that exists in 70_');
ok(/action: 'overseasStock\.workspace\.get', handler: 'handleOverseasStockWorkspaceGet_'/.test(G63),
  'G2 and it is REGISTERED in the same change that routes it');
// The one fallback is narrow and named.
ok(/_osDeploymentLacksAction_/.test(osPrimary), 'G2 the only fallback is gated on a NAMED deployment fact');
var gateFn = OVERSEAS.slice(OVERSEAS.indexOf('function _osDeploymentLacksAction_'), OVERSEAS.indexOf('function _osLoadPrimary_'));
ok(/DEPLOYMENT_CONTRACT_MISMATCH/.test(gateFn) && /WORKSPACE_API_UNAVAILABLE/.test(gateFn),
  'G2 and on exactly those two codes — not on any error');
ok(/if \(!_osDeploymentLacksAction_\(err\)\) throw err;/.test(osPrimary),
  'G2 so every other failure is REPORTED, never widened into the fan-out');

// G3 — ONE loading state on Overseas.
eq((OVERSEAS.match(/var _OS_LOADING_TEXT = /g) || []).length, 1, 'G3 there is exactly one Overseas loading string');
ok(!/>Loading…</.test(OVERSEAS), 'G3 and the second, different loading message is gone');
eq((OVERSEAS.match(/_OS_LOADING_TEXT/g) || []).length, 3, 'G3 declared once and used by both loading surfaces');

// G4 — Site Inventory does not load every site's inventory, and the search gate still owns application.
ok(/inventoryScope\.registry\.get/.test(DBAPI), 'G4 the slim scope registry is still the picker authority');
var bootFn = INV.slice(INV.indexOf('function _irBootstrapScope_'), INV.indexOf('window._irBootstrapDiagnostic_'));
ok(/_irScopeIsValid_\(/.test(bootFn), 'G4 a remembered scope is validated against the registry before use');
ok(/_irApplySearch_\(/.test(bootFn), 'G4 and applied only through the single assignment point');
eq((INV.match(/_irSearch\.applied = \{/g) || []).length, 1, 'G4 `applied` is still assigned in exactly ONE place');
ok(/_irForgetScope_\(\);/.test(bootFn), 'G4 an invalid remembered scope is DISCARDED, not applied');

// G5 — scope A data cannot render under scope B.
ok(/if \(mySeq !== _irSearch\.seq\) return/.test(bootFn), 'G5 the bootstrap is superseded by a newer scope generation');
ok(/if \(mySeq !== _irSearch\.seq\) return;/.test(INV.slice(INV.indexOf('function _irApplySearch_'))),
  'G5 and so is the apply step');
ok(/if \(mySeq !== _irReadSeq\) return _irReadModel;/.test(INV), 'G5 a late workspace answer cannot overwrite a newer one');
// The scoped in-flight key carries the scope, so a shared read can never cross scopes.
ok(/function canonicalScope\(value\)/.test(TRANSPORT), 'G5 the shared in-flight key is scope-complete by construction');
ok(/if \(a === '' \|\| sc === ''\) return '';/.test(TRANSPORT), 'G5 and an uncomputable scope is NOT shared');

// G6 — no retry policy was added to writes.
ok(/if \(str\(o\.kind\) === 'write'\) return false;/.test(TRANSPORT), 'G6 the shared policy still refuses to replay a write');
var invokeFn = FOUND.slice(FOUND.indexOf('var _workspaceInvoke = function'), FOUND.indexOf('// ---- API-2 · Weekly Shipping READ workspace resolver'));
ok(/kind: 'read'/.test(invokeFn), 'G6 the workspace retry gate asks the policy about a READ only');
ok(!/kind: 'write'/.test(invokeFn), 'G6 and never about a write');
ok(!/method: 'GET'/.test(invokeFn), 'G6 the retry is never a GET');

// G7 — a genuine method downgrade still fails closed.
ok(/proved: !!\(getHandlerAnswered && bodyLost && evidence\.request_id_correlated\)/.test(FOUND),
  'G7 the downgrade claim still requires the full five-fact proof');
ok(/if \(!pf\.proved\) return serverEnv;/.test(invokeFn), 'G7 an unproved downgrade is NOT retried');
ok(/return once\(\);                                  \/\/ exactly one more attempt/.test(invokeFn),
  'G7 and a proved one is retried exactly once — a second failure is returned unchanged');

// G8 — zero write primitives in any read path, proven by executing the deployment.
(function () {
  var violations = [];
  function forbid(n) { return function () { violations.push(n); return null; }; }
  var T = { overseas_inventory_snapshot: [['snapshot_id', 'warehouse_id', 'sku'], ['S1', 'W1', 'SKU-A']],
    overseas_inventory_movements: [['movement_id', 'warehouse_id'], ['M1', 'W1']],
    warehouses: [['warehouse_id', 'is_overseas_warehouse'], ['W1', 'TRUE']],
    // The wide columns matter: without one the "drops what it does not need" assertion below would pass
    // vacuously against a narrow fixture, which is exactly the trap this round keeps finding in old suites.
    sku_details: [['sku', 'category', 'series', 'lifecycle', 'item_length', 'package_weight', 'hscode'],
                  ['SKU-A', 'K', 'M', 'Running', '10', '2.5', '1234.56']] };
  function sh(n) {
    var t = T[n];
    return { getName: function () { return n; },
      getDataRange: function () { return { getValues: function () { return t.map(function (r) { return r.slice(); }); } }; },
      getLastRow: function () { return t.length; }, getLastColumn: function () { return t[0].length; },
      getRange: function (row, col, nr, nc) {
        var win = []; for (var i = 0; i < (nr || 1); i++) { var src = t[(row || 1) - 1 + i] || []; var line = [];
          for (var j = 0; j < (nc || 1); j++) line.push(src[(col || 1) - 1 + j] === undefined ? '' : src[(col || 1) - 1 + j]); win.push(line); }
        return { getValues: function () { return win; }, getValue: function () { return win[0][0]; },
          setValue: forbid('setValue'), setValues: forbid('setValues') }; },
      appendRow: forbid('appendRow'), deleteRow: forbid('deleteRow') };
  }
  var PROD = (/var PRODUCTION_DB_SPREADSHEET_ID_ = '([^']+)'/.exec(read('assets/specs/active/apps-script/00_config.gs')) || [])[1];
  var ss = { getSheetByName: function (n) { return T[n] ? sh(n) : null; }, getId: function () { return PROD; },
    insertSheet: forbid('insertSheet'), deleteSheet: forbid('deleteSheet') };
  var sb = { console: console, JSON: JSON, Math: Math, Date: Date, Array: Array, Object: Object, String: String,
    Number: Number, Boolean: Boolean, RegExp: RegExp, Error: Error, isFinite: isFinite, isNaN: isNaN,
    parseInt: parseInt, parseFloat: parseFloat, encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent,
    ContentService: { MimeType: { JSON: 'a' }, createTextOutput: function (x) { return { _t: x, setMimeType: function () { return this; }, getContent: function () { return this._t; } }; } },
    Utilities: { getUuid: function () { return 'X'; }, formatDate: function () { return '2026-08-27'; }, sleep: function () {} },
    Logger: { log: function () {} }, SpreadsheetApp: { openById: function () { return ss; }, getActiveSpreadsheet: function () { return ss; } },
    PropertiesService: { getScriptProperties: function () { return { getProperty: function () { return null; }, setProperty: forbid('setProperty') }; } },
    Session: { getActiveUser: function () { return { getEmail: function () { return ''; } }; }, getScriptTimeZone: function () { return 'Asia/Taipei'; } },
    LockService: { getScriptLock: function () { violations.push('getScriptLock'); return { tryLock: function () { return true; }, releaseLock: function () {} }; } },
    CacheService: { getScriptCache: function () { return { get: function () { return null; }, put: function () {} }; } },
    DriveApp: { createFile: forbid('DriveApp') }, UrlFetchApp: {}, MailApp: { sendEmail: forbid('MailApp') },
    GmailApp: {}, HtmlService: {}, ScriptApp: { newTrigger: forbid('ScriptApp') } };
  sb.globalThis = sb;
  var ctx = vm.createContext(sb);
  fs.readdirSync(GS_DIR).filter(function (f) { return /\.gs$/.test(f); }).sort()
    .forEach(function (f) { vm.runInContext(fs.readFileSync(path.join(GS_DIR, f), 'utf8'), ctx, { filename: f }); });
  var out = vm.runInContext('JSON.stringify(handleOverseasStockWorkspaceGet_({ payload: {} }))', ctx);
  var env = JSON.parse(out);
  eq(env.success, true, 'G8 the Overseas workspace read succeeds against a real spreadsheet shape');
  eq(violations.length, 0, 'G8 and reached ZERO write primitives — measured, not asserted');
  eq(env.meta.read_only, true, 'G8 the envelope declares itself read-only');
  eq(env.meta.db_writes, 0, 'G8 with db_writes 0');
  eq(env.meta.action, 'overseasStock.workspace.get', 'G8 and names the action it answered');
  // §C.7 — the rows and joins the page needs all survive the projection.
  eq(env.data.overseas_inventory_snapshot.length, 1, 'G8 the snapshot rows are returned');
  eq(env.data.overseas_inventory_movements.length, 1, 'G8 the movement log is returned');
  eq(env.data.warehouses.length, 1, 'G8 the referenced warehouse is returned');
  eq(env.data.sku_details.length, 1, 'G8 and sku_details rows are NOT filtered by the snapshot (the import template needs them all)');
  var sku = env.data.sku_details[0];
  ['sku', 'category', 'series', 'lifecycle'].forEach(function (f) {
    ok(Object.prototype.hasOwnProperty.call(sku, f), 'G8 the projection keeps `' + f + '`, which the page reads');
  });
  ['item_length', 'package_weight', 'hscode'].forEach(function (f) {
    ok(!Object.prototype.hasOwnProperty.call(sku, f),
      'G8 and DROPS `' + f + '`, which this page never reads — this is the byte win');
  });
  ok(Array.isArray(env.data.projection.sku_details_columns), 'G8 the projection is DECLARED in the answer, not only in source');
})();

// G9 — the release token: every runtime asset this round changed carries the SAME new token.
var R3_CHANGED = ['assets/js/api/km-transport.js', 'assets/js/api/km-api-foundation.js',
  'assets/js/api/operation-system-db-api.js', 'assets/js/core/scope-registry.js',
  'assets/js/pages/inventory-replenishment.js', 'assets/js/pages/overseas-stock.js',
  'assets/js/pages/sku-handbook.js', 'assets/js/utils/sku-overrides.js'];
var tok = {};
R3_CHANGED.forEach(function (a) {
  var m = new RegExp('src="' + a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\?v=([^"]+)"').exec(HTML);
  ok(!!m, 'G9 ' + a + ' is loaded with a cache-bust token');
  if (m) tok[a] = m[1];
});
var distinct = Object.keys(tok).map(function (k) { return tok[k]; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
eq(distinct.length, 1, 'G9 every asset R3 changed shares ONE token, so they cannot deploy out of step');
// F1-7N-FB-4E-R4A — RESTATED FROM A PINNED LITERAL TO THE RULE, WITH A MONOTONIC FLOOR.
//
// This asserted indexOf('fb4er3') === 0, which made a CORRECT later bump look like a regression: R4A changes
// km-api-foundation.js, has to move the shared token, and would have failed a suite that was right about the
// property and wrong about how to state it. What G9 actually defends is that these assets cannot deploy out of
// step, and that they are not stranded on a superseded token.
var ROUND_TOKENS = ['donenotice-20260811', 'fb4e-transport-20260826', 'fb4c-scope-registry-20260826',
  'fb4er1-contract-probe-20260827', 'fb4er2-action-registry-20260827', 'fb4er3-lifecycle-20260827',
  'fb4er4a-correlation-20260827', 'fb4er4a1-readtransport-20260827', 'fb4er4b-readback-20260831',
  'fb4er4br1-authority-20260831'];
var FLOOR = ROUND_TOKENS.indexOf('fb4er3-lifecycle-20260827');
var at = ROUND_TOKENS.indexOf(distinct[0]);
ok(at >= FLOOR, 'G9 the token is at or after R3 in the release order (' + distinct[0] + ') — a monotonic floor, not a pinned literal');
// NOT asserted: that the whole page shares one token. index.html versions assets PER COUPLED GROUP, and a
// check written on the assumption that one token covers everything is simply false about this file — it was
// written that way here first and caught by running it. What matters is that this group moves together and
// that its token is a real release token rather than a typo that would silently disable cache-busting.
ok(at !== -1, 'G9 and the token is a known release token, not a typo (' + distinct[0] + ')');

// G10 — the contract versions moved together and the client agrees.
var ACT = Number(/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+)/.exec(G63)[1]);
var LIST = Number(/var SYS_REQUIRED_ACTION_LIST_VERSION_ = (\d+)/.exec(G63)[1]);
var PIN = Number(/var KM_EXPECTED_ACTION_CONTRACT_VERSION_ = (\d+)/.exec(DBAPI)[1]);
// F1-7N-FB-4E-R4A1 - RESTATED AS A FLOOR. "moved to 9" was a statement about R3, not about the axis, so a
// later round that legitimately moves it reads as a regression. R4A1 moved the action contract to 10
// because the router now serves read actions on a verb it did not serve before. What G10 defends is that
// the two axes move MONOTONICALLY and that the client pin agrees with the deployment - both asserted.
ok(ACT >= 9, 'G10 the action contract is at or above the R3 floor of 9 (' + ACT + ')');
ok(LIST >= 9, 'G10 the required-action list version is at or above 9 (' + LIST + ')');
eq(PIN, ACT, 'G10 and the client pin agrees with the deployment');
ok(PIN >= 9, 'G10 raised, never lowered');
eq(/var OSW_BUILD_VERSION_ = '([^']+)'/.exec(G70)[1], 'F1-7N-FB-4E-R3', 'G10 70_ declares this round\'s stamp');
ok(/'70_api_v1_overseas_stock_workspace\.gs', symbol: 'OSW_BUILD_VERSION_', expected: 'F1-7N-FB-4E-R3'/.test(G63),
  'G10 and the module manifest expects exactly it');
ok(/'OSW_BUILD_VERSION_'/.test(DBAPI), 'G10 the client probes the owner symbol, so a missing 70_ is a NAMED fault');
ok(/'overseasStock\.workspace\.get'/.test(DBAPI), 'G10 and probes the action itself');

// G11 — the registry cache is versioned, bounded and never caches a failure.
ok(/var CACHE_TTL_MS = /.test(SCOPEREG), 'G11 the registry cache has an explicit TTL');
ok(/if \(want && String\(o\.v \|\| ''\) !== want\) return null;/.test(SCOPEREG), 'G11 and an explicit version guard');
ok(/if \(\(nowMs - o\.at\) > CACHE_TTL_MS\) return null;/.test(SCOPEREG), 'G11 an aged entry is discarded');
var setBlock = SCOPEREG.slice(SCOPEREG.indexOf('var model = adapt(res.data);'), SCOPEREG.indexOf('return snapshot();', SCOPEREG.indexOf('var model = adapt(res.data);')));
ok(/cacheWrite\(res\.data/.test(setBlock), 'G11 only a SUCCESSFUL read is written');
var errBlock = SCOPEREG.slice(SCOPEREG.indexOf('set(STATUS.ERROR'), SCOPEREG.indexOf('set(STATUS.ERROR') + 400);
ok(!/cacheWrite/.test(errBlock), 'G11 a failure is never cached — it cannot poison a later load');
ok(/cacheClear\(\); return ensureLoaded\(\{ force: true \}\);/.test(SCOPEREG), 'G11 an explicit reload drops the stored snapshot');

// =============================================================================================================
console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
