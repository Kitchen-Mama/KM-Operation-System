// FC Summary - Mock Data and Logic

// Pagination state
const fcPaginationState = {
  currentPage: 1,
  pageSize: 25,
  totalItems: 0
};

// Get data from data.js
const fcRegularMock = window.fcRegularData || [];
const fcEventMock = window.fcEventData || [];

// Get filter values from DOM
function getFcFilters() {
  const getSelectedFromDropdown = (filterType) => {
    const panel = document.querySelector(`#fc-summary-section .fc-dropdown-panel[data-filter="${filterType}"]`);
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
  
  // === Data source: Demo ON -> demo mapping; Demo OFF -> Google Sheet fc_regular_forecast ===
  var _fcRegularSource = [];
  if (window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled()) {
    _fcRegularSource = _getDemoFcRegularData();
  } else {
    _fcRegularSource = _getDbFcRegularData();
  }
  // === End Data source ===
  const filteredData = filterFcRegular(_fcRegularSource, filters);
  
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

  // Calculate FC占比 for each item
  const fcPercentages = calculateFcPercentages(filteredData);

  // Render fixed column (SKU)
  fixedBody.innerHTML = paginatedData.map(item => `
    <div class="fixed-row">
      <div class="fixed-cell">${item.sku}</div>
    </div>
  `).join('');

  // Render scrollable columns
  scrollBody.innerHTML = paginatedData.map(item => {
    const total = item.months.reduce((sum, val) => sum + val, 0);
    const key = `${item.company}-${item.sku}-${item.marketplace}`;
    const percentage = fcPercentages[key] || 0;
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
        <div class="scroll-cell cell-percentage">${percentage.toFixed(1)}%</div>
      </div>
    `;
  }).join('');

  updatePaginationInfo(filteredData.length);
  syncFcScroll('regular');
}

// Calculate FC占比 by Company + SKU
function calculateFcPercentages(data) {
  const percentages = {};
  
  // Group by Company + SKU
  const groups = {};
  data.forEach(item => {
    const groupKey = `${item.company}-${item.sku}`;
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(item);
  });
  
  // Calculate percentage for each marketplace within the group
  Object.keys(groups).forEach(groupKey => {
    const items = groups[groupKey];
    const totals = items.map(item => {
      const total = item.months.reduce((sum, val) => sum + (val || 0), 0);
      return { item, total };
    });
    
    const grandTotal = totals.reduce((sum, t) => sum + t.total, 0);
    
    totals.forEach(({ item, total }) => {
      const key = `${item.company}-${item.sku}-${item.marketplace}`;
      percentages[key] = grandTotal > 0 ? (total / grandTotal) * 100 : 0;
    });
  });
  
  // Validate: Check if sum equals 100% for each group
  Object.keys(groups).forEach(groupKey => {
    const items = groups[groupKey];
    const sum = items.reduce((acc, item) => {
      const key = `${item.company}-${item.sku}-${item.marketplace}`;
      return acc + (percentages[key] || 0);
    }, 0);
    
    if (Math.abs(sum - 100) > 0.1 && sum > 0) {
      console.warn(`FC占比總和不等於100%: ${groupKey}, sum=${sum.toFixed(2)}%`);
    }
  });
  
  return percentages;
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
  
  // === Demo Data Layer: Phase 3C (Event) ===
  var _fcEventSource = []; // Default: no data
  if (window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled()) {
    _fcEventSource = _getDemoFcEventData();
  }
  // === End Demo Data Layer ===
  const filteredData = filterFcEvent(_fcEventSource, filters);
  
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

  // Calculate FC占比 for Event
  const eventFcPercentages = calculateEventFcPercentages(filteredData);

  // Render fixed column (SKU)
  fixedBody.innerHTML = paginatedData.map(item => `
    <div class="fixed-row">
      <div class="fixed-cell">${item.sku}</div>
    </div>
  `).join('');

  // Render scrollable columns
  scrollBody.innerHTML = paginatedData.map(item => {
    const key = `${item.company}-${item.sku}-${item.event}-${item.marketplace}`;
    const percentage = eventFcPercentages[key] || 0;
    return `
      <div class="scroll-row">
        <div class="scroll-cell">${item.year}</div>
        <div class="scroll-cell">${item.company}</div>
        <div class="scroll-cell">${item.marketplace}</div>
        <div class="scroll-cell">${item.country}</div>
        <div class="scroll-cell">${item.category}</div>
        <div class="scroll-cell">${item.series}</div>
        <div class="scroll-cell">${item.event}</div>
        <div class="scroll-cell">${item.eventPeriod}</div>
        <div class="scroll-cell cell-qty">${item.fcQty.toLocaleString()}</div>
        <div class="scroll-cell cell-percentage">${percentage.toFixed(1)}%</div>
      </div>
    `;
  }).join('');

  updatePaginationInfo(filteredData.length);
  syncFcScroll('event');
}

// Calculate Event FC占比 by Company + SKU + Event
function calculateEventFcPercentages(data) {
  const percentages = {};
  
  // Group by Company + SKU + Event
  const groups = {};
  data.forEach(item => {
    const groupKey = `${item.company}-${item.sku}-${item.event}`;
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(item);
  });
  
  // Calculate percentage for each marketplace within the group
  Object.keys(groups).forEach(groupKey => {
    const items = groups[groupKey];
    const totals = items.map(item => ({
      item,
      total: item.fcQty || 0
    }));
    
    const grandTotal = totals.reduce((sum, t) => sum + t.total, 0);
    
    totals.forEach(({ item, total }) => {
      const key = `${item.company}-${item.sku}-${item.event}-${item.marketplace}`;
      percentages[key] = grandTotal > 0 ? (total / grandTotal) * 100 : 0;
    });
  });
  
  // Validate: Check if sum equals 100% for each group
  Object.keys(groups).forEach(groupKey => {
    const items = groups[groupKey];
    const sum = items.reduce((acc, item) => {
      const key = `${item.company}-${item.sku}-${item.event}-${item.marketplace}`;
      return acc + (percentages[key] || 0);
    }, 0);
    
    if (Math.abs(sum - 100) > 0.1 && sum > 0) {
      console.warn(`Event FC占比總和不等於100%: ${groupKey}, sum=${sum.toFixed(2)}%`);
    }
  });
  
  return percentages;
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
      
      // Update action buttons based on tab
      updateActionButtons(targetTab);
    });
  });
}

// Update action buttons based on active tab
function updateActionButtons(tab) {
  // Hide all buttons first
  document.querySelectorAll('.fc-btn-regular, .fc-btn-event, .fc-btn-target').forEach(btn => {
    btn.style.display = 'none';
  });
  
  // Show buttons for active tab
  if (tab === 'regular') {
    // Show New FC Update button
    const newFcBtn = document.querySelector('.fc-btn-event[onclick="openAddEventModal()"]');
    if (newFcBtn) newFcBtn.style.display = 'inline-flex';
    
    // Show Regular buttons
    document.querySelectorAll('.fc-btn-regular').forEach(btn => {
      if (btn.id === 'fc-edit-btn' || btn.id === 'fc-add-btn' || btn.id === 'fc-import-btn') {
        btn.style.display = fcEditState.isEditing ? 'none' : 'inline-flex';
      } else if (btn.id === 'fc-save-btn' || btn.id === 'fc-cancel-btn') {
        btn.style.display = fcEditState.isEditing ? 'inline-flex' : 'none';
      }
    });
  } else if (tab === 'event') {
    // Show New FC Update button
    const newFcBtn = document.querySelector('.fc-btn-event[onclick="openAddEventModal()"]');
    if (newFcBtn) newFcBtn.style.display = 'inline-flex';
    
    // Show Event Edit buttons
    const editBtn = document.getElementById('fc-event-edit-btn');
    const saveBtn = document.getElementById('fc-event-save-btn');
    const cancelBtn = document.getElementById('fc-event-cancel-btn');
    
    if (editBtn) editBtn.style.display = fcEditState.isEditingEvent ? 'none' : 'inline-flex';
    if (saveBtn) saveBtn.style.display = fcEditState.isEditingEvent ? 'inline-flex' : 'none';
    if (cancelBtn) cancelBtn.style.display = fcEditState.isEditingEvent ? 'inline-flex' : 'none';
  } else if (tab === 'target') {
    document.querySelectorAll('.fc-btn-target').forEach(btn => {
      btn.style.display = 'inline-flex';
    });
  }
}

// Initialize Dropdown
function initFcDropdown() {
  // FC Summary 篩選器
  const fcTriggers = document.querySelectorAll('#fc-summary-section .fc-dropdown-trigger');
  
  fcTriggers.forEach(trigger => {
    // 移除舊的事件監聽器
    const newTrigger = trigger.cloneNode(true);
    trigger.parentNode.replaceChild(newTrigger, trigger);
    
    newTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const filterType = newTrigger.dataset.filter;
      const panel = document.querySelector(`#fc-summary-section .fc-dropdown-panel[data-filter="${filterType}"]`);
      
      if (!panel) return;
      
      // Close other panels
      document.querySelectorAll('#fc-summary-section .fc-dropdown-panel').forEach(p => {
        if (p !== panel) p.classList.remove('is-open');
      });
      
      // Toggle current panel
      panel.classList.toggle('is-open');
    });
  });
  
  // Prevent panel clicks from closing
  document.querySelectorAll('#fc-summary-section .fc-dropdown-panel').forEach(panel => {
    const newPanel = panel.cloneNode(true);
    panel.parentNode.replaceChild(newPanel, panel);
    
    newPanel.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  });
}

// Initialize Factory Stock Dropdown
// NOTE: Factory Stock has its own initFactoryStockPage() in factory-stock.js.
// This function is kept as a no-op to prevent legacy calls from breaking.
// Do NOT use cloneNode or rebind events here — factory-stock.js handles its own lifecycle.
function initFactoryDropdown() {
  if (window.initFactoryStockPage) {
    // Defer to factory-stock.js's own initialization
    return;
  }
}

// Close dropdown when clicking outside (scoped to FC Summary only)
document.addEventListener('click', () => {
  document.querySelectorAll('#fc-summary-section .fc-dropdown-panel').forEach(p => {
    p.classList.remove('is-open');
  });
});

// Toggle All checkboxes
function toggleFcAll(checkbox, filterType) {
  const panel = document.querySelector(`#fc-summary-section .fc-dropdown-panel[data-filter="${filterType}"]`);
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
  const panel = document.querySelector(`#fc-summary-section .fc-dropdown-panel[data-filter="${filterType}"]`);
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
  const panel = document.querySelector(`#fc-summary-section .fc-dropdown-panel[data-filter="${filterType}"]`);
  const trigger = document.querySelector(`#fc-summary-section .fc-dropdown-trigger[data-filter="${filterType}"]`);
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

// One-time wiring of tabs / search / pagination / modal-overlay listeners.
// These bind plain (non-cloneNode) listeners, so they must run EXACTLY once.
// Markup is partial-loaded (Phase 3-4), so this can only run after #fc-summary-section
// exists. The guard makes it a safe no-op when the markup hasn't been injected yet
// (e.g. on initial DOMContentLoaded before the user opens FC Summary); the page lifecycle
// mount calls it again once the partial is present.
var _fcSummaryStaticInitDone = false;
function _fcSummaryStaticInit() {
  if (_fcSummaryStaticInitDone) return;
  if (!document.getElementById('fc-summary-section')) return;
  initFcTabs();
  initFcSearch();
  initFcPagination();
  updatePaginationInfo(0);
  var overlay = document.getElementById('fc-modal-overlay');
  if (overlay) overlay.addEventListener('click', closeFcModal);
  _fcSummaryStaticInitDone = true;
}

// Initialize on DOM ready (no-op until the FC Summary partial is injected)
document.addEventListener('DOMContentLoaded', () => {
  _fcSummaryStaticInit();
});

// Re-initialize dropdown when FC Summary section is shown
window.initFcSummaryPage = function() {
  setTimeout(() => {
    initFcDropdown();
  }, 50);
};

// ========================================
// BASE FC EDITING FUNCTIONALITY
// ========================================

// Edit state
const fcEditState = {
  isEditing: false,
  isEditingEvent: false,
  currentTab: 'regular',
  modifiedRows: new Map(),
  modifiedEventRows: new Map(),
  originalData: null,
  originalEventData: null
};

// Enter edit mode
function enterFcEditMode() {
  // Show confirmation modal
  showFcModal('fc-edit-confirm-modal');
}

// Confirm edit mode
function confirmFcEdit() {
  closeFcModal();
  fcEditState.isEditing = true;
  fcEditState.originalData = JSON.parse(JSON.stringify(fcRegularMock));
  
  // Update UI
  document.getElementById('fc-edit-btn').style.display = 'none';
  document.getElementById('fc-add-btn').style.display = 'none';
  document.getElementById('fc-save-btn').style.display = 'inline-block';
  document.getElementById('fc-cancel-btn').style.display = 'inline-block';
  
  // Re-render with editable cells
  renderFcRegularTableEditable();
}

// Render editable table
function renderFcRegularTableEditable() {
  const fixedBody = document.getElementById('fc-regular-fixed-body');
  const scrollBody = document.getElementById('fc-regular-scroll-body');
  const filters = getFcFilters();
  
  if (!filters.year) {
    fixedBody.innerHTML = '';
    scrollBody.innerHTML = '<div class="empty-row">Please select a year to view data</div>';
    return;
  }
  
  const filteredData = filterFcRegular(fcRegularMock, filters);
  const startIdx = (fcPaginationState.currentPage - 1) * fcPaginationState.pageSize;
  const endIdx = startIdx + fcPaginationState.pageSize;
  const paginatedData = filteredData.slice(startIdx, endIdx);

  // Calculate FC占比
  const fcPercentages = calculateFcPercentages(filteredData);

  // Render fixed column (SKU - readonly)
  fixedBody.innerHTML = paginatedData.map(item => `
    <div class="fixed-row">
      <div class="fixed-cell fc-cell-readonly">${item.sku}</div>
    </div>
  `).join('');

  // Render scrollable columns with editable months only
  scrollBody.innerHTML = paginatedData.map((item, idx) => {
    const total = item.months.reduce((sum, val) => sum + val, 0);
    const key = `${item.company}-${item.sku}-${item.marketplace}`;
    const percentage = fcPercentages[key] || 0;
    return `
      <div class="scroll-row" data-row-idx="${idx}">
        <div class="scroll-cell fc-cell-readonly">${item.year}</div>
        <div class="scroll-cell fc-cell-readonly">${item.company}</div>
        <div class="scroll-cell fc-cell-readonly">${item.marketplace}</div>
        <div class="scroll-cell fc-cell-readonly">${item.country}</div>
        <div class="scroll-cell fc-cell-readonly">${item.category}</div>
        <div class="scroll-cell fc-cell-readonly">${item.series}</div>
        ${item.months.map((m, mIdx) => `
          <div class="scroll-cell cell-month fc-cell-editable">
            <input type="number" value="${m}" onchange="updateFcMonth(${idx}, ${mIdx}, this.value)">
          </div>
        `).join('')}
        <div class="scroll-cell cell-total">${total.toLocaleString()}</div>
        <div class="scroll-cell cell-percentage">${percentage.toFixed(1)}%</div>
      </div>
    `;
  }).join('');

  syncFcScroll('regular');
}

// Update cell value
function updateFcCell(rowIdx, field, value) {
  const filters = getFcFilters();
  const filteredData = filterFcRegular(fcRegularMock, filters);
  const startIdx = (fcPaginationState.currentPage - 1) * fcPaginationState.pageSize;
  const item = filteredData[startIdx + rowIdx];
  
  item[field] = value;
  fcEditState.modifiedRows.set(item.sku, item);
}

// Update month value
function updateFcMonth(rowIdx, monthIdx, value) {
  const filters = getFcFilters();
  const filteredData = filterFcRegular(fcRegularMock, filters);
  const startIdx = (fcPaginationState.currentPage - 1) * fcPaginationState.pageSize;
  const item = filteredData[startIdx + rowIdx];
  
  item.months[monthIdx] = parseInt(value) || 0;
  fcEditState.modifiedRows.set(item.sku, item);
  
  // Update total
  const total = item.months.reduce((sum, val) => sum + val, 0);
  const row = document.querySelector(`[data-row-idx="${rowIdx}"]`);
  const totalCell = row.querySelector('.cell-total');
  totalCell.textContent = total.toLocaleString();
}

// Save changes
function saveFcChanges() {
  if (fcEditState.modifiedRows.size === 0) {
    alert('No changes to save');
    return;
  }
  
  // Validate data
  let hasError = false;
  fcEditState.modifiedRows.forEach((item, sku) => {
    if (item.months.some(m => isNaN(m) || m < 0)) {
      alert(`Invalid month value for SKU: ${sku}`);
      hasError = true;
    }
  });
  
  if (hasError) return;
  
  // Save to data (in real app, would call API)
  console.log('Saving changes:', Array.from(fcEditState.modifiedRows.values()));
  alert(`Successfully saved ${fcEditState.modifiedRows.size} changes`);
  
  // Exit edit mode
  exitEditMode();
}

// Cancel edit
function cancelFcEdit() {
  if (fcEditState.modifiedRows.size > 0) {
    if (!confirm('Discard all changes?')) return;
  }
  
  // Restore original data
  if (fcEditState.originalData) {
    fcRegularMock.length = 0;
    fcRegularMock.push(...fcEditState.originalData);
  }
  
  exitEditMode();
}

// Exit edit mode
function exitEditMode() {
  fcEditState.isEditing = false;
  fcEditState.modifiedRows.clear();
  fcEditState.originalData = null;
  
  // Update UI
  document.getElementById('fc-edit-btn').style.display = 'inline-block';
  document.getElementById('fc-add-btn').style.display = 'inline-block';
  document.getElementById('fc-save-btn').style.display = 'none';
  document.getElementById('fc-cancel-btn').style.display = 'none';
  
  // Re-render normal view
  renderFcRegularTable();
}

// ========================================
// EVENT FC EDITING FUNCTIONALITY
// ========================================

// Enter event edit mode
function enterEventEditMode() {
  fcEditState.isEditingEvent = true;
  fcEditState.originalEventData = JSON.parse(JSON.stringify(fcEventMock));
  
  // Update UI
  document.getElementById('fc-event-edit-btn').style.display = 'none';
  document.getElementById('fc-event-save-btn').style.display = 'inline-block';
  document.getElementById('fc-event-cancel-btn').style.display = 'inline-block';
  
  // Re-render with editable cells
  renderFcEventTableEditable();
}

// Render editable event table
function renderFcEventTableEditable() {
  const fixedBody = document.getElementById('fc-event-fixed-body');
  const scrollBody = document.getElementById('fc-event-scroll-body');
  const filters = getFcFilters();
  
  if (!filters.year) {
    fixedBody.innerHTML = '';
    scrollBody.innerHTML = '<div class="empty-row">Please select a year to view data</div>';
    return;
  }
  
  const filteredData = filterFcEvent(fcEventMock, filters);
  const startIdx = (fcPaginationState.currentPage - 1) * fcPaginationState.pageSize;
  const endIdx = startIdx + fcPaginationState.pageSize;
  const paginatedData = filteredData.slice(startIdx, endIdx);

  // Calculate FC占比
  const eventFcPercentages = calculateEventFcPercentages(filteredData);

  // Render fixed column (SKU - readonly)
  fixedBody.innerHTML = paginatedData.map(item => `
    <div class="fixed-row">
      <div class="fixed-cell fc-cell-readonly">${item.sku}</div>
    </div>
  `).join('');

  // Render scrollable columns with editable FC Qty only
  scrollBody.innerHTML = paginatedData.map((item, idx) => {
    const key = `${item.company}-${item.sku}-${item.event}-${item.marketplace}`;
    const percentage = eventFcPercentages[key] || 0;
    return `
      <div class="scroll-row" data-row-idx="${idx}">
        <div class="scroll-cell fc-cell-readonly">${item.year}</div>
        <div class="scroll-cell fc-cell-readonly">${item.company}</div>
        <div class="scroll-cell fc-cell-readonly">${item.marketplace}</div>
        <div class="scroll-cell fc-cell-readonly">${item.country}</div>
        <div class="scroll-cell fc-cell-readonly">${item.category}</div>
        <div class="scroll-cell fc-cell-readonly">${item.series}</div>
        <div class="scroll-cell fc-cell-readonly">${item.event}</div>
        <div class="scroll-cell fc-cell-readonly">${item.eventPeriod}</div>
        <div class="scroll-cell cell-qty fc-cell-editable">
          <input type="number" value="${item.fcQty}" onchange="updateEventFcQty(${idx}, this.value)">
        </div>
        <div class="scroll-cell cell-percentage">${percentage.toFixed(1)}%</div>
      </div>
    `;
  }).join('');

  syncFcScroll('event');
}

// Update event FC Qty
function updateEventFcQty(rowIdx, value) {
  const filters = getFcFilters();
  const filteredData = filterFcEvent(fcEventMock, filters);
  const startIdx = (fcPaginationState.currentPage - 1) * fcPaginationState.pageSize;
  const item = filteredData[startIdx + rowIdx];
  
  item.fcQty = parseInt(value) || 0;
  fcEditState.modifiedEventRows.set(`${item.sku}-${item.year}-${item.event}`, item);
}

// Save event changes
function saveEventChanges() {
  if (fcEditState.modifiedEventRows.size === 0) {
    alert('No changes to save');
    return;
  }
  
  // Validate data
  let hasError = false;
  fcEditState.modifiedEventRows.forEach((item, key) => {
    if (isNaN(item.fcQty) || item.fcQty < 0) {
      alert(`Invalid FC Qty for ${key}`);
      hasError = true;
    }
  });
  
  if (hasError) return;
  
  // Save to data (in real app, would call API)
  console.log('Saving event changes:', Array.from(fcEditState.modifiedEventRows.values()));
  alert(`Successfully saved ${fcEditState.modifiedEventRows.size} changes`);
  
  // Exit edit mode
  exitEventEditMode();
}

// Cancel event edit
function cancelEventEdit() {
  if (fcEditState.modifiedEventRows.size > 0) {
    if (!confirm('Discard all changes?')) return;
  }
  
  // Restore original data
  if (fcEditState.originalEventData) {
    fcEventMock.length = 0;
    fcEventMock.push(...fcEditState.originalEventData);
  }
  
  exitEventEditMode();
}

// Exit event edit mode
function exitEventEditMode() {
  fcEditState.isEditingEvent = false;
  fcEditState.modifiedEventRows.clear();
  fcEditState.originalEventData = null;
  
  // Update UI
  document.getElementById('fc-event-edit-btn').style.display = 'inline-block';
  document.getElementById('fc-event-save-btn').style.display = 'none';
  document.getElementById('fc-event-cancel-btn').style.display = 'none';
  
  // Re-render normal view
  renderFcEventTable();
}

// ========================================
// ADD SKU FUNCTIONALITY
// ========================================

function openAddSkuModal() {
  const yearSelect = document.getElementById('fc-year-select');
  const currentYear = new Date().getFullYear();
  
  // Use selected year if available, otherwise use current year
  document.getElementById('add-year-input').value = yearSelect.value || currentYear;
  showFcModal('fc-add-sku-modal');
}

function fillAllMonths(value) {
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  months.forEach(m => {
    document.getElementById(`add-${m}`).value = value || 0;
  });
}

function saveNewSku() {
  const sku = document.getElementById('add-sku-input').value.trim();
  const year = parseInt(document.getElementById('add-year-input').value);
  
  if (!sku) {
    alert('SKU is required');
    return;
  }
  
  // Check duplicate
  const exists = fcRegularMock.some(item => 
    item.sku === sku && item.year === year
  );
  
  if (exists) {
    alert('This SKU already exists for the selected year');
    return;
  }
  
  // Create new item
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const newItem = {
    sku,
    year,
    company: document.getElementById('add-company-input').value,
    marketplace: document.getElementById('add-marketplace-input').value,
    country: document.getElementById('add-country-input').value,
    category: document.getElementById('add-category-input').value,
    series: document.getElementById('add-series-input').value,
    months: months.map(m => parseInt(document.getElementById(`add-${m}`).value) || 0)
  };
  
  // Add to data
  fcRegularMock.push(newItem);
  
  // Re-render
  renderFcRegularTable();
  closeFcModal();
  alert('SKU added successfully');
}

// ========================================
// TARGET % RULES FUNCTIONALITY
// ========================================

// Target rules data
const targetRules = [];

function openAddTargetRuleModal() {
  const yearSelect = document.getElementById('fc-year-select');
  const currentYear = new Date().getFullYear();
  
  // Use selected year if available, otherwise use current year
  document.getElementById('target-year-input').value = yearSelect.value || currentYear;
  updateTargetScopeFields();
  showFcModal('fc-add-target-modal');
}

function updateTargetScopeFields() {
  const scope = document.getElementById('target-scope-input').value;
  
  document.getElementById('target-category-group').style.display = 
    (scope === 'Category' || scope === 'Series') ? 'block' : 'none';
  document.getElementById('target-series-group').style.display = 
    (scope === 'Series' || scope === 'SKU') ? 'block' : 'none';
  document.getElementById('target-sku-group').style.display = 
    (scope === 'SKU') ? 'block' : 'none';
}

function fillAllTargetMonths(value) {
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  months.forEach(m => {
    document.getElementById(`target-${m}`).value = value || 100;
  });
}

function saveNewTargetRule() {
  const scope = document.getElementById('target-scope-input').value;
  const year = parseInt(document.getElementById('target-year-input').value);
  const marketplace = document.getElementById('target-marketplace-input').value;
  
  // SKU validation for SKU scope
  if (scope === 'SKU') {
    const inputSku = document.getElementById('target-sku-input').value.trim();
    if (!inputSku) {
      alert('SKU is required for SKU scope');
      return;
    }
    
    // Check if SKU exists in SKU Details
    const allSkus = [...upcomingSkuData, ...runningSkuData, ...phasingOutSkuData];
    const skuExists = allSkus.some(item => item.sku === inputSku);
    
    if (!skuExists) {
      alert('無此SKU，請確認SKU是否存在於SKU Details中');
      return;
    }
  }
  
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const percentages = {};
  months.forEach(m => {
    percentages[m] = parseInt(document.getElementById(`target-${m}`).value) || 100;
  });
  
  const rule = {
    id: `rule-${Date.now()}`,
    scope,
    year,
    marketplace,
    category: scope !== 'SKU' ? document.getElementById('target-category-input').value : null,
    series: (scope === 'Series' || scope === 'SKU') ? document.getElementById('target-series-input').value : null,
    sku: scope === 'SKU' ? document.getElementById('target-sku-input').value : null,
    percentages
  };
  
  targetRules.push(rule);
  renderTargetRulesTable();
  closeFcModal();
  alert('Target rule added successfully');
}

// Get effective target percentage
function getEffectiveTargetPct({ sku, year, month, category, series, marketplace }) {
  // 1. Check SKU level
  const skuRule = targetRules.find(r => 
    r.scope === 'SKU' && 
    r.sku === sku && 
    r.year === year &&
    (r.marketplace === 'All' || r.marketplace === marketplace)
  );
  if (skuRule) return skuRule.percentages[month];
  
  // 2. Check Series level
  const seriesRule = targetRules.find(r => 
    r.scope === 'Series' && 
    r.series === series && 
    (r.category === 'All' || r.category === category) && 
    r.year === year &&
    (r.marketplace === 'All' || r.marketplace === marketplace)
  );
  if (seriesRule) return seriesRule.percentages[month];
  
  // 3. Check Category level
  const categoryRule = targetRules.find(r => 
    r.scope === 'Category' && 
    (r.category === 'All' || r.category === category) && 
    r.year === year &&
    (r.marketplace === 'All' || r.marketplace === marketplace)
  );
  if (categoryRule) return categoryRule.percentages[month];
  
  // 4. Default 100%
  return 100;
}

// Calculate effective FC
function calculateEffectiveFC(baseFC, targetPct) {
  return Math.round(baseFC * targetPct / 100);
}

// Render Target Rules Table
function renderTargetRulesTable() {
  const fixedBody = document.getElementById('fc-target-fixed-body');
  const scrollBody = document.getElementById('fc-target-scroll-body');
  
  if (targetRules.length === 0) {
    fixedBody.innerHTML = '';
    scrollBody.innerHTML = '<div class="empty-row">No target rules defined</div>';
    return;
  }
  
  fixedBody.innerHTML = targetRules.map(rule => `
    <div class="fixed-row">
      <div class="fixed-cell">${rule.scope}</div>
    </div>
  `).join('');
  
  scrollBody.innerHTML = targetRules.map(rule => {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    return `
      <div class="scroll-row">
        <div class="scroll-cell">${rule.year}</div>
        <div class="scroll-cell">${rule.marketplace || 'All'}</div>
        <div class="scroll-cell">${rule.category || '-'}</div>
        <div class="scroll-cell">${rule.series || '-'}</div>
        <div class="scroll-cell">${rule.sku || '-'}</div>
        ${months.map(m => `<div class="scroll-cell">${rule.percentages[m]}%</div>`).join('')}
        <div class="scroll-cell">
          <button class="fc-btn fc-btn--cancel" onclick="deleteTargetRule('${rule.id}')">Delete</button>
        </div>
      </div>
    `;
  }).join('');
  
  syncFcScroll('target');
}

function deleteTargetRule(ruleId) {
  if (!confirm('Delete this target rule?')) return;
  
  const idx = targetRules.findIndex(r => r.id === ruleId);
  if (idx !== -1) {
    targetRules.splice(idx, 1);
    renderTargetRulesTable();
  }
}

// ========================================
// MODAL UTILITIES
// ========================================

function showFcModal(modalId) {
  document.getElementById('fc-modal-overlay').classList.add('is-open');
  document.getElementById(modalId).classList.add('is-open');
}

function closeFcModal() {
  document.getElementById('fc-modal-overlay').classList.remove('is-open');
  document.querySelectorAll('.fc-modal').forEach(m => m.classList.remove('is-open'));
}

// Close modal on overlay click — bound once in _fcSummaryStaticInit() after the
// FC Summary partial is injected (the overlay lives inside the partial markup).


// ========================================
// DATA INTEGRITY & SAFE CALCULATION
// ========================================

// Validate data integrity across all three datasets
function validateDataIntegrity() {
  const issues = [];
  
  // Check 1: Target Rules with SKU scope should have matching Base FC
  targetRules.forEach(rule => {
    if (rule.scope === 'SKU' && rule.sku) {
      const exists = fcRegularMock.some(fc => 
        fc.sku === rule.sku && fc.year === rule.year
      );
      if (!exists) {
        issues.push({
          type: 'ORPHAN_TARGET_RULE',
          severity: 'WARNING',
          message: `Target rule for SKU ${rule.sku} (Year ${rule.year}) has no matching Base FC`,
          ruleId: rule.id
        });
      }
    }
  });
  
  // Check 2: Category consistency
  const categories = new Set(fcRegularMock.map(fc => fc.category));
  targetRules.forEach(rule => {
    if (rule.category && rule.category !== 'All' && !categories.has(rule.category)) {
      issues.push({
        type: 'INVALID_CATEGORY',
        severity: 'ERROR',
        message: `Target rule uses unknown category: ${rule.category}`,
        ruleId: rule.id
      });
    }
  });
  
  // Check 3: Series consistency
  const series = new Set(fcRegularMock.map(fc => fc.series));
  targetRules.forEach(rule => {
    if (rule.series && !series.has(rule.series)) {
      issues.push({
        type: 'INVALID_SERIES',
        severity: 'WARNING',
        message: `Target rule uses unknown series: ${rule.series}`,
        ruleId: rule.id
      });
    }
  });
  
  // Check 4: Marketplace consistency
  const marketplaces = new Set(fcRegularMock.map(fc => fc.marketplace));
  targetRules.forEach(rule => {
    if (rule.marketplace && rule.marketplace !== 'All' && !marketplaces.has(rule.marketplace)) {
      issues.push({
        type: 'INVALID_MARKETPLACE',
        severity: 'WARNING',
        message: `Target rule uses unknown marketplace: ${rule.marketplace}`,
        ruleId: rule.id
      });
    }
  });
  
  return issues;
}

// Safe version of Effective FC calculation with error handling
function getEffectiveFcSafe({ sku, year, month, category, series, marketplace }) {
  // Step 1: Find Base FC
  const baseFcItem = fcRegularMock.find(item => 
    item.sku === sku && 
    item.year === year &&
    item.marketplace === marketplace
  );
  
  if (!baseFcItem) {
    console.warn(`No Base FC found for SKU: ${sku}, Year: ${year}, Marketplace: ${marketplace}`);
    return {
      sku,
      year,
      month,
      baseFc: 0,
      targetPct: 100,
      effectiveFc: 0,
      ruleSource: 'NONE',
      warning: 'NO_BASE_FC'
    };
  }
  
  // Step 2: Get Target %
  const targetPct = getEffectiveTargetPct({
    sku,
    year,
    month,
    category,
    series,
    marketplace
  });
  
  // Step 3: Calculate Effective FC
  const monthIndex = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(month);
  const baseFc = baseFcItem.months[monthIndex];
  const effectiveFc = calculateEffectiveFC(baseFc, targetPct);
  
  // Step 4: Determine rule source
  const ruleSource = determineRuleSource({ sku, year, month, category, series, marketplace });
  
  return {
    sku,
    year,
    month,
    baseFc,
    targetPct,
    effectiveFc,
    ruleSource,
    warning: null
  };
}

// Determine which rule was used (for debugging/display)
function determineRuleSource({ sku, year, month, category, series, marketplace }) {
  // Check SKU level
  const skuRule = targetRules.find(r => 
    r.scope === 'SKU' && 
    r.sku === sku && 
    r.year === year &&
    (r.marketplace === 'All' || r.marketplace === marketplace)
  );
  if (skuRule) return 'SKU';
  
  // Check Series level
  const seriesRule = targetRules.find(r => 
    r.scope === 'Series' && 
    r.series === series && 
    (r.category === 'All' || r.category === category) && 
    r.year === year &&
    (r.marketplace === 'All' || r.marketplace === marketplace)
  );
  if (seriesRule) return 'SERIES';
  
  // Check Category level
  const categoryRule = targetRules.find(r => 
    r.scope === 'Category' && 
    (r.category === 'All' || r.category === category) && 
    r.year === year &&
    (r.marketplace === 'All' || r.marketplace === marketplace)
  );
  if (categoryRule) return 'CATEGORY';
  
  return 'DEFAULT';
}

// Export data for API sync (future use)
function exportFcDataForSync(year) {
  if (!year) {
    console.error('Year is required for export');
    return null;
  }
  
  return {
    year,
    timestamp: new Date().toISOString(),
    regularForecast: fcRegularMock.filter(item => item.year === year),
    specialEvents: fcEventMock.filter(item => item.year === year),
    targetRules: targetRules.filter(rule => rule.year === year),
    metadata: {
      totalRegularRecords: fcRegularMock.filter(item => item.year === year).length,
      totalEventRecords: fcEventMock.filter(item => item.year === year).length,
      totalRules: targetRules.filter(rule => rule.year === year).length
    }
  };
}

// Console helper for debugging
window.fcDebug = {
  validateIntegrity: validateDataIntegrity,
  getEffectiveFc: getEffectiveFcSafe,
  exportData: exportFcDataForSync,
  showData: () => ({
    regular: fcRegularMock,
    events: fcEventMock,
    rules: targetRules
  })
};

console.log('FC Summary Debug Tools Available: window.fcDebug');


// ========================================
// NEW FC UPDATE FUNCTIONALITY
// ========================================

// Global variable to store target year
let fcTargetYear = null;

// Mock Actual Units data (in real app, this would come from sales data)
const actualUnitsData = {}; // Format: { sku: { year: [jan, feb, ...] } }

// Open mode selection modal
function openAddEventModal() {
  // Get current year and set target year to next year
  const currentYear = new Date().getFullYear();
  fcTargetYear = currentYear + 1;
  
  // Show mode selection modal
  showFcModal('fc-mode-select-modal');
}

// Proceed to selected mode
function proceedToFcMode() {
  const selectedMode = document.querySelector('input[name="fc-mode"]:checked').value;
  
  // Close mode selection modal
  closeFcModal();
  
  // Open corresponding modal
  if (selectedMode === 'regular') {
    openRegularUpdateModal();
  } else if (selectedMode === 'event') {
    openEventModal();
  }
}

// Open Regular FC Update Modal
function openRegularUpdateModal() {
  document.getElementById('regular-target-year').value = fcTargetYear;
  document.getElementById('regular-base-year').value = fcTargetYear - 1;
  document.getElementById('regular-update-method').value = 'actual';
  toggleRegularMethodFields();
  showFcModal('fc-regular-update-modal');
}

// Toggle fields based on selected method
function toggleRegularMethodFields() {
  const method = document.getElementById('regular-update-method').value;
  const targetMonthRow = document.getElementById('target-month-row');
  const growthRateInput = document.getElementById('regular-growth-rate');
  const methodDesc = document.getElementById('method-description');
  
  if (method === 'manual') {
    targetMonthRow.style.display = 'flex';
    growthRateInput.parentElement.parentElement.style.display = 'flex';
    methodDesc.innerHTML = '<strong>Manual Input:</strong> Select a specific month. Uses Base Year\'s Forecast Units for that month × (1 + Growth Rate%) to generate Target Year forecast for the selected month only.';
  } else {
    targetMonthRow.style.display = 'none';
    growthRateInput.parentElement.parentElement.style.display = 'flex';
    
    if (method === 'actual') {
      methodDesc.innerHTML = '<strong>Apply Growth Rate:</strong> Uses Base Year\'s Actual Units × (1 + Growth Rate%) to generate Target Year forecast for all months.';
    } else if (method === 'forecast') {
      methodDesc.innerHTML = '<strong>Copy from Previous Year:</strong> Uses Base Year\'s Forecast Units × (1 + Growth Rate%) to generate Target Year forecast for all months.';
    }
  }
}

// Open Event Modal
function openEventModal() {
  document.getElementById('event-target-year').value = fcTargetYear;
  document.getElementById('event-base-year').value = fcTargetYear - 1;
  document.getElementById('event-update-method').value = 'actual';
  toggleEventMethodFields();
  showFcModal('fc-add-event-modal');
}

// Toggle Event method fields
function toggleEventMethodFields() {
  const method = document.getElementById('event-update-method').value;
  const eventSelectRow = document.getElementById('event-select-row');
  const manualFields = document.getElementById('event-manual-fields');
  const growthRateInput = document.getElementById('event-growth-rate');
  const methodDesc = document.getElementById('event-method-description');
  
  if (method === 'manual') {
    eventSelectRow.style.display = 'none';
    manualFields.style.display = 'block';
    growthRateInput.parentElement.parentElement.style.display = 'none';
    methodDesc.innerHTML = '<strong>Manual Input:</strong> Manually enter all event details including SKU, Event, Period, and FC Qty.';
  } else {
    eventSelectRow.style.display = 'flex';
    manualFields.style.display = 'none';
    growthRateInput.parentElement.parentElement.style.display = 'flex';
    
    if (method === 'actual') {
      methodDesc.innerHTML = '<strong>Apply Growth Rate:</strong> Uses Base Year\'s Actual Event Units × (1 + Growth Rate%) to generate Target Year event forecast.';
    } else if (method === 'forecast') {
      methodDesc.innerHTML = '<strong>Copy from Previous Year:</strong> Uses Base Year\'s Forecast Event Units × (1 + Growth Rate%) to generate Target Year event forecast.';
    }
  }
}

// Open Add New Event Name modal (placeholder)
function openAddNewEventName() {
  const newEventName = prompt('Enter new event name:');
  if (newEventName && newEventName.trim()) {
    // Add to both dropdowns
    const option1 = new Option(newEventName.trim(), newEventName.trim());
    const option2 = new Option(newEventName.trim(), newEventName.trim());
    document.getElementById('event-event-select').add(option1);
    document.getElementById('event-event-input').add(option2);
    alert(`Event "${newEventName.trim()}" added successfully`);
  }
}

// Save Event Update
function saveEventUpdate() {
  const targetYear = parseInt(document.getElementById('event-target-year').value);
  const baseYear = parseInt(document.getElementById('event-base-year').value);
  const method = document.getElementById('event-update-method').value;
  const growthRate = parseFloat(document.getElementById('event-growth-rate').value) || 0;
  
  if (method === 'manual') {
    // Manual Input mode - save single event
    saveNewEvent();
    return;
  }
  
  // Apply Growth Rate or Copy from Previous Year
  const selectedEvent = document.getElementById('event-event-select').value;
  let addedCount = 0;
  let skippedCount = 0;
  
  // Get base year event data
  const baseYearEvents = fcEventMock.filter(item => 
    item.year === baseYear && item.event === selectedEvent
  );
  
  if (baseYearEvents.length === 0) {
    alert(`No event data found for "${selectedEvent}" in Base Year ${baseYear}.`);
    return;
  }
  
  baseYearEvents.forEach(baseEvent => {
    // Check if already exists
    const exists = fcEventMock.some(item => 
      item.sku === baseEvent.sku && 
      item.year === targetYear && 
      item.event === baseEvent.event
    );
    
    if (exists) {
      skippedCount++;
      return;
    }
    
    // Calculate new FC Qty
    let newFcQty;
    if (method === 'actual') {
      // Use Actual Event Units (mock - using forecast as actual)
      newFcQty = Math.round(baseEvent.fcQty * (1 + growthRate / 100));
    } else if (method === 'forecast') {
      // Use Forecast Event Units
      newFcQty = Math.round(baseEvent.fcQty * (1 + growthRate / 100));
    }
    
    const newEvent = {
      sku: baseEvent.sku,
      year: targetYear,
      company: baseEvent.company,
      marketplace: baseEvent.marketplace,
      country: baseEvent.country,
      category: baseEvent.category,
      series: baseEvent.series,
      event: baseEvent.event,
      eventPeriod: baseEvent.eventPeriod,
      fcQty: newFcQty
    };
    
    fcEventMock.push(newEvent);
    addedCount++;
  });
  
  const methodName = method === 'actual' ? 'Apply Growth Rate (Actual)' : 'Copy from Previous Year (Forecast)';
  
  alert(
    `Event FC Update Complete!\n\n` +
    `Method: ${methodName}\n` +
    `Event: ${selectedEvent}\n` +
    `Target Year: ${targetYear}\n` +
    `Growth Rate: ${growthRate}%\n\n` +
    `Added: ${addedCount} event(s)\n` +
    `Skipped: ${skippedCount} event(s) (already exists)`
  );
  
  renderFcEventTable();
  closeFcModal();
}

// Check if data already exists
function checkDataExists(sku, year, monthIndex = null) {
  if (monthIndex === null) {
    // Check all months
    return fcRegularMock.some(item => item.sku === sku && item.year === year);
  } else {
    // Check specific month
    const existing = fcRegularMock.find(item => item.sku === sku && item.year === year);
    return existing && existing.months[monthIndex] !== undefined && existing.months[monthIndex] !== 0;
  }
}

// Save Regular Update
function saveRegularUpdate() {
  const targetYear = parseInt(document.getElementById('regular-target-year').value);
  const baseYear = parseInt(document.getElementById('regular-base-year').value);
  const method = document.getElementById('regular-update-method').value;
  const growthRate = parseFloat(document.getElementById('regular-growth-rate').value) || 0;
  const targetMonth = method === 'manual' ? parseInt(document.getElementById('regular-target-month').value) : null;
  
  let addedCount = 0;
  let skippedCount = 0;
  let updatedData = [];
  
  // Get base year data
  const baseYearData = fcRegularMock.filter(item => item.year === baseYear);
  
  if (baseYearData.length === 0) {
    alert(`No data found for Base Year ${baseYear}. Please ensure base year data exists.`);
    return;
  }
  
  // Process based on method
  baseYearData.forEach(baseItem => {
    const sku = baseItem.sku;
    
    if (method === 'manual') {
      // Manual Input: Only update specific month
      if (checkDataExists(sku, targetYear, targetMonth)) {
        skippedCount++;
        return;
      }
      
      // Check if SKU exists for target year
      let targetItem = fcRegularMock.find(item => item.sku === sku && item.year === targetYear);
      
      if (!targetItem) {
        // Create new entry
        targetItem = {
          sku: baseItem.sku,
          year: targetYear,
          company: baseItem.company,
          marketplace: baseItem.marketplace,
          country: baseItem.country,
          category: baseItem.category,
          series: baseItem.series,
          months: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        };
        fcRegularMock.push(targetItem);
      }
      
      // Update specific month using Forecast Units from base year
      const baseForecast = baseItem.months[targetMonth];
      targetItem.months[targetMonth] = Math.round(baseForecast * (1 + growthRate / 100));
      addedCount++;
      updatedData.push({ sku, month: targetMonth, value: targetItem.months[targetMonth] });
      
    } else {
      // Apply Growth Rate or Copy from Previous Year: Update all months
      if (checkDataExists(sku, targetYear)) {
        skippedCount++;
        return;
      }
      
      let newMonths;
      
      if (method === 'actual') {
        // Use Actual Units (mock data - in real app would fetch from sales)
        // For demo, we'll use base year forecast as "actual"
        newMonths = baseItem.months.map(m => Math.round(m * (1 + growthRate / 100)));
      } else if (method === 'forecast') {
        // Use Forecast Units from base year
        newMonths = baseItem.months.map(m => Math.round(m * (1 + growthRate / 100)));
      }
      
      const newItem = {
        sku: baseItem.sku,
        year: targetYear,
        company: baseItem.company,
        marketplace: baseItem.marketplace,
        country: baseItem.country,
        category: baseItem.category,
        series: baseItem.series,
        months: newMonths
      };
      
      fcRegularMock.push(newItem);
      addedCount++;
      updatedData.push({ sku, months: newMonths });
    }
  });
  
  // Show result
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const methodName = method === 'actual' ? 'Apply Growth Rate (Actual)' : 
                     method === 'forecast' ? 'Copy from Previous Year (Forecast)' : 
                     'Manual Input';
  const targetInfo = method === 'manual' ? ` for ${monthNames[targetMonth]}` : ' for all months';
  
  alert(
    `Regular FC Update Complete!\n\n` +
    `Method: ${methodName}\n` +
    `Target Year: ${targetYear}${targetInfo}\n` +
    `Growth Rate: ${growthRate}%\n\n` +
    `Added: ${addedCount} SKU(s)\n` +
    `Skipped: ${skippedCount} SKU(s) (already exists)\n\n` +
    `Note: This is a demo. Data is stored in memory only.`
  );
  
  console.log('Updated Data:', updatedData);
  
  // Refresh table if on Regular Forecast tab
  renderFcRegularTable();
  closeFcModal();
}

function saveNewEvent() {
  const sku = document.getElementById('event-sku-input').value.trim();
  const year = parseInt(document.getElementById('event-year-input').value);
  const event = document.getElementById('event-event-input').value;
  const eventPeriod = document.getElementById('event-period-input').value.trim();
  const fcQty = parseInt(document.getElementById('event-qty-input').value);
  
  if (!sku) {
    alert('SKU is required');
    return;
  }
  
  if (!eventPeriod) {
    alert('Event Period is required');
    return;
  }
  
  if (isNaN(fcQty) || fcQty < 0) {
    alert('Please enter a valid FC Qty');
    return;
  }
  
  // Check duplicate
  const exists = fcEventMock.some(item => 
    item.sku === sku && 
    item.year === year && 
    item.event === event &&
    item.eventPeriod === eventPeriod
  );
  
  if (exists) {
    alert('This event already exists for the selected SKU and period');
    return;
  }
  
  // Create new event item
  const newEvent = {
    sku,
    year,
    company: document.getElementById('event-company-input').value,
    marketplace: document.getElementById('event-marketplace-input').value,
    country: document.getElementById('event-country-input').value,
    category: document.getElementById('event-category-input').value,
    series: document.getElementById('event-series-input').value,
    event,
    eventPeriod,
    fcQty
  };
  
  // Add to data
  fcEventMock.push(newEvent);
  
  // Re-render
  renderFcEventTable();
  closeFcModal();
  alert('Event added successfully');
}






// ========================================
// Demo Data Layer: Phase 3C - FC Summary Mapping
// ========================================
function _getDemoFcRegularData() {
    var rows = window.KM.DemoData.getFcSummaryRows({});
    return rows.map(function(r) {
        var monthVal = r.regular_forecast || 0;
        return {
            sku: r.sku,
            year: 2026,
            company: 'ResTW',
            marketplace: r.marketplace || 'Amazon',
            country: r.country || 'US',
            category: r.category || '',
            series: r.series || '',
            months: [monthVal, monthVal, monthVal, monthVal, monthVal, monthVal,
                     monthVal, monthVal, monthVal, monthVal, monthVal, monthVal]
        };
    });
}

function _getDemoFcEventData() {
    var rows = window.KM.DemoData.getFcSummaryRows({});
    return rows.filter(function(r) { return r.event_forecast > 0; }).map(function(r) {
        return {
            sku: r.sku,
            year: 2026,
            company: 'ResTW',
            marketplace: r.marketplace || 'Amazon',
            country: r.country || 'US',
            category: r.category || '',
            series: r.series || '',
            event: 'Prime Day',
            eventPeriod: '2026/07/15-2026/07/16',
            fcQty: r.event_forecast || 0
        };
    });
}

function _showFcSummaryDemoBadge() {
    var section = document.getElementById('fc-summary-section');
    if (!section) return;
    if (section.querySelector('.demo-badge')) return;
    var h2 = section.querySelector('h2');
    if (!h2) return;
    var badge = document.createElement('span');
    badge.className = 'demo-badge';
    badge.style.cssText = 'background:#8b5cf6;color:white;padding:2px 8px;border-radius:4px;font-size:11px;margin-left:12px;vertical-align:middle;';
    badge.textContent = 'Demo Data Mode';
    h2.appendChild(badge);
}

function _removeFcSummaryDemoBadge() {
    var badge = document.querySelector('#fc-summary-section .demo-badge');
    if (badge) badge.remove();
}

// Patch initFcSummaryPage to show/hide badge
var _origInitFcSummaryPage = window.initFcSummaryPage;
window.initFcSummaryPage = function() {
    _origInitFcSummaryPage();
    if (window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled()) {
        _showFcSummaryDemoBadge();
    } else {
        _removeFcSummaryDemoBadge();
    }
};

// Debug helper
window.debugFcSummaryDemoData = function() {
    var enabled = window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled();
    console.log('=== FC Summary Demo Data Debug ===');
    console.log('Demo enabled:', enabled);
    if (!enabled) { console.log('Demo mode is OFF. Use setDemoDataMode(true) to enable.'); return; }
    var rows = window.KM.DemoData.getFcSummaryRows({});
    console.log('DemoData fcSummary rows:', rows.length);
    var mapped = _getDemoFcRegularData();
    console.log('Mapped FC Regular rows:', mapped.length);
    var events = _getDemoFcEventData();
    console.log('Mapped FC Event rows:', events.length);
    console.log('--- First 5 raw rows ---');
    console.table(rows.slice(0, 5));
    console.log('--- First 10 mapped regular rows ---');
    console.table(mapped.slice(0, 10));
};

// ========================================
// Cloud (Demo OFF) DB connection: fc_regular_forecast
// ========================================

// Map fc_regular_forecast rows to the Regular Forecast render shape.
// Source of truth is fc_regular_forecast ONLY (no marketplace_skus universe supplementation here).
function _getDbFcRegularData() {
    var fcRows = (window.KM && window.KM.DB && window.KM.DB.getFcRegularForecast) ? window.KM.DB.getFcRegularForecast() : [];
    return fcRows.map(function(r) {
        return {
            sku: r.sku,
            year: r.year,
            company: r.company,
            marketplace: r.marketplace,
            country: r.country,
            category: r.category,
            series: r.series,
            months: [r.jan, r.feb, r.mar, r.apr, r.may, r.jun, r.jul, r.aug, r.sep, r.oct, r.nov, r.dec]
                .map(function(v) { return Math.ceil(Number(v) || 0); }), // whole-unit display
            forecastStatus: r.forecastStatus,
            fcShare: r.fcShare
        };
    });
}

// Rebuild a FC Summary filter checkbox panel from distinct DB values (Demo OFF).
function _rebuildFcPanel(filterType, values) {
    var panel = document.querySelector('#fc-summary-section .fc-dropdown-panel[data-filter="' + filterType + '"]');
    if (!panel) return;
    var html = '<label class="fc-checkbox-item"><input type="checkbox" value="" checked onchange="toggleFcAll(this, \'' + filterType + '\')"> <strong>All</strong></label>';
    values.forEach(function(v) {
        html += '<label class="fc-checkbox-item"><input type="checkbox" value="' + v + '" checked onchange="updateFcFilter(\'' + filterType + '\')"> ' + v + '</label>';
    });
    panel.innerHTML = html;
}

// Populate company/marketplace/country/category/series filter options from fc_regular_forecast distinct values.
// Event filter is left as-is (Special Event not connected in this task).
function _populateFcFilterOptionsFromDb() {
    // Build options ONLY from actual fc_regular_forecast data. No static/demo fallback:
    // when DB is empty, panels are rebuilt with just the "All" entry (no fake options).
    var rows = (window.KM && window.KM.DB && window.KM.DB.getFcRegularForecast) ? window.KM.DB.getFcRegularForecast() : [];
    var distinct = function(key) {
        var arr = [];
        rows.forEach(function(r) { var v = String(r[key] || '').trim(); if (v && arr.indexOf(v) === -1) arr.push(v); });
        arr.sort();
        return arr;
    };
    _rebuildFcPanel('company', distinct('company'));
    _rebuildFcPanel('marketplace', distinct('marketplace'));
    _rebuildFcPanel('country', distinct('country'));
    _rebuildFcPanel('category', distinct('category'));
    _rebuildFcPanel('series', distinct('series'));
    ['company', 'marketplace', 'country', 'category', 'series'].forEach(function(t) {
        if (typeof updateFcFilterText === 'function') updateFcFilterText(t);
    });
}

// Populate the Year dropdown from fc_regular_forecast.year distinct values (Demo OFF).
function _populateFcYearFromDb() {
    var sel = document.getElementById('fc-year-select');
    if (!sel) return;
    var rows = (window.KM && window.KM.DB && window.KM.DB.getFcRegularForecast) ? window.KM.DB.getFcRegularForecast() : [];
    var years = [];
    rows.forEach(function(r) { var y = String(r.year || '').trim(); if (y && years.indexOf(y) === -1) years.push(y); });
    years.sort(function(a, b) { return Number(b) - Number(a); });
    var prev = sel.value;
    // Always rebuild from DB distinct years (no static fallback). Empty DB -> only the default "----".
    sel.innerHTML = '<option value="">----</option>' +
        years.map(function(y) { return '<option value="' + y + '">' + y + '</option>'; }).join('');
    // Preserve a previously selected year if still valid; do NOT auto-select (no auto table populate).
    sel.value = (prev && years.indexOf(prev) !== -1) ? prev : '';
}

// Ensure DB is loaded (once), then populate filters/year and render (Demo OFF only).
function _fcSummaryEnsureDbAndRender() {
    var demoOn = window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled();
    if (demoOn) return; // demo keeps static options + its own data

    // Clear static/demo filter + year options immediately so they never appear in Demo OFF,
    // even before the DB cache finishes loading. (Empty cache -> default/empty state only.)
    _populateFcFilterOptionsFromDb();
    _populateFcYearFromDb();

    var afterLoad = function() {
        _populateFcFilterOptionsFromDb();
        _populateFcYearFromDb();
        // Render reflects current selection only: with no year selected this shows the
        // "Please select a year" empty state — table does NOT auto-populate until user action.
        renderFcRegularTable();
        renderFcEventTable();
    };
    if (!window._opDbCache) {
        var loader = (window.KM && window.KM.DB && window.KM.DB.loadOperationDb)
            ? window.KM.DB.loadOperationDb
            : (window.reloadOperationDb || null);
        if (loader) { loader({ force: true }).then(afterLoad).catch(afterLoad); return; }
    }
    afterLoad();
}

// Extend the (already demo-patched) initFcSummaryPage to also wire the DB connection.
var _prevInitFcSummaryPage = window.initFcSummaryPage;
window.initFcSummaryPage = function() {
    if (_prevInitFcSummaryPage) _prevInitFcSummaryPage();
    // Defer slightly so dropdown init (also deferred) has run; panel rebuild is order-independent.
    setTimeout(_fcSummaryEnsureDbAndRender, 60);
};

// ========================================
// Regular Forecast Import (CSV -> KM.DB.importFcRegularForecastBatch)
// Country + Marketplace are selected in the modal; company/country/marketplace/marketplace_id
// are resolved from the marketplaces registry and attached to every row. CSV carries only
// sku + jan..dec.
// ========================================
var FC_IMPORT_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
var _fcImportResolved = null; // { company, country, marketplace, marketplaceId }

function _fcImportActiveMarketplaces() {
    var list = (window.KM && window.KM.DB && window.KM.DB.getMarketplaces) ? window.KM.DB.getMarketplaces() : [];
    return list.filter(function(m) { var s = (m.status || '').toLowerCase(); return !s || s === 'active'; });
}

function _fcImportSetResolvedText(message, color) {
    var el = document.getElementById('fc-import-resolved');
    if (!el) return;
    el.style.color = color || '#475569';
    el.textContent = message;
}

function openFcImportModal() {
    var yearEl = document.getElementById('fc-import-year');
    if (yearEl) {
        var ySel = document.getElementById('fc-year-select');
        yearEl.value = (ySel && ySel.value) ? ySel.value : String(new Date().getFullYear());
    }
    var countrySel = document.getElementById('fc-import-country');
    if (countrySel) {
        var active = _fcImportActiveMarketplaces();
        var countries = [];
        active.forEach(function(m) { if (m.country && countries.indexOf(m.country) === -1) countries.push(m.country); });
        countries.sort();
        countrySel.innerHTML = '<option value="">Select Country</option>' +
            countries.map(function(c) { return '<option value="' + c + '">' + c + '</option>'; }).join('');
    }
    var mpSel = document.getElementById('fc-import-marketplace');
    if (mpSel) mpSel.innerHTML = '<option value="">Select Marketplace</option>';
    _fcImportResolved = null;
    _fcImportSetResolvedText('Select Country + Marketplace to resolve company.', '#475569');
    var fileEl = document.getElementById('fc-import-file');
    if (fileEl) fileEl.value = '';
    var resultEl = document.getElementById('fc-import-result');
    if (resultEl) { resultEl.style.display = 'none'; resultEl.innerHTML = ''; }
    var runBtn = document.getElementById('fc-import-run-btn');
    if (runBtn) { runBtn.disabled = false; runBtn.textContent = 'Import'; runBtn.dataset.mode = ''; }
    if (typeof showFcModal === 'function') showFcModal('fc-import-modal');
}

function closeFcImportModal() {
    if (typeof closeFcModal === 'function') closeFcModal();
}

// Stable option value for a marketplace registry row: marketplace_id, else company|country|marketplace.
function _fcImportRowValue(m) {
    return (m.marketplaceId && m.marketplaceId !== '') ? m.marketplaceId : (m.company + '|' + m.country + '|' + m.marketplace);
}

function onFcImportCountryChange() {
    var countrySel = document.getElementById('fc-import-country');
    var mpSel = document.getElementById('fc-import-marketplace');
    var country = countrySel ? countrySel.value : '';
    if (mpSel) {
        var active = _fcImportActiveMarketplaces();
        // One option PER registry row (so e.g. "KM Amazon" and "Amazon" under ResUS are distinct),
        // displaying marketplace_display_name, value = marketplace_id (fallback composite key).
        var rowsForCountry = active.filter(function(m) { return !country || m.country === country; });
        mpSel.innerHTML = '<option value="">Select Marketplace</option>' +
            rowsForCountry.map(function(m) {
                var val = _fcImportRowValue(m);
                var label = m.marketplaceDisplayName || m.marketplace || m.marketplaceId || val;
                return '<option value="' + _fcEscapeHtml(val) + '">' + _fcEscapeHtml(label) + '</option>';
            }).join('');
    }
    _fcImportResolved = null;
    _fcImportSetResolvedText('Select Country + Marketplace to resolve company.', '#475569');
}

// Resolve exactly one active marketplace registry row from the selected country + marketplace.
// Sets _fcImportResolved on success; returns { ok, error? }.
function _fcResolveImportMarketplace() {
    _fcImportResolved = null;
    var mpSel = document.getElementById('fc-import-marketplace');
    var val = mpSel ? mpSel.value : '';
    if (!val) return { ok: false, error: 'Select Country and Marketplace.' };
    // Resolve the EXACT selected registry row by option value (marketplace_id / composite key),
    // not by country + marketplace text — this disambiguates shared platform names.
    var matches = _fcImportActiveMarketplaces().filter(function(m) { return _fcImportRowValue(m) === val; });
    if (matches.length === 0) return { ok: false, error: 'Selected marketplace not found in the active registry.' };
    if (matches.length > 1) return { ok: false, error: 'Selected marketplace value is ambiguous in the registry.' };
    var m = matches[0];
    _fcImportResolved = {
        company: m.company,
        country: m.country,
        marketplace: m.marketplace,
        marketplaceId: m.marketplaceId || '',
        displayName: m.marketplaceDisplayName || m.marketplace || (m.marketplaceId || '')
    };
    return { ok: true };
}

function onFcImportMarketplaceChange() {
    var res = _fcResolveImportMarketplace();
    if (_fcImportResolved) {
        _fcImportSetResolvedText(
            'Resolved → Company: ' + _fcImportResolved.company +
            ' | Country: ' + _fcImportResolved.country +
            ' | Marketplace: ' + (_fcImportResolved.displayName || _fcImportResolved.marketplace) +
            ' | Marketplace ID: ' + (_fcImportResolved.marketplaceId || '(none)'),
            '#166534'
        );
    } else {
        _fcImportSetResolvedText((res && res.error) ? res.error : 'Select Country + Marketplace to resolve company.', '#b91c1c');
    }
}

// Quote / escaped-quote / CRLF aware CSV parser.
function _parseFcCsv(text) {
    var rows = [], field = '', row = [], inQuotes = false;
    text = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    for (var i = 0; i < text.length; i++) {
        var c = text[i];
        if (inQuotes) {
            if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; } }
            else { field += c; }
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

function downloadFcImportTemplate() {
    var res = _fcResolveImportMarketplace();
    if (!_fcImportResolved) { alert('Please select Country and Marketplace first.' + (res && res.error ? ('\n' + res.error) : '')); return; }
    var headers = 'sku,jan,feb,mar,apr,may,jun,jul,aug,sep,oct,nov,dec';
    var sample = 'SAMPLE-SKU,0,0,0,0,0,0,0,0,0,0,0,0';
    var csv = headers + '\n' + sample + '\n';
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'fc_regular_forecast_import_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function _fcEscapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _fcRenderImportError(message) {
    var box = document.getElementById('fc-import-result');
    if (!box) { alert(message); return; }
    box.style.display = 'block';
    box.innerHTML = '<div style="color:#dc2626;font-weight:600;">Error: ' + _fcEscapeHtml(message) + '</div>';
}

function _fcRenderImportResult(data, invalidCount) {
    var box = document.getElementById('fc-import-result');
    if (!box) return;
    var s = data.summary || { total: 0, created: 0, updated: 0, skipped: 0, error: 0 };
    var results = data.results || [];
    var html = '<div style="font-weight:600;display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px;">' +
        '<span>Total: ' + s.total + '</span>' +
        '<span style="color:#16a34a;">Created: ' + s.created + '</span>' +
        '<span style="color:#0080bb;">Updated: ' + s.updated + '</span>' +
        '<span style="color:#d97706;">Skipped: ' + s.skipped + '</span>' +
        '<span style="color:#dc2626;">Error: ' + s.error + '</span></div>';
    if (invalidCount > 0) html += '<div style="font-size:11px;color:#dc2626;margin-bottom:6px;">' + invalidCount + ' row(s) missing SKU (reported as errors below).</div>';
    html += results.map(function(rr) {
        var color = rr.status === 'created' ? '#16a34a' : rr.status === 'updated' ? '#0080bb' : rr.status === 'skipped' ? '#d97706' : '#dc2626';
        return '<div style="display:flex;gap:8px;padding:3px 0;border-bottom:1px solid #f1f5f9;">' +
            '<span style="font-weight:600;min-width:64px;color:' + color + ';">' + _fcEscapeHtml(rr.status) + '</span>' +
            '<span>#' + _fcEscapeHtml(String(rr.rowIndex)) + '</span>' +
            '<span>' + _fcEscapeHtml(rr.sku || '') + '</span>' +
            '<span>' + _fcEscapeHtml(rr.message || '') + '</span></div>';
    }).join('');
    box.style.display = 'block';
    box.innerHTML = html;
}

function runFcImport() {
    // If the button is in "Done" state (after a clean success), this click completes the modal
    // instead of re-importing — prevents accidental double imports.
    var _modeBtn = document.getElementById('fc-import-run-btn');
    if (_modeBtn && _modeBtn.dataset.mode === 'done') { _fcImportDone(); return; }

    var res = _fcResolveImportMarketplace();
    if (!_fcImportResolved) { _fcRenderImportError((res && res.error) ? res.error : 'Select Country and Marketplace first.'); return; }
    var yearEl = document.getElementById('fc-import-year');
    var year = yearEl ? String(yearEl.value || '').trim() : '';
    if (!year) { _fcRenderImportError('Year is required.'); return; }
    var fileEl = document.getElementById('fc-import-file');
    if (!fileEl || !fileEl.files || !fileEl.files.length) { alert('Please choose a CSV file first.'); return; }
    if (!(window.KM && window.KM.DB && window.KM.DB.importFcRegularForecastBatch)) { alert('Import API is not available.'); return; }

    var meta = _fcImportResolved;
    var runBtn = document.getElementById('fc-import-run-btn');
    var file = fileEl.files[0];
    var reader = new FileReader();
    reader.onload = function(e) {
        var cells;
        try { cells = _parseFcCsv(e.target.result); } catch (err) { _fcRenderImportError('Failed to parse CSV: ' + (err && err.message ? err.message : err)); return; }
        if (!cells || cells.length < 2) { _fcRenderImportError('No data rows found (need a header row + at least one data row).'); return; }
        var headers = cells[0].map(function(h) { return String(h == null ? '' : h).trim().toLowerCase(); });
        var skuIdx = headers.indexOf('sku');
        if (skuIdx === -1) { _fcRenderImportError('CSV is missing the required "sku" header.'); return; }
        var monthIdx = {};
        FC_IMPORT_MONTHS.forEach(function(m) { monthIdx[m] = headers.indexOf(m); });

        var rows = [];
        var clientErrors = [];
        var dataRowNum = 0;
        // Accept non-negative integers/decimals only (e.g. 0, 10, 10.1, 100). Blank = 0.
        // Reject ABC / N/A / - / test / mixed text. Accepted decimals round UP (whole units).
        var NUMERIC_RE = /^\d+(\.\d+)?$/;
        for (var r = 1; r < cells.length; r++) {
            var raw = cells[r];
            var allEmpty = raw.every(function(v) { return String(v == null ? '' : v).trim() === ''; });
            if (allEmpty) continue;
            dataRowNum++;
            var sku = String(raw[skuIdx] == null ? '' : raw[skuIdx]).trim();
            var monthVals = {};
            var badMonth = null;
            for (var mi = 0; mi < FC_IMPORT_MONTHS.length; mi++) {
                var mm = FC_IMPORT_MONTHS[mi];
                var ci = monthIdx[mm];
                var v = ci === -1 ? '' : String(raw[ci] == null ? '' : raw[ci]).trim();
                if (v === '') { monthVals[mm] = 0; continue; }
                if (!NUMERIC_RE.test(v)) { badMonth = { col: mm, val: v }; break; }
                monthVals[mm] = Math.ceil(parseFloat(v)); // round up to whole units
            }
            if (badMonth) {
                clientErrors.push({ rowIndex: dataRowNum, sku: sku, status: 'error', message: 'Non-numeric month value: ' + badMonth.col + '="' + badMonth.val + '"' });
                continue;
            }
            if (!sku) {
                clientErrors.push({ rowIndex: dataRowNum, sku: sku, status: 'error', message: 'SKU is required' });
                continue;
            }
            var obj = { sku: sku, year: year, company: meta.company, country: meta.country, marketplace: meta.marketplace, marketplace_id: meta.marketplaceId };
            FC_IMPORT_MONTHS.forEach(function(m) { obj[m] = monthVals[m]; });
            rows.push(obj);
        }

        if (rows.length === 0 && clientErrors.length === 0) { _fcRenderImportError('No data rows found.'); return; }

        if (rows.length === 0) {
            // All rows rejected client-side; show errors, nothing sent to backend.
            _fcRenderImportResult({
                summary: { total: clientErrors.length, created: 0, updated: 0, skipped: 0, error: clientErrors.length },
                results: clientErrors
            }, 0);
            return;
        }

        if (runBtn) { runBtn.disabled = true; runBtn.textContent = 'Importing...'; }
        window.KM.DB.importFcRegularForecastBatch(rows, { forecastStatusDefault: 'draft', sourceDefault: 'import' })
            .then(function(result) {
                if (runBtn) { runBtn.disabled = false; runBtn.textContent = 'Import'; }
                if (!result || result.success === false) {
                    _fcRenderImportError(result && result.error ? result.error : 'Import failed. API may not be configured.');
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
                _fcRenderImportResult({ summary: mergedSummary, results: mergedResults }, 0);
                // Wrapper already reloaded the DB cache on success — re-render the Regular Forecast table.
                fcPaginationState.currentPage = 1;
                renderFcRegularTable();
                // Clean success (no errors) → switch the action button to "Done" (completion action).
                // Any errors → keep it as "Import" so the user can fix and retry.
                if (mergedSummary.error === 0 && runBtn) {
                    runBtn.textContent = 'Done';
                    runBtn.dataset.mode = 'done';
                    runBtn.disabled = false;
                }
            })
            .catch(function(err) {
                if (runBtn) { runBtn.disabled = false; runBtn.textContent = 'Import'; }
                _fcRenderImportError(err && err.message ? err.message : 'Import request failed.');
            });
    };
    reader.onerror = function() { _fcRenderImportError('Could not read the selected file.'); };
    reader.readAsText(file);
}

// Completion action for the "Done" state: close modal, clear result/file, reset button.
function _fcImportDone() {
    var resultEl = document.getElementById('fc-import-result');
    if (resultEl) { resultEl.style.display = 'none'; resultEl.innerHTML = ''; }
    var fileEl = document.getElementById('fc-import-file');
    if (fileEl) fileEl.value = '';
    var runBtn = document.getElementById('fc-import-run-btn');
    if (runBtn) { runBtn.textContent = 'Import'; runBtn.dataset.mode = ''; runBtn.disabled = false; }
    // Data was already refreshed on successful import; re-render defensively to be safe.
    if (typeof renderFcRegularTable === 'function') {
        fcPaginationState.currentPage = 1;
        renderFcRegularTable();
    }
    closeFcImportModal();
}

window.openFcImportModal = openFcImportModal;
window.closeFcImportModal = closeFcImportModal;
window.onFcImportCountryChange = onFcImportCountryChange;
window.onFcImportMarketplaceChange = onFcImportMarketplaceChange;
window.downloadFcImportTemplate = downloadFcImportTemplate;
window.runFcImport = runFcImport;

// ========================================
// Lifecycle 註冊
// ========================================
// Ensure the FC Summary markup is present before initFcSummaryPage runs.
// Idempotent: if #fc-summary-section already exists, resolves immediately (no re-fetch, no
// duplicate). Loads the partial via KM.partialLoader; on any failure it warns and resolves (never throws).
function _ensureFcSummaryMarkup() {
    if (document.getElementById('fc-summary-section')) {
        return Promise.resolve(true);
    }
    if (window.KM && window.KM.partialLoader && window.KM.partialLoader.loadPartial) {
        return window.KM.partialLoader
            .loadPartial('fc-summary', 'assets/html/pages/fc-summary.html', '#fc-summary-mount')
            .then(function() {
                if (!document.getElementById('fc-summary-section')) {
                    console.warn('[FCSummary] partial loaded but #fc-summary-section not found');
                }
                return true;
            })
            .catch(function(err) {
                console.warn('[FCSummary] failed to load partial:', err);
                return false;
            });
    }
    console.warn('[FCSummary] KM.partialLoader unavailable; markup not loaded.');
    return Promise.resolve(false);
}

if (window.KM && window.KM.lifecycle) {
    KM.lifecycle.register('fc-summary-section', {
        mount() {
            console.log('[FCSummary] mount');
            // Markup is partial-loaded (Phase 3-4). Ensure it exists, then (re)apply the .active
            // class (showSection ran before the async injection on first open) and init.
            _ensureFcSummaryMarkup().then(function() {
                var sec = document.getElementById('fc-summary-section');
                if (sec) sec.classList.add('active');
                // Wire tabs/search/pagination/modal-overlay once now that the markup exists
                // (the initial DOMContentLoaded ran before the partial was injected).
                _fcSummaryStaticInit();
                if (window.initFcSummaryPage) {
                    window.initFcSummaryPage();
                }
            });
        },
        unmount() {
            console.log('[FCSummary] unmount');
        }
    });
}
