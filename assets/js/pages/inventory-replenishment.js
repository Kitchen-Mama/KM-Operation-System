// Inventory Replenishment - Add SKU Modal

function openReplenAddSkuModal() {
  const modal = document.getElementById('replen-add-sku-modal');
  const overlay = document.getElementById('replen-modal-overlay');
  
  if (!modal || !overlay) return;
  
  const currentCountry = document.getElementById('replenCountry')?.value;
  const currentMarketplace = document.getElementById('replenMarketplace')?.value;
  
  const countrySelect = document.getElementById('replen-add-country');
  const marketplaceSelect = document.getElementById('replen-add-marketplace');
  
  if (countrySelect) {
    countrySelect.innerHTML = '';
    const countryFilter = document.getElementById('replenCountry');
    if (countryFilter) {
      Array.from(countryFilter.options).forEach(option => {
        const newOption = document.createElement('option');
        newOption.value = option.value;
        newOption.textContent = option.textContent;
        countrySelect.appendChild(newOption);
      });
    }
    if (currentCountry) countrySelect.value = currentCountry;
  }
  
  if (marketplaceSelect) {
    marketplaceSelect.innerHTML = '';
    const marketplaceFilter = document.getElementById('replenMarketplace');
    if (marketplaceFilter) {
      Array.from(marketplaceFilter.options).forEach(option => {
        const newOption = document.createElement('option');
        newOption.value = option.value;
        newOption.textContent = option.textContent;
        marketplaceSelect.appendChild(newOption);
      });
    }
    if (currentMarketplace) marketplaceSelect.value = currentMarketplace;
  }
  
  modal.classList.add('is-open');
  overlay.classList.add('is-open');
}

function closeReplenModal() {
  const modal = document.getElementById('replen-add-sku-modal');
  const overlay = document.getElementById('replen-modal-overlay');
  
  if (!modal || !overlay) return;
  
  modal.classList.remove('is-open');
  overlay.classList.remove('is-open');
  
  const skuInput = document.getElementById('replen-add-sku');
  if (skuInput) skuInput.value = '';
}

function saveReplenSku() {
  const sku = document.getElementById('replen-add-sku')?.value.trim();
  const country = document.getElementById('replen-add-country')?.value;
  const marketplace = document.getElementById('replen-add-marketplace')?.value;
  const status = document.getElementById('replen-add-status')?.value;
  
  if (!sku) {
    alert('SKU is required');
    return;
  }
  
  if (!window.replenishmentData) {
    alert('Data not loaded');
    return;
  }
  
  const exists = replenishmentData.some(item => 
    item.sku === sku && 
    item.country === country && 
    item.marketplace === marketplace
  );
  
  if (exists) {
    alert(`SKU "${sku}" already exists for ${country} - ${marketplace}`);
    return;
  }
  
  const newItem = {
    sku: sku,
    country: country,
    marketplace: marketplace,
    status: status,
    currentStock: 0,
    onTheWay: 0,
    thirdPartyStock: 0,
    avgSalesPerDay: 0,
    fc60Days: 0,
    upcomingEvent: '',
    daysOfSupply: 0,
    suggestedQty: 0,
    plannedQty: 0,
    cnStock: 0,
    twStock: 0
  };
  
  replenishmentData.push(newItem);
  
  if (typeof renderReplenishment === 'function') {
    renderReplenishment();
  }
  
  closeReplenModal();
  
  alert(`SKU "${sku}" added successfully to ${country} - ${marketplace}`);
}

document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('replen-modal-overlay');
  if (overlay) {
    overlay.addEventListener('click', closeReplenModal);
  }
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
            <div class="scroll-cell" style="width:90px;"><span class="ir-overview__badge ir-overview__badge--${d.warning}">${warningLabel[d.warning]}</span></div>
            <div class="scroll-cell" style="width:90px;">${d.d1}</div>
            <div class="scroll-cell" style="width:90px;">${d.d7.toLocaleString()}</div>
            <div class="scroll-cell" style="width:90px;">${d.d30.toLocaleString()}</div>
            <div class="scroll-cell" style="width:90px;">${d.d90.toLocaleString()}</div>
            <div class="scroll-cell" style="width:90px;">${d.fba.toLocaleString()}</div>
            <div class="scroll-cell" style="width:90px;">${d.david.toLocaleString()}</div>
            <div class="scroll-cell" style="width:90px;">${d.winit.toLocaleString()}</div>
            <div class="scroll-cell ir-overview__shipment-cell" style="width:90px;" onclick="showIrShipmentPopover(event, ${i}, '18')">${d.eta18 > 0 ? d.eta18.toLocaleString() : '-'}</div>
            <div class="scroll-cell ir-overview__shipment-cell" style="width:90px;" onclick="showIrShipmentPopover(event, ${i}, '45')">${d.eta45 > 0 ? d.eta45.toLocaleString() : '-'}</div>
            <div class="scroll-cell" style="width:90px;">${d.factoryYX.toLocaleString()}</div>
            <div class="scroll-cell" style="width:90px;">${d.factorySY.toLocaleString()}</div>
            <div class="scroll-cell" style="width:110px;"><span class="ir-overview__recommend ir-overview__recommend--${d.recommend}">${recLabel[d.recommend]}</span></div>
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
    renderIrOverview();
    syncIrOverviewScroll();

    // Wrap renderReplenishment (defined in app.js, loaded after this file)
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
