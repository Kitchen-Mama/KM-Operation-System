// MAP-VISUAL-REAL-EARTH-TEXTURE-3-R8 — ADM1 CONTENT-PINNED CACHE CLOSURE.
//
// R7 landed the Map Texture 3 line on main and found one deployment blocker on the way out: of every browser
// file the map page fetches, exactly one is invisible to index.html — assets/js/data/world-admin1-10m.js, the
// 0.58 MB division geometry, injected at runtime by the map page when the zoom first calls for it. Because
// index.html never names it, it never received a cache-busting token when the rest of the map set was versioned.
// And it CHANGED on this line (18e46bb rebuilt the boundaries), so a returning browser holding the old copy
// would keep drawing old divisions against a globe and a resolver that had both moved. R7's only available
// advice was "hard refresh", which is advice, not a deployment policy.
//
// THE IDENTITY IS THE CONTENT, NOT THE ROUND. A round label has to be remembered; a digest cannot be forgotten.
// Change the asset and the URL changes, so the browser refetches. Change nothing and the URL is stable, so
// nobody refetches half a megabyte for a round that did not touch it. Every expectation below is DERIVED from
// the asset's actual bytes — this suite pins no digest of its own, because a hand-copied digest in a second
// place is the thing that goes stale.
//
// AND "THE BYTES" HAD TO BECOME ONE ANSWER FIRST. Measured on this checkout, the asset was 594,783 bytes in git
// and 594,791 on disk: core.autocrlf had added one CR per line, so the working copy digest bd17f938… was not
// the digest of anything GitHub Pages serves. A token derived from the working copy would have been a property
// of the developer's git config rather than of the asset. .gitattributes now excludes this file from
// translation, and §A below asserts the file carries no CR byte at all, so a clone that loses that rule fails
// here loudly instead of minting a token for bytes nobody serves.
//
// Run: node assets/tests/adm1-content-pinned-cache-texture-3-r8.test.js

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var crypto = require('crypto');
var ROOT = path.join(__dirname, '..', '..');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(t) { console.log('\n== ' + t + ' =='); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function readBytes(rel) { return fs.readFileSync(path.join(ROOT, rel)); }
// Comments are prose. A name mentioned in a comment must never satisfy a check about a name USED.
function code(src) {
    return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1 ');
}
function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

var RO = require(path.join(ROOT, 'assets/tests/_release-order.js'));
var ADM1_REL = 'assets/js/data/world-admin1-10m.js';
var MAP_PAGE_REL = 'assets/js/pages/global-logistics-map.js';
var MAP_SRC = read(MAP_PAGE_REL);
var MAP_C = code(MAP_SRC);
var INDEX = read('index.html');
var ADM1_BYTES = readBytes(ADM1_REL);

// THE ONE DERIVATION IN THIS FILE. Everything downstream compares against this and nothing restates it.
function tokenFor(buf) { return 'adm1-10m-' + sha256(buf).slice(0, 12); }
var EXPECTED_TOKEN = tokenFor(ADM1_BYTES);
var EXPECTED_URL = ADM1_REL + '?v=' + EXPECTED_TOKEN;

// ================================================================================================================
section('§A — the asset\'s content identity, derived from the asset');
// ================================================================================================================
// The digest is only meaningful if the file on disk is the file that ships. autocrlf made that false once.
eq(ADM1_BYTES.length, fs.statSync(path.join(ROOT, ADM1_REL)).size, 'A1 the asset was read whole');
ok(ADM1_BYTES.indexOf(0x0d) === -1,
    'A2 the asset carries NO CR byte, so disk bytes are the bytes GitHub Pages serves (.gitattributes R8 rule)');
ok(/^assets\/js\/data\/world-admin1-10m\.js\s+-text$/m.test(read('.gitattributes')),
    'A2b and that rule is actually present, scoped to this one asset');
ok(/^[0-9a-f]{64}$/.test(sha256(ADM1_BYTES)), 'A3 the digest is lowercase hex');
eq(EXPECTED_TOKEN.length, 'adm1-10m-'.length + 12, 'A4 the token is the prefix plus 12 hex characters');
ok(/^adm1-10m-[0-9a-f]{12}$/.test(EXPECTED_TOKEN), 'A4b and matches the documented shape (' + EXPECTED_TOKEN + ')');
// NOT a date, NOT a size, NOT a release label — those are the four things §A forbids.
ok(!/20\d{6}/.test(EXPECTED_TOKEN), 'A5 the token contains no date');
ok(EXPECTED_TOKEN.indexOf(String(ADM1_BYTES.length)) === -1, 'A5b and is not the file size');
ok(EXPECTED_TOKEN.indexOf('texture3') === -1 && EXPECTED_TOKEN.indexOf('r8') === -1,
    'A5c and is not a round label — it must not move when a round moves');
ok(EXPECTED_TOKEN.indexOf('fb4er4br3') === -1, 'A5d and is not the application release token');

// §D.2 — CONTENT SENSITIVITY, PROVEN ON A THROWAWAY FIXTURE. A digest that did not change when the bytes
// changed would satisfy every other assertion here and defeat the entire purpose.
(function () {
    var a = Buffer.from('KM_WORLD_ADMIN1 fixture: one two three four five', 'utf8');
    var b = Buffer.from(a);
    b[10] = b[10] ^ 0x01;               // exactly one bit of one byte
    eq(a.length, b.length, 'A6 the fixture pair differs by content only, not length');
    ok(tokenFor(a) !== tokenFor(b), 'A6b one flipped bit changes the token (' + tokenFor(a) + ' -> ' + tokenFor(b) + ')');
    // And the reverse direction: identical bytes must produce an identical token, or the URL would churn.
    eq(tokenFor(Buffer.from(a)), tokenFor(a), 'A6c while identical bytes produce an identical token');
    // A truncated copy too — the failure mode of a half-written deploy.
    ok(tokenFor(a.slice(0, a.length - 1)) !== tokenFor(a), 'A6d and a truncated copy is a different identity');
})();

// §D.3 — R8 DID NOT TOUCH THE ASSET. This is a cache fix, not a data fix; if the geometry moved, every capture
// and every border digest in R2–R6 would need re-verification.
(function () {
    // The asset is inert data that assigns one global. R8 added no loader, no fetch, no token to the DATA file:
    // the identity lives entirely in the consumer, which is what let this change be zero-risk to the geometry.
    var A = read(ADM1_REL);
    ok(!/fetch\(|XMLHttpRequest|document\.createElement|\?v=/.test(A),
        'A7 the asset itself gained no loader and no version marker — the token lives in the consumer');
    ok(A.indexOf('TEXTURE-3-R8') === -1, 'A7b and carries no R8 marker, because R8 did not change it');
    ok(/KM_WORLD_ADMIN1/.test(A), 'A7c and still assigns the one global the loader waits for');
    eq(ADM1_BYTES.length, 594783, 'A8 the asset is its committed length in bytes');
    // AND NO DIGEST PIN HERE, DELIBERATELY. The first draft of this suite asserted the leading hex of the
    // digest, which is a hand-maintained copy of the identity in a second place — precisely what A9b below
    // forbids and what §A rules out. It was also redundant twice over: B1 already asserts that the token the
    // loader DECLARES equals the token DERIVED from these bytes, which is the invariant that matters, and the
    // integrity of the geometry itself is owned by the suites that measure it — globe-canonical-topology
    // (edge counts, feature identity, classification) and globe-admin1-lod (meta stats, coordinate scale).
    // A cache suite asserting a data digest would be a second owner of a question it cannot answer better.
})();

// The digest must exist in exactly ONE runtime place. Two copies is the defect this repo has now spent three
// rounds removing from its cache rules.
(function () {
    var hits = [];
    ['assets/js/pages/global-logistics-map.js', 'index.html', 'assets/js/lib/km-globe.js',
     'assets/js/core/geo-name-resolver.js', 'assets/tests/_release-order.js'].forEach(function (rel) {
        var n = (read(rel).match(new RegExp(EXPECTED_TOKEN, 'g')) || []).length;
        if (n) hits.push(rel + ' x' + n);
    });
    eq(hits, [MAP_PAGE_REL + ' x1'], 'A9 the digest is declared exactly once, in the loader that uses it');
    // And this suite derives it rather than restating it: the literal digest appears here only inside the
    // committed-length cross-check above, never as the token the loader is compared against.
    var self = read('assets/tests/adm1-content-pinned-cache-texture-3-r8.test.js');
    eq((code(self).match(new RegExp(EXPECTED_TOKEN.replace('adm1-10m-', ''), 'g')) || []).length, 0,
        'A9b and this suite pins no copy of the digest of its own');
})();

// ================================================================================================================
section('§B — the loader, executed');
// ================================================================================================================
// The loader is lifted out of the page by brace-matching from the real source and RUN, rather than described.
// Booting the whole map page would drag in the globe, the API adapter and a WebGL context to answer a question
// about four functions.
function extractFn(name, src) {
    var i = src.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('not found: ' + name);
    var depth = 0, started = false;
    for (var j = i; j < src.length; j++) {
        if (src[j] === '{') { depth++; started = true; }
        else if (src[j] === '}') { depth--; if (started && depth === 0) return src.slice(i, j + 1); }
    }
    throw new Error('unbalanced: ' + name);
}
function decl(re, src, label) {
    var m = re.exec(src);
    if (!m) throw new Error('declaration not found: ' + label);
    return m[0];
}
function loaderCode(src) {
    return [
        decl(/var ADM1_ASSET_PATH\s*=\s*[^;]+;/, src, 'ADM1_ASSET_PATH'),
        decl(/var ADM1_ASSET_TOKEN\s*=\s*[^;]+;/, src, 'ADM1_ASSET_TOKEN'),
        extractFn('adm1AssetUrl', src),
        decl(/var adm1LoadedToken\s*=\s*[^;]+;/, src, 'adm1LoadedToken'),
        extractFn('adm1ScriptEl', src),
        extractFn('ensureAdmin1Asset', src)
    ].join('\n');
}
var LOADER_CODE = loaderCode(MAP_SRC);

// A DOM faithful in the two ways that matter: getAttribute('src') returns the RELATIVE string that was set (a
// real browser's el.src would resolve to absolute, which is why the loader compares the attribute), and
// querySelectorAll honours the selector the loader actually writes rather than a hard-coded guess.
function makeDom() {
    var head = { childNodes: [] };
    head.appendChild = function (el) { el.parentNode = head; head.childNodes.push(el); };
    head.removeChild = function (el) {
        var i = head.childNodes.indexOf(el);
        if (i === -1) throw new Error('removeChild: not a child');
        head.childNodes.splice(i, 1); el.parentNode = null;
    };
    function mkEl(tag) {
        return {
            tag: tag, parentNode: null, _attrs: {}, _settled: false,
            get src() { return this._attrs.src; },
            set src(v) { this._attrs.src = String(v); },
            getAttribute: function (n) { return this._attrs[n] === undefined ? null : this._attrs[n]; },
            setAttribute: function (n, v) { this._attrs[n] = String(v); }
        };
    }
    var doc = {
        head: head,
        createElement: mkEl,
        querySelectorAll: function (sel) {
            var m = /^script\[src\*="([^"]+)"\]$/.exec(String(sel));
            if (!m) throw new Error('the stub only models the selector the loader writes, got: ' + sel);
            var needle = m[1];
            return head.childNodes.filter(function (el) {
                return el.tag === 'script' && String(el._attrs.src || '').indexOf(needle) !== -1;
            });
        },
        querySelector: function () { return null; },
        _mkEl: mkEl
    };
    return doc;
}
// Runs the loader in a context we control, and hands back the levers a test needs.
function harness(opts) {
    opts = opts || {};
    var src = opts.src || MAP_SRC;
    var doc = makeDom();
    var win = { KM_WORLD_ADMIN1: opts.inMemory || null };
    var state = { admin1AssetState: opts.state || 'IDLE', admin1AssetError: opts.error || '' };
    var attached = [], notes = 0;
    var sb = {
        document: doc, window: win, state: state,
        encodeURIComponent: encodeURIComponent, String: String, Error: Error,
        attachAdmin1: function (data) {
            attached.push(data);
            state.admin1AssetState = 'READY';
            if (!state.admin1AssetError) state.admin1AssetError = '';
        },
        renderAdmin1Note: function () { notes++; }
    };
    sb.globalThis = sb;
    var ctx = vm.createContext(sb);
    vm.runInContext(loaderCode(src), ctx, { filename: 'adm1-loader.js' });
    if (opts.loadedToken !== undefined) vm.runInContext('adm1LoadedToken = ' + JSON.stringify(opts.loadedToken) + ';', ctx);
    return {
        ctx: ctx, doc: doc, win: win, state: state, attached: attached,
        head: doc.head,
        scripts: function () { return doc.head.childNodes.slice(); },
        srcs: function () { return doc.head.childNodes.map(function (e) { return e._attrs.src; }); },
        url: function () { return vm.runInContext('adm1AssetUrl()', ctx); },
        loadedToken: function () { return vm.runInContext('adm1LoadedToken', ctx); },
        call: function () { vm.runInContext('ensureAdmin1Asset()', ctx); },
        seed: function (src2) { var e = doc._mkEl('script'); e.src = src2; doc.head.appendChild(e); return e; },
        notes: function () { return notes; },
        // A REAL BROWSER FIRES EACH SCRIPT'S OUTCOME EXACTLY ONCE. Modelling that is what makes "the retry
        // attached itself to a corpse" observable: a script that already errored will never call back, so a
        // loader that reuses it leaves the layer at LOADING forever. Firing by hand and getting an answer
        // anyway is the stub being more forgiving than the platform.
        fire: function (el, kind) {
            if (el._settled) throw new Error('this script already settled — a browser will not fire it again');
            el._settled = true;
            var h = kind === 'load' ? el.onload : el.onerror;
            if (typeof h !== 'function') throw new Error('no ' + kind + ' handler attached');
            h();
        }
    };
}

// §D.1 — THE RUNTIME URL CARRIES THE CONTENT-DERIVED TOKEN.
(function () {
    var h = harness();
    eq(h.url(), EXPECTED_URL, 'B1 adm1AssetUrl() is the path plus the asset\'s own digest');
    h.call();
    eq(h.srcs(), [EXPECTED_URL], 'B2 and that is the src actually injected into the document');
    eq(h.state.admin1AssetState, 'LOADING', 'B3 the state is LOADING while it is in flight');
    // Relative, same-origin, correctly encoded — a deployed GitHub Pages app resolves it under its own path.
    var u = h.url();
    ok(u.charAt(0) !== '/' && u.indexOf('://') === -1 && u.indexOf('//') === -1,
        'B4 the URL is relative and same-origin — no leading slash, no scheme, no protocol-relative prefix');
    eq(u.split('?').length, 2, 'B5 exactly one query string');
    eq(u.split('?')[1], 'v=' + EXPECTED_TOKEN, 'B5b whose only parameter is the version');
    eq(encodeURIComponent(EXPECTED_TOKEN), EXPECTED_TOKEN, 'B5c the token needs no escaping, and is escaped anyway');
    ok(/encodeURIComponent\(/.test(code(loaderCode(MAP_SRC))), 'B5d the loader encodes the parameter rather than trusting it');
    eq(u.split('?')[0], ADM1_REL, 'B6 the path is untouched — the same relative literal as before R8');
})();

// §D.4 — CONCURRENT CALLERS GET ONE SCRIPT.
(function () {
    var h = harness();
    h.call(); h.call(); h.call();
    eq(h.scripts().length, 1, 'B7 three synchronous callers inject exactly one script');
    eq(h.srcs(), [EXPECTED_URL], 'B7b at the versioned URL');
    // The mechanism, not just the outcome: LOADING is set BEFORE the append, so caller two returns at line one.
    var lc = code(loaderCode(MAP_SRC));
    ok(lc.indexOf("admin1AssetState = 'LOADING'") < lc.indexOf('appendChild'),
        'B7c because the state is marked in flight before the element is appended, not after');
})();

// §D.5 — AN ELEMENT AT THE CORRECT URL IS REUSED, NOT DUPLICATED.
(function () {
    // A load still in flight from an earlier mount: the element exists, the data is not in memory yet, and
    // `state` (a fresh instance) knows nothing about it.
    var h = harness();
    var seeded = h.seed(EXPECTED_URL);
    h.call();
    eq(h.scripts().length, 1, 'B8 an in-flight element at the exact URL is reused, not fetched a second time');
    ok(h.scripts()[0] === seeded, 'B8b it is the same element, not a replacement');
    // And waiting on it actually works — the reused element's handler completes the load.
    h.win.KM_WORLD_ADMIN1 = { t: 'ok' };
    h.fire(seeded, 'load');
    eq(h.state.admin1AssetState, 'READY', 'B8c firing the reused element\'s onload completes the load');
    eq(h.attached.length, 1, 'B8d and attaches the data exactly once');
    eq(h.loadedToken(), EXPECTED_TOKEN, 'B8e recording WHICH identity is now in memory');
})();

// §D.6 — A STALE UNVERSIONED ELEMENT CANNOT SATISFY THE VERSIONED REQUEST.
(function () {
    var h = harness();
    var stale = h.seed(ADM1_REL);                       // exactly the pre-R8 src
    h.call();
    eq(h.scripts().length, 2, 'B9 an unversioned element does NOT satisfy the request — the asset is fetched');
    ok(h.scripts()[0] === stale, 'B9b the stale element is left alone');
    eq(h.scripts()[1]._attrs.src, EXPECTED_URL, 'B9c and the new element carries the content identity');
})();

// §D.7 — NEITHER CAN A SUPERSEDED DIGEST.
(function () {
    var h = harness();
    h.seed(ADM1_REL + '?v=adm1-10m-000000000000');
    h.call();
    eq(h.scripts().length, 2, 'B10 an element at an OLD digest does not masquerade as the current asset');
    eq(h.scripts()[1]._attrs.src, EXPECTED_URL, 'B10b the current identity is fetched');
    // Prefix collisions must not match either — the comparison is the whole URL, not a startsWith.
    var h2 = harness();
    h2.seed(EXPECTED_URL + 'x');
    h2.call();
    eq(h2.scripts().length, 2, 'B10c a URL that merely STARTS with the right one is a different asset');
})();

// THE STALE GLOBAL — the path that made this a correctness fix and not only a cache fix. Every version of the
// asset assigns the same global under the same name, so "is KM_WORLD_ADMIN1 defined?" cannot distinguish old
// boundaries from new ones. Before R8 that question was the whole reuse test.
(function () {
    var h = harness({ inMemory: { stale: true } });     // a global from nowhere; the loader recorded nothing
    h.call();
    eq(h.attached.length, 0, 'B11 a global this loader did not load is NOT attached');
    eq(h.scripts().length, 1, 'B11b the versioned asset is fetched instead');
    eq(h.srcs(), [EXPECTED_URL], 'B11c at the current identity');
    // A recorded but SUPERSEDED identity is refused for the same reason.
    var h2 = harness({ inMemory: { old: true }, loadedToken: 'adm1-10m-000000000000' });
    h2.call();
    eq(h2.attached.length, 0, 'B11d nor is data recorded under a superseded digest');
    eq(h2.srcs(), [EXPECTED_URL], 'B11e which is also refetched');
    // But data this loader did load at THIS identity is reused with no fetch at all.
    var h3 = harness({ inMemory: { good: true }, loadedToken: EXPECTED_TOKEN });
    h3.call();
    eq(h3.attached.length, 1, 'B12 data loaded by this loader at this identity IS reused');
    eq(h3.scripts().length, 0, 'B12b with no second fetch');
    eq(h3.state.admin1AssetState, 'READY', 'B12c and the layer is ready');
})();

// A prior SUCCESS is reused, and an in-flight load is not restarted — the two states the old guard got right
// and which must not regress.
(function () {
    var r = harness({ state: 'READY' });
    r.call();
    eq(r.scripts().length, 0, 'B13 a READY layer fetches nothing');
    var l = harness({ state: 'LOADING' });
    l.call();
    eq(l.scripts().length, 0, 'B13b and a LOADING one is not restarted');
})();

// §D.8 — A FAILED LOAD CAN BE RETRIED, AND CARRIES NO POISONED SUCCESS STATE FORWARD.
(function () {
    var h = harness();
    h.call();
    var first = h.scripts()[0];
    h.fire(first, 'error');
    eq(h.state.admin1AssetState, 'FAILED', 'B14 a fetch failure fails the layer');
    eq(h.state.admin1AssetError, 'asset could not be fetched', 'B14b with the reason');
    eq(h.scripts().length, 0, 'B14c and removes its own element, so no corpse can answer the next request');
    eq(h.loadedToken(), '', 'B14d no identity was recorded — nothing succeeded');
    eq(h.attached.length, 0, 'B14e and no data was attached');
    // The deliberate retry.
    h.call();
    eq(h.scripts().length, 1, 'B15 a retry injects exactly ONE script, not a second alongside the first');
    eq(h.srcs(), [EXPECTED_URL], 'B15b at the same content identity');
    eq(h.state.admin1AssetState, 'LOADING', 'B15c and the layer is in flight again');
    eq(h.state.admin1AssetError, '', 'B15d with the previous attempt\'s reason cleared, not inherited');
    // And it can now succeed.
    h.win.KM_WORLD_ADMIN1 = { t: 'ok' };
    h.fire(h.scripts()[0], 'load');
    eq(h.state.admin1AssetState, 'READY', 'B16 the retry succeeds');
    eq(h.loadedToken(), EXPECTED_TOKEN, 'B16b and records the identity it loaded');
})();

// The other failure path: the script fetched but defined nothing. It must behave like a failure in every way,
// including removing its element — otherwise the in-flight invariant is false and the next request finds a
// corpse that will never fire again.
(function () {
    var h = harness();
    h.call();
    h.win.KM_WORLD_ADMIN1 = null;
    h.fire(h.scripts()[0], 'load');
    eq(h.state.admin1AssetState, 'FAILED', 'B17 a script that defines no data fails the layer');
    eq(h.state.admin1AssetError, 'asset loaded but defined no data', 'B17b with its own distinct reason');
    eq(h.scripts().length, 0, 'B17c and removes its element too');
    eq(h.loadedToken(), '', 'B17d recording no identity');
    h.call();
    eq(h.scripts().length, 1, 'B17e so the retry is a clean single injection');
})();

// Injection blocked (CSP) must still fail closed rather than sit at LOADING forever.
(function () {
    var h = harness();
    h.doc.head.appendChild = function () { throw new Error('blocked'); };
    h.call();
    eq(h.state.admin1AssetState, 'FAILED', 'B18 a blocked injection fails closed');
    eq(h.state.admin1AssetError, 'script injection blocked', 'B18b with the reason a user can act on');
})();

// ================================================================================================================
section('§C/§D.9–12 — the manifest, laziness, and what did NOT move');
// ================================================================================================================
(function () {
    var TAGS = (function () {
        var re = /<script src="([^"?]+)(?:\?v=([^"]+))?"/g, m, out = [];
        while ((m = re.exec(INDEX))) out.push({ src: m[1], tok: m[2] || null });
        return out;
    })();
    function tokOf(src) { for (var i = 0; i < TAGS.length; i++) { if (TAGS[i].src === src) return TAGS[i].tok; } return null; }

    // §D.11 — exactly one R8 reference, and it is the file R8 changed.
    var R8 = RO.currentMapToken();
    eq(R8, 'map-texture3-r8-20260831', 'C1 the shared release order says R8 is the current map round');
    eq(RO.currentMapRoundMarker(), 'TEXTURE-3-R8', 'C1b with its marker DERIVED from the token, not restated');
    eq((INDEX.match(new RegExp(R8, 'g')) || []).length, 1, 'C2 exactly one browser reference carries the R8 token');
    eq(tokOf(MAP_PAGE_REL), R8, 'C2b and it is global-logistics-map.js, the file R8 changed');
    ok(/TEXTURE-3-R8/.test(MAP_SRC), 'C2c which does carry the R8 marker in its source');

    // §D.12 — THE DERIVED RULE, over the shared inventory. A file that changed this round carries this round's
    // token; one that did not must NOT be rotated, or every browser refetches the whole map set for nothing.
    eq(RO.MAP_BROWSER_FILES.length, 7, 'C3 the shared map browser inventory has all seven files');
    var marker = new RegExp(RO.currentMapRoundMarker());
    RO.MAP_BROWSER_FILES.forEach(function (rel) {
        var t = tokOf(rel), base = rel.split('/').pop();
        ok(!!t, 'C4 index.html cache-busts ' + base);
        ok(RO.isMapToken(t), 'C4b ' + base + ' carries a series token (' + t + ')');
        if (marker.test(read(rel))) eq(t, R8, 'C4c ' + base + ' changed this round, so it carries this round\'s token');
        else ok(t !== R8, 'C4d ' + base + ' did not change this round, so it was not rotated (' + t + ')');
    });
    // The two R6 files specifically, because R8 must not disturb the round that closed the labels and arcs.
    eq(tokOf('assets/js/core/geo-name-resolver.js'), 'map-texture3-r6-20260831', 'C5 the resolver still serves at R6');
    eq(tokOf('assets/js/lib/km-globe.js'), 'map-texture3-r6-20260831', 'C5b and so does the globe');
    ['assets/js/data/geo-names-zh-hant.js', 'assets/js/data/geo-display-aliases-zh-tw.js',
     'assets/js/data/geo-admin1-display-names-zh-tw.js', 'assets/js/lib/km-geo-topology.js'].forEach(function (rel) {
        eq(tokOf(rel), 'map-texture3-r4-20260827', 'C5c ' + rel.split('/').pop() + ' still serves at R4');
    });
    // The retired pre-series token is gone, and did not leak anywhere else.
    ok(INDEX.indexOf('map-earth-texture-20260826') === -1,
        'C6 the loader\'s pre-series token is retired — nothing is served from it any more');
    // The application token and the earth content token are not R8's to move.
    eq((INDEX.match(/fb4er4br3-liveclosure-20260831/g) || []).length, 18,
        'C7 the application token is untouched, all 18 references');
    ok(/EARTH_ASSET_VERSION_ = 'jul2004-tiers-e7ca8837'/.test(read('assets/js/lib/km-globe.js')),
        'C7b and the earth content token is unchanged, because no texture byte moved');
    // No duplicate tags — a second copy of the map page would run the loader twice.
    (function () {
        var re = /<script src="([^"?]+)/g, m, seen = {}, dup = [];
        while ((m = re.exec(INDEX))) { if (seen[m[1]]) dup.push(m[1]); seen[m[1]] = 1; }
        eq(dup.join(','), '', 'C8 no script is loaded twice' + (dup.length ? ' — ' + dup.join(', ') : ''));
    })();
})();

// §D.9 — NO NON-MAP PAGE LOADS ADM1, and index.html still never names it.
(function () {
    ok(INDEX.indexOf('world-admin1-10m') === -1,
        'C9 the 0.58 MB asset is still absent from index.html — it must never be in the initial workspace path');
    var runtime = [];
    (function walk(dir) {
        fs.readdirSync(path.join(ROOT, dir)).forEach(function (n) {
            var rel = dir + '/' + n;
            if (fs.statSync(path.join(ROOT, rel)).isDirectory()) { walk(rel); return; }
            if (!/\.js$/.test(n) || rel === '/' + ADM1_REL) return;
            if (rel.indexOf('assets/tests') !== -1 || rel.indexOf('assets/specs') !== -1) return;
            if (code(read(rel.replace(/^\//, ''))).indexOf('world-admin1-10m') !== -1) runtime.push(rel.replace(/^\//, ''));
        });
    })('assets/js');
    eq(runtime, [MAP_PAGE_REL],
        'C10 exactly one runtime file references the ADM1 asset in EXECUTABLE code: the map page that owns it');
})();

// §D.10 — MAP INITIALIZATION REMAINS LAZY. The loader must be reached only from a zoom level or an explicit
// user choice, never from page load.
(function () {
    // The declaration is not a call site. The first draft's pattern matched `function ensureAdmin1Asset() {`
    // and then demanded that the definition be wrapped in an `if` — a test failing on its own bad reading.
    var calls = [];
    MAP_C.split(/\r?\n/).forEach(function (line, i) {
        if (/function\s+ensureAdmin1Asset/.test(line)) return;
        if (/(^|[^.\w])ensureAdmin1Asset\s*\(\s*\)/.test(line)) calls.push({ n: i + 1, line: line.trim() });
    });
    ok(calls.length >= 2, 'C11 the loader is called from the map page (' + calls.length + ' call sites)');
    calls.forEach(function (c) {
        ok(/\bif\s*\(/.test(c.line),
            'C11b call site at line ' + c.n + ' is guarded, not unconditional: ' + c.line.slice(0, 70));
    });
    ok(/if\s*\(lod >= 2\)\s*ensureAdmin1Asset\(\)/.test(MAP_C),
        'C11c one of them is the LOD gate — the asset arrives when the zoom first makes divisions meaningful');
    // No documentation or tooling path may be reachable at runtime.
    ['map-captures', 'tools/geo', 'docs/planning'].forEach(function (p) {
        ok(MAP_C.indexOf(p) === -1, 'C12 the map page references no ' + p + ' path at runtime');
    });
})();

// ================================================================================================================
section('§D negative tests — each guard is made to BITE');
// ================================================================================================================
// A guard never observed to fail is a guess. Each mutation below is checked against a VERIFIED-CLEAN baseline
// first, because a mutation "caught" by an already-failing check proves nothing at all — the lesson R6 paid for.
var neg = { caught: 0, missed: 0 };
function mutate(label, baseline, mutated) {
    var b;
    try { b = baseline(); } catch (e) { b = 'THREW: ' + e.message; }
    if (b !== true) { fail++; console.error('FAIL negative ' + label + ' — BASELINE NOT CLEAN: ' + b); return; }
    var caught;
    try { caught = mutated() !== true; } catch (e) { caught = true; }
    if (caught) { neg.caught++; pass++; console.log('  caught: ' + label); }
    else { neg.missed++; fail++; console.error('FAIL negative ' + label + ' — MUTATION NOT CAUGHT'); }
}
// The behavioural checks, as reusable predicates over a (possibly mutated) page source.
function urlIsPinned(src) { return harness({ src: src }).url() === EXPECTED_URL; }
function injectsPinned(src) { var h = harness({ src: src }); h.call(); return h.srcs().join('|') === EXPECTED_URL; }
function staleRefused(src) {
    var h = harness({ src: src }); h.seed(ADM1_REL); h.call();
    return h.scripts().length === 2 && h.scripts()[1]._attrs.src === EXPECTED_URL;
}
function indexOk(idx) {
    var r8 = (idx.match(/map-texture3-r8-20260831/g) || []).length;
    var app = (idx.match(/fb4er4br3-liveclosure-20260831/g) || []).length;
    var re = /<script src="([^"?]+)/g, m, seen = {}, dup = 0;
    while ((m = re.exec(idx))) { if (seen[m[1]]) dup++; seen[m[1]] = 1; }
    return r8 === 1 && app === 18 && dup === 0;
}

// N1 — the query token removed altogether.
mutate('N1 query token removed from the URL',
    function () { return urlIsPinned(MAP_SRC); },
    function () { return urlIsPinned(MAP_SRC.replace(/return ADM1_ASSET_PATH \+ '\?v=' \+ encodeURIComponent\(ADM1_ASSET_TOKEN\);/, 'return ADM1_ASSET_PATH;')); });

// N2 — the unversioned loader URL restored: the exact pre-R8 line.
mutate('N2 unversioned loader URL restored',
    function () { return injectsPinned(MAP_SRC); },
    function () { return injectsPinned(MAP_SRC.replace(/(\r?\n\s*)el\.src = url;/, '$1el.src = ADM1_ASSET_PATH;')); });

// N3 — an incorrect digest substituted. The URL is still versioned, and still wrong.
mutate('N3 incorrect digest substituted',
    function () { return urlIsPinned(MAP_SRC); },
    function () { return urlIsPinned(MAP_SRC.replace(/var ADM1_ASSET_TOKEN = '[^']+';/, "var ADM1_ASSET_TOKEN = 'adm1-10m-deadbeefcafe';")); });

// N4 — THE ASSET MUTATES AND THE EXPECTED URL DOES NOT. This is the drift the whole design exists to prevent:
// bytes move, the declared token stays, and every URL assertion written against the DECLARATION still passes.
// Caught only because the expectation is derived from the bytes.
mutate('N4 asset bytes mutated while the declared token stands still',
    function () { return tokenFor(ADM1_BYTES) === EXPECTED_TOKEN && urlIsPinned(MAP_SRC); },
    function () {
        var mutatedBytes = Buffer.from(ADM1_BYTES);
        mutatedBytes[mutatedBytes.length - 3] = mutatedBytes[mutatedBytes.length - 3] ^ 0x01;
        var expectedNow = ADM1_REL + '?v=' + tokenFor(mutatedBytes);
        return harness().url() === expectedNow;      // the loader still declares the OLD digest
    });

// N5 — a stale DOM script allowed to satisfy the request, by matching on the path instead of the whole URL.
// This is the single most dangerous plausible "simplification" of the loader.
mutate('N5 stale element allowed to satisfy the versioned request',
    function () { return staleRefused(MAP_SRC); },
    function () { return staleRefused(MAP_SRC.replace(/if \(\(all\[i\]\.getAttribute\('src'\) \|\| ''\) === url\) return all\[i\];/, "if ((all[i].getAttribute('src') || '').indexOf('world-admin1-10m.js') !== -1) return all[i];")); });

// N6 — the loader script tag duplicated in index.html.
mutate('N6 loader script tag duplicated',
    function () { return indexOk(INDEX); },
    function () {
        var tag = '<script src="' + MAP_PAGE_REL + '?v=map-texture3-r8-20260831"></script>';
        return indexOk(INDEX.replace(tag, tag + '\n    ' + tag));
    });

// N7 — the global application token rotated by a map round. Every browser refetches the whole application, and
// the next application round has no token of its own left to move.
mutate('N7 global application token rotated',
    function () { return indexOk(INDEX); },
    function () { return indexOk(INDEX.replace('fb4er4br3-liveclosure-20260831', 'map-texture3-r8-20260831')); });

// N8 — the in-memory reuse reverted to "is the global defined?", which is how a stale unversioned copy would
// have kept the old boundaries alive for the life of the browser cache.
mutate('N8 in-memory reuse reverted to trusting any global',
    function () { var h = harness({ inMemory: { stale: true } }); h.call(); return h.attached.length === 0 && h.srcs().join('|') === EXPECTED_URL; },
    function () {
        var m = MAP_SRC.replace(/window\.KM_WORLD_ADMIN1 && adm1LoadedToken === ADM1_ASSET_TOKEN/, 'window.KM_WORLD_ADMIN1');
        var h = harness({ src: m, inMemory: { stale: true } }); h.call();
        return h.attached.length === 0 && h.srcs().join('|') === EXPECTED_URL;
    });

// N9 — THE FAILED ELEMENT LEFT IN THE DOCUMENT. The first draft of this mutation was NOT CAUGHT, and the
// reason is worth recording: the predicate counted elements, and the count is 1 either way — clean code injects
// one fresh script, the mutant reuses the one dead one. The defect is not how many elements exist, it is that
// the retry is waiting on a script that has already settled and will never call back. So the predicate now
// requires the retry to COMPLETE, and the stub refuses to fire a settled element twice.
mutate('N9 failed element left behind, poisoning the retry',
    function () {
        var h = harness(); h.call(); h.fire(h.scripts()[0], 'error'); h.call();
        h.win.KM_WORLD_ADMIN1 = { t: 'ok' }; h.fire(h.scripts()[0], 'load');
        return h.state.admin1AssetState === 'READY';
    },
    function () {
        var m = MAP_SRC.replace(/try \{ var e = adm1ScriptEl\(url\); if \(e && e\.parentNode\) e\.parentNode\.removeChild\(e\); \} catch \(e2\) \{\}/, '');
        var h = harness({ src: m }); h.call(); h.fire(h.scripts()[0], 'error'); h.call();
        h.win.KM_WORLD_ADMIN1 = { t: 'ok' }; h.fire(h.scripts()[0], 'load');
        return h.state.admin1AssetState === 'READY';
    });

// N10 — THE DOM SINGLE-FLIGHT BRANCH REMOVED. The first draft of this mutation moved the LOADING assignment
// to just before the append and expected a double fetch; it was NOT CAUGHT, and correctly so — JavaScript does
// not preempt, so `ensureAdmin1Asset` runs to completion before any other caller and both orderings behave
// identically. It was a mutation with no defect in it, which is worth as much as a guard with no test.
//
// The measurement did surface something real, though: the state guard and the DOM guard each independently
// prevent the concurrent double fetch, so neither alone shows up in the synchronous case. What ONLY the DOM
// guard prevents is a load still in flight from an EARLIER mount, where `state` is fresh and knows nothing —
// so that is the case this mutation attacks.
mutate('N10 DOM single-flight removed, refetching a load already in flight',
    function () {
        var h = harness(); h.seed(EXPECTED_URL); h.call(); return h.scripts().length === 1;
    },
    function () {
        var m = MAP_SRC.replace(/if \(existing\) \{ existing\.onload = onLoaded; existing\.onerror = onFailed; return; \}/, '');
        var h = harness({ src: m }); h.seed(EXPECTED_URL); h.call(); return h.scripts().length === 1;
    });

// N11 — the retry inherits the previous failure's reason, so the note reports a cause that is no longer true.
mutate('N11 retry inherits the previous attempt\'s error reason',
    function () { var h = harness(); h.call(); h.fire(h.scripts()[0], 'error'); h.call(); return h.state.admin1AssetError === ''; },
    function () {
        var m = MAP_SRC.replace(/(\r?\n\s*)state\.admin1AssetError = '';(\r?\n\s*state\.admin1AssetState = 'LOADING')/, '$2');
        var h = harness({ src: m }); h.call(); h.fire(h.scripts()[0], 'error'); h.call();
        return h.state.admin1AssetError === '';
    });

// N12 — the asset itself given a hard-coded version marker, which is how the identity ends up in two places.
mutate('N12 a second copy of the digest introduced',
    function () {
        var hits = 0;
        ['index.html', 'assets/js/lib/km-globe.js'].forEach(function (r) { hits += (read(r).match(new RegExp(EXPECTED_TOKEN, 'g')) || []).length; });
        return hits === 0;
    },
    function () {
        var fake = INDEX.replace('</head>', '  <!-- ' + EXPECTED_TOKEN + ' -->\n</head>');
        return (fake.match(new RegExp(EXPECTED_TOKEN, 'g')) || []).length === 0;
    });

console.log('\n  negative tests: ' + neg.caught + ' caught, ' + neg.missed + ' missed');

// ================================================================================================================
console.log('\n' + '-'.repeat(40));
console.log('ADM1 CONTENT-PINNED CACHE (TEXTURE-3-R8): ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
