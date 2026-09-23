// Kitchen Mama Operation System — S2-R2-R1  STATUS TEMPLATE CANONICAL UNIVERSE INJECTION
//
// THE DEFECT THIS LOCKS SHUT. `importSkuStatusTemplate` built its "existing SKUs" set from
// `KM.DB.getSkuDetails()` — the broad Operation-DB cache. Since the SKU Details primary read went
// canonical and default-on, nothing primes that cache in an ordinary session (every page that could
// load it sits behind its own kill switch), so the getter returned `[]`, and EVERY ROW of an imported
// template was counted NEW — including SKUs that already exist. Wrong in the one direction nobody
// checks, and non-deterministic besides: visit a kill-switch page first and the same file counts
// correctly.
//
// THE PROOF IS BEHAVIOURAL, NOT TEXTUAL. "It no longer reads the broad cache" is not asserted by
// grepping for a symbol. The import runs with `window.KM.DB.getSkuDetails` POISONED — a getter that
// throws if anything touches it, and a broad cache stuffed with SKUs that would change every total if
// they leaked in. A migration that still consults it fails loudly; one that ignores it cannot be
// distinguished from one that never had the line.
//
// AND THE ONE DISTINCTION THE WHOLE FIX RESTS ON: an EMPTY universe and an UNKNOWN universe are not
// the same fact. An empty one is a real answer — every valid row is genuinely new. An unknown one
// refuses, because "0 existing" from a read that never completed is a sentence about the reader, not
// about the data.
// Run: node assets/tests/sku-status-import-universe-s2-r2-r1.test.js
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

var OVR = read('js/utils/sku-overrides.js');
var SK = read('js/pages/sku-details.js');

// -------------------------------------------------------------------------------------------------
// The rig: a FileReader shim, and a factory that binds the REAL function source to controlled deps.
// Mutants re-enter through the same factory with a mutated source, so a mutant and the original are
// compared on identical footing.
// -------------------------------------------------------------------------------------------------
/* `onload` runs on a timer, so a throw inside it is an UNCAUGHT exception rather than a rejected
   promise — it would kill the process instead of scoring a mutant. Mutants that remove the readiness
   guard do exactly that, so the shim captures the throw and `settle()` turns it into an observation. */
var LAST_THROW = null;
function FileReaderShim() { this.onload = null; }
FileReaderShim.prototype.readAsText = function (file) {
  var self = this;
  setTimeout(function () {
    try { self.onload({ target: { result: file.__text } }); }
    catch (e) { LAST_THROW = e; }
  }, 0);
};
function file(text) { return { __text: text }; }
function settle(p) {
  return Promise.race([p, new Promise(function (res) {
    setTimeout(function () { res({ __threw: String(LAST_THROW && LAST_THROW.message) }); }, 30);
  })]);
}

function constOf(src, name) {
  var m = src.match(new RegExp('^(?:var|const|let)\\s+' + name + '\\s*=[\\s\\S]*?;\\s*$', 'm'));
  if (!m) { throw new Error('const not found: ' + name); }
  return m[0];
}
var DEP_SRC = [constOf(OVR, 'VALID_LIFECYCLES'), constOf(OVR, 'IMPORT_REQUIRED_FIELDS'),
  constOf(OVR, 'IMPORT_NUMBER_FIELDS'), extractFn(OVR, 'parseCSVLine')].join('\n');

/** Build importSkuStatusTemplate from a (possibly mutated) sku-overrides source, with `window` bound
 *  to whatever the caller wants to expose — including a poisoned broad cache. */
function buildImport(src, win) {
  var body = DEP_SRC + '\n' + extractFn(src, 'importSkuStatusTemplate')
    + '\nreturn importSkuStatusTemplate;';
  return new Function('FileReader', 'window', body)(FileReaderShim, win);
}

/** A window whose broad-cache getter is a TRAP: touching it at all fails the run. */
function poisonedWindow(rows) {
  var touched = { n: 0 };
  var db = {};
  Object.defineProperty(db, 'getSkuDetails', {
    get: function () {
      touched.n++;
      return function () { return rows || []; };
    }
  });
  return { win: { KM: { DB: db } }, touched: touched };
}

var HEAD = 'sku,product_name,category,series,lifecycle';
function row(sku) { return sku + ',Widget ' + sku + ',Kitchen,Pro,Running in the Market'; }
function csv() { return [HEAD].concat([].slice.call(arguments)).join('\n'); }

var UNIVERSE = [{ sku: 'GA0450' }, { sku: 'GA0451' }];
/* The broad cache is deliberately DIFFERENT from the injected universe: if a leak ever happens, the
   totals move, and the assertion that pins them names the leak. */
var BROAD = [{ sku: 'ZZ9990' }, { sku: 'ZZ9991' }, { sku: 'GA0450' }, { sku: 'NEW-1' }];

function runWith(fn, text, universe, rows) {
  var p = poisonedWindow(rows === undefined ? BROAD : rows);
  var f = fn || buildImport(OVR, p.win);
  LAST_THROW = null;
  return settle(Promise.resolve(f(file(text), universe))).then(function (r) {
    r.__broadTouched = p.touched.n;
    return r;
  });
}
function run(text, universe, rows) { return runWith(null, text, universe, rows); }

// -------------------------------------------------------------------------------------------------
// The page-side readiness predicate, evaluated from the real source.
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

var results = {};
function main() {
  return Promise.resolve()
    // =============================================================================================
    .then(function () { section('A — THE TOTALS COME FROM THE INJECTED UNIVERSE, AND ONLY FROM IT'); })

    .then(function () { return run(csv(row('GA0450')), UNIVERSE); })
    .then(function (r) {
      results.existing = r;
      eq([r.newCount, r.updateCount, r.valid], [0, 1, 1],
        'A1  an existing SKU is an UPDATE — the case the defect got wrong');
    })
    .then(function () { return run(csv(row('BRAND-NEW')), UNIVERSE); })
    .then(function (r) {
      eq([r.newCount, r.updateCount, r.valid], [1, 0, 1], 'A2  a SKU absent from the universe is NEW');
    })
    .then(function () { return run(csv(row('GA0450'), row('GA0451'), row('BRAND-NEW'), row('OTHER-NEW')), UNIVERSE); })
    .then(function (r) {
      results.mixed = r;
      eq([r.total, r.valid, r.newCount, r.updateCount], [4, 4, 2, 2], 'A3  a mixed file splits exactly');
      eq(r.preview.map(function (p) { return p.action; }), ['update', 'update', 'new', 'new'],
        'A4  and each preview row names its own action');
    })
    .then(function () { return run(csv(row('GA0450'), row('GA0450')), UNIVERSE); })
    .then(function (r) {
      eq([r.total, r.valid, r.updateCount, r.errors.length], [2, 1, 1, 1],
        'A5  the documented in-file duplicate behaviour is unchanged');
      ok(/Duplicate SKU in import file/.test(r.errors[0].message), 'A6  with its existing message');
    })

    // =============================================================================================
    .then(function () { section('B — THE BROAD CACHE CANNOT REACH THE TOTALS'); })

    .then(function () { return run(csv(row('GA0450'), row('ZZ9990'), row('NEW-1')), UNIVERSE, BROAD); })
    .then(function (r) {
      results.poison = r;
      eq(r.__broadTouched, 0,
        'B1  the import never so much as READS window.KM.DB.getSkuDetails (a trap getter counts touches)');
      eq([r.updateCount, r.newCount], [1, 2],
        'B2  ZZ9990 and NEW-1 are NEW despite sitting in the broad cache — only the universe decides');
    })
    .then(function () { return run(csv(row('GA0450')), UNIVERSE, [{ sku: 'GA0450' }, { sku: 'X' }]); })
    .then(function (r1) {
      return run(csv(row('GA0450')), UNIVERSE, []).then(function (r2) {
        eq([r1.newCount, r1.updateCount], [r2.newCount, r2.updateCount],
          'B3  two different broad caches give identical totals for the same injected universe');
      });
    })

    // =============================================================================================
    .then(function () { section('C — LOADED-EMPTY IS A FACT; UNAVAILABLE IS A REFUSAL'); })

    .then(function () { return run(csv(row('ANY-1'), row('ANY-2')), []); })
    .then(function (r) {
      results.empty = r;
      eq([r.total, r.valid, r.newCount, r.updateCount], [2, 2, 2, 0],
        'C1  an EMPTY universe is a real answer — every valid row is genuinely new');
      ok(r.universeUnavailable === undefined, 'C2  and it is not a refusal');
    })
    .then(function () { return run(csv(row('GA0450')), undefined); })
    .then(function (r) {
      results.unavailable = r;
      ok(r.universeUnavailable === true, 'C3  an ABSENT universe refuses');
      eq([r.total, r.valid, r.newCount, r.updateCount], [0, 0, 0, 0],
        'C4  and shows no totals at all — never "everything is new"');
      ok(/has not loaded/.test(r.errors[0].message) && r.errors[0].field === 'universe',
        'C5  with a sentence that says what actually happened');
    })
    .then(function () { return run(csv(row('GA0450')), null); })
    .then(function (r) { ok(r.universeUnavailable === true, 'C6  null refuses'); })
    .then(function () { return run(csv(row('GA0450')), { sku: 'GA0450' }); })
    .then(function (r) { ok(r.universeUnavailable === true, 'C7  a non-array refuses'); })
    .then(function () { return run(csv(row('GA0450')), 'GA0450'); })
    .then(function (r) { ok(r.universeUnavailable === true, 'C8  a string refuses'); })

    // =============================================================================================
    .then(function () { section('D — THE PAGE DECIDES READINESS WITH THE RENDERER\'S OWN PREDICATE'); })

    .then(function () {
      var u = pageUniverse(true, null, BROAD);
      ok(u === null, 'D1  workspace active + no read model → unavailable (null), NOT an empty array');

      var loaded = pageUniverse(true, { skuDetails: [] }, BROAD);
      eq(loaded, [], 'D2  workspace active + a model holding zero rows → a real, empty universe');

      var ready = pageUniverse(true, { skuDetails: UNIVERSE }, BROAD);
      eq(ready.map(function (r) { return r.sku; }), ['GA0450', 'GA0451'],
        'D3  workspace active + a model → the model, never the broad cache');

      var legacy = pageUniverse(false, null, BROAD);
      eq(legacy.map(function (r) { return r.sku; }), BROAD.map(function (r) { return r.sku; }),
        'D4  kill-switch mode agrees with what the page itself renders');

      var snap = pageUniverse(true, { skuDetails: UNIVERSE }, BROAD);
      ok(snap !== UNIVERSE, 'D5  the page hands over a COPY, so a later write cannot rewrite a run in flight');
    })
    .then(function () {
      /* Retry after readiness, with no reload: the same page state that refused now answers. */
      var before = pageUniverse(true, null, BROAD);
      var after = pageUniverse(true, { skuDetails: UNIVERSE }, BROAD);
      ok(before === null && Array.isArray(after) && after.length === 2,
        'D6  a refused import becomes possible once the read lands — no reload needed');
    })

    // =============================================================================================
    .then(function () { section('E — NOTHING ELSE MOVED'); })

    .then(function () {
      var r = results.mixed;
      eq(Object.keys(r).filter(function (k) { return k !== '__broadTouched'; }).sort(),
        ['errors', 'newCount', 'preview', 'total', 'updateCount', 'valid'],
        'E1  the resolved shape is unchanged on the success path');
      eq(Object.keys(results.mixed.preview[0]).sort(),
        ['action', 'category', 'lifecycle', 'product_name', 'series', 'sku'],
        'E2  and so is a preview row');
      eq(UNIVERSE.map(function (x) { return x.sku; }), ['GA0450', 'GA0451'],
        'E3  the injected array is not mutated by the run');
      ok(UNIVERSE.length === 2, 'E4  nor its length');
    })
    /* TWO lines, because a single-line file exits earlier on `lines.length < 2` and the header check
       never runs — the first draft of this probe asserted a refusal that had not happened. */
    .then(function () { return run(['code,product_name,category', 'X,Widget,Kitchen'].join('\n'), UNIVERSE); })
    .then(function (r) {
      ok(r.errors.length === 1 && r.errors[0].field === 'header',
        'E5  the missing-sku-column refusal is untouched', r.errors);
    })
    .then(function () { return run([HEAD, 'BAD-1,,Kitchen,Pro,Running in the Market'].join('\n'), UNIVERSE); })
    .then(function (r) {
      ok(r.valid === 0 && r.errors.length >= 1 && r.errors[0].field === 'product_name',
        'E6  required-field validation is untouched');
    })
    .then(function () {
      var im = extractFn(OVR, 'importSkuStatusTemplate');
      eq((im.match(/getTable|getOperationDb|loadOperationDb|localStorage|sessionStorage/g) || []), [],
        'E7  no hidden data source entered the import');
      eq((im.match(/(^|[^.\w])fetch\s*\(|XMLHttpRequest/g) || []), [],
        'E8  and no direct transport');
      /* `updateCount` matches a naive /update[A-Z]/, which is how the first draft of this probe
         reported a write that does not exist. The question is whether a WRITE CALL is made. */
      eq((im.match(/KM\.DB\.(upsert|update|delete|save)[A-Za-z]*\s*\(|\.save\s*\(/g) || []), [],
        'E9  the import is still preview-only — it makes no write call');
      ok(/return new Promise\(/.test(im), 'E10 and it is still a Promise, as its one caller expects');
    })
    .then(function () {
      eq((SK.match(/importSkuStatusTemplate\(/g) || []).length, 1,
        'E11 the page still has exactly one import call site');
      ok(/importSkuStatusTemplate\(this\.files\[0\], universe\)/.test(SK),
        'E12 and it passes the universe');
      eq((SK.match(/_skWorkspaceRefresh_\(/g) || []).length > 0
        && /_skStatusTemplateUniverse_[\s\S]{0,400}_skWorkspaceRefresh_/.test(
          SK.slice(SK.indexOf('function _skStatusTemplateUniverse_'), SK.indexOf('function _skStatusTemplateUniverse_') + 400)),
        false, 'E13 the import triggers NO second workspace read');
    })

    // =============================================================================================
    .then(function () { section('F — THE IMAGE SURFACE IS FROZEN BY DIGEST'); })
    .then(function () {
      var d = imageDigest(OVR);
      eq(d.missing, [], 'F1  every frozen image slice is present');
      // S2-R4A — the two halves that keep the re-seal honest: the writer is GONE (not merely delisted),
      // and no function in the image surface consults a browser override any more.
      ok(!/function setSkuImageOverride\b/.test(OVR) && !/window\.setSkuImageOverride/.test(OVR),
        'F1a the image-override WRITER is absent from the source, not just from this list');
      ok(!/getSkuImageOverride\(/.test(extractFn(OVR, 'getNormalizedSkuImage'))
         && !/getSkuImageOverride\(/.test(extractFn(OVR, 'classifySkuImageSource')),
        'F1b and neither image function reads a browser override — sku_details.image_url is the owner');
      ok(d.sha === IMAGE_SHA, 'F2  the image surface matches the sealed digest', d.sha);
      ok(d.bytes === 2930, 'F3  and its byte count', d.bytes);
    })

    // =============================================================================================
    .then(function () { section('G — DRIVEN MUTANTS (each must change an OBSERVED result)'); })
    .then(runMutants)

    .then(function () {
      console.log('\n' + new Array(101).join('='));
      console.log('SKU STATUS IMPORT UNIVERSE (S2-R2-R1) — passed ' + pass + '  failed ' + fail
        + '  |  mutants caught ' + neg.caught + '  survived ' + neg.missed);
      console.log(new Array(101).join('='));
      if (fail > 0) { process.exitCode = 1; }
    });
}

// -------------------------------------------------------------------------------------------------
// The image-surface digest, computed the same way the round's freeze script computes it.
// -------------------------------------------------------------------------------------------------
// S2-R4A RE-SEALED. This digest exists so that an EXPORT/IMPORT round cannot quietly move the image
// surface; it was never a promise that the image surface is frozen for ever. S2-R4A moves it on purpose —
// the browser override is retired out of getNormalizedSkuImage and classifySkuImageSource, and the dead
// writer is deleted — so the seal is re-taken at the new value rather than relaxed. The assertions beside
// it below are what stop a re-seal from being a way to launder a change nobody looked at.
var IMAGE_SHA = '2676fc6d914d26ade9a347226e38f48c0ae4bd7767a0479068de7bd7e5d17e9f';
function imageDigest(src) {
  // S2-R4A — setSkuImageOverride is off this list because it no longer EXISTS, not because it stopped
  // mattering. A slice that is dropped from a freeze quietly is a freeze with a hole in it, so the
  // suites assert its absence directly (see the companion assertion beside the digest checks).
  var FUNCS = ['getSkuImageOverrides', 'getSkuImageOverride',
    'getNormalizedSkuImage', '_skuImagePolicy', 'resolveSkuImageUrl', 'classifySkuImageSource'];
  var DECLS = ['SKU_IMAGE_KEY'];
  var EXPORTS = ['window.getSkuImageOverride', 'window.getNormalizedSkuImage',
    'window.resolveSkuImageUrl', 'window.classifySkuImageSource'];
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
// Mutants. Each rewrites the REAL source, rebuilds the function through the same factory, and is
// scored only when an OBSERVED value differs from the one the positive assertion pinned. A mutant
// whose anchor is missing returns null and is scored SURVIVED — never quietly passed.
// -------------------------------------------------------------------------------------------------
function mutateSrc(src, from, to) {
  var n = src.split(from).length - 1;
  if (n !== 1) { return null; }
  return src.split(from).join(to);
}
/** Run a mutated import and hand the result to a checker that must return true for a KILL. */
function mutantImport(label, from, to, text, universe, rows, expectKill) {
  var src = mutateSrc(OVR, from, to);
  if (src === null) { score(label, false); return Promise.resolve(); }
  var p = poisonedWindow(rows === undefined ? BROAD : rows);
  var fn;
  try { fn = buildImport(src, p.win); }
  catch (e) { score(label, true); return Promise.resolve(); }      // it no longer even builds
  LAST_THROW = null;
  return settle(Promise.resolve(fn(file(text), universe))).then(function (r) {
    r.__broadTouched = p.touched.n;
    score(label, expectKill(r) === true);
  }, function () { score(label, true); });
}

function runMutants() {
  return Promise.resolve()
    .then(function () {
      return mutantImport('M1  the broad-cache read is restored',
        '            skuUniverse.forEach(function(i) { if (i && i.sku) existingSkus.add(i.sku); });',
        '            var dbItems = (window.KM && window.KM.DB && window.KM.DB.getSkuDetails) ? window.KM.DB.getSkuDetails() : [];\n'
        + '            dbItems.forEach(function(i) { existingSkus.add(i.sku); });',
        csv(row('GA0450'), row('ZZ9990'), row('NEW-1')), UNIVERSE, BROAD,
        /* the trap getter is touched, and the totals move away from the pinned [1,2] */
        function (r) { return r.__broadTouched > 0 || r.updateCount !== 1 || r.newCount !== 2; });
    })
    .then(function () {
      return mutantImport('M2  an unavailable universe becomes an empty one',
        '        if (!Array.isArray(skuUniverse)) {',
        '        if (!Array.isArray(skuUniverse)) { skuUniverse = []; } if (false) {',
        csv(row('GA0450')), undefined, BROAD,
        /* the refusal disappears and the row is reported NEW — the exact lie the fix exists to stop */
        function (r) { return r.universeUnavailable !== true && r.newCount === 1; });
    })
    .then(function () {
      return mutantImport('M3  the injected argument is ignored',
        '            skuUniverse.forEach(function(i) { if (i && i.sku) existingSkus.add(i.sku); });',
        '            [].forEach(function(i) { if (i && i.sku) existingSkus.add(i.sku); });',
        csv(row('GA0450')), UNIVERSE, BROAD,
        function (r) { return r.updateCount === 0 && r.newCount === 1; });
    })
    .then(function () {
      return mutantImport('M4  broad-cache rows are merged into the injected universe',
        '            skuUniverse.forEach(function(i) { if (i && i.sku) existingSkus.add(i.sku); });',
        '            skuUniverse.forEach(function(i) { if (i && i.sku) existingSkus.add(i.sku); });\n'
        + '            ((window.KM && window.KM.DB && window.KM.DB.getSkuDetails) ? window.KM.DB.getSkuDetails() : []).forEach(function(i) { existingSkus.add(i.sku); });',
        csv(row('ZZ9990'), row('NEW-1')), UNIVERSE, BROAD,
        /* both rows are in the broad cache only; a merge turns two NEWs into two UPDATEs */
        function (r) { return r.updateCount === 2 && r.newCount === 0; });
    })
    .then(function () {
      return mutantImport('M5  new and update membership is reversed',
        '                    if (existingSkus.has(sku)) { action = \'update\'; updateCount++; }\n'
        + '                    else { action = \'new\'; newCount++; }',
        '                    if (!existingSkus.has(sku)) { action = \'update\'; updateCount++; }\n'
        + '                    else { action = \'new\'; newCount++; }',
        csv(row('GA0450'), row('BRAND-NEW')), UNIVERSE, BROAD,
        function (r) { return r.updateCount === 1 && r.newCount === 1 && r.preview[0].action === 'new'; });
    })
    .then(function () {
      return mutantImport('M6  the readiness validation is removed entirely',
        '        if (!Array.isArray(skuUniverse)) {\n'
        + '            resolve({ total: 0, valid: 0, newCount: 0, updateCount: 0, preview: [], universeUnavailable: true,',
        '        if (false) {\n'
        + '            resolve({ total: 0, valid: 0, newCount: 0, updateCount: 0, preview: [], universeUnavailable: true,',
        csv(row('GA0450')), undefined, BROAD,
        /* with no guard the run throws on undefined.forEach — either way the refusal is gone */
        function (r) { return r.universeUnavailable !== true; });
    })
    .then(function () {
      /* MUTATING THE INPUT IS NOT VISIBLE IN THE RESULT, so this one is observed on the ARRAY. An
         earlier draft scored it through `mutantImport` with a checker that was true either way — a
         mutant that cannot fail is not a test, and it is removed rather than left looking green. */
      var src = mutateSrc(OVR,
        '            skuUniverse.forEach(function(i) { if (i && i.sku) existingSkus.add(i.sku); });',
        '            skuUniverse.push({ sku: \'INJECTED\' });\n'
        + '            skuUniverse.forEach(function(i) { if (i && i.sku) existingSkus.add(i.sku); });');
      if (src === null) { score('M7  the utility mutates the array it was handed', false); return; }
      var arr = UNIVERSE.slice();
      var p = poisonedWindow(BROAD);
      return Promise.resolve(buildImport(src, p.win)(file(csv(row('GA0450'))), arr))
        .then(function () {
          score('M7  the utility mutates the array it was handed', arr.length === 3);
        });
    })
    .then(function () {
      /* A second workspace read from inside the import: observed as an extra call on a counting stub. */
      var calls = 0;
      var p = poisonedWindow(BROAD);
      p.win.KM.api = { getWorkspace: function () { calls++; return Promise.resolve({ success: true, data: {} }); } };
      var src = mutateSrc(OVR, '        var reader = new FileReader();',
        '        if (window.KM && window.KM.api && window.KM.api.getWorkspace) { window.KM.api.getWorkspace(\'skuDetails\', {}); }\n'
        + '        var reader = new FileReader();');
      if (src === null) { score('M8  the import triggers a second workspace read', false); return; }
      return Promise.resolve(buildImport(src, p.win)(file(csv(row('GA0450'))), UNIVERSE))
        .then(function () { score('M8  the import triggers a second workspace read', calls === 1); });
    })
    .then(function () {
      /* The image tripwire: one byte inside resolveSkuImageUrl must move the sealed digest. */
      var src = mutateSrc(OVR, 'function resolveSkuImageUrl(imageUrl) {',
        'function resolveSkuImageUrl(imageUrl ) {');
      if (src === null) { score('M9  one image-resolver byte is altered', false); return; }
      var d = imageDigest(src);
      score('M9  one image-resolver byte is altered', d.sha !== IMAGE_SHA);
    })
    .then(function () {
      /* The page-side predicate: unavailable collapsed into empty. Observed on the returned value. */
      var src = mutateSrc(SK,
        '    if (_skEffectiveWorkspace() && !_skReadModel) return null;   // unavailable — NOT an empty universe',
        '    if (_skEffectiveWorkspace() && !_skReadModel) return [];     // unavailable — NOT an empty universe');
      if (src === null) { score('M10 the page reports an unavailable universe as empty', false); return; }
      var fn = new Function('window', '_skReadModel',
        extractFn(src, '_skEffectiveWorkspace') + '\n' + extractFn(src, '_skGetSkuDetails') + '\n'
        + extractFn(src, '_skStatusTemplateUniverse_') + '\nreturn _skStatusTemplateUniverse_();');
      var got = fn({ KM: { api: { workspaceApiActive: function () { return true; } },
        DB: { getSkuDetails: function () { return BROAD; } } } }, null);
      score('M10 the page reports an unavailable universe as empty',
        Array.isArray(got) && got.length === 0);
    })
    .then(function () {
      /* The page hands over the live array instead of a snapshot. */
      var src = mutateSrc(SK, '    return _skGetSkuDetails().slice();', '    return _skGetSkuDetails();');
      if (src === null) { score('M11 the page hands over the live model array, not a snapshot', false); return; }
      var live = [{ sku: 'GA0450' }];
      var fn = new Function('window', '_skReadModel',
        extractFn(src, '_skEffectiveWorkspace') + '\n' + extractFn(src, '_skGetSkuDetails') + '\n'
        + extractFn(src, '_skStatusTemplateUniverse_') + '\nreturn _skStatusTemplateUniverse_();');
      var got = fn({ KM: { api: { workspaceApiActive: function () { return true; } }, DB: {} } },
        { skuDetails: live });
      score('M11 the page hands over the live model array, not a snapshot', got === live);
    });
}

main().catch(function (e) {
  console.error('RUNNER ERROR ' + (e && e.stack || e));
  process.exitCode = 3;
});
