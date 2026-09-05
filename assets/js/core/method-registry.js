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

  // ==============================================================================================================
  // F1-7N-FC-1B-E3-R4-A2-R1-R6-R1 §4/§5 — THE COUPLING R5 REMOVED FROM THE SERVER WAS STILL HERE.
  //
  // R5 established that a PRICE LIST does not decide whether a shipping method exists — `carrier_lead_times`
  // does — and broke that coupling in the AI Plan's route derivation. This registry is the OTHER consumer, and
  // it was never touched. `methodsForRoute` reads `carrier_rate_cards` and nothing else, so the manual
  // Execution Plan composer kept the old rule: no rate card on the lane, no method in the dropdown.
  //
  // That is what an operator sees as "No eligible method" on a CN -> US route that has perfectly good transit
  // data. The registry has been LOADING `carrier_lead_times` into its cache all along (see adopt/ensureLoaded)
  // and never reading them.
  //
  // MARKETPLACE IS NOT A JOIN KEY HERE, and cannot become one by accident: `carrier_lead_times` has no
  // marketplace column, so the DTO has no such field and there is nothing to match on. CN->US/Amazon and
  // CN->US/Shopify share one transit authority by construction, not by a rule someone remembered to write.
  //
  // WHAT A PROFILE IS. One (origin, destination, method, last-mile) service, folded from every carrier row that
  // offers it. The fold is CONSERVATIVE — slowest max, slowest avg, fastest min — so a single fast carrier can
  // never make a service look quicker than the slowest operator who actually runs it. Carrier ids travel as
  // PROVENANCE only; `carrierSelection` is DEFERRED_TO_WEEKLY_SHIPPING_PLAN on every profile, because a
  // carrier_id sitting in a lead-time row is evidence that a service exists, never a commercial decision.
  // ==============================================================================================================
  var DEFERRED_ = 'DEFERRED_TO_WEEKLY_SHIPPING_PLAN';

  // A blank is not a zero. `Number('')` and `Number(null)` are both 0 and both pass isFinite, so a lead-time
  // row with an empty max_days would normalise to a ZERO-DAY transit and present itself as the fastest service
  // on the lane. The DTO already yields '' for a blank; this refuses anything that is not a real number.
  function days(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'string' && v.trim() === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  // Lane match on COUNTRY only. A blank on the row is a wildcard; a blank on the route does not constrain.
  // There is deliberately no marketplace clause and no rate-card clause.
  function leadTimeOnLane(lt, route) {
    route = route || {};
    var ro = lo(lt.originCountry), rd = lo(lt.destinationCountry);
    var qo = lo(route.originCountry), qd = lo(route.destinationCountry);
    if (ro && qo && ro !== qo) return false;
    if (rd && qd && rd !== qd) return false;
    return !!str(lt.shippingMethod);
  }

  // Distinct service profiles for one lane, conservatively folded. Sorted deterministically — never row order.
  function serviceProfilesForRoute(leadTimes, route) {
    var byKey = {}, order = [];
    (leadTimes || []).forEach(function (lt) {
      if (!lt || !leadTimeOnLane(lt, route)) return;
      var method = str(lt.shippingMethod);
      var lastMile = str(lt.lastMileDelivery);
      var k = method.toLowerCase() + '|' + lastMile.toLowerCase();
      if (!byKey[k]) {
        byKey[k] = { profileKey: k, value: method, method: method, lastMileDelivery: lastMile,
          label: method + (lastMile ? ' + ' + lastMile : ''),
          minDays: null, avgDays: null, maxDays: null,
          carrierIds: [], carrierSelection: DEFERRED_, source: 'CARRIER_LEAD_TIMES' };
        order.push(k);
      }
      var p = byKey[k];
      var mn = days(lt.minDays), av = days(lt.avgDays), mx = days(lt.maxDays);
      // SLOWEST max and SLOWEST avg; FASTEST min. min is display-only and is never a safety input.
      if (mx !== null) p.maxDays = (p.maxDays === null) ? mx : Math.max(p.maxDays, mx);
      if (av !== null) p.avgDays = (p.avgDays === null) ? av : Math.max(p.avgDays, av);
      if (mn !== null) p.minDays = (p.minDays === null) ? mn : Math.min(p.minDays, mn);
      var cid = str(lt.carrierId);
      if (cid && p.carrierIds.indexOf(cid) === -1) p.carrierIds.push(cid);
    });
    var out = order.map(function (k) { var p = byKey[k]; p.carrierIds.sort(); return p; });
    out.sort(function (a, b) { return a.label.localeCompare(b.label) || a.profileKey.localeCompare(b.profileKey); });
    return out;
  }

  // The profiles as METHOD options, in the shape the picker already consumes. `value` stays the canonical
  // shipping_method token — the same thing the header persists and the same thing IRService.matches compares —
  // so nothing about persistence or selection changes. The LAST-MILE variants a method offers travel WITH it
  // rather than being flattened away: see the note on lastMileOptions below.
  function methodsFromLeadTimes(leadTimes, route) {
    var profiles = serviceProfilesForRoute(leadTimes, route);
    var byMethod = {}, order = [];
    profiles.forEach(function (p) {
      var k = p.method.toLowerCase();
      if (!byMethod[k]) {
        byMethod[k] = { value: p.method, label: p.method, carrierId: '',
          source: 'CARRIER_LEAD_TIMES', carrierSelection: DEFERRED_,
          // EVERY last-mile this method actually runs on this lane. A method with two of them is a REAL
          // ambiguity the route row must resolve, and it is reported rather than resolved by taking the first.
          lastMileOptions: [], profiles: [], carrierIds: [] };
        order.push(k);
      }
      var m = byMethod[k];
      m.profiles.push(p);
      if (p.lastMileDelivery && m.lastMileOptions.indexOf(p.lastMileDelivery) === -1) m.lastMileOptions.push(p.lastMileDelivery);
      p.carrierIds.forEach(function (c) { if (m.carrierIds.indexOf(c) === -1) m.carrierIds.push(c); });
    });
    return order.map(function (k) {
      var m = byMethod[k];
      m.lastMileOptions.sort();
      m.carrierIds.sort();
      // The single unambiguous last mile, when there is exactly one. Null when a person must choose, which the
      // page turns into a second control rather than a silent default.
      m.lastMileDelivery = (m.lastMileOptions.length === 1) ? m.lastMileOptions[0] : '';
      m.lastMileAmbiguous = m.lastMileOptions.length > 1;
      return m;
    }).sort(function (a, b) { return a.label.localeCompare(b.label) || a.value.localeCompare(b.value); });
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
      // F1-7N-FC-1B-E3-R4-A1 §D — TWO SHEETS, NOT TWENTY-ONE.
      //
      // R4 had this ask for the bounded payload, which trimmed rows it was never going to read anyway. The live
      // measurement says the cost is per-TABLE, not per-row: 13 107 rows still took 30 833 ms of server time
      // across twenty-one sheets. So the catalogue now names the only two tables it consumes.
      //
      // This also settles a trade FB-4G-A1-R1 had to make in the other direction. It merged the carrier include
      // onto the primary read because the alternative was a SECOND read of nineteen unrelated tables, which is
      // what reached the 60 s bound as METHOD_CATALOGUE_ERROR. That alternative no longer exists.
      return Promise.resolve(api.getWorkspace('inventoryReplenishment', {
        include: { carrierPlanning: true }, recentWindow: true,
        only: ['carrier_lead_times', 'carrier_rate_cards']
      }));
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
      if (methods.length) {
        return { status: STATUS.READY, methods: methods, method_source: 'CARRIER_RATE_CARDS', scope_key: key };
      }
      // §4 — NO RATE CARD IS NOT NO METHOD. The price list is silent about this lane; the transit authority
      // may not be, and it is the one that decides whether a service exists. Consulted only as a FALLBACK, so
      // a lane that does have rate cards keeps its existing answer byte-for-byte.
      var viaTransit = methodsFromLeadTimes(entry.leadTimes, route);
      if (viaTransit.length) {
        return { status: STATUS.READY, methods: viaTransit, method_source: 'CARRIER_LEAD_TIMES',
          // Layer 2's decision, and it has not been made. Stated on the resolution so no consumer has to
          // infer it from the absence of a carrier id.
          carrier_selection: DEFERRED_,
          pricing: { available: false, reason: 'NO_RATE_CARD_FOR_LANE',
            note: 'Carrier comparison and price belong to the Weekly Shipping Plan. Method and transit time '
              + 'come from carrier_lead_times and do not depend on a rate card.' },
          scope_key: key };
      }
      return {
        status: STATUS.EMPTY_CONFIGURATION, methods: [], scope_key: key,
        configuration: configurationDiagnosis(entry.cards, route, today),
        // Both authorities were consulted and both are silent. Saying so keeps an operator from adding a rate
        // card to fix a missing lead time, which is the wrong table and would not help.
        transit_authority: { checked: true, profiles: 0, missing_table: 'carrier_lead_times',
          note: 'No carrier_lead_times row covers this lane either, so no service is known to run it.' }
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
      serviceProfilesForRoute: serviceProfilesForRoute, methodsFromLeadTimes: methodsFromLeadTimes,
      configurationDiagnosis: configurationDiagnosis, axisRejection: axisRejection
    };
  }

  var API = {
    STATUS: STATUS, create: create, scopeKey: scopeKey, rateCardUsable: rateCardUsable,
    methodsForRoute: methodsForRoute, configurationDiagnosis: configurationDiagnosis, axisRejection: axisRejection,
    serviceProfilesForRoute: serviceProfilesForRoute, methodsFromLeadTimes: methodsFromLeadTimes,
    DEFERRED_CARRIER_SELECTION: DEFERRED_
  };

  if (root) {
    root.KM = root.KM || {};
    root.KM.methodRegistry = root.KM.methodRegistry || create();
    root.KM.methodRegistryFactory = API;
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : null);
