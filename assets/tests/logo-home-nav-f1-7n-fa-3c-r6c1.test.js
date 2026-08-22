// Kitchen Mama Operation System — R6C1 Logo→Home navigation through the single SPA authority — F1-7N-FA-3C-R6C1.
// Run: node assets/tests/logo-home-nav-f1-7n-fa-3c-r6c1.test.js
//
// Loads the REAL assets/js/core/lifecycle.js authority + the REAL showHome() from pages/home.js and proves the Logo
// routes through KM.lifecycle.switchTo (not a direct .active toggle), so the R6C single-visible-section invariant governs
// it: Home→Order→Logo→Home restores Home alone, rapid Logo/menu navigation keeps exactly one visible section, and a
// re-click while on Home does not duplicate the mount.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }
function done() { console.log('\n' + '-'.repeat(40)); console.log('R6C1 LOGO→HOME NAV (F1-7N-FA-3C-R6C1): ' + pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1); }
var ROOT = path.join(__dirname, '..');
function extract(src, name) { var s = src.indexOf('function ' + name + '('); if (s < 0) throw new Error('missing ' + name); var i = src.indexOf('{', s), depth = 0; for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (!depth) return src.slice(s, i + 1); } } throw new Error('unbalanced ' + name); }

// ---- minimal DOM ----
function makeSection(id) { var cls = { 'module-section': 1 }; return { id: id, classList: { add: function (c) { cls[c] = 1; }, remove: function (c) { delete cls[c]; }, contains: function (c) { return !!cls[c]; } } }; }
function makeMenuItem() { var cls = { 'menu-item': 1 }; return { classList: { add: function (c) { cls[c] = 1; }, remove: function (c) { delete cls[c]; }, contains: function (c) { return !!cls[c]; } } }; }
var sections = { 'home-section': makeSection('home-section'), 'request-order-section': makeSection('request-order-section'), 'fc-summary-section': makeSection('fc-summary-section') };
var menuItems = [makeMenuItem(), makeMenuItem()];
var shellVisible = null;
global.window = {}; global.KM = { lifecycle: {}, RELEASE: 'r6c-navlifecycle-20260822', dbProvider: { state: function () { return 'READY'; }, generation: function () { return 0; } } };
global.window.KM = global.KM;
global.window.setHomeShellVisible = function (v) { shellVisible = !!v; };
global.MutationObserver = undefined;
global.document = {
  body: {}, addEventListener: function () {},
  getElementById: function (id) { return sections[id] || null; },
  querySelectorAll: function (sel) {
    if (sel === '.menu-item') return menuItems;
    var all = Object.keys(sections).map(function (k) { return sections[k]; });
    if (sel === '.module-section') return all;
    if (sel === '.module-section.active') return all.filter(function (s) { return s.classList.contains('active'); });
    return [];
  }
};
eval(fs.readFileSync(path.join(ROOT, 'js', 'core', 'lifecycle.js'), 'utf8').replace(/\r\n/g, '\n'));

// register pages: mounts re-add .active guarded by commitGuard (production-faithful async .then); home mount also shows shell.
var mountCounts = {}, pending = [];
function reg(id, isHome) {
  KM.lifecycle.register(id, {
    mount: function (epoch) {
      mountCounts[id] = (mountCounts[id] || 0) + 1;
      pending.push(function () { if (!KM.lifecycle.commitGuard(epoch, id)) return; sections[id].classList.add('active'); if (isHome && window.setHomeShellVisible) window.setHomeShellVisible(true); });
    },
    unmount: function () {}
  });
}
reg('home-section', true); reg('request-order-section', false); reg('fc-summary-section', false);
function flush() { pending.forEach(function (f) { f(); }); pending = []; }
function visibleIds() { return document.querySelectorAll('.module-section.active').map(function (s) { return s.id; }); }

// the REAL showHome() + stubs for its (never-taken) fallback branch
var showHome, switchSpy = [];
var _origSwitch = KM.lifecycle.switchTo;
KM.lifecycle.switchTo = function (id) { switchSpy.push(id); return _origSwitch.call(KM.lifecycle, id); };
function _ensureHomeMarkup() { return Promise.resolve(true); }
function renderHomepage() {}
eval(extract(fs.readFileSync(path.join(ROOT, 'js', 'pages', 'home.js'), 'utf8').replace(/\r\n/g, '\n'), 'showHome'));

// a menu navigation mirrors app.js showSection (remove all .active → switchTo → menu item active)
function navigateMenu(id, menuIdx) {
  Object.keys(sections).forEach(function (k) { sections[k].classList.remove('active'); });
  if (window.setHomeShellVisible) window.setHomeShellVisible(false);
  KM.lifecycle.switchTo(id);
  menuItems.forEach(function (m) { m.classList.remove('active'); });
  if (menuIdx != null) menuItems[menuIdx].classList.add('active');
}

(function run() {
  section('Home→Order→Logo→Home routes through the SPA authority');
  KM.lifecycle.switchTo('home-section'); flush();          // startup on Home
  eq(visibleIds(), ['home-section'], 'startup: only Home visible');
  navigateMenu('request-order-section', 0); flush();       // menu → Order
  eq(visibleIds(), ['request-order-section'], 'menu → Order: only Order visible');
  ok(sections['request-order-section'].classList.contains('active') && !sections['home-section'].classList.contains('active'), 'Order active, Home inactive');
  switchSpy = [];
  showHome(); flush();                                     // LOGO click
  ok(switchSpy.indexOf('home-section') !== -1, 'B: Logo routes through KM.lifecycle.switchTo("home-section") (single authority, same path as the menu)');
  eq(visibleIds(), ['home-section'], 'B: after Logo → ONLY Home visible (the prior page is not re-activated by the R6C enforcer)');
  eq(shellVisible, true, 'B: Home shell restored');
  eq(KM.lifecycle.getCurrentPage(), 'home-section', 'B: lifecycle currentPage = home-section (authority updated, not bypassed)');
  ok(menuItems.every(function (m) { return !m.classList.contains('active'); }), 'B: no sidebar menu item highlighted for Home');

  section('single-visible-section invariant holds');
  eq(document.querySelectorAll('.module-section.active').length, 1, 'B: activeVisibleSectionCount = 1 after Logo');

  section('re-click Logo while on Home does not duplicate the mount');
  mountCounts = {};
  showHome(); showHome(); showHome(); flush();
  eq(mountCounts['home-section'] || 0, 0, 'B: re-click Logo while already Home → switchTo early-returns (no duplicate mount/listeners)');

  section('rapid Logo / menu navigation → exactly one visible, latest wins');
  navigateMenu('request-order-section', 0);   // off Home first
  for (var i = 0; i < 8; i++) { if (i % 2 === 0) showHome(); else navigateMenu('request-order-section', 0); }
  flush();
  ok(visibleIds().length === 1, 'B: rapid Logo/menu → exactly ONE visible section');
  // the final action in the loop is i=7 (odd) → navigateMenu(Order); the last commit wins
  eq(visibleIds(), ['request-order-section'], 'B: latest-navigation-wins (final target is the only visible section)');

  section('slow Logo then fast menu → only the newer page (stale Logo mount discarded)');
  navigateMenu('fc-summary-section', 1); flush();
  showHome();                                  // Logo mount queued (epoch E)
  navigateMenu('fc-summary-section', 1);       // superseded before Home mount .then resolves
  flush();
  eq(visibleIds(), ['fc-summary-section'], 'B: a slow Logo mount is discarded when a newer navigation supersedes it (no overlap)');

  section('source guards');
  var HOME = fs.readFileSync(path.join(ROOT, 'js', 'pages', 'home.js'), 'utf8');
  ok(/KM\.lifecycle\.switchTo\('home-section'\)/.test(HOME), 'src: showHome calls KM.lifecycle.switchTo("home-section")');
  ok(!/location\.reload\s*\(|location\.href\s*=|window\.location\s*=/.test(extract(HOME, 'showHome')), 'src: showHome uses NO location.reload() / hard navigation (actual calls, not the doc comment)');
  var IDX = fs.readFileSync(path.join(ROOT, '..', 'index.html'), 'utf8');
  ok(/logo-text[^>]*role="button"[^>]*tabindex="0"/.test(IDX), 'src: Logo is keyboard-accessible (role=button + tabindex=0)');
  ok(/onkeydown="if\(event\.key===.Enter.[\s\S]{0,80}showHome\(\)/.test(IDX), 'src: Logo Enter/Space triggers showHome (keyboard accessible)');
  ok(/logo-text[^>]*onclick="showHome\(\)"/.test(IDX), 'src: Logo click still calls showHome (visually unchanged div+img)');

  done();
})();
