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

  // ---- E · Target % — THE ONE CANONICAL TARGET RULE RESOLVER -----------------------------------------------
  //
  // Every consumer of fc_target_rules resolves through this function. Before R2B-A2-R5-F2 there were five
  // implementations and they disagreed about which fields even participate: this one ignored `scope_type` and
  // returned the first matching row, so a Category rule outranked a SKU rule whenever it sat higher in the
  // sheet; procurement ignored year, company, country AND marketplace; Inventory Replenishment ignored year and
  // compared the literal string `All`. Two of the five never read a monthly column at all, so a rule carrying
  // Jan 91 … Dec 102 answered 93 for March here and 91 everywhere in procurement.
  //
  // The contract is FC_SUMMARY_SPEC.md §4.1, authorised in R2B-A2-R5-F2:
  //   business key   year | company | country | marketplace | scope_type | scope_id
  //   site identity  EXACT — no field optional, no `All`, no blank-as-wildcard
  //   precedence     SKU > SERIES > CATEGORY > default 100   (SUPPLY_PLANNING_CALCULATION_RULES §2D)
  //   month value    the requested month's NAMED column, only; target_percentage is never a runtime source
  //   duplicates     refused, never resolved by row order
  var TR_SCOPE_TYPES_ = ['CATEGORY', 'SERIES', 'SKU'];
  var TR_PRECEDENCE_ = ['SKU', 'SERIES', 'CATEGORY'];      // most specific first
  var TR_RETIRED_IDENTITY_ = 'ALL';                        // D2 — not a wildcard, not a value
  var TR_DEFAULT_PCT_ = 100;

  // ONE mapping for however a scope is spelled. Comparison is case-insensitive; persistence is uppercase.
  function trScopeType(v) {
    var u = U(v);
    return TR_SCOPE_TYPES_.indexOf(u) !== -1 ? u : '';
  }
  function trBusinessKey(o) {
    return [U(o.year), U(o.company), U(o.country), U(o.marketplace), U(o.scopeType), U(o.scopeId)].join('|');
  }
  // 1..12, or 'jan'..'dec'. Anything else is an invalid month, not a silent default.
  function trMonthIndex(v) {
    var n = Number(v);
    if (isFinite(n) && n >= 1 && n <= 12 && String(v).indexOf('.') === -1) return n - 1;
    var i = MONTH_ABBR.indexOf(L(v).slice(0, 3));
    return i;
  }
  function trIdentityUsable(v) {
    var t = s(v);
    return !!t && U(t) !== TR_RETIRED_IDENTITY_;
  }

  /**
   * The canonical resolution. Returns structured provenance so a caller can report WHY, never a bare number
   * that hides a refusal behind a plausible 100%.
   *
   * request: { year, company, country, marketplace, category, series, sku, month }
   * returns: { matched, targetPct, targetRuleId, scopeType, scopeId, businessKey, sourceMonth, reason }
   *   reason  OK | NO_RULES | NO_MATCH | INVALID_REQUEST_IDENTITY | INVALID_MONTH
   *           | DUPLICATE_TARGET_RULE_IDENTITY
   *   matched is true only for OK. NO_RULES / NO_MATCH carry the 100 default; the three refusals carry
   *   targetPct null, because a refusal that answers 100 is indistinguishable from a rule that says 100.
   */
  function resolveTargetRule(ruleRows, request) {
    var req = request || {};
    function answer(reason, pct, hit) {
      return {
        matched: reason === 'OK',
        targetPct: pct,
        targetRuleId: hit ? s(hit.row.target_rule_id) : null,
        scopeType: hit ? hit.scopeType : null,
        scopeId: hit ? hit.scopeId : null,
        businessKey: hit ? hit.key : null,
        sourceMonth: hit ? hit.monthColumn : null,
        reason: reason
      };
    }

    // 1 — the REQUESTED site identity must itself be complete and canonical.
    if (!trIdentityUsable(req.year) || !trIdentityUsable(req.company)
      || !trIdentityUsable(req.country) || !trIdentityUsable(req.marketplace)) {
      return answer('INVALID_REQUEST_IDENTITY', null, null);
    }
    // 2 — an invalid month is a refusal, not month zero.
    var mi = trMonthIndex(req.month);
    if (mi < 0 || mi > 11) return answer('INVALID_MONTH', null, null);
    var monthColumn = MONTH_ABBR[mi] + '_pct';

    var rules = Array.isArray(ruleRows) ? ruleRows : [];
    if (!rules.length) return answer('NO_RULES', TR_DEFAULT_PCT_, null);

    var wantDim = { SKU: s(req.sku), SERIES: s(req.series), CATEGORY: s(req.category) };

    // 3-7 — collect the rules that actually apply to this site, scope and month.
    var candidates = [];
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i] || {};
      // 3 — a rule with an incomplete or retired identity is not a wildcard; it simply does not apply.
      if (!trIdentityUsable(r.year) || !trIdentityUsable(r.company)
        || !trIdentityUsable(r.country) || !trIdentityUsable(r.marketplace)) continue;
      // 4 — exact site match, all four fields.
      if (U(r.year) !== U(req.year)) continue;
      if (U(r.company) !== U(req.company)) continue;
      if (U(r.country) !== U(req.country)) continue;
      if (U(r.marketplace) !== U(req.marketplace)) continue;
      // 5 — scope_type through the one mapping.
      var st = trScopeType(r.scope_type);
      if (!st) continue;
      // 6 — scope_id must equal the requested value of ITS OWN dimension. A SERIES rule whose scope_id
      //     happens to equal a category name does not match a category request.
      var sid = s(r.scope_id);
      if (!trIdentityUsable(sid)) continue;
      var want = wantDim[st];
      if (!want || U(sid) !== U(want)) continue;
      // 7 — the named month must carry a usable value. A rule that says nothing about March is not a
      //     March rule, and target_percentage may not stand in for it.
      var raw = r[monthColumn];
      var pct = num(raw);
      if (pct === null) continue;                       // blank / non-numeric — 0 is NOT null and survives
      candidates.push({ row: r, scopeType: st, scopeId: sid, pct: pct, monthColumn: monthColumn,
        key: trBusinessKey({ year: r.year, company: r.company, country: r.country,
          marketplace: r.marketplace, scopeType: st, scopeId: sid }) });
    }

    if (!candidates.length) return answer('NO_MATCH', TR_DEFAULT_PCT_, null);

    // 8-9 — duplicate canonical identity is a refusal. Choosing between two rows that claim the same
    //       identity is exactly the row-order dependence this contract exists to remove.
    var seen = {};
    for (var d = 0; d < candidates.length; d++) {
      if (seen[candidates[d].key]) return answer('DUPLICATE_TARGET_RULE_IDENTITY', null, null);
      seen[candidates[d].key] = 1;
    }

    // 10 — SKU beats SERIES beats CATEGORY. Order-independent: each tier now holds at most one rule.
    for (var p = 0; p < TR_PRECEDENCE_.length; p++) {
      for (var c = 0; c < candidates.length; c++) {
        if (candidates[c].scopeType === TR_PRECEDENCE_[p]) {
          return answer('OK', candidates[c].pct, candidates[c]);   // 12 — 0 is preserved verbatim
        }
      }
    }
    return answer('NO_MATCH', TR_DEFAULT_PCT_, null);
  }

  // Legacy numeric surface, kept so existing callers are unchanged in shape.
  //   number → resolved or the 100 default
  //   null   → a REFUSAL (duplicate identity, unusable request identity, invalid month). Null is this
  //            module's existing "never fabricate" convention — baseRegularFc already answers null for a
  //            missing or conflicting base rather than inventing 0, and a refusal answered as 100 would be
  //            indistinguishable from a rule that genuinely says 100.
  function resolveTargetPct(targetRuleRows, skuMeta, scope, ym) {
    var m = /^(\d{4})-(\d{2})$/.exec(s(ym));
    if (!m) return TR_DEFAULT_PCT_;
    var meta = skuMeta || {}, sc = scope || {};
    var res = resolveTargetRule(targetRuleRows, {
      year: m[1], company: sc.company, country: sc.country, marketplace: sc.marketplace,
      category: meta.category, series: meta.series, sku: meta.sku, month: Number(m[2])
    });
    return res.targetPct;
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

  // Adjusted Regular FC(month) = round(base × pct/100). Returns null when base is missing (never 0), and
  // now also when the Target Rule resolution REFUSED — a duplicate business identity or an unusable site
  // identity must not be multiplied through as if it were 100%.
  function adjustedRegularFc(fcRows, targetRuleRows, skuMeta, scope, sku, ym) {
    var base = baseRegularFc(fcRows, scope, sku, ym); if (base === null) return null;
    var pct = resolveTargetPct(targetRuleRows, skuMeta, scope, ym);
    if (pct === null) return null;
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
    resolveTargetRule: resolveTargetRule,          // canonical: structured provenance
    resolveTargetPct: resolveTargetPct,            // legacy numeric surface (null = refusal)
    trScopeType: trScopeType,
    trBusinessKey: trBusinessKey,
    TR_SCOPE_TYPES: TR_SCOPE_TYPES_,
    TR_PRECEDENCE: TR_PRECEDENCE_,
    scopedSpecialEventPreps: scopedSpecialEventPreps,
    baseRegularFc: baseRegularFc,
    adjustedRegularFc: adjustedRegularFc,
    eventPrepMonth: eventPrepMonth,
    specialEventFcForMonth: specialEventFcForMonth,
    planningDemandByMonth: planningDemandByMonth,
    currentMonthRemainingDemand: currentMonthRemainingDemand
  };
});
