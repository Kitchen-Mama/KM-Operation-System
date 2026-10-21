/**
 * PSB-DEMO-R2 — ONE SITE, ONE CATEGORY, TWO CURRENCIES.
 *
 * NOT A TEST. Loaded after `_psb-demo-capture.js` by `_psb-demo-r2-runner.js`. On US/Amazon it adds, to
 * every category, EUR-priced copies of that category's first three priced rows (new ids, prices x3 so
 * the EUR axis cannot overlap the USD one, a Prime Big Deal Days line in EUR). The board then draws a
 * USD panel AND a EUR panel for the same site and category — the case where a competitor, a form or a
 * control id keyed without the currency would leak from one panel into the other.
 *
 * Everything still goes in at the socket, through the formal accessor and both adapters. Deterministic:
 * no clock, no randomness.
 */
(function () {
  'use strict';
  var C = (typeof window !== 'undefined' && window.P1B8C_CAPTURE) || null;
  var D = (typeof window !== 'undefined' && window.PSB_DEMO_CAPTURE) || null;
  if (!C || !D) throw new Error('_psb-demo-r2-capture.js must load after _psb-demo-capture.js');
  var base = C.workspaceEnvelope;
  function round2(v) { return Math.round(v * 100) / 100; }

  C.workspaceEnvelope = function (site) {
    var env = base(site);
    if (!(site.country === 'US' && site.marketplace === 'Amazon')) return env;
    var rows = (env && env.data && env.data.normalizedRows) || [];
    var perCat = {};
    var add = [];
    rows.forEach(function (r) {
      if (r.regular_price === null || r.regular_price === undefined) return;
      perCat[r.category] = (perCat[r.category] || 0) + 1;
      if (perCat[r.category] > 3) return;
      var e = JSON.parse(JSON.stringify(r));
      e.marketplace_sku_id = r.marketplace_sku_id + '-EU';
      e.identity = 'MSKU:' + e.marketplace_sku_id;
      e.site_sku = r.site_sku + 'E';
      e.master_sku = r.master_sku + 'E';
      e.variant_group = r.variant_group + '|EUR';
      e.currency = 'EUR';
      e.regular_price = round2(r.regular_price * 3);
      e.minimum_price = r.minimum_price === null ? null : round2(r.minimum_price * 3);
      e.msrp = r.msrp === null ? null : round2(r.msrp * 3);
      if (e.regional) e.regional.site_sku = e.site_sku;
      e.campaigns = [{
        campaign_id: D.PBDD.id, campaign_sku_line_id: D.PBDD.id + '-' + e.marketplace_sku_id,
        campaign_name: D.PBDD.name, status: D.PBDD.status, line_status: 'active',
        start_date: D.PBDD.start, end_date: D.PBDD.end,
        promo_price: round2(e.regular_price * 0.8), regular_price_snapshot: e.regular_price, price_units: 'EUR',
        discount_percent: null, source: 'campaigns + campaign_sku_lines',
        scope_checks: [
          { column: 'company', campaign_value: e.company, scope_value: e.company, matches: true },
          { column: 'country', campaign_value: e.country, scope_value: e.country, matches: true },
          { column: 'marketplace', campaign_value: e.marketplace, scope_value: e.marketplace, matches: true }],
        unverifiable_scope_columns: null
      }];
      e.findings = [];
      add.push(e);
    });
    add.forEach(function (e) { rows.push(e); });
    if (env.data.counts) {
      env.data.counts.siteSkuCount = rows.length;
      env.data.counts.analysableSiteSkuCount = rows.filter(function (x) { return x.analysable; }).length;
    }
    if (env.data.pagination) env.data.pagination.total = rows.length;
    return env;
  };
  window.PSB_DEMO_R2_CAPTURE = { eurRowsPerCategory: 3, priceFactor: 3 };
}());
