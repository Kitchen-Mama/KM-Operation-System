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
  // P1-B6 — the companion read. Also a module constant: a caller cannot pass an action, override
  // one, or reach the transport with a different one through this module.
  var SITE_UNIVERSE_ACTION = 'productPricing.siteUniverse.get';
  var SITE_UNIVERSE_CONTRACT_VERSION = 1;
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

  /* ================================================================================================
     WHY A FAILED READ IS FOUR DIFFERENT ANSWERS AND NOT ONE   (P1-B8B §9)

     Until P1-B8B both reads ended `.catch(e => refused('SOURCE_NOT_CONNECTED', String(e.message)))`,
     so every way a read can fail arrived at the page as one sentence: "Not connected to the Operation
     System database. No server answered."

     ON AT LEAST ONE OF THOSE PATHS THAT SENTENCE IS SIMPLY FALSE. When Apps Script answers with its
     sign-in page, A SERVER DID ANSWER — it answered "who are you" — and the reader is told to check
     a connection that is working. §9 asks that different problems not all be shown as a connection
     failure, and the reason they were is not that the information was unavailable: the shared
     transport layer HAD ALREADY CLASSIFIED IT. `km-api-foundation.js` puts a name on the error in
     `e.apiCode` from a frozen vocabulary — AUTH_OR_ACCESS_HTML, TRANSPORT_NON_JSON_RESPONSE,
     HTTP_NOT_FOUND_HTML — and this layer replaced all of it with `e.message`.

     THE FOUR ANSWERS ARE FOUR DIFFERENT NEXT ACTIONS, which is the only test worth applying to a
     distinction:

       BROWSER_OFFLINE       nothing left this machine. Retrying now fails again, for free.
       SOURCE_TIMED_OUT      the request went; the bound elapsed before an answer did. The work may
                             still be running at the far end. Retrying is reasonable; it costs another
                             wait. NOTE the read is the only kind of request this accessor makes, so
                             there is no indeterminate-write case to report here.
       NOT_AUTHORIZED        a server answered, and the answer was a sign-in page. Retrying is
                             pointless — this needs a person with access, not another attempt.
       SOURCE_NOT_CONNECTED  nothing answered, and the browser believes it has a network.

     `navigator.onLine` IS CONSULTED AS EVIDENCE, NOT AS AN ORACLE. `true` means very little — a
     machine on a café wifi with no route to the internet reports `true` — so it is only ever read to
     turn an already-failed read into the more specific answer. It can never turn a success into a
     failure, and it is never consulted when the request did not fail.

     PURE, AND EXPORTED, so the matrix is provable without a network: the classifier takes the error
     and the online flag as arguments rather than reading the browser itself.
     ================================================================================================ */

  /** The states this side can reach WITHOUT a server having answered about the data. */
  var CLIENT_TRANSPORT_STATES = ['SOURCE_NOT_CONNECTED', 'BROWSER_OFFLINE', 'SOURCE_TIMED_OUT',
    'NOT_AUTHORIZED', 'RESPONSE_NOT_READABLE'];

  function classifyTransportError(e, online) {
    var code = str(e && e.apiCode);
    var name = str(e && e.name);
    var msg = str(e && e.message);
    var status = (e && typeof e.transportStatus === 'number') ? e.transportStatus : null;

    // 1. NOT AUTHORIZED FIRST, because it is the one case where a server DID answer, and answering
    //    "who are you" while offline is not possible — so this cannot be a mislabelled offline.
    if (code === 'AUTH_OR_ACCESS_HTML' || status === 401 || status === 403) return 'NOT_AUTHORIZED';

    // 2. OFFLINE BEFORE TIMEOUT. With no network a request does not fail fast; it fails when whatever
    //    bound it has elapses, so an offline read arrives here looking exactly like a slow server.
    //    `online === false` is the only thing that tells the two apart, and it is decisive when set.
    if (online === false) return 'BROWSER_OFFLINE';

    if (code === 'REQUEST_TIMEOUT' || (e && e.kmTimeout === true)
      || name === 'TimeoutError' || msg === 'REQUEST_TIMEOUT') return 'SOURCE_TIMED_OUT';

    // 3. SOMETHING ANSWERED AND IT WAS NOT THE API. An HTML page that is not a sign-in page — a 404,
    //    an error page, a proxy notice. "Not connected" is wrong for the same reason it is wrong for
    //    a sign-in page, and the fix is a different one: this is a URL or a deployment, not a login.
    if (code === 'TRANSPORT_NON_JSON_RESPONSE' || code === 'HTTP_NOT_FOUND_HTML'
      || code === 'REDIRECT_TARGET_NOT_FOUND') return 'RESPONSE_NOT_READABLE';

    return 'SOURCE_NOT_CONNECTED';
  }

  /**
   * `navigator.onLine` when a navigator exists, and `null` when one does not.
   *
   * NULL RATHER THAN TRUE. In Node, in a test sandbox or in any host without a navigator there is no
   * evidence either way, and defaulting to "online" would let a missing API silently decide a state.
   * `null` is not `false`, so the classifier's offline branch simply does not fire.
   */
  function browserOnline() {
    try {
      var n = (typeof navigator !== 'undefined') ? navigator
        : (root && root.navigator) ? root.navigator : null;
      if (!n || typeof n.onLine !== 'boolean') return null;
      return n.onLine;
    } catch (e) { return null; }
  }

  /** The detail line for a refusal, which is what a reader is told to do next. */
  var TRANSPORT_DETAIL = {
    BROWSER_OFFLINE: 'the browser reports no network; the request was not sent to a server',
    SOURCE_TIMED_OUT: 'the request was sent and no answer arrived within the time it was given',
    NOT_AUTHORIZED: 'a server answered with a sign-in or access page rather than the API',
    RESPONSE_NOT_READABLE: 'a server answered with something that is not the API envelope',
    SOURCE_NOT_CONNECTED: 'no server answered'
  };

  /** A local refusal in the SITE UNIVERSE shape, so that caller also has one branch and not two. */
  function universeRefused(code, detail, subject) {
    return {
      success: true,
      data: { sourceState: null, sites: [], site_count: 0, hierarchy: null,
        refusals: [refusal(code, detail, subject)], findings: [],
        completeness: { rows_examined: 0, capped: false, is_whole_universe: false },
        schema: { contract_version: SITE_UNIVERSE_CONTRACT_VERSION, action: SITE_UNIVERSE_ACTION,
          build: null, read_at: null, table: null } },
      meta: { action: SITE_UNIVERSE_ACTION, build: BUILD, refused: true, refusalCode: code,
        transport: 'none', requestsMade: 0 },
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
    // R1 §6 — THE FILTER OPTIONS ARE THE SERVER'S ANSWER, AND THIS SIDE ONLY CHECKS THE SHAPE.
    //
    // The categories a site has are resolved from marketplace_skus membership on the server. This
    // file therefore knows the FIELD and not one single VALUE: no category list, no default, no
    // three-item fallback, and nothing to merge or re-sort. A page that wants the menu renders what
    // came back, in the order it came back, or renders nothing.
    //
    // `null` is a legal and MEANINGFUL value: the server withholds the options whenever the universe
    // is not provable (a capped source, or any refusal). A caller must be able to tell that apart
    // from an empty list, so null passes here and an empty list is a real measurement of a site that
    // sells nothing.
    if (d.filterOptions !== null) {
      if (!isObj(d.filterOptions)) return { ok: false, code: 'RESPONSE_BAD_FILTER_OPTIONS' };
      if (!(d.filterOptions.categories instanceof Array)
        || !(d.filterOptions.series instanceof Array)) {
        return { ok: false, code: 'RESPONSE_BAD_FILTER_OPTIONS' };
      }
      var badOption = false;
      d.filterOptions.categories.forEach(function (c) {
        if (!isObj(c) || typeof c.value !== 'string' || c.value === '') badOption = true;
      });
      if (badOption) return { ok: false, code: 'RESPONSE_BAD_FILTER_OPTIONS' };
    } else if (d.analysis_permitted === true) {
      // An analysable answer that withheld its options would leave a page unable to say why the
      // menu is empty, which is the confusion the whole withholding rule exists to prevent.
      return { ok: false, code: 'RESPONSE_OPTIONS_WITHHELD_WITHOUT_REASON' };
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
        var code = classifyTransportError(e, browserOnline());
        return refused(code, TRANSPORT_DETAIL[code], null);
      });
  }

  /**
   * The SITE UNIVERSE response shape. Thinner than the workspace one because the answer is thinner —
   * but it checks the one thing a server must never be believed about.
   */
  function validateUniverseResponse(env) {
    if (!isObj(env)) return { ok: false, code: 'RESPONSE_NOT_AN_OBJECT' };
    if (env.success !== true) return { ok: false, code: 'SERVER_REPORTED_FAILURE' };
    var d = env.data;
    if (!isObj(d)) return { ok: false, code: 'RESPONSE_MISSING_DATA' };
    if (!(d.sites instanceof Array)) return { ok: false, code: 'RESPONSE_MISSING_SITES' };
    if (!(d.refusals instanceof Array)) return { ok: false, code: 'RESPONSE_MISSING_REFUSALS' };
    // A SERVER CANNOT HONESTLY SEND THE CLIENT-ONLY STATE. A response carrying it is proof a server
    // answered, which is the one thing that state claims did not happen — so it is a contract breach
    // and is reported as one rather than passed through to a page that would render "not connected"
    // over an answer that arrived.
    if (str(d.sourceState) === 'SOURCE_NOT_CONNECTED') {
      return { ok: false, code: 'SERVER_SENT_A_CLIENT_ONLY_STATE' };
    }
    if (!isObj(env.meta) || env.meta.action !== SITE_UNIVERSE_ACTION) {
      return { ok: false, code: 'RESPONSE_ACTION_MISMATCH' };
    }
    return { ok: true };
  }

  /**
   * THE SITE UNIVERSE READ. No parameters: the universe takes no scope, which is the entire reason it
   * exists — the workspace read cannot publish the set of sites to choose from because it requires one
   * to have been chosen already.
   *
   * FAIL CLOSED ON THE CAPABILITY FIRST, so a disabled feature costs zero requests rather than one
   * round trip to be told what this side already knows.
   */
  function getSiteUniverse(opts) {
    opts = isObj(opts) ? opts : {};
    if (!isEnabled()) {
      return Promise.resolve(universeRefused('FEATURE_DISABLED',
        'the client capability mirror is false; no request was sent', null));
    }
    var api = transportOf();
    if (!api) {
      return Promise.resolve(universeRefused('SOURCE_NOT_CONNECTED',
        'the shared KM API transport is unavailable', null));
    }
    var dto = (typeof api.buildRequestEnvelope === 'function')
      ? api.buildRequestEnvelope(SITE_UNIVERSE_ACTION, {},
        { requestId: str(opts.requestId) || undefined })
      : { action: SITE_UNIVERSE_ACTION, requestId: str(opts.requestId) || null, payload: {} };

    return Promise.resolve(api.transport.post(dto, { signal: opts.signal }))
      .then(function (resp) { return api.transport.safeReadJsonResponse(resp); })
      .then(function (env) {
        var r = validateUniverseResponse(env);
        // NO FALLBACK. A failed read of the site list is a failed read, not a default set of sites.
        if (!r.ok) return universeRefused('SOURCE_NOT_CONNECTED', r.code, null);
        return env;
      })
      .catch(function (e) {
        var code = classifyTransportError(e, browserOnline());
        return universeRefused(code, TRANSPORT_DETAIL[code], null);
      });
  }

  var mod = {
    ACTION: ACTION, BUILD: BUILD, STATUSES: STATUSES.slice(), PAGE_MAX: PAGE_MAX,
    SITE_UNIVERSE_ACTION: SITE_UNIVERSE_ACTION,
    SITE_UNIVERSE_CONTRACT_VERSION: SITE_UNIVERSE_CONTRACT_VERSION,
    get: get, getSiteUniverse: getSiteUniverse,
    validateUniverseResponse: validateUniverseResponse,
    // P1-B8B §9 — exported so the state matrix is provable without a network.
    CLIENT_TRANSPORT_STATES: CLIENT_TRANSPORT_STATES.slice(),
    TRANSPORT_DETAIL: TRANSPORT_DETAIL,
    classifyTransportError: classifyTransportError,
    isEnabled: isEnabled, setCapability: setCapability,
    // exported for tests and for a caller that wants to check before it asks
    validateParams: validateParams, buildPayload: buildPayload, validateResponse: validateResponse,
    // stated as data so a test does not have to read the source to assert them
    contract: { caches: false, stores: false, previewFallback: false,
      // R1 §6 — the category universe is the server's to resolve and this file's to render.
      categoryVocabulary: null, categorySource: 'server', categoryLimit: null,
      derivesCategoriesFromMasterData: false, callerMayChooseAction: false,
      failsClosedWithoutCapability: true,
      // P1-B6 — two actions, ONE module, one capability mirror, one transport, one refusal shape.
      actions: [ACTION, SITE_UNIVERSE_ACTION],
      siteUniverseTakesNoScope: true,
      derivesSiteUniverseFromWorkspaceResponse: false }
  };

  if (root) {
    root.KM = root.KM || {};
    root.KM.productPricingWorkspace = mod;
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = mod; }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
