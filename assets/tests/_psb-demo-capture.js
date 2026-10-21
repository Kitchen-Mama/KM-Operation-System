/**
 * PSB-DEMO-R1 — THE DETERMINISTIC CAPTURE, WITH CAMPAIGN LINES IN THE SHAPE 72_ ACTUALLY SENDS.
 *
 * NOT A TEST. Loaded after `_p1b8c-capture.js` by `_psb-demo-runner.js`, it wraps the capture's
 * `workspaceEnvelope` and replaces each row's `campaigns` with lines shaped exactly as
 * 72_ ppwIndexCampaigns_ builds them (campaign_id, campaign_sku_line_id, campaign_name, status,
 * line_status, start_date, end_date, promo_price, regular_price_snapshot, price_units,
 * discount_percent, source, scope_checks, unverifiable_scope_columns). The original capture predates
 * that shape (`campaign_id: null`, `deal_price`), so it could not exercise the activity view at all.
 *
 * Everything else in the envelope is untouched and still goes in at the socket, through the formal
 * accessor, the pricing adapter, the live adapter and the selectors.
 *
 * THE CASES, BY INDEX j WITHIN EACH CATEGORY'S PRICED ROWS (deterministic, no clock, no randomness),
 * so every category chart shows each one:
 *   US/Amazon  CMP-PBDD-2026  "Prime Big Deal Days"  2026-10-07..2026-10-08  recorded status `active`
 *              — a PAST period recorded as active: the board must never call it live.
 *                  j == 1       promo_price null            -> DEAL_PRICE_MISSING
 *                  j == 2       price_units ''              -> PROMOTION_CURRENCY_UNRESOLVED
 *                  j == 3       price_units 'EUR'           -> PROMOTION_CURRENCY_MISMATCH
 *                  j == 4       two lines, two prices       -> DUPLICATE_CAMPAIGN_LINE
 *                  otherwise    promo = regular x 0.80, rounded to the cent, price_units 'USD'
 *              CMP-BF-2026    "Black Friday"          2026-11-27..2026-12-01  recorded status `scheduled`
 *                  even rows    promo = regular x 0.70
 *   CA/Amazon  CMP-CA-SPRING  "CA Spring Sale"        2027-03-01..2027-03-14  `scheduled`, CAD
 */
(function () {
  'use strict';
  var C = (typeof window !== 'undefined' && window.P1B8C_CAPTURE) || null;
  if (!C) throw new Error('_psb-demo-capture.js must load after _p1b8c-capture.js');
  var base = C.workspaceEnvelope;

  function round2(v) { return Math.round(v * 100) / 100; }
  function line(id, row, extra) {
    var out = {
      campaign_id: id.id, campaign_sku_line_id: id.id + '-' + row.marketplace_sku_id + (extra && extra.dup ? '-B' : ''),
      campaign_name: id.name, status: id.status, line_status: 'active',
      start_date: id.start, end_date: id.end,
      promo_price: null, regular_price_snapshot: row.regular_price, price_units: id.currency,
      discount_percent: null, source: 'campaigns + campaign_sku_lines',
      scope_checks: [
        { column: 'company', campaign_value: row.company, scope_value: row.company, matches: true },
        { column: 'country', campaign_value: row.country, scope_value: row.country, matches: true },
        { column: 'marketplace', campaign_value: row.marketplace, scope_value: row.marketplace, matches: true }],
      unverifiable_scope_columns: null
    };
    if (extra) { Object.keys(extra).forEach(function (k) { if (k !== 'dup') out[k] = extra[k]; }); }
    return out;
  }
  var PBDD = { id: 'CMP-PBDD-2026', name: 'Prime Big Deal Days', status: 'active',
    start: '2026-10-07', end: '2026-10-08', currency: 'USD' };
  var BF = { id: 'CMP-BF-2026', name: 'Black Friday', status: 'scheduled',
    start: '2026-11-27', end: '2026-12-01', currency: 'USD' };
  var CA = { id: 'CMP-CA-SPRING', name: 'CA Spring Sale', status: 'scheduled',
    start: '2027-03-01', end: '2027-03-14', currency: 'CAD' };

  C.workspaceEnvelope = function (site) {
    var env = base(site);
    var rows = (env && env.data && env.data.normalizedRows) || [];
    var priced = rows.filter(function (r) { return r.regular_price !== null && r.regular_price !== undefined; });
    rows.forEach(function (r) { r.campaigns = []; });
    if (site.country === 'US' && site.marketplace === 'Amazon') {
      var perCat = {};
      priced.forEach(function (r, i) {
        var j = perCat[r.category] = (perCat[r.category] === undefined ? 0 : perCat[r.category] + 1);
        var p = round2(r.regular_price * 0.8);
        if (j === 4) {
          r.campaigns.push(line(PBDD, r, { promo_price: p }));
          r.campaigns.push(line(PBDD, r, { promo_price: round2(p - 1), dup: true }));
        } else if (j === 1) {
          r.campaigns.push(line(PBDD, r, { promo_price: null }));
        } else if (j === 2) {
          r.campaigns.push(line(PBDD, r, { promo_price: p, price_units: '' }));
        } else if (j === 3) {
          r.campaigns.push(line(PBDD, r, { promo_price: p, price_units: 'EUR' }));
        } else {
          r.campaigns.push(line(PBDD, r, { promo_price: p }));
        }
        if (i % 2 === 0) r.campaigns.push(line(BF, r, { promo_price: round2(r.regular_price * 0.7) }));
      });
    }
    if (site.country === 'CA' && site.marketplace === 'Amazon') {
      priced.forEach(function (r, i) {
        if (i % 3 === 0) r.campaigns.push(line(CA, r, { promo_price: round2(r.regular_price * 0.85) }));
      });
    }
    return env;
  };
  window.PSB_DEMO_CAPTURE = { PBDD: PBDD, BF: BF, CA: CA };
}());
