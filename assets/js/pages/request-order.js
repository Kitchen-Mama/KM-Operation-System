// Request Order Page (下單系統)

const requestOrderState = {
  series: 'All',
  showMode: 'all',
  filters: {
    country: [],
    marketplace: [],
    category: [],
    sku: ''
  },
  data: []
};

function initRequestOrderSection() {
  requestOrderState.data = generateMockRequestOrderData();
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

function generateMockRequestOrderData() {
  const series = ['Classic', 'Deluxe'];
  const countries = ['US', 'UK', 'DE', 'CA', 'JP', 'AU'];
  const marketplaces = ['amazon', 'shopify', 'target'];
  const categories = ['Can Opener', 'Kitchen Tools', 'Appliances'];
  const data = [];
  
  for (let i = 1; i <= 10; i++) {
    data.push({
      sku: `SKU-${String(i).padStart(3, '0')}`,
      series: series[i % 2],
      country: countries[i % countries.length],
      marketplace: marketplaces[i % marketplaces.length],
      category: categories[i % categories.length],
      achievementRate: Math.floor(Math.random() * 40) + 80,
      forecast: Math.floor(Math.random() * 5000) + 3000,
      actual: Math.floor(Math.random() * 5000) + 2500,
      sessions: Math.floor(Math.random() * 10000) + 5000,
      usp: (Math.random() * 5 + 10).toFixed(2) + '%',
      forecastUnits: Math.floor(Math.random() * 2000) + 1000,
      specialCampaign: Math.random() > 0.5 ? Math.floor(Math.random() * 500) + 200 : 0,
      amazon: Math.floor(Math.random() * 3000) + 1000,
      factory: Math.floor(Math.random() * 5000) + 2000,
      ongoingOrder: Math.floor(Math.random() * 1000),
      mockAiRecommendedUnits: Math.floor(Math.random() * 800)
    });
  }
  
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
  
  if (requestOrderState.showMode === 'needOnly') {
    filteredData = filteredData.filter(item => item.mockAiRecommendedUnits > 0);
  }
  
  const fixedBody = document.getElementById('ro-fixed-body');
  const scrollBody = document.getElementById('ro-scroll-body');
  
  if (!fixedBody || !scrollBody) return;
  
  fixedBody.innerHTML = filteredData.map(item => `
    <div class="fixed-row">${item.sku}</div>
  `).join('');
  
  scrollBody.innerHTML = filteredData.map(item => {
    const rateClass = item.achievementRate >= 95 ? 'is-good' : 
                      item.achievementRate >= 85 ? 'is-warning' : 'is-bad';
    
    return `
      <div class="scroll-row">
        <div class="scroll-cell fc-sku-decision-cell--rate ${rateClass}">${item.achievementRate}%</div>
        <div class="scroll-cell">${item.forecast.toLocaleString()}</div>
        <div class="scroll-cell">${item.actual.toLocaleString()}</div>
        <div class="scroll-cell">${item.sessions.toLocaleString()}</div>
        <div class="scroll-cell">${item.usp}</div>
        <div class="scroll-cell">${item.forecastUnits.toLocaleString()}</div>
        <div class="scroll-cell">${item.specialCampaign > 0 ? item.specialCampaign.toLocaleString() : '-'}</div>
        <div class="scroll-cell">${item.amazon.toLocaleString()}</div>
        <div class="scroll-cell">${item.factory.toLocaleString()}</div>
        <div class="scroll-cell">${item.ongoingOrder.toLocaleString()}</div>
        <div class="scroll-cell fc-sku-decision-cell--input">
          <input type="number" value="${item.mockAiRecommendedUnits}" min="0" style="width:100px;">
        </div>
      </div>
    `;
  }).join('');
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
