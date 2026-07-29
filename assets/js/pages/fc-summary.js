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

// Filter Regular Forecast data.
// Checkbox-dimension semantics (Company / Marketplace / Country / Category / Series):
//   all checked (default) → every value included → all rows shown;
//   a subset checked      → only those values shown;
//   NONE checked (All toggled off) → show NOTHING for that dimension (empty until the user selects).
// Matching is by internal value (marketplace = canonical key), never the display label.
function filterFcRegular(data, filters) {
  return data.filter(item => {
    if (filters.year && item.year.toString() !== filters.year) return false;
    if (!filters.companies.includes(item.company)) return false;
    if (!filters.marketplaces.includes(item.marketplace)) return false;
    if (!filters.countries.includes(item.country)) return false;
    if (!filters.categories.includes(item.category)) return false;
    if (!filters.series.includes(item.series)) return false;
    if (filters.sku && !item.sku.toLowerCase().includes(filters.sku)) return false;
    return true;
  });
}

// Filter Event Forecast data (same "none checked → show nothing" semantics as filterFcRegular).
function filterFcEvent(data, filters) {
  return data.filter(item => {
    if (filters.year && item.year.toString() !== filters.year) return false;
    if (!filters.companies.includes(item.company)) return false;
    if (!filters.marketplaces.includes(item.marketplace)) return false;
    if (!filters.countries.includes(item.country)) return false;
    if (!filters.events.includes(item.event)) return false;
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
        <div class="scroll-cell">${_fcMarketplaceLabel(item.marketplace, item.company, item.country)}</div>
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
  
  // === Data source: Demo ON -> demo mapping; Demo OFF -> Google Sheet fc_special_events ===
  var _fcEventSource;
  if (window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled()) {
    _fcEventSource = _getDemoFcEventData();
  } else {
    _fcEventSource = _getDbFcEventData();
  }
  // === End Data source ===
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
        <div class="scroll-cell">${_fcMarketplaceLabel(item.marketplace, item.company, item.country)}</div>
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

// Which FC Summary tab is active (regular / event / target).
function _fcActiveTab() {
  const t = document.querySelector('.fc-tab--active');
  return t ? (t.dataset.tab || 'regular') : 'regular';
}

// Filtered row count for the CURRENTLY ACTIVE tab (Regular / Event share one footer, so the footer
// must always reflect the active tab — not whichever table rendered last).
function _fcActiveFilteredCount() {
  const filters = getFcFilters();
  if (!filters.year) return 0;
  const demoOn = window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled();
  const tab = _fcActiveTab();
  if (tab === 'event') {
    const es = demoOn ? _getDemoFcEventData() : _getDbFcEventData();
    return filterFcEvent(es, filters).length;
  }
  if (tab === 'regular') {
    const rs = demoOn ? _getDemoFcRegularData() : _getDbFcRegularData();
    return filterFcRegular(rs, filters).length;
  }
  return 0;   // target tab is not paginated
}

// Update pagination footer + controls. Always recomputes from the ACTIVE tab (the passed argument,
// if any, is ignored) so the order in which the Regular/Event tables render can never leave a stale
// "Showing 0-0 of 0". Footer is hidden on the (non-paginated) Target tab.
function updatePaginationInfo() {
  const pag = document.querySelector('.fc-pagination');
  const tab = _fcActiveTab();
  if (tab === 'target') { if (pag) pag.style.display = 'none'; return; }
  if (pag) pag.style.display = '';

  const totalItems = _fcActiveFilteredCount();
  fcPaginationState.totalItems = totalItems;
  const totalPages = Math.ceil(totalItems / fcPaginationState.pageSize);
  // Safety clamp (handlers already reset page on filter/page-size/tab change).
  if (fcPaginationState.currentPage > totalPages) fcPaginationState.currentPage = totalPages || 1;

  const startIdx = totalItems === 0 ? 0 : (fcPaginationState.currentPage - 1) * fcPaginationState.pageSize + 1;
  const endIdx = Math.min(fcPaginationState.currentPage * fcPaginationState.pageSize, totalItems);

  document.getElementById('fc-pagination-info').textContent =
    `Showing ${startIdx}-${endIdx} of ${totalItems} rows`;
  document.getElementById('fc-page-number').textContent =
    totalPages === 0 ? 'Page 0 / 0' : `Page ${fcPaginationState.currentPage} / ${totalPages}`;

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

      // Re-render the active tab so the shared pagination footer reflects it (reset to page 1).
      fcPaginationState.currentPage = 1;
      if (targetTab === 'regular') renderFcRegularTable();
      else if (targetTab === 'event') renderFcEventTable();
      else { if (typeof renderTargetRulesTable === 'function') renderTargetRulesTable(); updatePaginationInfo(); }
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
        <div class="scroll-cell fc-cell-readonly">${_fcMarketplaceLabel(item.marketplace, item.company, item.country)}</div>
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
        <div class="scroll-cell fc-cell-readonly">${_fcMarketplaceLabel(item.marketplace, item.company, item.country)}</div>
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
  
  const category = scope !== 'SKU' ? document.getElementById('target-category-input').value : null;
  const series = (scope === 'Series' || scope === 'SKU') ? document.getElementById('target-series-input').value : null;
  const sku = scope === 'SKU' ? document.getElementById('target-sku-input').value : null;

  // Demo OFF → write fc_target_rules; Demo ON → keep local mock (no DB dependency in demo).
  if (_fcUseDb()) {
    const payload = {
      scope_type: scope,
      scope_id: scope === 'SKU' ? sku : (scope === 'Series' ? series : category),
      year: year,
      marketplace: marketplace,
      category: category || '',
      series: series || '',
      sku: sku || '',
      target_percentage: percentages.jan,
      actor: 'fc-summary'
    };
    months.forEach(m => { payload[`${m}_pct`] = percentages[m]; });
    if (!window.KM.DB.upsertFcTargetRule) { alert('Target rule write API not available.'); return; }
    window.KM.DB.upsertFcTargetRule(payload)
      .then(() => { renderTargetRulesTable(); closeFcModal(); alert('Target rule saved to DB'); })
      .catch(err => alert('Save failed: ' + (err && err.message ? err.message : err)));
    return;
  }

  targetRules.push({
    id: `rule-${Date.now()}`, scope, year, marketplace, category, series, sku, percentages
  });
  renderTargetRulesTable();
  closeFcModal();
  alert('Target rule added successfully');
}

// Get effective target percentage
function getEffectiveTargetPct({ sku, year, month, category, series, marketplace }) {
  const targetRules = _getActiveTargetRules();   // live DB (Demo OFF) or local mock (Demo ON)
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

  // Demo OFF → live fc_target_rules; Demo ON → local mock array. No longer local-only.
  const rules = _getActiveTargetRules();

  if (rules.length === 0) {
    fixedBody.innerHTML = '';
    scrollBody.innerHTML = '<div class="empty-row">No target rules defined</div>';
    return;
  }

  fixedBody.innerHTML = rules.map(rule => `
    <div class="fixed-row">
      <div class="fixed-cell">${rule.scope}</div>
    </div>
  `).join('');

  scrollBody.innerHTML = rules.map(rule => {
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

  // Demo OFF → hard-delete fc_target_rules by id; Demo ON → local splice.
  if (_fcUseDb()) {
    if (!window.KM.DB.deleteFcTargetRule) { alert('Target rule delete API not available.'); return; }
    window.KM.DB.deleteFcTargetRule({ target_rule_id: ruleId })
      .then(() => { renderTargetRulesTable(); })
      .catch(err => alert('Delete failed: ' + (err && err.message ? err.message : err)));
    return;
  }

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
  // Clear any open in-modal multi-select panels so reopening a modal never restores a stale-open dropdown.
  if (typeof _evtCloseAllMs === 'function') _evtCloseAllMs();
}

// Close modal on overlay click — bound once in _fcSummaryStaticInit() after the
// FC Summary partial is injected (the overlay lives inside the partial markup).


// ========================================
// DATA INTEGRITY & SAFE CALCULATION
// ========================================

// Validate data integrity across all three datasets
function validateDataIntegrity() {
  const issues = [];
  const targetRules = _getActiveTargetRules();   // live DB (Demo OFF) or local mock (Demo ON)

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

// Open Regular Forecast Builder modal.
function openRegularUpdateModal() {
  var now = new Date();
  document.getElementById('regular-target-year').value = fcTargetYear;
  document.getElementById('regular-base-year').value = fcTargetYear - 1;
  var tm = document.getElementById('regular-target-month'); if (tm) tm.value = String(now.getMonth());
  var bm = document.getElementById('regular-base-month'); if (bm) bm.value = String(now.getMonth());
  document.getElementById('regular-update-method').value = 'actual';
  var skuEl = document.getElementById('regular-sku'); if (skuEl) skuEl.value = '';
  var single = document.querySelector('input[name="regular-mode"][value="single"]'); if (single) single.checked = true;
  _populateRegularScopeSelects();
  _regularSwitchMode();
  _regularClearPreview();
  toggleRegularMethodFields();
  showFcModal('fc-regular-update-modal');
}

// Builder Mode (single | batch). Batch = Category/Series bulk over the in-scope SKUs.
function _regularMode() {
  var el = document.querySelector('input[name="regular-mode"]:checked');
  return el ? el.value : 'single';
}
function _regularSwitchMode() {
  var mode = _regularMode();
  var s = document.getElementById('regular-single-scope');
  var b = document.getElementById('regular-batch-scope');
  if (s) s.style.display = mode === 'single' ? '' : 'none';
  if (b) b.style.display = mode === 'batch' ? '' : 'none';
  Array.prototype.slice.call(document.querySelectorAll('#regular-builder-mode .fc-mode-pill')).forEach(function(p){
    var input = p.querySelector('input[type="radio"]');
    p.classList.toggle('is-active', !!(input && input.checked));
  });
  _regularClearPreview();
}

// Scope changed → refresh the scoped SKU datalist and invalidate any built preview (Preview again).
function onRegularScopeChange() { _regularPopulateSkuDatalist(); _regularClearPreview(); }
// Back-compat alias (SKU field still calls this).
function onRegularSkuChange() { onRegularScopeChange(); }

// Resolve a dropdown value (which may be a canonical marketplace key OR a display name) back to the
// canonical marketplace key stored in the DB. Canonical value → itself; a display name → its key.
function _fcResolveMarketplaceKey(value) {
  value = String(value == null ? '' : value).trim();
  if (!value) return '';
  var mkts = (window.KM && window.KM.DB && window.KM.DB.getMarketplaces) ? window.KM.DB.getMarketplaces() : [];
  function lo(v){ return String(v == null ? '' : v).trim().toLowerCase(); }
  // Already a canonical key?
  if (mkts.some(function(m){ return lo(m.marketplace) === lo(value); })) return value;
  // A display name → map to its canonical key.
  var byDisplay = mkts.filter(function(m){ return lo(m.marketplaceDisplayName) === lo(value); })[0];
  return byDisplay ? byDisplay.marketplace : value;
}

// Resolve a canonical marketplace key to its display label (marketplace_display_name if present,
// else the key). Prefer a company + country match to disambiguate shared platform names.
function _fcMarketplaceLabel(key, company, country) {
  key = String(key == null ? '' : key).trim();
  if (!key) return '';
  var mkts = (window.KM && window.KM.DB && window.KM.DB.getMarketplaces) ? window.KM.DB.getMarketplaces() : [];
  function up(v){ return String(v == null ? '' : v).trim().toUpperCase(); }
  var exact = mkts.filter(function(m){ return up(m.marketplace) === up(key) &&
    (!company || up(m.company) === up(company)) && (!country || up(m.country) === up(country)) &&
    m.marketplaceDisplayName; })[0];
  if (exact) return exact.marketplaceDisplayName;
  var any = mkts.filter(function(m){ return up(m.marketplace) === up(key) && m.marketplaceDisplayName; })[0];
  return any ? any.marketplaceDisplayName : key;
}

// Build marketplace dropdown options: { value: canonical key, label: display name (fallback key) }.
// Deduped by value+label PAIR so distinct display names for the same key are all kept (never
// collapsed on key alone). fc_regular_forecast keys not in the registry appear canonical-only.
function _fcMarketplaceOptions() {
  var mkts = (window.KM && window.KM.DB && window.KM.DB.getMarketplaces) ? window.KM.DB.getMarketplaces() : [];
  var fcRows = (window.KM && window.KM.DB && window.KM.DB.getFcRegularForecast) ? window.KM.DB.getFcRegularForecast() : [];
  var out = [], seenPair = {}, seenValue = {};
  function add(value, label) {
    value = String(value == null ? '' : value).trim(); if (!value) return;
    label = String(label == null ? '' : label).trim() || value;
    var k = value + '||' + label;
    if (seenPair[k]) return; seenPair[k] = 1; seenValue[value] = 1;
    out.push({ value: value, label: label });
  }
  mkts.forEach(function(m){ add(m.marketplace, m.marketplaceDisplayName || m.marketplace); });
  fcRows.forEach(function(r){ var v = String(r.marketplace || '').trim(); if (v && !seenValue[v]) add(v, v); });
  out.sort(function(a, b){ return a.label.localeCompare(b.label); });
  if (!out.length) ['Amazon','Walmart','Shopify','Target'].forEach(function(m){ add(m, m); });
  return out;
}

// Prefill the Jan–Dec inputs from the existing fc_regular_forecast row for the selected
// full SITE identity: COMPANY + Country + Marketplace + SKU + Target Year (read-only lookup).
//   - Company is derived from the selected marketplace(site) option (KM Amazon ≠ ResUS Amazon).
//   - No SKU selected  → do NOT touch the month inputs (avoids wiping a partially-typed grid to 0).
//   - Live + cache not loaded yet → disable Save, show "loading" helper, do not overwrite.
//   - Match found      → fill each month; a blank/empty stored month stays blank (never forced 0).
//   - No match         → reset ALL months to 0 (never fall back to a different company's row).
function _regularPrefillManual() {
  var months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  var sku = ((document.getElementById('regular-sku') || {}).value || '').trim();
  var site = _regularSelectedSite();
  var company = site.company, country = site.country, marketplace = site.marketplace;
  var year = parseInt(document.getElementById('regular-target-year').value);
  function up(v){ return String(v==null?'':v).trim().toUpperCase(); }
  function lo(v){ return String(v==null?'':v).trim().toLowerCase(); }

  // Loading guard: in live mode, if the DB cache has not loaded yet, do NOT prefill (would read an
  // empty set and could mislead). Disable Save until it is ready.
  var demoOn = window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled();
  if (!demoOn && !window._opDbCache) {
    _setRegularSaveEnabled(false);
    _setRegularManualHelp('Loading existing forecast… please wait.', '#b45309');
    return;
  }

  if (!sku) {
    _setRegularSaveEnabled(true);
    _setRegularManualHelp('Enter a SKU to load its existing monthly forecast.', '#64748B');
    return;
  }

  // Match by the FULL site identity (company + country + marketplace + sku + year). Company MUST
  // match — KM / US / Amazon never loads ResUS / US / Amazon (and vice-versa).
  var demoSrc = demoOn ? (fcRegularMock || []).map(function(r){ return { company: r.company, country: r.country, marketplace: r.marketplace, sku: r.sku, year: r.year,
    jan: r.months && r.months[0], feb: r.months && r.months[1], mar: r.months && r.months[2], apr: r.months && r.months[3],
    may: r.months && r.months[4], jun: r.months && r.months[5], jul: r.months && r.months[6], aug: r.months && r.months[7],
    sep: r.months && r.months[8], oct: r.months && r.months[9], nov: r.months && r.months[10], dec: r.months && r.months[11] }; }) : null;
  var rows = demoSrc || ((window.KM && window.KM.DB && window.KM.DB.getFcRegularForecast) ? window.KM.DB.getFcRegularForecast() : []);
  var match = rows.filter(function(r){
    return up(r.sku) === up(sku) && String(r.year) === String(year) &&
      up(r.company) === up(company) &&
      up(r.country) === up(country) &&
      lo(r.marketplace) === lo(marketplace);
  })[0];

  if (match) {
    months.forEach(function(m){
      var el = document.getElementById('reg-' + m); if (!el) return;
      var raw = match[m];
      // Blank/empty stored month → keep the field blank (do NOT force 0). Otherwise show the value.
      el.value = (raw === '' || raw === null || raw === undefined) ? '' : (Math.round(Number(raw)) || 0);
    });
    _setRegularManualHelp('Existing forecast loaded for ' + sku + ' (' + (company || '—') + ' / ' + (country || '—') + ' / ' +
      _fcMarketplaceLabel(marketplace, company, country) + ', ' + year + '). Editing will update this row.', '#0f766e');
  } else {
    // No existing row for this SKU + Country + Marketplace + Year → reset EVERY month to 0.
    // (Must NOT retain the previously-loaded marketplace's values, e.g. switching US Amazon → eBay.)
    months.forEach(function(m){ var el = document.getElementById('reg-' + m); if (el) el.value = 0; });
    _setRegularManualHelp('No existing FC found for this Marketplace. Saving will create a new forecast row.', '#b45309');
  }
  _setRegularSaveEnabled(true);
}

// Enable/disable the Regular modal Save button (used during prefill loading).
function _setRegularSaveEnabled(on) {
  var btn = document.getElementById('regular-save-btn');
  if (btn) { btn.disabled = !on; btn.style.opacity = on ? '' : '0.5'; btn.style.pointerEvents = on ? '' : 'none'; }
}

// Set the Manual-mode helper text (created new / loaded existing / loading).
function _setRegularManualHelp(msg, color) {
  var el = document.getElementById('regular-manual-help');
  if (el) { el.textContent = msg || ''; el.style.color = color || '#64748B'; el.style.display = msg ? '' : 'none'; }
}

// Populate Country / Marketplace selects from live marketplaces (Demo OFF) or fc_regular_forecast /
// static fallback. NO Company select — company is derived from marketplaces / marketplace_skus.
function _populateRegularScopeSelects() {
  // Demo ON → demo dataset only; Demo OFF (live) → live sources only (never mix demo into live,
  // which previously produced duplicate marketplaces e.g. two "Amazon").
  var demoOn = window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled();
  var mkts = (!demoOn && window.KM && window.KM.DB && window.KM.DB.getMarketplaces) ? window.KM.DB.getMarketplaces() : [];
  var fcRows = (!demoOn && window.KM && window.KM.DB && window.KM.DB.getFcRegularForecast) ? window.KM.DB.getFcRegularForecast() : [];
  function distinct(arr) { var o = [], s = {}; arr.forEach(function(v){ v = String(v||'').trim(); if (v && !s[v]) { s[v]=1; o.push(v); } }); return o.sort(); }
  var srcCountries = demoOn
    ? (fcRegularMock || []).map(function(r){ return r.country; })
    : mkts.map(function(m){return m.country;}).concat(fcRows.map(function(r){return r.country;}));
  var countries = distinct(srcCountries);
  if (!countries.length) countries = ['US', 'UK', 'DE', 'CA', 'JP', 'AU'];

  var filters = (typeof getFcFilters === 'function') ? getFcFilters() : { countries: [], marketplaces: [] };
  var defCountry = (filters.countries && filters.countries.length === 1) ? filters.countries[0] : (countries[0] || '');

  var cSel = document.getElementById('regular-country');
  if (cSel) cSel.innerHTML = countries.map(function(c){ return '<option value="' + c + '"' + (c === defCountry ? ' selected' : '') + '>' + c + '</option>'; }).join('');
  // Marketplace select carries the full SITE identity (company|country|marketplace) — see below.
  _regularRebuildSites();
  // Category / Series MULTI-selects (batch mode) from sku_details distinct values (All = none checked).
  var details = (window.KM && window.KM.DB && window.KM.DB.getSkuDetails) ? window.KM.DB.getSkuDetails() : [];
  _regularFillMsOptions('category', distinct(details.map(function(d){ return d.category; })));
  _regularFillMsOptions('series', distinct(details.map(function(d){ return d.series; })));
  _regularBindMsGlobalClose();
  _regularCloseAllMs();
  _regularPopulateSkuDatalist();
}

// ---- Regular FC in-modal multiselect (Category / Series) — mirrors the Special Event pattern ----
function _regularFillMsOptions(which, values) {
  var box = document.getElementById('regular-' + which + '-options');
  if (box) box.innerHTML = values.map(function(v){
    var safe = String(v).replace(/"/g, '&quot;');
    return '<label class="fc-ms-item"><input type="checkbox" value="' + safe + '" onchange="_regularMsChanged(\'' + which + '\')"><span>' + v + '</span></label>';
  }).join('');
  var allCb = document.getElementById('regular-' + which + '-all'); if (allCb) allCb.checked = true;
  var panel = document.getElementById('regular-' + which + '-panel'); if (panel) panel.style.display = 'none';
  _regularMsUpdateText(which);
}
function _regularToggleMsPanel(which) {
  if (window.event) { try { window.event.stopPropagation(); } catch (e) {} }
  var panel = document.getElementById('regular-' + which + '-panel');
  if (!panel) return;
  var show = (panel.style.display === 'none' || !panel.style.display);
  ['category','series'].forEach(function(w){ var p = document.getElementById('regular-' + w + '-panel'); if (p) p.style.display = 'none'; });
  panel.style.display = show ? '' : 'none';
}
function _regularCloseAllMs() {
  ['category','series'].forEach(function(w){ var p = document.getElementById('regular-' + w + '-panel'); if (p) p.style.display = 'none'; });
}
var _regularMsGlobalBound = false;
function _regularBindMsGlobalClose() {
  if (_regularMsGlobalBound) return;
  document.addEventListener('click', function(e) {
    var modal = document.getElementById('fc-regular-update-modal');
    if (!modal || !modal.classList.contains('is-open')) return;
    if (e.target && e.target.closest && e.target.closest('#fc-regular-update-modal .fc-ms')) return;
    _regularCloseAllMs();
  });
  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;
    var modal = document.getElementById('fc-regular-update-modal');
    if (!modal || !modal.classList.contains('is-open')) return;
    _regularCloseAllMs();
  });
  _regularMsGlobalBound = true;
}
function _regularMsAll(which, cb) {
  if (cb.checked) {
    Array.prototype.slice.call(document.querySelectorAll('#regular-' + which + '-options input[type="checkbox"]'))
      .forEach(function(o){ o.checked = false; });
  }
  _regularMsSyncAll(which);
}
function _regularMsChanged(which) { _regularMsSyncAll(which); }
function _regularMsSyncAll(which) {
  var opts = Array.prototype.slice.call(document.querySelectorAll('#regular-' + which + '-options input[type="checkbox"]'));
  var anyChecked = opts.some(function(o){ return o.checked; });
  var allCb = document.getElementById('regular-' + which + '-all');
  if (allCb) allCb.checked = !anyChecked;
  _regularMsUpdateText(which);
  if (which === 'category') _regularRebuildSeriesOptions();   // Series depends on selected Category
  _regularClearPreview();   // scope changed → must Preview again before Save
}
// Series options for the selected categories (null = All → every series). Deduped + sorted, derived
// from sku_details (never hard-coded). Shared by the Regular and Special Event builders.
function _fcSeriesForCategories(selectedCats) {
  var details = (window.KM && window.KM.DB && window.KM.DB.getSkuDetails) ? window.KM.DB.getSkuDetails() : [];
  var set = {};
  details.forEach(function(d){
    var c = String(d.category || '').trim();
    if (!selectedCats || selectedCats.indexOf(c) >= 0) { var s = String(d.series || '').trim(); if (s) set[s] = 1; }
  });
  return Object.keys(set).sort();
}
// Rebuild the Regular Series options constrained to the selected Category(ies); preserve still-valid
// checked series, drop the rest (so an out-of-category Series can never survive into Preview/Save).
function _regularRebuildSeriesOptions() {
  var box = document.getElementById('regular-series-options');
  if (!box) return;
  var prevSel = _regularMsValues('series');   // null = All, or array of series
  var valid = _fcSeriesForCategories(_regularMsValues('category'));
  box.innerHTML = valid.map(function(v){
    var safe = String(v).replace(/"/g, '&quot;');
    var checked = (prevSel && prevSel.indexOf(v) >= 0) ? ' checked' : '';
    return '<label class="fc-ms-item"><input type="checkbox" value="' + safe + '"' + checked + ' onchange="_regularMsChanged(\'series\')"><span>' + v + '</span></label>';
  }).join('');
  var anyChecked = Array.prototype.slice.call(box.querySelectorAll('input[type="checkbox"]')).some(function(o){ return o.checked; });
  var allCb = document.getElementById('regular-series-all'); if (allCb) allCb.checked = !anyChecked;
  _regularMsUpdateText('series');
}
function _regularMsValues(which) {
  var allCb = document.getElementById('regular-' + which + '-all');
  var opts = Array.prototype.slice.call(document.querySelectorAll('#regular-' + which + '-options input[type="checkbox"]:checked'));
  if ((allCb && allCb.checked) || !opts.length) return null;   // null = All
  return opts.map(function(o){ return o.value; });
}
function _regularMsUpdateText(which) {
  var label = which === 'category' ? 'Category' : 'Series';
  var vals = _regularMsValues(which);
  var el = document.getElementById('regular-' + which + '-text');
  if (!el) return;
  if (!vals) el.textContent = 'All ' + label;
  else if (vals.length <= 2) el.textContent = vals.join(', ');
  else el.textContent = vals.length + ' ' + label + ' selected';
}
// Scoped SKU datalist for the Single-SKU searchable input (company + country + marketplace).
function _regularPopulateSkuDatalist() {
  var list = document.getElementById('regular-sku-datalist');
  if (!list) return;
  var site = _regularSelectedSite();
  function up(v){ return String(v==null?'':v).trim().toUpperCase(); }
  function lo(v){ return String(v==null?'':v).trim().toLowerCase(); }
  var mkey = _fcResolveMarketplaceKey(site.marketplace);
  var mskus = (window.KM && window.KM.DB && window.KM.DB.getMarketplaceSkus) ? window.KM.DB.getMarketplaceSkus() : [];
  var seen = {}, opts = [];
  mskus.forEach(function(m){
    if (site.company && up(m.company) !== up(site.company)) return;
    if (site.country && up(m.country) !== up(site.country)) return;
    if (mkey && lo(m.marketplace) !== lo(mkey)) return;
    var s = String(m.sku || '').trim();
    if (s && !seen[s]) { seen[s] = 1; opts.push(s); }
  });
  opts.sort();
  list.innerHTML = opts.map(function(s){ return '<option value="' + String(s).replace(/"/g, '&quot;') + '"></option>'; }).join('');
}

// Distinct forecast SITES (company + country + marketplace) for a country, for the Regular modal's
// Marketplace select. value = "company|country|marketplace" (full site identity, so KM Amazon and
// ResUS Amazon are DISTINCT options); label = display name, disambiguated by company when a
// country+marketplace maps to more than one company. Sources: marketplaces registry + live
// fc_regular_forecast + demo fcRegularMock.
function _fcRegularSiteOptions(country) {
  // Demo ON → demo dataset only; Demo OFF (live) → live registry + live fc_regular_forecast only.
  // (Mixing the demo dataset into live is what produced duplicate marketplaces like two "Amazon".)
  var demoOn = window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled();
  var mkts = (!demoOn && window.KM && window.KM.DB && window.KM.DB.getMarketplaces) ? window.KM.DB.getMarketplaces() : [];
  var fcRows = (!demoOn && window.KM && window.KM.DB && window.KM.DB.getFcRegularForecast) ? window.KM.DB.getFcRegularForecast() : [];
  function tr(v){ return String(v==null?'':v).trim(); }
  function up(v){ return tr(v).toUpperCase(); }
  var map = {};
  function add(company, ctry, mkt, display) {
    company = tr(company); ctry = tr(ctry); mkt = tr(mkt);
    if (!company || !ctry || !mkt) return;
    if (country && up(ctry) !== up(country)) return;
    // Case-insensitive identity key so the SAME site from different sources (registry vs
    // fc_regular_forecast) never becomes two options; the option value keeps the original casing.
    var key = up(company) + '|' + up(ctry) + '|' + up(mkt);
    if (!map[key]) map[key] = { value: company + '|' + ctry + '|' + mkt, company: company, country: ctry, marketplace: mkt, display: tr(display) };
    else if (!map[key].display && display) map[key].display = tr(display);
  }
  if (demoOn) {
    (fcRegularMock || []).forEach(function(r){ add(r.company, r.country, r.marketplace, _fcMarketplaceLabel(r.marketplace, r.company, r.country)); });
  } else {
    mkts.forEach(function(m){ add(m.company, m.country, m.marketplace, m.marketplaceDisplayName || m.marketplace); });
    fcRows.forEach(function(r){ add(r.company, r.country, r.marketplace, _fcMarketplaceLabel(r.marketplace, r.company, r.country)); });
  }
  var list = Object.keys(map).map(function(k){ return map[k]; });
  // Visible label = marketplace_display_name only (fallback to marketplace). Company is NOT appended
  // — the internal identity (value = company|country|marketplace) still keeps KM Amazon vs ResUS
  // Amazon strictly separated; only the displayed text is the clean display name.
  list.forEach(function(s){ s.label = s.display || s.marketplace; });
  list.sort(function(a,b){ return a.label.localeCompare(b.label) || a.company.localeCompare(b.company); });
  return list;
}

// Rebuild the Marketplace(site) options for the currently-selected country; preserve the selection
// if still valid. Called on open and whenever Country changes.
function _regularRebuildSites() {
  var cSel = document.getElementById('regular-country');
  var mSel = document.getElementById('regular-marketplace');
  if (!mSel) return;
  var country = cSel ? cSel.value : '';
  var prev = mSel.value;
  var sites = _fcRegularSiteOptions(country);
  mSel.innerHTML = sites.map(function(s){ return '<option value="' + s.value + '">' + s.label + '</option>'; }).join('');
  if (prev && sites.some(function(s){ return s.value === prev; })) mSel.value = prev;
}

// Resolve the selected Regular modal site → { company, country, marketplace } (full identity).
// Marketplace value is "company|country|marketplace"; legacy/blank falls back to canonical marketplace.
function _regularSelectedSite() {
  var v = String((document.getElementById('regular-marketplace') || {}).value || '');
  var parts = v.split('|');
  if (parts.length === 3) return { company: parts[0], country: parts[1], marketplace: parts[2] };
  var country = (document.getElementById('regular-country') || {}).value || '';
  return { company: '', country: country, marketplace: _fcResolveMarketplaceKey(v) };
}

// Country changed → rebuild the site (Marketplace) options for that country, then re-prefill.
function onRegularCountryChange() {
  _regularRebuildSites();
  onRegularScopeChange();
}

// Toggle fields based on selected method (Part 3 conditional UI).
//   actual    → Country/Marketplace/Target Year/Base Year/Growth Rate   (hide Month + Jan–Dec)
//   prevMonth → Country/Marketplace/Target Year/Month/Growth Rate        (hide Base Year + Jan–Dec)
//   manual    → Country/Marketplace/Target Year/Jan–Dec                  (hide Base Year + Growth + Month)
function toggleRegularMethodFields() {
  const method = document.getElementById('regular-update-method').value;
  const baseRow = document.getElementById('regular-base-row');
  const basedRow = document.getElementById('regular-based-row');
  const growthGroup = document.getElementById('regular-growth-group');
  const methodDesc = document.getElementById('method-description');
  function show(el, on) { if (el) el.style.display = on ? '' : 'none'; }

  if (method === 'actual') {
    show(baseRow, true); show(basedRow, false); show(growthGroup, true);
    methodDesc.innerHTML = '<strong>Apply Growth Rate:</strong> take each in-scope SKU’s existing forecast for the <em>Base Year + Base Month</em>, apply the Growth Rate, and write the result into the <em>Target Year + Target Month</em>. Only that one month is updated.';
  } else if (method === 'prevMonth') {
    show(baseRow, false); show(basedRow, true); show(growthGroup, true);
    _regularSyncBasedFromTarget();   // default Based Year/Month = the month before Target (editable)
    methodDesc.innerHTML = '<strong>Adjust From Previous Month Forecast:</strong> take each SKU’s forecast for the explicit <em>Based Year + Based Month</em> (default = the month before Target), apply the rate, and write it into the <em>Target Month</em>. The source is never silently inferred.';
  } else { // manual
    show(baseRow, false); show(basedRow, false); show(growthGroup, false);
    methodDesc.innerHTML = '<strong>Manual Entry:</strong> Preview lists every in-scope SKU with an editable New value for the Target Month. <strong>Blank = Skip</strong> (row not written); enter <strong>0</strong> to set an explicit zero.';
  }
  _regularClearPreview();
}

// Default the Based Year / Based Month to the month immediately before the selected Target Month
// (Target Jan → previous-year Dec). Only sets defaults; the user may override either field.
function _regularSyncBasedFromTarget() {
  var basedYearEl = document.getElementById('regular-based-year');
  var basedMonthEl = document.getElementById('regular-based-month');
  var targetMonthEl = document.getElementById('regular-target-month');
  if (!basedYearEl || !basedMonthEl || !targetMonthEl) return;
  var targetYear = parseInt(document.getElementById('regular-target-year').value) || (new Date()).getFullYear();
  var tm = parseInt(targetMonthEl.value || '0');
  var basedMonth = tm > 0 ? tm - 1 : 11;
  var basedYear = tm > 0 ? targetYear : targetYear - 1;
  basedMonthEl.value = String(basedMonth);
  basedYearEl.value = basedYear;
}

// ===== Regular Forecast Builder — preview + bulk single-month save =====
var REG_MONTH_KEYS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
var _regularPreview = null;   // { targetYear, targetMonth, method, rows:[...] }

function _regularClearPreview() {
  _regularPreview = null;
  var box = document.getElementById('regular-preview'); if (box) { box.style.display = 'none'; box.innerHTML = ''; }
  var cnt = document.getElementById('regular-affected-count'); if (cnt) cnt.textContent = '';
  _setRegularSaveEnabled(false);
  _setRegularManualHelp('', '');
}

// fc_regular_forecast rows (Demo → in-memory mock mapped to the same shape; DB → live).
function _regularFcRows() {
  var demoOn = window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled();
  if (demoOn) {
    return (fcRegularMock || []).map(function(r){
      var o = { company: r.company, country: r.country, marketplace: r.marketplace, sku: r.sku, year: r.year, raw: {} };
      REG_MONTH_KEYS.forEach(function(m, i){ o[m] = (r.months && r.months[i] != null) ? r.months[i] : 0; o.raw[m] = o[m]; });
      return o;
    });
  }
  return (window.KM && window.KM.DB && window.KM.DB.getFcRegularForecast) ? window.KM.DB.getFcRegularForecast() : [];
}

// Find the fc row for a full site identity + SKU + year (case-insensitive).
function _regularFindFc(rows, company, country, marketplace, sku, year) {
  function up(v){ return String(v==null?'':v).trim().toUpperCase(); }
  function lo(v){ return String(v==null?'':v).trim().toLowerCase(); }
  return rows.filter(function(r){
    return up(r.sku) === up(sku) && String(r.year) === String(year) &&
      up(r.company) === up(company) && up(r.country) === up(country) && lo(r.marketplace) === lo(marketplace);
  })[0] || null;
}

// Existing 12-month values (raw where available so a blank stays blank on write). Missing row → all blank.
function _regularExistingMonths(row) {
  var out = {};
  REG_MONTH_KEYS.forEach(function(m){
    if (!row) { out[m] = ''; return; }
    var raw = row.raw ? row.raw[m] : undefined;
    out[m] = (raw === undefined || raw === null) ? (row[m] != null ? row[m] : '') : raw;
  });
  return out;
}

// In-scope SKUs for the Regular Builder. Single → the typed SKU; Batch → marketplace_skus for the
// site scope joined to sku_details, filtered by the selected Category / Series ('' = All).
function _regularCandidateSkus(site) {
  function up(v){ return String(v==null?'':v).trim().toUpperCase(); }
  function lo(v){ return String(v==null?'':v).trim().toLowerCase(); }
  var details = (window.KM && window.KM.DB && window.KM.DB.getSkuDetails) ? window.KM.DB.getSkuDetails() : [];
  var detBySku = {}; details.forEach(function(d){ detBySku[up(d.sku)] = d; });
  if (_regularMode() === 'single') {
    var sku = ((document.getElementById('regular-sku') || {}).value || '').trim();
    if (!sku) return [];
    var d = detBySku[up(sku)] || {};
    return [{ sku: sku, category: d.category || '', series: d.series || '', company: site.company }];
  }
  var cats = _regularMsValues('category');   // null = All Category
  var series = _regularMsValues('series');   // null = All Series
  var mkey = _fcResolveMarketplaceKey(site.marketplace);
  var mskus = (window.KM && window.KM.DB && window.KM.DB.getMarketplaceSkus) ? window.KM.DB.getMarketplaceSkus() : [];
  var seen = {}, out = [];
  mskus.filter(function(m){
    return (!site.country || up(m.country) === up(site.country)) && (!mkey || lo(m.marketplace) === lo(mkey)) &&
      (!site.company || up(m.company) === up(site.company));
  }).forEach(function(m){
    var d = detBySku[up(m.sku)] || {};
    if (cats && cats.indexOf(d.category || '') < 0) return;
    if (series && series.indexOf(d.series || '') < 0) return;
    var k = up(m.sku); if (seen[k]) return; seen[k] = 1;
    out.push({ sku: m.sku, category: d.category || '', series: d.series || '', company: m.company || site.company });
  });
  return out;
}

// Build the Preview (affected SKUs, Old → New → Difference for the single Target Month).
function _regularBuildPreview() {
  _regularCloseAllMs();   // Preview closes the multiselect panels
  var site = _regularSelectedSite();
  var company = site.company, country = site.country, marketplace = site.marketplace;
  var targetYear = parseInt(document.getElementById('regular-target-year').value);
  var targetMonth = parseInt((document.getElementById('regular-target-month') || {}).value || '0');
  var method = document.getElementById('regular-update-method').value;
  var rate = parseFloat((document.getElementById('regular-growth-rate') || {}).value) || 0;

  if (!country || !marketplace) { _setRegularManualHelp('Country and Marketplace are required.', '#b45309'); return; }
  if (isNaN(targetYear)) { _setRegularManualHelp('Target Year is required.', '#b45309'); return; }
  if (isNaN(targetMonth)) { _setRegularManualHelp('Target Month is required.', '#b45309'); return; }

  var candidates = _regularCandidateSkus(site);
  if (!candidates.length) {
    _setRegularManualHelp(_regularMode() === 'single' ? 'Enter a SKU to preview.' : 'No SKUs match the selected Category / Series in this scope.', '#b45309');
    _regularClearPreview(); return;
  }

  var rows = _regularFcRows();
  var baseYear, baseMonth;
  if (method === 'actual') { baseYear = parseInt(document.getElementById('regular-base-year').value); baseMonth = parseInt((document.getElementById('regular-base-month') || {}).value || '0'); }
  else if (method === 'prevMonth') { baseYear = parseInt((document.getElementById('regular-based-year') || {}).value); baseMonth = parseInt((document.getElementById('regular-based-month') || {}).value || '0'); }

  var previewRows = candidates.map(function(c){
    var targetRow = _regularFindFc(rows, company, country, marketplace, c.sku, targetYear);
    var existing = _regularExistingMonths(targetRow);
    var oldRaw = existing[REG_MONTH_KEYS[targetMonth]];
    var oldQty = (oldRaw === '' || oldRaw == null) ? null : (Math.round(Number(oldRaw)) || 0);
    var newQty = null;
    if (method === 'actual' || method === 'prevMonth') {
      var baseRow = _regularFindFc(rows, company, country, marketplace, c.sku, baseYear);
      var baseVal = baseRow ? (Number(baseRow[REG_MONTH_KEYS[baseMonth]]) || 0) : 0;
      newQty = Math.max(0, Math.round(baseVal * (1 + rate / 100)));
    } // manual → newQty stays null (user types it in the preview)
    return { sku: c.sku, company: c.company || company, country: country, marketplace: marketplace,
      category: c.category, series: c.series, existing: existing, oldQty: oldQty, newQty: newQty };
  });

  _regularPreview = { targetYear: targetYear, targetMonth: targetMonth, method: method, rows: previewRows };
  _regularRenderPreview();
  _setRegularSaveEnabled(true);
}

function _regularRenderPreview() {
  var box = document.getElementById('regular-preview');
  var cnt = document.getElementById('regular-affected-count');
  if (!box || !_regularPreview) return;
  var monthLbl = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][_regularPreview.targetMonth];
  var manual = _regularPreview.method === 'manual';
  var affected = 0;
  var body = _regularPreview.rows.map(function(r, i){
    var oldDisp = (r.oldQty == null) ? '—' : r.oldQty.toLocaleString();
    var newCell, diffCell;
    if (manual) {
      newCell = '<input type="number" min="0" class="reg-prev-new" data-idx="' + i + '" value="' + (r.newQty == null ? '' : r.newQty) + '" placeholder="Skip" style="width:90px;" oninput="_regularOnManualInput()">';
      diffCell = '<span class="reg-prev-diff" data-idx="' + i + '"></span>';
    } else {
      var diff = (r.newQty || 0) - (r.oldQty || 0);
      if (diff !== 0) affected++;
      var sign = diff > 0 ? '+' : ''; var color = diff > 0 ? '#0f766e' : (diff < 0 ? '#dc2626' : '#64748b');
      newCell = (r.newQty == null ? '—' : r.newQty.toLocaleString());
      diffCell = '<span style="color:' + color + '">' + sign + diff.toLocaleString() + '</span>';
    }
    return '<tr><td>' + _fmvEscapeHtml(r.sku) + '</td><td>' + _fmvEscapeHtml((r.category || '—') + ' / ' + (r.series || '—')) +
      '</td><td>' + oldDisp + '</td><td>' + newCell + '</td><td>' + diffCell + '</td></tr>';
  }).join('');
  box.innerHTML = '<table class="fc-assist-preview-table"><thead><tr><th>SKU</th><th>Category / Series</th>' +
    '<th>Current Forecast (' + monthLbl + ' ' + _regularPreview.targetYear + ')</th><th>New Forecast</th><th>Change</th></tr></thead><tbody>' +
    body + '</tbody></table>';
  box.style.display = '';
  if (cnt) {
    if (manual) { _regularOnManualInput(); }
    else { cnt.textContent = affected + ' of ' + _regularPreview.rows.length + ' SKU(s) will change'; }
  }
}

// Manual mode: recompute per-row diff + affected count live as the user types (blank = Skip).
function _regularOnManualInput() {
  if (!_regularPreview) return;
  var box = document.getElementById('regular-preview'); if (!box) return;
  var affected = 0;
  box.querySelectorAll('.reg-prev-new').forEach(function(inp){
    var idx = parseInt(inp.dataset.idx, 10);
    var r = _regularPreview.rows[idx]; if (!r) return;
    var raw = String(inp.value).trim();
    var diffEl = box.querySelector('.reg-prev-diff[data-idx="' + idx + '"]');
    if (raw === '') { if (diffEl) { diffEl.textContent = 'Skip'; diffEl.style.color = '#94a3b8'; } return; }
    var nv = Math.max(0, Math.round(Number(raw) || 0));
    var diff = nv - (r.oldQty || 0);
    if (diff !== 0 || r.oldQty == null) affected++;
    if (diffEl) { var sign = diff > 0 ? '+' : ''; diffEl.textContent = sign + diff.toLocaleString();
      diffEl.style.color = diff > 0 ? '#0f766e' : (diff < 0 ? '#dc2626' : '#64748b'); }
  });
  var cnt = document.getElementById('regular-affected-count');
  if (cnt) cnt.textContent = affected + ' of ' + _regularPreview.rows.length + ' SKU(s) will be written';
}

// ===== Special Event Builder v2 (Single SKU rows / Category-Series group cards) =====
var EVT_MAX_ROWS = 8;
var _evtGroups = [];   // batch-mode group cards: { category, series, regularPrice, skus[], dealPrice, fcQty }

// Open Event Modal (Scope → Event Info → Mode → Single-SKU rows OR Category/Series group cards).
function openEventModal() {
  document.getElementById('event-target-year').value = fcTargetYear;
  var flagEl = document.getElementById('event-name-input'); if (flagEl) flagEl.value = 'Normal';
  var sdEl = document.getElementById('event-start-date'); if (sdEl) sdEl.value = '';
  var edEl = document.getElementById('event-end-date'); if (edEl) edEl.value = '';
  _evtClearPeriodError();
  // reset mode → single
  var single = document.querySelector('input[name="event-mode"][value="single"]'); if (single) single.checked = true;
  // reset batch controls (Category / Series multi-selects reset inside _populateEventBatchSelects)
  var dp = document.getElementById('event-discount-pct'); if (dp) dp.value = '';
  var by = document.getElementById('event-assist-base-year'); if (by) by.value = '';
  var bm = document.getElementById('event-assist-base-month'); if (bm) bm.value = '0';
  var gr = document.getElementById('event-assist-growth'); if (gr) gr.value = '';
  var am = document.getElementById('event-assist-method'); if (am) am.value = 'growth';
  var av = document.getElementById('event-assist-adjust-value'); if (av) av.value = '';
  var ap = document.getElementById('event-assist-preview'); if (ap) { ap.style.display = 'none'; ap.innerHTML = ''; }
  _evtGroups = [];
  var cards = document.getElementById('event-group-cards'); if (cards) cards.innerHTML = '';
  _evtSetAssistHelp('', '');
  _evtSetPreviewEnabled(false);   // Preview & Pre-fill disabled until cards are built (#5)
  _populateEventScopeSelects();
  _populateEventBatchSelects();
  _evtToggleAssistFields();   // AFTER scope + category/series are ready (populates Base Campaign for Growth)
  // Single-SKU rows: start with one empty row.
  var rows = document.getElementById('event-sku-rows'); if (rows) rows.innerHTML = '';
  _evtAddSingleRow();
  _evtSwitchMode();
  toggleEventFlagFields();
  _evtBindMsGlobalClose();   // outside-click / Escape closers (bound once)
  _evtCloseAllMs();          // never reopen a stale-open panel
  showFcModal('fc-add-event-modal');
}

// Scope (country / marketplace) changed → regular prices depend on it; refresh the scoped SKU
// datalist, single-row prices, and rebuild group cards if already built.
function _evtOnScopeChange() {
  _evtPopulateSkuDatalist();
  _evtRefreshSingleRowPrices();
  if (_evtGroups.length) _evtBuildGroups();
}
// Country changed → rebuild the Marketplace(site) options for that country, then re-scope.
function _evtOnCountryChange() {
  _evtRebuildSites();
  _evtOnScopeChange();
}
// Resolve the selected Special Event site → { company, country, marketplace } (full identity).
// Marketplace value is "company|country|marketplace"; legacy/blank falls back to canonical marketplace.
function _evtSelectedSite() {
  var v = String((document.getElementById('event-marketplace') || {}).value || '');
  var parts = v.split('|');
  if (parts.length === 3) return { company: parts[0], country: parts[1], marketplace: parts[2] };
  var country = (document.getElementById('event-country') || {}).value || '';
  return { company: '', country: country, marketplace: _fcResolveMarketplaceKey(v) };
}
// Rebuild the Marketplace(site) options for the selected country (KM Amazon vs ResUS Amazon distinct).
function _evtRebuildSites() {
  var cSel = document.getElementById('event-country');
  var mSel = document.getElementById('event-marketplace');
  if (!mSel) return;
  var country = cSel ? cSel.value : '';
  var prev = mSel.value;
  var sites = _fcRegularSiteOptions(country);   // shared with Regular FC — full site identity
  mSel.innerHTML = sites.map(function(s){ return '<option value="' + s.value + '">' + s.label + '</option>'; }).join('');
  if (prev && sites.some(function(s){ return s.value === prev; })) mSel.value = prev;
}
// Populate the scoped SKU <datalist> (searchable Single-SKU input) from marketplace_skus matching the
// selected Company + Country + Marketplace (+ active). Out-of-scope SKUs are simply not offered.
function _evtPopulateSkuDatalist() {
  var list = document.getElementById('event-sku-datalist');
  if (!list) return;
  var rows = _evtScopedMskus();
  var seen = {}, opts = [];
  rows.forEach(function(m){ var s = String(m.sku || '').trim(); if (s && !seen[s]) { seen[s] = 1; opts.push(s); } });
  opts.sort();
  list.innerHTML = opts.map(function(s){ return '<option value="' + String(s).replace(/"/g, '&quot;') + '"></option>'; }).join('');
}

// Switch builder mode (single | batch).
function _evtSwitchMode() {
  var mode = _evtMode();
  var s = document.getElementById('event-mode-single');
  var b = document.getElementById('event-mode-batch');
  if (s) s.style.display = mode === 'single' ? '' : 'none';
  if (b) b.style.display = mode === 'batch' ? '' : 'none';
  // Highlight the active segmented button (deterministic — no reliance on :has()).
  Array.prototype.slice.call(document.querySelectorAll('#event-builder-mode .fc-mode-pill')).forEach(function(p){
    var input = p.querySelector('input[type="radio"]');
    p.classList.toggle('is-active', !!(input && input.checked));
  });
}
function _evtMode() {
  var el = document.querySelector('input[name="event-mode"]:checked');
  return el ? el.value : 'single';
}

// Populate Special Event Country / Marketplace selects. Marketplace carries the FULL site identity
// (company|country|marketplace) — same source & pattern as the Regular FC builder — so KM Amazon and
// ResUS Amazon are separate scopes. Company is derived from the selected site, never guessed.
function _populateEventScopeSelects() {
  var demoOn = window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled();
  var mkts = (!demoOn && window.KM && window.KM.DB && window.KM.DB.getMarketplaces) ? window.KM.DB.getMarketplaces() : [];
  var fcRows = (!demoOn && window.KM && window.KM.DB && window.KM.DB.getFcRegularForecast) ? window.KM.DB.getFcRegularForecast() : [];
  function distinct(arr) { var o = [], s = {}; arr.forEach(function(v){ v = String(v||'').trim(); if (v && !s[v]) { s[v]=1; o.push(v); } }); return o.sort(); }
  var srcCountries = demoOn
    ? (fcRegularMock || []).map(function(r){ return r.country; })
    : mkts.map(function(m){return m.country;}).concat(fcRows.map(function(r){return r.country;}));
  var countries = distinct(srcCountries);
  if (!countries.length) countries = ['US', 'UK', 'DE', 'CA', 'JP', 'AU'];
  var filters = (typeof getFcFilters === 'function') ? getFcFilters() : { countries: [], marketplaces: [] };
  var defCountry = (filters.countries && filters.countries.length === 1) ? filters.countries[0] : (countries[0] || '');
  var cSel = document.getElementById('event-country');
  if (cSel) cSel.innerHTML = countries.map(function(c){ return '<option value="' + c + '"' + (c === defCountry ? ' selected' : '') + '>' + c + '</option>'; }).join('');
  _evtRebuildSites();            // marketplace = full site identity for the selected country
  _evtPopulateSkuDatalist();     // scoped SKU list for the Single-SKU searchable input
}

// Populate Category / Series dropdown multi-selects for Batch mode from sku_details (distinct values).
// Defaults to "All" (All checkbox on, no individual option checked).
function _populateEventBatchSelects() {
  var details = (window.KM && window.KM.DB && window.KM.DB.getSkuDetails) ? window.KM.DB.getSkuDetails() : [];
  function distinct(arr) { var o = [], s = {}; arr.forEach(function(v){ v = String(v||'').trim(); if (v && !s[v]) { s[v]=1; o.push(v); } }); return o.sort(); }
  function fill(which, values) {
    var box = document.getElementById('event-' + which + '-options');
    if (box) box.innerHTML = values.map(function(v){
      var safe = String(v).replace(/"/g, '&quot;');
      return '<label class="fc-ms-item"><input type="checkbox" value="' + safe + '" onchange="_evtMsChanged(\'' + which + '\')"><span>' + v + '</span></label>';
    }).join('');
    var allCb = document.getElementById('event-' + which + '-all'); if (allCb) allCb.checked = true;   // default = All
    var panel = document.getElementById('event-' + which + '-panel'); if (panel) panel.style.display = 'none';
    _evtMsUpdateText(which);
  }
  fill('category', distinct(details.map(function(d){ return d.category; })));
  fill('series', distinct(details.map(function(d){ return d.series; })));
  _evtUpdateDiscountRow();
}

// ---- In-modal dropdown multi-select (Category / Series), compact like the FC filter multiselect ----
// which = 'category' | 'series'. Selected values drive Build / Refresh Group Cards; "All" = null.
// Close behavior (fixed): toggling one panel closes the other; a checkbox change does NOT close the
// panel (multi-select stays open); clicking outside, pressing Escape, Build/Refresh, and closing the
// modal all close it; reopening the modal never restores a stale-open panel (reset on open + on close).
function _evtToggleMsPanel(which) {
  // stopPropagation so the just-fired click doesn't reach the outside-click closer and immediately
  // re-close the panel we are opening (the inline onclick has no event, so guard the current event).
  if (window.event) { try { window.event.stopPropagation(); } catch (e) {} }
  var panel = document.getElementById('event-' + which + '-panel');
  if (!panel) return;
  var show = (panel.style.display === 'none' || !panel.style.display);
  ['category','series'].forEach(function(w){ var p = document.getElementById('event-' + w + '-panel'); if (p) p.style.display = 'none'; });
  panel.style.display = show ? '' : 'none';
}

// Close BOTH in-modal multi-select panels (Category / Series).
function _evtCloseAllMs() {
  ['category','series'].forEach(function(w){ var p = document.getElementById('event-' + w + '-panel'); if (p) p.style.display = 'none'; });
}

// Bind the outside-click + Escape closers for the in-modal multi-selects EXACTLY once. A click that
// is not inside a `.fc-ms` closes any open panel; Escape closes them too. Checkbox changes happen
// inside `.fc-ms`, so they never trigger a close (the multi-select stays open across selections).
var _evtMsGlobalBound = false;
function _evtBindMsGlobalClose() {
  if (_evtMsGlobalBound) return;
  document.addEventListener('click', function(e) {
    // Only act while the event modal is open.
    var modal = document.getElementById('fc-add-event-modal');
    if (!modal || !modal.classList.contains('is-open')) return;
    if (e.target && e.target.closest && e.target.closest('#fc-add-event-modal .fc-ms')) return; // click inside a multi-select
    _evtCloseAllMs();
  });
  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;
    var modal = document.getElementById('fc-add-event-modal');
    if (!modal || !modal.classList.contains('is-open')) return;
    _evtCloseAllMs();
  });
  _evtMsGlobalBound = true;
}
// "All" checkbox toggled → checking it clears individual options (= all); then resync state/text.
function _evtMsAll(which, cb) {
  if (cb.checked) {
    Array.prototype.slice.call(document.querySelectorAll('#event-' + which + '-options input[type="checkbox"]'))
      .forEach(function(o){ o.checked = false; });
  }
  _evtMsSyncAll(which);
}
// Individual option toggled → All is on only when no option is checked.
function _evtMsChanged(which) { _evtMsSyncAll(which); }
function _evtMsSyncAll(which) {
  var opts = Array.prototype.slice.call(document.querySelectorAll('#event-' + which + '-options input[type="checkbox"]'));
  var anyChecked = opts.some(function(o){ return o.checked; });
  var allCb = document.getElementById('event-' + which + '-all');
  if (allCb) allCb.checked = !anyChecked;
  _evtMsUpdateText(which);
  if (which === 'category') _evtRebuildSeriesOptions();   // Series depends on selected Category
  _evtUpdateDiscountRow();
}
// Rebuild the Special Event Series options constrained to the selected Category(ies); preserve
// still-valid checked series (shared _fcSeriesForCategories helper; never hard-coded).
function _evtRebuildSeriesOptions() {
  var box = document.getElementById('event-series-options');
  if (!box) return;
  var prevSel = _evtMsValues('series');
  var valid = _fcSeriesForCategories(_evtMsValues('category'));
  box.innerHTML = valid.map(function(v){
    var safe = String(v).replace(/"/g, '&quot;');
    var checked = (prevSel && prevSel.indexOf(v) >= 0) ? ' checked' : '';
    return '<label class="fc-ms-item"><input type="checkbox" value="' + safe + '"' + checked + ' onchange="_evtMsChanged(\'series\')"><span>' + v + '</span></label>';
  }).join('');
  var anyChecked = Array.prototype.slice.call(box.querySelectorAll('input[type="checkbox"]')).some(function(o){ return o.checked; });
  var allCb = document.getElementById('event-series-all'); if (allCb) allCb.checked = !anyChecked;
  _evtMsUpdateText('series');
}
// Selected values, or null when "All" (All checked / nothing individually checked).
function _evtMsValues(which) {
  var allCb = document.getElementById('event-' + which + '-all');
  var opts = Array.prototype.slice.call(document.querySelectorAll('#event-' + which + '-options input[type="checkbox"]:checked'));
  if ((allCb && allCb.checked) || !opts.length) return null;   // null = All
  return opts.map(function(o){ return o.value; });
}
// Trigger summary text.
function _evtMsUpdateText(which) {
  var label = which === 'category' ? 'Category' : 'Series';
  var vals = _evtMsValues(which);
  var el = document.getElementById('event-' + which + '-text');
  if (!el) return;
  if (!vals) el.textContent = 'All ' + label;
  else if (vals.length <= 2) el.textContent = vals.join(', ');
  else el.textContent = vals.length + ' ' + label + ' selected';
}
// Discount % row is shown only when All Category OR All Series is selected (Part 4).
function _evtUpdateDiscountRow() {
  var catAll = _evtMsValues('category') === null;
  var serAll = _evtMsValues('series') === null;
  var discRow = document.getElementById('event-discount-row');
  if (discRow) discRow.style.display = (catAll || serAll) ? '' : 'none';
}

// Toggle Event Flag behaviour.
//   Normal    → NOT a special event; Event Period hidden, Save creates nothing.
//   != Normal → Event Period shown/required; Forecast Qty required per SKU row / group card.
function toggleEventFlagFields() {
  var flag = (document.getElementById('event-name-input') || {}).value || 'Normal';
  var isNormal = flag === 'Normal';
  var periodRow = document.getElementById('event-period-row');
  if (periodRow) periodRow.style.display = isNormal ? 'none' : '';
  var desc = document.getElementById('event-method-description');
  if (desc) {
    desc.innerHTML = isNormal
      ? '<strong>Normal:</strong> no special-event forecast is created — regular monthly forecast (fc_regular_forecast) already covers baseline demand. Nothing is written to campaigns / fc_special_events.'
      : '<strong>' + flag + ':</strong> Event Period + Target Year required. Forecast Qty is required per SKU row (Single) / group card (Category-Series). Save targets campaigns → campaign_sku_lines → fc_special_events.';
  }
}

// ---- Event Period (Start / End date) helpers (#3) ----
function _evtClearPeriodError() {
  var row = document.getElementById('event-period-error-row');
  var el = document.getElementById('event-period-error');
  if (el) el.textContent = '';
  if (row) row.style.display = 'none';
}
function _evtShowPeriodError(msg) {
  var row = document.getElementById('event-period-error-row');
  var el = document.getElementById('event-period-error');
  if (el) el.textContent = msg || '';
  if (row) row.style.display = msg ? '' : 'none';
}
// Validate the Event Start/End range and keep Target Year derived from the Start date's year.
// Returns true when the range is valid (or not yet required). Shows an inline message + returns false
// when start > end. Empty dates are allowed here (Save enforces "required" for non-Normal events).
function _evtValidatePeriod() {
  var start = (document.getElementById('event-start-date') || {}).value || '';
  var end = (document.getElementById('event-end-date') || {}).value || '';
  // Derive Target Year consistently from the Start date (fallback: End date). Keeps year in sync.
  var yearSrc = start || end;
  if (yearSrc) {
    var y = parseInt(yearSrc.slice(0, 4), 10);
    var ty = document.getElementById('event-target-year');
    if (ty && y) ty.value = y;
  }
  if (start && end && start > end) {   // ISO yyyy-mm-dd compares lexicographically
    _evtShowPeriodError('Event Start Date must be on or before Event End Date.');
    return false;
  }
  _evtClearPeriodError();
  return true;
}
// Compose the legacy free-text event_period string from the two dates (kept for back-compat display).
function _evtComposePeriod(start, end) {
  if (start && end) return start + '~' + end;
  return start || end || '';
}

// Enable/disable the "Preview & Pre-fill" button (disabled until group cards are built — #5).
function _evtSetPreviewEnabled(on) {
  var btn = document.getElementById('event-assist-btn');
  if (btn) { btn.disabled = !on; btn.style.opacity = on ? '' : '0.5'; btn.style.pointerEvents = on ? '' : 'none'; }
}

// ---- Scoped marketplace_skus for the selected site (Company + Country + Marketplace, active only) ----
// Company is part of the scope key, so KM Amazon SKUs never leak into a ResUS Amazon scope.
var _EVT_INACTIVE_STATUS = { inactive: 1, discontinued: 1, closed: 1, archived: 1, delisted: 1, inactive_sku: 1 };
function _evtScopedMskus() {
  var site = _evtSelectedSite();
  function up(v){ return String(v==null?'':v).trim().toUpperCase(); }
  function lo(v){ return String(v==null?'':v).trim().toLowerCase(); }
  var mkey = _fcResolveMarketplaceKey(site.marketplace);
  var mskus = (window.KM && window.KM.DB && window.KM.DB.getMarketplaceSkus) ? window.KM.DB.getMarketplaceSkus() : [];
  return mskus.filter(function(m){
    if (site.company && up(m.company) !== up(site.company)) return false;
    if (site.country && up(m.country) !== up(site.country)) return false;
    if (mkey && lo(m.marketplace) !== lo(mkey)) return false;
    var st = lo(m.marketplaceSkuStatus);
    if (st && _EVT_INACTIVE_STATUS[st]) return false;    // exclude only explicitly-inactive rows
    return true;
  });
}

// Decimal precision for a currency (JPY/KRW have no minor unit). Used for Deal Price rounding.
function _evtDealPrecision(currency) {
  var c = String(currency || 'USD').trim().toUpperCase();
  return (c === 'JPY' || c === 'KRW' || c === 'VND' || c === 'CLP') ? 0 : 2;
}
function _evtRoundMoney(value, currency) {
  var p = _evtDealPrecision(currency), f = Math.pow(10, p);
  return Math.round(Number(value) * f) / f;
}

// Resolve regular price + canonical identity for a SKU in the selected scope. Regular price is
// resolved by marketplace_sku_id against pricing_list (canonical), then marketplace_skus. Returns
// { inScope, marketplaceSkuId, regularPrice(number|null — null = MISSING, never fabricated 0), currency }.
function _evtSkuPricing(sku) {
  function up(v){ return String(v==null?'':v).trim().toUpperCase(); }
  var m = _evtScopedMskus().filter(function(x){ return up(x.sku) === up(sku); })[0];
  var out = { inScope: !!m, marketplaceSkuId: m ? m.marketplaceSkuId : '', regularPrice: null, currency: (m && m.currency) || 'USD' };
  if (!m) return out;
  var pl = (window.KM && window.KM.DB && window.KM.DB.getPricingList) ? window.KM.DB.getPricingList() : [];
  var p = m.marketplaceSkuId ? pl.filter(function(x){ return up(x.marketplaceSkuId) === up(m.marketplaceSkuId); })[0] : null;
  // pricing_list normalizer coerces a missing regular_price to 0 — read raw to tell "missing" from "0".
  var rawPrice;
  if (p) { rawPrice = p.raw ? p.raw.regular_price : p.regularPrice; if (p.currency) out.currency = p.currency; }
  else { rawPrice = (m.raw ? m.raw.regular_price : undefined); if (rawPrice === undefined) rawPrice = m.regularPrice; }
  var num = parseFloat(rawPrice);
  out.regularPrice = (rawPrice === '' || rawPrice == null || isNaN(num) || num <= 0) ? null : num;
  return out;
}
// Back-compat: legacy callers expect a bare number (0 when missing).
function _evtRegularPrice(sku) {
  var r = _evtSkuPricing(sku);
  return r.regularPrice == null ? 0 : r.regularPrice;
}

// Resolve the canonical marketplace_id for the selected site (company + country + marketplace).
function _evtResolveMarketplaceId(site) {
  function up(v){ return String(v==null?'':v).trim().toUpperCase(); }
  function lo(v){ return String(v==null?'':v).trim().toLowerCase(); }
  var mkey = _fcResolveMarketplaceKey(site.marketplace);
  var mkts = (window.KM && window.KM.DB && window.KM.DB.getMarketplaces) ? window.KM.DB.getMarketplaces() : [];
  var m = mkts.filter(function(x){
    return (!site.company || up(x.company) === up(site.company)) &&
      (!site.country || up(x.country) === up(site.country)) &&
      (!mkey || lo(x.marketplace) === lo(mkey));
  })[0];
  return m ? m.marketplaceId : '';
}

// ADJUST base: fc_regular_forecast[baseYear][baseMonthIdx] for a SKU in the selected scope
// (company + country + marketplace). Returns a number, or null when there is no scoped row/month
// (→ "No Base Forecast", SKU skipped, never fabricated 0).
function _evtBaseFcForSku(sku, monthIdx, baseYear) {
  var site = _evtSelectedSite();
  function up(v){ return String(v==null?'':v).trim().toUpperCase(); }
  function lo(v){ return String(v==null?'':v).trim().toLowerCase(); }
  if (!baseYear) baseYear = parseInt((document.getElementById('event-assist-base-year') || {}).value, 10);
  if (monthIdx == null || monthIdx < 0 || !baseYear) return null;
  var rows = (window.KM && window.KM.DB && window.KM.DB.getFcRegularForecast) ? window.KM.DB.getFcRegularForecast() : [];
  var mkey = _fcResolveMarketplaceKey(site.marketplace);
  var row = rows.filter(function(r){
    return up(r.sku) === up(sku) && String(r.year) === String(baseYear) &&
      (!site.company || up(r.company) === up(site.company)) &&
      (!site.country || up(r.country) === up(site.country)) &&
      (!mkey || lo(r.marketplace) === lo(mkey));
  })[0];
  if (!row) return null;
  var raw = row[REG_MONTH_KEYS[monthIdx]];
  if (raw === '' || raw == null) return null;
  var n = Number(raw);
  return isNaN(n) ? null : Math.round(n);
}
// GROWTH base: Σ fc_special_events.fc_qty for the selected Base Campaign + this SKU in the current
// scope. Returns a number, or null when the campaign has no FC for this SKU (→ "No Base Campaign FC",
// SKU skipped, never fabricated 0). Matches by campaign_id (never by event_name string).
function _evtGrowthBaseForSku(campaignId, sku) {
  if (!campaignId) return null;
  var site = _evtSelectedSite();
  function up(v){ return String(v==null?'':v).trim().toUpperCase(); }
  function lo(v){ return String(v==null?'':v).trim().toLowerCase(); }
  var mkey = _fcResolveMarketplaceKey(site.marketplace);
  var events = (window.KM && window.KM.DB && window.KM.DB.getFcSpecialEvents) ? window.KM.DB.getFcSpecialEvents() : [];
  var total = null;
  events.forEach(function(e){
    if (String(e.campaignId || '') !== String(campaignId)) return;
    if (up(e.sku) !== up(sku)) return;
    if (site.company && e.company && up(e.company) !== up(site.company)) return;
    if (site.country && e.country && up(e.country) !== up(site.country)) return;
    if (mkey && e.marketplace && lo(e.marketplace) !== lo(mkey)) return;
    total = (total || 0) + (parseFloat(e.fcQty) || 0);
  });
  return total;
}
// Populate the Base Campaign dropdown (Apply Growth Rate). Value = campaign_id (stable key, never the
// {year}_{event} string); label = {year}_{event_name}. Candidates = campaigns that have valid scoped
// fc_special_events FC (matching company + country + marketplace + selected category/series, fc_qty>0).
function _evtPopulateBaseCampaigns() {
  var sel = document.getElementById('event-assist-base-campaign');
  if (!sel) return;
  var site = _evtSelectedSite();
  function up(v){ return String(v==null?'':v).trim().toUpperCase(); }
  function lo(v){ return String(v==null?'':v).trim().toLowerCase(); }
  var mkey = _fcResolveMarketplaceKey(site.marketplace);
  var cats = _evtMsValues('category'), series = _evtMsValues('series');
  var campaigns = (window.KM && window.KM.DB && window.KM.DB.getCampaigns) ? window.KM.DB.getCampaigns() : [];
  var events = (window.KM && window.KM.DB && window.KM.DB.getFcSpecialEvents) ? window.KM.DB.getFcSpecialEvents() : [];
  // Which campaigns have valid scoped FC?
  var valid = {};
  events.forEach(function(e){
    if (!e.campaignId) return;
    if (site.company && e.company && up(e.company) !== up(site.company)) return;
    if (site.country && e.country && up(e.country) !== up(site.country)) return;
    if (mkey && e.marketplace && lo(e.marketplace) !== lo(mkey)) return;
    if (cats && cats.indexOf(e.category) < 0) return;
    if (series && series.indexOf(e.series) < 0) return;
    if (!(parseFloat(e.fcQty) > 0)) return;
    valid[e.campaignId] = 1;
  });
  var list = campaigns.filter(function(c){
    if (!c.campaignId || !valid[c.campaignId]) return false;
    if (site.company && c.company && up(c.company) !== up(site.company)) return false;
    if (site.country && c.country && up(c.country) !== up(site.country)) return false;
    if (mkey && c.marketplace && lo(c.marketplace) !== lo(mkey)) return false;
    return true;
  });
  var prev = sel.value;
  if (!list.length) { sel.disabled = true; sel.innerHTML = '<option value="">(no matching campaign with FC data)</option>'; return; }
  sel.disabled = false;
  sel.innerHTML = '<option value="">Select Base Campaign</option>' + list.map(function(c){
    var name = c.eventFlag || c.promotionType || c.campaignName || 'Campaign';
    var label = (c.year ? (c.year + '_') : '') + String(name).replace(/\s+/g, '_');
    return '<option value="' + c.campaignId + '">' + label + '</option>';
  }).join('');
  if (prev && list.some(function(c){ return c.campaignId === prev; })) sel.value = prev;
}
// Month index (0–11) of the event Start Date; null when not set.
function _evtEventMonthIdx() {
  var sd = ((document.getElementById('event-start-date') || {}).value || '').trim();
  if (!sd || sd.length < 7) return null;
  var m = parseInt(sd.slice(5, 7), 10);
  return (m >= 1 && m <= 12) ? (m - 1) : null;
}

// ================= Single SKU mode =================
// Row layout (6 cols): SKU (scoped datalist) · Regular Price (readonly) · Discount % · Deal Price ·
// Forecast Qty · remove. Regular Price + marketplace_sku_id resolve from the scoped pricing; a SKU
// outside the selected Company/Country/Marketplace scope is flagged and blocked at Save.
function _evtAddSingleRow() {
  var wrap = document.getElementById('event-sku-rows');
  if (!wrap) return;
  if (wrap.children.length >= EVT_MAX_ROWS) { alert('Maximum ' + EVT_MAX_ROWS + ' SKU rows.'); return; }
  var row = document.createElement('div');
  row.className = 'fc-evt-row fc-evt-row--single';
  row.innerHTML =
    '<input type="text" class="evt-sku" list="event-sku-datalist" placeholder="Search SKU…" onchange="_evtSingleRowSkuChange(this)">' +
    '<input type="number" class="evt-reg" placeholder="Regular" step="0.01" readonly>' +
    '<input type="number" class="evt-disc" placeholder="%" min="0" max="100" step="0.1" onchange="_evtSingleRowDiscChange(this)">' +
    '<input type="number" class="evt-deal" placeholder="Deal" step="0.01">' +
    '<input type="number" class="evt-fc" placeholder="Qty" min="0">' +
    '<button type="button" class="fc-evt-row-remove" title="Remove" onclick="_evtRemoveSingleRow(this)">×</button>';
  wrap.appendChild(row);
  _evtUpdateAddRowBtn();
}
function _evtRemoveSingleRow(btn) {
  var row = btn.closest('.fc-evt-row');
  if (row) row.remove();
  var wrap = document.getElementById('event-sku-rows');
  if (wrap && !wrap.children.length) _evtAddSingleRow();  // always keep at least one row
  _evtUpdateAddRowBtn();
}
function _evtUpdateAddRowBtn() {
  var wrap = document.getElementById('event-sku-rows');
  var btn = document.getElementById('event-add-row-btn');
  if (wrap && btn) { var full = wrap.children.length >= EVT_MAX_ROWS; btn.disabled = full; btn.style.opacity = full ? '0.5' : ''; }
}
// Apply a row's Regular Price + scope/missing-price state from the scoped pricing lookup.
function _evtApplyRowPricing(row) {
  var sku = ((row.querySelector('.evt-sku') || {}).value || '').trim();
  var regEl = row.querySelector('.evt-reg');
  var skuEl = row.querySelector('.evt-sku');
  row.dataset.marketplaceSkuId = '';
  row.dataset.priceState = '';
  if (!sku) { if (regEl) regEl.value = ''; if (skuEl) skuEl.classList.remove('is-invalid'); return; }
  var pr = _evtSkuPricing(sku);
  row.dataset.marketplaceSkuId = pr.marketplaceSkuId || '';
  if (!pr.inScope) {
    if (regEl) { regEl.value = ''; regEl.placeholder = 'Out of scope'; }
    if (skuEl) skuEl.classList.add('is-invalid');
    row.dataset.priceState = 'out_of_scope';
    return;
  }
  if (skuEl) skuEl.classList.remove('is-invalid');
  if (pr.regularPrice == null) {
    if (regEl) { regEl.value = ''; regEl.placeholder = 'Missing Regular Price'; }
    row.dataset.priceState = 'missing_price';
    return;
  }
  if (regEl) regEl.value = pr.regularPrice;
  row.dataset.priceState = 'ok';
  row.dataset.currency = pr.currency || 'USD';
  _evtRecalcRowDeal(row);
}
// Recompute a row's Deal Price from its Discount % (deal = regular × (1 − disc/100)); blank disc leaves deal.
function _evtRecalcRowDeal(row) {
  var reg = parseFloat((row.querySelector('.evt-reg') || {}).value);
  var disc = parseFloat((row.querySelector('.evt-disc') || {}).value);
  if (isNaN(reg) || isNaN(disc)) return;
  var dealEl = row.querySelector('.evt-deal');
  if (dealEl) dealEl.value = _evtRoundMoney(reg * (1 - disc / 100), row.dataset.currency || 'USD');
}
function _evtSingleRowSkuChange(input) {
  var row = input.closest('.fc-evt-row'); if (!row) return;
  _evtApplyRowPricing(row);
}
function _evtSingleRowDiscChange(input) {
  var row = input.closest('.fc-evt-row'); if (!row) return;
  _evtRecalcRowDeal(row);
}
function _evtRefreshSingleRowPrices() {
  var wrap = document.getElementById('event-sku-rows'); if (!wrap) return;
  Array.prototype.slice.call(wrap.querySelectorAll('.fc-evt-row')).forEach(function(row){ _evtApplyRowPricing(row); });
}
// Read the single-SKU rows into objects (carrying scope/price state + marketplace_sku_id).
function _evtReadSingleRows() {
  var wrap = document.getElementById('event-sku-rows'); if (!wrap) return [];
  return Array.prototype.slice.call(wrap.querySelectorAll('.fc-evt-row')).map(function(row){
    var regRaw = (row.querySelector('.evt-reg') || {}).value;
    return {
      sku: ((row.querySelector('.evt-sku') || {}).value || '').trim(),
      marketplaceSkuId: row.dataset.marketplaceSkuId || '',
      priceState: row.dataset.priceState || '',
      regularPrice: (regRaw === '' || regRaw == null) ? null : (parseFloat(regRaw) || 0),
      discountPercent: parseFloat((row.querySelector('.evt-disc') || {}).value),
      dealPrice: parseFloat((row.querySelector('.evt-deal') || {}).value),
      fcQty: parseInt((row.querySelector('.evt-fc') || {}).value, 10)
    };
  }).filter(function(r){ return r.sku; });
}

// Derive category / series for a SKU from sku_details. Company is NOT first-matched from
// marketplace_skus anymore — it comes from the selected site (company|country|marketplace).
function _fcDeriveSkuMeta(sku) {
  function up(v){ return String(v==null?'':v).trim().toUpperCase(); }
  var meta = { category: '', series: '', company: _evtSelectedSite().company || '' };
  var details = (window.KM && window.KM.DB && window.KM.DB.getSkuDetails) ? window.KM.DB.getSkuDetails() : [];
  var d = details.filter(function(x){ return up(x.sku) === up(sku); })[0];
  if (d) { meta.category = d.category || ''; meta.series = d.series || ''; }
  return meta;
}

// ================= Category / Series mode =================
// Candidate {sku, category, series, marketplaceSkuId, regularPrice} rows for the selected SITE scope
// (company + country + marketplace, active) filtered by the Category / Series multiselect.
function _evtCandidateRows() {
  var cats = _evtMsValues('category');   // null = All Category
  var series = _evtMsValues('series');   // null = All Series
  function up(v){ return String(v==null?'':v).trim().toUpperCase(); }
  var details = (window.KM && window.KM.DB && window.KM.DB.getSkuDetails) ? window.KM.DB.getSkuDetails() : [];
  var detBySku = {}; details.forEach(function(d){ detBySku[up(d.sku)] = d; });
  var seen = {};
  return _evtScopedMskus().map(function(m){
    var d = detBySku[up(m.sku)] || {};
    var pr = _evtSkuPricing(m.sku);
    return { sku: m.sku, category: d.category || '', series: d.series || '',
      marketplaceSkuId: pr.marketplaceSkuId || m.marketplaceSkuId || '', regularPrice: pr.regularPrice };
  }).filter(function(r){
    if (!r.sku || seen[up(r.sku)]) return false;
    var cOk = !cats || cats.indexOf(r.category) >= 0;
    var sOk = !series || series.indexOf(r.series) >= 0;
    if (cOk && sOk) { seen[up(r.sku)] = 1; return true; }
    return false;
  });
}

// Build group cards keyed by category + series ONLY (SKUs with different regular prices stay in the
// same card as separate rows — never split by price). Each row: {sku, marketplaceSkuId, regularPrice,
// discountPct, dealPrice, baseFc, newFc}. Preserves any values the user already typed for the same
// (category||series, sku).
function _evtBuildGroups() {
  _evtCloseAllMs();
  var rows = _evtCandidateRows();
  // Preserve prior per-row user entries keyed by category||series::sku.
  var prev = {};
  _evtGroups.forEach(function(g){ (g.rows || []).forEach(function(r){ prev[g.category+'||'+g.series+'::'+String(r.sku).toUpperCase()] = r; }); });
  var byKey = {};
  rows.forEach(function(r){
    var key = r.category + '||' + r.series;
    if (!byKey[key]) byKey[key] = { category: r.category, series: r.series, discountPct: NaN, rows: [] };
    if (byKey[key].rows.some(function(x){ return String(x.sku).toUpperCase() === String(r.sku).toUpperCase(); })) return;
    var p = prev[key + '::' + String(r.sku).toUpperCase()];
    byKey[key].rows.push({
      sku: r.sku, marketplaceSkuId: r.marketplaceSkuId, regularPrice: r.regularPrice,
      discountPct: p ? p.discountPct : NaN,
      dealPrice: p ? p.dealPrice : NaN,
      baseFc: p ? p.baseFc : null,
      newFc: p ? p.newFc : NaN
    });
  });
  _evtGroups = Object.keys(byKey).map(function(k){ return byKey[k]; })
    .sort(function(a,b){ return (a.category+a.series).localeCompare(b.category+b.series); });
  _evtRenderGroupCards();
  _evtSetPreviewEnabled(_evtGroups.length > 0);   // #5: Preview enabled only after cards exist
}

// Render group cards — one ROW per scoped SKU (SKU · Regular · Discount% · Deal · Base FC ·
// New Event FC · Diff · state). Forecast editability is method-aware: Manual = editable New Event FC
// input; Growth/Adjust = read-only computed value.
function _evtRenderGroupCards() {
  var wrap = document.getElementById('event-group-cards');
  if (!wrap) return;
  if (!_evtGroups.length) { wrap.innerHTML = '<p class="fc-hint">No matching SKUs for the selected scope + category/series. Adjust the selection and click Build.</p>'; return; }
  var method = _evtAssistMethod();
  var editable = (method === 'manual');
  wrap.innerHTML = _evtGroups.map(function(g, i){
    var head =
      '<div class="fc-evt-card-head">' +
        '<span class="fc-evt-tag">' + (g.category || '—') + '</span>' +
        '<span class="fc-evt-tag">' + (g.series || '—') + '</span>' +
        '<label class="fc-evt-card-disc">Discount % <input type="number" min="0" max="100" step="0.1" value="' + (isNaN(g.discountPct) ? '' : g.discountPct) + '" onchange="_evtCardDiscount(' + i + ',this.value)"></label>' +
        '<button type="button" class="fc-evt-row-remove" title="Remove group" onclick="_evtRemoveGroup(' + i + ')">×</button>' +
      '</div>';
    var colHead = '<div class="fc-evt-line fc-evt-line--head"><span>SKU</span><span>Regular</span><span>Disc %</span><span>Deal</span><span>Base FC</span><span>New Event FC</span><span>Diff</span><span></span></div>';
    var body = g.rows.map(function(r, ri){
      var regTxt = (r.regularPrice == null) ? '<span class="fc-evt-warn">Missing</span>' : r.regularPrice;
      var base = (r.baseFc == null) ? null : r.baseFc;
      var diff = (!isNaN(r.newFc) && base != null) ? (r.newFc - base) : null;
      var diffTxt = (diff == null) ? '—' : ((diff > 0 ? '+' : '') + diff.toLocaleString());
      var diffColor = (diff == null) ? '#94a3b8' : (diff > 0 ? '#0f766e' : (diff < 0 ? '#dc2626' : '#64748b'));
      var newCell = editable
        ? '<input type="number" min="0" class="evt-line-fc" value="' + (isNaN(r.newFc) ? '' : r.newFc) + '" onchange="_evtLineField(' + i + ',' + ri + ',\'newFc\',this.value)">'
        : '<span class="evt-line-ro">' + (isNaN(r.newFc) ? '—' : r.newFc.toLocaleString()) + '</span>';
      return '<div class="fc-evt-line">' +
        '<span class="fc-evt-line-sku" title="' + r.sku + '">' + r.sku + ' <a onclick="_evtRemoveGroupSku(' + i + ',\'' + String(r.sku).replace(/'/g,"\\'") + '\')">×</a></span>' +
        '<span>' + regTxt + '</span>' +
        '<input type="number" min="0" max="100" step="0.1" class="evt-line-disc" value="' + (isNaN(r.discountPct) ? '' : r.discountPct) + '" onchange="_evtLineField(' + i + ',' + ri + ',\'discountPct\',this.value)">' +
        '<input type="number" step="0.01" class="evt-line-deal" value="' + (isNaN(r.dealPrice) ? '' : r.dealPrice) + '" onchange="_evtLineField(' + i + ',' + ri + ',\'dealPrice\',this.value)">' +
        '<span>' + (base == null ? '—' : base.toLocaleString()) + '</span>' +
        newCell +
        '<span style="color:' + diffColor + '">' + diffTxt + '</span>' +
        '<span></span>' +
      '</div>';
    }).join('');
    return '<div class="fc-evt-card"><div class="fc-evt-card-lines">' + head + colHead + body + '</div></div>';
  }).join('');
}
// A card's Discount % (group-level) → set every row's discount + recompute its deal price.
function _evtCardDiscount(i, val) {
  var g = _evtGroups[i]; if (!g) return;
  var pct = (val === '' ? NaN : parseFloat(val));
  g.discountPct = pct;
  var site = _evtSelectedSite();
  g.rows.forEach(function(r){
    r.discountPct = pct;
    if (!isNaN(pct) && r.regularPrice != null) r.dealPrice = _evtRoundMoney(r.regularPrice * (1 - pct / 100), site.currency);
  });
  _evtRenderGroupCards();
}
// Edit one row field (discountPct → recompute deal; dealPrice / newFc direct).
function _evtLineField(gi, ri, field, val) {
  var g = _evtGroups[gi]; if (!g || !g.rows[ri]) return;
  var r = g.rows[ri];
  var num = (val === '' ? NaN : parseFloat(val));
  r[field] = num;
  if (field === 'discountPct' && !isNaN(num) && r.regularPrice != null) {
    r.dealPrice = _evtRoundMoney(r.regularPrice * (1 - num / 100), _evtSelectedSite().currency);
  }
  _evtRenderGroupCards();
}
function _evtRemoveGroup(i) { _evtGroups.splice(i, 1); _evtRenderGroupCards(); _evtSetPreviewEnabled(_evtGroups.length > 0); }
function _evtRemoveGroupSku(i, sku) {
  var g = _evtGroups[i]; if (!g) return;
  g.rows = g.rows.filter(function(r){ return String(r.sku).toUpperCase() !== String(sku).toUpperCase(); });
  if (!g.rows.length) _evtGroups.splice(i, 1);
  _evtRenderGroupCards();
  _evtSetPreviewEnabled(_evtGroups.length > 0);
}

// Discount %: apply the top-level Discount % to every row in every card (deal = regular×(1−d/100)).
function _evtApplyDiscount() {
  var pct = parseFloat((document.getElementById('event-discount-pct') || {}).value);
  if (isNaN(pct) || pct < 0 || pct > 100) { alert('Enter a Discount % between 0 and 100.'); return; }
  if (!_evtGroups.length) { alert('Build the group cards first.'); return; }
  var site = _evtSelectedSite();
  _evtGroups.forEach(function(g){
    g.discountPct = pct;
    g.rows.forEach(function(r){ r.discountPct = pct; if (r.regularPrice != null) r.dealPrice = _evtRoundMoney(r.regularPrice * (1 - pct / 100), site.currency); });
  });
  _evtRenderGroupCards();
}

// ---- Forecast method helpers ----
function _evtSetAssistHelp(msg, color) {
  var el = document.getElementById('event-assist-help');
  if (el) { el.textContent = msg || ''; el.style.color = color || '#64748B'; el.style.display = msg ? '' : 'none'; }
}
// Active method: 'growth' | 'adjust' | 'manual'.
function _evtAssistMethod() {
  return (document.getElementById('event-assist-method') || {}).value || 'growth';
}
// Show/hide method-specific inputs; re-render cards so forecast editability matches the method.
function _evtToggleAssistFields() {
  var method = _evtAssistMethod();
  var growthRow = document.getElementById('event-assist-growth-row');        // Base Campaign + Growth Rate
  var basePeriodRow = document.getElementById('event-assist-base-period-row'); // Base Year + Base Month
  var adjustRow = document.getElementById('event-assist-adjust-row');        // Adjustment type + value
  if (growthRow) growthRow.style.display = (method === 'growth') ? '' : 'none';
  if (basePeriodRow) basePeriodRow.style.display = (method === 'adjust') ? '' : 'none';
  if (adjustRow) adjustRow.style.display = (method === 'adjust') ? '' : 'none';
  var lbl = document.getElementById('event-assist-adjust-label');
  var type = (document.getElementById('event-assist-adjust-type') || {}).value || 'percent';
  if (lbl) lbl.textContent = (type === 'fixed') ? 'Adjustment (± units)' : 'Adjustment %';
  // Clear the OTHER method's inputs so a stale value can't leak into the next preview/save.
  if (method !== 'growth') { var g = document.getElementById('event-assist-growth'); if (g) g.value = ''; }
  if (method !== 'adjust') { var av = document.getElementById('event-assist-adjust-value'); if (av) av.value = ''; }
  if (method === 'growth') _evtPopulateBaseCampaigns();   // scoped Base Campaign candidates
  if (_evtGroups.length) _evtRenderGroupCards();          // toggle read-only vs editable New Event FC
}
// Render the per-SKU preview table (SKU · Base FC · New Event FC · Difference). PREVIEW ONLY.
function _evtRenderAssistPreview(rows) {
  var box = document.getElementById('event-assist-preview');
  if (!box) return;
  if (!rows || !rows.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
  var html = '<table class="fc-assist-preview-table"><thead><tr>' +
    '<th>Category</th><th>Series</th><th>SKU</th><th>Base FC</th><th>New Event FC</th><th>Difference</th></tr></thead><tbody>' +
    rows.map(function(r){
      var hasBase = (r.base != null);
      var diff = (hasBase && r.newQty != null) ? (r.newQty - r.base) : null;
      var sign = (diff != null && diff > 0) ? '+' : '';
      var color = (diff == null) ? '#94a3b8' : (diff > 0 ? '#0f766e' : (diff < 0 ? '#dc2626' : '#64748b'));
      var baseCell = hasBase ? r.base.toLocaleString() : ('<span class="fc-evt-warn">' + (r.note || 'No Base FC') + '</span>');
      return '<tr><td>' + (r.category || '—') + '</td><td>' + (r.series || '—') + '</td><td>' + r.sku + '</td>' +
        '<td>' + baseCell + '</td>' +
        '<td>' + (r.newQty == null ? '<span class="fc-evt-warn">Skip</span>' : r.newQty.toLocaleString()) + '</td>' +
        '<td style="color:' + color + '">' + (diff == null ? '—' : sign + diff.toLocaleString()) + '</td></tr>';
    }).join('') + '</tbody></table>';
  box.innerHTML = html;
  box.style.display = '';
}
// Preview & Pre-fill (validation stage, PREVIEW-ONLY — never writes DB). Base source by method:
//   growth : base = Σ Base Campaign fc_special_events.fc_qty for the SKU; newFc = round(base × (1+g%))
//   adjust : base = fc_regular_forecast[Base Year][Base Month] for the SKU; percent/fixed adjustment
//   manual : no calc — user edits New Event FC per SKU; preview echoes current values
// A SKU with no base is SKIPPED (New Event FC blank / "No Base Campaign FC" / "No Base Forecast") —
// never written as 0.
function _evtApplyForecastAssist() {
  if (_evtMode() !== 'batch') { alert('Preview applies to Category / Series (Group Cards) mode.'); return; }
  if (!_evtGroups.length) { alert('Build the group cards first.'); return; }
  var method = _evtAssistMethod();

  var compute, baseFor, noBaseLabel = '';
  if (method === 'growth') {
    var campaignId = (document.getElementById('event-assist-base-campaign') || {}).value || '';
    if (!campaignId) { alert('Select a Base Campaign.'); return; }
    var growth = parseFloat((document.getElementById('event-assist-growth') || {}).value);
    if (isNaN(growth)) { alert('Enter a Growth Rate %.'); return; }
    baseFor = function(sku){ return _evtGrowthBaseForSku(campaignId, sku); };
    compute = function(b){ return Math.round(b * (1 + growth / 100)); };
    noBaseLabel = 'No Base Campaign FC';
  } else if (method === 'adjust') {
    var baseYear = parseInt((document.getElementById('event-assist-base-year') || {}).value, 10);
    var baseMonthIdx = parseInt((document.getElementById('event-assist-base-month') || {}).value, 10);
    if (!baseYear) { alert('Enter a Base Year.'); return; }
    if (isNaN(baseMonthIdx)) { alert('Select a Base Month.'); return; }
    var type = (document.getElementById('event-assist-adjust-type') || {}).value || 'percent';
    var val = parseFloat((document.getElementById('event-assist-adjust-value') || {}).value);
    if (isNaN(val)) { alert('Enter an Adjustment value.'); return; }
    baseFor = function(sku){ return _evtBaseFcForSku(sku, baseMonthIdx, baseYear); };
    compute = (type === 'fixed')
      ? function(b){ return Math.max(0, Math.round(b + val)); }
      : function(b){ return Math.max(0, Math.round(b * (1 + val / 100))); };
    noBaseLabel = 'No Base Forecast';
  } else { compute = null; baseFor = null; }   // manual

  var preview = [], filled = 0, missingBase = 0;
  _evtGroups.forEach(function(g){
    g.rows.forEach(function(r){
      var base = baseFor ? baseFor(r.sku) : null;
      r.baseFc = base;
      var newQty;
      if (compute) {
        if (base == null) { missingBase++; newQty = null; r.newFc = NaN; }
        else { newQty = compute(base); r.newFc = newQty; filled++; }
      } else {
        newQty = isNaN(r.newFc) ? null : r.newFc;   // manual echoes the current editable value
      }
      preview.push({ category: g.category, series: g.series, sku: r.sku, base: base, newQty: newQty,
        note: (compute && base == null) ? noBaseLabel : '' });
    });
  });
  _evtRenderAssistPreview(preview);
  _evtRenderGroupCards();

  if (method === 'manual') {
    _evtSetAssistHelp('Manual Entry: edit New Event FC per SKU below. Blank = skip that SKU. Nothing is written until you click Save.', '#0f766e');
  } else if (missingBase) {
    _evtSetAssistHelp('Pre-filled ' + filled + ' SKU(s). ' + missingBase + ' SKU(s) have ' + noBaseLabel + ' — skipped (New Event FC blank, never fabricated 0). Save will skip them. Nothing is written until Save.', '#b45309');
  } else {
    _evtSetAssistHelp('Previewed & pre-filled New Event FC for ' + filled + ' SKU(s). Review Base FC → New → Difference before Save — nothing is written until you click Save.', '#0f766e');
  }
}

// ================= Save (campaigns → campaign_sku_lines → fc_special_events) =================
// Complete idempotent 3-layer transaction. On live: writes campaigns → campaign_sku_lines →
// fc_special_events in order; if any step fails, stops and reports the real error (never fake
// success, never fc_special_events without a parent campaign line). Demo ON → in-memory illustration.
async function saveEventUpdate() {
  var site = _evtSelectedSite();
  var country = site.country || (document.getElementById('event-country') || {}).value || '';
  var mkey = _fcResolveMarketplaceKey(site.marketplace);
  var company = site.company || '';
  var eventFlag = (document.getElementById('event-name-input') || {}).value || 'Normal';
  var eventStartDate = ((document.getElementById('event-start-date') || {}).value || '').trim();
  var eventEndDate = ((document.getElementById('event-end-date') || {}).value || '').trim();
  var eventPeriod = _evtComposePeriod(eventStartDate, eventEndDate);
  var monthIdx = _evtEventMonthIdx();
  var mode = _evtMode();

  if (!country || !site.marketplace) { alert('Country and Marketplace are required.'); return; }

  if (eventFlag === 'Normal') {
    alert('Event Flag is "Normal" — no campaign / special-event forecast is created.\n\n' +
      'Baseline demand is covered by the regular monthly forecast (fc_regular_forecast).');
    closeFcModal();
    return;
  }
  var demoOn = window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled();
  if (!demoOn && !company) { alert('Select a Marketplace (company scope) — company could not be resolved. KM and ResUS are separate scopes.'); return; }
  if (!eventStartDate || !eventEndDate) { alert('Event Start Date and Event End Date are required for a non-Normal event.'); _evtShowPeriodError('Event Start Date and Event End Date are required.'); return; }
  if (!_evtValidatePeriod()) { alert('Event Start Date must be on or before Event End Date.'); return; }
  var targetYear = parseInt(eventStartDate.slice(0, 4), 10) || parseInt((document.getElementById('event-target-year') || {}).value, 10);
  if (!targetYear) { alert('Target Year is required.'); return; }

  // ---- Collect + validate SKU lines from the active mode ----
  // line: { sku, marketplaceSkuId, category, series, regularPrice, dealPrice, discountPercent, fcQty }
  var lines = [];
  if (mode === 'single') {
    var rows = _evtReadSingleRows();
    if (!rows.length) { alert('Add at least one SKU row.'); return; }
    if (rows.length > EVT_MAX_ROWS) { alert('Maximum ' + EVT_MAX_ROWS + ' SKU rows.'); return; }
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r.sku) { alert('Row ' + (i + 1) + ': SKU is required.'); return; }
      if (r.priceState === 'out_of_scope' || !r.marketplaceSkuId) { alert('Row ' + (i + 1) + ' (' + r.sku + '): SKU is not in the selected Company / Country / Marketplace scope (marketplace_sku_id unresolved).'); return; }
      if (r.priceState === 'missing_price' || r.regularPrice == null) { alert('Row ' + (i + 1) + ' (' + r.sku + '): Missing Regular Price — set the price in pricing_list before saving (not substituted with 0).'); return; }
      if (isNaN(r.dealPrice)) { alert('Row ' + (i + 1) + ' (' + r.sku + '): Deal Price is required.'); return; }
      if (isNaN(r.fcQty) || r.fcQty <= 0) { alert('Row ' + (i + 1) + ' (' + r.sku + '): Forecast Qty is required (> 0).'); return; }
      var meta = _fcDeriveSkuMeta(r.sku);
      var disc = isNaN(r.discountPercent) ? (r.regularPrice > 0 ? Math.round((1 - r.dealPrice / r.regularPrice) * 1000) / 10 : 0) : r.discountPercent;
      lines.push({ sku: r.sku, marketplaceSkuId: r.marketplaceSkuId, category: meta.category, series: meta.series,
        regularPrice: r.regularPrice, dealPrice: r.dealPrice, discountPercent: disc, fcQty: r.fcQty });
    }
  } else {
    if (!_evtGroups.length) { alert('Build the group cards first.'); return; }
    var skipped = 0;
    for (var gi = 0; gi < _evtGroups.length; gi++) {
      var g = _evtGroups[gi];
      for (var ri = 0; ri < g.rows.length; ri++) {
        var gr = g.rows[ri];
        var tag = (g.category || '—') + ' / ' + (g.series || '—') + ' / ' + gr.sku;
        // Blank / no-base New Event FC = SKIP that SKU (not an error, never written as 0).
        if (isNaN(gr.newFc) || gr.newFc <= 0) { skipped++; continue; }
        // Hard errors only for SKUs that DO have a forecast to write.
        if (!gr.marketplaceSkuId) { alert(tag + ': marketplace_sku_id unresolved (out of scope).'); return; }
        if (gr.regularPrice == null) { alert(tag + ': Missing Regular Price — set it in pricing_list (not substituted with 0).'); return; }
        if (isNaN(gr.dealPrice)) { alert(tag + ': Deal Price is required.'); return; }
        var meta2 = _fcDeriveSkuMeta(gr.sku);
        var disc2 = isNaN(gr.discountPct) ? (gr.regularPrice > 0 ? Math.round((1 - gr.dealPrice / gr.regularPrice) * 1000) / 10 : 0) : gr.discountPct;
        lines.push({ sku: gr.sku, marketplaceSkuId: gr.marketplaceSkuId, category: meta2.category, series: meta2.series,
          regularPrice: gr.regularPrice, dealPrice: gr.dealPrice, discountPercent: disc2, fcQty: gr.newFc });
      }
    }
    if (!lines.length) { alert('No SKU lines to save — every card row is blank / has no base forecast (all skipped).'); return; }
    if (skipped && !confirm(skipped + ' SKU(s) have no New Event FC and will be SKIPPED. Save the remaining ' + lines.length + ' SKU(s)?')) return;
  }

  var marketplaceId = _evtResolveMarketplaceId(site);
  var eventMonth = (monthIdx == null) ? '' : (monthIdx + 1);   // fc_special_events.event_month (1–12)

  var campaignPayload = {
    campaign_name: eventFlag + ' ' + targetYear, company: company, marketplace_id: marketplaceId,
    country: country, marketplace: mkey, promotion_type: eventFlag, event_flag: eventFlag,
    major_event_flag: eventFlag, year: targetYear, start_date: eventStartDate, end_date: eventEndDate,
    event_period: eventPeriod, status: 'active', source: 'fc_summary_builder'
  };

  // ---- Demo ON → in-memory illustration only ----
  if (demoOn) {
    lines.forEach(function(l){
      fcEventMock.push({ sku: l.sku, year: targetYear, company: company, marketplace: mkey,
        country: country, category: l.category, series: l.series, event: eventFlag,
        eventPeriod: eventPeriod, fcQty: l.fcQty });
    });
    renderFcEventTable();
    closeFcModal();
    alert('DEMO (in-memory only): ' + lines.length + ' fc_special_events row(s) illustrated. campaigns (1) + campaign_sku_lines (' + lines.length + ') would be written in live mode.');
    return;
  }

  // ---- Live → complete idempotent 3-layer write. Any failure stops + reports honestly. ----
  var DB = window.KM && window.KM.DB;
  if (!DB || !DB.upsertCampaign || !DB.upsertCampaignSkuLines || !DB.upsertFcSpecialEvent) {
    alert('Save failed: campaign writers are not available in this build (upsertCampaign / upsertCampaignSkuLines / upsertFcSpecialEvent). Nothing was written.');
    return;
  }
  var saveBtn = document.querySelector('#fc-add-event-modal .fc-btn--primary');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }
  try {
    // 1) campaign header (idempotent by campaign_id, else business key).
    var camp = await DB.upsertCampaign(campaignPayload);
    var campaignId = (camp && camp.campaign_id) || '';
    if (!campaignId) throw new Error('campaign_id was not returned by the campaigns writer.');

    // 2) campaign_sku_lines (idempotent per line).
    var linePayloads = lines.map(function(l){
      return { marketplace_sku_id: l.marketplaceSkuId, sku: l.sku, regular_price: l.regularPrice,
        deal_price: l.dealPrice, discount_percent: l.discountPercent, line_status: 'active', source: 'fc_summary_builder' };
    });
    var lineRes = await DB.upsertCampaignSkuLines({ campaign_id: campaignId, lines: linePayloads });
    var lineIdBySku = {};
    ((lineRes && lineRes.lines) || []).forEach(function(x){ if (x && x.sku) lineIdBySku[String(x.sku).toUpperCase()] = x.campaign_sku_line_id; });

    // 3) fc_special_events per line, linked by campaign_id + campaign_sku_line_id. The BACKEND owns
    //    event_fc_id (canonical PK) — the frontend does NOT fabricate it. Idempotency is the stable
    //    business key campaign_id + campaign_sku_line_id, so a double-click / retry updates the SAME
    //    row (no duplicate) and preserves its event_fc_id.
    var written = 0;
    for (var k = 0; k < lines.length; k++) {
      var l = lines[k];
      var lineId = lineIdBySku[String(l.sku).toUpperCase()] || '';
      await DB.upsertFcSpecialEvent({
        campaign_id: campaignId, campaign_sku_line_id: lineId,
        company: company, country: country, marketplace: mkey, marketplace_id: marketplaceId,
        scope_type: 'sku', scope_id: l.sku, sku: l.sku, series: l.series, category: l.category,
        event_name: eventFlag, event_period: eventPeriod, event_start_date: eventStartDate,
        event_end_date: eventEndDate, event_month: eventMonth, year: targetYear, fc_qty: l.fcQty,
        source: 'campaign_sync', note: 'FC Summary Special Event Builder'
      });
      written++;
    }
    if (typeof renderFcEventTable === 'function') renderFcEventTable();
    closeFcModal();
    alert('Saved. campaigns: 1 (' + campaignId + ') · campaign_sku_lines: ' + linePayloads.length + ' · fc_special_events: ' + written + ' (linked by campaign_id / campaign_sku_line_id).');
  } catch (e) {
    alert('Special Event Save failed — nothing further was written after the error:\n\n' + (e && e.message ? e.message : e) +
      '\n\nIf the campaign writer actions are not deployed yet, redeploy the Apps Script Web App (source ready in 20_campaign_write_handlers.gs). No fake success is reported.');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
  }
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
// Save the previewed Regular Forecast changes. Writes ONLY the Target Month of each affected SKU's
// fc_regular_forecast row (all other months preserved from the existing row). Blank Manual = Skip.
// Live: idempotent bulk upsert via importFcRegularForecastBatch (business key year|company|country|
// marketplace|sku; preserves forecast_id). Demo: in-memory only, clearly labeled.
function saveRegularUpdate() {
  if (!_regularPreview || !_regularPreview.rows.length) { alert('Click Preview first to review changes before saving.'); return; }
  var P = _regularPreview;
  var monthKey = REG_MONTH_KEYS[P.targetMonth];
  var monthLbl = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][P.targetMonth];
  var manual = P.method === 'manual';
  var box = document.getElementById('regular-preview');
  function up(v){ return String(v==null?'':v).trim().toUpperCase(); }

  // Manual: read the current New inputs (blank = Skip; 0 = explicit zero).
  var manualVals = {};
  if (manual && box) {
    box.querySelectorAll('.reg-prev-new').forEach(function(inp){
      var idx = parseInt(inp.dataset.idx, 10);
      var raw = String(inp.value).trim();
      manualVals[idx] = (raw === '') ? null : Math.max(0, Math.round(Number(raw) || 0));
    });
  }

  // Scope guard — every row must still match the selected site (defends against a stale preview).
  var site = _regularSelectedSite();
  var toWrite = [];
  P.rows.forEach(function(r, i){
    if (up(r.country) !== up(site.country)) return;
    var newQty = manual ? manualVals[i] : r.newQty;
    if (newQty == null) return;   // blank Manual / no computed value → Skip
    var row = { sku: r.sku, year: P.targetYear, company: r.company, country: r.country, marketplace: r.marketplace };
    // Preserve every OTHER month from the existing row; replace ONLY the target month.
    REG_MONTH_KEYS.forEach(function(m){ row[m] = (r.existing[m] === '' || r.existing[m] == null) ? '' : r.existing[m]; });
    row[monthKey] = newQty;
    toWrite.push(row);
  });

  if (!toWrite.length) { alert('Nothing to save — every row is blank (Skip) or out of scope.'); return; }

  // ---- Live (Demo OFF): idempotent bulk upsert. ----
  if (typeof _fcUseDb === 'function' && _fcUseDb()) {
    if (!(window.KM && window.KM.DB && window.KM.DB.importFcRegularForecastBatch)) { alert('Regular forecast write API is not available.'); return; }
    _setRegularSaveEnabled(false);
    window.KM.DB.importFcRegularForecastBatch(toWrite, { forecastStatusDefault: 'draft', sourceDefault: 'fc_summary_builder' })
      .then(function(res){
        if (res && res.success === false) { alert('Save failed: ' + (res.error || 'unknown error')); _setRegularSaveEnabled(true); return; }
        var s = (res && res.summary) || {};
        renderFcRegularTable();
        closeFcModal();
        alert('Regular Forecast saved — ' + monthLbl + ' ' + P.targetYear + ' (only this month updated).\n' +
          'Rows written: ' + toWrite.length +
          (s.created != null ? ('\nCreated: ' + s.created + '  Updated: ' + s.updated + '  Skipped: ' + s.skipped) : ''));
      })
      .catch(function(err){ alert('Save failed: ' + (err && err.message ? err.message : err)); _setRegularSaveEnabled(true); });
    return;
  }

  // ---- Demo (in-memory only) — updates ONLY the target month, preserving others. ----
  toWrite.forEach(function(w){
    var t = fcRegularMock.find(function(i){ return up(i.sku)===up(w.sku) && String(i.year)===String(w.year) &&
      up(i.company)===up(w.company) && up(i.country)===up(w.country) && up(i.marketplace)===up(w.marketplace); });
    if (!t) { t = { sku: w.sku, year: w.year, company: w.company, country: w.country, marketplace: w.marketplace, category: '', series: '', months: [0,0,0,0,0,0,0,0,0,0,0,0] }; fcRegularMock.push(t); }
    t.months[P.targetMonth] = Number(w[monthKey]) || 0;
  });
  renderFcRegularTable();
  closeFcModal();
  alert('Regular Forecast — DEMO (in-memory only, NOT written to DB).\n' +
    monthLbl + ' ' + P.targetYear + ' updated for ' + toWrite.length + ' SKU(s) (only this month).');
}

// (Removed dead saveNewEvent — superseded by the Special Event Builder v2 saveEventUpdate;
//  it referenced obsolete single-field element IDs that no longer exist in the modal.)






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

// Live DB (Demo OFF) = the page reads/writes Operation DB; Demo ON keeps the local mock arrays.
function _fcUseDb() {
    var demoOn = window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled();
    return !demoOn;
}

// Map fc_special_events rows → Event Forecast render shape (Demo OFF). Source = getFcSpecialEvents().
function _getDbFcEventData() {
    var rows = (window.KM && window.KM.DB && window.KM.DB.getFcSpecialEvents) ? window.KM.DB.getFcSpecialEvents() : [];
    return rows.map(function(r) {
        var raw = r.raw || {};
        return {
            eventId: r.eventId || raw.event_id || '',
            sku: r.sku,
            year: raw.year || r.year || '',
            company: r.company,
            marketplace: r.marketplace,
            country: r.country,
            category: r.category,
            series: r.series,
            event: r.event,                 // normalizer: event || event_name
            eventPeriod: r.eventPeriod,      // normalizer: event_period || period
            fcQty: Number(r.fcQty) || 0
        };
    });
}

// Map fc_target_rules rows → Target Rule shape used by the table + effective-rule resolver (Demo OFF).
// Extra UI columns (year / category / series / sku) are read from raw for round-trip fidelity.
var _FC_MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function _getDbTargetRules() {
    var rows = (window.KM && window.KM.DB && window.KM.DB.getFcTargetRules) ? window.KM.DB.getFcTargetRules() : [];
    return rows.map(function(r) {
        var raw = r.raw || {};
        var fallback = (r.targetPercentage != null) ? r.targetPercentage : 100;
        var pct = {};
        _FC_MONTH_KEYS.forEach(function(m) {
            var v = raw[m + '_pct'];
            pct[m] = (v === '' || v == null) ? fallback : (parseFloat(v) || 0);
        });
        var scope = String(raw.scope_type || '').trim();
        return {
            id: r.ruleId || raw.target_rule_id || '',
            scope: scope,
            year: raw.year ? (parseInt(raw.year, 10) || raw.year) : '',
            marketplace: r.marketplace || raw.marketplace || 'All',
            category: raw.category || (scope === 'Category' ? r.scopeId : null) || null,
            series: raw.series || (scope === 'Series' ? r.scopeId : null) || null,
            sku: raw.sku || (scope === 'SKU' ? r.scopeId : null) || null,
            percentages: pct
        };
    });
}

// Active target-rule set: live DB rows on Demo OFF, else the local mock array.
function _getActiveTargetRules() {
    return _fcUseDb() ? _getDbTargetRules() : targetRules;
}

// Rebuild a FC Summary filter checkbox panel from distinct DB values (Demo OFF).
// values: array of strings OR { value, label } objects. Checkbox value stays the canonical key
// (used for filter matching); label is what the user sees (e.g. marketplace_display_name).
function _rebuildFcPanel(filterType, values) {
    var panel = document.querySelector('#fc-summary-section .fc-dropdown-panel[data-filter="' + filterType + '"]');
    if (!panel) return;
    var html = '<label class="fc-checkbox-item"><input type="checkbox" value="" checked onchange="toggleFcAll(this, \'' + filterType + '\')"> <strong>All</strong></label>';
    values.forEach(function(v) {
        var value = (v && typeof v === 'object') ? v.value : v;
        var label = (v && typeof v === 'object') ? v.label : v;
        html += '<label class="fc-checkbox-item"><input type="checkbox" value="' + value + '" checked onchange="updateFcFilter(\'' + filterType + '\')"> ' + label + '</label>';
    });
    panel.innerHTML = html;
}

// NOTE: Cascading/faceted filter narrowing was intentionally removed — every dimension keeps its full
// option set (selecting US must NOT hide other countries' related options). Options are built once per
// load by _populateFcFilterOptionsFromDb; table filtering (filterFcRegular / filterFcEvent) still
// applies the selected values. (_rebuildFcPanelChecked / _fcCascadeFilters removed.)

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
    // Marketplace: checkbox value = canonical key present in the data; label = display name.
    _rebuildFcPanel('marketplace', distinct('marketplace').map(function(mk){ return { value: mk, label: _fcMarketplaceLabel(mk) }; }));
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
        if (typeof renderTargetRulesTable === 'function') renderTargetRulesTable();  // live fc_target_rules
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
    // Drag-to-resize on both FC Summary tables (Regular + Event) — reuses the SKU Details resize engine
    // via the shared dual-layer adapter. Header cells are static, so this runs once per mount; the two
    // tables use distinct storage groups so their widths never overwrite each other.
    setTimeout(function () {
        var dlr = window.KM && window.KM.ui && window.KM.ui.dualLayerResize;
        if (!dlr) return;
        dlr.init({ sectionId: 'fc-summary-section', scrollHeaderSel: '#fc-regular-scroll-header', scrollBodySel: '#fc-regular-scroll-body', page: 'fc-summary', group: 'fc-regular' });
        dlr.init({ sectionId: 'fc-summary-section', scrollHeaderSel: '#fc-event-scroll-header', scrollBodySel: '#fc-event-scroll-body', page: 'fc-summary', group: 'fc-event' });
    }, 120);
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
