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

// =============================================================================================================
// S8-B3-R3-CP2M-R4 — THE HALF OF THE MODAL CONTRACT CP2M-R3 DID NOT FINISH
// -------------------------------------------------------------------------------------------------------------
// R3 moved focus INTO the drawer on open and RETURNED it on close, and this suite asserted both. What neither
// did was KEEP it there. With the scrim covering the page, Tab from the last menu item walked out of the menu
// and into controls behind a backdrop that exists to say they are unreachable — so a keyboard user ended up
// somewhere invisible with no way back but Escape. These sections are the supplement, and the trap they test
// is new code rather than a re-assertion of old.
//
// The shim's sidebar has no children, so the drawer is given a realistic menu here: four reachable items and
// one buried in a COLLAPSED submenu, which must not be reachable at all.
function withMenu(width) {
    const e = build(width);
    const items = [];
    for (let i = 0; i < 4; i++) {
        const it = makeEl('', 'div');
        it._cls['menu-item'] = 1;
        it.setAttribute('tabindex', '0');
        it.parentNode = e.els.appSidebar;
        items.push(it);
    }
    const shut = makeEl('', 'div');
    shut._cls['menu-children'] = 1;
    shut.parentNode = e.els.appSidebar;
    const buried = makeEl('', 'div');
    buried.setAttribute('tabindex', '0');
    buried.parentNode = shut;
    const all = items.concat([buried]);
    e.els.appSidebar.querySelectorAll = () => all;
    e.els.appSidebar.querySelector = (sel) => (String(sel).indexOf('menu-item') >= 0 ? items[0] : null);
    e.els.appSidebar.contains = (n) => all.indexOf(n) !== -1;
    e.menu = items; e.buried = buried;
    return e;
}
function key(k, shift) {
    const ev = { key: k, shiftKey: !!shift, prevented: false, preventDefault() { this.prevented = true; } };
    fire('keydown', ev);
    return ev;
}

section('J. TAB IS CONTAINED while the drawer is open');

withMenu(390);
env.win.toggleSidebar();
eq(isOpen(), true, 'J1 the drawer is open');
eq(env.doc.activeElement, env.menu[0], 'J1a with focus on the first menu item');

env.doc.activeElement = env.menu[3];
let ev = key('Tab');
eq(ev.prevented, true, 'J2 Tab from the LAST item is intercepted');
eq(env.doc.activeElement, env.menu[0], 'J2a and wraps to the first — it does not escape behind the scrim');

env.doc.activeElement = env.menu[0];
ev = key('Tab', true);
eq(ev.prevented, true, 'J3 Shift+Tab from the FIRST item is intercepted');
eq(env.doc.activeElement, env.menu[3], 'J3a and wraps to the last');

// IN THE MIDDLE OF THE LIST THE BROWSER IS LEFT ALONE. A trap that preventDefault()s every Tab would have to
// reimplement ordinary forward movement, and would get it wrong for anything it had not thought of.
env.doc.activeElement = env.menu[1];
ev = key('Tab');
eq(ev.prevented, false, 'J4 Tab in the MIDDLE of the menu is NOT intercepted — the browser moves focus');
eq(env.doc.activeElement, env.menu[1], 'J4a and nothing was moved by hand');

// FOCUS THAT IS ALREADY OUTSIDE IS PULLED BACK — the state a stray click on the scrim can leave behind.
env.doc.activeElement = env.els.kmNavOpen;
ev = key('Tab');
eq(ev.prevented, true, 'J5 Tab from OUTSIDE the open drawer is intercepted');
eq(env.doc.activeElement, env.menu[0], 'J5a and brings focus back into the menu');
env.doc.activeElement = env.els.kmNavOpen;
key('Tab', true);
eq(env.doc.activeElement, env.menu[3], 'J5b Shift+Tab brings it back to the END of the menu');

// A COLLAPSED SUBMENU IS NOT A PLACE TO LAND. Its items are in the DOM and carry tabindex="0"; what makes
// them unreachable is that their parent is shut, which is a fact about the markup rather than about layout.
env.doc.activeElement = env.menu[3];
key('Tab');
ok(env.doc.activeElement !== env.buried, 'J6 an item inside a COLLAPSED submenu is never focused');
env.buried.parentNode._cls['is-open'] = 1;
env.doc.activeElement = env.buried;
ev = key('Tab');
eq(ev.prevented, true, 'J6a but once that submenu is OPEN its item is the last stop');
eq(env.doc.activeElement, env.menu[0], 'J6b and wraps from there');

// AND THE DESKTOP IS NOT TRAPPED, which is the other half of being right. There the sidebar is part of the
// page: Tab SHOULD leave it, and holding focus inside would be the defect.
withMenu(1440);
env.win.toggleSidebar();                       // collapses the rail; no drawer at this width
eq(isOpen(), false, 'J7 (no drawer at desktop width)');
env.doc.activeElement = env.menu[3];
ev = key('Tab');
eq(ev.prevented, false, 'J7a Tab is NOT intercepted at desktop width');
eq(env.doc.activeElement, env.menu[3], 'J7b and focus is left exactly where the browser will take it');

// -------------------------------------------------------------------------------------------------------------
section('K. HOME and END jump to the ends of the menu — and only from inside it');

withMenu(390);
env.win.toggleSidebar();
env.doc.activeElement = env.menu[2];
ev = key('End');
eq(ev.prevented, true, 'K1 End is claimed while focus is in the drawer');
eq(env.doc.activeElement, env.menu[3], 'K1a and lands on the last item');
ev = key('Home');
eq(ev.prevented, true, 'K2 Home is claimed too');
eq(env.doc.activeElement, env.menu[0], 'K2a and lands on the first');

// NOT CLAIMED FROM OUTSIDE. Home means "scroll to the top" to the page underneath, and a drawer that stole it
// whenever it was open would break the page it is sitting over rather than serve its own menu.
env.doc.activeElement = env.els.kmNavOpen;
ev = key('Home');
eq(ev.prevented, false, 'K3 Home from OUTSIDE the drawer is left alone');
eq(env.doc.activeElement, env.els.kmNavOpen, 'K3a and moves nothing');

withMenu(390);
env.doc.activeElement = env.menu[1];
ev = key('Home');
eq(ev.prevented, false, 'K4 and Home is not claimed at all while the drawer is CLOSED');

// -------------------------------------------------------------------------------------------------------------
section('L. DIRECT NAVIGATION — every refusal guard leaves the drawer alone');

// E covers a valid navigation and the named Overseas refusal. The OTHER refusal — a staged section that is
// switched off — returns from an earlier line still, and the close sits after both. A guard placed before
// only ONE of them would pass E and fail here.
const stagedBlock = (APP.match(/KM_STAGED_SECTIONS_\s*=\s*\{([\s\S]*?)\n\};/) || [])[1] || '';
const offSection = (stagedBlock.match(/'([\w-]+)':\s*\{[^}]*enabled:\s*false/) || [])[1];
ok(stagedBlock.length > 0, 'L1 the staged-section registry was found in app.js');
// EVERY staged section is currently switched ON, so there is no refusal of this kind to DRIVE. That is a
// fact about today's registry rather than about the guard, so the claim is made where it stays durable: the
// staged refusal returns BEFORE the line that closes the drawer. Position in the function is what makes "a
// refused click changes nothing" true, and it remains checkable when nothing is switched off.
const guardAt = APP.indexOf('if (staged && staged.enabled !== true) {');
const closeAt = APP.indexOf('try { kmNavClose_(); } catch (e) {}');
ok(guardAt > 0, 'L1a the staged refusal guard exists');
ok(closeAt > 0, 'L1b and the drawer close exists');
ok(guardAt < closeAt, 'L1c and the refusal returns BEFORE the drawer is closed');
if (offSection) {
    build(360);
    env.win.toggleSidebar();
    eq(isOpen(), true, 'L2 open');
    env.win.showSection(offSection);
    eq(isOpen(), true, 'L2a a STAGED-OFF section is refused and the drawer is untouched');
} else {
    ok(/enabled:\s*true/.test(stagedBlock),
      'L2 (every staged section is currently ON, so L1c carries this claim instead)');
}
// A navigation to the page already on screen is still a navigation, and still closes the drawer — otherwise
// re-choosing the current page from the menu leaves the menu covering it.
build(360);
env.win.showSection('site-priority');
env.win.toggleSidebar();
eq(isOpen(), true, 'L3 open, while already on that page');
env.win.showSection('site-priority');
eq(isOpen(), false, 'L3a choosing the SAME page again still closes the drawer');

// And the close is reached through the shipped helper rather than by this suite poking the class.
ok(/try \{ kmNavClose_\(\); \} catch \(e\) \{\}/.test(APP), 'L4 showSection closes the drawer through kmNavClose_');
ok(typeof env.win.kmNavIsOpen === 'function', 'L4a which is the same helper the rest of the shell uses');

// -------------------------------------------------------------------------------------------------------------
console.log('\n----------------------------------------');
console.log('RESPONSIVE SHELL DRAWER (S8-B3-R3-CP2M-R3): ' + pass + ' passed, ' + fail + ' failed');
if (pass + fail === 0) { console.error('VACUOUS - no assertion executed'); process.exit(1); }
if (fail > 0) process.exitCode = 1;
