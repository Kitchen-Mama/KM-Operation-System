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

function gapRows(n) {
  const W = ['D18', 'D30', 'D45', 'D90'];
  const out = [];
  for (let i = 0; i < n; i++) W.forEach((w, k) => out.push({
    sku: skuOf(i), company: 'FixtureCo', country: 'US', marketplace: 'Amazon',
    window_code: w, gap_qty: 10 * (k + 1) + i, suggested_order_qty: 20 * (k + 1) + i,
    note: '', calculated_at: '2026-10-13T00:00:00Z'
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

function apiAnswer(action, n, state) {
  if (action === 'getClientCapabilities') {
    return { success: true, data: { product_strategy_enabled: true, inventoryAiPlanDbGenerationEnabled: false,
      capabilitiesVersion: 'fixture-cp2s-r2' } };
  }
  if (action === 'inventoryScope.registry.get') {
    const two = !!(state && state.statesMode);
    return { success: true, data: {
      marketplaces: [{ marketplace_id: MKT_ID, company: 'FixtureCo', country: 'US', marketplace: 'Amazon',
        marketplace_display_name: 'Amazon' }].concat(two ? [{ marketplace_id: MKT2_ID, company: 'FixtureCo',
          country: 'US', marketplace: 'Walmart', marketplace_display_name: 'Walmart' }] : []),
      countries: ['US'], marketplace_ids_by_country: { US: two ? [MKT_ID, MKT2_ID] : [MKT_ID] },
      empty: false, empty_reason: '' } };
  }
  if (action === 'inventoryReplenishment.workspace.get') return { success: true, data: fixtureWorkspace(n, state.statesMode) };
  if (action === 'inventoryReplenishmentGap.get') return { success: true, data: { rows: gapRows(n) } };
  if (action === 'gapJob.status.get') return { success: true, data: { status: 'IDLE', jobs: [] } };
  if (action === 'recommendation.workspace.get') {
    state.recoReads++;
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
    if (p === '/__hold') {
      const id = u.searchParams.get('id') || '';
      const release = (why) => { try { res.writeHead(200, { 'Content-Type': 'image/gif', 'X-Release': why }); res.end(GIF); } catch (e) {} };
      const timer = setTimeout(() => { if (held[id]) { delete held[id]; release('timeout'); } }, MAX_HOLD_MS);
      held[id] = { release, timer };
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
        const payload = apiAnswer(action, cfg.skus, cfg.state);
        // CP2U-R3 - WHAT WAS ANSWERED, not merely what was asked. A fixture that answers the wrong shape is
        // invisible in an action-only log, and that is precisely the failure item 2 asks to rule out.
        const d0 = (payload && payload.data) || {};
        cfg.log.push({ action: action, t: Date.now() - cfg.t0, success: payload && payload.success !== false,
          dataKeys: Object.keys(d0).slice(0, 24),
          counts: Object.keys(d0).reduce(function (acc, k) {
            if (Array.isArray(d0[k])) acc[k] = d0[k].length; return acc; }, {}) });
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(withCorrelation(payload, action, rid)));
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
  const cfg = { skus: skus, log: [], t0: Date.now(), state: { recoReads: 0, statesMode: STATES } };
  const pages = {}, held = {}, results = {};
  const capId = 'inplace-' + Date.now();
  let closeBrowser = null;
  const srv = startServer(pages, held, results, cfg, function () { if (closeBrowser) closeBrowser(); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  // The two rates recoLines() is built to serve, named ONCE and handed to both the page and the evidence
  // so the harness cannot drift from the fixture it is asserting against.
  pages['/__page'] = buildPage(port, capId, { settleMs: 900, expectFirst: '7.0', expectSecond: '11.0',
    states: STATES });

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
    result: r
  };
  // A DIFFERENT EXPERIMENT GETS A DIFFERENT FILE. Writing the states run over inplace-dom.json would
  // destroy the capture that proves the in-place update.
  const outName = STATES ? 'state-transitions.json' : 'inplace-dom.json';
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
  const KEYS = ['firstReadResolved', 'cellUpdated', 'secondCellIsExpectedNumber', 'dosMovedToNumber',
    'focusKept', 'selectionKept', 'valueKept', 'inputSameNode',
    'panelKept', 'scrollKept', 'windowScrollKept', 'noFullRebuild'];
  /* A check the PAGE makes impossible is not a check the page failed. NOT_MEASURABLE_* is printed as n/a
     with its reason attached and does not set the exit code - and it is never silently omitted, because a
     dropped row is how an unmeasured thing turns into a claimed one. */
  let bad = 0;
  KEYS.forEach(k => {
    const val = v[k];
    const na = typeof val === 'string' && val.indexOf('NOT_MEASURABLE') === 0;
    if (val !== true && !na) bad++;
    console.log((val === true ? 'ok   ' : na ? 'n/a  ' : 'FAIL ') + k + ' = ' + val);
  });
  console.log('scrollers         : v=' + (r.scrollerV || 'NONE') + '  h=' + (r.scrollerH || 'NONE'));
  if (STATES && r.states && r.states.verdict) {
    console.log('\n== state transitions ==');
    Object.keys(r.states.verdict).forEach(k => console.log((r.states.verdict[k] === true ? 'ok   ' : 'FAIL ') + k + ' = ' + r.states.verdict[k]));
    if (r.states.siteSwitch) console.log('site switch       :', JSON.stringify(r.states.siteSwitch.newSiteCell || null),
      'freeOfOldFailure=' + r.states.siteSwitch.newSiteFreeOfOldFailure);
  }
  console.log('\nwrote ' + path.join(outDir, outName));
  process.exitCode = (bad === 0 && !r.fatal) ? 0 : 1;
}

main();
