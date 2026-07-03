// Inventory Replenishment - Add SKU Modal

function openReplenAddSkuModal() {
  const modal = document.getElementById('replen-add-sku-modal');
  const overlay = document.getElementById('replen-modal-overlay');

  if (!modal || !overlay) return;

  // Marketplace dropdown is sourced from the active marketplaces registry.
  populateReplenAddSkuMarketplaces();

  // Company / Country / Currency are derived (read-only) from the selected marketplace.
  ['replen-add-company', 'replen-add-country', 'replen-add-currency'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.disabled = true;
  });

  // Reset SKU + Site SKU (Site SKU re-prefills from SKU).
  var skuEl = document.getElementById('replen-add-sku');
  if (skuEl) skuEl.value = '';
  var siteEl = document.getElementById('replen-add-site-sku');
  if (siteEl) { siteEl.value = ''; siteEl.dataset.autofill = '1'; }

  modal.classList.add('is-open');
  overlay.classList.add('is-open');
}

// Ensure a select carries (and selects) a value even if it's not in the static option list.
function setSelectValueEnsureOption(sel, val) {
  if (!sel) return;
  val = val || '';
  if (val) {
    var found = false;
    for (var i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === val) { found = true; break; }
    }
    if (!found) {
      var o = document.createElement('option');
      o.value = val; o.textContent = val;
      sel.appendChild(o);
    }
  }
  sel.value = val;
}

// Populate the Add SKU marketplace dropdown from active marketplaces (registry).
function populateReplenAddSkuMarketplaces() {
  var sel = document.getElementById('replen-add-marketplace');
  if (!sel) return;
  var list = (window.KM && window.KM.DB && window.KM.DB.getMarketplaces) ? window.KM.DB.getMarketplaces() : [];
  var active = list.filter(function(m) { var s = (m.status || '').toLowerCase(); return !s || s === 'active'; });
  sel.innerHTML = '';
  if (active.length === 0) {
    var ph = document.createElement('option');
    ph.value = '';
    ph.textContent = 'No active marketplaces — add one first';
    sel.appendChild(ph);
  } else {
    var ph0 = document.createElement('option');
    ph0.value = '';
    ph0.textContent = 'Select marketplace…';
    sel.appendChild(ph0);
    active.forEach(function(m) {
      var o = document.createElement('option');
      o.value = m.marketplaceId || '';
      o.setAttribute('data-company', m.company || '');
      o.setAttribute('data-country', m.country || '');
      o.setAttribute('data-marketplace', m.marketplace || '');
      o.setAttribute('data-currency', m.currency || '');
      o.setAttribute('data-fulfillment', m.fulfillmentModel || '');
      o.textContent = (m.marketplaceDisplayName || m.marketplace || '') + ' (' + (m.company || '') + ' / ' + (m.country || '') + ')';
      sel.appendChild(o);
    });
  }
  onReplenAddMarketplaceChange();
}

// When a marketplace is selected, auto-fill company / country / currency / marketplace_id.
function onReplenAddMarketplaceChange() {
  var sel = document.getElementById('replen-add-marketplace');
  var opt = sel && sel.selectedOptions && sel.selectedOptions[0];
  var company = opt ? (opt.getAttribute('data-company') || '') : '';
  var country = opt ? (opt.getAttribute('data-country') || '') : '';
  var currency = opt ? (opt.getAttribute('data-currency') || '') : '';
  var ffModel = opt ? (opt.getAttribute('data-fulfillment') || '') : '';
  var mpId = opt ? (opt.value || '') : '';
  setSelectValueEnsureOption(document.getElementById('replen-add-company'), company);
  setSelectValueEnsureOption(document.getElementById('replen-add-country'), country);
  setSelectValueEnsureOption(document.getElementById('replen-add-currency'), currency);
  var idEl = document.getElementById('replen-add-marketplace-id');
  if (idEl) idEl.value = mpId;

  // Fulfillment Model lock rule (platform/self locked; hybrid lets PM choose platform/self).
  var ffSel = document.getElementById('replen-add-fulfillment');
  var ffHint = document.getElementById('replen-add-fulfillment-hint');
  if (!mpId) {
    if (ffSel) { ffSel.innerHTML = '<option value=""></option>'; ffSel.disabled = true; ffSel.value = ''; }
    if (ffHint) ffHint.textContent = 'Select a marketplace first.';
  } else {
    applyFulfillmentLock(ffSel, ffHint, ffModel, '');
  }
}

// Fulfillment Model lock rule (shared by Add SKU / Edit SKU):
//  - marketplace = platform_fulfilled | self_fulfilled  -> SKU value auto-filled + locked.
//  - marketplace = hybrid                               -> PM picks platform_fulfilled / self_fulfilled.
//  - marketplace model unknown/blank                    -> free choice (no enforcement).
var FULFILLMENT_LABELS = { platform_fulfilled: 'Platform Fulfilled', self_fulfilled: 'Self Fulfilled', hybrid: 'Hybrid' };
function applyFulfillmentLock(selectEl, hintEl, marketplaceModel, currentValue) {
  if (!selectEl) return;
  marketplaceModel = String(marketplaceModel || '').trim();
  function opt(v) { return '<option value="' + v + '">' + (FULFILLMENT_LABELS[v] || v) + '</option>'; }
  if (marketplaceModel === 'platform_fulfilled' || marketplaceModel === 'self_fulfilled') {
    selectEl.innerHTML = opt(marketplaceModel);
    selectEl.value = marketplaceModel;
    selectEl.disabled = true;
    if (hintEl) hintEl.textContent = 'Locked — inherited from marketplace (' + FULFILLMENT_LABELS[marketplaceModel] + ').';
  } else if (marketplaceModel === 'hybrid') {
    selectEl.innerHTML = opt('platform_fulfilled') + opt('self_fulfilled');
    selectEl.value = (currentValue === 'platform_fulfilled' || currentValue === 'self_fulfilled') ? currentValue : 'platform_fulfilled';
    selectEl.disabled = false;
    if (hintEl) hintEl.textContent = 'Hybrid marketplace — select this SKU\'s fulfillment model.';
  } else {
    selectEl.innerHTML = '<option value="">(marketplace has no fulfillment model)</option>' + opt('platform_fulfilled') + opt('self_fulfilled') + opt('hybrid');
    selectEl.value = currentValue || '';
    selectEl.disabled = false;
    if (hintEl) hintEl.textContent = 'Marketplace has no fulfillment model set; choose if known.';
  }
}

window.populateReplenAddSkuMarketplaces = populateReplenAddSkuMarketplaces;
window.onReplenAddMarketplaceChange = onReplenAddMarketplaceChange;
window.applyFulfillmentLock = applyFulfillmentLock;

// ============================================================================
// IRMap — Inventory Table Mapping (Phase 1)
// Pure mapping/calculation helpers from existing snapshot/forecast/inventory data
// to the 貨物庫存表 fields. Implements docs/planning/INVENTORY_TABLE_MAPPING_SPEC.md v1.0
// (Stock Card, Long Term Storage, Sales Trend, First Layer Summary, Days-of-Supply UI,
// AI Suggestion column structure, Fulfillment Model foundation).
//
// Constraints: read-only mapping. NO source is fabricated — every missing field/table
// safe-falls-back to 0 / empty (never random / placeholder values that look like data).
// The Need-bucket calculation engine is NOT implemented in Phase 1 (returns 0 structure).
// ============================================================================
window.IRMap = (function () {
  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function eq(a, b) { return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase(); }
  function ymd(s) { return String(s == null ? '' : s).trim().slice(0, 10); }

  function todayYmd() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }
  function ymdNDaysAgo(n) {
    var d = new Date();
    d.setDate(d.getDate() - n);
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  // Pick the row with the latest snapshotDate matching country + sku (marketplace optional).
  function latestSnapshot(rows, scope) {
    if (!rows || !rows.length) return null;
    var best = null;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!eq(r.sku, scope.sku)) continue;
      if (scope.country && r.country && !eq(r.country, scope.country)) continue;
      if (scope.marketplace && r.marketplace && !eq(r.marketplace, scope.marketplace)) continue;
      if (!best || ymd(r.snapshotDate) > ymd(best.snapshotDate)) best = r;
    }
    return best;
  }

  // Stock Card ← amazon_inventory_snapshot
  function stockCard(inv) {
    return {
      available: inv ? num(inv.availableQty) : 0,
      fcTransfer: inv ? num(inv.fcTransferQty) : 0,
      fcProcessing: inv ? num(inv.fcProcessingQty) : 0,
      customerOrders: inv ? num(inv.customerOrderQty) : 0,
      unsellable: inv ? num(inv.unfulfillableQty) : 0
    };
  }

  // Long Term Storage ← amazon_inventory_health_snapshot.
  // Over 90+ = 91–180 bucket; Over 180+ = 181_270 + 271_365 + 366_455 + 456_plus.
  // The finer 366_455 / 456_plus buckets may be absent → safe 0 (no error).
  // Long Term Storage (unified, no country branch; missing/blank → 0):
  //   Over 90+  = inv_age_91_to_180_days   (inv_age_0_to_90_days is NOT included)
  //   Over 180+ = inv_age_181_to_270_days + inv_age_271_to_365_days + inv_age_365_plus_days
  //               + inv_age_366_to_455_days + inv_age_456_plus_days
  // (INVENTORY_TABLE_MAPPING_SPEC §5; never uses inv_age_61_to_90_days.)
  function longTermStorage(h) {
    if (!h) return { over90: 0, over180: 0 };
    var over90 = num(h.invAge91To180Days);
    var over180 = num(h.invAge181To270Days) + num(h.invAge271To365Days)
                + num(h.invAge365PlusDays) + num(h.invAge366To455Days) + num(h.invAge456PlusDays);
    return { over90: over90, over180: over180 };
  }

  // Sales Trend — past 7 completed days, EXCLUDING today. Returns only days that exist in
  // the data (no fabrication). Aggregates sales_units by date across channels.
  function salesTrend7d(dailyRows, scope) {
    var start = ymdNDaysAgo(7);   // today-7
    var end = ymdNDaysAgo(1);     // yesterday (exclude today)
    var byDate = {};
    (dailyRows || []).forEach(function (r) {
      if (!eq(r.sku, scope.sku)) return;
      if (scope.country && r.country && !eq(r.country, scope.country)) return;
      if (scope.marketplace && r.marketplace && !eq(r.marketplace, scope.marketplace)) return;
      var d = ymd(r.snapshotDate);
      if (d < start || d > end) return;
      byDate[d] = (byDate[d] || 0) + num(r.salesUnits);
    });
    return Object.keys(byDate).sort().map(function (d) {
      return { date: d, label: d.slice(5).replace('-', '/'), units: byDate[d] };
    });
  }

  // Avg Sales / Day ← amazon_weekly_sales_snapshot.sales_units_7d / 7 (1 decimal).
  function avgSalesPerDay(weeklyRows, scope) {
    if (!weeklyRows || !weeklyRows.length) return 0;
    var best = null;
    weeklyRows.forEach(function (r) {
      if (!eq(r.sku, scope.sku)) return;
      if (scope.country && r.country && !eq(r.country, scope.country)) return;
      if (scope.marketplace && r.marketplace && !eq(r.marketplace, scope.marketplace)) return;
      var key = r.weekEndDate || r.snapshotWeek || '';
      if (!best || String(key) > String(best.weekEndDate || best.snapshotWeek || '')) best = r;
    });
    if (!best) return 0;
    return Math.round((num(best.salesUnits7d) / 7) * 10) / 10;
  }

  // Resolve the single applicable Target Rule % (SKU > Series > Category). Default 100%.
  function targetPct(rules, scope) {
    if (!rules || !rules.length) return 100;
    function inScope(r) {
      if (r.company && scope.company && !eq(r.company, scope.company)) return false;
      if (r.country && scope.country && !eq(r.country, scope.country)) return false;
      if (r.marketplace && scope.marketplace && !eq(r.marketplace, scope.marketplace)) return false;
      return true;
    }
    var levels = [['sku', scope.sku], ['series', scope.series], ['category', scope.category]];
    for (var i = 0; i < levels.length; i++) {
      var type = levels[i][0], id = levels[i][1];
      if (!id) continue;
      var hit = rules.find(function (r) {
        return inScope(r) && r.scopeType === type && eq(r.scopeId, id) && r.targetPercentage != null;
      });
      if (hit) return num(hit.targetPercentage);
    }
    return 100;
  }

  // 60 Days FC = (FC Month+1 + FC Month+2) with Target Rule applied. ← fc_regular_forecast.
  function forecast60d(fcRows, rules, scope) {
    if (!fcRows || !fcRows.length) return 0;
    var fc = fcRows.find(function (r) {
      return eq(r.sku, scope.sku)
        && (!scope.country || !r.country || eq(r.country, scope.country))
        && (!scope.marketplace || !r.marketplace || eq(r.marketplace, scope.marketplace));
    });
    if (!fc) return 0;
    var cm = new Date().getMonth();
    var m1 = MONTHS[(cm + 1) % 12];
    var m2 = MONTHS[(cm + 2) % 12];
    var pct = targetPct(rules, {
      company: scope.company, country: scope.country, marketplace: scope.marketplace,
      sku: scope.sku, series: fc.series || scope.series, category: fc.category || scope.category
    }) / 100;
    return Math.round((num(fc[m1]) + num(fc[m2])) * pct);
  }

  function parseEventMonth(ev) {
    if (ev.eventMonth) { var em = parseInt(ev.eventMonth, 10); if (em >= 1 && em <= 12) return em; }
    var m = String(ev.eventPeriod || '').match(/(\d{1,2})\s*[\/\-]/);
    if (m) { var mm = parseInt(m[1], 10); if (mm >= 1 && mm <= 12) return mm; }
    return null;
  }

  // Upcoming Event = sum of fc_qty for events in the next 3 months (scope-matched).
  // If an event's month cannot be parsed, it is INCLUDED (never silently dropped).
  function upcomingEventQty(events, scope) {
    if (!events || !events.length) return 0;
    var cm = new Date().getMonth();
    var next3 = [((cm + 1) % 12) + 1, ((cm + 2) % 12) + 1, ((cm + 3) % 12) + 1];
    var total = 0, matched = 0;
    events.forEach(function (ev) {
      if (ev.country && scope.country && !eq(ev.country, scope.country)) return;
      if (ev.marketplace && scope.marketplace && !eq(ev.marketplace, scope.marketplace)) return;
      var scopeMatch =
        (ev.sku && eq(ev.sku, scope.sku)) ||
        (ev.scopeType === 'sku' && eq(ev.scopeId, scope.sku)) ||
        (ev.scopeType === 'series' && eq(ev.scopeId, scope.series)) ||
        (ev.scopeType === 'category' && eq(ev.scopeId, scope.category)) ||
        (!ev.sku && !ev.scopeId);
      if (!scopeMatch) return;
      var mo = parseEventMonth(ev);
      if (mo !== null && next3.indexOf(mo) === -1) return;
      matched++; total += num(ev.fcQty);
    });
    return matched > 0 ? total : 0;
  }

  // 3rd Party Stock = Σ available_stock across eligible overseas warehouses (same country).
  function thirdPartyStock(overseasRows, warehouses, scope) {
    if (!overseasRows || !overseasRows.length) return 0;
    var whById = {};
    (warehouses || []).forEach(function (w) { if (w.warehouseId) whById[w.warehouseId] = w; });
    var total = 0;
    overseasRows.forEach(function (r) {
      if (!eq(r.sku, scope.sku)) return;
      var wh = whById[r.warehouseId];
      // Eligible = same country; exclude factory warehouses (warehouse country is the source of truth).
      if (wh) {
        if (scope.country && wh.country && !eq(wh.country, scope.country)) return;
        var isFactory = String((wh.raw && wh.raw.is_factory_warehouse) || '').toLowerCase();
        if (isFactory === 'true' || isFactory === '1' || isFactory === 'yes') return;
      }
      total += num(r.availableStock);
    });
    return total;
  }

  // Factory CN / TW = Σ factory_stock.current_stock joined to warehouses by warehouse_id,
  // filtered by warehouse country (CN / TW).
  function factoryByCountry(factoryRows, warehouses, sku, countryCode) {
    if (!factoryRows || !factoryRows.length) return 0;
    var whById = {};
    (warehouses || []).forEach(function (w) { if (w.warehouseId) whById[w.warehouseId] = w; });
    var total = 0;
    factoryRows.forEach(function (f) {
      if (!eq(f.sku, sku)) return;
      var wh = whById[f.warehouseId];
      var c = (wh && wh.country) || f.country || '';
      // Fallback: parse country from the WH-{COMPANY}-{COUNTRY}-... id convention.
      if (!c && f.warehouseId) { var parts = f.warehouseId.split('-'); if (parts.length >= 3) c = parts[2]; }
      if (eq(c, countryCode)) total += num(f.currentStock);
    });
    return total;
  }

  function daysOfSupply(currentStock, avgPerDay) {
    if (!avgPerDay || avgPerDay <= 0) return null; // undefined coverage — show '--', never fake
    return Math.round((num(currentStock) / avgPerDay) * 10) / 10;
  }

  // Days of Supply UI color: <30 red, 30–150 normal, >150 khaki/brown (long inventory warning).
  function dosColorClass(dos) {
    if (dos === null || dos === undefined || dos === '' || dos === '--') return '';
    var n = parseFloat(dos);
    if (isNaN(n)) return '';
    if (n < 30) return 'ir-dos--red';
    if (n > 150) return 'ir-dos--khaki';
    return '';
  }

  // Fulfillment model resolution + lock rule (Marketplace SKU overrides only when marketplace = hybrid).
  function resolveFulfillment(mpRow, mpSkuRow) {
    var mpModel = (mpRow && mpRow.fulfillmentModel) || '';
    var skuModel = (mpSkuRow && mpSkuRow.fulfillmentModel) || '';
    if (mpModel === 'platform_fulfilled') return { model: 'platform_fulfilled', locked: true, source: 'marketplace' };
    if (mpModel === 'self_fulfilled') return { model: 'self_fulfilled', locked: true, source: 'marketplace' };
    if (mpModel === 'hybrid') return { model: skuModel || 'hybrid', locked: false, source: skuModel ? 'sku' : 'marketplace' };
    // Marketplace model unknown (column absent): fall back to the SKU-level value if present.
    return { model: skuModel || '', locked: false, source: skuModel ? 'sku' : 'none' };
  }

  // Need-bucket structure. Phase 1: the calculation engine is NOT implemented → return 0s.
  // The bucket windows and Suggested Qty roll-up shape match the spec so the engine can drop in.
  function needBuckets() {
    return { need0_18: 0, need19_30: 0, need31_45: 0, need46_90: 0, suggestedQty: 0 };
  }

  return {
    num: num, latestSnapshot: latestSnapshot, stockCard: stockCard,
    longTermStorage: longTermStorage, salesTrend7d: salesTrend7d, avgSalesPerDay: avgSalesPerDay,
    targetPct: targetPct, forecast60d: forecast60d, upcomingEventQty: upcomingEventQty,
    thirdPartyStock: thirdPartyStock, factoryByCountry: factoryByCountry,
    daysOfSupply: daysOfSupply, dosColorClass: dosColorClass,
    resolveFulfillment: resolveFulfillment, needBuckets: needBuckets
  };
})();

function closeReplenModal() {
  const modal = document.getElementById('replen-add-sku-modal');
  const overlay = document.getElementById('replen-modal-overlay');
  
  if (!modal || !overlay) return;
  
  modal.classList.remove('is-open');
  overlay.classList.remove('is-open');
  
  const skuInput = document.getElementById('replen-add-sku');
  if (skuInput) skuInput.value = '';

  const siteInput = document.getElementById('replen-add-site-sku');
  if (siteInput) { siteInput.value = ''; siteInput.dataset.autofill = '1'; }
}

function saveReplenSku() {
  const sku = document.getElementById('replen-add-sku')?.value.trim();
  let siteSku = (document.getElementById('replen-add-site-sku')?.value || '').trim();
  const status = 'active';
  const model = document.getElementById('replen-add-model')?.value || 'sales_driven';
  const launchDate = document.getElementById('replen-add-launch-date')?.value || '';
  const fulfillmentModel = document.getElementById('replen-add-fulfillment')?.value || '';
  const asinEl = document.getElementById('replen-add-asin');
  const asin = asinEl ? asinEl.value.trim() : '';

  // Company / country / marketplace / currency / marketplace_id come from the selected
  // marketplaces-registry option (authoritative), so they stay consistent.
  const mpSelect = document.getElementById('replen-add-marketplace');
  const opt = mpSelect && mpSelect.selectedOptions && mpSelect.selectedOptions[0];
  const marketplaceId = opt ? (opt.value || '').trim() : '';
  const marketplace = opt ? (opt.getAttribute('data-marketplace') || '').trim() : '';
  const company = opt ? (opt.getAttribute('data-company') || '').trim() : '';
  const country = opt ? (opt.getAttribute('data-country') || '').trim() : '';
  const currency = opt ? (opt.getAttribute('data-currency') || '').trim() : '';

  if (!sku) { alert('SKU is required'); return; }
  if (!siteSku) siteSku = sku; // default/prefill from SKU
  if (!marketplaceId || !marketplace || !company || !country) {
    alert('Please select a marketplace. If the list is empty, add one via + Marketplace first.');
    return;
  }
  if (!currency) { alert('The selected marketplace has no currency configured.'); return; }

  // Primary path: shared import backend chain
  // (creates marketplace_skus + pricing_list + fc_regular_forecast).
  if (window.KM && window.KM.DB && window.KM.DB.importMarketplaceSkusBatch) {
    var oneRow = {
      sku: sku,
      company: company,
      country: country,
      marketplace: marketplace,
      marketplace_id: marketplaceId,
      site_sku: siteSku,
      currency: currency,
      asin: asin,
      marketplace_sku_status: status,
      replenishment_model: model,
      fulfillment_model: fulfillmentModel,
      launch_date: launchDate
    };
    window.KM.DB.importMarketplaceSkusBatch([oneRow], {
      priceStatusDefault: 'draft',
      forecastStatusDefault: 'draft'
    }).then(function(result) {
      if (!result || result.success === false) {
        alert('Could not add SKU. ' + (result && result.error ? result.error : 'Please check the API connection and try again.'));
        return;
      }
      var data = result.data || {};
      var rr = (data.results && data.results[0]) || {};
      if (rr.status === 'error') {
        alert('Could not add SKU. ' + (rr.message || 'Validation failed.'));
        return;
      }
      alert('SKU "' + sku + '" ' + (rr.status || 'processed') + ' for ' + country + ' - ' + marketplace + (rr.message ? ('\n' + rr.message) : ''));
      closeReplenModal();
      renderReplenishment();
    }).catch(function(err) {
      alert('Error: ' + (err && err.message ? err.message : err));
    });
    return;
  }

  // Fallback: legacy single-row upsert (only if import method is unavailable).
  if (window.KM && window.KM.DB && window.KM.DB.upsertMarketplaceSku) {
    window.KM.DB.upsertMarketplaceSku({
      sku: sku,
      country: country,
      marketplace: marketplace,
      marketplace_sku_status: status,
      replenishment_model: model,
      launch_date: launchDate
    }).then(function(result) {
      if (result && result.success === false) {
        alert('Could not add SKU. ' + (result.error || 'Please check the API connection and try again.'));
        return;
      }
      alert('SKU "' + sku + '" added to ' + country + ' - ' + marketplace);
      closeReplenModal();
      renderReplenishment();
    }).catch(function(err) {
      alert('Error: ' + err.message);
    });
    return;
  }

  // Fallback: in-memory only (demo/mock, no KM.DB methods present)
  if (!window.replenishmentData) window.replenishmentData = [];
  var exists = replenishmentData.some(function(item) {
    return item.sku === sku && item.country === country && item.marketplace === marketplace;
  });
  if (exists) {
    alert('SKU "' + sku + '" already exists for ' + country + ' - ' + marketplace);
    return;
  }
  replenishmentData.push({ sku: sku, country: country, marketplace: marketplace, status: status, currentStock: 0, onTheWay: 0, thirdPartyStock: 0, avgSalesPerDay: 0, fc60Days: 0, upcomingEvent: '', daysOfSupply: 0, suggestedQty: 0, plannedQty: 0, cnStock: 0, twStock: 0 });
  if (typeof renderReplenishment === 'function') renderReplenishment();
  closeReplenModal();
  alert('SKU "' + sku + '" added (in-memory only)');
}

function prefillReplenSiteSku() {
  var skuEl = document.getElementById('replen-add-sku');
  var siteEl = document.getElementById('replen-add-site-sku');
  if (!skuEl || !siteEl) return;
  // Auto-fill Site SKU from SKU while the user hasn't manually edited it.
  if (!siteEl.value.trim() || siteEl.dataset.autofill === '1') {
    siteEl.value = skuEl.value.trim();
    siteEl.dataset.autofill = '1';
  }
}
window.prefillReplenSiteSku = prefillReplenSiteSku;
  
// The modal-overlay listener lives inside the partial markup (Phase 3-12), so it is bound
// once via _inventoryReplenStaticInit() after the markup is injected. On the initial
// DOMContentLoaded (before the user opens the page) the markup isn't present yet, so this
// is a safe no-op; the page lifecycle mount calls it again once the partial exists.
document.addEventListener('DOMContentLoaded', () => {
  _inventoryReplenStaticInit();
});

// ========================================
// Inventory Overview / Warning Summary
// ========================================

const irOverviewState = { series: 'All' };

const irOverviewMockData = [
    { sku: 'CO1100-R', series: 'CO1100', warning: 'high', d1: 42, d7: 294, d30: 1260, d90: 3780, fba: 320, david: 50, winit: 35, eta18: 120, eta45: 340, factoryYX: 1400, factorySY: 1000, recommend: 'ship',
      shipments18: [{ name: 'Shipment A', eta: '2026-04-20', qty: 120 }],
      shipments45: [{ name: 'Shipment A', eta: '2026-04-20', qty: 120 }, { name: 'Shipment B', eta: '2026-05-01', qty: 220 }] },
    { sku: 'CO1100-B', series: 'CO1100', warning: 'medium', d1: 28, d7: 196, d30: 840, d90: 2520, fba: 680, david: 80, winit: 70, eta18: 0, eta45: 200, factoryYX: 1000, factorySY: 800, recommend: 'monitor',
      shipments18: [],
      shipments45: [{ name: 'Shipment C', eta: '2026-04-28', qty: 200 }] },
    { sku: 'CO1100-G', series: 'CO1100', warning: 'safe', d1: 15, d7: 105, d30: 450, d90: 1350, fba: 1200, david: 150, winit: 150, eta18: 80, eta45: 180, factoryYX: 1800, factorySY: 1400, recommend: 'sufficient',
      shipments18: [{ name: 'Shipment D', eta: '2026-04-18', qty: 80 }],
      shipments45: [{ name: 'Shipment D', eta: '2026-04-18', qty: 80 }, { name: 'Shipment E', eta: '2026-05-05', qty: 100 }] },
    { sku: 'CO1150-A', series: 'CO1150', warning: 'high', d1: 55, d7: 385, d30: 1650, d90: 4950, fba: 180, david: 20, winit: 20, eta18: 200, eta45: 500, factoryYX: 900, factorySY: 600, recommend: 'ship',
      shipments18: [{ name: 'Shipment F', eta: '2026-04-19', qty: 200 }],
      shipments45: [{ name: 'Shipment F', eta: '2026-04-19', qty: 200 }, { name: 'Shipment G', eta: '2026-05-03', qty: 300 }] },
    { sku: 'CO1150-B', series: 'CO1150', warning: 'safe', d1: 12, d7: 84, d30: 360, d90: 1080, fba: 950, david: 120, winit: 100, eta18: 0, eta45: 150, factoryYX: 1600, factorySY: 1200, recommend: 'sufficient',
      shipments18: [],
      shipments45: [{ name: 'Shipment H', eta: '2026-04-30', qty: 150 }] },
    { sku: 'CO1200-X', series: 'CO1200', warning: 'medium', d1: 33, d7: 231, d30: 990, d90: 2970, fba: 420, david: 60, winit: 50, eta18: 60, eta45: 260, factoryYX: 1200, factorySY: 900, recommend: 'monitor',
      shipments18: [{ name: 'Shipment I', eta: '2026-04-22', qty: 60 }],
      shipments45: [{ name: 'Shipment I', eta: '2026-04-22', qty: 60 }, { name: 'Shipment J', eta: '2026-05-08', qty: 200 }] },
    { sku: 'CO1200-Y', series: 'CO1200', warning: 'high', d1: 48, d7: 336, d30: 1440, d90: 4320, fba: 150, david: 15, winit: 15, eta18: 100, eta45: 380, factoryYX: 500, factorySY: 400, recommend: 'ship',
      shipments18: [{ name: 'Shipment K', eta: '2026-04-21', qty: 100 }],
      shipments45: [{ name: 'Shipment K', eta: '2026-04-21', qty: 100 }, { name: 'Shipment L', eta: '2026-05-02', qty: 280 }] },
];

function setIrOverviewTab(series) {
    irOverviewState.series = series;
    document.querySelectorAll('.ir-overview__tab').forEach(t => t.classList.remove('is-active'));
    document.querySelector(`.ir-overview__tab[data-series="${series}"]`)?.classList.add('is-active');
    renderIrOverview();
}

function renderIrOverview() {
    const fixedBody = document.getElementById('ir-overview-fixed-body');
    const scrollBody = document.getElementById('ir-overview-scroll-body');
    if (!fixedBody || !scrollBody) return;

    // Only show data when Demo mode is ON
    if (!(window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled())) {
        fixedBody.innerHTML = '';
        scrollBody.innerHTML = '';
        return;
    }

    const data = irOverviewState.series === 'All'
        ? irOverviewMockData
        : irOverviewMockData.filter(d => d.series === irOverviewState.series);

    const warningLabel = { high: 'High Risk', medium: 'Medium', safe: 'Safe' };
    const recLabel = { ship: 'Ship Now', monitor: 'Monitor', sufficient: 'Sufficient' };

    fixedBody.innerHTML = data.map(d => `
        <div class="fixed-row">${d.sku}</div>
    `).join('');

    scrollBody.innerHTML = data.map((d, i) => `
        <div class="scroll-row">
            <div class="scroll-cell"><span class="ir-overview__badge ir-overview__badge--${d.warning}">${warningLabel[d.warning]}</span></div>
            <div class="scroll-cell">${d.d1}</div>
            <div class="scroll-cell">${d.d7.toLocaleString()}</div>
            <div class="scroll-cell">${d.d30.toLocaleString()}</div>
            <div class="scroll-cell">${d.d90.toLocaleString()}</div>
            <div class="scroll-cell">${d.fba.toLocaleString()}</div>
            <div class="scroll-cell">${d.david.toLocaleString()}</div>
            <div class="scroll-cell">${d.winit.toLocaleString()}</div>
            <div class="scroll-cell ir-overview__shipment-cell" onclick="showIrShipmentPopover(event, ${i}, '18')">${d.eta18 > 0 ? d.eta18.toLocaleString() : '-'}</div>
            <div class="scroll-cell ir-overview__shipment-cell" onclick="showIrShipmentPopover(event, ${i}, '45')">${d.eta45 > 0 ? d.eta45.toLocaleString() : '-'}</div>
            <div class="scroll-cell">${d.factoryYX.toLocaleString()}</div>
            <div class="scroll-cell">${d.factorySY.toLocaleString()}</div>
            <div class="scroll-cell"><span class="ir-overview__recommend ir-overview__recommend--${d.recommend}">${recLabel[d.recommend]}</span></div>
        </div>
    `).join('');
}

function showIrShipmentPopover(event, index, type) {
    event.stopPropagation();
    closeIrShipmentPopover();

    const d = (irOverviewState.series === 'All'
        ? irOverviewMockData
        : irOverviewMockData.filter(r => r.series === irOverviewState.series))[index];
    if (!d) return;

    const shipments = type === '18' ? d.shipments18 : d.shipments45;
    if (!shipments || shipments.length === 0) return;

    const rect = event.target.getBoundingClientRect();

    const backdrop = document.createElement('div');
    backdrop.className = 'ir-overview__popover-backdrop';
    backdrop.onclick = closeIrShipmentPopover;
    document.body.appendChild(backdrop);

    const pop = document.createElement('div');
    pop.className = 'ir-overview__popover';
    pop.id = 'irShipmentPopover';
    pop.innerHTML = `
        <div class="ir-overview__popover-title">${d.sku} — ≤${type} Days Shipments</div>
        ${shipments.map(s => `
            <div class="ir-overview__popover-row">
                <span>${s.name} — ETA: ${s.eta}</span>
                <span>Qty: ${s.qty.toLocaleString()}</span>
            </div>
        `).join('')}
    `;
    document.body.appendChild(pop);

    const popRect = pop.getBoundingClientRect();
    let top = rect.bottom + 6;
    let left = rect.left;
    if (top + popRect.height > window.innerHeight) top = rect.top - popRect.height - 6;
    if (left + popRect.width > window.innerWidth) left = window.innerWidth - popRect.width - 12;
    pop.style.top = top + 'px';
    pop.style.left = left + 'px';
}

function closeIrShipmentPopover() {
    document.getElementById('irShipmentPopover')?.remove();
    document.querySelector('.ir-overview__popover-backdrop')?.remove();
}

// Init: hook into showSection lifecycle after all scripts loaded
document.addEventListener('DOMContentLoaded', () => {
    // Once-only DOM bindings (overlay close + overview scroll sync) run after the partial is
    // injected — no-op here on first load, re-attempted by the lifecycle mount. The overview
    // render itself happens via the wrapped renderReplenishment on mount.
    _inventoryReplenStaticInit();

    // Wrap renderReplenishment (defined in app.js, loaded after this file). DOM-independent,
    // so it is safe to apply now; the wrap adds renderIrOverview() after each replenishment render.
    const _origRenderReplen = window.renderReplenishment;
    if (typeof _origRenderReplen === 'function') {
        window.renderReplenishment = function() {
            _origRenderReplen();
            renderIrOverview();
        };
    }
});

window.setIrOverviewTab = setIrOverviewTab;
window.showIrShipmentPopover = showIrShipmentPopover;
window.closeIrShipmentPopover = closeIrShipmentPopover;
window.renderIrOverview = renderIrOverview;

function syncIrOverviewScroll() {
    const scrollCol = document.getElementById('ir-overview-scroll-col');
    const scrollHeader = document.getElementById('ir-overview-scroll-header');
    if (!scrollCol || !scrollHeader) return;
    scrollCol.addEventListener('scroll', function() {
        scrollHeader.style.transform = 'translateX(-' + this.scrollLeft + 'px)';
    });
}

// ========================================
// Inventory Replenishment - 從 app.js 搬移 (批次 1: Mock Data + 核心計算渲染)
// ========================================

const replenishmentMockData = [
    { sku: "CO1100-R", lifecycle: "Mature", productName: "Can Opener Pro", forecast90d: 450, onTheWay: 20, unitsPerCarton: 40 },
    { sku: "CO1100-S", lifecycle: "New", productName: "Manual Opener Basic", forecast90d: 320, onTheWay: 15, unitsPerCarton: 50 },
    { sku: "CO1150-R", lifecycle: "Mature", productName: "Kitchen Tool Set", forecast90d: 1100, onTheWay: 50, unitsPerCarton: 30 },
    { sku: "CO1150-AG", lifecycle: "Mature", productName: "Electric Peeler", forecast90d: 380, onTheWay: 10, unitsPerCarton: 40 },
    { sku: "SP3120-R", lifecycle: "New", productName: "Smart Opener", forecast90d: 600, onTheWay: 30, unitsPerCarton: 50 },
    { sku: "SP3410-R", lifecycle: "Phasing Out", productName: "Classic Knife", forecast90d: 280, onTheWay: 5, unitsPerCarton: 30 },
    { sku: "MO5600-R", lifecycle: "Mature", productName: "Food Processor", forecast90d: 750, onTheWay: 40, unitsPerCarton: 40 }
];

const specialEvents = [
    { name: "Spring Deal", startDate: "3/22", endDate: "3/29", month: 3, tag: "Special Event" },
    { name: "Prime Day", startDate: "7/15", endDate: "7/16", month: 7, tag: "Special Event" },
    { name: "Fall Prime", startDate: "10/20", endDate: "10/21", month: 10, tag: "Special Event" },
    { name: "BFCM", startDate: "11/20", endDate: "12/1", month: 11, tag: "Special Event" }
];

const skuEventData = [
    { sku: "CO1100-R", events: [{ name: "Spring Deal", qty: 500 }, { name: "Prime Day", qty: 800 }] },
    { sku: "CO1100-S", events: [{ name: "BFCM", qty: 1200 }] },
    { sku: "CO1150-R", events: [{ name: "Prime Day", qty: 1500 }, { name: "Fall Prime", qty: 900 }] },
    { sku: "CO1150-AG", events: [{ name: "Spring Deal", qty: 400 }] },
    { sku: "SP3120-R", events: [{ name: "BFCM", qty: 2000 }] },
    { sku: "SP3410-R", events: [] },
    { sku: "MO5600-R", events: [{ name: "Prime Day", qty: 1000 }, { name: "BFCM", qty: 1800 }] }
];

// 運輸方式資料結構 (Stage 1 靜態資料)
const shippingMethodsByMarket = {
    'US-amazon': [
        { name: '3rd Party', leadTime: 7, priority: 1, costLevel: 'Medium' },
        { name: 'Air Freight', leadTime: 12, priority: 4, costLevel: 'High' },
        { name: 'Private Ship', leadTime: 25, priority: 3, costLevel: 'Medium' },
        { name: 'AGL Ship', leadTime: 45, priority: 2, costLevel: 'Low' }
    ],
    'UK-amazon': [
        { name: '3rd Party', leadTime: 7, priority: 1, costLevel: 'Medium' },
        { name: 'Air Freight', leadTime: 10, priority: 4, costLevel: 'High' },
        { name: 'Sea Freight', leadTime: 35, priority: 2, costLevel: 'Low' }
    ],
    'DE-amazon': [
        { name: '3rd Party', leadTime: 7, priority: 1, costLevel: 'Medium' },
        { name: 'Air Freight', leadTime: 10, priority: 4, costLevel: 'High' },
        { name: 'Sea Freight', leadTime: 35, priority: 2, costLevel: 'Low' }
    ]
};

let currentExpandedRow = null;
let replenishmentPlans = {};
let replenishmentNotes = {};
let replenishmentShippingMethods = {};
let cachedExpandData = {};

// Stage 2 預留：多方案運輸計算函數
function calculateShippingSuggestions(skuData, marketplace) {
    // Stage 1: 返回空陣列
    // Stage 2: 實作多方案計算邏輯
    // 計算邏輯：
    // 1. 計算斷貨時間點
    // 2. 優先使用 3rd Party Stock
    // 3. 從 AGL Ship (最慢/最便宜) 開始填補缺口
    // 4. 依序使用 Private Ship, Air Freight
    return [];
}

function getReplenishmentData() {
    // === Demo Data Layer: Phase 2A ===
    if (window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled()) {
        return _getDemoReplenishmentData();
    }

    // === End Demo Data Layer ===
    // Demo OFF: search-triggered loading from KM.DB. The Inventory Table (貨物庫存表) is mapped
    // from existing snapshot/forecast/inventory tables via IRMap (Phase 1). Source tables that
    // are not yet exposed to the frontend return [] → every field safe-falls-back to 0 / '--'
    // (no fabricated data). See docs/planning/INVENTORY_TABLE_MAPPING_SPEC.md v1.0.
    return _getCloudReplenishmentData();
    return siteData.map(item => {
        const mockData = replenishmentMockData.find(m => m.sku === item.sku) || {
            lifecycle: "Mature",
            productName: item.sku + " Product",
            forecast90d: Math.floor(Math.random() * 500) + 200,
            onTheWay: Math.floor(Math.random() * 30),
            unitsPerCarton: 40
        };
        
        // Add marketplace and company from siteData
        mockData.marketplace = item.site;
        // Assign company based on SKU
        if (item.sku === 'CO1100-R' || item.sku === 'CO1150-R' || item.sku === 'SP3120-R' || item.sku === 'MO5600-R') {
            mockData.company = 'Res US';
        } else if (item.sku === 'CO1100-S' || item.sku === 'CO1150-AG' || item.sku === 'SP3410-R') {
            mockData.company = 'Res TW';
        } else {
            mockData.company = 'Kitchen Mama';
        }
        
        // Mock expand panel data - 根據 SKU 設定不同規模
        // 使用快取避免每次展開時數據變動
        if (!cachedExpandData[item.sku]) {
            let available, fcTransfer, fcProcessing, winitStock, onusStock, within18days, within30days, within45days, lastWeek;
            let fcNextMonth, fcNext2Month, fcLastMonth, fcLast2Month, achievementLastMonth, achievementLast2Month;
            let salesDay2, salesDay3, salesDay4;
            
            if (item.sku === 'CO1100-R' || item.sku === 'CO1100-S') {
            // 大規模數量
            available = Math.floor(Math.random() * 2000) + 3000;
            fcTransfer = Math.floor(Math.random() * 500) + 800;
            fcProcessing = Math.floor(Math.random() * 500) + 600;
            winitStock = Math.floor(Math.random() * 300) + 500;
            onusStock = Math.floor(Math.random() * 300) + 400;
            within18days = Math.floor(Math.random() * 800) + 1200;
            within30days = Math.floor(Math.random() * 600) + 800;
            within45days = Math.floor(Math.random() * 600) + 800;
            lastWeek = Math.floor(Math.random() * 500) + 1500;
            fcNextMonth = Math.floor(Math.random() * 5000) + 8000;
            fcNext2Month = Math.floor(Math.random() * 5000) + 7000;
            fcLastMonth = Math.floor(Math.random() * 5000) + 7500;
            fcLast2Month = Math.floor(Math.random() * 4000) + 7000;
            salesDay2 = Math.floor(Math.random() * 100) + 200;
            salesDay3 = Math.floor(Math.random() * 100) + 180;
            salesDay4 = Math.floor(Math.random() * 100) + 170;
        } else if (item.sku === 'CO1150-R' || item.sku === 'CO1150-AG') {
            // 小規模數量
            available = Math.floor(Math.random() * 100) + 50;
            fcTransfer = Math.floor(Math.random() * 30) + 20;
            fcProcessing = Math.floor(Math.random() * 30) + 15;
            winitStock = Math.floor(Math.random() * 20) + 10;
            onusStock = Math.floor(Math.random() * 20) + 8;
            within18days = Math.floor(Math.random() * 50) + 30;
            within30days = Math.floor(Math.random() * 40) + 20;
            within45days = Math.floor(Math.random() * 40) + 20;
            lastWeek = Math.floor(Math.random() * 80) + 120;
            fcNextMonth = Math.floor(Math.random() * 500) + 800;
            fcNext2Month = Math.floor(Math.random() * 500) + 700;
            fcLastMonth = Math.floor(Math.random() * 500) + 750;
            fcLast2Month = Math.floor(Math.random() * 400) + 700;
            salesDay2 = Math.floor(Math.random() * 20) + 15;
            salesDay3 = Math.floor(Math.random() * 20) + 12;
            salesDay4 = Math.floor(Math.random() * 20) + 10;
        } else {
            // 中等規模數量
            available = Math.floor(Math.random() * 500) + 300;
            fcTransfer = Math.floor(Math.random() * 100) + 80;
            fcProcessing = Math.floor(Math.random() * 100) + 60;
            winitStock = Math.floor(Math.random() * 80) + 50;
            onusStock = Math.floor(Math.random() * 60) + 40;
            within18days = Math.floor(Math.random() * 200) + 150;
            within30days = Math.floor(Math.random() * 150) + 100;
            within45days = Math.floor(Math.random() * 150) + 100;
            lastWeek = Math.floor(Math.random() * 200) + 400;
            fcNextMonth = Math.floor(Math.random() * 2000) + 3000;
            fcNext2Month = Math.floor(Math.random() * 2000) + 2500;
            fcLastMonth = Math.floor(Math.random() * 2000) + 2800;
            fcLast2Month = Math.floor(Math.random() * 1500) + 2500;
            salesDay2 = Math.floor(Math.random() * 40) + 50;
            salesDay3 = Math.floor(Math.random() * 40) + 45;
            salesDay4 = Math.floor(Math.random() * 40) + 40;
        }
        
            achievementLastMonth = Math.floor(Math.random() * 20) + 85;
            achievementLast2Month = Math.floor(Math.random() * 20) + 80;
            
            // LTS data - 部分 SKU 設為 0 以測試篩選
            let over90, over180;
            if (item.sku === 'CO1100-S' || item.sku === 'CO1150-AG') {
                over90 = 0;
                over180 = 0;
            } else if (item.sku === 'SP3410-R') {
                over90 = Math.floor(Math.random() * 15) + 5;
                over180 = 0;
            } else {
                over90 = Math.floor(Math.random() * 15) + 5;
                over180 = Math.floor(Math.random() * 8) + 2;
            }
            
            // Factory stock - 快取以避免每次計算時變動
            const cnStock = Math.floor(Math.random() * 5000) + 1000;
            const twStock = Math.floor(Math.random() * 3000) + 500;
            
            cachedExpandData[item.sku] = {
                available, fcTransfer, fcProcessing, winitStock, onusStock,
                within18days, within30days, within45days, lastWeek, fcNextMonth, fcNext2Month,
                fcLastMonth, fcLast2Month, achievementLastMonth, achievementLast2Month,
                salesDay2, salesDay3, salesDay4, over90, over180, cnStock, twStock
            };
        }
        
        const expandData = cachedExpandData[item.sku];
        
        // Dynamic sales trend (past 3 days)
        const today = new Date();
        const day2ago = new Date(today);
        day2ago.setDate(today.getDate() - 2);
        const day3ago = new Date(today);
        day3ago.setDate(today.getDate() - 3);
        const day4ago = new Date(today);
        day4ago.setDate(today.getDate() - 4);
        
        // Dynamic forecast months
        const monthNames = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];
        const currentMonth = today.getMonth();
        const nextMonthIndex = (currentMonth + 1) % 12;
        const next2MonthIndex = (currentMonth + 2) % 12;
        const next3MonthIndex = (currentMonth + 3) % 12;
        const lastMonthIndex = (currentMonth - 1 + 12) % 12;
        const last2MonthIndex = (currentMonth - 2 + 12) % 12;
        
        // Generate FC for next 3 months
        const fcNext3Month = Math.floor(Math.random() * 5000) + 7000;
        
        // 60 days FC = The Following 前兩個月份的 FC 總和
        const forecast60d = expandData.fcNextMonth + expandData.fcNext2Month;
        
        // Get upcoming events for this SKU (檢查接下來三個月內的事件)
        const skuEvents = skuEventData.find(e => e.sku === item.sku)?.events || [];
        const next3Months = [
            (currentMonth + 1) % 12 || 12,
            (currentMonth + 2) % 12 || 12,
            (currentMonth + 3) % 12 || 12
        ];
        
        // 篩選出接下來三個月內的事件
        const filteredEvents = skuEvents.filter(e => {
            const event = specialEvents.find(se => se.name === e.name);
            return event && next3Months.includes(event.month);
        });
        
        const upcomingEventQty = filteredEvents.length > 0 ? filteredEvents[0].qty : null;
        
        const upcomingEventsText = filteredEvents.length > 0
            ? filteredEvents.map(e => {
                const event = specialEvents.find(se => se.name === e.name);
                return `<div class="replen-card__row"><span class="replen-card__label">${e.name} (${event?.startDate}~${event?.endDate})</span><span class="replen-card__value">${e.qty}</span></div>`;
              }).join('')
            : '<div class="replen-card__row"><span class="replen-card__label">No upcoming event</span><span class="replen-card__value">-</span></div>';
        
        // 1. Current Stock = Available + FC Transfer + FC Processing
        const currentInventory = expandData.available + expandData.fcTransfer + expandData.fcProcessing;
        
        // 2. On the Way = 根據期望天數動態計算
        let onTheWay;
        if (targetDays <= 18) {
            onTheWay = expandData.within18days;
        } else if (targetDays <= 30) {
            onTheWay = expandData.within18days + expandData.within30days;
        } else {
            onTheWay = expandData.within18days + expandData.within30days + expandData.within45days;
        }
        
        // 3. 3rd Party Stock = 3rd Party Stock 加總
        const thirdPartyStock = expandData.winitStock + expandData.onusStock;
        
        // 4. Avg. Sales/day = Last Week / 7
        const avgDailySales = expandData.lastWeek / 7;
        
        // Days of Supply = Current Stock / Avg. Sales
        const daysOfSupply = (currentInventory / avgDailySales).toFixed(1);
        
        // 檢查是否需要紅燈警示：Days of Supply < 18 且 (Current Stock + Within 18 days) / Avg. Sales < 18
        const daysWithin18 = ((currentInventory + expandData.within18days) / avgDailySales).toFixed(1);
        const needsAlert = parseFloat(daysOfSupply) < 18 && parseFloat(daysWithin18) < 18;
        
        // Suggested Qty - 依產品生命週期計算 (不包含 3rd Party Stock)
        let need18, need30, need45Plus;
        
        if (mockData.lifecycle === 'New') {
            // New 產品：60 days FC + 本月剩餘天數銷售 - (Current Stock + On the Way)
            const totalInventory = currentInventory + onTheWay;
            
            // 計算本月剩餘天數
            const today = new Date();
            const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            const remainingDays = lastDayOfMonth.getDate() - today.getDate();
            const remainingSales = remainingDays > 0 ? remainingDays * avgDailySales : 0;
            
            // New 產品的分時段計算（基於 FC）
            const totalDemand = forecast60d + remainingSales;
            const demand18 = totalDemand * (Math.min(18, targetDays) / targetDays);
            const demand30 = totalDemand * (Math.min(30, targetDays) / targetDays);
            
            const available18 = currentInventory + expandData.within18days;
            const available30 = currentInventory + expandData.within18days + expandData.within30days;
            const availableTotal = currentInventory + expandData.within18days + expandData.within30days + expandData.within45days;
            
            need18 = Math.max(0, Math.ceil(demand18 - available18));
            need30 = Math.max(0, Math.ceil(demand30 - available30 - need18));
            need45Plus = Math.max(0, Math.ceil(totalDemand - availableTotal - need18 - need30));
        } else {
            // Mature / Phasing Out：分時段計算（基於 Avg Sales）
            const demand18 = avgDailySales * Math.min(18, targetDays);
            const demand30 = avgDailySales * Math.min(30, targetDays);
            const demandTotal = avgDailySales * targetDays;
            
            const available18 = currentInventory + expandData.within18days;
            const available30 = currentInventory + expandData.within18days + expandData.within30days;
            const availableTotal = currentInventory + expandData.within18days + expandData.within30days + expandData.within45days;
            
            need18 = Math.max(0, Math.ceil(demand18 - available18));
            need30 = Math.max(0, Math.ceil(demand30 - available30 - need18));
            need45Plus = Math.max(0, Math.ceil(demandTotal - availableTotal - need18 - need30));
        }
        
        // Suggested Qty = 三個時段的加總
        let suggestedQty = need18 + need30 + need45Plus;
        
        // 進位到整箱數量
        const unitsPerCarton = mockData.unitsPerCarton || 40;
        if (suggestedQty > 0) {
            suggestedQty = Math.ceil(suggestedQty / unitsPerCarton) * unitsPerCarton;
        }
        
        return {
            sku: item.sku,
            lifecycle: mockData.lifecycle,
            productName: mockData.productName,
            marketplace: mockData.marketplace,
            company: mockData.company,
            currentInventory: currentInventory,
            avgDailySales: avgDailySales.toFixed(2),
            forecast60d: forecast60d,
            daysOfSupply: daysOfSupply,
            needsAlert: needsAlert,
            onTheWay: onTheWay,
            thirdPartyStock: thirdPartyStock,
            suggestedQty: suggestedQty,
            need18: need18,
            need30: need30,
            need45Plus: need45Plus,
            plannedQty: replenishmentPlans[item.sku] || 0,
            note: replenishmentNotes[item.sku] || '',
            status: suggestedQty > 0 ? "Need Restock" : "Sufficient",
            upcomingEventQty: upcomingEventQty,
            cnStock: expandData.cnStock,
            twStock: expandData.twStock,
            // Expand panel data
            available: expandData.available,
            fcTransfer: expandData.fcTransfer,
            fcProcessing: expandData.fcProcessing,
            winitStock: expandData.winitStock,
            onusStock: expandData.onusStock,
            within18days: expandData.within18days,
            within30days: expandData.within30days,
            within45days: expandData.within45days,
            lastWeek: expandData.lastWeek,
            // Sales trend dates and values
            day2ago: `${day2ago.getMonth() + 1}/${day2ago.getDate()}`,
            day3ago: `${day3ago.getMonth() + 1}/${day3ago.getDate()}`,
            day4ago: `${day4ago.getMonth() + 1}/${day4ago.getDate()}`,
            salesDay2: expandData.salesDay2,
            salesDay3: expandData.salesDay3,
            salesDay4: expandData.salesDay4,
            // Forecast months
            nextMonth: monthNames[nextMonthIndex],
            next2Month: monthNames[next2MonthIndex],
            next3Month: monthNames[next3MonthIndex],
            lastMonth: monthNames[lastMonthIndex],
            last2Month: monthNames[last2MonthIndex],
            fcNextMonth: expandData.fcNextMonth,
            fcNext2Month: expandData.fcNext2Month,
            fcNext3Month: fcNext3Month,
            fcLastMonth: expandData.fcLastMonth,
            fcLast2Month: expandData.fcLast2Month,
            achievementLastMonth: expandData.achievementLastMonth,
            achievementLast2Month: expandData.achievementLast2Month,
            upcomingEventsText: upcomingEventsText
        };
    }).filter(item => {
        if (!ltsFilter) return true;
        const expandData = cachedExpandData[item.sku];
        if (!expandData) return true;
        
        if (ltsFilter === 'over90') return expandData.over90 > 0;
        if (ltsFilter === 'over180') return expandData.over180 > 0;
        return true;
    });
}

// ========================================
// Main table Series tabs — filter the 貨物庫存表 main table by Series so the page
// stays focused instead of rendering every SKU at once. Tabs are built dynamically
// from the Series present in the current (search-scoped) result set, plus "All".
// ========================================
var replenSeriesTab = 'All';

function _replenSeriesOf(item) {
    var s = item && item.series != null ? String(item.series).trim() : '';
    return s || 'Other';
}

function setReplenSeriesTab(series) {
    replenSeriesTab = series;
    renderReplenishment();
}
window.setReplenSeriesTab = setReplenSeriesTab;

function renderReplenSeriesTabs(allData) {
    var bar = document.getElementById('replenSeriesTabs');
    if (!bar) return;

    if (!allData || allData.length === 0) {
        bar.innerHTML = '';
        bar.style.display = 'none';
        return;
    }

    // Distinct series in the current result set.
    var seriesList = [];
    allData.forEach(function (it) {
        var s = _replenSeriesOf(it);
        if (seriesList.indexOf(s) === -1) seriesList.push(s);
    });
    seriesList.sort();

    // Reset to All if the previously-active series is no longer present.
    if (replenSeriesTab !== 'All' && seriesList.indexOf(replenSeriesTab) === -1) replenSeriesTab = 'All';

    bar.style.display = '';
    var tabs = ['All'].concat(seriesList);
    bar.innerHTML = tabs.map(function (s) {
        var count = (s === 'All') ? allData.length : allData.filter(function (it) { return _replenSeriesOf(it) === s; }).length;
        var active = (s === replenSeriesTab) ? ' is-active' : '';
        var safe = escapeReplenHtml(s);
        var arg = String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return '<button class="replen-series-tab' + active + '" onclick="setReplenSeriesTab(\'' + arg + '\')">' +
            safe + ' <span class="replen-series-tab__count">' + count + '</span></button>';
    }).join('');
}
window.renderReplenSeriesTabs = renderReplenSeriesTabs;

function renderReplenishment() {
    const allData = getReplenishmentData();
    const fixedBody = document.getElementById('replenFixedBody');
    const scrollBody = document.getElementById('replenScrollBody');

    if (!fixedBody || !scrollBody) return;

    // Build/refresh the Series tabs from the full result set, then filter to the active tab.
    renderReplenSeriesTabs(allData);
    const data = (replenSeriesTab === 'All')
        ? allData
        : allData.filter(function (it) { return _replenSeriesOf(it) === replenSeriesTab; });

    currentExpandedRow = null;
    
    // Render fixed column (SKU)
    fixedBody.innerHTML = data.map(item => `
        <div class="fixed-row" data-sku="${item.sku}" onclick="toggleReplenRow('${item.sku}')">
            ${item.sku}
        </div>
    `).join('');
    
    // Render scrollable columns
    scrollBody.innerHTML = data.map(item => `
        <div class="scroll-row" data-sku="${item.sku}" onclick="toggleReplenRow('${item.sku}')">
            <div class="scroll-cell">${item.replenishmentModel === 'forecast_driven' ? 'Forecast Driven' : 'Sales Driven'}</div>
            <div class="scroll-cell">${item.company}</div>
            <div class="scroll-cell">${_replenMarketplaceLabel(item.marketplace, item.company, item.country)}</div>
            <div class="scroll-cell">${item.currentInventory}</div>
            <div class="scroll-cell">${item.onTheWay}</div>
            <div class="scroll-cell">${item.thirdPartyStock}</div>
            <div class="scroll-cell">${item.avgDailySales}</div>
            <div class="scroll-cell">${item.forecast60d}</div>
            <div class="scroll-cell">${item.upcomingEventQty !== null ? item.upcomingEventQty : '-'}</div>
            <div class="scroll-cell ${(window.IRMap ? window.IRMap.dosColorClass(item.daysOfSupply) : '')}${item.needsAlert ? ' alert-red' : ''}">${item.daysOfSupply}</div>
            <div class="scroll-cell">${item.suggestedQty}</div>
            <div class="scroll-cell" style="display: flex; gap: 4px; align-items: center; justify-content: center; width: 120px; min-width: 120px; max-width: 120px; flex-shrink: 0;">
                <span style="color: #64748B; font-size: 12px; cursor: pointer;" onclick="openShippingAllocation(event, '${item.sku}')">See Details</span>
                <button class="planned-qty-config-btn" 
                        onclick="openShippingAllocation(event, '${item.sku}')"
                        title="Configure shipping allocation"
                        style="padding: 4px 8px; font-size: 12px; margin: 0; min-width: auto;">⚙️</button>
            </div>
            <div class="scroll-cell">${item.cnStock || 0}</div>
            <div class="scroll-cell">${item.twStock || 0}</div>
            <div class="scroll-cell ai-action-cell" onclick="openAISuggestion(event, '${item.sku}')" style="width: 175px; min-width: 175px; max-width: 175px; flex-shrink: 0;">
                <span class="ai-action-cell__text">View Recommendation</span>
            </div>
        </div>
    `).join('');
    
    // Initialize header scroll sync
    initReplenHeaderSync();
}

function initReplenHeaderSync() {
    // Select the detail table scroll-col (not the ir-overview one)
    var tables = document.querySelectorAll('#ops-section .dual-layer-table:not(.ir-overview-table)');
    var detailTable = tables[tables.length - 1]; // last dual-layer-table is the detail table
    if (!detailTable) return;
    var scrollCol = detailTable.querySelector('.scroll-col');
    var scrollHeader = detailTable.querySelector('.scroll-header');
    
    if (!scrollCol || !scrollHeader) return;
    
    // Remove existing listener to avoid duplicates
    if (scrollCol._syncHandler) {
        scrollCol.removeEventListener('scroll', scrollCol._syncHandler);
    }
    
    // Create and store handler
    scrollCol._syncHandler = function() {
        scrollHeader.style.transform = 'translateX(-' + scrollCol.scrollLeft + 'px)';
    };
    
    scrollCol.addEventListener('scroll', scrollCol._syncHandler);
}


// ========================================
// Inventory Replenishment - 從 app.js 搬移 (批次 2: toggleReplenRow + 操作函式 + Shipping Allocation)
// ========================================

// Recommendation Summary table body (read-only system suggestion — NOT the submitted plan).
// Rows: 0–18d / 19–30d / 31–45d / 46–90d / Total. Columns: Window / Qty / Route / Reason.
// First version: Qty from the need-bucket data; Route is a placeholder ('--') until
// replenishment_route_rules is implemented; Reason is a placeholder from the allowed set
// (AI Pending / Stock Sufficient). See INVENTORY_TABLE_MAPPING_SPEC §11.
function _recSummaryRows(skuData) {
    function num(v) { return (typeof v === 'number') ? v : (parseInt(v, 10) || 0); }
    var windows = [
        ['0–18d', num(skuData && skuData.need0_18)],
        ['19–30d', num(skuData && skuData.need19_30)],
        ['31–45d', num(skuData && skuData.need31_45)],
        ['46–90d', num(skuData && skuData.need46_90)]
    ];
    var total = num(skuData && skuData.suggestedQty);
    function reasonFor(qty) { return qty > 0 ? 'AI Pending' : 'Stock Sufficient'; }
    function row(label, qty, isTotal) {
        var style = isTotal
            ? 'border-top: 1px solid var(--border-light); font-weight: 600;'
            : '';
        // Total row shows only Total + Qty; Route + Reason are intentionally blank.
        var route = isTotal ? '' : '--';
        var reason = isTotal ? '' : reasonFor(qty);
        return '<tr style="' + style + '">' +
            '<td>' + label + '</td>' +
            '<td class="replen-recsum-table__num">' + qty + '</td>' +
            '<td style="color: #94A3B8;">' + route + '</td>' +
            '<td style="color: #64748B;">' + reason + '</td>' +
            '</tr>';
    }
    var html = windows.map(function (w) { return row(w[0], w[1], false); }).join('');
    html += row('Total', total, true);
    return html;
}

function toggleReplenRow(sku) {
    const fixedRows = document.querySelectorAll('#ops-section .fixed-row');
    const scrollRows = document.querySelectorAll('#ops-section .scroll-row');
    const fixedBody = document.getElementById('replenFixedBody');
    const scrollBody = document.getElementById('replenScrollBody');
    
    const existingFixedPanels = document.querySelectorAll('#ops-section .fixed-body .replen-expand-panel');
    const existingScrollPanels = document.querySelectorAll('#ops-section .scroll-body .replen-expand-panel');
    existingFixedPanels.forEach(panel => panel.remove());
    existingScrollPanels.forEach(panel => panel.remove());
    
    fixedRows.forEach(row => row.classList.remove('expanded'));
    scrollRows.forEach(row => row.classList.remove('expanded'));
    
    if (currentExpandedRow === sku) {
        currentExpandedRow = null;
        return;
    }
    
    currentExpandedRow = sku;
    const fixedRow = Array.from(fixedRows).find(row => row.dataset.sku === sku);
    const scrollRow = Array.from(scrollRows).find(row => row.dataset.sku === sku);
    
    if (fixedRow) fixedRow.classList.add('expanded');
    if (scrollRow) scrollRow.classList.add('expanded');
    
    const data = getReplenishmentData();
    const skuData = data.find(item => item.sku === sku);
    
    const expandFixedHTML = `
        <div class="replen-expand-panel replen-expand-panel--fixed">
            <div class="replen-expand-fixed">
                <strong>${sku}</strong>
                <div style="margin-top: 8px; font-size: 14px; color: #333;">
                    ${skuData?.productName || 'Product Name'}
                </div>
                <div style="margin-top: 8px; font-size: 12px; color: #666;">
                    Click row to close
                </div>
            </div>
        </div>
    `;
    
    // TODO (Stage 2 / 3):
    // Replace rule-based suggestion with AI / seasonality model
    // - incorporate historical promotions, deals, yearly cycle
    // - weekly replenishment recommendation
    
    const expandScrollHTML = `
        <div class="replen-expand-panel replen-expand-panel--scroll">
            <div class="replen-expand-scroll">
                <div class="ir-panel ir-panel--inventory-group ir-fulfillment--${skuData?.fulfillmentModel || 'unset'}" data-fulfillment="${skuData?.fulfillmentModel || ''}">
                    <section class="replen-expand-section--inventory">
                        <div class="replen-card-grid">
                            <article class="replen-card replen-card--stock">
                                <h4 class="replen-card__title">Stock${skuData?.fulfillmentModel ? ` <span class="ir-ff-badge">${skuData.fulfillmentModel}</span>` : ''}</h4>
                                <div class="replen-card__row"><span class="replen-card__label">Available</span><span class="replen-card__value">${skuData?.available || 0}</span></div>
                                <div class="replen-card__row"><span class="replen-card__label">FC Transfer</span><span class="replen-card__value">${skuData?.fcTransfer || 0}</span></div>
                                <div class="replen-card__row"><span class="replen-card__label">FC Processing</span><span class="replen-card__value">${skuData?.fcProcessing || 0}</span></div>
                                <div class="replen-card__row"><span class="replen-card__label">Customer Orders</span><span class="replen-card__value">${skuData?.customerOrders || 0}</span></div>
                                <div class="replen-card__row"><span class="replen-card__label">Unsellable</span><span class="replen-card__value">${skuData?.unsellable || 0}</span></div>
                            </article>
                            <article class="replen-card replen-card--lts">
                                <h4 class="replen-card__title">Long Term Storage</h4>
                                <div class="replen-card__row"><span class="replen-card__label">Over 90+</span><span class="replen-card__value">${skuData?.over90 || 0}</span></div>
                                <div class="replen-card__row"><span class="replen-card__label">Over 180+</span><span class="replen-card__value">${skuData?.over180 || 0}</span></div>
                            </article>
                            <article class="replen-card replen-card--shipping">
                                <h4 class="replen-card__title">Shipping Shipment</h4>
                                <div class="replen-card__row"><span class="replen-card__label">Within 18 days</span><span class="replen-card__value">${skuData?.within18days || 0}</span></div>
                                <div class="replen-card__row"><span class="replen-card__label">Within 30 days</span><span class="replen-card__value">${skuData?.within30days || 0}</span></div>
                                <div class="replen-card__row"><span class="replen-card__label">Within 45 days</span><span class="replen-card__value">${skuData?.within45days || 0}</span></div>
                            </article>
                            <article class="replen-card replen-card--third-party">
                                <h4 class="replen-card__title">3rd Party Stock</h4>
                                <div class="replen-card__row"><span class="replen-card__label">Winit</span><span class="replen-card__value">${skuData?.winitStock || 0}</span></div>
                                <div class="replen-card__row"><span class="replen-card__label">ONUS</span><span class="replen-card__value">${skuData?.onusStock || 0}</span></div>
                            </article>
                        </div>
                    </section>
                </div>
                <div class="ir-panel-column ir-panel-column--context">
                    <article class="ir-panel replen-card replen-card--forecast">
                        <h4 class="replen-card__title">Forecast Breakdown</h4>
                        <div class="replen-card__row" style="font-weight: 600; margin-top: 4px;"><span class="replen-card__label">The Following</span><span class="replen-card__value"></span></div>
                        <div class="replen-card__row"><span class="replen-card__label">${skuData?.nextMonth || '-'}</span><span class="replen-card__value">${skuData?.fcNextMonth || 0}</span></div>
                        <div class="replen-card__row"><span class="replen-card__label">${skuData?.next2Month || '-'}</span><span class="replen-card__value">${skuData?.fcNext2Month || 0}</span></div>
                        <div class="replen-card__row"><span class="replen-card__label">${skuData?.next3Month || '-'}</span><span class="replen-card__value">${skuData?.fcNext3Month || 0}</span></div>
                        <div class="replen-card__row" style="font-weight: 600;"><span class="replen-card__label">Total</span><span class="replen-card__value">${(skuData?.fcNextMonth || 0) + (skuData?.fcNext2Month || 0) + (skuData?.fcNext3Month || 0)}</span></div>
                    </article>
                    <article class="ir-panel replen-card replen-card--upcoming">
                        <h4 class="replen-card__title">Upcoming Event</h4>
                        ${skuData?.upcomingEventsText || '<div class="replen-card__row"><span class="replen-card__label">No upcoming event</span><span class="replen-card__value">-</span></div>'}
                    </article>
                </div>
                <div class="ir-panel-column ir-panel-column--insight">
                    <article class="ir-panel replen-card replen-card--sales-trend">
                        <h4 class="replen-card__title">Sales Trend (Past Week)</h4>
                        <canvas id="sales-trend-chart-${sku}" style="max-height: 100px;"></canvas>
                    </article>
                    <article class="replen-card replen-card--recommendation-summary" id="recommendation-summary-${sku}">
                        <h4 class="replen-card__title">Recommendation Summary</h4>
                        <table class="replen-recsum-table">
                            <thead>
                                <tr>
                                    <th>Window</th>
                                    <th class="replen-recsum-table__num">Qty</th>
                                    <th>Route</th>
                                    <th>Reason</th>
                                </tr>
                            </thead>
                            <tbody>${_recSummaryRows(skuData)}</tbody>
                        </table>
                    </article>
                </div>
                <div class="ir-panel-column ir-panel-column--action">
                    <article class="ir-panel replen-card replen-card--achievement">
                        <h4 class="replen-card__title">Achievement Rate (Past 3 Months)</h4>
                        <canvas id="achievement-chart-${sku}" style="max-height: 100px;"></canvas>
                    </article>
                    <article class="replen-card replen-card--execution-plan" id="execution-plan-${sku}">
                        <div class="replen-card__title-row">
                            <h4 class="replen-card__title" style="margin: 0;">Execution Plan</h4>
                            <button class="replen-card__add-route-btn" onclick="addExecutionRoute(event, '${sku}')" onmousedown="event.stopPropagation()">+ Add Route</button>
                        </div>
                        <div class="ir-exec-plan__grid ir-exec-plan__grid--head">
                            <span>From</span><span>To</span><span class="ir-exec-plan__qty">Qty</span><span>Method</span><span></span>
                        </div>
                        <div id="shipping-methods-${sku}" class="exec-routes-list"></div>
                        <div class="replen-card__summary" style="border-top: 1px solid var(--border-light); margin-top: 4px; padding-top: 4px; display: flex; justify-content: space-between; font-weight: 600;">
                            <span class="replen-card__summary-label">Total</span>
                            <span class="replen-card__summary-value" id="allocation-total-${sku}">0</span>
                        </div>
                        <div class="replen-card__hint" id="allocation-hint-${sku}" style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Factory Stock Available</div>
                        <div class="replen-card__carton-error" id="allocation-carton-error-${sku}" style="display: none; font-size: 11px; color: #EF4444; margin-top: 4px;"></div>
                    </article>
                </div>
            </div>
        </div>
    `;
    
    const expandPanelFixed = document.createElement('div');
    expandPanelFixed.innerHTML = expandFixedHTML;
    const fixedElement = expandPanelFixed.firstElementChild;
    
    const expandPanelScroll = document.createElement('div');
    expandPanelScroll.innerHTML = expandScrollHTML;
    const scrollElement = expandPanelScroll.firstElementChild;
    
    const rowIndex = Array.from(fixedRows).indexOf(fixedRow);
    if (rowIndex < fixedRows.length - 1) {
        fixedRows[rowIndex + 1].before(fixedElement);
        scrollRows[rowIndex + 1].before(scrollElement);
    } else {
        fixedBody.appendChild(fixedElement);
        scrollBody.appendChild(scrollElement);
    }
    
    // Sync heights after DOM insertion
    setTimeout(() => {
        syncExpandPanelHeight(sku);
        
        // Seed / restore the Execution Plan routes (from Working Draft, or a default preview).
        initializeShippingAllocation(sku, skuData);
        
        // Initialize charts
        initSalesTrendChart(sku, skuData);
        initAchievementChart(sku, skuData);
        
        // Re-sync after initialization
        setTimeout(() => syncExpandPanelHeight(sku), 50);
    }, 0);
}

function updatePlannedQty(sku, qty) {
    replenishmentPlans[sku] = parseInt(qty) || 0;
}

function updateShippingMethod(sku, method) {
    replenishmentShippingMethods[sku] = method;
}

function updateGlobalShippingMethod(method) {
    // 全域運輸方式選擇，可用於批次設定或顯示
    console.log('Global shipping method selected:', method);
}

function updateReplenNote(sku, note) {
    replenishmentNotes[sku] = note;
}

function createPlan(sku) {
    console.log('Create plan for SKU:', sku);
    alert(`Create plan for ${sku} - Stage 1 placeholder`);
}

function submitReplenishmentPlans() {
    const data = getReplenishmentData();
    const country = document.getElementById('replenCountry').value;
    const marketplace = document.getElementById('replenMarketplace').value;
    const targetDays = document.getElementById('replenTargetDays').value;
    const shippingPlans = {};
    
    console.log('=== Submit Plan Debug ===');
    console.log('Total SKUs:', data.length);
    
    // Submit Plan reads ONLY the Execution Plan state (the Working Draft) — the single source of
    // the PM's actual shipping decision. It NEVER reads the Recommendation Summary (system
    // suggestion) or the live DOM. A SKU whose Execution Plan the PM never customized (no draft
    // row) is NOT submitted. Each Execution Plan route carries ship_from / destination /
    // shipping_method / qty. This is the only place that turns the Execution Plan into
    // shipping_plans — Decision Commit.
    data.forEach(item => {
        const draftRows = _allocationDraftRowsFor(item.sku);
        if (!draftRows || !draftRows.length) return;
        draftRows.forEach(r => {
            const method = r.shipping_method;
            const qty = parseInt(r.qty) || 0;
            if (qty > 0 && method) {
                if (!shippingPlans[method]) shippingPlans[method] = [];
                shippingPlans[method].push({
                    sku: item.sku,
                    qty: qty,
                    skuData: item,
                    ship_from: r.ship_from || '',
                    destination: r.destination || '',
                    sourceReason: r.source_reason || 'pm_adjustment'
                });
            }
        });
    });
    
    console.log('Shipping Plans:', shippingPlans);
    console.log('Total Methods:', Object.keys(shippingPlans).length);
    
    // 檢查是否有任何數值
    let totalSkus = 0;
    Object.keys(shippingPlans).forEach(method => {
        totalSkus += shippingPlans[method].length;
    });
    
    if (totalSkus === 0) {
        alert('No SKUs Submitted');
        return;
    }

    var targetDaysNum = parseFloat(targetDays) || 0;

    // Build a flat line list (one row per SKU×method). The backend groups into shipping_plans by
    // the six-value key (company + country + marketplace + ship_from + destination + shipping_method)
    // and freezes the per-SKU Decision Snapshot. See WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md.
    var planLines = [];
    Object.keys(shippingPlans).forEach(function(method) {
        shippingPlans[method].forEach(function(item) {
            var sd = item.skuData || {};
            var mock = (typeof replenishmentMockData !== 'undefined') ? replenishmentMockData.find(function(m){ return m.sku === item.sku; }) : null;
            var lineCompany = (sd.company && sd.company !== '--') ? sd.company : '';   // backend resolves if blank
            planLines.push({
                company: lineCompany,
                country: country,
                marketplace: marketplace,
                ship_from: item.ship_from || '',       // from the Execution Plan route (future: replenishment_route_rules)
                destination: item.destination || '',   // from the Execution Plan route (future: replenishment_route_rules)
                shipping_method: method,
                sku: item.sku,
                requested_qty: item.qty,
                units_per_carton: (mock && mock.unitsPerCarton) || sd.unitsPerCarton || '',
                source_page: 'inventory_replenishment',
                source_reason: item.sourceReason || 'manual_submit',
                inventory_snapshot_date: '',
                snapshot_current_stock: sd.currentInventory != null ? sd.currentInventory : '',
                snapshot_avg_sales_per_day: sd.avgDailySales != null ? sd.avgDailySales : '',
                snapshot_days_of_supply: sd.daysOfSupply != null ? sd.daysOfSupply : '',
                snapshot_suggested_qty: sd.suggestedQty != null ? sd.suggestedQty : '',
                snapshot_target_days: targetDaysNum,
                snapshot_fc_context: sd.forecast60d != null ? sd.forecast60d : '',
                snapshot_event_context: (sd.upcomingEventQty != null ? sd.upcomingEventQty : '')
            });
        });
    });

    // Carton validation gate (Fix 7): every submitted line qty must be an integer multiple of
    // units_per_carton; a missing units_per_carton blocks Submit Plan. Never silently round.
    var cartonErrors = [];
    var badSkus = {};
    planLines.forEach(function(l) {
        var upc = parseInt(l.units_per_carton) || 0;
        var qty = parseInt(l.requested_qty) || 0;
        if (qty <= 0) return;
        if (!upc) {
            cartonErrors.push(l.sku + ' (units per carton missing)');
            badSkus[l.sku] = true;
        } else if (qty % upc !== 0) {
            cartonErrors.push(l.sku + ' (qty ' + qty + ' not a multiple of ' + upc + ')');
            badSkus[l.sku] = true;
        }
    });
    if (cartonErrors.length) {
        // Surface inline red text on any expanded allocation blocks for the offending SKUs.
        Object.keys(badSkus).forEach(function(sku) {
            if (typeof validateAllocationCartons === 'function') validateAllocationCartons(sku);
        });
        alert('Cannot Submit Plan — Shipping Qty must be a full carton multiple.\n\n' + cartonErrors.join('\n'));
        return;
    }

    // Primary path: persist to shipping_plans / shipping_plan_lines via the API (Decision Commit).
    var canCloudWrite = window.KM && window.KM.DB && window.KM.DB.createShippingPlansBatch &&
        window.KM.DB.isCloudWriteEnabled && window.KM.DB.isCloudWriteEnabled();
    if (canCloudWrite) {
        window.KM.DB.createShippingPlansBatch({
            source: 'inventory_replenishment_submit_plan',
            target_days: targetDaysNum,
            lines: planLines
        }).then(function(result) {
            if (result && result.success === false) {
                alert('Could not create Weekly Shipping Plan. ' + (result.error || 'Please check the API connection and try again.'));
                return;
            }
            var planCount = (result && result.plan_count) || 0;
            var lineCount = (result && result.line_count) || planLines.length;
            // Decision Commit succeeded → clear the Working Draft (JS State + sessionStorage).
            _clearAllocationDraft();
            alert('Weekly Shipping Plan created.\nShipping Plans: ' + planCount + '\nSKU lines: ' + lineCount + '\nStatus: Draft');
            showSection('shippingplan');
            setTimeout(function() { renderShippingPlan(); }, 100);
        }).catch(function(err) {
            // Failure → keep the Working Draft (JS State + sessionStorage) so the user can retry.
            alert('Error creating Weekly Shipping Plan: ' + (err && err.message ? err.message : err));
        });
        return;
    }

    // Fallback (Demo / API not configured): keep the legacy sessionStorage behavior so navigation works.
    var allPlans = [];
    var existingData = sessionStorage.getItem('allShippingPlans');
    if (existingData) { allPlans = JSON.parse(existingData); }
    var newPlan = {
        id: Date.now(),
        date: new Date().toISOString().split('T')[0],
        country: country,
        marketplace: marketplace,
        targetDays: targetDays,
        plans: shippingPlans,
        status: {},
        notes: {}
    };
    Object.keys(shippingPlans).forEach(function(method) {
        newPlan.status[method] = 'draft';
        newPlan.notes[method] = [];
    });
    allPlans.push(newPlan);
    sessionStorage.setItem('allShippingPlans', JSON.stringify(allPlans));
    // Demo fallback success → also clear the Working Draft (kept separate from the demo store).
    _clearAllocationDraft();
    alert('Weekly Shipping Plan created (Demo / local mode).\nTotal SKUs: ' + totalSkus + '\nMethods: ' + Object.keys(shippingPlans).length);
    showSection('shippingplan');
    setTimeout(function() { renderShippingPlan(); }, 100);
}

window.renderReplenishment = renderReplenishment;
window.toggleReplenRow = toggleReplenRow;
window.updatePlannedQty = updatePlannedQty;
window.updateShippingMethod = updateShippingMethod;
window.updateGlobalShippingMethod = updateGlobalShippingMethod;
window.updateReplenNote = updateReplenNote;
window.createPlan = createPlan;
window.submitReplenishmentPlans = submitReplenishmentPlans;

function openShippingAllocation(event, sku) {
    event.stopPropagation();
    const fixedRows = document.querySelectorAll('#ops-section .fixed-row');
    const targetRow = Array.from(fixedRows).find(row => row.dataset.sku === sku);
    
    if (targetRow && targetRow.classList.contains('expanded')) {
        toggleReplenRow(sku);
    } else {
        if (!targetRow || !targetRow.classList.contains('expanded')) {
            toggleReplenRow(sku);
        }
        setTimeout(() => {
            const execCard = document.getElementById(`execution-plan-${sku}`);
            if (execCard) {
                execCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }, 100);
    }
}

function openAISuggestion(event, sku) {
    event.stopPropagation();
    const fixedRows = document.querySelectorAll('#ops-section .fixed-row');
    const targetRow = Array.from(fixedRows).find(row => row.dataset.sku === sku);
    if (!targetRow || !targetRow.classList.contains('expanded')) {
        toggleReplenRow(sku);
    }
    // Scroll to the Recommendation Summary (system suggestion) block.
    setTimeout(() => {
        const recCard = document.getElementById(`recommendation-summary-${sku}`);
        if (recCard) recCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
}

// ============================================================================
// Shipping Allocation Working Draft (Temporary Decision — NOT a Decision Snapshot)
// Lives only inside Inventory Replenishment before Submit Plan. JS State is the live
// editing state; sessionStorage is temporary recovery only. It NEVER writes shipping_plans
// or updates Weekly Shipping Plan — only Submit Plan (Decision Commit) does that.
// See SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md (Working Draft Principle) +
//     WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md (Shipping Allocation Working Draft).
// ============================================================================
var REPLEN_ALLOC_DRAFT_KEY = 'km_replen_alloc_draft_v1';
var replenAllocationDraft = { context: { country: '', marketplace: '' }, targetDays: '', bySku: {} };
if (!window.KM) window.KM = {};
window.KM.shippingAllocationDraft = replenAllocationDraft;

function _replenCtx() {
    return {
        country: (document.getElementById('replenCountry') || {}).value || '',
        marketplace: (document.getElementById('replenMarketplace') || {}).value || ''
    };
}
function _replenCtxEq(a, b) {
    return !!a && !!b && a.country === b.country && a.marketplace === b.marketplace;
}
function _persistAllocationDraft() {
    try { sessionStorage.setItem(REPLEN_ALLOC_DRAFT_KEY, JSON.stringify(replenAllocationDraft)); } catch (e) {}
}
function _clearAllocationDraft() {
    replenAllocationDraft = { context: { country: '', marketplace: '' }, targetDays: '', bySku: {} };
    window.KM.shippingAllocationDraft = replenAllocationDraft;
    try { sessionStorage.removeItem(REPLEN_ALLOC_DRAFT_KEY); } catch (e) {}
}
// Recovery only — restores the live JS state from sessionStorage (not a committed record).
function _restoreAllocationDraftFromSession() {
    try {
        var raw = sessionStorage.getItem(REPLEN_ALLOC_DRAFT_KEY);
        if (!raw) return;
        var parsed = JSON.parse(raw);
        if (parsed && parsed.bySku) {
            replenAllocationDraft = {
                context: parsed.context || { country: '', marketplace: '' },
                targetDays: parsed.targetDays || '',
                bySku: parsed.bySku || {}
            };
            window.KM.shippingAllocationDraft = replenAllocationDraft;
        }
    } catch (e) {}
}
// Discard the draft if the stored context no longer matches the active Country/Marketplace.
function _clearAllocationDraftIfContextChanged() {
    var ctx = _replenCtx();
    if (!_replenCtxEq(replenAllocationDraft.context, ctx)) _clearAllocationDraft();
}
// Returns the draft rows for a SKU only when the draft context matches the active search.
function _allocationDraftRowsFor(sku) {
    var ctx = _replenCtx();
    if (!_replenCtxEq(replenAllocationDraft.context, ctx)) return null;
    var rows = replenAllocationDraft.bySku[sku];
    return (rows && rows.length) ? rows : null;
}
// Capture the current Execution Plan route rows for a SKU into the Working Draft (live +
// sessionStorage). One draft row per Execution Plan route: { ship_from, destination,
// shipping_method, qty }. This is the SINGLE source Submit Plan reads (API-ready — never the DOM).
function _saveAllocationDraftFromDom(sku) {
    var routesList = document.getElementById('shipping-methods-' + sku);
    if (!routesList) return;
    var ctx = _replenCtx();
    replenAllocationDraft.context = ctx;
    replenAllocationDraft.targetDays = (document.getElementById('replenTargetDays') || {}).value || '';
    var rows = [];
    routesList.querySelectorAll('.exec-route-row').forEach(function (rowEl) {
        function fieldVal(f) {
            var el = rowEl.querySelector('[data-field="' + f + '"]');
            return el ? String(el.value || '').trim() : '';
        }
        var method = fieldVal('shipping_method');
        var qty = parseInt(fieldVal('qty')) || 0;
        var shipFrom = fieldVal('ship_from');
        var destination = fieldVal('destination');
        // Keep a row if it carries ANY user intent (method / qty / ship_from / destination).
        if (method || qty > 0 || shipFrom || destination) {
            rows.push({
                shipping_method: method,
                qty: qty,
                ship_from: shipFrom,
                destination: destination,
                source_reason: 'pm_adjustment'
            });
        }
    });
    if (rows.length) replenAllocationDraft.bySku[sku] = rows;
    else delete replenAllocationDraft.bySku[sku];
    window.KM.shippingAllocationDraft = replenAllocationDraft;
    _persistAllocationDraft();
}
// Explicit user edit on an Execution Plan route: recompute totals AND capture the Working Draft.
// (Pure render must NOT call this.)
function onExecutionRouteEdit(sku) {
    updateShippingAllocationTotal(sku);
    _saveAllocationDraftFromDom(sku);
}
// Back-compat alias (older callers).
function onAllocationEdit(sku) { onExecutionRouteEdit(sku); }
window.onExecutionRouteEdit = onExecutionRouteEdit;
window.onAllocationEdit = onAllocationEdit;
window._clearAllocationDraft = _clearAllocationDraft;

// Resolve units_per_carton for a SKU (cloud: sku_details; demo/mock: replenishmentMockData). 0 = missing.
function _replenUnitsPerCarton(sku) {
    try {
        var data = getReplenishmentData();
        var item = data && data.find(function (d) { return d.sku === sku; });
        if (item && item.unitsPerCarton) return parseInt(item.unitsPerCarton) || 0;
    } catch (e) {}
    var mock = (typeof replenishmentMockData !== 'undefined') ? replenishmentMockData.find(function (m) { return m.sku === sku; }) : null;
    return (mock && mock.unitsPerCarton) ? (parseInt(mock.unitsPerCarton) || 0) : 0;
}

// Carton-multiple validation for a SKU's Shipping Allocation (Fix 7). Shows inline red text and
// returns { valid, unitsPerCarton, reason }. Each method qty must be an integer multiple of UPC;
// a missing UPC is invalid (blocks Submit Plan).
function validateAllocationCartons(sku) {
    var methodsList = document.getElementById('shipping-methods-' + sku);
    var errDiv = document.getElementById('allocation-carton-error-' + sku);
    var upc = _replenUnitsPerCarton(sku);
    function showErr(msg) { if (errDiv) { errDiv.textContent = msg; errDiv.style.display = 'block'; } }
    function clearErr() { if (errDiv) { errDiv.textContent = ''; errDiv.style.display = 'none'; } }

    var qtys = [];
    if (methodsList) {
        methodsList.querySelectorAll('input[data-field="qty"]').forEach(function (inp) {
            qtys.push(parseInt(inp.value) || 0);
        });
    }
    var hasQty = qtys.some(function (q) { return q > 0; });
    if (!hasQty) { clearErr(); return { valid: true, unitsPerCarton: upc, reason: '' }; }

    if (!upc || upc <= 0) {
        showErr('Units per carton is missing for this SKU. Submit Plan is blocked until it is set.');
        return { valid: false, unitsPerCarton: 0, reason: 'missing_upc' };
    }
    var bad = qtys.some(function (q) { return q > 0 && (q % upc !== 0); });
    if (bad) {
        showErr('Shipping Qty must be a full carton multiple. Units per carton: ' + upc + '.');
        return { valid: false, unitsPerCarton: upc, reason: 'not_multiple' };
    }
    clearErr();
    return { valid: true, unitsPerCarton: upc, reason: '' };
}
window.validateAllocationCartons = validateAllocationCartons;

function updateShippingAllocationTotal(sku) {
    const methodsList = document.getElementById(`shipping-methods-${sku}`);
    if (!methodsList) return;

    const inputs = methodsList.querySelectorAll('input[data-field="qty"]');
    let total = 0;
    inputs.forEach(input => {
        total += parseInt(input.value) || 0;
    });

    const totalSpan = document.getElementById(`allocation-total-${sku}`);
    const hintDiv = document.getElementById(`allocation-hint-${sku}`);

    if (totalSpan) totalSpan.textContent = total;

    // Live carton-multiple validation (inline red text under the allocation block).
    validateAllocationCartons(sku);

    if (hintDiv) {
        // 獲取工廠庫存 (CN + TW)
        const data = getReplenishmentData();
        const skuData = data.find(item => item.sku === sku);
        const factoryStock = (skuData?.cnStock || 0) + (skuData?.twStock || 0);
        
        if (total > factoryStock) {
            hintDiv.style.color = '#991B1B';
            hintDiv.textContent = `Insufficient Stock (Factory: ${factoryStock}, Need: ${total})`;
        } else {
            hintDiv.style.color = 'var(--text-muted)';
            hintDiv.textContent = `Factory Stock Available: ${factoryStock} units`;
        }
    }
}

// Escape a value for use inside an HTML attribute (Execution Plan route inputs).
function _execEsc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Execution Plan shipping-method options. FUTURE: ship_from / destination / shipping_method are
// defaulted from replenishment_route_rules and may be permission-locked (see CARRIER_AND_ROUTE_SPEC).
var EXEC_PLAN_METHODS = ['Air Freight', 'Sea Freight', 'Express', 'Rail Freight'];

// Render one Execution Plan route row: Ship From / Destination / Suggested Qty / Shipping Method / Delete.
function _renderExecutionRoute(sku, route) {
    route = route || {};
    var methodOpts = '<option value="">Method…</option>' + EXEC_PLAN_METHODS.map(function (m) {
        var sel = (String(route.shipping_method || '') === m) ? ' selected' : '';
        return '<option value="' + _execEsc(m) + '"' + sel + '>' + _execEsc(m) + '</option>';
    }).join('');
    var qty = parseInt(route.qty) || 0;
    var row = document.createElement('div');
    row.className = 'exec-route-row ir-exec-plan__grid';
    row.innerHTML =
        '<input class="replen-card__input" type="text" data-field="ship_from" value="' + _execEsc(route.ship_from) + '" placeholder="From" oninput="onExecutionRouteEdit(\'' + sku + '\')" onclick="event.stopPropagation()">' +
        '<input class="replen-card__input" type="text" data-field="destination" value="' + _execEsc(route.destination) + '" placeholder="To" oninput="onExecutionRouteEdit(\'' + sku + '\')" onclick="event.stopPropagation()">' +
        '<input class="replen-card__input" type="number" data-field="qty" value="' + qty + '" oninput="onExecutionRouteEdit(\'' + sku + '\')" onclick="event.stopPropagation()">' +
        '<select class="replen-card__select" data-field="shipping_method" onchange="onExecutionRouteEdit(\'' + sku + '\')" onclick="event.stopPropagation()">' + methodOpts + '</select>' +
        '<button class="replen-card__remove-btn" onclick="removeExecutionRoute(event, \'' + sku + '\')" title="Delete">×</button>';
    var list = document.getElementById('shipping-methods-' + sku);
    if (list) list.appendChild(row);
}

// + Add Route: append a blank Execution Plan route the PM fills in.
function addExecutionRoute(event, sku) {
    if (event) event.stopPropagation();
    _renderExecutionRoute(sku, {});
    onExecutionRouteEdit(sku);
    syncExpandPanelHeight(sku);
}

// Delete an Execution Plan route.
function removeExecutionRoute(event, sku) {
    if (event) event.stopPropagation();
    var row = event.target.closest('.exec-route-row');
    if (row) {
        row.remove();
        onExecutionRouteEdit(sku);
        syncExpandPanelHeight(sku);
    }
}
window.addExecutionRoute = addExecutionRoute;
window.removeExecutionRoute = removeExecutionRoute;

function syncExpandPanelHeight(sku) {
    setTimeout(() => {
        const fixedPanel = document.querySelector(`#ops-section .fixed-body .replen-expand-panel`);
        const scrollPanel = document.querySelector(`#ops-section .scroll-body .replen-expand-panel`);
        
        if (fixedPanel && scrollPanel) {
            // 移除之前設定的固定高度
            fixedPanel.style.height = 'auto';
            scrollPanel.style.height = 'auto';
            
            // 強制重新計算
            setTimeout(() => {
                const fixedHeight = fixedPanel.scrollHeight;
                const scrollHeight = scrollPanel.scrollHeight;
                const maxHeight = Math.max(fixedHeight, scrollHeight);
                
                // 設定相同高度
                fixedPanel.style.height = maxHeight + 'px';
                scrollPanel.style.height = maxHeight + 'px';
            }, 0);
        }
    }, 0);
}

// Render the Execution Plan routes for a SKU (from Working Draft, or a default preview).
function initializeShippingAllocation(sku, skuData) {
    const methodsList = document.getElementById(`shipping-methods-${sku}`);
    if (!methodsList || !skuData) return;

    // 1) If a Working Draft exists for this SKU (same context), rebuild the Execution Plan from it
    //    so PM edits survive collapse / expand. This is a pure render — it must NOT re-capture.
    var draftRows = _allocationDraftRowsFor(sku);
    if (draftRows) {
        draftRows.forEach(function (r) { _renderExecutionRoute(sku, r); });
        updateShippingAllocationTotal(sku);
        return;
    }

    // 2) Otherwise seed a single default Execution Plan route from the Recommendation Summary total
    //    (Suggested Qty). ship_from / destination / shipping_method are left blank — FUTURE they are
    //    defaulted from replenishment_route_rules (CARRIER_AND_ROUTE_SPEC). This is a default preview:
    //    it is captured into the Working Draft only once the PM edits it.
    var suggested = parseInt(skuData.suggestedQty) || 0;
    _renderExecutionRoute(sku, { ship_from: '', destination: '', shipping_method: '', qty: suggested });
    updateShippingAllocationTotal(sku);
}

window.initializeShippingAllocation = initializeShippingAllocation;

window.openShippingAllocation = openShippingAllocation;
window.openAISuggestion = openAISuggestion;
window.updateShippingAllocationTotal = updateShippingAllocationTotal;


// ========================================
// Inventory Replenishment - 從 app.js 搬移 (批次 3: Charts + Modals)
// ========================================

// ========================================

function initSalesTrendChart(sku, skuData) {
    const canvas = document.getElementById(`sales-trend-chart-${sku}`);
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const today = new Date();
    const labels = [];
    const data = [];

    const realTrend = skuData && Array.isArray(skuData.salesTrend7d) ? skuData.salesTrend7d : null;
    if (realTrend && realTrend.length) {
        // Cloud mapping: real past-7-completed-days data (excludes today). Show only days that exist.
        realTrend.forEach(function(pt) { labels.push(pt.label); data.push(pt.units); });
    } else if (skuData && skuData._source === 'cloud-mapping') {
        // Cloud mapping with no daily-sales data — show empty (never fabricate sales).
    } else {
        // Demo fallback: synthetic past-7-day shape derived from the weekly average.
        for (let i = 6; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            labels.push(`${date.getMonth() + 1}/${date.getDate()}`);
            const baseValue = skuData.lastWeek / 7;
            const variance = baseValue * 0.3;
            data.push(Math.round(baseValue + (Math.random() - 0.5) * variance));
        }
    }

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Sales Units',
                data: data,
                borderColor: '#3B82F6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 2,
                tension: 0.3,
                fill: true,
                pointRadius: 3,
                pointHoverRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        font: {
                            size: 10
                        }
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        font: {
                            size: 10
                        }
                    }
                }
            }
        }
    });
}

function initAchievementChart(sku, skuData) {
    const canvas = document.getElementById(`achievement-chart-${sku}`);
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const today = new Date();
    const labels = [];
    const data = [];
    
    // Generate past 3 months data
    for (let i = 2; i >= 0; i--) {
        const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        labels.push(monthNames[date.getMonth()]);
        
        // Generate achievement rate (80-110%)
        data.push(Math.round(80 + Math.random() * 30));
    }
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Achievement Rate (%)',
                data: data,
                borderColor: '#10B981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                borderWidth: 2,
                tension: 0.3,
                fill: true,
                pointRadius: 3,
                pointHoverRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            return context.parsed.y + '%';
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        font: {
                            size: 10
                        }
                    }
                },
                y: {
                    beginAtZero: false,
                    min: 70,
                    max: 120,
                    ticks: {
                        font: {
                            size: 10
                        },
                        callback: function(value) {
                            return value + '%';
                        }
                    }
                }
            }
        }
    });
}

window.initSalesTrendChart = initSalesTrendChart;
window.initAchievementChart = initAchievementChart;


// Add Marketplace Modal Functions
function openAddMarketplaceModal() {
    const modal = document.getElementById('add-marketplace-modal');
    const overlay = document.getElementById('replen-modal-overlay');
    if (modal && overlay) {
        modal.classList.add('is-open');
        overlay.classList.add('is-open');
    }
}

function closeAddMarketplaceModal() {
    const modal = document.getElementById('add-marketplace-modal');
    const overlay = document.getElementById('replen-modal-overlay');
    if (modal && overlay) {
        modal.classList.remove('is-open');
        overlay.classList.remove('is-open');
    }
    // Clear inputs
    document.getElementById('add-mp-country').value = 'US';
    document.getElementById('add-mp-company').value = 'KM';
    document.getElementById('add-mp-marketplace').value = '';
    var curEl = document.getElementById('add-mp-currency');
    if (curEl) curEl.value = 'USD';
    var dnEl = document.getElementById('add-mp-display-name');
    if (dnEl) dnEl.value = '';
    var ffEl = document.getElementById('add-mp-fulfillment');
    if (ffEl) ffEl.value = 'platform_fulfilled';
}

function saveMarketplace() {
    const country = document.getElementById('add-mp-country').value;
    const company = document.getElementById('add-mp-company').value;
    const marketplace = document.getElementById('add-mp-marketplace').value.trim();
    const curEl = document.getElementById('add-mp-currency');
    const currency = curEl ? curEl.value : 'USD';
    const dnEl = document.getElementById('add-mp-display-name');
    const displayName = dnEl ? dnEl.value.trim() : '';
    const ffEl = document.getElementById('add-mp-fulfillment');
    const fulfillmentModel = ffEl ? ffEl.value : '';

    if (!marketplace) { alert('Please enter marketplace name'); return; }
    if (!company || !country) { alert('Company and Country are required'); return; }
    if (!currency) { alert('Currency is required'); return; }
    if (!fulfillmentModel) { alert('Fulfillment Model is required'); return; }

    if (!(window.KM && window.KM.DB && window.KM.DB.upsertMarketplace)) {
        alert('Marketplace API is not available.');
        return;
    }

    window.KM.DB.upsertMarketplace({
        company: company,
        country: country,
        marketplace: marketplace,
        marketplace_display_name: displayName || marketplace,
        // MVP: alias defaults to the marketplace value. (Backend also defaults this when blank.)
        marketplace_alias: marketplace,
        fulfillment_model: fulfillmentModel,
        currency: currency,
        status: 'active'
    }).then(function(result) {
        if (result && result.success === false) {
            alert('Could not save marketplace. ' + (result.error || 'Please check the API connection and try again.'));
            return;
        }
        var st = (result && result.status) ? result.status : 'saved';
        alert('Marketplace ' + st + ': ' + company + ' / ' + country + ' / ' + marketplace);
        closeAddMarketplaceModal();
        // Refresh registry-backed dropdowns/filters.
        if (typeof populateReplenFiltersFromRegistry === 'function') populateReplenFiltersFromRegistry();
    }).catch(function(err) {
        alert('Could not save marketplace. ' + (err && err.message ? err.message : err));
    });
}

window.openAddMarketplaceModal = openAddMarketplaceModal;
window.closeAddMarketplaceModal = closeAddMarketplaceModal;
window.saveMarketplace = saveMarketplace;

// Add Country Functions
function showAddCountryInput() {
    const container = document.getElementById('add-country-input-container');
    if (container) {
        container.style.display = 'block';
    }
}

function cancelAddCountry() {
    const container = document.getElementById('add-country-input-container');
    const input = document.getElementById('new-country-code');
    if (container) container.style.display = 'none';
    if (input) input.value = '';
}

function addNewCountry() {
    const input = document.getElementById('new-country-code');
    const select = document.getElementById('add-mp-country');
    
    if (!input || !select) return;
    
    const countryCode = input.value.trim().toUpperCase();
    
    if (!countryCode) {
        alert('Please enter a country code');
        return;
    }
    
    // Check if country already exists
    const existingOptions = Array.from(select.options);
    if (existingOptions.some(opt => opt.value === countryCode)) {
        alert('Country code already exists');
        return;
    }
    
    // Add new option
    const newOption = document.createElement('option');
    newOption.value = countryCode;
    newOption.textContent = countryCode;
    select.appendChild(newOption);
    
    // Select the new option
    select.value = countryCode;
    
    // Clear and hide input
    input.value = '';
    const container = document.getElementById('add-country-input-container');
    if (container) container.style.display = 'none';
}

window.showAddCountryInput = showAddCountryInput;
window.cancelAddCountry = cancelAddCountry;
window.addNewCountry = addNewCountry;



// ========================================
// Search-triggered loading (Demo OFF + Cloud Read)
// ========================================
function searchReplenishment() {
    // A new search (incl. Country / Marketplace change then Search) resets the Series tab to All.
    replenSeriesTab = 'All';

    // Demo ON: just re-render (demo does not need search)
    if (_replenDemoOn()) {
        renderReplenishment();
        return;
    }

    // Demo OFF: if the DB cache isn't loaded yet, load once, populate filters, then search.
    if (!window._opDbCache) {
        var loader = (window.KM && window.KM.DB && window.KM.DB.loadOperationDb)
            ? window.KM.DB.loadOperationDb
            : (window.reloadOperationDb || null);
        if (loader) {
            loader({ force: true }).then(function() {
                populateReplenFiltersFromRegistry();
                _doReplenSearch();
            }).catch(function() {
                _doReplenSearch();
            });
            return;
        }
    }
    _doReplenSearch();
}

function _doReplenSearch() {
    var country = document.getElementById('replenCountry').value;
    var marketplace = document.getElementById('replenMarketplace').value;
    if (!country && !marketplace) {
        alert('Please select Country and Marketplace before searching.');
        return;
    }
    if (!country) {
        alert('Please select a Country.');
        return;
    }
    if (!marketplace) {
        alert('Please select a Marketplace.');
        return;
    }
    renderReplenishment();
}
window.searchReplenishment = searchReplenishment;

// ========================================
// Cloud mapping (Demo OFF): Inventory Table Phase 1 mapping via IRMap
// ========================================
function _getCloudReplenishmentData() {
    var DB = (window.KM && window.KM.DB) ? window.KM.DB : null;
    var IR = window.IRMap;
    var country = document.getElementById('replenCountry') ? document.getElementById('replenCountry').value : '';
    var marketplace = document.getElementById('replenMarketplace') ? document.getElementById('replenMarketplace').value : '';
    var ltsFilter = document.getElementById('replenLTSFilter') ? document.getElementById('replenLTSFilter').value : '';
    if (!country || !marketplace || !DB || !DB.getMarketplaceSkus || !IR) return [];

    function eqv(a, b) { return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase(); }
    function get(name) { return (DB[name]) ? (DB[name]() || []) : []; }

    var mpSkus = get('getMarketplaceSkus');
    var filtered = mpSkus.filter(function (mp) { return eqv(mp.country, country) && eqv(mp.marketplace, marketplace); });
    if (filtered.length === 0) return [];

    // Source tables — all safe [] when not yet exposed to the frontend.
    var invSnaps = get('getAmazonInventorySnapshot');
    var healthSnaps = get('getAmazonInventoryHealthSnapshot');
    var dailyRows = get('getAmazonDailySalesSnapshot');
    var weeklyRows = get('getAmazonWeeklySalesSnapshot');
    var fcRows = get('getFcRegularForecast');
    var targetRules = get('getFcTargetRules');
    var events = get('getFcSpecialEvents');
    var overseas = get('getOverseasInventorySnapshot');
    var warehouses = get('getWarehouses');
    var factory = get('getFactoryStock');
    var marketplacesReg = get('getMarketplaces');
    var skuDetails = get('getSkuDetails');

    var monthNames = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];
    var MK = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    var cm = new Date().getMonth();

    var rows = filtered.map(function (mp) {
        var det = skuDetails.find(function (d) { return eqv(d.sku, mp.sku); }) || {};
        var scope = {
            company: mp.company, country: mp.country, marketplace: mp.marketplace, sku: mp.sku,
            series: det.series || '', category: det.category || det.productLine || ''
        };

        var inv = IR.latestSnapshot(invSnaps, scope);
        var health = IR.latestSnapshot(healthSnaps, scope);
        var stock = IR.stockCard(inv);
        var lts = IR.longTermStorage(health);
        var trend = IR.salesTrend7d(dailyRows, scope);
        var avg = IR.avgSalesPerDay(weeklyRows, scope);
        var fc60 = IR.forecast60d(fcRows, targetRules, scope);
        var eventQty = IR.upcomingEventQty(events, scope);
        var thirdParty = IR.thirdPartyStock(overseas, warehouses, scope);
        var cnStock = IR.factoryByCountry(factory, warehouses, mp.sku, 'CN');
        var twStock = IR.factoryByCountry(factory, warehouses, mp.sku, 'TW');
        var need = IR.needBuckets();

        var currentStock = stock.available + stock.fcTransfer + stock.fcProcessing;
        var dos = IR.daysOfSupply(currentStock, avg);

        // Forecast breakdown (next 3 months, Target Rule applied)
        var fcRow = fcRows.find(function (r) {
            return eqv(r.sku, mp.sku) && (!r.country || eqv(r.country, mp.country)) && (!r.marketplace || eqv(r.marketplace, mp.marketplace));
        });
        var pct = IR.targetPct(targetRules, scope) / 100;
        function fcMonth(off) { return fcRow ? Math.round((parseFloat(fcRow[MK[(cm + off) % 12]]) || 0) * pct) : 0; }

        // Fulfillment model resolution
        var mpReg = marketplacesReg.find(function (m) {
            return (mp.marketplaceId && m.marketplaceId === mp.marketplaceId) || (eqv(m.country, mp.country) && eqv(m.marketplace, mp.marketplace));
        });
        var ff = IR.resolveFulfillment(mpReg, mp);

        // Upcoming event display rows (next 3 months, scope-matched)
        var next3 = [((cm + 1) % 12) + 1, ((cm + 2) % 12) + 1, ((cm + 3) % 12) + 1];
        function evMatch(ev) {
            if (ev.country && !eqv(ev.country, scope.country)) return false;
            if (ev.marketplace && !eqv(ev.marketplace, scope.marketplace)) return false;
            var sm = (ev.sku && eqv(ev.sku, scope.sku)) ||
                (ev.scopeType === 'sku' && eqv(ev.scopeId, scope.sku)) ||
                (ev.scopeType === 'series' && eqv(ev.scopeId, scope.series)) ||
                (ev.scopeType === 'category' && eqv(ev.scopeId, scope.category)) ||
                (!ev.sku && !ev.scopeId);
            if (!sm) return false;
            var mm = null;
            if (ev.eventMonth) { var em = parseInt(ev.eventMonth, 10); if (em >= 1 && em <= 12) mm = em; }
            if (mm === null) { var x = String(ev.eventPeriod || '').match(/(\d{1,2})\s*[\/\-]/); if (x) mm = parseInt(x[1], 10); }
            return mm === null ? true : next3.indexOf(mm) !== -1;
        }
        var evRows = events.filter(evMatch);
        var upcomingEventsText = evRows.length > 0
            ? evRows.map(function (ev) {
                return '<div class="replen-card__row"><span class="replen-card__label">' +
                    (ev.event || ev.scopeId || 'Event') + (ev.eventPeriod ? (' (' + ev.eventPeriod + ')') : '') +
                    '</span><span class="replen-card__value">' + IR.num(ev.fcQty) + '</span></div>';
            }).join('')
            : '<div class="replen-card__row"><span class="replen-card__label">No upcoming event</span><span class="replen-card__value">-</span></div>';

        return {
            sku: mp.sku,
            lifecycle: det.lifecycle || '--',
            replenishmentModel: mp.replenishmentModel || 'sales_driven',
            company: mp.company || '--',
            country: mp.country,
            marketplace: mp.marketplace,
            series: scope.series || '',
            // First Layer Summary
            currentInventory: currentStock,
            onTheWay: 0,                       // Shipping Shipment — pending mapping (spec §9)
            thirdPartyStock: thirdParty,
            avgDailySales: avg.toFixed(1),     // spec: 1 decimal
            forecast60d: fc60,
            upcomingEventQty: eventQty > 0 ? eventQty : null,
            daysOfSupply: (dos === null ? '--' : String(dos)),
            needsAlert: false,                 // color now driven by IRMap.dosColorClass
            suggestedQty: need.suggestedQty,
            cnStock: cnStock,
            twStock: twStock,
            unitsPerCarton: det.unitsPerCarton || 0,   // from sku_details — drives carton validation
            // AI Suggestion buckets (Phase 1 structure — engine not implemented)
            need0_18: need.need0_18, need19_30: need.need19_30, need31_45: need.need31_45, need46_90: need.need46_90,
            plannedQty: (typeof replenishmentPlans !== 'undefined' && replenishmentPlans[mp.sku]) || 0,
            note: (DB.getAmazonInventorySnapshot && get('getAmazonInventorySnapshot').length === 0) ? 'Cloud read — Amazon snapshot data pending' : '',
            status: need.suggestedQty > 0 ? 'Need Restock' : 'Sufficient',
            productName: mp.siteSku || mp.sku,
            // Stock Card detail (expand)
            available: stock.available,
            fcTransfer: stock.fcTransfer,
            fcProcessing: stock.fcProcessing,
            customerOrders: stock.customerOrders,
            unsellable: stock.unsellable,
            // Long Term Storage
            over90: lts.over90,
            over180: lts.over180,
            // Shipping Shipment (pending)
            within18days: 0, within30days: 0, within45days: 0,
            // 3rd Party detail (only aggregate available in Phase 1)
            winitStock: 0, onusStock: 0,
            // Forecast breakdown (next 3 months)
            nextMonth: monthNames[(cm + 1) % 12], next2Month: monthNames[(cm + 2) % 12], next3Month: monthNames[(cm + 3) % 12],
            fcNextMonth: fcMonth(1), fcNext2Month: fcMonth(2), fcNext3Month: fcMonth(3),
            upcomingEventsText: upcomingEventsText,
            // Sales trend (past 7 completed days)
            salesTrend7d: trend,
            lastWeek: Math.round(avg * 7),
            // Fulfillment model foundation
            fulfillmentModel: ff.model, fulfillmentLocked: ff.locked,
            _source: 'cloud-mapping'
        };
    });

    // LTS filter (Over 90+ / Over 180+)
    if (ltsFilter === 'over90') rows = rows.filter(function (r) { return r.over90 > 0; });
    else if (ltsFilter === 'over180') rows = rows.filter(function (r) { return r.over180 > 0; });
    return rows;
}

// ========================================
// Demo Data Layer: Phase 2A - Inventory Mapping
// ========================================
function _getDemoReplenishmentData() {
    var country = document.getElementById('replenCountry')?.value || '';
    var marketplace = document.getElementById('replenMarketplace')?.value || '';
    var rows = window.KM.DemoData.getInventoryRows({});
    return rows.filter(function(r) {
        // Filter by selected country + marketplace
        if (country && r.country && r.country !== country) return false;
        if (marketplace && r.marketplace && r.marketplace !== marketplace) return false;
        return true;
    }).map(function(r) {
        var avgDaily = r.sales_30d > 0 ? (r.sales_30d / 30) : 0;
        var currentInv = r.fba_stock + r.third_wh_david + r.third_wh_winit;
        var onTheWay = r.overseas_on_way_18d + r.overseas_on_way_45d;
        var thirdParty = r.third_wh_david + r.third_wh_winit;
        var daysOfSupply = avgDaily > 0 ? (currentInv / avgDaily).toFixed(1) : '999';
        var forecast60d = Math.round(avgDaily * 60);
        var suggestedQty = Math.max(0, Math.round(avgDaily * 90 - currentInv - onTheWay));
        var needsAlert = parseFloat(daysOfSupply) < 18;
        return {
            sku: r.sku,
            lifecycle: r.warning_status === 'upcoming' ? 'New' : 'Mature',
            replenishmentModel: r.replenishment_model || 'sales_driven',
            company: 'Kitchen Mama',
            country: r.country || 'US',
            marketplace: r.marketplace,
            series: r.series || '',
            currentInventory: currentInv,
            onTheWay: onTheWay,
            thirdPartyStock: thirdParty,
            avgDailySales: avgDaily.toFixed(2),
            forecast60d: forecast60d,
            upcomingEventQty: null,
            daysOfSupply: daysOfSupply,
            needsAlert: needsAlert,
            suggestedQty: suggestedQty,
            cnStock: r.factory_youxin,
            twStock: r.factory_shengyi,
            unitsPerCarton: r.units_per_carton || 0,   // drives carton validation
            need18: 0,
            need30: 0,
            need45Plus: suggestedQty,
            // New AI Suggestion bucket structure (Phase 1: engine not implemented → 0)
            need0_18: 0, need19_30: 0, need31_45: 0, need46_90: 0,
            plannedQty: 0,
            note: r.recommendation || '',
            status: suggestedQty > 0 ? 'Need Restock' : 'Sufficient',
            productName: r.product_name,
            available: r.fba_stock,
            fcTransfer: 0,
            fcProcessing: 0,
            customerOrders: 0,
            unsellable: 0,
            over90: 0,
            over180: 0,
            winitStock: r.third_wh_winit,
            onusStock: r.third_wh_david,
            within18days: r.overseas_on_way_18d,
            within30days: 0,
            within45days: r.overseas_on_way_45d,
            lastWeek: Math.round(avgDaily * 7),
            salesTrend7d: [],
            fulfillmentModel: '', fulfillmentLocked: false
        };
    });
}

function _showDemoBadge() {
    var panel = document.querySelector('#ops-section .replen-control-panel');
    if (!panel) return;
    if (panel.querySelector('.demo-badge')) return;
    var badge = document.createElement('span');
    badge.className = 'demo-badge';
    badge.style.cssText = 'background:#8b5cf6;color:white;padding:2px 8px;border-radius:4px;font-size:11px;margin-left:12px;vertical-align:middle;';
    badge.textContent = 'Demo Data Mode';
    panel.appendChild(badge);
}

function _removeDemoBadge() {
    var badge = document.querySelector('#ops-section .demo-badge');
    if (badge) badge.remove();
}

// Patch renderReplenishment to show/hide badge
var _originalRenderReplenishment = renderReplenishment;
renderReplenishment = function() {
    _originalRenderReplenishment();
    if (window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled()) {
        _showDemoBadge();
    } else {
        _removeDemoBadge();
    }
};
window.renderReplenishment = renderReplenishment;

// Debug helper
// ========================================
// Edit SKU / Delete SKU
// ========================================

var _editSkuTarget = null;

function openEditSkuModal() {
    // Find selected SKU from current table (use first expanded or prompt user)
    var fixedRows = document.querySelectorAll('#ops-section .dual-layer-table:not(.ir-overview-table) .fixed-row');
    var selectedSku = null;
    fixedRows.forEach(function(row) {
        if (row.classList.contains('expanded')) selectedSku = row.dataset.sku;
    });
    if (!selectedSku) {
        // Prompt user to select
        var allSkus = Array.from(fixedRows).map(function(r) { return r.dataset.sku; }).filter(Boolean);
        if (allSkus.length === 0) { alert('No SKU data available. Please search first.'); return; }
        selectedSku = prompt('Enter SKU to edit (or expand a row first):\n\nAvailable: ' + allSkus.slice(0, 10).join(', ') + (allSkus.length > 10 ? '...' : ''));
        if (!selectedSku) return;
    }

    // Find the SKU in current data
    var data = getReplenishmentData();
    var item = data.find(function(d) { return d.sku === selectedSku; });
    if (!item) { alert('SKU not found in current results: ' + selectedSku); return; }

    // Also try to get marketplace_skus record for current values
    var mpSkus = (window.KM && window.KM.DB && window.KM.DB.getMarketplaceSkus) ? window.KM.DB.getMarketplaceSkus() : [];
    var mpRecord = mpSkus.find(function(mp) {
        return mp.sku === selectedSku && mp.country === (item.country || document.getElementById('replenCountry')?.value) && mp.marketplace === (item.marketplace || document.getElementById('replenMarketplace')?.value);
    });

    _editSkuTarget = {
        sku: selectedSku,
        country: item.country || document.getElementById('replenCountry')?.value || '',
        marketplace: item.marketplace || document.getElementById('replenMarketplace')?.value || '',
        marketplaceSkuId: mpRecord ? mpRecord.marketplaceSkuId : '',
        replenishmentModel: mpRecord ? mpRecord.replenishmentModel : 'sales_driven',
        marketplaceSkuStatus: mpRecord ? mpRecord.marketplaceSkuStatus : 'active',
        launchDate: mpRecord ? mpRecord.launchDate : '',
        fulfillmentModel: mpRecord ? mpRecord.fulfillmentModel : ''
    };

    // Populate modal
    document.getElementById('edit-sku-code').value = selectedSku;
    document.getElementById('edit-sku-site').value = _editSkuTarget.country + ' / ' + _editSkuTarget.marketplace;
    document.getElementById('edit-sku-model').value = _editSkuTarget.replenishmentModel || 'sales_driven';
    document.getElementById('edit-sku-status').value = _editSkuTarget.marketplaceSkuStatus || 'active';
    document.getElementById('edit-sku-launch-date').value = _editSkuTarget.launchDate || '';

    // Fulfillment Model with the same lock rule, resolved from the marketplace registry.
    var _mpReg = (window.KM && window.KM.DB && window.KM.DB.getMarketplaces ? window.KM.DB.getMarketplaces() : []).find(function(m) {
        if (mpRecord && mpRecord.marketplaceId && m.marketplaceId === mpRecord.marketplaceId) return true;
        return String(m.country || '').toLowerCase() === String(_editSkuTarget.country || '').toLowerCase()
            && String(m.marketplace || '').toLowerCase() === String(_editSkuTarget.marketplace || '').toLowerCase();
    });
    applyFulfillmentLock(
        document.getElementById('edit-sku-fulfillment'),
        document.getElementById('edit-sku-fulfillment-hint'),
        _mpReg ? _mpReg.fulfillmentModel : '',
        _editSkuTarget.fulfillmentModel
    );

    // Open modal
    var modal = document.getElementById('replen-edit-sku-modal');
    var overlay = document.getElementById('replen-modal-overlay');
    if (modal && overlay) {
        modal.classList.add('is-open');
        overlay.classList.add('is-open');
    }
}

function closeEditSkuModal() {
    var modal = document.getElementById('replen-edit-sku-modal');
    var overlay = document.getElementById('replen-modal-overlay');
    if (modal && overlay) {
        modal.classList.remove('is-open');
        overlay.classList.remove('is-open');
    }
    _editSkuTarget = null;
}

function saveEditSku() {
    if (!_editSkuTarget) { alert('No SKU selected'); return; }

    var model = document.getElementById('edit-sku-model').value;
    var status = document.getElementById('edit-sku-status').value;
    var launchDate = document.getElementById('edit-sku-launch-date').value;
    var fulfillmentModel = document.getElementById('edit-sku-fulfillment') ? document.getElementById('edit-sku-fulfillment').value : '';

    var payload = {
        marketplace_sku_id: _editSkuTarget.marketplaceSkuId,
        sku: _editSkuTarget.sku,
        country: _editSkuTarget.country,
        marketplace: _editSkuTarget.marketplace,
        replenishment_model: model,
        marketplace_sku_status: status,
        fulfillment_model: fulfillmentModel,
        launch_date: launchDate
    };

    if (window.KM && window.KM.DB && window.KM.DB.updateMarketplaceSkuModel) {
        window.KM.DB.updateMarketplaceSkuModel(payload).then(function(result) {
            if (result && result.success === false) {
                alert('Could not update SKU. ' + (result.error || 'Please check the API connection and try again.'));
                return;
            }
            alert('SKU updated successfully.');
            closeEditSkuModal();
            renderReplenishment();
        }).catch(function(err) {
            alert('Error: ' + err.message);
        });
    } else {
        alert('Cloud write not available. Edit saved locally only.');
        closeEditSkuModal();
    }
}

function handleDeleteSku() {
    alert('Delete SKU is not enabled yet.');
}

window.openEditSkuModal = openEditSkuModal;
window.closeEditSkuModal = closeEditSkuModal;
window.saveEditSku = saveEditSku;
window.handleDeleteSku = handleDeleteSku;

// ========================================
// Import SKU (CSV -> KM.DB.importMarketplaceSkusBatch)
// ========================================

// Marketplace-scoped import: user picks Country + Marketplace (display name); company/country/
// marketplace/currency/marketplace_id are resolved from the registry. CSV carries only
// sku, site_sku, replenishment_model.
var REPLEN_VALID_MODELS = ['sales_driven', 'forecast_driven'];
var _replenImportResolved = null; // { company, country, marketplace, marketplaceId, currency, displayName }

function _replenImportActiveMarketplaces() {
    var list = (window.KM && window.KM.DB && window.KM.DB.getMarketplaces) ? window.KM.DB.getMarketplaces() : [];
    return list.filter(function(m) { var s = (m.status || '').toLowerCase(); return !s || s === 'active'; });
}

function _replenImportRowValue(m) {
    return (m.marketplaceId && m.marketplaceId !== '') ? m.marketplaceId : (m.company + '|' + m.country + '|' + m.marketplace);
}

function _replenImportSetResolvedText(message, color) {
    var el = document.getElementById('replen-import-resolved');
    if (!el) return;
    el.style.color = color || '#475569';
    el.textContent = message;
}

function openReplenImportModal() {
    var modal = document.getElementById('replen-import-sku-modal');
    var overlay = document.getElementById('replen-modal-overlay');
    if (!modal || !overlay) return;

    var countrySel = document.getElementById('replen-import-country');
    if (countrySel) {
        var active = _replenImportActiveMarketplaces();
        var countries = [];
        active.forEach(function(m) { if (m.country && countries.indexOf(m.country) === -1) countries.push(m.country); });
        countries.sort();
        countrySel.innerHTML = '<option value="">Select Country</option>' +
            countries.map(function(c) { return '<option value="' + escapeReplenHtml(c) + '">' + escapeReplenHtml(c) + '</option>'; }).join('');
    }
    var mpSel = document.getElementById('replen-import-marketplace');
    if (mpSel) mpSel.innerHTML = '<option value="">Select Marketplace</option>';
    _replenImportResolved = null;
    _replenImportSetResolvedText('Select Country + Marketplace to resolve company/currency.', '#475569');

    var fileInput = document.getElementById('replen-import-file');
    if (fileInput) fileInput.value = '';
    var resultBox = document.getElementById('replen-import-result');
    if (resultBox) { resultBox.style.display = 'none'; resultBox.innerHTML = ''; }
    var runBtn = document.getElementById('replen-import-run-btn');
    if (runBtn) { runBtn.disabled = false; runBtn.textContent = 'Import'; }
    modal.classList.add('is-open');
    overlay.classList.add('is-open');
}

function closeReplenImportModal() {
    var modal = document.getElementById('replen-import-sku-modal');
    var overlay = document.getElementById('replen-modal-overlay');
    if (modal) modal.classList.remove('is-open');
    if (overlay) overlay.classList.remove('is-open');
}

function onReplenImportCountryChange() {
    var countrySel = document.getElementById('replen-import-country');
    var mpSel = document.getElementById('replen-import-marketplace');
    var country = countrySel ? countrySel.value : '';
    if (mpSel) {
        var active = _replenImportActiveMarketplaces();
        var rowsForCountry = active.filter(function(m) { return !country || m.country === country; });
        mpSel.innerHTML = '<option value="">Select Marketplace</option>' +
            rowsForCountry.map(function(m) {
                var val = _replenImportRowValue(m);
                var label = m.marketplaceDisplayName || m.marketplace || m.marketplaceId || val;
                return '<option value="' + escapeReplenHtml(val) + '">' + escapeReplenHtml(label) + '</option>';
            }).join('');
    }
    _replenImportResolved = null;
    _replenImportSetResolvedText('Select Country + Marketplace to resolve company/currency.', '#475569');
}

// Resolve exactly one active registry row by the selected option value (marketplace_id / composite key).
function _resolveReplenImportMarketplace() {
    _replenImportResolved = null;
    var mpSel = document.getElementById('replen-import-marketplace');
    var val = mpSel ? mpSel.value : '';
    if (!val) return { ok: false, error: 'Select Country and Marketplace.' };
    var matches = _replenImportActiveMarketplaces().filter(function(m) { return _replenImportRowValue(m) === val; });
    if (matches.length === 0) return { ok: false, error: 'Selected marketplace not found in the active registry.' };
    if (matches.length > 1) return { ok: false, error: 'Selected marketplace value is ambiguous in the registry.' };
    var m = matches[0];
    _replenImportResolved = {
        company: m.company,
        country: m.country,
        marketplace: m.marketplace,
        marketplaceId: m.marketplaceId || '',
        currency: m.currency || 'USD',
        fulfillmentModel: m.fulfillmentModel || '',
        displayName: m.marketplaceDisplayName || m.marketplace || (m.marketplaceId || '')
    };
    return { ok: true };
}

function onReplenImportMarketplaceChange() {
    var res = _resolveReplenImportMarketplace();
    if (_replenImportResolved) {
        var isHybrid = _replenImportResolved.fulfillmentModel === 'hybrid';
        _replenImportSetResolvedText(
            'Resolved → Company: ' + _replenImportResolved.company +
            ' | Country: ' + _replenImportResolved.country +
            ' | Marketplace: ' + (_replenImportResolved.displayName || _replenImportResolved.marketplace) +
            ' | Marketplace ID: ' + (_replenImportResolved.marketplaceId || '(none)') +
            ' | Currency: ' + _replenImportResolved.currency +
            ' | Fulfillment: ' + (_replenImportResolved.fulfillmentModel || '(unset)') +
            (isHybrid ? '  ⚠ Hybrid — CSV must include a fulfillment_model column (platform_fulfilled / self_fulfilled).' : ''),
            '#166534'
        );
    } else {
        _replenImportSetResolvedText((res && res.error) ? res.error : 'Select Country + Marketplace to resolve company/currency.', '#b91c1c');
    }
}

// Minimal RFC4180-ish CSV parser: handles quoted fields, escaped quotes, and CRLF/LF.
function parseReplenCsv(text) {
    var rows = [];
    var field = '', row = [], inQuotes = false;
    text = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    for (var i = 0; i < text.length; i++) {
        var c = text[i];
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; }
                else { inQuotes = false; }
            } else { field += c; }
        } else {
            if (c === '"') { inQuotes = true; }
            else if (c === ',') { row.push(field); field = ''; }
            else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
            else { field += c; }
        }
    }
    if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
    return rows;
}

// (csvRowsToImportObjects removed — Import SKU is now marketplace-scoped; parsing is inline in runReplenImport.)

function escapeReplenHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderReplenImportError(message) {
    var box = document.getElementById('replen-import-result');
    if (!box) { alert(message); return; }
    box.style.display = 'block';
    box.innerHTML = '<div class="replen-import__status replen-import__status--error">Error: ' + escapeReplenHtml(message) + '</div>';
}

function renderReplenImportResult(data) {
    var box = document.getElementById('replen-import-result');
    if (!box) return;
    var summary = data.summary || { total: 0, created: 0, updated: 0, skipped: 0, error: 0 };
    var results = data.results || [];

    var html = '<div class="replen-import__summary">' +
        '<span>Total: ' + summary.total + '</span>' +
        '<span class="replen-import__status--created">Created: ' + summary.created + '</span>' +
        '<span class="replen-import__status--updated">Updated: ' + summary.updated + '</span>' +
        '<span class="replen-import__status--skipped">Skipped: ' + summary.skipped + '</span>' +
        '<span class="replen-import__status--error">Error: ' + summary.error + '</span>' +
        '</div>';

    html += results.map(function(rr) {
        return '<div class="replen-import__row">' +
            '<span class="replen-import__status replen-import__status--' + escapeReplenHtml(rr.status) + '">' + escapeReplenHtml(rr.status) + '</span>' +
            '<span>#' + escapeReplenHtml(String(rr.rowIndex)) + '</span>' +
            '<span>' + escapeReplenHtml(rr.sku || '') + '</span>' +
            '<span>' + escapeReplenHtml(rr.message || '') + '</span>' +
            '</div>';
    }).join('');

    box.style.display = 'block';
    box.innerHTML = html;
}

function runReplenImport() {
    var res = _resolveReplenImportMarketplace();
    if (!_replenImportResolved) { renderReplenImportError((res && res.error) ? res.error : 'Select Country and Marketplace first.'); return; }

    var fileInput = document.getElementById('replen-import-file');
    var runBtn = document.getElementById('replen-import-run-btn');
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) { alert('Please choose a CSV file first.'); return; }
    if (!(window.KM && window.KM.DB && window.KM.DB.importMarketplaceSkusBatch)) { alert('Import API is not available.'); return; }

    var meta = _replenImportResolved;
    var file = fileInput.files[0];
    var reader = new FileReader();
    reader.onload = function(e) {
        var cells;
        try { cells = parseReplenCsv(e.target.result); } catch (err) { renderReplenImportError('Failed to parse CSV: ' + (err && err.message ? err.message : err)); return; }
        if (!cells || cells.length < 2) { renderReplenImportError('No data rows found (need a header row + at least one data row).'); return; }
        var headers = cells[0].map(function(h) { return String(h == null ? '' : h).trim().toLowerCase(); });
        var skuIdx = headers.indexOf('sku');
        var siteIdx = headers.indexOf('site_sku');
        var modelIdx = headers.indexOf('replenishment_model');
        var ffIdx = headers.indexOf('fulfillment_model');
        var isHybridImport = meta.fulfillmentModel === 'hybrid';
        if (skuIdx === -1 || siteIdx === -1) { renderReplenImportError('CSV must include "sku" and "site_sku" headers.'); return; }
        if (isHybridImport && ffIdx === -1) { renderReplenImportError('Hybrid marketplace requires a "fulfillment_model" column (platform_fulfilled / self_fulfilled).'); return; }

        var rows = [];
        var clientErrors = [];
        var dataRowNum = 0;
        for (var r = 1; r < cells.length; r++) {
            var raw = cells[r];
            var allEmpty = raw.every(function(v) { return String(v == null ? '' : v).trim() === ''; });
            if (allEmpty) continue;
            dataRowNum++;
            var sku = String(raw[skuIdx] == null ? '' : raw[skuIdx]).trim();
            var siteSku = String(raw[siteIdx] == null ? '' : raw[siteIdx]).trim();
            var model = modelIdx === -1 ? '' : String(raw[modelIdx] == null ? '' : raw[modelIdx]).trim();

            if (!sku) { clientErrors.push({ rowIndex: dataRowNum, sku: sku, status: 'error', message: 'SKU is required' }); continue; }
            if (!siteSku) { clientErrors.push({ rowIndex: dataRowNum, sku: sku, status: 'error', message: 'site_sku is required' }); continue; }
            if (model && REPLEN_VALID_MODELS.indexOf(model) === -1) {
                clientErrors.push({ rowIndex: dataRowNum, sku: sku, status: 'error', message: 'Invalid replenishment_model: "' + model + '" (use sales_driven or forecast_driven)' });
                continue;
            }

            // Fulfillment model: only consumed for Hybrid marketplaces (required there);
            // ignored for platform/self marketplaces (model is fixed by the marketplace).
            var ff = ffIdx === -1 ? '' : String(raw[ffIdx] == null ? '' : raw[ffIdx]).trim();
            if (isHybridImport) {
                if (!ff) { clientErrors.push({ rowIndex: dataRowNum, sku: sku, status: 'error', message: 'fulfillment_model required for Hybrid (platform_fulfilled / self_fulfilled)' }); continue; }
                if (ff !== 'platform_fulfilled' && ff !== 'self_fulfilled') { clientErrors.push({ rowIndex: dataRowNum, sku: sku, status: 'error', message: 'Invalid fulfillment_model: "' + ff + '" (use platform_fulfilled / self_fulfilled)' }); continue; }
            }

            rows.push({
                sku: sku,
                site_sku: siteSku,
                company: meta.company,
                country: meta.country,
                marketplace: meta.marketplace,
                marketplace_id: meta.marketplaceId,
                currency: meta.currency,
                marketplace_sku_status: 'active',
                replenishment_model: model || 'sales_driven',
                fulfillment_model: isHybridImport ? ff : '',
                asin: '',
                launch_date: ''
            });
        }

        if (rows.length === 0 && clientErrors.length === 0) { renderReplenImportError('No data rows found.'); return; }
        if (rows.length === 0) {
            // All rows rejected client-side; show errors, nothing sent to backend.
            renderReplenImportResult({ summary: { total: clientErrors.length, created: 0, updated: 0, skipped: 0, error: clientErrors.length }, results: clientErrors });
            return;
        }

        if (runBtn) { runBtn.disabled = true; runBtn.textContent = 'Importing...'; }
        window.KM.DB.importMarketplaceSkusBatch(rows, { priceStatusDefault: 'draft', forecastStatusDefault: 'draft' })
            .then(function(result) {
                if (runBtn) { runBtn.disabled = false; runBtn.textContent = 'Import'; }
                if (!result || result.success === false) {
                    renderReplenImportError(result && result.error ? result.error : 'Import failed. API may not be configured.');
                    return;
                }
                var data = result.data || {};
                var s = data.summary || { total: 0, created: 0, updated: 0, skipped: 0, error: 0 };
                var mergedSummary = {
                    total: (s.total || 0) + clientErrors.length,
                    created: s.created || 0,
                    updated: s.updated || 0,
                    skipped: s.skipped || 0,
                    error: (s.error || 0) + clientErrors.length
                };
                var mergedResults = clientErrors.concat(data.results || []);
                renderReplenImportResult({ summary: mergedSummary, results: mergedResults });
                // Refresh table after a successful import (wrapper already reloaded the DB cache).
                if (typeof renderReplenishment === 'function') renderReplenishment();
            })
            .catch(function(err) {
                if (runBtn) { runBtn.disabled = false; runBtn.textContent = 'Import'; }
                renderReplenImportError(err && err.message ? err.message : 'Import request failed.');
            });
    };
    reader.onerror = function() { renderReplenImportError('Could not read the selected file.'); };
    reader.readAsText(file);
}

function downloadReplenImportTemplate() {
    var res = _resolveReplenImportMarketplace();
    if (!_replenImportResolved) { alert('Please select Country and Marketplace first.' + (res && res.error ? ('\n' + res.error) : '')); return; }
    // Hybrid marketplace: template gains a fulfillment_model column (platform_fulfilled / self_fulfilled).
    // Non-hybrid: column is omitted (the SKU model is fixed by the marketplace).
    var isHybrid = _replenImportResolved.fulfillmentModel === 'hybrid';
    var headers = isHybrid ? 'sku,site_sku,replenishment_model,fulfillment_model' : 'sku,site_sku,replenishment_model';
    var sample = isHybrid ? 'SAMPLE-SKU,SAMPLE-SITE-SKU,sales_driven,platform_fulfilled' : 'SAMPLE-SKU,SAMPLE-SITE-SKU,sales_driven';
    var csv = headers + '\n' + sample + '\n';

    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'marketplace_skus_import_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

window.openReplenImportModal = openReplenImportModal;
window.closeReplenImportModal = closeReplenImportModal;
window.onReplenImportCountryChange = onReplenImportCountryChange;
window.onReplenImportMarketplaceChange = onReplenImportMarketplaceChange;
window.runReplenImport = runReplenImport;
window.downloadReplenImportTemplate = downloadReplenImportTemplate;

// Populate the main Country / Marketplace filters from the marketplaces registry
// (cloud mode only, non-destructive: keeps static options when registry is empty or in Demo mode).
function _replenDemoOn() {
    return !!(window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled());
}

function _replenActiveMarketplaces() {
    var list = (window.KM && window.KM.DB && window.KM.DB.getMarketplaces) ? window.KM.DB.getMarketplaces() : [];
    return list.filter(function(m) { var s = (m.status || '').toLowerCase(); return !s || s === 'active'; });
}

// Rebuild Country options from active marketplaces, constrained by the currently selected marketplace.
// Demo OFF only. Resets the current country selection if it is no longer valid.
function refreshReplenCountryOptions() {
    if (_replenDemoOn()) return;
    var countrySel = document.getElementById('replenCountry');
    var mpSel = document.getElementById('replenMarketplace');
    if (!countrySel) return;

    var active = _replenActiveMarketplaces();
    var selMarketplace = mpSel ? mpSel.value : '';
    var selCountry = countrySel.value;

    var countries = [];
    active.forEach(function(m) {
        if (!m.country) return;
        if (selMarketplace && m.marketplace !== selMarketplace) return;
        if (countries.indexOf(m.country) === -1) countries.push(m.country);
    });
    countries.sort();

    countrySel.innerHTML = '<option value="">Select Country</option>' +
        countries.map(function(c) { return '<option value="' + c + '">' + c + '</option>'; }).join('');
    countrySel.value = (selCountry && countries.indexOf(selCountry) !== -1) ? selCountry : '';
}

// Rebuild Marketplace options from active marketplaces, constrained by the currently selected country.
// Demo OFF only. Resets the current marketplace selection if it is no longer valid.
function refreshReplenMarketplaceOptions() {
    if (_replenDemoOn()) return;
    var countrySel = document.getElementById('replenCountry');
    var mpSel = document.getElementById('replenMarketplace');
    if (!mpSel) return;

    var active = _replenActiveMarketplaces();
    var selCountry = countrySel ? countrySel.value : '';
    var selMarketplace = mpSel.value;

    // Build { value: canonical key, label: display name } options; dedupe by value+label pair so
    // distinct display names for the same key are kept (never collapsed on key alone).
    var opts = [], seenPair = {}, keys = [];
    active.forEach(function(m) {
        if (!m.marketplace) return;
        if (selCountry && m.country !== selCountry) return;
        var value = m.marketplace;
        var label = m.marketplaceDisplayName || m.marketplace;
        var k = value + '||' + label;
        if (seenPair[k]) return; seenPair[k] = 1;
        if (keys.indexOf(value) === -1) keys.push(value);
        opts.push({ value: value, label: label });
    });
    opts.sort(function(a, b) { return a.label.localeCompare(b.label); });

    mpSel.innerHTML = '<option value="">Select Marketplace</option>' +
        opts.map(function(o) { return '<option value="' + o.value + '">' + o.label + '</option>'; }).join('');
    // Keep the current selection if its canonical key is still present.
    mpSel.value = (selMarketplace && keys.indexOf(selMarketplace) !== -1) ? selMarketplace : '';
}

// Resolve a canonical marketplace key to its display label (marketplace_display_name if present,
// else the key). Optionally disambiguate by company + country.
function _replenMarketplaceLabel(key, company, country) {
    key = String(key == null ? '' : key).trim();
    if (!key) return '';
    var list = (window.KM && window.KM.DB && window.KM.DB.getMarketplaces) ? window.KM.DB.getMarketplaces() : [];
    function up(v){ return String(v == null ? '' : v).trim().toUpperCase(); }
    var exact = list.filter(function(m){ return up(m.marketplace) === up(key) &&
        (!company || up(m.company) === up(company)) && (!country || up(m.country) === up(country)) &&
        m.marketplaceDisplayName; })[0];
    if (exact) return exact.marketplaceDisplayName;
    var any = list.filter(function(m){ return up(m.marketplace) === up(key) && m.marketplaceDisplayName; })[0];
    return any ? any.marketplaceDisplayName : key;
}
window._replenMarketplaceLabel = _replenMarketplaceLabel;

// Full (initial) population of both filters from the registry. Demo OFF only;
// in Demo mode this is a no-op so the static demo options/behavior are preserved.
function populateReplenFiltersFromRegistry() {
    if (_replenDemoOn()) return;
    refreshReplenCountryOptions();
    refreshReplenMarketplaceOptions();
}

// Bind bidirectional dependency handlers. Idempotent (onchange property assignment).
function bindReplenFilterDependencies() {
    var countrySel = document.getElementById('replenCountry');
    var mpSel = document.getElementById('replenMarketplace');
    if (countrySel) {
        countrySel.onchange = function() {
            // Context (Country) changed → discard the Shipping Allocation Working Draft (both modes).
            _clearAllocationDraft();
            if (_replenDemoOn()) return;
            // Country changed -> refresh marketplace options (resets marketplace if now invalid).
            refreshReplenMarketplaceOptions();
        };
    }
    if (mpSel) {
        mpSel.onchange = function() {
            // Context (Marketplace) changed → discard the Shipping Allocation Working Draft (both modes).
            _clearAllocationDraft();
            if (_replenDemoOn()) return;
            // Marketplace changed -> refresh country options (resets country if now invalid).
            refreshReplenCountryOptions();
        };
    }
}

window.populateReplenFiltersFromRegistry = populateReplenFiltersFromRegistry;
window.refreshReplenCountryOptions = refreshReplenCountryOptions;
window.refreshReplenMarketplaceOptions = refreshReplenMarketplaceOptions;
window.bindReplenFilterDependencies = bindReplenFilterDependencies;

window.debugInventoryDemoData = function() {
    var enabled = window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled();
    console.log('=== Inventory Demo Data Debug ===');
    console.log('Demo enabled:', enabled);
    if (!enabled) { console.log('Demo mode is OFF. Use setDemoDataMode(true) to enable.'); return; }
    var rows = window.KM.DemoData.getInventoryRows({});
    console.log('DemoData inventory rows:', rows.length);
    var mapped = _getDemoReplenishmentData();
    console.log('Mapped replenishment rows:', mapped.length);
    console.log('--- First 5 demo rows ---');
    console.table(rows.slice(0, 5));
    console.log('--- First 10 mapped rows ---');
    console.table(mapped.slice(0, 10));
};

// ========================================
// Lifecycle 註冊
// ========================================
// Ensure the Inventory Replenishment markup is present before initialization runs.
// Idempotent: if #ops-section already exists, resolves immediately (no re-fetch, no
// duplicate). Loads the partial via KM.partialLoader; on any failure it warns and resolves (never throws).
function _ensureInventoryReplenishmentMarkup() {
    if (document.getElementById('ops-section')) {
        return Promise.resolve(true);
    }
    if (window.KM && window.KM.partialLoader && window.KM.partialLoader.loadPartial) {
        return window.KM.partialLoader
            .loadPartial('inventory-replenishment', 'assets/html/pages/inventory-replenishment.html', '#inventory-replenishment-mount')
            .then(function() {
                if (!document.getElementById('ops-section')) {
                    console.warn('[Replenishment] partial loaded but #ops-section not found');
                }
                return true;
            })
            .catch(function(err) {
                console.warn('[Replenishment] failed to load partial:', err);
                return false;
            });
    }
    console.warn('[Replenishment] KM.partialLoader unavailable; markup not loaded.');
    return Promise.resolve(false);
}

// KM Sticky Header Framework binding for the Inventory Replenishment main table.
// The sticky control panel (.replen-control-panel) sits above the main table's two-layer header;
// its height varies (it wraps taller on small screens), so we measure it live and write
// --km-sticky-top-base onto #opsSection. The main table header (.table-header-bar) pins at that
// variable — replacing the old hard-coded top:72px that let the taller/wrapping panel cover the
// Current Stock / On the Way / Avg. Sales/day row. Reusable helper: KM.stickyHeader (core).
var _replenStickyHeaderHandle = null;
function _bindReplenStickyHeader() {
    if (!(window.KM && window.KM.stickyHeader && window.KM.stickyHeader.bindToolbar)) return;
    var root = document.getElementById('opsSection');            // .page-inventory (var scope)
    var toolbar = document.querySelector('#ops-section .replen-control-panel');
    if (!root || !toolbar) return;
    if (_replenStickyHeaderHandle && _replenStickyHeaderHandle.destroy) {
        _replenStickyHeaderHandle.destroy();
    }
    _replenStickyHeaderHandle = window.KM.stickyHeader.bindToolbar(root, toolbar);
}

// One-time wiring of the modal-overlay close listener + overview scroll sync. These bind plain
// (non-cloneNode) listeners, so they must run EXACTLY once. Markup is partial-loaded (Phase 3-12),
// so this is a safe no-op until #ops-section exists; mount calls it again once the partial is present.
var _invReplenStaticInitDone = false;
function _inventoryReplenStaticInit() {
    if (_invReplenStaticInitDone) return;
    if (!document.getElementById('ops-section')) return;
    var overlay = document.getElementById('replen-modal-overlay');
    if (overlay) {
        overlay.addEventListener('click', function() {
            closeReplenModal();
            closeAddMarketplaceModal();
            closeEditSkuModal();
            closeReplenImportModal();
        });
    }
    if (typeof syncIrOverviewScroll === 'function') syncIrOverviewScroll();
    _invReplenStaticInitDone = true;
}

if (window.KM && window.KM.lifecycle) {
    KM.lifecycle.register('ops-section', {
        mount() {
            console.log('[Replenishment] mount');
            // Markup is partial-loaded (Phase 3-12). Ensure it exists, then (re)apply the .active
            // class (showSection ran before the async injection on first open), wire the once-only
            // listeners, and run the existing initialization unchanged.
            _ensureInventoryReplenishmentMarkup().then(function() {
                var sec = document.getElementById('ops-section');
                if (sec) sec.classList.add('active');
                _inventoryReplenStaticInit();
                // KM Sticky Header Framework: drive --km-sticky-top-base from the sticky control
                // panel's LIVE height (it wraps taller on small screens), so the main table's
                // two-layer header pins right below it instead of being covered (hard-coded top:72px bug).
                _bindReplenStickyHeader();
                // Recovery: restore the Shipping Allocation Working Draft from sessionStorage (live
                // JS State). It is applied per-SKU only when the active Country/Marketplace context
                // matches the stored context (see _allocationDraftRowsFor); otherwise it stays dormant.
                _restoreAllocationDraftFromSession();
                if (typeof bindReplenFilterDependencies === 'function') bindReplenFilterDependencies();
                if (typeof populateReplenFiltersFromRegistry === 'function') populateReplenFiltersFromRegistry();
                renderReplenishment();
            });
        },
        unmount() {
            console.log('[Replenishment] unmount');
            // Release the sticky-header toolbar observer (ResizeObserver + resize listener).
            if (_replenStickyHeaderHandle && _replenStickyHeaderHandle.destroy) {
                _replenStickyHeaderHandle.destroy();
                _replenStickyHeaderHandle = null;
            }
            // 清理展開面板中的 Chart.js 實例
            var expandPanels = document.querySelectorAll('#ops-section .replen-expand-panel');
            expandPanels.forEach(function(panel) { panel.remove(); });
            currentExpandedRow = null;
            // 清理 scroll sync
            var scrollCol = document.querySelector('#ops-section .scroll-col');
            if (scrollCol && scrollCol._syncHandler) {
                scrollCol.removeEventListener('scroll', scrollCol._syncHandler);
            }
        }
    });
}
