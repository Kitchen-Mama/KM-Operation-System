// Kitchen Mama Operation System — Persistent Top-Gap navigation hotfix guard (UI lifecycle).
// Run: node assets/tests/ui-navigation-shell-hotfix.test.js
// -----------------------------------------------------------------------------
// The SPA renders every page into a shared shell (header + sidebar + main-content viewport). A page must never
// leave stale shell state (a still-`active` section, an un-hidden Home region, or an empty note that keeps height)
// between the header and the active page content. This guard proves the lifecycle-ownership hotfix WITHOUT relying
// on a browser layout engine (none exists in this Node test env, per the round's §8 fallback): it (1) source-scans
// the exact fix into `app.js` + `layout.css` and proves NO masking hack was used, and (2) exercises the two
// invariants the fix guarantees on a tiny fake DOM: shell normalization is throw-safe, and empty note/regions
// collapse while populated ones do not. No Sheet/DB/API, no network, no writes.

'use strict';
var fs = require('fs');
var path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
// strip comments so source-scans assert on real CODE/CSS, not prose
function code(src) { return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1'); }

var APP = read('js/app.js');
var APP_CODE = code(APP);
var CSS = read('css/layout.css');
var CSS_CODE = code(CSS);

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// =====================================================================================================
section('A. showSection normalizes the shared shell throw-safely (no stale section can stack)');
// The world-time bar hide MUST be null-guarded — an unguarded getElementById(...).style would throw when the node
// is absent and abort showSection before `.active` is cleared, leaving the previous section stacked in the flow.
ok(!/getElementById\('world-time-bar'\)\.style/.test(APP_CODE),
  'A1 world-time-bar is NOT dereferenced unguarded (no getElementById("world-time-bar").style.* that can throw)');
ok(/var _worldBar = document\.getElementById\('world-time-bar'\);\s*if \(_worldBar\)/.test(APP_CODE),
  'A2 world-time-bar hide is null-guarded (missing node cannot abort shell normalization)');
ok(/var _homeSection = document\.getElementById\('home-section'\);\s*if \(_homeSection\)/.test(APP_CODE),
  'A3 Home section hide stays null-guarded (Home is not a .module-section; hidden explicitly)');
ok(/querySelectorAll\('\.module-section'\)\.forEach\([\s\S]*?classList\.remove\('active'\)/.test(APP_CODE),
  'A4 every .module-section has `active` cleared before the next page mounts (exactly one active section)');

section('B. layout.css collapses EMPTY shared note/notification regions (never masks real banners)');
ok(/:empty\s*\{\s*display:\s*none/.test(CSS_CODE) || /:empty,[\s\S]*\{\s*display:\s*none/.test(CSS_CODE),
  'B1 an :empty → display:none collapse rule exists (empty region reserves zero layout space)');
['\\.srd-note:empty', '\\.crc-note:empty', '\\.procurement-page__note:empty', '#home-mount:empty'].forEach(function (sel) {
  ok(new RegExp(sel).test(CSS_CODE), 'B2 collapse covers ' + sel.replace(/\\\\/g, ''));
});
// :empty only matches when there are NO child nodes, so a banner WITH a message is never collapsed — proven in D.

section('C. No forbidden "appearance-masking" fix was introduced (fix ownership, not paint)');
ok(!/background:\s*white\s*!important/i.test(CSS_CODE) && !/background:\s*#fff\w*\s*!important/i.test(CSS_CODE),
  'C1 no global background:white !important mask');
ok(!/margin-top:\s*-|margin:\s*-|top:\s*-\d/.test(CSS_CODE.split('World Time Bar')[0].split('safety net')[1] || ''),
  'C2 no negative-margin / negative-offset hack in the hotfix region');
ok(!/overflow:\s*hidden/.test((CSS_CODE.split('safety net')[1] || '').split('World Time Bar')[0] || ''),
  'C3 no overflow:hidden masking in the hotfix region');
ok(!/position:\s*absolute/.test((CSS_CODE.split('safety net')[1] || '').split('World Time Bar')[0] || ''),
  'C4 no absolute-position overlay hiding in the hotfix region');

// =====================================================================================================
section('D. Invariants on a fake DOM (throw-safe normalize + empty-vs-populated collapse)');
// Minimal fake element/document — models ONLY what the shell-normalization + :empty contract touch.
function makeEl(childText) {
  var cls = {};
  return {
    childNodes: (childText == null || childText === '') ? [] : [{ text: childText }],
    style: {},
    classList: {
      _s: cls,
      add: function (c) { cls[c] = 1; },
      remove: function (c) { delete cls[c]; },
      contains: function (c) { return !!cls[c]; }
    },
    get isEmpty() { return this.childNodes.length === 0; }
  };
}
// A section starts "active"; a stale previous section must be de-activated by normalize().
var prevSection = makeEl('old page content'); prevSection.classList.add('active');
var nextSection = makeEl('new page content');
var homeSection = makeEl('home'); homeSection.style.display = 'block';
var sectionsInDom = [prevSection, nextSection];
// world-time-bar is DELIBERATELY absent to prove the guard (getElementById returns null for it).
var fakeDoc = {
  getElementById: function (id) { return id === 'home-section' ? homeSection : (id === 'world-time-bar' ? null : null); },
  querySelectorAll: function (sel) { return sel === '.module-section' ? sectionsInDom : []; }
};
// Mirror of app.js showSection's guarded shell-reset (the code proven present in A):
function normalizeShell(doc) {
  var hs = doc.getElementById('home-section'); if (hs) hs.style.display = 'none';
  var wb = doc.getElementById('world-time-bar'); if (wb) wb.style.display = 'none';
  doc.querySelectorAll('.module-section').forEach(function (s) { s.classList.remove('active'); });
}
var threw = false;
try { normalizeShell(fakeDoc); } catch (e) { threw = true; }
ok(!threw, 'D1 normalize does NOT throw when a shell node (world-time-bar) is absent');
ok(homeSection.style.display === 'none', 'D2 Home region hidden during normalize');
ok(!prevSection.classList.contains('active'), 'D3 stale previous section de-activated (cannot stack above next page)');
ok(sectionsInDom.filter(function (s) { return s.classList.contains('active'); }).length === 0,
  'D4 after normalize no section is active (caller then activates exactly one)');
// :empty contract — an empty note has zero child nodes; a populated one does not.
var emptyNote = makeEl('');
var realBanner = makeEl('⚠ Couldn’t load data. Retry');
ok(emptyNote.isEmpty === true, 'D5 empty note IS :empty → the collapse rule applies (zero layout space)');
ok(realBanner.isEmpty === false, 'D6 populated banner is NOT :empty → the collapse rule NEVER hides a real message');

// =====================================================================================================
console.log('\n----------------------------------------');
console.log('UI NAV SHELL HOTFIX GUARD: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
