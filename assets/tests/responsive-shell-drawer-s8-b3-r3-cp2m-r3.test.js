// =============================================================================================================
// S8-B3-R3-CP2M-R3 — THE RESPONSIVE SHELL'S DRAWER: KEYBOARD, FOCUS, CLOSE, AND PAGE SWITCH
// -------------------------------------------------------------------------------------------------------------
// The shell had NO responsive behaviour at all. `.sidebar` was a fixed 240px and `.main-content` carried a
// 240px margin at every width, with no media query in the build changing either — so a 360px phone was left a
// 105px content column, measured against the real index.html.
//
// Below 1024px the sidebar is now an overlay drawer. That is a behaviour, not a stylesheet, and the four
// questions a drawer has to answer are the ones below: can it be opened and shut, does focus go in and come
// back, does Escape work, and does it get out of the way when the operator picks a page. A drawer left open
// over the page somebody just chose hides the thing they asked for.
//
// THE REAL app.js IS LOADED. Nothing here re-implements toggleSidebar; the file under test is the shipped one,
// given a DOM with the elements index.html actually contains.
// =============================================================================================================
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let pass = 0, fail = 0;
function ok(c, m, x) { if (c) { pass++; } else { fail++; console.log('FAIL ' + m + (x === undefined ? '' : '  ' + JSON.stringify(x))); } }
function eq(a, b, m) { ok(a === b, m + '  (got ' + JSON.stringify(a) + ', expected ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }

const NAMESPACE = read('assets/js/core/namespace.js');
const LIFECYCLE = read('assets/js/core/lifecycle.js');
const APP = read('assets/js/app.js');
const INDEX = read('index.html');
const LAYOUT = read('assets/css/layout.css');

// -------------------------------------------------------------------------------------------------------------
function makeEl(id, tag) {
    const el = {
        id: id || '', tagName: (tag || 'div').toUpperCase(), _cls: {}, _attr: {}, children: [],
        parentNode: null, style: { cssText: '' }, innerHTML: '', textContent: '', hidden: false,
        focusCount: 0,
        classList: {
            add(c) { el._cls[c] = 1; },
            remove(c) { delete el._cls[c]; },
            contains(c) { return !!el._cls[c]; },
            toggle(c) { if (el._cls[c]) { delete el._cls[c]; return false; } el._cls[c] = 1; return true; }
        },
        appendChild(c) { el.children.push(c); c.parentNode = el; return c; },
        removeChild(c) { el.children = el.children.filter(x => x !== c); return c; },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        addEventListener() {}, removeEventListener() {},
        setAttribute(k, v) { el._attr[k] = String(v); },
        getAttribute(k) { return Object.prototype.hasOwnProperty.call(el._attr, k) ? el._attr[k] : null; },
        hasAttribute(k) { return Object.prototype.hasOwnProperty.call(el._attr, k); },
        focus() { el.focusCount++; env.doc.activeElement = el; },
        closest() { return null; }
    };
    return el;
}

let env = null;

function build(width) {
    const els = {};
    ['appSidebar', 'kmNavScrim', 'kmNavOpen'].forEach(id => { els[id] = makeEl(id, id === 'kmNavOpen' ? 'button' : 'div'); });
    const firstMenuItem = makeEl('', 'div');
    firstMenuItem._cls['menu-item'] = 1;
    els.appSidebar.querySelector = (sel) => (String(sel).indexOf('menu-item') >= 0 ? firstMenuItem : null);

    const sections = {};
    ['ops-section', 'carrier-rate-card-section', 'overseas-stock-section',
     'site-priority-section', 'product-strategy-board-section'].forEach(id => { sections[id] = makeEl(id); });

    const listeners = { click: [], keydown: [], resize: [] };

    const doc = {
        readyState: 'complete', body: makeEl('body'), documentElement: makeEl('html'),
        activeElement: null,
        getElementById(id) { return els[id] || sections[id] || null; },
        querySelector(s) { const m = String(s).match(/^#([\w-]+)$/); return m ? doc.getElementById(m[1]) : null; },
        querySelectorAll(sel) {
            if (String(sel).indexOf('.module-section') !== -1) return Object.keys(sections).map(k => sections[k]);
            return [];
        },
        createElement(t) { return makeEl('', t); },
        contains() { return true; },
        addEventListener(type, fn) { if (listeners[type]) listeners[type].push(fn); },
        removeEventListener() {}
    };

    /* A vm CONTEXT, not a Function wrapper, and the reason is in lifecycle.js: it writes
       `KM.lifecycle.beginNavigation = ...` with a BARE `KM`, which resolves in a browser only because
       `window.KM` is a global. Inside `new Function(window, ...)` there is no such binding and the file
       throws ReferenceError on load. Making the sandbox its own global — sb.window === sb — is what the
       CP2M-R1 navigation suite does, for the same reason. */
    const win = {
        document: doc, innerWidth: width,
        matchMedia(q) {
            const m = /max-width:\s*(\d+)px/.exec(String(q));
            return { matches: m ? win.innerWidth <= Number(m[1]) : false,
                     addEventListener() {}, removeEventListener() {}, addListener() {} };
        },
        addEventListener(type, fn) { if (listeners[type]) listeners[type].push(fn); },
        removeEventListener() {},
        setTimeout(fn) { try { fn(); } catch (e) {} return 0; },
        clearTimeout() {},
        requestAnimationFrame(fn) { try { fn(); } catch (e) {} return 0; },
        cancelAnimationFrame() {},
        console: { log() {}, warn() {}, error() {} },
        location: { href: 'http://localhost/' },
        performance: { now() { return 0; } },
        alert() {},
        MutationObserver: function () { return { observe() {}, disconnect() {} }; },
        fetch() { return Promise.resolve({ ok: true, text: () => Promise.resolve('') }); }
    };
    win.window = win; win.globalThis = win; win.self = win;

    const ctx = vm.createContext(win);
    vm.runInContext(NAMESPACE, ctx, { filename: 'namespace.js' });
    vm.runInContext(LIFECYCLE, ctx, { filename: 'lifecycle.js' });
    win.KM.scriptLoader = { isLoaded: () => true, ensure: () => Promise.resolve(true), load: () => Promise.resolve(true) };
    win.KM.partialLoader = { loadPartial: () => Promise.resolve(null), isLoaded: () => true };
    vm.runInContext(APP, ctx, { filename: 'app.js' });

    env = { win, doc, els, sections, listeners, firstMenuItem, width };
    return env;
}

const fire = (type, ev) => env.listeners[type].forEach(fn => { try { fn(ev); } catch (e) {} });
const isOpen = () => env.els.appSidebar.classList.contains('is-nav-open');

// -------------------------------------------------------------------------------------------------------------
section('A. the markup and the cascade exist, in the right order');

ok(/id="kmNavOpen"/.test(INDEX), 'A1 index.html carries the drawer opener');
ok(/id="kmNavScrim"/.test(INDEX), 'A2 and the backdrop');
ok(/aria-controls="appSidebar"/.test(INDEX), 'A3 the opener declares what it controls');
ok(/aria-expanded="false"/.test(INDEX), 'A4 and starts collapsed');
// THE CASCADE ORDER IS THE OVERRIDE. Written the other way round, the base `display:none` wins at every
// width at equal specificity and the opener never appears — which is exactly what the first capture showed.
const baseAt = LAYOUT.indexOf('.km-nav-open {');
const mediaAt = LAYOUT.indexOf('.km-nav-open { display: inline-flex; }');
ok(baseAt > -1 && mediaAt > -1, 'A5 both the base rule and the override exist');
ok(baseAt < mediaAt, 'A5a and the base rule comes FIRST, so the media query can override it', [baseAt, mediaAt]);
ok(/\.sidebar\s*\{[^}]*visibility:\s*hidden/.test(LAYOUT.slice(LAYOUT.indexOf('@media (max-width: 1024px)'))),
  'A6 a closed drawer is visibility:hidden, so it is out of the tab order');
ok(/\.main-content,\s*\n\s*\.sidebar\.is-collapsed ~ \.main-content \{ margin-left: 0; \}/.test(LAYOUT),
  'A7 and the content takes the full width whether or not a desktop collapse is left over');

// -------------------------------------------------------------------------------------------------------------
section('B. at phone width the control opens and shuts the drawer');

build(360);
eq(typeof env.win.toggleSidebar, 'function', 'B1 toggleSidebar is published');
eq(isOpen(), false, 'B2 the drawer starts shut');

env.win.toggleSidebar();
eq(isOpen(), true, 'B3 the opener opens it');
eq(env.els.kmNavScrim.classList.contains('is-open'), true, 'B3a the backdrop appears');
eq(env.els.kmNavScrim.hidden, false, 'B3b and is not hidden from the accessibility tree');
eq(env.els.kmNavOpen.getAttribute('aria-expanded'), 'true', 'B3c aria-expanded says so');
ok(env.firstMenuItem.focusCount > 0, 'B4 FOCUS MOVES INTO THE DRAWER — the next Tab is inside the menu');

env.win.toggleSidebar();
eq(isOpen(), false, 'B5 the same control shuts it');
eq(env.els.kmNavScrim.classList.contains('is-open'), false, 'B5a the backdrop goes');
eq(env.els.kmNavScrim.hidden, true, 'B5b and is hidden again');
eq(env.els.kmNavOpen.getAttribute('aria-expanded'), 'false', 'B5c aria-expanded follows');
ok(env.els.kmNavOpen.focusCount > 0, 'B6 FOCUS RETURNS to the control that opened it');

// A drawer must never leave the 64px desktop rail behind at phone width.
eq(env.els.appSidebar.classList.contains('is-collapsed'), false,
  'B7 and the desktop collapse class is never applied at drawer width');

// -------------------------------------------------------------------------------------------------------------
section('C. Escape closes it, and only when it is open');

build(360);
env.win.toggleSidebar();
eq(isOpen(), true, 'C1 open');
let prevented = 0;
fire('keydown', { key: 'Escape', preventDefault() { prevented++; } });
eq(isOpen(), false, 'C2 Escape closes the drawer');
eq(prevented, 1, 'C2a and takes the key, so it does not also reach the page');
ok(env.els.kmNavOpen.focusCount > 0, 'C3 focus returns to the opener');

// Escape with the drawer SHUT must not be swallowed — other things use it.
prevented = 0;
fire('keydown', { key: 'Escape', preventDefault() { prevented++; } });
eq(prevented, 0, 'C4 a shut drawer does NOT consume Escape');

// -------------------------------------------------------------------------------------------------------------
section('D. the backdrop closes it');

build(360);
env.win.toggleSidebar();
eq(isOpen(), true, 'D1 open');
fire('click', { target: env.els.kmNavScrim });
eq(isOpen(), false, 'D2 clicking the backdrop closes it');

build(360);
env.win.toggleSidebar();
fire('click', { target: env.els.appSidebar });
eq(isOpen(), true, 'D3 clicking INSIDE the drawer does not close it');

// -------------------------------------------------------------------------------------------------------------
section('E. choosing a page closes it — and a REFUSED click does not');

build(360);
env.win.toggleSidebar();
eq(isOpen(), true, 'E1 open');
env.win.showSection('site-priority');
eq(isOpen(), false, 'E2 a valid navigation closes the drawer');

// The two refusal guards run BEFORE the navigation is declared, and the drawer close sits after them:
// a click that changes nothing must change nothing, including this.
build(360);
env.win.toggleSidebar();
env.win.showSection('overseas-inbound');          // disabled by name in showSection
eq(isOpen(), true, 'E3 a REFUSED navigation leaves the drawer exactly as it was');
ok(/if \(section === 'overseas-inbound' \|\| section === 'overseas-outbound'\) \{\s*return;/.test(APP),
  'E3a (that refusal is the one in app.js, not an invention of this test)');

// -------------------------------------------------------------------------------------------------------------
section('F. the desktop layout is untouched');

build(1440);
eq(isOpen(), false, 'F1 no drawer at desktop width');
env.win.toggleSidebar();
eq(env.els.appSidebar.classList.contains('is-collapsed'), true,
  'F2 the SAME control still collapses the rail, exactly as before');
eq(isOpen(), false, 'F2a and does not open a drawer');
env.win.toggleSidebar();
eq(env.els.appSidebar.classList.contains('is-collapsed'), false, 'F3 and expands it again');
eq(env.els.kmNavScrim.classList.contains('is-open'), false, 'F4 the backdrop never appears at desktop width');

// -------------------------------------------------------------------------------------------------------------
section('G. crossing back to desktop does not strand an open drawer');

build(360);
env.win.toggleSidebar();
eq(isOpen(), true, 'G1 open at phone width');
env.win.innerWidth = 1440;                      // the resize handler re-reads the width
fire('resize', {});
eq(isOpen(), false, 'G2 widening past the breakpoint closes it');

build(360);
env.win.toggleSidebar();
fire('resize', {});                             // still narrow
eq(isOpen(), true, 'G3 a resize that stays narrow leaves it open');

// -------------------------------------------------------------------------------------------------------------
section('H. the breakpoint is one number, in both files');

const cssBreak = /@media \(max-width: (\d+)px\)[\s\S]{0,400}?is-nav-open/.exec(LAYOUT);
const jsBreak = /KM_NAV_DRAWER_MAX_ = (\d+)/.exec(APP);
ok(!!cssBreak, 'H1 the stylesheet has a drawer breakpoint');
ok(!!jsBreak, 'H2 and app.js has one');
if (cssBreak && jsBreak) {
  eq(jsBreak[1], cssBreak[1],
    'H3 THEY ARE THE SAME NUMBER — two literals would drift the first time either moved');
}

// -------------------------------------------------------------------------------------------------------------
section('I. (non-vacuity) the environment really ran the shipped app.js');

ok(typeof env.win.showSection === 'function', 'I1 showSection came from the real file');
ok(typeof env.win.kmNavClose === 'function', 'I2 and the drawer helpers');
ok(env.listeners.keydown.length >= 1, 'I3 a keydown listener was registered at module scope', env.listeners.keydown.length);
ok(env.listeners.click.length >= 1, 'I4 and a click listener', env.listeners.click.length);
ok(env.listeners.resize.length >= 1, 'I5 and a resize listener', env.listeners.resize.length);
// Bound ONCE at module scope: a per-navigation binding would multiply with every page change.
build(360);
const before = env.listeners.keydown.length;
env.win.showSection('site-priority');
env.win.showSection('ops');
eq(env.listeners.keydown.length, before, 'I6 and navigating does NOT add more of them');

// -------------------------------------------------------------------------------------------------------------
console.log('\n----------------------------------------');
console.log('RESPONSIVE SHELL DRAWER (S8-B3-R3-CP2M-R3): ' + pass + ' passed, ' + fail + ' failed');
if (pass + fail === 0) { console.error('VACUOUS - no assertion executed'); process.exit(1); }
if (fail > 0) process.exitCode = 1;
