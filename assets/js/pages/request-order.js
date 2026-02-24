// Request Order Page (下單系統)

const requestOrderState = {
  series: 'All',
  showMode: 'all',
  filters: {
    country: [],
    marketplace: [],
    category: [],
    sku: '',
    dateRange: null
  },
  data: [],
  expandedSku: null
};

function initRequestOrderSection() {
  // 不自動生成數據，等待用戶選擇日期
  requestOrderState.data = [];
  renderRequestOrderTable();
  syncRequestOrderScroll();
  initRequestOrderDropdowns();
}

function initRequestOrderDropdowns() {
  const root = document.querySelector('.page-request-order');
  if (!root) return;
  
  // Remove existing listeners to prevent duplicates
  const existingTriggers = root.querySelectorAll('.ro-dropdown-trigger');
  existingTriggers.forEach(trigger => {
    const clone = trigger.cloneNode(true);
    trigger.parentNode.replaceChild(clone, trigger);
  });
  
  const triggers = root.querySelectorAll('.ro-dropdown-trigger');
  
  triggers.forEach(trigger => {
    trigger.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      const filterType = this.getAttribute('data-filter');
      const panel = root.querySelector(`.ro-dropdown-panel[data-filter="${filterType}"]`);
      
      root.querySelectorAll('.ro-dropdown-panel').forEach(p => {
        if (p !== panel) p.classList.remove('is-open');
      });
      
      if (panel) {
        panel.classList.toggle('is-open');
      }
    });
  });
  
  // Prevent panel from closing when clicking inside
  root.querySelectorAll('.ro-dropdown-panel').forEach(panel => {
    panel.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  });
  
  // Close dropdowns when clicking outside
  const handleOutsideClick = (e) => {
    const isInsideRoot = root.contains(e.target);
    if (!isInsideRoot) return;
    
    const isClickOnTrigger = e.target.closest('.ro-dropdown-trigger');
    const isClickInPanel = e.target.closest('.ro-dropdown-panel');
    
    if (!isClickOnTrigger && !isClickInPanel) {
      root.querySelectorAll('.ro-dropdown-panel').forEach(p => {
        p.classList.remove('is-open');
      });
    }
  };
  
  // Store handler reference for cleanup
  if (root._requestOrderDropdownHandler) {
    document.removeEventListener('click', root._requestOrderDropdownHandler, true);
  }
  root._requestOrderDropdownHandler = handleOutsideClick;
  document.addEventListener('click', handleOutsideClick, true);
  
  const roDateTrigger = document.getElementById('roDateTrigger');
  if (roDateTrigger) {
    roDateTrigger.addEventListener('click', function() {
      openRequestOrderDateModal();
    });
  }
}

function openRequestOrderDateModal() {
  const modal = document.createElement('div');
  modal.className = 'ro-date-modal';
  modal.innerHTML = `
    <div class="ro-date-modal-content">
      <h3>Select Date Range</h3>
      <div class="ro-date-presets">
        <button onclick="selectRequestOrderPreset('last-month')">Last Month</button>
        <button onclick="selectRequestOrderPreset('last-2-months')">Last 2 Months</button>
        <button onclick="selectRequestOrderPreset('last-3-months')">Last 3 Months</button>
        <button onclick="selectRequestOrderPreset('last-year')">Last Year</button>
      </div>
      <div class="ro-date-custom">
        <div class="ro-date-field">
          <label>Start Month</label>
          <input type="month" id="ro-start-month">
        </div>
        <div class="ro-date-field">
          <label>End Month</label>
          <input type="month" id="ro-end-month">
        </div>
      </div>
      <div class="ro-date-actions">
        <button onclick="closeRequestOrderDateModal()">Cancel</button>
        <button onclick="applyRequestOrderDate()">Apply</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  const overlay = document.createElement('div');
  overlay.className = 'ro-date-overlay';
  overlay.onclick = closeRequestOrderDateModal;
  document.body.appendChild(overlay);
}

function closeRequestOrderDateModal() {
  document.querySelector('.ro-date-modal')?.remove();
  document.querySelector('.ro-date-overlay')?.remove();
}

function selectRequestOrderPreset(preset) {
  const today = new Date();
  let startMonth, endMonth;
  
  switch(preset) {
    case 'last-month':
      startMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      endMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      break;
    case 'last-2-months':
      startMonth = new Date(today.getFullYear(), today.getMonth() - 2, 1);
      endMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      break;
    case 'last-3-months':
      startMonth = new Date(today.getFullYear(), today.getMonth() - 3, 1);
      endMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      break;
    case 'last-year':
      startMonth = new Date(today.getFullYear() - 1, 0, 1);
      endMonth = new Date(today.getFullYear() - 1, 11, 31);
      break;
  }
  
  document.getElementById('ro-start-month').value = startMonth.toISOString().slice(0, 7);
  document.getElementById('ro-end-month').value = endMonth.toISOString().slice(0, 7);
}

function applyRequestOrderDate() {
  const startMonth = document.getElementById('ro-start-month').value;
  const endMonth = document.getElementById('ro-end-month').value;
  
  if (startMonth && endMonth) {
    const trigger = document.getElementById('roDateTrigger');
    const text = trigger.querySelector('.ro-date-trigger-text');
    text.textContent = `${startMonth} ~ ${endMonth}`;
    
    requestOrderState.filters.dateRange = { startMonth, endMonth };
    
    // 第一次選擇日期時生成數據
    if (requestOrderState.data.length === 0) {
      requestOrderState.data = generateMockRequestOrderData();
    }
    
    renderRequestOrderTable();
  }
  
  closeRequestOrderDateModal();
}

window.selectRequestOrderPreset = selectRequestOrderPreset;
window.applyRequestOrderDate = applyRequestOrderDate;
window.closeRequestOrderDateModal = closeRequestOrderDateModal;

function toggleRequestOrderAll(checkbox, filterType) {
  const root = document.querySelector('.page-request-order');
  const panel = root.querySelector(`.ro-dropdown-panel[data-filter="${filterType}"]`);
  const checkboxes = panel.querySelectorAll('input[type="checkbox"]:not([value=""])');
  checkboxes.forEach(cb => cb.checked = checkbox.checked);
  updateRequestOrderFilter(filterType);
}

function updateRequestOrderFilter(filterType) {
  const root = document.querySelector('.page-request-order');
  const panel = root.querySelector(`.ro-dropdown-panel[data-filter="${filterType}"]`);
  const trigger = root.querySelector(`.ro-dropdown-trigger[data-filter="${filterType}"]`);
  
  if (filterType === 'sku') {
    requestOrderState.filters.sku = document.querySelector('.ro-filter-sku').value;
  } else {
    const checkboxes = panel.querySelectorAll('input[type="checkbox"]:not([value=""]):checked');
    requestOrderState.filters[filterType] = Array.from(checkboxes).map(cb => cb.value);
    
    const allCheckbox = panel.querySelector('input[value=""]');
    const totalCheckboxes = panel.querySelectorAll('input[type="checkbox"]:not([value=""])');
    allCheckbox.checked = checkboxes.length === totalCheckboxes.length;
    
    const text = trigger.querySelector('.ro-dropdown-text');
    text.textContent = checkboxes.length === totalCheckboxes.length ? 'All' : `${checkboxes.length} selected`;
  }
  
  renderRequestOrderTable();
}

// 靜態種子數據生成器
function seededRandom(seed) {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

function generateMockRequestOrderData() {
  const data = [];
  
  // 從 FC Summary 獲取 SKU 列表（去重）
  const fcRegularData = window.fcRegularData || [];
  const uniqueSkus = new Map();
  
  // 收集唯一的 SKU（同一個 SKU 只出現一次）
  fcRegularData.forEach(item => {
    if (!uniqueSkus.has(item.sku)) {
      uniqueSkus.set(item.sku, {
        sku: item.sku,
        series: item.series,
        country: item.country,
        marketplace: item.marketplace,
        category: item.category,
        company: item.company,
        year: item.year,
        months: item.months
      });
    }
  });
  
  // 如果沒有 FC 數據，使用預設 SKU
  if (uniqueSkus.size === 0) {
    const series = ['Classic', 'Deluxe'];
    const countries = ['US', 'UK', 'DE', 'CA', 'JP', 'AU'];
    const marketplaces = ['amazon', 'shopify', 'target'];
    const categories = ['Can Opener', 'Kitchen Tools', 'Appliances'];
    
    for (let i = 1; i <= 10; i++) {
      uniqueSkus.set(`SKU-${String(i).padStart(3, '0')}`, {
        sku: `SKU-${String(i).padStart(3, '0')}`,
        series: series[i % 2],
        country: countries[i % countries.length],
        marketplace: marketplaces[i % marketplaces.length],
        category: categories[i % categories.length],
        company: 'Kitchen Mama',
        year: new Date().getFullYear(),
        months: Array(12).fill(0).map(() => Math.floor(Math.random() * 1000) + 500)
      });
    }
  }
  
  // 為每個 SKU 生成靜態數據
  let index = 0;
  uniqueSkus.forEach((fcItem) => {
    const seed = fcItem.sku.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    
    // 使用種子生成靜態隨機數
    const rand = (min, max, offset = 0) => {
      const r = seededRandom(seed + offset);
      return Math.floor(r * (max - min + 1)) + min;
    };
    
    // 靜態庫存數據（前10個SKU的Amazon庫存設為10，前5個SKU的CN和TW也設為10，方便驗證計算）
    const siteStock = index < 10 ? 10 : rand(1000, 3000, 1);
    const siteOnTheWay = rand(0, 500, 2);
    const overseasStock = rand(200, 800, 3);
    const overseasOnTheWay = 0;
    const factoryCN = index < 5 ? 10 : rand(1000, 3000, 4);
    const factoryTW = index < 5 ? 10 : rand(500, 2000, 5);
    const thisMonthOngoingOrder = rand(200, 800, 6);
    const nextMonthOngoingOrder = rand(300, 1000, 7);
    const fcAllocationRatio = 0.3; // TODO: Stage 3 需實作真實計算
    
    // 從 FC Summary Regular Forecast 抓取 FC 數據
    const currentMonth = new Date().getMonth();
    const fcNextMonth = fcItem.months[(currentMonth + 1) % 12] || rand(500, 1500, 8);
    const fcMonth2 = fcItem.months[(currentMonth + 2) % 12] || rand(600, 1600, 9);
    const fcMonth3 = fcItem.months[(currentMonth + 3) % 12] || rand(700, 1700, 10);
    
    // Campaign FC（未來可從 Event FC 抓取）
    const campaignNextMonth = seededRandom(seed + 11) > 0.6 ? rand(100, 300, 11) : 0;
    const campaignMonth2 = seededRandom(seed + 12) > 0.7 ? rand(150, 400, 12) : 0;
    const campaignMonth3 = seededRandom(seed + 13) > 0.8 ? rand(200, 500, 13) : 0;
    
    const boxSize = [12, 24, 36, 48][index % 4];
    
    // 使用計算引擎計算缺口
    const shortageResult = window.KM && window.KM.utils && window.KM.utils.forecastEngine 
      ? window.KM.utils.forecastEngine.calculateShortage({
          siteStock,
          siteOnTheWay,
          overseasStock,
          overseasOnTheWay,
          factoryStockCN: factoryCN,
          factoryStockTW: factoryTW,
          thisMonthOngoingOrder,
          nextMonthOngoingOrder,
          fcAllocationRatio,
          fcNextMonth,
          fcMonth2,
          fcMonth3,
          campaignNextMonth,
          campaignMonth2,
          campaignMonth3,
          tfNextMonth: 1.0,
          tfMonth2: 1.0,
          tfMonth3: 1.0,
          campaignTfNextMonth: 1.0,
          campaignTfMonth2: 1.0,
          campaignTfMonth3: 1.0
        })
      : { shortageMonth1: 0, shortageMonth2: 0, shortageMonth3: 0 };
    
    data.push({
      sku: fcItem.sku,
      series: fcItem.series,
      country: fcItem.country,
      marketplace: fcItem.marketplace,
      category: fcItem.category,
      achievementRate: rand(80, 120, 14),
      forecast: rand(3000, 8000, 15),
      actual: rand(2500, 7500, 16),
      sessions: rand(5000, 15000, 17),
      usp: (seededRandom(seed + 18) * 5 + 10).toFixed(2) + '%',
      forecastUnits: rand(1000, 3000, 19),
      specialCampaign: seededRandom(seed + 20) > 0.5 ? rand(200, 700, 20) : 0,
      amazon: siteStock,
      ongoingOrder: thisMonthOngoingOrder,
      thirdPartyStock: overseasStock,
      factoryCN: factoryCN,
      factoryTW: factoryTW,
      mockAiRecommendedUnits: rand(0, 800, 21),
      boxSize: boxSize,
      lastMonth: {
        achievementRate: rand(85, 115, 22),
        forecastUnits: rand(800, 2300, 23),
        actualUnits: rand(700, 2200, 24),
        sessions: rand(1500, 4500, 25),
        usp: (seededRandom(seed + 26) * 3 + 2).toFixed(2)
      },
      last2Month: {
        achievementRate: rand(80, 110, 27),
        forecastUnits: rand(700, 2200, 28),
        actualUnits: rand(650, 2150, 29),
        sessions: rand(1400, 4400, 30),
        usp: (seededRandom(seed + 31) * 3 + 2).toFixed(2)
      },
      last3Month: {
        achievementRate: rand(75, 105, 32),
        forecastUnits: rand(600, 2100, 33),
        actualUnits: rand(600, 2100, 34),
        sessions: rand(1300, 4300, 35),
        usp: (seededRandom(seed + 36) * 3 + 2).toFixed(2)
      },
      campaignLastMonth: {
        name: ['Prime', 'Fall Prime', 'BFCM'][index % 3],
        achievementRate: rand(70, 110, 37),
        forecastUnits: rand(300, 1100, 38),
        actualUnits: rand(250, 1050, 39),
        sessions: rand(800, 2800, 40),
        usp: (seededRandom(seed + 41) * 4 + 1.5).toFixed(2)
      },
      campaignLast2Month: {
        name: ['Prime', 'Fall Prime', 'BFCM'][(index + 1) % 3],
        achievementRate: rand(65, 105, 42),
        forecastUnits: rand(250, 1050, 43),
        actualUnits: rand(200, 1000, 44),
        sessions: rand(700, 2700, 45),
        usp: (seededRandom(seed + 46) * 4 + 1.5).toFixed(2)
      },
      campaignLast3Month: {
        name: ['Prime', 'Fall Prime', 'BFCM'][(index + 2) % 3],
        achievementRate: rand(60, 100, 47),
        forecastUnits: rand(200, 1000, 48),
        actualUnits: rand(180, 980, 49),
        sessions: rand(600, 2600, 50),
        usp: (seededRandom(seed + 51) * 4 + 1.5).toFixed(2)
      },
      nextMonth: {
        baseFc: fcNextMonth,
        campaignFc: campaignNextMonth
      },
      next2Month: {
        baseFc: fcMonth2,
        campaignFc: campaignMonth2
      },
      next3Month: {
        baseFc: fcMonth3,
        campaignFc: campaignMonth3
      },
      amazonStock: siteStock,
      thirdPartyStock: overseasStock,
      factoryStock: factoryCN + factoryTW,
      factoryOngoingThisMonth: thisMonthOngoingOrder,
      factoryOngoingNextMonth: nextMonthOngoingOrder,
      shortageM1: shortageResult.shortageMonth1,
      shortageM2: shortageResult.shortageMonth2,
      shortageM3: shortageResult.shortageMonth3,
      // 保留 FC Summary 來源資訊（Stage 3 使用）
      _fcSource: {
        year: fcItem.year,
        company: fcItem.company,
        allMonths: fcItem.months
      }
    });
    
    index++;
  });
  
  return data;
}

function setRequestOrderSeries(series) {
  requestOrderState.series = series;
  
  document.querySelectorAll('.ro-tab').forEach(tab => {
    tab.classList.remove('ro-tab--active');
  });
  event.target.classList.add('ro-tab--active');
  
  renderRequestOrderTable();
}

function setRequestOrderShowMode(mode) {
  requestOrderState.showMode = mode;
  renderRequestOrderTable();
}

function renderRequestOrderTable() {
  let filteredData = requestOrderState.data;
  
  // 如果沒有數據，顯示提示訊息
  if (filteredData.length === 0) {
    const fixedBody = document.getElementById('ro-fixed-body');
    const scrollBody = document.getElementById('ro-scroll-body');
    
    if (fixedBody && scrollBody) {
      fixedBody.innerHTML = '';
      scrollBody.innerHTML = '<div style="padding: 40px; text-align: center; color: #6b7280; font-size: 14px;">Please select a date range to view data</div>';
    }
    return;
  }
  
  if (requestOrderState.series !== 'All') {
    filteredData = filteredData.filter(item => item.series === requestOrderState.series);
  }
  
  if (requestOrderState.filters.country.length > 0) {
    filteredData = filteredData.filter(item => requestOrderState.filters.country.includes(item.country));
  }
  
  if (requestOrderState.filters.marketplace.length > 0) {
    filteredData = filteredData.filter(item => requestOrderState.filters.marketplace.includes(item.marketplace));
  }
  
  if (requestOrderState.filters.category.length > 0) {
    filteredData = filteredData.filter(item => requestOrderState.filters.category.includes(item.category));
  }
  
  if (requestOrderState.filters.sku) {
    filteredData = filteredData.filter(item => item.sku.toLowerCase().includes(requestOrderState.filters.sku.toLowerCase()));
  }
  
  // Show Mode 篩選：Need Order 只顯示有建議下單量的 SKU
  if (requestOrderState.showMode === 'needOnly') {
    filteredData = filteredData.filter(item => {
      const t1Order = item.shortageM1 < 0 ? Math.ceil(Math.abs(item.shortageM1) / item.boxSize) * item.boxSize : 0;
      const t2Order = item.shortageM2 < 0 ? Math.ceil(Math.abs(item.shortageM2) / item.boxSize) * item.boxSize : 0;
      const t3Order = item.shortageM3 < 0 ? Math.ceil(Math.abs(item.shortageM3) / item.boxSize) * item.boxSize : 0;
      const totalSuggestedOrder = t1Order + t2Order + t3Order;
      return totalSuggestedOrder > 0;
    });
  }
  
  const fixedBody = document.getElementById('ro-fixed-body');
  const scrollBody = document.getElementById('ro-scroll-body');
  
  if (!fixedBody || !scrollBody) return;
  
  fixedBody.innerHTML = filteredData.map(item => `
    <div class="ro-fixed-wrapper" data-sku="${item.sku}">
      <div class="fixed-row ${requestOrderState.expandedSku === item.sku ? 'is-expanded' : ''}" data-sku="${item.sku}">
        <span class="ro-sku-expand-toggle ${requestOrderState.expandedSku === item.sku ? 'is-expanded' : ''}" 
              onclick="toggleRequestOrderSkuExpand('${item.sku}')">
          ${requestOrderState.expandedSku === item.sku ? '▼' : '▸'}
        </span>
        ${item.sku}
      </div>
      ${requestOrderState.expandedSku === item.sku ? `
        <div class="ro-fixed-expand-spacer">
          <div class="ro-fixed-expand-actions">
            <button class="btn btn-secondary ro-btn-edit-target" onclick="handleEditTargetFc('${item.sku}')">Edit Target FC</button>
            <button class="btn btn-primary ro-btn-update-fc" onclick="handleFcUpdate('${item.sku}')">FC Update</button>
          </div>
        </div>
      ` : ''}
    </div>
  `).join('');
  
  scrollBody.innerHTML = filteredData.map(item => {
    const rateClass = item.achievementRate >= 95 ? 'is-good' : 
                      item.achievementRate >= 85 ? 'is-warning' : 'is-bad';
    
    // 計算建議下單量總和 (只計算缺貨的月份)
    const t1Order = item.shortageM1 < 0 ? Math.ceil(Math.abs(item.shortageM1) / item.boxSize) * item.boxSize : 0;
    const t2Order = item.shortageM2 < 0 ? Math.ceil(Math.abs(item.shortageM2) / item.boxSize) * item.boxSize : 0;
    const t3Order = item.shortageM3 < 0 ? Math.ceil(Math.abs(item.shortageM3) / item.boxSize) * item.boxSize : 0;
    const totalSuggestedOrder = t1Order + t2Order + t3Order;
    
    return `
      <div class="ro-row-wrapper" data-sku="${item.sku}">
        <div class="scroll-row">
          <div class="scroll-cell scroll-cell--country">${item.country}</div>
          <div class="scroll-cell scroll-cell--marketplace">${item.marketplace}</div>
          <div class="scroll-cell fc-sku-decision-cell--rate ${rateClass}">${item.achievementRate}%</div>
          <div class="scroll-cell">${item.forecast.toLocaleString()}</div>
          <div class="scroll-cell">${item.actual.toLocaleString()}</div>
          <div class="scroll-cell">${item.sessions.toLocaleString()}</div>
          <div class="scroll-cell">${item.usp}</div>
          <div class="scroll-cell">${item.forecastUnits.toLocaleString()}</div>
          <div class="scroll-cell">${item.specialCampaign > 0 ? item.specialCampaign.toLocaleString() : '-'}</div>
          <div class="scroll-cell">${item.amazon.toLocaleString()}</div>
          <div class="scroll-cell">${item.thirdPartyStock.toLocaleString()}</div>
          <div class="scroll-cell">${item.factoryCN.toLocaleString()}</div>
          <div class="scroll-cell">${item.factoryTW.toLocaleString()}</div>
          <div class="scroll-cell">${item.ongoingOrder.toLocaleString()}</div>
          <div class="scroll-cell ro-request-order-cell">
            <span class="ro-request-order-value">${totalSuggestedOrder > 0 ? totalSuggestedOrder.toLocaleString() : '0'}</span>
            <span class="ro-request-order-icon" onclick="toggleRequestOrderSkuExpand('${item.sku}')" title="Edit details">⚙</span>
          </div>
        </div>
        ${requestOrderState.expandedSku === item.sku ? renderExpandPanel(item) : ''}
      </div>
    `;
  }).join('');
}

function renderExpandPanel(item) {
  const today = new Date();
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1);
  const last2Month = new Date(today.getFullYear(), today.getMonth() - 2);
  const last3Month = new Date(today.getFullYear(), today.getMonth() - 3);
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1);
  const next2Month = new Date(today.getFullYear(), today.getMonth() + 2);
  const next3Month = new Date(today.getFullYear(), today.getMonth() + 3);
  
  const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
  
  return `
    <div class="ro-sku-expand-panel is-open" data-sku="${item.sku}">
      <div class="ro-sku-expand-grid">
        <div class="ro-sku-expand-card ro-sku-expand-card--history">
          <div class="ro-expand-card-title">Last 3 Month Overview</div>
          
          <table class="ro-expand-table">
            <thead>
              <tr>
                <th>月份</th>
                <th>達成率</th>
                <th>Forecast</th>
                <th>Actual</th>
                <th>Sessions</th>
                <th>USP</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${monthNames[lastMonth.getMonth()]}</td>
                <td>${item.lastMonth.achievementRate}%</td>
                <td>${item.lastMonth.forecastUnits.toLocaleString()}</td>
                <td>${item.lastMonth.actualUnits.toLocaleString()}</td>
                <td>${item.lastMonth.sessions.toLocaleString()}</td>
                <td>${item.lastMonth.usp}%</td>
              </tr>
              <tr>
                <td>${monthNames[last2Month.getMonth()]}</td>
                <td>${item.last2Month.achievementRate}%</td>
                <td>${item.last2Month.forecastUnits.toLocaleString()}</td>
                <td>${item.last2Month.actualUnits.toLocaleString()}</td>
                <td>${item.last2Month.sessions.toLocaleString()}</td>
                <td>${item.last2Month.usp}%</td>
              </tr>
              <tr>
                <td>${monthNames[last3Month.getMonth()]}</td>
                <td>${item.last3Month.achievementRate}%</td>
                <td>${item.last3Month.forecastUnits.toLocaleString()}</td>
                <td>${item.last3Month.actualUnits.toLocaleString()}</td>
                <td>${item.last3Month.sessions.toLocaleString()}</td>
                <td>${item.last3Month.usp}%</td>
              </tr>
            </tbody>
          </table>
          
          <table class="ro-expand-table" style="margin-top: 16px;">
            <thead>
              <tr>
                <th>Name</th>
                <th>達成率</th>
                <th>Forecast</th>
                <th>Actual</th>
                <th>Sessions</th>
                <th>USP</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${item.campaignLastMonth.name}</td>
                <td>${item.campaignLastMonth.achievementRate}%</td>
                <td>${item.campaignLastMonth.forecastUnits.toLocaleString()}</td>
                <td>${item.campaignLastMonth.actualUnits.toLocaleString()}</td>
                <td>${item.campaignLastMonth.sessions.toLocaleString()}</td>
                <td>${item.campaignLastMonth.usp}%</td>
              </tr>
              <tr>
                <td>${item.campaignLast2Month.name}</td>
                <td>${item.campaignLast2Month.achievementRate}%</td>
                <td>${item.campaignLast2Month.forecastUnits.toLocaleString()}</td>
                <td>${item.campaignLast2Month.actualUnits.toLocaleString()}</td>
                <td>${item.campaignLast2Month.sessions.toLocaleString()}</td>
                <td>${item.campaignLast2Month.usp}%</td>
              </tr>
              <tr>
                <td>${item.campaignLast3Month.name}</td>
                <td>${item.campaignLast3Month.achievementRate}%</td>
                <td>${item.campaignLast3Month.forecastUnits.toLocaleString()}</td>
                <td>${item.campaignLast3Month.actualUnits.toLocaleString()}</td>
                <td>${item.campaignLast3Month.sessions.toLocaleString()}</td>
                <td>${item.campaignLast3Month.usp}%</td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <div class="ro-sku-expand-card ro-sku-expand-card--upcoming">
          <div class="ro-expand-card-title">Upcoming FC</div>
          <div class="ro-expand-row">
            <span class="ro-expand-label">${monthNames[nextMonth.getMonth()]}</span>
          </div>
          <div class="ro-expand-row">
            <span class="ro-expand-sublabel">Base FC</span>
            <span class="ro-expand-value">${item.nextMonth.baseFc.toLocaleString()}</span>
          </div>
          <div class="ro-expand-row">
            <span class="ro-expand-sublabel">Campaign FC</span>
            <span class="ro-expand-value">${item.nextMonth.campaignFc > 0 ? item.nextMonth.campaignFc.toLocaleString() : '-'}</span>
          </div>
          <div class="ro-expand-row">
            <span class="ro-expand-label">${monthNames[next2Month.getMonth()]}</span>
          </div>
          <div class="ro-expand-row">
            <span class="ro-expand-sublabel">Base FC</span>
            <span class="ro-expand-value">${item.next2Month.baseFc.toLocaleString()}</span>
          </div>
          <div class="ro-expand-row">
            <span class="ro-expand-sublabel">Campaign FC</span>
            <span class="ro-expand-value">${item.next2Month.campaignFc > 0 ? item.next2Month.campaignFc.toLocaleString() : '-'}</span>
          </div>
          <div class="ro-expand-row">
            <span class="ro-expand-label">${monthNames[next3Month.getMonth()]}</span>
          </div>
          <div class="ro-expand-row">
            <span class="ro-expand-sublabel">Base FC</span>
            <span class="ro-expand-value">${item.next3Month.baseFc.toLocaleString()}</span>
          </div>
          <div class="ro-expand-row">
            <span class="ro-expand-sublabel">Campaign FC</span>
            <span class="ro-expand-value">${item.next3Month.campaignFc > 0 ? item.next3Month.campaignFc.toLocaleString() : '-'}</span>
          </div>
        </div>
        
        <div class="ro-sku-expand-card ro-sku-expand-card--inventory">
          <div class="ro-expand-card-title">Inventory & Ongoing Orders</div>
          <div class="ro-expand-section">
            <div class="ro-expand-section-title">Marketplace</div>
            <div class="ro-expand-row">
              <span class="ro-expand-sublabel">Amazon Stock</span>
              <span class="ro-expand-value">${item.amazonStock.toLocaleString()}</span>
            </div>
            <div class="ro-expand-row">
              <span class="ro-expand-sublabel">3rd Party WH</span>
              <span class="ro-expand-value">${item.thirdPartyStock.toLocaleString()}</span>
            </div>
          </div>
          <div class="ro-expand-section">
            <div class="ro-expand-section-title">Factory Stock</div>
            <div class="ro-expand-row">
              <span class="ro-expand-sublabel">CN</span>
              <span class="ro-expand-value">${item.factoryCN.toLocaleString()}</span>
            </div>
            <div class="ro-expand-row">
              <span class="ro-expand-sublabel">TW</span>
              <span class="ro-expand-value">${item.factoryTW.toLocaleString()}</span>
            </div>
          </div>
          <div class="ro-expand-section">
            <div class="ro-expand-section-title">Ongoing Orders</div>
            <div class="ro-expand-row">
              <span class="ro-expand-sublabel">This Month</span>
              <span class="ro-expand-value">${item.factoryOngoingThisMonth.toLocaleString()}</span>
            </div>
            <div class="ro-expand-row">
              <span class="ro-expand-sublabel">Next Month</span>
              <span class="ro-expand-value">${item.factoryOngoingNextMonth.toLocaleString()}</span>
            </div>
          </div>
        </div>
        
        <div class="ro-sku-expand-card ro-sku-expand-card--ai">
          <div class="ro-expand-card-title">AI Recommendation</div>
          
          <div class="ro-expand-section ro-expand-section--system">
            <div class="ro-expand-section-subtitle">系統計算缺口</div>
            <div class="ro-expand-row">
              <span class="ro-expand-sublabel">${monthNames[nextMonth.getMonth()]} 缺口</span>
              <span class="ro-expand-value ${item.shortageM1 < 0 ? 'ro-shortage' : 'ro-sufficient'}">
                ${item.shortageM1 < 0 ? `缺 ${Math.abs(item.shortageM1).toLocaleString()} units` : '充足 0 units'}
              </span>
            </div>
            <div class="ro-expand-row">
              <span class="ro-expand-sublabel">${monthNames[next2Month.getMonth()]} 缺口</span>
              <span class="ro-expand-value ${item.shortageM2 < 0 ? 'ro-shortage' : 'ro-sufficient'}">
                ${item.shortageM2 < 0 ? `缺 ${Math.abs(item.shortageM2).toLocaleString()} units` : '充足 0 units'}
              </span>
            </div>
            <div class="ro-expand-row">
              <span class="ro-expand-sublabel">${monthNames[next3Month.getMonth()]} 缺口</span>
              <span class="ro-expand-value ${item.shortageM3 < 0 ? 'ro-shortage' : 'ro-sufficient'}">
                ${item.shortageM3 < 0 ? `缺 ${Math.abs(item.shortageM3).toLocaleString()} units` : '充足 0 units'}
              </span>
            </div>
          </div>
          
          <div class="ro-expand-divider"></div>
          
          <div class="ro-expand-section ro-expand-section--editable">
            <div class="ro-expand-section-subtitle">建議下單量 (每箱${item.boxSize}個)</div>
            <div class="ro-expand-row ro-expand-row--editable">
              <span class="ro-expand-tier-label">T1</span>
              <span class="ro-expand-sublabel">${monthNames[nextMonth.getMonth()]}</span>
              <input type="number" class="ro-ai-input" value="${item.shortageM1 < 0 ? Math.ceil(Math.abs(item.shortageM1) / item.boxSize) * item.boxSize : 0}" min="0" step="${item.boxSize}" />
            </div>
            <div class="ro-expand-row ro-expand-row--editable">
              <span class="ro-expand-tier-label">T2</span>
              <span class="ro-expand-sublabel">${monthNames[next2Month.getMonth()]}</span>
              <input type="number" class="ro-ai-input" value="${item.shortageM2 < 0 ? Math.ceil(Math.abs(item.shortageM2) / item.boxSize) * item.boxSize : 0}" min="0" step="${item.boxSize}" />
            </div>
            <div class="ro-expand-row ro-expand-row--editable">
              <span class="ro-expand-tier-label">T3</span>
              <span class="ro-expand-sublabel">${monthNames[next3Month.getMonth()]}</span>
              <input type="number" class="ro-ai-input" value="${item.shortageM3 < 0 ? Math.ceil(Math.abs(item.shortageM3) / item.boxSize) * item.boxSize : 0}" min="0" step="${item.boxSize}" />
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function toggleRequestOrderSkuExpand(sku) {
  if (requestOrderState.expandedSku === sku) {
    requestOrderState.expandedSku = null;
  } else {
    requestOrderState.expandedSku = sku;
  }
  renderRequestOrderTable();
  
  // Sync heights after render with multiple attempts
  requestAnimationFrame(() => {
    syncExpandPanelHeights();
    // Double check after a short delay
    setTimeout(() => {
      syncExpandPanelHeights();
    }, 100);
  });
}

function syncExpandPanelHeights() {
  const expandedSku = requestOrderState.expandedSku;
  if (!expandedSku) return;
  
  const scrollPanel = document.querySelector(`.ro-row-wrapper[data-sku="${expandedSku}"] .ro-sku-expand-panel`);
  const fixedSpacer = document.querySelector(`.ro-fixed-wrapper[data-sku="${expandedSku}"] .ro-fixed-expand-spacer`);
  
  if (scrollPanel && fixedSpacer) {
    const panelHeight = scrollPanel.offsetHeight;
    if (panelHeight > 0) {
      fixedSpacer.style.height = panelHeight + 'px';
    }
  }
}

function handleEditTargetFc(sku) {
  alert('Edit Target FC - ' + sku);
}

function handleFcUpdate(sku) {
  alert('FC Update - ' + sku);
}

function syncRequestOrderScroll() {
  const scrollCol = document.getElementById('ro-scroll-col');
  const scrollHeader = document.getElementById('ro-scroll-header');
  
  if (!scrollCol || !scrollHeader) return;
  
  // Sync horizontal scroll between header and body
  scrollCol.addEventListener('scroll', function() {
    scrollHeader.style.transform = `translateX(-${this.scrollLeft}px)`;
  });
}

function handleSendRequest() {
  const requestType = document.getElementById('ro-request-type').value;
  
  let filteredData = requestOrderState.data;
  if (requestOrderState.series !== 'All') {
    filteredData = filteredData.filter(item => item.series === requestOrderState.series);
  }
  if (requestOrderState.showMode === 'needOnly') {
    filteredData = filteredData.filter(item => item.mockAiRecommendedUnits > 0);
  }
  
  const typeLabel = {
    'all': 'All Request',
    't1': 'T1 Request',
    't2': 'T2 Request',
    't3': 'T3 Request'
  }[requestType];
  
  alert(`Send Request (${typeLabel}) for ${filteredData.length} SKUs`);
}

window.setRequestOrderSeries = setRequestOrderSeries;
window.setRequestOrderShowMode = setRequestOrderShowMode;
window.handleSendRequest = handleSendRequest;
window.initRequestOrderSection = initRequestOrderSection;
window.toggleRequestOrderSkuExpand = toggleRequestOrderSkuExpand;
window.handleEditTargetFc = handleEditTargetFc;
window.handleFcUpdate = handleFcUpdate;
