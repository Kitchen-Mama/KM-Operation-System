// Kitchen Mama Operation System — Production Recommendation Fact Assembly (Phase F1-4B-PRE).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC assembly that turns canonical raw snapshots (the KMPS.readCanonicalSnapshots shape) + an
// explicit internal request into the exact inputs the EXISTING production recommendation chain consumes — with NO
// prebuilt planningFacts / receiverFacts and NO new business formula:
//
//   raw snapshots + request
//     → request validation
//     → identity normalization (company/country/marketplace/sku/site_sku/warehouse_id — never index/display-name)
//     → KMPCX.resolveRecommendationPlanningContext (destination / window / required-by / driver=FORECAST / M+1..M+4)
//     → KMPCX.toAllocationFactReceiver + §2D forecast basis → KMAF.projectAllocationFacts (receiver/planning facts)
//     → attach calculatedGap via the FROZEN owner KMCALC.calculateGap (source-projection routes only calculated_gap_qty)
//     → productionRequest {…, receiverFacts, planningFacts, factoryDemandFacts}  (source-projection's NATIVE seam)
//     → (caller) KMPS.buildProductionRecommendationSource(spreadsheet, productionRequest)
//     → existing demand/supply ledger + allocator + resolver → real recommendedQty
//
// Frozen-decision fidelity (F1-5-BD): destination is caller-owned + validated (never inferred); demandDriver=FORECAST;
// forecast weight anchor = injected M, months M+1..M+4, Regular FC only. Gap MODEL matches the existing production
// path: the destination's exclusive stock/incoming are represented in the SUPPLY LEDGER (built by the existing F1-3
// path from the raw snapshots) as the allocation source, so the per-receiver gap = forecast demand with
// destinationCurrentStock/timelyQualifiedIncoming/committed = explicit 0 (NOT a missing→0 coercion — a self-fulfilled
// receiver has no exclusive destination stock; current stock + qualified incoming pass through the F1-3 path). This
// authors NO formula: gap via KMCALC.calculateGap; §7 share via KMAF; §10 pull-forward via KMPCX; count-once / QI /
// current stock via the unchanged source-projection F1-3 path. No clock / Math.random / SpreadsheetApp / DB /
// persistence in this pure layer; input never mutated; MISSING is never silently 0; JSON-safe deterministic output.

(function (root, factory) {
  'use strict';
  var req = (typeof require !== 'undefined') ? require : null;
  var api = factory(
    req ? req('./supply-planning-planning-context.js') : (root.KMPCX || (root.KM && root.KM.planningContext)),
    req ? req('./supply-planning-allocation-facts.js') : (root.KMAF || (root.KM && root.KM.allocationFacts)),
    req ? req('./supply-planning-calculations.js') : (root.KMCALC || (root.KM && root.KM.core && root.KM.core.supplyPlanningCalculations))
  );
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.productionAssembly = api; }
})(this, function (KMPCX, KMAF, CALC) {
  'use strict';

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function aType(c, m) { if (!c) throw new TypeError(m); }
  function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
  function nonEmpty(v) { return str(v).length > 0; }
  function has(o, k) { return isObj(o) && Object.prototype.hasOwnProperty.call(o, k); }
  function cmpStr(a, b) { a = str(a); b = str(b); return a < b ? -1 : a > b ? 1 : 0; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function issue(code, ref, message) { return { code: code, ref: ref === undefined ? null : ref, message: message, details: {} }; }
  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  function parseYM(s) { var m = /^(\d{4})-(\d{2})$/.exec(str(s)); if (!m) return null; var y = +m[1], mo = +m[2]; if (mo < 1 || mo > 12) return null; return { y: y, mo: mo }; }

  // Normalize a KMPS-shape snapshot ({headers, rows}) into row objects. Value-preserving; no reimplementation.
  function toRowObjects(snap) {
    if (!isObj(snap) || !Array.isArray(snap.headers) || !Array.isArray(snap.rows)) return [];
    var headers = snap.headers.map(function (h) { return str(h); });
    return snap.rows.map(function (r) { var o = {}; for (var c = 0; c < headers.length; c++) o[headers[c]] = r[c]; return o; });
  }
  function finiteNonNeg(v) { if (v === '' || v === null || v === undefined) return null; var n = Number(v); return (isFinite(n) && n >= 0) ? n : null; }
  function inScope(row, scope) {
    return str(row.company) === scope.company && str(row.country) === scope.country &&
      str(row.marketplace) === scope.marketplace && (scope.sku === null || str(row.sku) === scope.sku);
  }

  // ---- Regular FC by month (M+1..M+4) from fc_regular_forecast (month columns jan..dec + year) ---------------
  function buildRegularForecastByMonth(fcRows, scope, sku, monthsYm, recvIssues, key) {
    var map = {}, forecastId = null;
    monthsYm.forEach(function (ym) {
      var p = parseYM(ym), abbrev = MONTHS[p.mo - 1];
      var matches = fcRows.filter(function (r) {
        return str(r.company) === scope.company && str(r.country) === scope.country && str(r.marketplace) === scope.marketplace &&
          str(r.sku) === sku && Number(r.year) === p.y;
      });
      if (!matches.length) return; // month missing → left out (KMPCX emits MISSING_FORECAST_WEIGHT_SOURCE; never 0)
      var vals = {}; matches.forEach(function (r) { var v = r[abbrev]; if (v !== '' && v !== null && v !== undefined) vals[String(v)] = 1; if (forecastId === null && nonEmpty(r.forecast_id)) forecastId = str(r.forecast_id); });
      var distinct = Object.keys(vals);
      if (distinct.length > 1) { recvIssues.push(issue('FORECAST_SOURCE_CONFLICT', key + '|' + ym, 'conflicting Regular FC values for ' + ym + ': ' + distinct.join(','))); return; }
      if (distinct.length === 1) map[ym] = Number(distinct[0]); // explicit value (incl. 0) preserved
    });
    return { map: map, forecastId: forecastId };
  }

  function validateRequest(request, issues) {
    if (!isObj(request)) { issues.push(issue('INVALID_RECOMMENDATION_ASSEMBLY_REQUEST', null, 'request must be an object')); return null; }
    var recType = nonEmpty(request.recommendationType) ? str(request.recommendationType) : 'WEEKLY_SHIPPING';
    var scope = { company: str(request.company), country: str(request.country), marketplace: str(request.marketplace), sku: nonEmpty(request.sku) ? str(request.sku) : null };
    if (!nonEmpty(scope.company) || !nonEmpty(scope.country) || !nonEmpty(scope.marketplace)) issues.push(issue('INVALID_RECOMMENDATION_ASSEMBLY_REQUEST', null, 'company/country/marketplace are mandatory (no implicit first company/marketplace)'));
    if (!nonEmpty(request.destinationWarehouseId)) issues.push(issue('MISSING_DESTINATION_WAREHOUSE', null, 'destinationWarehouseId is mandatory Phase-1 (no automatic destination inference)'));
    if (!parseYM(request.calculationMonth)) issues.push(issue('MISSING_CALCULATION_MONTH', null, 'calculationMonth (injected "YYYY-MM") is mandatory (no browser/current-date inference)'));
    if (!nonEmpty(request.planningCycle)) issues.push(issue('MISSING_PLANNING_CYCLE', null, 'planningCycle is mandatory'));
    if (has(request, 'demandDriver') && nonEmpty(request.demandDriver) && str(request.demandDriver).toUpperCase() !== 'FORECAST') issues.push(issue('UNSUPPORTED_PHASE1_DEMAND_DRIVER', null, 'Phase-1 demandDriver is FORECAST only'));
    return issues.length ? null : { recommendationType: recType, scope: scope, destinationWarehouseId: str(request.destinationWarehouseId), calculationMonth: str(request.calculationMonth), planningCycle: str(request.planningCycle), sourceDataAsOf: nonEmpty(request.sourceDataAsOf) ? str(request.sourceDataAsOf) : null, formulaVersion: nonEmpty(request.formulaVersion) ? str(request.formulaVersion) : null };
  }

  function assembleProductionRecommendationFacts(rawSnapshots, request, options) {
    aType(isObj(rawSnapshots), 'assembleProductionRecommendationFacts: rawSnapshots must be an object');
    options = options || {};
    var issues = [];
    var meta = { calculationMonth: null, planningCycle: null, sourceDataAsOf: null, formulaVersion: null, deterministic: true };
    var vr = validateRequest(request, issues);
    if (!vr) return blocked(issues, meta);
    meta.calculationMonth = vr.calculationMonth; meta.planningCycle = vr.planningCycle; meta.sourceDataAsOf = vr.sourceDataAsOf; meta.formulaVersion = vr.formulaVersion;

    var snaps = isObj(rawSnapshots.snapshots) ? rawSnapshots.snapshots : rawSnapshots; // accept {snapshots:{…}} or {…}
    var mskRows = toRowObjects(snaps.marketplaceSkus);
    var skuRows = toRowObjects(snaps.skuDetails);
    var whRows = toRowObjects(snaps.warehouses);
    var mktRows = toRowObjects(snaps.marketplaces);
    var fcRows = toRowObjects(snaps.fcRegularForecast);
    var evtRows = toRowObjects(snaps.fcSpecialEvents);

    var upcBySku = {}; skuRows.forEach(function (r) { if (nonEmpty(r.sku)) upcBySku[str(r.sku)] = r.units_per_carton; });
    var prByMkt = {}; mktRows.forEach(function (r) { var k = str(r.marketplace); if (nonEmpty(k)) prByMkt[k] = r.allocation_priority; });

    var monthsYm = KMPCX._forecastWeightMonths(vr.calculationMonth); // [M+1..M+4] YYYY-MM (frozen D-F1-5B-3)
    var forecastMonthAbbrev = MONTHS[parseYM(monthsYm[0]).mo - 1]; // demand-ledger month = M+1 (single-month, matches source-projection)

    // Receivers = the marketplace_skus in scope (identity from canonical rows; never index/display name).
    var receivers = mskRows.filter(function (r) { return inScope(r, vr.scope); });
    if (!receivers.length) { issues.push(issue('MISSING_SKU_MAPPING', null, 'no marketplace_skus row for the scope (company/country/marketplace' + (vr.scope.sku ? '/sku ' + vr.scope.sku : '') + ')')); return blocked(issues, meta); }

    var kmpcxReceivers = [], recvMeta = {}; // recvMeta[sku] = {forecastId, upc, priority, fulfillmentModel, siteSku, fcMap}
    receivers.forEach(function (m) {
      var sku = str(m.sku), key = sku;
      var recvIssues = [];
      var fc = buildRegularForecastByMonth(fcRows, vr.scope, sku, monthsYm, recvIssues, key);
      recvIssues.forEach(function (x) { issues.push(x); });
      var events = evtRows.filter(function (r) { return inScope(r, vr.scope) && str(r.sku) === sku; })
        .map(function (r) { return { eventStartDate: str(r.event_start_date || r.start_date || r.eventStartDate) }; })
        .filter(function (e) { return nonEmpty(e.eventStartDate); });
      kmpcxReceivers.push({ company: vr.scope.company, country: vr.scope.country, marketplace: vr.scope.marketplace, sku: sku, siteSku: str(m.site_sku),
        destinationWarehouseId: vr.destinationWarehouseId, regularForecastByMonth: fc.map, specialEventFacts: events });
      recvMeta[sku] = { forecastId: fc.forecastId, upc: upcBySku[sku], priority: prByMkt[vr.scope.marketplace], fulfillmentModel: str(m.fulfillment_model), siteSku: str(m.site_sku), fcMap: fc.map };
    });

    // KMPCX — destination / window / required-by / driver / forecast anchor+share (frozen decisions).
    var pcx = KMPCX.resolveRecommendationPlanningContext({
      calculationMonth: vr.calculationMonth, planningCycle: vr.planningCycle, recommendationType: vr.recommendationType,
      receivers: kmpcxReceivers, warehouses: whRows
    });
    (pcx.issues || []).forEach(function (x) { issues.push(x); });
    if (!pcx.ready) { issues.push(issue('PLANNING_CONTEXT_NOT_READY', null, 'planning context did not resolve for all receivers')); return blocked(issues, meta); }

    // KMPCX context → KMAF receiver (+ §2D forecast basis + gap inputs). demandRef links to the demand ledger.
    var kmafReceivers = pcx.contexts.map(function (ctx) {
      var rm = recvMeta[ctx.sku] || {};
      var demandRef = nonEmpty(rm.forecastId) ? ('FC:' + rm.forecastId) : ('REG:' + [ctx.company, ctx.country, ctx.marketplace, ctx.sku, vr.planningCycle].join(':'));
      var m1 = monthsYm[0], m2 = monthsYm[1];
      var fcM1 = finiteNonNeg((rm.fcMap || {})[m1]);
      return KMPCX.toAllocationFactReceiver(ctx, {
        receiverKey: demandRef, demandRef: demandRef, fulfillmentModel: rm.fulfillmentModel, allocationPriority: rm.priority, unitsPerCarton: rm.upc,
        forecastMonth1: { month: m1, baseForecast: (rm.fcMap || {})[m1] }, forecastMonth2: { month: m2, baseForecast: (rm.fcMap || {})[m2] }, targetRules: {}, specialEventDemand: 0,
        // Gap model: demand = Regular FC M+1 (matches the source-projection demand ledger's single forecastMonth);
        // destination exclusive stock/incoming = explicit 0 (supply flows through the F1-3 path as the ledger source).
        demand: fcM1 === null ? undefined : fcM1, destinationCurrentStock: 0, timelyQualifiedIncoming: 0, timelyApprovedCommittedSupply: 0
      });
    });

    var af = KMAF.projectAllocationFacts({ recommendationType: vr.recommendationType, planningCycle: vr.planningCycle,
      businessScope: { company: vr.scope.company, country: vr.scope.country }, calculationDate: vr.calculationMonth + '-01',
      receivers: kmafReceivers, warehouses: whRows });
    (af.issues || []).forEach(function (x) { issues.push(x); });
    if (!af.ready) { issues.push(issue('ALLOCATION_FACTS_NOT_READY', null, 'allocation facts did not resolve')); return blocked(issues, meta, pcx, af); }

    // Attach calculatedGap (weekly) / netOrderNeed (monthly) via the FROZEN owner — source-projection routes only the
    // derived scalar (calculated_gap_qty / net_order_need_snapshot), not the raw 4 gap inputs KMAF carries.
    var planningFacts = (af.planningFacts || []).map(function (f) {
      var o = {}; for (var k in f) if (has(f, k)) o[k] = f[k];
      if (vr.recommendationType === 'WEEKLY_SHIPPING') {
        if (typeof f.demand === 'number' && typeof f.destinationCurrentStock === 'number' && typeof f.timelyQualifiedIncoming === 'number' && typeof f.timelyApprovedCommittedSupply === 'number') {
          o.calculatedGap = CALC.calculateGap({ demand: f.demand, destinationCurrentStock: f.destinationCurrentStock, timelyQualifiedIncoming: f.timelyQualifiedIncoming, timelyApprovedCommittedSupply: f.timelyApprovedCommittedSupply });
        }
      } else {
        if (has(f, 'netOrderNeed') && typeof f.netOrderNeed === 'number') o.netOrderNeed = f.netOrderNeed;
        else if (typeof f.demand === 'number' && typeof f.destinationCurrentStock === 'number' && typeof f.timelyQualifiedIncoming === 'number' && typeof f.timelyApprovedCommittedSupply === 'number') {
          o.netOrderNeed = CALC.calculateGap({ demand: f.demand, destinationCurrentStock: f.destinationCurrentStock, timelyQualifiedIncoming: f.timelyQualifiedIncoming, timelyApprovedCommittedSupply: f.timelyApprovedCommittedSupply });
        }
      }
      return o;
    });

    var routing = {}; kmafReceivers.forEach(function (r) { routing[str(r.demandRef)] = vr.destinationWarehouseId; });
    var businessScope = { company: vr.scope.company, country: vr.scope.country, marketplace: vr.scope.marketplace, destinationWarehouseId: vr.destinationWarehouseId };
    if (vr.scope.sku) businessScope.sku = vr.scope.sku;
    if (vr.recommendationType === 'WEEKLY_SHIPPING') businessScope.source_page = str(request.source_page) || 'replen';
    else businessScope.draft_purpose = str(request.draft_purpose) || 'monthly';

    var productionRequest = {
      recommendationType: vr.recommendationType, planningCycle: vr.planningCycle, businessScope: businessScope,
      forecastMonth: forecastMonthAbbrev, requiredByDate: (pcx.contexts[0] && pcx.contexts[0].requiredByDate) || null,
      routing: routing, formulaVersion: vr.formulaVersion, sourceDataAsOf: vr.sourceDataAsOf,
      receiverFacts: af.receiverFacts, factoryDemandFacts: af.factoryDemandFacts, planningFacts: planningFacts
    };

    return {
      ready: issues.length === 0,
      planningContextResult: pcx, allocationFactsResult: { ready: af.ready, receiverFacts: af.receiverFacts, factoryDemandFacts: af.factoryDemandFacts, planningFacts: planningFacts },
      productionRequest: issues.length === 0 ? productionRequest : null,
      issues: sortIssues(issues), meta: meta
    };
  }

  function blocked(issues, meta, pcx, af) {
    return { ready: false, planningContextResult: pcx || null, allocationFactsResult: af ? { ready: af.ready, receiverFacts: af.receiverFacts, factoryDemandFacts: af.factoryDemandFacts, planningFacts: [] } : null,
      productionRequest: null, issues: sortIssues(issues.length ? issues : [issue('PRODUCTION_RECOMMENDATION_SOURCE_INCOMPLETE', null, 'assembly incomplete')]), meta: meta };
  }
  function sortIssues(issues) { return issues.slice().sort(function (a, b) { return cmpStr(a.code, b.code) || cmpStr(a.ref, b.ref); }); }

  return { assembleProductionRecommendationFacts: assembleProductionRecommendationFacts };
});
