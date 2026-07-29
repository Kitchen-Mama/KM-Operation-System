// inventory-compat.js — Inventory Replenishment data/candidate compatibility (System Repair 1)
// ---------------------------------------------------------------------------------------------
// Pure, DOM-free helpers shared by the Inventory Replenishment page. Extracted so the country
// compatibility, weekly-sales aggregation and Execution-Plan warehouse candidate logic can be
// unit-tested deterministically in Node (see assets/js/tests/inventory-compat.test.js) and reused
// from a single central contract instead of scattered per-site branches.
//
// SCOPE / SAFETY (System Repair 1):
//   * This is a READ / COMPARISON layer only. It NEVER rewrites raw source data, DB rows, or the
//     warehouse master. Raw `country` values (e.g. amazon_inventory_snapshot.country = 'GB',
//     amazon_weekly_sales_snapshot.country = 'IT'/'DE'/'ES'/'FR') are preserved verbatim.
//   * There is deliberately NO global normalizeCountry(): country handling is DATASET / CONTEXT
//     aware. `UK` and `GB` are the SAME market (spelling alias). `EU` is an AGGREGATION domain that
//     rolls up the four distinct Amazon EU markets (IT/DE/ES/FR) for WEEKLY SALES ONLY — it is never
//     applied to inventory identity or to warehouse country filtering.
//   * Warehouse classification uses MASTER FIELDS ONLY (warehouse_type, is_factory_warehouse) — never
//     the display name. Canonical warehouse_type ∈ FBA / 3PL / RETURN / FACTORY
//     (DATABASE_RELATIONSHIP_MAP.md §4 warehouses master).
(function (root, factory) {
  var mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (root) { root.IRCountry = mod.IRCountry; root.IRWarehouse = mod.IRWarehouse; root.IRDraft = mod.IRDraft; }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  function up(v) { return String(v == null ? '' : v).trim().toUpperCase(); }
  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function eqv(a, b) { return up(a) === up(b); }

  // ===== Country compatibility (comparison layer only; never a data rewrite) =====

  // Same-market spelling aliases. GB is the ISO code for the United Kingdom; the UI/domain uses UK.
  // These represent ONE logical market — reads accept either spelling; latest-row/dedupe treat them
  // as the same market (never summed).
  var SAME_MARKET_ALIAS = { 'UK': ['UK', 'GB'], 'GB': ['UK', 'GB'] };

  // Sales aggregation domains: a domain country that rolls up multiple DISTINCT source-country
  // markets. Amazon EU weekly sales = IT + DE + ES + FR (each a separate market, summed at the same
  // grain). Used for weekly/daily SALES only — never for inventory identity or warehouse filtering.
  var SALES_AGG = { 'EU': ['IT', 'DE', 'ES', 'FR'] };
  // System Repair 1 Round 2: NO legacy pan-EU (country='EU') fallback. The original Repair 1 contract
  // authorized ONLY the IT+DE+ES+FR aggregation. A raw country='EU' row is preserved in the DB but is
  // NEVER read by this aggregation — if all four member markets are absent, the result is empty/zero
  // (per the existing empty-display contract). No canonical source mandates an EU fallback.

  // Raw source country values compatible with a single-market domain country (spelling alias only;
  // NO aggregation expansion). Inventory + warehouse country matching use this.
  function aliasMembers(country) {
    var c = up(country);
    if (!c) return [];
    return SAME_MARKET_ALIAS[c] ? SAME_MARKET_ALIAS[c].slice() : [c];
  }

  // True when a raw row country belongs to the scope country's single market (alias-aware).
  // Callers keep their own "both non-blank" guard; matches('', x) / matches(x, '') → false.
  function matches(rowCountry, scopeCountry) {
    return aliasMembers(scopeCountry).indexOf(up(rowCountry)) !== -1;
  }

  // ===== WAREHOUSE country compatibility (Round 4 Decision D) — SEPARATE from sales aggregation =====
  // Directional: an Amazon EU AGGREGATE planning context (country='EU') may draw warehouses in the
  // member countries; a country-specific context stays isolated (DE→DE only, etc.). UK≡GB alias.
  // This is a WAREHOUSE-candidate rule ONLY — it must NOT be reused as a sales/inventory aggregation
  // and does NOT re-enable any legacy country='EU' sales fallback.
  var WAREHOUSE_REGION = { 'EU': ['EU', 'DE', 'ES', 'IT', 'FR'] };
  function warehouseCountryMembers(scopeCountry) {
    var c = up(scopeCountry);
    if (!c) return [];
    if (WAREHOUSE_REGION[c]) return WAREHOUSE_REGION[c].slice();
    if (SAME_MARKET_ALIAS[c]) return SAME_MARKET_ALIAS[c].slice();   // UK/GB
    return [c];                                                     // DE/ES/IT/FR/US/CA/AU/JP → self only
  }
  function warehouseCountryMatches(rowCountry, scopeCountry) {
    return warehouseCountryMembers(scopeCountry).indexOf(up(rowCountry)) !== -1;
  }

  // ===== Part A (Round 4): physical 3rd Party Stock breakdown — ONE shared source =====
  // Summary total and the expanded detail MUST use these exact rows. `total = SUM(rows.qty)`.
  // Physical eligible 3PL contributions only (never sitePlanningAvailable / FBA / virtual allocation).
  // Dedupe by warehouse_id so a UK/GB same-market physical row is never counted twice. A legal zero
  // stays a row (qty 0); an empty breakdown yields total 0 with hasRows=false (caller shows No Data /
  // No 3PL by plan.state — never a fallback to the virtual planning value).
  function buildPhysicalThirdPartyBreakdown(plan) {
    var out = { rows: [], total: 0, hasRows: false, state: (plan && plan.state) || '' };
    if (!plan) return out;
    var seen = {};
    (plan.contributions || []).forEach(function (c) {
      var id = String((c && (c.warehouseId || c.warehouse_id)) || '');
      if (id && seen[id]) return;               // UK/GB same physical warehouse → never double-counted
      if (id) seen[id] = true;
      var qty = Number(c && c.qty) || 0;
      out.rows.push({ warehouseId: id, warehouseName: String((c && (c.warehouseName || c.warehouse_name)) || id), qty: qty });
    });
    out.rows.sort(function (a, b) { return (b.qty - a.qty) || String(a.warehouseName).localeCompare(String(b.warehouseName)); });
    out.total = out.rows.reduce(function (s, r) { return s + (Number(r.qty) || 0); }, 0);
    out.hasRows = out.rows.length > 0;
    return out;
  }

  // Sales source set for a scope country: { members:[raw countries], aggregate:bool }.
  // The EU roll-up is applied ONLY in an Amazon EU context (marketplace='Amazon'); a non-Amazon EU
  // context (or any non-Amazon marketplace) is NEVER auto-aggregated (isolation, §6.4). Blank
  // marketplace does not aggregate. UK≡GB alias applies regardless of marketplace. No legacy fallback.
  function salesSourceSet(country, marketplace) {
    var c = up(country);
    var isAmazon = up(marketplace) === 'AMAZON';
    if (isAmazon && SALES_AGG[c]) return { members: SALES_AGG[c].slice(), aggregate: true };
    return { members: aliasMembers(c), aggregate: false };
  }

  // Pure weekly aggregation. rows: [{sku,company,country,marketplace,salesUnits7d,weekEndDate,snapshotWeek}].
  // Returns the scoped sales_units_7d (Number) or null when there is no scoped data:
  //   - single market (alias-aware): latest week's units for that market
  //   - aggregation domain (EU): SUM of each member market's (IT/DE/ES/FR) own latest week; if all
  //     four are absent → null (empty/zero). NO legacy country='EU' fallback is ever read.
  //   - blank scope country: original behavior (latest week across any country)
  // A row with a blank country is accepted under a set scope (matches prior latestSnapshot semantics).
  function weeklyUnits7d(rows, scope) {
    if (!rows || !rows.length) return null;
    scope = scope || {};
    function baseOk(r) {
      if (!eqv(r.sku, scope.sku)) return false;
      if (scope.company && r.company && !eqv(r.company, scope.company)) return false;
      if (scope.marketplace && r.marketplace && !eqv(r.marketplace, scope.marketplace)) return false;
      return true;
    }
    function latest(countries, useFilter) {
      var best = null, bestKey = '';
      rows.forEach(function (r) {
        if (!baseOk(r)) return;
        if (useFilter && r.country && countries.indexOf(up(r.country)) === -1) return;
        var key = String(r.weekEndDate || r.snapshotWeek || '');
        if (!best || key > bestKey) { best = r; bestKey = key; }
      });
      return best ? num(best.salesUnits7d) : null;
    }
    if (!scope.country) return latest([], false);
    var set = salesSourceSet(scope.country, scope.marketplace);
    if (set.aggregate) {
      var total = 0, any = false;
      set.members.forEach(function (c) { var v = latest([c], true); if (v != null) { total += v; any = true; } });
      // NO legacy country='EU' fallback (System Repair 1 Round 2): all four absent → null (empty/zero).
      return any ? total : null;
    }
    return latest(set.members, true);
  }

  // Membership decision for the daily Sales Trend chart. Returns { any:bool, members:[raw countries] }.
  // System Repair 1 Round 2: the EU aggregation domain contributes ONLY its member markets
  // (IT/DE/ES/FR); NO legacy country='EU' fallback is ever read. (rows param retained for signature
  // stability with the page caller.)
  function salesTrendCountries(rows, scope) {
    scope = scope || {};
    if (!scope.country) return { any: true, members: [] };
    var set = salesSourceSet(scope.country, scope.marketplace);
    return { any: false, members: set.members.slice() };
  }

  var IRCountry = {
    up: up, num: num, eqv: eqv,
    aliasMembers: aliasMembers, matches: matches, salesSourceSet: salesSourceSet,
    weeklyUnits7d: weeklyUnits7d, salesTrendCountries: salesTrendCountries
  };

  // ===== Execution Plan warehouse candidate contract (one central rule for every site) =====
  // Canonical warehouse_type ∈ FBA / 3PL / RETURN / FACTORY. Classify by fields, never by name.

  function whType(w) { return up(w && w.warehouseType); }
  function isFactory(w) { return !!(w && (w.isFactoryWarehouse === true || whType(w) === 'FACTORY')); }
  function isOverseas3PL(w) { return whType(w) === '3PL'; }
  function isFBA(w) { return whType(w) === 'FBA'; }
  // STRICT active (System Repair 1 Round 2 — Repair 1 contract `warehouse.is_active = true`).
  // A warehouse is a candidate ONLY when is_active resolves to TRUE under the canonical adapter
  // contract `_whBool` (operation-system-db-api.js:471-479): true / "true" / "yes" / "y" / "1"
  // (case-insensitive) → active. Everything else — false / "false" / "no" / "n" / "0" / 0 / "" /
  // null / undefined / missing field / any unknown value → NOT active (excluded). The same rule
  // applies uniformly to Factory / 3PL / FBA.
  function activeFlag(v) {
    if (v === true) return true;
    if (v === false) return false;
    var s = String(v == null ? '' : v).trim().toLowerCase();
    if (s === 'true' || s === 'yes' || s === 'y' || s === '1') return true;
    return false; // '', 'false', 'no', 'n', '0', unknown → NOT active
  }
  function isActive(w) { return !!(w && w.warehouseId && activeFlag(w.isActive) === true); }

  function dedup(list) {
    var seen = {}, out = [];
    (list || []).forEach(function (w) { var id = String(w.warehouseId); if (!id || seen[id]) return; seen[id] = 1; out.push(w); });
    out.sort(function (a, b) { return String(a.warehouseName || a.warehouseId).localeCompare(String(b.warehouseName || b.warehouseId)); });
    return out;
  }

  // Amazon logical destination token — a UI-only marketplace destination for the Weekly Shipping Plan
  // (NOT a warehouse master row). Serialized as MARKETPLACE_DESTINATION:Amazon:<country>. On save it
  // becomes { marketplace:'Amazon', country, selected_destination_warehouse_id:null }; the real FBA
  // warehouse_id is resolved later at the Shipment-Draft execution stage.
  function amazonLogicalToken(country) { return 'MARKETPLACE_DESTINATION:Amazon:' + up(country); }
  function amazonLogicalDestination(scope) {
    return {
      logicalDestination: true, destinationType: 'MARKETPLACE_DESTINATION',
      warehouseId: null, marketplace: 'Amazon', country: up(scope && scope.country),
      warehouseName: 'Amazon', token: amazonLogicalToken(scope && scope.country)
    };
  }
  // Parse a saved value back to a persistence payload fragment.
  function resolveDestinationPayload(value, scope) {
    if (typeof value === 'string' && value.indexOf('MARKETPLACE_DESTINATION:') === 0) {
      var parts = value.split(':');
      return { marketplace: 'Amazon', country: up(parts[2] || (scope && scope.country)), selected_destination_warehouse_id: null };
    }
    return { selected_destination_warehouse_id: (value == null || value === '') ? null : String(value) };
  }

  // Build From/To candidates for the WEEKLY SHIPPING PLAN / Execution Plan (planning level).
  // scope: { company, country, marketplace }. Returns { from, to, isAmazon }.
  // Round 4 authoritative contract (Decisions B/C/D — supersede Round 2 for the planning level):
  //   FROM (all sites) = Active Factory (COMPANY/MARKETPLACE/COUNTRY-agnostic — Decision C)
  //                      + same-company, warehouse-country-compatible Active 3PL.
  //   TO — Amazon:      same-company, warehouse-country-compatible Active 3PL
  //                      + EXACTLY ONE Amazon logical destination (Decision B; NO individual FBA rows).
  //   TO — non-Amazon:  same-company, warehouse-country-compatible Active 3PL ONLY.
  //   Factory never appears in To. RETURN / FBA / other types never appear in the planning To.
  //   Warehouse country compatibility (Decision D): EU aggregate → EU/DE/ES/IT/FR; country-specific
  //   isolated; UK≡GB. (The real FBA warehouse_id is chosen at Shipment Draft, not here.)
  function buildCandidates(warehouses, scope) {
    scope = scope || {};
    var isAmazon = eqv(scope.marketplace, 'Amazon');
    function companyStrict(w) { return !scope.company || eqv(w.company, scope.company); }
    function whCountryOk(w) { return !scope.country || warehouseCountryMatches(w.country, scope.country); }

    var from = [], to = [];
    (warehouses || []).forEach(function (w) {
      if (!isActive(w)) return;
      // FROM — Active Factory: cross-company, cross-marketplace, cross-country (Decision C).
      if (isFactory(w)) { from.push(w); return; }   // factory never a To candidate
      // 3PL Overseas: same company + warehouse-country-compatible → both From and To.
      if (isOverseas3PL(w) && companyStrict(w) && whCountryOk(w)) { from.push(w); to.push(w); }
      // FBA / RETURN / others: NOT planning-level candidates (Amazon handled by the logical token).
    });
    var toList = dedup(to);
    if (isAmazon) toList.push(amazonLogicalDestination(scope));   // exactly one Amazon logical destination
    return { from: dedup(from), to: toList, isAmazon: isAmazon };
  }

  var IRWarehouse = {
    whType: whType, isFactory: isFactory, isOverseas3PL: isOverseas3PL, isFBA: isFBA, isActive: isActive,
    warehouseCountryMembers: warehouseCountryMembers, warehouseCountryMatches: warehouseCountryMatches,
    amazonLogicalToken: amazonLogicalToken, amazonLogicalDestination: amazonLogicalDestination,
    resolveDestinationPayload: resolveDestinationPayload,
    buildPhysicalThirdPartyBreakdown: buildPhysicalThirdPartyBreakdown,
    buildCandidates: buildCandidates, dedup: dedup
  };

  // ===== Part C (Round 4): pure Draft-persistence payload builders (deterministically testable) =====
  // The shipping-side handler (16_shipping_allocation_handlers.gs) is an INCREMENTAL upsert-by-line-id
  // (NOT a blanket REPLACE): a user edit updates planned_qty/selected_* only; recommended_qty is sent
  // ONLY for a system-generated line (so a plain edit never overwrites the immutable snapshot). Manual
  // Add omits allocation_draft_line_id → the handler appends a new SADL- id. Delete = soft cancel via
  // line_status='cancelled' (canonical repo enum). These builders produce those exact payloads.
  function buildDraftHeaderPayload(ctx) {
    ctx = ctx || {};
    return {
      allocation_draft_id: ctx.allocation_draft_id || undefined,   // omit → handler idempotent-matches/creates
      planning_cycle: ctx.planning_cycle || '',
      source_page: 'inventory_replenishment',
      company: ctx.company || '', country: ctx.country || '', marketplace: ctx.marketplace || '',
      // Normally 'draft'. A caller may pass status:'cancelled' to soft-remove an EMPTY header once its
      // last valid line is gone (System Repair 2 §5.3 — never leave an orphan/empty Draft Header).
      status: ctx.status || 'draft'
    };
  }
  // ---- Four-field completeness predicate (System Repair 2 §4 / §7) -----------------------------------
  // A working-draft route is a COMPLETE, persistable Execution Plan line ONLY when From + To + Qty(>0) +
  // Method are ALL present and valid. This is the SINGLE shared gate every manual-route persistence path
  // funnels through (frontend) and the shape the backend guard mirrors. It is deliberately NOT a truthy
  // check: an Amazon logical destination counts as a valid To; a blank / disabled / "No available"
  // method is NOT a valid method. Pure (no DOM) so it is deterministically unit-testable in Node.
  function isRouteComplete(route) {
    route = route || {};
    var from = String(route.source_warehouse_id == null ? '' : route.source_warehouse_id).trim();
    var toReal = String(route.destination_warehouse_id == null ? '' : route.destination_warehouse_id).trim();
    var isLogicalAmazon = route.destination_type === 'MARKETPLACE_DESTINATION' ||
      !!(route.destination_marketplace && String(route.destination_marketplace).trim());
    var hasTo = !!toReal || isLogicalAmazon;
    var qtyRaw = (route.planned_qty != null ? route.planned_qty : route.qty);
    var qty = Number(qtyRaw); if (!isFinite(qty)) qty = 0;
    var method = String(route.shipping_method == null ? '' : route.shipping_method).trim();
    var methodValid = !!method && method.toLowerCase().indexOf('no available') === -1;
    return !!from && hasTo && qty > 0 && methodValid;
  }
  // row = a working-draft route row; opts.scope = planning context; opts.system = true for a
  // system-recommended line (sends recommended_qty), false for a user edit / manual add.
  function buildDraftLinePayload(sku, row, opts) {
    row = row || {}; opts = opts || {};
    var destValue = (row.destination_type === 'MARKETPLACE_DESTINATION')
      ? amazonLogicalToken(row.destination_country || (opts.scope && opts.scope.country))
      : (row.destination_warehouse_id || '');
    var dest = resolveDestinationPayload(destValue, opts.scope);
    var p = {
      allocation_draft_line_id: row.allocation_draft_line_id || undefined,  // omit → new line (Manual Add)
      sku: sku,
      planned_qty: (row.planned_qty != null ? Number(row.planned_qty) : (Number(row.qty) || 0)),
      selected_source_warehouse_id: row.source_warehouse_id || null,
      selected_destination_warehouse_id: dest.selected_destination_warehouse_id,   // null for Amazon logical
      selected_shipping_method: row.shipping_method || '',
      generation_type: opts.system ? 'system_generated' : (row.generation_type || 'user_created')
    };
    if (dest.marketplace) p.destination_marketplace = dest.marketplace;   // Amazon logical context
    // recommended_qty ONLY for a system-generated line — never on a user edit (protects the snapshot).
    if (opts.system && row.recommended_qty != null) p.recommended_qty = Number(row.recommended_qty);
    return p;
  }
  // Delete = soft cancel one line (never hard delete). cancel_reason optional/blank allowed.
  function buildCancelLinePayload(allocationDraftId, lineId) {
    return { allocation_draft_id: allocationDraftId, lines: [{ allocation_draft_line_id: lineId, line_status: 'cancelled' }] };
  }
  var IRDraft = {
    buildDraftHeaderPayload: buildDraftHeaderPayload,
    buildDraftLinePayload: buildDraftLinePayload,
    buildCancelLinePayload: buildCancelLinePayload,
    isRouteComplete: isRouteComplete
  };

  return { IRCountry: IRCountry, IRWarehouse: IRWarehouse, IRDraft: IRDraft };
});
