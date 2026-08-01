// Kitchen Mama Operation System — Canonical Supply Planning Calculation Core (Lane B — Phase 2A
// primitives + Phase 2B normalized-sales engine + Phase 2B Forecast-Driven demand engine +
// Phase 2B Required-By Window classifier §26/§27A)
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC calculation lane. This file ORIGINATED as the Phase 2A pure arithmetic
// primitives and now ALSO contains the implemented Phase 2B §22 / §29E normalized-sales pure sampling
// engine (Round 3.1 marketplace-scope isolation; Round 3.1.1 Event precedence + Daily Sales company
// isolation) AND the implemented Phase 2B §2D / §29F / §29G Forecast-Driven demand engine (Round 4) AND the
// implemented Phase 2B §26 / §27 / §27A Required-By Window pure classifier (Round 5 — `classifyRequiredByWindow`,
// nested contract §27A.1). It is NOT primitives-only; the normalized-sales engine, the Forecast-Driven engine
// and the Required-By classifier are all IMPLEMENTED (not pending) — it remains a pure, deterministic
// calculation lane with no side effects.
//
// Canonical Formula Owner: docs/planning/SUPPLY_PLANNING_CALCULATION_RULES.md (v4.4).
// This module implements these frozen sections, verbatim to their formulas:
//   • §2D  Forecast-Driven Formula — Adjusted Regular FC (Target Rule) + 30-Day Safety + Special Event
//   • §10  Special Event Pull-Forward — Event Preparation Date = Event Start − 30 calendar days
//   • §11  Shortage / Surplus definitions from a Projected Balance
//   • §12  Company Reallocation — feasible-reallocation primitive + Net Order Need = Σ remaining shortage
//   • §14  Order Need & Carton Rounding — Suggested Order Qty = CEILING(need ÷ UPC) × UPC
//   • §22  Normalized Avg Sales / Day — pure normalized-sales sampling engine (marketplace-scope isolated)
//   • §29E Normalized-sales sampling window + fallback ladder (companion to §22)
//   • §29F Forecast-Driven Adjusted Regular FC (Target Rule priority SKU > Series > Category > default 100%)
//   • §29G 30-Day Safety Demand — actual-calendar-day daily demand × 30 (additional coverage, no overlap)
//   • §31  Calculated Gap → Shipment FLOOR → Residual Production → Order CEILING (worked example)
//   • §32  Company Reallocation Feasibility Freeze — MIN primitive + consume-once bookkeeping
//   • §26/§27/§27A Required-By Window classifier — Engine A daysOut buckets + Engine B monthDelta tiers as
//     two INDEPENDENT adapters (no 1:1 map); nested output {daysOut, monthDelta, engineA, engineB}
//   • §32A Reallocation Eligibility pure predicate — evaluateReallocationEligibility: Same-Master-SKU
//     exact equality + Engine B-only tier ordering (donorRank <= receiverRank over T1/T2/T3); pure yes/no,
//     no quantity, no DB/identity/route/iteration (those stay caller/Line-Runtime concerns)
//   • §34A Missing / Stale Data pure classifier — classifyPlanningDataState (IMPLEMENTED Round 8B): pure
//     input-readiness state { state, calculationAllowed } over MISSING_SNAPSHOT / STALE_SNAPSHOT /
//     MISSING_FORECAST / MISSING_SALES_BASIS / OK; snapshot/forecast ACQUISITION stays a caller/DB concern
//
// FORECAST-DRIVEN SCOPE (§2D/§29F/§29G): the Special Event input is a pre-scoped / pre-aggregated
// count-once quantity (added at 100%, never Target-adjusted); the Qualified supply inputs (Current Stock /
// Timely Qualified Incoming / Timely Approved-Committed Supply) are caller-resolved. The Scenario #27 event
// identity / count-once owner is NOT implemented. The Scenario #30 missing-forecast READINESS classifier IS
// implemented as the pure §34A `classifyPlanningDataState` (Scenario #29 and #30 are EXECUTED in the Golden
// suite); only the pure readiness classifier is implemented — the missing-forecast / snapshot DB acquisition,
// adapter, and UI are NOT implemented. Forecast-Driven Avg Sales is reference-only and never enters the formula.
//
// SCOPE BOUNDARY (what this module NEVER does):
//   • No Runtime (Line Runtime, Ledger Runtime, Allocation Runtime all NOT implemented; the full 40-scenario
//     Runtime is incomplete — 25 executed / 15 pending / 0 canonical-blocked), no loader/router wiring, no DB,
//     no schema, no writer, no network, no UI.
//   • No system clock (all dates are caller-provided; UTC arithmetic only, timezone-shift-free).
//   • It does NOT decide Qualified-Incoming DB status / allowlist (BLOCKED-B4), the line/source
//     grain or writer (BLOCKED-B5), or any serial/sequence allocation & concurrency (BLOCKED-B6).
//   • It does NOT resolve DB identity, company scope, donor/receiver candidate enumeration, route
//     timing, packaging compatibility, company ownership transfer, inventory movement / qualification,
//     group-key (B-2), Qualified allowlist (B-4), allocation iteration, deterministic pair ordering,
//     persistence, or concurrency. `evaluateReallocationEligibility` (§32A) ONLY compares the
//     caller-resolved Master SKU strings and Required-By dates through the frozen Engine B predicate —
//     it is a pure yes/no eligibility gate, NOT a Line Runtime owner.
//     Callers pass ALREADY-QUALIFIED, ALREADY-FEASIBLE quantities to the relevant §12/§32 arithmetic
//     helpers; quantity/feasibility gating happens upstream (§12/§32 business predicates are NOT here).
//     This boundary constrains those reallocation helpers — it does NOT reduce the whole module to
//     primitives: the §22/§29E normalized-sales engine, the Forecast-Driven engine, the Required-By
//     classifier and the §32A eligibility predicate live here too (see header). The module stays pure.
//   • User partial-carton override (§14) is a caller concern — NOT part of these pure functions.
//
// INPUT SAFETY: every quantity must be a finite, non-negative `number` (NaN / Infinity / -Infinity /
//   numeric strings / negatives are rejected — no silent coercion, no silent default). The single
//   exception is `projectedBalance`, which may be a finite negative number. `unitsPerCarton` must be a
//   positive integer (never defaulted to 1, 12, or anything). Missing/invalid UPC hard-blocks the
//   calculation (throws) instead of fabricating a quantity (§14 / §34).
// -----------------------------------------------------------------------------

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') {
    window.KM = window.KM || {};
    window.KM.core = window.KM.core || {};
    window.KM.core.supplyPlanningCalculations = api;
  }
})(this, function () {
  'use strict';

  // ---- validation helpers (private) -----------------------------------------
  // A finite, non-negative number. Rejects NaN / ±Infinity / strings / negatives (no coercion).
  function assertQty(v, name) {
    if (typeof v !== 'number' || !isFinite(v)) {
      throw new Error('supplyPlanningCalculations: ' + name + ' must be a finite number (got ' + describe(v) + ')');
    }
    if (v < 0) {
      throw new Error('supplyPlanningCalculations: ' + name + ' must be non-negative (got ' + v + ')');
    }
    return v;
  }
  // A finite number that MAY be negative (used only for Projected Balance, §11).
  function assertFiniteNumber(v, name) {
    if (typeof v !== 'number' || !isFinite(v)) {
      throw new Error('supplyPlanningCalculations: ' + name + ' must be a finite number (got ' + describe(v) + ')');
    }
    return v;
  }
  // Units Per Carton: a positive integer. No silent default — missing/invalid hard-blocks (§14/§34).
  function assertUnitsPerCarton(v) {
    if (typeof v !== 'number' || !isFinite(v) || Math.floor(v) !== v || v < 1) {
      throw new Error('supplyPlanningCalculations: unitsPerCarton must be a positive integer — ' +
        'missing/invalid UPC blocks the calculation (no silent default of 1/12/any) (got ' + describe(v) + ')');
    }
    return v;
  }
  function describe(v) {
    if (typeof v === 'number') return String(v);
    if (v === null) return 'null';
    if (typeof v === 'string') return 'string "' + v + '"';
    return typeof v;
  }
  function pad2(n) { var s = String(n); return s.length < 2 ? '0' + s : s; }

  // ---- calendar helpers (private; no system clock, UTC-only) ----------------
  function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0); }
  function isRealCalendarDate(y, m, d) {
    if (m < 1 || m > 12 || d < 1) return false;
    var dim = [31, (isLeap(y) ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return d <= dim[m - 1];
  }
  // Strict `YYYY-MM-DD` (exactly 4-2-2 digits), validated against the real calendar. No locale parsing.
  function parseStrictIsoDate(s) {
    if (typeof s !== 'string') {
      throw new Error('supplyPlanningCalculations: eventStartDate must be a "YYYY-MM-DD" string (got ' + describe(s) + ')');
    }
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) {
      throw new Error('supplyPlanningCalculations: eventStartDate must match strict YYYY-MM-DD (got "' + s + '")');
    }
    var y = parseInt(m[1], 10), mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
    if (!isRealCalendarDate(y, mo, d)) {
      throw new Error('supplyPlanningCalculations: eventStartDate is not a real calendar date ("' + s + '")');
    }
    return { y: y, mo: mo, d: d };
  }

  var MS_PER_DAY = 24 * 60 * 60 * 1000;

  // §10 — Event Preparation Date = Event Start Date − 30 calendar days. Deterministic UTC arithmetic
  // (no system clock, no timezone shift; UTC days are exactly 86,400,000 ms with no DST). Output YYYY-MM-DD.
  function eventPreparationDate(eventStartDate) {
    var p = parseStrictIsoDate(eventStartDate);
    var startMs = Date.UTC(p.y, p.mo - 1, p.d);
    var prepMs = startMs - 30 * MS_PER_DAY;
    var dt = new Date(prepMs);   // constructed from explicit epoch ms — does NOT read the clock
    return dt.getUTCFullYear() + '-' + pad2(dt.getUTCMonth() + 1) + '-' + pad2(dt.getUTCDate());
  }

  // §10 — the YYYY-MM containing the Preparation Date (the month the Monthly UI places event demand in).
  function eventPreparationMonth(eventStartDate) {
    return eventPreparationDate(eventStartDate).slice(0, 7);
  }

  // §31 — Calculated Gap = MAX(Demand − Current Stock − Timely Qualified Incoming − Timely Approved/
  // Committed Supply, 0). All inputs are ALREADY-QUALIFIED quantities supplied by the caller (this
  // function never decides qualification / lifecycle status / B-4 allowlist / DB reads).
  function calculateGap(input) {
    var i = input || {};
    var demand = assertQty(i.demand, 'demand');
    var stock = assertQty(i.destinationCurrentStock, 'destinationCurrentStock');
    var incoming = assertQty(i.timelyQualifiedIncoming, 'timelyQualifiedIncoming');
    var committed = assertQty(i.timelyApprovedCommittedSupply, 'timelyApprovedCommittedSupply');
    return Math.max(demand - stock - incoming - committed, 0);
  }

  // §11 — classify a Projected Balance into shortage / surplus (balance may be a finite negative number).
  function classifyProjectedBalance(projectedBalance) {
    var b = assertFiniteNumber(projectedBalance, 'projectedBalance');
    if (b < 0) return { shortage: Math.abs(b), surplus: 0 };
    if (b > 0) return { shortage: 0, surplus: b };
    return { shortage: 0, surplus: 0 };
  }

  // §31 / §2C.1 — Shipment FLOOR + carton-adjusted Residual Production.
  //   Raw Shippable Qty        = MIN(Calculated Gap, Eligible Source Available)
  //   Recommended Shipping Qty = FLOOR(Raw Shippable ÷ UPC) × UPC   (whole cartons of what is available)
  //   Residual Production      = MAX(Gap − Recommended Shipping − Other Legally Allocated Timely Supply, 0)
  // NOTE (canonical): Residual is computed from the FLOOR'd shipping result, NOT `Gap − Raw Source`
  // (that forbidden form under-counts production when the source remainder is a partial carton).
  function calculateShippingAndResidual(input) {
    var i = input || {};
    var gap = assertQty(i.calculatedGap, 'calculatedGap');
    var source = assertQty(i.eligibleSourceAvailable, 'eligibleSourceAvailable');
    var other = assertQty(i.otherLegallyAllocatedTimelySupply, 'otherLegallyAllocatedTimelySupply');
    var upc = assertUnitsPerCarton(i.unitsPerCarton);

    var rawShippableQty = Math.min(gap, source);
    var recommendedShippingQty = Math.floor(rawShippableQty / upc) * upc;
    var residualProductionRequired = Math.max(gap - recommendedShippingQty - other, 0);

    return {
      rawShippableQty: rawShippableQty,
      recommendedShippingQty: recommendedShippingQty,
      residualProductionRequired: residualProductionRequired
    };
  }

  // §14 / §31 — Suggested Order Qty = CEILING(Net Order Need ÷ UPC) × UPC. Missing/invalid UPC throws
  // (Send Request would be blocked; never a silent default / fabricated quantity).
  function calculateSuggestedOrderQty(input) {
    var i = input || {};
    var need = assertQty(i.netOrderNeed, 'netOrderNeed');
    var upc = assertUnitsPerCarton(i.unitsPerCarton);
    return Math.ceil(need / upc) * upc;
  }

  // §12 / §32 — feasible reallocation PRIMITIVE: qty = MIN(receiver shortage, donor surplus, timely
  // transferable). Timely-transferable is caller-supplied (route/tier/packaging feasibility lives
  // upstream — NOT here). Pure: returns a number, mutates nothing.
  function feasibleReallocationQty(input) {
    var i = input || {};
    var recv = assertQty(i.receiverRemainingShortage, 'receiverRemainingShortage');
    var donor = assertQty(i.donorRemainingSurplus, 'donorRemainingSurplus');
    var timely = assertQty(i.timelyTransferableQty, 'timelyTransferableQty');
    return Math.min(recv, donor, timely);
  }

  // §32 — apply ONE feasible reallocation and return the decremented remainders (each surplus consumed
  // once). Returns a NEW object; NEVER mutates the input. All outputs are non-negative.
  function applyFeasibleReallocation(input) {
    var i = input || {};
    var recv = assertQty(i.receiverRemainingShortage, 'receiverRemainingShortage');
    var donor = assertQty(i.donorRemainingSurplus, 'donorRemainingSurplus');
    var timely = assertQty(i.timelyTransferableQty, 'timelyTransferableQty');
    var qty = Math.min(recv, donor, timely);
    return {
      reallocatedQty: qty,
      receiverRemainingShortage: recv - qty,
      donorRemainingSurplus: donor - qty
    };
  }

  // ---- §22 / §29E — Normalized Avg Sales / Day sampling engine (pure; caller-provided dates) -------
  // Canonical: docs/planning/SUPPLY_PLANNING_CALCULATION_RULES.md §22 (+ §29E). Sales-Driven Avg
  // Sales/Day = within the latest 90 COMPLETED calendar days (calc date EXCLUDED), walk newest→oldest
  // and take the latest ≤30 ELIGIBLE NORMAL sales days — confirmed daily-sales rows for THIS sku, with
  // this sku's Campaign/Deal/Special-Event SELLING dates excluded — divided by the ACTUAL
  // normal_day_count (never a fixed 30). Fallback ladder (§22.3):
  //   normal_day_count ≥ 7   → source normalized_30d, warning '' (blank)
  //   normal_day_count 3–6   → source normalized_30d, warning low_sample_warning
  //   normal_day_count < 3   → source weekly_7d, warning insufficient_normal_days, value = sales_units_7d ÷ 7
  // No contamination = zero excluded dates; the ladder still applies (weekly_7d is ONLY the <3 rung,
  // never a "no-contamination default"). Canonical MARKETPLACE-SCOPE isolation (Round 3.1): a Campaign
  // contaminates only when a campaign_sku_line's marketplace_sku_id === scope.marketplaceSkuId (never by
  // Master `sku` alone); an Event contaminates only when the Master sku matches AND the event resolves to
  // this scope by marketplace_id precedence: Event marketplace_id is AUTHORITATIVE when present, and an
  // ID-bearing Event requires a resolved scope.marketplaceId; the company+country+marketplace composite is
  // the fallback ONLY when the Event marketplace_id is absent, and an ID mismatch never falls back to the
  // composite. Daily Sales are isolated by the natural
  // key snapshot_date+country+marketplace+channel+sku (a same-date row on another scope never overwrites
  // this scope, and a duplicate exact natural key is a deterministic failure). Cancelled/invalid events not
  // excluded; Event Preparation Date is NOT a contamination period; Campaign∩Event overlap excluded
  // once (date Set). Confirmed zero-sales row = an eligible normal day (value 0, in the denominator);
  // a missing date/row is never auto-zero and never counts. Pure: no clock, UTC-only, full precision.
  function _parseIso(s, name) {
    if (typeof s !== 'string') throw new Error('supplyPlanningCalculations: ' + name + ' must be a "YYYY-MM-DD" string (got ' + describe(s) + ')');
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) throw new Error('supplyPlanningCalculations: ' + name + ' must match strict YYYY-MM-DD (got "' + s + '")');
    var y = parseInt(m[1], 10), mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
    if (!isRealCalendarDate(y, mo, d)) throw new Error('supplyPlanningCalculations: ' + name + ' is not a real calendar date ("' + s + '")');
    return Date.UTC(y, mo - 1, d);
  }
  function _isoOf(ms) {
    var dt = new Date(ms);
    return dt.getUTCFullYear() + '-' + pad2(dt.getUTCMonth() + 1) + '-' + pad2(dt.getUTCDate());
  }
  // Add every calendar date in [startMs,endMs] that also lies inside [winStartMs,winEndMs] to `set`.
  function _addRangeWithinWindow(set, startMs, endMs, winStartMs, winEndMs) {
    var from = Math.max(startMs, winStartMs), to = Math.min(endMs, winEndMs);
    for (var ms = from; ms <= to; ms += MS_PER_DAY) set[_isoOf(ms)] = true;
  }
  function _eventActive(status) {
    if (status == null) return true;               // unspecified = applicable (caller pre-scoped)
    var s = String(status).toLowerCase();
    return s !== 'cancelled' && s !== 'canceled' && s !== 'invalid';
  }
  // Canonical scope-identity accessor: a scope field must be a string; empty/missing throws when required.
  function _scopeString(scope, name, required) {
    var v = scope[name];
    if (v == null || v === '') {
      if (required) throw new Error('supplyPlanningCalculations: scope.' + name + ' must be a non-empty string (canonical marketplace identity must be resolved before scope isolation)');
      return null;
    }
    if (typeof v !== 'string') throw new Error('supplyPlanningCalculations: scope.' + name + ' must be a string (got ' + describe(v) + ')');
    return v;
  }
  function normalizedAvgSalesPerDay(input) {
    var i = input || {};
    var calcMs = _parseIso(i.calcDate, 'calcDate');
    var scope = i.scope;
    if (scope == null || typeof scope !== 'object') throw new Error('supplyPlanningCalculations: scope must be an object carrying the canonical marketplace identity {marketplaceSkuId, marketplaceId, sku, company, country, marketplace, channel}');
    var sku = _scopeString(scope, 'sku', true);                 // Master SKU (snapshot key only — NOT the marketplace identity)
    var country = _scopeString(scope, 'country', true);
    var marketplace = _scopeString(scope, 'marketplace', true);
    var channel = _scopeString(scope, 'channel', true);
    var marketplaceSkuId = _scopeString(scope, 'marketplaceSkuId', false);   // campaign_sku_line primary identity
    var marketplaceId = _scopeString(scope, 'marketplaceId', false);
    // company is a REQUIRED Analysis-Layer identity resolved upstream (US may contain both KM and ResUS;
    // Country alone is not sufficient). It is NOT a column of amazon_daily_sales_snapshot and is NEVER
    // inferred from channel / country / marketplace / marketplaceSkuId.
    var company = _scopeString(scope, 'company', true);
    var weekly7d = assertQty(i.weekly7d, 'weekly7d');           // sales_units_7d (for the <3 fallback rung)
    if (!Array.isArray(i.dailySales)) throw new Error('supplyPlanningCalculations: dailySales must be an array of {date,sku,units,company,country,marketplace,channel} (company = resolved Analysis-Layer identity)');
    var campaigns = i.campaigns == null ? [] : i.campaigns;
    var events = i.events == null ? [] : i.events;
    if (!Array.isArray(campaigns)) throw new Error('supplyPlanningCalculations: campaigns must be an array');
    if (!Array.isArray(events)) throw new Error('supplyPlanningCalculations: events must be an array');
    if (campaigns.length && marketplaceSkuId == null) throw new Error('supplyPlanningCalculations: scope.marketplaceSkuId is required to isolate campaign contamination (campaigns present)');

    // 90 COMPLETED days, calc date excluded: window = [calc − 90d, calc − 1d].
    var winEndMs = calcMs - MS_PER_DAY;
    var winStartMs = calcMs - 90 * MS_PER_DAY;

    // Contaminated selling-date set (dedup ⇒ Campaign∩Event overlap counted once). Cancelled/invalid
    // never remove days. Campaign match = a campaign_sku_line whose marketplace_sku_id === scope
    // marketplace_sku_id (NEVER Master `sku` alone); a same-Master-SKU line missing marketplace_sku_id
    // is un-resolved canonical identity → deterministic failure. Event match = exact Master sku AND then:
    // marketplace_id is AUTHORITATIVE when present — ONLY an exact marketplace_id match is in scope, and an
    // ID mismatch can NEVER fall back to company+country+marketplace; the company+country+marketplace
    // composite is the fallback ONLY when the event has no marketplace_id. Another scope's event never
    // contaminates.
    var contaminated = {};
    campaigns.forEach(function (c, idx) {
      c = c || {};
      if (!_eventActive(c.status)) return;                       // cancelled/invalid campaign excludes nothing
      var lines = c.skuLines;
      if (!Array.isArray(lines)) throw new Error('supplyPlanningCalculations: campaigns[' + idx + '].skuLines must be an array of {marketplaceSkuId, sku}');
      var participates = false;
      for (var li = 0; li < lines.length; li++) {
        var line = lines[li] || {};
        var mSkuId = line.marketplaceSkuId;
        if (typeof mSkuId === 'string' && mSkuId !== '') {
          if (mSkuId === marketplaceSkuId) participates = true;  // exact marketplace-SKU identity → in scope
          // a different marketplace_sku_id belongs to another site → never contaminates this scope
        } else if (line.sku == null || line.sku === sku) {
          // same Master SKU (or unspecified) but NO marketplace_sku_id → cannot prove scope membership
          throw new Error('supplyPlanningCalculations: campaigns[' + idx + '].skuLines[' + li + '] is missing marketplaceSkuId for master sku "' + sku + '" — canonical marketplace-SKU identity must be resolved before scope isolation (refusing to guess by master sku)');
        }
        // else: a different Master SKU with no marketplace_sku_id → unrelated to this scope, ignored
      }
      if (participates) _addRangeWithinWindow(contaminated, _parseIso(c.start, 'campaigns[' + idx + '].start'), _parseIso(c.end, 'campaigns[' + idx + '].end'), winStartMs, winEndMs);
    });
    events.forEach(function (e, idx) {
      e = e || {};
      if (!_eventActive(e.status)) return;                       // cancelled/invalid never removes days
      if (e.sku !== sku) return;                                 // exact Master SKU match required
      var hasMktId = e.marketplaceId != null && e.marketplaceId !== '';
      var inScope;
      if (hasMktId) {
        // A present-but-non-string marketplaceId is a resolution defect → deterministic reject (it is NOT
        // silently treated as "missing" and downgraded to the composite fallback).
        if (typeof e.marketplaceId !== 'string') throw new Error('supplyPlanningCalculations: events[' + idx + '].marketplaceId must be a string when present (got ' + describe(e.marketplaceId) + ')');
        // marketplace_id is authoritative: ONLY an exact marketplace_id match is in scope. An ID mismatch is
        // out-of-scope even when company + country + marketplace all match — no composite fallback rescues it.
        // An ID-bearing event REQUIRES a resolved scope.marketplaceId; an unresolved scope must fail-fast rather
        // than silently drop the event (a silent drop would let contamination leak through as a false out-of-scope).
        if (marketplaceId == null) throw new Error('supplyPlanningCalculations: events[' + idx + '] carries an authoritative marketplaceId ("' + e.marketplaceId + '") but scope.marketplaceId is required to isolate an ID-bearing event (a resolved scope marketplace_id must be provided — the event is never silently ignored and never rescued by the company+country+marketplace composite)');
        inScope = (e.marketplaceId === marketplaceId);
      } else {
        // No marketplace_id ⇒ the COMPLETE company + country + marketplace composite is the only fallback;
        // an incomplete or mismatched composite is never guessed into a match.
        inScope = (e.company === company && e.country === country && e.marketplace === marketplace);
      }
      if (!inScope) return;                                      // another scope's event never contaminates
      _addRangeWithinWindow(contaminated, _parseIso(e.start, 'events[' + idx + '].start'), _parseIso(e.end, 'events[' + idx + '].end'), winStartMs, winEndMs);
    });

    // Confirmed daily-sales rows isolated by the PERSISTED source natural key (snapshot_date + country +
    // marketplace + channel + sku) PLUS the Analysis-Layer `company` scope. The persisted source natural
    // key is unchanged (company is NOT part of it and is NOT a DB column). `company` is a required
    // upstream-resolved identity and is NEVER inferred from channel / country / marketplace / marketplaceSkuId.
    //   • A candidate row matching the source dimensions but with no resolved company → fail-fast.
    //   • Two rows on ONE persisted source key resolving to DIFFERENT companies → ambiguous → fail-fast.
    //   • Two rows on the same source key AND same company → exact duplicate → fail-fast.
    // Ambiguity + duplicate detection run BEFORE the scope-company filter AND BEFORE the window filter, so
    // they can never be masked. A row of another resolved company is never sampled.
    var keyCompany = {};        // persisted source key (= date, since source dims are fixed to scope) → resolved company
    var byDate = {};
    i.dailySales.forEach(function (row, idx) {
      row = row || {};
      // 1) Match the PERSISTED source dimensions first (any other marketplace scope → skip; no company needed).
      if (row.sku !== sku || row.country !== country || row.marketplace !== marketplace || row.channel !== channel) return;
      // 2) A source-dimension match REQUIRES a resolved company (Analysis-Layer). No channel/country guessing.
      if (row.company == null || row.company === '') throw new Error('supplyPlanningCalculations: unresolved daily-sales company scope — dailySales[' + idx + '] matches the source natural key (' + country + '/' + marketplace + '/' + channel + '/' + sku + ') but has no resolved company (Analysis-Layer identity must be resolved upstream; never inferred)');
      if (typeof row.company !== 'string') throw new Error('supplyPlanningCalculations: dailySales[' + idx + '].company must be a string (got ' + describe(row.company) + ')');
      var ms = _parseIso(row.date, 'dailySales[' + idx + '].date');
      var key = _isoOf(ms);                                // persisted source key = date (source dims fixed to scope)
      // 3) Ambiguity / duplicate on ONE persisted source key — BEFORE any scope-company or window filtering.
      if (Object.prototype.hasOwnProperty.call(keyCompany, key)) {
        if (keyCompany[key] !== row.company) throw new Error('supplyPlanningCalculations: ambiguous daily-sales company resolution for one source natural key (snapshot_date=' + key + ', ' + country + '/' + marketplace + '/' + channel + '/' + sku + ') resolves to both "' + keyCompany[key] + '" and "' + row.company + '" — one persisted source key must resolve to exactly one company');
        throw new Error('supplyPlanningCalculations: duplicate daily-sales natural key (snapshot_date=' + key + ', country=' + country + ', marketplace=' + marketplace + ', channel=' + channel + ', sku=' + sku + ', company=' + row.company + ') — the natural key must be unique (no last-write-wins)');
      }
      keyCompany[key] = row.company;
      // 4) Analysis-Layer company scope: a row of ANOTHER resolved company is never sampled.
      if (row.company !== company) return;
      // 5) Window filter (in-scope company, but outside the 90-day window → never sampled).
      if (ms < winStartMs || ms > winEndMs) return;
      byDate[key] = assertQty(row.units, 'dailySales[' + idx + '].units');   // confirmed row; 0 is a real value
    });

    // Eligible NORMAL days = rows whose date is NOT contaminated. Newest→oldest, take the latest ≤30.
    var eligible = Object.keys(byDate).filter(function (d) { return !contaminated[d]; })
      .sort(function (a, b) { return a < b ? 1 : (a > b ? -1 : 0); });   // DESC (newest first)
    var selected = eligible.slice(0, 30);
    var normalDayCount = selected.length;
    var sum = 0;
    selected.forEach(function (d) { sum += byDate[d]; });

    var excludedDates = Object.keys(byDate).filter(function (d) { return contaminated[d]; })
      .sort(function (a, b) { return a < b ? -1 : (a > b ? 1 : 0); });

    var source, warning, avg;
    if (normalDayCount >= 7) { source = 'normalized_30d'; warning = ''; avg = sum / normalDayCount; }
    else if (normalDayCount >= 3) { source = 'normalized_30d'; warning = 'low_sample_warning'; avg = sum / normalDayCount; }
    else { source = 'weekly_7d'; warning = 'insufficient_normal_days'; avg = weekly7d / 7; }

    return {
      source: source,
      warning: warning,
      normalDayCount: normalDayCount,
      avgSalesPerDay: avg,
      windowStart: _isoOf(winStartMs),
      windowEnd: _isoOf(winEndMs),
      selectedDates: selected,          // newest → oldest, ≤30
      excludedDates: excludedDates      // contaminated dates that had a row for this sku (evidence)
    };
  }

  // §12 / §32 — Net Order Need = Σ (Remaining Shortage after legal reallocation). Sums a list of
  // non-negative remaining-shortage values. Does not mutate the input array.
  function sumRemainingShortages(values) {
    if (!Array.isArray(values)) {
      throw new Error('supplyPlanningCalculations: sumRemainingShortages expects an array of non-negative numbers');
    }
    var total = 0;
    for (var idx = 0; idx < values.length; idx++) {
      total += assertQty(values[idx], 'remainingShortage[' + idx + ']');
    }
    return total;
  }

  // §2D / §29F / §29G — Forecast-Driven pure demand engine (Modes B & D). Adjusted Regular FC = Base FC ×
  // Target Rule (priority SKU > Series > Category > default 100%); Forecast Daily Demand = (Adj M+1 +
  // Adj M+2) ÷ (M+1 actual calendar days + M+2 actual calendar days); Safety Demand = Forecast Daily
  // Demand × 30 (the ADDITIONAL 30-day coverage AFTER the M+1/M+2 60-day coverage — never overlapping/
  // re-counting them). Total Forecast-Driven Demand = Adjusted Regular FC + Safety Demand + Special Event
  // Demand (Special Event added ONCE at 100%, NEVER Target-adjusted). Forecast-Driven Remaining Need =
  // MAX(Total − Current Stock − Timely Qualified Incoming − Timely Approved/Committed Supply, 0) via
  // calculateGap() (each supply term deducted EXACTLY ONCE). This is an Engine A live shortage — NOT
  // Suggested Order Qty; no carton rounding, no reallocation. Pure: no clock, month arithmetic only, full
  // float precision (no intermediate integer/carton rounding). Forecast-Driven Avg Sales is reference-only
  // and NEVER enters this formula. Special Event input is a pre-scoped / pre-aggregated count-once qty;
  // Qualified supply inputs are caller-resolved (this engine decides no DB status / allowlist / lifecycle).

  // Strict "YYYY-MM" → {y, mo}. Real month only; no locale parsing, no system clock.
  function _parseYearMonth(s, name) {
    if (typeof s !== 'string') throw new Error('supplyPlanningCalculations: ' + name + ' must be a "YYYY-MM" string (got ' + describe(s) + ')');
    var m = /^(\d{4})-(\d{2})$/.exec(s);
    if (!m) throw new Error('supplyPlanningCalculations: ' + name + ' must match strict YYYY-MM (got "' + s + '")');
    var y = parseInt(m[1], 10), mo = parseInt(m[2], 10);
    if (mo < 1 || mo > 12) throw new Error('supplyPlanningCalculations: ' + name + ' is not a real month ("' + s + '")');
    return { y: y, mo: mo };
  }
  // Actual calendar-day count of a given year+month (leap-aware; never a fixed 30; no clock).
  function _daysInMonth(y, mo) {
    return [31, (isLeap(y) ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  }
  // A Target Rule percent must be a finite, non-negative number (50 means 50%, NOT 0.5). 0 is a VALID
  // explicit rule (never treated as missing). A present-but-invalid value at the SELECTED level throws.
  function _assertPercent(v, name) {
    if (typeof v !== 'number' || !isFinite(v)) throw new Error('supplyPlanningCalculations: ' + name + ' must be a finite number percent (50 = 50%, never a fraction) (got ' + describe(v) + ')');
    if (v < 0) throw new Error('supplyPlanningCalculations: ' + name + ' must be non-negative (got ' + v + ')');
    return v;
  }
  // Target Rule priority resolution: SKU > Series > Category > default 100%. A level is "present" only when
  // its value is neither undefined nor null; a present level MUST validate (throw otherwise — NEVER a silent
  // fallback to a lower level). All three absent → default 100%.
  function _resolveTargetRule(rules) {
    var r = rules || {};
    if (r.skuPercent != null) return { source: 'sku', percent: _assertPercent(r.skuPercent, 'targetRules.skuPercent') };
    if (r.seriesPercent != null) return { source: 'series', percent: _assertPercent(r.seriesPercent, 'targetRules.seriesPercent') };
    if (r.categoryPercent != null) return { source: 'category', percent: _assertPercent(r.categoryPercent, 'targetRules.categoryPercent') };
    return { source: 'default', percent: 100 };
  }

  function calculateForecastDrivenRemainingNeed(input) {
    var i = input || {};
    var fm1 = i.forecastMonth1 || {};
    var fm2 = i.forecastMonth2 || {};
    // Month contract: strict YYYY-MM real months; Month 2 = the calendar month immediately after Month 1
    // (Dec → next-year Jan). Calendar days derived by the pure engine — no clock, no locale parsing.
    var ym1 = _parseYearMonth(fm1.month, 'forecastMonth1.month');
    var ym2 = _parseYearMonth(fm2.month, 'forecastMonth2.month');
    var expectedY = ym1.mo === 12 ? ym1.y + 1 : ym1.y;
    var expectedMo = ym1.mo === 12 ? 1 : ym1.mo + 1;
    if (ym2.y !== expectedY || ym2.mo !== expectedMo) {
      throw new Error('supplyPlanningCalculations: forecastMonth2.month must be the calendar month immediately after forecastMonth1.month (got "' + fm2.month + '" after "' + fm1.month + '")');
    }
    // Base forecasts — finite non-negative numbers (no coercion / no silent default).
    var base1 = assertQty(fm1.baseForecast, 'forecastMonth1.baseForecast');
    var base2 = assertQty(fm2.baseForecast, 'forecastMonth2.baseForecast');
    // Target Rule (priority SKU > Series > Category > default 100%). Percent 50 = 50%; adjust Regular FC only.
    var tr = _resolveTargetRule(i.targetRules);
    var adj1 = base1 * tr.percent / 100;
    var adj2 = base2 * tr.percent / 100;
    var adjustedRegularForecast = adj1 + adj2;
    // 30-Day Safety Demand — driven by ACTUAL calendar days (full precision; no intermediate rounding).
    var d1 = _daysInMonth(ym1.y, ym1.mo);
    var d2 = _daysInMonth(ym2.y, ym2.mo);
    var totalDays = d1 + d2;
    var forecastDailyDemand = adjustedRegularForecast / totalDays;
    // Safety = Forecast Daily Demand × 30; computed as (ARF × 30) ÷ totalDays so the 30-day coverage keeps
    // full precision from the same single division (algebraically identical to fdd × 30).
    var safetyDemand = adjustedRegularForecast * 30 / totalDays;
    // Special Event Demand — pre-scoped / pre-aggregated count-once quantity; added ONCE at 100% (never Target-adjusted).
    var specialEventDemand = assertQty(i.specialEventDemand, 'specialEventDemand');
    var totalForecastDrivenDemand = adjustedRegularForecast + safetyDemand + specialEventDemand;
    // Final shortage — Stock / Incoming / Committed each deducted EXACTLY ONCE, floored at 0, via calculateGap().
    var forecastDrivenRemainingNeed = calculateGap({
      demand: totalForecastDrivenDemand,
      destinationCurrentStock: i.destinationCurrentStock,
      timelyQualifiedIncoming: i.timelyQualifiedIncoming,
      timelyApprovedCommittedSupply: i.timelyApprovedCommittedSupply
    });
    return {
      targetRuleSource: tr.source,
      targetRulePercent: tr.percent,
      adjustedForecastMonth1: adj1,
      adjustedForecastMonth2: adj2,
      adjustedRegularForecast: adjustedRegularForecast,
      month1CalendarDays: d1,
      month2CalendarDays: d2,
      forecastDailyDemand: forecastDailyDemand,
      safetyDemand: safetyDemand,
      specialEventDemand: specialEventDemand,
      totalForecastDrivenDemand: totalForecastDrivenDemand,
      forecastDrivenRemainingNeed: forecastDrivenRemainingNeed
    };
  }

  // ---- §26 / §27 / §27A — Required-By Window pure classifier ---------------
  // Two INDEPENDENT adapters computed from one (calculationDate, requiredByDate)
  // pair: Engine A reads daysOut (§26); Engine B checks overdue then monthDelta
  // (§27). Frozen nested contract per §27A.1 — NO 1:1 map between the adapters
  // (§27.6). Pure/deterministic: no inventory, no reallocation, no rounding, no
  // persistence, no system clock; input is never mutated.

  // Classifier-specific strict field validator. Throws TypeError for shape
  // problems and RangeError for a non-strict / non-real `YYYY-MM-DD` (§27A.7).
  // Deliberately separate from parseStrictIsoDate so the existing
  // eventPreparationDate / normalizedAvgSalesPerDay / Forecast-Driven error
  // behavior is left unchanged.
  function _classifierIsoField(input, field) {
    var v = input[field];
    if (typeof v !== 'string') {
      throw new TypeError('classifyRequiredByWindow: ' + field + ' must be a "YYYY-MM-DD" string (got ' + describe(v) + ')');
    }
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (!m) {
      throw new RangeError('classifyRequiredByWindow: ' + field + ' must be strict YYYY-MM-DD (got "' + v + '")');
    }
    var y = parseInt(m[1], 10), mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
    if (!isRealCalendarDate(y, mo, d)) {
      throw new RangeError('classifyRequiredByWindow: ' + field + ' is not a real calendar date ("' + v + '")');
    }
    return { y: y, mo: mo, d: d };
  }

  function classifyRequiredByWindow(input) {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      throw new TypeError('classifyRequiredByWindow: input must be a non-null, non-array object (got ' + describe(input) + ')');
    }
    var c = _classifierIsoField(input, 'calculationDate');
    var r = _classifierIsoField(input, 'requiredByDate');

    // daysOut = whole civil calendar days (§27A.2). UTC epoch difference on the
    // already-validated real dates: no system clock, no locale parsing, no
    // timezone/DST effect (UTC days are exactly 86,400,000 ms); negative when
    // overdue. Same deterministic UTC pattern as eventPreparationDate.
    var daysOut = (Date.UTC(r.y, r.mo - 1, r.d) - Date.UTC(c.y, c.mo - 1, c.d)) / MS_PER_DAY;

    // monthDelta = calendar year/month difference only (§27A.3) — never derived
    // from daysOut, never a 30-day approximation; the day-of-month is ignored.
    var monthDelta = (r.y - c.y) * 12 + (r.mo - c.mo);

    // Engine A — exact-date buckets (§27A.4). Reads daysOut only; no payloadEligible.
    var aBucket, aAllocationEligible;
    if (daysOut > 90) { aBucket = '>90d'; aAllocationEligible = false; }
    else if (daysOut >= 46) { aBucket = '46–90d'; aAllocationEligible = true; }
    else if (daysOut >= 31) { aBucket = '31–45d'; aAllocationEligible = true; }
    else if (daysOut >= 19) { aBucket = '19–30d'; aAllocationEligible = true; }
    else { aBucket = '0–18d'; aAllocationEligible = true; } // 0..18 AND overdue (<0) fold here

    // Engine B — monthly tiers (§27A.5). Overdue is judged FIRST, then monthDelta.
    var bTier, bVisible, bAllocationEligible, bPayloadEligible;
    if (daysOut < 0) {
      bTier = 'T1'; bVisible = true; bAllocationEligible = true; bPayloadEligible = true;
    } else if (monthDelta === 0 || monthDelta === 1) {
      bTier = 'T1'; bVisible = true; bAllocationEligible = true; bPayloadEligible = true;
    } else if (monthDelta === 2) {
      bTier = 'T2'; bVisible = true; bAllocationEligible = true; bPayloadEligible = true;
    } else if (monthDelta === 3) {
      bTier = 'T3'; bVisible = true; bAllocationEligible = true; bPayloadEligible = true;
    } else if (monthDelta === 4) {
      bTier = 'T4'; bVisible = true; bAllocationEligible = false; bPayloadEligible = false;
    } else { // monthDelta >= 5 — Month+5+ is outside the Engine B display range
      bTier = null; bVisible = false; bAllocationEligible = false; bPayloadEligible = false;
    }

    return {
      daysOut: daysOut,
      monthDelta: monthDelta,
      engineA: { bucket: aBucket, visible: true, allocationEligible: aAllocationEligible },
      engineB: { tier: bTier, visible: bVisible, allocationEligible: bAllocationEligible, payloadEligible: bPayloadEligible }
    };
  }

  // ---- §32A — Reallocation Eligibility pure predicate (Round 6) -------------
  // The single pure eligibility predicate (yes/no) for a donor→receiver
  // reallocation pair. Frozen contract §32A. It ONLY compares caller-resolved
  // Master SKU strings and Required-By dates through the Engine B adapter of the
  // frozen classifier — reads no DB, resolves no identity/company/route/packaging/
  // ownership, enumerates no candidates, iterates no pairs, and holds no quantity
  // (quantity stays in feasibleReallocationQty / applyFeasibleReallocation /
  // sumRemainingShortages). Pure/deterministic: input is never mutated; every call
  // returns fresh top-level / donor / receiver objects.

  // Private Engine B tier rank (§32A.5). Only T1/T2/T3 get a valid rank (1/2/3);
  // T4 / null / anything else → 0 = "no allocation-eligible rank". Never exported.
  function _reallocationTierRank(tier) {
    if (tier === 'T1') return 1;
    if (tier === 'T2') return 2;
    if (tier === 'T3') return 3;
    return 0;
  }

  // Party shape validator (§32A.9 / §6.1). TypeError for a non-object party or a
  // missing / non-string / blank masterSku. The blank check trims for EMPTINESS
  // only — the real Same-Master-SKU equality (below) never trims / case-folds.
  function _assertReallocationParty(party, name) {
    if (party === null || typeof party !== 'object' || Array.isArray(party)) {
      throw new TypeError('evaluateReallocationEligibility: ' + name + ' must be a non-null, non-array object (got ' + describe(party) + ')');
    }
    if (typeof party.masterSku !== 'string' || party.masterSku.trim() === '') {
      throw new TypeError('evaluateReallocationEligibility: ' + name + '.masterSku must be a non-empty string (got ' + describe(party.masterSku) + ')');
    }
  }

  function evaluateReallocationEligibility(input) {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      throw new TypeError('evaluateReallocationEligibility: input must be a non-null, non-array object (got ' + describe(input) + ')');
    }
    _assertReallocationParty(input.donor, 'donor');
    _assertReallocationParty(input.receiver, 'receiver');

    // Date validation + tier classification is DELEGATED to the frozen owner
    // classifier (§32A.9 / §6.2) — no second parser, no clock, no locale parsing,
    // no coercion. A non-string date → TypeError; a non-strict / non-real date →
    // RangeError, exactly as classifyRequiredByWindow contracts.
    var donorClass = classifyRequiredByWindow({ calculationDate: input.calculationDate, requiredByDate: input.donor.requiredByDate });
    var receiverClass = classifyRequiredByWindow({ calculationDate: input.calculationDate, requiredByDate: input.receiver.requiredByDate });

    // Same-Master-SKU identity gate (§32A.2): EXACT string equality ONLY — never
    // trim / case-fold / prefix / substring / Series / Category / alternate-ID.
    var sameMasterSku = input.donor.masterSku === input.receiver.masterSku;

    // Engine B is the ONLY tier source (§32A.3): read .engineB only — never
    // engineA, daysOut, monthDelta, visible or payloadEligible.
    var donorB = donorClass.engineB;
    var receiverB = receiverClass.engineB;
    var donorRank = _reallocationTierRank(donorB.tier);
    var receiverRank = _reallocationTierRank(receiverB.tier);

    // Tier ordering (§32A.5): both allocation-eligible, both a valid T1/T2/T3 rank,
    // and donorRank <= receiverRank. Earlier/same-tier surplus may cover a same/
    // later shortage; a later surplus never covers an earlier shortage. T4 / null
    // yield rank 0 → excluded here (visible / payloadEligible are NOT gates).
    var tierOrderingEligible =
      donorB.allocationEligible === true &&
      receiverB.allocationEligible === true &&
      donorRank > 0 &&
      receiverRank > 0 &&
      donorRank <= receiverRank;

    var eligible = sameMasterSku && tierOrderingEligible;

    return {
      sameMasterSku: sameMasterSku,
      donor: { tier: donorB.tier, allocationEligible: donorB.allocationEligible },
      receiver: { tier: receiverB.tier, allocationEligible: receiverB.allocationEligible },
      tierOrderingEligible: tierOrderingEligible,
      eligible: eligible
    };
  }

  // ---- §34A Missing / Stale Data pure classifier ----------------------------
  // classifyPlanningDataState (§34A, CANONICAL v4.4 — Round 8A contract; Round 8B
  // implementation). A pure/deterministic classifier of calculation INPUT
  // READINESS only. No DB / API / UI / clock / locale / implicit default; same
  // input ⇒ identical output; input never mutated; a fresh object every call. It
  // does NOT assemble snapshots/forecasts, choose a source, resolve identity,
  // compute any quantity, or convert an unknown to 0 (§34A.1).
  //
  //   state ∈ { OK, STALE_SNAPSHOT, MISSING_SNAPSHOT, MISSING_FORECAST, MISSING_SALES_BASIS }
  //   calculationAllowed = true only for OK and STALE_SNAPSHOT (STALE = §34
  //   warn-and-proceed, never auto-0); every other state = false (§34A.3).
  //   Precedence (§34A.4): missing snapshot ▸ missing demand basis ▸ stale (STRICT
  //   age > threshold) ▸ OK. Validation is branch-scoped (§34A.5): age/threshold
  //   are read+validated only when snapshotPresent===true; each model validates
  //   only its own demand-basis flag and ignores the other.
  function _assertPlanningBoolean(v, name) {
    if (typeof v !== 'boolean') {
      throw new TypeError('classifyPlanningDataState: ' + name + ' must be a boolean (got ' + describe(v) + ')');
    }
    return v;
  }
  // A finite, non-negative day count for the snapshotPresent===true branch (§34A.5):
  // a non-number → TypeError; NaN / ±Infinity / negative → RangeError (no coercion).
  function _assertPlanningDayCount(v, name) {
    if (typeof v !== 'number') {
      throw new TypeError('classifyPlanningDataState: ' + name + ' must be a number when snapshotPresent===true (got ' + describe(v) + ')');
    }
    if (!isFinite(v) || v < 0) {
      throw new RangeError('classifyPlanningDataState: ' + name + ' must be a finite number >= 0 (got ' + describe(v) + ')');
    }
    return v;
  }

  function classifyPlanningDataState(input) {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      throw new TypeError('classifyPlanningDataState: input must be a non-null, non-array object (got ' + describe(input) + ')');
    }
    // Always-required fields (§34A.2): snapshotPresent + replenishmentModel.
    _assertPlanningBoolean(input.snapshotPresent, 'snapshotPresent');
    if (typeof input.replenishmentModel !== 'string') {
      throw new TypeError('classifyPlanningDataState: replenishmentModel must be a string (got ' + describe(input.replenishmentModel) + ')');
    }
    if (input.replenishmentModel !== 'forecast_driven' && input.replenishmentModel !== 'sales_driven') {
      throw new RangeError('classifyPlanningDataState: replenishmentModel must be "forecast_driven" or "sales_driven" (got "' + input.replenishmentModel + '")');
    }

    // Precedence step 1 (§34A.4): missing snapshot outranks everything and returns
    // immediately after the always-required validation — snapshotAgeDays /
    // stalenessThresholdDays and the demand-basis flag are IGNORED (not validated)
    // on this branch (§34A.5; Round 8B §4).
    if (input.snapshotPresent !== true) {
      return { state: 'MISSING_SNAPSHOT', calculationAllowed: false };
    }

    // snapshotPresent === true branch: the demand-basis flag for THIS model and the
    // age/threshold pair are required and validated here (branch-scoped, §34A.5).
    // The other model's flag is never read.
    var demandBasisMissing;
    if (input.replenishmentModel === 'forecast_driven') {
      _assertPlanningBoolean(input.forecastPresent, 'forecastPresent');
      demandBasisMissing = (input.forecastPresent === false) ? 'MISSING_FORECAST' : null;
    } else {
      _assertPlanningBoolean(input.salesBasisPresent, 'salesBasisPresent');
      demandBasisMissing = (input.salesBasisPresent === false) ? 'MISSING_SALES_BASIS' : null;
    }
    var age = _assertPlanningDayCount(input.snapshotAgeDays, 'snapshotAgeDays');
    var threshold = _assertPlanningDayCount(input.stalenessThresholdDays, 'stalenessThresholdDays');

    // Precedence step 2 (§34A.4): a missing (blocking) demand basis outranks the
    // stale warning.
    if (demandBasisMissing !== null) {
      return { state: demandBasisMissing, calculationAllowed: false };
    }
    // Precedence step 3 (§34A.4/.5): STRICT staleness — age === threshold is fresh.
    // Stale is warn-and-proceed (calculationAllowed=true), never auto-0.
    if (age > threshold) {
      return { state: 'STALE_SNAPSHOT', calculationAllowed: true };
    }
    // Precedence step 4: OK.
    return { state: 'OK', calculationAllowed: true };
  }

  return {
    // §10 event preparation
    eventPreparationDate: eventPreparationDate,
    eventPreparationMonth: eventPreparationMonth,
    // §31 gap
    calculateGap: calculateGap,
    // §11 shortage/surplus
    classifyProjectedBalance: classifyProjectedBalance,
    // §31/§2C.1 shipping FLOOR + residual
    calculateShippingAndResidual: calculateShippingAndResidual,
    // §14 order CEILING
    calculateSuggestedOrderQty: calculateSuggestedOrderQty,
    // §12/§32 reallocation primitives
    feasibleReallocationQty: feasibleReallocationQty,
    applyFeasibleReallocation: applyFeasibleReallocation,
    sumRemainingShortages: sumRemainingShortages,
    // §22/§29E normalized-sales sampling engine
    normalizedAvgSalesPerDay: normalizedAvgSalesPerDay,
    // §2D/§29F/§29G Forecast-Driven demand engine
    calculateForecastDrivenRemainingNeed: calculateForecastDrivenRemainingNeed,
    // §26/§27/§27A Required-By Window pure classifier (nested contract §27A.1)
    classifyRequiredByWindow: classifyRequiredByWindow,
    // §32A Reallocation Eligibility pure predicate (frozen contract §32A)
    evaluateReallocationEligibility: evaluateReallocationEligibility,
    // §34A Missing / Stale Data pure classifier (frozen contract §34A)
    classifyPlanningDataState: classifyPlanningDataState
  };
});
