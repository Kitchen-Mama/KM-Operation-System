// ========================================
// Purchase Order Overview (Procurement Commitment dashboard) — Procurement Layer Phase 1
// Reads purchase_orders / purchase_order_lines via KM.DB. Status-grouped PO cards with
// expand → PO lines. API-ready: all writes go through KM.DB.* and reload the DB.
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

    var PO_STATUS_LABEL = {
        draft: 'Draft PO', issued: 'Issued / Sent', confirmed: 'Confirmed',
        in_production: 'In Production', ready_to_ship: 'Ready to Ship',
        partially_shipped: 'Partially Shipped', completed: 'Completed', cancelled: 'Cancelled'
    };
    // Status-grouped sections (display order).
    var PO_SECTIONS = [
        'draft', 'issued', 'confirmed', 'in_production',
        'ready_to_ship', 'partially_shipped', 'completed', 'cancelled'
    ];

    function loadAndRender() {
        var groups = document.getElementById('po-groups');
        var note = document.getElementById('po-mode-note');
        if (!groups) return;
        if (!useDb()) {
            if (note) note.innerHTML = '<span class="procurement-page__note--demo">Demo mode — connect the Operation DB (Google Sheet) to view Purchase Orders. No live data is shown.</span>';
            groups.innerHTML = '<div class="procurement-empty">Purchase Orders are stored in the Operation DB. Enable the cloud DB to use this page.</div>';
            return;
        }
        if (note) note.innerHTML = '';
        if (!window._opDbCache && window.KM.DB.loadOperationDb) {
            window.KM.DB.loadOperationDb({ force: true }).then(renderFromDb).catch(renderFromDb);
        } else {
            renderFromDb();
        }
    }

    function renderFromDb() {
        var groupsEl = document.getElementById('po-groups');
        if (!groupsEl) return;
        var orders = window.KM.DB.getPurchaseOrders() || [];
        var lines = window.KM.DB.getPurchaseOrderLines() || [];
        var byPo = {};
        lines.forEach(function (l) { (byPo[l.purchaseOrderId] = byPo[l.purchaseOrderId] || []).push(l); });

        // Completed PO with completed_at hidden from default view (kept in DB, shown in List).
        var pool = orders.filter(function (o) {
            if (o.status === 'completed' && String(o.completedAt || '').trim()) return false;
            return true;
        });

        var html = PO_SECTIONS.map(function (st) {
            var items = pool.filter(function (o) { return o.status === st; });
            if (!items.length) return ''; // hide empty status sections to keep the dashboard compact
            var body = items.map(function (o) { return renderCard(o, byPo[o.purchaseOrderId] || []); }).join('');
            return '<div class="procurement-group">' +
                '<h3 class="procurement-group__title">' + esc(PO_STATUS_LABEL[st] || st) + ' <span class="procurement-group__count">' + items.length + '</span></h3>' +
                body + '</div>';
        }).join('');

        if (!pool.length) {
            html = '<div class="procurement-empty">No purchase orders yet. Convert an Approved Request Order (Request Order Draft page) to create one.</div>';
        }
        groupsEl.innerHTML = html;
    }

    function renderCard(o, poLines) {
        var id = o.purchaseOrderId;
        var statusLabel = PO_STATUS_LABEL[o.status] || o.status || '—';
        var headerMeta =
            '<span><strong>Status:</strong> ' + esc(statusLabel) + '</span>' +
            '<span><strong>Supplier:</strong> ' + dash(o.supplierName || o.supplierId) + '</span>' +
            '<span><strong>Company:</strong> ' + dash(o.company) + '</span>' +
            '<span><strong>Currency:</strong> ' + dash(o.currency) + '</span>' +
            '<span><strong>Total SKU:</strong> ' + num(o.totalSku) + '</span>' +
            '<span><strong>Total Qty:</strong> ' + num(o.totalQty).toLocaleString() + '</span>' +
            '<span><strong>Total Amount:</strong> ' + money(o.totalAmount, o.currency) + '</span>' +
            '<span><strong>Expected Ready:</strong> ' + dash(o.expectedReadyDate) + '</span>' +
            '<span><strong>Created:</strong> ' + dash(o.createdAt) + '</span>';

        return '' +
        '<div class="procurement-card" id="po-card-' + esc(id) + '">' +
            '<div class="procurement-card__header" onclick="poToggleCard(\'' + esc(id) + '\')">' +
                '<div class="procurement-card__title">' +
                    '<span class="procurement-badge procurement-badge--' + esc(o.status) + '">' + esc(statusLabel) + '</span>' +
                    '<strong>' + esc(o.purchaseOrderNo || id) + '</strong>' +
                '</div>' +
                '<div class="procurement-card__meta">' + headerMeta +
                    '<button class="pc-btn pc-btn--expand" onclick="event.stopPropagation();poToggleCard(\'' + esc(id) + '\')">Expand</button>' +
                '</div>' +
            '</div>' +
            '<div class="procurement-card__details" style="display:none;">' +
                '<h4 class="procurement-card__subtitle">PO Lines</h4>' +
                renderLinesTable(o, poLines) +
                '<div class="procurement-card__actions">' + renderActions(o) + '</div>' +
            '</div>' +
        '</div>';
    }

    function renderLinesTable(o, poLines) {
        var isDraft = o.status === 'draft';
        var rows = poLines.map(function (l) {
            var orderedCell = isDraft
                ? '<input type="number" min="0" step="1" class="pc-input pc-input--qty" data-po-line="' + esc(l.purchaseOrderLineId) + '" data-f="ordered_qty" value="' + num(l.orderedQty) + '">'
                : num(l.orderedQty).toLocaleString();
            var remaining = (l.remainingQty === '' || l.remainingQty == null)
                ? (num(l.orderedQty) - num(l.shippedQty)).toLocaleString()
                : num(l.remainingQty).toLocaleString();
            return '<tr>' +
                '<td>' + dash(l.sku) + '</td>' +
                '<td>' + dash(l.productName) + '</td>' +
                '<td class="pc-num">' + orderedCell + '</td>' +
                '<td class="pc-num">' + num(l.shippedQty).toLocaleString() + '</td>' +
                '<td class="pc-num">' + remaining + '</td>' +
                '<td class="pc-num">' + money(l.unitCost, l.currency || o.currency) + '</td>' +
                '<td class="pc-num">' + money(l.lineAmount, l.currency || o.currency) + '</td>' +
                '<td class="pc-num">' + num(l.cartonQty).toLocaleString() + '</td>' +
                '<td>' + dash(l.requestOrderLineId) + '</td>' +
                '<td>' + dash(l.relatedShipmentId) + '</td>' +
                '<td>' + dash(l.note) + '</td>' +
            '</tr>';
        }).join('');
        return '<div class="procurement-table-wrap"><table class="procurement-table">' +
            '<thead><tr>' +
                '<th>SKU</th><th>Product Name</th>' +
                '<th class="pc-num">Ordered</th><th class="pc-num">Shipped</th><th class="pc-num">Remaining</th>' +
                '<th class="pc-num">Unit Cost</th><th class="pc-num">Line Amount</th><th class="pc-num">Cartons</th>' +
                '<th>Related Request Order</th><th>Related Shipment</th><th>Note</th>' +
            '</tr></thead><tbody>' + rows + '</tbody></table></div>';
    }

    function btn(onclick, label, kind) {
        return '<button class="pc-btn pc-btn--' + (kind || 'default') + '" onclick="' + onclick + '">' + label + '</button>';
    }

    function renderActions(o) {
        var id = "'" + o.purchaseOrderId + "'";
        switch (o.status) {
            case 'draft':
                return btn('poSaveLines(' + id + ')', 'Save', 'ok') +
                       btn('poIssue(' + id + ')', 'Send / Issue PO', 'primary') +
                       btn('poCancel(' + id + ')', 'Cancel', 'danger');
            case 'issued':
                return btn('poConfirm(' + id + ')', 'Confirm', 'primary') +
                       btn('poUpdateReadyDate(' + id + ')', 'Update Ready Date', 'ghost') +
                       btn('poCancel(' + id + ')', 'Reject / Cancel', 'danger');
            case 'confirmed':
                return btn('poStartProduction(' + id + ')', 'Start Production', 'primary') +
                       btn('poUpdateReadyDate(' + id + ')', 'Update Ready Date', 'ghost');
            case 'in_production':
                return btn('poReadyToShip(' + id + ')', 'Ready to Ship', 'primary') +
                       btn('poUpdateReadyDate(' + id + ')', 'Update Ready Date', 'ghost');
            case 'ready_to_ship':
                return btn('poComplete(' + id + ')', 'Complete', 'primary') +
                       '<span class="procurement-card__hint">Available for Shipment Draft allocation (future link).</span>';
            case 'partially_shipped':
                return btn('poComplete(' + id + ')', 'Complete', 'primary');
            case 'completed':
                return '<span class="procurement-card__hint">Completed (read-only).</span>';
            case 'cancelled':
                return '<span class="procurement-card__hint">Cancelled.</span>';
            default:
                return '';
        }
    }

    function toggleCard(id) {
        var card = document.getElementById('po-card-' + id);
        if (!card) return;
        var details = card.querySelector('.procurement-card__details');
        var b = card.querySelector('.pc-btn--expand');
        if (details.style.display === 'none') { details.style.display = 'block'; if (b) b.textContent = 'Collapse'; }
        else { details.style.display = 'none'; if (b) b.textContent = 'Expand'; }
    }

    function transition(id, t, extra) {
        var payload = Object.assign({ purchase_order_id: id, transition: t, actor: 'operation-system' }, extra || {});
        return window.KM.DB.updatePurchaseOrderStatus(payload).then(function () { loadAndRender(); });
    }

    function collectLineEdits(id) {
        var card = document.getElementById('po-card-' + id);
        if (!card) return [];
        var out = [];
        card.querySelectorAll('input[data-po-line]').forEach(function (inp) {
            out.push({ purchase_order_line_id: inp.getAttribute('data-po-line'), ordered_qty: num(inp.value) });
        });
        return out;
    }

    function saveLines(id) {
        var lines = collectLineEdits(id);
        if (!lines.length) { alert('Nothing to save.'); return; }
        window.KM.DB.updatePurchaseOrderLine({ lines: lines }).then(function () {
            alert('PO lines saved.'); loadAndRender();
        }).catch(function (e) { alert('Save failed: ' + (e && e.message ? e.message : e)); });
    }

    function issue(id) {
        if (!confirm('Issue / send this PO to the supplier?')) return;
        // Persist any draft line edits first, then issue.
        var lines = collectLineEdits(id);
        var chain = lines.length ? window.KM.DB.updatePurchaseOrderLine({ lines: lines }) : Promise.resolve();
        chain.then(function () { return transition(id, 'issue'); })
            .catch(function (e) { alert('Issue failed: ' + (e && e.message ? e.message : e)); });
    }

    function confirmPo(id) {
        var d = prompt('Confirm this PO.\n\nConfirmed ready date (optional, YYYY-MM-DD):', '');
        if (d == null) return;
        transition(id, 'confirm', d.trim() ? { confirmed_ready_date: d.trim() } : {})
            .catch(function (e) { alert('Confirm failed: ' + (e && e.message ? e.message : e)); });
    }

    function startProduction(id) {
        transition(id, 'start_production').catch(function (e) { alert('Update failed: ' + (e && e.message ? e.message : e)); });
    }
    function readyToShip(id) {
        transition(id, 'ready_to_ship').catch(function (e) { alert('Update failed: ' + (e && e.message ? e.message : e)); });
    }
    function complete(id) {
        if (!confirm('Mark this PO as Completed?')) return;
        transition(id, 'complete').catch(function (e) { alert('Complete failed: ' + (e && e.message ? e.message : e)); });
    }
    function cancel(id) {
        if (!confirm('Cancel this PO? It will be kept in the database.')) return;
        transition(id, 'cancel').catch(function (e) { alert('Cancel failed: ' + (e && e.message ? e.message : e)); });
    }
    function updateReadyDate(id) {
        // Phase 1: expected/confirmed ready dates are written ALONGSIDE a status transition
        // (the status handler accepts optional expected_ready_date / confirmed_ready_date). A
        // standalone date-only update endpoint is future work — inform the user rather than
        // firing a guaranteed-to-fail request.
        alert('Phase 1: ready dates are set when you Confirm the PO (enter a confirmed ready date at that step).\n\nA standalone ready-date edit is planned for a later phase.');
    }

    function ensureMarkup() {
        if (document.getElementById('purchase-order-overview-section')) return Promise.resolve(true);
        if (window.KM && window.KM.partialLoader && window.KM.partialLoader.loadPartial) {
            return window.KM.partialLoader
                .loadPartial('purchase-order-overview', 'assets/html/pages/purchase-order-overview.html', '#purchase-order-overview-mount')
                .then(function () { return true; })
                .catch(function (err) { console.warn('[PurchaseOrderOverview] partial load failed:', err); return false; });
        }
        return Promise.resolve(false);
    }

    window.poToggleCard = toggleCard;
    window.poSaveLines = saveLines;
    window.poIssue = issue;
    window.poConfirm = confirmPo;
    window.poStartProduction = startProduction;
    window.poReadyToShip = readyToShip;
    window.poComplete = complete;
    window.poCancel = cancel;
    window.poUpdateReadyDate = updateReadyDate;
    window.initPurchaseOrderOverviewPage = loadAndRender;

    if (window.KM && window.KM.lifecycle) {
        KM.lifecycle.register('purchase-order-overview-section', {
            mount: function () {
                ensureMarkup().then(function () {
                    var sec = document.getElementById('purchase-order-overview-section');
                    if (sec) sec.classList.add('active');
                    loadAndRender();
                });
            },
            unmount: function () {}
        });
    }
})();
