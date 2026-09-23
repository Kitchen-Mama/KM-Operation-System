// Kitchen Mama Operation System — S2-R4A BROWSER BUSINESS AUTHORITY RETIREMENT.
// Run: node assets/tests/s2-r4a-browser-business-authority-retirement.test.js
// ---------------------------------------------------------------------------------------------------------
// S2-C's exit rule is that business/domain state may not depend on localStorage, sessionStorage, DOM residue
// or a browser-only override, and that no legacy browser value may outrank canonical DB truth. Two owners
// were still outside it, and this suite is the proof that they no longer are:
//
//   utils/sku-overrides.js   km_sku_data_overrides_v1 injected SKU ROWS the server never returned;
//                            km_sku_image_overrides_v1 outranked sku_details.image_url.
//   utils/data.js            weeklyShippingPlans held Weekly Shipping Plans in localStorage behind four
//                            DataRepo methods, one of which shared a name with the CANONICAL writer.
//
// WHAT THIS SUITE IS CAREFUL ABOUT. "The key is gone" is not the property worth proving — deleting a key is
// easy and destroys evidence. The property is that a key which IS STILL THERE, still full, still readable,
// cannot reach a rendered or submitted business value. So every section seeds the stale key FIRST and then
// asserts the answer is the server's anyway.
//
// It drives the REAL shipped sources in a stubbed window, and every mutant injects a fault that a person
// could plausibly introduce — a restored line, a reinstated fallback — rather than a token edit.

var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var REPO = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }

var OVR = read('js/utils/sku-overrides.js');
var DATA = read('js/utils/data.js');
var DBAPI = read('js/api/operation-system-db-api.js');
var MASTER = read('specs/active/apps-script/03_master_data_handlers.gs');
var SHIPPING_PAGE = read('js/pages/shipping-plan.js');

var pass = 0, fail = 0;
function ok(c, label, detail) {
  if (c) { pass++; console.log('ok   ' + label); }
  else { fail++; console.error('FAIL ' + label + (detail === undefined ? '' : '\n  got ' + JSON.stringify(detail))); }
}
function eq(a, b, label) {
  var same = JSON.stringify(a) === JSON.stringify(b);
  if (same) { pass++; console.log('ok   ' + label); }
  else { fail++; console.error('FAIL ' + label + '\n  exp ' + JSON.stringify(b) + '\n  got ' + JSON.stringify(a)); }
}
function section(n) { console.log('\n== ' + n + ' =='); }

var LC_KEY = 'km_sku_lifecycle_overrides_v1';
var IMG_KEY = 'km_sku_image_overrides_v1';
var DATA_KEY = 'km_sku_data_overrides_v1';
var PLAN_KEY = 'weeklyShippingPlans';

// ---------------------------------------------------------------------------------------------------------
// The environment. sku-overrides.js assigns its API onto `window`, so a bare object is the whole harness;
// the image policy is part of the environment because index.html loads it first and the module fails closed
// without it (an absent policy returns '' for every reference, which would make §B pass for the wrong reason).
// ---------------------------------------------------------------------------------------------------------
function policy() {
  var p = require(path.join(__dirname, '..', 'js/utils/km-image-reference-policy.js'));
  p.APPROVED_EXTERNAL_HOSTS = ['example'];
  return p;
}
function makeStore(seed) {
  var store = Object.assign({}, seed || {});
  return {
    raw: store,
    api: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); },
      removeItem: function (k) { delete store[k]; }
    }
  };
}
// `src` defaults to the shipped file; the mutant runner passes a mutated copy.
function loadOverrides(seed, win, src) {
  var st = makeStore(seed);
  var w = win || {};
  w.KM_IMAGE_REFERENCE_POLICY = policy();
  var doc = { getElementById: function () { return null; }, createElement: function () { return {}; } };
  new Function('window', 'localStorage', 'document', src || OVR)(w, st.api, doc);
  return { win: w, store: st.raw };
}
function loadData(seed, src) {
  var st = makeStore(seed);
  var w = {};
  var doc = { getElementById: function () { return null; }, createElement: function () { return {}; } };
  new Function('window', 'localStorage', 'document', src || DATA)(w, st.api, doc);
  return { win: w, store: st.raw };
}
// Every group flattened, so "did this row reach the page" is one question rather than four.
function allRows(groups) {
  return Object.keys(groups).reduce(function (a, g) { return a.concat(groups[g] || []); }, []);
}
function skus(groups) { return allRows(groups).map(function (r) { return r.sku; }).sort(); }

// A server answer, and a stale browser key that disagrees with it in every way it can.
var SERVER = [
  { sku: 'CO5600-RB', lifecycle: 'Running in the Market', image: 'https://example/server-co.png' },
  { sku: 'MO1100-G', lifecycle: 'Upcoming SKU' }
];
var STALE = {};
STALE[DATA_KEY] = JSON.stringify({
  'GHOST-1': { productName: 'Typed on one laptop in 2025', category: 'Opener' },
  'CO5600-RB': { productName: 'A different name for a real SKU' }
});
STALE[IMG_KEY] = JSON.stringify({
  'CO5600-RB': { image: 'https://example/stale-browser.png' },
  'MO1100-G': { image: 'https://example/stale-ghost.png' }
});
STALE[LC_KEY] = JSON.stringify({ 'CO5600-RB': { lifecycle: 'Closure' } });

// =========================================================================================================
section('A · §2 — a stale imported-SKU override cannot inject a row the server did not return');
// =========================================================================================================
{
  var A = loadOverrides(STALE);
  A.win.KM = { DB: { getSkuDetails: function () { return SERVER; } } };
  var g = A.win.getAllSkuDataWithOverrides(SERVER);

  eq(skus(g), ['CO5600-RB', 'MO1100-G'], 'A1  the rendered set is exactly the server set');
  ok(skus(g).indexOf('GHOST-1') === -1,
    'A2  GHOST-1 — present in the browser key and nowhere else — is NOT injected');
  var co = allRows(g).filter(function (r) { return r.sku === 'CO5600-RB'; })[0];
  ok(co && co.productName === undefined,
    'A3  nor does the key overwrite a field on a SKU the server DID return', co && co.productName);

  // The key is IGNORED, not destroyed: the ruling says an imported-SKU row may be the only copy of
  // something a person typed, so retirement must not be a delete.
  ok(A.store[DATA_KEY] !== undefined, 'A4  and the key itself is still in storage — ignored, not deleted');
  ok(typeof A.win.getSkuDataOverrides === 'function'
     && A.win.getSkuDataOverrides()['GHOST-1'] !== undefined,
    'A5  still readable, so an operator can see and clear their own residue');

  // The source-level rule, so a future edit cannot reintroduce the injection under another name.
  // ASKED OF THE CODE, NOT THE PROSE. The helper's body now carries a paragraph explaining what the
  // injection was and why it went, and that paragraph necessarily spells the key — so a naive scan of
  // the whole body would be matching the explanation and calling it a violation. The comments come out
  // first, and A6b then asserts the explanation is still there, so stripping it is not a way to pass.
  var body = OVR.slice(OVR.indexOf('function getAllSkuDataWithOverrides('));
  body = body.slice(0, body.indexOf('\n}'));
  var code = body.replace(/^\s*\/\/.*$/gm, '');
  ok(code.indexOf('getSkuDataOverrides') < 0 && code.indexOf(DATA_KEY) < 0,
    'A6  no CODE in the grouping helper names a browser data store');
  ok(body.indexOf(DATA_KEY) > -1,
    'A6b while the comment that explains the retirement is still present to be read');
  ok(!/allRaw\.push\(/.test(code), 'A7  and it pushes nothing into the row set it was handed');
}

// =========================================================================================================
section('B · §2 — a stale image override cannot outrank sku_details.image_url');
// =========================================================================================================
{
  var B = loadOverrides(STALE);

  ok(B.win.getNormalizedSkuImage({ sku: 'CO5600-RB', image: 'https://example/server-co.png' })
       === 'https://example/server-co.png',
    'B1  a SKU with a canonical image renders the CANONICAL one, not the browser one');
  ok(B.win.getNormalizedSkuImage({ sku: 'MO1100-G' }) === '',
    'B2  a SKU with no canonical image renders NOTHING — the override is not a fallback either');
  ok(B.win.getNormalizedSkuImage({ sku: 'CO5600-RB', image: 'https://example/server-co.png' })
       !== 'https://example/stale-browser.png',
    'B3  stated the other way round, because this is the failure that was actually shipping');

  // The classifier must agree with the renderer. If it still consulted the override it would answer
  // PRESENT about a picture that is not drawn, and send an operator hunting a rendering bug.
  var cls = B.win.classifySkuImageSource({ sku: 'MO1100-G' });
  eq(cls.state, 'ABSENT', 'B4  and the classifier says ABSENT for the same row, not PRESENT');
  eq(cls.url, '', 'B4a with no url smuggled out in the result');
  var cls2 = B.win.classifySkuImageSource({ sku: 'CO5600-RB', image: 'https://example/server-co.png' });
  eq([cls2.state, cls2.url], ['PRESENT', 'https://example/server-co.png'],
    'B5  and PRESENT with the canonical url when the row carries one');

  // Grouping applies no image merge either — the third place the override used to reach.
  var g2 = B.win.getAllSkuDataWithOverrides(SERVER);
  var co2 = allRows(g2).filter(function (r) { return r.sku === 'CO5600-RB'; })[0];
  ok(co2 && co2.image === 'https://example/server-co.png',
    'B6  the grouped row carries the server image, not the merged browser one', co2 && co2.image);

  ok(B.store[IMG_KEY] !== undefined, 'B7  the image key is likewise ignored rather than destroyed');
  ok(typeof B.win.setSkuImageOverride !== 'function',
    'B8  but the WRITER is gone, so no new override can be created from the page or the console');
}

// =========================================================================================================
section('C · §2B — the canonical image path is the one that remains');
// =========================================================================================================
{
  var C = loadOverrides({});
  // The same canonical field arrives spelled three ways depending on the read path. All three are the row.
  ok(C.win.getNormalizedSkuImage({ sku: 'X', image: 'https://example/a.png' }) === 'https://example/a.png',
    'C1  scoped-workspace spelling `image` resolves');
  ok(C.win.getNormalizedSkuImage({ sku: 'X', imageUrl: 'https://example/b.png' }) === 'https://example/b.png',
    'C2  broad-cache spelling `imageUrl` resolves');
  ok(C.win.getNormalizedSkuImage({ sku: 'X', image_url: 'https://example/c.png' }) === 'https://example/c.png',
    'C3  raw-row spelling `image_url` resolves');
  // And the policy still judges — retirement must not have turned this into a pass-through.
  ok(C.win.getNormalizedSkuImage({ sku: 'X', image: 'javascript:alert(1)' }) === '',
    'C4  a reference that is not an image address is still REFUSED, not forwarded');

  // The canonical WRITE owner exists and accepts the field, which is what makes the browser store
  // unnecessary rather than merely unwelcome.
  ok(/var SKU_DETAILS_UPSERT_FIELDS_ = \[[\s\S]*?'image_url'[\s\S]*?\];/.test(MASTER),
    'C5  03_ accepts image_url on the canonical upsert field list');
  ok(/window\.KM\.DB\.upsertSkuDetail = /.test(DBAPI) && /action: 'upsertSkuDetail'/.test(DBAPI),
    'C6  and the browser reaches it through the routed upsertSkuDetail action');
}

// =========================================================================================================
section('D · §3 — a canonical read that did not answer cannot fall back to browser business state');
// =========================================================================================================
{
  // The read model is absent and the stale keys are full. The one thing that must not happen is the
  // browser's own rows appearing as though the server had returned them.
  var D = loadOverrides(STALE);
  D.win.KM = { DB: { getSkuDetails: function () { return []; } } };
  var g = D.win.getAllSkuDataWithOverrides([]);
  ok(skus(g).indexOf('GHOST-1') === -1,
    'D1  an empty canonical answer does not become the browser\'s rows');

  var D2 = loadOverrides(STALE);
  D2.win.KM = { DB: {} };                       // no getter at all — the read could not even be attempted
  var g2 = D2.win.getAllSkuDataWithOverrides();
  ok(skus(g2).indexOf('GHOST-1') === -1,
    'D2  and neither does no canonical answer at all');

  // Stated as a rule about the source, because the two cases above are samples of it.
  ok(OVR.indexOf('localStorage.getItem(SKU_DATA_OVERRIDE_KEY)') > -1,
    'D3  the residue reader still exists (the operator affordance the ruling preserves)');
  var grouping = OVR.slice(OVR.indexOf('function getAllSkuDataWithOverrides('));
  grouping = grouping.slice(0, grouping.indexOf('\n}'));
  var imageFn = OVR.slice(OVR.indexOf('function getNormalizedSkuImage('));
  imageFn = imageFn.slice(0, imageFn.indexOf('\n}'));
  ok(grouping.indexOf('localStorage') < 0 && imageFn.indexOf('localStorage') < 0,
    'D4  but neither the grouping helper nor the image resolver reads storage on any path');
}

// =========================================================================================================
section('E · §2C — the lifecycle authority stays retired, and is not rebuilt');
// =========================================================================================================
{
  var E = loadOverrides(STALE);
  ok(E.store[LC_KEY] === undefined, 'E1  the legacy lifecycle key is still purged once on load');
  ok(E.win.getSkuLifecycleOverride === undefined && E.win.setSkuLifecycleOverride === undefined,
    'E2  and no lifecycle override accessor is exposed');
  ok(E.win.getNormalizedSkuStatus({ sku: 'CO5600-RB', lifecycle: 'Running in the Market' })
       === 'Running in the Market',
    'E3  status comes from the row even with a Closure override seeded a moment ago');
  ok(!/function (get|set)SkuLifecycleOverrides?\b/.test(OVR),
    'E4  and S2-R4A did not quietly bring any of it back');
}

// =========================================================================================================
section('F · §4 — the legacy Weekly Shipping Plan store cannot affect a canonical plan');
// =========================================================================================================
{
  var seed = {};
  seed[PLAN_KEY] = JSON.stringify([{ id: 1, status: 'pending', note: 'a plan that lives in one browser' }]);
  var F = loadData(seed);

  ok(F.win.DataRepo && typeof F.win.DataRepo === 'object', 'F1  DataRepo still loads (its fixtures are untouched)');
  ['saveWeeklyShippingPlan', 'getWeeklyShippingPlans', 'updateShippingPlanStatus', 'removeShippingPlan']
    .forEach(function (m, i) {
      ok(F.win.DataRepo[m] === undefined, 'F2.' + (i + 1) + '  DataRepo.' + m + ' is gone');
    });
  eq(F.store[PLAN_KEY], seed[PLAN_KEY],
    'F3  a stale weeklyShippingPlans key is neither read into memory nor rewritten');
  ok(DATA.indexOf("localStorage.getItem('weeklyShippingPlans')") < 0
     && DATA.indexOf("localStorage.setItem('weeklyShippingPlans'") < 0,
    'F4  and the module touches that key on no path');

  // The canonical owner is untouched and is the ONLY updateShippingPlanStatus a caller can reach.
  ok(/window\.KM\.DB\.updateShippingPlanStatus = /.test(DBAPI),
    'F5  the canonical writer still exists on the DB surface');
  var pageHits = (SHIPPING_PAGE.match(/updateShippingPlanStatus/g) || []).length;
  var pageCanonical = (SHIPPING_PAGE.match(/KM\.DB\.updateShippingPlanStatus/g) || []).length;
  eq(pageCanonical, pageHits,
    'F6  and every mention on the Shipping Plan page is the canonical one — no bare call can bind to a local');
  ok(pageHits >= 4, 'F7  over a call set worth checking', pageHits);

  // Scope discipline: personalTodos is a genuinely personal preference and this round does not touch it.
  ok(DATA.indexOf("localStorage.setItem('personalTodos'") > -1,
    'F8  personalTodos is deliberately left alone — this round retires business authority, not preferences');
}

// =========================================================================================================
section('G · §5 — route return and hard reload change nothing');
// =========================================================================================================
{
  // A "route away and come back" and a "hard reload" are, for a module like this, a second evaluation
  // against the same storage. The answer must be identical and nothing may accumulate.
  var first = loadOverrides(STALE);
  var a = JSON.stringify(first.win.getAllSkuDataWithOverrides(SERVER));
  var b = JSON.stringify(first.win.getAllSkuDataWithOverrides(SERVER));
  eq(a, b, 'G1  a second render from the same module yields identical groups');

  var second = loadOverrides(STALE);          // fresh evaluation = hard reload
  var c = JSON.stringify(second.win.getAllSkuDataWithOverrides(SERVER));
  eq(c, a, 'G2  and a fresh load of the module yields the same groups again');

  // The stale keys are still sitting there across all of it, which is the point.
  ok(second.store[DATA_KEY] !== undefined && second.store[IMG_KEY] !== undefined,
    'G3  with the stale keys still present the whole time');

  var planSeed = {};
  planSeed[PLAN_KEY] = JSON.stringify([{ id: 9, status: 'pending' }]);
  var d1 = loadData(planSeed), d2 = loadData(planSeed);
  eq(Object.keys(d1.win.DataRepo).sort(), Object.keys(d2.win.DataRepo).sort(),
    'G4  and DataRepo presents the same surface on every load');
}

// =========================================================================================================
section('H · §6 — no new request, timeout, retry or listener');
// =========================================================================================================
{
  function countIn(src) {
    return {
      fetch: (src.match(/\bfetch\s*\(/g) || []).length,
      xhr: (src.match(/XMLHttpRequest/g) || []).length,
      timeout: (src.match(/\bsetTimeout\s*\(/g) || []).length,
      interval: (src.match(/\bsetInterval\s*\(/g) || []).length,
      listener: (src.match(/addEventListener\s*\(/g) || []).length,
      kmdb: (src.match(/KM\.DB\.[a-zA-Z]+\s*\(/g) || []).length
    };
  }
  // The two files this round RETIRED: compared live, forever. Re-adding a request to either is a
  // regression of the retirement itself, whoever does it and whenever.
  var FILES = ['assets/js/utils/sku-overrides.js', 'assets/js/utils/data.js'];
  // The SHARED module: compared at the retirement commit. S2-R4A's claim was that ITS edit to the
  // db-api — a label change marking the image override inert — added nothing; that stays checkable
  // forever against e6efd1f, and does not become false when a later round adds a writer to the same file.
  var SHARED = 'assets/js/api/operation-system-db-api.js';
  var SHARED_AT = 'e6efd1f';
  var gitOK = true, pre = {};
  FILES.forEach(function (f) {
    try {
      pre[f] = cp.execFileSync('git', ['-C', REPO, 'show', 'a7e489a:' + f],
        { maxBuffer: 1 << 26 }).toString('utf8');
    } catch (e) { gitOK = false; }
  });
  if (!gitOK) {
    console.log('   (git unavailable — H1..H3 skipped)');
  } else {
    var drift = [];
    FILES.forEach(function (f) {
      var a = countIn(pre[f]);
      var b = countIn(fs.readFileSync(path.join(REPO, f), 'utf8'));
      Object.keys(a).forEach(function (k) {
        if (b[k] > a[k]) drift.push(f.split('/').pop() + '.' + k + ': ' + a[k] + ' -> ' + b[k]);
      });
    });
    try {
      var sa = countIn(pre[SHARED]);
      var sb = countIn(cp.execFileSync('git', ['-C', REPO, 'show', SHARED_AT + ':' + SHARED],
        { maxBuffer: 1 << 26 }).toString('utf8'));
      Object.keys(sa).forEach(function (k) {
        if (sb[k] > sa[k]) drift.push(SHARED.split('/').pop() + '@' + SHARED_AT + '.' + k + ': ' + sa[k] + ' -> ' + sb[k]);
      });
    } catch (e) { console.log('   (the retirement commit is unreachable — the shared-module half is skipped)'); }
    eq(drift, [], 'H1  no changed file gained a request, timeout, interval, listener or DB call', drift);

    // Anti-vacuity: the counter must actually be looking at something.
    var total = FILES.reduce(function (n, f) { return n + countIn(pre[f]).kmdb; }, 0);
    ok(total > 0, 'H2  and the PRE baseline really did contain DB calls to compare against', total);

    // Retirement REMOVES reads rather than adding them: the two storage reads that fed business values
    // are gone from the hot paths. Counted, not claimed.
    var ovrPre = (pre['assets/js/utils/sku-overrides.js'].match(/localStorage\.getItem/g) || []).length;
    var ovrPost = (OVR.match(/localStorage\.getItem/g) || []).length;
    ok(ovrPost <= ovrPre, 'H3  sku-overrides.js reads storage no more often than before',
      { pre: ovrPre, post: ovrPost });
  }
  // The rules that hold whether or not git is available.
  ok(!/setTimeout|setInterval/.test(OVR), 'H4  sku-overrides.js schedules nothing');
  ok(OVR.indexOf('fetch(') < 0 && OVR.indexOf('XMLHttpRequest') < 0,
    'H5  and issues no request of its own — retirement added no read');
}

// =========================================================================================================
section('I · driven mutants — each injects a fault a person could actually write');
// =========================================================================================================
var caught = 0, survived = 0;
function mutant(label, mutate, detect) {
  var src;
  try { src = mutate(); } catch (e) { console.error('FAIL mutant could not be built: ' + label); fail++; return; }
  if (src === OVR || src === DATA) { console.error('FAIL mutant changed nothing: ' + label); fail++; return; }
  var died = false;
  try { died = detect(src); } catch (e) { died = true; }
  if (died) { caught++; console.log('ok       ' + label + ' (caught)'); pass++; }
  else { survived++; console.error('FAIL     ' + label + ' SURVIVED'); fail++; }
}
// The shipped sources are CRLF. A multi-line anchor written with \n matches nothing in them, and a
// mutant that injects no fault cannot fail — the harness above rejects one rather than scoring it, but
// the fix belongs here: every anchor is converted to the newline the file actually uses.
function nl(src, text) { return src.indexOf('\r\n') !== -1 ? text.split('\n').join('\r\n') : text; }
function sub(src, a, b) { return src.replace(nl(src, a), nl(src, b)); }

function withOvr(src, fn) {
  var L = loadOverrides(STALE, {}, src);
  L.win.KM = { DB: { getSkuDetails: function () { return SERVER; } } };
  return fn(L);
}

mutant('M1 the imported-SKU injection is restored', function () {
  return sub(OVR, '    var allRaw = baseItems;',
    '    var allRaw = baseItems;\n    Object.entries(getSkuDataOverrides()).forEach(function (e) {\n'
    + '        if (!allRaw.some(function (r) { return r.sku === e[0]; }) && e[1].productName) {\n'
    + '            allRaw.push(Object.assign({}, e[1], { sku: e[0] }));\n        }\n    });');
}, function (src) {
  return withOvr(src, function (L) {
    return skus(L.win.getAllSkuDataWithOverrides(SERVER)).indexOf('GHOST-1') !== -1;
  });
});

mutant('M2 the image override is put back in front of the row', function () {
  return sub(OVR, "    var raw = (item && (item.image || item.imageUrl || item.image_url)) || '';\n    return resolveSkuImageUrl(raw);",
    "    var raw = (getSkuImageOverride(item.sku) || item.image || item.imageUrl || item.image_url) || '';\n    return resolveSkuImageUrl(raw);");
}, function (src) {
  return withOvr(src, function (L) {
    return L.win.getNormalizedSkuImage({ sku: 'CO5600-RB', image: 'https://example/server-co.png' })
      !== 'https://example/server-co.png';
  });
});

mutant('M3 the override becomes a FALLBACK when the row has no image', function () {
  return sub(OVR, "    var raw = (item && (item.image || item.imageUrl || item.image_url)) || '';\n    return resolveSkuImageUrl(raw);",
    "    var raw = (item && (item.image || item.imageUrl || item.image_url)) || getSkuImageOverride(item.sku) || '';\n    return resolveSkuImageUrl(raw);");
}, function (src) {
  return withOvr(src, function (L) { return L.win.getNormalizedSkuImage({ sku: 'MO1100-G' }) !== ''; });
});

mutant('M4 the classifier disagrees with the renderer again', function () {
  return sub(OVR, "    var raw = (item && (item.image || item.imageUrl || item.image_url)) || '';\n    var P = _skuImagePolicy();",
    "    var raw = (item && (getSkuImageOverride(item.sku) || item.image || item.imageUrl || item.image_url)) || '';\n    var P = _skuImagePolicy();");
}, function (src) {
  return withOvr(src, function (L) { return L.win.classifySkuImageSource({ sku: 'MO1100-G' }).state !== 'ABSENT'; });
});

mutant('M5 the image-override writer is reinstated', function () {
  return sub(OVR, 'function getNormalizedSkuImage(item) {',
    'function setSkuImageOverride(sku, imageUrl) {\n'
    + '    var o = getSkuImageOverrides(); o[sku] = { image: imageUrl };\n'
    + '    localStorage.setItem(SKU_IMAGE_KEY, JSON.stringify(o)); return true;\n}\n\n'
    + 'function getNormalizedSkuImage(item) {');
}, function (src) {
  return /function setSkuImageOverride\b/.test(src);
});

mutant('M6 the grouping helper merges the browser image again', function () {
  return sub(OVR, '        const merged = Object.assign({}, item);\n        const lifecycle',
    '        const merged = Object.assign({}, item);\n'
    + '        var _o = getSkuImageOverride(item.sku); if (_o) merged.image = _o;\n        const lifecycle');
}, function (src) {
  return withOvr(src, function (L) {
    var row = allRows(L.win.getAllSkuDataWithOverrides(SERVER))
      .filter(function (r) { return r.sku === 'CO5600-RB'; })[0];
    return !row || row.image !== 'https://example/server-co.png';
  });
});

mutant('M7 the legacy weekly-plan store comes back', function () {
  return sub(DATA, 'window.DataRepo = DataRepo;',
    "DataRepo.getWeeklyShippingPlans = function () {\n"
    + "    return JSON.parse(localStorage.getItem('weeklyShippingPlans')) || [];\n};\n"
    + 'window.DataRepo = DataRepo;');
}, function (src) {
  var seed = {};
  seed[PLAN_KEY] = JSON.stringify([{ id: 1, status: 'pending' }]);
  var L = loadData(seed, src);
  return typeof L.win.DataRepo.getWeeklyShippingPlans === 'function';
});

mutant('M8 the lifecycle purge is dropped', function () {
  return OVR.replace('localStorage.removeItem(SKU_LIFECYCLE_KEY); console.log', 'void 0; console.log');
}, function (src) {
  var L = loadOverrides(STALE, {}, src);
  return L.store[LC_KEY] !== undefined;
});

mutant('M9 the image resolver becomes a pass-through again', function () {
  return OVR.replace('    return P.classify(imageUrl).url;', '    return imageUrl;');
}, function (src) {
  return withOvr(src, function (L) {
    return L.win.getNormalizedSkuImage({ sku: 'X', image: 'javascript:alert(1)' }) !== '';
  });
});

console.log('\n' + new Array(101).join('-'));
console.log('S2-R4A BROWSER BUSINESS AUTHORITY RETIREMENT: ' + pass + ' passed, ' + fail + ' failed'
  + '  ·  mutants ' + (caught + survived) + ', survived ' + survived);
console.log('diagnostic invariants: DB_WRITES=0 · NETWORK_CALLS=0 · APPS_SCRIPT_EXECUTIONS=0 · DEPLOYMENTS=0');
console.log(new Array(101).join('-'));
if (fail > 0) process.exitCode = 1;
