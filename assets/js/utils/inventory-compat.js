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
  if (root) { root.IRCountry = mod.IRCountry; root.IRWarehouse = mod.IRWarehouse; root.IRDraft = mod.IRDraft; root.IRDraftWorkspace = mod.IRDraftWorkspace; root.IRService = mod.IRService; root.IRPlanningReveal = mod.IRPlanningReveal; root.IRSubmitPreflight = mod.IRSubmitPreflight; root.IRRouteProvenance = mod.IRRouteProvenance; }
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
  // F1-7N-FB-4F-B6 §D — ONE TOKEN BUILDER, AND THE MARKETPLACE IS AN ARGUMENT.
  // The selector's option value is the only thing that can SELECT a marketplace destination, so hydration has to
  // be able to build the exact same string from a PERSISTED marketplace. Amazon's builder now delegates here
  // rather than being a second spelling of the format — §D.8 forbids a second destination dictionary, and two
  // functions that each know the token layout are exactly that.
  function marketplaceDestinationToken(marketplace, country) {
    var m = String(marketplace == null ? '' : marketplace).trim();
    return m ? ('MARKETPLACE_DESTINATION:' + m + ':' + up(country)) : '';
  }
  function amazonLogicalToken(country) { return marketplaceDestinationToken('Amazon', country); }

  // F1-7N-FB-4F-B6 §D — THE PERSISTED DESTINATION IS THE ONLY LOADED AUTHORITY.
  //
  // This is the client mirror of 69_ ricDestinationIdentity_: WAREHOUSE or MARKETPLACE, exclusively, read from
  // the STORED row and from nothing else. It exists because the hydrate used to answer the question
  // "where is this route going?" with `ctx.marketplace` — the page's current FILTER — whenever the stored
  // destination was blank. That is not a fallback; it is the page inventing a business fact and then passing the
  // completeness gate on it. A route the database says has NO destination must come back with no destination.
  //
  // The four states are exhaustive and each one is a different instruction to the UI:
  //   PERSISTED_WAREHOUSE          — select the stored warehouse id (its existing token IS its id)
  //   PERSISTED_MARKETPLACE        — select the marketplace token built above
  //   DESTINATION_CONFIRMATION_REQUIRED — nothing is stored; the operator must choose, and until they do the
  //                                  route is not complete and nothing is written
  //   DESTINATION_AMBIGUOUS        — BOTH are stored, which is a contradiction the schema is supposed to make
  //                                  impossible; it is refused rather than resolved by preferring one (§D.4)
  var DESTINATION_CONFIRMATION_REQUIRED = 'DESTINATION_CONFIRMATION_REQUIRED';
  var DESTINATION_AMBIGUOUS = 'DESTINATION_AMBIGUOUS';

  // ===========================================================================================================
  // F1-7N-FB-4G-A0-R2 — THE CANONICAL DESTINATION IDENTITY, ONCE, ON THE CLIENT TOO.
  // -----------------------------------------------------------------------------------------------------------
  // The rule has been settled since B3 and lives in 69_ ricDestinationIdentity_: WAREHOUSE **xor** MARKETPLACE.
  // BOTH is not a destination, it is a contradiction; NEITHER is not a destination either. Nothing else takes
  // part — not the warehouse code snapshot, not the page filter, not ctx.marketplace, not a display label, not
  // the header's marketplace scope, not a note, not evidence of an earlier attempt.
  //
  // The client had the same rule written out THREE times — in resolvePersistedDestination, in isRouteComplete
  // and in routeHeaderFields — and two of them disagreed with it: both used `warehouse || marketplace`, so a row
  // carrying BOTH was silently resolved to one of them instead of refused. This is that rule, once, in the same
  // shape the server returns, so a client verdict and a server verdict cannot drift.
  function destinationIdentity(route) {
    route = route || {};
    function s(v) { return String(v == null ? '' : v).trim(); }
    var wid = s(route.destination_warehouse_id) || s(route.recommended_destination_warehouse_id);
    var mkt = s(route.destination_marketplace);
    if (wid && mkt) return { type: '', id: '', ok: false, code: 'ROUTE_DESTINATION_AMBIGUOUS', warehouse_id: wid, marketplace: mkt };
    if (wid) return { type: 'WAREHOUSE', id: wid, ok: true, code: '', warehouse_id: wid, marketplace: '' };
    if (mkt) return { type: 'MARKETPLACE', id: mkt.toLowerCase(), ok: true, code: '', warehouse_id: '', marketplace: mkt };
    return { type: '', id: '', ok: false, code: 'ROUTE_DESTINATION_MISSING', warehouse_id: '', marketplace: '' };
  }
  // F1-7N-FB-4G-A0-R2 — built ON destinationIdentity now rather than beside it. The four states and their
  // meanings are unchanged; what changed is that there is no second copy of the rule left to drift from.
  function resolvePersistedDestination(persisted, scope) {
    persisted = persisted || {};
    var _d = destinationIdentity(persisted);
    var wid = _d.warehouse_id, mkt = _d.marketplace;
    if (_d.code === 'ROUTE_DESTINATION_AMBIGUOUS') {
      return { state: DESTINATION_AMBIGUOUS, type: '', warehouse_id: '', marketplace: '', token: '',
        confirmationRequired: true };
    }
    if (wid) {
      return { state: 'PERSISTED_WAREHOUSE', type: '', warehouse_id: wid, marketplace: '', token: wid,
        confirmationRequired: false };
    }
    if (mkt) {
      return { state: 'PERSISTED_MARKETPLACE', type: 'MARKETPLACE_DESTINATION', warehouse_id: '', marketplace: mkt,
        token: marketplaceDestinationToken(mkt, scope && scope.country), confirmationRequired: false };
    }
    return { state: DESTINATION_CONFIRMATION_REQUIRED, type: '', warehouse_id: '', marketplace: '', token: '',
      confirmationRequired: true };
  }
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
      // F1-7N-FB-4G-A0-R1 §D/§E — the marketplace comes from the TOKEN the user selected, which is where the
      // option's own identity lives (MARKETPLACE_DESTINATION:<marketplace>:<COUNTRY>, built by
      // marketplaceDestinationToken). It was hardcoded to 'Amazon' — byte-identical for every token that
      // exists today, and exactly the kind of constant that becomes a wrong answer the day a second
      // marketplace gets a logical destination. The scope is still only a country fallback, never the
      // marketplace.
      var parts = value.split(':');
      var mkt = String(parts[1] == null ? '' : parts[1]).trim();
      return { marketplace: mkt || 'Amazon', country: up(parts[2] || (scope && scope.country)), selected_destination_warehouse_id: null };
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

  // ===========================================================================================================
  // F1-7N-FB-4G-A0-R1 §C.5 — CANONICAL SERVICE IDENTITY. One owner, and it mirrors the server's.
  // -----------------------------------------------------------------------------------------------------------
  // There was no client-side owner of "what service is this string". The page had two LEAD-TIME tables
  // (IR_SERVICE_TO_LEAD_KEY_ / IR_LABEL_TO_LEAD_KEY_) that answer a DIFFERENT question — which carrier_lead_times
  // key a service uses — and the Method picker answered the identity question with a raw `===` on whatever text
  // the rate card happened to carry. So a header persisted as `sea` did not select an option valued `Sea`, while
  // the SERVER matches rate cards case-insensitively (crcFindRateCards_ uses eqi) and computes route identity
  // through ricCanonicalService_. Three consumers, three comparison rules, one of them exact-string.
  //
  // This is the byte-for-byte mirror of 69_ RIC_SERVICE_LABELS_ / RIC_CANONICAL_SERVICES_. It is a MIRROR, not a
  // second dictionary: an entry that is not in 69_ must not be added here, because a client that recognises a
  // spelling the server refuses would build a route the server then rejects — or worse, one it keys differently.
  var IR_CANONICAL_SERVICES = ['air', 'sea', 'sea_express', 'rail', 'truck'];
  var IR_SERVICE_LABELS = {
    'air': 'air', 'sea': 'sea', 'sea express': 'sea_express', 'sea_express': 'sea_express',
    'rail': 'rail', 'truck': 'truck',
    '空運': 'air', '普船': 'sea', '快船': 'sea_express', '美森海卡': 'sea_express'
  };
  // Canonical service from any accepted spelling. '' for anything unrecognised — NEVER a neighbouring service,
  // never a family, never a mode. A caller receiving '' must REFUSE, not substitute.
  function canonicalService(v) {
    var t = String(v == null ? '' : v).trim().toLowerCase();
    if (!t) return '';
    if (IR_CANONICAL_SERVICES.indexOf(t) !== -1) return t;
    if (Object.prototype.hasOwnProperty.call(IR_SERVICE_LABELS, t)) return IR_SERVICE_LABELS[t];
    return '';
  }
  // Does a persisted service and a picker option value name the SAME service? Exact text first (the common
  // case, and free); canonical identity second. Two blanks never match, and an UNRECOGNISED spelling matches
  // NOTHING — including another unrecognised spelling — so an unknown service can never quietly select the
  // first option, and `sea` can never answer for `sea_express` in either direction.
  function serviceMatches(a, b) {
    var s = String(a == null ? '' : a).trim(), o = String(b == null ? '' : b).trim();
    if (!s || !o) return false;
    if (s === o) return true;
    var cs = canonicalService(s), co = canonicalService(o);
    return !!cs && !!co && cs === co;
  }
  var IRService = {
    CANONICAL_SERVICES: IR_CANONICAL_SERVICES,
    SERVICE_LABELS: IR_SERVICE_LABELS,
    canonical: canonicalService,
    matches: serviceMatches
  };

  var IRWarehouse = {
    whType: whType, isFactory: isFactory, isOverseas3PL: isOverseas3PL, isFBA: isFBA, isActive: isActive,
    warehouseCountryMembers: warehouseCountryMembers, warehouseCountryMatches: warehouseCountryMatches,
    amazonLogicalToken: amazonLogicalToken, amazonLogicalDestination: amazonLogicalDestination,
    marketplaceDestinationToken: marketplaceDestinationToken,
    destinationIdentity: destinationIdentity,
    resolvePersistedDestination: resolvePersistedDestination,
    DESTINATION_CONFIRMATION_REQUIRED: DESTINATION_CONFIRMATION_REQUIRED,
    DESTINATION_AMBIGUOUS: DESTINATION_AMBIGUOUS,
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
    var p = {
      allocation_draft_id: ctx.allocation_draft_id || undefined,   // omit → handler idempotent-matches/creates
      planning_cycle: ctx.planning_cycle || '',
      source_page: 'inventory_replenishment',
      company: ctx.company || '', country: ctx.country || '', marketplace: ctx.marketplace || '',
      // Normally 'draft'. A caller may pass status:'cancelled' to soft-remove an EMPTY header once its
      // last valid line is gone (System Repair 2 §5.3 — never leave an orphan/empty Draft Header).
      status: ctx.status || 'draft'
    };
    // C2-D1R: route context (From/To/Method/Last-mile) is HEADER-level (recommended_*) in the approved 30-col
    // schema. Send it only when a route is supplied (a soft-cancel of an empty header carries no route). An
    // Amazon logical destination sets destination_marketplace and leaves recommended_destination_warehouse_id ''.
    if (ctx.source_warehouse_id != null) p.recommended_source_warehouse_id = ctx.source_warehouse_id || '';
    if (ctx.destination_warehouse_id != null) p.recommended_destination_warehouse_id = ctx.destination_warehouse_id || '';
    if (ctx.source_warehouse_code != null) p.recommended_source_warehouse_code_snapshot = ctx.source_warehouse_code || '';
    if (ctx.destination_warehouse_code != null) p.recommended_destination_warehouse_code_snapshot = ctx.destination_warehouse_code || '';
    if (ctx.shipping_method != null) p.recommended_shipping_method = ctx.shipping_method || '';
    if (ctx.last_mile_delivery != null) p.recommended_last_mile_delivery = ctx.last_mile_delivery || '';
    if (ctx.destination_marketplace != null) p.destination_marketplace = ctx.destination_marketplace || '';
    // F1-7N-FB-4F-B6 §G — THE USER'S EXPLICIT ADOPTION AUTHORITY, and nothing else may set it.
    // `allow_legacy_reconcile` is the existing, USER-owned migration flag the atomic writer already accepts; B6
    // gives it a second, narrower meaning (adopt the ONE unclassifiable legacy header this route collides with)
    // and the server enforces every condition itself. It is emitted ONLY for a literal `true`, so a truthy
    // accident — a string, a 1, an object — cannot authorise a migration.
    if (ctx.allow_legacy_reconcile === true) p.allow_legacy_reconcile = true;
    // F1-7N-FB-4G-A2-R2 §2/§5 - THE INTENT CONTRACT. The writer used to infer what to do from whether a
    // natural key matched, which made "the operator changed the Method" indistinguishable from "this is a
    // different shipment". A request now states which operation it is, and the server refuses one that does
    // not (§2: a missing or contradictory intent is a zero-write refusal).
    //
    //   UPDATE_EXISTING_ROUTE - carries the route's own immutable allocation_draft_id and the draft_version it
    //     expects. The server updates that row in place or refuses; it must never fall back to CREATE.
    //   CREATE_NEW_ROUTE      - only + Add Route produces this: a route instance with no persisted identity.
    //     create_idempotency_key is the client's stable route instance id, so a retry after a lost response
    //     cannot mint a second票.
    //
    // Both are emitted only for an exact string, so a truthy accident cannot select an operation.
    if (ctx.intent === 'UPDATE_EXISTING_ROUTE' || ctx.intent === 'CREATE_NEW_ROUTE') p.intent = ctx.intent;
    if (ctx.expected_draft_version != null && String(ctx.expected_draft_version).trim() !== '') {
      p.expected_draft_version = String(ctx.expected_draft_version).trim();
    }
    if (ctx.create_idempotency_key != null && String(ctx.create_idempotency_key).trim() !== '') {
      p.create_idempotency_key = String(ctx.create_idempotency_key).trim();
    }
    if (ctx.applied_scope_key != null && String(ctx.applied_scope_key).trim() !== '') {
      p.applied_scope_key = String(ctx.applied_scope_key).trim();
    }
    return p;
  }

  // F1-7N-FB-4F-B6 §F.3 — WHAT THE OPERATOR IS ASKED TO CONFIRM, built as data rather than as a sentence.
  // The dialog must state From, the To they chose, Method, Qty, an Expected Arrival ONLY when one is explicitly
  // present, and that an EXISTING record will be updated. Built here, pure, so the regression suite can assert
  // the content of the question rather than assert that a question was asked.
  function buildLegacyAdoptionConfirmation(detail) {
    detail = detail || {};
    var NLC = String.fromCharCode(10);
    function S(v) { return String(v == null ? '' : v).trim(); }
    var fields = [
      { label: 'From', value: S(detail.from) },
      { label: 'To', value: S(detail.to) },
      { label: 'Method', value: S(detail.method) },
      { label: 'Qty', value: S(detail.qty) }
    ];
    // §H.1 — a blank ETA stays blank and is not shown as a value the user is confirming.
    if (S(detail.expected_arrival)) fields.push({ label: 'Expected Arrival', value: S(detail.expected_arrival) });
    var lines = fields.map(function (f) { return '  ' + f.label + ': ' + f.value; });
    return {
      fields: fields,
      allocation_draft_id: S(detail.allocation_draft_id),
      text: 'Confirm this destination for an EXISTING saved route.' + NLC + NLC +
        lines.join(NLC) + NLC + NLC +
        'The existing draft record ' + (S(detail.allocation_draft_id) || '(id not yet known)') +
        ' will be UPDATED with this destination. Its identity is kept and no new route is created.' + NLC + NLC +
        'Cancel writes nothing.'
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
    // F1-7N-FB-4G-A0-R2 — this read `toReal || isLogicalAmazon`, so a route carrying a warehouse AND a
    // marketplace was COMPLETE on the client, was sent, and (before R2) was accepted by the server. EXACTLY ONE
    // canonical destination, decided by the one owner. `destination_type` is display metadata and no longer
    // participates: the marketplace COLUMN is what makes a route a marketplace route.
    var hasTo = destinationIdentity(route).ok;
    var qtyRaw = (route.planned_qty != null ? route.planned_qty : route.qty);
    var qty = Number(qtyRaw); if (!isFinite(qty)) qty = 0;
    var method = String(route.shipping_method == null ? '' : route.shipping_method).trim();
    var methodValid = !!method && method.toLowerCase().indexOf('no available') === -1;
    return !!from && hasTo && qty > 0 && methodValid;
  }
  // row = a working-draft route row; opts.scope = planning context; opts.system = true for a
  // system-recommended line (sends recommended_qty), false for a user edit / manual add.
  //
  // F1-7N-FA-3C-R6F2B (H) — USER-EDIT OWNERSHIP CONTRACT (closes the deferred R6F2A frontend gap):
  //   • A confirmed planned_qty edit (qty moved away from the system recommendation) sets
  //     override_reason = 'USER_EDITED_QTY'  → the backend then preserves that qty across a regeneration.
  //   • An explicit "Reset to Recommendation" (opts.resetToRecommendation) CLEARS the override
  //     (override_reason='') and restores planned_qty = recommended_qty.
  //   • A Note-only edit (qty unchanged from the recommendation) NEVER marks the quantity overridden.
  //   • Note is ALWAYS user-owned: passed through verbatim when the row carries one (blank stays blank — never
  //     backfilled with a system/AI note). No new DB column is introduced (exact-30 line schema unchanged).
  //   • recommended_qty is sent ONLY for a system line (protects the immutable snapshot).
  var OVERRIDE_QTY = 'USER_EDITED_QTY';
  function buildDraftLinePayload(sku, row, opts) {
    row = row || {}; opts = opts || {};
    // C2-D1R: the approved 30-col line carries SKU + qty (route context is on the header). No selected_*.
    var isSystem = opts.system === true;
    var plannedQty = (row.planned_qty != null ? Number(row.planned_qty) : (Number(row.qty) || 0));
    var recRaw = (row.recommended_qty != null) ? Number(row.recommended_qty) : null;
    var hasRec = recRaw != null && isFinite(recRaw);
    var p = {
      allocation_draft_line_id: row.allocation_draft_line_id || undefined,  // omit → new line (Manual Add)
      sku: sku,
      planned_qty: plannedQty,
      generation_type: isSystem ? 'system_generated' : (row.generation_type || 'user_created')
    };
    // F1-7N-FB-4F-B6-R1 §E — expected_arrival IS DELIBERATELY NOT SENT, AND THIS IS A BLOCKED DECISION,
    // NOT AN OVERSIGHT. Everything else the round asked for is in place: the ETA is a structured value with one
    // owner, the render and the confirmation dialog both consume it, the collect no longer parses the rendered
    // sentence, the date is the project's calendar day, and the server column has existed since B3. The ONE
    // missing piece is what the date should be counted FROM.
    //
    // CARRIER_AND_ROUTE_SPEC.md §5B Step B defines it as
    //     Expected Arrival = Planned Ship Date + max_days + Receiving Buffer
    // and INVENTORY_TABLE_MAPPING_SPEC.md §326 lists `planned ship date` among this cell's inputs. There is no
    // planned ship date anywhere in this flow: not on the Execution Plan, not on the 35-column allocation draft
    // header, not on the 31-column line, not on shipping_plans. Nor is `Receiving Buffer` defined by any field,
    // table or value — the spec only names it and says it is separate from Lead Time. The shipped display has
    // been substituting TODAY and avg_days, which is a reasonable REFERENCE figure and is exactly the
    // substitution a persisted commitment must not be built on.
    //
    // Persisting it would freeze that guess into shipping_allocation_draft_lines as a business fact. So the
    // wiring stops one line short, on purpose, until the base date, the day column (max_days vs avg_days) and
    // the Receiving Buffer are decided. A test asserts this field stays absent, so a future round has to remove
    // that test deliberately rather than reintroduce a guess by accident.
    if (row.site_sku != null) p.site_sku = row.site_sku;
    if (row.route_no != null) p.route_no = row.route_no;
    if (row.units_per_carton != null) p.units_per_carton = row.units_per_carton;
    // Note is user-owned — send it through only when the row actually carries one (never clobber with undefined).
    if (row.note != null) p.note = String(row.note);
    // recommended_qty ONLY for a system-generated line — never on a user edit (protects the snapshot).
    if (isSystem) {
      if (hasRec) p.recommended_qty = recRaw;
    } else if (opts.resetToRecommendation === true) {
      // explicit Reset to Recommendation → clear the override and restore the recommended qty.
      p.override_reason = '';
      if (hasRec) p.planned_qty = recRaw;
    } else {
      // user edit: mark the quantity override iff the qty genuinely differs from the recommendation (or the caller
      // explicitly flags a confirmed qty edit / carries an existing marker). A Note-only edit leaves qty == rec → no mark.
      var qtyOverridden = opts.qtyEdited === true
        || String(row.override_reason || '') === OVERRIDE_QTY
        || (hasRec && plannedQty !== recRaw);
      if (qtyOverridden) p.override_reason = OVERRIDE_QTY;
      else if (row.override_reason != null) p.override_reason = String(row.override_reason);   // passthrough (incl. '')
    }
    return p;
  }
  // Delete = soft cancel one line (never hard delete). cancel_reason optional/blank allowed.
  function buildCancelLinePayload(allocationDraftId, lineId) {
    return { allocation_draft_id: allocationDraftId, lines: [{ allocation_draft_line_id: lineId, line_status: 'cancelled' }] };
  }
  // C2-D2 §4/§7: Phase-1 = ONE route context per Draft. The route-context key is From / To / Method / Last-mile
  // (an Amazon logical To is keyed by its marketplace token). distinctRouteContexts returns the DISTINCT complete
  // route-context keys among the given routes — length > 1 means the UI holds multiple route contexts, which is
  // UNSUPPORTED in Phase-1: the caller must BLOCK (never silently persist only the first route).
  function routeContextKey(route) {
    route = route || {};
    var from = String(route.source_warehouse_id == null ? '' : route.source_warehouse_id).trim();
    var to = (route.destination_type === 'MARKETPLACE_DESTINATION')
      ? ('MK:' + String(route.destination_marketplace || route.destination_country || '').trim())
      : String(route.destination_warehouse_id == null ? '' : route.destination_warehouse_id).trim();
    var method = String(route.shipping_method == null ? '' : route.shipping_method).trim();
    var lastMile = String(route.last_mile_delivery == null ? '' : route.last_mile_delivery).trim();
    return [from, to, method, lastMile].join('||');
  }
  function distinctRouteContexts(routes) {
    var seen = {}, keys = [];
    (routes || []).forEach(function (r) { if (!isRouteComplete(r)) return; var k = routeContextKey(r); if (!seen[k]) { seen[k] = 1; keys.push(k); } });
    return keys;
  }
  // ================================================================================================
  // F1-7N-FB-4B-ADDENDUM — CANONICAL MULTI-ROUTE GROUPING (the client-side mirror of the server's K2 authority).
  // ------------------------------------------------------------------------------------------------
  // WHY THIS EXISTS. `+ Add Route` has always let one SKU carry several Execution Plan routes, but the persistence
  // path refused any SKU holding more than one distinct route context (MULTIPLE_ROUTE_CONTEXTS_UNSUPPORTED_PHASE1).
  // That refusal was reasoning correctly from the frozen K2 contract — a Header IS one shipment group, so two routes
  // can never be two lines under one header — and then drawing the wrong conclusion. The right conclusion is that
  // two routes are TWO HEADERS, which is exactly what the server already implements: sadResolveActiveDraftK2OrK3_
  // resolves a route-complete header by the 10-dimension K2 group key, so a different route CREATEs its own
  // SADH-K2- header and the same route REUSEs it. Nothing on the server had to change; the client simply never
  // grouped, and sent every route of a SKU as lines under one header.
  //
  // These functions are the client-side mirror of SAD_K2_GROUP_DIMENSIONS_ / sadK2GroupKey_ /
  // sadK2PartitionLinesIntoGroups_ in 16_shipping_allocation_handlers.gs. They are PURE so the grouping the page
  // will persist is deterministically testable without a DB, and a test pins this dimension list against the
  // server's so the two can never silently drift apart.
  var IR_K2_GROUP_DIMENSIONS = ['planning_cycle', 'company', 'country', 'marketplace', 'source_page',
    'recommended_source_warehouse_id', 'recommended_destination_warehouse_id',
    'recommended_shipping_method', 'recommended_last_mile_delivery', 'recommendation_group_no'];

  // The header field-set ONE route implies. This is the single place a route becomes header route context, so the
  // grouping key and the payload that is actually written can never describe different routes.
  function routeHeaderFields(scope, route) {
    scope = scope || {}; route = route || {};
    // F1-7N-FB-4G-A0-R2 — A CONTRADICTION IS NOT RESOLVED HERE, IT IS CARRIED THROUGH AND REFUSED.
    //
    // This used `isLogical ? '' : warehouse`, which is a truthy collapse: handed a row with BOTH destinations it
    // quietly picked one and blanked the other, producing a clean-looking payload out of a row nobody had
    // decided. §C forbids exactly that for a canonical row. An explicit picker transition does not need it —
    // the To selector is single-select, so the collect already emits ONE side and the other is already blank
    // (that is what makes Warehouse→Amazon and Amazon→Warehouse produce one-sided payloads by construction).
    // So the collapse only ever fired on a row that was already contradictory, and hid it.
    //
    // Now: when the identity resolves, exactly that one side is emitted. When it does NOT — AMBIGUOUS or
    // MISSING — the raw values pass through unchanged, so isRouteComplete refuses the route, the client issues
    // no request, and if one ever were issued the server refuses it too with the same verdict.
    var _d = destinationIdentity(route);
    var _wid = String(route.destination_warehouse_id == null ? '' : route.destination_warehouse_id).trim();
    var _mkt = String(route.destination_marketplace == null ? '' : route.destination_marketplace).trim();
    var _code = String(route.destination_warehouse_code == null ? '' : route.destination_warehouse_code).trim();
    var isWarehouse = _d.ok && _d.type === 'WAREHOUSE';
    var isLogical = _d.ok && _d.type === 'MARKETPLACE';
    return {
      planning_cycle: scope.planning_cycle || '',
      company: scope.company || '', country: scope.country || '', marketplace: scope.marketplace || '',
      source_page: 'inventory_replenishment',
      recommended_source_warehouse_id: String(route.source_warehouse_id == null ? '' : route.source_warehouse_id).trim(),
      recommended_destination_warehouse_id: _d.ok ? (isWarehouse ? _wid : '') : _wid,
      recommended_shipping_method: String(route.shipping_method == null ? '' : route.shipping_method).trim(),
      recommended_last_mile_delivery: String(route.last_mile_delivery == null ? '' : route.last_mile_delivery).trim(),
      // recommendation_group_no is a K2 dimension the Execution Plan does not author (Phase-1 freeze D-C2-1). It is
      // carried explicitly as '' rather than omitted, so the key computed here is the FULL 10-dimension key.
      recommendation_group_no: String(route.recommendation_group_no == null ? '' : route.recommendation_group_no).trim(),
      // F1-7N-FB-4F-B6 §D.1/§D.2 — THE SECOND SYNTHESIS, AND THIS ONE REACHED THE DATABASE.
      // This read `route.destination_marketplace || route.destination_country || scope.marketplace || ''`, so a
      // route whose destination the operator had never chosen was WRITTEN as a route to the page's current
      // filter — and `destination_country` is a COUNTRY, which could be persisted into a marketplace field
      // outright. destination_marketplace is a stored column since B4; a value invented here is now a permanent
      // business fact rather than a transient display accident. Only the route's own destination is used.
      destination_marketplace: _d.ok ? (isLogical ? _mkt : '') : _mkt,
      // F1-7N-FB-4G-A0-R1 §D/§G — THE SNAPSHOT COLUMNS WERE BEING FED DISPLAY NAMES, AND FOR AMAZON THAT NAME
      // WAS 'Amazon'. These two lines read `route.ship_from` and `route.destination`, which the collect fills
      // from the selected option's data-wh-NAME. So a marketplace destination wrote the marketplace's NAME into
      // recommended_destination_warehouse_code_snapshot — a warehouse-code column — which is exactly the legacy
      // misuse the live H4 row carries. The snapshot is a WAREHOUSE CODE or it is nothing.
      //
      // XOR, and it is the same XOR the id and marketplace fields above already obey: a marketplace destination
      // has NO warehouse code, so the column is written BLANK (the writer's `if (header[f] != null)` makes a
      // blank an explicit clear, which is how an explicit Amazon save removes the legacy value). A warehouse
      // destination carries its code and no marketplace.
      //
      // Neither of these is a K2 group dimension (IR_K2_GROUP_DIMENSIONS above), so correcting them re-keys
      // nothing and moves no existing id.
      source_warehouse_code: String(route.source_warehouse_code == null ? '' : route.source_warehouse_code).trim(),
      destination_warehouse_code: _d.ok ? (isWarehouse ? _code : '') : _code
    };
  }

  // The EXACT key the server computes for the header this route implies: the 10 dimensions, trimmed, lowercased,
  // '|'-joined in the frozen order. Two routes sharing this key are ONE shipment group and therefore one header.
  function canonicalRouteGroupKey(scope, route) {
    var h = routeHeaderFields(scope, route);
    return IR_K2_GROUP_DIMENSIONS.map(function (d) {
      return String(h[d] == null ? '' : h[d]).trim().toLowerCase();
    }).join('|');
  }

  // Partition complete routes into canonical shipment groups — one entry per header that will be written.
  // Order is first-seen so the persistence order is deterministic and reportable.
  function partitionRoutesIntoGroups(scope, routes) {
    var buckets = {}, order = [];
    (routes || []).forEach(function (r, i) {
      if (!isRouteComplete(r)) return;
      var key = canonicalRouteGroupKey(scope, r);
      if (!buckets[key]) {
        buckets[key] = { groupKey: key, header: routeHeaderFields(scope, r), routes: [], indexes: [], routeContextKeys: [] };
        order.push(key);
      }
      buckets[key].routes.push(r);
      buckets[key].indexes.push(i);
      var rc = routeContextKey(r);
      if (buckets[key].routeContextKeys.indexOf(rc) === -1) buckets[key].routeContextKeys.push(rc);
    });
    return order.map(function (k) { return buckets[k]; });
  }

  function lineIdentityKey(sku, route) {
    route = route || {};
    return [String(sku == null ? '' : sku).trim().toLowerCase(),
      String(route.site_sku == null ? '' : route.site_sku).trim().toLowerCase(),
      String(route.window_code == null ? '' : route.window_code).trim().toLowerCase()].join('|');
  }

  // PURE pre-flight over the WHOLE batch, run before the first write so any refusal is a proven zero-write.
  // Two distinct failures, each fail-closed rather than silently resolved:
  //
  //   ROUTE_IDENTITY_NOT_PERSISTABLE — two routes the UI treats as DIFFERENT collapse onto ONE canonical group
  //     key. That can only happen when the dimension distinguishing them is not persisted, and the header schema
  //     has exactly one such field: destination_marketplace is an accepted payload field but is NOT a stored
  //     column, so a marketplace-logical To persists as a BLANK recommended_destination_warehouse_id. Writing
  //     both would silently merge two shipment groups into one header and destroy a quantity. A blank column is
  //     never allowed to stand in for a permanent identity, so this refuses instead.
  //
  //   ROUTE_QUANTITY_CONFLICT — the SAME route identity carries the SAME line identity twice with CONTRADICTORY
  //     quantities. There is no non-arbitrary way to choose, so both are named and nothing is written.
  //
  //   (identical duplicates within one group are NOT a conflict — they are the same line stated twice and
  //     collapse to one, which is what makes a replayed request idempotent.)
  function preflightRouteGroups(scope, sku, routes) {
    var groups = partitionRoutesIntoGroups(scope, routes);
    var conflicts = [];
    groups.forEach(function (g) {
      if (g.routeContextKeys.length > 1) {
        conflicts.push({
          code: 'ROUTE_IDENTITY_NOT_PERSISTABLE', groupKey: g.groupKey,
          routeContexts: g.routeContextKeys.slice(),
          detail: 'these route contexts differ only in a dimension the shipping_allocation_drafts header does not store, so both would resolve to the same canonical header'
        });
      }
      var byLine = {};
      g.routes.forEach(function (r, i) {
        var lk = lineIdentityKey(sku, r);
        var qty = Number(r.planned_qty != null ? r.planned_qty : r.qty) || 0;
        if (byLine[lk] === undefined) { byLine[lk] = { qty: qty, index: i }; return; }
        if (Number(byLine[lk].qty) === qty) return;   // identical restatement — idempotent, collapses to one line
        conflicts.push({
          code: 'ROUTE_QUANTITY_CONFLICT', groupKey: g.groupKey, lineKey: lk, sku: String(sku == null ? '' : sku),
          first_index: byLine[lk].index, first_planned_qty: byLine[lk].qty,
          duplicate_index: i, duplicate_planned_qty: qty,
          detail: 'the same route and the same line identity were given two different quantities'
        });
      });
    });
    return { ok: conflicts.length === 0, groups: groups, conflicts: conflicts };
  }

  var IRDraft = {
    buildDraftHeaderPayload: buildDraftHeaderPayload,
    buildLegacyAdoptionConfirmation: buildLegacyAdoptionConfirmation,
    buildDraftLinePayload: buildDraftLinePayload,
    buildCancelLinePayload: buildCancelLinePayload,
    isRouteComplete: isRouteComplete,
    routeContextKey: routeContextKey,
    distinctRouteContexts: distinctRouteContexts,
    K2_GROUP_DIMENSIONS: IR_K2_GROUP_DIMENSIONS,
    canonicalService: canonicalService,
    serviceMatches: serviceMatches,
    routeHeaderFields: routeHeaderFields,
    canonicalRouteGroupKey: canonicalRouteGroupKey,
    partitionRoutesIntoGroups: partitionRoutesIntoGroups,
    lineIdentityKey: lineIdentityKey,
    preflightRouteGroups: preflightRouteGroups
  };

  // ===== C2-D2A-UI: Allocation Draft persistence STATE MACHINE + Save/Cancel/Load orchestration =====
  // Pure, DOM-free and deps-injected so the exact workflow is deterministically unit-testable in Node. The page
  // wires real deps (adapters + a render callback); tests inject fakes. This controller NEVER calls
  // loadOperationDb / getOperationDb — reads go ONLY through deps.readback (getShippingAllocationDraftWorkspace).
  var IR_DRAFT_STATES = ['NOT_SAVED', 'SAVING', 'SAVED', 'SAVE_FAILED', 'CONFLICT', 'CANCELLED', 'SUBMITTED'];

  // Map a canonical error code out of a structured adapter/command result (never message-string parsing when a code exists).
  function draftErrorCode(res) {
    if (!res) return 'UNKNOWN_ERROR';
    if (res.error && res.error.code) return res.error.code;
    if (res.data && res.data.status === 'BLOCKED_CONFLICT') return 'BLOCKED_CONFLICT';
    if (typeof res.error === 'string' && res.error) return res.error.split(/[\s:]/)[0] || 'UNKNOWN_ERROR';
    return 'UNKNOWN_ERROR';
  }

  // Header route completeness for the Save gate → { ok, missing:[From/To/Method] }.
  function draftHeaderRouteComplete(header) {
    header = header || {};
    var from = String(header.recommended_source_warehouse_id == null ? '' : header.recommended_source_warehouse_id).trim();
    var toReal = String(header.recommended_destination_warehouse_id == null ? '' : header.recommended_destination_warehouse_id).trim();
    var hasTo = !!toReal || !!String(header.destination_marketplace == null ? '' : header.destination_marketplace).trim();
    var method = String(header.recommended_shipping_method == null ? '' : header.recommended_shipping_method).trim();
    var missing = [];
    if (!from) missing.push('From');
    if (!hasTo) missing.push('To');
    if (!method || method.toLowerCase().indexOf('no available') !== -1) missing.push('Method');
    return { ok: missing.length === 0, missing: missing };
  }

  // Client-side Save validation → { ok, code, issues }. Route-group pre-flight > header route > line qty.
  //
  // F1-7N-FB-4B-ADDENDUM — several distinct route contexts is NO LONGER a refusal. Each one is its own K2
  // shipment group and therefore its own header, which is what `+ Add Route` has always meant. What IS still
  // refused is a batch that cannot be resolved into distinct groups: two routes collapsing onto one canonical
  // group key (an unstored dimension), or one route carrying contradictory quantities for one line identity.
  function draftValidateSave(payload) {
    payload = payload || {};
    var routes = payload.routes || [];
    if (routes.length) {
      var scope = payload.scope || payload.header || {};
      var sku = payload.sku || ((routes[0] && routes[0].sku) || '');
      var pf = preflightRouteGroups(scope, sku, routes);
      if (!pf.ok) return { ok: false, code: pf.conflicts[0].code, issues: pf.conflicts };
    }
    var hr = draftHeaderRouteComplete(payload.header);
    if (!hr.ok) return { ok: false, code: 'PLAN_HEADER_INCOMPLETE', issues: [{ code: 'PLAN_HEADER_INCOMPLETE', missing: hr.missing }] };
    var lines = payload.lines || [];
    if (!lines.length) return { ok: false, code: 'PLAN_LINE_INCOMPLETE', issues: [{ code: 'PLAN_LINE_INCOMPLETE', missing: ['at least one Line'] }] };
    var lineIssues = [];
    lines.forEach(function (l, i) {
      var sku = String((l && l.sku) == null ? '' : l.sku).trim();
      var qty = Number(l && l.planned_qty); if (isNaN(qty)) qty = 0;
      if (!sku || qty <= 0) lineIssues.push({ code: 'PLAN_LINE_INCOMPLETE', index: i, allocation_draft_line_id: (l && l.allocation_draft_line_id) || null, sku: sku, missing: (!sku ? ['SKU'] : []).concat(qty <= 0 ? ['Qty'] : []) });
    });
    if (lineIssues.length) return { ok: false, code: 'PLAN_LINE_INCOMPLETE', issues: lineIssues };
    return { ok: true, issues: [] };
  }

  // Map a targeted-readback result → { state, draft, lines, conflictIds, source, code }.
  function draftStateFromReadback(res, hasLocalBuffer) {
    if (!res || res.success === false) return { state: 'SAVE_FAILED', code: draftErrorCode(res), draft: null, lines: [], conflictIds: [], source: hasLocalBuffer ? 'LOCAL' : 'DB' };
    var d = res.data || {};
    if (d.status === 'BLOCKED_CONFLICT') return { state: 'CONFLICT', code: 'BLOCKED_CONFLICT', conflictIds: (d.issues && d.issues[0] && d.issues[0].conflictIds) || [], draft: null, lines: [], source: 'DB' };
    if (d.status === 'NO_ACTIVE_DRAFT') return { state: 'NOT_SAVED', draft: null, lines: [], conflictIds: [], source: hasLocalBuffer ? 'LOCAL' : 'DB' };
    var st = String((d.draft && d.draft.status) == null ? '' : (d.draft && d.draft.status)).trim().toLowerCase();
    if (st === 'submitted') return { state: 'SUBMITTED', draft: d.draft, lines: d.lines || [], conflictIds: [], source: 'DB' };
    if (st === 'cancelled') return { state: 'CANCELLED', draft: d.draft, lines: d.lines || [], conflictIds: [], source: 'DB' };
    return { state: 'SAVED', draft: d.draft, lines: d.lines || [], conflictIds: [], source: 'DB' };
  }

  // Local-vs-DB comparison over a normalized { routeKey, lines:[{sku,site_sku,planned_qty,route_no}] } signature.
  function _draftLineSig(l) { l = l || {}; return [String(l.sku || '').trim(), String(l.site_sku || '').trim(), Number(l.planned_qty) || 0, String(l.route_no || '').trim()].join('~'); }
  function draftNormalizeSignature(x) { x = x || {}; return String(x.routeKey == null ? '' : x.routeKey) + '||' + (x.lines || []).map(_draftLineSig).sort().join('|'); }
  function draftCompareLocalVsDb(local, db) {
    if (!db && !local) return 'NONE';
    if (!db) return 'NO_DB';
    if (!local) return 'NO_LOCAL';
    return draftNormalizeSignature(local) === draftNormalizeSignature(db) ? 'IDENTICAL' : 'DIFFERENT';
  }

  // Restore/Discard decision. Default = Use DB (no overwrite). SUBMITTED/CANCELLED DB drafts are never overwritten.
  function resolveLocalDecision(choice, db) {
    var dbState = db ? String(db.status || '').trim().toLowerCase() : '';
    if (choice === 'RESTORE_LOCAL') {
      if (dbState === 'submitted' || dbState === 'cancelled') return { applied: false, reason: 'DB_TERMINAL_LOCKED', state: dbState === 'submitted' ? 'SUBMITTED' : 'CANCELLED' };
      return { applied: true, restored: true, state: 'NOT_SAVED' };
    }
    if (choice === 'USE_DB') return { applied: true, restored: false, state: 'SAVED' };
    return { applied: false, reason: 'REVIEW' };
  }

  // The controller. deps = { readback(scope), save(header), saveLines({allocation_draft_id,lines}), cancel(payload),
  // onState(stateSnapshot), getLocalBuffer() }. Single in-flight guard + stale-load sequence guard.
  function createDraftWorkspace(deps) {
    deps = deps || {};
    var state = { state: 'NOT_SAVED', draft: null, lines: [], code: null, conflictIds: [], issues: [], source: 'LOCAL', savedAt: null, transient: null };
    var loadSeq = 0, inFlight = false;
    function set(patch) { for (var k in patch) if (patch.hasOwnProperty(k)) state[k] = patch[k]; if (typeof deps.onState === 'function') { var snap = {}; for (var j in state) if (state.hasOwnProperty(j)) snap[j] = state[j]; deps.onState(snap); } }
    function getState() { var s = {}; for (var k in state) if (state.hasOwnProperty(k)) s[k] = state[k]; return s; }

    async function load(scope) {
      var mySeq = ++loadSeq;
      set({ transient: 'LOADING_DRAFT' });
      var rb;
      try { rb = await deps.readback(scope); } catch (e) { rb = { success: false, error: { code: 'HTTP_TRANSPORT_ERROR' } }; }
      if (mySeq !== loadSeq) return { stale: true };
      var hasLocal = !!(deps.getLocalBuffer && deps.getLocalBuffer());
      var m = draftStateFromReadback(rb, hasLocal);
      set({ state: m.state, draft: m.draft, lines: m.lines || [], conflictIds: m.conflictIds || [], code: m.code || null, source: m.source || (m.draft ? 'DB' : 'LOCAL'), savedAt: (m.draft && (m.draft.updated_at || m.draft.updatedAt)) || null, transient: null });
      return { stale: false, state: state.state };
    }

    async function save(payload) {
      if (inFlight) return { ok: false, blocked: true, code: 'IN_FLIGHT' };
      var v = draftValidateSave(payload);
      if (!v.ok) { set({ state: 'SAVE_FAILED', code: v.code, issues: v.issues }); return { ok: false, code: v.code, issues: v.issues }; }
      inFlight = true; set({ state: 'SAVING', code: null, issues: [] });
      var hres;
      try { hres = await deps.save(payload.header); } catch (e) { hres = { success: false, error: { code: 'HTTP_TRANSPORT_ERROR', message: String((e && e.message) || e) } }; }
      if (!hres || hres.success === false) {
        inFlight = false; var c = draftErrorCode(hres);
        var conflictIds = (hres && hres.error && hres.error.details && hres.error.details.conflictIds) || [];
        set({ state: c === 'BLOCKED_CONFLICT' ? 'CONFLICT' : 'SAVE_FAILED', code: c, conflictIds: conflictIds, issues: [{ code: c }] });
        return { ok: false, code: c, conflictIds: conflictIds };
      }
      var draftId = (hres.data && hres.data.allocation_draft_id) || (payload.header && payload.header.allocation_draft_id) || '';
      var lres;
      try { lres = await deps.saveLines({ allocation_draft_id: draftId, lines: payload.lines }); } catch (e2) { lres = { success: false, error: { code: 'HTTP_TRANSPORT_ERROR', message: String((e2 && e2.message) || e2) } }; }
      if (!lres || lres.success === false) { inFlight = false; var lc = draftErrorCode(lres); set({ state: lc === 'BLOCKED_CONFLICT' ? 'CONFLICT' : 'SAVE_FAILED', code: lc, issues: [{ code: lc }] }); return { ok: false, code: lc }; }
      var rb;
      try { rb = await deps.readback(payload.scope); } catch (e3) { rb = { success: false, error: { code: 'HTTP_TRANSPORT_ERROR' } }; }
      inFlight = false;
      if (!rb || rb.success === false) { set({ state: 'SAVED', code: 'WRITE_COMMITTED_READBACK_FAILED', draft: { allocation_draft_id: draftId }, source: 'DB' }); return { ok: true, committed: true, code: 'WRITE_COMMITTED_READBACK_FAILED', draftId: draftId }; }
      var m = draftStateFromReadback(rb, false);
      var finalState = (m.state === 'NOT_SAVED') ? 'SAVED' : m.state;   // never downgrade a committed save below SAVED
      set({ state: finalState, draft: m.draft || { allocation_draft_id: draftId }, lines: m.lines || [], conflictIds: m.conflictIds || [], source: 'DB', savedAt: (m.draft && (m.draft.updated_at || m.draft.updatedAt)) || null, code: null });
      return { ok: true, committed: true, draftId: draftId, state: finalState };
    }

    async function cancel(scope, opts) {
      if (inFlight) return { ok: false, blocked: true, code: 'IN_FLIGHT' };
      inFlight = true; set({ state: 'SAVING', code: null });
      var cres;
      try { cres = await deps.cancel(Object.assign({}, scope, { cancel_reason: (opts && opts.reason) || '' })); } catch (e) { cres = { success: false, error: { code: 'HTTP_TRANSPORT_ERROR' } }; }
      if (!cres || cres.success === false) { inFlight = false; var c = draftErrorCode(cres); set({ state: c === 'BLOCKED_CONFLICT' ? 'CONFLICT' : 'SAVE_FAILED', code: c }); return { ok: false, code: c }; }
      var alreadyCancelled = !!(cres.data && cres.data.already_cancelled);
      var rb;
      try { rb = await deps.readback(scope); } catch (e2) { rb = { success: false, error: { code: 'HTTP_TRANSPORT_ERROR' } }; }
      inFlight = false;
      var m = draftStateFromReadback(rb, false);
      var finalState = (m.state === 'NOT_SAVED' || m.state === 'CANCELLED') ? 'CANCELLED' : m.state;
      // A cancelled Draft is excluded from the active readback → keep the pre-cancel Header/Lines as read-only history.
      var keepDraft = (m.draft != null) ? m.draft : state.draft;
      var keepLines = (m.lines && m.lines.length) ? m.lines : state.lines;
      set({ state: finalState, draft: keepDraft, lines: keepLines, source: 'DB', code: alreadyCancelled ? 'ALREADY_CANCELLED' : null });
      return { ok: true, cancelled: true, alreadyCancelled: alreadyCancelled };
    }

    function refresh(scope) { return load(scope); }
    return { load: load, save: save, cancel: cancel, refresh: refresh, getState: getState };
  }

  var IRDraftWorkspace = {
    STATES: IR_DRAFT_STATES,
    create: createDraftWorkspace,
    stateFromReadback: draftStateFromReadback,
    validateSave: draftValidateSave,
    errorCode: draftErrorCode,
    headerRouteComplete: draftHeaderRouteComplete,
    normalizeSignature: draftNormalizeSignature,
    compareLocalVsDb: draftCompareLocalVsDb,
    resolveLocalDecision: resolveLocalDecision
  };

  // ================================================================================================
  // F1-7N-FB-4G-A1-R1 - PANEL-LOCAL PLANNING READINESS.
  //
  // WHAT A1 GOT WRONG, AND IT WAS REACHABLE THE DAY IT SHIPPED. A1 made the Recommendation Summary and the
  // Execution Plan reveal in ONE frame. That removed a real flicker, and it also coupled two panels whose
  // slowest input is not shared. Production then produced the case the coupling cannot survive: the gap read
  // settled in 40 ms, the carrier catalogue hit the transport's 60 000 ms read bound, and the Recommendation
  // Summary - complete, correct and sitting in memory - was held behind a skeleton for a full minute waiting
  // for a panel it does not depend on. Measured on the shipped A1 gate:
  //
  //       0:EXPAND (both skeletons)
  //      40:gap read settled
  //   60000:carrier catalogue settled
  //   60000:RECOMMENDATION_SUMMARY_VISIBLE      <- 59 960 ms of avoidable wait
  //   60000:EXECUTION_PLAN_VISIBLE (ERROR/METHOD_CATALOGUE_ERROR)
  //
  // A1's own rule - "a panel is revealed once, complete, never corrected in view" - was right. The mistake was
  // the SCOPE it was applied at. So the barrier is now PER PANEL: each owns its own generation, its own
  // readiness and its own single reveal, and neither can delay the other. Their data still loads in parallel;
  // nothing about the request graph changes here.
  //
  // ABANDONED is a gate state, not a readiness state: it is what a collapse, a scope change or a newer expand
  // leaves behind, and it is why a late response has nowhere to land.
  // ================================================================================================

  var IR_REVEAL_STATES = { LOADING: 'LOADING', READY: 'READY', EMPTY: 'EMPTY', ERROR: 'ERROR', ABANDONED: 'ABANDONED' };
  function revealIsTerminal(state) {
    return state === IR_REVEAL_STATES.READY || state === IR_REVEAL_STATES.EMPTY || state === IR_REVEAL_STATES.ERROR;
  }

  // THE TAXONOMY, KEPT DISTINCT. A read that timed out, a backend that refused, a catalogue belonging to
  // another station and a scope the user really has not chosen are four different problems with four
  // different remedies. Collapsing them is what put "Select a valid Country / Marketplace" on a screen whose
  // selectors plainly read US / Amazon.
  var IR_READINESS_CODES = {
    INVALID_SCOPE: 'INVALID_SCOPE',                             // no company/country/marketplace to ask about
    REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',                         // the bound elapsed with no answer
    BACKEND_BUSINESS_REJECTION: 'BACKEND_BUSINESS_REJECTION',   // the server answered, and refused
    STALE_SCOPE: 'STALE_SCOPE',                                 // an answer about a station we are not on
    NO_DATA: 'NO_DATA',                                         // the read succeeded and the scope has nothing
    NOT_CALCULATED: 'NOT_CALCULATED',                           // the scope has rows; this sku has none
    READ_FAILED: 'READ_FAILED'                                  // anything else, with the real code carried
  };
  function rcode(err) { return String((err && err.code) || '').trim(); }
  // Classify a transport/backend failure WITHOUT discarding its code. The kind drives the sentence; the code
  // stays on the result so the panel can print it and an operator can act on it.
  function classifyReadFailure(err) {
    var c = rcode(err).toUpperCase();
    if (!c) return IR_READINESS_CODES.READ_FAILED;
    if (c.indexOf('TIMEOUT') !== -1) return IR_READINESS_CODES.REQUEST_TIMEOUT;
    if (c.indexOf('STALE') !== -1) return IR_READINESS_CODES.STALE_SCOPE;
    if (c === 'BACKEND_BUSINESS_REJECTION' || c.indexOf('REJECT') !== -1) return IR_READINESS_CODES.BACKEND_BUSINESS_REJECTION;
    return IR_READINESS_CODES.READ_FAILED;
  }

  function mk(state, code, error) { return { state: state, code: code || '', error: error || null }; }

  // The Recommendation Summary's readiness. It depends on the recommendation read AND NOTHING ELSE - not the
  // allocation hydration, not the warehouse options, not the carrier catalogue, not the lead times, not the
  // Execution Plan. That independence is the point of this round.
  //
  // It reads no quantity, which is what stops it deciding a stored 0 is an absence.
  function recommendationReadiness(input) {
    input = input || {};
    var S = IR_REVEAL_STATES, C = IR_READINESS_CODES;
    if (input.mode === 'legacy') return mk(S.READY, '', null);
    var status = String(input.status || '');
    if (input.mode === 'workspace') {
      switch (status) {
        case 'READY': return mk(S.READY, '', null);
        case 'EMPTY': return mk(S.EMPTY, C.NO_DATA, null);
        case 'API_ERROR': return mk(S.ERROR, classifyReadFailure(input.error), input.error || { code: C.READ_FAILED });
        case 'CONFIG_NOT_READY': return mk(S.EMPTY, C.NOT_CALCULATED, null);
        case 'CONTEXT_NOT_READY': return mk(S.EMPTY, C.INVALID_SCOPE, null);
        case 'DISABLED': return mk(S.READY, '', null);
        default: return mk(S.LOADING, '', null);
      }
    }
    switch (status) {
      // A scope whose stored rows are loaded is READY even when THIS sku has no row: "Not calculated" is a
      // truthful terminal cell, and waiting for it to become something else would hang forever.
      case 'READY': return mk(S.READY, '', null);
      case 'EMPTY': return mk(S.EMPTY, C.NO_DATA, null);
      case 'READ_ERROR': return mk(S.ERROR, classifyReadFailure(input.error), input.error || { code: C.READ_FAILED });
      // INVALID_SCOPE means exactly what it says. A timeout, a refusal or a stale answer must never arrive
      // here - each has its own branch above, and each keeps its own code.
      case 'CONTEXT_NOT_READY': return mk(S.EMPTY, C.INVALID_SCOPE, null);
      case 'IDLE': case 'LOADING': return mk(S.LOADING, '', null);
      default: return mk(S.LOADING, '', null);
    }
  }

  // The Execution Plan's readiness. Four inputs, every one of which can still change what the route row says:
  // the read model (warehouse candidates), the draft hydration (the persisted route), and the ONE catalogue,
  // which supplies both the method options - hence the canonical match against the stored service - and the
  // lead times, hence the ETA. A route shown before all four is a route that will be corrected in view.
  function executionReadiness(input) {
    input = input || {};
    var S = IR_REVEAL_STATES, C = IR_READINESS_CODES;
    if (!input.readModelReady) return mk(S.LOADING, '', null);
    if (input.hydrationInFlight) return mk(S.LOADING, '', null);
    var cat = String(input.catalogue || '');
    // A catalogue that could not be read is a settled, NAMED failure with a Retry beside it - never an empty
    // plan, which would read as "there is nothing to ship".
    if (cat === 'ERROR') return mk(S.ERROR, classifyReadFailure(input.error), input.error || { code: 'METHOD_REGISTRY_READ_FAILED' });
    // The registry declining to answer about a station the user has not applied. Terminal for THIS station.
    if (cat === 'STALE_SCOPE') return mk(S.EMPTY, C.STALE_SCOPE, null);
    if (cat !== 'READY') return mk(S.LOADING, '', null);
    // Settled. A lead time nobody configured is an 'unavailable' TERMINAL result, not a pending one.
    if (!input.hasRoutes) return mk(S.EMPTY, C.NOT_CALCULATED, null);
    return mk(S.READY, '', null);
  }

  // ONE PANEL, ONE GENERATION, ONE REVEAL. Each panel holds its own gate, so neither can hold the other back.
  //
  // A generation is bound to the sku, the APPLIED station, the search generation and the expanded-row
  // generation. A report naming any past value of those is refused - that is the whole stale-response
  // defence, expressed once instead of at each call site.
  function createPanelGate(deps) {
    deps = deps || {};
    var name = String(deps.name || 'panel');
    var frame = (typeof deps.frame === 'function') ? deps.frame : function (cb) { cb(); };
    var now = (typeof deps.now === 'function') ? deps.now : function () { return 0; };
    var onReveal = (typeof deps.onReveal === 'function') ? deps.onReveal : function () {};
    var S = IR_REVEAL_STATES;
    var gen = 0, cur = null, frames = 0;

    function blank(g, ctx) {
      ctx = ctx || {};
      return {
        panel: name, gen: g, sku: ctx.sku || '', scopeKey: ctx.scopeKey || '',
        searchGen: (ctx.searchGen == null ? null : ctx.searchGen),
        rowGen: (ctx.rowGen == null ? null : ctx.rowGen),
        readiness: mk(S.LOADING, '', null),
        revealed: false, frameId: null, beganAt: now(), settledAt: null, revealedAt: null
      };
    }
    function begin(ctx) { gen++; cur = blank(gen, ctx); return gen; }
    function abandon() { gen++; cur = null; return gen; }
    function generation() { return gen; }
    function state() { return cur ? cur.readiness.state : S.ABANDONED; }
    function snapshot() { return cur ? JSON.parse(JSON.stringify(cur)) : null; }

    function accept(g, ctx) {
      if (!cur) return S.ABANDONED;
      if (g !== cur.gen) return 'STALE_GENERATION';
      if (!ctx) return '';
      if (ctx.sku && cur.sku && String(ctx.sku) !== String(cur.sku)) return 'STALE_SKU';
      if (ctx.scopeKey && cur.scopeKey && String(ctx.scopeKey) !== String(cur.scopeKey)) return 'STALE_SCOPE';
      if (ctx.searchGen != null && cur.searchGen != null && ctx.searchGen !== cur.searchGen) return 'STALE_SEARCH';
      if (ctx.rowGen != null && cur.rowGen != null && ctx.rowGen !== cur.rowGen) return 'STALE_ROW';
      return '';
    }

    function settle() {
      if (!cur || cur.revealed) return;
      if (!revealIsTerminal(cur.readiness.state)) return;
      cur.settledAt = now();
      cur.revealed = true;
      var mine = cur.gen;
      // ONE frame for THIS panel. Its partner is not consulted, and cannot be: this gate has no reference to it.
      frame(function () {
        if (!cur || cur.gen !== mine) return;      // collapsed / superseded between settling and painting
        cur.frameId = ++frames;
        cur.revealedAt = now();
        onReveal(snapshot());
      });
    }

    function report(g, readiness, ctx) {
      var why = accept(g, ctx);
      if (why) return { accepted: false, reason: why };
      readiness = readiness || {};
      cur.readiness = mk(readiness.state || S.LOADING, readiness.code, readiness.error);
      settle();
      return { accepted: true, reason: '', revealed: !!cur.revealed, state: cur.readiness.state };
    }

    return {
      name: name, STATES: IR_REVEAL_STATES, begin: begin, abandon: abandon, report: report,
      generation: generation, state: state, snapshot: snapshot, isTerminal: revealIsTerminal,
      frameCount: function () { return frames; }
    };
  }

  // ================================================================================================
  // F1-7N-FB-4G-A2 - SUBMIT PLAN PREFLIGHT: ONE DIRTY OWNER, ONE CANDIDATE SET, ONE CONFIRMATION.
  //
  // WHAT THIS REPLACES. Submit Plan already failed closed on several conditions, but each was decided by its
  // own map and reported with its own sentence: _irUnsavedRoutes (save FAILURES), _draftDbTimers (debounced
  // writes not yet sent), _draftDbInFlight (writes in the air), _draftDbDirty (an edit that landed during a
  // write), _pendingDraftCancels (deletes not yet persisted), and - since A1-R1 - the Execution panel's own
  // reveal state. Six owners, five of them booleans, and no single place that could answer "is what the
  // operator is looking at the same as what the database holds?".
  //
  // That question has ONE answer here, and it is derived from NAMED STATE. It is deliberately NOT derived from
  // "the DOM row count equals the stored row count": two routes can be equal in number and different in every
  // value, and a count comparison would call that clean.
  //
  // AND IT NEVER SAVES FOR THE OPERATOR. A preflight that silently persisted the pending edit would be a
  // mutation the operator did not ask for, on data they may be about to correct. It reports; the operator acts.
  // ================================================================================================

  var IR_SUBMIT_CODES = {
    OK: '',
    UNSAVED_EXECUTION_PLAN_CHANGES: 'UNSAVED_EXECUTION_PLAN_CHANGES',
    EXECUTION_PLAN_SAVE_IN_PROGRESS: 'EXECUTION_PLAN_SAVE_IN_PROGRESS',
    EXECUTION_PLAN_SAVE_FAILED: 'EXECUTION_PLAN_SAVE_FAILED',
    EXECUTION_PLAN_NOT_READY: 'EXECUTION_PLAN_NOT_READY',
    ROUTE_DESTINATION_MISSING: 'ROUTE_DESTINATION_MISSING',
    DUPLICATE_LINE_IDENTITY: 'DUPLICATE_LINE_IDENTITY',
    EXECUTION_PLAN_ROUTE_INCOMPLETE: 'EXECUTION_PLAN_ROUTE_INCOMPLETE',
    NO_PERSISTED_CANDIDATE: 'NO_PERSISTED_CANDIDATE',
    // F1-7N-FC-1B-E1 §D.4 — THE EMPTY EXECUTION PLAN, WHICH USED TO BE UNREACHABLE.
    //
    // Before E1 an Execution Plan could not be empty: when the station held no active draft the page seeded a
    // blank route carrying the Suggested Qty, so "nothing has been planned" and "one route has been planned
    // and not filled in" looked identical to every reader — including this preflight. Now that the empty
    // state exists it needs its own answer, because NO_PERSISTED_CANDIDATE tells the operator to save routes
    // they have not created yet. This one tells them to create one.
    NO_EXECUTION_ROUTES: 'NO_EXECUTION_ROUTES',
    // §H.3 — a route that cannot say how it came to exist. Nothing the page renders can be in this
    // state (every render path stamps a provenance and the collect drops a row that has none), so reaching
    // this code means a row arrived from outside the model's own lifecycle: a stale DOM row left by a cached
    // build, or a hand-built snapshot. It is refused rather than advised on, because "fill in the Method" is
    // the wrong instruction for a row the operator never created.
    ROUTE_PROVENANCE_UNKNOWN: 'ROUTE_PROVENANCE_UNKNOWN'
  };

  // ===========================================================================================================
  // F1-7N-FC-1B-E1 §C — ROUTE PROVENANCE. RECOMMENDATION IS NOT EXECUTION.
  // -----------------------------------------------------------------------------------------------------------
  // A Suggested Qty is a NUMBER SOMEONE MIGHT ACT ON. An Execution Route is a THING SOMEONE HAS DECIDED. The
  // page used to turn the first into the second by itself, and the consequence was not cosmetic: the blank row
  // it produced was swept into the canonical model by the next collect, minted a client_route_instance_id,
  // declared itself CREATE_NEW_ROUTE, and then blocked Submit for the WHOLE batch as an unsaved incomplete
  // route — for a route no operator had ever asked for.
  //
  // There are exactly THREE ways a route may enter the client execution model, and each one is an explicit act:
  //   PERSISTED_ACTIVE_DRAFT       — read from an ACTIVE header with at least one ACTIVE line
  //   AI_PLAN_EXPLICITLY_REQUESTED — the readback of a generation the operator asked for, which succeeded
  //   USER_EXPLICIT_ADD_ROUTE      — the operator pressed + Add Route
  //
  // There is deliberately no fourth. The forbidden names below are recorded so a later round cannot add one
  // under a reasonable-sounding label — each of them is a description of the defect this round removed.
  //
  // PROVENANCE IS DECLARED BY THE CALL SITE THAT KNOWS, NEVER INFERRED. It is not derived from a route's shape,
  // its Qty, its group key or the Suggested Qty, because every one of those was a way of guessing whether a row
  // was real, and guessing is what produced the phantom. It is also NOT an identity: it does not replace, encode
  // or stand in for allocation_draft_id / allocation_draft_line_id, which remain the only things that say which
  // stored ticket a route IS. Client-only by design — no column, no migration: it records how a row got
  // onto this screen in this session, which is not a fact the database has any reason to hold.
  // ===========================================================================================================
  var IR_ROUTE_PROVENANCE = {
    PERSISTED_ACTIVE_DRAFT: 'PERSISTED_ACTIVE_DRAFT',
    AI_PLAN_EXPLICITLY_REQUESTED: 'AI_PLAN_EXPLICITLY_REQUESTED',
    USER_EXPLICIT_ADD_ROUTE: 'USER_EXPLICIT_ADD_ROUTE'
  };
  var IR_FORBIDDEN_ROUTE_PROVENANCE = ['SUGGESTED_QTY_PLACEHOLDER', 'AUTO_SEEDED_ROUTE', 'DEFAULT_ROUTE'];
  var IR_LEGAL_PROVENANCE_LIST = [IR_ROUTE_PROVENANCE.PERSISTED_ACTIVE_DRAFT,
    IR_ROUTE_PROVENANCE.AI_PLAN_EXPLICITLY_REQUESTED, IR_ROUTE_PROVENANCE.USER_EXPLICIT_ADD_ROUTE];
  function routeProvenanceIsLegal(p) {
    return IR_LEGAL_PROVENANCE_LIST.indexOf(sstr(p)) !== -1;
  }
  // A route's EFFECTIVE provenance: what it declares, or - failing that - the one fact that can stand in for a
  // declaration. A row carrying BOTH stored identities is a route the database holds, which is precisely
  // PERSISTED_ACTIVE_DRAFT; every other axis (Qty, group key, completeness, the Suggested Qty) is deliberately
  // not consulted, because each of those was a way of deciding whether a phantom looked real enough.
  //
  // This is also what makes the round SAFE TO DEPLOY to a browser holding a pre-E1 recovery cache: those model
  // rows carry no provenance field, and without this they would have blocked Submit for routes that are
  // perfectly persisted.
  function routeProvenanceOf(r) {
    var declared = sstr(r && r.route_provenance);
    if (routeProvenanceIsLegal(declared)) return declared;
    if (sstr(r && r.allocation_draft_id) && sstr(r && r.allocation_draft_line_id)) {
      return IR_ROUTE_PROVENANCE.PERSISTED_ACTIVE_DRAFT;
    }
    return '';
  }
  var IRRouteProvenance = {
    SOURCES: IR_ROUTE_PROVENANCE,
    LEGAL: IR_LEGAL_PROVENANCE_LIST,
    FORBIDDEN: IR_FORBIDDEN_ROUTE_PROVENANCE,
    isLegal: routeProvenanceIsLegal,
    of: routeProvenanceOf
  };

  // F1-7N-FB-4G-A2-R1 - THE DIRTY SOURCES, EACH WITH ITS OWN TYPED REFUSAL CODE.
  //
  // A2 put all five under one code. They are not one thing to the operator: a FAILED save will never resolve
  // on its own and needs them to act, an IN-FLIGHT save resolves in a moment and needs them to wait, and a
  // pending debounce resolves in 400 ms. So the reason stays per route and the CODE says what to do.
  //
  // `unpersistedRoutes` is the SIXTH source and it is DERIVED from input.routes rather than read from a map:
  // a route the screen holds and the database does not is exactly the condition Submit must never carry, and
  // A2 tried to express it as an EXCLUSION (UNSAVED_USER_ADDED_ROUTE) - a state that is unreachable, because
  // any route in that condition also trips one of the five maps and returns before the candidate set is even
  // built. It is a BLOCK here, which is what makes "an unsaved route cannot reach the confirmation" structural
  // instead of accidental.
  //
  // `rank` picks the reported code when several fire at once: the one that needs the operator, first.
  var IR_DIRTY_SOURCES = [
    { key: 'saveFailed', reason: 'SAVE_FAILED', code: 'EXECUTION_PLAN_SAVE_FAILED', rank: 1 },
    { key: 'inFlightWrites', reason: 'SAVE_IN_PROGRESS', code: 'EXECUTION_PLAN_SAVE_IN_PROGRESS', rank: 2 },
    { key: 'dirtyAfterWrite', reason: 'EDITED_DURING_SAVE', code: 'EXECUTION_PLAN_SAVE_IN_PROGRESS', rank: 2 },
    { key: 'pendingWrites', reason: 'EDIT_NOT_YET_SAVED', code: 'UNSAVED_EXECUTION_PLAN_CHANGES', rank: 3 },
    { key: 'pendingCancels', reason: 'DELETE_NOT_YET_PERSISTED', code: 'UNSAVED_EXECUTION_PLAN_CHANGES', rank: 3 },
    { key: 'unpersistedRoutes', reason: 'ROUTE_NOT_SAVED', code: 'UNSAVED_EXECUTION_PLAN_CHANGES', rank: 3, derived: true }
  ];

  // An exclusion the CONFIRMATION may never carry. A2's confirmation offered to tell the operator that an
  // unsaved route had been left out; §5 forbids that, because the presence of an unsaved route means the
  // confirmation is unreachable. buildConfirmation REFUSES rather than rendering one of these.
  // F1-7N-FB-4G-A3 §E - ROUTE_INCOMPLETE joins it, and for the same reason: an incomplete route is now a BLOCK,
  // so a confirmation that carried it as an exclusion could only mean the block had been bypassed.
  var IR_FORBIDDEN_CONFIRMATION_EXCLUSIONS = ['UNSAVED_USER_ADDED_ROUTE', 'ROUTE_INCOMPLETE'];

  // ============================================================================================================
  // F1-7N-FB-4G-A3 §I.2 - THE PHYSICAL SHIPPING-PLAN GROUP KEY, MIRRORED FROM THE WRITER THAT OWNS IT.
  //
  // 11_ shippingPlanRouteGroupKey_ decides which lines may share ONE shipping_plans row:
  //   company | country | source_warehouse_id | ship_from | destination_warehouse_id | destination |
  //   shipping_method | last_mile_delivery | planning_cycle       (marketplace EXCLUDED; carrier DEFERRED)
  //
  // The confirmation has to tell the operator how many PLANS their submit will create, and the only honest way
  // to do that is to group on the writer's own dimensions. This is a MIRROR, and a parity test executes both
  // over the same rows so the two cannot drift: if 11_'s key changes and this does not, the test fails.
  //
  // It is deliberately NOT a second authority. Nothing routes, groups or writes on this value - it is counted
  // and shown, and the server re-derives the real grouping from the persisted drafts when it commits.
  // ============================================================================================================
  function planGroupKey(r) {
    function lc(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
    r = r || {};
    return [r.company, r.country, r.source_warehouse_id, r.ship_from, r.destination_warehouse_id,
      r.destination, r.shipping_method, r.last_mile_delivery, r.planning_cycle].map(lc).join('||');
  }

  function arr(v) { return Object.prototype.toString.call(v) === '[object Array]' ? v : []; }
  function sstr(v) { return String(v == null ? '' : v).trim(); }
  function toInt(v) { var n = parseInt(v, 10); return isFinite(n) ? n : 0; }

  // A route counts toward the SUBMITTED set only when the database already holds it. `persisted` is the
  // presence of the stored identities the server will re-read - never the presence of a DOM row.
  function routeIsPersisted(r) {
    return !!(r && sstr(r.allocation_draft_id) && sstr(r.allocation_draft_line_id));
  }

  function submitPreflight(input) {
    input = input || {};
    var C = IR_SUBMIT_CODES;
    var seen0 = {};
    var out = {
      ok: false, code: C.OK,
      blocking: { skus: [], reasons: [] },
      candidate: { draftIds: [], routeCount: 0, lineCount: 0, totalQty: 0, skus: [], methods: [], destinations: [],
        planGroups: [], planGroupCount: 0 },
      excluded: [],
      confirmation: null
    };

    // ---- 0. A ROUTE MUST BE ABLE TO SAY HOW IT CAME TO EXIST, AND THERE MUST BE ONE ------------------
    //
    // These run BEFORE the dirty verdict on purpose. A provenance-less row is ALSO unpersisted and ALSO
    // incomplete, so section 1 would have claimed it first and told the operator to save or finish a route
    // they never created — which is exactly the false alarm the seeded placeholder used to raise. What is
    // wrong with such a row is not its state; it is that it exists.
    var noProv = arr(input.routes).filter(function (r) { return !routeProvenanceOf(r); });
    if (noProv.length) {
      out.code = C.ROUTE_PROVENANCE_UNKNOWN;
      noProv.forEach(function (r) {
        var k = sstr(r && r.sku);
        out.blocking.reasons.push({ sku: k, reason: 'ROUTE_PROVENANCE_UNKNOWN',
          route: sstr(r && r.routeLabel), provenance: sstr(r && r.route_provenance) });
        if (k && !seen0[k]) { seen0[k] = 1; out.blocking.skus.push(k); }
      });
      return out;
    }
    // An empty Execution Plan is a legitimate, reachable state since E1, and Submit cannot build a Weekly
    // Shipping Plan out of nothing. Named separately from NO_PERSISTED_CANDIDATE because the instruction
    // differs: there is nothing to save here, there is something to CREATE.
    if (!arr(input.routes).length) { out.code = C.NO_EXECUTION_ROUTES; return out; }

    // ---- 1. THE DIRTY VERDICT, from named state only -------------------------------------------------
    // SUBMIT DOES NOT SAVE. It does not flush a debounced write, does not run a pending write early, does not
    // wait for one and then carry on by itself. Any difference between the screen and the database is a
    // TYPED REFUSAL here, and the route state is left exactly as the operator left it. The auto-save their
    // own edit scheduled still completes on its own schedule; the button never accelerates or takes it over.
    var seen = {};
    // The sixth source, derived: a route on screen that the database does not hold. `complete` splits the
    // reason, because a half-filled row can never save until it is filled in or removed - the operator needs
    // to be told which of those two it is.
    var unpersisted = [];
    arr(input.routes).forEach(function (r) {
      if (routeIsPersisted(r)) return;
      unpersisted.push({ sku: sstr(r && r.sku), reason: (r && r.complete === true) ? 'ROUTE_NOT_SAVED' : 'ROUTE_NOT_SAVED_INCOMPLETE' });
    });
    var state = { unpersistedRoutes: unpersisted };
    var rank = 0;
    IR_DIRTY_SOURCES.forEach(function (src) {
      var list = src.derived ? arr(state[src.key]) : arr(input[src.key]);
      list.forEach(function (item) {
        var k = sstr((item && item.sku != null) ? item.sku : item); if (!k) return;
        out.blocking.reasons.push({ sku: k, reason: sstr((item && item.reason) || src.reason) });
        if (!seen[k]) { seen[k] = 1; out.blocking.skus.push(k); }
        if (!rank || src.rank < rank) { rank = src.rank; out.code = C[src.code] || src.code; }
      });
    });
    if (out.blocking.skus.length) return out;

    // ---- 2. A PANEL THAT IS NOT READY CANNOT BE SUBMITTED FROM -----------------------------------------
    // A1-R1 disables the button while an Execution Plan is a shell or a named failure; a disabled button is
    // not a guard - a direct call, a stale enabled button or a keyboard activation all bypass it. The state
    // is checked here, where the request is actually issued.
    var notReady = arr(input.panels).filter(function (p) {
      var st = sstr(p && p.execState).toUpperCase();
      return st && st !== 'READY';
    });
    if (notReady.length) {
      out.code = C.EXECUTION_PLAN_NOT_READY;
      notReady.forEach(function (p) {
        var k = sstr(p.sku);
        out.blocking.reasons.push({ sku: k, reason: 'EXECUTION_PANEL_' + sstr(p.execState).toUpperCase() });
        if (k && !seen[k]) { seen[k] = 1; out.blocking.skus.push(k); }
      });
      return out;
    }

    // ---- 3. THE EXISTING FAIL-CLOSED FACTS, kept and reported under their own codes --------------------
    var noDest = arr(input.routesMissingDestination);
    if (noDest.length) {
      out.code = C.ROUTE_DESTINATION_MISSING;
      noDest.forEach(function (d) { out.blocking.reasons.push({ sku: sstr(d && d.sku), reason: sstr((d && d.destination_code) || 'ROUTE_DESTINATION_MISSING') }); });
      return out;
    }
    var dup = arr(input.duplicateCorruption);
    if (dup.length) {
      out.code = C.DUPLICATE_LINE_IDENTITY;
      dup.forEach(function (d) { out.blocking.reasons.push({ sku: sstr(d && d.sku), reason: 'DUPLICATE_LINE_IDENTITY' }); });
      return out;
    }

    // ---- 3.5 A VISIBLE INCOMPLETE ROUTE STOPS SUBMIT. IT USED TO BE DROPPED IN SILENCE. ---------------
    //
    // A2-R4 fixed a real defect: an edit that briefly left a route incomplete no longer erases the route's
    // persisted identity, so finishing the edit updates the SAME ticket instead of creating a replacement.
    // What that also changed - and this is measured, not inferred - is which class such a route falls into
    // HERE. Before A2-R4 an incomplete route had no allocation_draft_id and no line id, so routeIsPersisted
    // was false, it landed in `unpersistedRoutes` and Submit BLOCKED with ROUTE_NOT_SAVED_INCOMPLETE. After
    // A2-R4 it keeps both ids, so it is PERSISTED, it reached the candidate loop below and was recorded as
    // `exclude('ROUTE_INCOMPLETE')` - a silent exclusion. Submit then proceeded, committed a plan built from
    // the other routes, and the incomplete one's quantity was simply absent from it.
    //
    // That is the partially-submitted plan that looks complete: the exact failure this project froze against.
    // It is the live `TW Sheng-Yi -> Amazon` route, whose Method the rate-card catalogue does not cover.
    //
    // So it BLOCKS, named per route, with the missing fields the operator has to fill in. `reason` carries
    // them because "incomplete" alone does not tell anyone what to do; NO_ELIGIBLE_METHOD_CONFIGURED is
    // reported separately from a Method the operator simply has not chosen, because one is a master-data
    // configuration task and the other is thirty seconds of typing.
    var incomplete = arr(input.routes).filter(function (r) { return routeIsPersisted(r) && r.complete !== true; });
    if (incomplete.length) {
      out.code = C.EXECUTION_PLAN_ROUTE_INCOMPLETE;
      incomplete.forEach(function (r) {
        var k = sstr(r.sku);
        var missing = arr(r.missingFields).map(sstr).filter(String);
        var why = (r.methodConfigurationMissing === true && missing.length === 1 && missing[0] === 'Method')
          ? 'NO_ELIGIBLE_METHOD_CONFIGURED'
          : ('ROUTE_INCOMPLETE_MISSING:' + (missing.join('+') || 'ROUTE'));
        out.blocking.reasons.push({ sku: k, reason: why, route: sstr(r.routeLabel), missing: missing });
        if (k && !seen[k]) { seen[k] = 1; out.blocking.skus.push(k); }
      });
      return out;
    }

    // ---- 4. THE CANDIDATE SET. Persisted, complete, in scope, quantity-bearing. ------------------------
    var excl = {};
    function exclude(reason) { excl[reason] = (excl[reason] || 0) + 1; }
    var draftSeen = {}, skuSeen = {}, methodSeen = {}, destSeen = {}, groupSeen = {};
    arr(input.routes).forEach(function (r) {
      // UNREACHABLE by construction: an unpersisted route is a DIRTY SOURCE above and returns before this
      // loop runs. Kept as a guard so a future change cannot let one through silently, but deliberately NOT
      // recorded as an exclusion - a confirmation must never be able to say "one route was left out".
      if (!routeIsPersisted(r)) return;
      // UNREACHABLE by construction since A3 §E: a persisted incomplete route BLOCKS above and returns before
      // this loop runs. Kept as a structural guard, and deliberately NOT recorded as an exclusion - a
      // confirmation must never be able to say "one route was left out".
      if (r.complete !== true) return;
      if (input.appliedScopeKey && sstr(r.scopeKey) && sstr(r.scopeKey) !== sstr(input.appliedScopeKey)) { exclude('OUT_OF_APPLIED_SCOPE'); return; }
      if (r.terminal === true) { exclude('TERMINAL_LIFECYCLE'); return; }
      if (r.lineCancelled === true) { exclude('LINE_CANCELLED'); return; }
      var q = toInt(r.qty);
      if (q <= 0) { exclude('NO_POSITIVE_PLANNED_QTY'); return; }
      var id = sstr(r.allocation_draft_id);
      if (!draftSeen[id]) { draftSeen[id] = 1; out.candidate.draftIds.push(id); }
      out.candidate.routeCount++;
      out.candidate.lineCount++;
      out.candidate.totalQty += q;
      var sk = sstr(r.sku); if (sk && !skuSeen[sk]) { skuSeen[sk] = 1; out.candidate.skus.push(sk); }
      var m = sstr(r.shipping_method); if (m && !methodSeen[m]) { methodSeen[m] = 1; out.candidate.methods.push(m); }
      var dt = sstr(r.destination_type).toUpperCase(), dc = sstr(r.destination_code);
      var dk = dt + ':' + dc;
      if (dt && !destSeen[dk]) { destSeen[dk] = 1; out.candidate.destinations.push({ type: dt, code: dc }); }
      // §I.2 - how many PHYSICAL shipping plans this submit will produce, on the writer's own dimensions.
      var gk = planGroupKey(r);
      if (!groupSeen[gk]) { groupSeen[gk] = 1; out.candidate.planGroups.push(gk); }
    });
    out.candidate.planGroupCount = out.candidate.planGroups.length;
    // Headers the station holds that carry no quantity-bearing route of their own (the live H1/H2 shape).
    var zeroLine = toInt(input.zeroLineHeaderCount);
    if (zeroLine > 0) excl['ZERO_LINE_HEADER'] = zeroLine;
    out.excluded = Object.keys(excl).map(function (k) { return { reason: k, count: excl[k] }; })
      .sort(function (a, b) { return a.reason < b.reason ? -1 : 1; });

    if (!out.candidate.draftIds.length) { out.code = C.NO_PERSISTED_CANDIDATE; return out; }

    // The confirmation is NOT built here. §5 requires it to exist only after the persisted read-back and the
    // quantity verification have run, and those are async - so evaluate() ends at the candidate set and
    // buildConfirmation() is a separate, later step that cannot be reached from a blocked verdict.
    out.scope = {
      company: sstr(input.scope && input.scope.company),
      country: sstr(input.scope && input.scope.country),
      marketplace: sstr(input.scope && input.scope.marketplace)
    };
    out.ok = true;
    return out;
  }

  // ---- THE CONFIRMATION -----------------------------------------------------------------------------------
  // Built from the PERSISTED candidate set and from nothing else - never the DOM - so what it promises is
  // exactly what the server will re-read. It REFUSES (returns null, and Submit stops) unless the verdict it is
  // given is clean, a candidate exists, and no forbidden exclusion is present. `verification` carries the
  // read-back's own verdict verbatim; an inconclusive read is REPORTED as inconclusive and never dressed up as
  // a verification that happened.
  function buildConfirmation(pf, verification) {
    if (!pf || pf.ok !== true) return null;
    if (!pf.candidate || !arr(pf.candidate.draftIds).length) return null;
    var bad = arr(pf.excluded).filter(function (e) {
      return IR_FORBIDDEN_CONFIRMATION_EXCLUSIONS.indexOf(sstr(e && e.reason)) !== -1;
    });
    if (bad.length) return null;
    var v = verification || {};
    return {
      scope: {
        company: sstr(pf.scope && pf.scope.company),
        country: sstr(pf.scope && pf.scope.country),
        marketplace: sstr(pf.scope && pf.scope.marketplace)
      },
      routeCount: pf.candidate.routeCount,
      skuCount: arr(pf.candidate.skus).length,
      lineCount: pf.candidate.lineCount,
      totalQty: pf.candidate.totalQty,
      // §I.3 - the operator is told how many Weekly Shipping Plans the confirmation will produce, not only
      // how many routes go in. Two routes can become one plan or two, and that is the thing they are about
      // to create.
      planGroupCount: toInt(pf.candidate.planGroupCount),
      methods: arr(pf.candidate.methods).slice(),
      destinations: arr(pf.candidate.destinations).slice(),
      excluded: arr(pf.excluded).slice(),
      persistedOnly: true,
      verification: { verdict: sstr(v.verdict) || 'UNVERIFIABLE', checked: toInt(v.checked) }
    };
  }

  var IRSubmitPreflight = {
    CODES: IR_SUBMIT_CODES,
    PROVENANCE: IR_ROUTE_PROVENANCE,
    DIRTY_SOURCES: IR_DIRTY_SOURCES,
    FORBIDDEN_CONFIRMATION_EXCLUSIONS: IR_FORBIDDEN_CONFIRMATION_EXCLUSIONS,
    isPersisted: routeIsPersisted,
    planGroupKey: planGroupKey,
    evaluate: submitPreflight,
    buildConfirmation: buildConfirmation
  };

  var IRPlanningReveal = {
    STATES: IR_REVEAL_STATES,
    CODES: IR_READINESS_CODES,
    isTerminal: revealIsTerminal,
    classifyReadFailure: classifyReadFailure,
    recommendationReadiness: recommendationReadiness,
    executionReadiness: executionReadiness,
    createPanelGate: createPanelGate
  };

  return { IRCountry: IRCountry, IRWarehouse: IRWarehouse, IRDraft: IRDraft, IRDraftWorkspace: IRDraftWorkspace, IRService: IRService, IRPlanningReveal: IRPlanningReveal, IRSubmitPreflight: IRSubmitPreflight, IRRouteProvenance: IRRouteProvenance };
});
