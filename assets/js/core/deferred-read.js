/**
 * ==================================================================================================
 * S4-R4 — THE STATE OF A READ NOBODY HAS ASKED FOR YET
 * ==================================================================================================
 *
 * THIS IS NOT A CACHE, and the difference is the whole point. It stores no business rows. A read
 * resolves to the owner page's own model, which the owner merges into the same read model an eager
 * read filled a moment earlier — every downstream getter on those pages is untouched. What lives
 * here is the four words §5 asks a deferred dependency to be able to say about itself:
 *
 *     NOT_LOADED   nobody has needed it yet, and nothing has been sent
 *     LOADING      exactly one read is in flight
 *     READY        the owner has the data
 *     FAILED       a read was attempted and refused; the owner still has its primary UI
 *
 * plus the single-flight that makes "first consumer reads once, second use reads none" a property
 * of the code rather than a hope. A page that renders twice in a row - and these pages do, because
 * a filter rebuild re-renders - must not send two reads.
 *
 * NO TTL, BY CONSTRUCTION. There is no clock in this file. A deferred model is valid until its
 * OWNER says otherwise, and the only thing that says otherwise is a write that could have changed
 * the same rows (invalidate). Time is not evidence that data changed, and inventing an interval
 * would be inventing a freshness contract nobody agreed to.
 *
 * FAILED IS STICKY UNTIL retry(). A deliberate choice, and the alternative is worse: these
 * consumers are re-entered by rendering, so a FAILED state that re-read on every ensure() would
 * turn one refused read into a request storm against a server that is already refusing. The owner
 * shows a scoped error with a Retry, and Retry is the only thing that sends again. The cost is
 * stated honestly: leaving the route and returning shows the same error rather than silently
 * re-reading.
 *
 * SUPERSEDED ANSWERS NEVER COMMIT. Each flight remembers the epoch it started in; invalidate()
 * bumps it. An answer from an older epoch resolves as { superseded: true } and carries no model, so
 * a slow read cannot overwrite a model that a write has already replaced, and a read belonging to a
 * page state the user has left cannot repaint it.
 * ==================================================================================================
 */
(function () {
    'use strict';
    if (typeof window === 'undefined') return;
    var KM = window.KM = window.KM || {};
    if (KM.deferredRead) return;

    var STATES = { NOT_LOADED: 'NOT_LOADED', LOADING: 'LOADING', READY: 'READY', FAILED: 'FAILED' };

    var _reg = Object.create(null);   // name -> entry

    function _entry(name) {
        var k = String(name || '');
        if (!_reg[k]) _reg[k] = { name: k, tables: [], read: null, state: STATES.NOT_LOADED,
            error: null, flight: null, epoch: 0, reads: 0 };
        return _reg[k];
    }

    /**
     * Declare a deferred dependency.
     * @param {string} name   owner-scoped id, e.g. 'factoryInventory.movements'
     * @param {object} spec   { tables: string[], read?: function(tables): Promise<model> }
     * The default reader is the bounded scoped read these pages already use, so a deferred read is
     * the SAME read as before - moved, not reshaped. No new action, no new API surface.
     */
    function define(name, spec) {
        var e = _entry(name);
        e.tables = (spec && spec.tables) || [];
        e.read = (spec && spec.read) || function (tables) {
            return window.KM.DB.loadScopedTables(tables);
        };
        return e.name;
    }

    function state(name) { return _entry(name).state; }
    function lastError(name) { return _entry(name).error; }
    function tablesOf(name) { return _entry(name).tables.slice(); }
    /** Reads actually dispatched for this dependency. The suite counts it; nothing reads it to decide. */
    function readCount(name) { return _entry(name).reads; }

    /**
     * Ask for the dependency. Resolves - never rejects, because a caller that forgot a .catch would
     * otherwise take the page down with an unhandled rejection, which is the defect S4-R2 spent a
     * round removing.
     * @returns {Promise<{ok:boolean, model?:object, error?:*, fresh?:boolean, superseded?:boolean, retryable?:boolean}>}
     */
    function ensure(name) {
        var e = _entry(name);
        if (e.state === STATES.READY)  return Promise.resolve({ ok: true, fresh: false });
        if (e.state === STATES.FAILED) return Promise.resolve({ ok: false, error: e.error, retryable: true });
        if (e.flight) return e.flight;                 // LOADING: one read, however many callers
        if (typeof e.read !== 'function') {
            return Promise.resolve({ ok: false, error: new Error('deferredRead: ' + e.name + ' was never defined'), retryable: false });
        }

        var myEpoch = e.epoch;
        e.state = STATES.LOADING;
        e.error = null;
        e.reads++;
        var flight = Promise.resolve()
            .then(function () { return e.read(e.tables); })
            .then(function (model) {
                if (e.epoch !== myEpoch) return { ok: false, superseded: true };
                e.state = STATES.READY; e.error = null;
                return { ok: true, model: model, fresh: true };
            }, function (err) {
                if (e.epoch !== myEpoch) return { ok: false, superseded: true };
                e.state = STATES.FAILED; e.error = err;
                return { ok: false, error: err, retryable: true };
            });
        e.flight = flight;
        flight.then(function () { if (e.flight === flight) e.flight = null; });
        return flight;
    }

    /**
     * The user asked again after a refusal. Exactly one new read: clearing FAILED first means
     * ensure() takes the dispatch path, and a retry pressed twice while one is in flight joins it
     * rather than sending a second.
     */
    function retry(name) {
        var e = _entry(name);
        if (e.state === STATES.FAILED) { e.state = STATES.NOT_LOADED; e.error = null; }
        return ensure(name);
    }

    /**
     * A write may have changed these rows. Back to NOT_LOADED, and any answer still in flight is
     * superseded rather than allowed to land on top of the write.
     */
    function invalidate(name) {
        var e = _entry(name);
        e.epoch++;
        e.state = STATES.NOT_LOADED;
        e.error = null;
        e.flight = null;
        return e.epoch;
    }

    /** Test/debug surface. Reports; decides nothing. */
    function debug() {
        var o = {};
        Object.keys(_reg).forEach(function (k) {
            o[k] = { state: _reg[k].state, tables: _reg[k].tables.slice(),
                reads: _reg[k].reads, epoch: _reg[k].epoch, hasError: !!_reg[k].error };
        });
        return o;
    }

    KM.deferredRead = {
        STATES: STATES,
        define: define, ensure: ensure, retry: retry, invalidate: invalidate,
        state: state, lastError: lastError, tables: tablesOf, readCount: readCount,
        debug: debug
    };
    window.__kmDeferredReadDebug = debug;
}());
