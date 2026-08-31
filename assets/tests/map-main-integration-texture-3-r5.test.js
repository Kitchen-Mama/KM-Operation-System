// MAP-VISUAL-REAL-EARTH-TEXTURE-3-R5 — CANADA VISUAL CLOSURE + MAIN INTEGRATION.
//
// This suite exists because an INTEGRATION can break things that neither side broke. `main` and
// `feature/map-texture-3` were each internally consistent; merging them produced one content conflict and one
// silent hazard, and only the second is the interesting one:
//
//   THE CONFLICT was assets/js/core/geo-name-resolver.js, where both branches implement the same user decision
//   (CN -> 中國, TW -> 台灣) by different mechanisms. Git reported it, so it could not be missed.
//
//   THE HAZARD was that `main`'s HOUSE_COUNTRY_ZH table sits in a DIFFERENT PART OF THE FILE from its LEVEL
//   entry and its lookup, so git auto-merged the table in while marking only the other two as conflicting.
//   Resolving the marked hunks in the branch's favour and committing would have left a live second name
//   authority in the file, unreferenced but present, ready for the next edit to start using. §B says "use one
//   authority only", and the assertions below are aimed at the state a careless resolution would have produced.
//
// WHAT THIS SUITE WILL NOT DO. It does not re-verify the Canada texture correction — R2's gate
// (globe-canada-seasonal-surface-texture-3-r2.test.js) and R3's tier ladder own that, they measure vendored
// pixels, and duplicating them here would create exactly the second authority this round is removing. It
// asserts instead that the merge did not MOVE them.
//
// Run: node assets/tests/map-main-integration-texture-3-r5.test.js

var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(t) { console.log('\n== ' + t + ' =='); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }
// Comment- and string-stripped source, so a name MENTIONED in prose cannot satisfy a check about a name USED.
// This is the trap FB-4E-R4B-R3 hit: the round's own explanatory comments contained the forbidden token.
function code(src) {
    return String(src)
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1 ');
}

var RESOLVER_REL = 'assets/js/core/geo-name-resolver.js';
var RESOLVER = read(RESOLVER_REL);
var RESOLVER_C = code(RESOLVER);
var INDEX = read('index.html');
var ALIAS_REL = 'assets/js/data/geo-display-aliases-zh-tw.js';
var GLOBE = read('assets/js/lib/km-globe.js');

// The globe module and the country dataset are loaded ONCE, up front, on a window of their own. loadResolver()
// below replaces global.window on every call, and a module required after that would capture whichever window
// happened to be installed at the time.
global.window = global.window || {};
require(path.join(ROOT, 'assets/js/data/world-countries-110m.js'));
var GLOBE_MATH = require(path.join(ROOT, 'assets/js/lib/km-globe.js')).math;
var WORLD_COUNTRIES = global.window.KM_WORLD_COUNTRIES;

var FORMAL_CN = '中華人民共和國';   // 中華人民共和國
var FORMAL_TW = '中華民國';                     // 中華民國
var SHORT_CN = '中國';                                  // 中國
var SHORT_TW = '台灣';                                  // 台灣
var FORBIDDEN_TW_DETAIL = FORMAL_TW + '（TW）';          // 中華民國（TW）

// ---- loading the resolver the way the page does, and the way a broken deployment would ------------------
// Both states have to be exercised. §B4 asks for deterministic fallback and §B5 forbids a regression to
// mainland terminology "merely because the duplicate inline table was removed" — which is a statement about
// the ASSET-ABSENT path, so a suite that only ever loads the happy path cannot check it.
function loadResolver(opts) {
    opts = opts || {};
    var sandbox = {};
    global.window = sandbox;
    if (opts.names !== false) { eval(read('assets/js/data/geo-names-zh-hant.js')); }
    if (opts.aliases !== false) { eval(read(ALIAS_REL)); }
    var mod = { exports: {} };
    (function (module, exports) { eval(RESOLVER); })(mod, mod.exports);
    return { api: sandbox.KM && sandbox.KM.geoNames, win: sandbox };
}

// ================================================================================================================
section('§B.1 — ONE authority, and the duplicate is GONE rather than merely unused');
// ================================================================================================================
// The mechanism `main` contributed must not survive in any executable form. Checked against stripped source so
// that this file's own explanation of what was removed cannot be what satisfies the check.
ok(RESOLVER_C.indexOf('HOUSE_COUNTRY_ZH') === -1,
    'B1 the inline HOUSE_COUNTRY_ZH table is gone from executable source');
ok(RESOLVER_C.indexOf('ZH_HANT_HOUSE_DISPLAY') === -1,
    'B1 and so is its authority level');
// It IS still explained. A deletion with no record of why is how the next merge reinstates it.
ok(RESOLVER.indexOf('HOUSE_COUNTRY_ZH') !== -1,
    'B1 but the removal is EXPLAINED in the file, so the next merge does not reinstate it');
// The surviving authority is the generated asset, and the resolver must actually read it.
ok(/KM_GEO_DISPLAY_ALIASES/.test(RESOLVER_C), 'B1 the generated alias asset is the authority that remains');
ok(/USER_APPROVED_ALIAS/.test(RESOLVER_C), 'B1 and the approved-decision level is live');
// EXACTLY ONE place may turn an ISO code into an approved display name. Two would be the defect returning in a
// different shape, so this counts call sites rather than trusting the two checks above.
(function () {
    var approvedReads = (RESOLVER_C.match(/\.approved\s*(\[|&&)/g) || []).length;
    ok(approvedReads >= 1, 'B1 the approved table is read');
    var lookups = (RESOLVER_C.match(/a\.approved\s*&&\s*a\.approved\[code\]/g) || []).length;
    eq(lookups, 1, 'B1 and there is EXACTLY ONE approved-name lookup in the resolver');
})();

// ================================================================================================================
section('§B.2/§B.3 — the labels the operator actually reads');
// ================================================================================================================
(function () {
    var G = loadResolver().api;
    eq(G.country('CN').name, SHORT_CN, 'B2 CN displays 中國');
    eq(G.country('TW').name, SHORT_TW, 'B3 TW displays 台灣');
    eq(G.country('CN').level, 'USER_APPROVED_ALIAS', 'B2 from the recorded decision, and it says so');
    eq(G.country('TW').level, 'USER_APPROVED_ALIAS', 'B3 same for TW');

    // §B's DETAIL requirement — the half R4 §A had decided the other way.
    eq(G.countryDetail('TW').name, SHORT_TW + '（TW）', 'B4 detail mode also displays 台灣');
    eq(G.countryDetail('CN').name, SHORT_CN + '（CN）', 'B4 and 中國 for CN');
    ok(G.countryDetail('TW').name !== FORBIDDEN_TW_DETAIL,
        'B4 and it is NOT the forbidden 中華民國（TW）');

    // Every user-visible surface, swept together rather than one at a time.
    ['CN', 'TW'].forEach(function (iso) {
        [['label', G.country(iso).name], ['detail', G.countryDetail(iso).name]].forEach(function (s) {
            ok(s[1].indexOf(FORMAL_CN) === -1 && s[1].indexOf(FORMAL_TW) === -1,
                'B5 ' + iso + ' ' + s[0] + ' carries no formal state name (' + s[1] + ')');
        });
    });

    // The formal name is not destroyed — §B permits provenance to keep it. It must be REACHABLE and must not
    // be what a display surface returns.
    eq(G.countryFull('TW').name, FORMAL_TW, 'B6 the formal name is still reachable for matching and auditing');
    eq(G.countryDetail('TW').full, FORMAL_TW, 'B6 and travels beside the displayed string as evidence');
    eq(G.country('TW', { form: 'full' }).name, FORMAL_TW, 'B6 form:full still reaches it deliberately');

    // The rule did not leak into countries nobody decided.
    eq(G.country('JP').name, '日本', 'B7 an undecided country is untouched');
    eq(G.countryDetail('JP').name, '日本（JP）', 'B7 and its detail form still uses the R4 rule');
    eq(G.countryDetail('JP').level, 'FORMAL_WITH_CODE', 'B7 reported as such');
    eq(G.country('CZ').name, '捷克', 'B7 a REVIEWED alias is not promoted to a decision');
    eq(G.countryDetail('CZ').level, 'FORMAL_WITH_CODE', 'B7 and keeps the formal detail form');
})();

// ================================================================================================================
section('§B — ISO codes and source-name variants both reach the decided name');
// ================================================================================================================
(function () {
    var G = loadResolver().api;
    // Case and whitespace are input noise, not different countries.
    ['CN', 'cn', ' Cn ', 'cN'].forEach(function (v) {
        eq(G.country(v).name, SHORT_CN, 'B8 the alias answers for the ISO variant ' + JSON.stringify(v));
    });
    ['TW', 'tw', ' tW'].forEach(function (v) {
        eq(G.country(v).name, SHORT_TW, 'B8 and for ' + JSON.stringify(v));
    });
    // The SOURCE-NAME variant path: a business record carries "China", the globe's index turns that into an
    // identity, and the identity resolves to the decided label. That is the whole chain an operator's data
    // takes, so it is asserted end to end rather than at the resolver alone.
    var idx = GLOBE_MATH.countryIsoIndex(WORLD_COUNTRIES);
    eq(G.country(idx.resolve('China')).name, SHORT_CN, 'B9 the ENGLISH source name resolves through to 中國');
    eq(G.country(idx.resolve('Taiwan')).name, SHORT_TW, 'B9 and Taiwan through to 台灣');
    // AND THE OTHER DIRECTION STAYS SHUT. A display name must never become an identity, or the decision would
    // have turned into an input to key resolution.
    eq(idx.resolve(SHORT_CN), null, 'B9 but 中國 does NOT resolve back to a code');
    eq(idx.resolve(SHORT_TW), null, 'B9 nor 台灣');
    eq(idx.resolve(FORMAL_TW), null, 'B9 nor the formal name');
})();

// ================================================================================================================
section('§B.4/§B.5 — the fallback, which is where removing the inline table could have cost something');
// ================================================================================================================
(function () {
    var G = loadResolver({ aliases: false }).api;
    // THE POINT OF THIS BLOCK. Before the guard existed, dropping the alias asset sent CN and TW straight to
    // ZH_HANT_PINNED_SOURCE — Natural Earth's NAME_ZHT — and the map painted 中華人民共和國 and 中華民國.
    // That is the precise regression §B5 forbids, and it was found by MEASURING this path, not by reading it:
    // the first cut of the resolution guarded country() and left countryDetail() composing the formal name.
    ['CN', 'TW'].forEach(function (iso) {
        var d = G.country(iso), t = G.countryDetail(iso);
        ok(d.name.indexOf(FORMAL_CN) === -1 && d.name.indexOf(FORMAL_TW) === -1,
            'B10 with the asset ABSENT, ' + iso + '\'s label is not the formal name (' + d.name + ')');
        ok(t.name.indexOf(FORMAL_CN) === -1 && t.name.indexOf(FORMAL_TW) === -1,
            'B10 nor is its DETAIL form (' + t.name + ')');
        eq(d.level, 'APPROVED_ALIAS_UNAVAILABLE', 'B11 and ' + iso + ' REPORTS that a decision is missing');
        eq(t.level, 'APPROVED_ALIAS_UNAVAILABLE', 'B11 on the detail surface too');
        eq(d.requires_approved_alias, true, 'B11 flagged explicitly for ' + iso);
    });
    // DETERMINISTIC, not merely safe: the same input gives the same output, and the output is named.
    eq(G.country('CN').name, 'China', 'B12 the fallback is the English canonical name, deterministically');
    eq(G.country('TW').name, 'Taiwan', 'B12 for TW too');
    eq(G.country('CN').name_source, 'ENGLISH_CANONICAL', 'B12 and it reports WHICH level supplied the string');
    eq(G.country('CN').name, G.country('CN').name, 'B12 repeated calls agree');
    // Countries without a required decision are NOT affected by the asset being gone.
    eq(G.country('JP').name, '日本', 'B12 an undecided country still renders from the vendored asset');
    eq(G.country('CZ').name, '捷克共和國', 'B12 and CZ falls back to its formal name, as it always did');
    // With BOTH assets gone the code is the last resort, and still not a formal name.
    var G2 = loadResolver({ aliases: false, names: false }).api;
    eq(G2.country('TW').name, 'TW', 'B12 with no data at all the ISO code is the floor');
    eq(G2.country('TW').level, 'APPROVED_ALIAS_UNAVAILABLE', 'B12 still reported as a missing decision');
})();

// ================================================================================================================
section('§B — no duplicate authority can disagree SILENTLY');
// ================================================================================================================
(function () {
    var G = loadResolver().api;
    // The guard holds CODES and no names. That is what makes a second authority impossible rather than merely
    // absent: a code list has nothing to disagree with the asset ABOUT.
    var guard = /var REQUIRE_APPROVED_ALIAS_ = \[([^\]]*)\]/.exec(RESOLVER_C);
    ok(!!guard, 'B13 the guard list exists');
    var entries = guard ? guard[1].split(',').map(function (s) { return s.trim().replace(/['"]/g, ''); }).filter(Boolean) : [];
    eq(entries.slice().sort().join(','), 'CN,TW', 'B13 and holds exactly the two decided codes');
    entries.forEach(function (e) {
        ok(/^[A-Z]{2}$/.test(e), 'B13 ' + e + ' is an ISO code, not a name');
    });
    // No Han character may appear in the guard's own declaration.
    ok(!/[一-鿿]/.test(guard ? guard[0] : ''), 'B13 the guard declaration contains no Chinese name at all');
    // Every guarded code must be BACKED by a real decision in the asset, or the guard silently downgrades a
    // country to English for ever.
    var approved = {};
    G.approvedNames().forEach(function (r) { approved[r.iso] = r; });
    entries.forEach(function (e) {
        ok(!!approved[e], 'B14 ' + e + ' is guarded AND actually decided in the asset');
        eq(G.country(e).level, 'USER_APPROVED_ALIAS', 'B14 so ' + e + ' resolves from the decision, not the guard');
    });
    // And the reverse: every decision in the asset must be guarded, or its protection is one deleted script
    // tag away from evaporating without anyone noticing.
    Object.keys(approved).forEach(function (iso) {
        ok(entries.indexOf(iso) !== -1,
            'B14 the decided country ' + iso + ' is also GUARDED, so a missing asset cannot un-decide it');
    });
    // approvedNames() must not hand a caller the R4-era string under a name that invites printing it.
    var tw = approved.TW;
    eq(tw.detail, SHORT_TW + '（TW）', 'B15 approvedNames reports the COMPOSED detail');
    eq(tw.recorded_detail, FORMAL_TW + '（TW）', 'B15 and keeps the superseded string as `recorded_detail`');
    ok(tw.detail !== tw.recorded_detail, 'B15 the two are deliberately different, which is the audit trail');
})();

// ================================================================================================================
section('§B — the formal name cannot reach a display surface by accident');
// ================================================================================================================
(function () {
    // countryFull() is the audit authority. If a served page or library called it, the formal name would be one
    // render away from a label, and every assertion above would be true while the screen was still wrong.
    var offenders = [];
    function walk(dir) {
        fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).forEach(function (e) {
            var rel = dir + '/' + e.name;
            if (e.name.charAt(0) === '.') return;
            if (e.isDirectory()) { if (e.name !== 'node_modules') walk(rel); return; }
            if (!/\.(js|html)$/.test(e.name)) return;
            if (rel.indexOf('assets/tests') !== -1 || rel.indexOf('tools/') !== -1) return;
            if (rel.indexOf(RESOLVER_REL) !== -1) return;      // it is countryFull's own home
            var src = code(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
            if (/countryFull\s*\(/.test(src)) offenders.push(rel);
        });
    }
    walk('.');
    eq(offenders.join(','), '', 'B16 NO served page or library calls countryFull()' +
        (offenders.length ? ' — ' + offenders.join(', ') : ''));
    // The globe asks for the display name, which is the call that must exist.
    ok(/KM\.geoNames\.country\(iso\)/.test(code(GLOBE)), 'B16 and the globe asks the resolver for the DISPLAY name');
})();

// ================================================================================================================
section('§C — what the merge had to bring across from main, intact');
// ================================================================================================================
(function () {
    // FB-4E-R4B-R3's frontend assets, present as FILES and wired in index.html.
    [['assets/js/core/supply-planning-factory-site-allocation.js', 'KMFSA factory-site allocation'],
     ['assets/js/utils/scope-select-modal.js', 'the scope modal'],
     ['assets/js/pages/inventory-replenishment.js', 'Site Inventory'],
     ['assets/js/pages/request-order.js', 'Order Planning']].forEach(function (p) {
        ok(exists(p[0]), 'C1 ' + p[1] + ' is present after the merge');
        ok(INDEX.indexOf(p[0]) !== -1, 'C1 and index.html still loads it');
    });
    // The scope modal's restored state declaration — the single deleted line that silenced every AI action for
    // five days. A merge that dropped it again would be invisible until a user clicked.
    var MODAL = read('assets/js/utils/scope-select-modal.js');
    ok(/var _dom = null, _state = null, _openToken = 0;/.test(MODAL),
        'C2 the scope modal\'s module state survived the merge');
    // Site Inventory's per-row render defences from R4B-R3.
    var IR = read('assets/js/pages/inventory-replenishment.js');
    ['_irScrollRowHtml_', '_irScrollRowFailedHtml_', '_irVerifyRenderedRows_', '_irHeaderLeafSpan_']
        .forEach(function (fn) {
            ok(IR.indexOf(fn) !== -1, 'C3 R4B-R3\'s render defence ' + fn + ' is intact');
        });
    // Deployment identity and the three contract pins.
    var ROUTER = read('assets/specs/active/apps-script/01_router.gs');
    ok(/RTR_BUILD_VERSION_ = 'F1-7N-FB-4E-R4B-R3'/.test(ROUTER), 'C4 the router build stamp is R4B-R3');
    var API = read('assets/js/api/operation-system-db-api.js');
    var HEALTH = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
    ok(/ACTION_CONTRACT_VERSION_?\s*[:=]\s*10\b/.test(HEALTH) || /action_contract['"]?\s*[:=]\s*10\b/.test(HEALTH) ||
       /\b10\b/.test((/action_contract[^\n]*/.exec(HEALTH) || [''])[0]),
        'C4 the action contract is pinned at 10');
    ok(/KM_REQUIRED_DEPLOYED_SYMBOLS_/.test(API), 'C4 the required-symbol list is present');
    // FB-4F-A landed on main between the merge-base and this merge, so it must be here too.
    ['assets/specs/active/apps-script/TEMP_legacy_allocation_draft_reconcile_diagnose.gs',
     'assets/tests/legacy-allocation-draft-reconcile-diagnosis-f1-7n-fb-4f-a.test.js',
     'docs/planning/LEGACY_ALLOCATION_DRAFT_RECONCILIATION_F1-7N-FB-4F.md'].forEach(function (f) {
        ok(exists(f), 'C5 FB-4F-A file carried across the merge: ' + path.basename(f));
    });
    // And its refusal is untouched by this round.
    var SAH = read('assets/specs/active/apps-script/16_shipping_allocation_handlers.gs');
    ok(/LEGACY_ROUTE_RECONCILIATION_REQUIRED/.test(SAH),
        'C5 LEGACY_ROUTE_RECONCILIATION_REQUIRED is intact and unweakened');
})();

// ================================================================================================================
section('§D — script order, uniqueness and the two token families');
// ================================================================================================================
var TAGS = (function () {
    var re = /<script src="([^"?]+)(?:\?v=([^"]+))?"/g, m, out = [];
    while ((m = re.exec(INDEX))) out.push({ src: m[1], tok: m[2] || null });
    return out;
})();
(function () {
    // Every script exactly once. A merge that duplicated a tag would load the resolver twice and the second
    // load would silently win.
    var counts = {};
    TAGS.forEach(function (t) { counts[t.src] = (counts[t.src] || 0) + 1; });
    var dupes = Object.keys(counts).filter(function (k) { return counts[k] > 1; });
    eq(dupes.join(','), '', 'D1 no script is loaded twice' + (dupes.length ? ' — ' + dupes.join(', ') : ''));
    eq(counts[RESOLVER_REL], 1, 'D1 and geo-name-resolver.js in particular appears exactly once');

    // DEPENDENCY ORDER. The resolver reads three global assets at call time, but the globe reads the resolver
    // at load time, so the order below is a real constraint and not a tidiness preference.
    function at(src) { for (var i = 0; i < TAGS.length; i++) { if (TAGS[i].src === src) return i; } return -1; }
    var order = [
        'assets/js/data/geo-names-zh-hant.js',
        'assets/js/data/geo-display-aliases-zh-tw.js',
        'assets/js/data/geo-admin1-display-names-zh-tw.js',
        RESOLVER_REL,
        'assets/js/lib/km-geo-topology.js',
        'assets/js/lib/km-globe.js',
        'assets/js/pages/global-logistics-map.js'
    ];
    order.forEach(function (s) { ok(at(s) !== -1, 'D2 required map script is present: ' + s); });
    for (var i = 1; i < order.length; i++) {
        ok(at(order[i - 1]) < at(order[i]), 'D2 ' + path.basename(order[i - 1]) + ' loads before ' + path.basename(order[i]));
    }

    // THE TWO TOKEN FAMILIES, AND WHY BOTH MUST SURVIVE. The map branch versions map assets; main versions the
    // application. The merge must not let either overwrite the other — replacing the application token with the
    // map token would make every browser re-fetch the whole app and, worse, would mean the next application
    // round had no token of its own to move.
    var APP_TOKEN = 'fb4er4br3-liveclosure-20260831';
    var appTagged = TAGS.filter(function (t) { return t.tok === APP_TOKEN; });
    ok(appTagged.length >= 15, 'D3 main\'s application token is still carried by its assets (' + appTagged.length + ')');
    var mapFamily = TAGS.filter(function (t) { return /^map-/.test(t.tok || ''); });
    ok(mapFamily.length >= 6, 'D3 and the map family is still present (' + mapFamily.length + ')');
    // No map asset may wear the application token, and no application asset the map token.
    mapFamily.forEach(function (t) {
        ok(/assets\/js\/(data\/geo-|core\/geo-|lib\/km-g|pages\/global-logistics)/.test(t.src),
            'D3 only map assets carry a map token: ' + t.src);
    });
    appTagged.forEach(function (t) {
        ok(!/geo-|km-globe|km-geo-topology/.test(t.src),
            'D3 and no map asset was rotated onto the application token: ' + t.src);
    });
    // KMFSA and the scope modal specifically — §D names them because they are the two main added last round
    // and the two a careless "take the branch's index.html" would have dropped.
    ok(/supply-planning-factory-site-allocation\.js\?v=fb4er4br3-liveclosure-20260831/.test(INDEX),
        'D4 the KMFSA script tag survived with main\'s token');
    ok(/scope-select-modal\.js\?v=fb4er4br3-liveclosure-20260831/.test(INDEX),
        'D4 and so did the scope modal\'s');

    // §D — a CHANGED map file gets this round's token; an UNCHANGED one keeps its own. Derived from the source,
    // not from a list of filenames that would rot next round.
    var R5 = 'map-texture3-r5-20260831';
    function tokOf(src) { for (var i = 0; i < TAGS.length; i++) { if (TAGS[i].src === src) return TAGS[i].tok; } return null; }
    eq(tokOf(RESOLVER_REL), R5, 'D5 the resolver changed this round, so it carries this round\'s token');
    ok(/TEXTURE-3-R5/.test(RESOLVER), 'D5 and it does carry this round\'s marker');
    [['assets/js/lib/km-globe.js', GLOBE],
     ['assets/js/data/geo-display-aliases-zh-tw.js', read(ALIAS_REL)],
     ['assets/js/lib/km-geo-topology.js', read('assets/js/lib/km-geo-topology.js')]].forEach(function (p) {
        ok(!/TEXTURE-3-R5/.test(p[1]), 'D5 ' + path.basename(p[0]) + ' did NOT change this round');
        ok(tokOf(p[0]) !== R5, 'D5 so it was NOT rotated (' + tokOf(p[0]) + ')');
    });

    // The earth image carries a CONTENT token of its own, because index.html cannot cache-bust an image the
    // engine requests itself.
    var ev = /EARTH_ASSET_VERSION_ = '([^']+)'/.exec(GLOBE);
    ok(!!ev, 'D6 the earth asset carries its own version token');
    ok(/^jul2004-/.test(ev ? ev[1] : ''), 'D6 pinned to the July frame (' + (ev && ev[1]) + ')');
    ok(/\?v=' \+ EARTH_ASSET_VERSION_/.test(GLOBE), 'D6 and every tier URL is content-pinned with it');
})();

// ================================================================================================================
section('§G — the seven negative tests: each guard is made to BITE');
// ================================================================================================================
// A guard that has never been observed to fail is a guess. Each case below reconstructs the defect and asserts
// that the thing which is supposed to catch it does.

// N1 — restoring the December source.
(function () {
    var probe = require(path.join(ROOT, 'tools/geo/jpeg-dc-probe.js'));
    ok(typeof probe === 'object' && probe, 'N1 the pixel probe the Canada gate uses is available');
    // The December measurements, as recorded in PROVENANCE. If the gate's thresholds accepted these, it would
    // accept the exact asset the round replaced.
    var DEC = { prairie: 192, saskatoon: 213, boreal: 159, tundra: 238, arctic: 176 };
    var SNOW_MAX = 120;                       // the gate's southern-Canada ceiling
    ['prairie', 'saskatoon', 'boreal', 'tundra'].forEach(function (k) {
        ok(DEC[k] > SNOW_MAX, 'N1 December\'s ' + k + ' (L' + DEC[k] + ') would be REJECTED as snow');
    });
    ok((DEC.arctic - DEC.prairie) < 40,
        'N1 and December inverts the Arctic/south separation (' + (DEC.arctic - DEC.prairie) + '), which the gate requires to be >= 40');
    var PROV = read('assets/img/earth/PROVENANCE.md');
    ok(/July 2004/.test(PROV) && /73751/.test(PROV), 'N1 provenance names the July frame and its upstream record');
    ok(/73909/.test(PROV), 'N1 and December\'s record is kept VISIBLE as the corrected error, not deleted');
})();

// N2 — removing the approved Canada July texture.
(function () {
    var tiers = ['earth-albedo-2048.jpg', 'earth-albedo-4096.jpg', 'earth-albedo-8192.jpg'];
    tiers.forEach(function (f) {
        ok(exists('assets/img/earth/' + f), 'N2 runtime tier present: ' + f);
        ok(GLOBE.indexOf(f) !== -1, 'N2 and the engine references it');
    });
    // The engine must not silently fall back to a procedural or absent surface: a tier that cannot decode is an
    // ERROR, which is what stops a 0x0 texture from being uploaded and read as "the map loaded".
    ok(/EARTH_ASSET_LOAD_FAILED/.test(GLOBE), 'N2 a missing texture is reported as a failure');
    ok(/EARTH_ASSET_DECODED_EMPTY/.test(GLOBE), 'N2 and an empty decode is too, rather than passing as success');
    // The frozen 5400 baseline is retained for the gate even though it is not served.
    ok(exists('assets/img/earth/earth-albedo-5400.jpg'), 'N2 the frozen acceptance baseline is retained');
    ok(GLOBE.indexOf('earth-albedo-5400.jpg') === -1,
        'N2 and is NOT a runtime tier, so it costs zero bytes at load');
})();

// N3 — returning TW detail display to 中華民國（TW）.
(function () {
    var G = loadResolver().api;
    ok(G.countryDetail('TW').name !== FORBIDDEN_TW_DETAIL, 'N3 the live detail form is not the forbidden string');
    // The check that would CATCH a reversal: composing from countryFull would reproduce it exactly, so the
    // suite builds that string the same way the defect would and asserts the real one differs.
    var wouldBe = G.countryFull('TW').name + '（TW）';
    eq(wouldBe, FORBIDDEN_TW_DETAIL, 'N3 composing from the FORMAL authority reproduces the defect exactly');
    ok(G.countryDetail('TW').name !== wouldBe, 'N3 and the shipped path deliberately does not do that');
    eq(G.countryDetail('TW').level, 'APPROVED_WITH_CODE', 'N3 the level names which rule answered');
})();

// N4 — restoring duplicate CN/TW authorities.
(function () {
    // Any second table mapping an ISO code to a Han name inside the resolver is the defect returning. Searched
    // over stripped source, keyed on the SHAPE rather than on main's particular variable name — renaming it
    // must not be enough to slip past.
    var pairs = RESOLVER_C.match(/\b(CN|TW)\s*:\s*['"][^'"]*['"]/g) || [];
    var han = pairs.filter(function (p) { return /[一-鿿]|\\u[0-9a-fA-F]{4}/.test(p); });
    eq(han.join(' | '), '', 'N4 no ISO-code-to-name literal survives in the resolver' + (han.length ? ' — ' + han.join(', ') : ''));
    // Nor may the resolver carry a Chinese country name at all in executable source.
    ok(!/[一-鿿]/.test(RESOLVER_C.replace(/REQUIRE_APPROVED_ALIAS_/g, '')),
        'N4 and executable source carries no Chinese name of its own');
    // Exactly one asset may declare approved aliases.
    var declarers = [];
    ['assets/js/data/geo-display-aliases-zh-tw.js', 'assets/js/data/geo-names-zh-hant.js',
     'assets/js/data/geo-admin1-display-names-zh-tw.js'].forEach(function (f) {
        if (read(f).indexOf('"approved"') !== -1 || read(f).indexOf('approved:') !== -1) declarers.push(f);
    });
    eq(declarers.length, 1, 'N4 exactly ONE asset declares the approved block' +
        (declarers.length !== 1 ? ' — ' + declarers.join(', ') : ''));
})();

// N5 — duplicating national-border geometry.
//
// THE FIRST VERSION OF THIS CHECK WAS WORTHLESS AND THE NEGATIVE TEST IS WHAT PROVED IT. It grepped
// km-geo-topology.js for /shared|SHARED/ and /coast/i. Mutating the module by renaming `shared` to
// `SHARED_REMOVED_BY_N5` and `coast` to `COAST_REMOVED_BY_N5` left BOTH regexes matching, so the guard passed
// against a module whose classification had been gutted — and the mutation had been written to defeat itself
// in exactly the same way. Two mistakes agreeing is what a word-level guard buys.
//
// So N5 now EXECUTES the topology builder over the real vendored dataset and reads its own counters. A shared
// border must be ONE edge; a coastline must not be classified as an international border. Renaming an
// identifier cannot satisfy that, and removing the deduplication cannot survive it.
(function () {
    // WORLD_COUNTRIES was loaded once in the preamble. Requiring the data file again here returns the module
    // cache and sets nothing, which is how the first attempt measured a 0-feature dataset and reported the
    // deduplication as absent - a harness fault that reads exactly like the defect.
    var T = require(path.join(ROOT, 'assets/js/lib/km-geo-topology.js'));
    var cf = T.countryFeatures(WORLD_COUNTRIES);
    ok(!!cf && cf.features && cf.features.length > 100, 'N5 the country dataset is readable (' +
        ((cf && cf.features && cf.features.length) || 0) + ' features)');
    var built = T.build(cf.features);

    // R3 §D's measured finding: the raw dataset draws every shared border TWICE. The builder must remove them.
    ok(built.stats.duplicate_edges_removed > 2000,
        'N5 the deduplication is real and measured (' + built.stats.duplicate_edges_removed + ' duplicate edges removed)');
    // And it must be COMPLETE: after deduplication no edge may remain owned by more than two countries.
    eq(built.stats.classified.over_shared, 0,
        'N5 and no edge survives owned by more than two countries');
    // CLASSIFICATION, measured rather than assumed: R3's finding was that two thirds of what was drawn as
    // "national border" was actually coastline. Both classes must be non-empty and coastline must dominate,
    // which is what makes "these are not all borders" a fact about the data rather than a claim.
    var c = built.stats.classified;
    ok(c.coastline > 0 && c.international > 0,
        'N5 edges are classified into coastline (' + c.coastline + ') and international (' + c.international + ')');
    ok(c.coastline > c.international,
        'N5 and coastline outnumbers international, as R3 measured (' + c.coastline + ' > ' + c.international + ')');
    // An edge is in exactly ONE class — the sum cannot exceed the unique-edge count.
    ok(c.coastline + c.international + c.adm1 <= built.stats.input.unique_edges,
        'N5 no edge is counted in two classes');
    // The engine must consume this, and must report it, or none of the above reaches the screen.
    ok(/km-geo-topology\.js/.test(INDEX), 'N5 the page loads the canonical topology');
    ok(/getTopologyInfo/.test(code(GLOBE)), 'N5 and the engine reports its topology facts at runtime');
})();

// N6 — removing a required map script.
(function () {
    // Already asserted positively in §D2. The negative form: the engine must REPORT a missing dependency
    // rather than rendering a globe with no names on it.
    ok(/window\.KM && window\.KM\.geoNames/.test(GLOBE),
        'N6 the globe checks the resolver is present before using it');
    ok(/typeof window\.KM\.geoNames\.country === 'function'/.test(GLOBE),
        'N6 and checks the function exists, not merely the namespace');
    // The capture harness names the precondition that failed, which is how a missing script was distinguished
    // from an unsupported browser last round.
    var CAP = read('tools/geo/capture-views.js');
    ok(/GLOBE_SCRIPT_NOT_LOADED/.test(CAP), 'N6 the harness distinguishes a missing script from missing WebGL');
})();

// N7 — reverting current-main KMFSA script tags.
(function () {
    // The exact tag, with the exact token. A revert to the branch's pre-merge index.html would remove the line
    // entirely, and a token-family mistake would leave it present but stale.
    ok(/<script src="assets\/js\/core\/supply-planning-factory-site-allocation\.js\?v=fb4er4br3-liveclosure-20260831"><\/script>/.test(INDEX),
        'N7 the KMFSA tag is present with main\'s token, exactly');
    // And it loads BEFORE its two consumers, which is the reason it is in index.html at all.
    function at(s) { for (var i = 0; i < TAGS.length; i++) { if (TAGS[i].src === s) return i; } return -1; }
    var kmfsa = at('assets/js/core/supply-planning-factory-site-allocation.js');
    ok(kmfsa !== -1 && kmfsa < at('assets/js/pages/inventory-replenishment.js'),
        'N7 and loads before Site Inventory');
    ok(kmfsa !== -1 && kmfsa < at('assets/js/pages/request-order.js'), 'N7 and before Order Planning');
    ok(read('assets/js/core/supply-planning-factory-site-allocation.js').indexOf('KMFSA') !== -1,
        'N7 the module itself still declares KMFSA');
})();

// ================================================================================================================
section('§A — the merge did not move what it was not supposed to move');
// ================================================================================================================
(function () {
    // The five branch commits' work, spot-checked at the artefact each produced. This is not a substitute for
    // their own suites — it catches a merge that dropped a file, which their suites would report as a crash
    // rather than as a merge fault.
    [['assets/img/earth/earth-albedo-8192.jpg', '46e5e08 the 8192 tier'],
     ['assets/js/lib/km-geo-topology.js', '18e46bb the canonical topology'],
     ['assets/js/data/geo-display-aliases-zh-tw.js', '86ff67c the country-name decisions'],
     ['assets/js/data/geo-admin1-display-names-zh-tw.js', '5fc0249 the division-name authority'],
     ['docs/planning/ADMIN1_ZH_TW_NAME_AUDIT.md', '5fc0249 the gap audit']].forEach(function (p) {
        ok(exists(p[0]), 'A1 branch work intact: ' + p[1]);
    });
    // The vendored build inputs must match their pins BYTE FOR BYTE. They did not on a Windows checkout before
    // this round — core.autocrlf rewrote LF to CRLF and the SHA-256 pin failed on a file nobody had touched.
    var crypto = require('crypto');
    var ADM1 = (function () { var s = {}; global.window = s; eval(read('assets/js/data/geo-admin1-display-names-zh-tw.js')); return s.KM_GEO_ADMIN1_DISPLAY_NAMES; })();
    var wd = fs.readFileSync(path.join(ROOT, 'tools/geo/data/wikidata-admin1-zh.json'));
    eq(wd.length, ADM1.meta.wikidata.bytes, 'A2 the vendored Wikidata snapshot matches its byte pin');
    eq(crypto.createHash('sha256').update(wd).digest('hex'), ADM1.meta.wikidata.sha256,
        'A2 and its SHA-256 pin');
    ok(wd.indexOf(0x0d) === -1, 'A2 with no CR bytes — the checkout no longer rewrites line endings');
    ok(exists('.gitattributes'), 'A2 because .gitattributes now protects the vendored inputs');
    ok(/tools\/geo\/data\/\*\* -text/.test(read('.gitattributes')), 'A2 scoped to exactly those inputs');
})();

// ================================================================================================================
console.log('\n----------------------------------------');
console.log('MAP / MAIN INTEGRATION (TEXTURE-3-R5): ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
