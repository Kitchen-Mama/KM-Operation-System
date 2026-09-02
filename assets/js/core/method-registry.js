/**
 * assets/js/core/method-registry.js
 * F1-7N-FB-4C §C — SCOPED SHIPPING-METHOD REGISTRY for the Execution Plan Method picker.
 *
 * THE DEFECT THIS REPLACES. The page held the carrier catalogue in three loose variables (`_irCarrierModel`,
 * `_irCarrierStatus`, `_irCarrierPending`) and collapsed every possible outcome into two words for the user:
 *
 *   · a transport failure, an undeployed action, a schema refusal and a rejected promise ALL became
 *     `_irCarrierStatus = 'ERROR'` with the ERROR CODE DISCARDED, rendered as "Unable to load methods";
 *   · and a genuinely EMPTY configuration — the catalogue loaded fine, but no rate card covers this route —
 *     rendered as "No matching method", which is a different sentence but was reached from the same place.
 *
 * So the live symptom ("Method shows Unable to load method" while From/To/Qty are fine) told the operator
 * nothing they could act on: it could equally mean the Apps Script deployment is stale, the workspace read
 * failed, or `carrier_rate_cards` simply has no row for CN→Amazon/US. §C requires those to be different states
 * with different remedies, and forbids reporting "no eligible method" as a transport failure.
 *
 * THE FIVE STATES ARE NOW REAL AND DISTINCT:
 *   LOADING               the catalogue request is in flight
 *   READY                 the catalogue loaded AND this route has at least one eligible method
 *   EMPTY_CONFIGURATION   the catalogue loaded and is trustworthy, but nothing covers this route.
 *                         Carries METHOD_REGISTRY_CONFIGURATION_REQUIRED naming the missing row.
 *   ERROR                 the catalogue could not be read. Carries the real code.
 *   STALE_SCOPE           the catalogue in hand belongs to a different applied scope than the one being asked
 *                         about — the answer would be about the wrong station, so it is not given.
 *
 * SCOPE AND IDENTITY. Eligibility is decided on CANONICAL IDENTITIES — source warehouse id, destination
 * warehouse code (or the marketplace token for a logical destination), country and marketplace — never on the
 * text shown in a dropdown. A blank axis ON A RATE CARD is a wildcard (it covers everything on that axis); a
 * blank axis in the REQUEST simply does not constrain. That asymmetry is deliberate and is what lets a
 * half-filled route still offer the methods it could possibly use.
 *
 * REQUEST DISCIPLINE. One catalogue per applied scope, cached, behind a single-flight latch keyed by scope.
 * Expanding twenty SKUs, or twenty route rows inside one SKU, issues ONE request — never N+1. `requestCount()`
 * is exported so the regression suite asserts that on the shipped object instead of trusting a comment.
 *
 * Pure core, injectable IO, no DOM.
 */
(function (root) {
  'use strict';

  var STATUS = {
    IDLE: 'IDLE', LOADING: 'LOADING', READY: 'READY',
    EMPTY_CONFIGURATION: 'EMPTY_CONFIGURATION', ERROR: 'ERROR', STALE_SCOPE: 'STALE_SCOPE'
  };

  function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
  function lo(v) { return str(v).toLowerCase(); }

  // The applied station a catalogue belongs to. Two requests with the same key are the same question.
  function scopeKey(scope) {
    scope = scope || {};
    return [lo(scope.company), lo(scope.country), lo(scope.marketplace)].join('|');
  }

  // A rate card is usable unless it is explicitly inactive or outside its effective window.
  // `carrier_rate_cards` has NO is_active column — the only status signal is the free-text `status`, so this
  // EXCLUDES known-inactive tokens rather than allow-listing, exactly as the page has always done.
  var INACTIVE_ = { inactive: 1, disabled: 1, archived: 1, expired: 1, void: 1, deleted: 1 };
  function rateCardUsable(rc, today) {
    if (!rc) return false;
    if (INACTIVE_[lo(rc.status)]) return false;
    var t = today ? new Date(today) : new Date();
    t.setHours(0, 0, 0, 0);
    function parseD(s) { var d = new Date(str(s)); return isNaN(d.getTime()) ? null : d; }
    var from = rc.effectiveFrom ? parseD(rc.effectiveFrom) : null;
    var to = rc.effectiveTo ? parseD(rc.effectiveTo) : null;
    if (from && t < from) return false;
    if (to && t > to) return false;
    return true;
  }

  // The per-axis eligibility test, isolated so the diagnosis below can report WHICH axis eliminated a card
  // instead of only that the result was empty.
  // A blank value ON THE CARD is a wildcard. A blank value IN THE ROUTE does not constrain.
  var AXES_ = [
    { key: 'originCountry', from: function (r) { return r.originCountry; }, label: 'origin_country' },
    { key: 'destinationCountry', from: function (r) { return r.destinationCountry; }, label: 'destination_country' },
    { key: 'marketplace', from: function (r) { return r.marketplace; }, label: 'marketplace' },
    { key: 'destinationWarehouseCode', from: function (r) { return r.destinationWarehouseCode; }, label: 'destination_warehouse_code' }
  ];
  function axisRejection(rc, route) {
    for (var i = 0; i < AXES_.length; i++) {
      var a = AXES_[i];
      var cardVal = lo(rc[a.key]);
      var routeVal = lo(a.from(route || {}));
      if (!cardVal) continue;                       // wildcard on the card
      if (!routeVal) continue;                      // the route does not constrain this axis
      if (cardVal !== routeVal) return { gate: a.label, expected: routeVal, found: cardVal };
    }
    return null;
  }

  // Distinct { value, label } methods for one route. `value` is the CANONICAL shipping_method token; `label`
  // is display metadata only and never becomes an identity.
  function methodsForRoute(cards, route, today) {
    var seen = {}, out = [];
    (cards || []).forEach(function (rc) {
      if (!rateCardUsable(rc, today)) return;
      if (axisRejection(rc, route)) return;
      var value = str(rc.shippingMethod);
      if (!value) return;
      var k = value.toLowerCase();
      if (seen[k]) return;
      seen[k] = 1;
      out.push({ value: value, label: str(rc.shippingMethodLabel) || value, carrierId: str(rc.carrierId) });
    });
    out.sort(function (a, b) { return a.label.localeCompare(b.label) || a.value.localeCompare(b.value); });
    return out;
  }

  // §C — when nothing matches, say exactly WHY, and what row would fix it. This is a configuration answer, not
  // an error: the catalogue was read successfully and is being reported faithfully.
  function configurationDiagnosis(cards, route, today) {
    cards = cards || []; route = route || {};
    var total = cards.length;
    var usable = cards.filter(function (rc) { return rateCardUsable(rc, today); });
    var byGate = {}, candidates = [];
    usable.forEach(function (rc) {
      var rej = axisRejection(rc, route);
      if (!rej) { candidates.push(rc); return; }
      byGate[rej.gate] = (byGate[rej.gate] || 0) + 1;
    });
    var withMethod = candidates.filter(function (rc) { return !!str(rc.shippingMethod); });
    var reason;
    if (total === 0) reason = 'NO_RATE_CARDS_AT_ALL';
    else if (usable.length === 0) reason = 'ALL_RATE_CARDS_INACTIVE_OR_OUT_OF_WINDOW';
    else if (candidates.length === 0) reason = 'NO_RATE_CARD_MATCHES_THIS_ROUTE';
    else if (withMethod.length === 0) reason = 'MATCHING_RATE_CARDS_CARRY_NO_SHIPPING_METHOD';
    else reason = 'RESOLVED';
    return {
      code: reason === 'RESOLVED' ? null : 'METHOD_REGISTRY_CONFIGURATION_REQUIRED',
      reason: reason,
      missing_table: 'carrier_rate_cards',
      scope: {
        origin_country: str(route.originCountry) || '(not selected)',
        destination_country: str(route.destinationCountry) || '(not selected)',
        marketplace: str(route.marketplace) || '(not selected)',
        destination_warehouse_code: str(route.destinationWarehouseCode) || '(logical / not selected)',
        source_warehouse_id: str(route.sourceWarehouseId) || '(not selected)'
      },
      counts: { total_rate_cards: total, usable_rate_cards: usable.length, matched_rate_cards: candidates.length, with_shipping_method: withMethod.length },
      rejected_by_gate: byGate,
      candidate_carriers: candidates.slice(0, 8).map(function (rc) { return { carrier_id: str(rc.carrierId), rate_card_id: str(rc.rateCardId), shipping_method: str(rc.shippingMethod) || '(blank)' }; }),
      required_fields: ['carrier_id', 'origin_country', 'destination_country', 'marketplace', 'shipping_method', 'status=active'],
      // A PROPOSAL, never a write. Nothing in this module creates or edits a rate card.
      required_configuration_row: reason === 'RESOLVED' ? null : {
        carrier_id: '(choose an existing carrier)',
        origin_country: str(route.originCountry) || '(leave blank to cover every origin)',
        destination_country: str(route.destinationCountry) || '(leave blank to cover every destination)',
        marketplace: str(route.marketplace) || '(leave blank to cover every marketplace)',
        destination_warehouse_code: str(route.destinationWarehouseCode) || '(blank = any destination warehouse)',
        shipping_method: '(the canonical method token this route should offer)',
        shipping_method_label: '(optional display label)',
        status: 'active'
      },
      next_action: reason === 'NO_RATE_CARDS_AT_ALL'
        ? 'carrier_rate_cards is empty. Add at least one active rate card before any Execution Plan route can name a shipping method.'
        : (reason === 'ALL_RATE_CARDS_INACTIVE_OR_OUT_OF_WINDOW'
          ? 'Every rate card is inactive or outside its effective window. Reactivate one or correct its effective dates.'
          : 'Add or correct a carrier_rate_cards row covering this route — see required_configuration_row. Nothing was written.'),
      authorization_note: 'PROPOSAL ONLY — no carrier_rate_cards row was created or modified.'
    };
  }

  function create(deps) {
    deps = deps || {};
    var cache = {};        // scopeKey -> { cards, leadTimes, at }
    var pending = {};      // scopeKey -> promise (single-flight; this is what makes N+1 impossible)
    var errors = {};       // scopeKey -> { code, message }
    var requests = 0;

    function read(scope) {
      if (typeof deps.read === 'function') return Promise.resolve(deps.read(scope));
      var api = (root && root.KM && root.KM.api) ? root.KM.api : null;
      if (!api || typeof api.getWorkspace !== 'function') {
        return Promise.resolve({ success: false, errors: [{ code: 'METHOD_REGISTRY_API_UNAVAILABLE', message: 'The workspace API is not available to this page.' }] });
      }
      return Promise.resolve(api.getWorkspace('inventoryReplenishment', { include: { carrierPlanning: true } }));
    }

    // ONE catalogue per scope. Already cached -> 0 requests. In flight -> shares that request. Otherwise -> 1.
    function ensureLoaded(scope, opts) {
      var key = scopeKey(scope);
      var force = !!(opts && opts.force);
      if (!force && cache[key]) return Promise.resolve({ status: STATUS.READY, key: key });
      if (!force && errors[key] && !(opts && opts.retry)) return Promise.resolve({ status: STATUS.ERROR, key: key, error: errors[key] });
      if (pending[key]) return pending[key];
      requests++;
      delete errors[key];
      pending[key] = Promise.resolve(read(scope)).then(function (env) {
        delete pending[key];
        if (!env || env.success === false || !env.data) {
          // Keep the REAL code. Discarding it is what made every failure read as one unactionable sentence.
          var e = (env && env.errors && env.errors[0]) || (env && env.error) || {};
          errors[key] = { code: str(e.code) || 'METHOD_REGISTRY_READ_FAILED', message: str(e.message) || 'The carrier catalogue could not be read.' };
          return { status: STATUS.ERROR, key: key, error: errors[key] };
        }
        var adapted = (typeof deps.adapt === 'function') ? deps.adapt(env.data)
          : ((root && root.KM && root.KM.DB && root.KM.DB.adaptInventoryReplenishmentWorkspace) ? root.KM.DB.adaptInventoryReplenishmentWorkspace(env.data) : null);
        if (!adapted) {
          errors[key] = { code: 'METHOD_REGISTRY_ADAPTER_UNAVAILABLE', message: 'The workspace adapter is not available to this page.' };
          return { status: STATUS.ERROR, key: key, error: errors[key] };
        }
        cache[key] = { cards: adapted.getCarrierRateCards || [], leadTimes: adapted.getCarrierLeadTimes || [] };
        return { status: STATUS.READY, key: key };
      })['catch'](function (err) {
        delete pending[key];
        errors[key] = { code: str(err && err.code) || 'METHOD_REGISTRY_READ_FAILED', message: str(err && err.message) || String(err) };
        return { status: STATUS.ERROR, key: key, error: errors[key] };
      });
      return pending[key];
    }

    // The question the picker actually asks: "what may this route offer, right now?"
    // `route.scope` is the APPLIED station; if a catalogue is held for a DIFFERENT station the answer is
    // STALE_SCOPE rather than a confidently wrong list.
    function resolve(scope, route, today) {
      var key = scopeKey(scope);
      if (pending[key]) return { status: STATUS.LOADING, methods: [], scope_key: key };
      if (errors[key]) return { status: STATUS.ERROR, methods: [], error: errors[key], scope_key: key };
      var entry = cache[key];
      if (!entry) {
        var loadedKeys = Object.keys(cache);
        if (loadedKeys.length) return { status: STATUS.STALE_SCOPE, methods: [], scope_key: key, loaded_scope_keys: loadedKeys };
        return { status: STATUS.IDLE, methods: [], scope_key: key };
      }
      var methods = methodsForRoute(entry.cards, route, today);
      if (methods.length) return { status: STATUS.READY, methods: methods, scope_key: key };
      return {
        status: STATUS.EMPTY_CONFIGURATION, methods: [], scope_key: key,
        configuration: configurationDiagnosis(entry.cards, route, today)
      };
    }

    // F1-7N-FB-4G-A1-R1 - ADOPT A CATALOGUE THE PAGE ALREADY HAS. Zero requests.
    //
    // THE DUPLICATE THIS REMOVES. ensureLoaded's read is
    // getWorkspace('inventoryReplenishment', { include: { carrierPlanning: true } }) - the SAME workspace
    // action Search already issued, differing only by the include flag. The workspace is a FULL-SET raw
    // passthrough of nineteen tables (marketplace_skus, sku_details, warehouses, four Amazon snapshots, three
    // fc tables, factory_stock, shipments, shipment_lines, shipping_plans, shipping_plan_lines, both
    // allocation-draft tables...), so asking for two small carrier reference tables re-read and re-transferred
    // ALL NINETEEN a second time. That second copy is the most expensive read on the page, and it is what hit
    // the transport's 60 000 ms read bound and surfaced as METHOD_CATALOGUE_ERROR - REQUEST_TIMEOUT.
    //
    // The page can ask for the include on the read it was already making. adopt() is how that result becomes
    // this registry's cache, so ensureLoaded afterwards is a cache hit and issues nothing. requestCount() is
    // deliberately NOT incremented: no request was made.
    //
    // The caller must only adopt a payload whose read ACTUALLY requested the include. Adopting one that did
    // not would install two empty tables as a settled catalogue, and the picker would report a configuration
    // problem that does not exist.
    function adopt(scope, adapted) {
      if (!adapted) return false;
      var key = scopeKey(scope);
      cache[key] = { cards: adapted.getCarrierRateCards || [], leadTimes: adapted.getCarrierLeadTimes || [] };
      delete errors[key];
      delete pending[key];
      return true;
    }

    return {
      STATUS: STATUS,
      ensureLoaded: ensureLoaded,
      adopt: adopt,
      reload: function (scope) { return ensureLoaded(scope, { force: true, retry: true }); },
      retry: function (scope) { return ensureLoaded(scope, { retry: true }); },
      resolve: resolve,
      isLoaded: function (scope) { return !!cache[scopeKey(scope)]; },
      getError: function (scope) { return errors[scopeKey(scope)] || null; },
      getLeadTimes: function (scope) { var e = cache[scopeKey(scope)]; return e ? e.leadTimes : []; },
      getRateCards: function (scope) { var e = cache[scopeKey(scope)]; return e ? e.cards : []; },
      requestCount: function () { return requests; },
      // Drop every cached catalogue — used when the applied station changes so a stale station can never answer.
      invalidate: function () { cache = {}; errors = {}; },
      // pure helpers (exported for direct unit testing)
      scopeKey: scopeKey, rateCardUsable: rateCardUsable, methodsForRoute: methodsForRoute,
      configurationDiagnosis: configurationDiagnosis, axisRejection: axisRejection
    };
  }

  var API = {
    STATUS: STATUS, create: create, scopeKey: scopeKey, rateCardUsable: rateCardUsable,
    methodsForRoute: methodsForRoute, configurationDiagnosis: configurationDiagnosis, axisRejection: axisRejection
  };

  if (root) {
    root.KM = root.KM || {};
    root.KM.methodRegistry = root.KM.methodRegistry || create();
    root.KM.methodRegistryFactory = API;
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : null);
