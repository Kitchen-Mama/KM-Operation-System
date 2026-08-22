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
    if (!kmra || typeof kmra.laneCards !== 'function') return blocked('ROUTE_METHOD_UNRESOLVED');
    var routeQuery = { originCountry: originCountry, destinationCountry: destCountry, marketplace: destKind === 'MARKETPLACE' ? destMarketplace : '' };
    var lane = kmra.laneCards(routeQuery, input.rateCards, { asOfOrdinal: asOf });
    if (!lane.length) return blocked('ROUTE_METHOD_UNRESOLVED');

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
      var ovLane = lane.filter(function (dto) { return low(dto.shippingMethod) === low(override.shipping_method) && (s(override.last_mile_delivery) === '' || low(dto.lastMileDelivery) === low(override.last_mile_delivery)); });
      if (!ovLane.length) return blocked('OVERRIDE_INVALID');
      var ovLm = resolveLastMile(ovLane, override.last_mile_delivery);
      if (ovLm.block) return blocked(ovLm.block);
      return okRoute(srcId, destKind, destWarehouseId, destMarketplace, s(override.shipping_method), ovLm.value, { override: true });
    }

    // build candidate methods (distinct shippingMethod) with cost + on-time evidence. The lane is NON-EMPTY, so ≥1
    // VALID (manual) method exists — the only question (F1-7N-FA-3C-R6F2C, E) is whether the AI has enough evidence
    // to AUTO-RANK. A visible-but-unrankable method is MANUAL_ONLY / ROUTE_AUTO_RANKING_INSUFFICIENT, never the
    // "no method exists" token ROUTE_METHOD_UNRESOLVED (which is reserved for an EMPTY lane, above).
    var byMethod = {}, order = [];
    lane.forEach(function (dto) { var mkey = low(dto.shippingMethod); if (!mkey) return; if (!byMethod[mkey]) { byMethod[mkey] = { method: s(dto.shippingMethod), label: s(dto.shippingMethodLabel) || s(dto.shippingMethod), cards: [] }; order.push(mkey); } byMethod[mkey].cards.push(dto); });
    var candidates = order.map(function (mk) {
      var g = byMethod[mk];
      var days = leadDaysFor(g.method, '');
      var c0 = g.cards[0];
      return { method: g.method, label: g.label, days: days, onTime: onTime(days), cost: estCost(c0), currency: s(c0.currency), chargeType: low(c0.chargeType), chargeUnit: low(c0.chargeUnit), card: c0 };
    });
    var manualOptions = candidates.map(function (c) { return { value: c.method, label: c.label }; }).sort(function (a, b) { return a.label < b.label ? -1 : (a.label > b.label ? 1 : 0); });

    var onTimeCands = candidates.filter(function (c) { return c.onTime === true; });
    var anyDays = candidates.some(function (c) { return c.days != null; });
    if (!onTimeCands.length) {
      var fastest = candidates.slice().filter(function (c) { return c.days != null; }).sort(function (a, b) { return a.days - b.days; })[0] || null;
      return manualOnly(anyDays ? 'NO_ON_TIME' : 'NO_LEAD_TIME', manualOptions, candidates.map(evi), fastest);
    }
    // among on-time, cost is comparable ONLY across one currency+chargeType+chargeUnit; else the AI cannot rank (manual valid).
    var currencies = uniq(onTimeCands.map(function (c) { return c.currency; }).filter(Boolean));
    var units = uniq(onTimeCands.map(function (c) { return c.chargeType + '|' + c.chargeUnit; }));
    if (currencies.length > 1 || units.length > 1) return manualOnly('COST_NOT_COMPARABLE', manualOptions, onTimeCands.map(evi), null);
    var priced = onTimeCands.filter(function (c) { return isFinite(c.cost); });
    var chosen;
    if (!priced.length) { chosen = onTimeCands.slice().sort(function (a, b) { return a.method < b.method ? -1 : (a.method > b.method ? 1 : 0); })[0]; }
    else { chosen = priced.slice().sort(function (a, b) { return a.cost !== b.cost ? a.cost - b.cost : (a.method < b.method ? -1 : 1); })[0]; }

    // (4) LAST-MILE — must be valid for the chosen destination + method. 1 match → choose; 0/multi → BLOCK.
    var lm = resolveLastMile(byMethod[low(chosen.method)].cards, '');
    if (lm.block) return blocked(lm.block);
    var autoRankable = onTimeCands.map(function (c) { return { method: c.method, days: c.days, cost: c.cost, currency: c.currency }; });
    return okRoute(srcId, destKind, destWarehouseId, destMarketplace, chosen.method, lm.value,
      { cost: chosen.cost, currency: chosen.currency, days: chosen.days },
      { status: 'AI_RANKED', manual_method_options: manualOptions, auto_rankable_methods: autoRankable });

    function blocked(tok) { return { ok: false, block: tok, route_candidate_status: 'BLOCKED' }; }
    // MANUAL_ONLY — a valid manual method exists but the AI lacks evidence to auto-rank (no lead time / none on-time /
    // cost not comparable). This is NOT a "no method" block; the scope can still be scoped-READY on its AI-rankable lines.
    function manualOnly(reason, manualOpts, cands, fastest) {
      return { ok: false, block: 'ROUTE_AUTO_RANKING_INSUFFICIENT', route_candidate_status: 'MANUAL_ONLY',
        auto_ranking_insufficient_reason: reason, manual_method_options: manualOpts || [], auto_rankable_methods: [],
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
      manual_method_options: dto.manual_method_options || [{ value: method, label: method }],
      auto_rankable_methods: dto.auto_rankable_methods || [],
      selected_method: method, selected_last_mile: lastMile,
      expected_arrival: eta, estimated_cost: isFinite(ev.cost) ? ev.cost : null, currency: s(ev.currency) };
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
      if (!rl || !rl.route || rl.block) { if (rl && rl.block) blocked.push({ line: rl.line, block: rl.block, advisory: rl.advisory || null, route_candidate_status: rl.route_candidate_status || 'BLOCKED', auto_ranking_insufficient_reason: rl.auto_ranking_insufficient_reason || null, manual_method_options: rl.manual_method_options || [] }); return; }
      var key = routeTuple(rl.route);
      if (!buckets[key]) { buckets[key] = { routeKey: key, route: rl.route, lines: [] }; order.push(key); }
      buckets[key].lines.push(rl.line);
    });
    // deterministic ordinal: sort the complete route tuples (never row order / timestamp / random)
    order.sort();
    var groups = order.map(function (key, i) {
      var b = buckets[key];
      return {
        groupNo: i + 1, routeKey: key,
        header: buildGroupHeader(scope, b.route, i + 1),
        lines: b.lines
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
      // carry the shared Route Candidate DTO fields (G) so partition/preflight/diagnostic all read ONE contract.
      return r.ok
        ? { line: line, route: r.route, destination_kind: destKind, route_candidate_status: r.route_candidate_status, auto_rankable_methods: r.auto_rankable_methods, manual_method_options: r.manual_method_options, expected_arrival: r.expected_arrival, estimated_cost: r.estimated_cost, currency: r.currency }
        : { line: line, block: r.block, destination_kind: destKind, route_candidate_status: r.route_candidate_status, auto_ranking_insufficient_reason: r.auto_ranking_insufficient_reason || null, manual_method_options: r.manual_method_options || [], advisory: r.advisory || null };
    });
    var part = partitionRoutedLines(scope, routed);
    var conservation = checkConservation(input.authorizedBySkuWindow, part.groups, input.sourceCeilingById);
    // flat per-line outcomes (ONE shared contract for stage accounting in the dry assembly + diagnostic + preflight).
    var lineOutcomes = routed.map(function (rl) {
      return {
        source_warehouse_id: rl.line.source_warehouse_id, destination_kind: rl.destination_kind || '',
        route_candidate_status: rl.route_candidate_status || (rl.route ? 'AI_RANKED' : 'BLOCKED'),
        block: rl.block || null, auto_ranking_insufficient_reason: rl.auto_ranking_insufficient_reason || null,
        selected_method: rl.route ? rl.route.recommended_shipping_method : null, expected_arrival: rl.expected_arrival || null
      };
    });
    return { ok: conservation.conserved, groups: part.groups, blocked: part.blocked, conservation: conservation, lineOutcomes: lineOutcomes };
  }

  return {
    VERSION: 'kmwrr-r6f2c-1',
    buildK2GenerationPlan: buildK2GenerationPlan, planLineKey: planLineKey,
    // typed route-candidate outcomes. ROUTE_METHOD_UNRESOLVED = NO eligible method (empty lane); MANUAL_ONLY lines
    // carry ROUTE_AUTO_RANKING_INSUFFICIENT (a valid manual method exists, AI lacks ranking evidence); source
    // multi-pool = ROUTE_SOURCE_MULTI_POOL_UNRESOLVED; a WAREHOUSE dest that isn't a real active warehouse = DESTINATION_UNKNOWN.
    BLOCK_TOKENS: ['ROUTE_SOURCE_UNKNOWN', 'ROUTE_SOURCE_INACTIVE', 'ROUTE_SOURCE_MULTI_POOL_UNRESOLVED',
      'DESTINATION_MISSING', 'DESTINATION_UNKNOWN', 'DESTINATION_INACTIVE',
      'ROUTE_METHOD_UNRESOLVED', 'ROUTE_AUTO_RANKING_INSUFFICIENT', 'ROUTE_NO_ON_TIME_OPTION', 'ROUTE_COST_NOT_COMPARABLE',
      'LAST_MILE_UNRESOLVED', 'LAST_MILE_AMBIGUOUS', 'OVERRIDE_INVALID'],
    ROUTE_CANDIDATE_STATUSES: ['AI_RANKED', 'MANUAL_ONLY', 'BLOCKED'],
    dateToOrdinal: dateToOrdinal, ordinalToDate: ordinalToDate, indexWarehouses: indexWarehouses,
    deriveRoute: deriveRoute, routeTuple: routeTuple,
    partitionRoutedLines: partitionRoutedLines, buildGroupHeader: buildGroupHeader,
    checkConservation: checkConservation
  };
});
