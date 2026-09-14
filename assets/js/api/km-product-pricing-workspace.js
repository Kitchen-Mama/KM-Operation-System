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
  /* P1-B8D-R4 - WHERE THE CAPABILITY COMES FROM, now that it comes from somewhere.
     `system.health` is already deployed, already read-only, already on the transport's
     session-stable metadata allowlist (so concurrent asks coalesce into one), and 63_ already
     publishes `product_strategy_enabled` on it. Deriving from it adds no server field, no action
     and no fourth flag - it reads the server's own answer about its own flag. */
  var CAPABILITY_ACTION = 'system.health';
  var SITE_UNIVERSE_CONTRACT_VERSION = 1;
  var BUILD = 'PRODUCT-STRATEGY-P1-B1';
  var STATUSES = ['active', 'phasing_out', 'inactive', 'discontinued'];
  var PAGE_MAX = 1000;

  // The capability mirror. FALSE until a server capability payload says otherwise — the deliberate asymmetry
  // 00_config.gs names: if the capability transport cannot be read, the page must not offer what it cannot
  // confirm the server accepts.
  var _enabled = false;
  /* Whether a server answer has been HEARD - not whether it said yes. A false mirror that has never
     asked and a false mirror the server lowered are different situations, and only the first one is
     worth another round trip. */
  var _capabilityHeard = false;
  /* P1-B8D-R10A §2 — WHICH CAPABILITY READ IS THE CURRENT ONE.

     The capability read is now a REAL network read with a bounded recovery underneath it, so it can
     be outstanding across a site change or a teardown — and two of them can be in flight at once if
     something calls `force`. An answer that arrives after a newer read has started must not write
     `_enabled` or `_capabilityHeard`: it would be deciding the page's capability from a question
     nobody is waiting for. Under the old POST shim this could not happen, because the shim was
     never retried and the mirror was read once at boot. */
  var _capabilityGen = 0;
  /* P1-B8D-R10A §6 — WHY THE MIRROR IS FALSE, WHEN THE REASON WAS NOT AN ANSWER.

     `_enabled === false` has always had two completely different causes that the page could not
     tell apart: a server that SAID the feature is off, and a read that could not be completed. Both
     rendered as "Product Strategy is not enabled yet" — a definite statement about a product
     decision, made on the strength of a request that never got an answer.

     That was survivable while the capability read was a single un-retried POST at boot, because the
     page was equally broken in every other way at that point. It is not survivable now: R10A gives
     this read a bounded recovery and real classification, so the transport KNOWS whether it saw a
     sign-in page, a 404, an unreadable body or nothing at all — and throwing that away to say
     "not enabled yet" would be the same class of lie R10 §5 removed from the other two reads.

     null means the last capability read was ANSWERED. A state name means it was not, and that name
     is what the operator is shown instead of FEATURE_DISABLED. */
  var _capabilityFailure = null;

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
  /* P1-B8D-R10 §5 — TWO CLASSES THIS FILE COULD NOT EXPRESS, AND ONE THAT WAS DOING TWO JOBS.

     HTTP_NOT_FOUND. A 404 was reaching the operator as "the address answered, but not with a site
     list" at best and as "no server answered" at worst. Neither is what happened: something
     answered, it answered 404, and the fix is an address or a deployment rather than a network or
     a login. §5 names it as its own class and forbids describing it as a disconnected database.

     ACTION_MISMATCH. The transport already refuses an envelope that answers a different action or
     carries a different request id — the correlation checks that stop one read's answer being drawn
     over another's. Collapsing that into "not connected" would send an operator to look at their
     network for a defect in the deployment's routing.

     SOURCE_NOT_CONNECTED goes back to meaning ONE thing: nothing answered. */
  var CLIENT_TRANSPORT_STATES = ['SOURCE_NOT_CONNECTED', 'BROWSER_OFFLINE', 'SOURCE_TIMED_OUT',
    'NOT_AUTHORIZED', 'RESPONSE_NOT_READABLE', 'HTTP_NOT_FOUND', 'ACTION_MISMATCH'];

  /* P1-B8D-R10 §5 — ONE CLASSIFIER, TWO SHAPES OF FAILURE.

     A failure reaches this file two ways and they used to be classified by two different amounts of
     care. A THROWN error (the old private POST shim) went through the matrix below. A TYPED result
     from the shared transport resolves rather than throws, and the branch that received it did not
     classify at all — it wrote SOURCE_NOT_CONNECTED and put the real code in the DETAIL line, so a
     404 and a login page and a malformed envelope all reached the operator as "no server answered".

     So the matrix is keyed on the CODE, and both shapes are reduced to a code before they get here.
     `status` is kept because 401/403 are decidable from the status alone. */
  function classifyTransportCode(code, status, online) {
    code = str(code);
    status = (typeof status === 'number') ? status : null;

    // 1. NOT AUTHORIZED FIRST, because it is the one case where a server DID answer, and answering
    //    "who are you" while offline is not possible — so this cannot be a mislabelled offline.
    if (code === 'AUTH_OR_ACCESS_HTML' || status === 401 || status === 403) return 'NOT_AUTHORIZED';

    // 2. OFFLINE BEFORE TIMEOUT. With no network a request does not fail fast; it fails when whatever
    //    bound it has elapses, so an offline read arrives here looking exactly like a slow server.
    //    `online === false` is the only thing that tells the two apart, and it is decisive when set.
    if (online === false) return 'BROWSER_OFFLINE';

    if (code === 'REQUEST_TIMEOUT' || code === 'REQUEST_TIMEOUT_WRITE_INDETERMINATE') return 'SOURCE_TIMED_OUT';

    // 3. A 404 IS ITS OWN ANSWER. Something answered; it said the address is not there. That is a
    //    deployment or a URL, and §5 forbids reporting it as a database that is not connected.
    if (code === 'HTTP_NOT_FOUND_HTML' || code === 'REDIRECT_TARGET_NOT_FOUND'
      || status === 404) return 'HTTP_NOT_FOUND';

    // 4. THE ANSWER BELONGED TO A DIFFERENT QUESTION. Routing or correlation, never the network.
    if (code === 'RESPONSE_ACTION_MISMATCH' || code === 'RESPONSE_REQUEST_ID_MISMATCH'
      || code === 'RESPONSE_CORRELATION_UNPROVEN' || code === 'DEPLOYMENT_CONTRACT_MISMATCH') {
      return 'ACTION_MISMATCH';
    }

    // 5. SOMETHING ANSWERED AND IT WAS NOT THE API — an error page, a proxy notice, a body that is
    //    not the envelope. A URL or a deployment, not a login and not a missing network.
    if (code === 'TRANSPORT_NON_JSON_RESPONSE' || code === 'API_ENDPOINT_CONFIGURATION_INVALID'
      || code === 'REQUEST_METHOD_DOWNGRADED') return 'RESPONSE_NOT_READABLE';

    // 6. NOTHING ANSWERED. The only meaning this state has left.
    return 'SOURCE_NOT_CONNECTED';
  }

  /* P1-B8D-R10 §5 — A VALIDATION FAILURE IS NOT ONE THING EITHER.

     An envelope that ARRIVED and failed validation used to be reported as SOURCE_NOT_CONNECTED with
     the real code demoted to the detail line. Replacing that with a blanket RESPONSE_NOT_READABLE
     would be more honest and still too coarse: an envelope that answered a DIFFERENT ACTION is a
     routing or correlation fault, and it is the only failure here that could otherwise have been
     drawn on a chart as data. §5 names it separately, so it is separated. */
  function stateForValidationCode(code) {
    code = str(code);
    if (code === 'RESPONSE_ACTION_MISMATCH' || code === 'RESPONSE_REQUEST_ID_MISMATCH') {
      return 'ACTION_MISMATCH';
    }
    if (code === 'SERVER_SENT_A_CLIENT_ONLY_STATE') return 'ACTION_MISMATCH';
    return 'RESPONSE_NOT_READABLE';
  }

  function classifyTransportError(e, online) {
    var name = str(e && e.name);
    var msg = str(e && e.message);
    var code = str(e && e.apiCode);
    var status = (e && typeof e.transportStatus === 'number') ? e.transportStatus : null;
    if (code === '' && (e && e.kmTimeout === true || name === 'TimeoutError'
      || msg === 'REQUEST_TIMEOUT')) code = 'REQUEST_TIMEOUT';
    return classifyTransportCode(code, status, online);
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
    HTTP_NOT_FOUND: 'a server answered 404 — the address was reached and holds nothing to read',
    ACTION_MISMATCH: 'a server answered a different request than the one that was sent',
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

  /**
   * The FOUNDATION, which this file needs for ONE thing: `buildRequestEnvelope`. Every read is
   * dispatched by `KM.transport`, not by the foundation.
   *
   * P1-B8D-R10A §3 — IT USED TO GATE ON `api.transport.post`, which is a function this file no
   * longer calls. A readiness check for a capability nobody uses is worse than none: it would have
   * refused a perfectly usable foundation if that private shim were ever removed, and it kept the
   * shim's name alive in a caller census that is supposed to be able to reach zero.
   *
   * IT DOES NOT GATE ON `buildRequestEnvelope` EITHER, and the first attempt at this round did —
   * which turned every acceptance run into FEATURE_DISABLED at zero requests, because the replay
   * harness's foundation stub does not carry that member. The harness was not wrong to omit it:
   * `readOnce` treats the builder as OPTIONAL and constructs an equivalent envelope when it is
   * absent, so gating on it would refuse a foundation this file can demonstrably use. The honest
   * precondition is the one the refusal actually names — is the shared KM API there at all.
   */
  function transportOf() {
    var api = root && root.KM && root.KM.api;
    return isObj(api) ? api : null;
  }

  /* ================================================================================================
     P1-B8D-R10 §4/§6 — THE READ BOUNDARY, AND WHY THIS PAGE WAS THE ONLY ONE WITHOUT IT.

     MEASURED IN A REAL BROWSER, WITH `window.fetch` WRAPPED BEFORE ANY APPLICATION FILE LOADED:

       accessor getSiteUniverse   ->  POST  km_via=post   ... 404, redirected
       accessor workspace.get     ->  POST  km_via=post
       KM.transport.request       ->  GET   km_via=get

     Every other workspace read in the application goes through `KM.transport.request({kind:'read'})`
     — the foundation routes them there and calls its own POST path "a fallback and not the path".
     This accessor called `api.transport.post()` DIRECTLY, so it was the one read still on the old
     private shim, and it therefore had none of what that boundary owns:

       · a GET from the stable /exec. An Apps Script /exec POST is answered with a 302, and per the
         Fetch spec a 302 after a POST is re-issued as a GET WITH THE BODY DROPPED.
       · the endpoint classifier, so a /dev URL or a consumed echo target is refused before dispatch.
       · the HTML fingerprint, which is what tells a 404 page from a Google sign-in page from an
         Apps Script error page. Without it all three arrive as one anonymous code.
       · the bounded recovery: ONE fresh attempt, rebuilt from the stable /exec, with a NEW request
         id — which is exactly the retry §6 asks for, already written and already tested.

     SO NO SECOND RETRY WAS BUILT. §6 is satisfied by joining the boundary that owns the first one.
     A second mechanism here would be a second policy to keep in step with the first, and the two
     would disagree the first time either changed.

     R10A — AND THE FALLBACK IS GONE, BECAUSE "ITS OLD FAILURE MODES" IS NOT A FEATURE.

     R10 kept a POST fallback for a page that somehow loaded without `km-transport.js`, on the
     reasoning that a degraded read beats no read. That reasoning does not survive knowing what the
     degraded path DOES: it is the exact path whose 302-dropped body produced the live failure this
     work exists to fix. A silent fall back to it would reintroduce the defect precisely when
     something is already wrong, and would do it invisibly — the operator would see the old
     unclassified errors again with no indication that a different code path had been taken.

     There is also no real scenario behind it. `index.html` loads `km-transport.js` before this file
     and both move on one cache token, so "this file without that one" is not a state a browser can
     reach; it is a state a REFACTOR could reach, and a refactor should fail loudly.

     So the missing transport is now a NAMED refusal instead of a quiet downgrade, and the private
     POST shim has zero Product Strategy production callers. The shim itself is untouched — other
     legacy consumers still use `km-api-foundation`, and this round removes callers, not APIs.
     ================================================================================================ */
  function sharedTransport() {
    try {
      var t = root && root.KM && root.KM.transport;
      return (t && typeof t.request === 'function') ? t : null;
    } catch (e) { return null; }
  }

  /**
   * One read. Resolves { env } when an envelope arrived, or { code, status } when none did.
   * It never throws for a transport failure — the shared transport resolves with a typed code, and
   * the fallback's throw is converted here so both callers have ONE shape to handle.
   */
  function readOnce(api, action, payload, requestId, signal) {
    /* THE WHOLE ENVELOPE IS THE BODY, NOT THE PAYLOAD, and that distinction cost a measured
       regression in this round. `km_body` is serialised verbatim into the read query and the router
       reads `body.payload.scope` out of it, so handing it the inner payload produces a request that
       reaches the server, returns 200, and is refused SCOPE_INCOMPLETE — a scope that WAS supplied,
       reported as missing. The foundation passes its `dto` here for exactly this reason. */
    var dto = (typeof api.buildRequestEnvelope === 'function')
      ? api.buildRequestEnvelope(action, payload || {}, { requestId: requestId || undefined })
      : { apiVersion: '1.0', action: action, requestId: requestId || null, payload: payload || {},
          context: { actor: null, clientVersion: null } };
    var tp = sharedTransport();
    if (tp) {
      return Promise.resolve(tp.request({ action: action, kind: 'read', payload: dto,
        requestId: dto.requestId || requestId || undefined, signal: signal, owner: 'productStrategy' }))
        .then(function (res) {
          if (res && res.success === true && isObj(res.envelope)) return { env: res.envelope };
          var d = (res && isObj(res.details)) ? res.details : {};
          var st = (typeof d.http_status === 'number') ? d.http_status
            : ((typeof d.status === 'number') ? d.status : null);
          return { code: (res && res.code) || 'TRANSPORT_FAILED', status: st,
            attempts: (typeof d.attempts === 'number') ? d.attempts : null };
        });
    }
    /* NO SHARED TRANSPORT, NO READ. Named, not downgraded — see the header. This resolves with the
       same { code } shape every other failure uses, so no caller needs a second branch for it. */
    return Promise.resolve({ code: 'API_ENDPOINT_CONFIGURATION_INVALID', status: null });
  }

  // ---- PUBLIC ----------------------------------------------------------------------------------
  /* P1-B8D-R5 - A HALF RESET IS NOT A RESET. `setCapability({})` is how a caller puts the mirror
     back to the production default, and it used to lower `_enabled` while leaving `_capabilityHeard`
     true - so the next `refreshCapability()` answered from a cache that had been explicitly
     discarded and never asked again. In a browser one page life asks once and this never showed; in
     a process that lives through several scenarios it means the second one is answered by the
     first one's server. What was heard is now part of what is set. */
  function setCapability(caps) {
    // Only a server capability payload may raise it, and anything unreadable leaves it false.
    _enabled = !!(isObj(caps) && caps.product_strategy_enabled === true);
    _capabilityHeard = isObj(caps) && caps.product_strategy_enabled !== undefined;
    /* P1-B8D-R10A §6 — AND THE REASON GOES WITH IT. A capability set from the boot bootstrap is a
       fresh statement about the flag, so any transport failure remembered from an earlier read is
       now answering a question nobody asked. Leaving it would let a long-gone 404 keep speaking for
       a capability that has since been set directly. */
    _capabilityFailure = null;
    return _enabled;
  }
  function isEnabled() { return _enabled === true; }

  /**
   * P1-B8D-R4 - THE MIRROR HAD NO PRODUCER, WHICH IS WHY THE LIVE PAGE REFUSED ITSELF.
   *
   * `setCapability` existed, was exported, and was documented as the only way to raise the mirror -
   * and nothing in `assets/js` or `index.html` ever called it. The boot bootstrap
   * (app.js -> KM.DB.applyClientCapabilities -> getClientCapabilities -> KM.api) carries three
   * backend-owned flags and has never heard of this module. So in a browser `_enabled` was false
   * from load to unload, the controller answered FEATURE_DISABLED at zero requests, and the two
   * authorities P1-B8D flipped could not be reached from the page they were flipped for.
   *
   * THIS IS A MIRROR AND NOT AN AUTHORITY. It does not decide anything: it repeats what the server
   * says about its own flag, so that a disabled feature costs zero requests instead of one round
   * trip to be told what could have been asked once. The server refuses on `PRODUCT_STRATEGY_ENABLED_`
   * before it opens a database no matter what any client believes, which is why lowering this
   * mirror is a saving and raising it is not a permission.
   *
   * FAIL CLOSED ON EVERY UNKNOWN. No transport, a refused read, a non-JSON answer, a missing field,
   * a field that is not exactly `true` - all of them leave the mirror false. The asymmetry is the
   * point: a page that cannot confirm the server accepts a read must not offer it.
   */
  function refreshCapability(opts) {
    opts = isObj(opts) ? opts : {};
    if (_capabilityHeard && opts.force !== true) return Promise.resolve(_enabled === true);
    var api = transportOf();
    if (!api) { _enabled = false; return Promise.resolve(false); }

    /* ============================================================================================
       P1-B8D-R10A §2 — THE THIRD READ JOINS THE OTHER TWO.

       R10 moved `productPricing.siteUniverse.get` and `productPricing.workspace.get` onto
       `KM.transport.request` and left this one behind, so the round that existed to unify the page's
       reads finished with TWO of THREE unified. This is the third.

       IT IS THE WORST ONE TO HAVE LEFT, which is why it is worth saying plainly. This read decides
       whether the page offers itself at all, and it FAILS CLOSED. On the private POST shim a single
       transient echo 404 — the same fault R10 measured at 4 in 40 reads in one live window — made the
       whole page answer FEATURE_DISABLED, with no classification, no recovery and nothing in the UI
       to distinguish "the feature is off" from "one hop could not be read".

       It uses `readOnce`, the SAME helper the other two use, so the envelope, the GET semantics, the
       classification and the single bounded recovery are identical by construction rather than by
       resemblance. No transport is added, no retry is written, no ceiling is raised.
       ============================================================================================ */
    var myGen = ++_capabilityGen;

    return readOnce(api, CAPABILITY_ACTION, {}, str(opts.requestId) || undefined, opts.signal)
      .then(function (r0) {
        /* SUPERSEDED: a newer capability read has started. Answer with what is currently believed
           and write nothing — see `_capabilityGen`. */
        if (myGen !== _capabilityGen) return _enabled === true;

        /* ------------------------------------------------------------------------------------
           A TRANSPORT FAILURE IS NOT AN ANSWER, AND MUST NOT BE REMEMBERED AS ONE.

           `_capabilityHeard` means "a server told us". Setting it here would turn one unreadable
           hop into a permanent FEATURE_DISABLED for the life of the page, because the guard at the
           top of this function would never let another read happen. The page would then be disabled
           by a fault that has already gone away, and no amount of waiting would fix it.

           So: fail CLOSED for this call — `_enabled` is false, exactly as §2 requires for a timeout,
           a refusal, HTML, a schema mismatch or anything unknown — and leave `_capabilityHeard`
           alone, so the next caller asks again. Closed, but not latched.
           ------------------------------------------------------------------------------------ */
        if (r0.code) {
          _enabled = false;
          _capabilityFailure = classifyTransportCode(r0.code, r0.status, browserOnline());
          return false;
        }

        var env = r0.env;
        return (function () {
        /* THE HEALTH ENVELOPE IS FLAT. 63_ puts its identity block at the top level and nothing
           under `data` - a fact this repository has already been bitten by once, where a reader
           that assumed `data` read every identity field as undefined and called a correct
           deployment stale. Top level is read first; `data` is accepted only as a defensive
           second look, and both require the literal `true`. */
        var top = isObj(env) ? env : null;
        var nested = (top && isObj(top.data)) ? top.data : null;
        var v = (top && top.product_strategy_enabled !== undefined)
          ? top.product_strategy_enabled
          : (nested ? nested.product_strategy_enabled : undefined);
        /* A SERVER ANSWERED AND THIS BUILD COULD READ IT. That is what `_capabilityHeard` records,
           and it is the only branch entitled to record it. The VALUE still has to be the literal
           `true`: a missing field, a string, a 1, or anything else leaves the mirror false. */
        _enabled = v === true;
        _capabilityHeard = true;
        /* A SERVER ANSWERED, so whatever it says is a product fact and not a transport one. */
        _capabilityFailure = null;
        return _enabled;
        }());
      })
      .catch(function (e) {
        if (myGen !== _capabilityGen) return _enabled === true;
        /* Same rule as above: closed, but not latched. */
        _enabled = false;
        _capabilityFailure = classifyTransportError(e, browserOnline());
        return false;
      });
  }
  /** For a caller that wants to know whether the answer is a server's or just the default. */
  function capabilityHeard() { return _capabilityHeard === true; }

  function get(params, opts) {
    opts = isObj(opts) ? opts : {};
    if (!isEnabled()) {
      /* P1-B8D-R10A §6 — OFF, OR UNREADABLE? They are different sentences and only one of them is
         ever true. Either way NO REQUEST IS SENT, which is the saving this mirror exists for. */
      if (_capabilityFailure) {
        return Promise.resolve(refused(_capabilityFailure, TRANSPORT_DETAIL[_capabilityFailure], null));
      }
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
    return readOnce(api, ACTION, buildPayload(params),
      str(params && params.requestId) || undefined, opts.signal)
      .then(function (r0) {
        if (r0.code) {
          var tc = classifyTransportCode(r0.code, r0.status, browserOnline());
          return refused(tc, TRANSPORT_DETAIL[tc], null);
        }
        var r = validateResponse(r0.env);
        // NO FALLBACK, AND NO SUBSTITUTE. A failed read is reported as a failed read.
        /* P1-B8D-R10 §5 — AND IT IS REPORTED AS THE FAILURE IT WAS. This branch used to answer
           SOURCE_NOT_CONNECTED — "no server answered" — for an envelope that HAD arrived and then
           failed validation, with the real code demoted to the detail line. A response whose status
           and content-type are known must not lose them (§5), so the state now says what is true:
           something answered, and it was not the envelope this build reads. */
        if (!r.ok) return refused(stateForValidationCode(r.code), r.code, null);
        return r0.env;
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
      if (_capabilityFailure) {
        return Promise.resolve(universeRefused(_capabilityFailure,
          TRANSPORT_DETAIL[_capabilityFailure], null));
      }
      return Promise.resolve(universeRefused('FEATURE_DISABLED',
        'the client capability mirror is false; no request was sent', null));
    }
    var api = transportOf();
    if (!api) {
      return Promise.resolve(universeRefused('SOURCE_NOT_CONNECTED',
        'the shared KM API transport is unavailable', null));
    }
    return readOnce(api, SITE_UNIVERSE_ACTION, {}, str(opts.requestId) || undefined, opts.signal)
      .then(function (r0) {
        if (r0.code) {
          var tc = classifyTransportCode(r0.code, r0.status, browserOnline());
          return universeRefused(tc, TRANSPORT_DETAIL[tc], null);
        }
        var r = validateUniverseResponse(r0.env);
        // NO FALLBACK. A failed read of the site list is a failed read, not a default set of sites.
        // §5: an envelope that arrived and failed validation is not "no server answered".
        if (!r.ok) return universeRefused(stateForValidationCode(r.code), r.code, null);
        return r0.env;
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
    classifyTransportCode: classifyTransportCode,
    stateForValidationCode: stateForValidationCode,
    readsThroughSharedTransport: function () { return sharedTransport() !== null; },
    isEnabled: isEnabled, setCapability: setCapability,
    refreshCapability: refreshCapability, capabilityHeard: capabilityHeard,
    /* P1-B8D-R10A §6 — WHY the mirror is false, when the reason was not an answer. `null` means a
       server answered (so `false` is a product fact); a state name means the read could not be
       completed, and that name is what the operator must be shown instead of FEATURE_DISABLED. */
    capabilityFailure: function () { return _capabilityFailure; },
    CAPABILITY_ACTION: CAPABILITY_ACTION,
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
