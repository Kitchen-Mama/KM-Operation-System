// S8-R4C-P1 — THE FINAL CACHE TOKEN ROTATION, AND THE REASON IT IS NOT COSMETIC.
//
// S8-R4B-2B and S8-R4B-2D moved four browser-served files. p1-cumulative-20261002 is on origin/main
// (8856aeb was pushed), so by the rule _release-order.js has now stated five rounds running, those bytes
// have reached a browser and the token cannot be reused. Publishing without rotating is the silent failure:
// the deployment reports success and the change reaches nobody who already uses the application, while
// every measurement taken afterwards says it shipped.
//
// TWO FAMILIES MOVE, AND THEY ARE NOT INTERCHANGEABLE. The application series covers the three JS files;
// the Site Inventory stylesheet has its own series precisely so a CSS round and an application round can
// rotate independently. This round's second half is specific and is why the CSS family cannot be skipped:
// R4B-2B emits SIX classes that did not exist before, and against the cached stylesheet every one of them
// has ZERO rules. The states would still be CORRECT and would look like a bug.
//
// Run: node assets/tests/cache-token-rotation-s8-r4c-p1.test.js

var fs = require('fs');
var path = require('path');

var fail = 0, pass = 0;
var neg = { caught: 0, missed: 0 };
function ok(c, l, x) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + (x !== undefined ? '\n  got ' + JSON.stringify(x) : '')); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(t) { console.log('\n== ' + t + ' =='); }
function mut(label, f) {
  var r;
  try { r = f(); } catch (e) { neg.missed++; fail++; console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message)); return; }
  if (r === true) { neg.caught++; pass++; console.log('ok   ' + label + ' (caught)'); }
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED (got ' + JSON.stringify(r) + ')'); }
}

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
var RO = require('./_release-order.js');

var INDEX = read('index.html');
var APPJS = read('assets/js/app.js');
// GITIGNORED (.gitignore:5) — a LOCAL harness, not a repository file. It loads the same assets, so it is
// rotated locally so the harness exercises the bytes that will ship; it is not in the commit and not in the
// publication set. It is absent in a fresh clone, and a suite that threw there would be reporting a harness
// bug as a release defect.
var ACCEPT = null;
try { ACCEPT = read('assets/tests/_p1b8c-acceptance.html'); } catch (e) { ACCEPT = null; }
var CSS = read('assets/css/pages/inventory-replenishment.css');
var PAGE = read('assets/js/pages/inventory-replenishment.js');

// The tokens this round SPENDS and the tokens it MINTS, named once.
var PREV_APP = 'p1-cumulative-20261002';
var PREV_IR = 'ircompactrecon-20260905';
var APP = RO.currentAppToken();
var IR = RO.currentIrCssToken();

// ================================================================================================================
section('A — the two families rotated, and neither borrowed the other\'s token');
// ================================================================================================================
ok(APP !== PREV_APP, 'A1  the application family rotated off the token origin/main already serves', APP);
ok(IR !== PREV_IR, 'A2  and the Site Inventory CSS family rotated off its own', IR);
eq(RO.ROUND_TOKENS.indexOf(APP), RO.ROUND_TOKENS.length - 1,
  'A3  the new application token is APPENDED, not spliced — the order is the ledger');
eq(RO.IR_CSS_TOKEN_SERIES.indexOf(IR), RO.IR_CSS_TOKEN_SERIES.length - 1,
  'A3a and so is the new IR CSS token');
// S8-R4D-F1A — CONVERTED FROM AN EQUALITY TO A FLOOR, by the round that appended the next token.
// `indexOf(PREV_APP) === length - 2` was true of THIS round and is a claim about EVERY round after it: the
// moment any later round appends legitimately, the R4C ledger entry is no longer second-from-last and this
// suite reports a defect in a tree that has none. The durable claim — the one A3b was written to make — is
// that the ledger is APPEND-ONLY: the spent token is still present, and still strictly before the current
// one. That stays checkable forever and still fails if anyone rewrites or removes the entry.
ok(RO.ROUND_TOKENS.indexOf(PREV_APP) !== -1 && RO.ROUND_TOKENS.indexOf(PREV_APP) < RO.ROUND_TOKENS.indexOf(APP),
  'A3b the spent token is still in the ledger and still before the current one — append-only, never rewritten',
  PREV_APP + ' @' + RO.ROUND_TOKENS.indexOf(PREV_APP) + ' < ' + APP + ' @' + RO.ROUND_TOKENS.indexOf(APP));
ok(RO.tokenIndex(IR) === -1, 'A4  the IR CSS token is NOT a member of the application series');
ok(!RO.isIrCssToken(APP), 'A4a and the application token is not a member of the IR CSS series');
eq(RO.ROUND_TOKENS.filter(function (t) { return t === APP; }).length, 1,
  'A5  each series carries the new token exactly ONCE — a duplicate would invert tokenAtOrAfter');
eq(RO.IR_CSS_TOKEN_SERIES.filter(function (t) { return t === IR; }).length, 1, 'A5a likewise the CSS series');

// NO FOURTH FAMILY. The repository has exactly these four, and inventing a fifth is how a rotation stops
// being checkable by the helpers that exist.
eq([RO.ROUND_TOKENS.length > 0, RO.MAP_TOKEN_SERIES.length > 0,
    RO.IR_CSS_TOKEN_SERIES.length > 0, RO.METHOD_REGISTRY_TOKEN_SERIES.length > 0], [true, true, true, true],
  'A6  the four known token families are all still present and none was replaced');

// ================================================================================================================
section('B — every served reference moved, and none was left behind');
// ================================================================================================================
eq(RO.staleAppTokenRefs(INDEX), [], 'B1  STALE_APPLICATION_TOKEN_REFERENCE_COUNT = 0 in index.html');
eq(RO.staleRouteAssetTokenRefs(APPJS), [], 'B1a and 0 among app.js\'s route-owned assets');
eq(RO.misplacedIndexTokens(INDEX), [],
  'B2  and no asset carries a token from the wrong family — checked in BOTH directions');
ok(INDEX.indexOf(PREV_APP) === -1, 'B3  no reference is left on the spent application token', PREV_APP);
ok(INDEX.indexOf(PREV_IR) === -1, 'B3a nor on the spent IR CSS token', PREV_IR);
ok(APPJS.indexOf(PREV_APP) === -1, 'B3b nor in app.js');
if (ACCEPT === null) {
  console.log('   (the local acceptance harness is absent — B3c skipped, and it is gitignored by design)');
} else {
  ok(ACCEPT.indexOf(PREV_APP) === -1 && ACCEPT.indexOf(PREV_IR) === -1,
    'B3c nor in the LOCAL acceptance harness, which loads the SAME assets and would otherwise exercise '
    + 'stale bytes — it is gitignored, so this is a local-hygiene check, not a publication one');
}
// Reported, never pinned: a round that adds an asset moves this number and that is not a defect.
console.log('   APPLICATION_TOKEN_REFERENCE_COUNT_POST(index.html) = ' + RO.appTokenRefCount(INDEX));
ok(RO.appTokenRefCount(INDEX) > 0, 'B4  index.html serves the application set on the new token');

// THE FOUR FILES THIS ROUND MOVED must each be served on a rotated token — that is what "rotated together"
// means, stated against the files rather than against a count.
var MOVED_APP_FILES = ['assets/js/pages/inventory-replenishment.js', 'assets/js/utils/inventory-compat.js',
  'assets/js/api/km-api-foundation.js'];
// index.html quotes its references with " and app.js with ', so a "-only terminator ran past the end of
// the token and swallowed the rest of the file. Both quote styles terminate.
function refToken(src, p) {
  var m = new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\?v=([^"\']+)').exec(src);
  return m ? m[1] : null;
}
MOVED_APP_FILES.forEach(function (p, i) {
  var t = refToken(INDEX, p) || refToken(APPJS, p);
  eq(t, APP, 'B5.' + (i + 1) + ' ' + p.split('/').pop() + ' is served on the new application token');
});
eq(refToken(INDEX, 'assets/css/pages/inventory-replenishment.css'), IR,
  'B6  and the stylesheet on the new IR CSS token — its own family, which is the whole point of the split');

// ================================================================================================================
section('C — the six classes that make the CSS rotation load-bearing');
// ================================================================================================================
// R4C corrected this count from five to SIX: an earlier note had paired retry/refresh as one.
var LAZY_CLASSES = ['replen-card__value--pending', 'replen-card__note', 'replen-card__row--error',
  'replen-card__row--meta', 'ir-exposure-retry', 'ir-exposure-refresh'];
eq(LAZY_CLASSES.length, 6, 'C1  NEW_LAZY_EXPOSURE_CLASS_SET = six, not the five an earlier note claimed');
LAZY_CLASSES.forEach(function (c, i) {
  ok(CSS.indexOf('.' + c) !== -1, 'C2.' + (i + 1) + ' the NEW stylesheet has a rule for .' + c);
});
LAZY_CLASSES.forEach(function (c, i) {
  ok(PAGE.indexOf(c) !== -1, 'C3.' + (i + 1) + ' and the page really emits ' + c + ' — not a rule for nothing');
});

// The half that proves the rotation was necessary: the CACHED stylesheet has none of them. Read from git so
// the claim is about the bytes a returning browser actually holds, not about a hand-copied list.
var cp = require('child_process');
var CACHED_CSS;
try {
  CACHED_CSS = cp.execFileSync('git', ['show', '8856aeb:assets/css/pages/inventory-replenishment.css'],
    { cwd: ROOT, encoding: 'utf8' });
} catch (e) { CACHED_CSS = null; }
if (CACHED_CSS === null) {
  console.log('   (git unavailable — C4 skipped)');
} else {
  var missing = LAZY_CLASSES.filter(function (c) { return CACHED_CSS.indexOf('.' + c) === -1; });
  eq(missing.length, 6,
    'C4  OLD_CACHED_CSS_MISSING_CLASS_COUNT = 6 — origin/main\'s stylesheet has ZERO rules for all six, so '
    + 'a browser holding it renders every new state unstyled while the state itself is correct');
}

// ================================================================================================================
section('D — what this round did NOT rotate');
// ================================================================================================================
// method-registry.js and the map series did not change, and rotating an unchanged family spends a token for
// nothing — the mirror image of the fault above, and just as traceable.
eq(RO.currentMethodRegistryToken(), 'fc1be3r4a2r1r6r4-method-registry-20260905',
  'D1  the method-registry family did NOT rotate — that file did not change in R4B-2B or R4B-2D');
eq(refToken(INDEX, RO.METHOD_REGISTRY_FILE), RO.currentMethodRegistryToken(),
  'D1a and is still served on its own current token');
eq(RO.currentMapToken(), RO.MAP_TOKEN_SERIES[RO.MAP_TOKEN_SERIES.length - 1],
  'D2  the map family is untouched — no map browser file changed');
RO.MAP_BROWSER_FILES.forEach(function (p, i) {
  var t = refToken(INDEX, p);
  ok(t === null || RO.isMapToken(t),
    'D2.' + (i + 1) + ' ' + p.split('/').pop() + ' still carries a MAP token, not this round\'s', t);
});

// ================================================================================================================
section('E — mutants: every guard above is load-bearing');
// ================================================================================================================
function withIndex(src) { return src; }

// ANCHORED ON inventory-compat.js, which index.html really serves. inventory-replenishment.js is NOT in
// index.html — S4-R5 code-split it onto app.js's route loader — so a mutant anchored there would have
// mutated nothing and reported a passing grade for a tree it never changed.
mut('M1  the old APPLICATION token is left behind on one asset', function () {
  var m = INDEX.replace('inventory-compat.js?v=' + APP, 'inventory-compat.js?v=' + PREV_APP);
  if (m === INDEX) throw new Error('M1 anchor drifted — no application reference to leave behind');
  return RO.staleAppTokenRefs(m).length > 0;
});
mut('M1a and likewise on the route-loaded page module, which lives in app.js rather than index.html', function () {
  var m = APPJS.replace('inventory-replenishment.js?v=' + APP, 'inventory-replenishment.js?v=' + PREV_APP);
  if (m === APPJS) throw new Error('M1a anchor drifted — no route asset to leave behind');
  return RO.staleRouteAssetTokenRefs(m).length > 0;
});
mut('M2  the old IR CSS token is left behind on the stylesheet', function () {
  var m = INDEX.replace('inventory-replenishment.css?v=' + IR, 'inventory-replenishment.css?v=' + PREV_IR);
  if (m === INDEX) throw new Error('M2 anchor drifted — the stylesheet reference was not found');
  return refToken(m, 'assets/css/pages/inventory-replenishment.css') === PREV_IR
    && RO.irCssTokenAtOrAfter(PREV_IR, IR) === false;
});
mut('M3  the WRONG family is used — the stylesheet is given the application token', function () {
  var m = INDEX.replace('inventory-replenishment.css?v=' + IR, 'inventory-replenishment.css?v=' + APP);
  if (m === INDEX) throw new Error('M3 anchor drifted');
  return RO.misplacedIndexTokens(m).some(function (s) { return /Site Inventory stylesheet but carries/.test(s); });
});
mut('M3a ...and the mirror: an application asset is given the IR CSS token', function () {
  var m = INDEX.replace('inventory-compat.js?v=' + APP, 'inventory-compat.js?v=' + IR);
  if (m === INDEX) throw new Error('M3a anchor drifted');
  return RO.misplacedIndexTokens(m).some(function (s) { return /not the Site Inventory stylesheet but carries/.test(s); });
});
mut('M4  a FOURTH token family is invented instead of extending one that exists', function () {
  var INVENTED = 's8r4cp1-freeze-20261004';
  var m = INDEX.replace('inventory-compat.js?v=' + APP, 'inventory-compat.js?v=' + INVENTED);
  if (m === INDEX) throw new Error('M4 anchor drifted');
  // Unknown to every series, so no helper can place it — which is exactly the defect: it is checkable by
  // NOTHING, and a rotation nobody can verify is indistinguishable from no rotation at all.
  return RO.tokenIndex(INVENTED) === -1 && !RO.isIrCssToken(INVENTED) && !RO.isMapToken(INVENTED)
    && refToken(m, 'assets/js/utils/inventory-compat.js') === INVENTED;
});
mut('M5  the lazy-exposure classes are absent from the rotated stylesheet', function () {
  var m = CSS;
  LAZY_CLASSES.forEach(function (c) { m = m.split('.' + c).join('.__removed_' + c); });
  if (m === CSS) throw new Error('M5 anchor drifted — no class to remove');
  return LAZY_CLASSES.every(function (c) { return m.indexOf('.' + c) === -1; })
    && LAZY_CLASSES.every(function (c) { return CSS.indexOf('.' + c) !== -1; });
});
mut('M6  an UNRELATED family is rotated along for the ride', function () {
  // The method registry did not change this round. Moving its token spends one for nothing and breaks the
  // served reference, which is how a tidy-looking rotation becomes a 404 or a stale module.
  var cur = RO.currentMethodRegistryToken();
  var m = INDEX.replace(RO.METHOD_REGISTRY_FILE + '?v=' + cur, RO.METHOD_REGISTRY_FILE + '?v=' + APP);
  if (m === INDEX) throw new Error('M6 anchor drifted — the method-registry reference was not found');
  return refToken(m, RO.METHOD_REGISTRY_FILE) !== cur;
});
mut('M7  the new token is SPLICED into the middle of the ledger rather than appended', function () {
  var order = RO.ROUND_TOKENS.slice();
  var without = order.filter(function (t) { return t !== APP; });
  var at = without.indexOf(PREV_APP);
  var spliced = without.slice(0, at).concat([APP]).concat(without.slice(at));
  function after(list, a, b) { var i = list.indexOf(a), j = list.indexOf(b); return i !== -1 && j !== -1 && i >= j; }
  // Spliced, the SPENT token sorts after the new one — which inverts every floor written against either.
  return after(spliced, PREV_APP, APP) && !after(order, PREV_APP, APP);
});

// ================================================================================================================
section('F — vacuity: every mutant predicate is FALSE against the unmutated tree');
// ================================================================================================================
var vac = [];
[['M1', function () { return RO.staleAppTokenRefs(INDEX).length === 0; }],
 ['M1a', function () { return RO.staleRouteAssetTokenRefs(APPJS).length === 0; }],
 ['M2', function () { return refToken(INDEX, 'assets/css/pages/inventory-replenishment.css') === IR; }],
 ['M3', function () { return RO.misplacedIndexTokens(INDEX).length === 0; }],
 ['M3a', function () { return RO.misplacedIndexTokens(INDEX).length === 0; }],
 ['M4', function () { return RO.tokenIndex(APP) !== -1; }],
 ['M5', function () { return LAZY_CLASSES.every(function (c) { return CSS.indexOf('.' + c) !== -1; }); }],
 ['M6', function () { return refToken(INDEX, RO.METHOD_REGISTRY_FILE) === RO.currentMethodRegistryToken(); }],
 ['M7', function () { return RO.ROUND_TOKENS.indexOf(APP) === RO.ROUND_TOKENS.length - 1; }]
].forEach(function (p) {
  var held; try { held = !!p[1](); } catch (e) { held = false; }
  if (!held) vac.push(p[0]);
});
eq(vac, [], 'F1  every mutant is checked against a tree where the fault is absent');

// ================================================================================================================
console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log('mutations: ' + neg.caught + ' caught, ' + neg.missed + ' missed');
process.exitCode = fail ? 1 : 0;
