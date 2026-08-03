// ============================================================================
// GENERATED FILE — DO NOT EDIT BY HAND.
// Produced by assets/tools/build-apps-script-bundle.js from the canonical UMD modules under
// assets/js/core/. Edit those modules and re-run the build tool; never edit this file directly.
// One source of truth: no algorithm is duplicated here — each module is wrapped verbatim.
// bundle_sha256 = 69296550705b3eabb8243e672bb5c47e833a5d1558ae37bd4cc622541c84cb9f
// modules (in load order):
//   supply-planning-calculations  997f6a5224658038a24599a6af9aff2fda98726d04f4f45cee8ba298b2deb430
//   supply-planning-qualified-incoming  241b8c87ed48522998fc29f5db5aa383ecdb872d83b2c933a49f50c77f43b6d7
//   supply-planning-ledgers  3841ab3fe9d5922dad544677e87dd9f2b8507da50c385abb51ae5a071e89a042
//   supply-planning-allocations  79194d50c2dbfb1ea4ebc0f46def5229a85012569956b66f7dffa1e01b8fd911
//   supply-planning-line-runtime  0e0b9c3f60d590f7351d541b8c0de9ae6d8d344c882864c7c2fe8dbbca5301c8
//   supply-planning-incoming-adapters  6132c0bc3b30dd4e94e2198e07cbc29571e1c5bf2bd6b8836d5b631c0c1f6dc0
//   supply-planning-external-incoming-adapters  ca1cb707ee5ad5ad4437bbc6a3c4056796c340ec278ba8a55803f56aa25b0d93
//   supply-planning-supply-candidates  c5560130b507eccc4f0a90fc413c6c66942d221bae897f15d5d3051a2c4f7d79
//   supply-planning-persistence  e8f4ca1caf9dffe9c7882867fe8ebbeb7fa17844f81d9e5f7ebb2525126cc1a6
//   supply-planning-persistence-repository  f94f7953d9cd2feeec748dea375b1f836060b9f83e3d39a70bec5a3d062ec4e6
//   supply-planning-persistence-locking  ab2a383e64a5f113c26281cb8b56c82c69dacd969ad25dcc41fbc4c5fb00b12b
//   supply-planning-plan-builder  7ae3793686e90970a7b525159d64a99a532843e350da2d7995688f763b26f914
//   supply-planning-persistence-plan-builder  c4167ea6ba7fb1487674e8f2920b5c28755d274cc8fcfca487991c0d94119304
//   supply-planning-recommendation-orchestrator  23f1cf9ab336f6fb5a7bdb6e81010adb1cb2b97d78b68be31a9692132471b192
//   supply-planning-user-edit  365702d00a5c1ac9544a6086504b2e4961de1129fe3619eace8054ef34172693
// ============================================================================

var __kmModules = {};
function __kmRegister(name, exps) { __kmModules[name] = exps; }
function __kmRequire(p) {
  var base = String(p).replace(/^.*\//, "").replace(/\.js$/, "");
  if (!__kmModules.hasOwnProperty(base)) { throw new Error("KM bundle: module not registered: " + base); }
  return __kmModules[base];
}

// ----- module: supply-planning-calculations (verbatim from assets/js/core/supply-planning-calculations.js) -----
(function () {
  var require = __kmRequire;
  var module = { exports: {} };
  var exports = module.exports;
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
  __kmRegister("supply-planning-calculations", module.exports);
})();

// ----- module: supply-planning-qualified-incoming (verbatim from assets/js/core/supply-planning-qualified-incoming.js) -----
(function () {
  var require = __kmRequire;
  var module = { exports: {} };
  var exports = module.exports;
// Kitchen Mama Operation System — Pure Qualified Incoming Engine (B-4 Minimal Runtime, batch B4-R6).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC engine. Consumes VERIFIED adapter outputs — B4-R4 KM Shipment Incoming Adapter results and
// B4-R5 External Incoming Authority results — plus a canonical Required-By date and explicit already-posted /
// other-bucket lineage evidence, and projects the frozen SUPPLY_PLANNING_CALCULATION_RULES.md §2E ten-gate
// Qualified-Incoming / count-once predicate. It does NOT rebuild B4-R3 candidates, NOT rerun B4-R4/B4-R5, NOT
// redefine the B4-R4 Shipment status allowlist (it PROJECTS B4-R4 outcomes), and NOT read raw Shipment rows.
//
// ADMISSION PRE-GATE (§38): every external result stays planningEligible=false / adapterEligibleQuantity=0; external
// observed quantity is reported SEPARATELY and never enters qualified / late-risk / KM-excluded totals. Linked
// external evidence is visible but never counted apart from its KM Shipment; an adopted external row stays zero —
// only the resulting KM Shipment candidate may qualify (count-once).
//
// DEDUP uses ONLY stable physical lineage (candidate.lineageKey) — never SKU+ETA / quantity / warehouse / status /
// label / address / row order / timestamp. Identical same-lineage duplicates count once; conflicting same-lineage
// duplicates fail closed (whole group contributes zero). DATE contract (§2F/§6): ETA and Required-By are strict
// YYYY-MM-DD, real-calendar validated, compared LEXICALLY — no Date constructor, no clock, no timezone, no locale.
//
// It modifies no Shipment, no inventory, no Ledger; resolves no PO/Plan Runtime; calls no calculateGap; creates no
// recommendation; persists nothing. No Sheet/DB/API/UI, no mutation.

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') {
    window.KM = window.KM || {};
    window.KM.qualifiedIncoming = api;
  }
})(this, function () {
  'use strict';

  var KM_ADAPTER_TYPE = 'KM_SHIPMENT_INCOMING';
  var EXTERNAL_ADAPTER_TYPE = 'EXTERNAL_INCOMING_AUTHORITY';

  // The exact §2E ten gates, in canonical order. Each result carries a PASS / FAIL / REVIEW for every one.
  var GATE_KEYS = [
    'MASTER_SKU_MATCH',                   // 1
    'COMPANY_MATCH',                      // 2
    'DESTINATION_OR_SERVICE_SCOPE_MATCH', // 3
    'TABLE_STATUS_QUALIFIED',             // 4
    'ETA_RESOLVED',                       // 5
    'ETA_ON_OR_BEFORE_REQUIRED_BY',       // 6
    'REMAINING_QUANTITY_POSITIVE',        // 7
    'NOT_EXCLUDED_LIFECYCLE_STATE',       // 8
    'NOT_POSTED_TO_CURRENT_STOCK',        // 9
    'COUNT_ONCE_OWNERSHIP'                // 10
  ];
  // Non-time gates whose FAIL is a deterministic EXCLUDED (gate 6 is the time gate → LATE_RISK, not EXCLUDED).
  var EXCLUDING_GATES = [
    'MASTER_SKU_MATCH', 'COMPANY_MATCH', 'DESTINATION_OR_SERVICE_SCOPE_MATCH', 'TABLE_STATUS_QUALIFIED',
    'REMAINING_QUANTITY_POSITIVE', 'NOT_EXCLUDED_LIFECYCLE_STATE', 'NOT_POSTED_TO_CURRENT_STOCK', 'COUNT_ONCE_OWNERSHIP'
  ];

  // Canonical order for the B4-R6-specific reason tokens (upstream B4-R4/B4-R5 reasons are preserved first).
  var B4R6_EXCLUSION_ORDER = [
    'SOURCE_ADAPTER_NOT_ELIGIBLE', 'DUPLICATE_STABLE_LINEAGE', 'POSTED_TO_CURRENT_STOCK', 'ACTIVE_IN_OTHER_BUCKET'
  ];
  var B4R6_REVIEW_ORDER = ['ETA_MISSING', 'ETA_INVALID', 'DUPLICATE_LINEAGE_CONFLICT'];
  var B4R6_INFO_ORDER = ['ETA_AFTER_REQUIRED_BY', 'LINKED_EXTERNAL_EVIDENCE_PRESENT'];
  var SUMMARY_ORDER = B4R6_EXCLUSION_ORDER.concat(B4R6_REVIEW_ORDER).concat(B4R6_INFO_ORDER);

  function describe(v) { return v === null ? 'null' : (Array.isArray(v) ? 'array' : typeof v); }
  function isBlank(v) { return v === '' || v === null || v === undefined || (typeof v === 'string' && v.trim() === ''); }
  function isFinitePositive(n) { return typeof n === 'number' && isFinite(n) && n > 0; }
  function finitePosOrZero(n) { return isFinitePositive(n) ? n : 0; }
  function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

  // ---- Strict date contract (§2F / §6): YYYY-MM-DD, real calendar, lexical comparison; NO Date constructor ----
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  function isRealCalendarDate(y, m, d) {
    if (m < 1 || m > 12 || d < 1) return false;
    var mdays = [31, ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return d <= mdays[m - 1];
  }
  function isValidIsoDate(s) {
    if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
    return isRealCalendarDate(parseInt(s.slice(0, 4), 10), parseInt(s.slice(5, 7), 10), parseInt(s.slice(8, 10), 10));
  }

  function requireObject(v, name) {
    if (!isObject(v)) throw new TypeError('evaluateQualifiedIncoming: ' + name + ' must be a non-null, non-array object (got ' + describe(v) + ')');
    return v;
  }
  function requireArray(v, name) {
    if (!Array.isArray(v)) throw new TypeError('evaluateQualifiedIncoming: ' + name + ' must be an array (got ' + describe(v) + ')');
    return v;
  }
  function requireNonBlankString(v, name) {
    if (v === null || v === undefined) throw new RangeError('evaluateQualifiedIncoming: ' + name + ' is required (got ' + describe(v) + ')');
    if (typeof v !== 'string') throw new TypeError('evaluateQualifiedIncoming: ' + name + ' must be a string (got ' + describe(v) + ')');
    if (v.trim() === '') throw new RangeError('evaluateQualifiedIncoming: ' + name + ' must be a non-empty string');
    return v;
  }
  function requireStrictDate(v, name) {
    requireNonBlankString(v, name);
    if (!DATE_RE.test(v)) throw new RangeError('evaluateQualifiedIncoming: ' + name + ' must be strict YYYY-MM-DD (got "' + v + '")');
    if (!isValidIsoDate(v)) throw new RangeError('evaluateQualifiedIncoming: ' + name + ' is not a real calendar date ("' + v + '")');
    return v;
  }

  function hasToken(arr, t) { return Array.isArray(arr) && arr.indexOf(t) >= 0; }

  // Merge preserving upstream order first, then appending new tokens in canonical order; unique.
  function mergeReasons(upstream, addSet, canonicalOrder) {
    var out = [], seen = {};
    if (Array.isArray(upstream)) {
      for (var i = 0; i < upstream.length; i++) { if (!seen[upstream[i]]) { seen[upstream[i]] = 1; out.push(upstream[i]); } }
    }
    for (var j = 0; j < canonicalOrder.length; j++) {
      var t = canonicalOrder[j];
      if (addSet[t] && !seen[t]) { seen[t] = 1; out.push(t); }
    }
    return out;
  }

  // Fresh shallow snapshot of an adapter's candidate object (does not expose the input candidate reference).
  function snapshotCandidate(c) {
    var out = {};
    for (var k in c) { if (Object.prototype.hasOwnProperty.call(c, k)) out[k] = c[k]; }
    return out;
  }

  // Decision-equivalent fingerprint for same-lineage duplicate detection (§12). Order-stable, business fields only.
  function fingerprint(res) {
    var c = res.candidate || {};
    return JSON.stringify([
      c.supplyCandidateId, c.sourceLineRef, c.linkedShipmentId, c.linkedShipmentLineId,
      c.company, c.country, c.marketplace, c.sku, c.destinationWarehouseId, c.status, c.eta, c.quantityRemaining,
      res.sourceEligible, res.adapterEligibleQuantity, res.statusClass,
      Array.isArray(res.exclusionReasons) ? res.exclusionReasons : null,
      Array.isArray(res.reviewReasons) ? res.reviewReasons : null
    ]);
  }

  /**
   * evaluateQualifiedIncoming(input) → one fresh, deterministic Qualified-Incoming engine result.
   * input = { requiredByDate, kmShipmentResults, externalAuthorityResults?, postedToCurrentStockLineageKeys?,
   *           activeOtherBucketLineageKeys? }. Consumes VERIFIED B4-R4 / B4-R5 adapter outputs (never raw rows).
   */
  function evaluateQualifiedIncoming(input) {
    requireObject(input, 'input');
    var requiredByDate = requireStrictDate(input.requiredByDate, 'input.requiredByDate');

    var kmResults = requireArray(input.kmShipmentResults, 'input.kmShipmentResults');
    var externalResults = input.externalAuthorityResults === undefined || input.externalAuthorityResults === null
      ? [] : requireArray(input.externalAuthorityResults, 'input.externalAuthorityResults');
    var postedKeysArr = input.postedToCurrentStockLineageKeys === undefined || input.postedToCurrentStockLineageKeys === null
      ? [] : requireArray(input.postedToCurrentStockLineageKeys, 'input.postedToCurrentStockLineageKeys');
    var otherBucketArr = input.activeOtherBucketLineageKeys === undefined || input.activeOtherBucketLineageKeys === null
      ? [] : requireArray(input.activeOtherBucketLineageKeys, 'input.activeOtherBucketLineageKeys');

    // Validate lineage-key evidence sets (exact-match only; nonblank strings).
    var postedSet = {}, otherSet = {};
    postedKeysArr.forEach(function (k, i) { requireNonBlankString(k, 'input.postedToCurrentStockLineageKeys[' + i + ']'); postedSet[k] = 1; });
    otherBucketArr.forEach(function (k, i) { requireNonBlankString(k, 'input.activeOtherBucketLineageKeys[' + i + ']'); otherSet[k] = 1; });

    // Validate KM adapter results structurally.
    kmResults.forEach(function (r, i) {
      requireObject(r, 'input.kmShipmentResults[' + i + ']');
      if (r.adapterType !== KM_ADAPTER_TYPE) throw new TypeError('evaluateQualifiedIncoming: kmShipmentResults[' + i + '].adapterType must be ' + KM_ADAPTER_TYPE + ' (got ' + describe(r.adapterType) + ')');
      requireObject(r.candidate, 'input.kmShipmentResults[' + i + '].candidate');
      requireNonBlankString(r.candidate.lineageKey, 'input.kmShipmentResults[' + i + '].candidate.lineageKey');
      requireNonBlankString(r.candidate.supplyCandidateId, 'input.kmShipmentResults[' + i + '].candidate.supplyCandidateId');
      requireNonBlankString(r.candidate.sourceLineRef, 'input.kmShipmentResults[' + i + '].candidate.sourceLineRef');
    });

    // Validate external results + enforce the §38 zero-contribution invariant (fail closed on any positive external).
    externalResults.forEach(function (r, i) {
      requireObject(r, 'input.externalAuthorityResults[' + i + ']');
      if (r.adapterType !== EXTERNAL_ADAPTER_TYPE) throw new TypeError('evaluateQualifiedIncoming: externalAuthorityResults[' + i + '].adapterType must be ' + EXTERNAL_ADAPTER_TYPE + ' (got ' + describe(r.adapterType) + ')');
      if (r.planningEligible !== false) throw new RangeError('evaluateQualifiedIncoming: externalAuthorityResults[' + i + '].planningEligible must be false (external records never contribute to planning)');
      if (r.adapterEligibleQuantity !== 0) throw new RangeError('evaluateQualifiedIncoming: externalAuthorityResults[' + i + '].adapterEligibleQuantity must be 0 (external records never contribute to planning)');
    });

    // ---- Dedup pass: group by exact lineageKey; classify each group single / identical-dup / conflict. ----
    var groups = {}, groupOrder = [];
    kmResults.forEach(function (r, i) {
      var key = r.candidate.lineageKey;
      if (!groups[key]) { groups[key] = []; groupOrder.push(key); }
      groups[key].push({ res: r, idx: i });
    });
    // Per original index → dedup role + which KM linkedShipmentIds are present (for external linkage marking).
    var dupRole = new Array(kmResults.length);       // 'SINGLE' | 'REP_IDENTICAL' | 'DUP_IDENTICAL' | 'CONFLICT'
    groupOrder.forEach(function (key) {
      var members = groups[key];
      if (members.length === 1) { dupRole[members[0].idx] = 'SINGLE'; return; }
      var fp0 = fingerprint(members[0].res), identical = true;
      for (var m = 1; m < members.length; m++) { if (fingerprint(members[m].res) !== fp0) { identical = false; break; } }
      if (identical) {
        // representative = the member with the lowest original index (order-independent aggregate result).
        var repIdx = members[0].idx;
        for (var n = 1; n < members.length; n++) { if (members[n].idx < repIdx) repIdx = members[n].idx; }
        members.forEach(function (mm) { dupRole[mm.idx] = (mm.idx === repIdx) ? 'REP_IDENTICAL' : 'DUP_IDENTICAL'; });
      } else {
        members.forEach(function (mm) { dupRole[mm.idx] = 'CONFLICT'; });
      }
    });

    // Which KM linkedShipmentIds exist (for LINKED_EXTERNAL_EVIDENCE_PRESENT informational marking).
    var kmLinkedShipmentIds = {};
    kmResults.forEach(function (r) { var sid = r.candidate.linkedShipmentId; if (!isBlank(sid)) kmLinkedShipmentIds[String(sid)] = 1; });
    var externalLinkedShipmentIds = {};
    externalResults.forEach(function (r) {
      if (r.linkedEvidence === true && r.candidate && !isBlank(r.candidate.linkedShipmentId)) externalLinkedShipmentIds[String(r.candidate.linkedShipmentId)] = 1;
    });

    // ---- Per-KM-result ten-gate evaluation + classification. ----
    var summarySet = {};
    var candidateResults = kmResults.map(function (r, i) {
      var c = r.candidate;
      var role = dupRole[i];
      var exclAdd = {}, reviewAdd = {}, infoAdd = {};
      var gate = {};

      var etaResolved = r.etaPresent === true && isValidIsoDate(c.eta);
      var etaMissing = r.etaPresent !== true || isBlank(c.eta);
      var etaInvalid = !etaMissing && !isValidIsoDate(c.eta);

      // Gate 1 — Master SKU.
      gate.MASTER_SKU_MATCH = (!hasToken(r.exclusionReasons, 'SKU_SCOPE_MISMATCH') && !isBlank(c.sku)) ? 'PASS' : 'FAIL';
      // Gate 2 — Company (mismatch = FAIL; missing = REVIEW).
      gate.COMPANY_MATCH = hasToken(r.exclusionReasons, 'COMPANY_SCOPE_MISMATCH') ? 'FAIL'
        : ((isBlank(c.company) || hasToken(r.reviewReasons, 'MISSING_COMPANY')) ? 'REVIEW' : 'PASS');
      // Gate 3 — Destination / service scope (mismatch = FAIL; missing = REVIEW). No service-scope path in minimal Shipment flow.
      gate.DESTINATION_OR_SERVICE_SCOPE_MATCH = hasToken(r.exclusionReasons, 'DESTINATION_SCOPE_MISMATCH') ? 'FAIL'
        : ((hasToken(r.reviewReasons, 'MISSING_DESTINATION_IDENTITY') || isBlank(c.destinationWarehouseId) || c.destinationIdentitySource === 'MISSING') ? 'REVIEW' : 'PASS');
      // Gate 4 — Table status qualified (PROJECT B4-R4; do not redefine the allowlist).
      gate.TABLE_STATUS_QUALIFIED = (r.statusEligible === true && r.statusClass === 'ELIGIBLE_INCOMING_STATUS') ? 'PASS'
        : ((r.statusClass === 'MISSING_STATUS' || r.statusClass === 'UNKNOWN_STATUS') ? 'REVIEW' : 'FAIL');
      // Gate 5 — ETA resolved.
      gate.ETA_RESOLVED = etaResolved ? 'PASS' : 'REVIEW';
      if (etaMissing) reviewAdd.ETA_MISSING = 1;
      else if (etaInvalid) reviewAdd.ETA_INVALID = 1;
      // Gate 6 — ETA <= Required-By (lexical, strict dates only).
      if (!etaResolved) gate.ETA_ON_OR_BEFORE_REQUIRED_BY = 'REVIEW';
      else if (c.eta <= requiredByDate) gate.ETA_ON_OR_BEFORE_REQUIRED_BY = 'PASS';
      else { gate.ETA_ON_OR_BEFORE_REQUIRED_BY = 'FAIL'; infoAdd.ETA_AFTER_REQUIRED_BY = 1; }
      // Gate 7 — Remaining unconsumed quantity > 0 (§2E.7). Projects the PHYSICAL quantity: B4-R4 quantityEligible +
      // candidate.quantityRemaining finite > 0. It deliberately does NOT require adapterEligibleQuantity > 0, because
      // adapterEligibleQuantity is itself zeroed whenever sourceEligible is false (ETA/status/scope) — folding it in
      // here would double-count those gates and force an ETA/status/scope REVIEW row into a false EXCLUDED. The
      // QUALIFIED quantity OUTPUT still uses adapterEligibleQuantity (which equals quantityRemaining once eligible).
      gate.REMAINING_QUANTITY_POSITIVE = (r.quantityEligible === true && isFinitePositive(c.quantityRemaining)) ? 'PASS' : 'FAIL';
      // Gate 8 — Not excluded lifecycle state.
      gate.NOT_EXCLUDED_LIFECYCLE_STATE = (r.statusClass === 'ELIGIBLE_INCOMING_STATUS' && !hasToken(r.exclusionReasons, 'STATUS_NOT_ELIGIBLE')) ? 'PASS'
        : ((r.statusClass === 'MISSING_STATUS' || r.statusClass === 'UNKNOWN_STATUS') ? 'REVIEW' : 'FAIL');
      // Gate 9 — Not posted to Current Stock (exact lineage evidence only).
      var posted = postedSet[c.lineageKey] === 1;
      gate.NOT_POSTED_TO_CURRENT_STOCK = posted ? 'FAIL' : 'PASS';
      if (posted) exclAdd.POSTED_TO_CURRENT_STOCK = 1;
      // Gate 10 — Count-once ownership (dedup conflict / nonrep duplicate / other-bucket evidence).
      var inOtherBucket = otherSet[c.lineageKey] === 1;
      var gate10Fail = false;
      if (role === 'CONFLICT') { gate10Fail = true; reviewAdd.DUPLICATE_LINEAGE_CONFLICT = 1; }
      if (role === 'DUP_IDENTICAL') { gate10Fail = true; exclAdd.DUPLICATE_STABLE_LINEAGE = 1; }
      if (inOtherBucket) { gate10Fail = true; exclAdd.ACTIVE_IN_OTHER_BUCKET = 1; }
      gate.COUNT_ONCE_OWNERSHIP = gate10Fail ? 'FAIL' : 'PASS';

      if (r.sourceEligible !== true) exclAdd.SOURCE_ADAPTER_NOT_ELIGIBLE = 1;
      if (!isBlank(c.linkedShipmentId) && externalLinkedShipmentIds[String(c.linkedShipmentId)] === 1) infoAdd.LINKED_EXTERNAL_EVIDENCE_PRESENT = 1;

      // ---- Classification precedence (§16): EXCLUDED > REVIEW > LATE_RISK > QUALIFIED. ----
      var anyExcludingFail = EXCLUDING_GATES.some(function (g) { return gate[g] === 'FAIL'; });
      var anyReview = GATE_KEYS.some(function (g) { return gate[g] === 'REVIEW'; });
      var state;
      if (anyExcludingFail) state = 'EXCLUDED';
      else if (anyReview) state = 'REVIEW';
      else if (gate.ETA_ON_OR_BEFORE_REQUIRED_BY === 'FAIL') state = 'LATE_RISK';
      else state = 'QUALIFIED';
      // §15 hard guard: a B4-R4 result the source adapter deemed ineligible can never become Qualified Incoming,
      // even if every projected gate happens to pass (e.g. a tampered authority/source/domain the gates don't test).
      if (state === 'QUALIFIED' && r.sourceEligible !== true) state = 'EXCLUDED';

      // ---- Quantity contract (§17). ----
      var qualifiedQuantity = 0, lateRiskQuantity = 0, excludedQuantity = 0, reviewQuantity = 0;
      if (state === 'QUALIFIED') qualifiedQuantity = r.adapterEligibleQuantity;
      else if (state === 'LATE_RISK') lateRiskQuantity = r.adapterEligibleQuantity;
      else if (state === 'REVIEW') reviewQuantity = finitePosOrZero(c.quantityRemaining);
      else /* EXCLUDED */ excludedQuantity = (role === 'DUP_IDENTICAL') ? 0 : finitePosOrZero(c.quantityRemaining);

      var exclusionReasons = mergeReasons(r.exclusionReasons, exclAdd, B4R6_EXCLUSION_ORDER);
      var reviewReasons = mergeReasons(r.reviewReasons, reviewAdd, B4R6_REVIEW_ORDER);
      var informationalReasons = mergeReasons([], infoAdd, B4R6_INFO_ORDER);
      [exclAdd, reviewAdd, infoAdd].forEach(function (set) { for (var t in set) { if (set[t]) summarySet[t] = 1; } });

      return {
        candidate: snapshotCandidate(c),
        lineageKey: c.lineageKey,
        qualificationState: state,
        qualifiedQuantity: qualifiedQuantity,
        lateRiskQuantity: lateRiskQuantity,
        excludedQuantity: excludedQuantity,
        reviewQuantity: reviewQuantity,
        gateResults: gate,
        exclusionReasons: exclusionReasons,
        reviewReasons: reviewReasons,
        informationalReasons: informationalReasons
      };
    });

    // ---- External results echo (fresh snapshots) + separate audit aggregates. ----
    var externalObservedQuantity = 0, linkedExternalEvidenceCount = 0, quarantinedExternalCount = 0,
        adoptedExternalCount = 0, adoptionPendingCount = 0;
    var externalResultsOut = externalResults.map(function (r) {
      var obs = finitePosOrZero(r.observedQuantity);
      externalObservedQuantity += obs;
      if (r.linkedEvidence === true) linkedExternalEvidenceCount++;
      if (r.quarantined === true) quarantinedExternalCount++;
      if (r.adoptedToKm === true) adoptedExternalCount++;
      if (r.stateClass === 'ADOPTION_REVIEW_PENDING') adoptionPendingCount++;
      return {
        candidate: r.candidate ? snapshotCandidate(r.candidate) : null,
        adapterType: EXTERNAL_ADAPTER_TYPE,
        planningEligible: false,
        adapterEligibleQuantity: 0,
        observedQuantity: obs,
        stateClass: r.stateClass,
        linkedEvidence: r.linkedEvidence === true,
        quarantined: r.quarantined === true,
        adoptedToKm: r.adoptedToKm === true,
        exclusionReasons: Array.isArray(r.exclusionReasons) ? r.exclusionReasons.slice() : [],
        reviewReasons: Array.isArray(r.reviewReasons) ? r.reviewReasons.slice() : []
      };
    });

    // ---- Engine aggregates. External observed quantity stays OUT of qualified / late / excluded KM totals. ----
    var qualifiedIncomingQuantity = 0, lateRiskQuantity = 0, excludedIncomingQuantity = 0, reviewIncomingQuantity = 0;
    candidateResults.forEach(function (cr) {
      qualifiedIncomingQuantity += cr.qualifiedQuantity;
      lateRiskQuantity += cr.lateRiskQuantity;
      excludedIncomingQuantity += cr.excludedQuantity;
      reviewIncomingQuantity += cr.reviewQuantity;
    });

    var summaryReasons = [];
    for (var s = 0; s < SUMMARY_ORDER.length; s++) { if (summarySet[SUMMARY_ORDER[s]]) summaryReasons.push(SUMMARY_ORDER[s]); }

    return {
      engineType: 'QUALIFIED_INCOMING',
      requiredByDate: requiredByDate,
      qualifiedIncomingQuantity: qualifiedIncomingQuantity, // canonical timely Incoming (B4-R7 → calculateGap.timelyQualifiedIncoming)
      lateRiskQuantity: lateRiskQuantity,
      excludedIncomingQuantity: excludedIncomingQuantity,
      reviewIncomingQuantity: reviewIncomingQuantity,
      kmCandidateCount: kmResults.length,
      deduplicatedKmCandidateCount: groupOrder.length,
      externalObservationCount: externalResults.length,
      externalObservedQuantity: externalObservedQuantity, // reported SEPARATELY; never summed into planning totals
      linkedExternalEvidenceCount: linkedExternalEvidenceCount,
      quarantinedExternalCount: quarantinedExternalCount,
      adoptedExternalCount: adoptedExternalCount,
      adoptionPendingCount: adoptionPendingCount,
      candidateResults: candidateResults,
      externalResults: externalResultsOut,
      summaryReasons: summaryReasons
    };
  }

  return { evaluateQualifiedIncoming: evaluateQualifiedIncoming };
});
  __kmRegister("supply-planning-qualified-incoming", module.exports);
})();

// ----- module: supply-planning-ledgers (verbatim from assets/js/core/supply-planning-ledgers.js) -----
(function () {
  var require = __kmRequire;
  var module = { exports: {} };
  var exports = module.exports;
// Kitchen Mama Operation System — Demand / Supply Ledger pure runtime (Phase 2B, Round 9B).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC implementation of the frozen §39 public contract in
// docs/planning/SUPPLY_PLANNING_CALCULATION_RULES.md (v4.6). Two builders only:
//   • buildDemandLedger({ entries }) — §25.1 demand grain + §27/§29E-event stable-eventId count-once (#27)
//   • buildSupplyLedger({ entries }) — §25.2 supply grain + §30 lifecycle count-once (#15/#16/#17) +
//     §23 physical-pool de-duplication with Marketplace excluded (#32) + §24.9 FBA-vs-3PL separation (#10/#11)
//
// The Ledger NORMALIZES; it never allocates. It owns ONLY deterministic preparation (validation, lifecycle
// count-once, physical-pool dedup, event-identity count-once, stable ordering, immutable count-once effective
// quantities). It reads no DB/API, uses no clock/locale, maps no external status, acquires no events, and
// performs NO allocation / carton rounding / persistence (§39.2). `remaining*` consumption fields are the
// future allocator's, never the Ledger's (§39.7). Same input ⇒ identical output; input never mutated;
// a fresh result object every call.

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') {
    window.KM = window.KM || {};
    window.KM.ledgers = api;
  }
})(this, function () {
  'use strict';

  // ---- frozen enum tokens (§39.3 / §39.4 / §39.5) ---------------------------
  var DEMAND_TYPES = { REGULAR: 1, SALES_RUN_RATE: 1, SPECIAL_EVENT: 1, SAFETY: 1 };
  var POOL_TYPES = { FBA: 1, THREE_PL: 1, FACTORY: 1 };
  // Active lifecycle buckets contribute to effectiveSupplyQty; excluded buckets are visible but contribute 0.
  var ACTIVE_BUCKETS = {
    COMMITTED_PRODUCTION: 1, APPROVED_SHIPPING_PLAN: 1, SHIPPED_IN_TRANSIT: 1,
    DELIVERED_NOT_RECEIVED: 1, RECEIVED_NOT_REFLECTED: 1, CURRENT_STOCK: 1
  };
  var EXCLUDED_BUCKETS = { DRAFT: 1, CANCELLED_INVALID: 1, CORRECTION_REVERSAL: 1 };
  var LIFECYCLE_BUCKETS = {};
  (function () { var k; for (k in ACTIVE_BUCKETS) LIFECYCLE_BUCKETS[k] = 1; for (k in EXCLUDED_BUCKETS) LIFECYCLE_BUCKETS[k] = 1; })();

  var SEP = ''; // non-printable key separator (never appears in canonical identities)

  // ---- helpers --------------------------------------------------------------
  function describe(v) { return v === null ? 'null' : (Array.isArray(v) ? 'array' : typeof v); }
  function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }

  function requireObject(v, name) {
    if (!isObject(v)) throw new TypeError('supplyPlanningLedgers: ' + name + ' must be a non-null, non-array object (got ' + describe(v) + ')');
    return v;
  }
  function requireArray(v, name) {
    if (!Array.isArray(v)) throw new TypeError('supplyPlanningLedgers: ' + name + ' must be an array (got ' + describe(v) + ')');
    return v;
  }
  function requireNonEmptyString(v, name) {
    if (typeof v !== 'string') throw new TypeError('supplyPlanningLedgers: ' + name + ' must be a string (got ' + describe(v) + ')');
    if (v.trim() === '') throw new TypeError('supplyPlanningLedgers: ' + name + ' must be a non-empty string');
    return v;
  }
  // string | null provenance field: undefined/null → null; string ok; anything else → TypeError (no coercion).
  function optNullableString(v, name) {
    if (v === undefined || v === null) return null;
    if (typeof v !== 'string') throw new TypeError('supplyPlanningLedgers: ' + name + ' must be a string or null (got ' + describe(v) + ')');
    return v;
  }
  // enum: non-string → TypeError; string-but-not-a-token → RangeError (§39.10).
  function requireEnum(v, set, name) {
    if (typeof v !== 'string') throw new TypeError('supplyPlanningLedgers: ' + name + ' must be a string (got ' + describe(v) + ')');
    if (set[v] !== 1) throw new RangeError('supplyPlanningLedgers: ' + name + ' is not a supported token (got "' + v + '")');
    return v;
  }
  // quantity: non-number → TypeError; NaN/Infinity/negative → RangeError. 0 is valid. No coercion.
  function requireQty(v, name) {
    if (typeof v !== 'number') throw new TypeError('supplyPlanningLedgers: ' + name + ' must be a number (got ' + describe(v) + ')');
    if (!isFinite(v)) throw new RangeError('supplyPlanningLedgers: ' + name + ' must be finite (got ' + v + ')');
    if (v < 0) throw new RangeError('supplyPlanningLedgers: ' + name + ' must be non-negative (got ' + v + ')');
    return v;
  }
  // strict real YYYY-MM-DD (§27A.7 contract, replicated non-divergently): non-string → TypeError;
  // non-strict 4-2-2 or non-real-calendar → RangeError. No Date constructor, no clock, no locale.
  function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0); }
  function isRealCalendarDate(y, m, d) {
    if (m < 1 || m > 12 || d < 1) return false;
    var dim = [31, (isLeap(y) ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return d <= dim[m - 1];
  }
  function requireStrictIsoDate(v, name) {
    if (typeof v !== 'string') throw new TypeError('supplyPlanningLedgers: ' + name + ' must be a "YYYY-MM-DD" string (got ' + describe(v) + ')');
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (!m) throw new RangeError('supplyPlanningLedgers: ' + name + ' must be strict YYYY-MM-DD (got "' + v + '")');
    if (!isRealCalendarDate(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10))) {
      throw new RangeError('supplyPlanningLedgers: ' + name + ' is not a real calendar date ("' + v + '")');
    }
    return v;
  }

  /**
   * buildDemandLedger({ entries }) → immutable §25.1 Demand Ledger.
   * Count-once by demandKey (SPECIAL_EVENT → …+eventId; else …+demandType+sourceRef); marketplace never in the key.
   * Same key + identical quantity → counted once; same key + differing quantity → one BLOCKED_CONFLICT (qty 0).
   * `remainingUnmetQty` is NOT emitted (allocator-owned, §39.7).
   */
  function buildDemandLedger(input) {
    var root = requireObject(input, 'input');
    var entries = requireArray(root.entries, 'input.entries');

    var normalized = entries.map(function (e, i) {
      var ctx = 'input.entries[' + i + ']';
      requireObject(e, ctx);
      var demandType = requireEnum(e.demandType, DEMAND_TYPES, ctx + '.demandType');
      var masterSku = requireNonEmptyString(e.masterSku, ctx + '.masterSku');
      var company = requireNonEmptyString(e.company, ctx + '.company');
      var country = optNullableString(e.country, ctx + '.country');
      var marketplace = optNullableString(e.marketplace, ctx + '.marketplace');
      var destinationWarehouseId = requireNonEmptyString(e.destinationWarehouseId, ctx + '.destinationWarehouseId');
      var planningCycle = requireNonEmptyString(e.planningCycle, ctx + '.planningCycle');
      var requiredByDate = requireStrictIsoDate(e.requiredByDate, ctx + '.requiredByDate');
      var sourceRef = requireNonEmptyString(e.sourceRef, ctx + '.sourceRef');
      var quantity = requireQty(e.quantity, ctx + '.quantity');
      var isEvent = demandType === 'SPECIAL_EVENT';
      var eventId = isEvent ? requireNonEmptyString(e.eventId, ctx + '.eventId') : null;
      var demandKey = isEvent
        ? [company, destinationWarehouseId, masterSku, planningCycle, eventId].join(SEP)
        : [company, destinationWarehouseId, masterSku, planningCycle, demandType, sourceRef].join(SEP);
      return {
        demandKey: demandKey, demandType: demandType, masterSku: masterSku, company: company,
        country: country, marketplace: marketplace, destinationWarehouseId: destinationWarehouseId,
        planningCycle: planningCycle, requiredByDate: requiredByDate, eventId: eventId, quantity: quantity, _i: i
      };
    });

    var groups = {}; var order = [];
    normalized.forEach(function (n) {
      if (!groups[n.demandKey]) { groups[n.demandKey] = []; order.push(n.demandKey); }
      groups[n.demandKey].push(n);
    });

    var outEntries = []; var blockedCount = 0;
    order.forEach(function (key) {
      var rows = groups[key];
      var qtySet = {}; rows.forEach(function (r) { qtySet[r.quantity] = 1; });
      // representative for descriptive fields = stable-first row (earliest requiredByDate, then input index)
      var rep = rows.slice().sort(function (a, b) { return cmpStr(a.requiredByDate, b.requiredByDate) || (a._i - b._i); })[0];
      var isEvent = rep.demandType === 'SPECIAL_EVENT';
      var out = {
        demandKey: rep.demandKey, demandType: rep.demandType, masterSku: rep.masterSku, company: rep.company,
        country: rep.country, marketplace: rep.marketplace, destinationWarehouseId: rep.destinationWarehouseId,
        planningCycle: rep.planningCycle, requiredByDate: rep.requiredByDate, eventId: rep.eventId,
        effectiveDemandQty: 0, state: 'COUNTED', reason: null
      };
      if (Object.keys(qtySet).length > 1) {
        blockedCount++;
        out.effectiveDemandQty = 0;
        out.state = 'BLOCKED_CONFLICT';
        out.reason = isEvent ? 'DEMAND_EVENT_QTY_CONFLICT' : 'DEMAND_SOURCE_QTY_CONFLICT';
      } else {
        out.effectiveDemandQty = rep.quantity;
      }
      outEntries.push(out);
    });

    outEntries.sort(function (a, b) {
      return cmpStr(a.requiredByDate, b.requiredByDate) || cmpStr(a.demandType, b.demandType) || cmpStr(a.demandKey, b.demandKey);
    });

    var total = 0;
    outEntries.forEach(function (e) { if (e.state === 'COUNTED') total += e.effectiveDemandQty; });

    return { ledgerType: 'DEMAND_LEDGER', entries: outEntries, totalEffectiveDemandQty: total, blockedCount: blockedCount };
  }

  /**
   * buildSupplyLedger({ entries }) → immutable §25.2 Supply Ledger of physical pools.
   * Physical pool key = company + warehouseId + masterSku + poolType (Marketplace/site_sku excluded, §23.1/§39.6).
   * Count-once identity = supplyLineageRef (the stable physical-quantity identity):
   *   • same lineage in >1 (poolKey,bucket)      → SUPPLY_LINEAGE_CONFLICT (lifecycle integrity, §30/#17)
   *   • same lineage, one (poolKey,bucket), diff qty → PHYSICAL_POOL_QTY_CONFLICT (snapshot integrity, #32)
   *   • distinct lineages in one (poolKey,bucket)  → summed (distinct physical quantities)
   * effectiveSupplyQty sums NON-excluded buckets only; a pool touched by any conflict is fail-closed BLOCKED (0).
   * `remainingUnconsumedQty` is NOT emitted (allocator-owned, §39.7).
   */
  function buildSupplyLedger(input) {
    var root = requireObject(input, 'input');
    var entries = requireArray(root.entries, 'input.entries');

    var normalized = entries.map(function (e, i) {
      var ctx = 'input.entries[' + i + ']';
      requireObject(e, ctx);
      var supplyLineageRef = requireNonEmptyString(e.supplyLineageRef, ctx + '.supplyLineageRef');
      var masterSku = requireNonEmptyString(e.masterSku, ctx + '.masterSku');
      var company = requireNonEmptyString(e.company, ctx + '.company');
      var warehouseId = requireNonEmptyString(e.warehouseId, ctx + '.warehouseId');
      var poolType = requireEnum(e.poolType, POOL_TYPES, ctx + '.poolType');
      var lifecycleBucket = requireEnum(e.lifecycleBucket, LIFECYCLE_BUCKETS, ctx + '.lifecycleBucket');
      var quantity = requireQty(e.quantity, ctx + '.quantity');
      var poolKey = [company, warehouseId, masterSku, poolType].join('|');
      return {
        supplyLineageRef: supplyLineageRef, masterSku: masterSku, company: company, warehouseId: warehouseId,
        poolType: poolType, lifecycleBucket: lifecycleBucket, quantity: quantity, poolKey: poolKey, _i: i
      };
    });

    // 1. exact-duplicate removal (same lineage + pool + bucket + quantity → one)
    var seenExact = {}; var deduped = [];
    normalized.forEach(function (n) {
      var sig = [n.supplyLineageRef, n.poolKey, n.lifecycleBucket, n.quantity].join(SEP);
      if (!seenExact[sig]) { seenExact[sig] = 1; deduped.push(n); }
    });

    // 2. lineage-level resolution (count-once identity = supplyLineageRef)
    var lineGroups = {}; var lineOrder = [];
    deduped.forEach(function (n) {
      if (!lineGroups[n.supplyLineageRef]) { lineGroups[n.supplyLineageRef] = []; lineOrder.push(n.supplyLineageRef); }
      lineGroups[n.supplyLineageRef].push(n);
    });
    var lineageRes = {};
    lineOrder.forEach(function (ref) {
      var rows = lineGroups[ref];
      var pbSet = {}; var pbOrder = []; var qtySet = {}; var touchedSet = {}; var touched = [];
      rows.forEach(function (r) {
        var pb = r.poolKey + SEP + r.lifecycleBucket;
        if (!pbSet[pb]) { pbSet[pb] = r; pbOrder.push(pb); }
        qtySet[r.quantity] = 1;
        if (!touchedSet[r.poolKey]) { touchedSet[r.poolKey] = 1; touched.push(r.poolKey); }
      });
      if (pbOrder.length > 1) {
        lineageRes[ref] = { status: 'BLOCKED', reason: 'SUPPLY_LINEAGE_CONFLICT', touched: touched };
      } else if (Object.keys(qtySet).length > 1) {
        lineageRes[ref] = { status: 'BLOCKED', reason: 'PHYSICAL_POOL_QTY_CONFLICT', touched: touched };
      } else {
        var one = pbSet[pbOrder[0]];
        lineageRes[ref] = { status: 'COUNTED', poolKey: one.poolKey, bucket: one.lifecycleBucket, quantity: one.quantity, touched: touched };
      }
    });

    // 3. assemble pools (fail-closed: a pool touched by any blocked lineage is BLOCKED_CONFLICT)
    var poolMeta = {}; var poolOrder = [];
    deduped.forEach(function (n) { if (!poolMeta[n.poolKey]) { poolMeta[n.poolKey] = n; poolOrder.push(n.poolKey); } });

    var pools = []; var blockedCount = 0;
    poolOrder.forEach(function (pk) {
      var meta = poolMeta[pk];
      var counted = []; var blockedReasons = []; var refSet = {}; var refs = [];
      lineOrder.forEach(function (ref) {
        var res = lineageRes[ref];
        if (res.touched.indexOf(pk) === -1) return;
        if (!refSet[ref]) { refSet[ref] = 1; refs.push(ref); }
        if (res.status === 'BLOCKED') blockedReasons.push(res.reason);
        else counted.push(res);
      });
      refs.sort(cmpStr);
      var base = { poolKey: pk, company: meta.company, warehouseId: meta.warehouseId, masterSku: meta.masterSku, poolType: meta.poolType };
      if (blockedReasons.length) {
        blockedCount++;
        base.byLifecycleBucket = {};
        base.effectiveSupplyQty = 0;
        base.lineageRefs = refs;
        base.state = 'BLOCKED_CONFLICT';
        base.reason = blockedReasons.indexOf('SUPPLY_LINEAGE_CONFLICT') !== -1 ? 'SUPPLY_LINEAGE_CONFLICT' : 'PHYSICAL_POOL_QTY_CONFLICT';
      } else {
        var byBucket = {}; var eff = 0;
        counted.forEach(function (c) { byBucket[c.bucket] = (byBucket[c.bucket] || 0) + c.quantity; });
        Object.keys(byBucket).forEach(function (b) { if (ACTIVE_BUCKETS[b] === 1) eff += byBucket[b]; });
        base.byLifecycleBucket = byBucket;
        base.effectiveSupplyQty = eff;
        base.lineageRefs = refs;
        base.state = 'COUNTED';
        base.reason = null;
      }
      pools.push(base);
    });

    pools.sort(function (a, b) { return cmpStr(a.poolKey, b.poolKey); });

    var total = 0;
    pools.forEach(function (p) { if (p.state === 'COUNTED') total += p.effectiveSupplyQty; });

    return { ledgerType: 'SUPPLY_LEDGER', pools: pools, totalEffectiveSupplyQty: total, blockedCount: blockedCount };
  }

  return { buildDemandLedger: buildDemandLedger, buildSupplyLedger: buildSupplyLedger };
});
  __kmRegister("supply-planning-ledgers", module.exports);
})();

// ----- module: supply-planning-allocations (verbatim from assets/js/core/supply-planning-allocations.js) -----
(function () {
  var require = __kmRequire;
  var module = { exports: {} };
  var exports = module.exports;
// Kitchen Mama Operation System — Allocation pure runtime (Phase 2B, Round 10B).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC implementation of the frozen §40 public contract in
// docs/planning/SUPPLY_PLANNING_CALCULATION_RULES.md (v4.7). Two allocators only:
//   • allocateOverseasSharedPool({ company, country, masterSku, supplyPools, receivers })
//       — §20/§24 overseas shared-pool allocation: NORMAL / PROTECTED / SHORTAGE mode selection
//         (§24.5/§24.6/§24.7), 18-day survival protection (§20.3/§24.4), deterministic largest-remainder
//         (§24.7), and FBA-vs-THREE_PL lane separation with NO cross-type fallback (§23.6/§24.9) — #7/#8/#9/#10/#11
//   • allocateFactoryDeterministic({ masterSku, factoryPools, demands })
//       — §35 factory FIFO by Required-By across companies, each factory unit allocated once — #19
//
// The allocator DISTRIBUTES; it never persists, reserves, deducts, rounds cartons, or executes business (§40.2).
// It consumes an explicit AllocationInput DTO projected from immutable §39 Ledger effective quantities and never
// writes back into any input object (§40.3). Local remaining* is allocator-internal and never exposed (§40.7/§40.15).
// No DB/API/clock/locale/random; same input ⇒ identical output; a fresh result object every call.

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') {
    window.KM = window.KM || {};
    window.KM.allocations = api;
  }
})(this, function () {
  'use strict';

  var POOL_TYPES_OVERSEAS = { THREE_PL: 1, FBA: 1 };
  var FULFILLMENT_MODELS = { self_fulfilled: 1, platform_fulfilled: 1, hybrid: 1 };
  var LEDGER_STATES = { COUNTED: 1, BLOCKED_CONFLICT: 1 };
  var MODE_SEVERITY = { NORMAL_ALLOCATION: 0, PROTECTED_REALLOCATION: 1, SHORTAGE_ALLOCATION: 2 };

  // ---- helpers --------------------------------------------------------------
  function describe(v) { return v === null ? 'null' : (Array.isArray(v) ? 'array' : typeof v); }
  function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }

  function requireObject(v, name) {
    if (!isObject(v)) throw new TypeError('supplyPlanningAllocations: ' + name + ' must be a non-null, non-array object (got ' + describe(v) + ')');
    return v;
  }
  function requireArray(v, name) {
    if (!Array.isArray(v)) throw new TypeError('supplyPlanningAllocations: ' + name + ' must be an array (got ' + describe(v) + ')');
    return v;
  }
  function requireNonEmptyString(v, name) {
    if (typeof v !== 'string') throw new TypeError('supplyPlanningAllocations: ' + name + ' must be a string (got ' + describe(v) + ')');
    if (v.trim() === '') throw new TypeError('supplyPlanningAllocations: ' + name + ' must be a non-empty string');
    return v;
  }
  function requireEnum(v, set, name) {
    if (typeof v !== 'string') throw new TypeError('supplyPlanningAllocations: ' + name + ' must be a string (got ' + describe(v) + ')');
    if (set[v] !== 1) throw new RangeError('supplyPlanningAllocations: ' + name + ' is not a supported token (got "' + v + '")');
    return v;
  }
  function requireQty(v, name) {
    if (typeof v !== 'number') throw new TypeError('supplyPlanningAllocations: ' + name + ' must be a number (got ' + describe(v) + ')');
    if (!isFinite(v)) throw new RangeError('supplyPlanningAllocations: ' + name + ' must be finite (got ' + v + ')');
    if (v < 0) throw new RangeError('supplyPlanningAllocations: ' + name + ' must be non-negative (got ' + v + ')');
    return v;
  }
  function optNullableString(v, name) {
    if (v === undefined || v === null) return null;
    if (typeof v !== 'string') throw new TypeError('supplyPlanningAllocations: ' + name + ' must be a string or null (got ' + describe(v) + ')');
    return v;
  }
  function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0); }
  function isRealCalendarDate(y, m, d) {
    if (m < 1 || m > 12 || d < 1) return false;
    var dim = [31, (isLeap(y) ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return d <= dim[m - 1];
  }
  function requireStrictIsoDate(v, name) {
    if (typeof v !== 'string') throw new TypeError('supplyPlanningAllocations: ' + name + ' must be a "YYYY-MM-DD" string (got ' + describe(v) + ')');
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (!m) throw new RangeError('supplyPlanningAllocations: ' + name + ' must be strict YYYY-MM-DD (got "' + v + '")');
    if (!isRealCalendarDate(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10))) {
      throw new RangeError('supplyPlanningAllocations: ' + name + ' is not a real calendar date ("' + v + '")');
    }
    return v;
  }
  function optState(v, name) {
    if (v === undefined || v === null) return 'COUNTED';
    if (typeof v !== 'string') throw new TypeError('supplyPlanningAllocations: ' + name + ' must be a string state (got ' + describe(v) + ')');
    if (LEDGER_STATES[v] !== 1) throw new RangeError('supplyPlanningAllocations: ' + name + ' is not a supported Ledger state (got "' + v + '")');
    return v;
  }

  // Deterministic weight distribution with per-item caps and cap-overflow redistribution.
  // Real proportional rounds resolve capping; the final no-cap round distributes integer leftovers
  // one unit at a time in `leftoverCmp` order. Returns integer allocations that conserve the pool.
  function distributeByWeightCapped(pool, items, leftoverCmp) {
    var alloc = {}; items.forEach(function (it) { alloc[it.key] = 0; });
    var remaining = pool;
    var guard = 0;
    while (remaining > 0 && guard++ < 100000) {
      var active = items.filter(function (it) { return it.weight > 0 && alloc[it.key] < it.cap; });
      if (active.length === 0) break;
      var sumW = 0; active.forEach(function (it) { sumW += it.weight; });
      if (sumW <= 0) break;
      var entries = active.map(function (it) { return { it: it, raw: remaining * it.weight / sumW }; });
      var cappedThisRound = false;
      entries.forEach(function (e) {
        var room = e.it.cap - alloc[e.it.key];
        var fl = Math.floor(e.raw);
        if (fl >= room) { e.give = room; cappedThisRound = true; }
        else { e.give = fl; }
      });
      entries.forEach(function (e) { alloc[e.it.key] += e.give; remaining -= e.give; });
      if (cappedThisRound) continue; // freed capacity → redistribute in the next round
      // final integer leftover distribution (leftover < number of active receivers)
      var cands = entries.slice().sort(leftoverCmp);
      var pass = 0;
      while (remaining > 0 && pass++ < 100000) {
        var gaveAny = false;
        for (var k = 0; k < cands.length && remaining > 0; k++) {
          var c = cands[k];
          if (alloc[c.it.key] < c.it.cap) { alloc[c.it.key] += 1; remaining -= 1; gaveAny = true; }
        }
        if (!gaveAny) break;
      }
      break;
    }
    return { alloc: alloc, unused: remaining < 0 ? 0 : remaining };
  }

  // ============================ OVERSEAS =====================================
  function allocateOverseasSharedPool(input) {
    var root = requireObject(input, 'input');
    var company = requireNonEmptyString(root.company, 'input.company');
    var country = requireNonEmptyString(root.country, 'input.country');
    var masterSku = requireNonEmptyString(root.masterSku, 'input.masterSku');
    var supplyPools = requireArray(root.supplyPools, 'input.supplyPools');
    var receivers = requireArray(root.receivers, 'input.receivers');

    var blockedInputs = [];
    var poolSeen = {};
    var pools = [];
    supplyPools.forEach(function (p, i) {
      var ctx = 'input.supplyPools[' + i + ']';
      requireObject(p, ctx);
      var poolKey = requireNonEmptyString(p.poolKey, ctx + '.poolKey');
      var state = optState(p.state, ctx + '.state');
      if (poolSeen[poolKey]) throw new RangeError('supplyPlanningAllocations: duplicate poolKey "' + poolKey + '"');
      poolSeen[poolKey] = 1;
      if (state === 'BLOCKED_CONFLICT') { blockedInputs.push({ kind: 'SUPPLY', key: poolKey, reason: typeof p.reason === 'string' ? p.reason : 'BLOCKED_CONFLICT' }); return; }
      var poolType = requireEnum(p.poolType, POOL_TYPES_OVERSEAS, ctx + '.poolType');
      var warehouseId = requireNonEmptyString(p.warehouseId, ctx + '.warehouseId');
      var effectiveSupplyQty = requireQty(p.effectiveSupplyQty, ctx + '.effectiveSupplyQty');
      pools.push({ poolKey: poolKey, poolType: poolType, warehouseId: warehouseId, effectiveSupplyQty: effectiveSupplyQty, remaining: effectiveSupplyQty });
    });

    var recvSeen = {}, demandSeen = {};
    var recvs = [];
    receivers.forEach(function (r, i) {
      var ctx = 'input.receivers[' + i + ']';
      requireObject(r, ctx);
      var receiverKey = requireNonEmptyString(r.receiverKey, ctx + '.receiverKey');
      var demandKey = requireNonEmptyString(r.demandKey, ctx + '.demandKey');
      var state = optState(r.state, ctx + '.state');
      if (recvSeen[receiverKey]) throw new RangeError('supplyPlanningAllocations: duplicate receiverKey "' + receiverKey + '"');
      recvSeen[receiverKey] = 1;
      if (demandSeen[demandKey]) throw new RangeError('supplyPlanningAllocations: duplicate demandKey "' + demandKey + '"');
      demandSeen[demandKey] = 1;
      if (state === 'BLOCKED_CONFLICT') { blockedInputs.push({ kind: 'DEMAND', key: demandKey, reason: typeof r.reason === 'string' ? r.reason : 'BLOCKED_CONFLICT' }); return; }
      var marketplace = requireNonEmptyString(r.marketplace, ctx + '.marketplace');
      var destinationWarehouseId = requireNonEmptyString(r.destinationWarehouseId, ctx + '.destinationWarehouseId');
      var fulfillmentModel = requireEnum(r.fulfillmentModel, FULFILLMENT_MODELS, ctx + '.fulfillmentModel');
      var demandQty = requireQty(r.demandQty, ctx + '.demandQty');
      var survivalNeedQty = requireQty(r.survivalNeedQty, ctx + '.survivalNeedQty');
      var allocationPriority = requireQty(r.allocationPriority, ctx + '.allocationPriority');
      var demandWeight = requireQty(r.demandWeight, ctx + '.demandWeight');
      var eligiblePoolTypes = requireArray(r.eligiblePoolTypes, ctx + '.eligiblePoolTypes').map(function (t, j) {
        return requireEnum(t, POOL_TYPES_OVERSEAS, ctx + '.eligiblePoolTypes[' + j + ']');
      });
      recvs.push({ receiverKey: receiverKey, demandKey: demandKey, marketplace: marketplace, destinationWarehouseId: destinationWarehouseId,
        fulfillmentModel: fulfillmentModel, demandQty: demandQty, survivalNeedQty: survivalNeedQty,
        allocationPriority: allocationPriority, demandWeight: demandWeight, eligiblePoolTypes: eligiblePoolTypes });
    });

    var allocations = []; var seq = { n: 0 };
    var unallocatedDemand = [];
    var laneModes = [];

    // deterministic overseas receiver order (§40.13): priority desc → weight desc → marketplace asc → receiverKey asc
    function recvOrder(a, b) {
      return (b.allocationPriority - a.allocationPriority) || (b.demandWeight - a.demandWeight)
        || cmpStr(a.marketplace, b.marketplace) || cmpStr(a.receiverKey, b.receiverKey);
    }

    ['FBA', 'THREE_PL'].forEach(function (lane) {
      var lanePools = pools.filter(function (p) { return p.poolType === lane; }).sort(function (a, b) { return cmpStr(a.poolKey, b.poolKey); });
      var laneRecvs = recvs.filter(function (r) { return r.eligiblePoolTypes.indexOf(lane) !== -1; });
      if (laneRecvs.length === 0) return;
      var poolSupply = 0; lanePools.forEach(function (p) { poolSupply += p.remaining; });
      var sumSurvival = 0; laneRecvs.forEach(function (r) { sumSurvival += Math.min(r.survivalNeedQty, r.demandQty); });

      var mode, finalAlloc = {}, survivalAlloc = {};
      if (poolSupply < sumSurvival) {
        mode = 'SHORTAGE_ALLOCATION';
        // §24.7 weighted-survival largest remainder; leftover order: priority desc → unmet-survival desc → mp → key
        var items = laneRecvs.map(function (r) { return { key: r.receiverKey, weight: Math.min(r.survivalNeedQty, r.demandQty) * Math.max(r.allocationPriority, 1), cap: r.demandQty, r: r }; });
        var res = distributeByWeightCapped(poolSupply, items, function (a, b) {
          var ra = a.it.r, rb = b.it.r;
          return (rb.allocationPriority - ra.allocationPriority)
            || ((rb.survivalNeedQty) - (ra.survivalNeedQty))
            || cmpStr(ra.marketplace, rb.marketplace) || cmpStr(ra.receiverKey, rb.receiverKey);
        });
        laneRecvs.forEach(function (r) { finalAlloc[r.receiverKey] = res.alloc[r.receiverKey] || 0; survivalAlloc[r.receiverKey] = finalAlloc[r.receiverKey]; });
      } else {
        // NORMAL vs PROTECTED diagnostic = pure-weight split of the whole pool (§40.5)
        var wItems = laneRecvs.map(function (r) { return { key: r.receiverKey, weight: r.demandWeight, cap: r.demandQty, r: r }; });
        var prov = distributeByWeightCapped(poolSupply, wItems, function (a, b) {
          return (b.it.r.allocationPriority - a.it.r.allocationPriority) || cmpStr(a.it.r.marketplace, b.it.r.marketplace) || cmpStr(a.it.r.receiverKey, b.it.r.receiverKey);
        });
        var allSafe = laneRecvs.every(function (r) { return (prov.alloc[r.receiverKey] || 0) >= Math.min(r.survivalNeedQty, r.demandQty); });
        mode = allSafe ? 'NORMAL_ALLOCATION' : 'PROTECTED_REALLOCATION';
        // actual allocation = survival-first, then weighted distribution of the remaining pool
        var remainingPool = poolSupply;
        laneRecvs.forEach(function (r) { var sv = Math.min(r.survivalNeedQty, r.demandQty, remainingPool); survivalAlloc[r.receiverKey] = sv; remainingPool -= sv; });
        var wItems2 = laneRecvs.map(function (r) { return { key: r.receiverKey, weight: r.demandWeight, cap: r.demandQty - survivalAlloc[r.receiverKey], r: r }; });
        var wres = distributeByWeightCapped(remainingPool, wItems2, function (a, b) {
          return (b.it.r.allocationPriority - a.it.r.allocationPriority) || cmpStr(a.it.r.marketplace, b.it.r.marketplace) || cmpStr(a.it.r.receiverKey, b.it.r.receiverKey);
        });
        laneRecvs.forEach(function (r) { finalAlloc[r.receiverKey] = survivalAlloc[r.receiverKey] + (wres.alloc[r.receiverKey] || 0); });
      }
      laneModes.push(mode);

      // Assign each receiver's allocation to source pools (ascending poolKey), splitting survival vs weighted reason.
      var ordered = laneRecvs.slice().sort(recvOrder);
      function reserveReason(r, baseReason) { return (lane === 'THREE_PL' && r.fulfillmentModel === 'platform_fulfilled') ? 'THREE_PL_REPLENISHMENT_RESERVE' : baseReason; }
      function assign(r, qty, reason) {
        var need = qty;
        for (var pi = 0; pi < lanePools.length && need > 0; pi++) {
          var p = lanePools[pi];
          if (p.remaining <= 0) continue;
          var take = Math.min(need, p.remaining);
          if (take <= 0) continue;
          p.remaining -= take; need -= take;
          allocations.push({
            allocationKey: 'OVERSEAS_SHARED_POOL|' + p.poolKey + '|' + r.demandKey + '|' + seq.n,
            allocationType: 'OVERSEAS_SHARED_POOL', sourcePoolKey: p.poolKey, sourcePoolType: p.poolType, sourceWarehouseId: p.warehouseId,
            masterSku: masterSku, company: company, country: country, marketplace: r.marketplace, destinationWarehouseId: r.destinationWarehouseId,
            demandKey: r.demandKey, allocatedQty: take, allocationSequence: seq.n, allocationReason: reason
          });
          seq.n += 1;
        }
      }
      var survReasonBase = mode === 'PROTECTED_REALLOCATION' ? 'PROTECTION_REALLOCATION' : (mode === 'SHORTAGE_ALLOCATION' ? 'SHORTAGE_LARGEST_REMAINDER' : 'SURVIVAL_18D');
      if (mode !== 'SHORTAGE_ALLOCATION') {
        ordered.forEach(function (r) { if (survivalAlloc[r.receiverKey] > 0) assign(r, survivalAlloc[r.receiverKey], reserveReason(r, survReasonBase)); });
        ordered.forEach(function (r) { var w = finalAlloc[r.receiverKey] - survivalAlloc[r.receiverKey]; if (w > 0) assign(r, w, reserveReason(r, 'WEIGHTED_REMAINDER')); });
      } else {
        ordered.forEach(function (r) { if (finalAlloc[r.receiverKey] > 0) assign(r, finalAlloc[r.receiverKey], reserveReason(r, 'SHORTAGE_LARGEST_REMAINDER')); });
      }

      // unallocated demand per receiver in this lane
      ordered.forEach(function (r) {
        var unmet = r.demandQty - finalAlloc[r.receiverKey];
        if (unmet > 0) {
          var reason = mode === 'SHORTAGE_ALLOCATION' ? 'SHORTAGE_UNMET'
            : (survivalAlloc[r.receiverKey] < Math.min(r.survivalNeedQty, r.demandQty) ? 'PROTECTION_FLOOR_BLOCKED' : 'DEMAND_UNMET');
          unallocatedDemand.push({ demandKey: r.demandKey, company: company, country: country, marketplace: r.marketplace,
            destinationWarehouseId: r.destinationWarehouseId, poolType: lane, unallocatedQty: unmet, allocationReason: reason });
        }
      });
    });

    // eligible totals: per lane demand counted (a both-lane receiver counts per lane it participates in)
    var totalDemandQty = 0;
    ['FBA', 'THREE_PL'].forEach(function (lane) {
      recvs.forEach(function (r) { if (r.eligiblePoolTypes.indexOf(lane) !== -1) totalDemandQty += r.demandQty; });
    });
    var totalSupplyQty = 0; pools.forEach(function (p) { totalSupplyQty += p.effectiveSupplyQty; });

    var unusedSupply = pools.slice().sort(function (a, b) { return cmpStr(a.poolKey, b.poolKey); })
      .filter(function (p) { return p.remaining > 0; })
      .map(function (p) { return { poolKey: p.poolKey, poolType: p.poolType, warehouseId: p.warehouseId, unusedQty: p.remaining }; });

    allocations.sort(function (a, b) { return cmpStr(a.sourcePoolKey, b.sourcePoolKey) || cmpStr(a.demandKey, b.demandKey) || (a.allocationSequence - b.allocationSequence); });
    unallocatedDemand.sort(function (a, b) { return cmpStr(a.demandKey, b.demandKey) || cmpStr(a.poolType, b.poolType); });

    var totalAllocatedQty = 0; allocations.forEach(function (a) { totalAllocatedQty += a.allocatedQty; });
    var totalUnallocatedDemandQty = 0; unallocatedDemand.forEach(function (u) { totalUnallocatedDemandQty += u.unallocatedQty; });
    var totalUnusedSupplyQty = 0; unusedSupply.forEach(function (u) { totalUnusedSupplyQty += u.unusedQty; });

    var allocationMode = laneModes.length
      ? laneModes.reduce(function (acc, m) { return MODE_SEVERITY[m] > MODE_SEVERITY[acc] ? m : acc; }, 'NORMAL_ALLOCATION')
      : 'NORMAL_ALLOCATION';

    verifyConservation(totalAllocatedQty, totalUnallocatedDemandQty, totalDemandQty, totalUnusedSupplyQty, totalSupplyQty);

    return {
      allocationType: 'OVERSEAS_SHARED_POOL', allocationMode: allocationMode,
      allocations: allocations, unallocatedDemand: unallocatedDemand, unusedSupply: unusedSupply, blockedInputs: blockedInputs,
      totalDemandQty: totalDemandQty, totalSupplyQty: totalSupplyQty, totalAllocatedQty: totalAllocatedQty,
      totalUnallocatedDemandQty: totalUnallocatedDemandQty, totalUnusedSupplyQty: totalUnusedSupplyQty
    };
  }

  // ============================ FACTORY ======================================
  function allocateFactoryDeterministic(input) {
    var root = requireObject(input, 'input');
    var masterSku = requireNonEmptyString(root.masterSku, 'input.masterSku');
    var factoryPools = requireArray(root.factoryPools, 'input.factoryPools');
    var demands = requireArray(root.demands, 'input.demands');

    var blockedInputs = [];
    var poolSeen = {}; var pools = []; var poolByKey = {};
    factoryPools.forEach(function (p, i) {
      var ctx = 'input.factoryPools[' + i + ']';
      requireObject(p, ctx);
      var poolKey = requireNonEmptyString(p.poolKey, ctx + '.poolKey');
      var state = optState(p.state, ctx + '.state');
      if (poolSeen[poolKey]) throw new RangeError('supplyPlanningAllocations: duplicate poolKey "' + poolKey + '"');
      poolSeen[poolKey] = 1;
      if (state === 'BLOCKED_CONFLICT') { blockedInputs.push({ kind: 'SUPPLY', key: poolKey, reason: typeof p.reason === 'string' ? p.reason : 'BLOCKED_CONFLICT' }); return; }
      var poolType = requireEnum(p.poolType, { FACTORY: 1 }, ctx + '.poolType');
      var warehouseId = requireNonEmptyString(p.warehouseId, ctx + '.warehouseId');
      var effectiveSupplyQty = requireQty(p.effectiveSupplyQty, ctx + '.effectiveSupplyQty');
      var rec = { poolKey: poolKey, poolType: poolType, warehouseId: warehouseId, effectiveSupplyQty: effectiveSupplyQty, remaining: effectiveSupplyQty };
      pools.push(rec); poolByKey[poolKey] = rec;
    });

    var demandSeen = {}; var dems = [];
    demands.forEach(function (dd, i) {
      var ctx = 'input.demands[' + i + ']';
      requireObject(dd, ctx);
      var demandKey = requireNonEmptyString(dd.demandKey, ctx + '.demandKey');
      var state = optState(dd.state, ctx + '.state');
      if (demandSeen[demandKey]) throw new RangeError('supplyPlanningAllocations: duplicate demandKey "' + demandKey + '"');
      demandSeen[demandKey] = 1;
      if (state === 'BLOCKED_CONFLICT') { blockedInputs.push({ kind: 'DEMAND', key: demandKey, reason: typeof dd.reason === 'string' ? dd.reason : 'BLOCKED_CONFLICT' }); return; }
      var comp = requireNonEmptyString(dd.company, ctx + '.company');
      var marketplace = requireNonEmptyString(dd.marketplace, ctx + '.marketplace');
      var destinationWarehouseId = requireNonEmptyString(dd.destinationWarehouseId, ctx + '.destinationWarehouseId');
      var requiredByDate = requireStrictIsoDate(dd.requiredByDate, ctx + '.requiredByDate');
      var allocationPriority = requireQty(dd.allocationPriority, ctx + '.allocationPriority');
      var demandQty = requireQty(dd.demandQty, ctx + '.demandQty');
      var eligibleFactoryWarehouseIds = requireArray(dd.eligibleFactoryWarehouseIds, ctx + '.eligibleFactoryWarehouseIds').map(function (w, j) {
        return requireNonEmptyString(w, ctx + '.eligibleFactoryWarehouseIds[' + j + ']');
      });
      dems.push({ demandKey: demandKey, company: comp, marketplace: marketplace, destinationWarehouseId: destinationWarehouseId,
        requiredByDate: requiredByDate, allocationPriority: allocationPriority, demandQty: demandQty, remaining: demandQty,
        eligibleFactoryWarehouseIds: eligibleFactoryWarehouseIds });
    });

    // §35 demand order: requiredByDate asc → priority desc → company asc → marketplace asc → destination asc → demandKey asc
    var ordered = dems.slice().sort(function (a, b) {
      return cmpStr(a.requiredByDate, b.requiredByDate) || (b.allocationPriority - a.allocationPriority)
        || cmpStr(a.company, b.company) || cmpStr(a.marketplace, b.marketplace)
        || cmpStr(a.destinationWarehouseId, b.destinationWarehouseId) || cmpStr(a.demandKey, b.demandKey);
    });
    var sortedPoolKeys = pools.map(function (p) { return p.poolKey; }).sort(cmpStr);

    var allocations = []; var seqn = 0;
    ordered.forEach(function (d) {
      for (var pi = 0; pi < sortedPoolKeys.length && d.remaining > 0; pi++) {
        var p = poolByKey[sortedPoolKeys[pi]];
        if (d.eligibleFactoryWarehouseIds.indexOf(p.warehouseId) === -1) continue;
        if (p.remaining <= 0) continue;
        var take = Math.min(d.remaining, p.remaining);
        if (take <= 0) continue;
        p.remaining -= take; d.remaining -= take;
        allocations.push({
          allocationKey: 'FACTORY_DETERMINISTIC|' + p.poolKey + '|' + d.demandKey + '|' + seqn,
          allocationType: 'FACTORY_DETERMINISTIC', sourcePoolKey: p.poolKey, sourcePoolType: p.poolType, sourceWarehouseId: p.warehouseId,
          masterSku: masterSku, company: d.company, country: null, marketplace: d.marketplace, destinationWarehouseId: d.destinationWarehouseId,
          demandKey: d.demandKey, allocatedQty: take, allocationSequence: seqn, allocationReason: 'FACTORY_FIFO'
        });
        seqn += 1;
      }
    });

    var unallocatedDemand = ordered.filter(function (d) { return d.remaining > 0; }).map(function (d) {
      return { demandKey: d.demandKey, company: d.company, country: null, marketplace: d.marketplace,
        destinationWarehouseId: d.destinationWarehouseId, poolType: 'FACTORY', unallocatedQty: d.remaining, allocationReason: 'FACTORY_SUPPLY_EXHAUSTED' };
    }).sort(function (a, b) { return cmpStr(a.demandKey, b.demandKey); });

    var unusedSupply = pools.slice().sort(function (a, b) { return cmpStr(a.poolKey, b.poolKey); })
      .filter(function (p) { return p.remaining > 0; })
      .map(function (p) { return { poolKey: p.poolKey, poolType: p.poolType, warehouseId: p.warehouseId, unusedQty: p.remaining }; });

    allocations.sort(function (a, b) { return cmpStr(a.sourcePoolKey, b.sourcePoolKey) || cmpStr(a.demandKey, b.demandKey) || (a.allocationSequence - b.allocationSequence); });

    var totalDemandQty = 0; dems.forEach(function (d) { totalDemandQty += d.demandQty; });
    var totalSupplyQty = 0; pools.forEach(function (p) { totalSupplyQty += p.effectiveSupplyQty; });
    var totalAllocatedQty = 0; allocations.forEach(function (a) { totalAllocatedQty += a.allocatedQty; });
    var totalUnallocatedDemandQty = 0; unallocatedDemand.forEach(function (u) { totalUnallocatedDemandQty += u.unallocatedQty; });
    var totalUnusedSupplyQty = 0; unusedSupply.forEach(function (u) { totalUnusedSupplyQty += u.unusedQty; });

    verifyConservation(totalAllocatedQty, totalUnallocatedDemandQty, totalDemandQty, totalUnusedSupplyQty, totalSupplyQty);

    return {
      allocationType: 'FACTORY_DETERMINISTIC',
      allocations: allocations, unallocatedDemand: unallocatedDemand, unusedSupply: unusedSupply, blockedInputs: blockedInputs,
      totalDemandQty: totalDemandQty, totalSupplyQty: totalSupplyQty, totalAllocatedQty: totalAllocatedQty,
      totalUnallocatedDemandQty: totalUnallocatedDemandQty, totalUnusedSupplyQty: totalUnusedSupplyQty
    };
  }

  // Defensive conservation guard (§40.11/§40.14). Must never fire in correct code.
  function verifyConservation(alloc, unallocDemand, totalDemand, unusedSupply, totalSupply) {
    if (alloc + unallocDemand !== totalDemand) {
      throw new RangeError('supplyPlanningAllocations: demand conservation violated (' + alloc + ' + ' + unallocDemand + ' != ' + totalDemand + ')');
    }
    if (alloc + unusedSupply !== totalSupply) {
      throw new RangeError('supplyPlanningAllocations: supply conservation violated (' + alloc + ' + ' + unusedSupply + ' != ' + totalSupply + ')');
    }
  }

  return { allocateOverseasSharedPool: allocateOverseasSharedPool, allocateFactoryDeterministic: allocateFactoryDeterministic };
});
  __kmRegister("supply-planning-allocations", module.exports);
})();

// ----- module: supply-planning-line-runtime (verbatim from assets/js/core/supply-planning-line-runtime.js) -----
(function () {
  var require = __kmRequire;
  var module = { exports: {} };
  var exports = module.exports;
// Kitchen Mama Operation System — Minimal Supply-Planning Line Runtime (B-4 Minimal Runtime, batch B4-R7).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC one-line orchestrator. For ONE exact planning line (company + Master SKU +
// destinationWarehouseId + Required-By window) it connects the VERIFIED B4-R6 Qualified-Incoming engine to the
// EXISTING canonical calculateGap() — nothing more. It CALLS the real evaluateQualifiedIncoming and the real
// calculateGap; it copies NO arithmetic and defines NO second gap formula.
//
// STRICT WIRING: the ONLY B4-R6 quantity that enters calculateGap is qualifiedIncomingResult.qualifiedIncomingQuantity,
// passed exactly as calculateGap.timelyQualifiedIncoming. Late Risk, Review, Excluded and every external observed
// quantity remain VISIBLE in the breakdown but contribute ZERO to the gap. Demand, destinationCurrentStock,
// timelyApprovedCommittedSupply and timelyQualifiedIncoming are each applied EXACTLY ONCE (by calculateGap).
//
// BOUNDARY: it reads no Sheet/DB/API, builds no B4-R3 candidates, reruns no B4-R4/B4-R5, decides no demand /
// committed-supply / recommendation quantity, does no carton rounding / allocation, persists nothing, installs no
// scheduler. The caller supplies already-built, already-scoped B4-R4 / B4-R5 results and the four numeric line
// quantities. No clock, no locale, no mutation.

(function (root, factory) {
  'use strict';
  var deps;
  if (typeof module !== 'undefined' && module.exports) {
    deps = {
      evaluateQualifiedIncoming: require('./supply-planning-qualified-incoming.js').evaluateQualifiedIncoming,
      calculateGap: require('./supply-planning-calculations.js').calculateGap
    };
    module.exports = factory(deps);
  } else {
    root.KM = root.KM || {};
    var km = root.KM;
    deps = {
      evaluateQualifiedIncoming: km.qualifiedIncoming && km.qualifiedIncoming.evaluateQualifiedIncoming,
      calculateGap: km.core && km.core.supplyPlanningCalculations && km.core.supplyPlanningCalculations.calculateGap
    };
    km.lineRuntime = factory(deps);
  }
})(this, function (deps) {
  'use strict';

  var evaluateQualifiedIncoming = deps && deps.evaluateQualifiedIncoming;
  var calculateGap = deps && deps.calculateGap;

  function describe(v) { return v === null ? 'null' : (Array.isArray(v) ? 'array' : typeof v); }
  function isBlank(v) { return v === '' || v === null || v === undefined || (typeof v === 'string' && v.trim() === ''); }
  function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function normToken(v) { return String(v === null || v === undefined ? '' : v).trim().toLowerCase(); }
  function optStr(v) { if (v === null || v === undefined) return null; var s = String(v).trim(); return s === '' ? null : s; }

  function requireObject(v, name) {
    if (!isObject(v)) throw new TypeError('runSupplyPlanningLine: ' + name + ' must be a non-null, non-array object (got ' + describe(v) + ')');
    return v;
  }
  function requireArray(v, name) {
    if (!Array.isArray(v)) throw new TypeError('runSupplyPlanningLine: ' + name + ' must be an array (got ' + describe(v) + ')');
    return v;
  }
  function requireNonBlankString(v, name) {
    if (v === null || v === undefined) throw new RangeError('runSupplyPlanningLine: ' + name + ' is required (got ' + describe(v) + ')');
    if (typeof v !== 'string') throw new TypeError('runSupplyPlanningLine: ' + name + ' must be a string (got ' + describe(v) + ')');
    if (v.trim() === '') throw new RangeError('runSupplyPlanningLine: ' + name + ' must be a non-empty string');
    return v.trim();
  }
  // Numeric line quantity: non-number → TypeError; NaN/Infinity/negative → RangeError. No numeric-string coercion.
  // (calculateGap re-validates the same four values; this fails early with precise, testable error types.)
  function requireQty(v, name) {
    if (typeof v !== 'number') throw new TypeError('runSupplyPlanningLine: ' + name + ' must be a number (got ' + describe(v) + ')');
    if (!isFinite(v)) throw new RangeError('runSupplyPlanningLine: ' + name + ' must be finite (got ' + v + ')');
    if (v < 0) throw new RangeError('runSupplyPlanningLine: ' + name + ' must be non-negative (got ' + v + ')');
    return v;
  }

  // A candidate value violates scope ONLY when it is PRESENT and differs from the declared scope value. A blank/
  // missing candidate value is NOT a scope mismatch — it flows to B4-R6 as a REVIEW row (never silently dropped).
  function scopeConflict(candVal, scopeVal, exact) {
    if (isBlank(candVal)) return false;
    return exact ? (String(candVal).trim() !== String(scopeVal).trim()) : (normToken(candVal) !== normToken(scopeVal));
  }

  /**
   * runSupplyPlanningLine(input) → one fresh, traceable Supply-Planning Line result. Orchestrates, in order:
   * validate → scope-consistency gate → evaluateQualifiedIncoming → wire qualifiedIncomingQuantity → calculateGap.
   * Consumes already-built B4-R4 / B4-R5 adapter results and four caller-supplied numeric quantities; reads no source.
   */
  function runSupplyPlanningLine(input) {
    if (typeof evaluateQualifiedIncoming !== 'function' || typeof calculateGap !== 'function') {
      throw new Error('runSupplyPlanningLine: required dependencies (evaluateQualifiedIncoming, calculateGap) are not available');
    }

    // 1. Structural validation of input + lineScope.
    requireObject(input, 'input');
    var lineScope = requireObject(input.lineScope, 'input.lineScope');
    var scCompany = requireNonBlankString(lineScope.company, 'input.lineScope.company');
    var scSku = requireNonBlankString(lineScope.sku, 'input.lineScope.sku');
    var scDest = requireNonBlankString(lineScope.destinationWarehouseId, 'input.lineScope.destinationWarehouseId');
    var scCountry = optStr(lineScope.country);
    var scMarketplace = optStr(lineScope.marketplace);

    var demand = requireQty(input.demand, 'input.demand');
    var destinationCurrentStock = requireQty(input.destinationCurrentStock, 'input.destinationCurrentStock');
    var timelyApprovedCommittedSupply = requireQty(input.timelyApprovedCommittedSupply, 'input.timelyApprovedCommittedSupply');

    var kmShipmentResults = requireArray(input.kmShipmentResults, 'input.kmShipmentResults');
    var externalAuthorityResults = input.externalAuthorityResults === undefined || input.externalAuthorityResults === null
      ? [] : requireArray(input.externalAuthorityResults, 'input.externalAuthorityResults');
    var postedToCurrentStockLineageKeys = input.postedToCurrentStockLineageKeys === undefined || input.postedToCurrentStockLineageKeys === null
      ? [] : requireArray(input.postedToCurrentStockLineageKeys, 'input.postedToCurrentStockLineageKeys');
    var activeOtherBucketLineageKeys = input.activeOtherBucketLineageKeys === undefined || input.activeOtherBucketLineageKeys === null
      ? [] : requireArray(input.activeOtherBucketLineageKeys, 'input.activeOtherBucketLineageKeys');

    // 2. Scope-consistency gate — every KM candidate must be compatible with the declared line (fail closed on a
    // real mismatch; a mismatched candidate is NEVER silently dropped, and companies/SKUs/destinations never merge).
    kmShipmentResults.forEach(function (r, i) {
      requireObject(r, 'input.kmShipmentResults[' + i + ']');
      var c = requireObject(r.candidate, 'input.kmShipmentResults[' + i + '].candidate');
      if (scopeConflict(c.company, scCompany, false)) throw new RangeError('runSupplyPlanningLine: kmShipmentResults[' + i + '] company out of line scope (dimension=company)');
      if (scopeConflict(c.sku, scSku, false)) throw new RangeError('runSupplyPlanningLine: kmShipmentResults[' + i + '] sku out of line scope (dimension=sku)');
      if (scopeConflict(c.destinationWarehouseId, scDest, true)) throw new RangeError('runSupplyPlanningLine: kmShipmentResults[' + i + '] destinationWarehouseId out of line scope (dimension=destinationWarehouseId)');
      if (scCountry !== null && scopeConflict(c.country, scCountry, false)) throw new RangeError('runSupplyPlanningLine: kmShipmentResults[' + i + '] country out of line scope (dimension=country)');
      if (scMarketplace !== null && scopeConflict(c.marketplace, scMarketplace, false)) throw new RangeError('runSupplyPlanningLine: kmShipmentResults[' + i + '] marketplace out of line scope (dimension=marketplace)');
    });

    // 3. Qualified Incoming engine (B4-R6) — the sole owner of the ten gates, dedup, Required-By, external zero.
    var qualifiedIncomingResult = evaluateQualifiedIncoming({
      requiredByDate: input.requiredByDate,
      kmShipmentResults: kmShipmentResults,
      externalAuthorityResults: externalAuthorityResults,
      postedToCurrentStockLineageKeys: postedToCurrentStockLineageKeys,
      activeOtherBucketLineageKeys: activeOtherBucketLineageKeys
    });

    // 4. Extract ONLY the timely qualified quantity (never Late/Review/Excluded/external observed).
    var timelyQualifiedIncoming = qualifiedIncomingResult.qualifiedIncomingQuantity;

    // 5. Existing canonical gap — each supply term deducted EXACTLY ONCE, floored at 0 (formula owned upstream).
    var calculatedGap = calculateGap({
      demand: demand,
      destinationCurrentStock: destinationCurrentStock,
      timelyQualifiedIncoming: timelyQualifiedIncoming,
      timelyApprovedCommittedSupply: timelyApprovedCommittedSupply
    });

    // 6. One fresh, isolated, traceable line result. The full B4-R6 trace (candidateResults / gateResults / reasons /
    // externalResults) is returned unchanged for downstream visibility; the breakdown/summary are fresh projections.
    return {
      runtimeType: 'SUPPLY_PLANNING_LINE',
      lineScope: { company: scCompany, sku: scSku, destinationWarehouseId: scDest, country: scCountry, marketplace: scMarketplace },
      requiredByDate: qualifiedIncomingResult.requiredByDate,
      demand: demand,
      destinationCurrentStock: destinationCurrentStock,
      timelyApprovedCommittedSupply: timelyApprovedCommittedSupply,
      timelyQualifiedIncoming: timelyQualifiedIncoming,
      calculatedGap: calculatedGap,
      qualifiedIncomingResult: qualifiedIncomingResult, // full fresh B4-R6 trace (not mutated, not reclassified)
      incomingBreakdown: {
        timelyQualifiedIncoming: timelyQualifiedIncoming,
        lateRiskQuantity: qualifiedIncomingResult.lateRiskQuantity,
        excludedIncomingQuantity: qualifiedIncomingResult.excludedIncomingQuantity,
        reviewIncomingQuantity: qualifiedIncomingResult.reviewIncomingQuantity,
        externalObservedQuantity: qualifiedIncomingResult.externalObservedQuantity
      },
      sourceSummary: {
        kmCandidateCount: qualifiedIncomingResult.kmCandidateCount,
        deduplicatedKmCandidateCount: qualifiedIncomingResult.deduplicatedKmCandidateCount,
        externalObservationCount: qualifiedIncomingResult.externalObservationCount,
        linkedExternalEvidenceCount: qualifiedIncomingResult.linkedExternalEvidenceCount,
        quarantinedExternalCount: qualifiedIncomingResult.quarantinedExternalCount,
        adoptedExternalCount: qualifiedIncomingResult.adoptedExternalCount,
        adoptionPendingCount: qualifiedIncomingResult.adoptionPendingCount
      }
    };
  }

  return { runSupplyPlanningLine: runSupplyPlanningLine };
});
  __kmRegister("supply-planning-line-runtime", module.exports);
})();

// ----- module: supply-planning-incoming-adapters (verbatim from assets/js/core/supply-planning-incoming-adapters.js) -----
(function () {
  var require = __kmRequire;
  var module = { exports: {} };
  var exports = module.exports;
// Kitchen Mama Operation System — KM Shipment Incoming Adapter (B-4 Minimal Runtime, batch B4-R4).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC adapter. Consumes ONE normalized B4-R3 KM Shipment Supply Candidate + a planning scope,
// and produces ONE source-level Shipment Incoming Adapter result. It answers only SOURCE-LEVEL eligibility:
// canonical Shipment status allowlist, scope match, positive quantityRemaining, destination presence and ETA
// presence — plus deterministic source-level exclusion / review reasons and the quantity allowed to PROCEED to
// B4-R6. It is NOT final Qualified Incoming: no Required-By/ETA-late comparison, no cross-source dedup, no
// ownership precedence, no calculateGap, no persistence. No Sheet/DB/API/UI, no clock, no locale, no mutation.

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') {
    window.KM = window.KM || {};
    window.KM.incomingAdapters = api;
  }
})(this, function () {
  'use strict';

  var ELIGIBLE_STATUSES = { ready_to_ship: 1, shipped: 1, in_transit: 1, arrived: 1 };

  // Deterministic canonical ordering for reason arrays (output is always emitted in this order, unique).
  var EXCLUSION_ORDER = [
    'AUTHORITY_NOT_SUPPORTED', 'SOURCE_TYPE_NOT_SUPPORTED', 'DOMAIN_NOT_SUPPORTED',
    'STATUS_NOT_ELIGIBLE',
    'COMPANY_SCOPE_MISMATCH', 'SKU_SCOPE_MISMATCH', 'DESTINATION_SCOPE_MISMATCH',
    'COUNTRY_SCOPE_MISMATCH', 'MARKETPLACE_SCOPE_MISMATCH',
    'ZERO_REMAINING_QUANTITY', 'INVALID_REMAINING_QUANTITY'
  ];
  var REVIEW_ORDER = ['MISSING_STATUS', 'UNKNOWN_STATUS', 'MISSING_COMPANY', 'MISSING_DESTINATION_IDENTITY', 'MISSING_ETA'];

  var DEFINITE_EXCLUDED_STATUS = {
    EXCLUDED_DRAFT: 1, EXCLUDED_ALREADY_RECEIVED: 1, EXCLUDED_TERMINAL: 1, EXCLUDED_CANCELLED: 1,
    EXCLUDED_LEGACY_STATUS: 1, EXCLUDED_OPERATIONAL_ALERT: 1, EXCLUDED_EVENT_TOKEN: 1
  };

  function describe(v) { return v === null ? 'null' : (Array.isArray(v) ? 'array' : typeof v); }
  function isBlank(v) { return v === '' || v === null || v === undefined || (typeof v === 'string' && v.trim() === ''); }
  function optStr(v) { if (v === null || v === undefined) return null; var s = String(v).trim(); return s === '' ? null : s; }
  function normToken(v) { return String(v === null || v === undefined ? '' : v).trim().toLowerCase(); }

  function requireObject(v, name) {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) {
      throw new TypeError('adaptKmShipmentIncomingCandidate: ' + name + ' must be a non-null, non-array object (got ' + describe(v) + ')');
    }
    return v;
  }
  // Non-string → TypeError; missing/blank → RangeError.
  function requireStringField(v, name) {
    if (v === null || v === undefined) throw new RangeError('adaptKmShipmentIncomingCandidate: ' + name + ' is required (got ' + describe(v) + ')');
    if (typeof v !== 'string') throw new TypeError('adaptKmShipmentIncomingCandidate: ' + name + ' must be a string (got ' + describe(v) + ')');
    var t = v.trim();
    if (t === '') throw new RangeError('adaptKmShipmentIncomingCandidate: ' + name + ' must be a non-empty string');
    return t;
  }

  // Status is normalized (trim + lowercase) FOR COMPARISON ONLY; the raw candidate status is never mutated.
  function classifyStatus(raw) {
    if (raw === null || raw === undefined) return 'MISSING_STATUS';
    var s = String(raw).trim().toLowerCase();
    if (s === '') return 'MISSING_STATUS';
    if (ELIGIBLE_STATUSES[s]) return 'ELIGIBLE_INCOMING_STATUS';
    if (s === 'draft') return 'EXCLUDED_DRAFT';
    if (s === 'received') return 'EXCLUDED_ALREADY_RECEIVED';
    if (s === 'closed') return 'EXCLUDED_TERMINAL';
    if (s === 'cancelled' || s === 'canceled') return 'EXCLUDED_CANCELLED';
    if (s === 'planned' || s === 'completed' || s === 'partial_received') return 'EXCLUDED_LEGACY_STATUS';
    if (s === 'stuck') return 'EXCLUDED_OPERATIONAL_ALERT';
    if (s === 'delivered') return 'EXCLUDED_EVENT_TOKEN';
    return 'UNKNOWN_STATUS';
  }

  function orderUnique(order, set) {
    var out = [];
    for (var i = 0; i < order.length; i++) { if (set[order[i]]) out.push(order[i]); }
    return out;
  }

  /**
   * adaptKmShipmentIncomingCandidate({ candidate, scope }) → one fresh source-level Shipment Incoming result.
   * candidate = output of buildKmShipmentSupplyCandidate(...). scope = { company, sku, destinationWarehouseId,
   * country?, marketplace? }. Throws TypeError/RangeError on structural violations; wrong authority/source/domain
   * fail CLOSED via a deterministic exclusion result (not a throw) when the candidate is structurally valid.
   */
  function adaptKmShipmentIncomingCandidate(input) {
    requireObject(input, 'input');
    var candidate = requireObject(input.candidate, 'input.candidate');
    var scope = requireObject(input.scope, 'input.scope');

    // Structural candidate identity (malformed candidate → throw).
    requireStringField(candidate.supplyCandidateId, 'input.candidate.supplyCandidateId');
    requireStringField(candidate.sourceLineRef, 'input.candidate.sourceLineRef');

    // Required scope (blank → RangeError; non-string → TypeError).
    var scCompany = requireStringField(scope.company, 'input.scope.company');
    var scSku = requireStringField(scope.sku, 'input.scope.sku');
    var scDest = requireStringField(scope.destinationWarehouseId, 'input.scope.destinationWarehouseId');
    var scCountry = optStr(scope.country);
    var scMarketplace = optStr(scope.marketplace);

    var exSet = {}, rvSet = {};
    function excl(t) { exSet[t] = 1; }
    function review(t) { rvSet[t] = 1; }

    // Authority / source / domain — fail closed via deterministic exclusion (preferred split, §9).
    var authorityOk = candidate.authorityType === 'KM_CANONICAL';
    var sourceOk = candidate.sourceType === 'KM_SHIPMENT_LINE';
    var domainOk = candidate.supplyDomain === 'KM_3PL_OVERSEAS';
    if (!authorityOk) excl('AUTHORITY_NOT_SUPPORTED');
    if (!sourceOk) excl('SOURCE_TYPE_NOT_SUPPORTED');
    if (!domainOk) excl('DOMAIN_NOT_SUPPORTED');
    var typeAccepted = authorityOk && sourceOk && domainOk;

    // Status (allowlist owner: statusClass).
    var statusClass = classifyStatus(candidate.status);
    var statusEligible = statusClass === 'ELIGIBLE_INCOMING_STATUS';
    if (DEFINITE_EXCLUDED_STATUS[statusClass]) excl('STATUS_NOT_ELIGIBLE');
    if (statusClass === 'MISSING_STATUS') review('MISSING_STATUS');
    if (statusClass === 'UNKNOWN_STATUS') review('UNKNOWN_STATUS');

    // Scope matching (company/sku/country/marketplace case-insensitive; destination exact trimmed id).
    var scopeEligible = true;
    if (candidate.company === null || candidate.company === undefined) { review('MISSING_COMPANY'); scopeEligible = false; }
    else if (normToken(candidate.company) !== normToken(scCompany)) { excl('COMPANY_SCOPE_MISMATCH'); scopeEligible = false; }

    if (normToken(candidate.sku) !== normToken(scSku)) { excl('SKU_SCOPE_MISMATCH'); scopeEligible = false; }

    if (isBlank(candidate.destinationWarehouseId) || candidate.destinationIdentitySource === 'MISSING') { review('MISSING_DESTINATION_IDENTITY'); scopeEligible = false; }
    else if (String(candidate.destinationWarehouseId).trim() !== scDest) { excl('DESTINATION_SCOPE_MISMATCH'); scopeEligible = false; }

    if (scCountry !== null) {
      if (candidate.country === null || candidate.country === undefined || normToken(candidate.country) !== normToken(scCountry)) { excl('COUNTRY_SCOPE_MISMATCH'); scopeEligible = false; }
    }
    if (scMarketplace !== null) {
      if (candidate.marketplace === null || candidate.marketplace === undefined || normToken(candidate.marketplace) !== normToken(scMarketplace)) { excl('MARKETPLACE_SCOPE_MISMATCH'); scopeEligible = false; }
    }

    // Quantity — consume candidate.quantityRemaining ONLY (never recompute from raw qty).
    var qty = candidate.quantityRemaining;
    var quantityEligible = false;
    if (typeof qty !== 'number' || !isFinite(qty)) excl('INVALID_REMAINING_QUANTITY');
    else if (qty > 0) quantityEligible = true;
    else if (qty === 0) excl('ZERO_REMAINING_QUANTITY');
    else excl('INVALID_REMAINING_QUANTITY'); // negative

    // ETA — presence only (never parsed, never compared to Required-By).
    var etaPresent = !isBlank(candidate.eta);
    if (!etaPresent) review('MISSING_ETA');

    var sourceEligible = typeAccepted && statusEligible && scopeEligible && quantityEligible && etaPresent;
    var adapterEligibleQuantity = sourceEligible ? qty : 0;

    return {
      // Fresh isolated snapshot of the normalized B4-R3 source candidate (does NOT expose the input candidate ref).
      // Downstream (B4-R6) needs the actual source metadata (ETA value, scope, sourceUpdatedAt, destination source,
      // PO/Plan lineage) without rereading the original candidate or source rows. All values are copied VERBATIM as
      // normalized by B4-R3 — no parse, no clock, no locale, no freshness/Required-By evaluation here.
      candidate: {
        supplyCandidateId: candidate.supplyCandidateId,
        sourceRef: candidate.sourceRef,
        sourceLineRef: candidate.sourceLineRef,
        lineageKey: candidate.lineageKey,
        linkedShipmentId: candidate.linkedShipmentId,
        linkedShipmentLineId: candidate.linkedShipmentLineId,
        linkedPurchaseOrderLineId: candidate.linkedPurchaseOrderLineId,
        linkedShippingPlanLineId: candidate.linkedShippingPlanLineId,
        company: candidate.company,
        country: candidate.country,
        marketplace: candidate.marketplace,
        sku: candidate.sku,
        siteSku: candidate.siteSku,
        status: candidate.status, // raw status retained unchanged
        eta: candidate.eta, // actual normalized ETA value preserved (presence is reported separately as etaPresent)
        sourceUpdatedAt: candidate.sourceUpdatedAt, // preserved, NOT evaluated for freshness
        destinationWarehouseId: candidate.destinationWarehouseId,
        destinationIdentitySource: candidate.destinationIdentitySource, // owned by B4-R3; not re-inferred here
        quantityRemaining: candidate.quantityRemaining,
        authorityType: candidate.authorityType,
        sourceType: candidate.sourceType,
        supplyDomain: candidate.supplyDomain
      },
      adapterType: 'KM_SHIPMENT_INCOMING',
      sourceEligible: sourceEligible,
      statusEligible: statusEligible,
      scopeEligible: scopeEligible,
      quantityEligible: quantityEligible,
      etaPresent: etaPresent,
      adapterEligibleQuantity: adapterEligibleQuantity, // proceeds to B4-R6; NOT final Qualified Incoming
      statusClass: statusClass,
      exclusionReasons: orderUnique(EXCLUSION_ORDER, exSet),
      reviewReasons: orderUnique(REVIEW_ORDER, rvSet)
    };
  }

  return { adaptKmShipmentIncomingCandidate: adaptKmShipmentIncomingCandidate };
});
  __kmRegister("supply-planning-incoming-adapters", module.exports);
})();

// ----- module: supply-planning-external-incoming-adapters (verbatim from assets/js/core/supply-planning-external-incoming-adapters.js) -----
(function () {
  var require = __kmRequire;
  var module = { exports: {} };
  var exports = module.exports;
// Kitchen Mama Operation System — External Incoming Authority Fail-Closed Adapter (B-4 Minimal Runtime, batch B4-R5).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC adapter. Consumes ONE normalized external incoming observation (3PL / OMS / WMS inbound)
// and returns ONE deterministic fail-closed authority classification. It answers only: stable external identity,
// external authority/admission state, KM linkage presence, quarantine/pending/rejected/ignored/superseded/reversed
// classification, deterministic exclusion/review reasons, the external quantity still visible for audit, and the
// planning quantity allowed to proceed.
//
// AUTHORITY CONTRACT (SUPPLY_PLANNING_CALCULATION_RULES.md §38 · SUPPLY_CHAIN_SYSTEM_FLOW.md §12): the KM Operation
// System is the sole internal planning authority. An external record NEVER contributes to planning independently —
// not because it is fresh, complete, known-SKU, known-warehouse, positive-qty, has-ETA, in a valid external status,
// or has a stable external id. For EVERY external record: planningEligible = false and adapterEligibleQuantity = 0.
// Linked external records are execution evidence only (the KM Shipment stays the sole Incoming owner). Adopted rows
// still contribute 0 directly — only the resulting KM canonical Shipment/Operation may enter planning (count-once).
//
// This adapter CLASSIFIES ONLY. It performs no Link/Adopt/Reject/Ignore write, no KM Shipment/Operation creation,
// no notification, no ingestion, no reconciliation update, no state transition, no dedup, no ownership precedence,
// no Required-By/ETA-late comparison, no final Qualified Incoming, no calculateGap, no persistence. No Sheet/DB/API/
// UI, no clock, no locale, no mutation. It does NOT accept a KM Shipment candidate (KM_SHIPMENT_LINE fails closed).

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') {
    window.KM = window.KM || {};
    window.KM.externalIncomingAdapters = api;
  }
})(this, function () {
  'use strict';

  // Accepted external inbound source types (this B-4 Incoming adapter — NOT outbound, NOT platform/FBA, NOT KM).
  var SUPPORTED_SOURCE_TYPES = { EXTERNAL_INBOUND_RECORD: 1, EXTERNAL_WMS_INBOUND: 1, EXTERNAL_OMS_INBOUND: 1 };
  var SUPPORTED_DOMAIN = 'EXTERNAL_3PL_OVERSEAS';

  // Normalized authority/admission state → { cls: deterministic stateClass, excl: state-specific exclusion reason }.
  var STATE_MAP = {
    LINKED_EXTERNAL_EVIDENCE:      { cls: 'LINKED_EVIDENCE_ONLY',             excl: 'LINKED_EXTERNAL_EVIDENCE_ONLY' },
    EXTERNAL_UNLINKED_QUARANTINED: { cls: 'QUARANTINED_UNLINKED',            excl: 'EXTERNAL_UNLINKED_QUARANTINED' },
    ADOPTION_PENDING:              { cls: 'ADOPTION_REVIEW_PENDING',         excl: 'ADOPTION_PENDING' },
    ADOPTED_TO_KM:                 { cls: 'ADOPTED_USE_KM_CANONICAL_RECORD', excl: 'ADOPTED_USE_KM_CANONICAL_RECORD' },
    REJECTED_EXTERNAL_RECORD:      { cls: 'REJECTED',                        excl: 'REJECTED_EXTERNAL_RECORD' },
    IGNORED_FOR_PLANNING:          { cls: 'IGNORED',                         excl: 'IGNORED_FOR_PLANNING' },
    SUPERSEDED:                    { cls: 'SUPERSEDED',                      excl: 'SUPERSEDED_EXTERNAL_RECORD' },
    REVERSED:                      { cls: 'REVERSED',                        excl: 'REVERSED_EXTERNAL_RECORD' }
  };

  // Deterministic canonical ordering for reason arrays (output is always emitted in this order, unique).
  var EXCLUSION_ORDER = [
    'EXTERNAL_RECORD_NOT_PLANNING_AUTHORITY',
    'SOURCE_TYPE_NOT_SUPPORTED', 'DOMAIN_NOT_SUPPORTED',
    'LINKED_EXTERNAL_EVIDENCE_ONLY', 'EXTERNAL_UNLINKED_QUARANTINED', 'ADOPTION_PENDING',
    'ADOPTED_USE_KM_CANONICAL_RECORD', 'REJECTED_EXTERNAL_RECORD', 'IGNORED_FOR_PLANNING',
    'SUPERSEDED_EXTERNAL_RECORD', 'REVERSED_EXTERNAL_RECORD'
  ];
  var REVIEW_ORDER = [
    'EXTERNAL_IDENTITY_INCOMPLETE', 'MISSING_AUTHORITY_STATE', 'UNKNOWN_AUTHORITY_STATE',
    'LINKAGE_MISSING', 'ADOPTED_KM_LINK_MISSING', 'QUARANTINE_LINKAGE_CONFLICT',
    'INVALID_EXTERNAL_QUANTITY', 'MISSING_EXTERNAL_ETA', 'MISSING_EXTERNAL_SOURCE_TIMESTAMP',
    'NEEDS_RECONCILIATION'
  ];

  // Input reconciliation/review tokens that legitimately request reconciliation (NEEDS_RECONCILIATION review reason).
  var NEEDS_RECON_TOKENS = { needs_reconciliation: 1, discrepancy: 1, mismatch: 1, reconcile: 1 };

  function describe(v) { return v === null ? 'null' : (Array.isArray(v) ? 'array' : typeof v); }
  function isBlank(v) { return v === '' || v === null || v === undefined || (typeof v === 'string' && v.trim() === ''); }
  function normToken(v) { return String(v === null || v === undefined ? '' : v).trim().toLowerCase(); }

  function requireObject(v, name) {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) {
      throw new TypeError('adaptExternalIncomingAuthority: ' + name + ' must be a non-null, non-array object (got ' + describe(v) + ')');
    }
    return v;
  }
  // Minimal cross-adapter anchor: SKU. Non-string → TypeError; missing/blank → RangeError.
  function requireStringField(v, name) {
    if (v === null || v === undefined) throw new RangeError('adaptExternalIncomingAuthority: ' + name + ' is required (got ' + describe(v) + ')');
    if (typeof v !== 'string') throw new TypeError('adaptExternalIncomingAuthority: ' + name + ' must be a string (got ' + describe(v) + ')');
    var t = v.trim();
    if (t === '') throw new RangeError('adaptExternalIncomingAuthority: ' + name + ' must be a non-empty string');
    return t;
  }

  // Authority state normalized by trim ONLY (canonical enum tokens are UPPERCASE; never lowercased or defaulted).
  function classifyAuthorityState(raw) {
    if (raw === null || raw === undefined) return { cls: 'MISSING_AUTHORITY_STATE', excl: null, known: false, missing: true };
    var s = String(raw).trim();
    if (s === '') return { cls: 'MISSING_AUTHORITY_STATE', excl: null, known: false, missing: true };
    if (STATE_MAP[s]) return { cls: STATE_MAP[s].cls, excl: STATE_MAP[s].excl, known: true, missing: false };
    return { cls: 'UNKNOWN_AUTHORITY_STATE', excl: null, known: false, missing: false };
  }

  function orderUnique(order, set) {
    var out = [];
    for (var i = 0; i < order.length; i++) { if (set[order[i]]) out.push(order[i]); }
    return out;
  }

  /**
   * adaptExternalIncomingAuthority({ candidate }) → one fresh, deterministic, fail-closed external authority result.
   * candidate = one normalized external incoming observation (supplied by a future external-source adapter/fixture;
   * B4-R5 does NOT implement the importer/source-row mapper). Structural input/candidate shape and a blank/non-string
   * SKU anchor throw TypeError/RangeError; every OTHER external defect (incomplete identity, missing/unknown authority,
   * unsupported source/domain, linkage defects, invalid quantity) fails CLOSED via deterministic classification — the
   * external record stays visible and auditable, never disappears. planningEligible is ALWAYS false;
   * adapterEligibleQuantity is ALWAYS 0.
   */
  function adaptExternalIncomingAuthority(input) {
    requireObject(input, 'input');
    var candidate = requireObject(input.candidate, 'input.candidate');

    // Minimal structural anchor (blank/non-string → throw). Everything external-specific below fails closed instead.
    requireStringField(candidate.sku, 'input.candidate.sku');

    var exSet = {}, rvSet = {};
    function excl(t) { exSet[t] = 1; }
    function review(t) { rvSet[t] = 1; }

    // Every structurally accepted external record is, by contract, NEVER a planning authority.
    excl('EXTERNAL_RECORD_NOT_PLANNING_AUTHORITY');

    // Source type + domain boundary (unsupported / outbound / platform-FBA / KM_SHIPMENT_LINE → fail closed).
    if (!SUPPORTED_SOURCE_TYPES[candidate.sourceType]) excl('SOURCE_TYPE_NOT_SUPPORTED');
    if (candidate.supplyDomain !== SUPPORTED_DOMAIN) excl('DOMAIN_NOT_SUPPORTED');

    // Stable external identity completeness (identity is NEVER minted from SKU+ETA/qty/label/address/row/timestamp).
    var identityIncomplete =
      isBlank(candidate.externalCandidateId) || isBlank(candidate.provider) ||
      isBlank(candidate.externalAccountRef) || isBlank(candidate.externalOperationRef) ||
      isBlank(candidate.externalLineRef);
    if (identityIncomplete) review('EXTERNAL_IDENTITY_INCOMPLETE');

    // Authority/admission state classification (missing/unknown fail closed; no default to linked/adopted/admitted).
    var st = classifyAuthorityState(candidate.authorityState);
    var stateClass = st.cls;
    if (st.excl) excl(st.excl);
    if (st.missing) review('MISSING_AUTHORITY_STATE');
    else if (!st.known) review('UNKNOWN_AUTHORITY_STATE');

    // Linkage presence (stable KM linkage only; the adapter performs NO state transition).
    var hasShipmentLink = !isBlank(candidate.linkedShipmentId);
    var hasOperationLink = !isBlank(candidate.linkedOperationId);
    var hasAnyLink = hasShipmentLink || hasOperationLink;
    if (stateClass === 'LINKED_EVIDENCE_ONLY' && !hasAnyLink) review('LINKAGE_MISSING');
    if (stateClass === 'ADOPTED_USE_KM_CANONICAL_RECORD' && !hasAnyLink) review('ADOPTED_KM_LINK_MISSING');
    if (stateClass === 'QUARANTINED_UNLINKED' && hasAnyLink) review('QUARANTINE_LINKAGE_CONFLICT');

    // Observed quantity — audit projection ONLY (never planning-eligible, never coerced from a string).
    var rawQty = candidate.quantityObserved;
    var observedQuantity = 0;
    if (rawQty === null || rawQty === undefined) {
      // absent — no positive planning effect, not flagged invalid
    } else if (typeof rawQty === 'number' && isFinite(rawQty) && rawQty >= 0) {
      observedQuantity = rawQty;
    } else {
      review('INVALID_EXTERNAL_QUANTITY'); // negative / NaN / Infinity / string / other non-number
    }

    // ETA / source timestamp — preserved only; NEVER parsed, compared to Required-By, or freshness-evaluated.
    if (isBlank(candidate.eta)) review('MISSING_EXTERNAL_ETA');
    if (isBlank(candidate.sourceUpdatedAt)) review('MISSING_EXTERNAL_SOURCE_TIMESTAMP');

    // Reconciliation — only when the input reconciliation/review state legitimately requests it.
    if (NEEDS_RECON_TOKENS[normToken(candidate.reconciliationState)] || NEEDS_RECON_TOKENS[normToken(candidate.reviewStatus)]) {
      review('NEEDS_RECONCILIATION');
    }

    var linkedEvidence = stateClass === 'LINKED_EVIDENCE_ONLY';
    var quarantined = stateClass === 'QUARANTINED_UNLINKED';
    var adoptedToKm = stateClass === 'ADOPTED_USE_KM_CANONICAL_RECORD';

    var reviewReasons = orderUnique(REVIEW_ORDER, rvSet);
    // Human review: any review reason, OR an inherently unresolved state (quarantine / adoption-pending / missing /
    // unknown authority). A clean linked-evidence / decided / adopted row with no defect needs no review — but even
    // then it stays planning-ineligible with quantity 0.
    var requiresHumanReview = reviewReasons.length > 0 ||
      stateClass === 'QUARANTINED_UNLINKED' || stateClass === 'ADOPTION_REVIEW_PENDING' ||
      stateClass === 'MISSING_AUTHORITY_STATE' || stateClass === 'UNKNOWN_AUTHORITY_STATE';

    return {
      // Fresh isolated snapshot of the normalized external observation (does NOT expose the input candidate ref).
      // Values are preserved VERBATIM as normalized upstream — no parse, no clock, no locale, no coercion here.
      candidate: {
        externalCandidateId: candidate.externalCandidateId,
        sourceType: candidate.sourceType,
        supplyDomain: candidate.supplyDomain,
        authorityState: candidate.authorityState,
        provider: candidate.provider,
        externalAccountRef: candidate.externalAccountRef,
        externalOperationRef: candidate.externalOperationRef,
        externalLineRef: candidate.externalLineRef,
        company: candidate.company,
        country: candidate.country,
        marketplace: candidate.marketplace,
        sku: candidate.sku,
        siteSku: candidate.siteSku,
        destinationWarehouseId: candidate.destinationWarehouseId,
        quantityObserved: candidate.quantityObserved, // raw observed value retained unchanged (audit)
        eta: candidate.eta,
        sourceUpdatedAt: candidate.sourceUpdatedAt,
        linkedShipmentId: candidate.linkedShipmentId,
        linkedShipmentLineId: candidate.linkedShipmentLineId,
        linkedOperationId: candidate.linkedOperationId,
        reviewStatus: candidate.reviewStatus,
        reconciliationState: candidate.reconciliationState
      },
      adapterType: 'EXTERNAL_INCOMING_AUTHORITY',
      planningEligible: false,          // INVARIANT — an external record is never independently planning-eligible
      adapterEligibleQuantity: 0,       // INVARIANT — external planning contribution is always 0
      observedQuantity: observedQuantity, // audit-visible only; never a planning quantity
      stateClass: stateClass,
      linkedEvidence: linkedEvidence,
      quarantined: quarantined,
      adoptedToKm: adoptedToKm,
      requiresHumanReview: requiresHumanReview,
      exclusionReasons: orderUnique(EXCLUSION_ORDER, exSet),
      reviewReasons: reviewReasons
    };
  }

  return { adaptExternalIncomingAuthority: adaptExternalIncomingAuthority };
});
  __kmRegister("supply-planning-external-incoming-adapters", module.exports);
})();

// ----- module: supply-planning-supply-candidates (verbatim from assets/js/core/supply-planning-supply-candidates.js) -----
(function () {
  var require = __kmRequire;
  var module = { exports: {} };
  var exports = module.exports;
// Kitchen Mama Operation System — Normalized KM Shipment Supply Candidate (B-4 Minimal Runtime, batch B4-R3).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC builder. Given ONE KM Shipment header + ONE Shipment line, it produces one normalized
// Runtime input object ("supply candidate"). It is NOT Qualified Incoming, NOT a persisted Supply Ledger row,
// NOT a recommendation, NOT a planning-admission decision, NOT a deduplicated result, NOT a status-qualified
// result, and NOT an inventory balance. It performs only: strict input validation, canonical source
// normalization, deterministic identity construction, quantity normalization (B4-R1 semantics), destination
// normalization (B4-R2 semantics), source/lineage metadata, KM-canonical authority classification, and
// source-completeness review flags. No Sheet/DB/API/UI access, no clock, no locale, no mutation, no persistence.
// Qualification, status allowlist, ETA/Required-By, dedup, and calculateGap integration are LATER batches.

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') {
    window.KM = window.KM || {};
    window.KM.supplyCandidates = api;
  }
})(this, function () {
  'use strict';

  function describe(v) { return v === null ? 'null' : (Array.isArray(v) ? 'array' : typeof v); }

  function isBlank(v) {
    return v === '' || v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
  }

  // Optional string: null/undefined/blank/whitespace → null; otherwise trimmed string (case preserved, no parse).
  function optStr(v) {
    if (v === null || v === undefined) return null;
    var s = String(v).trim();
    return s === '' ? null : s;
  }

  // Required stable-identity field: non-string → TypeError; missing/blank → RangeError (cannot mint a stable id).
  // Trimmed to match the canonical source normalization (procSrcNorm_ = String(v).trim()); NEVER lowercased.
  function requireIdField(v, name) {
    if (v === null || v === undefined) {
      throw new RangeError('buildKmShipmentSupplyCandidate: ' + name + ' is required (got ' + describe(v) + ')');
    }
    if (typeof v !== 'string') {
      throw new TypeError('buildKmShipmentSupplyCandidate: ' + name + ' must be a string (got ' + describe(v) + ')');
    }
    var t = v.trim();
    if (t === '') {
      throw new RangeError('buildKmShipmentSupplyCandidate: ' + name + ' must be a non-empty string');
    }
    return t;
  }

  function requireObject(v, name) {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) {
      throw new TypeError('buildKmShipmentSupplyCandidate: ' + name + ' must be a non-null, non-array object (got ' + describe(v) + ')');
    }
    return v;
  }

  // B4-R1 quantity semantics reproduced purely. Canonical shipmentQty is primary; legacy qty is fallback ONLY
  // when the canonical value is absent/blank. Canonical 0 is a valid zero. A present-but-malformed or negative
  // value resolves to 0 and is flagged invalid (never falls back, never summed). Returns { value: >=0, invalid }.
  function resolveQuantity(canon, legacy) {
    if (!isBlank(canon)) {
      var n = parseFloat(canon);
      if (isFinite(n) && n >= 0) return { value: n, invalid: false };
      return { value: 0, invalid: true };
    }
    if (!isBlank(legacy)) {
      var m = parseFloat(legacy);
      if (isFinite(m) && m >= 0) return { value: m, invalid: false };
      return { value: 0, invalid: true };
    }
    return { value: 0, invalid: false }; // both absent/blank → missing quantity source, not "invalid"
  }

  // B4-R2 destination semantics reproduced purely. Canonical destination_warehouse_id is primary; legacy
  // warehouse_id is fallback ONLY when canonical is absent/blank. warehouse_code / name / address / display text
  // and origin/source warehouse are NEVER identity (not passed in). String id "0" is preserved. Missing → null.
  function resolveDestination(canon, legacy) {
    if (!isBlank(canon)) return { id: String(canon).trim(), source: 'CANONICAL_DESTINATION_WAREHOUSE_ID' };
    if (!isBlank(legacy)) return { id: String(legacy).trim(), source: 'LEGACY_WAREHOUSE_ID_FALLBACK' };
    return { id: null, source: 'MISSING' };
  }

  /**
   * buildKmShipmentSupplyCandidate(input) → one fresh, immutable, normalized KM Shipment supply candidate.
   * input = { shipment: {...}, line: {...} } (one Shipment header + one Shipment line).
   * Throws TypeError for structural violations; RangeError when a stable identity cannot be minted.
   */
  function buildKmShipmentSupplyCandidate(input) {
    requireObject(input, 'input');
    var shipment = requireObject(input.shipment, 'input.shipment');
    var line = requireObject(input.line, 'input.line');

    // Stable identity fields (required).
    var shipmentId = requireIdField(shipment.shipmentId, 'input.shipment.shipmentId');
    var shipmentLineId = requireIdField(line.shipmentLineId, 'input.line.shipmentLineId');
    var sku = requireIdField(line.sku, 'input.line.sku');

    // Optional business/source fields (case preserved, not parsed, not clock-evaluated).
    var company = optStr(shipment.company);
    var country = optStr(shipment.country);
    var marketplace = optStr(shipment.marketplace);
    var eta = optStr(shipment.eta);
    var sourceUpdatedAt = optStr(shipment.sourceUpdatedAt);
    var status = optStr(shipment.status);
    var siteSku = optStr(line.siteSku);
    var purchaseOrderLineId = optStr(line.purchaseOrderLineId);
    var shippingPlanLineId = optStr(line.shippingPlanLineId);

    // Quantity (B4-R1) and destination (B4-R2).
    var q = resolveQuantity(line.shipmentQty, line.legacyQty);
    var dest = resolveDestination(shipment.destinationWarehouseId, shipment.legacyWarehouseId);

    // Deterministic stable identities — only from immutable shipment + line ids (NO status/eta/qty/label/date).
    var sourceRef = 'shipment:' + shipmentId;
    var sourceLineRef = 'shipment:' + shipmentId + ':' + shipmentLineId;
    var supplyCandidateId = sourceLineRef;
    var lineageKey = sourceLineRef;

    // Source-completeness review flags only (NOT business qualification). Fixed, deterministic order; unique.
    var reviewFlags = [];
    if (company === null) reviewFlags.push('MISSING_COMPANY');
    if (dest.source === 'MISSING') reviewFlags.push('MISSING_DESTINATION_IDENTITY');
    if (q.invalid) reviewFlags.push('INVALID_QUANTITY');
    if (eta === null) reviewFlags.push('MISSING_ETA');
    if (status === null) reviewFlags.push('MISSING_STATUS');

    return {
      supplyCandidateId: supplyCandidateId,
      supplyDomain: 'KM_3PL_OVERSEAS',
      supplyStage: 'FORMAL_SHIPMENT',
      authorityType: 'KM_CANONICAL',
      sourceType: 'KM_SHIPMENT_LINE',
      sourceRef: sourceRef,
      sourceLineRef: sourceLineRef,
      lineageKey: lineageKey,
      company: company,
      country: country,
      marketplace: marketplace,
      sku: sku,
      siteSku: siteSku,
      destinationWarehouseId: dest.id,
      destinationIdentitySource: dest.source,
      quantityOriginal: q.value,
      quantityRemaining: q.value, // B4-R3 does NOT subtract received/cancelled/allocated/consumed (later batches)
      eta: eta,
      sourceUpdatedAt: sourceUpdatedAt,
      status: status, // raw status preserved (trimmed); status interpretation is B4-R4
      linkedShipmentId: shipmentId,
      linkedShipmentLineId: shipmentLineId,
      linkedPurchaseOrderLineId: purchaseOrderLineId,
      linkedShippingPlanLineId: shippingPlanLineId,
      reviewFlags: reviewFlags
    };
  }

  return { buildKmShipmentSupplyCandidate: buildKmShipmentSupplyCandidate };
});
  __kmRegister("supply-planning-supply-candidates", module.exports);
})();

// ----- module: supply-planning-persistence (verbatim from assets/js/core/supply-planning-persistence.js) -----
(function () {
  var require = __kmRequire;
  var module = { exports: {} };
  var exports = module.exports;
// Kitchen Mama Operation System — Recommendation Persistence pure runtime (Phase 2C, Round 1B).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC implementation of the frozen Persistence / Orchestration contract in
// docs/planning/RECOMMENDATION_RUNTIME_IMPLEMENTATION_SPEC.md §Persist-Orch (FROZEN 2026-08-03) +
// SYSTEM_RUNTIME_ARCHITECTURE.md §7C. This round (1B) implements ONLY the persistence RUNTIME CORE:
//   • resolveActiveDraft        — PO-6 Active-Draft lookup (0→CREATE, 1→REUSE, >1→BLOCKED_CONFLICT)
//   • generateRecommendationDraft — PO-9 create/refresh/regenerate matrix + user-edit protection (PO-10)
//   • persistRecommendationDraft  — PO-12 logical write order, stage-by-stage, idempotent + resumable
//   • resumeRecommendationRun     — PO-15 resume a PARTIAL/RUNNING run from its last completed stage
//   • applyUserEdit               — records a user edit (planned_qty / order_qty) with explicit provenance
//   • createStore                 — an in-memory store { drafts, lines, runs }
//
// NOT in scope (contract PO-21 / Round 1B §12): NO Scheduler, NO Trigger, NO LockService, NO API, NO Apps
// Script, NO DB migration, NO Weekly-Plan promotion, NO Request writer (B-5), NO Submit, NO B-6/B-8.
//
// The orchestration is side-effect-controlled: every function CLONES its input store and returns a NEW
// store — the input is never mutated; a fresh result object every call; same input ⇒ identical output.
// Identities are DERIVED deterministically from the frozen natural keys (no clock, no Math.random, no
// uuid) so retry/resume are idempotent by construction: one `calculation_run_id` per (draft, version).

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') {
    window.KM = window.KM || {};
    window.KM.persistence = api;
  }
})(this, function () {
  'use strict';

  // ---- frozen enum tokens (contract PO-4 / PO-6 / PO-9) ---------------------
  var REC_TYPES = { WEEKLY_SHIPPING: 1, MONTHLY_ORDER: 1 };
  var MODES = { SCHEDULED_REFRESH: 1, MANUAL_REGENERATE: 1 };
  var ACTIVE_STATUSES = { draft: 1, site_confirmed: 1 }; // non-terminal, editable (PO-6)
  // Logical write order (PO-12) — each stage is atomic and idempotent; a run advances stage-by-stage.
  var STAGES = ['RUN_METADATA', 'HEADER', 'LINES', 'RECONCILE', 'LINEAGE', 'TOTALS', 'COMPLETED'];

  // ---- helpers --------------------------------------------------------------
  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function clone(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }
  function aType(cond, msg) { if (!cond) throw new TypeError(msg); }
  function aRange(cond, msg) { if (!cond) throw new RangeError(msg); }
  function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
  function stageIdx(name) { return STAGES.indexOf(name); }

  function sortedScope(scope) {
    var out = {}; Object.keys(scope).sort().forEach(function (k) { out[k] = scope[k]; }); return out;
  }
  function scopeKey(scope) {
    var s = sortedScope(scope);
    return Object.keys(s).map(function (k) { return k + '=' + String(s[k]); }).join('|');
  }
  function activeKeyOf(type, cycle, scope) { return type + '::' + cycle + '::' + scopeKey(scope); }
  function draftIdOf(activeKey) { return 'RD::' + activeKey; }
  function runIdOf(draftId, version) { return 'RUN::' + draftId + '::v' + version; }
  function lineIdOf(draftId, lineKey) { return 'RL::' + draftId + '::' + lineKey; }

  function findDraft(store, draftId) { for (var i = 0; i < store.drafts.length; i++) if (store.drafts[i].draftId === draftId) return store.drafts[i]; return null; }
  function findRun(store, runId) { for (var i = 0; i < store.runs.length; i++) if (store.runs[i].calculationRunId === runId) return store.runs[i]; return null; }
  function findLine(store, lineId) { for (var i = 0; i < store.lines.length; i++) if (store.lines[i].lineId === lineId) return store.lines[i]; return null; }
  function draftLines(store, draftId) { return store.lines.filter(function (l) { return l.draftId === draftId; }); }

  function normStore(store) {
    var s = clone(store) || {};
    s.drafts = s.drafts || []; s.lines = s.lines || []; s.runs = s.runs || [];
    return s;
  }
  function createStore() { return { drafts: [], lines: [], runs: [] }; }

  // ---- validation -----------------------------------------------------------
  function validateScopeQuery(q) {
    aType(isObj(q), 'query must be an object');
    aRange(REC_TYPES[q.recommendationType] === 1, 'unknown recommendationType (expect WEEKLY_SHIPPING | MONTHLY_ORDER)');
    aType(typeof q.planningCycle === 'string' && q.planningCycle.length > 0, 'planningCycle must be a non-empty string');
    aType(isObj(q.businessScope), 'businessScope must be an object');
  }
  function validateLines(lines) {
    aType(Array.isArray(lines), 'recommendedLines must be an array');
    lines.forEach(function (l, i) {
      aType(isObj(l), 'recommendedLines[' + i + '] must be an object');
      aType(typeof l.lineKey === 'string' && l.lineKey.length > 0, 'recommendedLines[' + i + '].lineKey must be a non-empty string');
      if (l.lineState === 'BLOCKED') {
        aType(typeof l.reason === 'string' && l.reason.length > 0, 'recommendedLines[' + i + '] BLOCKED requires a reason token');
      } else {
        aRange(l.lineState === undefined || l.lineState === 'OK', 'recommendedLines[' + i + '].lineState must be "OK" | "BLOCKED"');
        aType(typeof l.recommendedQty === 'number', 'recommendedLines[' + i + '].recommendedQty must be a number');
        aRange(isFinite(l.recommendedQty) && l.recommendedQty >= 0, 'recommendedLines[' + i + '].recommendedQty must be finite ≥ 0');
      }
    });
    // duplicate lineKey guard (deterministic upsert requires unique natural keys per run)
    var seen = {};
    lines.forEach(function (l) { aRange(seen[l.lineKey] !== 1, 'duplicate lineKey in recommendedLines: ' + l.lineKey); seen[l.lineKey] = 1; });
  }

  // ---- PO-6: Active Draft lookup (read-only) --------------------------------
  function resolveActiveDraft(store, query) {
    validateScopeQuery(query);
    var s = normStore(store);
    var ak = activeKeyOf(query.recommendationType, query.planningCycle, query.businessScope);
    var matches = s.drafts.filter(function (d) { return d.activeKey === ak && ACTIVE_STATUSES[d.status] === 1; });
    if (matches.length === 0) return { status: 'CREATE', activeKey: ak, draftId: draftIdOf(ak), draft: null };
    if (matches.length === 1) return { status: 'REUSE', activeKey: ak, draftId: draftIdOf(ak), draft: clone(matches[0]) };
    // >1 Active — fail-closed; never auto-repair, never latest-wins (PO-6)
    return { status: 'BLOCKED_CONFLICT', activeKey: ak, draftId: null, matchCount: matches.length, draft: null };
  }

  function hasUserEdits(store, draftId) {
    return draftLines(store, draftId).some(function (l) {
      return l.userEdited === true && l.lineStatus !== 'SUPERSEDED' && l.lineStatus !== 'SUPERSEDED_USER_REVIEW';
    });
  }

  // ---- stage execution (shared by persist + resume) -------------------------
  function execStage(store, run, stage, counts) {
    if (stage === 'RUN_METADATA') {
      // run row already upserted by the caller; ensure RUNNING
      run.status = 'RUNNING';
      return;
    }
    if (stage === 'HEADER') {
      var d = findDraft(store, run.draftId);
      if (!d) {
        store.drafts.push({
          draftId: run.draftId, activeKey: run.activeKey, recommendationType: run.recommendationType,
          planningCycle: run.planningCycle, businessScope: clone(run.businessScope), draftVersion: run.draftVersion,
          status: 'draft', calculationRunId: run.calculationRunId, formulaVersion: run.formulaVersion,
          sourceDataAsOf: run.sourceDataAsOf, totals: null
        });
        counts.created++;
      } else {
        d.draftVersion = run.draftVersion; d.calculationRunId = run.calculationRunId;
        d.formulaVersion = run.formulaVersion; d.sourceDataAsOf = run.sourceDataAsOf;
        if (ACTIVE_STATUSES[d.status] !== 1) { /* never mutate a terminal (submitted/cancelled) record */ }
        counts.updated++;
      }
      return;
    }
    if (stage === 'LINES') {
      run.plannedLines.forEach(function (pl) {
        var lineId = lineIdOf(run.draftId, pl.lineKey);
        var line = findLine(store, lineId);
        var blocked = pl.lineState === 'BLOCKED';
        if (!line) {
          store.lines.push({
            lineId: lineId, draftId: run.draftId, lineKey: pl.lineKey,
            recommendedQty: blocked ? null : pl.recommendedQty,
            userQty: blocked ? null : pl.recommendedQty, // first-line init = recommended (PO-10)
            userEdited: false,
            lineStatus: blocked ? 'BLOCKED' : 'ACTIVE',
            reason: blocked ? pl.reason : null,
            demandKey: pl.demandKey !== undefined ? pl.demandKey : null,
            calculationRunId: run.calculationRunId
          });
          if (blocked) counts.blocked++; else counts.created++;
          return;
        }
        // existing line
        if (blocked) {
          line.lineStatus = 'BLOCKED'; line.reason = pl.reason; line.recommendedQty = null; // never fabricate a qty
          counts.blocked++; // userQty untouched
        } else if (run.action === 'REFRESH') {
          // recommended_qty immutable within a draft_version (PO-11); refresh only repairs a prior BLOCK
          if (line.lineStatus === 'BLOCKED') { line.lineStatus = 'ACTIVE'; line.reason = null; }
          counts.skipped++;
        } else { // CREATE (re-run) or REGENERATE — recompute recommended; user qty per reInit
          line.recommendedQty = pl.recommendedQty;
          if (run.reInitUserQty === true) { line.userQty = pl.recommendedQty; line.userEdited = false; }
          line.lineStatus = 'ACTIVE'; line.reason = null;
          counts.updated++;
        }
        line.calculationRunId = run.calculationRunId;
      });
      return;
    }
    if (stage === 'RECONCILE') {
      var planned = {}; run.plannedLines.forEach(function (pl) { planned[pl.lineKey] = 1; });
      draftLines(store, run.draftId).forEach(function (line) {
        if (planned[line.lineKey] === 1) return;
        if (line.lineStatus === 'SUPERSEDED' || line.lineStatus === 'SUPERSEDED_USER_REVIEW') return; // idempotent
        // removed line — never hard-delete; user-edited rows are preserved + flagged for review (PO-13)
        line.lineStatus = line.userEdited === true ? 'SUPERSEDED_USER_REVIEW' : 'SUPERSEDED';
        counts.superseded++;
      });
      return;
    }
    if (stage === 'LINEAGE') {
      var plannedKeys = {}; run.plannedLines.forEach(function (pl) { plannedKeys[pl.lineKey] = 1; });
      draftLines(store, run.draftId).forEach(function (line) {
        if (plannedKeys[line.lineKey] === 1) {
          line.calculationRunId = run.calculationRunId;
          line.sourceDataAsOf = run.sourceDataAsOf;
        }
      });
      return;
    }
    if (stage === 'TOTALS') {
      var totRec = 0, totUser = 0, active = 0, blockedN = 0, supersededN = 0;
      draftLines(store, run.draftId).forEach(function (line) {
        if (line.lineStatus === 'ACTIVE') { totRec += (line.recommendedQty || 0); totUser += (line.userQty || 0); active++; }
        else if (line.lineStatus === 'BLOCKED') blockedN++;
        else supersededN++;
      });
      var d2 = findDraft(store, run.draftId);
      if (d2) {
        d2.totals = { totalRecommendedQty: totRec, totalUserQty: totUser, activeLineCount: active, blockedCount: blockedN, supersededCount: supersededN };
        d2.calculationRunId = run.calculationRunId; d2.draftVersion = run.draftVersion;
      }
      return;
    }
    // COMPLETED — terminal marker; status set by the driver
  }

  function driveStages(store, run, startIdx, stopAfterStage) {
    var counts = { created: 0, updated: 0, superseded: 0, blocked: 0, skipped: 0 };
    run.status = 'RUNNING';
    for (var i = startIdx; i < STAGES.length; i++) {
      var st = STAGES[i];
      execStage(store, run, st, counts);
      run.stage = st;
      if (stopAfterStage && st === stopAfterStage) {
        run.status = (st === 'COMPLETED') ? 'COMPLETED' : 'PARTIAL';
        return counts;
      }
    }
    run.status = 'COMPLETED';
    return counts;
  }

  function buildResult(run, counts, extra) {
    var r = {
      status: run.status, draftId: run.draftId, draftVersion: run.draftVersion,
      calculationRunId: run.calculationRunId, stage: run.stage, action: run.action, counts: counts
    };
    if (extra) for (var k in extra) r[k] = extra[k];
    return r;
  }

  // ---- PO-12: persist (logical write order, idempotent, resumable) ----------
  function persistRecommendationDraft(store, plan) {
    aType(isObj(plan) && typeof plan.draftId === 'string', 'plan must be an object with a draftId');
    aType(Array.isArray(plan.recommendedLines), 'plan.recommendedLines must be an array');
    if (plan.stopAfterStage !== undefined) aRange(stageIdx(plan.stopAfterStage) !== -1, 'plan.stopAfterStage must be a valid stage');
    var s = normStore(store);
    // RUN_METADATA: upsert the run row (captures full intent so resume is self-contained) — idempotent by runId
    var run = findRun(s, plan.calculationRunId);
    if (!run) {
      run = {
        calculationRunId: plan.calculationRunId, draftId: plan.draftId, activeKey: plan.activeKey,
        recommendationType: plan.recommendationType, planningCycle: plan.planningCycle,
        businessScope: clone(plan.businessScope), draftVersion: plan.draftVersion,
        formulaVersion: plan.formulaVersion !== undefined ? plan.formulaVersion : null,
        sourceDataAsOf: plan.sourceDataAsOf !== undefined ? plan.sourceDataAsOf : null,
        action: plan.action, reInitUserQty: plan.reInitUserQty === true,
        plannedLines: clone(plan.recommendedLines), status: 'RUNNING', stage: null
      };
      s.runs.push(run);
    } else {
      // retry of the same operation — reuse the same run id; refresh captured intent (idempotent)
      run.status = 'RUNNING'; run.plannedLines = clone(plan.recommendedLines); run.action = plan.action;
      run.reInitUserQty = plan.reInitUserQty === true;
      run.formulaVersion = plan.formulaVersion !== undefined ? plan.formulaVersion : run.formulaVersion;
      run.sourceDataAsOf = plan.sourceDataAsOf !== undefined ? plan.sourceDataAsOf : run.sourceDataAsOf;
    }
    var counts = driveStages(s, run, 0, plan.stopAfterStage);
    return { store: s, result: buildResult(run, counts) };
  }

  // ---- PO-9: generate (create / refresh / regenerate) -----------------------
  function generateRecommendationDraft(store, command) {
    validateScopeQuery(command);
    aRange(MODES[command.mode] === 1, 'unknown mode (expect SCHEDULED_REFRESH | MANUAL_REGENERATE)');
    validateLines(command.recommendedLines);
    var s = normStore(store);
    var resolved = resolveActiveDraft(s, command);
    if (resolved.status === 'BLOCKED_CONFLICT') {
      // duplicate Active Draft — run BLOCKS; store unchanged (PO-6 / PO-14)
      return { store: clone(store) || createStore(), result: { status: 'BLOCKED', reason: 'DUPLICATE_ACTIVE_DRAFT', activeKey: resolved.activeKey, draftId: null, matchCount: resolved.matchCount } };
    }
    var draftId = resolved.draftId, action, version, reInit;
    if (resolved.status === 'CREATE') {
      action = 'CREATE'; version = 1; reInit = true;
    } else { // REUSE
      if (command.mode === 'SCHEDULED_REFRESH') {
        action = 'REFRESH'; version = resolved.draft.draftVersion; reInit = false;
      } else { // MANUAL_REGENERATE
        var edits = hasUserEdits(s, draftId);
        if (edits && command.confirmRegenerateOverUserEdits !== true) {
          // regenerating over user edits needs explicit confirmation (PO-9 case G / PO-10)
          return { store: clone(store) || createStore(), result: { status: 'BLOCKED', reason: 'REGENERATE_NEEDS_CONFIRMATION', draftId: draftId, draftVersion: resolved.draft.draftVersion, activeKey: resolved.activeKey } };
        }
        action = 'REGENERATE'; version = resolved.draft.draftVersion + 1;
        reInit = true; // confirmed overwrite OR no edits → user qty re-initializes from the new recommendation
      }
    }
    var plan = {
      draftId: draftId, activeKey: resolved.activeKey, recommendationType: command.recommendationType,
      planningCycle: command.planningCycle, businessScope: sortedScope(command.businessScope),
      draftVersion: version, calculationRunId: runIdOf(draftId, version),
      formulaVersion: command.formulaVersion !== undefined ? command.formulaVersion : null,
      sourceDataAsOf: command.sourceDataAsOf !== undefined ? command.sourceDataAsOf : null,
      action: action, reInitUserQty: reInit, recommendedLines: clone(command.recommendedLines),
      stopAfterStage: command.stopAfterStage
    };
    return persistRecommendationDraft(s, plan);
  }

  // ---- PO-15: resume a PARTIAL/RUNNING run (reuses calculation_run_id) -------
  function resumeRecommendationRun(store, query) {
    aType(isObj(query), 'query must be an object');
    var s = normStore(store);
    var draftId = query.draftId;
    if (!draftId) { validateScopeQuery(query); draftId = draftIdOf(activeKeyOf(query.recommendationType, query.planningCycle, query.businessScope)); }
    var candidates = s.runs.filter(function (r) { return r.draftId === draftId && r.status !== 'COMPLETED'; });
    candidates.sort(function (a, b) { return (b.draftVersion - a.draftVersion) || cmpStr(b.calculationRunId, a.calculationRunId); });
    var run = candidates[0];
    if (!run) return { store: s, result: { status: 'NOOP', reason: 'NO_RESUMABLE_RUN', draftId: draftId } };
    var fromIdx = run.stage == null ? 0 : stageIdx(run.stage) + 1;
    var counts = driveStages(s, run, fromIdx, undefined); // reuses run.calculationRunId + run.plannedLines
    return { store: s, result: buildResult(run, counts, { resumed: true, resumedFromStage: fromIdx < STAGES.length ? STAGES[fromIdx] : 'COMPLETED' }) };
  }

  // ---- user-edit provenance (PO-10: explicit signal, never value comparison)-
  function applyUserEdit(store, edit) {
    aType(isObj(edit) && typeof edit.draftId === 'string' && typeof edit.lineKey === 'string', 'edit requires draftId + lineKey');
    aType(typeof edit.userQty === 'number', 'edit.userQty must be a number');
    aRange(isFinite(edit.userQty) && edit.userQty >= 0, 'edit.userQty must be finite ≥ 0');
    var s = normStore(store);
    var line = findLine(s, lineIdOf(edit.draftId, edit.lineKey));
    aRange(!!line, 'no such line for draftId+lineKey');
    line.userQty = edit.userQty; line.userEdited = true; line.userEditedBy = edit.actor || 'user';
    return { store: s, result: { draftId: edit.draftId, lineKey: edit.lineKey, userQty: edit.userQty, userEdited: true } };
  }

  return {
    createStore: createStore,
    resolveActiveDraft: resolveActiveDraft,
    generateRecommendationDraft: generateRecommendationDraft,
    persistRecommendationDraft: persistRecommendationDraft,
    resumeRecommendationRun: resumeRecommendationRun,
    applyUserEdit: applyUserEdit,
    STAGES: STAGES.slice()
  };
});
  __kmRegister("supply-planning-persistence", module.exports);
})();

// ----- module: supply-planning-persistence-repository (verbatim from assets/js/core/supply-planning-persistence-repository.js) -----
(function () {
  var require = __kmRequire;
  var module = { exports: {} };
  var exports = module.exports;
// Kitchen Mama Operation System — Recommendation Persistence production REPOSITORY logic (Phase 2C, Round 1D).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC implementation of the frozen §Persist-Adapter contract in
// docs/planning/RECOMMENDATION_RUNTIME_IMPLEMENTATION_SPEC.md (FROZEN 2026-08-03, Round 1C). This is the
// CANONICAL, Node-testable algorithm authority for the production repository (model B): it operates over a
// plain in-memory "sheet set" ({ tableName: { headers:[...], rows:[[...]] } }) so it can be exercised with a
// fake sheet in Node. The Apps Script wrapper (assets/specs/active/apps-script/23_recommendation_persistence_
// repository.gs) is a THIN Sheet-I/O adapter over these same helpers — no algorithm is duplicated there.
//
// Implements (Round 1D Slice 1): additive-header ensure, recommendation_calculation_runs schema, Active-Draft
// reader, draft-snapshot reader, incomplete-run reader, PersistencePlan validation, {draft_version,
// userEditFingerprint} token, natural-key line upsert (INSERT/UPDATE/SUPERSEDE) with user-edit preservation +
// conservative legacy protection, run-stage journal, idempotent replay + partial-write recovery, totals.
//
// NOT in scope (Round 1D §25): NO LockService, NO Scheduler/Trigger, NO calc engine, NO Request writer, NO
// Weekly-Plan promotion, NO Submit, NO B-6/B-8, NO deploy/migration. `applyPersistencePlan` is NOT race-safe
// without LockService (next round). No clock / no Math.random: timestamps + actor come in via opts.

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.persistenceRepository = api; }
})(this, function () {
  'use strict';

  // ---- frozen constants (Round 1C PA-4/-5/-6/-8) ----------------------------
  var LINE_ADDITIVE_HEADERS = ['user_edited', 'user_edited_by'];
  var RUN_JOURNAL_HEADERS = [
    'calculation_run_id', 'recommendation_type', 'draft_id', 'planning_cycle', 'business_scope_key',
    'draft_version', 'run_status', 'current_stage', 'formula_version', 'source_data_as_of',
    'started_by', 'started_at', 'completed_by', 'completed_at', 'error_summary', 'attempt_count'
  ];
  var RUN_STATUSES = { RUNNING: 1, PARTIAL: 1, COMPLETED: 1, FAILED: 1 };
  var STAGES = ['RUN_METADATA', 'HEADER', 'LINES', 'RECONCILE', 'LINEAGE', 'TOTALS', 'COMPLETED'];
  var LINE_OPS = { INSERT: 1, UPDATE: 1, SUPERSEDE: 1 };
  // additive line_status values on top of the existing draft/submitted/cancelled
  var LINE_STATES = { active: 1, blocked: 1, superseded: 1, superseded_user_review: 1, draft: 1, submitted: 1, cancelled: 1 };
  var ACTIVE_DRAFT_STATUSES = { draft: 1, site_confirmed: 1 };
  var RUN_JOURNAL_TABLE = 'recommendation_calculation_runs';

  // Per recommendation_type: source tables, business-scope columns, line natural-key columns, user-qty column.
  var TABLES = {
    WEEKLY_SHIPPING: {
      header: 'shipping_allocation_drafts', lines: 'shipping_allocation_draft_lines',
      headerId: 'allocation_draft_id', lineDraftId: 'allocation_draft_id', lineId: 'allocation_draft_line_id',
      scope: ['planning_cycle', 'company', 'country', 'marketplace', 'source_page'],
      lineKey: ['sku', 'site_sku', 'window_code'], userQty: 'planned_qty'
    },
    MONTHLY_ORDER: {
      header: 'request_order_allocation_drafts', lines: 'request_order_allocation_draft_lines',
      headerId: 'request_allocation_draft_id', lineDraftId: 'request_allocation_draft_id', lineId: 'request_allocation_line_id',
      scope: ['planning_cycle', 'company', 'country', 'marketplace', 'draft_purpose', 'sku'],
      lineKey: ['request_month', 'request_bucket'], userQty: 'order_qty'
    }
  };

  // ---- helpers --------------------------------------------------------------
  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function aType(c, m) { if (!c) throw new TypeError(m); }
  function aRange(c, m) { if (!c) throw new RangeError(m); }
  function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
  function tableCfg(type) { aRange(TABLES[type], 'unknown recommendationType: ' + type); return TABLES[type]; }
  function isBool(v) { return v === true || v === 'TRUE' || v === 'true'; }
  function boolCell(v) { return v ? 'TRUE' : 'FALSE'; }

  // deterministic 32-bit FNV-1a hash → hex (no clock/random/locale)
  function fnv1a(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
    return ('00000000' + h.toString(16)).slice(-8);
  }

  // additive-only header ensure: append any missing REQUIRED columns; never reorder/remove existing.
  function ensureHeaders(existing, required) {
    aType(Array.isArray(existing) && Array.isArray(required), 'ensureHeaders needs arrays');
    var out = existing.slice(), added = [];
    required.forEach(function (h) { if (out.indexOf(h) === -1) { out.push(h); added.push(h); } });
    return { headers: out, added: added, changed: added.length > 0 };
  }

  function buildBusinessScopeKey(type, scopeObj) {
    var cfg = tableCfg(type);
    aType(isObj(scopeObj), 'businessScope must be an object');
    return cfg.scope.map(function (c) { return c + '=' + String(scopeObj[c] === undefined || scopeObj[c] === null ? '' : scopeObj[c]); }).join('|');
  }

  // fingerprint over user-owned state: sorted (lineKey, userQty, userEdited). Legacy-protected rows participate.
  function buildUserEditFingerprint(lineTuples) {
    aType(Array.isArray(lineTuples), 'lineTuples must be an array');
    var canon = lineTuples.map(function (t) {
      return String(t.lineKey) + '' + String(t.userQty === undefined || t.userQty === null ? '' : t.userQty) + '' + (isBool(t.userEdited) ? '1' : '0');
    }).sort(cmpStr).join('');
    return fnv1a(canon);
  }
  function computeExpectedToken(draftVersion, lineTuples) {
    return { draft_version: draftVersion, userEditFingerprint: buildUserEditFingerprint(lineTuples) };
  }
  function tokensMatch(a, b) {
    return !!a && !!b && String(a.draft_version) === String(b.draft_version) && String(a.userEditFingerprint) === String(b.userEditFingerprint);
  }

  // ---- sheet-set primitives (fake sheet = { headers:[], rows:[[]] }) ---------
  function getTable(sheetSet, name) {
    var t = sheetSet[name];
    aType(t && Array.isArray(t.headers) && Array.isArray(t.rows), 'missing/invalid table: ' + name);
    return t;
  }
  function rowObj(headers, row) { var o = {}; for (var i = 0; i < headers.length; i++) o[headers[i]] = row[i]; return o; }
  function objRow(headers, obj) { return headers.map(function (h) { return obj[h] !== undefined ? obj[h] : ''; }); }
  function tableObjects(t) { return t.rows.map(function (r) { return rowObj(t.headers, r); }); }
  function matchesScope(o, cfg, query) { for (var i = 0; i < cfg.scope.length; i++) { var c = cfg.scope[i]; if (String(o[c] === undefined ? '' : o[c]) !== String(query[c] === undefined ? '' : query[c])) return false; } return true; }
  function naturalKeyStr(cols, o) { return cols.map(function (c) { return String(o[c] === undefined || o[c] === null ? '' : o[c]); }).join(''); }

  // ---- PA-2/PA-11: Active Draft reader (literal scope, no latest-wins) -------
  function loadActiveDraftContext(sheetSet, query) {
    aType(isObj(query) && typeof query.recommendationType === 'string', 'query needs recommendationType');
    var cfg = tableCfg(query.recommendationType);
    aType(typeof query.planningCycle === 'string' && query.planningCycle.length > 0, 'query.planningCycle required');
    aType(isObj(query.businessScope), 'query.businessScope required');
    var scopeQ = {}; scopeQ.planning_cycle = query.planningCycle;
    cfg.scope.forEach(function (c) { if (c !== 'planning_cycle') scopeQ[c] = query.businessScope[c] === undefined ? '' : query.businessScope[c]; });
    var t = getTable(sheetSet, cfg.header);
    var scopeKey = buildBusinessScopeKey(query.recommendationType, scopeQ);
    var matches = tableObjects(t).filter(function (o) {
      return ACTIVE_DRAFT_STATUSES[String(o.status || '').trim()] === 1 && matchesScope(o, cfg, scopeQ);
    });
    if (matches.length === 0) return { status: 'CREATE', activeKey: query.recommendationType + '::' + scopeKey, draftId: null, businessScopeKey: scopeKey };
    if (matches.length === 1) return { status: 'REUSE', activeKey: query.recommendationType + '::' + scopeKey, draftId: matches[0][cfg.headerId], draft: matches[0], businessScopeKey: scopeKey };
    return { status: 'BLOCKED_CONFLICT', activeKey: query.recommendationType + '::' + scopeKey, draftId: null, matchCount: matches.length, businessScopeKey: scopeKey };
  }

  // ---- PA-2: draft snapshot reader (legacy rows conservatively protected) ----
  function loadDraftSnapshot(sheetSet, draftId, recommendationType) {
    var cfg = tableCfg(recommendationType);
    aType(typeof draftId === 'string' && draftId.length > 0, 'draftId required');
    var hT = getTable(sheetSet, cfg.header), lT = getTable(sheetSet, cfg.lines);
    var draft = tableObjects(hT).filter(function (o) { return String(o[cfg.headerId]) === draftId; })[0] || null;
    var hasUserEditedCol = lT.headers.indexOf('user_edited') !== -1;
    var lines = tableObjects(lT).filter(function (o) { return String(o[cfg.lineDraftId]) === draftId; }).map(function (o) {
      var lineKey = naturalKeyStr(cfg.lineKey, o);
      // Legacy rows without an explicit user_edited column/value are treated as PROTECTED (never value-comparison).
      var explicit = hasUserEditedCol && (o.user_edited === true || o.user_edited === false || o.user_edited === 'TRUE' || o.user_edited === 'FALSE');
      var userEdited = explicit ? isBool(o.user_edited) : true; // conservative protect when unknown
      return { lineKey: lineKey, raw: o, userQty: o[cfg.userQty], userEdited: userEdited, legacyProtected: !explicit, lineStatus: String(o.line_status || '').trim() };
    });
    lines.sort(function (a, b) { return cmpStr(a.lineKey, b.lineKey); });
    var runs = [];
    if (sheetSet[RUN_JOURNAL_TABLE]) runs = tableObjects(getTable(sheetSet, RUN_JOURNAL_TABLE)).filter(function (o) { return String(o.draft_id) === draftId; });
    return { draft: draft, lines: lines, runs: runs };
  }

  // ---- PA-2: incomplete-run reader ------------------------------------------
  function loadIncompleteRun(sheetSet, draftId) {
    aType(typeof draftId === 'string' && draftId.length > 0, 'draftId required');
    if (!sheetSet[RUN_JOURNAL_TABLE]) return { status: 'NOT_FOUND' };
    var runs = tableObjects(getTable(sheetSet, RUN_JOURNAL_TABLE)).filter(function (o) {
      return String(o.draft_id) === draftId && (o.run_status === 'RUNNING' || o.run_status === 'PARTIAL');
    });
    if (runs.length === 0) return { status: 'NOT_FOUND' };
    if (runs.length === 1) return { status: 'FOUND', run: runs[0] };
    return { status: 'BLOCKED_CONFLICT', matchCount: runs.length };
  }

  // ---- PA-7: PersistencePlan validation (structural throws) ------------------
  function hasSheetRef(v) {
    if (typeof v === 'function') return true;
    if (v && typeof v === 'object') { if (typeof v.getRange === 'function' || typeof v.getValues === 'function' || typeof v.getSheetByName === 'function' || typeof v.getA1Notation === 'function') return true; }
    return false;
  }
  function validatePersistencePlan(plan) {
    aType(isObj(plan), 'plan must be an object');
    aRange(TABLES[plan.recommendationType], 'plan.recommendationType invalid');
    aType(isObj(plan.sourceTables) && typeof plan.sourceTables.header === 'string' && typeof plan.sourceTables.lines === 'string', 'plan.sourceTables invalid');
    aType(typeof plan.draftId === 'string' && plan.draftId.length > 0, 'plan.draftId required');
    aType(typeof plan.activeKey === 'string' && plan.activeKey.length > 0, 'plan.activeKey required');
    aType(typeof plan.calculationRunId === 'string' && plan.calculationRunId.length > 0, 'plan.calculationRunId required');
    aType(plan.draftVersion !== undefined, 'plan.draftVersion required');
    aType(isObj(plan.expectedToken) && plan.expectedToken.draft_version !== undefined && typeof plan.expectedToken.userEditFingerprint === 'string', 'plan.expectedToken invalid');
    aType(isObj(plan.runMeta), 'plan.runMeta required');
    aType(isObj(plan.headerOp) && (plan.headerOp.op === 'INSERT' || plan.headerOp.op === 'UPDATE'), 'plan.headerOp op must be INSERT|UPDATE');
    aType(isObj(plan.headerOp.row), 'plan.headerOp.row required');
    aType(Array.isArray(plan.lineOps), 'plan.lineOps must be an array');
    aType(Array.isArray(plan.lineageOps), 'plan.lineageOps must be an array');
    aType(isObj(plan.totals), 'plan.totals required');
    aType(Array.isArray(plan.stages), 'plan.stages must be an array');
    aRange(plan.stages.length === STAGES.length && plan.stages.every(function (s, i) { return s === STAGES[i]; }), 'plan.stages must equal the frozen stage sequence');
    aType(Array.isArray(plan.auditEvents), 'plan.auditEvents must be an array');
    aType(!hasSheetRef(plan.headerOp.row) && Object.keys(plan.headerOp.row).every(function (k) { return !hasSheetRef(plan.headerOp.row[k]); }), 'headerOp.row has a Sheet/Range/function reference');
    var cfg = TABLES[plan.recommendationType], seen = {};
    plan.lineOps.forEach(function (op, i) {
      aType(isObj(op), 'lineOps[' + i + '] must be object');
      aRange(LINE_OPS[op.op] === 1, 'lineOps[' + i + '].op must be INSERT|UPDATE|SUPERSEDE');
      aType(isObj(op.naturalKey), 'lineOps[' + i + '].naturalKey required');
      cfg.lineKey.forEach(function (kc) { aType(op.naturalKey[kc] !== undefined && op.naturalKey[kc] !== null && op.naturalKey[kc] !== '', 'lineOps[' + i + '] missing natural-key part: ' + kc); });
      var nk = naturalKeyStr(cfg.lineKey, op.naturalKey);
      aRange(seen[nk] !== 1, 'duplicate lineOps natural key: ' + nk); seen[nk] = 1;
      if (op.op !== 'SUPERSEDE') {
        aType(isObj(op.row), 'lineOps[' + i + '].row required for ' + op.op);
        aType(Object.keys(op.row).every(function (k) { return !hasSheetRef(op.row[k]); }), 'lineOps[' + i + '].row has a Sheet/Range/function reference');
        if (op.targetLineStatus === 'blocked') { /* blocked → qty may be null */ }
        else if (op.row[cfg.userQty] !== undefined && op.row[cfg.userQty] !== null && op.row[cfg.userQty] !== '') {
          var q = Number(op.row[cfg.userQty]); aRange(isFinite(q) && q >= 0, 'lineOps[' + i + '] user qty must be finite ≥ 0');
        }
      }
      if (op.targetLineStatus !== undefined) aRange(LINE_STATES[op.targetLineStatus] === 1, 'lineOps[' + i + '].targetLineStatus invalid');
    });
    return true;
  }

  // ---- PA-8: applyPersistencePlan (idempotent, resumable, token-guarded) -----
  // opts = { now, actor, startedBy, failBeforeStage, failBeforeMark } (all optional; no clock/random inside)
  function upsertRow(t, keyCols, keyObj, valueObj, mode) {
    // mode: 'insert' | 'update' | 'blind' ; returns {action, index} ; BLOCKED_CONFLICT on duplicate key
    var target = -1, dup = 0, i, o;
    for (i = 0; i < t.rows.length; i++) { o = rowObj(t.headers, t.rows[i]); if (naturalKeyStr(keyCols, o) === naturalKeyStr(keyCols, keyObj)) { dup++; if (target === -1) target = i; } }
    if (dup > 1) return { action: 'BLOCKED_CONFLICT' };
    if (target === -1) { t.rows.push(objRow(t.headers, valueObj)); return { action: 'INSERT', index: t.rows.length - 1 }; }
    var cur = rowObj(t.headers, t.rows[target]);
    for (var k in valueObj) if (valueObj.hasOwnProperty(k)) cur[k] = valueObj[k];
    t.rows[target] = objRow(t.headers, cur);
    return { action: 'UPDATE', index: target };
  }

  function applyPersistencePlan(sheetSet, plan, expectedToken, opts) {
    validatePersistencePlan(plan);
    opts = opts || {};
    var cfg = TABLES[plan.recommendationType];
    var hT = getTable(sheetSet, cfg.header), lT = getTable(sheetSet, cfg.lines), rT = getTable(sheetSet, RUN_JOURNAL_TABLE);
    var now = opts.now !== undefined ? opts.now : '', actor = opts.actor !== undefined ? opts.actor : '';

    // Token revalidation against the CURRENTLY loaded snapshot — no writes on mismatch (NOT race-safe w/o lock).
    var snap = loadDraftSnapshot(sheetSet, plan.draftId, plan.recommendationType);
    var liveFingerprint = buildUserEditFingerprint(snap.lines.map(function (l) { return { lineKey: l.lineKey, userQty: l.userQty, userEdited: l.userEdited }; }));
    // draft_version component: compare the header's persisted draft_version when the draft already exists
    var persistedVersion = snap.draft ? snap.draft.draft_version : (plan.headerOp.op === 'INSERT' ? plan.draftVersion : undefined);
    var liveToken = { draft_version: persistedVersion === undefined ? expectedToken.draft_version : persistedVersion, userEditFingerprint: liveFingerprint };
    if (!tokensMatch(liveToken, expectedToken)) {
      return { runStatus: 'CONFLICT', conflict: true, stageReached: null, reason: 'TOKEN_MISMATCH', expected: expectedToken, live: liveToken };
    }

    // resolve run + resume point (idempotent replay: re-run from the stage AFTER the last completed one)
    var runFind = null, ri;
    for (ri = 0; ri < rT.rows.length; ri++) { var ro = rowObj(rT.headers, rT.rows[ri]); if (String(ro.calculation_run_id) === plan.calculationRunId) { runFind = ro; break; } }
    var startIdx = 0, attempt = 1;
    if (runFind) {
      attempt = (parseInt(runFind.attempt_count, 10) || 1) + 1;
      if (runFind.run_status === 'PARTIAL' || runFind.run_status === 'RUNNING') {
        // resume the in-flight run from the stage AFTER the last successfully-completed one
        startIdx = runFind.current_stage ? STAGES.indexOf(runFind.current_stage) + 1 : 0;
        if (startIdx < 0 || startIdx >= STAGES.length) startIdx = 0;
      } else {
        // COMPLETED / FAILED → re-drive from the start; every stage is an idempotent natural-key upsert,
        // so a same-content replay is a no-op and a changed-content refresh applies the new content.
        startIdx = 0;
      }
    }

    function markStage(stage, status, err) {
      var run = {
        calculation_run_id: plan.calculationRunId, recommendation_type: plan.recommendationType, draft_id: plan.draftId,
        planning_cycle: (plan.runMeta.planning_cycle !== undefined ? plan.runMeta.planning_cycle : ''), business_scope_key: (plan.runMeta.business_scope_key !== undefined ? plan.runMeta.business_scope_key : ''),
        draft_version: plan.draftVersion, run_status: status, current_stage: stage,
        formula_version: (plan.runMeta.formulaVersion !== undefined ? plan.runMeta.formulaVersion : ''), source_data_as_of: (plan.runMeta.sourceDataAsOf !== undefined ? plan.runMeta.sourceDataAsOf : ''),
        started_by: (runFind ? runFind.started_by : (opts.startedBy !== undefined ? opts.startedBy : actor)), started_at: (runFind ? runFind.started_at : now),
        completed_by: status === 'COMPLETED' ? actor : (runFind ? runFind.completed_by : ''), completed_at: status === 'COMPLETED' ? now : (runFind ? runFind.completed_at : ''),
        error_summary: err || '', attempt_count: attempt
      };
      var res = upsertRow(rT, ['calculation_run_id'], run, run, 'blind');
      if (res.action === 'INSERT' || res.action === 'UPDATE') runFind = run;
      return res;
    }

    var counts = { inserted: 0, updated: 0, superseded: 0, blocked: 0, skipped: 0 };
    var i;
    for (i = startIdx; i < STAGES.length; i++) {
      var stage = STAGES[i];
      if (opts.failBeforeStage === stage) { markStage(i > 0 ? STAGES[i - 1] : null, 'PARTIAL', 'failBeforeStage:' + stage); return { runStatus: 'PARTIAL', stageReached: i > 0 ? STAGES[i - 1] : null, applied: counts }; }

      if (stage === 'RUN_METADATA') { markStage('RUN_METADATA', 'RUNNING'); }
      else if (stage === 'HEADER') {
        var hrow = defObj(cfg.headerId, plan.draftId, plan.headerOp.row);
        var hres = upsertRow(hT, [cfg.headerId], hrow, hrow, plan.headerOp.op === 'INSERT' ? 'insert' : 'update');
        if (hres.action === 'BLOCKED_CONFLICT') { markStage('RUN_METADATA', 'FAILED', 'DUPLICATE_HEADER'); return { runStatus: 'FAILED', stageReached: 'RUN_METADATA', reason: 'DUPLICATE_HEADER' }; }
      }
      else if (stage === 'LINES') {
        var lr = applyLineOps(lT, cfg, plan.lineOps, ['INSERT', 'UPDATE'], now, actor, snap, counts);
        if (lr) { markStage('HEADER', 'FAILED', lr); return { runStatus: 'FAILED', stageReached: 'HEADER', reason: lr }; }
      }
      else if (stage === 'RECONCILE') {
        var rr = applyLineOps(lT, cfg, plan.lineOps, ['SUPERSEDE'], now, actor, snap, counts);
        if (rr) { markStage('LINES', 'FAILED', rr); return { runStatus: 'FAILED', stageReached: 'LINES', reason: rr }; }
      }
      else if (stage === 'LINEAGE') {
        if (lT.headers.indexOf('calculation_run_id') !== -1 || lT.headers.indexOf('source_data_as_of') !== -1) {
          plan.lineageOps.forEach(function (op) {
            var v = {}; if (lT.headers.indexOf('calculation_run_id') !== -1) v.calculation_run_id = plan.calculationRunId; if (lT.headers.indexOf('source_data_as_of') !== -1) v.source_data_as_of = plan.runMeta.sourceDataAsOf || '';
            upsertRow(lT, cfg.lineKey, op.naturalKey, mergeKey(cfg.lineKey, op.naturalKey, v), 'update');
          });
        }
      }
      else if (stage === 'TOTALS') {
        // Header totals: request/shipping draft headers have NO persisted total columns → validate-only (honest skip).
        // (If a future total column is added, write it here; today none exists.)
      }
      else if (stage === 'COMPLETED') { markStage('COMPLETED', 'COMPLETED'); }

      if (stage !== 'RUN_METADATA' && stage !== 'COMPLETED') {
        if (opts.failBeforeMark === stage) { /* writes done, marker NOT written → run stays at prior stage (crash) */ return { runStatus: 'PARTIAL', stageReached: STAGES[i - 1], applied: counts, crashedAt: stage }; }
        markStage(stage, i === STAGES.length - 1 ? 'COMPLETED' : 'PARTIAL');
      }
    }
    return { runStatus: 'COMPLETED', stageReached: 'COMPLETED', applied: counts };
  }

  function defObj(idCol, idVal, row) { var o = {}; for (var k in row) o[k] = row[k]; if (o[idCol] === undefined) o[idCol] = idVal; return o; }
  function mergeKey(keyCols, keyObj, extra) { var o = {}; keyCols.forEach(function (c) { o[c] = keyObj[c]; }); for (var k in extra) o[k] = extra[k]; return o; }

  // apply a subset of line ops (INSERT/UPDATE or SUPERSEDE) with user-edit preservation + legacy protection
  function applyLineOps(lT, cfg, lineOps, allowed, now, actor, snap, counts) {
    var protectedKeys = {}; snap.lines.forEach(function (l) { if (l.userEdited || l.legacyProtected) protectedKeys[l.lineKey] = 1; });
    for (var i = 0; i < lineOps.length; i++) {
      var op = lineOps[i]; if (allowed.indexOf(op.op) === -1) continue;
      var nk = naturalKeyStr(cfg.lineKey, op.naturalKey);
      if (op.op === 'SUPERSEDE') {
        var sres = supersedeLine(lT, cfg, op.naturalKey, op.targetLineStatus || (protectedKeys[nk] ? 'superseded_user_review' : 'superseded'), now, actor);
        if (sres === 'BLOCKED_CONFLICT') return 'DUPLICATE_LINE_KEY:' + nk;
        if (sres === 'INSERT' || sres === 'UPDATE') counts.superseded++;
        continue;
      }
      // INSERT / UPDATE
      var blocked = op.targetLineStatus === 'blocked';
      var row = {}; for (var k in op.row) row[k] = op.row[k];
      cfg.lineKey.forEach(function (c) { row[c] = op.naturalKey[c]; });
      if (lT.headers.indexOf(cfg.lineDraftId) !== -1 && op.naturalKey[cfg.lineDraftId] !== undefined) row[cfg.lineDraftId] = op.naturalKey[cfg.lineDraftId];
      row.line_status = blocked ? 'blocked' : (op.targetLineStatus || 'active');
      // user-edit preservation: on a system refresh over a protected/edited row, DO NOT touch the user-qty column
      var preserve = op.preserveUserQty === true || (op.op === 'UPDATE' && protectedKeys[nk]);
      if (preserve && row[cfg.userQty] !== undefined) delete row[cfg.userQty];
      // provenance columns
      if (lT.headers.indexOf('user_edited') !== -1) {
        if (op.setUserEdited === true) { row.user_edited = 'TRUE'; row.user_edited_by = op.userEditedBy || actor || 'user'; }
        else if (op.op === 'INSERT') { row.user_edited = 'FALSE'; row.user_edited_by = ''; }
        // UPDATE without setUserEdited: leave provenance untouched (omit from row)
      }
      var mode = op.op === 'INSERT' ? 'insert' : 'update';
      var res = upsertRow(lT, cfg.lineKey, op.naturalKey, row, mode);
      if (res.action === 'BLOCKED_CONFLICT') return 'DUPLICATE_LINE_KEY:' + nk;
      if (res.action === 'INSERT') { blocked ? counts.blocked++ : counts.inserted++; }
      else counts.updated++;
    }
    return null;
  }

  function supersedeLine(lT, cfg, keyObj, targetStatus, now, actor) {
    var target = -1, dup = 0;
    for (var i = 0; i < lT.rows.length; i++) { var o = rowObj(lT.headers, lT.rows[i]); if (naturalKeyStr(cfg.lineKey, o) === naturalKeyStr(cfg.lineKey, keyObj)) { dup++; if (target === -1) target = i; } }
    if (dup > 1) return 'BLOCKED_CONFLICT';
    if (target === -1) return 'MISSING'; // nothing to supersede (idempotent no-op)
    var cur = rowObj(lT.headers, lT.rows[target]);
    if (cur.line_status === targetStatus) return 'NOOP';
    cur.line_status = targetStatus; if (lT.headers.indexOf('updated_at') !== -1) cur.updated_at = now;
    lT.rows[target] = objRow(lT.headers, cur);
    return 'UPDATE';
  }

  function createSheetSet(seed) {
    var s = {};
    ['shipping_allocation_drafts', 'shipping_allocation_draft_lines', 'request_order_allocation_drafts', 'request_order_allocation_draft_lines', RUN_JOURNAL_TABLE].forEach(function (n) { s[n] = { headers: [], rows: [] }; });
    if (seed) for (var k in seed) s[k] = { headers: seed[k].headers.slice(), rows: seed[k].rows.map(function (r) { return r.slice(); }) };
    return s;
  }

  // ---- Round 1H: canonical terminal-status vocabulary (SINGLE SOURCE) --------
  // Header fully-terminal — block ALL mutation (generation + user edit) through the locked boundary.
  var TERMINAL_DRAFT_STATUSES = { submitted: 1, cancelled: 1 };
  // Line-terminal — a line in one of these states is committed/retired and is NEVER mutated.
  var LINE_TERMINAL_STATUSES = { submitted: 1, cancelled: 1, superseded: 1, superseded_user_review: 1 };
  // Generation-blocked header — the engine must not (re)generate over a header carrying committed lines.
  // `partially_submitted` (owner: 15_ handler — a header state where SOME lines are submitted, others still
  // draft) is generation-blocked but line-level editable on its remaining non-terminal lines.
  var GENERATION_BLOCKED_STATUSES = { submitted: 1, cancelled: 1, partially_submitted: 1 };
  function nstat(s) { return String(s === undefined || s === null ? '' : s).trim().toLowerCase(); }
  function isTerminalDraftStatus(s) { return TERMINAL_DRAFT_STATUSES[nstat(s)] === 1; }
  function isLineTerminalStatus(s) { return LINE_TERMINAL_STATUSES[nstat(s)] === 1; }
  function isGenerationBlockedStatus(s) { return GENERATION_BLOCKED_STATUSES[nstat(s)] === 1; }

  // Editable decision-field allowlist per type. recommended_qty + calculation lineage + status are NOT editable
  // through a user decision edit (frozen boundary: recommended_qty is an immutable per-version snapshot).
  var EDITABLE_DECISION_FIELDS = {
    WEEKLY_SHIPPING: { planned_qty: 1, selected_source_warehouse_id: 1, selected_destination_warehouse_id: 1, selected_shipping_method: 1, expected_arrival: 1, note: 1 },
    MONTHLY_ORDER: { order_qty: 1, carton_qty: 1, allocation_method: 1, note: 1 }
  };

  // applyUserDecisionEdits(sheetSet, command, opts) — targeted natural-key line edits, applied UNDER a lock held
  // by the caller (the KMUE user-edit orchestrator). Supports INSERT (new manual line + initial recommended
  // snapshot), UPDATE (allowlisted decision fields + provenance; recommended_qty + lineage PRESERVED), and
  // optional SUPERSEDE-reconcile (draft lines absent from the edit set → superseded / _user_review; line-terminal
  // rows are NEVER touched). Writes NO run journal. Fail-closed: an out-of-allowlist field or a duplicate natural
  // key returns a conflict status with ZERO mutation. command = { recommendationType, draftId, edits:[{ naturalKey,
  // fields, recommendedSnapshot? }], reconcile? }.
  function applyUserDecisionEdits(sheetSet, command, opts) {
    opts = opts || {};
    aType(isObj(command), 'command must be an object');
    var cfg = tableCfg(command.recommendationType);
    aType(typeof command.draftId === 'string' && command.draftId.length > 0, 'command.draftId required');
    aType(Array.isArray(command.edits) && command.edits.length > 0, 'command.edits must be a non-empty array');
    var allow = EDITABLE_DECISION_FIELDS[command.recommendationType];
    var lT = getTable(sheetSet, cfg.lines);
    var now = opts.now !== undefined ? opts.now : '', actor = opts.actor !== undefined ? opts.actor : 'user';
    var counts = { inserted: 0, updated: 0, superseded: 0, skippedTerminal: 0 };

    // ---- validate ALL edits first (fail closed → zero writes on any invalid field / duplicate key) ----------
    var seen = {}, i, k;
    for (i = 0; i < command.edits.length; i++) {
      var e = command.edits[i];
      aType(isObj(e) && isObj(e.naturalKey), 'edits[' + i + '] needs a naturalKey object');
      cfg.lineKey.forEach(function (kc) { aType(e.naturalKey[kc] !== undefined && e.naturalKey[kc] !== null && String(e.naturalKey[kc]).length > 0, 'edits[' + i + '] missing natural-key part: ' + kc); });
      var nk = naturalKeyStr(cfg.lineKey, e.naturalKey);
      if (seen[nk] === 1) return { status: 'DUPLICATE_LINE_KEY', reason: 'DUPLICATE_LINE_KEY:' + nk, counts: counts };
      seen[nk] = 1;
      var fields = isObj(e.fields) ? e.fields : {};
      for (k in fields) { if (fields.hasOwnProperty(k) && allow[k] !== 1) return { status: 'INVALID_EDIT_FIELD', reason: 'INVALID_EDIT_FIELD:' + k, counts: counts }; }
    }
    var editByKey = {};
    command.edits.forEach(function (e2) { editByKey[naturalKeyStr(cfg.lineKey, e2.naturalKey)] = e2; });
    function findRows(nk) { var idxs = []; for (var r = 0; r < lT.rows.length; r++) { var o = rowObj(lT.headers, lT.rows[r]); if (String(o[cfg.lineDraftId]) === String(command.draftId) && naturalKeyStr(cfg.lineKey, o) === nk) idxs.push(r); } return idxs; }

    // ---- INSERT / UPDATE ------------------------------------------------------
    for (i = 0; i < command.edits.length; i++) {
      var ed = command.edits[i], nk2 = naturalKeyStr(cfg.lineKey, ed.naturalKey), rowsFound = findRows(nk2);
      if (rowsFound.length > 1) return { status: 'DUPLICATE_LINE_KEY', reason: 'DUPLICATE_LINE_KEY:' + nk2, counts: counts };
      var f = isObj(ed.fields) ? ed.fields : {};
      if (rowsFound.length === 0) {
        // a focused edit of a non-existent line is a conflict; only the batch adapter (allowInsert) may INSERT.
        if (command.allowInsert !== true) return { status: 'LINE_NOT_FOUND', reason: 'LINE_NOT_FOUND:' + nk2, counts: counts };
        var ins = {}; cfg.lineKey.forEach(function (c) { ins[c] = ed.naturalKey[c]; }); ins[cfg.lineDraftId] = command.draftId;
        if (isObj(ed.recommendedSnapshot)) for (k in ed.recommendedSnapshot) if (ed.recommendedSnapshot.hasOwnProperty(k)) ins[k] = ed.recommendedSnapshot[k];
        for (k in f) if (f.hasOwnProperty(k)) ins[k] = f[k];
        ins.line_status = 'active';
        if (lT.headers.indexOf('user_edited') !== -1) { ins.user_edited = 'TRUE'; ins.user_edited_by = actor; }
        if (lT.headers.indexOf('updated_at') !== -1) ins.updated_at = now;
        if (lT.headers.indexOf('created_at') !== -1) ins.created_at = now;
        lT.rows.push(objRow(lT.headers, ins)); counts.inserted++;
      } else {
        var ri = rowsFound[0], cur = rowObj(lT.headers, lT.rows[ri]);
        if (isLineTerminalStatus(cur.line_status)) { counts.skippedTerminal++; continue; }  // NEVER mutate a terminal line
        for (k in f) if (f.hasOwnProperty(k)) cur[k] = f[k];            // allowlisted decision fields only → recommended_qty + lineage preserved
        if (lT.headers.indexOf('user_edited') !== -1) { cur.user_edited = 'TRUE'; cur.user_edited_by = actor; }
        if (lT.headers.indexOf('updated_at') !== -1) cur.updated_at = now;
        lT.rows[ri] = objRow(lT.headers, cur); counts.updated++;
      }
    }
    // ---- SUPERSEDE-reconcile (optional; never hard-deletes; terminal lines untouched) ----------------------
    if (command.reconcile === true) {
      for (var r3 = 0; r3 < lT.rows.length; r3++) {
        var o3 = rowObj(lT.headers, lT.rows[r3]);
        if (String(o3[cfg.lineDraftId]) !== String(command.draftId)) continue;
        if (editByKey[naturalKeyStr(cfg.lineKey, o3)]) continue;
        if (isLineTerminalStatus(o3.line_status)) continue;
        o3.line_status = isBool(o3.user_edited) ? 'superseded_user_review' : 'superseded';
        if (lT.headers.indexOf('updated_at') !== -1) o3.updated_at = now;
        lT.rows[r3] = objRow(lT.headers, o3); counts.superseded++;
      }
    }
    return { status: 'APPLIED', counts: counts };
  }

  return {
    TERMINAL_DRAFT_STATUSES: (function () { var o = {}; for (var k in TERMINAL_DRAFT_STATUSES) o[k] = 1; return o; })(),
    LINE_TERMINAL_STATUSES: (function () { var o = {}; for (var k in LINE_TERMINAL_STATUSES) o[k] = 1; return o; })(),
    GENERATION_BLOCKED_STATUSES: (function () { var o = {}; for (var k in GENERATION_BLOCKED_STATUSES) o[k] = 1; return o; })(),
    EDITABLE_DECISION_FIELDS: EDITABLE_DECISION_FIELDS,
    isTerminalDraftStatus: isTerminalDraftStatus,
    isLineTerminalStatus: isLineTerminalStatus,
    isGenerationBlockedStatus: isGenerationBlockedStatus,
    applyUserDecisionEdits: applyUserDecisionEdits,
    LINE_ADDITIVE_HEADERS: LINE_ADDITIVE_HEADERS.slice(),
    RUN_JOURNAL_HEADERS: RUN_JOURNAL_HEADERS.slice(),
    RUN_JOURNAL_TABLE: RUN_JOURNAL_TABLE,
    STAGES: STAGES.slice(),
    TABLES: TABLES,
    ensureHeaders: ensureHeaders,
    buildBusinessScopeKey: buildBusinessScopeKey,
    buildUserEditFingerprint: buildUserEditFingerprint,
    computeExpectedToken: computeExpectedToken,
    tokensMatch: tokensMatch,
    loadActiveDraftContext: loadActiveDraftContext,
    loadDraftSnapshot: loadDraftSnapshot,
    loadIncompleteRun: loadIncompleteRun,
    validatePersistencePlan: validatePersistencePlan,
    applyPersistencePlan: applyPersistencePlan,
    createSheetSet: createSheetSet
  };
});
  __kmRegister("supply-planning-persistence-repository", module.exports);
})();

// ----- module: supply-planning-persistence-locking (verbatim from assets/js/core/supply-planning-persistence-locking.js) -----
(function () {
  var require = __kmRequire;
  var module = { exports: {} };
  var exports = module.exports;
// Kitchen Mama Operation System — Recommendation Persistence LOCKING / optimistic-concurrency boundary
// (Phase 2C, Round 1E). ----------------------------------------------------------------------------------
// PURE / DETERMINISTIC orchestrator of the frozen §Persist-Adapter PA-9/PA-10 boundary in
// docs/planning/RECOMMENDATION_RUNTIME_IMPLEMENTATION_SPEC.md. It realises the exact race-safe write flow:
//   readiness → (pure calc happens OUTSIDE the lock) → acquire ScriptLock → reload Active-Draft context +
//   snapshot UNDER the lock → revalidate {draft_version, userEditFingerprint} → applyPersistencePlan →
//   COMPLETED → release (in finally, exactly once after acquisition).
//
// This module DOES NOT import Apps Script globals and DOES NOT duplicate any repository algorithm — the lock
// primitive, the Sheet I/O, the fingerprint hash and the plan application are all supplied as INJECTED
// dependencies (deps.*). The Apps Script wrapper (23_recommendation_persistence_repository.gs) wires those
// deps to LockService + the KMPR repository module; Node tests wire them to a fake lock + a fake sheet set.
//
// NOT in scope (Round 1E §19): NO Scheduler, NO Trigger, NO no-arg runners, NO calc engine, NO Submit, NO
// Request writer, NO Weekly-Plan promotion, NO API/UI, NO deploy/migration, NO B-6/B-8. No clock / no random /
// no locale here: determinism is a hard invariant (same dependency results ⇒ identical result DTO).

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.persistenceLocking = api; }
})(this, function () {
  'use strict';

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function aType(c, m) { if (!c) throw new TypeError(m); }
  function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
  function errMsg(e) { return (e && e.message !== undefined && e.message !== null) ? String(e.message) : String(e); }
  // trivial equality of the frozen token shape (NOT a repository algorithm — the fingerprint hash itself is
  // computed behind deps.recomputeToken; here we only compare two already-computed {draft_version, fp} pairs).
  function tokenEq(a, b) {
    return !!a && !!b && String(a.draft_version) === String(b.draft_version) &&
      String(a.userEditFingerprint) === String(b.userEditFingerprint);
  }

  // Frozen, minimal, non-overlapping status vocabulary (Round 1E §9).
  var STATUS = {
    COMPLETED: 'COMPLETED',            // applied, run reached COMPLETED
    LOCK_UNAVAILABLE: 'LOCK_UNAVAILABLE', // could not acquire the ScriptLock (zero writes)
    CONFLICT: 'CONFLICT',              // token mismatch / terminal / missing-or-existing identity (zero writes)
    BLOCKED_CONFLICT: 'BLOCKED_CONFLICT', // >1 Active Draft under lock (zero writes)
    FAILED: 'FAILED'                   // structural/repository failure or exception (zero or partial writes)
  };
  var REQUIRED_DEPS = ['acquireLock', 'releaseLock', 'loadActiveDraftContext', 'reloadSnapshot', 'recomputeToken', 'applyPlan'];

  // executeLockedPersistence(command)
  //   command = {
  //     plan,               // the deterministic PersistencePlan (PA-7) produced OUTSIDE the lock
  //     expectedToken,      // {draft_version, userEditFingerprint} captured at calculation time (PA-9)
  //     generationType,     // 'SCHEDULED_REFRESH' | 'MANUAL_REGENERATE' (informational; carried into conflict DTO)
  //     opts,               // {actor, now, ...} forwarded verbatim to deps.applyPlan
  //     deps: {
  //       acquireLock(): boolean,          // true ⇒ acquired; may throw
  //       releaseLock(): void,             // may throw (reported, never hides the primary result)
  //       loadActiveDraftContext(): {status:'CREATE'|'REUSE'|'BLOCKED_CONFLICT', draftId?, matchCount?},
  //       reloadSnapshot(): {draft, lines, runs},   // reloaded UNDER the lock — never the pre-lock snapshot
  //       recomputeToken(snapshot): {draft_version, userEditFingerprint},
  //       applyPlan(expectedToken, opts): repositoryResult,  // KMPR.applyPersistencePlan bound to the reloaded set
  //       validatePlan?(plan): void,       // optional structural guard (throws) run BEFORE the lock
  //       audit?(event): void              // optional side-effect hook; failures are reported, never fatal
  //     }
  //   }
  function executeLockedPersistence(command) {
    aType(isObj(command), 'command must be an object');
    var plan = command.plan, expectedToken = command.expectedToken, deps = command.deps, opts = command.opts || {};
    var generationType = command.generationType || 'SCHEDULED_REFRESH';
    aType(isObj(deps), 'command.deps must be an object');
    REQUIRED_DEPS.forEach(function (fn) { aType(typeof deps[fn] === 'function', 'command.deps.' + fn + ' must be a function'); });
    aType(isObj(plan), 'command.plan must be an object');
    aType(typeof plan.draftId === 'string' && plan.draftId.length > 0, 'plan.draftId required');
    aType(typeof plan.calculationRunId === 'string' && plan.calculationRunId.length > 0, 'plan.calculationRunId required');
    aType(isObj(plan.headerOp) && (plan.headerOp.op === 'INSERT' || plan.headerOp.op === 'UPDATE'), 'plan.headerOp.op must be INSERT|UPDATE');
    aType(isObj(expectedToken) && expectedToken.draft_version !== undefined && typeof expectedToken.userEditFingerprint === 'string', 'command.expectedToken invalid');
    // Structural plan validation runs BEFORE acquiring the lock (a throw here needs no release — §14 invariant).
    if (typeof deps.validatePlan === 'function') deps.validatePlan(plan);

    var issues = [];
    var draftId = plan.draftId, calcRunId = plan.calculationRunId;
    var draftVersion = (plan.draftVersion === undefined ? null : plan.draftVersion);
    function audit(ev) { if (typeof deps.audit === 'function') { try { deps.audit(ev); } catch (ae) { issues.push('AUDIT_FAILED:' + errMsg(ae)); } } }
    function dto(status, extra) {
      var d = {
        success: status === STATUS.COMPLETED, status: status, stage: null, reason: null,
        draftId: draftId, calculationRunId: calcRunId, draftVersion: draftVersion,
        applied: false, conflict: false, issues: []
      };
      if (extra) for (var k in extra) if (extra.hasOwnProperty(k)) d[k] = extra[k];
      return d;
    }
    function finish(d) { d.issues = issues.slice().sort(cmpStr); audit({ event: 'locked_persistence_result', status: d.status, reason: d.reason, draftId: draftId }); return d; }

    // ---- ACQUIRE (outside the try: if acquisition fails there is nothing to release — §14) ----------------
    var acquired = false, acqErr = null;
    try { acquired = deps.acquireLock() === true; } catch (e) { acqErr = e; }
    if (acqErr) return finish(dto(STATUS.LOCK_UNAVAILABLE, { stage: 'lock', reason: 'LOCK_ERROR:' + errMsg(acqErr) }));
    if (!acquired) return finish(dto(STATUS.LOCK_UNAVAILABLE, { stage: 'lock', reason: 'LOCK_UNAVAILABLE' }));

    // ---- CRITICAL SECTION (release happens exactly once in finally) --------------------------------------
    var result = null, stage = 'revalidate';
    try {
      // 1) reload Active-Draft context + duplicate-active RE-check under the lock (never trust the pre-read).
      var active = deps.loadActiveDraftContext();
      var op = plan.headerOp.op;
      if (isObj(active) && active.status === 'BLOCKED_CONFLICT') {
        result = dto(STATUS.BLOCKED_CONFLICT, { stage: stage, reason: 'DUPLICATE_ACTIVE_DRAFT', conflict: true, matchCount: active.matchCount });
      } else if (isObj(active) && active.status === 'CREATE' && op === 'UPDATE') {
        // the Draft the plan means to update has disappeared (cancelled/deleted by a racer) — do not re-create it.
        result = dto(STATUS.CONFLICT, { stage: stage, reason: 'ACTIVE_DRAFT_MISSING', conflict: true });
      } else if (isObj(active) && active.status === 'REUSE' && op === 'INSERT') {
        // a Draft now exists but the plan wants to INSERT a fresh one — a racer created it first.
        result = dto(STATUS.CONFLICT, { stage: stage, reason: 'ACTIVE_DRAFT_ALREADY_EXISTS', conflict: true });
      } else if (isObj(active) && active.status === 'REUSE' && String(active.draftId) !== String(draftId)) {
        // the surviving Active Draft is not the one this plan targets — identity drift.
        result = dto(STATUS.CONFLICT, { stage: stage, reason: 'ACTIVE_DRAFT_IDENTITY_MISMATCH', conflict: true });
      } else {
        // 2) reload the Draft snapshot UNDER the lock + terminal-status guard (submitted/cancelled = immutable).
        var snap = deps.reloadSnapshot();
        var st = (snap && snap.draft) ? String(snap.draft.status === undefined || snap.draft.status === null ? '' : snap.draft.status).trim().toLowerCase() : '';
        if (st === 'submitted' || st === 'cancelled') {
          result = dto(STATUS.CONFLICT, { stage: stage, reason: 'IMMUTABLE_TERMINAL_STATUS:' + st, conflict: true });
        } else {
          // 3) recompute the optimistic token from the reloaded snapshot and compare to the plan's captured token.
          var liveToken = deps.recomputeToken(snap);
          if (!tokenEq(liveToken, expectedToken)) {
            result = dto(STATUS.CONFLICT, { stage: stage, reason: 'CONCURRENCY_TOKEN_MISMATCH', conflict: true, expectedToken: expectedToken, liveToken: liveToken, generationType: generationType });
          } else {
            // 4) APPLY only after a successful revalidation — using the reloaded (under-lock) state.
            stage = 'apply';
            var repo = deps.applyPlan(expectedToken, opts);
            result = mapApply(repo, dto);
          }
        }
      }
    } catch (e) {
      // primary business exception during reload / token / apply — reported honestly, never converted to success.
      result = dto(STATUS.FAILED, { stage: stage, reason: 'EXCEPTION:' + errMsg(e) });
    } finally {
      try { deps.releaseLock(); } catch (re) { issues.push('RELEASE_FAILED:' + errMsg(re)); }
    }
    if (!result) result = dto(STATUS.FAILED, { stage: stage, reason: 'NO_RESULT' });
    return finish(result);
  }

  // Map the repository result (KMPR.applyPersistencePlan) into the frozen lock-result DTO. PARTIAL/FAILED are
  // reported honestly (success:false); a repository CONFLICT stays a CONFLICT; only COMPLETED is a success.
  function mapApply(repo, dto) {
    if (!isObj(repo)) return dto('FAILED', { stage: 'apply', reason: 'REPOSITORY_NO_RESULT' });
    var rs = repo.runStatus;
    if (rs === 'COMPLETED') return dto('COMPLETED', { stage: 'apply', reason: null, applied: (repo.applied !== undefined && repo.applied !== null) ? repo.applied : true, conflict: false });
    if (repo.conflict === true || rs === 'CONFLICT') return dto('CONFLICT', { stage: 'apply', reason: repo.reason || 'TOKEN_MISMATCH', conflict: true, applied: false, liveToken: repo.live, expectedToken: repo.expected });
    if (rs === 'PARTIAL') return dto('FAILED', { stage: 'apply', reason: 'REPOSITORY_PARTIAL', partial: true, applied: (repo.applied !== undefined && repo.applied !== null) ? repo.applied : false });
    return dto('FAILED', { stage: 'apply', reason: 'REPOSITORY_' + (rs || 'UNKNOWN') + (repo.reason ? (':' + repo.reason) : ''), applied: false });
  }

  return {
    STATUS: { COMPLETED: 'COMPLETED', LOCK_UNAVAILABLE: 'LOCK_UNAVAILABLE', CONFLICT: 'CONFLICT', BLOCKED_CONFLICT: 'BLOCKED_CONFLICT', FAILED: 'FAILED' },
    REQUIRED_DEPS: REQUIRED_DEPS.slice(),
    executeLockedPersistence: executeLockedPersistence
  };
});
  __kmRegister("supply-planning-persistence-locking", module.exports);
})();

// ----- module: supply-planning-plan-builder (verbatim from assets/js/core/supply-planning-plan-builder.js) -----
(function () {
  var require = __kmRequire;
  var module = { exports: {} };
  var exports = module.exports;
// Kitchen Mama Operation System — Recommendation production PLAN BUILDER (Phase 2C, Round 1G).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC projection of already-RESOLVED recommendation facts (produced by the calculation /
// line-runtime / ledger / allocation runtime) into the exact command shape the Persistence Core
// (`supply-planning-persistence.js` → generateRecommendationDraft) accepts, PLUS the per-line detail map the
// Persistence Plan Builder (`supply-planning-persistence-plan-builder.js`) needs to emit a PA-7 diff.
//
// This module owns the RECOMMENDATION-SNAPSHOT projection only. It is bound by the FROZEN Analysis / Snapshot /
// Decision boundary (Round 1F-R, RRIS §Persist-Adapter / REQ_PO §12.13 / WEEKLY §2A):
//   • LIVE ANALYSIS (gap / shortage / coverage / days_of_supply / live suggested_qty / risk) is NEVER persisted
//     as business authority — this module refuses to carry those keys into any persisted row.
//   • RECOMMENDATION SNAPSHOT (`recommended_qty` + calc lineage) is the only quantity this builder emits; it is
//     immutable within a draft_version and belongs to one Draft version.
//   • USER DECISION (`planned_qty` / `order_qty`) is NOT set here — the Persistence Core initializes it from the
//     recommendation snapshot and PRESERVES any prior user edit; the Plan Builder never overwrites a decision.
//   • BUSINESS COMMITMENT (Submit / Send Request / PO / Shipment) is out of scope and never triggered.
//
// It references `supply-planning-persistence-repository.js` (TABLES) as the SINGLE SOURCE OF TRUTH for the
// per-type natural-key grain — no grain is redefined here. No clock / no random: determinism is a hard invariant.

(function (root, factory) {
  'use strict';
  var api = factory(
    (typeof require !== 'undefined') ? require('./supply-planning-persistence-repository.js') : (root.KMPR || (root.KM && root.KM.persistenceRepository))
  );
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.planBuilder = api; }
})(this, function (REPO) {
  'use strict';

  var SEP = '';
  // Core execution intent (mode) → persisted generation_type. Two SEPARATE axes with an explicit mapping.
  var MODE_TO_GENERATION_TYPE = { SCHEDULED_REFRESH: 'scheduled', MANUAL_REGENERATE: 'manual_refresh' };
  // Live-analysis keys that must NEVER appear in a persisted recommendation/decision row (frozen boundary A).
  var LIVE_ANALYSIS_FORBIDDEN = {
    gap: 1, calculated_gap: 1, shortage: 1, shortage_qty: 1, coverage: 1, coverage_status: 1,
    days_of_supply: 1, suggested_qty: 1, uncovered_qty: 1, risk: 1, risk_label: 1, current_risk: 1
  };

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function aType(c, m) { if (!c) throw new TypeError(m); }
  function aRange(c, m) { if (!c) throw new RangeError(m); }
  function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
  function str(v) { return String(v === undefined || v === null ? '' : v); }
  function typeCfg(type) { aRange(REPO && REPO.TABLES && REPO.TABLES[type], 'unknown recommendationType: ' + type); return REPO.TABLES[type]; }

  // ---- deterministic reversible line-key codec (Core StoreSlice domain) ------
  // lineKey = the type's natural-key column VALUES joined by SEP; reversible so the Persistence Plan Builder can
  // reconstruct a structured naturalKey for a SUPERSEDED line that is no longer present in the current command.
  function buildLineKey(type, obj) {
    var cfg = typeCfg(type);
    return cfg.lineKey.map(function (c) {
      var v = str(obj[c]);
      aRange(v.length > 0, 'line natural-key part missing/blank: ' + c);
      aRange(v.indexOf(SEP) === -1, 'line natural-key part must not contain the reserved separator: ' + c);
      return v;
    }).join(SEP);
  }
  function splitLineKey(type, key) {
    var cfg = typeCfg(type);
    var parts = String(key).split(SEP);
    aRange(parts.length === cfg.lineKey.length, 'lineKey arity mismatch for ' + type);
    var o = {}; cfg.lineKey.forEach(function (c, i) { o[c] = parts[i]; });
    return o;
  }

  function mapGenerationType(mode) {
    aRange(MODE_TO_GENERATION_TYPE[mode] !== undefined, 'unsupported mode → generation_type: ' + mode);
    return MODE_TO_GENERATION_TYPE[mode];
  }

  function assertNoLiveAnalysisAuthority(row, where) {
    if (!row) return;
    Object.keys(row).forEach(function (k) {
      aRange(LIVE_ANALYSIS_FORBIDDEN[k] !== 1, 'live-analysis field may not be persisted as authority (' + where + '): ' + k);
    });
  }

  // ---- shared line projection ------------------------------------------------
  // Returns { commandLine, detail } for one resolved line fact. Blocked lines carry NO fabricated quantity.
  function projectLine(type, cfg, f, idx) {
    aType(isObj(f), 'lines[' + idx + '] must be an object');
    // natural-key components must all be present (from the resolved facts)
    var nkObj = {}; cfg.lineKey.forEach(function (c) { nkObj[c] = f[c]; });
    var lineKey = buildLineKey(type, nkObj);
    var blocked = f.blocked === true;
    if (blocked) {
      aType(typeof f.reason === 'string' && f.reason.length > 0, 'lines[' + idx + '] blocked requires a reason token');
    } else {
      aType(typeof f.recommendedQty === 'number', 'lines[' + idx + '].recommendedQty must be a number');
      aRange(isFinite(f.recommendedQty) && f.recommendedQty >= 0, 'lines[' + idx + '].recommendedQty must be finite ≥ 0');
    }
    // extra (non-core) persisted snapshot columns for this type — validated against the live-analysis boundary
    var extraRow = isObj(f.snapshotRow) ? f.snapshotRow : {};
    assertNoLiveAnalysisAuthority(extraRow, type + ' snapshotRow');
    // partial-carton exact value is preserved verbatim — never re-rounded (REQ_PO §37)
    var commandLine = { lineKey: lineKey, recommendedQty: blocked ? null : f.recommendedQty, lineState: blocked ? 'BLOCKED' : 'OK' };
    if (blocked) commandLine.reason = f.reason;
    if (f.demandKey !== undefined) commandLine.demandKey = f.demandKey;
    var detail = {
      lineKey: lineKey,
      naturalKey: nkObj,                              // structured (without the header id; Plan Builder adds it)
      row: extraRow,                                  // extra snapshot columns only (recommended_qty/decision added downstream)
      targetLineStatus: blocked ? 'blocked' : undefined,
      lineage: isObj(f.lineage) ? f.lineage : {},     // runtime-only lineage (demandKey/allocationKey/sourcePoolKey/…)
      blocked: blocked, reason: blocked ? f.reason : null
    };
    return { commandLine: commandLine, detail: detail };
  }

  // ---- public: build a recommendation command + detail map -------------------
  // input = { recommendationType, mode, planningCycle, businessScope, calculationRunId, formulaVersion,
  //           sourceDataAsOf, draftVersion, lines:[ resolved line facts ] }
  function buildRecommendation(input) {
    aType(isObj(input), 'input must be an object');
    var type = input.recommendationType;
    var cfg = typeCfg(type);
    var generationType = mapGenerationType(input.mode);
    aType(typeof input.planningCycle === 'string' && input.planningCycle.length > 0, 'planningCycle required');
    aType(isObj(input.businessScope), 'businessScope required');
    aType(typeof input.calculationRunId === 'string' && input.calculationRunId.length > 0, 'calculationRunId required');
    aType(Array.isArray(input.lines), 'lines must be an array');

    var seen = {}, commandLines = [], detailByKey = {};
    input.lines.forEach(function (f, i) {
      var p = projectLine(type, cfg, f, i);
      aRange(seen[p.commandLine.lineKey] !== 1, 'duplicate line natural key: ' + p.commandLine.lineKey);
      seen[p.commandLine.lineKey] = 1;
      commandLines.push(p.commandLine);
      detailByKey[p.commandLine.lineKey] = p.detail;
    });
    // stable ordering by lineKey (deterministic; independent of input order) — for BOTH the command lines and
    // the lineDetails key-insertion order, so the whole output serializes byte-identically regardless of input order.
    commandLines.sort(function (a, b) { return cmpStr(a.lineKey, b.lineKey); });
    var lineDetails = {};
    commandLines.forEach(function (l) { lineDetails[l.lineKey] = detailByKey[l.lineKey]; });

    var command = {
      recommendationType: type, mode: input.mode, planningCycle: input.planningCycle,
      businessScope: input.businessScope, recommendedLines: commandLines,
      calculationRunId: input.calculationRunId,
      formulaVersion: input.formulaVersion !== undefined ? input.formulaVersion : null,
      sourceDataAsOf: input.sourceDataAsOf !== undefined ? input.sourceDataAsOf : null
    };
    return {
      command: command,
      lineDetails: lineDetails,
      generationType: generationType,
      recommendationType: type,
      userQtyColumn: cfg.userQty
    };
  }

  return {
    SEP: SEP,
    MODE_TO_GENERATION_TYPE: (function () { var o = {}; for (var k in MODE_TO_GENERATION_TYPE) o[k] = MODE_TO_GENERATION_TYPE[k]; return o; })(),
    LIVE_ANALYSIS_FORBIDDEN: (function () { var o = {}; for (var k in LIVE_ANALYSIS_FORBIDDEN) o[k] = 1; return o; })(),
    mapGenerationType: mapGenerationType,
    buildLineKey: buildLineKey,
    splitLineKey: splitLineKey,
    assertNoLiveAnalysisAuthority: assertNoLiveAnalysisAuthority,
    buildRecommendation: buildRecommendation
  };
});
  __kmRegister("supply-planning-plan-builder", module.exports);
})();

// ----- module: supply-planning-persistence-plan-builder (verbatim from assets/js/core/supply-planning-persistence-plan-builder.js) -----
(function () {
  var require = __kmRequire;
  var module = { exports: {} };
  var exports = module.exports;
// Kitchen Mama Operation System — Recommendation PERSISTENCE PLAN BUILDER (Phase 2C, Round 1G).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC bridge that converts a Persistence-Core StoreSlice transition (prev → next) into the
// exact FROZEN PA-7 `PersistencePlan` (RRIS §Persist-Adapter) consumed by the production repository
// (`supply-planning-persistence-repository.js` applyPersistencePlan) and the locking orchestrator
// (`supply-planning-persistence-locking.js`). It is the missing StoreSlice → PersistencePlan glue named as the
// Round 1F-R C3 blocker. It recomputes NO business formula — it only diffs two StoreSlices by frozen natural key.
//
// Boundary (frozen): recommended_qty is written as an immutable per-version SNAPSHOT; the decision column
// (planned_qty / order_qty) carries the Core's already-merged user quantity (user edits preserved by the Core +
// repository — this bridge never overwrites a decision, never stamps user_edited=TRUE, never Submits). No Sheet /
// Range object may appear in the plan. No clock / no random. expectedToken is captured from the PRIOR persisted
// snapshot by the caller and passed through verbatim (never synthesized from the next StoreSlice).

(function (root, factory) {
  'use strict';
  var req = (typeof require !== 'undefined') ? require : null;
  var api = factory(
    req ? req('./supply-planning-persistence-repository.js') : (root.KMPR || (root.KM && root.KM.persistenceRepository)),
    req ? req('./supply-planning-plan-builder.js') : (root.KMPB || (root.KM && root.KM.planBuilder))
  );
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.persistencePlanBuilder = api; }
})(this, function (REPO, PB) {
  'use strict';

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function aType(c, m) { if (!c) throw new TypeError(m); }
  function aRange(c, m) { if (!c) throw new RangeError(m); }
  function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
  function str(v) { return String(v === undefined || v === null ? '' : v); }
  function clone(o) { var r = {}; for (var k in o) if (o.hasOwnProperty(k)) r[k] = o[k]; return r; }

  // Core line-status → repository line_status (targetLineStatus) mapping.
  var STATUS_MAP = { ACTIVE: 'active', BLOCKED: 'blocked', SUPERSEDED: 'superseded', SUPERSEDED_USER_REVIEW: 'superseded_user_review' };

  function typeCfg(type) { aRange(REPO && REPO.TABLES && REPO.TABLES[type], 'unknown recommendationType: ' + type); return REPO.TABLES[type]; }
  function indexByKey(lines) { var m = {}; (lines || []).forEach(function (l) { m[l.lineKey] = l; }); return m; }

  // Build the header row from identity + scope + generation_type + run lineage (no Sheet refs, no live analysis).
  function buildHeaderRow(type, cfg, draftId, scope, generationType, calcRunId, formulaVersion, sourceDataAsOf, draftVersion) {
    var row = {}; row[cfg.headerId] = draftId;
    cfg.scope.forEach(function (c) { row[c] = scope[c] === undefined || scope[c] === null ? '' : scope[c]; });
    row.status = 'draft';
    row.generation_type = generationType;
    row.calculation_run_id = calcRunId;
    row.formula_version = formulaVersion === undefined || formulaVersion === null ? '' : formulaVersion;
    row.source_data_as_of = sourceDataAsOf === undefined || sourceDataAsOf === null ? '' : sourceDataAsOf;
    row.draft_version = draftVersion;
    return row;
  }

  // buildPersistencePlan(args) → frozen PA-7 plan
  function buildPersistencePlan(args) {
    aType(isObj(args), 'args must be an object');
    var type = args.recommendationType, cfg = typeCfg(type);
    aType(isObj(args.identity) && typeof args.identity.draftId === 'string' && args.identity.draftId.length > 0, 'identity.draftId required');
    aType(isObj(args.nextStore) && Array.isArray(args.nextStore.lines) && Array.isArray(args.nextStore.drafts), 'nextStore StoreSlice required');
    var prevStore = isObj(args.prevStore) ? args.prevStore : { drafts: [], lines: [], runs: [] };
    aType(isObj(args.coreResult), 'coreResult required');
    aType(isObj(args.command), 'command required');
    aType(isObj(args.lineDetails), 'lineDetails required');
    aType(typeof args.generationType === 'string' && args.generationType.length > 0, 'generationType required');
    // expectedToken MUST come from the PRIOR persisted snapshot (captured pre-calculation) — never synthesized here.
    aType(isObj(args.expectedToken) && args.expectedToken.draft_version !== undefined && typeof args.expectedToken.userEditFingerprint === 'string', 'expectedToken (pre-calculation) required');

    var draftId = args.identity.draftId;
    var scope = isObj(args.command.businessScope) ? args.command.businessScope : {};
    var scopeWithCycle = clone(scope); if (args.command.planningCycle !== undefined) scopeWithCycle.planning_cycle = args.command.planningCycle;
    var businessScopeKey = args.identity.businessScopeKey || REPO.buildBusinessScopeKey(type, scopeWithCycle);
    var calcRunId = args.coreResult.calculationRunId || args.command.calculationRunId;
    var draftVersion = args.coreResult.draftVersion;
    aType(calcRunId, 'calculationRunId required (coreResult/command)');
    aType(draftVersion !== undefined, 'draftVersion required (coreResult)');

    // header op: INSERT when the draft did not exist in the prior persisted state; else UPDATE.
    var prevDraftExists = (prevStore.drafts || []).some(function (d) { return String(d.draftId) === String(draftId); });
    var headerOp = {
      op: prevDraftExists ? 'UPDATE' : 'INSERT',
      naturalKey: (function () { var k = {}; k[cfg.headerId] = draftId; return k; })(),
      row: buildHeaderRow(type, cfg, draftId, scopeWithCycle, args.generationType, calcRunId, args.command.formulaVersion, args.command.sourceDataAsOf, draftVersion)
    };

    var prevByKey = indexByKey(prevStore.lines.filter(function (l) { return String(l.draftId) === String(draftId); }));
    var nextLines = args.nextStore.lines.filter(function (l) { return String(l.draftId) === String(draftId); }).slice();
    nextLines.sort(function (a, b) { return cmpStr(str(a.lineKey), str(b.lineKey)); });

    var lineOps = [], lineageOps = [];
    nextLines.forEach(function (nl) {
      var lineKey = nl.lineKey;
      var nkComponents = PB.splitLineKey(type, lineKey);
      var naturalKey = clone(nkComponents); naturalKey[cfg.lineDraftId] = draftId;
      var nextStatus = nl.lineStatus;
      var prev = prevByKey[lineKey];

      if (nextStatus === 'SUPERSEDED' || nextStatus === 'SUPERSEDED_USER_REVIEW') {
        // emit SUPERSEDE only on the transition (idempotent: skip if already superseded in the prior state)
        if (prev && (prev.lineStatus === 'SUPERSEDED' || prev.lineStatus === 'SUPERSEDED_USER_REVIEW')) return;
        lineOps.push({ op: 'SUPERSEDE', naturalKey: naturalKey, targetLineStatus: STATUS_MAP[nextStatus] });
        return;
      }
      // ACTIVE or BLOCKED → INSERT (new) or UPDATE (existing)
      var detail = args.lineDetails[lineKey] || { row: {} };
      var blocked = nextStatus === 'BLOCKED';
      var row = clone(isObj(detail.row) ? detail.row : {});
      // frozen boundary: recommended_qty is the immutable snapshot; blocked lines carry NO fabricated qty.
      if (!blocked) {
        row.recommended_qty = (nl.recommendedQty === undefined || nl.recommendedQty === null) ? '' : nl.recommendedQty;
        if (nl.userQty !== undefined && nl.userQty !== null) row[cfg.userQty] = nl.userQty; // decision column (Core-merged, edits preserved)
      } else {
        row.recommended_qty = '';   // explicit blank — never 0
        if (detail.reason) row.recommendation_flags = row.recommendation_flags !== undefined ? row.recommendation_flags : detail.reason;
      }
      var op = prev && prev.lineStatus !== 'SUPERSEDED' && prev.lineStatus !== 'SUPERSEDED_USER_REVIEW' ? 'UPDATE' : (prev ? 'UPDATE' : 'INSERT');
      var lineOp = { op: op, naturalKey: naturalKey, row: row, targetLineStatus: blocked ? 'blocked' : 'active' };
      // on a system refresh over a user-edited line, do NOT overwrite the decision column (repository preserves).
      if (op === 'UPDATE' && prev && prev.userEdited === true) lineOp.preserveUserQty = true;
      lineOps.push(lineOp);
      lineageOps.push({ naturalKey: naturalKey });
    });

    // totals: taken from the Core-computed draft totals (single quantity authority) — no second computation here.
    var nextDraft = args.nextStore.drafts.filter(function (d) { return String(d.draftId) === String(draftId); })[0];
    var t = (nextDraft && nextDraft.totals) || {};
    var totals = {
      totalRecommendedQty: t.totalRecommendedQty || 0, totalUserQty: t.totalUserQty || 0,
      activeLineCount: t.activeLineCount || 0, blockedCount: t.blockedCount || 0, supersededCount: t.supersededCount || 0
    };

    var counts = args.coreResult.counts || {};
    var auditEvents = [{
      event: 'recommendation_draft_persisted', op: args.coreResult.action, recommendationType: type,
      draftId: draftId, calculationRunId: calcRunId, draftVersion: draftVersion, generationType: args.generationType,
      inserted: counts.created || 0, updated: counts.updated || 0, superseded: counts.superseded || 0,
      blocked: counts.blocked || 0, skipped: counts.skipped || 0
    }];

    var plan = {
      recommendationType: type,
      sourceTables: { header: cfg.header, lines: cfg.lines },
      draftId: draftId,
      activeKey: args.identity.activeKey || (type + '::' + businessScopeKey),
      calculationRunId: calcRunId,
      draftVersion: draftVersion,
      expectedToken: args.expectedToken,
      runMeta: {
        planning_cycle: args.command.planningCycle, business_scope_key: businessScopeKey,
        formulaVersion: args.command.formulaVersion, sourceDataAsOf: args.command.sourceDataAsOf, action: args.coreResult.action
      },
      headerOp: headerOp,
      lineOps: lineOps,
      lineageOps: lineageOps,
      totals: totals,
      stages: REPO.STAGES.slice(),
      auditEvents: auditEvents
    };
    // fail-closed: the plan must satisfy the frozen PA-7 validator before it is ever handed to the repository.
    REPO.validatePersistencePlan(plan);
    return plan;
  }

  return {
    STATUS_MAP: (function () { var o = {}; for (var k in STATUS_MAP) o[k] = STATUS_MAP[k]; return o; })(),
    buildPersistencePlan: buildPersistencePlan
  };
});
  __kmRegister("supply-planning-persistence-plan-builder", module.exports);
})();

// ----- module: supply-planning-recommendation-orchestrator (verbatim from assets/js/core/supply-planning-recommendation-orchestrator.js) -----
(function () {
  var require = __kmRequire;
  var module = { exports: {} };
  var exports = module.exports;
// Kitchen Mama Operation System — Recommendation ORCHESTRATOR bridge (Phase 2C, Round 1G).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC glue that runs the production recommendation generation flow end-to-end, tying together
// the already-frozen pure modules WITHOUT reimplementing any of them:
//   validate → active-draft + terminal guard → capture expectedToken (PRE-calc) → resolve source facts (injected)
//   → Plan Builder (KMPB) → Persistence Core (KMPC) → Persistence Plan Builder (KMPPB) → LOCKED repository apply.
// The lock primitive + Sheet I/O are INJECTED (deps.*): the Apps Script wrapper wires them to LockService + the
// KMPR/KMPL bundle; Node tests wire them to a fake lock + fake sheet. This module NEVER Submits / Sends Request /
// creates a Weekly Plan or PO / mutates a terminal Draft. No clock / no random.
//
// Identity is canonicalized on the Persistence Core's deterministic draftId (`KMPC.resolveActiveDraft`), and a
// prior persisted Draft is reconstructed into a Core StoreSlice by CORE-REPLAY (so all ids are Core-correct and
// this module copies no id formula). A repo Active Draft whose id is not the Core-canonical id is a FOREIGN /
// legacy draft and is refused (adopt-required) rather than silently duplicated.

(function (root, factory) {
  'use strict';
  var req = (typeof require !== 'undefined') ? require : null;
  var api = factory(
    req ? req('./supply-planning-persistence.js') : (root.KMPC || (root.KM && root.KM.persistence)),
    req ? req('./supply-planning-plan-builder.js') : (root.KMPB || (root.KM && root.KM.planBuilder)),
    req ? req('./supply-planning-persistence-plan-builder.js') : (root.KMPPB || (root.KM && root.KM.persistencePlanBuilder)),
    req ? req('./supply-planning-persistence-repository.js') : (root.KMPR || (root.KM && root.KM.persistenceRepository))
  );
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.recommendationOrchestrator = api; }
})(this, function (KMPC, KMPB, KMPPB, KMPR) {
  'use strict';

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function aType(c, m) { if (!c) throw new TypeError(m); }
  function aRange(c, m) { if (!c) throw new RangeError(m); }
  function num(v) { if (v === '' || v === null || v === undefined) return null; var n = Number(v); return isFinite(n) ? n : null; }
  function isBool(v) { return v === true || v === 'TRUE' || v === 'true'; }

  var TERMINAL = { submitted: 1, cancelled: 1 };
  var REPO_STATUS_TO_CORE = { active: 'ACTIVE', blocked: 'BLOCKED', superseded: 'SUPERSEDED', superseded_user_review: 'SUPERSEDED_USER_REVIEW', '': 'ACTIVE', draft: 'ACTIVE' };

  function res(status, extra) {
    var d = { status: status, success: status === 'COMPLETED', reason: null, draftId: null, calculationRunId: null, draftVersion: null, generationType: null, coreAction: null, lock: null, wrote: status === 'COMPLETED' };
    if (extra) for (var k in extra) if (extra.hasOwnProperty(k)) d[k] = extra[k];
    return d;
  }

  // Reconstruct a prior persisted Draft into a Core StoreSlice by REPLAYING it through the Core (ids stay
  // Core-correct). Only non-superseded (active/blocked) lines seed the base; prior user edits are re-applied so a
  // scheduled refresh preserves them and a removed edited line supersedes to _user_review.
  function storeSliceFromRepoSnapshot(snapshot, type, planningCycle, businessScope) {
    if (!snapshot || !snapshot.draft) return KMPC.createStore();
    var base = [];
    (snapshot.lines || []).forEach(function (l) {
      var st = String(l.lineStatus || '').trim();
      if (st === 'superseded' || st === 'superseded_user_review') return;
      var raw = l.raw || {};
      var lineKey = KMPB.buildLineKey(type, raw);
      if (st === 'blocked') { base.push({ lineKey: lineKey, lineState: 'BLOCKED', reason: String(raw.recommendation_flags || raw.recommendation_reason || 'BLOCKED') }); }
      else { base.push({ lineKey: lineKey, recommendedQty: num(raw.recommended_qty) === null ? 0 : num(raw.recommended_qty), lineState: 'OK' }); }
    });
    var g0 = KMPC.generateRecommendationDraft(KMPC.createStore(), {
      recommendationType: type, mode: 'SCHEDULED_REFRESH', planningCycle: planningCycle, businessScope: businessScope, recommendedLines: base
    });
    var store = g0.store, draftId = g0.result.draftId, cfg = KMPR.TABLES[type];
    // re-apply prior user edits (explicit provenance only — never inferred)
    (snapshot.lines || []).forEach(function (l) {
      var st = String(l.lineStatus || '').trim();
      if (st === 'superseded' || st === 'superseded_user_review') return;
      if (!isBool(l.userEdited)) return;
      var raw = l.raw || {}; var q = num(raw[cfg.userQty]);
      if (q !== null) { try { KMPC.applyUserEdit(store, { draftId: draftId, lineKey: KMPB.buildLineKey(type, raw), userQty: q, actor: String(raw.user_edited_by || 'user') }); } catch (e) { /* line absent (blocked) — skip */ } }
    });
    // carry the true persisted version so a refresh/regenerate versions correctly
    var d = store.drafts[0]; if (d) d.draftVersion = num(snapshot.draft.draft_version) === null ? d.draftVersion : num(snapshot.draft.draft_version);
    return store;
  }

  // Pure keyed-delta write planner for the Apps Script wrapper: given the sheet rows BEFORE and AFTER the pure
  // repository apply, return ONLY the changed rows (targeted updates) + appended rows — never a full-table rewrite.
  function computeKeyedDeltaWrites(before, after) {
    aType(Array.isArray(before) && Array.isArray(after), 'before/after must be arrays');
    var updates = [], appends = [];
    for (var i = 0; i < before.length && i < after.length; i++) {
      if (JSON.stringify(before[i]) !== JSON.stringify(after[i])) updates.push({ rowIndex: i, values: after[i] });
    }
    for (var j = before.length; j < after.length; j++) appends.push(after[j]);
    return { updates: updates, appends: appends, unchanged: before.length - updates.length };
  }

  // runRecommendationGeneration(input, deps) — the production bridge (locked write path).
  //   input = { recommendationType, mode, planningCycle, businessScope, confirmRegenerateOverUserEdits?, actor?, now? }
  //   deps  = { loadActiveContext(query), loadPriorSnapshot(draftId), computeFacts(query), lockedApply(plan, token, opts) }
  function runRecommendationGeneration(input, deps) {
    aType(isObj(input), 'input must be an object');
    var type = input.recommendationType;
    aRange(KMPR.TABLES[type], 'unknown recommendationType: ' + type);
    aRange(input.mode === 'SCHEDULED_REFRESH' || input.mode === 'MANUAL_REGENERATE', 'unsupported mode: ' + input.mode);
    aType(typeof input.planningCycle === 'string' && input.planningCycle.length > 0, 'planningCycle required');
    aType(isObj(input.businessScope), 'businessScope required');
    aType(isObj(deps) && typeof deps.loadActiveContext === 'function' && typeof deps.computeFacts === 'function' && typeof deps.lockedApply === 'function', 'deps.loadActiveContext/computeFacts/lockedApply required');
    var query = { recommendationType: type, planningCycle: input.planningCycle, businessScope: input.businessScope };

    // Core-canonical identity (deterministic, independent of the sheet).
    var canonical = KMPC.resolveActiveDraft(KMPC.createStore(), query); // {status:'CREATE', activeKey, draftId}
    var canonicalDraftId = canonical.draftId, activeKey = canonical.activeKey;

    // Active-draft lookup on the persisted sheet + fail-closed duplicate/foreign guard (scope-level).
    var active = deps.loadActiveContext(query);
    if (isObj(active) && active.status === 'BLOCKED_CONFLICT') return res('BLOCKED_CONFLICT', { reason: 'DUPLICATE_ACTIVE_DRAFT', draftId: canonicalDraftId, matchCount: active.matchCount });
    if (isObj(active) && active.status === 'REUSE' && String(active.draftId) !== String(canonicalDraftId)) return res('BLOCKED_CONFLICT', { reason: 'FOREIGN_DRAFT_ADOPT_REQUIRED', draftId: canonicalDraftId, foundDraftId: active.draftId });

    // Load the CANONICAL-id snapshot ALWAYS (even if the scope lookup said CREATE) so a terminal (submitted/
    // cancelled) draft occupying the canonical id is never silently mutated by a header UPSERT (fail-closed).
    var priorSnapshot = typeof deps.loadPriorSnapshot === 'function' ? deps.loadPriorSnapshot(canonicalDraftId) : null;
    var priorDraft = priorSnapshot && priorSnapshot.draft ? priorSnapshot.draft : null;
    // Generation must not (re)generate over a header carrying committed lines. Shared KMPR vocabulary:
    // submitted/cancelled = fully terminal; partially_submitted = generation-blocked (has committed lines).
    if (priorDraft && KMPR.isGenerationBlockedStatus(priorDraft.status)) {
      var ps = String(priorDraft.status).trim().toLowerCase();
      var rsn = KMPR.isTerminalDraftStatus(ps) ? ('IMMUTABLE_TERMINAL_STATUS:' + ps) : ('GENERATION_BLOCKED_STATUS:' + ps);
      return res('BLOCKED_CONFLICT', { reason: rsn, draftId: canonicalDraftId });
    }
    var reuse = !!priorDraft;
    var priorVersion = priorSnapshot && priorSnapshot.draft ? (num(priorSnapshot.draft.draft_version) === null ? 1 : num(priorSnapshot.draft.draft_version)) : 1;
    var priorTokenLines = priorSnapshot ? (priorSnapshot.lines || []).map(function (l) { return { lineKey: l.lineKey, userQty: l.userQty, userEdited: l.userEdited }; }) : [];
    var expectedToken = KMPR.computeExpectedToken(priorVersion, priorTokenLines);

    // Resolve source facts (INJECTED). Missing/unready source → blocked result, NEVER fabricated zero.
    var facts = deps.computeFacts(query);
    aType(isObj(facts) && Array.isArray(facts.lines), 'computeFacts must return { lines:[...] }');
    if (facts.ready === false) return res('BLOCKED_CONFLICT', { reason: 'SOURCE_NOT_READY:' + (facts.reason || 'UNKNOWN'), draftId: canonicalDraftId });

    // Plan Builder → recommendation command + detail map (recommendation snapshot only; live analysis excluded).
    var built = KMPB.buildRecommendation({
      recommendationType: type, mode: input.mode, planningCycle: input.planningCycle, businessScope: input.businessScope,
      calculationRunId: 'PENDING', formulaVersion: facts.formulaVersion, sourceDataAsOf: facts.sourceDataAsOf, draftVersion: 1, lines: facts.lines
    });
    built.command.confirmRegenerateOverUserEdits = input.confirmRegenerateOverUserEdits === true;

    // Prior store (Core-replay) + Persistence Core generate.
    var priorStore = reuse && priorSnapshot ? storeSliceFromRepoSnapshot(priorSnapshot, type, input.planningCycle, input.businessScope) : KMPC.createStore();
    var gen = KMPC.generateRecommendationDraft(priorStore, built.command);
    if (gen.result.status === 'BLOCKED') return res('BLOCKED_CONFLICT', { reason: gen.result.reason, draftId: canonicalDraftId, draftVersion: gen.result.draftVersion, generationType: built.generationType, coreAction: 'BLOCKED' });

    // Persistence Plan Builder → PA-7 diff.
    var plan = KMPPB.buildPersistencePlan({
      recommendationType: type, identity: { draftId: gen.result.draftId, activeKey: activeKey, businessScopeKey: KMPR.buildBusinessScopeKey(type, withCycle(input.planningCycle, input.businessScope)) },
      prevStore: priorStore, nextStore: gen.store, coreResult: gen.result, command: built.command, lineDetails: built.lineDetails,
      generationType: built.generationType, expectedToken: expectedToken, actor: input.actor || 'system', now: input.now || ''
    });

    // LOCKED apply (injected). The plan is NEVER applied outside this call.
    var lock = deps.lockedApply(plan, expectedToken, { actor: input.actor || 'system', now: input.now || '', generationType: built.generationType, recommendationType: type, draftId: gen.result.draftId });
    var okStatus = lock && lock.status === 'COMPLETED';
    return res(okStatus ? 'COMPLETED' : (lock && lock.status) || 'FAILED', {
      reason: okStatus ? null : (lock && lock.reason) || 'LOCKED_APPLY_FAILED',
      draftId: gen.result.draftId, calculationRunId: gen.result.calculationRunId, draftVersion: gen.result.draftVersion,
      generationType: built.generationType, coreAction: gen.result.action, lock: lock, wrote: okStatus
    });
  }

  function withCycle(cycle, scope) { var o = {}; for (var k in scope) o[k] = scope[k]; o.planning_cycle = cycle; return o; }

  return {
    TERMINAL: { submitted: 1, cancelled: 1 },
    storeSliceFromRepoSnapshot: storeSliceFromRepoSnapshot,
    computeKeyedDeltaWrites: computeKeyedDeltaWrites,
    runRecommendationGeneration: runRecommendationGeneration
  };
});
  __kmRegister("supply-planning-recommendation-orchestrator", module.exports);
})();

// ----- module: supply-planning-user-edit (verbatim from assets/js/core/supply-planning-user-edit.js) -----
(function () {
  var require = __kmRequire;
  var module = { exports: {} };
  var exports = module.exports;
// Kitchen Mama Operation System — Recommendation USER DECISION EDIT (locked) command (Phase 2C, Round 1H).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC orchestrator for the FOCUSED user-decision-edit command (edit planned_qty / order_qty /
// carton / method / note / ETA on an existing Recommendation Draft). It is deliberately SEPARATE from engine
// generation (a simple quantity edit must NEVER be mapped to a full recalculation): it does NOT build a
// PersistencePlan, does NOT create a calculation run, and does NOT change draft_version.
//
// It enforces the canonical write boundary shared with the generation path: acquire ScriptLock → reload the
// Draft + lines UNDER the lock → terminal-status guard (submitted/cancelled block ALL) → optimistic-token
// revalidation → targeted natural-key edit via KMPR.applyUserDecisionEdits (allowlisted decision fields +
// explicit user_edited/user_edited_by; recommended_qty snapshot + lineage preserved; terminal lines never
// touched) → release in finally (exactly once after acquisition). The lock primitive + Sheet I/O are INJECTED
// (deps.*): the Apps Script wrapper wires LockService + the KMPR bundle + a keyed-delta write; Node tests wire a
// fake lock + fake sheet. Shares KMPR's SINGLE terminal-status helper — no terminal token list is duplicated.
// No clock / no random. Result DTO shares the frozen vocabulary { COMPLETED | LOCK_UNAVAILABLE | CONFLICT |
// BLOCKED_CONFLICT | FAILED }.

(function (root, factory) {
  'use strict';
  var req = (typeof require !== 'undefined') ? require : null;
  var api = factory(req ? req('./supply-planning-persistence-repository.js') : (root.KMPR || (root.KM && root.KM.persistenceRepository)));
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.userEdit = api; }
})(this, function (KMPR) {
  'use strict';

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function aType(c, m) { if (!c) throw new TypeError(m); }
  function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
  function errMsg(e) { return (e && e.message !== undefined && e.message !== null) ? String(e.message) : String(e); }
  function tokenEq(a, b) { return !!a && !!b && String(a.draft_version) === String(b.draft_version) && String(a.userEditFingerprint) === String(b.userEditFingerprint); }

  var STATUS = { COMPLETED: 'COMPLETED', LOCK_UNAVAILABLE: 'LOCK_UNAVAILABLE', CONFLICT: 'CONFLICT', BLOCKED_CONFLICT: 'BLOCKED_CONFLICT', FAILED: 'FAILED' };
  var REQUIRED_DEPS = ['acquireLock', 'releaseLock', 'reloadSnapshot', 'recomputeToken', 'applyEdits'];

  // runUserDecisionEdit(command, deps)
  //   command = { recommendationType, draftId, edits:[{naturalKey, fields, recommendedSnapshot?}], reconcile?,
  //               expectedToken:{draft_version,userEditFingerprint}, actor?, now? }
  //   deps = { acquireLock():bool, releaseLock(), reloadSnapshot():{draft,lines}, recomputeToken(snap):token,
  //            applyEdits(command):{status,counts}, audit? }
  function runUserDecisionEdit(command, deps) {
    aType(isObj(command), 'command must be an object');
    aType(KMPR.TABLES[command.recommendationType], 'unknown recommendationType');
    aType(typeof command.draftId === 'string' && command.draftId.length > 0, 'command.draftId required');
    aType(Array.isArray(command.edits) && command.edits.length > 0, 'command.edits must be a non-empty array');
    aType(isObj(command.expectedToken) && command.expectedToken.draft_version !== undefined && typeof command.expectedToken.userEditFingerprint === 'string', 'command.expectedToken required (pre-edit)');
    aType(isObj(deps), 'deps required');
    REQUIRED_DEPS.forEach(function (fn) { aType(typeof deps[fn] === 'function', 'deps.' + fn + ' required'); });

    var issues = [];
    var draftId = command.draftId, expected = command.expectedToken;
    function audit(ev) { if (typeof deps.audit === 'function') { try { deps.audit(ev); } catch (ae) { issues.push('AUDIT_FAILED:' + errMsg(ae)); } } }
    function dto(status, extra) {
      var d = { success: status === STATUS.COMPLETED, status: status, reason: null, draftId: draftId, applied: false, conflict: false, counts: null, issues: [] };
      if (extra) for (var k in extra) if (extra.hasOwnProperty(k)) d[k] = extra[k];
      return d;
    }
    function finish(d) { d.issues = issues.slice().sort(cmpStr); audit({ event: 'user_decision_edit_result', status: d.status, reason: d.reason, draftId: draftId }); return d; }

    // acquire (outside try: no release if not acquired)
    var acquired = false, acqErr = null;
    try { acquired = deps.acquireLock() === true; } catch (e) { acqErr = e; }
    if (acqErr) return finish(dto(STATUS.LOCK_UNAVAILABLE, { reason: 'LOCK_ERROR:' + errMsg(acqErr) }));
    if (!acquired) return finish(dto(STATUS.LOCK_UNAVAILABLE, { reason: 'LOCK_UNAVAILABLE' }));

    var result = null;
    try {
      var snap = deps.reloadSnapshot();
      if (!snap || !snap.draft) { result = dto(STATUS.CONFLICT, { reason: 'DRAFT_NOT_FOUND', conflict: true }); }
      else if (KMPR.isTerminalDraftStatus(snap.draft.status)) { result = dto(STATUS.BLOCKED_CONFLICT, { reason: 'IMMUTABLE_TERMINAL_STATUS:' + String(snap.draft.status).trim().toLowerCase(), conflict: true }); }
      else {
        var live = deps.recomputeToken(snap);
        if (!tokenEq(live, expected)) { result = dto(STATUS.CONFLICT, { reason: 'CONCURRENCY_TOKEN_MISMATCH', conflict: true, expectedToken: expected, liveToken: live }); }
        else {
          var r = deps.applyEdits(command);
          if (r && r.status === 'APPLIED') { result = dto(STATUS.COMPLETED, { reason: null, applied: r.counts || true, counts: r.counts || null }); }
          else if (r && (r.status === 'DUPLICATE_LINE_KEY' || r.status === 'INVALID_EDIT_FIELD' || r.status === 'LINE_NOT_FOUND')) { result = dto(STATUS.CONFLICT, { reason: r.reason || r.status, conflict: true, counts: r.counts || null }); }
          else { result = dto(STATUS.FAILED, { reason: (r && (r.reason || r.status)) || 'APPLY_EDITS_FAILED' }); }
        }
      }
    } catch (e2) {
      result = dto(STATUS.FAILED, { reason: 'EXCEPTION:' + errMsg(e2) });
    } finally {
      try { deps.releaseLock(); } catch (re) { issues.push('RELEASE_FAILED:' + errMsg(re)); }
    }
    if (!result) result = dto(STATUS.FAILED, { reason: 'NO_RESULT' });
    return finish(result);
  }

  return {
    STATUS: { COMPLETED: 'COMPLETED', LOCK_UNAVAILABLE: 'LOCK_UNAVAILABLE', CONFLICT: 'CONFLICT', BLOCKED_CONFLICT: 'BLOCKED_CONFLICT', FAILED: 'FAILED' },
    REQUIRED_DEPS: REQUIRED_DEPS.slice(),
    runUserDecisionEdit: runUserDecisionEdit
  };
});
  __kmRegister("supply-planning-user-edit", module.exports);
})();

// ----- Apps Script global namespace exposure -----
var KMCALC = __kmModules["supply-planning-calculations"];
var KMQI = __kmModules["supply-planning-qualified-incoming"];
var KMLEDGER = __kmModules["supply-planning-ledgers"];
var KMALLOC = __kmModules["supply-planning-allocations"];
var KMLINE = __kmModules["supply-planning-line-runtime"];
var KMINC = __kmModules["supply-planning-incoming-adapters"];
var KMEXT = __kmModules["supply-planning-external-incoming-adapters"];
var KMCAND = __kmModules["supply-planning-supply-candidates"];
var KMPC = __kmModules["supply-planning-persistence"];
var KMPR = __kmModules["supply-planning-persistence-repository"];
var KMPL = __kmModules["supply-planning-persistence-locking"];
var KMPB = __kmModules["supply-planning-plan-builder"];
var KMPPB = __kmModules["supply-planning-persistence-plan-builder"];
var KMORCH = __kmModules["supply-planning-recommendation-orchestrator"];
var KMUE = __kmModules["supply-planning-user-edit"];

// KM_BUNDLE_INFO — introspectable manifest for load tests + deploy verification.
var KM_BUNDLE_INFO = {"bundleHash":"69296550705b3eabb8243e672bb5c47e833a5d1558ae37bd4cc622541c84cb9f","modules":[{"module":"supply-planning-calculations","sha256":"997f6a5224658038a24599a6af9aff2fda98726d04f4f45cee8ba298b2deb430"},{"module":"supply-planning-qualified-incoming","sha256":"241b8c87ed48522998fc29f5db5aa383ecdb872d83b2c933a49f50c77f43b6d7"},{"module":"supply-planning-ledgers","sha256":"3841ab3fe9d5922dad544677e87dd9f2b8507da50c385abb51ae5a071e89a042"},{"module":"supply-planning-allocations","sha256":"79194d50c2dbfb1ea4ebc0f46def5229a85012569956b66f7dffa1e01b8fd911"},{"module":"supply-planning-line-runtime","sha256":"0e0b9c3f60d590f7351d541b8c0de9ae6d8d344c882864c7c2fe8dbbca5301c8"},{"module":"supply-planning-incoming-adapters","sha256":"6132c0bc3b30dd4e94e2198e07cbc29571e1c5bf2bd6b8836d5b631c0c1f6dc0"},{"module":"supply-planning-external-incoming-adapters","sha256":"ca1cb707ee5ad5ad4437bbc6a3c4056796c340ec278ba8a55803f56aa25b0d93"},{"module":"supply-planning-supply-candidates","sha256":"c5560130b507eccc4f0a90fc413c6c66942d221bae897f15d5d3051a2c4f7d79"},{"module":"supply-planning-persistence","sha256":"e8f4ca1caf9dffe9c7882867fe8ebbeb7fa17844f81d9e5f7ebb2525126cc1a6"},{"module":"supply-planning-persistence-repository","sha256":"f94f7953d9cd2feeec748dea375b1f836060b9f83e3d39a70bec5a3d062ec4e6"},{"module":"supply-planning-persistence-locking","sha256":"ab2a383e64a5f113c26281cb8b56c82c69dacd969ad25dcc41fbc4c5fb00b12b"},{"module":"supply-planning-plan-builder","sha256":"7ae3793686e90970a7b525159d64a99a532843e350da2d7995688f763b26f914"},{"module":"supply-planning-persistence-plan-builder","sha256":"c4167ea6ba7fb1487674e8f2920b5c28755d274cc8fcfca487991c0d94119304"},{"module":"supply-planning-recommendation-orchestrator","sha256":"23f1cf9ab336f6fb5a7bdb6e81010adb1cb2b97d78b68be31a9692132471b192"},{"module":"supply-planning-user-edit","sha256":"365702d00a5c1ac9544a6086504b2e4961de1129fe3619eace8054ef34172693"}]};
