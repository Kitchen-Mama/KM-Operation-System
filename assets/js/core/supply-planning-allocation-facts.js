// Kitchen Mama Operation System — Allocation-Fact Producer Runtime (Phase F1-5-A).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC producer of the previously-unimplemented CALLER-OWNED planning facts the frozen
// Recommendation Runtime consumes (`receiverFacts` / `factoryDemandFacts` / `planningFacts` — the exact DTO shapes
// read by `projectAllocationInputs` / `resolveWeeklyRecommendationFacts` / `resolveMonthlyRecommendationFacts`).
//
// It AUTHORS NO business formula. Every arithmetic value is produced by the ALREADY-FROZEN owner, invoked here:
//   • daily demand  — §22 `normalizedAvgSalesPerDay` (Sales-Driven) / §2D `calculateForecastDrivenRemainingNeed`
//                     `.forecastDailyDemand` (Forecast-Driven).  [KMCALC]
//   • survival      — NOT recomputed here: the fact carries `dailyDemand`; the SINGLE owner of
//                     `survivalNeedQty = CEILING(18 × dailyDemand)` (§20.3/§24.4) is the frozen consumer
//                     `projectAllocationInputs` (source-facts.js). No second copy of that formula is created (§2).
//   • demand weight — §7 / §24.5 proportional SHARE `basis_i ÷ Σ_group basis_i` over the allocation group
//                     (company + country). Sales-Driven basis = the §22 run-rate; Forecast-Driven basis = the
//                     rolling-4-month FC share quantity, which is a CALLER-OWNED seam (the §7 window anchor is not
//                     pinned in the canonical spec — never guessed here).
//   • gap / net-order-need — NOT computed here: the planning fact carries the four raw inputs (demand /
//                     destinationCurrentStock / timelyQualifiedIncoming / timelyApprovedCommittedSupply) and the
//                     frozen resolver invokes `calculateGap` (§31) / `sumRemainingShortages` (§12/§32) itself.
// The producer OWNS only: warehouse-side eligibility PREDICATES (§23.6/§24.9 pool, §35/§40 factory), the share
// normalization (§7/§24.5), receiver decomposition (§25.1 demand grain), caller-owned-seam resolution
// (destination §D-3, required-by §6, demand driver, FC-share basis), fact-DTO assembly, and structured issues.
//
// CALLER-OWNED SEAMS (never inferred / never fake-defaulted — a missing seam is a structured issue, never 0/true):
//   destinationWarehouseId (D-3 / SC-11.3) · requiredByDate + windowCode (§6) · demandDriver (Sales vs Forecast —
//   no canonical classifier/column exists) · forecastShareQty (the §7 rolling-4-month FC basis anchor).
// No clock / no Math.random / no locale / no SpreadsheetApp / no DB / no persistence. Input never mutated; JSON-safe
// deterministic output; MISSING is never silently 0 (only an explicit source 0 is 0).

(function (root, factory) {
  'use strict';
  var req = (typeof require !== 'undefined') ? require : null;
  var api = factory(
    req ? req('./supply-planning-calculations.js') : (root.KMCALC || (root.KM && root.KM.core && root.KM.core.supplyPlanningCalculations))
  );
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.allocationFacts = api; }
})(this, function (CALC) {
  'use strict';

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function aType(c, m) { if (!c) throw new TypeError(m); }
  function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
  function nonEmpty(v) { return str(v).length > 0; }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function cmpStr(a, b) { a = str(a); b = str(b); return a < b ? -1 : a > b ? 1 : 0; }
  function finiteNonNeg(v) { if (v === '' || v === null || v === undefined) return null; var n = Number(v); return (isFinite(n) && n >= 0) ? n : null; }

  var DEMAND_DRIVERS = { SALES_DRIVEN: 1, FORECAST_DRIVEN: 1 };
  var OVERSEAS_POOL_TYPES = { FBA: 1, THREE_PL: 1 };
  // FBA composition (§24.1/§24.9): platform / hybrid marketplaces carry an FBA Current-Stock lane.
  var FBA_FULFILLMENT = { platform_fulfilled: 1, hybrid: 1 };
  var THREE_PL_FULFILLMENT = { self_fulfilled: 1, hybrid: 1 }; // self / hybrid participate in shared 3PL

  // ---- warehouse-side eligibility predicates (OWNED here — §23.6/§24.9 pool, §35/§40 factory) ---------------
  // §23.6/§24.9: THREE_PL reserve participation is warehouse-side: company + country + warehouse_type='3PL' + is_active.
  function threePlEligible(warehouses, company, country) {
    for (var i = 0; i < warehouses.length; i++) {
      var w = warehouses[i];
      if (str(w.warehouse_type).toUpperCase() === '3PL' && truthyFlag(w.is_active) &&
        str(w.company) === company && (country === '' || str(w.country) === country)) return true;
    }
    return false;
  }
  // §35/§40: factory eligibility = is_factory_warehouse + is_active (shared source; company-agnostic per D-1).
  function eligibleFactoryWarehouseIds(warehouses) {
    var seen = {}, out = [];
    for (var i = 0; i < warehouses.length; i++) {
      var w = warehouses[i];
      if (truthyFlag(w.is_factory_warehouse) && truthyFlag(w.is_active)) {
        var id = str(w.warehouse_id);
        if (nonEmpty(id) && !seen[id]) { seen[id] = 1; out.push(id); }
      }
    }
    out.sort(cmpStr);
    return out;
  }
  function truthyFlag(v) { if (v === true) return true; var s = str(v).toLowerCase(); return s === 'true' || s === '1' || s === 'yes' || s === 'y'; }

  // §23.6/§24.9 pool eligibility for a receiver: FBA lane by fulfillment composition + THREE_PL by warehouse-side.
  function eligiblePoolTypesFor(fulfillmentModel, threePlOk) {
    var pools = [];
    if (FBA_FULFILLMENT[fulfillmentModel] === 1) pools.push('FBA');
    if (THREE_PL_FULFILLMENT[fulfillmentModel] === 1 && threePlOk) pools.push('THREE_PL');
    // platform_fulfilled ALSO participates in the shared 3PL RESERVE when warehouse-eligible (§24 addendum 2026-07-22).
    if (fulfillmentModel === 'platform_fulfilled' && threePlOk && pools.indexOf('THREE_PL') === -1) pools.push('THREE_PL');
    var seen = {}, out = [];
    pools.forEach(function (p) { if (OVERSEAS_POOL_TYPES[p] === 1 && !seen[p]) { seen[p] = 1; out.push(p); } });
    out.sort(cmpStr);
    return out;
  }

  // ---- daily demand — INVOKE the frozen owner (§22 sales / §2D forecast); never reimplemented -----------------
  function deriveDailyDemand(r, driver, calculationDate, recvIssues, key) {
    if (driver === 'SALES_DRIVEN') {
      var sb = r.salesBasis;
      if (!isObj(sb)) { recvIssues.push(issue('DAILY_DEMAND_SOURCE_MISSING', key, 'Sales-Driven receiver has no salesBasis for §22 run-rate')); return null; }
      var res = CALC.normalizedAvgSalesPerDay({
        calcDate: nonEmpty(sb.calcDate) ? str(sb.calcDate) : str(calculationDate),
        scope: sb.scope, weekly7d: sb.weekly7d, dailySales: sb.dailySales || [],
        campaigns: sb.campaigns || [], events: sb.events || []
      });
      var dd = finiteNonNeg(res.avgSalesPerDay);
      if (dd === null) { recvIssues.push(issue('INVALID_DAILY_DEMAND', key, 'normalizedAvgSalesPerDay returned a non-finite avgSalesPerDay')); return null; }
      return { dailyDemand: dd, runRateSource: res.source, runRateWarning: res.warning };
    }
    if (driver === 'FORECAST_DRIVEN') {
      var fb = r.forecastBasis;
      if (!isObj(fb)) { recvIssues.push(issue('DAILY_DEMAND_SOURCE_MISSING', key, 'Forecast-Driven receiver has no forecastBasis for §2D')); return null; }
      var fres = CALC.calculateForecastDrivenRemainingNeed({
        forecastMonth1: fb.forecastMonth1, forecastMonth2: fb.forecastMonth2, targetRules: fb.targetRules,
        specialEventDemand: fb.specialEventDemand,
        destinationCurrentStock: 0, timelyQualifiedIncoming: 0, timelyApprovedCommittedSupply: 0
      });
      var fdd = finiteNonNeg(fres.forecastDailyDemand);
      if (fdd === null) { recvIssues.push(issue('INVALID_DAILY_DEMAND', key, 'calculateForecastDrivenRemainingNeed returned a non-finite forecastDailyDemand')); return null; }
      return { dailyDemand: fdd, forecastTotalDemand: fres.totalForecastDrivenDemand };
    }
    // no valid driver → the weight/demand basis cannot be resolved without guessing the mode (no canonical classifier).
    recvIssues.push(issue('DEMAND_WEIGHT_UNRESOLVED', key, 'receiver has no valid demandDriver (SALES_DRIVEN|FORECAST_DRIVEN); the Sales-vs-Forecast classifier is caller-owned and has no canonical column'));
    return null;
  }

  // §7 / §24.5 weight BASIS per receiver: Sales-Driven = run-rate (dailyDemand); Forecast-Driven = caller-owned
  // rolling-4-month FC share qty (`forecastBasis.forecastShareQty`) — the §7 window anchor is NOT canonically pinned,
  // so it is a seam, never derived/guessed here.
  function weightBasisFor(r, driver, dailyDemand, recvIssues, key) {
    if (driver === 'SALES_DRIVEN') return dailyDemand; // run-rate share basis (§24.5)
    if (driver === 'FORECAST_DRIVEN') {
      var fb = r.forecastBasis || {};
      var b = finiteNonNeg(fb.forecastShareQty);
      if (b === null) { recvIssues.push(issue('DEMAND_WEIGHT_UNRESOLVED', key, 'Forecast-Driven weight needs forecastBasis.forecastShareQty (§7 rolling-4-month FC basis; window anchor caller-owned, never guessed)')); return null; }
      return b;
    }
    return null;
  }

  function issue(code, ref, message) { return { code: code, ref: ref === undefined ? null : ref, message: message, details: {} }; }
  function resolveDestination(r, routing, scope) {
    if (nonEmpty(r.destinationWarehouseId)) return str(r.destinationWarehouseId);
    if (nonEmpty(routing[str(r.demandRef)])) return str(routing[str(r.demandRef)]);
    if (nonEmpty(scope.destinationWarehouseId)) return str(scope.destinationWarehouseId);
    return null;
  }

  function projectAllocationFacts(input) {
    aType(isObj(input), 'projectAllocationFacts: input must be an object');
    aType(isObj(input.businessScope), 'projectAllocationFacts: input.businessScope required');
    var type = str(input.recommendationType);
    aType(type === 'WEEKLY_SHIPPING' || type === 'MONTHLY_ORDER', 'projectAllocationFacts: recommendationType must be WEEKLY_SHIPPING | MONTHLY_ORDER');
    var scope = input.businessScope;
    var company = str(scope.company);
    var country = str(scope.country);
    aType(nonEmpty(company), 'projectAllocationFacts: businessScope.company required');
    var calculationDate = nonEmpty(input.calculationDate) ? str(input.calculationDate) : null;
    var receivers = Array.isArray(input.receivers) ? input.receivers : [];
    var warehouses = Array.isArray(input.warehouses) ? input.warehouses : [];
    var routing = isObj(input.routing) ? input.routing : {};

    var issues = [];
    var threePlOk = threePlEligible(warehouses, company, country);
    var factoryIds = eligibleFactoryWarehouseIds(warehouses);

    if (type === 'MONTHLY_ORDER') return buildMonthly(input, scope, company, receivers, routing, factoryIds, issues);
    return buildWeekly(input, scope, company, country, calculationDate, receivers, warehouses, routing, threePlOk, issues);
  }

  // ---- WEEKLY_SHIPPING: receiverFacts (overseas allocation) + weeklyPlanningFacts -----------------------------
  function buildWeekly(input, scope, company, country, calculationDate, receivers, warehouses, routing, threePlOk, issues) {
    var stage = []; // {r, key, dailyDemand, basis, pools, dest, fulfillmentModel, priority, recvIssues, extra}
    for (var i = 0; i < receivers.length; i++) {
      var r = receivers[i]; aType(isObj(r), 'projectAllocationFacts: receivers[' + i + '] must be an object');
      var key = nonEmpty(r.receiverKey) ? str(r.receiverKey) : ('@' + i);
      var recvIssues = [];
      if (!nonEmpty(r.receiverKey)) recvIssues.push(issue('RECEIVER_IDENTITY_INCOMPLETE', key, 'receiverKey required'));
      if (!nonEmpty(r.demandRef)) recvIssues.push(issue('RECEIVER_IDENTITY_INCOMPLETE', key, 'demandRef required'));
      var driver = str(r.demandDriver).toUpperCase();
      if (!DEMAND_DRIVERS[driver]) driver = '';
      var dd = deriveDailyDemand(r, driver, calculationDate, recvIssues, key);
      var dailyDemand = dd ? dd.dailyDemand : null;
      var basis = (dailyDemand !== null || driver === 'FORECAST_DRIVEN') ? weightBasisFor(r, driver, dailyDemand, recvIssues, key) : null;
      var fulfillmentModel = str(r.fulfillmentModel);
      var pools = eligiblePoolTypesFor(fulfillmentModel, threePlOk);
      if (!pools.length) recvIssues.push(issue('POOL_ELIGIBILITY_UNRESOLVED', key, 'no eligible pool type (fulfillment_model=' + (fulfillmentModel || '∅') + '; 3PL warehouse-eligible=' + threePlOk + ')'));
      var dest = resolveDestination(r, routing, scope);
      if (dest === null) recvIssues.push(issue('MISSING_DESTINATION_WAREHOUSE', key, 'no canonical destination (fact / routing / frozen scope); D-3 caller-owned, never inferred'));
      var windowCode = nonEmpty(r.windowCode) ? str(r.windowCode) : null;
      if (windowCode === null) recvIssues.push(issue('MISSING_WINDOW_CODE', key, 'windowCode is a caller-owned planning-window fact (§6)'));
      var priority = finiteNonNeg(r.allocationPriority);
      var upc = r.unitsPerCarton;
      stage.push({ r: r, key: key, driver: driver, dailyDemand: dailyDemand, basis: basis, pools: pools, dest: dest,
        windowCode: windowCode, fulfillmentModel: fulfillmentModel, priority: priority, upc: upc, recvIssues: recvIssues, extra: dd || {} });
    }

    // §7/§24.5 SHARE normalization over the allocation group (company + country). Denominator = Σ eligible basis.
    var totalBasis = 0; stage.forEach(function (s) { if (!s.recvIssues.length && typeof s.basis === 'number') totalBasis += s.basis; });

    var receiverFacts = [], planningFacts = [];
    stage.forEach(function (s) {
      var demandWeight = null;
      if (!s.recvIssues.length) {
        if (totalBasis > 0 && typeof s.basis === 'number') demandWeight = s.basis / totalBasis; // §7 SKU FC/Sales Share = basis_i ÷ Σ
        else s.recvIssues.push(issue('DEMAND_WEIGHT_UNRESOLVED', s.key, 'group demand basis total is 0 — no proportional share is defined (never averaged/faked)'));
      }
      if (s.recvIssues.length) { s.recvIssues.forEach(function (x) { issues.push(x); }); return; }
      // receiverFact — the exact shape projectAllocationInputs consumes. Emit dailyDemand (frozen consumer derives
      // survival = CEILING(18 × dailyDemand)); NEVER duplicate that §20.3 formula here.
      receiverFacts.push({
        receiverKey: s.key, demandKey: str(s.r.demandKey) || str(s.r.demandRef), demandRef: str(s.r.demandRef),
        marketplace: str(s.r.marketplace), destinationWarehouseId: s.dest, fulfillmentModel: s.fulfillmentModel,
        dailyDemand: s.dailyDemand, allocationPriority: s.priority, demandWeight: demandWeight, eligiblePoolTypes: s.pools
      });
      // weeklyPlanningFact — carries the FOUR raw gap inputs; the frozen resolver invokes calculateGap itself.
      planningFacts.push(weeklyPlanningFact(s, scope, company, country, input));
    });

    receiverFacts.sort(function (a, b) { return cmpStr(a.receiverKey, b.receiverKey); });
    planningFacts.sort(function (a, b) { return cmpStr(a.demandRef, b.demandRef); });
    issues.sort(function (a, b) { return cmpStr(a.code, b.code) || cmpStr(a.ref, b.ref); });
    var ready = issues.length === 0 && receiverFacts.length > 0;
    return {
      ready: ready, reason: ready ? null : (issues.length ? issues[0].code : 'PLANNING_FACTS_NOT_READY'),
      recommendationType: 'WEEKLY_SHIPPING', receiverFacts: receiverFacts, factoryDemandFacts: [], planningFacts: planningFacts,
      issues: issues, meta: { formulaVersion: input.formulaVersion == null ? null : input.formulaVersion, sourceDataAsOf: input.sourceDataAsOf == null ? null : input.sourceDataAsOf, deterministic: true }
    };
  }

  function weeklyPlanningFact(s, scope, company, country, input) {
    var r = s.r;
    var f = {
      recommendationType: 'WEEKLY_SHIPPING', demandRef: str(r.demandRef), demandKey: str(r.demandKey) || str(r.demandRef),
      sku: nonEmpty(r.masterSku) ? str(r.masterSku) : str(r.sku), siteSku: str(r.siteSku), windowCode: s.windowCode,
      company: nonEmpty(r.company) ? str(r.company) : company, country: nonEmpty(r.country) ? str(r.country) : country,
      marketplace: str(r.marketplace), destinationWarehouseId: s.dest, unitsPerCarton: r.unitsPerCarton
    };
    // The four raw gap inputs (§31) — resolver invokes calculateGap; supply EXACTLY what the caller/ledger provides.
    if (has(r, 'demand')) f.demand = r.demand;
    else if (s.extra && has(s.extra, 'forecastTotalDemand')) f.demand = s.extra.forecastTotalDemand; // §2D total (owner output)
    if (has(r, 'destinationCurrentStock')) f.destinationCurrentStock = r.destinationCurrentStock;
    if (has(r, 'timelyQualifiedIncoming')) f.timelyQualifiedIncoming = r.timelyQualifiedIncoming;
    if (has(r, 'timelyApprovedCommittedSupply')) f.timelyApprovedCommittedSupply = r.timelyApprovedCommittedSupply;
    if (has(r, 'requiredByDate')) f.requiredByDate = r.requiredByDate;
    return f;
  }

  // ---- MONTHLY_ORDER: factoryDemandFacts (factory allocation) + monthlyPlanningFacts --------------------------
  function buildMonthly(input, scope, company, receivers, routing, factoryIds, issues) {
    var factoryDemandFacts = [], planningFacts = [];
    for (var i = 0; i < receivers.length; i++) {
      var r = receivers[i]; aType(isObj(r), 'projectAllocationFacts: receivers[' + i + '] must be an object');
      var key = nonEmpty(r.receiverKey) ? str(r.receiverKey) : ('@' + i);
      var recvIssues = [];
      if (!nonEmpty(r.demandRef)) recvIssues.push(issue('RECEIVER_IDENTITY_INCOMPLETE', key, 'demandRef required'));
      var dest = resolveDestination(r, routing, scope);
      if (dest === null) recvIssues.push(issue('MISSING_DESTINATION_WAREHOUSE', key, 'no canonical destination; D-3 caller-owned'));
      var requiredByDate = nonEmpty(r.requiredByDate) ? str(r.requiredByDate) : null;
      if (requiredByDate === null) recvIssues.push(issue('MISSING_REQUIRED_BY_DATE', key, 'factory FIFO requires a required-by date (§6 caller-owned)'));
      if (!factoryIds.length) recvIssues.push(issue('FACTORY_ELIGIBILITY_UNRESOLVED', key, 'no is_factory_warehouse eligible warehouse (§35/§40)'));
      var priority = finiteNonNeg(r.allocationPriority);
      if (priority === null) recvIssues.push(issue('FACTORY_ELIGIBILITY_UNRESOLVED', key, 'allocationPriority missing/invalid (§20.4/§35 ordering)'));
      var requestMonth = nonEmpty(r.requestMonth) ? str(r.requestMonth) : null;
      var requestBucket = nonEmpty(r.requestBucket) ? str(r.requestBucket) : null;
      if (requestMonth === null || requestBucket === null) recvIssues.push(issue('PLANNING_FACTS_NOT_READY', key, 'requestMonth/requestBucket are caller-owned Monthly grain facts'));
      if (recvIssues.length) { recvIssues.forEach(function (x) { issues.push(x); }); continue; }
      factoryDemandFacts.push({
        demandKey: str(r.demandKey) || str(r.demandRef), demandRef: str(r.demandRef), company: nonEmpty(r.company) ? str(r.company) : company,
        marketplace: str(r.marketplace), destinationWarehouseId: dest, requiredByDate: requiredByDate,
        allocationPriority: priority, eligibleFactoryWarehouseIds: factoryIds.slice()
      });
      planningFacts.push(monthlyPlanningFact(r, scope, company, dest, requestMonth, requestBucket));
    }
    factoryDemandFacts.sort(function (a, b) { return cmpStr(a.demandRef, b.demandRef); });
    planningFacts.sort(function (a, b) { return cmpStr(a.demandRef, b.demandRef); });
    issues.sort(function (a, b) { return cmpStr(a.code, b.code) || cmpStr(a.ref, b.ref); });
    var ready = issues.length === 0 && factoryDemandFacts.length > 0;
    return {
      ready: ready, reason: ready ? null : (issues.length ? issues[0].code : 'PLANNING_FACTS_NOT_READY'),
      recommendationType: 'MONTHLY_ORDER', receiverFacts: [], factoryDemandFacts: factoryDemandFacts, planningFacts: planningFacts,
      issues: issues, meta: { formulaVersion: input.formulaVersion == null ? null : input.formulaVersion, sourceDataAsOf: input.sourceDataAsOf == null ? null : input.sourceDataAsOf, deterministic: true }
    };
  }

  function monthlyPlanningFact(r, scope, company, dest, requestMonth, requestBucket) {
    var f = {
      recommendationType: 'MONTHLY_ORDER', demandRef: str(r.demandRef), demandKey: str(r.demandKey) || str(r.demandRef),
      masterSku: nonEmpty(r.masterSku) ? str(r.masterSku) : str(r.sku), siteSku: str(r.siteSku),
      requestMonth: requestMonth, requestBucket: requestBucket, company: nonEmpty(r.company) ? str(r.company) : company,
      country: str(r.country), marketplace: str(r.marketplace), destinationWarehouseId: dest, unitsPerCarton: r.unitsPerCarton
    };
    // Net Order Need inputs — resolver invokes sumRemainingShortages / calculateGap; supply what the caller provides.
    if (Array.isArray(r.remainingShortages)) f.remainingShortages = r.remainingShortages.slice();
    if (has(r, 'netOrderNeed')) f.netOrderNeed = r.netOrderNeed;
    if (has(r, 'demand')) f.demand = r.demand;
    if (has(r, 'destinationCurrentStock')) f.destinationCurrentStock = r.destinationCurrentStock;
    if (has(r, 'timelyQualifiedIncoming')) f.timelyQualifiedIncoming = r.timelyQualifiedIncoming;
    if (has(r, 'timelyApprovedCommittedSupply')) f.timelyApprovedCommittedSupply = r.timelyApprovedCommittedSupply;
    return f;
  }

  return {
    projectAllocationFacts: projectAllocationFacts,
    // exposed for focused testing of the owned predicates (not business math — eligibility/share helpers only)
    _eligiblePoolTypesFor: eligiblePoolTypesFor,
    _eligibleFactoryWarehouseIds: eligibleFactoryWarehouseIds,
    _threePlEligible: threePlEligible
  };
});
