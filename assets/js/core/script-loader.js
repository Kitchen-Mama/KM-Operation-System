// ========================================
// Kitchen Mama - Route Script Loader  (S4-R3 §3)
// ========================================
//
// WHY THIS EXISTS
//   index.html loads every page's JavaScript up front. Deferred scripts still all execute before
//   DOMContentLoaded, so a session that never opens the On-the-Way Map still parses and runs the
//   globe renderer, the 110m world geometry and the zh-Hant place-name table — 584 KB — before the
//   menu is usable. The Product Strategy board costs another 575 KB and has no menu item at all.
//
//   This loads a route's own scripts when that route is first opened, and never again.
//
// WHY NOT A BUNDLER
//   §3 forbids one, and nothing here needs one. The contract this file implements is the SAME
//   contract partial-loader.js already proved in production, for the same reasons, and the comments
//   there are the reference:
//     - LOADED and IN FLIGHT are different answers and need different registries. One flag asked to
//       give both is how S3-R11 measured two fetches for one partial.
//     - A failure is NEVER cached as a failure. One dead fetch must not become a permanently broken
//       route; the next attempt issues a real request exactly as the first did.
//     - The in-flight entry is released by the flight that owns it, on either outcome.
//
// EXECUTION ORDER IS PRESERVED, WHICH IS NOT OPTIONAL
//   These sets have internal order dependencies (psb-board-ui reads PSB_SELECTORS; the map page
//   reads KMGlobe). A dynamically inserted <script> defaults to async=true, which means whichever
//   file lands first runs first. Every script here is inserted with `async = false`, which is the
//   documented way to say "download in parallel, execute in document order" — so the set behaves
//   exactly as the same tags in index.html did.
//
// PUBLIC API (window.KM.scriptLoader)
//   load(url) -> Promise<boolean>              one script, once; false if it failed to load
//   ensure(key, urls) -> Promise<boolean>      a named set, in order; false if ANY member failed
//   isLoaded(key|url) -> boolean
//   isLoading(key|url) -> boolean
//   loadedKeys() -> string[]                   read-only, for the regression suite
// ========================================

(function () {
    'use strict';

    window.KM = window.KM || {};

    // What has finished, and what is on its way. Separate, for the reason partial-loader records.
    var _loaded = Object.create(null);     // url or set key -> true
    var _inflight = Object.create(null);   // url or set key -> Promise

    function isLoaded(key) { return !!(key && _loaded[key]); }
    function isLoading(key) { return !!(key && _inflight[key]); }
    function loadedKeys() { return Object.keys(_loaded); }

    /**
     * Insert one <script> and resolve when it has executed.
     * Resolves TRUE on load, FALSE on error — it never rejects, so a caller's `.then` is the only
     * path it has to handle and a failed set cannot produce an unhandled rejection.
     * @param {string} url
     * @returns {Promise<boolean>}
     */
    function load(url) {
        if (!url) return Promise.resolve(false);
        if (_loaded[url]) return Promise.resolve(true);
        if (_inflight[url]) return _inflight[url];

        var flight = new Promise(function (resolve) {
            var el = document.createElement('script');
            el.src = url;
            // Download in parallel, execute in insertion order. See the header.
            el.async = false;
            el.onload = function () { _loaded[url] = true; resolve(true); };
            el.onerror = function () {
                // NOT recorded as loaded, and NOT remembered as failed. The next attempt is a real
                // attempt — that is what makes Retry mean something.
                console.warn('[KM.scriptLoader] failed to load', url);
                try { if (el.parentNode) el.parentNode.removeChild(el); } catch (e) {}
                resolve(false);
            };
            (document.head || document.documentElement).appendChild(el);
        });

        _inflight[url] = flight;
        flight.then(function () { if (_inflight[url] === flight) delete _inflight[url]; });
        return flight;
    }

    /**
     * Load a named set of scripts, preserving order, exactly once.
     * A second call while the first is still running JOINS it — one navigation burst inserts each
     * script once, which is what keeps a re-click from evaluating a 300 KB module twice.
     * @param {string} key    stable name for the set (the route key)
     * @param {string[]} urls in the order index.html used to load them
     * @returns {Promise<boolean>} true only if every member loaded
     */
    function ensure(key, urls) {
        if (!key) return Promise.resolve(false);
        if (_loaded[key]) return Promise.resolve(true);
        if (_inflight[key]) return _inflight[key];
        if (!urls || !urls.length) { _loaded[key] = true; return Promise.resolve(true); }

        // Every element is inserted NOW, in order, so the browser fetches them in parallel and the
        // engine runs them in the order given. Awaiting each one before inserting the next would
        // serialize the downloads and turn one round of latency into eight.
        var flight = Promise.all(urls.map(function (u) { return load(u); }))
            .then(function (results) {
                var allOk = results.every(function (r) { return r === true; });
                // The SET key is recorded only when the whole set is present. A partially loaded set
                // is not a loaded set: recording it would let a later navigation mount a page whose
                // dependencies never arrived.
                if (allOk) _loaded[key] = true;
                return allOk;
            });

        _inflight[key] = flight;
        flight.then(function () { if (_inflight[key] === flight) delete _inflight[key]; });
        return flight;
    }

    window.KM.scriptLoader = {
        load: load,
        ensure: ensure,
        isLoaded: isLoaded,
        isLoading: isLoading,
        loadedKeys: loadedKeys
    };

    console.log('[KM] scriptLoader ready');
})();
