// Kitchen Mama Operation System — Recommendation Destination + Multi-Warehouse Demand Allocation (Phase F1-4B-E0R).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC building blocks for the authorized Phase-1 decision D-F1-4B-E0R-1..4: when one
// company/country/marketplace demand scope serves MULTIPLE overseas warehouses and the canonical Forecast/Sales
// source has NO warehouse_id dimension, marketplace-level demand is split to each warehouse by an EXPLICIT configured
// fixed ratio (business config, not a formula constant). This module ONLY:
//   • builds the canonical destination DTO/key (MARKETPLACE vs WAREHOUSE; never a fake warehouse identity for Amazon),
//   • reads the ACTIVE allocation rules for a scope (pure; rows injected — no live DB),
//   • validates the ruleset (canonical active same-company warehouse_id; ratios; integer-basis-points total = 10000),
//   • allocates a marketplace-level demand quantity to warehouses via the FROZEN deterministic largest-remainder
//     integer method (§24.7 `supply-planning-allocations.js`; IRMap `_allocateShared` fractional-remainder + stable
//     key) — it REUSES that frozen policy and does NOT invent a rounding policy.
//
// It authors NO business formula (no gap / no recommendedQty / no forecast weight — those stay with the frozen
// owners KMCALC/KMAF/KMPS), never pools destination stock/incoming, never transfers surplus, and performs NO
// DB/clock/RNG/locale/DOM/persistence. Warehouse-level sources are passed through unchanged (never re-split). Same
// input ⇒ identical output; MISSING is never silently 0 (only an explicit source 0 is 0).

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.demandAllocation = api; }
})(this, function () {
  'use strict';

  var BASIS = 10000;                         // 100.00% in integer basis points (deterministic; no float drift)
  var DEST_TYPES = { MARKETPLACE: 1, WAREHOUSE: 1 };

  function s(v) { return String(v === undefined || v === null ? '' : v).trim(); }
  function eqv(a, b) { return s(a).toLowerCase() === s(b).toLowerCase(); }
  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function cmpStr(a, b) { a = s(a); b = s(b); return a < b ? -1 : a > b ? 1 : 0; }
  function truthy(v) { if (v === true) return true; var t = s(v).toLowerCase(); return t === 'true' || t === '1' || t === 'yes' || t === 'y'; }
  function issue(code, message, field, source) { return { code: code, message: message, field: field === undefined ? null : field, source: source === undefined ? null : source }; }
  // finite number in [0,1] → basis points (Math.round); else null. Never coerces a missing value to 0.
  function ratioToBp(v) {
    if (v === '' || v === null || v === undefined) return null;
    if (typeof v !== 'number' && typeof v !== 'string') return null;
    var n = Number(v);
    if (!isFinite(n) || n < 0 || n > 1) return null;
    return Math.round(n * BASIS);
  }
  // finite non-negative integer quantity, else null (MISSING). Explicit 0 → 0.
  function qtyOrNull(v) {
    if (v === '' || v === null || v === undefined) return null;
    var n = Number(v);
    if (!isFinite(n) || n < 0) return null;
    return Math.round(n);
  }

  // ---- Canonical destination DTO/key (D-F1-4B-E0R-1 / §9) --------------------------------------------------
  // MARKETPLACE → destinationRefId = canonical marketplace/site id, warehouseId = null (Amazon FC assigned later).
  // WAREHOUSE   → destinationRefId = canonical warehouse_id, warehouseId = same. Legacy bare destinationWarehouseId
  // normalizes to WAREHOUSE. NEVER a fake warehouse identity for a marketplace; identity is never a display name.
  function buildDestinationDTO(input) {
    input = input || {};
    var company = s(input.company), country = s(input.country), marketplace = s(input.marketplace);
    var marketplaceId = s(input.marketplaceId) || null;
    // legacy normalization: a bare destinationWarehouseId (string) means a WAREHOUSE destination
    var type = s(input.destinationType).toUpperCase();
    var legacyWh = s(input.destinationWarehouseId);
    if (!type) type = legacyWh ? 'WAREHOUSE' : (input.warehouseId ? 'WAREHOUSE' : 'MARKETPLACE');
    if (DEST_TYPES[type] !== 1) type = 'MARKETPLACE';

    if (type === 'WAREHOUSE') {
      var whId = s(input.warehouseId) || legacyWh;
      return {
        destinationType: 'WAREHOUSE', destinationRefId: whId || null,
        destinationCode: s(input.warehouseCode) || null,
        destinationLabel: s(input.warehouseName) || s(input.warehouseCode) || whId || null,
        company: company, country: country, marketplace: marketplace,
        warehouseId: whId || null, marketplaceId: marketplaceId
      };
    }
    // MARKETPLACE (Amazon stays MARKETPLACE — no warehouse identity fabricated)
    var refId = marketplaceId || s(input.marketplaceRefId) || marketplace || null;
    return {
      destinationType: 'MARKETPLACE', destinationRefId: refId,
      destinationCode: s(input.marketplaceCode) || null,
      destinationLabel: s(input.marketplaceDisplayName) || marketplace || refId || null,
      company: company, country: country, marketplace: marketplace,
      warehouseId: null, marketplaceId: marketplaceId
    };
  }
  function destinationKey(dto) {
    dto = dto || {};
    return [s(dto.destinationType), s(dto.company), s(dto.country), s(dto.marketplace), s(dto.destinationRefId)].join('||');
  }

  // ---- Targeted rule reader (pure; rows INJECTED — no live DB) --------------------------------------------
  // Active rule for a scope = same company+country+marketplace, status active, effective period covering the
  // planning period. `effectiveDate` is an injected "YYYY-MM(-DD)" (NEVER a browser clock). Returns the matched
  // active rows (raw), unfiltered by validity — validation is a separate step so conflicts are reported, not hidden.
  function readActiveAllocationRules(rows, scope, effectiveDate) {
    scope = scope || {};
    var ed = s(effectiveDate);
    var out = [];
    (rows || []).forEach(function (r) {
      if (!isObj(r)) return;
      if (scope.company && !eqv(r.company, scope.company)) return;
      if (scope.country && !eqv(r.country, scope.country)) return;
      if (scope.marketplace && !eqv(r.marketplace, scope.marketplace)) return;
      // active only: explicit "active" status or a truthy boolean flag; blank/other → excluded (no silent default)
      var st = s(r.status).toLowerCase();
      if (!(st === 'active' || r.status === true)) return;
      // effective period (inclusive from; exclusive/optional to). Missing bounds = open. ISO strings compare lexically.
      if (ed) {
        var from = s(r.effective_from), to = s(r.effective_to);
        if (from && ed < from) return;
        if (to && ed > to) return;
      }
      out.push(r);
    });
    return out;
  }

  // ---- Ratio validation (D-F1-4B-E0R-3 / §4) --------------------------------------------------------------
  // warehousesById: { warehouse_id → canonical warehouse record } for identity/active/company checks.
  function validateAllocationRules(rules, scope, warehousesById) {
    scope = scope || {}; warehousesById = warehousesById || {};
    var issues = [];
    var active = Array.isArray(rules) ? rules.slice() : [];
    if (active.length === 0) {
      issues.push(issue('DEMAND_ALLOCATION_RULE_NOT_CONFIGURED', 'no active demand-allocation rule for scope', null, 'replenishment_demand_allocation_rules'));
      return { ok: false, warehouses: [], forecastBpTotal: 0, salesBpTotal: 0, issues: issues };
    }
    var seenWh = {}, warehouses = [], fBpTotal = 0, sBpTotal = 0;
    // deterministic order by warehouse_id so validation + downstream are permutation-invariant
    active.sort(function (a, b) { return cmpStr(a.destination_warehouse_id, b.destination_warehouse_id); });
    active.forEach(function (r) {
      var whId = s(r.destination_warehouse_id);
      if (!whId) { issues.push(issue('DESTINATION_WAREHOUSE_INVALID', 'rule missing destination_warehouse_id', 'destination_warehouse_id')); return; }
      if (seenWh[whId]) { issues.push(issue('DEMAND_ALLOCATION_DESTINATION_CONFLICT', 'duplicate active destination warehouse: ' + whId, 'destination_warehouse_id')); return; }
      seenWh[whId] = 1;
      var w = warehousesById[whId];
      if (!w) { issues.push(issue('DESTINATION_WAREHOUSE_INVALID', 'destination_warehouse_id not a canonical warehouse: ' + whId, 'destination_warehouse_id', 'warehouses')); return; }
      if (!truthy(w.is_active !== undefined ? w.is_active : w.isActive)) { issues.push(issue('DESTINATION_WAREHOUSE_INVALID', 'destination warehouse inactive: ' + whId, 'destination_warehouse_id', 'warehouses')); return; }
      if (scope.company && s(w.company) && !eqv(w.company, scope.company)) { issues.push(issue('DESTINATION_WAREHOUSE_INVALID', 'cross-company destination warehouse: ' + whId + ' (' + s(w.company) + ' ≠ ' + s(scope.company) + ')', 'destination_warehouse_id', 'warehouses')); return; }
      var fBp = ratioToBp(r.forecast_allocation_ratio);
      var sBp = ratioToBp(r.sales_allocation_ratio);
      if (fBp === null) { issues.push(issue('DEMAND_ALLOCATION_RATIO_INVALID', 'forecast_allocation_ratio not a number in [0,1]: ' + whId, 'forecast_allocation_ratio')); return; }
      if (sBp === null) { issues.push(issue('DEMAND_ALLOCATION_RATIO_INVALID', 'sales_allocation_ratio not a number in [0,1]: ' + whId, 'sales_allocation_ratio')); return; }
      fBpTotal += fBp; sBpTotal += sBp;
      warehouses.push({ warehouseId: whId, forecastBp: fBp, salesBp: sBp });
    });
    // period overlap ambiguity: >1 active row for the same warehouse in the covering window
    // (duplicate-destination already flags exact dupes; distinct overlapping periods are the period conflict).
    var byWh = {}; (active).forEach(function (r) { var k = s(r.destination_warehouse_id); if (!k) return; (byWh[k] = byWh[k] || []).push(r); });
    Object.keys(byWh).forEach(function (k) {
      if (byWh[k].length > 1) {
        var periods = {};
        byWh[k].forEach(function (r) { periods[s(r.effective_from) + '..' + s(r.effective_to)] = 1; });
        if (Object.keys(periods).length > 1) issues.push(issue('DEMAND_ALLOCATION_PERIOD_CONFLICT', 'overlapping effective periods for warehouse ' + k, 'effective_from', 'replenishment_demand_allocation_rules'));
      }
    });
    if (warehouses.length && fBpTotal !== BASIS) issues.push(issue('DEMAND_ALLOCATION_RATIO_TOTAL_INVALID', 'forecast ratios sum to ' + (fBpTotal / 100) + '% (must be exactly 100%)', 'forecast_allocation_ratio'));
    if (warehouses.length && sBpTotal !== BASIS) issues.push(issue('DEMAND_ALLOCATION_RATIO_TOTAL_INVALID', 'sales ratios sum to ' + (sBpTotal / 100) + '% (must be exactly 100%)', 'sales_allocation_ratio'));
    var ok = issues.length === 0 && warehouses.length > 0;
    return { ok: ok, warehouses: warehouses, forecastBpTotal: fBpTotal, salesBpTotal: sBpTotal, issues: issues };
  }

  // ---- Deterministic integer allocation — FROZEN largest-remainder policy (§24.7 / _allocateShared), §5 -----
  // weights: [{ key, bp }] with Σbp === BASIS. Returns { byKey, total } that conserves `qty` EXACTLY, or null if
  // qty is MISSING (never 0). Leftover units go to the largest fractional remainder; ties break by ascending key.
  function allocateByBasisPoints(qty, weights) {
    var q = qtyOrNull(qty);
    if (q === null) return null;                       // MISSING is not zero
    weights = (weights || []).map(function (w) { return { key: s(w.key), bp: w.bp | 0 }; });
    var byKey = {}, base = 0;
    var ranked = weights.map(function (w) {
      var prod = q * w.bp;                             // integer (q integer, bp integer)
      var b = Math.floor(prod / BASIS);
      byKey[w.key] = b; base += b;
      return { key: w.key, frac: prod % BASIS };       // fractional-remainder ranking key (larger ⇒ higher)
    });
    var leftover = q - base;                            // 0 ≤ leftover < weights.length
    ranked.sort(function (a, b) { return (b.frac - a.frac) || cmpStr(a.key, b.key); });  // largest remainder, then stable key
    for (var i = 0; i < ranked.length && leftover > 0; i++) { byKey[ranked[i].key] += 1; leftover -= 1; }
    return { byKey: byKey, total: q };
  }

  // ---- Demand allocation flow (§6/§7) ---------------------------------------------------------------------
  // Splits a MARKETPLACE-level demand quantity across warehouses by the validated ratio (forecast OR sales basis).
  // A WAREHOUSE-level source is NEVER re-split — pass it through unchanged (§7). kind: 'forecast' | 'sales'.
  function allocateMarketplaceDemand(qty, ruleset, kind) {
    if (!ruleset || ruleset.ok !== true) return { ready: false, byKey: null, issues: (ruleset && ruleset.issues) || [issue('DEMAND_ALLOCATION_RULE_NOT_CONFIGURED', 'ruleset not valid', null)] };
    var bpKey = (s(kind).toLowerCase() === 'sales') ? 'salesBp' : 'forecastBp';
    var weights = ruleset.warehouses.map(function (w) { return { key: w.warehouseId, bp: w[bpKey] }; });
    var res = allocateByBasisPoints(qty, weights);
    if (res === null) return { ready: false, byKey: null, missing: true, issues: [] };   // MISSING demand — not zero
    return { ready: true, byKey: res.byKey, total: res.total, issues: [] };
  }

  // Warehouse-level source passthrough — the caller asserts the quantity is ALREADY warehouse-grained; return it
  // keyed by its canonical warehouse_id with NO split (guards against double-allocation, §7/§28).
  function passthroughWarehouseDemand(warehouseId, qty) {
    var whId = s(warehouseId); var q = qtyOrNull(qty);
    var byKey = {}; if (whId) byKey[whId] = q;   // q may be null (MISSING) — preserved, not zeroed
    return { ready: !!whId, byKey: byKey, split: false };
  }

  // Per-warehouse demand facts (D-F1-4B-E0R-4): allocatedForecastQty + allocatedSalesQty per warehouse. Stock,
  // incoming, gap, recommendedQty are NOT computed here (frozen owners) and are NEVER pooled across warehouses.
  function buildWarehouseDemandFacts(input) {
    input = input || {};
    var ruleset = input.ruleset;
    if (!ruleset || ruleset.ok !== true) return { ready: false, perWarehouse: [], issues: (ruleset && ruleset.issues) || [issue('DEMAND_ALLOCATION_RULE_NOT_CONFIGURED', 'ruleset not valid', null)] };
    var fc = allocateMarketplaceDemand(input.marketplaceForecastQty, ruleset, 'forecast');
    var sa = allocateMarketplaceDemand(input.marketplaceSalesQty, ruleset, 'sales');
    var perWarehouse = ruleset.warehouses.map(function (w) {
      return {
        warehouseId: w.warehouseId,
        allocatedForecastQty: (fc.byKey && Object.prototype.hasOwnProperty.call(fc.byKey, w.warehouseId)) ? fc.byKey[w.warehouseId] : null,
        allocatedSalesQty: (sa.byKey && Object.prototype.hasOwnProperty.call(sa.byKey, w.warehouseId)) ? sa.byKey[w.warehouseId] : null,
        forecastBp: w.forecastBp, salesBp: w.salesBp
      };
    });
    return { ready: true, perWarehouse: perWarehouse, issues: [] };
  }

  // stable canonical rule id (D-F1-4B-E0R / §3): RDAR-{COMPANY}-{COUNTRY}-{MARKETPLACE}-{WAREHOUSE_ID}
  function allocationRuleId(company, country, marketplace, warehouseId) {
    return ['RDAR', s(company), s(country), s(marketplace), s(warehouseId)].join('-');
  }

  function has(o, k) { return isObj(o) && Object.prototype.hasOwnProperty.call(o, k); }
  // Accept an allocation-rule row in EITHER the canonical snake shape OR the DB-normalized camelCase shape
  // (`getReplenishmentDemandAllocationRules` output) — map to the snake shape the reader/validator consume.
  function _toRuleRow(rec) {
    if (!isObj(rec)) return {};
    if (has(rec, 'destination_warehouse_id') || has(rec, 'forecast_allocation_ratio')) return rec;   // already snake
    return {
      allocation_rule_id: rec.allocationRuleId, company: rec.company, country: rec.country, marketplace: rec.marketplace,
      destination_warehouse_id: rec.destinationWarehouseId,
      forecast_allocation_ratio: rec.forecastAllocationRatio, sales_allocation_ratio: rec.salesAllocationRatio,
      status: rec.status, effective_from: rec.effectiveFrom, effective_to: rec.effectiveTo
    };
  }

  // ---- Integration seam (F1-4B-E): provisioned rules → per-warehouse demand facts for the EXISTING runtime ---
  // Composes the frozen primitives above (read active rules → validate → split marketplace Forecast/Sales once →
  // attach the canonical WAREHOUSE destination DTO) into the "Warehouse Forecast" the existing recommendation
  // runtime consumes — ONE independent WAREHOUSE destination per warehouse (A's demand never enters B). Authors
  // NO formula and computes NO gap/recommendedQty (frozen owners). Missing rule → DEMAND_ALLOCATION_RULE_NOT_CONFIGURED
  // (never a default). Accepts rule rows in either snake or DB-normalized shape.
  function resolveScopeWarehouseDemandFacts(input) {
    input = input || {};
    var scope = input.scope || {};
    var whById = input.warehousesById || {};
    var rows = (Array.isArray(input.allocationRules) ? input.allocationRules : []).map(_toRuleRow);
    var active = readActiveAllocationRules(rows, scope, input.effectiveDate);
    var ruleset = validateAllocationRules(active, scope, whById);
    if (!ruleset.ok) return { ready: false, scope: scope, warehouses: [], issues: ruleset.issues };
    var facts = buildWarehouseDemandFacts({ ruleset: ruleset, marketplaceForecastQty: input.marketplaceForecastQty, marketplaceSalesQty: input.marketplaceSalesQty });
    var warehouses = facts.perWarehouse.map(function (w) {
      var wh = whById[w.warehouseId] || {};
      return {
        warehouseId: w.warehouseId,
        destination: buildDestinationDTO({
          destinationType: 'WAREHOUSE', company: scope.company, country: scope.country, marketplace: scope.marketplace,
          marketplaceId: scope.marketplaceId, warehouseId: w.warehouseId,
          warehouseCode: s(wh.warehouse_code || wh.warehouseCode), warehouseName: s(wh.warehouse_name || wh.warehouseName)
        }),
        allocatedForecastQty: w.allocatedForecastQty,
        allocatedSalesQty: w.allocatedSalesQty
      };
    });
    return { ready: true, scope: scope, warehouses: warehouses, issues: [] };
  }

  return {
    BASIS: BASIS,
    buildDestinationDTO: buildDestinationDTO,
    destinationKey: destinationKey,
    readActiveAllocationRules: readActiveAllocationRules,
    validateAllocationRules: validateAllocationRules,
    allocateByBasisPoints: allocateByBasisPoints,
    allocateMarketplaceDemand: allocateMarketplaceDemand,
    passthroughWarehouseDemand: passthroughWarehouseDemand,
    buildWarehouseDemandFacts: buildWarehouseDemandFacts,
    resolveScopeWarehouseDemandFacts: resolveScopeWarehouseDemandFacts,
    allocationRuleId: allocationRuleId,
    // exposed for focused testing of the internal ratio→bp conversion
    _ratioToBp: ratioToBp
  };
});
