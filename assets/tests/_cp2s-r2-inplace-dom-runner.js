/**
 * S8-B3-R3-CP2S-R2 - WHAT SURVIVES THE ARRIVAL, MEASURED IN A REAL BROWSER.
 *
 * CP2S-R1 replaced a full `renderReplenishment()` with a two-cell in-place update, and accepted it with a
 * hand-built DOM in node. That fixture proved less than it looked: it tracked focus with a LOCAL VARIABLE
 * (`focused === T.panels['SKU-A'].input`) that was never handed to the code under test, so the assertion
 * compared the harness to itself and would have passed against a function that cleared focus. There was no
 * `document.activeElement`, no selection range, no layout and no scrolling, because the fake had none.
 *
 * This runner uses the REAL page in REAL Chrome: real index.html, real app.js, the real partial loader, the
 * real `toggleReplenRow`, the real Execution Plan card, and a real `recommendation.workspace.get` answered
 * over HTTP. It then does what the operator does - expands a row, puts the caret in the middle of a
 * half-typed quantity, scrolls - and lets a SECOND workspace read land on top of that.
 *
 * THE ARRIVAL IS REAL, NOT SIMULATED. The second read goes through
 * `invalidateRecommendationSessionCache()` + `loadRecommendationWorkspace_()`, so the envelope crosses the
 * network stub, the real `_irRecoApplyEnvelope` maps it, and the page's own refresh runs. Nothing calls the
 * updater directly.
 *
 * WHAT IS READ BACK, and why each one needs a browser:
 *   activeElement   - document.activeElement, by a marker property set on the node BEFORE the arrival.
 *                     A rebuilt input is a different object and carries no marker, so "same node" cannot be
 *                     faked by an equal-looking replacement.
 *   selection       - selectionStart/selectionEnd. A node that is re-created keeps neither.
 *   value           - the half-typed '1234' the operator had not finished.
 *   expanded panel  - the Execution Plan card, by the same marker technique.
 *   scroll          - scrollTop/scrollLeft of the real scroll container, which only exists under layout.
 *   cells           - the Avg Sales and Days of Supply text, so the update is shown to have DONE something.
 *
 * A PASS HERE MEANS THE UPDATE HAPPENED AND COST NOTHING. Either half alone is worthless: cells that never
 * change preserve everything, and a full rebuild updates everything.
 *
 *   node assets/tests/_cp2s-r2-inplace-dom-runner.js <outDir> [--skus 60]
 */
const http = require('http');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const sha = (rel) => crypto.createHash('sha256').update(read(rel).replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe'
];
function findBrowser() { return CHROMES.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } }); }
const MAX_HOLD_MS = 120000;

const MKT_ID = 'MP-FIXTURE-US-AMZ';
// CP2U-R3 - the SECOND site, used only by the states scenario, to prove a failure on one site does not
// follow the operator to the next one.
const MKT3_ID = 'MP-EU-AMZ-FIXTURE';
const MKT2_ID = 'MP-FIXTURE-US-WMT';
const skuOf = (i) => 'FIXTURE-SKU-' + String(i).padStart(3, '0');

function fixtureWorkspace(n, twoSites) {
  const mk = (c, f) => Array.from({ length: c }, (_, i) => f(i));
  const site2 = twoSites ? [{ marketplace_id: MKT2_ID, company: 'FixtureCo', country: 'US',
    marketplace: 'Walmart', currency: 'USD', status: 'active', allocation_priority: 90 }] : [];
  const skus2 = twoSites ? mk(n, i => ({ marketplace_sku_id: 'MSKU2-' + i, marketplace_id: MKT2_ID,
    company: 'FixtureCo', country: 'US', marketplace: 'Walmart', sku: skuOf(i), site_sku: 'SS2-' + i,
    marketplace_product_id: 'W000FIX' + String(i).padStart(3, '0'), currency: 'USD',
    regular_price: 18.99 + i, minimum_price: 8.99, msrp: 28.99,
    marketplace_sku_status: 'active', replenishment_model: 'sales_driven' })) : [];
  return {
    marketplaces: [{ marketplace_id: MKT_ID, company: 'FixtureCo', country: 'US', marketplace: 'Amazon',
      currency: 'USD', status: 'active', allocation_priority: 100 }].concat(site2),
    marketplace_skus: mk(n, i => ({ marketplace_sku_id: 'MSKU-' + i, marketplace_id: MKT_ID,
      company: 'FixtureCo', country: 'US', marketplace: 'Amazon', sku: skuOf(i), site_sku: 'SS-' + i,
      marketplace_product_id: 'B000FIX' + String(i).padStart(3, '0'), currency: 'USD',
      regular_price: 19.99 + i, minimum_price: 9.99, msrp: 29.99,
      marketplace_sku_status: 'active', replenishment_model: 'sales_driven' })).concat(skus2),
    sku_details: mk(n, i => ({ sku: skuOf(i), product_name: 'Fixture Product ' + i, category: 'FIXTURE',
      status: 'active', company: 'FixtureCo', units_per_carton: 40 })),
    warehouses: mk(4, i => ({ warehouse_id: 'WH' + i, warehouse_name: 'Fixture WH ' + i, country: 'US', type: 'overseas' })),
    amazon_inventory_snapshot: mk(n, i => ({ snapshot_date: '2026-10-13', country: 'US', marketplace: 'Amazon',
      sku: skuOf(i), available_qty: 1000 + i * 7, fc_transfer_qty: 50 + i, fc_processing_qty: 30 + i,
      customer_order_qty: 10 + i, unfulfillable_qty: i % 5 })),
    amazon_inventory_health_snapshot: mk(n, i => ({ snapshot_date: '2026-10-13', country: 'US', marketplace: 'Amazon',
      sku: skuOf(i), qty_over_90_days: 20 + i, qty_over_180_days: 5 + i })),
    amazon_daily_sales_snapshot: mk(n * 4, i => ({ snapshot_date: '2026-10-' + String(9 + (i % 4)).padStart(2, '0'),
      country: 'US', marketplace: 'Amazon', sku: skuOf(i % n), units_ordered: 5 + (i % 17) }))
      .concat(twoSites ? mk(n * 4, i => ({ snapshot_date: '2026-10-' + String(9 + (i % 4)).padStart(2, '0'),
        country: 'US', marketplace: 'Walmart', sku: skuOf(i % n), units_ordered: 4 + (i % 13) })) : []),
    amazon_weekly_sales_snapshot: mk(n * 2, i => ({ week_start: '2026-10-05', country: 'US', marketplace: 'Amazon',
      sku: skuOf(i % n), units_ordered: 40 + (i % 31) })),
    fc_regular_forecast: mk(n, i => ({ forecast_id: 'FC-' + i, sku: skuOf(i), country: 'US', marketplace: 'Amazon',
      forecast_month: '2026-11', forecast_qty: 300 + i * 3 })),
    fc_target_rules: [{ rule_id: 'R1', scope_id: 'US|Amazon', target_days: 90 }],
    fc_special_events: [],
    overseas_inventory_snapshot: mk(n * 2, i => ({ warehouse_id: 'WH' + (i % 4), sku: skuOf(i % n),
      wh_available_stock: 100 + i, snapshot_date: '2026-10-13' })),
    factory_stock: mk(n, i => ({ factory_stock_id: 'FS-' + i, sku: skuOf(i), fac_current_stock: 500 + i,
      fac_reserved_stock: 20 + i })),
    shipments: [], shipment_lines: [], shipping_plans: [], shipping_plan_lines: [],
    shipping_allocation_drafts: [], shipping_allocation_draft_lines: [],
    carrier_lead_times: mk(3, i => ({ lead_time_id: 'LT-' + i, carrier_id: 'C' + i, lane: 'CN-US',
      shipping_method: ['SEA', 'AIR', 'EXPRESS'][i], days: 30 + i })),
    carrier_rate_cards: mk(3, i => ({ rate_card_id: 'RC-' + i, carrier_id: 'C' + i, lane: 'CN-US',
      shipping_method: ['SEA', 'AIR', 'EXPRESS'][i], min_kg: 0, max_kg: 1000, rate: 1.5, currency: 'USD' }))
  };
}

/**
 * THE WAREHOUSE LANE, which is the whole point of the round: a self_fulfilled site produces NO marketplace
 * line, so these lines are the only carrier of the historical average. `rate` changes between the two reads
 * so the cell has something visible to change TO - an update that writes the same text proves nothing.
 */
function recoLines(n, rate, opts) {
  // CP2U-R3 - WITHHELD is a basis object that carries neither a rate nor a named reason, which is what
  // D-S8-B3-98 describes. It is NOT the same as a line with no basis and NOT the same as a refusal.
  const basis = (opts && opts.withhold) ? {
    demandMode: 'sales_driven', avgSalesPerDay: null, source: null, warning: '',
    normalDayCount: null, excludedDates: [], horizonOpeningQty: null, qualifiedIncomingCount: null,
    blankDateRows: 0, basisQualityError: null, contaminationSource: { campaigns: 'ABSENT', events: 'ABSENT' }
  } : {
    demandMode: 'sales_driven', avgSalesPerDay: rate, source: 'normalized_30d', warning: '',
    normalDayCount: 30, excludedDates: [], horizonOpeningQty: null, qualifiedIncomingCount: null,
    blankDateRows: 2, basisQualityError: null, contaminationSource: { campaigns: 'ABSENT', events: 'ABSENT' }
  };
  const out = [];
  for (let i = 0; i < n; i++) {
    ['WH0', 'WH1'].forEach(w => out.push({
      sku: skuOf(i), siteSku: 'SS-' + i, destinationType: 'WAREHOUSE', warehouseId: w,
      destinationKey: 'WAREHOUSE||FixtureCo||US||Amazon||' + w,
      recommendationMode: 'WAREHOUSE_REPLENISHMENT', blocked: true,
      blockedReason: 'RECOMMENDATION_RUNTIME_BLOCKED', horizonBasis: basis
    }));
  }
  return out;
}

// CP2X-R2 B - the gap rows answer for the scope the REQUEST named, and carry a different number per
// site. A fixture that returns the same rows whatever it is asked makes a wrong-site answer and a
// right-site answer indistinguishable, which is the one thing a cross-site capture has to tell apart.
function gapRows(n, twoSites, reqScope) {
  const W = ['D18', 'D30', 'D45', 'D90'];
  const mkt = (twoSites && reqScope && reqScope.marketplace) ? String(reqScope.marketplace) : 'Amazon';
  const bump = (mkt === 'Walmart') ? 500 : 0;
  const out = [];
  for (let i = 0; i < n; i++) W.forEach((w, k) => out.push({
    sku: skuOf(i), company: 'FixtureCo', country: 'US', marketplace: mkt,
    window_code: w, gap_qty: bump + 10 * (k + 1) + i, suggested_order_qty: bump + 20 * (k + 1) + i,
    note: '', calculated_at: '2026-10-13T00:00:00Z',
    calculation_status: 'READY', calculation_date: '2026-11-01',
    d18_gap_qty: bump + 10 + i, d18_suggested_qty: bump + 20 + i,
    d30_gap_qty: bump + 20 + i, d30_suggested_qty: bump + 40 + i,
    d45_gap_qty: bump + 30 + i, d45_suggested_qty: bump + 60 + i,
    d90_gap_qty: bump + 40 + i, d90_suggested_qty: bump + 80 + i
  }));
  return out;
}

// ===================================================================================================
// CP2X-R4 — THE MULTI-COUNTRY FIXTURE.
//
// The Owner's counter-examples need a real COUNTRY axis. The fixture that existed offered exactly one
// country ("options [\"\", \"US\"]", recorded in the registry branch above), which is why every earlier
// cross-site capture had to use the marketplace axis and say so. Driving country restore against a
// single-country registry would measure a scenario that silently could not move.
//
// EVERY SITE CARRIES ITS OWN NUMBERS. If EU and JP answered alike, "the right site answered" and "a
// site answered" would be the same observation, and the restore could be wrong in the one way that
// matters - showing yesterday's country - while every assertion still passed. The avg rate, the
// suggested quantity and the canonical marketplace_id are all distinct per site.
//
// US/Amazon keeps 7 so the numbers the other scenarios already pin do not move.
const RV_SITES = [
  { id: 'MP-FIXTURE-US-AMZ', country: 'US', marketplace: 'Amazon',  company: 'FixtureCo', avg: 7,  gapBase: 0,    stock: 700 },
  { id: 'MP-FIXTURE-US-WMT', country: 'US', marketplace: 'Walmart', company: 'FixtureCo', avg: 31, gapBase: 500,  stock: 3100 },
  { id: 'MP-FIXTURE-EU-AMZ', country: 'EU', marketplace: 'Amazon',  company: 'FixtureCo', avg: 13, gapBase: 1300, stock: 1690 },
  // A SECOND EU SITE, so "change only the marketplace, then Search" is a move that can actually be
  // made. With one marketplace per country that scenario cannot be driven at all.
  { id: 'MP-FIXTURE-EU-WMT', country: 'EU', marketplace: 'Walmart', company: 'FixtureCo', avg: 17, gapBase: 1700, stock: 850 },
  { id: 'MP-FIXTURE-JP-AMZ', country: 'JP', marketplace: 'Amazon',  company: 'FixtureCo', avg: 23, gapBase: 2300, stock: 6900 },
  { id: 'MP-FIXTURE-JP-RAK', country: 'JP', marketplace: 'Rakuten', company: 'FixtureCo', avg: 29, gapBase: 2900, stock: 580 },
  // CP2X-R4-R1 - A SEVENTH SITE THAT CAN BE RETIRED MID-CAPTURE. It is a complete site with its own
  // numbers precisely so that refusing it is a refusal of something real: a fixture entry with no
  // rows would make "nothing was published" the same observation as "the site has nothing".
  { id: 'MP-FIXTURE-JP-YAH', country: 'JP', marketplace: 'Yahoo', company: 'FixtureCo', avg: 37, gapBase: 3700, stock: 1110 }
];
const RV_COUNTRIES = ['US', 'EU', 'JP'];
// CP2X-R4-R1 §A — THE FIXTURE COULD NOT PRODUCE TWO OF THE THREE INPUTS IT WAS EVIDENCE ABOUT.
//
// Every record it offered was permanently active: the registry payload carried no `status` field at
// all, so `_replenActiveMarketplaces` (`!s || s === 'active'`) accepted all six, and neither "an id
// that EXISTS but has been retired" nor "an id the registry no longer lists" could be represented,
// let alone driven. A fixture that cannot produce the input cannot be evidence about the output.
//
// AND A SELECT CANNOT HOLD A VALUE IT WAS NEVER OFFERED. Assigning an unknown id to a <select>
// leaves it at '', so the stale-id case cannot be staged by assignment - it has to be staged the way
// it actually happens: the site is legitimately chosen while it is live, the registry retires or
// drops it, and the page re-reads the authority without rebuilding the select. `siteStatus` is that
// change, applied between reads, and `rvSiteStatus` is what every payload consults.
const RV_UNKNOWN_ID = 'MP-FIXTURE-NOWHERE-XXX';   // deliberately offered by NO payload, in any mode
function rvSiteStatus(state, id) {
  const o = (state && state.siteStatus) || {};
  return o[id] || 'active';                       // 'active' | 'inactive' | 'absent'
}
function rvMarketplaceRecords(state) {
  const out = [];
  RV_SITES.forEach(s => {
    const st = rvSiteStatus(state, s.id);
    if (st === 'absent') return;                  // the registry no longer lists it at all
    out.push({ marketplace_id: s.id, company: s.company, country: s.country, marketplace: s.marketplace,
      marketplace_display_name: s.marketplace, status: st, currency: 'USD', allocation_priority: 100 });
  });
  return out;
}
// The site a request named. Country ALONE is not enough (EU/Amazon and US/Amazon share a marketplace
// name), and marketplace alone is not either - the pair is the identity, exactly as the scope key is.
function rvSiteOf(reqScope) {
  if (!reqScope) return null;
  const c = reqScope.country ? String(reqScope.country) : '';
  const m = reqScope.marketplace ? String(reqScope.marketplace) : '';
  if (c && m) return RV_SITES.find(s => s.country === c && s.marketplace === m) || null;
  if (c) return RV_SITES.find(s => s.country === c) || null;
  if (m) return RV_SITES.find(s => s.marketplace === m) || null;
  return null;
}
function rvWorkspace(n, state) {
  const mk = (c, f) => Array.from({ length: c }, (_, i) => f(i));
  const skus = [];
  RV_SITES.forEach((s, si) => {
    for (let i = 0; i < n; i++) skus.push({
      marketplace_sku_id: 'MSKU-' + si + '-' + i, marketplace_id: s.id, company: s.company,
      country: s.country, marketplace: s.marketplace, sku: skuOf(i), site_sku: 'SS' + si + '-' + i,
      marketplace_product_id: 'B' + si + 'FIX' + String(i).padStart(3, '0'), currency: 'USD',
      regular_price: 19.99 + i, minimum_price: 9.99, msrp: 29.99,
      marketplace_sku_status: 'active', replenishment_model: 'sales_driven' });
  });
  const base = fixtureWorkspace(n, true);
  // PER-SITE STOCK, so Days of Supply is a site-distinguishing number rather than a constant. The
  // single-country fixture had stock only for US/Amazon, so every other site computed DoS from zero -
  // and "0" is what a BROKEN restore shows too. A value that cannot tell success from failure is not
  // an acceptance criterion, which is exactly what §C says about using "not --".
  const stock = [];
  RV_SITES.forEach(s => {
    for (let i = 0; i < n; i++) stock.push({ snapshot_date: '2026-10-13', country: s.country,
      marketplace: s.marketplace, sku: skuOf(i), available_qty: s.stock, fc_transfer_qty: 0,
      fc_processing_qty: 0, customer_order_qty: 0, unfulfillable_qty: 0 });
  });
  // CP2X-R4-R1 C - the generation marker. Zero by default, so every phase before this round sees the
  // payload it always saw; set between two mounts it makes the held answer and the fresh one
  // countably different, which is what turns "the older read won" into an observation.
  const extra = (state && state.wsExtra) || 0;
  if (extra) RV_SITES.forEach((s, si) => {
    for (let j = 0; j < extra; j++) skus.push({
      marketplace_sku_id: 'MSKU-GEN-' + si + '-' + j, marketplace_id: s.id, company: s.company,
      country: s.country, marketplace: s.marketplace, sku: 'GENMARK-' + j, site_sku: 'SSG' + si + '-' + j,
      marketplace_product_id: 'BGEN' + si + String(j).padStart(3, '0'), currency: 'USD',
      regular_price: 1.01, minimum_price: 1, msrp: 2,
      marketplace_sku_status: 'active', replenishment_model: 'sales_driven' });
  });
  return Object.assign({}, base, {
    marketplaces: rvMarketplaceRecords(state),
    marketplace_skus: skus,
    amazon_inventory_snapshot: stock
  });
}
function rvGapRows(n, reqScope) {
  const site = rvSiteOf(reqScope);
  // No resolvable site => NO ROWS. A fixture that invents rows for an unidentifiable scope would hide
  // precisely the defect this round is about.
  if (!site) return [];
  const b = site.gapBase, W = ['D18', 'D30', 'D45', 'D90'], out = [];
  for (let i = 0; i < n; i++) W.forEach((w, k) => out.push({
    sku: skuOf(i), company: site.company, country: site.country, marketplace: site.marketplace,
    window_code: w, gap_qty: b + 10 * (k + 1) + i, suggested_order_qty: b + 20 * (k + 1) + i,
    note: '', calculated_at: '2026-10-13T00:00:00Z',
    calculation_status: 'READY', calculation_date: '2026-11-01',
    d18_gap_qty: b + 10 + i, d18_suggested_qty: b + 20 + i,
    d30_gap_qty: b + 20 + i, d30_suggested_qty: b + 40 + i,
    d45_gap_qty: b + 30 + i, d45_suggested_qty: b + 60 + i,
    d90_gap_qty: b + 40 + i, d90_suggested_qty: b + 80 + i
  }));
  return out;
}
function rvRecoLines(n, reqScope) {
  const site = rvSiteOf(reqScope);
  if (!site) return [];
  const basis = { demandMode: 'sales_driven', avgSalesPerDay: site.avg, source: 'normalized_30d',
    warning: '', normalDayCount: 30, excludedDates: [], horizonOpeningQty: null,
    qualifiedIncomingCount: null, blankDateRows: 2, basisQualityError: null,
    contaminationSource: { campaigns: 'ABSENT', events: 'ABSENT' } };
  const out = [];
  for (let i = 0; i < n; i++) ['WH0', 'WH1'].forEach(w => out.push({
    sku: skuOf(i), siteSku: 'SS-' + i, destinationType: 'WAREHOUSE', warehouseId: w,
    destinationKey: ['WAREHOUSE', site.company, site.country, site.marketplace, w].join('||'),
    recommendationMode: 'WAREHOUSE_REPLENISHMENT', blocked: true,
    blockedReason: 'RECOMMENDATION_RUNTIME_BLOCKED', horizonBasis: basis
  }));
  return out;
}

function withCorrelation(payload, action, rid) {
  if (!payload || typeof payload !== 'object') return payload;
  const out = Object.assign({}, payload);
  out.meta = Object.assign({}, out.meta || {}, { action: action, requestId: rid || undefined });
  if (rid) out.request_id = rid;
  return out;
}

function apiAnswer(action, n, state, reqScope) {
  // CP2X-R1 B - EVERY request is counted by action, server side. This is the "actual network request"
  // half of the measurement; the page-side reader-call counts come from the page diagnostics.
  if (state) { state.hits = state.hits || {}; state.hits[action] = (state.hits[action] || 0) + 1; }
  // CP2X-R2 B - AND THE SCOPE IT WAS ASKED FOR. "The applied scope really changed" is then a server
  // observation rather than a claim the page makes about itself: a switch that did not take cannot
  // produce a request naming the second site.
  if (state && reqScope && (reqScope.country || reqScope.marketplace)) {
    state.scopeLog = state.scopeLog || [];
    state.scopeLog.push({ action: action, country: reqScope.country || null, marketplace: reqScope.marketplace || null });
  }
  if (action === 'getClientCapabilities') {
    return { success: true, data: { product_strategy_enabled: true, inventoryAiPlanDbGenerationEnabled: false,
      capabilitiesVersion: 'fixture-cp2s-r2' } };
  }
  if (action === 'inventoryScope.registry.get') {
    // CP2X-R1 B - the scopes scenario needs a SECOND SITE, and takes the marketplace axis rather than the
    // country one. A cross-COUNTRY switch was attempted first and the country select never offered the
    // second country (observed: options ["", "US"]), so driving it would have measured a scenario that
    // silently did not switch. The scope key is company|country|marketplace and the marketplace axis
    // changes it just as a country would; the country axis is covered offline, where the key is built
    // directly. The limitation is recorded in the capture rather than worked around.
    // CP2X-R4 — the revisit scenario gets the real country axis (US / EU / JP).
    if (state && state.revisitMode) {
      const byCountry = {};
      // CP2X-R4-R1 — the RETIRED site is listed by the registry, exactly as a real projection lists it.
      // Excluding it here would have the fixture do the filtering that the PAGE is supposed to do, and
      // the capture would then prove only that the fixture withheld it.
      rvMarketplaceRecords(state).forEach(m => { (byCountry[m.country] = byCountry[m.country] || []).push(m.marketplace_id); });
      return { success: true, data: {
        marketplaces: rvMarketplaceRecords(state),
        countries: RV_COUNTRIES.slice(), marketplace_ids_by_country: byCountry,
        empty: false, empty_reason: '' } };
    }
    const two = !!(state && (state.statesMode || state.scopesMode));
    return { success: true, data: {
      marketplaces: [{ marketplace_id: MKT_ID, company: 'FixtureCo', country: 'US', marketplace: 'Amazon',
        marketplace_display_name: 'Amazon' }].concat(two ? [{ marketplace_id: MKT2_ID, company: 'FixtureCo',
          country: 'US', marketplace: 'Walmart', marketplace_display_name: 'Walmart' }] : []),
      countries: ['US'], marketplace_ids_by_country: { US: two ? [MKT_ID, MKT2_ID] : [MKT_ID] },
      empty: false, empty_reason: '' } };
  }
  // CP2X-R2 B - THE FIXTURE INCONSISTENCY THAT MADE THE CP2X-R1 CROSS-SITE CAPTURE UNPROVABLE.
  //
  // The registry offered two marketplaces; this read described ONE. `refreshReplenMarketplaceOptions`
  // builds the Marketplace select from `_irWsGet('getMarketplaces')`, which prefers `_irReadModel` -
  // hydrated by THIS read - over the registry. So the registry populated the select, the first search
  // replaced the read model with a one-site workspace, the select was rebuilt from it, and the second
  // site disappeared before anything could select it. The capture recorded `mkt-...-WMT never held` and
  // every later phase silently ran against the first site. The three sources now agree.
  if (action === 'inventoryReplenishment.workspace.get') {
    if (state.revisitMode) return { success: true, data: rvWorkspace(n, state) };
    return { success: true, data: fixtureWorkspace(n, state.statesMode || state.scopesMode) };
  }
  // CP2X-R2 B - the gap envelope carries 43_'s handler marker, as the real one does. Without it the
  // page's source revision is incomplete and every reuse is flagged REUSED_REVISION_INCOMPLETE, so the
  // capture would measure the fixture's missing field rather than the contract.
  if (action === 'inventoryReplenishmentGap.get') return { success: true, meta: { gapMaterializationHandlerVersion: 'fm5-r4ui-r5c' },
    data: { rows: state.revisitMode ? rvGapRows(n, reqScope)
      : gapRows(n, state.statesMode || state.scopesMode, reqScope) } };
  if (action === 'gapJob.status.get') return { success: true, data: { status: 'IDLE', jobs: [] } };
  if (action === 'recommendation.workspace.get') {
    state.recoReads++;
    // CP2X-R4 — the rate is the SITE's rate, chosen from the scope the request actually named. An
    // answer for a site the request did not name is what the cross-scope guards exist to refuse, so
    // the fixture must be able to produce one and must never produce it by accident.
    if (state.revisitMode) {
      // CP2X-R4-R1 B - a deliberate failure for the NEXT answer(s), so a stale FAILURE can be held and
      // delivered after a newer result is already on screen.
      if (state.failNextReco > 0) {
        state.failNextReco--;
        return { success: false, data: null, meta: { requestId: 'fixture-rv-fail-' + state.recoReads },
          errors: [{ code: 'WORKSPACE_ERROR', message: 'fixture late failure', details: null }] };
      }
      return { success: true,
        data: { lines: rvRecoLines(n, reqScope), dataVersion: { formulaVersion: 'FV-7', sourceDataAsOf: '2026-10-13' } },
        meta: { requestId: 'fixture-rv-' + state.recoReads, serverDurationMs: 1234,
          recommendationWorkspaceHandlerVersion: 'fm5-r4ui-r5e',
          calculationDate: '2026-10-18', calculationMonth: '2026-11', planningCycle: 'RECO-2026-11',
          canonicalRead: { mode: 'BATCH', remoteCalls: 2, readMs: 900, normalizeMs: 40, afterReadMs: 294 } } };
    }
    // CP2U-R3 - THE STATES, each one a different way for an answer to be absent or present. Reached only
    // under the opt-in flag; reads 1 and 2 are unchanged so the in-place experiment is undisturbed.
    if (state.statesMode) {
      const k = state.recoReads;
      // 3: the read FAILS. The page must say so, and must not say it with a zero.
      if (k === 3) return { success: false, data: null, meta: { requestId: 'fixture-fail' },
        errors: [{ code: 'WORKSPACE_ERROR', message: 'fixture failure', details: null }] };
      // 4: the read SUCCEEDS and resolves no destination line at all.
      if (k === 4) return { success: true, data: { lines: [], dataVersion: { sourceDataAsOf: '2026-10-13' } } };
      // 5: a line exists and carries NO basis - neither a rate nor a named reason. Withheld, not missing.
      if (k === 5) return { success: true, data: { lines: recoLines(n, null, { withhold: true }),
        dataVersion: { sourceDataAsOf: '2026-10-13' } } };
      // 6: a LEGITIMATE ZERO. This site really sold nothing per day, and 0 is the answer, not the absence
      //    of one - the one case a dash would be a lie.
      if (k === 6) return { success: true, data: { lines: recoLines(n, 0),
        dataVersion: { sourceDataAsOf: '2026-10-13' } } };
      // 7: RECOVERY. A failed read must not be sticky.
      if (k === 7) return { success: true, data: { lines: recoLines(n, 23),
        dataVersion: { sourceDataAsOf: '2026-10-13' } } };
      // 8: a failure again, to put a failed state on screen immediately before the site switch.
      if (k === 8) return { success: false, data: null, meta: { requestId: 'fixture-fail-2' },
        errors: [{ code: 'WORKSPACE_ERROR', message: 'fixture failure before switch', details: null }] };
      // 9+: the NEW site answers normally. Its cells must show this, not the previous site's failure.
      if (k >= 9) return { success: true, data: { lines: recoLines(n, 31),
        dataVersion: { sourceDataAsOf: '2026-10-13' } } };
    }
    // CP2X-R1 B - THE SCOPES SCENARIO ANSWERS LIKE THE REAL HANDLER DOES. Without the handler marker the
    // page refuses to STORE the answer (by design, CP2T-R1), so a reuse scenario run against a markerless
    // fixture would measure the refusal and call it "no reuse". The marker, the planning context and the
    // data version are all present here, exactly as 42_ sends them.
    if (state.scopesMode) {
      // CP2X-R2 B - READS 1 AND 2 STAY THE IN-PLACE EXPERIMENT. The scopes flag used to take over from
      // the first read, which served the same rate twice and made the in-place verdict fail for a reason
      // that had nothing to do with in-place updating. The experiment runs first and is left alone; the
      // scope-driven answers begin where the scopes scenario does.
      if (state.recoReads <= 2) return { success: true, data: { lines: recoLines(n, state.recoReads >= 2 ? 11 : 7),
        dataVersion: { sourceDataAsOf: '2026-10-13' } } };
      // the rate is chosen by the marketplace the REQUEST named. CP2X-R1 chose it from
      // `state.scopeHint`, a label the harness set around each phase - so the "site B" number appeared
      // whether or not the select had actually moved, and the capture could not have detected the
      // failed switch it in fact contained.
      var euNow = (reqScope && String(reqScope.marketplace) === 'Walmart');
      return { success: true,
        data: { lines: recoLines(n, euNow ? 31 : 7), dataVersion: { formulaVersion: 'FV-7', sourceDataAsOf: '2026-10-13' } },
        meta: { requestId: 'fixture-' + state.recoReads, serverDurationMs: 1234,
          recommendationWorkspaceHandlerVersion: 'fm5-r4ui-r5e',
          calculationDate: '2026-10-18', calculationMonth: '2026-11', planningCycle: 'RECO-2026-11',
          canonicalRead: { mode: 'BATCH', remoteCalls: 2, readMs: 900, normalizeMs: 40, afterReadMs: 294 } } };
    }
    // read 1 -> 7, read 2 -> 11. The second number is what must appear in the cell afterwards.
    return { success: true, data: { lines: recoLines(n, state.recoReads >= 2 ? 11 : 7),
      dataVersion: { sourceDataAsOf: '2026-10-13' } } };
  }
  return { success: true, action: action,
    data: { rows: [], items: [], records: [], countries: [], marketplaces: [], tables: {}, servedAction: action } };
}

function measureScript(capId, opts) {
  return `
(function(){
  var CAP = ${JSON.stringify(capId)};
  var OPT = ${JSON.stringify(opts)};
  var out = { capId: CAP, steps: [], notes: [], fatal: null, before: null, after: null, verdict: {} };
  function now(){ return performance.now(); }
  function step(name, v){ out.steps.push({ step: name, t: +now().toFixed(2), v: v === undefined ? null : v }); return v; }
  function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

  /* A modal dialog blocks the whole renderer; neutralise the three that can appear. */
  window.alert = function(){}; window.confirm = function(){ return true; }; window.prompt = function(){ return null; };

  function waitFor(fn, ms, label){
    var t0 = now();
    return new Promise(function(res){
      (function poll(){
        var v = null; try { v = fn(); } catch(e) { v = null; }
        if (v) return res({ ok: true, waitedMs: +(now()-t0).toFixed(2), v: v });
        if (now()-t0 > ms) return res({ ok: false, waitedMs: +(now()-t0).toFixed(2), label: label });
        setTimeout(poll, 30);
      }());
    });
  }
  async function setSelect(el, value, label, ms){
    var t0 = now();
    while (now() - t0 < (ms || 15000)) {
      var has = Array.prototype.some.call(el.options, function(o){ return o.value === value; });
      if (has) {
        el.value = value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(250);
        if (el.value === value) return { ok: true, waitedMs: +(now()-t0).toFixed(2) };
      } else { await sleep(120); }
    }
    out.notes.push(label + ' never held ' + value);
    return { ok: false, waitedMs: +(now()-t0).toFixed(2) };
  }
  /* CP2U-R3 - A HARNESS THAT CANNOT PROCEED MUST SAY WHICH PRECONDITION IS MISSING.
     NO_INPUT was reported for days as a bare word, and a bare word cannot be diagnosed: the expanded panel
     holds an input only when the Execution Plan actually rendered a ROUTE, and a route depends on a chain
     of five readiness inputs plus the hydrated Working Draft. This records the whole chain at the moment of
     failure, from the page's PUBLIC surface only - nothing here forces a state, builds a field, or reaches
     past a guard. The two inputs that are module-private are NAMED as unreachable rather than guessed at. */
  function diagnose(why, sku){
    var d = { why: why, sku: sku || null, atMs: +now().toFixed(2) };
    function t(fn, dflt){ try { return fn(); } catch(e) { return 'THREW:' + (e && e.message); } }
    d.revealGates = t(function(){
      return Array.prototype.map.call(document.querySelectorAll('#ops-section [data-ir-reveal]'), function(g){
        return { panel: g.getAttribute('data-ir-reveal'), sku: g.getAttribute('data-ir-sku'),
                 state: g.getAttribute('data-reveal-state'), frame: g.getAttribute('data-reveal-frame') };
      });
    });
    d.execSkeletonStillUp = t(function(){ return !!document.querySelector('#ops-section .ir-skel--routes'); });
    d.routeHostPresent    = t(function(){ return !!document.querySelector('#ops-section [id^="shipping-methods-"]'); });
    d.routeRowCount       = t(function(){ return document.querySelectorAll('#ops-section .exec-routes-list > *').length; });
    d.emptyStateShown     = t(function(){
      var h = document.querySelector('#ops-section .exec-routes-list');
      return h ? (h.textContent || '').trim().slice(0, 200) : null; });
    d.addRouteDisabled    = t(function(){
      var b = document.querySelector('#ops-section .replen-card__add-route-btn');
      return b ? !!b.disabled : null; });
    d.exposureState = t(function(){ return window._irExposureStateForRender_ ? window._irExposureStateForRender_() : 'NO_FN'; });
    d.exposureSite  = t(function(){ return window._irExposureSite_ ? window._irExposureSite_() : 'NO_FN'; });
    d.catalogue = t(function(){
      var reg = window.KM && window.KM.methodRegistry;
      if (!reg) return 'NO_REGISTRY';
      var sc = (d.exposureSite && typeof d.exposureSite === 'object') ? d.exposureSite : null;
      return { requestCount: reg.requestCount ? reg.requestCount() : null, scopeProbed: sc,
        isLoaded: sc ? reg.isLoaded(sc) : null, error: sc ? reg.getError(sc) : null,
        leadTimes: (sc && reg.getLeadTimes) ? (reg.getLeadTimes(sc) || []).length : null,
        rateCards: (sc && reg.getRateCards) ? (reg.getRateCards(sc) || []).length : null };
    });
    /* The hydrated Working Draft is what branch 1 of initializeShippingAllocation renders, and branch 2
       deliberately renders NO route at all - so an empty draft is a legitimate zero-input panel, not a bug. */
    d.draftRows = t(function(){
      return (typeof window._allocationDraftRowsFor === 'function')
        ? (window._allocationDraftRowsFor(sku) || []).length : 'NOT_ON_WINDOW'; });
    /* THE BARRIER MODULE ITSELF. _irRevealBegin_ has a documented fallback for when it is absent, and that
       fallback calls initializeShippingAllocation BEFORE the card owns a shipping-methods host - so the
       panel keeps its skeleton forever. Distinguishing "the gate never settled" from "there was no gate"
       is the whole question, and only this tells them apart. */
    d.revealModule = t(function(){ return typeof window.IRPlanningReveal; });
    d.revealModuleKeys = t(function(){
      return window.IRPlanningReveal ? Object.keys(window.IRPlanningReveal).slice(0, 20) : null; });
    d.kmKeys = t(function(){ return window.KM ? Object.keys(window.KM).slice(0, 20) : null; });
    d.adapterPresent = t(function(){
      return !!(window.KM && window.KM.DB && window.KM.DB.adaptInventoryReplenishmentWorkspace); });
    d.scriptsOnPage = t(function(){
      return Array.prototype.map.call(document.querySelectorAll('script[src]'), function(x){
        return (x.getAttribute('src') || '').split('/').slice(-2).join('/'); }); });
    d.scriptLoadErrors = window.__cp2uScriptErrors || null;
    d.panelMarkup = t(function(){
      return Array.prototype.map.call(document.querySelectorAll('#ops-section .replen-expand-panel'), function(p){
        return (p.outerHTML || '').slice(0, 6000); }); });
    /* NOT REACHABLE from the page's public surface. Listed so a reader knows the chain is incomplete here
       rather than believing these two were checked and found healthy. */
    d.unreachable = ['_irDraftHydrateInFlight', '_irReadModel'];
    out.diagnostic = d;
    return d;
  }
  function fixedRows(){ return document.querySelectorAll('#ops-section .fixed-row'); }
  function scrollRowFor(sku){
    var rs = document.querySelectorAll('#ops-section .scroll-row[data-sku]');
    for (var i=0;i<rs.length;i++) if (rs[i].getAttribute('data-sku') === sku) return rs[i];
    return null;
  }
  function cellText(sku, cls){
    var r = scrollRowFor(sku); if (!r) return null;
    var c = r.querySelector('.' + cls); return c ? (c.textContent || '').trim() : null;
  }
  function cellInfo(sku, cls){
    var r = scrollRowFor(sku); if (!r) return null;
    var c = r.querySelector('.' + cls); if (!c) return null;
    return { text: (c.textContent || '').trim(), cls: String(c.className || ''),
             title: c.getAttribute('title') || '' };
  }
  /* CP2U-R3 - WHAT COUNTS AS THE ANSWER ARRIVING.
     The old condition was "the text is not --". CP2U-R2 gave the loading cell its own marker, so that
     condition now accepts a cell that is STILL LOADING, and it always accepted a cell that says the read
     FAILED. Either would have scored as "the first read resolved". The condition is therefore the NUMBER
     the fixture was built to produce - read 1 serves 7, read 2 serves 11 - plus the absence of every
     non-answer the cell is capable of displaying. A cell that merely CHANGED is not a cell that answered. */
  var PENDING_MARK = '\u2026';
  function isReadyNumber(info, expected){
    if (!info) return false;
    if (info.text !== expected) return false;
    if (info.text.indexOf(PENDING_MARK) !== -1) return false;
    if (/read failed|unavailable|not calculated/i.test(info.text)) return false;
    if (/read-failed|--error|is-error/i.test(info.cls)) return false;
    return true;
  }
  /* THE SCROLL CONTAINER IS FOUND BY LAYOUT, NOT BY NAME. The first version guessed three class names and
     found nothing, which would have reported "scroll preserved" about an element that never scrolled. This
     walks the section and keeps whatever actually has overflow, vertical or horizontal, and the evidence
     records which element it was so a null cannot pass as a pass. */
  function scrollers(){
    /* OVERFLOW IS NOT SCROLLABILITY. The previous version took the first element whose scrollHeight exceeded
       its clientHeight; that element accepted scrollTop = 120 and read back 0, because its overflow is
       hidden - and the comparison 0 === 0 then scored as "scroll preserved". So each candidate is PROVEN by
       moving it: set, read back, keep it only if it actually went somewhere, and restore nothing (the test
       wants it scrolled). */
    /* The search is DOCUMENT-WIDE, not section-wide: with 160 rows nothing inside #ops-section scrolled
       vertically, and neither did window.scrollTo - so a section-only search reported 0 === 0 and called it
       preservation. document.scrollingElement is tried first because that is what a long page usually moves. */
    var doc = document.scrollingElement || document.documentElement, v = null, h = null;
    if (doc) { doc.scrollTop = 120; if (doc.scrollTop > 0) v = doc; else doc.scrollTop = 0; }
    /* The TABLE's own containers are tried first, so the evidence names a scroller the operator is actually
       looking at rather than whichever element in the shell happens to overflow. */
    var all = [];
    Array.prototype.forEach.call(document.querySelectorAll('#ops-section *'), function(e){ all.push(e); });
    Array.prototype.forEach.call(document.querySelectorAll('body *'), function(e){ all.push(e); });
    for (var i=0;i<all.length && !(v && h); i++) {
      var e = all[i];
      if (!v && e.scrollHeight > e.clientHeight + 20) { e.scrollTop = 120; if (e.scrollTop > 0) v = e; else e.scrollTop = 0; }
      if (!h && e.scrollWidth > e.clientWidth + 20) { e.scrollLeft = 40; if (e.scrollLeft > 0) h = e; else e.scrollLeft = 0; }
    }
    return { v: v, h: h, doc: document.scrollingElement || document.documentElement };
  }
  function describe(e){ return e ? (e.tagName + '.' + String(e.className || '').split(' ').slice(0,2).join('.')) : null; }
  /* windowScrollKept is only meaningful when the window actually moved; otherwise 0 === 0 proves nothing. */
  function winMoved(){ window.scrollTo(0, 60); return (window.scrollY || window.pageYOffset || 0) > 0; }

  function report(){
    try {
      var x = new XMLHttpRequest();
      x.open('POST', '/__measure?id=' + encodeURIComponent(CAP), true);
      x.setRequestHeader('Content-Type', 'application/json');
      x.send(JSON.stringify(out));
    } catch(e) {}
    var img = new Image(); img.src = '/__hold?id=' + encodeURIComponent(CAP);
  }

  async function go(){
    try {
      var ready = await waitFor(function(){
        return (typeof window.showSection === 'function' && document.querySelector('.menu-item, [onclick*="showSection"]')) ? true : null;
      }, 40000, 'app-ready');
      step('app-ready', ready.ok ? ready.waitedMs : 'NOT_READY');
      if (!ready.ok) return report();

      /* CP2U-R3 - OBSERVE THE CHAIN, DO NOT ALTER IT. Static reading reached a contradiction: the gate
         module is present and the registry is present, yet the catalogue never loaded and the panel never
         revealed. These wrappers record the calls that actually happen. Each one delegates to the original
         and returns its value unchanged. */
      out.obs = { gates: [], ensureLoaded: [], errors: [], raf: { fired: 0, firstAt: null, lastAt: null } };
      (function beat(){
        if (typeof window.requestAnimationFrame !== 'function') { out.obs.raf.absent = true; return; }
        window.requestAnimationFrame(function(){
          out.obs.raf.fired++;
          var tt = +now().toFixed(2);
          if (out.obs.raf.firstAt === null) out.obs.raf.firstAt = tt;
          out.obs.raf.lastAt = tt;
          beat();
        });
      }());
      window.addEventListener('error', function(ev){
        if (ev && ev.target && ev.target.tagName === 'SCRIPT') return;
        out.obs.errors.push({ t: +now().toFixed(2), msg: String(ev && ev.message || ''),
          stack: String((ev && ev.error && ev.error.stack) || '').slice(0, 900) });
      });
      window.addEventListener('unhandledrejection', function(ev){
        out.obs.errors.push({ t: +now().toFixed(2), kind: 'rejection',
          msg: String((ev && ev.reason && (ev.reason.message || ev.reason)) || ''),
          stack: String((ev && ev.reason && ev.reason.stack) || '').slice(0, 900) });
      });
      try {
        var REG = window.KM && window.KM.methodRegistry;
        if (REG && typeof REG.ensureLoaded === 'function') {
          var _el = REG.ensureLoaded.bind(REG);
          REG.ensureLoaded = function(scope, opts){
            var rec = { t: +now().toFixed(2), scope: scope, opts: opts || null };
            out.obs.ensureLoaded.push(rec);
            var p = _el(scope, opts);
            try { Promise.resolve(p).then(function(r){ rec.settled = r && r.status; },
                                          function(e){ rec.threw = String(e && e.message || e); }); } catch(e){}
            return p;
          };
        } else { out.obs.ensureLoaded.push({ note: 'NO_REGISTRY_AT_INSTALL' }); }
      } catch(e) { out.obs.ensureLoaded.push({ note: 'WRAP_THREW:' + e.message }); }
      try {
        var IRP = window.IRPlanningReveal;
        if (IRP && typeof IRP.createPanelGate === 'function') {
          var _cpg = IRP.createPanelGate;
          IRP.createPanelGate = function(deps){
            var nm = (deps && deps.name) || '?';
            /* THE PAINT ITSELF. A revealed flag is set when the reveal is SCHEDULED - the paint runs a
               frame later. Wrapping onReveal is the only way to tell scheduled from painted. */
            if (deps && typeof deps.onReveal === 'function') {
              var _or = deps.onReveal;
              deps.onReveal = function(snap){
                out.obs.gates.push({ t: +now().toFixed(2), gate: nm, call: 'PAINTED',
                  gen: snap && snap.gen, frameId: snap && snap.frameId });
                return _or.apply(this, arguments);
              };
            }
            var g = _cpg.apply(this, arguments);
            var _begin = g.begin, _rep = g.report, _ab = g.abandon;
            g.begin = function(ctx){ var r = _begin.apply(g, arguments);
              out.obs.gates.push({ t: +now().toFixed(2), gate: nm, call: 'begin', gen: r, ctx: ctx }); return r; };
            g.abandon = function(){ var r = _ab.apply(g, arguments);
              out.obs.gates.push({ t: +now().toFixed(2), gate: nm, call: 'abandon', gen: r }); return r; };
            g.report = function(gen, readiness, ctx){
              var r = _rep.apply(g, arguments);
              out.obs.gates.push({ t: +now().toFixed(2), gate: nm, call: 'report', gen: gen,
                state: readiness && readiness.state, code: readiness && readiness.code,
                accepted: r && r.accepted, reason: r && r.reason, revealed: r && r.revealed, ctx: ctx });
              return r; };
            return g;
          };
        } else { out.obs.gates.push({ note: 'NO_IRPLANNINGREVEAL_AT_INSTALL' }); }
      } catch(e) { out.obs.gates.push({ note: 'WRAP_THREW:' + e.message }); }

      var el = document.querySelector('[onclick*="showSection(\\'ops\\')"]');
      if (el) el.click(); else if (window.showSection) window.showSection('ops');
      var SKU0 = ${JSON.stringify(skuOf(1))};

      var sec = await waitFor(function(){ return document.getElementById('replenCountry'); }, 20000, 'filter-bar');
      step('filter-bar', sec.ok ? sec.waitedMs : 'MISSING');
      if (!sec.ok) return report();

      var cSet = await setSelect(document.getElementById('replenCountry'), 'US', 'country');
      if (!cSet.ok) return report();
      var mSet = await setSelect(document.getElementById('replenMarketplace'), ${JSON.stringify(MKT_ID)}, 'marketplace');
      if (!mSet.ok) return report();

      var btn = document.querySelector('#ops-section .replen-btn--search');
      if (btn) btn.click(); else if (window.searchReplenishment) window.searchReplenishment();

      var tbl = await waitFor(function(){ var r = fixedRows(); return r.length > 1 ? r.length : null; }, 30000, 'table');
      step('table', tbl.ok ? tbl.v : 'NO_ROWS');
      if (!tbl.ok) { diagnose('NO_ROWS', SKU0); return report(); }
      await sleep(OPT.settleMs);

      /* The first workspace read must have landed, or the "second arrival" below would be the first. */
      var first = await waitFor(function(){
        var i = cellInfo(${JSON.stringify(skuOf(1))}, 'replen-avg-cell');
        return isReadyNumber(i, OPT.expectFirst) ? i : null;
      }, 20000, 'first-reco');
      var firstInfo = first.ok ? first.v : cellInfo(${JSON.stringify(skuOf(1))}, 'replen-avg-cell');
      step('first-reco-cell', first.ok ? first.v.text : { got: firstInfo, expected: OPT.expectFirst });
      out.verdict.firstReadResolved = first.ok;
      out.verdict.firstCell = firstInfo ? firstInfo.text : null;
      out.verdict.firstCellExpected = OPT.expectFirst;
      out.firstCellInfo = firstInfo;
      if (!first.ok) { out.fatal = 'FIRST_READ_NOT_READY'; diagnose('FIRST_READ_NOT_READY', SKU0); return report(); }

      /* ---- expand a row and start working in it ------------------------------------------------ */
      var SKU = ${JSON.stringify(skuOf(1))};
      var fr = fixedRows();
      fr[1].click();
      var card = await waitFor(function(){ return document.getElementById('execution-plan-' + SKU); }, 25000, 'exec-card');
      step('exec-card', card.ok ? card.waitedMs : 'MISSING');
      if (!card.ok) { diagnose('NO_EXEC_CARD', SKU0); return report(); }
      await sleep(OPT.settleMs);

      var panel = document.getElementById('execution-plan-' + SKU);
      panel.__cp2sMark = 'PANEL';

      /* Any real input inside the open panel. The Execution Plan composer carries a qty field; if the
         fixture leaves the composer empty, ANY input in the panel is still a node the rebuild would
         destroy, and the note records which one was used. */
      var host = panel.closest ? (panel.closest('.replen-expand-panel') || panel) : panel;
      /* SELECTION ONLY EXISTS ON SOME INPUT TYPES. <input type=number> throws / returns null for
         selectionStart, so the first run reported selStart null BEFORE and null AFTER and scored that as
         "selection preserved" - two nulls agreeing about nothing. A selection-capable field is preferred,
         and if the panel has none the evidence says so instead of claiming the check passed. */
      var SELECTABLE = { text:1, search:1, tel:1, url:1, password:1, '':1 };
      /* The expanded ROW is two panels - a fixed one and a scrolling one - so searching only the card that
         holds the Execution Plan can miss a field the operator can type in. Both are searched, and the
         evidence lists every field found either way. */
      var panelsOpen = document.querySelectorAll('#ops-section .replen-expand-panel');
      var cands = [];
      Array.prototype.forEach.call(panelsOpen, function(pp){
        Array.prototype.forEach.call(pp.querySelectorAll('input:not([type=hidden]), textarea'), function(f){ cands.push(f); });
      });
      if (!cands.length) cands = host.querySelectorAll('input:not([type=hidden]), textarea');
      var input = null, typeList = [];
      for (var ci=0; ci<cands.length; ci++) {
        var t = (cands[ci].type || '').toLowerCase();
        typeList.push(cands[ci].tagName + ':' + t);
        if (!input && (cands[ci].tagName === 'TEXTAREA' || SELECTABLE[t])) input = cands[ci];
      }
      out.notes.push('panel fields: ' + typeList.join(',').slice(0, 300));
      var selectionCapable = !!input;
      if (!input) input = host.querySelector('input:not([type=hidden])');
      if (!input) { out.notes.push('no input inside the expanded panel'); out.fatal = 'NO_INPUT';
        diagnose('NO_INPUT', SKU); return report(); }
      if (!selectionCapable) out.notes.push('no selection-capable field in the panel; using ' + (input.type || input.tagName));
      out.selectionCapable = selectionCapable;
      input.__cp2sMark = 'INPUT';
      input.focus();
      input.value = '1234';
      if (selectionCapable) { try { input.setSelectionRange(2, 2); } catch(e) { out.notes.push('setSelectionRange threw: ' + e.message); } }

      var SC = scrollers();   // already moved, and only kept if the move took
      out.scrollerV = describe(SC.v); out.scrollerH = describe(SC.h);
      out.scrollerVTop = SC.v ? SC.v.scrollTop : null; out.scrollerHLeft = SC.h ? SC.h.scrollLeft : null;
      out.windowScrollable = winMoved();
      await sleep(150);
      var pageY = window.scrollY || window.pageYOffset || 0;

      out.before = {
        activeMark: document.activeElement && document.activeElement.__cp2sMark || null,
        activeTag: document.activeElement ? document.activeElement.tagName : null,
        selStart: (function(){ try { return input.selectionStart; } catch(e){ return 'NA'; } })(),
        selEnd: (function(){ try { return input.selectionEnd; } catch(e){ return 'NA'; } })(),
        value: input.value,
        panelMark: (document.getElementById('execution-plan-' + SKU) || {}).__cp2sMark || null,
        panelPresent: !!document.getElementById('execution-plan-' + SKU),
        scrollTop: SC.v ? SC.v.scrollTop : null, scrollLeft: SC.h ? SC.h.scrollLeft : null,
        windowY: pageY,
        avgCell: cellText(SKU, 'replen-avg-cell'), dosCell: cellText(SKU, 'replen-dos-cell'),
        inputTag: input.tagName, inputType: input.type || '', inputId: input.id || ''
      };
      step('edit-state-captured', out.before);

      /* ---- THE ARRIVAL. A real second read: real cache invalidation, real request, real envelope. ---- */
      var renderCalls = 0;
      if (typeof window.renderReplenishment === 'function') {
        var orig = window.renderReplenishment;
        window.renderReplenishment = function(){ renderCalls++; return orig.apply(this, arguments); };
      } else { out.notes.push('renderReplenishment not a window function - rebuild count unavailable'); }

      /* THE LOADER DEDUPES, AND THE FIRST RUN OF THIS HARNESS WAS DEDUPED. loadRecommendationWorkspace_
         returns immediately when contextKey matches and loadedOk is set, and there is a session cache in
         front of that, so the "second arrival" served ONE read and the cell never changed. Both are cleared,
         which is the same pair the FM2B cutover suite clears, so the request is genuinely re-issued and the
         envelope genuinely crosses the stub. */
      if (typeof window.invalidateRecommendationSessionCache === 'function') window.invalidateRecommendationSessionCache();
      else out.notes.push('no session-cache invalidator on window');
      if (typeof window._irRecoInvalidate === 'function') window._irRecoInvalidate('CONTEXT_NOT_READY');
      else out.notes.push('no _irRecoInvalidate on window');
      if (typeof window.loadRecommendationWorkspace_ !== 'function') { out.fatal = 'NO_LOADER'; return report(); }
      window.loadRecommendationWorkspace_();

      /* NOT "the text changed". A cell that goes from 7.0 to the loading marker has changed, and so has a
         cell that goes from 7.0 to a failure sentence; neither is the second answer arriving. */
      var changed = await waitFor(function(){
        var i = cellInfo(SKU, 'replen-avg-cell');
        return isReadyNumber(i, OPT.expectSecond) ? i : null;
      }, 25000, 'second-arrival');
      step('second-arrival', changed.ok ? changed.v.text
        : { got: cellInfo(SKU, 'replen-avg-cell'), expected: OPT.expectSecond });
      out.secondCellInfo = changed.ok ? changed.v : cellInfo(SKU, 'replen-avg-cell');
      await sleep(250);

      out.after = {
        activeMark: document.activeElement && document.activeElement.__cp2sMark || null,
        activeTag: document.activeElement ? document.activeElement.tagName : null,
        selStart: (function(){ try { return input.selectionStart; } catch(e){ return 'NA'; } })(),
        selEnd: (function(){ try { return input.selectionEnd; } catch(e){ return 'NA'; } })(),
        value: input.value,
        inputStillInDocument: document.contains(input),
        panelMark: (document.getElementById('execution-plan-' + SKU) || {}).__cp2sMark || null,
        panelPresent: !!document.getElementById('execution-plan-' + SKU),
        panelSameNode: document.getElementById('execution-plan-' + SKU) === panel,
        scrollTop: SC.v ? SC.v.scrollTop : null, scrollLeft: SC.h ? SC.h.scrollLeft : null,
        windowY: window.scrollY || window.pageYOffset || 0,
        avgCell: cellText(SKU, 'replen-avg-cell'), dosCell: cellText(SKU, 'replen-dos-cell'),
        renderReplenishmentCalls: renderCalls
      };
      out.verdict = {
        firstReadResolved: out.verdict.firstReadResolved,
        firstCell: out.verdict.firstCell,
        cellUpdated: out.after.avgCell !== out.before.avgCell && !!out.after.avgCell && out.after.avgCell !== '--',
        /* CP2U-R3 - the three the old verdict could not distinguish. */
        firstCellExpected: out.verdict.firstCellExpected,
        secondCellExpected: OPT.expectSecond,
        secondCellIsExpectedNumber: isReadyNumber(out.secondCellInfo, OPT.expectSecond),
        dosMovedToNumber: (out.after.dosCell !== out.before.dosCell)
          && /^[0-9]+(\.[0-9]+)?$/.test(String(out.after.dosCell || '')),
        focusKept: out.after.activeMark === 'INPUT',
        selectionKept: out.selectionCapable
          ? (out.after.selStart === 2 && out.after.selEnd === 2)
          : 'NOT_MEASURABLE_NO_TEXT_FIELD',
        valueKept: out.after.value === '1234',
        inputSameNode: out.after.inputStillInDocument === true,
        panelKept: out.after.panelSameNode === true && out.after.panelMark === 'PANEL',
        scrollKept: (out.scrollerV || out.scrollerH)
          ? (out.after.scrollTop === out.before.scrollTop && out.after.scrollLeft === out.before.scrollLeft)
          : 'NOT_MEASURABLE_NOTHING_SCROLLED',
        windowScrollKept: out.windowScrollable
          ? out.after.windowY === out.before.windowY
          : 'NOT_MEASURABLE_WINDOW_DOES_NOT_SCROLL',
        noFullRebuild: renderCalls === 0
      };
      step('done', out.verdict);

      /* CP2U-R3 item 3 - EVERY TRANSITION, IN THE SAME BROWSER, WITH THE OPERATOR'S WORK STILL ON SCREEN.
         Each arrival goes through the real cache invalidation and the real loader, so the envelope crosses
         the network stub and the page's own arrival path runs; nothing calls a painter directly. After each
         one the CELL is read back - text, class and title, because a dash alone does not say which kind of
         absence it is - and the five things that must survive are measured again. A state that reaches the
         screen by destroying the operator's half-typed quantity is not a fix. */
      if (OPT.states) {
        function avgI(){ return cellInfo(SKU, 'replen-avg-cell'); }
        function keep(label){
          return { label: label,
            avg: avgI(), dos: cellInfo(SKU, 'replen-dos-cell'),
            value: input.value,
            activeMark: document.activeElement ? (document.activeElement.__cp2sMark || null) : null,
            inputStillInDocument: document.contains(input),
            panelSameNode: document.getElementById('execution-plan-' + SKU) === panel,
            scrollTop: SC.v ? SC.v.scrollTop : null, scrollLeft: SC.h ? SC.h.scrollLeft : null,
            renderCalls: renderCalls };
        }
        out.states = { before: keep('before-states'), arrivals: [] };

        async function arrive(label, settled){
          var prev = (avgI() || {}).text;
          if (typeof window.invalidateRecommendationSessionCache === 'function') window.invalidateRecommendationSessionCache();
          if (typeof window._irRecoInvalidate === 'function') window._irRecoInvalidate('CONTEXT_NOT_READY');
          window.loadRecommendationWorkspace_();
          /* THE LOADING FRAME, sampled in the same turn the request is dispatched. CP2U-R2 made the
             in-flight cell say so; this is where that claim is either seen or not. */
          var loading = avgI();
          var got = await waitFor(function(){
            var i = avgI();
            return (i && settled(i)) ? i : null;
          }, 15000, 'state-' + label);
          var snap = keep(label);
          snap.loadingFrame = loading;
          snap.settled = got.ok;
          snap.previousText = prev;
          out.states.arrivals.push(snap);
          step('state-' + label, { settled: got.ok, text: (snap.avg || {}).text });
          return snap;
        }

        var PEND = PENDING_MARK;
        await arrive('failed',    function(i){ return /read failed/i.test(i.text); });
        await arrive('empty',     function(i){ return i.text === '--' && /no destination line for any SKU/i.test(i.title); });
        await arrive('withheld',  function(i){ return i.text === '--' && /withheld/i.test(i.title); });
        await arrive('zero',      function(i){ return /^0(\.0+)?$/.test(i.text); });
        await arrive('recovered', function(i){ return /^23(\.0+)?$/.test(i.text); });

        var A = {}; out.states.arrivals.forEach(function(a){ A[a.label] = a; });
        out.states.verdict = {
          /* each state is TOLD APART on the cell, not merely "different from before" */
          failedSaysFailed:      /read failed/i.test(((A.failed || {}).avg || {}).text || ''),
          failedCarriesErrorClass: /replen-cell--avg-error/.test(((A.failed || {}).avg || {}).cls || ''),
          failedIsNotZero:       !/^0/.test(((A.failed || {}).avg || {}).text || ''),
          failedDosNotZero:      (((A.failed || {}).dos || {}).text || '') === '--',
          loadingMarkSeen:       ((A.failed || {}).loadingFrame || {}).text === PEND,
          emptySaysNoLines:      /no destination line for any SKU/i.test(((A.empty || {}).avg || {}).title || ''),
          emptyIsNotError:       !/replen-cell--avg-error/.test(((A.empty || {}).avg || {}).cls || ''),
          withheldSaysWithheld:  /withheld/i.test(((A.withheld || {}).avg || {}).title || ''),
          withheldIsDistinctFromEmpty:
            (((A.withheld || {}).avg || {}).title || '') !== (((A.empty || {}).avg || {}).title || ''),
          zeroIsARealZero:       /^0(\.0+)?$/.test(((A.zero || {}).avg || {}).text || ''),
          zeroHasNoFailureText:  !/read failed|unavailable/i.test(((A.zero || {}).avg || {}).text || ''),
          recoveredShowsNumber:  /^23(\.0+)?$/.test(((A.recovered || {}).avg || {}).text || ''),
          recoveredClearedTitle: (((A.recovered || {}).avg || {}).title || '') === '',
          everyArrivalSettled:   out.states.arrivals.every(function(a){ return a.settled === true; }),
          /* and none of it cost the operator anything */
          valueKeptThroughout:   out.states.arrivals.every(function(a){ return a.value === '1234'; }),
          focusKeptThroughout:   out.states.arrivals.every(function(a){ return a.activeMark === 'INPUT'; }),
          inputSameNodeThroughout: out.states.arrivals.every(function(a){ return a.inputStillInDocument === true; }),
          panelKeptThroughout:   out.states.arrivals.every(function(a){ return a.panelSameNode === true; }),
          scrollKeptThroughout:  out.states.arrivals.every(function(a){
            return a.scrollTop === out.states.before.scrollTop && a.scrollLeft === out.states.before.scrollLeft; }),
          noFullRebuildThroughout: out.states.arrivals.every(function(a){ return a.renderCalls === 0; })
        };
        step('states-done', out.states.verdict);

        /* ---- AND THE FAILURE MUST NOT FOLLOW THE OPERATOR TO THE NEXT SITE ------------------ */
        var sw = { ran: false };
        var sel = document.getElementById('replenMarketplace');
        if (sel) {
          await arrive('failed-again', function(i){ return /read failed/i.test(i.text); });
          sw.failedBeforeSwitch = /read failed/i.test((avgI() || {}).text || '');
          var moved = await setSelect(sel, ${JSON.stringify(MKT2_ID)}, 'marketplace-2', 20000);
          sw.selectMoved = moved.ok;
          if (moved.ok) {
            var sbtn = document.querySelector('#ops-section .replen-btn--search');
            if (sbtn) sbtn.click(); else if (window.searchReplenishment) window.searchReplenishment();
            var after = await waitFor(function(){
              var i = cellInfo(SKU, 'replen-avg-cell');
              return (i && /^31(\.0+)?$/.test(i.text)) ? i : null;
            }, 25000, 'new-site');
            sw.ran = true;
            sw.newSiteCell = after.ok ? after.v : cellInfo(SKU, 'replen-avg-cell');
            sw.newSiteShowsItsOwnNumber = after.ok;
            sw.newSiteFreeOfOldFailure = !/read failed/i.test((sw.newSiteCell || {}).text || '')
              && !/replen-cell--avg-error/.test((sw.newSiteCell || {}).cls || '');
            /* no row anywhere may still be carrying the previous site's failure */
            sw.anyRowStillFailed = Array.prototype.some.call(
              document.querySelectorAll('#ops-section .scroll-row[data-sku] .replen-avg-cell'),
              function(c){ return /read failed/i.test(c.textContent || ''); });
          }
        }
        out.states.siteSwitch = sw;
        step('site-switch', sw);
      }

      /* CP2X-R1 B - SCOPE REUSE, IN-FLIGHT DEDUP AND RE-ENTRY, through the real page and the real router.
         Every phase is bracketed by a server-side mark, so the requests a phase caused are counted at the
         SERVER rather than inferred from the page. The page-side reader counts come from the two
         diagnostics the round added, which is the distinction the task asks for: a reader CALL that
         answers from a stored result is not a network request. */
      if (OPT.scopes) {
        var SC2 = { phases: [] };
        async function mark(label, scope){
          await fetch('/__mark?label=' + encodeURIComponent(label) + (scope ? ('&scope=' + scope) : ''), { cache: 'no-store' });
        }
        function diags(){
          return { reco: (typeof window._irRecoReadDiag_ === 'function') ? window._irRecoReadDiag_() : null,
                   gap: (typeof window._irMatReadDiag_ === 'function') ? window._irMatReadDiag_() : null,
                   answer: (typeof window._irRecoAnswerSource_ === 'function') ? window._irRecoAnswerSource_() : null };
        }
        async function phase(label, scope, fn){
          await mark('begin:' + label, scope);
          var err = null;
          try { await fn(); } catch (e) { err = String(e && e.message || e); }
          await mark('end:' + label, scope);
          var d = diags();
          SC2.phases.push({ label: label, error: err, diag: d,
            avg: cellInfo(SKU, 'replen-avg-cell') });
          step('scope-' + label, { err: err, recoCache: d.reco && d.reco.cache, gap: d.gap && { o: d.gap.outcome, net: d.gap.networkReads } });
        }
        /* WHETHER THE SELECTS ACTUALLY MOVED IS PART OF THE MEASUREMENT. A scenario that silently failed
           to switch site reports zero requests for a flattering reason, so each move is recorded and the
           phase carries it. setSelect waits for the option to EXIST before setting it, so "never held"
           means the registry did not offer that site rather than that the click was too early. */
        async function searchSite(countryVal, mktVal, waitText){
          var r = { country: null, mkt: null, settled: null };
          var cs = document.getElementById('replenCountry');
          if (cs && countryVal) { r.country = await setSelect(cs, countryVal, 'country-' + countryVal, 20000); }
          var ms = document.getElementById('replenMarketplace');
          if (ms && mktVal) { r.mkt = await setSelect(ms, mktVal, 'mkt-' + mktVal, 20000); }
          var sbtn = document.querySelector('#ops-section .replen-btn--search');
          if (sbtn) sbtn.click(); else if (window.searchReplenishment) window.searchReplenishment();
          if (waitText) {
            r.settled = (await waitFor(function(){ var i = cellInfo(SKU, 'replen-avg-cell');
              return (i && waitText.test(i.text)) ? i : null; }, 25000, 'site-' + mktVal)).ok;
          }
          r.countryOptions = cs ? Array.prototype.map.call(cs.options, function(o){ return o.value; }) : null;
          r.mktOptions = ms ? Array.prototype.map.call(ms.options, function(o){ return o.value; }) : null;
          /* CP2X-R2 B - THE APPLIED SCOPE, FROM THE PAGE, AFTER THE SEARCH. The select holding a value
             is not the same fact as the page having applied it: F1A keys every result on
             _irSearch.applied, and a search that was refused leaves the select moved and the applied
             scope where it was. Both are recorded so the acceptance can require that they agree. */
          r.appliedScopeKey = (typeof window._irAppliedScopeKey_ === 'function') ? window._irAppliedScopeKey_() : null;
          r.selectedScope   = (typeof window._replenSelectedScope === 'function') ? window._replenSelectedScope() : null;
          SC2.moves = SC2.moves || []; SC2.moves.push({ country: countryVal, mkt: mktVal, result: r });
          return r;
        }
        /* Hold the fixture's answers back, so "in flight" is a real interval rather than a label. */
        async function setDelay(ms){
          try { await fetch('/__delay?ms=' + ms, { cache: 'no-store' }); } catch (e) { out.notes.push('setDelay failed: ' + e.message); }
        }

        /* COLD FIRST. The in-place experiment above has already read and STORED the US answer, so without
           this the first phase would report zero requests for the right reason and the wrong measurement:
           reuse would be indistinguishable from a scenario that did nothing. */
        if (typeof window.invalidateRecommendationSessionCache === 'function') window.invalidateRecommendationSessionCache();
        if (typeof window._irRecoInvalidate === 'function') window._irRecoInvalidate('CONTEXT_NOT_READY');
        await phase('siteA-first', 'A', async function(){ await searchSite('US', ${JSON.stringify(MKT_ID)}, /^7(\.0+)?$/); });
        await phase('siteB-first', 'B', async function(){ await searchSite('US', ${JSON.stringify(MKT2_ID)}, /^31(\.0+)?$/); });
        await phase('siteA-again', 'A', async function(){ await searchSite('US', ${JSON.stringify(MKT_ID)}, /^7(\.0+)?$/); });

        /* LEAVE AND RETURN - the real router, not a re-render. */
        await phase('leave-return', 'A', async function(){
          if (window.KM && window.KM.lifecycle && typeof window.KM.lifecycle.switchTo === 'function') {
            await window.KM.lifecycle.switchTo('home');
            await new Promise(function(r){ setTimeout(r, 400); });
            await window.KM.lifecycle.switchTo('inventory-replenishment');
            await new Promise(function(r){ setTimeout(r, 600); });
          } else { SC2.lifecycleAbsent = true; }
        });

        /* RE-ENTRY WHILE PENDING - two further loader calls in the same turn as the first. */
        await phase('pending-reentry', 'A', async function(){
          if (typeof window.invalidateRecommendationSessionCache === 'function') window.invalidateRecommendationSessionCache();
          if (typeof window._irRecoInvalidate === 'function') window._irRecoInvalidate('CONTEXT_NOT_READY');
          window.loadRecommendationWorkspace_();
          window.loadRecommendationWorkspace_();
          window.loadRecommendationWorkspace_();
          if (typeof window.loadInventoryGap_ === 'function') {
            window.loadInventoryGap_(); window.loadInventoryGap_();
          }
          await new Promise(function(r){ setTimeout(r, 1200); });
        });

        /* SITE SWITCH WHILE IN FLIGHT - issue, then switch before it can land. */
        await phase('switch-in-flight', 'B', async function(){
          if (typeof window.invalidateRecommendationSessionCache === 'function') window.invalidateRecommendationSessionCache();
          if (typeof window._irRecoInvalidate === 'function') window._irRecoInvalidate('CONTEXT_NOT_READY');
          window.loadRecommendationWorkspace_();
          await searchSite('US', ${JSON.stringify(MKT2_ID)}, null);
          await new Promise(function(r){ setTimeout(r, 1500); });
        });
        /* CP2X-R2 A1 - RETURN TO A CACHED SITE WHILE THE OTHER ONE IS STILL IN FLIGHT.
           Site B's reads are held by the fixture for three seconds; the operator goes back to A inside
           that window and A is served from the per-scope results. B's answers then arrive with nobody
           waiting for them, and must not land on A's screen. */
        await phase('revisit-B-before-job', 'B', async function(){
          await searchSite('US', ${JSON.stringify(MKT2_ID)}, null);
          await new Promise(function(r){ setTimeout(r, 900); });
        });
        await phase('pending-return-to-cached', 'A', async function(){
          await searchSite('US', ${JSON.stringify(MKT_ID)}, null);
          await new Promise(function(r){ setTimeout(r, 900); });
          await setDelay(3000);
          await searchSite('US', ${JSON.stringify(MKT2_ID)}, null);   /* B dispatched, answer held back */
          await searchSite('US', ${JSON.stringify(MKT_ID)}, null);    /* back to A before B can answer */
          SC2.duringPending = { appliedScopeKey: window._irAppliedScopeKey_ ? window._irAppliedScopeKey_() : null,
                                gap: window._irMatReadDiag_ ? window._irMatReadDiag_() : null };
          await new Promise(function(r){ setTimeout(r, 4000); });     /* B's late answers arrive here */
          await setDelay(0);
        });
        SC2.afterLateArrival = { appliedScopeKey: window._irAppliedScopeKey_ ? window._irAppliedScopeKey_() : null,
                                 suggested: cellInfo(SKU, 'replen-suggested-cell'),
                                 avg: cellInfo(SKU, 'replen-avg-cell') };

        /* CP2X-R2 A2 - A FINISHED RECALCULATION, SIMULATED AT THE PAGE'S OWN CALLBACK.
           No job is started and nothing is written: this calls the function the gap-job poller calls on
           terminal DONE, with the scope the job ran. Both sites are held at this point, so what the
           next visit to the OTHER site costs is the whole question. */
        await phase('job-complete', 'A', async function(){
          if (typeof window.refreshInventoryGapAfterRecalc_ === 'function') {
            window.refreshInventoryGapAfterRecalc_({ mode: 'ALL_SITES' });
          } else { SC2.recalcRefreshAbsent = true; }
          await new Promise(function(r){ setTimeout(r, 1500); });
        });
        await phase('after-job-other-site', 'B', async function(){
          await searchSite('US', ${JSON.stringify(MKT2_ID)}, null);
          await new Promise(function(r){ setTimeout(r, 1500); });
        });

        SC2.axis = 'marketplace (company|country|marketplace differs in the marketplace component)';
        SC2.countryAxisNote = 'The cross-site axis here is MARKETPLACE. A cross-COUNTRY switch was '
          + 'attempted in CP2X-R1 and the country select never offered a second country, so the country '
          + 'axis is covered by the offline suite instead; the marketplace component is part of the same '
          + 'scope key and is driven here for real.';

        out.scopes = SC2;
        step('scopes-done', { phases: SC2.phases.length });
      }

      /* ============================================================================================
         CP2X-R4 — LEAVING THE PAGE AND COMING BACK, through the REAL router.

         THE IDS MATTER AND THE OLD ONES WERE WRONG. KM.lifecycle.register is keyed on the SECTION id
         ('ops-section', 'home-section'); there is no page called 'inventory-replenishment' and none
         called 'home'. switchTo with an unregistered name still unmounts whatever was mounted and then
         mounts NOTHING, so the earlier leave/return phase unmounted Site Inventory and never brought it
         back - and every assertion after it read module-global diagnostics that outlive the page. This
         block uses the registered ids so mount() and unmount() both really run, and records the
         lifecycle's own view so a future reader can prove they did.

         WHAT IS ASSERTED, deliberately more than "no new requests": the two selectors AND the options
         behind them, the applied scope, the three cell NUMBERS, the summary card, and the request
         counts. A page that comes back blank also issues no requests. */
      if (OPT.revisit) {
        var RV = { phases: [], lifecycleIds: null };
        RV.lifecycleIds = (function(){
          try { return { registered: (window.KM.lifecycle.__debug ? window.KM.lifecycle.__debug() : null),
                         current: (window.KM.lifecycle.getCurrentPage ? window.KM.lifecycle.getCurrentPage() : null) }; }
          catch (e) { return { error: String(e && e.message || e) }; }
        })();
        async function rmark(label){
          await fetch('/__mark?label=' + encodeURIComponent(label), { cache: 'no-store' });
        }
        function sel(id){ return document.getElementById(id); }
        function optsOf(el){ return el ? Array.prototype.map.call(el.options, function(o){ return o.value; }) : null; }
        function snap(label){
          var cs = sel('replenCountry'), ms = sel('replenMarketplace');
          var sec = document.getElementById('ops-section');
          var card = document.getElementById('recommendation-summary-' + SKU);
          var g = (typeof window._irMatReadDiag_ === 'function') ? window._irMatReadDiag_() : null;
          var rc = (typeof window._irRecoReadDiag_ === 'function') ? window._irRecoReadDiag_() : null;
          return { label: label,
            country: cs ? cs.value : null, countryOptions: optsOf(cs),
            marketplace: ms ? ms.value : null, mktOptions: optsOf(ms),
            appliedScopeKey: (typeof window._irAppliedScopeKey_ === 'function') ? window._irAppliedScopeKey_() : null,
            status: (typeof window._irSearchState_ === 'function') ? (window._irSearchState_() || {}).status : null,
            bootstrap: (typeof window._irBootstrapDiagnostic_ === 'function') ? window._irBootstrapDiagnostic_() : null,
            sectionActive: sec ? sec.classList.contains('active') : null,
            rows: document.querySelectorAll('#ops-section .scroll-row[data-sku]').length,
            avg: cellInfo(SKU, 'replen-avg-cell'),
            dos: cellInfo(SKU, 'replen-dos-cell'),
            suggested: cellInfo(SKU, 'replen-suggested-cell'),
            summaryCard: card ? String(card.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 160) : null,
            gapNet: g ? g.networkReads : null, gapOutcome: g ? g.outcome : null,
            recoCache: rc ? rc.cache : null,
            /* The operator's Execution Plan. _clearAllocationDraft removes this key, and the country
               onchange handler calls it - so if a programmatic restore ever dispatches 'change', this
               goes from a string to null and the operator's typed quantities are gone. */
            execPlanRaw: (function(){ try { var v = sessionStorage.getItem('km_replen_alloc_draft_v1');
              return v === null ? null : String(v).length; } catch (e) { return 'THREW'; } })(),
            /* CP2X-R4-R1 - the RECOMMENDATION READ STATE. _irRecoReadDiag_ carries cache + latency and
               has no status field at all, so every earlier capture recorded undefined here and the one
               fact B is about - whether a read is still outstanding - was not in the evidence. */
            recoStatus: (function(){ try { return (window._irRecoState || {}).status || null; } catch (e) { return null; } })(),
            recoLoadedOk: (function(){ try { return (window._irRecoState || {}).loadedOk === true; } catch (e) { return null; } })(),
            recoRequestId: (function(){ try { return (window._irRecoState || {}).requestId || null; } catch (e) { return null; } })() };
        }
        /* The REAL navigation, with the ids the registry actually holds. */
        async function leaveReturn(awayMs, backMs){
          var L = { ok: false };
          try {
            await window.KM.lifecycle.switchTo('home-section');
            L.afterLeave = { current: window.KM.lifecycle.getCurrentPage ? window.KM.lifecycle.getCurrentPage() : null,
                             opsActive: (function(){ var s = document.getElementById('ops-section');
                               return s ? s.classList.contains('active') : null; })() };
            await sleep(awayMs);
            await window.KM.lifecycle.switchTo('ops-section');
            await sleep(backMs);
            L.ok = true;
          } catch (e) { L.error = String(e && e.message || e); }
          return L;
        }
        async function rphase(label, fn){
          await rmark('begin:' + label);
          var err = null, extra = null;
          try { extra = await fn(); } catch (e) { err = String(e && e.message || e); }
          await rmark('end:' + label);
          var s = snap(label);
          s.error = err; s.extra = extra;
          RV.phases.push(s);
          step('rv-' + label, { country: s.country, mkt: s.marketplace, applied: s.appliedScopeKey,
            status: s.status, avg: s.avg && s.avg.text, gapNet: s.gapNet, rows: s.rows });
          return s;
        }
        /* Reuse the scopes helper if it exists; otherwise a local one. */
        async function doSearch(countryVal, mktVal){
          var cs = sel('replenCountry');
          if (cs && countryVal) await setSelect(cs, countryVal, 'rv-country', 20000);
          var ms = sel('replenMarketplace');
          if (ms && mktVal) await setSelect(ms, mktVal, 'rv-mkt', 20000);
          var b = document.querySelector('#ops-section .replen-btn--search');
          if (b) b.click(); else if (window.searchReplenishment) window.searchReplenishment();
          await sleep(1500);
        }

        /* THE OWNER'S COUNTER-EXAMPLES (CP2X-R4 §A), driven on a real country axis.
           Every site answers with its OWN numbers, so each assertion below distinguishes "the right
           site answered" from "a site answered":
             EU/Amazon  avg 13.0  suggested 1381      JP/Amazon  avg 23.0  suggested 2381
             EU/Walmart avg 17.0  suggested 1781      US/Amazon  avg  7.0  suggested   81
           The in-place experiment above consumed the fixture's first two reco reads, and those two
           answer WITHOUT the handler marker on purpose, so a baseline taken there would measure the
           session cache's refusal rather than the contract. Invalidate first. */
        if (typeof window.invalidateRecommendationSessionCache === 'function') window.invalidateRecommendationSessionCache();
        if (typeof window._irRecoInvalidate === 'function') window._irRecoInvalidate('CONTEXT_NOT_READY');

        /* ---- 0. EU Search succeeds. This is the result every scenario below must come back to. */
        await rphase('eu-searched', async function(){
          await doSearch('EU', 'MP-FIXTURE-EU-AMZ');
          await sleep(900);
          return { note: 'baseline: EU/Amazon' };
        });

        /* Plant an Execution Plan. _clearAllocationDraft removes this key, and the country onchange
           handler calls it - so if any restore path dispatches 'change', this goes null. */
        try { sessionStorage.setItem('km_replen_alloc_draft_v1',
          JSON.stringify({ bySku: { 'CP2XR4-SENTINEL': [{ qty: 1234 }] }, at: Date.now() })); } catch (e) {}

        /* ---- A1. choose JP as COUNTRY ONLY (no marketplace), leave, return.
           The marketplace select is rebuilt for JP when the country changes, so on return the EU id is
           not among its options. Restoring in the wrong order sets the country and silently drops the
           marketplace. Must come back fully EU. */
        await rphase('A1-jp-country-only-then-leave', async function(){
          var cs = sel('replenCountry');
          if (cs) { cs.value = 'JP'; cs.dispatchEvent(new Event('change', { bubbles: true })); }
          await sleep(400);
          var mid = snap('A1:mid');
          var L = await leaveReturn(500, 1400);
          return { mid: { country: mid.country, mkt: mid.marketplace, mktOptions: mid.mktOptions,
                          applied: mid.appliedScopeKey }, nav: L };
        });

        /* ---- A2. do NOT touch the country. Press Search. The result must be the restored EU scope. */
        await rphase('A2-search-without-touching-country', async function(){
          var b = document.querySelector('#ops-section .replen-btn--search');
          if (b) b.click(); else if (window.searchReplenishment) window.searchReplenishment();
          await sleep(1800);
          return { note: 'search pressed with the restored selectors untouched' };
        });

        /* ---- A3. change ONLY the marketplace, within the restored country, then Search. */
        await rphase('A3-marketplace-only-then-search', async function(){
          var ms = sel('replenMarketplace');
          var held = ms ? await setSelect(ms, 'MP-FIXTURE-EU-WMT', 'rv-eu-wmt', 15000) : null;
          if (ms) ms.dispatchEvent(new Event('change', { bubbles: true }));
          await sleep(200);
          var b = document.querySelector('#ops-section .replen-btn--search');
          if (b) b.click(); else if (window.searchReplenishment) window.searchReplenishment();
          await sleep(1800);
          return { held: held, expect: { avg: '17.0', suggested: '1781' } };
        });

        /* Back to EU/Amazon so the remaining scenarios start from one known place. */
        await rphase('A3b-back-to-eu-amazon', async function(){
          await doSearch('EU', 'MP-FIXTURE-EU-AMZ');
          await sleep(900);
          return { note: 'restored baseline' };
        });

        /* ---- A4. choose JP COMPLETELY (country AND marketplace) but never Search, leave, return.
           A fully-formed but unconfirmed selection is still a draft. The applied scope is EU. */
        await rphase('A4-full-jp-never-searched', async function(){
          var cs = sel('replenCountry');
          if (cs) { cs.value = 'JP'; cs.dispatchEvent(new Event('change', { bubbles: true })); }
          await sleep(400);
          var ms = sel('replenMarketplace');
          var held = ms ? await setSelect(ms, 'MP-FIXTURE-JP-AMZ', 'rv-jp-amz', 15000) : null;
          if (ms) ms.dispatchEvent(new Event('change', { bubbles: true }));
          await sleep(300);
          var mid = snap('A4:mid');
          var L = await leaveReturn(500, 1400);
          return { held: held, mid: { country: mid.country, mkt: mid.marketplace,
                   applied: mid.appliedScopeKey }, nav: L };
        });

        /* ---- A5. now choose JP explicitly AND press Search. Only here may JP apply. */
        await rphase('A5-jp-explicit-search', async function(){
          await doSearch('JP', 'MP-FIXTURE-JP-AMZ');
          await sleep(1800);
          return { expect: { avg: '23.0', suggested: '2381' } };
        });

        /* ---- B. AN INCONSISTENT PAIR MUST NOT REACH THE SERVER.
           The country select is moved to EU while the marketplace still holds a JP id - the exact state
           a wrongly-ordered restore produces. Pressing Search must refuse: no request, no change to
           the applied scope, and no mixed-site table. */
        await rphase('B-illegal-pair-refused', async function(){
          var cs = sel('replenCountry'), ms = sel('replenMarketplace');
          var beforeApplied = (typeof window._irAppliedScopeKey_ === 'function') ? window._irAppliedScopeKey_() : null;
          /* set BOTH directly, with no change event, so the pair is genuinely inconsistent */
          if (cs) cs.value = 'EU';
          if (ms) ms.value = 'MP-FIXTURE-JP-AMZ';
          var pairBefore = { country: cs && cs.value, mkt: ms && ms.value };
          var b = document.querySelector('#ops-section .replen-btn--search');
          if (b) b.click(); else if (window.searchReplenishment) window.searchReplenishment();
          await sleep(1200);
          return { beforeApplied: beforeApplied, pairBefore: pairBefore,
                   refusal: (typeof window._irBootstrapDiagnostic_ === 'function')
                     ? window._irBootstrapDiagnostic_().last_refusal : null };
        });

        /* Return to a clean, applied JP scope. */
        await rphase('B2-recover-to-jp', async function(){
          await doSearch('JP', 'MP-FIXTURE-JP-AMZ');
          await sleep(1200);
          return { note: 'recovered' };
        });

        /* ---- C1. the ordinary leave and return, on the JP scope.
               THE EXECUTION PLAN IS PLANTED HERE, not earlier: the A-scenarios each make a real country
               change, whose onchange handler legitimately discards the draft, so a sentinel planted
               before them would be cleared for the RIGHT reason and prove nothing. This phase makes no
               selector change at all, so the only thing that could remove the key is the restore - and
               it must not. */
        try { sessionStorage.setItem('km_replen_alloc_draft_v1',
          JSON.stringify({ bySku: { 'CP2XR4-SENTINEL': [{ qty: 1234 }] }, at: Date.now() })); } catch (e) {}
        await rphase('C1-leave-return', async function(){
          var planted = (function(){ try { return sessionStorage.getItem('km_replen_alloc_draft_v1') !== null; }
                                     catch (e) { return 'THREW'; } })();
          var L = await leaveReturn(500, 1400);
          return { plantedBefore: planted, nav: L };
        });

        /* ---- C2. REPEATED Search: pressing it twice must not double-read or change the answer. */
        await rphase('C2-repeated-search', async function(){
          var b = document.querySelector('#ops-section .replen-btn--search');
          if (b) { b.click(); b.click(); b.click(); }
          await sleep(2000);
          return { note: 'three clicks, single-flight' };
        });

        /* ---- C3. leaving WHILE a read is in flight, then coming back. */
        await rphase('C3-leave-while-in-flight', async function(){
          try { await fetch('/__delay?ms=2500', { cache: 'no-store' }); } catch (e) {}
          var b = document.querySelector('#ops-section .replen-btn--search');
          if (b) b.click();
          await sleep(150);
          var L = await leaveReturn(300, 2800);
          try { await fetch('/__delay?ms=0', { cache: 'no-store' }); } catch (e) {}
          await sleep(800);
          return { nav: L };
        });

        /* ---- C4. rapid consecutive switching: the last navigation must win and the page must be
               mounted and whole at the end of it. */
        await rphase('C4-rapid-switching', async function(){
          var seq = [];
          for (var i = 0; i < 4; i++) {
            window.KM.lifecycle.switchTo('home-section');
            window.KM.lifecycle.switchTo('ops-section');
            seq.push(window.KM.lifecycle.getCurrentPage ? window.KM.lifecycle.getCurrentPage() : null);
            await sleep(120);
          }
          await sleep(1800);
          return { seq: seq, mountedOps: (function(){ var s = document.getElementById('ops-section');
            return s ? s.classList.contains('active') : null; })() };
        });

        /* ---- C5. A LATE ANSWER FOR A SITE THE OPERATOR HAS LEFT.
               EU is dispatched with the fixture holding its reply, the operator returns to JP inside
               that window, and EU's answer lands with nobody waiting for it. It must not paint. */
        await rphase('C5-late-answer-after-switch', async function(){
          await fetch('/__delay?ms=3000', { cache: 'no-store' }).catch(function(){});
          await doSearch('EU', 'MP-FIXTURE-EU-AMZ');     /* dispatched, held */
          await doSearch('JP', 'MP-FIXTURE-JP-AMZ');     /* back to JP before EU can answer */
          var during = { applied: (typeof window._irAppliedScopeKey_ === 'function') ? window._irAppliedScopeKey_() : null };
          await sleep(4000);                              /* EU's late answer arrives here */
          try { await fetch('/__delay?ms=0', { cache: 'no-store' }); } catch (e) {}
          await sleep(800);
          return { during: during };
        });

        /* ==========================================================================================
           CP2X-R4-R1 — THE THREE BOUNDARIES THE PREVIOUS ROUND LEFT OPEN.
           Each scenario below was written to FAIL against the CP2X-R4 candidate and is kept in that
           form: the number it asserts is a site-distinguishing one, and the state it asserts is read
           from the page's own diagnostics rather than inferred from an absence.
           ========================================================================================== */
        async function ctl(path){ try { return await (await fetch(path, { cache: 'no-store' })).json(); }
                                  catch (e) { return { ok: false, error: String(e && e.message || e) }; } }
        function diag(){ try { return window._irBootstrapDiagnostic_ ? window._irBootstrapDiagnostic_() : null; }
                         catch (e) { return { error: String(e && e.message || e) }; } }
        function recoState(){ try { var r = window._irRecoState || {};
          return { status: r.status || null, loadedOk: r.loadedOk === true,
                   requestId: r.requestId || null, contextKey: r.contextKey || null,
                   errors: (r.errors || []).map(function(e){ return e && e.code; }) }; }
          catch (e) { return { error: String(e && e.message || e) }; } }
        function recoDiag(){ try { return window._irRecoReadDiag_ ? window._irRecoReadDiag_() : null; }
                             catch (e) { return null; } }
        /* Tear the scope AUTHORITY down without touching the selectors. This is the real shape of the
           window the page has on every cold open: a remembered pair in the DOM and nothing loaded yet
           to check it against. The selects keep their options, so the operator can press Search. */
        function dropAuthority(){
          var before = { hadModel: !!window._irReadModel,
                         registryStatus: (window._irRegistry || {}).status || null };
          try { if (!window.__rvOrigGetMarketplaces && window.KM && window.KM.DB)
            window.__rvOrigGetMarketplaces = window.KM.DB.getMarketplaces; } catch (e) {}
          window._irReadModel = null;
          window._irRegistry = { status: 'IDLE', model: null, error: null,
                                 seq: ((window._irRegistry || {}).seq || 0) };
          try { if (window.KM && window.KM.DB) window.KM.DB.getMarketplaces = function(){ return []; }; } catch (e) {}
          var listNow = null;
          try { listNow = (window._replenActiveMarketplaces ? window._replenActiveMarketplaces() : []).length; }
          catch (e) { listNow = 'THREW'; }
          return { before: before, activeListLength: listNow };
        }
        function setPair(countryVal, mktVal){
          var cs = sel('replenCountry'), ms = sel('replenMarketplace');
          /* set BOTH directly and fire NO change event: a dispatched change would clear the Execution
             Plan and rebuild the options, which is the state this is trying to reproduce, not repair. */
          if (cs) cs.value = countryVal;
          if (ms) ms.value = mktVal;
          return { country: cs && cs.value, mkt: ms && ms.value, mktOptions: optsOf(ms) };
        }
        function clickSearch(){
          var b = document.querySelector('#ops-section .replen-btn--search');
          if (b) b.click(); else if (window.searchReplenishment) window.searchReplenishment();
        }

        /* ---- R1-base. A clean, applied JP/Amazon result. Every §A refusal below is measured against
               THIS, so "the applied scope did not move" is a comparison with a known site. */
        await rphase('R1-base-jp-amz', async function(){
          await doSearch('JP', 'MP-FIXTURE-JP-AMZ');
          await sleep(1200);
          return { note: 'baseline for the R1 scenarios: JP/Amazon, avg 23.0' };
        });

        /* Re-read the AUTHORITY without rebuilding the selects. This is the shape of the real window:
           the registry changed between visits and the page has re-read it, while the operator's
           selection - made when the site was still live - is still sitting in the DOM. */
        async function reReadAuthority(){
          try {
            await window._irWorkspaceRefresh_({ quiet: true, carrier: true,
              owner: 'RESTORED_MOUNT_REVALIDATION',
              reason: 'the harness re-reads the authority so a retired site is known to the page' });
          } catch (e) { return { error: String(e && e.message || e) }; }
          var list = [];
          try { list = (window._replenActiveMarketplaces ? window._replenActiveMarketplaces() : []).map(function(m){
            return m.marketplaceId || m.marketplace_id; }); } catch (e) {}
          return { activeIds: list };
        }
        async function restoreAuthority(){
          try { if (window.__rvOrigGetMarketplaces && window.KM && window.KM.DB)
            window.KM.DB.getMarketplaces = window.__rvOrigGetMarketplaces; } catch (e) {}
          try { await window._irEnsureRegistryLoaded_({ force: true }); } catch (e) {}
          try { await window._irWorkspaceRefresh_({ quiet: true, carrier: true,
            owner: 'RESTORED_MOUNT_REVALIDATION', reason: 'the harness puts the authority back' }); } catch (e) {}
          return { activeListLength: (function(){ try { return (window._replenActiveMarketplaces
            ? window._replenActiveMarketplaces() : []).length; } catch (e) { return 'THREW'; } })() };
        }

        /* ---- R1A0. JP/Yahoo, chosen and searched while it is LIVE (avg 37.0 is its own number), then
               JP/Amazon, so the APPLIED scope is Amazon while the select can still be moved back to
               Yahoo. "The applied scope did not move" is then a comparison with a different site
               rather than with itself. */
        await rphase('R1A0-yahoo-live-then-amazon', async function(){
          await doSearch('JP', 'MP-FIXTURE-JP-YAH');
          await sleep(1000);
          var yah = { avg: cellInfo(SKU, 'replen-avg-cell'),
                      applied: window._irAppliedScopeKey_ ? window._irAppliedScopeKey_() : null };
          await doSearch('JP', 'MP-FIXTURE-JP-AMZ');
          await sleep(1000);
          return { yahoo: yah, note: 'JP/Yahoo is a complete site: avg 37.0; applied is now JP/Amazon' };
        });

        /* ---- R1A1. THE SITE IS RETIRED WHILE IT IS SELECTED.
               A select cannot be made to hold a value it was never offered - the assignment leaves it
               at empty - so the only honest way to stage a stale id is the way it actually occurs: the
               operator selects a live site, the registry retires it, and the page re-reads the
               authority without rebuilding the select. The authority is LOADED and says this record is
               not active. That is INVALID, not unverifiable: a named refusal, no request, and the
               applied JP/Amazon result left exactly where it is.
               CP2X-R4 cannot tell the two apart, because _replenActiveMarketplaces filters inactive
               records OUT - so a retired site looks identical to an id that was never in the model,
               and both fall through the same fail-open. MEASURED: no refusal recorded, and a request
               issued for the retired site. */
        await rphase('R1A1-retired-id-refused', async function(){
          var ms = sel('replenMarketplace'), cs = sel('replenCountry');
          if (ms) ms.value = 'MP-FIXTURE-JP-YAH';          /* still an offered option, so this sticks */
          await ctl('/__site-status?id=MP-FIXTURE-JP-YAH&status=inactive');
          var re = await reReadAuthority();
          var held = { country: cs && cs.value, mkt: ms && ms.value, mktOptions: optsOf(ms) };
          var beforeApplied = window._irAppliedScopeKey_ ? window._irAppliedScopeKey_() : null;
          await rmark('preclick:R1A1-retired-id-refused');
          clickSearch();
          await sleep(1600);
          return { reRead: re, held: held, beforeApplied: beforeApplied,
                   refusal: (diag() || {}).last_refusal || null,
                   afterApplied: window._irAppliedScopeKey_ ? window._irAppliedScopeKey_() : null,
                   afterAvg: cellInfo(SKU, 'replen-avg-cell') };
        });

        /* ---- R1A2. THE RECORD IS DROPPED ALTOGETHER. Loaded authority, record absent: also INVALID,
               and it must be named DIFFERENTLY from the retired case - "retired" and "never existed"
               are different facts about the operator's selection, and a page that conflates them tells
               the operator to do the wrong thing about it. A different site is used, because R1A1's
               refusal legitimately re-offers the country's options and drops the id it refused. */
        await rphase('R1A2-removed-id-refused', async function(){
          var ms = sel('replenMarketplace'), cs = sel('replenCountry');
          if (ms) ms.value = 'MP-FIXTURE-JP-RAK';
          await ctl('/__site-status?id=MP-FIXTURE-JP-RAK&status=absent');
          var re = await reReadAuthority();
          var held = { country: cs && cs.value, mkt: ms && ms.value, mktOptions: optsOf(ms) };
          var beforeApplied = window._irAppliedScopeKey_ ? window._irAppliedScopeKey_() : null;
          await rmark('preclick:R1A2-removed-id-refused');
          clickSearch();
          await sleep(1600);
          return { reRead: re, held: held, beforeApplied: beforeApplied,
                   refusal: (diag() || {}).last_refusal || null,
                   afterApplied: window._irAppliedScopeKey_ ? window._irAppliedScopeKey_() : null,
                   afterAvg: cellInfo(SKU, 'replen-avg-cell') };
        });

        /* ---- R1A2b. Put both sites back and return to a clean JP/Amazon baseline. */
        await rphase('R1A2b-sites-restored', async function(){
          await ctl('/__site-status?id=MP-FIXTURE-JP-YAH&status=active');
          await ctl('/__site-status?id=MP-FIXTURE-JP-RAK&status=active');
          await reReadAuthority();
          await doSearch('JP', 'MP-FIXTURE-JP-AMZ');
          await sleep(1200);
          return { note: 'baseline restored: JP/Amazon, avg 23.0' };
        });

        /* ---- R1A3. NOT-YET-LOADED AND ILLEGAL. The authority is torn down - the state every cold open
               passes through - and the pair held in the DOM is US + a JAPANESE id. CP2X-R4 treats an
               unloadable list as "cannot verify" and FAILS OPEN, so this pair reaches the server: the
               request names JP while the screen says US, and applied becomes us|MP-FIXTURE-JP-RAK, a
               scope nobody selected. MEASURED on the CP2X-R4 candidate, exactly that.
               An UNVERIFIED pair must never be committed. Load the source with the loader that already
               exists, re-validate, and only then decide - which makes this pair INVALID. */
        await rphase('R1A3-unverified-illegal-pair', async function(){
          var beforeApplied = window._irAppliedScopeKey_ ? window._irAppliedScopeKey_() : null;
          var dropped = dropAuthority();
          var pair = setPair('US', 'MP-FIXTURE-JP-RAK');
          clickSearch();
          await sleep(3200);
          return { beforeApplied: beforeApplied, dropped: dropped, pair: pair,
                   refusal: (diag() || {}).last_refusal || null,
                   afterApplied: window._irAppliedScopeKey_ ? window._irAppliedScopeKey_() : null };
        });

        await rphase('R1A3b-authority-restored', async function(){
          var r = await restoreAuthority();
          await doSearch('JP', 'MP-FIXTURE-JP-AMZ');
          await sleep(1200);
          return r;
        });

        /* ---- R1A4. NOT-YET-LOADED AND LEGAL — the half that stops the fix becoming "refuse whenever
               unsure". The pair is chosen through the real selects while the authority is intact (which
               changes nothing yet: a selector change is invisible to the table until Search), the
               authority is then torn down, and Search is pressed. It must LOAD, re-validate, and APPLY:
               EU/Walmart, avg 17.0. A fix that refused here would have traded one defect for a worse one. */
        await rphase('R1A4-unverified-legal-pair', async function(){
          var cs = sel('replenCountry'), ms = sel('replenMarketplace');
          if (cs) await setSelect(cs, 'EU', 'rv-r1a4-country', 20000);
          if (ms) await setSelect(ms, 'MP-FIXTURE-EU-WMT', 'rv-r1a4-mkt', 20000);
          var beforeApplied = window._irAppliedScopeKey_ ? window._irAppliedScopeKey_() : null;
          var dropped = dropAuthority();
          var pair = { country: cs && cs.value, mkt: ms && ms.value };
          clickSearch();
          await sleep(3500);
          return { beforeApplied: beforeApplied, dropped: dropped, pair: pair,
                   refusal: (diag() || {}).last_refusal || null,
                   afterApplied: window._irAppliedScopeKey_ ? window._irAppliedScopeKey_() : null };
        });

        await rphase('R1A4b-authority-restored', async function(){
          return await restoreAuthority();
        });

        /* ---- R1B1. LEAVING WHILE THE RECOMMENDATION READ IS GENUINELY IN FLIGHT.
               CP2X-R4's leave/return case had a SETTLED result to keep, which is the easy half. This
               one has nothing to keep: the session cache is emptied, the answer is held for four
               seconds, and the operator leaves inside that window. The unmount aborts - correctly -
               and the page comes back with the recommendation state blanked to DISABLED and NOTHING
               that re-reads it, so Avg Sales and Days of Supply stay '--' until a second Search is
               pressed for a scope that never changed.
               One re-read on return is allowed and is what the recovery costs. */
        await rphase('R1B1-cold-inflight-leave-return', async function(){
          try { if (window.invalidateRecommendationSessionCache) window.invalidateRecommendationSessionCache(); } catch (e) {}
          await ctl('/__delay?ms=4000');
          await doSearch('US', 'MP-FIXTURE-US-WMT');
          var mid = { recoStatus: recoState(),
                      avg: cellInfo(SKU, 'replen-avg-cell'),
                      dos: cellInfo(SKU, 'replen-dos-cell'),
                      applied: window._irAppliedScopeKey_ ? window._irAppliedScopeKey_() : null };
          /* Leave, THEN clear the hold, THEN return. The recovery read must not inherit the hold the
             abandoned one was given - holding it too would measure the fixture, not the page, and the
             phase would end with the recovery still outstanding whether or not it was ever issued. */
          await window.KM.lifecycle.switchTo('home-section');
          var afterLeave = { current: window.KM.lifecycle.getCurrentPage ? window.KM.lifecycle.getCurrentPage() : null,
                             opsActive: (function(){ var s = document.getElementById('ops-section');
                               return s ? s.classList.contains('active') : null; })(),
                             reco: recoState() };
          await sleep(250);
          await ctl('/__delay?ms=0');
          await window.KM.lifecycle.switchTo('ops-section');
          await sleep(3200);   /* the recovery settles here, and so does the abandoned answer */
          return { mid: mid, afterLeave: afterLeave, searchPressedAfterReturn: false };
        });

        /* ---- R1B1b. THE WORKAROUND, RECORDED RATHER THAN ASSUMED. On the CP2X-R4 candidate the only
               way back from the dashes is a second Search for a scope that never changed, and that is
               worth having in the capture as the cost the defect imposes. After the fix the state is
               already READY when this runs, so pressing Search here must change nothing at all - which
               is also what makes the phase safe to keep. */
        await rphase('R1B1b-search-after-dashes', async function(){
          var before = { reco: recoState(), avg: cellInfo(SKU, 'replen-avg-cell'),
                         dos: cellInfo(SKU, 'replen-dos-cell') };
          clickSearch();
          await sleep(2200);
          return { before: before };
        });

        /* ---- R1B2. THE WARM HALF, unchanged in cost. The site now HAS a settled result, so a leave
               and return must spend nothing at all - no recommendation read of any kind, cached or
               otherwise - and must not ask for a Search either. */
        await rphase('R1B2-warm-cache-zero-reads', async function(){
          var before = { recoStatus: recoState(),
                         avg: cellInfo(SKU, 'replen-avg-cell') };
          var L = await leaveReturn(400, 1400);
          return { before: before, nav: L };
        });

        /* ---- R1B3. AN OLD REQUEST'S SUCCESS ARRIVING AFTER THE OPERATOR HAS MOVED ON.
               EU/Amazon is dispatched and held; the operator leaves mid-flight, returns (which issues
               the recovery read, also held), and then explicitly searches JP/Amazon, which answers at
               once. Both held EU answers then land with nobody waiting for them. The screen must stay
               JP: avg 23.0, applied jp|MP-FIXTURE-JP-AMZ. */
        await rphase('R1B3-late-success-after-switch', async function(){
          try { if (window.invalidateRecommendationSessionCache) window.invalidateRecommendationSessionCache(); } catch (e) {}
          await ctl('/__delay?ms=3000');
          await doSearch('EU', 'MP-FIXTURE-EU-AMZ');
          var L = await leaveReturn(250, 350);
          await ctl('/__delay?ms=0');
          await doSearch('JP', 'MP-FIXTURE-JP-AMZ');
          var afterJp = { avg: cellInfo(SKU, 'replen-avg-cell'),
                          applied: window._irAppliedScopeKey_ ? window._irAppliedScopeKey_() : null };
          await sleep(4000);   /* the two held EU answers arrive here */
          return { nav: L, afterJp: afterJp };
        });

        /* ---- R1B4. AN OLD REQUEST'S FAILURE arriving after a newer result is already published. An
               aborted fetch rejects promptly, so the fixture is told to fail the next recommendation
               answer AND to hold it: the failure lands four seconds later, long after the recovery
               read has succeeded. It must not turn a good screen into an error one. */
        await rphase('R1B4-late-failure-after-recovery', async function(){
          try { if (window.invalidateRecommendationSessionCache) window.invalidateRecommendationSessionCache(); } catch (e) {}
          await ctl('/__fail-next?n=1');
          await ctl('/__delay?ms=4000');
          await doSearch('EU', 'MP-FIXTURE-EU-WMT');
          /* Leave, clear the hold, THEN return - for the same reason as R1B1: the recovery read must
             not inherit the hold that was put on the answer it is replacing, or the phase measures
             the fixture rather than the page. */
          await window.KM.lifecycle.switchTo('home-section');
          var L = { afterLeave: { current: window.KM.lifecycle.getCurrentPage ? window.KM.lifecycle.getCurrentPage() : null,
                                  opsActive: (function(){ var s = document.getElementById('ops-section');
                                    return s ? s.classList.contains('active') : null; })() } };
          await sleep(250);
          await ctl('/__delay?ms=0');
          await window.KM.lifecycle.switchTo('ops-section');
          await sleep(1800);
          var afterRecovery = { recoStatus: recoState(),
                                avg: cellInfo(SKU, 'replen-avg-cell'),
                                dos: cellInfo(SKU, 'replen-dos-cell'),
                                applied: window._irAppliedScopeKey_ ? window._irAppliedScopeKey_() : null };
          await sleep(3200);   /* the held FAILURE for the abandoned request lands here */
          return { nav: L, afterRecovery: afterRecovery };
        });

        /* Back to a known-good screen before the C scenarios, by the same workaround. On the fixed
           source this press changes nothing; on the candidate it is what the operator has to do. */
        await rphase('R1B4b-recovered-before-c', async function(){
          var before = { reco: recoState(), avg: cellInfo(SKU, 'replen-avg-cell') };
          clickSearch();
          await sleep(2200);
          return { before: before };
        });

        /* A render counter. renderReplenishment is a global binding, so replacing it on window
           replaces what the page itself calls - which is how the in-place experiment above already
           counts repaints. "Nothing was repainted" is otherwise not observable at all: the restore on
           return repaints anyway, so the rows look the same whether or not a dead round drew them. */
        function renderCounter(){
          if (window.__rvRenderCount == null) {
            var orig = window.renderReplenishment;
            window.__rvRenderOrig = orig;
            window.__rvRenderCount = 0;
            window.renderReplenishment = function(){ window.__rvRenderCount++; return orig.apply(this, arguments); };
          }
          return window.__rvRenderCount;
        }

        /* ---- R1C1. A DEAD MOUNT'S CALLBACK WRITING INTO THE LIVE ONE'S RECORD.
               Mount A takes the RESTORED branch and its quiet revalidation is held. The remembered
               scope is then forgotten, so the SECOND mount takes REGISTRY_ONLY - a mode that performs
               no revalidation at all and whose record has nothing to say about one. A's held answer
               then lands: its two guards both pass, because neither the Search sequence nor the applied
               scope moved, and it writes revalidated = true into the record that now belongs to B.
               The page then reports a REGISTRY_ONLY mount that revalidated, which is not a thing that
               can happen. The record a callback may finish is its OWN.
               Mount B issues no workspace read of its own, so nothing here depends on how two identical
               in-flight reads are shared - which is what made the first version of this scenario
               unobservable: both mounts waited on ONE answer and agreed about it. */
        await rphase('R1C1-remount-generation-isolation', async function(){
          var r0 = renderCounter();
          await ctl('/__delay-ws?ms=2500');
          await window.KM.lifecycle.switchTo('home-section');
          await sleep(150);
          await window.KM.lifecycle.switchTo('ops-section');   /* MOUNT A - revalidation held */
          await sleep(500);
          var afterA = diag();
          try { if (window._irForgetScope_) window._irForgetScope_(); } catch (e) {}
          await ctl('/__delay-ws?ms=0');
          await window.KM.lifecycle.switchTo('home-section');
          await sleep(150);
          await window.KM.lifecycle.switchTo('ops-section');   /* MOUNT B - REGISTRY_ONLY, no revalidation */
          await sleep(700);
          var afterB = diag();
          var rB = window.__rvRenderCount;
          await sleep(2600);                                    /* A's held answer lands here */
          var afterLate = diag();
          function pick(d){ return d ? { mode: d.mode, revalidating: d.revalidating, revalidated: d.revalidated,
            revalidate_failed: d.revalidate_failed, revalidate_superseded: d.revalidate_superseded,
            mount_generation: d.mount_generation === undefined ? 'ABSENT' : d.mount_generation,
            record_mount_generation: d.record_mount_generation === undefined ? 'ABSENT' : d.record_mount_generation,
            stray_callbacks: d.stray_callbacks === undefined ? 'ABSENT' : d.stray_callbacks } : null; }
          return { afterA: pick(afterA), afterB: pick(afterB), afterLate: pick(afterLate),
                   rendersAtStart: r0, rendersAfterB: rB, rendersAtEnd: window.__rvRenderCount,
                   rendersByLateCallback: window.__rvRenderCount - rB };
        });

        /* Put the remembered scope back with a real Search, so the C2 scenario starts from a RESTORED
           mount rather than from the state R1C1 deliberately left behind. */
        await rphase('R1C1b-remember-again', async function(){
          await doSearch('EU', 'MP-FIXTURE-EU-WMT');
          await sleep(1200);
          return { remembered: (function(){ try { return window._irRestoreScope_ ? window._irRestoreScope_() : null; }
                                            catch (e) { return null; } })() };
        });

        /* ---- R1C2. THE SAME CALLBACK, BUT THE PAGE IS NOT THERE.
               Mount A's revalidation is held and the operator leaves and STAYS away. The answer lands
               with Site Inventory unmounted, and the callback repaints it anyway. The repaint is the
               whole observation: on return the restore repaints regardless, so the rows are identical
               either way and only the COUNT distinguishes a page that was drawn while absent from one
               that was not. */
        await rphase('R1C2-late-answer-while-unmounted', async function(){
          renderCounter();
          await ctl('/__delay-ws?ms=2500');
          await window.KM.lifecycle.switchTo('home-section');
          await sleep(150);
          await window.KM.lifecycle.switchTo('ops-section');   /* MOUNT A - revalidation held */
          await sleep(400);
          var beforeLeave = window.__rvRenderCount;
          await window.KM.lifecycle.switchTo('home-section');   /* and away, staying away */
          var atLeave = window.__rvRenderCount;
          await sleep(2900);                                    /* A's answer lands with no page mounted */
          var whileAway = { current: window.KM.lifecycle.getCurrentPage ? window.KM.lifecycle.getCurrentPage() : null,
                            opsActive: (function(){ var s = document.getElementById('ops-section');
                              return s ? s.classList.contains('active') : null; })(),
                            renders: window.__rvRenderCount, d: diag() };
          /* Clear the hold BEFORE coming back: the return is a fresh mount with a revalidation of its
             own, and leaving the hold on would end the phase with THAT one still in flight - which is
             indistinguishable, in the capture, from the stale-flag defect CP2X-R4 closed. */
          await ctl('/__delay-ws?ms=0');
          await window.KM.lifecycle.switchTo('ops-section');
          await sleep(1600);
          return { beforeLeave: beforeLeave, atLeave: atLeave,
                   rendersWhileUnmounted: whileAway.renders - atLeave,
                   whileAway: { current: whileAway.current, opsActive: whileAway.opsActive,
                     revalidating: whileAway.d && whileAway.d.revalidating,
                     revalidated: whileAway.d && whileAway.d.revalidated,
                     revalidate_failed: whileAway.d && whileAway.d.revalidate_failed,
                     revalidate_superseded: whileAway.d && whileAway.d.revalidate_superseded,
                     mount_generation: whileAway.d && whileAway.d.mount_generation,
                     record_mount_generation: whileAway.d && whileAway.d.record_mount_generation,
                     stray_callbacks: whileAway.d && whileAway.d.stray_callbacks } };
        });

        out.revisit = RV;
        step('revisit-done', { phases: RV.phases.length });
      }
      report();
    } catch (e) {
      out.fatal = String(e && e.message || e);
      try { report(); } catch (e2) {}
    }
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(go, 0);
  else window.addEventListener('DOMContentLoaded', function(){ setTimeout(go, 0); });
}());
`;
}

function buildPage(port, capId, opts) {
  let html = read('index.html');
  html = html.replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/[^"']+/g, 'http://127.0.0.1:' + port + '/__stub.js');
  const preamble = `
<script>
window.__cp2uScriptErrors=[];
window.addEventListener('error',function(e){
  if(e&&e.target&&e.target.tagName==='SCRIPT'){window.__cp2uScriptErrors.push(String(e.target.src||''));}
},true);
(function(){
  var LOCAL='http://127.0.0.1:${port}';
  var _f=window.fetch;
  window.fetch=function(input,init){
    var url=(typeof input==='string')?input:(input&&input.url)||'';
    if(/^https?:\\/\\//i.test(url)&&url.indexOf(LOCAL)!==0){
      var qs=url.indexOf('?')>=0?url.slice(url.indexOf('?')):'';
      return _f.call(this,LOCAL+'/__api'+qs,init);
    }
    return _f.apply(this,arguments);
  };
}());
</script>`;
  const first = html.indexOf('<script');
  html = html.slice(0, first) + preamble + '\n' + html.slice(first);
  html = html.replace('</body>', '<script>' + measureScript(capId, opts) + '</script>\n</body>');
  return html;
}

function startServer(pages, held, results, cfg, onMeasured) {
  return http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    const p = decodeURIComponent(u.pathname);
    const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

    if (p === '/__measure') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        const id = u.searchParams.get('id') || '';
        try { results[id] = JSON.parse(body); } catch (e) { results[id] = { parseError: String(e.message) }; }
        res.writeHead(204); res.end();
        const h = held[id];
        if (h) { delete held[id]; clearTimeout(h.timer); h.release('measured'); }
        if (typeof onMeasured === 'function') setTimeout(onMeasured, 150);
      });
      return;
    }
    // CP2X-R1 B - a phase boundary. The page calls this between scenarios and the server snapshots its
    // per-action request counts, so every scenario reports the requests IT caused rather than a total.
    if (p === '/__mark') {
      cfg.marks = cfg.marks || [];
      cfg.marks.push({ label: u.searchParams.get('label') || '',
        hits: JSON.parse(JSON.stringify((cfg.state && cfg.state.hits) || {})) });
      if (cfg.state) cfg.state.scopeHint = u.searchParams.get('scope') || cfg.state.scopeHint || null;
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end('{"ok":true}');
      return;
    }
    if (p === '/__hold') {
      const id = u.searchParams.get('id') || '';
      const release = (why) => { try { res.writeHead(200, { 'Content-Type': 'image/gif', 'X-Release': why }); res.end(GIF); } catch (e) {} };
      const timer = setTimeout(() => { if (held[id]) { delete held[id]; release('timeout'); } }, MAX_HOLD_MS);
      held[id] = { release, timer };
      return;
    }
    // CP2X-R2 B - AN ANSWER CAN BE HELD BACK. Re-entry and switch-while-pending are only real if the
    // first read is still outstanding when the second thing happens, and a fixture that answers in a
    // millisecond cannot stage that. The page sets the delay for the phase that needs it and clears it
    // afterwards; nothing is held by default, so every other scenario is timed exactly as before.
    if (p === '/__delay') {
      cfg.state.delayMs = parseInt(u.searchParams.get('ms') || '0', 10) || 0;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, delayMs: cfg.state.delayMs }));
      return;
    }
    // CP2X-R4-R1 C - THE PRIMARY WORKSPACE READ NEEDS ITS OWN HOLD, AND IT HAS TO BE A SEPARATE ONE.
    //
    // The mount's quiet revalidation IS an inventoryReplenishment.workspace.get, and generation
    // isolation is only observable while one is still outstanding across a SECOND mount. /__delay
    // holds the recommendation and gap reads, which is the wrong leg: holding those would leave the
    // revalidation answering instantly and the interleave would never form. Holding BOTH with one
    // switch would also make the scenario untestable in the other direction - the second mount could
    // not then complete quickly, which is the half that proves the late callback lost its claim.
    if (p === '/__delay-ws') {
      cfg.state.wsDelayMs = parseInt(u.searchParams.get('ms') || '0', 10) || 0;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, wsDelayMs: cfg.state.wsDelayMs }));
      return;
    }
    // CP2X-R4-R1 C - A MARKER THAT TELLS TWO WORKSPACE ANSWERS APART.
    //
    // Generation isolation is a claim about WHICH read's answer is in hand, and two identical payloads
    // cannot carry that claim: a late answer overwriting a newer one is then indistinguishable from
    // nothing happening. The payload is built when the request ARRIVES, so setting this between the two
    // mounts gives the held answer and the fresh one different row counts, and "the older one won" is a
    // number on the screen rather than an inference from the absence of one.
    if (p === '/__ws-extra') {
      cfg.state.wsExtra = parseInt(u.searchParams.get('n') || '0', 10) || 0;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, wsExtra: cfg.state.wsExtra }));
      return;
    }
    // CP2X-R4-R1 B - A LATE FAILURE, which is the half an abort cannot stage. An aborted fetch rejects
    // promptly; the requirement is that an old request's FAILURE arriving after a new result has been
    // published must not replace it, and that needs a failure the fixture holds back deliberately.
    // CP2X-R4-R1 C - the SECOND mount has to be able to fail on its own. A record that a dead round
    // contaminated and a record that simply succeeded look identical when both rounds succeed; the
    // contradiction only becomes visible when THIS round failed and something still reported it
    // revalidated.
    // CP2X-R4-R1 A - THE REGISTRY CHANGES BETWEEN READS, which is the only way a live select comes to
    // hold an id the authority no longer accepts. status=inactive retires it; status=absent drops the
    // record entirely; status=active puts it back.
    if (p === '/__site-status') {
      cfg.state.siteStatus = cfg.state.siteStatus || {};
      cfg.state.siteStatus[u.searchParams.get('id') || ''] = u.searchParams.get('status') || 'active';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, siteStatus: cfg.state.siteStatus }));
      return;
    }
    if (p === '/__fail-next') {
      cfg.state.failNextReco = parseInt(u.searchParams.get('n') || '0', 10) || 0;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, failNextReco: cfg.state.failNextReco }));
      return;
    }
    if (p === '/__stub.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('window.Chart=window.Chart||function(){return{destroy:function(){},update:function(){},resize:function(){},data:{},options:{}};};'
        + 'window.Chart.register=window.Chart.register||function(){};window.ExcelJS=window.ExcelJS||{Workbook:function(){}};');
      return;
    }
    if (p === '/__api') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        let action = u.searchParams.get('action') || '';
        let rid = u.searchParams.get('km_rid') || '';
        const kmBody = u.searchParams.get('km_body');
        if (kmBody) { try { const j = JSON.parse(kmBody); action = action || j.action || ''; rid = rid || j.requestId || ''; } catch (e) {} }
        if (!action && body) { try { const j = JSON.parse(body); action = j.action || ''; rid = rid || j.requestId || ''; } catch (e) {} }
        // CP2X-R2 B - find the scope wherever the caller put it. The recommendation read nests it under
        // params.scope; the gap read sends it flat. A deep scan avoids coupling the fixture to either shape.
        let reqScope = null;
        try {
          const j = JSON.parse(kmBody || body || '{}');
          const found = {};
          (function dig(o, d) {
            if (!o || typeof o !== 'object' || d > 6) return;
            Object.keys(o).forEach(function (k) {
              if ((k === 'country' || k === 'marketplace' || k === 'company') && typeof o[k] === 'string' && o[k] && !found[k]) found[k] = o[k];
              else dig(o[k], d + 1);
            });
          }(j, 0));
          if (found.country || found.marketplace) reqScope = found;
        } catch (e) {}
        const payload = apiAnswer(action, cfg.skus, cfg.state, reqScope);
        // CP2U-R3 - WHAT WAS ANSWERED, not merely what was asked. A fixture that answers the wrong shape is
        // invisible in an action-only log, and that is precisely the failure item 2 asks to rule out.
        const d0 = (payload && payload.data) || {};
        cfg.log.push({ action: action, t: Date.now() - cfg.t0, success: payload && payload.success !== false,
          dataKeys: Object.keys(d0).slice(0, 24),
          counts: Object.keys(d0).reduce(function (acc, k) {
            if (Array.isArray(d0[k])) acc[k] = d0[k].length; return acc; }, {}) });
        // CP2X-R4-R1 B - WHEN THE ANSWER WENT OUT, not only when it was asked for. A held request and an
        // answered one are the same line without this, so "the read had not finished when the operator
        // left" could only be read off the page, which is the thing under test.
        const logEntry = cfg.log[cfg.log.length - 1];
        const send = function () {
          if (logEntry) logEntry.respondedAt = Date.now() - cfg.t0;
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify(withCorrelation(payload, action, rid)));
        };
        // CP2X-R4-R1 C - two independent holds. The recommendation/gap hold is unchanged; the primary
        // workspace read answers instantly unless its OWN hold is set, so no existing phase is retimed.
        const holdMs = (action === 'recommendation.workspace.get' || action === 'inventoryReplenishmentGap.get')
          ? (cfg.state.delayMs || 0)
          : (action === 'inventoryReplenishment.workspace.get' ? (cfg.state.wsDelayMs || 0) : 0);
        if (holdMs) setTimeout(send, holdMs); else send();
      });
      return;
    }
    if (pages[p]) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(pages[p]); return; }

    const fp = path.join(ROOT, p.replace(/^\//, ''));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      const ext = path.extname(fp).toLowerCase();
      const type = ext === '.js' ? 'text/javascript' : ext === '.css' ? 'text/css'
        : ext === '.html' ? 'text/html' : ext === '.json' ? 'application/json' : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(fs.readFileSync(fp));
      return;
    }
    res.writeHead(404); res.end('nf');
  });
}

function runChromeAsync(browser, args, timeoutMs, onChild) {
  return new Promise(resolve => {
    const child = cp.spawn(browser, args, { stdio: 'ignore' });
    let done = false;
    const finish = (why) => { if (done) return; done = true; clearTimeout(t); try { child.kill(); } catch (e) {} resolve(why); };
    const t = setTimeout(() => finish('timeout'), timeoutMs);
    child.on('exit', () => { if (!done) { done = true; clearTimeout(t); resolve('exit'); } });
    // THE RUN IS OVER WHEN THE PAGE HAS REPORTED, and the watchdog stays as the only other way out. A
    // browser left open until the timeout is not a longer measurement, it is the same measurement and
    // three minutes of waiting.
    if (typeof onChild === 'function') onChild(function () { finish('measured'); });
  });
}

/* ===============================================================================================
   CP2U-R3-R1 §A - THE RUN'S VERDICT, AS A PURE FUNCTION OF THE EVIDENCE.

   WHAT WAS WRONG. The exit code was computed from the in-place KEYS alone. The states scenario printed
   its verdict by walking `Object.keys(result.states.verdict)` and never contributed to the exit code,
   so a --states run in which EVERY state assertion failed still exited 0. Worse, the whole block was
   guarded by `if (STATES && r.states && r.states.verdict)`, so a run that produced no states section at
   all printed nothing and also exited 0 - the two failures that most need to be loud were the two that
   were silent.

   TWO RULES FOLLOW, and they are why this reads from a LIST rather than from the object:
     1. A missing key is a FAILURE, not an absence. Walking the keys that happen to exist can only ever
        check the work that was done; it cannot notice work that never ran.
     2. NOT_MEASURABLE_* is the one non-true value that passes, and ONLY for the two in-place checks the
        page genuinely makes impossible. No state key may be waived that way.
   =============================================================================================== */
const REQUIRED_INPLACE_KEYS = ['firstReadResolved', 'cellUpdated', 'secondCellIsExpectedNumber',
  'dosMovedToNumber', 'focusKept', 'selectionKept', 'valueKept', 'inputSameNode',
  'panelKept', 'scrollKept', 'windowScrollKept', 'noFullRebuild'];
// Only these two may answer NOT_MEASURABLE_*: no text field exists in the panel, and the window does
// not scroll. Any other key doing so is a harness that stopped measuring, and it fails.
const WAIVABLE_KEYS = { selectionKept: 1, windowScrollKept: 1 };
const REQUIRED_STATE_KEYS = ['failedSaysFailed', 'failedCarriesErrorClass', 'failedIsNotZero',
  'failedDosNotZero', 'loadingMarkSeen', 'emptySaysNoLines', 'emptyIsNotError', 'withheldSaysWithheld',
  'withheldIsDistinctFromEmpty', 'zeroIsARealZero', 'zeroHasNoFailureText', 'recoveredShowsNumber',
  'recoveredClearedTitle', 'everyArrivalSettled', 'valueKeptThroughout', 'focusKeptThroughout',
  'inputSameNodeThroughout', 'panelKeptThroughout', 'scrollKeptThroughout', 'noFullRebuildThroughout'];
// The site switch is a claim about CONTAMINATION, so the setup matters as much as the outcome: a switch
// that never ran, or ran without a failure on screen, proves nothing and must not pass.
const REQUIRED_SWITCH_TRUE = ['ran', 'failedBeforeSwitch', 'selectMoved', 'newSiteShowsItsOwnNumber',
  'newSiteFreeOfOldFailure'];
const MIN_STATE_ARRIVALS = 5;

function evaluateRun(evidence, opts) {
  opts = opts || {};
  const r = (evidence && evidence.result) || {};
  const v = r.verdict || {};
  const rows = [], failures = [];

  if (r.fatal) failures.push('fatal: ' + r.fatal);

  REQUIRED_INPLACE_KEYS.forEach(k => {
    const val = v[k];
    const na = typeof val === 'string' && val.indexOf('NOT_MEASURABLE') === 0 && !!WAIVABLE_KEYS[k];
    const okv = val === true;
    if (!okv && !na) failures.push('in-place check ' + k + ' = ' + JSON.stringify(val)
      + (val === undefined ? ' (MISSING - the harness never produced this check)' : ''));
    rows.push((okv ? 'ok   ' : na ? 'n/a  ' : 'FAIL ') + k + ' = ' + val);
  });

  if (opts.states) {
    const st = r.states;
    if (!st || typeof st !== 'object') {
      failures.push('states: the run was asked for the state scenario and produced NO states section');
    } else {
      const sv = st.verdict;
      if (!sv || typeof sv !== 'object') {
        failures.push('states: no verdict was computed');
      } else {
        rows.push('');
        rows.push('== state transitions ==');
        REQUIRED_STATE_KEYS.forEach(k => {
          const val = sv[k];
          if (val !== true) failures.push('state check ' + k + ' = ' + JSON.stringify(val)
            + (val === undefined ? ' (MISSING)' : ''));
          rows.push((val === true ? 'ok   ' : 'FAIL ') + k + ' = ' + val);
        });
      }
      const arrivals = Array.isArray(st.arrivals) ? st.arrivals.length : 0;
      if (arrivals < MIN_STATE_ARRIVALS) {
        failures.push('states: only ' + arrivals + ' arrivals were driven, ' + MIN_STATE_ARRIVALS + ' required');
      }
      rows.push('arrivals          : ' + arrivals);

      const sw = st.siteSwitch;
      if (!sw || typeof sw !== 'object') {
        failures.push('site switch: never attempted - the cross-site contamination claim is unproven');
      } else {
        REQUIRED_SWITCH_TRUE.forEach(k => {
          const val = sw[k];
          if (val !== true) failures.push('site switch ' + k + ' = ' + JSON.stringify(val)
            + (val === undefined ? ' (MISSING)' : ''));
          rows.push((val === true ? 'ok   ' : 'FAIL ') + 'siteSwitch.' + k + ' = ' + val);
        });
        // The one that must be FALSE: no row may still carry the previous station's failure.
        if (sw.anyRowStillFailed !== false) {
          failures.push('site switch anyRowStillFailed = ' + JSON.stringify(sw.anyRowStillFailed)
            + ' (must be exactly false)');
        }
        rows.push((sw.anyRowStillFailed === false ? 'ok   ' : 'FAIL ') + 'siteSwitch.anyRowStillFailed = '
          + sw.anyRowStillFailed);
      }
    }
  }

  return { exitCode: failures.length ? 1 : 0, rows: rows, failures: failures };
}

function arg(name, dflt) {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}

async function main() {
  const outDir = process.argv[2];
  if (!outDir) { console.error('usage: node _cp2s-r2-inplace-dom-runner.js <outDir> [--skus 60]'); process.exit(2); }
  fs.mkdirSync(outDir, { recursive: true });
  const browser = findBrowser();
  if (!browser) { console.error('no Chrome found'); process.exit(3); }

  const skus = parseInt(arg('--skus', '60'), 10);
  // CP2U-R3 - OPT-IN. Without --states every path below is the one that produced inplace-dom.json.
  const STATES = process.argv.indexOf('--states') !== -1;
  // CP2X-R1 B - a third opt-in scenario. Without the flag nothing below behaves differently.
  const SCOPES = process.argv.indexOf('--scopes') !== -1;
  // CP2X-R4 — the leave/return experiment. It needs the same two-site fixture the scopes run uses,
  // so scopesMode is forced on: a revisit scenario with only one marketplace proves nothing.
  const REVISIT = process.argv.indexOf('--revisit') !== -1;
  const cfg = { skus: skus, log: [], t0: Date.now(), marks: [],
    state: { recoReads: 0, statesMode: STATES, scopesMode: SCOPES, revisitMode: REVISIT, hits: {}, scopeHint: 'US', delayMs: 0, wsDelayMs: 0, wsExtra: 0, failNextReco: 0, siteStatus: {} } };
  const pages = {}, held = {}, results = {};
  const capId = 'inplace-' + Date.now();
  let closeBrowser = null;
  const srv = startServer(pages, held, results, cfg, function () { if (closeBrowser) closeBrowser(); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  // The two rates recoLines() is built to serve, named ONCE and handed to both the page and the evidence
  // so the harness cannot drift from the fixture it is asserting against.
  pages['/__page'] = buildPage(port, capId, { settleMs: 900, expectFirst: '7.0', expectSecond: '11.0',
    states: STATES, scopes: SCOPES, revisit: REVISIT });

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cp2s-r2-'));
  const why = await runChromeAsync(browser, [
    // CP2U-R3 - NO --virtual-time-budget. Under virtual time this browser produced NO animation frames at
    // all (measured: 0 in a whole session), and every reveal in the page is scheduled on one - so the
    // Execution Plan never left its skeleton, never rendered a composer, and the harness reported NO_INPUT
    // against a page that was behaving correctly. Real time produces frames (measured: 120-164 per run).
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=' + profile, '--window-size=1600,1000',
    'http://127.0.0.1:' + port + '/__page'
  ], 180000, function (stop) { closeBrowser = stop; });

  const r = results[capId] || { fatal: 'NO_RESULT (' + why + ')' };
  const evidence = {
    round: 'S8-B3-R3-CP2S-R2',
    what: 'in-place velocity update: what survives a real workspace arrival in a real browser',
    takenAt: new Date().toISOString(),
    browser: browser,
    skus: skus,
    recoReadsServed: cfg.state.recoReads,
    expected: { firstAvgCell: '7.0', secondAvgCell: '11.0' },
    sources: {
      'index.html': sha('index.html'),
      'assets/js/pages/inventory-replenishment.js': sha('assets/js/pages/inventory-replenishment.js'),
      'assets/css/pages/inventory-replenishment.css': sha('assets/css/pages/inventory-replenishment.css')
    },
    actionLog: cfg.log,
    // CP2X-R1 B - the SERVER side of the measurement: every request it served, by action, snapshotted at
    // each phase boundary the page declared. The page cannot fake these and does not supply them.
    requestMarks: cfg.marks,
    requestTotals: cfg.state.hits,
    requestScopes: cfg.state.scopeLog || [],   // CP2X-R2 B - which site each request actually named
    result: r
  };
  // A DIFFERENT EXPERIMENT GETS A DIFFERENT FILE. Writing the states run over inplace-dom.json would
  // destroy the capture that proves the in-place update.
  const outName = REVISIT ? 'revisit.json' : (SCOPES ? 'scope-reuse.json' : (STATES ? 'state-transitions.json' : 'inplace-dom.json'));
  fs.writeFileSync(path.join(outDir, outName), JSON.stringify(evidence, null, 2));
  // The long-poll that kept the page alive is RELEASED here rather than left to its own 120s timer: an
  // open socket holds the server open, which holds the event loop open, which made a four-second
  // measurement take two minutes to exit.
  Object.keys(held).forEach(function (id) {
    const h = held[id]; delete held[id];
    try { clearTimeout(h.timer); h.release('run-complete'); } catch (e) {}
  });
  if (typeof srv.closeAllConnections === 'function') srv.closeAllConnections();
  srv.close();

  const v = (r && r.verdict) || {};
  console.log('\n== CP2S-R2 in-place DOM evidence ==');
  console.log('reco reads served :', cfg.state.recoReads);
  console.log('fatal             :', r.fatal || 'none');
  if (r.notes && r.notes.length) console.log('notes             :', r.notes.join(' | '));
  if (r.before) console.log('before            :', JSON.stringify(r.before));
  if (r.after) console.log('after             :', JSON.stringify(r.after));

  // CP2X-R4 — the revisit run is judged by its OWN suite, not by the in-place checklist. Running the
  // in-place evaluator over it would report a wall of failures about a scenario it never drove.
  if (REVISIT) {
    const RV = (r && r.revisit) || {};
    console.log('\n== CP2X-R4 leave/return ==');
    console.log('lifecycle ids     :', JSON.stringify(RV.lifecycleIds && RV.lifecycleIds.current));
    (RV.phases || []).forEach(p => {
      console.log('  ' + String(p.label).padEnd(24)
        + ' country=' + JSON.stringify(p.country)
        + ' mkt=' + JSON.stringify(p.marketplace)
        + ' applied=' + JSON.stringify(p.appliedScopeKey)
        + ' status=' + JSON.stringify(p.status)
        + ' rows=' + p.rows
        + ' avg=' + JSON.stringify(p.avg && p.avg.text)
        + ' gapNet=' + p.gapNet);
    });
    console.log('\nwrote ' + path.join(outDir, outName));
    process.exitCode = r.fatal ? 1 : 0;
    return;
  }
  const ev = evaluateRun(evidence, { states: STATES });
  ev.rows.forEach(row => console.log(row));
  console.log('scrollers         : v=' + (r.scrollerV || 'NONE') + '  h=' + (r.scrollerH || 'NONE'));
  if (ev.failures.length) {
    console.log('\n== WHY THIS RUN FAILED ==');
    ev.failures.forEach(f => console.log('  ' + f));
  }
  console.log('\nwrote ' + path.join(outDir, outName));
  process.exitCode = ev.exitCode;
}

module.exports = { evaluateRun: evaluateRun, REQUIRED_INPLACE_KEYS: REQUIRED_INPLACE_KEYS,
  REQUIRED_STATE_KEYS: REQUIRED_STATE_KEYS, REQUIRED_SWITCH_TRUE: REQUIRED_SWITCH_TRUE,
  MIN_STATE_ARRIVALS: MIN_STATE_ARRIVALS, WAIVABLE_KEYS: WAIVABLE_KEYS };

if (require.main === module) main();
