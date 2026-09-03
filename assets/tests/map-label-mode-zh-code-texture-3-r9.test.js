// MAP-VISUAL-REAL-EARTH-TEXTURE-3-R9 / R9A — GEOGRAPHIC LABEL MODE: Labels = Names | Code.
//
// R9 built the switch; R9A shortened its visible copy from `Label Display` / `中文` / `Code` to `Labels` /
// `Names` / `Code`. The INTERNAL values did not move and there is no migration: §R9A below is the section that
// proves it, because a copy change that renamed a stored value would orphan every saved preference in silence.
//
// One switch in Map Controls, over the two GEOGRAPHIC label layers only. The interesting thing about it is how
// little it had to invent: `code` mode paints the identity each feature already carries — ISO 3166-1 alpha-2 for
// countries, which is literally the key the country layer is indexed by, and the ISO 3166-2 subdivision code for
// divisions, which the ADM1 asset already stores in `k` and already certifies with `t === 0`. There is no second
// dictionary here because there was nothing left to look up.
//
// WHICH IS ALSO WHY IT IS NOT CALLED ENGLISH. `CN`, `US`, `BC`, `TX` are codes. A control labelled "EN" would
// promise `China` and `British Columbia`, and this mode has no idea what those are.
//
// THE ONE THING CODE MODE CANNOT DO is invent a code for a division that has none. Measured on the shipped
// asset: 2,340 of 3,835 divisions carry an alphabetic ISO 3166-2 code (t=0); 1,424 have a numeric ISO code and
// 71 have no ISO code at all. So 39% of divisions fall back to their reviewed Chinese name in code mode. That is
// the ordinary path, not an edge case, and deriving `CA` from "California" to close the gap would be a name
// parser masquerading as an authority.
//
// Run: node assets/tests/map-label-mode-zh-code-texture-3-r9.test.js

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
function sha256(rel) { return crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, rel))).digest('hex'); }
// Comments are prose. A name mentioned in a comment must never satisfy a check about a name USED.
function code(src) {
    return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1 ');
}

var RO = require(path.join(ROOT, 'assets/tests/_release-order.js'));
var PAGE_REL = 'assets/js/pages/global-logistics-map.js';
var GLOBE_REL = 'assets/js/lib/km-globe.js';
var CSS_REL = 'assets/css/pages/global-logistics-map.css';
var PAGE = read(PAGE_REL), PAGE_C = code(PAGE);
var GLOBE = read(GLOBE_REL), GLOBE_C = code(GLOBE);
var INDEX = read('index.html');

var FORMAL_CN = '中華人民共和國', FORMAL_TW = '中華民國', FORMAL_TW_CODE = '中華民國（TW）';
var STORAGE_KEY = 'km.map.labelMode.v1';

// ---- lifting the real code out, rather than describing it -------------------------------------------------
function extractFn(name, src) {
    var i = src.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('not found: function ' + name);
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
// A whole statement, paren-matched from its opening call. The label-switch binding lives inside bindRuntime and
// is not a named function, so it is lifted by balancing rather than by name.
//
// THE ANCHOR MUST END AT THE PAREN TO BALANCE FROM. The first draft balanced from the start of the anchor, so
// the first '(' it met was `querySelectorAll(` — which closes two characters later, and the "statement" it
// returned was `r.querySelectorAll('[data-labelmode]');`: a perfectly valid no-op that bound nothing. The
// symptom was an unbound button, which reads like a product defect and was a test defect.
// AND THE ANCHOR MUST BE UNAMBIGUOUS. `r.querySelectorAll('[data-labelmode]').forEach(` occurs TWICE in the
// page — once in paintLabelModeControl and once in bindRuntime — so an unscoped search lifted the painter and
// ran it as if it were the binder. `within` scopes the search to the function actually under test, and a
// remaining ambiguity throws rather than silently picking the first.
function statementAt(src, anchor, within) {
    var base = 0;
    if (within) {
        base = src.indexOf('function ' + within + '(');
        if (base < 0) throw new Error('scope not found: ' + within);
    }
    var i = src.indexOf(anchor, base);
    if (i < 0) throw new Error('anchor not found: ' + anchor);
    if (src.indexOf(anchor, i + 1) !== -1 && !within) throw new Error('ambiguous anchor, pass a scope: ' + anchor);
    if (anchor.charAt(anchor.length - 1) !== '(') throw new Error('anchor must end at the paren to balance: ' + anchor);
    var from = i + anchor.length - 1;
    var depth = 0, started = false;
    for (var j = from; j < src.length; j++) {
        if (src[j] === '(') { depth++; started = true; }
        else if (src[j] === ')') { depth--; if (started && depth === 0) return src.slice(i, j + 1) + ';'; }
    }
    throw new Error('unbalanced statement at: ' + anchor);
}

// ==============================================================================================================
section('§B — the label mode authority, executed');
// ==============================================================================================================
var AUTHORITY = [
    decl(/var LABEL_MODE_KEY\s*=\s*[^;]+;/, PAGE, 'LABEL_MODE_KEY'),
    decl(/var LABEL_MODES\s*=\s*\[[^\]]*\];/, PAGE, 'LABEL_MODES'),
    decl(/var LABEL_MODE_DEFAULT\s*=\s*[^;]+;/, PAGE, 'LABEL_MODE_DEFAULT'),
    decl(/var labelModeSubs\s*=\s*\[\];/, PAGE, 'labelModeSubs'),
    extractFn('validLabelMode', PAGE),
    extractFn('readLabelMode', PAGE),
    extractFn('writeLabelMode', PAGE),
    extractFn('getLabelMode', PAGE),
    extractFn('setLabelMode', PAGE),
    extractFn('onLabelModeChange', PAGE),
    extractFn('renderLabelModeControl', PAGE),
    extractFn('paintLabelModeControl', PAGE),
    // the two module-scope subscribers, exactly as the page registers them
    decl(/onLabelModeChange\(function \(m\) \{[\s\S]*?\n  \}\);/, PAGE, 'globe subscriber'),
    decl(/onLabelModeChange\(function \(\) \{ paintLabelModeControl\(\); \}\);/, PAGE, 'paint subscriber')
].join('\n');
var BIND_BLOCK = statementAt(PAGE, "r.querySelectorAll('[data-labelmode]').forEach(", 'bindRuntime');

// A DOM small enough to reason about and faithful where it matters: attributes are real strings, classList
// add/remove is real, and focus() is observable.
function makeDom(html) {
    var els = [];
    // The control is generated by the page's own renderLabelModeControl(), so the buttons under test are the
    // shipped markup rather than a hand-written imitation.
    var re = /<button([^>]*)data-labelmode="([^"]+)"([^>]*)>([^<]*)<\/button>/g, m;
    // ONE ELEMENT PER ITERATION, BUILT IN ITS OWN SCOPE. The first draft declared `var cls` inside the while
    // loop and closed over it, and `var` is function-scoped — so both buttons shared a single class array and
    // "only one option is active" passed for the wrong reason: it could not have failed. A stub that cannot
    // distinguish the two elements it exists to compare is worse than no stub.
    function mkButton(attrs, text) {
        var cls = (attrs['class'] || '').split(/\s+/).filter(Boolean);
        return {
            _attrs: attrs, _cls: cls, text: text, focused: 0, onclick: null, onkeydown: null,
            getAttribute: function (n) { return this._attrs[n] === undefined ? null : this._attrs[n]; },
            setAttribute: function (n, v) { this._attrs[n] = String(v); },
            focus: function () { this.focused++; },
            classList: {
                add: function (c) { if (cls.indexOf(c) === -1) cls.push(c); },
                remove: function (c) { var i = cls.indexOf(c); if (i !== -1) cls.splice(i, 1); },
                contains: function (c) { return cls.indexOf(c) !== -1; }
            }
        };
    }
    while ((m = re.exec(html))) {
        var attrs = {};
        var all = m[1] + ' data-labelmode="' + m[2] + '" ' + m[3];
        var ar = /([a-zA-Z-]+)="([^"]*)"/g, a;
        while ((a = ar.exec(all))) attrs[a[1]] = a[2];
        els.push(mkButton(attrs, m[4]));
    }
    var group = { querySelectorAll: function () { return els; } };
    els.forEach(function (e) { e.parentNode = group; });
    return { els: els, group: group, querySelectorAll: function () { return els; } };
}
// localStorage, in the four states that matter: empty, holding a good value, holding garbage, and broken.
function makeStorage(kind, seed) {
    var store = {};
    if (seed !== undefined) store[STORAGE_KEY] = seed;
    var log = { reads: 0, writes: 0, removes: 0 };
    return {
        log: log, store: store,
        api: {
            getItem: function (k) { log.reads++; if (kind === 'throw-read' || kind === 'throw') throw new Error('denied'); return (k in store) ? store[k] : null; },
            setItem: function (k, v) { log.writes++; if (kind === 'throw-write' || kind === 'throw') throw new Error('quota'); store[k] = String(v); },
            removeItem: function (k) { log.removes++; if (kind === 'throw') throw new Error('denied'); delete store[k]; }
        }
    };
}
function harness(opts) {
    opts = opts || {};
    var st = makeStorage(opts.storage || 'ok', opts.seed);
    var globeCalls = { setLabelMode: [], other: [] };
    var globe = opts.noGlobe ? null : {
        setLabelMode: function (m) { globeCalls.setLabelMode.push(m); return m; },
        focus: function () { globeCalls.other.push('focus'); },
        zoomIn: function () { globeCalls.other.push('zoomIn'); },
        reset: function () { globeCalls.other.push('reset'); }
    };
    var renders = 0, dom = null;
    var sb = {
        window: { localStorage: st.api },
        String: String, Object: Object, Error: Error, console: console,
        esc: function (v) { return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); },
        root: function () { return dom; },
        render: function () { renders++; },
        state: null
    };
    sb.globalThis = sb;
    var ctx = vm.createContext(sb);
    vm.runInContext('var state = { globe: null, filters: { kpi: "", search: "" }, selectedShipmentId: "", mapPanelCollapsed: false, labelMode: "zh-TW", labelModePersisted: true };', ctx);
    vm.runInContext(AUTHORITY, ctx);
    // state.labelMode restored the way the page restores it
    vm.runInContext('state.labelMode = readLabelMode();', ctx);
    vm.runInContext('state.globe = ' + (opts.noGlobe ? 'null' : '__globe') + ';', (function () { sb.__globe = globe; return ctx; })());
    var api = {
        ctx: ctx, storage: st, globeCalls: globeCalls,
        renders: function () { return renders; },
        mode: function () { return vm.runInContext('getLabelMode()', ctx); },
        set: function (v) { return vm.runInContext('setLabelMode(' + JSON.stringify(v) + ')', ctx); },
        html: function () { return vm.runInContext('renderLabelModeControl()', ctx); },
        buildDom: function () { dom = makeDom(api.html()); api.bind(); return dom; },
        bind: function () {
            sb.__r = dom;
            vm.runInContext('(function (r) { ' + BIND_BLOCK + ' })(__r);', ctx);
        },
        els: function () { return dom ? dom.els : []; },
        btn: function (v) { return api.els().filter(function (e) { return e.getAttribute('data-labelmode') === v; })[0]; },
        subs: function () { return vm.runInContext('labelModeSubs.length', ctx); },
        vocabulary: function () { return vm.runInContext('JSON.stringify(LABEL_MODES)', ctx); },
        key: function () { return vm.runInContext('LABEL_MODE_KEY', ctx); }
    };
    return api;
}

// H1 — deterministic default.
(function () {
    var h = harness();
    eq(h.mode(), 'zh-TW', 'B1 with nothing stored the mode is zh-TW');
    eq(h.key(), STORAGE_KEY, 'B1b the storage key is the versioned one');
    eq(JSON.parse(h.vocabulary()), ['zh-TW', 'code'], 'B1c and the accepted vocabulary is exactly the two values');
    ok(!/\ben\b|english|EN'/i.test(code(extractFn('renderLabelModeControl', PAGE)).replace(/Chinese|codes?/gi, '')),
        'B1d the control is not labelled English or EN');
    // The banned vocabulary, over the whole rendered control rather than only its option text.
    (function () {
        var h = harness().html();
        ['English', 'Language', 'Full Names', 'ISO Codes'].forEach(function (bad) {
            ok(h.indexOf(bad) === -1, 'B1e the control says nothing about ' + bad);
        });
    })();
})();
// H2 — a stored mode restores.
(function () {
    var h = harness({ seed: 'code' });
    eq(h.mode(), 'code', 'B2 a stored "code" restores as code');
    var z = harness({ seed: 'zh-TW' });
    eq(z.mode(), 'zh-TW', 'B2b and a stored "zh-TW" restores as zh-TW');
})();
// H3 — invalid stored value recovers, and the garbage is dropped rather than re-read forever.
(function () {
    ['en', 'EN', 'code ', 'ZH-TW', '', 'true', '{"mode":"code"}', 'zh-CN'].forEach(function (bad) {
        var h = harness({ seed: bad });
        eq(h.mode(), 'zh-TW', 'B3 stored ' + JSON.stringify(bad) + ' falls back to zh-TW');
    });
    var h = harness({ seed: 'en' });
    eq(h.storage.store[STORAGE_KEY], undefined, 'B3b and the unrecognised value is removed, not carried');
    ok(h.storage.log.removes >= 1, 'B3c by an explicit removeItem');
    // A VALID value must never be removed.
    var g = harness({ seed: 'code' });
    eq(g.storage.store[STORAGE_KEY], 'code', 'B3d while a valid stored value is left alone');
    eq(g.storage.log.removes, 0, 'B3e with no removeItem at all');
})();
// H4 — storage failure costs the map nothing.
(function () {
    ['throw-read', 'throw-write', 'throw'].forEach(function (kind) {
        var h = harness({ storage: kind, seed: 'code' });
        eq(h.mode(), kind === 'throw-write' ? 'code' : 'zh-TW', 'B4 storage ' + kind + ' still yields a usable mode');
        eq(h.set('code'), kind === 'throw-write' ? true : true, 'B4b and the setter still succeeds');
        ok(typeof h.html() === 'string' && h.html().indexOf('data-labelmode') !== -1, 'B4c and the control still renders');
    });
    // A write that fails is REPORTED rather than swallowed, so "why did my choice not survive a reload" has an answer.
    var w = harness({ storage: 'throw-write' });
    w.set('code');
    eq(vm.runInContext('state.labelModePersisted', w.ctx), false, 'B4d a failed write is recorded as not persisted');
    eq(w.mode(), 'code', 'B4e while the mode still applies for this session');
})();
// The setter refuses what it does not accept, rather than half-applying it.
(function () {
    var h = harness();
    ['en', 'EN', 'zh', '', null, undefined, 0, 'CODE'].forEach(function (bad) {
        eq(h.set(bad), false, 'B5 setLabelMode(' + JSON.stringify(bad) + ') is refused');
        eq(h.mode(), 'zh-TW', 'B5b and the mode is unchanged');
    });
    eq(h.set('code'), true, 'B5c while an accepted value is applied');
    eq(h.mode(), 'code', 'B5d and takes effect');
})();
// Subscription is the mechanism the control and the globe both ride on.
(function () {
    var h = harness();
    var before = h.subs();
    ok(before >= 2, 'B6 the page registers its subscribers at module scope (' + before + ')');
    h.set('code');
    eq(h.globeCalls.setLabelMode, ['code'], 'B6b a mode change reaches the globe through the subscription');
    h.set('code');
    eq(h.globeCalls.setLabelMode, ['code'], 'B6c and an unchanged value notifies nobody');
    h.set('zh-TW');
    eq(h.globeCalls.setLabelMode, ['code', 'zh-TW'], 'B6d while a real change does');
})();

// ==============================================================================================================
section('§C/§D — the codes come from the geographic authority, never from a name');
// ==============================================================================================================
// The two label functions, lifted from the engine and RUN, over the shipped assets.
var W_ADM1 = {};
(function () { var window = W_ADM1; eval(read('assets/js/data/world-admin1-10m.js').replace(/^\/\*[\s\S]*?\*\//, '')); })();
var ADM1 = W_ADM1.KM_WORLD_ADMIN1;
function labelEngine(globeSrc) {
    var g = {}, rsb = { window: g, console: console };
    rsb.globalThis = rsb;
    var rctx = vm.createContext(rsb);
    ['assets/js/data/world-countries-110m.js', 'assets/js/data/geo-names-zh-hant.js',
     'assets/js/data/geo-display-aliases-zh-tw.js', 'assets/js/data/geo-admin1-display-names-zh-tw.js',
     'assets/js/core/geo-name-resolver.js'].forEach(function (f) {
        vm.runInContext(read(f), rctx, { filename: f });
    });
    var src = globeSrc || GLOBE;
    var box = { window: { KM: { geoNames: g.KM.geoNames } }, Object: Object, String: String, console: console };
    box.globalThis = box;
    var ctx = vm.createContext(box);
    vm.runInContext([
        'var labelTextCache = {};',
        'var labelMode = "zh-TW";',
        decl(/var codeFallback = \{[^;]+;/, src, 'codeFallback'),
        decl(/var CODE_FALLBACK_EXAMPLE_CAP = [^;]+;/, src, 'cap'),
        extractFn('noteCodeFallback', src),
        extractFn('isoAlpha2', src),
        extractFn('adm1Alpha', src),
        extractFn('countryLabelText', src),
        extractFn('admin1LabelText', src)
    ].join('\n'), ctx);
    return {
        setMode: function (m) { vm.runInContext('labelMode = ' + JSON.stringify(m) + ';', ctx); },
        country: function (iso) { box.__i = iso; return vm.runInContext('countryLabelText(__i)', ctx); },
        adm1: function (d) { box.__d = d; return vm.runInContext('admin1LabelText(__d)', ctx); },
        census: function () { return JSON.parse(vm.runInContext('JSON.stringify(codeFallback)', ctx)); },
        cacheKeys: function () { return JSON.parse(vm.runInContext('JSON.stringify(Object.keys(labelTextCache))', ctx)); }
    };
}
var E = labelEngine();
function division(c, k) { return ADM1.admin1.filter(function (x) { return x.c === c && x.k === k; })[0]; }
function roundTrip(label, get, zh, cc) {
    E.setMode('zh-TW');
    eq(get(), zh, label + ' in 中文 mode is ' + zh);
    E.setMode('code');
    eq(get(), cc, label + ' in Code mode is ' + cc);
    E.setMode('zh-TW');
    eq(get(), zh, label + ' returns to ' + zh + ' when switched back');
}
// H5/H6/H7 — the three countries named in the requirement, plus the ones the examples table adds.
roundTrip('C1 CN', function () { return E.country('CN'); }, '中國', 'CN');
roundTrip('C2 US', function () { return E.country('US'); }, '美國', 'US');
roundTrip('C3 TW', function () { return E.country('TW'); }, '台灣', 'TW');
roundTrip('C4 CA', function () { return E.country('CA'); }, '加拿大', 'CA');
roundTrip('C5 JP', function () { return E.country('JP'); }, '日本', 'JP');
// GB, not UK: the displayed canonical identity is the ISO code the feature carries.
roundTrip('C6 GB', function () { return E.country('GB'); }, '英國', 'GB');
ok(ADM1 && true, 'C6b (assets loaded)');
(function () {
    E.setMode('code');
    eq(E.country('UK'), 'UK', 'C6c an alias like UK is not a country identity in this dataset');
    var isos = {};
    var WC = {}; (function () { var window = WC; eval(read('assets/js/data/world-countries-110m.js').replace(/^\/\*[\s\S]*?\*\//, '')); })();
    WC.KM_WORLD_COUNTRIES.countries.forEach(function (f) { isos[f.iso] = 1; });
    ok(isos.GB === 1 && isos.UK === undefined,
        'C6d the country layer is keyed on GB and never on UK, so nothing has to choose between them at paint time');
    E.setMode('zh-TW');
})();
// H8/H9 — divisions. The code is the asset's certified ISO 3166-2 suffix.
roundTrip('D1 US/CA California', function () { return E.adm1(division('US', 'CA')); }, '加利福尼亞州', 'CA');
roundTrip('D2 US/TX Texas', function () { return E.adm1(division('US', 'TX')); }, '德克薩斯州', 'TX');
roundTrip('D3 US/NY New York', function () { return E.adm1(division('US', 'NY')); }, '紐約州', 'NY');
roundTrip('D4 CA/ON Ontario', function () { return E.adm1(division('CA', 'ON')); }, '安大略省', 'ON');
// D5 — BRITISH COLUMBIA. The code half is BC. The Chinese half is what the reviewed authority answers today,
// and the requirement's example table asks for a DIFFERENT name, so this assertion states the live authority and
// names the gap rather than quietly asserting whichever one happens to pass.
//
// Wikidata Q1974 carries four Chinese variants and the pipeline's FILL_LANGS is ['zh-tw', 'zh-hant']:
//   zh       不列颠哥伦比亚省   (simplified)
//   zh-hant  不列顛哥倫比亞省   <- what ships, from the pinned Natural Earth zh-Hant list
//   zh-tw    英屬哥倫比亞省
//   zh-hk    卑詩省             <- the requirement's example; zh-hk is deliberately NOT a name source
// Changing it is a reviewed-alias decision with a human owner (REVIEWED_ADMIN1_ALIAS, keyed on CAN-633), not a
// side effect of adding a display switch, so R9 implements the switch and leaves the name to its owner.
(function () {
    var bc = division('CA', 'BC');
    E.setMode('code');
    eq(E.adm1(bc), 'BC', 'D5 British Columbia in Code mode is BC');
    E.setMode('zh-TW');
    var live = E.adm1(bc);
    eq(live, '不列顛哥倫比亞省', 'D5b and in 中文 mode it is the reviewed zh-Hant name the authority answers today');
    ok(live !== '卑詩省',
        'D5c RECORDED GAP: the requirement\'s example table says 卑詩省 (Wikidata zh-hk), which the pipeline ' +
        'excludes by policy — a reviewed-alias decision for its owner, not for this round');
    E.setMode('code');
    eq(E.adm1(bc), 'BC', 'D5d the code half is unaffected by that decision either way');
    E.setMode('zh-TW');
})();
// H10 — a division with no authoritative code falls back safely, and says why, boundedly.
(function () {
    var F = labelEngine();
    var numeric = ADM1.admin1.filter(function (x) { return x.t === 1; })[0];
    var none = ADM1.admin1.filter(function (x) { return x.t === 2; })[0];
    F.setMode('zh-TW');
    var zhNumeric = F.adm1(numeric), zhNone = F.adm1(none);
    F.setMode('code');
    eq(F.adm1(numeric), zhNumeric, 'D6 a division whose ISO code is NUMERIC keeps its reviewed label in code mode');
    eq(F.adm1(none), zhNone, 'D6b as does one with no ISO code at all');
    var c = F.census();
    eq(c.admin1, 2, 'D6c and both are counted as code fallbacks');
    eq(c.countries, 0, 'D6d with no country fallbacks, because every country carries a clean alpha-2');
    var reasons = c.examples.map(function (e) { return e.reason; }).sort();
    eq(reasons, ['ISO_CODE_IS_NUMERIC', 'NO_ISO_CODE'], 'D6e each reported with its own distinct reason');
    // BOUNDED. 39% of divisions take this path, so an unbounded list would grow with every repaint.
    ADM1.admin1.filter(function (x) { return x.t !== 0; }).slice(0, 60).forEach(function (d) { F.adm1(d); });
    var c2 = F.census();
    ok(c2.examples.length <= c2.example_cap || c2.examples.length <= 12,
        'D6f the example list is capped (' + c2.examples.length + ')');
    ok(c2.admin1 >= 60, 'D6g while the COUNT keeps counting (' + c2.admin1 + ')');
    // Nothing was invented for any of them.
    var invented = ADM1.admin1.filter(function (x) { return x.t !== 0; }).slice(0, 200).filter(function (d) {
        F.setMode('code'); var got = F.adm1(d);
        F.setMode('zh-TW'); return got !== F.adm1(d);
    });
    eq(invented.length, 0, 'D6h and not one of 200 code-less divisions was given an abbreviation');
})();
// The certification is the asset's own, and the code path reads no name.
(function () {
    var certified = ADM1.admin1.filter(function (x) { return x.t === 0; });
    eq(certified.length, 2340, 'D7 the asset certifies 2,340 divisions as carrying an alphabetic ISO 3166-2 code');
    ok(ADM1.meta.schema.t.indexOf('ISO 3166-2 alphabetic code') !== -1,
        'D7b and says so in its own schema, which is where the rule comes from');
    var alphaFn = code(extractFn('adm1Alpha', GLOBE));
    ok(/d\.t !== 0/.test(alphaFn), 'D7c adm1Alpha refuses anything the asset has not certified');
    ok(alphaFn.indexOf('.n') === -1 && !/english|name/i.test(alphaFn),
        'D7d and reads no name field at all, so it cannot derive a code from "California"');
    var isoFn = code(extractFn('isoAlpha2', GLOBE));
    ok(/A-Z\]\{2\}/.test(isoFn), 'D7e isoAlpha2 validates rather than trusts, for a future -99 placeholder');
    ok(!/slice\(0,\s*2\)|substr|charAt/.test(alphaFn + isoFn),
        'D7f and neither takes initials off the front of a string');
})();
// H19 — 中文 mode never regresses to a formal name on any surface.
(function () {
    E.setMode('zh-TW');
    ['CN', 'TW'].forEach(function (k) {
        var t = E.country(k);
        ok(t !== FORMAL_CN && t !== FORMAL_TW && t !== FORMAL_TW_CODE, 'D8 ' + k + ' is not a formal name (' + t + ')');
    });
    eq(E.country('CN'), '中國', 'D8b CN is 中國');
    eq(E.country('TW'), '台灣', 'D8c TW is 台灣');
    E.setMode('code');
    ok(E.country('CN') === 'CN' && E.country('TW') === 'TW', 'D8d and code mode is the ISO code, not a formal name');
    [FORMAL_CN, FORMAL_TW, FORMAL_TW_CODE].forEach(function (bad) {
        ok(code(PAGE).indexOf(bad) === -1, 'D8e the map page\'s executable source contains no ' + bad);
    });
    E.setMode('zh-TW');
})();
// THE MODE IS PART OF THE CACHE KEY — the structural reason a switch cannot serve a stale label.
(function () {
    var F = labelEngine();
    F.setMode('zh-TW'); F.country('CN');
    F.setMode('code'); F.country('CN');
    var keys = F.cacheKeys();
    eq(keys.length, 2, 'D9 the same feature caches once per mode, not once overall');
    ok(keys.some(function (k) { return k.indexOf('zh-TW') !== -1; }) && keys.some(function (k) { return k.indexOf('code') !== -1; }),
        'D9b because the mode is part of the key');
})();

// ==============================================================================================================
section('§A — the control: semantics, state and keyboard');
// ==============================================================================================================
(function () {
    var h = harness();
    var html = h.html();
    // H12 — semantics and accessible name/state.
    ok(/role="radiogroup"/.test(html), 'A1 the group is a radiogroup');
    ok(/aria-label="[^"]+"/.test(/<div class="glm-seg"[^>]*>/.exec(html)[0]), 'A1b with an accessible name');
    eq((html.match(/role="radio"/g) || []).length, 2, 'A2 with exactly two radio options');
    ok(/<button type="button"/.test(html), 'A2b as real buttons, not a checkbox');
    ok(html.indexOf('type="checkbox"') === -1, 'A2c no native checkbox, whose two states would not name themselves');
    // TEXTURE-3-R9A — the visible copy is `Labels` / `Names` / `Code`. R9 shipped `Label Display` / `中文` /
    // `Code`; live validation shortened it. The internal vocabulary did not move with it — see §R9A below, which
    // is the assertion that matters, because a copy change that quietly renamed a stored value would be a
    // migration pretending to be a polish.
    eq((html.match(/>Names</g) || []).length, 1, 'A3 the first option reads exactly Names');
    eq((html.match(/>Code</g) || []).length, 1, 'A3b and the second reads exactly Code');
    ok(html.indexOf('中文') === -1, 'A3c the option labels no longer carry the 中文 wording R9 shipped');
    ok(!/>\s*(EN|English|Language|Full Names|ISO Codes)\s*</.test(html),
        'A3d and neither option is labelled English, Language, Full Names or ISO Codes');
    ok(/<span class="glm-mcp__lbl">Labels<\/span>/.test(html), 'A4 under a heading reading exactly Labels');
    ok(html.indexOf('Label Display') === -1, 'A4b with the older heading gone');
    // Roving tabindex: one tab stop for the group.
    eq((html.match(/tabindex="0"/g) || []).length, 1, 'A5 exactly one option is in the tab order');
    eq((html.match(/tabindex="-1"/g) || []).length, 1, 'A5b and the other is reachable by arrow, not by Tab');
    eq((html.match(/aria-checked="true"/g) || []).length, 1, 'A6 exactly one option is checked');
    ok(/data-labelmode="zh-TW"[^>]*aria-checked="true"|aria-checked="true"[^>]*data-labelmode="zh-TW"/.test(html.replace(/\n/g, '')),
        'A6b and by default it is 中文');
})();
// H11/H12 — the real handler, driven by mouse and by keyboard.
(function () {
    var h = harness();
    h.buildDom();
    var zh = h.btn('zh-TW'), cd = h.btn('code');
    ok(!!zh && !!cd, 'A7 both options are bound');
    eq(zh.getAttribute('aria-checked'), 'true', 'A7b 中文 starts checked');
    // MOUSE
    cd.onclick();
    eq(h.mode(), 'code', 'A8 clicking Code selects code mode');
    eq(cd.getAttribute('aria-checked'), 'true', 'A8b and ARIA follows the active mode');
    eq(zh.getAttribute('aria-checked'), 'false', 'A8c on both options');
    eq(cd.getAttribute('tabindex'), '0', 'A8d the tab stop moves with the selection');
    eq(zh.getAttribute('tabindex'), '-1', 'A8e leaving one tab stop for the group');
    ok(cd.classList.contains('is-on'), 'A8f and the active class matches the ARIA state');
    ok(!zh.classList.contains('is-on'), 'A8g exclusively');
    ok(cd.focused >= 1, 'A8h focus lands on the chosen option, so keyboard users do not lose their place');
    // KEYBOARD — Enter, Space, and arrows in both directions.
    var evs = [];
    function key(el, k) { var e = { key: k, preventDefault: function () { evs.push('prevented'); } }; el.onkeydown(e); }
    key(zh, 'Enter');
    eq(h.mode(), 'zh-TW', 'A9 Enter on 中文 selects it');
    key(cd, ' ');
    eq(h.mode(), 'code', 'A9b Space on Code selects it');
    key(cd, 'ArrowLeft');
    eq(h.mode(), 'zh-TW', 'A9c ArrowLeft from Code moves to 中文 and selects it');
    key(zh, 'ArrowRight');
    eq(h.mode(), 'code', 'A9d ArrowRight from 中文 moves to Code');
    key(cd, 'ArrowUp');
    eq(h.mode(), 'zh-TW', 'A9e ArrowUp behaves the same in a two-option group');
    key(zh, 'ArrowDown');
    eq(h.mode(), 'code', 'A9f as does ArrowDown');
    key(cd, 'Home');
    eq(h.mode(), 'zh-TW', 'A9g Home and End name the same two buttons');
    ok(evs.length >= 7, 'A9h and every handled key calls preventDefault, so the panel does not scroll');
    // An unhandled key does nothing at all.
    var before = h.mode();
    key(h.btn(before === 'code' ? 'zh-TW' : 'code'), 'Tab');
    eq(h.mode(), before, 'A9i Tab is left to the browser');
})();
// H13/H14 — switching touches nothing else.
(function () {
    var h = harness();
    h.buildDom();
    vm.runInContext('state.filters.kpi = "late"; state.filters.search = "SH-1"; state.selectedShipmentId = "SH-1"; state.mapPanelCollapsed = false;', h.ctx);
    var before = vm.runInContext('JSON.stringify([state.filters, state.selectedShipmentId, state.mapPanelCollapsed])', h.ctx);
    h.btn('code').onclick();
    eq(vm.runInContext('JSON.stringify([state.filters, state.selectedShipmentId, state.mapPanelCollapsed])', h.ctx), before,
        'A10 filters, the selected shipment and the panel state are untouched by a mode switch');
    eq(h.renders(), 0, 'A11 and render() is never called — the page is not remounted');
    eq(h.globeCalls.other, [], 'A12 no camera call: no focus, no zoomIn, no reset');
    eq(h.globeCalls.setLabelMode, ['code'], 'A12b the globe is told the mode and nothing else');
})();
// H17 — a remount re-binds without accumulating.
(function () {
    var h = harness();
    h.buildDom();
    var subsAfterFirst = h.subs();
    h.bind(); h.bind(); h.bind();
    eq(h.subs(), subsAfterFirst, 'A13 re-binding registers no further subscribers — they live at module scope');
    var cd = h.btn('code');
    var calls = 0;
    var real = cd.onclick;
    cd.onclick = function () { calls++; return real.apply(this, arguments); };
    cd.onclick();
    eq(calls, 1, 'A13b and one click runs one handler, because onclick ASSIGNS rather than adds');
    eq(h.globeCalls.setLabelMode.length, 1, 'A13c so the globe is told exactly once');
})();
// H18 — navigate away and back.
(function () {
    var h = harness();
    h.buildDom();
    h.btn('code').onclick();
    eq(h.storage.store[STORAGE_KEY], 'code', 'A14 the choice is persisted on selection');
    // A fresh page instance over the SAME storage is what "navigate away and back" and "reload" both look like.
    var again = harness({ seed: h.storage.store[STORAGE_KEY] });
    eq(again.mode(), 'code', 'A14b a new page instance over the same storage restores code mode');
    ok(/data-labelmode="code"[^>]*aria-checked="true"|aria-checked="true"[^>]*data-labelmode="code"/.test(again.html().replace(/\n/g, '')),
        'A14c and its control renders with Code already active, so there is no flash of the wrong mode');
})();

// ==============================================================================================================
section('§E/§F — scope, and what a switch must not touch');
// ==============================================================================================================
(function () {
    // H15 — no API request, no DB write. The authority names no transport at all.
    var auth = code(AUTHORITY);
    ['api', 'fetch(', 'XMLHttpRequest', 'adapter', 'callApi', 'postJson', 'sheet', 'apps-script', 'doPost']
        .forEach(function (bad) {
            ok(auth.toLowerCase().indexOf(bad.toLowerCase()) === -1,
                'E1 the label-mode authority contains no ' + bad);
        });
    ok(code(BIND_BLOCK).toLowerCase().indexOf('api') === -1, 'E1b nor does the switch handler');
    // The mode reaches exactly one consumer: the globe's label layers.
    //
    // Stated as a BLACKLIST, not a whitelist. The first draft demanded every getLabelMode() caller match a list
    // of display-path names, and the setter's own idempotence check — `if (t === getLabelMode()) return true;` —
    // is a perfectly correct caller that matches no such name. A whitelist of allowed callers has to be
    // maintained; the invariant that actually matters is that no caller feeds a transport.
    var consumers = code(PAGE).split(/\r?\n/).filter(function (l) { return /getLabelMode\(\)/.test(l); });
    ok(consumers.length >= 3, 'E2 getLabelMode() has callers (' + consumers.length + ')');
    consumers.forEach(function (l) {
        ok(!/(api|fetch\(|payload|adapter|xhr|postJson|doPost|sheet|body:)/i.test(l),
            'E2b no getLabelMode() caller feeds a transport: ' + l.trim().slice(0, 72));
    });
    // And the only consumer outside this page is the globe's label setter.
    var pushes = code(PAGE).split(/\r?\n/).filter(function (l) { return /state\.globe[\s\S]*setLabelMode/.test(l); });
    ok(pushes.length >= 1, 'E2c the mode is pushed to the globe (' + pushes.length + ' site(s))');
    // H16 — the engine's setter repaints and refetches nothing.
    var setter = code((function () {
        var i = GLOBE.indexOf('setLabelMode: function (m) {');
        var d = 0, st = false;
        for (var j = i; j < GLOBE.length; j++) {
            if (GLOBE[j] === '{') { d++; st = true; }
            else if (GLOBE[j] === '}') { d--; if (st && d === 0) return GLOBE.slice(i, j + 1); }
        }
        throw new Error('setLabelMode not found');
    })());
    ok(/schedule\(\)/.test(setter), 'E3 setLabelMode schedules a repaint');
    ['rebuildAdmin1Buffer', 'rebuildCountryBuffer', 'ensureAdmin1Asset', 'loadTexture', 'setAdmin1Data',
     'fetch', 'Image(', 'focus(', 'cam.', 'requestAnimationFrame'].forEach(function (bad) {
        ok(setter.indexOf(bad) === -1, 'E3b and does not call ' + bad);
    });
    ok(/labelMode = t;/.test(setter), 'E3c it assigns the mode');
    ok(!/labelTextCache\s*=\s*\{\}/.test(setter),
        'E3d and does NOT need to clear the label cache, because the mode is part of the cache key');
    // Operational text is out of scope and stays that way: the engine's code paths touch only the two
    // geographic label functions.
    var users = GLOBE_C.split(/\r?\n/).filter(function (l) { return /labelMode/.test(l); });
    users.forEach(function (l) {
        ok(!/marker|shipment|carrier|route|warehouse|port|city|status/i.test(l),
            'E4 labelMode is never read on an operational surface: ' + l.trim().slice(0, 70));
    });
})();
// H20 — the map's data and appearance are untouched by R9.
(function () {
    eq(sha256('assets/img/earth/earth-albedo-2048.jpg').slice(0, 16), '02037552b15ec548', 'E5 the 2048 earth tier is unchanged');
    eq(sha256('assets/img/earth/earth-albedo-4096.jpg').slice(0, 16), '366b86ec02abac11', 'E5b the 4096 tier is unchanged');
    eq(sha256('assets/img/earth/earth-albedo-5400.jpg').slice(0, 16), '4f4240673a3a1b17', 'E5c the 5400 tier is unchanged');
    eq(sha256('assets/img/earth/earth-albedo-8192.jpg').slice(0, 16), 'e7ca8837c1ec9064', 'E5d the 8192 tier is unchanged');
    eq('adm1-10m-' + sha256('assets/js/data/world-admin1-10m.js').slice(0, 12), 'adm1-10m-4d61535a9116',
        'E6 the ADM1 asset is byte-identical, at the digest R8 pinned its URL to');
    ok(/ADM1_ASSET_TOKEN = 'adm1-10m-4d61535a9116'/.test(PAGE), 'E6b and the loader still declares that identity');
    ok(/EARTH_ASSET_VERSION_ = 'jul2004-tiers-e7ca8837'/.test(GLOBE), 'E7 the earth content token is unchanged');
    // R9 touched neither the arc builder nor the border layers.
    ok(GLOBE_C.indexOf('function rebuildLines') !== -1, 'E8 the route arc builder is still present');
    ok(!/labelMode/.test(extractFn('rebuildLines', GLOBE)), 'E8b and knows nothing about the label mode');
    ['buildCountrySegments', 'rebuildAdmin1Buffer'].forEach(function (fn) {
        ok(GLOBE_C.indexOf('function ' + fn) !== -1 || GLOBE_C.indexOf(fn) !== -1, 'E8c ' + fn + ' is still present');
    });
})();

// ==============================================================================================================
section('§G — the token manifest');
// ==============================================================================================================
(function () {
    // TEXTURE-3-R9A — AND THIS BLOCK PINNED ITS OWN ROUND AS "NOW", one round after the commit message that
    // named that exact habit as the recurring defect. R9 wrote `eq(RO.currentMapToken(), R9)` and compared every
    // inventory file against R9's literal token; R9A appended a round and rotated one file, and eleven
    // assertions failed while describing a correct state.
    //
    // Restated the way R9 itself said the durable form goes: R9's token is a FLOOR for the files R9 changed, and
    // the derived "changed this round" rule reads the CURRENT round. The two were conflated in one variable,
    // which is why `G4d km-globe.js did not change this round` failed for a file R9A correctly left alone.
    var R9 = 'map-labelmode-r9-20260831';
    var CUR = RO.currentMapToken();
    var T = RO.parseIndexTokens(INDEX);
    ok(RO.isMapToken(R9), 'G1 R9\'s token is in the shared series');
    eq(RO.mapRoundMarker(R9), 'TEXTURE-3-R9', 'G1b with its marker DERIVED from the token across a FAMILY change');
    eq(RO.mapRoundMarker('map-labelcopy-r9a-20260831'), 'TEXTURE-3-R9A',
        'G1b2 as is R9A\'s, whose round carries a letter suffix');
    ok(RO.currentMapRoundMarkerRe().source !== '', 'G1c and the guarded RegExp is never the everything-matching //');
    ok(!RO.currentMapRoundMarkerRe().test('a file that changed in no round'),
        'G1d so a broken derivation could not mark every file as changed');
    // The three files R9 changed still say so, and none of them is served from a token older than R9.
    eq([PAGE_REL, GLOBE_REL, CSS_REL].filter(function (rel) { return /TEXTURE-3-R9\b/.test(read(rel)); }).length, 3,
        'G2 all three files R9 changed carry R9\'s marker in their own source');
    [PAGE_REL, GLOBE_REL, CSS_REL].forEach(function (rel) {
        ok(RO.mapTokenAtOrAfter(T[rel], R9),
            'G2b ' + rel.split('/').pop() + ' is never served OLDER than R9 (' + T[rel] + ')');
    });
    // R9A moved exactly one of them, and only its own reference.
    eq(T[PAGE_REL], 'map-labelcopy-r9a-20260831', 'G2c the map page carries the R9A token — its copy changed');
    eq(T[GLOBE_REL], R9, 'G2d the globe engine was NOT rotated — its bytes did not move');
    eq(T[CSS_REL], R9, 'G2e nor was the stylesheet — the new copy needed no CSS change');
    eq((INDEX.match(/map-labelcopy-r9a-20260831/g) || []).length, 1, 'G2f exactly one reference carries the R9A token');
    // The derived rule over the whole shared inventory.
    ok(RO.MAP_BROWSER_FILES.length >= 8, 'G3 the shared inventory now includes the stylesheet (' + RO.MAP_BROWSER_FILES.length + ')');
    ok(RO.MAP_BROWSER_FILES.indexOf(CSS_REL) !== -1, 'G3b explicitly');
    RO.MAP_BROWSER_FILES.forEach(function (rel) {
        var t = T[rel], base = rel.split('/').pop();
        ok(!!t, 'G4 index.html cache-busts ' + base);
        ok(RO.isMapToken(t), 'G4b ' + base + ' carries a series token (' + t + ')');
        if (RO.currentMapRoundMarkerRe().test(read(rel))) eq(t, CUR, 'G4c ' + base + ' changed this round → current token');
        else ok(t !== CUR, 'G4d ' + base + ' did not change this round → not rotated (' + t + ')');
    });
    // What R9 must NOT have moved.
    eq(T['assets/js/core/geo-name-resolver.js'], 'map-texture3-r6-20260831', 'G5 the resolver still serves at R6');
    ['assets/js/data/geo-names-zh-hant.js', 'assets/js/data/geo-display-aliases-zh-tw.js',
     'assets/js/data/geo-admin1-display-names-zh-tw.js', 'assets/js/lib/km-geo-topology.js'].forEach(function (rel) {
        eq(T[rel], 'map-texture3-r4-20260827', 'G5b ' + rel.split('/').pop() + ' still serves at R4');
    });
    // RESTATED (F1-7N-SKU-DETAILS-DISPLAY-INIT-R1) - see _release-order.js currentAppToken(): the literal
    // forbade an APPLICATION round from moving its own token. The derived form still forbids a MAP round.
    // RESTATED AGAIN (F1-7N-FC-1A-R1-HF1): the previous restatement derived the TOKEN and left the COUNT as
    // the literal 18, which forbids any application round from changing how many assets the set covers. HF1 is
    // that round — it moves 19 — so this failed while describing a correct tree, for the same
    // reason and one field to the left. The count is now REPORTED and the property is derived from the file
    // inventory _release-order.js already keeps: a map browser file carries a map-series token and an
    // application asset does not. Adding an asset cannot break it; putting the map token on an application
    // asset — the mutation below — cannot satisfy it.
    eq(RO.misplacedIndexTokens(INDEX).join(' | '), '',
        'G6 every application asset carries an application token and every map asset a map token (' +
        RO.appTokenRefCount(INDEX) + ' refs on ' + RO.currentAppToken() + ')');
    ok(!RO.isMapToken(RO.currentAppToken()), 'G6 and no map round moved it onto a map token');
    ok(INDEX.indexOf('world-admin1-10m') === -1, 'G7 the ADM1 asset is still absent from index.html');
    // No duplicate tags, and the stylesheet appears once.
    (function () {
        var re = /<script src="([^"?]+)/g, m, seen = {}, dup = [];
        while ((m = re.exec(INDEX))) { if (seen[m[1]]) dup.push(m[1]); seen[m[1]] = 1; }
        eq(dup.join(','), '', 'G8 no script is loaded twice' + (dup.length ? ' — ' + dup.join(', ') : ''));
        eq((INDEX.match(/global-logistics-map\.css/g) || []).length, 1, 'G8b and the stylesheet is linked once');
        eq((INDEX.match(/pages\/global-logistics-map\.js/g) || []).length, 1, 'G8c as is the map page');
    })();
    // The CSS actually contains the control, sized so it cannot overflow the panel.
    var CSS = read(CSS_REL);
    ok(/\.glm-seg\s*\{/.test(CSS), 'G9 the stylesheet defines the segmented control');
    ok(/grid-template-columns:\s*1fr 1fr/.test(CSS), 'G9b as two equal columns, so it cannot overflow horizontally');
    ok(/focus-visible/.test(CSS), 'G9c with a visible focus style');
    ok(/aria-checked="true"/.test(CSS), 'G9d and the active style is driven by the ARIA state, so the two cannot disagree');
})();

// ==============================================================================================================
section('§R9A — the copy moved and nothing behind it did');
// ==============================================================================================================
// The whole risk in a copy polish is that a visible string and a STORED value are the same string somewhere. If
// they were, renaming the label would silently orphan every saved preference. These assertions exist to prove
// they are not, and that a value saved before this round still restores.
(function () {
    var h = harness();
    // The internal vocabulary is untouched by the new copy.
    eq(JSON.parse(h.vocabulary()), ['zh-TW', 'code'], 'R9A1 the accepted values are still exactly zh-TW and code');
    eq(h.key(), 'km.map.labelMode.v1', 'R9A2 stored under the same versioned key — no migration');
    eq(h.mode(), 'zh-TW', 'R9A3 and the default is still zh-TW');
    // The data-* contract the handler and the painter both key on.
    var html = h.html();
    eq((html.match(/data-labelmode="zh-TW"/g) || []).length, 1, 'R9A4 the zh-TW option keeps its data-labelmode value');
    eq((html.match(/data-labelmode="code"/g) || []).length, 1, 'R9A4b as does the code option');
    // NO VISIBLE STRING IS A STORED VALUE. This is the assertion that makes the rename safe.
    ['Labels', 'Names', 'Code'].forEach(function (visible) {
        eq(h.set(visible), false, 'R9A5 the visible string "' + visible + '" is not an accepted mode value');
        eq(h.mode(), 'zh-TW', 'R9A5b and setting it changes nothing');
    });
    // The accessible name, exactly as specified.
    var g = /<div class="glm-seg"[^>]*aria-label="([^"]*)"/.exec(html);
    ok(!!g, 'R9A6 the radiogroup carries an aria-label');
    eq(g[1], 'Map labels: names or codes', 'R9A6b reading exactly "Map labels: names or codes"');
})();
// A PREFERENCE SAVED BEFORE THIS ROUND still restores, and lights the right option.
(function () {
    function activeOptionText(seed) {
        var h = harness({ seed: seed });
        var html = h.html();
        var m = /<button[^>]*aria-checked="true"[^>]*data-labelmode="([^"]+)"[^>]*>([^<]*)<\/button>/.exec(html);
        return m ? { value: m[1], text: m[2] } : null;
    }
    var zh = activeOptionText('zh-TW');
    ok(!!zh, 'R9A7 a stored zh-TW preference selects an option');
    eq(zh.value, 'zh-TW', 'R9A7b whose value is zh-TW');
    eq(zh.text, 'Names', 'R9A7c and whose visible label is Names');
    var cd = activeOptionText('code');
    ok(!!cd, 'R9A8 a stored code preference selects an option');
    eq(cd.value, 'code', 'R9A8b whose value is code');
    eq(cd.text, 'Code', 'R9A8c and whose visible label is Code');
    // Only one is ever lit, in both directions.
    [['zh-TW', 'Names'], ['code', 'Code']].forEach(function (p) {
        var html = harness({ seed: p[0] }).html();
        eq((html.match(/aria-checked="true"/g) || []).length, 1, 'R9A9 stored ' + p[0] + ' lights exactly one option');
        eq((html.match(/tabindex="0"/g) || []).length, 1, 'R9A9b leaving exactly one tab stop');
    });
})();
// The copy change touched the STRINGS and not the mechanism: the handler, the painter, the setter and the
// resolution path are all byte-identical in behaviour, which the sections above already exercise. What is
// asserted here is that R9A introduced no CSS change and no engine change, because the copy needed neither.
(function () {
    ok(/TEXTURE-3-R9A/.test(PAGE), 'R9A10 the map page records the R9A change in its own source');
    ok(!/TEXTURE-3-R9A/.test(GLOBE), 'R9A11 the globe engine carries no R9A marker — it did not change');
    ok(!/TEXTURE-3-R9A/.test(read(CSS_REL)), 'R9A12 nor does the stylesheet — the new copy needed no CSS change');
    // The longer option text cannot overflow the panel: the track is a fixed grid fraction and the button clips.
    var CSS = read(CSS_REL);
    ok(/grid-template-columns:\s*1fr 1fr/.test(CSS), 'R9A13 the two options share fixed grid fractions');
    ok(/overflow:\s*hidden/.test(CSS) && /text-overflow:\s*ellipsis/.test(CSS),
        'R9A13b and each clips rather than pushing the panel wider, whatever the copy says');
})();

// ==============================================================================================================
section('§H negative tests — each guard is made to BITE');
// ==============================================================================================================
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
function countryCodesRight(globeSrc) {
    var F = labelEngine(globeSrc);
    F.setMode('code');
    return F.country('CN') === 'CN' && F.country('US') === 'US' && F.country('GB') === 'GB';
}
function divisionCodesRight(globeSrc) {
    var F = labelEngine(globeSrc);
    F.setMode('code');
    if (F.adm1(division('US', 'CA')) !== 'CA' || F.adm1(division('CA', 'BC')) !== 'BC') return false;
    // and a code-less division must NOT acquire one
    var numeric = ADM1.admin1.filter(function (x) { return x.t === 1; })[0];
    F.setMode('zh-TW'); var zh = F.adm1(numeric);
    F.setMode('code'); return F.adm1(numeric) === zh;
}
function zhRight(globeSrc) {
    var F = labelEngine(globeSrc);
    F.setMode('zh-TW');
    return F.country('CN') === '中國' && F.country('TW') === '台灣';
}

// N1 — the country code derived from the NAME instead of the feature identity.
mutate('N1 country code derived from the name',
    function () { return countryCodesRight(); },
    function () {
        return countryCodesRight(GLOBE.replace(
            /var cc = isoAlpha2\(iso\);/,
            'var cc = (function () { try { var r = window.KM.geoNames.country(iso); return String(r && r.name || iso).slice(0, 2).toUpperCase(); } catch (e) { return ""; } })();'));
    });
// N2 — the subdivision code taken off the English initials.
mutate('N2 subdivision code derived from English initials',
    function () { return divisionCodesRight(); },
    function () {
        return divisionCodesRight(GLOBE.replace(
            /if \(!d \|\| d\.t !== 0\) return '';/,
            "if (!d) return ''; if (d.t !== 0) { var n = String(d.n || d.k || ''); return n.slice(0, 2).toUpperCase(); }"));
    });
// N3 — a second country dictionary introduced inside the engine.
mutate('N3 a second country dictionary introduced',
    function () {
        var c = GLOBE_C;
        // the engine must carry no country-name/code table of its own
        return !/\{\s*['"]?(CN|US|TW)['"]?\s*:\s*['"]/.test(c);
    },
    function () {
        var c = code(GLOBE.replace(/var labelMode = 'zh-TW';/,
            "var labelMode = 'zh-TW'; var COUNTRY_CODES_ = { 'CN': 'CN', 'US': 'US', 'TW': 'TW' };"));
        return !/\{\s*['"]?(CN|US|TW)['"]?\s*:\s*['"]/.test(c);
    });
// N4 — the label mode smuggled into an API request.
mutate('N4 label mode sent in an API request',
    function () {
        var lines = code(PAGE).split(/\r?\n/);
        return lines.filter(function (l) { return /labelMode/i.test(l) && /(api|fetch\(|payload|adapter|xhr|postJson)/i.test(l); }).length === 0;
    },
    function () {
        var lines = code(PAGE.replace(/var labelModeSubs = \[\];/,
            "var labelModeSubs = []; function leak() { return callApi({ labelMode: getLabelMode() }); }")).split(/\r?\n/);
        return lines.filter(function (l) { return /labelMode/i.test(l) && /(api|fetch\(|payload|adapter|xhr|postJson)/i.test(l); }).length === 0;
    });
// N5 — the switch remounts the page (and therefore the globe).
mutate('N5 the switch remounts the page on every change',
    function () { var h = harness(); h.buildDom(); h.btn('code').onclick(); return h.renders() === 0; },
    function () {
        var h = harness();
        h.buildDom();
        // the mutation is in the handler: choose() ends with a full render()
        var mutatedBind = BIND_BLOCK.replace(/try \{ target\.focus\(\); \} catch \(e\) \{\}/, 'render(); try { target.focus(); } catch (e) {}');
        h.ctx.__r = h.buildDom();
        vm.runInContext('(function (r) { ' + mutatedBind + ' })(__r);', h.ctx);
        h.btn('code').onclick();
        return h.renders() === 0;
    });
// N6 — the mode change refetches ADM1.
mutate('N6 a mode change refetches the ADM1 asset',
    function () {
        var i = GLOBE.indexOf('setLabelMode: function (m) {');
        var d = 0, st = false, body = '';
        for (var j = i; j < GLOBE.length; j++) {
            if (GLOBE[j] === '{') { d++; st = true; }
            else if (GLOBE[j] === '}') { d--; if (st && d === 0) { body = GLOBE.slice(i, j + 1); break; } }
        }
        return body.indexOf('rebuildAdmin1Buffer') === -1 && body.indexOf('setAdmin1Data') === -1;
    },
    function () {
        var m = GLOBE.replace(/labelMode = t;\r?\n        schedule\(\);/, 'labelMode = t;\n        rebuildAdmin1Buffer();\n        schedule();');
        var i = m.indexOf('setLabelMode: function (m) {');
        var d = 0, st = false, body = '';
        for (var j = i; j < m.length; j++) {
            if (m[j] === '{') { d++; st = true; }
            else if (m[j] === '}') { d--; if (st && d === 0) { body = m.slice(i, j + 1); break; } }
        }
        return body.indexOf('rebuildAdmin1Buffer') === -1 && body.indexOf('setAdmin1Data') === -1;
    });
// N7 — the mode is lost after navigation because it was never persisted.
mutate('N7 the mode is lost after navigation',
    function () {
        var h = harness(); h.buildDom(); h.btn('code').onclick();
        return harness({ seed: h.storage.store[STORAGE_KEY] }).mode() === 'code';
    },
    function () {
        // writeLabelMode becomes a no-op: the session works, the next visit forgets.
        var st = makeStorage('ok');
        var sb = { window: { localStorage: st.api }, String: String, Object: Object, Error: Error, console: console,
                   esc: function (v) { return String(v); }, root: function () { return null; }, render: function () {} };
        sb.globalThis = sb;
        var ctx = vm.createContext(sb);
        vm.runInContext('var state = { globe: null, labelMode: "zh-TW", labelModePersisted: true };', ctx);
        vm.runInContext(AUTHORITY.replace(/function writeLabelMode\(v\) \{[\s\S]*?\n  \}/, 'function writeLabelMode(v) { return true; }'), ctx);
        vm.runInContext('setLabelMode("code");', ctx);
        return harness({ seed: st.store[STORAGE_KEY] }).mode() === 'code';
    });
// N8 — an invalid stored value displayed instead of recovered.
mutate('N8 an invalid stored value is displayed',
    function () { return harness({ seed: 'en' }).mode() === 'zh-TW'; },
    function () {
        var st = makeStorage('ok', 'en');
        var sb = { window: { localStorage: st.api }, String: String, Object: Object, Error: Error, console: console,
                   esc: function (v) { return String(v); }, root: function () { return null; }, render: function () {} };
        sb.globalThis = sb;
        var ctx = vm.createContext(sb);
        vm.runInContext('var state = { globe: null, labelMode: "zh-TW", labelModePersisted: true };', ctx);
        // readLabelMode trusts whatever is stored
        vm.runInContext(AUTHORITY.replace(/var v = validLabelMode\(raw\);\r?\n    if \(v\) return v;/, 'if (raw != null) return raw;'), ctx);
        return vm.runInContext('readLabelMode()', ctx) === 'zh-TW';
    });
// N9 — the formal name comes back.
mutate('N9 中文 mode returns 中華民國（TW）',
    function () { return zhRight(); },
    function () {
        return zhRight(GLOBE.replace(
            /var r = window\.KM\.geoNames\.country\(iso\);/,
            'var r = window.KM.geoNames.countryDetail(iso, { form: "full" }) || window.KM.geoNames.country(iso); if (r && r.full) r = { name: r.full };'));
    });
// N10 — the application token rotated by a map round.
mutate('N10 the application token rotated by a map round',
    function () { return RO.misplacedIndexTokens(INDEX).length === 0; },
    function () {
        return RO.misplacedIndexTokens(INDEX.replace(RO.currentAppToken(), RO.currentMapToken())).length === 0;
    });
// N11 — the mode dropped from the cache key, so a switch serves the previous mode's text.
mutate('N11 the mode dropped from the label cache key',
    function () {
        var F = labelEngine();
        F.setMode('zh-TW'); F.country('CN');
        F.setMode('code');
        return F.country('CN') === 'CN';
    },
    function () {
        var m = GLOBE.replace("var key = 'C:' + labelMode + ':' + iso;", "var key = 'C:' + iso;");
        var F = labelEngine(m);
        F.setMode('zh-TW'); F.country('CN');
        F.setMode('code');
        return F.country('CN') === 'CN';
    });
// N12 — the setter accepts a third mode, which is how "do not add a third language mode" gets violated quietly.
mutate('N12 the setter accepts a third mode',
    function () { var h = harness(); return h.set('en') === false && h.mode() === 'zh-TW'; },
    function () {
        var st = makeStorage('ok');
        var sb = { window: { localStorage: st.api }, String: String, Object: Object, Error: Error, console: console,
                   esc: function (v) { return String(v); }, root: function () { return null; }, render: function () {} };
        sb.globalThis = sb;
        var ctx = vm.createContext(sb);
        vm.runInContext('var state = { globe: null, labelMode: "zh-TW", labelModePersisted: true };', ctx);
        vm.runInContext(AUTHORITY.replace(/var LABEL_MODES = \['zh-TW', 'code'\];/, "var LABEL_MODES = ['zh-TW', 'code', 'en'];"), ctx);
        return vm.runInContext('setLabelMode("en")', ctx) === false && vm.runInContext('getLabelMode()', ctx) === 'zh-TW';
    });

// N13 — a visible label used AS the stored value, which is how a copy polish silently orphans every saved
// preference. The mutation renames the accepted vocabulary to the new copy.
mutate('N13 a visible label used as the stored mode value',
    function () {
        var h = harness({ seed: 'code' });
        return h.mode() === 'code' && h.set('Code') === false;
    },
    function () {
        var st = makeStorage('ok', 'code');
        var sb = { window: { localStorage: st.api }, String: String, Object: Object, Error: Error, console: console,
                   esc: function (v) { return String(v); }, root: function () { return null; }, render: function () {} };
        sb.globalThis = sb;
        var ctx = vm.createContext(sb);
        vm.runInContext('var state = { globe: null, labelMode: "zh-TW", labelModePersisted: true };', ctx);
        vm.runInContext(AUTHORITY.replace(/var LABEL_MODES = \['zh-TW', 'code'\];/, "var LABEL_MODES = ['Names', 'Code'];"), ctx);
        vm.runInContext('state.labelMode = readLabelMode();', ctx);
        return vm.runInContext('getLabelMode()', ctx) === 'code' && vm.runInContext('setLabelMode("Code")', ctx) === false;
    });
// N14 — the second option relabelled as a language, which is the one thing § forbids by name.
mutate('N14 the code option relabelled as a language',
    function () {
        var h = harness().html();
        return h.indexOf('English') === -1 && h.indexOf('Language') === -1 && /(>Code<)/.test(h);
    },
    function () {
        var mutated = extractFn('renderLabelModeControl', PAGE).replace(/seg\('code', 'Code'/, "seg('code', 'English'");
        return mutated.indexOf('English') === -1;
    });

console.log('\n  negative tests: ' + neg.caught + ' caught, ' + neg.missed + ' missed');

// ==============================================================================================================
console.log('\n' + '-'.repeat(40));
console.log('MAP LABEL MODE Names/Code (TEXTURE-3-R9/R9A): ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
