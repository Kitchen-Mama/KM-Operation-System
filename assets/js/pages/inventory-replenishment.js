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
  var mpId = opt ? (opt.value || '') : '';
  setSelectValueEnsureOption(document.getElementById('replen-add-company'), company);
  setSelectValueEnsureOption(document.getElementById('replen-add-country'), country);
  setSelectValueEnsureOption(document.getElementById('replen-add-currency'), currency);
  var idEl = document.getElementById('replen-add-marketplace-id');
  if (idEl) idEl.value = mpId;
}

window.populateReplenAddSkuMarketplaces = populateReplenAddSkuMarketplaces;
window.onReplenAddMarketplaceChange = onReplenAddMarketplaceChange;

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
    // Demo OFF: search-triggered loading from KM.DB.getMarketplaceSkus()
    var country = document.getElementById('replenCountry').value;
    var marketplace = document.getElementById('replenMarketplace').value;
    if (!country || !marketplace) {
        return []; // No search yet - show empty state
    }
    var mpSkus = (window.KM && window.KM.DB && window.KM.DB.getMarketplaceSkus) ? window.KM.DB.getMarketplaceSkus() : [];
    if (mpSkus.length === 0) return [];
    var filtered = mpSkus.filter(function(mp) {
        return mp.country === country && mp.marketplace === marketplace;
    });
    return filtered.map(function(mp) {
        return {
            sku: mp.sku,
            lifecycle: '--',
            replenishmentModel: mp.replenishmentModel || 'sales_driven',
            company: '--',
            country: mp.country,
            marketplace: mp.marketplace,
            currentInventory: 0,
            onTheWay: 0,
            thirdPartyStock: 0,
            avgDailySales: '0.00',
            forecast60d: 0,
            upcomingEventQty: null,
            daysOfSupply: '--',
            needsAlert: false,
            suggestedQty: 0,
            cnStock: 0,
            twStock: 0,
            need18: 0,
            need30: 0,
            need45Plus: 0,
            plannedQty: 0,
            note: 'Cloud read only - sales data pending',
            status: 'Pending Data',
            productName: mp.siteSku || mp.sku,
            _source: 'marketplace_skus'
        };
    });
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

function renderReplenishment() {
    const data = getReplenishmentData();
    const fixedBody = document.getElementById('replenFixedBody');
    const scrollBody = document.getElementById('replenScrollBody');
    
    if (!fixedBody || !scrollBody) return;
    
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
            <div class="scroll-cell">${item.marketplace}</div>
            <div class="scroll-cell">${item.currentInventory}</div>
            <div class="scroll-cell">${item.onTheWay}</div>
            <div class="scroll-cell">${item.thirdPartyStock}</div>
            <div class="scroll-cell">${item.avgDailySales}</div>
            <div class="scroll-cell">${item.forecast60d}</div>
            <div class="scroll-cell">${item.upcomingEventQty !== null ? item.upcomingEventQty : '-'}</div>
            <div class="scroll-cell${item.needsAlert ? ' alert-red' : ''}">${item.daysOfSupply}</div>
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
                <span class="ai-action-cell__text">View AI recommendation</span>
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
                <div class="ir-panel ir-panel--inventory-group">
                    <section class="replen-expand-section--inventory">
                        <div class="replen-card-grid">
                            <article class="replen-card replen-card--stock">
                                <h4 class="replen-card__title">Stock</h4>
                                <div class="replen-card__row"><span class="replen-card__label">Available</span><span class="replen-card__value">${skuData?.available || 0}</span></div>
                                <div class="replen-card__row"><span class="replen-card__label">FC Transfer</span><span class="replen-card__value">${skuData?.fcTransfer || 0}</span></div>
                                <div class="replen-card__row"><span class="replen-card__label">FC Processing</span><span class="replen-card__value">${skuData?.fcProcessing || 0}</span></div>
                                <div class="replen-card__row"><span class="replen-card__label">C Orders</span><span class="replen-card__value">10</span></div>
                            </article>
                            <article class="replen-card replen-card--lts">
                                <h4 class="replen-card__title">Long Term Storage</h4>
                                <div class="replen-card__row"><span class="replen-card__label">Over 90+</span><span class="replen-card__value">${cachedExpandData[sku]?.over90 || 0}</span></div>
                                <div class="replen-card__row"><span class="replen-card__label">Over 180+</span><span class="replen-card__value">${cachedExpandData[sku]?.over180 || 0}</span></div>
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
                <div class="ir-panel-column">
                    <article class="ir-panel replen-card replen-card--sales-trend">
                        <h4 class="replen-card__title">Sales Trend (Past Week)</h4>
                        <canvas id="sales-trend-chart-${sku}" style="max-height: 100px;"></canvas>
                    </article>
                    <article class="ir-panel replen-card replen-card--achievement">
                        <h4 class="replen-card__title">Achievement Rate (Past 3 Months)</h4>
                        <canvas id="achievement-chart-${sku}" style="max-height: 100px;"></canvas>
                    </article>
                </div>
                <div class="ir-panel-column">
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
                <article class="ir-panel replen-card--suggestion-allocation">
                    <div class="replen-card replen-card--ai-suggestion">
                        <h4 class="replen-card__title">AI Suggestion (Stage 1 Basic)</h4>
                        <div class="replen-card__row"><span class="replen-card__label">18天內 Need</span><span class="replen-card__value">${skuData?.need18 || 0}</span></div>
                        <div class="replen-card__row"><span class="replen-card__label">30天內 Need</span><span class="replen-card__value">${skuData?.need30 || 0}</span></div>
                        <div class="replen-card__row"><span class="replen-card__label">30天以上 Need</span><span class="replen-card__value">${skuData?.need45Plus || 0}</span></div>
                        <div class="replen-card__row" style="border-top: 1px solid var(--border-light); margin-top: 4px; padding-top: 4px; font-weight: 600;"><span class="replen-card__label">Total</span><span class="replen-card__value">${skuData?.suggestedQty || 0}</span></div>
                    </div>
                    <div class="replen-card replen-card--shipping-allocation" id="shipping-allocation-${sku}" style="margin-top: 12px;">
                        <h4 class="replen-card__title">Shipping Allocation</h4>
                        <div class="replen-card__row">
                            <select class="replen-card__select" onchange="addShippingMethod(event, '${sku}')" onclick="event.stopPropagation()">
                                <option value="">+ Add Method</option>
                                <option value="Air Freight">Air Freight</option>
                                <option value="Sea Freight">Sea Freight</option>
                                <option value="Express">Express</option>
                                <option value="Rail Freight">Rail Freight</option>
                            </select>
                        </div>
                        <div id="shipping-methods-${sku}" class="shipping-methods-list"></div>
                        <div class="replen-card__summary" style="border-top: 1px solid var(--border-light); margin-top: 4px; padding-top: 4px; display: flex; justify-content: space-between; font-weight: 600;">
                            <span class="replen-card__summary-label">Total</span>
                            <span class="replen-card__summary-value" id="allocation-total-${sku}">0</span>
                        </div>
                        <div class="replen-card__hint" id="allocation-hint-${sku}" style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Factory Stock Available</div>
                    </div>
                </article>
                <article class="ir-panel replen-card replen-card--shipping-plan">
                    <h4 class="replen-card__title">Shipping Plan Suggestions <span style="font-size: 10px; color: #94A3B8;">(Stage 2)</span></h4>
                    <div class="replen-card__placeholder" style="padding: 16px; text-align: center; color: #94A3B8; font-size: 12px; border: 1px dashed #E2E8F0; border-radius: 4px;">
                        Multi-method shipping optimization<br/>will be available in Stage 2
                    </div>
                </article>
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
        
        // Auto-populate Shipping Allocation based on AI Suggestion
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
    
    // 檢查所有 SKU 的 Shipping Allocation
    data.forEach(item => {
        const methodsList = document.getElementById(`shipping-methods-${item.sku}`);
        
        if (methodsList) {
            // SKU 已展開，收集實際填寫的數值
            const inputs = methodsList.querySelectorAll('input[type="number"]');
            inputs.forEach(input => {
                const method = input.dataset.method;
                const qty = parseInt(input.value) || 0;
                
                if (qty > 0 && method) {
                    if (!shippingPlans[method]) {
                        shippingPlans[method] = [];
                    }
                    shippingPlans[method].push({
                        sku: item.sku,
                        qty: qty,
                        skuData: item
                    });
                }
            });
        } else {
            // SKU 未展開，使用 AI Suggestion 預設分配（僅 US-Amazon）
            if (country === 'US' && marketplace === 'amazon') {
                const mockData = replenishmentMockData.find(m => m.sku === item.sku);
                const unitsPerCarton = mockData?.unitsPerCarton || 40;
                
                if (item.need18 > 0) {
                    const roundedQty = Math.ceil(item.need18 / unitsPerCarton) * unitsPerCarton;
                    if (!shippingPlans['Air Freight']) shippingPlans['Air Freight'] = [];
                    shippingPlans['Air Freight'].push({ 
                        sku: item.sku, 
                        qty: roundedQty,
                        skuData: item
                    });
                }
                if (item.need30 > 0) {
                    const roundedQty = Math.ceil(item.need30 / unitsPerCarton) * unitsPerCarton;
                    if (!shippingPlans['Private Ship']) shippingPlans['Private Ship'] = [];
                    shippingPlans['Private Ship'].push({ 
                        sku: item.sku, 
                        qty: roundedQty,
                        skuData: item
                    });
                }
                if (item.need45Plus > 0) {
                    const roundedQty = Math.ceil(item.need45Plus / unitsPerCarton) * unitsPerCarton;
                    if (!shippingPlans['AGL Ship']) shippingPlans['AGL Ship'] = [];
                    shippingPlans['AGL Ship'].push({ 
                        sku: item.sku, 
                        qty: roundedQty,
                        skuData: item
                    });
                }
            }
        }
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
    
    // 讀取現有資料
    let allPlans = [];
    const existingData = sessionStorage.getItem('allShippingPlans');
    if (existingData) {
        allPlans = JSON.parse(existingData);
    }
    
    // 新增本次提交的資料（每個 method 獨立 status 和 note）
    const newPlan = {
        id: Date.now(),
        date: new Date().toISOString().split('T')[0],
        country: country,
        marketplace: marketplace,
        targetDays: targetDays,
        plans: shippingPlans,
        status: {},
        notes: {}
    };
    
    // 為每個 method 初始化 status 和 notes（notes 改為陣列）
    Object.keys(shippingPlans).forEach(method => {
        newPlan.status[method] = 'draft';
        newPlan.notes[method] = [];
    });
    allPlans.push(newPlan);
    
    // 儲存累積的資料
    sessionStorage.setItem('allShippingPlans', JSON.stringify(allPlans));
    console.log('Saved to sessionStorage:', allPlans);
    
    // 顯示推送結果
    alert(`推送成功！\n總 SKU 數: ${totalSkus}\n總運輸方式: ${Object.keys(shippingPlans).length}`);
    
    // 導向 Shipping Plan 頁面
    showSection('shippingplan');
    
    // 延遲渲染確保 DOM 已顯示
    setTimeout(() => {
        renderShippingPlan();
    }, 100);
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
            const allocationCard = document.getElementById(`shipping-allocation-${sku}`);
            if (allocationCard) {
                allocationCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
}

function updateShippingAllocationTotal(sku) {
    const methodsList = document.getElementById(`shipping-methods-${sku}`);
    if (!methodsList) return;
    
    const inputs = methodsList.querySelectorAll('input[type="number"]');
    let total = 0;
    inputs.forEach(input => {
        total += parseInt(input.value) || 0;
    });
    
    const totalSpan = document.getElementById(`allocation-total-${sku}`);
    const hintDiv = document.getElementById(`allocation-hint-${sku}`);
    
    if (totalSpan) totalSpan.textContent = total;
    
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

function addShippingMethod(event, sku) {
    const select = event.target;
    const method = select.value;
    if (!method) return;
    
    const methodsList = document.getElementById(`shipping-methods-${sku}`);
    if (!methodsList) return;
    
    const methodRow = document.createElement('div');
    methodRow.className = 'replen-card__row';
    methodRow.innerHTML = `
        <span class="replen-card__label">${method}</span>
        <input class="replen-card__input" type="number" value="0" 
               oninput="updateShippingAllocationTotal('${sku}')" 
               onclick="event.stopPropagation()" 
               data-method="${method}">
        <button class="replen-card__remove-btn" 
                onclick="removeShippingMethod(event, '${sku}')" 
                title="Remove">×</button>
    `;
    
    methodsList.appendChild(methodRow);
    select.value = '';
    updateShippingAllocationTotal(sku);
    syncExpandPanelHeight(sku);
}

function removeShippingMethod(event, sku) {
    event.stopPropagation();
    const row = event.target.closest('.replen-card__row');
    if (row) {
        row.remove();
        updateShippingAllocationTotal(sku);
        syncExpandPanelHeight(sku);
    }
}

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

window.addShippingMethod = addShippingMethod;
window.removeShippingMethod = removeShippingMethod;

function initializeShippingAllocation(sku, skuData) {
    const marketplace = document.getElementById('replenMarketplace').value;
    const country = document.getElementById('replenCountry').value;
    const methodsList = document.getElementById(`shipping-methods-${sku}`);
    
    if (!methodsList || !skuData) return;
    
    // US-Amazon 預設規則
    if (country === 'US' && marketplace === 'amazon') {
        if (skuData.need18 > 0) {
            addPredefinedMethod(sku, 'Air Freight', skuData.need18);
        }
        if (skuData.need30 > 0) {
            addPredefinedMethod(sku, 'Private Ship', skuData.need30);
        }
        if (skuData.need45Plus > 0) {
            addPredefinedMethod(sku, 'AGL Ship', skuData.need45Plus);
        }
    }
    
    updateShippingAllocationTotal(sku);
}

function addPredefinedMethod(sku, method, quantity) {
    const methodsList = document.getElementById(`shipping-methods-${sku}`);
    if (!methodsList) return;
    
    // 進位到整箱數量
    const mockData = replenishmentMockData.find(m => m.sku === sku);
    const unitsPerCarton = mockData?.unitsPerCarton || 40;
    const roundedQty = quantity > 0 ? Math.ceil(quantity / unitsPerCarton) * unitsPerCarton : 0;
    
    const methodRow = document.createElement('div');
    methodRow.className = 'replen-card__row';
    methodRow.innerHTML = `
        <span class="replen-card__label">${method}</span>
        <input class="replen-card__input" type="number" value="${roundedQty}" 
               oninput="updateShippingAllocationTotal('${sku}')" 
               onclick="event.stopPropagation()" 
               data-method="${method}">
        <button class="replen-card__remove-btn" 
                onclick="removeShippingMethod(event, '${sku}')" 
                title="Remove">×</button>
    `;
    
    methodsList.appendChild(methodRow);
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
    
    // Generate past 7 days data
    for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        labels.push(`${date.getMonth() + 1}/${date.getDate()}`);
        
        // Generate random sales data based on SKU
        const baseValue = skuData.lastWeek / 7;
        const variance = baseValue * 0.3;
        data.push(Math.round(baseValue + (Math.random() - 0.5) * variance));
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
}

function saveMarketplace() {
    const country = document.getElementById('add-mp-country').value;
    const company = document.getElementById('add-mp-company').value;
    const marketplace = document.getElementById('add-mp-marketplace').value.trim();
    const curEl = document.getElementById('add-mp-currency');
    const currency = curEl ? curEl.value : 'USD';
    const dnEl = document.getElementById('add-mp-display-name');
    const displayName = dnEl ? dnEl.value.trim() : '';

    if (!marketplace) { alert('Please enter marketplace name'); return; }
    if (!company || !country) { alert('Company and Country are required'); return; }
    if (!currency) { alert('Currency is required'); return; }

    if (!(window.KM && window.KM.DB && window.KM.DB.upsertMarketplace)) {
        alert('Marketplace API is not available.');
        return;
    }

    window.KM.DB.upsertMarketplace({
        company: company,
        country: country,
        marketplace: marketplace,
        marketplace_display_name: displayName || marketplace,
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
            need18: 0,
            need30: 0,
            need45Plus: suggestedQty,
            plannedQty: 0,
            note: r.recommendation || '',
            status: suggestedQty > 0 ? 'Need Restock' : 'Sufficient',
            productName: r.product_name,
            available: r.fba_stock,
            fcTransfer: 0,
            fcProcessing: 0,
            winitStock: r.third_wh_winit,
            onusStock: r.third_wh_david,
            within18days: r.overseas_on_way_18d,
            within30days: 0,
            within45days: r.overseas_on_way_45d,
            lastWeek: Math.round(avgDaily * 7)
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
        launchDate: mpRecord ? mpRecord.launchDate : ''
    };

    // Populate modal
    document.getElementById('edit-sku-code').value = selectedSku;
    document.getElementById('edit-sku-site').value = _editSkuTarget.country + ' / ' + _editSkuTarget.marketplace;
    document.getElementById('edit-sku-model').value = _editSkuTarget.replenishmentModel || 'sales_driven';
    document.getElementById('edit-sku-status').value = _editSkuTarget.marketplaceSkuStatus || 'active';
    document.getElementById('edit-sku-launch-date').value = _editSkuTarget.launchDate || '';

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

    var payload = {
        marketplace_sku_id: _editSkuTarget.marketplaceSkuId,
        sku: _editSkuTarget.sku,
        country: _editSkuTarget.country,
        marketplace: _editSkuTarget.marketplace,
        replenishment_model: model,
        marketplace_sku_status: status,
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
        displayName: m.marketplaceDisplayName || m.marketplace || (m.marketplaceId || '')
    };
    return { ok: true };
}

function onReplenImportMarketplaceChange() {
    var res = _resolveReplenImportMarketplace();
    if (_replenImportResolved) {
        _replenImportSetResolvedText(
            'Resolved → Company: ' + _replenImportResolved.company +
            ' | Country: ' + _replenImportResolved.country +
            ' | Marketplace: ' + (_replenImportResolved.displayName || _replenImportResolved.marketplace) +
            ' | Marketplace ID: ' + (_replenImportResolved.marketplaceId || '(none)') +
            ' | Currency: ' + _replenImportResolved.currency,
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
        if (skuIdx === -1 || siteIdx === -1) { renderReplenImportError('CSV must include "sku" and "site_sku" headers.'); return; }

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
    var headers = 'sku,site_sku,replenishment_model';
    var sample = 'SAMPLE-SKU,SAMPLE-SITE-SKU,sales_driven';
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

    var mps = [];
    active.forEach(function(m) {
        if (!m.marketplace) return;
        if (selCountry && m.country !== selCountry) return;
        if (mps.indexOf(m.marketplace) === -1) mps.push(m.marketplace);
    });
    mps.sort();

    mpSel.innerHTML = '<option value="">Select Marketplace</option>' +
        mps.map(function(m) { return '<option value="' + m + '">' + m + '</option>'; }).join('');
    mpSel.value = (selMarketplace && mps.indexOf(selMarketplace) !== -1) ? selMarketplace : '';
}

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
            if (_replenDemoOn()) return;
            // Country changed -> refresh marketplace options (resets marketplace if now invalid).
            refreshReplenMarketplaceOptions();
        };
    }
    if (mpSel) {
        mpSel.onchange = function() {
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
                if (typeof bindReplenFilterDependencies === 'function') bindReplenFilterDependencies();
                if (typeof populateReplenFiltersFromRegistry === 'function') populateReplenFiltersFromRegistry();
                renderReplenishment();
            });
        },
        unmount() {
            console.log('[Replenishment] unmount');
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
