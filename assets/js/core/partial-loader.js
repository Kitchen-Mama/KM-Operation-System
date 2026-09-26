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
// NOT DORMANT ANY MORE — S3-R11
//   Phase 3 moved every large page's markup out of index.html, so this loader is now on the
//   critical path of SKU Details, SKU Regional Details, FC Summary, Product Strategy and the
//   Purchase Order pages: each one's lifecycle mount is `_ensure<Page>Markup().then(...)`, and that
//   helper calls loadPartial. The header used to say "nothing calls this yet", which is how a loader
//   on the critical path of five pages reads as inert to anyone auditing it.
//   - It still performs NO fetch and touches NO DOM on load. It acts only when invoked.
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

    /* S3-R11 §4 — THE OPEN FETCH, WHICH `_loaded` COULD NOT SEE.
     *
     * `_loaded[pageKey]` is written in the `.then()`, so it answers "has this finished", never "is
     * this happening". Between the request going out and the response landing, a second call saw an
     * unloaded key and a missing section element and started a SECOND fetch for the same partial.
     *
     * MEASURED, NOT REASONED. The S3-R11 interaction runner drives A -> B -> A in one tick against a
     * page whose markup is not yet in the DOM, in real headless Chrome, and counted TWO partial
     * requests for one section before this change.
     *
     * The cost is not the duplicated byte — it is a local file. It is that both `.then()`s run
     * `target.innerHTML = html`, so the second replacement destroys the DOM the first mount has
     * already wired its listeners to and already begun rendering into. The page that comes back from
     * that is the empty one, which is why this is a correctness fix wearing a performance label.
     *
     * This registry holds only what is IN FLIGHT. Every settlement deletes its own entry and only its
     * own, so nothing is retained after the fetch ends, a failure is never cached as a failure, and
     * the next call issues a real request exactly as it did before. */
    var _inflight = Object.create(null);

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
     * Is a fetch for this pageKey open right now?
     * Deliberately SEPARATE from isLoaded: "on its way" and "here" are different answers, and the
     * whole defect above was one flag being asked to give both.
     * @param {string} pageKey
     * @returns {boolean}
     */
    function isLoading(pageKey) {
        return !!(pageKey && _inflight[pageKey]);
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

        // ALREADY ON ITS WAY → join it. The joiner gets the originator's resolution and issues
        // nothing, so one navigation burst injects the markup exactly once.
        if (pageKey && _inflight[pageKey]) {
            return _inflight[pageKey];
        }

        if (!target) {
            console.warn('[KM.partialLoader] target not found for selector:', targetSelector);
            return Promise.resolve(null);
        }
        if (!url) {
            console.warn('[KM.partialLoader] no url provided for pageKey:', pageKey);
            return Promise.resolve(null);
        }

        var flight = fetch(url, { cache: 'no-store' })
            .then(function (resp) {
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                return resp.text();
            })
            .then(function (html) {
                /* INJECT ONCE. A caller that navigated away and back during this fetch has already
                   had its markup installed by the flight it joined; writing innerHTML again here
                   would throw away the DOM that mount is already using. The loaded flag is the
                   record of that, so it is also the guard. */
                if (!(pageKey && _loaded[pageKey])) {
                    target.innerHTML = html;
                    if (pageKey) _loaded[pageKey] = true;
                }
                return target;
            })
            .catch(function (err) {
                console.warn('[KM.partialLoader] failed to load partial', pageKey, url, err);
                return null;
            });

        /* RELEASED ON EITHER OUTCOME, and only by the flight that owns the key. A failure left
           registered would make every later attempt join a promise that has already resolved null —
           one dead fetch becoming a permanently empty page. `flight` never rejects (the catch above
           absorbs it), so one `then` is the whole release. */
        if (pageKey) {
            _inflight[pageKey] = flight;
            flight.then(function () {
                if (_inflight[pageKey] === flight) delete _inflight[pageKey];
            });
        }
        return flight;
    }

    window.KM.partialLoader = {
        loadPartial: loadPartial,
        isLoaded: isLoaded,
        isLoading: isLoading,
        clear: clear,
        clearAll: clearAll
    };

    console.log('[KM] partialLoader ready');
})();
