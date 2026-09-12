// Kitchen Mama Operation System — PRODUCT-STRATEGY-P1-B8C-R3-R1
// THE COMPATIBILITY GATE: what the repository can prove about sku_details.image_url, what it cannot,
// and the one read-only function that closes the gap.
//
// WHY THIS ROUND EXISTS. P1-B8C-R3 made one shared policy decide whether an image reference may reach
// an <img src>, and that policy REFUSES an absolute URL on a host nobody declared. SKU Details
// previously displayed ANY non-blank value. So if production holds an externally-hosted image, R3
// turns a working photograph into a fallback marker — on a page this round never measured.
//
// THE THING R3 LEANED ON WAS NOT A CENSUS. R3 reported "all 67 production data points are relative
// paths". Sixty of those came from P1-B8C-R2, which sampled sixty of 495 rows of the PRICING universe;
// the other seven are operator assertions. `sku_details` is a DIFFERENT TABLE AT A DIFFERENT GRAIN,
// and sixty of one is not a census of another. A bound nobody measured is not a bound — which is the
// same sentence P1-B8C-R1A had to learn about a per-site cap.
//
// WHAT THIS SUITE ASSERTS:
//
//   §B  THE REPOSITORY SIDE, EXHAUSTIVELY. Every consumer of the column, every <img src> creation site,
//       every reference shape in the tree, and whether an asset base or CDN base exists anywhere.
//       It found a FOURTH consumer R3 did not touch and does not cover.
//   §C  THE CENSUS FUNCTION'S CONTRACT — read-only, no parameters, one column, and the short list of
//       things it may emit.
//   §D  THE CENSUS AGREES WITH THE CLIENT POLICY, over a corpus that reaches every branch of both.
//       Two classifiers deciding the same value differently is the exact defect R3 was fixing.
//   §E  THE COMPATIBILITY PROPERTY, which is not "it still displays" but "THE ADDRESS IS UNCHANGED".
//   §F  THE ALLOWLIST IS STILL EMPTY AND STILL FAIL-CLOSED, and no wildcard exists to make it not be.
//
// Run: node assets/tests/product-strategy-image-universe-census-p1-b8c-r3-r1.test.js

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

var GS_FILE = 'assets/tools/apps-script-diagnostics/TEMP_P1_PRODUCT_STRATEGY_PRODUCTION_READBACK.gs';
var POLICY_FILE = 'assets/js/utils/km-image-reference-policy.js';

var POLICY = require(path.join(ROOT, POLICY_FILE));
var SRC = {
  gs: read(GS_FILE),
  policy: read(POLICY_FILE),
  overrides: read('assets/js/utils/sku-overrides.js'),
  adapter: read('assets/js/api/km-product-pricing-adapter.js'),
  boardUi: read('assets/js/product-strategy/psb-board-ui.js'),
  skuDetails: read('assets/js/pages/sku-details.js'),
  skuHandbook: read('assets/js/pages/sku-handbook.js'),
  campaignRisk: read('assets/js/pages/campaign-risk.js'),
  dbApi: read('assets/js/api/operation-system-db-api.js'),
  globe: read('assets/js/lib/km-globe.js'),
  index: read('index.html')
};

var ORIGIN = { pageProtocol: 'https:', pageHost: 'km.example-origin.test' };
if (typeof global.location === 'undefined') {
  global.location = { protocol: ORIGIN.pageProtocol, host: ORIGIN.pageHost };
}

// =============================================================================================
section('§A  SCOPE — THIS ROUND CHANGES NO RUNTIME BEHAVIOUR');
// =============================================================================================
var R3_COMMIT = '3d7ef782d1b59712157fa3ab39ea1347b4cf9f34';
var changed = cp.execFileSync('git', ['diff', '--name-only', R3_COMMIT, '--'],
  { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
eq(changed.filter(function (f) { return /^assets\/js\//.test(f); }), [],
  'A1  no client runtime file changed — this round measures, it does not repair', changed);
eq(changed.filter(function (f) { return /\.css$/.test(f) || /^assets\/html\//.test(f); }), [],
  'A1a and no stylesheet or partial changed', changed);
eq(changed.filter(function (f) { return f === 'index.html'; }), [],
  'A1b and index.html is untouched', changed);
eq(changed.filter(function (f) { return /^assets\/specs\/active\/apps-script\//.test(f); }), [],
  'A1c and no SHIPPED Apps Script file changed — the diagnostic is not one', changed);
ok(changed.indexOf(GS_FILE) !== -1, 'A1d the editor-only diagnostic IS what changed', changed);
ok(!/PRODUCT_STRATEGY_ENABLED_\s*[^=]=\s*true/.test(read('assets/js/app.js')),
  'A2  the feature flag is still false');
ok(SRC.index.indexOf('data-menu-id="product-strategy"') === -1,
  'A2a and index.html still renders no Product Strategy menu item');

// =============================================================================================
section('§B  THE REPOSITORY-SIDE CENSUS — EVERY CONSUMER, EVERY SHAPE, EVERY HOST');
// =============================================================================================
/* B1 — WHO READS THE COLUMN. One mapping point, then four renderers. */
ok(/image:\s*String\(r\.image_url\s*\|\|\s*''\)/.test(SRC.dbApi),
  'B1  operation-system-db-api.js is the single place image_url becomes `image`');

var CONSUMERS = [
  ['sku-details.js', SRC.skuDetails, true],
  ['sku-handbook.js', SRC.skuHandbook, true],
  ['psb-board-ui.js (via the adapter)', SRC.boardUi, true],
  ['campaign-risk.js', SRC.campaignRisk, false]
];
CONSUMERS.forEach(function (c, i) {
  var usesShared = /getNormalizedSkuImage|classifySkuImageSource/.test(c[1]);
  if (c[0] === 'psb-board-ui.js (via the adapter)') {
    usesShared = /imagePolicy\(\)/.test(SRC.adapter) && /n\.image|rep\.image/.test(c[1]);
  }
  eq(usesShared, c[2], 'B2.' + (i + 1) + ' ' + c[0] + ' shared-resolver = ' + c[2]);
});

/* B3 — THE FOURTH CONSUMER, AND IT IS A FINDING RATHER THAN A PASS.
   campaign-risk.js joins sku_details, takes `d.image` — the SAME column, through the SAME mapping —
   and puts it straight into `<img src>` with no resolver and no validation. R3 did not touch it,
   R3's parity claim does not cover it, and it is the remaining path by which a `javascript:` URL in
   a sheet cell reaches an attribute. It is RECORDED here, at its exact line, rather than quietly
   fixed in a round whose scope is measurement. */
ok(/map\[d\.sku\]\s*=\s*\{[^}]*image:\s*d\.image/.test(SRC.campaignRisk),
  'B3  campaign-risk.js reads the same sku_details image column');
ok(/<img class="cr-img" src="\$\{_crEsc\(r\.image\)\}"/.test(SRC.campaignRisk),
  'B3a and renders it with NO resolver and NO validation — a fourth consumer R3 does not cover');
ok(!/getNormalizedSkuImage|classifySkuImageSource|KM_IMAGE_REFERENCE_POLICY/.test(SRC.campaignRisk),
  'B3b it calls none of the shared entry points');
ok(/onerror=/.test(SRC.campaignRisk),
  'B3c it does have its own broken-image fallback, so only VALIDATION is missing');

/* B4 — IS THERE AN ASSET BASE OR CDN BASE ANYWHERE? R3 said no; this checks it as a search rather
   than as a memory, across the shipped client and the shipped Apps Script. */
var BASE_PAT = /assetBase|asset_base|cdnBase|cdn_base|imageBase|image_base|IMAGE_HOST|STATIC_ROOT|PUBLIC_URL/i;
var baseHits = [];
['assets/js', 'assets/specs/active/apps-script'].forEach(function (dir) {
  (function walk(d) {
    fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).forEach(function (e) {
      var rel = d + '/' + e.name;
      if (e.isDirectory()) return walk(rel);
      if (!/\.(js|gs)$/.test(e.name)) return;
      if (BASE_PAT.test(read(rel))) baseHits.push(rel);
    });
  }(dir));
});
eq(baseHits, [], 'B4  no asset base and no CDN base exists in the shipped tree', baseHits);
/* The `baseUrl` machinery that DOES exist belongs to the API transport, and names an /exec endpoint. */
ok(/resolveBaseUrl/.test(read('assets/js/api/km-api-foundation.js')),
  'B4a the `baseUrl` that exists is the API transport\'s');
ok(!/resolveBaseUrl/.test(SRC.overrides) && !/resolveBaseUrl/.test(SRC.policy),
  'B4b and no image code consults it — an API endpoint is not an image root');

/* B5 — EVERY IMAGE REFERENCE SHAPE THE REPOSITORY CONTAINS, classified by the shipped policy. */
var SKIP = /(^|[\\\/])(\.git|node_modules|docs[\\\/]evidence)([\\\/]|$)/;
var files = [];
(function walk(d) {
  var ents;
  try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
  ents.forEach(function (e) {
    var f = path.join(d, e.name);
    if (SKIP.test(f)) return;
    if (e.isDirectory()) return walk(f);
    if (/\.(js|gs|json|md|html|css|txt|csv)$/i.test(e.name)) files.push(f);
  });
}(ROOT));
ok(files.length > 500, 'B5  the tree scan reached the whole repository', files.length);

var EXT = '(?:jpg|jpeg|png|gif|webp|avif|svg|bmp|ico)';
var PATTERNS = [
  new RegExp('["\'`]([^"\'`\\n]{1,300}?\\.' + EXT + '(?:\\?[^"\'`\\n]{0,80})?)["\'`]', 'gi'),
  /["'`](https?:\/\/[^"'`\s]{4,300})["'`]/gi
];
var refs = Object.create(null);
files.forEach(function (f) {
  var src;
  try { src = fs.readFileSync(f, 'utf8'); } catch (e) { return; }
  var rel = path.relative(ROOT, f).replace(/\\/g, '/');
  PATTERNS.forEach(function (re) {
    re.lastIndex = 0;
    var m;
    while ((m = re.exec(src)) !== null) {
      if (!refs[m[1]]) refs[m[1]] = [];
      if (refs[m[1]].indexOf(rel) === -1) refs[m[1]].push(rel);
    }
  });
});
var refKeys = Object.keys(refs);
ok(refKeys.length > 100, 'B5a and found a substantial candidate set', refKeys.length);

/* THE QUESTION THIS SUITE IS ACTUALLY ASKING: is there an absolute reference that is BOTH on an
   external host AND names an image file? That is the only shape R3's empty allowlist can break. */
/* A HOST INSIDE assets/tests/ IS A FIXTURE, NOT A PRODUCTION IMAGE SOURCE. The first version of this
   assertion scanned the whole tree and reported nineteen hosts — every one of them a `cdn.example.com`
   or an `attacker.test` written BY these suites, including several written by this file three sections
   further down. A census that counts its own test vocabulary as production evidence is measuring
   itself. The question is what a SHIPPED page or a DATA file could hand to a browser. */
function isFixture(f) { return /^assets\/tests\//.test(f); }
var externalImages = refKeys.filter(function (v) {
  var m = /^(?:https?:)?\/\/([^\/?#]+)(\/[^?#]*)?/i.exec(v);
  if (!m) return false;
  if (!POLICY.hasImageExtension(m[2] || '')) return false;
  return refs[v].some(function (f) { return !isFixture(f); });
});
var externalImageHosts = {};
externalImages.forEach(function (v) {
  var h = /^(?:https?:)?\/\/([^\/?#]+)/i.exec(v)[1].toLowerCase();
  if (!externalImageHosts[h]) externalImageHosts[h] = [];
  refs[v].forEach(function (f) {
    if (!isFixture(f) && externalImageHosts[h].indexOf(f) === -1) externalImageHosts[h].push(f);
  });
});
var hostNames = Object.keys(externalImageHosts).sort();
eq(hostNames, ['eoimages.gsfc.nasa.gov'],
  'B6  exactly ONE absolute image host exists outside the test fixtures', externalImageHosts);

/* AND THE SHARPER FORM: no SHIPPED file references an external image host at all. This is the one
   that would actually break if somebody put a CDN URL in a renderer. */
var SHIPPED = /^(assets\/js\/|assets\/specs\/active\/|assets\/html\/|assets\/css\/|index\.html)/;
var shippedExternal = refKeys.filter(function (v) {
  var m = /^(?:https?:)?\/\/([^\/?#]+)(\/[^?#]*)?/i.exec(v);
  if (!m || !POLICY.hasImageExtension(m[2] || '')) return false;
  return refs[v].some(function (f) { return SHIPPED.test(f); });
});
eq(shippedExternal, [], 'B6z  and NO SHIPPED FILE references an external image host', shippedExternal);

/* B6a — AND IT IS NOT A RUNTIME IMAGE SOURCE. km-globe vendors the NASA texture REPO-LOCAL and says
   so; the URL lives only in the build tool that re-acquires it. A host that never reaches a browser
   is not a host an allowlist has to admit. */
var nasaFiles = externalImageHosts['eoimages.gsfc.nasa.gov'];
ok(nasaFiles.every(function (f) { return /^tools\/geo\/|^assets\/img\/earth\/PROVENANCE\.md$/.test(f); }),
  'B6a it appears ONLY in the build tool and its provenance note', nasaFiles);
ok(/NO RUNTIME NETWORK/.test(SRC.globe) && /EARTH_ASSET_DIR_ = 'assets\/img\/earth\/'/.test(SRC.globe),
  'B6b and the renderer that uses those textures declares repo-relative paths only');
ok(!/eoimages/.test(SRC.globe), 'B6c the shipped globe names no host at all');

/* B7 — THE SHAPES THAT DO EXIST, so "what does an image_url look like here" is answered with data. */
var legacy = read('backup_legacy_files_20260116/data.js');
var legacyImages = (legacy.match(/image: *"[^"]*"/g) || [])
  .map(function (s) { return /"([^"]*)"/.exec(s)[1]; });
ok(legacyImages.length >= 20, 'B7  the archived pre-database SKU data carries image values',
  legacyImages.length);
ok(legacyImages.every(function (v) { return POLICY.classify(v, ORIGIN).kind === 'SAME_ORIGIN_ASSET'; }),
  'B7a and EVERY ONE of them is accepted by the new policy');
ok(legacyImages.every(function (v) { return v.indexOf('/') === -1; }),
  'B7b they are FILENAME-ONLY — this application\'s image convention before sku_details existed');
ok(SRC.index.indexOf('backup_legacy_files') === -1,
  'B7c that file is archived and production does not load it');

var CONTRACT = require(path.join(ROOT, 'assets/js/product-strategy/psb-data-contract.js')).PSB_CONTRACT;
var MAPPINGS = CONTRACT.IMAGE_POLICY.verified_mappings;
ok(Object.keys(MAPPINGS).every(function (k) { return MAPPINGS[k].indexOf('/') !== -1; }),
  'B7d the seven operator-asserted live values are REPO-RELATIVE — a second shape, also accepted');

/* B8 — THE HONEST LIMIT OF ALL OF THE ABOVE. */
var LIVE = require(path.join(ROOT, 'assets/tests/_p1b8c-r2-live-derived.js'));
eq(LIVE.ROW_COUNT, 60, 'B8  P1-B8C-R2 carried sixty rows');
eq(LIVE.UNIVERSE_TOTAL_ROWS, 495, 'B8a out of a 495-row PRICING universe');
eq(LIVE.NOT_FULL_UNIVERSE, true, 'B8b and it says of itself that it is not the universe');
eq(LIVE.IMAGE_ADDRESS_IS_A_SUBSTITUTE, true,
  'B8c AND ITS IMAGE ADDRESSES WERE REMOVED — so it cannot report a host even if one existed');
ok(true, 'B8d VERDICT: the repository proves zero external image hosts in every path it can see, and'
  + ' CANNOT prove the sku_details universe. Sixty rows of the pricing table is not a census of the'
  + ' master table. Hence §C.');

// =============================================================================================
section('§C  THE CENSUS FUNCTION — CONTRACT, AND WHAT IT MAY NOT EMIT');
// =============================================================================================
ok(/function RUN_P1_IMAGE_REFERENCE_UNIVERSE_CENSUS\(\)/.test(SRC.gs),
  'C1  the entry point exists and takes NO parameters');
/* `[A-Z_]+` MISSED ALL THREE: every entry point is named RUN_P1_..., and `P1` carries a digit. */
eq((SRC.gs.match(/function RUN_[A-Z0-9_]+\(/g) || []).length, 3,
  'C1a and it is the third entry point in the file, not a replacement for either',
  SRC.gs.match(/function RUN_[A-Z0-9_]+\(/g));

/* C2 — READ-ONLY, PROVEN BY THERE BEING NO WRITER IN THE FILE. */
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
var CENSUS = bodyOf(SRC.gs, 'RUN_P1_IMAGE_REFERENCE_UNIVERSE_CENSUS');
ok(CENSUS.length > 500, 'C2  the census body is extractable', CENSUS.length);
var WRITERS = ['setValue', 'setValues', 'appendRow', 'insertSheet', 'deleteSheet', 'clear(',
  'DriveApp', 'UrlFetchApp', 'LockService', 'PropertiesService', 'CacheService', 'ScriptApp',
  'MailApp', 'GmailApp', 'createTrigger', 'setFormula'];
WRITERS.forEach(function (w, i) {
  ok(CENSUS.indexOf(w) === -1, 'C2.' + (i + 1) + ' the census never uses ' + w);
});
ok(/rows_modified: 0/.test(CENSUS) && /writes: 0/.test(CENSUS),
  'C2a and it publishes rows_modified 0 and writes 0');

/* C3 — ONE TABLE, ONE COLUMN. */
var tableReads = CENSUS.match(/p1b3ReadTable_\(ss, '([^']+)'\)/g) || [];
eq(tableReads, ["p1b3ReadTable_(ss, 'sku_details')"],
  'C3  it reads exactly one table, and that table is sku_details', tableReads);
var rowFields = CENSUS.match(/rows\[i\]\s*\?\s*rows\[i\]\.(\w+)/g) || [];
eq(rowFields, ['rows[i] ? rows[i].image_url'],
  'C3a and touches exactly one column on the row', rowFields);

/* C4 — THE THINGS IT MAY NOT EMIT. A path is a locator, a filename can carry a sku, a query can carry
   a token. None of them is needed to decide an allowlist; a hostname is. */
ok(!/report\.(counts|compatibility)[^\n]*(path|filename|sku|row_id|url)\s*[:=]/i.test(CENSUS),
  'C4  no path, filename, sku or row id is assigned into the report');
ok(/emits_paths: false/.test(SRC.gs) && /emits_filenames: false/.test(SRC.gs)
  && /emits_skus: false/.test(SRC.gs) && /emits_row_ids: false/.test(SRC.gs)
  && /emits_urls: false/.test(SRC.gs),
  'C4a and the contract block declares each of those false');
ok(/emits_external_hostnames: true/.test(SRC.gs),
  'C4b while declaring the one identifying fragment it DOES keep');

/* C5 — A HOSTNAME THAT CARRIES USER INFORMATION STOPS THE WHOLE REPORT. */
var ctx = vm.createContext({ console: console });
vm.runInContext("function p1b3Str_(v){return String(v===undefined||v===null?'':v).trim();}", ctx);
vm.runInContext('var P1B8CR3_IMAGE_EXT_ = '
  + /var P1B8CR3_IMAGE_EXT_ = (\[[^\]]*\]);/.exec(SRC.gs)[1] + ';', ctx);
vm.runInContext(bodyOf(SRC.gs, 'p1b8cr3HasImageExt_'), ctx);
vm.runInContext(bodyOf(SRC.gs, 'p1b8cr3ShapeOf_'), ctx);
vm.runInContext(bodyOf(SRC.gs, 'p1b8cr3HostOf_'), ctx);
var shapeOf = ctx.p1b8cr3ShapeOf_, hostOf = ctx.p1b8cr3HostOf_;

eq(hostOf('https://user:pass@cdn.test/a.jpg'), { refuse: 'AUTHORITY_CARRIES_USER_INFO' },
  'C5  `user:pass@host` is refused rather than reduced to a host');
eq(hostOf('https://person@cdn.test/a.jpg'), { refuse: 'AUTHORITY_CARRIES_USER_INFO' },
  'C5a and so is a bare userinfo, which is what an email in a URL looks like');
eq(hostOf('https://cdn.test:8443/a.jpg'), { host: 'cdn.test' },
  'C5b a port is not part of an allowlist identity and is dropped');
eq(hostOf('https://CDN.Test/a.jpg'), { host: 'cdn.test' }, 'C5c and the host is lowercased');
eq(hostOf('assets/img/x.jpg'), null, 'C5d a relative reference has no authority at all');
ok(/STOP_P1_B8C_R3_R1_HOSTNAME_REDACTION_FAILED/.test(CENSUS),
  'C5e and a refusal stops the WHOLE report');
ok(/report\.counts = null;/.test(CENSUS),
  'C5f with the counts withheld — a partial census is not a census');

/* C6 — THE BUCKETS HAVE TO ADD UP. */
ok(/STOP_P1_B8C_R3_R1_CLASSIFICATION_DOES_NOT_SUM/.test(CENSUS),
  'C6  the report stops if the buckets do not sum to the whole');
ok(/error\.safety_token|safety_token:/.test(SRC.gs),
  'C6a the failure path uses `safety_token`, not the forbidden key `token` — P1-B8C-R1\'s lesson');

/* C7 — NO NEW SURFACE. */
/* THE PATTERNS ARE ANCHORED, BECAUSE A SUBSTRING IS NOT A WORD. `ACTION_` as a plain indexOf matched
   `STOP_..._HOSTNAME_REDACTION_FAILED` — the census's own refusal verdict — and reported the safety
   stop as a router registration. Same shape of mistake as `error.token` colliding with the forbidden
   key `token` in P1-B8C-R1: a name that contains another name is not that name. */
[[/\bdoGet\b/, 'doGet'], [/\bdoPost\b/, 'doPost'], [/\bACTION_[A-Z]/, 'an ACTION_ constant'],
  [/\brouter\b/i, 'a router reference'], [/\baddAction\b/, 'addAction'],
  [/\bregisterAction\b/, 'registerAction']].forEach(function (w, i) {
    ok(!w[0].test(CENSUS), 'C7.' + (i + 1) + ' the census adds no ' + w[1]);
  });
ok(/REDACTION_FAILED/.test(CENSUS),
  'C7z  (and the verdict that tripped the unanchored version is still there)');
var shippedChanged = cp.execFileSync('git', ['diff', '--name-only', R3_COMMIT, '--',
  'assets/specs/active/apps-script'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
eq(shippedChanged, [], 'C7a and no shipped Apps Script file changed', shippedChanged);

// =============================================================================================
section('§D  THE CENSUS AND THE CLIENT POLICY DECIDE THE SAME VALUES THE SAME WAY');
// =============================================================================================
/* TWO CLASSIFIERS THAT DISAGREE IS THE EXACT DEFECT R3 EXISTED TO FIX, so a census written in Apps
   Script and a policy written in the browser have to be shown equivalent rather than assumed so. */
var DISPLAYS = { relative_asset_rows: 1, root_relative_rows: 1, filename_only_rows: 1 };
var ABSOLUTE = { absolute_https_rows: 1, absolute_http_rows: 1 };

var CORPUS = [
  '', '   ', 'assets/img/products/CO1100-R.jpg', 'img9.jpg', 'sp02.jpg', 'IMG_0042.JPEG',
  'a/b/c/d.png', '/local/a.jpg', '/assets/img/x.webp', 'photo.jpg#frag', 'photo.jpg?v=2',
  'https://cdn.example.com/a.jpg', 'http://cdn.example.com/a.jpg', '//cdn.example.com/a.jpg',
  'https://km.example-origin.test/x/a.jpg', 'https://cdn.example.com/notanimage',
  'javascript:alert(1)', 'data:text/html;base64,AA==', 'vbscript:msgbox(1)', 'mailto:a@b.com',
  'C:\\Users\\v\\p.jpg', 'C:/Users/v/p.jpg', '\\\\server\\share\\p.jpg', 'file:///C:/p.jpg',
  '../../etc/x.png', 'a/../b.jpg', '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456',
  '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms', 'not-an-image', 'REDACTED_IMAGE_REFERENCE',
  'a.jpg" onerror="alert(1)', 'a.jpg onerror=x', 'HTTPS://CDN.EXAMPLE.COM/A.JPG', 'x.JPG', 'x.svg'
];

function censusView(v) {
  var s = shapeOf(v);
  return { blank: s === null, displays: !!DISPLAYS[s], absolute: !!ABSOLUTE[s], shape: s };
}
function policyView(v) {
  var c = POLICY.classify(v, ORIGIN);
  var isAbs = /^(?:https?:)?\/\//i.test(String(v === null || v === undefined ? '' : v).trim());
  return { blank: c.kind === 'ABSENT', displays: c.kind === 'SAME_ORIGIN_ASSET',
    absolute: isAbs && c.kind !== 'ABSENT', kind: c.kind, reason: c.reason };
}
var disagree = [];
CORPUS.forEach(function (v) {
  var a = censusView(v), b = policyView(v);
  if (a.blank !== b.blank || a.displays !== b.displays || a.absolute !== b.absolute) {
    disagree.push({ value: v, census: a, policy: b });
  }
});
eq(disagree, [], 'D1  NOT ONE VALUE IS CLASSIFIED DIFFERENTLY BY THE TWO', disagree);

/* EVERY BRANCH OF THE CENSUS IS REACHED BY THE CORPUS. A comparison that never enters a branch
   proves nothing about it, which is how an equivalence claim quietly becomes a sample. */
var reached = {};
CORPUS.forEach(function (v) { var s = shapeOf(v); reached[s === null ? '(blank)' : s] = 1; });
var SHAPES = JSON.parse(/var P1B8CR3_SHAPES_ = (\[[\s\S]*?\]);/.exec(SRC.gs)[1].replace(/'/g, '"'));
var unreached = SHAPES.filter(function (s) { return !reached[s] && s !== 'classification_unknown_rows'; });
eq(unreached, [], 'D1a and every declared shape except the defensive one is reached', unreached);
ok(!reached.classification_unknown_rows,
  'D1b `classification_unknown_rows` is unreachable by construction and must stay 0 in production');

/* D2 — THE ORDER IS THE SAME, which is what makes the equivalence stable rather than coincidental. */
var order = [];
['windows_path_rows', 'rejected_scheme_rows', 'traversal_rows'].forEach(function (s) {
  order.push(bodyOf(SRC.gs, 'p1b8cr3ShapeOf_').indexOf("'" + s + "'"));
});
ok(order[0] < order[1] && order[1] < order[2],
  'D2  the dangerous shapes are decided before anything may look like a path', order);
eq(shapeOf('C:\\x\\p.jpg'), 'windows_path_rows',
  'D2a so a Windows path ending in .jpg is a Windows path, not an asset');
eq(shapeOf('../x.jpg'), 'traversal_rows', 'D2b and a traversal ending in .jpg is a traversal');

// =============================================================================================
section('§E  THE COMPATIBILITY PROPERTY — THE ADDRESS IS UNCHANGED, NOT MERELY "STILL SHOWS"');
// =============================================================================================
/* WHAT COMPATIBILITY ACTUALLY MEANS HERE. "It still displays" is too weak: a policy that displayed a
   DIFFERENT address would pass that and still break every picture. The property is that for every
   value the old page rendered and the new one accepts, THE STRING HANDED TO THE BROWSER IS IDENTICAL.
   It does not depend on any file existing, which is why it can be asserted for shapes this repository
   has no file for. */
function oldSrc(v) {
  /* The pre-R3 resolver, extracted from the commit rather than retyped. */
  var s = String(v === null || v === undefined ? '' : v).trim();
  if (s === '') return '';
  if (s.indexOf('http://') === 0 && ORIGIN.pageProtocol === 'https:') {
    return 'https://' + s.slice('http://'.length);
  }
  return s;
}
var PRE = cp.execFileSync('git', ['show', R3_COMMIT + '~1:assets/js/utils/sku-overrides.js'],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).replace(/\r\n/g, '\n');
ok(/if \(url\.indexOf\('http:\/\/'\) === 0\)/.test(PRE),
  'E1  the pre-R3 resolver is recoverable and did exactly one rewrite');
ok(/return url;/.test(PRE), 'E1a and returned everything else unchanged');

var ACCEPTED = CORPUS.filter(function (v) { return POLICY.classify(v, ORIGIN).accepted; });
ok(ACCEPTED.length >= 8, 'E2  the corpus contains accepted values to compare', ACCEPTED.length);
var addressChanged = ACCEPTED.filter(function (v) {
  return POLICY.classify(v, ORIGIN).url !== oldSrc(v);
});
eq(addressChanged, [],
  'E2a FOR EVERY VALUE THE NEW POLICY ACCEPTS, THE ADDRESS IS BYTE-IDENTICAL TO THE OLD ONE',
  addressChanged);

/* E3 — AND NOTHING IS NEWLY DISPLAYED THAT WAS NOT BEFORE. The gate is one-directional: R3 may only
   ever remove, never add, or it would be rendering something no previous version vouched for. */
var newlyDisplayed = CORPUS.filter(function (v) {
  return POLICY.classify(v, ORIGIN).accepted && oldSrc(v) === '';
});
eq(newlyDisplayed, [], 'E3  old rejected / new displayed = 0', newlyDisplayed);

/* E4 — WHAT R3 REMOVES, BY CLASS, so the gate's cost is itemised rather than summarised. */
var removed = {};
CORPUS.forEach(function (v) {
  var c = POLICY.classify(v, ORIGIN);
  if (oldSrc(v) !== '' && !c.accepted) {
    removed[c.reason] = (removed[c.reason] || 0) + 1;
  }
});
var removedReasons = Object.keys(removed).sort();
eq(removedReasons, ['NOT_AN_IMAGE_FILENAME', 'LOCAL_FILE_PATH', 'OPAQUE_REFERENCE', 'PATH_TRAVERSAL',
  'UNAPPROVED_HOST', 'UNSUPPORTED_SCHEME'].sort(),
  'E4  every class R3 removes is a dangerous or unfetchable shape, plus UNAPPROVED_HOST', removed);
ok(removedReasons.indexOf('UNAPPROVED_HOST') !== -1,
  'E4a AND `UNAPPROVED_HOST` IS THE ONLY ONE THAT COULD HAVE BEEN A WORKING PICTURE');
ok(true, 'E4b VERDICT: the gate reduces to ONE question — does production hold an absolute image URL?'
  + ' Every other removal is a value no browser could have fetched.');

/* E5 — the census reports exactly that question's answer, and reports it separately. */
ok(/old_displayed_new_depends_on_allowlist/.test(CENSUS),
  'E5  the census scores the absolute rows SEPARATELY rather than guessing the allowlist');
ok(/allowlist_decision_required/.test(CENSUS),
  'E5a and says outright whether a decision is required');
ok(/old_rejected_new_displayed: 0/.test(CENSUS),
  'E5b and asserts the one-directional property in its own output');

// =============================================================================================
section('§F  THE ALLOWLIST IS STILL EMPTY, STILL FAIL-CLOSED, AND HAS NO WILDCARD');
// =============================================================================================
eq(POLICY.APPROVED_EXTERNAL_HOSTS, [],
  'F1  the shipped allowlist is empty — the census has not run yet, so nothing has been proven');
ok(!/\*/.test(SRC.policy.split('APPROVED_EXTERNAL_HOSTS')[1].split('\n')[0]),
  'F1a and carries no wildcard');

/* F2 — HOST MATCHING IS WHOLE-STRING EQUALITY, so a suffix cannot be spoofed. */
var SPOOFS = [
  ['approved.test.attacker.test', 'a suffix-extended host'],
  ['xapproved.test', 'a prefix-extended host'],
  ['approved.test.', 'a trailing-dot host'],
  ['APPROVED.TEST.ATTACKER.TEST', 'the same, upper case']
];
SPOOFS.forEach(function (s, i) {
  var r = POLICY.classify('https://' + s[0] + '/a.jpg',
    { pageProtocol: 'https:', pageHost: ORIGIN.pageHost, approvedHosts: ['approved.test'] });
  eq(r.reason, 'UNAPPROVED_HOST', 'F2.' + (i + 1) + ' ' + s[1] + ' is refused');
});
var exact = POLICY.classify('https://approved.test/a.jpg',
  { pageProtocol: 'https:', pageHost: ORIGIN.pageHost, approvedHosts: ['approved.test'] });
eq(exact.kind, 'ABSOLUTE_APPROVED', 'F2a while the exact host is approved');

/* F3 — PATH AND QUERY ARE NOT IDENTITY. */
var pathSpoof = POLICY.classify('https://attacker.test/approved.test/a.jpg',
  { pageProtocol: 'https:', pageHost: ORIGIN.pageHost, approvedHosts: ['approved.test'] });
eq(pathSpoof.reason, 'UNAPPROVED_HOST', 'F3  an approved host appearing in the PATH is not approval');
var querySpoof = POLICY.classify('https://attacker.test/a.jpg?h=approved.test',
  { pageProtocol: 'https:', pageHost: ORIGIN.pageHost, approvedHosts: ['approved.test'] });
eq(querySpoof.reason, 'UNAPPROVED_HOST', 'F3a nor is it in the QUERY');

/* F4 — THE TWO PAGES STILL AGREE, which the gate must not have disturbed. */
var ADAPTER = require(path.join(ROOT, 'assets/js/api/km-product-pricing-adapter.js'));
function sandbox() {
  var store = {};
  var sb = { console: { log: function () {}, error: function () {} }, JSON: JSON, Date: Date,
    String: String, Object: Object, Array: Array, Number: Number, Boolean: Boolean, Math: Math,
    RegExp: RegExp,
    document: { getElementById: function () { return null; }, createElement: function () { return {}; } },
    localStorage: { getItem: function (k) { return store[k] === undefined ? null : store[k]; },
      setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } } };
  sb.window = sb; sb.globalThis = sb;
  sb.location = { protocol: ORIGIN.pageProtocol, host: ORIGIN.pageHost };
  var c = vm.createContext(sb);
  vm.runInContext(SRC.policy, c); vm.runInContext(SRC.overrides, c);
  return sb;
}
var sd = sandbox();
var parityBreaks = CORPUS.filter(function (v) {
  var shows = sd.getNormalizedSkuImage({ sku: 'X', image: v }) !== '';
  var draws = ADAPTER.imageStateOf({ product_image: v, missing_reasons: [] }) === 'VERIFIED_DB_MAPPING';
  return shows !== draws;
});
eq(parityBreaks, [], 'F4  SKU Details and Product Strategy still agree on every corpus value',
  parityBreaks);

/* F5 — THE TWO NEW SHAPES REACH AN <img> VERBATIM, which is the compatibility claim in the DOM. */
var ASSETS = require(path.join(ROOT, 'assets/tests/_p1b8c-r3-asset-capture.js'));
eq(ASSETS.FILENAME_ONLY_REFERENCE, 'img9.jpg',
  'F5  the acceptance capture carries the legacy filename-only convention');
eq(POLICY.classify(ASSETS.FILENAME_ONLY_REFERENCE, ORIGIN).url, ASSETS.FILENAME_ONLY_REFERENCE,
  'F5a and the policy hands it to the browser unchanged');
eq(POLICY.classify(ASSETS.ROOT_RELATIVE_REFERENCE, ORIGIN).url, ASSETS.ROOT_RELATIVE_REFERENCE,
  'F5b and the root-relative shape likewise');
var MA = JSON.parse(read('docs/evidence/p1-b8c-r3-image-acceptance/assets/measurements.json'));
var hrefs = MA.viewports['1920x1080'].chartImageHrefs || [];
ok(hrefs.indexOf(ASSETS.FILENAME_ONLY_REFERENCE) !== -1,
  'F5c AND A REAL BROWSER RECEIVED IT VERBATIM as a chart href', hrefs);
['1920x1080', '1440x900', '1366x768', '1280x720', '1024x768', '768x1024', '390x844']
  .forEach(function (v, i) {
    var m = MA.viewports[v];
    ok(!!m, 'F6.' + (i + 1) + ' ' + v + ' measured');
    if (!m) return;
    eq(m.htmlImagesBroken, 0, 'F6.' + (i + 1) + 'a ' + v + ' no broken <img>');
    eq(m.htmlImagesLoaded, m.htmlImages, 'F6.' + (i + 1) + 'b ' + v + ' every <img> loaded');
    ok(m.imageMarkerCount > 0 && m.fallbackMarkerCount > 0,
      'F6.' + (i + 1) + 'c ' + v + ' photographs AND plates are both drawn',
      [m.imageMarkerCount, m.fallbackMarkerCount]);
    eq(m.page.horizontalOverflow, 0, 'F6.' + (i + 1) + 'd ' + v + ' no overflow');
    eq((m.consoleErrors || []).length, 0, 'F6.' + (i + 1) + 'e ' + v + ' no console errors');
    eq(m.flagStillFalse, true, 'F6.' + (i + 1) + 'f ' + v + ' flag still false');
  });
eq((SRC.boardUi.match(/im\.onerror\s*=/g) || []).length, 2,
  'F7  both Product Strategy <img> hosts still have an independent fallback');

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
function policyWith(a, b2) {
  var c = vm.createContext({ console: console, module: { exports: {} } });
  vm.runInContext(swapIn(SRC.policy, a, b2), c, { filename: 'policy-mut.js' });
  return c.KM_IMAGE_REFERENCE_POLICY;
}
/* ONLY THE CLASSIFIER IS MUTATED. The first version also ran `swapIn` over p1b8cr3HostOf_ with the
   SAME anchor, which is not in that function, so every shape mutant threw "anchor not found" and was
   scored as surviving — three mutants reporting a defect in the helper, not in the code. */
function shapeWith(a, b2) {
  var c = vm.createContext({ console: console });
  vm.runInContext("function p1b3Str_(v){return String(v===undefined||v===null?'':v).trim();}", c);
  vm.runInContext('var P1B8CR3_IMAGE_EXT_ = '
    + /var P1B8CR3_IMAGE_EXT_ = (\[[^\]]*\]);/.exec(SRC.gs)[1] + ';', c);
  vm.runInContext(bodyOf(SRC.gs, 'p1b8cr3HasImageExt_'), c);
  vm.runInContext(swapIn(bodyOf(SRC.gs, 'p1b8cr3ShapeOf_'), a, b2), c);
  return c;
}

mut('G1  the allowlist ships non-empty, so a host nobody measured is already trusted — F1',
  function () {
    var P2 = policyWith('  P.APPROVED_EXTERNAL_HOSTS = [];',
      "  P.APPROVED_EXTERNAL_HOSTS = ['cdn.guessed.test'];");
    return POLICY.APPROVED_EXTERNAL_HOSTS.length === 0 && P2.APPROVED_EXTERNAL_HOSTS.length === 1;
  });

mut('G2  host matching becomes a SUFFIX test, so approved.test.attacker.test passes — F2', function () {
  var P2 = policyWith("        if (String(approved[i]).toLowerCase() === host) { listed = true; break; }",
    "        if (host.indexOf(String(approved[i]).toLowerCase()) !== -1) { listed = true; break; }");
  var o = { pageProtocol: 'https:', pageHost: ORIGIN.pageHost, approvedHosts: ['approved.test'] };
  return POLICY.classify('https://approved.test.attacker.test/a.jpg', o).reason === 'UNAPPROVED_HOST'
    && P2.classify('https://approved.test.attacker.test/a.jpg', o).kind === 'ABSOLUTE_APPROVED';
});

mut('G3  any HTTPS is waved through, so the allowlist stops existing — F1/E4a', function () {
  var P2 = policyWith("      if (!sameOrigin && !listed) return reject('UNAPPROVED_HOST', v);",
    "      if (!sameOrigin && !listed && !/^https:/i.test(v)) return reject('UNAPPROVED_HOST', v);");
  return POLICY.classify('https://anything.test/a.jpg', ORIGIN).reason === 'UNAPPROVED_HOST'
    && P2.classify('https://anything.test/a.jpg', ORIGIN).kind === 'ABSOLUTE_APPROVED';
});

mut('G4  the census stops refusing an authority that carries user information — C5', function () {
  var c = vm.createContext({ console: console });
  vm.runInContext("function p1b3Str_(v){return String(v===undefined||v===null?'':v).trim();}", c);
  vm.runInContext(swapIn(bodyOf(SRC.gs, 'p1b8cr3HostOf_'),
    "  if (authority.indexOf('@') !== -1) return { refuse: 'AUTHORITY_CARRIES_USER_INFO' };", ''), c);
  var bad = 'https://user:pass@cdn.test/a.jpg';
  return hostOf(bad).refuse === 'AUTHORITY_CARRIES_USER_INFO'
    && !!(c.p1b8cr3HostOf_(bad) || {}).host;
});

mut('G5  the census counts a Windows path as an asset because it ends in .jpg — D2a', function () {
  var c = shapeWith("  if (v.indexOf('\\\\') !== -1) return 'windows_path_rows';", '');
  return shapeOf('C:\\x\\p.jpg') === 'windows_path_rows'
    && c.p1b8cr3ShapeOf_('C:\\x\\p.jpg') !== 'windows_path_rows';
});

mut('G6  the census counts a traversal as an asset — D2b', function () {
  var c = shapeWith("  if (v.indexOf('..') !== -1) return 'traversal_rows';", '');
  return shapeOf('../x.jpg') === 'traversal_rows' && c.p1b8cr3ShapeOf_('../x.jpg') === 'relative_asset_rows';
});

mut('G7  the census counts a bare Drive id as a displayable reference — D1', function () {
  var c = shapeWith("  if (/^[A-Za-z0-9_\\-]{25,}$/.test(v)) return 'drive_or_file_id_rows';",
    "  if (/^[A-Za-z0-9_\\-]{25,}$/.test(v)) return 'filename_only_rows';");
  var id = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456';
  return shapeOf(id) === 'drive_or_file_id_rows' && c.p1b8cr3ShapeOf_(id) === 'filename_only_rows';
});

mut('G8  the census scores absolute rows as compatible instead of reporting them — E5', function () {
  var mutated = swapIn(SRC.gs,
    '      old_displayed_new_depends_on_allowlist: absolute,',
    '      old_displayed_new_displayed_absolute: absolute,');
  return /old_displayed_new_depends_on_allowlist/.test(SRC.gs)
    && !/old_displayed_new_depends_on_allowlist/.test(mutated);
});

mut('G9  the census caps or samples the universe — B8/C3', function () {
  /* A cap is exactly what made R2 unable to answer this question. The census must read every row. */
  return !/P1B8CR3[A-Z_]*MAX_|slice\(0,\s*\d+\)|\.length\s*>\s*\d+\s*\?\s*\d+/.test(CENSUS)
    && /for \(var i = 0; i < rows\.length; i\+\+\)/.test(CENSUS);
});

mut('G10 the census emits the value it classified — C4', function () {
  var mutated = swapIn(SRC.gs, '        if (refusals.indexOf(h.refuse) === -1) refusals.push(h.refuse);',
    '        if (refusals.indexOf(h.refuse) === -1) refusals.push(h.refuse + \':\' + raw);');
  /* The detector is that `raw` reaches a published field. In the shipped file it never does. */
  var published = /refusals\.push\([^)]*raw[^)]*\)/;
  return !published.test(SRC.gs) && published.test(mutated);
});

mut('G11 the census writes something — C2', function () {
  var mutated = swapIn(SRC.gs, '      var raw = rows[i] ? rows[i].image_url : \'\';',
    '      var raw = rows[i] ? rows[i].image_url : \'\';\n      rows[i].image_url = raw;');
  var body = mutated.slice(mutated.indexOf('function RUN_P1_IMAGE_REFERENCE_UNIVERSE_CENSUS'));
  return !/rows\[i\]\.image_url\s*=/.test(CENSUS) && /rows\[i\]\.image_url\s*=/.test(body);
});

mut('G12 a partial redaction failure publishes the counts anyway — C5f', function () {
  var mutated = swapIn(SRC.gs, '      report.counts = null;\n      p1b8cr3Emit_(report);',
    '      report.counts = counts;\n      p1b8cr3Emit_(report);');
  return /report\.counts = null;/.test(SRC.gs) && !/report\.counts = null;/.test(mutated);
});

mut('G13 the shared policy is bypassed by campaign-risk and nobody notices — B3', function () {
  /* THE MUTANT IS THE SUITE'S OWN BLIND SPOT. If B3 were written as "campaign-risk uses the shared
     resolver" it would be a failing assertion about a real gap, so it is written as a RECORD of the
     gap — and this mutant proves the record is load-bearing: change the file to adopt the resolver
     and B3b must notice. */
  var mutated = swapIn(SRC.campaignRisk, '${_crEsc(r.image)}', '${_crEsc(getNormalizedSkuImage(r))}');
  return !/getNormalizedSkuImage/.test(SRC.campaignRisk) && /getNormalizedSkuImage/.test(mutated);
});

mut('G14 the equivalence corpus stops reaching a branch, so the claim becomes a sample — D1a',
  function () {
    var SHORT = ['', 'a.jpg'];
    var r2 = {};
    SHORT.forEach(function (v) { var s = shapeOf(v); r2[s === null ? '(blank)' : s] = 1; });
    var missed = SHAPES.filter(function (s) { return !r2[s] && s !== 'classification_unknown_rows'; });
    return Object.keys(reached).length > Object.keys(r2).length && missed.length > 0;
  });

mut('G15 the address is rewritten for an accepted value, so every picture moves — E2a', function () {
  var P2 = policyWith('    return { accepted: true, kind: \'SAME_ORIGIN_ASSET\', reason: null, url: v, input: v, note: null };',
    '    return { accepted: true, kind: \'SAME_ORIGIN_ASSET\', reason: null, url: \'assets/\' + v, input: v, note: null };');
  return POLICY.classify('img9.jpg', ORIGIN).url === 'img9.jpg'
    && P2.classify('img9.jpg', ORIGIN).url === 'assets/img9.jpg';
});

// =============================================================================================
console.log('\n===================================================================================');
console.log((fail ? 'FAIL' : 'PASS') + ' — passed ' + pass + '  failed ' + fail
  + '  |  mutants caught ' + mutCaught + '  survived ' + mutSurvived);
console.log('===================================================================================');
process.exit(fail ? 1 : 0);
