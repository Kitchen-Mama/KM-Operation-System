/**
 * S8-B3-R3-CP2P — WHERE THE SECOND BETWEEN THE CLICK AND THE PANEL ACTUALLY GOES.
 *
 * The Owner reports that clicking a row takes about a second to expand. CP2O measured the SECOND layer
 * (exposure, catalogue, hydration, readiness) and deliberately did not measure this, so the half-second
 * figure in that round's report was an attribution with no stopwatch behind it. This runner is the
 * stopwatch, and it runs against the REAL page: real index.html, real app.js, the real partial loader, the
 * real `toggleReplenRow`, with a 100-SKU workspace answered by a fixture.
 *
 * WHAT IT MEASURES, AND WHY THESE BOUNDARIES. The operator waits through five consecutive things, and only
 * a breakdown says which one to fix:
 *
 *   click      -> the real pointer click is dispatched on the real row
 *   handler    -> `toggleReplenRow` is entered (dispatch + listener resolution)
 *   data       -> every `getReplenishmentData()` call the handler makes, timed individually
 *   build      -> the rest of the handler: template strings, insertion, reveal begin
 *   paint      -> the first ANIMATION FRAME in which the expand panel has a real layout box
 *
 * The frame loop runs continuously from before the click, so "first paint" is a frame that was observed,
 * not a timer that was assumed to coincide with one.
 *
 * INSTRUMENTATION IS WRAPPING, NOT EDITING. `toggleReplenRow` and `getReplenishmentData` are top-level
 * declarations in a classic script, so they are properties of `window`, and the page's own internal calls
 * resolve through the global binding. Wrapping them from the harness therefore observes the real calls
 * without a single byte changing in the application.
 *
 *   node assets/tests/_cp2p-ir-expand-runner.js <outDir> [--skus 100] [--gap ok|slow|timeout|error]
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

const MAX_HOLD_MS = 90000;

// ---------------------------------------------------------------------------------------------------------
// THE FIXTURE. Synthetic and obviously fake, and shaped by the normalizers in operation-system-db-api.js
// rather than by guesswork -- a workspace whose keys are invented renders an empty table, and then the
// measurement would be of an empty table.
//
// ONE marketplace scope holds all N SKUs, because that is the shape that makes a row expand do the work the
// Owner is waiting through: `_getCloudReplenishmentData` filters the whole marketplace_skus array to the
// applied scope and then assembles EVERY row in it.
// ---------------------------------------------------------------------------------------------------------
const MKT_ID = 'MP-FIXTURE-US-AMZ';
const MKT_ID_B = 'MP-FIXTURE-US-WMT';   // the SECOND station, so "switch site" switches something
function fixtureWorkspace(n) {
  const mk = (c, f) => Array.from({ length: c }, (_, i) => f(i));
  const skuOf = (i) => 'FIXTURE-SKU-' + String(i).padStart(3, '0');
  return {
    marketplaces: [
      { marketplace_id: MKT_ID, company: 'FixtureCo', country: 'US', marketplace: 'Amazon',
        currency: 'USD', status: 'active', allocation_priority: 100 },
      { marketplace_id: MKT_ID_B, company: 'FixtureCo', country: 'US', marketplace: 'KM Walmart',
        currency: 'USD', status: 'active', allocation_priority: 80 }],
    /* The SECOND station carries a SMALLER, OVERLAPPING set, so switching to it must visibly change the row
       count -- a switch that renders the same rows cannot show whether the switch happened. */
    marketplace_skus: mk(n, i => ({ marketplace_sku_id: 'MSKU-' + i, marketplace_id: MKT_ID,
      company: 'FixtureCo', country: 'US', marketplace: 'Amazon', sku: skuOf(i), site_sku: 'SS-' + i,
      marketplace_product_id: 'B000FIX' + String(i).padStart(3, '0'), currency: 'USD',
      regular_price: 19.99 + i, minimum_price: 9.99, msrp: 29.99,
      marketplace_sku_status: 'active', replenishment_model: 'sales_driven' })),
    marketplace_skus_b: null,   // placeholder key, never read; the B rows are appended below
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
    carrier_lead_times: mk(8, i => ({ lead_time_id: 'LT-' + i, carrier_id: 'C' + (i % 3), lane: 'CN-US',
      shipping_method: ['SEA', 'AIR', 'EXPRESS'][i % 3], days: 30 + i })),
    carrier_rate_cards: mk(12, i => ({ rate_card_id: 'RC-' + i, carrier_id: 'C' + (i % 3), lane: 'CN-US',
      shipping_method: ['SEA', 'AIR', 'EXPRESS'][i % 3], min_kg: i * 10, max_kg: (i + 1) * 10, rate: 1.5, currency: 'USD' }))
  };
}

/* B's rows are appended rather than interleaved above, so the A fixture reads exactly as it did before. */
function fixtureWorkspaceWithB(n) {
  const w = fixtureWorkspace(n);
  delete w.marketplace_skus_b;
  const skuOf = (i) => 'FIXTURE-SKU-' + String(i).padStart(3, '0');
  const bCount = Math.max(5, Math.round(n / 4));
  for (let i = 0; i < bCount; i++) {
    w.marketplace_skus.push({ marketplace_sku_id: 'MSKUB-' + i, marketplace_id: MKT_ID_B,
      company: 'FixtureCo', country: 'US', marketplace: 'KM Walmart', sku: skuOf(i), site_sku: 'SSB-' + i,
      marketplace_product_id: '', currency: 'USD', regular_price: 24.99, minimum_price: 12.99, msrp: 34.99,
      marketplace_sku_status: 'active', replenishment_model: 'sales_driven' });
  }
  return w;
}

function gapRows(n) {
  const skuOf = (i) => 'FIXTURE-SKU-' + String(i).padStart(3, '0');
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

/**
 * THE STUB, BY ACTION. Only the actions this page actually dispatches are answered in a real shape; the
 * rest get a generic empty success, and the evidence says which were which (the request log records every
 * action asked for, so a shape that matters and was answered generically cannot hide).
 */
function apiAnswer(action, n, gapMode) {
  if (action === 'getClientCapabilities') {
    return { success: true, data: { product_strategy_enabled: true, inventoryAiPlanDbGenerationEnabled: false,
      capabilitiesVersion: 'fixture-cp2p' } };
  }
  if (action === 'inventoryScope.registry.get') {
    return { success: true, data: {
      marketplaces: [
        { marketplace_id: MKT_ID, company: 'FixtureCo', country: 'US', marketplace: 'Amazon',
          marketplace_display_name: 'Amazon' },
        { marketplace_id: MKT_ID_B, company: 'FixtureCo', country: 'US', marketplace: 'KM Walmart',
          marketplace_display_name: 'KM Walmart' }],
      countries: ['US'], marketplace_ids_by_country: { US: [MKT_ID, MKT_ID_B] }, empty: false, empty_reason: '' } };
  }
  if (action === 'inventoryReplenishment.workspace.get') {
    return { success: true, data: fixtureWorkspaceWithB(n) };
  }
  if (action === 'inventoryReplenishmentGap.get') {
    if (gapMode === 'error') return { success: false, errors: [{ code: 'GAP_SCOPE_INVALID', message: 'fixture refusal' }] };
    return { success: true, data: { rows: gapRows(n) } };
  }
  if (action === 'gapJob.status.get') return { success: true, data: { status: 'IDLE', jobs: [] } };
  return { success: true, action: action,
    data: { rows: [], items: [], records: [], countries: [], marketplaces: [], tables: {}, servedAction: action } };
}

// ---------------------------------------------------------------------------------------------------------
// THE PAGE-SIDE SCRIPT.
// ---------------------------------------------------------------------------------------------------------
function measureScript(capId, opts) {
  return `
(function(){
  var CAP = ${JSON.stringify(capId)};
  var OPT = ${JSON.stringify(opts)};
  var out = { capId: CAP, steps: [], marks: [], getCalls: [], frames: [], expands: [], fatal: null,
              rowCount: 0, searchStatus: null, notes: [] };
  function now(){ return performance.now(); }

  /* A MODAL DIALOG BLOCKS THE WHOLE RENDERER, and the first two runs of this harness died exactly there:
     no measurement, no watchdog, no exit -- a silence that looks identical to a page that never loaded.
     The page has forty-odd alert() call sites; any one of them reached by a harness-driven path stops
     everything. They are captured, not suppressed: what the page tried to say is evidence. */
  out.dialogs = [];
  try {
    window.alert = function(m){ out.dialogs.push({ kind: 'alert', text: String(m).slice(0,300), t: +now().toFixed(2) }); };
    window.confirm = function(m){ out.dialogs.push({ kind: 'confirm', text: String(m).slice(0,300), t: +now().toFixed(2) }); return false; };
    window.prompt = function(m){ out.dialogs.push({ kind: 'prompt', text: String(m).slice(0,300), t: +now().toFixed(2) }); return null; };
  } catch (eD) {}
  out.consoleErrors = [];
  try {
    var _ce = console.error;
    console.error = function(){ try { out.consoleErrors.push(Array.prototype.map.call(arguments, function(a){ return String(a); }).join(' ').slice(0,240)); } catch(e){} return _ce.apply(console, arguments); };
  } catch (eC) {}
  function mark(tag, extra){ var m = { tag: tag, t: +now().toFixed(2) }; if (extra) for (var k in extra) m[k]=extra[k]; out.marks.push(m); return m; }
  function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
  window.addEventListener('error', function(e){ if (!out.fatal) out.fatal = String(e && e.message || e).slice(0,200); });

  /* THE FRAME LOOP RUNS THE WHOLE TIME. A "first paint" taken from a setTimeout is a guess about when the
     browser painted; a frame that observed the panel with a layout box is an observation. */
  var frameOn = false, frameTag = '';
  function frameLoop(){
    if (!frameOn) return;
    var p = document.querySelector('#ops-section .replen-expand-panel--scroll');
    var real = document.querySelector('#ops-section .replen-expand-panel--scroll:not(.replen-expand-panel--shell)');
    var r = p ? p.getBoundingClientRect() : null;
    var rr = real ? real.getBoundingClientRect() : null;
    out.frames.push({ tag: frameTag, t: +now().toFixed(2), panel: !!p, shell: !!(p && p.classList.contains('replen-expand-panel--shell')),
      h: r ? Math.round(r.height) : 0, w: r ? Math.round(r.width) : 0,
      realPanel: !!real, realH: rr ? Math.round(rr.height) : 0,
      execPending: !!document.querySelector('#ops-section [data-ir-reveal="execution"][data-reveal-state="pending"]'),
      recoPending: !!document.querySelector('#ops-section [data-ir-reveal="execution"][data-reveal-state="pending"]') });
    requestAnimationFrame(frameLoop);
  }

  /* WRAPPING, NOT EDITING. Both are top-level declarations in a classic script, so the page's own calls go
     through the global binding and are observed here. */
  function instrument(){
    if (typeof window.toggleReplenRow === 'function' && !window.__cp2pToggleWrapped) {
      var ot = window.toggleReplenRow;
      window.toggleReplenRow = function(sku){
        mark('handler.enter', { sku: String(sku) });
        var r;
        try { r = ot.apply(this, arguments); }
        finally { mark('handler.exit', { sku: String(sku) }); }
        return r;
      };
      window.__cp2pToggleWrapped = true;
    }
    if (typeof window.getReplenishmentData === 'function' && !window.__cp2pDataWrapped) {
      var og = window.getReplenishmentData;
      window.getReplenishmentData = function(){
        var a = now(); var res;
        try { res = og.apply(this, arguments); }
        finally {
          var b = now();
          out.getCalls.push({ at: +a.toFixed(2), ms: +(b-a).toFixed(2), rows: (res && res.length) || 0,
                              phase: frameTag || 'idle' });
        }
        return res;
      };
      window.__cp2pDataWrapped = true;
    }
  }

  function step(name, v){ out.steps.push({ step: name, t: +now().toFixed(2), v: v === undefined ? null : v }); return v; }

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

  /* SET IT, AND KEEP SETTING IT UNTIL IT STAYS SET.
     The scope registry read lands AFTER the filter bar is on screen and REBUILDS both selects, discarding
     whatever was chosen in between -- measured: country set to US at 1138 ms, registry answer at 1539 ms,
     country back to "" and the page refusing with "Please select a Country.". Waiting for the option to
     exist was not enough, because the static markup already carries one. The condition that matters is not
     "the option is there" but "the value survived", so that is what is waited on. */
  async function setSelect(el, value, label, ms){
    var t0 = now();
    while (now() - t0 < (ms || 15000)) {
      var has = Array.prototype.some.call(el.options, function(o){ return o.value === value; });
      if (has) {
        el.value = value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(250);
        if (el.value === value) return { ok: true, waitedMs: +(now()-t0).toFixed(2), tries: 1 };
      } else {
        await sleep(120);
      }
    }
    out.notes.push(label + ' never held the value ' + value + '; options=' +
      Array.prototype.map.call(el.options, function(o){ return o.value; }).join('|').slice(0,200));
    return { ok: false, waitedMs: +(now()-t0).toFixed(2) };
  }

  function rows(){ return document.querySelectorAll('#ops-section .scroll-row, #ops-section .fixed-row'); }
  function fixedRows(){ return document.querySelectorAll('#ops-section .fixed-row'); }

  /* ONE EXPAND, MEASURED. The click is a real pointer click on the real row element. */
  async function measureExpand(tag, rowEl){
    frameTag = tag;
    var base = now();
    mark(tag + '.click.dispatch');
    var before = out.getCalls.length;
    rowEl.click();
    mark(tag + '.click.returned');
    /* Wait for a frame in which the panel has a real box, then one more frame so "painted" means the
       browser has had the chance to composite it. */
    var painted = await waitFor(function(){
      var fs = out.frames.filter(function(f){ return f.tag===tag && f.panel && f.h > 4; });
      return fs.length ? fs[0] : null;
    }, 8000, tag + '.paint');
    /* THREE ENDPOINTS, ALL VALID FOR BOTH BUILDS. An earlier version waited for "a panel whose host is not
       pending", which the SHELL satisfies trivially -- so after the change it was timing the shell and
       reporting it as the finished panel. A measurement that improves because its own definition moved is
       worse than no measurement. */
    var realPanel = await waitFor(function(){
      var fs = out.frames.filter(function(f){ return f.tag===tag && f.realPanel && f.realH > 4; });
      return fs.length ? fs[0] : null;
    }, 20000, tag + '.realPanel');
    var cards = await waitFor(function(){
      return document.querySelector('#ops-section .replen-card--recommendation-summary') ? { ok: 1 } : null;
    }, 20000, tag + '.cards');
    var settled = await waitFor(function(){
      var host = document.querySelector('#ops-section [data-ir-reveal="execution"]');
      if (!host) return null;
      var st = host.getAttribute('data-reveal-state') || '';
      return (st && st !== 'pending') ? { state: st } : null;
    }, 25000, tag + '.reveal');
    var marksFor = out.marks.filter(function(m){ return m.tag.indexOf('handler.')===0 && m.t >= base; });
    var enter = marksFor.filter(function(m){ return m.tag==='handler.enter'; })[0] || null;
    var exit  = marksFor.filter(function(m){ return m.tag==='handler.exit'; })[0] || null;
    var calls = out.getCalls.slice(before);
    /* S8-B3-R3-CP2P-R1 - PHASE ATTRIBUTION, NOT A SUBTRACTION.
       CP2P reported ms_build_rest as (handler duration) minus (every assembly seen in the whole window),
       which mixed two different clocks: the handler is ONE synchronous task, while the window also contains
       assemblies that run LATER, from async continuations. The result was routinely negative, which is the
       tell. Each call is now attributed to the phase it actually ran in, by its own timestamp, and the two
       are reported separately and never subtracted from one another. */
    var inHandler = (enter && exit)
      ? calls.filter(function(c){ return c.at >= enter.t && c.at <= exit.t; }) : [];
    var afterHandler = (enter && exit)
      ? calls.filter(function(c){ return c.at > exit.t; }) : calls;
    var sum = function(a){ return +a.reduce(function(s,c){ return s + c.ms; }, 0).toFixed(2); };
    var rec = {
      tag: tag,
      t_click: +base.toFixed(2),
      t_handler_enter: enter ? enter.t : null,
      t_handler_exit: exit ? exit.t : null,
      ms_click_to_handler: enter ? +(enter.t - base).toFixed(2) : null,
      // THE SYNCHRONOUS HANDLER. One task, wall clock, nothing else in it.
      ms_handler_sync: (enter && exit) ? +(exit.t - enter.t).toFixed(2) : null,
      // What the handler itself spent assembling, and how often — a SUBSET of ms_handler_sync.
      ms_data_in_handler: sum(inHandler),
      calls_in_handler: inHandler.length,
      // What ran AFTER the handler returned, from async continuations. A different clock; never subtracted
      // from the one above, and never added to it as though they were one elapsed period.
      ms_data_after_handler: sum(afterHandler),
      calls_after_handler: afterHandler.length,
      data_calls: calls.length,
      data_rows: calls.length ? calls[0].rows : 0,
      t_first_paint: painted.ok ? painted.v.t : null,
      ms_click_to_paint: painted.ok ? +(painted.v.t - base).toFixed(2) : null,
      ms_handler_exit_to_paint: (painted.ok && exit) ? +(painted.v.t - exit.t).toFixed(2) : null,
      paint_ok: painted.ok,
      ms_click_to_real_panel: realPanel.ok ? +(realPanel.v.t - base).toFixed(2) : null,
      ms_click_to_summary_card: cards.ok ? +(cards.waitedMs + (painted.ok ? 0 : 0)).toFixed(2) : null,
      ms_click_to_exec_resolved: settled.ok ? +(now() - base).toFixed(2) : null,
      reveal_state: settled.ok ? settled.v.state : 'PENDING_OR_ABSENT',
      first_frame_was_shell: painted.ok ? !!painted.v.shell : null,
      frames_observed: out.frames.filter(function(f){ return f.tag===tag; }).length
    };
    out.expands.push(rec);
    frameTag = '';
    return rec;
  }

  async function go(){
    try {
      step('start');
      /* WAIT FOR THE APPLICATION, NOT FOR A STOPWATCH. A fixed 500 ms before the first click is a bet on
         how fast this machine boots, and it was lost: one run reached the click with showSection still
         undefined -- that page had taken 7.1 s to get its capabilities answer -- and reported an empty
         measurement that read like a page defect. The boot wait is RECORDED too, so a contended run is
         visible in the evidence instead of silently inflating every number after it. */
      var ready = await waitFor(function(){
        return (typeof window.showSection === 'function' && document.querySelector('.menu-item, [onclick*="showSection"]')) ? true : null;
      }, 40000, 'app-ready');
      out.bootWaitMs = ready.waitedMs;
      out.bootReady = ready.ok;
      step('app-ready', ready.ok ? ready.waitedMs : 'NOT_READY');
      if (!ready.ok) return report();

      // Navigate the way an operator does.
      var el = document.querySelector('[onclick*="showSection(\\'ops\\')"]');
      if (el) { el.click(); step('nav', 'click'); }
      else if (window.showSection) { window.showSection('ops'); step('nav', 'call'); }
      else step('nav', 'none');

      var sec = await waitFor(function(){ return document.getElementById('replenCountry'); }, 20000, 'filter-bar');
      step('filter-bar', sec.ok ? sec.waitedMs : 'MISSING');
      if (!sec.ok) return report();

      frameOn = true; requestAnimationFrame(frameLoop);
      instrument();

      var c = document.getElementById('replenCountry');
      var m = document.getElementById('replenMarketplace');
      var cSet = await setSelect(c, 'US', 'country');
      if (!cSet.ok) return report();
      /* The marketplace option VALUE is the marketplace_id (the page derives company from it), and the
         list is built by the COUNTRY change. The fixture's id is named explicitly rather than taken by
         index, so a reordered option list cannot silently change which scope was measured. */
      var mSet = await setSelect(m, ${JSON.stringify(MKT_ID)}, 'marketplace');
      if (!mSet.ok) return report();
      step('scope', c.value + '/' + m.value + ' (country waited ' + cSet.waitedMs + 'ms, marketplace ' + mSet.waitedMs + 'ms)');

      var btn = document.querySelector('#ops-section .replen-btn--search');
      if (btn) { btn.click(); step('search', 'click'); }
      else if (window.searchReplenishment) { window.searchReplenishment(); step('search', 'call'); }
      else step('search', 'none');

      var tbl = await waitFor(function(){ var r = fixedRows(); return r.length > 1 ? r.length : null; }, 30000, 'table');
      step('table', tbl.ok ? { rows: tbl.v, waitedMs: tbl.waitedMs } : 'NO_ROWS');
      instrument();
      out.rowCount = fixedRows().length;
      try { out.searchStatus = (typeof window._irSearchState_ === 'function') ? window._irSearchState_().status : null; } catch(e){}
      if (!tbl.ok) return report();

      /* Let the page settle so the FIRST measured expand is not timed against a still-loading page. */
      await sleep(OPT.settleMs);

      var fr = fixedRows();
      // COLD: the first expand of this session. WARM: a different row, after one panel has been built.
      await measureExpand('cold', fr[1]);
      await sleep(OPT.betweenMs);
      await measureExpand('warm', fr[2]);
      await sleep(OPT.betweenMs);
      await measureExpand('warm2', fr[3]);
      await sleep(OPT.betweenMs);
      // COLLAPSE: re-clicking the open row must not pay for a panel it is about to remove.
      frameTag = 'collapse';
      var t0 = now(); mark('collapse.click'); fr[3].click(); mark('collapse.done');
      await sleep(400);
      out.expands.push({ tag: 'collapse', ms_handler_sync: +(out.marks.filter(function(x){return x.tag==='collapse.done';})[0].t - t0).toFixed(2),
        panelAfter: !!document.querySelector('#ops-section .replen-expand-panel--scroll') });
      frameTag = '';

      /* A -> B WITHIN ONE STATION: expand one row, then another, with no collapse in between. The second
         expand must replace the first panel, not add to it. */
      var frA = fixedRows();
      await measureExpand('ab-first', frA[4]);
      await measureExpand('ab-second', frA[5]);
      out.abPanels = document.querySelectorAll('#ops-section .replen-expand-panel--scroll').length;
      out.abOpenSku = (function(){ try { return String(window.currentExpandedRow || ''); } catch(e){ return null; } }());
      await sleep(300);

      /* SWITCH STATION. The applied scope only moves on a confirmed Search, so this is select + Search,
         the way an operator does it, and the row count must change with it. */
      var mSel = document.getElementById('replenMarketplace');
      var swSet = await setSelect(mSel, ${JSON.stringify(MKT_ID_B)}, 'marketplace-B');
      var btn2 = document.querySelector('#ops-section .replen-btn--search');
      if (btn2) btn2.click(); else if (window.searchReplenishment) window.searchReplenishment();
      var switched = await waitFor(function(){
        var st = (typeof window._irSearchState_ === 'function') ? window._irSearchState_() : null;
        var r = fixedRows();
        return (st && st.status === 'READY' && r.length > 0 && r.length < out.rowCount) ? r.length : null;
      }, 20000, 'switch');
      step('switch', switched.ok ? switched.v : 'NOT_SWITCHED');
      await sleep(400);
      out.afterSwitch = { ok: swSet.ok, rows: fixedRows().length,
        panelsOpen: document.querySelectorAll('#ops-section .replen-expand-panel--scroll').length,
        searchStatus: (typeof window._irSearchState_ === 'function') ? window._irSearchState_().status : null };

      /* EXPAND IN THE NEW STATION, then LEAVE THE PAGE while the build is still scheduled. Nothing may
         paint into a page the operator has left, and nothing may throw. */
      var frB = fixedRows();
      if (frB.length > 1) {
        frameTag = 'leave';
        frB[1].click();
        var home = document.querySelector('.logo-text[onclick*="showHome"]');
        if (home) home.click(); else if (window.showHome) window.showHome();
        await sleep(900);
        out.afterLeave = {
          panels: document.querySelectorAll('#ops-section .replen-expand-panel--scroll').length,
          shells: document.querySelectorAll('#ops-section .replen-expand-panel--shell').length,
          opsActive: !!(document.getElementById('ops-section') && document.getElementById('ops-section').classList.contains('active')),
          fatal: out.fatal };
        frameTag = '';
      }

      try {
        out.transport = (window.KM && window.KM.transport && window.KM.transport.metrics) ? (function(){
          var mt = window.KM.transport.metrics();
          return { requests: mt.requests, coalesced: mt.coalesced,
            samples: (mt.samples||[]).map(function(s){ return { action: s.action, code: s.code, phase: s.phase, ms: s.ms }; }) };
        }()) : null;
      } catch(e) { out.transportError = String(e.message).slice(0,120); }

      report();
    } catch (e) {
      out.fatal = String(e && e.message || e).slice(0, 300);
      report();
    }
  }

  var report = function(){
    frameOn = false;
    /* The frame log is bounded in the report: the per-expand records already carry the derived numbers,
       and 60 s of frames would be a log, not evidence. */
    out.frames = out.frames.slice(0, 600);
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/__measure?id=' + encodeURIComponent(CAP), true);
      xhr.send(JSON.stringify(out));
    } catch (e) {}
  };

  var hold = document.createElement('img');
  hold.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;left:-9999px';
  hold.src = '/__hold?id=' + encodeURIComponent(CAP);
  document.body.appendChild(hold);

  /* A HARNESS THAT GOES SILENT TEACHES NOTHING. The first run of this reported no measurement at all, and
     "no measurement" cannot be told apart from "the page never loaded", "the search never dispatched" and
     "the report itself failed". The watchdog sends whatever has been collected, marked as such. */
  var reported = false;
  var _report = report;
  report = function(){ if (reported) return; reported = true; _report(); };
  setTimeout(function(){ if (!reported) { out.watchdog = true; out.notes.push('WATCHDOG: reported before completing'); report(); } }, OPT.watchdogMs);

  setTimeout(go, 500);
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
    if (cfg && cfg.pathLog) cfg.pathLog.push({ p: p, t: Date.now() - cfg.t0 });
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
        let table = u.searchParams.get('table') || '';
        let rid = u.searchParams.get('km_rid') || '';
        const kmBody = u.searchParams.get('km_body');
        if (kmBody) { try { const j = JSON.parse(kmBody); action = action || j.action || ''; rid = rid || j.requestId || ''; } catch (e) {} }
        if (!action && body) { try { const j = JSON.parse(body); action = j.action || ''; table = table || j.table || ''; rid = rid || j.requestId || ''; } catch (e) {} }
        cfg.log.push({ action: action, table: table, t: Date.now() - cfg.t0 });
        const send = (o) => {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify(withCorrelation(o, action, rid)));
        };
        const payload = apiAnswer(action, cfg.skus, cfg.gapMode);
        /* A SLOW READ IS THE SERVER BEING SLOW, NOT THE HARNESS WAITING. The gap read is the one the Owner
           reports as REQUEST_TIMEOUT, so it is the one that can be delayed -- and `timeout` means the
           answer never comes at all, which is what the client's own bound must then handle. */
        if (action === 'inventoryReplenishmentGap.get' && cfg.gapMode === 'timeout') return;   // never answered
        if (action === 'inventoryReplenishmentGap.get' && cfg.gapMode === 'slow') {
          setTimeout(function () { send(payload); }, cfg.gapSlowMs);
          return;
        }
        send(payload);
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
    const t = setTimeout(() => { if (!done) { done = true; try { child.kill(); } catch (e) {} resolve('TIMEOUT'); } }, timeoutMs);
    child.on('exit', () => { if (!done) { done = true; clearTimeout(t); resolve('EXIT'); } });
    child.on('error', () => { if (!done) { done = true; clearTimeout(t); resolve('SPAWN_ERROR'); } });
  });
}

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}

async function main() {
  const outDir = process.argv[2] && process.argv[2].indexOf('--') !== 0
    ? process.argv[2] : path.join(os.tmpdir(), 'km-cp2p-ir');
  fs.mkdirSync(outDir, { recursive: true });
  const browser = findBrowser();
  if (!browser) { console.log(JSON.stringify({ ok: false, reason: 'NO_BROWSER' })); return; }

  const skus = parseInt(arg('skus', '100'), 10);
  const gapMode = arg('gap', 'ok');
  const label = arg('label', 'run');
  const port = 39100 + (process.pid % 300);
  const capId = 'ir-' + label;
  const opts = { settleMs: parseInt(arg('settle', '1200'), 10), betweenMs: parseInt(arg('between', '600'), 10),
    watchdogMs: parseInt(arg('watchdog', '55000'), 10) };

  const pages = {}; pages['/__page'] = buildPage(port, capId, opts);
  const held = Object.create(null);
  const reported = Object.create(null);
  const cfg = { skus: skus, gapMode: gapMode, gapSlowMs: parseInt(arg('gapSlowMs', '8000'), 10), log: [], pathLog: [], t0: Date.now() };

  const srv = startServer(pages, held, reported, cfg);
  srv.listen(port, '127.0.0.1', async () => {
    const profile = path.join(os.tmpdir(), 'km-cp2p-' + process.pid + '-' + label);
    /* The GPU path, for the reason CP2O-R2 established: the forced software rasteriser on this machine
       loses its WebGL context after ~1.3 s. This page has no globe, but a renderer that is losing contexts
       is not the renderer to time a UI on. */
    const args = ['--headless=new', '--no-sandbox', '--no-first-run', '--disable-extensions',
      '--force-device-scale-factor=1', '--enable-unsafe-swiftshader',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
      '--user-data-dir=' + profile, '--window-size=1600,1000',
      'http://127.0.0.1:' + port + '/__page'];
    const how = await runChromeAsync(browser, args, MAX_HOLD_MS + 25000);
    srv.close();

    const m = reported[capId] || null;
    const result = {
      ok: !!m && !m.fatal, label: label, chromeExit: how,
      capturedAt: new Date().toISOString().slice(0, 10),
      config: { skus: skus, gapMode: gapMode, gapSlowMs: cfg.gapSlowMs, settleMs: opts.settleMs },
      sources: {
        'assets/js/pages/inventory-replenishment.js': sha('assets/js/pages/inventory-replenishment.js'),
        'assets/js/api/operation-system-db-api.js': sha('assets/js/api/operation-system-db-api.js'),
        'assets/html/pages/inventory-replenishment.html': sha('assets/html/pages/inventory-replenishment.html'),
        'assets/tests/_cp2p-ir-expand-runner.js': sha('assets/tests/_cp2p-ir-expand-runner.js')
      },
      requestLog: cfg.log,
      pathLog: cfg.pathLog.slice(0, 400),
      measurement: m
    };
    fs.writeFileSync(path.join(outDir, 'ir-expand-' + label + '.json'), JSON.stringify(result, null, 1), 'utf8');
    console.log(JSON.stringify({ ok: result.ok, label: label, out: path.join(outDir, 'ir-expand-' + label + '.json'),
      rows: m && m.rowCount, fatal: m && m.fatal, bootWaitMs: m && m.bootWaitMs,
      expands: (m && m.expands || []).map(e => ({ tag: e.tag, click_to_paint: e.ms_click_to_paint,
        shellFirst: e.first_frame_was_shell, real_panel: e.ms_click_to_real_panel,
        exec_resolved: e.ms_click_to_exec_resolved, handler_sync: e.ms_handler_sync,
        data_in: e.ms_data_in_handler, data_after: e.ms_data_after_handler,
        calls_in: e.calls_in_handler, calls_after: e.calls_after_handler })) }, null, 1));
  });
}

if (require.main === module) main();
module.exports = { fixtureWorkspace, fixtureWorkspaceWithB, gapRows, apiAnswer, MKT_ID, MKT_ID_B };
