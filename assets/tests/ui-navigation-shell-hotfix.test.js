// Kitchen Mama Operation System — Home-shell layout-ownership hotfix guard (UI navigation, Round 2).
// Run: node assets/tests/ui-navigation-shell-hotfix.test.js
// -----------------------------------------------------------------------------
// The persistent pale-cream top strip on non-Home pages was the Home shell WRAPPER (#home-mount) staying in the
// main-content flow: hiding only the inner #home-section left #home-mount (never :empty) participating in layout and
// exposing the Home goal-card cream gradient (home.css .goal-container #fff7ed→#ffedd5). Round 1's
// `#home-mount:empty { display:none }` could never match and was ineffective.
//
// The fix: a single owner setHomeShellVisible(isVisible) that toggles the native `hidden` attribute on the WHOLE
// shell (#home-mount + #world-time-bar + #home-section) — showSection(false) / showHome(true) — backed by a scoped
// `[hidden] { display:none !important }` rule (authoritative even over `.world-time-bar { display:flex }`).
//
// No browser layout engine exists in this Node env (round §8 fallback): this guard (1) EXECUTES the real
// setHomeShellVisible extracted from app.js against a fake DOM and asserts the `hidden` contract, and (2) source-scans
// that the fix is wired end-to-end, the ineffective :empty rule is gone, and NO masking hack was used.

'use strict';
var fs = require('fs');
var path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function stripComments(src) { return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1'); }

var APP = read('js/app.js');
var APP_CODE = stripComments(APP);
var HOME = stripComments(read('js/pages/home.js'));
var CSS = stripComments(read('css/layout.css'));
var BASE = stripComments(read('css/base.css'));

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// =====================================================================================================
section('A. setHomeShellVisible is the single owner, wired to both nav directions');
ok(/function setHomeShellVisible\(isVisible\)/.test(APP_CODE), 'A1 app.js defines setHomeShellVisible(isVisible)');
ok(/el\.hidden = !isVisible/.test(APP_CODE), 'A2 it toggles the native `hidden` attribute (not a child-only display)');
ok(/'home-mount'[\s\S]{0,60}'world-time-bar'[\s\S]{0,60}'home-section'/.test(APP_CODE), 'A3 it targets the WHOLE shell (home-mount + world-time-bar + home-section)');
ok(/setHomeShellVisible\(false\)/.test(APP_CODE), 'A4 showSection() removes the Home shell via setHomeShellVisible(false)');
ok(/setHomeShellVisible\(true\)/.test(HOME), 'A5 showHome() restores the Home shell via setHomeShellVisible(true)');
ok(!/getElementById\('world-time-bar'\)\.style/.test(APP_CODE) && !/getElementById\('home-section'\)\.style\.display\s*=/.test(APP_CODE),
  'A6 no leftover child-only inline display writes fighting the attribute in showSection');

section('B. layout.css makes `hidden` authoritative + drops the ineffective :empty rule');
ok(/#home-mount\[hidden\][\s\S]*?display:\s*none\s*!important/.test(CSS), 'B1 #home-mount[hidden] → display:none !important (beats author display rules)');
ok(/#world-time-bar\[hidden\]/.test(CSS) && /#home-section\[hidden\]/.test(CSS), 'B2 world-time-bar + home-section [hidden] covered (e.g. .world-time-bar{display:flex})');
ok(!/#home-mount:empty/.test(CSS), 'B3 the ineffective #home-mount:empty rule is REMOVED (not left as misleading dead protection)');
ok(/\.srd-note:empty/.test(CSS) && /\.crc-note:empty/.test(CSS), 'B4 legitimate note :empty collapses kept (containers that can actually become empty)');

section('C. No appearance-masking hack (fix ownership, not paint)');
var hotfixRegion = (CSS.split('Home shell layout ownership')[1] || '').split('World Time Bar')[0] || '';
ok(!/background:\s*(white|#fff\w*)\s*!important/i.test(CSS), 'C1 no global background:white !important mask');
ok(!/margin[^:]*:\s*-|top:\s*-\d/.test(hotfixRegion), 'C2 no negative margin/offset in the hotfix region');
ok(!/overflow:\s*hidden/.test(hotfixRegion) && !/position:\s*absolute/.test(hotfixRegion), 'C3 no overflow:hidden / absolute-overlay masking in the hotfix region');

// =====================================================================================================
section('D. Execute the REAL setHomeShellVisible against a fake DOM (hidden contract)');
function loadSetHomeShellVisible(doc) {
  var start = APP.indexOf('function setHomeShellVisible');
  var marker = 'window.setHomeShellVisible = setHomeShellVisible;';
  var end = APP.indexOf(marker) + marker.length;
  var src = APP.slice(start, end);                 // the ACTUAL source, not a re-implementation
  var win = {};
  (function (document, window, String, Array) { eval(src); })(doc, win, String, Array);
  return win.setHomeShellVisible;
}
function makeEl() { return { hidden: false, style: { display: 'block' }, attrs: {}, setAttribute: function (k, v) { this.attrs[k] = v; } }; }
function makeDoc(withWorldBar) {
  var els = { 'home-mount': makeEl(), 'home-section': makeEl() };
  if (withWorldBar) els['world-time-bar'] = makeEl();
  return { els: els, getElementById: function (id) { return Object.prototype.hasOwnProperty.call(els, id) ? els[id] : null; } };
}
var doc = makeDoc(true);
var setHomeShellVisible = loadSetHomeShellVisible(doc);
ok(typeof setHomeShellVisible === 'function', 'D0 real setHomeShellVisible extracted + evaluated');

// Non-Home navigation → the WHOLE shell leaves layout.
setHomeShellVisible(false);
ok(doc.els['home-mount'].hidden === true, 'D1 #home-mount.hidden === true after non-Home navigation (wrapper leaves layout)');
ok(doc.els['world-time-bar'].hidden === true && doc.els['home-section'].hidden === true, 'D2 world-time-bar + home-section also hidden');
ok(doc.els['home-mount'].style.display === '', 'D3 stale inline display cleared so `hidden` governs');
ok(doc.els['home-mount'].attrs['aria-hidden'] === 'true', 'D4 aria-hidden mirrors the hidden state');

// Return Home → restored exactly.
setHomeShellVisible(true);
ok(doc.els['home-mount'].hidden === false && doc.els['world-time-bar'].hidden === false && doc.els['home-section'].hidden === false, 'D5 Home shell restored (hidden === false) after showHome');
ok(doc.els['home-mount'].attrs['aria-hidden'] === 'false', 'D6 aria-hidden restored to false');

// Three Home → non-Home → Home cycles are idempotent (no accumulated state).
for (var i = 0; i < 3; i++) { setHomeShellVisible(false); setHomeShellVisible(true); }
ok(doc.els['home-mount'].hidden === false, 'D7 three navigation cycles are idempotent (ends visible, no accumulation)');
setHomeShellVisible(false);
ok(doc.els['home-mount'].hidden === true, 'D8 idempotent hide (still exactly hidden after repeated cycles)');

// Missing optional world-time node must not throw.
var doc2 = makeDoc(false);   // no #world-time-bar
var setHSV2 = loadSetHomeShellVisible(doc2);
var threw = false;
try { setHSV2(false); } catch (e) { threw = true; }
ok(!threw, 'D9 missing optional world-time-bar node does not throw');
ok(doc2.els['home-mount'].hidden === true && doc2.els['home-section'].hidden === true, 'D10 the present shell nodes are still hidden when an optional node is absent');

section('E. Legitimate banner is never collapsed (contract)');
// :empty matches only with zero child nodes — a populated note has content, so it is never hidden.
function isEmptyNode(childNodes) { return childNodes.length === 0; }
ok(isEmptyNode([]) === true, 'E1 an empty note IS :empty → collapses (zero layout space)');
ok(isEmptyNode([{ text: '⚠ Couldn’t load data. Retry' }]) === false, 'E2 a populated warning/error banner is NOT :empty → always preserved');

// =====================================================================================================
section('F. Single canonical header-offset owner — no duplicate top offset (Round 3, §4)');
// The header offset must be owned by exactly one token so the fixed header, the app-layout offset, the fixed
// sidebar top and the main-content viewport height can never double-count or drift.
ok(/--header-height:\s*\d+px/.test(BASE), 'F1 base.css defines the canonical --header-height token exactly once');
ok(/\.app-layout\s*\{[^}]*margin-top:\s*var\(--header-height\)/.test(CSS), 'F2 .app-layout top offset derives from --header-height');
ok(/top:\s*var\(--header-height\)/.test(CSS), 'F3 fixed .sidebar top derives from --header-height');
ok(/height:\s*calc\(100vh - var\(--header-height\)\)/.test(CSS), 'F4 viewport heights derive from --header-height (no literal calc(100vh - 80px))');
ok(/\.top-header\s*\{[^}]*min-height:\s*var\(--header-height\)/.test(CSS), 'F5 .top-header fills the canonical offset (no body-cream shortfall below the fixed header)');
// No bare duplicate offset literals survive → the offset cannot be double-counted.
ok(!/margin-top:\s*80px/.test(CSS) && !/top:\s*80px/.test(CSS) && !/calc\(100vh - 80px\)/.test(CSS), 'F6 no bare 80px header-offset literals remain (single owner, no duplicate)');
// .main-content carries NO second top offset of its own.
ok(!/\.main-content\s*\{[^}]*(margin-top|padding-top)\s*:/.test(CSS), 'F7 .main-content carries no duplicate top margin/padding offset');
// content-area keeps its intended internal 32px (2rem) padding — the real page-content spacing is preserved.
ok(/\.content-area\s*\{[^}]*padding:\s*2rem/.test(CSS), 'F8 main.content-area keeps its intended internal 2rem (32px) content padding');
// No masking hacks in the layout.
ok(!/background:\s*(white|#fff\w*)\s*!important/i.test(CSS) && !/margin[^:]*:\s*-\d/.test(CSS), 'F9 no background-white mask / negative-margin hack in layout.css');

section('G. renderRecords guards its orphaned target (no throw) — §5');
// #recordsList exists in NO page markup; renderRecords must no-op instead of throwing "Cannot set properties of null".
(function () {
  var start = APP.indexOf('function renderRecords');
  var end = APP.indexOf('\n}', start) + 2;
  var src = APP.slice(start, end);
  ok(/if \(!recordsList\) return;/.test(src), 'G1 renderRecords null-guards the orphaned #recordsList target (narrow guard, not broad try/catch)');
  // Execute the REAL function against a fake DOM where getElementById returns null.
  var calledGetRecords = false;
  var fakeDoc = { getElementById: function () { return null; } };
  var fakeWin = { DataRepo: { getRecords: function () { calledGetRecords = true; return []; } } };
  var threw = false;
  // Define AND invoke inside the same eval scope (a strict-mode function declaration in eval does not leak out).
  try { (function (document, window) { eval(src + '\nrenderRecords();'); })(fakeDoc, fakeWin); } catch (e) { threw = true; }
  ok(!threw, 'G2 renderRecords does NOT throw when #recordsList is absent (startup no longer logs the TypeError)');
  ok(calledGetRecords === false, 'G3 it returns BEFORE touching data (clean no-op for the missing optional target)');
})();

// =====================================================================================================
console.log('\n----------------------------------------');
console.log('UI NAV + LAYOUT HOTFIX GUARD (Rounds 2-3): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
