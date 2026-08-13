// ========================================
// KM.loadState — shared frontend loading-state contract (F1-7B-R1)
// ----------------------------------------------------------------------------------------------------
// The SMALLEST reusable loading-state helper for the API/loading migration. It is TRANSPORT/UI only —
// it holds NO business data and computes NO business fact. A page binds ONE region (e.g. the Weekly
// Shipping cards area) to a controller; the controller tracks the region's state and renders bounded
// loading/refreshing/error affordances WITHOUT blanking the rest of the application. A failure in one
// region never forces unrelated regions into loading/error.
//
// States: INITIAL_LOADING · READY · REFRESHING · EMPTY · ERROR.
//   INITIAL_LOADING — first load, no prior content: show a bounded spinner/placeholder in the region.
//   REFRESHING      — a reload/post-write refresh while valid content is already visible: keep the
//                     content, add a subtle "refreshing" affordance (never blank).
//   READY / EMPTY   — data resolved (content, or a bounded empty-state).
//   ERROR           — bounded, region-scoped error (fail closed; the page owns the message; NO fallback).
//
// The state machine is PURE (unit-testable in Node). The DOM binding is a thin, optional layer.
// ========================================
(function () {
    'use strict';
    var STATES = {
        INITIAL_LOADING: 'INITIAL_LOADING',
        READY: 'READY',
        REFRESHING: 'REFRESHING',
        EMPTY: 'EMPTY',
        ERROR: 'ERROR'
    };
    // Allowed transitions (pure). A region starts implicitly before INITIAL_LOADING (from === null).
    var NEXT = {
        'null': ['INITIAL_LOADING', 'READY', 'EMPTY', 'ERROR'],
        INITIAL_LOADING: ['READY', 'EMPTY', 'ERROR'],
        READY: ['REFRESHING', 'READY', 'EMPTY', 'ERROR'],
        REFRESHING: ['READY', 'EMPTY', 'ERROR'],
        EMPTY: ['INITIAL_LOADING', 'REFRESHING', 'READY', 'ERROR'],
        ERROR: ['INITIAL_LOADING', 'REFRESHING', 'READY', 'EMPTY']
    };
    function canTransition(from, to) {
        var key = (from === null || from === undefined) ? 'null' : String(from);
        return !!(NEXT[key] && NEXT[key].indexOf(String(to)) !== -1) && STATES.hasOwnProperty(to);
    }
    function isLoadingState(s) { return s === STATES.INITIAL_LOADING || s === STATES.REFRESHING; }
    function isDataState(s) { return s === STATES.READY || s === STATES.EMPTY; }
    // Given whether content already exists, which loading state should a (re)load enter?
    function loadEntryState(hasContent) { return hasContent ? STATES.REFRESHING : STATES.INITIAL_LOADING; }

    // Region controller. opts.render(state, prev) is the ONLY side-effect hook (DOM-agnostic → testable).
    // Invalid transitions are ignored (returns false) — a region can never be driven into an illegal state.
    function createRegion(opts) {
        opts = opts || {};
        var state = null;
        var render = (typeof opts.render === 'function') ? opts.render : function () {};
        function set(to) {
            if (!canTransition(state, to)) return false;
            var prev = state; state = to; render(state, prev); return true;
        }
        return {
            get: function () { return state; },
            set: set,
            beginLoad: function (hasContent) { return set(loadEntryState(hasContent)); },
            isLoading: function () { return isLoadingState(state); }
        };
    }

    // Thin default DOM binding: shows a bounded placeholder for a region element. Safe no-op without a DOM.
    // Only INITIAL_LOADING paints into the element (no prior content); REFRESHING tags the element via a
    // data-attribute + class so CSS can show a subtle indicator WITHOUT replacing the visible content.
    function bindElement(el, message) {
        return createRegion({
            render: function (state) {
                if (!el) return;
                if (state === STATES.INITIAL_LOADING) {
                    el.setAttribute('data-load-state', state);
                    el.innerHTML = '<p class="km-region-loading" style="color:#64748B; padding:8px;">' +
                        (message || 'Loading…') + '</p>';
                } else if (state === STATES.REFRESHING) {
                    el.setAttribute('data-load-state', state);
                    el.classList.add('km-region-refreshing');   // content stays visible
                } else {
                    // READY / EMPTY / ERROR → the page renders the real content; just clear the affordance.
                    el.setAttribute('data-load-state', state);
                    el.classList.remove('km-region-refreshing');
                }
            }
        });
    }

    var api = {
        STATES: STATES,
        canTransition: canTransition,
        isLoadingState: isLoadingState,
        isDataState: isDataState,
        loadEntryState: loadEntryState,
        createRegion: createRegion,
        bindElement: bindElement
    };
    if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.loadState = api; }
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
})();
