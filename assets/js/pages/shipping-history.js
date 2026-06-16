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

function initShippingHistoryPage() {
    console.log('Initializing Shipping History Page');
    
    const searchBtn = document.querySelector("#shippinghistory-section .btn-primary");
    const dateTrigger = document.getElementById('historyDateTrigger');
    
    if (!searchBtn || !dateTrigger) {
        console.error('Shipping History elements not found:', { searchBtn, dateTrigger });
        return;
    }
    
    console.log('Elements found, setting up events');
    
    loadHistoryData();
    updateHistoryDateTriggerText();
    
    // Init custom dropdowns
    _initShDropdowns();
    
    // 直接綁定事件，不使用 clone
    searchBtn.onclick = onHistorySearch;
    dateTrigger.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log('Date trigger clicked');
        openHistoryDateModal();
    };
    
    renderHistoryResults([]);
    console.log('Shipping History initialized');
}

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
    const emptyStateEl = document.querySelector(".history-empty-state");
    const listEl = document.querySelector(".history-list");
    
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

    // Panel click stop propagation
    root.querySelectorAll('.sh-dropdown-panel').forEach(panel => {
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
    });

    // Close on outside click
    document.addEventListener('click', function _shOutside(e) {
        if (!root.contains(e.target)) {
            root.querySelectorAll('.sh-dropdown-panel').forEach(p => p.classList.remove('is-open'));
        }
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

window.toggleHistoryCard = toggleHistoryCard;
window.initShippingHistoryPage = initShippingHistoryPage;

window.addEventListener('DOMContentLoaded', () => {
    // 移除自動初始化，改由 showSection 控制
});


// ========================================
// Lifecycle 註冊
// ========================================
if (window.KM && window.KM.lifecycle) {
    KM.lifecycle.register('shippinghistory-section', {
        mount() {
            console.log('[ShippingHistory] mount');
            // Markup is partial-loaded (Phase 3-1). Ensure it exists, then (re)apply the .active
            // class (showSection ran before the async injection on first open) and init.
            _ensureShippingHistoryMarkup().then(function() {
                var sec = document.getElementById('shippinghistory-section');
                if (sec) sec.classList.add('active');
                if (window.initShippingHistoryPage) {
                    window.initShippingHistoryPage();
                }
            });
        },
        unmount() {
            console.log('[ShippingHistory] unmount');
        }
    });
}

// Ensure the Shipping History markup is present before its init runs.
// Idempotent: if #shippinghistory-section already exists, resolves immediately (no re-fetch, no
// duplicate). Loads the partial via KM.partialLoader; on any failure it warns and resolves (never throws).
function _ensureShippingHistoryMarkup() {
    if (document.getElementById('shippinghistory-section')) {
        return Promise.resolve(true);
    }
    if (window.KM && window.KM.partialLoader && window.KM.partialLoader.loadPartial) {
        return window.KM.partialLoader
            .loadPartial('shippinghistory', 'assets/html/pages/shipping-history.html', '#shippinghistory-mount')
            .then(function() {
                if (!document.getElementById('shippinghistory-section')) {
                    console.warn('[ShippingHistory] partial loaded but #shippinghistory-section not found');
                }
                return true;
            })
            .catch(function(err) {
                console.warn('[ShippingHistory] failed to load partial:', err);
                return false;
            });
    }
    console.warn('[ShippingHistory] KM.partialLoader unavailable; markup not loaded.');
    return Promise.resolve(false);
}
