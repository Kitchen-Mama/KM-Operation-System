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

// Open Regular FC Update Modal
function openRegularUpdateModal() {
  document.getElementById('regular-target-year').value = fcTargetYear;
  document.getElementById('regular-base-year').value = fcTargetYear - 1;
  document.getElementById('regular-update-method').value = 'actual';
  var skuEl = document.getElementById('regular-sku'); if (skuEl) skuEl.value = '';
  _populateRegularScopeSelects();
  // Reset manual month inputs.
  ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].forEach(function(m){
    var el = document.getElementById('reg-' + m); if (el) el.value = 0;
  });
  toggleRegularMethodFields();
  showFcModal('fc-regular-update-modal');
}

// SKU / Country / Marketplace changed — if in Manual mode, (re)prefill Jan–Dec from existing FC.
function onRegularScopeChange() {
  if (document.getElementById('regular-update-method').value === 'manual') _regularPrefillManual();
}
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
  const monthRow = document.getElementById('regular-month-row');
  const basedRow = document.getElementById('regular-based-row');
  const manualGrid = document.getElementById('regular-manual-months');
  const baseYearGroup = document.getElementById('regular-base-year-group');
  const growthGroup = document.getElementById('regular-growth-group');
  const methodDesc = document.getElementById('method-description');
  function show(el, on) { if (el) el.style.display = on ? '' : 'none'; }

  if (method === 'actual') {
    show(baseYearGroup, true); show(growthGroup, true); show(monthRow, false); show(basedRow, false); show(manualGrid, false);
    methodDesc.innerHTML = '<strong>Apply Growth Rate (Based on Actual Sales):</strong> use Base Year actual sales (from BQ) for the selected Country / Marketplace / SKU, then apply Growth Rate. Growth Rate must be &gt; 0.';
    _setRegularManualHelp('', ''); _setRegularSaveEnabled(true);   // manual-only guards don't apply
  } else if (method === 'prevMonth') {
    show(baseYearGroup, false); show(growthGroup, true); show(monthRow, true); show(basedRow, true); show(manualGrid, false);
    _regularSyncBasedFromTarget();   // default Based Year/Month = the month before Target (editable)
    methodDesc.innerHTML = '<strong>Adjust From Previous Month Forecast:</strong> select the Target Year + Month and the source Based Year + Month explicitly (e.g. Target 2027 Jan → Based 2026 Dec), then apply the rate. The source month is never silently inferred.';
    _setRegularManualHelp('', ''); _setRegularSaveEnabled(true);
  } else if (method === 'manual') {
    show(baseYearGroup, false); show(growthGroup, false); show(monthRow, false); show(basedRow, false); show(manualGrid, true);
    methodDesc.innerHTML = '<strong>Manual Monthly Forecast:</strong> enter the forecast for each month (Jan–Dec) directly. Existing values for the selected SKU / Country / Marketplace / Target Year are prefilled — a blank stored month stays blank (never forced to 0).';
    _regularPrefillManual();   // fills months + sets helper text + toggles Save
  }
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

// ===== Special Event Builder v2 (Single SKU rows / Category-Series group cards) =====
var EVT_MAX_ROWS = 8;
var _evtGroups = [];   // batch-mode group cards: { category, series, regularPrice, skus[], dealPrice, fcQty }

// Open Event Modal (Scope → Event Info → Mode → Single-SKU rows OR Category/Series group cards).
function openEventModal() {
  document.getElementById('event-target-year').value = fcTargetYear;
  var flagEl = document.getElementById('event-name-input'); if (flagEl) flagEl.value = 'Normal';
  var periodEl = document.getElementById('event-period-input'); if (periodEl) periodEl.value = '';
  // reset mode → single
  var single = document.querySelector('input[name="event-mode"][value="single"]'); if (single) single.checked = true;
  // reset batch controls (Category / Series multi-selects reset inside _populateEventBatchSelects)
  var dp = document.getElementById('event-discount-pct'); if (dp) dp.value = '';
  var by = document.getElementById('event-assist-base-year'); if (by) by.value = '';
  var gr = document.getElementById('event-assist-growth'); if (gr) gr.value = '';
  _evtGroups = [];
  var cards = document.getElementById('event-group-cards'); if (cards) cards.innerHTML = '';
  _evtSetAssistHelp('', '');
  _populateEventScopeSelects();
  _populateEventBatchSelects();
  _evtPopulateBaseCampaigns();
  // Single-SKU rows: start with one empty row.
  var rows = document.getElementById('event-sku-rows'); if (rows) rows.innerHTML = '';
  _evtAddSingleRow();
  _evtSwitchMode();
  toggleEventFlagFields();
  showFcModal('fc-add-event-modal');
}

// Scope (country / marketplace) changed → regular prices depend on it; refresh single-row prices
// and rebuild group cards if already built.
function _evtOnScopeChange() {
  _evtRefreshSingleRowPrices();
  if (_evtGroups.length) _evtBuildGroups();
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

// Populate Special Event Country / Marketplace selects (same source as Regular).
function _populateEventScopeSelects() {
  var mkts = (window.KM && window.KM.DB && window.KM.DB.getMarketplaces) ? window.KM.DB.getMarketplaces() : [];
  var fcRows = (window.KM && window.KM.DB && window.KM.DB.getFcRegularForecast) ? window.KM.DB.getFcRegularForecast() : [];
  function distinct(arr) { var o = [], s = {}; arr.forEach(function(v){ v = String(v||'').trim(); if (v && !s[v]) { s[v]=1; o.push(v); } }); return o.sort(); }
  var countries = distinct(mkts.map(function(m){return m.country;}).concat(fcRows.map(function(r){return r.country;})));
  var marketplaces = distinct(mkts.map(function(m){return m.marketplace;}).concat(fcRows.map(function(r){return r.marketplace;})));
  if (!countries.length) countries = ['US', 'UK', 'DE', 'CA', 'JP', 'AU'];
  if (!marketplaces.length) marketplaces = ['Amazon', 'Walmart', 'Shopify', 'Target'];
  var filters = (typeof getFcFilters === 'function') ? getFcFilters() : { countries: [], marketplaces: [] };
  var defCountry = (filters.countries && filters.countries.length === 1) ? filters.countries[0] : '';
  var defMarketplace = (filters.marketplaces && filters.marketplaces.length === 1) ? filters.marketplaces[0] : '';
  var cSel = document.getElementById('event-country');
  var mSel = document.getElementById('event-marketplace');
  if (cSel) cSel.innerHTML = countries.map(function(c){ return '<option value="' + c + '"' + (c === defCountry ? ' selected' : '') + '>' + c + '</option>'; }).join('');
  // Marketplace: label = display name, value = canonical key.
  if (mSel) mSel.innerHTML = _fcMarketplaceOptions().map(function(o){ return '<option value="' + o.value + '"' + (o.value === defMarketplace ? ' selected' : '') + '>' + o.label + '</option>'; }).join('');
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
function _evtToggleMsPanel(which) {
  var panel = document.getElementById('event-' + which + '-panel');
  if (!panel) return;
  var show = (panel.style.display === 'none' || !panel.style.display);
  ['category','series'].forEach(function(w){ var p = document.getElementById('event-' + w + '-panel'); if (p) p.style.display = 'none'; });
  panel.style.display = show ? '' : 'none';
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
  _evtUpdateDiscountRow();
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

// ---- Regular price lookup (marketplace_skus for the selected country + marketplace) ----
function _evtRegularPrice(sku, country, marketplace) {
  function up(v){ return String(v==null?'':v).trim().toUpperCase(); }
  function lo(v){ return String(v==null?'':v).trim().toLowerCase(); }
  var mkey = _fcResolveMarketplaceKey(marketplace);
  var mskus = (window.KM && window.KM.DB && window.KM.DB.getMarketplaceSkus) ? window.KM.DB.getMarketplaceSkus() : [];
  var m = mskus.filter(function(x){ return up(x.sku) === up(sku) &&
    (!country || up(x.country) === up(country)) && (!mkey || lo(x.marketplace) === lo(mkey)); })[0];
  return m ? (parseFloat(m.regularPrice) || 0) : 0;
}

// ================= Single SKU mode =================
function _evtAddSingleRow() {
  var wrap = document.getElementById('event-sku-rows');
  if (!wrap) return;
  if (wrap.children.length >= EVT_MAX_ROWS) { alert('Maximum ' + EVT_MAX_ROWS + ' SKU rows.'); return; }
  var row = document.createElement('div');
  row.className = 'fc-evt-row';
  row.innerHTML =
    '<input type="text" class="evt-sku" placeholder="SKU" onchange="_evtSingleRowSkuChange(this)">' +
    '<input type="number" class="evt-reg" placeholder="Regular" step="0.01" readonly>' +
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
// SKU entered in a single row → auto-fill Regular Price from marketplace_skus.
function _evtSingleRowSkuChange(input) {
  var row = input.closest('.fc-evt-row'); if (!row) return;
  var country = (document.getElementById('event-country') || {}).value || '';
  var marketplace = (document.getElementById('event-marketplace') || {}).value || '';
  var reg = _evtRegularPrice((input.value || '').trim(), country, marketplace);
  var regEl = row.querySelector('.evt-reg'); if (regEl) regEl.value = reg || '';
}
function _evtRefreshSingleRowPrices() {
  var country = (document.getElementById('event-country') || {}).value || '';
  var marketplace = (document.getElementById('event-marketplace') || {}).value || '';
  var wrap = document.getElementById('event-sku-rows'); if (!wrap) return;
  Array.prototype.slice.call(wrap.querySelectorAll('.fc-evt-row')).forEach(function(row){
    var sku = ((row.querySelector('.evt-sku') || {}).value || '').trim();
    if (!sku) return;
    var regEl = row.querySelector('.evt-reg'); if (regEl) regEl.value = _evtRegularPrice(sku, country, marketplace) || '';
  });
}
// Read the single-SKU rows into objects.
function _evtReadSingleRows() {
  var wrap = document.getElementById('event-sku-rows'); if (!wrap) return [];
  return Array.prototype.slice.call(wrap.querySelectorAll('.fc-evt-row')).map(function(row){
    return {
      sku: ((row.querySelector('.evt-sku') || {}).value || '').trim(),
      regularPrice: parseFloat((row.querySelector('.evt-reg') || {}).value) || 0,
      dealPrice: parseFloat((row.querySelector('.evt-deal') || {}).value),
      fcQty: parseInt((row.querySelector('.evt-fc') || {}).value)
    };
  }).filter(function(r){ return r.sku; });
}

// Derive category / series / company for a SKU from sku_details / marketplace_skus (company is
// never entered in the FC Summary UI — it comes from the marketplace relation).
function _fcDeriveSkuMeta(sku, country, marketplace) {
  function up(v){ return String(v==null?'':v).trim().toUpperCase(); }
  function lo(v){ return String(v==null?'':v).trim().toLowerCase(); }
  var meta = { category: '', series: '', company: '' };
  var details = (window.KM && window.KM.DB && window.KM.DB.getSkuDetails) ? window.KM.DB.getSkuDetails() : [];
  var d = details.filter(function(x){ return up(x.sku) === up(sku); })[0];
  if (d) { meta.category = d.category || ''; meta.series = d.series || ''; }
  var mskus = (window.KM && window.KM.DB && window.KM.DB.getMarketplaceSkus) ? window.KM.DB.getMarketplaceSkus() : [];
  var m = mskus.filter(function(x){ return up(x.sku) === up(sku) &&
    (!country || up(x.country) === up(country)) && (!marketplace || lo(x.marketplace) === lo(marketplace)); })[0];
  if (m) meta.company = m.company || '';
  return meta;
}

// ================= Category / Series mode =================
// Candidate {sku, category, series, company, regularPrice} rows for the selected scope + category/series.
function _evtCandidateRows() {
  var country = (document.getElementById('event-country') || {}).value || '';
  var marketplace = (document.getElementById('event-marketplace') || {}).value || '';
  var mkey = _fcResolveMarketplaceKey(marketplace);
  var cats = _evtMsValues('category');   // null = All Category
  var series = _evtMsValues('series');   // null = All Series
  function up(v){ return String(v==null?'':v).trim().toUpperCase(); }
  function lo(v){ return String(v==null?'':v).trim().toLowerCase(); }

  var details = (window.KM && window.KM.DB && window.KM.DB.getSkuDetails) ? window.KM.DB.getSkuDetails() : [];
  var mskus = (window.KM && window.KM.DB && window.KM.DB.getMarketplaceSkus) ? window.KM.DB.getMarketplaceSkus() : [];
  var detBySku = {}; details.forEach(function(d){ detBySku[up(d.sku)] = d; });

  // Base on marketplace_skus for the selected scope (that is where regular price + company live).
  var rows = mskus.filter(function(m){
    return (!country || up(m.country) === up(country)) && (!mkey || lo(m.marketplace) === lo(mkey));
  }).map(function(m){
    var d = detBySku[up(m.sku)] || {};
    return { sku: m.sku, company: m.company || '', category: d.category || '', series: d.series || '',
      regularPrice: parseFloat(m.regularPrice) || 0 };
  }).filter(function(r){
    var cOk = !cats || cats.indexOf(r.category) >= 0;
    var sOk = !series || series.indexOf(r.series) >= 0;
    return r.sku && cOk && sOk;
  });
  return rows;
}

// Build group cards keyed by category + series + regular_price (same series, different price ⇒ split).
function _evtBuildGroups() {
  var rows = _evtCandidateRows();
  var groupsByKey = {};
  rows.forEach(function(r){
    var key = r.category + '||' + r.series + '||' + r.regularPrice;
    if (!groupsByKey[key]) groupsByKey[key] = { category: r.category, series: r.series, regularPrice: r.regularPrice, skus: [], dealPrice: NaN, fcQty: NaN };
    if (groupsByKey[key].skus.indexOf(r.sku) === -1) groupsByKey[key].skus.push(r.sku);
  });
  // Preserve any deal/fc the user already typed for a matching key.
  var prev = {}; _evtGroups.forEach(function(g){ prev[g.category+'||'+g.series+'||'+g.regularPrice] = g; });
  _evtGroups = Object.keys(groupsByKey).map(function(k){
    var g = groupsByKey[k], p = prev[k];
    if (p) { g.dealPrice = p.dealPrice; g.fcQty = p.fcQty; }
    return g;
  }).sort(function(a,b){ return (a.category+a.series).localeCompare(b.category+b.series) || a.regularPrice - b.regularPrice; });
  _evtRenderGroupCards();
}

function _evtRenderGroupCards() {
  var wrap = document.getElementById('event-group-cards');
  if (!wrap) return;
  if (!_evtGroups.length) { wrap.innerHTML = '<p class="fc-hint">No matching SKUs for the selected scope + category/series. Adjust the selection and click Build.</p>'; return; }
  wrap.innerHTML = _evtGroups.map(function(g, i){
    return '<div class="fc-evt-card">' +
      '<div class="fc-evt-card-head">' +
        '<span class="fc-evt-tag">' + (g.category || '—') + '</span>' +
        '<span class="fc-evt-tag">' + (g.series || '—') + '</span>' +
        '<span class="fc-evt-tag fc-evt-tag--price">Regular ' + (g.regularPrice || 0) + '</span>' +
        '<button type="button" class="fc-evt-row-remove" title="Remove group" onclick="_evtRemoveGroup(' + i + ')">×</button>' +
      '</div>' +
      '<div class="fc-evt-card-skus">' + g.skus.map(function(s){
        return '<span class="fc-evt-sku-chip">' + s + ' <a onclick="_evtRemoveGroupSku(' + i + ',\'' + s.replace(/'/g,"\\'") + '\')">×</a></span>'; }).join('') + '</div>' +
      '<div class="fc-evt-card-fields">' +
        '<label>Deal Price <input type="number" step="0.01" value="' + (isNaN(g.dealPrice) ? '' : g.dealPrice) + '" onchange="_evtGroupField(' + i + ',\'dealPrice\',this.value)"></label>' +
        '<label>Forecast Qty <input type="number" min="0" value="' + (isNaN(g.fcQty) ? '' : g.fcQty) + '" onchange="_evtGroupField(' + i + ',\'fcQty\',this.value)"></label>' +
      '</div>' +
    '</div>';
  }).join('');
}
function _evtGroupField(i, field, val) { if (_evtGroups[i]) _evtGroups[i][field] = (val === '' ? NaN : parseFloat(val)); }
function _evtRemoveGroup(i) { _evtGroups.splice(i, 1); _evtRenderGroupCards(); }
function _evtRemoveGroupSku(i, sku) {
  var g = _evtGroups[i]; if (!g) return;
  g.skus = g.skus.filter(function(s){ return s !== sku; });
  if (!g.skus.length) _evtGroups.splice(i, 1);
  _evtRenderGroupCards();
}

// Discount %: deal_price = regular_price × (1 − discount/100), pre-filled per card (user may override).
function _evtApplyDiscount() {
  var pct = parseFloat((document.getElementById('event-discount-pct') || {}).value);
  if (isNaN(pct) || pct < 0 || pct > 100) { alert('Enter a Discount % between 0 and 100.'); return; }
  if (!_evtGroups.length) { alert('Build the group cards first.'); return; }
  _evtGroups.forEach(function(g){ g.dealPrice = Math.round((g.regularPrice * (1 - pct / 100)) * 100) / 100; });
  _evtRenderGroupCards();
}

// ---- Forecast Assist (Category/Series only): pre-fill Forecast Qty; NEVER auto-writes to DB ----
function _evtPopulateBaseCampaigns() {
  var sel = document.getElementById('event-assist-base-campaign');
  if (!sel) return;
  var campaigns = (window.KM && window.KM.DB && window.KM.DB.getCampaigns) ? window.KM.DB.getCampaigns() : [];
  if (campaigns && campaigns.length) {
    sel.disabled = false;
    sel.innerHTML = '<option value="">(none)</option>' + campaigns.map(function(c){
      var id = c.campaignId || c.campaign_id || '';
      var name = c.campaignName || c.campaign_name || id || 'Campaign';
      return '<option value="' + id + '">' + name + '</option>';
    }).join('');
  } else {
    // No campaign records available → disabled/pending state (reported, not faked).
    sel.disabled = true;
    sel.innerHTML = '<option value="">(no campaign records — pending)</option>';
  }
}
function _evtSetAssistHelp(msg, color) {
  var el = document.getElementById('event-assist-help');
  if (el) { el.textContent = msg || ''; el.style.color = color || '#64748B'; el.style.display = msg ? '' : 'none'; }
}
// Simple growth pre-fill (NOT AI): if a Base Campaign is chosen, use its linked fc_special_events qty
// per group as the base; otherwise use the group's current Forecast Qty. base × (1 + growth%).
function _evtApplyForecastAssist() {
  if (_evtMode() !== 'batch') return;
  if (!_evtGroups.length) { alert('Build the group cards first.'); return; }
  var growth = parseFloat((document.getElementById('event-assist-growth') || {}).value);
  if (isNaN(growth)) { alert('Enter a Forecast Growth Rate %.'); return; }
  var baseCampaignId = (document.getElementById('event-assist-base-campaign') || {}).value || '';
  var baseYear = parseInt((document.getElementById('event-assist-base-year') || {}).value);

  // Base-campaign qty by (category||series||price) group, from linked fc_special_events (read-only).
  var baseByKey = {};
  if (baseCampaignId) {
    var events = (window.KM && window.KM.DB && window.KM.DB.getFcSpecialEvents) ? window.KM.DB.getFcSpecialEvents() : [];
    var details = (window.KM && window.KM.DB && window.KM.DB.getSkuDetails) ? window.KM.DB.getSkuDetails() : [];
    function up(v){ return String(v==null?'':v).trim().toUpperCase(); }
    var detBySku = {}; details.forEach(function(d){ detBySku[up(d.sku)] = d; });
    events.filter(function(e){ return String(e.campaignId || e.campaign_id || '') === baseCampaignId &&
        (!baseYear || String(e.year) === String(baseYear)); })
      .forEach(function(e){
        var d = detBySku[up(e.sku)] || {};
        var reg = _evtRegularPrice(e.sku, e.country, e.marketplace);
        var key = (e.category || d.category || '') + '||' + (e.series || d.series || '') + '||' + reg;
        baseByKey[key] = (baseByKey[key] || 0) + (parseFloat(e.fcQty || e.fc_qty) || 0);
      });
  }
  var filled = 0;
  _evtGroups.forEach(function(g){
    var key = g.category + '||' + g.series + '||' + g.regularPrice;
    var base = baseCampaignId ? (baseByKey[key] || 0) : (isNaN(g.fcQty) ? 0 : g.fcQty);
    var suggested = Math.round(base * (1 + growth / 100));
    if (suggested > 0) { g.fcQty = suggested; filled++; }
  });
  _evtRenderGroupCards();
  if (baseCampaignId && !Object.keys(baseByKey).length) {
    _evtSetAssistHelp('Base Campaign has no linked fc_special_events to base on — nothing pre-filled. Enter Forecast Qty manually.', '#b45309');
  } else {
    _evtSetAssistHelp('Pre-filled Forecast Qty for ' + filled + ' group(s) (base × (1 + ' + growth + '%)). Review before Save — nothing is written until you click Save.', '#0f766e');
  }
}

// ================= Save (campaigns → campaign_sku_lines → fc_special_events) =================
// Writers for campaigns / campaign_sku_lines do NOT exist yet → report PENDING, write nothing (no
// fake success). Demo ON → illustrative in-memory rows only.
function saveEventUpdate() {
  var country = (document.getElementById('event-country') || {}).value || '';
  var marketplace = (document.getElementById('event-marketplace') || {}).value || '';
  var mkey = _fcResolveMarketplaceKey(marketplace);
  var targetYear = parseInt(document.getElementById('event-target-year').value);
  var eventFlag = (document.getElementById('event-name-input') || {}).value || 'Normal';
  var eventPeriod = ((document.getElementById('event-period-input') || {}).value || '').trim();
  var mode = _evtMode();

  if (!country || !marketplace) { alert('Country and Marketplace are required.'); return; }

  if (eventFlag === 'Normal') {
    alert('Event Flag is "Normal" — no campaign / special-event forecast is created.\n\n' +
      'Baseline demand is covered by the regular monthly forecast (fc_regular_forecast).');
    closeFcModal();
    return;
  }
  if (!targetYear) { alert('Target Year is required.'); return; }
  if (!eventPeriod) { alert('Event Period is required for a non-Normal event.'); return; }

  // ---- Collect SKU lines from the active mode ----
  var lines = [];   // { sku, company, category, series, regularPrice, dealPrice, fcQty }
  if (mode === 'single') {
    var rows = _evtReadSingleRows();
    if (!rows.length) { alert('Add at least one SKU row.'); return; }
    if (rows.length > EVT_MAX_ROWS) { alert('Maximum ' + EVT_MAX_ROWS + ' SKU rows.'); return; }
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r.sku) { alert('Row ' + (i + 1) + ': SKU is required.'); return; }
      if (isNaN(r.dealPrice)) { alert('Row ' + (i + 1) + ' (' + r.sku + '): Deal Price is required.'); return; }
      if (isNaN(r.fcQty) || r.fcQty <= 0) { alert('Row ' + (i + 1) + ' (' + r.sku + '): Forecast Qty is required (> 0) for a non-Normal event.'); return; }
      var meta = _fcDeriveSkuMeta(r.sku, country, mkey);
      lines.push({ sku: r.sku, company: meta.company, category: meta.category, series: meta.series,
        regularPrice: r.regularPrice, dealPrice: r.dealPrice, fcQty: r.fcQty });
    }
  } else {
    if (!_evtGroups.length) { alert('Build the group cards first.'); return; }
    for (var gi = 0; gi < _evtGroups.length; gi++) {
      var g = _evtGroups[gi];
      if (isNaN(g.dealPrice)) { alert('Group ' + (g.category || '—') + ' / ' + (g.series || '—') + ': Deal Price is required.'); return; }
      if (isNaN(g.fcQty) || g.fcQty <= 0) { alert('Group ' + (g.category || '—') + ' / ' + (g.series || '—') + ': Forecast Qty is required (> 0).'); return; }
      g.skus.forEach(function(sku){
        var meta = _fcDeriveSkuMeta(sku, country, mkey);
        lines.push({ sku: sku, company: meta.company || '', category: g.category, series: g.series,
          regularPrice: g.regularPrice, dealPrice: g.dealPrice, fcQty: g.fcQty });
      });
    }
    if (!lines.length) { alert('No SKU lines to save.'); return; }
  }

  var discountPct = parseFloat((document.getElementById('event-discount-pct') || {}).value);
  var company = (lines[0] && lines[0].company) || '';
  var campaignPayload = { campaign_name: eventFlag + ' ' + targetYear, country: country, marketplace: mkey,
    promotion_type: eventFlag, event_flag: eventFlag, year: targetYear, event_period: eventPeriod,
    status: 'active', source: 'fc_summary_builder' };
  var linePayloads = lines.map(function(l){
    var disc = (!isNaN(discountPct)) ? discountPct
      : (l.regularPrice > 0 ? Math.round((1 - l.dealPrice / l.regularPrice) * 1000) / 10 : 0);
    return { sku: l.sku, regular_price: l.regularPrice, deal_price: l.dealPrice, discount_percent: disc,
      line_status: 'active', source: 'fc_summary_builder' };
  });
  var fcPayloads = lines.map(function(l){
    return { sku: l.sku, company: l.company, marketplace: mkey, country: country, category: l.category,
      series: l.series, event_name: eventFlag, event_period: eventPeriod, year: targetYear, fc_qty: l.fcQty,
      source: 'campaign_sync', status: 'active', note: 'FC Summary Special Event Builder' };
  });

  // ---- Backend writers ----
  // campaigns / campaign_sku_lines writers are NOT implemented. To avoid orphan fc_special_events
  // (rows with a blank campaign_id) and fake completeness, we write NOTHING on live and report pending.
  var haveCampaignWriter = !!(window.KM && window.KM.DB && window.KM.DB.upsertCampaign);
  var haveLineWriter = !!(window.KM && window.KM.DB && window.KM.DB.upsertCampaignSkuLine);

  if (_fcUseDb()) {
    if (!haveCampaignWriter || !haveLineWriter) {
      alert('Save is PENDING — backend not complete (no data written).\n\n' +
        'Would create/update:\n' +
        '• campaigns: 1 (' + campaignPayload.campaign_name + ', ' + country + ' / ' + mkey + ')\n' +
        '• campaign_sku_lines: ' + linePayloads.length + '\n' +
        '• fc_special_events: ' + fcPayloads.length + ' (source=campaign_sync, linked by campaign_id / campaign_sku_line_id)\n\n' +
        'Missing writers: ' + (!haveCampaignWriter ? 'upsertCampaign ' : '') + (!haveLineWriter ? 'upsertCampaignSkuLine' : '') +
        '.\nfc_special_events is intentionally NOT written alone (would create rows with no parent campaign). ' +
        'See FC_SUMMARY_SPEC §12.');
      return;
    }
    // (Future) real 3-table write path goes here once writers exist.
    alert('Campaign/FC writers present but the 3-table transaction path is not wired in this build.');
    return;
  }

  // Demo ON → illustrative in-memory rows (clearly labelled).
  fcPayloads.forEach(function(p){
    fcEventMock.push({ sku: p.sku, year: p.year, company: p.company, marketplace: p.marketplace,
      country: p.country, category: p.category, series: p.series, event: p.event_name,
      eventPeriod: p.event_period, fcQty: p.fc_qty });
  });
  renderFcEventTable();
  closeFcModal();
  alert('DEMO (in-memory only): ' + fcPayloads.length + ' fc_special_events row(s) illustrated. ' +
    'campaigns (1) + campaign_sku_lines (' + linePayloads.length + ') would be created in live mode.');
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
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // Full site identity from the selected marketplace(site) option (KM Amazon ≠ ResUS Amazon).
  const _site = _regularSelectedSite();
  const company = _site.company;
  const country = _site.country;
  const marketplace = _site.marketplace;
  const sku = ((document.getElementById('regular-sku') || {}).value || '').trim();
  const targetYear = parseInt(document.getElementById('regular-target-year').value);
  const baseYear = parseInt(document.getElementById('regular-base-year').value);
  const method = document.getElementById('regular-update-method').value;
  const growthRate = parseFloat(document.getElementById('regular-growth-rate').value) || 0;
  const targetMonth = parseInt((document.getElementById('regular-target-month') || {}).value || '0');
  const basedYear = parseInt((document.getElementById('regular-based-year') || {}).value);
  const basedMonth = parseInt((document.getElementById('regular-based-month') || {}).value || '0');
  const monthNamesFull = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const methodName = method === 'actual' ? 'Apply Growth Rate (Based on Actual Sales)'
    : method === 'prevMonth' ? 'Adjust From Previous Month Forecast'
    : 'Manual Monthly Forecast';

  // ---- Validation (Part 3) ----
  if (!country || !marketplace) { alert('Country and Marketplace are required.'); return; }
  if (!sku) { alert('SKU is required.'); return; }
  if (method === 'actual' && !(growthRate > 0)) {
    alert('Growth Rate must be greater than 0 for "Apply Growth Rate (Based on Actual Sales)".');
    return;
  }
  if (method === 'prevMonth') {
    if (isNaN(targetYear)) { alert('Target Year is required.'); return; }
    if (isNaN(targetMonth)) { alert('Target Month is required.'); return; }
    if (isNaN(basedYear)) { alert('Based Year is required.'); return; }
    if (isNaN(basedMonth)) { alert('Based Month is required.'); return; }
  }
  let manualMonths = null;
  if (method === 'manual') {
    manualMonths = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
      .map(m => parseInt((document.getElementById('reg-' + m) || {}).value) || 0);
  }

  // ---- Live DB (Demo OFF): PENDING. No single-row fc_regular_forecast writer / no BQ actual-sales
  // source exists yet — do NOT fake success and do NOT write (guardrail). ----
  if (typeof _fcUseDb === 'function' && _fcUseDb()) {
    let detail = 'Method: ' + methodName + '\nSKU: ' + sku + '\nCompany / Country / Marketplace: ' +
      (company || '—') + ' / ' + country + ' / ' + marketplace + '\nTarget Year: ' + targetYear;
    if (method === 'actual') detail += '\nBase Year: ' + baseYear + '\nGrowth Rate: ' + growthRate + '%';
    if (method === 'prevMonth') detail += '\nTarget: ' + monthNamesFull[targetMonth] + ' ' + targetYear +
      '\nBased (source): ' + monthNamesFull[basedMonth] + ' ' + basedYear + '\nRate: ' + growthRate + '%';
    alert('Regular Forecast update is NOT yet written to the Operation DB.\n\n' + detail +
      '\n\nUpsert target: fc_regular_forecast (key company + country + marketplace + sku + year). ' +
      'The single-row writer (and the BQ actual-sales source for "Apply Growth Rate") ' +
      'are PENDING — see FC_SUMMARY_SPEC (Phase 2 / Pending Backend). No data was written.');
    closeFcModal();
    return;
  }

  // ---- Demo mode (in-memory only) — illustrative; clearly labeled, never claims a DB write. ----
  // Match by the FULL site identity (company + country + marketplace + sku + year) — only the
  // selected site's row is created/updated (KM Amazon never touches ResUS Amazon).
  function up(v){ return String(v==null?'':v).trim().toUpperCase(); }
  function sameSite(i, yr) { return up(i.sku) === up(sku) && i.year === yr && up(i.company) === up(company) && up(i.country) === up(country) && up(i.marketplace) === up(marketplace); }
  const findTarget = () => fcRegularMock.find(i => sameSite(i, targetYear));
  const baseItem = fcRegularMock.find(i => sameSite(i, baseYear));
  let touched = 0;

  if (method === 'manual') {
    // Upsert the entered Jan–Dec into the specific site's target-year row (create if missing).
    let t = findTarget();
    if (!t) {
      t = { sku: sku, year: targetYear, company: company, marketplace: marketplace, country: country, category: (baseItem && baseItem.category) || '', series: (baseItem && baseItem.series) || '', months: [0,0,0,0,0,0,0,0,0,0,0,0] };
      fcRegularMock.push(t);
    }
    t.months = manualMonths.slice();
    touched = 1;
  } else if (method === 'actual') {
    const b = baseItem;
    if (!b) { alert('Demo: no Base Year ' + baseYear + ' row for ' + sku + ' (' + (company || '—') + ' / ' + country + ' / ' + marketplace + '). (In-memory demo only.)'); return; }
    let t = findTarget();
    if (!t) { t = { sku: sku, year: targetYear, company: company, marketplace: marketplace, country: country, category: b.category, series: b.series, months: [0,0,0,0,0,0,0,0,0,0,0,0] }; fcRegularMock.push(t); }
    t.months = b.months.map(m => Math.round(m * (1 + growthRate / 100)));
    touched = 1;
  } else { // prevMonth: source = the explicit Based Year + Based Month value × (1 + rate) → Target Month
    const src = fcRegularMock.find(i => sameSite(i, basedYear));
    const srcVal = src ? (src.months[basedMonth] || 0) : 0;
    let t = findTarget();
    if (!t) { t = { sku: sku, year: targetYear, company: company, marketplace: marketplace, country: country, category: (src && src.category) || '', series: (src && src.series) || '', months: [0,0,0,0,0,0,0,0,0,0,0,0] }; fcRegularMock.push(t); }
    t.months[targetMonth] = Math.round(srcVal * (1 + growthRate / 100));
    touched = 1;
  }

  alert('Regular FC Update — DEMO (in-memory only, NOT written to DB).\n\n' +
    'Method: ' + methodName + '\nCompany / Country / Marketplace: ' + (company || '—') + ' / ' + country + ' / ' + marketplace +
    '\nTarget Year: ' + targetYear + (method === 'prevMonth' ? ' / ' + monthNames[targetMonth] : '') +
    '\nRows touched: ' + touched);
  renderFcRegularTable();
  closeFcModal();
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
