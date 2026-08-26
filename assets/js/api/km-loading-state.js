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
    // F1-7N-FB-4C-R1 §F — PRE_LOAD and DEPLOYMENT_MISMATCH join the contract.
    //
    // PRE_LOAD makes the pre-first-load state EXPLICIT. It was previously `null`, which is indistinguishable from
    // "no region bound" and cannot be asserted; `null` is still accepted as an alias so no existing caller changes.
    //
    // DEPLOYMENT_MISMATCH is its own terminal state and is deliberately NOT a flavour of ERROR: an error invites a
    // retry, and retrying cannot publish an Apps Script deployment. It is also emphatically not EMPTY — the whole
    // point of §F is that a failed read never renders as "there is no data".
    var STATES = {
        PRE_LOAD: 'PRE_LOAD',
        INITIAL_LOADING: 'INITIAL_LOADING',
        READY: 'READY',
        REFRESHING: 'REFRESHING',
        EMPTY: 'EMPTY',
        ERROR: 'ERROR',
        DEPLOYMENT_MISMATCH: 'DEPLOYMENT_MISMATCH'
    };
    // The two LOADING flavours §F asks for are INITIAL_LOADING (no prior content) and REFRESHING (content visible);
    // isLoadingState covers both, so a page never has to know which one it is in.
    var LOADING_STATES = [STATES.INITIAL_LOADING, STATES.REFRESHING];
    // Allowed transitions (pure). A region starts at PRE_LOAD (from === null is the legacy alias for it).
    var NEXT = {
        'null': ['PRE_LOAD', 'INITIAL_LOADING', 'READY', 'EMPTY', 'ERROR', 'DEPLOYMENT_MISMATCH'],
        PRE_LOAD: ['INITIAL_LOADING', 'READY', 'EMPTY', 'ERROR', 'DEPLOYMENT_MISMATCH'],
        INITIAL_LOADING: ['READY', 'EMPTY', 'ERROR', 'DEPLOYMENT_MISMATCH'],
        READY: ['REFRESHING', 'READY', 'EMPTY', 'ERROR', 'DEPLOYMENT_MISMATCH'],
        REFRESHING: ['READY', 'EMPTY', 'ERROR', 'DEPLOYMENT_MISMATCH'],
        EMPTY: ['INITIAL_LOADING', 'REFRESHING', 'READY', 'ERROR', 'DEPLOYMENT_MISMATCH'],
        ERROR: ['INITIAL_LOADING', 'REFRESHING', 'READY', 'EMPTY', 'DEPLOYMENT_MISMATCH'],
        // A mismatch is only left by loading again (an explicit user retry after publishing) — never by drifting
        // into EMPTY, which would present a publish problem as "no data".
        DEPLOYMENT_MISMATCH: ['INITIAL_LOADING', 'REFRESHING', 'READY', 'ERROR']
    };
    function canTransition(from, to) {
        var key = (from === null || from === undefined) ? 'null' : String(from);
        return !!(NEXT[key] && NEXT[key].indexOf(String(to)) !== -1) && STATES.hasOwnProperty(to);
    }
    function isLoadingState(s) { return s === STATES.INITIAL_LOADING || s === STATES.REFRESHING; }
    function isDataState(s) { return s === STATES.READY || s === STATES.EMPTY; }
    // §F — "ERROR is not EMPTY", written down as a predicate so a page cannot conflate them by accident.
    function isFailureState(s) { return s === STATES.ERROR || s === STATES.DEPLOYMENT_MISMATCH; }
    function isRetryableState(s) { return s === STATES.ERROR; }   // a mismatch needs a publish, not a retry
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
                    // PRE_LOAD / READY / EMPTY / ERROR / DEPLOYMENT_MISMATCH → the page renders the real content or
                    // its own banner; this only clears the loading affordance. The state is still published as a
                    // data-attribute so a test (and CSS) can see which one it is.
                    el.setAttribute('data-load-state', state);
                    el.classList.remove('km-region-refreshing');
                }
            }
        });
    }

    var api = {
        STATES: STATES,
        LOADING_STATES: LOADING_STATES,
        canTransition: canTransition,
        isLoadingState: isLoadingState,
        isDataState: isDataState,
        isFailureState: isFailureState,
        isRetryableState: isRetryableState,
        loadEntryState: loadEntryState,
        createRegion: createRegion,
        bindElement: bindElement
    };
    if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.loadState = api; }
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
})();
