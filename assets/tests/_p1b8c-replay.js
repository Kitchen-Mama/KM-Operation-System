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
 * THE CAPABILITY IS RAISED THE WAY A SERVER RAISES IT. `setCapability({product_strategy_enabled:true})`
 * is the mirror's only entry point and it takes a server capability payload. The harness does not
 * write `_enabled`, does not touch `PRODUCT_STRATEGY_ENABLED_`, and does not patch the accessor: the
 * mirror is raised in the TEST PROCESS only, and `resetCapability()` puts it back. Production default
 * is false and no file in this repository changes that.
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

  /**
   * A transport that answers from a capture and refuses to be anything else.
   *
   * @param {object} capture  { universe: envelope, workspaces: {siteKey: envelope} }
   * @param {object} [opts]   { fail: Error|function, delayMs, universeOverride }
   */
  R.makeTransport = function (capture, opts) {
    opts = opts || {};
    var log = [];

    function keyOf(payload) {
      var s = (payload && payload.scope) || {};
      return [s.company, s.country, s.marketplace].join('|');
    }

    var transport = {
      /** The accessor calls this and then hands the result to safeReadJsonResponse. */
      post: function (dto) {
        var action = dto && dto.action;
        log.push({ action: action, payload: dto && dto.payload, at: log.length });

        /* A WRITE-SHAPED CALL IS A THROW, NOT A REFUSAL. Returning an error would let a caller
           swallow it; raising makes an attempted write impossible to miss and impossible to count
           as zero. */
        if (R.READ_ACTIONS.indexOf(action) < 0) {
          throw new Error('P1B8C REPLAY REFUSED A NON-READ ACTION: ' + action);
        }

        if (opts.fail) {
          var e = (typeof opts.fail === 'function') ? opts.fail(action, dto) : opts.fail;
          if (e) return Promise.reject(e);
        }

        if (action === 'productPricing.siteUniverse.get') {
          return Promise.resolve(opts.universeOverride || capture.universe);
        }
        var env = capture.workspaces[keyOf(dto.payload)];
        if (!env) {
          throw new Error('P1B8C REPLAY HAS NO CAPTURE FOR SITE: ' + keyOf(dto.payload));
        }
        return Promise.resolve(env);
      },
      /* The real one parses a Response; a plain object is already the parsed envelope, which is the
         branch km-api-foundation.js takes for "injected fetchers". Same function contract. */
      safeReadJsonResponse: function (v) { return v; },
      configured: function () { return true; }
    };

    return {
      api: { transport: transport },
      log: log,
      actions: function () { return log.map(function (r) { return r.action; }); },
      countOf: function (a) {
        return log.filter(function (r) { return r.action === a; }).length;
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
    g.KM.api = t.api;
    g.KM.productPricingWorkspace = accessor;
    accessor.setCapability({ product_strategy_enabled: true });
    t.restore = function () {
      accessor.setCapability({});          // back to false, the production default
      g.KM = savedKM;
    };
    return t;
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
