// Kitchen Mama Operation System — Canonical Time-Phased Supply Projection (KMTPP) — F1-4B-FM3b.
// =============================================================================================
// ONE pure, deterministic chronological supply projection owner. It does NOT own any FACT: opening supply,
// demand quantities/dates, qualified-incoming eligibility/ETA, special-event preparation dates, destination
// identity, units-per-carton, and calculation month/window are ALL produced upstream by the existing FROZEN
// owners (KMPCX / KMQI / KMPA / KMDA / KMCALC / KMDR) and passed IN as already-normalized events. What THIS
// owner adds (the new, authorized ownership) is purely:
//   • single date-ordered event stream (sorted ONCE — never browser clock, locale sort, or insertion order)
//   • one running supply balance with COUNT-ONCE application (each incoming applied exactly once)
//   • chronological carry-forward across tiers/checkpoints (opening supply is consumed once, never reused)
//   • snapshot emission at requested checkpoints + a T1..T4 monthly rollup
// No Date.now(), no RNG, no mutation of inputs, JSON-safe output. READ-ONLY (no I/O, no writes).
//
// Day-horizon (D18/D30/D45/D90) inputs are a BOUNDED HALT this round (F1-4B-FM3b §6/§15): there is no frozen
// calculation-DAY anchor and no frozen intra-month day-demand distribution rule, so the LIVE handler must NOT
// fabricate day checkpoints. The owner's checkpoint mechanism is generic (kind 'DAY' | 'MONTH'), so it is
// ready to snapshot day horizons the moment those two authorities are frozen — but it never invents them.
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.core = window.KM.core || {}; window.KM.core.timePhasedProjection = api; window.KM.timePhasedProjection = api; }
  return api;
})(this, function () {
  'use strict';

  var DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function iss(code, message, details) { return { code: code, message: message || code, details: details || null }; }
  // finite number ≥ 0 → value; else null (missing/unknown is NEVER coerced to 0).
  function numOrNull(v) { if (v === null || v === undefined || v === '') return null; var n = Number(v); return (isFinite(n)) ? n : null; }
  function isIso(v) { return typeof v === 'string' && DATE_RE.test(v); }
  // Deterministic day ordinal from a strict ISO date (UTC, leap-aware) — ordering only, never a clock.
  function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0); }
  function dayOrdinal(iso) {
    var y = +iso.slice(0, 4), m = +iso.slice(5, 7), d = +iso.slice(8, 10);
    var dim = [31, (isLeap(y) ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    var n = d; for (var i = 0; i < m - 1; i++) n += dim[i]; return y * 366 + n;   // strictly monotonic across dates
  }

  // Kind ordering on the SAME calendar date (§2): qualified incoming available on date D may cover demand
  // required by D → apply INCOMING (0) before consuming DEMAND (1); CHECKPOINT (2) snapshots AFTER both, so a
  // same-day checkpoint reflects that day's incoming + demand. Final tie-break = lexicographic id (stable,
  // permutation-invariant). This is an ordering convention for the projection, not a re-statement of KMQI
  // eligibility — the caller must only pass incoming that KMQI already qualified for the relevant required-by.
  function streamCompare(a, b) {
    if (a.ord !== b.ord) return a.ord - b.ord;
    if (a.t !== b.t) return a.t - b.t;
    return a.key < b.key ? -1 : (a.key > b.key ? 1 : 0);
  }

  // ---- public: projectTimePhasedSupply(input) → { ready, timeline, checkpoints, monthlyProjection, issues, meta }
  function projectTimePhasedSupply(input) {
    var issues = [];
    if (!isObj(input)) return fail([iss('INVALID_INPUT', 'input must be an object')], null);
    var destination = (input.destination === undefined ? null : input.destination);

    var opening = numOrNull(input.openingSupplyQty);
    if (opening === null) {
      // missing opening supply is UNKNOWN, never 0 — fail closed (the caller supplies a canonical stock fact).
      return fail([iss('OPENING_SUPPLY_UNAVAILABLE', 'openingSupplyQty is required (missing ≠ zero)')], destination);
    }
    if (opening < 0) return fail([iss('OPENING_SUPPLY_INVALID', 'openingSupplyQty must be ≥ 0')], destination);

    var demandRaw = Array.isArray(input.demandEvents) ? input.demandEvents : [];
    var incomingRaw = Array.isArray(input.incomingEvents) ? input.incomingEvents : [];
    var cpRaw = Array.isArray(input.checkpoints) ? input.checkpoints : [];

    var stream = [];   // one merged, date-ordered event stream (sorted ONCE)
    var i, e, q, dt;

    for (i = 0; i < incomingRaw.length; i++) {
      e = incomingRaw[i] || {}; dt = e.availableDate; q = numOrNull(e.qty);
      if (!isIso(dt)) return fail([iss('INCOMING_DATE_INVALID', 'incomingEvents[' + i + '].availableDate must be YYYY-MM-DD', { got: dt })], destination);
      if (q === null || q < 0) return fail([iss('INCOMING_QTY_INVALID', 'incomingEvents[' + i + '].qty must be a finite number ≥ 0', { got: e.qty })], destination);
      stream.push({ t: 0, ord: dayOrdinal(dt), key: String(e.incomingId == null ? ('in#' + i) : e.incomingId),
        ev: { kind: 'INCOMING', date: dt, qty: q, incomingId: (e.incomingId == null ? null : String(e.incomingId)), sourceType: (e.sourceType == null ? null : String(e.sourceType)), tier: (e.tier == null ? null : String(e.tier)) } });
    }
    for (i = 0; i < demandRaw.length; i++) {
      e = demandRaw[i] || {}; dt = e.date; q = numOrNull(e.qty);
      if (!isIso(dt)) return fail([iss('DEMAND_DATE_INVALID', 'demandEvents[' + i + '].date must be YYYY-MM-DD', { got: dt })], destination);
      if (q === null || q < 0) return fail([iss('DEMAND_QTY_INVALID', 'demandEvents[' + i + '].qty must be a finite number ≥ 0', { got: e.qty })], destination);
      stream.push({ t: 1, ord: dayOrdinal(dt), key: String(e.tier == null ? '' : e.tier) + '|' + String(e.demandId == null ? ('d#' + i) : e.demandId),
        ev: { kind: 'DEMAND', date: dt, qty: q, demandId: (e.demandId == null ? null : String(e.demandId)), demandType: (e.demandType == null ? null : String(e.demandType)), tier: (e.tier == null ? null : String(e.tier)), month: (e.month == null ? null : String(e.month)) } });
    }
    for (i = 0; i < cpRaw.length; i++) {
      e = cpRaw[i] || {}; dt = e.date;
      if (!isIso(dt)) return fail([iss('CHECKPOINT_DATE_INVALID', 'checkpoints[' + i + '].date must be YYYY-MM-DD', { got: dt })], destination);
      stream.push({ t: 2, ord: dayOrdinal(dt), key: String(e.checkpointId == null ? ('cp#' + i) : e.checkpointId),
        ev: { kind: 'CHECKPOINT', date: dt, checkpointId: (e.checkpointId == null ? null : String(e.checkpointId)), cpKind: (e.kind == null ? null : String(e.kind)), tier: (e.tier == null ? null : String(e.tier)), month: (e.month == null ? null : String(e.month)) } });
    }

    stream.sort(streamCompare);   // deterministic single ordering (date → kind → id)

    var balance = opening, cumDemand = 0, cumCovered = 0, cumIncoming = 0;
    var timeline = [], checkpoints = [];
    var tierMap = {}, tierOrder = [];
    function tierRec(tier, month) {
      if (!Object.prototype.hasOwnProperty.call(tierMap, tier)) {
        // opening supply for a tier = the running balance the MOMENT the tier's FIRST event is reached
        // (i.e. remaining after all prior tiers, BEFORE this tier's own incoming/demand) — §7 semantics.
        tierMap[tier] = { tier: tier, month: (month == null ? null : month), openingSupplyQty: balance,
          incomingAddedQty: 0, demandQty: 0, coveredQty: 0, remainingSupplyQty: balance, remainingGapQty: 0 };
        tierOrder.push(tier);
      } else if (month != null && tierMap[tier].month == null) { tierMap[tier].month = month; }
      return tierMap[tier];
    }

    for (i = 0; i < stream.length; i++) {
      e = stream[i].ev;
      if (e.kind === 'INCOMING') {
        if (e.tier != null) tierRec(e.tier).incomingAddedQty += e.qty;
        balance += e.qty; cumIncoming += e.qty;
        if (e.tier != null) tierMap[e.tier].remainingSupplyQty = balance;
        timeline.push({ date: e.date, kind: 'INCOMING', qty: e.qty, tier: e.tier, balanceAfter: balance });
      } else if (e.kind === 'DEMAND') {
        var rec = (e.tier != null) ? tierRec(e.tier, e.month) : null;
        var covered = Math.min(balance, e.qty);
        balance -= covered; cumDemand += e.qty; cumCovered += covered;
        if (rec) { rec.demandQty += e.qty; rec.coveredQty += covered; rec.remainingGapQty += (e.qty - covered); rec.remainingSupplyQty = balance; }
        timeline.push({ date: e.date, kind: 'DEMAND', qty: e.qty, tier: e.tier, coveredQty: covered, shortageQty: (e.qty - covered), balanceAfter: balance });
      } else {
        checkpoints.push({ checkpointId: e.checkpointId, date: e.date, kind: e.cpKind, tier: e.tier, month: e.month,
          cumulativeDemandQty: cumDemand, cumulativeCoveredQty: cumCovered, remainingSupplyQty: balance, gapQty: (cumDemand - cumCovered) });
      }
    }

    var monthlyProjection = tierOrder.map(function (t) {
      var r = tierMap[t];
      return { tier: r.tier, month: r.month, openingSupplyQty: r.openingSupplyQty, incomingAddedQty: r.incomingAddedQty,
        demandQty: r.demandQty, coveredQty: r.coveredQty, remainingSupplyQty: r.remainingSupplyQty, remainingGapQty: r.remainingGapQty };
    });

    return {
      ready: true, timeline: timeline, checkpoints: checkpoints, monthlyProjection: monthlyProjection, issues: issues,
      meta: { deterministic: true, destination: destination, openingSupplyQty: opening, totalIncomingQty: cumIncoming,
        totalDemandQty: cumDemand, totalCoveredQty: cumCovered, endingSupplyQty: balance,
        checkpointCount: checkpoints.length, tierCount: tierOrder.length }
    };

    function fail(errs, dest) {
      return { ready: false, timeline: [], checkpoints: [], monthlyProjection: [], issues: errs,
        meta: { deterministic: true, destination: dest } };
    }
  }

  return { projectTimePhasedSupply: projectTimePhasedSupply, VERSION: 'kmtpp-fm3b-1' };
});
