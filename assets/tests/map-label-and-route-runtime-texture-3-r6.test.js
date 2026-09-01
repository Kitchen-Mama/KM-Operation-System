// MAP-VISUAL-REAL-EARTH-TEXTURE-3-R6 — OPEN-OCEAN LABEL + ROUTE ARC RUNTIME CLOSURE.
//
// R5 shipped two user-visible findings it could describe but not explain. Both turned out to be caused by
// something OTHER than the layer they appeared in, which is why this suite exists at the boundaries rather than
// at the symptoms.
//
//   THE ENGLISH SEA LABEL was not a missing translation. Natural Earth's CONTINENT field has eight values: the
//   seven continents and one bucket for features on none of them, spelled "Seven seas (open ocean)". Exactly one
//   feature carries it — TF, Fr. S. Antarctic Lands — so the globe derived a one-member "continent" anchor in the
//   southern Indian Ocean and painted the bucket's name. There is no Traditional Chinese name for it because it
//   does not name anywhere.
//
//   THE MISSING ROUTE ARC was not in the engine at all. tools/geo/capture-views.js called
//   setArcs([{from, to}]); rebuildLines() reads `a.points`. The shipped page has always passed `{points: seq}`,
//   so production arcs were never broken — but no acceptance round had ever exercised the arc contract, which is
//   a worse finding than a broken arc and the reason §C asked for a census instead of a screenshot.
//
// Run: node assets/tests/map-label-and-route-runtime-texture-3-r6.test.js

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var ROOT = path.join(__dirname, '..', '..');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(t) { console.log('\n== ' + t + ' =='); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function code(src) {
    return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1 ');
}
function sha256(buf) { return require('crypto').createHash('sha256').update(buf).digest('hex'); }

var GLOBE_SRC = read('assets/js/lib/km-globe.js');
var GLOBE_C = code(GLOBE_SRC);
var RESOLVER_SRC = read('assets/js/core/geo-name-resolver.js');
var INDEX = read('index.html');

var OPEN_OCEAN_KEY = 'Seven seas (open ocean)';
var FORMAL_CN = '中華人民共和國', FORMAL_TW = '中華民國';
var SHORT_CN = '中國', SHORT_TW = '台灣';

// ---- the resolver, loaded the way the page assembles it -------------------------------------------------
function loadResolver(opts) {
    opts = opts || {};
    var g = {}, sb = { window: g, console: console };
    sb.globalThis = sb;
    var ctx = vm.createContext(sb);
    vm.runInContext(read('assets/js/data/world-countries-110m.js'), ctx, { filename: 'countries.js' });
    if (opts.names !== false) vm.runInContext(read('assets/js/data/geo-names-zh-hant.js'), ctx, { filename: 'names.js' });
    if (opts.aliases !== false) vm.runInContext(read('assets/js/data/geo-display-aliases-zh-tw.js'), ctx, { filename: 'aliases.js' });
    vm.runInContext(RESOLVER_SRC, ctx, { filename: 'resolver.js' });
    return { api: g.KM && g.KM.geoNames, win: g };
}

// ---- rebuildLines, executed for real ---------------------------------------------------------------------
// §C/§D are questions about how many vertices the SHIPPED builder emits for a given payload. That is pure
// arithmetic over slerp, so the function is lifted out of the engine and run rather than reasoned about — and
// lifted by brace-matching from the real source, so it cannot drift from what ships.
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
var DEG_DECL = /var DEG\s*=\s*[^;]+;/.exec(GLOBE_SRC);
var ARC_CODE = [DEG_DECL[0], extractFn('latLngToVec3', GLOBE_SRC), extractFn('slerp', GLOBE_SRC),
                extractFn('norm', GLOBE_SRC), extractFn('rebuildLines', GLOBE_SRC)].join('\n');
function buildArcs(arcs) {
    var sb = { arcs: arcs, lineData: null, lineCount: 0, isFinite: isFinite, Math: Math,
               Array: Array, Float32Array: Float32Array, String: String };
    var ctx = vm.createContext(sb);
    vm.runInContext(ARC_CODE + '\nrebuildLines();', ctx);
    return vm.runInContext('({ lineCount: lineCount, info: routeInfo, verts: Array.prototype.slice.call(lineData) })', ctx);
}
// THE ENGINE'S OWN PROJECTION, not a copy of it.
//
// The first version of the order assertion below re-derived the expected vector by hand and used a Z-up
// convention. The engine is Y-UP: [r*cos(phi)*sin(lam), r*sin(phi), r*cos(phi)*cos(lam)]. The test failed, and it
// was the test that was wrong — which is the argument for not hand-rolling it. Calling the shipped function
// means a change to the projection cannot make this assertion quietly meaningless.
var ENGINE = (function () {
    var sb = { Math: Math };
    var ctx = vm.createContext(sb);
    vm.runInContext(DEG_DECL[0] + '\n' + extractFn('latLngToVec3', GLOBE_SRC) +
                    '\nthis.latLngToVec3 = latLngToVec3;', ctx);
    return { latLngToVec3: sb.latLngToVec3 };
})();
// Longitude read back out of an engine vector, in the engine's convention: lam = atan2(x, z).
function lonOf(x, y, z) { return Math.atan2(x, z) * 180 / Math.PI; }

// ================================================================================================================
section('§A/§B — ocean-label eligibility, decided by the resolver');
// ================================================================================================================
(function () {
    var G = loadResolver().api;

    // The seven real continents keep their reviewed Traditional Chinese names. This is the "do not assume all
    // English text should be hidden" half of §A: the fix must not have silenced the layer.
    var CONTINENTS = { 'Africa': '非洲', 'Asia': '亞洲', 'Europe': '歐洲', 'North America': '北美洲',
                       'Oceania': '大洋洲', 'South America': '南美洲', 'Antarctica': '南極洲' };
    Object.keys(CONTINENTS).forEach(function (k) {
        var r = G.continent(k);
        eq(r.name, CONTINENTS[k], 'B1 ' + k + ' still renders its reviewed name');
        eq(r.level, 'ZH_HANT_REVIEWED_LIST', 'B1 ... from the reviewed list, and it says so');
    });
    // Completeness: if the reviewed list ever loses an entry, the classification below must not silently
    // swallow a genuine continent as though it were the ocean bucket.
    eq(Object.keys(CONTINENTS).length, 7, 'B1 all seven continents are covered by the reviewed list');

    // The bucket is HIDDEN, and hidden for the right REASON.
    var oo = G.continent(OPEN_OCEAN_KEY);
    eq(oo.name, '', 'B2 the open-ocean bucket is not labelled');
    eq(oo.level, 'HIDDEN_NOT_A_PLACE', 'B2 ... and reports WHY, distinguishably');
    eq(oo.hidden_reason, 'NOT_A_PLACE', 'B2 with an explicit reason field');

    // §B: hiding a non-place is not a language decision, so an explicit English request cannot resurrect it.
    eq(G.continent(OPEN_OCEAN_KEY, { lang: 'en' }).name, '', 'B3 not even explicit English mode labels a non-place');
    eq(G.continent(OPEN_OCEAN_KEY, { allowEnglish: true }).name, '', 'B3 nor an explicit allowEnglish opt-in');

    // §B: English mode REMAINS AVAILABLE for things that are places.
    eq(G.continent('Europe', { lang: 'en' }).name, 'Europe', 'B4 lang:en still works for a real continent');
    eq(G.continent('Europe', { lang: 'en' }).level, 'ENGLISH_CANONICAL', 'B4 at the English level');
    eq(G.country('CN', { lang: 'en' }).name, 'China', 'B4 and for countries');

    // §B: an unresolved name must not become visible English merely because the source is English.
    var unknown = G.continent('Atlantis');
    eq(unknown.name, '', 'B5 an unknown continent key does NOT fall back to visible English');
    eq(unknown.level, 'HIDDEN_NAME_UNAVAILABLE', 'B5 ... it reports a missing NAME, not a missing place');
    eq(unknown.hidden_reason, 'NAME_UNAVAILABLE', 'B5 with its own reason');
    eq(unknown.english, 'Atlantis', 'B5 and keeps the source string for matching and audit, unpainted');
    // The two hidden reasons must never be the same value, or the distinction is decorative.
    ok(G.LEVEL.HIDDEN_NOT_A_PLACE !== G.LEVEL.HIDDEN_NAME_UNAVAILABLE, 'B5 the two hidden reasons are distinct');

    // ocean(): the same contract. The vendored asset has NO oceans table, so before R6 this returned English for
    // every key. Nothing calls it yet — the first caller would have been the second leak.
    ok(!loadResolver().win.KM_GEO_NAMES_ZH_HANT.oceans,
        'B6 the vendored asset genuinely has no oceans table (so this is measured, not assumed)');
    var pac = G.ocean('Pacific Ocean');
    eq(pac.name, '', 'B6 an ocean with no vendored name is hidden, not painted in English');
    eq(pac.level, 'HIDDEN_NAME_UNAVAILABLE', 'B6 ... and says a name is missing');
    eq(G.ocean('Pacific Ocean', { lang: 'en' }).name, 'Pacific Ocean', 'B6 explicit English still works');
    eq(G.ocean(OPEN_OCEAN_KEY).level, 'HIDDEN_NOT_A_PLACE', 'B6 and the bucket is a non-place here too');

    // HIDING MUST NOT MEAN FORGETTING — a gap has to stay reportable or it never gets closed.
    var gaps = G.hiddenGeographicKeys();
    eq(gaps.length, 1, 'B7 exactly one geographic key is hidden on the default map');
    eq(gaps[0].key, OPEN_OCEAN_KEY, 'B7 and it is the open-ocean bucket');
    eq(gaps[0].reason, 'NOT_A_PLACE', 'B7 reported as permanent, not as an outstanding translation');
    eq(gaps[0].member_features, 1, 'B7 with the measured number of features that carry it');

    // §B: the operational layers are untouched. Countries, and the two decided names in particular.
    eq(G.country('CN').name, SHORT_CN, 'B8 CN still renders 中國');
    eq(G.country('TW').name, SHORT_TW, 'B8 TW still renders 台灣');
    eq(G.countryDetail('TW').name, SHORT_TW + '（TW）', 'B8 and the detail form is unchanged');
    ok(G.countryDetail('TW').name.indexOf(FORMAL_TW) === -1, 'B8 with no formal-name regression');
    ok(G.country('CN').name.indexOf(FORMAL_CN) === -1, 'B8 for CN either');
    // TF itself is a COUNTRY and must still be labelled — it was the source of the bucket value, not a victim.
    ok(G.country('TF').name.length > 0, 'B9 TF, the feature that carries the bucket value, is still labelled');
    eq(G.country('TF').name, '法屬南部屬地', 'B9 by its reviewed Traditional Chinese alias');
})();

// ================================================================================================================
section('§B — asset-absent fallback stays deterministic and leaks nothing');
// ================================================================================================================
(function () {
    var G = loadResolver({ names: false }).api;
    // With the names asset gone the reviewed continent list is gone with it. §B says that must fail SAFELY:
    // no visible English, and no exception.
    ['Europe', 'Asia', OPEN_OCEAN_KEY].forEach(function (k) {
        var r = G.continent(k);
        eq(r.name, '', 'B10 with no names asset, ' + JSON.stringify(k) + ' is hidden rather than English');
        ok(r.level === 'HIDDEN_NAME_UNAVAILABLE' || r.level === 'HIDDEN_NOT_A_PLACE',
            'B10 ... and reports which kind of hidden it is (' + r.level + ')');
    });
    eq(G.continent('Europe', { lang: 'en' }).name, 'Europe', 'B10 explicit English is still available');
    // Deterministic: same input, same output, twice.
    eq(G.continent('Europe').level, G.continent('Europe').level, 'B10 repeated calls agree');
    // And R5's country guard still holds with the names asset gone.
    eq(G.country('TW').name, SHORT_TW, 'B11 the decided country name survives an absent names asset');
    var G2 = loadResolver({ aliases: false }).api;
    eq(G2.country('TW').level, 'APPROVED_ALIAS_UNAVAILABLE', 'B11 and an absent ALIAS asset still fails closed');
    ok(G2.country('TW').name.indexOf(FORMAL_TW) === -1, 'B11 with no formal-name leak');
})();

// ================================================================================================================
section('§B — the globe layer OBEYS the resolver and carries no dictionary of its own');
// ================================================================================================================
(function () {
    // The caller had its own leak, independent of the resolver's: it seeded `nm` with the English key and then
    // treated an empty name as "no answer". Both halves are asserted against the real source.
    var fn = extractFn('continentList', GLOBE_SRC);
    var fnc = code(fn);
    ok(fnc.indexOf('var nm = a.key') === -1, 'B12 the English key is no longer the seed value');
    ok(/if \(!a\.text\) return false/.test(fnc), 'B12 and a hidden label is DROPPED rather than painted');
    // §B forbids a second dictionary in the page. The engine may not carry the bucket string in executable code.
    ok(GLOBE_C.indexOf(OPEN_OCEAN_KEY) === -1,
        'B13 the map layer carries no copy of the open-ocean key in executable source');
    ok(GLOBE_C.indexOf('非洲') === -1 && GLOBE_C.indexOf('亞洲') === -1,
        'B13 nor any continent name of its own');
    // The classification lives in the resolver, as a KEY list holding no names.
    var cls = /var NON_GEOGRAPHIC_KEYS_ = \[([^\]]*)\]/.exec(code(RESOLVER_SRC));
    ok(!!cls, 'B14 the resolver classifies non-geographic keys');
    ok(!/[一-鿿]/.test(cls ? cls[0] : 'x'), 'B14 and that classification contains no Chinese name');
})();

// ================================================================================================================
section('§C/§D — route arc geometry, measured through the shipped builder');
// ================================================================================================================
(function () {
    // A valid two-node route draws one segment. 40 subdivisions × 2 vertices per subdivision = 80 vertices.
    var two = buildArcs([{ id: 'r', points: [[31.2, 121.5], [33.9, -118.4]] }]);
    eq(two.info.segments, 1, 'D1 two distinct nodes produce ONE segment');
    eq(two.lineCount, 80, 'D1 ... and 80 vertices');
    eq(two.info.arcs_drawn, 1, 'D1 the arc is counted as drawn');
    eq(two.info.arcs_skipped, 0, 'D1 and nothing was skipped');

    // Three and four nodes: one segment per adjacent pair, in order.
    var three = buildArcs([{ id: 'r', points: [[31.2, 121.5], [33.9, -118.4], [41.9, -87.6]] }]);
    eq(three.info.segments, 2, 'D2 three nodes produce TWO segments');
    eq(three.lineCount, 160, 'D2 ... and 160 vertices');
    var four = buildArcs([{ id: 'r', points: [[31.2, 121.5], [22.3, 114.2], [33.9, -118.4], [41.9, -87.6]] }]);
    eq(four.info.segments, 3, 'D2 four nodes produce THREE segments');

    // ORDER IS PRESERVED. The first emitted vertex must be the first node and the last the last node — a
    // reversed or shuffled route would satisfy every count above and be wrong on the screen.
    (function () {
        var first = ENGINE.latLngToVec3(31.2, 121.5, 1.006), last = ENGINE.latLngToVec3(41.9, -87.6, 1.006);
        var v = three.verts;
        var gotFirst = [v[0], v[1], v[2]];
        var n = v.length;
        var gotLast = [v[n - 7], v[n - 6], v[n - 5]];
        [0, 1, 2].forEach(function (i) {
            ok(Math.abs(gotFirst[i] - first[i]) < 1e-6, 'D3 the arc STARTS at the first route node (axis ' + i + ')');
            ok(Math.abs(gotLast[i] - last[i]) < 1e-6, 'D3 and ENDS at the last (axis ' + i + ')');
        });
    })();

    // DUPLICATE ADJACENT COORDINATES. The old builder emitted 40 degenerate segments — 80 vertices describing a
    // single point — for every repeated pair. A route through the same warehouse twice is ordinary data.
    var dup = buildArcs([{ id: 'r', points: [[31.2, 121.5], [31.2, 121.5], [33.9, -118.4]] }]);
    eq(dup.info.segments, 1, 'D4 a duplicated adjacent node contributes NO segment');
    eq(dup.lineCount, 80, 'D4 ... so the geometry is the same as the two-node route');
    var allSame = buildArcs([{ id: 'r', points: [[31.2, 121.5], [31.2, 121.5]] }]);
    eq(allSame.lineCount, 0, 'D4 an all-identical route draws nothing');
    eq(allSame.info.skipped[0].reason, 'ALL_SEGMENTS_DEGENERATE', 'D4 and says so by name');

    // SINGLE NODE: a marker, and no invented arc.
    var one = buildArcs([{ id: 'r', points: [[31.2, 121.5]] }]);
    eq(one.lineCount, 0, 'D5 a single-node route invents no arc');
    eq(one.info.skipped[0].reason, 'SINGLE_NODE', 'D5 reported as SINGLE_NODE, not as an error');

    // UNRESOLVED NODES FAIL CLOSED AND SAY WHY. rebuildPoints has always validated with isFinite; rebuildLines
    // did not, so a NaN latitude produced NaN vertices and a route that vanished silently.
    var nan = buildArcs([{ id: 'r', points: [[31.2, 121.5], [NaN, -118.4]] }]);
    eq(nan.lineCount, 0, 'D6 a NaN coordinate draws nothing');
    eq(nan.info.skipped[0].reason, 'NODE_UNRESOLVED', 'D6 and is named NODE_UNRESOLVED');
    eq(nan.info.skipped[0].detail, 'index 1', 'D6 with the offending index');
    var nul = buildArcs([{ id: 'r', points: [[31.2, 121.5], null] }]);
    eq(nul.info.skipped[0].reason, 'NODE_UNRESOLVED', 'D6 a null node too');
    var oor = buildArcs([{ id: 'r', points: [[31.2, 121.5], [33.9, 999]] }]);
    eq(oor.info.skipped[0].reason, 'NODE_OUT_OF_RANGE', 'D6 and an out-of-range coordinate is its own refusal');
    // No NaN may reach the vertex buffer under any of those inputs.
    [nan, nul, oor].forEach(function (r, i) {
        ok(r.verts.every(function (x) { return isFinite(x); }), 'D6 no NaN reaches the buffer (case ' + i + ')');
    });

    // THE R5 CAUSE, PINNED AS A REFUSAL. The API takes ONE payload shape; the wrong one is now loud.
    var legacy = buildArcs([{ id: 'r', from: [31.2, 121.5], to: [33.9, -118.4] }]);
    eq(legacy.lineCount, 0, 'D7 the {from,to} shape still produces no geometry — the API was not widened');
    eq(legacy.info.skipped[0].reason, 'NO_POINTS', 'D7 but it now REPORTS why instead of silently drawing nothing');
    ok(GLOBE_C.indexOf('a.from') === -1 && GLOBE_C.indexOf('a.to') === -1,
        'D7 and no second payload shape was added to the engine');

    // ANTIMERIDIAN AND THROUGH-GLOBE. slerp interpolates on the sphere and always takes the shorter arc, so
    // both properties are structural — and both are measured rather than trusted.
    var am = buildArcs([{ id: 'r', points: [[35.7, 139.7], [61.2, -149.9]] }]);
    eq(am.info.segments, 1, 'D8 an antimeridian-crossing leg is one segment');
    (function () {
        var v = am.verts, minR = Infinity, maxR = -Infinity, maxJump = 0, prev = null, len = 0;
        for (var i = 0; i + 6 < v.length; i += 7) {
            var r = Math.hypot(v[i], v[i + 1], v[i + 2]);
            if (r < minR) minR = r; if (r > maxR) maxR = r;
            var lon = lonOf(v[i], v[i + 1], v[i + 2]);
            if (prev !== null) { var d = Math.abs(lon - prev); if (d > 180) d = 360 - d; if (d > maxJump) maxJump = d; }
            prev = lon;
        }
        for (var k = 0; k + 13 < v.length; k += 14) {
            len += Math.hypot(v[k + 7] - v[k], v[k + 8] - v[k + 1], v[k + 9] - v[k + 2]);
        }
        ok(Math.abs(minR - 1.006) < 1e-5 && Math.abs(maxR - 1.006) < 1e-5,
            'D8 EVERY vertex sits at radius 1.006 — no naive Cartesian midpoint sinks through the globe');
        ok(maxJump < 10, 'D8 no ~180 degree longitude step, so it is not a reverse wrap (' + maxJump.toFixed(2) + ')');
        // The leg genuinely crosses the antimeridian, or the case proves nothing.
        (function () {
            var lons = [];
            for (var q = 0; q + 6 < v.length; q += 7) lons.push(lonOf(v[q], v[q + 1], v[q + 2]));
            var crossed = lons.some(function (L, idx) {
                return idx > 0 && ((lons[idx - 1] > 150 && L < -150) || (lons[idx - 1] < -150 && L > 150));
            });
            ok(crossed, 'D8 and the leg really does cross the 180th meridian');
        })();
        var A = ENGINE.latLngToVec3(35.7, 139.7, 1), B = ENGINE.latLngToVec3(61.2, -149.9, 1);
        var shortA = Math.acos(Math.max(-1, Math.min(1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2])));
        ok(Math.abs(len - shortA * 1.006) < 0.01, 'D8 and the path length matches the SHORT great circle');
        ok(Math.abs(len - (2 * Math.PI - shortA) * 1.006) > 1, 'D8 and not the long way round');
    })();

    // Multiple arcs are independent, and the census adds up.
    var multi = buildArcs([{ id: 'a', points: [[0, 0], [10, 10]] },
                           { id: 'b', points: [[20, 20], [30, 30], [40, 40]] },
                           { id: 'c', points: [[1, 1]] }]);
    eq(multi.info.arcs_in, 3, 'D9 three arcs in');
    eq(multi.info.arcs_drawn, 2, 'D9 two drawn');
    eq(multi.info.arcs_skipped, 1, 'D9 one skipped');
    eq(multi.info.segments, 3, 'D9 three segments total');
    eq(multi.lineCount, 240, 'D9 and 240 vertices');
    eq(multi.info.skipped[0].id, 'c', 'D9 the skipped arc is identified by its own id');
})();

// ================================================================================================================
section('§D/§E — the live page contract, lifecycle and disposal');
// ================================================================================================================
(function () {
    // The shipped page must use the ONE supported shape. If it ever stopped, production arcs would vanish the
    // way the harness's did — and this is the assertion that would catch it.
    var PAGE = code(read('assets/js/pages/global-logistics-map.js'));
    var calls = PAGE.match(/arcs\.push\(\{[^}]*\}/g) || [];
    ok(calls.length >= 1, 'E1 the page pushes route arcs (' + calls.length + ' sites)');
    calls.forEach(function (c, i) {
        ok(/points\s*:/.test(c), 'E1 arc payload ' + i + ' uses `points` — the supported shape');
        ok(!/\bfrom\s*:/.test(c) && !/\bto\s*:/.test(c), 'E1 and not from/to');
    });
    // Markers and arcs are fed from the SAME normalized sequence, so they cannot disagree about a node.
    ok(/seq\.push\(\[c\.lat, c\.lng\]\)/.test(PAGE), 'E2 nodes are collected once into a canonical sequence');
    ok(/arcs\.push\(\{ points: seq/.test(PAGE), 'E2 and the arc is built from that same sequence');

    // REPLACE, NOT APPEND — this is what makes remount incapable of duplicating an arc.
    ok(/setArcs: function \(list\) \{ arcs = \(list \|\| \[\]\)\.slice\(\); rebuildLines\(\); schedule\(\); \}/.test(GLOBE_SRC),
        'E3 setArcs REPLACES the arc list and rebuilds once');
    ok(/setMarkers: function \(list\) \{ markers = \(list \|\| \[\]\)\.slice\(\); rebuildPoints\(\); schedule\(\); \}/.test(GLOBE_SRC),
        'E3 setMarkers likewise, so the two layers stay in step');
    ok(!/arcs\.push\(/.test(GLOBE_C), 'E3 the engine never appends to its arc list');

    // Calling setArcs repeatedly must not accumulate geometry. Proved by building the same payload twice and
    // asserting the vertex count is identical rather than doubled.
    var once = buildArcs([{ id: 'r', points: [[0, 0], [10, 10]] }]);
    var twice = buildArcs([{ id: 'r', points: [[0, 0], [10, 10]] }]);
    eq(twice.lineCount, once.lineCount, 'E4 rebuilding the same route yields the same vertex count, not double');

    // Hiding a route must actually cost nothing: an empty list means lineCount 0, and the draw call is guarded.
    var none = buildArcs([]);
    eq(none.lineCount, 0, 'E5 an empty route set produces no geometry');
    eq(none.info.arcs_in, 0, 'E5 and the census says so');
    ok(/if \(lineCount\) \{/.test(GLOBE_SRC), 'E5 the arc draw call is guarded by lineCount');

    // Coalescing scheduler: a burst of setArcs produces ONE frame, and there is no idle animation loop.
    ok(/function schedule\(\) \{ if \(!raf && !destroyed\) raf = requestAnimationFrame\(draw\); \}/.test(GLOBE_SRC),
        'E6 frames are coalesced — a hidden or unchanged route drives no extra work');

    // Disposal.
    ok(/gl\.deleteBuffer\(buf\.line\)/.test(GLOBE_SRC), 'E7 destroy() disposes the arc buffer');
    ok(/gl\.deleteProgram\(progLine\)/.test(GLOBE_SRC), 'E7 and the line program');

    // §E — no new earth tier, one decode per path, topology fetched once, map cost stays on the map page.
    ok(/if \(rec && rec\.promise\) return rec\.promise;/.test(GLOBE_SRC),
        'E8 texture loads are single-flighted, so no tier is fetched twice');
    eq((GLOBE_SRC.match(/earth-albedo-\d+\.jpg/g) || []).sort().join(','),
        'earth-albedo-2048.jpg,earth-albedo-4096.jpg,earth-albedo-8192.jpg',
        'E8 the engine still references exactly the three runtime tiers — R6 added none');
    ok(INDEX.indexOf('world-admin1-10m.js') === -1, 'E9 the 538 KB ADM1 geometry is still lazy');
    ok(INDEX.indexOf('map-captures') === -1, 'E9 no documentation capture is referenced by production HTML');
    ok(INDEX.indexOf('tools/geo/') === -1, 'E9 nor any build tool');
    ok(/if \(!state\.globe && !state\.globeError\)/.test(read('assets/js/pages/global-logistics-map.js')),
        'E10 the globe is created lazily, once, when the map section attaches');
})();

// ================================================================================================================
section('§G — cache tokens: only what changed, and nothing else');
// ================================================================================================================
(function () {
    // TEXTURE-3-R9 — THE SEVENTH PRIVATE COPY OF THE SERIES, and the second time this suite's §G asserted its
    // own round as an EQUALITY with the present. R6 rotated exactly two files and that was correct; R9 then moved
    // km-globe.js on legitimately, and three assertions here failed while describing a correct state.
    //
    // What R6 actually needs to protect is that the files R6 CHANGED are never served from a token older than R6.
    // Expressed as a floor it stays true for every round after R6, and it still bites the defect it was written
    // for — R6 changing a file and forgetting to rotate it. The series comes from the shared authority.
    var RO_ = require(path.join(ROOT, 'assets/tests/_release-order.js'));
    var R6 = 'map-texture3-r6-20260831';
    var LEGACY_SERIES_UNUSED_ = ['map-zh-hant-20260826', 'map-texture3-r2-20260826', 'map-texture3-r3-20260826',
                  'map-texture3-r4-20260827', 'map-texture3-r5-20260831', R6];
    var MAP_FILES = {
        'assets/js/data/geo-names-zh-hant.js': 'assets/js/data/geo-names-zh-hant.js',
        'assets/js/data/geo-display-aliases-zh-tw.js': 'assets/js/data/geo-display-aliases-zh-tw.js',
        'assets/js/data/geo-admin1-display-names-zh-tw.js': 'assets/js/data/geo-admin1-display-names-zh-tw.js',
        'assets/js/core/geo-name-resolver.js': 'assets/js/core/geo-name-resolver.js',
        'assets/js/lib/km-geo-topology.js': 'assets/js/lib/km-geo-topology.js',
        'assets/js/lib/km-globe.js': 'assets/js/lib/km-globe.js'
    };
    // Same derived rule R5 installed: this round's marker in the source <=> this round's token in the HTML.
    Object.keys(MAP_FILES).forEach(function (f) {
        var m = new RegExp(f.replace(/[.\/]/g, '\\$&') + '\\?v=([^"\']+)').exec(INDEX);
        ok(!!m, 'G1 index.html cache-busts ' + f);
        var tok = m ? m[1] : '';
        ok(RO_.isMapToken(tok), 'G1 ' + path.basename(f) + ' carries a series token (' + tok + ')');
        var changed = /TEXTURE-3-R6/.test(read(MAP_FILES[f]));
        if (changed) {
            ok(RO_.mapTokenAtOrAfter(tok, R6),
                'G2 ' + path.basename(f) + ' changed in R6, so it is never served OLDER than R6 (' + tok + ')');
        } else {
            ok(!RO_.mapTokenAtOrAfter(tok, R6) || tok !== R6,
                'G2 ' + path.basename(f) + ' did not change in R6, so R6 did not rotate it (' + tok + ')');
        }
    });
    // The two files R6 touched both still carry the R6 marker, whatever token they are served from now. That is
    // the part of "exactly two" that was ever about R6: the round changed two files and said so in both.
    eq(Object.keys(MAP_FILES).filter(function (f) { return /TEXTURE-3-R6/.test(read(MAP_FILES[f])); }).length, 2,
        'G3 exactly two map files carry R6\'s marker in their source');
    // And nothing in the map set is served from a token older than the round its own content last moved in.
    Object.keys(MAP_FILES).forEach(function (f) {
        if (!/TEXTURE-3-R6/.test(read(MAP_FILES[f]))) return;
        var t = RO_.parseIndexTokens(INDEX)[f];
        ok(RO_.mapTokenIndex(t) >= RO_.mapTokenIndex(R6),
            'G3 ' + path.basename(f) + ' is served at or after R6 (' + t + ')');
    });
    // The application token and the earth content token must NOT have moved.
    // RESTATED (F1-7N-SKU-DETAILS-DISPLAY-INIT-R1): this said "the application token is
    // fb4er4br3-liveclosure-20260831, 18 times". What it MEANT is that a MAP round must not move the
    // application token - and as a literal it also forbade any APPLICATION round from moving it, which is
    // the equality-with-now _release-order.js exists to end. The property is unchanged and strictly
    // stronger: all 18 application references share ONE token, it is the current application token, and it
    // is not a map-series token.
    eq((INDEX.match(new RegExp(RO_.currentAppToken(), 'g')) || []).length, 18,
        'G4 all 18 application references share the current application token');
    ok(!RO_.isMapToken(RO_.currentAppToken()), 'G4 and no map round moved it onto a map token');
    ok(/EARTH_ASSET_VERSION_ = 'jul2004-tiers-e7ca8837'/.test(GLOBE_SRC),
        'G4 and the earth content token is unchanged, because no asset byte moved');
    // No duplicate script tags.
    (function () {
        var re = /<script src="([^"?]+)/g, m, seen = {}, dup = [];
        while ((m = re.exec(INDEX))) { if (seen[m[1]]) dup.push(m[1]); seen[m[1]] = 1; }
        eq(dup.join(','), '', 'G5 no script is loaded twice' + (dup.length ? ' — ' + dup.join(', ') : ''));
    })();
})();

// ================================================================================================================
section('§F — Canada assets and hashes unchanged by R6');
// ================================================================================================================
(function () {
    // R6 touched no image. Pinned by digest so "unchanged" is a measurement, not a promise.
    var TIERS = {
        'earth-albedo-2048.jpg': '02037552b15ec5488e655467d5419a2b31f29777f9ccebca0cf49a27139637d9',
        'earth-albedo-4096.jpg': '366b86ec02abac1169583b64630304d94a6d782bdc44e65f4990e18a547bd28d',
        'earth-albedo-5400.jpg': '4f4240673a3a1b173d61b92ca4b07bac5fd17059ea5f725ba6da5a9c5386b7ba',
        'earth-albedo-8192.jpg': 'e7ca8837c1ec906479f55463955dbf68434a134146958aed646a06ae45a95779'
    };
    Object.keys(TIERS).forEach(function (f) {
        var buf = fs.readFileSync(path.join(ROOT, 'assets/img/earth', f));
        eq(sha256(buf), TIERS[f], 'F1 ' + f + ' is byte-identical to the accepted asset');
    });
    // The capture manifest must record the route census, or §F's evidence is a screenshot again.
    var man = path.join(ROOT, 'docs/planning/map-captures/after-r6/captures.json');
    ok(fs.existsSync(man), 'F2 the R6 capture manifest exists');
    if (fs.existsSync(man)) {
        var j = JSON.parse(fs.readFileSync(man, 'utf8'));
        ok(j.views.length >= 6, 'F2 with at least the six required views (' + j.views.length + ')');
        var routes = j.views.filter(function (v) { return /route/.test(v.view.id); });
        ok(routes.length >= 3, 'F3 including the three route views');
        routes.forEach(function (v) {
            var rt = (v.diag || {}).route_info || {};
            ok(rt.arcs_drawn >= 1, 'F3 ' + v.view.id + ' DREW an arc in the browser (' + rt.arcs_drawn + ')');
            eq(rt.arcs_skipped, 0, 'F3 ' + v.view.id + ' skipped none');
            ok(rt.vertices >= 80, 'F3 ' + v.view.id + ' emitted real geometry (' + rt.vertices + ' vertices)');
            eq(rt.attached, true, 'F3 ' + v.view.id + ' geometry is attached and will be drawn');
        });
        // No English geographic label anywhere in the captured label sets.
        j.views.forEach(function (v) {
            var cl = (v.diag || {}).continent_labels || [];
            ok(cl.length > 0, 'F4 ' + v.view.id + ' captured its continent labels');
            var eng = cl.filter(function (c) { return /[A-Za-z]{3}/.test(c.text); });
            eq(eng.map(function (c) { return c.text; }).join(','), '',
                'F4 ' + v.view.id + ' paints NO English geographic label');
            ok(cl.every(function (c) { return c.text && c.text.length > 0; }),
                'F4 ' + v.view.id + ' and no empty label was kept');
        });
    }
})();

// ================================================================================================================
console.log('\n----------------------------------------');
console.log('MAP LABEL + ROUTE RUNTIME (TEXTURE-3-R6): ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
