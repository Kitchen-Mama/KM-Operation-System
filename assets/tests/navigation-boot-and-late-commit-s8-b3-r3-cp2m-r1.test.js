// =============================================================================================================
// S8-B3-R3-CP2M-R1 — THE THREE RACES CP2M LEFT OPEN
// -------------------------------------------------------------------------------------------------------------
// CP2M made every valid navigation declare itself, which closed the case where a LATE ROUTE took the screen
// back. Three ways to lose a navigation survived it, and all three are about a commit that is allowed because
// nobody asked the right question at the right moment:
//
//   A. THE BOOT FORCES HOME. app.js's DOMContentLoaded ends with switchTo('home-section'). Under CP2M a
//      tokenless switchTo is a FRESH intent — correct for the Home logo, wrong for a boot step — so it both
//      revokes a route the operator is waiting for and drags them to Home from a page they already chose.
//
//   B. A LATE HOME PARTIAL REDRAWS HOME. home.js's mount does `_ensureHomeMarkup().then(...)` with NO epoch
//      guard, so a partial landing after the operator left calls setHomeShellVisible(true) and renderHomepage()
//      over whatever is now on screen.
//
//   C. THE OLD PAGE COMMITS DURING THE GAP. Between a lazy route declaring its intent and reaching switchTo,
//      `_navEpoch` and `_activeSectionId` still name the OLD page — so the old page's own async `.then` passes
//      commitGuard and paints, even though a newer navigation is already under way.
//
// WHAT IS REAL HERE: namespace.js, lifecycle.js, app.js and home.js, all executed. The DOM, the loaders and
// DataRepo are stubs; the navigation authority, the boot handler and Home's mount are production code.
// =============================================================================================================
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

// S8-B3-R3-CP2M-R3 — THE PLAIN-PAGE FIXTURE MOVED, AND THE SUITE DID NOT CHANGE WHAT IT TESTS.
// These assertions need a page that mounts SYNCHRONOUSLY: no scriptLoader.ensure, no partial, nothing
// asynchronous between the click and switchTo. carrier-rate-card was that page until CP2M-R3 moved it
// into KM_ROUTE_ASSETS_, at which point it became a lazy route and "mounts at once" stopped being true
// of it. fc-summary is still plain -- the census blocks it from route-ownership on cross-file
// references and its own DOMContentLoaded handler -- and was already in this harness's section list.
var pass = 0, fail = 0;
function ok(cond, label) { if (cond) { pass++; } else { fail++; console.log('FAIL ' + label); } }
function eq(a, b, label) { ok(a === b, label + '  (got ' + JSON.stringify(a) + ', expected ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }

var NAMESPACE = read('assets/js/core/namespace.js');
var LIFECYCLE = read('assets/js/core/lifecycle.js');
var APP = read('assets/js/app.js');
var HOME = read('assets/js/pages/home.js');

// =============================================================================================================
function makeEl(id) {
    var el = {
        id: id, _cls: {}, children: [], parentNode: null, style: {}, innerHTML: '', textContent: '',
        hidden: false,
        classList: {
            add: function (c) { el._cls[c] = 1; },
            remove: function (c) { delete el._cls[c]; },
            contains: function (c) { return !!el._cls[c]; }
        },
        appendChild: function (c) { el.children.push(c); c.parentNode = el; return c; },
        removeChild: function (c) { el.children = el.children.filter(function (x) { return x !== c; }); return c; },
        querySelector: function () { return null; },
        querySelectorAll: function () { return []; },
        addEventListener: function () {}, removeEventListener: function () {},
        setAttribute: function () {}, getAttribute: function () { return null; },
        closest: function () { return null; }
    };
    return el;
}

function makeHarness(opts) {
    opts = opts || {};
    var sections = {};
    ['ops-section', 'carrier-rate-card-section', 'fc-summary-section',
     'site-priority-section', 'product-strategy-board-section'].forEach(function (id) { sections[id] = makeEl(id); });
    // Home's markup is PARTIAL-LOADED, so #home-section must be ABSENT until the partial lands — that absence
    // is what sends _ensureHomeMarkup through the loader and makes race B expressible at all.
    var homeMounted = false;

    var domCalls = { setHomeShellVisible: [], renderHomepage: 0 };

    var doc = {
        readyState: 'loading',
        body: makeEl('body'), documentElement: makeEl('html'),
        getElementById: function (id) {
            if (id === 'home-section') return homeMounted ? sections['home-section'] : null;
            return sections[id] || null;
        },
        querySelector: function (s) {
            var m = String(s).match(/^#([\w-]+)$/);
            return m ? doc.getElementById(m[1]) : null;
        },
        querySelectorAll: function (sel) {
            if (String(sel).indexOf('.module-section') !== -1) {
                return Object.keys(sections).map(function (k) { return sections[k]; });
            }
            return [];
        },
        createElement: function () { return makeEl(''); },
        _domReadyHandlers: [],
        addEventListener: function (type, fn) { if (type === 'DOMContentLoaded') doc._domReadyHandlers.push(fn); },
        removeEventListener: function () {}
    };

    var flights = {}, loaded = {};
    var scriptLoader = {
        isLoaded: function (k) { return !!loaded[k]; },
        ensure: function (key) {
            return new Promise(function (resolve) {
                flights[key] = function (okFlag) { loaded[key] = okFlag !== false; resolve(okFlag !== false); };
            });
        }
    };
    var partialFlights = {};
    var partialLoader = {
        loadPartial: function (key) {
            return new Promise(function (resolve) {
                partialFlights[key] = function () {
                    if (key === 'home') { sections['home-section'] = makeEl('home-section'); homeMounted = true; }
                    resolve(makeEl(key));
                };
            });
        }
    };

    var sb = {
        console: { log: function () {}, warn: function () {}, error: function () {} },
        JSON: JSON, Math: Math, Date: Date, Promise: Promise, Object: Object, Array: Array,
        String: String, Number: Number, Boolean: Boolean, RegExp: RegExp, Error: Error,
        isFinite: isFinite, isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat,
        setTimeout: setTimeout, clearTimeout: clearTimeout,
        setInterval: function () { return 0; }, clearInterval: function () {},
        document: doc,
        localStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} },
        fetch: function () { return Promise.resolve({ ok: true, text: function () { return Promise.resolve(''); } }); },
        // app.js registers its boot handler on WINDOW, not document. Capturing document's would make every
        // boot assertion below vacuous -- the handler would simply never run.
        _winReadyHandlers: [],
        addEventListener: function (type, fn) { if (type === 'DOMContentLoaded') sb._winReadyHandlers.push(fn); },
        removeEventListener: function () {},
        location: { origin: 'https://example.invalid', hash: opts.hash || '', href: '' },
        navigator: { userAgent: 'node' }, innerWidth: 1280, innerHeight: 800,
        matchMedia: function () { return { matches: false, addEventListener: function () {}, addListener: function () {} }; },
        requestAnimationFrame: function (fn) { return setTimeout(fn, 0); },
        cancelAnimationFrame: function (id) { clearTimeout(id); },
        performance: { now: function () { return 0; } }, alert: function () {},
        // Home reads every panel through this one repository; the real shapes are irrelevant to a navigation test.
        DataRepo: {
            getAnnouncements: function () { return []; }, getUrgentIssues: function () { return []; },
            getPersonalTodos: function () { return []; }, getEvents: function () { return []; },
            getGoalData: function () { return { year: 2026, goalAmount: 1, salesAmount: 0 }; }
        }
    };
    sb.window = sb; sb.globalThis = sb; sb.self = sb;

    var ctx = vm.createContext(sb);
    vm.runInContext(NAMESPACE, ctx, { filename: 'namespace.js' });
    vm.runInContext(LIFECYCLE, ctx, { filename: 'lifecycle.js' });
    sb.KM.scriptLoader = scriptLoader;
    sb.KM.partialLoader = partialLoader;
    vm.runInContext(APP, ctx, { filename: 'app.js' });

    // The two Home side effects this suite watches, intercepted on the global object exactly where the
    // production call sites resolve them.
    sb.setHomeShellVisible = function (v) { domCalls.setHomeShellVisible.push(!!v); };
    vm.runInContext(HOME, ctx, { filename: 'home.js' });
    var realRender = sb.renderHomepage;
    sb.renderHomepage = function () { domCalls.renderHomepage++; try { realRender(); } catch (e) {} };

    var mounts = [], unmounts = [], lastEpoch = {};
    ['ops-section', 'carrier-rate-card-section', 'fc-summary-section', 'site-priority-section'].forEach(function (id) {
        sb.KM.lifecycle.register(id, {
            mount: function (epoch) { mounts.push({ id: id, epoch: epoch }); lastEpoch[id] = epoch; },
            unmount: function (epoch) { unmounts.push({ id: id, epoch: epoch }); }
        });
    });

    return {
        ctx: ctx, sb: sb, doc: doc, sections: sections, domCalls: domCalls,
        flights: flights, partialFlights: partialFlights, mounts: mounts, unmounts: unmounts,
        lastEpoch: lastEpoch,
        showSection: function (s) { return ctx.showSection(s); },
        fireDomReady: function () {
            doc.readyState = 'complete';
            doc._domReadyHandlers.forEach(function (fn) { try { fn(); } catch (e) {} });
            sb._winReadyHandlers.forEach(function (fn) { try { fn(); } catch (e) {} });
        },
        bootHandlerCount: function () { return sb._winReadyHandlers.length + doc._domReadyHandlers.length; },
        current: function () { return sb.KM.lifecycle.getCurrentPage(); }
    };
}

var QUEUE = [];
function scenario(name, fn) { QUEUE.push({ name: name, fn: fn }); }
function tick() { var p = Promise.resolve(); for (var i = 0; i < 6; i++) p = p.then(function () {}); return p; }

// =============================================================================================================
scenario('A. the boot must not drag the operator back to Home', function () {
    var h = makeHarness();
    // Home takes the initial route in Phase 0 (home.js does this at load), then the operator picks a page
    // BEFORE the deferred script chain finishes and DOMContentLoaded fires.
    ok(h.bootHandlerCount() > 0,
       'A0 (non-vacuity) a boot handler was actually registered — otherwise every A assertion is empty');
    h.showSection('fc-summary');
    eq(h.current(), 'fc-summary-section', 'A1 the operator is on the page they chose');

    h.fireDomReady();          // app.js's boot handler, arriving late in the chain
    return tick().then(function () {
        eq(h.current(), 'fc-summary-section',
            'A2 the boot does NOT force the operator back to Home');
        eq(h.domCalls.renderHomepage, 0, 'A2a and Home is not re-rendered over their page');
    });
});

scenario('A2. the boot must not revoke a route the operator is waiting for', function () {
    var h = makeHarness();
    h.showSection('ops');                 // lazy: intent declared, code still downloading
    h.fireDomReady();                     // the boot fires while that route is in flight
    h.flights['ops'](true);               // the route finally lands
    return tick().then(function () {
        eq(h.current(), 'ops-section',
            'A3 the route the operator asked for still mounts — the boot did not revoke it');
        eq(h.mounts.filter(function (m) { return m.id === 'ops-section'; }).length, 1, 'A3a exactly once');
    });
});

scenario('A3. with no navigation at all, the boot still mounts Home', function () {
    var h = makeHarness();
    h.fireDomReady();
    return tick().then(function () {
        eq(h.current(), 'home-section', 'A4 (non-vacuity) an untouched boot still lands on Home');
    });
});

// =============================================================================================================
scenario('B. a late Home partial must not redraw Home over the new page', function () {
    var h = makeHarness();
    // Home mounted in Phase 0 and its partial is still in the air.
    eq(h.current(), 'home-section', 'B1 Home took the initial route');
    var shellCallsBefore = h.domCalls.setHomeShellVisible.length;

    h.showSection('fc-summary');        // the operator leaves before the markup lands
    eq(h.current(), 'fc-summary-section', 'B2 and is now on another page');

    if (h.partialFlights['home']) h.partialFlights['home']();   // the Home partial finally arrives
    return tick().then(function () {
        var revealed = h.domCalls.setHomeShellVisible.slice(shellCallsBefore).filter(function (v) { return v === true; });
        eq(revealed.length, 0, 'B3 the late partial does NOT reveal the Home shell');
        eq(h.domCalls.renderHomepage, 0, 'B3a and does NOT render Home');
        eq(h.current(), 'fc-summary-section', 'B3b the operator stays where they are');
    });
});

scenario('B2. a Home partial that lands while Home is STILL current does render', function () {
    var h = makeHarness();
    eq(h.current(), 'home-section', 'B4 Home is current');
    if (h.partialFlights['home']) h.partialFlights['home']();
    return tick().then(function () {
        ok(h.domCalls.renderHomepage > 0,
            'B5 (non-vacuity) Home still renders when it is the page the operator is on');
        ok(h.domCalls.setHomeShellVisible.indexOf(true) !== -1, 'B5a and its shell is revealed');
    });
});

// =============================================================================================================
scenario('C. the old page may not commit while a newer navigation is under way', function () {
    var h = makeHarness();
    h.showSection('fc-summary');
    var myEpoch = h.lastEpoch['fc-summary-section'];
    var lc = h.sb.KM.lifecycle;
    eq(lc.commitGuard(myEpoch, 'fc-summary-section'), true,
        'C1 while it is the current page, its async work may commit');

    // The operator clicks a LAZY route: the intent is declared, but switchTo will not run until the code
    // lands. This is the gap — and during it the old page used to still be told "yes, you may paint".
    h.showSection('ops');
    eq(lc.commitGuard(myEpoch, 'fc-summary-section'), false,
        'C2 once a newer navigation has BEGUN, the old page may no longer commit');
    eq(lc.isCurrent(myEpoch), false, 'C2a and it is no longer current by the epoch test either');

    h.flights['ops'](true);
    return tick().then(function () {
        eq(h.current(), 'ops-section', 'C3 the new route mounts');
        eq(lc.commitGuard(myEpoch, 'fc-summary-section'), false,
            'C3a and the old page still may not commit afterwards');
        var opsEpoch = h.lastEpoch['ops-section'];
        eq(lc.commitGuard(opsEpoch, 'ops-section'), true,
            'C3b while the page that DID arrive may — the guard is not simply stuck shut');
    });
});

scenario('C2. an abandoned navigation must not jam the guard shut forever', function () {
    var h = makeHarness();
    h.showSection('fc-summary');
    var myEpoch = h.lastEpoch['fc-summary-section'];
    var lc = h.sb.KM.lifecycle;
    // A section with no route and no sectionMap entry: showSection declares an intent and then finds nothing
    // to switch to. If that intent were left pending, EVERY page would be frozen out of committing for ever.
    h.showSection('a-section-that-does-not-exist');
    return tick().then(function () {
        eq(lc.commitGuard(myEpoch, 'fc-summary-section'), true,
            'C4 an abandoned navigation releases the guard — the current page can still commit');
        eq(h.current(), 'fc-summary-section', 'C4a and the operator is still where they were');
    });
});

// =============================================================================================================
scenario('D. source contract — one authority, no second router, no hidden-DOM cover-up', function () {
    var app = read('assets/js/app.js');
    var lifecycle = read('assets/js/core/lifecycle.js');
    var home = read('assets/js/pages/home.js');
    ok(lifecycle.indexOf('switchToInitial') !== -1, 'D1 the boot route is a declared INITIAL navigation');
    ok(lifecycle.indexOf('abandonNavigation') !== -1, 'D2 and an abandoned one can be released');
    ok(/_committedIntent/.test(lifecycle), 'D3 the guard knows a newer intent is pending');
    ok(home.indexOf('commitGuard') !== -1, 'D4 Home guards its own late partial');
    // The two things the task forbids: a second routing mechanism, and hiding a stale commit instead of
    // refusing it. A page that still rendered and was then hidden would still have run its listeners.
    ok(!/history\.pushState|popstate|new Router|location\.hash\s*=/.test(app),
        'D5 no second router was introduced');
    ok(lifecycle.indexOf('releaseListenerScope') !== -1, 'D6 listener cleanup is retained');
    ok(lifecycle.indexOf('commitGuard') !== -1, 'D6a and so is the single commit authority');
    ok(app.indexOf('_kmNavSuperseded_') !== -1, 'D6b and the single-flight route guard');
    return Promise.resolve();
});

// =============================================================================================================
(function run() {
    var p = Promise.resolve();
    QUEUE.forEach(function (sc) {
        p = p.then(function () { section(sc.name); return sc.fn(); })
             .catch(function (e) { fail++; console.log('FAIL ' + sc.name + ' threw: ' + e.message); });
    });
    return p.then(function () {
        console.log('\n----------------------------------------');
        console.log('NAVIGATION BOOT + LATE COMMIT (S8-B3-R3-CP2M-R1): ' + pass + ' passed, ' + fail + ' failed');
        if (pass + fail === 0) { console.error('VACUOUS - no assertion executed'); process.exit(1); }
        if (fail > 0) process.exit(1);
    });
})();
