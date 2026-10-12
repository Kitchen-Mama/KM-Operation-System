// =============================================================================================================
// S8-B3-R3-CP2M — LATEST NAVIGATION WINS, FOR EVERY KIND OF NAVIGATION
// -------------------------------------------------------------------------------------------------------------
// THE DEFECT THIS SUITE WAS WRITTEN TO REPRODUCE. `_kmRouteNavSeq_` — the token covering the window BEFORE
// lifecycle.switchTo is reached — was incremented in ONE place: the lazy-route branch of showSection. A PLAIN
// page, Home, or any direct switchTo call therefore left it untouched, so a lazy route whose code was still in
// flight still believed it owned the screen when it landed, and called switchTo on its own section — pulling
// the operator back to the page they had already left.
//
// The epoch machinery in lifecycle.js was never the problem: it is correct, and every page guard built on it
// stays. The hole was that a whole CLASS of navigations never told it a navigation had begun.
//
// WHAT IS REAL HERE: assets/js/core/namespace.js, assets/js/core/lifecycle.js and assets/js/app.js, executed.
// The DOM, the script loader and the partial loader are stubs, because the race is about ORDERING and a stub is
// what lets a test hold a load open for exactly as long as it needs. No network, no browser, no wall-clock.
// =============================================================================================================
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

var pass = 0, fail = 0;
function ok(cond, label) { if (cond) { pass++; } else { fail++; console.log('FAIL ' + label); } }
function eq(a, b, label) { ok(a === b, label + '  (got ' + JSON.stringify(a) + ', expected ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }

var NAMESPACE = read('assets/js/core/namespace.js');
var LIFECYCLE = read('assets/js/core/lifecycle.js');
var APP = read('assets/js/app.js');

// =============================================================================================================
// A DOM THAT IS JUST REAL ENOUGH
// =============================================================================================================
function makeEl(id) {
    var el = {
        id: id, _cls: {}, children: [], parentNode: null, style: {}, innerHTML: '',
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

function makeHarness() {
    var sections = {};
    ['ops-section', 'global-logistics-map-section', 'site-priority-section',
     'product-strategy-board-section', 'carrier-rate-card-section', 'fc-summary-section',
     'home-section', 'forecast-section'].forEach(function (id) { sections[id] = makeEl(id); });

    var doc = {
        readyState: 'complete',
        body: makeEl('body'),
        documentElement: makeEl('html'),
        getElementById: function (id) { return sections[id] || null; },
        querySelector: function (s) {
            var m = String(s).match(/^#([\w-]+)$/);
            return m ? (sections[m[1]] || null) : null;
        },
        querySelectorAll: function (sel) {
            if (String(sel).indexOf('.module-section') !== -1) {
                return Object.keys(sections).map(function (k) { return sections[k]; });
            }
            return [];
        },
        createElement: function () { return makeEl(''); },
        addEventListener: function () {}, removeEventListener: function () {}
    };

    // THE LOADERS, HELD OPEN ON PURPOSE. `ensure` returns a promise this test resolves by hand, which is the
    // only way to express "the operator clicked away while the code was still downloading" without a clock.
    var flights = {};
    var loaded = {};
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
            return new Promise(function (resolve) { partialFlights[key] = function () { resolve(makeEl(key)); }; });
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
        addEventListener: function () {}, removeEventListener: function () {},
        location: { origin: 'https://example.invalid', hash: '', href: '' },
        navigator: { userAgent: 'node' },
        innerWidth: 1280, innerHeight: 800,
        matchMedia: function () { return { matches: false, addEventListener: function () {}, addListener: function () {} }; },
        requestAnimationFrame: function (fn) { return setTimeout(fn, 0); },
        cancelAnimationFrame: function (id) { clearTimeout(id); },
        performance: { now: function () { return 0; } },
        alert: function () {}
    };
    sb.window = sb;
    sb.globalThis = sb;
    sb.self = sb;

    var ctx = vm.createContext(sb);
    // The REAL namespace file creates KM.lifecycle; loading lifecycle.js without it would be testing a shape
    // this application never has.
    vm.runInContext(NAMESPACE, ctx, { filename: 'namespace.js' });
    vm.runInContext(LIFECYCLE, ctx, { filename: 'lifecycle.js' });
    sb.KM.scriptLoader = scriptLoader;
    sb.KM.partialLoader = partialLoader;
    vm.runInContext(APP, ctx, { filename: 'app.js' });

    var mounts = [], unmounts = [];
    function reg(id) {
        sb.KM.lifecycle.register(id, {
            mount: function (epoch) { mounts.push({ id: id, epoch: epoch }); },
            unmount: function (epoch) { unmounts.push({ id: id, epoch: epoch }); }
        });
    }
    ['ops-section', 'carrier-rate-card-section', 'home-section', 'site-priority-section',
     'product-strategy-board-section', 'global-logistics-map-section', 'fc-summary-section'].forEach(reg);

    return {
        ctx: ctx, sb: sb, doc: doc, sections: sections,
        flights: flights, partialFlights: partialFlights,
        mounts: mounts, unmounts: unmounts,
        showSection: function (s) { return ctx.showSection(s); },
        current: function () { return sb.KM.lifecycle.getCurrentPage(); },
        activeIds: function () {
            return Object.keys(sections).filter(function (k) { return sections[k].classList.contains('active'); });
        }
    };
}

// =============================================================================================================
// Every case below asks the same question — after a superseded load lands, is the operator still where they
// chose? They are separate cases because each reaches showSection by a DIFFERENT path, and the defect was that
// only one of those paths ever declared a navigation.
// =============================================================================================================
var QUEUE = [];
function scenario(name, fn) { QUEUE.push({ name: name, fn: fn }); }
function tick() { return Promise.resolve().then(function () {}).then(function () {}).then(function () {}); }

scenario('A. lazy route superseded by a PLAIN page', function () {
    var h = makeHarness();
    h.showSection('ops');
    eq(h.current(), null, 'A1 the lazy route has not mounted yet — its code is still in flight');
    h.showSection('carrier-rate-card');
    eq(h.current(), 'carrier-rate-card-section', 'A2 the plain route mounts at once and owns the screen');
    h.flights['ops'](true);
    return tick().then(function () {
        eq(h.current(), 'carrier-rate-card-section',
            'A3 after the superseded route completes, the operator is STILL on the page they chose');
        eq(h.mounts.filter(function (m) { return m.id === 'ops-section'; }).length, 0,
            'A3a and the superseded route never mounted');
        eq(h.activeIds().indexOf('ops-section'), -1, 'A3b nor marked its own section active');
        ok(h.activeIds().length <= 1, 'A3c at most one section is active');
    });
});

scenario('B. lazy superseded by ANOTHER lazy route', function () {
    var h = makeHarness();
    h.showSection('ops');
    h.showSection('site-priority');
    h.flights['site-priority'](true);
    return tick().then(function () {
        eq(h.current(), 'site-priority-section', 'B1 the newer lazy route mounts when it lands');
        h.flights['ops'](true);
        return tick();
    }).then(function () {
        eq(h.current(), 'site-priority-section', 'B2 the OLDER route landing later does not take the screen');
        eq(h.mounts.filter(function (m) { return m.id === 'ops-section'; }).length, 0, 'B2a and never mounts');
    });
});

scenario('C. A then B then A, with the first load landing last', function () {
    var h = makeHarness();
    h.showSection('ops');
    h.showSection('carrier-rate-card');
    h.showSection('ops');
    eq(h.current(), 'carrier-rate-card-section', 'C1 A is still loading, so B is still on screen');
    h.flights['ops'](true);
    return tick().then(function () {
        eq(h.current(), 'ops-section', 'C2 A mounts, because the NEWEST intent is A');
        eq(h.mounts.filter(function (m) { return m.id === 'ops-section'; }).length, 1,
            'C2a mounted exactly ONCE despite two navigations to it');
    });
});

scenario('D. Home revokes a pending lazy route', function () {
    var h = makeHarness();
    h.showSection('ops');
    h.sb.KM.lifecycle.switchTo('home-section');
    eq(h.current(), 'home-section', 'D1 Home takes the screen immediately');
    h.flights['ops'](true);
    return tick().then(function () {
        eq(h.current(), 'home-section', 'D2 the superseded route landing later does not displace Home');
        eq(h.mounts.filter(function (m) { return m.id === 'ops-section'; }).length, 0, 'D2a nor mounts');
    });
});

scenario('E. Product Strategy board, superseded', function () {
    var h = makeHarness();
    h.showSection('product-strategy');
    h.showSection('fc-summary');
    h.flights['product-strategy'](true);
    return tick().then(function () {
        eq(h.current(), 'fc-summary-section', 'E1 the board landing late does not displace the chosen page');
        eq(h.activeIds().indexOf('product-strategy-board-section'), -1, 'E1a nor activates its section');
    });
});

scenario('F. a superseded PARTIAL must not reveal its shell', function () {
    var h = makeHarness();
    h.showSection('global-logistics-map');
    h.showSection('carrier-rate-card');
    if (h.partialFlights['global-logistics-map']) h.partialFlights['global-logistics-map']();
    return tick().then(function () {
        eq(h.activeIds().indexOf('global-logistics-map-section'), -1,
            'F1 the superseded markup does not mark its section active');
        eq(h.current(), 'carrier-rate-card-section', 'F1a and the chosen page still owns the screen');
    });
});

scenario('G. a superseded route that FAILS paints no refusal', function () {
    var h = makeHarness();
    h.showSection('ops');
    h.showSection('carrier-rate-card');
    h.flights['ops'](false);
    return tick().then(function () {
        eq(h.current(), 'carrier-rate-card-section', 'G1 the chosen page is untouched');
        eq(h.sections['ops-section'].children.length, 0, 'G1a and no refusal box was painted');
    });
});

scenario('H. re-clicking the current page revokes a pending route', function () {
    var h = makeHarness();
    h.showSection('carrier-rate-card');
    h.showSection('ops');
    h.showSection('carrier-rate-card');
    h.flights['ops'](true);
    return tick().then(function () {
        eq(h.current(), 'carrier-rate-card-section', 'H1 the operator stays where they said to stay');
        eq(h.mounts.filter(function (m) { return m.id === 'carrier-rate-card-section'; }).length, 1,
            'H1a and the re-click did NOT mount it a second time');
    });
});

scenario('I. a refused click is not a navigation and revokes nothing', function () {
    var h = makeHarness();
    h.showSection('ops');
    h.showSection('overseas-inbound');
    h.flights['ops'](true);
    return tick().then(function () {
        eq(h.current(), 'ops-section',
            'I1 the pending route still mounts — a refused click leaves the operator where they were');
    });
});

scenario('J. a burst leaves one mount and no duplicates', function () {
    var h = makeHarness();
    h.showSection('carrier-rate-card');
    h.showSection('fc-summary');
    h.showSection('carrier-rate-card');
    h.showSection('fc-summary');
    return tick().then(function () {
        eq(h.current(), 'fc-summary-section', 'J1 the last navigation wins');
        var fcM = h.mounts.filter(function (m) { return m.id === 'fc-summary-section'; }).length;
        var fcU = h.unmounts.filter(function (m) { return m.id === 'fc-summary-section'; }).length;
        eq(fcM - fcU, 1, 'J2 fc-summary is mounted exactly once, net');
        var crM = h.mounts.filter(function (m) { return m.id === 'carrier-rate-card-section'; }).length;
        var crU = h.unmounts.filter(function (m) { return m.id === 'carrier-rate-card-section'; }).length;
        eq(crM - crU, 0, 'J2a and the page left behind is fully unmounted');
        ok(h.activeIds().length <= 1, 'J3 at most one section is active');
    });
});

scenario('K. the guard itself, exercised directly', function () {
    var h = makeHarness();
    var lc = h.sb.KM.lifecycle;
    var t1 = lc.beginNavigation();
    var t2 = lc.beginNavigation();
    eq(lc.isCurrentNavigation(t1), false, 'K1 an older intent is not current');
    eq(lc.isCurrentNavigation(t2), true, 'K1a the newest one is');
    lc.switchTo('carrier-rate-card-section', t1);
    eq(h.current(), null, 'K2 switchTo with a STALE token commits nothing');
    lc.switchTo('carrier-rate-card-section', t2);
    eq(h.current(), 'carrier-rate-card-section', 'K2a switchTo with the current token commits');
    var t3 = lc.currentNavigation();
    lc.switchTo('fc-summary-section');
    eq(lc.isCurrentNavigation(t3), false, 'K3 a tokenless switchTo bumps the intent — the safe default');
    eq(h.current(), 'fc-summary-section', 'K3a and commits');
    return Promise.resolve();
});

scenario('L. source contract', function () {
    var app = read('assets/js/app.js');
    var lifecycle = read('assets/js/core/lifecycle.js');
    ok(app.indexOf('var nav = _kmBeginNav_();') !== -1,
        'L1 showSection declares the navigation once, outside the lazy-route branch');
    ok(app.indexOf('var myNav = ++_kmRouteNavSeq_;') === -1,
        'L2 the old per-branch bump is GONE — its presence IS the defect');
    ok(app.indexOf('switchTo(targetSectionId, nav.token)') !== -1,
        'L3 the plain path hands its token to switchTo');
    ok(app.indexOf('switchTo(routeAssets.sectionId, nav.token)') !== -1,
        'L4 and so does the lazy path');
    ok(lifecycle.indexOf('KM.lifecycle.beginNavigation') !== -1, 'L5 lifecycle owns the intent token');
    ok(lifecycle.indexOf('navToken === undefined || navToken === null') !== -1,
        'L6 a tokenless switchTo is a FRESH intent — the safe default');
    ok(lifecycle.indexOf('_navEpoch') !== -1, 'L7 the existing epoch machinery is retained, not replaced');
    ok(lifecycle.indexOf('commitGuard') !== -1, 'L7a including commitGuard, which pages depend on');
    ok(lifecycle.indexOf('releaseListenerScope') !== -1, 'L7b and the listener-scope ownership from S4-R2');
    return Promise.resolve();
});

// =============================================================================================================
(function run() {
    var p = Promise.resolve();
    QUEUE.forEach(function (sc) {
        p = p.then(function () {
            section(sc.name);
            return sc.fn();
        }).catch(function (e) { fail++; console.log('FAIL ' + sc.name + ' threw: ' + e.message); });
    });
    return p.then(function () {
        console.log('\n----------------------------------------');
        console.log('NAVIGATION LATEST-WINS (S8-B3-R3-CP2M): ' + pass + ' passed, ' + fail + ' failed');
        if (pass + fail === 0) { console.error('VACUOUS - no assertion executed'); process.exit(1); }
        if (fail > 0) process.exit(1);
    });
})();
