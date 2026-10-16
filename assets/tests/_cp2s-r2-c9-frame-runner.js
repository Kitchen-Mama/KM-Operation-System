/**
 * S8-B3-R3-CP2S-R2 item 6 (C9) - FOUR POINTS, MEASURED SEPARATELY.
 *
 * CP2R's runner reports `ms_click_to_paint` and `calls_by_turn`. Those blend three different things the
 * operator experiences one after another, so "the expand is slow" could not be attributed, and any change
 * aimed at the first frame could not be shown to have moved the first frame rather than the total.
 *
 * THE FOUR POINTS, and the boundary each one is:
 *
 *   1. OUTLINE VISIBLE  - the first animation frame in which the expand panel has a real layout box.
 *                         This is the frame the operator reads as "it opened".
 *   2. FILL CALLBACKS   - each reveal paint, timed individually by name (recommendation, execution).
 *                         Not a sum: a single 90 ms callback and three 30 ms ones need different repairs.
 *   3. CHART / LAYOUT   - every Chart construction, timed, plus the frame in which a chart canvas first
 *                         has a box. Charts are the one thing on this panel that forces layout.
 *   4. FULL READY       - the first frame with no reveal host still `pending` for this SKU AND the
 *                         recommendation summary card present.
 *
 * AND THE INVENTORY THAT DECIDES WHETHER ANYTHING CAN BE REMOVED: everything observed BEFORE point 1 is
 * listed - data assemblies, reveal paints, chart constructions - with its duration. First-frame work can
 * only be removed once it is known what is ON the first frame; a change made before that is a guess.
 *
 * MOVING WORK LATER IS NOT A FIX, so point 4 is captured in the same run as point 1. A build that improves
 * 1 and regresses 4 has moved the wait, not removed it, and both numbers are in the same record so that
 * cannot be reported as an improvement.
 *
 * INSTRUMENTATION IS WRAPPING, NOT EDITING. `toggleReplenRow`, `getReplenishmentData`,
 * `_irRecoRevealPaint_` and `_irExecRevealPaint_` are top-level declarations in a classic script, so they
 * are properties of `window` and the page's own calls resolve through the global binding. `window.Chart`
 * is the stub this harness already serves. Not one application byte changes.
 *
 *   node assets/tests/_cp2s-r2-c9-frame-runner.js <outDir> [--skus 100] [--rounds 3]
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
const MAX_HOLD_MS = 180000;

const MKT_ID = 'MP-FIXTURE-US-AMZ';
const skuOf = (i) => 'FIXTURE-SKU-' + String(i).padStart(3, '0');

function fixtureWorkspace(n) {
  const mk = (c, f) => Array.from({ length: c }, (_, i) => f(i));
  return {
    marketplaces: [{ marketplace_id: MKT_ID, company: 'FixtureCo', country: 'US', marketplace: 'Amazon',
      currency: 'USD', status: 'active', allocation_priority: 100 }],
    marketplace_skus: mk(n, i => ({ marketplace_sku_id: 'MSKU-' + i, marketplace_id: MKT_ID,
      company: 'FixtureCo', country: 'US', marketplace: 'Amazon', sku: skuOf(i), site_sku: 'SS-' + i,
      marketplace_product_id: 'B000FIX' + String(i).padStart(3, '0'), currency: 'USD',
      regular_price: 19.99 + i, minimum_price: 9.99, msrp: 29.99,
      marketplace_sku_status: 'active', replenishment_model: 'sales_driven' })),
    sku_details: mk(n, i => ({ sku: skuOf(i), product_name: 'Fixture Product ' + i, category: 'FIXTURE',
      status: 'active', company: 'FixtureCo', units_per_carton: 40 })),
    warehouses: mk(4, i => ({ warehouse_id: 'WH' + i, warehouse_name: 'Fixture WH ' + i, country: 'US', type: 'overseas' })),
    amazon_inventory_snapshot: mk(n, i => ({ snapshot_date: '2026-10-13', country: 'US', marketplace: 'Amazon',
      sku: skuOf(i), available_qty: 1000 + i * 7, fc_transfer_qty: 50 + i, fc_processing_qty: 30 + i,
      customer_order_qty: 10 + i, unfulfillable_qty: i % 5 })),
    amazon_inventory_health_snapshot: mk(n, i => ({ snapshot_date: '2026-10-13', country: 'US', marketplace: 'Amazon',
      sku: skuOf(i), qty_over_90_days: 20 + i, qty_over_180_days: 5 + i })),
    amazon_daily_sales_snapshot: mk(n * 4, i => ({ snapshot_date: '2026-10-' + String(9 + (i % 4)).padStart(2, '0'),
      country: 'US', marketplace: 'Amazon', sku: skuOf(i % n), units_ordered: 5 + (i % 17) })),
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
    shipments: mk(30, i => ({ shipment_id: 'SH-' + i, status: 'in_transit', destination_warehouse_id: 'WH' + (i % 4),
      etd: '2026-10-01', eta: '2026-11-0' + (1 + (i % 9)) })),
    shipment_lines: mk(60, i => ({ shipment_line_id: 'SL-' + i, shipment_id: 'SH-' + (i % 30), sku: skuOf(i % n),
      shipment_qty: 100 + i, shipment_received_qty: 0 })),
    shipping_plans: [], shipping_plan_lines: [],
    shipping_allocation_drafts: [], shipping_allocation_draft_lines: [],
    carrier_lead_times: mk(3, i => ({ lead_time_id: 'LT-' + i, carrier_id: 'C' + i, lane: 'CN-US',
      shipping_method: ['SEA', 'AIR', 'EXPRESS'][i], days: 30 + i })),
    carrier_rate_cards: mk(3, i => ({ rate_card_id: 'RC-' + i, carrier_id: 'C' + i, lane: 'CN-US',
      shipping_method: ['SEA', 'AIR', 'EXPRESS'][i], min_kg: 0, max_kg: 1000, rate: 1.5, currency: 'USD' }))
  };
}

function recoLines(n) {
  const basis = { demandMode: 'sales_driven', avgSalesPerDay: 7, source: 'normalized_30d', warning: '',
    normalDayCount: 30, excludedDates: [], horizonOpeningQty: null, qualifiedIncomingCount: null,
    blankDateRows: 0, basisQualityError: null, contaminationSource: { campaigns: 'ABSENT', events: 'ABSENT' } };
  const out = [];
  for (let i = 0; i < n; i++) ['WH0', 'WH1'].forEach(w => out.push({
    sku: skuOf(i), siteSku: 'SS-' + i, destinationType: 'WAREHOUSE', warehouseId: w,
    destinationKey: 'WAREHOUSE||FixtureCo||US||Amazon||' + w,
    recommendationMode: 'WAREHOUSE_REPLENISHMENT', blocked: true,
    blockedReason: 'RECOMMENDATION_RUNTIME_BLOCKED', horizonBasis: basis }));
  return out;
}

function gapRows(n) {
  const W = ['D18', 'D30', 'D45', 'D90'];
  const out = [];
  for (let i = 0; i < n; i++) W.forEach((w, k) => out.push({
    sku: skuOf(i), company: 'FixtureCo', country: 'US', marketplace: 'Amazon',
    window_code: w, gap_qty: 10 * (k + 1) + i, suggested_order_qty: 20 * (k + 1) + i,
    note: '', calculated_at: '2026-10-13T00:00:00Z' }));
  return out;
}

function withCorrelation(payload, action, rid) {
  if (!payload || typeof payload !== 'object') return payload;
  const out = Object.assign({}, payload);
  out.meta = Object.assign({}, out.meta || {}, { action: action, requestId: rid || undefined });
  if (rid) out.request_id = rid;
  return out;
}

function apiAnswer(action, n) {
  if (action === 'getClientCapabilities') {
    return { success: true, data: { product_strategy_enabled: true, inventoryAiPlanDbGenerationEnabled: false,
      capabilitiesVersion: 'fixture-cp2s-r2-c9' } };
  }
  if (action === 'inventoryScope.registry.get') {
    return { success: true, data: {
      marketplaces: [{ marketplace_id: MKT_ID, company: 'FixtureCo', country: 'US', marketplace: 'Amazon',
        marketplace_display_name: 'Amazon' }],
      countries: ['US'], marketplace_ids_by_country: { US: [MKT_ID] }, empty: false, empty_reason: '' } };
  }
  if (action === 'inventoryReplenishment.workspace.get') return { success: true, data: fixtureWorkspace(n) };
  if (action === 'inventoryReplenishmentGap.get') return { success: true, data: { rows: gapRows(n) } };
  if (action === 'gapJob.status.get') return { success: true, data: { status: 'IDLE', jobs: [] } };
  if (action === 'recommendation.workspace.get') {
    return { success: true, data: { lines: recoLines(n), dataVersion: { sourceDataAsOf: '2026-10-13' } } };
  }
  return { success: true, action: action,
    data: { rows: [], items: [], records: [], countries: [], marketplaces: [], tables: {}, servedAction: action } };
}

function measureScript(capId, opts) {
  return `
(function(){
  var CAP = ${JSON.stringify(capId)};
  var OPT = ${JSON.stringify(opts)};
  var out = { capId: CAP, steps: [], notes: [], fatal: null, expands: [], frames: [], events: [], rowCount: 0 };
  function now(){ return performance.now(); }
  function step(name, v){ out.steps.push({ step: name, t: +now().toFixed(2), v: v === undefined ? null : v }); return v; }
  function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
  window.alert = function(){}; window.confirm = function(){ return true; }; window.prompt = function(){ return null; };

  var tag = '';
  function ev(kind, name, t0, t1, extra){
    out.events.push(Object.assign({ tag: tag, kind: kind, name: name, at: +t0.toFixed(2),
      ms: (t1 === null || t1 === undefined) ? null : +(t1 - t0).toFixed(2) }, extra || {}));
  }

  function waitFor(fn, ms, label){
    var t0 = now();
    return new Promise(function(res){
      (function poll(){
        var v = null; try { v = fn(); } catch(e) { v = null; }
        if (v) return res({ ok: true, waitedMs: +(now()-t0).toFixed(2), v: v });
        if (now()-t0 > ms) return res({ ok: false, waitedMs: +(now()-t0).toFixed(2), label: label });
        setTimeout(poll, 16);
      }());
    });
  }
  async function setSelect(el, value, label, ms){
    var t0 = now();
    while (now() - t0 < (ms || 15000)) {
      if (Array.prototype.some.call(el.options, function(o){ return o.value === value; })) {
        el.value = value; el.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(250);
        if (el.value === value) return { ok: true };
      } else { await sleep(120); }
    }
    out.notes.push(label + ' never held ' + value);
    return { ok: false };
  }
  function fixedRows(){ return document.querySelectorAll('#ops-section .fixed-row'); }

  /* ---- THE FRAME LOOP. Runs continuously, so every point below is a frame that was OBSERVED. ---- */
  var frameOn = false, SKU = null;
  function panelBox(){
    var p = document.querySelector('#ops-section .replen-expand-panel--scroll, #ops-section .replen-expand-panel');
    if (!p) return null;
    var r = p.getBoundingClientRect();
    return { h: r.height, w: r.width };
  }
  function chartBox(){
    var c = document.querySelector('#ops-section .replen-expand-panel canvas');
    if (!c) return null;
    var r = c.getBoundingClientRect();
    return { h: r.height, w: r.width };
  }
  function pendingForSku(){
    if (!SKU) return true;
    return !!document.querySelector('#ops-section [data-ir-reveal][data-ir-sku="' + SKU + '"][data-reveal-state="pending"]');
  }
  function summaryCard(){ return !!document.querySelector('#ops-section .replen-card--recommendation-summary'); }
  function frameLoop(){
    if (!frameOn) return;
    var pb = panelBox(), cb = chartBox();
    out.frames.push({ tag: tag, t: +now().toFixed(2),
      ph: pb ? +pb.h.toFixed(1) : 0, ch: cb ? +cb.h.toFixed(1) : 0,
      pending: pendingForSku(), card: summaryCard() });
    requestAnimationFrame(frameLoop);
  }

  /* ---- WRAPPING, NOT EDITING ---- */
  function instrument(){
    if (typeof window.toggleReplenRow === 'function' && !window.__c9Toggle) {
      var ot = window.toggleReplenRow;
      window.toggleReplenRow = function(sku){
        var a = now(); var r;
        try { r = ot.apply(this, arguments); } finally { ev('handler', 'toggleReplenRow', a, now(), { sku: String(sku) }); }
        return r;
      };
      window.__c9Toggle = true;
    }
    if (typeof window.getReplenishmentData === 'function' && !window.__c9Data) {
      var og = window.getReplenishmentData;
      window.getReplenishmentData = function(){
        var a = now(); var res;
        try { res = og.apply(this, arguments); } finally { ev('data', 'getReplenishmentData', a, now(), { rows: (res && res.length) || 0 }); }
        return res;
      };
      window.__c9Data = true;
    }
    /* WHICH DEPENDENCY MOVED. Two assemblies inside ONE synchronous render pass means _irRowsPassSame_
       said the dependencies differ, and only a per-field comparison says which one - an object-identity
       dep that is rebuilt on every read would invalidate the pass without anything having changed. */
    if (typeof window._irRowsPassDeps_ === 'function' && !window.__c9Deps) {
      var od = window._irRowsPassDeps_;
      window.__c9DepsSeen = [];
      window._irRowsPassDeps_ = function(){
        var d = od.apply(this, arguments);
        var prev = window.__c9DepsSeen[window.__c9DepsSeen.length - 1];
        var diff = [];
        if (prev) Object.keys(d).forEach(function(k){ if (prev.raw[k] !== d[k]) diff.push(k); });
        window.__c9DepsSeen.push({ raw: d });
        ev('deps', 'deps', now(), now(), { diff: diff.join(',') || 'SAME' });
        return d;
      };
      window.__c9Deps = true;
    } else if (typeof window._irRowsPassDeps_ !== 'function') {
      out.notes.push('_irRowsPassDeps_ is not a window function - dependency diff unavailable');
    }
    /* CALLS ARE NOT ASSEMBLIES. CP2P-R2 put a render-pass scope around the whole handler so repeated
       getReplenishmentData() calls in one synchronous turn share ONE assembly. Counting calls therefore
       says nothing about cost: three calls may be one assembly and two cache hits. The real assembler is
       wrapped separately so the two can be told apart, which is what decides whether there is first-frame
       work to remove at all. */
    if (typeof window._getCloudReplenishmentData === 'function' && !window.__c9Asm) {
      var oa = window._getCloudReplenishmentData;
      window._getCloudReplenishmentData = function(){
        var a = now(); var r;
        try { r = oa.apply(this, arguments); } finally { ev('assembly', '_getCloudReplenishmentData', a, now(), { rows: (r && r.length) || 0 }); }
        return r;
      };
      window.__c9Asm = true;
    } else if (typeof window._getCloudReplenishmentData !== 'function') {
      out.notes.push('_getCloudReplenishmentData is not a window function - assemblies not counted');
    }
    /* The reveal PAINTS, not the once-wrappers: the gate captures the wrapper at creation, and the gate is
       a singleton that may already exist. The paints are resolved through the global binding at call time. */
    ['_irRecoRevealPaint_', '_irExecRevealPaint_'].forEach(function(nm){
      if (typeof window[nm] === 'function' && !window['__c9' + nm]) {
        var of = window[nm];
        window[nm] = function(){
          var a = now(); var r;
          try { r = of.apply(this, arguments); } finally { ev('fill', nm, a, now()); }
          return r;
        };
        window['__c9' + nm] = true;
      } else if (typeof window[nm] !== 'function') {
        out.notes.push(nm + ' is not a window function - fill callback not instrumented');
      }
    });
    if (typeof window.Chart === 'function' && !window.__c9Chart) {
      var OC = window.Chart;
      var W = function(){ var a = now(); var inst = new OC(arguments[0], arguments[1]); ev('chart', 'Chart', a, now()); return inst; };
      W.register = OC.register || function(){};
      W.prototype = OC.prototype;
      window.Chart = W;
      window.__c9Chart = true;
    }
  }

  /* ---- ONE EXPAND, FOUR POINTS ---- */
  async function measureExpand(label, rowEl, sku){
    tag = label; SKU = sku;
    /* THE PANEL MUST NOT ALREADY BE THERE. The first run reported "outline visible: 0 ms" for every expand,
       because the previous panel was still on screen when the frame search started and the search found IT.
       A zero that comes from measuring the wrong element is worse than no number. */
    var preClean = await waitFor(function(){ return panelBox() === null ? true : null; }, 8000, label + '.preclean');
    if (!preClean.ok) { out.notes.push(label + ': a panel was still open at click time; measurement skipped'); return null; }
    var base = now();
    var ev0 = out.events.length, fr0 = out.frames.length;
    rowEl.click();

    var outline = await waitFor(function(){
      for (var i = fr0; i < out.frames.length; i++) if (out.frames[i].tag === label && out.frames[i].ph > 4) return out.frames[i];
      return null;
    }, 20000, label + '.outline');

    var chartFrame = await waitFor(function(){
      for (var i = fr0; i < out.frames.length; i++) if (out.frames[i].tag === label && out.frames[i].ch > 4) return out.frames[i];
      return null;
    }, 20000, label + '.chartbox');

    var ready = await waitFor(function(){
      for (var i = fr0; i < out.frames.length; i++) {
        var f = out.frames[i];
        if (f.tag === label && !f.pending && f.card) return f;
      }
      return null;
    }, 30000, label + '.ready');

    var mine = out.events.slice(ev0).filter(function(e){ return e.tag === label; });
    var tOutline = outline.ok ? outline.v.t : null;
    /* THE INVENTORY: what ran BEFORE the operator saw anything. This is the list any first-frame repair
       has to shorten, and a repair that only moves an item past this line has not shortened it. */
    var before = tOutline === null ? [] : mine.filter(function(e){ return e.at < tOutline; });
    var sum = function(list, kind){ return +list.filter(function(e){ return e.kind === kind; })
      .reduce(function(a, e){ return a + (e.ms || 0); }, 0).toFixed(2); };

    var rec = {
      tag: label, sku: sku,
      p1_outline_ms: tOutline === null ? null : +(tOutline - base).toFixed(2),
      p2_fill_callbacks: mine.filter(function(e){ return e.kind === 'fill'; })
        .map(function(e){ return { name: e.name, atMsAfterClick: +(e.at - base).toFixed(2), ms: e.ms }; }),
      p3_chart_calls: mine.filter(function(e){ return e.kind === 'chart'; })
        .map(function(e){ return { atMsAfterClick: +(e.at - base).toFixed(2), ms: e.ms }; }),
      p3_chart_box_ms: chartFrame.ok ? +(chartFrame.v.t - base).toFixed(2) : null,
      p4_full_ready_ms: ready.ok ? +(ready.v.t - base).toFixed(2) : null,
      handler_ms: (function(){ var h = mine.filter(function(e){ return e.kind === 'handler'; })[0];
        return h ? h.ms : null; })(),   // 0 is a measurement, not a missing one
      before_outline: {
        count: before.length,
        data_calls: before.filter(function(e){ return e.kind === 'data'; }).length,
        data_ms: sum(before, 'data'),
        assemblies: before.filter(function(e){ return e.kind === 'assembly'; }).length,
        assembly_ms: sum(before, 'assembly'),
        fill_calls: before.filter(function(e){ return e.kind === 'fill'; }).length,
        fill_ms: sum(before, 'fill'),
        chart_calls: before.filter(function(e){ return e.kind === 'chart'; }).length,
        chart_ms: sum(before, 'chart'),
        handler_ms: sum(before, 'handler')
      },
      totals: { data_calls: mine.filter(function(e){ return e.kind === 'data'; }).length, data_ms: sum(mine, 'data'),
        assemblies: mine.filter(function(e){ return e.kind === 'assembly'; }).length, assembly_ms: sum(mine, 'assembly'),
        fill_ms: sum(mine, 'fill'), chart_ms: sum(mine, 'chart') },
      outline_ok: outline.ok, chart_ok: chartFrame.ok, ready_ok: ready.ok
    };
    out.expands.push(rec);
    tag = '';
    return rec;
  }

  function report(){
    try {
      var x = new XMLHttpRequest();
      x.open('POST', '/__measure?id=' + encodeURIComponent(CAP), true);
      x.setRequestHeader('Content-Type', 'application/json');
      /* The raw frame log is large and is not evidence by itself - the points above are. */
      var slim = Object.assign({}, out); slim.frames = out.frames.length;
      x.send(JSON.stringify(slim));
    } catch(e) {}
    var img = new Image(); img.src = '/__hold?id=' + encodeURIComponent(CAP);
  }

  async function go(){
    try {
      var ready = await waitFor(function(){
        return (typeof window.showSection === 'function' && document.querySelector('.menu-item, [onclick*="showSection"]')) ? true : null;
      }, 40000, 'app-ready');
      if (!ready.ok) { out.fatal = 'APP_NOT_READY'; return report(); }
      var el = document.querySelector('[onclick*="showSection(\\'ops\\')"]');
      if (el) el.click(); else if (window.showSection) window.showSection('ops');
      var sec = await waitFor(function(){ return document.getElementById('replenCountry'); }, 20000, 'filter-bar');
      if (!sec.ok) { out.fatal = 'NO_FILTER_BAR'; return report(); }

      frameOn = true; requestAnimationFrame(frameLoop);
      instrument();

      if (!(await setSelect(document.getElementById('replenCountry'), 'US', 'country')).ok) { out.fatal = 'NO_COUNTRY'; return report(); }
      if (!(await setSelect(document.getElementById('replenMarketplace'), ${JSON.stringify(MKT_ID)}, 'marketplace')).ok) { out.fatal = 'NO_MKT'; return report(); }

      var btn = document.querySelector('#ops-section .replen-btn--search');
      if (btn) btn.click(); else if (window.searchReplenishment) window.searchReplenishment();
      var tbl = await waitFor(function(){ var r = fixedRows(); return r.length > 1 ? r.length : null; }, 30000, 'table');
      if (!tbl.ok) { out.fatal = 'NO_ROWS'; return report(); }
      out.rowCount = fixedRows().length;
      instrument();
      await sleep(OPT.settleMs);

      var fr = fixedRows();
      for (var r = 0; r < OPT.rounds; r++) {
        var idx = 1 + r;
        await measureExpand((r === 0 ? 'cold' : 'warm' + r), fr[idx], 'FIXTURE-SKU-' + String(idx).padStart(3, '0'));
        await sleep(OPT.betweenMs);
        fr[idx].click();              // collapse, so the next expand is a fresh panel
        await sleep(OPT.betweenMs);
      }
      frameOn = false;
      step('done');
      report();
    } catch (e) { out.fatal = String(e && e.message || e); try { report(); } catch (e2) {} }
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

function startServer(pages, held, results, cfg) {
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
        cfg.log.push({ action: action, t: Date.now() - cfg.t0 });
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(withCorrelation(apiAnswer(action, cfg.skus), action, rid)));
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

function runChromeAsync(browser, args, timeoutMs) {
  return new Promise(resolve => {
    const child = cp.spawn(browser, args, { stdio: 'ignore' });
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; try { child.kill(); } catch (e) {} resolve('timeout'); } }, timeoutMs);
    child.on('exit', () => { if (!done) { done = true; clearTimeout(t); resolve('exit'); } });
  });
}

function arg(name, dflt) {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}

async function main() {
  const outDir = process.argv[2];
  if (!outDir) { console.error('usage: node _cp2s-r2-c9-frame-runner.js <outDir> [--skus 100] [--rounds 3]'); process.exit(2); }
  fs.mkdirSync(outDir, { recursive: true });
  const browser = findBrowser();
  if (!browser) { console.error('no Chrome found'); process.exit(3); }

  const skus = parseInt(arg('--skus', '100'), 10);
  const rounds = parseInt(arg('--rounds', '3'), 10);
  const cfg = { skus: skus, log: [], t0: Date.now() };
  const pages = {}, held = {}, results = {};
  const capId = 'c9-' + Date.now();
  const srv = startServer(pages, held, results, cfg);
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  pages['/__page'] = buildPage(port, capId, { settleMs: 900, betweenMs: 500, rounds: rounds });

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cp2s-r2-c9-'));
  const why = await runChromeAsync(browser, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    /* NO --virtual-time-budget. The first run of this instrument used one and every duration came back 0:
       the flag runs timers against a virtual clock that performance.now() also reports, so the thing being
       measured and the ruler measuring it move together. Real wall clock, real frames, longer run. */
    '--user-data-dir=' + profile, '--window-size=1600,1000',
    'http://127.0.0.1:' + port + '/__page'
  ], 300000);

  const r = results[capId] || { fatal: 'NO_RESULT (' + why + ')' };
  const evidence = {
    round: 'S8-B3-R3-CP2S-R2 item 6 (C9)',
    what: 'expand latency separated into outline / fill callbacks / chart+layout / full ready',
    takenAt: new Date().toISOString(),
    browser: browser, skus: skus, rounds: rounds,
    sources: {
      'index.html': sha('index.html'),
      'assets/js/pages/inventory-replenishment.js': sha('assets/js/pages/inventory-replenishment.js')
    },
    result: r
  };
  fs.writeFileSync(path.join(outDir, 'c9-frames.json'), JSON.stringify(evidence, null, 2));
  srv.close();

  console.log('\n== CP2S-R2 C9: four points ==');
  console.log('fatal :', r.fatal || 'none');
  if (r.notes && r.notes.length) console.log('notes :', r.notes.join(' | '));
  console.log('rows  :', r.rowCount);
  (r.expands || []).forEach(e => {
    console.log('\n[' + e.tag + '] sku=' + e.sku);
    console.log('  1 outline visible   : ' + e.p1_outline_ms + ' ms' + (e.outline_ok ? '' : '  (NOT OBSERVED)'));
    console.log('  2 fill callbacks    : ' + (e.p2_fill_callbacks.length ? e.p2_fill_callbacks.map(f => f.name + ' @' + f.atMsAfterClick + ' (' + f.ms + ' ms)').join(', ') : 'NONE OBSERVED'));
    console.log('  3 chart calls       : ' + (e.p3_chart_calls.length ? e.p3_chart_calls.map(c => '@' + c.atMsAfterClick + ' (' + c.ms + ' ms)').join(', ') : 'NONE') + '   first chart box: ' + e.p3_chart_box_ms + ' ms');
    console.log('  4 full ready        : ' + e.p4_full_ready_ms + ' ms' + (e.ready_ok ? '' : '  (NOT OBSERVED)'));
    console.log('  handler (sync)      : ' + e.handler_ms + ' ms');
    console.log('  BEFORE the outline  : ' + JSON.stringify(e.before_outline));
    console.log('  totals              : ' + JSON.stringify(e.totals));
  });
  console.log('\nwrote ' + path.join(outDir, 'c9-frames.json'));
  process.exitCode = (r.fatal || !(r.expands || []).length) ? 1 : 0;
}

main();
