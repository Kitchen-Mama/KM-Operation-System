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

// ========================================
// Inventory Replenishment - 從 app.js 搬移 (批次 1: Mock Data + 核心計算渲染)
// ========================================

const replenishmentMockData = [
    { sku: "A001", lifecycle: "Mature", productName: "Can Opener Pro", forecast90d: 450, onTheWay: 20, unitsPerCarton: 40 },
    { sku: "B002", lifecycle: "New", productName: "Manual Opener Basic", forecast90d: 320, onTheWay: 15, unitsPerCarton: 50 },
    { sku: "C003", lifecycle: "Mature", productName: "Kitchen Tool Set", forecast90d: 1100, onTheWay: 50, unitsPerCarton: 30 },
    { sku: "D004", lifecycle: "Mature", productName: "Electric Peeler", forecast90d: 380, onTheWay: 10, unitsPerCarton: 40 },
    { sku: "E005", lifecycle: "New", productName: "Smart Opener", forecast90d: 600, onTheWay: 30, unitsPerCarton: 50 },
    { sku: "F006", lifecycle: "Phasing Out", productName: "Classic Knife", forecast90d: 280, onTheWay: 5, unitsPerCarton: 30 },
    { sku: "G007", lifecycle: "Mature", productName: "Food Processor", forecast90d: 750, onTheWay: 40, unitsPerCarton: 40 }
];

const specialEvents = [
    { name: "Spring Deal", startDate: "3/22", endDate: "3/29", month: 3, tag: "Special Event" },
    { name: "Prime Day", startDate: "7/15", endDate: "7/16", month: 7, tag: "Special Event" },
    { name: "Fall Prime", startDate: "10/20", endDate: "10/21", month: 10, tag: "Special Event" },
    { name: "BFCM", startDate: "11/20", endDate: "12/1", month: 11, tag: "Special Event" }
];

const skuEventData = [
    { sku: "A001", events: [{ name: "Spring Deal", qty: 500 }, { name: "Prime Day", qty: 800 }] },
    { sku: "B002", events: [{ name: "BFCM", qty: 1200 }] },
    { sku: "C003", events: [{ name: "Prime Day", qty: 1500 }, { name: "Fall Prime", qty: 900 }] },
    { sku: "D004", events: [{ name: "Spring Deal", qty: 400 }] },
    { sku: "E005", events: [{ name: "BFCM", qty: 2000 }] },
    { sku: "F006", events: [] },
    { sku: "G007", events: [{ name: "Prime Day", qty: 1000 }, { name: "BFCM", qty: 1800 }] }
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
    const marketplace = document.getElementById('replenMarketplace').value;
    const siteData = window.DataRepo.getSiteSkus(marketplace);
    const targetDays = parseInt(document.getElementById('replenTargetDays').value) || 90;
    const ltsFilter = document.getElementById('replenLTSFilter').value;
    
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
        if (item.sku === 'A001' || item.sku === 'C003' || item.sku === 'E005' || item.sku === 'G007') {
            mockData.company = 'Res US';
        } else if (item.sku === 'B002' || item.sku === 'D004' || item.sku === 'F006') {
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
            
            if (item.sku === 'A001' || item.sku === 'B002') {
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
        } else if (item.sku === 'C003' || item.sku === 'D004') {
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
            if (item.sku === 'B002' || item.sku === 'D004') {
                over90 = 0;
                over180 = 0;
            } else if (item.sku === 'F006') {
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
            <div class="scroll-cell">${item.lifecycle}</div>
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
    const scrollCol = document.querySelector('#ops-section .scroll-col');
    const scrollHeader = document.querySelector('#ops-section .scroll-header');
    
    if (!scrollCol || !scrollHeader) return;
    
    // Remove existing listener to avoid duplicates
    scrollCol.removeEventListener('scroll', scrollCol._syncHandler);
    
    // Create and store handler
    scrollCol._syncHandler = () => {
        scrollHeader.style.transform = `translateX(-${scrollCol.scrollLeft}px)`;
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
    document.getElementById('add-mp-company').value = 'Kitchen Mama';
    document.getElementById('add-mp-marketplace').value = '';
}

function saveMarketplace() {
    const country = document.getElementById('add-mp-country').value;
    const company = document.getElementById('add-mp-company').value;
    const marketplace = document.getElementById('add-mp-marketplace').value.trim();
    
    if (!marketplace) {
        alert('Please enter marketplace name');
        return;
    }
    
    // TODO: Stage 2 - Save to database and update filters
    console.log('Add Marketplace:', { country, company, marketplace });
    alert(`Marketplace added:\nCountry: ${country}\nCompany: ${company}\nMarketplace: ${marketplace}`);
    
    closeAddMarketplaceModal();
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
// Lifecycle 註冊
// ========================================
if (window.KM && window.KM.lifecycle) {
    KM.lifecycle.register('ops-section', {
        mount() {
            console.log('[Replenishment] mount');
            renderReplenishment();
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
