// ================================================================================================================
// KMMR — TRANSIT-SAFE METHOD RECOMMENDATION (F1-7N-FC-1B-E3-R4-A2-R1-R5 §2/§3/§4)
// ----------------------------------------------------------------------------------------------------------------
// WHY THIS MODULE EXISTS AT ALL, AND WHY IT IS NOT PART OF ROUTE DERIVATION.
//
// R4 ended with the whole AI Plan reporting STOP because one lane had no Carrier Rate Card. That was the wrong
// product boundary: the AI Plan is a DECISION-SUPPORT tool, and a decision-support tool that refuses to advise
// on quantity and source because a price list is incomplete has stopped doing its job in order to police
// someone else's data. The three responsibilities are now separated, and this module owns the first one:
//
//   Layer 1  AI Plan                 what to ship, from where, how much, by when, and BY WHAT TRANSPORT METHOD
//                                    it can safely arrive.  <-- this module
//   Layer 2  Weekly Shipping Plan    given the chosen method, which CARRIER — compared on rate cards.
//   Layer 3  Submit Plan             the only layer that may refuse for incomplete mandatory fields.
//
// TWO COUPLINGS MEASURED BEFORE ANY CODE WAS WRITTEN, and only one of them existed:
//
//   * "marketplace is a required join key for international lead times" — IT IS NOT, and never was. The
//     lead-time DTO has no marketplace field at all (leadTimeId, carrierId, originCountry, destinationCountry,
//     shippingMethod, methodKey, lastMileDelivery, minDays, maxDays, avgDays) and KMRA.leadDays joins on
//     method + origin + destination + last-mile. CN->US Amazon and CN->US Shopify already share their transit
//     authority. This module keeps that property by CONSTRUCTION: it never reads a marketplace, so it cannot
//     grow the coupling later.
//
//   * "a Rate Card is required to obtain a method" — IT WAS. KMRA.eligibleMethods over zero rate cards returns
//     [], and route derivation refuses before it ever consults a lead time. So the marketplace axis on RATE
//     CARDS was transitively gating method resolution, which is how a marketplace-independent transit fact came
//     to look marketplace-specific. That is the coupling this module breaks: METHODS COME FROM THE TRANSIT
//     AUTHORITY. Price is enrichment, and its absence is a warning, never a refusal.
//
// SAFETY IS DECIDED CONSERVATIVELY, AND THE OPTIMISTIC NUMBER IS NEVER THE DECIDING ONE. A method is SAFE only
// when `max_days + buffer < days_until_stockout`. Using min_days, or avg_days alone, would call a 28-day
// service safe against 30 days of supply — which is the exact case §3 names, and which is a stockout dressed
// as a plan. min_days is carried for display and is deliberately never consulted by the verdict.
//
// AND NO CARRIER IS CHOSEN HERE. A lead-time row carries a carrier_id, and treating that as "the carrier" would
// silently pre-empt Layer 2's comparison from a table that exists to describe transit, not commerce. When
// several carriers serve one service profile their days are folded CONSERVATIVELY (the slowest max, the slowest
// avg) so no single optimistic carrier can make a profile look safe, and every contributing carrier id is
// reported as PROVENANCE with the selection explicitly deferred.
//
// PURE. No I/O, no clock, no sheet, no config literal: the buffer is supplied by the caller from the config
// authority so it can never become a magic number hiding in here.
// ================================================================================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./supply-planning-route-authority.js'));
  else root.KMMR = factory(root.KMRA);
})(this, function (KMRA) {
  'use strict';

  function s(v) { return String(v === undefined || v === null ? '' : v).replace(/\s+/g, ' ').trim(); }
  function low(v) { return s(v).toLowerCase(); }
  function num(v) { var n = Number(v); return isFinite(n) ? n : NaN; }
  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }

  // Typed statuses. A consumer switches on these; it never parses prose.
  var METHOD_STATUS = {
    AUTO_RECOMMENDED: 'AUTO_RECOMMENDED',
    MANUAL_REVIEW_REQUIRED: 'MANUAL_REVIEW_REQUIRED'
  };
  var METHOD_REVIEW_REASONS = {
    NO_LEAD_TIME_AUTHORITY_FOR_LANE: 'NO_LEAD_TIME_AUTHORITY_FOR_LANE',
    NO_SAFE_METHOD_WITHIN_BUFFER: 'NO_SAFE_METHOD_WITHIN_BUFFER',
    NO_REQUIRED_ARRIVAL_DATE: 'NO_REQUIRED_ARRIVAL_DATE'
  };
  // SAFE  — the conservative estimate still lands before the shortage.
  // TIGHT — only the AVERAGE lands before it; the slow tail does not. Never auto-recommended.
  // UNSAFE— not even the average lands before it.
  var RISK = { SAFE: 'SAFE', TIGHT: 'TIGHT', UNSAFE: 'UNSAFE' };

  // ---------------------------------------------------------------------------------------------------------------
  // SERVICE PROFILES. The unit the AI Plan recommends is a TRANSPORT/SERVICE PROFILE — {method, last_mile} — and
  // never a carrier. Built from carrier_lead_times over origin+destination only; a marketplace is not read here
  // and there is no parameter through which one could be supplied.
  // ---------------------------------------------------------------------------------------------------------------
  function serviceProfiles(leadTimes, lane) {
    lane = lane || {};
    var out = [], byKey = {};
    var ok = (KMRA && typeof KMRA.normalizeLeadTime === 'function' && typeof KMRA.axisOk === 'function');
    if (!ok) return out;
    (leadTimes || []).forEach(function (raw) {
      var lt = KMRA.normalizeLeadTime(raw);
      if (!KMRA.axisOk(lt.originCountry, lane.originCountry)) return;
      if (!KMRA.axisOk(lt.destinationCountry, lane.destinationCountry)) return;
      // An unmapped method token has no canonical key, so it cannot be joined to anything downstream and is
      // not a recommendable service. It is counted, never guessed at.
      if (!lt.methodKey) return;
      // A row with no usable day figure at all is not transit authority, however well it matches the lane.
      if (!isFinite(lt.avgDays) && !isFinite(lt.maxDays) && !isFinite(lt.minDays)) return;
      var key = lt.methodKey + '|' + low(lt.lastMileDelivery);
      var p = byKey[key];
      if (!p) {
        p = byKey[key] = {
          profile_key: key,
          shipping_method: lt.shippingMethod, method_key: lt.methodKey,
          last_mile_delivery: lt.lastMileDelivery,
          min_days: null, avg_days: null, max_days: null,
          carrier_ids: [], row_count: 0,
          // Stated on every profile so it cannot be read as a carrier decision by omission.
          carrier_selection: 'DEFERRED_TO_WEEKLY_SHIPPING_PLAN'
        };
        out.push(p);
      }
      p.row_count++;
      var cid = s(lt.carrierId);
      if (cid && p.carrier_ids.indexOf(cid) === -1) p.carrier_ids.push(cid);
      // CONSERVATIVE FOLD across carriers. max and avg take the SLOWEST value on offer, so adding a fast
      // carrier can never make a profile look safer than its slowest member; min takes the fastest purely
      // because it is display-only and is never consulted by the verdict.
      if (isFinite(lt.maxDays)) p.max_days = (p.max_days == null) ? lt.maxDays : Math.max(p.max_days, lt.maxDays);
      if (isFinite(lt.avgDays)) p.avg_days = (p.avg_days == null) ? lt.avgDays : Math.max(p.avg_days, lt.avgDays);
      if (isFinite(lt.minDays)) p.min_days = (p.min_days == null) ? lt.minDays : Math.min(p.min_days, lt.minDays);
    });
    out.forEach(function (p) { p.carrier_ids.sort(); });
    out.sort(function (a, b) { return a.profile_key < b.profile_key ? -1 : (a.profile_key > b.profile_key ? 1 : 0); });
    return out;
  }

  // The days the verdict is allowed to use: the slow tail. avg is the fallback ONLY when a row carries no max,
  // and that substitution is reported (`basis`) rather than made silently.
  function conservativeBasis(p) {
    if (p.max_days != null && isFinite(p.max_days)) return { days: p.max_days, basis: 'max_days' };
    if (p.avg_days != null && isFinite(p.avg_days)) return { days: p.avg_days, basis: 'avg_days_no_max_recorded' };
    return { days: null, basis: 'NONE' };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // THE RECOMMENDATION.
  //
  // input = { leadTimes, lane:{originCountry,destinationCountry}, daysUntilStockout, buffer:{days, source,
  //           provisional, byMethod}, requiredByDate?, shipDate? }
  //
  // The DEFAULT recommendation is the SLOWEST option that still preserves the buffer. Not the fastest — a plan
  // that always picks air burns money it was never asked to spend — and not "the cheapest", which this module
  // has no evidence for and must not claim: it never reads a rate card. Slowest-safe is a decision made on
  // transit evidence alone, and it is the one that leaves the most room for Layer 2 to find a good price.
  // ---------------------------------------------------------------------------------------------------------------
  function recommend(input) {
    input = isObj(input) ? input : {};
    var lane = input.lane || {};
    var buf = input.buffer || {};
    var bufferDays = num(buf.days);
    if (!isFinite(bufferDays) || bufferDays < 0) bufferDays = 0;
    // A MISSING date is not a date of zero. `Number(null)` is 0 and `Number('')` is 0, so coercing first would
    // read "no required-arrival date supplied" as "the shortage is today" and call every method unsafe — an
    // invented urgency, which is the same class of error as an invented ETA. Absence is checked BEFORE coercion.
    var dus = (input.daysUntilStockout === null || input.daysUntilStockout === undefined
      || input.daysUntilStockout === '') ? NaN : num(input.daysUntilStockout);
    var profiles = serviceProfiles(input.leadTimes, lane);

    var out = {
      lane: { origin_country: s(lane.originCountry), destination_country: s(lane.destinationCountry) },
      // Recorded so a reader can confirm the axis is absent rather than merely unmentioned.
      marketplace_used_in_lead_time_join: false,
      days_until_stockout: isFinite(dus) ? dus : null,
      required_by_date: s(input.requiredByDate) || null,
      ship_date: s(input.shipDate) || null,
      buffer_days: bufferDays,
      buffer_source: s(buf.source) || null,
      buffer_provisional: buf.provisional === true,
      safety_rule: 'SAFE requires max_days + buffer_days < days_until_stockout (strict). min_days is display-only and is never consulted.',
      profile_count: profiles.length,
      options: [],
      recommended: null,
      alternatives: [],
      status: METHOD_STATUS.MANUAL_REVIEW_REQUIRED,
      review_reason: null,
      // Layer 2's job, stated here so its absence is never mistaken for a decision made.
      carrier_selection: 'DEFERRED_TO_WEEKLY_SHIPPING_PLAN'
    };

    if (!profiles.length) {
      out.review_reason = METHOD_REVIEW_REASONS.NO_LEAD_TIME_AUTHORITY_FOR_LANE;
      return out;
    }
    if (!isFinite(dus)) {
      // Every profile is still reported — the operator can choose one by hand — but nothing is called safe
      // without a date to be safe against, and no arrival is invented.
      out.options = profiles.map(function (p) {
        var cb = conservativeBasis(p);
        return option(p, cb, bufferDays, null);
      });
      out.alternatives = out.options.slice();
      out.review_reason = METHOD_REVIEW_REASONS.NO_REQUIRED_ARRIVAL_DATE;
      return out;
    }

    out.options = profiles.map(function (p) { return option(p, conservativeBasis(p), bufferDays, dus); });
    var safe = out.options.filter(function (o) { return o.risk === RISK.SAFE; });

    if (!safe.length) {
      // Nothing arrives in time even optimistically-but-honestly. The AI Plan does NOT pick the least-bad
      // option and call it a recommendation; it hands the operator the ranked evidence and says so.
      out.review_reason = METHOD_REVIEW_REASONS.NO_SAFE_METHOD_WITHIN_BUFFER;
      out.alternatives = rank(out.options);
      return out;
    }

    // Slowest safe wins: the largest conservative transit that still clears the shortage date.
    var ranked = safe.slice().sort(function (a, b) {
      if (a.conservative_transit_days !== b.conservative_transit_days) return b.conservative_transit_days - a.conservative_transit_days;
      return a.profile_key < b.profile_key ? -1 : 1;      // deterministic; never row order
    });
    out.recommended = ranked[0];
    out.status = METHOD_STATUS.AUTO_RECOMMENDED;
    out.alternatives = rank(out.options.filter(function (o) { return o.profile_key !== out.recommended.profile_key; }));
    return out;
  }

  function option(p, cb, bufferDays, dus) {
    var cons = (cb.days == null) ? null : (cb.days + bufferDays);
    var headroom = (cons == null || dus == null) ? null : (dus - cons);
    var avgPlus = (p.avg_days == null || !isFinite(p.avg_days)) ? null : (p.avg_days + bufferDays);
    var risk;
    if (dus == null || cons == null) risk = null;
    else if (cons < dus) risk = RISK.SAFE;
    else if (avgPlus != null && avgPlus < dus) risk = RISK.TIGHT;
    else risk = RISK.UNSAFE;
    return {
      profile_key: p.profile_key,
      shipping_method: p.shipping_method, method_key: p.method_key,
      last_mile_delivery: p.last_mile_delivery,
      min_days: p.min_days, avg_days: p.avg_days, max_days: p.max_days,
      transit_basis: cb.basis,
      buffer_days: bufferDays,
      conservative_transit_days: cons,
      arrival_headroom_days: headroom,
      risk: risk,
      // Provenance, never a selection. `carrier_ids` says which rows produced these days.
      carrier_ids: p.carrier_ids.slice(), lead_time_row_count: p.row_count,
      carrier_selection: 'DEFERRED_TO_WEEKLY_SHIPPING_PLAN',
      // This module reads no rate card, so it states the absence rather than leaving a reader to assume one.
      estimated_cost: null, cost_basis: 'NOT_EVALUATED_IN_AI_PLAN'
    };
  }

  // SAFE first, then TIGHT, then UNSAFE; within a band the largest headroom first, ties broken on the key.
  var BAND = { SAFE: 0, TIGHT: 1, UNSAFE: 2 };
  function rank(options) {
    return options.slice().sort(function (a, b) {
      var ba = BAND[a.risk] === undefined ? 3 : BAND[a.risk];
      var bb = BAND[b.risk] === undefined ? 3 : BAND[b.risk];
      if (ba !== bb) return ba - bb;
      var ha = a.arrival_headroom_days == null ? -Infinity : a.arrival_headroom_days;
      var hb = b.arrival_headroom_days == null ? -Infinity : b.arrival_headroom_days;
      if (ha !== hb) return hb - ha;
      return a.profile_key < b.profile_key ? -1 : 1;
    });
  }

  // The buffer for one method, from the caller's config authority. Per-method overrides are matched on the
  // CANONICAL key so a config written as "Sea" and a lead-time row written as "sea freight" agree.
  function bufferFor(config, methodKey) {
    config = isObj(config) ? config : {};
    var byMethod = isObj(config.by_method) ? config.by_method : {};
    var d = num(config.default_days);
    if (!isFinite(d) || d < 0) d = 0;
    var src = 'default_days';
    var k = (KMRA && typeof KMRA.canonicalMethodKey === 'function') ? KMRA.canonicalMethodKey(methodKey) : s(methodKey);
    for (var name in byMethod) {
      if (!Object.prototype.hasOwnProperty.call(byMethod, name)) continue;
      var nk = (KMRA && typeof KMRA.canonicalMethodKey === 'function') ? KMRA.canonicalMethodKey(name) : s(name);
      if (nk && k && nk === k) {
        var v = num(byMethod[name]);
        if (isFinite(v) && v >= 0) { d = v; src = 'by_method:' + name; }
        break;
      }
    }
    // R6 §1 — the UNIT travels with the number. `days_until_stockout` is a difference between two calendar
    // dates and a lead-time row states calendar days, so a buffer expressed in anything else would be added
    // to two calendar quantities and quietly shorten itself. A config that does not say is read as calendar
    // days, which is the only unit the comparison is valid in.
    return { days: d, source: src, provisional: config.provisional === true,
      calendar: s(config.calendar) || 'calendar_days' };
  }

  return {
    VERSION: 'kmmr-r6-1',
    METHOD_STATUS: METHOD_STATUS,
    METHOD_REVIEW_REASONS: METHOD_REVIEW_REASONS,
    RISK: RISK,
    serviceProfiles: serviceProfiles,
    conservativeBasis: conservativeBasis,
    recommend: recommend,
    bufferFor: bufferFor
  };
});
