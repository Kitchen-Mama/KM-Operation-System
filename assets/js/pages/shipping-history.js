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

    // Mount the shared multi-select filters (Country / Shipping Method) — scoped to the Overview section.
    // Options are refreshed from live data by _shSyncFilterOptions (called in renderShipmentOverview).
    _shInitFilters();

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
    // Country / Method are multi-value arrays ([] = All). SKU stays a free-text contains search.
    return {
        start: formatHistoryDate(historyState.dateRange.start),
        end: formatHistoryDate(historyState.dateRange.end),
        country: shOverviewFilterState.country.slice(),
        sku: skuInput?.value.trim() || "",
        method: shOverviewFilterState.method.slice()
    };
}

// ── Shipment Overview filters — shared KM.ui.multiFilter (Round 3) ───────────────────────────────
// Country / Shipping Method migrated from the old single-select `sh-dropdown` checkbox panels to the
// ONE shared component. State is multi-value ([] = All; within a filter OR; across filters AND). The
// shared controller is the SINGLE owner — no old sh-dropdown DOM / single-value reader / native panel
// remains. Options are derived from live runtime data (never hardcoded) by _shSyncFilterOptions.
var shOverviewFilterState = { country: [], method: [] };

// Create-or-update ONE shared multi-select on its mount (idempotent). onChange writes the selection
// array back into shOverviewFilterState and re-renders through the existing Overview path.
function _shMountFilter(key, label, mountId, options) {
    if (!(window.KM && window.KM.ui && window.KM.ui.multiFilter)) return;
    var mount = document.getElementById(mountId);
    if (!mount) return;
    KM.ui.multiFilter.create({
        mount: mount, filterId: mountId, label: label, options: options || [],
        selectedValues: shOverviewFilterState[key],
        onChange: function (vals) { shOverviewFilterState[key] = vals; renderShipmentOverview(); }
    });
    // Keep state in sync when setOptions pruned a now-invalid selection.
    if (mount.__kmfCtl) shOverviewFilterState[key] = mount.__kmfCtl.getSelected();
}

function _shInitFilters() {
    _shMountFilter('country', 'Country', 'sh-f-country-mount', []);
    _shMountFilter('method', 'Method', 'sh-f-method-mount', []);
}

// Refresh Country / Shipping Method option universes from live runtime data (DB official shipments when
// present, else the mock/demo dataset). setOptions prunes selections no longer available; the pruned
// result is written back to the single page state so the predicate never queries a stale value.
function _shSyncFilterOptions(shipments) {
    var countrySrc, methodSrc;
    if (shipments) {
        var official = shipments.filter(function (s) { return SH_OVERVIEW_STATUSES[s.status]; });
        countrySrc = official.map(function (s) { return s.country; });
        methodSrc = official.map(function (s) { return s.shippingMethod; });
    } else {
        var data = historyState.data || [];
        countrySrc = data.map(function (d) { return d.country; });
        methodSrc = data.map(function (d) { return d.method; });
    }
    _shSetFilterOptions('country', 'sh-f-country-mount', _shDistinct(countrySrc));
    _shSetFilterOptions('method', 'sh-f-method-mount', _shDistinct(methodSrc));
}

function _shSetFilterOptions(key, mountId, vals) {
    var mount = document.getElementById(mountId);
    if (!mount || !mount.__kmfCtl) return;
    mount.__kmfCtl.setOptions((vals || []).map(function (v) { return { value: v, label: v }; }));
    shOverviewFilterState[key] = mount.__kmfCtl.getSelected(); // re-sync after cascade prune
}

function filterHistoryData(data, params) {
    // Multi-value: [] = All (no restriction); within a filter OR-set membership; across filters AND.
    return data.filter(item => {
        if (params.start && item.date < params.start) return false;
        if (params.end && item.date > params.end) return false;
        if (params.country && params.country.length && params.country.indexOf(item.country) === -1) return false;
        if (params.sku) {
            const hasSku = item.skus.some(s =>
                s.sku.toLowerCase().includes(params.sku.toLowerCase())
            );
            if (!hasSku) return false;
        }
        if (params.method && params.method.length && params.method.indexOf(item.method) === -1) return false;
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
            <div class="history-card-header" style="padding: 16px; display: flex; justify-content: space-between; align-items: center; cursor: pointer;" onclick="toggleHistoryCard('${shipment.id}', event)">
                <div>
                    <strong style="font-size: 14px;">${shipment.id}</strong>
                    <span style="margin-left: 12px; color: #64748B; font-size: 13px;">${shipment.date}</span>
                </div>
                <div style="display: flex; gap: 16px; align-items: center; font-size: 13px;">
                    <span><strong>Country:</strong> ${shipment.country}</span>
                    <span><strong>Method:</strong> ${shipment.method}</span>
                    <span><strong>Total Pcs:</strong> ${shipment.totalPcs.toLocaleString()}</span>
                    <span><strong>Cost:</strong> $${shipment.totalCost.toLocaleString()}</span>
                    <button type="button" class="history-expand-btn" aria-expanded="false" style="padding: 6px 12px; border: 1px solid #E2E8F0; border-radius: 4px; background: white; cursor: pointer; font-size: 13px; color: #3B82F6;" onclick="event.stopPropagation(); toggleHistoryCard('${shipment.id}', event)">
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

// V3G6A - the demo/mock Overview card reuses the SAME canonical toggle (no divergent second implementation).
function toggleHistoryCard(shipmentId, evt) {
    return _shToggleCardEl(_shCardFromEvent(evt, shipmentId, 'history-card-'));
}

// (Round 3) The old single-select `sh-dropdown` panel logic — _initShDropdowns / _shBindDropdownPanel /
// _shOverviewSyncFilterOptions / _updateShDropdownText / _getShDropdownValue — was removed. Country and
// Shipping Method are now owned solely by KM.ui.multiFilter (see _shInitFilters / _shSyncFilterOptions
// above). No old DOM, single-value reader, click/listener owner, or native panel state remains.

// ========================================
// Shipment Overview — DB (Execution Layer) rendering + execution-field editing
// Reads shipments / shipment_lines via KM.DB. Displays the Execution Snapshot (copied Decision
// Snapshot) READ-ONLY and never recalculates it; only execution-layer fields are editable.
// ========================================
function _shUseDb() {
    // F1-7M-B2-HOTFIX (Shape-2 cold-start): cloud eligibility INDEPENDENT of whether the broad _opDbCache is primed
    // (F1-7L zero-prime). The canonical Shipment Draft/Overview read is the scoped `shipment` workspace (getWorkspace via
    // _shEffectiveWorkspace / workspaceApiActive('shipment'), cache-independent); the legacy kill-switch path loads the
    // broad cache on demand. The former isCloudWriteEnabled() gate required getDataSourceMode()==='google-sheet' (== broad
    // cache already loaded), never true on a cold F1-7L session → the false "Connect the Operation DB … Shipment Drafts"
    // banner. isScopedReadEligible() (API configured AND not explicit mock) is the shared cache-independent posture and
    // gates writes correctly too. A genuine no-drafts result stays a distinct EMPTY state ("No shipment drafts …"), NOT
    // this disconnected banner. Explicit mock / unconfigured → banner preserved.
    return !!(window.KM && window.KM.DB && typeof window.KM.DB.isScopedReadEligible === 'function' &&
        window.KM.DB.isScopedReadEligible() && window.KM.DB.getShipments);
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
// F1-6B Part B — statuses at which the frozen R2B final-output snapshot exists (post confirm-and-dispatch), so
// Shipping Detail / Packing List documents can be generated. Purely a UX gate — the backend is fail-closed regardless.
var SH_DOC_READY_STATUSES = { in_transit: 1, arrived: 1, received: 1, closed: 1 };
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

// ---- F1-7F · scoped Shipment workspace read cutover (mirrors the F1-7B/7C/7D pattern) ----
// The Shipment Draft/Overview primary read sources shipments/shipment_lines (+ carrier_rate_cards/warehouses) from ONE
// scoped `shipment` workspace — no broad Operation DB for the primary render. Kill switch: setWorkspaceEnabled('shipment',
// false). Canonical default ON.
function _shEffectiveWorkspace() {
    return !!(window.KM && window.KM.api && typeof window.KM.api.workspaceApiActive === 'function' &&
        window.KM.api.workspaceApiActive('shipment'));
}
var _shReadModel = null;   // workspace-sourced { shipments, shipmentLines, carrierRateCards, warehouses, ... }, or null = Legacy
var _shReadSeq = 0;
var _shRegionEl = null, _shRegion = null;
// read-model-first accessors: Workspace mode reads the scoped DTO; Legacy reads the broad-cache getters unchanged.
function _shGetShipments() { return _shReadModel ? _shReadModel.shipments : ((window.KM.DB.getShipments && window.KM.DB.getShipments()) || []); }
function _shGetShipmentLines() { return _shReadModel ? _shReadModel.shipmentLines : ((window.KM.DB.getShipmentLines && window.KM.DB.getShipmentLines()) || []); }
function _shGetCarrierRateCards() { return _shReadModel ? _shReadModel.carrierRateCards : ((window.KM.DB.getCarrierRateCards && window.KM.DB.getCarrierRateCards()) || []); }
function _shGetWarehouses() { return _shReadModel ? _shReadModel.warehouses : ((window.KM.DB.getWarehouses && window.KM.DB.getWarehouses()) || []); }

function _shActiveListEl_() {
    var draftSec = document.getElementById('shipment-draft-section');
    if (draftSec && draftSec.classList.contains('active')) return draftSec.querySelector('.history-list') || draftSec.querySelector('[class*="list"]');
    var ovSec = document.getElementById('shippinghistory-section');
    return ovSec ? (ovSec.querySelector('.history-list')) : null;
}
function _shRegion_() {
    if (typeof document === 'undefined' || !(window.KM && window.KM.loadState)) return null;
    var el = _shActiveListEl_(); if (!el) return null;
    if (_shRegion && _shRegionEl === el) return _shRegion;
    _shRegionEl = el; _shRegion = window.KM.loadState.bindElement(el, 'Loading shipments…');
    return _shRegion;
}
// Scoped read: Workspace (canonical) → getWorkspace('shipment') → adapt → renderFn. Fail-closed (bounded region ERROR;
// NO silent legacy broad fallback). Also the scoped POST-WRITE refresh path.
function _shRefresh_(renderFn) {
    var mySeq = ++_shReadSeq;
    var rg = _shRegion_();
    if (rg) rg.beginLoad(!!_shReadModel);
    if (!(window.KM.api && typeof window.KM.api.getWorkspace === 'function')) { _shRenderError_({ code: 'WORKSPACE_UNAVAILABLE', message: 'Shipment Workspace API unavailable.' }); return; }
    // F1-7N-FB-1B §P — ask for the generated_documents projection. It is a BOUNDED include: without it the
    // workspace does not read the registry at all, so the Document Panel cost is opt-in per page.
    Promise.resolve(window.KM.api.getWorkspace('shipment', { page: { number: 1, size: 3000 }, include: { documents: true } })).then(function (env) {
        if (mySeq !== _shReadSeq) return;
        if (env && env.success) {
            _shReadModel = window.KM.DB.adaptShipmentWorkspace(env.data);
            if (rg) rg.set(_shReadModel.shipments.length ? window.KM.loadState.STATES.READY : window.KM.loadState.STATES.EMPTY);
            if (typeof renderFn === 'function') renderFn();
        } else {
            _shRenderError_((env && env.errors && env.errors[0]) || { code: 'WORKSPACE_ERROR', message: 'Shipment workspace request failed.' });
        }
    }).catch(function (e) { if (mySeq !== _shReadSeq) return; _shRenderError_({ code: 'SHIPMENT_READ_FAILED', message: String(e && e.message || e) }); });
}
function _shRenderError_(err) {
    _shReadModel = null;
    var rg = _shRegion_(); if (rg) rg.set(window.KM.loadState.STATES.ERROR);
    var el = _shActiveListEl_();
    if (el) { el.hidden = false; el.innerHTML = '<div style="color:#B91C1C;padding:12px;font-size:13px;">Shipment read error: ' + _shEsc((err && err.message) || 'failed') + ' [' + _shEsc((err && err.code) || 'READ_FAILED') + ']</div>'; }
}

// Re-render whichever Shipment page is currently active. Called by the card action handlers after a write. In Workspace
// mode this is a SCOPED re-read of the shipment workspace (never a broad reload); in Legacy mode render-only (the write
// adapters already reloaded the broad cache).
function _shLoadAndRender() {
    var draftSec = document.getElementById('shipment-draft-section');
    var active = (draftSec && draftSec.classList.contains('active')) ? renderShipmentDraft : renderShipmentOverview;
    if (_shEffectiveWorkspace()) { _shReadModel = null; _shRefresh_(active); return; }
    active();
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
    if (_shEffectiveWorkspace()) {
        if (!_shReadModel) { _shRefresh_(renderShipmentDraft); return; }   // scoped read; re-enters here when ready
    } else if (!window._opDbCache && window.KM.DB.loadOperationDb) {
        window.KM.DB.loadOperationDb({ force: true }).then(renderShipmentDraft).catch(renderShipmentDraft);
        return;
    }

    var shipments = _shGetShipments();
    var lines = _shGetShipmentLines();
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
        // Demo mode: keep the existing mock-history behavior (Search-gated). Refresh the multi-select
        // option universes from the mock dataset so Country / Method reflect runtime data (not hardcoded).
        _shSyncFilterOptions();
        renderHistoryResults(historyState.hasSearched ? filterHistoryData(historyState.data, collectFilterParams()) : []);
        return;
    }
    if (_shEffectiveWorkspace()) {
        if (!_shReadModel) { _shRefresh_(renderShipmentOverview); return; }   // scoped read; re-enters here when ready
    } else if (!window._opDbCache && window.KM.DB.loadOperationDb) {
        window.KM.DB.loadOperationDb({ force: true }).then(renderShipmentOverview).catch(renderShipmentOverview);
        return;
    }
    historyState.hasSearched = true;

    var shipments = _shGetShipments();
    var lines = _shGetShipmentLines();
    var linesByShipment = {};
    lines.forEach(function(l) { (linesByShipment[l.shipmentId] = linesByShipment[l.shipmentId] || []).push(l); });

    // Refresh Country / Shipping Method options from live DB (Part 3) before reading the filters.
    _shSyncFilterOptions(shipments);

    // Multi-value state ([] = All; within a filter OR; across filters AND).
    var fCountry = shOverviewFilterState.country;
    var fMethod = shOverviewFilterState.method;
    var skuInput = document.querySelector('#shippinghistory-section .filter-group--sku input');
    var fSku = skuInput ? String(skuInput.value || '').trim().toLowerCase() : '';
    var startStr = (historyState.dateRange && historyState.dateRange.start) ? formatHistoryDate(historyState.dateRange.start) : '';
    var endStr = (historyState.dateRange && historyState.dateRange.end) ? formatHistoryDate(historyState.dateRange.end) : '';

    var list = shipments.filter(function(s) {
        if (!SH_OVERVIEW_STATUSES[s.status]) return false;
        if (fCountry.length && fCountry.indexOf(s.country) === -1) return false;
        if (fMethod.length && fMethod.indexOf(s.shippingMethod) === -1) return false;
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
    var _rateCards = _shGetCarrierRateCards();
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
    // Warehouse Picker (SHIPMENT_CENTER_SPEC §22.0). Replaces the legacy free-text Warehouse Code input.
    // The user selects exactly ONE warehouse: shipments.warehouse_id is the identity, and warehouse_code
    // is COPIED from the chosen warehouses row (never typed, never inferred from destination text). Both
    // persist on Save/Ship (via _shCollectExec) and restore on reload from the stored warehouse_id.
    // TEMPORARY SEMANTIC (inbound-first, §22.0(L)/task item 9): warehouse_id/warehouse_code = the
    // DESTINATION warehouse. When Warehouse Outbound is implemented, explicit origin_warehouse_id /
    // destination_warehouse_id arrive through a planned migration.
    function warehouseFld() {
        var label = '<label style="font-size:11px;color:#64748B;">Destination Warehouse</label>';
        var curId = String(s.warehouseId || '').trim();
        var curCode = String(s.warehouseCode || '').trim();
        if (!fieldsEditable) {
            var disp = curCode ? (curCode + (curId ? ' (' + curId + ')' : '')) : (curId || '');
            return '<div style="display:flex;flex-direction:column;gap:2px;">' + label +
                '<div style="padding:5px 0;font-size:13px;color:#1E293B;">' + (_shEsc(disp) || '--') + '</div></div>';
        }
        var all = _shGetWarehouses();
        var company = String(s.company || '').trim();
        var country = String(s.country || '').trim();
        function eq(a, b) { return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase(); }
        // Eligibility (§22.G v1 fallback): exclude explicitly inactive + factory warehouses. A null flag
        // (column absent from the sheet) is NOT treated as inactive — don't hide rows a sheet never flags.
        var eligible = all.filter(function(w) {
            if (w.isActive === false) return false;
            if (w.isFactoryWarehouse === true) return false;
            return true;
        });
        // Company + country scoping — applied only when BOTH sides carry the value, so a sheet missing a
        // column never silently drops every candidate. Never widen scope to another company/country (§22.0K).
        function scoped(w) {
            if (company && w.company && !eq(w.company, company)) return false;
            if (country && w.country && !eq(w.country, country)) return false;
            return true;
        }
        // §22.0(F) FBA: warehouse_type=FBA AND warehouse marketplace='Amazon' (the operator marketplace,
        // spec-mandated — NOT literal equality to the shipment's marketplace account) within company/country.
        var fba = eligible.filter(function(w) { return eq(w.warehouseType, 'FBA') && eq(w.marketplace, 'Amazon') && scoped(w); });
        // §22.0(G) 3PL: warehouse_type=3PL within company/country scope; marketplace MAY be blank (not required).
        var tpl = eligible.filter(function(w) { return eq(w.warehouseType, '3PL') && scoped(w); });
        // §22.0(H) deterministic order within each group: logistics_region -> warehouse_code.
        function ordr(a, b) {
            var r = String(a.logisticsRegion || '').localeCompare(String(b.logisticsRegion || ''));
            return r !== 0 ? r : String(a.warehouseCode || '').localeCompare(String(b.warehouseCode || ''));
        }
        fba.sort(ordr); tpl.sort(ordr);
        function optOf(w) {
            var disp = [w.warehouseCode, w.warehouseName, [w.city, w.state].filter(Boolean).join('/')].filter(Boolean).join(' — ');
            return '<option value="' + _shEsc(w.warehouseId) + '" data-code="' + _shEsc(w.warehouseCode) + '"' +
                (eq(w.warehouseId, curId) ? ' selected' : '') + '>' + _shEsc(disp || w.warehouseId) + '</option>';
        }
        var inList = {};
        fba.concat(tpl).forEach(function(w) { if (w.warehouseId) inList[w.warehouseId] = true; });
        var groups = '';
        if (fba.length) groups += '<optgroup label="FBA">' + fba.map(optOf).join('') + '</optgroup>';
        if (tpl.length) groups += '<optgroup label="3PL">' + tpl.map(optOf).join('') + '</optgroup>';
        // Preserve a selection that falls outside the current candidate scope (legacy row / scope changed)
        // so Save never silently discards it. Shown but clearly flagged.
        var curExtra = '';
        if (curId && !inList[curId]) {
            var cw = all.filter(function(w) { return eq(w.warehouseId, curId); })[0];
            var cdisp = cw ? [cw.warehouseCode, cw.warehouseName].filter(Boolean).join(' — ') : (curCode ? (curCode + ' (' + curId + ')') : curId);
            curExtra = '<optgroup label="Current selection (outside current filter)"><option value="' + _shEsc(curId) +
                '" data-code="' + _shEsc(cw ? cw.warehouseCode : curCode) + '" selected>' + _shEsc(cdisp) + '</option></optgroup>';
        } else if (!curId && curCode) {
            // Legacy row: warehouse_code present, no warehouse_id. Preserve as a visible selected option
            // (empty value). Picking a real candidate replaces it and fills warehouse_id.
            curExtra = '<optgroup label="Current (legacy, no warehouse_id)"><option value="" data-code="' + _shEsc(curCode) +
                '" selected>' + _shEsc(curCode) + '</option></optgroup>';
        }
        var hasCandidates = (fba.length + tpl.length) > 0;
        var phLabel = hasCandidates ? '-- Select warehouse --' : ((curId || curCode) ? '-- Clear selection --' : 'No eligible warehouse found');
        var placeholder = '<option value="" data-code="">' + _shEsc(phLabel) + '</option>';
        var sel = '<select class="sh-exec-input" data-field="warehouse_id" onchange="shWarehousePick(\'' + _shEsc(sid) + '\')" ' +
            'style="width:100%;padding:5px 8px;border:1px solid #CBD5E1;border-radius:4px;font-size:13px;box-sizing:border-box;">' +
            placeholder + curExtra + groups + '</select>';
        // Hidden mirror — warehouse_code is COPIED from the chosen option so _shCollectExec persists BOTH
        // warehouse_id and warehouse_code (identity + snapshot).
        var hidden = '<input type="hidden" data-field="warehouse_code" id="sh-whcode-' + _shEsc(sid) + '" value="' + _shEsc(curCode) + '">';
        var help = hasCandidates ? '' : '<div style="font-size:11px;color:#DC2626;margin-top:3px;">No active warehouse for this company / country. Set the shipment context, or add a warehouse in Warehouse Master.</div>';
        return '<div style="display:flex;flex-direction:column;gap:2px;">' + label + sel + hidden + help + '</div>';
    }
    var execGrid =
        '<div style="font-size:11px;color:#94A3B8;margin-bottom:8px;">Internal ID: ' + _shEsc(sid) + ' <span style="color:#CBD5E1;">(system, not editable)</span></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;">' +
            fld('Shipment ID (external)', 'external_shipment_id', s.externalShipmentId) +
            roField('Carrier (from plan)', s.carrierId) +
            customsFld() +
            fld('Reference ID', 'reference_id', s.referenceId) +
            warehouseFld() +
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
    // F1-7N-FB-1(D) — SIMPLIFIED LIFECYCLE. Confirm Shipment is the ONE user action; after it the shipment
    // is `shipped`, immediately map-visible, and progresses to `in_transit` automatically from the first
    // authoritative Current Position update (31_shipPromoteOnProgress_). `received` stays owned by the formal
    // receiving/inventory workflow. Every manual lifecycle-mutating control is therefore REMOVED here:
    //   · Shipment Draft   'Done'                (it mutated shipped -> hidden/next lifecycle)
    //   · Shipment Overview 'Advance -> <next>'  (it manually walked the post-ship lifecycle)
    // Expand/Collapse and the document actions remain. Once shipped, Shipment Draft is a read-only
    // shipment-and-document view: no further shipment-progress button is offered.
    if (mode === 'draft') {
        if (status === 'draft') {
            actionsHtml = btn("shSaveExecution('" + sid + "')", 'Save', '#10B981') +
                          btn("shReadyToShip('" + sid + "')", 'Ready to Ship →', '#3B82F6');
        } else if (status === 'ready_to_ship') {
            actionsHtml = btn("shSaveExecution('" + sid + "')", 'Save', '#10B981') +
                          btn("shConfirmShipment('" + sid + "')", 'Confirm Shipment 🚢', '#0EA5E9') +
                          btn("shReturnToDraft('" + sid + "')", '← Return to Draft', '#94A3B8');
        }
        // status === 'shipped' (and later): NO lifecycle button — progress is event-derived.
    } else {
        // F1-6B Part B — Shipping Detail / Packing List documents for a dispatched shipment (the frozen R2B snapshot
        // exists). Thin: the frontend only sends { shipment_id, document_type, generate_file } and opens the returned
        // download_url via the existing R3C adapters — NO placeholder mapping / totals / template / master / file build.
        if (SH_DOC_READY_STATUSES[status]) actionsHtml += _shDocActionsHtml(sid);
    }
    // F1-7N-FB-1(J) — the shared Document Panel, in the right-side detail column directly below the
    // Execution Fields, for BOTH pages. It reads ONLY backend registry metadata already attached to the
    // shipment view-model; a shipment with none (e.g. a Demo row with a blank external_shipment_id)
    // truthfully renders "No documents generated yet" rather than a fabricated folder or file.
    // Shown once documents can exist: post-dispatch, or as soon as the registry has any row for this shipment.
    // A pre-dispatch draft stays clean rather than showing an empty panel it can do nothing about.
    if ((status !== 'draft' && status !== 'ready_to_ship') || (s.documents && s.documents.length)) {
        actionsHtml += shDocumentPanelHtml({
            title: 'Shipment Documents', entity_type: 'shipment', entity_id: sid,
            folder_url: s.documentFolderUrl || '', folder_name: s.documentFolderName || '',
            folder_error: s.documentFolderError || '',
            documents: s.documents || [], pending: !!s.documentsPending,
            generation_status: s.documentGenerationStatus || '', error: s.documentGenerationError || null,
            can_retry: s.canRetryDocuments === true
        });
    }

    return '' +
    '<div class="history-card" id="sh-card-' + _shEsc(sid) + '" style="border:1px solid #E2E8F0;border-radius:8px;background:#fff;margin-bottom:12px;">' +
        '<div class="history-card-header" style="padding:16px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;" onclick="toggleShipmentCard(\'' + _shEsc(sid) + '\', event)">' +
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
                '<button type="button" class="history-expand-btn" aria-expanded="false" style="padding:6px 12px;border:1px solid #E2E8F0;border-radius:4px;background:#fff;cursor:pointer;font-size:13px;color:#3B82F6;" onclick="event.stopPropagation();toggleShipmentCard(\'' + _shEsc(sid) + '\', event)">Expand</button>' +
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

// V3G6A - THE ONE canonical Expand/Collapse for every shipment card (Shipment Draft AND Shipment Overview).
// ROOT CAUSE it fixes: a `shipped` shipment is rendered by BOTH pages - SH_DRAFT_STATUSES contains 'shipped'
// and SH_OVERVIEW_STATUSES.shipped is 1 - and _shRenderDbCard stamps the SAME DOM id `sh-card-<shipment_id>`
// in both. #shippinghistory-mount precedes #shipment-draft-mount in index.html, so the old
// document.getElementById('sh-card-' + id) ALWAYS resolved to the Overview card. Clicking Expand on a
// Shipment Draft > Shipped card therefore toggled that other (hidden) card and produced no visible response,
// while Overview (which matched itself) worked and Draft / Ready-to-Ship (ids unique to that page) worked.
// It was never CSS, never a missing listener and never a stale closure. The fix resolves the card from the
// CLICKED node's own subtree, so a click can only ever toggle its own card, and adds the aria-expanded sync
// the buttons were missing. Toggling is pure DOM: it never touches shipment status, DB data or any action.
function _shToggleCardEl(card) {
    if (!card) return null;
    var details = card.querySelector('.history-card-details');
    if (!details) return null;
    var btn = card.querySelector('.history-expand-btn');
    var isOpen = details.style.display !== 'none';   // inline display:none is the collapsed default
    details.style.display = isOpen ? 'none' : 'block';
    if (btn) {
        btn.textContent = isOpen ? 'Expand' : 'Collapse';
        btn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
    }
    return !isOpen;
}
// Resolve the card OWNING the click. The legacy id lookup remains only as the fallback for a programmatic
// call with no event, so no existing caller loses behaviour.
function _shCardFromEvent(evt, shipmentId, idPrefix) {
    var src = evt && (evt.currentTarget || evt.target);
    if (src && src.closest) { var owned = src.closest('.history-card'); if (owned) return owned; }
    return document.getElementById(idPrefix + shipmentId);
}
function toggleShipmentCard(shipmentId, evt) {
    return _shToggleCardEl(_shCardFromEvent(evt, shipmentId, 'sh-card-'));
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

// ============================================================================================================
// F1-6B-PHASE1-E2E-PRE-CLOSURE-R1 Part B — Shipment Document (Shipping Detail / Packing List) last-mile UI.
// A COMPACT Generate / Download group on the dispatched-shipment overview card. The frontend stays THIN: it sends
// only { shipment_id, document_type, generate_file:true } to the canonical R3C backend (KM.DB.generateShipmentDocument)
// and opens the returned download_url (KM.DB.openGeneratedDocument). It performs NO placeholder mapping, totals,
// template selection/version, master lookup, PO aggregation, FIFO, or file/PDF construction — the backend owns all of
// it. Only SHIPDETAIL + PL are exposed here; Customs / CI / Booking are NOT (Customs stays LEGAL_IMPORTER_AUTHORITY_GAP
// on the backend and is never surfaced as ready). Double-click is guarded here (button disabled in-flight) AND the
// backend is idempotent (reuse-by-key), so no duplicate document is created.
// ============================================================================================================
var _shDocResultCache = {};   // shipmentId|docType → last successful generate envelope (for the Download/Open link)
var SH_DOC_TYPES = { SHIPDETAIL: 'Shipping Detail', PL: 'Packing List' };

// Compact document action group (rendered inside the overview card's action area). Inline-styled to match the card's
// existing per-shipment controls; the rows flex-wrap so a narrow screen never overflows.
// ============================================================================================
// F1-7N-FB-1(J/K) — THE ONE REUSABLE DOCUMENT PANEL.
// Shared by the Shipment Draft card, the Shipment Overview card and the Purchase Order Workspace card, so
// all three render the identical contract instead of three divergent lists. Placement is the right-side
// detail column, directly below the Execution Fields / PO execution summary.
//
// Rules it enforces (asserted by tests):
//   · NEVER renders a raw Drive URL as body text — a URL only ever becomes the href of a labelled link.
//   · Links open in a new tab with rel="noopener noreferrer".
//   · It renders ONLY backend-provided metadata from the generated_documents registry. It never queries
//     Drive from the browser and never enumerates a folder.
//   · Download is offered ONLY when the record carries a real downloadable artifact; there is no
//     "Download All" because no backend ZIP artifact exists.
//   · Retry is offered ONLY for a failed/retryable record AND only when the caller passes can_retry
//     (frontend visibility is not authorization — the backend re-checks).
//   · Every state is truthful: a shipment with no generated documents says so rather than implying files.
// ============================================================================================
var SH_DOC_PANEL_VISIBLE_ROWS_ = 5;   // compact by default; "View all (N)" reveals the rest
// F1-7N-FB-1B §Q — the full truthful state set. The tokens are produced by the ONE backend interpretation owner
// (dgsBatchState_ in 39_) so the API, the diagnostics and this panel can never disagree about what happened.
var SH_DOC_STATE_LABEL_ = {
    NONE: 'No documents generated yet',
    CHECKING: 'Checking readiness…',
    PENDING: 'Generation pending',
    GENERATING: 'Generating…',
    CONFIGURATION_REQUIRED: 'Configuration required',
    PARTIAL: 'Partially generated',
    READY: 'Ready',
    FAILED: 'Failed — action required',
    CONFIRMED_RETRY_REQUIRED: 'Shipment confirmed — document retry required',
    CONFIG_CONFLICT: 'Document folder configuration conflict'
};
// States that must read as a problem rather than as progress.
var SH_DOC_ALERT_STATE_ = { CONFIGURATION_REQUIRED: 1, FAILED: 1, CONFIRMED_RETRY_REQUIRED: 1, CONFIG_CONFLICT: 1 };
// Derive the panel state from the registry rows + folder resolution. Pure and total: an unknown mix is
// reported as PARTIAL rather than optimistically READY.
function shDocPanelState(model) {
    model = model || {};
    // The backend already derived this across the whole applicability manifest, so it knows something this
    // function cannot: how many documents were EXPECTED. A panel that only sees 2 rows would call them READY;
    // the backend knows 5 were required and correctly says PARTIAL. Trust it when present.
    var backend = String(model.generation_status || '').toUpperCase();
    if (backend && SH_DOC_STATE_LABEL_[backend]) return backend;
    if (model.checking) return 'CHECKING';
    if (model.folder_error) return 'CONFIG_CONFLICT';
    var docs = model.documents || [];
    if (!docs.length) return model.pending ? 'PENDING' : 'NONE';
    var ready = 0, failed = 0, running = 0;
    docs.forEach(function (d) {
        var st = String((d && d.status) || '').toUpperCase();
        if (st === 'GENERATED' || st === 'READY') ready++;
        else if (st === 'FAILED' || st === 'FAILED_RETRYABLE') failed++;
        else running++;
    });
    if (running && !failed) return ready ? 'PARTIAL' : 'GENERATING';
    if (failed && ready) return 'PARTIAL';
    if (failed) return 'FAILED';
    return ready === docs.length ? 'READY' : 'PARTIAL';
}
function _shDocIcon(docType) {
    var t = String(docType || '').toLowerCase();
    if (t.indexOf('invoice') !== -1) return '🧾';
    if (t.indexOf('packing') !== -1) return '📦';
    if (t.indexOf('carrier') !== -1 || t.indexOf('booking') !== -1) return '🚢';
    if (t.indexOf('customs') !== -1 || t.indexOf('export') !== -1 || t.indexOf('import') !== -1) return '🛃';
    return '📄';
}
// A safe new-tab link. The URL is ONLY ever an href — never rendered as visible text.
function _shDocLink(url, label, strong) {
    var u = String(url || '').trim();
    if (!u) return '';
    return '<a href="' + _shEsc(u) + '" target="_blank" rel="noopener noreferrer" ' +
        'style="font-size:12px;color:#3B82F6;text-decoration:none;' + (strong ? 'font-weight:600;' : '') + '">' + _shEsc(label) + '</a>';
}
function _shDocRowHtml(d, canRetry, entityId) {
    var st = String((d && d.status) || '').toUpperCase();
    var isFailed = (st === 'FAILED' || st === 'FAILED_RETRYABLE');
    var name = String((d && d.file_name) || '').trim();
    var actions = _shDocLink(d && d.file_url, 'Open', true);
    // Download only when a genuinely downloadable artifact exists (never a fabricated export link).
    if (d && d.download_url) actions += (actions ? ' · ' : '') + _shDocLink(d.download_url, 'Download');
    else if (d && d.pdf_file_url) actions += (actions ? ' · ' : '') + _shDocLink(d.pdf_file_url, 'Download PDF');
    if (isFailed && canRetry) {
        actions += (actions ? ' · ' : '') +
            '<button type="button" class="sh-doc-retry" onclick="shRetryDocument(\'' + _shEsc(entityId) + '\',\'' + _shEsc((d && d.generated_document_id) || '') + '\',this)" ' +
            'style="background:none;border:none;padding:0;color:#DC2626;font-size:12px;cursor:pointer;">Retry</button>';
    }
    return '<div class="sh-doc-row" style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #F1F5F9;">' +
        '<span aria-hidden="true">' + _shDocIcon(d && (d.document_type || d.template_key)) + '</span>' +
        '<span style="flex:1 1 auto;min-width:0;">' +
            '<span style="display:block;font-size:13px;color:#1E293B;">' + _shEsc((d && d.document_label) || (d && d.document_type) || 'Document') + '</span>' +
            (name ? '<span style="display:block;font-size:11px;color:#94A3B8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + _shEsc(name) + '">' + _shEsc(name) + '</span>' : '') +
        '</span>' +
        '<span style="font-size:11px;color:' + (isFailed ? '#DC2626' : '#64748B') + ';white-space:nowrap;">' +
            _shEsc(isFailed ? 'Failed' : (st === 'GENERATED' || st === 'READY' ? 'Ready' : (st || 'Pending'))) +
            ((d && d.generated_at) ? ' · ' + _shEsc(String(d.generated_at).substring(0, 16)) : '') +
        '</span>' +
        '<span style="white-space:nowrap;">' + actions + '</span>' +
    '</div>';
}
// F1-7N-FB-1B §Q — the error-assistance block. Every failure answers the same questions in the same order:
// what went wrong in plain language, the typed reason, which document, which template, which fields are missing
// and where they come from, where to fix it, and whether a retry is safe. It NEVER prints a stack trace, a
// credential or a raw Drive identifier.
var SH_DOC_REASON_HELP_ = {
    SHIPMENT_DOCUMENT_TEMPLATE_UNRESOLVED: { say: 'No active template is configured for a required document.', fix: 'Admin › Document Templates' },
    SHIPMENT_DOCUMENT_TEMPLATE_AMBIGUOUS: { say: 'More than one active template matches this shipment, so the system will not guess.', fix: 'Admin › Document Templates' },
    PO_DOCUMENT_TEMPLATE_UNRESOLVED: { say: 'No active Purchase Order template matches this factory and series.', fix: 'Admin › Document Templates' },
    PO_DOCUMENT_TEMPLATE_AMBIGUOUS: { say: 'More than one Purchase Order template matches equally, so the system will not guess.', fix: 'Admin › Document Templates' },
    DOCUMENT_REQUIRED_FIELD_MISSING: { say: 'The template requires business fields that are empty.', fix: 'Complete the fields listed below' },
    DOCUMENT_FIELD_AUTHORITY_MISSING: { say: 'The template requires a field that has no source of truth in the system yet.', fix: 'Admin › Document Templates (make the field optional, or put the value in the template)' },
    DOCUMENT_CONFIGURATION_REQUIRED: { say: 'This document cannot be produced with its current template configuration.', fix: 'Admin › Document Templates' },
    UNSUPPORTED_DESTINATION_BUCKET: { say: 'This destination country has no configured document folder.', fix: 'Shipment › Destination' },
    MISSING_EXTERNAL_SHIPMENT_ID: { say: 'The shipment has no external Shipment ID, which the folder name is built from.', fix: 'Shipment Draft › Execution Fields' },
    OUTPUT_FOLDER_ROOT_MISSING: { say: 'No output folder is configured on the template.', fix: 'Admin › Document Templates › output_folder_id' },
    OUTPUT_FOLDER_ROOT_INVALID: { say: 'The configured output folder is not a valid Drive folder ID or URL.', fix: 'Admin › Document Templates › output_folder_id' },
    OUTPUT_FOLDER_ROOT_CONFLICT: { say: 'The applicable templates point at different output folders.', fix: 'Admin › Document Templates › output_folder_id' },
    OUTPUT_FOLDER_ROOT_INACCESSIBLE: { say: 'The configured output folder could not be opened.', fix: 'Check Drive sharing for the output folder' },
    DOCUMENT_TEMPLATE_ASSET_MISSING: { say: 'The template has no template file attached.', fix: 'Admin › Document Templates › template_file_id' },
    DOCUMENT_TEMPLATE_ASSET_INACCESSIBLE: { say: 'The template file could not be opened.', fix: 'Check Drive sharing for the template file' },
    DOCUMENT_TEMPLATE_TYPE_UNSUPPORTED: { say: 'That template file type cannot be filled yet.', fix: 'Admin › Document Templates › template_file_type' },
    DOCUMENT_FILE_COPY_FAILED: { say: 'The template could not be copied into the output folder.', fix: 'Retry' },
    DOCUMENT_FILE_FILL_FAILED: { say: 'The copied file could not be filled in.', fix: 'Retry' },
    DOCUMENT_PDF_EXPORT_FAILED: { say: 'The PDF export did not complete.', fix: 'Retry' },
    SNAPSHOT_PREREQUISITE_INVALID: { say: 'The shipment snapshot the documents are built from is not available yet.', fix: 'Retry' }
};
function _shDocHelp(reason) {
    return SH_DOC_REASON_HELP_[String(reason || '').toUpperCase()] ||
        { say: 'The document could not be produced.', fix: 'Retry, or check Admin › Document Templates' };
}
function _shDocErrorHtml(model, state) {
    var err = model.error || null;
    if (!err && !model.folder_error) return '';
    var reason = String((err && err.reason) || model.folder_error || '').toUpperCase();
    var help = _shDocHelp(reason);
    var missing = (err && err.missing) || [];
    var rows = '';
    if (missing.length) {
        rows = '<div style="margin-top:5px;font-size:11px;color:#7F1D1D;">Missing: ' +
            missing.slice(0, 6).map(function (m) {
                var name = _shEsc(String((m && (m.placeholder || m.field)) || ''));
                var src = String((m && (m.data_source_path || m.data_source_field || m.source)) || '').trim();
                return name + (src ? ' <span style="color:#B91C1C;">(' + _shEsc(src) + ')</span>' : '');
            }).join(' · ') + (missing.length > 6 ? ' … +' + (missing.length - 6) : '') + '</div>';
    }
    var retryHtml = '';
    if (model.can_retry === true && (err ? err.retryable !== false : false)) {
        retryHtml = ' <button type="button" class="sh-doc-retry" onclick="shRetryDocument(\'' + _shEsc(model.entity_type || 'shipment') + '\',\'' + _shEsc(model.entity_id) + '\',this)" ' +
            'style="background:none;border:none;padding:0;color:#B91C1C;font-size:11px;text-decoration:underline;cursor:pointer;">Retry</button>';
    }
    return '<div class="sh-doc-error" style="margin-top:8px;padding:8px 10px;border:1px solid #FECACA;background:#FEF2F2;border-radius:6px;">' +
        '<div style="font-size:12px;color:#B91C1C;font-weight:600;">' + _shEsc(SH_DOC_STATE_LABEL_[state] || 'Action required') + '</div>' +
        '<div style="margin-top:3px;font-size:12px;color:#7F1D1D;">' + _shEsc(help.say) + '</div>' +
        (err && err.documentLabel ? '<div style="margin-top:4px;font-size:11px;color:#7F1D1D;">Document: <strong>' + _shEsc(err.documentLabel) + '</strong>' + (err.templateKey ? ' · Template: <code>' + _shEsc(err.templateKey) + '</code>' : '') + '</div>' : '') +
        rows +
        '<div style="margin-top:5px;font-size:11px;color:#7F1D1D;">Where to fix: ' + _shEsc(help.fix) + ' · ' +
            (reason ? '<code>' + _shEsc(reason) + '</code>' : 'unspecified') + retryHtml + '</div>' +
    '</div>';
}

// model = { title, entity_type, entity_id, folder_url, folder_name, folder_error, documents:[], pending,
//           checking, can_retry, generation_status, error }
function shDocumentPanelHtml(model) {
    model = model || {};
    var state = shDocPanelState(model);
    var docs = model.documents || [];
    var head = '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">' +
        '<div style="font-size:13px;font-weight:600;color:#1E293B;">' + _shEsc(model.title || 'Documents') + '</div>' +
        (model.folder_url ? _shDocLink(model.folder_url, 'Open Folder', true) : '') +
    '</div>';
    var body;
    if (state === 'CONFIG_CONFLICT') {
        body = '<div style="font-size:12px;color:#DC2626;">' + _shEsc(SH_DOC_STATE_LABEL_.CONFIG_CONFLICT) + ' — ' + _shEsc(model.folder_error) + '</div>';
    } else if (!docs.length) {
        body = '<div style="font-size:12px;color:#94A3B8;">' + _shEsc(SH_DOC_STATE_LABEL_[state] || SH_DOC_STATE_LABEL_.NONE) + '</div>';
    } else {
        var shown = docs.slice(0, SH_DOC_PANEL_VISIBLE_ROWS_);
        body = shown.map(function (d) { return _shDocRowHtml(d, model.can_retry === true, model.entity_id); }).join('');
        if (docs.length > shown.length) {
            body += '<button type="button" class="sh-doc-viewall" onclick="shDocViewAll(this)" aria-expanded="false" ' +
                'style="margin-top:6px;background:none;border:none;padding:0;color:#3B82F6;font-size:12px;cursor:pointer;">View all (' + docs.length + ')</button>' +
                '<div class="sh-doc-rest" style="display:none;">' + docs.slice(shown.length).map(function (d) { return _shDocRowHtml(d, model.can_retry === true, model.entity_id); }).join('') + '</div>';
        }
    }
    var alert = !!SH_DOC_ALERT_STATE_[state];
    var badge = '<span style="font-size:11px;color:' + (alert ? '#B91C1C' : '#64748B') + ';">' + _shEsc(SH_DOC_STATE_LABEL_[state] || state) + '</span>';
    return '<div class="sh-doc-panel" data-doc-state="' + _shEsc(state) + '" style="margin-top:12px;padding-top:12px;border-top:1px dashed #E2E8F0;">' +
        head + body + _shDocErrorHtml(model, state) + '<div style="margin-top:6px;">' + badge + '</div>' +
    '</div>';
}
// F1-7N-FB-1B §Q/§O — Retry. It regenerates ONLY the missing/failed documents: the backend reuses every
// already-generated output, so a retry can never duplicate a folder, a file, a PDF or a registry row, and it
// never re-runs the business transition. Frontend visibility is not authorization — the backend re-checks.
function shRetryDocument(entityType, entityId, btnEl) {
    var db = window.KM && window.KM.DB;
    if (!db || typeof db.retryDocumentGeneration !== 'function') return;
    if (btnEl) { if (btnEl.disabled) return; btnEl.disabled = true; btnEl.textContent = 'Retrying…'; }
    return Promise.resolve(db.retryDocumentGeneration(entityType || 'shipment', entityId)).then(function (res) {
        if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Retry'; }
        if (res && res.success) { _shLoadAndRender(); return; }
        var reason = (res && (res.error || (res.result && res.result.reason))) || 'Retry failed';
        if (btnEl) { btnEl.style.color = '#B91C1C'; btnEl.textContent = 'Retry failed'; btnEl.title = String(reason); }
    }).catch(function () {
        if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Retry'; }
    });
}
function shDocViewAll(btnEl) {
    var panel = btnEl && btnEl.closest ? btnEl.closest('.sh-doc-panel') : null;
    if (!panel) return;
    var rest = panel.querySelector('.sh-doc-rest');
    if (!rest) return;
    var open = rest.style.display !== 'none';
    rest.style.display = open ? 'none' : 'block';
    btnEl.setAttribute('aria-expanded', open ? 'false' : 'true');
}

function _shDocActionsHtml(sid) {
    function row(docType, label) {
        var base = 'sh-doc-' + _shEsc(sid) + '-' + docType;
        return '<div class="sh-doc-row" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px;">' +
                   '<span style="font-size:13px;color:#334155;min-width:96px;">' + _shEsc(label) + '</span>' +
                   '<button id="' + base + '-gen" onclick="shGenerateShipmentDoc(\'' + _shEsc(sid) + '\',\'' + docType + '\',this)" ' +
                       'style="background:#6366F1;color:#fff;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;font-size:13px;">Generate</button>' +
                   '<span id="' + base + '-status" style="font-size:12px;color:#64748B;"></span>' +
               '</div>';
    }
    return '<div class="sh-doc-actions" style="margin-top:12px;padding-top:12px;border-top:1px dashed #E2E8F0;">' +
               '<div style="font-size:13px;font-weight:600;color:#1E293B;margin-bottom:2px;">Documents</div>' +
               row('SHIPDETAIL', SH_DOC_TYPES.SHIPDETAIL) +
               row('PL', SH_DOC_TYPES.PL) +
           '</div>';
}

// Map a fail-closed backend code to a short human label (never fabricates readiness).
function _shDocErrLabel(reason) {
    var r = String(reason || '');
    if (/ASSET_TYPE_UNSUPPORTED/.test(r)) return 'Template type unsupported';
    if (/ASSET_MISSING|TEMPLATE_NOT_CONFIGURED|TEMPLATE_AMBIGUOUS/.test(r)) return 'Template not configured';
    if (/REQUIRED_FIELD_GAP|NOT_READY|READINESS|SNAPSHOT/i.test(r)) return 'Not ready';
    return 'Error: ' + r;
}

// Generate (Shipping Detail | Packing List) via the canonical R3C backend, then surface Download/Open. States:
// Generating… → Generated/Ready (+Download link, button becomes Regenerate) | a fail-closed reason. Double-click safe.
function shGenerateShipmentDoc(shipmentId, docType, btnEl) {
    var db = window.KM && window.KM.DB;
    var statusEl = document.getElementById('sh-doc-' + shipmentId + '-' + docType + '-status');
    if (!db || typeof db.generateShipmentDocument !== 'function') {
        if (statusEl) { statusEl.style.color = '#DC2626'; statusEl.textContent = 'Unavailable'; }
        return;
    }
    if (btnEl) { if (btnEl.disabled) return; btnEl.disabled = true; }   // §B11 double-click guard (backend also idempotent)
    if (statusEl) { statusEl.style.color = '#64748B'; statusEl.textContent = 'Generating…'; }
    return Promise.resolve(db.generateShipmentDocument({ shipment_id: shipmentId, document_type: docType, generate_file: true })).then(function (res) {
        if (btnEl) btnEl.disabled = false;
        if (res && res.success && (res.download_url || res.pdf_file_url || res.file_url)) {
            _shDocResultCache[shipmentId + '|' + docType] = res;
            if (btnEl) btnEl.textContent = 'Regenerate';
            if (statusEl) {
                statusEl.style.color = '#059669';
                statusEl.innerHTML = (res.reused ? 'Ready · ' : 'Generated · ') +
                    '<a href="#" onclick="return shOpenShipmentDoc(\'' + _shEsc(shipmentId) + '\',\'' + docType + '\')" style="color:#2563EB;text-decoration:underline;">Download / Open</a>';
            }
        } else {
            var reason = (res && (res.reason || res.error)) || 'Not ready';
            if (statusEl) { statusEl.style.color = '#DC2626'; statusEl.textContent = _shDocErrLabel(reason); }
        }
    }).catch(function () {
        if (btnEl) btnEl.disabled = false;
        if (statusEl) { statusEl.style.color = '#DC2626'; statusEl.textContent = 'Error'; }
    });
}

// Open/download the last generated document result (presentation only — the frontend builds no content).
function shOpenShipmentDoc(shipmentId, docType) {
    var db = window.KM && window.KM.DB, res = _shDocResultCache[shipmentId + '|' + docType];
    if (db && res && typeof db.openGeneratedDocument === 'function') db.openGeneratedDocument(res);
    return false;
}

// Confirm Shipment (2026-07-24) — the canonical dispatch action. Validates client-side, persists the
// current field edits (Save), then calls the SINGLE backend orchestration `confirmShipmentAndDispatch`
// which finalizes the Formal Shipment (in_transit) + snapshots shipment_routes + creates the initial
// shipment_event + deducts factory_stock atomically & idempotently. Opens a confirm modal first; the
// button disables while confirming; on success shows the structured result + "View On the Way".
function shConfirmShipment(shipmentId) {
    var cartonV = _shValidateCartons(shipmentId, true);
    if (!cartonV.ok) { alert('Cannot Confirm — ' + cartonV.error); return; }
    var payload = _shCollectExec(shipmentId);
    var box = document.getElementById('sh-exec-' + shipmentId);
    var totalQty = box ? (parseFloat(box.getAttribute('data-total-qty')) || 0) : 0;
    var missing = [];
    if (!String(payload.external_shipment_id || '').trim()) missing.push('Shipment ID (external)');
    if (!String(payload.reference_id || '').trim()) missing.push('Reference ID');
    if (!String(payload.warehouse_code || '').trim()) missing.push('Warehouse Code');
    if (!String(payload.carrier_id || '').trim()) missing.push('Carrier');
    if (!String(payload.shipping_method || '').trim()) missing.push('Shipping Method');
    if (!String(payload.etd || '').trim()) missing.push('ETD');
    if (!String(payload.eta || '').trim()) missing.push('ETA');
    if (totalQty <= 0) missing.push('Total Qty');
    if (missing.length) { alert('Cannot Confirm — please complete:\n\n• ' + missing.join('\n• ')); return; }

    var s = _shGetShipments().filter(function (x) { return x.shipmentId === shipmentId; })[0] || {};
    var lines = _shGetShipmentLines().filter(function (l) { return l.shipmentId === shipmentId; });
    var units = lines.reduce(function (a, l) { return a + (l.shipmentQty || l.qty || 0); }, 0);
    _shOpenConfirmModal(shipmentId, {
        no: s.externalShipmentId || s.shipmentNo || shipmentId,
        lineCount: lines.length, units: units,
        origin: payload.ship_from || s.shipFrom || '—',
        dest: (s.destination || payload.warehouse_code || s.warehouseId || '—'),
        carrier: payload.carrier_id || s.carrierId || '—',
        method: s.shippingMethodDisplay || payload.shipping_method || s.shippingMethod || '—',
        tracking: payload.tracking_number || s.trackingNumber || '—',
        container: payload.container_no || s.containerNo || '—',
        etd: payload.etd || s.etd || '—', eta: payload.eta || s.eta || '—'
    }, payload);
}

function _shCloseConfirmModal() {
    var o = document.getElementById('sh-confirm-overlay'); if (o) o.remove();
    var m = document.getElementById('sh-confirm-modal'); if (m) m.remove();
}
function _shOpenConfirmModal(shipmentId, sum, execPayload) {
    _shCloseConfirmModal();
    var overlay = document.createElement('div');
    overlay.id = 'sh-confirm-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.45);z-index:2000;';
    overlay.addEventListener('click', _shCloseConfirmModal);
    document.body.appendChild(overlay);
    var modal = document.createElement('div');
    modal.id = 'sh-confirm-modal';
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-label', 'Confirm Shipment');
    modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:2001;background:#fff;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,0.25);width:460px;max-width:94vw;max-height:90vh;overflow-y:auto;padding:20px 22px;font-size:13px;color:#1E293B;';
    function row(k, v) { return '<div style="display:flex;justify-content:space-between;gap:12px;padding:3px 0;border-bottom:1px solid #F1F5F9;"><span style="color:#64748B;">' + _shEsc(k) + '</span><strong>' + _shEsc(v) + '</strong></div>'; }
    modal.innerHTML =
        '<h3 style="margin:0 0 10px;font-size:16px;">Confirm Shipment</h3>' +
        row('Shipment No.', sum.no) + row('Lines / Total Units', sum.lineCount + ' / ' + (sum.units || 0).toLocaleString()) +
        row('Origin → Destination', sum.origin + ' → ' + sum.dest) + row('Carrier', sum.carrier) + row('Shipping Method', sum.method) +
        row('Tracking / Container', sum.tracking + ' / ' + sum.container) + row('ETD / ETA', sum.etd + ' / ' + sum.eta) +
        '<div style="background:#FFFBEB;border:1px solid #FDE68A;color:#92400E;border-radius:6px;padding:8px 10px;margin:12px 0;font-size:12px;line-height:1.5;">' +
          'On confirm: the shipment becomes <strong>Shipped</strong>; Factory Stock is <strong>deducted</strong> (canonical movements); the Shipment <strong>Route</strong> and an <strong>initial Event</strong> are created; the applicable <strong>documents</strong> are then generated into Drive. ' +
          'It moves to <strong>In Transit</strong> by itself on the first real progress beyond the origin. Required documents are checked <strong>before</strong> anything is written — if that check fails the shipment stays Ready to Ship.</div>' +
        '<div id="sh-confirm-status" role="status" aria-live="polite" style="min-height:18px;font-size:12.5px;margin:6px 0;"></div>' +
        '<div id="sh-confirm-actions" style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">' +
          '<button type="button" id="sh-confirm-cancel" style="padding:7px 14px;border:1px solid #CBD5E1;background:#fff;border-radius:6px;cursor:pointer;">Cancel</button>' +
          '<button type="button" id="sh-confirm-go" style="padding:7px 14px;border:0;background:#0EA5E9;color:#fff;border-radius:6px;cursor:pointer;font-weight:600;">Confirm &amp; Dispatch</button>' +
        '</div>';
    document.body.appendChild(modal);
    document.getElementById('sh-confirm-cancel').addEventListener('click', _shCloseConfirmModal);
    document.getElementById('sh-confirm-go').addEventListener('click', function () { _shRunConfirm(shipmentId, execPayload); });
}
function _shRunConfirm(shipmentId, execPayload) {
    var go = document.getElementById('sh-confirm-go');
    var cancel = document.getElementById('sh-confirm-cancel');
    var status = document.getElementById('sh-confirm-status');
    if (!go) return;
    go.disabled = true; go.textContent = 'Confirming…'; if (cancel) cancel.disabled = true;
    if (status) { status.style.color = '#0369a1'; status.textContent = 'Persisting fields…'; }
    // 1) Persist the card's field edits (Save; no status change). 2) R3C — reconcile canonical DRAFT PO allocations
    // from the just-persisted shipment_lines (ONE shipment-scoped call to the R3A authority; NO frontend FIFO /
    // capacity math). 3) Single atomic dispatch command (R3B executes draft→executed + reconciles shipped_qty).
    Promise.resolve(window.KM.DB.updateShipment(execPayload)).then(function () {
        if (status) status.textContent = 'Preparing PO allocation…';
        return window.KM.DB.generateShipmentLineAllocations({ shipment_id: shipmentId, actor: 'operation-system' });
    }).then(function (alloc) {
        // R3C §6 — allocation readiness gate (UX only; R3B remains the in-lock execution authority). Fail closed:
        // the physical shipment draft stays saved, but dispatch does NOT proceed until PO allocation is valid.
        if (!alloc || alloc.success === false) {
            var aerr = (alloc && alloc.error) || 'Allocation could not be prepared';
            var d0 = (alloc && alloc.detail) || {};
            var shortfall = (d0.shortage_qty != null) ? (' — need ' + d0.shipment_qty + ', available ' + d0.available_capacity + ', short ' + d0.shortage_qty) : '';
            if (status) { status.style.color = '#b91c1c'; status.innerHTML = '<strong>PO Allocation — Needs Attention:</strong> ' + _shEsc(aerr) + _shEsc(shortfall) + '.<br>The shipment draft is saved; resolve PO capacity before dispatching.'; }
            go.disabled = false; go.textContent = 'Confirm & Dispatch'; if (cancel) cancel.disabled = false;
            throw { _handled: true };   // stop the chain WITHOUT dispatching
        }
        if (status) status.textContent = 'PO allocation ready — confirming & dispatching…';
        return window.KM.DB.confirmShipmentAndDispatch({ shipment_id: shipmentId, actor: 'operation-system' });
    }).then(function (res) {
        if (!res || res.success === false) {
            var stage = (res && res.stage) ? (' [' + res.stage + ']') : '';
            // D1 — a pre-dispatch document readiness failure. Nothing was written; explain each blocker in the
            // same plain-language form the Document Panel uses, so the user can act without reading codes.
            if (res && res.stage === 'document_readiness') {
                var bl = (res.blockers || []).slice(0, 4).map(function (b) {
                    var h = _shDocHelp(b && b.reason);
                    return '<li style="margin-top:3px;">' + _shEsc(h.say) + ' <span style="color:#7F1D1D;">(' + _shEsc(String((b && b.reason) || '')) + (b && b.class_key ? ' · ' + _shEsc(b.class_key) : '') + ')</span><br>' +
                        '<span style="font-size:11px;">Where to fix: ' + _shEsc((b && b.correction) || h.fix) + '</span></li>';
                }).join('');
                if (status) {
                    status.style.color = '#b91c1c';
                    status.innerHTML = '<strong>Cannot Confirm — required documents are not ready.</strong>' +
                        '<ul style="margin:6px 0 0 16px;padding:0;font-size:12px;">' + bl + '</ul>' +
                        '<div style="margin-top:6px;font-size:11.5px;color:#7F1D1D;">The shipment stays <strong>Ready to Ship</strong>. Nothing was written and no Drive folder or file was created.</div>';
                }
                go.disabled = false; go.textContent = 'Confirm & Dispatch'; if (cancel) cancel.disabled = false;
                return;
            }
            if (status) { status.style.color = '#b91c1c'; status.textContent = 'Confirm failed' + stage + ': ' + ((res && res.error) || 'Unknown error') + ' — shipment_id: ' + shipmentId; }
            go.disabled = false; go.textContent = 'Confirm & Dispatch'; if (cancel) cancel.disabled = false;
            return;
        }
        var d = res.data || {};
        var already = res.already_confirmed ? ' (already confirmed — no duplicate writes)' : '';
        if (status) status.style.color = '#166534';
        var actions = document.getElementById('sh-confirm-actions');
        var dg = d.document_generation || {};
        // D2 — a document failure NEVER un-ships a confirmed shipment. Say exactly that, and offer the retry.
        var docLine = '';
        if (dg.status === 'READY') {
            docLine = '<br>Documents: <strong>' + ((dg.generated || 0) + (dg.reused || 0)) + ' of ' + (dg.expected || 0) + '</strong> ready' +
                (dg.folder_url ? ' · <a href="' + _shEsc(dg.folder_url) + '" target="_blank" rel="noopener noreferrer" style="color:#2563EB;">Open Folder</a>' : '');
        } else if (dg.status === 'RETRY_REQUIRED') {
            docLine = '<br><span style="color:#B45309;"><strong>Shipment was confirmed successfully, but one or more documents were not generated. The shipment remains Shipped.</strong> ' +
                'Retry document generation from the shipment card.</span>';
        }
        if (status) status.innerHTML = '<strong>Confirmed' + already + '.</strong><br>Shipment <code>' + _shEsc(d.shipment_id || shipmentId) + '</code> → <strong>' + _shEsc(d.status || 'shipped') + '</strong><br>' +
            'Route initialized: ' + (d.route_nodes_created != null ? d.route_nodes_created : '—') + ' node(s) · Initial Event created: ' + (d.events_created != null ? d.events_created : '—') + ' · Stock movements: ' + (d.stock_movements_created != null ? d.stock_movements_created : '—') +
            docLine;
        if (actions) {
            actions.innerHTML = '<button type="button" id="sh-confirm-close" style="padding:7px 14px;border:1px solid #CBD5E1;background:#fff;border-radius:6px;cursor:pointer;">Close</button>' +
                '<button type="button" id="sh-confirm-view" style="padding:7px 14px;border:0;background:#0080bb;color:#fff;border-radius:6px;cursor:pointer;font-weight:600;">View On the Way</button>';
            document.getElementById('sh-confirm-close').addEventListener('click', function () { _shCloseConfirmModal(); _shLoadAndRender(); });
            document.getElementById('sh-confirm-view').addEventListener('click', function () {
                _shCloseConfirmModal();
                window._glmPendingSelect = d.shipment_id || shipmentId;   // runtime page auto-selects it on mount
                if (typeof showSection === 'function') showSection('global-logistics-map');
            });
        }
    }).catch(function (err) {
        if (err && err._handled) return;   // R3C allocation-readiness block already surfaced its own message
        if (status) { status.style.color = '#b91c1c'; status.textContent = 'Confirm failed: ' + (err && err.message ? err.message : err) + ' — shipment_id: ' + shipmentId; }
        go.disabled = false; go.textContent = 'Confirm & Dispatch'; if (cancel) cancel.disabled = false;
    });
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

// Warehouse Picker onchange: copy the selected warehouse's code (data-code) into the hidden
// warehouse_code mirror so _shCollectExec persists BOTH warehouse_id (identity) and warehouse_code
// (snapshot). warehouse_code is never independently typed. Selecting the blank placeholder clears both.
function shWarehousePick(shipmentId) {
    var box = document.getElementById('sh-exec-' + shipmentId);
    if (!box) return;
    var sel = box.querySelector('select[data-field="warehouse_id"]');
    var hidden = document.getElementById('sh-whcode-' + shipmentId);
    if (!sel || !hidden) return;
    var opt = sel.options[sel.selectedIndex];
    hidden.value = opt ? (opt.getAttribute('data-code') || '') : '';
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
window.shDocumentPanelHtml = shDocumentPanelHtml;
window.shDocPanelState = shDocPanelState;
window.shDocViewAll = shDocViewAll;
window.shRetryDocument = shRetryDocument;
window._shToggleCardEl = _shToggleCardEl;
window._shCardFromEvent = _shCardFromEvent;
window.shSaveExecution = shSaveExecution;
window.shReadyToShip = shReadyToShip;
window.shShip = shShip;
window.shConfirmShipment = shConfirmShipment;
window.shReturnToDraft = shReturnToDraft;
window.shShipmentDone = shShipmentDone;
window.shWarehousePick = shWarehousePick;
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
