// FC Summary - Mock Data and Logic

// Pagination state
const fcPaginationState = {
  currentPage: 1,
  pageSize: 25,
  totalItems: 0
};

// Mock Data - Regular Forecast
const fcRegularMock = [
  {
    year: 2026,
    company: 'ResTW',
    marketplace: 'Amazon',
    country: 'US',
    category: 'Openers',
    series: 'Classic',
    sku: 'KM-OP-001',
    months: [300, 320, 340, 360, 380, 400, 420, 440, 460, 480, 500, 520]
  },
  {
    year: 2026,
    company: 'ResTW',
    marketplace: 'Amazon',
    country: 'US',
    category: 'Openers',
    series: 'Deluxe',
    sku: 'KM-OP-002',
    months: [150, 160, 170, 180, 190, 200, 210, 220, 230, 240, 250, 260]
  },
  {
    year: 2026,
    company: 'ResUS',
    marketplace: 'Walmart',
    country: 'US',
    category: 'Kitchen Tools',
    series: 'Classic',
    sku: 'KM-KT-001',
    months: [200, 210, 220, 230, 240, 250, 260, 270, 280, 290, 300, 310]
  },
  {
    year: 2026,
    company: 'ResTW',
    marketplace: 'Amazon',
    country: 'CA',
    category: 'Accessories',
    series: 'Deluxe',
    sku: 'KM-AC-001',
    months: [100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 210]
  },
  {
    year: 2025,
    company: 'ResTW',
    marketplace: 'Amazon',
    country: 'US',
    category: 'Openers',
    series: 'Classic',
    sku: 'KM-OP-001',
    months: [280, 290, 300, 310, 320, 330, 340, 350, 360, 370, 380, 390]
  }
];

// Mock Data - Special Event Forecast
const fcEventMock = [
  {
    year: 2026,
    company: 'ResTW',
    marketplace: 'Amazon',
    country: 'US',
    sku: 'KM-OP-001',
    event: 'Spring Deal',
    eventPeriod: '2026-03-20 ~ 2026-03-27',
    fcQty: 13400
  },
  {
    year: 2026,
    company: 'ResTW',
    marketplace: 'Amazon',
    country: 'US',
    sku: 'KM-OP-001',
    event: 'Prime Day',
    eventPeriod: '2026-07-10 ~ 2026-07-12',
    fcQty: 13400
  },
  {
    year: 2026,
    company: 'ResTW',
    marketplace: 'Walmart',
    country: 'US',
    sku: 'KM-OP-002',
    event: 'BFCM',
    eventPeriod: '2026-11-25 ~ 2026-11-30',
    fcQty: 41099
  },
  {
    year: 2026,
    company: 'ResUS',
    marketplace: 'Amazon',
    country: 'CA',
    sku: 'KM-KT-001',
    event: 'Prime Day',
    eventPeriod: '2026-07-10 ~ 2026-07-12',
    fcQty: 8500
  },
  {
    year: 2025,
    company: 'ResTW',
    marketplace: 'Amazon',
    country: 'US',
    sku: 'KM-OP-001',
    event: 'BFCM',
    eventPeriod: '2025-11-28 ~ 2025-12-02',
    fcQty: 38000
  }
];

// Get filter values from DOM
function getFcFilters() {
  const getSelectedFromDropdown = (filterType) => {
    const panel = document.querySelector(`.fc-dropdown-panel[data-filter="${filterType}"]`);
    if (!panel) return [];
    const checkboxes = panel.querySelectorAll('input[type="checkbox"]:not([value=""]):checked');
    return Array.from(checkboxes).map(cb => cb.value);
  };

  return {
    year: document.getElementById('fc-year-select').value,
    companies: getSelectedFromDropdown('company'),
    marketplaces: getSelectedFromDropdown('marketplace'),
    countries: getSelectedFromDropdown('country'),
    categories: getSelectedFromDropdown('category'),
    series: getSelectedFromDropdown('series'),
    events: getSelectedFromDropdown('event'),
    sku: document.getElementById('fc-sku-input').value.trim().toLowerCase()
  };
}

// Filter Regular Forecast data
function filterFcRegular(data, filters) {
  return data.filter(item => {
    if (filters.year && item.year.toString() !== filters.year) return false;
    if (filters.companies.length > 0 && !filters.companies.includes(item.company)) return false;
    if (filters.marketplaces.length > 0 && !filters.marketplaces.includes(item.marketplace)) return false;
    if (filters.countries.length > 0 && !filters.countries.includes(item.country)) return false;
    if (filters.categories.length > 0 && !filters.categories.includes(item.category)) return false;
    if (filters.series.length > 0 && !filters.series.includes(item.series)) return false;
    if (filters.sku && !item.sku.toLowerCase().includes(filters.sku)) return false;
    return true;
  });
}

// Filter Event Forecast data
function filterFcEvent(data, filters) {
  return data.filter(item => {
    if (filters.year && item.year.toString() !== filters.year) return false;
    if (filters.companies.length > 0 && !filters.companies.includes(item.company)) return false;
    if (filters.marketplaces.length > 0 && !filters.marketplaces.includes(item.marketplace)) return false;
    if (filters.countries.length > 0 && !filters.countries.includes(item.country)) return false;
    if (filters.events.length > 0 && !filters.events.includes(item.event)) return false;
    if (filters.sku && !item.sku.toLowerCase().includes(filters.sku)) return false;
    return true;
  });
}

// Render Regular Forecast Table
function renderFcRegularTable() {
  const fixedBody = document.getElementById('fc-regular-fixed-body');
  const scrollBody = document.getElementById('fc-regular-scroll-body');
  const filters = getFcFilters();
  
  // Check if year is selected
  if (!filters.year) {
    fixedBody.innerHTML = '';
    scrollBody.innerHTML = '<div class="empty-row">Please select a year to view data</div>';
    updatePaginationInfo(0);
    return;
  }
  
  const filteredData = filterFcRegular(fcRegularMock, filters);
  fcPaginationState.totalItems = filteredData.length;
  
  // Paginate data
  const startIdx = (fcPaginationState.currentPage - 1) * fcPaginationState.pageSize;
  const endIdx = startIdx + fcPaginationState.pageSize;
  const paginatedData = filteredData.slice(startIdx, endIdx);

  if (paginatedData.length === 0) {
    fixedBody.innerHTML = '';
    scrollBody.innerHTML = '<div class="empty-row">No data found</div>';
    updatePaginationInfo(filteredData.length);
    return;
  }

  // Render fixed column (SKU)
  fixedBody.innerHTML = paginatedData.map(item => `
    <div class="fixed-row">
      <div class="fixed-cell">${item.sku}</div>
    </div>
  `).join('');

  // Render scrollable columns
  scrollBody.innerHTML = paginatedData.map(item => {
    const total = item.months.reduce((sum, val) => sum + val, 0);
    return `
      <div class="scroll-row">
        <div class="scroll-cell">${item.year}</div>
        <div class="scroll-cell">${item.company}</div>
        <div class="scroll-cell">${item.marketplace}</div>
        <div class="scroll-cell">${item.country}</div>
        <div class="scroll-cell">${item.category}</div>
        <div class="scroll-cell">${item.series}</div>
        ${item.months.map(m => `<div class="scroll-cell cell-month">${m.toLocaleString()}</div>`).join('')}
        <div class="scroll-cell cell-total">${total.toLocaleString()}</div>
      </div>
    `;
  }).join('');

  updatePaginationInfo(filteredData.length);
  syncFcScroll('regular');
}

// Render Event Forecast Table
function renderFcEventTable() {
  const fixedBody = document.getElementById('fc-event-fixed-body');
  const scrollBody = document.getElementById('fc-event-scroll-body');
  const filters = getFcFilters();
  
  // Check if year is selected
  if (!filters.year) {
    fixedBody.innerHTML = '';
    scrollBody.innerHTML = '<div class="empty-row">Please select a year to view data</div>';
    updatePaginationInfo(0);
    return;
  }
  
  const filteredData = filterFcEvent(fcEventMock, filters);
  fcPaginationState.totalItems = filteredData.length;
  
  // Paginate data
  const startIdx = (fcPaginationState.currentPage - 1) * fcPaginationState.pageSize;
  const endIdx = startIdx + fcPaginationState.pageSize;
  const paginatedData = filteredData.slice(startIdx, endIdx);

  if (paginatedData.length === 0) {
    fixedBody.innerHTML = '';
    scrollBody.innerHTML = '<div class="empty-row">No data found</div>';
    updatePaginationInfo(filteredData.length);
    return;
  }

  // Render fixed column (SKU)
  fixedBody.innerHTML = paginatedData.map(item => `
    <div class="fixed-row">
      <div class="fixed-cell">${item.sku}</div>
    </div>
  `).join('');

  // Render scrollable columns
  scrollBody.innerHTML = paginatedData.map(item => `
    <div class="scroll-row">
      <div class="scroll-cell">${item.year}</div>
      <div class="scroll-cell">${item.company}</div>
      <div class="scroll-cell">${item.marketplace}</div>
      <div class="scroll-cell">${item.country}</div>
      <div class="scroll-cell">${item.event}</div>
      <div class="scroll-cell">${item.eventPeriod}</div>
      <div class="scroll-cell cell-qty">${item.fcQty.toLocaleString()}</div>
    </div>
  `).join('');

  updatePaginationInfo(filteredData.length);
  syncFcScroll('event');
}

// Update pagination info and controls
function updatePaginationInfo(totalItems) {
  fcPaginationState.totalItems = totalItems;
  const totalPages = Math.ceil(totalItems / fcPaginationState.pageSize);
  const startIdx = totalItems === 0 ? 0 : (fcPaginationState.currentPage - 1) * fcPaginationState.pageSize + 1;
  const endIdx = Math.min(fcPaginationState.currentPage * fcPaginationState.pageSize, totalItems);
  
  document.getElementById('fc-pagination-info').textContent = 
    `Showing ${startIdx}-${endIdx} of ${totalItems}`;
  document.getElementById('fc-page-number').textContent = 
    totalPages === 0 ? '0' : `${fcPaginationState.currentPage} / ${totalPages}`;
  
  // Update button states
  document.getElementById('fc-prev-page').disabled = fcPaginationState.currentPage <= 1;
  document.getElementById('fc-next-page').disabled = fcPaginationState.currentPage >= totalPages;
}

// Initialize pagination controls
function initFcPagination() {
  document.getElementById('fc-page-size').addEventListener('change', (e) => {
    fcPaginationState.pageSize = parseInt(e.target.value);
    fcPaginationState.currentPage = 1;
    renderFcRegularTable();
    renderFcEventTable();
  });
  
  document.getElementById('fc-prev-page').addEventListener('click', () => {
    if (fcPaginationState.currentPage > 1) {
      fcPaginationState.currentPage--;
      renderFcRegularTable();
      renderFcEventTable();
    }
  });
  
  document.getElementById('fc-next-page').addEventListener('click', () => {
    const totalPages = Math.ceil(fcPaginationState.totalItems / fcPaginationState.pageSize);
    if (fcPaginationState.currentPage < totalPages) {
      fcPaginationState.currentPage++;
      renderFcRegularTable();
      renderFcEventTable();
    }
  });
}

// Sync horizontal scroll between header and body
function syncFcScroll(type) {
  const scrollCol = document.getElementById(`fc-${type}-scroll-col`);
  const scrollHeader = document.getElementById(`fc-${type}-scroll-header`);
  
  if (!scrollCol || !scrollHeader) return;

  scrollCol.addEventListener('scroll', function() {
    scrollHeader.style.transform = `translateX(-${this.scrollLeft}px)`;
  });
}

// Initialize Tabs
function initFcTabs() {
  const tabs = document.querySelectorAll('.fc-tab');
  const panels = document.querySelectorAll('.fc-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;

      // Update active tab
      tabs.forEach(t => t.classList.remove('fc-tab--active'));
      tab.classList.add('fc-tab--active');

      // Update active panel
      panels.forEach(panel => {
        if (panel.id === `fc-panel-${targetTab}`) {
          panel.classList.add('fc-panel--active');
        } else {
          panel.classList.remove('fc-panel--active');
        }
      });
    });
  });
}

// Initialize Dropdown
function initFcDropdown() {
  const triggers = document.querySelectorAll('.fc-dropdown-trigger');
  
  triggers.forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const filterType = trigger.dataset.filter;
      const panel = document.querySelector(`.fc-dropdown-panel[data-filter="${filterType}"]`);
      
      // Close other panels
      document.querySelectorAll('.fc-dropdown-panel').forEach(p => {
        if (p !== panel) p.classList.remove('is-open');
      });
      
      // Toggle current panel
      panel.classList.toggle('is-open');
    });
  });
  
  // Close dropdown when clicking outside
  document.addEventListener('click', () => {
    document.querySelectorAll('.fc-dropdown-panel').forEach(p => {
      p.classList.remove('is-open');
    });
  });
}

// Toggle All checkboxes
function toggleFcAll(checkbox, filterType) {
  const panel = document.querySelector(`.fc-dropdown-panel[data-filter="${filterType}"]`);
  const checkboxes = panel.querySelectorAll('input[type="checkbox"]:not([value=""])');
  
  checkboxes.forEach(cb => {
    cb.checked = checkbox.checked;
  });
  
  updateFcFilterText(filterType);
  fcPaginationState.currentPage = 1;
  renderFcRegularTable();
  renderFcEventTable();
}

// Update individual filter
function updateFcFilter(filterType) {
  const panel = document.querySelector(`.fc-dropdown-panel[data-filter="${filterType}"]`);
  const allCheckbox = panel.querySelector('input[value=""]');
  const checkboxes = panel.querySelectorAll('input[type="checkbox"]:not([value=""])');
  const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
  
  // Update "All" checkbox
  allCheckbox.checked = checkedCount === checkboxes.length;
  
  updateFcFilterText(filterType);
  fcPaginationState.currentPage = 1;
  renderFcRegularTable();
  renderFcEventTable();
}

// Update filter button text
function updateFcFilterText(filterType) {
  const panel = document.querySelector(`.fc-dropdown-panel[data-filter="${filterType}"]`);
  const trigger = document.querySelector(`.fc-dropdown-trigger[data-filter="${filterType}"]`);
  const textSpan = trigger.querySelector('.fc-dropdown-text');
  const checkboxes = panel.querySelectorAll('input[type="checkbox"]:not([value=""]):checked');
  
  if (checkboxes.length === 0) {
    textSpan.textContent = 'None';
  } else if (checkboxes.length === panel.querySelectorAll('input[type="checkbox"]:not([value=""])').length) {
    textSpan.textContent = 'All';
  } else {
    textSpan.textContent = `${checkboxes.length} selected`;
  }
}

// Initialize Search
function initFcSearch() {
  const yearSelect = document.getElementById('fc-year-select');
  const skuInput = document.getElementById('fc-sku-input');

  // Year change triggers data load and resets pagination
  yearSelect.addEventListener('change', () => {
    fcPaginationState.currentPage = 1;
    renderFcRegularTable();
    renderFcEventTable();
  });

  // SKU input with Enter key
  skuInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      fcPaginationState.currentPage = 1;
      renderFcRegularTable();
      renderFcEventTable();
    }
  });
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initFcTabs();
  initFcDropdown();
  initFcSearch();
  initFcPagination();
  updatePaginationInfo(0);
});
