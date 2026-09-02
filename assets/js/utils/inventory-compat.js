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
  if (root) { root.IRCountry = mod.IRCountry; root.IRWarehouse = mod.IRWarehouse; root.IRDraft = mod.IRDraft; root.IRDraftWorkspace = mod.IRDraftWorkspace; root.IRService = mod.IRService; }
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

  return { IRCountry: IRCountry, IRWarehouse: IRWarehouse, IRDraft: IRDraft, IRDraftWorkspace: IRDraftWorkspace, IRService: IRService };
});
