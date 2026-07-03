// ========================================
// Purchase Order List (PO operational list / history) — Procurement Layer Phase 1
// Reads purchase_orders / purchase_order_lines via KM.DB. Filter bar + table view.
// Action → View (details modal) / Open Overview card / Edit-if-draft (jumps to Overview).
// See docs/planning/REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md.
// ========================================

(function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
    function money(v, cur) {
        if (v === '' || v == null || isNaN(parseFloat(v))) return '--';
        return (cur ? esc(cur) + ' ' : '') + Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
    }
    function dash(v) { var s = String(v == null ? '' : v).trim(); return s ? esc(s) : '--'; }
    function useDb() {
        return !!(window.KM && window.KM.DB && window.KM.DB.isCloudWriteEnabled &&
            window.KM.DB.isCloudWriteEnabled() && window.KM.DB.getPurchaseOrders);
    }

    // PO status labels (target enum per REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md §6). Legacy
    // Phase-1 values (confirmed / ready_to_ship / partially_shipped) still displayed if present.
    var PO_STATUS_LABEL = {
        draft: 'Draft', issued: 'Issued', in_production: 'In Production',
        partial_completed: 'Partial Completed', completed: 'Completed',
        partial_shipped: 'Partial Shipped', shipped: 'Shipped',
        closure: 'Closure', cancelled: 'Cancelled',
        confirmed: 'Confirmed', ready_to_ship: 'Ready to Ship', partially_shipped: 'Partially Shipped'
    };

    function val(id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }

    function loadAndRender() {
        var tbody = document.getElementById('pol-tbody');
        var note = document.getElementById('pol-mode-note');
        if (!tbody) return;
        if (!useDb()) {
            if (note) note.innerHTML = '<span class="procurement-page__note--demo">Demo mode — connect the Operation DB (Google Sheet) to query Purchase Orders. No live data is shown.</span>';
            tbody.innerHTML = '<tr><td colspan="12" class="procurement-empty">Purchase Orders are stored in the Operation DB. Enable the cloud DB to use this page.</td></tr>';
            return;
        }
        if (note) note.innerHTML = '';
        if (!window._opDbCache && window.KM.DB.loadOperationDb) {
            window.KM.DB.loadOperationDb({ force: true }).then(renderRows).catch(renderRows);
        } else {
            renderRows();
        }
    }

    // Line-level PO List (one row per purchase_order_line). Columns: SKU / Category / Series /
    // Supplier / Factory / PO No / Status / Ordered / Completed / Shipped / Remaining / Updated.
    // Category & Series joined from sku_details by sku; Factory from PO factory_id / warehouse name.
    function renderRows() {
        var tbody = document.getElementById('pol-tbody');
        if (!tbody) return;
        var orders = window.KM.DB.getPurchaseOrders() || [];
        var lines = window.KM.DB.getPurchaseOrderLines() || [];
        var poById = {};
        orders.forEach(function (o) { poById[o.purchaseOrderId] = o; });

        // sku_details → category / series; warehouses → name (Factory display fallback).
        var skuInfo = {};
        ((window.KM.DB.getSkuDetails && window.KM.DB.getSkuDetails()) || []).forEach(function (s) {
            skuInfo[String(s.sku || '').toLowerCase()] = { category: s.category || '', series: s.series || '' };
        });
        var whName = {};
        ((window.KM.DB.getWarehouses && window.KM.DB.getWarehouses()) || []).forEach(function (w) {
            if (w.warehouseId) whName[w.warehouseId] = w.warehouseName || w.warehouseId;
        });

        var fStatus = val('pol-f-status');
        var fSupplier = val('pol-f-supplier').toLowerCase();
        var fCategory = val('pol-f-category').toLowerCase();
        var fSeries = val('pol-f-series').toLowerCase();
        var fSku = val('pol-f-sku').toLowerCase();
        var fFrom = polDateState.createdFrom, fTo = polDateState.createdTo;

        var rows = [];
        lines.forEach(function (l) {
            var o = poById[l.purchaseOrderId];
            if (!o) return;
            // Header-level filters (Status / Supplier / Date range on PO created_at).
            if (fStatus && o.status !== fStatus) return;
            if (fSupplier && (String(o.supplierName || '') + ' ' + String(o.supplierId || '')).toLowerCase().indexOf(fSupplier) === -1) return;
            var created = String(o.createdAt || '').slice(0, 10);
            if (fFrom && created && created < fFrom) return;
            if (fTo && created && created > fTo) return;
            // Line-level: Category / Series (join sku_details), SKU.
            var info = skuInfo[String(l.sku || '').toLowerCase()] || { category: '', series: '' };
            var category = info.category || '';
            var series = l.series || info.series || '';
            if (fSku && String(l.sku || '').toLowerCase().indexOf(fSku) === -1) return;
            if (fCategory && String(category).toLowerCase().indexOf(fCategory) === -1) return;
            if (fSeries && String(series).toLowerCase().indexOf(fSeries) === -1) return;
            rows.push({ o: o, l: l, category: category, series: series });
        });

        // Newest first by PO created_at.
        rows.sort(function (a, b) { return String(b.o.createdAt || '').localeCompare(String(a.o.createdAt || '')); });

        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="12" class="procurement-empty">No purchase order lines match the filters.</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map(function (r) {
            var o = r.o, l = r.l;
            var factory = String(o.factoryId || '').trim() || (o.warehouseId && whName[o.warehouseId]) || o.warehouseId || '';
            var remaining = (l.remainingQty === '' || l.remainingQty == null) ? (num(l.orderedQty) - num(l.shippedQty)) : num(l.remainingQty);
            var updated = l.updatedAt || o.updatedAt || '';
            return '<tr>' +
                '<td>' + dash(l.sku) + '</td>' +
                '<td>' + dash(r.category) + '</td>' +
                '<td>' + dash(r.series) + '</td>' +
                '<td>' + dash(o.supplierName || o.supplierId) + '</td>' +
                '<td>' + dash(factory) + '</td>' +
                '<td><a href="#" class="pol-po-link" onclick="polOpenOverview(\'' + esc(o.purchaseOrderId) + '\');return false;">' + dash(o.purchaseOrderNo || o.purchaseOrderId) + '</a></td>' +
                '<td><span class="procurement-badge procurement-badge--' + esc(o.status) + '">' + esc(PO_STATUS_LABEL[o.status] || o.status) + '</span></td>' +
                '<td class="pc-num">' + num(l.orderedQty).toLocaleString() + '</td>' +
                '<td class="pc-num">' + num(l.completedQty).toLocaleString() + '</td>' +
                '<td class="pc-num">' + num(l.shippedQty).toLocaleString() + '</td>' +
                '<td class="pc-num">' + num(remaining).toLocaleString() + '</td>' +
                '<td>' + dash(updated) + '</td>' +
            '</tr>';
        }).join('');
    }

    // View → lightweight modal listing the PO lines.
    function view(id) {
        var orders = window.KM.DB.getPurchaseOrders() || [];
        var o = orders.filter(function (x) { return x.purchaseOrderId === id; })[0];
        if (!o) { alert('Purchase order not found.'); return; }
        var lines = (window.KM.DB.getPurchaseOrderLines() || []).filter(function (l) { return l.purchaseOrderId === id; });
        var rows = lines.map(function (l) {
            return '<tr>' +
                '<td>' + dash(l.sku) + '</td>' +
                '<td>' + dash(l.productName) + '</td>' +
                '<td class="pc-num">' + num(l.orderedQty).toLocaleString() + '</td>' +
                '<td class="pc-num">' + num(l.shippedQty).toLocaleString() + '</td>' +
                '<td class="pc-num">' + money(l.unitCost, l.currency || o.currency) + '</td>' +
                '<td class="pc-num">' + money(l.lineAmount, l.currency || o.currency) + '</td>' +
            '</tr>';
        }).join('');
        var existing = document.getElementById('pol-view-modal');
        if (existing) existing.remove();
        var overlay = document.createElement('div');
        overlay.id = 'pol-view-modal';
        overlay.className = 'pc-modal-overlay';
        overlay.innerHTML =
            '<div class="pc-modal">' +
                '<div class="pc-modal__head"><h3>' + esc(o.purchaseOrderNo || id) + ' — ' + esc(PO_STATUS_LABEL[o.status] || o.status) + '</h3>' +
                    '<button class="pc-modal__close" onclick="polCloseView()">×</button></div>' +
                '<div class="pc-modal__body">' +
                    '<div class="pc-modal__grid">' +
                        '<div><strong>Supplier:</strong> ' + dash(o.supplierName || o.supplierId) + '</div>' +
                        '<div><strong>Company:</strong> ' + dash(o.company) + '</div>' +
                        '<div><strong>Total Qty:</strong> ' + num(o.totalQty).toLocaleString() + '</div>' +
                        '<div><strong>Total Amount:</strong> ' + money(o.totalAmount, o.currency) + '</div>' +
                        '<div><strong>Request Order:</strong> ' + dash(o.requestOrderId) + '</div>' +
                        '<div><strong>Expected Ready:</strong> ' + dash(o.expectedReadyDate) + '</div>' +
                    '</div>' +
                    '<div class="procurement-table-wrap"><table class="procurement-table">' +
                        '<thead><tr><th>SKU</th><th>Product Name</th><th class="pc-num">Ordered</th><th class="pc-num">Shipped</th><th class="pc-num">Unit Cost</th><th class="pc-num">Line Amount</th></tr></thead>' +
                        '<tbody>' + rows + '</tbody></table></div>' +
                '</div>' +
                '<div class="pc-modal__foot"><button class="pc-btn pc-btn--default" onclick="polCloseView()">Close</button>' +
                    '<button class="pc-btn pc-btn--primary" onclick="polCloseView();polOpenOverview(\'' + esc(id) + '\')">Open in Overview</button></div>' +
            '</div>';
        document.body.appendChild(overlay);
    }

    function closeView() { var m = document.getElementById('pol-view-modal'); if (m) m.remove(); }

    function openOverview(id) {
        // Navigate to the PO Overview page (same-DB cards). Deep-link/scroll is future work.
        if (typeof showSection === 'function') showSection('purchase-order-overview');
        // Give the lifecycle mount a beat, then expand the matching card if present.
        setTimeout(function () {
            var card = document.getElementById('po-card-' + id);
            if (card && typeof window.poToggleCard === 'function') {
                var details = card.querySelector('.procurement-card__details');
                if (details && details.style.display === 'none') window.poToggleCard(id);
                card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 200);
    }

    function reset() {
        ['pol-f-status', 'pol-f-supplier', 'pol-f-category', 'pol-f-series', 'pol-f-sku'].forEach(function (id) {
            var el = document.getElementById(id); if (el) el.value = '';
        });
        // Clear the Date range → trigger back to "All".
        polDateState.dateRange = { start: null, end: null, preset: null };
        polDateState.createdFrom = '';
        polDateState.createdTo = '';
        polUpdateDateTriggerText();
        renderRows();
    }

    // ========================================
    // Date Range filter — reuses the SHARED date-range picker (#frDateModal + .fr-* CSS in
    // components.css), the same component Forecast Review / Shipment Overview use. A single "Date"
    // trigger replaces the old Created From / Created To inputs; Apply writes createdFrom/createdTo.
    // ========================================
    var polDateState = {
        dateRange: { start: null, end: null, preset: null },
        tempDateRange: { start: null, end: null, preset: null },
        calendarMonths: { start: new Date(), end: new Date() },
        createdFrom: '',
        createdTo: ''
    };

    function polFormatDate(date) {
        if (!date) return '';
        var y = date.getFullYear();
        var m = String(date.getMonth() + 1).padStart(2, '0');
        var d = String(date.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + d;
    }
    function polIsSameDay(a, b) {
        return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    }

    var POL_PRESET_LABELS = {
        'today': 'Today', 'yesterday': 'Yesterday',
        'last-7-days': 'Last 7 days', 'last-30-days': 'Last 30 days',
        'last-60-days': 'Last 60 days', 'last-90-days': 'Last 90 days',
        'last-month': 'Last month', 'last-2-months': 'Last 2 months',
        'last-3-months': 'Last 3 months', 'last-year': 'Last year'
    };

    function polUpdateDateTriggerText() {
        var span = document.getElementById('pol-date-trigger-text');
        if (!span) return;
        var r = polDateState.dateRange;
        if (r.preset && POL_PRESET_LABELS[r.preset]) { span.textContent = POL_PRESET_LABELS[r.preset]; return; }
        if (r.start && r.end) { span.textContent = polFormatDate(r.start) + ' ~ ' + polFormatDate(r.end); return; }
        span.textContent = 'All';
    }

    function polOpenDateModal() {
        var backdrop = document.getElementById('frDateBackdrop');
        var modal = document.getElementById('frDateModal');
        if (!backdrop || !modal) return;
        // Seed temp state from the current selection (or default to today's month).
        polDateState.tempDateRange = {
            start: polDateState.dateRange.start,
            end: polDateState.dateRange.end,
            preset: polDateState.dateRange.preset
        };
        polDateState.calendarMonths.start = new Date(polDateState.dateRange.start || new Date());
        polDateState.calendarMonths.end = new Date(polDateState.dateRange.end || new Date());
        backdrop.classList.add('is-open');
        modal.classList.add('is-open');
        polSetupDateModalEvents();
        polUpdateDateInputs();
        polUpdatePresetHighlight();
        polRenderCalendars();
    }

    // Bind the shared modal controls to PO-List handlers. These use `.onclick =` (not
    // addEventListener), matching how each page claims the shared modal while open.
    function polSetupDateModalEvents() {
        var backdrop = document.getElementById('frDateBackdrop');
        if (backdrop) backdrop.onclick = polCloseDateModal;
        var cancelBtn = document.getElementById('frDateCancel');
        if (cancelBtn) cancelBtn.onclick = polCloseDateModal;
        var applyBtn = document.getElementById('frDateApply');
        if (applyBtn) applyBtn.onclick = polApplyDateRange;
        document.querySelectorAll('.fr-preset-item').forEach(function (item) {
            item.onclick = function () { polHandlePresetClick(item.dataset.preset); };
        });
        document.querySelectorAll('.fr-calendar-nav').forEach(function (btn) {
            btn.onclick = function () { polHandleCalendarNav(btn.dataset.nav); };
        });
    }

    function polCloseDateModal() {
        var backdrop = document.getElementById('frDateBackdrop');
        var modal = document.getElementById('frDateModal');
        if (backdrop) backdrop.classList.remove('is-open');
        if (modal) modal.classList.remove('is-open');
    }

    function polApplyDateRange() {
        polDateState.dateRange = {
            start: polDateState.tempDateRange.start,
            end: polDateState.tempDateRange.end,
            preset: polDateState.tempDateRange.preset
        };
        polDateState.createdFrom = polDateState.dateRange.start ? polFormatDate(polDateState.dateRange.start) : '';
        polDateState.createdTo = polDateState.dateRange.end ? polFormatDate(polDateState.dateRange.end) : '';
        polUpdateDateTriggerText();
        polCloseDateModal();
        renderRows();
    }

    function polHandlePresetClick(preset) {
        var today = new Date();
        var start = new Date(), end = new Date(today);
        switch (preset) {
            case 'today': start = new Date(today); break;
            case 'yesterday': start.setDate(today.getDate() - 1); end.setDate(today.getDate() - 1); break;
            case 'last-7-days': start.setDate(today.getDate() - 7); break;
            case 'last-30-days': start.setDate(today.getDate() - 30); break;
            case 'last-60-days': start.setDate(today.getDate() - 60); break;
            case 'last-90-days': start.setDate(today.getDate() - 90); break;
            case 'last-month': start = new Date(today.getFullYear(), today.getMonth() - 1, 1); end = new Date(today.getFullYear(), today.getMonth(), 0); break;
            case 'last-2-months': start = new Date(today.getFullYear(), today.getMonth() - 2, 1); end = new Date(today.getFullYear(), today.getMonth(), 0); break;
            case 'last-3-months': start = new Date(today.getFullYear(), today.getMonth() - 3, 1); end = new Date(today.getFullYear(), today.getMonth(), 0); break;
            case 'last-year': start = new Date(today.getFullYear() - 1, 0, 1); end = new Date(today.getFullYear() - 1, 11, 31); break;
        }
        polDateState.tempDateRange = { start: start, end: end, preset: preset };
        polDateState.calendarMonths.start = new Date(start);
        polDateState.calendarMonths.end = new Date(end);
        polUpdateDateInputs();
        polUpdatePresetHighlight();
        polRenderCalendars();
    }

    function polUpdatePresetHighlight() {
        document.querySelectorAll('.fr-preset-item').forEach(function (item) {
            if (item.dataset.preset === polDateState.tempDateRange.preset) item.classList.add('is-active');
            else item.classList.remove('is-active');
        });
    }

    function polUpdateDateInputs() {
        var s = document.getElementById('frStartDisplay');
        var e = document.getElementById('frEndDisplay');
        if (s) s.value = polFormatDate(polDateState.tempDateRange.start);
        if (e) e.value = polFormatDate(polDateState.tempDateRange.end);
    }

    function polHandleCalendarNav(nav) {
        var cm = polDateState.calendarMonths;
        if (nav === 'prev-start') cm.start.setMonth(cm.start.getMonth() - 1);
        else if (nav === 'next-start') cm.start.setMonth(cm.start.getMonth() + 1);
        else if (nav === 'prev-end') cm.end.setMonth(cm.end.getMonth() - 1);
        else if (nav === 'next-end') cm.end.setMonth(cm.end.getMonth() + 1);
        polRenderCalendars();
    }

    function polRenderCalendars() { polRenderCalendar('start'); polRenderCalendar('end'); }

    function polRenderCalendar(type) {
        var month = polDateState.calendarMonths[type];
        var cap = type.charAt(0).toUpperCase() + type.slice(1);
        var titleEl = document.getElementById('frCalendar' + cap + 'Title');
        var bodyEl = document.getElementById('frCalendar' + cap + 'Body');
        if (!titleEl || !bodyEl) return;
        var monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        titleEl.textContent = monthNames[month.getMonth()] + ' ' + month.getFullYear();
        var lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);
        var startDow = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
        var html = '';
        ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach(function (d) { html += '<div class="fr-calendar-weekday">' + d + '</div>'; });
        for (var i = 0; i < startDow; i++) html += '<div class="fr-calendar-day is-disabled"></div>';
        var start = polDateState.tempDateRange.start, end = polDateState.tempDateRange.end;
        for (var day = 1; day <= lastDay.getDate(); day++) {
            var date = new Date(month.getFullYear(), month.getMonth(), day);
            var classes = ['fr-calendar-day'];
            if (start && polIsSameDay(date, start)) classes.push('is-start');
            if (end && polIsSameDay(date, end)) classes.push('is-end');
            if (start && end && date > start && date < end) classes.push('is-in-range');
            if (polIsSameDay(date, new Date())) classes.push('is-today');
            html += '<div class="' + classes.join(' ') + '" data-date="' + date.toISOString() + '" data-type="' + type + '">' + day + '</div>';
        }
        bodyEl.innerHTML = html;
        bodyEl.querySelectorAll('.fr-calendar-day:not(.is-disabled)').forEach(function (el) {
            el.addEventListener('click', function () { polHandleDayClick(new Date(el.dataset.date), el.dataset.type); });
        });
    }

    function polHandleDayClick(date, calendarType) {
        var start = polDateState.tempDateRange.start, end = polDateState.tempDateRange.end;
        if (calendarType === 'start') {
            if (end && date > end) { polDateState.tempDateRange.start = end; polDateState.tempDateRange.end = date; }
            else polDateState.tempDateRange.start = date;
        } else {
            if (start && date < start) { polDateState.tempDateRange.end = start; polDateState.tempDateRange.start = date; }
            else polDateState.tempDateRange.end = date;
        }
        polDateState.tempDateRange.preset = null; // manual pick = Custom range
        polUpdateDateInputs();
        polUpdatePresetHighlight();
        polRenderCalendars();
    }

    function ensureMarkup() {
        if (document.getElementById('purchase-order-list-section')) return Promise.resolve(true);
        if (window.KM && window.KM.partialLoader && window.KM.partialLoader.loadPartial) {
            return window.KM.partialLoader
                .loadPartial('purchase-order-list', 'assets/html/pages/purchase-order-list.html', '#purchase-order-list-mount')
                .then(function () { return true; })
                .catch(function (err) { console.warn('[PurchaseOrderList] partial load failed:', err); return false; });
        }
        return Promise.resolve(false);
    }

    window.polSearch = renderRows;
    window.polReset = reset;
    window.polView = view;
    window.polCloseView = closeView;
    window.polOpenOverview = openOverview;
    window.polOpenDateModal = polOpenDateModal;
    window.initPurchaseOrderListPage = loadAndRender;

    if (window.KM && window.KM.lifecycle) {
        KM.lifecycle.register('purchase-order-list-section', {
            mount: function () {
                ensureMarkup().then(function () {
                    var sec = document.getElementById('purchase-order-list-section');
                    if (sec) sec.classList.add('active');
                    loadAndRender();
                });
            },
            unmount: function () { closeView(); }
        });
    }
})();
