// Kitchen Mama Operation System — Sales Outlook calculator (KMSO) — TARGET-SALES-R2, a LOCAL CANDIDATE.
// =============================================================================================
// Estimated sales for a month range, at ONE grain: site × SKU × month × component (the Regular FC, or one
// Special Event). Every section of the Sales Outlook page — sites, Series, Category, SKU — is a sum over these
// same lines, so changing the grouping, the page or the sort cannot change a total.
//
// It is an ESTIMATE of sales VALUE: forecast quantity × the current price. It is not revenue, not cash, not
// profit; nothing is deducted (fees, tax, refunds, logistics), nothing is converted between currencies.
//
//   Raw tab     Regular FC × current regular price  +  each eligible event's FC in that month × its promo price
//   Target tab  round(Regular FC × Target% / 100) × the SAME regular price  +  the SAME event amounts
//
// AUTHORITIES — called, never copied:
//   Target%        KMPD.resolveTargetRule (supply-planning-planning-demand.js), injected as `resolveTargetRule`:
//                  year + company + country + marketplace exact, then SKU > SERIES > CATEGORY, the month's named
//                  column only; NO_RULES / NO_MATCH = the 100 default (shown as a default); refusals stay null.
//                  The adjusted quantity is round(base × (pct / 100)) once, at this grain — adjustedRegularFc's rule.
//   Regular base   the canonical value-set rule of KMPD.baseRegularFc: identical values on duplicate rows count
//                  once, conflicting values are null, a blank is missing (never 0). The rows are also reported.
//   Regular price  resolved_regular_price from productPricing.workspace.get (pricingResolveEffective_ in 73_):
//                  override, else auto, else null. A legal 0 stays 0. Currency = pricing_list.currency. Review fix 1
//                  (R2: an invalid manual price never becomes the automatic one): an override reported INVALID is
//                  refused; a reported state that contradicts the source is refused; an AUTO price from a backend that
//                  does not report the state is counted as OVERRIDE_UNVERIFIABLE and keeps its total from "verified".
//   Series/Category sku_details via the same rows (the only category authority); blank = unclassified, kept.
//   Events         fc_special_events → campaign_sku_line_id → the campaign line under the site's marketplace SKU
//                  (productPricing, already scope-checked column by column) and the planning eligibility rule of
//                  CAMPAIGN_PROMOTION_RECORD_CONTRACT §2.2: header status confirmed / active / completed, line
//                  status active. Special Event FC is ADDITIONAL demand at 100%, never Target-adjusted
//                  (SUPPLY_PLANNING_CALCULATION_RULES §5, §10). It is placed in its SELLING months, never the
//                  inventory prep month (start − 30 days).
//   Event months   an explicit per-month allocation when one is supplied (`explicitMonthly`; the current schema has
//                  no such field — event_month is the start month — so the data adapter supplies none); otherwise
//                  the whole event's FC is spread over its calendar days, first and last day included, and each
//                  month gets FC × overlap days / event days. Spread over the WHOLE event first, then clipped to
//                  the query: asking for February never moves January's share into it.
// Dates are calendar days in integer arithmetic (no Date, no browser time zone); a timestamp is read in the project
// zone (TZ_OFFSET_MINUTES).
// Pure / deterministic: no clock, no I/O, input never mutated, JSON-safe output.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.core = window.KM.core || {}; window.KM.core.salesOutlook = api; }
  return api;
})(this, function () {
  'use strict';

  var VERSION = 'kmso-target-sales-r2-fix1';
  var MONTH_ABBR = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  var MONTH_RANGE_MAX = 36;
  // the project time zone (appsscript.json "Asia/Taipei", no daylight saving): a sheet date that travels as an
  // instant ('...T16:00:00.000Z') is read back as the calendar day it was written on
  var TZ_OFFSET_MINUTES = 8 * 60;
  // CAMPAIGN_PROMOTION_RECORD_CONTRACT §2.2 — explicit lifecycle only; blank is not a lifecycle
  var ELIGIBLE_CAMPAIGN_STATUS = { confirmed: 1, active: 1, completed: 1 };
  var DEAD_EVENT_ROW = { inactive: 1, deleted: 1, archived: 1, cancelled: 1, canceled: 1, void: 1 };
  // review fix 1 — the raw override cell as a backend that keeps it reports it (72_ candidate, 73_'s parser)
  var OVERRIDE_STATES = ['NUMBER', 'BLANK', 'NA', 'INVALID'];

  function s(v) { return String(v === undefined || v === null ? '' : v).trim(); }
  function U(v) { return s(v).toUpperCase(); }
  function L(v) { return s(v).toLowerCase(); }
  function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0); }
  function dim(y, m) { return [31, (isLeap(y) ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  // a number, or null for blank / non-numeric (0 is a number)
  function num(v) { if (v === null || v === undefined) return null; if (typeof v === 'number') return isFinite(v) ? v : null; var t = s(v); if (t === '') return null; var n = Number(t); return isFinite(n) ? n : null; }
  function siteKey(company, country, marketplace) { return U(company) + '|' + U(country) + '|' + U(marketplace); }

  // ---- months -----------------------------------------------------------------------------------------------
  function parseYm(v) { var m = /^(\d{4})-(\d{2})$/.exec(s(v)); if (!m) return null; var mo = +m[2]; return (mo >= 1 && mo <= 12) ? { y: +m[1], m: mo } : null; }
  function ymOf(y, m) { return y + '-' + pad2(m); }
  function ymIndex(o) { return o.y * 12 + (o.m - 1); }
  // [from .. to] inclusive, across years. { ok, months } or { ok:false, reason }
  function monthRange(from, to) {
    var a = parseYm(from), b = parseYm(to);
    if (!a || !b) return { ok: false, reason: 'INVALID_MONTH' };
    var n = ymIndex(b) - ymIndex(a) + 1;
    if (n < 1) return { ok: false, reason: 'RANGE_REVERSED' };
    if (n > MONTH_RANGE_MAX) return { ok: false, reason: 'RANGE_TOO_LONG', max: MONTH_RANGE_MAX };
    var out = [];
    for (var i = 0; i < n; i++) { var k = ymIndex(a) + i; out.push(ymOf(Math.floor(k / 12), (k % 12) + 1)); }
    return { ok: true, months: out };
  }

  // ---- calendar days ----------------------------------------------------------------------------------------
  // days from 1970-01-01 for a proleptic Gregorian date (H. Hinnant's days_from_civil) — integers only
  function dayNumber(y, m, d) {
    y -= m <= 2 ? 1 : 0;
    var era = Math.floor(y / 400), yoe = y - era * 400;
    var doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
    var doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
    return era * 146097 + doe - 719468;
  }
  function validYmd(y, m, d) { return y >= 1900 && y <= 2999 && m >= 1 && m <= 12 && d >= 1 && d <= dim(y, m); }
  var MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  // A calendar day from what a sheet cell can arrive as: 'YYYY-MM-DD'; an instant 'YYYY-MM-DDThh:mm:ss(.sss)Z'
  // (read in the project zone); Apps Script's String(Date) 'Wed Oct 07 2026 00:00:00 GMT+0800 (...)' (its own wall
  // day). Anything else — and an impossible day like 2026-02-30 — is null, never a guess.
  function parseDay(v) {
    var t = s(v), m;
    if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t))) { var y = +m[1], mo = +m[2], d = +m[3]; return validYmd(y, mo, d) ? { y: y, m: mo, d: d } : null; }
    if ((m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?Z$/.exec(t))) {
      if (!validYmd(+m[1], +m[2], +m[3])) return null;
      var mins = (+m[4]) * 60 + (+m[5]) + TZ_OFFSET_MINUTES, dn = dayNumber(+m[1], +m[2], +m[3]) + Math.floor(mins / 1440);
      return civil(dn);
    }
    if ((m = /^[A-Za-z]{3} ([A-Za-z]{3}) (\d{2}) (\d{4}) \d{2}:\d{2}:\d{2} GMT[+-]\d{4}/.exec(t))) {
      var mm = MON[L(m[1])], yy = +m[3], dd = +m[2];
      return mm && validYmd(yy, mm, dd) ? { y: yy, m: mm, d: dd } : null;
    }
    return null;
  }
  function civil(z) {   // inverse of dayNumber
    z += 719468;
    var era = Math.floor(z / 146097), doe = z - era * 146097;
    var yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
    var y = yoe + era * 400, doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)), mp = Math.floor((5 * doy + 2) / 153);
    var d = doy - Math.floor((153 * mp + 2) / 5) + 1, m = mp + (mp < 10 ? 3 : -9);
    return { y: y + (m <= 2 ? 1 : 0), m: m, d: d };
  }
  function dayStr(o) { return o ? o.y + '-' + pad2(o.m) + '-' + pad2(o.d) : null; }

  // The whole event spread over its days, month by month: [{ ym, days, share }], shares summing to 1. Full
  // precision; no month is rounded. { ok:false, reason } when the window is unusable.
  function prorateByDays(start, end) {
    if (!start || !end) return { ok: false, reason: 'EVENT_DATES_MISSING' };
    var a = dayNumber(start.y, start.m, start.d), b = dayNumber(end.y, end.m, end.d);
    if (b < a) return { ok: false, reason: 'EVENT_DATES_REVERSED' };
    var total = b - a + 1, out = [], y = start.y, m = start.m;
    while (true) {
      var ms = dayNumber(y, m, 1), me = dayNumber(y, m, dim(y, m));
      var lo = Math.max(a, ms), hi = Math.min(b, me);
      if (hi >= lo) out.push({ ym: ymOf(y, m), days: hi - lo + 1, share: (hi - lo + 1) / total });
      if (me >= b) break;
      m++; if (m > 12) { m = 1; y++; }
    }
    return { ok: true, totalDays: total, months: out };
  }

  // ---- the site rows (productPricing.workspace.get normalizedRows), indexed ---------------------------------
  function indexSite(site) {
    var bySku = {}, byLine = {}, lineDup = {};
    (site.rows || []).forEach(function (r) {
      var k = U(r.master_sku);
      if (k) (bySku[k] = bySku[k] || []).push(r);
      (r.campaigns || []).forEach(function (c) {
        var lid = s(c.campaign_sku_line_id);
        if (!lid) return;
        if (byLine[lid]) { lineDup[lid] = 1; return; }
        byLine[lid] = { line: c, row: r };
      });
    });
    return { bySku: bySku, byLine: byLine, lineDup: lineDup };
  }

  // ---- the canonical value-set base (KMPD.baseRegularFc), with the rows that made it -------------------------
  function regularBase(group, abbr) {
    var vals = {}, blank = 0, nonNumeric = 0;
    group.forEach(function (r) {
      var v = r[abbr];
      if (v === '' || v === null || v === undefined) { blank++; return; }
      var n = num(v);
      if (n === null) { nonNumeric++; return; }
      vals[String(n)] = n;
    });
    var keys = Object.keys(vals);
    if (keys.length === 1) return { qty: vals[keys[0]], state: group.length > 1 ? 'DUPLICATE_SAME_VALUE' : 'OK', rows: group.length };
    if (keys.length > 1) return { qty: null, state: 'CONFLICT', values: keys.map(Number).sort(function (a, b) { return a - b; }), rows: group.length };
    return { qty: null, state: nonNumeric ? 'INVALID' : 'MISSING', rows: group.length };
  }

  /**
   * compute(input) → { ok, months, lines, diagnostics, sites, notices }
   * input: {
   *   from, to                     'YYYY-MM' (inclusive)
   *   regularRows, eventRows, targetRuleRows   raw snake_case rows (fcSummary.workspace.get slices)
   *   sites: [{ company, country, marketplace, state ('READY' | 'SOURCE_EMPTY' | 'SOURCE_PARTIALLY_READABLE' |
   *            'STOP_DATA_INTEGRITY' | 'FAILED'), reason?, rows: productPricing normalizedRows (every page) }]
   *   resolveTargetRule            KMPD.resolveTargetRule
   *   explicitMonthly              optional { eventKey: { 'YYYY-MM': qty } } — none exists in the current schema
   *   sourceCapped                 optional { regular, events, rules } (the read owner's `capped`)
   * }
   */
  function compute(input) {
    input = input || {};
    var range = monthRange(input.from, input.to);
    if (!range.ok) return { ok: false, reason: range.reason, max: range.max, lines: [], diagnostics: [] };
    if (typeof input.resolveTargetRule !== 'function') return { ok: false, reason: 'TARGET_AUTHORITY_UNAVAILABLE', lines: [], diagnostics: [] };
    var months = range.months, inRange = {};
    months.forEach(function (ym) { inRange[ym] = 1; });
    var lines = [], diags = [], notices = [];
    function diag(code, o) { var d = { code: code }; for (var k in (o || {})) d[k] = o[k]; diags.push(d); return d; }

    // sites: only the requested ones, by canonical key
    var sites = {}, siteOrder = [];
    (input.sites || []).forEach(function (st) {
      var key = siteKey(st.company, st.country, st.marketplace);
      if (!s(st.company) || !s(st.country) || !s(st.marketplace)) { diag('SITE_IDENTITY_INCOMPLETE', { site: key }); return; }
      if (sites[key]) { diag('SITE_REQUESTED_TWICE', { site: key }); return; }
      sites[key] = { key: key, company: s(st.company), country: s(st.country), marketplace: s(st.marketplace), state: s(st.state) || 'FAILED', reason: st.reason || null, idx: indexSite(st) };
      siteOrder.push(key);
      if (sites[key].state !== 'READY') diag('SITE_' + sites[key].state, { site: key, detail: st.reason || null });
    });
    var cap = input.sourceCapped || {};
    ['regular', 'events', 'rules'].forEach(function (k) { if (cap[k]) diag('SOURCE_CAPPED', { source: k }); });

    // per site + SKU: the master facts (one listing, or named)
    function master(site, sku) {
      var hits = site.idx.bySku[U(sku)] || [];
      if (!hits.length) return { state: 'NOT_LISTED_ON_SITE', row: null };
      if (hits.length > 1) return { state: 'MULTIPLE_SITE_LISTINGS', row: null, count: hits.length };
      return { state: 'OK', row: hits[0] };
    }
    function classOf(m) {
      var r = m.row;
      return { series: r ? (s(r.series) || null) : null, category: r ? (s(r.category) || null) : null };
    }
    function regularPrice(site, m) {
      if (site.state === 'STOP_DATA_INTEGRITY' || site.state === 'FAILED') return { price: null, currency: null, why: 'SITE_' + site.state };
      if (m.state !== 'OK') return { price: null, currency: null, why: 'SKU_' + m.state };
      var r = m.row, p = num(r.resolved_regular_price), cur = s(r.currency) || null, src = r.regular_price_source || null;
      // review fix 1 — R2: an INVALID manual price is never counted as the automatic price behind it. The state of the raw
      // override cell is reported only by a backend that keeps it (regular_price_override_state, a candidate not yet
      // adopted); when it is reported it must agree with the source, and when it is not, an AUTO price is still counted
      // but cannot be called checked (OVERRIDE_UNVERIFIABLE) — so no total holding one is called verified.
      var st = r.regular_price_override_state === undefined || r.regular_price_override_state === null ? null : s(r.regular_price_override_state).toUpperCase();
      if (st === 'INVALID') return { price: null, currency: cur, why: 'REGULAR_PRICE_OVERRIDE_INVALID', source: src };
      if (st !== null && ((src === 'AUTO' && st !== 'BLANK') || (src === 'OVERRIDE' && st !== 'NUMBER') || (src === 'NA' && st !== 'NA') || OVERRIDE_STATES.indexOf(st) < 0)) {
        return { price: null, currency: cur, why: 'REGULAR_PRICE_SOURCE_CONTRADICTS_OVERRIDE', source: src, override_state: st };
      }
      if (r.resolved_regular_price === null || r.resolved_regular_price === undefined || r.resolved_regular_price === '') return { price: null, currency: cur, why: 'REGULAR_PRICE_MISSING', source: src };
      if (p === null) return { price: null, currency: cur, why: 'REGULAR_PRICE_INVALID' };
      if (p < 0) return { price: null, currency: cur, why: 'REGULAR_PRICE_NEGATIVE' };
      if (!cur) return { price: null, currency: null, why: 'CURRENCY_MISSING' };
      return { price: p, currency: cur, why: null, source: src, check: src === 'AUTO' && st === null ? 'OVERRIDE_UNVERIFIABLE' : 'CHECKED' };
    }

    // ---- REGULAR: group the raw rows by site + SKU + year ------------------------------------------------------
    var groups = {}, universe = {};   // universe: site|sku -> 1 (a SKU with any FC on the site)
    (input.regularRows || []).forEach(function (r, i) {
      var key = siteKey(r.company, r.country, r.marketplace), sku = s(r.sku);
      if (!s(r.company) || !s(r.country) || !s(r.marketplace) || !sku) { diag('REGULAR_FC_ROW_IDENTITY_INCOMPLETE', { row: i, forecast_id: s(r.forecast_id) || null }); return; }
      if (!sites[key]) return;    // not a requested site
      var y = s(r.year);
      if (!/^\d{4}$/.test(y)) { diag('REGULAR_FC_ROW_YEAR_INVALID', { site: key, sku: sku, forecast_id: s(r.forecast_id) || null }); return; }
      var g = key + '#' + U(sku) + '#' + y;
      (groups[g] = groups[g] || { site: key, sku: sku, year: y, rows: [] }).rows.push(r);
      universe[key + '#' + U(sku)] = universe[key + '#' + U(sku)] || { site: key, sku: sku };
    });
    Object.keys(groups).forEach(function (g) { if (groups[g].rows.length > 1) diag('REGULAR_FC_DUPLICATE_ROWS', { site: groups[g].site, sku: groups[g].sku, year: groups[g].year, rows: groups[g].rows.length, rule: 'identical month values count once; different values are a conflict (KMPD.baseRegularFc)' }); });

    // ---- EVENTS: identity, de-duplication, eligibility, window --------------------------------------------------
    var events = [], byId = {}, conflictIds = {};
    (input.eventRows || []).forEach(function (r, i) {
      var key = siteKey(r.company, r.country, r.marketplace);
      var id = s(r.event_fc_id), lid = s(r.campaign_sku_line_id);
      var ek = id ? 'EVT:' + id : (lid ? 'LINE:' + lid : '');
      if (!sites[key]) { if (s(r.company) && s(r.country) && s(r.marketplace)) return; }
      if (!ek) { diag('EVENT_IDENTITY_MISSING', { row: i, site: key }); return; }
      var sig = JSON.stringify([key, U(r.sku), lid, s(r.campaign_id), s(r.fc_qty), s(r.event_start_date), s(r.event_end_date), s(r.status)]);
      if (byId[ek]) {
        if (byId[ek].sig === sig) { byId[ek].copies++; return; }      // the same row twice in transport: once
        conflictIds[ek] = 1; return;
      }
      byId[ek] = { key: ek, sig: sig, row: r, site: key, copies: 1 };
      events.push(byId[ek]);
    });
    events.forEach(function (e) { if (e.copies > 1) diag('EVENT_DUPLICATE_SAME_CONTENT', { event: e.key, copies: e.copies, counted: 1 }); });
    var perLine = {};
    events.forEach(function (e) { var lid = s(e.row.campaign_sku_line_id); if (lid) (perLine[lid] = perLine[lid] || []).push(e.key); });

    events.forEach(function (e) {
      var r = e.row, key = e.site, site = sites[key];
      var base = { site: key, sku: s(r.sku), event: e.key, event_fc_id: s(r.event_fc_id) || null, campaign_id: s(r.campaign_id) || null, campaign_sku_line_id: s(r.campaign_sku_line_id) || null, event_name: s(r.event_name || r.event) || null };
      function drop(code, more) { var d = diag(code, base); for (var k in (more || {})) d[k] = more[k]; }
      if (conflictIds[e.key]) return drop('EVENT_ID_CONFLICT', { detail: 'one stable id with different contents; none is counted' });
      if (!site) return drop('EVENT_SITE_INCOMPLETE');
      if (DEAD_EVENT_ROW[L(r.status)]) return drop('EVENT_ROW_INACTIVE', { status: s(r.status) });
      var lid = base.campaign_sku_line_id;
      if (!lid) return drop('EVENT_NOT_LINKED_TO_CAMPAIGN_LINE');
      if ((perLine[lid] || []).length > 1) return drop('EVENT_LINE_HAS_SEVERAL_EVENTS', { events: perLine[lid].slice().sort(), detail: 'a campaign line carries one event FC; which of several counts is not decidable' });
      if (site.idx.lineDup[lid]) return drop('CAMPAIGN_LINE_DUPLICATED');
      var hit = site.idx.byLine[lid];
      if (!hit) return drop(site.state === 'READY' ? 'CAMPAIGN_LINE_NOT_ON_SITE' : 'SITE_' + site.state);
      var c = hit.line;
      if (base.campaign_id && s(c.campaign_id) !== base.campaign_id) return drop('EVENT_CAMPAIGN_MISMATCH');
      if (U(hit.row.master_sku) !== U(r.sku)) return drop('EVENT_SKU_MISMATCH', { line_sku: s(hit.row.master_sku) });
      if (c.unverifiable_scope_columns && c.unverifiable_scope_columns.length) return drop('CAMPAIGN_SCOPE_UNVERIFIABLE', { columns: c.unverifiable_scope_columns });
      if (!ELIGIBLE_CAMPAIGN_STATUS[L(c.status)]) return drop(s(c.status) ? 'CAMPAIGN_STATUS_INELIGIBLE' : 'CAMPAIGN_STATUS_BLANK', { status: s(c.status) || null });
      if (L(c.line_status) !== 'active') return drop('CAMPAIGN_LINE_INACTIVE', { line_status: s(c.line_status) || null });
      // the window: the event's own snapshot; the campaign header only when the snapshot is blank; both, and
      // different, is a conflict that is not resolved here
      var es = s(r.event_start_date), ee = s(r.event_end_date), basis = 'EVENT_ROW';
      var ps = es ? parseDay(es) : null, pe = ee ? parseDay(ee) : null;
      var cs = parseDay(c.start_date), ce = parseDay(c.end_date);
      if (!es && !ee) { ps = cs; pe = ce; basis = 'CAMPAIGN_WINDOW'; if (!ps || !pe) return drop((s(c.start_date) || s(c.end_date)) ? 'EVENT_DATES_INVALID' : 'EVENT_DATES_MISSING'); }
      else {
        if ((es && !ps) || (ee && !pe)) return drop('EVENT_DATES_INVALID', { start: es || null, end: ee || null });
        if (!ps || !pe) return drop('EVENT_DATES_MISSING', { start: es || null, end: ee || null });
        if (cs && ce && (dayStr(cs) !== dayStr(ps) || dayStr(ce) !== dayStr(pe))) return drop('EVENT_WINDOW_CONFLICT', { event_window: [dayStr(ps), dayStr(pe)], campaign_window: [dayStr(cs), dayStr(ce)] });
      }
      // from here on the window is known, so a drop says WHEN the uncounted event runs (R3: it makes only the
      // periods it overlaps unknown, not every year)
      var win = [dayStr(ps), dayStr(pe)];
      var qty = num(r.fc_qty);
      if (s(r.fc_qty) === '') return drop('EVENT_FC_MISSING', { window: win });
      if (qty === null) return drop('EVENT_FC_INVALID', { value: s(r.fc_qty), window: win });
      if (qty < 0) return drop('EVENT_FC_NEGATIVE', { window: win });
      var split;
      var ex = input.explicitMonthly && input.explicitMonthly[e.key];
      if (ex) {
        var sum = 0, ok = true, parts = [];
        Object.keys(ex).sort().forEach(function (ym) { var q = num(ex[ym]); if (!parseYm(ym) || q === null || q < 0) ok = false; else { sum += q; parts.push({ ym: ym, qty: q }); } });
        if (!ok) return drop('EVENT_MONTHLY_ALLOCATION_INVALID', { window: win });
        if (Math.abs(sum - qty) > 1e-9 * Math.max(1, Math.abs(qty))) return drop('EVENT_MONTHLY_TOTAL_CONFLICT', { monthly_total: sum, event_total: qty, window: win });
        split = { basis: 'EXPLICIT_MONTHLY', parts: parts };
      } else {
        var pr = prorateByDays(ps, pe);
        if (!pr.ok) return drop(pr.reason);
        split = { basis: 'DAY_PRORATED', totalDays: pr.totalDays, parts: pr.months.map(function (x) { return { ym: x.ym, qty: qty * x.share, days: x.days }; }) };
      }
      var price = num(c.promo_price), cur = s(c.price_units) || null, siteCur = s(hit.row.currency) || null, why = null;
      if (c.promo_price === null || c.promo_price === undefined || c.promo_price === '') why = 'PROMO_PRICE_MISSING';
      else if (price === null) why = 'PROMO_PRICE_INVALID';
      else if (!(price > 0)) why = 'PROMO_PRICE_NOT_POSITIVE';          // the contract: promo_price > 0
      else if (!cur) why = 'PROMO_CURRENCY_MISSING';
      else if (!siteCur) why = 'CURRENCY_MISSING';
      else if (U(cur) !== U(siteCur)) why = 'PROMO_CURRENCY_CONFLICT';
      var reg = num(hit.row.resolved_regular_price);
      var warn = (why === null && reg !== null && price > reg) ? ['PROMO_ABOVE_CURRENT_REGULAR'] : [];
      universe[key + '#' + U(r.sku)] = universe[key + '#' + U(r.sku)] || { site: key, sku: s(r.sku) };
      var cls = classOf({ row: hit.row });
      split.parts.forEach(function (p) {
        if (!inRange[p.ym]) return;          // spread first, clipped to the query after
        lines.push({
          component: 'EVENT', site: key, company: site.company, country: site.country, marketplace: site.marketplace,
          sku: s(r.sku), marketplace_sku_id: s(hit.row.marketplace_sku_id) || null, series: cls.series, category: cls.category,
          month: p.ym, currency: why === 'PROMO_CURRENCY_CONFLICT' ? null : (siteCur || cur),
          qty: p.qty, qtyTarget: p.qty, price: why ? null : price, priceKind: 'PROMO',
          amount: why ? null : p.qty * price, amountTarget: why ? null : p.qty * price,
          event: { key: e.key, event_fc_id: base.event_fc_id, campaign_id: s(c.campaign_id), campaign_sku_line_id: lid, name: base.event_name || s(c.campaign_name) || null,
            start: dayStr(ps), end: dayStr(pe), window_basis: basis, total_qty: qty, basis: split.basis, total_days: split.totalDays || null, days: p.days || null,
            estimate: split.basis === 'DAY_PRORATED' && split.parts.length > 1, campaign_status: s(c.status), promo_currency: cur },
          issues: (why ? [why] : []).concat(warn)
        });
      });
    });

    // ---- REGULAR lines: every month of the query, for every SKU with any FC on the site --------------------------
    Object.keys(universe).sort().forEach(function (u) {
      var site = sites[universe[u].site], sku = universe[u].sku, m = master(site, sku), cls = classOf(m), rp = regularPrice(site, m);
      months.forEach(function (ym) {
        var p = parseYm(ym), abbr = MONTH_ABBR[p.m - 1];
        var g = groups[site.key + '#' + U(sku) + '#' + p.y], b = g ? regularBase(g.rows, abbr) : { qty: null, state: 'NO_ROW', rows: 0 };
        var issues = [];
        if (b.qty === null) issues.push(b.state === 'CONFLICT' ? 'REGULAR_FC_CONFLICT' : b.state === 'INVALID' ? 'REGULAR_FC_INVALID' : b.state === 'NO_ROW' ? 'REGULAR_FC_NO_ROW' : 'REGULAR_FC_MISSING');
        var t = input.resolveTargetRule(input.targetRuleRows || [], { year: String(p.y), company: site.company, country: site.country, marketplace: site.marketplace,
          category: cls.category || '', series: cls.series || '', sku: sku, month: p.m });
        var target = { reason: t.reason, pct: t.targetPct, ruleId: t.targetRuleId, scopeType: t.scopeType, scopeId: t.scopeId, sourceMonth: t.sourceMonth || (abbr + '_pct'), isDefault: t.reason === 'NO_RULES' || t.reason === 'NO_MATCH' };
        if (t.targetPct === null) issues.push('TARGET_REFUSED_' + t.reason);
        var qt = (b.qty === null || t.targetPct === null) ? null : Math.round(b.qty * (t.targetPct / 100));
        if (rp.why) issues.push(rp.why);
        lines.push({
          component: 'REGULAR', site: site.key, company: site.company, country: site.country, marketplace: site.marketplace,
          sku: sku, marketplace_sku_id: m.row ? (s(m.row.marketplace_sku_id) || null) : null, series: cls.series, category: cls.category,
          month: ym, currency: rp.currency, qty: b.qty, qtyTarget: qt, price: rp.price, priceKind: 'REGULAR', priceSource: rp.source || null, priceCheck: rp.check || null,
          amount: (b.qty === null || rp.price === null) ? null : b.qty * rp.price,
          amountTarget: (qt === null || rp.price === null) ? null : qt * rp.price,
          base: { state: b.state, rows: b.rows, values: b.values || null }, target: target, issues: issues
        });
      });
    });

    lines.sort(function (a, b) { return a.site < b.site ? -1 : a.site > b.site ? 1 : U(a.sku) < U(b.sku) ? -1 : U(a.sku) > U(b.sku) ? 1 : a.month < b.month ? -1 : a.month > b.month ? 1 : a.component < b.component ? 1 : a.component > b.component ? -1 : (a.event && b.event ? (a.event.key < b.event.key ? -1 : 1) : 0); });
    notices.push({ code: 'EXPLICIT_MONTHLY_ALLOCATION_NOT_IN_SCHEMA', detail: 'fc_special_events carries one fc_qty per campaign line and event_month = the start month; every multi-month event is spread by days and marked as an estimate' });
    notices.push({ code: 'CURRENT_PRICES_ONLY', detail: 'prices are the current resolved regular price and the stored promo price; no historical price is reconstructed' });
    var unverifiable = lines.filter(function (l) { return l.priceCheck === 'OVERRIDE_UNVERIFIABLE'; }).length;
    if (unverifiable) notices.push({ code: 'AUTO_PRICE_OVERRIDE_UNVERIFIABLE', lines: unverifiable, detail: 'these lines use an automatic regular price; this backend does not report whether a manual price beside it is invalid, so a total holding them is counted but not called verified' });
    return { ok: true, version: VERSION, months: months, lines: lines, diagnostics: diags, notices: notices,
      sites: siteOrder.map(function (k) { return { key: k, company: sites[k].company, country: sites[k].country, marketplace: sites[k].marketplace, state: sites[k].state, reason: sites[k].reason }; }) };
  }

  // ---- R3: the same months one year earlier — the STORED ORIGINAL FC Units only ----------------------------------
  // Owner (R3): phase 1 compares FC Units with the same period last year; no last-year sales, no actuals, no
  // historical price. The comparison months are the selected calendar months each moved back 12 (a range across a
  // year end moves as a whole: Nov 2026 – Feb 2027 is compared with Nov 2025 – Feb 2026). Last year is computed by
  // THIS calculator over the same rows and sites with the same rules — Regular: the stored month value of that
  // year (never this year's Target% applied backwards); Special Event: last year's eligible events, spread over
  // their own days the same way (a Feb 29 is just another day of its event). There is no authoritative link between
  // one year's campaign and the next (no field carries it), so events are compared as a PERIOD, never as "the same
  // event".
  function shiftYm(ym, k) { var p = parseYm(ym); if (!p) return null; var i = ymIndex(p) + k; return ymOf(Math.floor(i / 12), (i % 12) + 1); }
  function comparisonRange(from, to) { return { from: shiftYm(from, -12), to: shiftYm(to, -12) }; }
  function computeLastYear(input) {
    var i = {}; for (var k in (input || {})) i[k] = input[k];
    var r = comparisonRange(input && input.from, input && input.to);
    i.from = r.from; i.to = r.to;
    return compute(i);
  }
  // site|SKU pairs whose Special Event FC in THIS result's months is not fully known. An event left out by the
  // eligibility rule (draft, cancelled, inactive line, blank status) is KNOWN to be out - it makes nothing unknown.
  // An event left out for a data problem makes the months it overlaps unknown when its window is known, and every
  // month when it is not (an impossible or missing date could be any year).
  var EXCLUDED_BY_RULE = { CAMPAIGN_STATUS_INELIGIBLE: 1, CAMPAIGN_STATUS_BLANK: 1, CAMPAIGN_LINE_INACTIVE: 1, EVENT_ROW_INACTIVE: 1 };
  function eventUnknownKeys(result) {
    var o = {}, ms = (result && result.months) || [], lo = ms[0], hi = ms[ms.length - 1];
    ((result && result.diagnostics) || []).forEach(function (d) {
      if (!d.event || !d.site || !d.sku || EXCLUDED_BY_RULE[d.code]) return;
      if (d.window && lo && (d.window[1].slice(0, 7) < lo || d.window[0].slice(0, 7) > hi)) return;   // runs outside these months
      o[d.site + '|' + U(d.sku)] = d.code;
    });
    return o;
  }
  /**
   * Units YoY for ONE group: `cur` = this period's lines of the group, `ly` = last year's lines of the SAME group.
   * Paired at site × SKU × month × component (last year's month + 12). The percentage is computed from the SUMS over
   * the pairs that are known on BOTH sides — never an average of line percentages — and the coverage says how many
   * pairs that is. Regular: a missing line or a null quantity is unknown, never 0. Special Event: no event is a real
   * 0, unless an event of that site and SKU could not be counted in that year (then unknown).
   * tab 'target' reads this period's Target Units; last year is always the original FC (stated in the label).
   */
  function yoyUnits(cur, ly, tab, unknownCur, unknownLy) {
    unknownCur = unknownCur || {}; unknownLy = unknownLy || {};
    var slots = {}, order = [];
    function slot(c, site, sku, month) { var k = c + '|' + site + '|' + U(sku) + '|' + month; if (!slots[k]) { slots[k] = { c: c, site: site, sku: U(sku), cur: 0, curSeen: false, curNull: false, ly: 0, lySeen: false, lyNull: false }; order.push(k); } return slots[k]; }
    (cur || []).forEach(function (l) { var s = slot(l.component, l.site, l.sku, l.month), q = tab === 'target' ? l.qtyTarget : l.qty; s.curSeen = true; if (q === null) s.curNull = true; else s.cur += q; });
    (ly || []).forEach(function (l) { var s = slot(l.component, l.site, l.sku, shiftYm(l.month, 12)), q = l.qty; s.lySeen = true; if (q === null) s.lyNull = true; else s.ly += q; });
    var out = { cur: 0, ly: 0, curAll: 0, comparable: 0, pairs: order.length, reasons: {} };
    function why(r) { out.reasons[r] = (out.reasons[r] || 0) + 1; }
    order.forEach(function (k) {
      var s = slots[k], curOk, lyOk;
      if (s.c === 'EVENT') {
        curOk = !s.curNull && !unknownCur[s.site + '|' + s.sku]; lyOk = !s.lyNull && !unknownLy[s.site + '|' + s.sku];
        if (!curOk) why('EVENT_NOT_FULLY_COUNTED_THIS_PERIOD'); if (!lyOk) why('EVENT_NOT_FULLY_COUNTED_LAST_YEAR');
      } else {
        curOk = s.curSeen && !s.curNull; lyOk = s.lySeen && !s.lyNull;
        if (!curOk) why(s.curSeen ? 'UNITS_MISSING_THIS_PERIOD' : 'NO_LINE_THIS_PERIOD'); if (!lyOk) why(s.lySeen ? 'LAST_YEAR_FC_MISSING' : 'NO_LINE_LAST_YEAR');
      }
      if (curOk) out.curAll += s.cur;
      if (curOk && lyOk) { out.comparable++; out.cur += s.cur; out.ly += s.ly; }
    });
    out.complete = out.pairs > 0 && out.comparable === out.pairs;
    if (!out.comparable) { out.state = 'NOT_COMPARABLE'; out.pct = null; }
    else if (out.ly === 0) { out.state = out.cur > 0 ? 'NEW_ZERO_BASE' : 'FLAT_ZERO_BASE'; out.pct = null; }
    else { out.pct = (out.cur - out.ly) / out.ly * 100; out.state = out.pct > 0 ? 'UP' : out.pct < 0 ? 'DOWN' : 'FLAT'; }
    return out;
  }

  // ---- aggregation: every section sums the SAME lines ---------------------------------------------------------
  var DIMS = { site: function (l) { return l.site; }, sku: function (l) { return U(l.sku); }, series: function (l) { return l.series === null ? '\u0000UNCLASSIFIED' : l.series; },
    category: function (l) { return l.category === null ? '\u0000UNCLASSIFIED' : l.category; }, month: function (l) { return l.month; }, component: function (l) { return l.component; },
    event: function (l) { return l.event ? l.event.key : '\u0000REGULAR'; },
    // R3 — one item per REAL event: the campaign on its site (a campaign's SKU lines are its parts)
    campaign: function (l) { return l.event ? l.site + '|' + l.event.campaign_id : '\u0000REGULAR'; } };
  // lines → groups by currency + the named dimensions. tab: 'raw' | 'target'. Each group: qty (known quantities),
  // amount (computable amounts), regular/event splits, and the counts that say how complete it is.
  function aggregate(lines, tab, dims) {
    dims = dims || [];
    var target = tab === 'target', out = {}, order = [];
    (lines || []).forEach(function (l) {
      var keyParts = [l.currency === null ? '\u0000NO_CURRENCY' : U(l.currency)].concat(dims.map(function (d) { return DIMS[d](l); }));
      var k = keyParts.join('\u0001');
      var g = out[k];
      if (!g) {
        g = out[k] = { key: keyParts, currency: l.currency === null ? null : U(l.currency), qty: 0, amount: 0, regularQty: 0, eventQty: 0, regularAmount: 0, eventAmount: 0,
          lines: 0, qtyMissing: 0, amountMissing: 0, estimatedLines: 0, priceUnverified: 0 };
        dims.forEach(function (d, i) { g[d] = keyParts[i + 1]; });
        order.push(k);
      }
      var q = target ? l.qtyTarget : l.qty, a = target ? l.amountTarget : l.amount;
      g.lines++;
      if (q === null) g.qtyMissing++; else { g.qty += q; if (l.component === 'EVENT') g.eventQty += q; else g.regularQty += q; }
      if (a === null) g.amountMissing++; else { g.amount += a; if (l.component === 'EVENT') g.eventAmount += a; else g.regularAmount += a; }
      if (l.event && l.event.estimate) g.estimatedLines++;
      if (a !== null && l.priceCheck === 'OVERRIDE_UNVERIFIABLE') g.priceUnverified++;
    });
    // complete: every amount computable; verified: complete AND no amount rests on a price whose manual cell is unchecked
    return order.map(function (k) { var g = out[k]; g.complete = g.amountMissing === 0 && g.qtyMissing === 0; g.verified = g.complete && g.priceUnverified === 0; return g; });
  }

  return { VERSION: VERSION, MONTH_RANGE_MAX: MONTH_RANGE_MAX, monthRange: monthRange, parseDay: parseDay, prorateByDays: prorateByDays,
    dayNumber: dayNumber, compute: compute, aggregate: aggregate, siteKey: siteKey, ELIGIBLE_CAMPAIGN_STATUS: ELIGIBLE_CAMPAIGN_STATUS,
    shiftYm: shiftYm, comparisonRange: comparisonRange, computeLastYear: computeLastYear, eventUnknownKeys: eventUnknownKeys, yoyUnits: yoyUnits };
});
