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
        // F1-7N-FB-4E-R4B §E — the HOUSE display name, and why it is a LEVEL rather than an edit to the asset.
        //
        // The vendored asset carries Natural Earth's NAME_ZHT, which labels CN as 中華人民共和國 and TW as 中華民國.
        // Those are the formal state names; this operation's users read the map in the short forms 中國 and 台灣.
        // Three things follow from that, and each is why this sits here:
        //
        //   · IT IS A LABEL, NOT DATA. The asset is a pinned, checksummed vendor extract with a documented
        //     provenance chain (source, dataset, version, sha256). Editing it would break that chain and would
        //     make the map branch's regenerated asset conflict on merge. The asset is untouched.
        //   · IT IS ONE-WAY. Nothing resolves a label back into an identifier — the ISO code is the identity and
        //     is returned beside the name on every call, exactly as before.
        //   · IT MUST BE OBSERVABLE. A bare override would make "the house name answered" and "the vendored name
        //     answered" indistinguishable, which is the failure this module was built to prevent. So it reports
        //     its own level, and a test asserts the level rather than only the string.
        ZH_HANT_HOUSE_DISPLAY: 'ZH_HANT_HOUSE_DISPLAY',   // countries 0 — house short form, ahead of the vendor
        ZH_HANT_PINNED_SOURCE: 'ZH_HANT_PINNED_SOURCE',   // countries 1 · admin1 1
        ZH_HANT_VENDORED_CLDR: 'ZH_HANT_VENDORED_CLDR',   // countries 2 (unused: level 1 covers every ISO country)
        ZH_HANT_REVIEWED_LIST: 'ZH_HANT_REVIEWED_LIST',   // continents 1 · oceans 1
        ENGLISH_CANONICAL: 'ENGLISH_CANONICAL',           // countries 3 · continents 2 · admin1 3
        CODE: 'CODE',                                     // countries 4 · admin1 4
        HIDDEN: 'HIDDEN'                                  // continents 3 · oceans 3 — no reliable name exists
    };

    // F1-7N-FB-4E-R4B §E — the house display names. Deliberately TINY and explicit: two entries, keyed by ISO
    // code, applied only to the geographic zh label. Adding a third requires an explicit decision, which is the
    // point — this is not a translation layer and must not become one.
    //
    // MAINLINE/MAP-BRANCH RECONCILIATION NOTE: `feature/map-texture-3` regenerates
    // assets/js/data/geo-names-zh-hant.js from Natural Earth. That regeneration cannot conflict with this table,
    // because this table is in a different file and overrides the asset rather than editing it. On merge, keep
    // BOTH: the regenerated asset AND this override. If the map branch ever adds its own alias mechanism, this
    // block is the one to remove — not the entries, which are the user-facing decision.
    var HOUSE_COUNTRY_ZH = {
        CN: '\u4e2d\u570b',      // 中國   (asset: 中華人民共和國)
        TW: '\u53f0\u7063'       // 台灣   (asset: 中華民國)
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
        // The house short form comes first, and ONLY for the zh label — `lang: 'en'` above already returned, so
        // the English/ISO surfaces are untouched by construction rather than by a second rule.
        var house = str(HOUSE_COUNTRY_ZH[code]);
        if (house) return { name: house, level: LEVEL.ZH_HANT_HOUSE_DISPLAY, iso: code };
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

    var api = {
        LEVEL: LEVEL,
        country: country,
        continent: continent,
        continentOfCountry: continentOfCountry,
        admin1: admin1,
        ocean: ocean,
        status: status
    };
    if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.geoNames = api; }
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
})();
