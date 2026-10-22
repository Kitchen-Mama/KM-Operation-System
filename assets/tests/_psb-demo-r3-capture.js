/**
 * PSB-DEMO-R3 — THE PRODUCTION RESPONSES OF 2026-10-22, SERVED AT THE SOCKET.
 *
 * NOT A TEST, AND NOT A FIXTURE THAT INVENTS ANYTHING. Loaded after `_p1b8c-capture.js` (whose
 * transport, accessor wiring and adapters are unchanged) by `_psb-demo-r3-runner.js`. It replaces the
 * capture's two envelope builders with the exact bodies production returned that morning, read with the
 * guarded read-only driver (docs/evidence/r55-readonly-acceptance/run-1 and psb-demo-r3/production-read):
 *
 *   productPricing.siteUniverse.get                      the ten production sites
 *   productPricing.workspace.get  ResTW / CA / Amazon    52 rows  (the CO1150 activity case, 3 Phasing Out)
 *   productPricing.workspace.get  ResUS / US / Amazon    100 rows (CO2100: 3 Phasing Out, one was the photo)
 *   productPricing.workspace.get  ResUS / US / Walmart   18 rows  (GM1100: every member Phasing Out)
 *
 * The other seven sites were not read, so they answer an honest empty workspace rather than a borrowed one.
 * The bytes live in `_psb-demo-r3-prod-data.js` (window.PSB_R3_PROD), generated from the saved bodies.
 */
(function () {
  'use strict';
  var C = (typeof window !== 'undefined' && window.P1B8C_CAPTURE) || null;
  var P = (typeof window !== 'undefined' && window.PSB_R3_PROD) || null;
  if (!C || !P) throw new Error('_psb-demo-r3-capture.js must load after _p1b8c-capture.js and _psb-demo-r3-prod-data.js');
  function copy(v) { return JSON.parse(JSON.stringify(v)); }
  function empty(site) {
    return { success: true, data: { sourceState: 'SOURCE_EMPTY',
      scope: { company: site.company, country: site.country, marketplace: site.marketplace },
      normalizedRows: [], counts: { siteSkuCount: 0, analysableSiteSkuCount: 0 },
      filterOptions: { categories: [], series: [] }, pagination: { total: 0, limit: 1000, nextCursor: null },
      findings: [], refusals: [], analysis_permitted: false,
      schema: P.workspaces['ResTW|CA|Amazon'].data.schema },
      meta: copy(P.workspaces['ResTW|CA|Amazon'].meta), errors: [] };
  }
  /* LAYOUT-ONLY SYNTHESIS, NAMED AS SUCH. `window.PSB_R3_SYNTH = true` (set by the runner's `synth` pass and by
     nothing else) adds, to ResTW CA, a EUR copy of every Electric Can Opener row with a long variant-group
     name, so one category draws two currency panels and long lane labels. Production has neither — every
     production category is single-currency — so this pass proves layout only, and its screenshots say so. */
  function synth(env) {
    var rows = env.data.normalizedRows, add = [];
    rows.forEach(function (r) {
      if (r.category !== 'Electric Can Opener') return;
      var e = copy(r);
      e.marketplace_sku_id = r.marketplace_sku_id + '-SYNTH-EUR';
      e.identity = 'MSKU:' + e.marketplace_sku_id;
      e.site_sku = r.site_sku + '-EU';
      e.master_sku = r.master_sku + '-EU';
      e.variant_group = r.variant_group + '-EUROPEAN-EDITION-LONG-NAME';
      e.currency = 'EUR';
      (e.campaigns || []).forEach(function (c) { c.price_units = 'EUR'; c.campaign_sku_line_id = (c.campaign_sku_line_id || '') + '-EU'; });
      add.push(e);
    });
    add.forEach(function (e) { rows.push(e); });
    return env;
  }
  C.universeEnvelope = function () { return copy(P.universe); };
  C.workspaceEnvelope = function (site) {
    var k = site.company + '|' + site.country + '|' + site.marketplace;
    if (!P.workspaces[k]) return empty(site);
    var env = copy(P.workspaces[k]);
    return (window.PSB_R3_SYNTH === true && k === 'ResTW|CA|Amazon') ? synth(env) : env;
  };
  C.workspaces = function () {
    var out = {};
    (P.universe.data.sites || []).forEach(function (s) {
      var k = s.company + '|' + s.country + '|' + s.marketplace;
      out[k] = C.workspaceEnvelope(s);
    });
    return out;
  };
  C.R3_SOURCE = 'production 2026-10-22 (read-only)';
}());
