/**
 * assets/js/core/scope-registry.js
 * F1-7N-FB-4C §B2 — THE SINGLE CANONICAL SCOPE-REGISTRY AUTHORITY (Country / Marketplace).
 *
 * WHY THIS EXISTS. Site Inventory's own filter row already read the slim, bounded, read-only registry
 * (`inventoryScope.registry.get`, 64_api_v1_scope_registry.gs) and worked. The "AI Plan — Inventory" modal did
 * NOT: it kept its own, second source — a synchronous seed from the broad `window._opDbCache` (which no longer
 * exists on a cold session, so it returned []) followed by an asynchronous `getMarketplaceReference()`, which is
 * a WHOLE-TABLE `marketplaces` read through a different owner. Two sources, two caches, two failure modes.
 *
 * Worse, that path could not fail visibly: `getMarketplacesAsync()` swallowed a rejection and fell back to the
 * empty seed, and `fillCountries([])` then rendered `<option>Select country…</option>` and nothing else — an
 * EMPTY SELECT PRESENTED AS SUCCESS. That is exactly the live symptom (the modal's Country list is blank while
 * the main page's is populated) and exactly what §B2 forbids.
 *
 * This module is the one authority both consumers share. It owns the request, the cache, the single-flight
 * latch and the state machine; it owns NO DOM. Consequences that are contract, not implementation detail:
 *
 *   · the registry is fetched AT MOST ONCE per session unless something explicitly reloads it;
 *   · opening the modal when the registry is already READY costs ZERO requests;
 *   · two consumers asking while a request is in flight share that ONE request (single-flight);
 *   · changing Country only re-reads the already-loaded index — ZERO requests;
 *   · READY / EMPTY / ERROR are DISTINCT terminal states. An empty registry is EMPTY (a real configuration
 *     answer), a failed read is ERROR carrying its code — neither is ever rendered as the other.
 *
 * It NEVER reads the whole DB, never touches `_opDbCache`, and issues no business command.
 */
(function (root) {
  'use strict';

  var STATUS = { IDLE: 'IDLE', LOADING: 'LOADING', READY: 'READY', EMPTY: 'EMPTY', ERROR: 'ERROR' };

  function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }

  // The registry DTO, shaped exactly like the read-model slice both consumers already speak, so neither needs a
  // second adapter or a second field vocabulary.
  function adapt(data) {
    var rows = (data && data.marketplaces) || [];
    return {
      getMarketplaces: rows.map(function (m) {
        return {
          marketplaceId: str(m.marketplace_id),
          company: str(m.company),
          country: str(m.country),
          marketplace: str(m.marketplace),
          marketplaceDisplayName: str(m.marketplace_display_name),
          status: 'active'                                  // the registry emits ELIGIBLE scopes only
        };
      }),
      countries: (data && data.countries) || [],
      marketplaceIdsByCountry: (data && data.marketplace_ids_by_country) || {},
      empty: !!(data && data.empty),
      emptyReason: (data && data.empty_reason) || ''
    };
  }

  // Distinct, sorted countries — read from the ALREADY-LOADED model. Never a request.
  function countriesOf(model) {
    if (!model) return [];
    if (model.countries && model.countries.length) return model.countries.slice();
    var seen = {}, out = [];
    (model.getMarketplaces || []).forEach(function (m) { var c = str(m.country); if (c && !seen[c]) { seen[c] = 1; out.push(c); } });
    return out.sort();
  }

  // Marketplaces of one country — read from the ALREADY-LOADED model. Never a request. This is what makes
  // §B2's "changing Country costs 0 requests" true by construction rather than by discipline.
  function marketplacesForCountry(model, country) {
    var c = str(country);
    if (!model || !c) return [];
    return (model.getMarketplaces || []).filter(function (m) { return str(m.country) === c; })
      .sort(function (a, b) {
        var an = str(a.marketplaceDisplayName) || str(a.marketplace), bn = str(b.marketplaceDisplayName) || str(b.marketplace);
        return an.localeCompare(bn) || str(a.marketplaceId).localeCompare(str(b.marketplaceId));
      });
  }

  function resolveScope(model, marketplaceId) {
    var id = str(marketplaceId);
    if (!model || !id) return null;
    var rows = (model.getMarketplaces || []).filter(function (m) { return str(m.marketplaceId) === id; });
    if (rows.length !== 1) return null;                     // ambiguous or absent -> never guessed
    var r = rows[0];
    return { company: str(r.company), country: str(r.country), marketplace: str(r.marketplace), marketplaceId: id };
  }

  function create(deps) {
    deps = deps || {};
    var state = { status: STATUS.IDLE, model: null, error: null };
    var pending = null, seq = 0, requests = 0;
    var listeners = [];

    function snapshot() { return { status: state.status, model: state.model, error: state.error, requests: requests }; }
    function emit() { listeners.slice().forEach(function (fn) { try { fn(snapshot()); } catch (e) {} }); }
    function set(status, model, error) { state.status = status; state.model = model; state.error = error || null; emit(); }

    // The registry read. Injectable so the whole state machine is testable with ZERO network.
    function read() {
      if (typeof deps.read === 'function') return Promise.resolve(deps.read());
      var db = (typeof root !== 'undefined' && root.KM && root.KM.DB) ? root.KM.DB : null;
      if (!db || typeof db.getInventoryScopeRegistry !== 'function') {
        return Promise.resolve({ success: false, error: { code: 'SCOPE_REGISTRY_ACTION_UNAVAILABLE', message: 'The scope registry action is not available to this page.' } });
      }
      return Promise.resolve(db.getInventoryScopeRegistry());
    }

    // ensureLoaded — the ONLY entry point that may issue a request, and it issues at most one at a time.
    //   READY/EMPTY already resolved  -> 0 requests, resolves immediately
    //   a request already in flight   -> 0 NEW requests, shares that promise
    //   otherwise                     -> exactly 1 request
    // ERROR is NOT sticky: a previous failure may be retried, but only by an explicit call (a consumer opening
    // a modal does not silently re-drive a failed read on every open).
    function ensureLoaded(opts) {
      var force = !!(opts && opts.force);
      if (!force && (state.status === STATUS.READY || state.status === STATUS.EMPTY) && state.model) return Promise.resolve(snapshot());
      if (!force && state.status === STATUS.ERROR && !(opts && opts.retry)) return Promise.resolve(snapshot());
      if (pending) return pending;                          // single-flight across every consumer
      var mine = ++seq;
      requests++;
      set(STATUS.LOADING, state.model, null);
      pending = read().then(function (res) {
        pending = null;
        if (mine !== seq) return snapshot();                // superseded by a newer load
        if (!res || res.success === false) {
          set(STATUS.ERROR, null, (res && res.error) || { code: 'SCOPE_REGISTRY_READ_FAILED', message: 'The scope registry could not be read.' });
          return snapshot();
        }
        var model = adapt(res.data);
        // EMPTY is a real, successful configuration answer — "there are no eligible scopes" — and must never be
        // shown as an error. ERROR is "we could not find out". They are different facts and different fixes.
        set(model.empty || !model.getMarketplaces.length ? STATUS.EMPTY : STATUS.READY, model, null);
        return snapshot();
      })['catch'](function (err) {
        pending = null;
        if (mine !== seq) return snapshot();
        set(STATUS.ERROR, null, { code: (err && err.code) || 'SCOPE_REGISTRY_READ_FAILED', message: (err && err.message) || 'The scope registry could not be read.' });
        return snapshot();                                  // TERMINAL — never a hanging promise
      });
      return pending;
    }

    return {
      STATUS: STATUS,
      getState: snapshot,
      isReady: function () { return (state.status === STATUS.READY || state.status === STATUS.EMPTY) && !!state.model; },
      getModel: function () { return state.model; },
      ensureLoaded: ensureLoaded,
      reload: function () { return ensureLoaded({ force: true }); },
      retry: function () { return ensureLoaded({ retry: true }); },
      subscribe: function (fn) { if (typeof fn === 'function') listeners.push(fn); return function () { var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; },
      // Diagnostics (§H): how many registry REQUESTS this session has actually issued. The regression suite
      // asserts on this rather than on a comment claiming the cache works.
      requestCount: function () { return requests; },
      // Adopt a model another consumer already resolved, WITHOUT a request. Used so a page that loaded the
      // registry through its own historical path still ends up sharing this one cache.
      adoptModel: function (model, status) {
        if (!model) return false;
        set(status || (model.empty || !(model.getMarketplaces || []).length ? STATUS.EMPTY : STATUS.READY), model, null);
        return true;
      },
      // pure helpers (exported for direct unit testing and for consumers that hold a model already)
      adapt: adapt, countriesOf: countriesOf, marketplacesForCountry: marketplacesForCountry, resolveScope: resolveScope
    };
  }

  var API = { STATUS: STATUS, create: create, adapt: adapt, countriesOf: countriesOf, marketplacesForCountry: marketplacesForCountry, resolveScope: resolveScope };

  if (root) {
    root.KM = root.KM || {};
    // ONE instance per page — the shared authority. `create` stays exported for tests and for an injected-IO
    // instance that must not touch the network.
    root.KM.scopeRegistry = root.KM.scopeRegistry || create();
    root.KM.scopeRegistryFactory = API;
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : null);
