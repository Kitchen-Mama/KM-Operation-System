/**
 * ==================================================================================================
 * PRODUCT STRATEGY — THE STATE BEFORE THE DATA   (P1-B8D-R10C)
 * ==================================================================================================
 *
 * R10B MEASURED A CRASH ON THE DEPLOYED BYTES AND THIS SUITE IS ITS PROOF AND ITS FENCE.
 *
 *   Uncaught TypeError: Cannot read properties of null (reading 'rows')
 *     at buildModel      psb-board-ui.js:207    rows: CANON.rows
 *     at categoryValues  psb-board-ui.js:232    var m = MODEL || buildModel();
 *     at firstCategory   psb-board-ui.js:241
 *     at selectView      psb-board-ui.js:2461   else if (!STATE.category) { STATE.category = firstCategory(); }
 *
 * WHAT IT MEANS. `CANON` is the last canonical load. It starts null and is assigned in exactly one
 * place — `reload()` — which runs inside `boot()`. Production has no preview fixture, so the board
 * does NOT auto-mount: the scripts load, the view rail is wired, and `CANON` stays null until the
 * page controller calls `mount()` with data. When the data refuses — a timeout, an offline browser,
 * a capability that could not be read — `mount()` never happens and `CANON` is still null. The rail
 * is live anyway. One click on any view other than the one already showing reaches `firstCategory()`
 * and dereferences it.
 *
 * Measured live on 7bd5af2: FIVE throws, one per view, and the sixth was clean because `overview`
 * was the current route and `selectView` returns before the branch. In a second run where the board
 * HAD loaded, the same six clicks threw nothing. That differential is the whole diagnosis: the fault
 * is not the click, it is the click BEFORE the first successful load.
 *
 * ==================================================================================================
 * THE DISTINCTION THIS ROUND IS ABOUT, AND THE ONE IT REFUSES TO BLUR
 * ==================================================================================================
 *
 *   NOT_LOADED        CANON === null. Nothing has been loaded. The page is showing a refusal or a
 *                     loading state and that state is the truth. Answer: null.
 *   LOADED_EMPTY      CANON exists and the site genuinely has nothing. Answer: an empty list, and
 *                     the board's own `notices()` already calls this NO_CATEGORIES_ON_SITE —
 *                     "an answer about the site, not a failure to load", in its own words.
 *   LOADED_WITH_DATA  the ordinary case.
 *
 * SO THE GUARD RETURNS `null` AND NOT `[]`. Returning `[]` would be the cheaper edit and it would be
 * a lie: it would tell every caller that the site was read and found to have no categories. The file
 * already legislates against exactly this, in the comment above `categoryValues`: "An empty menu and
 * a menu of three demonstration values are different answers and must look different." An empty menu
 * and NO MENU YET are different answers too.
 *
 * WHAT IS NOT DONE HERE. No empty fixture is substituted for missing data, no TypeError is caught and
 * dropped, no `CANON || {rows:[]}` appears anywhere, no transport, retry, timeout or capability rule
 * is touched, and the fix is not a guard bolted onto the one caller that happened to crash.
 *
 * WHY THREE FUNCTIONS ARE ENOUGH — asserted in §D rather than assumed. Every OTHER reader of the
 * category helpers (`viewCategory`, `viewFindings`, `renderScope`) is a rendering function, and all
 * rendering passes `render()`, which begins `if (!MOUNTED) return;` and then calls `reload()` before
 * anything draws. None of them can run with CANON null. `selectView` was the exception because it
 * derives STATE *before* it calls `render()` — outside the only guard there was. Z12 proves the fix
 * is not aimed at one view, and Z6/Z11 prove the MOUNTED discipline the argument rests on.
 *
 * MUTANTS ARE APPLIED IN MEMORY. `bootPage(mutateSrc)` hands each source through a transform before
 * it is evaluated, so a mutant never touches the shipped file on disk. A suite that rewrites the
 * repository to test it can leave the repository rewritten when it dies.
 */
'use strict';

var path = require('path');
var H = require('./_psb-harness.js');

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

var BOARD_REL = 'assets/js/product-strategy/psb-board-ui.js';

/* ---- booting the board in the state production starts in ------------------------------------- */
function bootDeferred(opts) {
  opts = opts || {};
  return H.bootPage(opts.mutate || null,
    { defer: true, internals: opts.internals === true, devMode: opts.devMode === true });
}
function tryCall(fn) {
  try { return { threw: false, value: fn() }; }
  catch (e) { return { threw: true, error: String((e && e.message) || e) }; }
}
/* A helper that THROWS while a suite is reading it takes the whole run down with it, and a run that
   dies reports nothing about the assertions it had not reached yet. Every internals read goes
   through this, so a regression is a named failure rather than a stack trace. */
function val(fn) {
  var r = tryCall(fn);
  return r.threw ? { __threw: r.error } : r.value;
}
/** How much board is on screen. Absent hosts and empty hosts are both "nothing drawn". */
function drawnCount(p) {
  var n = 0;
  ['grid', 'catGrid', 'cards', 'tbl'].forEach(function (id) {
    var e = p.dom.document.getElementById(id);
    if (e && e.childNodes) n += e.childNodes.length;
  });
  return n;
}
/** A canonical load that succeeded and found nothing. Not a stand-in for missing data — a real,
 *  legitimate answer, which is exactly what must stay distinguishable from "not loaded". */
function emptyAdapter() {
  return { loadCanonical: function () { return { rows: [] }; } };
}

var ROUTES = ['product-strategy/overview', 'product-strategy/category', 'product-strategy/risk',
  'product-strategy/quality', 'product-strategy/workspace', 'product-strategy/advanced'];

// ==================================================================================================
section('§A — the state production actually starts in');
// ==================================================================================================

var A = bootDeferred();
ok(A.thrown === null, 'A1  the board scripts load without a fixture boot',
  A.thrown && String(A.thrown.message));
ok(A.ctx.PSB_BOARD && typeof A.ctx.PSB_BOARD.showView === 'function',
  'A2  the route seam exists before anything is mounted');
eq(A.ctx.PSB_BOARD.isMounted(), false, 'A3  and the board is NOT mounted');

var Ai = bootDeferred({ internals: true });
eq(Ai.ctx.__PSB_INTERNALS__.canonIsNull(), true,
  'A4  CANON is null in that state — the precondition the live crash needed');

// ==================================================================================================
section('§B — a view click before the first load must not throw  (the R10B defect)');
// ==================================================================================================

ROUTES.forEach(function (route, i) {
  var p = bootDeferred();
  var r = tryCall(function () { return p.ctx.PSB_BOARD.showView(route); });
  ok(r.threw === false, 'B' + (i + 1) + '  showView(' + route.split('/')[1] + ') does not throw '
    + 'before any canonical load', r.error);
});

var Bseq = bootDeferred();
var seqErr = null;
ROUTES.forEach(function (route) {
  var r = tryCall(function () { return Bseq.ctx.PSB_BOARD.showView(route); });
  if (r.threw && !seqErr) seqErr = route + ': ' + r.error;
});
ok(seqErr === null, 'B7  and all six in sequence, on one page, throw nothing', seqErr);
eq(Bseq.ctx.PSB_BOARD.isMounted(), false, 'B8  the board is still not mounted afterwards');
ok(drawnCount(Bseq) === 0,
  'B9  and nothing was drawn — no empty board stands in for the refusal', drawnCount(Bseq));

// ==================================================================================================
section('§C — NOT_LOADED, LOADED_EMPTY and LOADED_WITH_DATA are three different answers');
// ==================================================================================================

var C0 = bootDeferred({ internals: true });
var I0 = C0.ctx.__PSB_INTERNALS__;
eq(val(function () { return I0.categoryValues(); }), null, 'C1  NOT_LOADED: categoryValues() is null, not an empty list');
eq(val(function () { return I0.categoryOptionRows(); }), null, 'C2  NOT_LOADED: categoryOptionRows() is null');
eq(val(function () { return I0.firstCategory(); }), null, 'C3  NOT_LOADED: firstCategory() is null');

var C1 = bootDeferred({ internals: true });
var mountedEmpty = tryCall(function () {
  return C1.ctx.PSB_BOARD.mount({ adapter: emptyAdapter(), siteOwnedByPage: true });
});
ok(mountedEmpty.threw === false, 'C4  a canonical load that found nothing still mounts',
  mountedEmpty.error);
var I1 = C1.ctx.__PSB_INTERNALS__;
eq(I1.canonIsNull(), false, 'C5  LOADED_EMPTY: CANON exists');
eq(val(function () { return I1.categoryValues(); }), [], 'C6  LOADED_EMPTY: categoryValues() is an EMPTY LIST, not null');
ok(val(function () { return I1.categoryOptionRows(); }) !== null
   && typeof val(function () { return I1.categoryOptionRows(); }) === 'object',
  'C7  LOADED_EMPTY: categoryOptionRows() is a real options model, not null');
eq(val(function () { return I1.firstCategory(); }), null, 'C8  LOADED_EMPTY: firstCategory() is null — nothing to pick');

var C2 = bootDeferred({ internals: true });
var mountedFull = tryCall(function () { return C2.ctx.PSB_BOARD.mount({}); });
ok(mountedFull.threw === false, 'C9  the ordinary case still mounts on its fixture', mountedFull.error);
var I2 = C2.ctx.__PSB_INTERNALS__;
var full = val(function () { return I2.categoryValues(); });
ok(Array.isArray(full) && full.length > 0,
  'C10 LOADED_WITH_DATA: categoryValues() is a non-empty list', full);
eq(val(function () { return I2.firstCategory(); }), full && full[0], 'C11 LOADED_WITH_DATA: firstCategory() is its first real category');
ok(JSON.stringify(val(function () { return I0.categoryValues(); }))
   !== JSON.stringify(val(function () { return I1.categoryValues(); })),
  'C12 null and [] are not the same answer and are never interchanged');

// ==================================================================================================
section('§D — the caller census: why three guards are the whole fix');
// ==================================================================================================

var SRC = H.SRC.prototype;
function bare(s) { return H.bare(s); }
var CODE = bare(SRC);

eq((CODE.match(/CANON\s*\.\s*rows/g) || []).length, 4,
  'D1  every read of CANON.rows in the shipped renderer is accounted for');
ok(/function\s+categoryValues\s*\(\)\s*\{\s*if\s*\(\s*!\s*CANON\s*\)\s*return\s+null\s*;/.test(CODE),
  'D2  categoryValues owns the guard');
ok(/function\s+categoryOptionRows\s*\(\)\s*\{\s*if\s*\(\s*!\s*CANON\s*\)\s*return\s+null\s*;/.test(CODE),
  'D3  categoryOptionRows owns the guard');
ok(/function\s+firstCategory\s*\(\)\s*\{[\s\S]{0,160}?v\s*&&\s*v\s*\.\s*length/.test(CODE),
  'D4  firstCategory tolerates a null answer without dereferencing it');
ok(CODE.indexOf('CANON || {') < 0 && CODE.indexOf('CANON||{') < 0,
  'D5  no fabricated canonical stands in for a missing one');
ok(!/catch\s*\([a-zA-Z_$]*\)\s*\{\s*\}/.test(CODE.replace(/\s+/g, ' ')) ||
   CODE.indexOf('TypeError') < 0,
  'D6  no TypeError is caught and dropped');
ok(/function\s+render\s*\(\)\s*\{[\s\S]{0,400}?if\s*\(\s*!\s*MOUNTED\s*\)\s*return\s*;/.test(CODE),
  'D7  render() still refuses to draw while unmounted — the guard the other callers sit behind');
ok(/function\s+render\s*\(\)[\s\S]{0,700}?reload\s*\(\s*\)/.test(CODE),
  'D8  and render() rebuilds CANON before any view function runs');

// ==================================================================================================
section('§E — lifecycle: unmounted, superseded, and recovered');
// ==================================================================================================

var E = bootDeferred();
E.ctx.PSB_BOARD.mount({});
eq(E.ctx.PSB_BOARD.isMounted(), true, 'E1  a mounted board is mounted');
E.ctx.PSB_BOARD.unmount();
eq(E.ctx.PSB_BOARD.isMounted(), false, 'E2  and unmount takes it down');
var afterUnmount = tryCall(function () { return E.ctx.PSB_BOARD.showView('product-strategy/risk'); });
ok(afterUnmount.threw === false, 'E3  a view change after unmount does not throw', afterUnmount.error);
eq(E.ctx.PSB_BOARD.isMounted(), false, 'E4  and does not bring the board back');

var F = bootDeferred({ internals: true });
tryCall(function () { return F.ctx.PSB_BOARD.showView('product-strategy/category'); });
eq(F.ctx.__PSB_INTERNALS__.canonIsNull(), true,
  'E5  a refused page stays NOT_LOADED — a view click does not invent a canonical load');
var recovered = tryCall(function () { return F.ctx.PSB_BOARD.mount({}); });
ok(recovered.threw === false, 'E6  and the same page can still mount when the data arrives',
  recovered.error);
eq(F.ctx.__PSB_INTERNALS__.canonIsNull(), false, 'E7  recovery builds CANON');
ok(val(function () { return F.ctx.__PSB_INTERNALS__.firstCategory(); }) !== null,
  'E8  and the category machinery works normally afterwards');
eq(F.ctx.PSB_BOARD.isMounted(), true, 'E9  the recovered board is mounted');

var G = bootDeferred();
ROUTES.forEach(function (r) { tryCall(function () { return G.ctx.PSB_BOARD.showView(r); }); });
var gMount = tryCall(function () { return G.ctx.PSB_BOARD.mount({}); });
ok(gMount.threw === false, 'E10 six refused view clicks do not poison a later mount', gMount.error);
eq(G.ctx.PSB_BOARD.isMounted(), true, 'E11 and it mounts');

// ==================================================================================================
section('§Z — the mutants. Zero survivors.');
// ==================================================================================================

/* Each mutant edits the source IN MEMORY on its way into the sandbox, runs the check meant to catch
   it, and is discarded with the sandbox. The anchor is required to match exactly once; a mutant whose
   anchor has drifted is a PROBE ERROR and is scored as a survivor, never as a pass. */
function mutant(label, from, to, probe) {
  var hits = H.SRC.prototype.split(from).length - 1;
  if (hits !== 1) {
    neg.missed++; fail++;
    console.error('FAIL ' + label + ' — PROBE FAULT: anchor matched ' + hits + ' times');
    return;
  }
  var mutate = function (k, src) {
    return k === 'prototype' ? src.replace(from, to) : src;
  };
  var r;
  try { r = probe(mutate); }
  catch (e) {
    neg.missed++; fail++;
    console.error('FAIL ' + label + ' — PROBE FAULT: ' + ((e && e.message) || e));
    return;
  }
  score(label, r === true);
}

/** Did a fresh deferred page throw when the six views were clicked? */
function throwsOnViewClicks(mutate, internals) {
  var p = H.bootPage(mutate, { defer: true, internals: internals === true });
  if (p.thrown) return true;                       // a mutant that breaks the load is also caught
  for (var i = 0; i < ROUTES.length; i++) {
    var r = tryCall(function () { return p.ctx.PSB_BOARD.showView(ROUTES[i]); });
    if (r.threw) return true;
  }
  return false;
}

mutant('Z1  the categoryValues guard is removed',
  '  function categoryValues() {\n    if (!CANON) return null;',
  '  function categoryValues() {',
  function (m) { return throwsOnViewClicks(m); });

mutant('Z2  the guard answers [] instead of null, so NOT_LOADED reads as LOADED_EMPTY',
  '  function categoryValues() {\n    if (!CANON) return null;',
  '  function categoryValues() {\n    if (!CANON) return [];',
  function (m) {
    var p = H.bootPage(m, { defer: true, internals: true });
    return p.ctx.__PSB_INTERNALS__.categoryValues() !== null;
  });

mutant('Z3  the categoryOptionRows guard is removed',
  '  function categoryOptionRows() {\n    if (!CANON) return null;',
  '  function categoryOptionRows() {',
  function (m) {
    var p = H.bootPage(m, { defer: true, internals: true });
    return tryCall(function () { return p.ctx.__PSB_INTERNALS__.categoryOptionRows(); }).threw === true;
  });

mutant('Z4  firstCategory dereferences a null answer',
  '    return (v && v.length) ? v[0] : null;',
  '    return v.length ? v[0] : null;',
  function (m) { return throwsOnViewClicks(m); });

mutant('Z5  selectView derives a model before anything is loaded',
  '    else if (!STATE.category) { STATE.category = firstCategory(); }',
  '    else if (!STATE.category) { STATE.category = buildModel().categoryOptions.options.length'
    + ' ? buildModel().categoryOptions.options[0].value : null; }',
  function (m) { return throwsOnViewClicks(m); });

mutant('Z6  render() draws while unmounted, putting an empty board over the refusal',
  'so the two guards are the whole of it. */\n    if (!MOUNTED) return;',
  'so the two guards are the whole of it. */',
  function (m) {
    var p = H.bootPage(m, { defer: true });
    if (p.thrown) return true;
    var r = tryCall(function () { return p.ctx.PSB_BOARD.showView('product-strategy/category'); });
    if (r.threw) return true;
    var grid = p.dom.document.getElementById('grid');
    return !!(grid && grid.childNodes.length > 0);
  });

mutant('Z7  the NOT_LOADED path reloads, dispatching a read with no adapter',
  '    else if (!STATE.category) { STATE.category = firstCategory(); }',
  '    else if (!STATE.category) { reload(); STATE.category = firstCategory(); }',
  function (m) { return throwsOnViewClicks(m); });

mutant('Z8  reload() stops assigning CANON, so recovery never leaves NOT_LOADED',
  '    CANON = ADAPTER.loadCanonical();',
  '    if (CANON) CANON = ADAPTER.loadCanonical();',
  function (m) {
    var p = H.bootPage(m, { defer: true, internals: true });
    if (p.thrown) return true;
    tryCall(function () { return p.ctx.PSB_BOARD.mount({}); });
    return p.ctx.__PSB_INTERNALS__.canonIsNull() === true;
  });

mutant('Z9  a loaded-but-empty site is reported as not loaded',
  '  function categoryValues() {\n    if (!CANON) return null;',
  '  function categoryValues() {\n    if (!CANON || !CANON.rows.length) return null;',
  function (m) {
    var p = H.bootPage(m, { defer: true, internals: true });
    if (p.thrown) return true;
    tryCall(function () {
      return p.ctx.PSB_BOARD.mount({ adapter: emptyAdapter(), siteOwnedByPage: true });
    });
    return p.ctx.__PSB_INTERNALS__.categoryValues() === null;
  });

mutant('Z10 unmount() leaves the board live, so an unmounted page keeps drawing',
  '  function unmount() {\n    MOUNTED = false;',
  '  function unmount() {',
  function (m) {
    var p = H.bootPage(m, { defer: true });
    if (p.thrown) return true;
    tryCall(function () { return p.ctx.PSB_BOARD.mount({}); });
    tryCall(function () { return p.ctx.PSB_BOARD.unmount(); });
    return p.ctx.PSB_BOARD.isMounted() === true;
  });

/* Z11 WAS AIMED AT THE WRONG THING FIRST, AND THE MISS IS THE INTERESTING PART.
   `boot()` sets `MOUNTED = true` and calls `reload()` on the NEXT line, so a load that throws
   leaves the board flagged mounted with CANON still null. The first version of this mutant
   tried to CREATE that ordering and measured nothing, because with the board deferred neither
   line runs at all. The ordering is already there. What the fix has to guarantee is that it
   does not matter: the guard keys on the DATA, not on the FLAG. A guard asking `!MOUNTED`
   would pass every suite that mounts successfully and crash on exactly the page this round
   exists for. */
mutant('Z11 the guard keys on the mounted FLAG instead of the canonical DATA',
  '  function categoryValues() {\n    if (!CANON) return null;',
  '  function categoryValues() {\n    if (!MOUNTED) return null;',
  function (m) {
    var p = H.bootPage(m, { defer: true });
    if (p.thrown) return true;
    var boom = { loadCanonical: function () { throw new Error('the read refused'); } };
    tryCall(function () { return p.ctx.PSB_BOARD.mount({ adapter: boom }); });
    var r = tryCall(function () { return p.ctx.PSB_BOARD.showView('product-strategy/category'); });
    return r.threw === true;
  });

mutant('Z12 only the category view is protected and the other five still throw',
  '  function categoryValues() {\n    if (!CANON) return null;',
  '  function categoryValues() {\n    if (!CANON && STATE.view === \'category\') return null;',
  function (m) { return throwsOnViewClicks(m); });

// ==================================================================================================
section('§F — real Chrome: the six views clicked in every state that has no canonical data');
// ==================================================================================================

/* THE NODE SECTIONS ABOVE DRIVE THE RENDERER IN A DOM SHIM. This one drives the PRODUCTION page in a
   real browser through the repository's own visual runner: production index, production partial,
   production lifecycle, the real transport, and a bounded fake network UNDERNEATH it. Nothing here
   writes controller state — every state below is reached by making the network behave a certain way
   and letting the page decide what to do about it. */

var os = require('os');
var fs = require('fs');
var RUN = require('./_p1b8c-visual-runner.js');
var BROWSER = RUN.findBrowser();
var OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'psb-r10c-'));
var PAGE_FILE = path.join(__dirname, '_p1b8c-acceptance.html');

if (!BROWSER) {
  console.error('STOP_NO_BROWSER_AVAILABLE — §5 cannot be accepted without one.');
  fail++;
} else {
  var MATRIX = [
    ['F1  capability refused',            { capabilityOff: true }],
    ['F2  every read fails',              { fail: true }],
    ['F3  only the capability read fails', { failOnly: 'system.health' }],
    /* F4/F5 WERE WRITTEN AS `hang` AND THAT WAS A MISUSE OF THE RUNNER, worth recording because the
       failure looked like a product result. `hang` marks the page ready after 400ms so a LOADING
       STATE can be photographed; it is mutually exclusive with running a script, so the trace came
       back empty and the suite reported "the six views were not exercised" about a page that was
       never asked to exercise them.
       What this round actually needs is not an infinite wait but the REAL condition: a read still
       OUTSTANDING while the rail is live and being clicked. `delayMs` is that, and it is the same
       control R8 already uses for its deferred teardown. */
    ['F4  a read still outstanding under the clicks', { delayMs: 4000 }],
    ['F5  a slow read and an offline browser',        { delayMs: 4000, offline: true }],
    ['F6  a genuinely offline browser',   { offline: true }],
    ['F7  a site that has no listings',   { emptyWorkspace: true }],
    ['F8  a site that has no categories', { noCategories: true }],
    ['F9  nothing wrong at all (the control)', {}]
  ];

  MATRIX.forEach(function (row) {
    var label = row[0], opts = row[1];
    var m;
    try {
      fs.writeFileSync(PAGE_FILE, RUN.buildPage(Object.assign(
        { capture: 'live', activated: true, script: 'null-canonical-views',
          scriptArgs: {}, noSite: true }, opts)), 'utf8');
      var r = RUN.shot(BROWSER, PAGE_FILE, OUT, { id: 'r10c', w: 1440, h: 900 });
      m = r.measurements;
    } catch (e) {
      fail++;
      console.error('FAIL ' + label + ' — PROBE FAULT: ' + ((e && e.message) || e));
      return;
    }
    if (!m) {
      fail++;
      console.error('FAIL ' + label + ' — no measurements came back from the browser');
      return;
    }
    var errs = m.jsErrors || [];
    var nullRows = errs.filter(function (e) { return /reading .rows./.test(String(e)); });
    ok(nullRows.length === 0, label + ' — no null-canonical TypeError', errs.slice(0, 3));
    ok((m.jsErrorCount || 0) === 0, label + ' — no uncaught error of any kind', errs.slice(0, 3));
    var steps = (m.trace || []).filter(function (st) { return st.view; });
    eq(steps.length, 6, label + ' — all six views were exercised');
    var viaRail = steps.filter(function (st) { return st.via === 'rail'; }).length;
    ok(viaRail === 6 || viaRail === 0,
      label + ' — the clicks went through one path, not a mixture', steps.map(function (st) { return st.via; }));
  });
}

console.log('');
console.log('passed ' + pass + '  failed ' + fail
  + '  |  mutants caught ' + neg.caught + '  survived ' + neg.missed);
if (fail > 0) process.exitCode = 1;
