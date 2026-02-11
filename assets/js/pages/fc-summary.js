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
      <div class="scroll-cell">${item.category}</div>
      <div class="scroll-cell">${item.series}</div>
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
      if (btn.id === 'fc-edit-btn' || btn.id === 'fc-add-btn') {
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
function initFactoryDropdown() {
  const factoryTriggers = document.querySelectorAll('#factory-stock-section .fc-dropdown-trigger');
  
  factoryTriggers.forEach(trigger => {
    const newTrigger = trigger.cloneNode(true);
    trigger.parentNode.replaceChild(newTrigger, trigger);
    
    newTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const filterType = newTrigger.dataset.filter;
      const panel = document.querySelector(`#factory-stock-section .fc-dropdown-panel[data-filter="${filterType}"]`);
      
      if (!panel) return;
      
      document.querySelectorAll('#factory-stock-section .fc-dropdown-panel').forEach(p => {
        if (p !== panel) p.classList.remove('is-open');
      });
      
      panel.classList.toggle('is-open');
    });
  });
  
  // 重新綁定 checkbox 事件
  document.querySelectorAll('#factory-stock-section .fc-dropdown-panel').forEach(panel => {
    const filterType = panel.dataset.filter;
    
    // 綁定 "All" checkbox
    const allCheckbox = panel.querySelector('input[value=""]');
    if (allCheckbox) {
      allCheckbox.addEventListener('change', function() {
        toggleFactoryAll(this, filterType);
      });
    }
    
    // 綁定個別 checkboxes
    const checkboxes = panel.querySelectorAll('input[type="checkbox"]:not([value=""])');
    checkboxes.forEach(cb => {
      cb.addEventListener('change', function() {
        updateFactoryFilter(filterType);
      });
    });
    
    // 防止點擊 panel 關閉
    panel.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  });
}

// Close dropdown when clicking outside
document.addEventListener('click', () => {
  document.querySelectorAll('.fc-dropdown-panel').forEach(p => {
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

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initFcTabs();
  initFcSearch();
  initFcPagination();
  updatePaginationInfo(0);
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

  // Render fixed column (SKU - readonly)
  fixedBody.innerHTML = paginatedData.map(item => `
    <div class="fixed-row">
      <div class="fixed-cell fc-cell-readonly">${item.sku}</div>
    </div>
  `).join('');

  // Render scrollable columns with editable months only
  scrollBody.innerHTML = paginatedData.map((item, idx) => {
    const total = item.months.reduce((sum, val) => sum + val, 0);
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

  // Render fixed column (SKU - readonly)
  fixedBody.innerHTML = paginatedData.map(item => `
    <div class="fixed-row">
      <div class="fixed-cell fc-cell-readonly">${item.sku}</div>
    </div>
  `).join('');

  // Render scrollable columns with editable FC Qty only
  scrollBody.innerHTML = paginatedData.map((item, idx) => `
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
    </div>
  `).join('');

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

// Close modal on overlay click
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('fc-modal-overlay')?.addEventListener('click', closeFcModal);
});


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


// Export initFactoryDropdown to global
window.initFactoryDropdown = initFactoryDropdown;

// ========================================
// FACTORY STOCK FUNCTIONALITY
// ========================================

// Get Factory Stock filters
function getFactoryFilters() {
  const getSelectedFromDropdown = (filterType) => {
    const panel = document.querySelector(`#factory-stock-section .fc-dropdown-panel[data-filter="${filterType}"]`);
    if (!panel) {
      console.warn(`Panel not found for filter: ${filterType}`);
      return [];
    }
    const checkboxes = panel.querySelectorAll('input[type="checkbox"]:not([value=""]):checked');
    const values = Array.from(checkboxes).map(cb => cb.value);
    console.log(`Filter ${filterType}:`, values);
    return values;
  };

  const filters = {
    factories: getSelectedFromDropdown('factory'),
    companies: getSelectedFromDropdown('company'),
    marketplaces: getSelectedFromDropdown('marketplace'),
    categories: getSelectedFromDropdown('category'),
    series: getSelectedFromDropdown('series'),
    sku: document.getElementById('factory-sku-input')?.value.trim().toLowerCase() || ''
  };
  
  console.log('Factory Filters:', filters);
  console.log('Factory Stock Data:', window.factoryStockData);
  
  return filters;
}

// Filter Factory Stock data
function filterFactoryStock(data, filters) {
  return data.filter(item => {
    // 如果該篩選器有選項且資料不符合，則過濾掉
    if (filters.factories.length > 0 && !filters.factories.includes(item.factory)) return false;
    if (filters.companies.length > 0 && !filters.companies.includes(item.company)) return false;
    if (filters.marketplaces.length > 0 && !filters.marketplaces.includes(item.marketplace)) return false;
    if (filters.categories.length > 0 && !filters.categories.includes(item.category)) return false;
    if (filters.series.length > 0 && !filters.series.includes(item.series)) return false;
    if (filters.sku && !item.sku.toLowerCase().includes(filters.sku)) return false;
    return true;
  });
}

// Render Factory Stock Table
function renderFactoryStockTable() {
  const tbody = document.getElementById('factory-stock-scroll-body');
  const fixedBody = document.getElementById('factory-stock-fixed-body');
  if (!tbody || !fixedBody) return;
  
  // 更新月份標題
  const today = new Date();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const currentMonth = today.getMonth();
  const month0 = monthNames[currentMonth];
  const month1 = monthNames[(currentMonth + 1) % 12];
  const month2 = monthNames[(currentMonth + 2) % 12];
  
  const month0Header = document.getElementById('factory-month-0');
  const month1Header = document.getElementById('factory-month-1');
  const month2Header = document.getElementById('factory-month-2');
  
  if (month0Header) month0Header.textContent = `${month0} Orders`;
  if (month1Header) month1Header.textContent = `${month1} Orders`;
  if (month2Header) month2Header.textContent = `${month2} Orders`;
  
  const filters = getFactoryFilters();
  const filteredData = filterFactoryStock(window.factoryStockData || [], filters);
  
  if (filteredData.length === 0) {
    fixedBody.innerHTML = '';
    tbody.innerHTML = '<div style="padding: 20px; text-align: center; color: #94A3B8;">No data found</div>';
    return;
  }
  
  // Render fixed column (SKU)
  fixedBody.innerHTML = filteredData.map(item => `
    <div class="fixed-row">${item.sku}</div>
  `).join('');
  
  // Render scrollable columns
  tbody.innerHTML = filteredData.map(item => `
    <div class="scroll-row">
      <div class="scroll-cell">${item.company}</div>
      <div class="scroll-cell">${item.marketplace}</div>
      <div class="scroll-cell">${item.category}</div>
      <div class="scroll-cell">${item.series}</div>
      <div class="scroll-cell">${item.factory}</div>
      <div class="scroll-cell">${item.stock.toLocaleString()}</div>
      <div class="scroll-cell">${item.completedOrderMonth0.toLocaleString()}</div>
      <div class="scroll-cell">${item.completedOrderMonth1.toLocaleString()}</div>
      <div class="scroll-cell">${item.completedOrderMonth2.toLocaleString()}</div>
    </div>
  `).join('');
}

// Toggle Factory All checkboxes
function toggleFactoryAll(checkbox, filterType) {
  const panel = document.querySelector(`#factory-stock-section .fc-dropdown-panel[data-filter="${filterType}"]`);
  const checkboxes = panel.querySelectorAll('input[type="checkbox"]:not([value=""])');
  
  checkboxes.forEach(cb => {
    cb.checked = checkbox.checked;
  });
  
  updateFactoryFilterText(filterType);
  if (window.renderFactoryStockTable) {
    window.renderFactoryStockTable();
  }
}

// Update individual Factory filter
function updateFactoryFilter(filterType) {
  const panel = document.querySelector(`#factory-stock-section .fc-dropdown-panel[data-filter="${filterType}"]`);
  if (panel) {
    const allCheckbox = panel.querySelector('input[value=""]');
    const checkboxes = panel.querySelectorAll('input[type="checkbox"]:not([value=""])');
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    
    // Update "All" checkbox
    if (allCheckbox) {
      allCheckbox.checked = checkedCount === checkboxes.length;
    }
    
    updateFactoryFilterText(filterType);
  }
  
  renderFactoryStockTable();
}

// Update Factory filter button text
function updateFactoryFilterText(filterType) {
  const panel = document.querySelector(`#factory-stock-section .fc-dropdown-panel[data-filter="${filterType}"]`);
  const trigger = document.querySelector(`#factory-stock-section .fc-dropdown-trigger[data-filter="${filterType}"]`);
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

// Initialize Factory Stock Search
function initFactorySearch() {
  const skuInput = document.getElementById('factory-sku-input');
  if (!skuInput) return;
  
  skuInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      renderFactoryStockTable();
    }
  });
}

// Export Factory Stock data to global
window.factoryStockData = window.factoryStockData || [];
window.renderFactoryStockTable = renderFactoryStockTable;
window.toggleFactoryAll = toggleFactoryAll;
window.updateFactoryFilter = updateFactoryFilter;
window.initFactorySearch = initFactorySearch;
