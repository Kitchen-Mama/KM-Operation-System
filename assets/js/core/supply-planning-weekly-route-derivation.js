// Kitchen Mama Operation System — WEEKLY_SHIPPING deterministic ROUTE DERIVATION + K2 partition (KMWRR).
// F1-7N-FA-3C-DRAFT-MODEL-R6F2 (route derivation) · R6F2B (candidate selection delegated to the shared KMRA authority).
// PURE / DETERMINISTIC (no clock, no random, no I/O). Depends ONLY on KMRA (supply-planning-route-authority) for the
// shared candidate-method set + lead-time join; all other logic is self-contained.
// -----------------------------------------------------------------------------
// Supplies the route-derivation authority the Inventory AI Plan needs to generate ONE shipping_allocation_drafts
// header per REAL shipment route/group (K2), with N SKU/window lines under it. It NEVER guesses a value: any
// dimension it cannot resolve from the supplied DB authorities BLOCKS that group (no header/lines) with a token.
//
// Canonical DB authorities (raw snake_case sheet rows; the .gs harvest maps them in verbatim):
//   warehouses:         { warehouse_id, warehouse_code, company, country, warehouse_type, is_active }
//   carrier_rate_cards: { origin_country, destination_country, destination_warehouse_code, marketplace,
//                         shipping_method, last_mile_delivery, currency, charge_type, charge_unit, unit_rate,
//                         min_charge, fuel_surcharge, customs_fee, doc_fee, status, effective_from, effective_to }
//                         — lane is COUNTRY-level (origin_country → destination_country/marketplace), NOT warehouse.
//   carrier_lead_times: { origin_country, destination_country, shipping_method, last_mile_delivery,
//                         min_days, max_days, avg_days } — country lane + method.
// Route context is HEADER-level; a line only owns SKU + window + qty + its own source evidence.

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.weeklyRouteDerivation = api; }
})(this, function () {
  'use strict';

  // F1-7N-FA-3C-R6F2B — the SHARED CANONICAL ROUTE AUTHORITY (KMRA). Candidate-method selection + the lead-time
  // (transit-day) join are OWNED by KMRA so the Inventory AI Plan and the Execution Plan UI cannot diverge. Resolved
  // lazily (Node require → Apps Script bundle global → browser window.KM.routeAuthority). KMWRR keeps only the
  // ranking (on-time → lowest comparable cost → last-mile) OVER the shared candidate set — it never re-derives the set.
  // F1-7N-FC-1B-E3-R4-A2-R1-R5 §2 — the transit-safe method authority, resolved the same three ways as KMRA.
  function getKMMR() {
    try { if (typeof require === 'function') return require('./supply-planning-method-recommendation'); } catch (e) {}
    if (typeof KMMR !== 'undefined' && KMMR) return KMMR;
    try { if (typeof window !== 'undefined' && window.KM && window.KM.methodRecommendation) return window.KM.methodRecommendation; } catch (e2) {}
    return null;
  }
  function getKMRA() {
    try { if (typeof require === 'function') return require('./supply-planning-route-authority'); } catch (e) {}
    if (typeof KMRA !== 'undefined' && KMRA) return KMRA;
    try { if (typeof window !== 'undefined' && window.KM && window.KM.routeAuthority) return window.KM.routeAuthority; } catch (e2) {}
    return null;
  }

  function s(v) { return String(v === undefined || v === null ? '' : v).trim(); }
  function low(v) { return s(v).toLowerCase(); }
  function num(v) { var n = Number(v); return isFinite(n) ? n : NaN; }
  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }

  // ---- pure date math (no clock) — parse 'yyyy-mm-dd' (or the date part of an ISO string) to a day ordinal -----
  function dateToOrdinal(v) {
    var str = s(v); if (!str) return null;
    var m = str.match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    // days-from-civil (Howard Hinnant's algorithm) — deterministic, no Date object.
    y -= mo <= 2 ? 1 : 0;
    var era = Math.floor((y >= 0 ? y : y - 399) / 400);
    var yoe = y - era * 400;
    var doy = Math.floor((153 * (mo + (mo > 2 ? -3 : 9)) + 2) / 5) + d - 1;
    var doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
    return era * 146097 + doe - 719468;
  }
  // inverse (day ordinal → 'yyyy-mm-dd'); deterministic, no Date object — for the shared expected_arrival contract.
  function ordinalToDate(z) {
    if (z == null || !isFinite(z)) return '';
    z += 719468;
    var era = Math.floor((z >= 0 ? z : z - 146096) / 146097);
    var doe = z - era * 146097;
    var yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
    var y = yoe + era * 400;
    var doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
    var mp = Math.floor((5 * doy + 2) / 153);
    var d = doy - Math.floor((153 * mp + 2) / 5) + 1;
    var m = mp + (mp < 10 ? 3 : -9);
    y += (m <= 2 ? 1 : 0);
    return y + '-' + (m < 10 ? '0' + m : m) + '-' + (d < 10 ? '0' + d : d);
  }

  // ---- active-status helpers (schemas differ: warehouses use is_active; carrier rows use a free-text status) ----
  var INACTIVE_STATUS = { inactive: 1, disabled: 1, archived: 1, expired: 1, void: 1, deleted: 1 };
  function statusActive(row) { var st = low(row && row.status); return st === '' ? true : !INACTIVE_STATUS[st]; }
  function whActive(w) {
    if (!w) return false;
    if (w.is_active === false || low(w.is_active) === 'false' || low(w.is_active) === 'no') return false;
    return true;
  }
  function inEffectiveWindow(row, asOfOrdinal) {
    if (asOfOrdinal == null) return true;               // no as-of supplied → do not date-gate
    var from = dateToOrdinal(row.effective_from), to = dateToOrdinal(row.effective_to);
    if (from != null && asOfOrdinal < from) return false;
    if (to != null && asOfOrdinal > to) return false;
    return true;
  }

  // ---- warehouse index -----------------------------------------------------------
  function indexWarehouses(warehouses) {
    var byId = {};
    (warehouses || []).forEach(function (w) { var id = s(w.warehouse_id); if (id) byId[id] = w; });
    return byId;
  }

  // =============================================================================================================
  // deriveRoute — the deterministic per-(source, destination, window) route resolver. Returns
  //   { ok:true, route:{...} }  OR  { ok:false, block:<TOKEN>, advisory?, candidates? }.
  // input = {
  //   source: { warehouse_id },                         // the allocated supply source (id required)
  //   destination: { kind:'WAREHOUSE'|'MARKETPLACE', warehouse_id?, marketplace?, country? },
  //   requiredByDate, shipDate,                          // 'yyyy-mm-dd' (shipDate = deterministic as-of, passed in)
  //   warehousesById,                                    // { id: warehouseRow } (for source/dest country + active)
  //   rateCards: [...], leadTimes: [...],                // raw authority rows
  //   override: { shipping_method?, last_mile_delivery? }
  // }
  // BLOCK tokens: ROUTE_SOURCE_INACTIVE · ROUTE_SOURCE_UNKNOWN · DESTINATION_MISSING · DESTINATION_INACTIVE ·
  //   ROUTE_METHOD_UNRESOLVED · ROUTE_NO_ON_TIME_OPTION · ROUTE_COST_NOT_COMPARABLE · LAST_MILE_UNRESOLVED ·
  //   LAST_MILE_AMBIGUOUS · OVERRIDE_INVALID.
  // =============================================================================================================
  function deriveRoute(input) {
    input = isObj(input) ? input : {};
    var whById = input.warehousesById || indexWarehouses(input.warehouses);
    var override = input.override || {};
    var asOf = dateToOrdinal(input.shipDate);

    // (1) SOURCE — must exist + be active; identity is the warehouse_id (never a display label). A genuine multi-pool
    // line (no single winning source) is a TRUTHFUL distinct block (F1-7N-FA-3C-R6F2C), never a fabricated source.
    var srcId = s(input.source && input.source.warehouse_id);
    if (!srcId) return blocked((input.source && input.source.multi_pool) ? 'ROUTE_SOURCE_MULTI_POOL_UNRESOLVED' : 'ROUTE_SOURCE_UNKNOWN');
    var srcWh = whById[srcId];
    if (!srcWh) return blocked('ROUTE_SOURCE_UNKNOWN');
    if (!whActive(srcWh)) return blocked('ROUTE_SOURCE_INACTIVE');
    var originCountry = s(srcWh.country);

    // (2) DESTINATION — a concrete WAREHOUSE must resolve to ONE ACTIVE warehouse row; else a deterministic logical
    // MARKETPLACE token; else BLOCK. F1-7N-FA-3C-R6F2C: a WAREHOUSE id that is NOT a real active warehouse now BLOCKS
    // (DESTINATION_UNKNOWN) instead of silently "resolving" (the false destination_resolved=171 metric) — a string
    // that merely looks like a warehouse id is never auto-resolved.
    var dest = input.destination || {};
    var destKind, destWarehouseId = '', destMarketplace = '', destCountry = s(dest.country), destWhCode = '';
    if (low(dest.kind) === 'warehouse') {
      destWarehouseId = s(dest.warehouse_id);
      if (!destWarehouseId) return blocked('DESTINATION_MISSING');
      var destWh = whById[destWarehouseId];
      if (!destWh) return blocked('DESTINATION_UNKNOWN');
      if (!whActive(destWh)) return blocked('DESTINATION_INACTIVE');
      destCountry = destCountry || s(destWh.country); destWhCode = s(destWh.warehouse_code);
      destKind = 'WAREHOUSE';
    } else if (low(dest.kind) === 'marketplace') {
      destMarketplace = s(dest.marketplace);
      if (!destMarketplace) return blocked('DESTINATION_MISSING');
      destKind = 'MARKETPLACE';
    } else {
      return blocked('DESTINATION_MISSING');
    }

    // (3) SHIPPING METHOD — the CANDIDATE set is owned by the shared KMRA authority (identical predicate to the
    // Execution Plan UI method dropdown: origin_country → destination_country → marketplace, blank card axis = wildcard,
    // non-blank card axis matched exactly; status + effective window). KMWRR then RANKS within that set (on-time →
    // lowest COMPARABLE cost → last-mile). A manual override is validated against the SAME shared set. KMRA returns
    // NORMALIZED camelCase DTOs (shippingMethod / lastMileDelivery / unitRate / minCharge / currency / chargeType /
    // chargeUnit); the lead-time (transit-day) join is KMRA's too, so AI-Plan ETA == Execution-Plan ETA.
    var kmra = getKMRA();
    if (!kmra || typeof kmra.laneCards !== 'function') return blocked('ROUTE_METHOD_UNRESOLVED', 'KMRA_UNAVAILABLE');
    var routeQuery = { originCountry: originCountry, destinationCountry: destCountry, marketplace: destKind === 'MARKETPLACE' ? destMarketplace : '' };
    var lane = kmra.laneCards(routeQuery, input.rateCards, { asOfOrdinal: asOf });
    // ============================================================================================================
    // F1-7N-FC-1B-E3-R4-A2-R1-R5 §2/§7 — A PRICE LIST WAS DECIDING WHETHER A METHOD EXISTED.
    //
    // `laneCards` reads carrier_rate_cards, and this function refused here before it had ever consulted a
    // lead time. So the METHOD — a transit fact — was gated on commercial data, and gated through the
    // marketplace axis that rate cards carry and lead times do not. Measured: KMRA.eligibleMethods over zero
    // rate cards returns [], while KMRA.leadDays answers CN->US Sea/Truck with no marketplace anywhere in the
    // question. That is how a marketplace-independent fact came to look marketplace-specific.
    //
    // The rate card is now ENRICHMENT: when the lane has cards, they are the candidate set exactly as before
    // (cost is comparable and the ranking is unchanged). When it has none, the candidates come from the
    // TRANSIT authority instead, priced at null and labelled as such. A route derived this way is still a
    // COMPLETE route — source, destination, method and last-mile are all present, and cost has never been a
    // header field — so nothing schema-invalid becomes writable. What changes is only that a missing price
    // list no longer erases a method that demonstrably exists.
    var methodSource = 'RATE_CARD';
    var candidates = lane;
    if (!lane.length) {
      var kmmr = getKMMR();
      var profiles = (kmmr && typeof kmmr.serviceProfiles === 'function')
        ? kmmr.serviceProfiles(input.leadTimes, { originCountry: originCountry, destinationCountry: destCountry })
        : [];
      if (profiles.length) {
        methodSource = 'LEAD_TIME_AUTHORITY';
        // Shaped like a rate-card DTO so the ranking below is untouched, with every commercial field ABSENT
        // rather than defaulted: an unpriced candidate must never sort as if it were free.
        candidates = profiles.map(function (p) {
          return { rateCardId: '', carrierId: '', shippingMethod: p.shipping_method,
            shippingMethodLabel: p.shipping_method, lastMileDelivery: p.last_mile_delivery,
            currency: '', unitRate: NaN, minCharge: NaN, chargeType: '', chargeUnit: '',
            originCountry: originCountry, destinationCountry: destCountry, marketplace: '' };
        });
      }
    }
    if (!candidates.length) {
      // F1-7N-FA-3C-R6F2D (D) — TYPE the no-method cause precisely (never a generic bucket when a cause is known):
      // no card for the lane at all vs cards exist for the lane but were inactive / outside the effective window vs the
      // matching cards carry no shipping_method token.
      var relaxed = (input.rateCards || []).map(kmra.normalizeRateCard).filter(function (dto) { return kmra.cardMatchesRoute(dto, routeQuery); });
      // §2 (R5) — with the rate card no longer able to supply a method, reaching here means NEITHER
      // authority covers the lane. The rate-card sub-types are still reported when cards exist, because
      // "the card expired" and "there is no transit authority" send a reader to different tables; but the
      // primary cause is now the missing TRANSIT authority, which is what actually blocks a method.
      var reason = !relaxed.length ? 'NO_TRANSIT_AUTHORITY_FOR_LANE'
        : (!relaxed.some(function (dto) { return dto.shippingMethod; }) ? 'NO_CANONICAL_METHOD' : 'CARD_INACTIVE_OR_OUTSIDE_EFFECTIVE_DATE');
      // §7 — the lane key travels with the refusal. Without it a consumer can report that no method
      // resolved but not WHICH origin/destination/marketplace triple had no card.
      var b = blocked('ROUTE_METHOD_UNRESOLVED', reason);
      b.lane_query = { originCountry: routeQuery.originCountry, destinationCountry: routeQuery.destinationCountry,
        marketplace: routeQuery.marketplace, shipDate: s(input.shipDate) };
      b.method_unresolved_candidates = relaxed.slice(0, 10).map(function (dto) {
        return { rateCardId: dto.rateCardId, originCountry: dto.originCountry,
          destinationCountry: dto.destinationCountry, marketplace: dto.marketplace,
          shippingMethod: dto.shippingMethod, status: dto.status,
          effectiveFrom: dto.effectiveFrom, effectiveTo: dto.effectiveTo };
      });
      return b;
    }

    var reqOrd = dateToOrdinal(input.requiredByDate);
    function leadDaysFor(method, lastMile) {
      var r = kmra.leadDays({ originCountry: originCountry, destinationCountry: destCountry, lastMile: lastMile }, input.leadTimes, method, { fallback: true });
      return (r && isFinite(r.days)) ? r.days : null;
    }
    function onTime(days) { return reqOrd == null || asOf == null || days == null ? (days != null) : (asOf + days <= reqOrd); }
    function estCost(dto) {
      // comparable estimate = unitRate (+ minCharge as a floor proxy). Only comparable across identical currency +
      // chargeType + chargeUnit (a per-kg vs per-carton vs flat rate is NOT comparable without shipment dims).
      var r = num(dto.unitRate); var mc = num(dto.minCharge);
      return isFinite(r) ? r : (isFinite(mc) ? mc : NaN);
    }

    // manual override path — the override method must be in the SHARED candidate set (never a fabricated method).
    if (s(override.shipping_method)) {
      var ovLane = candidates.filter(function (dto) { return low(dto.shippingMethod) === low(override.shipping_method) && (s(override.last_mile_delivery) === '' || low(dto.lastMileDelivery) === low(override.last_mile_delivery)); });
      if (!ovLane.length) return blocked('OVERRIDE_INVALID');
      var ovLm = resolveLastMile(ovLane, override.last_mile_delivery);
      if (ovLm.block) return blocked(ovLm.block);
      return okRoute(srcId, destKind, destWarehouseId, destMarketplace, s(override.shipping_method), ovLm.value, { override: true });
    }

    // (3b) F1-7N-FA-3C-R6F2D — THREE parity layers. manual_method_options (the distinct METHOD set the Execution Plan
    // shows) is ALWAYS returned, independent of ranking, so parity compares like-for-like (manual vs manual, never
    // manual vs a post-ranking selected result). AI ranking then operates over ROUTE PAIRS {method,last_mile}; the
    // SELECTED last_mile becomes part of the K2 key/header (distinct last_mile values are NEVER merged into one header).
    var manualSeen = {}, manualOptions = [];
    candidates.forEach(function (dto) { var m = s(dto.shippingMethod); if (!m) return; var mk = low(m); if (manualSeen[mk]) return; manualSeen[mk] = 1; manualOptions.push({ value: m, label: s(dto.shippingMethodLabel) || m }); });
    manualOptions.sort(function (a, b) { return a.label < b.label ? -1 : (a.label > b.label ? 1 : 0); });

    // distinct candidate PAIRS (dedup by method|last_mile; first card is the cost representative).
    var pairSeen = {}, pairs = [];
    candidates.forEach(function (dto) {
      var m = s(dto.shippingMethod); if (!m) return;
      var lmv = s(dto.lastMileDelivery), pk = low(m) + '||' + low(lmv);
      if (pairSeen[pk]) return; pairSeen[pk] = 1;
      var days = leadDaysFor(m, lmv);
      pairs.push({ method: m, last_mile: lmv, days: days, onTime: onTime(days), cost: estCost(dto), currency: s(dto.currency), chargeType: low(dto.chargeType), chargeUnit: low(dto.chargeUnit), tuple: low(m) + '|' + low(lmv) });
    });

    // manual override → validate an EXACT pair. Method-only override with >1 remaining last_mile is an authority gap.
    if (s(override.shipping_method)) {
      var ov = pairs.filter(function (p) { return low(p.method) === low(override.shipping_method) && (s(override.last_mile_delivery) === '' || low(p.last_mile) === low(override.last_mile_delivery)); });
      if (!ov.length) return blocked('OVERRIDE_INVALID');
      if (s(override.last_mile_delivery) === '' && uniq(ov.map(function (p) { return low(p.last_mile); })).length > 1) return authorityRequired(manualOptions, ov.map(pairEvi));
      var ovp = ov[0];
      return okRoute(srcId, destKind, destWarehouseId, destMarketplace, ovp.method, ovp.last_mile, { cost: ovp.cost, currency: ovp.currency, days: ovp.days, override: true }, { status: 'AI_RANKED', manualOptions: manualOptions, aiPairs: [pairEvi(ovp)], selected: pairEvi(ovp) });
    }

    var onTimePairs = pairs.filter(function (p) { return p.onTime === true; });
    var anyDays = pairs.some(function (p) { return p.days != null; });
    if (!onTimePairs.length) {
      var fastest = pairs.slice().filter(function (p) { return p.days != null; }).sort(function (a, b) { return a.days - b.days; })[0] || null;
      return manualOnly(anyDays ? 'NO_ON_TIME' : 'NO_LEAD_TIME', manualOptions, pairs.map(pairEvi), fastest);
    }
    // ai-rankable = on-time pairs WITH transit evidence (cost may be missing).
    var aiPairs = onTimePairs.filter(function (p) { return p.days != null; });
    if (!aiPairs.length) return manualOnly('NO_LEAD_TIME', manualOptions, onTimePairs.map(pairEvi), null);

    // Cost is comparable ONLY across a single currency+chargeType+chargeUnit basis. If PRICED pairs span multiple bases
    // the AI cannot compare cost commercially → MANUAL_ONLY (never auto-pick across incomparable currencies). When a
    // single priced basis exists → rank by cost; when NO pair is priced → rank by transit alone (on-time is the objective).
    var pricedPairs = aiPairs.filter(function (p) { return isFinite(p.cost); });
    var costCurr = uniq(pricedPairs.map(function (p) { return p.currency; }).filter(Boolean));
    var costUnit = uniq(pricedPairs.map(function (p) { return p.chargeType + '|' + p.chargeUnit; }));
    if (pricedPairs.length && (costCurr.length > 1 || costUnit.length > 1)) return manualOnly('COST_NOT_COMPARABLE', manualOptions, aiPairs.map(pairEvi), null);
    var comparableCost = pricedPairs.length > 0;
    function costOf(p) { return isFinite(p.cost) ? p.cost : Infinity; }
    var ranked = aiPairs.slice().sort(function (a, b) {
      if (comparableCost && costOf(a) !== costOf(b)) return costOf(a) - costOf(b);
      if (a.days !== b.days) return a.days - b.days;
      return a.tuple < b.tuple ? -1 : (a.tuple > b.tuple ? 1 : 0);
    });
    var win = ranked[0];
    // top-tie group = pairs commercially INDISTINGUISHABLE from the winner (equal comparable-cost AND equal transit).
    var tieGroup = ranked.filter(function (p) { return p.days === win.days && (!comparableCost || costOf(p) === costOf(win)); });
    if (uniq(tieGroup.map(function (p) { return p.tuple; })).length > 1) return authorityRequired(manualOptions, tieGroup.map(pairEvi));

    return okRoute(srcId, destKind, destWarehouseId, destMarketplace, win.method, win.last_mile, { cost: win.cost, currency: win.currency, days: win.days }, { status: 'AI_RANKED', manualOptions: manualOptions, aiPairs: aiPairs.map(pairEvi), selected: pairEvi(win) });

    function pairEvi(p) { return { method: p.method, last_mile: p.last_mile, days: p.days, cost: isFinite(p.cost) ? p.cost : null, currency: p.currency, onTime: p.onTime }; }
    function blocked(tok, reason) { return { ok: false, block: tok, method_unresolved_reason: reason || null, route_candidate_status: 'BLOCKED', manual_method_options: (typeof manualOptions !== 'undefined' && manualOptions) ? manualOptions : [] }; }
    // LAST_MILE_AMBIGUOUS — ≥2 materially different route pairs are commercially indistinguishable (equal comparable
    // cost AND equal transit); do NOT arbitrarily first-row select. A valid manual/AI-rankable set still exists.
    function authorityRequired(manualOpts, tie) {
      return { ok: false, block: 'LAST_MILE_AMBIGUOUS', route_candidate_status: 'AMBIGUOUS',
        manual_method_options: manualOpts || [], ai_rankable_route_pairs: tie || [], tie_group: tie || [] };
    }
    // MANUAL_ONLY — a valid manual method exists but the AI lacks evidence to auto-rank (no lead time / none on-time).
    function manualOnly(reason, manualOpts, cands, fastest) {
      return { ok: false, block: 'ROUTE_AUTO_RANKING_INSUFFICIENT', route_candidate_status: 'MANUAL_ONLY',
        auto_ranking_insufficient_reason: reason, manual_method_options: manualOpts || [], ai_rankable_route_pairs: [],
        candidates: cands || [], advisory: fastest ? { fastest_method: fastest.method, fastest_days: fastest.days } : null };
    }
    function okRoute(sourceId, dk, dwid, dmk, method, lastMile, ev, dto) {
      dto = dto || {}; ev = ev || {};
      var days = isFinite(ev.days) ? ev.days : null;
      var eta = (days != null && asOf != null) ? ordinalToDate(asOf + days) : '';
      return { ok: true, route: {
        source_warehouse_id: sourceId, destination_kind: dk, destination_warehouse_id: dwid, destination_marketplace: dmk,
        recommended_source_warehouse_id: sourceId, recommended_destination_warehouse_id: dwid,
        recommended_shipping_method: method, recommended_last_mile_delivery: lastMile,
        destination_marketplace: dmk
      }, evidence: ev,
      route_candidate_status: dto.status || 'AI_RANKED',
      manual_method_options: dto.manualOptions || [{ value: method, label: method }],
      ai_rankable_route_pairs: dto.aiPairs || [],
      selected_ai_route: dto.selected || { method: method, last_mile: lastMile },
      auto_rankable_methods: (dto.aiPairs || []).map(function (p) { return { method: p.method, days: p.days, cost: p.cost, currency: p.currency }; }),
      selected_method: method, selected_last_mile: lastMile,
      // §4 (R4) — the TRANSIT DAYS the ranking actually used. `eta` is derived from it and was the only
      // thing returned, so a consumer could see the date and not the number, and § F.4 has asked the census to
      // report `lead_time_days` since E3 without any way to obtain it.
      expected_arrival: eta, transit_days: days,
      // §7 — which authority named this method, so a consumer never has to guess whether a null cost means
      // "free", "not yet compared" or "no rate card exists".
      method_source: methodSource,
      estimated_cost: isFinite(ev.cost) ? ev.cost : null, currency: s(ev.currency),
      cost_basis: methodSource === 'RATE_CARD' ? 'RATE_CARD' : 'NOT_PRICED_NO_RATE_CARD_FOR_LANE' };
    }
  }

  // last-mile resolution over a method's cards: distinct non-blank last_mile values → 1 choose / 0 or >1 BLOCK
  // (an explicit valid override short-circuits upstream). A blank last-mile is a valid single value only if it is the
  // sole option AND the lane genuinely has no last-mile dimension.
  // cards here are NORMALIZED KMRA DTOs (lastMileDelivery), not raw rows.
  function resolveLastMile(cards, override) {
    if (s(override)) {
      var ok = cards.some(function (rc) { return low(rc.lastMileDelivery) === low(override); });
      return ok ? { value: s(override) } : { block: 'OVERRIDE_INVALID' };
    }
    var vals = uniq(cards.map(function (rc) { return s(rc.lastMileDelivery); }).filter(function (v) { return v !== ''; }));
    if (vals.length === 1) return { value: vals[0] };
    if (vals.length === 0) {
      // no last-mile dimension on the lane at all → treat as a single implicit value only if every card is blank
      var allBlank = cards.every(function (rc) { return s(rc.lastMileDelivery) === ''; });
      return allBlank ? { value: '' } : { block: 'LAST_MILE_UNRESOLVED' };
    }
    return { block: 'LAST_MILE_AMBIGUOUS' };
  }

  function evi(c) { return { method: c.method, days: c.days, onTime: c.onTime, cost: c.cost, currency: c.currency }; }
  function uniq(a) { var seen = {}, out = []; (a || []).forEach(function (x) { var k = String(x); if (!seen[k]) { seen[k] = 1; out.push(x); } }); return out; }

  // =============================================================================================================
  // K2 partition + deterministic recommendation_group_no + quantity conservation (Section D).
  // partitionRoutedLines(scope, routedLines) — routedLines = [{ line, route } | { line, block }]. Groups the OK lines
  // by their resolved route tuple, assigns recommendation_group_no = deterministic ordinal 1..N (after sorting the
  // complete route tuples), and returns { groups:[{ groupNo, routeKey, header, lines }], blocked:[{line, block}] }.
  // A blocked line NEVER creates a header/lines. Incompatible routes ALWAYS land in distinct groups.
  // =============================================================================================================
  function routeTuple(route) {
    return [low(route.source_warehouse_id), low(route.destination_kind),
      low(route.destination_warehouse_id), low(route.destination_marketplace),
      low(route.recommended_shipping_method), low(route.recommended_last_mile_delivery)].join('|');
  }
  function partitionRoutedLines(scope, routedLines) {
    scope = scope || {};
    var buckets = {}, order = [], blocked = [];
    (routedLines || []).forEach(function (rl) {
      // F1-7N-FC-1B-E3-R4-A2-R1-R3 §7 — THE SUB-TYPE DIED AT THIS BOUNDARY.
      //
      // deriveRoute already distinguishes NO_CARRIER_CARD_FOR_LANE from CARD_INACTIVE_OR_OUTSIDE_EFFECTIVE_DATE
      // from NO_CANONICAL_METHOD, and R6F2D added that on purpose ("never a generic bucket when a cause is
      // known"). This line carried `auto_ranking_insufficient_reason` through and DROPPED
      // `method_unresolved_reason`, so a ROUTE_METHOD_UNRESOLVED block reached every consumer — the
      // generation's `blocked` list, the census, the preflight — as the bare token with no cause attached.
      // The lane query goes with it, because "which lane" is half of what makes the cause actionable.
      if (!rl || !rl.route || rl.block) { if (rl && rl.block) blocked.push({ line: rl.line, block: rl.block, advisory: rl.advisory || null, route_candidate_status: rl.route_candidate_status || 'BLOCKED', auto_ranking_insufficient_reason: rl.auto_ranking_insufficient_reason || null, method_unresolved_reason: rl.method_unresolved_reason || null, lane_query: rl.lane_query || null, manual_method_options: rl.manual_method_options || [] }); return; }
      var key = routeTuple(rl.route);
      if (!buckets[key]) { buckets[key] = { routeKey: key, route: rl.route, lines: [], evidence: [] }; order.push(key); }
      buckets[key].lines.push(rl.line);
      // F1-7N-FC-1B-E3-R4-A2-R1-R4 §4 — THE ETA HAD NOWHERE TO LIVE, SO NOTHING COULD SEE IT.
      //
      // deriveRoute resolves transit days and computes an arrival date; okRoute returns them; and then they
      // stopped here. The group keeps only `rl.line`, which is the exact-30 write payload by deliberate
      // design, and buildGroupHeader carries route CONTEXT but not the ETA — correctly, because
      // `expected_arrival` is a LINE field in the canonical model and 16_ adopts it only when a save supplies
      // one. So the evidence existed at every step and was readable at none.
      //
      // The measured consequence was not cosmetic: the census reads the arrival date to decide PROCEED, found
      // it blank on a route that had a resolved 4-day lead time, and would have refused a correct activation
      // for a field the plan never had a way to hand it.
      //
      // It is carried as GROUP EVIDENCE, a sibling of `lines` — deliberately NOT merged into the line
      // payload, which would put an AI-computed arrival into a column documented as user-supplied and change
      // what the writer stores. Read-side only.
      buckets[key].evidence.push({ expected_arrival: s(rl.expected_arrival), transit_days: (rl.transit_days == null ? null : num(rl.transit_days)), estimated_cost: (rl.estimated_cost == null ? null : num(rl.estimated_cost)), currency: s(rl.currency), route_candidate_status: s(rl.route_candidate_status), method_source: s(rl.method_source), cost_basis: s(rl.cost_basis) });
    });
    // deterministic ordinal: sort the complete route tuples (never row order / timestamp / random)
    order.sort();
    var groups = order.map(function (key, i) {
      var b = buckets[key];
      // Every line in a bucket shares the complete route tuple, so its evidence must be identical. If it is
      // not, that is reported rather than silently represented by whichever line happened to be first — a
      // first-row-wins pick is exactly the class of defect this file keeps finding.
      var evUniq = uniq((b.evidence || []).map(function (e) { return e.expected_arrival + '|' + e.transit_days + '|' + e.estimated_cost + '|' + e.currency; }));
      var ev0 = (b.evidence || [])[0] || { expected_arrival: '', transit_days: null, estimated_cost: null, currency: '', route_candidate_status: '', method_source: '', cost_basis: '' };
      return {
        groupNo: i + 1, routeKey: key,
        header: buildGroupHeader(scope, b.route, i + 1),
        lines: b.lines,
        route_evidence: { expected_arrival: ev0.expected_arrival, transit_days: ev0.transit_days,
          estimated_cost: ev0.estimated_cost,
          currency: ev0.currency, route_candidate_status: ev0.route_candidate_status,
          method_source: ev0.method_source, cost_basis: ev0.cost_basis,
          line_count: (b.evidence || []).length,
          evidence_uniform: evUniq.length <= 1,
          disagreement: evUniq.length > 1 ? evUniq : null }
      };
    });
    return { groups: groups, blocked: blocked };
  }
  function buildGroupHeader(scope, route, groupNo) {
    return {
      planning_cycle: s(scope.planning_cycle), company: s(scope.company), country: s(scope.country),
      marketplace: s(scope.marketplace), source_page: s(scope.source_page || 'inventory_replenishment'),
      recommended_source_warehouse_id: s(route.recommended_source_warehouse_id),
      recommended_destination_warehouse_id: s(route.recommended_destination_warehouse_id),
      recommended_shipping_method: s(route.recommended_shipping_method),
      recommended_last_mile_delivery: s(route.recommended_last_mile_delivery),
      recommendation_group_no: String(groupNo),
      destination_marketplace: s(route.destination_marketplace)
    };
  }

  // conservation check (Section D): sum of a group's line planned/recommended qty must equal the authorized total for
  // that (sku, window) portion, and no source is over-allocated. checkConservation(authorizedBySkuWindow, groups,
  // sourceCeilingById) — authorizedBySkuWindow = { 'sku|window': qty }; sourceCeilingById = { warehouse_id: ceiling }.
  function checkConservation(authorizedBySkuWindow, groups, sourceCeilingById) {
    authorizedBySkuWindow = authorizedBySkuWindow || {};
    sourceCeilingById = sourceCeilingById || {};
    var allocatedBySkuWindow = {}, allocatedBySource = {}, dupKeys = [], seen = {};
    (groups || []).forEach(function (g) {
      (g.lines || []).forEach(function (l) {
        var sw = low(l.sku) + '|' + low(l.window_code);
        var q = num(l.planned_qty); if (!isFinite(q)) q = num(l.recommended_qty); if (!isFinite(q)) q = 0;
        allocatedBySkuWindow[sw] = (allocatedBySkuWindow[sw] || 0) + q;
        var src = low(g.header.recommended_source_warehouse_id);
        allocatedBySource[src] = (allocatedBySource[src] || 0) + q;
        var dk = g.header.recommendation_group_no + '|' + sw;               // one (sku,window) per group max
        if (seen[dk]) dupKeys.push(dk); else seen[dk] = 1;
      });
    });
    var overAuthorized = [], overSource = [];
    Object.keys(allocatedBySkuWindow).forEach(function (k) {
      var auth = num(authorizedBySkuWindow[k]);
      if (isFinite(auth) && allocatedBySkuWindow[k] - auth > 1e-9) overAuthorized.push({ key: k, allocated: allocatedBySkuWindow[k], authorized: auth });
    });
    Object.keys(allocatedBySource).forEach(function (id) {
      var cap = num(sourceCeilingById[id]);
      if (isFinite(cap) && allocatedBySource[id] - cap > 1e-9) overSource.push({ source_warehouse_id: id, allocated: allocatedBySource[id], ceiling: cap });
    });
    return {
      conserved: overAuthorized.length === 0 && overSource.length === 0 && dupKeys.length === 0,
      over_authorized: overAuthorized, over_source: overSource, duplicate_sku_window_in_group: dupKeys,
      allocated_by_sku_window: allocatedBySkuWindow, allocated_by_source: allocatedBySource
    };
  }

  // =============================================================================================================
  // buildK2GenerationPlan — the end-to-end deterministic WEEKLY_SHIPPING generation plan (Section E, pure). Turns
  // the harvested per-source allocated lines into K2 route-groups ready for the ATOMIC Header+Lines write.
  //   input = { scope, allocatedLines:[{sku, site_sku, window_code, window_start_date, window_end_date,
  //             required_by_date, source_warehouse_id, source_warehouse_code_snapshot, planned_qty, recommended_qty,
  //             units_per_carton, destination:{kind,warehouse_id,marketplace,country}}],
  //             warehouses|warehousesById, rateCards, leadTimes, shipDate,
  //             overridesByKey?:{lineKey:{shipping_method,last_mile_delivery}},
  //             authorizedBySkuWindow?, sourceCeilingById? }
  //   → { ok, groups:[{groupNo, header, lines}], blocked:[{line, block, advisory}], conservation }
  // A blocked line NEVER creates a header/lines. The line objects carried into a group are the exact-30 line fields
  // (route context is on the header). Deterministic + no clock/random.
  // =============================================================================================================
  function planLineKey(l) { return [low(l.sku), low(l.site_sku), low(l.window_code), low(l.source_warehouse_id)].join('|'); }
  function buildK2GenerationPlan(input) {
    input = isObj(input) ? input : {};
    var scope = input.scope || {};
    var whById = input.warehousesById || indexWarehouses(input.warehouses);
    var overrides = input.overridesByKey || {};
    var routed = (input.allocatedLines || []).map(function (al) {
      al = al || {};
      var lineKey = planLineKey(al);
      var r = deriveRoute({
        source: { warehouse_id: al.source_warehouse_id, multi_pool: al.source_multi_pool === true },
        destination: al.destination || {},
        requiredByDate: al.required_by_date, shipDate: input.shipDate,
        warehousesById: whById, rateCards: input.rateCards, leadTimes: input.leadTimes,
        override: overrides[lineKey] || null
      });
      // the exact-30 LINE payload (route context lives on the header; source evidence stays on the line)
      var line = {
        sku: s(al.sku), site_sku: s(al.site_sku), window_code: s(al.window_code),
        window_start_date: s(al.window_start_date), window_end_date: s(al.window_end_date),
        required_by_date: s(al.required_by_date),
        source_warehouse_id: s(al.source_warehouse_id), source_warehouse_code_snapshot: s(al.source_warehouse_code_snapshot),
        planned_qty: al.planned_qty, recommended_qty: al.recommended_qty, units_per_carton: al.units_per_carton
      };
      var destKind = (al.destination && low(al.destination.kind)) === 'marketplace' ? 'MARKETPLACE' : ((al.destination && low(al.destination.kind)) === 'warehouse' ? 'WAREHOUSE' : '');
      // carry the THREE parity layers (G/A) so partition/preflight/diagnostic all read ONE contract.
      return r.ok
        ? { line: line, route: r.route, destination_kind: destKind, route_candidate_status: r.route_candidate_status, manual_method_options: r.manual_method_options, ai_rankable_route_pairs: r.ai_rankable_route_pairs, selected_ai_route: r.selected_ai_route, auto_rankable_methods: r.auto_rankable_methods, expected_arrival: r.expected_arrival, transit_days: (r.transit_days == null ? null : r.transit_days), estimated_cost: r.estimated_cost, currency: r.currency, method_source: r.method_source || null, cost_basis: r.cost_basis || null }
        // F1-7N-FC-1B-E3-R4-A2-R1-R4 §2 — THE LANE QUERY DIED ONE LAYER ABOVE WHERE R3 FIXED IT.
        //
        // R3 found `method_unresolved_reason` being dropped by partitionRoutedLines and fixed it there. In the
        // SAME change deriveRoute began attaching `lane_query` to the refusal, "because a consumer can report
        // that no method resolved but not WHICH origin/destination/marketplace triple had no card". This line
        // is the layer between the two, and it enumerates the fields it carries — so it carried the reason and
        // dropped the lane. partitionRoutedLines then read `rl.lane_query` and found nothing, every round.
        //
        // Measured on the live fixture before this line changed: blocked_lanes = [null] beside a refusal that
        // knew the lane was US -> US / Amazon. An enumerating hand-off is a place a field can be forgotten
        // silently, which is why both halves of one refusal are now listed together.
        : { line: line, block: r.block, destination_kind: destKind, route_candidate_status: r.route_candidate_status, auto_ranking_insufficient_reason: r.auto_ranking_insufficient_reason || null, method_unresolved_reason: r.method_unresolved_reason || null, lane_query: r.lane_query || null, method_unresolved_candidates: r.method_unresolved_candidates || [], manual_method_options: r.manual_method_options || [], ai_rankable_route_pairs: r.ai_rankable_route_pairs || [], advisory: r.advisory || null };
    });
    var part = partitionRoutedLines(scope, routed);
    var conservation = checkConservation(input.authorizedBySkuWindow, part.groups, input.sourceCeilingById);
    var completeness = buildCompleteness(input.authorizedBySkuWindow, part, conservation);
    // flat per-line outcomes (ONE shared contract for stage accounting + the three parity layers).
    var lineOutcomes = routed.map(function (rl) {
      return {
        source_warehouse_id: rl.line.source_warehouse_id, destination_kind: rl.destination_kind || '',
        route_candidate_status: rl.route_candidate_status || (rl.route ? 'AI_RANKED' : 'BLOCKED'),
        block: rl.block || null, auto_ranking_insufficient_reason: rl.auto_ranking_insufficient_reason || null,
        method_unresolved_reason: rl.method_unresolved_reason || null,
        manual_method_options: rl.manual_method_options || [], ai_rankable_route_pairs: rl.ai_rankable_route_pairs || [],
        selected_ai_route: rl.selected_ai_route || null,
        selected_method: rl.route ? rl.route.recommended_shipping_method : null,
        selected_last_mile: rl.route ? rl.route.recommended_last_mile_delivery : null, expected_arrival: rl.expected_arrival || null,
        transit_days: (rl.transit_days == null ? null : rl.transit_days)
      };
    });
    return { ok: conservation.conserved, groups: part.groups, blocked: part.blocked, conservation: conservation,
      completeness: completeness, lineOutcomes: lineOutcomes };
  }

  // =============================================================================================================
  // F1-7N-FC-1B-E3-R4-A2-R1-R4 §4 — "CONSERVED" WAS ANSWERING A NARROWER QUESTION THAN ANYONE READ IT AS.
  //
  // THE LIVE REPORT. suggested 760 · supply allocated 760 · emitted route quantity 0 · route count 0 ·
  // conserved TRUE · blockers [] · outer verdict STOP. Every one of those is individually correct and together
  // they are unreadable, because two different questions were sharing one word.
  //
  // checkConservation asks: did any group take MORE than it was authorized, go negative, or claim one
  // (sku, window) twice? On this fixture no group did any of that — there are no groups. So the honest answer
  // to the question it asks is yes, and the answer a reader takes from `conserved: true` beside a demand of
  // 760 is "the 760 is planned", which is the opposite of the truth.
  //
  // A safety property that reads as a completion property is worse than no property, so the one word becomes
  // THREE, each answerable independently and none able to stand in for another:
  //
  //   supply_allocation_conserved   nothing was over-allocated, went negative, or was claimed twice.
  //                                 THIS is the old `conserved`, unchanged in meaning and still computed by
  //                                 checkConservation. It is a SAFETY property and says nothing about coverage.
  //   route_quantity_conserved      the quantity that reached a route EQUALS the authorized quantity. False
  //                                 whenever anything was authorized and less of it was routed.
  //   fully_routable                every authorized (sku, window) landed in a group with a complete route
  //                                 identity — source, destination and canonical method. False if ANY line
  //                                 blocked, even when everything that did route was conserved.
  //
  // And `unresolved_quantity` is stated as a NUMBER, not implied by a difference the reader must compute. On
  // this fixture: authorized 760, emitted 0, unresolved 760, blockers NO_CARRIER_CARD_FOR_LANE +
  // ROUTE_METHOD_UNRESOLVED. Nothing there can be misread as a finished plan.
  //
  // The blockers travel WITH the numbers, sub-type included, because "760 unresolved" and "no carrier card on
  // the US -> US / Amazon lane" are one finding, and a consumer that had to join them from two places is a
  // consumer that will print the first without the second.
  // =============================================================================================================
  function buildCompleteness(authorizedBySkuWindow, part, conservation) {
    authorizedBySkuWindow = authorizedBySkuWindow || {};
    var authorized = 0, authKeys = [];
    Object.keys(authorizedBySkuWindow).forEach(function (k) {
      var q = num(authorizedBySkuWindow[k]); if (!isFinite(q)) q = 0;
      authorized += q; authKeys.push(k);
    });
    var emitted = 0, routedKeys = {};
    ((part && part.groups) || []).forEach(function (g) {
      (g.lines || []).forEach(function (l) {
        var q = num(l.planned_qty); if (!isFinite(q)) q = num(l.recommended_qty); if (!isFinite(q)) q = 0;
        emitted += q;
        routedKeys[low(l.sku) + '|' + low(l.window_code)] = 1;
      });
    });
    // Blockers keep their sub-type and their lane. A bare token sends the reader to the wrong table.
    var blockers = [], seenB = {};
    ((part && part.blocked) || []).forEach(function (b) {
      var tok = s(b && b.block); if (!tok) return;
      var sub2 = s(b && (b.method_unresolved_reason || b.auto_ranking_insufficient_reason));
      var k = tok + '|' + sub2;
      if (seenB[k]) { seenB[k].quantity += (num(b.line && (b.line.planned_qty != null ? b.line.planned_qty : b.line.recommended_qty)) || 0); return; }
      var entry = { block: tok, reason: sub2 || null, lane_query: (b && b.lane_query) || null,
        quantity: num(b.line && (b.line.planned_qty != null ? b.line.planned_qty : b.line.recommended_qty)) || 0 };
      seenB[k] = entry; blockers.push(entry);
    });
    // The sub-type is listed as a blocker token in its OWN right, because it is the actionable half: an
    // operator acts on "no carrier card for this lane", never on "method unresolved".
    var tokens = [];
    blockers.forEach(function (b) {
      if (b.reason && tokens.indexOf(b.reason) === -1) tokens.push(b.reason);
      if (tokens.indexOf(b.block) === -1) tokens.push(b.block);
    });
    var unroutedKeys = authKeys.filter(function (k) { return !routedKeys[k]; });
    return {
      authorized_quantity: authorized,
      supply_allocated_quantity: authorized,
      emitted_route_quantity: emitted,
      unresolved_quantity: authorized - emitted,
      route_count: ((part && part.groups) || []).length,
      blocked_line_count: ((part && part.blocked) || []).length,
      unrouted_sku_window_keys: unroutedKeys,
      // (1) SAFETY. Unchanged in meaning; it is checkConservation's own verdict, not a restatement of it.
      supply_allocation_conserved: !!(conservation && conservation.conserved),
      // (2) COVERAGE OF QUANTITY. Authorized nothing and routed nothing is conserved; authorized 760 and
      //     routed 0 is not, and no amount of "nothing was over-allocated" makes it so.
      route_quantity_conserved: Math.abs((authorized - emitted)) <= 1e-9,
      // (3) COVERAGE OF IDENTITY. Every authorized (sku, window) reached a group with a complete route, and
      //     nothing blocked. A single blocked line makes this false even when the routed remainder is exact.
      fully_routable: ((part && part.blocked) || []).length === 0 && unroutedKeys.length === 0
        && Math.abs((authorized - emitted)) <= 1e-9,
      blockers: blockers,
      blocker_tokens: tokens
    };
  }

  return {
    VERSION: 'kmwrr-r5-1',
    buildK2GenerationPlan: buildK2GenerationPlan, planLineKey: planLineKey,
    // typed route-candidate outcomes. ROUTE_METHOD_UNRESOLVED = NO eligible method (empty lane), sub-typed by
    // method_unresolved_reason (NO_CARRIER_CARD_FOR_LANE / CARD_INACTIVE_OR_OUTSIDE_EFFECTIVE_DATE / NO_CANONICAL_METHOD);
    // MANUAL_ONLY carries ROUTE_AUTO_RANKING_INSUFFICIENT (valid manual method, AI lacks ranking evidence — NO_ON_TIME /
    // NO_LEAD_TIME / COST_NOT_COMPARABLE); AMBIGUOUS carries LAST_MILE_AMBIGUOUS (≥2 materially different route pairs tie
    // on cost+transit — never first-row selected); source multi-pool = ROUTE_SOURCE_MULTI_POOL_UNRESOLVED; a WAREHOUSE
    // dest that isn't a real active warehouse = DESTINATION_UNKNOWN.
    BLOCK_TOKENS: ['ROUTE_SOURCE_UNKNOWN', 'ROUTE_SOURCE_INACTIVE', 'ROUTE_SOURCE_MULTI_POOL_UNRESOLVED',
      'DESTINATION_MISSING', 'DESTINATION_UNKNOWN', 'DESTINATION_INACTIVE',
      'ROUTE_METHOD_UNRESOLVED', 'ROUTE_AUTO_RANKING_INSUFFICIENT', 'LAST_MILE_AMBIGUOUS', 'OVERRIDE_INVALID'],
    METHOD_UNRESOLVED_REASONS: ['NO_TRANSIT_AUTHORITY_FOR_LANE', 'NO_CARRIER_CARD_FOR_LANE', 'CARD_INACTIVE_OR_OUTSIDE_EFFECTIVE_DATE', 'NO_CANONICAL_METHOD', 'KMRA_UNAVAILABLE'],
    ROUTE_CANDIDATE_STATUSES: ['AI_RANKED', 'MANUAL_ONLY', 'AMBIGUOUS', 'BLOCKED'],
    dateToOrdinal: dateToOrdinal, ordinalToDate: ordinalToDate, indexWarehouses: indexWarehouses,
    deriveRoute: deriveRoute, routeTuple: routeTuple,
    partitionRoutedLines: partitionRoutedLines, buildGroupHeader: buildGroupHeader,
    checkConservation: checkConservation
  };
});
