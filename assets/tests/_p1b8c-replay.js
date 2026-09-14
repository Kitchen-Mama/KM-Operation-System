/**
 * ==================================================================================================
 * THE P1-B8C REPLAY HARNESS — A CAPTURE GOES IN AT THE SOCKET, A RENDERED PAGE COMES OUT
 * ==================================================================================================
 *
 * §5 asks that a capture be driven through the PRODUCTION render chain and names what may not be
 * substituted: no prototype shell, no preview adapter, no preview fixture, no simplified renderer, no
 * direct injection that skips the accessor. It also names the one substitution that IS allowed —
 * "a test harness may replace the network response, but the response must pass through the formal
 * accessor and controller entry point."
 *
 * SO THE SUBSTITUTION IS EXACTLY ONE FUNCTION, AND IT IS THE LOWEST ONE THERE IS:
 * `KM.api.transport.post`. Everything above it is the shipped code, unmodified and unaware:
 *
 *     capture envelope
 *       -> KM.api.transport.post            <- THE ONLY THING REPLACED
 *       -> km-product-pricing-workspace.js  the formal accessor + its response validator
 *       -> km-product-pricing-adapter.js    the canonical row builder
 *       -> km-product-strategy-live-adapter the state machine and the UI matrix
 *       -> psb-selectors.js                 the analysis engine
 *       -> psb-board-ui.js                  the renderer
 *       -> assets/html/pages/...html        the production partial
 *       -> assets/css/product-strategy-board.css
 *
 * WHY THE SOCKET AND NOT THE ADAPTER. Injecting a canonical row set would skip the accessor's
 * validator and the pricing adapter — the two layers where P1-B7E's live defect actually lived. The
 * envelope said `productPricing.workspace.get` for a siteUniverse response, the accessor refused it as
 * RESPONSE_ACTION_MISMATCH, and every suite stayed green because every suite handed the adapter rows
 * it had built itself. A harness that starts below the validator cannot find that class of defect,
 * which is the only class a replay round exists to find.
 *
 * THE CAPABILITY IS ANSWERED, NOT ASSIGNED  (P1-B8D-R4).
 *
 * This paragraph used to say that the harness raised the mirror "the way a server raises it", by
 * calling `setCapability({product_strategy_enabled:true})` — and it ended with the sentence
 * "production default is false and no file in this repository changes that", offered as a safety
 * property. That sentence was true, and it was the defect: NOTHING in production raised the mirror
 * either, so the deployed page answered FEATURE_DISABLED at zero requests on all six sub-tabs while
 * every suite driven through this file rendered a complete board. The harness was supplying the one
 * input production never gets, which is the one thing a harness must never do.
 *
 * So the capability is now ANSWERED on the wire: the fake transport serves `system.health` with the
 * flat `product_strategy_enabled` 63_ publishes, and the shipped accessor derives the mirror from it
 * through exactly the call a browser makes. `opts.capability === false` models a server that says no.
 * The harness sets the mirror only to RESET it between scenarios, because a module singleton must not
 * carry one scenario's server answer into the next.
 *
 * EVERY REQUEST IS COUNTED AND EVERY WRITE-SHAPED CALL IS A THROW. The fake transport records the
 * action, the payload and the order; a POST for anything but the two read actions raises rather than
 * returning, so "zero writes" is enforced by the harness rather than asserted after the fact.
 * ==================================================================================================
 */
'use strict';

(function (root) {

  var R = {};

  R.READ_ACTIONS = ['productPricing.workspace.get', 'productPricing.siteUniverse.get'];
  /* P1-B8D-R4 — THE CAPABILITY READ IS A READ, AND IT BELONGS ON THIS LIST.
     `system.health` is how the shipped accessor learns whether the server has the feature switched
     on. Before this round the harness skipped that question and answered it directly by calling
     `setCapability` — which is exactly why every suite passed against a live page that refused
     itself: the harness was supplying the one input production never gets. */
  R.CAPABILITY_ACTION = 'system.health';
  /* P1-B8D-R10D — AND THE ACTION THE CAPABILITY ACTUALLY ARRIVES ON NOW.

     `system.health` stays on this list because it is still a real routed read and other callers
     still make it; what changed is that Product Strategy is no longer one of them. The flag now
     rides the application's shared boot bootstrap, so the harness must be able to answer THAT —
     otherwise the only way a suite could raise the mirror would be to call the setter itself, which
     is the second activation path R4 removed for hiding a live defect for a whole round. */
  R.BOOTSTRAP_ACTION = 'getClientCapabilities';

  /**
   * A transport that answers from a capture and refuses to be anything else.
   *
   * @param {object} capture  { universe: envelope, workspaces: {siteKey: envelope} }
   * @param {object} [opts]   { fail: Error|function, delayMs, universeOverride }
   */
  R.makeTransport = function (capture, opts) {
    opts = opts || {};
    var log = [];

    /* `delayMs` is a number for every read, or a map keyed by site so ONE site can be the slow one.
       The stale-response case needs exactly that: site A slow, site B fast, both asked for. */
    function delayFor(action) {
      var d = opts.delayMs;
      if (d === undefined || d === null) return 0;
      if (typeof d === 'number') return d;
      var k = action === 'productPricing.siteUniverse.get' ? 'universe' : 'workspace';
      var v = d[k];
      return typeof v === 'number' ? v : 0;
    }

    function keyOf(payload) {
      var s = (payload && payload.scope) || {};
      return [s.company, s.country, s.marketplace].join('|');
    }

    /* ============================================================================================
       P1-B8D-R10D — THE SCENARIO'S OWN SERVER ANSWER FOR THE SHARED BOOTSTRAP, DEFINED ONCE.

       Two things read this: the fake server's `post`, and the Node seam in `install` below. One
       definition, so the answer a Node suite is given and the answer a browser page fetches cannot
       drift apart — which is the whole reason it is a function and not two literals.

       IT IS THE SCENARIO'S ANSWER, NEVER THE HARNESS'S OPINION. `capability: false` lowers it,
       `bootstrapProductStrategyValue` sends whatever literal a suite names — a `1`, a `"true"`, a
       `null` — without the harness normalising it into a boolean on the way, and
       `bootstrapOmitsProductStrategy` sends a deployment that predates the field. Every one of
       those must fail closed, and proving that is the point of being able to send them.

       THE THREE PRE-EXISTING FLAGS TRAVEL TOO. A harness that answered only the new field would let
       a change that DROPPED one of the other three pass unnoticed.

       `noBootstrapAnswer` means the scenario declares no server answer at all. It returns null, and
       nothing downstream is allowed to turn that into a value — see the control in `install`. */
    function bootstrapPayload() {
      if (opts.noBootstrapAnswer === true) return null;
      var out = {
        capabilitiesVersion: 'replay-r10d',
        requestOrderDraftV2FlatCutover: true,
        requestOrderSiteConfirmRequired: true,
        inventoryAiPlanDbGenerationEnabled: false
      };
      if (opts.bootstrapOmitsProductStrategy === true) return out;
      out.product_strategy_enabled = (opts.bootstrapProductStrategyValue !== undefined)
        ? opts.bootstrapProductStrategyValue : (opts.capability !== false);
      return out;
    }

    var transport = {
      /** The accessor calls this and then hands the result to safeReadJsonResponse. */
      post: function (dto) {
        var action = dto && dto.action;
        log.push({ action: action, payload: dto && dto.payload, at: log.length });

        /* A WRITE-SHAPED CALL IS A THROW, NOT A REFUSAL. Returning an error would let a caller
           swallow it; raising makes an attempted write impossible to miss and impossible to count
           as zero. */
        if (action !== R.CAPABILITY_ACTION && action !== R.BOOTSTRAP_ACTION
          && R.READ_ACTIONS.indexOf(action) < 0) {
          throw new Error('P1B8C REPLAY REFUSED A NON-READ ACTION: ' + action);
        }

        /* P1-B8D-R10D — THE SHARED BOOTSTRAP'S ANSWER, IN THE SHAPE 03_ ACTUALLY SENDS.

           NESTED under `data`, unlike `system.health` below, because that is the difference between
           the two handlers and it has bitten this repository before: a reader that assumed the wrong
           level read every field as undefined and called a correct deployment stale. The three
           pre-existing flags are carried too — a harness that answered only the new field would let
           a change that DROPPED one of them pass, and §8 forbids exactly that.

           `capability` drives the Product Strategy field only. The other three keep their production
           values, because a scenario about Product Strategy being switched off is not a scenario
           about the Request Order cutover being switched off. */
        if (action === R.BOOTSTRAP_ACTION) {
          var bp = bootstrapPayload();
          if (!bp) {
            /* THE SCENARIO DECLARED NO SERVER ANSWER. The wire says so rather than the harness
               inventing one — see the control in `install` below. */
            return Promise.reject(Object.assign(new Error('no bootstrap answer'),
              { apiCode: 'REDIRECT_TARGET_NOT_FOUND' }));
          }
          return Promise.resolve({ success: true, data: bp });
        }

        /* THE SERVER'S ANSWER ABOUT ITS OWN FLAG, in the FLAT shape 63_ actually sends. The harness
           answers the question; it does not answer FOR the page. */
        if (action === R.CAPABILITY_ACTION) {
          return Promise.resolve({ success: true, ok: true,
            product_strategy_enabled: opts.capability !== false });
        }

        /* P1-B8D-R7 - A FAILURE CAN BELONG TO ONE READ. Refusing every action refuses the
           UNIVERSE too, and without a universe the page correctly draws no chooser - so a run
           meant to ask "after a workspace failure, can a person still see their site and try
           again" photographed a page with nothing to try again WITH. */
        var failApplies = !opts.failOnly
          || (opts.failOnly === 'workspace' && action === 'productPricing.workspace.get')
          || (opts.failOnly === 'universe' && action === 'productPricing.siteUniverse.get');
        if (opts.fail && failApplies) {
          var e = (typeof opts.fail === 'function') ? opts.fail(action, dto) : opts.fail;
          if (e) return Promise.reject(e);
        }

        /* P1-B8D-R6 - A READ THAT NEVER ANSWERS, so the LOADING states can be photographed.
           §8 asks for "loading universe" and "loading workspace" as states in their own right, and
           a loading state is not a scenario you can reach by answering quickly - it only exists
           while the answer is outstanding. This holds the promise open for ever; the runner flips
           its own readiness flag on a timer so the shot is taken mid-flight rather than never. */
        if (opts.hang === 'universe' && action === 'productPricing.siteUniverse.get') {
          return new Promise(function () {});
        }
        if (opts.hang === 'workspace' && action === 'productPricing.workspace.get') {
          return new Promise(function () {});
        }

        /* P1-B8D-R7 - A SLOW ANSWER, WHICH IS A DIFFERENT THING FROM NO ANSWER.
           `delayMs` has been in this function's JSDoc since P1-B8C and nothing ever read it, so
           every reply landed in the same microtask as its request and the ORDER of two outstanding
           reads could not be staged. That order is the whole mechanism behind "I chose a site and
           it went back": a person picks A, picks B before A has answered, and A lands last. A
           harness that always answers instantly cannot produce it, and every suite was green.
           Per-action, because the interesting case is a SLOW WORKSPACE under a fast universe. */
        function answer(v) {
          var ms = delayFor(action);
          if (ms <= 0) return Promise.resolve(v);
          return new Promise(function (res) { setTimeout(function () { res(v); }, ms); });
        }

        if (action === 'productPricing.siteUniverse.get') {
          return answer(opts.universeOverride || capture.universe);
        }
        var siteKey = keyOf(dto.payload);
        /* THE SLOW SITE IS NAMED, so a test can make the FIRST choice the slow one and the second
           fast. A uniform delay cannot produce an out-of-order pair; it just moves both later. */
        if (opts.slowSite && typeof opts.slowSite === 'object'
          && siteKey === [opts.slowSite.company, opts.slowSite.country,
            opts.slowSite.marketplace].join('|')) {
          var slowEnv = capture.workspaces[siteKey];
          if (!slowEnv) throw new Error('P1B8C REPLAY HAS NO CAPTURE FOR SITE: ' + siteKey);
          return new Promise(function (res) {
            setTimeout(function () { res(slowEnv); }, opts.slowMs || 300);
          });
        }
        var env = capture.workspaces[siteKey];
        if (!env) {
          throw new Error('P1B8C REPLAY HAS NO CAPTURE FOR SITE: ' + siteKey);
        }
        /* P1-B8D-R6 - AN EMPTY WORKSPACE FOR A REAL SITE.
           The `empty-site` screenshot used to pass a site that is not in the universe, and since
           P1-B8D-R5 enforces membership that is REFUSED - so the state grid's "empty" cell was
           photographing "Choose a site to analyse." under the name EMPTY. None of the ten captured
           sites is empty, so the only honest way to reach SOURCE_EMPTY is for the SERVER to answer
           with no rows for a site that really exists. The envelope keeps the server's own shape;
           only the rows and the state it reports are replaced. */
        /* P1-B8D-R8 - A REAL SITE WHOSE LISTINGS CARRY NO CATEGORY.
           The USER quoted the sentence the Category control writes when nothing on the site has a
           category, and NONE of the ten captured sites produces it: every one of them has
           categories, so the state the report is about could not be reached, photographed or
           asserted. It is not a refusal and not an empty site - there are rows, they have prices,
           and the board draws a complete chart; it is a site the category MENU has nothing to
           offer for. The server's own envelope is kept and one field is emptied on each row,
           because that is the only difference between this site and the captured one. */
        /* P1-B8D-R9 §5 — A ROW WHOSE IMAGE ADDRESS CANNOT RESOLVE, AND WHY IT POINTS WHERE IT DOES.

           §5 asks for a NETWORK 404 count and for a fallback count, and neither can be measured on a
           page where no image ever fails. The obvious way to force one — a missing file under
           `assets/img/products/` — no longer works, because that is precisely what the manifest gate
           now catches BEFORE a request is made. That is the fix doing its job, and it makes the
           defect unreachable from inside the covered roots.

           SO THE PATH POINTS OUTSIDE THEM. A reference the manifest does not cover is passed through
           untouched — absence is only provable where somebody looked — so the browser really does
           issue the request and really does fail, which is the only honest way to exercise the last
           line of defence: the marker's own error handler.

           IT IS ALSO THE HONEST SHAPE OF A RESIDUAL RISK. A row could point anywhere; the manifest
           covers `assets/img`, and this is what the page does with everything else. */
        if (opts.forceBadImage === true) {
          var bi = env.data || {};
          return answer(Object.assign({}, env, {
            data: Object.assign({}, bi, {
              normalizedRows: (bi.normalizedRows || []).map(function (r) {
                return Object.assign({}, r,
                  { product_image: 'vendor-assets/products/NOT-IN-THIS-REPOSITORY.jpg' });
              })
            })
          }));
        }
        if (opts.noCategories === true) {
          var dn = env.data || {};
          return answer(Object.assign({}, env, {
            data: Object.assign({}, dn, {
              normalizedRows: (dn.normalizedRows || []).map(function (r) {
                return Object.assign({}, r, { category: null });
              })
            })
          }));
        }
        if (opts.emptyWorkspace === true) {
          var d = env.data || {};
          return answer(Object.assign({}, env, {
            data: Object.assign({}, d, { normalizedRows: [], sourceState: 'SOURCE_EMPTY' })
          }));
        }
        return answer(env);
      },
      /* The real one parses a Response; a plain object is already the parsed envelope, which is the
         branch km-api-foundation.js takes for "injected fetchers". Same function contract. */
      safeReadJsonResponse: function (v) { return v; },
      configured: function () { return true; }
    };

    /* ==============================================================================================
       P1-B8D-R10 §8 — A FAKE NETWORK, NOT A FAKE TRANSPORT.

       The accessor now reads through `KM.transport.request({kind:'read'})`, the same boundary every
       other workspace read uses. That boundary is where the endpoint classifier, the HTML
       fingerprint, the redirect-target classification and the BOUNDED ONE-SHOT RECOVERY live — and
       those are exactly the behaviours §8 and §10 ask to be proven.

       SO THE HARNESS MUST NOT REPLACE THAT LAYER. Stubbing `KM.transport.request` wholesale would
       mean the retry under test is the STUB'S retry, and every mutant about "retry more than once"
       or "retry without restarting from the stable /exec" would be asserting the harness against
       itself. Instead a fake `fetch` is injected into a REAL transport instance built from the real
       factory. Production's own policy runs; this decides only what the network says back.

       THE FAULTS ARE THE ONES THE LIVE INCIDENT PRODUCED, shaped so the real fingerprinter
       recognises them: an expired echo target is a 404 whose FINAL URL is on the usercontent host
       and which reports `redirected`, because `codeForHtml` requires all three facts together.
       ============================================================================================== */
    var physical = { attempts: 0, byAction: {}, methods: [], urls: 0 };

    function htmlBody(kind) {
      if (kind === 'authHtml') {
        return '<!DOCTYPE html><html><head><title>Sign in - Google Accounts</title></head>'
          + '<body><div>Please sign in to continue to accounts.google.com</div></body></html>';
      }
      if (kind === 'redirect404') {
        return '<!DOCTYPE html><html><head><title>Error 404 (Not Found)</title></head>'
          + '<body><p>The requested URL was not found on this server.</p></body></html>';
      }
      return '<!DOCTYPE html><html><head><title>Error</title></head>'
        + '<body><p>A temporary error occurred.</p></body></html>';
    }

    function respond(status, ctype, body, finalUrl, redirected) {
      return {
        ok: status >= 200 && status < 300,
        status: status,
        url: finalUrl,
        redirected: redirected === true,
        headers: { get: function (h) {
          return String(h).toLowerCase() === 'content-type' ? ctype : null; } },
        text: function () { return Promise.resolve(body); }
      };
    }

    var ECHO = 'https://script.googleusercontent.com/macros/echo?redacted=1';

    /* The fault that applies to THIS physical attempt, or null.

       THREE SHAPES, AND EACH PROVES SOMETHING THE OTHERS CANNOT.

       ALWAYS (the default) is the steady-state matrix: what is the operator told, and what does it
       cost, when a fault is not going away.

       ONCE is the recovery: attempt 1 fails, attempt 2 answers, and the operator sees one loading
       state and then data — never an error that turns into a success.

       UNTIL N is the SUPERSEDE case, and it needs its own shape because the other two cannot express
       it. To prove that site A's late failure does not land on site B, site A must fail through its
       whole bounded sequence (two attempts) while site B must SUCCEED — otherwise a passing run is
       indistinguishable from one where B simply failed too, which is the flaw this replaced. */
    function faultFor(n) {
      var f = opts.netFault;
      if (!f) return null;
      /* FROM/UNTIL is not decoration. A page life is a SEQUENCE of reads — the site universe first,
         then the workspace for whichever site is chosen — and a window that opens at attempt 1 lands
         on the universe, which leaves the chooser empty and makes every later assertion about a site
         unreachable. */
      var from = (typeof opts.netFaultFrom === 'number') ? opts.netFaultFrom : 1;
      var until = (typeof opts.netFaultUntil === 'number') ? opts.netFaultUntil
        : (opts.netFaultOnce === true ? 1 : Infinity);
      if (n < from || n > until) return null;
      return f;
    }
    /* A faulted attempt can be made SLOW, so a second site can be chosen while the first is still
       outstanding. Without this the switch always happens after the failure has already settled, and
       'a stale answer must not overwrite a new site' is never actually exercised. */
    function delayed(v) {
      var ms = (typeof opts.netFaultSlowMs === 'number') ? opts.netFaultSlowMs : 0;
      if (ms <= 0) return v;
      return new Promise(function (res) { setTimeout(function () { res(v); }, ms); })
        .then(function (x) { return x; });
    }

    function fakeFetch(url, init) {
      var u = String(url || '');
      var method = (init && init.method) || 'GET';
      var n = ++physical.attempts;
      physical.methods.push(method);
      var action = (/[?&]action=([^&]+)/.exec(u) || [])[1];
      action = action ? decodeURIComponent(action) : '';
      physical.byAction[action] = (physical.byAction[action] || 0) + 1;
      physical.urls = Math.max(physical.urls, u.length);

      /* AND COUNTING ATTEMPTS IS NOT ENOUGH TO NAME A SITE, which cost one wrong measurement to see.
         The supersede case wanted 'fail site A and its recovery, let site B through', so the window was
         set to attempts 2-3. But site B is chosen while A is still in flight, so B's FIRST read was
         attempt 3 and got the fault meant for A's recovery; B then recovered and the run still looked
         right, for the wrong reason. Interleaving makes an attempt NUMBER an unreliable way to name a
         request. `netFaultWhen` matches on the request itself instead, so a fault aimed at one site
         hits that site however the reads happen to overlap. */
      var fault = faultFor(n);
      if (fault && opts.netFaultWhen) {
        var decoded = u;
        try { decoded = decodeURIComponent(u); } catch (e) { decoded = u; }
        if (decoded.indexOf(opts.netFaultWhen) === -1) fault = null;
      }
      if (fault === 'offline' || fault === 'transportError') {
        return delayed(1).then(function () {
          return Promise.reject(new TypeError('Failed to fetch')); });
      }
      if (fault === 'timeout') return new Promise(function () {});
      if (fault === 'redirect404') {
        return delayed(respond(404, 'text/html; charset=utf-8',
          htmlBody('redirect404'), ECHO, true));
      }
      if (fault === 'authHtml') {
        return delayed(respond(200, 'text/html; charset=utf-8',
          htmlBody('authHtml'), ECHO, true));
      }
      if (fault === 'genericHtml') {
        return delayed(respond(500, 'text/html; charset=utf-8',
          htmlBody('genericHtml'), ECHO, true));
      }

      /* NO FAULT: serve the capture through the SAME logic `post` uses, so one harness cannot
         answer two different things depending on which door a read came in by. */
      var bodyRaw = (/[?&]km_body=([^&]*)/.exec(u) || [])[1];
      var dto;
      try { dto = bodyRaw ? JSON.parse(decodeURIComponent(bodyRaw)) : {}; } catch (e) { dto = {}; }
      if (!dto.action) dto.action = action;
      return Promise.resolve(transport.post(dto)).then(function (env) {
        return respond(200, 'application/json', JSON.stringify(env), ECHO, true);
      }, function (err) {
        /* P1-B8D-R10A — A TYPED FAILURE IS A NETWORK CONDITION, AND MUST BE SENT AS ONE.

           Suites written against the old POST shim expressed transport failures by THROWING an error
           carrying an `apiCode`, because the shim's caller read that field directly. Nothing reads it
           any more: the shared transport derives its code from the WIRE — status, content-type, final
           host, and an HTML fingerprint. A thrown apiCode therefore arrived as an anonymous network
           failure and every one of those scenarios collapsed into SOURCE_NOT_CONNECTED.

           The fix is not to teach the transport about apiCodes. It is to make the harness express the
           scenario the way a network does, so production's classifier stays the ONLY classifier: each
           code is mapped to the wire shape that genuinely produces it. Anything unrecognised stays a
           real network failure, which is what an unlabelled throw actually means. */
        var code = String((err && err.apiCode) || '');
        if (code === 'AUTH_OR_ACCESS_HTML') {
          return respond(200, 'text/html; charset=utf-8', htmlBody('authHtml'), ECHO, true);
        }
        if (code === 'TRANSPORT_NON_JSON_RESPONSE') {
          return respond(200, 'text/html; charset=utf-8', htmlBody('genericHtml'), ECHO, true);
        }
        if (code === 'HTTP_NOT_FOUND_HTML') {
          return respond(404, 'text/html; charset=utf-8', htmlBody('redirect404'), u, false);
        }
        if (code === 'REDIRECT_TARGET_NOT_FOUND') {
          return respond(404, 'text/html; charset=utf-8', htmlBody('redirect404'), ECHO, true);
        }
        if (code === 'REQUEST_TIMEOUT') return new Promise(function () {});
        return Promise.reject(err instanceof Error ? err : new TypeError('Failed to fetch'));
      });
    }

    /* P1-B8D-R10A — THE FOUNDATION STUB BUILDS THE ENVELOPE PRODUCTION BUILDS.

       `readOnce` prefers `api.buildRequestEnvelope` and falls back to an equivalent literal, so a
       stub without it still works — but then every test exercises the FALLBACK and the shape real
       browsers send goes unexercised. This mirrors km-api-foundation's builder: same five fields,
       same frozen envelope, same requestId passthrough. */
    function buildRequestEnvelope(action, payload, context) {
      var a = String(action == null ? '' : action).trim();
      if (a === '') throw new Error('action is required');
      return Object.freeze({
        apiVersion: '1.0',
        action: a,
        requestId: (context && context.requestId) || null,
        payload: (payload && typeof payload === 'object') ? payload : {},
        context: Object.freeze({
          actor: (context && context.actor) || null,
          clientVersion: (context && context.clientVersion) || null
        })
      });
    }

    return {
      api: { transport: transport, buildRequestEnvelope: buildRequestEnvelope },
      /* Exposed so the Node seam in `install` hands the accessor the SAME answer the wire carries. */
      bootstrapPayload: bootstrapPayload,
      fetch: fakeFetch,
      physical: physical,
      log: log,
      actions: function () { return log.map(function (r) { return r.action; }); },
      countOf: function (a) {
        return log.filter(function (r) { return r.action === a; }).length;
      },
      /* P1-B8D-R7 - THE SERVER RECOVERS, which is half of what a retry means. A run that can only
         fail for ever can prove that a failure is SHOWN and can never prove that a person is able
         to get out of it; "retry" would be asserted as one more refusal. */
      stopFailing: function () { opts.fail = null; },
      /* P1-B8D-R8 - AND THE SERVER CAN START FAILING PART WAY THROUGH, which is the only way to
         ask "does a REFUSED site B leave site A's board on screen". A run that refuses from the
         beginning never gets a site A to leave behind, so it answers a different question. */
      startFailing: function (e, only) {
        opts.fail = e || new Error('the site refused');
        if (only !== undefined) opts.failOnly = only;
      },
      writes: 0
    };
  };

  /**
   * Install the fake transport on a global and raise the capability mirror the way a server does.
   * Returns a restore function; call it in a finally.
   */
  R.install = function (g, accessor, capture, opts) {
    var savedKM = g.KM;
    var t = R.makeTransport(capture, opts);
    g.KM = g.KM || {};
    var savedTransport = g.KM.transport;
    g.KM.api = t.api;
    g.KM.productPricingWorkspace = accessor;
    /* P1-B8D-R10 §8 — A REAL TRANSPORT OVER A FAKE NETWORK.

       Built from the shipped factory, so the endpoint classifier, the HTML fingerprint, the typed
       codes and the bounded one-shot recovery are PRODUCTION'S and not the harness's. Only `fetch`
       is ours. `sleep` is collapsed because a test should not wait out a real backoff, and `baseUrl`
       is a synthetic but WELL-FORMED stable /exec: the classifier refuses anything that is not one,
       so a placeholder would be refused before dispatch and every read would fail for the wrong
       reason. It contains no real deployment id.

       If the factory is absent the accessor's own fallback keeps the suite working, which is the
       same contract production has. */
    /* P1-B8D-R10A — AND IN NODE THE FACTORY HAS TO BE ASKED FOR.

       `km-transport.js` publishes `KM.transportFactory` only onto a BROWSER window; under Node its
       root is null, so nothing was ever installed here and every Node suite fell through to the
       accessor's POST fallback. That was invisible while the fallback existed. R10A removed it, and
       four suites went red at once — correctly: they were driving a door production no longer has.

       Requiring the real factory keeps ONE arrangement everywhere: production's transport over this
       harness's network, in the browser and in Node alike. */
    var TF = g.KM.transportFactory;
    if (!TF && typeof require === 'function') {
      try { TF = require('../js/api/km-transport.js'); } catch (e) { TF = null; }
    }
    if (TF && typeof TF.create === 'function') {
      g.KM.transport = TF.create({
        fetch: t.fetch,
        baseUrl: 'https://script.google.com/macros/s/REPLAY_SYNTHETIC_DEPLOYMENT_ID_NOT_REAL/exec',
        sleep: function () { return Promise.resolve(); },
        random: function () { return 0.5; },
        /* P1-B8D-R10A — A REAL TIMEOUT, ON A CLOCK WITH A FLOOR AND A CEILING.

           A timeout scenario is served by never answering, which is what a timeout IS. Production's
           read budget is 60s, so an unanswered read outlived the measurement window and the page
           returned nothing at all — a suite reporting 'no measurements came back' about a page that
           was working correctly and simply still waiting.

           Shortening the BUDGET is not the same as faking the outcome: the transport's own timeout
           path runs, produces its own code, and production classifies it. Only the clock is ours, for
           the same reason `sleep` is.

           THE VALUE IS BOUNDED FROM BOTH SIDES, and the first attempt at this (250ms) broke the floor
           and took a lifecycle suite down with it:

             FLOOR    it must EXCEED every deliberate delay a scenario uses, or a slow answer that was
                      meant to arrive is cut off instead. The largest today is `slowMs: 700`, the
                      site-B delay the deferred-teardown trace is built on. At 250ms site B timed out
                      and never mounted.
             CEILING  it must fit inside the page's --virtual-time-budget (8000ms), or an unanswered
                      read outlives the measurement again. A timeout is never auto-retried, so one
                      budget is the whole cost.

           2000ms sits clear of both. A scenario that ever needs a delay above ~1.5s must raise this
           with it. */
        readTimeoutMs: 2000,
        writeTimeoutMs: 2000
      });
    }
    /* P1-B8D-R4 — NOT RAISED HERE ANY MORE. The accessor derives the capability from the health read
       this transport serves, through the same call the browser makes. Raising it here was a SECOND
       ACTIVATION PATH that only tests could walk, and it hid a live defect for a whole round: the
       mirror had no producer in production, so the deployed page answered FEATURE_DISABLED at zero
       requests while every suite rendered a full board. The reset stays — a module singleton must not
       carry one scenario's server answer into the next. */
    /* P1-B8D-R10D — THE RESET IS FOR THE SINGLETON, AND ONLY THE SINGLETON HAS ONE.

       A reset here used to be unconditional, and under R10D that quietly broke the thing this round
       is about. `setCapability({})` means "a server answered and said nothing about this flag",
       which is a SETTLED state — so a browser page whose mirror was reset at install never waited
       for the boot bootstrap it was supposed to be driven by, and every scenario reported the
       unreadable-field refusal before the bootstrap had landed. The measurement said so; nothing
       else would have.

       A BROWSER PAGE HAS NOTHING TO RESET. The module is loaded fresh in a new realm for every shot,
       and its load-time state is already the correct one: nobody has said anything yet. Under Node
       the module is a singleton shared across scenarios in one process, and there the reset is what
       stops one scenario's server answer from answering the next one's question.

       So the reset runs exactly where a previous scenario could have left something behind — which
       is the same condition as "no shared bootstrap is present to set it". No production API is
       added for the harness's benefit, and the browser path is left as production leaves it. */
    /* ============================================================================================
       P1-B8D-R10D — THE ONE NODE SEAM, AND AN HONEST STATEMENT OF WHAT IT IS AND IS NOT.

       WHAT IT IS. Under Node there is no DOM, no `app.js` and no `operation-system-db-api.js` — that
       file is browser-only from its first statement — so the application's boot bootstrap CANNOT
       RUN. Before R10D these suites got their capability because the accessor asked for it itself
       and this harness answered; R10D removed that ask, and with nothing to replace it the mirror
       would sit at PENDING for the life of every Node scenario and every board would refuse.

       So the seam hands the accessor the scenario's own server answer, through the accessor's own
       production setter. Three properties make that honest rather than a shortcut:

         · THE VALUE IS THE SERVER'S. It comes from `bootstrapPayload()` — the same function the
           fake server answers `getClientCapabilities` with — so `capability: false` still disables,
           a `1` or a `"true"` still fails closed, and an omitted field still fails closed. There is
           no `true` written anywhere on this path.
         · THE DECISION IS PRODUCTION'S. `setCapability` is the shipped function and it is called
           unchanged. Not one line of its literal-true rule, its heard/unheard rule or its failure
           classification is reproduced here.
         · IT IS ONE SEAM. Every Node suite is served by this line; none adds a setter call of its own.

       WHAT IT IS NOT, and this must not be blurred: these suites DO NOT verify the production
       bootstrap chain. `KM.DB.getClientCapabilities` → `KM.DB.applyClientCapabilities` → the
       production setter is verified ONLY by the R10D browser matrix, which runs the shipped bytes
       and is forbidden from calling the setter directly. A green Node suite says the accessor and
       the controller behave correctly GIVEN a capability; it says nothing about who delivered it.

       THE CONTROL IS BUILT IN. A scenario that declares no server answer (`noBootstrapAnswer`) gets
       `null` from `bootstrapPayload()`, and the branch below then resets the singleton WITHOUT a
       value rather than inventing one — so "the harness quietly injects true" is a hypothesis a
       suite can test, and the R10D suite does.

       A BROWSER PAGE TAKES NONE OF THIS. It has a real bootstrap, a fresh module per realm and
       nothing to reset, so the whole branch is skipped there. */
    var hasSharedBootstrap = !!(g.KM && g.KM.DB && typeof g.KM.DB.applyClientCapabilities === 'function');
    if (!hasSharedBootstrap) {
      var bootAnswer = t.bootstrapPayload();
      accessor.setCapability(bootAnswer ? bootAnswer : {});
    }
    /* ============================================================================================
       P1-B8D-R10D — THE SAME FAKE NETWORK, ONE LAYER FURTHER DOWN, SO THE SHIPPED BOOTSTRAP CAN RUN.

       R10D's whole claim is that the capability arrives on the application's own boot bootstrap. A
       run that cannot EXECUTE that bootstrap cannot test the claim — and the acceptance page could
       not, because `operation-system-db-api.js` was outside its script list, so `KM.DB` did not
       exist and app.js's boot skipped the one line that matters. Loading the shipped file fixes
       that and immediately raises the reason it was never loaded: `_kmGapRead_` dispatches through
       the GLOBAL `fetch`, against an endpoint constant with no setter. Left alone it would send a
       real request to a real deployment from every scenario in every suite.

       So the fake goes where that code looks: on the global. It is the SAME `fakeFetch` the
       transport was built with, which is what keeps this honest — one fake server, one request log,
       one set of counts. Two fakes would mean the bootstrap's requests and the page's requests were
       measured by different instruments, and "exactly one capability request" would be unprovable.

       THIS IS BENEATH THE TRANSPORT, WHICH IS THE ONLY PLACE A FAKE IS ALLOWED. Nothing about
       production's classification, bounded recovery, verb choice or timeout is replaced; the shipped
       bytes run and this decides only what the network says back.

       THE ORDERING IS WHAT MAKES IT SAFE, and it is a property of the page rather than a hope:
       `install` is called from the acceptance page's inline boot script, which executes DURING
       parsing, while `app.js`'s bootstrap runs on DOMContentLoaded, which cannot fire until parsing
       has finished. The global is therefore already ours before the first byte of the bootstrap
       runs, and neither of the shipped file's two top-level blocks issues a request at load time.

       RESTORED EXACTLY, INCLUDING ITS ABSENCE. A host with no `fetch` (older Node sandboxes) must be
       left with no `fetch`, not with an `undefined` property that now answers `'fetch' in g`. */
    var hadFetch = Object.prototype.hasOwnProperty.call(g, 'fetch');
    var savedFetch = g.fetch;
    try { g.fetch = t.fetch; } catch (e) { /* a frozen global is not worth failing a suite over */ }
    t.restore = function () {
      /* Lowered for the NEXT scenario in this process, WITHOUT a value — a reset must not be a
         second way to raise the mirror. A browser realm has no next scenario. */
      if (!hasSharedBootstrap) accessor.setCapability({});
      try { if (hadFetch) { g.fetch = savedFetch; } else { delete g.fetch; } } catch (e) {}
      if (g.KM) g.KM.transport = savedTransport;
      g.KM = savedKM;
    };
    return t;
  };

  /**
   * OPERATE THE SITE CHOOSER THE WAY A PERSON DOES  (P1-B8D-R5).
   *
   * The visual runner used to reach past the screen and call `c.select({company, country,
   * marketplace})`. That is the same defect as raising the capability mirror by hand, one layer
   * out: it supplies an input production can only get from a control, so the run cannot fail for
   * the reason production failed — and it did not. Seven viewports of a fully rendered board were
   * photographed over a page whose live equivalent offered no way to choose anything.
   *
   * So this sets the value of each control that EXISTS and dispatches a real `change`. A tier the
   * universe already resolved has no `<select>` — it renders as read-only context — and is skipped
   * rather than forced, because forcing it would be inventing a control to use. The chooser is
   * re-rendered after every pick, so each step re-queries rather than holding a stale node.
   */
  R.chooseSite = function (doc, site) {
    var win = (doc && doc.defaultView) || (typeof window !== 'undefined' ? window : null);
    var page = win && win.KM && win.KM.pages && win.KM.pages.productStrategyBoard;
    var order = ['company', 'country', 'marketplace'];
    function at(i) {
      if (i >= order.length) return Promise.resolve(null);
      var dim = order[i];
      var host = doc.getElementById('psb-site-host');
      var sel = host && host.querySelector('[data-psb-site-dim="' + dim + '"]');
      if (!sel || sel.disabled) return at(i + 1);
      if (String(sel.value) === String(site[dim])) return at(i + 1);
      sel.value = site[dim];
      sel.dispatchEvent(new win.Event('change', { bubbles: true }));
      return Promise.resolve(page && page.lastSelection).then(function () { return at(i + 1); });
    }
    return at(0);
  };

  /** The capture object the harness expects, from the capture module. */
  R.captureOf = function (CAP) {
    return { universe: CAP.universeEnvelope(), workspaces: CAP.workspaces() };
  };

  /**
   * WALK ANY VALUE FOR THE FIELDS §4 REMOVES. Returns the paths that carry a non-null value.
   *
   * A KEY SEARCH, NOT A STRING SEARCH. Scanning the serialised capture for "product_url" finds the
   * field name in its own de-identification note and reports a leak that is a comment — the P1-B2C
   * G18 trap this project has now sprung five times. This reads keys and values.
   */
  R.leaks = function (value, forbiddenKeys) {
    var found = [];
    (function walk(v, path) {
      if (v === null || v === undefined) return;
      if (v instanceof Array) {
        for (var i = 0; i < v.length; i++) walk(v[i], path + '[' + i + ']');
        return;
      }
      if (typeof v !== 'object') return;
      Object.keys(v).forEach(function (k) {
        var p = path === '' ? k : path + '.' + k;
        if (forbiddenKeys.indexOf(k) >= 0 && v[k] !== null && v[k] !== undefined && v[k] !== '') {
          found.push(p + ' = ' + JSON.stringify(v[k]).slice(0, 60));
        }
        walk(v[k], p);
      });
    }(value, ''));
    return found;
  };

  /**
   * ANY STRING ANYWHERE THAT LOOKS LIKE AN IDENTIFIER WE PROMISED TO REMOVE.
   *
   * The key walk above catches a named field; this catches the same value smuggled under a different
   * name — a Script id inside a `build`, an address inside a `detail`. Shapes rather than names.
   */
  R.SECRET_SHAPES = [
    { name: 'an https URL', re: /https?:\/\/[^\s"']+/ },
    { name: 'an Apps Script id', re: /\bAKfyc[A-Za-z0-9_-]{20,}\b/ },
    { name: 'a long opaque id', re: /\b[A-Za-z0-9_-]{40,}\b/ },
    { name: 'an email address', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
    { name: 'a spreadsheet id', re: /\b1[A-Za-z0-9_-]{30,}\b/ }
  ];

  R.secretShapes = function (value) {
    var s = JSON.stringify(value);
    var hits = [];
    R.SECRET_SHAPES.forEach(function (p) {
      var m = p.re.exec(s);
      if (m) hits.push(p.name + ': ' + m[0].slice(0, 48));
    });
    return hits;
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = R; }
  if (root) { root.P1B8C_REPLAY = R; }
}(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this)));
