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
function recoLines(n, rate) {
  const basis = {
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
    return { success: true, data: {
      marketplaces: [{ marketplace_id: MKT_ID, company: 'FixtureCo', country: 'US', marketplace: 'Amazon',
        marketplace_display_name: 'Amazon' }],
      countries: ['US'], marketplace_ids_by_country: { US: [MKT_ID] }, empty: false, empty_reason: '' } };
  }
  if (action === 'inventoryReplenishment.workspace.get') return { success: true, data: fixtureWorkspace(n) };
  if (action === 'inventoryReplenishmentGap.get') return { success: true, data: { rows: gapRows(n) } };
  if (action === 'gapJob.status.get') return { success: true, data: { status: 'IDLE', jobs: [] } };
  if (action === 'recommendation.workspace.get') {
    state.recoReads++;
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

      var el = document.querySelector('[onclick*="showSection(\\'ops\\')"]');
      if (el) el.click(); else if (window.showSection) window.showSection('ops');

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
      if (!tbl.ok) return report();
      await sleep(OPT.settleMs);

      /* The first workspace read must have landed, or the "second arrival" below would be the first. */
      var first = await waitFor(function(){
        var t = cellText(${JSON.stringify(skuOf(1))}, 'replen-avg-cell');
        return (t && t !== '--') ? t : null;
      }, 20000, 'first-reco');
      step('first-reco-cell', first.ok ? first.v : 'NEVER_RESOLVED');
      out.verdict.firstReadResolved = first.ok;
      out.verdict.firstCell = first.ok ? first.v : null;

      /* ---- expand a row and start working in it ------------------------------------------------ */
      var SKU = ${JSON.stringify(skuOf(1))};
      var fr = fixedRows();
      fr[1].click();
      var card = await waitFor(function(){ return document.getElementById('execution-plan-' + SKU); }, 25000, 'exec-card');
      step('exec-card', card.ok ? card.waitedMs : 'MISSING');
      if (!card.ok) return report();
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
      if (!input) { out.notes.push('no input inside the expanded panel'); out.fatal = 'NO_INPUT'; return report(); }
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

      var changed = await waitFor(function(){
        var t = cellText(SKU, 'replen-avg-cell');
        return (t && t !== out.before.avgCell) ? t : null;
      }, 25000, 'second-arrival');
      step('second-arrival', changed.ok ? changed.v : 'CELL_NEVER_CHANGED');
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
        const payload = apiAnswer(action, cfg.skus, cfg.state);
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
  if (!outDir) { console.error('usage: node _cp2s-r2-inplace-dom-runner.js <outDir> [--skus 60]'); process.exit(2); }
  fs.mkdirSync(outDir, { recursive: true });
  const browser = findBrowser();
  if (!browser) { console.error('no Chrome found'); process.exit(3); }

  const skus = parseInt(arg('--skus', '60'), 10);
  const cfg = { skus: skus, log: [], t0: Date.now(), state: { recoReads: 0 } };
  const pages = {}, held = {}, results = {};
  const capId = 'inplace-' + Date.now();
  const srv = startServer(pages, held, results, cfg);
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  pages['/__page'] = buildPage(port, capId, { settleMs: 900 });

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cp2s-r2-'));
  const why = await runChromeAsync(browser, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=' + profile, '--window-size=1600,1000',
    '--virtual-time-budget=180000',
    'http://127.0.0.1:' + port + '/__page'
  ], 180000);

  const r = results[capId] || { fatal: 'NO_RESULT (' + why + ')' };
  const evidence = {
    round: 'S8-B3-R3-CP2S-R2',
    what: 'in-place velocity update: what survives a real workspace arrival in a real browser',
    takenAt: new Date().toISOString(),
    browser: browser,
    skus: skus,
    recoReadsServed: cfg.state.recoReads,
    sources: {
      'index.html': sha('index.html'),
      'assets/js/pages/inventory-replenishment.js': sha('assets/js/pages/inventory-replenishment.js'),
      'assets/css/pages/inventory-replenishment.css': sha('assets/css/pages/inventory-replenishment.css')
    },
    actionLog: cfg.log,
    result: r
  };
  fs.writeFileSync(path.join(outDir, 'inplace-dom.json'), JSON.stringify(evidence, null, 2));
  srv.close();

  const v = (r && r.verdict) || {};
  console.log('\n== CP2S-R2 in-place DOM evidence ==');
  console.log('reco reads served :', cfg.state.recoReads);
  console.log('fatal             :', r.fatal || 'none');
  if (r.notes && r.notes.length) console.log('notes             :', r.notes.join(' | '));
  if (r.before) console.log('before            :', JSON.stringify(r.before));
  if (r.after) console.log('after             :', JSON.stringify(r.after));
  const KEYS = ['firstReadResolved', 'cellUpdated', 'focusKept', 'selectionKept', 'valueKept', 'inputSameNode',
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
  console.log('\nwrote ' + path.join(outDir, 'inplace-dom.json'));
  process.exitCode = (bad === 0 && !r.fatal) ? 0 : 1;
}

main();
