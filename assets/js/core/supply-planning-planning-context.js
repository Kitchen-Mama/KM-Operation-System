// Kitchen Mama Operation System — Recommendation Planning Context Runtime (Phase F1-5-BD).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC producer of the four Phase-1-frozen planning-context facts that were caller-owned seams after
// F1-5-A (destination / window+required-by / demand driver / forecast-weight anchor). It resolves them from the
// FROZEN Phase-1 decisions (SUPPLY_PLANNING_DECISION_REGISTER D-F1-5B-1..3) — NOT by inference — and authors NO
// business formula that already has a frozen owner:
//   • destinationWarehouseId (D-F1-5B-1) — caller-supplied explicit canonical `warehouse_id`, VALIDATED against
//     canonical warehouse facts (exists + active + same company; no cross-company borrowing). NEVER auto-selected/
//     inferred (no first-row / display-name / country-default / latest-wins / cheapest-route / random).
//   • demandDriver (D-F1-5B-2) — Phase-1 replenishment is FORECAST (a frozen decision, not a fallback). No dynamic
//     Sales-vs-Forecast classifier; a non-FORECAST explicit driver → UNSUPPORTED_PHASE1_DEMAND_DRIVER.
//   • forecast weight anchor (D-F1-5B-3) — anchor = the injected calculation month M; weight window = M+1..M+4;
//     forecastShareQty = Σ Regular FC over M+1..M+4 (Regular FC ONLY — Special Event demand is NEVER folded into the
//     Regular-FC weight basis; it flows through the existing event owner downstream). §7 SHARE NORMALIZATION stays
//     owned by F1-5-A (this module only supplies the basis quantity — no duplicated §7 weight math).
//   • window / required-by — window start = first day of M+1, window end = last day of M+4 (derived from the frozen
//     4-month window, never an invented fixed 30/60/90-day horizon); Regular required-by = window start; Special
//     Event required-by INVOKES the frozen §10 owner `KMCALC.eventPreparationDate` (pull-forward) — never duplicated.
// Pure: injected calculation month (NO Date.now / NO browser-current-date); canonical month arithmetic; no locale
// parsing; no Math.random; no SpreadsheetApp / DB / persistence. Input never mutated; MISSING is never silently 0
// (only an explicit source 0 is 0); JSON-safe deterministic output.

(function (root, factory) {
  'use strict';
  var req = (typeof require !== 'undefined') ? require : null;
  var api = factory(
    req ? req('./supply-planning-calculations.js') : (root.KMCALC || (root.KM && root.KM.core && root.KM.core.supplyPlanningCalculations))
  );
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.planningContext = api; }
})(this, function (CALC) {
  'use strict';

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function aType(c, m) { if (!c) throw new TypeError(m); }
  function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
  function nonEmpty(v) { return str(v).length > 0; }
  function has(o, k) { return isObj(o) && Object.prototype.hasOwnProperty.call(o, k); }
  function cmpStr(a, b) { a = str(a); b = str(b); return a < b ? -1 : a > b ? 1 : 0; }
  function truthyFlag(v) { if (v === true) return true; var s = str(v).toLowerCase(); return s === 'true' || s === '1' || s === 'yes' || s === 'y'; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function issue(code, ref, message) { return { code: code, ref: ref === undefined ? null : ref, message: message, details: {} }; }

  // ---- pure canonical month arithmetic (NO clock / NO locale) ----------------------------------------------
  function parseYM(s) { var m = /^(\d{4})-(\d{2})$/.exec(str(s)); if (!m) return null; var y = parseInt(m[1], 10), mo = parseInt(m[2], 10); if (mo < 1 || mo > 12) return null; return { y: y, mo: mo }; }
  function addMonths(ym, n) { var idx = ym.y * 12 + (ym.mo - 1) + n; return { y: Math.floor(idx / 12), mo: (idx % 12) + 1 }; }
  function ymStr(ym) { return ym.y + '-' + pad2(ym.mo); }
  function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0); }
  function daysInMonth(y, mo) { return [31, (isLeap(y) ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1]; }
  function firstDay(ym) { return ymStr(ym) + '-01'; }
  function lastDay(ym) { return ymStr(ym) + '-' + pad2(daysInMonth(ym.y, ym.mo)); }
  function finiteNonNeg(v) { if (v === '' || v === null || v === undefined) return null; if (typeof v !== 'number' && typeof v !== 'string') return null; var n = Number(v); return (isFinite(n) && n >= 0) ? n : null; }

  // ---- destination validation (D-F1-5B-1) — explicit caller input, validated; NEVER inferred ---------------
  function normalizeDestination(r) {
    // Accept a single string OR an array of authorities; >1 distinct → conflict, 0 → missing.
    var raw = r.destinationWarehouseId;
    var list = Array.isArray(raw) ? raw.slice() : (nonEmpty(raw) ? [raw] : []);
    if (Array.isArray(r.destinationWarehouseIds)) list = list.concat(r.destinationWarehouseIds);
    var seen = {}, distinct = [];
    list.forEach(function (v) { var id = str(v); if (nonEmpty(id) && !seen[id]) { seen[id] = 1; distinct.push(id); } });
    return distinct;
  }
  function validateDestination(r, whById, recvIssues, key) {
    var distinct = normalizeDestination(r);
    if (distinct.length === 0) { recvIssues.push(issue('MISSING_DESTINATION_WAREHOUSE', key, 'destinationWarehouseId is a required caller-owned canonical warehouse_id (D-F1-5B-1; never inferred)')); return null; }
    if (distinct.length > 1) { recvIssues.push(issue('DESTINATION_AUTHORITY_CONFLICT', key, 'multiple distinct destination authorities supplied: ' + distinct.join(','))); return null; }
    var id = distinct[0];
    var w = whById[id];
    if (!w) { recvIssues.push(issue('DESTINATION_NOT_ELIGIBLE', key, 'destination warehouse_id not found in canonical warehouses: ' + id)); return null; }
    if (!truthyFlag(w.is_active)) { recvIssues.push(issue('DESTINATION_NOT_ELIGIBLE', key, 'destination warehouse is inactive: ' + id)); return null; }
    if (nonEmpty(w.company) && nonEmpty(r.company) && str(w.company) !== str(r.company)) {
      recvIssues.push(issue('DESTINATION_NOT_ELIGIBLE', key, 'destination warehouse company (' + str(w.company) + ') ≠ receiver company (' + str(r.company) + ') — no cross-company borrowing')); return null;
    }
    return { id: id, code: str(w.warehouse_code), type: str(w.warehouse_type) };
  }

  // ---- forecast weight anchor + share (D-F1-5B-3) — Regular FC over M+1..M+4; Special Event NEVER folded in ----
  function resolveForecastWeight(r, M, recvIssues, key) {
    var months = [addMonths(M, 1), addMonths(M, 2), addMonths(M, 3), addMonths(M, 4)].map(ymStr);
    var fcMap = has(r, 'regularForecastByMonth') && isObj(r.regularForecastByMonth) ? r.regularForecastByMonth : null;
    if (!fcMap) { recvIssues.push(issue('MISSING_FORECAST_WEIGHT_SOURCE', key, 'regularForecastByMonth is required for the Phase-1 Forecast weight basis')); return { months: months, qty: null }; }
    var sum = 0, blocked = false;
    for (var i = 0; i < months.length; i++) {
      var ms = months[i];
      if (!has(fcMap, ms)) { recvIssues.push(issue('MISSING_FORECAST_WEIGHT_SOURCE', key + '|' + ms, 'Regular FC month missing (MISSING is not 0): ' + ms)); blocked = true; continue; }
      var n = finiteNonNeg(fcMap[ms]);
      if (n === null) { recvIssues.push(issue('INVALID_FORECAST_WEIGHT_VALUE', key + '|' + ms, 'Regular FC month value is not a finite non-negative number: ' + ms)); blocked = true; continue; }
      sum += n; // explicit 0 is a valid zero row; Special Event demand is NOT read here (Regular FC ONLY)
    }
    return { months: months, qty: blocked ? null : sum };
  }

  // ---- window + required-by — derived from the frozen 4-month window; event pull-forward via the §10 owner ----
  function resolveWindow(r, M, planningCycle, recvIssues, key) {
    var mStart = addMonths(M, 1), mEnd = addMonths(M, 4);
    var windowStartDate = firstDay(mStart), windowEndDate = lastDay(mEnd);
    var regularRequiredBy = windowStartDate; // Regular context: stock required by the start of the demand window (M+1)
    var earliest = regularRequiredBy;
    var events = Array.isArray(r.specialEventFacts) ? r.specialEventFacts : [];
    for (var i = 0; i < events.length; i++) {
      var ef = events[i]; var start = ef && nonEmpty(ef.eventStartDate) ? str(ef.eventStartDate) : '';
      if (!start) continue;
      var prep;
      try { prep = CALC.eventPreparationDate(start); } // §10 pull-forward owner — invoked, never duplicated
      catch (e) { recvIssues.push(issue('MISSING_REQUIRED_BY_DATE', key, 'special event date invalid for §10 pull-forward: ' + start)); continue; }
      if (prep < earliest) earliest = prep; // events may pull the required-by earlier (ISO strings compare lexically)
    }
    return { windowCode: planningCycle, windowStartDate: windowStartDate, windowEndDate: windowEndDate, requiredByDate: earliest };
  }

  function resolveRecommendationPlanningContext(input, options) {
    aType(isObj(input), 'resolveRecommendationPlanningContext: input must be an object');
    options = options || {};
    var issues = [];
    var planningCycle = nonEmpty(input.planningCycle) ? str(input.planningCycle) : null;
    if (planningCycle === null) issues.push(issue('MISSING_PLANNING_CYCLE', null, 'planningCycle is required (caller/scheduler run parameter, SC-3.3)'));
    var M = parseYM(input.calculationMonth);
    if (M === null) issues.push(issue('MISSING_REQUIRED_BY_DATE', null, 'calculationMonth (injected "YYYY-MM") is required to derive the window/required-by (no browser-current-date inference)'));
    if (planningCycle === null || M === null) {
      return { ready: false, contexts: [], issues: issues, meta: { deterministic: true } };
    }
    var recommendationType = nonEmpty(input.recommendationType) ? str(input.recommendationType) : null;
    var warehouses = Array.isArray(input.warehouses) ? input.warehouses : [];
    var whById = {}; warehouses.forEach(function (w) { var id = str(w.warehouse_id); if (nonEmpty(id) && !whById[id]) whById[id] = w; });
    var receivers = Array.isArray(input.receivers) ? input.receivers : [];

    var byContextId = {}; // dedupe equal; conflict on differing facts
    var contexts = [];
    for (var i = 0; i < receivers.length; i++) {
      var r = receivers[i]; aType(isObj(r), 'resolveRecommendationPlanningContext: receivers[' + i + '] must be an object');
      var key = nonEmpty(r.sku) ? str(r.sku) : ('@' + i);
      var recvIssues = [];

      // demand driver (D-F1-5B-2): Phase-1 = FORECAST (frozen); reject a non-FORECAST explicit driver.
      var demandDriver = 'FORECAST';
      if (has(r, 'demandDriver') && nonEmpty(r.demandDriver) && str(r.demandDriver).toUpperCase() !== 'FORECAST') {
        recvIssues.push(issue('UNSUPPORTED_PHASE1_DEMAND_DRIVER', key, 'Phase-1 replenishment is FORECAST-driven only (D-F1-5B-2); got "' + str(r.demandDriver) + '"'));
      }
      var dest = validateDestination(r, whById, recvIssues, key);
      var fw = resolveForecastWeight(r, M, recvIssues, key);
      var win = resolveWindow(r, M, planningCycle, recvIssues, key);

      if (recvIssues.length) { recvIssues.forEach(function (x) { issues.push(x); }); continue; }

      var ctx = {
        contextId: [str(r.company), str(r.country), str(r.marketplace), key, dest.id, planningCycle, win.windowCode].join('|'),
        company: str(r.company), country: str(r.country), marketplace: str(r.marketplace), sku: str(r.sku), siteSku: str(r.siteSku),
        recommendationType: recommendationType,
        destinationWarehouseId: dest.id, destinationWarehouseCode: dest.code, destinationWarehouseType: dest.type,
        planningCycle: planningCycle,
        windowCode: win.windowCode, windowStartDate: win.windowStartDate, windowEndDate: win.windowEndDate, requiredByDate: win.requiredByDate,
        demandDriver: demandDriver, forecastWeightAnchor: ymStr(M), forecastWeightMonths: fw.months, forecastShareQty: fw.qty,
        issues: []
      };
      var ser = JSON.stringify(ctx);
      if (has(byContextId, ctx.contextId)) {
        if (byContextId[ctx.contextId] !== ser) issues.push(issue('PLANNING_CONTEXT_NOT_READY', ctx.contextId, 'conflicting planning contexts share one identity with differing facts'));
        continue; // equal duplicate → deterministic dedupe (keep the first)
      }
      byContextId[ctx.contextId] = ser;
      contexts.push(ctx);
    }

    contexts.sort(function (a, b) { return cmpStr(a.contextId, b.contextId); });
    issues.sort(function (a, b) { return cmpStr(a.code, b.code) || cmpStr(a.ref, b.ref); });
    var ready = issues.length === 0 && contexts.length > 0;
    return { ready: ready, contexts: contexts, issues: issues, meta: { deterministic: true } };
  }

  // ---- narrow bridge: planning context → F1-5-A (KMAF) receiver input seam --------------------------------
  // Maps a resolved context + caller-supplied demand basis (the §2D dailyDemand inputs + gap inputs + carton + window)
  // into a KMAF receiver. The context supplies forecastShareQty as the FORECAST weight basis; §7 SHARE normalization
  // remains owned by KMAF (this only routes the basis — no weight math here). demandDriver FORECAST → KMAF token
  // FORECAST_DRIVEN. It does NOT run KMAF; the caller feeds the returned receivers into KMAF.projectAllocationFacts.
  function toAllocationFactReceiver(ctx, extras) {
    aType(isObj(ctx), 'toAllocationFactReceiver: ctx required');
    extras = extras || {};
    var r = {
      receiverKey: str(extras.receiverKey) || ctx.contextId,
      demandRef: str(extras.demandRef) || ctx.contextId,
      demandKey: extras.demandKey,
      masterSku: ctx.sku, siteSku: ctx.siteSku, marketplace: ctx.marketplace, company: ctx.company, country: ctx.country,
      fulfillmentModel: extras.fulfillmentModel,
      demandDriver: 'FORECAST_DRIVEN',
      forecastBasis: {
        forecastMonth1: extras.forecastMonth1, forecastMonth2: extras.forecastMonth2, targetRules: extras.targetRules,
        specialEventDemand: extras.specialEventDemand,
        forecastShareQty: ctx.forecastShareQty // §7 weight BASIS — KMAF normalizes basis_i ÷ Σ_group
      },
      allocationPriority: extras.allocationPriority, unitsPerCarton: extras.unitsPerCarton,
      destinationWarehouseId: ctx.destinationWarehouseId, windowCode: ctx.windowCode, requiredByDate: ctx.requiredByDate
    };
    ['demand', 'destinationCurrentStock', 'timelyQualifiedIncoming', 'timelyApprovedCommittedSupply'].forEach(function (k) { if (has(extras, k)) r[k] = extras[k]; });
    return r;
  }

  return {
    resolveRecommendationPlanningContext: resolveRecommendationPlanningContext,
    toAllocationFactReceiver: toAllocationFactReceiver,
    // exposed for focused testing of owned pure helpers (month arithmetic / destination — not business formula)
    _forecastWeightMonths: function (calcMonth) { var m = parseYM(calcMonth); return m ? [addMonths(m, 1), addMonths(m, 2), addMonths(m, 3), addMonths(m, 4)].map(ymStr) : null; }
  };
});
