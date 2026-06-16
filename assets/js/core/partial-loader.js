// ========================================
// Kitchen Mama - Partial Loader (Phase 0 — DORMANT)
// ========================================
//
// Frontend Modularization Phase 0 infrastructure. See:
//   docs/planning/FRONTEND_MODULARIZATION_PLAN.md
//
// PURPOSE
//   A future utility for loading per-page HTML partials into a mount point on first
//   navigation, before handing off to KM.lifecycle. It lets us gradually move page
//   markup out of index.html WITHOUT a build step or framework.
//
// DORMANT — IMPORTANT
//   - Nothing calls this yet. No page depends on it.
//   - It performs NO fetch and touches NO DOM on load.
//   - It only acts when its functions are explicitly invoked (none are, in Phase 0).
//   - Existing inline page sections continue to work exactly as before.
//
// PUBLIC API (attached to window.KM.partialLoader)
//   loadPartial(pageKey, url, targetSelector) -> Promise<HTMLElement|null>
//       Fetch `url` once and inject its HTML into the element matched by
//       `targetSelector`. Cached per `pageKey` so a second call is a no-op.
//   isLoaded(pageKey) -> boolean   // has this pageKey already been loaded/injected?
//   clear(pageKey)                 // forget the loaded flag for one pageKey
//   clearAll()                     // forget all loaded flags
// ========================================

(function () {
    'use strict';

    // Defensive: namespace.js runs first, but guard anyway so load order can't break.
    window.KM = window.KM || {};

    // Internal registry of which pageKeys have been loaded/injected. No DOM side effects.
    var _loaded = Object.create(null);

    /**
     * Has the given pageKey already been loaded/injected by this loader?
     * @param {string} pageKey
     * @returns {boolean}
     */
    function isLoaded(pageKey) {
        return !!_loaded[pageKey];
    }

    /**
     * Forget the loaded flag for one pageKey. Does NOT remove any DOM.
     * @param {string} pageKey
     */
    function clear(pageKey) {
        if (pageKey && _loaded[pageKey]) {
            delete _loaded[pageKey];
        }
    }

    /**
     * Forget all loaded flags. Does NOT remove any DOM.
     */
    function clearAll() {
        _loaded = Object.create(null);
    }

    /**
     * Fetch an HTML partial once and inject it into the target element.
     * Dormant in Phase 0 — only runs when explicitly called.
     *
     * Resolves with the target element on success (or if already loaded), or null
     * if the target is missing or the fetch fails (failures are swallowed so a caller
     * can fall back to existing inline markup). Never throws to the caller.
     *
     * @param {string} pageKey         stable key identifying the page partial
     * @param {string} url             URL of the HTML partial to fetch
     * @param {string} targetSelector  CSS selector for the injection container
     * @returns {Promise<HTMLElement|null>}
     */
    function loadPartial(pageKey, url, targetSelector) {
        var target = targetSelector ? document.querySelector(targetSelector) : null;

        // Already loaded → no-op, return the (current) target without re-fetching.
        if (pageKey && _loaded[pageKey]) {
            return Promise.resolve(target);
        }

        if (!target) {
            console.warn('[KM.partialLoader] target not found for selector:', targetSelector);
            return Promise.resolve(null);
        }
        if (!url) {
            console.warn('[KM.partialLoader] no url provided for pageKey:', pageKey);
            return Promise.resolve(null);
        }

        return fetch(url, { cache: 'no-store' })
            .then(function (resp) {
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                return resp.text();
            })
            .then(function (html) {
                target.innerHTML = html;
                if (pageKey) _loaded[pageKey] = true;
                return target;
            })
            .catch(function (err) {
                console.warn('[KM.partialLoader] failed to load partial', pageKey, url, err);
                return null;
            });
    }

    window.KM.partialLoader = {
        loadPartial: loadPartial,
        isLoaded: isLoaded,
        clear: clear,
        clearAll: clearAll
    };

    console.log('[KM] partialLoader ready (dormant)');
})();
