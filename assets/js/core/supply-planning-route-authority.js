// Kitchen Mama Operation System — SHARED CANONICAL ROUTE AUTHORITY (KMRA).
// F1-7N-FA-3C-DRAFT-MODEL-R6F2B. PURE / DETERMINISTIC / SELF-CONTAINED (no deps, no clock, no random, no I/O).
// -----------------------------------------------------------------------------
// ONE normalized route-candidate authority shared (by a frozen DTO contract) between:
//   (1) the Inventory Execution Plan UI method selector (inventory-replenishment.js `_execRateCardMethods`), and
//   (2) the Inventory AI Plan K2 route derivation (KMWRR / supply-planning-weekly-route-derivation.js).
// The browser does NOT load the bundled cores, so the two runtimes cannot import ONE object at runtime; instead this
// module freezes the CANONICAL RULE, KMWRR consumes it directly, and a contract-parity test asserts the Execution
// Plan predicate produces byte-identical eligible-method sets on shared fixtures (see the R6F2B parity test).
//
// CANONICAL CANDIDATE RULE (identical to the Execution Plan UI, which is the reference):
//   a carrier_rate_cards row is a candidate for a route (originCountry, destinationCountry, marketplace) iff
//     • it is USABLE (status not an explicit inactive token; today/as-of inside effective_from..effective_to), AND
//     • for each of {origin_country, destination_country, marketplace}: the card's value is BLANK (→ wildcard on that
//       axis) OR equals the query value. A NON-BLANK card value must match EXACTLY (never matched away, never fuzzy).
//   A blank QUERY axis does not constrain that axis. This is EP's exact predicate. It NEVER matches "only because
//   country is equal" past a non-blank specific field: a card that names a marketplace/destination applies ONLY there.
//
// NORMALIZATION (frozen; NO fuzzy / substring / nearest-text / first-row / silent-currency-equate):
//   trim · case-insensitive compare · collapsed inner whitespace · canonical warehouse_id · canonical warehouse_code ·
//   an explicit reviewed method-alias map (below). Nothing else.
//
// Canonical DTO (accepts RAW snake_case sheet rows OR normalized camelCase model rows — same output either way):
//   RateCard: { rateCardId, carrierId, originCountry, destinationCountry, destinationWarehouseCode, marketplace,
//               shippingMethod, shippingMethodLabel, methodKey, lastMileDelivery, currency, unitRate, minCharge,
//               chargeType, chargeUnit, status, effectiveFrom, effectiveTo }
//   LeadTime: { leadTimeId, carrierId, originCountry, destinationCountry, shippingMethod, methodKey,
//               lastMileDelivery, minDays, maxDays, avgDays }

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.routeAuthority = api; }
})(this, function () {
  'use strict';

  function s(v) { return String(v === undefined || v === null ? '' : v).replace(/\s+/g, ' ').trim(); }
  function low(v) { return s(v).toLowerCase(); }
  function num(v) { var n = Number(v); return isFinite(n) ? n : NaN; }
  // F1-7N-FC-1B-E3-R4-A2-R1-R5 — A BLANK IS NOT A ZERO, AND FOR A TRANSIT TIME THE DIFFERENCE IS THE WHOLE
  // POINT. `Number('')` and `Number(null)` are both 0 and both pass isFinite, so a carrier_lead_times row with
  // an empty max_days was normalizing to a max transit of ZERO DAYS — an instant delivery that every downstream
  // safety check then believed. Found by a mutation probe whose fixture happened to leave two day columns
  // blank; the profile came back with max_days 0, a 7-day conservative estimate and 83 days of headroom.
  //
  // This is not confined to the AI Plan: leadDays() filters on isFinite(avgDays), so the Execution Plan ETA
  // would have taken the same 0 and dated an arrival for today. An ABSENT figure must be absent.
  function days(v) {
    if (v === null || v === undefined) return NaN;
    if (typeof v === 'string' && v.trim() === '') return NaN;
    return num(v);
  }
  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function pick() { for (var i = 0; i < arguments.length; i++) { var v = arguments[i]; if (v !== undefined && v !== null && String(v) !== '') return v; } return ''; }

  // ---- pure date math (no clock) — parse 'yyyy-mm-dd' (or the date part of an ISO string) to a day ordinal --------
  function dateToOrdinal(v) {
    var str = s(v); if (!str) return null;
    var m = str.match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    y -= mo <= 2 ? 1 : 0;
    var era = Math.floor((y >= 0 ? y : y - 399) / 400);
    var yoe = y - era * 400;
    var doy = Math.floor((153 * (mo + (mo > 2 ? -3 : 9)) + 2) / 5) + d - 1;
    var doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
    return era * 146097 + doe - 719468;
  }

  // ---- active-status + effective window (identical token set to the EP `_execRateCardUsable` deny-list) -----------
  var INACTIVE_STATUS = { inactive: 1, disabled: 1, archived: 1, expired: 1, void: 1, deleted: 1 };
  // MC1 (ITEM III D-5): ONE "active" rule for a rate card, the server's own (17_ shippingRateActive_: status === 'active',
  // and the 17_ importer accepts only active / inactive). A blank or unknown status is NOT active - it used to be here and
  // in the browser registry, so the Execution Plan offered methods no Weekly card could ever price.
  function statusActive(status) { return low(status) === 'active'; }
  function inEffectiveWindow(effectiveFrom, effectiveTo, asOfOrdinal) {
    if (asOfOrdinal == null) return true;                 // no as-of supplied → do not date-gate
    var from = dateToOrdinal(effectiveFrom), to = dateToOrdinal(effectiveTo);
    if (from != null && asOfOrdinal < from) return false;
    if (to != null && asOfOrdinal > to) return false;
    return true;
  }

  // =============================================================================================================
  // REVIEWED METHOD-ALIAS AUTHORITY (E). The canonical lead-time join key for a shipping-method label. This is the
  // SAME reviewed convention the Execution Plan UI already uses (`_irMethodToLeadKey`): a small, enumerated set of
  // buckets matched by an explicit leading token. NOT fuzzy, NOT nearest-text — an unmatched label yields '' (no
  // lead-time key), which fails closed. Every alias is enumerated in METHOD_ALIAS_RULES for the completion report.
  // =============================================================================================================
  var METHOD_ALIAS_RULES = [
    { canonical: 'Air', leadingTokens: ['air'] },
    { canonical: 'Sea Express', leadingTokens: ['sea express'] },   // checked BEFORE 'sea'
    { canonical: 'Sea', leadingTokens: ['sea'] },
    { canonical: 'Courier', leadingTokens: ['express', 'courier'] },
    // F1-7N-FA-3C-R6F2D — RUNTIME-PROVEN (22 carrier_rate_cards + 3 carrier_lead_times rows carry raw method 'truck').
    // Truck is its OWN canonical bucket — NEVER folded into Courier, never fuzzy-matched.
    { canonical: 'Truck', leadingTokens: ['truck'] }
    // Rail / anything else → '' (no lead-time mapping) — deliberately unmapped, never guessed.
  ];
  function canonicalMethodKey(method) {
    var m = low(method); if (!m) return '';
    for (var i = 0; i < METHOD_ALIAS_RULES.length; i++) {
      var toks = METHOD_ALIAS_RULES[i].leadingTokens;
      for (var j = 0; j < toks.length; j++) { if (m.indexOf(toks[j]) === 0) return METHOD_ALIAS_RULES[i].canonical; }
    }
    return '';
  }

  // ---- DTO normalizers (accept raw snake_case OR normalized camelCase) --------------------------------------------
  function normalizeRateCard(raw) {
    raw = isObj(raw) ? raw : {};
    var method = s(pick(raw.shipping_method, raw.shippingMethod));
    return {
      rateCardId: s(pick(raw.rate_card_id, raw.rateCardId)),
      carrierId: s(pick(raw.carrier_id, raw.carrierId)),
      originCountry: s(pick(raw.origin_country, raw.originCountry)),
      destinationCountry: s(pick(raw.destination_country, raw.destinationCountry)),
      destinationWarehouseCode: s(pick(raw.destination_warehouse_code, raw.destinationWarehouseCode)),
      marketplace: s(pick(raw.marketplace, raw.marketplace)),
      batteryType: low(pick(raw.battery_type, raw.batteryType)),   // MC1 (D-2)
      shippingMethod: method,
      shippingMethodLabel: s(pick(raw.shipping_method_label, raw.shippingMethodLabel)) || method,
      methodKey: canonicalMethodKey(method),
      lastMileDelivery: s(pick(raw.last_mile_delivery, raw.lastMileDelivery)),
      currency: s(pick(raw.currency, raw.currency)),
      unitRate: num(pick(raw.unit_rate, raw.unitRate)),
      minCharge: num(pick(raw.min_charge, raw.minCharge)),
      chargeType: low(pick(raw.charge_type, raw.chargeType)),
      chargeUnit: low(pick(raw.charge_unit, raw.chargeUnit)),
      status: s(pick(raw.status, raw.status)),
      effectiveFrom: s(pick(raw.effective_from, raw.effectiveFrom)),
      effectiveTo: s(pick(raw.effective_to, raw.effectiveTo))
    };
  }
  function normalizeLeadTime(raw) {
    raw = isObj(raw) ? raw : {};
    var method = s(pick(raw.shipping_method, raw.shippingMethod));
    return {
      leadTimeId: s(pick(raw.lead_time_id, raw.leadTimeId)),
      carrierId: s(pick(raw.carrier_id, raw.carrierId)),
      originCountry: s(pick(raw.origin_country, raw.originCountry)),
      destinationCountry: s(pick(raw.destination_country, raw.destinationCountry)),
      shippingMethod: method,
      methodKey: canonicalMethodKey(method),
      lastMileDelivery: s(pick(raw.last_mile_delivery, raw.lastMileDelivery)),
      // `days` rather than `num`: a blank column is NO transit authority, never a zero-day transit.
      minDays: days(pick(raw.min_days, raw.minDays)),
      maxDays: days(pick(raw.max_days, raw.maxDays)),
      avgDays: days(pick(raw.avg_days, raw.avgDays))
    };
  }

  function rateCardUsable(card, asOfOrdinal) {
    var dto = card && card.__kmra ? card : normalizeRateCard(card);
    return statusActive(dto.status) && inEffectiveWindow(dto.effectiveFrom, dto.effectiveTo, asOfOrdinal);
  }

  // ---- the shared candidate predicate (EP parity) -----------------------------------------------------------------
  // blank card axis = wildcard; non-blank card axis must equal the (non-blank) query axis. blank query axis = free.
  function axisOk(cardVal, queryVal) {
    var c = low(cardVal), q = low(queryVal);
    if (q === '') return true;          // query does not constrain this axis
    if (c === '') return true;          // card is a wildcard on this axis
    return c === q;                     // both present → must match exactly
  }
  // MC1 (D-2): the battery axis, the SAME rule as 17_ shippingRateMatch_ (:602-604): a lithium SKU uses only lithium_battery
  // cards, any other SKU never uses one. 'unclassified' refuses every card (17_ :596). A query that names no battery class
  // is read as 17_ reads it - not lithium - so a lithium-only card never reaches it (the safe direction; a caller with
  // lithium SKUs must pass batteryType).
  var BATTERY_UNCLASSIFIED = 'unclassified';
  function batteryOk(cardBattery, queryBattery) {
    var q = low(queryBattery), c = low(cardBattery);
    if (q === BATTERY_UNCLASSIFIED) return false;
    return q === 'lithium_battery' ? c === 'lithium_battery' : c !== 'lithium_battery';
  }
  // R15C-EU: the planning-set definition is KMCID's (Node require / Apps Script bundle global / browser window.KM.countryIdentity).
  function getKMCID15e() { try { if (typeof require === 'function') { var k0 = require('./supply-planning-country-identity'); if (k0 && k0.planningSetMembers) return k0; } } catch (e) {} try { if (typeof KMCID !== 'undefined' && KMCID) return KMCID; } catch (e1) {} try { if (typeof window !== 'undefined' && window.KM && window.KM.countryIdentity) return window.KM.countryIdentity; } catch (e2) {} return null; }
  function planningSetMembers(code) { var k = getKMCID15e(); try { return (k && typeof k.planningSetMembers === 'function') ? k.planningSetMembers(code) : null; } catch (e) { return null; } }
  // R15C-EU: a planning-set destination (EU) admits a card / lead time of a MEMBER country (or a blank = every destination); any other
  // destination is the exact axis rule. The row keeps its own country - the set never becomes a country.
  function destinationOk(cardVal, queryVal) { var set = planningSetMembers(queryVal); if (!set) return axisOk(cardVal, queryVal); var c = s(cardVal).toUpperCase(); return c === '' || set.indexOf(c) !== -1; }
  function cardMatchesRoute(dto, query) {
    return axisOk(dto.originCountry, query.originCountry)
      && destinationOk(dto.destinationCountry, query.destinationCountry)   // R15C-EU
      && axisOk(dto.marketplace, query.marketplace)
      // MC1 (D-4): the destination-warehouse axis (blank on the card = any warehouse; blank in the query = not constrained)
      && axisOk(dto.destinationWarehouseCode, query.destinationWarehouseCode)
      && batteryOk(dto.batteryType, query.batteryType);
  }

  // laneCards(query, cards, opts) → the USABLE, route-matching normalized cards (the shared candidate SET). KMWRR
  // ranks within these (on-time + comparable cost + last-mile); the EP UI lists their distinct methods. query =
  // { originCountry, destinationCountry, marketplace }. opts = { asOfOrdinal? , shipDate? }.
  function resolveAsOf(opts) {
    opts = opts || {};
    if (opts.asOfOrdinal !== undefined && opts.asOfOrdinal !== null) return opts.asOfOrdinal;
    if (opts.shipDate) return dateToOrdinal(opts.shipDate);
    return null;
  }
  function laneCards(query, cards, opts) {
    query = query || {}; var asOf = resolveAsOf(opts);
    var out = [];
    (cards || []).forEach(function (raw) {
      var dto = normalizeRateCard(raw);
      if (!rateCardUsable(dto, asOf)) return;
      if (!cardMatchesRoute(dto, query)) return;
      out.push(dto);
    });
    return out;
  }

  // eligibleMethods(query, cards, opts) → distinct [{ value, label }] sorted by label.localeCompare — the EXACT set
  // the Execution Plan UI method dropdown shows for the same route. value = raw shipping_method; label = method label
  // (falls back to value). This is the canonical parity surface (spec G).
  function eligibleMethods(query, cards, opts) {
    var lane = laneCards(query, cards, opts);
    var seen = {}, out = [];
    lane.forEach(function (dto) {
      var value = dto.shippingMethod; if (!value) return;
      var k = value.toLowerCase(); if (seen[k]) return; seen[k] = 1;
      out.push({ value: value, label: dto.shippingMethodLabel || value });
    });
    out.sort(function (a, b) { return a.label.localeCompare(b.label); });
    return out;
  }

  // leadDays(query, leadTimes, method, opts) → { days, source } using the SAME transit-day authority the EP ETA uses
  // (canonical method key + destination country [wildcard on blank] ; avg_days preferred). opts.fallback === true
  // additionally falls back avg→max→min for conservative on-time feasibility (AI Plan may request this).
  function leadDays(query, leadTimes, method, opts) {
    query = query || {}; opts = opts || {};
    var key = canonicalMethodKey(method); if (!key) return { days: null, source: null };
    if (planningSetMembers(query.destinationCountry)) return { days: null, source: 'REGION_DESTINATION_NOT_CHOSEN' };   // R15C-EU: never a set-wide transit
    var rows = (leadTimes || []).map(normalizeLeadTime).filter(function (lt) {
      return lt.methodKey === key
        && axisOk(lt.originCountry, query.originCountry)
        && axisOk(lt.destinationCountry, query.destinationCountry)
        && (s(query.lastMile) === '' || axisOk(lt.lastMileDelivery, query.lastMile));
    });
    if (!rows.length) return { days: null, source: null };
    var withAvg = rows.filter(function (r) { return isFinite(r.avgDays); })[0];
    if (withAvg) return { days: withAvg.avgDays, source: 'avg' };
    if (opts.fallback) {
      var wMax = rows.filter(function (r) { return isFinite(r.maxDays); })[0];
      if (wMax) return { days: wMax.maxDays, source: 'max' };
      var wMin = rows.filter(function (r) { return isFinite(r.minDays); })[0];
      if (wMin) return { days: wMin.minDays, source: 'min' };
    }
    return { days: null, source: null };
  }

  // =============================================================================================================
  // WAREHOUSE RESOLUTION PRIORITY (D). exact warehouse_id → exact ACTIVE warehouse_code within the expected
  // company/country → explicit reviewed alias → otherwise BLOCK. MULTIPLE matches ALWAYS BLOCK. No first-row pick.
  // resolveWarehouse({ id?, code?, company?, country? }, warehouses|indexes, aliasDict?) →
  //   { ok:true, warehouse_id, matched_by } | { ok:false, block: 'WAREHOUSE_UNKNOWN'|'WAREHOUSE_AMBIGUOUS'|'WAREHOUSE_INACTIVE' }
  // =============================================================================================================
  function whActive(w) {
    if (!w) return false;
    var a = low(w.is_active !== undefined ? w.is_active : w.isActive);
    if (a === 'false' || a === 'no' || a === '0') return false;
    if (w.is_active === false || w.isActive === false) return false;
    return true;
  }
  function indexWarehouses(warehouses) {
    var byId = {}, byCode = {};
    (warehouses || []).forEach(function (w) {
      var id = s(w.warehouse_id !== undefined ? w.warehouse_id : w.warehouseId);
      var code = low(w.warehouse_code !== undefined ? w.warehouse_code : w.warehouseCode);
      if (id) byId[id] = w;
      if (code) { (byCode[code] = byCode[code] || []).push(w); }
    });
    return { byId: byId, byCode: byCode };
  }
  function resolveWarehouse(query, warehousesOrIndex, aliasDict) {
    query = query || {};
    var idx = (warehousesOrIndex && warehousesOrIndex.byId) ? warehousesOrIndex : indexWarehouses(warehousesOrIndex);
    aliasDict = aliasDict || {};
    // 1. exact warehouse_id
    var id = s(query.id);
    if (id) {
      var w = idx.byId[id];
      if (!w) return { ok: false, block: 'WAREHOUSE_UNKNOWN' };
      if (!whActive(w)) return { ok: false, block: 'WAREHOUSE_INACTIVE' };
      return { ok: true, warehouse_id: id, matched_by: 'exact_id' };
    }
    // 2. exact ACTIVE warehouse_code within the expected company/country
    var code = low(query.code);
    if (code) {
      var cands = (idx.byCode[code] || []).filter(function (w) {
        if (!whActive(w)) return false;
        var co = low(w.company !== undefined ? w.company : w.company);
        var ct = low(w.country !== undefined ? w.country : w.country);
        if (s(query.company) !== '' && co !== '' && co !== low(query.company)) return false;
        if (s(query.country) !== '' && ct !== '' && ct !== low(query.country)) return false;
        return true;
      });
      if (cands.length === 1) return { ok: true, warehouse_id: s(cands[0].warehouse_id !== undefined ? cands[0].warehouse_id : cands[0].warehouseId), matched_by: 'exact_code' };
      if (cands.length > 1) return { ok: false, block: 'WAREHOUSE_AMBIGUOUS' };
      // 3. explicit reviewed alias (code → canonical warehouse_id)
      var aliasId = s(aliasDict[code] || aliasDict[query.code]);
      if (aliasId && idx.byId[aliasId]) {
        if (!whActive(idx.byId[aliasId])) return { ok: false, block: 'WAREHOUSE_INACTIVE' };
        return { ok: true, warehouse_id: aliasId, matched_by: 'alias' };
      }
      return { ok: false, block: 'WAREHOUSE_UNKNOWN' };
    }
    return { ok: false, block: 'WAREHOUSE_UNKNOWN' };
  }

  return {
    VERSION: 'kmra-r15c-eu-1',
    // date + status primitives
    dateToOrdinal: dateToOrdinal, statusActive: statusActive, batteryOk: batteryOk, inEffectiveWindow: inEffectiveWindow,
    // method alias authority
    METHOD_ALIAS_RULES: METHOD_ALIAS_RULES, canonicalMethodKey: canonicalMethodKey,
    // DTO
    normalizeRateCard: normalizeRateCard, normalizeLeadTime: normalizeLeadTime, rateCardUsable: rateCardUsable,
    // shared candidate authority (EP parity)
    axisOk: axisOk, cardMatchesRoute: cardMatchesRoute, destinationOk: destinationOk, planningSetMembers: planningSetMembers, laneCards: laneCards, eligibleMethods: eligibleMethods,
    // shared transit-day authority
    leadDays: leadDays,
    // warehouse resolution priority
    whActive: whActive, indexWarehouses: indexWarehouses, resolveWarehouse: resolveWarehouse
  };
});
