// Kitchen Mama Operation System — Canonical Planning-Demand Owner (KMPD) — F1-4B-FM3f-1 (Authorities D/E/F).
// =============================================================================================
// ONE canonical runtime owner for the Order-Planning / recommendation PLANNING DEMAND, so Order Planning,
// Inventory Replenishment, monthlyProjection[] and horizons[] all consume the SAME demand facts (no page-side
// FC×Target math, no per-consumer duplication). It does NOT own supply, chronology (KMTPP/KMHP), or carton
// (KMCALC). Pure / deterministic (no clock, no RNG, input never mutated, JSON-safe).
//
// Authorities frozen by the user (F1-4B-FM3f-1) and REPLICATED here from the existing owners — never invented:
//   E · Target %  — Adjusted Regular FC(month) = round(Base Regular FC(month) × TargetPct/100). TargetPct comes
//       from fc_target_rules via the SAME matching the page owner uses (_roTargetPct, request-order.js): scope by
//       sku/series/category (scope_id or raw sku/series/category), company exact, country/marketplace exact-or-ALL,
//       year exact-if-present; then {month}_pct → target_percentage → 100 default. No rules → 100 (frozen fallback).
//   F · Special Event FC — 100% (NEVER target-adjusted). Assigned ONCE to its PREP month = eventStartDate − 30
//       calendar days (canonical prep rule, request-order.js _roEventPrepMonth). Scoped + active only.
//   D · Current-month remaining demand — adjusted Regular FC of the calculation month distributed per calendar
//       day (÷ real days-in-month) × the days AFTER the calculation date through month end, PLUS special-event FC
//       whose prep date falls in that remaining-current-month window. Full precision; caller rounds at emission.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.core = window.KM.core || {}; window.KM.core.planningDemand = api; window.KM.planningDemand = api; }
  return api;
})(this, function () {
  'use strict';

  var MONTH_ABBR = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  var DEAD_EVENT = { inactive: 1, deleted: 1, archived: 1, cancelled: 1, void: 1 };
  var SPECIAL_EVENT_PREP_OFFSET_DAYS = 30;   // canonical prep rule (SUPPLY_PLANNING_CALCULATION_RULES §canonical)
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function s(v) { return String(v === undefined || v === null ? '' : v).trim(); }
  function U(v) { return s(v).toUpperCase(); }
  function L(v) { return s(v).toLowerCase(); }
  function num(v) { if (v === null || v === undefined || v === '') return null; var n = Number(v); return isFinite(n) ? n : null; }
  function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0); }
  function daysInMonth(y, m) { return [31, (isLeap(y) ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  // ---- E · Target % (replicates request-order.js _roTargetPct from RAW fc_target_rules rows) ----------------
  //   targetRuleRows: raw fc_target_rules rows (snake_case). skuMeta: { sku, series, category, company }.
  //   ym: 'YYYY-MM'. Returns a percentage number (100 default; no invented fallback).
  function resolveTargetPct(targetRuleRows, skuMeta, scope, ym) {
    var rules = Array.isArray(targetRuleRows) ? targetRuleRows : [];
    if (!rules.length) return 100;
    var m = /^(\d{4})-(\d{2})$/.exec(s(ym)); if (!m) return 100;
    var year = m[1], monKey = MONTH_ABBR[(+m[2]) - 1] + '_pct';
    var meta = skuMeta || {}, sc = scope || {};
    var match = rules.filter(function (r) {
      r = r || {};
      var scopeVal = s(r.scope_id) || s(r.sku) || s(r.series) || s(r.category);
      var scopeHit = U(scopeVal) === U(meta.sku) || U(scopeVal) === U(meta.series) || U(scopeVal) === U(meta.category) ||
        U(r.sku) === U(meta.sku) || U(r.series) === U(meta.series) || U(r.category) === U(meta.category);
      if (!scopeHit) return false;
      if (s(r.company) && s(sc.company) && U(r.company) !== U(sc.company)) return false;
      if (s(r.country) && s(sc.country) && U(r.country) !== U(sc.country) && U(r.country) !== 'ALL') return false;
      if (s(r.marketplace) && s(sc.marketplace) && L(r.marketplace) !== L(sc.marketplace) && U(r.marketplace) !== 'ALL') return false;
      if (s(r.year) && year && s(r.year) !== year) return false;
      return true;
    })[0];
    if (!match) return 100;
    if (match[monKey] != null && match[monKey] !== '') { var mp = parseFloat(match[monKey]); if (!isNaN(mp)) return mp; }
    var tp = (match.target_percentage != null && match.target_percentage !== '') ? parseFloat(match.target_percentage) : NaN;
    if (!isNaN(tp)) return tp;
    return 100;
  }

  // Base Regular FC for a month from raw fc_regular_forecast rows (scoped; single non-conflicting value or null).
  function baseRegularFc(fcRows, scope, sku, ym) {
    var m = /^(\d{4})-(\d{2})$/.exec(s(ym)); if (!m) return null;
    var year = Number(m[1]), abbr = MONTH_ABBR[(+m[2]) - 1], sc = scope || {}, vals = {};
    (fcRows || []).forEach(function (r) {
      r = r || {};
      if (U(r.company) !== U(sc.company) || U(r.country) !== U(sc.country) || U(r.marketplace) !== U(sc.marketplace) || U(r.sku) !== U(sku)) return;
      if (Number(r.year) !== year) return;
      var v = r[abbr]; if (v !== '' && v !== null && v !== undefined && isFinite(Number(v))) vals[String(Number(v))] = Number(v);
    });
    var keys = Object.keys(vals); return keys.length === 1 ? vals[keys[0]] : null;   // missing/conflicting → null (never fabricated 0)
  }

  // Adjusted Regular FC(month) = round(base × pct/100). Returns null when base is missing (never 0).
  function adjustedRegularFc(fcRows, targetRuleRows, skuMeta, scope, sku, ym) {
    var base = baseRegularFc(fcRows, scope, sku, ym); if (base === null) return null;
    var pct = resolveTargetPct(targetRuleRows, skuMeta, scope, ym);
    return { base: base, targetPct: pct, adjusted: Math.round(base * (pct / 100)) };
  }

  // ---- F · Special-event demand by planning month (prep month = start − 30d; 100%, never target-adjusted) -----
  function parseIsoDate(v) {
    var m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(s(v)); if (!m) return null;
    return { y: +m[1], mo: +m[2], d: +m[3] };
  }
  function addDaysYmd(ymd, delta) {
    // pure integer calendar arithmetic (no Date); delta may be negative.
    var y = ymd.y, mo = ymd.mo, d = ymd.d + delta;
    while (d < 1) { mo--; if (mo < 1) { mo = 12; y--; } d += daysInMonth(y, mo); }
    while (d > daysInMonth(y, mo)) { d -= daysInMonth(y, mo); mo++; if (mo > 12) { mo = 1; y++; } }
    return { y: y, mo: mo, d: d };
  }
  function eventScopeMatch(r, scope, sku) {
    r = r || {}; var sc = scope || {};
    var skuMatch = U(r.sku) === U(sku) || (L(r.scope_type) === 'sku' && U(r.scope_id) === U(sku));
    if (!skuMatch) return false;
    if (s(r.company) && s(sc.company) && U(r.company) !== U(sc.company)) return false;
    if (s(r.country) && s(sc.country) && U(r.country) !== U(sc.country)) return false;
    if (s(r.marketplace) && s(sc.marketplace) && L(r.marketplace) !== L(sc.marketplace)) return false;
    var st = L(r.status); if (st && DEAD_EVENT[st]) return false;
    return true;
  }
  // prep month (YYYY-MM) for an event row, or null if no parseable start date.
  function eventPrepMonth(r) {
    var start = parseIsoDate((r || {}).event_start_date || (r || {}).eventStartDate);
    if (!start) return null;
    var prep = addDaysYmd(start, -SPECIAL_EVENT_PREP_OFFSET_DAYS);
    return { ym: prep.y + '-' + pad2(prep.mo), prepDate: prep.y + '-' + pad2(prep.mo) + '-' + pad2(prep.d), y: prep.y, mo: prep.mo, d: prep.d };
  }
  function specialEventFcForMonth(eventRows, scope, sku, ym) {
    var total = 0, any = false;
    (eventRows || []).forEach(function (r) {
      if (!eventScopeMatch(r, scope, sku)) return;
      var pm = eventPrepMonth(r); if (!pm || pm.ym !== s(ym)) return;
      var q = num(r.fc_qty != null && r.fc_qty !== '' ? r.fc_qty : r.qty); if (q === null || q <= 0) return;
      total += q; any = true;
    });
    return any ? total : 0;   // 0 = no event in this month (a real zero, distinct from a missing regular FC)
  }

  // ---- canonical planning demand by month: adjusted regular FC + special-event FC ---------------------------
  //   Returns { 'YYYY-MM': { regularBase, targetPct, adjustedRegular, special, demand } } for months with a
  //   resolvable regular FC (missing regular month → omitted so the caller blocks that tier — never fabricated).
  function planningDemandByMonth(input) {
    input = input || {};
    var fcRows = input.fcRegularRows, tgtRows = input.fcTargetRuleRows, evtRows = input.fcSpecialEventRows;
    var scope = input.scope || {}, sku = s(input.sku), skuMeta = input.skuMeta || { sku: sku };
    var months = Array.isArray(input.months) ? input.months : [];
    var out = {};
    months.forEach(function (ym) {
      var adj = adjustedRegularFc(fcRows, tgtRows, skuMeta, scope, sku, ym);
      if (!adj) return;   // missing regular FC for a needed month → omit (caller surfaces truthfully)
      var special = specialEventFcForMonth(evtRows, scope, sku, ym);
      out[ym] = { regularBase: adj.base, targetPct: adj.targetPct, adjustedRegular: adj.adjusted, special: special, demand: adj.adjusted + special };
    });
    return out;
  }

  // ---- D · current-month remaining demand (adjusted regular daily × remaining days + prep-in-window special) --
  //   calculationDate 'YYYY-MM-DD'. Window = day AFTER calcDate .. last day of the calc month. FULL PRECISION
  //   (caller rounds at emission). Returns { ready, requiredByDate, ym, remainingDays, daysInMonth, dailyRate,
  //   regularRemaining, special, demand, issues }.
  function currentMonthRemainingDemand(input) {
    input = input || {};
    var cd = parseIsoDate(input.calculationDate);
    if (!cd) return { ready: false, issues: [{ code: 'CALCULATION_DATE_INVALID', message: 'calculationDate must be YYYY-MM-DD' }] };
    var ym = cd.y + '-' + pad2(cd.mo);
    var dim = daysInMonth(cd.y, cd.mo);
    var remainingDays = dim - cd.d;   // days AFTER the calc date through month end (calcDate itself already elapsed)
    if (remainingDays < 0) remainingDays = 0;
    var adj = adjustedRegularFc(input.fcRegularRows, input.fcTargetRuleRows, input.skuMeta || { sku: s(input.sku) }, input.scope || {}, s(input.sku), ym);
    if (!adj) return { ready: false, ym: ym, remainingDays: remainingDays, daysInMonth: dim, issues: [{ code: 'CURRENT_MONTH_FORECAST_MISSING', message: 'no regular FC for the calculation month ' + ym }] };
    var dailyRate = adj.adjusted / dim;                       // adjusted monthly ÷ real days-in-month
    var regularRemaining = dailyRate * remainingDays;         // full precision
    // special events whose PREP date falls in (calcDate, month end]
    var special = 0;
    (input.fcSpecialEventRows || []).forEach(function (r) {
      if (!eventScopeMatch(r, input.scope || {}, s(input.sku))) return;
      var pm = eventPrepMonth(r); if (!pm || pm.ym !== ym) return;
      if (pm.d <= cd.d) return;   // prep already elapsed on/before the calculation date
      var q = num(r.fc_qty != null && r.fc_qty !== '' ? r.fc_qty : r.qty); if (q === null || q <= 0) return;
      special += q;
    });
    return { ready: true, requiredByDate: ym + '-' + pad2(dim), ym: ym, remainingDays: remainingDays, daysInMonth: dim,
      dailyRate: dailyRate, regularRemaining: regularRemaining, special: special, demand: regularRemaining + special, targetPct: adj.targetPct, issues: [] };
  }

  // Scoped active special-event PREP events (for the day-horizon owner, which places demand on the exact prep date).
  // Returns [{ incomingId?, prepDate:'YYYY-MM-DD', qty }] — 100% (never target-adjusted); one entry per event.
  function scopedSpecialEventPreps(eventRows, scope, sku) {
    var out = [];
    (eventRows || []).forEach(function (r) {
      if (!eventScopeMatch(r, scope || {}, s(sku))) return;
      var pm = eventPrepMonth(r); if (!pm) return;
      var q = num(r.fc_qty != null && r.fc_qty !== '' ? r.fc_qty : r.qty); if (q === null || q <= 0) return;
      out.push({ prepDate: pm.prepDate, qty: q });
    });
    return out;
  }

  return {
    VERSION: 'kmpd-fm3f1-1',
    SPECIAL_EVENT_PREP_OFFSET_DAYS: SPECIAL_EVENT_PREP_OFFSET_DAYS,
    resolveTargetPct: resolveTargetPct,
    scopedSpecialEventPreps: scopedSpecialEventPreps,
    baseRegularFc: baseRegularFc,
    adjustedRegularFc: adjustedRegularFc,
    eventPrepMonth: eventPrepMonth,
    specialEventFcForMonth: specialEventFcForMonth,
    planningDemandByMonth: planningDemandByMonth,
    currentMonthRemainingDemand: currentMonthRemainingDemand
  };
});
