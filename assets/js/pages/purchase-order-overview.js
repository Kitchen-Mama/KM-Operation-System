// ========================================
// Purchase Order Workspace (Procurement Commitment / Execution) — Card architecture.
// Reads purchase_orders / purchase_order_lines / warehouses / sku_details via KM.DB.
// Factory tabs (All / CN侑鑫 / TW勝一) · Series / PO selectors · THREE lifecycle groups
// (Draft / In Production / Completed) · 25 cards per page · expandable 4-block card
// (SKU Summary / Production Timeline / Factory Notes / Factory Payment).
// order_status canonical (fallback legacy status). Cancelled hidden. Actions: Draft = Save /
// Send PO / Cancel · In Production = Update / Receive · Completed = read-only. Receive persists via
// KM.DB.receivePurchaseOrderLines; Save/Update via KM.DB.updatePurchaseOrderHeader. No faked success.
// See docs/planning/PURCHASE_ORDER_SPEC.md §3–§4B / REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md §7.2.
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
    // Normalize any date value to 'YYYY-MM-DD' (handles ISO prefixes AND JS Date strings like
    // "Sun Jul 26 2026 00:00:00 GMT+0800"). Returns null when unparseable.
    function toYMD(v) {
        var s = String(v == null ? '' : v).trim();
        if (!s) return null;
        var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return m[1] + '-' + m[2] + '-' + m[3];
        var d = new Date(s);
        if (!isNaN(d.getTime())) {
            var mm = String(d.getMonth() + 1).padStart(2, '0');
            var dd = String(d.getDate()).padStart(2, '0');
            return d.getFullYear() + '-' + mm + '-' + dd;
        }
        return null;
    }
    function dateOnly(v) { var y = toYMD(v); return y ? y : (String(v == null ? '' : v).trim() ? esc(String(v).trim()) : '--'); }
    function dateVal(v) { return toYMD(v) || ''; }
    function numVal(v) { return (v === '' || v == null || isNaN(parseFloat(v))) ? '' : parseFloat(v); }

    function useDb() {
        return !!(window.KM && window.KM.DB && window.KM.DB.isCloudWriteEnabled &&
            window.KM.DB.isCloudWriteEnabled() && window.KM.DB.getPurchaseOrders);
    }

    // Canonical order_status (falls back to legacy status for old rows).
    function poStatus(o) { return String(o.orderStatus || o.status || '').trim().toLowerCase(); }

    // ---- F1-7C · scoped Purchase Order workspace read cutover (mirrors the F1-7B Weekly pattern) ----
    function _poEffectiveWorkspace() {
        return !!(window.KM && window.KM.api && typeof window.KM.api.workspaceApiActive === 'function' &&
            window.KM.api.workspaceApiActive('purchaseOrder'));
    }
    var _poReadModel = null;   // workspace-sourced {orders, lines, skuDetails, warehouses}, or null = Legacy (broad cache)
    var _poReadSeq = 0;
    var _poRegion = null;
    function _poRegion_() {
        if (_poRegion) return _poRegion;
        if (typeof document === 'undefined' || !(window.KM && window.KM.loadState)) return null;
        var el = document.getElementById('po-groups'); if (!el) return null;
        _poRegion = window.KM.loadState.bindElement(el, 'Loading purchase orders…');
        return _poRegion;
    }
    // Scoped read: Workspace (canonical) → getWorkspace('purchaseOrder') → adapt; Legacy → broad cache. Fail-closed.
    // This is also the scoped POST-WRITE refresh (loadAndRender re-enters here) — never a broad reload FROM Workspace mode.
    function _poRefresh_() {
        var mySeq = ++_poReadSeq;
        var rg = _poRegion_();
        if (_poEffectiveWorkspace()) {
            var el = document.getElementById('po-groups');
            var hasContent = !!(el && el.firstElementChild && !el.querySelector('.procurement-empty') && !el.querySelector('.km-region-loading'));
            if (rg) rg.beginLoad(hasContent);
            if (!(window.KM.api && typeof window.KM.api.getWorkspace === 'function')) { _poRenderError_({ code: 'WORKSPACE_UNAVAILABLE', message: 'Purchase Order Workspace API unavailable.' }); return; }
            Promise.resolve(window.KM.api.getWorkspace('purchaseOrder', { page: { number: 1, size: 2000 } })).then(function (env) {
                if (mySeq !== _poReadSeq) return;
                if (env && env.success) {
                    _poReadModel = window.KM.DB.adaptPurchaseOrderWorkspace(env.data);
                    if (rg) rg.set(_poReadModel.orders.length ? window.KM.loadState.STATES.READY : window.KM.loadState.STATES.EMPTY);
                    renderFromDb();
                } else {
                    _poRenderError_((env && env.errors && env.errors[0]) || { code: 'WORKSPACE_ERROR', message: 'Purchase Order workspace request failed.' });
                }
            }).catch(function (e) { if (mySeq !== _poReadSeq) return; _poRenderError_({ code: 'PO_READ_FAILED', message: String(e && e.message || e) }); });
            return;
        }
        // Legacy broad-DB path (unchanged behavior) — the broad load lives ONLY here.
        _poReadModel = null;
        if (!window._opDbCache && window.KM.DB.loadOperationDb) {
            window.KM.DB.loadOperationDb({ force: true }).then(renderFromDb).catch(renderFromDb);
        } else {
            renderFromDb();
        }
    }
    function _poRenderError_(err) {
        _poReadModel = null;
        var rg = _poRegion_(); if (rg) rg.set(window.KM.loadState.STATES.ERROR);
        var groups = document.getElementById('po-groups');
        if (groups) groups.innerHTML = '<div class="procurement-empty" style="color:#B91C1C;">Purchase Order read error: ' + esc((err && err.message) || 'failed') + ' [' + esc((err && err.code) || 'READ_FAILED') + ']</div>';
        hideToolbar();
    }

    var PO_STATUS_LABEL = {
        draft: 'Draft', issued: 'Issued / Sent', supplier_confirmed: 'Supplier Confirmed',
        confirmed: 'Supplier Confirmed', in_production: 'In Production', partial_completed: 'Partial Completed',
        completed: 'Completed', partial_shipped: 'Partial Shipped', shipped: 'Shipped',
        ready_to_ship: 'Ready to Ship', closure: 'Closure', cancelled: 'Cancelled'
    };

    // Three lifecycle groups (PURCHASE_ORDER_SPEC.md §3.2). Cancelled + unknown → hidden.
    // shipped / partial_shipped / ready_to_ship (post-production) fold into Completed so they stay visible.
    var GROUP_OF = {
        draft: 'draft',
        issued: 'in_production', supplier_confirmed: 'in_production', confirmed: 'in_production',
        in_production: 'in_production', partial_completed: 'in_production',
        completed: 'completed', closure: 'completed',
        ready_to_ship: 'completed', partial_shipped: 'completed', shipped: 'completed'
    };
    function groupOf(status) { return GROUP_OF[status] || null; }

    // Ordering for the combined (pre-pagination) list: active first, then completed.
    var STATUS_ORDER = ['draft', 'issued', 'supplier_confirmed', 'confirmed', 'in_production', 'partial_completed',
        'ready_to_ship', 'partial_shipped', 'shipped', 'completed', 'closure'];

    var PAGE_SIZE = 25;

    var FACTORY_TABS = [
        { key: 'all', label: 'All' },
        { key: 'cn_youxin', label: 'CN侑鑫', strong: ['YOUXIN', '侑鑫'], weak: ['CN'] },
        { key: 'tw_shengyi', label: 'TW勝一', strong: ['SHENGYI', '勝一'], weak: ['TW'] }
    ];

    var state = { factory: 'all', series: 'all', po: 'all', page: 1 };

    // ---- lookups (built per render) ----
    function whNameMap() {
        var m = {};
        (_poReadModel ? _poReadModel.warehouses : ((window.KM.DB.getWarehouses && window.KM.DB.getWarehouses()) || [])).forEach(function (w) {
            if (w.warehouseId) m[String(w.warehouseId).trim().toUpperCase()] = w.warehouseName || '';
        });
        return m;
    }
    function skuSeriesMap() {
        var m = {};
        (_poReadModel ? _poReadModel.skuDetails : ((window.KM.DB.getSkuDetails && window.KM.DB.getSkuDetails()) || [])).forEach(function (s) {
            if (s.sku && s.series) m[String(s.sku).trim().toUpperCase()] = s.series;
        });
        return m;
    }
    function factoryLabel(o, whMap) {
        var fid = String(o.factoryId || '').trim();
        var wid = String(o.warehouseId || '').trim();
        return (fid && whMap[fid.toUpperCase()]) || (wid && whMap[wid.toUpperCase()]) || fid || wid || '--';
    }
    function factoryTabKey(o, whMap) {
        var hay = (String(o.factoryId || '') + ' ' + String(o.warehouseId || '') + ' ' + factoryLabel(o, whMap)).toUpperCase();
        for (var i = 1; i < FACTORY_TABS.length; i++) {
            var t = FACTORY_TABS[i];
            if ((t.strong || []).some(function (tok) { return hay.indexOf(tok.toUpperCase()) !== -1; })) return t.key;
        }
        for (var j = 1; j < FACTORY_TABS.length; j++) {
            var t2 = FACTORY_TABS[j];
            if ((t2.weak || []).some(function (tok) { return hay.indexOf(tok.toUpperCase()) !== -1; })) return t2.key;
        }
        return 'other';
    }
    function distinctSeries(lines, ssMap) {
        var seen = {}, out = [];
        (lines || []).forEach(function (l) {
            var s = String(l.series || '').trim() || (l.sku ? (ssMap[String(l.sku).trim().toUpperCase()] || '') : '');
            s = String(s || '').trim();
            if (s && !seen[s]) { seen[s] = 1; out.push(s); }
        });
        return out;
    }

    // Aggregate PO lines by SKU (§4 Block 1): SUM km/resus/restw/ordered/completed/carton.
    function aggregateBySku(lines) {
        var map = {}, order = [];
        (lines || []).forEach(function (l) {
            var sku = String(l.sku || '').trim();
            var key = sku.toLowerCase() || '(blank)';
            if (!map[key]) { map[key] = { sku: sku, km: 0, resus: 0, restw: 0, ordered: 0, completed: 0, carton: 0 }; order.push(key); }
            var a = map[key];
            a.km += num(l.kmQty); a.resus += num(l.resusQty); a.restw += num(l.restwQty);
            a.ordered += num(l.orderedQty); a.completed += num(l.completedQty); a.carton += num(l.cartonQty);
        });
        return order.map(function (k) { return map[k]; });
    }

    // Build one view-model per PO.
    function buildModels() {
        // F1-7C: source from the scoped Purchase Order workspace read-model when canonical; else the Legacy broad cache.
        var orders = _poReadModel ? _poReadModel.orders : ((window.KM.DB.getPurchaseOrders && window.KM.DB.getPurchaseOrders()) || []);
        var lines = _poReadModel ? _poReadModel.lines : ((window.KM.DB.getPurchaseOrderLines && window.KM.DB.getPurchaseOrderLines()) || []);
        var whMap = whNameMap(), ssMap = skuSeriesMap();
        var byPo = {};
        lines.forEach(function (l) { (byPo[l.purchaseOrderId] = byPo[l.purchaseOrderId] || []).push(l); });

        return orders.map(function (o) {
            var poLines = byPo[o.purchaseOrderId] || [];
            var aggSku = aggregateBySku(poLines);
            var totalQty = 0, totalCarton = 0;
            aggSku.forEach(function (a) { totalQty += a.ordered; totalCarton += a.carton; });
            var series = distinctSeries(poLines, ssMap);
            var status = poStatus(o);
            return {
                o: o, lines: poLines, aggSku: aggSku,
                id: o.purchaseOrderId,
                poNo: o.poNo || o.purchaseOrderNo || o.purchaseOrderId,
                status: status,
                group: groupOf(status),
                orderDate: o.orderDate || o.createdAt || '',
                seriesList: series,
                supplierExpectedReady: o.supplierExpectedReadyDate || o.expectedReadyDate || '',
                factoryTab: factoryTabKey(o, whMap),
                factoryName: factoryLabel(o, whMap),
                totalSku: aggSku.length,   // COUNT(DISTINCT sku)
                totalQty: totalQty,
                totalCarton: totalCarton
            };
        }).filter(function (m) { return m.group; });   // hide cancelled / unknown
    }

    function applyFilters(models) {
        return models.filter(function (m) {
            if (state.factory !== 'all' && m.factoryTab !== state.factory) return false;
            if (state.series !== 'all' && m.seriesList.indexOf(state.series) === -1) return false;
            if (state.po !== 'all' && m.poNo !== state.po) return false;
            return true;
        }).sort(function (a, b) {
            var ai = STATUS_ORDER.indexOf(a.status); if (ai === -1) ai = 99;
            var bi = STATUS_ORDER.indexOf(b.status); if (bi === -1) bi = 99;
            if (ai !== bi) return ai - bi;
            return String(a.poNo).localeCompare(String(b.poNo));
        });
    }

    // ---- render ----
    function loadAndRender() {
        var groups = document.getElementById('po-groups');
        var note = document.getElementById('po-mode-note');
        if (!groups) return;
        if (!useDb()) {
            if (note) note.innerHTML = '<span class="procurement-page__note--demo">Demo mode — connect the Operation DB (Google Sheet) to view Purchase Orders. No live data is shown.</span>';
            groups.innerHTML = '<div class="procurement-empty">Purchase Orders are stored in the Operation DB. Enable the cloud DB to use this page.</div>';
            hideToolbar();
            return;
        }
        if (note) note.innerHTML = '';
        _poRefresh_();   // Workspace (canonical) or Legacy — the broad-DB load lives only in the Legacy branch.
    }

    function hideToolbar() {
        var tb = document.getElementById('po-toolbar'); if (tb) tb.style.display = 'none';
        var pg = document.getElementById('po-pagination'); if (pg) pg.style.display = 'none';
    }

    function renderFromDb() {
        var groupsEl = document.getElementById('po-groups');
        if (!groupsEl) return;
        var models = buildModels();

        if (!models.length) {
            hideToolbar();
            groupsEl.innerHTML = '<div class="procurement-empty">No purchase orders yet. Convert an Approved Request Order (Request Order Draft page) to create one.</div>';
            return;
        }

        renderToolbar(models);
        var filtered = applyFilters(models);

        if (!filtered.length) {
            groupsEl.innerHTML = '<div class="procurement-empty">No purchase orders match the current factory / series / PO filters.</div>';
            renderPagination(0, 1);
            return;
        }

        // Pagination across the full filtered list (25 cards/page).
        var totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
        if (state.page > totalPages) state.page = totalPages;
        var start = (state.page - 1) * PAGE_SIZE;
        var pageItems = filtered.slice(start, start + PAGE_SIZE);

        function section(title, groupKey) {
            var items = pageItems.filter(function (m) { return m.group === groupKey; });
            var body = items.length
                ? items.map(function (m) { return renderCard(m, groupKey); }).join('')
                : '<p class="procurement-group__empty">No ' + esc(title) + ' purchase orders.</p>';
            return '<div class="procurement-group">' +
                '<h3 class="procurement-group__title">' + esc(title) + ' <span class="procurement-group__count">' + items.length + '</span></h3>' +
                body + '</div>';
        }

        groupsEl.innerHTML = section('Draft', 'draft') +
            section('In Production', 'in_production') +
            section('Completed', 'completed');
        renderPagination(filtered.length, totalPages);
    }

    function renderToolbar(models) {
        var tb = document.getElementById('po-toolbar');
        if (tb) tb.style.display = '';
        var tabsEl = document.getElementById('po-tabs');
        if (tabsEl) {
            tabsEl.innerHTML = FACTORY_TABS.map(function (t) {
                return '<button class="po-tab' + (state.factory === t.key ? ' is-active' : '') + '" ' +
                    'onclick="poSetFactory(\'' + t.key + '\')">' + esc(t.label) + '</button>';
            }).join('');
        }
        var sSel = document.getElementById('po-series-select');
        if (sSel) {
            var seen = {}, series = [];
            models.forEach(function (m) { m.seriesList.forEach(function (s) { if (!seen[s]) { seen[s] = 1; series.push(s); } }); });
            series.sort();
            sSel.innerHTML = '<option value="all">All Series</option>' +
                series.map(function (s) { return '<option value="' + esc(s) + '"' + (state.series === s ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('');
        }
        var pSel = document.getElementById('po-po-select');
        if (pSel) {
            var pos = models.map(function (m) { return m.poNo; }).sort();
            pSel.innerHTML = '<option value="all">All POs</option>' +
                pos.map(function (p) { return '<option value="' + esc(p) + '"' + (state.po === p ? ' selected' : '') + '>' + esc(p) + '</option>'; }).join('');
        }
    }

    function renderPagination(total, totalPages) {
        var pg = document.getElementById('po-pagination');
        if (!pg) return;
        if (total <= PAGE_SIZE) { pg.style.display = 'none'; pg.innerHTML = ''; return; }
        pg.style.display = '';
        var from = (state.page - 1) * PAGE_SIZE + 1;
        var to = Math.min(state.page * PAGE_SIZE, total);
        pg.innerHTML =
            '<button class="pc-btn pc-btn--ghost" ' + (state.page <= 1 ? 'disabled' : '') + ' onclick="poGoPage(' + (state.page - 1) + ')">‹ Previous</button>' +
            '<span class="po-page-info">Page ' + state.page + ' of ' + totalPages + ' · showing ' + from + '–' + to + ' of ' + total + '</span>' +
            '<button class="pc-btn pc-btn--ghost" ' + (state.page >= totalPages ? 'disabled' : '') + ' onclick="poGoPage(' + (state.page + 1) + ')">Next ›</button>';
    }

    function renderCard(m, groupKey) {
        var id = m.id;

        // Header (§3.3, no Parent PO): PO No · Order Date · [Series + Total Qty] · Expected Completion.
        // Total Qty = SUM(ordered_qty) (same as footer Total Qty) — visible without expanding.
        var seriesTxt = m.seriesList.length ? esc(m.seriesList.join(', ')) : '--';
        var seriesQtyItem =
            '<div class="sp-summary-item">' +
                '<span class="sp-summary-label">Series</span><span class="sp-summary-value">' + seriesTxt + '</span>' +
                '<span class="sp-summary-label sp-summary-label--stacked">Total Qty</span>' +
                '<span class="sp-summary-value">' + m.totalQty.toLocaleString() + '</span>' +
            '</div>';
        var summary =
            summaryItem('PO No', '<span class="po-no">' + esc(m.poNo) + '</span>') +
            summaryItem('Order Date', dateOnly(m.orderDate)) +
            seriesQtyItem +
            summaryItem('Expected Completion', dateOnly(m.o.expectedCompletionDate));

        var actions =
            '<button class="sp-btn sp-btn-expand" onclick="poToggleCard(\'' + esc(id) + '\')">Expand</button>' +
            renderActions(m, groupKey);

        return '' +
        '<div class="sp-card po-card" id="po-card-' + esc(id) + '" data-status="' + esc(m.status) + '">' +
            '<div class="sp-card-header">' +
                '<div class="sp-card-summary">' + summary + '</div>' +
                '<div class="sp-card-actions">' + actions + '</div>' +
            '</div>' +
            '<div class="sp-card-details">' +
                '<div class="po-blocks-grid">' +
                    renderSkuSummaryBlock(m) +
                    renderTimelineBlock(m) +
                    renderNotesBlock(m) +
                    renderPaymentBlock(m) +
                '</div>' +
            '</div>' +
        '</div>';
    }

    function summaryItem(label, valueHtml) {
        return '<div class="sp-summary-item"><span class="sp-summary-label">' + label + '</span>' +
            '<span class="sp-summary-value">' + valueHtml + '</span></div>';
    }

    // Actions by lifecycle group (§3.3).
    function renderActions(m, groupKey) {
        var id = "'" + m.id + "'";
        if (groupKey === 'completed') return '';   // read-only
        if (groupKey === 'in_production') {
            return '<button class="sp-btn sp-btn-submit" onclick="poUpdate(' + id + ')">Update</button>' +
                   '<button class="sp-btn sp-btn-submit" onclick="poReceive(' + id + ')">Receive</button>';
        }
        // Draft
        return '<button class="sp-btn sp-btn-submit" onclick="poSave(' + id + ')">Save</button>' +
               '<button class="sp-btn sp-btn-submit" onclick="poSendPo(' + id + ', this)">Send PO</button>' +
               '<button class="sp-btn sp-btn-cancel" onclick="poCancel(' + id + ', this)">Cancel</button>';
    }

    // Block 1 — SKU Summary (aggregated by SKU; Ordered READ-ONLY). Columns:
    // SKU · KM · ResUS · ResTW · Ordered · Completed · Carton. Footer: Total SKU / Total Qty / Total Carton.
    function renderSkuSummaryBlock(m) {
        var rows = m.aggSku.map(function (a) {
            return '<tr>' +
                '<td>' + dash(a.sku) + '</td>' +
                '<td class="pc-num">' + a.km.toLocaleString() + '</td>' +
                '<td class="pc-num">' + a.resus.toLocaleString() + '</td>' +
                '<td class="pc-num">' + a.restw.toLocaleString() + '</td>' +
                '<td class="pc-num">' + a.ordered.toLocaleString() + '</td>' +
                '<td class="pc-num">' + a.completed.toLocaleString() + '</td>' +
                '<td class="pc-num">' + a.carton.toLocaleString() + '</td>' +
            '</tr>';
        }).join('');
        var body = m.aggSku.length ? rows : '<tr><td colspan="7" class="ro-total-hint">No PO lines.</td></tr>';
        return '<div class="sp-section po-block">' +
            '<h4 class="sp-section-title">SKU Summary</h4>' +
            '<div class="procurement-table-wrap"><table class="sp-sku-table procurement-table">' +
                '<thead><tr><th>SKU</th><th class="pc-num">KM</th><th class="pc-num">ResUS</th>' +
                '<th class="pc-num">ResTW</th><th class="pc-num">Ordered</th><th class="pc-num">Completed</th>' +
                '<th class="pc-num">Carton</th></tr></thead>' +
                '<tbody>' + body + '</tbody>' +
                '<tfoot><tr class="sp-sku-footer" style="font-weight:600;border-top:2px solid #CBD5E1;">' +
                    '<td>Total SKU: ' + m.totalSku + '</td>' +
                    '<td colspan="3">--</td>' +
                    '<td class="pc-num">Qty: ' + m.totalQty.toLocaleString() + '</td>' +
                    '<td>--</td>' +
                    '<td class="pc-num">Ctn: ' + m.totalCarton.toLocaleString() + '</td>' +
                '</tr></tfoot>' +
            '</table></div>' +
            '<div class="ro-total-hint">Ordered qty is read-only (fixed at PO creation).</div>' +
        '</div>';
    }

    // Block 2 — Production Timeline (DISPLAY ONLY; edit via Update).
    function renderTimelineBlock(m) {
        var o = m.o;
        function row(label, val) {
            return '<div class="po-field-row"><span class="po-field-label">' + label + '</span>' +
                '<span class="po-field-value">' + dateOnly(val) + '</span></div>';
        }
        function future(label) {
            return '<div class="po-field-row po-field-row--future"><span class="po-field-label">' + label + '</span>' +
                '<span class="po-field-value">-- <em>(future)</em></span></div>';
        }
        return '<div class="sp-section po-block">' +
            '<h4 class="sp-section-title">Production Timeline</h4>' +
            row('Inspection Date', o.inspectionDate) +
            row('Expected Completion', o.expectedCompletionDate) +
            row('Expected Ship Date', o.expectedShipDate) +
            row('Supplier Expected Ready', o.supplierExpectedReadyDate || o.expectedReadyDate) +   // display-only; '--' when blank
            future('Outer Carton Lot') +
            future('Nameplate Version') +
        '</div>';
    }

    // Block 3 — Factory Notes (placeholder / display).
    function renderNotesBlock(m) {
        var note = String(m.o.note || '').trim();
        return '<div class="sp-section po-block">' +
            '<h4 class="sp-section-title">Factory Notes</h4>' +
            (note ? '<div class="po-note-display">' + esc(note) + '</div>'
                  : '<div class="po-field-value po-note-placeholder">-- <em>(no notes)</em></div>') +
        '</div>';
    }

    // Block 4 — Factory Payment (DISPLAY ONLY): Supplier · Deposit · Balance · Total · Payment Status.
    function renderPaymentBlock(m) {
        var o = m.o;
        var total = (o.subtotalAmount === '' || o.subtotalAmount == null) ? o.totalAmount : o.subtotalAmount;
        function row(label, val) {
            return '<div class="po-field-row"><span class="po-field-label">' + label + '</span>' +
                '<span class="po-field-value">' + val + '</span></div>';
        }
        return '<div class="sp-section po-block">' +
            '<h4 class="sp-section-title">Factory Payment</h4>' +
            row('Supplier', dash(o.supplierName || o.supplierId)) +
            row('Deposit', money(o.depositAmount, o.currency)) +
            row('Balance', money(o.balanceAmount, o.currency)) +
            row('Total', money(total, o.currency)) +
            row('Payment Status', dash(o.paymentStatus)) +
            row('Deposit Due Date', dateOnly(o.depositDueDate)) +   // = order_date + 5 business days (Send PO)
        '</div>';
    }

    // ---- card toggle ----
    function toggleCard(id) {
        var card = document.getElementById('po-card-' + id);
        if (!card) return;
        var b = card.querySelector('.sp-btn-expand');
        card.classList.toggle('is-expanded');
        if (b) b.textContent = card.classList.contains('is-expanded') ? 'Collapse' : 'Expand';
    }

    // ---- model lookup helper ----
    function modelById(id) {
        var models = buildModels();
        for (var i = 0; i < models.length; i++) if (models[i].id === id) return models[i];
        return null;
    }

    // ========================================
    // Receive modal (§4A) — one PO. Columns: SKU · Ordered · Completed · Unreceived · Receive Qty.
    // Unreceived Qty = ordered_qty − completed_qty (production progress; NOT remaining_qty).
    // Receive Qty default = Unreceived; validated 0 ≤ x ≤ Unreceived; confirm → receivePurchaseOrderLines.
    // ========================================
    function receive(id) {
        var m = modelById(id);
        if (!m) { alert('Purchase order not found.'); return; }
        closeModal();
        var rows = m.lines.map(function (l, i) {
            var ordered = num(l.orderedQty);
            var completed = num(l.completedQty);
            var unreceived = ordered - completed;   // NOT remaining_qty
            var done = unreceived <= 0;
            var input = done
                ? '<span class="po-rcv-done">0</span>'
                : '<input type="number" class="pc-input po-rcv-input" data-line="' + esc(l.purchaseOrderLineId) +
                    '" data-unreceived="' + unreceived + '" min="0" step="1" value="' + unreceived + '" style="width:90px;text-align:right;">';
            return '<tr>' +
                '<td>' + dash(l.sku) + '</td>' +
                '<td class="pc-num">' + ordered.toLocaleString() + '</td>' +
                '<td class="pc-num po-rcv-completed">' + completed.toLocaleString() + '</td>' +
                '<td class="pc-num">' + unreceived.toLocaleString() + '</td>' +
                '<td class="pc-num">' + input + '</td>' +
            '</tr>';
        }).join('');
        var body =
            '<p class="po-modal-sub">Receiving records production-completed quantity on this PO only. ' +
                'Enter a Receive Qty (≤ Unreceived) per line; already-completed quantity cannot be received again.</p>' +
            '<div class="procurement-table-wrap"><table class="procurement-table po-rcv-table">' +
                '<thead><tr><th>SKU</th><th class="pc-num">Ordered Qty</th><th class="pc-num">Completed Qty</th>' +
                '<th class="pc-num">Unreceived Qty</th><th class="pc-num">Receive Qty</th></tr></thead>' +
                '<tbody>' + (m.lines.length ? rows : '<tr><td colspan="5">No PO lines.</td></tr>') + '</tbody>' +
            '</table></div>';
        openModal('Receive — ' + esc(m.poNo), body,
            '<button class="pc-btn pc-btn--default" onclick="poCloseModal()">Cancel</button>' +
            '<button class="pc-btn pc-btn--primary" onclick="poConfirmReceive(\'' + esc(id) + '\')">Confirm Receive</button>');
    }

    // F1-7M-D3 · per-command in-flight guard + button feedback. PO Overview write commands had NO double-click guard:
    // a rapid second click fired a DUPLICATE write. This suppresses the SECOND identical client write (keyed by
    // po-id + action) and gives an immediate "Processing…" affordance on the pressed button — purely client-side; the
    // backend idempotency is UNCHANGED. The key clears on success (after the canonical loadAndRender readback) AND on
    // failure (button restored). It never disables the whole page — only the one pressed control; unrelated cards stay live.
    var _poInFlightCmds = {};
    function _poBeginCmd(key, btn) {
        if (_poInFlightCmds[key]) return false;   // second click before completion → no second write
        _poInFlightCmds[key] = true;
        if (btn) { btn.dataset.poLabel = btn.textContent; btn.disabled = true; btn.setAttribute('aria-busy', 'true'); btn.textContent = 'Processing…'; }
        return true;
    }
    function _poEndCmd(key, btn) {
        delete _poInFlightCmds[key];
        if (btn && btn.isConnected) { btn.disabled = false; btn.removeAttribute('aria-busy'); if (btn.dataset.poLabel != null) { btn.textContent = btn.dataset.poLabel; delete btn.dataset.poLabel; } }
    }

    function confirmReceive(id) {
        var overlay = document.getElementById('po-modal');
        if (!overlay) return;
        var lines = [], invalid = null;
        overlay.querySelectorAll('.po-rcv-input').forEach(function (inp) {
            if (invalid) return;
            var unreceived = num(inp.getAttribute('data-unreceived'));
            var v = inp.value === '' ? 0 : parseFloat(inp.value);
            if (isNaN(v) || v < 0) { invalid = 'Receive Qty must be 0 or a positive number.'; return; }
            if (v > unreceived) { invalid = 'Receive Qty cannot exceed Unreceived Qty (' + unreceived.toLocaleString() + ').'; return; }
            if (v > 0) lines.push({ purchase_order_line_id: inp.getAttribute('data-line'), receive_qty: v });
        });
        if (invalid) { alert(invalid); return; }
        if (!lines.length) { alert('Enter a Receive Qty greater than 0 on at least one line.'); return; }
        var btn = overlay.querySelector('.pc-btn--primary'), key = id + ':receive';
        if (!_poBeginCmd(key, btn)) return;   // in-flight → suppress the duplicate write
        window.KM.DB.receivePurchaseOrderLines({ purchase_order_id: id, lines: lines, actor: 'operation-system' })
            .then(function () { _poEndCmd(key, btn); closeModal(); loadAndRender(); })
            .catch(function (e) { _poEndCmd(key, btn); alert('Receive failed: ' + (e && e.message ? e.message : e)); });
    }

    // ========================================
    // Edit modal (Save on Draft / Update on In Production) — the ONLY editing path (§3.4).
    // Edits Production Timeline dates + Payment + Note; persists via updatePurchaseOrderHeader.
    // ========================================
    var PAYMENT_STATUS_OPTS = ['unpaid', 'partial', 'paid'];
    function edit(id) {
        var m = modelById(id);
        if (!m) { alert('Purchase order not found.'); return; }
        var o = m.o;
        closeModal();
        function dateRow(field, label, val) {
            return '<div class="po-field-row"><span class="po-field-label">' + label + '</span>' +
                '<input type="date" class="pc-input po-edit" data-f="' + field + '" value="' + esc(dateVal(val)) + '"></div>';
        }
        function numRow(field, label, val) {
            var v = numVal(val);
            return '<div class="po-field-row"><span class="po-field-label">' + label + '</span>' +
                '<input type="number" step="0.01" min="0" class="pc-input po-edit" data-f="' + field + '" value="' + (v === '' ? '' : v) + '"></div>';
        }
        var cur = String(o.paymentStatus || '').trim().toLowerCase();
        var opts = PAYMENT_STATUS_OPTS.slice();
        if (cur && opts.indexOf(cur) === -1) opts.unshift(cur);
        var statusRow = '<div class="po-field-row"><span class="po-field-label">Payment Status</span>' +
            '<select class="pc-input po-edit" data-f="payment_status">' +
                '<option value=""' + (cur ? '' : ' selected') + '>--</option>' +
                opts.map(function (s) { return '<option value="' + esc(s) + '"' + (cur === s ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') +
            '</select></div>';
        var body =
            '<h5 class="po-edit-group">Production Timeline</h5>' +
            dateRow('inspection_date', 'Inspection Date', o.inspectionDate) +
            dateRow('expected_completion_date', 'Expected Completion', o.expectedCompletionDate) +
            dateRow('expected_ship_date', 'Expected Ship Date', o.expectedShipDate) +
            '<h5 class="po-edit-group">Factory Payment</h5>' +
            numRow('deposit_amount', 'Deposit', o.depositAmount) +
            numRow('balance_amount', 'Balance', o.balanceAmount) +
            numRow('paid_amount', 'Paid', o.paidAmount) +
            dateRow('deposit_due_date', 'Deposit Due Date', o.depositDueDate) +   // auto = order_date + 5 business days at Send PO; editable here
            statusRow +
            '<h5 class="po-edit-group">Factory Notes</h5>' +
            '<textarea class="pc-input po-edit" data-f="note" rows="4" placeholder="Factory notes…">' + esc(String(o.note || '')) + '</textarea>';
        openModal('Edit — ' + esc(m.poNo), body,
            '<button class="pc-btn pc-btn--default" onclick="poCloseModal()">Cancel</button>' +
            '<button class="pc-btn pc-btn--primary" onclick="poConfirmEdit(\'' + esc(id) + '\')">Save</button>');
    }

    function confirmEdit(id) {
        var overlay = document.getElementById('po-modal');
        if (!overlay) return;
        var payload = { purchase_order_id: id, actor: 'operation-system' };
        var any = false;
        overlay.querySelectorAll('.po-edit[data-f]').forEach(function (el) {
            payload[el.getAttribute('data-f')] = el.value;
            any = true;
        });
        if (!any) { alert('Nothing to save.'); return; }
        var btn = overlay.querySelector('.pc-btn--primary'), key = id + ':edit';
        if (!_poBeginCmd(key, btn)) return;   // in-flight → suppress the duplicate write
        window.KM.DB.updatePurchaseOrderHeader(payload)
            .then(function () { _poEndCmd(key, btn); closeModal(); loadAndRender(); })
            .catch(function (e) { _poEndCmd(key, btn); alert('Save failed: ' + (e && e.message ? e.message : e)); });
    }

    // ---- shared modal (reuses .pc-modal) ----
    function openModal(title, bodyHtml, footHtml) {
        closeModal();
        var overlay = document.createElement('div');
        overlay.id = 'po-modal';
        overlay.className = 'pc-modal-overlay';
        overlay.innerHTML =
            '<div class="pc-modal">' +
                '<div class="pc-modal__head"><h3>' + title + '</h3>' +
                    '<button class="pc-modal__close" onclick="poCloseModal()">×</button></div>' +
                '<div class="pc-modal__body">' + bodyHtml + '</div>' +
                '<div class="pc-modal__foot">' + footHtml + '</div>' +
            '</div>';
        overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });
        document.body.appendChild(overlay);
    }
    function closeModal() { var m = document.getElementById('po-modal'); if (m) m.remove(); }

    // ---- draft actions (existing handlers only; never fake success) ----
    function save(id) { edit(id); }
    function update(id) { edit(id); }

    function sendPo(id, btn) {
        var card = document.getElementById('po-card-' + id);
        var status = card ? String(card.getAttribute('data-status') || '') : '';
        if (status !== 'draft') {
            alert('Send PO applies to a Draft PO. This PO is already "' + (PO_STATUS_LABEL[status] || status) + '".');
            return;
        }
        if (!confirm('Send / issue this PO to the supplier? (order_status: draft → issued)')) return;
        var key = id + ':issue';
        if (!_poBeginCmd(key, btn)) return;   // in-flight → suppress the duplicate write (status precheck reads DOM, unchanged until readback)
        window.KM.DB.updatePurchaseOrderStatus({ purchase_order_id: id, transition: 'issue', actor: 'operation-system' })
            .then(function () { _poEndCmd(key, btn); loadAndRender(); })
            .catch(function (e) { _poEndCmd(key, btn); alert('Send PO failed: ' + (e && e.message ? e.message : e)); });
    }

    function cancel(id, btn) {
        if (!confirm('Cancel this PO? It will be kept in the database.')) return;
        var key = id + ':cancel';
        if (!_poBeginCmd(key, btn)) return;   // in-flight → suppress the duplicate write
        window.KM.DB.updatePurchaseOrderStatus({ purchase_order_id: id, transition: 'cancel', actor: 'operation-system' })
            .then(function () { _poEndCmd(key, btn); loadAndRender(); })
            .catch(function (e) { _poEndCmd(key, btn); alert('Cancel failed: ' + (e && e.message ? e.message : e)); });
    }

    // ---- selectors / pagination ----
    function setFactory(k) { state.factory = k; state.page = 1; renderFromDb(); }
    function setSeries(v) { state.series = v; state.page = 1; renderFromDb(); }
    function setPo(v) { state.po = v; state.page = 1; renderFromDb(); }
    function goPage(p) { state.page = Math.max(1, p); renderFromDb(); }

    // ---- markup ensure + lifecycle ----
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

    // Expose inline handlers.
    window.poToggleCard = toggleCard;
    window.poSave = save;
    window.poSendPo = sendPo;
    window.poCancel = cancel;
    window.poUpdate = update;
    window.poReceive = receive;
    window.poConfirmReceive = confirmReceive;
    window.poConfirmEdit = confirmEdit;
    window.poCloseModal = closeModal;
    window.poSetFactory = setFactory;
    window.poSetSeries = setSeries;
    window.poSetPo = setPo;
    window.poGoPage = goPage;
    window.initPurchaseOrderOverviewPage = loadAndRender;

    if (window.KM && window.KM.lifecycle) {
        KM.lifecycle.register('purchase-order-overview-section', {
            mount: function () {
                ensureMarkup().then(function () {
                    var sec = document.getElementById('purchase-order-overview-section');
                    if (sec) sec.classList.add('active');
                    state = { factory: 'all', series: 'all', po: 'all', page: 1 };
                    loadAndRender();
                });
            },
            unmount: function () { closeModal(); }
        });
    }
})();
