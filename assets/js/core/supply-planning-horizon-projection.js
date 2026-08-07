// Kitchen Mama Operation System — Canonical Day-Horizon Projection (KMHP) — F1-4B-FM4a.
// =============================================================================================
// ONE canonical owner for the D18 / D30 / D45 / D90 CUMULATIVE day-horizon projection. It does NOT own a second
// chronological engine — it REUSES the frozen KMTPP (supply-planning-time-phased-projection.js) for all
// count-once / carry-forward / balance math, and the frozen KMCALC carton-CEIL owner for suggestedOrderQty. What
// THIS owner adds (the two authorities FM3b explicitly left un-frozen) is purely:
//   1. the DAILY regular-FC demand distribution: for each calendar day, demand = monthlyRegularFC / daysInMonth
//      (that month's own real length — 28/29/30/31), carried at FULL PRECISION, never pre-rounded per day.
//   2. the dated CUMULATIVE checkpoints D18/D30/D45/D90 = calculationDate + N calendar days, fed to KMTPP.
// The authoritative calculation DAY (calculationDate) is supplied IN by the caller (server Script Property
// RECOMMENDATION_CALCULATION_DATE) — this owner NEVER reads a clock: no Date.now, no new Date(), no browser TZ.
// Special-event demand is intentionally EXCLUDED here (this recommendation mode's demand authority is regular FC
// only — the SAME authority monthlyProjection uses; see D-F1-4B-FM4a). Opening supply + ETA-dated incoming are
// reused verbatim from the destination authorities (counted ONCE by KMTPP). READ-ONLY; JSON-safe; deterministic.
(function (root, factory) {
  'use strict';
  var req = (typeof require !== 'undefined') ? require : null;
  var api = factory(
    req ? req('./supply-planning-time-phased-projection.js') : (root.KMTPP || (root.KM && root.KM.core && root.KM.core.timePhasedProjection)),
    req ? req('./supply-planning-calculations.js') : (root.KMCALC || (root.KM && root.KM.core && root.KM.core.supplyPlanningCalculations))
  );
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.core = window.KM.core || {}; window.KM.core.horizonProjection = api; window.KM.horizonProjection = api; }
  return api;
})(this, function (KMTPP, KMCALC) {
  'use strict';

  var DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  var HORIZON_DAYS = [18, 30, 45, 90];
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function isIso(v) { return typeof v === 'string' && DATE_RE.test(v); }
  function numOrNull(v) { if (v === null || v === undefined || v === '') return null; var n = Number(v); return isFinite(n) ? n : null; }
  function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0); }
  // month day-count OWNER (real calendar length; leap-aware) — never a fixed 30.
  function daysInMonth(y, m) { return [31, (isLeap(y) ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]; }
  // deterministic calendar increment (pure integer arithmetic; NO Date object, NO clock, NO timezone).
  function nextDay(y, m, d) { d++; if (d > daysInMonth(y, m)) { d = 1; m++; if (m > 12) { m = 1; y++; } } return [y, m, d]; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function iso(y, m, d) { return y + '-' + pad2(m) + '-' + pad2(d); }
  // THE single documented HORIZON QUANTITY ROUNDING OWNER (D-F1-4B-FM4a): a full-precision cumulative quantity
  // becomes a displayed integer via round-half-up at checkpoint emission ONLY — never per-day, never in a consumer.
  function hround(x) { return Math.round(x); }

  // ---- public: projectHorizons(input) → { ready, horizons, issues, meta } ------------------------------------
  //   input = { destination, calculationDate:'YYYY-MM-DD', openingSupplyQty, regularFcByMonth:{ 'YYYY-MM': qty },
  //             incomingEvents:[{ incomingId, eta, qty, sourceType }], unitsPerCarton, horizonDays?:[18,30,45,90] }
  function projectHorizons(input) {
    if (!isObj(input)) return fail(null, 'INVALID_INPUT', 'input must be an object');
    var calcDate = input.calculationDate;
    if (calcDate === undefined || calcDate === null || calcDate === '') return fail(null, 'CALCULATION_DATE_NOT_CONFIGURED', 'calculationDate is required (no clock fallback)');
    if (!isIso(calcDate)) return fail(null, 'CALCULATION_DATE_INVALID', 'calculationDate must be YYYY-MM-DD', { got: calcDate });

    var destination = (input.destination === undefined ? null : input.destination);
    var fcByMonth = isObj(input.regularFcByMonth) ? input.regularFcByMonth : {};
    var upc = input.unitsPerCarton;
    var horizonDays = (Array.isArray(input.horizonDays) && input.horizonDays.length) ? input.horizonDays.slice() : HORIZON_DAYS.slice();
    var maxN = 0; horizonDays.forEach(function (n) { if (n > maxN) maxN = n; });

    var y = +calcDate.slice(0, 4), m = +calcDate.slice(5, 7), d = +calcDate.slice(8, 10);

    // 1. daily regular-FC demand events (calcDate+1 .. calcDate+maxN), FULL PRECISION (never pre-rounded).
    //    A day whose month has NO canonical FC is OMITTED and its month recorded MISSING (a horizon whose window
    //    includes such a day is surfaced UNAVAILABLE — never a fabricated 0).
    var demandEvents = [], missingMonths = {}, cy = y, cm = m, cd = d, i, t;
    for (i = 1; i <= maxN; i++) {
      t = nextDay(cy, cm, cd); cy = t[0]; cm = t[1]; cd = t[2];
      var ym = y + ''; ym = iso(cy, cm, cd).slice(0, 7);
      var mfc = numOrNull(fcByMonth[ym]);
      if (mfc === null) { missingMonths[ym] = 1; continue; }
      demandEvents.push({ demandId: 'RFC-' + iso(cy, cm, cd), date: iso(cy, cm, cd), qty: mfc / daysInMonth(cy, cm), demandType: 'REGULAR_FORECAST_DAILY', month: ym });
    }

    // 2. cumulative dated checkpoints D{N} = calcDate + N calendar days (kind 'DAY').
    var checkpoints = [], cpDateByN = {};
    horizonDays.forEach(function (N) {
      var wy = y, wm = m, wd = d, k, r;
      for (k = 0; k < N; k++) { r = nextDay(wy, wm, wd); wy = r[0]; wm = r[1]; wd = r[2]; }
      cpDateByN[N] = iso(wy, wm, wd);
      checkpoints.push({ checkpointId: 'D' + N, date: cpDateByN[N], kind: 'DAY' });
    });

    // ETA-dated incoming (count-once; reused verbatim — never reconstructed from an aggregate).
    var incomingEvents = (Array.isArray(input.incomingEvents) ? input.incomingEvents : []).map(function (e) {
      e = e || {};
      return { incomingId: (e.incomingId == null ? null : String(e.incomingId)), availableDate: String(e.eta == null ? '' : e.eta), qty: numOrNull(e.qty), sourceType: (e.sourceType == null ? null : String(e.sourceType)) };
    });

    // 3. ONE KMTPP call owns ALL chronology (carry-forward, count-once, coverage).
    var proj = KMTPP.projectTimePhasedSupply({ destination: destination, openingSupplyQty: input.openingSupplyQty, demandEvents: demandEvents, incomingEvents: incomingEvents, checkpoints: checkpoints });
    if (!proj || proj.ready !== true) {
      return { ready: false, horizons: [], issues: (proj && proj.issues) || [{ code: 'HORIZON_PROJECTION_BLOCKED', message: 'time-phased projection not ready', details: null }],
        meta: { deterministic: true, calculationDate: calcDate, destination: destination } };
    }

    var cpByN = {}; proj.checkpoints.forEach(function (c) { cpByN[c.checkpointId] = c; });
    function windowHasMissing(N) { var wy = y, wm = m, wd = d, k, r; for (k = 0; k < N; k++) { r = nextDay(wy, wm, wd); wy = r[0]; wm = r[1]; wd = r[2]; if (missingMonths[iso(wy, wm, wd).slice(0, 7)]) return true; } return false; }

    var opening = proj.meta.openingSupplyQty;
    var horizons = horizonDays.map(function (N) {
      var wc = 'D' + N, cp = cpByN[wc], reqBy = cpDateByN[N];
      if (!cp || windowHasMissing(N)) {
        // truthful UNAVAILABLE (missing FC for a covered month) — opening still known, quantities null (never 0).
        return { windowCode: wc, requiredByDate: reqBy, demandQty: null, openingSupplyQty: opening, incomingAddedQty: null, coveredQty: null, remainingSupplyQty: null, gapQty: null, suggestedOrderQty: null };
      }
      var demandQty = hround(cp.cumulativeDemandQty);
      var coveredQty = hround(cp.cumulativeCoveredQty);
      var remainingSupplyQty = hround(cp.remainingSupplyQty);
      var incomingAddedQty = hround(cp.cumulativeIncomingQty || 0);
      var gapQty = Math.max(0, hround(cp.cumulativeDemandQty - cp.cumulativeCoveredQty));   // primary outcome: rounded from FULL precision, once
      var sug = null;
      if (gapQty <= 0) sug = 0;
      else if (typeof upc === 'number' && isFinite(upc) && upc > 0 && Math.floor(upc) === upc) { try { sug = KMCALC.calculateSuggestedOrderQty({ netOrderNeed: gapQty, unitsPerCarton: upc }); } catch (e) { sug = null; } }
      return { windowCode: wc, requiredByDate: reqBy, demandQty: demandQty, openingSupplyQty: opening, incomingAddedQty: incomingAddedQty, coveredQty: coveredQty, remainingSupplyQty: remainingSupplyQty, gapQty: gapQty, suggestedOrderQty: sug };
    });

    return { ready: true, horizons: horizons, issues: [],
      meta: { deterministic: true, calculationDate: calcDate, destination: destination, openingSupplyQty: opening, horizonDays: horizonDays } };

    function fail(dummy, code, message, details) {
      return { ready: false, horizons: [], issues: [{ code: code, message: message || code, details: details || null }],
        meta: { deterministic: true, calculationDate: (isIso(input && input.calculationDate) ? input.calculationDate : null), destination: (isObj(input) && input.destination !== undefined ? input.destination : null) } };
    }
  }

  return { projectHorizons: projectHorizons, HORIZON_DAYS: HORIZON_DAYS.slice(), VERSION: 'kmhp-fm4a-1' };
});
