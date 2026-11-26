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

// S2-R4B — "SHIPPING HISTORY" IS NOT AN ENTITY, AND THIS FUNCTION WAS THE LAST PLACE THAT THOUGHT IT WAS.
//
// SHIPMENT_CENTER_SPEC is unambiguous: Shipment Overview is a STATUS-FILTERED VIEW over shipments /
// shipment_lines (§ "IMPLEMENTED / runtime-aligned"), and "Future On The Way / world map must read from
// the same shipment data source, not create a parallel DB". There is no shipping_history table anywhere
// in the repository — not in Apps Script, not in the schema map, not in any spec. The canonical read is
// already built, already scoped, and already fail-closed: _shRefresh_ -> getWorkspace('shipment') ->
// adaptShipmentWorkspace, and on failure _shRenderError_ nulls the read model and shows a typed banner
// rather than falling back to anything.
//
// WHAT WAS STILL WRONG WAS THE ASYMMETRY. The render was gated on _shUseDb(); this LOAD was not. So on
// every Shipment Overview entry, in production, the page pulled a sessionStorage array — or, failing
// that, the 90-line shippingHistoryMockData demo fixture — into historyState.data and held it as
// business state. One boolean stood between a demo dataset and the operator's history screen, and the
// rows it would have drawn are fabrications: the writer that fills that key (markAsDone in
// shipping-plan.js) computes totalCost from a HARDCODED unitCost of 2.5 and a unitsPerCarton read out
// of replenishmentMockData. Invented money, one browser tab wide.
//
// Demo mode is a legitimate mode and keeps working exactly as before. What no longer happens is
// production loading demo shipments into business state at all — an authority that is merely unrendered
// is still an authority, and this is the round that stops it being loaded rather than stops it winning.
function loadHistoryData() {
    // Canonical mode: the shipment workspace owns this page. Nothing local is business data here, and an
    // empty array is the honest starting point — renderShipmentOverview replaces it from the server read.
    if (_shUseDb()) { historyState.data = []; return; }
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
// SHIP-OPEN r5.4: a NEW-MODEL opening record = IMPORT_HISTORICAL with a non-blank opening_supply_mode; a blank mode is a legacy row (base display, no badge)
function _shIsNewOpening(s) { return String(s && s.recordOrigin || '').trim() === 'IMPORT_HISTORICAL' && String(s && s.openingSupplyMode || '').trim() !== ''; }
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
    mount.__kmfCtl.setOptions((vals || []).map(function (v) { return { value: v, label: key === 'method' ? _shEnumDisplay_('shippingMethod', v) : v }; }));
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
                    <span><strong>Method:</strong> ${_shEsc(_shEnumDisplay_('shippingMethod', shipment.method))}</span>
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
function _shEnumDisplay_(kind, code) {
    var d = window.KM && window.KM.display;
    return d && typeof d[kind] === 'function' ? d[kind](code) : String(code == null ? '' : code);
}

var SH_STATUS_LABEL = {
    draft: 'Draft', ready_to_ship: 'Ready to Ship', shipped: 'Shipped',
    in_transit: 'In Transit', arrived: 'Delivered / 已送達（待收貨）', partially_received: 'Partially Received', received: 'Received', closed: 'Closed',
    cancelled: 'Cancelled', stuck: 'Stuck',
    // legacy labels (still displayed if present)
    planned: 'Planned', partial_received: 'Partial Received', delivered: 'Delivered', completed: 'Completed'
};
// Execution Layer linear flow (Supply Chain Architecture v1.2 §10). Overview uses this to advance
// AFTER shipped. Draft-page transitions use the explicit Ready to Ship / Ship buttons.
// A-DELTA1 C2 item 1 (Owner 2026-11-21): ONE logistics-arrival READ MODEL for the map, its cards / summary / filter and this Overview.
// A projection only: it never writes a status, never receives, never changes supply eligibility. The rule is the map's glmArrivalNode_ and
// 31_ shipArrivalVerdict_ (single positive max sequence; last node current / completed; not a transit gateway; exact ID link: location_ref
// warehouse = destination, or the referenced / template logistics_locations row's warehouse_id = destination). A persisted `arrived` and an
// Owner-typed delivered_date count as the map counts them. DISPLAY_ONLY imports (receipt tracking without stock posting) are shown
// arrived when the route proves it, with their own wording. Loaded by index.html on every page, so the map uses it too (window.KMLogisticsArrival).
var KMLogisticsArrival = (function () {
    var GATEWAY = /port|airport|air_?cargo|seaport|harbou?r|vessel|customs|clearance|bonded|border|frontier|rail|railway|truck_?terminal|motor_?carrier|cross_?dock|terminal|hub|transship|tranship|sort_?center|sortation|consolidation|parcel|courier|carrier_?facility|centroid|waypoint|midpoint|transit_?point|gateway/i;
    var LBL = 'Delivered / 已送達（待收貨）', LBL_DO = LBL;
    function low(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
    function nodeClass(st) { st = low(st); if (/exception|delay|hold|problem|stuck|fail/.test(st)) return 'exception'; if (/current|in_progress|active|transit|ongoing/.test(st)) return 'current'; if (/complete|done|departed|arrived|received|cleared|delivered/.test(st)) return 'completed'; return 'planned'; }
    function nodeLoc(n, idx) {
        idx = idx || {}; var locById = idx.locById || {}, owners = idx.locRowsByOwner || { warehouse: {}, factory: {} }, tpl = idx.tplNodeRows || {};
        if (n.locationRefId) { var t = low(n.locationRefType);
            if (!t || t === 'logistics_location') { var l = locById[n.locationRefId]; return l ? { loc: l } : { miss: 'logistics_locations.logistics_location_id = ' + n.locationRefId }; }
            if (t === 'warehouse' || t === 'factory') { var m = (owners[t] || {})[n.locationRefId] || []; return m.length === 1 ? { loc: m[0] } : { miss: m.length ? 'logistics_locations: more than one row for ' + t + ' ' + n.locationRefId : 'logistics_locations.' + t + '_id = ' + n.locationRefId }; }
            return { miss: 'shipment_routes.location_ref_type (' + t + ' is not a known type)' }; }
        if (n.routeTemplateNodeId) { var tn = tpl[n.routeTemplateNodeId] || []; if (tn.length !== 1) return { miss: 'shipment_route_template_nodes row ' + n.routeTemplateNodeId };
            if (tn[0].logisticsLocationId) { var l2 = locById[tn[0].logisticsLocationId]; return l2 ? { loc: l2 } : { miss: 'logistics_locations.logistics_location_id = ' + tn[0].logisticsLocationId }; }
            return { miss: 'shipment_route_template_nodes.logistics_location_id (template node ' + n.routeTemplateNodeId + ')' }; }
        return { miss: 'shipment_routes.location_ref_id (and no route_template_node_id)' };
    }
    // = glmArrivalNode_ (map) = shipArrivalVerdict_ (31_)
    function verdict(nodes, dest, idx) {
        nodes = nodes || []; dest = String(dest == null ? '' : dest).trim();
        if (!nodes.length) return { arrived: false, code: 'NO_ROUTE' };
        var maxSeq = -Infinity, cnt = 0, t = null;
        for (var i = 0; i < nodes.length; i++) { var sq = nodes[i].sequenceNo; if (typeof sq !== 'number' || !isFinite(sq) || sq <= 0) return { arrived: false, code: 'ROUTE_ORDER_UNVERIFIED' }; if (sq > maxSeq) { maxSeq = sq; cnt = 1; t = nodes[i]; } else if (sq === maxSeq) cnt++; }
        if (cnt !== 1) return { arrived: false, code: 'ROUTE_ORDER_UNVERIFIED' };
        var cls = nodeClass(t.status); if (cls !== 'current' && cls !== 'completed') return { arrived: false, code: 'NOT_AT_LAST_NODE' };
        if (GATEWAY.test(String(t.nodeType || '') + ' ' + String(t.nodeCode || '') + ' ' + String(t.plannedEventType || ''))) return { arrived: false, code: 'LAST_NODE_IS_GATEWAY' };
        if (!dest) return { arrived: false, code: 'DESTINATION_WAREHOUSE_MISSING' };
        var tp = low(t.locationRefType), r = nodeLoc(t, idx);
        var ok = (tp === 'warehouse' && String(t.locationRefId || '').trim() === dest) || (!!r.loc && String(r.loc.warehouseId || '').trim() === dest);
        return ok ? { arrived: true, code: 'AT_DESTINATION' } : { arrived: false, code: 'LAST_NODE_NOT_DESTINATION', missing_field: r.miss || ('logistics_locations.warehouse_id = ' + dest + ' for the last route node') };
    }
    // = glmArrival_ (map): persisted arrived, else the route, else an Owner-typed delivered_date
    function arrivalOf(ship, nodes, idx) {
        var r = verdict(nodes, (ship && (ship.destinationWarehouseId || ship.warehouseId)) || '', idx);
        if (!r.arrived && low(ship && ship.status) === 'arrived') return { arrived: true, code: 'STATUS_ARRIVED', basis: 'shipments.status', node_code: r.code };
        if (!r.arrived && String((ship && ship.deliveredDate) || '').trim()) return { arrived: true, code: 'DELIVERED_DATE_RECORDED', basis: 'shipments.delivered_date', node_code: r.code };
        return r;
    }
    function isDisplayOnly(ship) { return String((ship && ship.recordOrigin) || '').trim() === 'IMPORT_HISTORICAL' && String((ship && ship.openingSupplyMode) || '').trim().toUpperCase() === 'DISPLAY_ONLY'; }
    // the ONE status mapping. ship: { status, recordOrigin, openingSupplyMode }; arrival: any verdict (or null = not read)
    function stateFromVerdict(ship, arrival, statusLabels) {
        var st = low(ship && ship.status), lab = statusLabels || {}, base = lab[st] || (ship && ship.status) || '—', dOnly = isDisplayOnly(ship) || !!(ship && ship.displayOnly);
        if (st === 'arrived') return { key: 'arrived', label: LBL, projected: false, basis: 'shipments.status' };
        if ((st === 'shipped' || st === 'in_transit') && arrival && arrival.arrived) return { key: 'arrived', label: dOnly ? LBL_DO : LBL, projected: true, basis: arrival.basis || 'route', code: arrival.code, display_only: dOnly };
        return { key: st, label: base, projected: false, basis: 'shipments.status', code: arrival ? arrival.code : 'NOT_READ' };
    }
    function buildIndex(routes, locations, tplNodes) {
        var nodesByShip = {}, locById = {}, owners = { warehouse: {}, factory: {} }, tpl = {};
        (routes || []).forEach(function (n) { if (n && n.shipmentId) (nodesByShip[n.shipmentId] = nodesByShip[n.shipmentId] || []).push(n); });
        (locations || []).forEach(function (l) { if (!l) return; if (l.logisticsLocationId) locById[l.logisticsLocationId] = l; if (l.warehouseId) (owners.warehouse[l.warehouseId] = owners.warehouse[l.warehouseId] || []).push(l); if (l.factoryId) (owners.factory[l.factoryId] = owners.factory[l.factoryId] || []).push(l); });
        (tplNodes || []).forEach(function (n) { if (n && n.routeTemplateNodeId) (tpl[n.routeTemplateNodeId] = tpl[n.routeTemplateNodeId] || []).push(n); });
        return { nodesByShip: nodesByShip, idx: { locById: locById, locRowsByOwner: owners, tplNodeRows: tpl } };
    }
    return { verdict: verdict, arrivalOf: arrivalOf, stateFromVerdict: stateFromVerdict, buildIndex: buildIndex, isDisplayOnly: isDisplayOnly, LABEL_ARRIVED: LBL, LABEL_ARRIVED_DISPLAY_ONLY: LBL_DO };
})();
if (typeof window !== 'undefined') window.KMLogisticsArrival = KMLogisticsArrival;
// Overview: the route / location read for the projection is a SEPARATE, lazy, read-only workspace read (include routes + locations + templates),
// issued once per Overview load and only when a shipped / in_transit row is listed. Until it lands, a DISPLAY_ONLY / not-COUNTED import row says
// so ('物流到達讀取中'); a failed read says '未能讀取' - never a guessed arrival, never 'In Transit' over a proven arrival.
var _shArrivalModel = null, _shArrivalLoading = false;
function _shArrivalStateOf_(s) {
    var A = KMLogisticsArrival, m = _shArrivalModel, imp = String((s && s.recordOrigin) || '').trim() === 'IMPORT_HISTORICAL';   // C3 L-3: every import row
    if (m && !m.failed) return A.stateFromVerdict(s, A.arrivalOf(s, m.nodesByShip[s.shipmentId] || [], m.idx), SH_STATUS_LABEL);
    var st0 = A.stateFromVerdict(s, (String((s && s.status) || '').trim().toLowerCase() === 'arrived') ? { arrived: true } : null, SH_STATUS_LABEL);
    if (st0.key !== 'arrived' && imp && (s.status === 'shipped' || s.status === 'in_transit')) st0 = Object.assign({}, st0, { label: st0.label + (m && m.failed ? '（物流到達未能讀取）' : '（物流到達讀取中）') });
    return st0;
}
// A-delta1 C3 (REVIEW_AD1 L-4): the projection is rebuilt after every Overview (re)load and after a map position update in this session
if (typeof window !== 'undefined') window.KMLogisticsArrivalInvalidate = function () { _shArrivalModel = null; };
function _shArrivalEnsure_(list, rerender) {
    if (_shArrivalModel || _shArrivalLoading) return;
    // r2 (cost): 1) reuse route / location rows another page already loaded (the map's read fills the shared cache) - zero extra reads;
    // 2) otherwise read only when a DISPLAY_ONLY / not-COUNTED import row is shipped / in_transit (rows that can never get the arrived write).
    //    System / COUNTED rows rely on the persisted status (31_ writes arrived at the true destination).
    var DB0 = window.KM && window.KM.DB, r0 = (DB0 && DB0.getShipmentRoutes && DB0.getShipmentRoutes()) || [], l0 = (DB0 && DB0.getLogisticsLocations && DB0.getLogisticsLocations()) || [];
    if (r0.length && l0.length) { _shArrivalModel = KMLogisticsArrival.buildIndex(r0, l0, (DB0.getShipmentRouteTemplateNodes && DB0.getShipmentRouteTemplateNodes()) || []); _shArrivalModel.source = 'shared-cache'; return; }
    // A-delta1 C3 (REVIEW_AD1 L-3): EVERY open import row (COUNTED included) can sit at its destination without a persisted arrived (a ROUTE_INIT
    // import positioned at the destination node keeps in_transit), so any IMPORT_HISTORICAL shipped / in_transit row triggers the one lazy read.
    if (!(list || []).some(function (s) { return (s.status === 'shipped' || s.status === 'in_transit') && String(s.recordOrigin || '').trim() === 'IMPORT_HISTORICAL'; })) return;
    if (!(window.KM && window.KM.api && typeof window.KM.api.getWorkspace === 'function' && window.KM.DB && typeof window.KM.DB.adaptShipmentWorkspace === 'function')) { _shArrivalModel = { failed: true }; return; }
    _shArrivalLoading = true;
    Promise.resolve(window.KM.api.getWorkspace('shipment', { page: { number: 1, size: 3000 }, include: { routes: true, locations: true, templates: true } })).then(function (env) {
        _shArrivalLoading = false;
        if (!(env && env.success)) { _shArrivalModel = { failed: true }; } else { var md = window.KM.DB.adaptShipmentWorkspace(env.data) || {}; _shArrivalModel = KMLogisticsArrival.buildIndex(md.shipmentRoutes, md.logisticsLocations, md.shipmentRouteTemplateNodes); }
        if (typeof rerender === 'function') rerender();
    }).catch(function () { _shArrivalLoading = false; _shArrivalModel = { failed: true }; if (typeof rerender === 'function') rerender(); });
}
// AD3 D (Owner decisions 6 / 7; Author A contract section 3) - MANUAL POSITION REPORT ON THE SHIPMENT CARD.
// Only for a shipment confirmed with manual logistics (every route row route_template_id 'MANUAL'); a shipment with a template route uses the
// normal Update Position on the map and gets no box. When the route rows are not loaded on this page the box is offered with a notice and the
// server decides (ROUTE_NOT_MANUAL). The report is an explicit operator statement: kind (in transit / arrived at destination warehouse), report
// time, reason / reference, the BOUND destination shown read-only (never sent - the server binds the saved destination). One operation id per
// report attempt, kept in this browser until a definitive answer, so a retry can never write twice. An answer that did not arrive is held:
// nothing is resent automatically; Re-check reads the shipment from the server, and only an explicit press resends with the SAME operation id
// (the server answers idempotent). Arrival never receives stock: receipt stays the separate receipt flow. DISPLAY_ONLY imports: no arrival.
var SH_MANUAL_POS_KEY_ = 'km.shipment.manualPositionOp.v1';
var SH_MANUAL_POS_INFLIGHT_ = {};
function _shManualPosRead_() { try { var v = JSON.parse(window.localStorage.getItem(SH_MANUAL_POS_KEY_) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (e) { return {}; } }
var SH_MANUAL_POS_MEM_ = {};
function _shManualPosGet_(sid) { var v = _shManualPosRead_(); return v[sid] || SH_MANUAL_POS_MEM_[sid] || null; }
function _shManualPosPut_(sid, rec) { SH_MANUAL_POS_MEM_[sid] = rec; try { var v = _shManualPosRead_(); if (rec) v[sid] = rec; else delete v[sid]; window.localStorage.setItem(SH_MANUAL_POS_KEY_, JSON.stringify(v)); } catch (e) {} if (!rec) delete SH_MANUAL_POS_MEM_[sid]; }
function _shManualPosNewOp_(sid) {
    var r = ''; try { var a = new Uint32Array(2); window.crypto.getRandomValues(a); r = a[0].toString(36) + a[1].toString(36); } catch (e) { r = Math.floor(Math.random() * 1e12).toString(36); }
    return ('mp-' + Date.now().toString(36) + '-' + r).replace(/[^A-Za-z0-9:_.-]/g, '').slice(0, 80);
}
// manual / template / unknown, from route rows already on this page (the map's shared cache or the Overview projection read); never a new read
function _shManualRouteState_(s) {
    var rows = null, m = _shArrivalModel;
    if (m && !m.failed && m.nodesByShip) rows = m.nodesByShip[s.shipmentId] || [];
    else { try { var all = (window.KM && window.KM.DB && window.KM.DB.getShipmentRoutes && window.KM.DB.getShipmentRoutes()) || []; if (all.length) rows = all.filter(function (n) { return n && n.shipmentId === s.shipmentId; }); } catch (e) {} }
    if (rows === null) return 'UNKNOWN';
    if (!rows.length) return 'NONE';
    return rows.every(function (n) { return String((n && n.routeTemplateId) || '').trim().toUpperCase() === 'MANUAL'; }) ? 'MANUAL' : 'TEMPLATE';
}
function _shNowLocal_() { var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); }
function _shManualPosHtml_(s) {
    var st = String((s && s.status) || '').trim().toLowerCase();
    if (st !== 'shipped' && st !== 'in_transit') {   // AD3 D r3: the server refuses a report here; only an earlier UNKNOWN report is shown, re-check only
        var h0 = s && _shManualPosGet_(String(s.shipmentId));
        if (!h0) return '';
        var e0 = _shEsc(String(s.shipmentId));
        return '<div class="sh-manual-pos" data-sid="' + e0 + '" data-route-state="HELD_ONLY" style="margin-top:12px;padding:10px 12px;border:1px solid #CBD5E1;border-radius:6px;background:#fff;font-size:12px;">' +
            '<div style="font-weight:600;color:#1E293B;">Manual position report</div>' +
            '<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;"><button type="button" class="sh-mp-recheck" onclick="shManualPosRecheck(\'' + e0 + '\', this)" style="background:#2563EB;color:#fff;border:none;border-radius:4px;padding:5px 12px;font-size:12px;cursor:pointer;">Re-check (read only)</button>' +
            '<span class="sh-mp-note" role="status" style="overflow-wrap:anywhere;">' + _shEsc('An earlier report (' + h0.kind + ', operation ' + h0.op + ') has an UNKNOWN outcome. The shipment is now ' + (st || 'unknown') + ', so no new report can be sent here. Re-check reads the shipment.') + '</span></div></div>';
    }
    var rs = _shManualRouteState_(s);
    if (rs === 'TEMPLATE' || rs === 'NONE') return '';
    var sid = String(s.shipmentId), e = _shEsc(sid), dOnly = KMLogisticsArrival.isDisplayOnly(s);
    var dest = String(s.destinationWarehouseId || s.warehouseId || '').trim(), hold = _shManualPosGet_(sid);
    var kinds = [['IN_TRANSIT', 'In transit / 運送中']];
    if (!dOnly) kinds.push(['ARRIVED_AT_DESTINATION', 'Arrived at destination warehouse / 已到目的倉']);
    return '<div class="sh-manual-pos" data-sid="' + e + '" data-route-state="' + rs + '" style="margin-top:12px;padding:10px 12px;border:1px solid #CBD5E1;border-radius:6px;background:#fff;font-size:12px;">' +
        '<div style="font-weight:600;color:#1E293B;">Manual position report (manual logistics, no route template)</div>' +
        (rs === 'UNKNOWN' ? '<div class="sh-mp-unknown" style="color:#64748B;margin-top:2px;">Only for shipments confirmed with manual logistics. The server checks this; a shipment with a route template uses Update Position on the map.</div>' : '') +
        '<div style="margin-top:6px;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;">' +
        '<label style="display:flex;flex-direction:column;gap:2px;"><span style="font-size:11px;color:#64748B;">Position</span><select class="sh-mp-kind" data-field="manual_report" style="padding:4px 6px;border:1px solid #CBD5E1;border-radius:4px;font-size:12px;"><option value="">-- Choose --</option>' +
            kinds.map(function (k) { return '<option value="' + k[0] + '">' + _shEsc(k[1]) + '</option>'; }).join('') + '</select></label>' +
        '<label style="display:flex;flex-direction:column;gap:2px;"><span style="font-size:11px;color:#64748B;">Report time</span><input class="sh-mp-time" data-field="report_time" type="datetime-local" value="' + _shNowLocal_() + '" style="padding:4px 6px;border:1px solid #CBD5E1;border-radius:4px;font-size:12px;min-width:0;"></label>' +
        '<label style="display:flex;flex-direction:column;gap:2px;grid-column:1 / -1;"><span style="font-size:11px;color:#64748B;">Reason / reference (required)</span><input class="sh-mp-reason" data-field="reason" type="text" maxlength="200" placeholder="e.g. carrier email 2026-11-21, POD photo, call with warehouse" style="padding:4px 6px;border:1px solid #CBD5E1;border-radius:4px;font-size:12px;"></label>' +
        '<div style="grid-column:1 / -1;color:#475569;">Destination (saved on this shipment): <strong class="sh-mp-dest">' + _shEsc(dest || 'not set') + '</strong></div>' +
        '</div>' +
        (dOnly ? '<div style="color:#92400E;margin-top:4px;">Display-only import: arrival is not recorded here and nothing is received.</div>' : '<div style="color:#64748B;margin-top:4px;">Arrival does not receive stock. Receive the quantity in the receipt flow.</div>') +
        '<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;">' +
        '<button type="button" class="sh-mp-send" onclick="shManualPosSend(\'' + e + '\', this)"' + (hold ? ' disabled' : '') + ' style="background:#0F766E;color:#fff;border:none;border-radius:4px;padding:5px 12px;font-size:12px;cursor:pointer;min-width:120px;">Report position</button>' +
        (hold ? '<button type="button" class="sh-mp-recheck" onclick="shManualPosRecheck(\'' + e + '\', this)" style="background:#2563EB;color:#fff;border:none;border-radius:4px;padding:5px 12px;font-size:12px;cursor:pointer;">Re-check (read only)</button>' : '') +
        '<span class="sh-mp-note" role="status" style="overflow-wrap:anywhere;">' + (hold ? _shEsc('An earlier report (' + hold.kind + ', operation ' + hold.op + ') has an UNKNOWN outcome. Nothing was resent. Re-check reads the shipment first.') : '') + '</span>' +
        '</div></div>';
}
var SH_MANUAL_POS_TEXT_ = {
    MANUAL_REPORT_INVALID: 'Choose a position.', MANUAL_REPORT_OPERATION_ID_REQUIRED: 'Internal: operation id missing.', MANUAL_REPORT_TIME_INVALID: 'The report time is not valid.',
    MANUAL_REPORT_TIME_IN_FUTURE: 'The report time is in the future.', MANUAL_REPORT_REASON_REQUIRED: 'Enter a reason / reference (2-200 characters).',
    MANUAL_REPORT_FIELD_NOT_ALLOWED: 'The request carried a field that is not allowed.', MANUAL_REPORT_DESTINATION_MISMATCH: 'The destination differs from the saved one.',
    ROUTE_NOT_MANUAL: 'This shipment has a route template: use Update Position on the map.', ROUTE_NOT_SNAPSHOTTED: 'This shipment has no route snapshot yet.',
    MANUAL_ROUTE_INVALID: 'The manual route of this shipment is not valid (not bound to the saved destination).', ROUTE_INIT_NOT_COMMITTED: 'The import that created the route is not committed.',
    SHIPMENT_NOT_FOUND: 'Shipment not found.', MANUAL_REPORT_STATUS_NOT_OPEN: 'The shipment is not open for a position report.', RECEIPT_ALREADY_STARTED: 'Receipt has already started.',
    MANUAL_ARRIVAL_DISPLAY_ONLY: 'Display-only import: arrival is not recorded.', MANUAL_REPORT_BACKWARD: 'The shipment is already at the destination; it cannot go back to in transit.',
    MANUAL_REPORT_OPERATION_ID_REUSED: 'This operation id was used for another report. Reload and report again.', EDIT_CONFLICT: 'The shipment changed elsewhere. Reload and check before reporting.',
    LOCK: 'The system is busy. Re-check, then try again.'
};
// AD3 D r7 (review F3): which failed answers PROVE that nothing was written. 31_ answers WRITE from its catch after route rows / the event /
// the status may already be written (a retry with the same operation_id is safe), so WRITE is UNKNOWN; so is LOCK and any code not listed.
var SH_MANUAL_POS_DEFINITIVE_ = { MANUAL_REPORT_INVALID: 1, MANUAL_REPORT_OPERATION_ID_REQUIRED: 1, MANUAL_REPORT_TIME_INVALID: 1, MANUAL_REPORT_TIME_IN_FUTURE: 1, MANUAL_REPORT_REASON_REQUIRED: 1,
    MANUAL_REPORT_FIELD_NOT_ALLOWED: 1, MANUAL_REPORT_DESTINATION_MISMATCH: 1, ROUTE_NOT_MANUAL: 1, ROUTE_NOT_SNAPSHOTTED: 1, MANUAL_ROUTE_INVALID: 1, ROUTE_INIT_NOT_COMMITTED: 1, SHIPMENT_NOT_FOUND: 1,
    MANUAL_REPORT_STATUS_NOT_OPEN: 1, RECEIPT_ALREADY_STARTED: 1, MANUAL_ARRIVAL_DISPLAY_ONLY: 1, MANUAL_REPORT_BACKWARD: 1, MANUAL_REPORT_OPERATION_ID_REUSED: 1, EDIT_CONFLICT: 1 };
function _shManualPosDefinitive_(r) {
    if (!r || r.success !== false) return false;
    var code = String(r.code || '').trim();
    if (code === 'WRITE' || code === 'LOCK' || code === 'network' || code === 'config') return false;
    return r.zero_write === true || SH_MANUAL_POS_DEFINITIVE_[code] === 1;
}
// AD3 D r7 (review minor): the reported operator, from the same source the map uses (glmActor); the card's name when none is signed in
function _shReportedOperator_() { try { return (window.KM && (window.KM.currentUserEmail || (window.KM.currentUser && window.KM.currentUser.email))) || 'operation-system'; } catch (e) { return 'operation-system'; } }
function _shManualPosBox_(sid) { return document.querySelector('.sh-manual-pos[data-sid="' + String(sid).replace(/"/g, '') + '"]'); }
function shManualPosSend(sid, btn) {
    var box = _shManualPosBox_(sid); if (!box || SH_MANUAL_POS_INFLIGHT_[sid]) return false;
    var note = box.querySelector('.sh-mp-note'), kind = box.querySelector('.sh-mp-kind').value, reason = String(box.querySelector('.sh-mp-reason').value || '').trim();
    var t = String(box.querySelector('.sh-mp-time').value || '').trim().replace('T', ' ');
    var hold = _shManualPosGet_(sid), resend = !!(hold && hold.checked === true);
    if (hold && !resend) { note.textContent = 'An earlier report has an UNKNOWN outcome. Re-check first; nothing was sent.'; return false; }
    if (resend) { kind = hold.kind; reason = hold.reason; t = hold.time; }
    if (!kind) { note.textContent = 'Choose a position (in transit / arrived at destination warehouse).'; return false; }
    if (reason.length < 2 || reason.length > 200) { note.textContent = 'Enter a reason / reference (2-200 characters).'; return false; }
    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}( [0-9]{2}:[0-9]{2})?$/.test(t)) { note.textContent = 'Enter the report time.'; return false; }
    var DB = window.KM && window.KM.DB; if (!DB || typeof DB.advanceShipmentRoutePoint !== 'function') { note.textContent = 'Not available on this page.'; return false; }
    var op = resend ? hold.op : _shManualPosNewOp_(sid);
    var body = { shipment_id: sid, manual_report: kind, operation_id: op, report_time: t, reason: reason, actor: _shReportedOperator_() };   // AD3 D r7: the map's reported operator
    if (!resend) { var tok = _shTok_(sid); if (tok) body.expected_updated_at = tok; }   // a resend of the SAME operation carries no version: the server answers idempotent
    if (SH_MANUAL_POS_INFLIGHT_MAP_[sid]) { note.textContent = 'A manual report for this shipment is being sent from the map. Nothing was sent.'; return false; }
    _shManualPosPut_(sid, { op: op, kind: kind, reason: reason, time: t, at: new Date().toISOString(), checked: false, src: (hold && hold.src) || 'card' });   // held BEFORE sending (a reload mid-flight stays held)
    SH_MANUAL_POS_INFLIGHT_[sid] = true; if (btn) { btn.disabled = true; btn.textContent = 'Reporting...'; }
    note.textContent = '';
    return Promise.resolve().then(function () { return DB.advanceShipmentRoutePoint(body); }).then(function (r) {
        delete SH_MANUAL_POS_INFLIGHT_[sid];
        var _rc = box.querySelector('.sh-mp-recheck'); if (_rc && _shManualPosDefinitive_(r)) _rc.remove();   // AD3 D r7
        if (r && r.success === true) { if (_rc) _rc.remove();
            _shManualPosPut_(sid, null);
            var d = r.data || {}, a = d.arrival || {};
            note.textContent = (d.idempotent ? 'Already recorded (no second write). ' : 'Recorded. ') +
                (kind === 'ARRIVED_AT_DESTINATION' ? (a.arrived ? 'Arrived at ' + (a.destination_warehouse_id || 'the destination') + ' (status ' + (a.status_after || 'arrived') + '). Receive the quantity in the receipt flow.' : 'Position recorded; arrival not confirmed: ' + (a.code || a.reason || 'unknown') + (a.missing_field ? ' (missing ' + a.missing_field + ')' : '') + '.') : 'In transit.');
            if (btn) { btn.disabled = false; btn.textContent = 'Report position'; }
            try { if (window.KMLogisticsArrivalInvalidate) window.KMLogisticsArrivalInvalidate(); } catch (e) {}
            setTimeout(function () { try { _shLoadAndRender(); } catch (e) {} }, 0);
            return r;
        }
        var code = String((r && r.code) || '').trim();
        if (_shManualPosDefinitive_(r)) {   // AD3 D r7 (review F3): definitive only with zero_write or a known refusal - never WRITE / LOCK / unknown codes
            _shManualPosPut_(sid, null);
            note.textContent = 'Not recorded: ' + (SH_MANUAL_POS_TEXT_[code] || String(r.error || code)) + ' (' + code + ')';
            if (btn) { btn.disabled = false; btn.textContent = 'Report position'; }
            return r;
        }
        _shManualPosUnknown_(sid, box, btn); return r;
    }, function (e) { delete SH_MANUAL_POS_INFLIGHT_[sid]; _shManualPosUnknown_(sid, box, btn); return null; });
}
function _shManualPosUnknown_(sid, box, btn) {
    var note = box.querySelector('.sh-mp-note');
    if (btn) { btn.disabled = true; btn.textContent = 'Report position'; }
    note.textContent = 'The answer did not arrive: the outcome is UNKNOWN. Nothing will be resent. Press Re-check to read the shipment.';
    if (!box.querySelector('.sh-mp-recheck')) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'sh-mp-recheck'; b.textContent = 'Re-check (read only)';
        b.style.cssText = 'background:#2563EB;color:#fff;border:none;border-radius:4px;padding:5px 12px;font-size:12px;cursor:pointer;';
        b.onclick = function () { shManualPosRecheck(sid, b); };
        note.parentNode.insertBefore(b, note);
    }
}
// READ ONLY: one server read of this shipment. If it shows the reported effect, the hold is cleared; if not, the operator may resend the SAME
// operation (explicit press; the server does not write twice). It never sends the report itself.
function shManualPosRecheck(sid, btn) {
    var box = _shManualPosBox_(sid), hold = _shManualPosGet_(sid), api = window.KM && window.KM.api;
    if (!box || !hold) return false;
    var note = box.querySelector('.sh-mp-note'), send = box.querySelector('.sh-mp-send');
    if (btn) btn.disabled = true; note.textContent = 'Reading the shipment from the server...';
    return Promise.resolve().then(function () {
        if (!api || typeof api.getWorkspace !== 'function') throw new Error('READ_UNAVAILABLE');
        return api.getWorkspace('shipment', { filters: { shipmentId: sid }, page: { number: 1, size: 5 }, include: { routes: true } });
    }).then(function (env) {
        if (!env || env.success !== true) throw new Error('READ_FAILED');
        var md = window.KM.DB.adaptShipmentWorkspace(env.data) || {}, row = ((md.shipments) || []).filter(function (x) { return String(x.shipmentId) === String(sid); })[0];
        if (!row) throw new Error('SHIPMENT_NOT_FOUND');
        var st = String(row.status || '').trim().toLowerCase();
        var nodes = (md.shipmentRoutes || []).filter(function (n) { return n && n.shipmentId === sid; });
        var destRow = nodes.filter(function (n) { return String(n.routeTemplateNodeId || '') === 'MANUAL:DESTINATION'; })[0];
        var _recv = /^(arrived|partially_received|received|closed|completed)$/.test(st);   // AD3 D r3: receiving started / done also proves the earlier report landed
        var landed = hold.kind === 'IN_TRANSIT' ? (st === 'in_transit' || _recv) : (_recv || (destRow && /current|completed/i.test(String(destRow.status || ''))));
        if (landed) {
            _shManualPosPut_(sid, null);
            note.textContent = 'The server shows the report recorded (status ' + st + '). Nothing was resent.';
            if (btn) btn.remove(); if (send && box.getAttribute('data-route-state') !== 'HELD_ONLY') send.disabled = false;
            setTimeout(function () { try { _shLoadAndRender(); } catch (e) {} }, 0);
            return;
        }
        if (box.getAttribute('data-route-state') === 'HELD_ONLY' || !(st === 'shipped' || st === 'in_transit')) { note.textContent = 'The server does not show the report, and the shipment is ' + (st || 'unknown') + ': no report can be sent now. Nothing was resent.'; if (btn) btn.disabled = false; return; }   // AD3 D r3
        hold.checked = true; _shManualPosPut_(sid, hold);
        note.textContent = 'The server does not show the report yet (status ' + (st || 'unknown') + '). You may send it again: it reuses operation ' + hold.op + ', so it cannot be written twice.';
        if (send) { send.disabled = false; send.textContent = 'Send again (same operation)'; }
        if (btn) btn.disabled = false;
    }).catch(function () {
        note.textContent = 'The shipment could not be read. Nothing was resent. Re-check again later.';
        if (btn) btn.disabled = false;
    });
}
var SH_MANUAL_POS_INFLIGHT_MAP_ = {};
// AD3 D r2: the ONE per-shipment manual-position hold, shared by this card and the map drawer (both send shipment.route.advance + manual_report
// with an operation id). get/put/clear the hold; busy(sid) = a send in flight from either side.
if (typeof window !== 'undefined') window.KMManualPositionOp = {
    get: function (sid) { return _shManualPosGet_(String(sid)); },
    put: function (sid, rec) { _shManualPosPut_(String(sid), rec); },
    clear: function (sid) { _shManualPosPut_(String(sid), null); },
    busy: function (sid) { return !!(SH_MANUAL_POS_INFLIGHT_[sid] || SH_MANUAL_POS_INFLIGHT_MAP_[sid]); },
    mapSending: function (sid, on) { if (on) SH_MANUAL_POS_INFLIGHT_MAP_[sid] = true; else delete SH_MANUAL_POS_INFLIGHT_MAP_[sid]; }
};
if (typeof window !== 'undefined') { window.shManualPosSend = shManualPosSend; window.shManualPosRecheck = shManualPosRecheck; }
var SH_STATUS_FLOW = ['draft', 'ready_to_ship', 'shipped', 'in_transit', 'arrived', 'received', 'closed'];
function _shNextStatus(status) {
    var i = SH_STATUS_FLOW.indexOf(status);
    return (i >= 0 && i < SH_STATUS_FLOW.length - 1) ? SH_STATUS_FLOW[i + 1] : null;
}

// Shipment Draft workspace = draft / ready_to_ship / shipped (until Done hides it).
// F1-7N-FC-1A-R1 §F — `cancelled` JOINS THIS SET, and it has to.
//
// Cancellation moves a draft to `cancelled`, and the Overview page shows `shipped` onward. Without this the
// card would simply VANISH from both pages the instant it was cancelled: the operator would see the row
// disappear and have no way to confirm whether the cancellation and its reservation release actually happened,
// or whether the request failed and the row is still live somewhere. A cancelled shipment is preserved in the
// database as audit evidence, and it stays on screen for the same reason.
var SH_DRAFT_STATUSES = ['draft', 'ready_to_ship', 'shipped', 'cancelled'];
// Shipment Overview = official records only (shipped onward).
var SH_OVERVIEW_STATUSES = { shipped: 1, in_transit: 1, arrived: 1, partially_received: 1, received: 1, closed: 1 };   // OVERVIEW-PR (R4 review M4, ships with the patch): 31_ writes partially_received
// F1-6B Part B — statuses at which the frozen R2B final-output snapshot exists (post confirm-and-dispatch), so
// Shipping Detail / Packing List documents can be generated. Purely a UX gate — the backend is fail-closed regardless.
var SH_DOC_READY_STATUSES = { shipped: 1, in_transit: 1, arrived: 1, partially_received: 1, received: 1, closed: 1, stuck: 1 };
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
// R15C-UI (Owner R15 P1 "Ready ... Loading shipments"): a re-read no longer throws the cards away first. _shLoadAndRender used to set
// _shReadModel = null and then begin the load, so a region that had just been bound (switching Draft <-> Overview creates a new one, whose
// state is null) went to INITIAL_LOADING and painted 'Loading shipments...' over every card. Now the model stays until the new answer
// arrives (REFRESHING: the cards stay visible), and _shReadPending_ is what holds the buttons in the meantime (the stale edit token is
// never used): _shTokReady_ refuses while a read is pending, exactly as it refused while the model was null.
var _shReadPending_ = 0;
// read-model-first accessors: Workspace mode reads the scoped DTO; Legacy reads the broad-cache getters unchanged.
function _shGetShipments() { return _shReadModel ? _shReadModel.shipments : ((window.KM.DB.getShipments && window.KM.DB.getShipments()) || []); }
function _shGetShipmentLines() { return _shReadModel ? _shReadModel.shipmentLines : ((window.KM.DB.getShipmentLines && window.KM.DB.getShipmentLines()) || []); }
function _shGetCarrierRateCards() { return _shReadModel ? _shReadModel.carrierRateCards : ((window.KM.DB.getCarrierRateCards && window.KM.DB.getCarrierRateCards()) || []); }
// S7-R2A — the carrier MASTER, and the one getter in this file that may return null on purpose.
//
// Every other getter here answers [] when it has nothing, because an empty list and an unread list mean the
// same thing to a list render. For the carrier master they do NOT: [] would make KM.display.carrierDisplay
// report every carrier UNKNOWN, which is a confident claim about data nobody has read. null means UNREAD and
// the resolver keeps the id on screen without passing judgement on it.
//
// The LEGACY branch returns null rather than KM.DB.getCarriers(): that getter reads the broad whole-DB cache,
// and this round is forbidden to reintroduce a dependency on it. On the legacy path the id is shown unresolved,
// which is honest.
function _shGetCarriers() { return _shReadModel ? _shReadModel.carriers : null; }
// The single call site shape, so the two renders below cannot drift apart.
function _shCarrierCell_(carrierId) {
    var d = (window.KM && window.KM.display && window.KM.display.carrierDisplay)
        ? window.KM.display.carrierDisplay(carrierId, _shGetCarriers())
        : { state: 'UNREAD', text: String(carrierId == null ? '' : carrierId), carrierId: carrierId, carrierName: '' };
    return d;
}
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
    if (_shReadModel && el.querySelector && el.querySelector('.history-card')) _shRegion.set(window.KM.loadState.STATES.READY);   // R15C-UI: cards already on screen
    return _shRegion;
}
// Scoped read: Workspace (canonical) → getWorkspace('shipment') → adapt → renderFn. Fail-closed (bounded region ERROR;
// NO silent legacy broad fallback). Also the scoped POST-WRITE refresh path.
function _shRefresh_(renderFn) {
    var mySeq = ++_shReadSeq;
    _shReadPending_ = mySeq;   // R15C-UI
    var _st15c = { env: _shEnvId15c_(), scope: _shScopeId15c_(), epoch: _shEpoch15c_(), revP: _shProbe15c_(), at: 0 };   // R15C-B3B v2: stamped at the START of the read
    var rg = _shRegion_();
    if (rg) rg.beginLoad(!!_shReadModel);
    if (!(window.KM.api && typeof window.KM.api.getWorkspace === 'function')) { _shRenderError_({ code: 'WORKSPACE_UNAVAILABLE', message: 'Shipment Workspace API unavailable.' }); return; }
    // F1-7N-FB-1B §P — ask for the generated_documents projection. It is a BOUNDED include: without it the
    // workspace does not read the registry at all, so the Document Panel cost is opt-in per page.
    return Promise.resolve(window.KM.api.getWorkspace('shipment', { page: { number: 1, size: 3000 }, include: { documents: true, skuLogistics: true } })).then(function (env) {
        if (mySeq !== _shReadSeq) return;
        _shReadPending_ = 0;   // R15C-UI: this answer settles the pending read (success or failure)
        if (_st15c.env !== _shEnvId15c_() || _st15c.scope !== _shScopeId15c_()) { SH_RETURN_STATS_15C_.envDrop++; _shEnvGate15c_(); var _sec15f = document.getElementById('shipment-draft-section'); if (_sec15f && _sec15f.classList.contains('active')) _shLoadAndRender(); return; }   // [R15F-F19v2] envId via db-api; UNKNOWN is never a cache key: an answer for another environment is never drawn or kept
        if (env && env.success) {
            var _known15f = _st15c.env !== 'env:unknown', _st0 = _shModelStamp15c_, _prev15f = (_known15f && _st0 && _st0.env === _st15c.env && _st0.scope === _st15c.scope) ? _shReadModel : null;   // [R15F-F19v2] envId via db-api; UNKNOWN is never a cache key
            _shReadModel = _shKeepNewer15c_(_prev15f, window.KM.DB.adaptShipmentWorkspace(env.data)); _shArrivalModel = null;   /* C3 L-4: a fresh list re-evaluates the arrival projection */   // R15C-B3B: never an older version over a newer one - and never across environments
            _st15c.at = Date.now(); _shModelStamp15c_ = _known15f ? _st15c : null;   // UNKNOWN: no cache stamp - a return drops it and reads anew
            if (rg) rg.set(_shReadModel.shipments.length ? window.KM.loadState.STATES.READY : window.KM.loadState.STATES.EMPTY);
            if (typeof renderFn === 'function') renderFn();
        } else {
            _shRenderError_((env && env.errors && env.errors[0]) || { code: 'WORKSPACE_ERROR', message: 'Shipment workspace request failed.' });
        }
    }).catch(function (e) { if (mySeq !== _shReadSeq) return; _shReadPending_ = 0; _shRenderError_({ code: 'SHIPMENT_READ_FAILED', message: String(e && e.message || e) }); });
}
// F1-7N-FB-4E §F — the safe error field set, from the ONE shared formatter (KM.transport.errorLine). The
// banner previously showed "<message> [<code>]", which named neither the action, nor the request id, nor
// whether retrying could possibly help. It degrades to the old two-field form if the transport module is
// absent, so a load failure costs detail rather than the banner itself.
function _shErrDetail_(err) {
    try {
        if (window.KM && window.KM.transport && typeof window.KM.transport.errorLine === 'function') {
            return window.KM.transport.errorLine(err);
        }
    } catch (e) {}
    return String((err && err.message) || 'failed') + ' [' + String((err && err.code) || 'READ_FAILED') + ']';
}
function _shRenderError_(err) {
    _shReadModel = null;
    var rg = _shRegion_(); if (rg) rg.set(window.KM.loadState.STATES.ERROR);
    var el = _shActiveListEl_();
    // S4-R7 §8 — with a Retry, which this surface has never had.
    if (el) { el.hidden = false; el.innerHTML = '<div role="alert" style="color:#B91C1C;padding:12px;font-size:13px;text-align:left;overflow-wrap:break-word;word-break:break-word;">Shipment read error: ' + _shEsc(_shErrDetail_(err)) +
      ' <button type="button" class="btn btn-secondary" onclick="shRetryRead()" style="margin-left:8px;padding:2px 10px;font-size:12px;cursor:pointer;">Retry</button></div>'; }
}

// ONE scoped shipment workspace re-read per press, through the same owner the card actions use.
function shRetryRead() {
  var el = _shActiveListEl_();
  if (el) { el.hidden = false; el.innerHTML = '<div style="padding:12px;font-size:13px;color:#6B7280;">Retrying\u2026</div>'; }
  _shLoadAndRender();
}
if (typeof window !== 'undefined') { window.shRetryRead = shRetryRead; }

// Re-render whichever Shipment page is currently active. Called by the card action handlers after a write. In Workspace
// mode this is a SCOPED re-read of the shipment workspace (never a broad reload); in Legacy mode render-only (the write
// adapters already reloaded the broad cache).
function _shLoadAndRender() {
    var draftSec = document.getElementById('shipment-draft-section');
    var active = (draftSec && draftSec.classList.contains('active')) ? renderShipmentDraft : renderShipmentOverview;
    if (_shEffectiveWorkspace()) return _shRefresh_(active);   // Keep the model until the new one arrives.
    return active();
}

// ---- Shipment Draft page --------------------------------------------------
function initShipmentDraftPage() {
    _shdEnsureFilter();
    _shEnvGate15c_();         // R15C-B3B: another environment's held model is dropped BEFORE anything is drawn
    renderShipmentDraft();
    _shRestoreScroll15c_();   // R15C-B3B
    _shReturn15c_();          // R15C-B3B: the held model was drawn at once; re-validate it (a stale one is re-read in the background)
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
                '<option value="cancelled">Cancelled</option>' +
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
    var groups = [['draft', 'Draft'], ['ready_to_ship', 'Ready to Ship'], ['shipped', 'Shipped'],
        ['cancelled', 'Cancelled']];
    var _keep15c = _shCaptureCards_(listEl);   // R15C-UI
    listEl.innerHTML = groups.filter(function(g) { return !fStatus || g[0] === fStatus; }).map(function(g) {
        var items = pool.filter(function(s) { return s.status === g[0]; });
        var body = items.length
            ? items.map(function(s) { return _shRenderDbCard(s, linesByShipment[s.shipmentId] || [], 'draft'); }).join('')
            : '<p style="color:#94A3B8;font-size:13px;margin:0 0 8px;">No ' + g[1] + ' shipments.</p>';   // R71-FE-11: the rate-card boxes load after this render (see below)
        // Section title styled like Request Order Draft: compact 15px heading + count badge.
        return '<h3 class="shd-group-title">' + g[1] +
            ' <span class="shd-group-title__count">' + items.length + '</span></h3>' + body;
    }).join('');
    _shRestoreCards_(listEl, _keep15c);   // R15C-UI
    try { setTimeout(_shRcAutoLoad_, 0); } catch (eAL) { /* R71-FE-11 */ }
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
    var _keep15o = _shCaptureCards_(listEl);   // R15C-UI
    listEl.innerHTML = list.map(function(s) { return _shRenderDbCard(s, linesByShipment[s.shipmentId] || [], 'overview'); }).join('');
    _shArrivalEnsure_(list, renderShipmentOverview);   // A-DELTA1 C2 item 1: one lazy read-only route read for the arrival projection
    _shRestoreCards_(listEl, _keep15o);
}

// R15C-UI: what a re-render of the shipment list must not drop, by internal shipment id (the card id): which cards are expanded, the
// execution fields / carton numbers typed and not saved, the focused field and the card's place on screen. A typed value is put back
// only while the server still holds the value it was typed over; if the server value moved it is NOT applied silently - the operator is
// told which fields (nothing is sent either way).
function _shFieldKey_(n) { return n.getAttribute('data-field') ? 'f:' + n.getAttribute('data-field') : (n.getAttribute('data-carton') ? 'c:' + (n.getAttribute('data-line-id') || n.getAttribute('data-shipment-line-id') || '') + ':' + n.getAttribute('data-carton') : ''); }
function _shFieldBase_(n) { if (n.tagName === 'SELECT') { for (var i = 0; i < n.options.length; i++) if (n.options[i].defaultSelected) return n.options[i].value; return n.options.length ? n.options[0].value : ''; } return _shRenderedBaseline_(n); }
function _shCardFields_(card) { var list = card.querySelectorAll('input[data-field], select[data-field], input[data-carton]'), out = []; Array.prototype.forEach.call(list, function (n) { if (n.type !== 'hidden') out.push(n); }); return out; }
function _shCaptureCards_(listEl) {
    var st = { open: {}, typed: {}, focus: null, anchor: null };
    if (!listEl || !listEl.querySelectorAll) return st;
    st.heldNotes = _shHeldNotesTake15c_(listEl);   // R15C-B3B v3: the note (and its Release control) of a still-HELD shipment survives the repaint
    var act = document.activeElement, anchor = null;
    Array.prototype.forEach.call(listEl.querySelectorAll('.history-card[id^="sh-card-"]'), function (card) {
        var d = card.querySelector('.history-card-details');
        if (d && d.style.display !== 'none') { st.open[card.id] = true; if (!anchor) anchor = card; }
        _shCardFields_(card).forEach(function (n) { var k = _shFieldKey_(n), b = _shFieldBase_(n); if (k && String(n.value) !== String(b)) (st.typed[card.id] = st.typed[card.id] || {})[k] = { value: n.value, base: b, label: n.getAttribute('data-field') || 'carton no.' }; });
        if (act && card.contains(act)) { anchor = card; st.focus = { card: card.id, key: act.getAttribute ? _shFieldKey_(act) : '', s: typeof act.selectionStart === 'number' ? act.selectionStart : null, e: typeof act.selectionEnd === 'number' ? act.selectionEnd : null }; }
    });
    if (anchor && anchor.getBoundingClientRect) st.anchor = { id: anchor.id, top: anchor.getBoundingClientRect().top };
    return st;
}
function _shRestoreCards_(listEl, st) {
    if (!st || !listEl) return;
    var lost = [];
    _shHeldNotesPut15c_(listEl, st.heldNotes);   // R15C-B3B v3
    Object.keys(st.open).forEach(function (id) { var card = document.getElementById(id); if (card && listEl.contains(card)) { var d = card.querySelector('.history-card-details'); if (d && d.style.display === 'none') _shToggleCardEl(card); } });
    Object.keys(st.typed).forEach(function (id) {
        var card = document.getElementById(id), byKey = {};
        if (card && listEl.contains(card)) _shCardFields_(card).forEach(function (n) { byKey[_shFieldKey_(n)] = n; });
        Object.keys(st.typed[id]).forEach(function (k) {
            var t = st.typed[id][k], n = byKey[k];
            if (!n) { lost.push(t.label + ' (typed ' + t.value + '; the card is no longer editable here)'); return; }
            var nb = _shFieldBase_(n);
            if (String(nb) === String(t.value)) return;   // the server now holds what was typed (e.g. this very Save)
            if (String(nb) !== String(t.base) || n.disabled || n.readOnly) { lost.push(t.label + ' (typed ' + t.value + ', the server now has ' + (nb === '' ? 'blank' : nb) + ')'); return; }
            n.value = t.value;
        });
    });
    if (st.focus) { var fc = document.getElementById(st.focus.card); if (fc && listEl.contains(fc)) { var hit = null; _shCardFields_(fc).forEach(function (n) { if (_shFieldKey_(n) === st.focus.key) hit = n; }); if (hit && hit.focus) { try { hit.focus({ preventScroll: true }); if (st.focus.s != null && hit.setSelectionRange) hit.setSelectionRange(st.focus.s, st.focus.e); } catch (eF) {} } } }
    if (st.anchor) { var a = document.getElementById(st.anchor.id); if (a && listEl.contains(a) && a.getBoundingClientRect && typeof window.scrollBy === 'function') { var dy = a.getBoundingClientRect().top - st.anchor.top; if (dy) window.scrollBy(0, dy); } }
    if (lost.length) { try { alert('Some unsaved shipment fields were not put back because the shipment changed on the server: ' + lost.join('; ') + '. Nothing was sent.'); } catch (eA) {} }
}

// R15C-UI: THE TARGETED READBACK after a lifecycle write on ONE shipment (Save / Ready to Ship / Ship / Return to Draft): one scoped
// read of that shipment (57_ filters.shipmentId - the bounded post-write readback it was built for), merged into the model in hand, then
// one re-render that keeps the cards' state. Anything other than exactly that shipment in a successful answer falls back to the whole
// scoped read (cards kept). It is a SERVER read, never a cache, and nothing is resent. The server still reads its tables to answer it, so
// this saves the transfer and the repaint, not the server's own read.
var SH_READBACK_STATS_ = { targeted: 0, full: 0 };
function _shReadbackOne_(shipmentId) {
    var sid = String(shipmentId || '');
    if (!sid || !_shEffectiveWorkspace() || !_shReadModel || !(window.KM.api && typeof window.KM.api.getWorkspace === 'function')) { SH_READBACK_STATS_.full++; return Promise.resolve(_shLoadAndRender()).then(function () { return 'FULL'; }); }
    var draftSec = document.getElementById('shipment-draft-section');
    var active = (draftSec && draftSec.classList.contains('active')) ? renderShipmentDraft : renderShipmentOverview;
    var mySeq = ++_shReadSeq; _shReadPending_ = mySeq;
    var rg = _shRegion_(); if (rg) rg.beginLoad(true);
    function full() { SH_READBACK_STATS_.full++; _shReadPending_ = 0; return Promise.resolve(_shLoadAndRender()).then(function () { return 'FULL'; }); }
    return Promise.resolve(window.KM.api.getWorkspace('shipment', { filters: { shipmentId: sid }, page: { number: 1, size: 5 }, include: { documents: true, skuLogistics: true } })).then(function (env) {
        if (mySeq !== _shReadSeq) return 'SUPERSEDED';
        var m = (env && env.success) ? window.KM.DB.adaptShipmentWorkspace(env.data) : null;
        var one = (m && m.shipments.length === 1 && m.shipments[0].shipmentId === sid) ? m.shipments[0] : null;
        var cur = _shReadModel;
        if (!one || !cur || !cur.shipments.some(function (s) { return s.shipmentId === sid; })) return full();
        var _old15c = cur.shipments.filter(function (s) { return s.shipmentId === sid; })[0];
        if (_old15c && _shNewer15c_(_shVer15c_(_old15c), _shVer15c_(one))) { SH_RETURN_STATS_15C_.keptNewer++; _shReadPending_ = 0; if (rg) rg.set(window.KM.loadState.STATES.READY); active(); return 'KEPT_NEWER'; }   // R15C-B3B: a stale answer never replaces a newer save
        cur.shipments = cur.shipments.map(function (s) { return s.shipmentId === sid ? one : s; });
        cur.shipmentLines = cur.shipmentLines.filter(function (l) { return l.shipmentId !== sid; }).concat(m.shipmentLines.filter(function (l) { return l.shipmentId === sid; }));
        var readSkus = Object.create(null);
        m.shipmentLines.forEach(function (l) { readSkus[String(l.sku || '').trim().toLowerCase()] = true; });
        cur.skuLogistics = m.skuLogistics === null ? null : (cur.skuLogistics || []).filter(function (d) {
            return !readSkus[String(d.sku || '').trim().toLowerCase()];
        }).concat(m.skuLogistics);
        _shReadPending_ = 0; SH_READBACK_STATS_.targeted++;
        if (rg) rg.set(window.KM.loadState.STATES.READY);
        active();
        return 'TARGETED';
    }, function () { if (mySeq !== _shReadSeq) return 'SUPERSEDED'; return full(); });
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

function _shSkuGroupsCp2_(lines, editable) {
    var groups = Object.create(null), order = [];
    function known(v) { return v !== '' && v != null && isFinite(Number(v)); }
    (lines || []).forEach(function (l, index) {
        var count = Number(l.cartonQty), valid = Number.isInteger(count) && count > 0;
        var facts = ['unitsPerCarton'].map(function (k) { return l[k]; });
        ['shipmentCartonCbm', 'grossWeight', 'netWeight'].forEach(function (k) {
            facts.push(known(l[k]) && valid ? Number((Number(l[k]) / count).toFixed(8)) : null);
        });
        var key = valid && l.sku && l.shipmentLineId ? JSON.stringify([l.sku].concat(facts)) : 'line:' + index;
        if (!groups[key]) { groups[key] = []; order.push(key); }
        groups[key].push(l);
    });
    var result = [];
    order.forEach(function (key) {
        var members = groups[key], ranges = members.map(function (l) {
            return { start: String(l.cartonNoStart || '').trim(), end: String(l.cartonNoEnd || '').trim(), cartons: Number(l.cartonQty) };
        });
        var blank = ranges.every(function (r) { return !r.start && !r.end; });
        var ordered = ranges.slice().sort(function (a, b) { return Number(a.start) - Number(b.start); });
        var contiguous = ordered.every(function (r, i) {
            return /^\d+$/.test(r.start) && /^\d+$/.test(r.end) && Number(r.start) > 0 &&
                Number(r.end) - Number(r.start) + 1 === r.cartons && (!i || Number(r.start) === Number(ordered[i - 1].end) + 1);
        });
        // Legacy noncontiguous carton assignments must not become a fictitious min-max range.
        if (members.length === 1 || editable && !blank && !contiguous) { members.forEach(function (l) { result.push(l); }); return; }
        var row = Object.assign({}, members[0]);
        row._skuMembersCp2 = members.map(function (l) { return { id: l.shipmentLineId, cartons: Number(l.cartonQty) }; });
        ['qty', 'cartonQty', 'shipmentCartonCbm', 'grossWeight', 'netWeight'].forEach(function (k) {
            row[k] = members.every(function (l) { return known(l[k]); }) ? members.reduce(function (n, l) { return n + Number(l[k]); }, 0) : '';
        });
        ['sourceCompany', 'sourceMarketplace'].forEach(function (k) {
            row[k] = members.map(function (l) { return l[k] || '--'; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(' / ');
        });
        row.cartonNoStart = blank ? '' : contiguous ? ordered[0].start : ordered.map(function (r) { return r.start === r.end ? r.start : r.start + '-' + r.end; }).join(', ');
        row.cartonNoEnd = blank || !contiguous ? '' : ordered[ordered.length - 1].end;
        result.push(row);
    });
    return result;
}

function _shCartonLinesCp2_(pairs) {
    var output = [], seen = Object.create(null);
    (pairs || []).forEach(function (p) {
        var members = p.members || [{ id: p.id }], start = String(p.start == null ? '' : p.start).trim(), end = String(p.end == null ? '' : p.end).trim();
        if (members.length > 1 && (start || end)) {
            var total = members.reduce(function (n, m) {
                if (!m.id || !Number.isInteger(m.cartons) || m.cartons < 1) throw Error('SKU_CARTON_SOURCE_INVALID');
                return n + m.cartons;
            }, 0);
            if (!/^\d+$/.test(start) || !/^\d+$/.test(end) || Number(start) < 1 || Number(end) - Number(start) + 1 !== total) throw Error('SKU_CARTON_RANGE_COUNT_MISMATCH');
        }
        var next = Number(start);
        members.forEach(function (m) {
            if (!m.id || seen[m.id]) throw Error('SKU_CARTON_SOURCE_DUPLICATED');
            seen[m.id] = true;
            var grouped = members.length > 1 && !!start;
            output.push({ shipment_line_id: m.id, carton_no_start: grouped ? String(next) : start, carton_no_end: grouped ? String(next + m.cartons - 1) : end });
            if (grouped) next += m.cartons;
        });
    });
    return output;
}

function _shMarketplaceLabel(s, lines) {
    var labels = [], seen = Object.create(null);
    (lines || []).forEach(function (line) {
        if (line.lineRemoved || (line.shipmentId && line.shipmentId !== s.shipmentId)) return;
        var label = String(line.sourceMarketplace || '').trim(), key = label.toLowerCase();
        if (label && !seen[key]) { seen[key] = true; labels.push(label); }
    });
    return labels.length ? labels.join(' / ') : s.marketplace || '--';
}

function _shOverviewLogistics_(s, lines, details) {
    if (String(s.recordOrigin || '').trim() !== 'IMPORT_HISTORICAL') return lines;
    var bySku = Object.create(null);
    (details || []).forEach(function (d) {
        var key = String(d.sku || '').trim().toLowerCase();
        (bySku[key] = bySku[key] || []).push(d);
    });
    function blank(v) { return v == null || String(v).trim() === ''; }
    function number(v) { return !blank(v) && typeof v !== 'boolean' && isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : ''; }
    function kg(v, unit) {
        var factors = { kg: 1, g: 0.001, lb: 0.45359237, lbs: 0.45359237, oz: 0.028349523125 };
        var n = number(v), f = factors[String(unit || 'kg').trim().toLowerCase()];
        return n !== '' && n > 0 && f ? n * f : '';
    }
    return (lines || []).map(function (line) {
        var row = Object.assign({}, line), raw = line.raw, matches = bySku[String(line.sku || '').trim().toLowerCase()] || [];
        var d = matches.length === 1 ? matches[0] : null;
        function saved(key, canonical, legacy) {
            var v = raw ? raw[canonical] : line[key];
            if (raw && blank(v) && legacy) v = raw[legacy];
            return v;
        }
        var qty = number(saved('qty', 'shipment_qty', 'qty'));
        var count = saved('cartonQty', 'shipment_carton_qty', 'carton_qty');
        var upc = number(saved('unitsPerCarton', 'units_per_carton'));
        if (blank(upc) || upc === 0) upc = d ? number(d.raw ? d.raw.units_per_carton : d.unitsPerCarton) : '';
        row.cartonQty = number(count);
        if (blank(count) && qty !== '' && upc > 0 && Number.isInteger(upc)) row.cartonQty = Math.ceil(qty / upc);
        if (row.cartonQty !== '' && (!Number.isInteger(row.cartonQty) || row.cartonQty === 0 && qty > 0)) row.cartonQty = '';
        row.unitsPerCarton = upc;
        var cbm = '', gross = '', net = '';
        if (d) {
            var factors = { cm: 0.01, mm: 0.001, m: 1, in: 0.0254, inch: 0.0254, inches: 0.0254 };
            var f = factors[String(d.cartonDimensionUnit || 'cm').trim().toLowerCase()];
            var dims = [d.cartonLength, d.cartonWidth, d.cartonHeight].map(number);
            if (row.cartonQty !== '' && f && dims.every(function (v) { return v !== '' && v > 0; })) cbm = row.cartonQty * dims[0] * dims[1] * dims[2] * f * f * f;
            var cartonKg = kg(d.cartonWeight, d.cartonWeightUnit), itemKg = kg(d.itemWeight, d.itemWeightUnit);
            if (row.cartonQty !== '' && cartonKg !== '') gross = row.cartonQty * cartonKg;
            if (qty !== '' && itemKg !== '') net = qty * itemKg;
        }
        // Saved totals win; only absent values use the current SKU reference. Never persist estimates.
        [['shipmentCartonCbm', 'shipment_carton_cbm', 'carton_cbm', cbm],
            ['grossWeight', 'gross_weight', null, gross], ['netWeight', 'net_weight', null, net]].forEach(function (spec) {
            var v = saved(spec[0], spec[1], spec[2]);
            row[spec[0]] = number(blank(v) ? spec[3] : v);
        });
        return row;
    });
}

function _shSkuOrder_(a,b) { return String(a.sku||'').localeCompare(String(b.sku||''),'en',{numeric:true,sensitivity:'base'}); }
function _shPackingRows_(lines) {
    var core=window.KM.mixedCartons,records=core.uiRecords(lines,'shipment'),p=core.layout(records),number=0;
    function n(v,d){return v==null||v===''?'--':Number(v).toFixed(d);}
    var blocks=p.blocks.slice().sort(function(a,b){return _shSkuOrder_(a.rows.slice().sort(_shSkuOrder_)[0],b.rows.slice().sort(_shSkuOrder_)[0]);});
    return blocks.map(function(b){if(b.mixed)number++;
        var portions=core.portions(records,'SHIPDETAIL').filter(function(r){return r.groupId===b.id;}).sort(_shSkuOrder_);
        var cartonOwner=portions.find(function(r){return r.cartons>0;})||portions[0];
        return portions.map(function(r,i){var span=' rowspan="'+portions.length+'" style="text-align:right;vertical-align:middle;"';
            return '<tr'+(b.mixed?' class="sp-mixed-row"':'')+'><td>'+(i===0?'<small class="sp-packing-label">'+(b.mixed?'Mixed '+number:'Standard')+'</small>':'')+_shEsc(r.sku)+'</td><td style="text-align:right">'+r.quantity+'</td>'+
                (i===0?'<td'+span+'>'+b.cartons+'</td><td'+span+'>'+n(cartonOwner.cbm,3)+'</td><td'+span+'>'+n(cartonOwner.grossKg,2)+'</td>':'')+
                '<td style="text-align:right">'+n(r.netKg,2)+'</td>'+(i===0?'<td'+span+'>'+b.start+'</td><td'+span+'>'+b.end+'</td>':'')+'</tr>';
        }).join('');
    }).join('');
}

function _shRenderDbCard(s, planLines, mode) {
    var sid = s.shipmentId;
    var statusLabel = (mode === 'overview') ? _shArrivalStateOf_(s).label : (SH_STATUS_LABEL[s.status] || s.status || '—');   // A-DELTA1 C2 item 1
    var status = s.status;
    // Execution FIELDS editable only in the Draft workspace, and only while draft / ready_to_ship
    // (shipped is read-only on the Draft page; Overview is always read-only).
    var fieldsEditable = (mode === 'draft') && (status === 'draft' || status === 'ready_to_ship');

    // SKU Lines — logistics copied (read-only) + editable carton number range.
    // Columns: SKU / Qty / Cartons / CBM (line total) / Gross Wt / Net Wt / Carton No. Start / End.
    var hasPacking=planLines.some(function(l){return String((l.raw||l).note).indexOf('[KMPACK1:')>=0;});
    var metricLines = mode === 'overview' && !hasPacking ? _shOverviewLogistics_(s, planLines, _shReadModel && _shReadModel.skuLogistics) : planLines;
    var displayLinesCp2 = _shSkuGroupsCp2_(metricLines, fieldsEditable).slice().sort(_shSkuOrder_);
    var rows = displayLinesCp2.map(function(l) {
        function n(v, digits) { return (v === '' || v == null) ? '--' : digits != null && mode === 'overview' ? Number(v).toFixed(digits) : v; }
        function cartonCell(which, val) {
            if (!fieldsEditable) return '<td style="text-align:right;">' + (val === '' || val == null ? '--' : _shEsc(val)) + '</td>';
            return '<td style="text-align:right;"><input type="number" min="0" step="1" data-line-id="' + _shEsc(l.shipmentLineId) + '" data-carton="' + which + '" data-carton-members="' + _shEsc(JSON.stringify(l._skuMembersCp2 || [])) + '" value="' + _shEsc(val) + '" oninput="_shClearCartonError(\'' + _shEsc(sid) + '\')" style="width:78px;text-align:right;padding:2px 4px;border:1px solid #E2E8F0;border-radius:4px;font-size:12px;"></td>';
        }
        return '<tr>' +
            '<td>' + _shEsc(l.sku) + ((s.sourceCompanies || []).length > 1 ? '<small style="display:block;color:#596578">' + _shEsc(l.sourceCompany || '--') + ' / ' + _shEsc(l.sourceMarketplace || '--') + '</small>' : '') + '</td>' +
            '<td style="text-align:right;">' + _shNum(l.qty) + '</td>' +
            '<td style="text-align:right;">' + n(l.cartonQty) + '</td>' +
            '<td style="text-align:right;">' + n(l.shipmentCartonCbm, 3) + '</td>' +
            '<td style="text-align:right;">' + n(l.grossWeight, 2) + '</td>' +
            '<td style="text-align:right;">' + n(l.netWeight, 2) + '</td>' +
            cartonCell('start', l.cartonNoStart) +
            cartonCell('end', l.cartonNoEnd) +
            '</tr>';
    }).join('');
    if(hasPacking) {
        try { rows=_shPackingRows_(planLines); }
        catch(e) {rows='<tr><td colspan="8" role="alert">'+_shEsc(e.code||e.message)+'</td></tr>';}
    }
    // Totals row. Total CBM = Σ(shipment_carton_cbm) — each line already holds its LINE-TOTAL CBM, so
    // sum directly (NEVER multiply by cartons in the frontend). Matches shipments.shipment_total_cbm.
    var tQty = planLines.reduce(function(a, l) { return a + _shNum(l.qty); }, 0);
    var tCtn = planLines.reduce(function(a, l) { return a + _shNum(l.cartonQty); }, 0);
    var tCartonCbm = planLines.reduce(function(a, l) { return a + _shNum(l.shipmentCartonCbm); }, 0);
    var tGross = planLines.reduce(function(a, l) { return a + _shNum(l.grossWeight); }, 0);
    var tNet = planLines.reduce(function(a, l) { return a + _shNum(l.netWeight); }, 0);
    function metricTotal(key, digits, legacy) {
        if (mode !== 'overview') return digits == null ? legacy : legacy.toFixed(digits);
        if (!metricLines.every(function (l) { return l[key] !== '' && l[key] != null && isFinite(Number(l[key])); })) return '--';
        var sum = metricLines.reduce(function (n, l) { return n + Number(l[key]); }, 0);
        return digits == null ? sum : sum.toFixed(digits);
    }
    var footRow = '<tr style="font-weight:600;border-top:2px solid #CBD5E1;">' +
        '<td>Total: ' + planLines.map(function (l) { return l.sku; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).length + ' SKU</td>' +
        '<td style="text-align:right;">' + tQty + '</td>' +
        '<td style="text-align:right;">' + metricTotal('cartonQty', null, tCtn) + '</td>' +
        '<td style="text-align:right;">' + metricTotal('shipmentCartonCbm', 3, tCartonCbm) + '</td>' +
        '<td style="text-align:right;">' + metricTotal('grossWeight', 2, tGross) + '</td>' +
        '<td style="text-align:right;">' + metricTotal('netWeight', 2, tNet) + '</td>' +
        '<td>—</td><td>—</td>' +
        '</tr>';

    // Execution fields form (clean 2-column grid). Editable only when fieldsEditable; Carrier is
    // always read-only (chosen on the Shipping Plan). Internal shipment_id is never editable.
    function fld(label, key, val, type) {
        var v = _shEsc(val);
        var inner = fieldsEditable
            ? '<input class="sh-exec-input" data-field="' + key + '" type="' + (type || 'text') + '" value="' + (type === 'date' ? _shEsc(_shYmd_(val)) : v) + '" style="width:100%;padding:5px 8px;border:1px solid #CBD5E1;border-radius:4px;font-size:13px;box-sizing:border-box;">'
            : '<div style="padding:5px 0;font-size:13px;color:#1E293B;">' + (v || '--') + '</div>';
        return '<div style="display:flex;flex-direction:column;gap:2px;">' +
            '<label style="font-size:11px;color:#64748B;">' + label + '</label>' + inner + '</div>';
    }
    function roField(label, val) {
        return '<div style="display:flex;flex-direction:column;gap:2px;">' +
            '<label style="font-size:11px;color:#64748B;">' + label + '</label>' +
            '<div style="padding:5px 0;font-size:13px;color:#1E293B;">' + (_shEsc(val) || '--') + '</div></div>';
    }
    // S7-R2A — the carrier, named rather than numbered.
    //
    // The identity stays carrier_id and stays visible: this field is read-only here (the carrier is chosen on
    // the plan, not here), so showing the name ALONE would hide the value every join, every export and every
    // support conversation is actually about. Name first because that is what an operator reads; id beneath it
    // because that is what the system means. When the name is not known the id is still the headline - the one
    // thing this must never do is replace an identity it cannot resolve with a reassuring blank.
    function carrierField() {
        var d = _shCarrierCell_(s.carrierId);
        if (d.state === 'NONE' || !String(s.carrierId || '').trim()) return '<div class="sh-carrier-cell">' + roField('Carrier', '') + _shAssignHtml_(s) + '</div>';   // AD3 D r2: blank carrier = to be assigned; fill later
        var sub = (d.state === 'RESOLVED')
            ? _shEsc(d.carrierId)
            : (d.state === 'UNREAD'
                ? 'carrier list not loaded'
                : 'not in the carrier master');
        return '<div style="display:flex;flex-direction:column;gap:2px;">' +
            '<label style="font-size:11px;color:#64748B;">Carrier</label>' +
            '<div style="padding:5px 0;font-size:13px;color:#1E293B;">' + _shEsc(d.text) +
            '<span style="display:block;font-size:11px;color:#94A3B8;">' + sub + '</span>' +
            '</div>' + _shAssignHtml_(s) + '</div>';   // AD3 D r4: booking channel -> executing carrier (B 12 case b)
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
    function customsLabel(code) {
        var matches = _rateCards.filter(function (c) { return String(c.customsType || '').trim() === code; });
        var selected = matches.filter(function (c) { return String(c.rateCardId || '') === String(s.rateCardId || ''); });
        var labels = [];
        (selected.length === 1 ? selected : matches).forEach(function (c) {
            var label = String(c.customsTypeLabel || c.customs_type_label || '').trim();
            if (label && label !== code && labels.indexOf(label) < 0) labels.push(label);
        });
        var display = window.KM && window.KM.display;
        return display && typeof display.customsType === 'function' ? display.customsType(code, labels.length === 1 ? labels[0] : '') : (labels.length === 1 ? labels[0] : code);
    }
    // R71-FE-8 (SH3): the Method, explicit and editable while the shipment is editable. Options = the shipping_method TOKENS of the active rate
    // cards for this destination country (never translated; the label is the card's own), plus the current value. Saved by updateShipment.
    // R71-FE-11: the Method is shown, not typed: it is chosen together with the carrier in the rate-card box below (ONE selection write)
    function methodFld() {
        var cur = String(s.shippingMethod || '').trim();
        return '<div style="display:flex;flex-direction:column;gap:2px;"><label style="font-size:11px;color:#64748B;">Shipping Method</label>' +
            '<div style="padding:5px 0;font-size:13px;color:#1E293B;">' + (_shEsc(_shEnumDisplay_('shippingMethod', cur || s.shippingMethodDisplay)) || '--') +
            '</div></div>';
    }
    function customsFld() {
        var label = '<label style="font-size:11px;color:#64748B;">Customs Type</label>';
        _shCustomsRead_(s);
        if (_shCustomsNa_(s)) return '<div>' + label + '<select disabled aria-label="Customs type"><option>Not required - domestic transport</option></select></div>';
        if (!fieldsEditable) {
            return '<div style="display:flex;flex-direction:column;gap:2px;">' + label +
                '<div style="padding:5px 0;font-size:13px;color:#1E293B;">' + (_shEsc(customsLabel(_customsVal)) || '--') + '</div></div>';
        }
        var opts = '<option value="">-- Select --</option>' + _customsOpts.map(function(v) {
            return '<option value="' + _shEsc(v) + '"' + (v === _customsVal ? ' selected' : '') + '>' + _shEsc(customsLabel(v)) + '</option>';
        }).join('');
        return '<div style="display:flex;flex-direction:column;gap:2px;">' + label +
            '<select class="sh-exec-input" data-field="shipments_customs_type" onchange="_shLaneEdited_(\'' + _shEsc(sid) + '\')" style="width:100%;padding:5px 8px;border:1px solid #CBD5E1;border-radius:4px;font-size:13px;box-sizing:border-box;">' + opts + '</select></div>';
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
        // N01 (A final2): the picker shows the CANONICAL destination (destinationWarehouseId = destination_warehouse_id, the legacy
        // warehouse_id only as its read fallback). A plan-made Draft has no warehouse_id: the old picker showed nothing and Save posted ''.
        var curId = String(s.destinationWarehouseId || s.warehouseId || '').trim();
        var curCode = String(s.warehouseCode || '').trim();
        if (!fieldsEditable) {
            var disp = curCode ? (curCode + (curId ? ' (' + curId + ')' : '')) : (curId || '');
            return '<div style="display:flex;flex-direction:column;gap:2px;">' + label +
                '<div style="padding:5px 0;font-size:13px;color:#1E293B;">' + (_shEsc(disp) || '--') + '</div></div>';
        }
        var all = _shGetWarehouses();
        if (curId && !curCode) { var cw0_ = all.filter(function (w) { return String(w.warehouseId || '').trim() === curId; }); if (cw0_.length === 1) curCode = String(cw0_[0].warehouseCode || '').trim(); }   // N01: the code snapshot of the shown warehouse (exact id, one row)
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
            if (country && w.country && !_shDestinationCountryOk_(w.country, country)) return false;
            return true;
        }
        // §22.0(F) FBA: warehouse_type=FBA AND warehouse marketplace='Amazon' (the operator marketplace,
        // spec-mandated — NOT literal equality to the shipment's marketplace account) within company/country.
        // AD3 D (Owner decision 12; Author C contract 3b): a Walmart-family shipment (site Walmart / KM Walmart) lists the ACTUAL WFS fulfilment
        // centres instead: warehouse_type FBA, warehouse marketplace of the same platform family, same company / country, never the two LOGICAL
        // WFS rows (not a physical ship-to). Every other shipment keeps the Amazon rule above, byte for byte.
        var _wmt = _shPlatformFamily_(s.marketplace) === 'walmart';
        var fba = eligible.filter(function(w) {
            if (!eq(w.warehouseType, 'FBA') || !scoped(w)) return false;
            if (_wmt) return _shPlatformFamily_(w.marketplace) === 'walmart' && !_shLogicalPlatformWh_(w.warehouseId) && !!String(w.company || '').trim();
            return eq(w.marketplace, 'Amazon');
        });
        // §22.0(G) 3PL: warehouse_type=3PL within company/country scope; marketplace MAY be blank (not required).
        var _src = String(s.sourceWarehouseId || '').trim();   // AD3 D (Author C 2): a 3PL -> 3PL transfer never ships to its own source
        var tpl = eligible.filter(function(w) { return eq(w.warehouseType, '3PL') && scoped(w) && !(_src && eq(w.warehouseId, _src)); });
        // §22.0(H) deterministic order within each group: logistics_region -> warehouse_code.
        function ordr(a, b) {
            var r = String(a.logisticsRegion || '').localeCompare(String(b.logisticsRegion || ''));
            return r !== 0 ? r : String(a.warehouseCode || '').localeCompare(String(b.warehouseCode || ''));
        }
        fba.sort(ordr); tpl.sort(ordr);
        // A-delta2 F (Owner rule 5): ONE flat list of the legal choices (FBA rows first, then 3PL, each in the order above). Option text = the
        // warehouse NAME; when two listed names repeat, ' (' + warehouse code + ')' - the code only. Value = warehouse_id. No optgroup.
        // A saved destination that is not in the list is NOT inserted as an option (b3 showed it under "Current selection (outside current
        // filter)"): the select is blank, a note beside it says why, and Save keeps the saved value untouched (_shCollectExec omits the
        // destination fields while the held value is not replaced; Ship / Confirm refuse until a legal warehouse is chosen).
        var legal = fba.concat(tpl), nameCount = {};
        function nm(w) { return String(w.warehouseName || '').trim() || String(w.warehouseCode || '').trim() || String(w.warehouseId || ''); }
        legal.forEach(function (w) { var k = nm(w).toLowerCase(); nameCount[k] = (nameCount[k] || 0) + 1; });
        function optOf(w) {
            var n = nm(w), code = String(w.warehouseCode || '').trim(), disp = (nameCount[n.toLowerCase()] > 1 && code && code !== n) ? n + ' (' + code + ')' : n;
            return '<option value="' + _shEsc(w.warehouseId) + '" data-code="' + _shEsc(w.warehouseCode) + '"' +
                (eq(w.warehouseId, curId) ? ' selected' : '') + '>' + _shEsc(disp) + '</option>';
        }
        var inList = {};
        legal.forEach(function(w) { if (w.warehouseId) inList[w.warehouseId] = true; });
        var held = (curId && !inList[curId]) ? curId : '', note = '';
        if (held) {
            var cw = all.filter(function(w) { return eq(w.warehouseId, curId); })[0];
            var why = !cw ? '倉庫主檔找不到這個倉庫' : _shLogicalPlatformWh_(cw.warehouseId) ? 'WFS 邏輯總倉不是實際收貨地址，請選這一票實際的 WFS 倉' : cw.isActive === false ? '倉庫未啟用' : cw.isFactoryWarehouse === true ? '工廠倉不能當目的地'
                : (company && cw.company && !eq(cw.company, company)) ? '倉庫屬於其他公司' : (country && cw.country && !_shDestinationCountryOk_(cw.country, country)) ? '倉庫國家與 Shipment 不同'
                : '此類型的倉庫不能在這裡選';
            note = '原本儲存的目的倉 ' + (curCode || curId) + ' 目前不能選：' + why + '。儲存不會改動它；要 Confirm 前請選一個可選的倉庫。';
        } else if (!curId && curCode) {
            note = '原本只有倉庫代碼 ' + curCode + '，沒有倉庫 ID；請選一個倉庫。';
        } else if (!curId && _wmt) {
            // AD3 D: the plan carried the logical destination (Walmart / KM Walmart); this shipment needs its actual WFS ship-to
            note = '目的地是 ' + (String(s.destination || s.marketplace || '').trim() || 'Walmart') + '（WFS 邏輯目的地）：請選這一票實際的 WFS 收貨倉。' + (fba.length ? '' : ' 倉庫主檔目前沒有這個平台的 WFS 實際倉（需先新增主檔列）。');
        }
        var hasCandidates = legal.length > 0;
        var placeholder = '<option value="" data-code="">' + _shEsc(hasCandidates ? '-- Select warehouse --' : '--') + '</option>';
        var sel = '<select class="sh-exec-input" data-field="warehouse_id"' + (curId ? ' data-canonical="' + _shEsc(curId) + '"' : '') + (held ? ' data-held="' + _shEsc(held) + '"' : '') + (hasCandidates ? '' : ' disabled') + ' onchange="shWarehousePick(\'' + _shEsc(sid) + '\');_shLaneEdited_(\'' + _shEsc(sid) + '\')" ' +
            'style="width:100%;padding:5px 8px;border:1px solid #CBD5E1;border-radius:4px;font-size:13px;box-sizing:border-box;">' +
            placeholder + legal.map(optOf).join('') + '</select>';
        var noteHtml = note ? '<div class="sh-wh-note" data-field-note="warehouse_id" role="status" style="font-size:11px;color:#B91C1C;margin-top:3px;white-space:normal;overflow-wrap:anywhere;">' + _shEsc(note) + '</div>' : '';
        // Hidden mirror — warehouse_code is COPIED from the chosen option so _shCollectExec persists BOTH
        // warehouse_id and warehouse_code (identity + snapshot).
        var hidden = '<input type="hidden" data-field="warehouse_code" id="sh-whcode-' + _shEsc(sid) + '" value="' + _shEsc(curCode) + '">';
        var help = hasCandidates ? '' : '<div style="font-size:11px;color:#DC2626;margin-top:3px;">No active warehouse for this company / country. Set the shipment context, or add a warehouse in Warehouse Master.</div>';
        return '<div style="display:flex;flex-direction:column;gap:2px;">' + label + sel + hidden + noteHtml + help + '</div>';
    }
    var execGrid =
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;">' +
            fld('Shipment ID (external)', 'external_shipment_id', s.externalShipmentId) +
            carrierField() +
            methodFld() +
            (fieldsEditable ? '<div class="sh-rc" data-sid="' + _shEsc(sid) + '" style="display:flex;flex-direction:column;gap:4px;"><label style="font-size:11px;color:#64748B;">Transport rate card</label>' +   // REVIEW-FIX7-MS-NEXT (R7-x)
                '<div style="font-size:12px;color:#1E293B;">' + _shEsc(_shRcState_(s).say) + '</div>' + '<div class="sh-rc-cost" id="sh-rc-cost-' + _shEsc(sid) + '" style="font-size:12px;">' + _shRcCostHtml_(s) + '</div>' +
                '<button type="button" class="sh-rc-load" onclick="shRateCardLoad(this)" aria-expanded="false" style="align-self:flex-start;background:#2563EB;color:#FFFFFF;border:1px solid #2563EB;border-radius:4px;padding:5px 12px;font-size:12px;cursor:pointer;min-width:84px;min-height:30px;">Edit</button><div class="sh-rc-list" hidden style="font-size:12px;"></div></div>' : '') +
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
        return '<button onclick="' + onclick + '" style="margin-top:8px;margin-right:8px;background:' + bg + ';color:#fff;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;font-size:13px;min-width:108px;white-space:nowrap;text-align:center;">' + label + '</button>';   // R71-FE-11: room for the busy text
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
        // F1-7N-FC-1A-R1 §F — Cancel is offered ONLY pre-dispatch. It is deliberately absent for
        // shipped / in_transit / arrived / received / closed / cancelled: once units have physically left,
        // releasing a reservation would be a lie about stock that is gone, and the server refuses it anyway
        // (SHIPMENT_ALREADY_DISPATCHED). Offering a button the server must refuse teaches the operator that
        // refusals are noise.
        // R71-FE-12: in the Sandbox copy cancelShipmentDraft is NOT allow-listed - the control says so and cannot be pressed
        var cancelBtn = window.KM_SANDBOX_GUARD_ ? ('<button id="sh-cancel-' + sid + '" type="button" disabled aria-disabled="true" data-not-available="cancelShipmentDraft" title="Cancelling a shipment draft is not available in this Sandbox yet (not on the allow list). Nothing will be sent."' +
            ' style="margin-top:8px;margin-right:8px;background:#E2E8F0;color:#64748B;border:1px dashed #94A3B8;padding:6px 14px;border-radius:4px;cursor:not-allowed;font-size:13px;min-width:108px;white-space:nowrap;">' +
            'Cancel Shipment Draft \u2014 not available yet</button>')
            : '<button id="sh-cancel-' + sid + '" onclick="shCancelShipmentDraft(\'' + sid + '\', \'' + status + '\')"' +
            ' style="margin-top:8px;margin-right:8px;background:#DC2626;color:#fff;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;font-size:13px;">' +
            'Cancel Shipment Draft</button>';
        if (status === 'draft') {
            actionsHtml = btn("shSaveExecution('" + sid + "')", 'Save', '#10B981') +
                          btn("shReadyToShip('" + sid + "')", 'Ready to Ship →', '#3B82F6') +
                          btn("shDiagnoseShipment15('" + sid + "')", 'Diagnose (read only)', '#64748B') +
                          cancelBtn;
        } else if (status === 'ready_to_ship') {
            actionsHtml = btn("shSaveExecution('" + sid + "')", 'Save', '#10B981') +
                          btn("shConfirmShipment('" + sid + "')", 'Confirm Shipment 🚢', '#0EA5E9') +
                          btn("shReturnToDraft('" + sid + "')", '← Return to Draft', '#94A3B8') +
                          btn("shDiagnoseShipment15('" + sid + "')", 'Diagnose (read only)', '#64748B') +
                          (s.documentGenerationStatus === 'NOT_REQUIRED' ? '' : btn("shDiagnoseDocValues16('" + sid + "')", 'Diagnose document values', '#64748B')) +
                          cancelBtn;
        } else if (status === 'cancelled') {
            // A cancelled draft is a read-only record. It keeps its card so the operator can SEE that the
            // cancellation landed, and it offers no action at all.
            actionsHtml = '<p style="margin:8px 0 0;color:#991B1B;font-size:12px;">Cancelled' +
                (s.cancelReason ? (' — ' + _shEsc(s.cancelReason)) : '') +
                '. The factory stock reservation was released; current stock was not deducted.</p>';
        }
        // status === 'shipped' (and later): NO lifecycle button — progress is event-derived.
    } else {
        // F1-6B Part B — Shipping Detail / Packing List documents for a dispatched shipment (the frozen R2B snapshot
        // exists). Thin: the frontend only sends { shipment_id, document_type, generate_file } and opens the returned
        // download_url via the existing R3C adapters — NO placeholder mapping / totals / template / master / file build.
        if (SH_DOC_READY_STATUSES[status] && s.documentGenerationStatus !== 'NOT_REQUIRED') actionsHtml += _shDocActionsHtml(sid);
        actionsHtml += _shManualPosHtml_(s);   // AD3 D: manual position report (manual-logistics shipments only; '' otherwise)
    }
    // F1-7N-FB-1(J) — the shared Document Panel, in the right-side detail column directly below the
    // Execution Fields, for BOTH pages. It reads ONLY backend registry metadata already attached to the
    // shipment view-model; a shipment with none (e.g. a Demo row with a blank external_shipment_id)
    // truthfully renders "No documents generated yet" rather than a fabricated folder or file.
    // Shown once documents can exist: post-dispatch, or as soon as the registry has any row for this shipment.
    // A pre-dispatch draft stays clean rather than showing an empty panel it can do nothing about.
    if (s.documentGenerationStatus !== 'NOT_REQUIRED' && ((status !== 'draft' && status !== 'ready_to_ship') || (s.documents && s.documents.length))) {
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
    '<div class="history-card' + (mode === 'overview' ? ' history-card--overview' : '') + '" id="sh-card-' + _shEsc(sid) + '" style="border:1px solid #E2E8F0;border-radius:8px;background:#fff;margin-bottom:12px;">' + _shHoldBannerHtml17_(sid) +   // R15e step 3 r5: the hold notice / release control, from hold state
        '<div class="history-card-header sh-card-heading' + (mode === 'overview' ? ' sh-card-heading--overview' : '') + '" onclick="toggleShipmentCard(\'' + _shEsc(sid) + '\', event)">' +
            '<div class="sh-card-heading__info"><div class="sh-card-heading__identity">' +
                '<strong style="font-size:14px;">' + _shEsc(s.externalShipmentId || s.shipmentNo || sid) + '</strong>' +
                (mode === 'draft' ? '' : '<span class="sh-card-status" style="padding:2px 8px;border-radius:10px;background:#EEF2FF;color:#3730A3;font-size:12px;">' + _shEsc(statusLabel) + '</span>') +
                (mode === 'overview' && !s.shippingPlanId ? '' : '<span class="sh-card-plan" style="color:#64748B;font-size:12px;">Plan: ' + _shEsc(s.shippingPlanId || '') + '</span>') +
            '</div>' +
            '<div class="sh-card-heading__facts">' +
                '<span><strong>Marketplace:</strong> ' + _shEsc(mode === 'draft' ? _shMarketplaceLabel(s, planLines) : s.marketplace || '--') + '</span>' +
                '<span><strong>Company:</strong> ' + _shEsc((s.sourceCompanies || []).length > 1 ? s.sourceCompanies.join(' / ') : s.company || '--') + '</span>' +
                (mode !== 'overview' && _shIsNewOpening(s) && String(s.openingSupplyMode || '').toUpperCase() === 'DISPLAY_ONLY' ? '<span class=\"sh-opening-badge\" title=\"Amazon receipt tracking\"><strong>Amazon 收貨紀錄</strong>（不增加庫存）· 資料時間 ' + _shEsc(s.openingAsOf || '未提供') + '</span>' : '') +
                '<span><strong>Country:</strong> ' + _shEsc(s.country || '--') + '</span>' +
                '<span><strong>Destination:</strong> ' + _shEsc(s.destination || '--') + '</span>' +
                '<span><strong>Method:</strong> ' + _shEsc(_shEnumDisplay_('shippingMethod', s.shippingMethod) || '--') + '</span>' +
                '<span><strong>Customs Type:</strong> ' + _shEsc(customsLabel(_customsVal) || '--') + '</span>' +
                '<span><strong>Pcs:</strong> ' + _shNum(s.totalQty) + '</span>' +
                '<span><strong>ETD:</strong> ' + _shEsc(s.etd || '--') + '</span>' +
                '<span><strong>ETA:</strong> ' + _shEsc(s.eta || '--') + '</span>' +
            '</div></div>' +
            '<button type="button" class="history-expand-btn" aria-expanded="false" style="padding:6px 12px;border:1px solid #E2E8F0;border-radius:4px;background:#fff;cursor:pointer;font-size:13px;color:#3B82F6;" onclick="event.stopPropagation();toggleShipmentCard(\'' + _shEsc(sid) + '\', event)">Expand</button>' +
        '</div>' +
        '<div class="history-card-details" style="display:none;padding:16px;border-top:1px solid #E2E8F0;background:#F8FAFC;">' +
            '<div class="sh-card-detail-layout" style="display:grid;grid-template-columns:1.6fr 1fr;gap:24px;">' +
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
    try {
        _shCartonLinesCp2_(Object.keys(byId).map(function (id) {
            var p = byId[id], inp = p.start || p.end, members = JSON.parse(inp.getAttribute('data-carton-members') || '[]');
            return { id: id, start: p.start ? p.start.value : '', end: p.end ? p.end.value : '', members: members.length ? members : null };
        }));
    } catch (e) { return markErr(shipmentId, 'Carton range must match the SKU carton count (' + e.message + ').', []); }
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

// R71-FE-1 (edit conflict, Owner D4 - LOCAL CANDIDATE): every updateShipment this page sends carries the row token it read from the
// 57_ Workspace (updated_at as 'yyyy-MM-dd HH:mm:ss'); a value in no second-precision form the server parses is not sent (= r7
// last-write-wins). While the post-write re-read is in flight (_shReadModel is null) a press is held back instead of being sent without a
// token. EDIT_CONFLICT is shown on the card (each field that differs: yours / now saved) with Reload; nothing is resent.
function _shTokFmt_(v) {
    var s = String(v == null ? '' : v).trim();
    return (/^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$/.test(s) ||
        /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:?[0-9]{2})$/.test(s) ||
        /[0-9]{2}:[0-9]{2}:[0-9]{2} GMT[+-][0-9]{4}/.test(s)) ? s : '';
}
function _shTok_(shipmentId) { var r = _shFindShipment_(shipmentId); return r ? _shTokFmt_(r.updatedAt || r.updated_at) : ''; }
// R71-FE-2 (review m-1): one updateShipment per shipment card at a time - a second press while one is in flight sends nothing
var _shInFlight_ = {};
var SH_UPD_WAIT_DEFAULT_MS_15C_ = 120000;   // AGL02-SH: the longest a shipment update is waited for before its outcome is UNKNOWN (window.SH_UPD_WAIT_MS_15C_ may override it)
function _shUpd_(shipmentId, payload, afterSave) {
    if (_shInFlight_[shipmentId]) return Promise.reject(new Error('IN_FLIGHT'));
    _shInFlight_[shipmentId] = true;
    SH_UPD_PHASE_17_[shipmentId] = 'update'; SH_AFTER_SENT_17_[shipmentId] = null; SH_LAST_SENT_17_[shipmentId] = { at: Date.now(), perfAt: _shPerf17_(), sess: SH_PAGE_SESS_17_, token: String((payload && payload.expected_updated_at) || ''), lines: !!(payload && payload.lines), fields: _shChangedFields17_(shipmentId, payload) };   // R15e step 3 (r2): the token it was sent with + only the fields it CHANGED
    var _rel11 = _shHoldCard_(shipmentId, payload);   // R71-FE-11
    var gaveUp = false, timer = null, waitMs = Number(window.SH_UPD_WAIT_MS_15C_) > 0 ? Number(window.SH_UPD_WAIT_MS_15C_) : SH_UPD_WAIT_DEFAULT_MS_15C_;
    var call = Promise.resolve().then(function () { return window.KM.DB.updateShipment(payload); })
        .then(function (r) { if (r && r.success === false) { var e = new Error(r.code || r.error || 'SAVE_REFUSED'); e.kmServerAnswered = true; throw e; } if (gaveUp) return r; if (!afterSave) return r;
            SH_UPD_PHASE_17_[shipmentId] = 'after'; clearTimeout(timer); timer = setTimeout(function () { gaveUp = true; var e2 = new Error('NO_ANSWER_AFTER_' + Math.round(waitMs / 1000) + 'S_RATE_CARD_STEP'); e2.kmNoAnswer = true; e2.kmPhase = 'after'; if (noAnswerRej17) noAnswerRej17(e2); }, waitMs);   // R15e step 3 r3 (m-r2-1): the update ANSWERED; the auto rate-card step has its OWN timer
            var ap17 = afterSave(r); if (!SH_AFTER_SENT_17_[shipmentId]) _shAfterSent17_(shipmentId, null);   // r4 m-r3-1: the window starts at the auto step (its selection send re-stamps it)
            return Promise.resolve(ap17).then(function (quote) { _shAfterSettled17_(shipmentId, quote); if (quote && quote.sent === true && quote.answered !== true && !_shSaveHoldHas17_(shipmentId)) _shSaveHoldSet17_(shipmentId, 'Save', 'after'); return Object.assign({}, r, { auto_rate_card: quote }); }); });
    var noAnswerRej17 = null; var noAnswer = new Promise(function (res, rej) { noAnswerRej17 = rej; timer = setTimeout(function () { gaveUp = true; var e = new Error('NO_ANSWER_AFTER_' + Math.round(waitMs / 1000) + 'S'); e.kmNoAnswer = true; rej(e); }, waitMs); });
    return Promise.race([call, noAnswer])
        .then(function (r) { clearTimeout(timer); delete _shInFlight_[shipmentId]; _rel11(); return r; }, function (e) { clearTimeout(timer); delete _shInFlight_[shipmentId]; _rel11(); throw e; });
}
// R71-FE-11: the card's lifecycle buttons are held while one update runs; the pressed one says what is happening and keeps its size
function _shHoldCard_(shipmentId, payload) {
    var st = payload && payload.status, fn = st === 'ready_to_ship' ? 'shReadyToShip' : st === 'shipped' ? 'shShip' : st === 'draft' ? 'shReturnToDraft' : 'shSaveExecution', lbl = st ? 'Updating\u2026' : 'Saving\u2026', held = [];
    try {
        var q = String(shipmentId).replace(/[^A-Za-z0-9_\-]/g, '');
        Array.prototype.forEach.call(document.querySelectorAll('button[onclick*="' + q + '"]'), function (b) {
            var oc = String(b.getAttribute('onclick') || ''); if (!/^sh[A-Z]/.test(oc)) return;
            held.push({ b: b, t: b.innerHTML, d: b.disabled, w: b.style.minWidth, h: b.style.minHeight });
            var r = b.getBoundingClientRect ? b.getBoundingClientRect() : null; if (r && r.width) { b.style.minWidth = Math.ceil(r.width) + 'px'; b.style.minHeight = Math.ceil(r.height) + 'px'; }
            if (oc.indexOf(fn + '(') === 0) b.textContent = lbl;
            b.disabled = true; b.setAttribute('aria-busy', 'true');
        });
    } catch (e) {}
    return function () { held.forEach(function (x) { try { x.b.innerHTML = x.t; x.b.disabled = x.d; x.b.style.minWidth = x.w; x.b.style.minHeight = x.h; x.b.removeAttribute('aria-busy'); } catch (e2) {} }); };
}
function _shUnknown11_(shipmentId, err, what) {   // an update that got no server answer: never resent - read back and say so
    if (err && err.kmServerAnswered) return false;
    _shSaveHoldSet17_(shipmentId, what, err && err.kmPhase === 'after' ? 'after' : 'update');   // R15e step 3: held until definite evidence (survives reload / page switch); r3: which step had no answer
    alert(what + ': the outcome is UNKNOWN (' + ((err && err.message) || err) + '). Nothing was resent. The shipment is being re-read - check it before doing anything else.');
    try { _shLoadAndRender(); } catch (e) {}
    return true;
}
// R71-FE-2 (review m-6): a short note on the card itself (role=status) instead of an alert; an alert only when the card is not on screen
var SH_LAST_SENT_17_ = {}, SH_SAVE_HOLD_ = {}, SH_SAVE_HOLD_KEY_17_ = 'km.shipment.saveHold.v1', SH_SAVE_HOLD_DEAD_MS_17_ = 7 * 60 * 1000;   // R15e step 3 (Apps Script: 6 min per execution, + 1 min margin)
function _shSentFields17_(p) { var o = {}; Object.keys(p || {}).forEach(function (k) { var v = p[k]; if (['actor', 'shipment_id', 'expected_updated_at', 'lines', 'revision_reason'].indexOf(k) >= 0 || v === undefined || (v !== null && typeof v === 'object')) return; o[k] = v == null ? '' : String(v); }); return o; }
function _shSaveHoldRead17_() { try { var v = JSON.parse(window.localStorage.getItem(SH_SAVE_HOLD_KEY_17_) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (e) { return {}; } }
function _shSaveHoldGet17_(sid) { return _shHoldPick18_(SH_SAVE_HOLD_[sid], _shSaveHoldRead17_(), sid); }   // R15F2: this environment's hold, else one that must still block (legacy / unknown environment, flagged __noEnv)
function _shSaveHoldHas17_(sid) { return !!_shSaveHoldGet17_(sid); }
function _shSaveHoldSet17_(sid, what, kind) { setTimeout(function () { try { _shHoldBannerRefresh17_(sid); } catch (e) {} }, 0); var sent = (kind === 'after' && SH_AFTER_SENT_17_[sid]) || SH_LAST_SENT_17_[sid] || { at: Date.now(), perfAt: null, sess: '', token: '', lines: true, fields: {} }, h = { at: sent.at, perfAt: sent.perfAt, sess: sent.sess, card: (kind === 'after' && sent.card) || null, kind: kind === 'after' ? 'after' : 'update', what: String(what || 'Save'), token: sent.token, lines: sent.lines, fields: sent.fields }; h.env = _shHoldEnv18_(); SH_SAVE_HOLD_[sid] = h;   // R15F2: the environment this hold belongs to
    try { var v = _shSaveHoldRead17_(); _shHoldPut18_(v, sid, h); window.localStorage.setItem(SH_SAVE_HOLD_KEY_17_, JSON.stringify(v)); } catch (e) {} }
function _shSaveHoldClear17_(sid) { delete SH_SAVE_HOLD_[sid]; setTimeout(function () { try { _shHoldBannerRefresh17_(sid); } catch (e) {} }, 0); try { var v = _shSaveHoldRead17_(); if (_shHoldDropOwn18_(v, sid)) window.localStorage.setItem(SH_SAVE_HOLD_KEY_17_, JSON.stringify(v)); } catch (e) {} }   // R15F2: only THIS environment's record
function _shSaveHoldSame17_(k, sent, have) { var a = String(sent == null ? '' : sent).trim(), b = String(have == null ? '' : have).trim(); if (a === b) return true;
    if (/^\d{4}-\d{2}-\d{2}$/.test(a)) return b.slice(0, 10) === a;   // a date field: the row may carry a time part
    return a !== '' && b !== '' && isFinite(Number(a)) && isFinite(Number(b)) && Number(a) === Number(b); }
// r2 (REVIEW_R15E_FINAL MAJOR-1): compare only what the save CHANGED versus the last server-confirmed values (SH_SAVED_); an unchanged header
// input sent along is no evidence. A field whose previous value is not known is left out (it cannot be judged).
function _shChangedFields17_(sid, p) { var sent = _shSentFields17_(p), prev = (typeof SH_SAVED_ === 'object' && SH_SAVED_ && SH_SAVED_[sid]) || null, o = {}; if (!prev) return o; Object.keys(sent).forEach(function (k) { if (Object.prototype.hasOwnProperty.call(prev, k) && !_shSaveHoldSame17_(k, sent[k], prev[k])) o[k] = sent[k]; }); return o; }
function _shTs17_(v) { var t = String(v == null ? '' : v).trim(); return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(t) ? t : ''; }   // the server's second-precision updated_at; anything else is not compared
// r3 (REVIEW_R15E_FINAL A2): m-r2-2 a forward-jumping wall clock cannot expire a hold early in the same page (performance.now() must agree);
// after a reload only the wall clock exists (stated in the package). m-r2-1: the auto rate-card step after a Save has its own timer / hold kind.
var SH_UPD_PHASE_17_ = {}, SH_PAGE_SESS_17_ = String(Date.now()) + '-' + String(Math.random()).slice(2, 10);
function _shPerf17_() { try { return (window.performance && typeof window.performance.now === 'function') ? window.performance.now() : null; } catch (e) { return null; } }
function _shAged17_(h, t0, p0) { if (!(t0 - Number(h.at || 0) > SH_SAVE_HOLD_DEAD_MS_17_)) return false; if (h.sess && h.sess === SH_PAGE_SESS_17_ && typeof h.perfAt === 'number' && typeof p0 === 'number') return p0 - h.perfAt > SH_SAVE_HOLD_DEAD_MS_17_; return true; }
function _shAfterRecheck17_(sid, h, t0, p0) {   // READ ONLY: the server's rate-card state for this shipment (shipment.rateCardOptions)
    var db = window.KM && window.KM.DB; function done(code, text) { _shSaveHoldClear17_(sid); _shNote_(sid, text); try { _shLoadAndRender(); } catch (e) {} return code; }
    return Promise.resolve().then(function () { if (!db || typeof db.getShipmentRateCardOptions !== 'function') throw new Error('NO_READ'); return db.getShipmentRateCardOptions(sid); }).then(function (r) {
        if (!r || r.success !== true) { _shNote_(sid, 'Could not re-check the automatic rate-card step (' + String((r && (r.code || r.error)) || 'NO_ANSWER') + '). Still held - nothing was sent.'); return 'HELD'; }
        var st = (r.current && r.current.state) || 'NONE';
        var cc = r.current || {}; if (st === 'COMPLETE' && h.card && String(cc.rate_card_id || '') === h.card.id && String(cc.rate_card_version || '') === h.card.ver) return done('RATE_DONE', 'The server shows the automatic rate-card choice of the earlier ' + h.what + ' finished. The hold is cleared; the shipment is re-read.');
        var hint18 = _shAged17_(h, t0, p0) ? ' (It was sent more than 7 minutes ago; time alone is not evidence that it ended.)' : '';   // R15F: time is a hint only - the after-hold clears only on THIS card + version COMPLETE (12_:2165) or a server answer
        _shNote_(sid, 'The earlier ' + h.what + ' was saved, but its automatic rate-card step has not answered (rate card: ' + st + '). It may still be running. Still held; nothing was sent.' + hint18); return 'HELD';
    }, function (e) { _shNote_(sid, 'Could not re-check the automatic rate-card step (' + String((e && (e.code || e.message)) || e) + '). Still held - nothing was sent.'); return 'HELD'; });
}
// R15e step 3 r5 (REVIEW_R15E_FINAL A4) on top of r4 (A3). Inserted into shipping-history.js by r15d-sh.patch.cjs (sha-pinned); every function
// is READ ONLY except the hold store in this browser.
//   r4: m-r3-1 the auto rate-card step's window starts at ITS send (both clocks restarted); m-r3-2 only a real SERVER answer to the selection, or
//       a selection that was never sent, may clear the 'after' hold, and the selection fetch has a timeout; COMPLETE clears only for the card and
//       version THIS selection sent; a per-shipment, Owner-only "Release this hold" for holds with no automatic path (Sandbox candidate; needs
//       Owner acceptance; not for Production).
//   r5: r4-m1 an after-hold that already exists when the selection is sent takes that send's clocks and card; r4-m2 the release function itself
//       enforces "no automatic path" with the SAME classification as the re-check, on its own fresh read (after-holds never), and it is not
//       exported on window; r4-m3 "Confirm release" re-reads the row and refuses if the version changed since the dialog opened.
//   r6 (A5): r5-m1 a hand release also needs BOTH clocks past 7 minutes since the send (on a row without a version the server cannot refuse a
//       late original, so the platform limit must have passed first) - checked when the dialog opens AND again at Confirm release; INFO a
//       re-check that finds an automatic path drops a stale noAutoPath flag; r5-m2 wording: shSaveHoldRelease17 IS a global function (the
//       banner's inline onclick needs it) - the real guard is its own classification + the 7-minute floor on a fresh read, not its visibility.
var SH_AFTER_SENT_17_ = {}, SH_HOLD_RELEASES_KEY_17_ = 'km.shipment.saveHoldReleases.v1';
function _shAfterSent17_(sid, chosen) {   // stamp the start of the auto rate-card window (phase switch; overwritten at the selection send)
    var st = { at: Date.now(), perfAt: _shPerf17_(), sess: SH_PAGE_SESS_17_, card: chosen ? { id: String(chosen.rate_card_id || ''), ver: String(chosen.rate_card_version || '') } : null };
    SH_AFTER_SENT_17_[sid] = st;
    var h = chosen ? _shSaveHoldGet17_(sid) : null;   // r5 r4-m1: an after-hold set BEFORE this send (a slow options read) takes the send's clocks and card
    if (h && h.kind === 'after') {
        h.at = st.at; h.perfAt = st.perfAt; h.sess = st.sess; h.card = st.card; SH_SAVE_HOLD_[sid] = h;
        try { var v = _shSaveHoldRead17_(); _shHoldPut18_(v, sid, h); window.localStorage.setItem(SH_SAVE_HOLD_KEY_17_, JSON.stringify(v)); } catch (e) {}
    }
}
function _shSelAnswered17_(x) {   // a SERVER answer to shipment.selectRateCard (success or a coded refusal); a transport failure is NOT one
    if (!x || typeof x !== 'object') return false;
    if (x.success === true) return x.verified === true;   // success without the server's own verification is not definite
    if (x.zero_write === true) return true;               // a definite refusal: nothing was written
    var code = String(x.code || x.error || '');
    if (!code || code === 'HTTP_TRANSPORT_ERROR' || code === 'NETWORK' || code === 'SELECTION_NO_ANSWER_17' || x.stage === 'network' || x.kmNoAnswer === true) return false;
    if (/UNVERIFIED|INTERRUPTED|UNKNOWN|TIMEOUT/.test(code)) return false;   // the server answered, but the write outcome itself is open
    return true;
}
function _shAfterSettled17_(sid, quote) {
    delete SH_UPD_PHASE_17_[sid];
    var h = _shSaveHoldGet17_(sid);
    if (!h || h.kind !== 'after') return;
    if (!quote || !(quote.answered === true || quote.sent === false)) return;   // m-r3-2: unknown / transport -> the hold stays
    _shSaveHoldClear17_(sid);
    _shNote_(sid, quote.sent === false ? 'The automatic rate-card step of the earlier ' + h.what + ' did not send a selection (' + String(quote.state || '') + '). The hold is cleared; the shipment is re-read.'
        : 'The server answered the automatic rate-card step of the earlier ' + h.what + ' (' + String(quote.state || '') + '). The hold is cleared; the shipment is re-read.');
    try { _shLoadAndRender(); } catch (e) {}
}
// one authoritative single-row read (the page's scoped workspace read; else getTable) - shared by the re-check and the release control
function _shSaveHoldReadRow17_(sid) {
    return Promise.resolve().then(function () {
        var api = window.KM && window.KM.api;
        if (api && typeof api.getWorkspace === 'function') return Promise.resolve(api.getWorkspace('shipment', { filters: { shipmentId: sid }, page: { number: 1, size: 5 } })).then(function (env) { if (!env || env.success !== true) throw new Error((env && (env.code || env.error)) || 'WORKSPACE_READ_FAILED'); return ((env.data && env.data.shipments) || []).map(function (x) { return (x && x.raw) || {}; }); });
        if (typeof getOperationDbTableFromSheet !== 'function') throw new Error('NO_READ');
        return getOperationDbTableFromSheet('shipments');
    }).then(function (rows) {
        var hit = (rows || []).filter(function (r) { return String(r.shipment_id || '').trim() === sid; });
        if (hit.length !== 1) throw new Error('ROW_NOT_EXACTLY_ONE');
        return hit[0];
    });
}
// r5 r4-m2: ONE classification - the re-check's "no automatic path" branch, used by the offer and enforced again inside the release
function _shSaveHoldNoAutoPath17_(h, row) {
    if (!h || h.kind === 'after') return false;                                 // an after-hold is NEVER released by hand
    if (_shTs17_(h.token) && _shTs17_(row && row.updated_at)) return false;     // a comparable version: it changes, or it expires after 7 min
    if (Object.keys(h.fields || {}).length > 0 && !h.lines) return false;      // decidable changed header fields: written, or expired
    return true;
}
// r5 (aeaa05c0 RL finding): the hold notice and the release control are RENDERED FROM HOLD STATE as part of every card (the card builder calls
// _shHoldBannerHtml17_), so any repaint keeps them. The offer only records the classification on the hold (noAutoPath) and refreshes the banner.
function _shHoldBannerHtml17_(sid) {
    var h = _shSaveHoldGet17_(sid); if (!h) return '';
    var txt = h.kind === 'after' ? 'The earlier ' + h.what + ' was saved, but its automatic rate-card step has an UNKNOWN outcome. Every action on this shipment re-checks it with the server first; nothing is resent.'
        : 'An earlier ' + h.what + ' of this shipment has an UNKNOWN outcome. Every action on this shipment re-checks it with the server first; nothing is resent.';
    return '<div class="sh-hold-banner" data-sid="' + _shEsc(sid) + '" role="status" style="color:#92400E;background:#FFFBEB;border-left:3px solid #F59E0B;padding:6px 10px;margin:6px 12px 0;font-size:12px;">' + _shEsc(txt) +
        (h.noAutoPath === true && h.kind !== 'after' ? ' <button type="button" class="sh-hold-release" style="margin-left:8px;font-size:12px;" onclick="event.stopPropagation(); shSaveHoldRelease17(\'' + _shEsc(sid) + '\')">Release this hold (only on server evidence)</button>' : '') + '</div>';
}
function _shHoldBannerRefresh17_(sid) {   // re-render the banner of every card of this shipment from the current hold state
    var cards = document.querySelectorAll('[id="sh-card-' + String(sid).replace(/"/g, '') + '"]');
    Array.prototype.forEach.call(cards, function (card) {
        var old = card.querySelector(':scope > .sh-hold-banner'); if (old) old.parentNode.removeChild(old);
        var html = _shHoldBannerHtml17_(sid); if (html) card.insertAdjacentHTML('afterbegin', html);
    });
}
function _shSaveHoldDropNoAutoFlag17_(sid) {   // r6 INFO: a re-check found an automatic path - the stored flag is stale
    var cur = _shSaveHoldGet17_(sid); if (!cur || cur.noAutoPath !== true) return;
    delete cur.noAutoPath; SH_SAVE_HOLD_[sid] = cur;
    try { var v = _shSaveHoldRead17_(); if (v[sid]) { delete v[sid].noAutoPath; window.localStorage.setItem(SH_SAVE_HOLD_KEY_17_, JSON.stringify(v)); } } catch (e) {}
    _shHoldBannerRefresh17_(sid);
}
function _shSaveHoldReleaseAged17_(h) { return _shAged17_(h, Date.now(), _shPerf17_()); }   // r6 r5-m1: the same 7-minute rule as the re-check (both clocks in this page)
function _shSaveHoldOfferRelease17_(sid, h, row) {
    if (!_shSaveHoldNoAutoPath17_(h, row)) return;
    var cur = _shSaveHoldGet17_(sid); if (!cur || cur.kind === 'after') return;
    cur.noAutoPath = true; SH_SAVE_HOLD_[sid] = cur;   // recorded on the hold itself (memory + storage), so every later render shows the control
    try { var v = _shSaveHoldRead17_(); _shHoldPut18_(v, sid, cur); window.localStorage.setItem(SH_SAVE_HOLD_KEY_17_, JSON.stringify(v)); } catch (e) {}
    _shHoldBannerRefresh17_(sid);
}
function shSaveHoldRelease17(sid) {   // R15F: the control follows the SAME evidence rules as the re-check - it never clears on time, and it never claims the request was stopped
    var h = _shSaveHoldGet17_(sid); if (!h) return Promise.resolve(null);
    return shSaveHoldRecheck17(sid).then(function (x) {
        if (!_shSaveHoldHas17_(sid)) return 'CLEARED_BY_EVIDENCE';
        _shNote_(sid, 'This hold can NOT be released: there is no termination evidence for the earlier ' + h.what + '. Clearing it in this browser would not stop a late copy of that request from writing on the server, so nothing was cleared and nothing was sent.' + (x === null ? ' (A check is already running.)' : ''));
        return 'REFUSED_NO_EVIDENCE';
    });
}
// r6 r5-m2 (corrected wording): shSaveHoldRelease17 is a GLOBAL function - the banner's inline onclick calls it. Being reachable is not the
// guard; the guard is inside it: a fresh read, the same classification as the re-check, and the 7-minute floor (open and Confirm).
// R15F2: (ii) for update-kind and unpriced holds - does the row's version PROVABLY differ from the token the request carried? 'MOVED' only when both are
// the server's 'yyyy-MM-dd HH:mm:ss' and differ by something other than an exact 15-minute step within 27 h. The R15b / v1 editTokSame_ reads a token in
// the script AND the sheet zone (SAME across any zone pair: a 15-min multiple up to 26 h, + a 1 h DST step); R15F2's is SAME only on equal strings. Anything else is not evidence.
function _shVersionMoved18_(token, rowVersion) {
    var a = _shTs17_(token), b = _shTs17_(rowVersion); if (!a) return 'NO_TOKEN'; if (!b) return 'UNREADABLE'; if (a === b) return 'SAME';
    function secs(t) { return Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10), +t.slice(11, 13), +t.slice(14, 16), +t.slice(17, 19)) / 1000; }
    var d = Math.abs(secs(a) - secs(b)); if (!isFinite(d)) return 'UNREADABLE';
    return (d % 900 === 0 && d <= 27 * 3600) ? 'AMBIGUOUS' : 'MOVED';   // R15F2: 27 h, not 14 h (review aeaa05c0 MAJOR: Taipei / Los Angeles is 16 h)
}
function _shHoldTok16_(sid) { var p = _shHoldPick18_(SH_UNPRICED_HOLD_[sid], _shHoldRead16_(), sid); return String((p && typeof p === 'object' && !p.__noEnv && p.token) || ''); }   // R15F2: a hold of another / unknown environment has no usable token here
var SH_SAVE_HOLD_BUSY_17_ = {};
function shSaveHoldRecheck17(sid) {   // READ ONLY: one server read of this shipment; never resends the save
    var h = _shSaveHoldGet17_(sid); if (!h || SH_SAVE_HOLD_BUSY_17_[sid]) return Promise.resolve(null); if (h.__noEnv) { _shNote_(sid, 'This hold was recorded without an environment, or this page cannot tell which environment it is in. It cannot be checked or cleared here. Still held; nothing was sent.'); return Promise.resolve('HELD'); }   // R15F2
    var t0 = Date.now(), p0 = _shPerf17_();   // r2 m-1: judged at the moment the read is SENT; r3 m-r2-2: wall clock AND (same page) the monotonic clock
    SH_SAVE_HOLD_BUSY_17_[sid] = true; _shNote_(sid, 'An earlier ' + h.what + ' of this shipment has an UNKNOWN outcome. Re-checking it with the server (nothing is sent)...');
    if (h.kind === 'after') return _shAfterRecheck17_(sid, h, t0, p0).then(function (x) { delete SH_SAVE_HOLD_BUSY_17_[sid]; return x; });   // r3 m-r2-1: the auto rate-card step is NOT judged by the version (the update moved it)
    return Promise.resolve().then(function () {   // the page's own scoped one-shipment read (57_ shipment.workspace.get, as the targeted readback); else getTable
        var api = window.KM && window.KM.api; if (api && typeof api.getWorkspace === 'function') return Promise.resolve(api.getWorkspace('shipment', { filters: { shipmentId: sid }, page: { number: 1, size: 5 } })).then(function (env) { if (!env || env.success !== true) throw new Error((env && (env.code || env.error)) || 'WORKSPACE_READ_FAILED'); return ((env.data && env.data.shipments) || []).map(function (x) { return (x && x.raw) || {}; }); });
        if (typeof getOperationDbTableFromSheet !== 'function') throw new Error('NO_READ'); return getOperationDbTableFromSheet('shipments'); }).then(function (rows) {
        var hit = (rows || []).filter(function (r) { return String(r.shipment_id || '').trim() === sid; });
        if (hit.length !== 1) { _shNote_(sid, 'Could not re-check (the shipment row was not found exactly once). Still held - nothing was sent.'); return 'HELD'; }
        var row = hit[0], tok = _shTs17_(h.token), cur = _shTs17_(row.updated_at), keys = Object.keys(h.fields || {}), cmp = keys.length > 0, same = cmp && keys.every(function (k) { return _shSaveHoldSame17_(k, h.fields[k], row[k]); }), aged = _shAged17_(h, t0, p0);
        if (!_shSaveHoldNoAutoPath17_(h, row)) _shSaveHoldDropNoAutoFlag17_(sid);   // R15e step 3 r6
        function done(code, text) { _shSaveHoldClear17_(sid); _shNote_(sid, text); try { _shLoadAndRender(); } catch (e) {} return code; }
        // R15F: TIME IS NEVER TERMINATION EVIDENCE. The ONLY clearing evidence for an update-kind hold is (ii): 12_ handleUpdateShipment refuses a
        // request whose expected_updated_at is DIFF from the row's updated_at under the lock (12_:2261-2265, editTokSame_ 12_:2746). Once the row
        // provably differs from the token THIS request carried, a late copy of it can no longer write. That says nothing about whether it was stored.
        var vm = _shVersionMoved18_(h.token, row.updated_at), hint = aged ? ' (It was sent more than 7 minutes ago; time alone is not evidence that it ended.)' : '';
        if (vm === 'MOVED') return done(same ? 'MOVED_VALUES_MATCH' : 'MOVED', 'The shipment\'s version moved since the earlier ' + h.what + ' was sent, so a late copy of that request can no longer write (the server refuses an outdated version).' +
            (same ? ' The values it changed are present now - stored by it or by a later write.' : ' Whether it was stored is not known.') + ' The hold is cleared; review the shipment before doing anything else.');
        if (!_shTs17_(h.token)) { _shNote_(sid, 'The earlier ' + h.what + ' carried no comparable version, so the server cannot refuse a late copy of it. There is no termination evidence: this hold cannot be cleared in the browser. Nothing was sent.' + hint); _shSaveHoldOfferRelease17_(sid, h, row); return 'HELD'; }
        if (vm === 'AMBIGUOUS') { _shNote_(sid, 'The shipment\'s version differs from the earlier ' + h.what + '\'s by an exact time-zone step, which the server may still treat as the same version. Still held; nothing was sent.' + hint); return 'HELD'; }
        if (vm === 'UNREADABLE') { _shNote_(sid, 'The shipment\'s current version could not be read in the server\'s format, so there is no termination evidence for the earlier ' + h.what + '. Still held; nothing was sent.' + hint); _shSaveHoldOfferRelease17_(sid, h, row); return 'HELD'; }
        _shNote_(sid, 'The server still shows the same version as when the earlier ' + h.what + ' was sent. That request may still run and write. Still held; nothing was sent.' + hint); return 'HELD';
    }, function (e) { _shNote_(sid, 'Could not re-check (' + String((e && (e.code || e.message)) || e) + '). Still held - nothing was sent.'); return 'HELD'; }).then(function (x) { delete SH_SAVE_HOLD_BUSY_17_[sid]; return x; });
}
window.shSaveHoldRecheck17 = shSaveHoldRecheck17;
function _shNote_(shipmentId, text) {
    var host = document.getElementById('sh-exec-' + shipmentId), list = _shActiveListEl_(), card = list ? list.querySelector('[id="sh-card-' + String(shipmentId).replace(/"/g, '') + '"]') : null;
    if (!host && !card) { alert(text); return; }
    var id = 'sh-note-' + shipmentId, old = document.getElementById(id); if (old) old.parentNode.removeChild(old);
    var html = '<div id="' + _shEsc(id) + '" class="sh-wait-note" role="status" style="color:#92400E;background:#FFFBEB;border-left:3px solid #F59E0B;padding:6px 10px;margin:6px 0;font-size:12px;">' + _shEsc(text) + '</div>';
    if (host) host.insertAdjacentHTML('beforebegin', html); else card.insertAdjacentHTML('afterbegin', html);
}
function _shTokReady_(shipmentId) {
    if (_shSaveHoldHas17_(shipmentId)) { shSaveHoldRecheck17(shipmentId); return false; }   // R15e step 3: an UNKNOWN save holds every action; pressing only re-checks
    if (_shInFlight_[shipmentId]) { _shNote_(shipmentId, 'The last save of this shipment has not been answered yet. Nothing was sent now; when the answer arrives (or is given up as UNKNOWN) the shipment is re-read.'); return false; }   // AGL02-SH
    if (!_shEffectiveWorkspace() || (_shReadModel && !_shReadPending_)) return true;   // R15C-UI: a pending re-read holds the buttons too
    _shNote_(shipmentId, 'This shipment is being re-read after the last save. Press the button again in a moment (nothing was sent).');
    return false;
}
// R71-FE-2 (first-launch run2-full): the dispatch answer was LOST. The dialog's button stays blocked and nothing is resent: the shipment is
// re-read and the dialog says what the server holds - dispatched, or not dispatched (only then may Confirm & Dispatch be pressed again).
var SH_DISPATCH_HOLD14_ = {}, SH_DISPATCH_CHECK14_ = {};
function _shDispatchHeld14_(sid) {
    if (SH_DISPATCH_HOLD14_[sid]) return true;
    try { return localStorage.getItem('km-dispatch-pending14:' + sid) === '1'; } catch (e) { return false; }
}
function _shDispatchHold14_(sid, hold) {
    if (hold) SH_DISPATCH_HOLD14_[sid] = true; else delete SH_DISPATCH_HOLD14_[sid];
    try {
        if (hold) localStorage.setItem('km-dispatch-pending14:' + sid, '1');
        else localStorage.removeItem('km-dispatch-pending14:' + sid);
    } catch (e) { /* The in-memory hold still prevents a resend in this page. */ }
}
var SH_DISPATCHED_STATUSES_R71_ = { shipped: 1, in_transit: 1, arrived: 1, partially_received: 1, received: 1, closed: 1, stuck: 1 };
function _shDispatchUnknown_(shipmentId, res, go, cancel, status) {
    function explain(text) { if(status) { status.style.color='#B45309';status.textContent=text; } else _shNote_(shipmentId,text); }
    _shDispatchHold14_(shipmentId, true);
    if (SH_DISPATCH_CHECK14_[shipmentId]) return;
    SH_DISPATCH_CHECK14_[shipmentId] = true;
    if (go) { go.disabled = true; go.textContent = 'Checking...'; }
    if (cancel) { cancel.disabled = false; cancel.textContent = 'Close'; }
    if (status) { status.style.color = '#B45309'; status.textContent = 'Confirmation is awaiting verification. Checking status only; nothing will be resent.'; }
    var actions = document.getElementById('sh-confirm-actions'), check = document.getElementById('sh-confirm-check14');
    if (actions && !check) {
        check = document.createElement('button'); check.type = 'button'; check.id = 'sh-confirm-check14'; check.textContent = 'Check status';
        check.style.cssText = 'height:36px;min-width:112px;padding:7px 12px;border:0;background:#2563EB;color:#fff;border-radius:6px;font-weight:600;cursor:pointer';
        check.addEventListener('click', function () { _shDispatchUnknown_(shipmentId, res, go, cancel, status); }); actions.appendChild(check);
    }
    if (check) check.disabled = true;
    var api = window.KM && window.KM.api, proofHandled=false, hasProofApi=false;
    // A ready status alone is not proof; only the server's stable ledger check can release the hold.
    return Promise.resolve().then(function () {
        var db=window.KM&&window.KM.DB;
        hasProofApi=!!(db&&typeof db.getShipmentDispatchStatus==='function');
        return hasProofApi?db.getShipmentDispatchStatus(shipmentId):null;
    }).then(function(proof){
        if(proof&&proof.success===true&&proof.proof_version==='DISPATCH-STATUS-V1'&&String(proof.shipment_id)===String(shipmentId)&&proof.read_only===true&&proof.writes_performed===0){
            if(proof.state==='NOT_DISPATCHED'&&proof.safe_to_retry===true&&proof.status==='ready_to_ship'&&proof.source_revision&&proof.current_updated_at){
                proofHandled=true;_shDispatchHold14_(shipmentId,false);delete _shConfirmSaved_[shipmentId];_shCloseConfirmModal();
                return Promise.resolve(_shLoadAndRender()).then(function(){_shNote_(shipmentId,'The server verified that this shipment was not dispatched and its stock books agree. Review the card, then press Confirm Shipment when ready. Nothing was resent.');});
            }
            if(proof.state!=='DISPATCHED'){
                proofHandled=true;
                explain((proof.state==='IN_PROGRESS'?'A recent write is still pending verification. Check status again shortly. ':'Confirmation needs review. ')+(proof.reason||proof.state)+'. Nothing was resent.');
                return null;
            }
        }
        else if(hasProofApi){proofHandled=true;explain('Dispatch verification could not be completed ('+String(proof&&(proof.code||proof.error)||'NO_RESULT')+'). Keep this shipment unchanged and check status again. Nothing was resent.');return null;}
        if (!api || typeof api.getWorkspace !== 'function') throw new Error('READ_UNAVAILABLE');
        return api.getWorkspace('shipment', { filters: { shipmentId: shipmentId }, page: { number: 1, size: 5 }, include: { documents: true } });
    }).then(function (env) {
        if(proofHandled)return;
        if (!env || env.success !== true) throw new Error('READ_FAILED');
        var model = window.KM.DB.adaptShipmentWorkspace(env.data);
        var s = ((model && model.shipments) || []).filter(function (x) { return String(x.shipmentId || x.shipment_id) === String(shipmentId); })[0];
        if (!s) throw new Error('SHIPMENT_NOT_FOUND');
        var st = String(s.status || '').trim().toLowerCase();
        if (SH_DISPATCHED_STATUSES_R71_[st] !== 1) {
            if (status) status.textContent = 'Confirmation is still unverified. The shipment currently shows ' + (st || 'unknown') + '. Do not confirm again; check status later.';
            return;
        }
        _shDispatchHold14_(shipmentId, false);
        if(s.documentGenerationStatus==='NOT_REQUIRED')return _shFinishWithoutDocuments_(shipmentId);
        var docs = s.documents || [];
        var ready = docs.filter(function (d) { return d.status === 'READY'; });
        var docText = ready.length && ready.length === docs.length && s.documentGenerationStatus === 'READY'
            ? 'Documents: ' + ready.length + ' ready.' : 'Documents are not yet verified complete. Check the shipment document panel; do not dispatch again.';
        if (status) { status.style.color = '#166534'; status.innerHTML = '<strong>Dispatch recorded.</strong> ' + _shEsc(docText); }
        else { _shNote_(shipmentId, 'Dispatch recorded. ' + docText); _shLoadAndRender(); }
        if (go) {
            // Remove the original addEventListener dispatch handler before enabling navigation.
            var view = go.cloneNode(false); go.replaceWith(view); go = view;
            go.disabled = false; go.textContent = 'View Documents';
            go.onclick = function () { return shViewShipmentDocuments(shipmentId); };
        }
        if (cancel) { cancel.onclick = function () { _shCloseConfirmModal(); _shLoadAndRender(); }; }
        if (check) { check.remove(); check = null; }
    }).catch(function () {
        explain('Status could not be verified. Do not confirm again. Check status later.');
    }).then(function () {
        delete SH_DISPATCH_CHECK14_[shipmentId];
        if (_shDispatchHeld14_(shipmentId) && go) { go.disabled = true; go.textContent = 'Awaiting status'; }
        if (check) check.disabled = false;
    });
}

// R71-FE-2 (review m-5): the dialog's payload whose step 1 (the field save) already succeeded - a retry in that dialog skips step 1
var _shConfirmSaved_ = {};
// AD3 D (Owner decision 6; Author A contract section 1) - MANUAL LOGISTICS / NO ROUTE FALLBACK AT CONFIRM.
// The server alone decides that no route template applies: only a zero-write refusal with code ROUTE_TEMPLATE_NOT_FOUND_MANUAL_AVAILABLE and
// manual_fallback.available === true shows the choice. Nothing is automatic: the operator presses the button, and only then is Confirm re-sent
// with route_mode 'MANUAL' (never another carrier / country / template). Other route refusals are explained and offer no manual choice.
var _shConfirmRouteMode_ = {};
var SH_ROUTE_CODE_TEXT_ = {
    ROUTE_TEMPLATE_AMBIGUOUS: 'More than one route template matches this shipment. A template has to be chosen; manual logistics is not offered.',
    ROUTE_DESTINATION_WAREHOUSE_REQUIRED: 'The shipment has no destination warehouse. Choose the Destination Warehouse and save.',
    ROUTE_DESTINATION_WAREHOUSE_NOT_UNIQUE: 'The destination warehouse is not unique in the warehouse master.',
    ROUTE_DESTINATION_WAREHOUSE_COUNTRY_MISMATCH: 'The destination warehouse country differs from the shipment country.',
    ROUTE_DESTINATION_WAREHOUSE_CODE_MISMATCH: 'The saved warehouse code differs from the destination warehouse.',
    ROUTE_WAREHOUSES_MISSING: 'The warehouse master could not be read.',
    ROUTE_TEMPLATE_OVERRIDE_NOT_APPLICABLE_OR_NOT_UNIQUE: 'The chosen route template does not apply to this shipment.',
    ROUTE_MANUAL_NOT_ALLOWED_TEMPLATE_APPLIES: 'A route template applies to this shipment now, so manual logistics is not used. Confirm again normally.',
    ROUTE_MODE_CONFLICT: 'Manual logistics cannot be combined with a route template.',
    ROUTE_MODE_INVALID: 'The route mode sent is not valid.',
    ROUTE_MANUAL_SOURCE_UNRESOLVED: 'Manual logistics needs the real source warehouse of this shipment.',
    ROUTE_MANUAL_DESTINATION_UNRESOLVED: 'Manual logistics needs the confirmed destination warehouse of this shipment.'
};
function _shRouteRefusalHtml_(shipmentId, res, go, cancel, status, execPayload) {
    var code = String((res && res.code) || '').trim();
    if (!status || !res || res.zero_write !== true || !(code === 'ROUTE_TEMPLATE_NOT_FOUND_MANUAL_AVAILABLE' || SH_ROUTE_CODE_TEXT_[code] || res.stage === 'route_template')) return false;
    var mf = res.manual_fallback || {}, offer = code === 'ROUTE_TEMPLATE_NOT_FOUND_MANUAL_AVAILABLE' && mf.available === true && _shConfirmRouteMode_[shipmentId] !== 'MANUAL';
    var miss = res.missing_field ? ' Missing: ' + String(res.missing_field) + '.' : '';
    status.style.color = '#b91c1c';
    status.innerHTML = '<div class="sh-route-refusal" data-code="' + _shEsc(code) + '">' +
        (offer
            ? '<strong>No route template applies to this shipment.</strong> Nothing was written.<br>You can confirm it with <strong>manual logistics (no route template)</strong>: the system records only the real source and the confirmed destination warehouse, with no invented hubs, scans, customs or dates. Position is then reported by hand on the shipment card (in transit / arrived).' +
              (mf.resolver_code ? '<br><span style="font-size:11px;color:#7F1D1D;">Server: ' + _shEsc(mf.resolver_code) + '</span>' : '')
            : '<strong>Cannot confirm - route.</strong> ' + _shEsc(SH_ROUTE_CODE_TEXT_[code] || String(res.error || code || 'Route template refused')) + _shEsc(miss) + ' Nothing was written.' +
              (code ? '<br><span style="font-size:11px;color:#7F1D1D;">' + _shEsc(code) + '</span>' : '')) + '</div>';
    if (go) { go.disabled = false; go.textContent = 'Confirm & Dispatch'; }
    if (cancel) cancel.disabled = false;
    var actions = document.getElementById('sh-confirm-actions'), old = document.getElementById('sh-confirm-manual');
    if (old) old.remove();
    if (offer && actions) {
        var b = document.createElement('button'); b.type = 'button'; b.id = 'sh-confirm-manual';
        b.textContent = 'Use manual logistics (no route) and confirm';
        b.style.cssText = 'min-height:36px;padding:7px 12px;border:1px solid #B45309;background:#FFFBEB;color:#92400E;border-radius:6px;cursor:pointer;font-weight:600;white-space:normal;';
        b.addEventListener('click', function () {
            if (b.disabled) return;
            b.disabled = true; _shConfirmRouteMode_[shipmentId] = 'MANUAL'; b.remove();
            if (go) go.disabled = false;
            _shRunConfirm(shipmentId, execPayload);
        });
        actions.insertBefore(b, go || null);
    }
    return true;
}
function _shAfterStep1Fail_(shipmentId, execPayload) {
    // a later step failed after step 1 saved: re-read, so the next dialog carries the new token (this dialog's retry skips step 1)
    if (_shConfirmSaved_[shipmentId] === execPayload && _shEffectiveWorkspace()) { try { _shLoadAndRender(); } catch (e) {} }
}
// a server that answers the new token (r71-small-1 may add it) is adopted at once; today's answer carries none and the page re-reads
function _shAdoptTok_(shipmentId, data) { var t = _shTokFmt_(data && data.updated_at), r = t ? _shFindShipment_(shipmentId) : null; if (r) r.updatedAt = t; }
function _shEditConflict_(shipmentId, err) {
    if (!err || err.code !== 'EDIT_CONFLICT') return false;
    var d = err.data || {}, diff = Array.isArray(d.fields_differing) ? d.fields_differing : [];
    var host = document.getElementById('sh-exec-' + shipmentId), list = _shActiveListEl_(), card = list ? list.querySelector('[id="sh-card-' + String(shipmentId).replace(/"/g, '') + '"]') : null;
    if (!host && !card) { alert('Not saved - ' + (err.message || 'EDIT_CONFLICT')); return true; }
    var id = 'sh-conflict-' + shipmentId, old = document.getElementById(id); if (old) old.parentNode.removeChild(old);
    var blank = function (v) { return (v == null || v === '') ? '(blank)' : String(v); };
    var rows = diff.map(function (f) { return '<li data-field="' + _shEsc(f.field) + '">' + _shEsc(f.field) + ': yours <strong>' + _shEsc(blank(f.yours)) + '</strong>, now saved <strong>' + _shEsc(blank(f.current)) + '</strong></li>'; }).join('');
    var html = '<div id="' + _shEsc(id) + '" class="sh-edit-conflict" role="alert" data-code="EDIT_CONFLICT" style="color:#7F1D1D;background:#FEF2F2;border-left:3px solid #EF4444;padding:8px 10px;margin:6px 0;font-size:12px;overflow-wrap:anywhere;">' +
        // R71-FE-2 (review m-2): no field differs = every value sent equals the saved one - most likely this user's own earlier save (an answer lost)
        (diff.length ? '<div style="font-weight:600;">Not saved - this shipment was changed by someone else (saved ' + _shEsc(blank(d.current_updated_at)) + ') since you opened it.</div>' +
        '<div>Nothing was written. Your values are still on screen; they were not sent again.</div>' :
        '<div style="font-weight:600;">Not saved again - your earlier save may already be written (every value you sent equals the saved one, saved ' + _shEsc(blank(d.current_updated_at)) + ').</div>' +
        '<div>Nothing was written by this press. Reload to confirm.</div>') +
        (rows ? '<ul style="margin:4px 0 0 16px;padding:0;">' + rows + '</ul>' : '') +
        '<button type="button" class="btn btn-secondary sh-edit-conflict-reload" onclick="shRetryRead()" style="margin-top:6px;padding:2px 10px;font-size:12px;cursor:pointer;">Reload</button> ' +
        '<span style="font-size:11px;">Reload shows the current values; then make your change again.</span></div>';
    if (host) host.insertAdjacentHTML('beforebegin', html); else card.insertAdjacentHTML('afterbegin', html);
    return true;
}

// Collect the editable execution fields from a card's exec box into an updateShipment payload.
function _shCollectExec(shipmentId) {
    var box = document.getElementById('sh-exec-' + shipmentId);
    var payload = { shipment_id: shipmentId, actor: 'operation-system' };
    var tok_ = _shTok_(shipmentId); if (tok_) payload.expected_updated_at = tok_;   // CHAIN r8 / R71-FE-1 (edit conflict): the row token this page read, second precision only
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
        var arr = _shCartonLinesCp2_(Object.keys(byId).map(function(k) {
            var input = Array.prototype.filter.call(linesBox.querySelectorAll('input[data-carton]'), function (n) { return n.getAttribute('data-line-id') === k; })[0];
            var members = input && JSON.parse(input.getAttribute('data-carton-members') || '[]');
            return { id: k, start: byId[k].carton_no_start, end: byId[k].carton_no_end, members: members && members.length ? members : null };
        }));
        if (arr.length) payload.lines = arr;
    }
    // A-delta2 F (Owner rule 5): a saved destination that is not selectable renders blank. Unless the operator explicitly cleared it (the
    // shWarehousePick blank-option path adds destination_warehouse_id ''), neither warehouse_id nor warehouse_code is sent, so the saved
    // destination_warehouse_id / warehouse_id / warehouse_code stay exactly as stored (never '' written over them).
    if (_shHeldDestination_(shipmentId) && !Object.prototype.hasOwnProperty.call(payload, 'destination_warehouse_id')) { delete payload.warehouse_id; delete payload.warehouse_code; }
    return payload;
}
// the saved destination id that is not selectable and not replaced ('' when none)
// AD3 D (Author C contract 3): platform family of a marketplace name (amazon: Amazon / KM Amazon; walmart: Walmart / KM Walmart; else the
// lower-case name) and the two LOGICAL WFS warehouses (mirror of 22_ csdLogicalPlatformWarehouse_; a master id list, not a fabricated row).
var SH_LOGICAL_PLATFORM_WH_ = { 'WH-RESUS-US-WFS-WALMART': 1, 'WH-KM-US-WFS-WALMART': 1 };
function _shLogicalPlatformWh_(id) { return SH_LOGICAL_PLATFORM_WH_[String(id == null ? '' : id).trim().toUpperCase()] === 1; }
function _shPlatformFamily_(name) {
    var n = String(name == null ? '' : name).trim().toLowerCase();
    if (n === 'amazon' || n === 'km amazon') return 'amazon';
    if (n === 'walmart' || n === 'km walmart') return 'walmart';
    return n;
}
function _shHeldDestination_(shipmentId) {
    var box = document.getElementById('sh-exec-' + shipmentId), sel = box ? box.querySelector('select[data-field="warehouse_id"]') : null;
    if (!sel) return '';
    var h = String(sel.getAttribute('data-held') || '');
    return (h && String(sel.value || '') === '') ? h : '';
}

// Save = update execution fields only. Does NOT change status, NOT create history, NOT enter Overview.
// Carton numbers are validated (integers / start<=end / no overlap) before saving.
function shSaveExecution(shipmentId) {
    var v = _shValidateCartons(shipmentId, false);
    if (!v.ok) { alert('Cannot Save — ' + v.error); return; }
    if (!_shTokReady_(shipmentId)) return;   // R71-FE-1
    var _p8 = _shCollectExec(shipmentId);   // R71-FE-8 (SH1)
    var before = _shFindShipment_(shipmentId) || {};
    var reprice = (Object.prototype.hasOwnProperty.call(_p8, 'warehouse_id') && String(_p8.warehouse_id || '') !== String(before.destinationWarehouseId || before.warehouseId || '')) ||   // N01: compared with the canonical destination; A-delta2 F: a held destination is not sent
        String(_p8.shipments_customs_type || '') !== String(before.shipmentsCustomsType || before.raw && before.raw.shipments_customs_type || '');
    _shUpd_(shipmentId, _p8, reprice ? function () { return _shAutoRateAfterSave_(shipmentId, before); } : null).then(function(res) {
        _shAdoptTok_(shipmentId, res);
        _shRememberSaved_(shipmentId, _p8);
        alert('Draft saved.' + (res.auto_rate_card ? '\n' + res.auto_rate_card.message : ''));
        _shReadbackOne_(shipmentId);   // R15C-UI
    }).catch(function(err) { if (_shEditConflict_(shipmentId, err)) return; if (_shUnknown11_(shipmentId, err, 'Save')) return; alert('Save failed: ' + (err && err.message ? err.message : err)); });
}
function _shAutoRateAfterSave_(sid, before) {   // R15e step 3 r4 (r5: stamp after dispatch): every result says whether a selection was SENT and whether the SERVER answered it
    var db = window.KM.DB, selSent = false;
    return Promise.resolve(db.getShipmentRateCardOptions(sid, { all_methods: true })).then(function (r) {
        if (!r || r.success !== true) return { state: 'READ_FAILED', sent: false, answered: false, message: 'Destination saved; the new quote could not be read. Confirm remains subject to rate-card validation.' };
        var eq = function (a, b) { return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase(); };
        var candidates = (r.options || []).filter(function (o) { return eq(o.carrier_id, before.carrierId) && eq(o.shipping_method, before.shippingMethod) && eq(o.last_mile_delivery, before.lastMileDelivery); });
        var same = candidates.filter(function (o) { return o.rate_card_id === (r.current && r.current.rate_card_id); });
        var chosen = same.length === 1 ? same[0] : candidates.length === 1 ? candidates[0] : null;
        if (!chosen) return { state: candidates.length ? 'AMBIGUOUS' : 'NO_MATCH', sent: false, answered: false, message: candidates.length ? 'Destination saved; several rates match the same carrier and method. Use Edit to choose; nothing was selected automatically.' : 'Destination saved; no active rate matches this destination with the existing carrier and method. The rate-card setup must be corrected before Confirm.' };
        var waitMs = Number(window.SH_UPD_WAIT_MS_15C_) > 0 ? Number(window.SH_UPD_WAIT_MS_15C_) : SH_UPD_WAIT_DEFAULT_MS_15C_, t = null;
        var noAns = new Promise(function (res) { t = setTimeout(function () { res({ success: false, code: 'SELECTION_NO_ANSWER_17', kmNoAnswer: true }); }, waitMs); });   // m-r3-2: the selection fetch has its own timeout
        var selP = db.selectShipmentRateCard(sid, chosen, r.current && r.current.rate_card_id || '', { allow_method_change: false });
        _shAfterSent17_(sid, chosen); selSent = true;   // m-r3-1 / r5: stamped right AFTER the request is dispatched (never before it): the window restarts at THIS send; INFO: the card / version it sent
        return Promise.race([Promise.resolve(selP), noAns]).then(function (x) {
            clearTimeout(t);
            var answered = _shSelAnswered17_(x);
            if (x && x.success === true && x.verified === true) return { state: 'APPLIED', sent: true, answered: true, message: 'Rate card and cost updated automatically for the saved destination.' };
            return { state: answered ? 'NOT_APPLIED' : 'UNKNOWN', sent: true, answered: answered, message: answered ? 'Destination saved, but the new quote was not verified (' + String(x && (x.code || x.error) || 'UNKNOWN') + '). Nothing was resent; reload before continuing.' : 'Destination saved; the automatic rate-card choice got NO server answer (' + String(x && (x.code || x.error) || 'NO_ANSWER') + '). Nothing was resent; the shipment is held until it is re-checked.' };
        });
    }).catch(function () { return { state: 'UNKNOWN', sent: selSent, answered: false, message: 'Destination saved; quote outcome unknown. Nothing was resent. Reload and check the rate card before Confirm.' }; });
}

// Draft → Ready to Ship (still in the Draft workspace; saves current field edits too).
function shReadyToShip(shipmentId) {
    var v = _shValidateCartons(shipmentId, false);
    if (!v.ok) { alert('Cannot proceed — ' + v.error); return; }
    if (!_shTokReady_(shipmentId)) return;   // R71-FE-1
    var payload = _shCollectExec(shipmentId);
    payload.status = 'ready_to_ship';
    var before = _shFindShipment_(shipmentId) || {};
    var reprice = (Object.prototype.hasOwnProperty.call(payload, 'warehouse_id') && String(payload.warehouse_id || '') !== String(before.warehouseId || '')) || String(payload.shipments_customs_type || '') !== String(before.shipmentsCustomsType || '');   // A-delta2 F: a held destination is not sent
    _shUpd_(shipmentId, payload, reprice ? function () { return _shAutoRateAfterSave_(shipmentId, before); } : null).then(function(res) {
        _shRememberSaved_(shipmentId, payload);   // R71-FE-8 (SH1)
        if (res.auto_rate_card) alert(res.auto_rate_card.message);
        _shReadbackOne_(shipmentId);   // R15C-UI
    }).catch(function(err) { if (_shEditConflict_(shipmentId, err)) return; if (_shUnknown11_(shipmentId, err, 'Ready to Ship')) return; alert('Update failed: ' + (err && err.message ? err.message : err)); });
}

// Ship = official shipment. Validates required fields, then status=shipped (+ shipped_at/by server-side).
// Required (SHIPMENT_CENTER_SPEC §5B): external_shipment_id, Carton No. Start/End (all lines),
// reference_id, warehouse_code, ETD, ETA. After this the shipment appears in Shipment Overview.
function shShip(shipmentId) {
    var cartonV = _shValidateCartons(shipmentId, true);
    if (!cartonV.ok) { alert('Cannot Ship — ' + cartonV.error); return; }
    if (!_shTokReady_(shipmentId)) return;   // R71-FE-1
    var payload = _shCollectExec(shipmentId);
    var box = document.getElementById('sh-exec-' + shipmentId);
    var totalQty = box ? (parseFloat(box.getAttribute('data-total-qty')) || 0) : 0;
    var missing = [];
    if (!String(payload.external_shipment_id || '').trim()) missing.push('Shipment ID (external)');
    if (!String(payload.reference_id || '').trim()) missing.push('Reference ID');
    if (_shHeldDestination_(shipmentId)) missing.push('Destination Warehouse (the saved ' + _shHeldDestination_(shipmentId) + ' is not selectable now; choose a warehouse)');   // A-delta2 F
    else if (!String(payload.warehouse_code || '').trim()) missing.push('Warehouse Code');
    if (!String(payload.etd || '').trim()) missing.push('ETD');
    if (!String(payload.eta || '').trim()) missing.push('ETA');
    if (totalQty <= 0) missing.push('Total Qty');
    if (missing.length) { alert('Cannot Ship — please complete:\n\n• ' + missing.join('\n• ')); return; }
    if (!confirm('Mark this shipment as SHIPPED? It will then appear in Shipment Overview.')) return;
    payload.status = 'shipped';
    _shUpd_(shipmentId, payload).then(function() {   // R71-FE-2 (m-1): in-flight guarded
        alert('Shipment marked as Shipped.');
        _shReadbackOne_(shipmentId);   // R15C-UI
    }).catch(function(err) { if (_shEditConflict_(shipmentId, err)) return; if (_shUnknown11_(shipmentId, err, 'Ship')) return; alert('Ship failed: ' + (err && err.message ? err.message : err)); });
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
// O1-C7 (2026-11-02, local): ported unchanged from owner-rules-r1/office-download/patched (R7-x / K1) - the rate-card choice
// REVIEW-FIX7-MS-NEXT (R7-x, candidate): the options last shown per shipment; the choice sends the version the user saw
var SH_RC_ = {}, SH_CUSTOMS_READ_ = {};
function _shCustomsNa_(s) { var c = s && SH_CUSTOMS_READ_[s.shipmentId]; return !!(c && c.token === _shTok_(s.shipmentId) && c.domestic === true); }
function _shCustomsRead_(s) {
    if (!s || !s.shipmentId || !window.KM.DB || !window.KM.DB.getShipmentRateCardOptions) return;
    var sid = s.shipmentId, token = _shTok_(sid), old = SH_CUSTOMS_READ_[sid];
    if (!token || (old && old.token === token)) return;
    var entry = SH_CUSTOMS_READ_[sid] = { token: token, domestic: false };
    setTimeout(function () {
        Promise.resolve(window.KM.DB.getShipmentRateCardOptions(sid)).then(function (r) {
            if (SH_CUSTOMS_READ_[sid] !== entry || _shTok_(sid) !== token) return;
            if (!r || r.success !== true) { delete SH_CUSTOMS_READ_[sid]; return; }
            entry.domestic = r.customs_applicable === false;
            var box = document.getElementById('sh-exec-' + sid), field = box && box.querySelector('select[data-field="shipments_customs_type"]');
            if (entry.domestic && field && _shExecDirty(sid).indexOf('warehouse_id') < 0) {
                field.removeAttribute('data-field'); field.disabled = true;
                field.innerHTML = '<option>Not required - domestic transport</option>';
            }
        }).catch(function () { if (SH_CUSTOMS_READ_[sid] === entry) delete SH_CUSTOMS_READ_[sid]; });
    }, 0);
}
// R71-FE-8 (SH1): what each shipment's form held when the server last CONFIRMED a save of it (field -> value)
var SH_SAVED_ = {};
function _shYmd_(v) {
    var s = String(v == null ? '' : v).trim(); if (!s) return '';
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m && !/T\d/.test(s.slice(10, 12))) return m[1] + '-' + m[2] + '-' + m[3];
    var d = new Date(s); if (isNaN(d.getTime())) return s;
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function _shRememberSaved_(shipmentId, payload) { var o = {}; Object.keys(payload || {}).forEach(function (k) { if (k !== 'lines' && k !== 'actor' && k !== 'shipment_id' && k !== 'expected_updated_at' && k !== 'status') o[k] = String(payload[k] == null ? '' : payload[k]); }); SH_SAVED_[shipmentId] = o; }
// FIX7-NEXT-1030 (K1, candidate): the saved choice as the server keeps it (shipments.rate_card_version, the selection receipt)
function _shRcState_(s) {
    var v = String((s && s.rateCardVersion) || '').trim(), id = String((s && s.rateCardId) || '').trim();
    if (!id && /^unpriced1\|/.test(v)) return { ok: true, unpriced: true, say: 'Freight cost pending' };
    if (!id) return { ok: false, say: 'Freight cost pending' };
    if (/^rcv1:[0-9a-f]{24}\|sel1:[0-9a-f]{24}$/.test(v)) return { ok: true, say: 'Chosen: ' + id };
    if (/^pending\|/.test(v)) return { ok: false, say: 'The choice of ' + id + ' did not finish - choose it again' };
    return { ok: false, say: id + ' was not chosen here - choose a rate card' };
}
// the Draft's fields changed and not saved: a node keeps what it was rendered with as its default
function _shRenderedBaseline_(input) {
    var copy = input.cloneNode(false);
    copy.value = input.defaultValue;
    return copy.value;
}
function _shExecDirty(shipmentId) {
    var out = [];
    [document.getElementById('sh-exec-' + shipmentId), document.getElementById('sh-lines-' + shipmentId)].forEach(function (b) {
        if (b) b.querySelectorAll('input[data-field], select[data-field], input[data-carton]').forEach(function (n) {
            var d = 0;
            if (n.tagName === 'SELECT') Array.prototype.forEach.call(n.options, function (o, i) { if (o.defaultSelected) d = i; });
            var _f = n.getAttribute('data-field') || 'carton_no_' + n.getAttribute('data-carton');
            var _raw = n.tagName === 'SELECT' ? n.selectedIndex !== d : n.type !== 'hidden' && n.value !== _shRenderedBaseline_(n);
            if (_raw && n.type === 'date' && _shYmd_(n.value) === _shYmd_(n.defaultValue)) _raw = false;   // R71-FE-8 (SH1): one calendar day either way
            var _sv = n.getAttribute('data-field') ? (SH_SAVED_[shipmentId] || {})[n.getAttribute('data-field')] : undefined;
            if (_raw && _sv !== undefined && String(n.value).trim() === String(_sv).trim()) _raw = false;   // R71-FE-8 (SH1): what the server confirmed saving
            if (_raw) out.push(_f);
        });
    });
    return out;
}
// R71-FE-11 — CARRIER -> METHOD from the lane's REAL cards (shipment.rateCardOptions all_methods: destination country, marketplace,
// warehouse code, customs, battery, validity). Carrier first; Method = that carrier's cards by label, raw token underneath. The ONE write
// is shipment.selectRateCard - a card of another method / last mile carries allow_method_change, so method, last mile, carrier and cost
// land in the SAME locked selection. The saved card's server state is shown; a stale card's cost is "needs re-pricing", never a quote.
function _shRcCostHtml_(s, forceStale) {
    var t = s && s.estimatedTotalCost, cur = String((s && s.currency) || '').trim(), rc = _shRcState_(s);
    if (rc.unpriced) return '<span class="sh-cost-pending" style="color:#92400E;font-weight:600;">Freight cost pending</span>';
    if (s.estimatedDutyCurrency && s.estimatedDutyCurrency !== cur && s.estimatedFreightCost !== '' && s.estimatedDuty !== '' && s.estimatedDuty != null) return '<span>' + (forceStale || !rc.ok ? 'NEEDS RE-PRICING: ' : '') + 'Freight ' + _shEsc(cur) + ' ' + Number(s.estimatedFreightCost).toFixed(2) + ' / Customs ' + _shEsc(cur) + ' ' + (s.estimatedCustomsFee === '' || s.estimatedCustomsFee == null ? 'unknown' : Number(s.estimatedCustomsFee).toFixed(2)) + ' / Duty ' + _shEsc(s.estimatedDutyCurrency) + ' ' + Number(s.estimatedDuty).toFixed(2) + ' / No combined total</span>';
    if (t === '' || t == null) return '<span style="color:#64748B;">Freight cost pending</span>';
    if (forceStale || !rc.ok) return '<span style="color:#B45309;font-weight:600;">Estimated cost: NEEDS RE-PRICING</span> <span style="color:#94A3B8;text-decoration:line-through;">' + _shEsc(cur) + ' ' + Number(t).toFixed(2) + '</span>';
    var unit = (s.estimatedUnitCost === '' || s.estimatedUnitCost == null) ? '' : (' \u00b7 per pcs ' + _shEsc(cur) + ' ' + Number(s.estimatedUnitCost).toFixed(1));
    var dc = ((s.estimatedDuty === '' || s.estimatedDuty == null) && (s.estimatedCustomsFee === '' || s.estimatedCustomsFee == null)) ? '' : (' \u00b7 duty/customs ' + ((s.estimatedDuty === '' || s.estimatedDuty == null) ? 'unknown (duty not determined)' : (Number(s.estimatedDuty) + Number(s.estimatedCustomsFee || 0)).toFixed(2)));
    return '<span style="color:#059669;">Execution estimate: ' + _shEsc(cur) + ' ' + Number(t).toFixed(2) + '</span><span style="color:#64748B;"> (freight ' + (s.estimatedFreightCost === '' ? '--' : Number(s.estimatedFreightCost).toFixed(2)) + dc + unit + ')</span>';
}
function _shLaneEdited_(sid) {   // a lane field changed on screen: the saved card's cost is no longer a quote
    try { var el = document.getElementById('sh-rc-cost-' + sid), s = _shGetShipments().filter(function (x) { return x.shipmentId === sid; })[0] || {}; if (el) el.innerHTML = _shRcCostHtml_(s, true) + ' <span style="color:#B45309;">- save, then choose the rate card again.</span>'; } catch (e) {}
}
function _shRcAutoLoad_() { /* Options load on Edit; Confirm still rechecks the saved receipt. */ }
function shRateCardLoad(btn) {
    var box = btn && btn.parentNode, sid = box && box.getAttribute('data-sid'), db = window.KM && window.KM.DB, list = box && box.querySelector('.sh-rc-list');
    if (!sid || !list || btn.disabled || _shInFlight_[sid]) return false;
    if (btn.getAttribute('aria-expanded') === 'true') { list.hidden = true; btn.setAttribute('aria-expanded', 'false'); btn.textContent = 'Edit'; return false; }
    list.hidden = false; btn.setAttribute('aria-expanded', 'true');
    if (!db || typeof db.getShipmentRateCardOptions !== 'function') { list.textContent = 'Not available'; return false; }
    var dirty = _shExecDirty(sid);
    if (dirty.length) { list.textContent = 'Save changes before choosing a rate card.'; btn.textContent = 'Edit'; return false; }
    if (!btn.style.minWidth) { try { var rr = btn.getBoundingClientRect(); if (rr.width) { btn.style.minWidth = Math.ceil(rr.width) + 'px'; btn.style.minHeight = Math.ceil(rr.height) + 'px'; } } catch (eR) {} }
    btn.disabled = true; btn.textContent = 'Edit'; btn.style.opacity = '1'; btn.setAttribute('aria-busy', 'true'); list.textContent = 'Loading rate cards\u2026';
    Promise.resolve(db.getShipmentRateCardOptions(sid, { all_methods: true })).then(function (r) {
        btn.disabled = false; btn.textContent = 'Edit'; btn.removeAttribute('aria-busy');
        if (!r || r.success !== true) { list.innerHTML = '<span style="color:#DC2626;">Could not load the rate cards: ' + _shEsc((r && (r.code || r.error)) || 'FAILED') + ' - nothing was changed.</span>'; return; }
        SH_RC_[sid] = r; list.removeAttribute('data-sel-carrier'); list.removeAttribute('data-sel-card');
        if (!r.editable) { list.textContent = 'This shipment is no longer a draft - its rate card is history.'; return; }
        if (!r.persistable) { list.innerHTML = '<span style="color:#B45309;">The choice cannot be saved yet (a database column is pending approval).</span>'; return; }
        if (!r.options.length) { if (r.unpriced_approval) list.innerHTML = '<div>No active rate matches this shipment.</div>' + _shUnpricedHtml_(sid, r) + _shSvcHtml_(sid, r); else list.innerHTML = _shEsc('No active rate card matches the saved destination, customs and cargo today. Check the rate-card setup; no replacement was selected.') + _shSvcHtml_(sid, r); return; }   // AD3 D: + service without a rate card
        var st = r.current && r.current.state, ce = document.getElementById('sh-rc-cost-' + sid), s = _shGetShipments().filter(function (x) { return x.shipmentId === sid; })[0] || {};
        if (ce && st && st !== 'COMPLETE' && st !== 'NONE') ce.innerHTML = _shRcCostHtml_(s, true) + ' <span style="color:#B45309;">- the saved card no longer matches this shipment (' + _shEsc(st) + ').</span>';
        _shRcRender_(sid);
    })['catch'](function (e) {
        btn.disabled = false; btn.textContent = 'Edit'; btn.removeAttribute('aria-busy');
        list.innerHTML = '<span style="color:#DC2626;">Could not load the rate cards: ' + _shEsc((e && (e.code || e.message)) || String(e)) + ' - nothing was changed. Try again.</span>';
    });
    return false;
}
function _shRcRender_(sid) {
    var box = document.querySelector('.sh-rc[data-sid="' + String(sid).replace(/"/g, '') + '"]'), list = box && box.querySelector('.sh-rc-list'), r = SH_RC_[sid];
    if (!list || !r) return;
    var s = _shGetShipments().filter(function (x) { return x.shipmentId === sid; })[0] || {};
    var savedM = String(s.shippingMethod || '').trim(), savedL = String(s.lastMileDelivery || '').trim(), cur = r.current || {};
    var opts = r.options || [], cars = [], seen = {};
    opts.forEach(function (o) { if (!seen[o.carrier_id]) { seen[o.carrier_id] = 1; cars.push({ id: o.carrier_id, name: _shCarrierCell_(o.carrier_id).text || o.carrier_id }); } });
    if (cur.state === 'UNPRICED_APPROVED' && s.carrierId && !seen[s.carrierId]) { seen[s.carrierId] = 1; cars.push({ id: s.carrierId, name: _shCarrierCell_(s.carrierId).text || s.carrierId }); }
    var curOpt = opts.filter(function (o) { return cur.rate_card_id && o.rate_card_id === cur.rate_card_id; })[0] || null;
    var selC = list.getAttribute('data-sel-carrier');
    if (selC == null) {
        selC = curOpt ? curOpt.carrier_id : ((s.carrierId && seen[s.carrierId]) ? s.carrierId : '');
        if (!selC) { var withM = cars.filter(function (c) { return opts.some(function (o) { return o.carrier_id === c.id && o.shipping_method === savedM; }); }); if (withM.length === 1) selC = withM[0].id; }
    }
    var mine = opts.map(function (o, i) { return { o: o, i: i }; }).filter(function (x) { return x.o.carrier_id === selC; });
    var selI = list.getAttribute('data-sel-card');
    if (selI == null || !opts[Number(selI)] || opts[Number(selI)].carrier_id !== selC) {
        if (curOpt && curOpt.carrier_id === selC) selI = String(opts.indexOf(curOpt));
        else { var same = mine.filter(function (x) { return x.o.shipping_method === savedM && x.o.last_mile_delivery === savedL; }); if (same.length !== 1) same = mine.filter(function (x) { return x.o.shipping_method === savedM; }); selI = same.length === 1 ? String(same[0].i) : ''; }
    }
    var o = selI !== '' ? opts[Number(selI)] : null;
    list.innerHTML =
        '<label style="display:block;font-size:11px;color:#64748B;margin-top:4px;">Carrier</label>' +
        '<select class="sh-rc-carrier" onchange="shRcPickCarrier(\'' + _shEsc(sid) + '\', this.value)" style="width:100%;max-width:100%;padding:4px 6px;border:1px solid #CBD5E1;border-radius:4px;font-size:12px;box-sizing:border-box;">' +
            '<option value=""' + (selC ? '' : ' selected') + '>-- Choose carrier --</option>' +
            cars.map(function (c) { return '<option value="' + _shEsc(c.id) + '"' + (c.id === selC ? ' selected' : '') + '>' + _shEsc(c.name) + (c.name !== c.id ? ' (' + _shEsc(c.id) + ')' : '') + '</option>'; }).join('') +
        '</select>' +
        '<label style="display:block;font-size:11px;color:#64748B;margin-top:4px;">Shipping Service</label>' +
        '<select class="sh-rc-method" onchange="shRcPickMethod(\'' + _shEsc(sid) + '\', this.value)"' + (selC ? '' : ' disabled') + ' style="width:100%;max-width:100%;padding:4px 6px;border:1px solid #CBD5E1;border-radius:4px;font-size:12px;box-sizing:border-box;">' +
            '<option value=""' + (o ? '' : ' selected') + '>' + (selC ? '-- Choose method --' : '-- Choose a carrier first --') + '</option>' +
            mine.map(function (x) { return '<option value="' + x.i + '"' + (String(x.i) === selI ? ' selected' : '') + '>' + _shEsc(_shSvcServiceLabel_(x.o) || '(no label)') + ' \u00b7 ' + _shRcRateText15c_(x.o) + _shLtTag12_(x.o.lead_time) + '</option>'; }).join('') +
        '</select>' +
        '<div class="sh-rc-lt" style="font-size:11px;margin-top:2px;">' + (o ? _shLtLine12_(o.lead_time, 'This card') : '') + '</div>' + _shRcPendingHtml15c_(o, cur) +   // AGL02-SH
        '<button type="button" class="sh-rc-confirm" onclick="shRateCardConfirm(this)"' + (o ? '' : ' disabled') + ' style="margin-top:4px;background:#1E293B;color:#fff;border:none;border-radius:4px;padding:3px 10px;font-size:12px;cursor:pointer;min-width:132px;">Use this rate card</button> <span class="sh-rc-note"></span>' + _shEtaBox12_(sid, r) + _shUnpricedHtml_(sid, r) + _shSvcHtml_(sid, r);   // AD3 D   // R71-FE-12
}
// AD3 D (Owner decisions 8 / 9 / 10; Author B contract 1-3) - SERVICE WITHOUT A RATE CARD, and SKIP QUOTE / COST PENDING.
// The lists come ONLY from the server's service_vocabulary (carriers = ACTIVE carriers master rows; method / last mile = stored tokens), never
// from rate-card options, so a carrier with ZERO rate cards can be chosen. Declared service tuples use one picker; unknown capabilities
// and TBA keep explicit token inputs. Method / last mile remain separate canonical payload fields;
// "To be assigned / manual logistics" is an explicit choice (carrier_assignment TO_BE_ASSIGNED: carrier_id written blank, never a placeholder
// id). SPD / LTL is a delivery type (parcel / pallet) that maps to the server's (method, last mile) tuple - domestic only, the server checks.
// The Save sends ONLY these fields (plus the row version) through the existing updateShipment; a refusal is shown beside the box, an answer
// that did not arrive is held and re-read (never resent). Skip quote opens the existing explicit freight-pending dialog (reason + ack).
var SH_SVC_TBA_ = '__TO_BE_ASSIGNED__';
function _shCostPendingMessage_(r) {
    var current = (r && r.current) || {}, service = (r && r.service) || {}, approval = (r && r.unpriced_approval) || {};
    if (current.state === 'COMPLETE') return '';
    if (current.state === 'COST_PENDING_AUTO') return 'No applicable rate card. Freight cost pending; confirmation can continue.' + (current.cargo_notice ? ' ' + current.cargo_notice : '');
    if (current.quote_state === 'COST_PENDING') return 'Cost pending: no amount is recorded.';
    if (service.carrier_state === 'TO_BE_ASSIGNED') return 'Freight cost pending; carrier to be assigned.';
    if (current.state === 'STALE') return 'The selected quote no longer matches the saved shipment. Re-check its rate card.';
    if (service.carrier_state === 'CARRIER_MISSING' || (!service.carrier_id && !approval.carrier_id && service.carrier_state !== 'TO_BE_ASSIGNED')) return 'Save a carrier before confirming.';
    var code = current.cost_pending_reason || approval.reason || '';
    var messages = { COMPLETE_SHIPMENT_FIRST: 'Save the carrier, shipping method and destination warehouse first.', SHIPMENT_LAST_MILE_REQUIRED: 'Save the last-mile delivery service first.',
        RATE_CARD_BATTERY_UNCLASSIFIED: 'Complete the SKU battery classifications first.', LITHIUM_CARRIER_CLEARANCE_REQUIRED: 'The deployed quote policy still requires lithium cargo review.',
        CARRIER_INACTIVE: 'The saved carrier is inactive.', CARRIER_NOT_UNIQUE: 'The carrier master does not contain one matching carrier.', CARRIER_SERVICE_CAPABILITY_UNKNOWN: 'The saved carrier has no declared service.',
        SERVICE_NOT_OFFERED_BY_CARRIER: 'The saved carrier does not offer this service for the route.', SELECTION_OUTCOME_NEEDS_REVIEW: 'A previous quote operation is unresolved; review its outcome first.',
        RATE_DECISION_RECORDED: 'A previous quote decision is recorded; re-check its current state.', SAVED_COST_REQUIRES_REVIEW: 'Saved cost fields need review before continuing without a quote.',
        APPLICABLE_RATE_AVAILABLE: 'An applicable rate exists; select it or explicitly continue without applying it.', SHIPMENT_LINES_INVALID: 'Complete the shipment SKU quantities first.' };
    return messages[code] ? messages[code] + ' (' + code + ')' : (code ? 'Review the saved shipping service (' + code + ').' : '');
}
function _shSvcHtml_(sid, r) {
    var v = r && r.service_vocabulary;
    if (!v || !Array.isArray(v.carriers) || !Array.isArray(v.shipping_method) || !Array.isArray(v.last_mile_delivery)) return '';   // a server without the vocabulary: nothing offered
    var sv = (r && r.service) || {}, s = _shGetShipments().filter(function (x) { return x.shipmentId === sid; })[0] || {};
    var curC = String(sv.carrier_id != null ? sv.carrier_id : (s.carrierId || '')).trim(), curM = String(sv.shipping_method != null ? sv.shipping_method : (s.shippingMethod || '')).trim(), curL = String(sv.last_mile_delivery != null ? sv.last_mile_delivery : (s.lastMileDelivery || '')).trim();
    var tba = !curC && (sv.carrier_state ? sv.carrier_state === 'TO_BE_ASSIGNED' : /^tba1\|/.test(String(s.rateCardVersion || ''))), e = _shEsc(sid), seen = {};   // AD3 D r4 (B 11)
    var carMissing = !curC && !tba, caud = sv.carrier_assignment || null;
    function opt(val, label, sel) { return '<option value="' + _shEsc(val) + '"' + (sel ? ' selected' : '') + '>' + _shEsc(label) + '</option>'; }
    var cars = v.carriers.filter(function (c) { var id = String((c && c.carrier_id) || '').trim(); if (!id || seen[id]) return false; seen[id] = 1; return true; });
    var curKnown = !curC || cars.some(function (c) { return String(c.carrier_id).trim() === curC; });
    var sel = 'width:100%;max-width:100%;padding:4px 6px;border:1px solid #CBD5E1;border-radius:4px;font-size:12px;box-sizing:border-box;';
    var a = r && r.unpriced_approval, canSkip = !!(a && a.enabled === true && (a.available === true || a.recoverable === true || (a.card_not_applied && a.card_not_applied.available === true)) && a.carrier_id);
    return '<div class="sh-svc" data-sid="' + e + '" data-vocab="' + _shEsc(v.version || '') + '" style="margin-top:8px;padding-top:6px;border-top:1px dashed #CBD5E1;">' +
        '<div style="font-size:11px;font-weight:600;color:#334155;">' + (r.customs_applicable === false ? 'Domestic Transport' : 'Shipping Service') + '</div>' +
        '<label style="display:block;font-size:11px;color:#64748B;margin-top:4px;">Carrier / booking channel</label>' +
        '<select class="sh-svc-carrier" aria-label="Carrier" onchange="shSvcCarrierChanged(\'' + e + '\')" style="' + sel + '">' + opt('', '-- Choose carrier --', !curC && !tba || !curKnown) +
            cars.map(function (c) { var id = String(c.carrier_id).trim(), nm = String(c.carrier_name || '').trim(); return opt(id, nm || id, !tba && id === curC); }).join('') +
            opt(SH_SVC_TBA_, 'To be assigned / manual logistics', tba) + '</select>' +
        (tba ? '<div class="sh-svc-tba-state" style="font-size:11px;color:#475569;">To be assigned' + (caud ? ' - recorded ' + _shEsc(caud.at || '') + (caud.actor ? ' by ' + _shEsc(caud.actor) + ' (reported, unverified)' : '') + (caud.reason ? ': ' + _shEsc(caud.reason) : '') : ' (server marker)') + '</div>' : '') +
        (carMissing ? '<div class="sh-svc-missing" style="font-size:11px;color:#B91C1C;">No carrier, and not marked to be assigned: choose a carrier, or "To be assigned" with a reason.</div>' : '') +
        '<input class="sh-svc-tba-reason" type="text" maxlength="500" aria-label="Reason for to be assigned" placeholder="Reason for assigning the carrier later" style="' + sel + 'margin-top:4px;display:' + (tba ? 'block' : 'none') + ';">' +
        (curKnown ? '' : '<div class="sh-svc-note-carrier" style="font-size:11px;color:#B91C1C;">The saved carrier ' + _shEsc(curC) + ' is not an active carrier (' + _shEsc(sv.carrier_state || 'unknown') + '); choose one.</div>') +
        '<div class="sh-svc-fields">' + _shSvcFieldsHtml_(sid, v, tba ? '' : curC, curM, curL, sel) + '</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;align-items:center;">' +
        '<button type="button" class="sh-svc-save" onclick="shSvcSave(\'' + e + '\', this)" style="background:#0F766E;color:#fff;border:none;border-radius:4px;padding:3px 10px;font-size:12px;cursor:pointer;min-width:110px;">Save service</button>' +
        (canSkip && r.current && r.current.state !== 'COST_PENDING_AUTO' ? '<button type="button" class="sh-svc-skip" onclick="shSvcSkipQuote(\'' + e + '\')" style="background:#FFFBEB;color:#92400E;border:1px solid #B45309;border-radius:4px;padding:3px 10px;font-size:12px;cursor:pointer;">Continue without quote</button>' : '') +
        '</div>' +
        '<div class="sh-svc-note" role="status" style="font-size:11px;margin-top:3px;overflow-wrap:anywhere;color:#475569;">' +
            _shEsc(_shCostPendingMessage_(r)) + '</div>' +
        '</div>';
}
// AD3 D r3: the delivery types the vocabulary allows for one carrier. A carrier row that lists delivery_types (master carriers.delivery_types,
// e.g. BestWay = LTL) limits them; a carrier without the field gets the vocabulary's list; nothing is ever invented on the page.
function _shSvcDeliveryTypes_(v, carrierId) {
    var all = ((v && v.delivery_type) || []).filter(function (d) { return d && d.value; }), c = null;
    ((v && v.carriers) || []).forEach(function (x) { if (x && String(x.carrier_id || '').trim() === String(carrierId || '').trim()) c = x; });
    if (!c) return all;
    if (c.services_known === true && Array.isArray(c.services)) all = all.filter(function (d) { return c.services.some(function (x) { return x && x.shipping_method === d.shipping_method && x.last_mile_delivery === d.last_mile_delivery; }); });   // AD3 D r4 (B 16)
    if (!Array.isArray(c.delivery_types)) return all;
    var ok = c.delivery_types.map(function (t) { return String(t || '').trim().toUpperCase(); });
    return all.filter(function (d) { return ok.indexOf(String(d.value).toUpperCase()) !== -1; });
}
// AD3 D r4 (B 13 / 16): the carrier's declared (method, last mile) tuples, or null when the server does not know them (then the full lists)
function _shSvcCarrierServices_(v, carrierId) {
    var c = null; ((v && v.carriers) || []).forEach(function (x) { if (x && String(x.carrier_id || '').trim() === String(carrierId || '').trim()) c = x; });
    return (c && c.services_known === true && Array.isArray(c.services)) ? c.services.filter(Boolean) : null;
}
function _shSvcPairOptions_(all, allowed, cur, kind) { var list = allowed ? all.filter(function (m) { return allowed.indexOf(m) !== -1; }) : all; return '<option value=""' + (cur && list.indexOf(cur) !== -1 ? '' : ' selected') + '>--</option>' + list.map(function (m) { return '<option value="' + _shEsc(m) + '"' + (m === cur ? ' selected' : '') + '>' + _shEsc(_shEnumDisplay_(kind || 'shippingMethod', m)) + '</option>'; }).join(''); }
function _shSvcServiceLabel_(service) {
    var d = window.KM && window.KM.display;
    return d && typeof d.shippingService === 'function' ? d.shippingService(service)
        : service.shipping_method_label || [_shEnumDisplay_('shippingMethod', service.shipping_method), _shEnumDisplay_('lastMileDelivery', service.last_mile_delivery)].filter(Boolean).join(' \u00b7 ');
}
function _shSvcDeclaredPairs_(v, carrierId) {
    var services = _shSvcCarrierServices_(v, carrierId);
    if (services === null) return null; // Unknown is not an empty declaration or permission to invent tuples.
    var seen = {};
    return services.filter(function (s) {
        if (!s.shipping_method || !s.last_mile_delivery) return false;
        var key = JSON.stringify([s.shipping_method, s.last_mile_delivery]);
        if (seen[key]) return false;
        seen[key] = true; return true;
    });
}
function _shSvcFieldsHtml_(sid, v, carrierId, method, mile, style) {
    var pairs = _shSvcDeclaredPairs_(v, carrierId), e = _shEsc;
    style = style || 'width:100%;max-width:100%;padding:4px 6px;box-sizing:border-box;';
    if (pairs !== null) {
        var current = pairs.filter(function (p) { return p.shipping_method === method && p.last_mile_delivery === mile; })[0];
        return '<label style="display:flex;flex-direction:column;font-size:11px;color:#64748B;margin-top:4px;">Shipping Service' +
            '<select class="sh-svc-service" aria-label="Shipping Service" onchange="shSvcPickService(\'' + e(sid) + '\')" style="' + style + '">' +
            '<option value=""' + (current ? '' : ' selected') + '>' + (pairs.length ? '-- Choose service --' : '-- No declared services --') + '</option>' +
            pairs.map(function (p) { return '<option value="' + e(JSON.stringify([p.shipping_method, p.last_mile_delivery])) + '" data-method="' + e(p.shipping_method) + '" data-lastmile="' + e(p.last_mile_delivery) + '"' + (p === current ? ' selected' : '') + '>' + e(_shSvcServiceLabel_(p)) + '</option>'; }).join('') + '</select></label>' +
            '<input type="hidden" class="sh-svc-method" value="' + e(current ? current.shipping_method : '') + '">' +
            '<input type="hidden" class="sh-svc-lastmile" value="' + e(current ? current.last_mile_delivery : '') + '">';
    }
    // The server permits explicit vocabulary values for TBA / undeclared capabilities. Keep that legal path.
    function values(key) { return (v[key] || []).map(function (x) { return String((x && x.value) || '').trim(); }).filter(Boolean); }
    return '<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px;margin-top:4px;">' +
        '<label style="display:flex;flex-direction:column;font-size:11px;color:#64748B;">Shipping method<select class="sh-svc-method" aria-label="Shipping method" style="' + style + '">' + _shSvcPairOptions_(values('shipping_method'), null, method, 'shippingMethod') + '</select></label>' +
        '<label style="display:flex;flex-direction:column;font-size:11px;color:#64748B;">Last mile<select class="sh-svc-lastmile" aria-label="Last mile" style="' + style + '">' + _shSvcPairOptions_(values('last_mile_delivery'), null, mile, 'lastMileDelivery') + '</select></label></div>';
}
function shSvcPickService(sid) {
    var box = _shSvcBox_(sid); if (!box) return false;
    var picker = box.querySelector('.sh-svc-service'), option = picker && picker.options[picker.selectedIndex];
    if (!picker) return false;
    box.querySelector('.sh-svc-method').value = picker.value && option ? option.getAttribute('data-method') || '' : '';
    box.querySelector('.sh-svc-lastmile').value = picker.value && option ? option.getAttribute('data-lastmile') || '' : '';
    var note = box.querySelector('.sh-svc-note');
    if (picker.value && note && note.textContent === 'Choose a shipping service.') note.textContent = '';
    return false;
}
if (typeof window !== 'undefined') window.shSvcPickService = shSvcPickService;
function _shSvcDtypeOptions_(dts, cur) {
    return '<option value=""' + (cur ? '' : ' selected') + '>-- none --</option>' + dts.map(function (d) { return '<option value="' + _shEsc(d.value) + '" data-method="' + _shEsc(d.shipping_method || '') + '" data-lastmile="' + _shEsc(d.last_mile_delivery || '') + '"' + (d.value === cur ? ' selected' : '') + '>' + _shEsc(d.value + (d.value === 'SPD' ? ' - parcel' : d.value === 'LTL' ? ' - pallet' : '')) + '</option>'; }).join('');
}
function shSvcCarrierChanged(sid) {   // rebuild the delivery-type list for the chosen carrier (a type it does not allow is not listed)
    var box = _shSvcBox_(sid), r = SH_RC_[sid]; if (!box || !r) return false;
    var d = box.querySelector('.sh-svc-dtype'), c = box.querySelector('.sh-svc-carrier').value;
    var reason = box.querySelector('.sh-svc-tba-reason'); if (reason) reason.style.display = c === SH_SVC_TBA_ ? 'block' : 'none';
    if (d) { var list = _shSvcDeliveryTypes_(r.service_vocabulary, c === SH_SVC_TBA_ ? '' : c), keep = list.some(function (x) { return x.value === d.value; }) ? d.value : ''; d.innerHTML = _shSvcDtypeOptions_(list, keep); d.value = keep; }
    var mEl = box.querySelector('.sh-svc-method'), lEl = box.querySelector('.sh-svc-lastmile'), fields = box.querySelector('.sh-svc-fields');
    if (fields) fields.innerHTML = _shSvcFieldsHtml_(sid, r.service_vocabulary, c === SH_SVC_TBA_ ? '' : c, mEl ? mEl.value : '', lEl ? lEl.value : '');
    return false;
}
if (typeof window !== 'undefined') window.shSvcCarrierChanged = shSvcCarrierChanged;
function _shSvcBox_(sid) { return document.querySelector('.sh-svc[data-sid="' + String(sid).replace(/"/g, '') + '"]'); }
function shSvcPickDeliveryType(sid, val) {   // fills method + last mile with the server's tuple for SPD / LTL (shown, editable; the server re-checks)
    var box = _shSvcBox_(sid); if (!box) return false;
    var o = box.querySelector('.sh-svc-dtype option[value="' + String(val).replace(/"/g, '') + '"]');
    if (o && val) { box.querySelector('.sh-svc-method').value = o.getAttribute('data-method') || ''; box.querySelector('.sh-svc-lastmile').value = o.getAttribute('data-lastmile') || ''; }
    return false;
}
var SH_SVC_TEXT_ = {
    SHIPMENT_CARRIER_UNKNOWN: 'That carrier is not in the carriers master.', SHIPMENT_CARRIER_NOT_UNIQUE: 'That carrier id is not unique in the master.', SHIPMENT_CARRIER_INACTIVE: 'That carrier is inactive.',
    SHIPPING_METHOD_NOT_IN_VOCABULARY: 'That shipping method is not a known service token.', LAST_MILE_NOT_IN_VOCABULARY: 'That last mile is not a known service token.',
    DELIVERY_TYPE_UNKNOWN: 'Unknown delivery type.', DELIVERY_TYPE_DOMESTIC_ONLY: 'SPD / LTL is for domestic shipments only (source and destination in the same country).',
    DELIVERY_TYPE_COUNTRY_UNKNOWN: 'The source or destination warehouse country is not known.', DELIVERY_TYPE_CONFLICT: 'The method / last mile do not match the delivery type.',
    CARRIER_ASSIGNMENT_CONFLICT: 'To be assigned cannot be sent together with a carrier.', CARRIER_CLEAR_WITH_SELECTED_QUOTE: 'A rate card is selected: the carrier cannot be cleared.',
    SHIPMENT_FROZEN_AFTER_DISPATCH: 'The shipment is dispatched; transport fields are locked.', SHIPMENT_TRANSPORT_FROZEN: 'Transport fields are locked.', EDIT_CONFLICT: 'The shipment changed elsewhere. Reload first.'
};
function shSvcSave(sid, btn) {
    var box = _shSvcBox_(sid); if (!box || _shInFlight_[sid]) return false;
    var note = box.querySelector('.sh-svc-note'), c = box.querySelector('.sh-svc-carrier').value, m = box.querySelector('.sh-svc-method').value, l = box.querySelector('.sh-svc-lastmile').value;
    var dEl = box.querySelector('.sh-svc-dtype'), dt = dEl ? dEl.value : '';
    note.style.color = '#B91C1C';
    if (_shExecDirty(sid).length) { note.textContent = 'Save the shipment field changes first.'; return false; }
    if (!c) { note.textContent = 'Choose a carrier, or "To be assigned / manual logistics".'; return false; }
    var picker = box.querySelector('.sh-svc-service');
    if (picker) {
        var chosen = picker.options[picker.selectedIndex];
        if (!picker.value || !chosen || chosen.getAttribute('data-method') !== m || chosen.getAttribute('data-lastmile') !== l) {
            note.textContent = 'Choose a shipping service.'; return false;
        }
    }
    if (!m || !l) { note.textContent = 'Choose the shipping method and the last mile (or a delivery type).'; return false; }
    var p = { shipment_id: sid, actor: 'operation-system', shipping_method: m, last_mile_delivery: l };
    var tok = _shTok_(sid); if (tok) p.expected_updated_at = tok;
    if (c === SH_SVC_TBA_) {   // AD3 D r4 (B 11): the marker is written by the server from carrier_assignment + carrier_assignment_reason
        var tbr = String((box.querySelector('.sh-svc-tba-reason') || {}).value || '').trim();
        if (!tbr) { note.style.color = '#B91C1C'; note.textContent = 'Enter the reason for "To be assigned". Nothing was sent.'; return false; }
        p.carrier_assignment = 'TO_BE_ASSIGNED'; p.carrier_assignment_reason = tbr;
    } else p.carrier_id = c;
    if (dt) p.delivery_type = dt;
    note.style.color = '#0369A1'; note.textContent = 'Saving the service...';
    Promise.resolve(_shUpd_(sid, p)).then(function (r) {
        _shAdoptTok_(sid, r); note.style.color = '#166534';
        var sv = (r && r.service) || {};
        note.textContent = 'Transport saved.' + (sv.carrier_state === 'TO_BE_ASSIGNED' || c === SH_SVC_TBA_ ? ' Carrier to be assigned.' : '') + ' Freight cost pending until a quote is available.';
        setTimeout(function () { try { _shLoadAndRender(); } catch (e) {} }, 0);
    }, function (err) {
        if (_shUnknown11_(sid, err, 'Save service')) return;
        var code = String((err && (err.code || err.message)) || '').trim();
        note.style.color = '#B91C1C'; note.textContent = 'Not saved: ' + (SH_SVC_TEXT_[code] || code || 'refused') + (code ? ' (' + code + ')' : '') + ' Nothing was written.';
    });
    return false;
}
function shSvcSkipQuote(sid) {   // explicit: opens the freight-pending dialog (reason + acknowledgement); never sends by itself
    var r = SH_RC_[sid]; if (!r) return false;
    shUnpricedOpen14(sid, r);
    return false;
}
if (typeof window !== 'undefined') { window.shSvcSave = shSvcSave; window.shSvcSkipQuote = shSvcSkipQuote; window.shSvcPickDeliveryType = shSvcPickDeliveryType; }
// AD3 D r2/r4 (Owner decision 8; Author B contract v1.3 sections 11, 12, 14, 16) - CARRIER: TO BE ASSIGNED, ASSIGN LATER, EXECUTING CARRIER.
// Modes (from the SERVER's read, never from note text):
//   FILL    carrier blank AND the server's to-be-assigned marker: rateCardOptions.service.carrier_state TO_BE_ASSIGNED when that read is on the
//           page, else the server-owned marker column the shipment read carries (rate_card_version 'tba1|...'; only the server writes it and the
//           server re-validates it) -> shipment.assignCarrier case (a): fills the blank carrier.
//   MISSING carrier blank WITHOUT the marker -> no send (the server refuses CARRIER_NOT_MARKED_TO_BE_ASSIGNED); says to use the Draft service box.
//   EXEC    carrier is a BOOKING CHANNEL (vocabulary carriers[].booking_channel / service.booking_channel; fallback mirror of 12_
//           SHIP_BOOKING_CHANNEL_CARRIERS_ = CAR_AMAZON_PARTNERED) -> shows the booking channel and the executing carrier separately
//           (rateCardOptions.service.executing_carrier / executing_carrier_state); PENDING -> case (b) records the executing carrier, on a Draft
//           or after Confirm; carrier_id is never written. DEPLOYMENT_HALF_SYNCED is said plainly.
// Request: { shipment_id, company, carrier_id, reason, operation_id, expected_updated_at, actor }. One operation_id per attempt, kept with the hold:
// an answer that did not arrive is held (localStorage), nothing is resent; Re-check reads; an explicit resend reuses the SAME operation id.
var SH_ASSIGN_KEY_ = 'km.shipment.assignCarrierHold.v1', SH_ASSIGN_MEM_ = {}, SH_ASSIGN_INFLIGHT_ = {};
var SH_ASSIGN_CLOSED_ = { cancelled: 1, closed: 1, received: 1, completed: 1 };
var SH_BOOKING_CHANNEL_FALLBACK_ = { CAR_AMAZON_PARTNERED: 1 };   // mirror of 12_ SHIP_BOOKING_CHANNEL_CARRIERS_, used only before a vocabulary read
function _shAssignRead_() { try { var v = JSON.parse(window.localStorage.getItem(SH_ASSIGN_KEY_) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (e) { return {}; } }
function _shAssignGet_(sid) { return _shAssignRead_()[sid] || SH_ASSIGN_MEM_[sid] || null; }
function _shAssignPut_(sid, rec) { if (rec) SH_ASSIGN_MEM_[sid] = rec; else delete SH_ASSIGN_MEM_[sid]; try { var v = _shAssignRead_(); if (rec) v[sid] = rec; else delete v[sid]; window.localStorage.setItem(SH_ASSIGN_KEY_, JSON.stringify(v)); } catch (e) {} }
function _shAssignNewOp_() { var r = ''; try { var a = new Uint32Array(2); window.crypto.getRandomValues(a); r = a[0].toString(36) + a[1].toString(36); } catch (e) { r = Math.floor(Math.random() * 1e12).toString(36); } return ('ac-' + Date.now().toString(36) + '-' + r).replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 80); }
function _shAssignCarriers_(sid, excludeBooking) {   // active carriers: the server vocabulary (rate-card read), else the carriers master; never rate cards
    var r = SH_RC_[sid], v = r && r.service_vocabulary, out = [], seen = {};
    if (v && Array.isArray(v.carriers)) v.carriers.forEach(function (c) { var id = String((c && c.carrier_id) || '').trim(); if (id && !seen[id] && !(excludeBooking && c.booking_channel === true)) { seen[id] = 1; out.push({ id: id, name: String(c.carrier_name || '').trim() }); } });
    if (!out.length) (_shGetCarriers() || []).forEach(function (c) { var id = String((c && c.carrierId) || '').trim(); if (id && c.isActive === true && !seen[id] && !(excludeBooking && SH_BOOKING_CHANNEL_FALLBACK_[id])) { seen[id] = 1; out.push({ id: id, name: String(c.carrierName || '').trim() }); } });
    return out;
}
function _shIsBookingChannel_(sid, carrierId) {
    var r = SH_RC_[sid], sv = r && r.service, v = r && r.service_vocabulary, id = String(carrierId || '').trim(), hit = null;
    if (!id) return false;
    if (sv && String(sv.booking_channel || '').trim()) return String(sv.booking_channel).trim() === id;
    if (v && Array.isArray(v.carriers)) v.carriers.forEach(function (c) { if (c && String(c.carrier_id || '').trim() === id) hit = c; });
    if (hit && typeof hit.booking_channel === 'boolean') return hit.booking_channel;
    return SH_BOOKING_CHANNEL_FALLBACK_[id] === 1;
}
function _shAssignMode_(s) {
    var st = String((s && s.status) || '').trim().toLowerCase(), sid = String(s.shipmentId), cur = String(s.carrierId || '').trim();
    if (SH_ASSIGN_CLOSED_[st]) return '';
    var r = SH_RC_[sid], sv = r && r.service;
    if (!cur) {
        if (sv && sv.carrier_state) return sv.carrier_state === 'TO_BE_ASSIGNED' ? 'FILL' : 'MISSING';
        return /^tba1\|/.test(String(s.rateCardVersion || '')) ? 'FILL' : 'MISSING';
    }
    return _shIsBookingChannel_(sid, cur) ? 'EXEC' : '';
}
function _shAssignHtml_(s) {
    if (!s) return '';
    var mode = _shAssignMode_(s); if (!mode) return '';
    var sid = String(s.shipmentId), e = _shEsc(sid), hold = _shAssignGet_(sid), r = SH_RC_[sid], sv = (r && r.service) || {};
    var box = function (title, inner) { return '<div class="sh-assign" data-sid="' + e + '" data-mode="' + mode + '" style="margin-top:4px;padding:6px 8px;border:1px dashed #CBD5E1;border-radius:4px;font-size:12px;"><div style="font-size:11px;font-weight:600;color:#334155;">' + _shEsc(title) + '</div>' + inner + '</div>'; };
    if (mode === 'MISSING') return box('Carrier missing', '<div class="sh-assign-note" role="status" style="font-size:11px;color:#B91C1C;">No carrier and not marked "to be assigned" on the server. In the Shipment Draft choose a carrier, or "To be assigned / manual logistics" with a reason (Transport rate card > Edit).</div>');
    var ca = sv.carrier_assignment, exe = sv.executing_carrier, exSt = String(sv.executing_carrier_state || '');
    var head = '';
    if (mode === 'FILL') head = '<div class="sh-assign-state" style="font-size:11px;color:#475569;">To be assigned' + (ca ? ' - recorded ' + _shEsc(ca.at || '') + (ca.actor ? ' by ' + _shEsc(ca.actor) + ' (reported, unverified)' : '') + (ca.reason ? ': ' + _shEsc(ca.reason) : '') : ' (server marker)') + '</div>';
    if (mode === 'EXEC') {
        head = '<div class="sh-assign-state" style="font-size:11px;color:#475569;">Booking channel: <strong>' + _shEsc(s.carrierId) + '</strong> · Executing carrier: <strong class="sh-exec-carrier">' +
            (exe && exe.carrier_id ? _shEsc(exe.carrier_id) + '</strong> (recorded ' + _shEsc(exe.recorded_at || '') + ')' : (exSt === 'PENDING' ? 'pending</strong>' : 'not read yet</strong>')) + '</div>';
        if (exe && exe.carrier_id) return box('Executing carrier', head);
        if (exSt !== 'PENDING') return box('Executing carrier', head + '<button type="button" class="sh-assign-read" onclick="shAssignReadExec(\'' + e + '\', this)" style="margin-top:4px;background:#2563EB;color:#fff;border:none;border-radius:4px;padding:3px 10px;font-size:12px;cursor:pointer;">Read executing carrier (read only)</button><div class="sh-assign-note" role="status" style="font-size:11px;margin-top:3px;color:#475569;"></div>');
    }
    var cars = _shAssignCarriers_(sid, mode === 'EXEC');
    var sel = 'width:100%;max-width:100%;padding:4px 6px;border:1px solid #CBD5E1;border-radius:4px;font-size:12px;box-sizing:border-box;';
    return box(mode === 'EXEC' ? 'Executing carrier - record' : 'Carrier to be assigned - assign later', head +
        (cars.length
            ? '<select class="sh-assign-carrier" aria-label="Carrier to assign" style="' + sel + '"><option value="">-- Choose carrier --</option>' + cars.map(function (c) { return '<option value="' + _shEsc(c.id) + '">' + _shEsc(c.name && c.name !== c.id ? c.name + ' (' + c.id + ')' : c.id) + '</option>'; }).join('') + '</select>'
            : '<div class="sh-assign-nolist" style="color:#64748B;">The carrier list is not loaded on this page (Shipment Draft: press Edit under Transport rate card to load it).</div>') +
        '<input class="sh-assign-reason" type="text" maxlength="500" aria-label="Reason" placeholder="Reason (required), e.g. booked with carrier on 2026-11-21" style="' + sel + 'margin-top:4px;">' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;align-items:center;">' +
        '<button type="button" class="sh-assign-send" onclick="shAssignCarrier(\'' + e + '\', this)"' + ((hold || !cars.length) ? ' disabled' : '') + ' style="background:#0F766E;color:#fff;border:none;border-radius:4px;padding:3px 10px;font-size:12px;cursor:pointer;min-width:110px;">' + (mode === 'EXEC' ? 'Record executing carrier' : 'Assign carrier') + '</button>' +
        (hold ? '<button type="button" class="sh-assign-recheck" onclick="shAssignRecheck(\'' + e + '\', this)" style="background:#2563EB;color:#fff;border:none;border-radius:4px;padding:3px 10px;font-size:12px;cursor:pointer;">Re-check (read only)</button>' : '') +
        '</div><div class="sh-assign-note" role="status" style="font-size:11px;margin-top:3px;overflow-wrap:anywhere;color:#475569;">' +
        (hold ? _shEsc('An earlier request (' + hold.carrier + ', operation ' + hold.op + ') has an UNKNOWN outcome. Nothing was resent. Re-check reads the shipment first.') : (mode === 'EXEC' ? 'Records who actually carries it; the booking channel stays the carrier.' : 'Fills the blank carrier only; it never changes method, last mile, route, quote or stock.')) + '</div>');
}
function _shAssignBox_(sid) { return document.querySelector('.sh-assign[data-sid="' + String(sid).replace(/"/g, '') + '"]'); }
function _shAssignRerender_(sid) { var b = _shAssignBox_(sid), s = _shGetShipments().filter(function (x) { return x.shipmentId === sid; })[0]; if (!b || !s) return; var t = document.createElement('div'); t.innerHTML = _shAssignHtml_(s); if (t.firstChild) b.parentNode.replaceChild(t.firstChild, b); }
function shAssignReadExec(sid, btn) {   // READ ONLY: rateCardOptions carries service.executing_carrier / executing_carrier_state / booking_channel
    var db = window.KM && window.KM.DB, box = _shAssignBox_(sid), note = box && box.querySelector('.sh-assign-note');
    if (!db || typeof db.getShipmentRateCardOptions !== 'function') { if (note) note.textContent = 'Not available on this page.'; return false; }
    if (btn) btn.disabled = true; if (note) note.textContent = 'Reading...';
    return Promise.resolve(db.getShipmentRateCardOptions(sid, { all_methods: true })).then(function (r) {
        if (!r || r.success !== true || !r.service) { if (note) note.textContent = 'Could not read the executing carrier (' + String((r && (r.code || r.error)) || 'no service in the answer') + '). Nothing was changed.'; if (btn) btn.disabled = false; return; }
        SH_RC_[sid] = r; _shAssignRerender_(sid);
    }, function () { if (note) note.textContent = 'Could not read. Nothing was changed.'; if (btn) btn.disabled = false; });
}
var SH_ASSIGN_TEXT_ = {
    CARRIER_ALREADY_ASSIGNED: 'A carrier is already assigned; it is not replaced here.', SHIPMENT_CARRIER_UNKNOWN: 'That carrier is not in the carriers master.',
    SHIPMENT_CARRIER_NOT_UNIQUE: 'That carrier id is not unique in the master.', SHIPMENT_CARRIER_INACTIVE: 'That carrier is inactive.',
    SHIPMENT_NOT_ASSIGNABLE: 'The shipment is closed / cancelled / received; no assignment.', EDIT_CONFLICT: 'The shipment changed elsewhere. Reload and check first.',
    ASSIGN_CARRIER_INCOMPLETE: 'Choose a carrier and enter a reason.', SHIPMENT_NOT_FOUND: 'Shipment not found.', SHIPMENT_COMPANY_MISMATCH: 'The company does not match this shipment.',
    CARRIER_NOT_MARKED_TO_BE_ASSIGNED: 'The carrier is blank but not marked "to be assigned" on the server.',
    EXECUTING_CARRIER_ALREADY_ASSIGNED: 'Another executing carrier is already recorded; it is not replaced here.', EXECUTING_CARRIER_IS_BOOKING_CHANNEL: 'The booking channel cannot be its own executing carrier.',
    DEPLOYMENT_HALF_SYNCED: 'The server is only partly updated (dispatch check not installed), so the executing carrier cannot be recorded on a Draft yet. Nothing was written; ask the administrator to finish the deployment.'
};
function shAssignCarrier(sid, btn) {
    var box = _shAssignBox_(sid); if (!box || SH_ASSIGN_INFLIGHT_[sid]) return false;
    var note = box.querySelector('.sh-assign-note'), cEl = box.querySelector('.sh-assign-carrier'), hold = _shAssignGet_(sid);
    var resend = !!(hold && hold.checked === true);
    if (hold && !resend) { note.textContent = 'An earlier request has an UNKNOWN outcome. Re-check first; nothing was sent.'; return false; }
    var carrier = resend ? hold.carrier : (cEl ? String(cEl.value || '').trim() : ''), reason = resend ? hold.reason : String(box.querySelector('.sh-assign-reason').value || '').trim();
    note.style.color = '#B91C1C';
    if (!carrier) { note.textContent = 'Choose the carrier.'; return false; }
    if (!reason) { note.textContent = 'Enter a reason (required).'; return false; }
    var DB = window.KM && window.KM.DB; if (!DB || typeof DB.assignShipmentCarrier !== 'function') { note.textContent = 'Not available on this page (assign carrier is not installed).'; return false; }
    var s = _shGetShipments().filter(function (x) { return x.shipmentId === sid; })[0] || {};
    var tok = resend ? String(hold.token || '') : _shTok_(sid), op = resend ? hold.op : _shAssignNewOp_(), mode = box.getAttribute('data-mode') || 'FILL';
    _shAssignPut_(sid, { carrier: carrier, reason: reason, token: tok, op: op, mode: mode, at: new Date().toISOString(), checked: false });   // held BEFORE sending
    SH_ASSIGN_INFLIGHT_[sid] = true; if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
    note.style.color = '#0369A1'; note.textContent = 'Sending...';
    return Promise.resolve().then(function () { return DB.assignShipmentCarrier({ shipment_id: sid, company: String(s.company || ''), carrier_id: carrier, reason: reason, operation_id: op, expected_updated_at: tok || undefined, actor: 'operation-system' }); }).then(function (r) {
        delete SH_ASSIGN_INFLIGHT_[sid];
        var code = String((r && r.code) || '').trim(), rc = box.querySelector('.sh-assign-recheck');
        if (r && r.success === true) {
            _shAssignPut_(sid, null); if (rc) rc.remove();
            var exe = r.executing_carrier;
            note.style.color = '#166534';
            note.textContent = (r.already_assigned ? 'Already recorded (no second write): ' : (r.case === 'EXECUTING_CARRIER' ? 'Executing carrier recorded: ' : 'Carrier assigned: ')) + ((exe && exe.executing_carrier_id) || r.carrier_id || carrier) + (r.case === 'EXECUTING_CARRIER' || exe ? ' (booking channel ' + (r.booking_channel || s.carrierId || '') + ' unchanged).' : '.');
            if (btn) { btn.disabled = true; }
            setTimeout(function () { try { _shLoadAndRender(); } catch (e) {} }, 0);
            return r;
        }
        if (r && r.success === false && code && code !== 'CARRIER_ASSIGN_UNVERIFIED' && r.stage !== 'network' && r.stage !== 'config') {   // a coded server answer: definitive, nothing written
            _shAssignPut_(sid, null); if (rc) rc.remove();
            note.style.color = '#B91C1C'; note.textContent = 'Not recorded: ' + (SH_ASSIGN_TEXT_[code] || String(r.error || code)) + ' (' + code + ') Nothing was written.';
            if (btn) { btn.disabled = false; btn.textContent = mode === 'EXEC' ? 'Record executing carrier' : 'Assign carrier'; }
            return r;
        }
        _shAssignUnknown_(sid, box, btn); return r;
    }, function () { delete SH_ASSIGN_INFLIGHT_[sid]; _shAssignUnknown_(sid, box, btn); return null; });
}
function _shAssignUnknown_(sid, box, btn) {
    var note = box.querySelector('.sh-assign-note');
    if (btn) { btn.disabled = true; }
    note.style.color = '#B45309'; note.textContent = 'The answer did not arrive (or was not verified): the outcome is UNKNOWN. Nothing will be resent. Press Re-check to read the shipment.';
    if (!box.querySelector('.sh-assign-recheck')) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'sh-assign-recheck'; b.textContent = 'Re-check (read only)';
        b.style.cssText = 'background:#2563EB;color:#fff;border:none;border-radius:4px;padding:3px 10px;font-size:12px;cursor:pointer;';
        b.onclick = function () { shAssignRecheck(sid, b); };
        var send = box.querySelector('.sh-assign-send'); send.parentNode.appendChild(b);
    }
}
// READ ONLY. FILL: the shipment row's carrier. EXEC: rateCardOptions.service.executing_carrier. Landed -> hold cleared; not landed -> an explicit
// resend with the SAME operation id (and the token just read) is offered.
function shAssignRecheck(sid, btn) {
    var box = _shAssignBox_(sid), hold = _shAssignGet_(sid), api = window.KM && window.KM.api, db = window.KM && window.KM.DB;
    if (!box || !hold) return false;
    var note = box.querySelector('.sh-assign-note'), send = box.querySelector('.sh-assign-send');
    if (btn) btn.disabled = true; note.textContent = 'Reading the shipment from the server...';
    var exec = hold.mode === 'EXEC';
    return Promise.resolve().then(function () {
        if (!api || typeof api.getWorkspace !== 'function') throw new Error('READ_UNAVAILABLE');
        return api.getWorkspace('shipment', { filters: { shipmentId: sid }, page: { number: 1, size: 5 } });
    }).then(function (env) {
        if (!env || env.success !== true) throw new Error('READ_FAILED');
        var md = window.KM.DB.adaptShipmentWorkspace(env.data) || {}, row = (md.shipments || []).filter(function (x) { return String(x.shipmentId) === String(sid); })[0];
        if (!row) throw new Error('SHIPMENT_NOT_FOUND');
        if (!exec) return { row: row, got: String(row.carrierId || '').trim() };
        return Promise.resolve(db.getShipmentRateCardOptions(sid, { all_methods: true })).then(function (r) {
            if (!r || r.success !== true || !r.service) throw new Error('READ_FAILED');
            SH_RC_[sid] = r; var ex = r.service.executing_carrier;
            return { row: row, got: ex && ex.carrier_id ? String(ex.carrier_id) : '' };
        });
    }).then(function (x) {
        if (x.got) {
            _shAssignPut_(sid, null); if (btn) btn.remove();
            note.style.color = x.got === hold.carrier ? '#166534' : '#B91C1C';
            note.textContent = x.got === hold.carrier ? 'The server shows ' + x.got + ' recorded. Nothing was resent.' : 'The server shows another carrier (' + x.got + ') recorded; it is not replaced here.';
            setTimeout(function () { try { _shLoadAndRender(); } catch (e) {} }, 0);
            return;
        }
        hold.checked = true; hold.token = String(x.row.updatedAt || hold.token || ''); _shAssignPut_(sid, hold);
        note.style.color = '#B45309'; note.textContent = 'Not recorded on the server yet. You may send it again (' + hold.carrier + ', the same operation ' + hold.op + ').';
        if (send) { send.disabled = false; send.textContent = 'Send again (same operation)'; }
        if (btn) btn.disabled = false;
    }).catch(function () { note.textContent = 'The shipment could not be read. Nothing was resent. Re-check again later.'; if (btn) btn.disabled = false; });
}
if (typeof window !== 'undefined') { window.shAssignCarrier = shAssignCarrier; window.shAssignRecheck = shAssignRecheck; window.shAssignReadExec = shAssignReadExec; }
var SH_UNPRICED_OP_KEY_ = 'km.shipment.unpricedOp.v1';   // AD3 D r4: { shipment_id: operation_id } until a definitive answer
function _shUnpricedOp_(sid, mint) { var v = {}; try { v = JSON.parse(window.localStorage.getItem(SH_UNPRICED_OP_KEY_) || '{}') || {}; } catch (e) { v = {}; } if (v[sid] || !mint) return v[sid] || ''; v[sid] = _shAssignNewOp_().replace(/^ac-/, 'uq-'); try { window.localStorage.setItem(SH_UNPRICED_OP_KEY_, JSON.stringify(v)); } catch (e) {} return v[sid]; }
function _shUnpricedOpClear_(sid) { try { var v = JSON.parse(window.localStorage.getItem(SH_UNPRICED_OP_KEY_) || '{}') || {}; delete v[sid]; window.localStorage.setItem(SH_UNPRICED_OP_KEY_, JSON.stringify(v)); } catch (e) {} }
var SH_UNPRICED_HOLD_ = {};
var SH_HOLD_KEY_16_ = 'km.shipment.unpricedHold.v1';   // R15d r2b: { internal shipment_id: ISO time } - this browser only, no private value
function _shHoldRead16_() { try { var v = JSON.parse(window.localStorage.getItem(SH_HOLD_KEY_16_) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (e) { return {}; } }
function _shHoldHas16_(sid) { return !!_shHoldPick18_(SH_UNPRICED_HOLD_[sid], _shHoldRead16_(), sid); }   // R15F2: environment + shipment
function _shHoldSet16_(sid, token) { var h16 = { at: new Date().toISOString(), token: String(token || ''), env: _shHoldEnv18_() }; SH_UNPRICED_HOLD_[sid] = h16; try { var v = _shHoldRead16_(); _shHoldPut18_(v, sid, h16); window.localStorage.setItem(SH_HOLD_KEY_16_, JSON.stringify(v)); } catch (e) {} }   // R15F: the token sent; R15F2: and the environment
function _shHoldClear16_(sid) { delete SH_UNPRICED_HOLD_[sid]; try { var v = _shHoldRead16_(); if (_shHoldDropOwn18_(v, sid)) window.localStorage.setItem(SH_HOLD_KEY_16_, JSON.stringify(v)); } catch (e) {} }   // R15F2: only THIS environment's record
function _shUnpricedHtml_(sid, response) {
    var a = response && response.unpriced_approval;
    if (_shHoldHas16_(sid)) return '<small class="sh-unpriced-held">An earlier freight-pending release has an UNKNOWN outcome. Nothing was resent; Confirm re-checks it with the server first.</small>';   // R15d r2b
    return a && a.enabled && a.available ? '<small>Freight pending quote. Review it when confirming.</small>' : '';
}
function shUnpricedClose14() {
    var el = document.getElementById('sh-unpriced-dialog');
    if (el && el.getAttribute('data-busy') !== 'true') el.remove();
}
function shUnpricedOpen14(sid, response) {
    if (response && response.current && response.current.state === 'COST_PENDING_AUTO') { _shNote_(sid, 'Freight cost pending. You can confirm this shipment.'); return; }
    var a = response && response.unpriced_approval;
    if (!response || response.success !== true || response.editable !== true || response.persistable !== true || !a || a.enabled !== true || (a.available !== true && a.recoverable !== true && !(a.card_not_applied && a.card_not_applied.available === true)) || !a.carrier_id || _shInFlight_[sid]) return;
    if (_shHoldHas16_(sid)) { _shUnpricedHeldOpen16_(sid); return; }   // R15d r2b: held -> re-check only, never a new Continue
    if (_shExecDirty(sid).length) { alert('Save shipment changes first.'); return; }
    SH_RC_[sid] = response;
    var cna4 = a.available !== true && a.card_not_applied && a.card_not_applied.available === true && Array.isArray(a.card_not_applied.cards) && a.card_not_applied.cards.length ? a.card_not_applied : null;   // R15e (4)
    shUnpricedClose14();
    if (document.getElementById('sh-unpriced-dialog')) return;
    var carrier = (a.carriers || []).filter(function (c) { return c.id === a.carrier_id; })[0];
    var overlay = document.createElement('div'); overlay.id = 'sh-unpriced-dialog';
    overlay.className = 'sh14-overlay';
    overlay.innerHTML = '<section class="sh14-dialog" role="dialog" aria-modal="true" aria-labelledby="sh-unpriced-title">' +
        '<h3 id="sh-unpriced-title">Freight pending quote</h3>' + (cna4 ? '<p class="sh-unpriced-cna"><strong>Applicable rate card(s) exist but are NOT applied:</strong> ' + _shEsc(cna4.cards.join(', ')) + '. Continuing records your explicit decision to leave freight pending quote; no cost is filled in. Or Cancel and choose the card under Transport rate card.</p>' : '<p>No matching quote. Enter a reason to continue.</p>') + (a.recoverable === true ? '<p class="sh-unpriced-recover">A previous release of this shipment did not finish. Continue finishes it; the server checks it against the current version.</p>' : '') +
        '<label>Carrier<input aria-label="Carrier" value="' + _shEsc(carrier ? carrier.name : a.carrier_id) + '" disabled></label>' +
        '<label>Reason<textarea class="sh-unpriced-reason" aria-label="Reason" maxlength="500" rows="3"></textarea></label>' +
        '<label class="sh14-check"><input class="sh-unpriced-ack" type="checkbox">I accept that freight is not yet quoted.</label>' +
        (cna4 ? '<label class="sh14-check"><input class="sh-unpriced-ack-cna" type="checkbox">I am deliberately NOT applying the listed rate card(s).</label>' : '') +
        '<p class="sh-unpriced-note" role="status"></p><div class="sh14-actions">' +
        '<button type="button" class="sh14-secondary" onclick="shUnpricedClose14()">Cancel</button>' +
        '<button type="button" class="sh14-primary" id="sh-unpriced-save">Continue</button></div></section>';
    document.body.appendChild(overlay);
    var save = overlay.querySelector('#sh-unpriced-save'), note = overlay.querySelector('.sh-unpriced-note');
    overlay.addEventListener('click', function (e) { if (e.target === overlay) shUnpricedClose14(); });
    overlay.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.preventDefault(); shUnpricedClose14(); }
        if (e.key === 'Tab') {
            var nodes = Array.prototype.filter.call(overlay.querySelectorAll('input,textarea,button'), function (n) { return !n.disabled; });
            if (!nodes.length) { e.preventDefault(); return; }
            if (e.shiftKey && document.activeElement === nodes[0]) { e.preventDefault(); nodes[nodes.length - 1].focus(); }
            else if (!e.shiftKey && document.activeElement === nodes[nodes.length - 1]) { e.preventDefault(); nodes[0].focus(); }
        }
    });
    save.onclick = function () {
        if (save.disabled || _shInFlight_[sid] || _shHoldHas16_(sid)) return;
        var reason = overlay.querySelector('textarea').value.trim();
        if (!reason || !overlay.querySelector('.sh-unpriced-ack').checked || (cna4 && !overlay.querySelector('.sh-unpriced-ack-cna').checked)) { note.textContent = 'Enter a reason and acknowledge the pending freight quote.'; return; }
        if (_shExecDirty(sid).length) { note.textContent = 'Save shipment changes first.'; return; }
        note.textContent = ''; overlay.setAttribute('data-busy', 'true');
        Array.prototype.forEach.call(overlay.querySelectorAll('button,input,textarea'), function (el) { el.disabled = true; });
        save.textContent = 'Saving...'; _shInFlight_[sid] = true; _shHoldSet16_(sid, a.expected_updated_at);   // R15d r2b: held BEFORE sending (a reload mid-flight stays held)
        var release = _shHoldCard_(sid, {}), saved = false;
        Promise.resolve().then(function () { return window.KM.DB.approveShipmentUnpriced({
            shipment_id: sid, reason: reason, acknowledge_unpriced: true, carrier_id: a.carrier_id, actor: 'operation-system', operation_id: _shUnpricedOp_(sid, true),   // AD3 D r4 (B 15)   // AD3 D: the declared operator (Author B 3)
            recover_unpriced: a.recoverable === true, expected_updated_at: a.expected_updated_at,
            expected_rate_card_version: a.expected_rate_card_version, expected_current_rate_card_id: a.expected_current_rate_card_id,
            unpriced_mode: cna4 ? 'card_not_applied' : '', acknowledge_card_not_applied: !!cna4, listed_card_ids: cna4 ? cna4.cards.slice() : []   // R15e (4)
        }); }).then(function (r) {
            if (r && r.success === true && r.verified === true) {
                saved = true; _shHoldClear16_(sid); _shUnpricedOpClear_(sid); return _shLoadAndRender();
            }
            if (r && r.zero_write === true) {
                _shHoldClear16_(sid); _shUnpricedOpClear_(sid); note.title = String(r.code || '');
                note.textContent = 'Not saved. Reload and review the shipment.';
            } else _shUnpricedUnknown14_(sid, overlay, save, note);   // R15c-P0
        }).catch(function () { _shUnpricedUnknown14_(sid, overlay, save, note); }).then(function () {   // R15c-P0
            delete _shInFlight_[sid]; release(); overlay.removeAttribute('data-busy');
            overlay.querySelector('.sh14-secondary').disabled = false;
            if (saved) { overlay.remove(); shConfirmShipment(sid); }
            else if (!_shHoldHas16_(sid)) {
                overlay.querySelector('textarea').disabled = false; overlay.querySelector('.sh-unpriced-ack').disabled = false; var c4 = overlay.querySelector('.sh-unpriced-ack-cna'); if (c4) c4.disabled = false;
                save.disabled = false; save.textContent = 'Continue';
            }
        });
    };
    overlay.querySelector('textarea').focus();
}
window.shUnpricedClose14 = shUnpricedClose14;
// R15c-P0 (handoff §4): an UNKNOWN release shows no progress and resends nothing; "Re-check" reads the shipment from the SERVER (no-store POST read,
// never the display cache) and reports what is stored. Only a user action after that read can send again, from a NEW dialog with the fresh token.
// r2 (review m-2): Re-check sits BEFORE Continue, so the dialog's first .sh14-secondary stays Cancel; m-3: "not written, cannot continue" is said.
function _shUnpricedUnknown14_(sid, overlay, save, note) {
    save.disabled = true; save.textContent = 'Continue';
    note.textContent = 'Outcome unknown. Nothing was resent. Use Re-check to read this shipment from the server.';
    var actions = overlay.querySelector('.sh14-actions'), rc = overlay.querySelector('.sh-unpriced-recheck');
    if (!rc) { rc = document.createElement('button'); rc.type = 'button'; rc.className = 'sh14-secondary sh-unpriced-recheck'; rc.textContent = 'Re-check'; actions.insertBefore(rc, save); }
    rc.disabled = false; rc.textContent = 'Re-check';
    rc.onclick = function () {
        if (rc.disabled) return;
        var db = window.KM && window.KM.DB; if (!db || typeof db.getShipmentRateCardOptions !== 'function') { note.textContent = 'Cannot re-check on this page. Nothing was resent.'; return; }
        rc.disabled = true; rc.textContent = 'Checking...'; note.textContent = 'Reading this shipment from the server (not the screen)...';
        Promise.resolve().then(function () { return db.getShipmentRateCardOptions(sid); }).then(function (r) {
            rc.textContent = 'Re-check';
            if (!r || r.success !== true) { rc.disabled = false; note.textContent = 'Could not re-check (' + String((r && (r.code || r.error)) || 'NO_ANSWER') + '). Nothing was resent.'; return; }
            var cur = r.current || {}, ua = r.unpriced_approval || {};
            // R15F: the unpriced hold clears only on (ii): shipApproveUnpriced_ refuses unless the row's updated_at is SAME as the token (12_:2041).
            var vm16 = _shVersionMoved18_(_shHoldTok16_(sid), ua.expected_updated_at);
            if (vm16 !== 'MOVED') { rc.disabled = false; note.textContent = (vm16 === 'NO_TOKEN' ? 'The earlier release carried no comparable version, so the server cannot refuse a late copy of it. There is no termination evidence; this hold stays.' : 'The server still shows the same shipment version as when the earlier release was sent (state: ' + String(cur.state || 'NONE') + '). That request may still run. This hold stays; nothing was resent.'); return; }
            if (cur.state === 'UNPRICED_APPROVED') {   // the approval is present AND the version moved - a late copy can no longer apply
                _shHoldClear16_(sid); overlay.removeAttribute('data-busy'); overlay.remove();
                return Promise.resolve(_shLoadAndRender()).then(function () { shConfirmShipment(sid); });
            }
            if (r.editable !== true) { _shHoldClear16_(sid); note.textContent = 'The shipment\'s version moved and it can no longer be edited (shipped or cancelled), so the earlier release can no longer apply. Nothing was resent.'; return _shLoadAndRender(); }
            _shHoldClear16_(sid);   // R15F: the version moved - a late copy can no longer apply (whether it was stored is NOT claimed)
            if (!(ua.enabled === true && (ua.available === true || ua.recoverable === true || (ua.card_not_applied && ua.card_not_applied.available === true)) && r.persistable === true && ua.carrier_id)) {   // m-3: say it, keep the dialog
                note.textContent = 'The shipment\'s version moved, so the earlier release can no longer apply; it cannot be continued now (' + String(ua.reason || cur.state || 'NOT_AVAILABLE') + '). Nothing was resent. Close this and review the shipment.';
                return;
            }
            overlay.removeAttribute('data-busy'); shUnpricedClose14();
            shUnpricedOpen14(sid, r);   // a NEW dialog from this server read (fresh token); sending again is the user's choice
            var n2 = document.querySelector('#sh-unpriced-dialog .sh-unpriced-note');
            if (n2) n2.textContent = ua.recoverable === true ? 'The server shows the release did NOT finish (pending). Nothing was resent. Continue finishes it.' : 'The shipment\'s version moved, so the earlier release can no longer apply (whether it was stored is not known). Nothing was resent. You may continue.';
        }, function (e) { rc.disabled = false; rc.textContent = 'Re-check'; note.textContent = 'Could not re-check (' + String((e && (e.code || e.message)) || e) + '). Nothing was resent.'; });
    };
}
// R15d r2 (review MAJOR-1): a READ-ONLY diagnosis of ONE shipment (its internal id, from this card). Reads only getTable and shipment.rateCardOptions;
// prints the five-way outcome; never prints updated_by / actor values (presence only) nor any file url / id; never calls a writer.
var SH_DIAG_DISPATCHED_15_ = ['shipped', 'in_transit', 'arrived', 'received', 'closed', 'completed', 'delivered', 'partial_received', 'partially_received', 'stuck'];
var SH_DIAG_COST_15_ = ['estimated_freight_cost', 'estimated_duty', 'estimated_customs_fee', 'estimated_total_cost', 'estimated_unit_cost'];
function _shDiag15S_(v) { return String(v == null ? '' : v).trim(); }
function _shDiag15Kind_(ver) { ver = _shDiag15S_(ver); return ver === '' ? 'EMPTY' : ver === 'pending-unpriced' ? 'PENDING_UNPRICED' : /^unpriced1\|/.test(ver) ? 'UNPRICED_RECEIPT' : /^pending\|rcv1:/.test(ver) ? 'PENDING_PRICED' : /^rcv1:[0-9a-f]{24}\|sel1:[0-9a-f]{24}$/.test(ver) ? 'PRICED_RECEIPT' : 'OTHER'; }
function _shDiag15Audit_(ver) { var m = /^unpriced1\|([^|]+)\|/.exec(_shDiag15S_(ver)); if (!m) return null; try { var a = JSON.parse(decodeURIComponent(m[1])); return { actor_present: !!_shDiag15S_(a.actor), at: _shDiag15S_(a.at), label: _shDiag15S_(a.label), reason_chars: _shDiag15S_(a.reason).length }; } catch (e) { return { unreadable: true }; } }
function _shDiag15Classify_(x) {
    var ev = x.alloc.executed > 0 || x.shipment_out.factory > 0 || x.shipment_out.overseas > 0 || x.documents.count > 0, disp = SH_DIAG_DISPATCHED_15_.indexOf(x.status) >= 0;
    if (disp && ev) return 'ALREADY_SHIPPED';
    if (disp || ev) return 'STILL_UNCONFIRMABLE';
    if (!x.server || x.server.success !== true) return 'STILL_UNCONFIRMABLE';
    if (x.kind === 'UNPRICED_RECEIPT') return x.server.state === 'UNPRICED_APPROVED' && !x.rate_card_id_present && x.cost_fields_blank ? 'FULLY_SAVED_RESPONSE_LOST' : 'STILL_UNCONFIRMABLE';
    if (x.kind === 'PENDING_UNPRICED') return x.server.recoverable === true ? 'PARTIALLY_PENDING' : 'STILL_UNCONFIRMABLE';
    if (x.kind === 'EMPTY' && !x.rate_card_id_present && !x.unpriced_writer && (x.status === 'draft' || x.status === 'ready_to_ship')) return 'NOT_WRITTEN';
    return 'STILL_UNCONFIRMABLE';
}
function _shDiag15Read_(sid, deps) {
    var S = _shDiag15S_, x = {}, out = { tool: 'R15d shipment diagnosis (READ ONLY)', shipment_id: sid };
    return Promise.resolve(deps.table('shipments')).then(function (rows) {
        var hits = (rows || []).filter(function (r) { return S(r.shipment_id) === sid; }); out.rows_with_this_id = hits.length;
        if (hits.length !== 1) { out.outcome = 'STILL_UNCONFIRMABLE'; out.why = 'SHIPMENT_ROW_NOT_EXACTLY_ONE'; return null; }
        var v = hits[0];
        x.status = S(v.status).toLowerCase(); x.kind = _shDiag15Kind_(v.rate_card_version); x.rate_card_id_present = S(v.rate_card_id) !== ''; x.unpriced_writer = S(v.updated_by) === 'phase1-unattributed';
        x.cost_fields_blank = SH_DIAG_COST_15_.every(function (k) { return S(v[k]) === ''; });
        out.shipment = { status: x.status, rate_card_id_present: x.rate_card_id_present, rate_card_version_kind: x.kind, updated_at: S(v.updated_at), updated_by_present: S(v.updated_by) !== '',
            updated_by_is_release_writer: x.unpriced_writer, carrier_id: S(v.carrier_id), cost_fields_blank: x.cost_fields_blank, release_audit: _shDiag15Audit_(v.rate_card_version) };
        return Promise.resolve().then(function () { return deps.rateCardOptions(sid); }).then(function (rc) {
            x.server = { success: !!rc && rc.success === true, code: (rc && (rc.code || rc.error)) || null, state: rc && rc.current && rc.current.state, editable: rc && rc.editable,
                recoverable: !!(rc && rc.unpriced_approval && rc.unpriced_approval.recoverable === true), release_reason: rc && rc.unpriced_approval && rc.unpriced_approval.reason };
        }, function (e) { x.server = { success: false, code: 'READ_FAILED' }; }).then(function () { out.server_read = x.server; return deps.table('shipment_lines'); });
    }).then(function (lines) {
        if (lines === null) return null;
        var ids = {}; (lines || []).forEach(function (l) { if (S(l.shipment_id) === sid) ids[S(l.shipment_line_id)] = 1; });
        x.alloc = { lines: Object.keys(ids).length, draft: 0, executed: 0, other: 0 };
        return Promise.resolve(deps.table('shipment_line_allocations')).then(function (al) { (al || []).forEach(function (a) { if (!ids[S(a.shipment_line_id)]) return; var st = S(a.allocation_status).toLowerCase(); if (st === 'draft') x.alloc.draft++; else if (st === 'executed') x.alloc.executed++; else x.alloc.other++; });
            return deps.table('factory_stock_movements'); }).then(function (fm) { x.shipment_out = { factory: (fm || []).filter(function (m) { return S(m.movement_type) === 'shipment_out' && S(m.related_entity_id) === sid; }).length };
            return deps.table('overseas_inventory_movements'); }).then(function (om) { x.shipment_out.overseas = (om || []).filter(function (m) { return S(m.movement_type) === 'shipment_out' && S(m.reference_id) === sid; }).length;
            return deps.table('generated_documents'); }).then(function (gd) { var docs = (gd || []).filter(function (d) { return S(d.related_entity_id) === sid; });
            x.documents = { count: docs.length, types: docs.map(function (d) { return S(d.document_type) + ':' + S(d.status); }) };
            out.allocations = x.alloc; out.shipment_out = x.shipment_out; out.documents = x.documents; out.outcome = _shDiag15Classify_(x); return null; });
    }).then(function () {
        out.next = { NOT_WRITTEN: 'Nothing of the release is stored. Use Confirm again (it re-reads first); nothing was resent.', PARTIALLY_PENDING: 'The release stopped at pending. Do NOT clear it; Confirm opens the release dialog for this row and Continue finishes it (the server checks the version).',
            FULLY_SAVED_RESPONSE_LOST: 'The release is stored and the server validates it. Do not release again; continue to Confirm.', ALREADY_SHIPPED: 'The shipment is dispatched. Nothing to do for the release.', STILL_UNCONFIRMABLE: 'Stop. Send this result back; no action on the shipment.' }[out.outcome];
        return out;
    });
}
function shDiagnoseShipment15(sid) {
    if (document.getElementById('sh-diag-dialog')) return;
    var overlay = document.createElement('div'); overlay.id = 'sh-diag-dialog'; overlay.className = 'sh14-overlay';
    overlay.innerHTML = '<section class="sh14-dialog" role="dialog" aria-modal="true"><h3>Diagnose shipment state (read only)</h3><pre class="sh-diag-out" style="white-space:pre-wrap;font-size:12px;max-height:60vh;overflow:auto;">Reading this shipment from the server...</pre><div class="sh14-actions"><button type="button" class="sh14-secondary sh-diag-close">Close</button></div></section>';
    document.body.appendChild(overlay);
    var pre = overlay.querySelector('.sh-diag-out'); overlay.querySelector('.sh-diag-close').onclick = function () { overlay.remove(); };
    var db = window.KM && window.KM.DB;
    if (db && typeof db.runShipmentDocumentDiagnostic === 'function') {
        db.runShipmentDocumentDiagnostic(String(sid || '').trim()).then(function (r) {
            pre.textContent = JSON.stringify(r, null, 2);
        }, function () { pre.textContent = 'The diagnosis could not finish. Nothing was changed.'; });
        return;
    }
    if (typeof getOperationDbTableFromSheet !== 'function' || !db || typeof db.getShipmentRateCardOptions !== 'function') { pre.textContent = 'This page cannot read the shipment tables. Nothing was done.'; return; }
    _shDiag15Read_(String(sid || '').trim(), { table: function (n) { return getOperationDbTableFromSheet(n); }, rateCardOptions: function (id) { return db.getShipmentRateCardOptions(id); } })
        .then(function (o) { pre.textContent = 'OUTCOME: ' + o.outcome + '\n' + (o.next || '') + '\n\n' + JSON.stringify(o, null, 1); }, function (e) { pre.textContent = 'The diagnosis could not finish (' + String((e && (e.code || e.message)) || e) + '). Nothing was done.'; });
}
window.shDiagnoseShipment15 = shDiagnoseShipment15;
// R15d (SH-8B2637CC-5 document_values): READ ONLY - asks the server to run the SAME pre-dispatch document value gate Confirm runs, for THIS
// card's shipment (KM.DB.checkShipmentDocumentValues = shipment.documentValues.check, a no-store read). Shows the gate's blockers through the
// escaped formatter _shDocumentValuesHtml16_ (Codex ui-patch). Never confirms, never resends, writes nothing; nothing is filled in.
function shDiagnoseDocValues16(sid) {
    if (document.getElementById('sh-docval-dialog')) return;
    var overlay = document.createElement('div'); overlay.id = 'sh-docval-dialog'; overlay.className = 'sh14-overlay';
    overlay.innerHTML = '<section class="sh14-dialog" role="dialog" aria-modal="true"><h3>Document values (read only)</h3><div class="sh-docval-out" style="font-size:13px;max-height:60vh;overflow:auto;">Asking the server to check the document values...</div><div class="sh14-actions"><button type="button" class="sh14-secondary sh-docval-close">Close</button></div></section>';
    document.body.appendChild(overlay);
    var box = overlay.querySelector('.sh-docval-out'); overlay.querySelector('.sh-docval-close').onclick = function () { overlay.remove(); };
    var db = window.KM && window.KM.DB;
    if (!db || typeof db.checkShipmentDocumentValues !== 'function') { box.textContent = 'This build cannot check document values. Nothing was done.'; return; }
    Promise.resolve().then(function () { return db.checkShipmentDocumentValues(String(sid || '').trim()); }).then(function (r) {
        if (r && (r.code === 'DATA_CHANGED_DURING_CHECK' || r.code === 'DATA_WRITE_IN_PROGRESS')) { box.textContent = 'The shipment data changed (or a save was running) while it was being checked, so no result is shown. Nothing was changed - press Diagnose document values again.'; return; }   // Owner condition 2: never a mixed-data result
        if (!r || r.success !== true) { box.textContent = 'The check could not run (' + String((r && (r.code || r.error)) || 'NO_ANSWER') + '). Nothing was changed.'; return; }
        if (r.values_ok === true) { box.textContent = 'The server finds every required document value present (' + Number(r.documents || 0) + ' document(s)). Nothing was changed.'; return; }
        box.innerHTML = _shDocumentValuesHtml16_(r) + '<div style="margin-top:6px">This was a read-only check; nothing was changed and Confirm was not sent.</div>';
    }, function (e) { box.textContent = 'The check could not run (' + String((e && (e.code || e.message)) || e) + '). Nothing was changed.'; });
}
window.shDiagnoseDocValues16 = shDiagnoseDocValues16;
// R15d r2b: the dialog for a HELD shipment (an earlier UNKNOWN, possibly before a reload). It sends nothing; Re-check is the only way forward.
function _shUnpricedHeldOpen16_(sid) {
    shUnpricedClose14(); if (document.getElementById('sh-unpriced-dialog')) return;
    var overlay = document.createElement('div'); overlay.id = 'sh-unpriced-dialog'; overlay.className = 'sh14-overlay'; overlay.setAttribute('data-held', 'true');
    overlay.innerHTML = '<section class="sh14-dialog" role="dialog" aria-modal="true" aria-labelledby="sh-unpriced-title">' +
        '<h3 id="sh-unpriced-title">Freight pending quote</h3><p>An earlier Continue for this shipment has an UNKNOWN outcome. This browser kept that hold; the server decides.</p>' +
        '<p class="sh-unpriced-note" role="status"></p><div class="sh14-actions">' +
        '<button type="button" class="sh14-secondary" onclick="shUnpricedClose14()">Cancel</button>' +
        '<button type="button" class="sh14-primary" id="sh-unpriced-save" disabled>Continue</button></div></section>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) shUnpricedClose14(); });
    overlay.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); shUnpricedClose14(); } });
    _shUnpricedUnknown14_(sid, overlay, overlay.querySelector('#sh-unpriced-save'), overlay.querySelector('.sh-unpriced-note'));
}
window.shUnpricedOpen14 = shUnpricedOpen14;
(function () {
    if (document.getElementById('sh14-styles')) return;
    var s = document.createElement('style'); s.id = 'sh14-styles';
    s.textContent = '.sh-rc button,.sh14-primary{background:#2563eb!important;color:#fff!important;border:1px solid #2563eb!important;border-radius:4px!important;min-height:32px!important;padding:5px 12px!important;font-size:12px!important;cursor:pointer}' +
        '.sh-rc button:disabled,.sh14-dialog button:disabled{background:#dbe3ec!important;color:#475569!important;border-color:#cbd5e1!important;cursor:wait}' +
        '.sh-rc .sh-eta-keep,.sh14-secondary{background:#e2e8f0!important;color:#1e293b!important;border:1px solid #94a3b8!important;border-radius:4px!important;min-height:32px!important;padding:5px 12px!important}' +
        '.sh-rc-list{max-height:320px;overflow-y:auto;overflow-x:hidden}.sh-rc-list select{max-width:100%}.sh-rc-eta>div{margin-bottom:6px}.sh-rc-eta button{margin:3px 4px 0 0}' +
        '.sh14-overlay{position:fixed;inset:0;z-index:2100;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;padding:16px}' +
        '.sh14-dialog{box-sizing:border-box;width:420px;max-width:100%;max-height:90vh;overflow-y:auto;background:#fff;border-radius:8px;padding:20px;color:#1e293b;font-size:14px}' +
        '.sh14-dialog h3{margin:0 0 12px;font-size:18px}.sh14-dialog label{display:block;margin-top:12px}' +
        '.sh14-dialog input:not([type=checkbox]),.sh14-dialog textarea{display:block;box-sizing:border-box;width:100%;margin-top:5px;padding:8px;border:1px solid #94a3b8;border-radius:4px;font:inherit}' +
        '.sh14-dialog input:disabled{background:#e2e8f0;color:#475569}.sh14-dialog .sh14-check{display:flex;gap:8px;align-items:start}.sh14-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.sh14-actions button{width:112px;height:36px;font:inherit}.sh-unpriced-note{min-height:20px;color:#b45309}';
    document.head.appendChild(s);
})();

function shRcPickCarrier(sid, v) { var box = document.querySelector('.sh-rc[data-sid="' + String(sid).replace(/"/g, '') + '"]'), list = box && box.querySelector('.sh-rc-list'); if (!list) return; list.setAttribute('data-sel-carrier', v || ''); list.removeAttribute('data-sel-card'); _shRcRender_(sid); }
function shRcPickMethod(sid, v) { var box = document.querySelector('.sh-rc[data-sid="' + String(sid).replace(/"/g, '') + '"]'), list = box && box.querySelector('.sh-rc-list'); if (!list) return; list.setAttribute('data-sel-card', v || ''); _shRcRender_(sid); }
function shRateCardConfirm(btn) {
    var list = btn && btn.parentNode, box = list && list.parentNode, sid = box && box.getAttribute('data-sid'), r = SH_RC_[sid], note = list && list.querySelector('.sh-rc-note');
    var sel = list && list.querySelector('.sh-rc-method'), o = (sel && sel.value !== '' && r) ? r.options[Number(sel.value)] : null, db = window.KM && window.KM.DB;
    if (!o) { if (note) { note.style.color = '#DC2626'; note.textContent = 'Choose a carrier and a method first'; } return false; }
    if (btn.disabled || _shInFlight_[sid]) return false;
    if (_shSaveHoldHas17_(sid)) { shSaveHoldRecheck17(sid); return false; }   // R15e step 3
    var dirty = _shExecDirty(sid);
    if (dirty.length) { if (note) { note.style.color = '#DC2626'; note.textContent = 'Rate card NOT applied: ' + dirty.join(', ') + ' changed and not saved. Press Save (shipment data) first, then Use this rate card.'; } return false; }   // AGL02-SH
    var s = _shGetShipments().filter(function (x) { return x.shipmentId === sid; })[0] || {};
    var sw = o.shipping_method !== String(s.shippingMethod || '').trim() || o.last_mile_delivery !== String(s.lastMileDelivery || '').trim();
    var lbl = btn.textContent; try { var rr = btn.getBoundingClientRect(); if (rr.width) { btn.style.minWidth = Math.ceil(rr.width) + 'px'; btn.style.minHeight = Math.ceil(rr.height) + 'px'; } } catch (eR) {}
    btn.disabled = true; btn.textContent = 'Saving\u2026'; if (note) { note.style.color = '#64748B'; note.textContent = ''; }
    Promise.resolve(db.selectShipmentRateCard(sid, o, (r.current && r.current.rate_card_id) || '', { allow_method_change: sw })).then(function (x) {
        btn.disabled = false; btn.textContent = lbl;
        if (x && x.success && typeof _shLoadAndRender === 'function') { if (sw) _shEtaRecheck12_[sid] = 1; _shReadbackOne_(sid); return; }   // R15C-B3: one shipment re-read (whole-area only if that read fails)   // R71-FE-12: a method change asks to re-confirm ETD / ETA   // the Draft shows what the server now holds
        if (!note) return;
        var code = (x && (x.code || x.error)) || 'FAILED';
        if (code === 'HTTP_TRANSPORT_ERROR' || code === 'NETWORK') {   // R71-FE-12: no answer - UNKNOWN, never resent; the saved state is read back
            note.style.color = '#B45309'; note.textContent = 'The choice got no answer - its outcome is UNKNOWN. Nothing was resent. Reading back what was saved\u2026';
            try { setTimeout(function () { _shLoadAndRender(); }, 0); } catch (eRb) {} return;
        }
        note.style.color = '#DC2626'; note.title = code;
        note.textContent = (/RATE_CARD_CHANGED|RATE_CARD_SELECTION_CONFLICT/.test(code) ? 'The list changed since it was shown - load it again and choose'
            : /RATE_CARD_SELECTION_(INTERRUPTED|UNVERIFIED)/.test(code) ? 'The choice did not finish - choose the same card again' : (code === 'RATE_CARD_COST_UNRESOLVED' && x && x.cost_unknown) ? _shRcUnknownText15c_(x.cost_unknown) : _shDocErrLabel(code)) + ' [' + code + ']';   // AGL02-SH v2
    })['catch'](function (e) {
        btn.disabled = false; btn.textContent = lbl;
        if (note) { note.style.color = '#DC2626'; note.textContent = 'The choice did not get an answer (' + ((e && (e.code || e.message)) || e) + '). Load the rate cards again to see what was saved before choosing.'; }
    });
    return false;
}
// ============================================================================================================
// R71-FE-12 — LEAD TIME follows the carrier / method (the server's match, SANDBOX-GATE-1g; the page computes no lead time of its own).
// A lead time is shown only for the carrier / method it was matched for; UNKNOWN is said as unknown. The saved ETA is CHECKED, never
// rewritten: "Use <date>" fills the ETA field and the operator saves; "Keep the ETA as entered" keeps it.
// ============================================================================================================
var _shEtaRecheck12_ = {};
function _shLtTag12_(lt) { return (lt && lt.state === 'MATCHED') ? (' \u00b7 lead ' + _shEsc(lt.days) + ' d') : ' \u00b7 lead time unknown'; }
function _shLtLine12_(lt) {
    if (!lt) return '';
    return lt.state === 'MATCHED' ? '<span>Transit: ' + _shEsc(lt.days) + ' days</span>' : '<span title="' + _shEsc(lt.reason || '') + '">Transit time unavailable. Review ETA.</span>';
}
function _shEtaBox12_(sid, r) {
    var cur = (r && r.current) || {}, lt = cur.lead_time, ec = cur.eta_check || {}, flag = !!_shEtaRecheck12_[sid], q = _shEsc(sid);
    if (!lt) return '';
    var h = '<div class="sh-rc-eta" style="margin-top:6px;padding:6px;border:1px solid ' + (flag || ec.state === 'DIFFERS' || lt.state !== 'MATCHED' ? '#F59E0B' : '#E2E8F0') + ';border-radius:4px;font-size:12px;">' +
        '<div>' + _shLtLine12_(lt, 'Saved choice') + '</div>';
    if (flag) h += '<div style="color:#B45309;font-weight:600;margin-top:2px;">Method changed \u2014 re-confirm ETD / ETA. The previous lead time no longer applies.</div>';
    var useBtn = function (d) { return ' <button type="button" class="sh-eta-use" onclick="shUseEta12(\'' + q + '\', \'' + _shEsc(d) + '\')" style="font-size:11px;padding:1px 8px;border:1px solid #CBD5E1;border-radius:4px;background:#fff;cursor:pointer;min-width:120px;">Use ' + _shEsc(d) + '</button>'; };
    var keepBtn = ' <button type="button" class="sh-eta-keep" onclick="shKeepEta12(\'' + q + '\')" style="font-size:11px;padding:1px 8px;border:1px solid #CBD5E1;border-radius:4px;background:#fff;cursor:pointer;">Keep the ETA as entered</button>';
    if (ec.state === 'MATCHES') h += '<div style="color:#059669;margin-top:2px;">ETA ' + _shEsc(ec.eta) + ' = ETD ' + _shEsc(ec.etd) + ' + ' + _shEsc(ec.days) + ' days.</div>' + (flag ? '<div>' + keepBtn + '</div>' : '');
    else if (ec.state === 'DIFFERS') h += '<div style="color:#B45309;margin-top:2px;">ETA ' + _shEsc(ec.eta) + ' is not ETD ' + _shEsc(ec.etd) + ' + ' + _shEsc(ec.days) + ' days (' + _shEsc(ec.expected_eta) + '). The ETA you entered is kept until you change it.</div><div>' + useBtn(ec.expected_eta) + keepBtn + '</div>';
    else if (ec.state === 'NO_ETA') h += '<div style="color:#64748B;margin-top:2px;">No ETA yet. ETD + ' + _shEsc(ec.days) + ' days = ' + _shEsc(ec.expected_eta) + '.</div><div>' + useBtn(ec.expected_eta) + '</div>';
    else if (ec.state === 'NO_ETD') h += '<div style="color:#64748B;margin-top:2px;">No ETD: the ETA cannot be checked yet.</div>';
    else h += '<div style="color:#B45309;margin-top:2px;">The ETA cannot be checked: the lead time for this carrier / method is UNKNOWN. Confirm ETD / ETA yourself.</div>' + (flag ? '<div>' + keepBtn + '</div>' : '');
    return h + '<span class="sh-eta-note" style="display:block;color:#64748B;"></span></div>';
}
function shUseEta12(sid, d) {   // fills the ETA field only - the operator presses Save; nothing is sent from here
    var el = document.querySelector('[id="sh-exec-' + String(sid).replace(/"/g, '') + '"] input[data-field="eta"]');
    var box = document.querySelector('.sh-rc[data-sid="' + String(sid).replace(/"/g, '') + '"] .sh-eta-note');
    if (!el) { if (box) box.textContent = 'The ETA field is not on screen (expand the shipment).'; return false; }
    el.value = d; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    delete _shEtaRecheck12_[sid];
    if (box) box.textContent = 'Suggested ETA ' + d + ' filled in - NOT saved yet. Press Save (shipment data) to keep it, or type your own valid date.';   // AGL02-SH
    return false;
}
function shKeepEta12(sid) { delete _shEtaRecheck12_[sid]; try { _shRcRender_(sid); } catch (e) {} return false; }
window.shUseEta12 = shUseEta12; window.shKeepEta12 = shKeepEta12;
window.shRcPickCarrier = shRcPickCarrier; window.shRcPickMethod = shRcPickMethod; window._shLaneEdited_ = _shLaneEdited_;
// S7-R2B1 — entityType: document.retry is scoped to an ENTITY (type + id), not to one document.
function _shDocRowHtml(d, canRetry, entityId, entityType) {
    var st = String((d && d.status) || '').toUpperCase();
    var isFailed = (st === 'FAILED' || st === 'FAILED_RETRYABLE' || (st === 'CONFIGURATION_REQUIRED' && d && d.retryable === true));
    var name = String((d && d.file_name) || '').trim();
    var actions = _shDocLink(d && d.file_url, 'Open', true);
    // Download only when a genuinely downloadable artifact exists (never a fabricated export link).
    if (d && d.download_url) actions += (actions ? ' · ' : '') + _shDocLink(d.download_url, 'Download');
    else if (d && d.pdf_file_url) actions += (actions ? ' · ' : '') + _shDocLink(d.pdf_file_url, 'Download PDF');
    // The DTO names its own entity, so a row can answer even if the model did not. With neither, there is
    // no honest retry target — and a button that guesses one is how this defect happened. Offer none.
    var retryType = String(entityType || (d && d.related_entity_type) || '').trim();
    var retryId = String(entityId || (d && d.related_entity_id) || '').trim();
    if (isFailed && canRetry && retryType && retryId) {
        actions += (actions ? ' · ' : '') +
            '<button type="button" class="sh-doc-retry" onclick="shRetryDocument(\'' + _shEsc(retryType) + '\',\'' + _shEsc(retryId) + '\',this)" ' +
            'style="background:none;border:none;padding:0;color:#DC2626;font-size:12px;cursor:pointer;">Retry</button>';
    }
    return '<div class="sh-doc-row" style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #F1F5F9;">' +
        '<span aria-hidden="true">' + _shDocIcon(d && (d.document_type || d.template_key)) + '</span>' +
        '<span style="flex:1 1 140px;min-width:0;">' +
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
    DOCUMENT_OUTPUTS_MISSING: { say: 'Shipment is dispatched, but no generated files were recorded.', fix: 'Generate documents only; do not dispatch again' },
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
function _shReadinessDetailsDw2_(b) {
    b = b || {};
    var parts = [String(b.reason || '') + (b.class_key ? ' / ' + b.class_key : '')];
    (Array.isArray(b.problems) ? b.problems : []).forEach(function (p) { parts.push(String(p)); });
    (Array.isArray(b.detail) ? b.detail : []).forEach(function (c) {
        var d = c.diagnostic || {};
        parts.push([c.check, c.reason, d.code, d.message].filter(Boolean).join(': '));
    });
    return parts.map(function (p) { return '<div style="overflow-wrap:anywhere">' + _shEsc(p.slice(0, 2000)) + '</div>'; }).join('');
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
    if (model.can_retry === true && (model.entity_type !== 'shipment' || (model.documents || []).length) && (err ? err.retryable !== false : false)) {
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
        if (model.can_retry === true && model.entity_type === 'shipment' && model.entity_id) {
            body += '<button type="button" class="sh-doc-retry" onclick="shRetryDocument(\'shipment\',\'' + _shEsc(model.entity_id) + '\',this)" style="margin-top:8px;padding:7px 12px;border:0;border-radius:4px;background:#0284C7;color:#fff;cursor:pointer;">Generate Documents</button>';
        }
    } else {
        var shown = docs.slice(0, SH_DOC_PANEL_VISIBLE_ROWS_);
        body = shown.map(function (d) { return _shDocRowHtml(d, model.can_retry === true, model.entity_id, model.entity_type); }).join('');
        if (docs.length > shown.length) {
            body += '<button type="button" class="sh-doc-viewall" onclick="shDocViewAll(this)" aria-expanded="false" ' +
                'style="margin-top:6px;background:none;border:none;padding:0;color:#3B82F6;font-size:12px;cursor:pointer;">View all (' + docs.length + ')</button>' +
                '<div class="sh-doc-rest" style="display:none;">' + docs.slice(shown.length).map(function (d) { return _shDocRowHtml(d, model.can_retry === true, model.entity_id, model.entity_type); }).join('') + '</div>';
        }
    }
    var alert = !!SH_DOC_ALERT_STATE_[state];
    var badge = '<span style="font-size:11px;color:' + (alert ? '#B91C1C' : '#64748B') + ';">' + _shEsc(SH_DOC_STATE_LABEL_[state] || state) + '</span>';
    return '<div class="sh-doc-panel" data-doc-state="' + _shEsc(state) + '" style="margin-top:12px;padding-top:12px;border-top:1px dashed #E2E8F0;">' +
        head + body + _shDocErrorHtml(model, state) + '<div style="margin-top:6px;">' + badge + '</div>' +
    '</div>';
}
// S7-R2B1 — the panel is SHARED, so the post-retry refresh is too: each surface registers how to re-read
// ITSELF. This always called _shLoadAndRender(), which from the PO panel re-read the SHIPMENT workspace.
var SH_DOC_REFRESH_ = {};
function shRegisterDocumentRefresh(entityType, fn) {
    var t = String(entityType || '').trim();
    if (t && typeof fn === 'function') SH_DOC_REFRESH_[t] = fn;
}
function shViewShipmentDocuments(shipmentId) {
    _shCloseConfirmModal();
    var filter = document.getElementById('shd-filter-status');
    if (filter) filter.value = '';
    return Promise.resolve(_shReadbackOne_(shipmentId)).then(function () {
        var list = _shActiveListEl_(), card = null;
        if (list) Array.prototype.some.call(list.querySelectorAll('.history-card'), function (item) {
            if (item.id !== 'sh-card-' + shipmentId) return false;
            card = item; return true;
        });
        if (!card) return;
        var details = card.querySelector('.history-card-details');
        if (details && details.style.display === 'none') _shToggleCardEl(card);
        var panel = card.querySelector('.sh-doc-panel');
        if (panel) panel.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
}
window.shViewShipmentDocuments = shViewShipmentDocuments;
shRegisterDocumentRefresh('shipment', function (id) { return shViewShipmentDocuments(id); });

// F1-7N-FB-1B §Q/§O — Retry. It regenerates ONLY the missing/failed documents: the backend reuses every
// already-generated output, so a retry can never duplicate a folder, a file, a PDF or a registry row, and it
// never re-runs the business transition. Frontend visibility is not authorization — the backend re-checks.
// S7-R2B1 — entityType is a TYPE ('shipment' | 'purchase_order'). The panel passed the entity id here and
// a document id in entityId, so retry fell through to the shipment generator with a non-shipment id. The
// 'shipment' default is gone: a retry whose target is unknown is not sent.
function shRetryDocument(entityType, entityId, btnEl) {
    var db = window.KM && window.KM.DB;
    if (!db || typeof db.retryDocumentGeneration !== 'function') return;
    var type = String(entityType || '').trim();
    var id = String(entityId || '').trim();
    if (!type || !id) return;
    if (btnEl) { if (btnEl.disabled) return; btnEl.disabled = true; btnEl.textContent = 'Generating...'; }
    return Promise.resolve().then(function () { return db.retryDocumentGeneration(type, id); }).then(function (res) {
        if (!res || res.stage === 'network' || res.outcome_unknown === true) throw new Error('DOCUMENT_RETRY_OUTCOME_UNKNOWN');
        if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Retry'; }
        var result = res && res.result || {};
        if (res && res.success && !result.failed && !result.configuration_required) {
            // No registered refresh → say so rather than leave the operator with a silently stale screen.
            var refresh = SH_DOC_REFRESH_[type];
            if (typeof refresh === 'function') return refresh(id);
            else if (btnEl) { btnEl.textContent = 'Retried — reload'; btnEl.title = 'The retry succeeded. Reload this page to see the result.'; }
            return;
        }
        var failures = (result.results || []).filter(function(r){return r.status!=='READY';});
        var reason = (res && (res.error || result.reason)) || failures.map(function(r){return r.class_key+': '+r.reason;}).join('; ') || 'Retry failed';
        if (btnEl) { btnEl.style.color = '#B91C1C'; btnEl.textContent = 'Retry failed'; btnEl.title = String(reason); }
        if (typeof SH_DOC_REFRESH_[type] === 'function') return SH_DOC_REFRESH_[type](id);
    }).catch(function () {
        // OUTCOME UNKNOWN. The request left and the transport threw, so we cannot say whether the retry ran;
        // resetting to a plain 'Retry' would read as 'nothing happened'. Say what we know, and never replay.
        if (btnEl) {
            btnEl.disabled = false; btnEl.style.color = '#B45309'; btnEl.textContent = 'Outcome unknown';
            btnEl.title = 'The retry request failed in transit. It may or may not have run — reload before trying again.';
        }
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
    if (_shDispatchHeld14_(shipmentId)) {
        _shDispatchUnknown_(shipmentId, null, null, null, null);
        _shNote_(shipmentId, 'A previous confirmation is awaiting verification. Status is being checked; do not confirm again.'); return;
    }
    var cartonV = _shValidateCartons(shipmentId, true);
    if (!cartonV.ok) { alert('Cannot Confirm — ' + cartonV.error); return; }
    if (!_shTokReady_(shipmentId)) return;   // R71-FE-1
    var payload = _shCollectExec(shipmentId);
    var box = document.getElementById('sh-exec-' + shipmentId);
    var totalQty = box ? (parseFloat(box.getAttribute('data-total-qty')) || 0) : 0;
    var missing = [];
    if (!String(payload.external_shipment_id || '').trim()) missing.push('Shipment ID (external)');
    if (!String(payload.reference_id || '').trim()) missing.push('Reference ID');
    if (_shHeldDestination_(shipmentId)) missing.push('Destination Warehouse (the saved ' + _shHeldDestination_(shipmentId) + ' is not selectable now; choose a warehouse)');   // A-delta2 F
    else if (!String(payload.warehouse_code || '').trim()) missing.push('Warehouse Code');
    // FIX7-NEXT-1030 (K1, candidate): carrier and method are not fields of this form - they are the SAVED shipment's (the
    // rate-card choice writes the carrier), as last re-read; the choice is its receipt; a lane edit not saved stops here
    var s0 = _shGetShipments().filter(function (x) { return x.shipmentId === shipmentId; })[0] || {}, rcs = _shRcState_(s0);
    var lane = _shExecDirty(shipmentId).filter(function (k) { return k === 'warehouse_id' || k === 'shipments_customs_type'; });
    var tbaRow6 = !String(s0.carrierId || '').trim() && /^tba1\|/.test(String(s0.rateCardVersion || ''));   // AD3 D r6: the server-owned marker; the server read below decides
    if (!String(s0.carrierId || '').trim() && !tbaRow6) missing.push('Carrier (choose a rate card, or "To be assigned" with a reason under Transport rate card > Edit)');
    if (!String(s0.shippingMethod || '').trim()) missing.push('Shipping Method');
    // Fresh server pricing, not the stale local receipt, decides the next step.
    if (lane.length) missing.push('Save the changed ' + lane.join(' / ') + ', then choose the rate card again');
    if (!String(payload.etd || '').trim()) missing.push('ETD');
    if (!String(payload.eta || '').trim()) missing.push('ETA');
    if (totalQty <= 0) missing.push('Total Qty');
    if (missing.length) { alert('Cannot Confirm — please complete:\n\n• ' + missing.join('\n• ')); return; }
    // R71-FE-8 (SH4): the rate card is re-checked against the shipment AS SAVED before the dialog opens. Read-only; nothing is sent on failure.
    var _db8 = window.KM && window.KM.DB;
    if (!_db8 || typeof _db8.getShipmentRateCardOptions !== 'function') { alert('Cannot Confirm — the rate card cannot be re-checked on this page. Nothing was sent.'); return; }
    if (_shInFlight_[shipmentId]) return;
    _shInFlight_[shipmentId] = true;
    var _cb11 = null; try { _cb11 = Array.prototype.filter.call(document.querySelectorAll('button[onclick^="shConfirmShipment("]'), function (b) { return String(b.getAttribute('onclick')).indexOf(shipmentId) >= 0; })[0] || null; } catch (eCB) {}
    var _cbT11 = _cb11 ? _cb11.innerHTML : ''; if (_cb11) { try { var _r11 = _cb11.getBoundingClientRect(); if (_r11.width) { _cb11.style.minWidth = Math.ceil(_r11.width) + 'px'; _cb11.style.minHeight = Math.ceil(_r11.height) + 'px'; } } catch (eR11) {} _cb11.disabled = true; _cb11.textContent = 'Checking\u2026'; }
    function _cbRel11() { if (_cb11) { _cb11.disabled = false; _cb11.innerHTML = _cbT11; } }
    Promise.resolve(_db8.getShipmentRateCardOptions(shipmentId)).then(function (rc8) {
        delete _shInFlight_[shipmentId]; _cbRel11();
        if (!rc8 || rc8.success !== true) { alert('Cannot Confirm — the rate card could not be re-checked (' + ((rc8 && (rc8.code || rc8.error)) || 'NO_ANSWER') + '). Nothing was sent.'); return; }
        var st8 = (rc8.current && rc8.current.state) || 'NONE';
        if (!String(s0.carrierId || '').trim()) {   // AD3 D r6: a blank carrier is legal only as the SERVER-read TO_BE_ASSIGNED state
            var sv6 = rc8.service || {};
            if (sv6.carrier_state !== 'TO_BE_ASSIGNED') { alert('Cannot Confirm — the carrier is blank and the server does not show it as "to be assigned" (' + (sv6.carrier_state || 'no service state') + '). Choose a carrier, or "To be assigned" with a reason. Nothing was sent.'); return; }
            _shOpenConfirmChecked8_('TBA_COST_PENDING', sv6.carrier_assignment || null); return;
        }
        if (_shHoldHas16_(shipmentId)) { if (st8 === 'UNPRICED_APPROVED' && _shVersionMoved18_(_shHoldTok16_(shipmentId), rc8.unpriced_approval && rc8.unpriced_approval.expected_updated_at) === 'MOVED') _shHoldClear16_(shipmentId); else { _shUnpricedHeldOpen16_(shipmentId); return; } }   // R15d r2b: the server read decides
        if (st8 !== 'COMPLETE' && st8 !== 'UNPRICED_APPROVED' && st8 !== 'COST_PENDING_AUTO' && rc8.unpriced_approval && rc8.unpriced_approval.enabled === true && (rc8.unpriced_approval.available === true || rc8.unpriced_approval.recoverable === true || (rc8.unpriced_approval.card_not_applied && rc8.unpriced_approval.card_not_applied.available === true))) { shUnpricedOpen14(shipmentId, rc8); return; }
        if (st8 !== 'COMPLETE' && st8 !== 'UNPRICED_APPROVED' && st8 !== 'COST_PENDING_AUTO') { alert((_shCostPendingMessage_(rc8) || 'Please review the saved shipping service (' + st8 + ').') + ' Nothing was dispatched.'); return; }
        _shOpenConfirmChecked8_(st8, null, (rc8.current && rc8.current.cargo_notice) || '');
    })['catch'](function (e8) { delete _shInFlight_[shipmentId]; _cbRel11(); alert('Cannot Confirm — the rate card could not be re-checked (' + ((e8 && (e8.code || e8.message)) || e8) + '). Nothing was sent.'); });
    function _shOpenConfirmChecked8_(pricingState, tbaAudit, cargoNotice) {
    var s = _shGetShipments().filter(function (x) { return x.shipmentId === shipmentId; })[0] || {};
    var lines = _shGetShipmentLines().filter(function (l) { return l.shipmentId === shipmentId; });
    var units = lines.reduce(function (a, l) { return a + (l.shipmentQty || l.qty || 0); }, 0);
    _shOpenConfirmModal(shipmentId, {
        no: s.externalShipmentId || s.shipmentNo || shipmentId,
        lineCount: lines.length, units: units, unpriced: pricingState === 'UNPRICED_APPROVED' || pricingState === 'COST_PENDING_AUTO', cargoNotice: cargoNotice || '', tba: pricingState === 'TBA_COST_PENDING', tbaAudit: tbaAudit || null,
        origin: payload.ship_from || s.shipFrom || '—',
        sourceWarehouseId: s.sourceWarehouseId || s.shipFrom || '',
        sourceDomain: _shSourceDomain_(s.sourceWarehouseId),
        noDocuments: s.documentGenerationStatus === 'NOT_REQUIRED',
        dest: (payload.warehouse_code || s.warehouseCode || s.destination || '—'),
        country: s.country || '',
        // S7-R2A — the same resolver the Draft grid uses. The confirm step is the last screen before stock
        // moves, so it names the carrier and keeps the id beside it rather than choosing between them.
        carrier: (function () {
            if (pricingState === 'TBA_COST_PENDING' && !String(payload.carrier_id || s.carrierId || '').trim()) return 'To be assigned (manual logistics)';   // AD3 D r6
            var d = _shCarrierCell_(payload.carrier_id || s.carrierId);
            if (d.state === 'NONE') return '—';
            if (d.state === 'RESOLVED') return d.carrierName;
            return d.carrierId;
        })(),
        method: _shEnumDisplay_('shippingMethod', payload.shipping_method || s.shippingMethod || s.shippingMethodDisplay) || '—',
        tracking: payload.tracking_number || s.trackingNumber || '—',
        container: payload.container_no || s.containerNo || '—',
        etd: payload.etd || s.etd || '—', eta: payload.eta || s.eta || '—'
    }, payload);
    }
}

function _shCloseConfirmModal() {
    var o = document.getElementById('sh-confirm-overlay'); if (o) o.remove();
    var m = document.getElementById('sh-confirm-modal'); if (m) m.remove();
}
// S6-R7 §3 — THE SOURCE DOMAIN, FOR THE CONFIRMATION COPY.
//
// The Confirm & Dispatch modal told every operator that "Factory Stock is deducted", which stopped being
// true when S6-R4B routed the dispatch consume by source domain: an OVERSEAS line moves reserved down and
// leaves wh_available_stock alone — it deducts no factory stock at all. The operator was reading a
// description of what the system was about to do, and for an overseas source it was the wrong one.
//
// THIS IS NOT A SECOND AUTHORITY. The modal opens before any server answer exists, so there is nothing to
// read a domain off; it asks IRWarehouse, the shared classifier the server's own ovsWarehouseSourceDomain_
// agrees with (factory flag first, then warehouse_type — s6-r3 pins both halves against it). When that
// module or the warehouse row is missing it answers '', and the copy falls back to wording that is true of
// BOTH domains rather than to the factory sentence. The server remains the authority for what is written.
function _shSourceDomain_(sourceWarehouseId) {
    var id = String(sourceWarehouseId || '').trim();
    if (!id) return '';
    var IRW = window.IRWarehouse;
    if (!IRW || typeof IRW.isFactory !== 'function') return '';
    var row = null;
    (_shGetWarehouses() || []).forEach(function (w) {
        if (!row && String(w.warehouseId || w.warehouse_id || '').trim() === id) row = w;
    });
    if (!row) return '';
    try { return IRW.isFactory(row) ? 'FACTORY' : 'OVERSEAS'; } catch (e) { return ''; }
}
// What confirming actually does to stock, per domain. The neutral sentence is true of both and is what an
// unresolved domain gets — a confirmation screen is the last place to state a specific effect on a guess.
function _shDispatchStockSentence_(domain) {
    if (domain === 'OVERSEAS') {
        return 'the reserved overseas stock is consumed, without deducting available stock again';
    }
    if (domain === 'FACTORY') {
        return 'factory inventory is deducted and its reservation released';
    }
    return 'inventory is updated at the source warehouse';
}
function _shOpenConfirmModal(shipmentId, sum, execPayload) {
    _shCloseConfirmModal();
    delete _shConfirmRouteMode_[shipmentId];   // AD3 D: every new Confirm dialog starts with the normal route template; manual is chosen explicitly in it
    var overlay = document.createElement('div');
    overlay.id = 'sh-confirm-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.45);z-index:2000;';
    overlay.addEventListener('click', _shCloseConfirmModal);
    document.body.appendChild(overlay);
    var modal = document.createElement('div');
    modal.id = 'sh-confirm-modal';
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-label', 'Confirm Shipment');
    modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:2001;background:#fff;border-radius:8px;box-shadow:0 10px 40px rgba(0,0,0,0.25);width:460px;max-width:calc(100vw - 32px);box-sizing:border-box;max-height:90vh;overflow-y:auto;padding:20px 22px;font-size:13px;color:#1E293B;';
    function row(k, v) { return '<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.8fr);gap:12px;padding:5px 0;border-bottom:1px solid #F1F5F9;overflow-wrap:anywhere;"><span style="color:#64748B;">' + _shEsc(k) + '</span><strong style="text-align:right;">' + _shEsc(v) + '</strong></div>'; }
    modal.innerHTML =
        '<h3 style="margin:0 0 10px;font-size:16px;">Confirm Shipment</h3>' +
        row('Shipment No.', sum.no) + row('Lines / Total Units', sum.lineCount + ' / ' + (sum.units || 0).toLocaleString()) +
        row('From', sum.origin) + row('Destination', (sum.country ? sum.country + ' / ' : '') + sum.dest) +
        row('Carrier', sum.carrier) + row('Shipping Method', sum.method) +
        (sum.unpriced ? row('Freight', 'Cost pending') : '') +
        (sum.cargoNotice ? '<p class="sh-confirm-cargo" style="color:#92400E;overflow-wrap:anywhere;">' + _shEsc(sum.cargoNotice) + '</p>' : '') +
        (sum.tba ? row('Freight', 'Cost pending (carrier to be assigned) - no amount') : '') +   // AD3 D r6
        (sum.tba ? '<div class="sh-confirm-tba" style="background:#FFF7ED;border:1px solid #FDBA74;color:#9A3412;border-radius:6px;padding:8px 10px;margin:10px 0;font-size:12px;line-height:1.5;">' +
            '<strong>Carrier to be assigned.</strong> This shipment has no carrier yet' + (sum.tbaAudit && sum.tbaAudit.reason ? ' (' + _shEsc(sum.tbaAudit.reason) + ')' : '') + ' and no quote: freight cost stays pending, no amount is recorded. It can only go with manual logistics (no route template); assign the carrier later on the card.' +
            '<label style="display:flex;gap:6px;align-items:flex-start;margin-top:6px;"><input type="checkbox" id="sh-confirm-tba-ack"> I confirm shipping with the carrier to be assigned and the cost pending.</label></div>' : '') +
        row('Tracking / Container', sum.tracking + ' / ' + sum.container) + row('ETD / ETA', sum.etd + ' / ' + sum.eta) +
        '<div style="background:#FFFBEB;border:1px solid #FDE68A;color:#92400E;border-radius:6px;padding:8px 10px;margin:12px 0;font-size:12px;line-height:1.5;">' +
          'Confirming marks this shipment as <strong>Shipped</strong>; ' + _shDispatchStockSentence_(sum.sourceDomain) + '. ' + (sum.noDocuments ? '' : 'Shipping documents will be generated in Drive. ') + '<strong>This action cannot be undone here.</strong></div>' +
        '<div id="sh-confirm-status" role="status" aria-live="polite" style="min-height:18px;font-size:12.5px;margin:6px 0;"></div>' +
        '<div id="sh-confirm-actions" style="display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-top:8px;">' +
          '<button type="button" id="sh-confirm-cancel" style="width:96px;height:36px;padding:7px 12px;border:1px solid #94A3B8;background:#E2E8F0;color:#1E293B;border-radius:6px;cursor:pointer;font-weight:600;">Cancel</button>' +
          '<button type="button" id="sh-confirm-go" style="width:180px;height:36px;padding:7px 12px;border:0;background:#0284C7;color:#fff;border-radius:6px;cursor:pointer;font-weight:600;">Confirm &amp; Dispatch</button>' +
        '</div>';
    document.body.appendChild(modal);
    document.getElementById('sh-confirm-cancel').addEventListener('click', _shCloseConfirmModal);
    document.getElementById('sh-confirm-go').addEventListener('click', function () { _shRunConfirm(shipmentId, execPayload); });
    var ack6 = document.getElementById('sh-confirm-tba-ack'), go6 = document.getElementById('sh-confirm-go');   // AD3 D r6: Confirm stays off until the acknowledgement is ticked
    if (ack6 && go6) { go6.disabled = true; go6.style.opacity = '0.6'; ack6.addEventListener('change', function () { go6.disabled = !ack6.checked; go6.style.opacity = ack6.checked ? '' : '0.6'; }); }
}
function _shFinishWithoutDocuments_(shipmentId) {
    delete _shConfirmSaved_[shipmentId];
    _shCloseConfirmModal();
    return Promise.resolve().then(function(){return _shLoadAndRender();}).catch(function(){_shNote_(shipmentId,'Shipment is Shipped. Refresh the list to see the updated card; do not confirm again.');});
}
function _shRunConfirm(shipmentId, execPayload) {
    var go = document.getElementById('sh-confirm-go');
    var cancel = document.getElementById('sh-confirm-cancel');
    var status = document.getElementById('sh-confirm-status');
    if (!go || go.disabled) return;   // FIX7-NEXT-1030 (K1): a second click while it runs sends nothing
    var ack6r = document.getElementById('sh-confirm-tba-ack'); if (ack6r && !ack6r.checked) return;   // AD3 D r6: TBA needs the explicit acknowledgement
    if (_shDispatchHeld14_(shipmentId)) { _shDispatchUnknown_(shipmentId, null, go, cancel, status); return; }
    go.disabled = true; go.textContent = 'Confirming…'; if (cancel) cancel.disabled = true;
    if (status) { status.style.color = '#0369a1'; status.textContent = 'Persisting fields…'; }
    // 1) Persist the card's field edits (Save; no status change). 2) R3C — reconcile canonical DRAFT PO allocations
    // from the just-persisted shipment_lines (ONE shipment-scoped call to the R3A authority; NO frontend FIFO /
    // capacity math). 3) Single atomic dispatch command (R3B executes draft→executed + reconciles shipped_qty).
    // R71-FE-2 (review m-5): a retry in the SAME dialog after step 1 succeeded does not resend it (its token is its own stale one)
    var step1Done_ = _shConfirmSaved_[shipmentId] === execPayload;
    // R14-F1 (review M-1): a read-only status read BEFORE the Save - only a shipment the server still holds as ready_to_ship goes on;
    // anything else (shipped from another tab / origin, unreadable) stops here with nothing written and nothing sent.
    _shPreConfirmStatusF1_(shipmentId).then(function (pre) {
        if (!pre.ok) {
            if (status) { status.style.color = '#b91c1c'; status.textContent = pre.message; }
            go.disabled = true; go.textContent = pre.dispatched ? 'Already dispatched' : 'Stopped'; if (cancel) { cancel.disabled = false; cancel.textContent = 'Close'; }
            throw { _handled: true };
        }
        return step1Done_ ? { step1_skipped: true } : window.KM.DB.updateShipment(execPayload);
    }).then(function (r1) {
        if (!step1Done_) { _shConfirmSaved_[shipmentId] = execPayload; _shAdoptTok_(shipmentId, r1); if (r1 && r1.updated_at) execPayload.expected_updated_at = r1.updated_at; }
        if (status) status.textContent = 'Preparing PO allocation…';
        return window.KM.DB.generateShipmentLineAllocations({ shipment_id: shipmentId, actor: 'operation-system' });
    }).then(function (alloc) {
        // R3C §6 — allocation readiness gate (UX only; R3B remains the in-lock execution authority). Fail closed:
        // the physical shipment draft stays saved, but dispatch does NOT proceed until PO allocation is valid.
        // c7fix (found with M-A): an OVERSEAS source has no factory PO lineage - 32_ answers SHIPMENT_FACTORY_ATTRIBUTION_GAP / NOT_A_FACTORY_WAREHOUSE (zero write).
        // The page used to stop there, so a legal 3PL -> FBA transfer could never reach Confirm from this page. It now goes on to the server Confirm (22_),
        // which alone decides: a legal transfer is confirmed without PO allocation, anything else is refused SHIPMENT_PO_ALLOCATION_MISSING with its reason.
        var _c7ovs = !!(alloc && alloc.success === false && alloc.error === 'SHIPMENT_FACTORY_ATTRIBUTION_GAP' && alloc.reason === 'NOT_A_FACTORY_WAREHOUSE' && alloc.zero_write === true);
        if (_c7ovs && status) status.textContent = '來源不是工廠倉：不建立 PO 配置，交由伺服器檢查海外調撥條件…';
        if (!_c7ovs && (!alloc || alloc.success === false)) {
            var aerr = (alloc && alloc.error) || 'Allocation could not be prepared';
            var d0 = (alloc && alloc.detail) || {};
            var shortfall = (d0.shortage_qty != null) ? (' — need ' + d0.shipment_qty + ', available ' + d0.available_capacity + ', short ' + d0.shortage_qty) : '';
            if (status) { status.style.color = '#b91c1c'; status.innerHTML = '<strong>PO Allocation — Needs Attention:</strong> ' + _shEsc(aerr) + _shEsc(shortfall) + '.<br>The shipment draft is saved; resolve PO capacity before dispatching.'; }
            go.disabled = false; go.textContent = 'Confirm & Dispatch'; if (cancel) cancel.disabled = false;
            throw { _handled: true };   // stop the chain WITHOUT dispatching
        }
        if (status) status.textContent = 'PO allocation ready — confirming & dispatching…';
        if (status) status.textContent = (_shFindShipment_(shipmentId)||{}).documentGenerationStatus==='NOT_REQUIRED' ? 'Confirming shipment...' : 'Confirming and preparing documents...';
        _shDispatchHold14_(shipmentId, true);
        return window.KM.DB.confirmShipmentAndDispatch(Object.assign({ shipment_id: shipmentId, actor: 'operation-system', expected_updated_at: (execPayload && execPayload.expected_updated_at) || undefined },
            _shConfirmRouteMode_[shipmentId] === 'MANUAL' ? { route_mode: 'MANUAL' } : {}));   // AD3 D: route_mode only after the operator pressed the manual-logistics button in THIS dialog   // R15F2 P1 (GAP-2): the version this user's Save wrote; the retry reuses it, never a refetch
    }).then(function (res) {
        if (!res || res.success === false) {
            // R71-FE-2: the dispatch answer was lost (db-api stage 'network': dropped / HTTP error / non-JSON / timed out) - never re-enable blindly
            if (res && res.stage === 'network') { _shDispatchUnknown_(shipmentId, res, go, cancel, status); return; }
            if (res && (res.zero_write === true || (res.dispatch_outcome==='ROLLED_BACK_VERIFIED'&&res.retry_safe===true))) _shDispatchHold14_(shipmentId, false);
            else { _shDispatchUnknown_(shipmentId, res, go, cancel, status); return; }
            _shAfterStep1Fail_(shipmentId, execPayload);   // R71-FE-2 (m-5)
            var stage = (res && res.stage) ? (' [' + res.stage + ']') : '';
            // D1 — a pre-dispatch document readiness failure. Nothing was written; explain each blocker in the
            // same plain-language form the Document Panel uses, so the user can act without reading codes.
            if (res && res.stage === 'document_readiness') {
                var bl = (res.blockers || []).slice(0, 4).map(function (b) {
                    var h = _shDocHelp(b && b.reason);
                    return '<li style="margin-top:3px;">' + _shEsc(h.say) + '<br><span style="font-size:11px;">Contact your administrator to review the shipping document setup.</span>' +
                        '<details style="font-size:11px;"><summary>Details</summary>' + _shReadinessDetailsDw2_(b) + '</details></li>';
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
            // R16-DOC-VALUES: show the server blockers only after a definitive zero-write refusal.
            if (res && res.stage === 'document_values' && res.zero_write === true) {
                if (status) {
                    status.style.color = '#b91c1c';
                    status.innerHTML = _shDocumentValuesHtml16_(res);
                }
                go.disabled = false; go.textContent = 'Confirm & Dispatch';
                if (cancel) cancel.disabled = false;
                return;
            }
            if (_shRouteRefusalHtml_(shipmentId, res, go, cancel, status, execPayload)) return;   // AD3 D: route-template answers (manual fallback offered only when the server says so)
            if (status) { status.style.color = '#b91c1c'; status.textContent = 'Confirm failed' + stage + ': ' + ((res && res.error) || 'Unknown error') + ' — shipment_id: ' + shipmentId +
                ((res && res.overseas_transfer_check && res.overseas_transfer_check.reason) ? ' — 不適用海外調撥免 PO 規則：' + String(res.overseas_transfer_check.reason) + '（需先完成 PO 配置）' : ''); }   // c7fix M-A
            go.disabled = false; go.textContent = 'Confirm & Dispatch'; if (cancel) cancel.disabled = false;
            return;
        }
        var d = res.data || {};
        if (SH_DISPATCHED_STATUSES_R71_[String(d.status || '').toLowerCase()] !== 1) { _shDispatchUnknown_(shipmentId, res, go, cancel, status); return; }
        _shDispatchHold14_(shipmentId, false);
        var already = res.already_confirmed ? ' (already confirmed — no duplicate writes)' : '';
        if (status) status.style.color = '#166534';
        var actions = document.getElementById('sh-confirm-actions');
        var dg = d.document_generation || {};
        if(dg.status==='NOT_REQUIRED')return _shFinishWithoutDocuments_(shipmentId);
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
            (String(d.route_mode || '').toUpperCase() === 'MANUAL' ? '<span class="sh-confirm-manual-route">Manual logistics (no route template): source and destination only; report the position on the shipment card.</span><br>' : '') +   // AD3 D
            'Route initialized: ' + (d.route_nodes_created != null ? d.route_nodes_created : '—') + ' node(s) · Initial Event created: ' + (d.events_created != null ? d.events_created : '—') + ' · Stock movements: ' + (d.stock_movements_created != null ? d.stock_movements_created : '—') +
            docLine;
        if (actions) {
            actions.innerHTML = '<button type="button" id="sh-confirm-close" style="height:36px;min-width:96px;padding:7px 14px;border:1px solid #94A3B8;background:#E2E8F0;color:#1E293B;border-radius:6px;cursor:pointer;">Close</button>' +
                '<button type="button" id="sh-confirm-documents" style="padding:7px 14px;border:0;background:#0284C7;color:#fff;border-radius:6px;cursor:pointer;font-weight:600;">View Documents</button>' +
                '<button type="button" id="sh-confirm-view" style="padding:7px 14px;border:0;background:#0080bb;color:#fff;border-radius:6px;cursor:pointer;font-weight:600;">View On the Way</button>';
            document.getElementById('sh-confirm-close').addEventListener('click', function () { _shCloseConfirmModal(); _shLoadAndRender(); });
            document.getElementById('sh-confirm-documents').addEventListener('click', function () { shViewShipmentDocuments(d.shipment_id || shipmentId); });
            document.getElementById('sh-confirm-view').addEventListener('click', function () {
                _shCloseConfirmModal();
                window._glmPendingSelect = d.shipment_id || shipmentId;   // runtime page auto-selects it on mount
                if (typeof showSection === 'function') showSection('global-logistics-map');
            });
        }
    }).catch(function (err) {
        _shAfterStep1Fail_(shipmentId, execPayload);   // R71-FE-2 (m-5): no-op unless step 1 saved
        if (_shDispatchHeld14_(shipmentId)) { _shDispatchUnknown_(shipmentId, null, go, cancel, status); return; }
        if (err && err._handled) return;   // R3C allocation-readiness block already surfaced its own message
        if (err && err.code === 'EDIT_CONFLICT') { _shCloseConfirmModal(); _shEditConflict_(shipmentId, err); return; }   // R71-FE-1: step 1 (Save) refused, nothing dispatched
        if (status) { status.style.color = '#b91c1c'; status.textContent = 'Confirm failed: ' + (err && err.message ? err.message : err) + ' — shipment_id: ' + shipmentId; }
        go.disabled = false; go.textContent = 'Confirm & Dispatch'; if (cancel) cancel.disabled = false;
    });
}

// F1-7N-FC-1A-R1 §F — CANCEL SHIPMENT DRAFT. The trigger FC-1A shipped without.
//
// FC-1A made Shipment Draft creation acquire a factory stock reservation and there was no routed way to
// release one before dispatch, so a reservation could become operationally unreleasable. This is the button
// that gives units back.
//
// The confirmation states the two facts an operator needs and cannot infer, because getting either one
// backwards is expensive: current stock is NOT deducted (a cancellation returns a claim, not physical units),
// and the reserved availability IS released (so another site can plan them immediately). It also names the
// exact quantity and source warehouse, since "release the reservation" means nothing without them.
var _shCancelInFlight = {};
function shCancelShipmentDraft(shipmentId, expectedStatus) {
    if (_shCancelInFlight[shipmentId]) return;                 // §M.20 — one click, one cancellation
    var s = _shFindShipment_(shipmentId);
    var qty = s ? _shNum(s.totalQty || s.shipmentTotalQty) : 0;
    var src = s ? String(s.sourceWarehouseId || s.shipFrom || '') : '';
    var lines = [
        'Cancel this Shipment Draft?',
        '',
        'Shipment: ' + shipmentId + (s && s.externalShipmentId ? (' (' + s.externalShipmentId + ')') : ''),
        'Quantity: ' + qty + (src ? ('   Source warehouse: ' + src) : ''),
        '',
        'Current factory stock will NOT be deducted.',
        'The reserved quantity WILL be released, so it becomes available to other plans immediately.',
        '',
        'The shipment is kept as a cancelled record (nothing is deleted).',
        'Linked Shipping Plans return to Pending Approval and must be approved again.'
    ];
    if (!confirm(lines.join('\n'))) return;
    var reason = prompt('Reason for cancelling this Shipment Draft (required):', '');
    if (reason == null) return;                                 // cancelled the prompt
    reason = String(reason).trim();
    if (!reason) { alert('A reason is required to cancel a Shipment Draft.'); return; }

    _shCancelInFlight[shipmentId] = true;
    _shSetCancelBusy_(shipmentId, true);
    Promise.resolve(window.KM.DB.cancelShipmentDraft({
        shipment_id: shipmentId,
        expected_status: expectedStatus || (s ? s.status : ''), expected_updated_at: _shTok_(shipmentId) || undefined,   // R15F2 P1: the row version this page read
        actor: 'operation-system',
        reason: reason,
        // Idempotency is enforced SERVER-side (an already-cancelled shipment answers REUSED); this key is the
        // correlation id that makes a retried request recognisable as the same intent.
        idempotency_key: 'CANCEL-SHIPMENT:' + shipmentId
    })).then(function (res) {
        _shCancelInFlight[shipmentId] = false;
        _shSetCancelBusy_(shipmentId, false);
        if (res && res.success) {
            var d = res.data || {};
            if (d.outcome === 'REUSED') alert('This Shipment Draft was already cancelled. Nothing was changed.');
            else {
                alert('Shipment Draft cancelled.\n\nReservation released: ' + (d.reservation_released || 0) +
                      (d.source_warehouse_id ? (' at ' + d.source_warehouse_id) : '') +
                      '\nPO allocations released: ' + (d.allocations_released || 0) +   // SCF1 (F1)
                      '\nCurrent factory stock: unchanged. PO completed / remaining: unchanged.' +
                      (d.plan_execution_commit === 'PENDING_APPROVAL'
                        ? '\n\nLinked Shipping Plans have returned to Pending Approval. Approve them again in Shipping Plan Review.'
                        : d.plan_handoff_cleared ? '\n\nThis backend still uses the previous approval flow. Update the Shipping Loop GS package before using the new return-to-review flow.' : ''));
            }
            _shReadbackOne_(shipmentId);                        // authoritative readback - R15C-B3: of this shipment (whole-area only if that read fails)
            return;
        }
        // TYPED failure, and the state on screen is RETAINED: no optimistic cancellation.
        // SCF1 (2026-11-13, F4): "Nothing was changed" ONLY when the server PROVED zero write (12_ scfCancelOut_ puts zero_write in data, which
        // the command layer keeps as error.details). Every other failure - a lost / timed-out / non-JSON answer, a rollback (verified or
        // stopped), a failure after writes started - is said as NOT PROVEN. Nothing is resent and nothing is retried automatically.
        var err = (res && res.error) || { code: 'UNKNOWN', message: 'Cancellation failed' };
        if (typeof err !== 'object') err = { code: (res && res.code) || 'UNKNOWN', message: String(err) };
        var errCode = String(err.code || 'UNKNOWN'), errMsg = String(err.message || errCode);
        if (err.details && err.details.zero_write === true) {
            alert('Cancel failed: ' + errMsg + ' [' + errCode + ']\n\nNothing was changed (the server confirmed that nothing was written).');
        } else {
            alert('Cancel result not proven: ' + errMsg + ' [' + errCode + ']\n\nThe server did not confirm that nothing was written, so this page cannot say whether the draft was cancelled or its reservation and PO allocations were released. Nothing was resent and nothing will be retried automatically. The shipment is being re-read - check it before doing anything else.');
        }
        _shReadbackOne_(shipmentId);   // R15C-B3
    }, function (e) {
        _shCancelInFlight[shipmentId] = false;
        _shSetCancelBusy_(shipmentId, false);
        // Outcome UNKNOWN, not failed. The readback settles it, and a retry is safe because the server
        // answers REUSED for an already-cancelled shipment.
        alert('Cancel result not proven: ' + (e && e.message ? e.message : e) +   // SCF1 (F4): no answer = not proven; never retried automatically
              '\n\nNothing was resent and nothing will be retried automatically. The list will refresh - check the shipment before doing anything else.');
        _shLoadAndRender();
    });
}
// Locate one shipment in the current read model, whichever source it came from.
function _shFindShipment_(shipmentId) {
    var pool = (_shReadModel && _shReadModel.shipments) || [];
    for (var i = 0; i < pool.length; i++) {
        if (String(pool[i].shipmentId || pool[i].shipment_id) === String(shipmentId)) return pool[i];
    }
    return null;
}
// §F — disable while in flight, so a double click cannot become a second cancellation attempt.
function _shSetCancelBusy_(shipmentId, busy) {
    var b = document.getElementById('sh-cancel-' + shipmentId);
    if (!b) return;
    b.disabled = !!busy;
    b.textContent = busy ? 'Cancelling…' : 'Cancel Shipment Draft';
}

// Return to Draft (Phase-2 placeholder, no permissions): send a Ready to Ship shipment back to
// Draft with a required revision reason (appended to the note history server-side).
function shReturnToDraft(shipmentId) {
    var reason = prompt('Return this shipment to Draft for revision.\n\nEnter a reason (required):');
    if (reason == null) return;
    reason = String(reason).trim();
    if (!reason) { alert('A reason is required to return to Draft.'); return; }
    if (!_shTokReady_(shipmentId)) return;   // R71-FE-1
    _shUpd_(shipmentId, { shipment_id: shipmentId, status: 'draft', revision_reason: reason, actor: 'operation-system', expected_updated_at: _shTok_(shipmentId) || undefined })   // CHAIN r8 / R71-FE-1: token (second precision only)
        .then(function() { _shReadbackOne_(shipmentId); })   // R15C-UI
        .catch(function(err) { if (_shEditConflict_(shipmentId, err)) return; if (_shUnknown11_(shipmentId, err, 'Return to Draft')) return; alert('Return to Draft failed: ' + (err && err.message ? err.message : err)); });
}

// Done = hide the shipped card from the Shipment Draft workspace (still shown in Overview; not deleted).
function shShipmentDone(shipmentId) {
    if (!confirm('This shipment is already Shipped and visible in Shipment Overview.\n\nHide it from the Shipment Draft workspace?')) return;
    if (!_shTokReady_(shipmentId)) return;   // R71-FE-1
    _shUpd_(shipmentId, { shipment_id: shipmentId, hidden_from_draft: true, actor: 'operation-system', expected_updated_at: _shTok_(shipmentId) || undefined })
        .then(function() { _shReadbackOne_(shipmentId); })   // R15C-B3
        .catch(function(err) { if (_shEditConflict_(shipmentId, err)) return; if (_shUnknown11_(shipmentId, err, 'Done')) return; alert('Done failed: ' + (err && err.message ? err.message : err)); });
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
    // N01 (A final2): choosing the blank option on a Draft that HAS a destination is an EXPLICIT clear - sent as destination_warehouse_id ''
    // (the server never clears the destination from a blank warehouse_id alone). Choosing a warehouse again withdraws it.
    var clr = document.getElementById('sh-whclear-' + shipmentId);
    if (sel.value === '' && sel.getAttribute('data-canonical')) { if (!clr) { clr = document.createElement('input'); clr.type = 'hidden'; clr.id = 'sh-whclear-' + shipmentId; clr.setAttribute('data-field', 'destination_warehouse_id'); clr.value = ''; box.appendChild(clr); } }
    else if (clr && clr.parentNode) clr.parentNode.removeChild(clr);
}

// Status-advance placeholder (Overview post-ship lifecycle). No factory-stock side effects.
function shAdvanceStatus(shipmentId, nextStatus) {
    if (!nextStatus) return;
    if (!confirm('Advance shipment to "' + (SH_STATUS_LABEL[nextStatus] || nextStatus) + '"?')) return;
    if (!_shTokReady_(shipmentId)) return;   // R71-FE-1
    _shUpd_(shipmentId, { shipment_id: shipmentId, status: nextStatus, actor: 'operation-system', expected_updated_at: _shTok_(shipmentId) || undefined })
        .then(function() { _shLoadAndRender(); })
        .catch(function(err) { if (_shEditConflict_(shipmentId, err)) return; if (_shUnknown11_(shipmentId, err, 'Status update')) return; alert('Status update failed: ' + (err && err.message ? err.message : err)); });
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
window.shRegisterDocumentRefresh = shRegisterDocumentRefresh;

// R3-IMPORT (2026-10-29, local candidate) - More Options -> the shared batch import (KM.importBatch, lazy-loaded). Outside click /
// Escape close, arrow keys move between items (the Factory / Overseas menu behaviour).
function shToggleActionsMenu(ev) {
    if (ev) { try { ev.stopPropagation(); } catch (e) {} }
    var t = document.getElementById('shActionsTrigger'), l = document.getElementById('shActionsList'); if (!t || !l) return;
    if (!document.getElementById('shHealthExportItem')) { var hb3_ = document.createElement('button'); hb3_.type = 'button'; hb3_.id = 'shHealthExportItem'; hb3_.setAttribute('role', 'menuitem'); hb3_.className = 'km-page-actions-menu__item'; hb3_.textContent = '下載 health JSON（唯讀）'; hb3_.onclick = function () { shCloseActionsMenu(); shHealthExport(); }; l.appendChild(hb3_); }   // A final3 (Owner item 6): one-click read-only health export
    var open = l.hidden; l.hidden = !open; t.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) { var f = l.querySelector('[role=menuitem]'); if (f) f.focus(); }
    if (!window.__shMenuBound) {
        window.__shMenuBound = true;
        document.addEventListener('click', function (e) { var L = document.getElementById('shActionsList'); if (L && !L.hidden && !(e.target.closest && e.target.closest('#shActionsMenu'))) shCloseActionsMenu(); });
        document.addEventListener('keydown', function (e) { var L = document.getElementById('shActionsList'); if (!L || L.hidden) return; var it = [].slice.call(L.querySelectorAll('[role=menuitem]')), i = it.indexOf(document.activeElement);
            if (e.key === 'Escape') { e.preventDefault(); shCloseActionsMenu(); var T = document.getElementById('shActionsTrigger'); if (T) T.focus(); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); (it[(i + 1) % it.length] || it[0]).focus(); } else if (e.key === 'ArrowUp') { e.preventDefault(); (it[(i - 1 + it.length) % it.length] || it[0]).focus(); } });
    }
}
function shCloseActionsMenu() { var t = document.getElementById('shActionsTrigger'), l = document.getElementById('shActionsList'); if (l) l.hidden = true; if (t) t.setAttribute('aria-expanded', 'false'); }
function shRunAction(kind) {
    shCloseActionsMenu();
    if (kind !== 'import') return;
    function go() { window.KM.importBatch.open({
        domain: 'shipment', title: 'Import Shipment',
        // SHIP-OPEN: exactly two modes, ONE Download (Add New = blank template, Update Existing = this company's updatable shipments)
        combinedWorkflowButtons: true,
        modes: [
            { value: 'ADD_NEW', label: 'Add New', withData: false, help: 'Shipments already on the way (left the source warehouse, not fully received). Required: 出貨單號, 國家, 站點, 出貨倉, 目的倉, ETD, ETA, Reference ID, Shipping method, Last mile; Lines: 出貨單號, SKU, 在途中數量 (quantity still not received). Source: an active factory or this company\'s active 3PL overseas warehouse. The import time is recorded by the server. No stock deduction, reservation, PO, route, event, receipt, document or e-mail.' },
            { value: 'UPDATE', label: 'Update Existing', withData: true, help: 'The file holds every updatable shipment of the company: tracking / booking / invoice numbers, ETA (fill, never clear), actual dates / costs and notes. Quantity, company, status and SKU never change here.' }
        ],
        scopeFields: [
            { key: 'company', label: 'Company', required: true, options: function () { return window.KM.DB.importTemplateGet({ domain: 'shipment', mode: 'ADD_NEW', scope: {} }).then(function (t) {
                if (!t || t.success !== true) { var e = new Error((t && t.code) || 'SHIPMENT_IMPORT_OPTIONS_UNAVAILABLE'); e.code = (t && t.code) || 'SHIPMENT_IMPORT_OPTIONS_UNAVAILABLE'; throw e; }
                return ((t.lists && t.lists.company) || []).map(function (o) { return { value: o.value, label: o.label && o.label !== o.value ? o.value + ' — ' + o.label : o.value }; }); }); } },
            // A final3 (2A): no date picker - the server records the import time; opening_as_of is the source data time only
        ],
        scopeLabel: function (v) { return v && v.company ? 'Company ' + v.company + '. Update Existing: the export holds EVERY updatable shipment of this company, not the visible page.' : 'Choose the company first.'; },   // A final3
        actor: function () { return (window.KM && window.KM.currentUser && window.KM.currentUser.email) || ''; },
        onCommitted: function () { _shReadModel = null; _shRefresh_(renderShipmentOverview); }
    }); }
    if (window.KM && window.KM.importBatch) return go();
    var L = window.KM && window.KM.scriptLoader; if (!L) { alert('The import module could not be loaded.'); return; }
    return L.load('assets/js/utils/import-batch.js?v=r6103-r3-20261123').then(function (ok) { if (ok && window.KM.importBatch) go(); else alert('The import module could not be loaded. Nothing was changed.'); });
}
// A final3 (Owner 2026-11-20 item 6): ONE-CLICK, READ-ONLY health export (More Options > 下載 health JSON). The SAME reads and rules as the
// Console collectors (Sandbox v3.1 / Production v2.1): the Sandbox guard gate, system.health, the sign-in wait, then getClientCapabilities
// through the app's own protected read path _kmGapRead_ + _kmCapVerifyServedAction_ (same login, same guard - no bypass, no new endpoint).
// Success -> a file holding EXACTLY the JSON the strict checker reads (Sandbox KM_SANDBOX_HEALTH_METADATA_ONLY_V1 / Production
// KM_PROD_HEALTH_SUMMARY_V2, allowlisted fields only). Any failure -> a DIAGNOSTIC file (step names, ms, error codes, fetch counts) that the
// checker refuses as health. Never writes a URL, token, session, payload or the db fingerprint; never builds the gate or a success flag.
// A file download replaces the Console copy() (no clipboard race). No retry; a late answer is never used.
async function shHealthExport() {
    var sbx = !!window.KM_SANDBOX_GUARD_, prod = !sbx && !!window.KM_PRODUCTION_GUARD_;
    if (!sbx && !prod) { alert('Health export: this page has no Sandbox or Production guard. Nothing was read.'); return null; }
    if (!window.KM || !window.KM.DB || typeof window.KM.DB.getSystemHealth !== 'function') { alert('Health export: the health read is not available on this page. Nothing was read.'); return null; }
    var envName = sbx ? 'sandbox' : 'production';
    var scalar = function (v) { return (typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number') ? v : null; };
    var names = function (v) { return Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string'; }) : null; };
    var code = function (r) { var e = r && (r.error || r), t = e && e.transport; return { code: scalar(e && (e.code || (typeof r.code === 'string' ? r.code : null))), phase: scalar(t && t.phase), http_status: scalar(t && t.httpStatus) }; };
    var now = function () { return (typeof performance !== 'undefined' && performance.now) ? Math.round(performance.now()) : null; };
    var fetchTiming = function () { try { if (typeof performance === 'undefined' || !performance.getEntriesByType) return 'UNAVAILABLE';
        var e = performance.getEntriesByType('resource').filter(function (x) { return x.initiatorType === 'fetch' || x.initiatorType === 'xmlhttprequest'; }), t = now();
        return { count: e.length, last_120s: e.filter(function (x) { return x.startTime > t - 120000; }).length, max_ms: e.reduce(function (m, x) { return Math.max(m, Math.round(x.duration || 0)); }, 0), last_durations_ms: e.slice(-8).map(function (x) { return Math.round(x.duration || 0); }) }; } catch (err) { return 'UNAVAILABLE'; } };
    var diag = { kind: sbx ? 'KM_SANDBOX_HEALTH_DIAG_V3' : 'KM_PROD_HEALTH_DIAG_V2', diag_version: sbx ? '3.1' : '2.1', source: 'IN_APP_EXPORT', captured_at: new Date().toISOString(), steps: [], verdict: null };
    var bounded = function (p, ms) { return new Promise(function (res) { var done = false, tm = setTimeout(function () { if (!done) { done = true; res({ timeout: true }); } }, ms);
        Promise.resolve(p).then(function (v) { if (!done) { done = true; clearTimeout(tm); res({ value: v }); } }, function (e) { if (!done) { done = true; clearTimeout(tm); res({ thrown: true, name: scalar(e && e.name) }); } }); }); };
    var step = async function (name, fn, ms) { var t0 = Date.now(), r = await bounded(Promise.resolve().then(fn), ms), s = { step: name, ms: Date.now() - t0, budget_ms: ms, at_ms_since_navigation: now() };
        s.outcome = r.timeout ? 'TIMEOUT' : r.thrown ? 'THREW' : 'RETURNED'; if (r.thrown) s.error = r.name; diag.steps.push(s); return r; };
    var stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-');
    var save = function (obj, isDiag) {
        var text = JSON.stringify(obj, null, 2), name = 'km-health-' + envName + (isDiag ? '-DIAG' : '') + '-' + stamp + '.json';
        try { var blob = new Blob([text], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
            setTimeout(function () { try { URL.revokeObjectURL(url); if (a.parentNode) a.parentNode.removeChild(a); } catch (e2) {} }, 1500); } catch (e) { alert('Health export: the file could not be saved (' + scalar(e && e.name) + ').'); }
        alert(isDiag ? '已下載診斷檔 ' + name + '（不是 health；verdict ' + obj.verdict + '）。請把整個檔案交回，不要重試多次。' : '已下載 ' + name + '。請用 check-health-download.ps1 檢查；這個檔案本身不是 PASS。');
        return { name: name, text: text, diag: !!isDiag };
    };
    try {
        diag.page = { ms_since_navigation: now(), visibility: scalar(typeof document !== 'undefined' && document.visibilityState), online: scalar(typeof navigator !== 'undefined' && navigator.onLine) };
        diag.fetch_at_start = fetchTiming();
        var pa = window.KM.passwordAccess;
        diag.sign_in = pa ? (typeof pa.isSignedIn === 'function' ? !!pa.isSignedIn() : 'UNKNOWN') : 'NO_PASSWORD_ACCESS_MODULE';
        diag.capabilities_path = typeof _kmGapRead_ === 'function' ? 'APP_PROTECTED_READ_PATH' : 'KM_DB_GETCLIENTCAPABILITIES';
        if (sbx) {
            var g = window.KM_SANDBOX_GUARD_;
            diag.guard = { verdict: scalar(g.verdict), refusals: (g.refusals || []).map(function (x) { return scalar(x && x.code); }), gate_seen: !!g.sandbox_gate, health_seen: !!g.health, mode: scalar(g.mode) };
            if (g.verdict) { diag.verdict = 'GUARD_REFUSED:' + g.verdict; return save(diag, true); }
            if (typeof g.ready === 'function') { var r0 = await step('guard_gate', function () { return g.ready(); }, 30000); diag.steps[diag.steps.length - 1].ok = r0.value === true;
                if (r0.timeout) { diag.verdict = 'GUARD_GATE_PENDING'; return save(diag, true); }
                if (r0.value !== true) { diag.verdict = 'GUARD_GATE_REFUSED:' + (window.KM_SANDBOX_GUARD_.verdict || 'UNKNOWN'); return save(diag, true); } }
        }
        var rh = await step('system.health', function () { return window.KM.DB.getSystemHealth(); }, 60000);
        diag.fetch_after_health = fetchTiming();
        var h = rh.value;
        if (!h || h.success !== true) { diag.verdict = rh.timeout ? 'HEALTH_NO_ANSWER_WITHIN_BUDGET' : 'HEALTH_ERROR:' + (code(h).code || 'UNKNOWN'); diag.health_error = rh.timeout ? null : code(h); return save(diag, true); }
        diag.sign_in_before_capabilities = pa && typeof pa.isSignedIn === 'function' ? !!pa.isSignedIn() : diag.sign_in;
        if (diag.sign_in_before_capabilities === false && pa && typeof pa.whenSignedIn === 'function') {
            var rs = await step('sign_in_wait', function () { return pa.whenSignedIn(); }, 30000);
            if (rs.timeout || rs.thrown) { diag.verdict = 'CAPS_WAITING_FOR_SIGN_IN'; diag.note = 'the capabilities read was NOT started: the app read path would wait for this same sign-in before its own timer'; return save(diag, true); } }
        var capsFn = typeof _kmGapRead_ === 'function'
            ? function () { return _kmGapRead_('getClientCapabilities', {}).then(function (r) { return typeof _kmCapVerifyServedAction_ === 'function' ? _kmCapVerifyServedAction_(r) : r; }); }
            : function () { return window.KM.DB.getClientCapabilities(); };
        var rc = await step('getClientCapabilities', capsFn, 100000);
        diag.fetch_after_capabilities = fetchTiming();
        var c = rc.value;
        if (!c || c.success !== true) { diag.verdict = rc.timeout ? (diag.sign_in_before_capabilities === false ? 'CAPS_WAITING_FOR_SIGN_IN' : 'CAPS_NO_ANSWER_WITHIN_BUDGET') : 'CAPS_ERROR:' + (code(c).code || 'UNKNOWN'); diag.capabilities_error = rc.timeout ? null : code(c); return save(diag, true); }
        var d = h.module_build_stamps ? h : (h.data || {}), mb = d.module_build_stamps || {};
        var mods = Array.isArray(mb.modules) ? mb.modules : [];
        if (sbx) {
            var gate = c.sandbox_gate || (c.data && c.data.sandbox_gate) || (c.envelope && c.envelope.sandbox_gate) || null;
            if (!gate) { diag.verdict = 'CAPS_WITHOUT_SANDBOX_GATE'; return save(diag, true); }
            return save({ kind: 'KM_SANDBOX_HEALTH_METADATA_ONLY_V1', captured_at: new Date().toISOString(), health_success: scalar(h.success), capabilities_success: scalar(c.success),
                deployment_release: scalar(d.deployment_release), build_id: scalar(d.build_id), mixed_deployment: scalar(d.mixed_deployment), stale_modules: names(mb.stale_modules), absent_modules: names(mb.absent_modules),
                modules: mods.map(function (m) { return { file: scalar(m.file), declared: scalar(m.declared_build), expected: scalar(m.expected_build), matches: scalar(m.matches_expected) }; }),
                sandbox_gate: { environment: scalar(gate.environment), allow_sha256: scalar(gate.allow_sha256), import_scope_sha256: scalar(gate.import_scope_sha256), bound_equals_constant: scalar(gate.bound_equals_constant) } }, false);
        }
        var pg = c.production_gate || (c.data && c.data.production_gate) || (c.envelope && c.envelope.production_gate) || null;
        if (!pg) { diag.verdict = 'CAPS_WITHOUT_PRODUCTION_GATE'; return save(diag, true); }
        return save({ kind: 'KM_PROD_HEALTH_SUMMARY_V2', captured_at: new Date().toISOString(), health_success: scalar(h.success), capabilities_success: scalar(c.success),
            deployment_release: scalar(d.deployment_release), build_id: scalar(d.build_id), system_health_module_build: scalar(d.system_health_module_build), mixed_deployment: scalar(mb.mixed_deployment !== undefined ? mb.mixed_deployment : d.mixed_deployment),
            stale_modules: names(mb.stale_modules), absent_modules: names(mb.absent_modules),
            modules: mods.map(function (m) { return { file: scalar(m.file), symbol: scalar(m.symbol), present: scalar(m.present), declared: scalar(m.declared_build), expected: scalar(m.expected_build), matches: scalar(m.matches_expected) }; }),
            production_gate: { environment: scalar(pg.environment), profile_id: scalar(pg.profile_id), policy_sha256: scalar(pg.policy_sha256), bound_equals_constant: scalar(pg.bound_equals_constant), module_stamps_ok: scalar(pg.module_stamps_ok), flat_v2: scalar(pg.flat_v2), administration_enabled: scalar(pg.administration_enabled), ai_plan_enabled: scalar(pg.ai_plan_enabled) } }, false);
    } catch (e) { diag.verdict = 'COLLECTOR_THREW'; return save(diag, true); }
}
window.shToggleActionsMenu = shToggleActionsMenu; window.shRunAction = shRunAction; window.shHealthExport = shHealthExport;

window._shToggleCardEl = _shToggleCardEl;
window._shCardFromEvent = _shCardFromEvent;
window.shSaveExecution = shSaveExecution;
window.shReadyToShip = shReadyToShip;
window.shShip = shShip;
window.shConfirmShipment = shConfirmShipment;
window.shCancelShipmentDraft = shCancelShipmentDraft;
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
        unmount() { try { _shDraftScroll15c_ = window.scrollY || 0; } catch (e) {} }   // R15C-B3B: the place on the page comes back with it
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

// R14-F1 (review M-1): the read-only pre-Confirm status read (the same scoped workspace read _shDispatchUnknown_ uses). Never writes.
function _shPreConfirmStatusF1_(shipmentId) {
    var api = window.KM && window.KM.api;
    return Promise.resolve().then(function () {
        if (!api || typeof api.getWorkspace !== 'function') throw new Error('READ_UNAVAILABLE');
        return api.getWorkspace('shipment', { filters: { shipmentId: shipmentId }, page: { number: 1, size: 5 } });
    }).then(function (env) {
        if (!env || env.success !== true) throw new Error('READ_FAILED');
        var model = window.KM.DB.adaptShipmentWorkspace(env.data);
        var s = ((model && model.shipments) || []).filter(function (x) { return String(x.shipmentId || x.shipment_id) === String(shipmentId); })[0];
        if (!s) throw new Error('SHIPMENT_NOT_FOUND');
        var st = String(s.status || '').trim().toLowerCase();
        if (st === 'ready_to_ship') return { ok: true, status: st };
        var disp = SH_DISPATCHED_STATUSES_R71_[st] === 1;
        return { ok: false, status: st, dispatched: disp, message: disp ? 'This shipment is already ' + st + ' on the server. Confirm stopped before any write; nothing was sent. Close this dialog and reload.' :
            'This shipment is ' + (st || 'unknown') + ' on the server, not Ready to Ship. Confirm stopped before any write; nothing was sent. Reload.' };
    }).catch(function (e) {
        return { ok: false, status: '', dispatched: false, message: 'The shipment status could not be read (' + String(e && e.message || e) + '). Confirm stopped before any write; nothing was sent. Reload and try again.' };
    });
}

function _shDocumentValuesHtml16_(res) {
    var blocks = Array.isArray(res && res.blockers) ? res.blockers : [];
    var rows = blocks.map(function (b) {
        b = b || {};
        var label = String(b.template_key || b.class_key || 'Document');
        var problems = Array.isArray(b.problems) ? b.problems : [];
        var fields = problems.length ? '<ul>' + problems.map(function (p) { return '<li>' + _shEsc(String(p)) + '</li>'; }).join('') + '</ul>' : '<div>' + _shEsc(String(b.reason || 'Required value not identified by the response.')) + '</div>';
        return '<section><strong>' + _shEsc(label) + '</strong>' + fields + '</section>';
    }).join('');
    return '<strong>Cannot dispatch: required document data is incomplete.</strong>' +
        '<details open style="margin-top:6px"><summary>Missing fields</summary><div style="max-height:220px;overflow:auto;overflow-wrap:anywhere">' +
        (rows || 'The response did not identify a field. Keep this shipment unchanged for review.') + '</div></details>' +
        '<div style="margin-top:6px">This Confirm did not dispatch the shipment or create documents. No automatic retry was sent.</div>';
}

// AGL02-SH v2 (sbx-r15c-agl): patched
// AGL02-SH: "RMB 1603.24 / CBM", never a bare unit price that reads like the freight. The unit comes from the card's charge_type (and charge_unit
// for weight, as 17_ shippingFreight_ reads it); the estimate is the server's quote for THIS shipment's raw totals, shown only when priced.
function _shRcRateText15c_(o) {
    var ct = String((o && o.charge_type) || '').trim().toLowerCase(), cu = String((o && o.charge_unit) || '').trim().toLowerCase();
    var unit = ct === 'volume' ? ' / CBM' : ct === 'weight' ? (cu === 'lb' ? ' / lb' : cu === 'kg' ? ' / kg' : ' / weight unit') : ct === 'carton' ? ' / carton' : (ct === 'shipment' || ct === 'container') ? ' / ' + ct : ' (unit not stated)';
    var q = o && o.quote; if (q && q.priced && q.split_currency) return _shEsc(o.currency) + ' ' + Number(o.unit_rate).toFixed(2) + ' / ' + _shEsc(o.charge_unit || o.charge_type) + ' - Freight ' + _shEsc(q.currency) + ' ' + Number(q.freight).toFixed(2) + ' / Duty ' + _shEsc(q.duty_currency) + ' ' + Number(q.duty).toFixed(2) + ' / No combined total';
    var est = (q && q.priced === true && q.total !== '' && q.total != null) ? ' \u00b7 est. ' + _shEsc(q.currency || o.currency) + ' ' + Number(q.total).toFixed(2) + ' for this shipment' : '';
    var unk = (q && q.priced !== true && q.cost_unknown) ? ' \u00b7 ' + _shEsc(_shRcMeasureName15c_(q.cost_unknown)) + ' unknown - cannot be priced' : '';   // v2
    return _shEsc(o && o.currency) + ' ' + _shEsc(o && o.unit_rate) + unit + est + unk;
}
function _shRcPendingHtml15c_(o, cur) {
    if (!o || (cur && cur.rate_card_id && cur.rate_card_id === o.rate_card_id)) return '';
    var q = o.quote;
    if (q && q.priced !== true && q.cost_unknown) return '<div class="sh-rc-pending sh-rc-unknown" role="status" style="font-size:11px;color:#B91C1C;margin-top:2px;">' + _shEsc(_shRcUnknownText15c_(q.cost_unknown)) + (q.tax_reason ? ' [' + _shEsc(q.tax_reason) + ']' : '') + '</div>';   // v2
    return '<div class="sh-rc-pending" style="font-size:11px;color:#B45309;margin-top:2px;">Selected - NOT applied yet. Press "Use this rate card" to apply it (shipment data is saved separately with Save).</div>';
}
// v2: the server's cost_unknown token (17_ shippingFreight_ / 12_ shipmentExactRateAndCost_: cbm | gross_weight | cartons | unit_rate | duty) in words
function _shRcMeasureName15c_(k) { k = String(k || '').trim().toLowerCase(); return k === 'cbm' ? 'CBM' : k === 'gross_weight' ? 'Gross weight' : k === 'cartons' ? 'Carton count' : k === 'unit_rate' ? 'The card\'s unit rate' : k === 'duty' ? 'The import duty' : 'A required measure'; }
function _shRcUnknownText15c_(k) {
    var n = _shRcMeasureName15c_(k), low = String(k || '').trim().toLowerCase();
    if (low === 'cbm' || low === 'gross_weight' || low === 'cartons') return n + ' of this shipment is not known, so this rate card cannot be applied and the shipment cannot go out as "freight pending quote" while a card applies. Fill the ' + n + ' in the shipment lines, press Save, then choose the card again.';
    return n + ' is not known, so this rate card cannot be priced or applied. Nothing was saved.';
}

// R15C-B3-SH v2 (targeted readback for rate card / cancel / done): patched

// ---- R15C-B3B ---------------------------------------------------------------------------------------------------------------------------
// THE HELD MODEL ON THE WAY BACK. Stamp of the last whole-area read: { env, epoch, rev, at }.
//   env   = the endpoint this page was built for (a hash of the db-api base, never the URL) - another environment's model is never shown;
//           the read is not company-scoped (one workspace for every company the endpoint serves), so env is the whole key the existing
//           read allows; a reload rebuilds everything (the model is in memory only, per tab).
//   epoch = KM.DB.sourceWriteEpoch at the START of that read (a write made in this tab on any page after it moves it).
//   rev   = the server source revision probed at the START of that read (another tab / user / import moves it).
// Back on Shipment Draft: the cards are drawn from the model at once. VALID only if env, epoch and rev all match and it is younger than
// 60 s; anything else (or a revision that cannot be read) -> one whole-area read in the background (REFRESHING: cards, expansion, filters,
// scroll and unsaved inputs kept by the existing capture / restore). Never "Loading shipments" over cards on screen.
// PER-SHIPMENT VERSION GUARD: an answer never replaces a shipment the page holds in a NEWER version (updated_at in the same
// "yyyy-MM-dd HH:mm:ss" form, compared as text; other forms are not compared and the server answer is taken).
var SH_MODEL_TTL_MS_15C_ = 60000, _shModelStamp15c_ = null, _shDraftScroll15c_ = null;
var SH_RETURN_STATS_15C_ = { returns: 0, valid: 0, stale: 0, envDrop: 0, keptNewer: 0, last: '' };
function _shEnvId15c_() { try { var d = window.KM && window.KM.DB, v = (d && typeof d.envId === 'function') ? String(d.envId() || '') : ''; return (!v || v === 'env:unknown' || v === 'env:unavailable' || /^env:0:/.test(v)) ? 'env:unknown' : v; } catch (e) { return 'env:unknown'; } }   // [R15F-F19v2] envId via db-api; UNKNOWN is never a cache key
function _shScopeId15c_() { var g = window.KM_PRODUCTION_GUARD_; return g ? g.environmentKey() : ''; }
function _shEpoch15c_() { try { var e = window.KM.DB.sourceWriteEpoch(); return String(e.planning) + '/' + String(e.exposure); } catch (x) { return ''; } }
function _shProbe15c_() { try { return Promise.resolve(window.KM.DB && typeof window.KM.DB.probeSourceRevision === 'function' ? window.KM.DB.probeSourceRevision() : null).then(function (v) { return (typeof v === 'string' && v) ? v : null; }, function () { return null; }); } catch (e) { return Promise.resolve(null); } }
function _shNewer15c_(a, b) { var re = /^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$/; a = String(a == null ? '' : a).trim(); b = String(b == null ? '' : b).trim(); return re.test(a) && re.test(b) && a > b; }
function _shVer15c_(s) { return s ? (s.updatedAt || s.updated_at || '') : ''; }
function _shKeepNewer15c_(prev, next) {
    if (!prev || !next || !prev.shipments || !next.shipments) return next;
    var byId = {}, kept = {}; prev.shipments.forEach(function (s) { byId[s.shipmentId] = s; });
    next.shipments = next.shipments.map(function (s) { var o = byId[s.shipmentId]; if (o && _shNewer15c_(_shVer15c_(o), _shVer15c_(s))) { kept[s.shipmentId] = 1; return o; } return s; });
    var ids = Object.keys(kept); if (!ids.length) return next;
    next.shipmentLines = (next.shipmentLines || []).filter(function (l) { return !kept[l.shipmentId]; }).concat((prev.shipmentLines || []).filter(function (l) { return kept[l.shipmentId]; }));
    SH_RETURN_STATS_15C_.keptNewer += ids.length; return next;
}
// BEFORE anything is drawn: a held model built for another endpoint is dropped (never shown, not even for one frame); the normal first read follows.
// The ONE place a list is emptied on purpose: rows of another environment must leave the screen (the first read of this one then shows its
// normal first-load state). Same environment never comes here.
function _shEnvGate15c_() { var st = _shModelStamp15c_; if (_shReadModel && (!st || st.env === 'env:unknown' || st.env !== _shEnvId15c_() || st.scope !== _shScopeId15c_())) { SH_RETURN_STATS_15C_.envDrop++; _shReadModel = null; _shModelStamp15c_ = null; try { Array.prototype.forEach.call(document.querySelectorAll('#shipment-draft-section .history-list, #shippinghistory-section .history-list'), function (l) { l.innerHTML = ''; }); _shRegion = null; _shRegionEl = null; } catch (e) {} } }
function _shReturn15c_() {
    if (!_shEffectiveWorkspace() || !_shReadModel) return;   // first visit: the normal read is already running
    SH_RETURN_STATS_15C_.returns++;
    var st = _shModelStamp15c_;
    if (!st || st.env !== _shEnvId15c_() || st.scope !== _shScopeId15c_()) { SH_RETURN_STATS_15C_.envDrop++; _shReadModel = null; _shModelStamp15c_ = null; _shLoadAndRender(); return; }   // never another environment's rows
    if (_shReadPending_) return;   // a read is already on its way
    var why = st.epoch !== _shEpoch15c_() ? 'WRITE_IN_THIS_TAB' : ((Date.now() - st.at > SH_MODEL_TTL_MS_15C_) ? 'AGE' : '');
    if (why) { _shBackground15c_(why); return; }
    st.revP.then(function (r0) { return _shProbe15c_().then(function (r1) {
        if (_shModelStamp15c_ !== st) return;
        if (!r0 || !r1) { _shBackground15c_('REVISION_UNKNOWN'); return; }
        if (r0 !== r1) { _shBackground15c_('SOURCE_MOVED'); return; }
        SH_RETURN_STATS_15C_.valid++; SH_RETURN_STATS_15C_.last = 'VALID';
    }); });
}
function _shBackground15c_(why) { SH_RETURN_STATS_15C_.stale++; SH_RETURN_STATS_15C_.last = why; var d = document.getElementById('shipment-draft-section'); if (d && d.classList.contains('active') && !_shReadPending_) _shLoadAndRender(); }
// v3: the card note of a shipment that STILL holds a save hold (r4 puts "Release this hold" in it) is the SAME node after a repaint. Asks
// _shSaveHoldHas17_ only; never sets, clears or releases a hold. A note of a shipment without a hold is not kept (as before).
function _shHeldNotesTake15c_(listEl) { var out = []; if (typeof _shSaveHoldHas17_ !== 'function') return out; try { Array.prototype.forEach.call(listEl.querySelectorAll('.sh-wait-note[id^="sh-note-"]'), function (n) { var sid = n.id.slice('sh-note-'.length); if (sid && _shSaveHoldHas17_(sid)) out.push({ sid: sid, node: n }); }); } catch (e) {} return out; }
function _shHeldNotesPut15c_(listEl, kept) { (kept || []).forEach(function (k) { try { if (!_shSaveHoldHas17_(k.sid) || document.getElementById('sh-note-' + k.sid)) return; var host = document.getElementById('sh-exec-' + k.sid), card = document.getElementById('sh-card-' + k.sid); if (host && listEl.contains(host)) host.parentNode.insertBefore(k.node, host); else if (card && listEl.contains(card)) card.insertBefore(k.node, card.firstChild); } catch (e) {} }); }
function _shRestoreScroll15c_() { var y = _shDraftScroll15c_; if (y == null || typeof window.scrollTo !== 'function') return; try { window.scrollTo(0, y); if (typeof requestAnimationFrame === 'function') requestAnimationFrame(function () { window.scrollTo(0, y); }); } catch (e) {} }

// R15C-B3B-SH v3 (return-to-page revalidation + per-shipment version guard + scope + held-note carry-over): patched
// R15F-SH (sbx-r15f): patched
// R15F2-SH (sbx-r15f2 step 20): patched
// R15F2 (aeaa05c0 item 2): a hold belongs to ONE environment. The record carries env (the page's _shEnvId15c_); one origin may serve Sandbox and
// Production pages, so a hold of another known environment neither blocks nor is cleared here. A record with NO environment (made before R15F2) or
// any record while this page cannot tell its own environment ('' = unknown, never a match) still BLOCKS and is never cleared here (__noEnv).
function _shHoldEnv18_() { var e = ''; try { e = String(_shEnvId15c_() || ''); } catch (x) { e = ''; } return (!e || e === 'env:unknown' || e === 'env:unavailable' || /^env:0:/.test(e)) ? '' : e; }
function _shHoldEnvOf18_(r) { return (r && typeof r === 'object' && r.env) ? String(r.env) : ''; }
function _shHoldPick18_(mem, store, sid) {
    var env = _shHoldEnv18_(), own = null, block = null, s = store || {};
    if (mem && !mem.__noEnv && _shHoldEnvOf18_(mem) === env) own = mem;   // made in this page (an unknown environment records '')
    Object.keys(s).forEach(function (k) { if (k !== sid && k.indexOf(sid + '@') !== 0) return; var r = s[k], re = _shHoldEnvOf18_(r); if (env && re === env) { own = own || r; } else if (!re || !env) { block = block || r; } });
    if (own) return own;
    var me = _shHoldEnvOf18_(mem), memBlock = (mem && (mem.__noEnv || !me || !env)) ? mem : null;   // an in-memory hold with no environment, or while this page's is unknown, still blocks
    var b0 = block || memBlock; if (!b0) return null; var b = (typeof b0 === 'object') ? Object.assign({}, b0) : { at: b0 }; b.__noEnv = true; return b;
}
function _shHoldPut18_(store, sid, rec) { var r = Object.assign({}, rec); delete r.__noEnv; var cur = store[sid]; if (cur && _shHoldEnvOf18_(cur) !== _shHoldEnvOf18_(r)) store[sid + '@' + (_shHoldEnvOf18_(cur) || 'legacy')] = cur; store[sid] = r; return store; }
function _shHoldDropOwn18_(store, sid) { var env = _shHoldEnv18_(), n = 0; if (!env) return 0; Object.keys(store).forEach(function (k) { if ((k === sid || k.indexOf(sid + '@') === 0) && _shHoldEnvOf18_(store[k]) === env) { delete store[k]; n++; } }); return n; }
// R15F2-P1-SH (sbx-r15f2 step 24): patched
// R15F2-P1-CONFIRM-SH (sbx-r15f2 step 28): patched

// R15C-EU-SH (sbx-r15c-eu): patched
// Shipping coverage mirrors 22_ csdShipmentDestinationCountryOk_, not the sales/inventory planning set.
function _shDestinationCountryOk_(warehouseCountry, shipmentCountry) {
    var wc = String(warehouseCountry || '').trim().toUpperCase(), rc = String(shipmentCountry || '').trim().toUpperCase();
    if (!wc || !rc) return false;
    if (wc === rc) return true;
    if (rc === 'EU') return 'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split(' ').indexOf(wc) !== -1;
    return _shSetMember15e_(rc, wc);
}
function _shSetMember15e_(setCode, c) {
    try {
        var cc = String(c == null ? '' : c).trim().toUpperCase(), K = window.KM && window.KM.countryIdentity;
        if (K && typeof K.planningSetMembers === 'function') { var m = K.planningSetMembers(setCode); return !!(m && m.indexOf(cc) !== -1); }
        var W = window.IRWarehouse, C = window.IRCountry; if (!W || !C || typeof W.warehouseCountryMembers !== 'function' || typeof C.aliasMembers !== 'function') return false;
        var mem = W.warehouseCountryMembers(setCode) || [], al = C.aliasMembers(setCode) || [];
        if (mem.length === al.length && mem.every(function (x) { return al.indexOf(x) !== -1; })) return false;   // an alias (UK/GB) or a plain country - not a set
        return mem.indexOf(cc) !== -1;
    } catch (e) { return false; }
}

// CODEX-TAX-SPLIT-1: local candidate, Owner fractional rates and separate currencies.
