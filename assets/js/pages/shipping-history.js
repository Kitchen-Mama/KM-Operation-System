// Shipping History Page

const shippingHistoryMockData = [
    {
        id: "SP-20250101-001",
        date: "2025-01-01",
        country: "US",
        marketplace: "amazon",
        method: "AGL Ship",
        totalPcs: 76870,
        totalCartons: 1922,
        totalCost: 192175,
        unitCost: 2.5,
        skus: [
            { sku: "CO1100-R", qty: 40000 },
            { sku: "CO1100-S", qty: 36870 }
        ]
    },
    {
        id: "SP-20250102-002",
        date: "2025-01-02",
        country: "UK",
        marketplace: "amazon",
        method: "Air Freight",
        totalPcs: 12000,
        totalCartons: 300,
        totalCost: 42000,
        unitCost: 3.5,
        skus: [
            { sku: "CO1150-R", qty: 12000 }
        ]
    },
    {
        id: "SP-20250103-003",
        date: "2025-01-03",
        country: "US",
        marketplace: "amazon",
        method: "Private Ship",
        totalPcs: 25000,
        totalCartons: 625,
        totalCost: 80000,
        unitCost: 3.2,
        skus: [
            { sku: "CO1150-AG", qty: 15000 },
            { sku: "SP3120-R", qty: 10000 }
        ]
    },
    {
        id: "SP-20250115-004",
        date: "2025-01-15",
        country: "DE",
        marketplace: "amazon",
        method: "Sea Freight",
        totalPcs: 50000,
        totalCartons: 1250,
        totalCost: 125000,
        unitCost: 2.5,
        skus: [
            { sku: "CO1100-R", qty: 30000 },
            { sku: "SP3410-R", qty: 20000 }
        ]
    },
    {
        id: "SP-20250120-005",
        date: "2025-01-20",
        country: "CA",
        marketplace: "amazon",
        method: "Express",
        totalPcs: 5000,
        totalCartons: 125,
        totalCost: 25000,
        unitCost: 5.0,
        skus: [
            { sku: "CO1100-S", qty: 5000 }
        ]
    },
    {
        id: "SP-20241215-006",
        date: "2024-12-15",
        country: "US",
        marketplace: "amazon",
        method: "AGL Ship",
        totalPcs: 80000,
        totalCartons: 2000,
        totalCost: 200000,
        unitCost: 2.5,
        skus: [
            { sku: "CO1100-R", qty: 50000 },
            { sku: "CO1150-AG", qty: 30000 }
        ]
    }
];

const historyState = {
    data: [],
    hasSearched: false,
    dateRange: {
        start: new Date(new Date().setDate(new Date().getDate() - 30)),
        end: new Date(),
        preset: 'last-30-days'
    },
    tempDateRange: {
        start: null,
        end: null,
        preset: null
    },
    calendarMonths: {
        start: new Date(),
        end: new Date()
    }
};

function loadHistoryData() {
    const storedHistory = sessionStorage.getItem('shippingHistory');
    if (storedHistory) {
        historyState.data = JSON.parse(storedHistory);
    } else {
        historyState.data = shippingHistoryMockData;
    }
}

// Shipment Overview page init (full filter bar). Separate from the Shipment Draft page.
function initShipmentOverviewPage() {
    const searchBtn = document.querySelector("#shippinghistory-section .btn-primary");
    const dateTrigger = document.getElementById('historyDateTrigger');

    loadHistoryData();
    updateHistoryDateTriggerText();

    // Init custom dropdowns (Country / Shipping Method) — scoped to the Overview section.
    _initShDropdowns();

    // Bind the full filter bar's Search + Date trigger (no cloneNode).
    if (searchBtn) searchBtn.onclick = onHistorySearch;
    if (dateTrigger) dateTrigger.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        openHistoryDateModal();
    };

    // Render official shipments (shipped onward) from the DB, or the mock/demo path when no DB.
    renderShipmentOverview();
}
// Back-compat alias (old name).
var initShippingHistoryPage = initShipmentOverviewPage;

function openHistoryDateModal() {
    console.log('openHistoryDateModal called');
    
    const backdrop = document.getElementById('frDateBackdrop');
    const modal = document.getElementById('frDateModal');
    
    if (!modal || !backdrop) {
        console.error('Modal elements not found:', { modal, backdrop });
        return;
    }
    
    historyState.tempDateRange = {
        start: historyState.dateRange.start,
        end: historyState.dateRange.end,
        preset: historyState.dateRange.preset
    };
    
    historyState.calendarMonths.start = new Date(historyState.dateRange.start);
    historyState.calendarMonths.end = new Date(historyState.dateRange.end);
    
    backdrop.classList.add('is-open');
    modal.classList.add('is-open');
    
    console.log('Modal opened, classes added');
    
    // 綁定事件
    setupHistoryModalEvents();
    
    updateHistoryDateInputs();
    updateHistoryPresetHighlight();
    renderHistoryCalendars();
}

function setupHistoryModalEvents() {
    // Backdrop click
    const backdrop = document.getElementById('frDateBackdrop');
    if (backdrop) {
        backdrop.onclick = closeHistoryDateModal;
    }
    
    // Cancel button
    const cancelBtn = document.getElementById('frDateCancel');
    if (cancelBtn) {
        cancelBtn.onclick = closeHistoryDateModal;
    }
    
    // Apply button
    const applyBtn = document.getElementById('frDateApply');
    if (applyBtn) {
        applyBtn.onclick = applyHistoryDateRange;
    }
    
    // Preset items
    const presetItems = document.querySelectorAll('.fr-preset-item');
    presetItems.forEach(item => {
        item.onclick = () => handleHistoryPresetClick(item.dataset.preset);
    });
    
    // Calendar navigation
    const navBtns = document.querySelectorAll('.fr-calendar-nav');
    navBtns.forEach(btn => {
        btn.onclick = () => handleHistoryCalendarNav(btn.dataset.nav);
    });
}

function closeHistoryDateModal() {
    const backdrop = document.getElementById('frDateBackdrop');
    const modal = document.getElementById('frDateModal');
    if (!modal || !backdrop) return;
    
    console.log('Closing Shipping History date modal');
    
    backdrop.classList.remove('is-open');
    modal.classList.remove('is-open');
    delete modal.dataset.currentUser;
}

function applyHistoryDateRange() {
    historyState.dateRange = {
        start: historyState.tempDateRange.start,
        end: historyState.tempDateRange.end,
        preset: historyState.tempDateRange.preset
    };
    updateHistoryDateTriggerText();
    closeHistoryDateModal();
}

function updateHistoryDateTriggerText() {
    const trigger = document.getElementById('historyDateTrigger');
    if (!trigger) return;
    
    const textSpan = trigger.querySelector('.history-date-trigger-text');
    if (!textSpan) return;
    
    const preset = historyState.dateRange.preset;
    
    if (preset) {
        const presetLabels = {
            'today': 'Today',
            'yesterday': 'Yesterday',
            'last-7-days': 'Last 7 days',
            'last-30-days': 'Last 30 days',
            'last-60-days': 'Last 60 days',
            'last-90-days': 'Last 90 days',
            'last-month': 'Last month',
            'last-2-months': 'Last 2 months',
            'last-3-months': 'Last 3 months',
            'last-year': 'Last year'
        };
        textSpan.textContent = presetLabels[preset] || 'Custom range';
    } else {
        if (historyState.dateRange.start && historyState.dateRange.end) {
            const start = formatHistoryDate(historyState.dateRange.start);
            const end = formatHistoryDate(historyState.dateRange.end);
            textSpan.textContent = `${start} ~ ${end}`;
        } else {
            textSpan.textContent = 'Select date range';
        }
    }
}

function handleHistoryPresetClick(preset) {
    const today = new Date();
    let start = new Date();
    let end = new Date(today);
    
    switch (preset) {
        case 'today':
            start = new Date(today);
            break;
        case 'yesterday':
            start.setDate(today.getDate() - 1);
            end.setDate(today.getDate() - 1);
            break;
        case 'last-7-days':
            start.setDate(today.getDate() - 7);
            break;
        case 'last-30-days':
            start.setDate(today.getDate() - 30);
            break;
        case 'last-60-days':
            start.setDate(today.getDate() - 60);
            break;
        case 'last-90-days':
            start.setDate(today.getDate() - 90);
            break;
        case 'last-month':
            start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            end = new Date(today.getFullYear(), today.getMonth(), 0);
            break;
        case 'last-2-months':
            start = new Date(today.getFullYear(), today.getMonth() - 2, 1);
            end = new Date(today.getFullYear(), today.getMonth(), 0);
            break;
        case 'last-3-months':
            start = new Date(today.getFullYear(), today.getMonth() - 3, 1);
            end = new Date(today.getFullYear(), today.getMonth(), 0);
            break;
        case 'last-year':
            start = new Date(today.getFullYear() - 1, 0, 1);
            end = new Date(today.getFullYear() - 1, 11, 31);
            break;
    }
    
    historyState.tempDateRange.start = start;
    historyState.tempDateRange.end = end;
    historyState.tempDateRange.preset = preset;
    
    historyState.calendarMonths.start = new Date(start);
    historyState.calendarMonths.end = new Date(end);
    
    updateHistoryDateInputs();
    updateHistoryPresetHighlight();
    renderHistoryCalendars();
}

function updateHistoryPresetHighlight() {
    const items = document.querySelectorAll('.fr-preset-item');
    items.forEach(item => {
        if (item.dataset.preset === historyState.tempDateRange.preset) {
            item.classList.add('is-active');
        } else {
            item.classList.remove('is-active');
        }
    });
}

function updateHistoryDateInputs() {
    const startInput = document.getElementById('frStartDisplay');
    const endInput = document.getElementById('frEndDisplay');
    
    if (startInput) startInput.value = formatHistoryDate(historyState.tempDateRange.start);
    if (endInput) endInput.value = formatHistoryDate(historyState.tempDateRange.end);
}

function handleHistoryCalendarNav(nav) {
    switch (nav) {
        case 'prev-start':
            historyState.calendarMonths.start.setMonth(historyState.calendarMonths.start.getMonth() - 1);
            break;
        case 'next-start':
            historyState.calendarMonths.start.setMonth(historyState.calendarMonths.start.getMonth() + 1);
            break;
        case 'prev-end':
            historyState.calendarMonths.end.setMonth(historyState.calendarMonths.end.getMonth() - 1);
            break;
        case 'next-end':
            historyState.calendarMonths.end.setMonth(historyState.calendarMonths.end.getMonth() + 1);
            break;
    }
    renderHistoryCalendars();
}

function renderHistoryCalendars() {
    renderHistoryCalendar('start');
    renderHistoryCalendar('end');
}

function renderHistoryCalendar(type) {
    const month = historyState.calendarMonths[type];
    const titleEl = document.getElementById(`frCalendar${type.charAt(0).toUpperCase() + type.slice(1)}Title`);
    const bodyEl = document.getElementById(`frCalendar${type.charAt(0).toUpperCase() + type.slice(1)}Body`);
    
    if (!titleEl || !bodyEl) return;
    
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    titleEl.textContent = `${monthNames[month.getMonth()]} ${month.getFullYear()}`;
    
    const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
    const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const startDayOfWeek = firstDay.getDay();
    
    let html = '';
    
    const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    weekdays.forEach(day => {
        html += `<div class="fr-calendar-weekday">${day}</div>`;
    });
    
    for (let i = 0; i < startDayOfWeek; i++) {
        html += '<div class="fr-calendar-day is-disabled"></div>';
    }
    
    for (let day = 1; day <= lastDay.getDate(); day++) {
        const date = new Date(month.getFullYear(), month.getMonth(), day);
        const classes = ['fr-calendar-day'];
        
        const start = historyState.tempDateRange.start;
        const end = historyState.tempDateRange.end;
        
        if (start && isSameDay(date, start)) classes.push('is-start');
        if (end && isSameDay(date, end)) classes.push('is-end');
        if (start && end && date > start && date < end) classes.push('is-in-range');
        if (isSameDay(date, new Date())) classes.push('is-today');
        
        html += `<div class="${classes.join(' ')}" data-date="${date.toISOString()}" data-type="${type}">${day}</div>`;
    }
    
    bodyEl.innerHTML = html;
    
    bodyEl.querySelectorAll('.fr-calendar-day:not(.is-disabled)').forEach(dayEl => {
        dayEl.addEventListener('click', () => {
            handleHistoryDayClick(new Date(dayEl.dataset.date), dayEl.dataset.type);
        });
    });
}

function handleHistoryDayClick(date, calendarType) {
    const start = historyState.tempDateRange.start;
    const end = historyState.tempDateRange.end;
    
    if (calendarType === 'start') {
        if (end && date > end) {
            historyState.tempDateRange.start = end;
            historyState.tempDateRange.end = date;
        } else {
            historyState.tempDateRange.start = date;
        }
    } else {
        if (start && date < start) {
            historyState.tempDateRange.end = start;
            historyState.tempDateRange.start = date;
        } else {
            historyState.tempDateRange.end = date;
        }
    }
    
    historyState.tempDateRange.preset = null;
    
    updateHistoryDateInputs();
    updateHistoryPresetHighlight();
    renderHistoryCalendars();
}

function isSameDay(date1, date2) {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
}

function formatHistoryDate(date) {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function onHistorySearch() {
    // Overview Search. DB → render official shipments with the full filters; else mock/demo.
    if (_shUseDb()) { renderShipmentOverview(); return; }
    const params = collectFilterParams();
    const results = filterHistoryData(historyState.data, params);

    historyState.hasSearched = true;
    renderHistoryResults(results);
}

function collectFilterParams() {
    const skuInput = document.querySelector("#shippinghistory-section .filter-group--sku input");
    
    // Read from checkbox dropdowns
    const country = _getShDropdownValue('country');
    const method = _getShDropdownValue('method');
    const sku = skuInput?.value.trim() || "";
    
    return { 
        start: formatHistoryDate(historyState.dateRange.start), 
        end: formatHistoryDate(historyState.dateRange.end), 
        country, 
        sku, 
        method 
    };
}

// Get single selected value from shipping history dropdown (single-select behavior)
function _getShDropdownValue(filterType) {
    const panel = document.querySelector(`#shippinghistory-section .sh-dropdown-panel[data-filter="${filterType}"]`);
    if (!panel) return '';
    const checked = panel.querySelectorAll('input[type="checkbox"]:not([value=""]):checked');
    const allCb = panel.querySelector('input[value=""]');
    if (allCb && allCb.checked) return '';
    if (checked.length === 0) return '';
    // Single-select: return first checked value
    return checked[0].value;
}

function filterHistoryData(data, params) {
    return data.filter(item => {
        if (params.start && item.date < params.start) return false;
        if (params.end && item.date > params.end) return false;
        if (params.country && item.country !== params.country) return false;
        if (params.sku) {
            const hasSku = item.skus.some(s => 
                s.sku.toLowerCase().includes(params.sku.toLowerCase())
            );
            if (!hasSku) return false;
        }
        if (params.method && item.method !== params.method) return false;
        return true;
    });
}

function renderHistoryResults(list) {
    // Overview (mock/demo) results — scoped to the Overview section so it never touches the
    // Shipment Draft page's list (separate pages, separate DOM state).
    const emptyStateEl = document.querySelector("#shippinghistory-section .history-empty-state");
    const listEl = document.querySelector("#shippinghistory-section .history-list");

    if (!emptyStateEl || !listEl) return;
    
    if (!historyState.hasSearched) {
        emptyStateEl.innerHTML = 'Use the filters above and click <strong>Search</strong> to view shipping history.';
        emptyStateEl.hidden = false;
        listEl.hidden = true;
        listEl.innerHTML = "";
        return;
    }
    
    if (!list || list.length === 0) {
        emptyStateEl.textContent = "No shipping records found for the selected filters.";
        emptyStateEl.hidden = false;
        listEl.hidden = true;
        listEl.innerHTML = "";
        return;
    }
    
    emptyStateEl.hidden = true;
    listEl.hidden = false;
    
    listEl.innerHTML = list.map(shipment => renderHistoryCard(shipment)).join("");
}

function renderHistoryCard(shipment) {
    const cardId = `history-card-${shipment.id}`;
    return `
        <div class="history-card" id="${cardId}" style="border: 1px solid #E2E8F0; border-radius: 8px; background: white;">
            <div class="history-card-header" style="padding: 16px; display: flex; justify-content: space-between; align-items: center; cursor: pointer;" onclick="toggleHistoryCard('${shipment.id}')">
                <div>
                    <strong style="font-size: 14px;">${shipment.id}</strong>
                    <span style="margin-left: 12px; color: #64748B; font-size: 13px;">${shipment.date}</span>
                </div>
                <div style="display: flex; gap: 16px; align-items: center; font-size: 13px;">
                    <span><strong>Country:</strong> ${shipment.country}</span>
                    <span><strong>Method:</strong> ${shipment.method}</span>
                    <span><strong>Total Pcs:</strong> ${shipment.totalPcs.toLocaleString()}</span>
                    <span><strong>Cost:</strong> $${shipment.totalCost.toLocaleString()}</span>
                    <button class="history-expand-btn" style="padding: 6px 12px; border: 1px solid #E2E8F0; border-radius: 4px; background: white; cursor: pointer; font-size: 13px; color: #3B82F6;" onclick="event.stopPropagation(); toggleHistoryCard('${shipment.id}')">
                        Expand
                    </button>
                </div>
            </div>
            <div class="history-card-details" style="display: none; padding: 16px; border-top: 1px solid #E2E8F0; background: #F8FAFC;">
                <h4 style="font-size: 14px; margin-bottom: 12px; color: #1E293B;">SKU Details</h4>
                <table class="sh-sku-table">
                    <thead>
                        <tr>
                            <th class="sh-sku-table__th sh-sku-table__th--sku">SKU</th>
                            <th class="sh-sku-table__th sh-sku-table__th--num">Quantity</th>
                            <th class="sh-sku-table__th sh-sku-table__th--num">Cartons</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${shipment.skus.map(sku => {
                            const cartons = Math.ceil(sku.qty / 40);
                            return `
                            <tr class="sh-sku-table__row">
                                <td class="sh-sku-table__td sh-sku-table__td--sku">${sku.sku}</td>
                                <td class="sh-sku-table__td sh-sku-table__td--num">${sku.qty.toLocaleString()}</td>
                                <td class="sh-sku-table__td sh-sku-table__td--num">${cartons}</td>
                            </tr>
                        `}).join('')}
                    </tbody>
                </table>
                <div style="margin-top: 16px; display: flex; justify-content: space-between; padding: 12px; background: white; border-radius: 4px; border: 1px solid #E2E8F0;">
                    <div>
                        <span style="color: #64748B; font-size: 12px;">Total Cartons:</span>
                        <strong style="margin-left: 8px; font-size: 14px;">${shipment.totalCartons}</strong>
                    </div>
                    <div>
                        <span style="color: #64748B; font-size: 12px;">Unit Cost:</span>
                        <strong style="margin-left: 8px; font-size: 14px;">$${shipment.unitCost.toFixed(2)}</strong>
                    </div>
                    <div>
                        <span style="color: #64748B; font-size: 12px;">Total Cost:</span>
                        <strong style="margin-left: 8px; font-size: 14px; color: #3B82F6;">$${shipment.totalCost.toLocaleString()}</strong>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function toggleHistoryCard(shipmentId) {
    const card = document.getElementById(`history-card-${shipmentId}`);
    if (!card) return;
    
    const details = card.querySelector('.history-card-details');
    const btn = card.querySelector('.history-expand-btn');
    
    if (details.style.display === 'none') {
        details.style.display = 'block';
        if (btn) btn.textContent = 'Collapse';
    } else {
        details.style.display = 'none';
        if (btn) btn.textContent = 'Expand';
    }
}

// Shipping History custom dropdown logic (single-select behavior with checkbox visual)
function _initShDropdowns() {
    const root = document.querySelector('#shippinghistory-section');
    if (!root) return;

    // Trigger click
    root.querySelectorAll('.sh-dropdown-trigger').forEach(trigger => {
        trigger.onclick = function(e) {
            e.stopPropagation();
            const filterType = this.dataset.filter;
            const panel = root.querySelector(`.sh-dropdown-panel[data-filter="${filterType}"]`);
            root.querySelectorAll('.sh-dropdown-panel').forEach(p => {
                if (p !== panel) p.classList.remove('is-open');
            });
            if (panel) panel.classList.toggle('is-open');
        };
    });

    // Panel checkbox binding (extracted so DB-driven option rebuilds can re-bind — see
    // _shOverviewSyncFilterOptions). Idempotent: safe to call again after replacing panel contents.
    root.querySelectorAll('.sh-dropdown-panel').forEach(panel => _shBindDropdownPanel(panel, root));

    // Close on outside click — bound once per section (guard against stacking on re-init).
    if (!root._shOutsideBound) {
        root._shOutsideBound = true;
        document.addEventListener('click', function _shOutside(e) {
            if (!root.contains(e.target)) {
                root.querySelectorAll('.sh-dropdown-panel').forEach(p => p.classList.remove('is-open'));
            }
        });
    }
}

// Bind (or re-bind) one dropdown panel's checkbox behavior (single-select with an "All" master).
function _shBindDropdownPanel(panel, root) {
    if (!panel) return;
    panel.onclick = e => e.stopPropagation();
    const filterType = panel.dataset.filter;
    const allCb = panel.querySelector('input[value=""]');
    const otherCbs = panel.querySelectorAll('input[type="checkbox"]:not([value=""])');

    // "All" toggles every option together (checking All also checks the others).
    if (allCb) {
        allCb.onchange = function() {
            const isChecked = this.checked;
            otherCbs.forEach(cb => cb.checked = isChecked);
            _updateShDropdownText(filterType, root);
        };
    }
    otherCbs.forEach(cb => {
        cb.onchange = function() {
            // Single-select: uncheck all others, uncheck "All"
            otherCbs.forEach(other => { if (other !== cb) other.checked = false; });
            if (allCb) allCb.checked = !this.checked;
            _updateShDropdownText(filterType, root);
        };
    });
}

// Rebuild the Overview Country / Shipping Method dropdown options from LIVE DB values (no mock
// options). Preserves the current single selection. When the DB has no shipments the panel shows
// only "All" (SHIPMENT_CENTER_SPEC / Part 3 — never inject hardcoded sample options).
function _shOverviewSyncFilterOptions(shipments) {
    var root = document.querySelector('#shippinghistory-section');
    if (!root) return;
    var official = (shipments || []).filter(function(s) { return SH_OVERVIEW_STATUSES[s.status]; });
    var optionSets = {
        country: _shDistinct(official.map(function(s) { return s.country; })),
        method: _shDistinct(official.map(function(s) { return s.shippingMethod; }))
    };
    Object.keys(optionSets).forEach(function(filter) {
        var panel = root.querySelector('.sh-dropdown-panel[data-filter="' + filter + '"]');
        if (!panel) return;
        var prev = (typeof _getShDropdownValue === 'function') ? _getShDropdownValue(filter) : '';
        var vals = optionSets[filter];
        var allChecked = !prev || vals.indexOf(prev) === -1; // fall back to All if prior value is gone
        panel.innerHTML = '<label class="sh-checkbox-item"><input type="checkbox" value="" ' +
                (allChecked ? 'checked' : '') + '> <strong>All</strong></label>' +
            vals.map(function(v) {
                var checked = allChecked || v === prev;
                return '<label class="sh-checkbox-item"><input type="checkbox" value="' + _shEsc(v) + '" ' +
                    (checked ? 'checked' : '') + '> ' + _shEsc(v) + '</label>';
            }).join('');
        _shBindDropdownPanel(panel, root);
        _updateShDropdownText(filter, root);
    });
}

function _updateShDropdownText(filterType, root) {
    const trigger = root.querySelector(`.sh-dropdown-trigger[data-filter="${filterType}"]`);
    const panel = root.querySelector(`.sh-dropdown-panel[data-filter="${filterType}"]`);
    if (!trigger || !panel) return;
    const textSpan = trigger.querySelector('.sh-dropdown-text');
    const allCb = panel.querySelector('input[value=""]');
    const checked = panel.querySelectorAll('input[type="checkbox"]:not([value=""]):checked');
    if (allCb && allCb.checked) {
        textSpan.textContent = 'All';
    } else if (checked.length === 1) {
        textSpan.textContent = checked[0].value;
    } else if (checked.length === 0) {
        textSpan.textContent = 'All';
        if (allCb) allCb.checked = true;
    } else {
        textSpan.textContent = `${checked.length} selected`;
    }
}

// ========================================
// Shipment Overview — DB (Execution Layer) rendering + execution-field editing
// Reads shipments / shipment_lines via KM.DB. Displays the Execution Snapshot (copied Decision
// Snapshot) READ-ONLY and never recalculates it; only execution-layer fields are editable.
// ========================================
function _shUseDb() {
    return !!(window.KM && window.KM.DB && window.KM.DB.isCloudWriteEnabled &&
        window.KM.DB.isCloudWriteEnabled() && window.KM.DB.getShipments);
}
function _shEsc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function _shNum(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

var SH_STATUS_LABEL = {
    draft: 'Draft', ready_to_ship: 'Ready to Ship', shipped: 'Shipped',
    in_transit: 'In Transit', arrived: 'Arrived', received: 'Received', closed: 'Closed',
    cancelled: 'Cancelled', stuck: 'Stuck',
    // legacy labels (still displayed if present)
    planned: 'Planned', partial_received: 'Partial Received', delivered: 'Delivered', completed: 'Completed'
};
// Execution Layer linear flow (Supply Chain Architecture v1.2 §10). Overview uses this to advance
// AFTER shipped. Draft-page transitions use the explicit Ready to Ship / Ship buttons.
var SH_STATUS_FLOW = ['draft', 'ready_to_ship', 'shipped', 'in_transit', 'arrived', 'received', 'closed'];
function _shNextStatus(status) {
    var i = SH_STATUS_FLOW.indexOf(status);
    return (i >= 0 && i < SH_STATUS_FLOW.length - 1) ? SH_STATUS_FLOW[i + 1] : null;
}

// Shipment Draft workspace = draft / ready_to_ship / shipped (until Done hides it).
var SH_DRAFT_STATUSES = ['draft', 'ready_to_ship', 'shipped'];
// Shipment Overview = official records only (shipped onward).
var SH_OVERVIEW_STATUSES = { shipped: 1, in_transit: 1, arrived: 1, received: 1, closed: 1 };
// Done marker: hidden from the Draft workspace (still shown in Overview; row never deleted).
function _shHiddenFromDraft(s) { return !!(s.hiddenFromDraftAt && String(s.hiddenFromDraftAt).trim()); }

function _shDistinct(arr) {
    var seen = {}, out = [];
    (arr || []).forEach(function(v) { v = String(v == null ? '' : v).trim(); if (v && !seen[v]) { seen[v] = 1; out.push(v); } });
    return out.sort();
}
// ============================================================
// Page separation: Shipment Draft and Shipment Overview are TWO independent pages.
// They SHARE the shipments / shipment_lines DB and the card render helper (_shRenderDbCard),
// but each owns its section, filter UI, init, and render — no shared filter DOM state.
//   Shipment Draft    → #shipment-draft-section   (compact Country + Status filter; draft/ready_to_ship/shipped)
//   Shipment Overview → #shippinghistory-section   (full filter bar; shipped onward)
// ============================================================

// Re-render whichever Shipment page is currently active. Called by the card action handlers
// after a write (updateShipment already reloads the DB, so render-only is correct here).
function _shLoadAndRender() {
    var draftSec = document.getElementById('shipment-draft-section');
    if (draftSec && draftSec.classList.contains('active')) { renderShipmentDraft(); return; }
    renderShipmentOverview();
}

// ---- Shipment Draft page --------------------------------------------------
function initShipmentDraftPage() {
    _shdEnsureFilter();
    renderShipmentDraft();
}

// Build the compact top-right filter (Country + Status) in the Draft section header.
// NO Marketplace; NO Date / SKU / Shipping Method / Search (that is Overview's full bar).
function _shdEnsureFilter() {
    var header = document.querySelector('#shipment-draft-section .page-header');
    if (!header) return;
    if (document.getElementById('shd-simple-filter')) return;
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    var wrap = document.createElement('div');
    wrap.id = 'shd-simple-filter';
    wrap.style.cssText = 'display:flex;gap:12px;align-items:center;margin-left:auto;';
    wrap.innerHTML =
        '<label style="font-size:13px;color:#475569;">Country ' +
            '<select id="shd-filter-country" onchange="renderShipmentDraft()" style="margin-left:4px;padding:4px 8px;border:1px solid #E2E8F0;border-radius:4px;font-size:13px;"></select></label>' +
        '<label style="font-size:13px;color:#475569;">Status ' +
            '<select id="shd-filter-status" onchange="renderShipmentDraft()" style="margin-left:4px;padding:4px 8px;border:1px solid #E2E8F0;border-radius:4px;font-size:13px;">' +
                '<option value="">All</option>' +
                '<option value="draft">Draft</option>' +
                '<option value="ready_to_ship">Ready to Ship</option>' +
                '<option value="shipped">Shipped</option>' +
            '</select></label>';
    header.appendChild(wrap);
}

// Populate the Draft Country select from the draft-eligible shipments (preserve current choice).
function _shdPopulateCountry(shipments) {
    var sel = document.getElementById('shd-filter-country');
    if (!sel) return;
    var cur = sel.value;
    var vals = _shDistinct(shipments
        .filter(function(s) { return SH_DRAFT_STATUSES.indexOf(s.status) !== -1 && !_shHiddenFromDraft(s); })
        .map(function(s) { return s.country; }));
    sel.innerHTML = ['<option value="">All</option>'].concat(vals.map(function(v) {
        return '<option value="' + _shEsc(v) + '">' + _shEsc(v) + '</option>';
    })).join('');
    if (cur && vals.indexOf(cur) !== -1) sel.value = cur;
}

function renderShipmentDraft() {
    var sec = document.getElementById('shipment-draft-section');
    if (!sec) return;
    var emptyStateEl = sec.querySelector('.history-empty-state');
    var listEl = sec.querySelector('.history-list');
    if (!emptyStateEl || !listEl) return;

    if (!_shUseDb()) {
        emptyStateEl.textContent = 'Connect the Operation DB (Google Sheet) to see Shipment Drafts.';
        emptyStateEl.hidden = false; listEl.hidden = true; listEl.innerHTML = '';
        return;
    }
    if (!window._opDbCache && window.KM.DB.loadOperationDb) {
        window.KM.DB.loadOperationDb({ force: true }).then(renderShipmentDraft).catch(renderShipmentDraft);
        return;
    }

    var shipments = window.KM.DB.getShipments() || [];
    var lines = window.KM.DB.getShipmentLines() || [];
    var linesByShipment = {};
    lines.forEach(function(l) { (linesByShipment[l.shipmentId] = linesByShipment[l.shipmentId] || []).push(l); });

    _shdPopulateCountry(shipments);
    var fCountry = (document.getElementById('shd-filter-country') || {}).value || '';
    var fStatus = (document.getElementById('shd-filter-status') || {}).value || '';

    // Draft work area: draft / ready_to_ship / shipped (not yet hidden via Done).
    var pool = shipments.filter(function(s) {
        return SH_DRAFT_STATUSES.indexOf(s.status) !== -1 && !_shHiddenFromDraft(s)
            && (!fCountry || s.country === fCountry)
            && (!fStatus || s.status === fStatus);
    });
    if (!pool.length) {
        emptyStateEl.textContent = 'No shipment drafts. Approve a Weekly Shipping Plan to create a Shipment Draft.';
        emptyStateEl.hidden = false; listEl.hidden = true; listEl.innerHTML = '';
        return;
    }
    emptyStateEl.hidden = true; listEl.hidden = false;
    var groups = [['draft', 'Draft'], ['ready_to_ship', 'Ready to Ship'], ['shipped', 'Shipped']];
    listEl.innerHTML = groups.filter(function(g) { return !fStatus || g[0] === fStatus; }).map(function(g) {
        var items = pool.filter(function(s) { return s.status === g[0]; });
        var body = items.length
            ? items.map(function(s) { return _shRenderDbCard(s, linesByShipment[s.shipmentId] || [], 'draft'); }).join('')
            : '<p style="color:#94A3B8;font-size:13px;margin:0 0 8px;">No ' + g[1] + ' shipments.</p>';
        // Section title styled like Request Order Draft: compact 15px heading + count badge.
        return '<h3 class="shd-group-title">' + g[1] +
            ' <span class="shd-group-title__count">' + items.length + '</span></h3>' + body;
    }).join('');
}

// ---- Shipment Overview page -----------------------------------------------
// Full filter bar (Date / Country / SKU / Shipping Method / Search) in #shippinghistory-section.
// Shows official records only (shipped onward). Read-only fields.
function renderShipmentOverview() {
    var sec = document.getElementById('shippinghistory-section');
    if (!sec) return;
    var emptyStateEl = sec.querySelector('.history-empty-state');
    var listEl = sec.querySelector('.history-list');
    if (!emptyStateEl || !listEl) return;

    if (!_shUseDb()) {
        // Demo mode: keep the existing mock-history behavior (Search-gated).
        renderHistoryResults(historyState.hasSearched ? filterHistoryData(historyState.data, collectFilterParams()) : []);
        return;
    }
    if (!window._opDbCache && window.KM.DB.loadOperationDb) {
        window.KM.DB.loadOperationDb({ force: true }).then(renderShipmentOverview).catch(renderShipmentOverview);
        return;
    }
    historyState.hasSearched = true;

    var shipments = window.KM.DB.getShipments() || [];
    var lines = window.KM.DB.getShipmentLines() || [];
    var linesByShipment = {};
    lines.forEach(function(l) { (linesByShipment[l.shipmentId] = linesByShipment[l.shipmentId] || []).push(l); });

    // Refresh Country / Shipping Method options from live DB (Part 3) before reading the filters.
    _shOverviewSyncFilterOptions(shipments);

    var fCountry = (typeof _getShDropdownValue === 'function') ? _getShDropdownValue('country') : '';
    var fMethod = (typeof _getShDropdownValue === 'function') ? _getShDropdownValue('method') : '';
    var skuInput = document.querySelector('#shippinghistory-section .filter-group--sku input');
    var fSku = skuInput ? String(skuInput.value || '').trim().toLowerCase() : '';
    var startStr = (historyState.dateRange && historyState.dateRange.start) ? formatHistoryDate(historyState.dateRange.start) : '';
    var endStr = (historyState.dateRange && historyState.dateRange.end) ? formatHistoryDate(historyState.dateRange.end) : '';

    var list = shipments.filter(function(s) {
        if (!SH_OVERVIEW_STATUSES[s.status]) return false;
        if (fCountry && s.country !== fCountry) return false;
        if (fMethod && s.shippingMethod !== fMethod) return false;
        if (fSku) {
            var lns = linesByShipment[s.shipmentId] || [];
            if (!lns.some(function(l) { return String(l.sku || '').toLowerCase().indexOf(fSku) !== -1; })) return false;
        }
        if (startStr || endStr) {
            var d = _shShipmentDate(s); // missing date is never hidden
            if (d) {
                if (startStr && d < startStr) return false;
                if (endStr && d > endStr) return false;
            }
        }
        return true;
    });
    if (!list.length) {
        emptyStateEl.textContent = 'No shipped shipments yet. Ship a Shipment Draft to see it here.';
        emptyStateEl.hidden = false; listEl.hidden = true; listEl.innerHTML = '';
        return;
    }
    emptyStateEl.hidden = true; listEl.hidden = false;
    listEl.innerHTML = list.map(function(s) { return _shRenderDbCard(s, linesByShipment[s.shipmentId] || [], 'overview'); }).join('');
}

// Best-available shipment date for the Overview Date filter.
// Priority: shipped_at → etd → eta → created_at (SHIPMENT_CENTER_SPEC). shipped_at is stamped when
// the shipment leaves the Draft workspace, so a just-shipped shipment (shipped_at = today) always
// falls inside the default "Last 30 days" window — ETD/ETA are frequently FUTURE dates and, if used
// first, would push a freshly-shipped shipment outside the window and hide it from Overview.
function _shShipmentDate(s) {
    var raw = s.shippedAt || s.etd || s.eta || s.createdAt || '';
    return String(raw).slice(0, 10);
}

function _shRenderDbCard(s, planLines, mode) {
    var sid = s.shipmentId;
    var statusLabel = SH_STATUS_LABEL[s.status] || s.status || '—';
    var status = s.status;
    // Execution FIELDS editable only in the Draft workspace, and only while draft / ready_to_ship
    // (shipped is read-only on the Draft page; Overview is always read-only).
    var fieldsEditable = (mode === 'draft') && (status === 'draft' || status === 'ready_to_ship');

    // SKU Lines — logistics copied (read-only) + editable carton number range.
    // Columns: SKU / Qty / Cartons / CBM (line total) / Gross Wt / Net Wt / Carton No. Start / End.
    var rows = planLines.map(function(l) {
        function n(v) { return (v === '' || v == null) ? '--' : v; }
        function cartonCell(which, val) {
            if (!fieldsEditable) return '<td style="text-align:right;">' + (val === '' || val == null ? '--' : _shEsc(val)) + '</td>';
            return '<td style="text-align:right;"><input type="number" min="0" step="1" data-line-id="' + _shEsc(l.shipmentLineId) + '" data-carton="' + which + '" value="' + _shEsc(val) + '" oninput="_shClearCartonError(\'' + _shEsc(sid) + '\')" style="width:78px;text-align:right;padding:2px 4px;border:1px solid #E2E8F0;border-radius:4px;font-size:12px;"></td>';
        }
        return '<tr>' +
            '<td>' + _shEsc(l.sku) + '</td>' +
            '<td style="text-align:right;">' + _shNum(l.qty) + '</td>' +
            '<td style="text-align:right;">' + _shNum(l.cartonQty) + '</td>' +
            '<td style="text-align:right;">' + n(l.shipmentCartonCbm) + '</td>' +
            '<td style="text-align:right;">' + n(l.grossWeight) + '</td>' +
            '<td style="text-align:right;">' + n(l.netWeight) + '</td>' +
            cartonCell('start', l.cartonNoStart) +
            cartonCell('end', l.cartonNoEnd) +
            '</tr>';
    }).join('');
    // Totals row. Total CBM = Σ(shipment_carton_cbm) — each line already holds its LINE-TOTAL CBM, so
    // sum directly (NEVER multiply by cartons in the frontend). Matches shipments.shipment_total_cbm.
    var tQty = planLines.reduce(function(a, l) { return a + _shNum(l.qty); }, 0);
    var tCtn = planLines.reduce(function(a, l) { return a + _shNum(l.cartonQty); }, 0);
    var tCartonCbm = planLines.reduce(function(a, l) { return a + _shNum(l.shipmentCartonCbm); }, 0);
    var tGross = planLines.reduce(function(a, l) { return a + _shNum(l.grossWeight); }, 0);
    var tNet = planLines.reduce(function(a, l) { return a + _shNum(l.netWeight); }, 0);
    var footRow = '<tr style="font-weight:600;border-top:2px solid #CBD5E1;">' +
        '<td>Total: ' + planLines.length + ' SKU</td>' +
        '<td style="text-align:right;">' + tQty + '</td>' +
        '<td style="text-align:right;">' + tCtn + '</td>' +
        '<td style="text-align:right;">' + tCartonCbm.toFixed(3) + '</td>' +
        '<td style="text-align:right;">' + tGross.toFixed(2) + '</td>' +
        '<td style="text-align:right;">' + tNet.toFixed(2) + '</td>' +
        '<td>—</td><td>—</td>' +
        '</tr>';

    // Execution fields form (clean 2-column grid). Editable only when fieldsEditable; Carrier is
    // always read-only (chosen on the Shipping Plan). Internal shipment_id is never editable.
    function fld(label, key, val, type) {
        var v = _shEsc(val);
        var inner = fieldsEditable
            ? '<input class="sh-exec-input" data-field="' + key + '" type="' + (type || 'text') + '" value="' + v + '" style="width:100%;padding:5px 8px;border:1px solid #CBD5E1;border-radius:4px;font-size:13px;box-sizing:border-box;">'
            : '<div style="padding:5px 0;font-size:13px;color:#1E293B;">' + (v || '--') + '</div>';
        return '<div style="display:flex;flex-direction:column;gap:2px;">' +
            '<label style="font-size:11px;color:#64748B;">' + label + '</label>' + inner + '</div>';
    }
    function roField(label, val) {
        return '<div style="display:flex;flex-direction:column;gap:2px;">' +
            '<label style="font-size:11px;color:#64748B;">' + label + '</label>' +
            '<div style="padding:5px 0;font-size:13px;color:#1E293B;">' + (_shEsc(val) || '--') + '</div></div>';
    }
    // Customs Type SNAPSHOT (shipments.shipments_customs_type; legacy customs_type read-fallback). Editable while Draft; read-only otherwise. Options =
    // distinct nonblank carrier_rate_cards.customs_type (never invented). Prefill = the shipment's stored
    // value, else the selected Rate Card's customs_type. Read from the stored snapshot in Overview (never
    // live-resolved), so a later rate-card change cannot silently mutate a confirmed shipment.
    var _rateCards = (window.KM && KM.DB && typeof KM.DB.getCarrierRateCards === 'function') ? (KM.DB.getCarrierRateCards() || []) : [];
    var _customsVal = String(s.shipmentsCustomsType || s.customsType || '').trim();
    if (!_customsVal && s.rateCardId) {
        var _rc = _rateCards.filter(function(c) { return String(c.rateCardId || '').trim() === String(s.rateCardId).trim(); })[0];
        if (_rc && _rc.customsType) _customsVal = String(_rc.customsType).trim();
    }
    var _customsOpts = [];
    _rateCards.forEach(function(c) { var v = String(c.customsType || '').trim(); if (v && _customsOpts.indexOf(v) === -1) _customsOpts.push(v); });
    if (_customsVal && _customsOpts.indexOf(_customsVal) === -1) _customsOpts.push(_customsVal);
    function customsFld() {
        var label = '<label style="font-size:11px;color:#64748B;">Customs Type</label>';
        if (!fieldsEditable) {
            return '<div style="display:flex;flex-direction:column;gap:2px;">' + label +
                '<div style="padding:5px 0;font-size:13px;color:#1E293B;">' + (_shEsc(_customsVal) || '--') + '</div></div>';
        }
        var opts = '<option value="">-- Select --</option>' + _customsOpts.map(function(v) {
            return '<option value="' + _shEsc(v) + '"' + (v === _customsVal ? ' selected' : '') + '>' + _shEsc(v) + '</option>';
        }).join('');
        return '<div style="display:flex;flex-direction:column;gap:2px;">' + label +
            '<select class="sh-exec-input" data-field="shipments_customs_type" style="width:100%;padding:5px 8px;border:1px solid #CBD5E1;border-radius:4px;font-size:13px;box-sizing:border-box;">' + opts + '</select></div>';
    }
    var execGrid =
        '<div style="font-size:11px;color:#94A3B8;margin-bottom:8px;">Internal ID: ' + _shEsc(sid) + ' <span style="color:#CBD5E1;">(system, not editable)</span></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;">' +
            fld('Shipment ID (external)', 'external_shipment_id', s.externalShipmentId) +
            roField('Carrier (from plan)', s.carrierId) +
            customsFld() +
            fld('Reference ID', 'reference_id', s.referenceId) +
            fld('Warehouse Code', 'warehouse_code', s.warehouseCode) +
            fld('Tracking No', 'tracking_number', s.trackingNumber) +
            fld('Booking No', 'booking_no', s.bookingNo) +
            fld('Container No', 'container_no', s.containerNo) +
            fld('BL No', 'bl_no', s.blNo) +
            fld('Invoice No', 'invoice_no', s.invoiceNo) +
            fld('ETD', 'etd', s.etd, 'date') +
            fld('ETA', 'eta', s.eta, 'date') +
            fld('Remark', 'note', s.note) +
        '</div>';
    function btn(onclick, label, bg) {
        return '<button onclick="' + onclick + '" style="margin-top:8px;margin-right:8px;background:' + bg + ';color:#fff;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;font-size:13px;">' + label + '</button>';
    }
    // Section-specific actions.
    var actionsHtml = '';
    if (mode === 'draft') {
        if (status === 'draft') {
            actionsHtml = btn("shSaveExecution('" + sid + "')", 'Save', '#10B981') +
                          btn("shReadyToShip('" + sid + "')", 'Ready to Ship →', '#3B82F6');
        } else if (status === 'ready_to_ship') {
            actionsHtml = btn("shSaveExecution('" + sid + "')", 'Save', '#10B981') +
                          btn("shShip('" + sid + "')", 'Ship 🚢', '#0EA5E9') +
                          btn("shReturnToDraft('" + sid + "')", '← Return to Draft', '#94A3B8');
        } else if (status === 'shipped') {
            actionsHtml = btn("shShipmentDone('" + sid + "')", 'Done', '#64748B');
        }
    } else {
        // Overview: official records advance through the post-ship lifecycle (no factory-stock effects).
        var next = _shNextStatus(status);
        if (next && status !== 'closed') actionsHtml = btn("shAdvanceStatus('" + sid + "', '" + next + "')", 'Advance → ' + _shEsc(SH_STATUS_LABEL[next] || next), '#3B82F6');
    }

    return '' +
    '<div class="history-card" id="sh-card-' + _shEsc(sid) + '" style="border:1px solid #E2E8F0;border-radius:8px;background:#fff;margin-bottom:12px;">' +
        '<div class="history-card-header" style="padding:16px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;" onclick="toggleShipmentCard(\'' + _shEsc(sid) + '\')">' +
            '<div>' +
                '<strong style="font-size:14px;">' + _shEsc(s.externalShipmentId || s.shipmentNo || sid) + '</strong>' +
                '<span style="margin-left:10px;padding:2px 8px;border-radius:10px;background:#EEF2FF;color:#3730A3;font-size:12px;">' + _shEsc(statusLabel) + '</span>' +
                '<span style="margin-left:10px;color:#64748B;font-size:12px;">Plan: ' + _shEsc(s.shippingPlanId || '') + '</span>' +
            '</div>' +
            '<div style="display:flex;gap:14px;align-items:center;font-size:13px;flex-wrap:wrap;">' +
                '<span><strong>Marketplace:</strong> ' + _shEsc(s.marketplace || '--') + '</span>' +
                '<span><strong>Company:</strong> ' + _shEsc(s.company || '--') + '</span>' +
                '<span><strong>Country:</strong> ' + _shEsc(s.country || '--') + '</span>' +
                '<span><strong>Destination:</strong> ' + _shEsc(s.destination || '--') + '</span>' +
                '<span><strong>Method:</strong> ' + _shEsc(s.shippingMethod || '--') + '</span>' +
                '<span><strong>Customs Type:</strong> ' + _shEsc(_customsVal || '--') + '</span>' +
                '<span><strong>Pcs:</strong> ' + _shNum(s.totalQty) + '</span>' +
                '<span><strong>ETD:</strong> ' + _shEsc(s.etd || '--') + '</span>' +
                '<span><strong>ETA:</strong> ' + _shEsc(s.eta || '--') + '</span>' +
                '<button class="history-expand-btn" style="padding:6px 12px;border:1px solid #E2E8F0;border-radius:4px;background:#fff;cursor:pointer;font-size:13px;color:#3B82F6;" onclick="event.stopPropagation();toggleShipmentCard(\'' + _shEsc(sid) + '\')">Expand</button>' +
            '</div>' +
        '</div>' +
        '<div class="history-card-details" style="display:none;padding:16px;border-top:1px solid #E2E8F0;background:#F8FAFC;">' +
            '<div style="display:grid;grid-template-columns:1.6fr 1fr;gap:24px;">' +
                '<div style="overflow-x:auto;">' +
                    '<h4 style="font-size:14px;margin-bottom:12px;color:#1E293B;">SKU Lines</h4>' +
                    '<table class="sh-sku-table"><thead><tr>' +
                        '<th class="sh-sku-table__th sh-sku-table__th--sku">SKU</th>' +
                        '<th class="sh-sku-table__th sh-sku-table__th--num">Qty</th>' +
                        '<th class="sh-sku-table__th sh-sku-table__th--num">Cartons</th>' +
                        '<th class="sh-sku-table__th sh-sku-table__th--num">CBM</th>' +
                        '<th class="sh-sku-table__th sh-sku-table__th--num">Gross Wt</th>' +
                        '<th class="sh-sku-table__th sh-sku-table__th--num">Net Wt</th>' +
                        '<th class="sh-sku-table__th sh-sku-table__th--num">Carton No. Start</th>' +
                        '<th class="sh-sku-table__th sh-sku-table__th--num">Carton No. End</th>' +
                    '</tr></thead><tbody id="sh-lines-' + _shEsc(sid) + '">' + rows + footRow + '</tbody></table>' +
                    '<div id="sh-lines-err-' + _shEsc(sid) + '" style="display:none;margin-top:8px;color:#DC2626;font-size:12px;"></div>' +
                '</div>' +
                '<div>' +
                    '<h4 style="font-size:14px;margin-bottom:12px;color:#1E293B;">Execution Fields' + (fieldsEditable ? '' : ' (read-only)') + '</h4>' +
                    '<div id="sh-exec-' + _shEsc(sid) + '" data-total-qty="' + _shNum(s.totalQty) + '" data-total-cartons="' + _shNum(s.totalCartons) + '">' + execGrid + '</div>' +
                    actionsHtml +
                '</div>' +
            '</div>' +
        '</div>' +
    '</div>';
}

function toggleShipmentCard(shipmentId) {
    var card = document.getElementById('sh-card-' + shipmentId);
    if (!card) return;
    var details = card.querySelector('.history-card-details');
    var btn = card.querySelector('.history-expand-btn');
    if (details.style.display === 'none') {
        details.style.display = 'block';
        if (btn) btn.textContent = 'Collapse';
    } else {
        details.style.display = 'none';
        if (btn) btn.textContent = 'Expand';
    }
}

// Clear carton-number error styling / message for a shipment card (called on input).
function _shClearCartonError(shipmentId) {
    var linesBox = document.getElementById('sh-lines-' + shipmentId);
    if (linesBox) linesBox.querySelectorAll('input[data-carton]').forEach(function(inp) { inp.style.borderColor = '#E2E8F0'; });
    var errBox = document.getElementById('sh-lines-err-' + shipmentId);
    if (errBox) { errBox.style.display = 'none'; errBox.textContent = ''; }
}

// Validate carton numbers within a shipment card: integers only, start <= end, and no overlapping
// ranges. requireComplete=true additionally demands every line has both start and end (Ship gate).
// Returns { ok, error }. On failure, offending inputs get a red border + a message is shown.
function _shValidateCartons(shipmentId, requireComplete) {
    var linesBox = document.getElementById('sh-lines-' + shipmentId);
    if (!linesBox) return { ok: true };
    _shClearCartonError(shipmentId);
    var byId = {};
    linesBox.querySelectorAll('input[data-carton]').forEach(function(inp) {
        var id = inp.getAttribute('data-line-id');
        if (!id) return;
        byId[id] = byId[id] || {};
        byId[id][inp.getAttribute('data-carton')] = inp;
    });
    function isInt(v) { return /^\d+$/.test(String(v).trim()); }
    function markErr(shipmentId, msg, inputs) {
        (inputs || []).forEach(function(i) { if (i) i.style.borderColor = '#DC2626'; });
        var errBox = document.getElementById('sh-lines-err-' + shipmentId);
        if (errBox) { errBox.textContent = msg; errBox.style.display = 'block'; }
        return { ok: false, error: msg };
    }
    var ranges = [];
    var keys = Object.keys(byId);
    for (var i = 0; i < keys.length; i++) {
        var pair = byId[keys[i]];
        var sInp = pair.start, eInp = pair.end;
        var sVal = sInp ? String(sInp.value).trim() : '';
        var eVal = eInp ? String(eInp.value).trim() : '';
        if (sVal === '' && eVal === '') {
            if (requireComplete) return markErr(shipmentId, 'Carton No. Start / End are required for every SKU before Ship.', [sInp, eInp]);
            continue;
        }
        if (sVal === '' || eVal === '') return markErr(shipmentId, 'Both Carton No. Start and End must be filled.', [sInp, eInp]);
        if (!isInt(sVal) || !isInt(eVal)) return markErr(shipmentId, 'Carton No. must be whole numbers.', [sInp, eInp]);
        var st = parseInt(sVal, 10), en = parseInt(eVal, 10);
        if (st > en) return markErr(shipmentId, 'Carton No. Start must be less than or equal to End.', [sInp, eInp]);
        ranges.push({ start: st, end: en, sInp: sInp, eInp: eInp });
    }
    for (var a = 0; a < ranges.length; a++) {
        for (var b = a + 1; b < ranges.length; b++) {
            if (ranges[a].start <= ranges[b].end && ranges[b].start <= ranges[a].end) {
                return markErr(shipmentId, 'Carton No. ranges must not overlap (' + ranges[a].start + '-' + ranges[a].end + ' vs ' + ranges[b].start + '-' + ranges[b].end + ').',
                    [ranges[a].sInp, ranges[a].eInp, ranges[b].sInp, ranges[b].eInp]);
            }
        }
    }
    return { ok: true };
}

// Collect the editable execution fields from a card's exec box into an updateShipment payload.
function _shCollectExec(shipmentId) {
    var box = document.getElementById('sh-exec-' + shipmentId);
    var payload = { shipment_id: shipmentId, actor: 'operation-system' };
    if (box) {
        // Collect <input> AND <select> (Customs Type) execution fields.
        box.querySelectorAll('input[data-field], select[data-field]').forEach(function(inp) {
            payload[inp.getAttribute('data-field')] = inp.value;
        });
    }
    // Editable shipment_line fields: carton number range.
    var linesBox = document.getElementById('sh-lines-' + shipmentId);
    if (linesBox) {
        var byId = {};
        linesBox.querySelectorAll('input[data-carton]').forEach(function(inp) {
            var id = inp.getAttribute('data-line-id');
            if (!id) return;
            byId[id] = byId[id] || { shipment_line_id: id };
            if (inp.getAttribute('data-carton') === 'start') byId[id].carton_no_start = inp.value;
            else byId[id].carton_no_end = inp.value;
        });
        var arr = Object.keys(byId).map(function(k) { return byId[k]; });
        if (arr.length) payload.lines = arr;
    }
    return payload;
}

// Save = update execution fields only. Does NOT change status, NOT create history, NOT enter Overview.
// Carton numbers are validated (integers / start<=end / no overlap) before saving.
function shSaveExecution(shipmentId) {
    var v = _shValidateCartons(shipmentId, false);
    if (!v.ok) { alert('Cannot Save — ' + v.error); return; }
    window.KM.DB.updateShipment(_shCollectExec(shipmentId)).then(function() {
        alert('Draft saved.');
        _shLoadAndRender();
    }).catch(function(err) { alert('Save failed: ' + (err && err.message ? err.message : err)); });
}

// Draft → Ready to Ship (still in the Draft workspace; saves current field edits too).
function shReadyToShip(shipmentId) {
    var v = _shValidateCartons(shipmentId, false);
    if (!v.ok) { alert('Cannot proceed — ' + v.error); return; }
    var payload = _shCollectExec(shipmentId);
    payload.status = 'ready_to_ship';
    window.KM.DB.updateShipment(payload).then(function() {
        _shLoadAndRender();
    }).catch(function(err) { alert('Update failed: ' + (err && err.message ? err.message : err)); });
}

// Ship = official shipment. Validates required fields, then status=shipped (+ shipped_at/by server-side).
// Required (SHIPMENT_CENTER_SPEC §5B): external_shipment_id, Carton No. Start/End (all lines),
// reference_id, warehouse_code, ETD, ETA. After this the shipment appears in Shipment Overview.
function shShip(shipmentId) {
    var cartonV = _shValidateCartons(shipmentId, true);
    if (!cartonV.ok) { alert('Cannot Ship — ' + cartonV.error); return; }
    var payload = _shCollectExec(shipmentId);
    var box = document.getElementById('sh-exec-' + shipmentId);
    var totalQty = box ? (parseFloat(box.getAttribute('data-total-qty')) || 0) : 0;
    var missing = [];
    if (!String(payload.external_shipment_id || '').trim()) missing.push('Shipment ID (external)');
    if (!String(payload.reference_id || '').trim()) missing.push('Reference ID');
    if (!String(payload.warehouse_code || '').trim()) missing.push('Warehouse Code');
    if (!String(payload.etd || '').trim()) missing.push('ETD');
    if (!String(payload.eta || '').trim()) missing.push('ETA');
    if (totalQty <= 0) missing.push('Total Qty');
    if (missing.length) { alert('Cannot Ship — please complete:\n\n• ' + missing.join('\n• ')); return; }
    if (!confirm('Mark this shipment as SHIPPED? It will then appear in Shipment Overview.')) return;
    payload.status = 'shipped';
    window.KM.DB.updateShipment(payload).then(function() {
        alert('Shipment marked as Shipped.');
        _shLoadAndRender();
    }).catch(function(err) { alert('Ship failed: ' + (err && err.message ? err.message : err)); });
}

// Return to Draft (Phase-2 placeholder, no permissions): send a Ready to Ship shipment back to
// Draft with a required revision reason (appended to the note history server-side).
function shReturnToDraft(shipmentId) {
    var reason = prompt('Return this shipment to Draft for revision.\n\nEnter a reason (required):');
    if (reason == null) return;
    reason = String(reason).trim();
    if (!reason) { alert('A reason is required to return to Draft.'); return; }
    window.KM.DB.updateShipment({ shipment_id: shipmentId, status: 'draft', revision_reason: reason, actor: 'operation-system' })
        .then(function() { _shLoadAndRender(); })
        .catch(function(err) { alert('Return to Draft failed: ' + (err && err.message ? err.message : err)); });
}

// Done = hide the shipped card from the Shipment Draft workspace (still shown in Overview; not deleted).
function shShipmentDone(shipmentId) {
    if (!confirm('This shipment is already Shipped and visible in Shipment Overview.\n\nHide it from the Shipment Draft workspace?')) return;
    window.KM.DB.updateShipment({ shipment_id: shipmentId, hidden_from_draft: true, actor: 'operation-system' })
        .then(function() { _shLoadAndRender(); })
        .catch(function(err) { alert('Done failed: ' + (err && err.message ? err.message : err)); });
}

// Status-advance placeholder (Overview post-ship lifecycle). No factory-stock side effects.
function shAdvanceStatus(shipmentId, nextStatus) {
    if (!nextStatus) return;
    if (!confirm('Advance shipment to "' + (SH_STATUS_LABEL[nextStatus] || nextStatus) + '"?')) return;
    window.KM.DB.updateShipment({ shipment_id: shipmentId, status: nextStatus, actor: 'operation-system' })
        .then(function() { _shLoadAndRender(); })
        .catch(function(err) { alert('Status update failed: ' + (err && err.message ? err.message : err)); });
}

// Menu entry points — TWO independent pages / sections (no shared view-mode flag).
function showShipmentDraft() {
    if (typeof showSection === 'function') showSection('shipment-draft');
}
function showShipmentOverview() {
    if (typeof showSection === 'function') showSection('shipment-overview'); // → #shippinghistory-section
}

window._shLoadAndRender = _shLoadAndRender;
window._shClearCartonError = _shClearCartonError;
window.toggleShipmentCard = toggleShipmentCard;
window.shSaveExecution = shSaveExecution;
window.shReadyToShip = shReadyToShip;
window.shShip = shShip;
window.shReturnToDraft = shReturnToDraft;
window.shShipmentDone = shShipmentDone;
window.shAdvanceStatus = shAdvanceStatus;
window.showShipmentDraft = showShipmentDraft;
window.showShipmentOverview = showShipmentOverview;

window.toggleHistoryCard = toggleHistoryCard;
window.initShipmentDraftPage = initShipmentDraftPage;
window.initShipmentOverviewPage = initShipmentOverviewPage;
window.initShippingHistoryPage = initShipmentOverviewPage; // back-compat
window.renderShipmentDraft = renderShipmentDraft;
window.renderShipmentOverview = renderShipmentOverview;

window.addEventListener('DOMContentLoaded', () => {
    // 移除自動初始化，改由 showSection 控制
});


// ========================================
// Lifecycle 註冊 — two separate pages (shared DB, separate section + state)
// ========================================
if (window.KM && window.KM.lifecycle) {
    // Shipment Overview (full filter bar) → #shippinghistory-section
    KM.lifecycle.register('shippinghistory-section', {
        mount() {
            _ensureShipmentOverviewMarkup().then(function() {
                var sec = document.getElementById('shippinghistory-section');
                if (sec) sec.classList.add('active');
                initShipmentOverviewPage();
            });
        },
        unmount() {}
    });

    // Shipment Draft (compact Country + Status filter) → #shipment-draft-section
    KM.lifecycle.register('shipment-draft-section', {
        mount() {
            _ensureShipmentDraftMarkup().then(function() {
                var sec = document.getElementById('shipment-draft-section');
                if (sec) sec.classList.add('active');
                initShipmentDraftPage();
            });
        },
        unmount() {}
    });
}

// Ensure the Shipment Overview markup is present before its init runs (idempotent; never throws).
function _ensureShipmentOverviewMarkup() {
    if (document.getElementById('shippinghistory-section')) return Promise.resolve(true);
    if (window.KM && window.KM.partialLoader && window.KM.partialLoader.loadPartial) {
        return window.KM.partialLoader
            .loadPartial('shippinghistory', 'assets/html/pages/shipping-history.html', '#shippinghistory-mount')
            .then(function() { return true; })
            .catch(function(err) { console.warn('[ShipmentOverview] failed to load partial:', err); return false; });
    }
    return Promise.resolve(false);
}

// Ensure the Shipment Draft markup is present before its init runs (idempotent; never throws).
function _ensureShipmentDraftMarkup() {
    if (document.getElementById('shipment-draft-section')) return Promise.resolve(true);
    if (window.KM && window.KM.partialLoader && window.KM.partialLoader.loadPartial) {
        return window.KM.partialLoader
            .loadPartial('shipment-draft', 'assets/html/pages/shipment-draft.html', '#shipment-draft-mount')
            .then(function() { return true; })
            .catch(function(err) { console.warn('[ShipmentDraft] failed to load partial:', err); return false; });
    }
    return Promise.resolve(false);
}
