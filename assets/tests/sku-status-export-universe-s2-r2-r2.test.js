// Kitchen Mama Operation System — S2-R2-R2  STATUS TEMPLATE EXPORT CANONICAL UNIVERSE INJECTION
//
// THE DEFECT THIS LOCKS SHUT, AND WHY IT IS WORSE THAN THE IMPORT ONE. `exportSkuStatusTemplate`
// built its rows from a three-step fallback chain: `KM.DB.getSkuDetails()` (the broad Operation-DB
// cache), then — if that came back empty — `getAllSkuDataWithOverrides()` with no argument, which
// read the SAME empty broad cache and fell through to the hardcoded demo arrays in utils/data.js.
// Since the SKU Details primary read went canonical and default-on, nothing primes that cache in an
// ordinary session, so every step fired: the user clicked "Export Template" and received a file
// named sku_details_export_<date>.csv containing 26 invented SKUs with invented UPCs, invented
// prices and a PM named "Alice". The import defect produced a wrong count on screen. This one
// produced a wrong FILE, under a canonical name, with no warning, that then leaves the building.
//
// THE PROOF IS THE ARTIFACT, NOT THE SOURCE. Every assertion here reads the bytes that would have
// been written — the CSV text handed to the Blob, its type, the anchor's download name, and the
// number of times a URL was created and a link was clicked. "It no longer reads the broad cache" is
// established by running the export against a TRAP getter that counts every touch, with a broad
// cache holding SKUs that would visibly change the file if they leaked in.
//
// AND THE DISTINCTION BOTH TEMPLATE PATHS NOW SHARE: a universe that is positively known to be empty
// is a real answer and still writes a header row. A universe the page cannot vouch for writes
// NOTHING — no Blob, no object URL, no click — because an empty file and an unknown one look
// identical once they are on disk, and only one of them is true.
// Run: node assets/tests/sku-status-export-universe-s2-r2-r2.test.js
// NOTE: no 'use strict' — extracted browser fns are eval'd into module scope (the F1-7H convention).

var fs = require('fs'), path = require('path'), crypto = require('crypto');
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

function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8').replace(/\r\n/g, '\n'); }
function extractFn(src, name) {
  var sig = 'function ' + name + '(', i = src.indexOf(sig);
  if (i < 0) { throw new Error('fn not found: ' + name); }
  var start = i, depth = 0, started = false;
  for (; i < src.length; i++) {
    var ch = src[i];
    if (ch === '{') { depth++; started = true; }
    else if (ch === '}') { depth--; if (started && depth === 0) { return src.slice(start, i + 1); } }
  }
  throw new Error('unbalanced fn: ' + name);
}
/** A mutation whose anchor is not unique returns null and is SCORED AS SURVIVED. A mutant that
 *  merely failed to apply has proved nothing, and must never be counted as caught. */
function mutateSrc(src, from, to) {
  var n = src.split(from).length - 1;
  if (n !== 1) { console.error('  (mutant anchor matched ' + n + ' times — not applied)'); return null; }
  return src.split(from).join(to);
}

var OVR = read('js/utils/sku-overrides.js');
var SK = read('js/pages/sku-details.js');

// -------------------------------------------------------------------------------------------------
// The rig. Every download side effect is recorded, because "it refused" and "it wrote an empty file"
// are only distinguishable by what the browser was asked to do.
// -------------------------------------------------------------------------------------------------
function FakeDate() {}
FakeDate.prototype.toISOString = function () { return '2026-09-18T00:00:00.000Z'; };

function rig() {
  var rec = { blobs: [], urls: 0, clicks: 0, revokes: 0, downloads: [] };
  function BlobStub(parts, opts) { rec.blobs.push({ text: parts.join(''), type: opts && opts.type }); }
  var URLStub = {
    createObjectURL: function () { rec.urls++; return 'blob:mock/' + rec.urls; },
    revokeObjectURL: function () { rec.revokes++; }
  };
  var docStub = {
    createElement: function (tag) {
      var a = { tagName: tag, click: function () { rec.clicks++; rec.downloads.push({ href: a.href, name: a.download }); } };
      return a;
    }
  };
  return { rec: rec, Blob: BlobStub, URL: URLStub, document: docStub, Date: FakeDate };
}

/** A window whose broad-cache getter is a TRAP: every touch is counted. */
function poisonedWindow(rows) {
  var touched = { n: 0 };
  var db = {};
  Object.defineProperty(db, 'getSkuDetails', {
    get: function () { touched.n++; return function () { return rows || []; }; }
  });
  return { win: { KM: { DB: db } }, touched: touched };
}

/** Build exportSkuStatusTemplate from a (possibly mutated) source with every dependency bound. */
function buildExport(src, win, r, getAll) {
  var body = extractFn(src, 'exportSkuStatusTemplate') + '\nreturn exportSkuStatusTemplate;';
  return new Function('window', 'Blob', 'URL', 'document', 'Date', 'getAllSkuDataWithOverrides', body)(
    win, r.Blob, r.URL, r.document, r.Date, getAll || function () { return {}; });
}

/** The mock arrays the old fallback chain ended in — the rows a canonical session actually received. */
function mockGroups() {
  return {
    'Upcoming SKU': [{ sku: 'CO1150-ZW', productName: 'Marble Black', category: 'Electric Can Opener', series: 'CO1150', pm: 'Alice' }],
    'Running in the Market': [{ sku: 'CO1100-R', productName: 'Red', category: 'Electric Can Opener', series: 'CO1100', pm: 'Alice' }],
    'Phasing Out': [], 'Closure': []
  };
}

function runExport(universe, opts) {
  opts = opts || {};
  var p = poisonedWindow(opts.broad === undefined ? BROAD : opts.broad);
  var r = rig();
  var fn = buildExport(opts.src || OVR, p.win, r, opts.getAll);
  var ret = fn(universe);
  var text = r.rec.blobs.length ? r.rec.blobs[0].text : null;
  return {
    ret: ret, rec: r.rec, broadTouched: p.touched.n,
    bom: text === null ? null : text.charCodeAt(0) === 0xFEFF,
    csv: text === null ? null : text.replace(/^﻿/, ''),
    lines: text === null ? null : text.replace(/^﻿/, '').split('\n')
  };
}

// -------------------------------------------------------------------------------------------------
// The data. The injected universe and the broad cache are DELIBERATELY DISJOINT, so any leak from the
// cache into the file changes a line the assertions pin by value.
// -------------------------------------------------------------------------------------------------
var HEADERS = 'sku,product_name,category,series,lifecycle,image_url,gs1_code,gs1_type,amz_asin,'
  + 'item_dimensions,item_weight,package_dimensions,package_weight,carton_dimensions,carton_weight,'
  + 'units_per_carton,hscode,declared_value,minimum_price,msrp,selling_price,pm,created_at,updated_at';

var ROW_FULL = { sku: 'GA0450', productName: 'Widget, "Pro"', category: 'Kitchen', series: 'GA',
  lifecycle: 'Running in the Market', image: 'img/a.png', gs1Code: '0001', gs1Type: 'UPC',
  amzAsin: 'B001', itemDimensions: '8x3x2 in', itemWeight: '0.5', packageDimensions: '9x4x3 in',
  packageWeight: '0.8', cartonDimensions: '20x15x10 in', cartonWeight: '12', unitsPerCarton: 24,
  hsCode: '8509.80', declaredValue: '10', minimumPrice: '19.99', msrp: '29.99', sellingPrice: '24.99',
  pm: 'Bo', createdAt: '2026-01-01', updatedAt: '2026-02-02' };
var ROW_SPARSE = { sku: 'GA0451', productName: 'Plain', category: 'Kitchen', series: 'GA',
  lifecycle: 'Upcoming SKU' };

var EXP_FULL = 'GA0450,"Widget, ""Pro""",Kitchen,GA,Running in the Market,img/a.png,0001,UPC,B001,'
  + '8x3x2 in,0.5,9x4x3 in,0.8,20x15x10 in,12,24,8509.80,10,19.99,29.99,24.99,Bo,2026-01-01,2026-02-02';
var EXP_SPARSE = 'GA0451,"Plain",Kitchen,GA,Upcoming SKU' + new Array(20).join(',');

var UNIVERSE = [ROW_FULL, ROW_SPARSE];
var BROAD = [{ sku: 'ZZ9990', productName: 'Leaked A' }, { sku: 'ZZ9991', productName: 'Leaked B' }];

// -------------------------------------------------------------------------------------------------
// The page side, evaluated from the real source.
// -------------------------------------------------------------------------------------------------
var window = { KM: { DB: {} } };          // module-scope stub the eval'd page fns close over
var _skReadModel = null;
eval(['_skEffectiveWorkspace', '_skGetSkuDetails', '_skStatusTemplateUniverse_']
  .map(function (n) { return extractFn(SK, n); }).join('\n'));

function pageUniverse(workspaceActive, model, broadRows) {
  window.KM = {
    api: { workspaceApiActive: function () { return workspaceActive; } },
    DB: { getSkuDetails: function () { return broadRows || []; } }
  };
  _skReadModel = model;
  return _skStatusTemplateUniverse_();
}

/** The real page handler, with its collaborators observed. */
function buildHandler(src) {
  var body = src.match(/^var _SKU_EXPORT_UNAVAILABLE_ =.*$/m)[0] + '\n'
    + extractFn(src, 'handleExportStatusTemplate') + '\nreturn handleExportStatusTemplate;';
  return function (universe, readModel) {
    var seen = { toasts: [], exported: 0, arg: undefined };
    var fn = new Function('window', '_skStatusTemplateUniverse_', 'showSkuStatusToast',
      'exportSkuStatusTemplate', '_skReadModel', body)(
      { exportSkuStatusTemplate: function () {} },
      function () { return universe; },
      function (m) { seen.toasts.push(m); },
      function (u) { seen.exported++; seen.arg = u; },
      readModel);
    fn();
    return seen;
  };
}

function main() {
  return Promise.resolve()
    // =============================================================================================
    .then(function () { section('A — THE FILE IS THE INJECTED UNIVERSE, EXACTLY'); })
    .then(function () {
      var r = runExport(UNIVERSE);
      eq(r.lines.length, 3, 'A1  one header row and one row per injected SKU — nothing else');
      eq(r.lines[0], HEADERS, 'A2  the 24-column header is byte-for-byte unchanged');
      eq(r.lines[1], EXP_FULL, 'A3  a full row serialises exactly, quoting and "" escaping included');
      eq(r.lines[2], EXP_SPARSE, 'A4  a sparse row still emits all 24 fields, empty where absent');
      eq([r.lines[1].slice(0, 6), r.lines[2].slice(0, 6)], ['GA0450', 'GA0451'],
        'A5  row order follows the injected array, unsorted');
      ok(r.bom === true, 'A6  the UTF-8 BOM is still written');
      eq(r.rec.blobs[0].type, 'text/csv;charset=utf-8;', 'A7  and the MIME type is unchanged');
      eq(r.rec.downloads[0].name, 'sku_details_export_20260918.csv', 'A8  the filename rule is unchanged');
      eq([r.rec.blobs.length, r.rec.urls, r.rec.clicks, r.rec.revokes], [1, 1, 1, 1],
        'A9  exactly one Blob, one object URL, one click, one revoke');
      eq(r.broadTouched, 0, 'A10 THE BROAD CACHE WAS NEVER TOUCHED — not once, not as a fallback');
      ok(r.csv.indexOf('ZZ999') < 0, 'A11 and no broad-cache row reached the file');
      ok(typeof r.ret === 'undefined', 'A12 the return type is still undefined, as its caller expects');
    })

    // =============================================================================================
    .then(function () { section('B — EMPTY IS AN ANSWER; UNAVAILABLE IS NOT'); })
    .then(function () {
      var r = runExport([]);
      eq(r.lines, [HEADERS], 'B1  a positively empty universe writes the header row and nothing else');
      eq([r.rec.blobs.length, r.rec.urls, r.rec.clicks], [1, 1, 1], 'B2  and it is a real download');
      eq(r.broadTouched, 0, 'B3  with no consolation read of the broad cache');
      ok(r.csv.indexOf('Alice') < 0 && r.csv.indexOf('CO1100') < 0,
        'B4  and no demo row from the old mock fallback');
    })
    .then(function () {
      var cases = [['undefined', undefined], ['null', null], ['an object', { sku: 'X' }],
        ['a string', 'GA0450'], ['a number', 7]];
      var bad = cases.filter(function (c) {
        var r = runExport(c[1]);
        return !(r.rec.blobs.length === 0 && r.rec.urls === 0 && r.rec.clicks === 0
          && r.rec.revokes === 0 && r.broadTouched === 0 && typeof r.ret === 'undefined');
      }).map(function (c) { return c[0]; });
      eq(bad, [], 'B5  every non-array universe refuses: no Blob, no URL, no click, no cache read');
    })

    // =============================================================================================
    .then(function () { section('C — ONE READINESS RULE, OWNED BY THE PAGE, SHARED BY BOTH PATHS'); })
    .then(function () {
      ok(pageUniverse(true, null, BROAD) === null,
        'C1  workspace active with no read model → unavailable, NOT an empty universe');
      eq(pageUniverse(true, { skuDetails: [] }, BROAD), [],
        'C2  a positively loaded-empty read model → an empty universe, which is an answer');
      eq(pageUniverse(true, { skuDetails: UNIVERSE }, BROAD).map(function (i) { return i.sku; }),
        ['GA0450', 'GA0451'], 'C3  a loaded read model → its rows');
      eq(pageUniverse(false, null, BROAD).map(function (i) { return i.sku; }), ['ZZ9990', 'ZZ9991'],
        'C4  kill-switch mode → exactly what the page itself renders');
    })
    .then(function () {
      var live = [{ sku: 'GA0450' }];
      var snap = pageUniverse(true, { skuDetails: live }, BROAD);
      live.push({ sku: 'ADDED-LATER' });
      ok(snap !== live && snap.length === 1,
        'C5  the page hands over a stable snapshot, not the live model array');
    })
    .then(function () {
      var h = buildHandler(SK);
      var refused = h(null, null);
      eq([refused.exported, refused.toasts.length], [0, 1],
        'C6  the handler refuses an unavailable universe and says so, without calling the exporter');
      ok(/still loading/.test(refused.toasts[0]) && /export/.test(refused.toasts[0]),
        'C7  and the message is about the export, honestly', refused.toasts);
      var okRun = h(UNIVERSE, { skuDetails: UNIVERSE });
      eq([okRun.exported, okRun.toasts.length], [1, 0], 'C8  a ready page exports once, silently');
      eq(okRun.arg.map(function (i) { return i.sku; }), ['GA0450', 'GA0451'],
        'C9  and the universe is what it passes — the export takes no source of its own');
    })
    .then(function () {
      /* Retry after readiness: the same handler, the same page, no reload. */
      var universe = null;
      var h = function () {
        var seen = { toasts: [], exported: 0 };
        var body = SK.match(/^var _SKU_EXPORT_UNAVAILABLE_ =.*$/m)[0] + '\n'
          + extractFn(SK, 'handleExportStatusTemplate') + '\nreturn handleExportStatusTemplate;';
        new Function('window', '_skStatusTemplateUniverse_', 'showSkuStatusToast', 'exportSkuStatusTemplate', body)(
          { exportSkuStatusTemplate: function () {} },
          function () { return universe; },
          function (m) { seen.toasts.push(m); },
          function () { seen.exported++; })();
        return seen;
      };
      var first = h();
      universe = UNIVERSE;                     // the scoped read lands
      var second = h();
      eq([first.exported, second.exported], [0, 1],
        'C10 a refused export succeeds once the read lands — no reload needed');
    })
    .then(function () {
      var callSites = (SK.match(/[^.\w]exportSkuStatusTemplate\(/g) || []).length;
      eq(callSites, 1, 'C11 the page has exactly one export call site');
      ok(/exportSkuStatusTemplate\(universe\)/.test(SK), 'C12 and it passes the universe');
      var bodyEx = extractFn(SK, 'handleExportStatusTemplate');
      var bodyIm = extractFn(SK, 'handleImportStatusTemplate');
      ok(/_skStatusTemplateUniverse_\(\)/.test(bodyEx) && /_skStatusTemplateUniverse_\(\)/.test(bodyIm),
        'C13 import and export read readiness through the SAME helper, not two approximations');
      eq((SK.match(/_skEffectiveWorkspace\(\) && !_skReadModel/g) || []).length, 2,
        'C14 and that predicate is written once for the renderer and once for the templates — nowhere else');
    })

    // =============================================================================================
    .then(function () { section('D — NOTHING ELSE MOVED'); })
    .then(function () {
      var EX = extractFn(OVR, 'exportSkuStatusTemplate');
      ok(EX.indexOf('KM.DB') < 0, 'D1  the export body names no KM.DB accessor at all');
      ok(EX.indexOf('getAllSkuDataWithOverrides') < 0,
        'D2  nor the mock-array fallback that followed it');
      ok(!/getWorkspace|fetch\(|XMLHttpRequest|\$\.ajax/.test(EX),
        'D3  and it issues no request of its own — no second workspace read, no transport');
      ok(!/KM\.DB\.(upsert|update|delete|save)[A-Za-z]*\s*\(|\.save\s*\(/.test(EX),
        'D4  the export is read-only — it makes no write call');
      ok(/window\.exportSkuStatusTemplate = exportSkuStatusTemplate;/.test(OVR),
        'D5  the export is still exported under the same name');
      ok(/function getAllSkuDataWithOverrides\(sourceItems\)/.test(OVR),
        'D6  the shared grouping helper is untouched — sku-handbook still calls it as before');
    })
    .then(function () {
      var before = JSON.stringify(UNIVERSE), n = UNIVERSE.length;
      runExport(UNIVERSE);
      ok(JSON.stringify(UNIVERSE) === before && UNIVERSE.length === n,
        'D7  neither the injected array nor its rows were mutated');
    })
    .then(function () {
      /* Two exports from the same universe must produce identical bytes — no accumulated state. */
      var a = runExport(UNIVERSE), b = runExport(UNIVERSE);
      ok(a.csv === b.csv, 'D8  a repeated export produces identical bytes, with no carried-over rows');
      eq(b.rec.clicks, 1, 'D9  and one click per invocation, never two');
    })
    .then(function () {
      /* The broad cache holding DIFFERENT rows changes nothing about the file. */
      var a = runExport(UNIVERSE, { broad: BROAD });
      var b = runExport(UNIVERSE, { broad: [] });
      var c = runExport(UNIVERSE, { broad: [{ sku: 'OTHER', productName: 'Other' }] });
      ok(a.csv === b.csv && b.csv === c.csv,
        'D10 three different broad caches, one identical file — the cache is not a source');
    })
    .then(function () {
      /* And neither is the mock chain, even when it is reachable and full. */
      var r = runExport([], { getAll: mockGroups });
      eq(r.lines, [HEADERS], 'D11 an empty universe does not fall through to the demo arrays');
    })

    // =============================================================================================
    .then(function () { section('E — THE IMAGE SURFACE IS FROZEN BY DIGEST'); })
    .then(function () {
      var d = imageDigest(OVR);
      eq(d.missing, [], 'E1  every frozen image slice is present');
      ok(d.sha === IMAGE_SHA, 'E2  the image surface matches the sealed digest', d.sha);
      ok(d.bytes === 3086, 'E3  and its byte count', d.bytes);
    })

    // =============================================================================================
    .then(function () { section('F — DRIVEN MUTANTS (each must change an OBSERVED artifact)'); })
    .then(runMutants)

    .then(function () {
      console.log('\n' + new Array(101).join('='));
      console.log('SKU STATUS EXPORT UNIVERSE (S2-R2-R2) — passed ' + pass + '  failed ' + fail
        + '  |  mutants caught ' + neg.caught + '  survived ' + neg.missed);
      console.log(new Array(101).join('='));
      if (fail > 0) { process.exitCode = 1; }
    });
}

// -------------------------------------------------------------------------------------------------
// The image-surface digest, computed the same way the round's freeze script computes it.
// -------------------------------------------------------------------------------------------------
var IMAGE_SHA = '73d4b18516ba8315c697a9ec20b38dd5b39ea02412e29f7ce0702c14ef75eaaa';
function imageDigest(src) {
  var FUNCS = ['getSkuImageOverrides', 'getSkuImageOverride', 'setSkuImageOverride',
    'getNormalizedSkuImage', '_skuImagePolicy', 'resolveSkuImageUrl', 'classifySkuImageSource'];
  var DECLS = ['SKU_IMAGE_KEY'];
  var EXPORTS = ['window.getSkuImageOverride', 'window.getNormalizedSkuImage',
    'window.resolveSkuImageUrl', 'window.classifySkuImageSource', 'window.setSkuImageOverride'];
  var out = [], missing = [];
  DECLS.forEach(function (d) {
    var m = src.match(new RegExp('^(?:const|var|let)\\s+' + d + '\\s*=.*$', 'm'));
    out.push({ name: 'decl:' + d, text: m ? m[0] : null });
  });
  FUNCS.forEach(function (f) {
    var i = src.indexOf('function ' + f + '(');
    if (i < 0) { out.push({ name: 'fn:' + f, text: null }); return; }
    var end = src.indexOf('\n}\n', i);
    out.push({ name: 'fn:' + f, text: end < 0 ? null : src.slice(i, end + 3) });
  });
  EXPORTS.forEach(function (e) {
    var m = src.match(new RegExp('^' + e.replace('.', '\\.') + '\\s*=.*$', 'm'));
    out.push({ name: 'export:' + e, text: m ? m[0] : null });
  });
  ['KM_IMAGE_REFERENCE_POLICY', 'KM_REPO_ASSET_MANIFEST'].forEach(function (g) {
    var hits = (src.match(new RegExp('.*' + g + '.*', 'g')) || []);
    out.push({ name: 'refs:' + g, text: hits.length ? hits.join('\n') : '(none)' });
  });
  var joined = out.map(function (r) {
    if (r.text === null) { missing.push(r.name); return r.name + '\n<MISSING>'; }
    return r.name + '\n' + r.text;
  }).join('\n---\n');
  return { sha: crypto.createHash('sha256').update(joined, 'utf8').digest('hex'),
    bytes: joined.length, missing: missing };
}

// -------------------------------------------------------------------------------------------------
// Mutants. Each rewrites the REAL source, rebuilds through the same factory, and is scored ONLY on a
// changed artifact — file bytes, a filename, a touch count, a click count. An anchor that no longer
// matches scores SURVIVED, so a mutant can never pass by failing to apply.
// -------------------------------------------------------------------------------------------------
var GUARD = '    if (!Array.isArray(skuUniverse)) return;   // fail closed BEFORE any Blob, object URL or click';
var SOURCE = '    var items = skuUniverse;                   // read only; never mutated, never re-fetched';

function mutantExport(label, from, to, universe, checker, opts) {
  var src = mutateSrc(OVR, from, to);
  if (src === null) { score(label, false); return; }
  var r = runExport(universe, Object.assign({ src: src }, opts || {}));
  score(label, checker(r) === true);
}

function runMutants() {
  // 1 — the broad-cache getter is put back as the source.
  mutantExport('M1  the export broad-cache getter is restored', SOURCE,
    '    var items = (window.KM && window.KM.DB && window.KM.DB.getSkuDetails) ? window.KM.DB.getSkuDetails() : [];',
    UNIVERSE, function (r) { return r.broadTouched > 0 && r.csv.indexOf('ZZ9990') >= 0; });

  // 2 — an unavailable universe is silently downgraded to an empty one, and a file is written.
  mutantExport('M2  an unavailable universe becomes an empty one', GUARD,
    '    if (!Array.isArray(skuUniverse)) { skuUniverse = []; }',
    undefined, function (r) { return r.rec.clicks === 1 && r.lines.length === 1; });

  // 3 — the injected rows are ignored.
  mutantExport('M3  the injected rows are ignored', SOURCE, '    var items = [];',
    UNIVERSE, function (r) { return r.lines.length === 1 && r.rec.clicks === 1; });

  // 4 — broad-cache rows are merged in on top of the injected universe.
  mutantExport('M4  broad-cache rows are merged into the file', SOURCE,
    SOURCE + '\n    items = items.concat((window.KM && window.KM.DB && window.KM.DB.getSkuDetails) ? window.KM.DB.getSkuDetails() : []);',
    UNIVERSE, function (r) { return r.lines.length === 5 && r.csv.indexOf('ZZ9990') >= 0; });

  // 5 — the refusal stops short of returning, so a download happens anyway.
  mutantExport('M5  a download is generated after the refusal', GUARD,
    '    if (!Array.isArray(skuUniverse)) { skuUniverse = skuUniverse || []; }',
    null, function (r) { return r.rec.clicks === 1 || r.rec.urls === 1 || r.rec.blobs.length === 1; });

  // 6 — a header is renamed.
  mutantExport('M6  a CSV header is changed', "var headers = ['sku','product_name'",
    "var headers = ['sku_id','product_name'", UNIVERSE,
    function (r) { return r.lines[0] !== HEADERS; });

  // 7 — row order is reversed.
  mutantExport('M7  row order is reversed', SOURCE, SOURCE + '\n    items = items.slice().reverse();',
    UNIVERSE, function (r) { return r.lines[1].slice(0, 6) === 'GA0451'; });

  // 8 — the export issues a workspace read of its own.
  (function () {
    var src = mutateSrc(OVR, SOURCE,
      '    if (window.KM && window.KM.api && window.KM.api.getWorkspace) { window.KM.api.getWorkspace(\'skuDetails\', {}); }\n' + SOURCE);
    if (src === null) { score('M8  the export issues a second workspace read', false); return; }
    var calls = 0;
    var p = poisonedWindow(BROAD);
    p.win.KM.api = { getWorkspace: function () { calls++; return Promise.resolve({ success: true, data: {} }); } };
    var r = rig();
    buildExport(src, p.win, r)(UNIVERSE);
    score('M8  the export issues a second workspace read', calls === 1);
  })();

  // 9 — import and export are split onto different readiness rules.
  (function () {
    var label = 'M9  import and export are split onto different readiness rules';
    var src = mutateSrc(SK, '    var universe = _skStatusTemplateUniverse_();\n    if (!universe) { showSkuStatusToast(_SKU_EXPORT_UNAVAILABLE_); return; }',
      '    var universe = (_skReadModel && _skReadModel.skuDetails) || [];');
    if (src === null) { score(label, false); return; }
    var seen = { exported: 0, toasts: [] };
    var body = src.match(/^var _SKU_EXPORT_UNAVAILABLE_ =.*$/m)[0] + '\n'
      + extractFn(src, 'handleExportStatusTemplate') + '\nreturn handleExportStatusTemplate;';
    new Function('window', '_skStatusTemplateUniverse_', 'showSkuStatusToast', 'exportSkuStatusTemplate', '_skReadModel', body)(
      { exportSkuStatusTemplate: function () {} },
      function () { return null; },                 // the SHARED rule says: unavailable
      function (m) { seen.toasts.push(m); },
      function () { seen.exported++; },
      null)();
    /* the shared rule refused; the split rule exported anyway */
    score(label, seen.exported === 1 && seen.toasts.length === 0);
  })();

  // 10 — the utility mutates the array it was handed. Observed on the ARRAY, not on the file.
  (function () {
    var label = 'M10 the export mutates the array it was handed';
    var src = mutateSrc(OVR, SOURCE, SOURCE + '\n    items.sort(function(a,b){ return a.sku < b.sku ? 1 : -1; });');
    if (src === null) { score(label, false); return; }
    var arr = [ROW_FULL, ROW_SPARSE];
    var p = poisonedWindow(BROAD), r = rig();
    buildExport(src, p.win, r)(arr);
    score(label, arr[0].sku === 'GA0451');
  })();

  // 11 — one byte inside the image resolver must move the sealed digest.
  (function () {
    var src = mutateSrc(OVR, 'function resolveSkuImageUrl(imageUrl) {', 'function resolveSkuImageUrl(imageUrl ) {');
    if (src === null) { score('M11 one image-resolver byte is altered', false); return; }
    score('M11 one image-resolver byte is altered', imageDigest(src).sha !== IMAGE_SHA);
  })();

  // 12 — the mock-array fallback chain is restored. THE ORIGINAL DEFECT, in full.
  mutantExport('M12 the demo-array fallback chain is restored', SOURCE,
    SOURCE + '\n    if (items.length === 0) { var groups = getAllSkuDataWithOverrides(); Object.values(groups).forEach(function(arr) { items = items.concat(arr); }); }',
    [], function (r) { return r.csv.indexOf('Alice') >= 0 && r.lines.length === 3; },
    { getAll: mockGroups });

  return Promise.resolve();
}

main().catch(function (e) {
  console.error('RUNNER ERROR ' + (e && e.stack || e));
  process.exitCode = 3;
});
