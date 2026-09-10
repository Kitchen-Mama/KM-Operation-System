/**
 * assets/js/api/km-product-pricing-workspace.js
 * Kitchen Mama Operation System — Product Strategy site-scoped read accessor (PRODUCT-STRATEGY-P1-B1).
 *
 * THE CLIENT HALF OF ONE ACTION: productPricing.workspace.get. It builds the request, sends it through the
 * SHARED KM API transport, and validates the answer. It is deliberately small, because everything that
 * decides anything lives on the server.
 *
 * NOT LOADED BY ANY PAGE. This file is not referenced from index.html and no page imports it. P1-B1 ships the
 * seam and nothing a user can reach; production visibility for this feature is zero, by construction rather
 * than by a hidden button. P1-B2 is the round that wires it to a page, and only after P1-B3's readback does
 * turning the flag on become a question at all.
 *
 * WHAT IT REFUSES TO DO, and each of these is a way the site scope could have leaked:
 *   · the action is a module constant — a caller cannot pass one, override one, or reach the transport with
 *     a different one through this module;
 *   · the scope is required here as well as on the server, so an unscoped call fails locally with the SAME
 *     code the server would return instead of costing a round trip to be told;
 *   · nothing is stored — no localStorage, no sessionStorage, no IndexedDB, no cookie, no module-level cache.
 *     A cached response is a response for the scope it was fetched under, and the one bug this whole feature
 *     is built to prevent is one site's rows appearing under another site's heading;
 *   · google.script.run is never called; the shared transport owns the wire;
 *   · there is NO preview fallback. When the read fails the caller gets SOURCE_NOT_CONNECTED. A fixture
 *     reached by a failure path is a lie told at the worst possible moment, and a page that quietly swapped
 *     in demonstration prices would be indistinguishable from one that worked.
 *
 * FAIL CLOSED ON THE CAPABILITY. The mirror defaults FALSE and can only be set from a server capability
 * payload. It is a mirror, never a second authority: the server refuses on its own flag regardless, and this
 * only avoids sending a request that is going to be refused.
 */
(function (root) {
  'use strict';

  var ACTION = 'productPricing.workspace.get';
  var BUILD = 'PRODUCT-STRATEGY-P1-B1';
  var STATUSES = ['active', 'phasing_out', 'inactive', 'discontinued'];
  var PAGE_MAX = 1000;

  // The capability mirror. FALSE until a server capability payload says otherwise — the deliberate asymmetry
  // 00_config.gs names: if the capability transport cannot be read, the page must not offer what it cannot
  // confirm the server accepts.
  var _enabled = false;

  function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
  function isObj(v) { return !!v && typeof v === 'object' && !(v instanceof Array); }

  function refusal(code, detail, subject) {
    return { code: code, detail: detail === undefined ? null : detail,
      subject: subject === undefined ? null : subject };
  }

  /** A local refusal, shaped exactly like a server one so a caller has one branch, not two. */
  function refused(code, detail, subject) {
    return {
      success: true,
      data: { normalizedRows: [], counts: null, refusals: [refusal(code, detail, subject)],
        analysis_permitted: false, provenance: { action: ACTION, build: BUILD, connected: false,
          read_only: true, preview_fallback: false } },
      meta: { action: ACTION, build: BUILD, refused: true, refusalCode: code, transport: 'none' },
      errors: []
    };
  }

  // ---- REQUEST ---------------------------------------------------------------------------------
  function validateParams(params) {
    params = isObj(params) ? params : {};
    var scope = isObj(params.scope) ? params.scope : {};
    var missing = [];
    ['company', 'country', 'marketplace'].forEach(function (k) {
      if (str(scope[k]) === '') missing.push(k);
    });
    if (missing.length) return { ok: false, code: 'SCOPE_INCOMPLETE', subject: missing };

    var filters = isObj(params.filters) ? params.filters : {};
    if (filters.statuses !== undefined && filters.statuses !== null) {
      if (!(filters.statuses instanceof Array)) {
        return { ok: false, code: 'INVALID_STATUS_FILTER', subject: 'statuses must be an array' };
      }
      var unknown = filters.statuses.filter(function (s) {
        return STATUSES.indexOf(String(s).trim().toLowerCase()) === -1;
      });
      // FAIL CLOSED, exactly as the server does. Dropping an unknown value would answer a narrower question
      // than the one asked, and the caller would have no way to notice.
      if (unknown.length) return { ok: false, code: 'UNKNOWN_STATUS_VALUE', subject: unknown };
    }
    var page = isObj(params.page) ? params.page : {};
    if (page.limit !== undefined && page.limit !== null && page.limit !== '') {
      var n = Number(page.limit);
      if (!isFinite(n) || n <= 0 || Math.floor(n) !== n) {
        return { ok: false, code: 'INVALID_PAGE_LIMIT', subject: page.limit };
      }
      if (n > PAGE_MAX) return { ok: false, code: 'PAGE_LIMIT_EXCEEDS_MAXIMUM', subject: n };
    }
    return { ok: true };
  }

  /** The payload, built from the named fields only. A caller's extra keys are not forwarded — this module
   *  cannot be used to smuggle a spreadsheet id, a sheet name or an action past the server's refusal list. */
  function buildPayload(params) {
    params = isObj(params) ? params : {};
    var scope = isObj(params.scope) ? params.scope : {};
    var filters = isObj(params.filters) ? params.filters : {};
    var include = isObj(params.include) ? params.include : {};
    var page = isObj(params.page) ? params.page : {};
    var out = {
      scope: { company: str(scope.company), country: str(scope.country),
        marketplace: str(scope.marketplace) },
      filters: {},
      include: {},
      page: {}
    };
    if (str(filters.category) !== '') out.filters.category = str(filters.category);
    if (str(filters.series) !== '') out.filters.series = str(filters.series);
    if (filters.statuses instanceof Array) {
      out.filters.statuses = filters.statuses.map(function (s) { return String(s).trim().toLowerCase(); });
    }
    if (filters.include_inactive !== undefined) {
      out.filters.include_inactive = filters.include_inactive === true;
    }
    ['regional', 'pricing', 'campaigns'].forEach(function (k) {
      if (include[k] !== undefined) out.include[k] = include[k] === true;
    });
    if (str(page.cursor) !== '') out.page.cursor = str(page.cursor);
    if (page.limit !== undefined && page.limit !== null && page.limit !== '') {
      out.page.limit = Number(page.limit);
    }
    return out;
  }

  // ---- RESPONSE --------------------------------------------------------------------------------
  /** The shape the server promises. A response that does not carry it is a TRANSPORT/CONTRACT fault and is
   *  named as one — never coerced into an empty but successful-looking read. */
  function validateResponse(env) {
    if (!isObj(env)) return { ok: false, code: 'RESPONSE_NOT_AN_OBJECT' };
    if (env.success !== true) return { ok: false, code: 'SERVER_REPORTED_FAILURE' };
    var d = env.data;
    if (!isObj(d)) return { ok: false, code: 'RESPONSE_MISSING_DATA' };
    if (!(d.normalizedRows instanceof Array)) return { ok: false, code: 'RESPONSE_MISSING_ROWS' };
    if (!(d.refusals instanceof Array)) return { ok: false, code: 'RESPONSE_MISSING_REFUSALS' };
    if (typeof d.analysis_permitted !== 'boolean') {
      return { ok: false, code: 'RESPONSE_MISSING_ANALYSIS_FLAG' };
    }
    if (!isObj(env.meta) || env.meta.action !== ACTION) {
      return { ok: false, code: 'RESPONSE_ACTION_MISMATCH' };
    }
    return { ok: true };
  }

  function transportOf() {
    var api = root && root.KM && root.KM.api;
    return (api && api.transport && typeof api.transport.post === 'function') ? api : null;
  }

  // ---- PUBLIC ----------------------------------------------------------------------------------
  function setCapability(caps) {
    // Only a server capability payload may raise it, and anything unreadable leaves it false.
    _enabled = !!(isObj(caps) && caps.product_strategy_enabled === true);
    return _enabled;
  }
  function isEnabled() { return _enabled === true; }

  function get(params, opts) {
    opts = isObj(opts) ? opts : {};
    if (!isEnabled()) {
      return Promise.resolve(refused('FEATURE_DISABLED',
        'the client capability mirror is false; no request was sent', null));
    }
    var v = validateParams(params);
    if (!v.ok) return Promise.resolve(refused(v.code, 'refused before the request was sent', v.subject));

    var api = transportOf();
    if (!api) {
      return Promise.resolve(refused('SOURCE_NOT_CONNECTED', 'the shared KM API transport is unavailable',
        null));
    }
    var dto = (typeof api.buildRequestEnvelope === 'function')
      ? api.buildRequestEnvelope(ACTION, buildPayload(params),
        { requestId: str(params && params.requestId) || undefined })
      : { action: ACTION, requestId: str(params && params.requestId) || null,
          payload: buildPayload(params) };

    return Promise.resolve(api.transport.post(dto, { signal: opts.signal }))
      .then(function (resp) { return api.transport.safeReadJsonResponse(resp); })
      .then(function (env) {
        var r = validateResponse(env);
        // NO FALLBACK, AND NO SUBSTITUTE. A failed read is reported as a failed read.
        if (!r.ok) return refused('SOURCE_NOT_CONNECTED', r.code, null);
        return env;
      })
      .catch(function (e) {
        return refused('SOURCE_NOT_CONNECTED', String((e && e.message) || e), null);
      });
  }

  var mod = {
    ACTION: ACTION, BUILD: BUILD, STATUSES: STATUSES.slice(), PAGE_MAX: PAGE_MAX,
    get: get, isEnabled: isEnabled, setCapability: setCapability,
    // exported for tests and for a caller that wants to check before it asks
    validateParams: validateParams, buildPayload: buildPayload, validateResponse: validateResponse,
    // stated as data so a test does not have to read the source to assert them
    contract: { caches: false, stores: false, previewFallback: false, callerMayChooseAction: false,
      failsClosedWithoutCapability: true }
  };

  if (root) {
    root.KM = root.KM || {};
    root.KM.productPricingWorkspace = mod;
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = mod; }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
