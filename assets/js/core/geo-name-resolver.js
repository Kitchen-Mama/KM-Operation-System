// ========================================
// KM.geoNames — the ONE geographic-name authority (MAP-VISUAL-REAL-EARTH-TEXTURE-3, localization authority)
// ----------------------------------------------------------------------------------------------------
// PURE. No DOM, no network, no clock, no randomness. It answers one question — "what do I call this place?" —
// and it answers it the same way every time, from the vendored zh-Hant name asset
// (window.KM_GEO_NAMES_ZH_HANT) plus the caller's own English/code fallbacks.
//
// WHY A RESOLVER AND NOT A LOOKUP. The localization authority defines a DETERMINISTIC ORDER per feature class,
// and every level of every order has to be reachable and observable. A bare `names[iso] || iso` cannot say WHICH
// authority answered, so a silent regression to ISO codes would look identical to a successful zh-Hant render.
// Every call therefore returns the name AND the level that produced it, and the tests assert on the level.
//
// WHAT THIS MODULE MAY NEVER DO, per the authority decision:
//   · no runtime translation and no remote naming API — the only name source is the vendored asset;
//   · no character conversion — the asset already contains verified Traditional strings, and converting
//     Simplified to Traditional here would be translation (and 干 -> 幹/乾 makes it unsafe in principle);
//   · no geometry: this module never reads or emits a coordinate, a ring or a label anchor.
//
// LANGUAGE. zh-TW is the DEFAULT for geographic labels. `lang: 'en'` is available for the operational logistics
// surfaces where an ISO code or an English name is the working identifier — the authority keeps ISO codes legal
// there and as a localization fallback, not as the normal primary geographic label.
// ========================================
(function () {
    'use strict';

    // Authority levels, reported back so a caller (and a test) can prove which source answered.
    // The numbers match the ordered lists in the localization authority decision.
    var LEVEL = {
        // TEXTURE-3-R3 §F — the two DISPLAY levels that now sit ABOVE the vendored formal name. §F's order for a
        // map label is: verified CLDR zh-Hant alt-short, then a reviewed zh-TW display alias, then NAME_ZHT, then
        // English, then ISO alpha-2. Both new levels come from assets/js/data/geo-display-aliases-zh-tw.js.
        //
        // WHY TWO LEVELS AND NOT ONE. Level 1 is an authority §F NAMES, so applying it is following the
        // specification. Level 2 is a REVIEW, so it is the level that must refuse a geopolitically weighted name
        // rather than decide it. Collapsing them would lose exactly that distinction — and the asset carries an
        // `unresolved` list of names it deliberately did NOT apply, which is only meaningful because level 2
        // exists separately.
        CLDR_ALT_SHORT: 'CLDR_ALT_SHORT',                 // countries 1 (display)
        REVIEWED_DISPLAY_ALIAS: 'REVIEWED_DISPLAY_ALIAS', // countries 2 (display)
        ZH_HANT_PINNED_SOURCE: 'ZH_HANT_PINNED_SOURCE',   // countries 3 · admin1 1 — and the FULL-name authority
        ZH_HANT_VENDORED_CLDR: 'ZH_HANT_VENDORED_CLDR',   // admin1 2 (wired, empty: no bounded source vendored)
        ZH_HANT_REVIEWED_LIST: 'ZH_HANT_REVIEWED_LIST',   // continents 1 · oceans 1
        ENGLISH_CANONICAL: 'ENGLISH_CANONICAL',           // countries 4 · continents 2 · admin1 3
        CODE: 'CODE',                                     // countries 5 · admin1 4
        HIDDEN: 'HIDDEN'                                  // continents 3 · oceans 3 — no reliable name exists
    };

    function dataset() {
        return (typeof window !== 'undefined' && window.KM_GEO_NAMES_ZH_HANT) ? window.KM_GEO_NAMES_ZH_HANT : null;
    }
    function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
    function upper(v) { return str(v).toUpperCase(); }

    // ---- COUNTRIES ---------------------------------------------------------------------------------------
    // 1 verified zh-Hant from the pinned Natural Earth field · 2 vendored CLDR zh-Hant · 3 canonical English ·
    // 4 ISO alpha-2. Level 2 is wired but empty: the pinned field covers all 175 ISO-coded countries, so no CLDR
    // mapping was vendored. Keeping the branch means adding one later needs no change here.
    function aliases() {
        return (typeof window !== 'undefined' && window.KM_GEO_DISPLAY_ALIASES) ? window.KM_GEO_DISPLAY_ALIASES : null;
    }

    // §F — the FULL formal name, always available whatever the map is painting. This is what a tooltip or a detail
    // panel asks for, and it is deliberately a SEPARATE function rather than an option on the display path: the
    // display name is allowed to be short, the full name is not allowed to be lossy, and one function cannot be
    // the authority for both without one of those guarantees quietly winning.
    function countryFull(iso, opts) {
        opts = opts || {};
        var code = upper(iso);
        var d = dataset();
        if (!code) return { name: '', level: LEVEL.HIDDEN, iso: '' };
        var zh = d && d.countries ? str(d.countries[code]) : '';
        if (zh && (opts.lang || 'zh-TW') !== 'en') return { name: zh, level: LEVEL.ZH_HANT_PINNED_SOURCE, iso: code };
        var en = (d && d.countryEnglish && str(d.countryEnglish[code])) || str(opts.english);
        if (en) return { name: en, level: LEVEL.ENGLISH_CANONICAL, iso: code };
        return { name: code, level: LEVEL.CODE, iso: code };
    }

    function country(iso, opts) {
        opts = opts || {};
        var code = upper(iso);
        var d = dataset();
        var lang = opts.lang || 'zh-TW';
        if (!code) return { name: '', level: LEVEL.HIDDEN, iso: '' };
        if (lang === 'en') {
            var en0 = (d && d.countryEnglish && str(d.countryEnglish[code])) || str(opts.english);
            return en0 ? { name: en0, level: LEVEL.ENGLISH_CANONICAL, iso: code }
                       : { name: code, level: LEVEL.CODE, iso: code };
        }
        // §F — the two DISPLAY levels, consulted only for a map label. `form: 'full'` bypasses them entirely, so
        // the same call site can ask for either without a second resolver.
        if (opts.form !== 'full') {
            var a = aliases();
            if (a) {
                var as = a.cldrAltShort && a.cldrAltShort[code];
                if (as && str(as.display)) {
                    return { name: str(as.display), level: LEVEL.CLDR_ALT_SHORT, iso: code,
                             full: str(as.full), source: as.source };
                }
                var rv = a.reviewed && a.reviewed[code];
                if (rv && str(rv.display)) {
                    return { name: str(rv.display), level: LEVEL.REVIEWED_DISPLAY_ALIAS, iso: code,
                             full: str(rv.full), source: rv.source };
                }
            }
        }
        var zh = d && d.countries ? str(d.countries[code]) : '';
        if (zh) return { name: zh, level: LEVEL.ZH_HANT_PINNED_SOURCE, iso: code };
        var cldr = d && d.countriesCldr ? str(d.countriesCldr[code]) : '';
        if (cldr) return { name: cldr, level: LEVEL.ZH_HANT_VENDORED_CLDR, iso: code };
        var en = (d && d.countryEnglish && str(d.countryEnglish[code])) || str(opts.english);
        if (en) return { name: en, level: LEVEL.ENGLISH_CANONICAL, iso: code };
        return { name: code, level: LEVEL.CODE, iso: code };
    }

    // ---- CONTINENTS --------------------------------------------------------------------------------------
    // 1 vendored reviewed zh-Hant list · 2 canonical English · 3 HIDE. There is deliberately no code fallback:
    // a continent has no code, and "Seven seas (open ocean)" is not a continent, so it is hidden rather than
    // labelled with a value that would read as one.
    function continent(neContinent, opts) {
        opts = opts || {};
        var key = str(neContinent);
        var d = dataset();
        var lang = opts.lang || 'zh-TW';
        if (!key) return { name: '', level: LEVEL.HIDDEN, key: '' };
        if (lang !== 'en') {
            var zh = d && d.continents ? str(d.continents[key]) : '';
            if (zh) return { name: zh, level: LEVEL.ZH_HANT_REVIEWED_LIST, key: key };
        }
        if (opts.allowEnglish === false) return { name: '', level: LEVEL.HIDDEN, key: key };
        return { name: key, level: LEVEL.ENGLISH_CANONICAL, key: key };
    }

    // The continent a country belongs to, from the pinned dataset's own CONTINENT field. Grouping metadata, not
    // geometry — no coordinate is involved.
    function continentOfCountry(iso) {
        var d = dataset();
        var code = upper(iso);
        return (d && d.countryContinent && str(d.countryContinent[code])) || '';
    }

    // ---- ADMIN-1 -----------------------------------------------------------------------------------------
    // 1 verified zh-Hant from the pinned source · 2 vendored zh-Hant subdivision source (none is vendored: no
    // properly licensed bounded source was available, so the level is wired and empty) · 3 the existing English
    // name · 4 the existing administrative code.
    //
    // Missing Chinese coverage here is EXPECTED and must never block the country/continent layer: 356 of 3,835
    // divisions fall back, concentrated in Latin America, Indonesia and the Benelux. `division.n` (full English
    // name) and `division.k` (division code) are exactly the values the geometry asset already carries.
    // THE LOOKUP KEY IS COUNTRY + FULL ENGLISH NAME, not the displayed division code. `country|displayedCode`
    // is measurably NOT unique in the geometry asset - 35 keys collide across 53 rows, and BA|BIH alone covers
    // nine different Bosnian cantons - so keying on it would give nine cantons one canton's name. The full name
    // is `division.n`, falling back to `division.k` for the divisions where the asset omits `n` because the two
    // are identical.
    function admin1(iso, divisionCode, opts) {
        opts = opts || {};
        var c = upper(iso), k = str(divisionCode);
        var d = dataset();
        var lang = opts.lang || 'zh-TW';
        var english = str(opts.english);          // caller passes division.n (absent when identical to the code)
        if (!c || !k) return { name: k, level: LEVEL.CODE, key: c + '|' + k };
        var key = c + '|' + (english || k).toLowerCase();
        if (lang !== 'en') {
            var zh = d && d.admin1 ? str(d.admin1[key]) : '';
            if (zh) return { name: zh, level: LEVEL.ZH_HANT_PINNED_SOURCE, key: key };
            var vend = d && d.admin1Vendored ? str(d.admin1Vendored[key]) : '';
            if (vend) return { name: vend, level: LEVEL.ZH_HANT_VENDORED_CLDR, key: key };
        }
        if (english) return { name: english, level: LEVEL.ENGLISH_CANONICAL, key: key };
        return { name: k, level: LEVEL.CODE, key: key };
    }

    // ---- OCEANS ------------------------------------------------------------------------------------------
    // Wired for completeness because the authority specifies an order "if implemented". No ocean label layer
    // exists yet and no ocean name list is vendored, so this hides rather than inventing a name.
    function ocean(key, opts) {
        opts = opts || {};
        var k = str(key);
        var d = dataset();
        if (!k) return { name: '', level: LEVEL.HIDDEN, key: '' };
        var zh = d && d.oceans ? str(d.oceans[k]) : '';
        if (zh && (opts.lang || 'zh-TW') !== 'en') return { name: zh, level: LEVEL.ZH_HANT_REVIEWED_LIST, key: k };
        if (opts.allowEnglish === false) return { name: '', level: LEVEL.HIDDEN, key: k };
        return { name: k, level: LEVEL.ENGLISH_CANONICAL, key: k };
    }

    // ---- introspection -----------------------------------------------------------------------------------
    // Lets the deployment surface prove WHICH name asset is loaded, the same way the build stamps prove which
    // Apps Script owner is deployed. A missing asset is a named fact, not a silent regression to ISO codes.
    function status() {
        var d = dataset();
        if (!d) {
            return { loaded: false, reason: 'KM_GEO_NAMES_ZH_HANT_ABSENT',
                effect: 'every geographic label falls back to English or an ISO code',
                countries: 0, continents: 0, admin1: 0 };
        }
        var m = d.meta || {};
        return {
            loaded: true,
            task: m.task || null,
            default_language: m.default_language || null,
            countries: Object.keys(d.countries || {}).length,
            continents: Object.keys(d.continents || {}).length,
            admin1: Object.keys(d.admin1 || {}).length,
            coverage: m.coverage || null,
            country_field: (m.country_name_source && m.country_name_source.field) || null,
            admin1_field: (m.admin1_name_source && m.admin1_name_source.field) || null
        };
    }

    // §F — the naming decisions this build DELIBERATELY did not make, surfaced so the product can show that one
    // is outstanding instead of appearing to have settled it. Empty when nothing is pending.
    function unresolvedNames() {
        var a = aliases();
        return (a && a.unresolved) ? a.unresolved.slice() : [];
    }

    var api = {
        LEVEL: LEVEL,
        country: country,
        countryFull: countryFull,
        unresolvedNames: unresolvedNames,
        continent: continent,
        continentOfCountry: continentOfCountry,
        admin1: admin1,
        ocean: ocean,
        status: status
    };
    if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.geoNames = api; }
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
})();
